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
