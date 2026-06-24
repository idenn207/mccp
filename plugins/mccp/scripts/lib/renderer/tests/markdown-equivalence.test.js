'use strict';

// v1.18.2 M4 — STATUS.md plain-text 동등본 회귀 가드.
// (1) renderDetailMd SSoT 단위 — rows/sections(proseText)/action/omit/indent +
//     strip 정규식 0(code span·링크·엔티티·한국어 raw 보존, Codex F1)
// (2) 빌더 raw 보존 — titleText + sections triple + relatedOpenQuestion(Codex F2)
// (3) 섹션 md 동등 — OQ/Risk 일원화 인라인, timeline receipt hash, milestone 요약
// (4) full render — HTML drawer detail ↔ md 정보 동등 + placeholder/더미 0 + 0건 degrade

const test = require('node:test');
const assert = require('node:assert/strict');

const formatUtils = require('../format-utils');
const dd = require('../parsers/drawer-detail');
const { renderOpenQuestions } = require('../sections/open-questions');
const { renderRisks } = require('../sections/risks');
const { renderAuditTimeline } = require('../sections/audit-timeline');
const { renderMilestoneHistory } = require('../sections/milestone-history');
const { renderStatus } = require('../index');

// ── (1) renderDetailMd SSoT 단위 ──────────────────────────────────────────────

test('renderDetailMd — rows(mono backtick / 평문)·action 2-space 중첩', () => {
  const detail = {
    title: '<strong>q</strong>', titleText: 'q',
    rows: [['출처', 'plan.md', true], ['섹션', 'Open Questions'], ['line', 'line 70']],
    action: '/mccp:plan "x"',
  };
  const md = dd.renderDetailMd(detail, formatUtils);
  assert.equal(md,
    '  - 출처: `plan.md`\n'
    + '  - 섹션: Open Questions\n'
    + '  - line: line 70\n'
    + '  - 다음 액션: `/mccp:plan "x"`');
});

test('renderDetailMd — sections 는 proseText(raw, index 2) 사용, proseHtml strip 0 (Codex F1)', () => {
  // proseHtml(index 1)에 HTML 태그가 들어와도 md 는 proseText(index 2)만 쓴다.
  const detail = {
    sections: [['완화책', '<code>fsync()</code> 후 <strong>canary</strong>', 'fsync() 후 canary 점진']],
  };
  const md = dd.renderDetailMd(detail, formatUtils);
  assert.equal(md, '  - 완화책: fsync() 후 canary 점진');
  assert.ok(!md.includes('<code>'), 'proseHtml HTML 태그 누출 0');
  assert.ok(!md.includes('<strong>'), 'proseHtml HTML 태그 누출 0');
});

test('renderDetailMd — code span·링크·엔티티·한국어 raw 보존 (strip 휴리스틱 미적용)', () => {
  const detail = {
    sections: [['요약', '<HTML rendered>', '`receipt_hash` 검증 후 [PR #58](http://x) 머지 — 비용 $155 & 큐']],
  };
  const md = dd.renderDetailMd(detail, formatUtils);
  // markdown 마커(backtick/링크)는 md 에서 정당 — 보존. em-dash 만 H10 normalize(,).
  assert.ok(md.includes('`receipt_hash`'), 'inline code span 보존');
  assert.ok(md.includes('[PR #58](http://x)'), 'markdown 링크 보존');
  assert.ok(md.includes('& 큐'), '엔티티/한국어 보존(escape 없음)');
  assert.ok(!md.includes('—'), 'em-dash 는 H10 normalize');
});

test('renderDetailMd — omit(field-key) + omitSections', () => {
  const detail = {
    rows: [['시각', '12분 전'], ['결정', 'realtime', true], ['receipt', '4e9c1a', true]],
    sections: [['요약', 'h', '게이트 수렴']],
  };
  const md = dd.renderDetailMd(detail, formatUtils, {
    omit: new Set(['시각', '결정']),
    omitSections: true,
  });
  assert.equal(md, '  - receipt: `4e9c1a`');
});

