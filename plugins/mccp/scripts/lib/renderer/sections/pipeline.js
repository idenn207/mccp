'use strict';

// v1.13.0 게이트 스테이지 파이프라인 섹션.
// receipt를 decision_id별로 묶어 plan-codex → implement-codex → pr-codex
// 진행을 가로 스테퍼로 렌더한다. Codex Plan-R1 absorption:
//   F1 — canonical 정규화: gate = r.gate_id || r.gate, canonical mccp-* 만
//        스테이지로 매핑, (decision_id, gate)별 최신 receipt(created_at→round)만
//        노드 상태로 사용(stale failed가 later converged 가리지 않게).
//   F3 — status-aware collapse: 미수렴(◐) decision 은 절대 collapse 안 함,
//        정렬 attention → active → recent complete, top-3 + collapsed 상태 카운트.
// 색 단독 금지 — 모든 노드는 색 + 아이콘 + sr-only 텍스트 병행(a11y).
// baseline 은 순수 마크업(JS 없이도 상태 표시). 연결선은 .pipe-edge(수평 라인,
// border-left 미사용 — H4 회피).

const STAGES = [
  { gate: 'mccp-plan-codex', short: 'plan' },
  { gate: 'mccp-implement-codex', short: 'impl' },
  { gate: 'mccp-pr-codex', short: 'pr' },
];

const NODE = {
  converged: { icon: '✓', cls: 's-terminal-ok', label: '수렴' },
  pending: { icon: '◐', cls: 's-stale', label: '진행' },
  missing: { icon: '○', cls: 'muted', label: '대기' },
};

const TOP_EXPANDED = 3;

function gateOf(r) {
  // F1 — derive sources/receipts.js emits `gate`; older shapes may carry
  // `gate_id`. Read both so canonical ids resolve either way.
  return (r && (r.gate_id || r.gate)) || '';
}

function timeOf(r) {
  const t = r && r.created_at ? new Date(r.created_at).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

// Latest receipt for one (decision, gate): created_at desc, round desc tiebreak.
function latest(receipts) {
  let best = null;
  for (const r of receipts) {
    if (!best) { best = r; continue; }
    const dt = timeOf(r) - timeOf(best);
    if (dt > 0 || (dt === 0 && (r.round || 0) > (best.round || 0))) best = r;
  }
  return best;
}

function nodeStatus(receipt) {
  if (!receipt) return 'missing';
  return receipt.converged === true ? 'converged' : 'pending';
}

// Build one decision's stage nodes + a decision-level class for sort/collapse.
function buildDecision(decisionId, receipts) {
  const byGate = new Map();
  for (const r of receipts) {
    const g = gateOf(r);
    if (!byGate.has(g)) byGate.set(g, []);
    byGate.get(g).push(r);
  }
  const nodes = STAGES.map(stage => {
    const picked = latest(byGate.get(stage.gate) || []);
    return { short: stage.short, status: nodeStatus(picked) };
  });
  const hasPending = nodes.some(n => n.status === 'pending');
  const prNode = nodes[STAGES.length - 1];
  const allSettled = nodes.every(n => n.status !== 'pending');
  let kind;
  if (hasPending) kind = 'attention';            // 미수렴 — 절대 collapse 안 함
  else if (prNode.status === 'converged') kind = 'complete';
  else kind = 'active';                            // 일부 수렴 + 다음 단계 대기
  const lastTime = receipts.reduce((mx, r) => Math.max(mx, timeOf(r)), 0);
  return { decisionId, nodes, kind, lastTime };
}

const KIND_RANK = { attention: 0, active: 1, complete: 2 };

function renderPipeline(model, formatUtils, planBody, opts) {
  const { escapeHtml, escapeAttr } = formatUtils;
  const m = model || {};
  const items = ((m.sources && m.sources.receipts && m.sources.receipts.items) || [])
    .filter(r => r && r.ok !== false && r.decision_id && STAGES.some(s => s.gate === gateOf(r)));

  if (items.length === 0) {
    return {
      md: '_(게이트 활동 없음)_',
      html: '<p class="muted"><em>게이트 활동 없음</em></p>',
    };
  }

  const byDecision = new Map();
  for (const r of items) {
    if (!byDecision.has(r.decision_id)) byDecision.set(r.decision_id, []);
    byDecision.get(r.decision_id).push(r);
  }

  const decisions = Array.from(byDecision.entries())
    .map(([id, rs]) => buildDecision(id, rs))
    .sort((a, b) => {
      const rk = KIND_RANK[a.kind] - KIND_RANK[b.kind];
      return rk !== 0 ? rk : b.lastTime - a.lastTime;
    });

  // F3 — never collapse attention/active; expand at least TOP_EXPANDED rows.
  const neverCollapse = decisions.filter(d => d.kind !== 'complete').length;
  const expandedCount = Math.max(TOP_EXPANDED, neverCollapse);
  const expanded = decisions.slice(0, expandedCount);
  const collapsed = decisions.slice(expandedCount);

  function rowMd(d) {
    const stages = d.nodes.map(n => n.short + ' ' + NODE[n.status].icon).join(' → ');
    return '- `' + d.decisionId + '` · ' + stages;
  }
  function rowHtml(d) {
    const inner = [];
    d.nodes.forEach((n, i) => {
      const meta = NODE[n.status];
      inner.push('<span class="pipe-node ' + meta.cls + '">'
        + '<span class="pipe-icon" aria-hidden="true">' + escapeHtml(meta.icon) + '</span>'
        + '<span class="pipe-stage">' + escapeHtml(n.short) + '</span>'
        + '<span class="sr-only">' + escapeHtml(meta.label) + '</span>'
        + '</span>');
      if (i < d.nodes.length - 1) inner.push('<span class="pipe-edge" aria-hidden="true"></span>');
    });
    return '<li class="pipe-row" data-kind="' + escapeAttr(d.kind) + '">'
      + '<code class="pipe-decision">' + escapeHtml(d.decisionId) + '</code>'
      + '<span class="pipe-track">' + inner.join('') + '</span>'
      + '</li>';
  }

  const mdLines = expanded.map(rowMd);
  const htmlRows = expanded.map(rowHtml);

  if (collapsed.length > 0) {
    const counts = collapsed.reduce((acc, d) => { acc[d.kind] = (acc[d.kind] || 0) + 1; return acc; }, {});
    const parts = Object.keys(counts).map(k => counts[k] + ' ' + k);
    const summary = '+' + collapsed.length + ' more · ' + parts.join(' · ');
    mdLines.push('- _' + summary + '_');
    htmlRows.push('<li class="pipe-more"><details><summary>' + escapeHtml(summary) + '</summary><ul class="pipeline">'
      + collapsed.map(rowHtml).join('') + '</ul></details></li>');
  }

  return {
    md: mdLines.join('\n'),
    html: '<ul class="pipeline">' + htmlRows.join('') + '</ul>',
  };
}

module.exports = {
  renderPipeline,
  // Test-exposed internals.
  _buildDecision: buildDecision,
  _latest: latest,
  _gateOf: gateOf,
  STAGES,
};
