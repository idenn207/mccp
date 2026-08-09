'use strict';

// multi-session-work-loop M3 (CL-5) — msw-events writer↔reader 경로 정합 회귀.
//
// 결함이었던 것: writer 기본 경로가 cwd 상대인데 reader는 repoRoot 고정이었고,
// 두 hook caller 모두 dir을 넘기지 않았다. 결과는 (a) 이벤트가 reader가 보지
// 않는 곳에 쌓여 조용히 0건이 되거나 (b) worktree가 여럿일 때 교차 오염이다.
// B2의 분모와 guard 커버리지가 전부 이 sidecar 위에 얹히므로 헤드라인
// acceptance가 여기에 직접 달려 있다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mswEvents = require('../../state/msw-events');
const { scanSessionActivity } = require('../../derive/sources/session-activity');

function mkRepo(name) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-mswp-' + (name || '') + '-'));
  fs.mkdirSync(path.join(repo, '.claude', 'state'), { recursive: true });
  return repo;
}

function eventsDirOf(repo) {
  return path.join(repo, '.claude', 'state', 'msw-events');
}

test('explicit repoRoot anchors the write where the reader scans', () => {
  const repo = mkRepo('explicit');
  const r = mswEvents.appendEvent('s1', { kind: 'session_start', created_at: 'x' }, { repoRoot: repo });
  assert.equal(r.ok, true);
  assert.ok(fs.existsSync(path.join(eventsDirOf(repo), 's1.jsonl')),
    'the event must land under repoRoot, not cwd');
});

test('cwd inside a subdirectory still resolves to the repo root (walk-up)', () => {
  const repo = mkRepo('walkup');
  const deep = path.join(repo, 'a', 'b', 'c');
  fs.mkdirSync(deep, { recursive: true });
  const resolved = mswEvents.resolveEventsDir({ cwd: deep });
  assert.equal(path.resolve(resolved), path.resolve(eventsDirOf(repo)),
    'a hook running from a subdir must not fork the event location');
});

test('resolution precedence: dir > repoRoot > walk-up', () => {
  const repo = mkRepo('prec');
  const custom = path.join(repo, 'custom');
  assert.equal(mswEvents.resolveEventsDir({ dir: custom, repoRoot: repo }), custom);
  assert.equal(path.resolve(mswEvents.resolveEventsDir({ repoRoot: repo })),
    path.resolve(eventsDirOf(repo)));
});

test('two worktrees do not cross-count each other events (B2 denominator integrity)', () => {
  const wtA = mkRepo('wtA');
  const wtB = mkRepo('wtB');
  const t0 = '2026-01-01T00:00:00.000Z';
  const t1 = '2026-01-01T01:00:00.000Z';

  mswEvents.appendEvent('sess-A', { kind: 'session_start', created_at: t0, ts: t0 }, { repoRoot: wtA });
  mswEvents.appendEvent('sess-A', { kind: 'session_end', ended_at: t1, ts: t1 }, { repoRoot: wtA });
  mswEvents.appendEvent('sess-B', { kind: 'session_start', created_at: t0, ts: t0 }, { repoRoot: wtB });
  mswEvents.appendEvent('sess-B', { kind: 'session_end', ended_at: t1, ts: t1 }, { repoRoot: wtB });

  const a = scanSessionActivity(wtA);
  const b = scanSessionActivity(wtB);
  assert.equal(a.task_startups_count, 1, 'worktree A sees only its own session');
  assert.equal(b.task_startups_count, 1, 'worktree B sees only its own session');
  assert.equal(a.concurrent_pairs_count, 0,
    "one worktree's session must not pair with the other's");
});

test('event_id is assigned at append time and survives the allowlist', () => {
  const repo = mkRepo('evtid');
  mswEvents.appendEvent('s1', { kind: 'evidence_guard_active', work_unit: 'w' }, { repoRoot: repo });
  const line = fs.readFileSync(path.join(eventsDirOf(repo), 's1.jsonl'), 'utf8').trim();
  const o = JSON.parse(line);
  assert.ok(o.event_id && o.event_id.length > 10, 'a stable dedupe key must be persisted');
});

test('M3 fields are NOT silently stripped by eventToJsonLine (santa J5)', () => {
  // eventToJsonLine drops keys that are absent from ALLOWED_FIELDS. If pre/post
  // hash were missing from the allowlist the B2 audit would have nothing to
  // compare against, and the whole I4 forgery defense would be void.
  const line = mswEvents.eventToJsonLine({
    kind: 'evidence_guard_active',
    ts: '2026-01-01T00:00:00.000Z',
    work_unit: 'unit',
    conflict_kind: null,
    holder_session: 'sess-A',
    pre_hash: 'sha256:aaa',
    post_hash: 'sha256:bbb',
    claim_epoch: 'epoch-1',
    target: '.claude/receipts/g/s.json',
    event_id: 'e-1',
  });
  const o = JSON.parse(line);
  for (const k of ['work_unit', 'holder_session', 'pre_hash', 'post_hash', 'claim_epoch', 'target', 'event_id']) {
    assert.ok(Object.prototype.hasOwnProperty.call(o, k), 'field survived: ' + k);
  }
  assert.equal(o.pre_hash, 'sha256:aaa');
  assert.equal(o.post_hash, 'sha256:bbb');
});

