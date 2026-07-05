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

test('deriveCodexFlags: actionable findings → --codex-verdict converged + --codex-actionable-findings', () => {
  // v1.20.3 — reaching finalize with outcome=invoked means codex-runner did not
  // fail-stop (class ok, non-blocking) → 'converged'. Actionable findings are
  // advisory (PR body inject) and tracked by their own flag.
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_actionable_findings: true,
  });
  assert.deepStrictEqual(flags, ['--codex-verdict', 'converged', '--codex-actionable-findings']);
});

test('deriveCodexFlags: codex_outcome → codex_verdict mapping (v1.20.3 Task 4)', () => {
  const verdictOf = (outcome) => {
    const flags = deriveCodexFlags({ codex_outcome: outcome });
    const i = flags.indexOf('--codex-verdict');
    return i === -1 ? null : flags[i + 1];
  };
  assert.strictEqual(verdictOf('invoked'), 'converged');
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
