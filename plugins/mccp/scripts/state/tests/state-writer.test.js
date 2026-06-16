'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sw = require('../state-writer');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-state-writer-'));
}

function readRaw(repo) {
  return fs.readFileSync(sw.statePath(repo), 'utf8');
}

test('creates STATE.md with all required frontmatter keys', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'abc123' });
  const raw = readRaw(repo);
  assert.match(raw, /^state_version: 1$/m);
  assert.match(raw, /^task_fingerprint: abc123$/m);
  assert.match(raw, /^created_at: 20\d{2}-/m);
  assert.match(raw, /^updated_at: 20\d{2}-/m);
  assert.match(raw, /^last_event: precompact$/m);
  assert.match(raw, /^last_event_at: 20\d{2}-/m);
  assert.match(raw, /^unsafe_checkpoint: false$/m);
  assert.match(raw, /^confirm_required: false$/m);
});

test('read-modify-write preserves unspecified fields', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp1', goal: 'First goal', nextStep: 'Initial step' });
  const after1 = sw.readState(repo);
  assert.strictEqual(after1.body.goal, 'First goal');
  assert.strictEqual(after1.body.nextStep, 'Initial step');
  assert.strictEqual(after1.frontmatter.task_fingerprint, 'fp1');
  const createdAt = after1.frontmatter.created_at;

  sw.update(repo, { event: 'stop_loop_pass', lastDecision: 'New decision' });
  const after2 = sw.readState(repo);
  assert.strictEqual(after2.body.goal, 'First goal');
  assert.strictEqual(after2.body.nextStep, 'Initial step');
  assert.strictEqual(after2.body.lastDecision, 'New decision');
  assert.strictEqual(after2.frontmatter.task_fingerprint, 'fp1');
  assert.strictEqual(after2.frontmatter.created_at, createdAt);
  assert.strictEqual(after2.frontmatter.last_event, 'stop_loop_pass');
});

test('Goal > 3 lines truncates with ellipsis, no throw', () => {
  const repo = mkRepo();
  const overflow = 'line1\nline2\nline3\nline4\nline5';
  assert.doesNotThrow(() => sw.update(repo, { event: 'precompact', goal: overflow }));
  const state = sw.readState(repo);
  const goalLines = state.body.goal.split('\n');
  assert.ok(goalLines.length <= 4, 'goal exceeded 4 lines including ellipsis: ' + goalLines.length);
  assert.match(state.body.goal, /…$/);
});

test('body sections rendered in canonical order', () => {
  const repo = mkRepo();
  sw.update(repo, {
    event: 'precompact',
    goal: 'g',
    plan: ['p1'],
    done: ['d1'],
    inProgress: 'ip',
    nextStep: 'ns',
    lastDecision: 'ld',
    openQuestions: ['HIGH: q1'],
  });
  const raw = readRaw(repo);
  const expectedOrder = ['## Goal', '## Plan', '## Done', '## In Progress', '## Next Step', '## Last Decision', '## Open Questions', '## Last Updated'];
  let lastIdx = -1;
  for (const header of expectedOrder) {
    const idx = raw.indexOf(header);
    assert.ok(idx > lastIdx, header + ' out of order (idx=' + idx + ', last=' + lastIdx + ')');
    lastIdx = idx;
  }
});

test('CR-only, CRLF-only, and mixed line endings normalize without breaking body', () => {
  const repo = mkRepo();
  const inputs = [
    { tag: 'CR-only', text: 'a\rb\rc' },
    { tag: 'CRLF', text: 'a\r\nb\r\nc' },
    { tag: 'mixed', text: 'a\rb\r\nc\nd' },
  ];
  for (const { tag, text } of inputs) {
    sw.update(repo, { event: 'precompact', goal: text });
    const state = sw.readState(repo);
    assert.ok(state.body.goal.length > 0, tag + ' produced empty goal');
    assert.ok(!state.body.goal.includes('\r'), tag + ' leaked CR');
  }
});

test('concurrent updates serialize via lock', async () => {
  const repo = mkRepo();
  const promises = [
    Promise.resolve().then(() => sw.update(repo, { event: 'stop_loop_pass', taskFingerprint: 'a', goal: 'first' })),
    Promise.resolve().then(() => sw.update(repo, { event: 'receipt_write', taskFingerprint: 'b', goal: 'second' })),
  ];
  await Promise.all(promises);
  const final = sw.readState(repo);
  assert.ok(['a', 'b'].includes(final.frontmatter.task_fingerprint));
  assert.ok(['first', 'second'].includes(final.body.goal));
  assert.ok(['stop_loop_pass', 'receipt_write'].includes(final.frontmatter.last_event));
});

