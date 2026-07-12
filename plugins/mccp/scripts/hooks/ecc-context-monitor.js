#!/usr/bin/env node
/**
 * ECC Context Monitor — PostToolUse hook
 *
 * Reads bridge file from ecc-metrics-bridge.js and injects agent-facing
 * warnings when thresholds are crossed: context exhaustion, high cost,
 * scope creep, or tool loops.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeSessionId, readBridge, renameWithRetry } = require('../lib/session-bridge');
const { getHandoffCostThresholds } = require('../lib/cost-thresholds');

const CONTEXT_WARNING_PCT = 35;
const CONTEXT_CRITICAL_PCT = 25;
// cost-model-subscription M3 (Axis 2, IF1) — events that pair with
// chain_aborted=true AND write their own last_event. These are the ONLY
// non-cost abort producers (plan-conflict escalation + dispatch abort); the
// cost producer never sets an event, so a markerless chain_aborted whose
// last_event is OUTSIDE this set is cost-origin. The legacy sweep must NOT
// clear plan_conflict_escalated / dispatch aborts (Codex Impl-R1 IF1).
const NON_COST_ABORT_EVENTS = new Set(['plan_conflict_escalated', 'dispatch_chain_aborted']);
// M2 Axis B — the 50/80/100 cost thresholds now live solely in
// cost-thresholds.js (getHandoffCostThresholds), read per-call so
// MCCP_HANDOFF_THRESHOLDS_USD reaches the cost warnings, the hard-ceiling
// calculation, AND the STATE.md abort channel. Removing the local constants
// forces every usage through the single env-honoring source of truth, and the
// comparator is unified to >= (matching cost-state.tierFor) so tier,
// hard_ceiling, and STATE.md flips agree at the exact threshold (F2).
const HARNESS_COST_MAX_AGE_SECONDS = 300;
const FILES_WARNING_COUNT = 20;
const LOOP_THRESHOLD = 3;
const STALE_SECONDS = 60;
const DEBOUNCE_CALLS = 5;

function isEnabledEnv(value, defaultValue = true) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  return defaultValue;
}

function costWarningsEnabled(env = process.env) {
  return isEnabledEnv(env.MCCP_CONTEXT_MONITOR_COST_WARNINGS, true);
}

// Notify-only mode strips the imperative tail from cost messages so the
// dollar amount is reported without telling the model to halt or change
// course. Toggle via `MCCP_CONTEXT_MONITOR_COST_MODE`:
//   unset / anything else → default directive behavior
//   notify | notification | info | informational → notify-only
function costNotifyOnly(env = process.env) {
  const value = String(env.MCCP_CONTEXT_MONITOR_COST_MODE || '').trim().toLowerCase();
  return value === 'notify' || value === 'notification' || value === 'info' || value === 'informational';
}

/**
 * Get debounce state file path.
 * @param {string} sessionId
 * @returns {string}
 */
function getWarnPath(sessionId) {
  return path.join(os.tmpdir(), `ecc-ctx-warn-${sessionId}.json`);
}

/**
 * Read debounce state.
 * @param {string} sessionId
 * @returns {object}
 */
function readWarnState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(getWarnPath(sessionId), 'utf8'));
  } catch {
    return { callsSinceWarn: 0, lastSeverity: null };
  }
}

/**
 * Write debounce state atomically (unique-suffix tmp then rename).
 *
 * The tmp path includes `process.pid` plus a random nonce so concurrent
 * PostToolUse subprocesses writing to the same session's warn-state
 * file do not clobber each other's tmp mid-write. Without the unique
 * suffix, two writers race over a shared `${target}.tmp` and produce
 * either a corrupted payload or an ENOENT throw on the second rename.
 *
 * Same pattern as `writeBridgeAtomic` in `scripts/lib/session-bridge.js`
 * and `writeCostWarningIfChanged` in `scripts/hooks/ecc-metrics-bridge.js`.
 *
 * @param {string} sessionId
 * @param {object} state
 */
