'use strict';

// orchestration-preview validate (live-activation M2 Task 2) — proves the
// firing-preview tool (1) reuses the EXACT Step 3 oracles (byte-consistent, never
// re-implemented), (2) separates oracle_run from route-composed effective_fire so
// "oracle says run" is never a false green-light (Codex F1), and (3) is strictly
// READ-ONLY — a CLI run mutates neither the runaway counter, cost-state, nor
// STATE.md, and the module has no counter-bump import/call path (Codex F3).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { previewFiring } = require('../orchestration-preview');
const { resolveFanout, REASONS: FANOUT_REASONS } = require('../plan-fanout/budget');
const { resolveFleet, parseMaxWorkers, REASONS: FLEET_REASONS } = require('../implement-dispatch/budget');
const { resolveWorkRoute, ROUTES } = require('../implement-dispatch/route');
const { partitionFromPlanText } = require('../implement-dispatch/partition');
const { clampForRunaway, parseUsdBomb, parseCatastrophicUsd } = require('../orchestration-runaway');

const PREVIEW_SRC = path.join(__dirname, '..', 'orchestration-preview.js');

// Two disjoint tasks touching disjoint NON-shared files → partition n=2 (reason
// disjoint), so the fleet path can fire N-worker parallel.
const TWO_TASK_PLAN = [
  '# Plan: two disjoint tasks',
  '',
  '## Files to Change',
  '',
  '| File | Action | Why |',
  '|---|---|---|',
  '| `src/alpha.js` | CREATE | a |',
  '| `src/beta.js` | CREATE | b |',
  '',
  '## Tasks',
  '',
  '### Task 1: alpha',
  '- touches `src/alpha.js`',
  '',
  '### Task 2: beta',
  '- touches `src/beta.js`',
  '',
].join('\n');

// A single-file plan → partition n=1 → SINGLE_PARTITION (nothing to split).
const ONE_FILE_PLAN = [
  '## Files to Change',
  '',
  '| File | Action | Why |',
  '|---|---|---|',
  '| `src/only.js` | CREATE | x |',
  '',
  '### Task 1: only',
  '- touches `src/only.js`',
  '',
].join('\n');

function nullCost() { return null; }
function greenCost() { return { cost_usd: 5, threshold_tier: 'green' }; }
function read0() { return { launched: 0, sessionId: 's' }; }

// ── (a) cost-state absent + costFailOpen default → COST_FAILOPEN run ───────────

test('(a) cost-state absent → fan-out + fleet run:true reason cost-failopen', function () {
  const r = previewFiring({
    env: {}, planText: TWO_TASK_PLAN, prdMode: true,
    costStateRead: nullCost, runawayRead: read0,
  });
  assert.equal(r.fanout.run, true);
  assert.equal(r.fanout.reason, FANOUT_REASONS.COST_FAILOPEN);
  assert.equal(r.fleet.run, true);
  assert.equal(r.fleet.reason, FLEET_REASONS.COST_FAILOPEN);
  assert.equal(r.fleet.n, 2);
  // default env: parallel on, isolate on, merge worktree-merge, N=2 → parallel fires.
  assert.equal(r.route, ROUTES.WORKFLOW_PARALLEL);
  assert.equal(r.effective_fire.parallel_fires, true);
  assert.equal(r.effective_fire.fanout_fires, true);
});

// ── (b) explicit opt-out on each axis → env-off skip ──────────────────────────

test('(b) MCCP_PLAN_FANOUT=off / MCCP_WORK_IMPLEMENT_PARALLEL=0 → each axis env-off', function () {
  const r = previewFiring({
    env: { MCCP_PLAN_FANOUT: 'off', MCCP_WORK_IMPLEMENT_PARALLEL: '0' },
    planText: TWO_TASK_PLAN, prdMode: true, costStateRead: nullCost, runawayRead: read0,
  });
  assert.equal(r.fanout.run, false);
  assert.equal(r.fanout.reason, FANOUT_REASONS.ENV_OFF);
  assert.equal(r.fleet.run, false);
  assert.equal(r.fleet.reason, FLEET_REASONS.ENV_OFF);
  assert.equal(r.effective_fire.fanout_fires, false);
  assert.equal(r.effective_fire.parallel_fires, false);
});

