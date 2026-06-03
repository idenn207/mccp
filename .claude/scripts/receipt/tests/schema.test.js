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
