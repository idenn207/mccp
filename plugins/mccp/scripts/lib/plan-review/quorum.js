'use strict';

// L2 quorum — pure oracle deciding whether the refute panel approved.
//
// Two independent axes, deliberately kept as separate knobs:
//   M (`required`)  — how many reviewers answered at all
//   K (`rolesMin`)  — how many DISTINCT lenses those answers came from
// Collapsing them would let one role answering three times satisfy a "3 of 4"
// panel, which is the precise thing role diversity is meant to prevent. That is
// K's only job, and it is why it stays its own toggle.
//
// Fail-closed throughout: a missing, malformed, or unparseable reviewer result
// is not a silent absence, it is a non-response, and non-responses can only
// ever push the panel away from passing. A single HIGH/CRITICAL finding — or a
// single explicit `fail` verdict — sinks the panel regardless of how many
// others passed. Approval here means "nobody found anything", not "most people
// were happy" (mirrors result-schema.js#mergeVerdicts most-severe-first).

const { SEVERITY_ENUM, VERDICT_ENUM } = require('./perspectives');
const { MIN_QUORUM_REQUIRED } = require('../review-verdict');

const ENV_QUORUM = 'MCCP_PLAN_REVIEW_QUORUM';
const ENV_ROLES_MIN = 'MCCP_PLAN_REVIEW_ROLES_MIN';

const DEFAULT_REQUIRED = 3;
const DEFAULT_OF = 4;
const DEFAULT_ROLES_MIN = 3;

// Fleet ceiling — mirrors the fan-out fleet size. A quorum cannot demand more
// reviewers than the panel can field.
const MAX_OF = 4;

const DEFAULT_BLOCK_SEVERITY = Object.freeze(['HIGH', 'CRITICAL']);

function warn(msg) {
  process.stderr.write('[mccp:plan-review] ' + msg + '\n');
}

// parseQuorum(env) → { required, of }
// "MofN" (e.g. "3of4"). Anything unparseable falls back to the default WITH a
// loud warn — a quorum silently loosened by a typo is the failure this guards.
function parseQuorum(env) {
  const fallback = { required: DEFAULT_REQUIRED, of: DEFAULT_OF };
  const raw = env && env[ENV_QUORUM];
  if (raw === undefined || raw === null || raw === '') return fallback;

  const m = String(raw).trim().toLowerCase().match(/^(\d+)\s*of\s*(\d+)$/);
  if (!m) {
    warn('unknown ' + ENV_QUORUM + '="' + raw + '" (expected "<M>of<N>") — using ' +
      DEFAULT_REQUIRED + 'of' + DEFAULT_OF);
    return fallback;
  }

  const required = parseInt(m[1], 10);
  const of = parseInt(m[2], 10);

  if (required < MIN_QUORUM_REQUIRED) {
    warn(ENV_QUORUM + '="' + raw + '" demands only ' + required +
      ' response(s); a quorum of fewer than ' + MIN_QUORUM_REQUIRED +
      ' is a single judge wearing a panel\'s vocabulary — using ' +
      DEFAULT_REQUIRED + 'of' + DEFAULT_OF);
    return fallback;
  }
  if (of > MAX_OF) {
    warn(ENV_QUORUM + '="' + raw + '" wants ' + of + ' perspectives but the panel ' +
      'fields at most ' + MAX_OF + ' — using ' + DEFAULT_REQUIRED + 'of' + DEFAULT_OF);
    return fallback;
  }
  if (of < required) {
    warn(ENV_QUORUM + '="' + raw + '" is unsatisfiable (of < required) — using ' +
      DEFAULT_REQUIRED + 'of' + DEFAULT_OF);
    return fallback;
  }

  return { required: required, of: of };
}

// parseRolesMin(env, of) → integer ≥ 1
//
// `of` is the panel size the quorum will actually field. K > N is not a strict
// quorum, it is an UNSATISFIABLE one: no run can ever produce more distinct
// lenses than there are reviewers, so the gate would block every plan forever
// with a reason that names roles rather than the misconfiguration. parseQuorum
// already refuses `of < required` for the same reason; this is the missing
// symmetric check on the K axis. Clamping (rather than falling back to the
// default) keeps the operator's intent — "demand as much diversity as possible"
// — while making it reachable.
function parseRolesMin(env, of) {
  const cap = Number.isInteger(of) && of >= 1 ? Math.min(of, MAX_OF) : MAX_OF;
  const raw = env && env[ENV_ROLES_MIN];

  let n;
  if (raw === undefined || raw === null || raw === '') {
    n = DEFAULT_ROLES_MIN;
  } else {
    n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_OF) {
      warn('unknown ' + ENV_ROLES_MIN + '="' + raw + '" — using ' + DEFAULT_ROLES_MIN);
      n = DEFAULT_ROLES_MIN;
    }
  }

  if (n > cap) {
    warn(ENV_ROLES_MIN + '=' + n + ' demands more distinct roles than the panel of ' +
      cap + ' can field (unsatisfiable — the quorum could never pass) — clamping to ' + cap);
    return cap;
  }
  return n;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// A result counts as a response only if it is shaped like one. A reviewer that
