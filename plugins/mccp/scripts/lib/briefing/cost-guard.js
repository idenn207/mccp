'use strict';

// v1.3.0-m2 briefing cost-tier × env policy × PR-phase re-entrancy gate.
//
// Single export shouldSkipBriefing(opts) → { skip, reason, tier }.
//
// Decision order (first match wins):
//   1. MCCP_BRIEFING=off        → ENV_OFF
//   2. MCCP_CODEX_DISABLED=1    → ENV_CODEX_DISABLED
//   3. pr-phase.lock w/ codex-review subphase → PR_PHASE_LOCKED (Codex R1 F3)
//   4. cost-tier ∈ autoDisableTiers          → TIER_* (default: notice/warning/critical)
//   5. otherwise → OK_RUN

const fs = require('fs');
const path = require('path');
const costState = require('../cost-state');
const subscription = require('../subscription');
const contextState = require('../context-state');
const envValue = require('../env-contract/value');

const REASONS = Object.freeze({
  OK_RUN: 'ok-run',
  TIER_NOTICE: 'tier-notice',
  TIER_WARNING: 'tier-warning',
  TIER_CRITICAL: 'tier-critical',
  ENV_OFF: 'env-off',
  ENV_CODEX_DISABLED: 'env-codex-disabled',
  PR_PHASE_LOCKED: 'pr-phase-locked',
  // cost-model-subscription M1 — positive context-overflow critical under
  // MCCP_SUBSCRIPTION (replaces order 4 USD tier autoDisable).
  SUBSCRIPTION_OVERFLOW: 'subscription-overflow',
});

const AUTODISABLE_TIERS_DEFAULT = Object.freeze(
  new Set(['notice', 'warning', 'critical'])
);

function parseTierOverride(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const tiers = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (tiers.length === 0) return null;
  const allowed = new Set(['green', 'notice', 'warning', 'critical']);
  for (let i = 0; i < tiers.length; i++) {
    if (!allowed.has(tiers[i])) return null;
  }
  return new Set(tiers);
}

// Codex R1 F3 absorption — mechanical PR-phase guard.
//
// If pr-phase.lock exists with active subphase=codex-review, briefing MUST NOT
// spawn a second Codex process (re-entrancy + lock contention risk). Reading
// the lock JSON is best-effort: missing/corrupt/different-shape lock counts
// as "not in codex-review subphase" (fail-open — the worst case is briefing
// runs harmlessly during a non-codex subphase).
function isInPRCodexReviewSubphase(repoRoot) {
  if (!repoRoot || typeof repoRoot !== 'string') return false;
  try {
    const lockPath = path.join(repoRoot, '.claude', 'state', 'pr-phase.lock');
    if (!fs.existsSync(lockPath)) return false;
    const raw = fs.readFileSync(lockPath, 'utf8');
    const obj = JSON.parse(raw);
    return !!(obj && obj.subphase === 'codex-review');
  } catch (_e) {
    return false;
  }
}

// M2 — briefing 정책의 수용 어휘를 명명 상수로 승격한다.
//
// 오늘까지 이 경로는 `=== 'off'` 한 값만 비교하고 나머지는 전부 기본 경로로 흘렸다.
// 그래서 문서가 가르치던 `always` 는 «구현되지 않았다»가 아니라 «구현되지 않았다는
// 사실조차 보이지 않는다»였다 — 운영자가 그 값을 넣으면 조용히 auto 로 동작했다.
// 승격 후 판정은 불변이고(off 만 skip), 열거 밖 값에 loud warn 한 줄이 늘 뿐이다.
//
// 대소문자를 접지 **않는다**: 접으면 오늘 auto 로 흐르던 `OFF` 가 skip 으로 바뀌어
// 판정이 실제로 달라진다. canonical 어휘는 소문자이고 그 밖은 전부 열거 밖이다.
// 같은 이유로 `trim()` 도 하지 않는다 — " off" 는 오늘 `=== 'off'` 에서 auto 로 흐르므로
// 다듬으면 skip 으로 바뀐다. 이 파서의 계약은 «오늘의 판정을 한 글자도 바꾸지 않고
// 열거 밖 값을 보이게 한다» 이고, 어휘를 넓히는 것은 그 위에 얹는 별개 변경이다.
//
// receipt-write 경로라 hook 만큼 잦지는 않지만 한 사이클에 여러 번 도는 것은 같다.
// ecc-context-monitor 의 cost-mode 파서와 같은 규약으로 프로세스당 1회로 묶는다 —
// 반복 warn 은 신호가 아니라 소음이다.
const BRIEFING_VALUES = ['auto', 'off'];
const BRIEFING_DEFAULT = 'auto';
let briefingModeWarned = false;

