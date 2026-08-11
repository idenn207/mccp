'use strict';

// plan-review record oracle — turns the REVIEW_DIR artifacts into the durable
// review record at `.claude/reviews/plan-review-<slug>.md`.
//
// Why this is code and not prose in the command body: M1 asked the LLM to type
// that markdown by hand, which made the record unable to hold a MEASUREMENT.
// The milestone shipped a wall-clock stamp that lived only inside 5.6b's receipt
// write, so a run that HALTed before the receipt recorded nothing — and the
// longer a run took, the likelier it was to halt. Survivorship bias was built
// into the instrument: 40 receipts in the repository, zero with a review
// verdict. Moving the measurement into a file that is written on EVERY exit path
// is the fix, and a file written by an oracle is the only kind a unit test can
// hold still.
//
// Pure and dep-free. `buildReviewRecord` NEVER throws — a record generator that
// can throw would turn instrumentation into a new way for the gate to die, and
// the whole point is that measuring must not be able to block approval. Missing
// artifacts are the NORMAL case: a run blocked at 5.2b has no l2.json, one
// blocked at 5.2c-emit has no decision.json. Absent axes are written as null and
// `halt_stage` says where the run stopped. Nothing is inferred.

const VERDICT_UNKNOWN = 'unknown';

// ── small helpers (all total — no throw, no assumption) ───────────────────────

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

