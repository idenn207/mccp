'use strict';

// multi-session-work-loop M7 — append-only finding 레지스트리.
//
// 한 세션에서 제기된 finding이 세션 경계를 넘지 못하고 사라지는 통로를 닫는다.
// 게이트가 **이미 구조화된 형태로 생산하는** finding(패널 `l2.json` · Plan-Codex
// 판정 · santa 라운드)을 `.claude/state/findings/<work_unit>.jsonl`에 기록하고,
// C1(피드백 폐쇄율)의 producer가 된다.
//
// Patterns (msw-events.js 거울):
//   - bounded allowlist schema (고정 필드만 permit)
//   - per-field char cap 256 · per-line size cap 8KB
//   - malformed 격리: per-line skip
//   - O_APPEND one-buffer append
//
// msw-events와 **다른** 두 가지:
//   1. git-tracked다(DD4). worktree 정리와 함께 사라지면 "발견과 해소 사이의
//      유실이 사라진다"는 M7의 표제 결과가 그 자리에서 반증된다. 그래서
//      `evictLRU`를 채택하지 않는다 — git-tracked 파일을 evict하면 이력을
//      재작성하게 되고, 그것이 PRD가 없애려는 "되돌릴 수 없는 압축"이다.
//      per-file cap 초과는 loud warn만 한다.
//   2. batch가 1급이다(DD8). `appendFindings(workUnit, events[])`가 N줄을 한 번의
//      write로 붙이고 각 줄에 `batch_expected: N`을 싣는다. **순차 N회 append를
//      허용하는 공개 API를 두지 않는 것이 요점**이다 — 두면 호출자가 그 경로를
//      택하는 순간 "말미 k개 유실"이 되돌아온다.
//
// 유실 가시성(DD8): 1차 탐지는 마커가 아니라 **데이터 자체**다. writer가 work_unit별
// 단조 `seq`를 부여하고 reader가 수열의 구멍을 유실로 판정한다. 마커를 primary로
// 두면 "append가 실패한 디스크에 마커는 써진다"를 가정하게 되고, 그 가정이 깨지는
// 순간 가시성 기제 전체가 조용히 사라진다. `.degraded` 마커는 2차·best-effort다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FINDINGS_DIRNAME = path.join('.claude', 'state', 'findings');
const FIELD_MAX_CHARS = 256;
const MAX_LINE_BYTES = 8192;
// 초과해도 삭제하지 않는다 — loud warn 전용 임계(DD4 · M5 §6).
const PER_FILE_MAX_BYTES = 1024 * 1024;
const OUTSIDE_REPO = '<outside-repo>';
const CLAIM_NORMALIZE_MAX_CHARS = 400;

const KINDS = ['finding_opened', 'finding_adjudicated', 'finding_closed'];

// 종결 유형 5종. 앞 둘만 해소다 — 이연·강등·기각을 해소로 계상하는 것이 UI5가
// 금지하는 조작 경로이고, enum을 여기 고정해 새 유형이 조용히 해소로 편입되지
// 못하게 한다.
const CLOSURE_TYPES = ['fixed', 'invalidated', 'deferred', 'downgraded', 'rejected'];
const RESOLVING_CLOSURE_TYPES = ['fixed', 'invalidated'];

// DD7 — 판정 → 종결 매핑은 **여기 한 곳에만** 산다. 호출부에 흩어지면
// `ACCEPT_NOW`를 종결로 바꾸는 변경이 어디서든 일어날 수 있고 그때 그것을 잡는
// 단일 지점이 없다. `ACCEPT_NOW`의 값이 `null`인 것은 **종결이 없다**는 뜻이지
// **이벤트가 없다**는 뜻이 아니다(DD2) — 호출자는 `finding_adjudicated`를 남긴다.
const CLOSURE_FROM_ADJUDICATION = {
  ACCEPT_NOW: null,
  DEFER_TO_BACKLOG: 'deferred',
  REJECT_YAGNI: 'rejected',
  REJECTED_BY_DESIGN: 'invalidated',
};

// DD1 — 승격 경계는 상수다. env 토글을 만들지 않는다(UI7). CLAUDE.md §3.14가 이미
// 저장소를 운영하고 있는 규칙(CRITICAL·HIGH만 흡수)의 세션 경계 확장이다.
// §3.14는 해제 조건이 붙은 임시 규칙이므로, 그 절이 사라질 때 이 상수의 근거도
// 함께 재검토된다 — 의존 관계는 docs/multi-session-work-loop/feedback-loop-design.md.
const SEVERITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PROMOTE_MIN_SEVERITY = 'HIGH';
const PROMOTE_MAX_ITEMS = 10;

