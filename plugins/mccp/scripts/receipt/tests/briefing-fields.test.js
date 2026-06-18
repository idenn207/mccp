'use strict';

// v1.3.0-m2 Task 1 validate — schema-level coverage for meta.briefing_*.
//
// Covers the 4 present-only fields added to schema.js#validate() + the 4
// defaults added to schema.js#makeSkeleton().

const test = require('node:test');
const assert = require('node:assert/strict');

const { validate, makeSkeleton } = require('../schema');

function fixture(overrides) {
  const s = makeSkeleton({});
  s.gate_id = 'mccp-plan-codex';
  s.phase = 'plan';
  s.decision_id = 'unit-test-briefing-fields';
  s.task_id = 'T1';
  s.plan_hash = 'sha256:' + 'a'.repeat(64);
  s.base_sha = 'a'.repeat(40);
  s.head_sha = 'a'.repeat(40);
  s.subject_hash = 'sha256:' + 'b'.repeat(64);
  s.receipt_hash = 'sha256:' + 'c'.repeat(64);
  s.meta.command = 'mccp:test';
  if (overrides) {
    if (overrides.meta) Object.assign(s.meta, overrides.meta);
  }
  return s;
}

test('valid briefing fields + estimated=true pass validation', function () {
  const r = fixture({
    meta: {
      briefing_summary: 'M2 ready for PR review',
      briefing_token_count: 180,
      briefing_token_estimated: true,
      briefing_invocation_count: 1,
    },
  });
  const v = validate(r);
  assert.equal(v.ok, true, 'errors: ' + JSON.stringify(v.errors));
});

test('briefing_summary > 1024 chars rejects', function () {
  const r = fixture({
    meta: {
      briefing_summary: 'x'.repeat(1025),
      briefing_token_count: 1,
      briefing_invocation_count: 1,
    },
  });
  const v = validate(r);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(function (e) { return e.includes('briefing_summary'); }));
});

test('briefing_summary empty string rejects', function () {
  const r = fixture({
    meta: {
      briefing_summary: '',
      briefing_token_count: 0,
      briefing_invocation_count: 0,
    },
  });
  const v = validate(r);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(function (e) { return e.includes('briefing_summary'); }));
});

test('briefing_token_count negative rejects', function () {
  const r = fixture({
    meta: {
      briefing_summary: 'x',
      briefing_token_count: -1,
      briefing_invocation_count: 1,
    },
  });
  const v = validate(r);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(function (e) { return e.includes('briefing_token_count'); }));
});

test('briefing_token_count fractional rejects', function () {
  const r = fixture({
    meta: {
      briefing_token_count: 1.5,
    },
  });
  const v = validate(r);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(function (e) { return e.includes('briefing_token_count'); }));
});

test('briefing_token_estimated non-boolean rejects', function () {
  const r = fixture({
    meta: {
      briefing_token_estimated: 'yes',
    },
  });
  const v = validate(r);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(function (e) { return e.includes('briefing_token_estimated'); }));
});

test('briefing_invocation_count negative rejects', function () {
  const r = fixture({
    meta: { briefing_invocation_count: -1 },
  });
  const v = validate(r);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some(function (e) { return e.includes('briefing_invocation_count'); }));
});

test('v0.2.x-era receipt without briefing_* keys still passes (backward compat)', function () {
  const r = fixture({});
  delete r.meta.briefing_summary;
  delete r.meta.briefing_token_count;
  delete r.meta.briefing_token_estimated;
  delete r.meta.briefing_invocation_count;
  const v = validate(r);
  assert.equal(v.ok, true, 'errors: ' + JSON.stringify(v.errors));
});

test('briefing_token_estimated=true + briefing_token_count=null is legal (skipped path)', function () {
  const r = fixture({
    meta: {
      briefing_summary: null,
      briefing_token_count: null,
      briefing_token_estimated: true,
      briefing_invocation_count: 0,
    },
  });
  const v = validate(r);
  assert.equal(v.ok, true, 'errors: ' + JSON.stringify(v.errors));
});
