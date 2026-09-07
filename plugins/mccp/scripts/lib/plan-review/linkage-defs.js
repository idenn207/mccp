'use strict';

// review-record-linkage M1 — 세 판정 기준의 순수 정의.
//
// 이 파일이 소유하는 것은 **M1이 새로 만드는 정의뿐**이다:
//   D1 라운드 구조 보유   → hasRoundStructure(measurement)
//   D2 리뷰 대상 ship     → classifyShipEligibility(receipt)
//   D3 층간 링크          → classifyLink(receipt, record)
// 그리고 그 선택의 반증 자료인 ROUND_STRUCTURE_CONTROLS(5개 대조 정의).
//
// ── 여기 없는 것과 그 이유 (DD1a) ────────────────────────────────────────────
//
// 패널 레코드 서명 판별(`# Plan Review Panel — <slug>`)과 `## Measurement` 펜스
// 파싱은 **`plan-review/corpus.js`가 이미 소유한다**(`:211` PANEL_TITLE_RE ·
// `:213-217` isPanelRecord · `:225-273` parseRecord). 그래서 이 모듈은 그것들을
// export하지 않고, `linkage-audit.js`가 `corpus.parseRecord`를 소비한다.
//
// 초안은 "corpus.js와 동일 규칙"으로 여기 다시 만들라고 적었는데, 그것이 정확히
// M1이 하류 milestone에 금지한 복제다. 정의가 두 벌이면 두 도구가 같은 코퍼스에
// 대해 다른 소속 건수를 보고하고, 그때 어느 쪽이 맞는지 말해 줄 것이 없다.
// `linkage-defs.test.js`가 `isPanelRecord`의 **부재**를 단언한다.
//
// ── 순수 · dep-free · never-throws ───────────────────────────────────────────
//
// `require` 0건이다. 그 계약이 있는 이유는 하류 milestone(M4)이 write-time 검증에
// D1을 쓰려 하기 때문이다. 정의가 I/O 모듈 안에 있으면 그 import가 fs ·
// child_process · git 호출을 write 경로로 끌고 들어온다 — `record.js:16-21`이
// "Pure and dep-free … NEVER throws"를 계약으로 선언한 바로 그 경로다. 순수 술어만
// 담은 파일을 import하면 전이 의존이 0이다.
//
// 입력은 리뷰어(LLM 포함)가 쓴 반신뢰 산출물에서 온다. 모든 함수는 총함수다 —
// 어떤 입력에도 throw하지 않고, 판독 불가는 `null`/`undecidable`로 접는다.
// 경로를 만들지 않는다(읽기 전용이므로 path traversal 표면 자체가 없다).
//
// ── 정규식 구성 제약 (implement-gate security S1) ────────────────────────────
//
// ROUND_STRUCTURE_CONTROLS의 5개 정규식은 레코드 **전문**에 대해 각각 돈다.
// throw 없이 그냥 멎는 실패(ReDoS)는 "총함수"가 막아 주지 않으므로 구성으로 막는다:
//   - 중첩 quantifier 금지 (`(a+)+` 류)
//   - 앵커 우선, 백트래킹 유발 교대(alternation) 금지
//   - 모든 패턴이 선형 스캔
// `linkage-defs.test.js`가 병리적 입력에 대해 벽시계 상한을 단언한다.

// ── D1 — 라운드 구조 보유 ────────────────────────────────────────────────────
//
// 지표 3이 지정한 읽는 주체는 "record.js 자체 검증 → 미달 형식은 기록 시점에
// 거부"다. 기록 시점에 거부하려면 정의가 writer가 결정론적으로 생산·검증할 수
// 있는 **구조**여야 한다. 산문 토큰(대조 B~E)은 리뷰어가 우연히 "R1에서 흡수함"
// 이라 적기만 해도 참이 되므로 write-time에 강제할 대상이 아니다.
//
// 그래서 정의는 "패널 레코드의 `## Measurement` JSON에 `rounds`가 정수 ≥ 1로
// 존재"다. 오늘 값은 0%이며, 그것이 5개 후보 중 **가장 낮다** — 기준 게이밍이
// 우려한 방향의 정반대다.
function hasRoundStructure(measurement) {
  if (measurement === null || typeof measurement !== 'object') return false;
  if (Array.isArray(measurement)) return false;
  const r = measurement.rounds;
  return Number.isInteger(r) && r >= 1;
}

