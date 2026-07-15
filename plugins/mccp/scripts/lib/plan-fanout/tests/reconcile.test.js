'use strict';

// plan-fanout reconcile oracle validate — M3 follow-up (PR-Codex R1 F2).
//
// The bug: plan.md passed `--actual "${FANOUT_ACTUAL_N:-$RES_GRANTED}"`, where
// FANOUT_ACTUAL_N was a shell var the LLM had to set after reading the Workflow
// result. The rows the table calls ZERO (in-sandbox budget skip, Workflow never
// invoked) are exactly the ones where the model never reaches that step, so the
// default COMMITTED the full grant as if the fleet had run. Committed entries leave
// open[] and are not lease-expirable → a PERMANENT phantom, reproducing the very
// problem the two-phase reservation removed.
//
// The fix moves the mapping into code and makes "unknown" return null (skip the
// reconcile, leave it pending) rather than guess.

const test = require('node:test');
const assert = require('node:assert/strict');

const { deriveFanoutActualN } = require('../reconcile');

test('skipped:true (in-sandbox budget pre-guard) → 0 — the script spawns nothing', function () {
  const d = deriveFanoutActualN({ result: { invoked: true, skipped: true, coverage: 0 }, granted: 4 });
  assert.deepEqual(d, { actualN: 0, reason: 'sandbox-budget-skip' });
});

test('invoked:false (Workflow unavailable / never called) → 0', function () {
  assert.equal(deriveFanoutActualN({ result: { invoked: false }, granted: 4 }).actualN, 0);
});

test('coverage > 0 → granted (the fleet ran)', function () {
  const d = deriveFanoutActualN({ result: { invoked: true, skipped: false, coverage: 4 }, granted: 4 });
  assert.deepEqual(d, { actualN: 4, reason: 'fleet-ran' });
});

test('coverage 0 / throw → granted (agents may have spawned then failed)', function () {
  // Over-count is the safe direction: the lease can reclaim a stale pending entry,
  // but nothing can rescue an under-count once it is committed.
  const d = deriveFanoutActualN({ result: { invoked: true, skipped: false, coverage: 0 }, granted: 4 });
  assert.deepEqual(d, { actualN: 4, reason: 'conservative-unknown-outcome' });
});

test('a degraded grant is honored, not assumed to be the full fleet', function () {
  assert.equal(deriveFanoutActualN({ result: { invoked: true, coverage: 2 }, granted: 2 }).actualN, 2);
});

// THE F2 REGRESSION. Absent artifact must NOT resolve to a count — that is what
// the `:-$RES_GRANTED` default did, permanently committing phantoms.
test('R1 F2: no artifact → null (skip the reconcile; pending self-heals via the lease)', function () {
  assert.equal(deriveFanoutActualN({ result: null, granted: 4 }), null);
  assert.equal(deriveFanoutActualN({ granted: 4 }), null);
  assert.equal(deriveFanoutActualN({ result: 'not-an-object', granted: 4 }), null);
  assert.equal(deriveFanoutActualN({}), null);
});

// And null must not be mistaken for zero: guessing 0 would UNDER-count a real
// launch, leaving the cap over-permissive — the one direction it must never err in.
test('R1 F2: unknown is null, NOT 0 (0 would under-count a real launch)', function () {
  assert.notEqual(deriveFanoutActualN({ result: null, granted: 4 }), 0);
});

test('granted falls back to 1 when unusable', function () {
  assert.equal(deriveFanoutActualN({ result: { invoked: true, coverage: 1 } }).actualN, 1);
  assert.equal(deriveFanoutActualN({ result: { invoked: true, coverage: 1 }, granted: -3 }).actualN, 1);
});
