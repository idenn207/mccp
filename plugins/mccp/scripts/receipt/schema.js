'use strict';

const { validateReason } = require('./lib/force-override-reason');

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
const { SOURCES: REVIEW_SOURCE_VALUES, isReviewProofStructurallyValid } =
  require('../lib/review-verdict');

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
      // The proof only has to hold up when it is being used to justify an
      // approval. A divergent/unavailable verdict carries its proof for audit,
      // and demanding structural perfection there would block honest records of
      // a review that did not converge.
      if (r.review_verdict === 'converged') {
        req(isReviewProofStructurallyValid(r.review_proof),
          'resolution.review_proof fails the structural invariant required for a ' +
          'converged review_verdict (layers/verification_verdict/quorum/perspectives/' +
          'dispatch_evidence repo-relative paths/reviewed_plan_hash)');
      } else if (r.review_proof !== null && r.review_proof !== undefined) {
        req(isPlainObject(r.review_proof), 'resolution.review_proof must be an object');
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
