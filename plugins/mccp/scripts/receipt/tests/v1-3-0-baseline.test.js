'use strict';

// v1.3.0-m0 Task 3 — receipt schema baseline tests.
//
// Pin the read-side invariants the v1.3 derive engine (M1+) will rely on:
//   1. Backward-compat read tolerance: receipts written before v1.2.0-m1
//      controller attribution still validate (so derive can read historical
//      receipts without false rejections).
//   2. v1.2.0-m1 controller attribution all-or-nothing invariant
//      (marker=true ⇒ all 3 fields require + format-valid; marker=false ⇒
//      none set; partial state rejects regardless).
//   3. v0.3.5 3-way codex skip mutex (dedupe ∩ skipped ∩ disabled = ∅).
//   4. v1.0.1 pr_phase_lock_stale_reclaimed_at_hook is optional boolean.
//
// Codex Plan-Codex R1 F2 absorption note: these tests do NOT assert that
// arbitrary writer-injected unknown `meta` keys (e.g. meta.briefing_summary,
// meta.totally_made_up_field) pass validation as an intentional contract.
// Today's hand validate() silently ignores unknown meta keys because the
// validator iterates the known list rather than scanning all keys; this is
// a *backward-compat read* property (old receipts pass after schema bumps
// add new fields), NOT a *forward-compat writer contract*. M2 MUST add
// explicit meta.briefing_summary (+ briefing_token_count + briefing_invocation_count)
// declarations to schema.js BEFORE any write path stamps them — per the
// plan's own "Forward-compat policy" in schema-surface.md §6.

const test = require('node:test');
const assert = require('node:assert');
const { validate, makeSkeleton, UUID_V4_RE } = require('../schema');

const UUID_A = '019ecedf-1234-5678-9abc-def012345678';
const UUID_B = '019eced3-cce9-7be3-81a1-c8a5c30a27fe';
const ENVELOPE_PATH = '.claude/state/dispatches/' + UUID_B + '.envelope.json';

function baselineReceipt() {
  // Build a current-skeleton receipt that's already valid, then deletions
  // below remove only the post-v1.2.0-m1 attribution fields.
  const r = makeSkeleton({
    gate_id: 'mccp-implement-codex',
    phase: 'implement',
    decision_id: 'v1-3-0-baseline-fixture',
    plan_hash: 'sha256:' + '0'.repeat(64),
    base_sha: 'a'.repeat(40),
    head_sha: 'b'.repeat(40),
    subject_hash: 'sha256:' + '1'.repeat(64),
    receipt_hash: 'sha256:' + '2'.repeat(64),
    resolution: {
      converged: true,
      rounds: 1,
      accepted: [],
      rejected: [],
      open_questions: [],
    },
  });
  r.meta.command = '/mccp:prp-implement';
  r.meta.cwd = '/tmp/fixture';
  r.meta.git_branch = 'feat/v1-3-0-baseline-fixture';
  return r;
}

test('v1.3.0-m0 backward-compat: v0.2.x-era receipts (no v1.2.0-m1 attribution) validate', () => {
  // Simulate an old receipt written before the v1.2.0-m1 axis landed:
  // the 4 controller attribution fields are absent entirely (undefined).
  const r = baselineReceipt();
  delete r.meta.controller_context_marker_present;
  delete r.meta.dispatched_by_controller_session_id;
  delete r.meta.worker_dispatch_id;
  delete r.meta.ipc_envelope_path;

  const result = validate(r);
  assert.strictEqual(
    result.ok, true,
    'historical receipts must keep validating (read tolerance); got errors: ' +
      JSON.stringify(result.errors)
  );
});

test('v1.2.0-m1 marker=true + all 3 attribution fields valid → passes', () => {
  const r = baselineReceipt();
  r.meta.controller_context_marker_present = true;
  r.meta.dispatched_by_controller_session_id = UUID_A;
  r.meta.worker_dispatch_id = UUID_B;
  r.meta.ipc_envelope_path = ENVELOPE_PATH;

  const result = validate(r);
  assert.strictEqual(
    result.ok, true,
    'marker=true + all 3 valid attribution fields must pass; got errors: ' +
      JSON.stringify(result.errors)
  );
});

