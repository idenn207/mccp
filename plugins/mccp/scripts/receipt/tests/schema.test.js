'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { validate, makeSkeleton, GATE_IDS, PHASES, SEVERITIES } = require('../schema');

function valid() {
  return {
    schema_version: 'v1',
    gate_id: 'mccp-plan-codex',
    phase: 'plan',
    decision_id: 'feature-x',
    task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64),
    design_doc_hash: [],
    base_sha: 'a'.repeat(40),
    head_sha: 'b'.repeat(40),
    round: 1,
    findings: [],
    resolution: {
      converged: true,
      rounds: 1,
      accepted: [],
      rejected: [],
      open_questions: [],
    },
    subject_hash: 'sha256:' + '1'.repeat(64),
    receipt_hash: 'sha256:' + '2'.repeat(64),
    meta: {
      created_at: '2026-06-02T00:00:00Z',
      command: '/mccp:plan',
      cwd: '/x',
      git_branch: 'master',
      skipped: false,
      skip_reason: null,
      codex_skipped: false,
      advisory: false,
      security_skipped: false,
      security_skip_reason: null,
      security_force_override: false,
      security_force_override_reason: null,
      impeccable_skipped: false,
      impeccable_skip_reason: null,
      impeccable_force_override: false,
      impeccable_force_override_reason: null,
    },
  };
}

test('schema: minimal valid receipt passes', function () {
  const r = validate(valid());
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
});

test('schema: rejects non-object', function () {
  assert.strictEqual(validate(null).ok, false);
  assert.strictEqual(validate('x').ok, false);
  assert.strictEqual(validate(42).ok, false);
});

test('schema: rejects wrong schema_version', function () {
  const v = valid(); v.schema_version = 'v0';
  assert.strictEqual(validate(v).ok, false);
});

test('schema: rejects unknown gate_id', function () {
  const v = valid(); v.gate_id = 'made-up-gate';
  assert.strictEqual(validate(v).ok, false);
});

test('schema: every valid gate_id accepted', function () {
  GATE_IDS.forEach(function (g) {
    const v = valid(); v.gate_id = g;
    assert.strictEqual(validate(v).ok, true, 'gate ' + g + ' should validate');
  });
});

test('schema: rejects unknown phase', function () {
  const v = valid(); v.phase = 'whatever';
  assert.strictEqual(validate(v).ok, false);
});

test('schema: every valid phase accepted', function () {
  PHASES.forEach(function (p) {
    const v = valid(); v.phase = p;
    assert.strictEqual(validate(v).ok, true, 'phase ' + p + ' should validate');
  });
});

test('schema: decision_id must be kebab', function () {
  const v = valid();
  v.decision_id = 'Has Spaces';
  assert.strictEqual(validate(v).ok, false);
  v.decision_id = 'CAPITAL';
  assert.strictEqual(validate(v).ok, false);
  v.decision_id = 'good-slug-123';
  assert.strictEqual(validate(v).ok, true);
});

test('schema: plan_hash must match sha256: prefix', function () {
  const v = valid(); v.plan_hash = 'deadbeef';
  assert.strictEqual(validate(v).ok, false);
  v.plan_hash = 'sha256:GG' + '0'.repeat(62);
  assert.strictEqual(validate(v).ok, false);
});

test('schema: design_doc_hash entries validated', function () {
  const v = valid();
  v.design_doc_hash = [{ path: 'a.md', sha256: 'invalid' }];
  assert.strictEqual(validate(v).ok, false);
  v.design_doc_hash = [{ path: 'a.md', sha256: 'sha256:' + '0'.repeat(64) }];
  assert.strictEqual(validate(v).ok, true);
});

test('schema: base_sha/head_sha must be hex git SHA', function () {
  const v = valid(); v.base_sha = 'nothex';
  assert.strictEqual(validate(v).ok, false);
});

test('schema: round must be integer in [1,10]', function () {
  const v = valid(); v.round = 0;
  assert.strictEqual(validate(v).ok, false);
  v.round = 11;
  assert.strictEqual(validate(v).ok, false);
  v.round = 1.5;
  assert.strictEqual(validate(v).ok, false);
  v.round = 5;
  assert.strictEqual(validate(v).ok, true);
});

