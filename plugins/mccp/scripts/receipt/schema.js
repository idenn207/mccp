'use strict';

const { validateReason } = require('./lib/force-override-reason');
// One definition, two enforcement points: the oracle decides the verdict, and
// the schema refuses to seal an entry whose label the oracle would not have
// produced. Importing rather than restating it is what keeps them from drifting.
const { isValidDisputeReason } = require('../lib/intent-context');

const SCHEMA_VERSION = 'v1';

const PHASES = ['plan', 'implement', 'pr', 'review'];

const GATE_IDS = [
  'plan-impeccable',
  'mccp-plan-codex',
  'implement-impeccable',
  'mccp-implement-codex',
  // workflow-orchestration M3 — aggregate adversarial-verify gate. produces-only,
  // written by the /mccp:work Step 3 controller AFTER mccp-implement-codex; carries
  // the merged-diff cross-model verdict. Non-invasive to command preflight (no
  // command lists it in requires_preceding) — its runtime enforcement is work.md's
  // verify-decide HALT, this receipt is the audit anchor (DD5 / Codex R1 F3).
  'mccp-implement-verify',
  'pr-impeccable',
  'mccp-pr-codex',
  'security-reviewer',
  'code-reviewer',
  // santa-loop-materialize M2 — santa-loop 봉인 게이트. produces-only이고
  // ALIAS_MATRIX에 등재하지 않는다: 어떤 command도 이것을 produces/
  // requires_preceding에 나열하지 않으므로 command preflight(validate-cmd),
  // cross-gate dedupe, PR chain-check 어디에도 개입하지 않는다. `mccp-implement-verify`
  // 와 같은 형태다. phase는 'review' — 'pr'로 두면 evidence-stage-guard가 이것을
  // ship receipt로 취급하는데, santa receipt는 감사 앵커일 뿐 ship 증거가 아니다 (DD1).
  'mccp-santa-review',
];

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

// v1.20.3 — cross-gate dedupe integrity. The real Codex adversarial-review
// verdict, distinct from resolution.converged (which means "writer finalized
// findings", not "Codex approved" — B#11 semantic split). Enum mirrors
// codex-bridge.parseVerdict outputs plus 'skipped' for disabled/skip paths.
// Present-only + fail-closed: absence reads as NOT converged in dedupe.
const CODEX_VERDICT_VALUES = ['converged', 'divergent', 'critical', 'unavailable', 'skipped'];

// diverse-agent-review M1 — the approval ISSUER, orthogonal to the verdict
// vocabulary above. review_verdict reuses CODEX_VERDICT_VALUES; review_source
// says who issued it. The structural proof oracle is imported rather than
// re-implemented so schema-side and read-side can never disagree about what a
// valid proof is (the double-definition drift this project keeps re-finding).
const {
  SOURCES: REVIEW_SOURCE_VALUES,
  isReviewProofStructurallyValid,
  isRepoRelativeEvidencePath,
} = require('../lib/review-verdict');

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA_RE = /^[0-9a-f]{7,40}$/;
const DECISION_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

