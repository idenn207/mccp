'use strict';

// multi-session-work-loop M3 — 증거 write의 짧은 임계구역 + 원자 write.
//
// 설계 근거: docs/multi-session-work-loop/evidence-conflict-design.md
// 보증 표(G1~G3): .claude/plans/multi-session-work-loop-m3.plan.md
//
// 메커니즘은 `state/session-ledger.js#withLedgerLock`(O_EXCL + bounded retry +
// stale reclaim)을 미러하되 **실패 정책을 반전**한다 — 그쪽은 lock 미획득 시
// 경고만 남기고 lock 없이 진행하는데(last-writer-wins), 그 동작이 PRD가 구조적
// 취약으로 지목한 결함 자체다. 여기서는 throw한다.
//
// 공개 API는 **전 구간을 소유하는 두 함수뿐**이다(Implement-Codex R1 F3):
//   guardedWrite(target, buildContent, opts)
//   guardedReadModifyWrite(target, mutate, opts)
// lock 획득 · base-hash 캡처 · claim fence · 소유 재확인 · 원자 rename ·
// post-rename 검증 · guard 이벤트 emit이 전부 이 안에 있다. raw lock context를
// 노출해 caller가 `assertOwned`나 base-hash 선조건을 "기억해서" 호출하게 두면,
// 승인 helper를 쓰면서 검증만 빠뜨린 caller가 정적 커버리지를 통과하는데
// lost-update 창은 재개방된다. 그 형태를 API 차원에서 불가능하게 만든다.
//
// claim fence의 적용 여부는 **경로에서 파생**한다(caller 인자가 아니다). receipt
// 경로면 항상 fence가 걸리고, 그 외 경로(claim 레코드 자체 등)는 안 걸린다.
// caller가 끌 수 있는 스위치를 두지 않는 것이 요점이다.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// 임계구역은 파일 IO ms 단위다. LLM 호출은 절대 들어오지 않는다.
const LEASE_MS = 5000;
const ACQUIRE_RETRY_MS = 20;
const ACQUIRE_MAX_RETRIES = 50;          // 1s 획득 예산
// Windows rename retry 예산은 lease보다 **마진을 두고 하한**이어야 한다
// (Implement-Codex R1 F5) — 그러지 않으면 retry 루프에서 lease를 넘겨 다른
// 프로세스가 reclaim하고, 뒤늦게 성공한 rename이 승계자를 덮는다.
const RENAME_RETRY_MS = 25;
const RENAME_MAX_RETRIES = 20;           // 500ms ≪ 5000ms lease
const RENAME_RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY']);

const SLEEP_BUF = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(ms) {
  Atomics.wait(SLEEP_BUF, 0, 0, ms);
}

// 프로세스-로컬 재진입 가드. 같은 target에 대한 중첩 획득은 즉시 throw한다
// (store → briefing → completion-ledger는 순차 호출이며 각각 독립 acquire/release).
const HELD = new Set();

class EvidenceLockError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'EvidenceLockError';
  }
}

function sha256(str) {
  return 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// ── 정체 ─────────────────────────────────────────────────────────────────────
// `process.pid`는 정체에 쓰지 않는다 — receipt/cli.js는 write마다 새 node
// 프로세스라 매번 달라지고, 그러면 같은 세션의 두 번째 write가 "다른 holder"로
// 거부된다(정상 경로가 깨진다). `CLAUDE_PID`는 Claude **세션** 프로세스의 pid라
// 재실행 사이에 안정하다.
function resolveSessionId(env) {
  env = env || process.env;
  const v = env.MCCP_SESSION_ID || env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID || '';
  const s = String(v).trim();
  return s && s !== 'unknown' ? s : null;
}

function resolveSessionPid(env) {
  env = env || process.env;
  const n = parseInt(env.CLAUDE_PID, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isPidAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'EPERM') return true;   // 존재하지만 권한 없음 = alive
    return false;
  }
}

