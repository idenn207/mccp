/* Dashboard Data Exploration M1/M2 — Progressive-Enhancement client 스크립트.
 * html.js 가 모듈-로드 시 read+inline(jQuery slim 패턴 미러, 외부 src 0 — H13).
 * 순수 DOM 조작만 — 외부 네트워크 호출 리터럴 0(H19 의 1차 검증 대상; 본 주석은
 * 차단 토큰 자체를 나열하지 않는다 — inline 시 상태 페이지에 누출되지 않도록).
 *
 * 역할(부가 only — baseline 은 JS 없이 native <details> + 전체 항목 가시로 완전 동작):
 *   (1) <html data-js="on"> 마커 — JS-only control(필터/정렬) reveal hook.
 *   (2) PRD 그룹 "모두 펼치기/접기" 토글 — 2+ 그룹 클러스터마다 native <details> 위 부가.
 *   (3) M2 필터/정렬 엔진 — .explore-bar 컨트롤이 scope 내 .li-item 가시성·순서 갱신.
 *       pure 로직은 window.__mccpExplore(explore-sort.js)에 위임(node 테스트 공유).
 */
(function () {
  'use strict';
  var d = document;
  if (!d || !d.documentElement) return;
  d.documentElement.setAttribute('data-js', 'on');

  // ── (2) PRD 그룹 모두 펼치기/접기 토글 ─────────────────────────────────────
  var groups = d.querySelectorAll('.prd-group');
  if (groups.length) {
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
  }

  // ── (3) M2 필터/정렬 엔진 ──────────────────────────────────────────────────
  // pure 로직(compareItems/matchFilter)은 explore-sort.js 가 window.__mccpExplore 로
  // 노출. 부재(스크립트 누락)면 엔진 no-op → baseline 전체 가시 유지(PE 불변).
  var EX = window.__mccpExplore;
  var bars = d.querySelectorAll('.explore-bar');
  if (!EX || !bars.length) return;

  function descOf(el) {
    return {
      prd: el.getAttribute('data-prd') || '',
      plan: el.getAttribute('data-plan') || '',
      sev: el.getAttribute('data-sev') || '0',
      ord: el.getAttribute('data-ord') || '0'
    };
  }

  function wireBar(bar) {
    // F3 — 한 바는 자기 route 에만 한정(closest('.route')). 바가 위험·질문 패널 head
    // 에 통합돼 있어 자기 route 의 .li-item 만 제어 → 한 .li-item 집합당 컨트롤러 1개.
    function scopeRoot() {
      return bar.closest ? bar.closest('.route') : null;
    }
    var prdSel = bar.querySelector('[data-axis="prd"]');
    var planSel = bar.querySelector('[data-axis="plan"]');
    var sortSel = bar.querySelector('[data-axis="sort"]');
    // 결과 수는 컨트롤 cluster 가 아니라 panel-head 제목 옆(status zone)에 산다 — bar 의
    // 형제이므로 panel-head 에서 찾는다(없으면 null → no-op).
    var head = bar.closest ? bar.closest('.panel-head') : bar.parentNode;
    var countEl = head ? head.querySelector('.explore-count') : null;
    var resetBtn = bar.querySelector('.explore-reset');

    // plan select 옵션을 선택된 PRD 로 좁힘(client). 선택 plan 이 숨겨지면 전체로 복귀.
    function narrowPlanOptions() {
      if (!prdSel || !planSel) return;
      var prd = prdSel.value;
      var opts = planSel.options;
      for (var i = 0; i < opts.length; i++) {
        var o = opts[i];
        if (!o.value) { o.hidden = false; continue; }
        var op = o.getAttribute('data-prd') || '';
        var show = !prd || op === prd;
        o.hidden = !show;
        if (!show && planSel.value === o.value) planSel.value = '';
      }
    }

    function sortList(list, mode) {
      var nodes = [];
      for (var i = 0; i < list.children.length; i++) {
        var c = list.children[i];
        if (c.classList && c.classList.contains('li-item')) nodes.push(c);
      }
      nodes.sort(function (a, b) { return EX.compareItems(descOf(a), descOf(b), mode); });
      nodes.forEach(function (n) { list.appendChild(n); });
    }

    // 활성 탭 패널(.tab-radio:checked → aria-controls). 탭이 없으면 null → caller 가
    // route 전역으로 fallback. 결과 수·빈 상태를 활성 탭으로 좁히는 데 쓴다.
    function activePanelEl(rootEl) {
      var checked = rootEl.querySelector('.tab-radio:checked');
      if (!checked) return null;
      var pid = checked.getAttribute('aria-controls');
      if (!pid) return null;
      var panels = rootEl.querySelectorAll('.tab-panel');
      for (var i = 0; i < panels.length; i++) { if (panels[i].id === pid) return panels[i]; }
      return null;
    }

    function emptyState(root, visible, total) {
      var anchor = root.querySelector('.panel-body') || root;
      var empty = root.querySelector('.explore-empty');
      if (visible === 0 && total > 0) {
        if (!empty) {
          empty = d.createElement('p');
          empty.className = 'explore-empty muted';
          empty.setAttribute('role', 'status');
          empty.textContent = '조건에 맞는 항목이 없습니다.';
          anchor.appendChild(empty);
        }
        empty.hidden = false;
      } else if (empty) {
        empty.hidden = true;
      }
    }

    // 결과 수 시각 표면 — 별도 텍스트가 아니라 패널 탭(미해결/완화/해결)의 .tab-count 를
    // 각 탭패널의 가시 .li-item 수로 갱신(미해결 18→8). panel id 'X-panel' ↔ 라벨 .tab[for="X"].
    // 필터 해제 시 visible=total 이라 원래 값 자동 복원(원본 stash 불요).
    function updateTabCounts(root) {
      var panels = root.querySelectorAll('.tab-panel');
      for (var p = 0; p < panels.length; p++) {
        var panel = panels[p];
        var tlis = panel.querySelectorAll('.li-item');
        var vis = 0;
        for (var t = 0; t < tlis.length; t++) { if (!tlis[t].hidden) vis++; }
        var inputId = (panel.id || '').replace(/-panel$/, '');
        var label = inputId ? root.querySelector('.tab[for="' + inputId + '"]') : null;
        var tc = label ? label.querySelector('.tab-count') : null;
        if (tc) tc.textContent = vis;
      }
    }

    function apply() {
      var root = scopeRoot();
      if (!root) { if (countEl) countEl.textContent = ''; return; }
      var filters = { prd: prdSel ? prdSel.value : '', plan: planSel ? planSel.value : '' };
      var mode = sortSel ? sortSel.value : 'severity';

      var lis = root.querySelectorAll('.li-item');
      for (var i = 0; i < lis.length; i++) {
        lis[i].hidden = !EX.matchFilter(descOf(lis[i]), filters);
      }
      // 정렬 — 각 .stack-list 내(그룹 경계 보존).
      var lists = root.querySelectorAll('.stack-list');
      for (var L = 0; L < lists.length; L++) sortList(lists[L], mode);
      // 그룹 카운트 갱신 + 가시 0 그룹 hidden + 부모별 첫 가시 그룹 border 제거.
      // (.prd-group:first-of-type 는 DOM 기준이라 숨긴 첫 그룹이 남아 둘째 가시 그룹에
      //  stray hairline 이 생긴다 → ex-first-visible 클래스로 보정.)
      var gs = root.querySelectorAll('.prd-group');
      var seenParents = [];
      for (var G = 0; G < gs.length; G++) {
        var grp = gs[G];
        var gl = grp.querySelectorAll('.li-item');
        var gvis = 0;
        for (var k = 0; k < gl.length; k++) { if (!gl[k].hidden) gvis++; }
        var cnt = grp.querySelector('.prd-count');
        if (cnt) cnt.textContent = gvis;
        grp.hidden = gvis === 0;
        grp.classList.remove('ex-first-visible');
        if (gvis > 0) {
          var par = grp.parentNode;
          if (seenParents.indexOf(par) === -1) {
            seenParents.push(par);
            grp.classList.add('ex-first-visible');
          }
        }
      }
      // 결과 수 — 시각은 탭 .tab-count 갱신, 스크린리더는 sr-only live-region announce.
      updateTabCounts(root);
      // 결과 수·빈 상태는 **활성 탭** 기준(탭 없으면 route 전역). route 전역으로 세면
      // 비활성 탭(완화/해결)의 매칭이 활성 탭의 빈 상태를 가려, 활성 패널이 메시지 없이
      // 조용히 비는 문제가 생긴다(탭 .tab-count 는 0 이 돼도 시각 메시지 누락). 탭 전환은
      // CSS-only 라 apply 를 재실행해 동기화(아래 tab-radio change 리스너).
      var scope = activePanelEl(root) || root;
      var sLis = scope.querySelectorAll('.li-item');
      var sVisible = 0;
      for (var s = 0; s < sLis.length; s++) { if (!sLis[s].hidden) sVisible++; }
      if (countEl) countEl.textContent = (sVisible === sLis.length) ? '' : (sVisible + '개 표시');
      emptyState(scope, sVisible, sLis.length);
      // 초기화 — 필터/정렬이 기본값(pristine)이면 누를 게 없으므로 비활성(시각 noise 제거).
      // 기본값 = 필터 미선택 + 정렬 severity. 어느 하나라도 변하면 활성.
      if (resetBtn) {
        var pristine = (!prdSel || !prdSel.value) && (!planSel || !planSel.value)
          && (!sortSel || sortSel.value === 'severity');
        resetBtn.disabled = pristine;
      }
    }

    if (prdSel) prdSel.addEventListener('change', function () { narrowPlanOptions(); apply(); });
    if (planSel) planSel.addEventListener('change', apply);
    if (sortSel) sortSel.addEventListener('change', apply);
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (prdSel) prdSel.value = '';
      if (planSel) planSel.value = '';
      if (sortSel) sortSel.value = 'severity';
      narrowPlanOptions();
      apply();
    });
    // 탭 전환(CSS-only radio)은 활성 탭을 바꾸므로 결과 수·빈 상태를 재계산해야 한다.
    var wireRoot = scopeRoot();
    if (wireRoot) {
      var tabRadios = wireRoot.querySelectorAll('.tab-radio');
      for (var ti = 0; ti < tabRadios.length; ti++) tabRadios[ti].addEventListener('change', apply);
    }

    narrowPlanOptions();
    apply();
  }

  for (var b = 0; b < bars.length; b++) wireBar(bars[b]);
})();
