'use strict';

// v0.3.0 S10b — cost-handoff threshold source-of-truth.
//
// Architecture §4 "Cost-threshold source of truth" promise:
//   50/80/100 USD must live in exactly one module so a future "raise the
//   notice tier to $60" edit cannot silent-rebase past tierFor() while
//   leaving handoff-spawner reading the stale literal. Other modules
//   import getHandoffCostThresholds() and never inline the constants.
//
// Env override:
//   MCCP_HANDOFF_THRESHOLDS_USD="notice,warning,critical" (USD numbers)
//   - parse failure  → default + stderr warn (loud fail-open)
//   - invariant fail → default + stderr warn (notice < warning < critical)
//   - non-finite/non-positive → default + stderr warn
//
// API:
//   getHandoffCostThresholds() → { notice, warning, critical }
//     called per-invocation; no cache (env can change between tests + cost
//     of an env read is trivial vs the value of test isolation).

const DEFAULT = Object.freeze({ notice: 50, warning: 80, critical: 100 });
const ENV_NAME = 'MCCP_HANDOFF_THRESHOLDS_USD';

function warn(line) {
  process.stderr.write('[mccp:cost-thresholds] ' + line + '\n');
}

function parseEnvOverride(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const parts = raw.split(',').map(function (s) { return s.trim(); });
  if (parts.length !== 3) {
    warn(ENV_NAME + ' must be "notice,warning,critical" (3 USD numbers); got ' +
      parts.length + ' parts. Falling back to default ' +
      JSON.stringify(DEFAULT));
    return null;
  }
  const nums = parts.map(Number);
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(nums[i]) || nums[i] <= 0) {
      warn(ENV_NAME + ' contains non-positive/non-finite value at index ' + i +
        ' ("' + parts[i] + '"). Falling back to default.');
      return null;
    }
  }
  const [notice, warning, critical] = nums;
  if (!(notice < warning && warning < critical)) {
    warn(ENV_NAME + ' violates invariant notice<warning<critical (got ' +
      notice + ',' + warning + ',' + critical + '). Falling back to default.');
    return null;
  }
  return { notice: notice, warning: warning, critical: critical };
}

function getHandoffCostThresholds() {
  const override = parseEnvOverride(process.env[ENV_NAME]);
  if (override) return override;
  return { notice: DEFAULT.notice, warning: DEFAULT.warning, critical: DEFAULT.critical };
}

module.exports = {
  getHandoffCostThresholds: getHandoffCostThresholds,
  DEFAULT: DEFAULT,
  ENV_NAME: ENV_NAME,
};