test('renderDetailMd — 빈/malformed detail graceful(빈 문자열)', () => {
  assert.equal(dd.renderDetailMd(null, formatUtils), '');
  assert.equal(dd.renderDetailMd({}, formatUtils), '');
  assert.equal(dd.renderDetailMd({ rows: [['only-dt']] }, formatUtils), '');
});

// ── (2) 빌더 raw 보존 (Codex F1+F2) ───────────────────────────────────────────

test('빌더 — titleText(raw 평문) + sections triple proseText 보존', () => {
  const oq = dd.buildOQDetail({ text: '`grace` window vs single-use', source: 'p.plan.md', lineNumber: 70 }, formatUtils);
  assert.equal(oq.titleText, '`grace` window vs single-use');
  assert.ok(oq.title.includes('<code>grace</code>'), 'title 은 proseHtml(렌더)');
  assert.ok(oq.rows.some((r) => r[0] === 'line'), 'lineNumber → line 행 SSoT 흡수 (F2)');

  const risk = dd.buildRiskDetail({
    risk: 'corruption', impact: '고', likelihood: '중', mitigation: '`fsync` 후 회전', source: 'p.plan.md',
    relatedOpenQuestion: 'OQ-a **결정**',
  }, formatUtils);
  assert.equal(risk.titleText, 'corruption');
  assert.equal(risk.sections[0].length, 3, 'sections triple [h3, proseHtml, proseText]');
  assert.equal(risk.sections[0][2], '`fsync` 후 회전', 'proseText raw 보존');
  assert.ok(risk.rows.some((r) => r[0] === '동일 질문 참조'), 'relatedOpenQuestion SSoT 행 (F2)');

  const rc = dd.buildReceiptDetail({ gate: 'mccp-pr-codex', convLabel: '수렴 R1', briefingSummary: 'PR `게이트` 수렴' }, formatUtils);
  assert.ok(rc.titleText.includes('mccp-pr-codex'));
  assert.equal(rc.sections[0][2], 'PR `게이트` 수렴', 'briefing proseText raw');

  const ms = dd.buildMilestoneDetail({ name: 'M4', planBasename: 'm4.plan.md', relative: '4시간 전' }, '`STATUS.md` 평면화', formatUtils);
  assert.equal(ms.titleText, 'M4');
  assert.equal(ms.sections[0][2], '`STATUS.md` 평면화', 'plan Summary proseText raw');
});

test('빌더 — serializeDetails 는 md-only 필드(titleText/proseText) 제외', () => {
  const map = new Map();
  map.set('risk:p#r0', dd.buildRiskDetail({
    risk: 'x', impact: '고', likelihood: '저', mitigation: '`payload`',
  }, formatUtils));
  const s = dd.serializeDetails(map);
  const obj = JSON.parse(s);
  const detail = obj['risk:p#r0'];
  assert.equal(detail.titleText, undefined, 'titleText 직렬화 제외');
  assert.equal(detail.sections[0].length, 2, 'sections proseText(index 2) 직렬화 제외');
  // raw backtick 마커가 HTML drawer-data JSON 표면에 누출되지 않음
  assert.ok(!s.includes('`payload`'), 'raw backtick HTML 표면 누출 0');
});

// ── (3) 섹션 md 동등 — 인라인 일원화 ─────────────────────────────────────────

test('OQ 섹션 md — 출처/섹션/line/관련 결정/다음 액션 인라인 (요약 이중 표기 0)', () => {
  const planBody = {
    openQuestions: [{ source: 'p.plan.md', text: 'OQ 전문 질문', lineNumber: 70, headingPath: ['## Open Questions'] }],
  };
  const { md } = renderOpenQuestions({ sources: {} }, formatUtils, planBody);
  assert.ok(md.includes('· OQ 전문 질문'), '항목 헤더 전문');
  assert.ok(md.includes('  - 출처: `p.plan.md`'));
  assert.ok(md.includes('  - 섹션: Open Questions'));
  assert.ok(md.includes('  - line: line 70'));
  assert.ok(md.includes('  - 관련 결정: `p`'));
  assert.ok(md.includes('  - 다음 액션: `'));
});

