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

// ── Codex Round 2 regression tests ────────────────────────────────────────────

test('scanCrashAlerts: stale lease (heartbeat > LEASE_LIVE_MS ago) surfaces alert with staleLease flag (R2 F#1)', () => {
  // Round 2 finding #1 (HIGH): scanCrashAlerts used to skip any prior session
  // with an "active" lease (≤24h mtime). A session that crashed right after
  // SessionStart leaves a fresh lease, hiding the silent failure for 24 hours.
  // Fix: distinguish "heartbeat within LEASE_LIVE_MS" from "lease present but
  // mtime stale" — only the former skips, the latter surfaces with a flag.
  withRepo((root) => {
    ht.recordWrite(root, 'crashed', 'tu1', 'PreToolUse',
      { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    ht.acquireLease(root, 'crashed');
    // Backdate the lease file mtime to LEASE_LIVE_MS + 1 minute ago — simulates
    // a session whose hook process died before reaching SessionEnd.
    const leasePath = ht.leasePath(root, 'crashed');
    const stalePastMs = Date.now() - (caps.LEASE_LIVE_MS + 60 * 1000);
    fs.utimesSync(leasePath, stalePastMs / 1000, stalePastMs / 1000);
    const alerts = caps.scanCrashAlerts(root, 'currentSess');
    const found = alerts.find((a) => a.sessionId === 'crashed');
    assert.ok(found, 'stale-lease session must surface in crash alerts');
    assert.strictEqual(found.staleLease, true, 'staleLease flag set so renderer can hint');
    // Cleanup so the next test isn't affected
    ht.releaseLease(root, 'crashed');
  });
});

test('scanCrashAlerts: live lease (heartbeat within LEASE_LIVE_MS) is still skipped', () => {
  // Counterpart to the previous test — a session whose recordWrite was
  // just-now must NOT appear as a crash alert.
  withRepo((root) => {
    ht.recordWrite(root, 'alive', 'tu1', 'PreToolUse',
      { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    ht.acquireLease(root, 'alive'); // fresh — mtime ≈ now
    const alerts = caps.scanCrashAlerts(root, 'currentSess');
    const sids = alerts.map((a) => a.sessionId);
    assert.ok(!sids.includes('alive'), 'live-lease session must not appear');
    ht.releaseLease(root, 'alive');
  });
});

test('scanCrashAlerts: with > MAX_CRASH_ALERTS sessions, newest by mtime are returned (R2 F#3)', () => {
  // Round 2 finding #3 (MEDIUM): the prior `break` inside the loop truncated
  // by filesystem enumeration order BEFORE sorting by mtime, so when the
  // directory order disagreed with recency the newest alerts were dropped
  // permanently. Fix: collect-all → sort → slice.
  withRepo((root) => {
    // Five eligible sessions, with controlled mtimes oldest→newest.
    // Filesystem enumeration order is alphabetical (oldA, oldB, oldC, oldD, oldE),
    // which matches our "oldest first" intent here.
    const created = ['oldA', 'oldB', 'oldC', 'oldD', 'oldE'];
    for (const sid of created) {
      ht.recordWrite(root, sid, 'tu1', 'PreToolUse',
        { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    }
    // Now hammer each session dir to a controlled mtime — older first.
    const base = Date.now() - (10 * 60 * 60 * 1000); // 10h ago
    created.forEach((sid, i) => {
      const dir = ht.sessionDir(root, sid);
      const t = (base + i * 60 * 1000) / 1000; // 1 minute apart
      fs.utimesSync(dir, t, t);
    });
    const alerts = caps.scanCrashAlerts(root, 'currentSess');
    assert.strictEqual(alerts.length, caps.MAX_CRASH_ALERTS);
    const sids = alerts.map((a) => a.sessionId);
    // Newest three: oldC, oldD, oldE — in sorted-desc order: oldE, oldD, oldC
    assert.deepStrictEqual(sids, ['oldE', 'oldD', 'oldC'],
      'newest by mtime must survive the cap, sorted desc');
  });
});

test('probeBinary: records binary_resolved_path + binary_mtime_ms when binary is on PATH (R2 F#4)', () => {
  // Round 2 finding #4 (MEDIUM): binary_path used to be the literal command
  // (`"claude"`), so a PATH-shadowed/stale install was indistinguishable
  // from a healthy one. Fix: record the absolute resolved path + mtime so
  // the cache can detect replacement.
  //
  // We probe `node` (guaranteed on PATH because this test runs under node)
  // to exercise the resolution path without needing the claude binary.
  const probe = caps.probeBinary({ binaryPath: 'node' });
  assert.ok(probe.binary_resolved_path, 'binary_resolved_path must be populated');
  assert.notStrictEqual(probe.binary_resolved_path, 'node',
    'resolved path must differ from the literal command name');
  assert.ok(path.isAbsolute(probe.binary_resolved_path),
    'resolved path must be absolute: ' + probe.binary_resolved_path);
  assert.ok(typeof probe.binary_mtime_ms === 'number' && probe.binary_mtime_ms > 0,
    'binary_mtime_ms must be populated when resolved path exists');
});

test('probeAndCache: cache invalidated when binary_resolved_path changes (R2 F#4)', () => {
  // If a user updates claude or swaps shells (PATH change), the cached entry
  // must be reprobed even while the 24h TTL is still fresh.
  withRepo((root) => {
    const stalePayload = caps.buildPayload({
      version: '2.1.150',
      binary_path: 'claude',
      binary_resolved_path: '/old/path/to/claude',
      binary_mtime_ms: 1000,
      stderr_capture: '',
      exit: 0,
      error_class: null,
    });
    caps.writeCache(root, stalePayload);
    // Simulate "binary on PATH now resolves to node" by probing for node.
    // probeAndCache will resolve `node` (absolute path ≠ `/old/path/to/claude`)
    // → cache invalidates → reprobe.
    const out = caps.probeAndCache(root, { binaryPath: 'node' });
    assert.strictEqual(out.fromCache, false,
      'cache must be invalidated when resolved path differs');
    assert.strictEqual(out.reprobed, true);
  });
});
