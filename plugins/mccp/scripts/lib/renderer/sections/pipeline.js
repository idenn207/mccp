'use strict';

// v1.18.0 M2 게이트 파이프라인 — 샘플 fidelity. decision_id 별 plan→impl→pr
// 진행을 가로 스테퍼(ol.pipe-stages)로 렌더한다. 노드 상태(done/active/blocked/
// missing)와 decision-level 상태(done/active/blocked)는 공유 helper
// deriveDecisionState(Codex F1) 가 시간순으로 판정한다 — converged===false 단순
// 판정 폐기. is-block 은 escalated 미수렴(divergent), is-active 는 첫 라운드
// in-progress. 색 단독 금지 — 노드는 색 + 아이콘/점 + sr-only label 병행(a11y).

const { deriveDecisionState, STAGES } = require('../parsers/decision-state');

const TOP_EXPANDED = 3;

// 노드 상태 → 마커(svg id 또는 dot) + sr-only label.
const NODE_MARK = {
  done: { svg: 'ic-check', label: '수렴', cls: 'is-done' },
  active: { dot: true, label: '진행 중', cls: 'is-active' },
  blocked: { svg: 'ic-alert', label: '차단', cls: 'is-block' },
  missing: { dot: true, label: '대기', cls: '' },
};
const NODE_MD = { done: '✓', active: '◐', blocked: '⚠', missing: '○' };

// decision state + active stage → pipe-status(텍스트 + 색 클래스 + 마커).
// v1.18.7 M4 (진실성) — active stage 가 receipt 가 있어 *진행 중*(node status
// 'active')인지, receipt 가 없어 *아직 안 시작*(node status 'missing')인지 구분.
// 후자에서 "PR 검토 중"은 PR 이 없는데 검토 중이라 거짓 → "PR 대기"로 정직 표기.
const STAGE_IN_PROGRESS = { plan: '계획 중', impl: '구현 중', pr: 'PR 검토 중' };
const STAGE_PENDING = { plan: '계획 대기', impl: '구현 대기', pr: 'PR 대기' };
function statusOf(d) {
  if (d.state === 'done') {
    return { cls: 's-ok', text: 'complete', svg: 'ic-check' };
  }
  if (d.state === 'blocked') {
    return { cls: 's-block', text: '차단', svg: 'ic-alert' };
  }
  const activeNode = (d.nodes || []).find((n) => n.short === d.activeStage);
  const started = activeNode && activeNode.status === 'active'; // in-progress receipt 존재
  const map = started ? STAGE_IN_PROGRESS : STAGE_PENDING;
  return { cls: 's-active', text: map[d.activeStage] || (started ? '진행 중' : '대기'), dot: true };
}

const STATE_RANK = { blocked: 0, active: 1, done: 2 };

function renderPipeline(model, formatUtils, planBody, opts) {
  const { escapeHtml, escapeAttr } = formatUtils;
  const m = model || {};
  const receipts = (m.sources && m.sources.receipts && m.sources.receipts.items) || [];
  const stateMap = deriveDecisionState(receipts);

  if (stateMap.size === 0) {
    return {
      md: '_(게이트 활동 없음)_',
      html: '<p class="muted"><em>게이트 활동 없음</em></p>',
    };
  }

  const decisions = Array.from(stateMap.values())
    .sort((a, b) => {
      const rk = STATE_RANK[a.state] - STATE_RANK[b.state];
      return rk !== 0 ? rk : b.lastTime - a.lastTime;
    });

  const doneCount = decisions.filter(d => d.state === 'done').length;
  const activeCount = decisions.filter(d => d.state === 'active').length;
  const blockedCount = decisions.filter(d => d.state === 'blocked').length;

  // blocked/active 는 절대 collapse 안 함 — 최소 TOP_EXPANDED 행 expand.
  const neverCollapse = decisions.filter(d => d.state !== 'done').length;
  const expandedCount = Math.max(TOP_EXPANDED, neverCollapse);
  const expanded = decisions.slice(0, expandedCount);
  const collapsed = decisions.slice(expandedCount);

  function nodeHtml(node) {
    const mark = NODE_MARK[node.status] || NODE_MARK.missing;
    const inner = mark.svg
      ? '<svg class="i" aria-hidden="true"><use href="#' + mark.svg + '"/></svg>'
      : '<span class="node-dot" aria-hidden="true"></span>';
    return '<li class="pipe-node ' + mark.cls + '">'
      + '<span class="node-mark">' + inner + '</span>'
      + '<span class="node-label">' + escapeHtml(node.short) + '</span>'
      + '<span class="sr-only">' + escapeHtml(node.short + ' ' + mark.label) + '</span>'
      + '</li>';
  }

  function rowHtml(d) {
    const stages = [];
    d.nodes.forEach((n, i) => {
      stages.push(nodeHtml(n));
      if (i < d.nodes.length - 1) stages.push('<span class="node-link" aria-hidden="true"></span>');
    });
    const st = statusOf(d);
    const marker = st.svg
      ? '<svg class="i i-sm" aria-hidden="true"><use href="#' + st.svg + '"/></svg>'
      : '<span class="dot dot-accent" aria-hidden="true"></span>';
    return '<div class="pipe-row" data-state="' + escapeAttr(d.state) + '">'
      + '<span class="pipe-id">' + escapeHtml(d.decisionId) + '</span>'
      + '<ol class="pipe-stages">' + stages.join('') + '</ol>'
      + '<span class="pipe-status ' + st.cls + '">' + marker + escapeHtml(st.text) + '</span>'
      + '</div>';
  }

  function rowMd(d) {
    const stages = d.nodes.map(n => n.short + ' ' + NODE_MD[n.status]).join(' → ');
    return '- `' + d.decisionId + '` · ' + stages;
  }

  const htmlRows = expanded.map(rowHtml);
  const mdLines = expanded.map(rowMd);

  if (collapsed.length > 0) {
    const summary = '+' + collapsed.length + ' 더보기';
    htmlRows.push('<details class="more"><summary>'
      + '<svg class="i i-sm chev" aria-hidden="true"><use href="#ic-arrow"/></svg>'
      + escapeHtml(summary) + '</summary><div class="pipeline">'
      + collapsed.map(rowHtml).join('') + '</div></details>');
    mdLines.push('- _' + summary + '_');
  }

  const foot = '<span class="foot-stat">complete ' + doneCount
    + '<i>진행 ' + activeCount + '</i><i>차단 ' + blockedCount + '</i></span>'
    + '<a class="foot-link" href="#route-overview">개요로'
    + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-arrow"/></svg></a>';

  return {
    md: mdLines.join('\n'),
    html: '<div class="pipeline">' + htmlRows.join('') + '</div>',
    count: '결정 ' + decisions.length + ', complete ' + doneCount,
    foot,
  };
}

module.exports = {
  renderPipeline,
  STAGES,
};