test('unknown fields are still dropped (allowlist is additive, not open)', () => {
  const line = mswEvents.eventToJsonLine({ kind: 'x', ts: 't', not_allowed: 'leak' });
  assert.equal(JSON.parse(line).not_allowed, undefined);
});

test('duplicate event ids across locations are counted once (F6 dedupe)', () => {
  // Simulates the back-compat window where the same event exists in both the old
  // cwd-relative and the new repoRoot-anchored location.
  const repo = mkRepo('dedupe');
  const dir = eventsDirOf(repo);
  fs.mkdirSync(dir, { recursive: true });
  const shared = JSON.stringify({
    kind: 'session_start', ts: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z', session_id: 'dup', event_id: 'same-id',
  });
  // Two lines with the SAME event_id inside one file — the reader must fold them.
  fs.writeFileSync(path.join(dir, 'dup.jsonl'), shared + '\n' + shared + '\n', 'utf8');
  fs.appendFileSync(path.join(dir, 'dup.jsonl'), JSON.stringify({
    kind: 'session_end', ts: '2026-01-01T01:00:00.000Z',
    ended_at: '2026-01-01T01:00:00.000Z', session_id: 'dup', event_id: 'end-id',
  }) + '\n', 'utf8');

  const r = scanSessionActivity(repo);
  assert.equal(r.task_startups_count, 1, 'a duplicated event_id must not double count');
});

test('taxonomy counters read the new kinds and the dead read is gone', () => {
  const repo = mkRepo('taxonomy');
  const base = { ts: '2026-01-01T00:00:00.000Z' };
  mswEvents.appendEvent('s', Object.assign({ kind: 'evidence_guard_active' }, base), { repoRoot: repo });
  mswEvents.appendEvent('s', Object.assign({ kind: 'evidence_guard_active' }, base), { repoRoot: repo });
  mswEvents.appendEvent('s', Object.assign({ kind: 'evidence_overwrite_observed' }, base), { repoRoot: repo });
  // Claim denials are NOT a separate kind. They arrive as prevented + a
  // claim-fence `conflict_kind`; the reader derives claim_denied_count from that
  // discriminator. The earlier shape counted a dedicated `work_claim_denied`
  // kind that no producer ever emitted, so the counter was structurally stuck at
  // zero — the same dead-read defect this milestone removed for
  // `collision`/`conflict`, reintroduced one field over.
  mswEvents.appendEvent('s', Object.assign({
    kind: 'evidence_conflict_prevented', conflict_kind: 'base-hash-changed',
  }, base), { repoRoot: repo });
  mswEvents.appendEvent('s', Object.assign({
    kind: 'evidence_conflict_prevented', conflict_kind: 'other-live-holder',
  }, base), { repoRoot: repo });
  // The retired kinds must contribute nothing.
  mswEvents.appendEvent('s', Object.assign({ kind: 'collision' }, base), { repoRoot: repo });
  mswEvents.appendEvent('s', Object.assign({ kind: 'work_claim_denied' }, base), { repoRoot: repo });

  const r = scanSessionActivity(repo);
  assert.equal(r.guard_active_count, 2);
  assert.equal(r.collision_producer_present, true, 'guard_active alone proves the producer is wired');
  assert.equal(r.overwrite_observed_count, 1);
  assert.equal(r.conflict_prevented_count, 2, 'both lock-axis and claim-axis preventions');
  assert.equal(r.claim_denied_count, 1, 'only the claim-fence one, derived from conflict_kind');
  assert.equal(r.collision_events_count, 1, 'B2 numerator counts incidents only');
});

test('a claim-fence denial is counted through a kind that a producer really emits', () => {
  // Regression guard for the dead read: assert against the reader using an event
  // shaped exactly as receipt/evidence-lock.js emits it, so renaming the kind on
  // one side alone breaks this test instead of silently zeroing the counter.
  const repo = mkRepo('claimdeny');
  mswEvents.appendEvent('s', {
    kind: 'evidence_conflict_prevented',
    ts: '2026-01-01T00:00:00.000Z',
    work_unit: 'unit-x',
    conflict_kind: 'other-live-holder',
    holder_session: 'someone-else',
    target: '.claude/receipts/mccp-plan-codex/unit-x.json',
    producer: 'evidence-lock.js',
  }, { repoRoot: repo });

  const r = scanSessionActivity(repo);
  assert.equal(r.claim_denied_count, 1);
  assert.equal(r.overwrite_observed_count, 0, 'a refused write is not an incident');
});

test('coverage gate artifact absence reads as NOT passed (fail-closed)', () => {
  const repo = mkRepo('gateoff');
  const r = scanSessionActivity(repo);
  assert.equal(r.coverage_gate_ok, false, 'an unobserved gate must never read as passed');
});
