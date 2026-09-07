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

// ── M4 Task 1: 표시 폭과 예산 ───────────────────────────────────────────────
//
// 이 줄의 폭 예산. **칼럼이지 픽셀이 아니다** — 이 저장소에는 레이아웃 엔진이 없어
// (renderer test는 jsdom-free) 칼럼은 실제 렌더 폭의 **대리 지표**다. 그 한계를 M4는
// 닫지 않고 열어 둔 채 명시한다(UI8). 예산 안인 줄이 브라우저에서 접힐 수 있다.
//
// 120인 근거는 데이터가 아니라 관례이고, 정당화는 **선정 순서**다(DD1): 먼저 120을
// 골랐고 그 다음 줄 설계 후보들을 재서 이 예산에 맞는 것을 택했다. 반대 방향(설계를
// 정하고 숫자를 거기 맞추는 것)이 §3.16이 경계한 침식이다.
//
// 옛 100칼럼을 유지하지 않은 이유는 그 숫자가 **달성 불가**이기 때문이다 — 라벨을
// 하나도 더하지 않은 M3의 줄이 이미 106이고, 100에 맞추려면 계약된 앵커 토큰 하나를
// 떨어뜨려야 하는데 그것은 UI6 위반이다. 100은 `l.length`로 재던 시절의 숫자이고,
// 계측기를 고치면 그 숫자도 함께 정정 대상이 된다.
//
// 침식 방지 장치는 **여유가 0이라는 사실 자체**다: 4자리 투영의 폭이 정확히 이 값이라
// (M4 Task 5) 줄을 조금이라도 넓히면 그 test가 붉어진다. 통과시키려면 이 상수와 그
// test를 **함께** 고쳐야 하고, 그 diff가 곧 기록이다.
const SHARED_LINE_BUDGET = 120;

// UAX #11의 Wide(W) · Fullwidth(F) 범위. 유니코드 테이블 전체가 아니라 **열거**다.
const WIDE_RANGES = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff],
  [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf],
  [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
];

// DD2 — 로케일이 폭을 정하는 Ambiguous 중 이 줄이 실제로 쓰는 둘만 열거한다.
const AMBIGUOUS_WIDE = new Set([0x00b7 /* · */, 0x2192 /* → */]);

// 표시 폭(칼럼). `String.length`(code unit)가 아니다 — 그 차이가 M4가 고치는 결함
// 자체다(M3의 줄: code unit 92 · 표시 폭 106).
//
// ── ambiguous를 2로 세는 이유 (DD2 · fail-closed) ────────────────────────────
//
// `·`(U+00B7)와 `→`(U+2192)는 UAX #11의 **Ambiguous**라 폭을 로케일이 정한다 —
// 서구 1, 동아시아 2. 이 줄이 실제로 읽히는 터미널은 운영자의 한국어 로케일이므로 1로
// 세면 가드가 **정확히 그 환경에서** 넘침을 놓친다. 예산 가드의 오차 방향은 보수적이어야
// 하므로 2를 택한다. 서구 로케일에서 같은 줄이 4칼럼 짧게 보이는 것은 여유이지 위반이
// 아니다.
//
// ── 한계: 범위 열거라 그 밖의 문자는 과소 계산된다 ──────────────────────────
//
// 의존성을 늘리지 않으려고 코드 포인트 범위를 직접 적었다. 오늘 이 줄의 문자
// 집합(한글 · ASCII · `·` · `→`)에 대해서는 정확하지만, 그 밖의 Wide 문자(이모지 ·
// CJK 확장면)나 결합 문자(폭 0)가 들어오면 폭이 **과소** 계산된다. 과소 계산은 가드를
// 느슨하게 만드는 방향이므로, 줄에 새 문자 집합이 들어오면 이 표를 함께 넓혀야 한다.
// 오늘 그 위험이 낮은 이유는 투영에 자유 문자열이 없기 때문이다(DD12 계보).
function displayWidth(text) {
  const t = String(text == null ? '' : text);
  let w = 0;
  // 코드 포인트 순회 — surrogate pair를 2문자로 세지 않는다.
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    if (AMBIGUOUS_WIDE.has(cp)) { w += 2; continue; }
    let wide = false;
    for (let i = 0; i < WIDE_RANGES.length; i += 1) {
      if (cp >= WIDE_RANGES[i][0] && cp <= WIDE_RANGES[i][1]) { wide = true; break; }
    }
    w += wide ? 2 : 1;
  }
  return w;
}