// ── (c) COST_FAIL_OPEN=0 + cost-state absent → fail-closed restore ────────────

test('(c) MCCP_ORCHESTRATION_COST_FAIL_OPEN=0 + no cost-state → cost-state-unknown skip', function () {
  const r = previewFiring({
    env: { MCCP_ORCHESTRATION_COST_FAIL_OPEN: '0' },
    planText: TWO_TASK_PLAN, prdMode: true, costStateRead: nullCost, runawayRead: read0,
  });
  assert.equal(r.env_summary.cost_fail_open, false);
  assert.equal(r.fanout.run, false);
  assert.equal(r.fanout.reason, FANOUT_REASONS.COST_STATE_UNKNOWN);
  assert.equal(r.fleet.run, false);
  assert.equal(r.fleet.reason, FLEET_REASONS.COST_STATE_UNKNOWN);
});

// ── (d) launched near the cap → degraded + runaway-clamp reason surfaced ───────

test('(d) launched near MCCP_ORCHESTRATION_MAX_AGENTS → fan-out + fleet degraded runaway-clamp', function () {
  const r = previewFiring({
    env: { MCCP_ORCHESTRATION_MAX_AGENTS: '4' },
    planText: TWO_TASK_PLAN, prdMode: true,
    costStateRead: nullCost, runawayRead: function () { return { launched: 3, sessionId: 's' }; },
  });
  // fail-open path → clamp applies. 3 + 4 (fanout) > 4 → degrade to 1.
  assert.equal(r.fanout.run, true);
  assert.equal(r.fanout.degraded, true);
  assert.equal(r.fanout.runawayReason, 'runaway-clamp');
  assert.equal(r.fanout.fleetSize, 1);
  // 3 + 2 (fleet requestedN) > 4 → degrade to 1.
  assert.equal(r.fleet.run, true);
  assert.equal(r.fleet.degraded, true);
  assert.equal(r.fleet.runawayReason, 'runaway-clamp');
  assert.equal(r.fleet.n, 1);
  // degraded to n=1 → no fleet args projected → NOT workflow-parallel.
  assert.equal(r.effective_fire.parallel_fires, false);
  assert.equal(r.runaway.launched, 3);
  assert.equal(r.runaway.headroom, 1);
});

// ── (e) ISOLATE=0 → route inline → run:true but parallel_fires:false (F1) ──────

test('(e) MCCP_WORK_ISOLATE_IMPLEMENT=0 → route inline; fleet.run:true but parallel_fires:false', function () {
  const r = previewFiring({
    env: { MCCP_WORK_ISOLATE_IMPLEMENT: '0' },
    planText: TWO_TASK_PLAN, prdMode: true, costStateRead: nullCost, runawayRead: read0,
  });
  assert.equal(r.fleet.run, true);            // oracle STILL says run
  assert.equal(r.oracle_run.fleet, true);
  assert.equal(r.route, ROUTES.INLINE);       // but isolate=0 dominates the route
  assert.equal(r.effective_fire.parallel_fires, false); // ← false green-light blocked
  assert.equal(r.effective_fire.inline, true);
});

// ── (f) single-partition plan → not workflow-parallel → parallel_fires:false ──

test('(f) partition N=1 → fleet single-partition → parallel_fires:false', function () {
  const r = previewFiring({
    env: {}, planText: ONE_FILE_PLAN, prdMode: true, costStateRead: nullCost, runawayRead: read0,
  });
  assert.equal(r.caller_gates.partition_n, 1);
  assert.equal(r.fleet.run, false);
  assert.equal(r.fleet.reason, FLEET_REASONS.SINGLE_PARTITION);
  assert.notEqual(r.route, ROUTES.WORKFLOW_PARALLEL);
  assert.equal(r.effective_fire.parallel_fires, false);
});