// allowlist — 이 필드들만 기록 가능. 밖의 키는 조용히 버려진다(msw-events 계약
// 상속). 새 축을 기록하려면 이 집합을 먼저 넓혀야 한다.
const ALLOWED_FIELDS = new Set([
  'kind',
  'ts',
  'finding_id',
  'work_unit',
  'gate_id',
  'perspective',
  'severity',
  'claim_digest',
  'cited_path',
  'session_id',
  'round',
  'state',
  'closure_type',
  'seq',
  'event_id',
  'batch_expected',
]);

class FindingsRegistryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FindingsRegistryError';
    this.code = code;
  }
}

// ── 경로 해석 ────────────────────────────────────────────────────────────────
//
// msw-events의 walk-up을 재사용한다 — spawn 0이고 이미 존재하는 부품이다. 새
// 해석 로직을 만들면 writer마다 답이 갈라진다(CL-5의 원인 형태 그 자체).
function discoverRepoRoot(startDir) {
  return require('./msw-events').discoverRepoRoot(startDir);
}

function resolveFindingsDir(opts) {
  opts = opts || {};
  if (opts.dir) return opts.dir;
  if (opts.repoRoot) return path.join(opts.repoRoot, FINDINGS_DIRNAME);
  const discovered = discoverRepoRoot(opts.cwd);
  if (discovered) return path.join(discovered, FINDINGS_DIRNAME);
  return FINDINGS_DIRNAME;
}

// opts에서 repo root를 되짚는다 — `cited_path` 정규화의 기준점.
function resolveRepoRoot(opts) {
  opts = opts || {};
  if (opts.repoRoot) return opts.repoRoot;
  return discoverRepoRoot(opts.cwd);
}

// ── cited_path 정규화 (DD4 — 단일 초크 포인트) ───────────────────────────────
//
// 이 레지스트리는 git-tracked 감사 corpus이므로 절대경로를 실으면 §3.12가
// `v1.22.4-cwd-rebind`로 이미 한 번 되돌린 누출(작업 트리 경로 · 구 worktree의
// 저장소명)을 그대로 재도입한다. 규약은 `receipt/write.js`의
// `normalizeReceiptCwd`와 같다 — repo 밖 경로는 절대경로가 아니라 placeholder로 접는다.
//
// **호출자가 아니라 여기서 한다.** 호출자 책임으로 두면 emit 지점 3곳 중 하나만
// 빠져도 절대경로가 새고, 그 누락을 잡을 지점이 없다.
function normalizeCitedPath(value, repoRoot) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw === '') return null;
  if (raw === OUTSIDE_REPO) return OUTSIDE_REPO;
  if (!repoRoot) {
    // 기준점이 없으면 절대경로도, **트리 밖을 가리키는 상대경로도** 실을 수 없다.
    // `..`를 통과시키면 정규화가 "단일 초크 포인트"라는 주장에 기준점 부재라는
    // 가장자리 예외가 생기고, 그 예외로 새는 값이 정확히 이 함수가 막으려는
    // 트리 밖 경로다(local review L3).
    if (path.isAbsolute(raw)) return OUTSIDE_REPO;
    const posix = raw.split(path.sep).join('/');
    if (posix === '..' || posix.startsWith('../')) return OUTSIDE_REPO;
    return posix;
  }
  const abs = path.resolve(repoRoot, raw);
  const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return OUTSIDE_REPO;
  return rel;
}

// ── finding_id ───────────────────────────────────────────────────────────────
//
// 내용 파생이다. 라운드 간 문면이 크게 바뀌면 매칭에 실패하고 그 finding은 **새
// finding으로 계상**되어 분모를 늘리고 분자는 늘리지 않는다 — 오차가 C1을 낮게
// 보는 **보수적 방향**으로만 작동한다(DD3). 이것이 이 설계를 방어 가능하게 만드는
// 유일한 성질이므로, 매칭을 관대하게 만드는 어떤 변경도 이 성질을 먼저 확인해야 한다.
function normalizeClaim(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CLAIM_NORMALIZE_MAX_CHARS);
}

function deriveFindingId(parts) {
  const p = parts || {};
  const material = [
    String(p.work_unit == null ? '' : p.work_unit),
    String(p.gate_id == null ? '' : p.gate_id),
    String(p.perspective == null ? '' : p.perspective),
    String(p.severity == null ? '' : p.severity).toUpperCase(),
    normalizeClaim(p.claim),
  ].join('\0');
  return crypto.createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 16);
}

function claimDigestOf(claim) {
  return crypto.createHash('sha256')
    .update(normalizeClaim(claim), 'utf8').digest('hex').slice(0, 16);
}