// ── 토글 ─────────────────────────────────────────────────────────────────────
// enforce(default) = fail-closed lock + fence
// warn             = 관측·이벤트는 유지하되 차단하지 않음 (복구용 kill switch)
// off              = guard 전체 비활성 (loud warn)
function parseGuardMode(env) {
  env = env || process.env;
  const raw = String(env.MCCP_EVIDENCE_CONFLICT_GUARD || '').trim().toLowerCase();
  if (raw === '') return 'enforce';
  if (raw === 'enforce' || raw === 'warn' || raw === 'off') return raw;
  process.stderr.write('[mccp:evidence-lock] WARNING: unknown MCCP_EVIDENCE_CONFLICT_GUARD='
    + raw + ' — falling back to enforce (fail-closed)\n');
  return 'enforce';
}

// ── lock primitive ───────────────────────────────────────────────────────────
// lock 파일명은 반드시 `.lock`으로 끝나야 한다 — .gitignore가
// `.claude/receipts/mccp-pr-codex/*.lock`만 재무시하므로, 다른 이름이면
// git-tracked ship receipt 디렉토리를 오염시킨다.
function lockPathFor(target) {
  return target + '.lock';
}

function readLockBody(lockPath) {
  let raw;
  try { raw = fs.readFileSync(lockPath, 'utf8'); } catch (_e) { return null; }
  if (raw.length === 0) return { _zero_byte: true };
  try { return JSON.parse(raw); } catch (_e) { return { _parse_error: true }; }
}

// lease 정책은 `pr-phase-lock.js`의 tri-state("same-host + pid alive → 절대
// reclaim 안 함")를 **의도적으로 차용하지 않는다**. 그 tri-state는 Codex review
// 전체(분 단위)를 감싸는 lock에서만 정당하다. 여기 임계구역은 파일 IO ms
// 단위이므로 live holder의 lease 초과는 *작업 중*이 아니라 **고장**이고,
// tri-state + fail-closed 조합은 해당 receipt를 영구 차단하는 stall class를
// 만든다. 따라서 짧은 lease는 liveness와 무관하게 항상 적용하고, liveness는
// reclaim을 *막는* 조건이 아니라 lease 이전에도 즉시 reclaim하게 하는 추가
// trigger로만 쓴다.
function tryReclaimStaleLock(lockPath, leaseMs) {
  const lease = Number.isFinite(leaseMs) && leaseMs > 0 ? leaseMs : LEASE_MS;
  let stat;
  try { stat = fs.statSync(lockPath); } catch (_e) { return false; }
  const mtimeMs = stat.mtimeMs || (stat.mtime && stat.mtime.getTime()) || 0;
  const ageMs = Date.now() - mtimeMs;
  const leaseExpired = Number.isFinite(ageMs) && ageMs > lease;

  const body = readLockBody(lockPath);
  const unlink = () => {
    try { fs.unlinkSync(lockPath); return true; } catch (_e) { return false; }
  };

  if (!body || body._zero_byte || body._parse_error) return leaseExpired ? unlink() : false;
  if (body.host && body.host !== os.hostname()) return unlink();              // cross-host → 즉시
  if (typeof body.pid === 'number' && !isPidAlive(body.pid)) return unlink(); // dead → 즉시
  return leaseExpired ? unlink() : false;                                     // live여도 lease 만료면 reclaim
}

function acquireLock(lockPath, opts) {
  opts = opts || {};
  const lease = opts.leaseMs || LEASE_MS;
  const maxRetries = Number.isFinite(opts.maxRetries) ? opts.maxRetries : ACQUIRE_MAX_RETRIES;
  const retryMs = Number.isFinite(opts.retryMs) ? opts.retryMs : ACQUIRE_RETRY_MS;
  const token = crypto.randomUUID();
  const body = JSON.stringify({
    pid: resolveSessionPid(opts.env) || process.pid,
    host: os.hostname(),
    session_id: resolveSessionId(opts.env),
    started_at: new Date().toISOString(),
    token: token,
  });

  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  for (let i = 0; i <= maxRetries; i++) {
    let fd;
    try {
      // 0o600 — 위협 모델상 적대적 위조자는 범위 밖이므로 token은 평문이고
      // 보호는 owner-only 파일 모드다(quarantine lock 선례).
      fd = fs.openSync(lockPath, 'wx', 0o600);
    } catch (err) {
      if (!err || err.code !== 'EEXIST') throw err;
      if (tryReclaimStaleLock(lockPath, lease)) continue;   // 회수 성공 → 즉시 재시도
      if (i < maxRetries) sleepSync(retryMs);
      continue;
    }
    try {
      fs.writeSync(fd, body);
    } finally {
      try { fs.closeSync(fd); } catch (_e) { /* ignore */ }
    }
    return token;
  }

  const remaining = remainingLeaseMs(lockPath, lease);
  throw new EvidenceLockError('EVIDENCE_LOCK_UNAVAILABLE',
    'could not acquire evidence lock after ' + (maxRetries * retryMs) + 'ms.\n'
    + '  lock:            ' + lockPath + '\n'
    + '  lease remaining: ' + (remaining === null ? 'unknown' : remaining + 'ms')
    + ' (lease=' + lease + 'ms; a live holder heartbeats it, a stalled one does not)\n'
    + '  retry:           re-run the same gate command — a stalled holder is reclaimed '
    + 'once its lease expires\n'
    + '  kill switch:     MCCP_EVIDENCE_CONFLICT_GUARD=warn (proceed without the guard; '
    + 'conflicts are then observed but NOT blocked)');
}

