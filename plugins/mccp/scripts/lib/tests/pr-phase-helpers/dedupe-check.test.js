'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { buildDedupeNote } = require('../../pr-phase-helpers/dedupe-check');
const helperPath = require.resolve('../../pr-phase-helpers/dedupe-check.js');
const NODE = process.execPath;

test('buildDedupeNote: skip_safe=true with both rounds renders expected text', () => {
  const note = buildDedupeNote({
    skip_safe: true,
    convergence: {
      plan_codex_receipt: { round: 1 },
      implement_codex_receipt: { round: 2 },
    },
  }, 'demo-decision');
  assert.match(note, /demo-decision/);
  assert.match(note, /plan-codex \(round 1\)/);
  assert.match(note, /implement-codex \(round 2\)/);
});

test('buildDedupeNote: skip_safe=false returns empty string', () => {
  const note = buildDedupeNote({ skip_safe: false }, 'x');
  assert.strictEqual(note, '');
});

test('CLI: missing --decision/--plan/--base fails', () => {
  const r = spawnSync(NODE, [helperPath, '--decision', 'x', '--plan', 'y'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--base/);
});

test('CLI: surfaces receipt-cli error in JSON output (does not crash)', () => {
  // Point CLAUDE_PLUGIN_ROOT at a tmp dir with no receipt CLI to force the "not found" path
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-no-receipt-'));
  const r = spawnSync(NODE, [helperPath,
    '--decision', 'x',
    '--plan', '/tmp/plan.md',
    '--base', 'main',
  ], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { CLAUDE_PLUGIN_ROOT: tmp }),
  });
  assert.strictEqual(r.status, 0, 'graceful degradation: still emits JSON');
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.skip_safe, false);
  assert.ok(/receipt-cli-error/.test(out.sources.join(' ')), 'records source error');
});
