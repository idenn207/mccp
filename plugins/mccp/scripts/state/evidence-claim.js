'use strict';

// multi-session-work-loop M3 — 작업 단위(=decision slug) 점유 레지스트리.
//
// 설계 근거: docs/multi-session-work-loop/evidence-conflict-design.md §2
//
// 키 = decision slug (PRD 작업단위 freeze: milestone = plan = PR = slug).
// 경로 = <repoRoot>/.claude/state/evidence-claims/<slug>.json  (디렉토리째 gitignored)
//
// live 판정은 **자기완결 `last_touch` TTL**이다. `session-ledger.js`의
// `listLedgers({activeOnly:true})`는 쓰지 않는다 — 기록되는 pid가 SessionStart
// hook 프로세스의 것이고 heartbeat가 pid를 갱신하지 않아, 단일 머신에서
// activeOnly가 사실상 공집합이기 때문이다(그 상류 결함은 backlog 소관).
//
// **모든 claim mutation은 per-slug lock 안에서 일어난다**(Implement-Codex R1 F2).
// `O_EXCL`이 증명하는 것은 *생성*의 원자성뿐이고, 존재 이후의 stale 승계 ·
// last_touch 갱신 · tombstone 기록은 전부 slug 단위 mutation인데 evidence lock의
// 키는 `(gate, slug)`다. 그래서 게이트가 다른 두 세션이 서로 다른 lock을 들고
// 같은 stale claim을 둘 다 승계할 수 있었다. 여기서는 claim 파일 자체에 대한
// 읽기-수정-쓰기를 `guardedReadModifyWrite`로 감싸 slug 단위로 직렬화한다.
//
// lock 순서는 항상 receipt-lock → claim-lock 단방향이므로 순환 대기가 없다
// (claim lock을 든 채 receipt lock을 기다리는 경로가 존재하지 않는다).

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const evidenceLock = require('../receipt/evidence-lock');

const CLAIMS_DIRNAME = path.join('.claude', 'state', 'evidence-claims');

// TTL은 **상수**다(env 토글이 아니다). M3은 신규 토글을 정확히 1개
// (`MCCP_EVIDENCE_CONFLICT_GUARD`)로 제한한다 — B3 토글 축 증가 억제 방향.
// test는 opts.ttlMs로 주입한다.
const CLAIM_TTL_MS = 15 * 60 * 1000;

// tombstone의 superseded 목록은 bounded — 무제한 이력 보존은 M5 소관이다.
const SUPERSEDED_MAX = 8;

class EvidenceClaimError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'EvidenceClaimError';
  }
}

function claimsDir(repoRoot) {
  return path.join(repoRoot, CLAIMS_DIRNAME);
}

// slug는 내부 `derive-decision` 산출이지만, 경로 구성에 쓰이므로 방어적으로
// 정규화한다(위협 모델상 적대적 입력은 범위 밖이나 비용이 0에 가깝다).
function assertSafeSlug(slug) {
  const s = String(slug || '').trim();
  if (!s) throw new EvidenceClaimError('CLAIM_SLUG_INVALID', 'slug is required');
  if (s !== path.basename(s) || s === '.' || s === '..' || /[\\/]/.test(s)) {
    throw new EvidenceClaimError('CLAIM_SLUG_INVALID',
      'slug must be a single path segment (got "' + s + '")');
  }
  return s;
}

function claimPath(repoRoot, slug) {
  return path.join(claimsDir(repoRoot), assertSafeSlug(slug) + '.json');
}

// ── 정체 ─────────────────────────────────────────────────────────────────────
// {session_id, host, session_pid} 3원소. session_pid는 `process.pid`가 아니라
// `CLAUDE_PID`(Claude 세션 프로세스) — cli.js가 write마다 새 프로세스라
// process.pid를 쓰면 같은 세션의 두 번째 write가 "다른 holder"로 거부된다.
function resolveIdentity(env) {
  const sessionId = evidenceLock.resolveSessionId(env);
  if (!sessionId) {
    return { ok: false, reason: 'claim_skipped_no_identity' };
  }
  const rawPid = evidenceLock.resolveSessionPid(env);
  // CLAUDE_PID 부재 또는 kill(pid,0) 실패 → 그 축을 빼고 강등한다. env가
  // 사라져도 fence가 붕괴하지 않고 판별력만 낮아진다.
  const pidUsable = rawPid !== null && evidenceLock.isPidAlive(rawPid);
  if (rawPid !== null && !pidUsable) {
    process.stderr.write('[mccp:evidence-claim] WARNING: CLAUDE_PID=' + rawPid
      + ' is not alive — degrading identity to {session_id, host}; '
      + 'liveness falls back to last_touch TTL alone\n');
  }
  return {
    ok: true,
    identity: {
      session_id: sessionId,
      host: os.hostname(),
      session_pid: pidUsable ? rawPid : null,
    },
    degraded: !pidUsable,
  };
}

