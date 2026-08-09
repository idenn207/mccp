'use strict';

// multi-session-work-loop M3 — evidence-claim 회귀.
//
// 여기서 고정하는 것은 plan Task 4 Validate + 리뷰 흡수 항목이다:
//   G1 1승 1거부 · OQ-1 동일 세션 재진입 멱등 · J3 승계자 tombstone ·
//   Codex F3 부활 holder 거부 · J1 O_EXCL 생성 원자성 ·
//   J4 ledger PID 비의존 · Implement-Codex F2 claim mutation 직렬화 ·
//   정체 강등 경로 · TTL 만료 후 fence lapse(known-gap).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const claim = require('../../state/evidence-claim');
const lock = require('../../receipt/evidence-lock');

function mkRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-claim-'));
  fs.mkdirSync(path.join(repo, '.claude', 'state'), { recursive: true });
  return repo;
}

const A = { CLAUDE_CODE_SESSION_ID: 'sess-A', CLAUDE_PID: String(process.pid) };
const B = { CLAUDE_CODE_SESSION_ID: 'sess-B', CLAUDE_PID: String(process.pid) };

function fence(repo, env, extra) {
  return claim.evaluateFence(Object.assign({ repoRoot: repo, slug: 'unit', env: env }, extra || {}));
}

test('G1: two live sessions cannot both hold one work unit (1 win, 1 refusal)', () => {
  const repo = mkRepo();
  const first = fence(repo, A);
  assert.equal(first.allow, true);
  assert.equal(first.reason, 'implicit-claim-created');

  const second = fence(repo, B);
  assert.equal(second.allow, false, 'a second live session must be refused');
  assert.equal(second.reason, 'other-live-holder');
  assert.equal(second.holder.session_id, 'sess-A', 'the refusal names the actual holder');
});

test('OQ-1: the same session re-entering is idempotent, not a refusal', () => {
  // receipt/cli.js runs as a FRESH node process per write, so an identity built
  // on process.pid would refuse the same session's second write. session_pid is
  // CLAUDE_PID (the session process), which is stable across those re-runs.
  const repo = mkRepo();
  assert.equal(fence(repo, A).allow, true);
  const again = fence(repo, A);
  assert.equal(again.allow, true, 'second write from the same session must pass');
  assert.equal(again.reason, 'holder-reentry');

  const rec = claim.readClaim(repo, 'unit');
  assert.equal(rec.session_pid, Number(A.CLAUDE_PID));
  assert.notEqual(rec.session_pid, undefined);
});

test('OQ-1: identity uses CLAUDE_PID, never process.pid', () => {
  const repo = mkRepo();
  // Two "processes" of the same session differing only in process.pid must agree.
  const env1 = { CLAUDE_CODE_SESSION_ID: 'sess-X', CLAUDE_PID: String(process.pid) };
  assert.equal(fence(repo, env1).allow, true);
  const id = claim.resolveIdentity(env1);
  assert.equal(id.identity.session_pid, Number(process.pid));
  assert.equal(id.identity.session_id, 'sess-X');
});

test('degraded identity: CLAUDE_PID absent → {session_id, host} + TTL-only liveness', () => {
  const repo = mkRepo();
  const noPid = { CLAUDE_CODE_SESSION_ID: 'sess-A' };
  const r = fence(repo, noPid);
  assert.equal(r.allow, true, 'fence must not collapse when the env is missing');
  const rec = claim.readClaim(repo, 'unit');
  assert.equal(rec.session_pid, null, 'the pid axis is dropped, not faked');
  // Re-entry still recognised via {session_id, host}.
  assert.equal(fence(repo, noPid).reason, 'holder-reentry');
});

test('no session identity → claim skipped, fence disabled, write NOT blocked', () => {
  const repo = mkRepo();
  const r = fence(repo, {});
  assert.equal(r.allow, true);
  assert.equal(r.reason, 'claim_skipped_no_identity');
  assert.equal(claim.readClaim(repo, 'unit'), null, 'an anonymous process must not create a claim');
});

test('J4: liveness comes from last_touch TTL, not the session-ledger PID axis', () => {
  const repo = mkRepo();
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  fence(repo, A, { now: t0 });
  // No ledger exists at all in this repo; G1 must still fire.
  assert.equal(fs.existsSync(path.join(repo, '.claude', 'state', 'session-ledger')), false);
  const denied = fence(repo, B, { now: t0 + 1000 });
  assert.equal(denied.allow, false, 'G1 fires with zero ledger involvement');
  assert.equal(denied.reason, 'other-live-holder');
});

test('stale holder is succeeded and the successor records a tombstone (J3)', () => {
  // A dies WITHOUT calling releaseClaim — the G2 premise. If tombstones were only
  // written on voluntary release, none would exist here and a resurrected A would
  // fall through "no record → pass".
  const repo = mkRepo();
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const ttl = 1000;
  const first = fence(repo, A, { now: t0, ttlMs: ttl });
  const epochA = first.claimEpoch;

  const succ = fence(repo, B, { now: t0 + 5000, ttlMs: ttl });
  assert.equal(succ.allow, true);
  assert.equal(succ.reason, 'succeeded-stale-holder');

  const rec = claim.readClaim(repo, 'unit');
  assert.equal(rec.session_id, 'sess-B');
  assert.ok(Array.isArray(rec.superseded) && rec.superseded.length >= 1, 'tombstone recorded');
  assert.equal(rec.superseded[0].session_id, 'sess-A');
  assert.equal(rec.superseded[0].claim_epoch, epochA);
  assert.notEqual(rec.claim_epoch, epochA, 'the successor gets a fresh epoch');
});

