'use strict';

const test = require('node:test');
const assert = require('node:assert');

const sr = require('../state-resumption');

// Deterministic UUID generator for dispatch() injection — every test that
// expects a specific dispatchId in the result uses this.
function fixedUuid(value) {
  return function () { return value; };
}

function mkState(frontmatterOverrides) {
  return {
    frontmatter: Object.assign({
      state_version: 1,
      task_fingerprint: 'fp-test',
      last_event: 'handoff_spawn',
      unsafe_checkpoint: false,
      next_chunk: 'pending resume',
      session_end_imminent: true,
      dispatch_id: null,
      dispatch_id_completed: null,
      dispatch_attempt_count: 0,
    }, frontmatterOverrides || {}),
    body: {
      goal: '',
      plan: [],
      done: [],
      inProgress: '',
      nextStep: '',
      lastDecision: '',
      openQuestions: [],
    },
  };
}

// ─── 6 dispatch-table rows (from plan §Task 3) ───

test('Row 1: handoff_spawn + unsafe=false → /mccp:work --resume task=<fp>', () => {
  const state = mkState({ task_fingerprint: 'graceful-fp', unsafe_checkpoint: false });
  const r = sr.dispatch(state, { uuid: fixedUuid('uuid-row1') });
  assert.strictEqual(r.command, '/mccp:work');
  assert.strictEqual(r.args, '--resume task=graceful-fp');
  assert.strictEqual(r.shouldClearOnSuccess, true,
    'graceful handoff success path must clear on success');
  assert.strictEqual(r.dispatchId, 'uuid-row1');
  assert.strictEqual(r.attemptCount, 1);
});

test('Row 2: handoff_spawn + unsafe=true + fix-task pending → /mccp:prp-implement --apply-fix-task', () => {
  const state = mkState({ unsafe_checkpoint: true, task_fingerprint: 'unsafe-fp' });
  const r = sr.dispatch(state, { uuid: fixedUuid('uuid-row2'), fixTaskPending: true });
  assert.strictEqual(r.command, '/mccp:prp-implement');
  assert.strictEqual(r.args, '--apply-fix-task');
  assert.strictEqual(r.shouldClearOnSuccess, true);
  assert.strictEqual(r.dispatchId, 'uuid-row2');
  assert.strictEqual(r.attemptCount, 1);
});

test('Row 3: handoff_spawn + unsafe=true + no fix-task → /mccp:work --resume --unsafe-checkpoint task=<fp>', () => {
  const state = mkState({ unsafe_checkpoint: true, task_fingerprint: 'unsafe-no-fix-fp' });
  const r = sr.dispatch(state, { uuid: fixedUuid('uuid-row3'), fixTaskPending: false });
  assert.strictEqual(r.command, '/mccp:work');
  assert.strictEqual(r.args, '--resume --unsafe-checkpoint task=unsafe-no-fix-fp');
  assert.strictEqual(r.shouldClearOnSuccess, true);
  assert.strictEqual(r.dispatchId, 'uuid-row3');
  assert.strictEqual(r.attemptCount, 1);
});

test('Row 4: resume_dispatching + attempt=1 → in-flight sentinel', () => {
  const state = mkState({
    last_event: 'resume_dispatching',
    dispatch_id: 'existing-uuid-abc',
    dispatch_attempt_count: 1,
  });
  const r = sr.dispatch(state, { uuid: fixedUuid('should-not-be-used') });
  assert.strictEqual(r.command, 'in-flight');
  assert.strictEqual(r.args, null);
  assert.strictEqual(r.shouldClearOnSuccess, false,
    'in-flight guard must NOT clear handoff signal');
  assert.strictEqual(r.dispatchId, 'existing-uuid-abc',
    'in-flight must reuse existing dispatch_id (not generate new)');
  assert.strictEqual(r.attemptCount, 1);
  assert.match(r.reason, /already dispatching/);
  assert.match(r.reason, /attempt: 1\/3/);
});

