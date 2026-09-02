#!/usr/bin/env node
'use strict';

// orchestrator-step-wiring M1 (Task 3) — 기존 worktree-local A1 이벤트를 git common
// dir의 공유 위치로 1회 수집한다.
//
// 왜 필요한가: DD7이 producer의 기록 위치를 옮기지만, 그 이전에 각 worktree에 쌓인
// 착수·완주·봉인 이벤트는 그대로 남는다. reader가 두 위치를 다 읽으므로 유실은
// 없지만, **A1 baseline이 위치마다 다른 상태**는 그대로다 — 이 milestone의 표제
// 성질이 성립하려면 과거 corpus도 한 곳에 모여야 한다.
//
// 파일명에 버전을 넣지 않는다(축 이름만). 번호가 한 칸 밀리면 marker 경로와
// Validation 명령이 `Cannot find module`로 죽고 idempotency 검사가 **조용히 실행되지
// 않는다** — 그것이 CLAUDE.md §3.7이 경고하는 형태다.
//
// Mirror: `migrations/v0.2.8-generic-receipt-quarantine.js` — idempotent · dry-run ·
// marker · resumable.
//
// 원본은 **지우지 않는다**. reader가 back-compat로 계속 읽으므로 삭제가 불필요하고,
// 되돌림 여지를 남긴다. `evictLRU`도 호출하지 않는다(Task 1이 그 규칙의 소유자다).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { StringDecoder } = require('string_decoder');

const mswEvents = require('../state/msw-events');

const A1_AXIS_KINDS = mswEvents.A1_AXIS_KINDS;
const SHARED_SUBPATH = mswEvents.SHARED_SUBPATH;
const LOCAL_SUBPATH = path.join('.claude', 'state', 'msw-events');
const MARKER_NAME = 'msw-events-common-dir.json';
const SCHEMA_VERSION = 1;

// S6 흡수 — 파일을 통째로 메모리에 올리지 않는다. writer는 `PER_FILE_MAX_BYTES`를
// **정보용**으로만 쓰고 초과해도 append하므로(msw-events.js), 크기 상한으로 skip하면
// 정당한 데이터를 버리게 된다. 대신 청크 스트리밍으로 **메모리를 상한**한다 —
// 데이터 손실 0, 메모리 O(chunk).
const READ_CHUNK_BYTES = 1024 * 1024;

function warn(line) {
  process.stderr.write('[mccp:msw-migrate] ' + line + '\n');
}

// `session-activity.js`의 `legacyKeyOf`와 **동형**이어야 한다. 다르면 마이그레이션이
// 접은 것과 reader가 접는 것이 어긋나 baseline에 부풀림이 봉인된다.
function legacyKeyOf(e) {
  return [e.session_id, e.kind, e.ts, e.ended_at || '', e.created_at || ''].join('\u0000');
}

function keyOf(evt) {
  if (evt && evt.event_id) return 'id\u0000' + evt.event_id;
  return 'legacy\u0000' + legacyKeyOf(evt || {});
}

// S2 흡수 — 경로 비교는 문자열 동등으로 하지 않는다.
//
// Windows NTFS는 대소문자를 구분하지 않고, junction/symlink가 텍스트상 다른 두
// 경로를 같은 대상으로 별칭한다. realpath 실패는 **fail-closed**(비동등)로 접는다.
function canonicalPath(p) {
  if (!p) return null;
  let resolved;
  try {
    resolved = path.resolve(p);
  } catch (_e) {
    return null;
  }
  let real;
  try {
    real = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
  } catch (_e) {
    return null;   // 실재하지 않거나 접근 불가 → 비교 불가 → 비동등
  }
  let out = real.replace(/[\\/]+$/, '');
  if (process.platform === 'win32') out = out.toLowerCase();
  return out;
}

// S3 흡수 — common dir을 손수 파싱하지 않고 **git 자신에게 묻는다**.
//
// hot path(`msw-events.js#commonDirOf`)는 spawn 금지 계약이 있어 직접 파싱하지만,
// 여기는 1회 실행 도구라 spawn이 허용된다. git에게 물으면 git이 자기 메타데이터를
// 스스로 검증하므로, 조작된 `.git`/`commondir`을 인가 근거로 재사용하는 순환이
// 끊긴다.
function gitCommonDirOf(dir) {
  try {
    const out = execFileSync('git', ['-C', dir, 'rev-parse', '--git-common-dir'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 10000,
    });
    const raw = String(out || '').trim();
    if (!raw) return null;
    return canonicalPath(path.resolve(dir, raw));
  } catch (_e) {
    return null;
  }
}

