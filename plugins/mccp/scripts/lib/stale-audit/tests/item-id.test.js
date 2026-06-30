'use strict';

// Dashboard Interactivity M4 — item-id SSoT tests.
// Covers: determinism (same ref → same id), sensitivity (1-char text change →
// different id), separator-normalization (backslash ↔ forward-slash → same id),
// duplicate-text safety (same text, different ordinal → different id), and the
// renderer↔server 合致 invariant (an id the renderer would embed is reproduced
// by enumerate-derived refs the server re-enumerates).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { computeItemId, norm, normSource } = require('../item-id');
const { enumerate } = require('../enumerate');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-itemid-'));
  fs.mkdirSync(path.join(dir, '.claude', 'plans'), { recursive: true });
  return dir;
}

test('computeItemId: same ref → same id', () => {
  const ref = { kind: 'risk', source: '.claude/plans/x.plan.md', ordinal: 0, text: '동일 위험' };
  assert.equal(computeItemId(ref), computeItemId({ ...ref }));
});

test('computeItemId: 1-char text change → different id', () => {
  const a = { kind: 'oq', source: '.claude/plans/x.plan.md', lineNumber: 5, text: '질문 텍스트' };
  const b = { ...a, text: '질문 텍스트.' };
  assert.notEqual(computeItemId(a), computeItemId(b));
});

test('computeItemId: separator-normalized (backslash == forward-slash)', () => {
  const win = { kind: 'risk', source: '.claude\\plans\\x.plan.md', ordinal: 2, text: 'r' };
  const nix = { kind: 'risk', source: '.claude/plans/x.plan.md', ordinal: 2, text: 'r' };
  assert.equal(computeItemId(win), computeItemId(nix));
});

test('computeItemId: duplicate text, different ordinal → different id (test 14 안전가드)', () => {
  const a = { kind: 'risk', source: '.claude/plans/x.plan.md', ordinal: 0, text: '같은 위험' };
  const b = { kind: 'risk', source: '.claude/plans/x.plan.md', ordinal: 1, text: '같은 위험' };
  assert.notEqual(computeItemId(a), computeItemId(b));
});

test('computeItemId: oq anchors on lineNumber, risk anchors on ordinal', () => {
  // risk ignores lineNumber (uses ordinal) — an enumerate risk ref carries both.
  const riskWithLine = { kind: 'risk', source: 's', ordinal: 3, lineNumber: 99, text: 't' };
  const riskNoLine = { kind: 'risk', source: 's', ordinal: 3, text: 't' };
  assert.equal(computeItemId(riskWithLine), computeItemId(riskNoLine));
  // oq ignores ordinal (uses lineNumber).
  const oqA = { kind: 'oq', source: 's', lineNumber: 7, ordinal: 1, text: 't' };
  const oqB = { kind: 'oq', source: 's', lineNumber: 7, ordinal: 2, text: 't' };
  assert.equal(computeItemId(oqA), computeItemId(oqB));
});

test('norm mirrors apply.js: whitespace collapse + trim', () => {
  assert.equal(norm('  a   b\tc  '), 'a b c');
  assert.equal(norm(null), '');
});

test('normSource collapses both separators to /', () => {
  assert.equal(normSource('a\\b/c'), 'a/b/c');
});

test('renderer↔server 合致: enumerate refs reproduce renderer-embedded ids', () => {
  const repo = tmpRepo();
  const plan = [
    '# Plan: fixture',
    '',
    '## Risks',
    '',
    '| Risk | Likelihood | Impact | Mitigation |',
    '|---|---|---|---|',
    '| 첫 위험 | 중 | 높음 | 완화 A |',
    '| 같은 텍스트 | 낮 | 낮음 | 완화 B |',
    '| 같은 텍스트 | 낮 | 낮음 | 완화 C |',
    '',
    '## Open Questions',
    '',
    '- 첫 번째 질문 — severity HIGH',
    '- 두 번째 질문 — severity LOW',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(repo, '.claude', 'plans', 'fixture.plan.md'), plan, 'utf8');

  const { items } = enumerate({ repoRoot: repo });
  const risks = items.filter((it) => it.kind === 'risk');
  const oqs = items.filter((it) => it.kind === 'oq');
  assert.equal(risks.length, 3);
  assert.equal(oqs.length, 2);

  // The renderer would build a risk ref from the derive model: source is
  // path.relative(repoRoot, file) (win32 backslash possible) + ordinal + text.
  // After normSource the server's enumerate id (forward-slash source) matches.
  for (const r of risks) {
    const serverId = computeItemId(r);
    const rendererRef = {
      kind: 'risk',
      source: r.source.split('/').join(path.sep), // simulate platform-native derive path
      ordinal: r.ordinal,
      text: r.text,
    };
    assert.equal(computeItemId(rendererRef), serverId, 'risk id mismatch for ordinal ' + r.ordinal);
  }
  for (const q of oqs) {
    const serverId = computeItemId(q);
    const rendererRef = {
      kind: 'oq',
      source: q.source.split('/').join(path.sep),
      lineNumber: q.lineNumber,
      text: q.text,
    };
    assert.equal(computeItemId(rendererRef), serverId, 'oq id mismatch for line ' + q.lineNumber);
  }

  // Duplicate-text risk rows ("같은 텍스트" twice) get distinct ids via ordinal.
  const dupIds = risks.filter((r) => r.text === '같은 텍스트').map(computeItemId);
  assert.equal(dupIds.length, 2);
  assert.notEqual(dupIds[0], dupIds[1]);
});