function remainingLeaseMs(lockPath, lease) {
  try {
    const stat = fs.statSync(lockPath);
    const mtimeMs = stat.mtimeMs || (stat.mtime && stat.mtime.getTime()) || 0;
    return Math.max(0, lease - (Date.now() - mtimeMs));
  } catch (_e) { return null; }
}

function heartbeat(lockPath) {
  try {
    const now = new Date();
    fs.utimesSync(lockPath, now, now);
    return true;
  } catch (_e) { return false; }
}

function isOwned(lockPath, token) {
  const body = readLockBody(lockPath);
  return !!(body && body.token === token);
}

function releaseLock(lockPath, token) {
  // ownership 일치 시에만 unlink — 남의 lock을 지우지 않는다.
  if (!isOwned(lockPath, token)) return false;
  try { fs.unlinkSync(lockPath); return true; } catch (_e) { return false; }
}

// ── 원자 write ───────────────────────────────────────────────────────────────
// tmp 파일명은 반드시 `.tmp`로 끝나고 pid + random nonce를 포함해야 한다.
// 고정 이름(`target + '.tmp'`)은 동시 writer가 tmp에서 충돌한다.
function tmpPathFor(target) {
  return target + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
}

// onRetry는 매 재시도 **전에** 호출된다 — heartbeat로 lease를 살리고 소유를
// 재확인한다. false를 반환하면(소유 상실) 재시도하지 않고 즉시 중단한다.
function writeFileAtomic(target, content, opts) {
  opts = opts || {};
  const onRetry = typeof opts.onRetry === 'function' ? opts.onRetry : null;
  const maxRetries = Number.isFinite(opts.maxRetries) ? opts.maxRetries : RENAME_MAX_RETRIES;
  const retryMs = Number.isFinite(opts.retryMs) ? opts.retryMs : RENAME_RETRY_MS;
  const tmp = tmpPathFor(target);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(tmp, content, 'utf8');

  let lastErr = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      fs.renameSync(tmp, target);
      return { ok: true, attempts: i + 1 };
    } catch (err) {
      lastErr = err;
      if (!err || !RENAME_RETRYABLE.has(err.code) || i === maxRetries) break;
      if (onRetry && onRetry(i) === false) break;   // 소유 상실 → 재시도 중단
      sleepSync(retryMs);
    }
  }
  try { fs.unlinkSync(tmp); } catch (_e) { /* 부분 write 잔존 금지 */ }
  throw lastErr || new EvidenceLockError('EVIDENCE_ATOMIC_WRITE_FAILED',
    'atomic rename failed for ' + target);
}

// ── 경로 파생 ────────────────────────────────────────────────────────────────
const RECEIPT_SEGMENTS = path.join('.claude', 'receipts') + path.sep;

function isReceiptPath(target) {
  const abs = path.resolve(target);
  return abs.includes(RECEIPT_SEGMENTS) && abs.endsWith('.json');
}

// `.claude/receipts/<gate>/<slug>.json` → { repoRoot, gateId, slug }
function describeReceiptTarget(target) {
  const abs = path.resolve(target);
  const idx = abs.lastIndexOf(RECEIPT_SEGMENTS);
  if (idx < 0) return null;
  const repoRoot = abs.slice(0, idx);
  const rel = abs.slice(idx + RECEIPT_SEGMENTS.length);
  const parts = rel.split(path.sep);
  if (parts.length < 2) return null;
  return {
    repoRoot: repoRoot,
    gateId: parts[0],
    slug: parts[parts.length - 1].replace(/\.json$/, ''),
    relPath: path.relative(repoRoot, abs).split(path.sep).join('/'),
  };
}