function sameHolder(a, b) {
  if (!a || !b) return false;
  if (a.session_id !== b.session_id) return false;
  if (a.host !== b.host) return false;
  // 한쪽이 강등(session_pid=null)이면 pid 축은 판정에서 뺀다 — 강등이 정체
  // 불일치로 번져 정상 경로를 깨뜨리면 안 된다.
  if (a.session_pid === null || b.session_pid === null) return true;
  return a.session_pid === b.session_pid;
}

function isLive(record, nowMs, ttlMs) {
  if (!record || record.released_at) return false;
  const touched = Date.parse(record.last_touch || record.claimed_at || '');
  if (!Number.isFinite(touched)) return false;
  if (nowMs - touched > ttlMs) return false;
  // session_pid 생존은 **보강 신호**다 — TTL 안이라도 세션이 죽었으면 즉시
  // 승계를 허용해 대기를 단축한다. 부재(강등)면 TTL 단독 판정.
  if (typeof record.session_pid === 'number' && record.session_pid > 0
      && record.host === os.hostname() && !evidenceLock.isPidAlive(record.session_pid)) {
    return false;
  }
  return true;
}

function parseRecord(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    const o = JSON.parse(raw);
    return (o && typeof o === 'object') ? o : null;
  } catch (_e) {
    return null;   // 손상 레코드는 부재로 취급 — 승계 경로가 복구한다.
  }
}

function newRecord(slug, identity, nowIso) {
  return {
    slug: slug,
    session_id: identity.session_id,
    host: identity.host,
    session_pid: identity.session_pid,
    claimed_at: nowIso,
    last_touch: nowIso,
    claim_epoch: crypto.randomUUID(),
    superseded: [],
  };
}

// 승계 시 이전 holder를 같은 레코드의 superseded로 보존한다(별도 파일이 아니라
// 같은 파일이어야 원자성이 유지된다). 자발적 releaseClaim이 아니라 **승계자가**
// 쓰는 것이 요점이다 — G2의 전제 시나리오는 "A가 죽어서 release를 못 한 경우"라
// release에만 의존하면 tombstone이 아예 생기지 않는다.
function supersede(prev, next, nowIso) {
  const entry = {
    session_id: prev.session_id,
    host: prev.host,
    session_pid: prev.session_pid,
    claim_epoch: prev.claim_epoch,
    superseded_at: nowIso,
  };
  const carried = Array.isArray(prev.superseded) ? prev.superseded : [];
  next.superseded = carried.concat([entry]).slice(-SUPERSEDED_MAX);
  return next;
}

function isSupersededHolder(record, identity) {
  const list = Array.isArray(record && record.superseded) ? record.superseded : [];
  return list.some(function (e) { return sameHolder(e, identity); });
}