test('unsupported state_version resets state with warning', () => {
  const repo = mkRepo();
  const dir = path.dirname(sw.statePath(repo));
  fs.mkdirSync(dir, { recursive: true });
  const bogus = '---\nstate_version: 2\ntask_fingerprint: old\ncreated_at: 2020-01-01T00:00:00Z\nupdated_at: 2020-01-01T00:00:00Z\nlast_event: precompact\nlast_event_at: 2020-01-01T00:00:00Z\nunsafe_checkpoint: false\nconfirm_required: false\n---\n## Goal\nold goal\n';
  fs.writeFileSync(sw.statePath(repo), bogus, 'utf8');
  sw.update(repo, { event: 'precompact', taskFingerprint: 'new' });
  const after = sw.readState(repo);
  assert.strictEqual(after.frontmatter.task_fingerprint, 'new');
  assert.strictEqual(after.body.goal, '');
});

test('confirm_required toggle reflects in frontmatter', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', confirmRequired: true });
  let raw = readRaw(repo);
  assert.match(raw, /^confirm_required: true$/m);
  sw.update(repo, { event: 'precompact', confirmRequired: false });
  raw = readRaw(repo);
  assert.match(raw, /^confirm_required: false$/m);
});

// v0.2.2 Task 8 — new fields round-trip
test('session_end_imminent + chain_aborted round-trip', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', session_end_imminent: true });
  let raw = readRaw(repo);
  assert.match(raw, /^session_end_imminent: true$/m);
  assert.match(raw, /^chain_aborted: false$/m);
  sw.update(repo, { event: 'precompact', chain_aborted: true });
  raw = readRaw(repo);
  assert.match(raw, /^session_end_imminent: true$/m);
  assert.match(raw, /^chain_aborted: true$/m);
});

test('recordChainProgress appends step entries', () => {
  const repo = mkRepo();
  sw.recordChainProgress(repo, { step: 'commit', status: 'ok', receipt_path: '.claude/receipts/x.json' });
  sw.recordChainProgress(repo, { step: 'pr', status: 'failed' });
  const raw = readRaw(repo);
  assert.match(raw, /chain_progress: \|/);
  // chain_progress is a JSON serialization split across lines under YAML pipe;
  // join the body and parse as JSON to assert structure.
  const m = raw.match(/chain_progress: \|\s*\n((?:  .+\n)+)/);
  assert.ok(m, 'chain_progress block missing: ' + raw);
  const json = m[1].split('\n').map(l => l.replace(/^  /, '')).join('\n').trim();
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.steps.length, 2);
  assert.strictEqual(parsed.steps[0].step, 'commit');
  assert.strictEqual(parsed.steps[1].step, 'pr');
  assert.strictEqual(parsed.steps[1].status, 'failed');
});

// v0.2.3 — dep-check dedupe state round-trip
test('depCheck round-trip: writes dep_check_at + dep_check_missing, parses back', () => {
  const repo = mkRepo();
  sw.update(repo, {
    event: 'precompact',
    depCheck: {
      checkedAt: '2026-06-04T05:00:00.000Z',
      missing: ['codex_plugin', 'impeccable_cli'],
    },
  });
  const raw = readRaw(repo);
  assert.match(raw, /^dep_check_at: 2026-06-04T05:00:00\.000Z$/m);
  assert.match(raw, /^dep_check_missing: codex_plugin,impeccable_cli$/m);

  const reread = sw.readState(repo);
  assert.strictEqual(reread.frontmatter.dep_check_at, '2026-06-04T05:00:00.000Z');
  assert.strictEqual(reread.frontmatter.dep_check_missing, 'codex_plugin,impeccable_cli');
});

test('depCheck round-trip: empty missing list clears dep_check_missing', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', depCheck: { checkedAt: '2026-06-04T05:00:00.000Z', missing: ['codex_plugin'] } });
  let raw = readRaw(repo);
  assert.match(raw, /^dep_check_missing: codex_plugin$/m);

  sw.update(repo, { event: 'precompact', depCheck: { checkedAt: '2026-06-04T05:30:00.000Z', missing: [] } });
  raw = readRaw(repo);
  assert.ok(!/^dep_check_missing:/m.test(raw), 'dep_check_missing should be omitted when null');
  assert.match(raw, /^dep_check_at: 2026-06-04T05:30:00\.000Z$/m);
});