// finding 본문에서 리뷰어가 **주장한** 경로를 하나 집어낸다. 검증이 아니다 —
// 환각이거나 무관한 경로일 수 있고, 그 사실이 DD9의 세 제약과 승격 sanitize의
// 전제다. 여기 두는 이유는 emit 지점 3곳이 각자 다른 추출을 쓰면 2차 매칭 키가
// 지점마다 갈리기 때문이다.
//
// 첫 매치만 취한다. 여러 경로가 언급된 finding에서 "어느 것이 진짜인가"를 고르는
// 규칙은 존재하지 않으므로, 고르는 척하는 대신 결정적으로 첫 번째를 쓴다.
const CITED_PATH_RE =
  /\b((?:[\w.@-]+\/)+[\w.@-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|yml|yaml|sh|ps1|css|html))\b/;

function extractCitedPath(text) {
  const m = CITED_PATH_RE.exec(String(text == null ? '' : text));
  return m ? m[1] : null;
}

// ── 직렬화 ───────────────────────────────────────────────────────────────────
//
// number/boolean은 타입을 보존한다 — 문자열 강제는 `round: 0`을 truthy로 만든다
// (msw-events의 같은 규칙).
function sanitizeField(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  let str = String(value);
  if (str.length > FIELD_MAX_CHARS) {
    str = str.slice(0, FIELD_MAX_CHARS - 4) + '_...';
  }
  return str.replace(/[\n\r\t]/g, ' ');
}

function eventToJsonLine(event) {
  const filtered = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in event) filtered[key] = sanitizeField(event[key]);
  }
  let line = JSON.stringify(filtered) + '\n';
  if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) {
    // **실제로 줄인다.** msw-events의 같은 분기는 `truncated: true` 키를 *추가*만 해
    // 줄을 오히려 키우는데(승계한 결함 — local review L1), 그러면 상한이 상한이 아니다.
    // 필드당 256자 × allowlist 크기라 실질 도달 불가한 분기이지만, 도달했을 때
    // 무엇을 보장하는지가 계약이므로 가장 긴 문자열 필드부터 잘라 상한 아래로 내린다.
    const shrunk = Object.assign({}, filtered, { truncated: true });
    for (let guard = 0; guard < ALLOWED_FIELDS.size + 1; guard++) {
      line = JSON.stringify(shrunk) + '\n';
      if (Buffer.byteLength(line, 'utf8') <= MAX_LINE_BYTES) break;
      let longest = null;
      for (const k of Object.keys(shrunk)) {
        if (typeof shrunk[k] !== 'string' || shrunk[k].length <= 8) continue;
        if (longest === null || shrunk[k].length > shrunk[longest].length) longest = k;
      }
      if (longest === null) break;   // 더 줄일 문자열이 없다 — 있는 그대로 낸다
      shrunk[longest] = shrunk[longest].slice(0, Math.max(8, shrunk[longest].length >> 1));
    }
  }
  return line;
}

function shardPath(dir, workUnit) {
  return path.join(dir, String(workUnit) + '.jsonl');
}

function markerPath(dir, workUnit) {
  return path.join(dir, String(workUnit) + '.degraded');
}

// ── 2차 진단 마커 (best-effort) ──────────────────────────────────────────────
//
// `seq` 축이 유실을 잡으므로 이것이 없어도 탐지는 성립한다. 실패 사유(errno·경로)를
// 담아 진단을 돕는 것이 역할이다.
function writeDegradedMarker(dir, workUnit, detail) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const body = {
      at: new Date().toISOString(),
      work_unit: String(workUnit),
      reason: (detail && detail.reason) || 'unknown',
      errno: (detail && detail.errno) || null,
      path: (detail && detail.path) || null,
      pid: process.pid,
    };
    fs.appendFileSync(markerPath(dir, workUnit), JSON.stringify(body) + '\n', 'utf8');
    return true;
  } catch (_e) {
    return false;
  }
}

function readDegradedMarker(dir, workUnit) {
  try {
    const raw = fs.readFileSync(markerPath(dir, workUnit), 'utf8');
    const parsed = [];
    for (const l of raw.split(/\r?\n/)) {
      if (!l.trim()) continue;
      try { parsed.push(JSON.parse(l)); } catch (_e) { /* per-line 격리 */ }
    }
    return parsed.length ? parsed : null;
  } catch (_e) {
    return null;
  }
}

// ── raw 라인 읽기 ────────────────────────────────────────────────────────────
function readRawShard(dir, workUnit) {
  const file = shardPath(dir, workUnit);
  const out = { path: file, exists: false, events: [], malformed: 0, lines: 0 };
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (_e) {
    return out;
  }
  out.exists = true;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.lines += 1;
    try {
      const o = JSON.parse(line);
      if (o && typeof o === 'object' && KINDS.indexOf(o.kind) !== -1) out.events.push(o);
      else out.malformed += 1;
    } catch (_e) {
      out.malformed += 1;   // 잘린 말미 줄이 여기로 격리된다
    }
  }
  return out;
}

