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

  // 5. session-process-reclaim §D14 — foreign orphans from sessions that are
  //    gone. Two DIFFERENT operations, deliberately not conflated:
  //      kill of a live pid  → never (UI1: we cannot establish ownership of
  //                            another session's process, so we only COUNT it)
  //      unlink of a record  → yes, but only for pids that are already dead.
  //                            No process is referenced, so the mis-kill risk is
  //                            zero by definition, and this is what satisfies
  //                            PRD :78 (registry growing without bound).
  //    Reporting must never break SessionStart, so every failure is a silent 0.
  try {
    const sp = safeRequire(path.join(libDir, 'session-processes'));
    if (sp) {
      const orphans = sp.scanForeignOrphans(repoRoot, currentSession);
      if (orphans.liveCount || orphans.purgedCount
          || orphans.unreadable || orphans.purgeFailures) {
        // A sweep that COULD NOT do its job must not read as one that had
        // nothing to do — hence unreadable/purgeFailures are surfaced beside the
        // successes rather than folded into a clean zero.
        const trouble = (orphans.unreadable || orphans.purgeFailures)
          ? ' ' + orphans.unreadable + ' unreadable, ' + orphans.purgeFailures
            + ' purge failure(s) — the registry may be growing; see stderr.'
          : '';
        blocks.push('<system-reminder>\n'
          + '[mccp:session-processes] prior-session processes: '
          + orphans.liveCount + ' still alive (reported only — not reclaimed), '
          + orphans.purgedCount + ' dead record(s) purged.' + trouble + ' '
          + 'Unreclaimed/failed records are preserved under '
          + '.claude/state/session-processes/ as the audit surface.\n'
          + '</system-reminder>');
      }
    }
  } catch (err) {
    // Reporting must never break SessionStart, so this stays non-fatal — but it
    // does not stay INVISIBLE. A swallowed sweep failure is indistinguishable
    // from "no orphans", which is the one reading that must never be wrong here.
    try {
      process.stderr.write('[mccp:session-processes] SessionStart orphan sweep failed: '
        + ((err && err.message) || err) + '\n');
    } catch (_) { /* stderr itself is gone — nothing left to try */ }
  }

  return blocks.join('\n\n');
}

module.exports = { compute: compute };
