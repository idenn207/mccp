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
// 순수 함수다. 디스크·env·시각을 모른다. 읽기는 `ledger`, 변환·검증은 `cli`,
// 판정만 여기다(DD9).
//
// mirror: plan-review/decide.js (인자만으로 결정하는 순수 판정)

// 입력 원소 = DD9 reviewer envelope. `raw`는 전달되지 않는다 — envelope는 판정에
// 필요한 최소 투영이고, `checks`·`suggestions`는 P1의 severity 축 입력이라
// `ledger`가 따로 보관한다.
//   { id: 'A'|'B', model: string, verdict: 'PASS'|'FAIL', criticalIssues: string[] }

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

module.exports = {
  decideVerdict: decideVerdict,
};
