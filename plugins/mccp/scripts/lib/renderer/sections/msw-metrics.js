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
    // critique F2 — M3 이후 분자는 `evidence_overwrite_observed`(증거 덮어쓰기
    // 사고)다. 이전 라벨 "파일 충돌 이벤트"는 computed 값을 stale 의미 아래
    // 노출하는 셈이라 PRODUCT.md 원칙 2와 PRD B1(drift) 정신에 어긋난다.
    name: '증거 덮어쓰기율',
    desc: '동시 활동 쌍당 증거 덮어쓰기 사고 (0이 목표 · 차단된 경합은 미계상)',
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

// critique F1 — expanded 슬라이스를 **index 순서가 아니라 의사결정 우선순위**로
// 고른다. METRICS_ORDER에서 B2는 index 4이고 TOP_EXPANDED=3이라, 순서를 그대로
// 쓰면 M3의 헤드라인 지표가 `<details>` collapse 안으로 떨어져 PRD 수용조건
// ("운영자가 문서를 읽지 않고 판정")을 충족하지 못한다.
//
// 상한 3은 그대로 유지한다 — 순서만 바뀌고 개수는 늘지 않는다(제약 4).
// 동순위는 METRICS_ORDER index로 안정 정렬한다(렌더 결정성 보존).
function decisionPriority(metric) {
  if (!metric) return 9;
  if (metric.status === 'invalid') return 0;                       // 무결성 위반이 최우선
  if (metric.status === 'computed') {
    // 실사고가 있는 computed는 무결성 위반 다음으로 급하다.
    return (typeof metric.numerator === 'number' && metric.numerator > 0) ? 1 : 2;
  }
  if (metric.status === 'insufficient') return 3;
  if (metric.status === 'baseline-forming') return 4;
  return 5;                                                        // forward-only
}

function orderForDisplay(metrics, ids) {
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  return ids.slice().sort((a, b) => {
    const d = decisionPriority(metrics[a]) - decisionPriority(metrics[b]);
    return d !== 0 ? d : indexOf.get(a) - indexOf.get(b);
  });
}

// critique F3 — 값 셀은 **한 지표만** 담는다. B2는 사고 건수가 의미의 전부라
// 백분율보다 `n/N`이 정확하다(0/20은 "20쌍 중 0건"을 그대로 말한다).
// prevented 건수는 값 셀에 밀어넣지 않고 collapse 상세로 내린다 — 숫자 3개를
// 한 셀에 넣으면 compact 4-컬럼 톤이 깨진다.
function formatValue(metric) {
  if (metric == null) return 'N/A';
  // forward-only check first (before null checks)
  if (metric.status === 'forward-only') return '-';  // H10-safe no-value (em-dash '—' is normalized away in rendered prose)
  if (metric.id === 'B2' && typeof metric.numerator === 'number'
      && typeof metric.denominator === 'number') {
    return metric.numerator + '/' + metric.denominator;
  }
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

// critique F3 — prevented(차단된 경합)는 collapse 상세 전용. 값 셀에 올리면
// "방어가 잘 되고 있다"가 "사고가 많다"로 오독될 여지가 생기고, 강조색도
// 쓰지 않는다(제약 2 — 예방 성공은 중립 톤). 신규 문자열에 em-dash 금지(F4):
// 구분자는 `·`와 괄호만 쓴다.
function preventedDetail(metrics) {
  const b2 = metrics && metrics.B2;
  if (!b2 || typeof b2.conflicts_prevented !== 'number' || b2.conflicts_prevented <= 0) return null;
  return 'B2 상세: 차단된 경합 ' + b2.conflicts_prevented + '건 (분자 미계상 · 예방은 사고가 아님)';
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

  const displayIds = orderForDisplay(metrics, sortedIds);

  const lines = [];
  lines.push('| 지표 | 값 | 상태 | 커버리지 |');
  lines.push('|---|---|---|---|');

  displayIds.forEach((id, index) => {
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

  // 초과분 + B2 상세는 collapse로. prevented는 값 셀이 아니라 여기 산다(F3).
  const extraIds = displayIds.slice(TOP_EXPANDED);
  const preventedNote = preventedDetail(metrics);
  if (extraIds.length > 0 || preventedNote) {
    const summary = extraIds.length > 0
      ? '추가 지표 ' + extraIds.length + '개 보기'
      : '계측 상세 보기';
    md += '\n\n<details><summary>' + summary + '</summary>\n\n';
    if (extraIds.length > 0) {
      const extraLines = [];
      extraLines.push('| 지표 | 값 | 상태 | 커버리지 |');
      extraLines.push('|---|---|---|---|');
      extraIds.forEach((id) => {
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
    }
    if (preventedNote) {
      md += (extraIds.length > 0 ? '\n\n' : '') + preventedNote;
    }
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

  const displayIds = orderForDisplay(metrics, sortedIds);
  const rows = [];
  const extraRows = [];

  displayIds.forEach((id, index) => {
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

  const preventedNote = preventedDetail(metrics);
  if (extraRows.length > 0 || preventedNote) {
    const summary = extraRows.length > 0
      ? '추가 지표 ' + extraRows.length + '개 보기'
      : '계측 상세 보기';
    html += '<details class="msw-metrics-extra"><summary>' + esc(summary) + '</summary>';
    if (extraRows.length > 0) {
      html += '<table class="msw-metrics"><thead><tr>'
        + '<th>지표</th><th>값</th><th>상태</th><th>커버리지</th>'
        + '</tr></thead><tbody>'
        + extraRows.join('')
        + '</tbody></table>';
    }
    if (preventedNote) {
      // 중립 톤 — 신규 색 클래스를 추가하지 않는다(제약 2).
      html += '<p class="muted">' + esc(preventedNote) + '</p>';
    }
    html += '</details>';
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
