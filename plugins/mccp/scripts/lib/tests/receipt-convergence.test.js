'use strict';

// M1 (integrity-unification) Task 1b — a divergent/critical ship must NEVER read
// or render as converged. Covers the shared helper, the derive projection source
// (which every renderer/snapshot consumer inherits from), and the escalate
// detector semantic.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { isConvergedVerdict, isDivergentVerdict } = require('../receipt-convergence');
const escalate = require('../escalate-detector');
const { scanReceipts } = require('../../derive/sources/receipts');
const { makeSkeleton } = require('../../receipt/schema');
const { receiptHash } = require('../../receipt/hash');
const { writeReceipt } = require('../../receipt/store');

// ── shared helper ─────────────────────────────────────────────────────────────

test('isConvergedVerdict: divergent/critical are NEVER converged (converged flag ignored)', () => {
  assert.equal(isConvergedVerdict({ converged: true, codex_verdict: 'divergent' }), false);
  assert.equal(isConvergedVerdict({ converged: true, codex_verdict: 'critical' }), false);
});

test('isConvergedVerdict: converged/skipped/unavailable/absent fall back to the flag', () => {
  assert.equal(isConvergedVerdict({ converged: true, codex_verdict: 'converged' }), true);
  assert.equal(isConvergedVerdict({ converged: true, codex_verdict: 'skipped' }), true);
  assert.equal(isConvergedVerdict({ converged: true, codex_verdict: 'unavailable' }), true);
  assert.equal(isConvergedVerdict({ converged: true }), true); // legacy (absent)
  assert.equal(isConvergedVerdict({ converged: false }), false);
  assert.equal(isConvergedVerdict(null), false);
});

test('isDivergentVerdict: only divergent/critical', () => {
  assert.equal(isDivergentVerdict({ codex_verdict: 'divergent' }), true);
  assert.equal(isDivergentVerdict({ codex_verdict: 'critical' }), true);
  assert.equal(isDivergentVerdict({ converged: true }), false);
  assert.equal(isDivergentVerdict({ codex_verdict: 'skipped' }), false);
});

// ── derive projection (the single source every renderer/snapshot inherits) ─────

function tmpRepo() { return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-conv-')); }
function cleanup(d) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* ignore */ } }

function shipReceipt(root, id, codexVerdict) {
  const r = makeSkeleton({});
  r.gate_id = 'mccp-pr-codex';
  r.phase = 'pr';
  r.decision_id = id;
  r.plan_hash = 'sha256:' + 'a'.repeat(64);
  r.base_sha = 'a'.repeat(40);
  r.head_sha = 'b'.repeat(40);
  r.subject_hash = 'sha256:' + 'c'.repeat(64);
  r.resolution.converged = true; // always-true, as real ships are
  r.resolution.codex_verdict = codexVerdict;
  r.meta.command = '/mccp:pr';
  r.receipt_hash = receiptHash(r);
  writeReceipt(root, r);
}

test('derive projection: a divergent ship projects converged=false + codex_verdict passthrough', () => {
  const root = tmpRepo();
  try {
    shipReceipt(root, 'div-ship', 'divergent');
    shipReceipt(root, 'ok-ship', 'converged');
    const projected = scanReceipts(root).items;
    const div = projected.find((p) => p.decision_id === 'div-ship');
    const ok = projected.find((p) => p.decision_id === 'ok-ship');
    assert.ok(div, 'divergent ship projected');
    assert.equal(div.converged, false, 'divergent ship must NOT project as converged');
    assert.equal(div.codex_verdict, 'divergent');
    assert.equal(ok.converged, true, 'converged ship still projects converged');
    assert.equal(ok.codex_verdict, 'converged');
  } finally { cleanup(root); }
});

// ── escalate-detector semantic ────────────────────────────────────────────────

test('escalate: a divergent ship (converged=true, round=1) IS divergent-unresolved', () => {
  const receipt = {
    gate_id: 'mccp-pr-codex',
    findings: [],
    resolution: { converged: true, codex_verdict: 'divergent', rounds: 1, open_questions: [] },
  };
  const res = escalate.detectFromReceipt(receipt);
  assert.equal(res.evidence.divergentUnresolved, true);
  assert.equal(res.trigger, 'divergent_unresolved');
  assert.equal(res.escalate, true);
});

test('escalate: a converged ship is NOT divergent-unresolved', () => {
  const receipt = {
    gate_id: 'mccp-pr-codex',
    findings: [],
    resolution: { converged: true, codex_verdict: 'converged', rounds: 1, open_questions: [] },
  };
  const res = escalate.detectFromReceipt(receipt);
  assert.equal(res.evidence.divergentUnresolved, false);
});
