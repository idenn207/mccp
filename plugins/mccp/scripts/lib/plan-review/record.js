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

// review-record-linkage M3 — the ONE owner of repo-relative POSIX folding, shared
// with `receipt/write.js`. This is the only `require` in this file and it does not
// break the dep-free contract declared above: `repo-path.js` requires `path` alone
// (a pure builtin, zero I/O), so the transitive dependency set this module drags
// into the write path is still empty — which is what that contract protects
// (`linkage-defs.js` header: "순수 술어만 담은 파일을 import하면 전이 의존이 0이다").
const { toRepoRelativePosix } = require('../repo-path');

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
//                    startedAtMs, nowMs, haltStage, backlog})
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

  // ── backlog 적재 (review-loop-bypass M2) ───────────────────────────────────
  //
  // `assert-backlog-parity`의 판독 앵커다. **부재는 0이 아니라 null**이다: 0으로
  // 적으면 "적재가 아예 안 돌았다"가 "적재할 것이 없었다"는 통과 기록으로
  // 읽힌다. 그 둘은 다른 사실이고, 구분하지 못하는 계측은 M2가 닫으려는 유실을
  // 그대로 재현한다. 토글이 꺼진 실행에서 이 축이 null인 것은 정상이며,
  // 그 사실 자체가 "기본 경로 무변경"의 관측 근거다.
  // 부재가 **결손인지**는 완화가 일어났는지가 정한다. `single_pass_reason`이
  // 있는 실행에서 아티팩트가 없으면 5.2g2가 돌았어야 하는데 안 돈 것이라 결손이고,
  // 토글이 꺼진 실행에서는 5.2g2 자체가 no-op이라 부재가 정상이다. 조건 없이
  // 결손으로 적으면 기본 경로의 모든 실행이 degraded로 읽혀, 진짜 결손이 그
  // 노이즈에 묻힌다.
  const backlog = isObj(o.backlog) ? o.backlog : null;
  const relaxed = !!(decision && typeof decision.single_pass_reason === 'string' &&
    decision.single_pass_reason.trim());
  let backlogAppended = null;
  let backlogSkippedNonblocking = null;
  if (!backlog) {
    if (relaxed) {
      note('backlog.json absent or unreadable on a run the single-pass toggle RELAXED — ' +
        'backlog_appended recorded as null, NOT as zero (적재가 돌지 않은 실행과 적재할 것이 ' +
        '없던 실행은 다른 사실이다). 5.2g2가 실행되지 않았거나 산출물을 잃었다');
    }
  } else {
    backlogAppended = Number.isInteger(backlog.appended) ? backlog.appended : null;
    if (backlogAppended === null) {
      note('backlog.json is present but `appended` is not an integer — recorded as null');
    }
    backlogSkippedNonblocking = Number.isInteger(backlog.skipped_nonblocking)
      ? backlog.skipped_nonblocking : null;
    if (backlogSkippedNonblocking === null) {
      note('backlog.json carries no readable `skipped_nonblocking` — recorded as null ' +
        '(l2.json이 판독 불가였거나 적재가 그 축을 세지 않았다)');
    }
  }

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
    backlog_appended: backlogAppended,
    backlog_skipped_nonblocking: backlogSkippedNonblocking,
    granted: (reservation && Number.isFinite(reservation.granted)) ? reservation.granted : null,
    reviewed_plan_hash: reviewedPlanHash,
    // review-record-linkage M3 — folded by the SAME rule receipt/write.js uses for
    // `meta.plan_path`. This value is one end of the M3 path anchor, and the
    // back-patch decision-binding that reads it is FAIL-CLOSED: a notation
    // difference here does not surface as a missing stamp, it surfaces as a
    // REJECTED SHIP. Two normalizations would therefore turn a cosmetic
    // difference into an outage, which is why the rule has exactly one owner
    // (`lib/repo-path.js`, R4 architect HIGH `7a88ff03`).
    //
    // Unfoldable input (absolute with no repoRoot, escaping, non-string) folds to
    // `null` — "not recorded", never a half-normalized string. `repoRoot` is
    // optional: without it only separators/`./`/duplicate slashes collapse, which
    // is what the caller supplies today for an already-relative path.
    plan_path: toRepoRelativePosix(o.planPath, o.repoRoot),
    // M3 — the receipt-side of the bidirectional link. NEVER filled here: the
    // record is written BEFORE the ship receipt exists, so at this moment there is
    // no hash to record. `null` says "not yet sealed"; an ABSENT key says "this
    // build has no linkage axis at all", and an audit must be able to tell a
    // pre-M3 record from an unlinked one.
    receipt_hash: null,
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
    // "All reviewers passed" is a claim about the whole PANEL, but this branch only
    // knows the reviewers that came back. `[pass, null, null]` lands here: one
    // usable result, no findings, and a quorum that blocks because two reviewers
    // never answered. Asserting they passed is the same false operator-facing
    // record R3 already caught for an explicit `fail` with an empty findings
    // array — this is its partial-response form. Silence from a reviewer is
    // absence, never approval.
    const q = measurement.quorum;
    const fielded = (q && q.of !== null) ? q.of : null;
    const responded = (q && q.responded !== null) ? q.responded : rRows.length;
    const clean = !!(q && q.passed === true && fielded !== null && responded === fielded);
    if (clean) {
      lines.push('None — all ' + fielded + ' fielded reviewer(s) responded and passed.');
    } else {
      lines.push('None from the ' + responded + ' reviewer(s) that returned a usable result' +
        (fielded !== null ? ' (of ' + fielded + ' fielded)' : '') +
        '. This is **not** a clean pass: the panel verdict is `' + verdict + '`' +
        ((q && q.passed === false) ? ' and the quorum did not hold' : '') +
        '. Reviewers that returned nothing are absent from this record, not passing.');
    }
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