test('Risk 섹션 md — 영향/가능성/관련 결정/완화책 인라인 (이전 md 누락 행 노출)', () => {
  const planBody = {
    risks: [{ risk: '데이터 손상', impact: 'High', likelihood: 'Medium', mitigation: 'fsync 후 회전', source: 'p.plan.md', relatedOpenQuestion: 'OQ-a' }],
  };
  const { md } = renderRisks({ sources: {} }, formatUtils, planBody);
  assert.ok(md.includes('· 데이터 손상'));
  assert.ok(md.includes('  - 영향: High'), '이전 md 가 누락하던 영향 노출');
  assert.ok(md.includes('  - 가능성: Medium'), '이전 md 가 누락하던 가능성 노출');
  assert.ok(md.includes('  - 관련 결정: `p`'));
  assert.ok(md.includes('  - 완화책: fsync 후 회전'));
  assert.ok(md.includes('  - 동일 질문 참조: OQ-a'), 'section-only relatedOpenQuestion 생존 (F2)');
});

test('timeline 섹션 md — receipt hash 인라인(헤더 중복 행은 omit)', () => {
  const now = Date.UTC(2026, 5, 18);
  const model = {
    sources: {
      receipts: {
        items: [{
          gate_id: 'mccp-pr-codex', decision_id: 'realtime', converged: true, round: 1,
          receipt_hash: 'sha256:deadbeef1234', created_at: new Date(now - 3600_000).toISOString(),
        }],
      },
    },
  };
  const { md } = renderAuditTimeline(model, formatUtils, now);
  assert.ok(md.includes('  - receipt: `beef1234`'), 'receipt hash md-누락 행 노출');
  // 헤더가 이미 표기한 시각/결정/판정은 detail 행으로 중복 안 됨
  assert.ok(!md.includes('  - 시각:'), '시각 omit(헤더 중복)');
  assert.ok(!md.includes('  - 결정:'), '결정 omit(헤더 중복)');
});

// v1.18.7 M4 (Task 6e) — 타임라인 더보기 html↔md 동등(접힘 행이 양쪽 모두에 surface).
test('timeline 더보기 — html <details> ↔ md <details> 정보 동등(접힘 행 양쪽 보존)', () => {
  const now = Date.UTC(2026, 5, 18);
  const items = [];
  for (let i = 0; i < 12; i++) { // 8 expanded + 4 collapsed
    items.push({
      gate_id: 'mccp-pr-codex', decision_id: 'tl-' + i, converged: true, round: 1,
      receipt_hash: 'sha256:h' + i, created_at: new Date(now - (i + 1) * 60_000).toISOString(),
    });
  }
  const { html, md } = renderAuditTimeline({ sources: { receipts: { items } } }, formatUtils, now);
  // 양쪽 더보기 affordance.
  assert.ok(html.includes('<details class="more">') && html.includes('+4 더보기'), 'html 더보기');
  assert.ok(md.includes('<details>') && md.includes('+4 더보기'), 'md 더보기');
  // 접힘 행(11번째, decision_id='tl-11')이 html·md 양쪽에 surface → 정보 손실 0.
  assert.ok(html.includes('tl-11'), '접힘 행 html 보존');
  assert.ok(md.includes('tl-11'), '접힘 행 md 보존');
});

