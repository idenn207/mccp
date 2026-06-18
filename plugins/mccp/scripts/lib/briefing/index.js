'use strict';

// v1.3.0-m2 briefing facade — wraps cost-guard + invoke and re-stamps the
// receipt on disk. Public surface:
//
//   triggerBriefing(repoRoot, receipt, receiptPath, opts) → void
//
// Fail-open invariant: every exception is caught + stderr-logged. Receipt
// write (the caller's concern) is already complete by the time this runs;
// briefing failure NEVER propagates out.

const fs = require('fs');

const { shouldSkipBriefing } = require('./cost-guard');
const { invokeBriefing } = require('./invoke');
const { readReceipt } = require('../../receipt/store');
const { validate } = require('../../receipt/schema');

// Codex R1 F3 absorption — process-local re-entrancy guard. If briefing is
// already running in this node process (e.g. invokeBriefing's spawn somehow
// re-enters receipt-write), short-circuit. The cost-guard PR_PHASE_LOCKED
// reason covers the most common re-entrancy axis (PR Codex review); this
// flag handles any other path where the same process re-enters.
let BRIEFING_IN_PROGRESS = false;

function logSkip(reason, decisionId) {
  process.stderr.write('[mccp:briefing] skipped reason=' + reason
    + ' decision=' + (decisionId || '<unknown>') + '\n');
}

function logFail(message, decisionId) {
  process.stderr.write('[mccp:briefing] FAILED ' + message
    + ' decision=' + (decisionId || '<unknown>') + ' (allow)\n');
}

function stampReceipt(repoRoot, receipt, receiptPath, fields) {
  // Re-read from disk so we don't write a stale in-memory copy back. The
  // caller's `receipt` arg is the post-buildReceipt snapshot from write.js;
  // by the time we get here writeReceipt has already persisted it.
  let fresh = readReceipt(repoRoot, receipt.gate_id, receipt.decision_id);
  if (!fresh) {
    // Fallback path: if read fails (shouldn't), mutate the in-memory copy.
    fresh = receipt;
  }
  if (!fresh.meta || typeof fresh.meta !== 'object') {
    fresh.meta = {};
  }

  fresh.meta.briefing_summary = fields.summary;
  fresh.meta.briefing_token_count = fields.tokenCount;
  fresh.meta.briefing_token_estimated = !!fields.estimated;
  fresh.meta.briefing_invocation_count = fields.invocationCount;

  const v = validate(fresh);
  if (!v.ok) {
    // Schema bump regression — surface loudly. Do NOT rewrite a corrupted
    // receipt: the existing on-disk version is canonical and we leave it
    // alone. Throw so the outer try/catch in triggerBriefing logs the fail
    // path but the receipt itself stays in pre-stamp state.
    throw new Error('briefing stamp produced invalid receipt: ' + v.errors.join('; '));
  }

  // receipt_hash and subject_hash are intentionally NOT recomputed here.
  // hash.js (Task 1b) canonicalizes briefing_* out of the hash so the
  // pre-stamp receipt_hash remains valid for tamper-detect consumers. The
  // hash chain captures gate-pass state; briefing is metadata-on-top.
  // Codex R1 F1 absorption.
  const json = JSON.stringify(fresh, null, 2) + '\n';
  fs.writeFileSync(receiptPath, json, 'utf8');
}

function triggerBriefing(repoRoot, receipt, receiptPath, opts) {
  opts = opts || {};
  const decisionId = receipt && receipt.decision_id;

  if (BRIEFING_IN_PROGRESS) {
    logSkip('reentrant-briefing-in-progress', decisionId);
    return;
  }

  try {
    BRIEFING_IN_PROGRESS = true;

    const guard = (opts.guard || shouldSkipBriefing)({
      env: opts.env,
      repoRoot: repoRoot,
    });
    if (guard.skip) {
      // Stamp invocation_count=0 + summary=null so the audit trail records
      // "briefing attempted, skipped by guard" rather than "never attempted".
      stampReceipt(repoRoot, receipt, receiptPath, {
        summary: null,
        tokenCount: 0,
        estimated: false,
        invocationCount: 0,
      });
      logSkip(guard.reason, decisionId);
      return;
    }

    // M2 doesn't run derive synchronously inside receipt-write; pass-through
    // null is the steady-state. Tests can inject a synthetic model via opts.
    const deriveModel = opts.deriveModel || null;
    const result = (opts.invoke || invokeBriefing)(receipt, deriveModel, opts);

    if (!result || !result.ok) {
      stampReceipt(repoRoot, receipt, receiptPath, {
        summary: null,
        tokenCount: result && result.tokenCount || 0,
        estimated: !!(result && result.estimated),
        invocationCount: 1,
      });
      const cls = (result && result.classification) || 'unknown';
      logFail('classification=' + cls, decisionId);
      return;
    }

    stampReceipt(repoRoot, receipt, receiptPath, {
      summary: result.summary,
      tokenCount: result.tokenCount,
      estimated: !!result.estimated,
      invocationCount: 1,
    });
  } catch (err) {
    // Fail-open invariant: never propagate. Receipt write is already done.
    logFail((err && err.message) || String(err), decisionId);
  } finally {
    BRIEFING_IN_PROGRESS = false;
  }
}

module.exports = {
  triggerBriefing: triggerBriefing,
  // Exported for tests + audit consumers (do not call from production code).
  stampReceipt: stampReceipt,
};
