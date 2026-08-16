'use strict';

// santa/gate — verdict 판정 (santa-loop-materialize M1 / Task 3).
//
// ┌─ FROZEN INTERFACE (P0 소유, 변경은 P0 재개 사안 — UI12) ────────────────┐
// │ decideVerdict({ reviewers, round, cap })                               │
// │   → { verdict: 'NICE' | 'NAUGHTY', failing: string[], exitReason }     │
// └────────────────────────────────────────────────────────────────────────┘
//
// **본문은 P1이 채운다.** P0가 확정하는 것은 시그니처뿐이고 규칙은 현
// `santa-loop.md` Step 4 산문의 1:1 이식이다(UI10 — 캡 강제 외에 판정 결과를
// 바꾸지 않는다). severity 축과 patch-chasing terminator를 여기에 미리 넣지
// 않는다(UI1·UI11) — 그것들이 `round`/`cap`을 쓰게 될 자리다.
//
// `round`·`cap`은 **받되 쓰지 않는다.** P0에서 이 둘은 판정에 관여하지 않으며
// `exitReason`은 언제나 null이다. 미사용 파라미터를 지금 동결해 두는 이유는
// P1이 종료 조건(라운드 소진 시 판정을 어떻게 바꿀지)을 구현할 때 시그니처를
// 바꾸지 않아도 되게 하기 위함이다 — 시그니처 변경은 P0 재개 사안이라
// 나중에 추가하는 쪽이 훨씬 비싸다.
//
// 순수 함수다. 디스크·시각을 모른다. 읽기는 `ledger`, 변환·검증은 `cli`,
// 판정만 여기다(DD9).
//
// **env는 파서만 안다** (santa-adjudication M1 / DD3a). `parseSeverityGate(env)`가
// env를 읽고 판정 함수(`decideVerdict`·`decideAdjudicatedVerdict`·`analyzeReviewers`·
// `classifyFinding`)는 인자만 본다. `counter.js`가 이미 같은 구조다 —
// `parseCap(env)`가 env를 읽고 `decideRound({cap})`은 값만 받는다. 파싱을 부르는
// 것은 `cli.js`이고 판정 함수에는 파싱 결과만 넘어간다.
//
// mirror: plan-review/decide.js (인자만으로 결정하는 순수 판정)

// 입력 원소 = DD9 reviewer envelope. `raw`는 전달되지 않는다 — envelope는 판정에
// 필요한 최소 투영이고, `checks`·`suggestions`는 P1의 severity 축 입력이라
// `ledger`가 따로 보관한다.
//   { id: 'A'|'B', model: string, verdict: 'PASS'|'FAIL', criticalIssues: string[] }
//
// santa-adjudication M1이 여기에 `findings[]`를 더한다 — 원소는
// `{ claim, severity, failureScenario, evidence, structured }`이고 `criticalIssues`는
// 길이 보존을 위해 그대로 남는다(`seal.js#project`가 그 길이를 쓴다 — DD4).

const { validateReason } = require('../../receipt/lib/force-override-reason');

function decideVerdict(opts) {
  opts = opts || {};
  const reviewers = Array.isArray(opts.reviewers) ? opts.reviewers : [];

  const failing = reviewers
    .filter(function (r) { return r && r.verdict === 'FAIL'; })
    .map(function (r) { return r && r.id; });

  // 현 산문(santa-loop.md Step 4): 둘 다 PASS → NICE · 하나라도 FAIL → NAUGHTY.
  //
  // envelope 0건 → NAUGHTY는 **살아 있는 규칙**이다(도달 불가가 아니다).
  // DD12가 판정 lifecycle(완전성 검사)을 P1으로 이관했으므로 CLI가 이 경로를
  // 막지 않는다 — `verdict`를 리뷰어 기록 전에 부르면 실제로 여기 도달한다.
  // 증거가 없을 때 통과시키지 않는 것이 fail-closed 방향이다.
  const allPass = reviewers.length > 0 && reviewers.every(function (r) {
    return r && r.verdict === 'PASS';
  });

  return {
    verdict: allPass ? 'NICE' : 'NAUGHTY',
    failing: failing,
    // P0는 종료 조건을 소유하지 않는다(UI1) — 언제나 null. P1이 채운다.
    exitReason: null,
  };
}

