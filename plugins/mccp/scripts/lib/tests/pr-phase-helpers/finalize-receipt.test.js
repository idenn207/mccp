'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { deriveCodexFlags } = require('../../pr-phase-helpers/finalize-receipt');
const helperPath = require.resolve('../../pr-phase-helpers/finalize-receipt.js');
const NODE = process.execPath;

test('deriveCodexFlags: outcome=skipped + reason → --codex-skipped-at-pr + --codex-skip-reason', () => {
  const flags = deriveCodexFlags({ codex_outcome: 'skipped', codex_skip_reason: 'no codex' });
  assert.ok(flags.includes('--codex-skipped-at-pr'));
  const i = flags.indexOf('--codex-skip-reason');
  assert.strictEqual(flags[i + 1], 'no codex');
});

test('deriveCodexFlags: outcome=deduped → --codex-dedupe-at-pr + --codex-verdict skipped', () => {
  // v1.20.3 — deduped never ran Codex at the PR step, so the audit verdict is
  // 'skipped'. The upstream converged signal lives on the plan/implement receipts.
  const flags = deriveCodexFlags({ codex_outcome: 'deduped' });
  assert.deepStrictEqual(flags, ['--codex-dedupe-at-pr', '--codex-verdict', 'skipped']);
});

test('deriveCodexFlags: approve + actionable findings → converged + --codex-actionable-findings', () => {
  // v1.22.3 M3 — 'invoked' alone no longer implies convergence. codex-runner's
  // fail-stop is on the wrapper ENVELOPE (transport: classification/blocking),
  // NOT on the review's verdict, so an approving verdict must be asserted
  // explicitly. Findings that survive the scope filter still ride their own flag.
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_verdict: 'approve',
    codex_actionable_findings: true,
  });
  assert.deepStrictEqual(flags, ['--codex-verdict', 'converged', '--codex-actionable-findings']);
});

// v1.22.3 M3 (Implement-Codex R1 F1) — the rubber-stamp regression. 'invoked' used
// to map unconditionally to 'converged', so a needs-attention ("No ship") review
// produced a receipt certifying convergence — and since evaluateForDedupe keys on
// codex_verdict==='converged', that receipt could even authorize a later dedupe.
test('M3: invoked + needs-attention → divergent (never stamps convergence)', () => {
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_verdict: 'needs-attention',
    codex_actionable_findings: true,
  });
  const i = flags.indexOf('--codex-verdict');
  assert.strictEqual(flags[i + 1], 'divergent');
});

test('M3: invoked + unreadable verdict (null) → unavailable (fail-closed)', () => {
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_verdict: null,
    codex_actionable_findings: true,
  });
  const i = flags.indexOf('--codex-verdict');
  assert.strictEqual(flags[i + 1], 'unavailable',
    'an unreadable review cannot certify approval');
});

test('deriveCodexFlags: codex_outcome → codex_verdict mapping (v1.20.3 Task 4 · M3 verdict-aware)', () => {
  const verdictOf = (outcome, codexVerdict) => {
    const flags = deriveCodexFlags({ codex_outcome: outcome, codex_verdict: codexVerdict });
    const i = flags.indexOf('--codex-verdict');
    return i === -1 ? null : flags[i + 1];
  };
  assert.strictEqual(verdictOf('invoked', 'approve'), 'converged');
  assert.strictEqual(verdictOf('invoked', 'needs-attention'), 'divergent');
  assert.strictEqual(verdictOf('invoked', null), 'unavailable');
  // Non-invoked outcomes never ran Codex at the PR step — verdict-independent.
  assert.strictEqual(verdictOf('disabled'), 'skipped');
  assert.strictEqual(verdictOf('skipped'), 'skipped');
  assert.strictEqual(verdictOf('deduped'), 'skipped');
  // Unknown / absent outcome forwards no verdict (present-only).
  assert.strictEqual(verdictOf('mystery'), null);
  assert.strictEqual(deriveCodexFlags(null).indexOf('--codex-verdict'), -1);
});

