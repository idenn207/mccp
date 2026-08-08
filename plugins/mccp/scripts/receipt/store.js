'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
  //
  // v1.3.0-m6 security-reviewer absorption:
  //   - Error messages no longer include the full filesystem path. Path
  //     stays on err.path; downstream derive/sources/receipts.js#extract only
  //     surfaces err.message into the model. Prevents directory enumeration
  //     via leaked error strings (Information Disclosure absorption).
  //   - The receipt-file read path closes its TOCTOU window: lstat-based
  //     isPlainFile pre-check + open() with O_NOFOLLOW (POSIX) + fstat
  //     re-validation against the opened fd. An attacker who swaps a plain
  //     file for a symlink between the lstat and open is rejected by
  //     O_NOFOLLOW; one who swaps it between open and read still reads from
  //     the already-opened fd. Windows lacks O_NOFOLLOW but the static
  //     isPlainFile + isSafeGateDir checks remain the primary defense there.
  const gd = gateDir(repoRoot, gateId);
  if (fs.existsSync(gd) && !isSafeGateDir(gd)) {
    const e = new Error('gate dir is not a regular directory (symlink/junction/file)');
    e.code = 'UNSAFE_GATE_DIR';
    e.path = gd;
    throw e;
  }
  const p = receiptPath(repoRoot, gateId, decisionId);
  if (!fs.existsSync(p)) return null;
  if (!isPlainFile(p)) {
    const e = new Error('receipt file is not a regular file (symlink/special)');
    e.code = 'UNSAFE_RECEIPT_FILE';
    e.path = p;
    throw e;
  }
  const NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number'
    ? fs.constants.O_NOFOLLOW : 0;
  const openFlags = fs.constants.O_RDONLY | NOFOLLOW;
  let fd;
  try {
    fd = fs.openSync(p, openFlags);
  } catch (err) {
    if (err && (err.code === 'ELOOP' || err.code === 'EMLINK')) {
      const e = new Error('receipt file is not a regular file (symlink/special)');
      e.code = 'UNSAFE_RECEIPT_FILE';
      e.path = p;
      throw e;
    }
    throw err;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) {
      const e = new Error('receipt file is not a regular file (symlink/special)');
      e.code = 'UNSAFE_RECEIPT_FILE';
      e.path = p;
      throw e;
    }
    let raw;
    try {
      raw = fs.readFileSync(fd, 'utf8');
    } catch (err) {
      const e = new Error('cannot read receipt');
      e.code = 'RECEIPT_READ_ERROR';
      e.path = p;
      throw e;
    }
    try {
      return JSON.parse(raw);
    } catch (err) {
      const e = new Error('cannot parse receipt');
      e.code = 'RECEIPT_PARSE_ERROR';
      e.path = p;
      throw e;
    }
  } finally {
    try { fs.closeSync(fd); } catch (_) { /* ignore */ }
  }
}

// durable-evidence-substrate Task A3-b — is the receipt file git-tracked? Only
// tracked receipts carry an audit binding worth protecting (untracked
// working-tree receipts and brand-new decisions are ephemera).
function isGitTracked(repoRoot, filePath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', filePath], {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch (_e) {
    return false;
  }
}

// durable-evidence-substrate Task A3-b (Codex R3/R4 F1) — overwrite HALT guard.
// A git-tracked ship receipt is an audit-binding anchor: the completion-ledger
// entry's filename identity is `<decision>__<receipt_hash[0:12]>`, so silently
// overwriting a tracked receipt with a DIFFERENT hash snaps that binding and
// produces unverifiable superseded state (E4). This anchors in writeReceipt —
// the ONLY path that replaces the canonical receipt (the two direct stampers,
// briefing + ledger skip-diagnostic, only mutate hash-carved fields and cannot
// change receipt_hash) — so it covers EVERY caller, not just /mccp:pr. rebase is
// one instance of this defect; ordinary re-PR of the same slug is another
// (8 dangling bindings observed 2026-07-22).
function assertNoTrackedOverwrite(repoRoot, p, receipt) {
  if (!fs.existsSync(p)) return;          // brand-new decision — nothing to overwrite
  if (!isGitTracked(repoRoot, p)) return; // untracked working-tree ephemera — allowed
  let diskHash = null;
  try {
    diskHash = JSON.parse(fs.readFileSync(p, 'utf8')).receipt_hash || null;
  } catch (_e) {
    // existing tracked file unreadable/corrupt — not a known binding to protect;
    // allow the (repairing) write but say so loudly.
    process.stderr.write('[mccp-receipt-store] WARNING: tracked receipt at ' + p
      + ' is unreadable; allowing overwrite (cannot compare receipt_hash).\n');
    return;
  }
  const newHash = receipt && receipt.receipt_hash;
  if (diskHash && newHash && diskHash === newHash) return; // idempotent rewrite — allowed
  const err = new Error(
    'refusing to overwrite git-tracked receipt with a different hash '
    + '(disk=' + String(diskHash).slice(0, 20) + '… new=' + String(newHash).slice(0, 20) + '…). '
    + 'A tracked ship receipt is an audit-binding anchor (E4); overwriting it snaps the '
    + 'ledger↔receipt binding. To legitimately re-ship this decision, use a NEW decision slug — '
    + 'either pass --decision <new-slug> explicitly, or (for /mccp:pr, which is BRANCH_BASED) '
    + 'ship from a new branch name. Overwriting an existing slug is disallowed until a '
    + 'supersession schema exists (Out of Scope).');
  err.code = 'TRACKED_RECEIPT_OVERWRITE';
  throw err;
}