// 대조군. 정의 선택의 반증 자료이므로 문서가 아니라 **코드에 상주**한다 —
// 문서에만 있으면 정의가 바뀔 때 함께 재측정될 보장이 없다.
//
// 이들은 `text`(레코드 원문)에 대해 돌고, D1과 달리 measurement를 보지 않는다.
// 그것이 요점이다: 산문 토큰 정의가 무엇을 세는지 보여 주기 위한 것이다.
const ROUND_STRUCTURE_CONTROLS = Object.freeze([
  Object.freeze({
    id: 'A',
    label: '`#### Round N` heading',
    test: function (text) { return /^#{4}[ \t]+Round[ \t]+\d/m.test(str(text)); },
  }),
  Object.freeze({
    id: 'B',
    label: '`round N` 토큰',
    test: function (text) { return /\bround[ \t]+\d/i.test(str(text)); },
  }),
  Object.freeze({
    id: 'C',
    label: '`R1`/`R2` 토큰',
    test: function (text) { return /\bR[1-5]\b/.test(str(text)); },
  }),
  Object.freeze({
    id: 'D',
    label: 'B 또는 C',
    test: function (text) {
      const s = str(text);
      return /\bround[ \t]+\d/i.test(s) || /\bR[1-5]\b/.test(s);
    },
  }),
  Object.freeze({
    id: 'E',
    label: '`round`/`라운드` 단어',
    test: function (text) { return /round|라운드/i.test(str(text)); },
  }),
]);

// ── D1 자격 — 3값 (review-record-linkage M4, DD5) ────────────────────────────
//
// `hasRoundStructure`는 술어이지 자격이 아니다. dispatch 이전에 멎은 실행은 리뷰
// 라운드가 실제로 0회이고, 그런 레코드에 "라운드 구조 미보유"라고 적는 것은 범주
// 오류다 — 구조는 있고 그 값이 없다. 그래서 D2와 같은 모양의 3값을 둔다.
//
// **`halt_stage`는 읽지 않는다.** 초안은 그것을 면제 근거로 삼았는데, 그 값은
// `cli.js`가 `--halt-stage`로 받아 trim만 하는 **caller 자유 문자열**이라 자격이
// 자기신고가 된다 — DD2가 `--rounds` 플래그를 거부한 바로 그 이유가 이 축에서
// 열려 있었고, DD4가 유일한 강제 지점으로 지목한 감사 종료코드를 문자열 하나로
// 빠져나갈 수 있었다. 그래서 근거를 **caller가 쓸 수 없는 두 사실**로 교체했다:
//
//   (a) `rounds === null`  — 원장 파일이 **존재하지 않았다**는 파일시스템 사실.
//       `cmdRecord`가 `resolveStatePath` + `existsSync`로 판정해 주입한다. 세어진
//       0회(`rounds === 0`)와 세어진 적 없음(`null`)은 다른 사실이므로 여기서도
//       다르게 취급된다 — `0`은 `absent`다.
//   (b) 패널 증거 부재 — `quorum === null`(decision·l2 둘 다 판독 불가) 또는
//       `quorum.responded === 0`(아무도 응답하지 않았다). 두 값 모두 `record.js`가
//       `decision.json`/`l2.json`에서 파생하므로 CLI 표면이 없다.
//
// `responded`가 `null`인 경우는 "비었다"가 아니라 "읽지 못했다"이므로 면제하지
// 않는다 — 강제되는 쪽(`absent`)으로 접는 것이 fail-closed 방향이다.
//
// 이것이 분모 게이밍이 아니라는 근거는 측정 가능하다: 과거 레코드에는 `rounds`
// 키 자체가 없어 전건 `absent`이므로, 이 자격을 도입해도 동결 baseline은 움직이지
// 않는다. 자격이 값을 올려 주는 대상은 오직 착지 후 레코드뿐이다.
const ROUND_STRUCTURE_VERDICTS = Object.freeze(['present', 'not_enrolled', 'absent']);

function classifyRoundStructure(measurement) {
  const m = obj(measurement);
  if (m === null) {
    return { verdict: 'absent', reason: 'record has no readable ## Measurement object' };
  }
  if (hasRoundStructure(m)) {
    return {
      verdict: 'present',
      reason: 'measurement.rounds is an integer >= 1 (' + m.rounds + ')',
    };
  }
  if (!Object.prototype.hasOwnProperty.call(m, 'rounds')) {
    return {
      verdict: 'absent',
      reason: 'measurement carries no `rounds` key at all — this record was produced by a ' +
        'build with no round axis, which is absence of the field, not a measured value',
    };
  }
  if (m.rounds === null) {
    const q = obj(m.quorum);
    if (q === null) {
      return {
        verdict: 'not_enrolled',
        reason: 'measurement.rounds is null (no round ledger existed) and the record carries ' +
          'no readable quorum — the run halted before any panel evidence was produced, so ' +
          'there was no review round to count',
      };
    }
    if (q.responded === 0) {
      return {
        verdict: 'not_enrolled',
        reason: 'measurement.rounds is null (no round ledger existed) and quorum.responded is 0 ' +
          '— no reviewer answered, so there was no review round to count',
      };
    }
    return {
      verdict: 'absent',
      reason: 'measurement.rounds is null but the record carries panel evidence ' +
        '(quorum.responded=' + describe(q.responded) + ') — a run that reviewed and ' +
        'could not say how many rounds it spent is a measurement gap, not an exemption',
    };
  }
  return {
    verdict: 'absent',
    reason: 'measurement.rounds is ' + describe(m.rounds) +
      ', which is not an integer >= 1 (D1 requires an integer; 0 means a ledger existed and ' +
      'counted nothing, and a string or float is not a count)',
  };
}

// ── D2 — 리뷰 대상 ship ──────────────────────────────────────────────────────
//
// 3값이다. 과거 코퍼스에서는 전건 `undecidable`이고, 그것이 결함이 아니라
// **오늘의 정직한 상태**다. 실측으로 배제한 판별자 (경계 트리 75건 기준 —
// 초판 주석의 71 은 삭제된 작업-트리 파티션의 분모였다):
//   - plan_hash            75/75 존재  → 판별 불가
//   - meta.command         75/75 상수  → 판별 불가
//   - resolution.review_*   0/75       → 패널 축이 ship에 도달하지 않는다
//   - 상류 plan receipt    git에 한 번도 tracked된 적 없음 → 증거 부재
//
// "패널 레코드가 존재하면 리뷰 대상"은 **채택하지 않는다** — 그것은 분모를 분자로
// 정의하는 것이라 층간 링크율을 자명하게 100%로 만든다. 측정을 가장한 동어반복이다.
//
// 전방 판별자는 하류 milestone이 만들 **명시 proof 필드**다(휴리스틱 아님) —
// CLAUDE.md §3.12의 ambient `codex_disabled` 대 명시 `codex_disabled_at_pr`
// 구분과 같은 형태. 파일명 prefix(`archive-*`/`chore-*`)는 관례일 뿐 계약이
// 아니므로 정의로 삼지 않는다(집계 쪽에서 라벨로만 센다).
const ELIGIBILITY_FIELD = 'plan_review_expected';   // boolean, 명시 전용
const NOT_ELIGIBLE_REASON_FIELD = 'no_plan_review_reason';

function classifyShipEligibility(receipt) {
  const meta = obj(receipt && receipt.meta);
  if (meta === null) {
    return { verdict: 'undecidable', reason: 'receipt has no readable meta object' };
  }
  const declared = meta[ELIGIBILITY_FIELD];

  if (declared === true) {
    return { verdict: 'eligible', reason: 'meta.' + ELIGIBILITY_FIELD + '=true (explicit)' };
  }
  if (declared === false) {
    // 부정 주장에는 사유가 붙어야 한다. 사유 없는 not_eligible은 분모를 줄이는
    // 무증거 주장이고, 지표 2를 달성 가능하게 만들려는 압력이 정확히 그리로 향한다.
    const why = meta[NOT_ELIGIBLE_REASON_FIELD];
    if (typeof why === 'string' && why.trim().length > 0) {
      return { verdict: 'not_eligible', reason: 'meta.' + NOT_ELIGIBLE_REASON_FIELD + ': ' + why.trim() };
    }
    return {
      verdict: 'undecidable',
      reason: 'meta.' + ELIGIBILITY_FIELD + '=false but meta.' +
        NOT_ELIGIBLE_REASON_FIELD + ' is absent or empty — an unexplained exclusion is not a decision',
    };
  }
  return {
    verdict: 'undecidable',
    reason: 'no explicit meta.' + ELIGIBILITY_FIELD +
      ' — and nothing else in a ship receipt decides it (plan_hash and meta.command are ' +
      'present on every receipt; the upstream plan receipt was never git-tracked)',
  };
}

// ── D3 — 층간 링크 ──────────────────────────────────────────────────────────
//
// **구조적 위치에서만** 인정한다. 본문 어디든의 문자열 등장은 링크가 아니다 —
// PRD가 찾은 `receipt_hash` 문자열 4건은 전수 확인 결과 리뷰어가 그 필드를
// *주제로 논한* finding 본문이었다. 위치 제약이 그 오탐을 규칙 하나로 없앤다.
const LINKAGE_FIELD_NAMES = Object.freeze({
  // receipt → 리뷰: repo-relative 리뷰 레코드 경로
  receiptToReview: 'review_record_path',
  // 리뷰 → receipt: 패널 레코드 `## Measurement` JSON의 receipt 식별자
  reviewToReceipt: 'receipt_hash',
});

// 경로 형태 거부. **이것은 경로 안전성 게이트가 아니다** — denylist는 구조적으로
// 자기 열거 밖에서 샌다(Windows 예약 장치명 · NTFS ADS · 유니코드 유사 문자).
// M1은 경로를 구성하지 않으므로 위험이 0이지만, 이 술어를 물려받는 하류
// milestone은 `path.resolve(root, candidate)`가 root 하위인지 검사하는
// containment check를 **반드시 별도로** 더해야 한다(DD4).
function isRepoRelativePath(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length === 0 || v.length > 512) return false;
  // 공백 · 제어문자(NUL 포함) 거부. 디렉토리 이름을 열거하지 않는 형태 규칙이다.
  if (/[\s\u0000-\u001f]/.test(v)) return false;
  if (v.charAt(0) === '/' || v.charAt(0) === '\\') return false;      // POSIX 절대 · UNC 선두
  if (/^[A-Za-z]:/.test(v)) return false;                              // 드라이브 문자
  if (v.indexOf('..') !== -1) return false;                            // 상위 탈출
  return true;
}

