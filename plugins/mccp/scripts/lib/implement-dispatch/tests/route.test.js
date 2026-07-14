'use strict';

// work Step 3 route oracle validate (Codex F1+F3) — the env × artifact matrix
// that decides inline / task / workflow-single / workflow-parallel. This is the
// surface live-activation M1 is trying to fire; lifting it out of untested
// markdown into resolveWorkRoute makes each firing route mechanically asserted.

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveWorkRoute, parseWorkflowMode, ROUTES } = require('../route');

const WF_ON = { MCCP_WORK_IMPLEMENT_WORKFLOW: '1' };
const WF_OFF = {};

// full-isolate-with-single-prepare base (workflow-single-eligible when WF on).
function base(over) {
  return Object.assign({
    env: WF_OFF, isolate: true,
    hasFleetArgs: false, hasPrepare: true,
    hasWorkflowArgs: true, workflowAvailable: true,
  }, over || {});
}

// ── parseWorkflowMode (NOT flipped by live-activation M1 — Codex F1) ───────────

test('parseWorkflowMode: default OFF; 1/on enable; case-insensitive', function () {
  assert.equal(parseWorkflowMode({}), 'off');
  assert.equal(parseWorkflowMode({ MCCP_WORK_IMPLEMENT_WORKFLOW: '1' }), 'on');
  assert.equal(parseWorkflowMode({ MCCP_WORK_IMPLEMENT_WORKFLOW: ' ON ' }), 'on');
  assert.equal(parseWorkflowMode({ MCCP_WORK_IMPLEMENT_WORKFLOW: '0' }), 'off');
  assert.equal(parseWorkflowMode({ MCCP_WORK_IMPLEMENT_WORKFLOW: 'garbage' }), 'off');
});

// ── rule 1: isolation off → inline (dominates all artifacts) ──────────────────

test('isolate=false → inline regardless of every other input', function () {
  assert.equal(resolveWorkRoute({ isolate: false, hasFleetArgs: true, workflowAvailable: true, env: WF_ON }), ROUTES.INLINE);
  assert.equal(resolveWorkRoute({ isolate: false, hasPrepare: true, hasWorkflowArgs: true, workflowAvailable: true, env: WF_ON }), ROUTES.INLINE);
  assert.equal(resolveWorkRoute({ isolate: false }), ROUTES.INLINE);
});

test('isolate defaults to true when omitted', function () {
  // omitting isolate → treated as true → prepare path (WF off) → task.
  assert.equal(resolveWorkRoute({ hasPrepare: true, env: WF_OFF }), ROUTES.TASK);
});

// ── rule 2: parallel fleet ────────────────────────────────────────────────────

test('fleet args + Workflow available → workflow-parallel', function () {
  assert.equal(resolveWorkRoute(base({ hasFleetArgs: true, env: WF_OFF })), ROUTES.WORKFLOW_PARALLEL);
  // even with WF single opt-in off — the fleet path is its own axis.
  assert.equal(resolveWorkRoute(base({ hasFleetArgs: true, env: WF_ON })), ROUTES.WORKFLOW_PARALLEL);
});

test('fleet args + Workflow UNAVAILABLE → degrade (fleet ignored, fall through)', function () {
  // prepare present + WF on + args → but workflowAvailable false → not single → task.
  assert.equal(resolveWorkRoute(base({ hasFleetArgs: true, workflowAvailable: false, env: WF_ON })), ROUTES.TASK);
  // no prepare either → inline.
  assert.equal(resolveWorkRoute(base({ hasFleetArgs: true, workflowAvailable: false, hasPrepare: false })), ROUTES.INLINE);
});

// ── rule 3: no single prepare → inline ────────────────────────────────────────

test('no fleet + no prepare → inline (prepare-single failed / ISOLATE=0-equiv)', function () {
  assert.equal(resolveWorkRoute(base({ hasPrepare: false })), ROUTES.INLINE);
  assert.equal(resolveWorkRoute(base({ hasPrepare: false, env: WF_ON })), ROUTES.INLINE);
});

// ── rule 4: workflow-single opt-in ────────────────────────────────────────────

test('prepare + WF on + args + tool available → workflow-single', function () {
  assert.equal(resolveWorkRoute(base({ env: WF_ON })), ROUTES.WORKFLOW_SINGLE);
});

test('prepare + WF on + args + tool UNAVAILABLE → task', function () {
  assert.equal(resolveWorkRoute(base({ env: WF_ON, workflowAvailable: false })), ROUTES.TASK);
});

test('prepare + WF on but args ABSENT → task', function () {
  assert.equal(resolveWorkRoute(base({ env: WF_ON, hasWorkflowArgs: false })), ROUTES.TASK);
});

// ── rule 5: default task path ─────────────────────────────────────────────────

test('prepare + WF off → task (the M2a isolate default)', function () {
  assert.equal(resolveWorkRoute(base({ env: WF_OFF })), ROUTES.TASK);
});

test('prepare + WF unset → task', function () {
  assert.equal(resolveWorkRoute(base({ env: {} })), ROUTES.TASK);
});

// ── exhaustive-ish combination sweep — every route is reachable ────────────────

test('every route enum value is reachable from the matrix', function () {
  const seen = new Set();
  const bools = [true, false];
  const envs = [WF_OFF, WF_ON];
  bools.forEach(function (isolate) {
    bools.forEach(function (hasFleetArgs) {
      bools.forEach(function (hasPrepare) {
        bools.forEach(function (hasWorkflowArgs) {
          bools.forEach(function (workflowAvailable) {
            envs.forEach(function (env) {
              const route = resolveWorkRoute({ isolate, hasFleetArgs, hasPrepare, hasWorkflowArgs, workflowAvailable, env });
              assert.ok(Object.values(ROUTES).includes(route), 'route must be a known enum: ' + route);
              seen.add(route);
            });
          });
        });
      });
    });
  });
  assert.equal(seen.size, 4, 'all 4 routes reachable: ' + Array.from(seen).join(','));
});
