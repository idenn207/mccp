'use strict';

// v0.4.0 axis H — state-writer `plan_conflict_escalated` event.
//
// Two cases per plan §"state-writer-plan-conflict-event.test.js":
//   1. valid event: update(repo, {event, chainAborted, openQuestions}) →
//      STATE.md frontmatter records last_event=plan_conflict_escalated +
//      chain_aborted=true. Content-hash skip MUST NOT apply (event change is
//      a semantic delta; disk write actually happens).
//   2. typo fallback: update(repo, {event: 'plan_conflict'}) → stderr warning
//      + last_event falls back to 'precompact'.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sw = require('../state-writer');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-state-pc-'));
}

test('VALID_EVENTS includes plan_conflict_escalated', () => {
  assert.equal(sw.VALID_EVENTS.has('plan_conflict_escalated'), true);
});

test('plan_conflict_escalated event records last_event + chain_aborted=true (semantic write)', () => {
  const repo = mkRepo();

  // Initial state — establish a baseline so the second update's hash differs.
  sw.update(repo, { event: 'precompact', taskFingerprint: 'fp-axis-h' });
  const firstMtime = fs.statSync(sw.statePath(repo)).mtimeMs;

  // Force a sub-second gap so mtime comparison is reliable across fast filesystems.
  const start = Date.now();
  while (Date.now() - start < 10) { /* spin */ }

  const result = sw.update(repo, {
    event: 'plan_conflict_escalated',
    chainAborted: true,
    openQuestions: ['plan-implement conflict — see .claude/state/fix-task.md'],
  });

  assert.equal(result.frontmatter.last_event, 'plan_conflict_escalated');
  assert.equal(result.frontmatter.chain_aborted, true);
  assert.ok(
    result.body.openQuestions.some(q => /plan-implement conflict/.test(q)),
    'open_questions must include the escalation pointer'
  );

  const raw = fs.readFileSync(sw.statePath(repo), 'utf8');
  assert.match(raw, /^last_event: plan_conflict_escalated$/m);
  assert.match(raw, /^chain_aborted: true$/m);
  assert.match(raw, /plan-implement conflict/);

  // Content-hash skip MUST NOT swallow this update — event is a semantic change.
  const secondMtime = fs.statSync(sw.statePath(repo)).mtimeMs;
  assert.notEqual(secondMtime, firstMtime, 'disk write must occur for semantic event change');
});

test('unknown event "plan_conflict" (typo) falls back to precompact with stderr warning', () => {
  const repo = mkRepo();
  const origWrite = process.stderr.write;
  let captured = '';
  process.stderr.write = function (s) { captured += String(s); return true; };
  try {
    const result = sw.update(repo, { event: 'plan_conflict' });
    assert.equal(result.frontmatter.last_event, 'precompact');
  } finally {
    process.stderr.write = origWrite;
  }
  assert.match(captured, /unknown event "plan_conflict"/);
});

test('chain_aborted=true paired with plan_conflict_escalated is preserved on subsequent unrelated updates', () => {
  const repo = mkRepo();
  sw.update(repo, { event: 'plan_conflict_escalated', chainAborted: true });
  // unrelated update — should preserve chain_aborted=true
  const after = sw.update(repo, { event: 'precompact', goal: 'something' });
  assert.equal(after.frontmatter.chain_aborted, true,
    'chain_aborted must survive an unrelated patch (only explicit chainAborted:false clears it)');
});
