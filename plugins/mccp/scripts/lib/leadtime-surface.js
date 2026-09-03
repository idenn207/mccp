'use strict';

// leadtime-observability M3 — 리드타임 한 줄 포매터.
//
// 순수 함수만 있다. fs도 child_process도 오라클도 읽지 않고, `leadtime.js`를
// **부르지 않는다** — 의존은 `leadtime.js → leadtime-surface.js` 한 방향뿐이다.
// 반대로 하면 `module.exports`가 파일 끝에서 할당되는 `leadtime.js`를 top-level
// require로 받게 되어 `fmtMin`이 호출 시점에 `undefined`가 된다(Task 2).
//
// ── 이 모듈이 소유하는 것 ────────────────────────────────────────────────────
//
//   fmtMin / fmtDay          단위 어휘. 어휘가 하나여야 CLI · STATUS.md ·
//                            distribution.json 세 면이 같은 문장을 쓴다(DD1).
//   formatLeadtimeLine       투영 → 한 줄. 소비처 셋이 공유하는 유일한 포맷 지점.
//   assertCoverageAdjacency  DD14의 falsifier. 짝 없는 값 토큰이 있으면 throw.
//   emptySummary             blind 골격. 실패 sentinel이 이 골격의 한 인스턴스여야
//                            "관측 부재"와 "렌더 결함"이 갈린다(DD3).
//
// ── DD14: 커버리지 병기는 **인접성**으로 성립한다 ────────────────────────────
//
// CLI는 "커버리지 줄이 값보다 먼저 나온다"를 줄 순서로 지켰다. 한 줄 표면에는
// "앞 줄"이 없으므로 같은 명제를 1차원으로 다시 적는다:
//
//   (1) 코퍼스 커버리지가 맨 앞에 온다 — `리드타임 p50 (50/63 측정)`.
//   (2) 그 뒤 **모든** 값 토큰은 자기 커버리지를 괄호로 바로 뒤에 단다.
//       예외는 없다. `미산출`도 값 토큰이고 자기 커버리지를 단다.
//
// (2)에 예외를 두지 않는 것이 이 파일의 계약이다. plan의 예시 문자열은
// `패널 p50 7.6min`에 짝이 없어 (2)와 자기모순이었고, 예외를 하드코딩하면
// `assertCoverageAdjacency`가 그 예외만큼 무력해진다. 대신 통계 이름(`p50`)을
// 헤드에서 **한 번** 선언해 토큰마다 반복하지 않으므로, 짝을 붙이고도 줄이
// 짧아진다(implement gate 2.5.4 decision D2).
//
// ── 이 포매터가 말하지 **않는** 것 ───────────────────────────────────────────
//
//   지표 4(두 앵커 불일치)  — 오늘 구조적으로 0이다(ledger의 `completed_at`이
//                             ship receipt의 `meta.created_at` 복사본). 한 줄에
//                             `불일치 0`을 적으면 측정되지 않은 주장을 파는 것이라
//                             싣지 않는다(DD11). 파일에는 note와 함께 실린다.

const ANCHOR_LEDGER = 'ledger_basename';
const ANCHOR_SHIP = 'ship_plan_hash';

// 값 부재의 표기. `0`이 아니다(UI3) — 없는 것을 0으로 적지 않는다.
const ABSENT = '미산출';

// 값 토큰 = 단위가 붙은 수치 **또는** 부재 표기. 둘 다 자기 커버리지를 단다.
const VALUE_TOKEN = /\d+(?:\.\d+)?(?:min|d)\b|미산출/g;
// 값 토큰 **바로 뒤**에 와야 하는 커버리지 짝.
const ADJACENT_COVERAGE = /^ \(\d+\/\d+\)/;
// 맨 앞의 코퍼스 커버리지 + 그 뒤 값 전체를 지배하는 통계 이름.
const HEAD_COVERAGE = /^리드타임 \(\d+\/\d+ 측정\) · p50:/;

function fmtMin(ms) {
  return (ms / 60000).toFixed(1) + 'min';
}

function fmtDay(ms) {
  return (ms / 86400000).toFixed(2) + 'd';
}

// 수치가 실재할 때만 수치를 쓴다. 그 외에는 전부 `미산출` — `null`·`undefined`·
// NaN·Infinity를 0으로 접지 않는다(DD13).
function value(ms, fmt) {
  return Number.isFinite(ms) ? fmt(ms) : ABSENT;
}

function count(n) {
  return Number.isFinite(n) ? n : 0;
}

// blind 골격. 두 앵커 키는 **언제나** 실린다(부재는 `null`) — 원본 `by_anchor`가
// 조건부 키라는 사실을 소비처가 물려받지 않게 한다(Task 1 3b).
function emptySummary(degradations) {
  return {
    tool: 'leadtime',
    state: 'blind',
    coverage: { panel_records: 0, measurable: 0, counts_are_lower_bound: false },
    panel_span: null,
    post_panel_span: {
      by_anchor: { ledger_basename: null, ship_plan_hash: null },
      coverage: {
        eligible: 0, matched_ledger: 0, matched_ship: 0,
        both: 0, only_ledger: 0, only_ship: 0, neither: 0,
      },
      unmatched: {},
      disagreement: null,
      disagreement_note: '',
    },
    degradations: Array.isArray(degradations) ? degradations.slice() : [],
  };
}