// ── severity 축 (santa-adjudication M1) ─────────────────────────────────────
//
// 아래 4개는 **신규 export**이고 위 `decideVerdict`는 한 글자도 바뀌지 않았다
// (DD3 — ownership.md §변경 프로토콜 2: "기존 함수의 시그니처·동작을 유지한 채
// 새 export를 더한다"). `decideAdjudicatedVerdict`는 완화 조건을 만족하지 못하면
// `decideVerdict`에 **위임**하므로 동결 함수는 계속 살아 있는 판정 경로다.

const ENV_SEVERITY_GATE = 'MCCP_SANTA_SEVERITY_GATE';
const SEVERITY_GATE_DEFAULT = 'enforce';
const SEVERITY_GATE_VALUES = ['enforce', 'off'];

// severity 어휘는 `skills/santa-method/SKILL.md:50`과 같다. **대소문자 구분**이며
// 부분 일치도 하지 않는다(`cli.js:191` verdict 검사와 같은 규약) — `"critical"`은
// 4값 밖이라 계약 위반으로 강등된다. 관대하게 받으면 리뷰어가 실제로 쓴 문자열과
// 게이트가 읽은 값이 갈리고, 그 갈림은 원장을 봐도 보이지 않는다.
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const BLOCKING_SEVERITIES = ['CRITICAL', 'HIGH'];

const CLASSIFY_REASONS = ['ok', 'unstructured', 'severity-below-gate',
  'no-failure-scenario', 'insubstantial-failure-scenario'];

function warn(line) {
  process.stderr.write('[mccp:santa-gate] ' + line + '\n');
}

// 표시폭 정규화 — 실질성 하한을 스크립트 중립으로 만든다 (code-review M1).
//
// 실질성 판정은 `validateReason`(strict)에 위임하고 규칙을 베끼지 않는다. 그런데
// 그 검증기의 하한 하나(`MIN_LENGTH` = 30)는 **영어 override 사유용으로 보정된
// 문자 수**다. 같은 정보량이 한글·CJK로 쓰이면 문자 수가 절반 남짓이라, 구체적인
// 시나리오("빈 배열에서 첫 원소를 읽어 크래시한다" = 21자)가 `reason-too-short`로
// 떨어진다. 그 강등은 **fail-open 방향**이다 — blocking이 remark가 되고, 완화
// (DD10)와 겹치면 CRITICAL을 낸 FAIL 리뷰어가 있는 라운드가 NICE가 된다. 게이트의
// 엄격도가 리뷰어가 어느 언어를 골랐는가에 달리게 두는 것은 방어할 수 없다.
//
// 재구현 대신 **입력의 표시폭을 문자 수로 환산해 같은 검증기에 먹인다**: 동아시아
// 전각 코드포인트를 2회 반복한다. 길이 축 하나만 스크립트 중립이 되고 나머지 규칙
// (1-token 금칙 · URL-only · 단어 수 · filler)은 원본 그대로 적용된다 — 전각 문자를
// 복제해도 공백이 생기지 않아 단어 수가 불변이고, ASCII 금칙어나 URL 패턴을 새로
// 만들 수도 없다. **순수 ASCII 입력에는 항등**이므로 영어 경로의 판정은 한 건도
// 바뀌지 않는다(항등 자체를 test가 단언한다).
//
// 늘리기만 하므로 통과하던 것이 막히는 방향으로는 갈 수 없다.
function isWideCodePoint(cp) {
  return (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf)
    || (cp >= 0xa960 && cp <= 0xa97f) || (cp >= 0xac00 && cp <= 0xd7a3)
    || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe10 && cp <= 0xfe19)
    || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60)
    || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x20000 && cp <= 0x3fffd);
}

function widthNormalized(text) {
  let out = '';
  for (const ch of text) {
    out += isWideCodePoint(ch.codePointAt(0)) ? ch + ch : ch;
  }
  return out;
}