// v1.2.0-m1 Task 6 — Controller-spawned worker receipt attribution axis.
// UUIDs identify the controller session + the worker's dispatch within it.
// Envelope path is repo-relative + pinned to the canonical dispatch location
// (.claude/state/dispatches/<uuid>.envelope.json) — Task 1 Action #3.
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENVELOPE_PATH_RE = /^\.claude\/state\/dispatches\/[0-9a-f-]{36}\.envelope\.json$/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validate(receipt) {
  const errors = [];

  function err(msg) { errors.push(msg); }
  function req(cond, msg) { if (!cond) err(msg); }

  req(isPlainObject(receipt), 'receipt must be an object');
  if (errors.length) return { ok: false, errors: errors };

  req(receipt.schema_version === SCHEMA_VERSION, 'schema_version must be "' + SCHEMA_VERSION + '"');

  req(GATE_IDS.indexOf(receipt.gate_id) !== -1,
    'gate_id must be one of: ' + GATE_IDS.join(', '));

  req(PHASES.indexOf(receipt.phase) !== -1,
    'phase must be one of: ' + PHASES.join(', '));

  req(typeof receipt.decision_id === 'string' && DECISION_ID_RE.test(receipt.decision_id),
    'decision_id must be kebab-case slug matching ' + DECISION_ID_RE);

  if (receipt.task_id !== null && receipt.task_id !== undefined) {
    req(typeof receipt.task_id === 'string' && receipt.task_id.length > 0,
      'task_id must be a non-empty string or null');
  }

  req(typeof receipt.plan_hash === 'string' && SHA256_RE.test(receipt.plan_hash),
    'plan_hash must match ' + SHA256_RE);

  req(Array.isArray(receipt.design_doc_hash),
    'design_doc_hash must be an array (possibly empty)');
  if (Array.isArray(receipt.design_doc_hash)) {
    receipt.design_doc_hash.forEach(function (entry, i) {
      req(isPlainObject(entry), 'design_doc_hash[' + i + '] must be an object');
      if (isPlainObject(entry)) {
        req(typeof entry.path === 'string' && entry.path.length > 0,
          'design_doc_hash[' + i + '].path must be a non-empty string');
        req(typeof entry.sha256 === 'string' && SHA256_RE.test(entry.sha256),
          'design_doc_hash[' + i + '].sha256 must match ' + SHA256_RE);
      }
    });
  }

  req(typeof receipt.base_sha === 'string' && GIT_SHA_RE.test(receipt.base_sha),
    'base_sha must be a git SHA (7-40 hex chars)');
  req(typeof receipt.head_sha === 'string' && GIT_SHA_RE.test(receipt.head_sha),
    'head_sha must be a git SHA (7-40 hex chars)');

  req(Number.isInteger(receipt.round) && receipt.round >= 1 && receipt.round <= 10,
    'round must be an integer in [1, 10]');

  req(Array.isArray(receipt.findings),
    'findings must be an array (possibly empty)');
  if (Array.isArray(receipt.findings)) {
    receipt.findings.forEach(function (f, i) {
      req(isPlainObject(f), 'findings[' + i + '] must be an object');
      if (isPlainObject(f)) {
        req(SEVERITIES.indexOf(f.severity) !== -1,
          'findings[' + i + '].severity must be one of: ' + SEVERITIES.join(', '));
        req(typeof f.area === 'string' && f.area.length > 0,
          'findings[' + i + '].area must be a non-empty string');
        req(typeof f.description === 'string' && f.description.length > 0,
          'findings[' + i + '].description must be a non-empty string');
      }
    });
  }

  req(isPlainObject(receipt.resolution), 'resolution must be an object');
  if (isPlainObject(receipt.resolution)) {
    const r = receipt.resolution;
    req(typeof r.converged === 'boolean', 'resolution.converged must be a boolean');
    req(Number.isInteger(r.rounds) && r.rounds >= 1, 'resolution.rounds must be a positive integer');
    req(Array.isArray(r.accepted), 'resolution.accepted must be an array');
    req(Array.isArray(r.rejected), 'resolution.rejected must be an array');
    req(Array.isArray(r.open_questions), 'resolution.open_questions must be an array');
    if (Array.isArray(r.open_questions)) {
      r.open_questions.forEach(function (q, i) {
        req(isPlainObject(q), 'resolution.open_questions[' + i + '] must be an object');
        if (isPlainObject(q)) {
          req(SEVERITIES.indexOf(q.severity) !== -1,
            'resolution.open_questions[' + i + '].severity must be one of: ' + SEVERITIES.join(', '));
        }
      });
    }
    // v1.20.3 — codex_verdict (Option B). Present-only optional enum; legacy
    // receipts without it validate unchanged. Mirrors design_critique_verdict's
    // shape. Cross-gate dedupe (dedupe.js#evaluateForDedupe) treats absence as
    // fail-closed (cannot skip PR-Codex).
    if (r.codex_verdict !== null && r.codex_verdict !== undefined) {
      req(typeof r.codex_verdict === 'string' &&
        CODEX_VERDICT_VALUES.indexOf(r.codex_verdict) !== -1,
        'resolution.codex_verdict must be one of: ' +
        CODEX_VERDICT_VALUES.join(', ') + ' (or absent)');
    }

    // diverse-agent-review M1 — review_* triple. Present-only: legacy receipts
    // (and every git-tracked ship receipt written before M1) omit all three and
    // validate byte-unchanged. makeSkeleton deliberately does NOT materialize
    // them (DD6), so absence is the default state, not a migration debt.
    //
    // DD11 all-or-nothing — schema is the LAST write-side wall. A partial triple
    // must never reach disk: resolveEffectiveVerdict would report `unavailable`
    // for it, but a receipt that is unreadable-by-construction is a defect we
    // should refuse to persist rather than something to interpret later.
    const reviewPresent = [];
    const reviewAbsent = [];
    [['review_verdict', r.review_verdict],
     ['review_source', r.review_source],
     ['review_proof', r.review_proof]].forEach(function (pair) {
      if (pair[1] !== null && pair[1] !== undefined) reviewPresent.push(pair[0]);
      else reviewAbsent.push(pair[0]);
    });

    if (reviewPresent.length > 0) {
      req(reviewAbsent.length === 0,
        'resolution.review_* is all-or-nothing (DD11): present [' +
        reviewPresent.join(', ') + '] but missing [' + reviewAbsent.join(', ') +
        ']. A partial stamp must not be persisted.');

      if (r.review_verdict !== null && r.review_verdict !== undefined) {
        req(typeof r.review_verdict === 'string' &&
          CODEX_VERDICT_VALUES.indexOf(r.review_verdict) !== -1,
          'resolution.review_verdict must be one of: ' +
          CODEX_VERDICT_VALUES.join(', ') + ' (or absent)');
      }
      if (r.review_source !== null && r.review_source !== undefined) {
        req(typeof r.review_source === 'string' &&
          REVIEW_SOURCE_VALUES.indexOf(r.review_source) !== -1,
          'resolution.review_source must be one of: ' +
          REVIEW_SOURCE_VALUES.join(', ') + ' (or absent)');
      }
      // The proof only has to hold up STRUCTURALLY when it is being used to
      // justify an approval. A divergent/unavailable verdict carries its proof
      // for audit, and demanding a satisfied quorum there would block honest
      // records of a review that did not converge.
      //
      // Path shape is NOT part of that relaxation. The two invariants answer
      // different questions: "is this proof good enough to approve?" (verdict-
      // dependent) versus "may this string be sealed into the receipt?" (never).
      // dispatch_evidence is operator-supplied text that gets hashed into the
      // receipt and, for ship receipts, committed — an absolute or host-specific
      // path leaks the developer's filesystem into the durable corpus, which
      // §3.12 already had to unwind once with a sanctioned rebind tool
      // (v1.22.4-cwd-rebind) because a sealed receipt cannot simply be rewritten.
      // The read-side oracle downgrades a leaking proof to `unavailable`, so the
      // APPROVAL axis was already safe; this closes the LEAK axis, where a
      // non-converged verdict was the unguarded door.
      if (r.review_verdict === 'converged') {
        req(isReviewProofStructurallyValid(r.review_proof),
          'resolution.review_proof fails the structural invariant required for a ' +
          'converged review_verdict (layers/verification_verdict/quorum/perspectives/' +
          'dispatch_evidence repo-relative paths/reviewed_plan_hash)');
      } else if (r.review_proof !== null && r.review_proof !== undefined) {
        req(isPlainObject(r.review_proof), 'resolution.review_proof must be an object');
        const ev = r.review_proof.dispatch_evidence;
        if (ev !== null && ev !== undefined) {
          req(Array.isArray(ev),
            'resolution.review_proof.dispatch_evidence must be an array');
          for (let i = 0; i < ev.length; i++) {
            req(isRepoRelativeEvidencePath(ev[i]),
              'resolution.review_proof.dispatch_evidence[' + i + '] must be a ' +
              'repo-relative path (no absolute/drive/UNC/backslash/".." segments) ' +
              'even when review_verdict is not "converged" — it is sealed into ' +
              'receipt_hash either way');
          }
        }
      }

      // santa-loop R5 — 'hybrid' must SHOW its L3 layer. `hybrid` is a
      // CROSS_MODEL_SOURCES member, so cross-gate dedupe counts a converged
      // hybrid receipt as cross-model corroboration and skips terminal PR-Codex.
      // A receipt that claims the L3 layer without carrying its verdict would
      // buy that skip with evidence it never had — the read-side predicate
      // rejects it, and this stops it reaching disk in the first place.
      if (r.review_source === 'hybrid' && r.review_verdict === 'converged') {
        const layers = isPlainObject(r.review_proof) ? r.review_proof.layers : null;
        const l3 = isPlainObject(layers) ? layers.l3 : null;
        req(l3 === 'converged',
          'a converged review_source="hybrid" receipt must carry ' +
          'review_proof.layers.l3 === "converged" — hybrid claims cross-model ' +
          'corroboration, and cross-gate dedupe skips PR-Codex on that claim, so ' +
          'the L3 verdict it rests on must be present (got ' + JSON.stringify(l3) + ')');
      }

      // DD11 contradiction guard — 'multi-agent' asserts Codex never spoke, so a
      // codex_verdict sitting beside it makes the receipt claim both at once.
      // Cross-gate dedupe reads source to decide whether cross-model corroboration
      // exists; an ambiguous receipt is exactly what must not be interpretable.
      // 'hybrid' legitimately carries both (L3 IS Codex); 'codex' likewise.
      if (r.review_source === 'multi-agent') {
        req(r.codex_verdict === null || r.codex_verdict === undefined,
          'resolution.codex_verdict must be absent when review_source is ' +
          '"multi-agent" (contradictory receipt: multi-agent asserts Codex did ' +
          'not issue this approval)');
      }
    }

    // santa-loop-materialize M2 (DD3) — gate별 review_source 고정 불변식.
    //
    // 위치가 계약이다: 이 검사는 위 `if (reviewPresent.length > 0)` 블록의
    // **형제**이지 자식이 아니다. 가드 안에 넣으면 review triple이 통째로 없는
    // santa receipt가 검사를 그냥 지나가고, write.js의 `resolution.converged`
    // 기본값 true를 달고 승인처럼 읽힌다 — 즉 "부재도 REJECT"가 정확히 반대로
    // 동작한다. 이 파일의 기존 review 검사 5개가 전부 가드 안에 있어 같은 깊이로
    // 따라 쓰기 쉬운 자리라, 이 주석이 그 실수를 막는 장치다.
    //
    // gate_id 기준 resolution 제약은 이 repo에 처음 생기는 형태다 — 기존
    // `:236-259`는 review_source **값** 기준 분기이지 gate_id 기준이 아니다.
    if (receipt.gate_id === 'mccp-santa-review') {
      req(r.review_source === 'multi-agent',
        'a mccp-santa-review receipt must carry resolution.review_source === "multi-agent" ' +
        '(I4): santa never invokes a cross-model reviewer, so "codex"/"hybrid" would be a ' +
        'false claim of cross-model corroboration, and absence would leave the receipt with ' +
        'no approval record at all (got ' + JSON.stringify(r.review_source) + ')');
    }
  }

  req(typeof receipt.subject_hash === 'string' && SHA256_RE.test(receipt.subject_hash),
    'subject_hash must match ' + SHA256_RE);
  req(typeof receipt.receipt_hash === 'string' && SHA256_RE.test(receipt.receipt_hash),
    'receipt_hash must match ' + SHA256_RE);

  req(isPlainObject(receipt.meta), 'meta must be an object');
  if (isPlainObject(receipt.meta)) {
    const m = receipt.meta;
    req(typeof m.created_at === 'string' && ISO8601_RE.test(m.created_at),
      'meta.created_at must be ISO 8601 timestamp');
    req(typeof m.command === 'string' && m.command.length > 0,
      'meta.command must be a non-empty string');
    req(typeof m.cwd === 'string' && m.cwd.length > 0,
      'meta.cwd must be a non-empty string');
    if (m.git_branch !== null && m.git_branch !== undefined) {
      req(typeof m.git_branch === 'string', 'meta.git_branch must be a string or null');
    }
    req(typeof m.skipped === 'boolean', 'meta.skipped must be a boolean');
    if (m.skip_reason !== null && m.skip_reason !== undefined) {
      req(typeof m.skip_reason === 'string', 'meta.skip_reason must be a string or null');
    }
    req(typeof m.codex_skipped === 'boolean', 'meta.codex_skipped must be a boolean');

    // v0.2.4 Codex Round 1 F1 — advisory axis is now writeable.
    // Previously validate-cmd treated meta.advisory=true as non-approving but
    // write.js had no way to set it. That left an MCCP_ALLOW_CODEX_UNAVAILABLE
    // advisory path silently producing approving receipts unless the command
    // also passed --codex-skipped. The axis is now first-class.
    req(typeof m.advisory === 'boolean', 'meta.advisory must be a boolean');

    // v0.2.4 Task 8 — security_skipped tracks security-reviewer auto-fallback.
    req(typeof m.security_skipped === 'boolean', 'meta.security_skipped must be a boolean');
    if (m.security_skip_reason !== null && m.security_skip_reason !== undefined) {
      req(typeof m.security_skip_reason === 'string',
        'meta.security_skip_reason must be a string or null');
    }

    // v0.2.4 Task 10 — security_force_override tracks audited escape hatch
    // (terminal /mccp:pr with MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER set).
    req(typeof m.security_force_override === 'boolean',
      'meta.security_force_override must be a boolean');
    if (m.security_force_override_reason !== null && m.security_force_override_reason !== undefined) {
      req(typeof m.security_force_override_reason === 'string',
        'meta.security_force_override_reason must be a string or null');
    }

    // v0.2.4 Task 11 — 4-axis state matrix invariant.
    // security_skipped=true AND security_force_override=true is a contradiction
    // (the override was supposed to be a deliberate audited bypass; skipped
    // means the gate silently fell through). Allowing both would fail-open
    // by writing a receipt the validator could not classify.
    if (m.security_skipped === true && m.security_force_override === true) {
      err('meta.security_skipped + meta.security_force_override cannot both be true ' +
        '(4-axis state matrix invariant: pick one — skipped = fall-through, ' +
        'force_override = deliberate audited bypass)');
    }

    // v0.2.6 Milestone 1 Task 1.2 — impeccable_* axis (Codex R1 F1 absorption:
    // primary codex receipt meta, no separate design_* namespace). Mirrors
    // security_* shape; cross-namespace combos are allowed (security_skipped +
    // impeccable_force_override is a legal state), only same-namespace combos
    // are contradictions.
    req(typeof m.impeccable_skipped === 'boolean',
      'meta.impeccable_skipped must be a boolean');
    if (m.impeccable_skip_reason !== null && m.impeccable_skip_reason !== undefined) {
      req(typeof m.impeccable_skip_reason === 'string',
        'meta.impeccable_skip_reason must be a string or null');
    }
    req(typeof m.impeccable_force_override === 'boolean',
      'meta.impeccable_force_override must be a boolean');
    if (m.impeccable_force_override_reason !== null && m.impeccable_force_override_reason !== undefined) {
      req(typeof m.impeccable_force_override_reason === 'string',
        'meta.impeccable_force_override_reason must be a string or null');
    }

    if (m.impeccable_skipped === true && m.impeccable_force_override === true) {
      err('meta.impeccable_skipped + meta.impeccable_force_override cannot both be true ' +
        '(state matrix invariant: pick one — skipped = fall-through, ' +
        'force_override = deliberate audited bypass)');
    }

    // integrity-unification M3 — PR-Codex ship-gate audited override.
    //
    // pr_codex_force_override: audited escape for the terminal /mccp:pr ship gate
    //   (MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE). When true the mechanical HALT on
    //   a non-approving PR-Codex verdict is bypassed for this one ship, but the real
    //   resolution.codex_verdict is left SEALED (divergent stays divergent) — the
    //   override never launders the verdict into converged, so cross-gate dedupe
    //   stays fail-closed (DD3). Reason validator is strict (mirror of
    //   impeccable_force_override) so the bypass carries deliberate authored context.
    //   Present-only: pre-M3 receipts (and the git-tracked ship corpus) validate
    //   unchanged. NOT carved out of receipt_hash — the override decision is
    //   tamper-protected like the verdict it accompanies.
    if (m.pr_codex_force_override !== undefined) {
      req(typeof m.pr_codex_force_override === 'boolean',
        'meta.pr_codex_force_override must be a boolean if present');
    }
    if (m.pr_codex_force_override_reason !== null
        && m.pr_codex_force_override_reason !== undefined) {
      req(typeof m.pr_codex_force_override_reason === 'string',
        'meta.pr_codex_force_override_reason must be a string or null');
    }
    if (m.pr_codex_force_override === true) {
      const v = validateReason(m.pr_codex_force_override_reason, { strict: true });
      if (!v.ok) {
        err('meta.pr_codex_force_override_reason rejected (' + v.reason + '): ' +
          'MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE requires substantive reason ' +
          '≥30 chars + ≥3 words, no placeholder/URL-only/banlist token');
      }
    }

    // v1.3.0 design-gate enforcement M1 Task 1 — silent-skip surface.
    //
    // impeccable_silent_skip:        Detector returned SKILL_AVAIL=1 + SIGNAL=0
    //   (Skill available, but no design surface in this change). Previously the
    //   silent-skip path produced no receipt trace, making the failure
    //   unobservable. Receipt now records the fact + reason so M2 has an audit
    //   artifact to act on. M1 validator treats silent_skip as informational
    //   warning at every gate (strict + lenient) — blocking is deferred to M2
    //   once the detector gains a design-suspect discriminator or SKILL
    //   first-step eliminates the false-negative window.
    // impeccable_silent_skip_reason: Reason enum from impeccable-detect.js
    //   (typically 'no-signal'; null when not stamped).
    //
    // Mutex invariant (impeccable_silent_skip + impeccable_force_override
    // cannot coexist) is enforced below. Command bodies suppress silent_skip
    // forward when IMPECCABLE_FORCE_OVERRIDE_REASON is set, so the audited
    // escape path produces a force_override-only receipt (which the validator
    // surfaces as warning via the impeccable_force_override path).
    //
    // Present-only: legacy v1.2.x receipts pass validation unchanged.
    if (m.impeccable_silent_skip !== undefined) {
      req(typeof m.impeccable_silent_skip === 'boolean',
        'meta.impeccable_silent_skip must be a boolean if present');
    }
    if (m.impeccable_silent_skip_reason !== null
        && m.impeccable_silent_skip_reason !== undefined) {
      req(typeof m.impeccable_silent_skip_reason === 'string',
        'meta.impeccable_silent_skip_reason must be a string or null');
    }

    if (m.impeccable_silent_skip === true && m.impeccable_force_override === true) {
      err('meta.impeccable_silent_skip + meta.impeccable_force_override cannot both be true ' +
        '(state matrix invariant: pick one — silent_skip = detector signal absent, ' +
        'force_override = deliberate audited bypass)');
    }

    // F4 hardening + F-Sec-1 absorption: strict namespace reason validator.
    // When impeccable_force_override=true, reason must be substantive
    // (≥30 chars, ≥3 words, no placeholder/URL-only/1-token). Helper holds
    // the rules so v0.2.7 housekeeping can flip security namespace to strict
    // without touching schema.js.
    if (m.impeccable_force_override === true) {
      const v = validateReason(m.impeccable_force_override_reason, { namespace: 'impeccable' });
      if (!v.ok) {
        err('meta.impeccable_force_override_reason rejected (' + v.reason + '): ' +
          'force_override requires substantive reason ≥30 chars + ≥3 words, ' +
          'no placeholder/URL-only/banlist token');
      }
    }

    // v0.2.8 Task 2.6.1 — PR-Codex review-only audit axis (4 fields).
    //
    // Backwards-compatible: receipts written by v0.2.7 and earlier did not
    // carry these fields. Treat absent (undefined) as the default false
    // for boolean fields and null for the reason string. New write paths
    // (write.js + makeSkeleton) always populate them, so the strict invariants
    // below only fire when at least one field is explicitly present.
    //
    // Matrix invariant: codex_dedupe_at_pr + codex_skipped_at_pr cannot both
    // be true — mutually exclusive skip paths. Reason validator (strict)
    // applies only when codex_skipped_at_pr=true.
    if (m.codex_dedupe_at_pr !== undefined) {
      req(typeof m.codex_dedupe_at_pr === 'boolean',
        'meta.codex_dedupe_at_pr must be a boolean if present');
    }
    if (m.codex_skipped_at_pr !== undefined) {
      req(typeof m.codex_skipped_at_pr === 'boolean',
        'meta.codex_skipped_at_pr must be a boolean if present');
    }
    if (m.codex_skip_reason !== null && m.codex_skip_reason !== undefined) {
      req(typeof m.codex_skip_reason === 'string',
        'meta.codex_skip_reason must be a string or null');
    }
    if (m.codex_review_actionable_findings !== undefined) {
      req(typeof m.codex_review_actionable_findings === 'boolean',
        'meta.codex_review_actionable_findings must be a boolean if present');
    }

    // v1.22.3 M3 follow-up (PR-Codex R1 F1 + F4) — the scope-excluded pair.
    //
    // codex_scope_excluded_verdict: the gate passed despite a RAW non-approving
    // verdict because every itemized finding was design/a11y-scoped and dropped
    // by the design-scope filter (deriveEffectiveReview row 5).
    //
    // codex_raw_verdict: what the model literally said. resolution.codex_verdict
    // is contracted as "the real Codex verdict" and drives cross-gate dedupe, so
    // when row 5 maps a raw `needs-attention` to an effective `converged`, the raw
    // value would otherwise be machine-unreadable in the SEALED receipt and
    // survive only out-of-band (PR body / tmp). Persisting it here keeps effective
    // verdict AND provenance both readable from one receipt. Deliberately a free
    // string, not CODEX_VERDICT_VALUES: this is the companion's raw vocabulary
    // (`approve` | `needs-attention`), not the gate's, and reusing the enum would
    // drag meta.merged_verify_verdict along for the ride.
    //
    // Both present-only — absent on legacy receipts, no migration.
    if (m.codex_scope_excluded_verdict !== undefined) {
      req(typeof m.codex_scope_excluded_verdict === 'boolean',
        'meta.codex_scope_excluded_verdict must be a boolean if present');
    }
    if (m.codex_raw_verdict !== undefined && m.codex_raw_verdict !== null) {
      req(typeof m.codex_raw_verdict === 'string' && m.codex_raw_verdict.length > 0,
        'meta.codex_raw_verdict must be a non-empty string or null if present');
    }

    // v0.3.5 — env-level disabled honor (codex_disabled / codex_disabled_at_pr).
    // Mirrors codex_skipped_at_pr but represents env policy (MCCP_CODEX_DISABLED=1),
    // not user-issued audited escape. Reason validator is bypassed when
    // codex_disabled_at_pr=true — canonical reason is the literal 'codex_disabled'.
    if (m.codex_disabled !== undefined) {
      req(typeof m.codex_disabled === 'boolean',
        'meta.codex_disabled must be a boolean if present');
    }
    if (m.codex_disabled_at_pr !== undefined) {
      req(typeof m.codex_disabled_at_pr === 'boolean',
        'meta.codex_disabled_at_pr must be a boolean if present');
    }

    // 3-way mutex (v0.3.5): dedupe ∩ skipped ∩ disabled = ∅. Exactly one PR-step
    // codex-skip path may be active per receipt.
    const skipFlags = [m.codex_dedupe_at_pr, m.codex_skipped_at_pr, m.codex_disabled_at_pr]
      .filter(v => v === true);
    if (skipFlags.length > 1) {
      err('meta.codex_dedupe_at_pr + codex_skipped_at_pr + codex_disabled_at_pr ' +
        'are mutually exclusive (v0.3.5 3-way invariant: pick one — ' +
        'dedupe = cross-gate convergence, skipped = MCCP_PR_SKIP_CODEX_REVIEW ' +
        'audited escape, disabled = MCCP_CODEX_DISABLED env policy)');
    }

    if (m.codex_skipped_at_pr === true) {
      const v = validateReason(m.codex_skip_reason, { strict: true });
      if (!v.ok) {
        err('meta.codex_skip_reason rejected (' + v.reason + '): ' +
          'MCCP_PR_SKIP_CODEX_REVIEW requires substantive reason ≥30 chars + ' +
          '≥3 words, no placeholder/URL-only/banlist token');
      }
    }

    // v0.3.5 — when codex_disabled_at_pr is set, the reason MUST be the canonical
    // 'codex_disabled' literal. Substantive-reason validator bypass is allowed
    // ONLY for this exact value — any other string indicates a mis-stamp.
    if (m.codex_disabled_at_pr === true) {
      if (m.codex_skip_reason !== 'codex_disabled') {
        err('meta.codex_disabled_at_pr=true requires meta.codex_skip_reason="codex_disabled" ' +
          '(env policy uses canonical reason; substantive-reason validator bypass ' +
          'only applies to this exact literal — got ' +
          JSON.stringify(m.codex_skip_reason) + ')');
      }
    }

    if (m.deferred_findings_count !== undefined && m.deferred_findings_count !== null) {
      req(Number.isInteger(m.deferred_findings_count) && m.deferred_findings_count >= 0,
        'meta.deferred_findings_count must be a non-negative integer if present');
    }

    // v0.3.6 Task 3 — Codex/impeccable scope audit axis (4 fields, all optional).
    //
    // codex_design_scope_excluded:  was the design-scope exclusion preamble
    //   prepended to the Codex focus? (mirrors invokeAdversarialReview's
    //   opts.impeccableAvailable === true branch).
    // design_findings_dropped:      count of findings dropped by output filter
    //   matching DESIGN_KEYWORDS (visual/color/typography/etc).
    // a11y_routed_to_impeccable:    was at least one a11y finding stashed for
    //   impeccable a11y-architect routing? (caller stamps when > 0).
    // dropped_findings_digest:      sha256 of joined dropped finding texts —
    //   reproducible audit trail. Null when nothing dropped.
    //
    // No design×a11y mutex needed: a single receipt can carry both kinds of
    // dropped findings (mixed-domain Codex review is common).
    if (m.codex_design_scope_excluded !== undefined) {
      req(typeof m.codex_design_scope_excluded === 'boolean',
        'meta.codex_design_scope_excluded must be a boolean if present');
    }
    if (m.design_findings_dropped !== undefined && m.design_findings_dropped !== null) {
      req(Number.isInteger(m.design_findings_dropped) && m.design_findings_dropped >= 0,
        'meta.design_findings_dropped must be a non-negative integer if present');
    }
    if (m.a11y_routed_to_impeccable !== undefined) {
      req(typeof m.a11y_routed_to_impeccable === 'boolean',
        'meta.a11y_routed_to_impeccable must be a boolean if present');
    }
    // v1.13.0 M3 — was mccp:a11y-architect actually auto-invoked at the PR gate
    // (vs the routing-only count). Present-only: legacy receipts validate
    // unchanged.
    if (m.a11y_auto_invoked !== undefined) {
      req(typeof m.a11y_auto_invoked === 'boolean',
        'meta.a11y_auto_invoked must be a boolean if present');
    }
    if (m.dropped_findings_digest !== null && m.dropped_findings_digest !== undefined) {
      req(typeof m.dropped_findings_digest === 'string' &&
        SHA256_RE.test(m.dropped_findings_digest),
        'meta.dropped_findings_digest must match ' + SHA256_RE + ' or be null');
    }

    // v0.4.0 axis H — plan_conflict_escalated.
    //
    // Stamped on implement (or pr) receipts when /mccp:prp-implement Phase 3
    // detected a plan ↔ implementation gap via plan-conflict-detector and
    // wrote fix-task.md + STATE.md.chain_aborted=true. Advisory-only — does
    // NOT block downstream validators (parallel to deferred_findings_count).
    // The blocking surface is STATE.md.chain_aborted, which auto-chain.js
    // already honors via shouldAbort().
    if (m.plan_conflict_escalated !== undefined) {
      req(typeof m.plan_conflict_escalated === 'boolean',
        'meta.plan_conflict_escalated must be a boolean if present');
    }

    // v1.0.1 axis K — pr_phase_lock_stale_reclaimed_at_hook.
    //
    // Stamped on a PR receipt when the pr-phase-guard hook reclaimed an
    // orphan pr-phase.lock (same-host + dead PID) on a prior invocation,
    // converting silent recovery into an audit trail. Additive, optional —
    // existing receipts without this field pass schema validation unchanged.
    if (m.pr_phase_lock_stale_reclaimed_at_hook !== undefined) {
      req(typeof m.pr_phase_lock_stale_reclaimed_at_hook === 'boolean',
        'meta.pr_phase_lock_stale_reclaimed_at_hook must be a boolean if present');
    }

    // v1.2.0-m1 Task 6 (Codex F2 absorption) — controller-worker attribution
    // axis. 4 fields, marker-gated all-or-nothing invariant:
    //   controller_context_marker_present=true  → all 3 attribution fields require
    //   controller_context_marker_present=false → all 3 must be absent/null
    // Partial state (some fields set, others missing) → reject regardless of marker.
    //
    // Existing v0.2.x receipts have marker=undefined + 3 fields=undefined,
    // which counts as "marker false + 0 fields = OK" (backward compat).
    if (m.controller_context_marker_present !== undefined
        && m.controller_context_marker_present !== null) {
      req(typeof m.controller_context_marker_present === 'boolean',
        'meta.controller_context_marker_present must be a boolean if present');
    }

    function attrPresent(v) {
      return v !== undefined && v !== null && v !== '';
    }
    const attrFlags = [
      m.dispatched_by_controller_session_id,
      m.worker_dispatch_id,
      m.ipc_envelope_path,
    ];
    const attrPresentCount = attrFlags.filter(attrPresent).length;
    const markerTrue = m.controller_context_marker_present === true;

    // Per-field format validation only fires when the field is present at all.
    if (attrPresent(m.dispatched_by_controller_session_id)) {
      req(typeof m.dispatched_by_controller_session_id === 'string'
          && UUID_V4_RE.test(m.dispatched_by_controller_session_id),
        'meta.dispatched_by_controller_session_id must be UUID matching ' + UUID_V4_RE);
    }
    if (attrPresent(m.worker_dispatch_id)) {
      req(typeof m.worker_dispatch_id === 'string'
          && UUID_V4_RE.test(m.worker_dispatch_id),
        'meta.worker_dispatch_id must be UUID matching ' + UUID_V4_RE);
    }
    if (attrPresent(m.ipc_envelope_path)) {
      req(typeof m.ipc_envelope_path === 'string'
          && ENVELOPE_PATH_RE.test(m.ipc_envelope_path),
        'meta.ipc_envelope_path must match ' + ENVELOPE_PATH_RE +
        ' (canonical dispatch location)');
    }

    // All-or-nothing invariant: 3 fields move together, gated by marker.
    if (markerTrue && attrPresentCount !== 3) {
      err('meta.controller_context_marker_present=true requires all 3 attribution ' +
        'fields (dispatched_by_controller_session_id + worker_dispatch_id + ' +
        'ipc_envelope_path) — got ' + attrPresentCount + ' of 3 ' +
        '(F2 absorption: marker without attribution = silent total loss)');
    }
    if (!markerTrue && attrPresentCount > 0) {
      err('meta.controller_context_marker_present=' +
        JSON.stringify(m.controller_context_marker_present) +
        ' but ' + attrPresentCount + ' of 3 attribution fields are set — ' +
        'all-or-nothing invariant: set marker=true together with all 3, ' +
        'or leave all 4 unset');
    }

    // v1.3.0-m2 — LLM briefing stamp + token telemetry. Present-only.
    //
    // briefing_summary:           1-line PM-readable verdict ≤1024 chars (caps
    //                             ~256 tokens at 4 chars/token), or null when
    //                             cost-guard skipped or LLM classification != 'ok'.
    //                             Empty string is rejected — null is the canonical
    //                             "no briefing" state.
    // briefing_token_count:       Non-negative integer count of input+output
    //                             tokens consumed by the briefing call, or null
    //                             when no call happened.
    // briefing_token_estimated:   When true, briefing_token_count was derived
    //                             from (focus.length + stdout.length)/4 because
    //                             codex-companion did not emit real tokenUsage.
    //                             When false (default), the count is real usage.
    //                             Codex R1 F2 absorption.
    // briefing_invocation_count:  Count of LLM call attempts per receipt. 0 when
    //                             cost-guard skipped, 1 when invoked (with or
    //                             without success). v1.3 has no retry — value is
    //                             always 0 or 1.
    if (m.briefing_summary !== null && m.briefing_summary !== undefined) {
      req(typeof m.briefing_summary === 'string' && m.briefing_summary.length > 0
          && m.briefing_summary.length <= 1024,
        'meta.briefing_summary must be a non-empty string ≤1024 chars or null');
    }
    if (m.briefing_token_count !== null && m.briefing_token_count !== undefined) {
      req(Number.isInteger(m.briefing_token_count) && m.briefing_token_count >= 0,
        'meta.briefing_token_count must be a non-negative integer or null');
    }
    if (m.briefing_token_estimated !== undefined) {
      req(typeof m.briefing_token_estimated === 'boolean',
        'meta.briefing_token_estimated must be a boolean if present');
    }
    if (m.briefing_invocation_count !== null && m.briefing_invocation_count !== undefined) {
      req(Number.isInteger(m.briefing_invocation_count) && m.briefing_invocation_count >= 0,
        'meta.briefing_invocation_count must be a non-negative integer or null');
    }

    // v1.3.0-m2 — design-critique retry-loop audit axis. 4 fields, all optional
    // (present-only — v1.3.0-m1 receipts pass unchanged).
    //
    // design_critique_rounds:      count of critique invocations performed within
    //                              the loop (1..cap+1). null when sub-step skipped
    //                              (detector returned no-signal AND no override).
    // design_critique_verdict:     'converged' | 'divergent' | 'skipped' | null.
    //                              'converged' = decideCritique returned CONVERGED.
    //                              'divergent' = DIVERGENT_UNRESOLVED at cap.
    //                              'skipped' = sub-step skip silently (no SIGNAL).
    // design_intent_reason:        when MCCP_DESIGN_INTENT_REASON audited override
    //                              forced the SKILL first-step trigger (axis c in
    //                              the 3-axis trigger), the reason is stamped here.
    //                              Reason validator is strict (mirror of impeccable
    //                              force_override rules).
    // pr_design_chain_skip_reason: when MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN audited
    //                              escape opt'd a pr-codex receipt out of the
    //                              chain-check enforcement, the reason is stamped
    //                              here. Strict reason validator.
    const VERDICT_VALUES = ['converged', 'divergent', 'skipped'];
    if (m.design_critique_rounds !== null && m.design_critique_rounds !== undefined) {
      req(Number.isInteger(m.design_critique_rounds) && m.design_critique_rounds >= 0,
        'meta.design_critique_rounds must be a non-negative integer or null');
    }
    if (m.design_critique_verdict !== null && m.design_critique_verdict !== undefined) {
      req(typeof m.design_critique_verdict === 'string' &&
        VERDICT_VALUES.indexOf(m.design_critique_verdict) !== -1,
        'meta.design_critique_verdict must be one of: ' +
        VERDICT_VALUES.join(', ') + ' (or null)');
    }
    if (m.design_intent_reason !== null && m.design_intent_reason !== undefined) {
      req(typeof m.design_intent_reason === 'string',
        'meta.design_intent_reason must be a string or null');
      if (typeof m.design_intent_reason === 'string') {
        const v = validateReason(m.design_intent_reason, { strict: true });
        if (!v.ok) {
          err('meta.design_intent_reason rejected (' + v.reason + '): ' +
            'MCCP_DESIGN_INTENT_REASON requires substantive reason ≥30 chars + ' +
            '≥3 words, no placeholder/URL-only/banlist token');
        }
      }
    }
    if (m.pr_design_chain_skip_reason !== null && m.pr_design_chain_skip_reason !== undefined) {
      req(typeof m.pr_design_chain_skip_reason === 'string',
        'meta.pr_design_chain_skip_reason must be a string or null');
      if (typeof m.pr_design_chain_skip_reason === 'string') {
        const v = validateReason(m.pr_design_chain_skip_reason, { strict: true });
        if (!v.ok) {
          err('meta.pr_design_chain_skip_reason rejected (' + v.reason + '): ' +
            'MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN requires substantive reason ' +
            '≥30 chars + ≥3 words, no placeholder/URL-only/banlist token');
        }
      }
    }

    // v1.13.0 — stage-aware impeccable command routing audit axis (present-only).
    //
    // impeccable_routing_mode:    'auto' | 'hybrid' | 'recommend' | null —
    //   effective routing mode resolved by impeccable-routing.parseRoutingMode.
    // impeccable_commands_routed: array of per-command OUTCOME objects (Codex
    //   Plan-Codex R1 F3 — outcome, not intent) or null. Each entry:
    //     { command, call_form: invoke|background|foreground-fallback|recommend,
    //       status: invoked|recommended|failed|unknown-skill|skipped }
    //   Failed/unknown-skill outcomes are recorded honestly (loud fail-open); M1
    //   does not promote them to blocking — that waits for M2 outcome data.
    //   Present-only: legacy receipts without these fields validate unchanged.
    const ROUTING_MODE_VALUES = ['auto', 'hybrid', 'recommend'];
    const ROUTING_CALL_FORM_VALUES = ['invoke', 'background', 'foreground-fallback', 'recommend'];
    const ROUTING_STATUS_VALUES = ['invoked', 'recommended', 'failed', 'unknown-skill', 'skipped'];
    if (m.impeccable_routing_mode !== null && m.impeccable_routing_mode !== undefined) {
      req(typeof m.impeccable_routing_mode === 'string' &&
        ROUTING_MODE_VALUES.indexOf(m.impeccable_routing_mode) !== -1,
        'meta.impeccable_routing_mode must be one of: ' +
        ROUTING_MODE_VALUES.join(', ') + ' (or null)');
    }
    if (m.impeccable_commands_routed !== null && m.impeccable_commands_routed !== undefined) {
      if (!Array.isArray(m.impeccable_commands_routed)) {
        err('meta.impeccable_commands_routed must be an array or null');
      } else {
        m.impeccable_commands_routed.forEach(function (entry, i) {
          const at = 'meta.impeccable_commands_routed[' + i + ']';
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            err(at + ' must be an object');
            return;
          }
          req(typeof entry.command === 'string' && entry.command.length > 0,
            at + '.command must be a non-empty string');
          req(typeof entry.call_form === 'string' &&
            ROUTING_CALL_FORM_VALUES.indexOf(entry.call_form) !== -1,
            at + '.call_form must be one of: ' + ROUTING_CALL_FORM_VALUES.join(', '));
          req(typeof entry.status === 'string' &&
            ROUTING_STATUS_VALUES.indexOf(entry.status) !== -1,
            at + '.status must be one of: ' + ROUTING_STATUS_VALUES.join(', '));
        });
      }
    }

    // v1.18.21 design-grounding — mechanical post-EXECUTE grounding lint axis
    // (present-only — pre-1.18.21 receipts validate unchanged).
    //
    // design_grounding_captured: gate-time boolean. Stamped at /mccp:prp-implement
    //   Phase 2.5.6 when the design trigger fired and captureDirection wrote the
    //   pre-EXECUTE direction artifact. Proves capture was ATTEMPTED — not that
    //   grounding passed (Codex Implement-R1 F3).
    // design_grounding_verdict: post-EXECUTE enum or null. Stamped by the
    //   field-preserving restamp (cli.js restamp-grounding) at Phase 3.6 close.
    //   'grounded' = rendered delta clean + declared signals satisfied.
    //   'anchor_clean' = clean anchors, no signals to confirm / no rendered diff.
    //   'inconclusive' = capture read failed (F4) OR a required signal absent.
    //   'violations' = H15 anchor violated in produced delta.
    //   'skipped' = MCCP_DESIGN_GROUNDING=off. null = sub-step not exercised.
    //   NOT carved out of receipt_hash — the restamp recomputes both digests so
    //   the verdict is tamper-protected.
    if (m.design_grounding_captured !== undefined) {
      req(typeof m.design_grounding_captured === 'boolean',
        'meta.design_grounding_captured must be a boolean if present');
    }
    const GROUNDING_VERDICT_VALUES =
      ['grounded', 'anchor_clean', 'inconclusive', 'violations', 'skipped'];
    if (m.design_grounding_verdict !== null && m.design_grounding_verdict !== undefined) {
      req(typeof m.design_grounding_verdict === 'string' &&
        GROUNDING_VERDICT_VALUES.indexOf(m.design_grounding_verdict) !== -1,
        'meta.design_grounding_verdict must be one of: ' +
        GROUNDING_VERDICT_VALUES.join(', ') + ' (or null)');
    }

    // Dashboard Truthfulness M1 (F3) — completion-ledger diagnostic flag
    // (present-only — pre-M1 receipts validate unchanged). Stamped by the
    // ledger epilogue ONLY on the git-unsafe skip path; its presence is
    // diagnostic, NOT authoritative. The authoritative completion signal is
    // the ledger entry file's existence (milestone-history/derive read the
    // entry, never this flag). hash.js carves it out of receipt_hash.
    if (m.ledger_write_skipped !== undefined) {
      req(typeof m.ledger_write_skipped === 'boolean',
        'meta.ledger_write_skipped must be a boolean if present');
    }

    // workflow-orchestration M3 — aggregate adversarial-verify audit (present-
    // only; pre-M3 receipts validate unchanged). Stamped on the mccp-implement-
    // verify gate by the /mccp:work Step 3 controller after the integrated diff is
    // reviewed once by Codex (cross-model, worker-external). NOT carved out of
    // receipt_hash — the write recomputes both digests so the verdict is tamper-
    // protected (P5). merged_verify_verdict shares the codex verdict vocabulary.
    if (m.merged_verify_verdict !== null && m.merged_verify_verdict !== undefined) {
      req(typeof m.merged_verify_verdict === 'string' &&
        CODEX_VERDICT_VALUES.indexOf(m.merged_verify_verdict) !== -1,
        'meta.merged_verify_verdict must be one of: ' +
        CODEX_VERDICT_VALUES.join(', ') + ' (or null)');
    }
    if (m.merged_verify_rounds !== null && m.merged_verify_rounds !== undefined) {
      req(Number.isInteger(m.merged_verify_rounds) && m.merged_verify_rounds >= 0,
        'meta.merged_verify_rounds must be a non-negative integer if present');
    }

    // diverse-agent-review M1 — L3 instrumentation + gate wall-clock. Present-
    // only (not in makeSkeleton, DD6) and deliberately NOT carved out of
    // receipt_hash: unlike briefing_*, which is stamped AFTER the receipt is
    // sealed and therefore cannot hash itself, these are settled at write time
    // and are part of the approval record. Carving them out would let the
    // instrumentation be edited without breaking the tamper digest, which is
    // exactly the audit story M1 wants to keep honest.
    if (m.review_l3_invoked !== null && m.review_l3_invoked !== undefined) {
      req(typeof m.review_l3_invoked === 'boolean',
        'meta.review_l3_invoked must be a boolean if present');
    }
    if (m.review_l3_reason !== null && m.review_l3_reason !== undefined) {
      req(typeof m.review_l3_reason === 'string' && m.review_l3_reason.length > 0,
        'meta.review_l3_reason must be a non-empty string if present');
    }
    if (m.review_wall_clock_ms !== null && m.review_wall_clock_ms !== undefined) {
      req(Number.isInteger(m.review_wall_clock_ms) && m.review_wall_clock_ms >= 0,
        'meta.review_wall_clock_ms must be a non-negative integer if present');
    }

    // santa-loop-materialize M2 (DD4) — santa 원장 집계 4종. 전부 PRESENT-ONLY이며
    // makeSkeleton에 **넣지 않는다**. 바로 위 merged_verify_* 는 validator 모양의
    // 참고일 뿐 그 필드군은 makeSkeleton에 등록돼 있으니 그쪽은 따라하지 마라 —
    // 키를 skeleton에 추가하면 모든 receipt의 canonical hash 입력이 바뀌어
    // git-tracked ship corpus(§3.12)의 재작성이 TRACKED_RECEIPT_OVERWRITE 가드에
    // 걸린다. 따라할 선례는 review_l3_invoked(조건부 대입, skeleton 미등록)다.
    // 값은 ledger.aggregate() 출력에서 그대로 오고 M2는 새 계산을 만들지 않는다.
    if (m.santa_rounds !== null && m.santa_rounds !== undefined) {
      req(Number.isInteger(m.santa_rounds) && m.santa_rounds >= 0,
        'meta.santa_rounds must be a non-negative integer if present');
    }
    if (m.santa_entries !== null && m.santa_entries !== undefined) {
      req(Number.isInteger(m.santa_entries) && m.santa_entries >= 0,
        'meta.santa_entries must be a non-negative integer if present');
    }
    if (m.santa_cap !== null && m.santa_cap !== undefined) {
      req(Number.isInteger(m.santa_cap) && m.santa_cap >= 1,
        'meta.santa_cap must be an integer >= 1 if present');
    }
    if (m.santa_exit_reason !== null && m.santa_exit_reason !== undefined) {
      req(m.santa_exit_reason === 'cap_reached',
        'meta.santa_exit_reason must be "cap_reached" if present (absence means the ' +
        'loop ended without exhausting the cap)');
    }

    // codex-intent-context M1 — intent-gate audit axis. 10 fields, ALL
    // PRESENT-ONLY: they are not materialized in makeSkeleton, so a receipt that
    // never exercises the gate omits every key and its receipt_hash is
    // bit-identical to a pre-M1 receipt. That matters because makeSkeleton is
    // shared by every gate including the now git-tracked mccp-pr-codex ship
    // corpus (§3.12) — mirrors the pr_codex_force_override precedent.
    //
    // Absence is also SEMANTIC (DD2): `!('intent_gate_verdict' in meta)` means
    // "written before this field existed" = unknown, which the chain allows and
    // dedupe refuses. Materializing a default null would destroy that signal.
    const INTENT_VERDICT_VALUES = [
      'preserved', 'skipped', 'skipped-unproven', 'incomplete', 'conflict_unresolved',
      // M1.5 — widening an enum only VALIDATES new values; it cannot make a
      // historical receipt retroactively invalid.
      'inconclusive', 'mislabel_unresolved',
    ];
    // Keep in lockstep with intent-context.js SKIP_PROOFS — a value accepted by
    // one and rejected by the other splits write-side and read-side on what
    // counts as a valid skip. (`codex_not_invoked` = the panel issued the
    // approval, diverse-agent-review M1.)
    const INTENT_SKIP_PROOFS = [
      'free_form_plan', 'no_codex_findings', 'codex_disabled', 'codex_not_invoked',
    ];
    const INTENT_CONTRACT_VALUES = ['full', 'partial', 'absent'];
    const INTENT_MISLABEL_MODES = ['enforce', 'warn', 'off'];
    const INTENT_MISLABEL_CLASSIFICATIONS = ['reviewer-only', 'id-mismatch'];
    // 'relabelled' is unreachable by construction (relabelling reclassifies the
    // finding as agree-conflict, which never enters the audit array). It stays
    // accepted so DD11's stated enum remains valid input.
    const INTENT_MISLABEL_RESOLUTIONS = ['relabelled', 'disputed', 'unresolved'];
    const INTENT_AUDIT_MAX = 1000;   // == ADJUDICATION_LIMITS.ITEMS, so no truncation branch exists
    const INTENT_DISPUTE_REASON_CHARS = 5000;   // == ADJUDICATION_LIMITS.DISPUTE_REASON_CHARS

    if (m.intent_section_present !== undefined) {
      req(typeof m.intent_section_present === 'boolean',
        'meta.intent_section_present must be a boolean if present');
    }
    if (m.intent_reference_injected !== undefined) {
      req(typeof m.intent_reference_injected === 'boolean',
        'meta.intent_reference_injected must be a boolean if present');
    }
    if (m.intent_items_count !== null && m.intent_items_count !== undefined) {
      req(Number.isInteger(m.intent_items_count) && m.intent_items_count >= 0,
        'meta.intent_items_count must be a non-negative integer or null');
    }
    if (m.intent_gate_verdict !== null && m.intent_gate_verdict !== undefined) {
      req(typeof m.intent_gate_verdict === 'string' &&
        INTENT_VERDICT_VALUES.indexOf(m.intent_gate_verdict) !== -1,
        'meta.intent_gate_verdict must be one of: ' +
        INTENT_VERDICT_VALUES.join(', ') + ' (or null)');
    }
    if (m.intent_skip_proof !== null && m.intent_skip_proof !== undefined) {
      req(typeof m.intent_skip_proof === 'string' &&
        INTENT_SKIP_PROOFS.indexOf(m.intent_skip_proof) !== -1,
        'meta.intent_skip_proof must be one of: ' + INTENT_SKIP_PROOFS.join(', ') + ' (or null)');
    }
    if (m.intent_plan_digest !== null && m.intent_plan_digest !== undefined) {
      req(typeof m.intent_plan_digest === 'string' && SHA256_RE.test(m.intent_plan_digest),
        'meta.intent_plan_digest must match sha256:<64 hex> or be null');
    }
    if (m.intent_run_nonce !== null && m.intent_run_nonce !== undefined) {
      req(typeof m.intent_run_nonce === 'string' && UUID_V4_RE.test(m.intent_run_nonce),
        'meta.intent_run_nonce must be a UUID or null');
    }
    // Codex F2 — the top level is a closed 5-key shape, but `by_verdict` is an
    // OPEN string→non-negative-int map. Pinning today's ADJUDICATION_VERDICTS
    // into the schema would make every historical receipt retroactively invalid
    // the day a verdict is added, and sealed receipt_hash forbids silent
    // patching. Validation is therefore a SUM INVARIANT, not key completeness
    // (same reasoning as impeccable_commands_routed[].command's open string).
    if (m.intent_adjudication_counts !== null && m.intent_adjudication_counts !== undefined) {
      const c = m.intent_adjudication_counts;
      if (!c || typeof c !== 'object' || Array.isArray(c)) {
        err('meta.intent_adjudication_counts must be an object or null');
      } else {
        const ints = ['total', 'conflict', 'none', 'overrides'];
        let intsOk = true;
        ints.forEach(function (k) {
          const ok = Number.isInteger(c[k]) && c[k] >= 0;
          if (!ok) intsOk = false;
          req(ok, 'meta.intent_adjudication_counts.' + k +
            ' must be a non-negative integer');
        });
        const bv = c.by_verdict;
        if (!bv || typeof bv !== 'object' || Array.isArray(bv)) {
          err('meta.intent_adjudication_counts.by_verdict must be an object');
        } else {
          let sum = 0;
          let bvOk = true;
          Object.keys(bv).forEach(function (k) {
            const ok = Number.isInteger(bv[k]) && bv[k] >= 0;
            if (!ok) bvOk = false;
            req(ok, 'meta.intent_adjudication_counts.by_verdict.' + k +
              ' must be a non-negative integer');
            if (ok) sum += bv[k];
          });
          if (intsOk && bvOk) {
            req(c.total === sum,
              'meta.intent_adjudication_counts.total must equal the sum of by_verdict');
            req(c.total === c.conflict + c.none,
              'meta.intent_adjudication_counts.total must equal conflict + none');
            req(c.overrides <= c.conflict,
              'meta.intent_adjudication_counts.overrides must not exceed conflict');
          }
        }
      }
    }
    if (m.intent_gate_force_override !== undefined) {
      req(typeof m.intent_gate_force_override === 'boolean',
        'meta.intent_gate_force_override must be a boolean if present');
    }
    if (m.intent_gate_force_override_reason !== null
        && m.intent_gate_force_override_reason !== undefined) {
      req(typeof m.intent_gate_force_override_reason === 'string',
        'meta.intent_gate_force_override_reason must be a string or null');
    }
    if (m.intent_gate_force_override === true) {
      const v = validateReason(m.intent_gate_force_override_reason, { strict: true });
      if (!v.ok) {
        err('meta.intent_gate_force_override_reason rejected (' + v.reason + '): ' +
          'MCCP_SKIP_INTENT_GATE requires a substantive reason ≥30 chars + ≥3 words, ' +
          'no placeholder/URL-only/banlist token');
      }
    }

    // ── M1.5 mislabel axis — 6 present-only fields ──────────────────────────
    //
    // Same present-only contract as the M1 block above: absent means "this
    // receipt predates the field", not "clean". None of these are in
    // makeSkeleton, so the tracked ship corpus's receipt_hash is untouched.
    if (m.intent_mislabel_mode !== null && m.intent_mislabel_mode !== undefined) {
      req(typeof m.intent_mislabel_mode === 'string'
        && INTENT_MISLABEL_MODES.indexOf(m.intent_mislabel_mode) !== -1,
        'meta.intent_mislabel_mode must be one of: ' +
        INTENT_MISLABEL_MODES.join(', ') + ' (or null)');
    }
    if (m.intent_reviewer_contract !== null && m.intent_reviewer_contract !== undefined) {
      req(typeof m.intent_reviewer_contract === 'string'
        && INTENT_CONTRACT_VALUES.indexOf(m.intent_reviewer_contract) !== -1,
        'meta.intent_reviewer_contract must be one of: ' +
        INTENT_CONTRACT_VALUES.join(', ') + ' (or null)');
    }
    if (m.intent_mislabel_disputes !== null && m.intent_mislabel_disputes !== undefined) {
      req(Number.isInteger(m.intent_mislabel_disputes) && m.intent_mislabel_disputes >= 0,
        'meta.intent_mislabel_disputes must be a non-negative integer or null');
    }
    if (m.intent_claims_digest !== null && m.intent_claims_digest !== undefined) {
      req(typeof m.intent_claims_digest === 'string' && SHA256_RE.test(m.intent_claims_digest),
        'meta.intent_claims_digest must match sha256:<64 hex> or be null');
    }
    // Unlike intent_adjudication_counts, this shape is CLOSED: every key is
    // produced by one oracle in this repo, so a stray key means the object did
    // not come from compareIntentClaims. Validation is the same partition
    // invariant that oracle asserts — the six classifications must account for
    // every finding exactly once, and claimed+unclaimed must too.
    //
    // That invariant alone does NOT stop a hand-edited object from claiming
    // `reviewer_only: 0` while the audit array lists three of them: moving the
    // three into `author_only` keeps the partition intact. Catching that needs
    // the aggregates compared against the evidence, which is the reconciliation
    // block after the audit array — this block only establishes that they are
    // well-formed enough to compare.
    let ccUsable = null;
    if (m.intent_claim_counts !== null && m.intent_claim_counts !== undefined) {
      const cc = m.intent_claim_counts;
      if (!cc || typeof cc !== 'object' || Array.isArray(cc)) {
        err('meta.intent_claim_counts must be an object or null');
      } else {
        const CC_KEYS = ['total', 'claimed', 'unclaimed', 'agree_none', 'agree_conflict',
          'id_mismatch', 'reviewer_only', 'author_only', 'reviewer_conflict', 'author_conflict'];
        let ccOk = true;
        CC_KEYS.forEach(function (k) {
          const ok = Number.isInteger(cc[k]) && cc[k] >= 0;
          if (!ok) ccOk = false;
          req(ok, 'meta.intent_claim_counts.' + k + ' must be a non-negative integer');
        });
        Object.keys(cc).forEach(function (k) {
          req(CC_KEYS.indexOf(k) !== -1, 'meta.intent_claim_counts has unknown key "' + k + '"');
        });
        if (ccOk) {
          const sumOk = cc.claimed + cc.unclaimed === cc.total;
          req(sumOk, 'meta.intent_claim_counts: claimed + unclaimed must equal total');
          const partition = cc.agree_none + cc.agree_conflict + cc.id_mismatch
            + cc.reviewer_only + cc.author_only + cc.unclaimed;
          req(partition === cc.total,
            'meta.intent_claim_counts: the six classifications must partition total');
          // `reviewer_conflict` counts findings where the reviewer named an id,
          // and naming an id lands the finding in exactly one of three
          // classifications — so this is an identity, not a bound, and an upper
          // bound alone (`<= claimed`) let the counter be falsified downward.
          req(cc.reviewer_conflict === cc.agree_conflict + cc.reviewer_only + cc.id_mismatch,
            'meta.intent_claim_counts.reviewer_conflict (' + cc.reviewer_conflict +
            ') must equal agree_conflict + reviewer_only + id_mismatch (' +
            (cc.agree_conflict + cc.reviewer_only + cc.id_mismatch) + ')');
          // `author_conflict` gets only a bound, and the asymmetry is real: the
          // author's label is counted even when the REVIEWER made no claim, so
          // an `unclaimed` finding can carry one. That share is not recoverable
          // from the six classification counts, and asserting the same identity
          // here would reject legitimate producer output.
          const authorFloor = cc.author_only + cc.agree_conflict + cc.id_mismatch;
          req(cc.author_conflict >= authorFloor
            && cc.author_conflict <= authorFloor + cc.unclaimed,
            'meta.intent_claim_counts.author_conflict (' + cc.author_conflict +
            ') must lie in [' + authorFloor + ', ' + (authorFloor + cc.unclaimed) +
            '] — author_only + agree_conflict + id_mismatch, plus at most the ' +
            'unclaimed findings that may also carry an author label');
          if (sumOk && partition === cc.total) ccUsable = cc;
        }
      }
    }
    let auditUsable = null;
    if (m.intent_mislabel_audit !== null && m.intent_mislabel_audit !== undefined) {
      const au = m.intent_mislabel_audit;
      if (!Array.isArray(au)) {
        err('meta.intent_mislabel_audit must be an array or null');
      } else if (au.length > INTENT_AUDIT_MAX) {
        // Unreachable in practice (disputed findings are a subset of findings,
        // and findings are already capped at the same number) — but a silent
        // truncation would defeat the whole point of the array, so it is an
        // ERROR rather than a slice.
        err('meta.intent_mislabel_audit exceeds ' + INTENT_AUDIT_MAX + ' entries');
      } else {
        // Only classification/resolution gate the reconciliation below, so only
        // those two decide whether the array is comparable — a bad digest is an
        // error but does not make the tallies meaningless.
        let comparable = true;
        au.forEach(function (e, i) {
          const at = 'meta.intent_mislabel_audit[' + i + ']';
          if (!e || typeof e !== 'object' || Array.isArray(e)) {
            err(at + ' must be an object');
            comparable = false;
            return;
          }
          req(Number.isInteger(e.finding_index) && e.finding_index >= 0,
            at + '.finding_index must be a non-negative integer');
          req(e.finding_digest === null
            || (typeof e.finding_digest === 'string' && SHA256_RE.test(e.finding_digest)),
            at + '.finding_digest must match sha256:<64 hex> or be null');
          const clsOk = typeof e.classification === 'string'
            && INTENT_MISLABEL_CLASSIFICATIONS.indexOf(e.classification) !== -1;
          req(clsOk, at + '.classification must be one of: ' +
            INTENT_MISLABEL_CLASSIFICATIONS.join(', '));
          const resOk = typeof e.resolution === 'string'
            && INTENT_MISLABEL_RESOLUTIONS.indexOf(e.resolution) !== -1;
          req(resOk, at + '.resolution must be one of: ' +
            INTENT_MISLABEL_RESOLUTIONS.join(', '));
          if (!clsOk || !resOk) comparable = false;
          req(e.reviewer_claim === null || typeof e.reviewer_claim === 'string',
            at + '.reviewer_claim must be a string or null');
          req(e.author_conflict === null || typeof e.author_conflict === 'string',
            at + '.author_conflict must be a string or null');
          req(e.dispute_reason === null
            || (typeof e.dispute_reason === 'string'
              && e.dispute_reason.length <= INTENT_DISPUTE_REASON_CHARS),
            at + '.dispute_reason must be a string ≤' + INTENT_DISPUTE_REASON_CHARS +
            ' chars or null');
          // `resolution:'disputed'` is a CLAIM that the author answered, and the
          // oracle only reaches it when isValidDisputeReason accepted the text.
          // Length-checking alone left the label trusted on its own word: an
          // entry could seal `dispute_reason:'no'` as `disputed`, count toward
          // intent_mislabel_disputes, and carry `preserved` — while the same
          // text through the oracle is no answer at all and yields
          // `mislabel_unresolved`. Re-run the predicate here so the record
          // cannot assert a resolution its own evidence does not support.
          if (e.resolution === 'disputed') {
            req(isValidDisputeReason(e.dispute_reason),
              at + '.resolution is "disputed" but .dispute_reason is not a valid ' +
              'dispute (the oracle would treat it as no answer, making this ' +
              'finding unresolved)');
          }
        });
        if (comparable) auditUsable = au;
      }
    }

    // ── aggregate ↔ evidence reconciliation ────────────────────────────────
    //
    // The aggregates SUMMARIZE the audit array, so a receipt where the two
    // disagree is not merely odd: it is a receipt whose summary contradicts its
    // own evidence, which is exactly the shape a hand-edit takes when someone
    // wants the counts to look clean without deleting the entries that prove
    // otherwise. Shape validation cannot see it — the comparison has to be made.
    //
    // The equality is exact rather than an inequality because ONLY the two
    // NEEDS_RESPONSE classifications ever enter the array
    // (intent-claims.js#NEEDS_RESPONSE, projected by
    // plan-codex-runner.js#buildMislabelAudit), and `resolution:'disputed'` is
    // set by the same predicate that counts a dispute.
    const auditAbsent = m.intent_mislabel_audit === null
      || m.intent_mislabel_audit === undefined;
    const disputesPresent = Number.isInteger(m.intent_mislabel_disputes)
      && m.intent_mislabel_disputes >= 0;

    if (auditUsable && ccUsable) {
      let reviewerOnly = 0;
      let idMismatch = 0;
      auditUsable.forEach(function (e) {
        if (e.classification === 'reviewer-only') reviewerOnly += 1;
        else if (e.classification === 'id-mismatch') idMismatch += 1;
      });
      req(reviewerOnly === ccUsable.reviewer_only,
        'meta.intent_claim_counts.reviewer_only (' + ccUsable.reviewer_only +
        ') must equal the reviewer-only entries in meta.intent_mislabel_audit (' +
        reviewerOnly + ')');
      req(idMismatch === ccUsable.id_mismatch,
        'meta.intent_claim_counts.id_mismatch (' + ccUsable.id_mismatch +
        ') must equal the id-mismatch entries in meta.intent_mislabel_audit (' +
        idMismatch + ')');
    }

    // Deleting the array is the other half of the same edit, so absence is only
    // acceptable when the aggregates agree that there was nothing to record.
    if (auditAbsent) {
      if (ccUsable) {
        req(ccUsable.reviewer_only + ccUsable.id_mismatch === 0,
          'meta.intent_mislabel_audit is absent but meta.intent_claim_counts reports ' +
          (ccUsable.reviewer_only + ccUsable.id_mismatch) +
          ' finding(s) that required an explicit response — the evidence array cannot be dropped');
      }
      if (disputesPresent) {
        req(m.intent_mislabel_disputes === 0,
          'meta.intent_mislabel_disputes is ' + m.intent_mislabel_disputes +
          ' but meta.intent_mislabel_audit is absent — a dispute has no evidence');
      }
    } else if (auditUsable && disputesPresent) {
      let disputed = 0;
      auditUsable.forEach(function (e) { if (e.resolution === 'disputed') disputed += 1; });
      req(m.intent_mislabel_disputes === disputed,
        'meta.intent_mislabel_disputes (' + m.intent_mislabel_disputes +
        ') must equal the disputed entries in meta.intent_mislabel_audit (' + disputed + ')');
    }

    // `intent_reviewer_contract` is a projection of the counts
    // (intent-claims.js#deriveCompliance), so it is derivable rather than
    // independent. Storing both and never comparing them lets the cheap-to-read
    // one drift away from the one that carries the arithmetic.
    if (ccUsable && typeof m.intent_reviewer_contract === 'string') {
      const expected = ccUsable.total === 0 ? 'absent'
        : (ccUsable.claimed === ccUsable.total ? 'full'
          : (ccUsable.claimed === 0 ? 'absent' : 'partial'));
      req(m.intent_reviewer_contract === expected,
        'meta.intent_reviewer_contract ("' + m.intent_reviewer_contract +
        '") must be derivable from meta.intent_claim_counts (expected "' + expected +
        '" for ' + ccUsable.claimed + '/' + ccUsable.total + ')');
    }

    // ── verdict ↔ evidence ─────────────────────────────────────────────────
    //
    // decideIntentGate makes each mislabel verdict an ENTAILMENT of the
    // evidence, not a separate opinion about it: `inconclusive` is returned
    // only when compliance is not `full`, `mislabel_unresolved` only when at
    // least one response-needed finding lacks a valid dispute, and reaching
    // `preserved` means neither fired. A receipt that seals one of those
    // verdicts next to evidence that could not have produced it is
    // self-contradictory, and the one that matters is `preserved` — that is the
    // value `isIntentApproved` reads.
    //
    // This does NOT make forgery impossible: an actor who rewrites the whole
    // file can write a consistent lie (`preserved` + `full` + an empty audit)
    // and no cross-check can see it. What it closes is the receipt that keeps
    // its incriminating evidence while flipping the verdict above it, and
    // producer drift where the two stop agreeing.
    const contractPresent = typeof m.intent_reviewer_contract === 'string';
    let unresolvedCount = null;
    if (auditUsable) {
      unresolvedCount = 0;
      auditUsable.forEach(function (e) {
        if (e.resolution === 'unresolved') unresolvedCount += 1;
      });
    }

    if (m.intent_gate_verdict === 'preserved') {
      if (contractPresent) {
        req(m.intent_reviewer_contract === 'full',
          'meta.intent_gate_verdict="preserved" contradicts meta.intent_reviewer_contract="' +
          m.intent_reviewer_contract + '" — a non-full contract yields "inconclusive"');
      }
      if (unresolvedCount !== null) {
        req(unresolvedCount === 0,
          'meta.intent_gate_verdict="preserved" contradicts ' + unresolvedCount +
          ' unresolved entr(ies) in meta.intent_mislabel_audit — those yield ' +
          '"mislabel_unresolved"');
      }
    } else if (m.intent_gate_verdict === 'inconclusive') {
      if (contractPresent) {
        req(m.intent_reviewer_contract !== 'full',
          'meta.intent_gate_verdict="inconclusive" requires a non-full ' +
          'meta.intent_reviewer_contract');
      }
    } else if (m.intent_gate_verdict === 'mislabel_unresolved') {
      if (unresolvedCount !== null) {
        req(unresolvedCount > 0,
          'meta.intent_gate_verdict="mislabel_unresolved" requires at least one ' +
          'unresolved entry in meta.intent_mislabel_audit');
      }
    }

    // `intent_mislabel_mode` is sealed on every current write, so it records
    // whether the axis was live. If it was AND the gate still reached
    // `preserved`, the comparison necessarily ran: plan-codex-runner.js builds
    // `comparison` on exactly the branch that can return `preserved` (a run that
    // never got that far ends at `skipped` or `incomplete`). So a `preserved`
    // receipt claiming an active mode with no evidence at all is a receipt whose
    // evidence was removed after the fact.
    //
    // Scope, stated plainly: this is NOT anti-forgery. Whoever nulls these five
    // can null the mode too and land on something indistinguishable from a
    // pre-M1.5 receipt — present-only makes that indistinguishability deliberate.
    // It closes the partial edit, and (before any of this) an unsigned edit is
    // already caught by receipt_hash, which covers these fields.
    //
    // The same entailment runs the other way for the two verdicts the mislabel
    // axis itself produces. `inconclusive` and `mislabel_unresolved` are returned
    // ONLY from the block that requires a comparison, so they cannot exist
    // without one — and a comparison cannot exist with the axis off. Requiring
    // the bundle only for `preserved` left the blocking half of the axis able to
    // validate with its evidence stripped, which is the shape that matters most:
    // those are exactly the receipts an operator is sent to read.
    const liveMislabelMode = m.intent_mislabel_mode === 'warn'
      || m.intent_mislabel_mode === 'enforce';
    const isMislabelVerdict = m.intent_gate_verdict === 'inconclusive'
      || m.intent_gate_verdict === 'mislabel_unresolved';

    if (isMislabelVerdict) {
      req(liveMislabelMode,
        'meta.intent_gate_verdict="' + m.intent_gate_verdict + '" requires ' +
        'meta.intent_mislabel_mode to be "warn" or "enforce" — the axis produces ' +
        'that verdict only when it ran (got ' +
        JSON.stringify(m.intent_mislabel_mode) + ')');
    }

    if (isMislabelVerdict || (liveMislabelMode && m.intent_gate_verdict === 'preserved')) {
      const why = isMislabelVerdict
        ? 'meta.intent_gate_verdict="' + m.intent_gate_verdict +
          '" is produced only from a comparison, so its evidence must be present'
        : 'meta.intent_mislabel_mode="' + m.intent_mislabel_mode +
          '" with verdict "preserved" means the comparison ran';
      [
        'intent_reviewer_contract', 'intent_claim_counts', 'intent_claims_digest',
        'intent_mislabel_disputes', 'intent_mislabel_audit',
      ].forEach(function (k) {
        req(m[k] !== null && m[k] !== undefined, 'meta.' + k + ' must be present — ' + why);
      });
    }

    // The flag means the override TOOK EFFECT (intent-context.js DD12), so a
    // sealed reason with the flag down records a justification for something
    // that did not happen — exactly the reading the split was introduced to
    // prevent.
    if (typeof m.intent_gate_force_override_reason === 'string'
        && m.intent_gate_force_override_reason.length > 0) {
      req(m.intent_gate_force_override === true,
        'meta.intent_gate_force_override_reason is sealed but ' +
        'meta.intent_gate_force_override is not true — the reason must be dropped ' +
        'when the override did not apply');
    }
  }

  return { ok: errors.length === 0, errors: errors };
}