test('deriveCodexFlags: null / load_error → empty flag set', () => {
  assert.deepStrictEqual(deriveCodexFlags(null), []);
  assert.deepStrictEqual(deriveCodexFlags({ _load_error: 'x' }), []);
});

test('M3 deriveCodexFlags: a11y_auto_invoked=true → --a11y-auto-invoked forwarded', () => {
  const flags = deriveCodexFlags({ codex_outcome: 'invoked', a11y_auto_invoked: true });
  assert.ok(flags.includes('--a11y-auto-invoked'), JSON.stringify(flags));
});

test('M3 deriveCodexFlags: a11y_auto_invoked absent/false → flag omitted', () => {
  assert.ok(!deriveCodexFlags({ codex_outcome: 'invoked' }).includes('--a11y-auto-invoked'));
  assert.ok(!deriveCodexFlags({ codex_outcome: 'invoked', a11y_auto_invoked: false }).includes('--a11y-auto-invoked'));
});

test('CLI: missing --decision fails', () => {
  const r = spawnSync(NODE, [helperPath, '--plan', 'p'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--decision/);
});

test('CLI: receipt-cli not found path surfaces error', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-no-cli-'));
  const r = spawnSync(NODE, [helperPath,
    '--decision', 'x',
    '--plan', '/tmp/plan.md',
    '--quiet',
  ], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { CLAUDE_PLUGIN_ROOT: tmp }),
  });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /receipt-cli not found|receipt cli error/);
});

// ── v1.22.3 M3 follow-up — R1 F1 + F4: scope-excluded effective verdict ───────

// Implement-Codex R1 F4 — scope-exclusion must NEVER rewrite the sealed verdict.
//
// These tests previously asserted the opposite (scope_excluded mapped
// needs-attention → converged). That behavior rested on broad keyword matching
// with no producer scope field to verify against, and resolution.codex_verdict is
// the cross-gate dedupe key — so it could both drop a real security finding AND
// authorize a dedupe that skips PR-Codex. The verdict now stays honest; the flags
// exist to EXPLAIN the block, which is what the original complaint asked for.
test('R1-F4: scope_excluded does NOT rewrite needs-attention (stays divergent)', () => {
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_verdict: 'needs-attention',
    codex_scope_excluded_verdict: true,
    codex_actionable_findings: true,
  });
  const i = flags.indexOf('--codex-verdict');
  assert.strictEqual(flags[i + 1], 'divergent',
    'keyword-matched drops are not evidence strong enough to authorize a pass');
});

test('R1-F4: scope_excluded + raw verdict are stamped as AUDIT so the block is explainable', () => {
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_verdict: 'needs-attention',
    codex_scope_excluded_verdict: true,
    codex_actionable_findings: true,
  });
  assert.ok(flags.includes('--codex-scope-excluded-verdict'));
  const i = flags.indexOf('--codex-raw-verdict');
  assert.ok(i !== -1, 'the raw verdict must stay machine-readable in the sealed receipt');
  assert.strictEqual(flags[i + 1], 'needs-attention');
});

test('R1-F4 GUARD: scope_excluded never turns an unreadable review into a verdict', () => {
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_verdict: null,
    codex_scope_excluded_verdict: true,
    codex_actionable_findings: true,
  });
  const i = flags.indexOf('--codex-verdict');
  assert.strictEqual(flags[i + 1], 'unavailable', 'fail-closed must never be relaxed');
  assert.ok(!flags.includes('--codex-raw-verdict'),
    'there is no raw verdict to preserve when the review could not be read');
});

test('R1-F4: an approving verdict is unaffected by the scope-excluded flag', () => {
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_verdict: 'approve',
    codex_scope_excluded_verdict: true,
    codex_actionable_findings: false,
  });
  const i = flags.indexOf('--codex-verdict');
  assert.strictEqual(flags[i + 1], 'converged');
});

