'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const caps = require('../hook-caps');
const ht = require('../hook-trace');

function withRepo(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-hookcaps-'));
  try { return fn(root); }
  finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }
}

test('parseSemver / compareSemver / meetsMin: version arithmetic', () => {
  assert.deepStrictEqual(caps.parseSemver('2.1.141'), { major: 2, minor: 1, patch: 141 });
  assert.deepStrictEqual(caps.parseSemver('claude-code v2.1.150 (release)'),
    { major: 2, minor: 1, patch: 150 });
  assert.strictEqual(caps.parseSemver('not-a-version'), null);

  assert.strictEqual(caps.compareSemver(caps.parseSemver('2.0.0'), caps.parseSemver('2.1.141')), -1);
  assert.strictEqual(caps.compareSemver(caps.parseSemver('2.1.141'), caps.parseSemver('2.1.141')), 0);
  assert.strictEqual(caps.compareSemver(caps.parseSemver('2.1.200'), caps.parseSemver('2.1.141')), 1);

  assert.strictEqual(caps.meetsMin('2.1.141'), true);
  assert.strictEqual(caps.meetsMin('2.0.999'), false);
  assert.strictEqual(caps.meetsMin('not-a-version'), false);
});

test('computeFeatures: meets min → all features, otherwise minimum-spec', () => {
  const ok = caps.computeFeatures('2.1.141');
  assert.strictEqual(ok.systemMessage, true);
  assert.strictEqual(ok.permissionDecisionAsk, true);
  assert.strictEqual(ok.terminalSequence, true);
  const fallback = caps.computeFeatures('2.0.0');
  assert.strictEqual(fallback.systemMessage, true); // always universal
  assert.strictEqual(fallback.permissionDecisionAsk, false);
  assert.strictEqual(fallback.terminalSequence, false);
});

test('probeBinary: missing binary returns spawn_failed without throwing', () => {
  const probe = caps.probeBinary({ binaryPath: 'this-binary-does-not-exist-on-any-system' });
  assert.strictEqual(probe.version, null);
  assert.ok(probe.error_class, 'error_class should be set: ' + JSON.stringify(probe));
});

test('writeCache → readCache → isFresh: lifecycle', () => {
  withRepo((root) => {
    const payload = caps.buildPayload({
      version: '2.1.150',
      binary_path: '/usr/bin/claude',
      stderr_capture: '',
      exit: 0,
      error_class: null,
    });
    caps.writeCache(root, payload);
    const loaded = caps.readCache(root);
    assert.strictEqual(loaded.version, '2.1.150');
    assert.strictEqual(loaded.binary_path, '/usr/bin/claude');
    assert.strictEqual(loaded.supported_features.permissionDecisionAsk, true);
    assert.strictEqual(caps.isFresh(loaded), true);
    // Forced old timestamp → not fresh
    loaded.probed_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(caps.isFresh(loaded), false);
  });
});

test('readCache: corrupt JSON returns null (self-healing)', () => {
  withRepo((root) => {
    const target = caps.cachePath(root);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{not valid', 'utf8');
    const loaded = caps.readCache(root);
    assert.strictEqual(loaded, null);
  });
});

test('scanCrashAlerts: prior session without .end marker is reported', () => {
  withRepo((root) => {
    // Three prior sessions: old1 (no end), old2 (with end), old3 (active lease)
    ht.recordWrite(root, 'old1', 'tu1', 'PreToolUse',
      { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    ht.recordWrite(root, 'old2', 'tu1', 'PreToolUse',
      { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    ht.markSessionEnd(root, 'old2');
    ht.recordWrite(root, 'old3', 'tu1', 'PreToolUse',
      { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    ht.acquireLease(root, 'old3');
    const alerts = caps.scanCrashAlerts(root, 'currentSess');
    const sids = alerts.map(a => a.sessionId);
    assert.ok(sids.includes('old1'));
    assert.ok(!sids.includes('old2'), 'old2 has .end marker, should not alert');
    assert.ok(!sids.includes('old3'), 'old3 has active lease, should not alert');
    ht.releaseLease(root, 'old3');
  });
});

test('scanCrashAlerts: capped at MAX_CRASH_ALERTS (3)', () => {
  withRepo((root) => {
    for (let i = 0; i < 6; i++) {
      ht.recordWrite(root, 'old' + i, 'tu1', 'PreToolUse',
        { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    }
    const alerts = caps.scanCrashAlerts(root, 'currentSess');
    assert.strictEqual(alerts.length, caps.MAX_CRASH_ALERTS);
  });
});

test('renderCapsReminder: silent when probe healthy, reminder when degraded', () => {
  const healthy = caps.buildPayload({
    version: '2.1.150', binary_path: 'claude', stderr_capture: '', exit: 0, error_class: null,
  });
  assert.strictEqual(caps.renderCapsReminder(healthy), '');
  const old = caps.buildPayload({
    version: '2.0.0', binary_path: 'claude', stderr_capture: '', exit: 0, error_class: null,
  });
  assert.match(caps.renderCapsReminder(old), /minimum-spec/);
  const failed = caps.buildPayload({
    version: null, binary_path: 'claude', stderr_capture: 'oops', exit: 127, error_class: 'ENOENT',
  });
  assert.match(caps.renderCapsReminder(failed), /probe failed/);
  assert.match(caps.renderCapsReminder(failed), /ENOENT/);
});

test('renderCrashAlertReminder: empty input returns empty string', () => {
  assert.strictEqual(caps.renderCrashAlertReminder([]), '');
  assert.strictEqual(caps.renderCrashAlertReminder(null), '');
  const out = caps.renderCrashAlertReminder([{ sessionId: 's1', sessionDir: '/p', consolidatedPath: null, mtimeMs: 0 }]);
  assert.match(out, /<system-reminder>/);
  assert.match(out, /session=s1/);
});