// ── guard 이벤트 ─────────────────────────────────────────────────────────────
// 이벤트 append는 lock 해제 **후**에 한다(임계구역을 파일 IO 최소로 유지). 단
// fail-closed 거부 경로는 throw 전에 emit한다. 이 선택의 귀결: rename과 emit
// 사이에 crash하면 guard 이벤트 없는 hash 변경이 남아 런타임 감사가 이를
// 미커버 변형으로 보고한다 — 보수적 방향의 오탐이며, 사고를 놓치는 반대
// 방향보다 안전하다.
function emitEvent(repoRoot, event, env) {
  try {
    const mswEvents = require('../state/msw-events');
    const sid = resolveSessionId(env) || 'unknown';
    mswEvents.appendEvent(sid, event, { repoRoot: repoRoot });
  } catch (err) {
    process.stderr.write('[mccp:evidence-lock] WARNING: guard event append failed: '
      + (err && err.message ? err.message : err)
      + ' — the runtime coverage audit will report this mutation as uncovered (allow)\n');
  }
}

// ── claim fence ──────────────────────────────────────────────────────────────
// 호출자가 epoch을 "제시"하지 않는다. writeReceipt가 claim 레코드를 스스로 읽고
// 실행 세션 정체와 대조한다 — 그래서 CLI 인자 변경이 0이고 bare CLI ingress
// (`/mccp:receipt-write`)에도 자동 적용된다.
function applyClaimFence(desc, mode, env) {
  let claim;
  try {
    claim = require('../state/evidence-claim');
  } catch (err) {
    // fence 모듈 부재는 보증의 조용한 증발이다. enforce에서는 fail-closed.
    const msg = 'evidence-claim module unavailable: ' + (err && err.message ? err.message : err);
    if (mode === 'enforce') throw new EvidenceLockError('EVIDENCE_CLAIM_UNAVAILABLE', msg);
    process.stderr.write('[mccp:evidence-lock] WARNING: ' + msg + ' — fence skipped (warn mode)\n');
    return { allow: true, reason: 'fence-module-unavailable', claimEpoch: null, holder: null };
  }
  return claim.evaluateFence({
    repoRoot: desc.repoRoot,
    slug: desc.slug,
    gateId: desc.gateId,
    env: env,
  });
}

