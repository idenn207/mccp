'use strict';

// v1.3.0-m2 Task 5 — validate-cmd design-critique chain-check regression.
//
// 5 fixtures (A-E) per the plan body acceptance:
//   A) plan-codex verdict=divergent + pr validate → blocking, exit non-zero
//   B) plan + implement both converged + pr validate → no blocking
//   C) MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN with substantive reason + chain
//      divergent → advisory mode (warnings, exit 0)
//   D) legacy receipt (design_critique_verdict field absent) → no chain-check,
//      exit 0 (회귀 0)
//   E) plan + implement both converged → no warning surfaced
//
// In-process test — builds receipts via the receipt write helper into a temp
// repo, then runs validate-cmd against it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO_ROOT_PROBE = path.resolve(__dirname, '..', '..', '..', '..', '..');

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-design-critique-test-'));
  spawnSync('git', ['init', '-q', root], { cwd: root });
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@mccp'], { cwd: root });
  spawnSync('git', ['-C', root, 'config', 'user.name', 'mccp-test'], { cwd: root });
  spawnSync('git', ['-C', root, 'config', 'commit.gpgsign', 'false'], { cwd: root });
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  spawnSync('git', ['-C', root, 'add', '.'], { cwd: root });
  spawnSync('git', ['-C', root, 'commit', '-q', '-m', 'init'], { cwd: root });
  return root;
}

function writePlan(repoRoot, slug, body) {
  const planPath = path.join(repoRoot, '.claude', 'plans', slug + '.plan.md');
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, body);
  return planPath;
}

function makeReceiptFixture(repoRoot, gateId, decisionSlug, planPath, opts) {
  // Build via the production write path so subject_hash/receipt_hash match.
  const cliPath = path.resolve(REPO_ROOT_PROBE, 'plugins', 'mccp', 'scripts', 'receipt', 'cli.js');
  const args = [cliPath, 'write',
    '--gate', gateId,
    '--decision', decisionSlug,
    '--plan', planPath,
    '--cwd', repoRoot,
    '--quiet',
  ];
  if (opts && opts.designCritiqueRounds !== undefined) {
    args.push('--design-critique-rounds', String(opts.designCritiqueRounds));
  }
  if (opts && opts.designCritiqueVerdict !== undefined) {
    args.push('--design-critique-verdict', opts.designCritiqueVerdict);
  }
  const res = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      // Silence cost-tier briefing skip during tests
      MCCP_BRIEFING: 'off',
    }),
  });
  if (res.status !== 0) {
    throw new Error('receipt write failed: ' + res.stderr);
  }
  return res.stdout.trim();
}

const { validateCommand } = require('../validate-cmd');

test('A) plan-codex verdict=divergent + /mccp:pr validate → blocking', () => {
  const repo = makeTempRepo();
  const slug = 'fixture-a-divergent-plan';
  const planPath = writePlan(repo, slug, '# Plan A\n\nbody\n');
  makeReceiptFixture(repo, 'mccp-plan-codex', slug, planPath,
    { designCritiqueRounds: 3, designCritiqueVerdict: 'divergent' });
  makeReceiptFixture(repo, 'mccp-implement-codex', slug, planPath,
    { designCritiqueRounds: 1, designCritiqueVerdict: 'converged' });

  const result = validateCommand('mccp:pr', { decisionId: slug, cwd: repo, planPath });
  assert.strictEqual(result.ok, false, 'should not be ok');
  const blockedDivergent = result.blocking.find(function (b) {
    return b.kind === 'design_critique_chain_divergent';
  });
  assert.ok(blockedDivergent, 'expected design_critique_chain_divergent blocking entry');
  assert.strictEqual(blockedDivergent.prior_gate, 'mccp-plan-codex');
});