test('Row 5: resume_dispatching + attempt>=3 → resume_giveup sentinel + signal preserved', () => {
  const state = mkState({
    last_event: 'resume_dispatching',
    dispatch_id: 'stuck-uuid',
    dispatch_attempt_count: 3,
  });
  const r = sr.dispatch(state);
  assert.strictEqual(r.command, 'resume_giveup');
  assert.strictEqual(r.args, null);
  assert.strictEqual(r.shouldClearOnSuccess, false,
    'giveup MUST NOT auto-clear handoff signal — user must intervene');
  assert.strictEqual(r.dispatchId, 'stuck-uuid');
  assert.strictEqual(r.attemptCount, 3);
  assert.match(r.reason, /handoff_spawn signal preserved/);
});

test('Row 6a: last_event=resume_dispatched → noop (idempotency)', () => {
  const state = mkState({ last_event: 'resume_dispatched' });
  const r = sr.dispatch(state);
  assert.strictEqual(r.command, 'noop');
  assert.strictEqual(r.args, null);
  assert.strictEqual(r.shouldClearOnSuccess, false);
  assert.match(r.reason, /previous resume completed/);
});

test('Row 6b: last_event=precompact (no handoff) → noop', () => {
  const state = mkState({ last_event: 'precompact' });
  const r = sr.dispatch(state);
  assert.strictEqual(r.command, 'noop');
  assert.match(r.reason, /no handoff_spawn signal/);
});

// ─── F1 absorption: failure-window regression ───

test('F1: resume_dispatching + attempt=2 → in-flight (under cap)', () => {
  const state = mkState({
    last_event: 'resume_dispatching',
    dispatch_id: 'mid-uuid',
    dispatch_attempt_count: 2,
  });
  const r = sr.dispatch(state);
  assert.strictEqual(r.command, 'in-flight');
  assert.match(r.reason, /attempt: 2\/3/);
});

test('F1: resume_dispatching + attempt=4 (overflow) → resume_giveup', () => {
  const state = mkState({
    last_event: 'resume_dispatching',
    dispatch_id: 'overflow-uuid',
    dispatch_attempt_count: 4,
  });
  const r = sr.dispatch(state);
  assert.strictEqual(r.command, 'resume_giveup',
    'attempt count >= GIVEUP_AFTER (3) must trigger giveup, not in-flight');
});

// ─── F1 absorption: handoff signal preservation invariant ───

test('F1: shouldClearOnSuccess=true ONLY for handoff_spawn dispatch rows', () => {
  // Sweep all 6 rows; only rows 1-3 (handoff_spawn) should have shouldClearOnSuccess=true.
  const cases = [
    { state: mkState({ last_event: 'handoff_spawn', unsafe_checkpoint: false }), expected: true },
    { state: mkState({ last_event: 'handoff_spawn', unsafe_checkpoint: true }), expected: true, fixTask: true },
    { state: mkState({ last_event: 'handoff_spawn', unsafe_checkpoint: true }), expected: true, fixTask: false },
    { state: mkState({ last_event: 'resume_dispatching', dispatch_attempt_count: 1 }), expected: false },
    { state: mkState({ last_event: 'resume_dispatching', dispatch_attempt_count: 3 }), expected: false },
    { state: mkState({ last_event: 'resume_dispatched' }), expected: false },
    { state: mkState({ last_event: 'precompact' }), expected: false },
  ];
  for (const c of cases) {
    const r = sr.dispatch(c.state, { uuid: fixedUuid('x'), fixTaskPending: !!c.fixTask });
    assert.strictEqual(r.shouldClearOnSuccess, c.expected,
      'last_event=' + c.state.frontmatter.last_event +
      ' attempt=' + c.state.frontmatter.dispatch_attempt_count +
      ' expected shouldClearOnSuccess=' + c.expected);
  }
});