function currentMaxSeq(dir, workUnit) {
  const raw = readRawShard(dir, workUnit);
  let max = 0;
  for (const e of raw.events) {
    if (Number.isInteger(e.seq) && e.seq > max) max = e.seq;
  }
  return max;
}

// 이 프로세스가 마지막으로 **할당한** seq. 디스크 max 와 별개로 두는 것이
// DD8 1차 탐지의 성립 조건이다 — 디스크에서만 다음 번호를 뽑으면 실패한 append 가
// 아무 흔적도 남기지 않고(다음 write 가 같은 번호를 재사용한다) `seq` 축이
// 영원히 아무것도 탐지하지 못한다. 할당은 write **시도 전에** 전진하므로,
// 실패한 batch 의 번호가 소진되고 그 다음 성공한 write 가 구멍을 드러낸다.
//
// **경계를 정직히 적는다.** 이 고수위는 프로세스 지역이므로 같은 프로세스의
// 후속 write 에 대해서만 성립한다. 프로세스가 실패 직후 종료하고 *다른* 프로세스가
// 이어 쓰면 그 쪽은 디스크 max 에서 다시 시작하므로 구멍이 생기지 않는다 — 그것이
// DD8 이 인정한 미탐지 꼬리이고, 그 구간을 덮는 것은 `.degraded` 마커(2차)와
// Task 7 의 런타임 falsifier(부풀리는 방향의 독립 관측)다.
const SEQ_HIGH_WATER = new Map();

function allocateSeqBase(dir, workUnit, n) {
  const key = path.resolve(dir) + ' ' + String(workUnit);
  const base = Math.max(currentMaxSeq(dir, workUnit), SEQ_HIGH_WATER.get(key) || 0);
  SEQ_HIGH_WATER.set(key, base + n);
  return base;
}

