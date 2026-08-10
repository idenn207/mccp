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

// v0.3.6 — Task 1 (축 1a): design-scope exclusion preamble.
// composeFocus is a pure helper; parseCliArgs is its CLI counterpart; integration
// uses a fake companion that echoes argv so we can inspect what was passed.

const { composeFocus, parseCliArgs, DESIGN_SCOPE_PREAMBLE } = codexInvoke;

test('design-scope preamble: composeFocus impeccableAvailable=true prepends preamble + a11y instruction + categories', () => {
  const original = 'plan focus body';
  const result = composeFocus(original, { impeccableAvailable: true });
  assert.ok(result.startsWith('[design-domain exclusion preamble]'),
    'expected preamble at start, got: ' + result.slice(0, 80));
  assert.ok(result.endsWith(original), 'original focus must remain at end');
  assert.match(result, /accessibility findings.*impeccable a11y-architect/);
  for (const kw of ['visual design', 'color', 'typography', 'micro-interaction',
                    'animation', 'spacing', 'brand']) {
    assert.ok(result.toLowerCase().includes(kw.toLowerCase()),
      'preamble missing category: ' + kw);
  }
});

test('design-scope preamble: composeFocus impeccableAvailable=false → identity', () => {
  const original = 'plan focus body';
  assert.strictEqual(composeFocus(original, { impeccableAvailable: false }), original);
});

test('design-scope preamble: composeFocus no opts → identity', () => {
  const original = 'plan focus body';
  assert.strictEqual(composeFocus(original), original);
  assert.strictEqual(composeFocus(original, {}), original);
});

test('design-scope preamble: composeFocus strict === true gate (truthy strings do NOT trigger)', () => {
  const original = 'plan focus body';
  assert.strictEqual(composeFocus(original, { impeccableAvailable: 1 }), original);
  assert.strictEqual(composeFocus(original, { impeccableAvailable: '1' }), original);
  assert.strictEqual(composeFocus(original, { impeccableAvailable: 'true' }), original);
  assert.strictEqual(composeFocus(original, { impeccableAvailable: {} }), original);
});

test('design-scope preamble: composeFocus null/undefined/empty focus + impeccable=true → preamble alone, no leak', () => {
  for (const focus of [null, undefined, '']) {
    const result = composeFocus(focus, { impeccableAvailable: true });
    assert.ok(result.startsWith('[design-domain exclusion preamble]'),
      'expected preamble for focus=' + JSON.stringify(focus));
    assert.ok(!/\bnull\b/.test(result), 'no "null" leak for focus=' + JSON.stringify(focus));
    assert.ok(!/\bundefined\b/.test(result), 'no "undefined" leak for focus=' + JSON.stringify(focus));
  }
});

test('design-scope preamble: DESIGN_SCOPE_PREAMBLE is exported as a non-empty string with both delimiter tags', () => {
  assert.strictEqual(typeof DESIGN_SCOPE_PREAMBLE, 'string');
  assert.ok(DESIGN_SCOPE_PREAMBLE.length > 0);
  assert.ok(DESIGN_SCOPE_PREAMBLE.includes('[design-domain exclusion preamble]'));
  assert.ok(DESIGN_SCOPE_PREAMBLE.includes('[/design-domain exclusion preamble]'));
});

test('design-scope preamble: parseCliArgs --impeccable-available sets opts.impeccableAvailable=true', () => {
  const { focus, opts } = parseCliArgs(['adversarial-review', '--focus', 'x', '--impeccable-available']);
  assert.strictEqual(focus, 'x');
  assert.strictEqual(opts.impeccableAvailable, true);
});

test('design-scope preamble: parseCliArgs without --impeccable-available leaves opts.impeccableAvailable undefined', () => {
  const { opts } = parseCliArgs(['adversarial-review', '--focus', 'x']);
  assert.strictEqual(opts.impeccableAvailable, undefined);
});

