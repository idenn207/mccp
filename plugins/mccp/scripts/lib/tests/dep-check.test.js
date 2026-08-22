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

// ---------------------------------------------------------------------------
// checkImpeccable — M2 wiring (impeccable-detection-contract)
//
// dep-check joins the impeccable oracle here. Two things have to hold and
// neither is visible without a test: the require cycle must stay broken, and a
// failure must land on `available:false` rather than on a permissive default.
// ---------------------------------------------------------------------------

const { spawnSync } = require('node:child_process');

const LIB_DIR = path.join(__dirname, '..');

function withSkillEnvCleared(fn) {
  const prev = process.env.MCCP_IMPECCABLE_SKILL;
  delete process.env.MCCP_IMPECCABLE_SKILL;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.MCCP_IMPECCABLE_SKILL;
    else process.env.MCCP_IMPECCABLE_SKILL = prev;
  }
}

function withTempTree(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-depcheck-imp-'));
  try { return fn(dir); } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
  }
}

function writeSkillMd(dir, version) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    ['---', 'name: impeccable', 'version: ' + version, 'user-invocable: true', '---', '', 'body'].join('\n'),
    'utf8'
  );
  return dir;
}

function writeManifest(dir, entries) {
  const file = path.join(dir, 'installed_plugins.json');
  const plugins = {};
  (entries || []).forEach(function (e) {
    plugins[e.key] = [{ scope: 'user', version: e.version || null, installPath: e.installPath }];
  });
  fs.writeFileSync(file, JSON.stringify({ version: 2, plugins: plugins }), 'utf8');
  return file;
}

// Absent by construction, so a case meaning "no source here" cannot pick up a
// real one — this repository has a genuine .claude/skills/impeccable copy.
function absentPath(dir, label) {
  return path.join(dir, 'absent-' + label);
}

function checkIn(dir, over) {
  return depCheck.checkImpeccable(Object.assign({
    repoRoot: dir,
    installedPluginsPath: absentPath(dir, 'manifest.json'),
    projectSkillDir: absentPath(dir, 'project'),
    userSkillDir: absentPath(dir, 'user'),
  }, over || {}));
}

// The cycle is real: impeccable-detect requires dep-check at top level. If the
// deferred require inside checkImpeccable ever moves back to the top of the
// file, whichever module loads second gets a partial export and the call dies
// with a TypeError. Child processes, because a require cycle is decided by load
// ORDER and this test file has already loaded both by the time it runs.
test('checkImpeccable: both module load orders answer without throwing (circular-require regression)', () => {
  const depCheckPath = JSON.stringify(path.join(LIB_DIR, 'dep-check'));
  const detectPath = JSON.stringify(path.join(LIB_DIR, 'impeccable-detect'));
  const assertShape = 'const r=d.checkImpeccable({});'
    + 'if(typeof r!=="object"||r===null)throw new Error("not an object");'
    + 'if(typeof r.available!=="boolean")throw new Error("no available boolean");';
  const orders = [
    'const d=require(' + depCheckPath + ');' + assertShape,
    'require(' + detectPath + ');const d=require(' + depCheckPath + ');' + assertShape,
  ];
  orders.forEach(function (src, i) {
    const res = spawnSync(process.execPath, ['-e', src], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, 'load order ' + (i + 1) + ' failed: ' + (res.stderr || ''));
  });
});

test('checkImpeccable: plugin-only install resolves the NAMESPACED invocation', () => {
  withSkillEnvCleared(() => {
    withTempTree((dir) => {
      const installPath = path.join(dir, 'plugincache');
      writeSkillMd(path.join(installPath, 'skills', 'impeccable'), '4.1.1');
      const manifest = writeManifest(dir, [
        { key: 'impeccable@impeccable', version: '4.1.1', installPath: installPath },
      ]);
      const r = checkIn(dir, { installedPluginsPath: manifest });
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.invocation, 'impeccable:impeccable');
      assert.strictEqual(r.source, 'plugin');
    });
  });
});

test('checkImpeccable: project copy alone resolves the BARE name', () => {
  withSkillEnvCleared(() => {
    withTempTree((dir) => {
      const projectSkillDir = path.join(dir, '.claude', 'skills', 'impeccable');
      writeSkillMd(projectSkillDir, '3.5.0');
      const r = checkIn(dir, { projectSkillDir: projectSkillDir });
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.invocation, 'impeccable');
      assert.strictEqual(r.source, 'project');
      assert.strictEqual(r.version, '3.5.0');
    });
  });
});

