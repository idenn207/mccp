'use strict';

// diverse-agent-review M1 — emit-workflow-args, the seam where the runaway
// reservation becomes an actual launch set.
//
// Two defects lived here and neither was reachable from a pure-oracle test:
//
//   1. the emitted payload had no `fleetKeys` key at all, while
//      workflows/plan-review.js reads exactly that field and degrades to ONE
//      reviewer when it is missing — so the panel was permanently a single agent
//      that could never satisfy a 3-response quorum;
//   2. nothing capped the fleet by what the reservation granted. reserveWorkers
//      clamps to the remaining session headroom, so reserving 4 and receiving 2
//      is ordinary; firing 4 anyway launched two agents the cap never recorded.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runCli, EX_OK, EX_BLOCK, EX_USAGE } = require('../plan-review/cli');

const PLAN = [
  '# Plan: emit',
  '',
  '## Summary',
  'x',
  '',
  '## Files to Change',
  '',
  '| File | Action | Why |',
  '|---|---|---|',
  '| `CHANGELOG.md` | UPDATE | row |',
  '',
  '## Tasks',
  '',
  '### Task 1: only',
  '- **Validate**: `node --test`',
  '',
  '## Validation',
  '`node --test`',
  '',
  '## Risks',
  '| Risk | Mitigation |',
  '|---|---|',
  '| none | n/a |',
  '',
  '## Acceptance',
  '- [ ] done',
  '',
].join('\n');

function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-review-emit-'));
  const planPath = path.join(dir, 'x.plan.md');
  fs.writeFileSync(planPath, PLAN, 'utf8');
  const outPath = path.join(dir, 'args.json');
  const savedQuorum = process.env.MCCP_PLAN_REVIEW_QUORUM;
  const savedRoles = process.env.MCCP_PLAN_REVIEW_ROLES_MIN;
  const savedWrite = process.stdout.write;
  process.stdout.write = function () { return true; };   // the CLI prints JSON
  try {
    return fn({ dir: dir, planPath: planPath, outPath: outPath });
  } finally {
    process.stdout.write = savedWrite;
    if (savedQuorum === undefined) delete process.env.MCCP_PLAN_REVIEW_QUORUM;
    else process.env.MCCP_PLAN_REVIEW_QUORUM = savedQuorum;
    if (savedRoles === undefined) delete process.env.MCCP_PLAN_REVIEW_ROLES_MIN;
    else process.env.MCCP_PLAN_REVIEW_ROLES_MIN = savedRoles;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function emit(ctx, extraArgs) {
  const argv = ['emit-workflow-args', '--plan', ctx.planPath, '--out', ctx.outPath]
    .concat(extraArgs || []);
  const code = runCli(argv);
  const payload = fs.existsSync(ctx.outPath)
    ? JSON.parse(fs.readFileSync(ctx.outPath, 'utf8')) : null;
  return { code: code, payload: payload };
}

test('the payload carries fleetKeys — the field the workflow actually reads', () => {
  withTmp(function (ctx) {
    const { code, payload } = emit(ctx);
    assert.equal(code, EX_OK);
    assert.ok(Array.isArray(payload.fleetKeys), 'fleetKeys must be present');
    assert.deepEqual(payload.fleetKeys, payload.fleet.map(function (f) { return f.key; }),
      'fleetKeys must mirror the emitted fleet exactly');
    assert.equal(payload.fleetKeys.length, 4, 'default panel is the full four');
  });
});

test('--granted caps the fleet to what the reservation actually allowed', () => {
  withTmp(function (ctx) {
    process.env.MCCP_PLAN_REVIEW_QUORUM = '2of4';
    const { code, payload } = emit(ctx, ['--granted', '2']);
    assert.equal(code, EX_OK);
    assert.equal(payload.fleet.length, 2, 'two granted → two launched');
    assert.deepEqual(payload.fleetKeys, ['architect', 'security']);
    assert.equal(payload.quorum.of, 2,
      'quorum.of records the panel FIELDED, which review_proof must describe');
  });
});

test('a grant that cannot satisfy the quorum is refused before the spend', () => {
  withTmp(function (ctx) {
    // default 3of4 with only 2 workers granted: the panel would run, cost tokens
    // and then fail on arithmetic alone.
    const { code, payload } = emit(ctx, ['--granted', '2']);
    assert.equal(code, EX_BLOCK);
    assert.equal(payload, null, 'no args file is written for a refused fleet');
  });
});

test('--granted 0 blocks (the reservation denied every worker)', () => {
  withTmp(function (ctx) {
    assert.equal(emit(ctx, ['--granted', '0']).code, EX_BLOCK);
  });
});

test('a malformed --granted is CLI misuse, never a silent full fleet', () => {
  withTmp(function (ctx) {
    ['abc', '-1', '2.5'].forEach(function (raw) {
      const { code, payload } = emit(ctx, ['--granted', raw]);
      assert.equal(code, EX_USAGE, raw);
      assert.equal(payload, null, raw);
    });
  });
});

test('omitting --granted keeps the pre-existing uncapped behaviour', () => {
  withTmp(function (ctx) {
    const { code, payload } = emit(ctx);
    assert.equal(code, EX_OK);
    assert.equal(payload.fleet.length, 4);
    assert.equal(payload.quorum.of, 4);
  });
});

test('rolesMin in the payload is clamped to the fielded panel', () => {
  withTmp(function (ctx) {
    process.env.MCCP_PLAN_REVIEW_QUORUM = '2of4';
    process.env.MCCP_PLAN_REVIEW_ROLES_MIN = '4';
    const { payload } = emit(ctx, ['--granted', '2']);
    assert.equal(payload.quorum.rolesMin, 2,
      'K cannot exceed the number of reviewers actually fielded');
  });
});

test('the emitted reviewedPlanHash binds the plan as it is NOW (DD13)', () => {
  withTmp(function (ctx) {
    const first = emit(ctx).payload.reviewedPlanHash;
    assert.match(first, /^sha256:[0-9a-f]{64}$/);

    fs.writeFileSync(ctx.planPath, PLAN + '\n## Codex Adversarial Review\n\n- x\n', 'utf8');
    const second = emit(ctx).payload.reviewedPlanHash;
    assert.notEqual(second, first,
      'appending a section changes plan_hash — this is why the plan is frozen ' +
      'between emit and the receipt write');
  });
});