// ── fence 판정 (5분기) ───────────────────────────────────────────────────────
// 호출자가 epoch을 제시하지 않는다 — 파일에 기록된 holder 정체와 실행 중 세션
// 정체를 대조한다. 그래서 CLI 인자 변경이 0이고 bare CLI ingress에도 적용된다.
//
//   레코드 부재            → 암묵 claim 생성 후 통과 (부재 분기가 1회로 소멸)
//   live holder, 본인      → 통과 (+ last_touch 갱신)
//   live holder, 타인      → 거부 (other-live-holder)
//   tombstone, 부활 holder → 거부 (resurrected-holder)
//   tombstone, 승계자      → 통과
function evaluateFence(args) {
  args = args || {};
  const repoRoot = args.repoRoot;
  const slug = assertSafeSlug(args.slug);
  const ttlMs = Number.isFinite(args.ttlMs) ? args.ttlMs : CLAIM_TTL_MS;
  const nowMs = Number.isFinite(args.now) ? args.now : Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const id = resolveIdentity(args.env);
  if (!id.ok) {
    // 무명 프로세스에 nonce를 주면 자기 자신의 다음 write와도 불일치해 정상
    // 경로가 깨지고, host만 쓰면 전부 하나로 붕괴한다 — 둘 다 나쁘다. claim을
    // 만들지 않고 fence도 걸지 않되, 그 사실을 기록한다. evidence lock ·
    // post-rename 검증 · B2 감사는 그대로이므로 G3는 유지되고 이 write에
    // 대해서만 G1·G2가 비활성이다.
    process.stderr.write('[mccp:evidence-claim] WARNING: no session identity '
      + '(MCCP_SESSION_ID / CLAUDE_CODE_SESSION_ID / CLAUDE_SESSION_ID all absent) — '
      + 'claim skipped and fence disabled for this write (G1/G2 inactive, G3 intact)\n');
    return { allow: true, reason: 'claim_skipped_no_identity', claimEpoch: null, holder: null };
  }
  const identity = id.identity;

  let outcome = null;
  const target = claimPath(repoRoot, slug);

  evidenceLock.guardedReadModifyWrite(target, function (raw) {
    const record = parseRecord(raw);

    if (!record) {
      const created = newRecord(slug, identity, nowIso);
      outcome = { allow: true, reason: 'implicit-claim-created', claimEpoch: created.claim_epoch, holder: identity };
      return JSON.stringify(created, null, 2) + '\n';
    }

    const live = isLive(record, nowMs, ttlMs);
    const mine = sameHolder(record, identity);

    if (live && mine) {
      record.last_touch = nowIso;
      outcome = { allow: true, reason: 'holder-reentry', claimEpoch: record.claim_epoch, holder: identity };
      return JSON.stringify(record, null, 2) + '\n';
    }

    if (live && !mine) {
      outcome = {
        allow: false,
        reason: 'other-live-holder',
        claimEpoch: record.claim_epoch,
        holder: {
          session_id: record.session_id,
          host: record.host,
          session_pid: record.session_pid,
          last_touch: record.last_touch,
        },
      };
      return null;   // write 없음
    }

    // 여기부터 stale 또는 released(tombstone).
    if (isSupersededHolder(record, identity)
        || (mine && record.released_at)
        || (mine && record.claim_epoch && args.presentedEpoch
            && args.presentedEpoch !== record.claim_epoch)) {
      // 부활 holder — 이미 승계됐거나 스스로 release한 뒤 되살아났다.
      outcome = {
        allow: false,
        reason: 'resurrected-holder',
        claimEpoch: record.claim_epoch,
        holder: { session_id: record.session_id, host: record.host, session_pid: record.session_pid },
      };
      return null;
    }

    if (mine && !record.released_at) {
      // 내 claim이 TTL로 stale해졌을 뿐 승계자는 없다 — 되살린다.
      record.last_touch = nowIso;
      record.session_pid = identity.session_pid;
      outcome = { allow: true, reason: 'holder-refresh', claimEpoch: record.claim_epoch, holder: identity };
      return JSON.stringify(record, null, 2) + '\n';
    }

    // 승계 — 이전 holder를 tombstone으로 보존하고 소유를 가져온다.
    const next = supersede(record, newRecord(slug, identity, nowIso), nowIso);
    outcome = { allow: true, reason: 'succeeded-stale-holder', claimEpoch: next.claim_epoch, holder: identity };
    return JSON.stringify(next, null, 2) + '\n';
  }, { env: args.env });

  return outcome || { allow: true, reason: 'no-op', claimEpoch: null, holder: null };
}

// ── 명시 API ─────────────────────────────────────────────────────────────────

// acquireClaim — 명시적 점유. fence와 같은 판정을 쓴다(동일 세션 재진입 멱등).
function acquireClaim(args) {
  const r = evaluateFence(args);
  return { ok: r.allow, reason: r.reason, claim_epoch: r.claimEpoch, holder: r.holder };
}