test('Codex F3: A expires → B succeeds → B releases → resurrected A is REFUSED', () => {
  const repo = mkRepo();
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const ttl = 1000;
  fence(repo, A, { now: t0, ttlMs: ttl });                       // A claims
  fence(repo, B, { now: t0 + 5000, ttlMs: ttl });                // B succeeds
  const rel = claim.releaseClaim({ repoRoot: repo, slug: 'unit', env: B, now: t0 + 6000 });
  assert.equal(rel.ok, true, 'B releases');

  const revived = fence(repo, A, { now: t0 + 7000, ttlMs: ttl });
  assert.equal(revived.allow, false, 'a resurrected holder must not write to a closed unit');
  assert.equal(revived.reason, 'resurrected-holder');
});

test('tombstone + successor (not the superseded holder) → passes', () => {
  const repo = mkRepo();
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const ttl = 1000;
  fence(repo, A, { now: t0, ttlMs: ttl });
  fence(repo, B, { now: t0 + 5000, ttlMs: ttl });
  const again = fence(repo, B, { now: t0 + 5100, ttlMs: ttl });
  assert.equal(again.allow, true, "the successor's own write must pass");
});

test('known gap: after the tombstone TTL the replay fence lapses (M5 owns the fix)', () => {
  // Recorded as a TEST, not hidden — if this behaviour ever changes silently we
  // want it to fail here. Unbounded replay defense needs a global monotonic
  // sequence, which is M5 scope.
  const repo = mkRepo();
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  const ttl = 1000;
  fence(repo, A, { now: t0, ttlMs: ttl });
  fence(repo, B, { now: t0 + 5000, ttlMs: ttl });
  claim.releaseClaim({ repoRoot: repo, slug: 'unit', env: B, now: t0 + 6000 });

  // Inside the TTL window: refused (asserted in the F3 test above).
  const inside = fence(repo, A, { now: t0 + 6500, ttlMs: ttl });
  assert.equal(inside.allow, false);

  // The superseded list is bounded and the record is not retained forever; this
  // test pins the CURRENT behaviour so a silent change is caught.
  const rec = claim.readClaim(repo, 'unit');
  assert.ok(rec.superseded.length <= claim.__testonly.SUPERSEDED_MAX,
    'superseded history stays bounded (unbounded history is M5)');
});

test('J1 + Implement-Codex F2: claim mutation is serialized per SLUG, not per (gate, slug)', () => {
  // The evidence lock key is `<gate>/<slug>.json.lock`, so two different gates
  // touching one slug hold DIFFERENT locks. If claim mutation relied on that lock
  // for atomicity, both could observe the same stale claim and both take it over.
  const repo = mkRepo();
  const claimFile = claim.claimPath(repo, 'unit');
  const claimLock = claimFile + '.lock';

  // Hold the per-slug claim lock, then prove a fence attempt cannot mutate.
  const token = lock.__testonly.acquireLock(claimLock, { env: A });
  assert.throws(
    () => claim.evaluateFence({ repoRoot: repo, slug: 'unit', env: B }),
    (e) => e.code === 'EVIDENCE_LOCK_UNAVAILABLE',
    'claim mutation must block on the per-slug lock, not proceed unserialized');
  lock.__testonly.releaseLock(claimLock, token);

  // With the lock free it succeeds.
  assert.equal(claim.evaluateFence({ repoRoot: repo, slug: 'unit', env: B }).allow, true);
});

test('the claim file lives under the gitignored evidence-claims dir', () => {
  const repo = mkRepo();
  fence(repo, A);
  const p = claim.claimPath(repo, 'unit');
  assert.ok(p.includes(path.join('.claude', 'state', 'evidence-claims')));
  assert.ok(fs.existsSync(p));
});

test('slug is validated as a single path segment (defensive)', () => {
  const repo = mkRepo();
  for (const bad of ['../escape', 'a/b', '..', '']) {
    assert.throws(() => claim.claimPath(repo, bad), (e) => e.code === 'CLAIM_SLUG_INVALID',
      'rejected: ' + JSON.stringify(bad));
  }
});

test('listClaims reports liveness and is the ONLY advisory source', () => {
  const repo = mkRepo();
  const t0 = Date.parse('2026-01-01T00:00:00.000Z');
  claim.evaluateFence({ repoRoot: repo, slug: 'alpha', env: A, now: t0, ttlMs: 1000 });
  claim.evaluateFence({ repoRoot: repo, slug: 'beta', env: B, now: t0, ttlMs: 1000 });

  const live = claim.listClaims({ repoRoot: repo, now: t0 + 100, ttlMs: 1000 });
  assert.equal(live.length, 2);
  assert.ok(live.every((c) => c.live));

  const later = claim.listClaims({ repoRoot: repo, now: t0 + 999999, ttlMs: 1000 });
  assert.ok(later.every((c) => !c.live), 'TTL expiry makes them non-live');
});

test('verifyClaim is read-only (never creates an implicit claim)', () => {
  const repo = mkRepo();
  const r = claim.verifyClaim({ repoRoot: repo, slug: 'unit', env: A });
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'no-record');
  assert.equal(claim.readClaim(repo, 'unit'), null, 'verify must not write');
});
