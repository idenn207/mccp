'use strict';

// diverse-agent-review M1 Task 11 assertion (8) + DD6 — RECEIPT HASH STABILITY.
//
// Two directions, both required:
//   (a) Every git-tracked ship receipt must still recompute to its sealed
//       receipt_hash, and must carry none of the new keys. §3.12 forbids
//       rehashing tracked receipts, so a schema addition that perturbed their
//       digest would be a silent integrity break across the whole audit corpus.
//   (b) The new meta.review_* fields must actually be INSIDE the digest. They
//       are deliberately absent from hash.js's carve-out list: briefing_* is
//       carved out because it is stamped after sealing and cannot hash itself,
//       whereas review_* is settled at write time and is part of the approval
//       record. If instrumentation could be edited without breaking the seal,
//       the audit story it tells would be unfalsifiable.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { receiptHash } = require('../../receipt/hash');
const { makeSkeleton, validate } = require('../../receipt/schema');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const SHIP_DIR = path.join(REPO_ROOT, '.claude/receipts/mccp-pr-codex');

const NEW_RESOLUTION_KEYS = ['review_verdict', 'review_source', 'review_proof'];
const NEW_META_KEYS = ['review_l3_invoked', 'review_l3_reason', 'review_wall_clock_ms'];

function trackedShipReceipts() {
  if (!fs.existsSync(SHIP_DIR)) return [];
  return fs.readdirSync(SHIP_DIR)
    .filter(function (f) { return f.endsWith('.json'); })
    .map(function (f) {
      const p = path.join(SHIP_DIR, f);
      try {
        return { file: f, receipt: JSON.parse(fs.readFileSync(p, 'utf8')) };
      } catch (_) {
        return { file: f, receipt: null };
      }
    });
}

// ── (a) the tracked corpus is untouched ──────────────────────────────────────

test('every tracked ship receipt still recomputes to its sealed receipt_hash', () => {
  const corpus = trackedShipReceipts();
  assert.ok(corpus.length > 0, 'expected a non-empty ship corpus to audit');

  const broken = [];
  corpus.forEach(function (entry) {
    if (!entry.receipt) { broken.push(entry.file + ': unparseable'); return; }
    if (typeof entry.receipt.receipt_hash !== 'string') {
      broken.push(entry.file + ': no receipt_hash');
      return;
    }
    const recomputed = receiptHash(entry.receipt);
    if (recomputed !== entry.receipt.receipt_hash) {
      broken.push(entry.file + ': sealed ' + entry.receipt.receipt_hash.slice(0, 19) +
        '… but recomputes to ' + recomputed.slice(0, 19) + '…');
    }
  });
  assert.deepEqual(broken, [], 'M1 must not perturb any tracked receipt digest');
});

test('no tracked ship receipt carries the new M1 keys (DD6 present-only)', () => {
  const offenders = [];
  trackedShipReceipts().forEach(function (entry) {
    if (!entry.receipt) return;
    const res = entry.receipt.resolution || {};
    const meta = entry.receipt.meta || {};
    NEW_RESOLUTION_KEYS.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(res, k)) offenders.push(entry.file + '.resolution.' + k);
    });
    NEW_META_KEYS.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(meta, k)) offenders.push(entry.file + '.meta.' + k);
    });
  });
  assert.deepEqual(offenders, []);
});

test('makeSkeleton does not materialize the new keys (DD6)', () => {
  const sk = makeSkeleton({});
  NEW_RESOLUTION_KEYS.forEach(function (k) {
    assert.equal(Object.prototype.hasOwnProperty.call(sk.resolution, k), false, k);
  });
  NEW_META_KEYS.forEach(function (k) {
    assert.equal(Object.prototype.hasOwnProperty.call(sk.meta, k), false, k);
  });
});

test('a legacy-shaped receipt hashes identically before and after the keys exist', () => {
  // Same body, once bare and once with the keys explicitly absent — the digest
  // must not depend on the schema knowing about them.
  const a = makeSkeleton({});
  a.gate_id = 'mccp-pr-codex';
  a.decision_id = 'legacy-x';
  a.receipt_hash = null;
  const b = JSON.parse(JSON.stringify(a));
  assert.equal(receiptHash(a), receiptHash(b));
});

// ── (b) the new fields ARE sealed ────────────────────────────────────────────

function receiptWithReview() {
  const r = makeSkeleton({});
  r.gate_id = 'mccp-plan-codex';
  r.phase = 'plan';
  r.decision_id = 'feature-x';
  r.resolution.review_verdict = 'converged';
  r.resolution.review_source = 'multi-agent';
  r.resolution.review_proof = {
    layers: { l1: 'converged', l2: 'converged', l3: null },
    verification_verdict: 'converged',
    quorum: { passed: true, required: 3, of: 4, roles: 4, responded: 4 },
    perspectives: [
      { perspective: 'architect', verdict: 'pass' },
      { perspective: 'security', verdict: 'pass' },
      { perspective: 'test', verdict: 'pass' },
      { perspective: 'invariant', verdict: 'pass' },
    ],
    dispatch_evidence: ['.claude/state/dispatches/abc.envelope.json'],
    reviewed_plan_hash: 'sha256:' + 'a'.repeat(64),
  };
  r.meta.review_l3_invoked = false;
  r.meta.review_wall_clock_ms = 123456;
  return r;
}

test('meta.review_wall_clock_ms is INSIDE receipt_hash (no carve-out)', () => {
  const a = receiptWithReview();
  const b = receiptWithReview();
  b.meta.review_wall_clock_ms = 999999;
  assert.notEqual(receiptHash(a), receiptHash(b),
    'editing the instrumentation must break the seal');
});

test('meta.review_l3_invoked and review_l3_reason are INSIDE receipt_hash', () => {
  const a = receiptWithReview();
  const b = receiptWithReview();
  b.meta.review_l3_invoked = true;
  assert.notEqual(receiptHash(a), receiptHash(b));

  const c = receiptWithReview();
  c.meta.review_l3_reason = 'codex timeout';
  assert.notEqual(receiptHash(a), receiptHash(c));
});

test('resolution.review_verdict / review_source / review_proof are INSIDE receipt_hash', () => {
  const a = receiptWithReview();

  const v = receiptWithReview();
  v.resolution.review_verdict = 'divergent';
  assert.notEqual(receiptHash(a), receiptHash(v), 'review_verdict');

  const s = receiptWithReview();
  s.resolution.review_source = 'hybrid';
  assert.notEqual(receiptHash(a), receiptHash(s), 'review_source');

  const p = receiptWithReview();
  p.resolution.review_proof.quorum.responded = 2;
  assert.notEqual(receiptHash(a), receiptHash(p), 'review_proof');
});

test('briefing_* stays carved out — the contrast that justifies the choice', () => {
  const a = receiptWithReview();
  const b = receiptWithReview();
  b.meta.briefing_summary = 'stamped after sealing, therefore excluded';
  b.meta.briefing_token_count = 42;
  assert.equal(receiptHash(a), receiptHash(b),
    'briefing is stamped post-seal and must stay outside the digest');
});

test('a receipt carrying the full review triple is schema-valid', () => {
  const r = receiptWithReview();
  r.plan_hash = 'sha256:' + 'c'.repeat(64);
  r.base_sha = 'abc1234';
  r.head_sha = 'abc1234';
  r.subject_hash = 'sha256:' + 'd'.repeat(64);
  r.receipt_hash = 'sha256:' + 'e'.repeat(64);
  r.meta.command = '/mccp-plan-codex';
  const res = validate(r);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});