test('milestone 섹션 md — 요약(plan Summary) plain-text 신규 노출', () => {
  const fakePrd = [
    '## Delivery Milestones', '',
    '| # | Name | Scope | Status | Plan |', '|---|---|---|---|---|',
    '| 1 | M1 | - | complete | [m1](./m1.plan.md) |',
  ].join('\n');
  const model = {
    sources: {
      plans: { items: [{ path: '/tmp/m1.plan.md', source_prd: '/tmp/p.prd.md' }] },
      receipts: { items: [{ gate: 'mccp-pr-codex', decision_id: 'm1', created_at: new Date().toISOString() }] },
    },
    repo_root: '/tmp',
  };
  const fsRead = (p) => {
    if (p.endsWith('p.prd.md')) return fakePrd;
    if (p.endsWith('m1.plan.md')) return '# plan\n\n## Summary\n\n레이아웃 재설계 요약 본문\n';
    throw new Error('no ' + p);
  };
  const { md } = renderMilestoneHistory(model, formatUtils, {}, { fsRead, cwd: '/tmp' });
  assert.ok(md.includes('  - 요약: 레이아웃 재설계 요약 본문'), 'plan Summary md 신규 노출');
  assert.ok(!md.includes('  - plan:'), 'plan omit(헤더 중복)');
});

// ── (4) full render 정보 동등 + placeholder 0 + degrade ───────────────────────

