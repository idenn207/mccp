'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dedupOQAndRisks,
  tokenize,
  jaccard,
  SIMILARITY_THRESHOLD,
} = require('../parsers/cross-section-dedupe');

test('tokenize basic — 한영 mix + stop word filter', () => {
  const toks = tokenize('the **OQ-a.** stale plan 판정 기준 of feature');
  // marker stripped, stop words removed
  assert.ok(!toks.has('the'));
  assert.ok(!toks.has('of'));
  assert.ok(toks.has('stale'));
  assert.ok(toks.has('plan'));
  assert.ok(toks.has('판정'));
});

test('jaccard 0 when disjoint', () => {
  const a = tokenize('apple banana cherry date');
  const b = tokenize('zeppelin yamaha xenon walrus');
  assert.equal(jaccard(a, b), 0);
});

test('jaccard ≥ 0.45 → synthetic overlap match', () => {
  const oq = [{ text: 'stale plan 판정 기준 false positive 검출' }];
  const rs = [{ risk: 'stale plan 판정 기준 false positive 발생' }];
  const out = dedupOQAndRisks(oq, rs);
  assert.equal(out.risks.length, 1);
  assert.ok(out.risks[0].relatedOpenQuestion);
  assert.ok(out.risks[0]._dedupeScore >= SIMILARITY_THRESHOLD);
});

test('F3 absorption fixture A — real PRD OQ-a ↔ Risk row 1 (stale plan)', () => {
  const oq = [{
    text: 'Stale plan 판정 기준 — (i) staleness guard fix가 충분한지, (ii) plan 자체 상태 다른 신호',
  }];
  const rs = [{
    risk: 'stale plan 판정 기준이 false-positive로 정상 in-progress plan을 stale 표시하면 dashboard 신뢰도 손상',
    impact: 'high',
    likelihood: 'medium',
  }];
  const out = dedupOQAndRisks(oq, rs);
  assert.ok(out.risks[0].relatedOpenQuestion, 'F3 absorption: OQ-a/Risk-1 must match');
  assert.ok(out.risks[0]._dedupeScore >= SIMILARITY_THRESHOLD);
});

test('F3 absorption fixture B — OQ-f ↔ Risk row 2 (action prompt template, real PRD)', () => {
  // 실제 PRD v1-4-2-dashboard-overhaul.prd.md 의 OQ-f + Risk row 2 (mitigation 동반).
  // F3 absorption은 risk+mitigation 결합 tokenize로 axis 매칭 가능.
  const oq = [{
    text: 'OQ-f. OQ/Risk actionability prompt template 생성 source — (i) item text → static template (e.g., /mccp:plan 또는 /codex:rescue \'item\'), (ii) LLM-derived (briefing infra 재활용), (iii) plan body 명시 anchor',
  }];
  const rs = [{
    risk: 'Actionability prompt template이 작동 안 하는 command를 잘못 제시',
    mitigation: 'static template 화이트리스트(/mccp:plan, /mccp:plan-prd, /codex:rescue)로 시작, LLM-derived는 OQ-f 결정 후',
    impact: 'medium',
    likelihood: 'medium',
  }];
  const out = dedupOQAndRisks(oq, rs);
  assert.ok(out.risks[0].relatedOpenQuestion, 'F3 absorption: OQ-f/Risk-2 must match via combined tokens');
  assert.ok(out.risks[0]._dedupeScore >= SIMILARITY_THRESHOLD);
});

test('marker dot variant — **OQ-a.** / **F1.** / **a.** stripped before tokenize', () => {
  const oq = [{ text: '**OQ-a.** stale plan 판정 기준 detection axis' }];
  const rs = [{ risk: '**F1.** stale plan 판정 기준 false positive detection axis' }];
  const out = dedupOQAndRisks(oq, rs);
  assert.ok(out.risks[0].relatedOpenQuestion, 'marker dot variant must strip and match');
});

test('Risks row preserved (cue only, no removal)', () => {
  const oq = [{ text: 'stale plan 판정 기준 false positive 검출 detection' }];
  const rs = [
    { risk: 'stale plan 판정 기준 false positive 발생 detection', impact: 'high' },
    { risk: 'totally unrelated network outage', impact: 'low' },
  ];
  const out = dedupOQAndRisks(oq, rs);
  assert.equal(out.risks.length, 2, 'Risks count unchanged');
  assert.ok(out.risks[0].relatedOpenQuestion);
  assert.ok(!out.risks[1].relatedOpenQuestion);
});
