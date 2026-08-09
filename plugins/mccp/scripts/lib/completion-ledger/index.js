'use strict';

// Dashboard Truthfulness M1 — completion-ledger facade.
//
//   triggerLedgerAppend(repoRoot, receipt, receiptPath, opts) → void
//
// Fires from the receipt-write epilogue. Gate-gated to `mccp-pr-codex` receipts
// with a non-divergent, present `resolution.codex_verdict` (M1 — resolution.converged
// is retired as the trust key; absent verdict fail-closes). On the git-SAFE path it assembles a
// completion entry and hands it to store.writeEntry — the entry's existence
// is the authoritative completion signal (F3), so the receipt is NOT
// re-stamped on success. On the git-UNSAFE path (detached/unborn HEAD or
// dirty working tree, F1) it skips the write and stamps a single diagnostic
// flag `meta.ledger_write_skipped=true` (mirror of briefing stampReceipt —
// disk re-read → meta set → validate → write, receipt_hash NOT recomputed
// because hash.js carves the flag out).
//
// Fail-open invariant: every exception is caught + stderr-logged. Receipt
// write (the caller's concern) is already complete by the time this runs;
// ledger failure NEVER propagates out. Mirrors lib/briefing/index.js.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const store = require('./store');
// `readReceipt` is gone: stampSkipDiagnostic now reads inside the evidence lock
// (multi-session-work-loop M3), so a separate reader outside the critical
// section has no caller left.
const { validate } = require('../../receipt/schema');
const { extractRisksAndOpenQuestions } = require('../renderer/parsers/plan-body');

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function logSkip(reason, decisionId) {
  process.stderr.write('[mccp:completion-ledger] skipped reason=' + reason
    + ' decision=' + (decisionId || '<unknown>') + '\n');
}

function logFail(message, decisionId) {
  process.stderr.write('[mccp:completion-ledger] FAILED ' + message
    + ' decision=' + (decisionId || '<unknown>') + ' (allow)\n');
}

// Completion-time version snapshot (best-effort). plugin.json version →
// `git describe --tags --abbrev=0` → null. M1-scoped — independent of M2's
// host-project version ladder (Open Questions §4). null is acceptable.
function resolveVersion(repoRoot) {
  try {
    const pj = path.join(repoRoot, 'plugins', 'mccp', '.claude-plugin', 'plugin.json');
    if (fs.existsSync(pj)) {
      const v = JSON.parse(fs.readFileSync(pj, 'utf8')).version;
      if (typeof v === 'string' && v.length > 0) return v;
    }
  } catch (_e) { /* fall through */ }
  try {
    const out = execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return out;
  } catch (_e) { /* fall through */ }
  return null;
}

function readPlanSnapshot(repoRoot, planPath) {
  if (!planPath) return { risks: [], openQuestions: [] };
  try {
    const abs = path.isAbsolute(planPath) ? planPath : path.join(repoRoot, planPath);
    return extractRisksAndOpenQuestions(fs.readFileSync(abs, 'utf8'));
  } catch (_e) {
    return { risks: [], openQuestions: [] };
  }
}

// Diagnostic-only restamp on the git-unsafe skip path. Mirror of briefing
// stampReceipt: re-read from disk so we don't write a stale in-memory copy,
// set the single flag, validate, write. receipt_hash is intentionally NOT
// recomputed — hash.js canonicalizes ledger_write_skipped out so the
// tamper-detect digest stays valid (F3 + briefing precedent).
function stampSkipDiagnostic(repoRoot, receipt, receiptPath) {
  // multi-session-work-loop M3 — read AND write inside one evidence-lock
  // critical section (the previous split read/write was a lost-update window).
  // Fail-open + loud skip, same asymmetry as the briefing stamper: this touches
  // only the hash-CARVED `ledger_write_skipped` field, so it cannot perturb
  // receipt_hash and is not worth aborting a gate over (design doc §3.2).
  const { guardedReadModifyWrite } = require('../../receipt/evidence-lock');
  const GUARD_SKIP = new Set([
    'EVIDENCE_LOCK_UNAVAILABLE',
    'EVIDENCE_CLAIM_DENIED',
    'EVIDENCE_OVERWRITE_OBSERVED',
    'EVIDENCE_LOCK_REENTRANT',
  ]);

  try {
    guardedReadModifyWrite(receiptPath, function (raw) {
      let fresh = null;
      if (raw !== null && raw !== undefined) {
        try { fresh = JSON.parse(raw); } catch (_e) { fresh = null; }
      }
      if (!fresh) fresh = receipt;
      if (!fresh.meta || typeof fresh.meta !== 'object') fresh.meta = {};
      fresh.meta.ledger_write_skipped = true;
      const v = validate(fresh);
      if (!v.ok) {
        throw new Error('ledger skip-stamp produced invalid receipt: ' + v.errors.join('; '));
      }
      return JSON.stringify(fresh, null, 2) + '\n';
    });
  } catch (err) {
    if (err && GUARD_SKIP.has(err.code)) {
      process.stderr.write('[mccp:completion-ledger] WARNING: skip-diagnostic stamp SKIPPED — '
        + err.code + ' on ' + receiptPath + '. Receipt intact; only the carved '
        + 'ledger_write_skipped flag is missing. (allow)\n');
      return;
    }
    throw err;
  }
}

