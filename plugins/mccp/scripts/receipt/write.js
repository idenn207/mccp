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
const { parseSinglePass, REASONS: SINGLE_PASS_REASONS } = require('../lib/review-single-pass');
const { phaseFromGate } = require('./aliases');
const { writeReceipt, readReceipt, updateReceipt, receiptPath } = require('./store');
const escalateDetector = require('../lib/escalate-detector');
const fixTask = require('../state/fix-task');
const stateWriter = require('../state/state-writer');
const briefing = require('../lib/briefing');
const envValue = require('../lib/env-contract/value');

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

// env-contract-integrity M3 — `resolution.rounds` stops being a literal.
//
// Before M3 `defaultResolution.rounds` was the number 1 and no CLI flag could
// change it (`--rounds` does not exist; the only override, `--resolution-file`, is
// documented in receipt-write.md and passed by none of the three gates). So a
// receipt sealed `rounds: 1` after a measured 15+ rounds — the author's narrative
// and the sealed fact were the same literal, which is to say the field carried no
// information at all.
//
// The ledger is keyed by (gate id, decision slug), and this command already
// receives BOTH as flags — so unlike the two enforcement chokepoints it does not
// need the seal to find the key. It reads the seal only for the cap metadata, and
// that is precisely what makes `round_cap: null` meaningful: no usable seal means
// this run was never enrolled, which means enforcement did not run, which means
// the count beside it is not authoritative. That pairing is how a degraded run
// stays auditable in the receipt instead of only in stderr (Implement-Codex R1 F3).
function readRoundLedgerState(opts) {
  const out = { available: false, count: null, cap: null, pinnedBy: null };
  let ledger;
  let seal;
  try {
    ledger = require('../lib/review-rounds/ledger');
    seal = require('../lib/review-rounds/seal');
  } catch (_err) {
    return out;                     // this build has no round-ledger axis: omit the fields
  }
  out.available = true;

  try {
    // repoRoot is forwarded because buildReceipt already resolved it: `gitRepoRoot`
    // spawns `git rev-parse` (546ms/call measured on Windows) and re-deriving it
    // here charged every single receipt write for a second identical spawn.
    out.count = ledger.count({
      gateId: opts.gateId, decisionId: opts.decisionId, cwd: opts.cwd,
      repoRoot: opts.repoRoot,
    });
  } catch (err) {
    // null, never 0. Reading a corrupt ledger as "zero rounds" would silently
    // reset the cap and seal that reset as a fact.
    process.stderr.write('[mccp:receipt-write] round ledger unreadable (' +
      (err && err.message ? err.message : String(err)) +
      ') — sealing meta.round_ledger_count=null\n');
  }

  try {
    const observed = seal.readCap({ gitDir: seal.resolveGitDir(opts.cwd || process.cwd()) });
    if (observed.reason === 'ok') {
      out.cap = observed.cap;
      out.pinnedBy = observed.pinnedBy;
    }
  } catch (_err) { /* no usable seal → cap stays null, which is the honest report */ }

  return out;
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

  const markerByEnv = envValue.parseBool(process.env, 'MCCP_DISPATCH_CONTEXT');
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
// M1.5 — the two direct-write exits below stamp the M1 axis and return without
// ever reaching the runner, so they have to null the mislabel axis explicitly.
// Leaving the keys off instead would break the contract the schema states —
// "absent means this receipt predates the field" — because a receipt written
// today would also be missing them, and nobody reading it later could tell the
// two apart.
//
// null, not the configured mode: on these paths no reviewer ran and no claim was
// ever parsed, so there is no mode that this gate executed under. Recording one
// would assert an execution that did not happen.
function nullMislabelAxis(meta) {
  meta.intent_mislabel_mode = null;
  meta.intent_reviewer_contract = null;
  meta.intent_claim_counts = null;
  meta.intent_claims_digest = null;
  meta.intent_mislabel_disputes = null;
  meta.intent_mislabel_audit = null;
  // M2 — same reasoning one axis over: these two exits never reach the runner, so
  // no arbiter of any kind adjudicated anything. Writing the requested mode here
  // would claim a judgement that was never asked for; leaving the keys OFF would
  // make a receipt written today indistinguishable from one that predates M2.
  meta.intent_arbiter = null;
  meta.intent_arbiter_degraded_reason = null;
}

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
      nullMislabelAxis(m1);
      return;
    }

    // diverse-agent-review M1 — the L1+L2 review panel path. Same shape as the
    // DD1 free-form carve-out above and for the same reason: the gate genuinely
    // does not apply, and that is not a judgement call but a MECHANICAL fact
    // read off the receipt this call is about to seal. `review_source` is not
    // caller-assertable here — the review_* triple is all-or-nothing (DD11), the
    // proof was structurally validated, and a receipt claiming 'multi-agent'
    // while also carrying a codex_verdict is rejected outright a few dozen lines
    // up. So 'multi-agent' IS proof that Codex never spoke on this decision, and
    // a reviewer that never ran cannot have produced findings to adjudicate.
    //
    // This grants nothing to dedupe. crossModelConverged (DD2) already refuses a
    // panel receipt as cross-model corroboration on the review axis, so PR-Codex
    // still fires at the ship point no matter what the intent axis says here.
    //
    // 'hybrid' is deliberately EXCLUDED: there L3 fired, meaning Codex did speak,
    // so its findings owe the same adjudication as the legacy path and must go
    // through the runner (or the audited override below). Falling through is the
    // fail-closed answer, not an oversight.
    //
    // KNOWN GAP (M1.5): the panel does not receive the <user_intent_reference>
    // injection and does not adjudicate its own findings against user intent. The
    // intent gate is skipped for panel runs, not satisfied by them. Extending the
    // gate to the panel reviewers is tracked as follow-up work.
    if (receipt.resolution && receipt.resolution.review_source === 'multi-agent') {
      const mp = receipt.meta;
      mp.intent_section_present = false;
      mp.intent_items_count = null;
      mp.intent_reference_injected = false;
      mp.intent_gate_verdict = 'skipped';
      mp.intent_skip_proof = 'codex_not_invoked';
      mp.intent_plan_digest = receipt.plan_hash;
      mp.intent_run_nonce = null;
      mp.intent_adjudication_counts = null;
      mp.intent_gate_force_override = false;
      mp.intent_gate_force_override_reason = null;
      nullMislabelAxis(mp);
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
      nullMislabelAxis(m0);
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
      'the intent decision has no CLI surface (see write.js#stampIntentDecision).\n' +
      'If you got here on MCCP_PLAN_REVIEW=hybrid: that is expected. L3 means Codex ' +
      'DID review this plan, so its findings owe the same adjudication as the legacy ' +
      'path — only review_source="multi-agent" (Codex never ran) skips the gate.');
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

  // M1.5 — the mislabel axis. Six present-only fields, stamped from the same
  // programmatic-only object (there is still no `--intent-*` CLI flag, which is
  // what keeps a shell caller from minting an approving verdict).
  //
  // `mode` is sealed even when the axis produced nothing, because "which path
  // actually ran" must stay readable after the fact. The rest stay null under
  // `off`, which reads the same as a direct-write receipt: "no mislabel
  // judgement was made". What null must NOT be confused with is ABSENCE — every
  // current in-scope path writes all six keys (the two early exits do it via
  // nullMislabelAxis), so a missing key is left to mean exactly one thing, which
  // is what the schema's present-only contract says it means.
  m.intent_mislabel_mode =
    (typeof d.mislabel_mode === 'string') ? d.mislabel_mode : null;
  m.intent_reviewer_contract =
    (typeof d.reviewer_contract === 'string') ? d.reviewer_contract : null;
  m.intent_claim_counts =
    (d.claim_counts && typeof d.claim_counts === 'object' && !Array.isArray(d.claim_counts))
      ? d.claim_counts : null;
  m.intent_claims_digest =
    (typeof d.claims_digest === 'string') ? d.claims_digest : null;
  m.intent_mislabel_disputes =
    Number.isInteger(d.mislabel_disputes) ? d.mislabel_disputes : null;
  m.intent_mislabel_audit = Array.isArray(d.mislabel_audit) ? d.mislabel_audit : null;

  // M2 — the arbiter axis. The runner resolves both values through the single
  // resolveArbiterSeal oracle, so this really is a stamp: there is no branch here
  // that could disagree with what that oracle decided. The reason is pairwise
  // constrained by schema.js, which is what stops a caller from sealing a
  // justification for a fallback that never applied.
  m.intent_arbiter = (typeof d.arbiter === 'string') ? d.arbiter : null;
  m.intent_arbiter_degraded_reason =
    (typeof d.arbiter_degraded_reason === 'string' && d.arbiter_degraded_reason.length > 0)
      ? d.arbiter_degraded_reason : null;

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

  // env-contract-integrity M3 (DD8 · DD9) — derive rounds from the ledger.
  //
  // Only when the ledger holds at least one round. `schema.js` requires
  // `rounds >= 1`, so an empty ledger cannot be written as 0 without relaxing
  // that rule, and relaxing it is a separate axis. Nothing is lost: "Codex was
  // disabled so nobody answered" is already carried by
  // `resolution.codex_verdict='skipped'`, and the true count (0 included) is
  // sealed in `meta.round_ledger_count` below.
  const roundState = readRoundLedgerState({
    gateId: gateId, decisionId: decisionId, cwd: cwd, repoRoot: repoRoot,
  });
  const explicitRounds = (args['resolution-file'] &&
    Object.prototype.hasOwnProperty.call(resolution, 'rounds'))
    ? resolution.rounds
    : null;
  if (Number.isInteger(roundState.count) && roundState.count >= 1) {
    // DD9 — an explicit --resolution-file that disagrees with the ledger is
    // fail-closed, not silently overridden. Quietly preferring the ledger would
    // achieve the goal (separating the sealed fact from the author's narrative)
    // while erasing the observable event: the author believed a different number.
    if (explicitRounds !== null && explicitRounds !== roundState.count) {
      const err = new Error(
        '--resolution-file declares rounds=' + JSON.stringify(explicitRounds) +
        ' but the round ledger for ' + gateId + '__' + decisionId + ' records ' +
        roundState.count + '. Refusing to seal a receipt whose round count ' +
        'contradicts the ledger. Either drop `rounds` from the resolution file ' +
        '(the ledger is the single source of truth) or explain the divergence ' +
        'before re-running.');
      err.code = 'ROUND_LEDGER_MISMATCH';
      throw err;
    }
    resolution.rounds = roundState.count;
  }

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

  // diverse-agent-review M1 — review_* triple. Present-only like codex_verdict
  // above, but with two hard invariants enforced HERE, before anything reaches
  // disk. schema.js repeats both; this is the earlier of the two walls and the
  // one that guarantees a rejected write leaves no partial artifact behind.
  //
  // DD11 all-or-nothing: supplying any one of the three requires all three.
  // A partial stamp is the single scenario where BOTH dedupe belts fail at once
  // — resolveEffectiveVerdict would report `unavailable`, but a receipt that is
  // unreadable by construction should never have been persisted in the first
  // place. Mirrors detectDispatchContext's 3-flag invariant.
  //
  // DD13 bind: the proof must name the plan version the reviewers actually read.
  // planHash above was computed from the plan ON DISK moments ago; if the proof
  // names a different one, the plan was edited between review and seal and the
  // approval does not describe what we are about to seal. The recovery is to
  // rerun L2, never to reseal — this is the same judgement v1.22.6 M2 made when
  // it promoted subject_hash mismatch from stale to tamper.
  const reviewVerdict = args['review-verdict'];
  const reviewSource = args['review-source'];
  const reviewProofFile = args['review-proof-file'];
  const nonEmpty = function (v) { return typeof v === 'string' && v.length > 0; };

  // santa-loop R3 (Codex GPT-5.4) — a plan-gate receipt must carry a verdict axis.
  //
  // The failure this closes: a panel run whose decision.json was malformed forwards
  // no review_* triple (the all-or-nothing guard above turns a partial stamp into
  // NO stamp) and, in a panel mode, no --codex-verdict either. The receipt then
  // lands with neither axis and `resolution.converged: true` — the defaultResolution
  // literal a few dozen lines up. resolveEffectiveVerdict answers axis:'none', which
  // means receipt-convergence.js skips its strict review branch and falls through to
  // `resolution.converged === true`. A run that approved NOTHING reads as converged.
  //
  // The gate is keyed on --review-mode, NOT on "gate === mccp-plan-codex && no
  // axis". The broader form was tried first and was wrong: a verdict-less plan
  // receipt turns out to be ordinary across the corpus (advisory paths, skipped
  // gates, manual recovery), so requiring an axis unconditionally broke ~30 tests
  // including the e2e dogfood chain. The sample that suggested otherwise was two
  // receipts on disk — too small to generalise from, and the suite said so.
  //
  // What is NEVER legitimate is narrower: a PANEL run that stamps no triple. Only
  // the caller knows it ran a panel, so it says so. mode.json is written at Phase
  // 5.2 entry, before anything downstream can corrupt it, which makes the mode the
  // one fact still trustworthy when decision.json is not.
  //
  // Omitting the flag reproduces the old behaviour exactly — that is the
  // no-regression property, and it is also this check's limit: it cannot catch a
  // caller that forgets to pass it. 5.6 Step A HALTs on the same condition for that
  // reason. Two layers, neither sufficient alone.
  const reviewMode = args['review-mode'];
  if ((reviewMode === 'multi-agent' || reviewMode === 'hybrid') &&
      !nonEmpty(reviewVerdict) && !nonEmpty(reviewSource) && !nonEmpty(reviewProofFile)) {
    const err = new Error(
      '--review-mode=' + reviewMode + ' declares a review-panel run, but no ' +
      '--review-verdict/--review-source/--review-proof-file triple was supplied. ' +
      'resolution.converged defaults to true and resolveEffectiveVerdict would ' +
      'answer axis:"none", so this receipt would read as CONVERGED while recording ' +
      'no approval at all. If the panel decision artifact is unreadable, re-run L2 — ' +
      'do not seal a receipt for a review whose outcome is unknown.');
    err.code = 'REVIEW_STAMP_INVALID';
    throw err;
  }

  if (nonEmpty(reviewVerdict) || nonEmpty(reviewSource) || nonEmpty(reviewProofFile)) {
    const missing = [];
    if (!nonEmpty(reviewVerdict)) missing.push('--review-verdict');
    if (!nonEmpty(reviewSource)) missing.push('--review-source');
    if (!nonEmpty(reviewProofFile)) missing.push('--review-proof-file');
    if (missing.length > 0) {
      const err = new Error(
        'review_* stamping is all-or-nothing (DD11): missing ' + missing.join(', ') +
        '. A partially stamped receipt must not reach disk — supply all three or none.');
      err.code = 'REVIEW_STAMP_INVALID';
      throw err;
    }

    // Read directly rather than via readJsonIfPresent: that helper throws a
    // generic Error on a missing file, and a generic error would exit 1 instead
    // of the fail-closed 12 this path owes its caller.
    let proof = null;
    try {
      proof = JSON.parse(fs.readFileSync(path.resolve(cwd, reviewProofFile), 'utf8'));
    } catch (e) {
      const err = new Error(
        '--review-proof-file is missing or unreadable: ' + reviewProofFile + ' (' +
        (e && e.message ? e.message : String(e)) +
        '). The proof is the evidence for the verdict; without it there is nothing to seal.');
      err.code = 'REVIEW_STAMP_INVALID';
      throw err;
    }
    if (proof === null || typeof proof !== 'object' || Array.isArray(proof)) {
      const err = new Error(
        '--review-proof-file is not a JSON object: ' + reviewProofFile);
      err.code = 'REVIEW_STAMP_INVALID';
      throw err;
    }

    if (reviewSource === 'multi-agent' && nonEmpty(resolution.codex_verdict)) {
      const err = new Error(
        'contradictory receipt: review_source="multi-agent" asserts Codex did not ' +
        'issue this approval, but codex_verdict="' + resolution.codex_verdict +
        '" is also present. Cross-gate dedupe reads the source to decide whether ' +
        'cross-model corroboration exists, so an ambiguous receipt must not exist. ' +
        'Forward --codex-verdict only when decideReview returns forwardCodexVerdict=true.');
      err.code = 'REVIEW_STAMP_INVALID';
      throw err;
    }

    if (nonEmpty(proof.reviewed_plan_hash) && proof.reviewed_plan_hash !== planHash) {
      const err = new Error(
        'plan changed after L2 reviewed it (DD13): proof binds ' +
        String(proof.reviewed_plan_hash).slice(0, 19) + '… but the plan on disk now ' +
        'hashes to ' + String(planHash).slice(0, 19) + '…. The review does not describe ' +
        'the artifact being sealed. Recovery: rerun the L2 review against the current ' +
        'plan — do NOT reseal, that would certify an unreviewed version.');
      err.code = 'REVIEW_STAMP_INVALID';
      throw err;
    }

    resolution.review_verdict = reviewVerdict;
    resolution.review_source = reviewSource;
    resolution.review_proof = proof;
  }

  const existing = readReceipt(repoRoot, gateId, decisionId);
  let round = args.round !== undefined ? parseInt(args.round, 10) : 1;
  if (args['auto-round'] && existing && Number.isInteger(existing.round)) {
    round = existing.round + 1;
  }

  const skipBypass = envValue.parseBool(process.env, 'MCCP_SKIP_RECEIPT');
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
        // v1.23.5 (gate-guard-integrity M1, fix B) — precedence FLIPPED: an
        // explicitly-supplied reason now wins over the env-derived canonical.
        //
        // Before, ambient MCCP_CODEX_DISABLED=1 overwrote a caller's audited
        // reason with the 14-char canonical 'codex_disabled'. On a standard
        // install that made the writer produce a receipt its OWN schema rejects:
        // codex_skipped_at_pr=true runs the strict validator (≥30 chars, ≥3
        // words), which the canonical literal cannot satisfy. The audited-escape
        // path was therefore unusable whenever the env var was set.
        //
        // This is the WRITER, not an observer. codex-runner.js:234-238 keeps the
        // opposite precedence on purpose, and that is right for it: it reports
        // what actually happened, so canonical operator policy wins there. A
        // writer must not overwrite the claim its own caller made.
        //
        // Narrower than `|| null`: a bare `--codex-skip-reason` with no value
        // parses to boolean true, which would fail schema's string|null check.
        const explicit = args['codex-skip-reason'];
        if (typeof explicit === 'string' && explicit.length > 0) return explicit;
        if (args['codex-disabled'] === true || envValue.parseBool(process.env, 'MCCP_CODEX_DISABLED')) {
          return 'codex_disabled';
        }
        return null;
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
      codex_disabled: args['codex-disabled'] === true || envValue.parseBool(process.env, 'MCCP_CODEX_DISABLED'),
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
        // v1.32.1 M6 — resolve against cwd BEFORE reading, mirroring how
        // --review-proof-file is read (:494) and what the restamp path already
        // does (:1211). Without this the argument is interpreted against
        // whatever the process happens to have as its working directory, which
        // is not necessarily the repo this write targets — so the same relative
        // path meant two different files depending on which entry point ran.
        const arr = readJsonIfPresent(path.resolve(cwd, p), null);
        if (!Array.isArray(arr)) return null;
        // Then hold the writer to the same canonical form the restamp path
        // enforces (:1223-1231). The asymmetry is deliberate: an ABSENT or
        // unreadable file still yields null ("not recorded" — the caller simply
        // did not route anything), whereas a file that IS present but malformed
        // is a disagreement between producer and consumer and must not reach
        // disk. Throwing is what the restamp path does for the identical input.
        return arr.map(function (e, i) {
          const c = canonicalRoutedEntry(e);
          if (c === null) {
            throw new Error('--impeccable-commands-routed-file entries[' + i +
              '] must be an object with exactly ' + ROUTED_ENTRY_KEYS.join('/') +
              ' (got: ' + (e && typeof e === 'object' && !Array.isArray(e)
                ? Object.keys(e).join(',') : typeof e) + ')');
          }
          return c;
        });
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
  // diverse-agent-review M1 — L3 instrumentation + gate wall-clock. Present-only
  // (absent keys on every receipt that never ran the review path) and NOT carved
  // out of receipt_hash: these are settled at write time and form part of the
  // approval record, unlike briefing_*, which is stamped after sealing and
  // therefore cannot hash itself.
  if (args['review-l3-invoked'] === true) {
    receipt.meta.review_l3_invoked = true;
  }
  if (typeof args['review-l3-reason'] === 'string' && args['review-l3-reason'].length > 0) {
    receipt.meta.review_l3_reason = args['review-l3-reason'];
  }
  if (args['review-wall-clock-ms'] !== undefined && args['review-wall-clock-ms'] !== null) {
    const ms = parseInt(args['review-wall-clock-ms'], 10);
    if (Number.isInteger(ms) && ms >= 0) receipt.meta.review_wall_clock_ms = ms;
  }

  // santa-loop-materialize M2 (DD4) — santa 원장 집계 4종의 조건부 재료화.
  // 값이 있을 때만 `receipt.meta.X = …`이므로 --santa-* 미전달 receipt는 키 자체를
  // 갖지 않고 canonical hash 입력이 무변동이다(makeSkeleton 미등록과 한 쌍).
  // 바로 위 review_l3_invoked 블록이 따라할 선례이고, merged_verify_* 는 아니다.
  const SANTA_INT_FIELDS = [
    ['santa-rounds', 'santa_rounds', 0],
    ['santa-entries', 'santa_entries', 0],
    ['santa-cap', 'santa_cap', 1],
    // santa-evidence-diversity M1 — 레인 커버리지 2종. 같은 조건부 재료화 규약이라
    // --santa-blind-* 미전달 receipt는 키 자체를 갖지 않고 canonical hash가 무변동이다.
    ['santa-blind-records', 'santa_blind_records', 0],
    ['santa-blind-rounds', 'santa_blind_rounds', 0],
    // santa-evidence-diversity M3 — FINAL 라운드의 distinct 모델 계열 수. 같은 조건부
    // 재료화 규약이고 0은 유효한 값이다(계열이 하나도 식별되지 않은 라운드 = 전원
    // unknown). 부재만이 "이 필드가 없던 시절"을 뜻한다.
    ['santa-model-families', 'santa_model_families', 0],
    // santa-delta-review M1 — 델타 스코프 관측 2종. 같은 조건부 재료화 규약이고 0은
    // 유효한 값이다: `MCCP_SANTA_DELTA_SCOPE=off` 실행이 `santa_delta_rounds=0`을
    // 남기는 것이 이 축의 dark-ship 관측 수단 전부다(DD12). **부재만이** "이 필드가
    // 없던 시절"을 뜻한다.
    ['santa-delta-rounds', 'santa_delta_rounds', 0],
    ['santa-delta-paths-dropped', 'santa_delta_paths_dropped', 0],
  ];
  SANTA_INT_FIELDS.forEach(function (spec) {
    const raw = args[spec[0]];
    if (raw === undefined || raw === null || raw === true) return;
    const n = parseInt(raw, 10);
    if (Number.isInteger(n) && n >= spec[2]) receipt.meta[spec[1]] = n;
  });
  if (typeof args['santa-exit-reason'] === 'string' && args['santa-exit-reason'].length > 0) {
    receipt.meta.santa_exit_reason = args['santa-exit-reason'];
  }

  // santa-evidence-diversity M3 — degrade 축 4종 (불리언 2 + 문자열 2).
  //
  // **미러 대상은 바로 위 `santa_exit_reason`과 `review_l3_invoked`이지 아래
  // `pr_codex_force_override`가 아니다** (security-reviewer F3). 그쪽 블록은 사유가
  // 없을 때 `null`을 **명시 저장**하는데, 그 모양을 복사하면
  // `santa_degrade_ack=true` + `santa_degrade_ack_reason=null`이 나와 schema.js가
  // 거는 양방향 불변식이 write 시점에 깨진다. 여기서는 두 키가 각자 자기 조건을
  // 갖고, 값이 없으면 **키 자체가 없다**.
  //
  // 불리언 2종은 `=== true`일 때만 stamp한다 — `false`를 명시 저장하면 부재와 뜻이
  // 겹치고, 그 겹침이 present-only 의미론의 전부를 무너뜨린다.
  if (args['santa-model-degraded'] === true) {
    receipt.meta.santa_model_degraded = true;
  }
  if (typeof args['santa-degrade-reason'] === 'string' && args['santa-degrade-reason'].length > 0) {
    receipt.meta.santa_degrade_reason = args['santa-degrade-reason'];
  }
  if (args['santa-degrade-ack'] === true) {
    receipt.meta.santa_degrade_ack = true;
  }
  if (typeof args['santa-degrade-ack-reason'] === 'string'
      && args['santa-degrade-ack-reason'].length > 0) {
    receipt.meta.santa_degrade_ack_reason = args['santa-degrade-ack-reason'];
  }

  if (args['pr-codex-force-override'] === true) {
    receipt.meta.pr_codex_force_override = true;
    receipt.meta.pr_codex_force_override_reason =
      (typeof args['pr-codex-force-override-reason'] === 'string'
        && args['pr-codex-force-override-reason'].length > 0)
        ? args['pr-codex-force-override-reason'] : null;
  }

  // ── review-loop-bypass M1 (Task 5) — 단일통과 토글의 두 축 ───────────────────
  //
  // 두 필드는 **서로 다른 축**이다(DD3 — §3.12의 `codex_disabled` 대
  // `codex_disabled_at_pr` 선례를 그대로 따른다):
  //
  //   review_single_pass_reason           env 정책의 **정직한 주석**. 이 게이트를
  //                                       부른 시점에 토글이 켜져 있었다.
  //   review_single_pass_bypassed_verdict **감사 축**. 토글이 실제로 blocking
  //                                       verdict를 강등시켰다. 명시 플래그 전용.
  //
  // 전자를 후자의 증거로 쓰면 안 된다. 토글이 켜진 채 완화를 **타지 않은** 경로도
  // 전자를 갖기 때문이고, ambient에서 적용 사실을 추론하는 것이 v1.23.5가 값을
  // 치르고 배운 바로 그 실패다.
  //
  // precedence는 **명시 > env**다(같은 v1.23.5 규약). writer는 caller가 *주장한*
  // 것을 기록하므로 그 주장을 env로 덮으면 안 된다 — 관찰자(runner)만 env를
  // canonical로 삼는다.
  //
  // 둘 다 present-only다: 값이 없으면 키 자체를 만들지 않는다. 그래야 기존 receipt
  // corpus의 canonical hash가 무변동이고, 키의 **존재**가 곧 신호가 된다.
  //
  // 명시 값은 여기서 enum을 검사한다. schema도 같은 검사를 하므로 안전성은 이미
  // 있었지만, 거기까지 가면 진단이 일반 SCHEMA_INVALID로 뭉개진다 — env 경로는
  // `parseSinglePass`가 "must be one of [...]"를 바로 말해 주는데 명시 경로만
  // 그러지 못하는 비대칭이었다. 검사 자체가 아니라 **어느 층이 먼저 말하는가**의
  // 문제이고, 값을 대는 사람에게 가까운 층이 말하는 편이 낫다.
  const singlePassExplicit = (typeof args['review-single-pass-reason'] === 'string'
    && args['review-single-pass-reason'].length > 0)
    ? args['review-single-pass-reason'] : null;
  if (singlePassExplicit !== null && SINGLE_PASS_REASONS.indexOf(singlePassExplicit) === -1) {
    const err = new Error(
      '--review-single-pass-reason must be one of: ' + SINGLE_PASS_REASONS.join(', ') +
      '; got ' + JSON.stringify(singlePassExplicit) + '. The value IS the reason, so an ' +
      'unrecognised one is not a typo to normalise — it is an unauditable claim.');
    err.code = 'REVIEW_STAMP_INVALID';
    throw err;
  }
  const singlePassReason = singlePassExplicit || parseSinglePass(process.env).reason;
  if (singlePassReason) {
    receipt.meta.review_single_pass_reason = singlePassReason;
  }
  if (args['review-single-pass-bypassed-verdict'] === true) {
    receipt.meta.review_single_pass_bypassed_verdict = true;
  }
  warnSinglePassChainDrift(repoRoot, gateId, receipt.decision_id, singlePassReason);

  // env-contract-integrity M3 — round-ledger audit, 3 present-only fields.
  //
  // NOT in `makeSkeleton` (the `pr_codex_force_override` precedent): adding keys
  // to the skeleton changes every receipt's hash input, and CLAUDE.md 3.12 keeps
  // the git-tracked ship corpus stable. Absence therefore means "this build had
  // no round-ledger axis", which is a third state distinct from the two below.
  //
  // The three read together:
  //   round_ledger_count  integer  the REAL count, 0 included — unlike
  //                                resolution.rounds, which schema.js forces >= 1
  //                       null     the ledger existed but could not be read
  //   round_cap           integer  a usable seal was found: enforcement RAN
  //                       null     no usable seal: enforcement did NOT run, and
  //                                the count beside it is not authoritative
  //   round_cap_pinned_by string   which axis pinned the cap to 1
  //                       null     nothing pinned it (the cap is the env value)
  if (roundState.available) {
    receipt.meta.round_ledger_count = roundState.count;
    receipt.meta.round_cap = roundState.cap;
    receipt.meta.round_cap_pinned_by = roundState.pinnedBy;
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

// DD8 — 체인 중간의 토글 변경은 **관측하되 차단하지 않는다**.
//
// 토글은 env라 게이트 사이에 켜고 끌 수 있다. 각 receipt가 자기 시점의 상태를
// 봉인하므로 불일치는 사후에 반드시 드러나지만, 그것만으로는 그때 알려주지 않는다.
// 값싼 절반을 취한다 — 선행 chain receipt와 어긋나면 loud stderr 한 줄.
//
// **전 chain 일치를 fail-closed로 강제하지 않는다.** 그러면 토글을 켜기 전에 chain
// 전체를 미리 계획하게 만들어, 이 토글이 없애려는 마찰을 다른 모양으로 되살린다
// (UI12의 "작업 단위 opt-in"과 어긋난다). 강제안은 backlog 소유다.
const REVIEW_CHAIN_ORDER = ['mccp-plan-codex', 'mccp-implement-codex', 'mccp-pr-codex'];

function warnSinglePassChainDrift(repoRoot, gateId, decisionId, currentReason) {
  const idx = REVIEW_CHAIN_ORDER.indexOf(gateId);
  if (idx <= 0) return;               // 선행 게이트가 없으면 대조 대상이 없다
  if (!repoRoot || !decisionId) return;

  let prior = null;
  for (let i = idx - 1; i >= 0 && !prior; i--) {
    let r = null;
    try { r = readReceipt(repoRoot, REVIEW_CHAIN_ORDER[i], decisionId); } catch (_) { r = null; }
    if (r && typeof r === 'object') prior = { gate: REVIEW_CHAIN_ORDER[i], receipt: r };
  }
  if (!prior) return;                 // 선행 receipt가 아직 없다 — 정상 상태

  const priorMeta = prior.receipt.meta;
  const priorReason = (priorMeta && typeof priorMeta.review_single_pass_reason === 'string')
    ? priorMeta.review_single_pass_reason : null;

  if (!currentReason && priorReason) {
    process.stderr.write('[mccp:single-pass] chain drift — 이 게이트는 토글 OFF로 도는데 ' +
      '선행 ' + prior.gate + ' receipt는 review_single_pass_reason=' + priorReason +
      ' 을 갖고 있다. 차단하지 않는다(DD8) — 각 receipt는 자기 시점의 상태를 봉인한다.\n');
  } else if (currentReason && !priorReason) {
    process.stderr.write('[mccp:single-pass] chain drift — 이 게이트는 토글 ON(' +
      currentReason + ')인데 선행 ' + prior.gate + ' receipt에는 그 필드가 없다. ' +
      '차단하지 않는다(DD8).\n');
  }
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


// v1.31.4 M4 — field-preserving restamp of POST-EXECUTE routed-command outcomes.
//
// Sibling of restampGroundingVerdict above, same reason it exists: the finish
// pass (Phase 3.6) runs AFTER the 2.5.6 receipt write, so its outcomes have no
// way into the receipt. Before M4 those commands were invoked from a hardcoded
// list that never touched the routing oracle, and the only post-write restamp
// mutated a single grounding key — so real invocations had no path to the
// receipt at all. This closes that path.
//
// It APPENDS rather than replaces: the pre-pass entries written at 2.5.6 are
// evidence in their own right and the finish pass is a second, later fact about
// the same cycle.
//
// Deliberately NOT deduped across entries. If the duplicate-call invariant ever
// breaks (a command firing in both passes), seeing it twice in the array IS the
// drift signal — silently merging would erase exactly the evidence this field
// exists to carry.
//
// It IS idempotent per restamp, which is a different axis (Codex Implement-R1
// F1): a retry of the SAME restamp must not forge a second history. The check is
// a tail match on the canonical entry form, and it lives INSIDE the updateReceipt
// critical section (security review F4) — outside the lock, a concurrent writer
// could change the tail between the check and the write, which is the same
// lost-update class §3.12 protects against. updateReceipt treats a null return
// from the mutator as "no write" (store.js:236), so a suppressed retry does not
// even re-seal the hashes.
const RESTAMP_ROUTED_ALLOWED_GATES = ['mccp-implement-codex'];
// v1.32.1 code-review M2 — schema.js owns an identical list and this file cannot
// import it as the single source, because `validate` is called from inside the
// hot path here and the reverse import would close a require cycle. So the copy
// stays, but both sides now EXPORT it and a test asserts they are equal. An
// unasserted copy is exactly what M6 Task 5 deleted from measure-evidence.js:
// widen one side and nothing turns red until a receipt is refused by the half
// that was not widened.
const ROUTED_ENTRY_KEYS = ['command', 'call_form', 'status'];

// Canonical entry form: exactly the three schema-validated keys, in a fixed
// order so JSON comparison is stable. Returns null when the entry carries
// anything else — the caller then refuses to suppress rather than guessing.
function canonicalRoutedEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const keys = Object.keys(entry);
  if (keys.length !== ROUTED_ENTRY_KEYS.length) return null;
  for (let i = 0; i < keys.length; i += 1) {
    if (ROUTED_ENTRY_KEYS.indexOf(keys[i]) === -1) return null;
  }
  return {
    command: entry.command,
    call_form: entry.call_form,
    status: entry.status,
  };
}

// True only when `entries` is already the exact tail of `current`. Uncertainty
// resolves to false — appending a duplicate is recoverable and visible, whereas
// suppressing a real second pass loses the record M4 exists to keep.
function isRoutedTailMatch(current, entries) {
  if (!Array.isArray(current) || current.length < entries.length) return false;
  const tail = current.slice(current.length - entries.length);
  for (let i = 0; i < entries.length; i += 1) {
    const a = canonicalRoutedEntry(tail[i]);
    if (a === null) return false;
    if (JSON.stringify(a) !== JSON.stringify(entries[i])) return false;
  }
  return true;
}

function restampRoutedCommands(args) {
  const gateId = args.gate || args['gate-id'];
  const decisionId = args.decision || args['decision-id'];
  const entriesFile = args['impeccable-commands-routed-file'] || args['entries-file'];

  if (!gateId) throw new Error('--gate is required');
  if (!decisionId) throw new Error('--decision is required');
  if (GATE_IDS.indexOf(gateId) === -1) {
    throw new Error('invalid --gate "' + gateId + '"; must be one of: ' + GATE_IDS.join(', '));
  }
  // Fail fast, and say why. store.js#assertNoTrackedOverwrite already refuses to
  // re-seal a git-tracked ship receipt with a different hash, so the §3.12
  // no-rehash invariant held without this check — but it held by rejecting the
  // write from inside the lock, after the attempt. Naming the one eligible gate
  // makes the code state what the milestone decided instead of relying on a
  // downstream guard to notice.
  if (RESTAMP_ROUTED_ALLOWED_GATES.indexOf(gateId) === -1) {
    throw new Error('--gate "' + gateId + '" is not eligible for restamp-routed. '
      + 'Only ' + RESTAMP_ROUTED_ALLOWED_GATES.join(', ') + ' may be restamped: git-tracked '
      + 'ship receipts (mccp-pr-codex) are audit-binding anchors and re-sealing one snaps '
      + 'the completion-ledger binding (CLAUDE.md §3.12).');
  }
  if (typeof entriesFile !== 'string' || entriesFile.length === 0) {
    throw new Error('--impeccable-commands-routed-file is required');
  }

  const cwd = args.cwd || process.cwd();
  const repoRoot = gitRepoRoot(cwd);

  // Resolve against cwd rather than trusting the raw argument, mirroring how
  // --review-proof-file is read. Without this the path is interpreted against
  // whatever the process happens to have as its working directory, which is not
  // necessarily the repo this restamp targets.
  const entriesPath = path.resolve(cwd, entriesFile);
  const raw = readJsonIfPresent(entriesPath, null);
  if (!Array.isArray(raw)) {
    throw new Error('entries file must contain a JSON array of routed-command outcomes: '
      + entriesPath);
  }

  // Reject unknown keys here rather than relying on schema.js, which validates
  // the three required fields but does not forbid extras (security review F1).
  // Refusing is better than silently normalizing: an unexpected key means the
  // producer and this consumer disagree, and quietly dropping it would seal a
  // receipt that does not match what the caller believed it was recording.
  const entries = raw.map(function (e, i) {
    const c = canonicalRoutedEntry(e);
    if (c === null) {
      throw new Error('entries[' + i + '] must be an object with exactly '
        + ROUTED_ENTRY_KEYS.join('/') + ' (got: '
        + (e && typeof e === 'object' && !Array.isArray(e) ? Object.keys(e).join(',') : typeof e) + ')');
    }
    return c;
  });

  if (entries.length === 0) {
    // A finish pass that processed nothing is not an error, but there is also
    // nothing to seal. Say so instead of re-hashing the receipt for a no-change.
    //
    // The receipt is still checked for existence (code-review M2). Without this
    // the shortcut reports success for a restamp that had no target at all,
    // which in a log is indistinguishable from one that landed — and the caller
    // at Phase 3.6.5 treats exit 0 as "recorded". readReceipt returns null for
    // an absent file and throws on an unsafe gate dir / non-regular file, so
    // both failure shapes surface here instead of being swallowed.
    if (readReceipt(repoRoot, gateId, decisionId) === null) {
      const err = new Error('no existing receipt for ' + gateId + '/' + decisionId
        + ' — nothing to restamp');
      err.code = 'RECEIPT_NOT_FOUND';
      throw err;
    }
    return {
      path: receiptPath(repoRoot, gateId, decisionId),
      receipt: null,
      noop: true,
      appended: 0,
      reason: 'no-entries',
    };
  }

  // Distinguishes the two no-op shapes for the caller. "Nothing to record" and
  // "already recorded" are different facts about a cycle, and collapsing them
  // into one message hid which had happened (code-review M2).
  let suppressed = false;
  const out = updateReceipt(repoRoot, gateId, decisionId, function (existing) {
    existing.meta = existing.meta || {};
    const current = Array.isArray(existing.meta.impeccable_commands_routed)
      ? existing.meta.impeccable_commands_routed
      : [];

    if (isRoutedTailMatch(current, entries)) {
      suppressed = true;
      return null; // retry — no write, no re-seal
    }

    existing.meta.impeccable_commands_routed = current.concat(entries);

    // subject_hash excludes meta (hash.js SUBJECT_FIELDS) so it is unchanged;
    // recompute defensively. receipt_hash DOES cover this field — it is not in
    // hash.js's carve-out list — so recomputing seals the appended outcomes and
    // keeps them tamper-evident.
    existing.subject_hash = subjectHash(existing);
    existing.receipt_hash = receiptHash(existing);

    const result = validate(existing);
    if (!result.ok) {
      const err = new Error('restamp routed commands validation failed:\n  - '
        + result.errors.join('\n  - '));
      err.code = 'SCHEMA_INVALID';
      err.errors = result.errors;
      throw err;
    }
    return existing;
  });

  return {
    path: out.path,
    receipt: out.receipt,
    noop: out.receipt === null,
    appended: out.receipt === null ? 0 : entries.length,
    reason: out.receipt === null ? (suppressed ? 'already-recorded' : 'no-write') : null,
  };
}

module.exports = {
  write: write,
  buildReceipt: buildReceipt,
  // Exported for tests + downstream callers that want the detector path
  // without going through writeReceipt (e.g., dry-run preview).
  triggerEscalateIfNeeded: triggerEscalateIfNeeded,
  deriveEscalateSummary: deriveEscalateSummary,
  restampGroundingVerdict: restampGroundingVerdict,
  restampRoutedCommands: restampRoutedCommands,
  // Exported only so the tests can hold this list against schema.js's copy.
  ROUTED_ENTRY_KEYS: ROUTED_ENTRY_KEYS,
  normalizeReceiptCwd: normalizeReceiptCwd, // Task A3 — tested in cwd-normalization.test.js
};