// ── (g) PARALLEL=off + WF on → workflow-single, not parallel ──────────────────

test('(g) PARALLEL=off + WF on + isolate on → route workflow-single (single_fires, not parallel)', function () {
  const r = previewFiring({
    env: { MCCP_WORK_IMPLEMENT_PARALLEL: 'off', MCCP_WORK_IMPLEMENT_WORKFLOW: '1' },
    planText: TWO_TASK_PLAN, prdMode: true, costStateRead: nullCost, runawayRead: read0,
  });
  assert.equal(r.fleet.run, false);            // parallel opted out
  assert.equal(r.fleet.reason, FLEET_REASONS.ENV_OFF);
  assert.equal(r.route, ROUTES.WORKFLOW_SINGLE);
  assert.equal(r.effective_fire.single_fires, true);
  assert.equal(r.effective_fire.parallel_fires, false);
});

// ── (h) projection labels + oracle_run/effective_fire are SEPARATE fields ─────

test('(h) caller_gates.*_assumed are projection labels; oracle_run vs effective_fire are distinct', function () {
  const r = previewFiring({
    env: {}, planText: TWO_TASK_PLAN, prdMode: true, costStateRead: nullCost, runawayRead: read0,
  });
  // *_assumed are honest projection labels (mid-run artifacts do not exist yet).
  assert.equal(r.caller_gates.prepare_assumed, true);
  assert.equal(r.caller_gates.fleet_args_assumed, true);
  assert.equal(r.caller_gates.workflow_available_assumed, true);
  // isolate / workflow_mode / partition_n are REAL derivations, not assumptions.
  assert.equal(r.caller_gates.isolate, true);
  assert.equal(r.caller_gates.workflow_mode, 'off');
  assert.equal(r.caller_gates.partition_n, 2);
  // oracle_run and effective_fire are separate top-level keys.
  assert.ok(Object.prototype.hasOwnProperty.call(r, 'oracle_run'));
  assert.ok(Object.prototype.hasOwnProperty.call(r, 'effective_fire'));
  assert.notEqual(r.oracle_run, r.effective_fire);
  // route_inputs surfaces exactly what was projected into resolveWorkRoute.
  assert.deepEqual(Object.keys(r.route_inputs).sort(),
    ['hasFleetArgs', 'hasPrepare', 'hasWorkflowArgs', 'isolate', 'workflowAvailable'].sort());
});

// ── M3: operational USD retired / catastrophic ceiling / usdBomb restore ──────

// The measured dogfood cost-state that blocked every M2 live observation.
function stickyCost() {
  return { cost_usd: 186.92, threshold_tier: 'critical', hard_ceiling_reached: true };
}

test('M3 (a): sticky $186 critical + hard_ceiling → fleet run:true ok-run (was hard-ceiling)', function () {
  const r = previewFiring({
    env: {}, planText: TWO_TASK_PLAN, prdMode: true,
    costStateRead: stickyCost, runawayRead: read0,
  });
  assert.equal(r.fleet.run, true);
  assert.equal(r.fleet.reason, FLEET_REASONS.OK_RUN);
  assert.equal(r.fanout.run, true);
  assert.equal(r.fanout.reason, FANOUT_REASONS.OK_RUN);
  // effective_fire stays route-composed (M2 F1) — run alone is never the verdict.
  assert.equal(r.route, ROUTES.WORKFLOW_PARALLEL);
  assert.equal(r.effective_fire.parallel_fires, true);
  assert.equal(r.effective_fire.fanout_fires, true);
  assert.equal(r.cost_state.present, true);
  assert.equal(r.cost_state.cost_usd, 186.92);
});

