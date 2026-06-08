'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const inj = require('../state-injector');
const sw = require('../state-writer');
const ft = require('../fix-task');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-state-injector-'));
}

function writeValidState(repo, overrides) {
  return sw.update(repo, Object.assign({
    event: 'precompact',
    taskFingerprint: 'abc123',
    goal: 'restored goal',
    nextStep: 'continue from prior session',
  }, overrides || {}));
}

function writeValidFixTask(repo) {
  return ft.write(repo, {
    verdict: 'quality_fail',
    counter: 1,
    failures: [{ stage: 'test', exitCode: 1, excerpt: 'failing' }],
  });
}

test('skip matrix 1: missing STATE.md + missing fix-task → empty stdout', () => {
  const repo = mkRepo();
  const result = inj.inject(repo);
  assert.strictEqual(result.stdout, '');
  assert.strictEqual(result.applied.state, false);
  assert.strictEqual(result.applied.fixTask, false);
});

test('skip matrix 2: missing STATE.md + present fix-task → fix-task content but inject() does NOT rotate (Codex finding: consume-without-deliver)', () => {
  const repo = mkRepo();
  writeValidFixTask(repo);
  const result = inj.inject(repo);
  assert.strictEqual(result.applied.state, false);
  assert.strictEqual(result.applied.fixTask, true);
  assert.match(result.stdout, /\[mccp:fix-task — pending correction/);
  assert.ok(fs.existsSync(inj.fixTaskPath(repo)), 'fix-task.md MUST remain after inject (rotation deferred to caller)');
  assert.ok(!fs.existsSync(inj.appliedPath(repo)), 'fix-task-applied.md MUST NOT exist after inject alone');
});

test('skip matrix 3: valid STATE.md + missing fix-task → STATE only', () => {
  const repo = mkRepo();
  writeValidState(repo);
  const result = inj.inject(repo);
  assert.strictEqual(result.applied.state, true);
  assert.strictEqual(result.applied.fixTask, false);
  assert.match(result.stdout, /\[mccp:STATE\.md — restored/);
  assert.ok(!result.stdout.includes('[mccp:fix-task'), 'should not mention fix-task');
});

test('skip matrix 4: both present → STATE first, then fix-task', () => {
  const repo = mkRepo();
  writeValidState(repo);
  writeValidFixTask(repo);
  const result = inj.inject(repo);
  assert.strictEqual(result.applied.state, true);
  assert.strictEqual(result.applied.fixTask, true);
  const stateIdx = result.stdout.indexOf('[mccp:STATE.md');
  const fixIdx = result.stdout.indexOf('[mccp:fix-task');
  assert.ok(stateIdx >= 0 && fixIdx > stateIdx, 'STATE.md must be injected before fix-task');
});

test('skip matrix 5: STATE.md with unsupported version → STATE skip, fix-task still processed', () => {
  const repo = mkRepo();
  const dir = path.dirname(inj.statePath(repo));
  fs.mkdirSync(dir, { recursive: true });
  const bogus = '---\nstate_version: 9\ntask_fingerprint: x\ncreated_at: 2020-01-01T00:00:00Z\nupdated_at: 2020-01-01T00:00:00Z\nlast_event: precompact\nlast_event_at: 2020-01-01T00:00:00Z\nunsafe_checkpoint: false\nconfirm_required: false\n---\n## Goal\nold\n';
  fs.writeFileSync(inj.statePath(repo), bogus, 'utf8');
  writeValidFixTask(repo);
  const result = inj.inject(repo);
  assert.strictEqual(result.applied.state, false);
  assert.match(result.applied.stateSkip || '', /unsupported state_version/);
  assert.strictEqual(result.applied.fixTask, true);
});

test('skip matrix 6: STATE.md missing required key → STATE skip, fix-task still processed', () => {
  const repo = mkRepo();
  const dir = path.dirname(inj.statePath(repo));
  fs.mkdirSync(dir, { recursive: true });
  const partial = '---\nstate_version: 1\ncreated_at: 2026-06-04T00:00:00Z\n---\n## Goal\npartial\n';
  fs.writeFileSync(inj.statePath(repo), partial, 'utf8');
  writeValidFixTask(repo);
  const result = inj.inject(repo);
  assert.strictEqual(result.applied.state, false);
  assert.match(result.applied.stateSkip || '', /required key missing/);
  assert.strictEqual(result.applied.fixTask, true);
});

test('skip matrix 7: STATE.md corrupt frontmatter → STATE skip, fix-task still processed', () => {
  const repo = mkRepo();
  const dir = path.dirname(inj.statePath(repo));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(inj.statePath(repo), 'no frontmatter here\njust body\n', 'utf8');
  writeValidFixTask(repo);
  const result = inj.inject(repo);
  assert.strictEqual(result.applied.state, false);
  assert.match(result.applied.stateSkip || '', /frontmatter/);
  assert.strictEqual(result.applied.fixTask, true);
});

test('7-day sweep unlinks stale fix-task-applied.md', () => {
  const repo = mkRepo();
  const dir = path.dirname(inj.appliedPath(repo));
  fs.mkdirSync(dir, { recursive: true });
  const applied = inj.appliedPath(repo);
  fs.writeFileSync(applied, 'stale', 'utf8');
  const past = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(applied, past, past);
  const result = inj.inject(repo);
  assert.strictEqual(result.applied.sweep, true);
  assert.ok(!fs.existsSync(applied), 'stale fix-task-applied.md should be unlinked');
});

test('fix-task rotate happens only when commitFixTaskApplied is called explicitly', () => {
  const repo = mkRepo();
  writeValidFixTask(repo);
  assert.ok(fs.existsSync(inj.fixTaskPath(repo)));
  assert.ok(!fs.existsSync(inj.appliedPath(repo)));
  inj.inject(repo);
  assert.ok(fs.existsSync(inj.fixTaskPath(repo)), 'inject alone must NOT consume fix-task');
  inj.commitFixTaskApplied(repo);
  assert.ok(!fs.existsSync(inj.fixTaskPath(repo)), 'commit should rotate fix-task.md away');
  assert.ok(fs.existsSync(inj.appliedPath(repo)), 'commit should create fix-task-applied.md');
});

test('commitFixTaskApplied is idempotent — calling without pending fix-task is a no-op', () => {
  const repo = mkRepo();
  const result1 = inj.commitFixTaskApplied(repo);
  assert.strictEqual(result1, false, 'commit on empty state returns false');
  writeValidFixTask(repo);
  const result2 = inj.commitFixTaskApplied(repo);
  assert.strictEqual(result2, true, 'commit on present fix-task rotates and returns true');
  const result3 = inj.commitFixTaskApplied(repo);
  assert.strictEqual(result3, false, 'second commit (already rotated) returns false');
});

test('redelivery on stdout failure — re-running inject() after no commit re-emits fix-task', () => {
  const repo = mkRepo();
  writeValidFixTask(repo);
  const first = inj.inject(repo);
  assert.strictEqual(first.applied.fixTask, true);
  // Simulate caller crash: do NOT call commit. fix-task.md is still present.
  const second = inj.inject(repo);
  assert.strictEqual(second.applied.fixTask, true, 'fix-task must be re-deliverable until commit');
  assert.match(second.stdout, /\[mccp:fix-task — pending correction/);
});

test('fix-task block carries both HEAD and TAIL sentinel markers (partial-delivery guard)', () => {
  const repo = mkRepo();
  writeValidFixTask(repo);
  const result = inj.inject(repo);
  assert.ok(result.stdout.includes(inj.FIX_TASK_HEAD_MARKER), 'HEAD marker must appear');
  assert.ok(result.stdout.includes(inj.FIX_TASK_TAIL_MARKER), 'TAIL marker must appear');
  const headIdx = result.stdout.indexOf(inj.FIX_TASK_HEAD_MARKER);
  const tailIdx = result.stdout.indexOf(inj.FIX_TASK_TAIL_MARKER);
  assert.ok(headIdx < tailIdx, 'TAIL must come after HEAD');
  // Mid-body prefix slice keeps HEAD but drops TAIL — this is exactly the
  // condition the SessionStart guard must reject before rotating.
  const midSlice = result.stdout.slice(0, headIdx + inj.FIX_TASK_HEAD_MARKER.length + 5);
  assert.ok(midSlice.includes(inj.FIX_TASK_HEAD_MARKER), 'prefix slice keeps HEAD');
  assert.ok(!midSlice.includes(inj.FIX_TASK_TAIL_MARKER), 'prefix slice drops TAIL');
});

// v0.3.2 / S12 — escalate_pending injects the ## Escalation Pending section.
test('v0.3.2 escalate_pending=true injects ## Escalation Pending section in STATE block', () => {
  const repo = mkRepo();
  writeValidState(repo, {
    escalate_pending: true,
    escalate_pending_decision_id: 'v0-3-2-escalate',
  });
  const result = inj.inject(repo);
  assert.strictEqual(result.applied.state, true);
  assert.match(result.stdout, /## Escalation Pending/);
  assert.match(result.stdout, /- decision: v0-3-2-escalate/);
  assert.match(result.stdout, /- Next: \/mccp:santa-loop/);
  // Section must live inside the STATE block, not inside fix-task.
  const escalateIdx = result.stdout.indexOf('## Escalation Pending');
  const stateBlockEnd = result.stdout.indexOf('</system-reminder>');
  assert.ok(escalateIdx > 0 && escalateIdx < stateBlockEnd,
    'Escalation Pending must appear inside the STATE system-reminder block');
});

test('v0.3.2 escalate_pending=false (default) does NOT inject Escalation Pending section', () => {
  const repo = mkRepo();
  writeValidState(repo);
  const result = inj.inject(repo);
  assert.strictEqual(result.applied.state, true);
  assert.ok(!result.stdout.includes('## Escalation Pending'),
    'Escalation Pending section must be absent by default');
});
