'use strict';

// v0.2.8 Task 2.6.1-followup F9 — pr.md Phase 0.3 mutual-exclusion preflight.
//
// MCCP_PR_SKIP_CODEX_REVIEW="<reason>" and CODEX_DEDUPE_AT_PR=1 express
// conflicting intent for the same outcome (suppressing the Phase 2.5.3 Codex
// invocation). The receipt CLI's schema invariant
// (codex_skipped_at_pr ⊕ codex_dedupe_at_pr) is the authoritative gate; Phase
// 0.3 is fail-fast defense-in-depth. This test enforces three layers:
//
//   1. The Bash preflight extracted from pr.md exits 1 on the conflict and
//      passes the two single-set cases.
//   2. pr.md still contains the Phase 0.3 block (grep guard against accidental
//      regression / refactor drop).
//   3. The receipt CLI rejects a receipt with both meta fields set to true,
//      matching the preflight's intent at schema time (parallel safety net).

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { mkTmpRepo, writeFileSync } = require('./helpers');
const { write } = require('../write');

const PR_MD_PATH = path.resolve(__dirname, '../../../commands/pr.md');

function extractPhase03Bash() {
  const body = fs.readFileSync(PR_MD_PATH, 'utf8');
  // The Phase 0.3 section sits between `### Phase 0.3` and the next `### Phase`
  // or `## Phase 1`. We pull the single fenced bash block inside that range.
  const startIdx = body.indexOf('### Phase 0.3');
  assert.ok(startIdx >= 0, 'pr.md must contain `### Phase 0.3` heading (F9 regression guard)');
  // Find the next heading after Phase 0.3 so we don't accidentally grab a later
  // bash block.
  const tail = body.slice(startIdx + 1);
  const nextHeadingIdx = tail.search(/\n(?:## |### )/);
  const section = nextHeadingIdx >= 0 ? tail.slice(0, nextHeadingIdx) : tail;
  const fenceMatch = section.match(/```bash\n([\s\S]*?)\n```/);
  assert.ok(fenceMatch, 'Phase 0.3 section must contain a fenced ```bash block (F9 regression guard)');
  return fenceMatch[1];
}

function runBashWithEnv(snippet, env) {
  // Run on whatever shell the harness exposes as bash. Project uses Git Bash
  // on Windows + /bin/bash elsewhere — both expose POSIX test + exit semantics.
  const baseEnv = Object.assign({}, process.env, env);
  // Make sure we don't leak parent values when the test wants them unset.
  if (env.MCCP_PR_SKIP_CODEX_REVIEW === undefined) delete baseEnv.MCCP_PR_SKIP_CODEX_REVIEW;
  if (env.CODEX_DEDUPE_AT_PR === undefined) delete baseEnv.CODEX_DEDUPE_AT_PR;
  // v0.3.5 — strip ambient MCCP_CODEX_DISABLED so the v0.3.5 mutex blocks
  // (DISABLED + PR_SKIP, DISABLED + DEDUPE) don't trigger from the harness's
  // permanent-bypass setting unless this specific test opts in.
  if (env.MCCP_CODEX_DISABLED === undefined) delete baseEnv.MCCP_CODEX_DISABLED;
  return spawnSync('bash', ['-c', snippet], { env: baseEnv, encoding: 'utf8' });
}

// === (1) Bash preflight behavior ===

test('F9 Phase 0.3: skip-only (MCCP_PR_SKIP_CODEX_REVIEW set, CODEX_DEDUPE_AT_PR unset) passes', () => {
  const snippet = extractPhase03Bash();
  const r = runBashWithEnv(snippet, {
    MCCP_PR_SKIP_CODEX_REVIEW: 'Codex runtime pipe wedged after IDE crash on this branch; manual cross-model review confirmed out-of-band before PR window closes today',
  });
  assert.strictEqual(r.status, 0, `expected exit 0 (skip-only), got ${r.status}: ${r.stderr}`);
  assert.strictEqual(r.stderr, '', `expected no stderr on skip-only path, got: ${r.stderr}`);
});

test('F9 Phase 0.3: dedupe-only (CODEX_DEDUPE_AT_PR=1, MCCP_PR_SKIP_CODEX_REVIEW unset) passes', () => {
  const snippet = extractPhase03Bash();
  const r = runBashWithEnv(snippet, {
    CODEX_DEDUPE_AT_PR: '1',
  });
  assert.strictEqual(r.status, 0, `expected exit 0 (dedupe-only), got ${r.status}: ${r.stderr}`);
  assert.strictEqual(r.stderr, '', `expected no stderr on dedupe-only path, got: ${r.stderr}`);
});

test('F9 Phase 0.3: both set → STOP exit 1 with mutex violation message', () => {
  const snippet = extractPhase03Bash();
  const r = runBashWithEnv(snippet, {
    MCCP_PR_SKIP_CODEX_REVIEW: 'Codex runtime pipe wedged after IDE crash on this branch; manual cross-model review confirmed out-of-band before PR window closes today',
    CODEX_DEDUPE_AT_PR: '1',
  });
  assert.strictEqual(r.status, 1, `expected exit 1 (mutex violation), got ${r.status}`);
  assert.match(r.stderr, /MCCP-GATE-STOP/, 'stderr must surface the MCCP-GATE-STOP marker');
  assert.match(r.stderr, /MCCP_PR_SKIP_CODEX_REVIEW/, 'stderr must name MCCP_PR_SKIP_CODEX_REVIEW');
  assert.match(r.stderr, /CODEX_DEDUPE_AT_PR/, 'stderr must name CODEX_DEDUPE_AT_PR');
  assert.match(r.stderr, /mutual.{0,5}exclus/i, 'stderr must explain the mutex semantics');
});

// === (1b) v0.3.5 3-way mutex behavior ===

test('v0.3.5 Phase 0.3: disabled-only (MCCP_CODEX_DISABLED=1) passes silently', () => {
  const snippet = extractPhase03Bash();
  const r = runBashWithEnv(snippet, {
    MCCP_CODEX_DISABLED: '1',
  });
  assert.strictEqual(r.status, 0, `expected exit 0 (disabled-only), got ${r.status}: ${r.stderr}`);
  assert.strictEqual(r.stderr, '', `expected no stderr on disabled-only path, got: ${r.stderr}`);
});

test('v0.3.5 Phase 0.3: disabled + PR_SKIP → warn-only, unset PR_SKIP, exit 0 (env policy wins)', () => {
  const snippet = extractPhase03Bash();
  const r = runBashWithEnv(snippet, {
    MCCP_CODEX_DISABLED: '1',
    MCCP_PR_SKIP_CODEX_REVIEW: 'manual escape that should be dropped because env policy is canonical anyway',
  });
  assert.strictEqual(r.status, 0,
    `expected exit 0 (disabled wins, PR_SKIP silently dropped), got ${r.status}: ${r.stderr}`);
  assert.match(r.stderr, /MCCP_CODEX_DISABLED=1 active.*redundant/,
    'stderr must warn about MCCP_PR_SKIP_CODEX_REVIEW being dropped');
});

test('v0.3.5 Phase 0.3: disabled + DEDUPE → STOP exit 1 (env policy + auto-dedupe is contradictory)', () => {
  const snippet = extractPhase03Bash();
  const r = runBashWithEnv(snippet, {
    MCCP_CODEX_DISABLED: '1',
    CODEX_DEDUPE_AT_PR: '1',
  });
  assert.strictEqual(r.status, 1, `expected exit 1 (disabled+dedupe mutex violation), got ${r.status}`);
  assert.match(r.stderr, /MCCP-GATE-STOP/);
  assert.match(r.stderr, /MCCP_CODEX_DISABLED/);
  assert.match(r.stderr, /CODEX_DEDUPE_AT_PR/);
});

// === (2) pr.md structural guard ===

test('F9 Phase 0.3: pr.md retains the named subsection (regression guard)', () => {
  const body = fs.readFileSync(PR_MD_PATH, 'utf8');
  assert.match(body, /### Phase 0\.3 — Codex-skip mutual-exclusion preflight/,
    'pr.md must keep the named Phase 0.3 subsection so the F9 contract stays discoverable');
  // v0.3.5 — header subtitle changed to `v0.2.8 F9 + v0.3.5 3-way` when the
  // 3-way mutex landed. Accept both phrasings so the F9 lineage citation
  // survives without re-rev'ing this test for every absorption.
  assert.match(body, /v0\.2\.8\b.*F9|F9.*v0\.2\.8/,
    'pr.md Phase 0.3 must cite the F9 origin so future refactors keep the lineage');
});

// === (3) Receipt CLI schema XOR (parallel safety net) ===

function setupRepo() {
  const repo = mkTmpRepo();
  const plan = writeFileSync(repo, '.claude/plans/feature-f9.plan.md', '# feature f9\n\nbody\n');
  return { repo: repo, plan: plan, planRel: path.relative(repo, plan) };
}

test('F9 schema safety net: receipt with both codex_skipped_at_pr AND codex_dedupe_at_pr is rejected', () => {
  const { repo, planRel } = setupRepo();
  const cwd = process.cwd();
  process.chdir(repo);
  try {
    assert.throws(function () {
      write({
        gate: 'mccp-pr-codex',
        decision: 'feature-f9',
        plan: planRel,
        'codex-skipped-at-pr': true,
        'codex-skip-reason': 'Codex runtime pipe wedged after IDE crash on this branch; manual cross-model review confirmed out-of-band before PR window closes today',
        'codex-dedupe-at-pr': true,
      });
    }, /codex_dedupe_at_pr \+ codex_skipped_at_pr \+ codex_disabled_at_pr.*mutually exclusive/);
  } finally {
    process.chdir(cwd);
  }
});