function makeSkeleton(overrides) {
  const o = overrides || {};
  return Object.assign({
    schema_version: SCHEMA_VERSION,
    gate_id: null,
    phase: null,
    decision_id: null,
    task_id: null,
    plan_hash: null,
    design_doc_hash: [],
    base_sha: null,
    head_sha: null,
    round: 1,
    findings: [],
    resolution: {
      converged: false,
      rounds: 1,
      accepted: [],
      rejected: [],
      open_questions: [],
    },
    subject_hash: null,
    receipt_hash: null,
    meta: {
      created_at: new Date().toISOString(),
      command: null,
      cwd: process.cwd(),
      git_branch: null,
      skipped: false,
      skip_reason: null,
      codex_skipped: false,
      advisory: false,
      security_skipped: false,
      security_skip_reason: null,
      security_force_override: false,
      security_force_override_reason: null,
      impeccable_skipped: false,
      impeccable_skip_reason: null,
      impeccable_force_override: false,
      impeccable_force_override_reason: null,
      // integrity-unification M3 — PR-Codex ship-gate audited override is
      // PRESENT-ONLY (santa-loop R2, Codex FAIL absorption): NOT materialized in the
      // skeleton. write.js adds pr_codex_force_override=true + reason ONLY when the
      // override is active, so a normal receipt omits both keys and its receipt_hash
      // stays pre-M3-identical (§3.12 git-tracked ship-corpus hash stability — this
      // is the first audit field added AFTER ship receipts became tracked in v1.22.4,
      // so it must not perturb the hash of receipts that never exercise it). The
      // validate() branch treats both keys as optional (present-only guards).
      // v1.3.0 design-gate enforcement M1 — silent-skip surface. Default false
      // for green path; flipped by `--impeccable-silent-skip` CLI flag when
      // detector returns SKILL_AVAIL=1 + SIGNAL=0.
      impeccable_silent_skip: false,
      impeccable_silent_skip_reason: null,
      // v0.2.8 Task 2.6.1 — PR-Codex review-only audit axis.
      codex_dedupe_at_pr: false,
      codex_skipped_at_pr: false,
      codex_skip_reason: null,
      codex_review_actionable_findings: false,
      // v1.22.3 M3 follow-up (R1 F1 + F4) — scope-excluded pass + raw provenance.
      // Defaults keep the fields present-and-inert on receipts that never hit the
      // design-scope path, mirroring codex_review_actionable_findings above.
      codex_scope_excluded_verdict: false,
      codex_raw_verdict: null,
      // v0.3.5 Task 4 — env-level MCCP_CODEX_DISABLED honor (parallel to codex_skipped).
      codex_disabled: false,
      codex_disabled_at_pr: false,
      // v0.2.9 Task 5 — YAGNI triage DEFER_TO_BACKLOG counter (additive, no schema bump).
      deferred_findings_count: 0,
      // v0.3.6 Task 3 — Codex/impeccable scope audit axis (additive, optional).
      codex_design_scope_excluded: false,
      design_findings_dropped: 0,
      a11y_routed_to_impeccable: false,
      dropped_findings_digest: null,
      // v1.13.0 M3 — a11y-architect actually auto-invoked at PR gate.
      a11y_auto_invoked: false,
      // v0.4.0 axis H — plan_conflict_escalated. Advisory-only audit stamp.
      plan_conflict_escalated: false,
      // v1.0.1 axis K — orphan-lock reclaim audit. Stamped by finalize-receipt
      // when the guard hook left a stale-reclaim marker.
      pr_phase_lock_stale_reclaimed_at_hook: false,
      // v1.2.0-m1 Task 6 — controller-worker attribution. marker=false +
      // 3 attribution fields=null is the canonical absent state. write.js
      // flips marker=true + populates all 3 when MCCP_DISPATCH_CONTEXT=1 OR
      // the supplied --ipc-envelope-path exists on disk.
      controller_context_marker_present: false,
      dispatched_by_controller_session_id: null,
      worker_dispatch_id: null,
      ipc_envelope_path: null,
      // v1.3.0-m2 — LLM briefing stamp + token telemetry. Present-only.
      // Stamped by lib/briefing/index.js AFTER receipt write. null/0 here is
      // the canonical "no briefing happened yet" state; cost-guard skip flips
      // invocation_count to 0 + summary stays null; ok path stamps real values.
      // briefing_token_estimated=true means the count was derived from
      // (focus.length + stdout.length)/4 (codex-companion currently emits no
      // real tokenUsage as of v1.3.0). Codex R1 F2.
      briefing_summary: null,
      briefing_token_count: null,
      briefing_token_estimated: false,
      briefing_invocation_count: null,
      // v1.3.0-m2 — design-critique retry-loop audit axis. null on the green
      // path (sub-step skipped or not exercised). loop wire stamps real values
      // via cli.js --design-critique-rounds / --design-critique-verdict /
      // --design-intent-reason / --pr-design-chain-skip-reason flags.
      design_critique_rounds: null,
      design_critique_verdict: null,
      design_intent_reason: null,
      pr_design_chain_skip_reason: null,
      // v1.13.0 — stage-aware impeccable command routing audit (present-only).
      // null = routing sub-step not exercised. Stamped via cli.js
      // --impeccable-routing-mode + --impeccable-commands-routed-file flags.
      impeccable_routing_mode: null,
      impeccable_commands_routed: null,
      // v1.18.21 design-grounding — mechanical post-EXECUTE grounding lint axis.
      // captured (gate-time boolean) is stamped at write-time when the design
      // trigger fired; verdict (post-EXECUTE enum) is added by the field-
      // preserving restamp at Phase 3.6 close. Default false/null = green path.
      design_grounding_captured: false,
      design_grounding_verdict: null,
      // workflow-orchestration M3 — aggregate adversarial-verify audit. null =
      // gate not exercised. Stamped on mccp-implement-verify receipts via cli.js
      // --merged-verify-verdict / --merged-verify-rounds.
      merged_verify_verdict: null,
      merged_verify_rounds: null,
    },
  }, o);
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  PHASES: PHASES,
  GATE_IDS: GATE_IDS,
  SEVERITIES: SEVERITIES,
  CODEX_VERDICT_VALUES: CODEX_VERDICT_VALUES,
  REVIEW_SOURCE_VALUES: REVIEW_SOURCE_VALUES,
  SHA256_RE: SHA256_RE,
  GIT_SHA_RE: GIT_SHA_RE,
  DECISION_ID_RE: DECISION_ID_RE,
  UUID_V4_RE: UUID_V4_RE,
  ENVELOPE_PATH_RE: ENVELOPE_PATH_RE,
  validate: validate,
  makeSkeleton: makeSkeleton,
};
