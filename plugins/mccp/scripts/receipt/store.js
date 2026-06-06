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
  // v0.2.8 Task 2.6.5b R6-F1 absorption — readReceipt must mirror the
  // isSafeGateDir guard that listReceipts uses. Without this, validate-cmd
  // can still consume an external receipt through a symlinked/junctioned
  // gate dir even though listReceipts already refused to scan it.
  const gd = gateDir(repoRoot, gateId);
  if (fs.existsSync(gd) && !isSafeGateDir(gd)) {
    const e = new Error('gate dir is not a regular directory (symlink/junction/file): ' + gd);
    e.code = 'UNSAFE_GATE_DIR';
    e.path = gd;
    throw e;
  }
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

// v0.2.8 Task 2.6.5a A2 — gate-dir symlink rejection. A symlinked or
// junctioned gate dir at `.claude/receipts/<gate>` could point outside
// the worktree; scanning it would let the migration discover and rename
// external files. We use lstatSync to detect the link WITHOUT following
// it, and skip any non-directory or symlinked entry. On Windows, junctions
// also report isSymbolicLink()=true in Node 10+.
function isSafeGateDir(gateDirPath) {
  let lst;
  try { lst = fs.lstatSync(gateDirPath); } catch (_e) { return false; }
  if (lst.isSymbolicLink()) return false;
  if (!lst.isDirectory()) return false;
  return true;
}

function listReceipts(repoRoot, gateId, opts) {
  opts = opts || {};
  if (gateId) {
    const dir = gateDir(repoRoot, gateId);
    if (!fs.existsSync(dir)) return [];
    if (!isSafeGateDir(dir)) {
      if (opts.systemMessage) opts.systemMessage(
        '[mccp-receipt-store] skipping gate dir "' + gateId + '" — symlinked or non-directory');
      return [];
    }
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
    if (!isSafeGateDir(gDir)) {
      if (opts.systemMessage) opts.systemMessage(
        '[mccp-receipt-store] skipping gate dir "' + g + '" — symlinked or non-directory');
      continue;
    }
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
//
// v0.2.8 Task 2.6.5a A2: symlink rejection inherited from listReceipts.
function listGenericReceipts(repoRoot, opts) {
  const { GATE_IDS } = require('./schema');
  return listReceipts(repoRoot, undefined, opts).filter(function (r) {
    if (r.decision_id !== 'default' && r.decision_id !== 'main') return false;
    if (GATE_IDS.indexOf(r.gate_id) === -1) return false;
    return true;
  });
}

// v0.2.8 Task 2.6.5b R6-F1 — enumerate unsafe gate dirs (symlinks /
// junctions / non-directories) WITHOUT scanning them. The quarantine
// migration consumes this to refuse a `complete` marker while any
// unsafe gate dir still exists: otherwise listGenericReceipts skips
// them silently, scanActiveGeneric returns 0, and the migration would
// falsely claim "done" while external receipts stay behind the link.
function listUnsafeGateDirs(repoRoot) {
  const base = receiptsDir(repoRoot);
  if (!fs.existsSync(base)) return [];
  const out = [];
  let entries;
  try { entries = fs.readdirSync(base); } catch { return []; }
  for (const g of entries) {
    if (g.startsWith('.')) continue; // skip .migrations marker dir
    const gDir = path.join(base, g);
    let lst;
    try { lst = fs.lstatSync(gDir); } catch { continue; }
    if (lst.isSymbolicLink()) {
      out.push({ gate_id: g, path: gDir, kind: 'symlink' });
    } else if (!lst.isDirectory()) {
      out.push({ gate_id: g, path: gDir, kind: 'non-directory' });
    }
  }
  return out;
}

module.exports = {
  receiptsDir: receiptsDir,
  gateDir: gateDir,
  receiptPath: receiptPath,
  readReceipt: readReceipt,
  writeReceipt: writeReceipt,
  listReceipts: listReceipts,
  listGenericReceipts: listGenericReceipts,
  listUnsafeGateDirs: listUnsafeGateDirs,
  isSafeGateDir: isSafeGateDir,
};