function classifyLink(receipt, record) {
  const meta = obj(receipt && receipt.meta);
  const linkValue = meta === null ? undefined : meta[LINKAGE_FIELD_NAMES.receiptToReview];
  const receiptToReview = isRepoRelativePath(linkValue);

  // 리뷰 쪽은 파싱된 measurement의 구조적 위치만 본다. 원문 텍스트는 보지 않는다 —
  // 보는 순간 산문 언급이 링크가 된다.
  const measurement = obj(record && record.measurement);
  const back = measurement === null ? undefined : measurement[LINKAGE_FIELD_NAMES.reviewToReceipt];
  const reviewToReceipt = typeof back === 'string' && back.trim().length > 0;

  return {
    receipt_to_review: receiptToReview,
    review_to_receipt: reviewToReceipt,
    bidirectional: receiptToReview && reviewToReceipt,
  };
}

// ── 내부 유틸 (총함수) ───────────────────────────────────────────────────────

function str(v) { return typeof v === 'string' ? v : ''; }

function obj(v) {
  return (v !== null && typeof v === 'object' && !Array.isArray(v)) ? v : null;
}

// 사유 문장에 값을 싣기 위한 **총** 요약기 (local code-review M1).
//
// `JSON.stringify`를 쓰면 안 된다 — 이 모듈 헤더가 "모든 함수는 총함수다"를 계약으로
// 선언하는데 그 함수는 세 형태에서 throw한다: 순환 참조 · BigInt · `toJSON`이 던지는
// 객체. 오늘의 호출자(`record.js`가 만든 값 · `JSON.parse` 결과)로는 도달 불가지만,
// 이 파일은 **write 경로가 import하는 공개 술어 라이브러리**다. `buildReviewRecord`는
// never-throw를 선언하고 `cmdRecord`의 catch가 그 throw를 삼켜 레코드를 아예 안 쓰므로,
// 도달하는 날의 대가는 DD4가 막으려던 바로 그 표본 손실이다.
//
// 그래서 값을 직렬화하지 않고 **형태만** 말한다. 사유 문장에 필요한 것은 "왜 정수가
// 아닌가"이지 그 값의 내용이 아니고, 내용을 싣지 않으면 반신뢰 입력이 감사 출력의
// 크기를 정하지도 못한다(`by_reason` 맵의 키 카디널리티도 유한해진다).
function describe(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return 'an array';
  const t = typeof v;
  if (t === 'number' || t === 'boolean') return String(v);
  if (t === 'bigint') return 'a bigint';
  if (t === 'string') return 'a string';
  if (t === 'object') return 'an object';
  return 'a ' + t;
}

module.exports = {
  hasRoundStructure: hasRoundStructure,
  classifyRoundStructure: classifyRoundStructure,
  ROUND_STRUCTURE_VERDICTS: ROUND_STRUCTURE_VERDICTS,
  ROUND_STRUCTURE_CONTROLS: ROUND_STRUCTURE_CONTROLS,
  classifyShipEligibility: classifyShipEligibility,
  classifyLink: classifyLink,
  isRepoRelativePath: isRepoRelativePath,
  LINKAGE_FIELD_NAMES: LINKAGE_FIELD_NAMES,
  ELIGIBILITY_FIELD: ELIGIBILITY_FIELD,
  NOT_ELIGIBLE_REASON_FIELD: NOT_ELIGIBLE_REASON_FIELD,
};
