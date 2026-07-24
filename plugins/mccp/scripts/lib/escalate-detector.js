'use strict';

// Cross-gate escalate detector — derives dual-reviewer escalation triggers
// from a validated gate receipt (plan / implement / pr). Owned by v0.3.2 / S12.
//
// The catalog is imported from codex-bridge.js (single source of truth — see
// plan §Design Constraints #2). Adding a new CRITICAL pattern means updating
// codex-bridge.CRITICAL_PATTERNS only.
//
// Rule priority (first match wins):
//   1. findings[i].severity === 'CRITICAL'
//        → trigger='finding_critical', verdict='codex_critical', escalate=true
//   2. resolution.open_questions[i].severity === 'CRITICAL' AND q.item text
//      matches codex-bridge.detectCriticalCategory()
//        → trigger='auto_critical_catalog', verdict='codex_critical',
//          escalate=true, criticalCategory=<matched name>
//   3. resolution.converged === false AND resolution.rounds >= 3
//        → trigger='divergent_unresolved', verdict='codex_divergent',
//          escalate=true
//   4. otherwise
//        → escalate=false, all other fields null/empty
//
// Evidence is always populated so the caller can log who triggered what
// without re-scanning the receipt.

const { detectCriticalCategory } = require('./codex-bridge');
const { isDivergentVerdict } = require('./receipt-convergence');

const NULL_RESULT = Object.freeze({
  trigger: null,
  verdict: null,
  escalate: false,
  criticalCategory: null,
  evidence: Object.freeze({ findingsCritical: [], openCritical: [], divergentUnresolved: false }),
});

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function collectFindingsCritical(receipt) {
  if (!Array.isArray(receipt.findings)) return [];
  return receipt.findings.filter(function (f) {
    return isObject(f) && f.severity === 'CRITICAL';
  });
}

function collectOpenCritical(receipt) {
  if (!isObject(receipt.resolution)) return [];
  const oq = receipt.resolution.open_questions;
  if (!Array.isArray(oq)) return [];
  return oq.filter(function (q) {
    return isObject(q) && q.severity === 'CRITICAL';
  });
}

function isDivergentUnresolved(receipt) {
  if (!isObject(receipt.resolution)) return false;
  const r = receipt.resolution;
  // M1 — codex_verdict-first: a divergent/critical Codex verdict IS an unresolved
  // divergence regardless of the always-true resolution.converged. The legacy
  // rounds>=3 path stays for receipts written before codex_verdict existed.
  if (isDivergentVerdict(r)) return true;
  return r.converged === false && Number.isInteger(r.rounds) && r.rounds >= 3;
}

function detectFromReceipt(receipt) {
  if (!isObject(receipt)) return NULL_RESULT;

  const findingsCritical = collectFindingsCritical(receipt);
  const openCritical = collectOpenCritical(receipt);
  const divergentUnresolved = isDivergentUnresolved(receipt);

  const evidence = {
    findingsCritical: findingsCritical,
    openCritical: openCritical,
    divergentUnresolved: divergentUnresolved,
  };

  // Rule 1: any CRITICAL finding → escalate
  if (findingsCritical.length > 0) {
    return {
      trigger: 'finding_critical',
      verdict: 'codex_critical',
      escalate: true,
      criticalCategory: null,
      evidence: evidence,
    };
  }

  // Rule 2: open-question CRITICAL + catalog match
  for (const q of openCritical) {
    const cat = detectCriticalCategory(typeof q.item === 'string' ? q.item : '');
    if (cat) {
      return {
        trigger: 'auto_critical_catalog',
        verdict: 'codex_critical',
        escalate: true,
        criticalCategory: cat,
        evidence: evidence,
      };
    }
  }

  // Rule 3: divergent + rounds >= 3
  if (divergentUnresolved) {
    return {
      trigger: 'divergent_unresolved',
      verdict: 'codex_divergent',
      escalate: true,
      criticalCategory: null,
      evidence: evidence,
    };
  }

  return {
    trigger: null,
    verdict: null,
    escalate: false,
    criticalCategory: null,
    evidence: evidence,
  };
}

module.exports = {
  detectFromReceipt: detectFromReceipt,
};