function listWorktrees(cwd) {
  let out;
  try {
    out = execFileSync('git', ['-C', cwd, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 20000,
    });
  } catch (err) {
    warn('git worktree list failed — nothing to collect: ' + ((err && err.message) || String(err)));
    return [];
  }
  const paths = [];
  String(out || '').split(/\r?\n/).forEach(function (line) {
    const m = /^worktree\s+(.+)$/.exec(line.trim());
    if (m) paths.push(m[1].trim());
  });
  return paths;
}

// 수집 대상 판정. 거절한 경로는 **사유와 함께** stderr에 남긴다 — 조용한 skip이
// 0/0 vacuous 통과를 만드는 것이 L2 R1 security HIGH가 지적한 형태다.
function acceptWorktree(wt, expectedCommon) {
  // S3 — symlink가 아닌 실디렉토리인지 먼저 본다.
  let st;
  try {
    st = fs.lstatSync(wt);
  } catch (_e) {
    warn('skip ' + path.basename(wt) + ': path does not exist');
    return null;
  }
  if (st.isSymbolicLink()) {
    warn('skip ' + path.basename(wt) + ': path is a symlink');
    return null;
  }
  if (!st.isDirectory()) {
    warn('skip ' + path.basename(wt) + ': path is not a directory');
    return null;
  }

  // 컨테인먼트 기준은 repo-root가 아니라 **common dir**이다 (L2 R1 security HIGH).
  //
  // 초안은 "`<repo-root>` 하위만 연다"였는데, 마이그레이션은 보통 worktree 안에서
  // 실행되고 그때 repo-root는 그 worktree 자신이다. 형제 worktree와 main repo는 그
  // 하위가 아니므로 **전부 skip되어** 수집해야 할 corpus를 정확히 거절하고,
  // dry-run 재실행 0건 검사가 0/0으로 vacuous하게 통과한다.
  const common = gitCommonDirOf(wt);
  if (!common) {
    warn('skip ' + path.basename(wt) + ': git could not resolve its common dir');
    return null;
  }
  if (common !== expectedCommon) {
    warn('skip ' + path.basename(wt) + ': belongs to a different repository');
    return null;
  }

  const eventsDir = path.join(wt, LOCAL_SUBPATH);
  try {
    if (!fs.statSync(eventsDir).isDirectory()) return null;
  } catch (_e) {
    return null;   // 이벤트 디렉토리 부재는 정상 — 조용히 넘어간다
  }
  return eventsDir;
}

// 청크 스트리밍 라인 리더 (S6). 파일 크기와 무관하게 메모리가 상한된다.
//
// 디코딩은 `StringDecoder`가 한다 (local review M2). `buf.toString('utf8', 0, n)`은
// 청크 경계에 걸친 multi-byte 시퀀스를 `�`로 **손상시킨 뒤** carry에 넘기므로,
// 이어붙이기로는 복구되지 않는다. 손상된 라인은 `JSON.parse`에 걸려 `report.invalid`로
// 조용히 빠지고, 그만큼 공유 baseline에 구멍이 남는다. `PER_FILE_MAX_BYTES`는
// 정보용이라(`msw-events.js`) 파일은 청크를 넘을 수 있고 필드값은 non-ASCII를 담을 수
// 있으므로, 지금 미발현이라는 사실은 계약이 아니다.
function forEachLine(filePath, onLine) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch (_e) {
    return false;
  }
  try {
    const buf = Buffer.alloc(READ_CHUNK_BYTES);
    const decoder = new StringDecoder('utf8');
    let carry = '';
    for (;;) {
      const n = fs.readSync(fd, buf, 0, READ_CHUNK_BYTES, null);
      if (n <= 0) break;
      const text = carry + decoder.write(buf.subarray(0, n));
      const parts = text.split(/\r?\n/);
      carry = parts.pop();
      for (const p of parts) onLine(p);
    }
    // 잘린 채 끝난 시퀀스가 있으면 여기서 나온다. 버리면 마지막 라인이 조용히 짧아진다.
    carry += decoder.end();
    if (carry) onLine(carry);
    return true;
  } catch (_e) {
    return false;
  } finally {
    try { fs.closeSync(fd); } catch (_e) { /* ignore */ }
  }
}

