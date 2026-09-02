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
// M6 — B1 drift 상세의 표시 상한(제약 4). 초과분은 같은 줄 끝에 `(+N건)` 으로 병기해
// 절삭이 항상 보이게 한다.
const DRIFT_TOP_N = 3;

// derive 産 prose(H10 em-dash + H16 인라인 마커)를 렌더하는 단일 진입점. B1 drift
// 상세의 milestone 이름이 PRD 표 셀에서 그대로 오고 그 셀은 볼드 마커를 포함하므로,
// esc() 만 거치면 `**` 가 HTML 표면에 리터럴로 누출된다.
const { renderProseHtml, renderProseMd } = require('../format-utils');

// 지표 metadata (id → {한국어 이름, 설명, 카테고리})
const METRICS_META = {
  A1: {
    // orchestrator-step-wiring M1 (Task 6) — 라벨을 계산 단위와 맞춘다.
    //
    // 이 지표는 M8부터 **작업 단위**(distinct `work_unit`)를 세는데 라벨은 여전히
    // 세션을 말하고 있었다. 세션과 작업 단위는 1:1이 아니고, 이 PRD가 없애려는
    // 문제 자체가 "한 작업이 여러 세션에 걸친다"이므로 그 어긋남은 지표를
    // 정반대로 읽히게 한다.
    //
    // **`desc`는 렌더되지 않는다.** 렌더러는 `meta.name`만 출력하고(이 파일
    // `:444` · `:469` · `:530`) `desc`의 read site는 정의부 외에 0건이다. 그래도
    // 고치는 이유는 이 파일이 지표 계약을 읽는 사람의 참조점이기 때문이며,
    // **test는 `name`에만 건다** — 반증 불가능한 문자열에 통과 단언을 걸면
    // green이 아무것도 뜻하지 않게 된다.
    name: '작업 단위 완주율',
    desc: '착수 기록이 있는 작업 단위 중 PR 번호까지 도달한 비율',
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
  // M6 — B1 은 **건수**다. 계약(UI4)이 불일치 건수의 절대값을 요구하고 목표는 0건이라,
  // 백분율로 내면 분모가 큰 저장소에서 drift 가 작아 보이는 왜곡이 생긴다.
  //
  // 커버리지 단서를 값 옆에 붙이는 것은 이 지표에 한해 단일-수치 규칙(F3)보다 우선한다:
  // 맨 `0건` 은 "drift 없음" 으로 읽히지만 실제로는 "대조한 범위에서 0건" 이고, 증거가
  // 미확정인 행이 분모에 남아 있는 한 그 둘은 다른 진술이다. 대조 못 한 것을 감추면
  // 커버리지 구멍이 성적으로 보인다.
  if (metric.id === 'B1' && typeof metric.numerator === 'number') {
    const undetermined = typeof metric.undetermined_evidence_count === 'number'
      ? metric.undetermined_evidence_count : 0;
    if (undetermined > 0 && typeof metric.denominator === 'number') {
      return metric.numerator + '건 (대조 ' + (metric.denominator - undetermined)
        + '/' + metric.denominator + ')';
    }
    return metric.numerator + '건';
  }
  // M7 — C1 은 **폐쇄율과 이연률을 분리 표기**한다. 단일 폐쇄율만 보이면 이연으로
  // 100% 를 만드는 경로가 표면에서 사라져, UI5 의 유형 분리가 렌더 층에서 무너진다.
  // B1 의 커버리지 병기와 같은 근거로 이 지표에 한해 단일-수치 규칙(F3)보다 우선한다:
  // 맨 `60%` 는 "60% 를 고쳤다" 로 읽히지만, 나머지 40% 가 이연인지 미해소인지는
  // 다른 진술이고 그 둘을 한 숫자로 접는 것이 정확히 이 milestone 이 막으려는 조작이다.
  // 신규 색 클래스를 만들지 않는다(제약 2) — 괄호 병기만으로 낸다.
  if (metric.id === 'C1' && typeof metric.numerator === 'number'
      && typeof metric.denominator === 'number' && metric.denominator > 0) {
    const closure = Math.round((metric.numerator / metric.denominator) * 100);
    const deferredRate = typeof metric.deferred_rate === 'number'
      ? Math.round(metric.deferred_rate * 100) : null;
    return closure + '%' + (deferredRate === null ? '' : ' (이연 ' + deferredRate + '%)');
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
// M8 DD11 (b) — 줄 순서는 **지표 id 순**으로 결정적이다. M8이 세 줄을 더해
// collapse가 4 → 7줄이 되는데, 순서 규약이 없으면 늘어난 줄이 순서 없는 덤프가
// 된다(design critique F4). 각 줄에 자기 지표 id를 달고 마지막에 정렬한다 —
// 호출 순서가 곧 표시 순서이던 구조에서는 새 줄을 어디에 끼울지가 매번 판단
// 대상이 되고, 그 판단이 사람마다 다르면 순서는 결국 무작위가 된다.
// C2·C3은 METRICS_ORDER에 없으므로(값을 내지 않는 축) 맨 뒤로 보낸다.
function coReportRank(id) {
  const i = METRICS_ORDER.indexOf(id);
  return i === -1 ? METRICS_ORDER.length : i;
}

function coReportDetails(metrics) {
  const rows = [];
  const add = (id, text) => rows.push({ id: id, text: text });
  if (!metrics) return [];

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
    add('A3', parts.join(' · '));
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
    add('B3', parts.join(' · '));
  }

  // M6 — B1 상세. **새 collapse 를 열지 않는다.** 이 렌더러에는 이미 단일 공유
  // collapse(`<details class="msw-metrics-extra">`)가 있고, decisionPriority 상
  // B1 이 computed ∧ numerator===0 이면 우선순위 2라 extraRows 로 밀린다 — 그 안에서
  // 또 collapse 를 열면 2단 중첩 disclosure 가 되어 제약 4 와 PRODUCT.md 원칙 3
  // ("quiet by default, loud on demand")이 둘 다 거부하는 형태가 된다. 따라서 A3·B3 와
  // **동일 계층**(이 배열의 한 원소)에 두고 상위 3건 + `(+N건)` 절삭으로 상한을 지킨다.
  // 절삭분은 항상 보이므로 조용한 절삭이 아니다.
  //
  // 신규 문자열은 em-dash 대신 `·` 와 괄호만 쓴다(M3 F4 카피 규칙). milestone 이름은
  // PRD 표 셀에서 그대로 오고 그 셀은 관례상 볼드 마커를 포함하므로, HTML 면의
  // 마커 누출은 renderProseHtml(H10+H16 정규화)이 닫는다.
  const b1 = metrics.B1;
  if (b1 && Array.isArray(b1.drift_items) && b1.drift_items.length > 0) {
    const shown = b1.drift_items.slice(0, DRIFT_TOP_N);
    const parts = ['B1 상세: drift ' + b1.drift_items.length + '건'];
    shown.forEach((d) => {
      parts.push(String(d.milestone || '(이름 없음)')
        + ' (문서 ' + (d.doc_status || '?') + ' · 증거 ' + (d.evidence_verdict || '?') + ')');
    });
    const truncated = b1.drift_items.length - shown.length;
    add('B1', parts.join(' · ') + (truncated > 0 ? ' (+' + truncated + '건)' : ''));
  }

  // 커버리지 병기 — B3 의 `raw_surface_count` 미러. 제외분과 대조 못 한 행을 값 옆에
  // 두지 못하는 분량이므로 여기서 낸다. 이것이 없으면 `0건` 이 "완벽" 으로 읽힌다.
  if (b1 && typeof b1.raw_row_count === 'number' && typeof b1.denominator === 'number') {
    const undetermined = b1.undetermined_evidence_count || 0;
    add('B1', [
      'B1 커버리지: 대조 ' + (b1.denominator - undetermined) + '/' + b1.denominator + ' 행',
      '증거 미확정 ' + undetermined + '건',
      '비정규 status ' + (b1.noncanonical_status_count || 0) + '건 (분모 제외)',
      'plan 미연결 ' + (b1.no_plan_count || 0) + '건',
      '원시 행 ' + b1.raw_row_count + '개',
      '아카이브 PRD 제외 ' + (b1.archived_excluded_count || 0) + '개',
    ].join(' · '));
  }

  // M7 — C1 유형 분해. 값 셀은 두 수치(폐쇄율·이연률)까지가 한도이므로 나머지
  // 유형별 건수는 여기서 낸다. **새 collapse 를 열지 않는다** — B1 상세와 동일
  // 계층(이 배열의 한 원소)이다. 신규 문자열은 em-dash 없이 `·` 와 괄호만 쓴다.
  const c1 = metrics.C1;
  if (c1 && c1.status === 'computed' && typeof c1.denominator === 'number') {
    const parts = [
      'C1 유형 분해: 해소 ' + c1.numerator + '/' + c1.denominator + '건',
      '이연 ' + (c1.deferred_count || 0) + '건',
      '강등 ' + (c1.downgraded_count || 0) + '건',
      '기각 ' + (c1.rejected_count || 0) + '건',
      '미해소 ' + (c1.open_count || 0) + '건',
    ];
    // 유실이 있었던 주기의 값은 깨끗한 값이 아니다(DD8). 그 사실을 값 옆이 아니라
    // 여기서 낸다 — 감추면 계측 결함이 성적으로 보인다.
    if (typeof c1.coverage === 'string' && c1.coverage.indexOf('degraded') !== -1) {
      parts.push('계측 유실 있음 (하한값)');
    }
    add('C1', parts.join(' · '));
  }

  // ── multi-session-work-loop M8 (DD11) — 신규 병기 축 3줄 ───────────────────
  //
  // 셋 다 **값 셀이 아니라 여기** 산다. 값 셀 예외는 정확히 둘(B1 커버리지 ·
  // C1 이연률)이고 둘 다 근거가 같다 — "맨 숫자가 다른 진술로 오독된다". M8이
  // 더하는 셋은 그 근거를 만족하지 않는다:
  //   - `sealed_without_completion`은 **커버리지 축**이다. A1의 맨 백분율은
  //     오독되지 않고, 이 수치가 말하는 것은 "분자 producer가 얼마나 덮였는가"라
  //     `B1 커버리지:`와 같은 계층이 정확한 자리다.
  //   - C2/C3 귀속은 값 셀에 붙이는 것이 **구조적으로 불가능**하다. `formatValue`가
  //     `status === 'forward-only'`를 다른 어떤 분기보다 먼저 검사해 `'-'`를 조기
  //     반환하고, 그 분기를 고치면 모듈 헤더가 선언한 "C2·C3 forward-only 정직
  //     표기(값 미산출)"가 깨진다.
  //   - A2 표본 수도 같다 — percentile 분기는 `p50 X% · p95 Y%` 두 사실로 이미 차 있다.
  //
  // 신규 collapse 0개(단일 공유 collapse 안의 원소) · 신규 색 클래스 0개 ·
  // em-dash 금지(`·`와 괄호만).
  const a1 = metrics.A1;
  if (a1 && typeof a1.sealed_without_completion === 'number') {
    const parts = ['A1 커버리지: 봉인 후 완주 미기록 ' + a1.sealed_without_completion + '건'];
    // 0건은 "누락이 없다"가 아니라 "관측된 누락이 없다"이다. 완주 emit은 명령
    // 본문(산문)이 하므로 그 차이를 문구가 지운다.
    parts.push(a1.sealed_without_completion === 0
      ? '관측된 산문 누락 없음'
      : '분자 미계상 (봉인은 완주가 아님 · 과소 계상 방향)');
    add('A1', parts.join(' · '));
  }

  const a2 = metrics.A2;
  if (a2 && typeof a2.sample_count === 'number') {
    const parts = ['A2 상세: 세션 바인딩 표본 ' + a2.sample_count + '건'];
    if (typeof a2.denominator === 'number') parts.push('관측 세션 ' + a2.denominator + '개');
    // 소표본 caveat. 목표 판정(p50 30% 이상)은 표본이 쌓인 뒤로 미룬다 —
    // M8이 주장하는 것은 산출 가능성이지 분위수의 의미가 아니다.
    if (a2.sample_count > 0 && a2.sample_count < 5) parts.push('소표본 (목표 판정 보류)');
    add('A2', parts.join(' · '));
  }

  const c2 = metrics.C2;
  if (c2 && c2.attribution_coverage) {
    const ac = c2.attribution_coverage;
    add('C2', [
      'C2/C3 귀속: 차단 판정 연결 ' + (ac.with_gate_decision || 0) + '건',
      '해소 PR 연결 ' + (ac.with_remediation_pr || 0) + '건',
      'finding 전수 ' + (ac.findings_total || 0) + '건',
      '값 미산출 유지 (label-protocol 계약)',
    ].join(' · '));
  }

  const prevented = preventedDetail(metrics);
  if (prevented) add('B2', prevented);

  return rows
    .sort((x, y) => coReportRank(x.id) - coReportRank(y.id))
    .map((r) => r.text);
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
  // A measurement that exists but has gone stale is actionable, not absent:
  // hiding it is how the dashboard ends up silent about the very number this
  // milestone added. Only "never measured" stays quiet.
  const hasStale = sortedIds.some((id) => {
    const m = metrics[id];
    return m && m.stale === true;
  });

  if (!hasComputed && !hasInvalid && !hasStale) return null;

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
      // markdown 면은 H10(em-dash)만 정규화한다 — 백틱/볼드/링크 마커는 markdown 에서
      // 정당하므로 H16 은 HTML 전용이다(format-utils renderProseMd 계약).
      md += (extraIds.length > 0 ? '\n\n' : '') + detailLines.map(renderProseMd).join('\n\n');
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
  // A measurement that exists but has gone stale is actionable, not absent:
  // hiding it is how the dashboard ends up silent about the very number this
  // milestone added. Only "never measured" stays quiet.
  const hasStale = sortedIds.some((id) => {
    const m = metrics[id];
    return m && m.stale === true;
  });

  if (!hasComputed && !hasInvalid && !hasStale) return null;

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
    // 중립 톤 — 신규 색 클래스를 추가하지 않는다(제약 2). drift 상태 전용 accent 를
    // 신설하면 같은 viewport 에 2번째 강조가 생겨 B2·A3 행의 위계가 무너진다.
    //
    // esc() 가 아니라 renderProseHtml 을 쓴다 — B1 상세는 PRD 표 셀에서 온 prose 를
    // 담으므로 esc() 만 거치면 `**볼드**` 가 리터럴로 남아 제약 3(raw markdown marker
    // 금지)을 위반한다. 나머지 줄은 마커가 없어 동작이 같다.
    detailLines.forEach((line) => {
      html += '<p class="muted">' + renderProseHtml(line, formatUtils) + '</p>';
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
