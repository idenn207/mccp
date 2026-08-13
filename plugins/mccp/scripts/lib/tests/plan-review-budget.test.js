'use strict';

// plan-review/budget.js — the per-reviewer token estimate behind the L2 panel's
// budget gate.
//
// The failure mode this guards is asymmetric and that asymmetry is the whole
// point: a threshold that reads as 0 does not "fail safe", it turns the gate off
// entirely (`remaining < 0` is unreachable), which is exactly how the M1 gate
// spent a milestone as unreachable source. So every unreadable input must land
// on the DEFAULT, never on zero.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePanelBudget,
  panelMinRemaining,
  MIN_PER_REVIEWER_DEFAULT,
  ENV_MIN_PER_REVIEWER,
} = require('../plan-review/budget');

// The oracle warns on stderr; silence it so the suite output stays readable
// while still exercising the real branch.
function quiet(fn) {
  const saved = process.stderr.write;
  const lines = [];
  process.stderr.write = function (s) { lines.push(String(s)); return true; };
  try {
    return { value: fn(), warnings: lines };
  } finally {
    process.stderr.write = saved;
  }
}

function env(v) {
  const e = {};
  if (v !== undefined) e[ENV_MIN_PER_REVIEWER] = v;
  return e;
}

test('the default mirrors plan-fanout (150000 per reviewer)', () => {
  assert.equal(MIN_PER_REVIEWER_DEFAULT, 150000);
  assert.equal(parsePanelBudget(env()), 150000);
  assert.equal(parsePanelBudget({}), 150000);
  assert.equal(parsePanelBudget(undefined), 150000);
});

test('a positive integer is taken verbatim', () => {
  assert.equal(parsePanelBudget(env('1000')), 1000);
  assert.equal(parsePanelBudget(env(' 250000 ')), 250000, 'whitespace is trimmed');
  assert.equal(parsePanelBudget(env(1)), 1);
});

test('a positive non-integer floors rather than rounding up', () => {
  assert.equal(parsePanelBudget(env('1000.9')), 1000,
    'a budget must never be quietly rounded UP into a stricter gate');
});

test('zero, negatives and non-numbers fall back to the default, loudly', () => {
  ['0', '-1', '-150000', 'abc', 'NaN', 'Infinity', '1e', '  '].forEach(function (raw) {
    const { value, warnings } = quiet(function () { return parsePanelBudget(env(raw)); });
    assert.equal(value, MIN_PER_REVIEWER_DEFAULT, 'raw=' + JSON.stringify(raw));
    if (String(raw).trim() !== '') {
      assert.match(warnings.join(''), /positive token count/,
        'a rejected value must be announced, not swallowed (raw=' + JSON.stringify(raw) + ')');
    }
  });
});

test('an EMPTY value is the unset case — default, and no warning', () => {
  // Distinct from a malformed value: `MCCP_PLAN_REVIEW_BUDGET=` in a settings
  // file is "not configured", and warning about it would train the operator to
  // ignore the warning that matters.
  const { value, warnings } = quiet(function () { return parsePanelBudget(env('')); });
  assert.equal(value, MIN_PER_REVIEWER_DEFAULT);
  assert.equal(warnings.length, 0);
});

test('zero must NOT be honoured — it would disable the gate, not relax it', () => {
  // Pinning the intent, not just the number: `minRemaining = 0` makes
  // `budget.remaining() < 0` unreachable, which is the exact defect M4 exists to
  // close. An operator who wants no gate sets no budget target on the turn.
  assert.equal(quiet(function () { return parsePanelBudget(env('0')); }).value, 150000);
  assert.ok(panelMinRemaining(env('0'), 4) > 0);
});

test('panelMinRemaining scales with the panel that will actually launch', () => {
  assert.equal(panelMinRemaining(env(), 4), 600000);
  assert.equal(panelMinRemaining(env(), 2), 300000);
  assert.equal(panelMinRemaining(env('1000'), 3), 3000);
});

test('a non-positive or unreadable fleet length yields 0 — no fleet, no bill', () => {
  [0, -1, 2.5, null, undefined, 'four', NaN].forEach(function (n) {
    assert.equal(panelMinRemaining(env(), n), 0, 'fleetLength=' + String(n));
  });
});