// 값 부재의 표기. `0`이 아니다(UI3) — 없는 것을 0으로 적지 않는다.
const ABSENT = '미산출';

// 값 토큰 = 단위가 붙은 수치 **또는** 부재 표기. 둘 다 자기 커버리지를 단다.
const VALUE_TOKEN = /\d+(?:\.\d+)?(?:min|d)\b|미산출/g;
// 값 토큰 **바로 뒤**에 와야 하는 커버리지 짝. 분모는 그룹 라벨이 선언하므로 토큰은
// **분자만** 단다(M4 DD3). 형태가 느슨해진 만큼 그 몫을 아래 3번 단언이 받는다.
const ADJACENT_COVERAGE = /^ \(\d+\)/;

// 분모를 선언하는 **그룹 라벨**(지배자). 콜론으로 끝나고 그 오른쪽의 값 토큰들을
// 지배한다. 오늘 정확히 둘뿐이며, 새 그룹이 생기면 여기와 TOKEN_GOVERNOR를 함께 넓힌다.
const GOVERNOR = /리드타임 \(\d+\/\d+ 측정\) · p50:|패널→ship \(조인 \d+\):/g;

// 값 토큰의 라벨 → 그 토큰을 지배해야 하는 그룹 라벨의 종류. 이 표가 **닫혀 있는 것**이
// 요점이다: 모르는 라벨은 통과시키지 않고 throw해서 falsifier를 의도적으로 갱신하게
// 만든다. 조용히 넓히면 3번 단언이 그만큼 무력해진다.
// **프로토타입 없는 map 이다.** 객체 리터럴이면 `constructor` 같은 라벨이
// `Object.prototype` 에서 truthy 를 받아 "모르는 라벨" 분기를 건너뛰고 엉뚱한 오진을
// 낸다(실측). fail-closed 자체는 유지되지만 «이 표가 닫혀 있다»는 위 명제가 그만큼
// 거짓이 된다 — `env-contract/value.js#rawOf` 가 같은 이유로 `hasOwnProperty` 를 쓴다.
const TOKEN_GOVERNOR = Object.assign(Object.create(null), {
  '패널': 'head', 'ledger': 'join', 'hash': 'join',
});

// 값 토큰 바로 왼쪽의 라벨. 줄이 `<라벨> <값> (<분자>)` 형태이므로 값 직전 공백 앞의
// 한 덩어리다. 구분자에 `·` 와 `:` 를 넣는 이유는 그 둘이 토큰·그룹의 경계이기 때문이다.
const LABEL_BEFORE = /(?:^|[ ·:])([^ ·:]+) $/;
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
function token(label, valueText, matched) {
  return label + ' ' + valueText + ' (' + count(matched) + ')';
}

