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

test('deriveCodexFlags: outcome=deduped → --codex-dedupe-at-pr only', () => {
  const flags = deriveCodexFlags({ codex_outcome: 'deduped' });
  assert.deepStrictEqual(flags, ['--codex-dedupe-at-pr']);
});

test('deriveCodexFlags: actionable findings → --codex-actionable-findings appended', () => {
  const flags = deriveCodexFlags({
    codex_outcome: 'invoked',
    codex_actionable_findings: true,
  });
  assert.deepStrictEqual(flags, ['--codex-actionable-findings']);
});

test('deriveCodexFlags: null / load_error → empty flag set', () => {
  assert.deepStrictEqual(deriveCodexFlags(null), []);
  assert.deepStrictEqual(deriveCodexFlags({ _load_error: 'x' }), []);
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