// returned prose, crashed, or was never launched contributes nothing — and
// crucially is NOT treated as a pass.
function isUsableResult(r) {
  if (!isPlainObject(r)) return false;
  if (typeof r.perspective !== 'string' || r.perspective.length === 0) return false;
  if (VERDICT_ENUM.indexOf(r.verdict) === -1) return false;
  if (r.findings !== undefined && r.findings !== null && !Array.isArray(r.findings)) return false;
  return true;
}

function normalizeSeverity(s) {
  if (typeof s !== 'string') return null;
  const up = s.trim().toUpperCase();
  return SEVERITY_ENUM.indexOf(up) !== -1 ? up : null;
}

// decideQuorum({results, required, of, rolesMin, blockSeverity})
//   → { passed, responded, roles, blockingFindings, malformed, reason }
function decideQuorum(opts) {
  const o = opts || {};
  const results = Array.isArray(o.results) ? o.results : [];
  const required = Number.isInteger(o.required) ? o.required : DEFAULT_REQUIRED;
  const of = Number.isInteger(o.of) ? o.of : DEFAULT_OF;
  const rolesMin = Number.isInteger(o.rolesMin) ? o.rolesMin : DEFAULT_ROLES_MIN;
  const blockSeverity = Array.isArray(o.blockSeverity) && o.blockSeverity.length
    ? o.blockSeverity.map(function (s) { return String(s).toUpperCase(); })
    : DEFAULT_BLOCK_SEVERITY.slice();

  const usable = [];
  let malformed = 0;
  results.forEach(function (r) {
    if (isUsableResult(r)) usable.push(r);
    else if (r !== null && r !== undefined) malformed += 1;
  });

  // Distinct roles only — a duplicate role adds a response but no diversity, so
  // it counts toward M and not toward K. Counting it twice in M is honest: it
  // really did answer.
  const roleSet = Object.create(null);
  usable.forEach(function (r) { roleSet[r.perspective] = true; });
  const roles = Object.keys(roleSet).length;
  const responded = usable.length;

  const blockingFindings = [];
  usable.forEach(function (r) {
    const findings = Array.isArray(r.findings) ? r.findings : [];
    findings.forEach(function (f) {
      if (!isPlainObject(f)) return;
      const sev = normalizeSeverity(f.severity);
      // An unrecognised severity is treated as blocking. A finding whose weight
      // we cannot read is not a finding we may discard.
      if (sev === null || blockSeverity.indexOf(sev) !== -1) {
        blockingFindings.push({
          perspective: r.perspective,
          claim: isPlainObject(f) ? f.claim : null,
          severity: sev === null ? 'UNKNOWN' : sev,
        });
      }
    });
    if (r.verdict === 'fail') {
      blockingFindings.push({
        perspective: r.perspective,
        claim: 'reviewer returned verdict=fail',
        severity: 'FAIL',
      });
    }
  });

  const reasons = [];
  if (responded < required) {
    reasons.push('only ' + responded + ' of ' + required + ' required responses' +
      (malformed ? ' (' + malformed + ' malformed/unusable)' : ''));
  }
  if (roles < rolesMin) {
    reasons.push('only ' + roles + ' distinct role(s), need ' + rolesMin);
  }
  if (blockingFindings.length > 0) {
    reasons.push(blockingFindings.length + ' blocking finding(s): ' +
      blockingFindings.slice(0, 4).map(function (b) {
        return b.perspective + '/' + b.severity;
      }).join(', '));
  }

  return {
    passed: reasons.length === 0,
    responded: responded,
    roles: roles,
    of: of,
    required: required,
    rolesMin: rolesMin,
    malformed: malformed,
    blockingFindings: blockingFindings,
    reason: reasons.length === 0 ? 'quorum satisfied' : reasons.join('; '),
  };
}

module.exports = {
  decideQuorum: decideQuorum,
  parseQuorum: parseQuorum,
  parseRolesMin: parseRolesMin,
  // Exported so decideReview builds review_proof.perspectives from EXACTLY the
  // set this oracle counted. Two different notions of "a reviewer answered"
  // would make the proof's self-consistency check fail on honest runs.
  isUsableResult: isUsableResult,
  DEFAULT_REQUIRED: DEFAULT_REQUIRED,
  DEFAULT_OF: DEFAULT_OF,
  DEFAULT_ROLES_MIN: DEFAULT_ROLES_MIN,
  DEFAULT_BLOCK_SEVERITY: DEFAULT_BLOCK_SEVERITY,
  MAX_OF: MAX_OF,
  ENV_QUORUM: ENV_QUORUM,
  ENV_ROLES_MIN: ENV_ROLES_MIN,
};
