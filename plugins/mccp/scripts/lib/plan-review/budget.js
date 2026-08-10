'use strict';

// plan-review budget oracle — how many tokens the L2 refutation panel needs
// before it is worth firing.
//
// This exists because workflows/plan-review.js has had a budget gate since M1
// that could never fire: it reads `input.minRemaining`, the sole producer of
// that payload (cli.js emit-workflow-args) never emitted the key, so the value
// defaulted to 0 and `budget.remaining() < 0` is unreachable for any
// non-negative remaining. The gate was source that could not run. The live
// panel found it and named the correct fix — mirror plan-fanout, which has the
// same shape wired end to end.
//
// Mirrors plan-fanout/budget.js `parseFanoutMinPerAgent` (Number.isFinite +
// positive, loud fail-open to the default) and its `minPerAgent * FLEET_SIZE`
// conversion. Deliberately NOT `parseRolesMin`, which the plan's first draft
// cited: that parses an "MofN" quorum STRING and would reject a plain token
// count outright.
//
// Pure and dep-free — env in, number out. No cost-state, no tier policy: the
// panel's firing decision is owned by the runaway reservation (5.2b) and the
// quorum arithmetic (emit-workflow-args), and adding a second USD-shaped gate
// here would re-import exactly the sticky-critical lockout that v1.22.3 M3 spent
// a milestone retiring.

const ENV_MIN_PER_REVIEWER = 'MCCP_PLAN_REVIEW_BUDGET';

// Same per-agent estimate the fan-out uses. Reusing a validated number rather
// than inventing a panel-specific one is deliberate: both spend a read-only
// reviewer agent on the same repository, and a fresh threshold would have no
// evidence behind it.
const MIN_PER_REVIEWER_DEFAULT = 150000;

function warn(line) {
  process.stderr.write('[mccp:plan-review] ' + line + '\n');
}

// parsePanelBudget(env) → positive integer token estimate per reviewer.
//
// Loud fail-open to the default. Note which direction "fail-open" runs here: an
// unreadable value yields the DEFAULT, never 0. Zero would silently disable the
// gate, which is the defect this module exists to fix — a threshold nobody can
// read must not become a threshold nobody can hit.
function parsePanelBudget(env) {
  const raw = env && env[ENV_MIN_PER_REVIEWER];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return MIN_PER_REVIEWER_DEFAULT;
  }
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) {
    warn(ENV_MIN_PER_REVIEWER + ' must be a positive token count; got "' + raw +
      '". Falling back to default ' + MIN_PER_REVIEWER_DEFAULT + '.');
    return MIN_PER_REVIEWER_DEFAULT;
  }
  return Math.floor(n);
}

// panelMinRemaining(env, fleetLength) → tokens the turn must still have.
//
// `fleetLength` is the panel that will ACTUALLY launch — the fleet after the
// runaway reservation's --granted cap, not the four the policy wanted. Budgeting
// for reviewers that were never granted overstates the threshold and would skip
// a panel the turn can afford. A non-positive or unreadable length yields 0,
// which reads downstream as "no threshold": there is no fleet to pay for, and
// emit-workflow-args has already refused an empty fleet by then.
function panelMinRemaining(env, fleetLength) {
  const n = Number(fleetLength);
  if (!Number.isInteger(n) || n <= 0) return 0;
  return parsePanelBudget(env) * n;
}

module.exports = {
  parsePanelBudget: parsePanelBudget,
  panelMinRemaining: panelMinRemaining,
  ENV_MIN_PER_REVIEWER: ENV_MIN_PER_REVIEWER,
  MIN_PER_REVIEWER_DEFAULT: MIN_PER_REVIEWER_DEFAULT,
};