test('design-scope preamble: parseCliArgs preserves existing flags alongside --impeccable-available', () => {
  const { focus, opts } = parseCliArgs([
    'adversarial-review', '--focus', 'body', '--base', 'main', '--scope', 'src/',
    '--timeout-ms', '120000', '--json', '--impeccable-available',
  ]);
  assert.strictEqual(focus, 'body');
  assert.strictEqual(opts.base, 'main');
  assert.strictEqual(opts.scope, 'src/');
  assert.strictEqual(opts.timeoutMs, 120000);
  assert.strictEqual(opts.json, true);
  assert.strictEqual(opts.impeccableAvailable, true);
});

test('design-scope preamble: invokeAdversarialReview integration — companion receives composed focus when impeccable=true', () => {
  const tmp = makeTmpDir('preamble-int-on');
  const installPath = path.join(tmp, 'plugin-install');
  fs.mkdirSync(path.join(installPath, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(installPath, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(installPath, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ version: '1.0.4' }), 'utf8');
  // Fake companion echoes its argv so we can inspect the focus position.
  fs.writeFileSync(path.join(installPath, 'scripts', 'codex-companion.mjs'),
    'process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exit(0);', 'utf8');
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });
  const r = invokeAdversarialReview('payload', {
    registryPath: file,
    env: {},
    timeoutMs: 5_000,
    impeccableAvailable: true,
  });
  assert.strictEqual(r.ok, true);
  const argv = JSON.parse(r.stdout);
  const focusArg = argv[argv.length - 1];
  assert.ok(focusArg.startsWith('[design-domain exclusion preamble]'),
    'expected companion to receive preamble in focus, got: ' + focusArg.slice(0, 100));
  assert.ok(focusArg.endsWith('payload'), 'expected payload at tail, got tail: ' + focusArg.slice(-30));
});

test('design-scope preamble: invokeAdversarialReview integration — companion receives raw focus when impeccable=false', () => {
  const tmp = makeTmpDir('preamble-int-off');
  const installPath = path.join(tmp, 'plugin-install');
  fs.mkdirSync(path.join(installPath, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(installPath, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(installPath, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ version: '1.0.4' }), 'utf8');
  fs.writeFileSync(path.join(installPath, 'scripts', 'codex-companion.mjs'),
    'process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exit(0);', 'utf8');
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });
  const r = invokeAdversarialReview('payload', {
    registryPath: file,
    env: {},
    timeoutMs: 5_000,
    impeccableAvailable: false,
  });
  assert.strictEqual(r.ok, true);
  const argv = JSON.parse(r.stdout);
  const focusArg = argv[argv.length - 1];
  assert.strictEqual(focusArg, 'payload', 'expected raw focus pass-through');
  assert.ok(!focusArg.includes('[design-domain exclusion preamble]'));
});

// ---------------------------------------------------------------------------
// codex-intent-context M1 (Task 3/4) — user-intent reference injection.
// ---------------------------------------------------------------------------

const { INTENT_REFERENCE_PREAMBLE } = codexInvoke;

test('intent reference: design + intent compose in a deterministic 3-part order', () => {
  const ref = '<user_intent_reference>\n- [UI1] (constraint) keep it small\n</user_intent_reference>';
  const out = composeFocus('BASE FOCUS', { impeccableAvailable: true, intentReference: ref });

  const iDesign = out.indexOf(DESIGN_SCOPE_PREAMBLE);
  const iIntent = out.indexOf(INTENT_REFERENCE_PREAMBLE);
  const iRef = out.indexOf(ref);
  const iBase = out.indexOf('BASE FOCUS');

  assert.strictEqual(iDesign, 0, 'design-scope preamble stays first');
  assert.ok(iDesign < iIntent, 'design precedes intent');
  assert.ok(iIntent < iRef, 'intent preamble precedes the reference block');
  // Intent sits immediately before the caller focus (recency).
  assert.ok(iRef < iBase, 'reference block precedes the base focus');
});

