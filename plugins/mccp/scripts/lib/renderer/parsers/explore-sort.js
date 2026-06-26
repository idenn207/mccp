'use strict';

/* Dashboard Data Exploration M2/M3 — 필터/정렬/검색 pure 로직(단일 진실).
 * node(단위 테스트) + browser(html.js inline emit) 양쪽이 공유한다 — UMD 가드로
 * single-source(drift 0). 부수효과 0 · DOM 미접근 · 네트워크 primitive 0
 * (H19 의 inline-script 스캔 대상 — 본 모듈은 순수 값 변환이라 항상 clean).
 *
 *   descriptor : { prd, plan, sev, ord }              — 위험·질문 .li-item(M2).
 *                { status, worktree, rank, activityOrd } — 멀티세션 <tr>(M3).
 *                값은 정수 키(rank/activityOrd/sev/ord)는 Number 강제.
 *   filters    : { prd, plan, status, worktree }      — 빈 문자열/null = 해당 축 전체.
 *
 * compareItems 는 Array.prototype.sort 안정성에 기대 tie-break 를 chronology(ord)/
 * recency(activityOrd)로 고정해 결정적 순서를 보장한다(잘못된 mode 는 fail-open 0 →
 * 원순서 유지). M3 는 progress mode(멀티세션 진행순) + status/worktree 필터 축 +
 * textMatch(검색) 를 누적 — M2 descriptor 엔 신규 필드 부재라 빈 축으로 무영향.
 */
(function () {
  var VALID_MODES = { severity: 1, time: 1, progress: 1 };

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
  //   progress → data-progress-rank desc(blocked3>degraded2>active1>idle0), 동률은
  //              data-activity-ord asc(recency index — 최신이 앞, 안정 tie-break).
  //   그 외(잘못된 mode) → 0(fail-open, sort 안정성으로 원순서 보존).
  function compareItems(a, b, mode) {
    if (!VALID_MODES[mode]) return 0;
    a = a || {};
    b = b || {};
    if (mode === 'progress') {
      var ar = toNum(a.rank);
      var br = toNum(b.rank);
      if (br !== ar) return br - ar;
      return toNum(a.activityOrd) - toNum(b.activityOrd);
    }
    var ao = toNum(a.ord);
    var bo = toNum(b.ord);
    if (mode === 'time') return ao - bo;
    var as = toNum(a.sev);
    var bs = toNum(b.sev);
    if (bs !== as) return bs - as;
    return ao - bo;
  }

  // matchFilter(desc, filters): PRD ∧ plan ∧ status ∧ worktree AND 술어. 빈 필터
  // 축 = 전체. sentinel(__global__/__unknown__)은 동등 비교로 자연히 자기 자신만
  // 매칭한다. M3 status/worktree 는 멀티세션 <tr> 전용 — M2 .li-item desc 엔 부재라
  // 해당 필터가 빈 값일 때만 통과(혼합 호출 0, 컨트롤러가 축을 분리).
  function matchFilter(desc, filters) {
    desc = desc || {};
    filters = filters || {};
    var fp = str(filters.prd);
    var fl = str(filters.plan);
    var fs = str(filters.status);
    var fw = str(filters.worktree);
    if (fp && str(desc.prd) !== fp) return false;
    if (fl && str(desc.plan) !== fl) return false;
    if (fs && str(desc.status) !== fs) return false;
    if (fw && str(desc.worktree) !== fw) return false;
    return true;
  }

  // textMatch(haystack, needle): 검색 substring 술어. needle 빈/null → true(전체).
  // 양쪽 NFC normalize(한글 조합 안정) + lowercase 후 substring. 부수효과 0.
  function textMatch(haystack, needle) {
    if (needle == null || needle === '') return true;
    var n = String(needle).normalize('NFC').toLowerCase();
    if (n === '') return true;
    var h = String(haystack).normalize('NFC').toLowerCase();
    return h.indexOf(n) !== -1;
  }

  var api = { compareItems: compareItems, matchFilter: matchFilter, textMatch: textMatch };

  // UMD — node 는 module.exports, browser inline 은 window.__mccpExplore. 양쪽
  // 동시 정의(node 테스트 require + browser 전역) → single-source.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.__mccpExplore = api;
})();
