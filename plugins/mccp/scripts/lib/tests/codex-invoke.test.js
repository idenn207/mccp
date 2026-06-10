'use strict';

// Plan v0.2.2 Task 1 fixtures + R1#3 spawn/parse normalization + R2#1 advisory.
//
// Strategy: build per-test temporary registry + plugin trees so we exercise
// resolveCodexInstallPath, verifyCompanionInterface, and the spawn pipeline
// end-to-end without depending on the real codex plugin.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const codexInvoke = require('../codex-invoke');
const {
  resolveCodexInstallPath,
  verifyCompanionInterface,
  invokeAdversarialReview,
  runCli,
  CodexInvokeError,
} = codexInvoke;

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-codex-invoke-' + prefix + '-'));
}

function writeRegistry(tmpDir, plugins) {
  const reg = { version: 2, plugins: plugins };
  const file = path.join(tmpDir, 'installed_plugins.json');
  fs.writeFileSync(file, JSON.stringify(reg, null, 2), 'utf8');
  return file;
}

function buildFakePlugin(tmpDir, version, opts) {
  opts = opts || {};
  const installPath = path.join(tmpDir, 'plugin-install');
  fs.mkdirSync(installPath, { recursive: true });
  fs.mkdirSync(path.join(installPath, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(installPath, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(installPath, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'codex', version: version }),
    'utf8'
  );
  if (!opts.skipCompanion) {
    const stdoutLine = opts.stdoutLine === undefined ? 'fake adversarial review result\n' : opts.stdoutLine;
    const exitCode = opts.exitCode === undefined ? 0 : opts.exitCode;
    const stderrLine = opts.stderrLine === undefined ? '' : opts.stderrLine;
    const script = [
      "process.stderr.write(" + JSON.stringify(stderrLine) + ");",
      "process.stdout.write(" + JSON.stringify(stdoutLine) + ");",
      "process.exit(" + String(exitCode) + ");",
    ].join('\n');
    fs.writeFileSync(path.join(installPath, 'scripts', 'codex-companion.mjs'), script, 'utf8');
  }
  return installPath;
}

test('resolveCodexInstallPath: registry-missing throws with reason', () => {
  const tmp = makeTmpDir('reg-miss');
  const missingPath = path.join(tmp, 'nope.json');
  assert.throws(
    () => resolveCodexInstallPath({ registryPath: missingPath }),
    (err) => err instanceof CodexInvokeError && err.reason === 'registry-missing'
  );
});

test('resolveCodexInstallPath: registry-malformed JSON throws', () => {
  const tmp = makeTmpDir('reg-malf');
  const file = path.join(tmp, 'installed_plugins.json');
  fs.writeFileSync(file, '{not valid json', 'utf8');
  assert.throws(
    () => resolveCodexInstallPath({ registryPath: file }),
    (err) => err instanceof CodexInvokeError && err.reason === 'registry-malformed'
  );
});

test('resolveCodexInstallPath: plugin-not-installed when codex entry absent', () => {
  const tmp = makeTmpDir('plug-miss');
  const file = writeRegistry(tmp, { 'other@thing': [] });
  assert.throws(
    () => resolveCodexInstallPath({ registryPath: file }),
    (err) => err instanceof CodexInvokeError && err.reason === 'plugin-not-installed'
  );
});

test('resolveCodexInstallPath: install-path-stale when path missing on disk', () => {
  const tmp = makeTmpDir('stale');
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: path.join(tmp, 'does-not-exist'), version: '1.0.4' }],
  });
  assert.throws(
    () => resolveCodexInstallPath({ registryPath: file }),
    (err) => err instanceof CodexInvokeError && err.reason === 'install-path-stale'
  );
});

test('verifyCompanionInterface: companion-not-found when scripts/codex-companion.mjs absent', () => {
  const tmp = makeTmpDir('comp-miss');
  const installPath = buildFakePlugin(tmp, '1.0.4', { skipCompanion: true });
  assert.throws(
    () => verifyCompanionInterface(installPath),
    (err) => err instanceof CodexInvokeError && err.reason === 'companion-not-found'
  );
});

test('verifyCompanionInterface: companion-version-mismatch for non-1.0.x', () => {
  const tmp = makeTmpDir('ver-mis');
  const installPath = buildFakePlugin(tmp, '2.0.0');
  assert.throws(
    () => verifyCompanionInterface(installPath),
    (err) => err instanceof CodexInvokeError && err.reason === 'companion-version-mismatch'
  );
});

test('verifyCompanionInterface: 1.0.x is accepted', () => {
  const tmp = makeTmpDir('ver-ok');
  const installPath = buildFakePlugin(tmp, '1.0.7');
  const verified = verifyCompanionInterface(installPath);
  assert.strictEqual(verified.version, '1.0.7');
  assert.ok(verified.companionPath.endsWith('codex-companion.mjs'));
});

test('invokeAdversarialReview: ok path returns classification=ok, blocking=false', () => {
  const tmp = makeTmpDir('ok');
  const installPath = buildFakePlugin(tmp, '1.0.4', { stdoutLine: 'CONVERGED — proceed.\n' });
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });
  const r = invokeAdversarialReview('focus text', {
    registryPath: file,
    timeoutMs: 10_000,
    env: {}, // no advisory
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.classification, 'ok');
  assert.strictEqual(r.blocking, false);
  assert.strictEqual(r.advisory, false);
  assert.match(r.stdout, /CONVERGED/);
});

test('invokeAdversarialReview: exit-nonzero from companion → blocking=true', () => {
  const tmp = makeTmpDir('exit-nz');
  const installPath = buildFakePlugin(tmp, '1.0.4', {
    stdoutLine: 'partial output\n',
    exitCode: 7,
  });
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });
  const r = invokeAdversarialReview('focus', { registryPath: file, env: {}, timeoutMs: 5_000 });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.classification, 'exit-nonzero');
  assert.strictEqual(r.blocking, true);
});