test('v1.2.0-m1 marker=true + only 2 of 3 attribution fields → rejects with "all 3" error', () => {
  const r = baselineReceipt();
  r.meta.controller_context_marker_present = true;
  r.meta.dispatched_by_controller_session_id = UUID_A;
  r.meta.worker_dispatch_id = UUID_B;
  r.meta.ipc_envelope_path = null;  // <-- missing the third

  const result = validate(r);
  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(e => e.indexOf('requires all 3 attribution') !== -1),
    'expected "marker=true requires all 3 attribution" error; got: ' +
      JSON.stringify(result.errors)
  );
});

test('v1.2.0-m1 marker=false + 1 attribution field set → rejects with all-or-nothing error', () => {
  const r = baselineReceipt();
  r.meta.controller_context_marker_present = false;
  r.meta.dispatched_by_controller_session_id = UUID_A;  // <-- partial state
  r.meta.worker_dispatch_id = null;
  r.meta.ipc_envelope_path = null;

  const result = validate(r);
  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(e => e.indexOf('all-or-nothing invariant') !== -1),
    'expected "all-or-nothing" error; got: ' + JSON.stringify(result.errors)
  );
});

test('v0.3.5 3-way codex skip mutex: dedupe + skipped both true → rejects', () => {
  const r = baselineReceipt();
  r.meta.codex_dedupe_at_pr = true;
  r.meta.codex_skipped_at_pr = true;
  // Add a substantive reason so the codex_skipped_at_pr reason validator doesn't
  // emit its own error that masks the mutex error.
  r.meta.codex_skip_reason = 'cherry-pick PR routed through external audit ' +
    'chain, no need for in-band Codex review at this gate';

  const result = validate(r);
  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(e => e.indexOf('mutually exclusive') !== -1
      && e.indexOf('3-way') !== -1),
    'expected 3-way mutex error; got: ' + JSON.stringify(result.errors)
  );
});

test('v0.3.5 3-way codex skip mutex: dedupe + disabled both true → rejects', () => {
  const r = baselineReceipt();
  r.meta.codex_dedupe_at_pr = true;
  r.meta.codex_disabled_at_pr = true;
  r.meta.codex_skip_reason = 'codex_disabled';

  const result = validate(r);
  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(e => e.indexOf('mutually exclusive') !== -1),
    'expected 3-way mutex error; got: ' + JSON.stringify(result.errors)
  );
});

test('v0.3.5 3-way codex skip: exactly one true → passes', () => {
  const r = baselineReceipt();
  r.meta.codex_dedupe_at_pr = true;
  r.meta.codex_skipped_at_pr = false;
  r.meta.codex_disabled_at_pr = false;

  const result = validate(r);
  assert.strictEqual(
    result.ok, true,
    'exactly one of the 3 skip flags true must pass; got: ' +
      JSON.stringify(result.errors)
  );
});

test('v1.0.1 pr_phase_lock_stale_reclaimed_at_hook: field absent → ok', () => {
  const r = baselineReceipt();
  delete r.meta.pr_phase_lock_stale_reclaimed_at_hook;

  const result = validate(r);
  assert.strictEqual(
    result.ok, true,
    'absent field must validate (backward-compat); got: ' +
      JSON.stringify(result.errors)
  );
});

test('v1.0.1 pr_phase_lock_stale_reclaimed_at_hook: field=true → ok', () => {
  const r = baselineReceipt();
  r.meta.pr_phase_lock_stale_reclaimed_at_hook = true;

  const result = validate(r);
  assert.strictEqual(
    result.ok, true,
    'true value must validate; got: ' + JSON.stringify(result.errors)
  );
});

test('v1.0.1 pr_phase_lock_stale_reclaimed_at_hook: non-boolean → rejects', () => {
  const r = baselineReceipt();
  r.meta.pr_phase_lock_stale_reclaimed_at_hook = 'yes-please';

  const result = validate(r);
  assert.strictEqual(result.ok, false);
  assert.ok(
    result.errors.some(e =>
      e.indexOf('pr_phase_lock_stale_reclaimed_at_hook must be a boolean') !== -1),
    'expected boolean-type error; got: ' + JSON.stringify(result.errors)
  );
});
