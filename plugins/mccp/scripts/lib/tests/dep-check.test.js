'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const depCheck = require('../dep-check');

function withTempFile(contents, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-depcheck-'));
  const file = path.join(dir, 'installed_plugins.json');
  if (contents !== null) fs.writeFileSync(file, contents, 'utf8');
  try {
    return fn(file, dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
  }
}

test('readInstalledPlugins: missing file returns empty manifest', () => {
  const result = depCheck.readInstalledPlugins(path.join(os.tmpdir(), 'mccp-nonexistent-' + Date.now() + '.json'));
  assert.deepStrictEqual(result, { plugins: {} });
});

test('readInstalledPlugins: malformed JSON returns empty manifest (no throw)', () => {
  withTempFile('{not valid json', (file) => {
    const result = depCheck.readInstalledPlugins(file);
    assert.deepStrictEqual(result, { plugins: {} });
  });
});

test('checkCodexPlugin: codex installed → installed=true with version', () => {
  const payload = JSON.stringify({
    version: 2,
    plugins: {
      'codex@openai-codex': [
        { scope: 'user', version: '1.0.4', installPath: '/fake/path' },
      ],
    },
  });
  withTempFile(payload, (file) => {
    const result = depCheck.checkCodexPlugin({ installedPluginsPath: file });
    assert.strictEqual(result.installed, true);
    assert.strictEqual(result.version, '1.0.4');
    assert.strictEqual(result.scope, 'user');
  });
});

test('checkCodexPlugin: codex missing → installed=false', () => {
  const payload = JSON.stringify({
    version: 2,
    plugins: { 'other@some-marketplace': [{ scope: 'user', version: '0.1.0' }] },
  });
  withTempFile(payload, (file) => {
    const result = depCheck.checkCodexPlugin({ installedPluginsPath: file });
    assert.strictEqual(result.installed, false);
  });
});

test('checkCodexPlugin: empty array for the key → installed=false', () => {
  const payload = JSON.stringify({ version: 2, plugins: { 'codex@openai-codex': [] } });
  withTempFile(payload, (file) => {
    const result = depCheck.checkCodexPlugin({ installedPluginsPath: file });
    assert.strictEqual(result.installed, false);
  });
});

test('checkImpeccableCli: cross-platform finder runs without throwing', () => {
  const result = depCheck.checkImpeccableCli();
  assert.ok(typeof result.installed === 'boolean');
  if (result.installed) {
    assert.ok(typeof result.path === 'string');
  }
});

test('checkAll: assembles all three fields + checked_at ISO timestamp', () => {
  withTempFile(JSON.stringify({ plugins: {} }), (file) => {
    const result = depCheck.checkAll({ installedPluginsPath: file });
    assert.ok(result.codex_plugin);
    assert.ok(result.impeccable_cli);
    assert.strictEqual(typeof result.codex_disabled, 'boolean');
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(result.checked_at));
  });
});

test('checkAll: MCCP_CODEX_DISABLED=1 → codex_disabled=true', () => {
  const prev = process.env.MCCP_CODEX_DISABLED;
  process.env.MCCP_CODEX_DISABLED = '1';
  try {
    const result = depCheck.checkAll({ installedPluginsPath: path.join(os.tmpdir(), 'never') });
    assert.strictEqual(result.codex_disabled, true);
  } finally {
    if (prev === undefined) delete process.env.MCCP_CODEX_DISABLED;
    else process.env.MCCP_CODEX_DISABLED = prev;
  }
});