test('schema: findings severity validated', function () {
  const v = valid();
  v.findings = [{ severity: 'URGENT', area: 'x', description: 'y' }];
  assert.strictEqual(validate(v).ok, false);
  v.findings = [{ severity: 'HIGH', area: 'x', description: 'y' }];
  assert.strictEqual(validate(v).ok, true);
});

test('schema: every severity accepted', function () {
  SEVERITIES.forEach(function (s) {
    const v = valid();
    v.findings = [{ severity: s, area: 'x', description: 'y' }];
    assert.strictEqual(validate(v).ok, true);
  });
});

test('schema: resolution shape enforced', function () {
  const v = valid(); v.resolution = { converged: 'yes' };
  assert.strictEqual(validate(v).ok, false);
  v.resolution = { converged: true, rounds: 0, accepted: [], rejected: [], open_questions: [] };
  assert.strictEqual(validate(v).ok, false);
});

test('schema: meta.created_at must be ISO8601', function () {
  const v = valid(); v.meta.created_at = '2026-06-02 00:00:00';
  assert.strictEqual(validate(v).ok, false);
  v.meta.created_at = '2026-06-02T00:00:00.123Z';
  assert.strictEqual(validate(v).ok, true);
  v.meta.created_at = '2026-06-02T00:00:00+09:00';
  assert.strictEqual(validate(v).ok, true);
});

test('schema: subject_hash and receipt_hash required', function () {
  const v = valid(); delete v.subject_hash;
  assert.strictEqual(validate(v).ok, false);
  const w = valid(); delete w.receipt_hash;
  assert.strictEqual(validate(w).ok, false);
});

test('makeSkeleton: returns shape that fails validation until populated', function () {
  const s = makeSkeleton();
  assert.strictEqual(s.schema_version, 'v1');
  assert.strictEqual(s.round, 1);
  assert.strictEqual(s.resolution.converged, false);
  assert.strictEqual(validate(s).ok, false);
});

test('makeSkeleton: overrides applied', function () {
  const s = makeSkeleton({ gate_id: 'mccp-plan-codex', decision_id: 'x' });
  assert.strictEqual(s.gate_id, 'mccp-plan-codex');
  assert.strictEqual(s.decision_id, 'x');
});

// v0.3.5 — env-level codex_disabled / codex_disabled_at_pr (Plan §Task 4).

test('schema: meta.codex_disabled must be boolean if present', function () {
  const v = valid(); v.meta.codex_disabled = false;
  assert.strictEqual(validate(v).ok, true);
  v.meta.codex_disabled = true; v.meta.codex_disabled_at_pr = true;
  v.meta.codex_skip_reason = 'codex_disabled';
  assert.strictEqual(validate(v).ok, true);
  v.meta.codex_disabled = 'yes';
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /codex_disabled must be a boolean/);
});

test('schema: 3-way mutex — dedupe + skipped + disabled cannot coexist', function () {
  const v = valid();
  v.meta.codex_dedupe_at_pr = true;
  v.meta.codex_disabled_at_pr = true;
  v.meta.codex_skip_reason = 'codex_disabled';
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /mutually exclusive/);
});

test('schema: 3-way mutex — skipped + disabled cannot coexist either', function () {
  const v = valid();
  v.meta.codex_skipped_at_pr = true;
  v.meta.codex_disabled_at_pr = true;
  v.meta.codex_skip_reason = 'codex_disabled';
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /mutually exclusive/);
});

test('schema: disabled_at_pr=true requires canonical codex_skip_reason="codex_disabled"', function () {
  const v = valid();
  v.meta.codex_disabled = true;
  v.meta.codex_disabled_at_pr = true;
  v.meta.codex_skip_reason = 'some custom reason that is long enough but not canonical';
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /canonical reason|requires meta\.codex_skip_reason/);
});

test('schema: disabled_at_pr=true with canonical reason passes substantive-reason bypass', function () {
  // The substantive-reason validator (≥30 chars + ≥3 words) is bypassed for
  // env policy — 'codex_disabled' literal is far shorter than the audited
  // escape threshold and that is intentional.
  const v = valid();
  v.meta.codex_disabled = true;
  v.meta.codex_disabled_at_pr = true;
  v.meta.codex_skip_reason = 'codex_disabled';
  assert.strictEqual(validate(v).ok, true);
});

