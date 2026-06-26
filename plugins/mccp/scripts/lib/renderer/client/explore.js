/* Dashboard Data Exploration M1 — Progressive-Enhancement 토대 client 스크립트.
 * html.js 가 모듈-로드 시 read+inline(jQuery slim 패턴 미러, 외부 src 0 — H13).
 * 순수 DOM 조작만 — 외부 네트워크 호출 리터럴 0(H19 의 1차 검증 대상; 본 주석은
 * 차단 토큰 자체를 나열하지 않는다 — inline 시 상태 페이지에 누출되지 않도록).
 *
 * 역할(부가 only — baseline 은 JS 없이 native <details> 로 완전 동작):
 *   (1) <html data-js="on"> 마커 — M2/M3 의 JS-only control(필터/정렬/검색) reveal hook.
 *   (2) PRD 그룹 "모두 펼치기/접기" 토글 — 2+ 그룹 클러스터마다 native <details> 위 부가.
 */
(function () {
  'use strict';
  var d = document;
  if (!d || !d.documentElement) return;
  d.documentElement.setAttribute('data-js', 'on');

  var groups = d.querySelectorAll('.prd-group');
  if (!groups.length) return;

  // prd-group 형제들을 직속 부모별로 묶는다(route 별 클러스터). 2+ 그룹인 부모에만
  // 토글을 주입(단일 그룹은 토글 불필요).
  var parents = [];
  for (var i = 0; i < groups.length; i++) {
    var p = groups[i].parentNode;
    if (p && parents.indexOf(p) === -1) parents.push(p);
  }

  parents.forEach(function (parent) {
    var local = [];
    for (var j = 0; j < parent.children.length; j++) {
      var c = parent.children[j];
      if (c.classList && c.classList.contains('prd-group')) local.push(c);
    }
    if (local.length < 2) return;

    var btn = d.createElement('button');
    btn.type = 'button';
    btn.className = 'prd-toggle';

    function sync() {
      var anyClosed = local.some(function (g) { return !g.open; });
      btn.textContent = anyClosed ? '모두 펼치기' : '모두 접기';
      btn.setAttribute('aria-expanded', anyClosed ? 'false' : 'true');
    }

    btn.addEventListener('click', function () {
      var anyClosed = local.some(function (g) { return !g.open; });
      local.forEach(function (g) { g.open = anyClosed; });
      sync();
    });
    // 개별 그룹을 사용자가 토글하면 버튼 라벨 동기화.
    local.forEach(function (g) { g.addEventListener('toggle', sync); });

    sync();
    parent.insertBefore(btn, local[0]);
  });
})();