test('F1 GUARD: needs-attention WITHOUT scope_excluded stays divergent (no silent pass)', () => {
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_verdict: 'needs-attention',
    codex_actionable_findings: true,
  });
  const i = flags.indexOf('--codex-verdict');
  assert.strictEqual(flags[i + 1], 'divergent');
  assert.ok(!flags.includes('--codex-raw-verdict'),
    'raw is only stamped when the effective verdict diverges from it');
});

// ── integrity-unification M3 — runtime primary ship gate (finalize) ───────────
//
// End-to-end: finalize writes the mccp-pr-codex receipt via the real receipt CLI,
// then re-reads it and enforces deriveShipDecision. Run with MCCP_BRIEFING=off so
// the receipt-write briefing path (a documented hang in some envs; verdict-SoT is
// unaffected — only the summary stamp is skipped) does not stall the subprocess.

const { mkTmpRepo, writeFileSync } = require('../../../receipt/tests/helpers');

function runFinalize(repo, opts) {
  opts = opts || {};
  const gate = opts.gate || 'mccp-pr-codex';
  const decision = opts.decision || 'feat-x';
  const planRel = '.claude/plans/' + decision + '.plan.md';
  writeFileSync(repo, planRel, '# Plan: ' + decision + '\n\nbody\n');
  const argv = [helperPath, '--gate', gate, '--decision', decision, '--plan', planRel, '--quiet'];
  if (opts.codexResult) {
    const crPath = path.join(repo, 'codex-result.json');
    fs.writeFileSync(crPath, JSON.stringify(opts.codexResult), 'utf8');
    argv.push('--codex-result', crPath);
  }
  if (opts.overrideReason) {
    argv.push('--pr-codex-force-override-reason', opts.overrideReason);
  }
  return spawnSync(NODE, argv, {
    cwd: repo,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      MCCP_BRIEFING: 'off',
      // ensure no stale caller env forces an override during the block tests
      MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE: '',
    }, opts.env || {}),
  });
}

const M3_FIN_REASON =
  'cherry-pick PR whose diff was already adversarially reviewed upstream branch';

test('M3 finalize: divergent (needs-attention) → exit 12 + GATE-STOP, push blocked', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    codexResult: { codex_outcome: 'invoked', codex_verdict: 'needs-attention' },
  });
  assert.strictEqual(r.status, 12, r.stderr + r.stdout);
  assert.match(r.stderr, /MCCP-GATE-STOP.*PR-Codex non-approving.*verdict=divergent/s);
});

test('M3 finalize: approve → converged → exit 0 (ships)', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    codexResult: { codex_outcome: 'invoked', codex_verdict: 'approve' },
  });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
});

test('M3 finalize: skipped WITH audited reason → exit 0 (proven skip ships)', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    codexResult: { codex_outcome: 'skipped', codex_skip_reason: M3_FIN_REASON },
  });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
});

test('M3 finalize: deduped → exit 0 (dedupe proof ships)', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    decision: 'feat-dedupe',
    codexResult: { codex_outcome: 'deduped' },
  });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
});

// F2 — a `skipped` outcome with NO backing reason/proof must NOT ship.
test('M3 finalize: skipped WITHOUT reason (unproven) → exit 12 (fail-closed) [F2]', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    decision: 'feat-unproven',
    codexResult: { codex_outcome: 'skipped' },
  });
  assert.strictEqual(r.status, 12, r.stderr + r.stdout);
  assert.match(r.stderr, /verdict=skipped-unproven/);
});

test('M3 finalize: unreadable verdict (null) → unavailable → exit 12 (fail-closed)', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    codexResult: { codex_outcome: 'invoked', codex_verdict: null },
  });
  assert.strictEqual(r.status, 12, r.stderr + r.stdout);
  assert.match(r.stderr, /verdict=unavailable/);
});