// v0.3.6 Task 4 (축 2) — STATE.md content-hash skip on update().
//
// Strategy: force a known past mtime with fs.utimesSync after the first write.
// If skip-on-equal works, the second call leaves mtime untouched. If anything
// were rewritten, mtime would jump to "now" (later than the forced past).

function setPastMtime(filePath, secondsAgo) {
  const t = (Date.now() / 1000) - secondsAgo;
  fs.utimesSync(filePath, t, t);
  return fs.statSync(filePath).mtimeMs;
}

test('v0.3.6 Task 4: contentSnapshot excludes the 3 timestamp fields', () => {
  const s = sw.emptyState();
  s.frontmatter.created_at = '2026-01-01T00:00:00Z';
  s.frontmatter.updated_at = '2026-01-01T00:00:00Z';
  s.frontmatter.last_event_at = '2026-01-01T00:00:00Z';
  const snap = sw.contentSnapshot(s);
  assert.strictEqual(snap.fm.created_at, undefined);
  assert.strictEqual(snap.fm.updated_at, undefined);
  assert.strictEqual(snap.fm.last_event_at, undefined);
  // last_event (the semantic name) IS preserved
  assert.strictEqual(snap.fm.last_event, 'precompact');
});

test('v0.3.6 Task 4: HASH_EXCLUDE_FRONTMATTER_KEYS exposes the 3 timestamp keys', () => {
  assert.ok(sw.HASH_EXCLUDE_FRONTMATTER_KEYS instanceof Set);
  assert.strictEqual(sw.HASH_EXCLUDE_FRONTMATTER_KEYS.size, 3);
  assert.ok(sw.HASH_EXCLUDE_FRONTMATTER_KEYS.has('updated_at'));
  assert.ok(sw.HASH_EXCLUDE_FRONTMATTER_KEYS.has('last_event_at'));
  assert.ok(sw.HASH_EXCLUDE_FRONTMATTER_KEYS.has('created_at'));
});

test('v0.3.6 Task 4: contentHash is deterministic and identical for snapshot-equal states', () => {
  const a = sw.emptyState();
  a.frontmatter.task_fingerprint = 'fp-equal';
  a.body.goal = 'identical goal';
  const b = sw.emptyState();
  b.frontmatter.task_fingerprint = 'fp-equal';
  b.frontmatter.updated_at = '2099-12-31T23:59:59Z'; // differs but excluded
  b.frontmatter.created_at = '1970-01-01T00:00:00Z'; // differs but excluded
  b.frontmatter.last_event_at = '2050-06-15T12:00:00Z'; // differs but excluded
  b.body.goal = 'identical goal';
  assert.strictEqual(sw.contentHash(a), sw.contentHash(b));
});

test('v0.3.6 Task 4: contentHash differs when last_event (semantic value) changes', () => {
  const a = sw.emptyState();
  a.frontmatter.last_event = 'precompact';
  const b = sw.emptyState();
  b.frontmatter.last_event = 'receipt_write';
  assert.notStrictEqual(sw.contentHash(a), sw.contentHash(b));
});

test('v0.3.6 Task 4: contentHash differs when body changes', () => {
  const a = sw.emptyState();
  a.body.goal = 'A';
  const b = sw.emptyState();
  b.body.goal = 'B';
  assert.notStrictEqual(sw.contentHash(a), sw.contentHash(b));
});

test('v0.3.6 Task 4: second update with identical content does NOT touch mtime', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-noise', goal: 'stable goal' });
  const target = sw.statePath(repo);
  // Set a known past mtime so any write would jump it forward.
  const pastMtime = setPastMtime(target, 60);
  // Same patch again — no semantic change.
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-noise', goal: 'stable goal' });
  const after = fs.statSync(target).mtimeMs;
  assert.strictEqual(after, pastMtime,
    'second update with semantic-equal patch must skip write (mtime unchanged)');
});