// multi-session-work-loop M3 — write는 fail-closed 짧은 임계구역 + 원자 rename을
// 거친다. 이전 구현은 `mkdirSync → assertNoTrackedOverwrite → writeFileSync(최종
// 경로)`였고, 그래서 (a) 동시 writer 2명이 lost update, (b) 쓰는 중 reader가 torn
// JSON을 읽음, (c) 쓰는 중 crash가 receipt를 손상시켰다.
//
// 핵심은 `assertNoTrackedOverwrite` 재검이 **lock 안**이라는 것이다 — 그 함수는
// disk hash를 읽고(L127) caller가 write(L154)하는 read-then-write TOCTOU라,
// 두 세션이 같은 창에서 **둘 다 통과**할 수 있었다.
//
// 이 지점이 enforcement locus다. LLM이 command body 지시를 건너뛰어도 receipt
// write는 여기를 지나므로 보호가 **현재 알려진 모든 caller**에 자동 적용된다.
// 그 한정은 의도적이다 — 미래에 추가되는 직접 writer는 b2-coverage-gate의
// 정적 lint가 guardrail로 잡되, **정적 축이 보는 범위 안에서만** 잡는다:
// `plugins/mccp/scripts` 안의 .js에서 write 줄·store helper·한 홉 변수 taint로
// receipt 경로가 드러나는 형태까지다. 다단계로 세탁된 경로·런타임 결정 경로·
// 셸/생성 writer는 정적 축이 원리상 못 보며, 그것들의 falsifier는 lint가 아니라
// 런타임 변형 감사(primary)다.
//
// 출력 바이트는 불변이다(§3.12 no-rehash): 같은 입력이면 이전과 byte-identical.
function writeReceipt(repoRoot, receipt) {
  const p = receiptPath(repoRoot, receipt.gate_id, receipt.decision_id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const { guardedWrite } = require('./evidence-lock');
  guardedWrite(p, function () {
    assertNoTrackedOverwrite(repoRoot, p, receipt);
    return JSON.stringify(receipt, null, 2) + '\n';
  });
  return p;
}

// multi-session-work-loop M3 — guarded read-modify-write for an EXISTING
// receipt. `mutate(receipt)` returns the mutated receipt (or null for no-op);
// the read, the mutation, the tracked-overwrite guard and the atomic write all
// happen inside ONE critical section.
//
// This exists so callers never have to compose the pieces themselves. A caller
// that did `readReceipt()` … `writeReceipt()` would reopen the lost-update
// window between the two, and one that acquired the lock and then called
// writeReceipt would deadlock on the re-entrancy guard. Keeping
// assertNoTrackedOverwrite in here (rather than exporting it) means the §3.12
// tracked-hash invariant cannot be forgotten at a call site.
function updateReceipt(repoRoot, gateId, decisionId, mutate) {
  const p = receiptPath(repoRoot, gateId, decisionId);
  const { guardedReadModifyWrite } = require('./evidence-lock');

  // Mirror readReceipt's symlink/junction defenses, and do it BEFORE acquiring
  // the lock. Acquisition creates `<gateDir>/<slug>.json.lock` (and mkdirs the
  // parent), so checking inside the critical section would already have written
  // a file through a junction pointing outside the worktree — the very thing the
  // check exists to prevent. Nothing is created before this returns.
  const gd = gateDir(repoRoot, gateId);
  if (fs.existsSync(gd) && !isSafeGateDir(gd)) {
    const e = new Error('gate dir is not a regular directory (symlink/junction/file)');
    e.code = 'UNSAFE_GATE_DIR';
    e.path = gd;
    throw e;
  }

  let out = null;
  guardedReadModifyWrite(p, function (raw) {
    if (raw === null || raw === undefined) {
      const e = new Error('no existing receipt for ' + gateId + '/' + decisionId);
      e.code = 'RECEIPT_NOT_FOUND';
      throw e;
    }
    if (!isPlainFile(p)) {
      const e = new Error('receipt file is not a regular file (symlink/special)');
      e.code = 'UNSAFE_RECEIPT_FILE';
      e.path = p;
      throw e;
    }
    let existing;
    try {
      existing = JSON.parse(raw);
    } catch (_e) {
      const e = new Error('cannot parse receipt');
      e.code = 'RECEIPT_PARSE_ERROR';
      e.path = p;
      throw e;
    }
    const next = mutate(existing);
    if (next === null || next === undefined) return null;   // no-op, no write
    assertNoTrackedOverwrite(repoRoot, p, next);
    out = next;
    return JSON.stringify(next, null, 2) + '\n';
  });
  return { path: p, receipt: out };
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

function isPlainFile(filePath) {
  let lst;
  try { lst = fs.lstatSync(filePath); } catch (_e) { return false; }
  if (lst.isSymbolicLink()) return false;
  return lst.isFile();
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
  updateReceipt: updateReceipt,
  listReceipts: listReceipts,
  listGenericReceipts: listGenericReceipts,
  listUnsafeGateDirs: listUnsafeGateDirs,
  isSafeGateDir: isSafeGateDir,
};