test('M3 finalize: divergent + override reason (env authorized) → exit 0 + meta stamp (verdict sealed)', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    decision: 'feat-ov',
    codexResult: { codex_outcome: 'invoked', codex_verdict: 'needs-attention' },
    overrideReason: M3_FIN_REASON,
    // santa-loop R1 (Codex FAIL): the override now requires MCCP_FORCE_PR_WITHOUT_
    // CODEX_CONVERGENCE to be strict-valid in THIS run's env (finalize re-validates
    // provenance). The legit path has the user's env var set — set it here.
    env: { MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE: M3_FIN_REASON },
  });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const receipt = JSON.parse(fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-pr-codex', 'feat-ov.json'), 'utf8'));
  assert.strictEqual(receipt.meta.pr_codex_force_override, true);
  assert.strictEqual(receipt.meta.pr_codex_force_override_reason, M3_FIN_REASON);
  // DD3 — the real verdict is sealed unchanged, NOT laundered to converged.
  assert.strictEqual(receipt.resolution.codex_verdict, 'divergent');
});

// santa-loop R1 (Codex FAIL absorption, suggestion #3) — a forwarded override
// reason flag ALONE, with NO MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE set this run
// (the stale/ambient PR_CODEX_FORCE_OVERRIDE_REASON case), must NOT ship a divergent
// PR: the override is dropped fail-closed and the sealed verdict gates the ship.
test('M3 finalize: override reason flag WITHOUT env authorization → divergent still blocked (exit 12) [santa-R1]', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    decision: 'feat-stale-ov',
    codexResult: { codex_outcome: 'invoked', codex_verdict: 'needs-attention' },
    overrideReason: M3_FIN_REASON,
    // runFinalize default env sets MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE: '' —
    // i.e. NOT set this run. The flag is a stale/unprovenanced forward.
  });
  assert.strictEqual(r.status, 12, r.stderr + r.stdout);
  assert.match(r.stderr, /stale\/unprovenanced override.*DROPPING/s);
  assert.match(r.stderr, /PR-Codex non-approving.*verdict=divergent/s);
  // The override was dropped → the receipt seals divergent with NO override stamp.
  const receipt = JSON.parse(fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-pr-codex', 'feat-stale-ov.json'), 'utf8'));
  assert.notStrictEqual(receipt.meta.pr_codex_force_override, true);
  assert.strictEqual(receipt.resolution.codex_verdict, 'divergent');
});

test('M3 finalize: bad override reason (env authorized) → write REJECT (exit != 0, not exit 12)', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    decision: 'feat-bad',
    codexResult: { codex_outcome: 'invoked', codex_verdict: 'approve' },
    overrideReason: 'nope',
    // Env authorizes the override this run (valid reason), but the forwarded reason
    // string itself is malformed — the write-time schema validator is the backstop
    // that REJECTs it (defense-in-depth beyond the provenance gate).
    env: { MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE: M3_FIN_REASON },
  });
  // schema REJECT at write time (exit 2) — ship-gate never runs.
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /pr_codex_force_override_reason rejected|schema validation failed/);
});

test('M3 finalize: plan gate finalize is NOT ship-gated (divergent verdict, exit 0)', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    gate: 'mccp-plan-codex',
    decision: 'feat-plan',
    codexResult: { codex_outcome: 'invoked', codex_verdict: 'needs-attention' },
  });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
});

// ── v1.23.5 gate-guard-integrity M1 — guard 3, exercised on a STANDARD install ─
//
// The env var these tests set is not a synthetic condition: MCCP_CODEX_DISABLED=1
// lives in the user's ~/.claude/settings.json, so it is the normal state of this
// gate in production. Every case below sets it EXPLICITLY rather than relying on
// ambient inheritance, so the guard is proved under the configuration that
// disabled it — neutralizing the env would make the suite green against the bug.

test('M3 finalize [v1.23.5]: unproven skip stays exit 12 with MCCP_CODEX_DISABLED=1 explicitly ON', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    decision: 'feat-unproven-envon',
    codexResult: { codex_outcome: 'skipped' }, // no reason → no proof forwarded
    env: { MCCP_CODEX_DISABLED: '1' },
  });
  // Pre-fix this shipped (exit 0): write.js stamped ambient meta.codex_disabled=true
  // and SKIP_PROOF_META_KEYS accepted it, so an unproven skip always found proof.
  assert.strictEqual(r.status, 12, r.stderr + r.stdout);
  assert.match(r.stderr, /verdict=skipped-unproven/);
  const receipt = JSON.parse(fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-pr-codex', 'feat-unproven-envon.json'), 'utf8'));
  // The ambient annotation is still recorded honestly — it just is not ship proof.
  assert.strictEqual(receipt.meta.codex_disabled, true);
  assert.strictEqual(receipt.meta.codex_disabled_at_pr, false);
});