// ── 핵심 파이프라인 ──────────────────────────────────────────────────────────
function runGuarded(target, produce, opts) {
  opts = opts || {};
  const mode = opts.mode || parseGuardMode(opts.env);
  const env = opts.env;
  const abs = path.resolve(target);

  if (mode === 'off') {
    process.stderr.write('[mccp:evidence-lock] WARNING: MCCP_EVIDENCE_CONFLICT_GUARD=off — '
      + 'writing ' + abs + ' with NO lock, NO fence, NO overwrite detection\n');
    const current = readFileOrNull(abs);
    const content = produce(current);
    if (content === null || content === undefined) return { path: abs, skipped: true };
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return { path: abs, skipped: false, guarded: false };
  }

  if (HELD.has(abs)) {
    throw new EvidenceLockError('EVIDENCE_LOCK_REENTRANT',
      'nested evidence lock acquisition for the same target is forbidden: ' + abs
      + ' (store/briefing/completion-ledger must each acquire and release independently)');
  }

  const lockPath = lockPathFor(abs);
  const desc = isReceiptPath(abs) ? describeReceiptTarget(abs) : null;
  const pending = [];
  let token;
  try {
    token = acquireLock(lockPath, opts);
  } catch (err) {
    if (mode === 'warn' && err && err.code === 'EVIDENCE_LOCK_UNAVAILABLE') {
      process.stderr.write('[mccp:evidence-lock] WARNING: ' + err.message
        + '\n  → MCCP_EVIDENCE_CONFLICT_GUARD=warn: proceeding WITHOUT the lock '
        + '(race window open)\n');
      token = null;
    } else {
      throw err;
    }
  }

  HELD.add(abs);
  let result;
  try {
    if (token) heartbeat(lockPath);

    // (1) base-hash 선조건 — 임계구역 진입 시 disk 상태를 기억한다.
    // 선조건 판정에는 **바이트 hash**를 쓴다(어떤 변화든 잡아야 하므로).
    // 이벤트에 싣는 pre/post hash는 별도로 `receipt_hash`를 쓴다(위 주석).
    const before = readFileOrNull(abs);
    const baseHash = before === null ? null : sha256(before);
    const preReceiptHash = extractReceiptHash(before);

    // (2) claim fence — receipt 경로에서만, 경로에서 파생(caller 스위치 없음).
    let claimEpoch = null;
    if (desc) {
      const fence = applyClaimFence(desc, mode, env);
      claimEpoch = fence.claimEpoch || null;
      if (!fence.allow) {
        emitEvent(desc.repoRoot, {
          kind: 'evidence_conflict_prevented',
          work_unit: desc.slug,
          conflict_kind: fence.reason || 'claim-denied',
          holder_session: (fence.holder && fence.holder.session_id) || null,
          claim_epoch: claimEpoch,
          target: desc.relPath,
          event_id: crypto.randomUUID(),
          producer: 'evidence-lock.js',
        }, env);
        if (mode === 'enforce') {
          throw new EvidenceLockError('EVIDENCE_CLAIM_DENIED',
            'work unit "' + desc.slug + '" is claimed by another live session '
            + '(reason=' + (fence.reason || 'claim-denied') + ').\n'
            + '  holder:      ' + JSON.stringify(fence.holder || null) + '\n'
            + '  target:      ' + abs + '\n'
            + '  recovery:    let the other session finish, or wait out the claim TTL, '
            + 'or set MCCP_EVIDENCE_CONFLICT_GUARD=warn to observe without blocking');
        }
        process.stderr.write('[mccp:evidence-lock] WARNING: claim fence denied '
          + desc.slug + ' (' + fence.reason + ') — warn mode, proceeding\n');
      }
    }

    // (3) 내용 생성 — read-modify-write의 read도 임계구역 **안**이다.
    const content = produce(before);
    if (content === null || content === undefined) {
      result = { path: abs, skipped: true, guarded: true };
    } else {
      // (4) rename 직전: heartbeat + 소유 재확인 + base-hash 재검
      if (token) {
        heartbeat(lockPath);
        if (!isOwned(lockPath, token)) {
          reportOverwrite(desc, preReceiptHash, null, 'lock-lost-before-rename', mode, abs, claimEpoch, env);
        }
      }
      const nowRaw = readFileOrNull(abs);
      const nowHash = nowRaw === null ? null : sha256(nowRaw);
      if (nowHash !== baseHash) {
        reportOverwrite(desc, preReceiptHash, extractReceiptHash(nowRaw), 'base-hash-changed', mode, abs, claimEpoch, env);
      }

      // (5) 원자 rename — retry 루프 안에서도 heartbeat + 소유 재확인(F5)
      writeFileAtomic(abs, content, {
        onRetry: function () {
          if (!token) return true;
          heartbeat(lockPath);
          return isOwned(lockPath, token);
        },
      });

      // (6) post-rename 검증 — ENOENT는 통과가 아니다.
      const after = readFileOrNull(abs);
      if (after === null) {
        reportOverwrite(desc, preReceiptHash, null, 'vanished-after-rename', mode, abs, claimEpoch, env);
      } else if (after !== content) {
        reportOverwrite(desc, preReceiptHash, extractReceiptHash(after), 'content-differs-after-rename',
          mode, abs, claimEpoch, env);
      } else if (token && !isOwned(lockPath, token)) {
        // 우리는 소유 없이 썼다 — 승계자를 덮었을 수 있다. G3의 "덮어쓴 쪽이 보고한다".
        reportOverwrite(desc, preReceiptHash, extractReceiptHash(after), 'wrote-without-ownership',
          mode, abs, claimEpoch, env);
      }

      if (desc) {
        pending.push({
          repoRoot: desc.repoRoot,
          event: {
            kind: 'evidence_guard_active',
            work_unit: desc.slug,
            conflict_kind: null,
            holder_session: resolveSessionId(env),
            pre_hash: preReceiptHash,
            post_hash: extractReceiptHash(content),
            claim_epoch: claimEpoch,
            target: desc.relPath,
            event_id: crypto.randomUUID(),
            producer: 'evidence-lock.js',
          },
        });
      }
      result = { path: abs, skipped: false, guarded: true,
        preHash: preReceiptHash, postHash: extractReceiptHash(content) };
    }
  } finally {
    HELD.delete(abs);
    if (token) releaseLock(lockPath, token);
  }

  for (const p of pending) emitEvent(p.repoRoot, p.event, env);
  return result;
}

