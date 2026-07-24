'use strict';

// M2 F2 (integrity-unification — Codex divergent absorption). The shared block
// formatter is the single source of the TAMPER label + "Do NOT regenerate"
// guidance for preflight.js, receipt-prompt.js, and receipt-skill.js. Before it,
// only preflight labeled a tamper block; the two hooks printed generic INVALID and
// always told the operator to "Write missing receipt" — which overwrites the
// tampered evidence. These unit tests pin the shared logic all three surfaces use.

const test = require('node:test');
const assert = require('node:assert');
const bf = require('../block-format');

test('entryLabel: tempfail → TEMPFAIL, tamper → TAMPER, else INVALID', function () {
  assert.strictEqual(bf.entryLabel({ kind: 'tempfail' }).trim(), 'TEMPFAIL');
  assert.strictEqual(bf.entryLabel({ kind: 'receipt-tamper' }).trim(), 'TAMPER');
  assert.strictEqual(bf.entryLabel({ kind: 'subject-tamper' }).trim(), 'TAMPER');
  assert.strictEqual(bf.entryLabel({ kind: 'advisory' }).trim(), 'INVALID');
  assert.strictEqual(bf.entryLabel({}).trim(), 'INVALID');
});

test('hasTamper: true only when a tamper-kind block is present', function () {
  assert.strictEqual(bf.hasTamper({ blocking: [{ kind: 'subject-tamper' }] }), true);
  assert.strictEqual(bf.hasTamper({ blocking: [{ kind: 'receipt-tamper' }] }), true);
  assert.strictEqual(bf.hasTamper({ blocking: [{ kind: 'advisory' }] }), false);
  assert.strictEqual(bf.hasTamper({ blocking: [] }), false);
  assert.strictEqual(bf.hasTamper({}), false);
});

test('tamperGuidanceLines: receipt-tamper → receipt_hash line with Do NOT regenerate', function () {
  const lines = bf.tamperGuidanceLines({ blocking: [{ kind: 'receipt-tamper' }] }, '[TAG]');
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /^\[TAG\] TAMPER: receipt_hash mismatch/);
  assert.match(lines[0], /Do NOT regenerate \(that destroys the evidence\)/);
});

test('tamperGuidanceLines: subject-tamper → subject_hash line with Do NOT regenerate', function () {
  const lines = bf.tamperGuidanceLines({ blocking: [{ kind: 'subject-tamper' }] }, '[TAG]');
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /^\[TAG\] TAMPER: subject_hash mismatch/);
  assert.match(lines[0], /Do NOT regenerate/);
});

test('tamperGuidanceLines: both kinds → both lines; no tamper → empty', function () {
  const both = bf.tamperGuidanceLines({ blocking: [{ kind: 'receipt-tamper' }, { kind: 'subject-tamper' }] });
  assert.strictEqual(both.length, 2);
  assert.match(both[0], /receipt_hash/);
  assert.match(both[1], /subject_hash/);
  assert.deepStrictEqual(bf.tamperGuidanceLines({ blocking: [{ kind: 'advisory' }] }), []);
  assert.deepStrictEqual(bf.tamperGuidanceLines({ blocking: [] }), []);
});

test('tamperGuidanceLines: default tag is the gate tag', function () {
  const lines = bf.tamperGuidanceLines({ blocking: [{ kind: 'subject-tamper' }] });
  assert.match(lines[0], /^\[MCCP-RECEIPT-GATE\] TAMPER: subject_hash/);
});

test('blockDetailLines: labels each entry; a tamper block reads TAMPER not INVALID', function () {
  const lines = bf.blockDetailLines({
    missing: [{ gate_id: 'g1', reason: 'r1' }],
    stale: [{ gate_id: 'g2', reason: 'r2' }],
    blocking: [{ gate_id: 'g3', reason: 'r3', kind: 'subject-tamper' }],
    open_critical: [{ gate_id: 'g4', item: 'i4' }],
  });
  assert.ok(lines.some(function (l) { return /MISSING\s+g1: r1/.test(l); }));
  assert.ok(lines.some(function (l) { return /STALE\s+g2: r2/.test(l); }));
  assert.ok(lines.some(function (l) { return /TAMPER\s+g3: r3/.test(l); }), 'subject-tamper → TAMPER label');
  assert.ok(lines.every(function (l) { return !/INVALID\s+g3/.test(l); }), 'never INVALID for a tamper block');
  assert.ok(lines.some(function (l) { return /CRITICAL\s+g4: i4/.test(l); }));
});

test('blockDetailLines: a non-tamper block reads INVALID', function () {
  const lines = bf.blockDetailLines({ blocking: [{ gate_id: 'g', reason: 'advisory mode', kind: 'advisory' }] });
  assert.ok(lines.some(function (l) { return /INVALID\s+g: advisory mode/.test(l); }));
});
