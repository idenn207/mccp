'use strict';

// v0.2.8 Task 2.6.5a A2 — path-containment guard regression tests.
//
// Threat model (PR-Codex R6 Finding 1): a malicious or accidental symlink
// at `.claude/receipts/<gate>` could point outside the worktree. The
// migration's `statSync().isDirectory()` follows symlinks → scanner sees
// a regular directory → renameSync moves an external file to a `.legacy`
// path inside the worktree. Data loss outside the repo.
//
// 3 axes from plan:
//   (α) symlinked gate dir → listGenericReceipts rejects (no scan of external dir)
//   (β) out-of-tree receipt path → renameWithCollisionSafety throws PATH_ESCAPES_GATE
//   (γ) normal in-tree path still passes (false-positive guard)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { mkTmpRepo } = require('../../receipt/tests/helpers');
const mig = require('../v0.2.8-generic-receipt-quarantine');
const { listGenericReceipts, listReceipts } = require('../../receipt/store');

function writeReceipt(repo, gateId, decisionId, body) {
  const dir = path.join(repo, '.claude', 'receipts', gateId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, decisionId + '.json');
  fs.writeFileSync(p, JSON.stringify(body || { schema_version: 'v1', decision_id: decisionId }, null, 2));
  return p;
}

// Cross-platform "make a directory symlink/junction" helper. On POSIX it's
// a symlink; on Windows we try a junction (no admin required). Returns
// true if the link was created, false if creation failed (skip the test).
function tryCreateDirLink(targetDir, linkPath) {
  try {
    if (process.platform === 'win32') {
      fs.symlinkSync(targetDir, linkPath, 'junction');
    } else {
      fs.symlinkSync(targetDir, linkPath, 'dir');
    }
    return true;
  } catch (err) {
    return false;
  }
}

// (α) symlinked gate dir rejected by listGenericReceipts.
test('path-containment (α) symlinked/junctioned gate dir rejected by listGenericReceipts', function (t) {
  const repo = mkTmpRepo();
  // Plant an external receipt directory OUTSIDE the repo.
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ext-'));
  const externalGateDir = path.join(externalRoot, 'mccp-plan-codex');
  fs.mkdirSync(externalGateDir, { recursive: true });
  fs.writeFileSync(path.join(externalGateDir, 'default.json'),
    JSON.stringify({ schema_version: 'v1', decision_id: 'default', stolen: true }));

  // Create the symlink at .claude/receipts/mccp-plan-codex pointing at external dir.
  const linkPath = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  const linked = tryCreateDirLink(externalGateDir, linkPath);
  if (!linked) {
    t.skip('symlink/junction creation requires elevated perms on this platform');
    return;
  }

  // listGenericReceipts MUST NOT return the external receipt.
  const generics = listGenericReceipts(repo);
  const fromExternal = generics.filter(r => r.path.includes(externalGateDir));
  assert.strictEqual(fromExternal.length, 0,
    'listGenericReceipts must skip symlinked gate dir; got ' + JSON.stringify(generics));

  // And the migration itself must not touch the external file.
  const beforeContent = fs.readFileSync(path.join(externalGateDir, 'default.json'), 'utf8');
  const result = mig.migrate(repo);
  assert.strictEqual(result.status, 'complete', 'migration completes — no external dir to process');
  assert.strictEqual(result.renamed.length, 0, 'no external receipts renamed');
  const afterContent = fs.readFileSync(path.join(externalGateDir, 'default.json'), 'utf8');
  assert.strictEqual(beforeContent, afterContent, 'external file content unchanged');

  // Cleanup external.
  try { fs.rmSync(externalRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

// (β) realpath canary outside gate dir → renameWithCollisionSafety throws.
// Synthetic receipt whose `path` points outside the repo's expected gate
// dir. With repoRoot passed, assertContained computes the EXPECTED gate
// dir (= repoRoot/.claude/receipts/<gate_id>) and proves receipt.path is
// not under it. Old code that used path.dirname(receipt.path) as the gate
// dir was tautological and would have passed — this regression test pins
// the fixed signature.
test('path-containment (β) out-of-tree receipt path → migration throws PATH_ESCAPES_GATE', function () {
  const repo = mkTmpRepo();
  // Plant a real receipt outside the repo's .claude/receipts gate dir.
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ext-'));
  const externalReceipt = path.join(externalRoot, 'default.json');
  fs.writeFileSync(externalReceipt, JSON.stringify({ schema_version: 'v1', decision_id: 'default' }));

  // The expected gate dir must exist so realpath doesn't ENOENT before
  // the prefix check fires.
  fs.mkdirSync(path.join(repo, '.claude', 'receipts', 'mccp-plan-codex'), { recursive: true });

  assert.throws(function () {
    mig.renameWithCollisionSafety({
      gate_id: 'mccp-plan-codex',
      decision_id: 'default',
      path: externalReceipt,
    }, repo);
  }, /path escapes gate dir/);

  // External file must remain unchanged after the throw.
  assert.ok(fs.existsSync(externalReceipt), 'external receipt not renamed');

  try { fs.rmSync(externalRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

// (γ) normal in-tree path still passes (regression guard against false-positive).
test('path-containment (γ) normal in-tree path passes assertContained', function () {
  const repo = mkTmpRepo();
  writeReceipt(repo, 'mccp-plan-codex', 'default');

  // assertContained shouldn't throw for an in-tree path with repoRoot supplied.
  const receiptPath = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex', 'default.json');
  const gateDir = path.dirname(receiptPath);
  assert.doesNotThrow(function () {
    mig.assertContained(receiptPath, gateDir, repo);
  });

  // Full migration succeeds.
  const result = mig.migrate(repo);
  assert.strictEqual(result.status, 'complete', JSON.stringify(result));
  assert.strictEqual(result.renamed.length, 1);
});

// Edge-case regression: `<gate>` vs `<gate>-evil` prefix-match guard.
test('path-containment (γ-edge) <gate> vs <gate>-evil prefix-match defeated by path.sep suffix', function () {
  const repo = mkTmpRepo();
  const evilDir = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex-evil');
  fs.mkdirSync(evilDir, { recursive: true });
  const evilReceipt = path.join(evilDir, 'default.json');
  fs.writeFileSync(evilReceipt, JSON.stringify({ schema_version: 'v1', decision_id: 'default' }));

  const legitGateDir = path.join(repo, '.claude', 'receipts', 'mccp-plan-codex');
  fs.mkdirSync(legitGateDir, { recursive: true });

  assert.throws(function () {
    mig.assertContained(evilReceipt, legitGateDir, repo);
  }, /path escapes gate dir/);
});
