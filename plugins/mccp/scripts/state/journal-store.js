'use strict';

// multi-session-work-loop M5 — 저널 store (I/O) + genesis 부트스트랩.
//
// 설계: docs/multi-session-work-loop/state-truth-source-design.md
// 선례: state/msw-events.js (경로 해석 우선순위 · O_APPEND) ·
//       state/state-writer.js:512-523 (원자 tmp+rename)
//
// **`msw-events`를 재사용하지 않고 별도 파일군을 쓴다** (DD1). `msw-events`는
// 지표 sidecar이고 `evictLRU`가 global cap 초과 시 오래된 파일을 unlink한다 —
// SoT에 그 정책을 얹으면 이력이 조용히 증발하며, 그것이 PRD가 M5로 없애려는
// "되돌릴 수 없는 압축" 그 자체다. append 계약(allowlist·cap·malformed 격리·
// 경로 해석)은 그대로 모방한다.
//
// 파일 배치 (I1):
//   .claude/state/journal/records.jsonl        활성 세그먼트
//   .claude/state/journal/segments/<n>.jsonl   회전된 이력 (retention.js 소관)
//   .claude/state/journal/checkpoint.json      최신 무손실 접점 (투영 base)
//   .claude/state/journal/.degraded            sticky degraded 마커 (DD6.1)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const record = require('../lib/state-journal/record');

const JOURNAL_DIRNAME = path.join('.claude', 'state', 'journal');
const ACTIVE_SEGMENT = 'records.jsonl';
const SEGMENTS_DIRNAME = 'segments';
const CHECKPOINT_FILENAME = 'checkpoint.json';
const DEGRADED_MARKER = '.degraded';
const LEDGER_SUBDIR = path.join('.claude', 'state', 'completion-ledger');

// ledger 엔트리 필드 상한 — 신뢰 경계 밖(git-tracked, 손편집 가능)에서 오므로
// 길이를 재지 않으면 상한 없는 문자열 하나가 tombstone 맵을 부풀린다.
const DECISION_ID_MAX = 200;

function warn(message) {
  process.stderr.write('[mccp:journal-store] WARNING: ' + message + '\n');
}

// 반복 경고 억제용 (per-process). 손상(`corrupt`) 경고는 여기에 넣지 않는다 —
// 그쪽은 매번 시끄러워야 하는 무결성 신호다.
const warnedLedgerAbsent = new Set();

// msw-events.js:192-203 이식 — spawn 없이 statSync walk-up.
// `git rev-parse --show-toplevel` spawn은 append마다 ~44ms(실측)라 hot path에
// 부적합하다.
function discoverRepoRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (let i = 0; i < 40; i++) {
    try {
      if (fs.statSync(path.join(dir, '.claude')).isDirectory()) return dir;
    } catch (_e) { /* keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// 해석 우선순위: opts.dir > opts.repoRoot > walk-up > cwd 상대(레거시 fallback).
function resolveJournalDir(opts) {
  opts = opts || {};
  if (opts.dir) return opts.dir;
  if (opts.repoRoot) return path.join(opts.repoRoot, JOURNAL_DIRNAME);
  const discovered = discoverRepoRoot(opts.cwd);
  if (discovered) return path.join(discovered, JOURNAL_DIRNAME);
  return JOURNAL_DIRNAME;
}

function activePath(opts) { return path.join(resolveJournalDir(opts), ACTIVE_SEGMENT); }
function segmentsDir(opts) { return path.join(resolveJournalDir(opts), SEGMENTS_DIRNAME); }
function checkpointPath(opts) { return path.join(resolveJournalDir(opts), CHECKPOINT_FILENAME); }
function degradedMarkerPath(opts) { return path.join(resolveJournalDir(opts), DEGRADED_MARKER); }

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (_e) {
    return false;
  }
}

// 원자 write — tmp(pid+rand) → rename. state-writer.js:512-523 거울.
// tmp 이름에 pid+nonce가 없으면 동시 writer가 tmp에서 충돌한다.
function writeFileAtomic(target, contents) {
  const tmp = target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, contents, 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_e) { /* ignore */ }
    throw err;
  }
}