// Table cells are one line. A claim with a newline or a raw pipe would silently
// break the row it lives in, which is how a finding disappears from the record
// that exists to preserve findings.
//
// Backslashes are escaped FIRST, and the order is the whole correctness of this
// function. Escaping only the pipe turns the input `a\|b` into `a\\|b`, which
// markdown renders as a literal backslash followed by a LIVE delimiter — the row
// splits anyway, and it splits on precisely the input that was already trying to
// talk about escaping. Evidence citations carry Windows paths and regexes, so
// this is not hypothetical here.
function cell(v) {
  return str(v)
    .replace(/\r?\n+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .trim();
}

function code(v) {
  const s = str(v);
  return s === '' ? '`(none)`' : '`' + s.replace(/`/g, '') + '`';
}

function intOrNull(v) {
  return Number.isFinite(v) ? Math.round(v) : null;
}

// ── slug / path ───────────────────────────────────────────────────────────────

// The slug reaches this module from `receipt/cli.js derive-decision`, which is
// repo-internal — but it is concatenated into a filesystem path, so treat it as
// untrusted anyway. A slug is an identifier; anything that is not one is not
// "close enough", it is a different file.
function sanitizeSlug(raw) {
  const s = str(raw).trim();
  const cleaned = s.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[.-]+/, '').replace(/-{2,}/g, '-');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'unknown-decision';
}

function reviewRecordPath(slug) {
  return '.claude/reviews/plan-review-' + sanitizeSlug(slug) + '.md';
}

// ── layer readings ────────────────────────────────────────────────────────────

function readL1(l1) {
  if (!isObj(l1)) return null;
  return typeof l1.verdict === 'string' ? l1.verdict : null;
}

// The L2 reading is derived from the workflow's own return, not from the
// decision — a run that halted before `decide` still has an l2.json worth
// reporting, and a run whose panel was skipped for budget must say so rather
// than read as "divergent".
function readL2(l2, quorum) {
  if (!isObj(l2)) return null;
  if (l2.skipped === true) {
    const why = str(l2.reason) || 'unknown';
    if (why === 'budget' && Number.isFinite(l2.remaining) && Number.isFinite(l2.minRemaining)) {
      return 'skipped (budget: remaining ' + l2.remaining + ' < ' + l2.minRemaining + ')';
    }
    return 'skipped (' + why + ')';
  }
  if (isObj(quorum) && typeof quorum.passed === 'boolean') {
    return quorum.passed ? 'converged' : 'divergent';
  }
  return 'ran (quorum not evaluated)';
}

function readL3(l3) {
  if (!isObj(l3)) return 'not fired';
  if (l3.invoked === false) {
    const why = str(l3.reason);
    return why ? 'not fired (' + why + ')' : 'not fired';
  }
  return typeof l3.verdict === 'string' && l3.verdict ? l3.verdict : 'not fired';
}

// ── quorum reading ────────────────────────────────────────────────────────────
//
// Prefer what `decide` actually computed; fall back to the proof; only then
// count the raw results. The fallback is a reading of evidence, never a guess at
// a threshold: `required`/`of` stay null when nobody told us what they were.
function readQuorum(decision, l2) {
  if (isObj(decision) && isObj(decision.quorum)) return decision.quorum;
  if (isObj(decision) && isObj(decision.review_proof) && isObj(decision.review_proof.quorum)) {
    return decision.review_proof.quorum;
  }
  if (isObj(l2) && Array.isArray(l2.results)) {
    const usable = l2.results.filter(isObj);
    const roles = Object.keys(usable.reduce(function (acc, r) {
      if (typeof r.perspective === 'string' && r.perspective) acc[r.perspective] = true;
      return acc;
    }, Object.create(null))).length;
    return { passed: null, responded: usable.length, roles: roles, required: null, of: null };
  }
  return null;
}

function quorumLine(q) {
  if (!isObj(q)) return '(no panel result recorded)';
  const responded = Number.isFinite(q.responded) ? q.responded : '?';
  const required = Number.isFinite(q.required) ? q.required : '?';
  const roles = Number.isFinite(q.roles) ? q.roles : '?';
  const of = Number.isFinite(q.of) ? q.of : '?';
  const passed = typeof q.passed === 'boolean' ? String(q.passed) : 'unknown';
  return responded + '/' + required + ' responses · ' + roles +
    ' distinct roles (of ' + of + ' fielded) · passed=' + passed;
}

// ── findings / refutation tables ──────────────────────────────────────────────

// PR-Codex R3 F2 — a reviewer can block WITHOUT filing a finding.
//
// quorum.js treats `verdict === 'fail'` as a blocking finding in its own right
// (quorum.js:175-181), synthesising one even when `findings` is empty. Rendering
// only `results[].findings[]` therefore produced a record that said "None — all
// reviewers passed" for a run the gate had just blocked on that very reviewer —
// a false operator-facing record on exactly the blocked path this milestone
// exists to preserve. The synthetic row mirrors the oracle's own wording so the
// record and the reason agree.
function findingRows(l2) {
  const results = (isObj(l2) && Array.isArray(l2.results)) ? l2.results.filter(isObj) : [];
  const rows = [];
  results.forEach(function (r) {
    const findings = Array.isArray(r.findings) ? r.findings : [];
    let emitted = 0;
    findings.forEach(function (f) {
      if (!isObj(f)) return;
      emitted += 1;
      rows.push('| ' + cell(r.perspective) + ' | ' + cell(f.severity) + ' | ' +
        cell(f.claim) + ' | ' + cell(f.evidence) + ' |');
    });
    if (r.verdict === 'fail' && emitted === 0) {
      rows.push('| ' + cell(r.perspective) + ' | ' + cell('FAIL') + ' | ' +
        cell('reviewer returned verdict=fail') + ' | ' +
        cell('(no finding filed — the verdict itself is the block)') + ' |');
    }
  });
  return rows;
}

function refutationRows(l2) {
  const results = (isObj(l2) && Array.isArray(l2.results)) ? l2.results.filter(isObj) : [];
  return results.map(function (r) {
    return '| ' + cell(r.perspective) + ' | ' + cell(r.verdict) + ' | ' +
      cell(r.refutationAttempted) + ' |';
  });
}

// ── the record ────────────────────────────────────────────────────────────────
//
// buildReviewRecord({slug, planPath, mode, l1, l2, l3, decision, reservation,
//                    startedAtMs, nowMs, haltStage})
//   → { markdown, measurement, degradations }
//
// `degradations` names every axis that could not be read. The caller prints them
// to stderr: an instrument that quietly reports less than it measured is the
// problem this milestone is fixing, so silence is not an option even though the
// exit code stays 0.
function buildReviewRecord(opts) {
  const o = isObj(opts) ? opts : {};
  const degradations = [];
  const note = function (m) { degradations.push(m); };

  // Degradations the CALLER already observed — a rejected --review-dir, say.
  // They belong in the written record and not only on stderr: the record is the
  // durable surface, and one that cannot say why it is empty is the same silent
  // instrument this module was written to replace.
  if (Array.isArray(o.extraDegradations)) {
    o.extraDegradations.forEach(function (d) {
      if (typeof d === 'string' && d.trim()) note(d.trim());
    });
  }

  const slug = sanitizeSlug(o.slug);
  const l1 = isObj(o.l1) ? o.l1 : null;
  const l2 = isObj(o.l2) ? o.l2 : null;
  const l3 = isObj(o.l3) ? o.l3 : null;
  const decision = isObj(o.decision) ? o.decision : null;
  const reservation = isObj(o.reservation) ? o.reservation : null;

  if (!l1) note('l1.json absent or unreadable — L1 layer recorded as null');
  if (!l2) note('l2.json absent or unreadable — no panel findings to record');
  if (!decision) note('decision.json absent or unreadable — verdict recorded as unknown');

  const quorum = readQuorum(decision, l2);
  const layers = {
    l1: readL1(l1),
    l2: readL2(l2, quorum),
    l3: readL3(l3),
  };

  const verdict = (decision && typeof decision.review_verdict === 'string' && decision.review_verdict)
    ? decision.review_verdict : VERDICT_UNKNOWN;
  const source = (decision && typeof decision.review_source === 'string' && decision.review_source)
    ? decision.review_source
    : ((typeof o.mode === 'string' && o.mode) ? o.mode : null);

  const reviewedPlanHash = (l2 && typeof l2.reviewedPlanHash === 'string' && l2.reviewedPlanHash)
    ? l2.reviewedPlanHash
    : ((decision && isObj(decision.review_proof) &&
        typeof decision.review_proof.reviewed_plan_hash === 'string')
      ? decision.review_proof.reviewed_plan_hash : null);

  const startedAtMs = intOrNull(o.startedAtMs);
  const nowMs = intOrNull(o.nowMs);
  let wallClockMs = null;
  if (startedAtMs === null) {
    note('started-at absent or unreadable — wall_clock_ms recorded as null, ' +
      'NOT as zero (an unmeasured duration must not read as an instant one)');
  } else if (nowMs === null) {
    note('current time unavailable — wall_clock_ms recorded as null');
  } else {
    wallClockMs = nowMs - startedAtMs;
    if (wallClockMs < 0) {
      note('started-at is in the future (' + wallClockMs + 'ms) — clock skew or a ' +
        'stale artifact; wall_clock_ms recorded as null');
      wallClockMs = null;
    }
  }

  const haltStage = (typeof o.haltStage === 'string' && o.haltStage.trim())
    ? o.haltStage.trim() : null;

  const measurement = {
    verdict: verdict,
    source: source,
    layers: layers,
    quorum: isObj(quorum) ? {
      responded: Number.isFinite(quorum.responded) ? quorum.responded : null,
      required: Number.isFinite(quorum.required) ? quorum.required : null,
      roles: Number.isFinite(quorum.roles) ? quorum.roles : null,
      of: Number.isFinite(quorum.of) ? quorum.of : null,
      passed: typeof quorum.passed === 'boolean' ? quorum.passed : null,
    } : null,
    wall_clock_ms: wallClockMs,
    halt_stage: haltStage,
    granted: (reservation && Number.isFinite(reservation.granted)) ? reservation.granted : null,
    reviewed_plan_hash: reviewedPlanHash,
    plan_path: (typeof o.planPath === 'string' && o.planPath) ? o.planPath : null,
    recorded_at: nowMs === null ? null : new Date(nowMs).toISOString(),
  };

  const fRows = findingRows(l2);
  const rRows = refutationRows(l2);
  const reason = decision ? str(decision.reason) : '';

  const lines = [];
  lines.push('# Plan Review Panel — ' + slug);
  lines.push('');
  lines.push('**Plan**: ' + code(measurement.plan_path) + ' · **Plan version**: ' +
    code(reviewedPlanHash));
  lines.push('**Verdict**: ' + code(verdict) + ' via ' + code(source));
  lines.push('**Quorum**: ' + quorumLine(quorum));
  lines.push('**Layers**: L1 ' + (layers.l1 || 'not run') + ' · L2 ' +
    (layers.l2 || 'not run') + ' · L3 ' + layers.l3);
  if (haltStage) {
    lines.push('**Halted at**: `' + haltStage + '`');
  }
  lines.push('');
  if (reason) {
    lines.push('> Reason: ' + reason.replace(/\r?\n+/g, ' '));
    lines.push('');
  }
  lines.push('## Findings');
  lines.push('');
  if (fRows.length > 0) {
    lines.push('| Perspective | Severity | Claim | Evidence |');
    lines.push('|---|---|---|---|');
    fRows.forEach(function (r) { lines.push(r); });
  } else if (rRows.length > 0) {
    lines.push('None — all reviewers passed.');
  } else {
    lines.push('None recorded — the panel produced no readable results ' +
      (haltStage ? '(halted at `' + haltStage + '`).' : '.'));
  }
  lines.push('');
  lines.push('## Refutation attempted');
  lines.push('');
  if (rRows.length > 0) {
    lines.push('| Perspective | Verdict | What was attacked |');
    lines.push('|---|---|---|');
    rRows.forEach(function (r) { lines.push(r); });
  } else {
    lines.push('No reviewer result reached this record.');
  }
  lines.push('');
  lines.push('## Measurement');
  lines.push('');
  lines.push('<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.');
  lines.push('     Machine-readable; do not hand-edit. A null field means the axis was');
  lines.push('     not observed, never that it was zero. -->');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(measurement, null, 2));
  lines.push('```');
  if (degradations.length > 0) {
    lines.push('');
    lines.push('### Recording degradations');
    lines.push('');
    degradations.forEach(function (d) { lines.push('- ' + d); });
  }
  lines.push('');

  return {
    markdown: lines.join('\n'),
    measurement: measurement,
    degradations: degradations,
  };
}

module.exports = {
  buildReviewRecord: buildReviewRecord,
  reviewRecordPath: reviewRecordPath,
  sanitizeSlug: sanitizeSlug,
};