// 사고 기록은 throw **전에** emit한다(fail-closed 경로는 버퍼를 못 비운다).
function reportOverwrite(desc, preHash, postHash, kind, mode, abs, claimEpoch, env) {
  if (desc) {
    emitEvent(desc.repoRoot, {
      kind: 'evidence_overwrite_observed',
      work_unit: desc.slug,
      conflict_kind: kind,
      holder_session: resolveSessionId(env),
      pre_hash: preHash,
      post_hash: postHash,
      claim_epoch: claimEpoch,
      target: desc.relPath,
      event_id: crypto.randomUUID(),
      producer: 'evidence-lock.js',
    }, env);
  }
  if (mode === 'enforce') {
    throw new EvidenceLockError('EVIDENCE_OVERWRITE_OBSERVED',
      'evidence overwrite observed (' + kind + ') at ' + abs + '.\n'
      + '  pre_hash:  ' + preHash + '\n'
      + '  post_hash: ' + postHash + '\n'
      + '  The write was REFUSED (or detected after the fact). Re-run the gate command; '
      + 'another session raced this receipt.');
  }
  process.stderr.write('[mccp:evidence-lock] WARNING: overwrite observed (' + kind
    + ') at ' + abs + ' — warn mode, not blocking\n');
}

function readFileOrNull(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_e) { return null; }
}

// guard 이벤트의 pre/post hash는 **`receipt_hash`**다 — 파일 바이트 hash가
// 아니다. B2 런타임 감사가 뜨는 스냅샷이 `path → {receipt_hash, mtime, size}`
// 이므로 이벤트가 같은 어휘로 말해야 건별 상관이 성립한다. 바이트 hash를
// 넣으면 감사는 영원히 대조에 실패한다.
//
// 부수 효과가 정확히 설계대로다: carve-out 5필드만 바뀐 변형(briefing ·
// ledger skip 진단)은 pre_hash === post_hash가 되어 감사의 **carved-only
// 분류**로 떨어지고 hash-변경 커버리지 판정에 들어가지 않는다(§6.4).
function extractReceiptHash(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    const o = JSON.parse(raw);
    return (o && typeof o.receipt_hash === 'string') ? o.receipt_hash : null;
  } catch (_e) { return null; }
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

// guardedWrite(target, buildContent, opts) — buildContent()가 null을 반환하면 write skip.
function guardedWrite(target, buildContent, opts) {
  return runGuarded(target, function () { return buildContent(); }, opts);
}

// guardedReadModifyWrite(target, mutate, opts) — mutate(currentRawOrNull)가 lock
// **안에서** 읽은 내용을 받는다. read를 임계구역 밖에 두면 lost update가 닫히지 않는다.
function guardedReadModifyWrite(target, mutate, opts) {
  return runGuarded(target, mutate, opts);
}

module.exports = {
  guardedWrite: guardedWrite,
  guardedReadModifyWrite: guardedReadModifyWrite,
  EvidenceLockError: EvidenceLockError,
  parseGuardMode: parseGuardMode,
  isReceiptPath: isReceiptPath,
  describeReceiptTarget: describeReceiptTarget,
  resolveSessionId: resolveSessionId,
  resolveSessionPid: resolveSessionPid,
  isPidAlive: isPidAlive,
  LEASE_MS: LEASE_MS,
  // test-only — raw lock context는 공개 계약이 아니다(F3). production caller는
  // 위의 guarded* 두 함수만 쓴다.
  __testonly: {
    acquireLock: acquireLock,
    releaseLock: releaseLock,
    heartbeat: heartbeat,
    isOwned: isOwned,
    tryReclaimStaleLock: tryReclaimStaleLock,
    writeFileAtomic: writeFileAtomic,
    lockPathFor: lockPathFor,
    tmpPathFor: tmpPathFor,
    readLockBody: readLockBody,
    HELD: HELD,
  },
};