function fullModel(now) {
  return {
    derived_at: new Date(now).toISOString(),
    masked: true,
    m0_capability: { contract_present: true },
    warnings: [],
    sources: {
      plans: { items: [{ path: 'a.plan.md', source_prd: 'prd.md' }] },
      receipts: {
        items: [{
          gate_id: 'mccp-plan-codex', decision_id: 'aaaa', converged: true, round: 1,
          receipt_hash: 'sha256:cafe9999', created_at: new Date(now - 60_000).toISOString(),
          briefing_summary: 'plan 수렴 요약', briefing_token_count: 120,
        }],
      },
      state: { item: { body: { open_questions: ['대시보드 동작?'] } } },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
    correlations: [],
  };
}

test('full render — STATUS.md 가 OQ 출처/risk 영향·완화/receipt hash/briefing 요약을 plain-text 로 담음', () => {
  const now = Date.now();
  const r = renderStatus(fullModel(now), {
    cwd: '/test',
    fsRead: (p) => {
      if (p.endsWith('prd.md')) return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 0 | a | x | in-progress | [a.plan.md](a.plan.md) |\n';
      if (p.endsWith('a.plan.md')) return '# plan\n\n## Open Questions\n\n- [ ] q1\n\n## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| rr | High | High | mm |\n';
      throw new Error('ENOENT ' + p);
    },
  });
  // risk 상세 행
  assert.ok(r.md.includes('  - 영향: High'));
  assert.ok(r.md.includes('  - 완화책: mm'));
  // receipt hash
  assert.ok(/  - receipt: `[0-9a-f]+`/.test(r.md), 'timeline receipt hash 행');
  // briefing 요약(기존 blockquote 경로)
  assert.ok(r.md.includes('plan 수렴 요약'));
  // design-lint 위반 0 (H10 em-dash / H16 raw marker 등 md 경로 통과)
  assert.deepEqual(r.design_constraint_violations, [], 'design-lint clean: ' + JSON.stringify(r.design_constraint_violations));
});

test('full render — HTML drawer-data detail 각 키가 md 에 정보 동등 표현', () => {
  const now = Date.now();
  const r = renderStatus(fullModel(now), {
    cwd: '/test',
    fsRead: (p) => {
      if (p.endsWith('prd.md')) return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 0 | a | x | in-progress | [a.plan.md](a.plan.md) |\n';
      if (p.endsWith('a.plan.md')) return '# plan\n\n## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| rr | High | High | mm |\n';
      throw new Error('ENOENT ' + p);
    },
  });
  const jsonMatch = r.html.match(/<script[^>]*id="drawer-data"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(jsonMatch, 'drawer-data JSON 존재');
  const details = JSON.parse(jsonMatch[1].replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&'));
  // 각 detail 의 row dd / section h3 텍스트가 md 에도 surface(정보 동등)
  for (const key of Object.keys(details)) {
    const d = details[key];
    for (const row of (d.rows || [])) {
      if (!Array.isArray(row) || row.length < 2 || row[1] == null) continue;
      const val = String(row[1]);
      if (val.length < 2) continue;
      assert.ok(r.md.includes(val), 'detail row 값 "' + val + '" md 에 부재 (정보 손실)');
    }
  }
});

test('full render — production md 에 placeholder/더미 0건', () => {
  const now = Date.now();
  const r = renderStatus(fullModel(now), {
    cwd: '/test',
    fsRead: (p) => {
      if (p.endsWith('prd.md')) return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 0 | a | x | in-progress | [a.plan.md](a.plan.md) |\n';
      if (p.endsWith('a.plan.md')) return '# plan\n\n## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| rr | High | High | mm |\n';
      throw new Error('ENOENT ' + p);
    },
  });
  for (const dummy of ['임의 예시', 'placeholder', 'dummy', 'TODO', '샘플 데이터', 'lorem']) {
    assert.ok(!r.md.includes(dummy), 'placeholder/더미 "' + dummy + '" 잔존');
  }
});

// ── (5) M3 해결 접힘 + lifecycle 토글 html↔md 동등 ──────────────────────────

test('M3-b — risks active/완화됨 탭(html) ↔ 완화됨 N건 접힘(md) 정보 동등', () => {
  const planBody = {
    risks: [
      { risk: 'active-r', likelihood: 'High', impact: 'High', mitigation: 'm', source: 'p', ordinal: 0, resolved: false },
      { risk: 'done-r', likelihood: 'Low', impact: 'Low', mitigation: 'm', source: 'p', ordinal: 1, resolved: true },
    ],
  };
  const { md, html } = renderRisks({ sources: {} }, formatUtils, planBody);
  // html — 완화됨 탭(label+count). md — plain-text 완화됨 N건 접힘(탭 부적합 → details).
  assert.match(html, /완화됨 <span class="tab-count">1<\/span>/);
  assert.match(md, /완화됨 1건/);
  // 양쪽 모두 active + resolved 항목 텍스트를 담음(정보 동등).
  assert.ok(html.includes('active-r') && md.includes('active-r'));
  assert.ok(html.includes('done-r') && md.includes('done-r'));
});

test('M3 — milestone lifecycle 토글 html↔md 동등', () => {
  const path = require('node:path');
  const cwd = path.resolve('/eqrepo');
  const prdAbs = path.resolve(cwd, '.claude/prds/x.prd.md');
  const PRD = [
    '## Delivery Milestones', '',
    '| # | Milestone | Outcome | Status | Plan |', '| --- | --- | --- | --- | --- |',
    '| 1 | Done | o | complete | [d.plan.md](../plans/d.plan.md) |',
    '| 2 | Future | o | pending | — |', '',
  ].join('\n');
  const model = {
    repo_root: cwd,
    sources: {
      plans: { items: [{ path: '.claude/plans/d.plan.md', source_prd: '.claude/prds/x.prd.md' }] },
      receipts: { items: [{ gate_id: 'mccp-pr-codex', decision_id: 'd', created_at: '2026-06-21T12:00:00.000Z' }] },
    },
  };
  const fsRead = (p) => { if (p === prdAbs) return PRD; throw new Error('ENOENT'); };
  const { md, html } = renderMilestoneHistory(model, formatUtils, {}, { cwd, fsRead, gitCommitTime: () => null });
  assert.match(html, /미진행 마일스톤 1건 · 표시/);
  assert.match(md, /미진행 마일스톤 1건 · 표시/);
  assert.ok(html.includes('Future') && md.includes('Future'));
});

test('full render — 0건 섹션 graceful degrade (빈 상태 메시지, detail 누출 0)', () => {
  const r = renderStatus({
    m0_capability: { contract_present: true },
    masked: true,
    sources: {
      plans: { count: 0, items: [] },
      receipts: { count: 0, items: [] },
      state: { item: null },
      backlog: { count: 0, items: [] },
      fix_task: { item: null },
      pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
  });
  assert.ok(r.md.includes('발견된 위험이 없습니다.'), '0건 위험 빈 상태 메시지');
  assert.ok(!r.md.includes('  - 완화책:'), '0건일 때 detail 행 누출 0');
});
