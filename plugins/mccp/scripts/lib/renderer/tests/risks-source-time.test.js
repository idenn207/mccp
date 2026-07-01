'use strict';

// Dashboard Readability M2 — 위험 항목 출처/시각 meta-cue + 평탄(no prd-group) + cross-PRD
// 정렬 보존(Codex F1 — 정렬된 배열 직접 방출, groupByPrd 버킷 순서로 flatten 금지).
// html·md 양쪽에서 전역 severity 순서가 PRD 그룹 경계를 넘어 보존되는지 못박는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const formatUtils = require('../format-utils');
const { renderRisks } = require('../sections/risks');

const DAY = 86400_000;

// prdKey 'a'(LOW) 가 'b'(CRITICAL) 보다 사전순 먼저 → groupByPrd 버킷 순서로 flatten 하면
// LOW 가 앞에 와 전역 severity 가 깨진다. flat 정렬 방출은 CRITICAL 을 먼저 둬야 한다.
function fixture(now) {
  const planPrd = new Map([
    ['.claude/plans/pa.plan.md', { prdPath: '/x/a.prd.md', prdLabel: 'PRD A', prdKey: 'a' }],
    ['.claude/plans/pb.plan.md', { prdPath: '/x/b.prd.md', prdLabel: 'PRD B', prdKey: 'b' }],
  ]);
  const planActivity = new Map([
    ['.claude/plans/pa.plan.md', now - 90 * DAY],    // >60일 → 절대일자 bin
    ['.claude/plans/pb.plan.md', now - 2 * 60_000],  // 2분 전 → 상대 표기
  ]);
  const risks = [
    { risk: 'LOW 위험 A', impact: 'Low', likelihood: 'Low', mitigation: 'm', source: '.claude/plans/pa.plan.md', ordinal: 0 },
    { risk: 'CRIT 위험 B', impact: 'Critical', likelihood: 'High', mitigation: 'm', source: '.claude/plans/pb.plan.md', ordinal: 1 },
  ];
  return renderRisks({ sources: {} }, formatUtils, { risks, planPrd, planActivity }, { now });
}

test('출처 라벨 — 위험 항목 상단에 출처 plan basename(.mono)', () => {
  const { html } = fixture(Date.now());
  assert.ok(html.includes('출처 <span class="mono">pa.plan.md</span>'), 'PRD A 출처 라벨');
  assert.ok(html.includes('출처 <span class="mono">pb.plan.md</span>'), 'PRD B 출처 라벨');
});

test('활동 시각 — planActivity ms 있는 항목에 .cue-sec 시각(>60일 절대 / 최근 상대)', () => {
  const now = new Date(2026, 5, 30, 12, 0, 0).getTime();
  const { html } = fixture(now);
  // pb 활동 2분 전 → 상대 표기.
  assert.ok(html.includes('<span class="cue-sec">2분 전</span>'), 'pb 최근 활동 상대 시각');
  // pa 활동 90일 전 → 절대일자(M월 D일, 같은 연도). 양변 로컬 Date 동일 파생.
  const d = new Date(now - 90 * DAY);
  const abs = (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  assert.ok(html.includes('<span class="cue-sec">' + abs + '</span>'), 'pa >60일 절대일자: ' + abs);
});

test('시각 생략 — planActivity ms 없는 항목은 출처만(fail-open 정직 표기)', () => {
  const now = Date.now();
  // planActivity 미전달 → 시각 cue 없음, 출처는 표시.
  const risks = [{ risk: '활동신호 없는 위험', impact: 'High', likelihood: 'High', mitigation: 'm', source: '.claude/plans/pa.plan.md', ordinal: 0 }];
  const planPrd = new Map([['.claude/plans/pa.plan.md', { prdPath: '/x/a.prd.md', prdLabel: 'PRD A', prdKey: 'a' }]]);
  const { html } = renderRisks({ sources: {} }, formatUtils, { risks, planPrd }, { now });
  assert.ok(html.includes('출처 <span class="mono">pa.plan.md</span>'), '출처 라벨은 항상');
  assert.ok(!html.includes('class="cue-sec"'), 'planActivity 부재 → 시각 cue 생략');
});

test('평탄 구조 — prd-group chrome 0, 단일 stack-list', () => {
  const { html } = fixture(Date.now());
  assert.equal((html.match(/class="prd-group"/g) || []).length, 0, 'prd-group 0');
  assert.equal((html.match(/class="stack-list"/g) || []).length, 1, '단일 stack-list');
});

test('cross-PRD 정렬 보존(Codex F1) — CRITICAL(PRD-B) 이 LOW(PRD-A) 보다 먼저(html)', () => {
  const { html } = fixture(Date.now());
  // 전역 severity desc — CRITICAL(B) 가 LOW(A) 앞(버킷 순서 a→b 가 아님).
  assert.ok(html.indexOf('CRIT 위험 B') < html.indexOf('LOW 위험 A'),
    'html: CRITICAL 이 LOW 보다 먼저');
  // 첫 li-item 의 data-prd 가 'b'(CRITICAL 출처) + data-sev 가 둘째보다 큼.
  const lis = html.match(/<li class="li-item"[^>]*>/g) || [];
  assert.ok(/data-prd="b"/.test(lis[0]), '첫 항목 data-prd="b"(severity 우선, 버킷 순서 아님)');
  const sev0 = Number((lis[0].match(/data-sev="(\d+)"/) || [])[1]);
  const sev1 = Number((lis[1].match(/data-sev="(\d+)"/) || [])[1]);
  assert.ok(sev0 > sev1, 'data-sev 전역 desc: ' + sev0 + ' > ' + sev1);
});

test('cross-PRD 정렬 보존(Codex F1) — md 도 동일(no-JS 동등, 정렬 배열 직접 방출)', () => {
  const { md } = fixture(Date.now());
  assert.ok(md.indexOf('CRIT 위험 B') < md.indexOf('LOW 위험 A'),
    'md: CRITICAL 이 LOW 보다 먼저(그룹 헤더 없이 전역 정렬)');
  assert.ok(!md.includes('**PRD A · ') && !md.includes('**PRD B · '), '평탄 — 그룹 헤더 미방출');
});

test('위계(F-DC1) — 출처 meta-cue 가 li-main 상단(제목 li-q 앞)', () => {
  const { html } = fixture(Date.now());
  // 첫 항목 li 안에서 meta-cue(출처) 가 li-q(제목) 보다 먼저 등장.
  const li = html.slice(html.indexOf('<li class="li-item"'));
  const cueIdx = li.indexOf('class="meta-cue"');
  const qIdx = li.indexOf('class="li-q"');
  assert.ok(cueIdx > -1 && qIdx > -1 && cueIdx < qIdx, '출처 meta-cue 가 제목 앞(상단)');
});