// ── writer (batch 1급) ───────────────────────────────────────────────────────
//
// **`seq` 생성에 락을 걸지 않는 것은 의도다.** writer는 `O_APPEND` 단일 write에만
// 의존하고 파일 끝에서 `seq`를 계산하므로, 두 프로세스가 같은 work_unit을 동시에
// 잡으면 같은 번호를 낼 수 있다 — M3 claim TTL이 통상 경로를 막지만 보장은 아니다.
// 락 대신 **탐지**를 택한 이유는 evidence write lock(§3.6)이 fail-closed라 계측이
// 게이트를 막게 되고, 그것이 DD8이 지키려는 성질을 정면으로 깨기 때문이다.
//
// fail-open: 어떤 실패도 throw하지 않고 `{ok:false, reason}`을 돌려준다. 호출자
// exit code는 바뀌지 않는다.
function appendFindings(workUnit, events, opts) {
  opts = opts || {};
  if (!workUnit || typeof workUnit !== 'string') {
    return { ok: false, reason: 'invalid_work_unit', written: 0 };
  }
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) return { ok: true, written: 0, seq_start: null, seq_end: null };

  const dir = resolveFindingsDir(opts);
  const repoRoot = resolveRepoRoot(opts);

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    writeDegradedMarker(dir, workUnit, { reason: 'mkdir-failed', errno: err && err.code, path: dir });
    return { ok: false, reason: 'mkdir-failed: ' + (err && err.message), written: 0 };
  }

  const n = list.length;

  // **입력 검증이 seq 할당보다 먼저다**(local review H4). 뒤에 두면 호출자 쪽 버그
  // (오타 kind)가 n개 번호를 소진한 뒤 아무것도 쓰지 않아, 디스크 write 실패와
  // **구분되지 않는 구멍**을 남긴다. 레지스트리는 evict도 재작성도 하지 않는
  // git-tracked corpus(DD4)이므로 그 구멍은 되돌릴 수 없고, 그 work_unit은
  // `--acceptance`의 non-degraded 축을 영구히 통과하지 못한다. `seq` 축이 뜻하는
  // 것은 "이벤트가 유실됐다"이지 "호출자가 잘못된 값을 넘겼다"가 아니므로, 후자는
  // 번호를 쓰기 전에 거절한다.
  for (let i = 0; i < n; i++) {
    const kind = (list[i] || {}).kind;
    if (KINDS.indexOf(kind) === -1) {
      return { ok: false, reason: 'invalid_kind: ' + String(kind), written: 0 };
    }
  }

  // write 시도 **전에** 할당한다 — 실패해도 번호는 소진되고 그것이 구멍이 된다.
  const base = allocateSeqBase(dir, workUnit, n);
  const nowIso = new Date().toISOString();

  let buffer = '';
  for (let i = 0; i < n; i++) {
    const src = list[i] || {};
    const event = Object.assign({}, src, {
      work_unit: workUnit,
      ts: src.ts || nowIso,
      // cited_path 정규화의 단일 초크 포인트 — 호출자는 있는 그대로 넘긴다.
      cited_path: normalizeCitedPath(src.cited_path, repoRoot),
      seq: base + i + 1,
      batch_expected: n,
      event_id: src.event_id || crypto.randomUUID(),
    });
    if (!event.finding_id) {
      event.finding_id = deriveFindingId({
        work_unit: workUnit,
        gate_id: src.gate_id,
        perspective: src.perspective,
        severity: src.severity,
        claim: src.claim,
      });
    }
    buffer += eventToJsonLine(event);
  }

  const file = shardPath(dir, workUnit);
  try {
    const stat = fs.existsSync(file) ? fs.statSync(file) : null;
    if (stat && stat.size >= PER_FILE_MAX_BYTES) {
      // git-tracked이므로 evict하지 않는다 — 이력 재작성이 곧 PRD가 없애려는
      // "되돌릴 수 없는 압축"이다. 소리 내어 알리고 계속 append한다.
      process.stderr.write('[mccp:findings-registry] WARNING: shard ' + workUnit +
        ' exceeds ' + PER_FILE_MAX_BYTES + ' bytes (' + stat.size + ') — NOT evicting ' +
        '(git-tracked audit corpus); continuing to append\n');
    }
  } catch (_e) { /* stat 실패는 정보성 */ }

  try {
    // 한 번의 write. 부분 착지는 마지막 줄이 잘려 malformed로 격리되므로 reader가
    // 본다 — "말미 k개만 사라지는" 상태가 애초에 만들어지지 않는다.
    fs.appendFileSync(file, buffer, { encoding: 'utf8', flag: 'a' });
  } catch (err) {
    writeDegradedMarker(dir, workUnit, {
      reason: 'append-failed', errno: err && err.code, path: file,
    });
    process.stderr.write('[mccp:findings-registry] WARNING: append failed for ' + workUnit +
      ' (' + (err && err.message) + ') — ' + n + ' event(s) lost; seq gap will surface this\n');
    return { ok: false, reason: 'append-failed: ' + (err && err.message), written: 0 };
  }

  return { ok: true, written: n, seq_start: base + 1, seq_end: base + n, path: file };
}

// ── seq 무결성 (DD8 1차 탐지) ────────────────────────────────────────────────
//
// 두 축이다: (1) 정렬 후 구멍·동값 인접, (2) `max(seq)`와 고유 `seq` 개수의
// 불일치 — 후자가 있어야 "6이 유실되고 5가 중복돼 구멍이 안 보이는" 상태가 잡힌다.
//
// **중복이 계상을 바꾸지는 않는다.** `seq`는 유실 탐지 전용 축이고 계상 키는
// `finding_id`다. 탐지 축이 계상 축을 건드리면 유실 신호가 조용히 데이터를 바꾸게
// 되고, 그것은 관측이 아니라 개입이다.
function auditSeq(events) {
  const seqs = events
    .map(function (e) { return e.seq; })
    .filter(function (s) { return Number.isInteger(s) && s > 0; })
    .sort(function (a, b) { return a - b; });

  const gaps = [];
  const duplicates = [];
  const unique = new Set(seqs);
  for (let i = 1; i < seqs.length; i++) {
    if (seqs[i] === seqs[i - 1] && duplicates.indexOf(seqs[i]) === -1) duplicates.push(seqs[i]);
  }
  const max = seqs.length ? seqs[seqs.length - 1] : 0;
  for (let s = 1; s <= max; s++) {
    if (!unique.has(s)) gaps.push(s);
  }
  return {
    gaps: gaps,
    duplicates: duplicates,
    max: max,
    unique_count: unique.size,
    // 산술 불일치 — 구멍이 중복에 가려진 경우를 잡는 독립 축.
    count_mismatch: max !== unique.size,
  };
}

