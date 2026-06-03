#!/usr/bin/env node
/**
 * PreCompact Hook - Save state before context compaction
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs before Claude compacts context, giving you a chance to
 * preserve important state that might get lost in summarization.
 */

const path = require('path');
const { execFileSync } = require('child_process');
const {
  getSessionsDir,
  getDateTimeString,
  getTimeString,
  findFiles,
  ensureDir,
  appendFile,
  log
} = require('../lib/utils');

function resolveRepoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
  } catch (_e) {
    return process.cwd();
  }
}

function deriveFingerprint(repoRoot) {
  try {
    const lc = require('../state/loop-counter');
    const statePath = lc.counterPath(repoRoot);
    if (!require('fs').existsSync(statePath)) return 'unknown';
    const state = lc.readState(repoRoot);
    let bestFp = 'unknown';
    let bestAt = '';
    for (const [fp, info] of Object.entries(state.tasks || {})) {
      if ((info.lastAt || '') > bestAt) {
        bestAt = info.lastAt;
        bestFp = fp;
      }
    }
    return bestFp;
  } catch (_e) {
    return 'unknown';
  }
}

async function main() {
  const sessionsDir = getSessionsDir();
  const compactionLog = path.join(sessionsDir, 'compaction-log.txt');

  ensureDir(sessionsDir);

  // Log compaction event with timestamp
  const timestamp = getDateTimeString();
  appendFile(compactionLog, `[${timestamp}] Context compaction triggered\n`);

  // If there's an active session file, note the compaction
  const sessions = findFiles(sessionsDir, '*-session.tmp');

  if (sessions.length > 0) {
    const activeSession = sessions[0].path;
    const timeStr = getTimeString();
    appendFile(activeSession, `\n---\n**[Compaction occurred at ${timeStr}]** - Context was summarized\n`);
  }

  try {
    const repoRoot = resolveRepoRoot();
    const writer = require('../state/state-writer');
    writer.update(repoRoot, {
      event: 'precompact',
      taskFingerprint: deriveFingerprint(repoRoot),
    });
  } catch (err) {
    process.stderr.write('[PreCompact] STATE.md update skipped: ' + err.message + '\n');
  }

  log('[PreCompact] State saved before compaction');
  process.exit(0);
}

main().catch(err => {
  console.error('[PreCompact] Error:', err.message);
  process.exit(0);
});