test('intent reference: intent alone does NOT pull in the design preamble', () => {
  const ref = '<user_intent_reference>\n- [UI1] (constraint) x\n</user_intent_reference>';
  const out = composeFocus('BASE', { intentReference: ref });
  assert.ok(out.includes(INTENT_REFERENCE_PREAMBLE));
  assert.ok(out.includes(ref));
  assert.ok(!out.includes(DESIGN_SCOPE_PREAMBLE), 'design preamble must not appear');
});

test('intent reference: unspecified → byte-identical to the pre-M1 behavior', () => {
  assert.strictEqual(composeFocus('BASE', {}), 'BASE');
  assert.strictEqual(composeFocus('BASE', { intentReference: '' }), 'BASE');
  assert.strictEqual(composeFocus('BASE', { intentReference: '   ' }), 'BASE');
  assert.strictEqual(composeFocus('BASE', { intentReference: null }), 'BASE');
  // and with design on, exactly the v1.23.0 two-part shape
  assert.strictEqual(composeFocus('BASE', { impeccableAvailable: true }),
    DESIGN_SCOPE_PREAMBLE + 'BASE');
});

test('parseCliArgs: --intent-reference-file is captured', () => {
  const p = parseCliArgs(['adversarial-review', '--focus', 'f', '--intent-reference-file', '/tmp/ref.txt']);
  assert.strictEqual(p.opts.intentReferenceFile, '/tmp/ref.txt');
});

test('runCli: unreadable --intent-reference-file → exit 2 and NO spawn', () => {
  const tmp = makeTmpDir('intent-ref-missing');
  const installPath = buildFakePlugin(tmp, '1.0.4', {
    stdoutLine: 'SHOULD NOT RUN',
  });
  const marker = path.join(tmp, 'spawned.marker');
  // Rewrite the companion so any spawn leaves evidence on disk.
  fs.writeFileSync(path.join(installPath, 'scripts', 'codex-companion.mjs'),
    'require("fs").writeFileSync(' + JSON.stringify(marker) + ', "1"); process.stdout.write("x");',
    'utf8');
  writeRegistry(tmp, { 'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }] });

  const code = runCli(['adversarial-review', '--focus', 'f',
    '--intent-reference-file', path.join(tmp, 'does-not-exist.txt'), '--json']);

  assert.strictEqual(code, 2, 'must exit 2 (usage-class), not a codex classification');
  assert.strictEqual(fs.existsSync(marker), false, 'companion must never be spawned');
});

test('runCli: empty --intent-reference-file → exit 2 (a blank reference is not a reference)', () => {
  const tmp = makeTmpDir('intent-ref-empty');
  const emptyRef = path.join(tmp, 'ref.txt');
  fs.writeFileSync(emptyRef, '   \n', 'utf8');
  const code = runCli(['adversarial-review', '--focus', 'f',
    '--intent-reference-file', emptyRef, '--json']);
  assert.strictEqual(code, 2);
});

test('intent reference: file content reaches the companion argv end-to-end', () => {
  const tmp = makeTmpDir('intent-ref-e2e');
  const installPath = path.join(tmp, 'plugin-install');
  fs.mkdirSync(path.join(installPath, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(installPath, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(installPath, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ version: '1.0.4' }), 'utf8');
  fs.writeFileSync(path.join(installPath, 'scripts', 'codex-companion.mjs'),
    'process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exit(0);', 'utf8');
  const file = writeRegistry(tmp, {
    'codex@openai-codex': [{ installPath: installPath, version: '1.0.4' }],
  });

  const ref = '<user_intent_reference>\n- [UI7] (exclusion) no perf work this cycle\n</user_intent_reference>';
  const r = invokeAdversarialReview('payload', {
    registryPath: file, env: {}, timeoutMs: 5_000, intentReference: ref,
  });
  assert.strictEqual(r.ok, true);
  const argv = JSON.parse(r.stdout);
  const focusArg = argv[argv.length - 1];
  assert.ok(focusArg.includes('UI7'), 'intent items must reach the companion');
  assert.ok(focusArg.includes(INTENT_REFERENCE_PREAMBLE.trim().split('\n')[0]));
  assert.ok(focusArg.endsWith('payload'), 'caller focus stays last');
});
