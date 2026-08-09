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

const METRICS_ORDER = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'C1'];
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
  A3: {
    name: '상시 지시문 점유율',
    desc: '세션 시작 시 자동 주입되는 지시문이 점유한 컨텍스트 토큰 비율',
    category: 'A',
    type: 'standard',
  },
  A4: {
    name: '인계 항목 복원율',
    desc: '미완 인계 항목 중 복원된 비율',
    category: 'A',
    type: 'standard',
  },
  // F1 흡수의 연장 (M4 구현 중 발견) — B1·C1도 같은 오배정이었다. 각각
  // "설정-독립성 / 설정이 변경된 활동 비율"과 "PR 역추적 회복성 / PR 본문에서
  // 지표 재구성 가능성"으로, measurement-design.md가 규정한 지표가 아니라 **다른
  // 것**을 서술하고 있었다(후자는 recoverability probe의 설명이다). 값은 둘 다
  // 미산출이라 오독의 크기는 C2·C3보다 작지만, 라벨이 계약과 어긋나면 독자가
  // 대시보드와 measurement-design.md를 대조할 수 없다는 결함은 동일하다.
  // 계약 정의로 정정한다. A1·A4·B3는 같은 지표의 다른 표현이라 두고, B2는 M3가
  // 근거를 남기고 의도적으로 개명한 것이라 그대로 둔다.
  B1: {
    name: '진행 상태 drift',
    desc: '문서 status와 독립 증거 판정이 불일치한 작업 단위 건수 (0건이 목표)',
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
    name: '피드백 폐쇄율',
    desc: '발견된 finding 중 같은 작업 단위 안에서 해소된 비율 (이연·강등·기각은 해소 미계상)',
    category: 'C',
    type: 'standard',
  },
  // M4 critique F1 — these two slots carried A3's definition ("주입 명령어 비용" /
  // "모델 컨텍스트 사용률" / "A3 토큰 예약"). Once M4 made A3 `computed`, the
  // dashboard would have shown A3's number under the label "게이트 헛발화율" and
  // "누출 결함율", manufacturing exactly the decision basis measurement-design.md
  // §5 forbids. Labels restored to the PRD definitions; both stay forward-only
  // (관측 전용 · label-protocol 확립 전 의사결정 사용 금지).
  C2: {
    name: '게이트 헛발화율',
    desc: '차단 판정 중 실질 수정 없이 통과한 비율 (관측 전용 · 값 미산출)',
    category: 'C',
    type: 'forward-only',
  },
  C3: {
    name: '누출 결함율',
    desc: '통과 판정 중 관측 창 안에 수정이나 되돌림이 붙은 비율 (관측 전용 · 값 미산출)',
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

// critique F2 (M3 F3 재적용) — 병기 수치는 값 셀이 아니라 여기 산다.
// A3 전후 2값 · B3 제외 전/후 2값 · 분기 수를 한 행에 늘어놓으면 compact 4-컬럼
// 톤이 깨진다(Output Constraint 4). 값 셀은 지표 정의 그대로의 단일 수치를 유지하고
// 무결성 규칙이 요구하는 병기는 collapse 안에서 충족한다 — 숨김이 아니라 계층화다.
// 신규 문자열은 em-dash 대신 `·`와 괄호만 쓴다(M3 F4 카피 규칙).
function coReportDetails(metrics) {
  const lines = [];
  if (!metrics) return lines;

  const a3 = metrics.A3;
  if (a3 && typeof a3.reduction_ratio === 'number') {
    const parts = ['A3 상세: 감축률 ' + (a3.reduction_ratio * 100).toFixed(1) + '%'];
    if (typeof a3.baseline_tokens === 'number' && typeof a3.numerator === 'number') {
      parts.push('토큰 ' + a3.baseline_tokens + ' → ' + a3.numerator);
    }
    if (typeof a3.claude_md_reduction_ratio === 'number') {
      parts.push('CLAUDE.md 성분만 ' + (a3.claude_md_reduction_ratio * 100).toFixed(1) + '%');
    }
    if (a3.tokenizer_version) parts.push('tiktoken ' + a3.tokenizer_version);
    lines.push(parts.join(' · '));
  }

  const b3 = metrics.B3;
  if (b3 && typeof b3.raw_surface_count === 'number') {
    // 제외 전/후 분모를 둘 다 낸다(G3). 하나만 내면 제외가 감축으로 오독된다.
    const parts = [
      'B3 상세: 분모 ' + b3.raw_surface_count + ' (제외 전) → ' + b3.denominator + ' (제외 후)',
      '명명된 제외 ' + (b3.excluded_count || 0) + '건 · 은퇴 0건',
    ];
    if (typeof b3.operation_branches === 'number') {
      parts.push('동작 분기 ' + b3.operation_branches + '개' +
        (b3.operation_branch_method ? ' (' + b3.operation_branch_method + ')' : ''));
    }
    lines.push(parts.join(' · '));
  }

  const prevented = preventedDetail(metrics);
  if (prevented) lines.push(prevented);

  return lines;
}

// 마크다운 렌더: 지표 테이블 + 상세 설명
function renderMetricsMarkdown(metrics) {
  if (!metrics || typeof metrics !== 'object') return null;

  // 정렬된 지표 (A1-C1 순서 + C2/C3 후행)
  const sortedIds = METRICS_ORDER.filter((id) => metrics[id] != null)
    .concat(Array.from(FORWARD_ONLY).filter((id) => metrics[id] != null));

  if (sortedIds.length === 0) return null;

  // 값이 하나도 없으면 숨기되, **무결성 위반은 예외다.** `invalid`은 "아직
  // 측정 전"이 아니라 "측정 기판이 어긋났다"는 신호이므로 숨기면 운영자에게
  // 침묵으로 도달한다 — M4가 지표 층에서 없앤 confidently-wrong 평탄화를
  // 렌더 층에서 되살리는 셈이다. baseline 미형성(insufficient/forward-only)만
  // 조용히 넘어간다.
  const hasComputed = sortedIds.some((id) => {
    const m = metrics[id];
    return m && m.status === 'computed';
  });
  const hasInvalid = sortedIds.some((id) => {
    const m = metrics[id];
    return m && m.status === 'invalid';
  });

  if (!hasComputed && !hasInvalid) return null;

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
  const detailLines = coReportDetails(metrics);
  if (extraIds.length > 0 || detailLines.length > 0) {
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
    if (detailLines.length > 0) {
      md += (extraIds.length > 0 ? '\n\n' : '') + detailLines.join('\n\n');
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

  // markdown 면과 동일 규칙 — 무결성 위반은 숨기지 않는다.
  const hasComputed = sortedIds.some((id) => {
    const m = metrics[id];
    return m && m.status === 'computed';
  });
  const hasInvalid = sortedIds.some((id) => {
    const m = metrics[id];
    return m && m.status === 'invalid';
  });

  if (!hasComputed && !hasInvalid) return null;

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

  const detailLines = coReportDetails(metrics);
  if (extraRows.length > 0 || detailLines.length > 0) {
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
    // 중립 톤 — 신규 색 클래스를 추가하지 않는다(제약 2).
    detailLines.forEach((line) => {
      html += '<p class="muted">' + esc(line) + '</p>';
    });
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
