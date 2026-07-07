'use strict';

// workflow-orchestration M2a Task 0 — single-worker implement dispatch result
// schema + 3-way reconciliation oracle.
//
// M2a migrates the /mccp:work Step 3 implement dispatch from a manual Task call
// (recovered via envelope `merge`) to a Workflow `agent(prompt,{schema})` call.
// The schema-validated RETURN VALUE becomes the recovery TRIGGER channel — but
// NEVER the sole source of truth (Codex F2). A fresh-context worker can
// self-report `status:'ok'` while its envelope stayed `pending`/`failure`, or
// omit a forbidden receipt from its return while the envelope still recorded it.
//
// `deriveVerdict` reconciles THREE independent records before a verdict:
//   1. result       — the Workflow agent() return (self-reported, schema-valid)
//   2. envelope      — the dispatch envelope the worker marked terminal (IPC SSoT)
//   3. receiptStore  — the actual receipts on disk (attribution anchor, F3)
// Any disagreement (terminal status, receipt slug set, forbidden slug, missing
// anchor) is a fail-closed non-ok verdict → the controller HALTs. This inherits
// mergeEnvelopes' pending/non-ok=failed rule (dispatch-controller.js:216-266)
// and crosses the return value on top of it.
//
// PURE function — all fs reads happen in the caller (work.md Bash), which injects
// already-parsed `envelope` + `receiptStore` objects. Mirrors the plan-fanout
// oracle split (tested lib + self-contained Workflow port).

// Worker terminal statuses — same enum as the envelope's terminal set
// (dispatch-envelope.js WORKER_EXIT_STATUSES minus 'pending').
const RESULT_STATUSES = Object.freeze(['ok', 'failure', 'timeout', 'crashed']);
const ENVELOPE_TERMINAL_STATUSES = Object.freeze(['ok', 'failure', 'timeout', 'crashed']);

// A worker doing implement-only must never produce a PR-gate receipt. Mirror of
// dispatch-cli.js:58 FORBIDDEN_RECEIPT_RE — a leaked mccp-pr-codex slug means the
// worker ran commit/PR (Phase 7 auto-chain) inside the isolation boundary (the
// F1 irreversible-external-state risk).
const FORBIDDEN_RECEIPT_RE = /(^|\/)mccp-pr-codex\//;

// Only mccp-implement-codex receipts carry the controller attribution the worker
// is contractually required to anchor (F3). Other slugs are not anchor-checked.
const IMPLEMENT_RECEIPT_RE = /(^|\/)mccp-implement-codex\//;

// StructuredOutput schema the Workflow agent() is forced to satisfy. The
// Workflow sandbox has no `require`, so scripts/workflows/implement-dispatch.js
// inlines a FAITHFUL PORT of this object — keep the two in sync.
const IMPLEMENT_RESULT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['status', 'receiptsAdded', 'changedFiles', 'testResult'],
  properties: {
    status: { type: 'string', enum: RESULT_STATUSES.slice() },
    receiptsAdded: { type: 'array', items: { type: 'string' } },
    changedFiles: { type: 'array', items: { type: 'string' } },
    testResult: { type: 'string' },
    nextAction: { type: ['string', 'null'] },
    findings: { type: 'array', items: { type: 'object' } },
  },
});

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Normalize a receipt-slug list into a sorted, trimmed, de-duplicated array so
// set comparison is order-independent.
function normSlugSet(list) {
  const seen = Object.create(null);
  const out = [];
  (Array.isArray(list) ? list : []).forEach(function (raw) {
    if (typeof raw !== 'string') return;
    const s = raw.trim();
    if (s.length === 0 || seen[s]) return;
    seen[s] = true;
    out.push(s);
  });
  out.sort();
  return out;
}

function setsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function mk(verdict, extra) {
  return Object.assign({
    verdict: verdict,
    receiptsAdded: [],
    invariantViolations: [],
    mismatches: [],
    unanchored: [],
    failedReason: null,
  }, extra || {});
}