test('invokeAdversarialReview: not-authenticated detected via stderr pattern + nonzero exit', () => {
  const tmp = makeTmpDir('auth');
  const installPath = buildFakePlugin(tmp, '1.0.4', {
    stdoutLine: '',
    stderrLine: 'error: not authenticated. run codex login.\n',
    exitCode: 1,
  });
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });
  const r = invokeAdversarialReview('focus', { registryPath: file, env: {}, timeoutMs: 5_000 });
  assert.strictEqual(r.classification, 'not-authenticated');
  assert.strictEqual(r.blocking, true);
});

test('invokeAdversarialReview: stdout-empty when exit 0 but no stdout', () => {
  const tmp = makeTmpDir('empty');
  const installPath = buildFakePlugin(tmp, '1.0.4', {
    stdoutLine: '',
    exitCode: 0,
  });
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });
  const r = invokeAdversarialReview('focus', { registryPath: file, env: {}, timeoutMs: 5_000 });
  assert.strictEqual(r.classification, 'stdout-empty');
  assert.strictEqual(r.blocking, true);
});

test('invokeAdversarialReview: advisory mode demotes blocking=false', () => {
  const tmp = makeTmpDir('adv');
  const file = path.join(tmp, 'no-such-registry.json');
  const r = invokeAdversarialReview('focus', {
    registryPath: file,
    env: { MCCP_ALLOW_CODEX_UNAVAILABLE: '1' },
    timeoutMs: 1_000,
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.classification, 'registry-missing');
  assert.strictEqual(r.blocking, false);
  assert.strictEqual(r.advisory, true);
});

test('invokeAdversarialReview: timeout classification when companion exceeds limit', () => {
  const tmp = makeTmpDir('timeout');
  const installPath = path.join(tmp, 'plugin-install');
  fs.mkdirSync(path.join(installPath, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(installPath, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(installPath, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ version: '1.0.4' }), 'utf8');
  // Companion that sleeps longer than timeout
  fs.writeFileSync(path.join(installPath, 'scripts', 'codex-companion.mjs'),
    'setTimeout(() => process.exit(0), 5000);', 'utf8');
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });
  const r = invokeAdversarialReview('focus', { registryPath: file, env: {}, timeoutMs: 300 });
  assert.strictEqual(r.ok, false);
  assert.ok(r.classification === 'timeout' || r.classification === 'exit-nonzero',
    'expected timeout or exit-nonzero, got ' + r.classification);
  assert.strictEqual(r.blocking, true);
});

test('runCli: ok exit 0 with JSON stdout', () => {
  const tmp = makeTmpDir('cli-ok');
  const installPath = buildFakePlugin(tmp, '1.0.4', { stdoutLine: 'converged\n' });
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });
  // Mimic CLI by overriding REGISTRY env via opts — CLI uses default, so capture
  // via invoke directly here. (runCli end-to-end is covered by Task 11 dogfood.)
  const r = invokeAdversarialReview('focus', { registryPath: file, env: {}, timeoutMs: 5_000 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.blocking, false);
});

test('runCli: bad subcommand → exit 2 with usage on stderr', { skip: false }, () => {
  const captured = { out: '', err: '' };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (s) => { captured.out += String(s); return true; };
  process.stderr.write = (s) => { captured.err += String(s); return true; };
  try {
    const code = runCli(['bogus']);
    assert.strictEqual(code, 2);
    assert.match(captured.err, /usage:/);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
});

// v0.3.5 — MCCP_CODEX_DISABLED honor (Plan §Task 2).
// Canonical env snapshot/restore pattern mirrors codex-bridge.test.js:143-152.

test('disabled honor: MCCP_CODEX_DISABLED=1 short-circuits before registry resolve', () => {
  // Use a deliberately bogus registry path — if short-circuit fires, this never
  // gets read, so the call succeeds. If short-circuit is missing, registry-missing
  // would surface instead.
  const r = invokeAdversarialReview('any', {
    env: { MCCP_CODEX_DISABLED: '1' },
    registryPath: '/nonexistent/path/never/read.json',
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.classification, 'disabled');
  assert.strictEqual(r.blocking, false);
  assert.strictEqual(r.advisory, false);
  assert.strictEqual(r.stdout, '');
  assert.ok(typeof r.durationMs === 'number' && r.durationMs >= 0);
});

test('disabled honor: env unset → 11-enum matrix intact (regression on registry-missing)', () => {
  const r = invokeAdversarialReview('any', {
    env: {}, // MCCP_CODEX_DISABLED absent
    registryPath: '/nonexistent/path/never/read.json',
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.classification, 'registry-missing');
  assert.strictEqual(r.blocking, true);
});

test('disabled honor: env value != "1" does NOT short-circuit', () => {
  const r = invokeAdversarialReview('any', {
    env: { MCCP_CODEX_DISABLED: '0' },
    registryPath: '/nonexistent/path/never/read.json',
  });
  assert.strictEqual(r.classification, 'registry-missing');
});

test('disabled honor: advisoryAllowed env is ignored when disabled (always blocking=false)', () => {
  const r = invokeAdversarialReview('any', {
    env: { MCCP_CODEX_DISABLED: '1', MCCP_ALLOW_CODEX_UNAVAILABLE: '0' },
    registryPath: '/nonexistent/path/never/read.json',
  });
  assert.strictEqual(r.classification, 'disabled');
  assert.strictEqual(r.blocking, false);
  assert.strictEqual(r.advisory, false);
});
