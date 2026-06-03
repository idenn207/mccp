'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sw = require('../settings-writer');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-settings-'));
}

test('setEnv: empty settings file → creates env block, writes atomically', () => {
  const dir = tempDir();
  const file = path.join(dir, 'settings.json');
  try {
    const result = sw.setEnv('MCCP_CODEX_DISABLED', '1', { path: file });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.action, 'set');
    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(written.env, { MCCP_CODEX_DISABLED: '1' });
    assert.ok(!fs.existsSync(file + '.tmp'), '.tmp must be cleaned up');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('setEnv: preserves all other top-level keys exactly', () => {
  const dir = tempDir();
  const file = path.join(dir, 'settings.json');
  const initial = {
    model: 'claude-opus-4-7',
    permissions: { allow: ['Bash(git:*)'] },
    hooks: { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: 'node x.js' }] }] },
    env: { EXISTING: 'keep' },
  };
  fs.writeFileSync(file, JSON.stringify(initial, null, 2) + '\n');
  try {
    sw.setEnv('MCCP_CODEX_DISABLED', '1', { path: file });
    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(written.model, 'claude-opus-4-7');
    assert.deepStrictEqual(written.permissions, initial.permissions);
    assert.deepStrictEqual(written.hooks, initial.hooks);
    assert.strictEqual(written.env.EXISTING, 'keep');
    assert.strictEqual(written.env.MCCP_CODEX_DISABLED, '1');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('setEnv: re-setting same value → action=noop, no backup created', () => {
  const dir = tempDir();
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ env: { K: 'v' } }) + '\n');
  try {
    const r = sw.setEnv('K', 'v', { path: file });
    assert.strictEqual(r.action, 'noop');
    assert.ok(!fs.existsSync(file + '.bak'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('setEnv: rotation creates .bak with prior contents on change', () => {
  const dir = tempDir();
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ env: { K: 'old' } }) + '\n');
  try {
    sw.setEnv('K', 'new', { path: file });
    const bak = JSON.parse(fs.readFileSync(file + '.bak', 'utf8'));
    assert.deepStrictEqual(bak.env, { K: 'old' });
    const curr = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepStrictEqual(curr.env, { K: 'new' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('setEnv: dryRun → no file written but returns intended state', () => {
  const dir = tempDir();
  const file = path.join(dir, 'settings.json');
  try {
    const r = sw.setEnv('K', '1', { path: file, dryRun: true });
    assert.strictEqual(r.dryRun, true);
    assert.strictEqual(r.action, 'set');
    assert.ok(!fs.existsSync(file), 'file must NOT exist after dryRun');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unsetEnv: removes key, drops empty env block', () => {
  const dir = tempDir();
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ env: { ONLY: '1' }, model: 'x' }) + '\n');
  try {
    const r = sw.unsetEnv('ONLY', { path: file });
    assert.strictEqual(r.action, 'unset');
    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(!('env' in written), 'env block should be removed when empty');
    assert.strictEqual(written.model, 'x');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unsetEnv: missing key → noop', () => {
  const dir = tempDir();
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ env: { OTHER: '1' } }) + '\n');
  try {
    const r = sw.unsetEnv('MISSING', { path: file });
    assert.strictEqual(r.action, 'noop');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readSettings: corrupt JSON → throws EBADSETTINGS (caller decides recovery)', () => {
  const dir = tempDir();
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, '{not valid');
  try {
    assert.throws(() => sw.readSettings({ path: file }), (err) => err.code === 'EBADSETTINGS');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