// 값 + 인접 커버리지. 값이 부재여도 커버리지는 그대로 병기한다(UI2) — 커버리지를
// 함께 잃으면 "표본이 없다"와 "표본은 있는데 값이 없다"가 화면에서 같아진다.
function token(label, valueText, matched, total) {
  return label + ' ' + valueText + ' (' + count(matched) + '/' + count(total) + ')';
}

// 투영(`summarizeForSurface` 산출) → 한 줄.
//
// 반환: `{ text, parts }`.
//   text  — 소비처 셋이 공유하는 **한 줄**. 이 문자열이 STATUS.md · status.html ·
//           `renderHuman` 첫 줄에 그대로 실린다.
//   parts — 토큰별 조각 + `note`. `note`는 **별도 줄**이다(같은 줄에 붙이면 100칼럼
//           상한과 충돌한다 — Task 6b). 소비처가 두 줄을 각각 렌더한다.
function formatLeadtimeLine(summary) {
  const s = summary || {};
  const cov = s.coverage || {};
  const pps = s.post_panel_span || {};
  const ppsCov = pps.coverage || {};
  const byAnchor = pps.by_anchor || {};

  // 통계 이름(`p50`)은 토큰마다 반복하지 않고 **한 번** 선언한다 — `p50:` 뒤의 값이
  // 전부 그 통계다. 그래야 모든 값에 커버리지 짝을 붙이고도 줄이 짧아진다(D2).
  const head = '리드타임 (' + count(cov.measurable) + '/'
    + count(cov.panel_records) + ' 측정) · p50:';

  const panel = s.panel_span || null;
  const panelToken = token(
    '패널',
    value(panel && panel.p50, fmtMin),
    panel ? panel.n : 0,
    cov.measurable,
  );

  const ledger = byAnchor[ANCHOR_LEDGER] || null;
  const ship = byAnchor[ANCHOR_SHIP] || null;
  // 두 앵커는 각각 뜬다 — 절대 합치지 않고, 한쪽이 없다고 다른 쪽으로 대체하지
  // 않는다(UI8/DD4). 오늘 살아있는 신호는 값이 아니라 **커버리지 차이**다.
  const ledgerToken = token(
    '패널→ship ledger',
    value(ledger && ledger.p50, fmtDay),
    Number.isFinite(ppsCov.matched_ledger) ? ppsCov.matched_ledger : (ledger ? ledger.n : 0),
    ppsCov.eligible,
  );
  const shipToken = token(
    'hash',
    value(ship && ship.p50, fmtDay),
    Number.isFinite(ppsCov.matched_ship) ? ppsCov.matched_ship : (ship ? ship.n : 0),
    ppsCov.eligible,
  );

  const degradations = Array.isArray(s.degradations) ? s.degradations : [];
  let note = null;
  if (s.state === 'degraded') {
    note = '일부 소스 손상: ' + (degradations.length ? degradations.join(' · ') : '사유 미상');
  } else if (s.state === 'blind') {
    note = ABSENT + ' 사유: ' + (degradations.length ? degradations.join(' · ') : '관측 0건');
  }

  return {
    // head 가 `· p50:` 로 끝나므로 첫 값 토큰은 공백으로 잇는다 — 그 사이에 `·` 를
    // 하나 더 넣으면 통계 이름이 값 토큰처럼 보인다.
    text: head + ' ' + [panelToken, ledgerToken, shipToken].join(' · '),
    parts: {
      head: head,
      panel: panelToken,
      ledger: ledgerToken,
      ship: shipToken,
      note: note,
    },
  };
}

// DD14의 기계적 강제. **실제로 실패할 수 있어야** 게이트다 — 짝을 뗀 문자열이
// 통과하면 이 함수는 no-op이고, 그것이 이 plan이 두 번 흡수한 결함 계열이다.
function assertCoverageAdjacency(text) {
  const t = String(text == null ? '' : text);
  if (!HEAD_COVERAGE.test(t)) {
    throw new Error('leadtime line does not lead with corpus coverage (DD14): ' + t.slice(0, 120));
  }
  VALUE_TOKEN.lastIndex = 0;
  let m;
  let seen = 0;
  while ((m = VALUE_TOKEN.exec(t)) !== null) {
    seen += 1;
    const rest = t.slice(m.index + m[0].length);
    if (!ADJACENT_COVERAGE.test(rest)) {
      throw new Error('value token "' + m[0] + '" has no adjacent coverage (DD14) at index '
        + m.index + ': ' + t.slice(0, 120));
    }
  }
  if (seen === 0) {
    throw new Error('leadtime line carries no value token at all (DD14): ' + t.slice(0, 120));
  }
  return true;
}

module.exports = {
  ABSENT: ABSENT,
  fmtMin: fmtMin,
  fmtDay: fmtDay,
  emptySummary: emptySummary,
  formatLeadtimeLine: formatLeadtimeLine,
  assertCoverageAdjacency: assertCoverageAdjacency,
};
