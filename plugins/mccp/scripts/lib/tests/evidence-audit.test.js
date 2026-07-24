'use strict';

// evidence-audit contract (durable-evidence-substrate Phase A · Task A1).
//
// The ONE fixation this file exists for: a tree with nothing to compare
// (comparable === 0) must NEVER return 'ok'/'clean' — it returns state='blind'.
// That is the exact inverse of the E1 defect (absence reported as "no defect").
// Everything else pins the join contract: ok / false_positive / unverifiable /
// hash_bound counting and the always-numeric coverage.
//
// M1 Task 3 (R5-F2): hash_bound now requires the on-disk receipt to RECOMPUTE to
// its declared receipt_hash AND be schema-valid — a declared-hash match alone no
// longer binds. So ship-receipt fixtures are FULL valid receipts (makeSkeleton +
// real receiptHash), and ledger entries use the 'MATCH' sentinel to reference the
// receipt's real hash (a literal string is an intentional mismatch).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { audit, exitCodeForState } = require('../evidence-audit');
const { receiptHash } = require('../../receipt/hash');
const { makeSkeleton } = require('../../receipt/schema');

// buildReceipt(r) → a full, schema-valid ship receipt with a REAL receipt_hash.
//   r.codex_verdict          resolution.codex_verdict (omit → absent)
//   r.tamperBody             flip a benign body field AFTER hashing → declared
//                            hash goes stale (recompute fails) but verdict is
//                            unchanged (isolates the hash_bound axis from verdict)
//   r.schemaInvalidConsistent set round out of range THEN hash → declared ===
//                            recompute, but schema.validate fails (isolates the
//                            schema gate from the recompute gate)
function buildReceipt(r) {
  const receipt = makeSkeleton({});
  receipt.gate_id = 'mccp-pr-codex';
  receipt.phase = 'pr';
  receipt.decision_id = r.decision_id;
  receipt.plan_hash = 'sha256:' + 'a'.repeat(64);
  receipt.base_sha = 'a'.repeat(40);
  receipt.head_sha = 'b'.repeat(40);
  receipt.subject_hash = 'sha256:' + 'c'.repeat(64);
  receipt.resolution.converged = true;
  if (r.codex_verdict !== undefined) receipt.resolution.codex_verdict = r.codex_verdict;
  receipt.meta.command = '/mccp:pr';
  receipt.meta.cwd = '.';
  if (r.schemaInvalidConsistent) {
    receipt.round = 99; // out of [1,10] — schema invalid, but hashed as-is below
    receipt.receipt_hash = receiptHash(receipt); // declared === recompute
  } else {
    receipt.receipt_hash = receiptHash(receipt); // clean, consistent
    if (r.tamperBody) {
      // Mutate a benign, still-schema-valid field AFTER hashing. codex_verdict is
      // untouched (verdictsAgree stays true), but the declared hash is now stale.
      receipt.meta.git_branch = 'tampered-after-hash';
    }
  }
  return receipt;
}

// Build a temp repo tree with raw ledger entries + FULL ship receipts.
//   ledger:   [{ decision_id, verdict, receipt_hash: 'MATCH' | <literal> }]
//   receipts: [{ decision_id, codex_verdict?, tamperBody?, schemaInvalidConsistent? }]
//   rawFiles: optional [{ dir:'ledger'|'receipts', name, content }] for corruption
function mkTree(spec) {
  spec = spec || {};
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evaudit-test-'));
  const ledgerDir = path.join(root, '.claude', 'state', 'completion-ledger');
  fs.mkdirSync(ledgerDir, { recursive: true });

  // Build receipts first so ledger entries can reference their real hashes.
  const realHashByDecision = {};
  if (spec.receipts) {
    const rDir = path.join(root, '.claude', 'receipts', 'mccp-pr-codex');
    fs.mkdirSync(rDir, { recursive: true });
    spec.receipts.forEach(function (r, i) {
      const receipt = buildReceipt(r);
      realHashByDecision[r.decision_id] = receipt.receipt_hash;
      const file = path.join(rDir, (r.decision_id || 'x') + '_' + i + '.json');
      fs.writeFileSync(file, JSON.stringify(receipt));
    });
  }

  (spec.ledger || []).forEach(function (e, i) {
    let rh = e.receipt_hash;
    if (rh === 'MATCH') rh = realHashByDecision[e.decision_id] || 'sha256:no-such-receipt';
    const file = path.join(ledgerDir, (e.decision_id || 'x') + '__' + i + '.json');
    fs.writeFileSync(file, JSON.stringify({
      schema_version: 'v1',
      entry: {
        decision_id: e.decision_id,
        gate: 'mccp-pr-codex',
        verdict: e.verdict,
        receipt_hash: rh || null,
      },
    }));
  });

  (spec.rawFiles || []).forEach(function (rf) {
    const dir = rf.dir === 'receipts'
      ? path.join(root, '.claude', 'receipts', 'mccp-pr-codex')
      : ledgerDir;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, rf.name), rf.content);
  });
  return root;
}