// deriveVerdict({ result, envelope, receiptStore, expectedAnchor }) → verdict object.
//
// verdict ∈ ok | failed | invariant-violation | reconcile-mismatch | unanchored |
//           result-unreadable
//
// Judgment order is FIRST-MATCH and FAIL-CLOSED. The F1 invariant (a leaked
// PR-gate receipt = a commit/PR ran inside isolation = irreversible external
// state) is the MOST severe condition, so it is checked FIRST — before the
// envelope reconciliation — and must be detectable from the RETURN VALUE ALONE
// (Codex F1 belt-and-suspenders, plan Risk row: "deriveVerdict가 반환값
// receiptsAdded에서 mccp-pr-codex leak 검출 → HARD HALT"; plan Validation smoke:
// deriveVerdict({status:'ok',receiptsAdded:['mccp-pr-codex/foo.json']}) →
// invariant-violation). Surfacing a PR leak as a benign "reconcile-mismatch"
// would mislead the operator, so invariant precedes reconcile here even though
// the plan's step-60 numbering listed reconcile first — the plan's own smoke
// test + Risk row resolve that internal inconsistency toward invariant-first.
//
//   (1) result null/non-object                         → result-unreadable
//   (2) EITHER side matches FORBIDDEN_RECEIPT_RE        → invariant-violation (F1)
//   (3) envelope absent / non-terminal (pending)       → reconcile-mismatch  (F2)
//   (4) result.status ≠ envelope.worker_exit_status    → reconcile-mismatch  (F2)
//   (5) result.receiptsAdded set ≠ envelope set        → reconcile-mismatch  (F2)
//   (6) reconciled status ≠ 'ok'                        → failed
//   (7) any implement-codex receipt not store-anchored → unanchored          (F3)
//   (8) else                                            → ok
function deriveVerdict(input) {
  input = input || {};

  // Accept both the canonical { result, envelope, receiptStore, expectedAnchor }
  // form AND a BARE result object. When the input carries no reconciliation keys
  // but does carry result-shaped fields, treat it as { result: input } — this is
  // the belt-and-suspenders path: the F1 invariant must fire from a return value
  // alone (plan Validation smoke), with no envelope/store needed.
  if (input.result === undefined && input.envelope === undefined
      && input.receiptStore === undefined && input.expectedAnchor === undefined
      && (typeof input.status === 'string' || Array.isArray(input.receiptsAdded))) {
    input = { result: input };
  }

  const result = input.result;
  const envelope = input.envelope;
  const receiptStore = isPlainObject(input.receiptStore) ? input.receiptStore : {};
  const expectedAnchor = isPlainObject(input.expectedAnchor) ? input.expectedAnchor : null;

  // (1) — the Workflow agent() returned null (worker death) or a non-object.
  if (!isPlainObject(result)) {
    return mk('result-unreadable', {
      failedReason: 'worker returned null/non-object (agent death or schema failure)',
    });
  }

  const resultReceipts = normSlugSet(result.receiptsAdded);
  const envelopeReceipts = isPlainObject(envelope)
    ? normSlugSet(envelope.receipts_added) : [];

  // (2) — F1 invariant, highest priority + un-maskable. A forbidden PR-gate slug
  // on the return value OR the envelope means the worker ran commit/PR. Checked
  // before envelope reconciliation so it fires from the return value alone and
  // is never relabeled as a benign reconcile-mismatch.
  const invariantViolations = [];
  resultReceipts.concat(envelopeReceipts).forEach(function (slug) {
    if (FORBIDDEN_RECEIPT_RE.test(slug)
        && !invariantViolations.some(function (v) { return v.slug === slug; })) {
      invariantViolations.push({ kind: 'worker-ran-pr-gate', slug: slug });
    }
  });
  if (invariantViolations.length > 0) {
    return mk('invariant-violation', {
      receiptsAdded: resultReceipts,
      invariantViolations: invariantViolations,
      failedReason: 'worker leaked a PR-gate receipt (ran commit/PR inside isolation) — F1 irreversible external state',
    });
  }

  // (3) — envelope must exist AND be terminal. mergeEnvelopes treats a `pending`
  // envelope as a failed worker; a synchronous worker that never marked its
  // envelope terminal is a lost dispatch. Fail-closed to reconcile-mismatch.
  if (!isPlainObject(envelope)
      || ENVELOPE_TERMINAL_STATUSES.indexOf(envelope.worker_exit_status) === -1) {
    const st = isPlainObject(envelope)
      ? String(envelope.worker_exit_status) : '(absent)';
    return mk('reconcile-mismatch', {
      receiptsAdded: resultReceipts,
      mismatches: [{
        kind: 'envelope-non-terminal',
        detail: 'envelope status=' + st + ' (expected one of ' + ENVELOPE_TERMINAL_STATUSES.join('|') + ')',
      }],
      failedReason: 'envelope absent or non-terminal — mergeEnvelopes pending=failed inheritance (F2)',
    });
  }

  // (4) — self-reported status must agree with the envelope's terminal status.
  if (result.status !== envelope.worker_exit_status) {
    return mk('reconcile-mismatch', {
      receiptsAdded: resultReceipts,
      mismatches: [{
        kind: 'status-mismatch',
        detail: 'result.status=' + String(result.status)
          + ' envelope.worker_exit_status=' + String(envelope.worker_exit_status),
      }],
      failedReason: 'self-reported status disagrees with envelope (F2)',
    });
  }

  // (5) — the receipt slug sets must be identical between return and envelope.
  if (!setsEqual(resultReceipts, envelopeReceipts)) {
    return mk('reconcile-mismatch', {
      receiptsAdded: resultReceipts,
      mismatches: [{
        kind: 'receipt-set-mismatch',
        detail: 'result=[' + resultReceipts.join(',') + '] envelope=[' + envelopeReceipts.join(',') + ']',
      }],
      failedReason: 'receipt slug sets disagree between result and envelope (F2)',
    });
  }

  // (6) — reconciled but not ok (validation failed inside the worker).
  if (result.status !== 'ok') {
    return mk('failed', {
      receiptsAdded: resultReceipts,
      failedReason: 'worker terminal status=' + result.status + ' (validation failed inside worker)',
    });
  }

  // (7) — F3 post-hoc anchor gate. Every reconciled implement-codex receipt must
  // exist in the store with controller_context_marker_present=true AND its 3
  // attribution flags equal to the prepare-single-bound expectedAnchor. A
  // fresh-context worker that dropped the flags produces an un-anchored receipt
  // that silently defeats dual-review + PR cross-gate dedupe — HALT.
  const unanchored = [];
  resultReceipts.forEach(function (slug) {
    if (!IMPLEMENT_RECEIPT_RE.test(slug)) return;
    const rec = receiptStore[slug];
    const meta = isPlainObject(rec)
      ? (isPlainObject(rec.meta) ? rec.meta : rec)
      : null;
    if (!meta) {
      unanchored.push({ slug: slug, reason: 'receipt absent from store (cannot verify anchor)' });
      return;
    }
    if (meta.controller_context_marker_present !== true) {
      unanchored.push({ slug: slug, reason: 'controller_context_marker_present !== true' });
      return;
    }
    if (!expectedAnchor) {
      unanchored.push({ slug: slug, reason: 'no expectedAnchor supplied to verify against' });
      return;
    }
    const mism = [];
    if (meta.dispatched_by_controller_session_id !== expectedAnchor.sessionId) mism.push('session');
    if (meta.worker_dispatch_id !== expectedAnchor.dispatchId) mism.push('dispatchId');
    if (meta.ipc_envelope_path !== expectedAnchor.ipcPath) mism.push('ipcPath');
    if (mism.length > 0) {
      unanchored.push({ slug: slug, reason: 'anchor mismatch: ' + mism.join(',') });
    }
  });
  if (unanchored.length > 0) {
    return mk('unanchored', {
      receiptsAdded: resultReceipts,
      unanchored: unanchored,
      failedReason: 'implement-codex receipt not anchored to controller session (F3 de-anchor)',
    });
  }

  // (8) — clean reconciliation.
  return mk('ok', { receiptsAdded: resultReceipts, failedReason: null });
}

module.exports = {
  RESULT_STATUSES: RESULT_STATUSES,
  ENVELOPE_TERMINAL_STATUSES: ENVELOPE_TERMINAL_STATUSES,
  FORBIDDEN_RECEIPT_RE: FORBIDDEN_RECEIPT_RE,
  IMPLEMENT_RECEIPT_RE: IMPLEMENT_RECEIPT_RE,
  IMPLEMENT_RESULT_SCHEMA: IMPLEMENT_RESULT_SCHEMA,
  normSlugSet: normSlugSet,
  deriveVerdict: deriveVerdict,
};
