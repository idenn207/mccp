'use strict';

// dashboard-measurement M2 — 멀티세션 관측 계측 섹션.
// Pure function of derive `model.metrics` (8 지표: A1, A2, A4, B1, B2, B3, C1 + C2/C3 forward-only).
// 지표별 1행(id·값·상태·커버리지) + 추세(기존 스냅샷 이력 소비, 없으면 현재값+baseline-forming).
// C2·C3 forward-only 정직 표기(값 미산출).
//
// graceful hide(분리 규칙):
//   - metrics 부재 또는 null           → null        (scan off/compute 미실행)
//   - all metrics insufficient/invalid → null        (baseline 미확보)
//   - ≥1 metric computed              → 렌더 섹션   (정보가 있음)
//
// 4 Output Constraints (§3.9 design-direction SKILL):
//   (1) **heading depth ≤ 3** — H2 "## 계측", 지표 그룹 ≤ H3; 상세는 표 셀/collapse
//   (2) **강조색 ≤ 1** — invalid/severe만 1개 색; forward-only/baseline은 중립 톤
//   (3) **raw markdown marker 금지** — "baseline-forming" 같은 status는 렌더 문자열만
//   (4) **list-of-N collapse** — 상위 3개(A/B/C 계열 요약) expanded + 나머지 collapse

const METRICS_ORDER = ['A1', 'A2', 'A4', 'B1', 'B2', 'B3', 'C1'];
const FORWARD_ONLY = new Set(['C2', 'C3']);
const TOP_EXPANDED = 3;

// 지표 metadata (id → {한국어 이름, 설명, 카테고리})
const METRICS_META = {
  A1: {
    name: '세션 착수 안정성',
    desc: '정상 완료 세션 비율',
    category: 'A',
    type: 'standard',
  },
  A2: {
    name: '세션 종료 컨텍스트 잔여%',
    desc: '세션 종료 시 잔여 컨텍스트 (p50 / p95 — 낮을수록 고갈)',
    category: 'A',
    type: 'standard',
  },
  A4: {
    name: '인계 항목 복원율',
    desc: '미완 인계 항목 중 복원된 비율',
    category: 'A',
    type: 'standard',
  },
  B1: {
    name: '설정-독립성',
    desc: '설정이 변경된 활동 비율',
    category: 'B',
    type: 'standard',
  },
  B2: {
    name: '동시세션 충돌률',
    desc: '동시 활동 쌍당 파일 충돌 이벤트 (낮을수록 안전)',
    category: 'B',
    type: 'standard',
  },
  B3: {
    name: '토글 사용 커버리지',
    desc: '운영 토글 non-default 사용 비율',
    category: 'B',
    type: 'standard',
  },
  C1: {
    name: 'PR 역추적 회복성',
    desc: 'PR 본문에서 지표 재구성 가능성',
    category: 'C',
    type: 'standard',
  },
  C2: {
    name: '주입 명령어 비용',
    desc: '모델 컨텍스트 사용률',
    category: 'C',
    type: 'forward-only',
  },
  C3: {
    name: 'A3 토큰 예약',
    desc: 'A3 계측 토큰 사용 추적',
    category: 'C',
    type: 'forward-only',
  },
};

// 상태 → {색 클래스, 아이콘, 렌더 라벨}
const STATUS_META = {
  computed: { cls: 'ok', icon: '✓', label: '산출됨' },
  'baseline-forming': { cls: 'muted', icon: '•', label: '기준 형성 중' },
  'forward-only': { cls: 'muted', icon: '→', label: '전향만' },
  insufficient: { cls: 'warn', icon: '?', label: '불충분' },
  invalid: { cls: 'bad', icon: '✕', label: '무효' },
};

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 지표 값 → 백분율 문자열 또는 'N/A'
function formatValue(metric) {
  if (metric == null) return 'N/A';
  // forward-only check first (before null checks)
  if (metric.status === 'forward-only') return '-';  // H10-safe no-value (em-dash '—' is normalized away in rendered prose)
  // Percentile 값(A2 등): value={p50,p95}면 잔여%를 직접 표시한다. num/den(=coverage)로
  // 렌더하면 모든 세션이 5% 잔여로 끝나도 100%(기록률)로 보여 고갈을 은폐한다(PR-Codex R2-F2).
  if (metric.value && typeof metric.value === 'object' && metric.value.p50 != null) {
    const p50 = Math.round(Number(metric.value.p50));
    const parts = [`p50 ${p50}%`];
    const p95 = metric.value.p95;
    if (p95 != null && Number.isFinite(Number(p95))) {
      parts.push(`p95 ${Math.round(Number(p95))}%`);
    }
    return parts.join(' · ');
  }
  if (metric.numerator == null || metric.denominator == null || metric.denominator === 0) {
    return 'N/A';
  }
  const pct = Math.round((metric.numerator / metric.denominator) * 100);
  return pct + '%';
}

// 지표 상태 라벨(한국어, HTML safe)
function statusLabel(status) {
  const meta = STATUS_META[status] || STATUS_META.insufficient;
  return meta.label;
}