// ── PR-Codex F2 (medium) — fractional values floored to zero ──────────────────
//
// The guard ran on the RAW number, then floored. `0 < n < 1` passed "finite and
// positive" and then floored to 0, producing the one output this module documents
// as impossible. A 0 threshold does not relax the gate, it removes it: the
// consumer compares `remaining < minRemaining`, which is unreachable for any
// non-negative remaining. That is the M1 defect verbatim, reachable through an
// env var rather than a missing payload key.
test('F2: a value that floors to zero falls back to the default, not to 0', () => {
  for (const raw of ['0.5', '0.999', '0.0001', '.5']) {
    const { value, warnings } = quiet(() => parsePanelBudget(env(raw)));
    assert.equal(value, MIN_PER_REVIEWER_DEFAULT,
      `${raw} must fall back to the default; got ${value}`);
    assert.ok(warnings.join('').includes(ENV_MIN_PER_REVIEWER),
      `${raw} must warn loudly rather than degrade silently`);
  }
});

test('F2: a fractional value ≥ 1 still floors normally', () => {
  assert.equal(parsePanelBudget(env('1.9')), 1);
  assert.equal(parsePanelBudget(env('150000.7')), 150000);
});

test('F2: the zero threshold is unreachable through any env value', () => {
  const inputs = ['0', '-1', '0.5', '0.999', 'abc', '', '   ', 'NaN', 'Infinity',
    '-Infinity', '1e-9', 'null', 'undefined'];
  for (const raw of inputs) {
    const { value } = quiet(() => parsePanelBudget(env(raw)));
    assert.ok(Number.isInteger(value) && value >= 1,
      `${JSON.stringify(raw)} produced ${value}; the gate must never be switched off`);
  }
});

test('F2: a huge value stays finite and serializable', () => {
  const { value } = quiet(() => parsePanelBudget(env('1e21')));
  assert.ok(Number.isFinite(value), 'must not become Infinity');
  assert.equal(JSON.parse(JSON.stringify({ v: value })).v, value,
    'must survive the JSON round-trip into workflow-args.json');
  const min = panelMinRemaining(env('1e21'), 4);
  assert.ok(Number.isFinite(min) && min > 0, 'minRemaining must stay a usable number');
});

// santa-loop (Codex GPT-5.4) — the guarantee above is asserted on the PARSED
// value, and the assertion that reaches for the product picked 1e21, which
// multiplies to 4e21 and stays finite. Every value between there and
// Number.MAX_VALUE was untested, and the product is where the failure lives:
// parsePanelBudget accepts any finite positive number, so 9e307 survives it and
// only overflows when multiplied by the fleet.
//
// The consequence is the exact inversion of this module's stated purpose. A
// threshold of Infinity is not a strict gate — `remaining < Infinity` is true for
// every remaining there is, so the panel skips on every run that sets
// budget.total, permanently and without a word. The module's own header calls a
// zero threshold "a threshold nobody can hit"; an infinite one is a threshold
// nobody can clear, and it arrives from arithmetic rather than from anything the
// operator typed.
test('F3: minRemaining stays finite for every value parsePanelBudget accepts', () => {
  // 9e307 * 4 overflows; 1e308 overflows against any fleet at all.
  for (const raw of ['9e307', '1e308', '1.7e308']) {
    for (const fleet of [1, 2, 3, 4]) {
      const { value } = quiet(() => panelMinRemaining(env(raw), fleet));
      assert.ok(Number.isFinite(value),
        `${JSON.stringify(raw)} × ${fleet} produced ${value}; an infinite threshold ` +
        'skips the panel on every run instead of gating it');
    }
  }
});

test('F3: an overflowing budget falls back loudly, it does not skip silently', () => {
  const { value, warnings } = quiet(() => panelMinRemaining(env('9e307'), 4));
  assert.ok(Number.isFinite(value) && value > 0, 'must land on a usable threshold');
  assert.equal(value, MIN_PER_REVIEWER_DEFAULT * 4,
    'the fallback is the validated default, not an invented number');
  assert.ok(warnings.join('').includes(ENV_MIN_PER_REVIEWER),
    'silence is the failure mode this module exists to prevent — the operator ' +
    'must be told the value they set was not the value used');
});