test('M3 (b): cost_usd >= catastrophic → catastrophic-usd skip on both oracles', function () {
  const r = previewFiring({
    env: { MCCP_ORCHESTRATION_CATASTROPHIC_USD: '100' },
    planText: TWO_TASK_PLAN, prdMode: true,
    costStateRead: stickyCost, runawayRead: read0,
  });
  assert.equal(r.fleet.run, false);
  assert.equal(r.fleet.reason, FLEET_REASONS.CATASTROPHIC_USD);
  assert.equal(r.fanout.run, false);
  assert.equal(r.fanout.reason, FANOUT_REASONS.CATASTROPHIC_USD);
  assert.equal(r.effective_fire.parallel_fires, false);
  assert.equal(r.effective_fire.fanout_fires, false);
  assert.equal(r.env_summary.catastrophic_usd, 100);
});

test('M3 (c): usdBomb=1 + sticky critical → hard-ceiling skip restored', function () {
  const r = previewFiring({
    env: { MCCP_ORCHESTRATION_USD_BOMB: '1' },
    planText: TWO_TASK_PLAN, prdMode: true,
    costStateRead: stickyCost, runawayRead: read0,
  });
  assert.equal(r.fleet.run, false);
  assert.equal(r.fleet.reason, FLEET_REASONS.HARD_CEILING);
  assert.equal(r.fanout.run, false);
  assert.equal(r.fanout.reason, FANOUT_REASONS.HARD_CEILING);
  assert.equal(r.env_summary.usd_bomb, true);
  assert.equal(r.effective_fire.parallel_fires, false);
});

test('M3: env_summary surfaces both new axes with their defaults', function () {
  const r = previewFiring({
    env: {}, planText: TWO_TASK_PLAN, prdMode: true,
    costStateRead: greenCost, runawayRead: read0,
  });
  assert.equal(r.env_summary.usd_bomb, false);
  assert.equal(r.env_summary.catastrophic_usd, 500);
});

// ── byte-consistency: preview sub-objects == direct oracle calls (no re-impl) ──

test('consistency: preview.fanout/fleet/route == direct resolveFanout/resolveFleet/resolveWorkRoute', function () {
  const env = {};
  const preview = previewFiring({
    env: env, planText: TWO_TASK_PLAN, prdMode: true,
    costStateRead: greenCost, runawayRead: read0,
  });

  const launched = 0;
  const clamp = function (n) { return clampForRunaway({ requestedN: n, launchedSoFar: launched, env: env }); };

  // M3 — the direct calls must forward the same usdBomb/catastrophicUsd the
  // preview parses, otherwise the preview verdict could drift from real firing.
  const directFanout = resolveFanout({
    env: env, prdMode: true, costStateRead: greenCost, costFailOpen: true,
    usdBomb: parseUsdBomb(env), catastrophicUsd: parseCatastrophicUsd(env),
    runawayClamp: clamp,
  });
  assert.deepEqual(preview.fanout, directFanout);

  const part = partitionFromPlanText(TWO_TASK_PLAN, parseMaxWorkers(env));
  const directFleet = resolveFleet({
    env: env, mergeStrategy: 'worktree-merge', requestedN: part.n,
    costStateRead: greenCost, costFailOpen: true,
    usdBomb: parseUsdBomb(env), catastrophicUsd: parseCatastrophicUsd(env),
    runawayClamp: clamp,
  });
  assert.deepEqual(preview.fleet, directFleet);

  const directRoute = resolveWorkRoute(Object.assign({ env: env }, preview.route_inputs));
  assert.equal(preview.route, directRoute);
});

test('consistency: fleet=null and partition=null when no plan is supplied', function () {
  const r = previewFiring({ env: {}, prdMode: true, costStateRead: nullCost, runawayRead: read0 });
  assert.equal(r.fleet, null);
  assert.equal(r.partition, null);
  assert.equal(r.oracle_run.fleet, null);
  assert.equal(r.caller_gates.partition_n, null);
  // fan-out is plan-independent (PRD gate) — still evaluated.
  assert.equal(r.fanout.run, true);
});

// ── read-only invariant (F3): static — no counter-bump import/call path ───────