test('v0.3.6 Task 4: update with different last_event DOES write', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-evt', goal: 'g' });
  const target = sw.statePath(repo);
  const pastMtime = setPastMtime(target, 60);
  sw.update(repo, { event: 'receipt_write' });
  const after = fs.statSync(target).mtimeMs;
  assert.ok(after > pastMtime,
    'last_event change must write (mtime should advance from past): past=' +
    pastMtime + ' after=' + after);
});

test('v0.3.6 Task 4: update with body change DOES write', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-body', goal: 'first' });
  const target = sw.statePath(repo);
  const pastMtime = setPastMtime(target, 60);
  sw.update(repo, { event: 'precompact', goal: 'second' });
  const after = fs.statSync(target).mtimeMs;
  assert.ok(after > pastMtime, 'body change must write');
});

test('v0.3.6 Task 4: update with depCheck patch DOES write (dep_check_at is semantic)', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-dep', goal: 'g' });
  const target = sw.statePath(repo);
  const pastMtime = setPastMtime(target, 60);
  sw.update(repo, { event: 'precompact', depCheck: { checkedAt: '2026-06-09T12:00:00Z', missing: ['codex'] } });
  const after = fs.statSync(target).mtimeMs;
  assert.ok(after > pastMtime, 'dep_check_* update is semantically meaningful — must write');
});

test('v0.3.6 Task 4: update with escalate_pending=true DOES write', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-esc', goal: 'g' });
  const target = sw.statePath(repo);
  const pastMtime = setPastMtime(target, 60);
  sw.update(repo, { event: 'receipt_write', escalate_pending: true, escalate_pending_decision_id: 'slug-x' });
  const after = fs.statSync(target).mtimeMs;
  assert.ok(after > pastMtime, 'escalate_pending change must write');
});

test('v0.3.6 Task 4: first update when STATE.md absent always writes (creates file)', () => {
  const repo = mkRepo();
  const target = sw.statePath(repo);
  assert.strictEqual(fs.existsSync(target), false, 'precondition: file does not exist');
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-first' });
  assert.strictEqual(fs.existsSync(target), true, 'file must be created on first update');
});

test('v0.3.6 Task 4: skipped update still returns valid state (callers can read body/frontmatter)', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-ret', goal: 'returned goal' });
  // Set past mtime, call again with same patch.
  setPastMtime(sw.statePath(repo), 60);
  const result = sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-ret', goal: 'returned goal' });
  // Plan body: function returns existing on skip.
  assert.strictEqual(result.body.goal, 'returned goal');
  assert.strictEqual(result.frontmatter.task_fingerprint, 'fp-ret');
});

test('v0.3.2 escalate_pending round-trip: set, read, clear', () => {
  const repo = mkRepo();
  // Default state: no escalate_pending key in rendered output (conditional emit).
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp1' });
  let raw = readRaw(repo);
  assert.ok(!/^escalate_pending:/m.test(raw), 'escalate_pending omitted by default');

  // Set: emits both fields.
  sw.update(repo, { event: 'receipt_write', escalate_pending: true, escalate_pending_decision_id: 'v0-3-2-escalate' });
  raw = readRaw(repo);
  assert.match(raw, /^escalate_pending: true$/m);
  assert.match(raw, /^escalate_pending_decision_id: v0-3-2-escalate$/m);

  // Read back via parser preserves both fields.
  const reread = sw.readState(repo);
  assert.strictEqual(reread.frontmatter.escalate_pending, true);
  assert.strictEqual(reread.frontmatter.escalate_pending_decision_id, 'v0-3-2-escalate');

  // Clear: setting false (and explicit null id) drops the emit.
  sw.update(repo, { event: 'receipt_write', escalate_pending: false, escalate_pending_decision_id: null });
  raw = readRaw(repo);
  assert.ok(!/^escalate_pending:/m.test(raw), 'escalate_pending should be omitted when cleared');
  assert.ok(!/^escalate_pending_decision_id:/m.test(raw), 'decision_id should be omitted when cleared');
});

// v1.1.0 Stage 1 Task 1.5 (F2 absorption) — resume dispatch schema expansion.

test('v1.1.0 Task 1.5: resume_dispatching + resume_dispatched are first-class events (not downgraded)', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'resume_dispatching' });
  let raw = readRaw(repo);
  assert.match(raw, /^last_event: resume_dispatching$/m, 'resume_dispatching must persist verbatim (NOT downgrade to precompact)');

  sw.update(repo, { event: 'resume_dispatched' });
  raw = readRaw(repo);
  assert.match(raw, /^last_event: resume_dispatched$/m, 'resume_dispatched must persist verbatim');

  assert.ok(sw.VALID_EVENTS.has('resume_dispatching'), 'VALID_EVENTS exports resume_dispatching');
  assert.ok(sw.VALID_EVENTS.has('resume_dispatched'), 'VALID_EVENTS exports resume_dispatched');
});