// batch 착지 검사 — `batch_expected`가 선언한 N줄이 실제로 있는지.
// 배치는 연속 `seq` 구간을 차지하고 모든 줄이 같은 N을 실으므로, 정렬된 줄을
// greedy로 걸어 재구성한다(별도 batch id 필드를 만들지 않는 이유는 allowlist를
// 넓히지 않고도 판정이 성립하기 때문이다).
function auditBatches(events) {
  const sorted = events
    .filter(function (e) { return Number.isInteger(e.seq); })
    .slice()
    .sort(function (a, b) { return a.seq - b.seq; });

  const shortfalls = [];
  let i = 0;
  while (i < sorted.length) {
    const head = sorted[i];
    const expected = Number.isInteger(head.batch_expected) && head.batch_expected > 0
      ? head.batch_expected : 1;
    let found = 1;
    while (found < expected
      && i + found < sorted.length
      && sorted[i + found].batch_expected === expected
      && sorted[i + found].seq === head.seq + found) {
      found += 1;
    }
    if (found < expected) {
      shortfalls.push({ seq_start: head.seq, expected: expected, found: found });
    }
    i += found;
  }
  return shortfalls;
}

// ── reader ───────────────────────────────────────────────────────────────────
//
// `finding_id`로 dedupe하고 종결은 last-write-wins로 접는다.
function foldEvents(events) {
  const byId = new Map();
  const ordered = events
    .slice()
    .sort(function (a, b) {
      const sa = Number.isInteger(a.seq) ? a.seq : 0;
      const sb = Number.isInteger(b.seq) ? b.seq : 0;
      return sa - sb;
    });

  for (const e of ordered) {
    const id = e.finding_id;
    if (!id) continue;
    let rec = byId.get(id);
    if (!rec) {
      rec = {
        finding_id: id,
        work_unit: e.work_unit || null,
        gate_id: e.gate_id || null,
        perspective: e.perspective || null,
        severity: e.severity || null,
        claim_digest: e.claim_digest || null,
        cited_path: e.cited_path || null,
        round: Number.isInteger(e.round) ? e.round : null,
        opened_at: null,
        closed_at: null,
        state: 'open',
        closure_type: null,
        closure_type_valid: true,
      };
      byId.set(id, rec);
    }
    if (e.kind === 'finding_opened') {
      if (rec.opened_at === null) rec.opened_at = e.ts || null;
      if (!rec.severity && e.severity) rec.severity = e.severity;
      if (!rec.cited_path && e.cited_path) rec.cited_path = e.cited_path;
      if (!rec.perspective && e.perspective) rec.perspective = e.perspective;
      if (!rec.gate_id && e.gate_id) rec.gate_id = e.gate_id;
      if (!rec.claim_digest && e.claim_digest) rec.claim_digest = e.claim_digest;
    } else if (e.kind === 'finding_adjudicated') {
      // 열린 채 남는다 — 수용 의사는 해소가 아니다(DD2).
      rec.state = e.state || 'accepted';
    } else if (e.kind === 'finding_closed') {
      rec.state = 'closed';
      rec.closure_type = e.closure_type || null;
      rec.closure_type_valid = CLOSURE_TYPES.indexOf(rec.closure_type) !== -1;
      rec.closed_at = e.ts || null;
    }
  }
  return Array.from(byId.values());
}

function countFindings(findings) {
  const counts = {
    total: findings.length,
    resolved: 0,
    open: 0,
    fixed: 0,
    invalidated: 0,
    deferred: 0,
    downgraded: 0,
    rejected: 0,
    closed_untyped: 0,
    closed_unknown_type: 0,
  };
  for (const f of findings) {
    if (f.state !== 'closed') { counts.open += 1; continue; }
    if (!f.closure_type) { counts.closed_untyped += 1; continue; }
    if (CLOSURE_TYPES.indexOf(f.closure_type) === -1) { counts.closed_unknown_type += 1; continue; }
    counts[f.closure_type] += 1;
    if (RESOLVING_CLOSURE_TYPES.indexOf(f.closure_type) !== -1) counts.resolved += 1;
  }
  return counts;
}

function readShard(workUnit, opts) {
  const dir = resolveFindingsDir(opts);
  const raw = readRawShard(dir, workUnit);
  const seqAudit = auditSeq(raw.events);
  const batchShortfalls = auditBatches(raw.events);
  const marker = readDegradedMarker(dir, workUnit);
  const findings = foldEvents(raw.events);

  const reasons = [];
  if (seqAudit.gaps.length) reasons.push('seq gap(s): ' + seqAudit.gaps.slice(0, 8).join(','));
  if (seqAudit.duplicates.length) {
    reasons.push('duplicate seq: ' + seqAudit.duplicates.slice(0, 8).join(','));
  }
  if (seqAudit.count_mismatch) {
    reasons.push('seq count mismatch (max=' + seqAudit.max + ' unique=' + seqAudit.unique_count + ')');
  }
  if (batchShortfalls.length) reasons.push(batchShortfalls.length + ' batch shortfall(s)');
  if (raw.malformed) reasons.push(raw.malformed + ' malformed line(s)');
  if (marker) reasons.push(marker.length + ' degraded marker entries');

  return {
    ok: true,
    work_unit: String(workUnit),
    path: raw.path,
    exists: raw.exists,
    events: raw.events,
    findings: findings,
    counts: countFindings(findings),
    malformed: raw.malformed,
    seq: seqAudit,
    batch_shortfalls: batchShortfalls,
    marker: marker,
    degraded: reasons.length > 0,
    degraded_reasons: reasons,
  };
}