// parseSeverityGate(env) → 'enforce' | 'off'. 불량값은 loud fail-open to default.
//
// **`off`가 `enforce`보다 엄격하다**(DD10). `off`의 NICE 조건은 `enforce`의 조건에
// `allPass`가 하나 더 붙은 것이므로, 불량값을 `enforce`로 떨어뜨리는 것은 둘 중 덜
// 엄격한 쪽을 고르는 것이다. 그대로 두는 근거는 (1) 이 축으로 도달 가능한 가장
// 느슨한 상태조차 강화 축 둘(blocking 게이트 · `{A,B}` 완전성)을 켜 두므로 M0보다
// 엄격하고, (2) `off`를 default로 삼으면 오타가 kill switch를 켜며, (3)
// `counter.parseCap`과 같은 실패 규약을 유지해 같은 모듈군의 env 파서 둘이 서로
// 다르게 실패하지 않게 하기 위함이다. loud warn이 그래서 필수다.
function parseSeverityGate(env) {
  const raw = env && env[ENV_SEVERITY_GATE];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return SEVERITY_GATE_DEFAULT;
  }
  const v = String(raw).trim();
  if (SEVERITY_GATE_VALUES.indexOf(v) === -1) {
    warn(ENV_SEVERITY_GATE + ' must be one of [' + SEVERITY_GATE_VALUES.join('|') + ']; got "' +
      raw + '". Falling back to default ' + SEVERITY_GATE_DEFAULT + '.');
    return SEVERITY_GATE_DEFAULT;
  }
  return v;
}

function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// classifyFinding(finding) → { structured, blocking, severity, reason }
//
// 순수. 입력을 변형하지 않고 **어떤 입력에도 던지지 않는다.**
//
// `reason`은 항상 CLASSIFY_REASONS 5값 중 하나이고 `null`이 아니다. 판정 순서는
// 위에서 아래로 **첫 일치에서 멈춘다**. `reason`은 보고·계측 전용이고 판정은
// `blocking` 불리언만 본다 — `analyzeReviewers`가 `mismatches`를 만들 때 왜
// 강등됐는지 적을 곳이 필요해서 두는 필드다.
//
// **판정 시점이 다시 파생하는 것은 severity 열거 하나뿐이다.** 타입·길이는 기록
// 시점(`cli.js#loadReviewer`)이 이미 봤고 여기 도달한 값은 형태가 보장된다(DD5의
// 2층 분업). severity만 재파생하는 이유는 DD7이다 — 미인식 severity는 blocking이
// 아니라 **계약 위반**이라 라운드 전체를 `partial`로 떨어뜨려야 하고, 이미 원장에
// 쌓인 legacy envelope는 M1 이전 어휘를 담고 있을 수 있다.
//
// `validateReason`은 **import해서 쓴다**(재구현 금지 — 규칙을 베끼면 원본이 바뀔 때
// 두 사본이 갈리고 그 갈림은 어떤 test도 잡지 않는다). 호출 조건도 좁다:
// `failureScenario`가 문자열일 때만 부른다. `null`이면 부르지 않고 곧바로
// `no-failure-scenario`이므로, 비문자열을 넘겨 예외를 만들 경로 자체가 없다.
// 넘기는 값은 `widthNormalized` 투영이다 — 그 함수 주석이 이유를 갖는다.
function classifyFinding(finding) {
  const f = isRecord(finding) ? finding : {};

  // JSON.parse 산출물만 여기 도달한다(원장은 JSON) — own property뿐이고 getter가
  // 없으므로 필드 읽기가 코드를 실행시키지 않는다. 열거 비교는 `indexOf`(strict
  // equality)라 `toString` 강제 변환도 일어나지 않는다.
  const severity = SEVERITIES.indexOf(f.severity) === -1 ? null : f.severity;
  const structured = f.structured === true && severity !== null;
  const failureScenario = typeof f.failureScenario === 'string' ? f.failureScenario : null;

  if (!structured) {
    return { structured: false, blocking: false, severity: severity, reason: 'unstructured' };
  }
  if (BLOCKING_SEVERITIES.indexOf(severity) === -1) {
    return { structured: true, blocking: false, severity: severity, reason: 'severity-below-gate' };
  }
  if (failureScenario === null) {
    return { structured: true, blocking: false, severity: severity, reason: 'no-failure-scenario' };
  }
  // 실질성만 본다 — 품질은 보지 않는다(DD5). 그럴듯한 거짓 시나리오는 이 검사를
  // 통과하며, 닫는 것은 "서술 없이 blocker라고 부르는 것"뿐이다.
  if (!validateReason(widthNormalized(failureScenario),
    { strict: true, allowCodeVocabulary: true }).ok) {
    // 형태는 계약을 만족했으므로 `structured`는 **true로 유지**하고 무게만 뺀다.
    // 여기서 강등하면 실질성 미달 하나가 라운드 전체를 `partial`로 만들어 DD1의
    // 계약 축과 DD6의 무게 축이 섞인다.
    return {
      structured: true, blocking: false, severity: severity,
      reason: 'insubstantial-failure-scenario',
    };
  }
  return { structured: true, blocking: true, severity: severity, reason: 'ok' };
}