// 투영(`summarizeForSurface` 산출) → 한 줄.
//
// 반환: `{ text, parts }`.
//   text  — 소비처 셋이 공유하는 **한 줄**. 이 문자열이 STATUS.md · status.html ·
//           `renderHuman` 첫 줄에 그대로 실린다.
//   parts — 토큰별 조각 + `note`. `note`는 **별도 줄**이다(같은 줄에 붙이면
//           `SHARED_LINE_BUDGET`과 충돌한다). 소비처가 두 줄을 각각 렌더한다.
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
  // 헤드의 `(측정/코퍼스 측정)` 이 이 토큰의 분모를 이미 선언했다 — 분자만 단다.
  const panelToken = token(
    '패널',
    value(panel && panel.p50, fmtMin),
    panel ? panel.n : 0,
  );

  const ledger = byAnchor[ANCHOR_LEDGER] || null;
  const ship = byAnchor[ANCHOR_SHIP] || null;
  // 두 앵커는 각각 뜬다 — 절대 합치지 않고, 한쪽이 없다고 다른 쪽으로 대체하지
  // 않는다(UI8/DD4). 오늘 살아있는 신호는 값이 아니라 **커버리지 차이**다.
  //
  // ── M4 DD3: 분모는 그룹 라벨이 한 번 선언한다 ─────────────────────────────
  //
  // 두 분모는 오늘 우연히 같은 값이라 화면에서 구분되지 않지만 **모집단이 다르다** —
  // 헤드의 `측정` 은 패널 span이 측정된 레코드(`result.records`)이고, 여기의 `조인` 은
  // `recorded_at` 파싱에 성공해 조인 후보가 된 레코드(`eligible`)다. 해법은 분모를
  // 토큰마다 반복하는 것이 아니라 그룹 라벨이 **한 번** 선언하는 것이고, 그것은 이
  // 파일이 통계 이름(`p50`)에 이미 쓴 절약과 같은 형태다.
  //
  // `패널→ship` 을 줄여 칼럼을 벌지 않는다 — PRD 결정 2("이름이 재는 구간을 말한다")가
  // 운영자 소유 제약이라, 칼럼을 벌려고 그 이름을 깎는 것은 UI6을 조용히 약화시키는
  // 거래다.
  const shipGroup = '패널→ship (조인 ' + count(ppsCov.eligible) + '):';
  const ledgerToken = token(
    'ledger',
    value(ledger && ledger.p50, fmtDay),
    Number.isFinite(ppsCov.matched_ledger) ? ppsCov.matched_ledger : (ledger ? ledger.n : 0),
  );
  const shipToken = token(
    'hash',
    value(ship && ship.p50, fmtDay),
    Number.isFinite(ppsCov.matched_ship) ? ppsCov.matched_ship : (ship ? ship.n : 0),
  );

  const degradations = Array.isArray(s.degradations) ? s.degradations : [];
  let note = null;
  if (s.state === 'degraded') {
    note = '일부 소스 손상: ' + (degradations.length ? degradations.join(' · ') : '사유 미상');
  } else if (s.state === 'blind') {
    note = ABSENT + ' 사유: ' + (degradations.length ? degradations.join(' · ') : '관측 0건');
  } else if (degradations.length) {
    // ── M4 리뷰 흡수: `ok` + degradations 는 침묵할 자리가 아니다 ──────────────
    //
    // `state` 는 `damaged = read_error || parse_failures > 0`(`leadtime.js`)로만 정해지므로
    // `git-disabled` 는 강등을 실으면서도 `ok` 로 남는다. note 를 `state` 로만 분기하면
    // `MCCP_LEADTIME_GIT=off` 로 돈 줄이 켠 줄과 **바이트 단위로 같아진다**(실측). 그러면
    // DD6 이 내건 "끈 것을 조용히 끄지 않는다" 가 산출물 JSON 에서만 참이고 이 줄이 실리는
    // 세 표면에서는 거짓이 되어, `unclassified` 증가가 코퍼스의 성질로 오독된다 —
    // `leadtime.js` 가 그 오독을 명시적으로 금지한 바로 그 자리다.
    //
    // 문구를 `손상` 과 가르는 것이 요점이다. 운영자가 레버를 당겨 줄인 관측을 손상으로
    // 적으면 이번엔 반대 방향으로 없는 사실을 판다.
    note = '관측 축소: ' + degradations.join(' · ');
  }

  return {
    // head 가 `· p50:` 로 끝나므로 첫 값 토큰은 공백으로 잇는다 — 그 사이에 `·` 를
    // 하나 더 넣으면 통계 이름이 값 토큰처럼 보인다. ship 그룹 라벨도 콜론으로
    // 끝나므로 같은 이유로 공백 하나만 두고 잇는다.
    text: head + ' ' + panelToken + ' · ' + shipGroup + ' ' + ledgerToken + ' · ' + shipToken,
    parts: {
      head: head,
      panel: panelToken,
      shipGroup: shipGroup,
      ledger: ledgerToken,
      ship: shipToken,
      note: note,
    },
  };
}

function labelBefore(t, idx) {
  const m = LABEL_BEFORE.exec(t.slice(0, idx));
  return m ? m[1] : null;
}