test('M3 finalize [v1.23.5]: audited skip reason survives env and ships (fix B end-to-end)', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    decision: 'feat-audited-envon',
    codexResult: { codex_outcome: 'skipped', codex_skip_reason: M3_FIN_REASON },
    env: { MCCP_CODEX_DISABLED: '1' },
  });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const receipt = JSON.parse(fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-pr-codex', 'feat-audited-envon.json'), 'utf8'));
  // Pre-fix the env canonical overwrote this, and the 14-char literal then failed
  // the strict ≥30-char validator that codex_skipped_at_pr=true triggers.
  assert.strictEqual(receipt.meta.codex_skip_reason, M3_FIN_REASON);
  assert.strictEqual(receipt.meta.codex_skipped_at_pr, true);
});

test('deriveCodexFlags [v1.23.5]: outcome=disabled → --codex-disabled-at-pr + canonical reason', () => {
  const flags = deriveCodexFlags({ codex_outcome: 'disabled', codex_skip_reason: 'codex_disabled' });
  assert.ok(flags.includes('--codex-disabled-at-pr'), 'explicit PR-step claim, not the ambient stamp');
  const i = flags.indexOf('--codex-skip-reason');
  assert.strictEqual(flags[i + 1], 'codex_disabled',
    'schema.js requires the canonical literal whenever codex_disabled_at_pr is set');
  const v = flags.indexOf('--codex-verdict');
  assert.strictEqual(flags[v + 1], 'skipped');
  // Must not claim a sibling axis — schema enforces a 3-way mutex.
  assert.ok(!flags.includes('--codex-skipped-at-pr'));
  assert.ok(!flags.includes('--codex-dedupe-at-pr'));
});

