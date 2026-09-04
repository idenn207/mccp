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
// review-record-linkage M4 — D1 자기 대조(DD4의 1번). `linkage-defs.js`는 `require`
// 0건이라 전이 의존이 비어 있고(그 파일 헤더가 이 용도를 명시 예약해 뒀다), 따라서
// 위 계약이 보호하는 것 — 계측이 fs/child_process/git 을 write 경로로 끌고 오지
// 않는다 — 은 그대로다. 정의는 저기 하나가 소유하고 여기서는 호출만 한다(UI2).
const { classifyRoundStructure } = require('./linkage-defs');

const VERDICT_UNKNOWN = 'unknown';

// ── stale `started-at` 상한 (local code-review H2) ────────────────────────────
//
// `wall_clock_ms`는 `now - started-at`이고 음수만 방어했다. 그 비대칭이 실제로 물었다:
// M4의 Task 8이 하루 뒤 **같은 REVIEW_DIR을 다시 읽어** 레코드를 재생성했고, `started-at`
// 은 어제 실행의 것이라 6분짜리 게이트가 971.9분으로 기록됐다(360957 → 58316230, 161배).
// 그 값은 git-tracked 코퍼스에 들어갔고 `leadtime.js`가 그것을 분포의 최댓값으로 보고했다
// — 그 도구는 "새 계측을 심지 않는다"고 선언하므로 걸러 낼 방법이 그쪽에는 없다.
//
// 상한은 임의의 knob이 아니라 이 저장소가 이미 가진 관측이다: `codex-policy.js`의
// `MAX_SEAL_AGE_MS`가 "게이트 1회 실행이 6시간을 넘지 않는다(codex 타임아웃 900s, 게이트
// deadline 1200~2400s)"는 같은 근거로 6시간을 쓴다. 그보다 오래된 `started-at`은 이 실행의
// 것이 아니라 **남겨진 아티팩트**로 본다.
//
// 값을 복제하는 이유는 이 파일의 dep-free 계약이다 — `codex-policy.js`는 `fs`를 끌어오고,
// 그것을 import하면 계측이 write 경로로 I/O를 끌고 들어온다(이 파일 헤더). 대신 두 상수가
// 조용히 갈라지지 않도록 `plan-review-record.test.js`가 동치를 단언한다(test는 dep 제약이
// 없다). export되는 이유도 같다 — 산문에만 있는 상한은 검증할 대상이 없다.
const MAX_PLAUSIBLE_SPAN_MS = 6 * 60 * 60 * 1000;

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
    } else if (wallClockMs > MAX_PLAUSIBLE_SPAN_MS) {
      // 음수 가드의 대우다. 아래가 열려 있고 위가 열려 있지 않으면, 남겨진 REVIEW_DIR을
      // 다시 읽는 재생성이 일어나지 않은 시간을 측정값으로 기록한다 — 그것이 실제로
      // 일어났고, `null`(관측하지 못했다)이 아니라 큰 수(관측했다)로 실려 소비처가
      // 걸러 낼 수 없었다. 값을 자르지 않고 버리는 이유는 이 모듈이 실제 경과 시간을
      // 모르기 때문이다: 상한으로 clamp하면 없는 사실을 새로 만든다.
      note('started-at is ' + wallClockMs + 'ms before now, past the ' +
        MAX_PLAUSIBLE_SPAN_MS + 'ms plausibility bound for one gate execution — the ' +
        'REVIEW_DIR artifacts are LEFT OVER from an earlier run (a regeneration reading a ' +
        'stale started-at is exactly how this happens), so wall_clock_ms is recorded as ' +
        'null: an unmeasured duration must not read as a very long one');
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

  // ── 라운드 수 (review-record-linkage M4, DD1/DD2/DD6) ─────────────────────
  //
  // 값의 원천은 `receipt/write.js` 가 `resolution.rounds` 를 파생하는 것과 **같은**
  // review-rounds 원장이다. 다른 원천을 쓰면 두 층이 다른 수를 말하고, 그때 어느
  // 쪽이 맞는지 말해 줄 것이 없다. 원장 I/O 는 여기가 아니라 `cli.js cmdRecord` 가
  // 하고(DD2 — 이 파일의 순수 계약), 그 판독 결과가 `opts.roundLedger` 로 주입된다.
  //
  // **부재는 0 이 아니라 null 이다.** 원장 파일이 없는 것(세어진 적 없음)과 원장이
  // 있는데 0회인 것(측정된 0)은 다른 사실이고, 그 둘을 접으면 DD5 의 자격 판정이
  // 구분 불가능한 0 위에 서게 된다. `backlog_appended` 가 같은 규율을 따른다.
  //
  // `rounds` 키는 **항상 존재한다** — 키 부재는 이 빌드에 축이 없다는 뜻이고(M4
  // 이전 코퍼스), null 은 관측하지 못했다는 뜻이다(`receipt_hash` 의 M3 약정과 동형).
  const roundLedger = isObj(o.roundLedger) ? o.roundLedger : null;
  let rounds = null;
  if (roundLedger !== null && roundLedger.available === true &&
      Number.isInteger(roundLedger.count) && roundLedger.count >= 0) {
    rounds = roundLedger.count;
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
    rounds: rounds,
  };

  // ── D1 자기 대조 (review-record-linkage M4, DD4의 1번) ────────────────────
  //
  // 지표 3의 "바꾸는 행동"은 "미달 형식은 기록 시점에 거부"다. 문자 그대로 하면
  // 이 함수가 throw 하거나 `cmdRecord` 가 비영점으로 끝나야 하는데, 그 계약은
  // 장식이 아니라 M1 의 생존편향 결함을 고친 처방 자체다(이 파일 헤더) — 계측이
  // 게이트를 죽일 수 있으면 그 계측은 첫 오발화 때 삭제되고, 막힌 실행일수록
  // 느리며 느린 실행일수록 표본으로 중요하다.
  //
  // 그래서 "거부"를 둘로 나눈다. 여기서는 레코드가 **자기 비적합을 선언**하고
  // (degradation + stderr), 진짜 강제는 게이트가 아닌 감사 도구가 한다
  // (`linkage-audit.js --check-round-structure`).
  //
  // `not_enrolled` 에는 degradation 을 적지 **않는다**. degradation 은 "덜
  // 기록됐다"는 뜻이므로 정상 상태를 거기 적으면 진짜 결손이 그 노이즈에 묻힌다.
  const roundClass = classifyRoundStructure(measurement);
  if (roundClass.verdict === 'absent') {
    note('D1 round structure ABSENT — ' + roundClass.reason + '. D1 requires ' +
      '`measurement.rounds` to be an integer >= 1; this record does not satisfy it, and it ' +
      'says so rather than being silently counted as a miss by the audit alone');
  }

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
  MAX_PLAUSIBLE_SPAN_MS: MAX_PLAUSIBLE_SPAN_MS,
};