function listWorkUnits(opts) {
  const dir = resolveFindingsDir(opts);
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_e) { return []; }
  return entries
    .filter(function (f) { return f.endsWith('.jsonl'); })
    .map(function (f) { return f.slice(0, -'.jsonl'.length); })
    .sort();
}

// **전 샤드 스캔이 명시 계약이다**(DD4). "현재 slug만 읽기"로 좁혀지면 그 순간
// 분모가 조용히 줄어 C1을 부풀리는 방향이 열린다.
function readAll(opts) {
  const units = listWorkUnits(opts);
  const shards = units.map(function (u) { return readShard(u, opts); });
  const findings = [];
  shards.forEach(function (s) { findings.push.apply(findings, s.findings); });
  return {
    ok: true,
    work_units: units,
    shards: shards,
    findings: findings,
    counts: countFindings(findings),
    malformed: shards.reduce(function (a, s) { return a + s.malformed; }, 0),
    degraded: shards.some(function (s) { return s.degraded; }),
    degraded_reasons: shards.reduce(function (a, s) {
      return a.concat(s.degraded_reasons.map(function (r) { return s.work_unit + ': ' + r; }));
    }, []),
  };
}

// ── 2차 매칭 키 (DD9) ────────────────────────────────────────────────────────
//
// `matchKey` 매칭은 **더 많은 재발을 인식**하므로 분모를 줄이는 방향(= C1을 높이는
// 방향)으로 작동한다. 그래서 세 제약을 건다: `cited_path` 부재면 미적용 · 같은 키에
// 후보가 둘 이상이면 미적용 · `<outside-repo>` placeholder는 제외(서로 다른 여러
// 경로가 접힌 결과라 무관한 finding들을 인위적으로 한 키에 합류시킨다).
//
// `cited_path`는 리뷰어가 주장한 값이지 검증된 사실이 아니다. 레지스트리는 그것을
// **기록만 하고 열지도 실행하지도 해석하지도 않는다** — 기계적 소비처는 이 2차 키
// 하나뿐이다.
function matchKeyOf(finding) {
  if (!finding) return null;
  const p = finding.cited_path;
  if (!p || p === OUTSIDE_REPO) return null;
  if (!finding.perspective) return null;
  return String(finding.perspective) + '\0' + String(p);
}

function findByMatchKey(candidates, key) {
  if (!key) return null;
  const hits = (candidates || []).filter(function (c) { return matchKeyOf(c) === key; });
  return hits.length === 1 ? hits[0] : null;   // 다중 후보는 미적용
}

// ── DD3 — 라운드 간 비재발 종결 ──────────────────────────────────────────────
//
// `ACCEPT_NOW`된 finding이 실제로 고쳐졌는지를 LLM에게 묻는 것은 UI3 위반이다.
// 대신 이미 구조화되어 있는 라운드 이력을 쓴다: 라운드 N에 열린 finding이 라운드
// N+1에서 pass 판정과 함께 재발하지 않으면 `closed{type:'fixed'}`로 기록한다.
// 새 호출이 없다.
//
// **오차 방향을 정정한다 (local review H2).** 이전 구현은 매칭 실패를 곧바로
// 종결로 삼았다. 그런데 매칭 실패는 분모만 늘리는 것이 아니라 prior 를 `fixed` 로
// **닫는다**(분자 +1) — 즉 2차 키를 *끄는* 제약들이 C1 을 **높이는** 방향으로
// 작동했고, 그것은 설계 §2/UI5 가 조작 경로로 지목한 바로 그 방향이다. 실측:
// 고쳐지지 않은 결함 1건이 문면만 바뀐 채 수렴하면 참값 `0/1` 이 `1/2` 로 보고됐다.
//
// 정정의 원리는 **"모르겠다가 분자를 사지 못하게 한다"** 이다. 비재발을 주장하려면
// 같은 리뷰어 축(perspective)의 현재 finding 들과 실제로 대조가 성립해야 한다.
//   - 그 축의 현재 finding 이 하나도 없다  → 명백한 소멸이므로 종결한다
//     (수렴 라운드가 비어 있는 통상 경로가 여기다 — 지표가 죽지 않는다)
//   - 같은 `matchKey` 후보가 하나라도 있다 → 재발로 본다(단일·다중 무관.
//     다중 후보에서 "어느 것인지 모른다"는 종결 근거가 아니다)
//   - prior 나 동축 현재 finding 중 하나라도 `matchKey` 가 없다 → **대조 불가**이므로
//     종결을 보류한다. 기록은 그대로 남고 다음 라운드가 다시 판정한다.
function comparableCandidates(current, finding) {
  const p = finding && finding.perspective;
  if (!p) return [];
  return current.filter(function (c) {
    return c && c.perspective && String(c.perspective) === String(p);
  });
}