test('read-only static: module has NO counter-bump import/call path, DOES use readCounter', function () {
  const raw = fs.readFileSync(PREVIEW_SRC, 'utf8');
  // strip block + line comments so a prose mention can never satisfy/violate the
  // check — only executable code counts.
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.ok(!/bumpCounter/.test(code), 'counter-bump symbol must not appear in code');
  // M3 — reserveWorkers is the ATOMIC check-and-bump the firing callers use. It
  // MUTATES the counter, so a preview that called it would consume the session's
  // runaway headroom merely by observing. The preview must stay on the pure
  // clampForRunaway.
  assert.ok(!/reserveWorkers/.test(code),
    'the atomic reserve (which bumps) must not appear in code — observation cannot consume headroom');
  assert.ok(/clampForRunaway/.test(code), 'must use the PURE no-bump clamp instead');
  assert.ok(/readCounter/.test(code), 'must source the read-side counter API');
  assert.ok(/require\(['"]\.\/orchestration-runaway['"]\)/.test(code),
    'must import the runaway SoT, not re-implement the counter');
});

// ── read-only invariant (F3): CLI run mutates none of the 3 state files ───────

test('read-only disk: CLI run leaves runaway.json + cost-current.json + STATE.md unchanged', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-ro-'));
  const stateDir = path.join(tmp, '.claude', 'state');
  const costDir = path.join(tmp, '.claude', 'plugins', 'data', 'mccp');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(costDir, { recursive: true });

  const runawayPath = path.join(stateDir, 'orchestration-runaway.json');
  const costPath = path.join(costDir, 'cost-current.json');
  const statePath = path.join(stateDir, 'STATE.md');
  const planPath = path.join(tmp, 'plan.md');

  // seed the three mutable state files + a plan the CLI reads.
  fs.writeFileSync(runawayPath, JSON.stringify({ session_id: 'ro-test', launched: 5, updated_at: '2026-01-01T00:00:00.000Z' }));
  fs.writeFileSync(costPath, JSON.stringify({ cost_usd: 5, threshold_tier: 'green', hard_ceiling_reached: false, last_write_ts: 1 }));
  fs.writeFileSync(statePath, '# STATE sentinel — preview must never touch this\n');
  fs.writeFileSync(planPath, TWO_TASK_PLAN);

  const snap = function (p) {
    return { mtime: fs.statSync(p).mtimeMs, body: fs.readFileSync(p, 'utf8') };
  };
  const before = { runaway: snap(runawayPath), cost: snap(costPath), state: snap(statePath) };

  const childEnv = Object.assign({}, process.env, {
    HOME: tmp, USERPROFILE: tmp, CLAUDE_SESSION_ID: 'ro-test',
    // ensure no ambient opt-out/subscription bends the run
    MCCP_PLAN_FANOUT: '', MCCP_WORK_IMPLEMENT_PARALLEL: '', MCCP_SUBSCRIPTION: '',
  });

  // sanity: os.homedir() in the child resolves to our temp so the cost-state read
  // targets the SEEDED temp file (not the real one).
  const childHome = execFileSync(process.execPath, ['-e', 'process.stdout.write(require("os").homedir())'],
    { env: childEnv, encoding: 'utf8' }).trim();
  assert.equal(childHome, fs.realpathSync(tmp), 'child homedir must be the temp root');

  const out = execFileSync(process.execPath, [PREVIEW_SRC, '--plan', planPath, '--prd', '--json'],
    { env: childEnv, cwd: tmp, encoding: 'utf8' });
  const report = JSON.parse(out);
  // it actually READ the seeded state: cost-state present + runaway launched=5.
  assert.equal(report.cost_state.present, true);
  assert.equal(report.runaway.launched, 5);

  const after = { runaway: snap(runawayPath), cost: snap(costPath), state: snap(statePath) };
  ['runaway', 'cost', 'state'].forEach(function (k) {
    assert.equal(after[k].body, before[k].body, k + ' body must be byte-identical after preview');
    assert.equal(after[k].mtime, before[k].mtime, k + ' mtime must be unchanged after preview');
  });

  fs.rmSync(tmp, { recursive: true, force: true });
});