test('B) plan + implement converged + /mccp:pr validate → no blocking', () => {
  const repo = makeTempRepo();
  const slug = 'fixture-b-converged';
  const planPath = writePlan(repo, slug, '# Plan B\n\nbody\n');
  makeReceiptFixture(repo, 'mccp-plan-codex', slug, planPath,
    { designCritiqueRounds: 1, designCritiqueVerdict: 'converged' });
  makeReceiptFixture(repo, 'mccp-implement-codex', slug, planPath,
    { designCritiqueRounds: 1, designCritiqueVerdict: 'converged' });

  const result = validateCommand('mccp:pr', { decisionId: slug, cwd: repo, planPath });
  assert.strictEqual(result.ok, true, 'should be ok: ' + JSON.stringify(result));
  const blocked = result.blocking.filter(function (b) {
    return b.kind === 'design_critique_chain_divergent';
  });
  assert.strictEqual(blocked.length, 0);
  const warnings = result.warnings.filter(function (w) {
    return w.kind === 'design_critique_divergent';
  });
  assert.strictEqual(warnings.length, 0);
});

test('C) MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN with substantive reason → advisory', () => {
  const repo = makeTempRepo();
  const slug = 'fixture-c-advisory';
  const planPath = writePlan(repo, slug, '# Plan C\n\nbody\n');
  makeReceiptFixture(repo, 'mccp-plan-codex', slug, planPath,
    { designCritiqueRounds: 3, designCritiqueVerdict: 'divergent' });
  makeReceiptFixture(repo, 'mccp-implement-codex', slug, planPath,
    { designCritiqueRounds: 1, designCritiqueVerdict: 'converged' });

  const orig = process.env.MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN;
  process.env.MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN =
    'cherry-pick from external branch with design-critique prior receipt unavailable and manual visual review completed';
  let result;
  try {
    result = validateCommand('mccp:pr', { decisionId: slug, cwd: repo, planPath });
  } finally {
    if (orig === undefined) delete process.env.MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN;
    else process.env.MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN = orig;
  }
  assert.strictEqual(result.ok, true, 'advisory mode should pass: ' + JSON.stringify(result));
  const advisory = result.warnings.find(function (w) {
    return w.kind === 'design_critique_divergent' && /advisory/.test(w.reason);
  });
  assert.ok(advisory, 'expected advisory warning entry: ' +
    JSON.stringify(result.warnings));
});

test('D) legacy receipt (no design_critique_verdict) → no chain-check', () => {
  const repo = makeTempRepo();
  const slug = 'fixture-d-legacy';
  const planPath = writePlan(repo, slug, '# Plan D\n\nbody\n');
  // Write receipts WITHOUT the new fields (mirrors v1.3.0-m1 receipt shape).
  makeReceiptFixture(repo, 'mccp-plan-codex', slug, planPath, {});
  makeReceiptFixture(repo, 'mccp-implement-codex', slug, planPath, {});

  const result = validateCommand('mccp:pr', { decisionId: slug, cwd: repo, planPath });
  assert.strictEqual(result.ok, true, 'legacy receipt should pass: ' + JSON.stringify(result));
  const blocked = result.blocking.filter(function (b) {
    return b.kind === 'design_critique_chain_divergent';
  });
  assert.strictEqual(blocked.length, 0, '회귀 0 invariant');
});

test('E) plan + implement converged + lenient surface — no warning', () => {
  const repo = makeTempRepo();
  const slug = 'fixture-e-no-warn';
  const planPath = writePlan(repo, slug, '# Plan E\n\nbody\n');
  makeReceiptFixture(repo, 'mccp-plan-codex', slug, planPath,
    { designCritiqueRounds: 1, designCritiqueVerdict: 'converged' });
  // Validate at /mccp:prp-implement (lenient gate). No divergence anywhere.
  const result = validateCommand('mccp:prp-implement', {
    decisionId: slug, cwd: repo, planPath,
  });
  assert.strictEqual(result.ok, true);
  const designWarnings = result.warnings.filter(function (w) {
    return w.kind === 'design_critique_divergent';
  });
  assert.strictEqual(designWarnings.length, 0);
});