// 정규화 claim 일치로 중복제거한다(DD9): 소문자 + 공백 축약 + trim. 문면이 다른
// 동일 지적은 못 잡지만 판정이 보는 것은 `length > 0`뿐이라 정확도가 판정을 바꾸지
// 않는다. 값이 실제로 쓰이는 곳은 보고와 계측이다.
function normalizeClaim(claim) {
  return (typeof claim === 'string' ? claim : '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// legacy envelope 흡수 — 원장에 이미 쌓인 envelope에는 `findings`가 없다.
// `criticalIssues`에서 `{claim, structured:false}`를 파생한다 → `contract='partial'`
// → 현행 규칙. 크래시도, 조용한 완화도 없다(DD4).
//
// `loadReviewer`(기록 시점)와 여기(판정 시점)가 **둘 다** legacy를 흡수해야 한다 —
// 전자는 새로 들어오는 입력을, 후자는 이미 저장된 원장을 담당한다.
function findingsOf(envelope) {
  if (Array.isArray(envelope.findings)) return envelope.findings;
  const ci = Array.isArray(envelope.criticalIssues) ? envelope.criticalIssues : [];
  return ci.map(function (c) {
    return {
      claim: typeof c === 'string' ? c : '',
      severity: null,
      failureScenario: null,
      evidence: null,
      structured: false,
    };
  });
}

// analyzeReviewers(reviewers) → { contract, blocking, byReviewer, distinctIds, mismatches }
//
// 순수. **전역 함수(total function)다 — 어떤 입력에도 던지지 않는다.**
// `decideAdjudicatedVerdict`가 증거 0건 검사보다 **먼저** 이것을 부르므로, 빈
// 입력에서 던지면 그 경로 전체가 죽는다. 비배열·null·undefined는 빈 배열로
// 정규화한다.
//
// 판정하지 않고 재료만 만든다. 규칙 4가지를 이 함수가 소유한다:
//
//  - `contract`는 "모든 finding이 `structured:true`"의 **AND**다. finding 0건인
//    리뷰어는 AND에 `true`로 기여한다(지적할 것이 없었을 뿐이다 — DD1). 리뷰어가
//    0명이면 `contract`는 `full`이지만 그 값이 완화를 **혼자** 켜지 못한다:
//    `distinctIds`가 비어 `bothIds`가 거짓이므로 판정은 NAUGHTY다.
//  - `blocking`은 **배열**이고 정규화 claim으로 중복제거한다. `ids`는 같은 지적을
//    낸 리뷰어 전부를 담아 `failing` 파생에 쓰인다.
//  - `distinctIds`는 `reviewers[].id`의 중복 제거 결과다. 판정 함수가 id를 다시
//    세지 않는 이유는 세는 곳이 둘이면 두 값이 갈리기 때문이다(DD8).
//  - `mismatches.kind`는 `fail-without-blocking`과 `pass-with-blocking` 두 값이다.
//    후자는 blocking이 이겨 NAUGHTY가 되지만 그 불일치도 기록한다(UI7 · DD12).
function analyzeReviewers(reviewers) {
  const list = Array.isArray(reviewers) ? reviewers : [];
  const byReviewer = {};
  const distinctIds = [];
  const mismatches = [];
  const blocking = [];
  const blockingByClaim = new Map();
  let contractFull = true;

  list.forEach(function (entry) {
    const r = isRecord(entry) ? entry : {};
    // id는 CLI가 'A'|'B'로 열거 검증한 값이다(`cli.js:201`). 손으로 편집된 원장에
    // 대비해 비문자열과 `Object.prototype` 키는 별도 버킷으로 보낸다 — plain
    // object에 `__proto__`를 대입하면 own property가 되지 않고 그 통계가 **조용히
    // 사라지기** 때문이다(오염이 아니라 소실이 여기서의 실패 모드다).
    const rawId = typeof r.id === 'string' ? r.id : null;
    const id = (rawId === null || rawId === '__proto__' || rawId === 'constructor'
      || rawId === 'prototype') ? '(invalid)' : rawId;
    if (rawId !== null && distinctIds.indexOf(rawId) === -1) distinctIds.push(rawId);

    if (!Object.prototype.hasOwnProperty.call(byReviewer, id)) {
      byReviewer[id] = { findings: 0, structured: 0, blocking: 0 };
    }
    const stat = byReviewer[id];

    let blockingHere = 0;
    findingsOf(r).forEach(function (f) {
      const c = classifyFinding(f);
      stat.findings += 1;
      if (c.structured) stat.structured += 1;
      else contractFull = false;
      if (!c.blocking) return;
      stat.blocking += 1;
      blockingHere += 1;
      const key = normalizeClaim(isRecord(f) ? f.claim : '');
      let merged = blockingByClaim.get(key);
      if (!merged) {
        merged = {
          claim: (isRecord(f) && typeof f.claim === 'string') ? f.claim : '',
          severity: c.severity,
          ids: [],
        };
        blockingByClaim.set(key, merged);
        blocking.push(merged);
      }
      if (merged.ids.indexOf(id) === -1) merged.ids.push(id);
      // 같은 지적을 두 리뷰어가 **다른 무게로** 낼 수 있다. 병합 행이 최초 관측값을
      // 유지하면 A의 HIGH가 B의 CRITICAL을 가려 보고서가 실제보다 가벼운 severity를
      // 보여준다. 판정은 이 값을 보지 않지만(무게는 `blocking` 불리언이 이미 정했다)
      // 보고는 본다 — 그래서 높은 쪽으로 올린다. `BLOCKING_SEVERITIES`는 심각도
      // 내림차순이라 인덱스가 작을수록 높고, 여기 도달한 값은 둘 다 그 안에 있다.
      if (BLOCKING_SEVERITIES.indexOf(c.severity) <
          BLOCKING_SEVERITIES.indexOf(merged.severity)) {
        merged.severity = c.severity;
      }
    });

    if (r.verdict === 'FAIL' && blockingHere === 0) {
      mismatches.push({
        id: id, reviewerVerdict: 'FAIL', blocking: 0, kind: 'fail-without-blocking',
      });
    } else if (r.verdict === 'PASS' && blockingHere > 0) {
      mismatches.push({
        id: id, reviewerVerdict: 'PASS', blocking: blockingHere, kind: 'pass-with-blocking',
      });
    }
  });

  return {
    contract: contractFull ? 'full' : 'partial',
    blocking: blocking,
    byReviewer: byReviewer,
    distinctIds: distinctIds,
    mismatches: mismatches,
  };
}

// decideAdjudicatedVerdict({ reviewers, round, cap, severityGate })
//   → { verdict, failing, exitReason, blocking, mismatches, contract, byReviewer }
//
// **불리언화가 먼저이고 AND가 나중이다.** 세 항을 전부 불리언으로 만든 뒤 AND하며
// 어느 항도 다른 항을 덮어쓰지 않는다. `mitigated`(완화)가 면제하는 것은 `allPass`
// **한 항뿐**이고, 강화 축 둘(`noBlocking` · `bothIds`)은 `severityGate` 값과
// `contract` 값에 무관하게 **항상** 적용된다(DD10).
//
// 위임 결과를 **대체**하지 않고 `=== 'NICE'`로 불리언화해 AND에 넣는 것이 DD1의
// 핵심이다. 대체하면 `PASS`를 낸 리뷰어가 쓴 blocking이 무시되어 `partial`이
// `full`보다 **느슨해진다** — 비구조화 finding 하나로 다른 리뷰어의 blocking을
// 지우는 우회가 성립한다.
function decideAdjudicatedVerdict(opts) {
  const o = opts || {};
  const reviewers = Array.isArray(o.reviewers) ? o.reviewers : [];
  const a = analyzeReviewers(reviewers);

  // 증거 0건 → 즉시 NAUGHTY (DD11). fail-closed 방향이고, `bothIds`도 같은 결론을
  // 내므로 두 규칙이 서로를 가리지 않는다.
  if (reviewers.length === 0) {
    return {
      verdict: 'NAUGHTY', failing: [], exitReason: null,
      blocking: [], mismatches: [], contract: a.contract, byReviewer: a.byReviewer,
    };
  }

  const mitigated = o.severityGate === 'enforce' && a.contract === 'full';
  const noBlocking = a.blocking.length === 0;
  const bothIds = a.distinctIds.length >= 2;
  const delegated = mitigated
    ? null
    : decideVerdict({ reviewers: reviewers, round: o.round, cap: o.cap });
  const allPass = mitigated ? true : delegated.verdict === 'NICE';

  const verdict = (noBlocking && bothIds && allPass) ? 'NICE' : 'NAUGHTY';

  // `bothIds`만 거짓이어서 NAUGHTY가 된 라운드는 실패한 리뷰어가 없으므로 `failing`은
  // 비고, 진단은 `contract`·`mismatches`·`distinctIds`가 진다 — 아무도 실패하지 않은
  // 라운드에서 누군가를 `failing`에 넣는 것이 더 나쁜 거짓이다.
  const failing = [];
  if (verdict !== 'NICE') {
    a.blocking.forEach(function (b) {
      b.ids.forEach(function (id) { if (failing.indexOf(id) === -1) failing.push(id); });
    });
    if (delegated) {
      delegated.failing.forEach(function (id) {
        if (failing.indexOf(id) === -1) failing.push(id);
      });
    }
  }

  return {
    verdict: verdict,
    failing: failing,
    exitReason: delegated ? delegated.exitReason : null,
    blocking: a.blocking,
    mismatches: a.mismatches,
    contract: a.contract,
    // 강등 이력의 분모다 (code-review L1). PRD Open Question이 "지표를 불일치 발화
    // 건수에서 **blocking으로 계수된 finding 대비 강등된 finding 비율**로 바꿀지"를
    // 미결로 두었는데, 그 비율의 두 항이 정확히 `blocking`과 `findings - blocking`
    // 이다. `analyzeReviewers`가 이미 세고 있었는데 판정 반환에서 떨어뜨려 배송
    // 경로에 소비자가 없었다 — 재는 값을 버리면 재지 않은 것과 같다.
    byReviewer: a.byReviewer,
  };
}

module.exports = {
  decideVerdict: decideVerdict,
  decideAdjudicatedVerdict: decideAdjudicatedVerdict,
  analyzeReviewers: analyzeReviewers,
  classifyFinding: classifyFinding,
  parseSeverityGate: parseSeverityGate,
  ENV_SEVERITY_GATE: ENV_SEVERITY_GATE,
  SEVERITY_GATE_DEFAULT: SEVERITY_GATE_DEFAULT,
  SEVERITY_GATE_VALUES: SEVERITY_GATE_VALUES,
  SEVERITIES: SEVERITIES,
  BLOCKING_SEVERITIES: BLOCKING_SEVERITIES,
  CLASSIFY_REASONS: CLASSIFY_REASONS,
};
