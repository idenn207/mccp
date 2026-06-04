'use strict';

// L2c entry — hook-caps probe + cross-session crash alerts to inject after
// session-start.js's own output. Returns a string of `<system-reminder>`
// blocks (empty when nothing to report). Caller writes it verbatim to stdout.
//
// Side effects beyond the return value:
//   - Writes/refreshes .claude/state/hook-caps.json (cache).
//   - Acquires the current session's L1 lease.
//   - Runs one LRU eviction pass (active leases respected).

const path = require('path');

function pluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
}

function safeRequire(modPath) {
  try { return require(modPath); }
  catch (_) { return null; }
}

function compute(event) {
  const root = pluginRoot();
  const libDir = path.join(root, 'scripts', 'lib');
  const caps = safeRequire(path.join(libDir, 'hook-caps'));
  const ht = safeRequire(path.join(libDir, 'hook-trace'));
  if (!caps || !ht) return '';

  const repoRoot = (event && event.cwd) ? event.cwd : process.cwd();
  const currentSession = (event && event.session_id) ? event.session_id : null;
  const blocks = [];

  // 1. Version probe (cached if recent).
  try {
    const probe = caps.probeAndCache(repoRoot);
    const reminder = caps.renderCapsReminder(probe.payload);
    if (reminder) blocks.push(reminder);
  } catch (_) { /* silent */ }

  // 2. Acquire current session lease so concurrent SessionStart in another
  //    repo doesn't evict our shards mid-session.
  if (currentSession) {
    try { ht.acquireLease(repoRoot, currentSession); } catch (_) { /* silent */ }
  }

  // 3. Crash alerts for prior sessions without .end marker (C3 lease guard).
  try {
    const alerts = caps.scanCrashAlerts(repoRoot, currentSession);
    const reminder = caps.renderCrashAlertReminder(alerts);
    if (reminder) blocks.push(reminder);
  } catch (_) { /* silent */ }

  // 4. LRU eviction — active leases are respected by ht.evictLRU.
  try { ht.evictLRU(repoRoot); } catch (_) { /* silent */ }

  return blocks.join('\n\n');
}

module.exports = { compute: compute };
