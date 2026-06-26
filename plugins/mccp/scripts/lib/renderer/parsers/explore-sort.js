'use strict';

/* Dashboard Data Exploration M2 — 필터/정렬 pure 로직(단일 진실).
 * node(단위 테스트) + browser(html.js inline emit) 양쪽이 공유한다 — UMD 가드로
 * single-source(drift 0). 부수효과 0 · DOM 미접근 · 네트워크 primitive 0
 * (H19 의 inline-script 스캔 대상 — 본 모듈은 순수 값 변환이라 항상 clean).
 *
 *   descriptor : { prd, plan, sev, ord } — sev/ord 는 정수(문자열도 Number 강제).
 *   filters    : { prd, plan }           — 빈 문자열/null = 해당 축 전체.
 *
 * compareItems 는 Array.prototype.sort 안정성에 기대 tie-break 를 chronology(ord)로
 * 고정해 결정적 순서를 보장한다(잘못된 mode 는 fail-open 0 → 원순서 유지).
 */
(function () {
  var VALID_MODES = { severity: 1, time: 1 };

  function toNum(v) {
    var n = Number(v);
    return (typeof n === 'number' && !isNaN(n)) ? n : 0;
  }

  function str(v) {
    return v == null ? '' : String(v);
  }

  // compareItems(a, b, mode):
  //   severity → data-sev desc, 동률은 data-ord asc(chronology tie-break, 안정).
  //   time     → data-ord asc(원본 parse chronology — severity 정렬 *이전* 순서).
  //   그 외(잘못된 mode) → 0(fail-open, sort 안정성으로 원순서 보존).
  function compareItems(a, b, mode) {
    if (!VALID_MODES[mode]) return 0;
    var ao = toNum(a && a.ord);
    var bo = toNum(b && b.ord);
    if (mode === 'time') return ao - bo;
    var as = toNum(a && a.sev);
    var bs = toNum(b && b.sev);
    if (bs !== as) return bs - as;
    return ao - bo;
  }

  // matchFilter(desc, filters): PRD ∧ plan AND 술어. 빈 필터 축 = 전체.
  // sentinel(__global__/__unknown__)은 동등 비교로 자연히 자기 자신만 매칭한다.
  function matchFilter(desc, filters) {
    desc = desc || {};
    filters = filters || {};
    var fp = str(filters.prd);
    var fl = str(filters.plan);
    if (fp && str(desc.prd) !== fp) return false;
    if (fl && str(desc.plan) !== fl) return false;
    return true;
  }

  var api = { compareItems: compareItems, matchFilter: matchFilter };

  // UMD — node 는 module.exports, browser inline 은 window.__mccpExplore. 양쪽
  // 동시 정의(node 테스트 require + browser 전역) → single-source.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.__mccpExplore = api;
})();