// 마크다운 렌더: 지표 테이블 + 상세 설명
function renderMetricsMarkdown(metrics) {
  if (!metrics || typeof metrics !== 'object') return null;

  // 정렬된 지표 (A1-C1 순서 + C2/C3 후행)
  const sortedIds = METRICS_ORDER.filter((id) => metrics[id] != null)
    .concat(Array.from(FORWARD_ONLY).filter((id) => metrics[id] != null));

  if (sortedIds.length === 0) return null;

  // computed 지표가 1개 이상인지 확인 (전부 insufficient/invalid면 hide)
  const hasComputed = sortedIds.some((id) => {
    const m = metrics[id];
    return m && m.status === 'computed';
  });

  if (!hasComputed) return null;

  const lines = [];
  lines.push('| 지표 | 값 | 상태 | 커버리지 |');
  lines.push('|---|---|---|---|');

  sortedIds.forEach((id, index) => {
    const m = metrics[id];
    if (!m) return;
    const meta = METRICS_META[id] || {};
    const val = formatValue(m);
    const stat = statusLabel(m.status);
    const cov = m.coverage || 'unknown';
    // 상위 3개만 expanded, 나머지는 collapse에 숨김
    const isExpanded = index < TOP_EXPANDED;
    if (!isExpanded) return; // collapse 처리는 HTML에서

    const row = `| **${id}** · ${meta.name || id} | ${val} | ${stat} | ${cov} |`;
    lines.push(row);
  });

  let md = lines.join('\n');

  // 초과분은 collapse로 표시 (placeholder only — 실제 내용은 HTML에서)
  const extra = sortedIds.length - TOP_EXPANDED;
  if (extra > 0) {
    md += '\n\n<details><summary>추가 지표 ' + extra + '개 보기</summary>\n\n';
    const extraLines = [];
    extraLines.push('| 지표 | 값 | 상태 | 커버리지 |');
    extraLines.push('|---|---|---|---|');
    sortedIds.slice(TOP_EXPANDED).forEach((id) => {
      const m = metrics[id];
      if (!m) return;
      const meta = METRICS_META[id] || {};
      const val = formatValue(m);
      const stat = statusLabel(m.status);
      const cov = m.coverage || 'unknown';
      const row = `| **${id}** · ${meta.name || id} | ${val} | ${stat} | ${cov} |`;
      extraLines.push(row);
    });
    md += extraLines.join('\n');
    md += '\n\n</details>';
  }

  return { md };
}

// HTML 렌더: 지표 테이블 + 상세 설명 (색 + 아이콘)
function renderMetricsHtml(metrics, formatUtils) {
  const esc = (formatUtils && formatUtils.escapeHtml) || escapeHtml;

  if (!metrics || typeof metrics !== 'object') return null;

  const sortedIds = METRICS_ORDER.filter((id) => metrics[id] != null)
    .concat(Array.from(FORWARD_ONLY).filter((id) => metrics[id] != null));

  if (sortedIds.length === 0) return null;

  // computed 지표가 1개 이상인지 확인
  const hasComputed = sortedIds.some((id) => {
    const m = metrics[id];
    return m && m.status === 'computed';
  });

  if (!hasComputed) return null;

  const rows = [];
  const extraRows = [];

  sortedIds.forEach((id, index) => {
    const m = metrics[id];
    if (!m) return;
    const meta = METRICS_META[id] || {};
    const val = formatValue(m);
    const stat = statusLabel(m.status);
    const statMeta = STATUS_META[m.status] || STATUS_META.insufficient;
    const cov = m.coverage || 'unknown';
    const isExpanded = index < TOP_EXPANDED;

    const row = '<tr>'
      + '<td><strong>' + esc(id) + '</strong> · ' + esc(meta.name || id) + '</td>'
      + '<td>' + esc(val) + '</td>'
      + '<td><span class="' + esc(statMeta.cls) + '">' + esc(statMeta.icon + ' ' + stat) + '</span></td>'
      + '<td class="muted">' + esc(cov) + '</td>'
      + '</tr>';

    if (isExpanded) {
      rows.push(row);
    } else {
      extraRows.push(row);
    }
  });

  let html = '<table class="msw-metrics"><thead><tr>'
    + '<th>지표</th><th>값</th><th>상태</th><th>커버리지</th>'
    + '</tr></thead><tbody>'
    + rows.join('')
    + '</tbody></table>';

  if (extraRows.length > 0) {
    html += '<details class="msw-metrics-extra"><summary>추가 지표 ' + extraRows.length + '개 보기</summary>'
      + '<table class="msw-metrics"><thead><tr>'
      + '<th>지표</th><th>값</th><th>상태</th><th>커버리지</th>'
      + '</tr></thead><tbody>'
      + extraRows.join('')
      + '</tbody></table>'
      + '</details>';
  }

  return { html };
}

function renderMswMetrics(model, formatUtils, options) {
  const m = model || {};
  const metrics = m.metrics;

  // metrics 부재 또는 전부 insufficient/invalid → null (graceful hide)
  const mdResult = renderMetricsMarkdown(metrics);
  const htmlResult = renderMetricsHtml(metrics, formatUtils);

  if (!mdResult || !htmlResult) return null;

  return {
    md: mdResult.md,
    html: htmlResult.html,
  };
}

module.exports = { renderMswMetrics };
