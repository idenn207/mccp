'use strict';
const envValue = require('./env-contract/value');

// cost-model-subscription M1 — subscription opt-in oracle.
//
// MCCP_SUBSCRIPTION=1|on makes the 5 automation cost consumers (resolveFanout,
// resolveFleet, shouldSkipBriefing, auto-chain, breakpoint-detector) bypass the
// USD cost-tier / cost-state gates. Runaway prevention is replaced by a context
// overflow axis (context_remaining_pct + tool_count) fed from the metrics bridge.
//
// Pure + dep-free. Mirrors cost-thresholds.js (env SoT + loud fail-open) and
// implement-dispatch/budget.js#parseParallelMode (mode parse).
//
// DELIBERATE fail-OPEN (Codex F1, user-accepted): a missing/undefined context
// signal evaluates as green — subscription's purpose is unblock, and runaway
// prevention fires only on a POSITIVE critical signal. Signal reliability + a
// calibrated tool threshold are deferred to M2 (see codex-findings-backlog.md).

const ENV_MODE = 'MCCP_SUBSCRIPTION';
const ENV_CONTEXT_WARN = 'MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT';
const ENV_CONTEXT_CRITICAL = 'MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT';
const ENV_TOOL_WARN = 'MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN';
const ENV_TOOL_CRITICAL = 'MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL';

// context% defaults reuse ecc-context-monitor.js calibrated remaining-% bands
// (35 warning / 25 critical). tool axis defaults to 0/0 = DISABLED — no
// evidence-free threshold is invented; it is an explicit opt-in (Task 1 (b)).
const DEFAULT_THRESHOLDS = Object.freeze({
  contextWarnPct: 35,
  contextCriticalPct: 25,
  toolWarn: 0,
  toolCritical: 0,
});

const REASONS = Object.freeze({
  SIGNAL_UNKNOWN: 'signal-unknown',
  GREEN: 'green',
  CONTEXT_WARNING: 'context-warning',
  CONTEXT_CRITICAL: 'context-critical',
  TOOL_WARNING: 'tool-warning',
  TOOL_CRITICAL: 'tool-critical',
});

function warn(line) {
  process.stderr.write('[mccp:subscription] ' + line + '\n');
}

// isSubscriptionMode(env) → boolean. Default OFF (explicit opt-in). Mirror of
// implement-dispatch/budget.js#parseParallelMode ('1' or 'on', case-insensitive).
function isSubscriptionMode(env) {
  return envValue.parseBool(env || {}, ENV_MODE);
}

function numEnv(env, key) {
  const raw = env && env[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    warn(key + ' must be a finite number; got "' + raw + '". Ignoring (default).');
    return null;
  }
  return n;
}

// parseOverflowThresholds(env) → { contextWarnPct, contextCriticalPct, toolWarn,
// toolCritical }. Loud fail-open to defaults on parse failure or invariant
// violation (mirror cost-thresholds.parseEnvOverride).
function parseOverflowThresholds(env) {
  env = env || {};
  let contextWarnPct = numEnv(env, ENV_CONTEXT_WARN);
  let contextCriticalPct = numEnv(env, ENV_CONTEXT_CRITICAL);
  let toolWarn = numEnv(env, ENV_TOOL_WARN);
  let toolCritical = numEnv(env, ENV_TOOL_CRITICAL);

  if (contextWarnPct === null) contextWarnPct = DEFAULT_THRESHOLDS.contextWarnPct;
  if (contextCriticalPct === null) contextCriticalPct = DEFAULT_THRESHOLDS.contextCriticalPct;
  if (toolWarn === null) toolWarn = DEFAULT_THRESHOLDS.toolWarn;
  if (toolCritical === null) toolCritical = DEFAULT_THRESHOLDS.toolCritical;

  // context invariant: 0 < critical < warn <= 100 (remaining-% — lower is worse).
  if (!(contextCriticalPct > 0 && contextCriticalPct < contextWarnPct && contextWarnPct <= 100)) {
    warn('context overflow thresholds violate 0<critical<warn<=100 (crit=' +
      contextCriticalPct + ' warn=' + contextWarnPct + '). Falling back to default context bands.');
    contextWarnPct = DEFAULT_THRESHOLDS.contextWarnPct;
    contextCriticalPct = DEFAULT_THRESHOLDS.contextCriticalPct;
  }

  // tool invariant: disabled (critical<=0) OR 0 <= warn < critical (higher worse).
  if (toolCritical > 0) {
    if (!(toolWarn >= 0 && toolWarn < toolCritical)) {
      warn('tool overflow thresholds violate 0<=warn<critical (warn=' + toolWarn +
        ' crit=' + toolCritical + '). Disabling tool axis (default 0/0).');
      toolWarn = 0;
      toolCritical = 0;
    }
  } else {
    // critical <= 0 → disabled; ignore any warn.
    toolWarn = 0;
    toolCritical = 0;
  }

  return {
    contextWarnPct: contextWarnPct,
    contextCriticalPct: contextCriticalPct,
    toolWarn: toolWarn,
    toolCritical: toolCritical,
  };
}