// Two bare bodies: which one opens has never been measured, so the oracle names
// none. `available` stays true — the call resolves, we just cannot say to what.
test('checkImpeccable: two bare sources report shadowed and refuse to name one', () => {
  withSkillEnvCleared(() => {
    withTempTree((dir) => {
      const projectSkillDir = writeSkillMd(path.join(dir, '.claude', 'skills', 'impeccable'), '3.5.0');
      const userSkillDir = writeSkillMd(path.join(dir, 'home', '.claude', 'skills', 'impeccable'), '2.0.0');
      const r = checkIn(dir, { projectSkillDir: projectSkillDir, userSkillDir: userSkillDir });
      assert.strictEqual(r.available, true);
      assert.strictEqual(r.shadowed, true);
      assert.strictEqual(r.source, null);
      assert.strictEqual(r.version, null);
      assert.strictEqual(r.path, null);
      assert.strictEqual(r.invocation, 'impeccable');
    });
  });
});

test('checkImpeccable: no source at all is available:false, not a throw', () => {
  withSkillEnvCleared(() => {
    withTempTree((dir) => {
      const r = checkIn(dir);
      assert.strictEqual(r.available, false);
      assert.strictEqual(r.invocation, null);
      assert.deepStrictEqual(r.sources, []);
    });
  });
});

// dep-check's header declares "Never throws. Returns sentinel objects". A
// deferred require can fail for reasons this module cannot see, so the guard
// has to hold for hostile input too, and it has to fail CLOSED. A permissive
// answer here would tell a gate that impeccable resolves when nothing was
// probed, turning a broken load into a silent design-review skip.
test('checkImpeccable: hostile options still return the sentinel shape with available=false', () => {
  withSkillEnvCleared(() => {
    let r;
    assert.doesNotThrow(() => { r = depCheck.checkImpeccable({ repoRoot: 123 }); });
    assert.strictEqual(typeof r, 'object');
    assert.strictEqual(r.available, false);
    const keys = ['reason', 'invocation', 'source', 'version', 'path', 'sources', 'shadowed'];
    keys.forEach(function (k) {
      assert.ok(Object.prototype.hasOwnProperty.call(r, k), 'sentinel is missing key: ' + k);
    });
  });
});

// The four pre-M2 keys are load-bearing for callers that predate this change.
// A superset is the contract; a rename or a dropped key is not.
test('checkAll: strict superset — the four pre-M2 keys keep their meaning', () => {
  withTempFile(JSON.stringify({ plugins: {} }), (file) => {
    const result = depCheck.checkAll({ installedPluginsPath: file });
    ['codex_plugin', 'impeccable_cli', 'codex_disabled', 'checked_at'].forEach(function (k) {
      assert.ok(Object.prototype.hasOwnProperty.call(result, k), 'lost pre-M2 key: ' + k);
    });
    assert.ok(Object.prototype.hasOwnProperty.call(result, 'impeccable'), 'impeccable key not added');
    assert.strictEqual(typeof result.impeccable.available, 'boolean');
  });
});

test('impeccableLabel: renders source, version and invocation for a resolved skill', () => {
  const label = depCheck.impeccableLabel({
    available: true, shadowed: false, source: 'project', version: '3.5.0', invocation: 'impeccable',
  });
  assert.strictEqual(label, 'available (project v3.5.0, impeccable)');
});

test('impeccableLabel: an ambiguous winner is counted, never named', () => {
  const label = depCheck.impeccableLabel({
    available: true, shadowed: true, source: null, version: null, invocation: 'impeccable',
    sources: [{ source: 'project' }, { source: 'user' }],
  });
  assert.strictEqual(label, 'ambiguous (2 sources)');
});

// SKILL.md frontmatter is a file the USER installed, and this label reaches a
// terminal. A version carrying ANSI escapes would render as terminal control
// rather than as text, so the printer prints only what a version can be.
test('safeLabel: control characters and escapes never reach the terminal', () => {
  assert.strictEqual(depCheck.safeLabel('3.5.0'), '3.5.0');
  assert.strictEqual(depCheck.safeLabel('impeccable:impeccable'), 'impeccable:impeccable');
  assert.strictEqual(depCheck.safeLabel(String.fromCharCode(27) + "[31mred"), "?");
  assert.strictEqual(depCheck.safeLabel('1.0\n2.0'), '?');
  assert.strictEqual(depCheck.safeLabel('x'.repeat(65)), '?');
  assert.strictEqual(depCheck.safeLabel(null), '?');
});