function writeWarnState(sessionId, state) {
  const target = getWarnPath(sessionId);
  const tmp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  try {
    renameWithRetry(tmp, target);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Detect tool loops from recent_tools ring buffer.
 * @param {Array} recentTools
 * @returns {{detected: boolean, tool: string, count: number}}
 */
function detectLoop(recentTools) {
  if (!Array.isArray(recentTools) || recentTools.length < LOOP_THRESHOLD) {
    return { detected: false, tool: '', count: 0 };
  }
  const counts = {};
  for (const entry of recentTools) {
    const key = `${entry.tool}:${entry.hash}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(counts)) {
    if (count >= LOOP_THRESHOLD) {
      return { detected: true, tool: key.split(':')[0], count };
    }
  }
  return { detected: false, tool: '', count: 0 };
}

/**
 * Evaluate all warning conditions against bridge data.
 * Returns array of {severity, type, message} sorted by severity desc.
 */
function evaluateConditions(bridge, options = {}) {
  const warnings = [];
  const remaining = bridge.context_remaining_pct;

  // Context warnings (skip if no context data)
  if (remaining !== null && remaining !== undefined) {
    if (remaining <= CONTEXT_CRITICAL_PCT) {
      warnings.push({
        severity: 3,
        type: 'context',
        message:
          `CONTEXT CRITICAL: ${remaining}% remaining. Context nearly exhausted. ` +
          'Inform the user that context is low and ask how they want to proceed. ' +
          'Do NOT autonomously save state or write handoff files unless the user asks.'
      });
    } else if (remaining <= CONTEXT_WARNING_PCT) {
      warnings.push({
        severity: 2,
        type: 'context',
        message: `CONTEXT WARNING: ${remaining}% remaining. ` + 'Be aware that context is getting limited. Avoid starting new complex work.'
      });
    }
  }

  // Cost warnings — M2 Axis B/F2: per-call thresholds (env-honoring) + >=
  // comparator so severity boundaries agree with cost-state.tierFor().
  if (options.costWarnings !== false) {
    const cost = bridge.total_cost_usd || 0;
    const t = getHandoffCostThresholds();
    const notifyOnly = options.costNotifyOnly === true;
    if (cost >= t.critical) {
      warnings.push({
        severity: 3,
        type: 'cost',
        message: notifyOnly
          ? `COST CRITICAL: Session cost is $${cost.toFixed(2)}.`
          : `COST CRITICAL: Session cost is $${cost.toFixed(2)}. ` + 'Stop and inform the user about high cost before continuing.'
      });
    } else if (cost >= t.warning) {
      warnings.push({
        severity: 2,
        type: 'cost',
        message: notifyOnly
          ? `COST WARNING: Session cost is $${cost.toFixed(2)}.`
          : `COST WARNING: Session cost is $${cost.toFixed(2)}. ` + 'Review whether the current approach justifies the expense.'
      });
    } else if (cost >= t.notice) {
      warnings.push({
        severity: 1,
        type: 'cost',
        message: notifyOnly
          ? `COST NOTICE: Session cost is $${cost.toFixed(2)}.`
          : `COST NOTICE: Session cost is $${cost.toFixed(2)}. ` + 'Consider whether the current approach is efficient.'
      });
    }
  }

  // File scope warning
  const fileCount = bridge.files_modified_count || 0;
  if (fileCount > FILES_WARNING_COUNT) {
    warnings.push({
      severity: 2,
      type: 'scope',
      message: `SCOPE WARNING: ${fileCount} files modified this session. ` + 'Consider whether changes are too scattered.'
    });
  }

  // Loop detection
  const loop = detectLoop(bridge.recent_tools);
  if (loop.detected) {
    warnings.push({
      severity: 2,
      type: 'loop',
      message: `LOOP WARNING: Tool '${loop.tool}' called ${loop.count} times ` + 'with same parameters in last 5 calls. This may indicate a stuck loop.'
    });
  }

  return warnings.sort((a, b) => b.severity - a.severity);
}

/**
 * Map numeric severity to label.
 */
function severityLabel(n) {
  if (n >= 3) return 'critical';
  if (n >= 2) return 'warning';
  return 'notice';
}

/**
 * Resolve the authoritative session cost for this PostToolUse (M2 Axis A).
 *
 * Prefer the harness cache (real per-process billed cost) over the bridge's
 * costs.jsonl-derived value, which is refreshed only at Stop and can be
 * stale/inflated mid-burst. Freshness guard (Implement-Codex F1): trust the
 * harness snapshot only when its cost-sample ts is at least as recent as the
 * bridge's last cost CHANGE (`cost_sample_ts`, epoch seconds). A bridge with a
 * newer cost sample may reflect a spike the statusline render missed → fall
 * back to the bridge value (fail-safe: bias toward gate protection). Both sides
 * are epoch seconds — no ISO/epoch type mismatch (the discarded `last_timestamp`
 * guard compared epoch to an ISO string and keyed off tool activity, which made
 * the harness always look older and defeated Axis A). Cache miss / absent
 * harness → bridge value (regression-preserving).
 *
 * @param {object} bridge
 * @param {string} sessionId
 * @returns {number} resolved cost in USD
 */
function resolveSessionCost(bridge, sessionId) {
  const bridgeCost = Number.isFinite(bridge.total_cost_usd) ? bridge.total_cost_usd : 0;
  let harness = null;
  try {
    harness = require('../lib/harness-cost').readHarnessCostMeta(sessionId, HARNESS_COST_MAX_AGE_SECONDS);
  } catch {
    harness = null;
  }
  if (!harness) return bridgeCost;
  const bridgeCostTs = Number.isFinite(bridge.cost_sample_ts) ? bridge.cost_sample_ts : 0;
  return harness.ts >= bridgeCostTs ? harness.cost_usd : bridgeCost;
}

/**
 * Resolve the repo root by walking up from a cwd until a `.git` entry is found.
 * Shared by the STATE.md SET and decay-clear/sweep paths (M3 Axis 2 — the
 * inline walk was duplicated). Returns null when no repo root is found.
 * @param {string} cwd
 * @returns {string|null}
 */
function resolveRepoRoot(cwd) {
  let dir = cwd || process.cwd();
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return dir;
}

/**
 * @param {string} rawInput - Raw JSON string from stdin
 * @returns {string} JSON output with additionalContext or pass-through
 */
function run(rawInput) {
  try {
    const input = rawInput.trim() ? JSON.parse(rawInput) : {};

    const sessionId = sanitizeSessionId(input.session_id) || sanitizeSessionId(process.env.MCCP_SESSION_ID) || sanitizeSessionId(process.env.CLAUDE_SESSION_ID);

    if (!sessionId) return rawInput;

    const bridge = readBridge(sessionId);
    if (!bridge) return rawInput;

    // M2 Axis A — resolve the authoritative cost (harness-preferred, fresh)
    // once and reuse it for cost-state, the hard-ceiling + STATE.md abort
    // channels, and the agent-facing cost warnings so every surface converges
    // on real billed cost.
    const cost = resolveSessionCost(bridge, sessionId);

    // M3 Axis 2 (IF2) — compute bridge freshness ONCE, before the STATE.md
    // producer, so a stale bridge context is treated as signal-unknown by the
    // subscription abort channel (old telemetry must not stamp a persistent
    // abort). Reused below by the context-warning null-out (same staleness).
    const nowSec = Math.floor(Date.now() / 1000);
    const lastTs = bridge.last_timestamp ? Math.floor(new Date(bridge.last_timestamp).getTime() / 1000) : 0;
    const isStale = lastTs > 0 && nowSec - lastTs > STALE_SECONDS;

    // v0.2.2 Task 7 — write canonical cost-current.json on every toolCall
    // so auto-chain.js can read fresh, monotonic telemetry. Writes are
    // monotonic (R2#1): hard_ceiling_reached + cost_usd are sticky.
    // Best-effort: a write failure must NOT block the user's PostToolUse hook.
    try {
      // M2 Axis B/F2 — per-call thresholds (env-honoring) + >= comparator so
      // hard_ceiling and the STATE.md channel agree with cost-state.tierFor().
      const t = getHandoffCostThresholds();
      const hardCeiling = cost >= t.critical;
      const costState = require('../lib/cost-state');
      costState.writeStateMerged({
        cost_usd: cost,
        hard_ceiling_reached: hardCeiling,
        last_write_ts: Date.now(),
      });

      // cost-model-subscription M1 (Task 3) — stamp context-current.json from the
      // bridge every PostToolUse so the subscription overflow axis has a fresh
      // signal. Own try/catch (best-effort): a context-write failure must NOT
      // affect the cost write above or hook progress. Written unconditionally (NOT
      // gated on MCCP_SUBSCRIPTION) so the signal is warm if the user flips the
      // flag mid-session — a benign side-effect for metered users (Codex F3).
      try {
        const contextState = require('../lib/context-state');
        contextState.writeState({
          contextRemainingPct: bridge.context_remaining_pct,
          toolCount: bridge.tool_count,
        });
      } catch (_ctxErr) { /* swallow context telemetry write errors */ }

      // v0.2.2 Task 7 + M3 Axis 2 — STATE.md auto-chain channel. This block now
      // runs on EVERY PostToolUse (not just high cost) so it can RELEASE a
      // stale/cost-origin chain_aborted once cost has decayed to green — a once-
      // spiked cost must not lock auto-chain forever (F3). SET is subscription-
      // aware (F2): metered flips on USD tiers, subscription flips on the context
      // overflow axis (never on stale USD). Isolated try/catch — a STATE.md
      // failure must not affect the cost/context writes or hook progress.
      try {
        const subscription = require('../lib/subscription');
        const stateWriter = require('../state/state-writer');
        const repoRoot = resolveRepoRoot(input.cwd || process.cwd());
        if (repoRoot && typeof stateWriter.update === 'function') {
          const decayMs = costState.parseDecayMs(process.env);
          const subMode = subscription.isSubscriptionMode(process.env);

          // IF2 — a stale bridge sample is signal-unknown for the STATE.md
          // producer; old context telemetry must not stamp a persistent abort.
          // metered uses harness-preferred `cost` and is unaffected by staleness.
          const ctxPct = isStale ? null : bridge.context_remaining_pct;
          const toolCount = isStale ? null : bridge.tool_count;

          let setSessionEnd = false;
          let setChainAborted = false;
          let costNormal = false; // mode-appropriate "cost is not critical now"
          if (subMode) {
            const of = subscription.evaluateOverflow({
              contextRemainingPct: ctxPct,
              toolCount: toolCount,
              thresholds: subscription.parseOverflowThresholds(process.env),
            });
            setSessionEnd = of.tier === 'warning' || of.tier === 'critical';
            setChainAborted = of.tier === 'critical';
            costNormal = of.tier !== 'critical';
          } else {
            setSessionEnd = cost >= t.warning;
            setChainAborted = hardCeiling; // cost >= t.critical
            costNormal = cost < t.critical;
          }

          if (setChainAborted) {
            // SET (F2 provenance) — stamp cost ownership + marker WITH the flag so
            // the decay-clear can later attribute + release it.
            const patch = { chain_aborted: true, abort_owner: 'cost', cost_abort_at: new Date().toISOString() };
            if (setSessionEnd) patch.session_end_imminent = true;
            try { stateWriter.update(repoRoot, patch); } catch { /* swallow */ }
          } else {
            // Not aborting this call. Set the soft signal if warranted, AND try to
            // release a stale/cost-origin chain_aborted (decay-clear + legacy
            // sweep). decayMs===null (kill switch) disables both release paths.
            const patch = {};
            if (setSessionEnd) patch.session_end_imminent = true;
            if (decayMs !== null && costNormal) {
              try {
                const st = stateWriter.readState(repoRoot);
                const fm = (st && st.frontmatter) || {};
                const noActiveDispatch = !fm.active_dispatch_count && !fm.dispatch_id;
                if (fm.chain_aborted === true && noActiveDispatch) {
                  const markerAgeOk = fm.cost_abort_at &&
                    (Date.now() - Date.parse(fm.cost_abort_at) > decayMs);
                  if (fm.abort_owner === 'cost' && markerAgeOk) {
                    // Decay-clear (F3) — 4-way stable AND: cost owns the flag ∧
                    // marker older than the decay window ∧ cost normal now ∧ no
                    // active dispatch. Never touches a dispatch/precompact abort.
                    patch.chain_aborted = false;
                    patch.abort_owner = null;
                    patch.cost_abort_at = null;
                    process.stderr.write('[mccp:cost-decay] stale cost chain_aborted decay-cleared (marker age > ' +
                      Math.round(decayMs / 3600000) + 'h)\n');
                  } else if (!fm.abort_owner && !fm.cost_abort_at &&
                             costState.readState().threshold_tier === 'green' &&
                             !NON_COST_ABORT_EVENTS.has(fm.last_event)) {
                    // Legacy sweep (F3 legacy + IF1) — a markerless chain_aborted
                    // with a non-abort last_event is cost-origin (the cost path
                    // never writes last_event; the two abort events DO and are
                    // excluded). Requires decayed cost-state green.
                    patch.chain_aborted = false;
                    process.stderr.write('[mccp:cost-decay] legacy stuck chain_aborted swept (markerless cost-origin, last_event=' +
                      (fm.last_event || 'none') + ')\n');
                  }
                }
              } catch { /* swallow read/derive errors */ }
            }
            if (Object.keys(patch).length > 0) {
              try { stateWriter.update(repoRoot, patch); } catch { /* swallow */ }
            }
          }
        }
      } catch { /* state-writer / subscription optional */ }
    } catch { /* swallow telemetry write errors */ }

    // Stale check for context warnings — computed once above (nowSec/lastTs/isStale).
    // If bridge is stale, null out context data (still check cost/scope/loop).
    // M2 Axis A — inject the resolved cost so the cost warnings fire on real
    // billed cost, not the bridge's stale/inflated value.
    const evalBridge = isStale
      ? { ...bridge, context_remaining_pct: null, total_cost_usd: cost }
      : { ...bridge, total_cost_usd: cost };

    const warnings = evaluateConditions(evalBridge, {
      costWarnings: costWarningsEnabled(),
      costNotifyOnly: costNotifyOnly()
    });
    if (warnings.length === 0) return rawInput;

    // Debounce logic
    const warnState = readWarnState(sessionId);
    warnState.callsSinceWarn = (warnState.callsSinceWarn || 0) + 1;

    const topSeverity = severityLabel(warnings[0].severity);
    const severityEscalated = topSeverity === 'critical' && warnState.lastSeverity !== 'critical';

    const isFirst = !warnState.lastSeverity;
    if (!isFirst && warnState.callsSinceWarn < DEBOUNCE_CALLS && !severityEscalated) {
      writeWarnState(sessionId, warnState);
      return rawInput;
    }

    // Reset debounce, emit warning
    warnState.callsSinceWarn = 0;
    warnState.lastSeverity = topSeverity;
    writeWarnState(sessionId, warnState);

    // Combine top 2 warnings
    const message = warnings
      .slice(0, 2)
      .map(w => w.message)
      .join('\n');

    const output = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: message
      }
    };

    return JSON.stringify(output);
  } catch {
    // Never block tool execution
    return rawInput;
  }
}

if (require.main === module) {
  let data = '';
  const MAX_STDIN = 1024 * 1024;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(data));
    process.exit(0);
  });
}

module.exports = { run, evaluateConditions, detectLoop, severityLabel, costWarningsEnabled, costNotifyOnly };
