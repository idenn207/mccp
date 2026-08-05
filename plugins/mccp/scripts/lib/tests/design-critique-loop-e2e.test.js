'use strict';

// v1.3.0-m2 Task 10 — design-critique retry-loop end-to-end regression.
//
// The retry loop body lives in command-body markdown (plan.md Phase 5.0,
// prp-implement.md 2.5.5b, plan-prd.md 4.0). The loop is a documented Bash
// scaffold so it cannot be import-tested directly. This e2e test exercises
// the underlying primitives the loop body depends on (oracle + cap parser +
// receipt round/verdict stamp + chain-check) in both force_fail=0 and
// force_fail=1 scenarios, mirroring what the command body executes.
//
// MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL is the test-only injection signal: when
// =1, the simulated critique always returns a single HIGH finding, so the
// oracle ESCALATEs each round and hits DIVERGENT_UNRESOLVED at cap. When =0,
// the simulated critique returns [] (converged on first try).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const {
  decideCritique,
  parseRetryCap,
} = require('../design-critique-decide');

const REPO_ROOT_PROBE = path.resolve(__dirname, '..', '..', '..', '..', '..');

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-design-e2e-'));
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, 'config', 'user.email', 'test@mccp']);
  spawnSync('git', ['-C', root, 'config', 'user.name', 'mccp-test']);
  spawnSync('git', ['-C', root, 'config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  spawnSync('git', ['-C', root, 'add', '.']);
  spawnSync('git', ['-C', root, 'commit', '-q', '-m', 'init']);
  return root;
}

// Simulate one iteration of the retry loop body. Returns the receipt-write
// flag tuple that the actual loop would forward.
function simulateRetryLoop(env) {
  const cap = parseRetryCap(env);
  const forceFail = env.MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL === '1';
  let round = 0;
  let verdict = '';
  // Outer guard: cap=0 means "run R0 once then DIVERGENT immediately"
  while (round <= cap) {
    const findings = forceFail
      ? [{ severity: 'HIGH', title: 'forced-fail mock' }]
      : [];
    verdict = decideCritique({ findings, round, cap });
    if (verdict === 'CONVERGED' || verdict === 'DIVERGENT_UNRESOLVED') break;
    round += 1;
  }
  let receiptVerdict;
  switch (verdict) {
    case 'CONVERGED': receiptVerdict = 'converged'; break;
    case 'DIVERGENT_UNRESOLVED': receiptVerdict = 'divergent'; break;
    default: receiptVerdict = 'skipped';
  }
  return {
    cap,
    rounds: round + 1, // invocation count
    verdict: receiptVerdict,
  };
}

test('A) FORCE_FAIL=0 → rounds=1, verdict=converged', () => {
  const result = simulateRetryLoop({
    MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL: '0',
  });
  assert.strictEqual(result.cap, 2);
  assert.strictEqual(result.rounds, 1);
  assert.strictEqual(result.verdict, 'converged');
});

test('B) FORCE_FAIL=1 + cap=2 → rounds=3, verdict=divergent', () => {
  const result = simulateRetryLoop({
    MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL: '1',
  });
  assert.strictEqual(result.cap, 2);
  // R0 fail → R1 fail → R2 fail → DIVERGENT (cap reached) — 3 invocations total
  assert.strictEqual(result.rounds, 3);
  assert.strictEqual(result.verdict, 'divergent');
});

test('C) FORCE_FAIL=1 + cap=0 → rounds=1, verdict=divergent (kill-switch path)', () => {
  const result = simulateRetryLoop({
    MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL: '1',
    MCCP_DESIGN_CRITIQUE_MAX_RETRY: '0',
  });
  assert.strictEqual(result.cap, 0);
  assert.strictEqual(result.rounds, 1);
  assert.strictEqual(result.verdict, 'divergent');
});

test('D) divergent verdict → receipt stamp + validate-cmd chain-check BLOCKs PR', () => {
  const repo = makeTempRepo();
  const slug = 'fixture-d-e2e-divergent';
  const planPath = path.join(repo, '.claude', 'plans', slug + '.plan.md');
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, '# Plan D e2e\n\nbody\n');

  // Simulate the loop result (FORCE_FAIL=1 + cap=2) → divergent
  const loopResult = simulateRetryLoop({
    MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL: '1',
  });

  // Write plan + implement receipts with the loop's rounds/verdict
  const cliPath = path.resolve(REPO_ROOT_PROBE,
    'plugins', 'mccp', 'scripts', 'receipt', 'cli.js');
  for (const gate of ['mccp-plan-codex', 'mccp-implement-codex']) {
    const res = spawnSync(process.execPath, [
      cliPath, 'write',
      '--gate', gate,
      '--decision', slug,
      '--plan', planPath,
      '--cwd', repo,
      '--design-critique-rounds', String(loopResult.rounds),
      '--design-critique-verdict', loopResult.verdict,
      '--quiet',
    ], {
      cwd: repo,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { MCCP_BRIEFING: 'off' }),
    });
    if (res.status !== 0) throw new Error('write failed: ' + res.stderr);
  }

  // Read the receipt back and verify the stamp
  const receiptPath = path.join(repo, '.claude', 'receipts',
    'mccp-plan-codex', slug + '.json');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.strictEqual(receipt.meta.design_critique_rounds, 3);
  assert.strictEqual(receipt.meta.design_critique_verdict, 'divergent');

  // validate-cmd chain-check should BLOCK /mccp:pr
  const { validateCommand } = require('../../receipt/validate-cmd');
  const valResult = validateCommand('mccp:pr', {
    decisionId: slug, cwd: repo, planPath,
  });
  assert.strictEqual(valResult.ok, false);
  const blockedDivergent = valResult.blocking.find(function (b) {
    return b.kind === 'design_critique_chain_divergent';
  });
  assert.ok(blockedDivergent, 'expected chain-check to BLOCK on divergent');
});