test('makeSkeleton: new disabled fields default to false', function () {
  const s = makeSkeleton();
  assert.strictEqual(s.meta.codex_disabled, false);
  assert.strictEqual(s.meta.codex_disabled_at_pr, false);
});

// v0.3.6 Task 3 — Codex/impeccable scope audit axis tests.

test('schema v0.3.6: codex_design_scope_excluded accepts boolean', function () {
  const v = valid();
  v.meta.codex_design_scope_excluded = true;
  assert.strictEqual(validate(v).ok, true);
  v.meta.codex_design_scope_excluded = false;
  assert.strictEqual(validate(v).ok, true);
});

test('schema v0.3.6: codex_design_scope_excluded rejects non-boolean', function () {
  const v = valid();
  v.meta.codex_design_scope_excluded = 'true';
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /codex_design_scope_excluded.*boolean/);
});

test('schema v0.3.6: codex_design_scope_excluded absent is allowed (backward compat)', function () {
  const v = valid();
  // valid() does not set this field — backward compat verification
  assert.strictEqual(v.meta.codex_design_scope_excluded, undefined);
  assert.strictEqual(validate(v).ok, true);
});

test('schema v0.3.6: design_findings_dropped accepts non-negative integer', function () {
  const v = valid();
  v.meta.design_findings_dropped = 0;
  assert.strictEqual(validate(v).ok, true);
  v.meta.design_findings_dropped = 7;
  assert.strictEqual(validate(v).ok, true);
});

test('schema v0.3.6: design_findings_dropped rejects negative or non-integer', function () {
  const v = valid();
  v.meta.design_findings_dropped = -1;
  assert.strictEqual(validate(v).ok, false);
  const v2 = valid();
  v2.meta.design_findings_dropped = 1.5;
  assert.strictEqual(validate(v2).ok, false);
  const v3 = valid();
  v3.meta.design_findings_dropped = 'three';
  assert.strictEqual(validate(v3).ok, false);
});

test('schema v0.3.6: a11y_routed_to_impeccable accepts boolean', function () {
  const v = valid();
  v.meta.a11y_routed_to_impeccable = true;
  assert.strictEqual(validate(v).ok, true);
  v.meta.a11y_routed_to_impeccable = false;
  assert.strictEqual(validate(v).ok, true);
});

test('schema v0.3.6: a11y_routed_to_impeccable rejects non-boolean', function () {
  const v = valid();
  v.meta.a11y_routed_to_impeccable = 1;
  assert.strictEqual(validate(v).ok, false);
});

test('schema v0.3.6: dropped_findings_digest accepts sha256: prefixed hex', function () {
  const v = valid();
  v.meta.dropped_findings_digest = 'sha256:' + 'a'.repeat(64);
  assert.strictEqual(validate(v).ok, true);
});

test('schema v0.3.6: dropped_findings_digest accepts null (no findings dropped)', function () {
  const v = valid();
  v.meta.dropped_findings_digest = null;
  assert.strictEqual(validate(v).ok, true);
});

test('schema v0.3.6: dropped_findings_digest rejects raw hex without sha256: prefix', function () {
  const v = valid();
  v.meta.dropped_findings_digest = 'a'.repeat(64); // no prefix
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /dropped_findings_digest/);
});

test('schema v0.3.6: dropped_findings_digest rejects too-short hash', function () {
  const v = valid();
  v.meta.dropped_findings_digest = 'sha256:abc';
  assert.strictEqual(validate(v).ok, false);
});

test('schema v0.3.6: combined active state (design dropped + a11y routed + digest) all valid together', function () {
  const v = valid();
  v.meta.codex_design_scope_excluded = true;
  v.meta.design_findings_dropped = 3;
  v.meta.a11y_routed_to_impeccable = true;
  v.meta.dropped_findings_digest = 'sha256:' + 'd'.repeat(64);
  assert.strictEqual(validate(v).ok, true,
    'design + a11y + digest fields are independent — no mutex');
});