// ── degraded 마커 (DD6.1 책임 표: I/O 층) ────────────────────────────────────
//
// **throw하지 않는다.** `{ok:false, reason}`을 돌려주고 throw 판정은 호출자인
// `state-writer.update()`가 소유한다 — 유일 throw 지점을 한 곳에 묶어 두지 않으면
// DD6의 fail-open 원칙에 대한 예외가 넓어진다.
function writeDegradedMarker(repoRootOrOpts, extra) {
  const opts = typeof repoRootOrOpts === 'string'
    ? { repoRoot: repoRootOrOpts } : (repoRootOrOpts || {});
  const dir = resolveJournalDir(opts);
  if (!ensureDir(dir)) return { ok: false, reason: 'mkdir-failed' };
  const body = JSON.stringify({
    entered_at: new Date().toISOString(),
    pid: process.pid,
    reason: (extra && extra.reason) || 'journal append failed',
    recovery: 'node plugins/mccp/scripts/state/cli.js journal checkpoint --reseed',
  }, null, 2) + '\n';
  try {
    writeFileAtomic(path.join(dir, DEGRADED_MARKER), body);
    return { ok: true, path: path.join(dir, DEGRADED_MARKER) };
  } catch (err) {
    return { ok: false, reason: 'write-failed: ' + (err && err.message) };
  }
}

function readDegradedMarker(opts) {
  const target = degradedMarkerPath(opts);
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (_e) {
    // 마커가 읽히지 않아도 **존재 자체**가 degraded 신호다. 파싱 실패를 부재로
    // 처리하면 손상된 마커가 곧 degraded 해제가 된다.
    return { entered_at: null, reason: 'marker unparsable' };
  }
}

function isDegraded(opts) {
  return fs.existsSync(degradedMarkerPath(opts));
}

function clearDegradedMarker(opts) {
  try {
    fs.unlinkSync(degradedMarkerPath(opts));
    return { ok: true };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: true };
    return { ok: false, reason: err && err.message };
  }
}

// ── append ───────────────────────────────────────────────────────────────────
//
// O_APPEND 단일 버퍼 write. 이것이 주는 것은 **레코드 단위 원자성**(다른 writer의
// 레코드와 뒤섞이지 않음)이지 매체 무결성이 아니다 — 손상 검출은 read 측
// `content_hash`가 담당한다 (DD6.3).
function appendRecord(rec, opts) {
  opts = opts || {};
  const dir = resolveJournalDir(opts);
  if (!ensureDir(dir)) return { ok: false, reason: 'mkdir-failed' };
  const v = record.validateRecord(rec);
  if (!v.ok) return { ok: false, reason: 'invalid-record: ' + v.errors.join('; ') };
  let line;
  try {
    line = record.serialize(rec);
  } catch (err) {
    return { ok: false, reason: 'serialize-failed: ' + (err && err.message) };
  }
  try {
    fs.appendFileSync(path.join(dir, ACTIVE_SEGMENT), line, { encoding: 'utf8', flag: 'a' });
    return { ok: true, record_id: rec.record_id };
  } catch (err) {
    return { ok: false, reason: 'append-failed: ' + (err && err.message) };
  }
}

// ── read ─────────────────────────────────────────────────────────────────────
//
// malformed는 per-line skip하되 **센다**. 조용한 skip은 디스크 full로 인한
// truncation을 은폐하며(security-reviewer S7), `journal verify`가 그 카운트를
// 비영점 exit로 표면화한다.
function readSegmentFile(target, out) {
  let raw;
  try {
    raw = fs.readFileSync(target, 'utf8');
  } catch (err) {
    out.read_errors.push({ path: target, reason: err && err.message });
    return;
  }
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = record.parseLine(line);
    if (!parsed) {
      out.malformed_count++;
      if (out.malformed_samples.length < 5) {
        out.malformed_samples.push({ path: target, excerpt: line.slice(0, 80) });
      }
      continue;
    }
    out.records.push(parsed);
  }
}

function listSegments(opts) {
  const dir = segmentsDir(opts);
  if (!fs.existsSync(dir)) return [];
  let names = [];
  try {
    names = fs.readdirSync(dir).filter(function (n) { return n.endsWith('.jsonl'); });
  } catch (_e) {
    return [];
  }
  // 파일명은 zero-padded 순번이므로 사전순이 곧 시간순이다.
  return names.sort().map(function (n) { return path.join(dir, n); });
}

function readRecords(opts) {
  opts = opts || {};
  const out = { records: [], malformed_count: 0, malformed_samples: [], read_errors: [] };
  if (opts.includeSegments !== false) {
    for (const seg of listSegments(opts)) readSegmentFile(seg, out);
  }
  const active = activePath(opts);
  if (fs.existsSync(active)) readSegmentFile(active, out);
  return out;
}

// ── checkpoint ───────────────────────────────────────────────────────────────
function readCheckpoint(opts) {
  const target = checkpointPath(opts);
  if (!fs.existsSync(target)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    const clean = record.sanitizeRecord(parsed);
    if (!clean) return null;
    return clean;
  } catch (err) {
    warn('checkpoint unreadable at ' + target + ' (' + (err && err.message) + ')');
    return null;
  }
}