// DD14의 falsifier. **실제로 실패할 수 있어야** 게이트다 — 짝을 뗀 문자열이
// 통과하면 이 함수는 no-op이고, 그것이 이 plan이 두 번 흡수한 결함 계열이다.
//
// 강제 주체는 **test다, 런타임이 아니다** — production 호출부는 0건이다. 그것으로
// 충분한 이유는 이 줄의 생산자가 `formatLeadtimeLine` 단일이기 때문이고, 두 번째
// 생산자가 생기는 순간 이 함수를 그 생산자의 반환 경로에 넣어야 한다.
//
// ── M4 DD4: 단언이 셋이 됐고, 총량은 약해지지 않았다 ────────────────────────
//
// 커버리지 짝이 `(a/b)` 에서 `(n)` 으로 짧아지면서 2번의 형태는 느슨해졌다. 그 몫을
// 3번이 받는다 — 분모를 선언한 그룹 라벨이 그 토큰을 실제로 **지배**하는가. 3번이
// 없으면 그룹 라벨을 지운 줄이 통과해 DD3이 없던 일이 된다.
function assertCoverageAdjacency(text) {
  const t = String(text == null ? '' : text);

  // 1. 코퍼스 커버리지가 맨 앞에 온다.
  if (!HEAD_COVERAGE.test(t)) {
    throw new Error('leadtime line does not lead with corpus coverage (DD14): ' + t.slice(0, 120));
  }

  // 3번이 쓸 지배자 목록. exec 순회라 왼쪽에서 오른쪽으로 정렬돼 있다.
  const governors = [];
  GOVERNOR.lastIndex = 0;
  let g;
  while ((g = GOVERNOR.exec(t)) !== null) {
    governors.push({ index: g.index, kind: g[0].indexOf('리드타임') === 0 ? 'head' : 'join' });
  }

  VALUE_TOKEN.lastIndex = 0;
  let m;
  let seen = 0;
  while ((m = VALUE_TOKEN.exec(t)) !== null) {
    seen += 1;

    // 2. 값 토큰 바로 뒤에 자기 분자가 온다.
    const rest = t.slice(m.index + m[0].length);
    if (!ADJACENT_COVERAGE.test(rest)) {
      throw new Error('value token "' + m[0] + '" has no adjacent coverage (DD14) at index '
        + m.index + ': ' + t.slice(0, 120));
    }

    // 3. 그 토큰의 **가장 가까운 왼쪽 지배자**가 자기 분모를 선언한 그룹 라벨이다.
    const label = labelBefore(t, m.index);
    const expected = TOKEN_GOVERNOR[label];
    if (!expected) {
      throw new Error('value token "' + m[0] + '" carries an unrecognised label "' + label
        + '" (M4 DD4) at index ' + m.index
        + ' — extend TOKEN_GOVERNOR deliberately rather than widening this check: '
        + t.slice(0, 120));
    }
    let nearest = null;
    for (let i = 0; i < governors.length; i += 1) {
      if (governors[i].index < m.index) nearest = governors[i]; else break;
    }
    if (!nearest) {
      throw new Error('value token "' + m[0] + '" has no group label declaring its denominator '
        + '(M4 DD4) at index ' + m.index + ': ' + t.slice(0, 120));
    }
    if (nearest.kind !== expected) {
      throw new Error('value token "' + m[0] + '" is governed by the "' + nearest.kind
        + '" group label but its denominator is declared by the "' + expected
        + '" one (M4 DD4) at index ' + m.index + ': ' + t.slice(0, 120));
    }
  }
  if (seen === 0) {
    throw new Error('leadtime line carries no value token at all (DD14): ' + t.slice(0, 120));
  }
  return true;
}

module.exports = {
  ABSENT: ABSENT,
  SHARED_LINE_BUDGET: SHARED_LINE_BUDGET,
  displayWidth: displayWidth,
  fmtMin: fmtMin,
  fmtDay: fmtDay,
  emptySummary: emptySummary,
  formatLeadtimeLine: formatLeadtimeLine,
  assertCoverageAdjacency: assertCoverageAdjacency,
};