// PR-Codex F2 흡수 — 수집은 read-then-append 트랜잭션이므로 **직렬화해야 한다**.
//
// 락이 없으면 두 worktree가 동시에 이 마이그레이션을 돌릴 때 둘 다 같은 시점의
// `seen`을 스냅샷하고 같은 줄을 각자 append한다. `event_id`가 있는 이벤트는 reader가
// 걸러내지만, `event_id` 없는 legacy 이벤트는 `session-activity.js`가 **첫 디렉토리**
// (= 공유 위치)에서 dedupe하지 않으므로 중복이 그대로 남는다. Task 1이 공유 위치의
// `evictLRU`를 껐으므로 그 부풀림은 **영구적**이고, A1 baseline을 소급 오염시킨다.
//
// 모델은 §3.6 `quarantine.lock`과 동형이다 — body에 raw token 평문 + `0o600` +
// orphan 판정 `(PID dead) OR (mtime > lease)`. heartbeat는 append 루프가 친다.
// 락 자체가 실패하면 **획득하지 않은 것으로 접고 진행하지 않는다**(fail-closed):
// 여기서 fail-open하면 락을 도입한 이유가 사라진다.
const LOCK_NAME = 'msw-events-common-dir.lock';
const LOCK_LEASE_MS = 60000;

function readLockBody(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (_e) {
    return null;   // 판독 불가 — 아래에서 lease에만 위임한다
  }
}

// orphan이면 true. **판독 불가는 orphan이 아니다** — 방금 create된 뒤 body가
// 쓰이기 전인 좁은 창이 존재하므로, 그 경우는 lease 만료로만 회수한다.
function lockIsOrphan(lockPath) {
  let st;
  try {
    st = fs.statSync(lockPath);
  } catch (_e) {
    return true;   // 사라졌다 — 재시도해도 안전하다
  }
  if (Date.now() - st.mtimeMs > LOCK_LEASE_MS) return true;

  const body = readLockBody(lockPath);
  if (!body || body.host !== os.hostname() || !Number.isInteger(body.pid)) return false;
  try {
    process.kill(body.pid, 0);
    return false;   // 살아 있다 — lease가 남아 있는 한 회수하지 않는다
  } catch (err) {
    return !!err && err.code === 'ESRCH';
  }
}

