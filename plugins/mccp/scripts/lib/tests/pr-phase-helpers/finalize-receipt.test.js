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