test('blind: empty ledger + no receipts is NEVER ok/clean', function () {
  const root = mkTree({ ledger: [] });
  const r = audit({ repoRoot: root });
  assert.equal(r.state, 'blind');
  assert.notEqual(r.state, 'ok');
  assert.equal(r.comparable, 0);
  assert.equal(typeof r.coverage, 'number'); // 0/0 → 0, still a number
  assert.equal(r.coverage, 0);
});

test('blind: ledger entries present but zero receipts → still blind', function () {
  const root = mkTree({
    ledger: [
      { decision_id: 'a', verdict: 'converged', receipt_hash: 'sha256:aa' },
      { decision_id: 'b', verdict: 'converged', receipt_hash: 'sha256:bb' },
    ],
    // no receipts key → no ship receipt dir at all
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.state, 'blind');
  assert.equal(r.comparable, 0);
  assert.equal(r.unverifiable, 2);
  assert.equal(r.coverage, 0);
});

test('ok: converged ledger + matching converged receipt', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.state, 'ok');
  assert.equal(r.comparable, 1);
  assert.equal(r.ok, 1);
  assert.equal(r.false_positive, 0);
  assert.equal(r.hash_bound, 1);
  assert.equal(r.coverage, 1);
});

test('false_positive: ledger says converged, receipt says divergent → inconsistent (F2)', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'divergent' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.state, 'inconsistent');
  assert.equal(exitCodeForState(r.state), 3);
  assert.notEqual(exitCodeForState(r.state), 0);
  assert.equal(r.comparable, 1);
  assert.equal(r.ok, 0);
  assert.equal(r.false_positive, 1);
  assert.equal(r.hash_bound, 1); // hash binds (real receipt), the VERDICT disagrees
});

test('false_positive: ledger converged, receipt skipped (E2 second case)', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'skipped' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.false_positive, 1);
  assert.equal(r.ok, 0);
});

test('unverifiable: ledger entry with no matching receipt', function () {
  const root = mkTree({
    ledger: [
      { decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' },
      { decision_id: 'gone', verdict: 'converged', receipt_hash: 'sha256:zz' },
    ],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.comparable, 1);
  assert.equal(r.unverifiable, 1);
  assert.equal(r.ok, 1);
});

test('hash_bound: declared receipt_hash mismatch is comparable but NOT bound → inconsistent (F2)', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'sha256:' + 'd'.repeat(64) }],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.comparable, 1);
  assert.equal(r.ok, 1);       // verdict still agrees
  assert.equal(r.hash_bound, 0); // but the declared binding is broken (E4)
  assert.equal(r.state, 'inconsistent');
  assert.equal(exitCodeForState(r.state), 3);
});

// ── M1 Task 3 (R5-F2): a declared-hash match is necessary but NOT sufficient ──

test('Task3: body tampered after hashing (verdict still agrees) → NOT bound → inconsistent', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged', tamperBody: true }],
  });
  const r = audit({ repoRoot: root });
  // The ledger's stored hash EQUALS the receipt's declared (stale) hash, and the
  // verdicts agree — pre-Task3 this counted as bound + ok. The recompute now fails.
  assert.equal(r.comparable, 1);
  assert.equal(r.ok, 1);          // verdicts agree (codex_verdict untouched)
  assert.equal(r.false_positive, 0);
  assert.equal(r.hash_bound, 0);  // recompute != declared → not bound
  assert.equal(r.state, 'inconsistent');
  assert.equal(exitCodeForState(r.state), 3);
});

test('Task3: schema-invalid receipt (declared hash consistent) → NOT bound → inconsistent', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged', schemaInvalidConsistent: true }],
  });
  const r = audit({ repoRoot: root });
  // declared === recompute (both of the round=99 body), so ONLY schema.validate
  // can reject it — proving the schema gate is load-bearing for hash_bound.
  assert.equal(r.comparable, 1);
  assert.equal(r.ok, 1);          // verdicts agree
  assert.equal(r.hash_bound, 0);  // schema invalid → not integrity-ok → not bound
  assert.equal(r.state, 'inconsistent');
});