test('E) converged verdict → no chain-check warning at PR', () => {
  const repo = makeTempRepo();
  const slug = 'fixture-e-e2e-converged';
  const planPath = path.join(repo, '.claude', 'plans', slug + '.plan.md');
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, '# Plan E e2e\n\nbody\n');

  const loopResult = simulateRetryLoop({
    MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL: '0',
  });

  const cliPath = path.resolve(REPO_ROOT_PROBE,
    'plugins', 'mccp', 'scripts', 'receipt', 'cli.js');
  for (const gate of ['mccp-plan-codex', 'mccp-implement-codex']) {
    const res = spawnSync(process.execPath, [
      cliPath, 'write',
      '--gate', gate,
      '--decision', slug,
      '--plan', planPath,
      '--cwd', repo,
      '--design-critique-rounds', String(loopResult.rounds),
      '--design-critique-verdict', loopResult.verdict,
      '--quiet',
    ], {
      cwd: repo,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { MCCP_BRIEFING: 'off' }),
    });
    if (res.status !== 0) throw new Error('write failed: ' + res.stderr);
  }

  const { validateCommand } = require('../../receipt/validate-cmd');
  const valResult = validateCommand('mccp:pr', {
    decisionId: slug, cwd: repo, planPath,
  });
  assert.strictEqual(valResult.ok, true,
    'converged chain should pass: ' + JSON.stringify(valResult));
  const designBlock = valResult.blocking.find(function (b) {
    return b.kind === 'design_critique_chain_divergent';
  });
  assert.strictEqual(designBlock, undefined);
  const designWarn = valResult.warnings.find(function (w) {
    return w.kind === 'design_critique_divergent';
  });
  assert.strictEqual(designWarn, undefined);
});

test('F) fixture 합성 + detector 검증 (축 b design-surface whitelist)', () => {
  // 축 b whitelist는 .claude/cache/test-fixture-status.html 이 plan 에서
  // 언급되면 detector signal 로 동작하게 한다. repo 에 fixture 가 존재하는지
  // 묻지 않고, plan markdown 에서 whitelist path 를 인식하는지 검증한다
  // — 이것이 §3.9 가 서술한 실제 계약이다.
  const {
    findDesignSignalInArtifact,
  } = require('../impeccable-detect');

  // test-time 합성 — 임시 디렉터리 + fixture plan
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-fixture-test-'));
  const planDir = path.join(tempDir, '.claude', 'plans');
  fs.mkdirSync(planDir, { recursive: true });

  // Plan markdown 이 .claude/cache/test-fixture-status.html 을 reference
  const planContent = `# Test Plan

## Summary
Test the design-surface whitelist detector.

## Files to Change

| File | Action | Why |
|---|---|---|
| \`.claude/cache/test-fixture-status.html\` | UPDATE | v1.3.0-m2 Task 10 fixture for impeccable-detect whitelist axis-b |

## Tasks
- Verify detector recognizes whitelist paths
`;
  const planPath = path.join(planDir, 'fixture-test.plan.md');
  fs.writeFileSync(planPath, planContent);

  // detector 호출 — plan 이 .claude/cache/test-fixture-status.html 을 언급하면
  // detector 가 design_signal=true 로 반환
  const signalFiles = findDesignSignalInArtifact(planPath);
  assert.ok(signalFiles.length > 0,
    'impeccable-detect 가 plan 의 Files to Change 에서 .claude/cache/test-fixture-status.html 을 인식');
  assert.ok(signalFiles.some((f) => f.includes('test-fixture-status.html')),
    'signal file 목록에 fixture 경로 포함');

  // cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
});