function acquireLock(mdir) {
  const lockPath = path.join(mdir, LOCK_NAME);
  const token = crypto.randomUUID();
  const body = JSON.stringify({
    token: token,
    pid: process.pid,
    host: os.hostname(),
    at: new Date().toISOString(),
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    let fd;
    try {
      fd = fs.openSync(lockPath, 'wx', 0o600);
    } catch (err) {
      if (!err || err.code !== 'EEXIST') {
        return { ok: false, reason: 'lock-open-failed: ' + ((err && err.message) || String(err)) };
      }
      if (attempt === 0 && lockIsOrphan(lockPath)) {
        warn('reclaiming an orphaned migration lock (' + lockPath + ')');
        try { fs.unlinkSync(lockPath); } catch (_e) { /* 경쟁자가 먼저 지웠다 */ }
        continue;
      }
      const held = readLockBody(lockPath);
      return {
        ok: false,
        reason: 'another migration holds the lock'
          + (held && held.pid ? ' (pid=' + held.pid + ' host=' + held.host + ' at=' + held.at + ')' : ''),
      };
    }
    try { fs.writeSync(fd, body); } catch (_e) { /* body 부재는 lease로 회수된다 */ }
    finally { try { fs.closeSync(fd); } catch (_e) { /* ignore */ } }
    return { ok: true, path: lockPath, token: token };
  }
  return { ok: false, reason: 'lock contended after reclaim' };
}

function heartbeatLock(lock) {
  if (!lock || !lock.ok) return;
  const now = new Date();
  try { fs.utimesSync(lock.path, now, now); } catch (_e) { /* ignore */ }
}

// ownership 일치 시에만 unlink한다. 어긋나면 남의 락이므로 건드리지 않고 lease에
// 맡긴다 — §3.6의 no-token 잔여 리스크를 여기서는 애초에 만들지 않는다.
function releaseLock(lock) {
  if (!lock || !lock.ok) return;
  const body = readLockBody(lock.path);
  if (!body || body.token !== lock.token) return;
  try { fs.unlinkSync(lock.path); } catch (_e) { /* ignore */ }
}

function collect(opts) {
  const cwd = opts.cwd || process.cwd();
  const dryRun = !!opts.dryRun;

  const expectedCommon = gitCommonDirOf(cwd);
  if (!expectedCommon) {
    warn('cwd has no resolvable git common dir — nothing to do.');
    return { ok: false, state: 'skipped', reason: 'no-common-dir' };
  }
  const sharedDir = path.join(expectedCommon, SHARED_SUBPATH);

  // dry-run은 쓰지 않으므로 락을 잡지 않는다. 동시 실행 중의 dry-run 수치가 조금
  // 어긋날 수 있다는 것은 dry-run의 성격이고, 락을 요구하면 진단이 차단된다.
  if (dryRun) {
    return runCollect({ cwd: cwd, expectedCommon: expectedCommon, sharedDir: sharedDir, dryRun: true, lock: null });
  }

  const mdir = path.join(sharedDir, '.migrations');
  try {
    fs.mkdirSync(mdir, { recursive: true });
  } catch (err) {
    warn('could not create the shared directory: ' + ((err && err.message) || String(err)));
    return { ok: false, state: 'failed', reason: 'mkdir-failed' };
  }

  const lock = acquireLock(mdir);
  if (!lock.ok) {
    warn('migration lock unavailable — NOT collecting: ' + lock.reason);
    warn('  a concurrent run would append the same legacy events twice, and the reader');
    warn('  cannot de-duplicate them inside the shared directory. Retry once it finishes.');
    return { ok: false, state: 'failed', reason: 'lock-unavailable', lock_reason: lock.reason };
  }
  try {
    return runCollect({
      cwd: cwd, expectedCommon: expectedCommon, sharedDir: sharedDir, dryRun: false, lock: lock,
    });
  } finally {
    releaseLock(lock);
  }
}

function runCollect(ctx) {
  const cwd = ctx.cwd;
  const dryRun = ctx.dryRun;
  const expectedCommon = ctx.expectedCommon;
  const sharedDir = ctx.sharedDir;
  const lock = ctx.lock;

  // 1단계 — 공유 위치에 이미 있는 것을 키로 읽어들인다. 재실행이 0건이 되는 근거다.
  //
  // PR-Codex F1 흡수 — `forEachLine`의 반환값을 버리면 안 된다. 여기서의 읽기 실패는
  // 2단계와 성질이 다르다: `seen`이 불완전해지면 **이미 공유 위치에 있는 이벤트를
  // 다시 append**하게 되고, legacy 이벤트는 reader가 첫 디렉토리에서 dedupe하지
  // 않으므로 그 중복이 영구화된다. 그래서 이 단계의 실패는 partial이 아니라
  // **abort**다 — 불완전한 `seen`으로는 어떤 append도 안전하지 않다.
  const seen = new Set();
  const sharedUnreadable = [];
  let existingLines = 0;
  try {
    for (const f of fs.readdirSync(sharedDir)) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = path.join(sharedDir, f);
      try { if (fs.lstatSync(fp).isSymbolicLink()) continue; } catch (_e) { continue; }
      const read = forEachLine(fp, function (line) {
        if (!line.trim()) return;
        try {
          seen.add(keyOf(JSON.parse(line)));
          existingLines++;
        } catch (_e) { /* S8 — per-line 격리 */ }
      });
      if (!read) {
        warn('UNREADABLE shared-corpus file: ' + f + ' — dedupe keys are incomplete');
        sharedUnreadable.push(f);
      }
    }
  } catch (_e) { /* 공유 디렉토리 부재는 정상 (최초 실행) */ }

  if (sharedUnreadable.length) {
    warn('aborting: ' + sharedUnreadable.length + ' shared-corpus file(s) could not be read.');
    warn('  Appending against an incomplete dedupe key set would duplicate legacy events');
    warn('  permanently (the reader does not de-duplicate inside the shared directory).');
    return {
      ok: false,
      state: 'failed',
      reason: 'shared-corpus-unreadable',
      unreadable_shared: sharedUnreadable,
    };
  }

  // 2단계 — 각 worktree에서 A1 축 이벤트만 골라 모은다.
  const pending = new Map();   // basename -> string[]
  const report = {
    sources: [], candidates: 0, new_lines: 0, skipped_non_a1: 0, invalid: 0,
    // PR-Codex F1 — 읽지 못한 소스는 **셈에 남는다**. 이것이 비어야만 `complete`다.
    unreadable: [],
  };

  for (const wt of listWorktrees(cwd)) {
    const eventsDir = acceptWorktree(wt, expectedCommon);
    if (!eventsDir) continue;

    let files = [];
    try { files = fs.readdirSync(eventsDir); } catch (_e) { continue; }
    let fromThis = 0;
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = path.join(eventsDir, f);
      // S7 — symlink된 항목은 열지 않는다.
      try { if (fs.lstatSync(fp).isSymbolicLink()) { warn('skip symlinked file ' + f); continue; } }
      catch (_e) { continue; }

      const read = forEachLine(fp, function (line) {
        if (!line.trim()) return;
        let evt;
        try { evt = JSON.parse(line); } catch (_e) { report.invalid++; return; }   // S8
        if (!evt || !A1_AXIS_KINDS.has(evt.kind)) { report.skipped_non_a1++; return; }
        report.candidates++;
        const k = keyOf(evt);
        if (seen.has(k)) return;    // 2단 dedupe: event_id → 없으면 legacy 복합키
        seen.add(k);
        if (!pending.has(f)) pending.set(f, []);
        pending.get(f).push(JSON.stringify(evt));
        report.new_lines++;
        fromThis++;
      });
      // PR-Codex F1 — 여기서 반환값을 버리면 읽기 실패한 소스가 0건을 기여하고도
      // `complete` marker를 받는다. 그 worktree의 이벤트는 공유 집계에서 영구
      // 누락되는데 운영자는 성공으로 읽는다 — plan UI6(기록 실패를 조용히 삼키지
      // 않는다)가 금지하는 형태다. 1단계와 달리 이것은 누락이지 중복이 아니므로
      // abort가 아니라 `partial` + 재실행 대상으로 남긴다(재실행은 idempotent).
      if (!read) {
        warn('UNREADABLE source file: ' + path.basename(wt) + '/' + f);
        report.unreadable.push({ worktree: path.basename(wt), file: f });
      }
    }
    report.sources.push({ worktree: path.basename(wt), new_lines: fromThis });
  }

  if (dryRun) {
    return { ok: true, state: 'dry-run', shared_dir_exists: fs.existsSync(sharedDir), report: report };
  }

  // 3단계 — append. 원본은 그대로 두고, evict는 호출하지 않는다.
  try {
    fs.mkdirSync(sharedDir, { recursive: true });
  } catch (err) {
    warn('could not create the shared directory: ' + ((err && err.message) || String(err)));
    return { ok: false, state: 'failed', reason: 'mkdir-failed', report: report };
  }

  let written = 0;
  const failed = [];
  for (const [basename, lines] of pending) {
    if (!lines.length) continue;
    // 큰 corpus에서 append가 lease를 넘길 수 있다. sync 루프에서는 `setInterval`이
    // 발화하지 않으므로 heartbeat도 루프 안에서 친다(§3.6 quarantine과 같은 이유).
    heartbeatLock(lock);
    try {
      fs.appendFileSync(path.join(sharedDir, basename), lines.join('\n') + '\n', 'utf8');
      written += lines.length;
    } catch (err) {
      failed.push({ file: basename, reason: (err && err.message) || String(err) });
    }
  }

  // PR-Codex F1 — 읽지 못한 소스가 있으면 `complete`가 아니다. 그 파일들은 다음
  // 실행에서 다시 시도되며(idempotent), 그때까지 marker가 미완을 그대로 말한다.
  for (const u of report.unreadable) {
    failed.push({ file: u.worktree + '/' + u.file, reason: 'source unreadable' });
  }

  const state = failed.length ? 'partial' : 'complete';
  const marker = {
    schema_version: SCHEMA_VERSION,
    state: state,
    migrated_at: new Date().toISOString(),
    existing_lines_before: existingLines,
    written_lines: written,
    report: report,
    pending: failed,
  };
  try {
    const mdir = path.join(sharedDir, '.migrations');
    fs.mkdirSync(mdir, { recursive: true });
    fs.writeFileSync(path.join(mdir, MARKER_NAME), JSON.stringify(marker, null, 2) + '\n', 'utf8');
  } catch (err) {
    warn('marker write failed (the copy itself succeeded): ' + ((err && err.message) || String(err)));
  }

  return { ok: state === 'complete', state: state, written_lines: written, report: report, pending: failed };
}

function main(argv) {
  const dryRun = argv.indexOf('--dry-run') !== -1;
  const res = collect({ cwd: process.cwd(), dryRun: dryRun });
  process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  return res.ok || res.state === 'dry-run' ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { collect, keyOf, legacyKeyOf, canonicalPath, gitCommonDirOf, forEachLine };