test('makeSkeleton v0.3.6: new scope audit fields default to safe values', function () {
  const s = makeSkeleton();
  assert.strictEqual(s.meta.codex_design_scope_excluded, false);
  assert.strictEqual(s.meta.design_findings_dropped, 0);
  assert.strictEqual(s.meta.a11y_routed_to_impeccable, false);
  assert.strictEqual(s.meta.dropped_findings_digest, null);
});

// v1.2.0-m1 Task 6 — controller-worker attribution axis tests.

const UUID_FX = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UUID_FX_2 = '11111111-2222-3333-4444-555555555555';
const ENV_PATH_FX = '.claude/state/dispatches/' + UUID_FX + '.envelope.json';

test('schema v1.2.0-m1: backward compat — receipt with marker=false + 0 attribution fields passes', function () {
  const v = valid();
  v.meta.controller_context_marker_present = false;
  v.meta.dispatched_by_controller_session_id = null;
  v.meta.worker_dispatch_id = null;
  v.meta.ipc_envelope_path = null;
  assert.strictEqual(validate(v).ok, true);
});

test('schema v1.2.0-m1: backward compat — existing v0.2.x receipt (no marker field) passes', function () {
  const v = valid();
  // No marker field set — undefined. Matches existing v0.2.x receipts.
  assert.strictEqual(v.meta.controller_context_marker_present, undefined);
  assert.strictEqual(validate(v).ok, true);
});

test('schema v1.2.0-m1: marker=true requires all 3 attribution fields', function () {
  const v = valid();
  v.meta.controller_context_marker_present = true;
  v.meta.dispatched_by_controller_session_id = UUID_FX;
  v.meta.worker_dispatch_id = UUID_FX_2;
  v.meta.ipc_envelope_path = ENV_PATH_FX;
  assert.strictEqual(validate(v).ok, true);
});

test('schema v1.2.0-m1: marker=true + 2 of 3 fields rejects (F2 absorption)', function () {
  const v = valid();
  v.meta.controller_context_marker_present = true;
  v.meta.dispatched_by_controller_session_id = UUID_FX;
  v.meta.worker_dispatch_id = UUID_FX_2;
  // ipc_envelope_path missing
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /controller_context_marker_present=true requires all 3/);
});

test('schema v1.2.0-m1: marker=true + 0 fields rejects', function () {
  const v = valid();
  v.meta.controller_context_marker_present = true;
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /requires all 3 attribution/);
});

test('schema v1.2.0-m1: marker=false + 1 attribution field rejects (all-or-nothing)', function () {
  const v = valid();
  v.meta.controller_context_marker_present = false;
  v.meta.worker_dispatch_id = UUID_FX;
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /all-or-nothing invariant/);
});

test('schema v1.2.0-m1: dispatched_by_controller_session_id must match UUID format', function () {
  const v = valid();
  v.meta.controller_context_marker_present = true;
  v.meta.dispatched_by_controller_session_id = 'not-a-uuid';
  v.meta.worker_dispatch_id = UUID_FX_2;
  v.meta.ipc_envelope_path = ENV_PATH_FX;
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /dispatched_by_controller_session_id must be UUID/);
});

test('schema v1.2.0-m1: ipc_envelope_path must match canonical envelope location', function () {
  const v = valid();
  v.meta.controller_context_marker_present = true;
  v.meta.dispatched_by_controller_session_id = UUID_FX;
  v.meta.worker_dispatch_id = UUID_FX_2;
  v.meta.ipc_envelope_path = '/tmp/random.json'; // not in canonical .claude/state/dispatches/
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /ipc_envelope_path must match/);
});

test('schema v1.2.0-m1: marker field must be boolean if present', function () {
  const v = valid();
  v.meta.controller_context_marker_present = 'true'; // string, not boolean
  const r = validate(v);
  assert.strictEqual(r.ok, false);
  assert.match(r.errors.join(' '), /controller_context_marker_present must be a boolean/);
});

test('makeSkeleton v1.2.0-m1: attribution axis defaults to absent state', function () {
  const s = makeSkeleton();
  assert.strictEqual(s.meta.controller_context_marker_present, false);
  assert.strictEqual(s.meta.dispatched_by_controller_session_id, null);
  assert.strictEqual(s.meta.worker_dispatch_id, null);
  assert.strictEqual(s.meta.ipc_envelope_path, null);
});