function deriveNonRecurrenceClosures(opts) {
  const o = opts || {};
  const prior = Array.isArray(o.priorFindings) ? o.priorFindings : [];
  const current = Array.isArray(o.currentFindings) ? o.currentFindings : [];
  if (!o.roundPassed) return [];

  const currentIds = new Set(current.map(function (f) { return f.finding_id; }));
  const closures = [];
  for (const f of prior) {
    if (f.state === 'closed') continue;
    if (currentIds.has(f.finding_id)) continue;            // 1차: finding_id

    const peers = comparableCandidates(current, f);
    if (peers.length === 0) { closures.push(f); continue; }   // 축이 통째로 비었다 — 명백

    const key = matchKeyOf(f);
    // 2차: 같은 키 후보가 하나라도 있으면 재발이다(다중 후보도 재발 증거다).
    if (key && peers.some(function (c) { return matchKeyOf(c) === key; })) continue;

    // 전원이 비교 가능했고 아무도 맞지 않았을 때만 소멸로 판정한다.
    const comparable = !!key && peers.every(function (c) { return matchKeyOf(c) !== null; });
    if (comparable) { closures.push(f); continue; }
    // 그 외 — 대조 불가. 종결하지 않는다(분자를 사지 않는다).
  }
  return closures;
}

// ── 승격 (DD1) ───────────────────────────────────────────────────────────────
function severityRank(s) {
  return SEVERITY_ORDER.indexOf(String(s == null ? '' : s).toUpperCase());
}

function isPromotable(finding) {
  if (!finding || finding.state === 'closed') return false;
  const rank = severityRank(finding.severity);
  // 판독 불가 severity는 승격하지 않는다 — 상한이 있는 표면에서 모르는 값이 자리를
  // 차지하면 아는 CRITICAL이 밀린다. 레지스트리 기록에는 그대로 남는다.
  if (rank === -1) return false;
  return rank >= severityRank(PROMOTE_MIN_SEVERITY);
}

module.exports = {
  FINDINGS_DIRNAME: FINDINGS_DIRNAME,
  FIELD_MAX_CHARS: FIELD_MAX_CHARS,
  MAX_LINE_BYTES: MAX_LINE_BYTES,
  PER_FILE_MAX_BYTES: PER_FILE_MAX_BYTES,
  OUTSIDE_REPO: OUTSIDE_REPO,
  KINDS: KINDS,
  CLOSURE_TYPES: CLOSURE_TYPES,
  RESOLVING_CLOSURE_TYPES: RESOLVING_CLOSURE_TYPES,
  CLOSURE_FROM_ADJUDICATION: CLOSURE_FROM_ADJUDICATION,
  ALLOWED_FIELDS: ALLOWED_FIELDS,
  SEVERITY_ORDER: SEVERITY_ORDER,
  PROMOTE_MIN_SEVERITY: PROMOTE_MIN_SEVERITY,
  PROMOTE_MAX_ITEMS: PROMOTE_MAX_ITEMS,
  FindingsRegistryError: FindingsRegistryError,
  discoverRepoRoot: discoverRepoRoot,
  resolveFindingsDir: resolveFindingsDir,
  normalizeCitedPath: normalizeCitedPath,
  normalizeClaim: normalizeClaim,
  deriveFindingId: deriveFindingId,
  claimDigestOf: claimDigestOf,
  extractCitedPath: extractCitedPath,
  sanitizeField: sanitizeField,
  eventToJsonLine: eventToJsonLine,
  appendFindings: appendFindings,
  writeDegradedMarker: writeDegradedMarker,
  readDegradedMarker: readDegradedMarker,
  auditSeq: auditSeq,
  auditBatches: auditBatches,
  foldEvents: foldEvents,
  countFindings: countFindings,
  readShard: readShard,
  readAll: readAll,
  listWorkUnits: listWorkUnits,
  matchKeyOf: matchKeyOf,
  findByMatchKey: findByMatchKey,
  deriveNonRecurrenceClosures: deriveNonRecurrenceClosures,
  severityRank: severityRank,
  isPromotable: isPromotable,
};