test('v1.1.0 Task 1.5: unknown-event downgrade still fires for non-resume events', () => {
  const repo = mkRepo();
  // Confirm the downgrade path is still active — only resume events get the exemption.
  sw.update(repo, { event: 'totally_made_up' });
  const raw = readRaw(repo);
  assert.match(raw, /^last_event: precompact$/m, 'unknown event still downgrades to precompact');
});

test('v1.1.0 Task 1.5: dispatch_id + dispatch_id_completed + dispatch_attempt_count round-trip', () => {
  const repo = mkRepo();
  const dispatchId = 'd7f9c4a1-1234-4567-8901-abcdef012345';
  const completedId = 'cc4dca42-1111-2222-3333-444455556666';

  // Phase 1 patch — dispatch_id + attempt count.
  sw.update(repo, {
    event: 'resume_dispatching',
    dispatch_id: dispatchId,
    dispatch_attempt_count: 1,
  });
  let raw = readRaw(repo);
  assert.match(raw, new RegExp('^dispatch_id: ' + dispatchId + '$', 'm'));
  assert.match(raw, /^dispatch_attempt_count: 1$/m);
  assert.ok(!/^dispatch_id_completed:/m.test(raw), 'completed id not yet emitted');

  // Phase 2 patch — completed id.
  sw.update(repo, {
    event: 'resume_dispatched',
    dispatch_id_completed: completedId,
  });
  raw = readRaw(repo);
  assert.match(raw, new RegExp('^dispatch_id_completed: ' + completedId + '$', 'm'));

  // Parse back.
  const re = sw.readState(repo);
  assert.strictEqual(re.frontmatter.dispatch_id, dispatchId);
  assert.strictEqual(re.frontmatter.dispatch_id_completed, completedId);
  assert.strictEqual(re.frontmatter.dispatch_attempt_count, 1);
});

test('v1.1.0 Task 1.5: dispatch_attempt_count omitted when zero (default), emitted when > 0', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact' });
  let raw = readRaw(repo);
  assert.ok(!/^dispatch_attempt_count:/m.test(raw), 'count=0 must not render');

  sw.update(repo, { event: 'resume_dispatching', dispatch_attempt_count: 2 });
  raw = readRaw(repo);
  assert.match(raw, /^dispatch_attempt_count: 2$/m);
});

test('v1.1.0 Task 1.5: clearHandoff=true clears next_chunk + session_end_imminent (F1 absorption)', () => {
  const repo = mkRepo();
  // Stage handoff_spawn signal.
  sw.update(repo, {
    event: 'handoff_spawn',
    nextChunk: 'Resume from soft-ceiling handoff. Continue task X.',
    sessionEndImminent: true,
  });
  let state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.session_end_imminent, true);
  assert.match(state.frontmatter.next_chunk, /Resume from soft-ceiling/);

  // Phase 2 success path — explicit clearHandoff.
  sw.update(repo, {
    event: 'resume_dispatched',
    dispatch_id_completed: 'aabbccdd-eeff-1122-3344-556677889900',
    clearHandoff: true,
  });
  state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.session_end_imminent, false,
    'session_end_imminent must be cleared by clearHandoff=true');
  assert.strictEqual(state.frontmatter.next_chunk, null,
    'next_chunk must be cleared by clearHandoff=true');
});

test('v1.1.0 Task 1.5: clearHandoff omitted (default) preserves handoff_spawn signal', () => {
  const repo = mkRepo();
  sw.update(repo, {
    event: 'handoff_spawn',
    nextChunk: 'Resume from hard-ceiling handoff.',
    sessionEndImminent: true,
  });
  // Phase 1 marker — should NOT touch handoff fields.
  sw.update(repo, {
    event: 'resume_dispatching',
    dispatch_id: '11111111-2222-3333-4444-555555555555',
    dispatch_attempt_count: 1,
  });
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.session_end_imminent, true,
    'phase 1 must preserve session_end_imminent (no clearHandoff)');
  assert.match(state.frontmatter.next_chunk, /hard-ceiling/,
    'phase 1 must preserve next_chunk (no clearHandoff)');
});

