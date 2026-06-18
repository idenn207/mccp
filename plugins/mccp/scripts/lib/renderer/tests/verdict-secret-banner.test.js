'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeVerdict } = require('../verdict');

function baseModel(extra) {
  return Object.assign({
    schema_version: 'v1',
    masked: true,
    m0_capability: { contract_present: true, evidence: '' },
    sources: {
      plans:     { items: [] },
      receipts:  { items: [] },
      state:     { item: null },
      backlog:   { count: 0 },
      fix_task:  { item: null },
      pr:        { item: null },
      envelopes: { items: [] },
    },
    warnings: [],
    mask_hits: [],
  }, extra || {});
}

// Path (a) — mask_hits empty → step 1.5 skipped, falls through.
test('verdict step 1.5 path a: empty mask_hits → step 1.5 skipped', () => {
  const v = computeVerdict(baseModel({}), { planStatuses: new Map() });
  assert.notEqual(v.tone, 'red', 'no severe hits → not red');
});

// Path (b) — mask_hits with sk-key (severe) → step 1.5 fires red banner.
test('verdict step 1.5 path b: severe sk-key hit → red banner', () => {
  const m = baseModel({
    mask_hits: [
      { kind: 'sk-key', count: 2, severe: true, source_id: 'env-abc-12345', source_kind: 'envelope' },
    ],
  });
  const v = computeVerdict(m, { planStatuses: new Map() });
  assert.equal(v.tone, 'red');
  assert.equal(v.icon, '⚠');
  assert.match(v.text, /시크릿 2건 감지/);
  assert.match(v.text, /즉시 키 회전/);
  assert.match(v.text, /env-abc-12345/);
  // impeccable F1 absorption: no em dash.
  assert.doesNotMatch(v.text, /—/);
});

// Path (b2) — Bearer-only (non-severe) hit does NOT fire the banner.
test('verdict step 1.5 path b2: bearer-only (not severe) → step 1.5 skipped', () => {
  const m = baseModel({
    mask_hits: [
      { kind: 'bearer', count: 3, severe: false, source_id: 'r1', source_kind: 'receipt' },
    ],
  });
  const v = computeVerdict(m, { planStatuses: new Map() });
  assert.notEqual(v.tone, 'red');
});

// Path (c) — M0 contract missing AND severe mask hits → step 1 wins (precedence).
test('verdict step 1.5 path c: M0 contract missing precedes mask-hit banner', () => {
  const m = baseModel({
    m0_capability: { contract_present: false, evidence: 'schema gone' },
    mask_hits: [{ kind: 'sk-key', count: 1, severe: true, source_id: 'r1', source_kind: 'receipt' }],
  });
  const v = computeVerdict(m, { planStatuses: new Map() });
  assert.equal(v.tone, 'red');
  assert.match(v.text, /schema contract missing/);
});