test('raw files, no dedup: N ledger entries for one decision count N times', function () {
  const root = mkTree({
    ledger: [
      { decision_id: 'dash', verdict: 'converged', receipt_hash: 'sha256:1' },
      { decision_id: 'dash', verdict: 'converged', receipt_hash: 'sha256:2' },
      { decision_id: 'dash', verdict: 'converged', receipt_hash: 'sha256:3' },
    ],
    // no receipt for 'dash' → all three are unverifiable (dangling, receipt=0)
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.ledger_count, 3);
  assert.equal(r.unverifiable, 3);
  assert.equal(r.comparable, 0);
  assert.equal(r.state, 'blind');
});

test('degraded: an unparseable receipt file surfaces, does not crash', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged' }],
    rawFiles: [{ dir: 'receipts', name: 'broken.json', content: '{ not json' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.state, 'degraded');
  assert.equal(r.degraded, true);
  assert.ok(r.parse_failures >= 1);
  assert.equal(r.comparable, 1); // the good pair still compared
});

test('coverage is always a number (contract field)', function () {
  for (const spec of [{ ledger: [] }, {
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged' }],
  }]) {
    const r = audit({ repoRoot: mkTree(spec) });
    assert.equal(typeof r.coverage, 'number');
    assert.ok(Number.isFinite(r.coverage));
  }
});

// ── F2 (durable-evidence-substrate follow-up): graduated states + nonzero exits ──

test('incomplete: unverifiable>0 with zero false_positive → incomplete, nonzero exit (F2)', function () {
  const root = mkTree({
    ledger: [
      { decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' },
      { decision_id: 'gone', verdict: 'converged', receipt_hash: 'sha256:zz' },
    ],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.comparable, 1);
  assert.equal(r.unverifiable, 1);
  assert.equal(r.false_positive, 0);
  assert.equal(r.state, 'incomplete');
  assert.equal(exitCodeForState(r.state), 4);
  assert.notEqual(exitCodeForState(r.state), 0);
});

test('precedence: false_positive>0 AND unverifiable>0 → inconsistent wins (most-severe) (F2)', function () {
  const root = mkTree({
    ledger: [
      { decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }, // false_positive
      { decision_id: 'gone', verdict: 'converged', receipt_hash: 'sha256:zz' }, // unverifiable
    ],
    receipts: [{ decision_id: 'a', codex_verdict: 'divergent' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.false_positive, 1);
  assert.equal(r.unverifiable, 1);
  assert.equal(r.state, 'inconsistent'); // inconsistent OUTRANKS incomplete
  assert.equal(exitCodeForState(r.state), 3);
});

test('regression: a fully-clean bound corpus still → ok / exit 0 (no false alarm) (F2)', function () {
  const root = mkTree({
    ledger: [
      { decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' },
      { decision_id: 'b', verdict: 'converged', receipt_hash: 'MATCH' },
    ],
    receipts: [
      { decision_id: 'a', codex_verdict: 'converged' },
      { decision_id: 'b', codex_verdict: 'converged' },
    ],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.state, 'ok');
  assert.equal(exitCodeForState(r.state), 0);
  assert.equal(r.false_positive, 0);
  assert.equal(r.unverifiable, 0);
  assert.equal(r.hash_bound, r.comparable);
});

test('parse-degraded outranked by integrity: inconsistent + a stray parse failure → inconsistent (F2)', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'divergent' }],
    rawFiles: [{ dir: 'receipts', name: 'broken.json', content: '{ not json' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.degraded, true);
  assert.equal(r.state, 'inconsistent');
  assert.equal(exitCodeForState(r.state), 3);
});

test('exit-code oracle: state→code map is total and unknown fails closed (F2)', function () {
  assert.equal(exitCodeForState('ok'), 0);
  assert.equal(exitCodeForState('degraded'), 1);
  assert.equal(exitCodeForState('blind'), 2);
  assert.equal(exitCodeForState('inconsistent'), 3);
  assert.equal(exitCodeForState('incomplete'), 4);
  assert.notEqual(exitCodeForState('some-future-state'), 0); // unknown → nonzero (fail-closed)
});

// ── Implement-Codex IF1: TOTAL agreement — a non-'converged' ledger verdict is
// no longer a silent pass. ──

test('IF1: advisory ledger + converged receipt (mismatch) → inconsistent, nonzero', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'advisory', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.comparable, 1);
  assert.equal(r.false_positive, 1); // no longer silently passes
  assert.equal(r.ok, 0);
  assert.equal(r.state, 'inconsistent');
  assert.notEqual(exitCodeForState(r.state), 0);
});

test('IF1: skipped ledger + converged receipt (mismatch) → inconsistent, nonzero', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'skipped', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'converged' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.false_positive, 1);
  assert.equal(r.state, 'inconsistent');
  assert.notEqual(exitCodeForState(r.state), 0);
});

test('IF1: advisory ledger + unavailable receipt (agree) → ok / exit 0', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'advisory', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'unavailable' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.ok, 1);
  assert.equal(r.false_positive, 0);
  assert.equal(r.state, 'ok');
  assert.equal(exitCodeForState(r.state), 0);
});

test('IF1: skipped ledger + skipped receipt (agree) → ok / exit 0', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'skipped', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a', codex_verdict: 'skipped' }],
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.ok, 1);
  assert.equal(r.state, 'ok');
  assert.equal(exitCodeForState(r.state), 0);
});

test('IF1: converged ledger + receipt with NO codex_verdict (null) → inconsistent', function () {
  const root = mkTree({
    ledger: [{ decision_id: 'a', verdict: 'converged', receipt_hash: 'MATCH' }],
    receipts: [{ decision_id: 'a' }], // codex_verdict absent
  });
  const r = audit({ repoRoot: root });
  assert.equal(r.false_positive, 1); // null corroborates nothing
  assert.equal(r.state, 'inconsistent');
});