test('v1.1.0 Task 1.5: clearHandoff=false (explicit) also preserves handoff_spawn signal', () => {
  const repo = mkRepo();
  sw.update(repo, {
    event: 'handoff_spawn',
    nextChunk: 'pending',
    sessionEndImminent: true,
  });
  // Phase 1 might write clearHandoff: false explicitly — guard against that path
  // accidentally clearing.
  sw.update(repo, { event: 'resume_dispatching', clearHandoff: false });
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.session_end_imminent, true);
  assert.strictEqual(state.frontmatter.next_chunk, 'pending');
});

// v1.2.0-m1 Task 8 — orchestrator controller event + patch field tests.

test('v1.2.0 Task 8: dispatch_started event survives unknown-downgrade', function () {
  const repo = mkRepo();
  sw.update(repo, { event: 'dispatch_started', taskFingerprint: 'fp1' });
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.last_event, 'dispatch_started');
});

test('v1.2.0 Task 8: dispatch_envelope_received event survives unknown-downgrade', function () {
  const repo = mkRepo();
  sw.update(repo, { event: 'dispatch_envelope_received', taskFingerprint: 'fp1' });
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.last_event, 'dispatch_envelope_received');
});

test('v1.2.0 Task 8: dispatch_chain_aborted event survives + pairs with chain_aborted=true', function () {
  const repo = mkRepo();
  sw.update(repo, {
    event: 'dispatch_chain_aborted',
    taskFingerprint: 'fp1',
    chain_aborted: true,
  });
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.last_event, 'dispatch_chain_aborted');
  assert.strictEqual(state.frontmatter.chain_aborted, true);
});

test('v1.2.0 Task 8: unknown dispatch_* event still downgrades to precompact', function () {
  const repo = mkRepo();
  sw.update(repo, { event: 'dispatch_made_up', taskFingerprint: 'fp1' });
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.last_event, 'precompact');
});

test('v1.2.0 Task 8: controller_session_id round-trips through render/parse', function () {
  const repo = mkRepo();
  const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  sw.update(repo, {
    event: 'dispatch_started',
    taskFingerprint: 'fp1',
    controller_session_id: uuid,
    active_dispatch_count: 3,
  });
  const raw = readRaw(repo);
  assert.match(raw, new RegExp('^controller_session_id: ' + uuid + '$', 'm'));
  assert.match(raw, /^active_dispatch_count: 3$/m);
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.controller_session_id, uuid);
  assert.strictEqual(state.frontmatter.active_dispatch_count, 3);
});

test('v1.2.0 Task 8: active_dispatch_count=0 is NOT rendered (conditional emit)', function () {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp1' });
  const raw = readRaw(repo);
  assert.doesNotMatch(raw, /^active_dispatch_count:/m);
});

test('v1.2.0 Task 8: controller_session_id=null is NOT rendered (conditional emit)', function () {
  const repo = mkRepo();
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp1' });
  const raw = readRaw(repo);
  assert.doesNotMatch(raw, /^controller_session_id:/m);
});

test('v1.2.0 Task 8: camelCase + snake_case aliases both accepted for controller patches', function () {
  const repo = mkRepo();
  const uuid = '11111111-2222-3333-4444-555555555555';
  sw.update(repo, {
    event: 'dispatch_started',
    taskFingerprint: 'fp1',
    controllerSessionId: uuid,
    activeDispatchCount: 2,
  });
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.controller_session_id, uuid);
  assert.strictEqual(state.frontmatter.active_dispatch_count, 2);
});

test('v1.2.0 Task 8: active_dispatch_count rejects negative — clamps to 0', function () {
  const repo = mkRepo();
  sw.update(repo, {
    event: 'precompact',
    taskFingerprint: 'fp1',
    active_dispatch_count: -5,
  });
  const state = sw.readState(repo);
  assert.strictEqual(state.frontmatter.active_dispatch_count, 0);
});

test('v1.2.0 Task 8: VALID_EVENTS export includes 3 new events', function () {
  assert.ok(sw.VALID_EVENTS.has('dispatch_started'));
  assert.ok(sw.VALID_EVENTS.has('dispatch_envelope_received'));
  assert.ok(sw.VALID_EVENTS.has('dispatch_chain_aborted'));
});