// verifyClaim — 판정만, 부작용 없음(암묵 생성도 안 한다).
function verifyClaim(args) {
  args = args || {};
  const slug = assertSafeSlug(args.slug);
  const ttlMs = Number.isFinite(args.ttlMs) ? args.ttlMs : CLAIM_TTL_MS;
  const nowMs = Number.isFinite(args.now) ? args.now : Date.now();
  const record = readClaim(args.repoRoot, slug);
  if (!record) return { ok: true, reason: 'no-record', holder: null };
  const id = resolveIdentity(args.env);
  if (!id.ok) return { ok: true, reason: 'claim_skipped_no_identity', holder: null };
  const live = isLive(record, nowMs, ttlMs);
  const mine = sameHolder(record, id.identity);
  if (live && !mine) return { ok: false, reason: 'other-live-holder', holder: record };
  if (isSupersededHolder(record, id.identity)) return { ok: false, reason: 'resurrected-holder', holder: record };
  return { ok: true, reason: live ? 'holder' : 'stale-or-released', holder: record };
}

// releaseClaim — **최적화이지 정확성의 전제가 아니다**. 호출 누락이 정확성을
// 깨뜨리지 않는다(승계자가 tombstone을 쓰므로). 삭제가 아니라 released_at을
// 남겨 부활 holder를 TTL 창 동안 거부한다.
function releaseClaim(args) {
  args = args || {};
  const slug = assertSafeSlug(args.slug);
  const nowIso = new Date(Number.isFinite(args.now) ? args.now : Date.now()).toISOString();
  const id = resolveIdentity(args.env);
  if (!id.ok) return { ok: false, reason: 'claim_skipped_no_identity' };

  let outcome = { ok: false, reason: 'no-record' };
  evidenceLock.guardedReadModifyWrite(claimPath(args.repoRoot, slug), function (raw) {
    const record = parseRecord(raw);
    if (!record) return null;
    if (!sameHolder(record, id.identity)) {
      outcome = { ok: false, reason: 'not-holder' };
      return null;
    }
    record.released_at = nowIso;
    record.superseded = (Array.isArray(record.superseded) ? record.superseded : [])
      .concat([{
        session_id: record.session_id,
        host: record.host,
        session_pid: record.session_pid,
        claim_epoch: record.claim_epoch,
        superseded_at: nowIso,
      }]).slice(-SUPERSEDED_MAX);
    outcome = { ok: true, reason: 'released' };
    return JSON.stringify(record, null, 2) + '\n';
  }, { env: args.env });
  return outcome;
}

function readClaim(repoRoot, slug) {
  try {
    return parseRecord(fs.readFileSync(claimPath(repoRoot, slug), 'utf8'));
  } catch (_e) { return null; }
}

// listClaims — advisory 표면(SessionStart 통보)의 유일한 소스. ledger는
// 참조하지 않는다(그 PID 축이 이 아키텍처에서 무효이므로).
function listClaims(args) {
  args = args || {};
  const dir = claimsDir(args.repoRoot);
  const ttlMs = Number.isFinite(args.ttlMs) ? args.ttlMs : CLAIM_TTL_MS;
  const nowMs = Number.isFinite(args.now) ? args.now : Date.now();
  let names;
  try { names = fs.readdirSync(dir); } catch (_e) { return []; }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    let record;
    try { record = parseRecord(fs.readFileSync(path.join(dir, n), 'utf8')); } catch (_e) { continue; }
    if (!record) continue;
    out.push({
      slug: record.slug || n.replace(/\.json$/, ''),
      session_id: record.session_id,
      host: record.host,
      session_pid: record.session_pid,
      claimed_at: record.claimed_at,
      last_touch: record.last_touch,
      claim_epoch: record.claim_epoch,
      released_at: record.released_at || null,
      live: isLive(record, nowMs, ttlMs),
    });
  }
  return out;
}

module.exports = {
  evaluateFence: evaluateFence,
  acquireClaim: acquireClaim,
  verifyClaim: verifyClaim,
  releaseClaim: releaseClaim,
  listClaims: listClaims,
  readClaim: readClaim,
  claimPath: claimPath,
  claimsDir: claimsDir,
  resolveIdentity: resolveIdentity,
  EvidenceClaimError: EvidenceClaimError,
  CLAIM_TTL_MS: CLAIM_TTL_MS,
  __testonly: {
    sameHolder: sameHolder,
    isLive: isLive,
    supersede: supersede,
    isSupersededHolder: isSupersededHolder,
    assertSafeSlug: assertSafeSlug,
    SUPERSEDED_MAX: SUPERSEDED_MAX,
  },
};