// evaluateOverflow({ contextRemainingPct, toolCount, thresholds })
//   → { tier: 'green'|'warning'|'critical', overflow: boolean, reason }
//
// overflow === (tier === 'critical') — the binary "runaway detected" signal the
// consumers use to skip/abort. tier exposes the granular band so
// breakpoint-detector can reuse its warning (soft) vs critical (hard) machinery.
//
// Fail-OPEN: when NO axis produces an evaluable value (context absent AND tool
// axis disabled-or-absent) → green + SIGNAL_UNKNOWN (Codex F1, user-accepted).
function evaluateOverflow(opts) {
  opts = opts || {};
  const t = opts.thresholds || DEFAULT_THRESHOLDS;
  const ctx = opts.contextRemainingPct;
  const tools = opts.toolCount;

  const ctxFinite = Number.isFinite(ctx);
  const toolAxisOn = Number.isFinite(t.toolCritical) && t.toolCritical > 0;
  const toolFinite = Number.isFinite(tools);

  // No evaluable signal → fail-open green.
  if (!ctxFinite && !(toolAxisOn && toolFinite)) {
    return { tier: 'green', overflow: false, reason: REASONS.SIGNAL_UNKNOWN };
  }

  // Context axis (remaining-% — lower is worse).
  let ctxTier = 'green';
  if (ctxFinite) {
    if (ctx <= t.contextCriticalPct) ctxTier = 'critical';
    else if (ctx <= t.contextWarnPct) ctxTier = 'warning';
  }

  // Tool axis (count — higher is worse), only when enabled.
  let toolTier = 'green';
  if (toolAxisOn && toolFinite) {
    if (tools >= t.toolCritical) toolTier = 'critical';
    else if (t.toolWarn > 0 && tools >= t.toolWarn) toolTier = 'warning';
  }

  // Most-severe wins; context breaks ties (reported first).
  const rank = { green: 0, warning: 1, critical: 2 };
  const tier = rank[ctxTier] >= rank[toolTier] ? ctxTier : toolTier;

  let reason = REASONS.GREEN;
  if (tier === 'critical') {
    reason = ctxTier === 'critical' ? REASONS.CONTEXT_CRITICAL : REASONS.TOOL_CRITICAL;
  } else if (tier === 'warning') {
    reason = ctxTier === 'warning' ? REASONS.CONTEXT_WARNING : REASONS.TOOL_WARNING;
  }

  return { tier: tier, overflow: tier === 'critical', reason: reason };
}

module.exports = {
  isSubscriptionMode: isSubscriptionMode,
  parseOverflowThresholds: parseOverflowThresholds,
  evaluateOverflow: evaluateOverflow,
  REASONS: REASONS,
  DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
  ENV_MODE: ENV_MODE,
  ENV_CONTEXT_WARN: ENV_CONTEXT_WARN,
  ENV_CONTEXT_CRITICAL: ENV_CONTEXT_CRITICAL,
  ENV_TOOL_WARN: ENV_TOOL_WARN,
  ENV_TOOL_CRITICAL: ENV_TOOL_CRITICAL,
};