// ─── Malformed input — graceful, no throw ───

test('Malformed: null state → noop, no throw', () => {
  let r;
  assert.doesNotThrow(() => { r = sr.dispatch(null); });
  assert.strictEqual(r.command, 'noop');
  assert.match(r.reason, /no STATE.md frontmatter/);
});

test('Malformed: undefined state → noop', () => {
  const r = sr.dispatch(undefined);
  assert.strictEqual(r.command, 'noop');
});

test('Malformed: state without frontmatter → noop', () => {
  const r = sr.dispatch({ body: {} });
  assert.strictEqual(r.command, 'noop');
});

test('Malformed: handoff_spawn with no task_fingerprint → falls back to "unknown"', () => {
  const state = mkState({ task_fingerprint: null });
  const r = sr.dispatch(state, { uuid: fixedUuid('uuid-unknown-fp') });
  assert.strictEqual(r.args, '--resume task=unknown');
});

test('Malformed: dispatch_attempt_count non-numeric → treated as 0', () => {
  const state = mkState({
    last_event: 'resume_dispatching',
    dispatch_attempt_count: 'not-a-number',
  });
  const r = sr.dispatch(state);
  // 0 < 3 → in-flight (NOT giveup)
  assert.strictEqual(r.command, 'in-flight');
  assert.strictEqual(r.attemptCount, 0);
});

// PR #27 review M2: Number.isFinite + >= 0 guard against hand-edited STATE.md.
// Without the guard, `Number(x) || 0` lets Infinity and negative values through
// and `>= GIVEUP_AFTER` evaluates to false on NaN/non-finite, locking the
// session in `in-flight` forever.
test('M2 guard: dispatch_attempt_count=Infinity → treated as 0 (not giveup)', () => {
  const state = mkState({
    last_event: 'resume_dispatching',
    dispatch_attempt_count: Infinity,
  });
  const r = sr.dispatch(state);
  assert.strictEqual(r.command, 'in-flight',
    'Infinity must normalize to 0 — anything else lets a hand-edit DoS the resume entry');
  assert.strictEqual(r.attemptCount, 0);
});

test('M2 guard: dispatch_attempt_count=-1 → treated as 0', () => {
  const state = mkState({
    last_event: 'resume_dispatching',
    dispatch_attempt_count: -1,
  });
  const r = sr.dispatch(state);
  assert.strictEqual(r.command, 'in-flight');
  assert.strictEqual(r.attemptCount, 0);
});

test('M2 guard: dispatch_attempt_count=2.7 → floored to 2 (still in-flight)', () => {
  const state = mkState({
    last_event: 'resume_dispatching',
    dispatch_attempt_count: 2.7,
  });
  const r = sr.dispatch(state);
  assert.strictEqual(r.command, 'in-flight',
    'fractional counts must floor — never round up past the giveup cap');
  assert.strictEqual(r.attemptCount, 2);
});

// ─── Idempotency property ───

test('Idempotency: dispatch() is referentially transparent given same state + opts', () => {
  const state = mkState({ unsafe_checkpoint: false, task_fingerprint: 'idem-fp' });
  const r1 = sr.dispatch(state, { uuid: fixedUuid('uuid-idem') });
  const r2 = sr.dispatch(state, { uuid: fixedUuid('uuid-idem') });
  assert.deepStrictEqual(r1, r2,
    'pure helper: same input must yield identical output across calls');
});

test('Idempotency: resume_dispatched → repeated dispatch() → still noop', () => {
  const state = mkState({ last_event: 'resume_dispatched' });
  for (let i = 0; i < 5; i++) {
    const r = sr.dispatch(state);
    assert.strictEqual(r.command, 'noop');
  }
});

// ─── GIVEUP_AFTER export ───

test('GIVEUP_AFTER export is 3', () => {
  assert.strictEqual(sr.GIVEUP_AFTER, 3);
});