test('M3 finalize [v1.23.5]: outcome=disabled ships via the EXPLICIT marker (fix C)', () => {
  const repo = mkTmpRepo();
  const r = runFinalize(repo, {
    decision: 'feat-disabled',
    codexResult: { codex_outcome: 'disabled', codex_skip_reason: 'codex_disabled' },
    env: { MCCP_CODEX_DISABLED: '1' },
  });
  assert.strictEqual(r.status, 0, 'operator env-policy ship path must survive fix A: ' + r.stderr + r.stdout);
  const receipt = JSON.parse(fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-pr-codex', 'feat-disabled.json'), 'utf8'));
  assert.strictEqual(receipt.meta.codex_disabled_at_pr, true);
  assert.strictEqual(receipt.meta.codex_skip_reason, 'codex_disabled');
  assert.strictEqual(receipt.resolution.codex_verdict, 'skipped');
  // 3-way mutex intact (schema.js:376-380).
  assert.strictEqual(receipt.meta.codex_skipped_at_pr, false);
  assert.strictEqual(receipt.meta.codex_dedupe_at_pr, false);
});

test('M3 finalize [v1.23.5]: outcome=disabled ships even when the WRITE process has no env (fix C)', () => {
  const repo = mkTmpRepo();
  // The codex-result.json is what carries the fact that Codex was disabled; the
  // finalize process need not have inherited the env. Forwarding the canonical
  // reason explicitly is what keeps this schema-valid — relying on write.js to
  // infer it from ambient env would fail the write here.
  const r = runFinalize(repo, {
    decision: 'feat-disabled-noenv',
    codexResult: { codex_outcome: 'disabled', codex_skip_reason: 'codex_disabled' },
    env: { MCCP_CODEX_DISABLED: '' },
  });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const receipt = JSON.parse(fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-pr-codex', 'feat-disabled-noenv.json'), 'utf8'));
  assert.strictEqual(receipt.meta.codex_disabled_at_pr, true);
  assert.strictEqual(receipt.meta.codex_skip_reason, 'codex_disabled');
});

// ── review-record-linkage M3 — the path anchor, all seven branches ───────────
//
// The NEGATIVE branches are the body of this block. With only the positive one,
// deleting the entire anchor leaves the suite green — which is exactly the test-HIGH
// raised against this plan's R3 round.

const { deriveLinkageFlags } = require('../../pr-phase-helpers/finalize-receipt');

const SHIP_PLAN = '.claude/plans/mine.plan.md';
const RECORD = '.claude/reviews/plan-review-mine.md';

function anchorRepo(receipts) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-anch-')));
  const dir = path.join(root, '.claude', 'receipts', 'mccp-plan-codex');
  fs.mkdirSync(dir, { recursive: true });
  Object.keys(receipts).forEach(function (slug) {
    fs.writeFileSync(path.join(dir, slug + '.json'), JSON.stringify(receipts[slug], null, 2));
  });
  return root;
}

function upstream(planPath, reviewSource, recordPath) {
  const meta = { created_at: '2024-01-01T00:00:00.000Z', command: '/mccp:plan', cwd: '.' };
  if (planPath !== undefined) meta.plan_path = planPath;
  if (recordPath !== undefined) meta.review_record_path = recordPath;
  const resolution = { converged: false, rounds: 1 };
  if (reviewSource !== undefined) resolution.review_source = reviewSource;
  return {
    schema_version: 'v1', gate_id: 'mccp-plan-codex', phase: 'plan',
    decision_id: 'x', plan_hash: 'sha256:' + 'c'.repeat(64), round: 1,
    findings: [], resolution: resolution, subject_hash: null, receipt_hash: null, meta: meta,
  };
}

function derive(root) {
  const warnings = [];
  const out = deriveLinkageFlags({
    repoRoot: root, shipPlanPath: SHIP_PLAN,
    warn: function (m) { warnings.push(m); },
  });
  out.warnings = warnings;
  return out;
}

function cleanup(root) { fs.rmSync(root, { recursive: true, force: true }); }

test('M3 anchor 1/7 — review_source=multi-agent forwards the link AND eligibility=true', () => {
  const root = anchorRepo({ mine: upstream(SHIP_PLAN, 'multi-agent', RECORD) });
  const r = derive(root);
  assert.deepEqual(r.flags,
    ['--review-record-path', RECORD, '--plan-review-expected=true']);
  cleanup(root);
});

test('M3 anchor 2/7 — review_source=hybrid is equally eligible', () => {
  const root = anchorRepo({ mine: upstream(SHIP_PLAN, 'hybrid', RECORD) });
  assert.ok(derive(root).flags.indexOf('--plan-review-expected=true') !== -1);
  cleanup(root);
});

test('M3 anchor 3/7 — review_source=codex is the ONE establishable negative, with its reason', () => {
  const root = anchorRepo({ mine: upstream(SHIP_PLAN, 'codex', RECORD) });
  const r = derive(root);
  assert.ok(r.flags.indexOf('--plan-review-expected=false') !== -1);
  const i = r.flags.indexOf('--no-plan-review-reason');
  assert.ok(i !== -1 && typeof r.flags[i + 1] === 'string' && r.flags[i + 1].length > 0,
    'a negative eligibility claim must carry its reason — D2 folds an unexplained ' +
    'false to undecidable, so sealing one would put a claim in the corpus no reader honours');
  cleanup(root);
});

test('M3 anchor 4/7 — NO upstream receipt at all seals nothing', () => {
  const root = anchorRepo({});
  const r = derive(root);
  assert.deepEqual(r.flags, []);
  assert.ok(r.warnings.some(function (w) { return /link_anchor_unresolved/.test(w); }));
  cleanup(root);
});

test('M3 anchor 5/7 — a receipt for a DIFFERENT plan seals nothing', () => {
  // This is the measured state of this branch: the ship slug names M1's receipt.
  // Opening by name would seal another milestone's review as this ship's evidence.
  const root = anchorRepo({ other: upstream('.claude/plans/some-other.plan.md', 'multi-agent', RECORD) });
  const r = derive(root);
  assert.deepEqual(r.flags, []);
  assert.ok(r.warnings.some(function (w) { return /expected exactly 1/.test(w); }));
  cleanup(root);
});

test('M3 anchor 6/7 — TWO receipts sealing the same plan is ambiguous, and the first is NOT chosen', () => {
  // Real here: the same plan can be reviewed under two slugs. Picking a row would
  // reinstate the failure this closes, under a new name.
  const root = anchorRepo({
    a: upstream(SHIP_PLAN, 'multi-agent', RECORD),
    b: upstream(SHIP_PLAN, 'multi-agent', '.claude/reviews/plan-review-other.md'),
  });
  const r = derive(root);
  assert.deepEqual(r.flags, [], 'ambiguity must seal nothing at all');
  assert.ok(r.warnings.some(function (w) { return /ambiguous/.test(w) && /NOT picking the first/.test(w); }));
  cleanup(root);
});

test('M3 anchor 7/7 — a LEGACY receipt (no meta.plan_path) is not a match', () => {
  // Every pre-M3 receipt is in this state, including this milestone's own upstream.
  // Absence must not be promoted to a match.
  const root = anchorRepo({ mine: upstream(undefined, 'multi-agent', RECORD) });
  assert.deepEqual(derive(root).flags, []);
  cleanup(root);
});

test('M3 anchor — an unknown/absent review_source leaves eligibility UNSTAMPED', () => {
  // schema.js:206 explicitly permits a null review_source. "Unknown" is not "not
  // reviewed": sealing false would drop a genuinely reviewed ship out of metric 2's
  // denominator forever, and put a falsehood in a hash-sealed audit field.
  [undefined, null, 'something-else'].forEach(function (src) {
    const root = anchorRepo({ mine: upstream(SHIP_PLAN, src, RECORD) });
    const r = derive(root);
    assert.ok(r.flags.indexOf('--plan-review-expected=true') === -1
      && r.flags.indexOf('--plan-review-expected=false') === -1,
    'eligibility must stay unstamped for review_source=' + JSON.stringify(src));
    // The link itself still travels — it is a separate axis.
    assert.ok(r.flags.indexOf('--review-record-path') !== -1);
    cleanup(root);
  });
});

test('M3 anchor — a malformed carried review_record_path is DROPPED, not forwarded', () => {
  // The upstream receipt is working-tree-only and hash-unverified (the stage guard
  // checks mccp-pr-codex alone). Forwarding a bad value verbatim would reach the ship
  // receipt's schema and fail-CLOSE a terminal ship — an instrumentation field must
  // never widen the ship-blocking condition (R14, applied to the propagation axis).
  ['docs/x.md', '/etc/passwd', '.claude/reviews/../../etc/x.md', ''].forEach(function (bad) {
    const root = anchorRepo({ mine: upstream(SHIP_PLAN, 'multi-agent', bad) });
    const r = derive(root);
    assert.equal(r.flags.indexOf('--review-record-path'), -1,
      JSON.stringify(bad) + ' must not be forwarded');
    // Eligibility is independent and still resolves.
    assert.ok(r.flags.indexOf('--plan-review-expected=true') !== -1);
    cleanup(root);
  });
});

test('M3 anchor — notation variance on the ship side still matches', () => {
  const root = anchorRepo({ mine: upstream('./' + SHIP_PLAN, 'multi-agent', RECORD) });
  const warnings = [];
  const r = deriveLinkageFlags({
    repoRoot: root, shipPlanPath: '.claude//plans/./mine.plan.md',
    warn: function (m) { warnings.push(m); },
  });
  assert.ok(r.flags.indexOf('--review-record-path') !== -1,
    'the anchor must be immune to spelling, since both ends are author transcriptions');
  cleanup(root);
});