function triggerLedgerAppend(repoRoot, receipt, receiptPath, opts) {
  opts = opts || {};
  const decisionId = receipt && receipt.decision_id;

  try {
    // Gate-gating: only mccp-pr-codex receipts mark a milestone ship.
    if (!receipt || receipt.gate_id !== 'mccp-pr-codex') return;
    if (!receipt.resolution) return;

    // §3.12 / R2 F1 — resolution.converged is an UNRELIABLE completion key (it
    // stays `true` even on a divergent ship) and is RETIRED from the trust key.
    // The authoritative outcome is resolution.codex_verdict. NEW appends are
    // codex_verdict-first + fail-closed:
    //   converged   → append (verdict 'converged'), unless actionable findings remain
    //   skipped     → append (verdict 'skipped')   — dedupe/disabled happy-path
    //   unavailable → append (verdict 'advisory')  — advisory/degraded completion
    //   divergent   → SKIP (never record a No-ship as a completion — false-positive)
    //   critical    → SKIP
    //   absent      → SKIP (fail-closed). finalize-receipt.deriveCodexFlags always
    //                 forwards a verdict on a real ship, so absence means a legacy
    //                 pre-v1.20.3 write — the migration re-judges + preserves those;
    //                 they must NOT enter the durable corpus as a fresh completion.
    // Maps onto evidence-audit verdictsAgree (converged↔converged, skipped↔skipped,
    // advisory↔unavailable) so the ledger never disagrees with its bound receipt.
    // (Operator-confirmed vs the plan's converged-only draft: keeping skipped +
    // unavailable appends preserves the dedupe happy-path — dedupe fires only when
    // plan+implement BOTH converged, which makes the PR ship codex_verdict='skipped'.)
    const codexVerdict = (typeof receipt.resolution.codex_verdict === 'string')
      ? receipt.resolution.codex_verdict
      : null;
    if (codexVerdict === null) {
      logSkip('codex_verdict absent (legacy/pre-v1.20.3) — fail-closed on new append', decisionId);
      return;
    }
    if (codexVerdict === 'divergent' || codexVerdict === 'critical') {
      logSkip('non-converged codex_verdict: ' + codexVerdict, decisionId);
      return;
    }
    const meta = receipt.meta || {};
    if (meta.codex_review_actionable_findings === true) {
      logSkip('codex_review_actionable_findings=true — not a clean completion', decisionId);
      return;
    }

    const safetyFn = opts.isLedgerAppendSafe || store.isLedgerAppendSafe;
    const safety = safetyFn(repoRoot, opts);
    if (!safety || !safety.safe) {
      // git-unsafe → skip write + diagnostic restamp (NOT authoritative).
      stampSkipDiagnostic(repoRoot, receipt, receiptPath);
      logSkip((safety && safety.reason) || 'unsafe', decisionId);
      return;
    }

    // codexVerdict ∈ {converged, skipped, unavailable} here. Derive the ledger
    // verdict from it (codex_verdict-first — the meta.advisory/skipped legacy
    // fallback is retired along with resolution.converged).
    const verdict = codexVerdict === 'skipped' ? 'skipped'
      : (codexVerdict === 'unavailable' ? 'advisory' : 'converged');
    const completedAt = (typeof meta.created_at === 'string' && ISO8601_RE.test(meta.created_at))
      ? meta.created_at
      : new Date().toISOString();
    const planPath = opts.planPath || null;
    const planBasename = planPath ? path.basename(planPath) : (decisionId + '.plan.md');
    const snap = (opts.readPlanSnapshot || readPlanSnapshot)(repoRoot, planPath);
    const version = (opts.resolveVersion || resolveVersion)(repoRoot);

    const entry = {
      decision_id: decisionId,
      gate: receipt.gate_id,
      verdict: verdict,
      version: version,
      completed_at: completedAt,
      commit_sha: safety.commit_sha || null,
      plan_basename: planBasename,
      plan_file_hash: (typeof receipt.plan_hash === 'string' && receipt.plan_hash) || null,
      risks_closed: snap.risks,
      oq_closed: snap.openQuestions,
      receipt_hash: receipt.receipt_hash,
      // NEW appends always carry a present, non-divergent codex_verdict (absent
      // returned above), so their verdict is codex-corroborated by construction.
      verdict_provenance: 'codex-verdict',
    };

    const res = (opts.writeEntry || store.writeEntry)(repoRoot, entry, opts);
    if (!res || !res.ok) {
      logFail('store write failed: ' + (res && res.error), decisionId);
      return;
    }
    if (res.noop) logSkip('idempotent-noop', decisionId);
    // Success: entry existence is the authoritative completion signal — the
    // receipt is intentionally NOT re-stamped (F3 absorption + YAGNI).
  } catch (err) {
    // Fail-open invariant: never propagate. Receipt write is already done.
    logFail((err && err.message) || String(err), decisionId);
  }
}

module.exports = {
  triggerLedgerAppend: triggerLedgerAppend,
  // Exported for tests + audit consumers (do not call from production code).
  resolveVersion: resolveVersion,
  readPlanSnapshot: readPlanSnapshot,
  stampSkipDiagnostic: stampSkipDiagnostic,
};
