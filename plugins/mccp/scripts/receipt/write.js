'use strict';

const fs = require('fs');
const path = require('path');
const {
  markdownHash,
  planAwareMarkdownHash,
  gitRefs,
  gitBranch,
  gitRepoRoot,
  subjectHash,
  receiptHash,
} = require('./hash');
const { validate, makeSkeleton, GATE_IDS } = require('./schema');
const { validateReason } = require('./lib/force-override-reason');
const { parseIntentGateSkipReason, isPrdModePlan } = require('../lib/intent-context');
const { phaseFromGate } = require('./aliases');
const { writeReceipt, readReceipt, updateReceipt } = require('./store');
const escalateDetector = require('../lib/escalate-detector');
const fixTask = require('../state/fix-task');
const stateWriter = require('../state/state-writer');
const briefing = require('../lib/briefing');

function asArray(v) {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function readJsonIfPresent(filePath, fallback) {
  if (!filePath) return fallback;
  if (!fs.existsSync(filePath)) {
    throw new Error('file not found: ' + filePath);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relativeToRepo(filePath, repoRoot) {
  const abs = path.resolve(filePath);
  const rel = path.relative(repoRoot, abs);
  return rel.split(path.sep).join('/');
}

// durable-evidence-substrate Task A3 — normalize the receipt's meta.cwd to a
// repo-relative form for NEW writes only. Storing the absolute cwd leaked the
// working-tree path (and, in old worktrees, the prior repo name) into what
// becomes a git-tracked audit corpus (E7). This runs only for fresh writes;
// existing receipts are never re-read/re-written and NO meta.cwd carve-out is
// added to hash.js (E4), so the 33 existing hashes stay byte-identical — only
// new receipts seal the relative value. Outside-repo cwd → placeholder (never
// an absolute leak); missing repo root → '.'.
function normalizeReceiptCwd(cwd, repoRoot) {
  if (!repoRoot) return '.';
  const rel = relativeToRepo(cwd, repoRoot);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return '<outside-repo>';
  return rel;
}

// v1.2.0-m1 Task 6 — controller-worker attribution detection. Marker is
// detected from MCCP_DISPATCH_CONTEXT=1 OR the supplied --ipc-envelope-path
// existing on disk. When marker is true, all 3 attribution flags must be
// passed together (F2 absorption: silent total attribution loss).
function detectDispatchContext(args, cwd) {
  const sessionId = args['dispatched-by-controller-session'];
  const dispatchId = args['worker-dispatch-id'];
  const envelopePathArg = args['ipc-envelope-path'];

  const sessionIdStr = (typeof sessionId === 'string' && sessionId.length > 0) ? sessionId : null;
  const dispatchIdStr = (typeof dispatchId === 'string' && dispatchId.length > 0) ? dispatchId : null;
  const envelopePathStr = (typeof envelopePathArg === 'string' && envelopePathArg.length > 0)
    ? envelopePathArg : null;

  const markerByEnv = process.env.MCCP_DISPATCH_CONTEXT === '1';
  let markerByFile = false;
  if (envelopePathStr) {
    const envAbs = path.resolve(cwd, envelopePathStr);
    try { markerByFile = fs.existsSync(envAbs); } catch (_) { markerByFile = false; }
  }
  const anyFlagPresent = sessionIdStr !== null || dispatchIdStr !== null || envelopePathStr !== null;
  const markerDetected = markerByEnv || markerByFile || anyFlagPresent;

  if (markerDetected) {
    const missing = [];
    if (!sessionIdStr) missing.push('--dispatched-by-controller-session');
    if (!dispatchIdStr) missing.push('--worker-dispatch-id');
    if (!envelopePathStr) missing.push('--ipc-envelope-path');
    if (missing.length > 0) {
      const err = new Error('controller dispatch context detected (' +
        (markerByEnv ? 'MCCP_DISPATCH_CONTEXT=1' :
          markerByFile ? 'envelope file exists at ' + envelopePathStr :
          '--ipc-envelope-path/--worker-dispatch-id/--dispatched-by-controller-session supplied') +
        ') but attribution flags missing: ' + missing.join(', ') +
        ' — fail-closed to prevent silent attribution loss (F2 absorption)');
      err.code = 'DISPATCH_MARKER_MISSING_FIELDS';
      throw err;
    }
    return {
      marker: true,
      session_id: sessionIdStr,
      dispatch_id: dispatchIdStr,
      envelope_path: envelopePathStr,
    };
  }
  return { marker: false, session_id: null, dispatch_id: null, envelope_path: null };
}

// codex-intent-context M1 — gates the intent oracle actually governs. The
// implement gate is deliberately EXCLUDED (UI4): it reviews code patterns, not
// conversation intent, and wiring it in would make every implement receipt
// unknown → dedupe dead for every decision (DD9).
const INTENT_IN_SCOPE_GATES = ['mccp-plan-codex'];

// stampIntentDecision — write.js STAMPS, it never DECIDES (DD5). The verdict is
// computed by plan-codex-runner.js inside the same process that invoked Codex
// and held the review payload in memory.
//
// PROGRAMMATIC-ONLY BY CONSTRUCTION (Implement-Codex R1 F2, HIGH).
// There is no `--intent-*` CLI flag and there must never be one: cli.js
// parseFlags accepts arbitrary `--key value` pairs and forwards them straight
// into write(), so a flag here would let ANY shell caller stamp
// intent_gate_verdict='preserved' without Codex ever running — the exact
// forgery this milestone exists to prevent. parseFlags can only ever produce
// strings, `true`, or arrays, so requiring a non-null plain OBJECT closes the
// CLI path structurally rather than by convention.
function stampIntentDecision(receipt, args, gateId, planText) {
  const inScope = INTENT_IN_SCOPE_GATES.indexOf(gateId) !== -1;
  const d = args.intentDecision;
  const isObject = d !== null && typeof d === 'object' && !Array.isArray(d);

  if (d !== undefined && !isObject) {
    const err = new Error(
      'intentDecision must be a non-null object supplied programmatically by ' +
      'plan-codex-runner.js. Received ' + (Array.isArray(d) ? 'an array' : typeof d) +
      ' — CLI flags cannot supply an intent decision, by design.');
    err.code = 'INTENT_GATE_BLOCKED';
    throw err;
  }

  if (!isObject) {
    if (!inScope) return;  // out-of-scope gates legitimately have no intent axis

    // DD1 — a free-form (non-PRD) plan has no upstream intent record, so the
    // gate genuinely does not apply to it. That is not a judgement call: the
    // proof is `**Source PRD**:` being absent from the very body this receipt
    // is about to seal, checked mechanically here exactly as resolveSkipProof
    // checks it in the runner. Applying it here keeps write.js a stamper (it
    // still decides nothing) while confining the fail-closed to the plans that
    // actually carry intent.
    //
    // This is not a new bypass: DD1 already makes `free_form_plan` a passing
    // proof, so stripping the Source PRD line to dodge the gate is equally
    // available through the runner — and it changes plan_hash and is recorded
    // honestly in the receipt either way (DD10 threat model).
    if (typeof planText === 'string' && !isPrdModePlan(planText)) {
      const m1 = receipt.meta;
      m1.intent_section_present = false;
      m1.intent_items_count = null;
      m1.intent_reference_injected = false;
      m1.intent_gate_verdict = 'skipped';
      m1.intent_skip_proof = 'free_form_plan';
      m1.intent_plan_digest = receipt.plan_hash;
      m1.intent_run_nonce = null;
      m1.intent_adjudication_counts = null;
      m1.intent_gate_force_override = false;
      m1.intent_gate_force_override_reason = null;
      return;
    }

    // DD6 — the audited override is the ONE way to write an in-scope receipt
    // without the runner. It unblocks the RUN, never the RECORD: the receipt
    // seals verdict='incomplete' so cross-gate dedupe stays fail-closed and the
    // audit corpus stays honest about what actually happened.
    const overrideReason = parseIntentGateSkipReason(process.env);
    if (overrideReason) {
      const v = validateReason(overrideReason, { strict: true });
      if (!v.ok) {
        const e = new Error(
          'MCCP_SKIP_INTENT_GATE rejected (' + v.reason + '): a substantive reason ' +
          '(≥30 chars, ≥3 words, no placeholder/URL-only/banlist token) is required.');
        e.code = 'INTENT_GATE_BLOCKED';
        throw e;
      }
      const m0 = receipt.meta;
      m0.intent_section_present = false;
      m0.intent_items_count = null;
      m0.intent_reference_injected = false;
      m0.intent_gate_verdict = 'incomplete';
      m0.intent_skip_proof = null;
      m0.intent_plan_digest = null;
      m0.intent_run_nonce = null;
      m0.intent_adjudication_counts = null;
      m0.intent_gate_force_override = true;
      m0.intent_gate_force_override_reason = overrideReason;
      process.stderr.write('[mccp:intent-gate] audited override active — receipt seals ' +
        'intent_gate_verdict=incomplete (dedupe stays fail-closed)\n');
      return;
    }

    const err = new Error(
      'gate ' + gateId + ' is in scope for the intent gate but no intentDecision ' +
      'was supplied — failing closed (verdict=incomplete).\n' +
      'Recovery:\n' +
      '  1. Re-run `/mccp:plan <plan-path>` so plan-codex-runner.js performs the ' +
      'review and writes this receipt itself (the supported path); OR\n' +
      '  2. Set MCCP_SKIP_INTENT_GATE="<substantive reason>" to proceed under an ' +
      'audited override (the real blocking verdict is still sealed in the receipt).\n' +
      'Writing this receipt directly via `cli.js write` cannot satisfy the gate: ' +
      'the intent decision has no CLI surface (see write.js#stampIntentDecision).');
    err.code = 'INTENT_GATE_BLOCKED';
    throw err;
  }

  if (!inScope) {
    const err = new Error(
      'intentDecision supplied for out-of-scope gate ' + gateId +
      ' — the intent gate governs ' + INTENT_IN_SCOPE_GATES.join(', ') + ' only (UI4).');
    err.code = 'INTENT_GATE_BLOCKED';
    throw err;
  }

  const m = receipt.meta;
  m.intent_section_present = d.section_present === true;
  m.intent_items_count = Number.isInteger(d.items_count) ? d.items_count : null;
  m.intent_reference_injected = d.reference_injected === true;
  m.intent_gate_verdict = typeof d.verdict === 'string' ? d.verdict : null;
  m.intent_skip_proof = typeof d.skip_proof === 'string' ? d.skip_proof : null;
  m.intent_plan_digest = typeof d.plan_digest === 'string' ? d.plan_digest : null;
  m.intent_run_nonce = typeof d.run_nonce === 'string' ? d.run_nonce : null;
  m.intent_adjudication_counts =
    (d.counts && typeof d.counts === 'object' && !Array.isArray(d.counts)) ? d.counts : null;
  m.intent_gate_force_override = d.force_override === true;
  m.intent_gate_force_override_reason =
    (typeof d.force_override_reason === 'string' && d.force_override_reason.length > 0)
      ? d.force_override_reason : null;

  // DD6 — the override unblocks the RUN, never the record. The receipt seals
  // the real verdict so cross-gate dedupe stays fail-closed downstream.
  if (d.runtime_allowed === false) {
    const err = new Error(
      'intent gate is blocking (verdict=' + m.intent_gate_verdict + '): ' +
      (d.reason || 'no reason supplied') + '\n' +
      'Recovery:\n' +
      '  1. Fix the adjudication/User Intent section and re-run `/mccp:plan <plan-path>`; OR\n' +
      '  2. Set MCCP_SKIP_INTENT_GATE="<substantive reason>" for an audited override.');
    err.code = 'INTENT_GATE_BLOCKED';
    throw err;
  }
}

function buildReceipt(args) {
  const gateId = args.gate || args['gate-id'];
  const decisionId = args.decision || args['decision-id'];
  const planPath = args.plan;

  if (!gateId) throw new Error('--gate is required');
  if (!decisionId) throw new Error('--decision is required');
  if (!planPath) throw new Error('--plan is required');
  if (GATE_IDS.indexOf(gateId) === -1) {
    throw new Error('invalid --gate "' + gateId + '"; must be one of: ' + GATE_IDS.join(', '));
  }

  const cwd = args.cwd || process.cwd();
  const repoRoot = gitRepoRoot(cwd);
  const dispatchCtx = detectDispatchContext(args, cwd);
  const phase = phaseFromGate(gateId);
  const planAbs = path.resolve(cwd, planPath);
  const planHash = planAwareMarkdownHash(planAbs);
  // codex-intent-context M1 — read once for the DD1 free-form proof in
  // stampIntentDecision. Unreadable → null, which keeps the in-scope path
  // fail-closed rather than silently granting a skip.
  let planText = null;
  try { planText = fs.readFileSync(planAbs, 'utf8'); } catch (_) { planText = null; }

  const designDocPaths = asArray(args['design-doc']);
  const designDocHash = designDocPaths.map(function (p) {
    const abs = path.resolve(cwd, p);
    return {
      path: relativeToRepo(abs, repoRoot),
      sha256: markdownHash(abs),
    };
  });

  const refs = gitRefs({ cwd: cwd, base: args.base });
  const branch = gitBranch(cwd);

  const findings = readJsonIfPresent(args['findings-file'], []);
  const defaultResolution = {
    converged: true,
    rounds: 1,
    accepted: [],
    rejected: [],
    open_questions: [],
  };
  const resolution = readJsonIfPresent(args['resolution-file'], defaultResolution);

  // v1.20.3 — codex_verdict (Option B). The real Codex adversarial-review
  // verdict is forwarded here so cross-gate dedupe checks the actual outcome
  // instead of resolution.converged (which defaults true). Present-only: when
  // --codex-verdict is absent the field is OMITTED (not set null) so legacy
  // receipts stay bit-identical and dedupe fail-closes on absence. subject_hash
  // excludes resolution, so identity is unaffected; receipt_hash includes it, so
  // the value is sealed for new receipts. Enum validation lives in schema.js.
  const codexVerdict = args['codex-verdict'];
  if (typeof codexVerdict === 'string' && codexVerdict.length > 0) {
    resolution.codex_verdict = codexVerdict;
  }

  const existing = readReceipt(repoRoot, gateId, decisionId);
  let round = args.round !== undefined ? parseInt(args.round, 10) : 1;
  if (args['auto-round'] && existing && Number.isInteger(existing.round)) {
    round = existing.round + 1;
  }

  const skipBypass = process.env.MCCP_SKIP_RECEIPT === '1';
  const skipped = args.skipped === true || skipBypass;
  let skipReason = args['skip-reason'] || null;
  if (skipBypass && !skipReason) skipReason = 'MCCP_SKIP_RECEIPT=1';

  const receipt = makeSkeleton({
    gate_id: gateId,
    phase: phase,
    decision_id: decisionId,
    task_id: args['task-id'] || null,
    plan_hash: planHash,
    design_doc_hash: designDocHash,
    base_sha: refs.baseSha,
    head_sha: refs.headSha,
    round: round,
    findings: findings,
    resolution: resolution,
    meta: {
      created_at: new Date().toISOString(),
      command: args.command || '/' + gateId,
      cwd: normalizeReceiptCwd(cwd, repoRoot),
      git_branch: branch,
      skipped: skipped,
      skip_reason: skipReason,
      codex_skipped: args['codex-skipped'] === true,
      advisory: args['advisory'] === true,
      security_skipped: args['security-skipped'] === true,
      security_skip_reason: args['security-skip-reason'] || null,
      security_force_override: args['security-force-override'] === true,
      security_force_override_reason: args['security-force-override-reason'] || null,
      impeccable_skipped: args['impeccable-skipped'] === true,
      impeccable_skip_reason: args['impeccable-skip-reason'] || null,
      impeccable_force_override: args['impeccable-force-override'] === true,
      impeccable_force_override_reason: args['impeccable-force-override-reason'] || null,
      // integrity-unification M3 — PR-Codex ship-gate audited override fields are
      // PRESENT-ONLY (santa-loop R2, Codex FAIL absorption): they are NOT part of the
      // always-materialized meta block. They are stamped after makeSkeleton below,
      // ONLY when the override is active, so a normal receipt omits them and its hash
      // stays pre-M3-identical (see the post-construction block near receipt_hash).
      // v1.3.0 design-gate enforcement M1 Task 1 — silent-skip surface.
      // Stamped by 4 command bodies (plan / prp-implement / pr / plan-prd) when
      // impeccable-detect returns SKILL_AVAIL=1 + SIGNAL=0 + design-surface
      // touched. Strict-gate validator (M1 Task 5) treats silent_skip=true as
      // blocking on mccp-implement-codex / mccp-pr-codex, unless the receipt
      // also carries impeccable_force_override=true (audited escape).
      impeccable_silent_skip: args['impeccable-silent-skip'] === true,
      impeccable_silent_skip_reason: args['impeccable-silent-skip-reason'] || null,
      // v0.2.8 Task 2.6.1 — PR-Codex audit axis.
      codex_dedupe_at_pr: args['codex-dedupe-at-pr'] === true,
      codex_skipped_at_pr: args['codex-skipped-at-pr'] === true,
      codex_skip_reason: (function () {
        // v0.3.5 — env-derived disabled overrides any user-supplied reason
        // because env policy is canonical. Explicit --codex-disabled or
        // MCCP_CODEX_DISABLED=1 → reason='codex_disabled'.
        if (args['codex-disabled'] === true || process.env.MCCP_CODEX_DISABLED === '1') {
          return 'codex_disabled';
        }
        return args['codex-skip-reason'] || null;
      })(),
      codex_review_actionable_findings: args['codex-actionable-findings'] === true,
      // v1.22.3 M3 follow-up (R1 F1 + F4) — scope-excluded pass + raw provenance.
      // codex_raw_verdict is present-only: absent flag → null, so a receipt never
      // implies a raw verdict was observed when none was forwarded.
      codex_scope_excluded_verdict: args['codex-scope-excluded-verdict'] === true,
      codex_raw_verdict: (typeof args['codex-raw-verdict'] === 'string'
        && args['codex-raw-verdict'].length > 0) ? args['codex-raw-verdict'] : null,
      // v0.3.5 Task 5 — env-level disabled honor + auto-stamp.
      // Env detection: process.env.MCCP_CODEX_DISABLED === '1' implicitly
      // stamps both codex_disabled=true. The --codex-disabled-at-pr flag is
      // explicit per-call opt-in (terminal /mccp:pr Phase 3.5 sets it after
      // codex-runner returns codex_outcome='disabled').
      codex_disabled: args['codex-disabled'] === true || process.env.MCCP_CODEX_DISABLED === '1',
      codex_disabled_at_pr: args['codex-disabled-at-pr'] === true,
      // v0.2.9 Task 5 — YAGNI triage DEFER_TO_BACKLOG counter. Additive, no schema bump.
      deferred_findings_count: (function () {
        const v = args['deferred-findings'];
        if (v === undefined || v === true || v === null) return 0;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      })(),
      // v0.3.6 Task 8 — Codex/impeccable scope audit axis (additive, optional).
      // Stamped by callers that go through codex-runner.js (PR step) or by
      // commands/plan.md + commands/prp-implement.md when those phases adopt
      // the same wire-up. Defaults are safe — receipts written without these
      // flags pass schema validation unchanged.
      codex_design_scope_excluded: args['codex-design-scope-excluded'] === true,
      design_findings_dropped: (function () {
        const v = args['design-findings-dropped'];
        if (v === undefined || v === true || v === null) return 0;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      })(),
      a11y_routed_to_impeccable: args['a11y-routed-to-impeccable'] === true,
      // v1.13.0 M3 — a11y-architect auto-invoked at PR gate.
      a11y_auto_invoked: args['a11y-auto-invoked'] === true,
      dropped_findings_digest: (function () {
        const v = args['dropped-findings-digest'];
        if (typeof v === 'string' && v.length > 0) return v;
        return null;
      })(),
      // v0.4.0 axis H — advisory stamp set by /mccp:prp-implement Phase 3
      // when plan-conflict-detector escalated. Does NOT block downstream
      // validators; the blocking surface is STATE.md.chain_aborted.
      plan_conflict_escalated: args['plan-conflict-escalated'] === true,
      // v1.0.1 axis K — guard hook orphan-lock reclaim audit. Stamped by
      // finalize-receipt when it found a stale-reclaim marker dropped by
      // pr-phase-guard's lockActive(). Additive boolean, default false.
      pr_phase_lock_stale_reclaimed_at_hook:
        args['pr-phase-lock-stale-reclaimed-at-hook'] === true,
      // v1.2.0-m1 Task 6 — controller-worker attribution axis. detectDispatchContext
      // enforces the all-or-nothing invariant and throws DISPATCH_MARKER_MISSING_FIELDS
      // (exit 12 in cli) if the marker is detected but flags are missing.
      controller_context_marker_present: dispatchCtx.marker,
      dispatched_by_controller_session_id: dispatchCtx.session_id,
      worker_dispatch_id: dispatchCtx.dispatch_id,
      ipc_envelope_path: dispatchCtx.envelope_path,
      // v1.3.0-m2 — design-critique retry-loop audit axis. 4 fields, all optional.
      // Stamped by plan.md Phase 5.0 retry loop + prp-implement.md / plan-prd.md
      // mirrors (rounds + verdict + intent_reason) and by pr.md Phase 1.6 audited
      // escape (pr_design_chain_skip_reason). schema.js enforces strict reason
      // validator on the two reason fields when present.
      design_critique_rounds: (function () {
        const v = args['design-critique-rounds'];
        if (v === undefined || v === true || v === null) return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
      })(),
      design_critique_verdict: (function () {
        const v = args['design-critique-verdict'];
        if (typeof v === 'string' && v.length > 0) return v;
        return null;
      })(),
      design_intent_reason: (function () {
        const v = args['design-intent-reason'];
        if (typeof v === 'string' && v.length > 0) return v;
        return null;
      })(),
      pr_design_chain_skip_reason: (function () {
        const v = args['pr-design-chain-skip-reason'];
        if (typeof v === 'string' && v.length > 0) return v;
        return null;
      })(),
      // v1.13.0 — stage-aware impeccable command routing audit. routing-mode is
      // a plain string flag; commands-routed carries structured per-command
      // outcome objects so it rides the JSON file channel (mirror findings-file)
      // rather than a comma-separated string (Codex Plan-Codex R1 F3).
      impeccable_routing_mode: (function () {
        const v = args['impeccable-routing-mode'];
        if (typeof v === 'string' && v.length > 0) return v;
        return null;
      })(),
      impeccable_commands_routed: (function () {
        const p = args['impeccable-commands-routed-file'];
        if (typeof p !== 'string' || p.length === 0) return null;
        const arr = readJsonIfPresent(p, null);
        return Array.isArray(arr) ? arr : null;
      })(),
      // v1.18.21 design-grounding — gate-time captured boolean + (optionally,
      // at write-time) verdict. The verdict is normally null at the initial
      // 2.5.6 write (post-EXECUTE only) and set later via restampGroundingVerdict,
      // but we honor an explicit --design-grounding-verdict here too for tests
      // and one-shot writes.
      design_grounding_captured: args['design-grounding-captured'] === true,
      design_grounding_verdict: (function () {
        const v = args['design-grounding-verdict'];
        if (typeof v === 'string' && v.length > 0) return v;
        return null;
      })(),
      // workflow-orchestration M3 — aggregate adversarial-verify audit. Stamped on
      // the mccp-implement-verify gate by the Step 3 controller (verify.js verdict
      // + round count). Present-only; null when the gate is not exercised.
      merged_verify_verdict: (function () {
        const v = args['merged-verify-verdict'];
        if (typeof v === 'string' && v.length > 0) return v;
        return null;
      })(),
      merged_verify_rounds: (function () {
        const v = args['merged-verify-rounds'];
        if (v === undefined || v === true || v === null) return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
      })(),
    },
  });

  // integrity-unification M3 (santa-loop R2, Codex FAIL absorption) — PRESENT-ONLY
  // PR-Codex audited-override fields. Materialize them ONLY when the override is
  // active. A normal receipt therefore omits both keys entirely, so its canonical
  // receipt_hash is bit-identical to a pre-M3 receipt (which also lacked them). This
  // keeps the now git-tracked ship-receipt corpus (§3.12) hash-stable: a new audit
  // field must never perturb the hash of receipts that do not exercise it, or an
  // idempotent re-write of a pre-M3 tracked receipt would trip store.js
  // TRACKED_RECEIPT_OVERWRITE. NOT a hash carve-out (unlike briefing_*) — when
  // present the field IS hashed, so override=true stays tamper-protected. schema.js
  // re-runs the strict reason validator on write, so a bad reason REJECTs.
  if (args['pr-codex-force-override'] === true) {
    receipt.meta.pr_codex_force_override = true;
    receipt.meta.pr_codex_force_override_reason =
      (typeof args['pr-codex-force-override-reason'] === 'string'
        && args['pr-codex-force-override-reason'].length > 0)
        ? args['pr-codex-force-override-reason'] : null;
  }

  stampIntentDecision(receipt, args, gateId, planText);

  receipt.subject_hash = subjectHash(receipt);
  receipt.receipt_hash = receiptHash(receipt);

  const result = validate(receipt);
  if (!result.ok) {
    const err = new Error('receipt schema validation failed:\n  - ' + result.errors.join('\n  - '));
    err.code = 'SCHEMA_INVALID';
    err.errors = result.errors;
    throw err;
  }

  return { repoRoot: repoRoot, receipt: receipt };
}

// v0.3.2 / S12 — derive a short escalation summary from the detector result.
function deriveEscalateSummary(det) {
  if (det.trigger === 'auto_critical_catalog' && det.criticalCategory) {
    return 'CRITICAL: ' + det.criticalCategory + ' (auto-catalog match)';
  }
  if (det.trigger === 'finding_critical') {
    const first = det.evidence.findingsCritical[0];
    const area = first && first.area ? ' (' + first.area + ')' : '';
    return 'CRITICAL finding' + area;
  }
  if (det.trigger === 'divergent_unresolved') {
    return 'divergent unresolved (rounds >= 3)';
  }
  return 'escalation triggered';
}

// v0.3.2 / S12 — derive task_fingerprint from STATE.md if available; fallback
// to '<receipt-escalate>' so the fix-task is still identifiable.
function deriveFingerprint(repoRoot, fallback) {
  try {
    const st = stateWriter.readState(repoRoot);
    const fp = st && st.frontmatter && st.frontmatter.task_fingerprint;
    if (fp && fp !== 'unknown') return fp;
  } catch (_) { /* ignore */ }
  return fallback || '<receipt-escalate>';
}

// v0.3.2 / S12 — cross-gate escalate trigger. Fires after writeReceipt.
// Fail-open invariant: any exception inside this function is caught + logged
// (loud stderr) but never propagates to write(). The receipt MUST be written
// regardless of detector outcome.
function triggerEscalateIfNeeded(repoRoot, receipt, receiptPath) {
  const det = escalateDetector.detectFromReceipt(receipt);
  if (det.escalate) {
    // fix-task.md / fix-task-applied.md are git-tracked (CLAUDE.md §3.2), so the
    // recorded path must be repo-relative. writeReceipt returns an absolute one,
    // which pinned the operator's machine + worktree into a committed file and
    // broke on every other clone. Matches the convention already visible in the
    // file's own earlier entries.
    const relReceiptPath = path.relative(repoRoot, receiptPath).split(path.sep).join('/');
    fixTask.writeOrAppend(repoRoot, {
      verdict: det.verdict,
      escalate: true,
      taskFingerprint: deriveFingerprint(repoRoot, receipt.decision_id),
      decisionId: receipt.decision_id,
      codexSummary: deriveEscalateSummary(det),
      originalPrompt: '<gate-receipt:' + receipt.gate_id + '/' + receipt.decision_id + '>',
      originatingReceipts: [relReceiptPath],
    });
    stateWriter.update(repoRoot, {
      escalate_pending: true,
      escalate_pending_decision_id: receipt.decision_id,
    });
    process.stderr.write('[mccp:escalate] ' + det.trigger + ' detected in ' +
      receipt.gate_id + '/' + receipt.decision_id +
      ' — see .claude/state/fix-task.md\n');
    return;
  }
  // Reverse path: clear escalate_pending if the prior alarm referenced this
  // same decision_id (santa-loop convergence + clean receipt → clear).
  const existing = stateWriter.readState(repoRoot);
  if (existing.frontmatter.escalate_pending === true &&
      existing.frontmatter.escalate_pending_decision_id === receipt.decision_id) {
    stateWriter.update(repoRoot, {
      escalate_pending: false,
      escalate_pending_decision_id: null,
    });
    process.stderr.write('[mccp:escalate] cleared for ' +
      receipt.gate_id + '/' + receipt.decision_id +
      ' (subsequent clean receipt)\n');
  }
}

function write(args) {
  const built = buildReceipt(args);
  const p = writeReceipt(built.repoRoot, built.receipt);
  try {
    triggerEscalateIfNeeded(built.repoRoot, built.receipt, p);
  } catch (err) {
    process.stderr.write('[mccp:escalate] detector failed: ' +
      (err && err.message ? err.message : err) + ' (allow)\n');
  }
  // v1.3.0-m2 — briefing stamp. Fires AFTER escalate so the receipt's audit
  // trail captures escalation events first. triggerBriefing has its own
  // fail-open invariant; this outer try is the belt-and-suspenders safety
  // net so even a module-load failure cannot poison receipt write.
  try {
    briefing.triggerBriefing(built.repoRoot, built.receipt, p);
  } catch (err) {
    process.stderr.write('[mccp:briefing] outer catch: ' +
      (err && err.message ? err.message : err) + ' (allow)\n');
  }
  // Dashboard Truthfulness M1 — completion-ledger append. Fires AFTER briefing
  // so the receipt's audit trail is settled, BEFORE render-trigger so the
  // freshly-written ledger entry is reflected in the re-rendered STATUS.md.
  // triggerLedgerAppend has its own fail-open invariant; this outer try is the
  // belt-and-suspenders net (lazy-require → staged install missing
  // lib/completion-ledger/ cannot poison receipt write).
  try {
    require('../lib/completion-ledger').triggerLedgerAppend(
      built.repoRoot, built.receipt, p, { planPath: args.plan });
  } catch (err) {
    process.stderr.write('[mccp:completion-ledger] outer catch: ' +
      (err && err.message ? err.message : err) + ' (allow)\n');
  }
  // v1.3.0-m4 — STATUS.md/status.html re-render trigger. Lazy-require so a
  // staged install missing lib/renderer/ does not break receipt write.
  // triggerRender is itself loud fail-open; the outer try here only catches
  // module-load failures.
  try {
    require('../lib/renderer/trigger').triggerRender('receipt-write', {
      repoRoot: built.repoRoot,
    });
  } catch (err) {
    process.stderr.write('[mccp:receipt-write] post-write trigger threw (allow): ' +
      (err && err.message ? err.message : err) + '\n');
  }
  return { path: p, receipt: built.receipt };
}

// v1.18.21 design-grounding (Codex Implement-R1 F3) — field-preserving restamp.
//
// The post-EXECUTE grounding verdict is known only AFTER the per-task loop, but
// the implement-codex receipt was already written at Phase 2.5.6. A plain
// re-write via buildReceipt() rebuilds a FRESH skeleton from flags and would
// DROP every field not re-passed (design_critique_*, routing, attribution,
// future additive meta). So instead we read the existing receipt, mutate ONLY
// meta.design_grounding_verdict, recompute both digests (the verdict is NOT
// carved out of receipt_hash → it stays tamper-protected), validate, and write
// back. Everything else is preserved by construction.
const VALID_GROUNDING_VERDICTS =
  ['grounded', 'anchor_clean', 'inconclusive', 'violations', 'skipped'];

function restampGroundingVerdict(args) {
  const gateId = args.gate || args['gate-id'];
  const decisionId = args.decision || args['decision-id'];
  const verdict = args['design-grounding-verdict'] || args.verdict;

  if (!gateId) throw new Error('--gate is required');
  if (!decisionId) throw new Error('--decision is required');
  if (GATE_IDS.indexOf(gateId) === -1) {
    throw new Error('invalid --gate "' + gateId + '"; must be one of: ' + GATE_IDS.join(', '));
  }
  if (VALID_GROUNDING_VERDICTS.indexOf(verdict) === -1) {
    throw new Error('--design-grounding-verdict must be one of: ' +
      VALID_GROUNDING_VERDICTS.join(', '));
  }

  const cwd = args.cwd || process.cwd();
  const repoRoot = gitRepoRoot(cwd);

  // multi-session-work-loop M3 — the read, the mutation and the write are now a
  // single critical section (`store.updateReceipt`). The previous shape read via
  // readReceipt and wrote via writeReceipt, so a concurrent write landing between
  // the two was silently reverted. This restamp recomputes receipt_hash (the
  // verdict is NOT hash-carved), so a lost update here would resurrect a stale
  // seal — exactly the class §3.12 protects.
  const out = updateReceipt(repoRoot, gateId, decisionId, function (existing) {
    existing.meta = existing.meta || {};
    // Mutate ONLY the grounding verdict. Backfill captured=false on a legacy
    // receipt so the present-only validator stays happy; never overwrite a
    // gate-time captured=true.
    if (existing.meta.design_grounding_captured === undefined) {
      existing.meta.design_grounding_captured = false;
    }
    existing.meta.design_grounding_verdict = verdict;

    // subject_hash excludes meta (hash.js SUBJECT_FIELDS), so it is unchanged —
    // recompute defensively. receipt_hash DOES include the verdict (not carved
    // out), so recomputing seals the new value.
    existing.subject_hash = subjectHash(existing);
    existing.receipt_hash = receiptHash(existing);

    const result = validate(existing);
    if (!result.ok) {
      const err = new Error('restamp grounding verdict validation failed:\n  - ' +
        result.errors.join('\n  - '));
      err.code = 'SCHEMA_INVALID';
      err.errors = result.errors;
      throw err;
    }
    return existing;
  });
  return { path: out.path, receipt: out.receipt };
}

module.exports = {
  write: write,
  buildReceipt: buildReceipt,
  // Exported for tests + downstream callers that want the detector path
  // without going through writeReceipt (e.g., dry-run preview).
  triggerEscalateIfNeeded: triggerEscalateIfNeeded,
  deriveEscalateSummary: deriveEscalateSummary,
  restampGroundingVerdict: restampGroundingVerdict,
  normalizeReceiptCwd: normalizeReceiptCwd, // Task A3 — tested in cwd-normalization.test.js
};
