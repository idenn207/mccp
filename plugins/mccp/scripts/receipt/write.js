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
const { phaseFromGate } = require('./aliases');
const { writeReceipt, readReceipt } = require('./store');
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
      cwd: cwd,
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
    },
  });

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
    fixTask.writeOrAppend(repoRoot, {
      verdict: det.verdict,
      escalate: true,
      taskFingerprint: deriveFingerprint(repoRoot, receipt.decision_id),
      decisionId: receipt.decision_id,
      codexSummary: deriveEscalateSummary(det),
      originalPrompt: '<gate-receipt:' + receipt.gate_id + '/' + receipt.decision_id + '>',
      originatingReceipts: [receiptPath],
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
  return { path: p, receipt: built.receipt };
}

module.exports = {
  write: write,
  buildReceipt: buildReceipt,
  // Exported for tests + downstream callers that want the detector path
  // without going through writeReceipt (e.g., dry-run preview).
  triggerEscalateIfNeeded: triggerEscalateIfNeeded,
  deriveEscalateSummary: deriveEscalateSummary,
};
