'use strict';

const fs = require('fs');
const path = require('path');

function receiptsDir(repoRoot) {
  return path.join(repoRoot, '.claude', 'receipts');
}

function gateDir(repoRoot, gateId) {
  return path.join(receiptsDir(repoRoot), gateId);
}

function receiptPath(repoRoot, gateId, decisionId) {
  return path.join(gateDir(repoRoot, gateId), decisionId + '.json');
}

function readReceipt(repoRoot, gateId, decisionId) {
  const p = receiptPath(repoRoot, gateId, decisionId);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    const e = new Error('cannot parse receipt at ' + p + ': ' + err.message);
    e.code = 'RECEIPT_PARSE_ERROR';
    e.path = p;
    throw e;
  }
}

function writeReceipt(repoRoot, receipt) {
  const p = receiptPath(repoRoot, receipt.gate_id, receipt.decision_id);
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  return p;
}

function listReceipts(repoRoot, gateId) {
  if (gateId) {
    const dir = gateDir(repoRoot, gateId);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(function (f) { return f.endsWith('.json'); })
      .map(function (f) {
        return {
          gate_id: gateId,
          decision_id: f.replace(/\.json$/, ''),
          path: path.join(dir, f),
        };
      });
  }
  const base = receiptsDir(repoRoot);
  if (!fs.existsSync(base)) return [];
  const out = [];
  for (const g of fs.readdirSync(base)) {
    const gDir = path.join(base, g);
    let isDir = false;
    try { isDir = fs.statSync(gDir).isDirectory(); } catch (_e) { /* skip */ }
    if (!isDir) continue;
    for (const f of fs.readdirSync(gDir)) {
      if (f.endsWith('.json')) {
        out.push({ gate_id: g, decision_id: f.replace(/\.json$/, ''), path: path.join(gDir, f) });
      }
    }
  }
  return out;
}

// v0.2.8 Task 2.6.5 IMPL-R1-F1 absorption: receipt-store driven scan over
// the canonical GATE_IDS × {default, main} universe. The migration script
// must NOT hardcode path lists — that would miss branch-derived namespaces
// like mccp-pr-codex (used by /mccp:code-review PR mode) and any future
// gate addition. By filtering through schema.GATE_IDS we automatically
// cover the same universe the validator can read.
function listGenericReceipts(repoRoot) {
  const { GATE_IDS } = require('./schema');
  return listReceipts(repoRoot).filter(function (r) {
    if (r.decision_id !== 'default' && r.decision_id !== 'main') return false;
    if (GATE_IDS.indexOf(r.gate_id) === -1) return false;
    return true;
  });
}

module.exports = {
  receiptsDir: receiptsDir,
  gateDir: gateDir,
  receiptPath: receiptPath,
  readReceipt: readReceipt,
  writeReceipt: writeReceipt,
  listReceipts: listReceipts,
  listGenericReceipts: listGenericReceipts,
};
