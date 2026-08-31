'use strict';

// santa-delta-review M3 Task 3 — gate-policy env isolation for tests.
//
// A test that inherits ambient env measures the operator's settings, not the
// axis it names. This repository's own `.claude/settings.json` sets
// `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`, and three suites are therefore
// permanently red here: santa-loop-cap (25 pass / 28 fail -> 53 / 0),
// santa-adjudication (68 / 22 -> 90 / 0), santa-lanes (76 / 1 -> 77 / 0).
// A permanently red file buries the next real failure, which is why this is
// not cosmetic.
//
// The contract is the one `review-single-pass-gate.test.js:35` already uses and
// `santa-adjudication.test.js:51-52` already applies to the `MCCP_SANTA_*`
// family: **an explicit assignment always wins; a policy key nobody named is
// removed rather than inherited.** What that buys is not "reproduce 53/0" — that
// would depend on settings.json holding a particular value — but "the same
// result whether or not the toggle is set" (DD5).
//
// Keys are added here only after being MEASURED to make a suite red. Scrubbing
// a key that changes nothing widens the blast radius for no evidence.
const GATE_POLICY_KEYS = ['MCCP_REVIEW_SINGLE_PASS'];

// childEnv — env for a spawned child. Explicit `extra` wins; unnamed policy
// keys are deleted; every other ambient variable (PATH, HOME, …) is inherited
// untouched, because a child that cannot find `git` is a different bug.
function childEnv(extra) {
  const env = Object.assign({}, process.env, extra || {});
  GATE_POLICY_KEYS.forEach(function (key) {
    if (!(extra && Object.prototype.hasOwnProperty.call(extra, key))) delete env[key];
  });
  return env;
}

// scrubGatePolicyEnv — module-level normalisation for suites whose CLI helper
// runs IN-PROCESS (`runCli` reads `process.env` directly, so there is no child
// env to hand a value to). Call once at require time. A test that needs a
// non-default value sets it afterwards and still wins.
function scrubGatePolicyEnv() {
  const removed = [];
  GATE_POLICY_KEYS.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      removed.push(key);
      delete process.env[key];
    }
  });
  return removed;
}

// withoutGatePolicyEnv — scoped save/delete/restore for a single call, mirroring
// `santa-delta-instrumentation.test.js:66-73`. Use when a suite must keep the
// ambient value for its other tests.
function withoutGatePolicyEnv(fn) {
  const saved = Object.create(null);
  GATE_POLICY_KEYS.forEach(function (key) {
    saved[key] = process.env[key];
    delete process.env[key];
  });
  try {
    return fn();
  } finally {
    GATE_POLICY_KEYS.forEach(function (key) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  }
}

module.exports = {
  GATE_POLICY_KEYS: GATE_POLICY_KEYS,
  childEnv: childEnv,
  scrubGatePolicyEnv: scrubGatePolicyEnv,
  withoutGatePolicyEnv: withoutGatePolicyEnv,
};