function parseBriefingMode(env) {
  const raw = (env || process.env).MCCP_BRIEFING;
  if (raw === undefined || raw === null || raw === '') return BRIEFING_DEFAULT;
  if (BRIEFING_VALUES.indexOf(raw) !== -1) return raw;
  if (briefingModeWarned) return BRIEFING_DEFAULT;
  briefingModeWarned = true;
  process.stderr.write('[mccp:briefing] WARNING: unknown MCCP_BRIEFING="' + raw
    + '" — falling back to ' + BRIEFING_DEFAULT
    + ' (allowed: ' + BRIEFING_VALUES.join('|') + ')\n');
  return BRIEFING_DEFAULT;
}

function shouldSkipBriefing(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const repoRoot = opts.repoRoot || null;
  const read = opts.costStateRead || costState.readState;
  const lockProbe = opts.lockProbe || isInPRCodexReviewSubphase;

  if (parseBriefingMode(env) === 'off') {
    return { skip: true, reason: REASONS.ENV_OFF, tier: null };
  }
  if (envValue.parseBool(env, 'MCCP_CODEX_DISABLED')) {
    return { skip: true, reason: REASONS.ENV_CODEX_DISABLED, tier: null };
  }
  if (lockProbe(repoRoot)) {
    return { skip: true, reason: REASONS.PR_PHASE_LOCKED, tier: null };
  }

  // cost-model-subscription M1 — subscription bypass. Orders 1-3 (env-off /
  // codex-disabled / pr-phase-locked) are NOT USD gates and stay above. This
  // replaces order 4 (USD tier autoDisable) with the context overflow axis,
  // fail-OPEN (Codex F1, user-accepted): absent/green runs, positive critical skips.
  if (subscription.isSubscriptionMode(env)) {
    const ctxRead = opts.contextStateRead || contextState.readState;
    let ctx;
    try { ctx = ctxRead(); } catch (_e) { ctx = null; }
    const of = subscription.evaluateOverflow({
      contextRemainingPct: ctx ? ctx.context_remaining_pct : null,
      toolCount: ctx ? ctx.tool_count : null,
      thresholds: subscription.parseOverflowThresholds(env),
    });
    if (of.overflow) return { skip: true, reason: REASONS.SUBSCRIPTION_OVERFLOW, tier: of.tier };
    return { skip: false, reason: REASONS.OK_RUN, tier: of.tier };
  }

  const autoDisableTiers = parseTierOverride(env.MCCP_BRIEFING_AUTODISABLE_TIER)
    || AUTODISABLE_TIERS_DEFAULT;

  const cs = read();
  if (!cs) {
    return { skip: false, reason: REASONS.OK_RUN, tier: null };
  }
  const tier = cs.threshold_tier || costState.tierFor(cs.cost_usd);
  if (autoDisableTiers.has(tier)) {
    const r = tier === 'notice' ? REASONS.TIER_NOTICE
      : tier === 'warning' ? REASONS.TIER_WARNING
      : REASONS.TIER_CRITICAL;
    return { skip: true, reason: r, tier: tier };
  }
  return { skip: false, reason: REASONS.OK_RUN, tier: tier };
}

module.exports = {
  shouldSkipBriefing: shouldSkipBriefing,
  isInPRCodexReviewSubphase: isInPRCodexReviewSubphase,
  REASONS: REASONS,
  AUTODISABLE_TIERS_DEFAULT: AUTODISABLE_TIERS_DEFAULT,
};