// checkpoint는 원자 tmp+rename으로만 착지한다 (security-reviewer S5). 세그먼트
// 회수는 **rename 성공 이후에만** 수행되며 그 순서는 retention.js가 지킨다 —
// 부분 checkpoint + 부분 삭제된 세그먼트 조합이 tail을 잃는 경로를 닫는다.
function writeCheckpoint(rec, opts) {
  const dir = resolveJournalDir(opts);
  if (!ensureDir(dir)) return { ok: false, reason: 'mkdir-failed' };
  const v = record.validateRecord(rec);
  if (!v.ok) return { ok: false, reason: 'invalid-checkpoint: ' + v.errors.join('; ') };
  try {
    writeFileAtomic(path.join(dir, CHECKPOINT_FILENAME), JSON.stringify(rec, null, 2) + '\n');
    return { ok: true, path: path.join(dir, CHECKPOINT_FILENAME) };
  } catch (err) {
    return { ok: false, reason: 'write-failed: ' + (err && err.message) };
  }
}

// ── completion-ledger tombstone seed (DD11) ──────────────────────────────────
//
// 저널은 working-tree 전용(잔여 1)이라 클론·`git clean`으로 사라진다. 그 뒤
// STATE.md만으로 genesis를 세우면 tombstone이 하나도 없는 저널이 생기고, 그
// 시점부터 크래시 세션이 되살아나 append하면 **이미 닫힌 작업 단위가 admit된다**.
// 해법은 새 durable 저장소가 아니라 **이미 git-tracked인 것을 읽는 것**이다.
//
// 손상분을 숨기지 않는다: 손상된 ledger는 tombstone을 적게 seed하므로 부활
// 방어에 구멍이 생기는데, 그 구멍이 조용하면 G2가 성립한다고 오독된다.
function seedTombstonesFromLedger(opts) {
  opts = opts || {};
  const repoRoot = opts.repoRoot || discoverRepoRoot(opts.cwd) || process.cwd();
  const dir = opts.ledgerDir || path.join(repoRoot, LEDGER_SUBDIR);
  const result = { seeded: 0, corrupt: 0, tombstones: [], available: false };

  if (!fs.existsSync(dir)) {
    // 이 경로는 **모든 update()** 가 지나므로 매번 경고하면 hook stderr가 노이즈로
    // 덮인다(§3.4 — 신호 vs 노이즈). 프로세스당 한 번만 말하되 침묵하지는 않는다.
    if (!warnedLedgerAbsent.has(dir)) {
      warnedLedgerAbsent.add(dir);
      warn('completion-ledger absent at ' + dir + ' — seeding 0 tombstones. ' +
        'G2 holds only within the journal lifetime until a ledger exists. ' +
        '(reported once per process)');
    }
    return result;
  }
  result.available = true;

  let names;
  try {
    names = fs.readdirSync(dir).filter(function (n) { return n.endsWith('.json'); });
  } catch (err) {
    warn('completion-ledger unreadable at ' + dir + ' (' + (err && err.message) +
      ') — seeding 0 tombstones.');
    return result;
  }

  const seen = new Set();
  for (const name of names) {
    let entry = null;
    try {
      entry = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch (_e) {
      result.corrupt++;
      continue;
    }
    // 오염 방어: 파싱된 객체를 병합 대상으로 쓰지 않고 필요한 스칼라만 읽는다.
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { result.corrupt++; continue; }
    // completion-ledger 파일은 `{schema_version, entry:{decision_id, …}}` 로 감싸여
    // 있다(store.js `writeEntry`). 최초 구현이 top-level `decision_id`를 읽어
    // 실측 32건이 전부 corrupt로 계상됐고, **그 카운터가 이 오류를 드러냈다** —
    // 조용히 0건을 seed했다면 G2가 성립한다고 오독됐을 자리다. 감싸이지 않은
    // 형태도 받아 두어 스키마가 평평해져도 깨지지 않게 한다.
    const holder = (entry.entry && typeof entry.entry === 'object' && !Array.isArray(entry.entry))
      ? entry.entry : entry;
    const decisionId = Object.prototype.hasOwnProperty.call(holder, 'decision_id')
      ? holder.decision_id : null;
    if (typeof decisionId !== 'string' || !decisionId ||
        decisionId.length > DECISION_ID_MAX) {
      result.corrupt++;
      continue;
    }
    if (seen.has(decisionId)) continue;
    seen.add(decisionId);
    result.seeded++;
    result.tombstones.push({ work_unit: decisionId, record_id: null, from_ledger: true });
  }

  if (result.corrupt > 0) {
    warn(result.corrupt + ' completion-ledger entr(ies) were unreadable or lacked ' +
      'decision_id — that many work units are NOT tombstoned, so replay defense has ' +
      'a hole. `journal verify` exits non-zero while this is true.');
  }
  return result;
}

// ── genesis 부트스트랩 ───────────────────────────────────────────────────────
//
// 멱등: checkpoint가 이미 있으면 no-op. `.degraded`가 있으면 **거부**한다
// (DD6.1) — 불완전하다고 이미 알려진 저널 위에서 조용히 재개하지 않는다.
// 단 이 거부는 저널 경로에만 적용되며 STATE.md 직접 경로는 계속 동작하므로
// 세션이 막히지 않는다.
function bootstrapGenesis(opts) {
  opts = opts || {};
  const dir = resolveJournalDir(opts);

  if (isDegraded(opts)) {
    return {
      ok: false,
      reason: 'degraded',
      exitCode: 75,
      message: 'journal is in degraded mode; run `journal checkpoint --reseed` first',
    };
  }

  const existing = readCheckpoint(opts);
  if (existing) return { ok: true, bootstrapped: false, checkpoint: existing };

  if (!ensureDir(dir)) return { ok: false, reason: 'mkdir-failed' };

  const seed = seedTombstonesFromLedger(opts);
  const identity = record.resolveIdentity({
    env: opts.env || process.env,
    journalTail: null,
    ledgerRead: opts.ledgerRead,
  });

  const genesis = record.makeRecord({
    session_id: identity.session_id,
    session_epoch: identity.session_epoch,
    epoch_source: identity.epoch_source,
    prev_session_id: null,     // genesis 경계는 A4 분모에서 제외된다 (DD10)
    work_unit: opts.workUnit || 'genesis',
    seq: 1,
    kind: 'genesis',
    checkpoint_of: {
      through_seq: 0,
      record_count: 0,
      ledger_seeded: seed.seeded,
      ledger_corrupt: seed.corrupt,
      state: opts.state || null,
    },
  });

  const wrote = writeCheckpoint(genesis, opts);
  if (!wrote.ok) return { ok: false, reason: wrote.reason };
  const appended = appendRecord(genesis, opts);
  if (!appended.ok) {
    // checkpoint는 착지했으므로 투영은 성립한다. append 실패는 이력 축의
    // 손실이므로 조용히 넘기지 않는다.
    warn('genesis checkpoint landed but the history append failed (' +
      appended.reason + ') — history is short by one record.');
  }
  return { ok: true, bootstrapped: true, checkpoint: genesis, ledger: seed };
}

// 투영 입력 한 벌. base(=checkpoint 상태) + 그 이후 레코드 + ledger tombstone seed.
function readProjectionInput(opts) {
  opts = opts || {};
  const checkpoint = readCheckpoint(opts);
  const read = readRecords(Object.assign({}, opts, { includeSegments: false }));
  const seed = opts.skipLedgerSeed ? { tombstones: [], seeded: 0, corrupt: 0 }
    : seedTombstonesFromLedger(opts);
  return {
    base: checkpoint && checkpoint.checkpoint_of ? checkpoint.checkpoint_of.state : null,
    checkpoint: checkpoint,
    records: read.records,
    malformed_count: read.malformed_count,
    malformed_samples: read.malformed_samples,
    read_errors: read.read_errors,
    seededTombstones: seed.tombstones,
    ledger: seed,
  };
}

module.exports = {
  JOURNAL_DIRNAME: JOURNAL_DIRNAME,
  ACTIVE_SEGMENT: ACTIVE_SEGMENT,
  SEGMENTS_DIRNAME: SEGMENTS_DIRNAME,
  CHECKPOINT_FILENAME: CHECKPOINT_FILENAME,
  DEGRADED_MARKER: DEGRADED_MARKER,
  LEDGER_SUBDIR: LEDGER_SUBDIR,
  discoverRepoRoot: discoverRepoRoot,
  resolveJournalDir: resolveJournalDir,
  activePath: activePath,
  segmentsDir: segmentsDir,
  checkpointPath: checkpointPath,
  degradedMarkerPath: degradedMarkerPath,
  listSegments: listSegments,
  writeFileAtomic: writeFileAtomic,
  writeDegradedMarker: writeDegradedMarker,
  readDegradedMarker: readDegradedMarker,
  isDegraded: isDegraded,
  clearDegradedMarker: clearDegradedMarker,
  appendRecord: appendRecord,
  readRecords: readRecords,
  readCheckpoint: readCheckpoint,
  writeCheckpoint: writeCheckpoint,
  seedTombstonesFromLedger: seedTombstonesFromLedger,
  bootstrapGenesis: bootstrapGenesis,
  readProjectionInput: readProjectionInput,
};
