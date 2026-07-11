#!/usr/bin/env node
/**
 * ECC Statusline — statusLine command
 *
 * Displays: model | task | $cost Nt Nf Nm | dir ██░░ N%
 *
 * Registered in settings.json under "statusLine", not in hooks.json.
 * Reads bridge file from ecc-metrics-bridge.js and stdin from Claude Code runtime.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeSessionId, readBridge, writeBridgeAtomic } = require('../lib/session-bridge');

const AUTO_COMPACT_BUFFER_PCT = 16.5;
const MAX_STDIN = 1024 * 1024;

/**
 * Format duration from ISO timestamp to now.
 * @param {string} isoTimestamp
 * @returns {string} e.g. "5s", "12m", "1h23m"
 */
function formatDuration(isoTimestamp) {
  if (!isoTimestamp) return '?';
  const elapsed = Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 1000);
  if (elapsed < 0) return '?';
  if (elapsed < 60) return `${elapsed}s`;
  const mins = Math.floor(elapsed / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h${remMins}m` : `${hours}h`;
}

/**
 * Build context progress bar with ANSI colors.
 * @param {number} remaining - Raw remaining percentage from Claude Code
 * @returns {string} Colored bar string
 */
function buildContextBar(remaining) {
  if (remaining === null || remaining === undefined) return '';

  const usableRemaining = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
  const used = Math.max(0, Math.min(100, Math.round(100 - usableRemaining)));

  const filled = Math.floor(used / 10);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);

  if (used < 50) return ` \x1b[32m${bar} ${used}%\x1b[0m`;
  if (used < 65) return ` \x1b[33m${bar} ${used}%\x1b[0m`;
  if (used < 80) return ` \x1b[38;5;208m${bar} ${used}%\x1b[0m`;
  return ` \x1b[1;31m${bar} ${used}%\x1b[0m`;
}

/**
 * Read current in-progress task from todos directory.
 * @param {string} sessionId
 * @returns {string} Task activeForm text or empty string
 */
function readCurrentTask(sessionId) {
  try {
    const safeSessionId = sanitizeSessionId(sessionId);
    if (!safeSessionId) return '';

    const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const todosDir = path.join(claudeDir, 'todos');
    if (!fs.existsSync(todosDir)) return '';

    const files = fs
      .readdirSync(todosDir)
      .filter(f => f.startsWith(safeSessionId) && f.includes('-agent-') && f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(todosDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return '';

    const todos = JSON.parse(fs.readFileSync(path.join(todosDir, files[0].name), 'utf8'));
    const inProgress = todos.find(t => t.status === 'in_progress');
    return inProgress?.activeForm || '';
  } catch {
    return '';
  }
}

/**
 * Extract the authoritative harness cost from the statusLine stdin payload.
 * Claude Code passes `cost.total_cost_usd` (per-process billed truth). Returns
 * a finite non-negative number, or null when absent/invalid (older harness or
 * missing field) so callers fall back to the bridge value.
 * @param {object} data
 * @returns {number|null}
 */
function extractHarnessCost(data) {
  const c = data && data.cost && data.cost.total_cost_usd;
  return (typeof c === 'number' && Number.isFinite(c) && c >= 0) ? c : null;
}

/**
 * Render the statusline string from the parsed stdin payload.
 *
 * Side effects (both best-effort, each isolated so neither blocks the render):
 *   1. writes context_remaining_pct back to the bridge for context-monitor;
 *   2. persists the authoritative harness cost to the per-session cache
 *      (M2 Axis A) so cost-tracker + context-monitor read real billed cost.
 *
 * Cost display (Implement-Codex F3): prefer the live harness cost when present,
 * else fall back to the bridge's costs.jsonl-derived value (which is refreshed
 * only at Stop and can be stale/inflated mid-burst).
 *
 * @param {object} data - parsed statusLine stdin JSON
 * @returns {string} the rendered statusline
 */
function renderStatusline(data) {
  const model = data.model?.display_name || 'Claude';
  const dir = data.workspace?.current_dir || process.cwd();
  const session = data.session_id || '';
  const remaining = data.context_window?.remaining_percentage;

  const sessionId = sanitizeSessionId(session);
  const bridge = sessionId ? readBridge(sessionId) : null;

  // Write context % back to bridge for context-monitor
  if (sessionId && bridge && remaining !== null && remaining !== undefined) {
    bridge.context_remaining_pct = remaining;
    try {
      writeBridgeAtomic(sessionId, bridge);
    } catch {
      /* best effort */
    }
  }

  // M2 Task 4 \u2014 persist authoritative harness cost. Own try/catch: a write
  // failure must NEVER block the render (the return below).
  const harnessCost = extractHarnessCost(data);
  if (sessionId && harnessCost !== null) {
    try {
      require('../lib/harness-cost').writeHarnessCost(sessionId, harnessCost);
    } catch {
      /* best effort \u2014 cost cache write never blocks the statusline */
    }
  }

  // Current task
  const task = sessionId ? readCurrentTask(sessionId) : '';

  // Metrics \u2014 F3: prefer the live harness cost for the $ figure, fall back to
  // the bridge's Stop-derived value. tool/file/duration remain bridge-sourced.
  const displayCost = harnessCost !== null
    ? harnessCost
    : (bridge && Number.isFinite(bridge.total_cost_usd) ? bridge.total_cost_usd : 0);
  const parts = [];
  if (displayCost > 0) {
    parts.push(`$${displayCost.toFixed(2)}`);
  }
  if (bridge) {
    if (bridge.tool_count > 0) {
      parts.push(`${bridge.tool_count}t`);
    }
    if (bridge.files_modified_count > 0) {
      parts.push(`${bridge.files_modified_count}f`);
    }
    const dur = formatDuration(bridge.first_timestamp);
    if (dur !== '?') {
      parts.push(dur);
    }
  }
  const metricsStr = parts.length > 0 ? `\x1b[38;5;117m${parts.join(' ')}\x1b[0m` : '';

  // Context bar
  const ctx = buildContextBar(remaining);

  // Build output
  const dirname = path.basename(dir);
  const segments = [`\x1b[2m${model}\x1b[0m`];

  if (task) {
    segments.push(`\x1b[1;97m${task}\x1b[0m`);
  }
  if (metricsStr) {
    segments.push(metricsStr);
  }
  segments.push(`\x1b[2m${dirname}\x1b[0m`);

  return segments.join(' \x1b[2m\u2502\x1b[0m ') + ctx;
}

function runStatusline() {
  let input = '';
  const stdinTimeout = setTimeout(() => process.exit(0), 3000);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (input.length < MAX_STDIN) {
      input += chunk.substring(0, MAX_STDIN - input.length);
    }
  });
  process.stdin.on('end', () => {
    clearTimeout(stdinTimeout);
    try {
      const data = JSON.parse(input);
      process.stdout.write(renderStatusline(data));
    } catch {
      // Silent fail
    }
  });
}

module.exports = { formatDuration, buildContextBar, readCurrentTask, extractHarnessCost, renderStatusline, MAX_STDIN };

if (require.main === module) runStatusline();
