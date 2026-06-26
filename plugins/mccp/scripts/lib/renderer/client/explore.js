/* Dashboard Data Exploration M1/M2/M3 — Progressive-Enhancement client 스크립트.
 * html.js 가 모듈-로드 시 read+inline(jQuery slim 패턴 미러, 외부 src 0 — H13).
 * 순수 DOM 조작만 — 외부 네트워크 호출 리터럴 0(H19 의 1차 검증 대상; 본 주석은
 * 차단 토큰 자체를 나열하지 않는다 — inline 시 상태 페이지에 누출되지 않도록).
 *
 * 역할(부가 only — baseline 은 JS 없이 native <details> + 전체 항목 가시로 완전 동작):
 *   (1) <html data-js="on"> 마커 — JS-only control(필터/정렬/검색) reveal hook.
 *   (2) PRD 그룹 "모두 펼치기/접기" 토글 — 2+ 그룹 클러스터마다 native <details> 위 부가.
 *   (3) M2 필터/정렬 엔진 — .explore-bar 컨트롤이 scope 내 .li-item 가시성·순서 갱신.
 *   (4) M3 검색 엔진 — 사이드바 입력이 전 페이지 .li-item 을 헤더 텍스트로 좁힘(cross-route).
 *   (5) M3 멀티세션 진행 바 — <tr> 진행상태/worktree 필터 + 진행순 정렬.
 *       pure 로직(compareItems/matchFilter/textMatch)은 window.__mccpExplore
 *       (explore-sort.js)에 위임(node 테스트 공유).
 *
 * 가시성 reason 모델(M3) — 한 .li-item 의 최종 가시성 = !(_hf || _hs):
 *   _hf = explore-bar 필터가 숨김(filter), _hs = 검색이 숨김(search). 두 컨트롤러가
 *   각자 자기 reason expando 만 set 하고 공유 recompute 가 hidden 을 합성한다(독립 필터
 *   AND 표준 패턴 — 같은 hidden 을 두고 경쟁 0). expando 라 DOM attribute 미사용(lint 0).
 */
(function () {
  'use strict';
  var d = document;
  if (!d || !d.documentElement) return;

  // ── (2) PRD 그룹 모두 펼치기/접기 토글 (pure DOM — EX/data-js 불요) ─────────────
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

  // ── (3) pure 로직 게이트 ─────────────────────────────────────────────────────
  // pure 로직(compareItems/matchFilter/textMatch)은 explore-sort.js 가
  // window.__mccpExplore 로 노출. 부재(스크립트 누락)면 엔진 no-op → baseline 전체
  // 가시 유지(PE 불변).
  //
  // Codex Impl R1 IF1 — data-js="on" 은 EX 확인 *후* 에만 set 한다. EXPLORE_SORT_JS
  // 가 누락/실패해 window.__mccpExplore 가 없으면, data-js 를 켜는 순간 .js-only
  // 컨트롤(검색 <form> 포함)이 보이지만 핸들러는 안 붙어 dead UI 가 되고, 검색 폼은
  // submit→preventDefault 미바인딩으로 Enter-navigate 회귀가 생긴다. EX 가 있을 때만
  // 켜서, 부재 시 .js-only 는 숨김 유지(전체 항목 가시 baseline 보존).
  var EX = window.__mccpExplore;
  if (!EX) return;
  d.documentElement.setAttribute('data-js', 'on');

  // 합성 진실원 — _hf(filter) || _hs(search) 중 하나라도 set 이면 숨김.
  function recompute(el) { el.hidden = !!(el._hf || el._hs); }

  // 가시 .li-item 수(hidden 합성 반영).
  function visibleLiCount(scope) {
    var lis = scope.querySelectorAll('.li-item');
    var v = 0;
    for (var i = 0; i < lis.length; i++) { if (!lis[i].hidden) v++; }
    return v;
  }

  function descOf(el) {
    return {
      prd: el.getAttribute('data-prd') || '',
      plan: el.getAttribute('data-plan') || '',
      sev: el.getAttribute('data-sev') || '0',
      ord: el.getAttribute('data-ord') || '0'
    };
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

  // 그룹 카운트 갱신 + 가시 0 그룹 hidden + 부모별 첫 가시 그룹 border 제거.
  // (.prd-group:first-of-type 는 DOM 기준이라 숨긴 첫 그룹이 남아 둘째 가시 그룹에
  //  stray hairline 이 생긴다 → ex-first-visible 클래스로 보정.)
  function refreshGroups(root) {
    var gs = root.querySelectorAll('.prd-group');
    var seenParents = [];
    for (var G = 0; G < gs.length; G++) {
      var grp = gs[G];
      var gvis = visibleLiCount(grp);
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
  }

  // 결과 수 시각 표면 — 별도 텍스트가 아니라 패널 탭(미해결/완화/해결)의 .tab-count 를
  // 각 탭패널의 가시 .li-item 수로 갱신(미해결 18→8). panel id 'X-panel' ↔ 라벨 .tab[for="X"].
  function refreshTabCounts(root) {
    var panels = root.querySelectorAll('.tab-panel');
    for (var p = 0; p < panels.length; p++) {
      var panel = panels[p];
      var inputId = (panel.id || '').replace(/-panel$/, '');
      var label = inputId ? root.querySelector('.tab[for="' + inputId + '"]') : null;
      var tc = label ? label.querySelector('.tab-count') : null;
      if (tc) tc.textContent = visibleLiCount(panel);
    }
  }

  function emptyState(scope, visible, total) {
    var anchor = scope.querySelector('.panel-body') || scope;
    var empty = scope.querySelector('.explore-empty');
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

  // route 의 가시-상태 의존 UI(그룹/탭/빈상태/sr-only count) 갱신. 필터·정렬은 안 건드림
  // (검색이 _hs 만 바꾼 뒤 호출하거나, apply()가 필터/정렬 후 호출). countEl 은 선택적.
  function refreshRouteUI(root, countEl) {
    if (!root) return;
    refreshGroups(root);
    refreshTabCounts(root);
    var scope = activePanelEl(root) || root;
    var total = scope.querySelectorAll('.li-item').length;
    var vis = visibleLiCount(scope);
    if (countEl) countEl.textContent = (vis === total) ? '' : (vis + '개 표시');
    emptyState(scope, vis, total);
  }

  // 검색이 호출할 per-route refresher 등록부(바 보유 route). search 가 _hs 갱신 후
  // 각 refresher 를 불러 탭/그룹/빈상태/count 를 합성 가시성에 맞춘다.
  var barRefreshers = [];

  // ── (4) M3 검색 컨트롤러 — .search-input 존재 시 bars 와 독립 실행(IF2/F2). ──
  function wireSearch(input) {
    // Codex F1 — native <form> 은 Enter 시 submit(페이지 reload/navigate)으로 route·
    // 필터·검색 상태를 잃는다. action/method 미지정 + submit→preventDefault 로 차단.
    var form = input.form || (input.closest ? input.closest('form') : null);
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); });

    var statusEl = d.querySelector('.search-status');
    var navLinks = d.querySelectorAll('.nav-link[data-route]');
    var timer = null;

    function run() {
      var q = input.value.replace(/^\s+|\s+$/g, '');
      // 문서 전역 .li-item 을 헤더/요약(.li-main) 텍스트로 좁힘. _hs 만 set + recompute
      // (필터 _hf 는 보존 → 검색·필터 AND 합성).
      var lis = d.querySelectorAll('.li-item');
      for (var i = 0; i < lis.length; i++) {
        var li = lis[i];
        var main = li.querySelector('.li-main');
        var txt = (main || li).textContent || '';
        li._hs = !EX.textMatch(txt, q);
        recompute(li);
      }
      // 바 보유 route — 등록된 refresher 로 탭/그룹/빈상태/count 갱신.
      for (var r = 0; r < barRefreshers.length; r++) barRefreshers[r]();
      // 바 없는 route(li-item 있지만 explore-bar 부재) — 직접 빈상태.
      for (var n = 0; n < navLinks.length; n++) {
        var route = navLinks[n].getAttribute('data-route');
        var rootEl = d.getElementById('route-' + route);
        if (!rootEl) continue;
        if (rootEl.querySelector('.explore-bar:not([data-explore-scope="session"])')) continue;
        var lisAll = rootEl.querySelectorAll('.li-item');
        if (!lisAll.length) continue;
        var scope = activePanelEl(rootEl) || rootEl;
        emptyState(scope, visibleLiCount(scope), scope.querySelectorAll('.li-item').length);
      }
      // nav-link 매칭 뱃지 + 전역 live-region(전체 + per-route 분해).
      updateNavCounts(q, navLinks, statusEl);
    }

    input.addEventListener('input', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 150);
    });
  }

  function updateNavCounts(q, navLinks, statusEl) {
    var total = 0;
    var breakdown = [];
    for (var n = 0; n < navLinks.length; n++) {
      var link = navLinks[n];
      var route = link.getAttribute('data-route');
      var rootEl = d.getElementById('route-' + route);
      var slot = link.querySelector('.nav-search-count');
      if (!rootEl || !rootEl.querySelectorAll('.li-item').length) {
        if (slot) slot.textContent = '';
        continue;
      }
      var vis = visibleLiCount(rootEl);
      if (slot) slot.textContent = (q && vis > 0) ? ('· ' + vis) : '';
      if (q && vis > 0) {
        total += vis;
        breakdown.push((rootEl.getAttribute('aria-label') || route) + ' ' + vis);
      }
    }
    if (statusEl) {
      if (!q) statusEl.textContent = '';
      else if (total === 0) statusEl.textContent = '일치하는 항목 없음';
      else statusEl.textContent = '전체 ' + total + '개 일치 · ' + breakdown.join(' · ');
    }
  }

  var searchInput = d.querySelector('.search-input');
  if (searchInput) wireSearch(searchInput);

  // ── (5) M2 필터/정렬 엔진 (route 리스트 바) — 세션 scope 바 제외(Codex Impl R1 IF2). ──
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

    function apply() {
      var root = scopeRoot();
      if (!root) { if (countEl) countEl.textContent = ''; return; }
      var filters = { prd: prdSel ? prdSel.value : '', plan: planSel ? planSel.value : '' };
      var mode = sortSel ? sortSel.value : 'severity';

      // 필터는 _hf reason 으로만 set(검색 _hs 는 보존) → recompute 가 AND 합성.
      var lis = root.querySelectorAll('.li-item');
      for (var i = 0; i < lis.length; i++) {
        lis[i]._hf = !EX.matchFilter(descOf(lis[i]), filters);
        recompute(lis[i]);
      }
      // 정렬 — 각 .stack-list 내(그룹 경계 보존).
      var lists = root.querySelectorAll('.stack-list');
      for (var L = 0; L < lists.length; L++) sortList(lists[L], mode);
      // 결과 수·빈 상태는 **활성 탭** 기준(탭 없으면 route 전역). 탭 전환은 CSS-only 라
      // apply 를 재실행해 동기화(아래 tab-radio change 리스너).
      refreshRouteUI(root, countEl);
      // 초기화 — 필터/정렬이 기본값(pristine)이면 누를 게 없으므로 비활성(시각 noise 제거).
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
    var wireRootEl = scopeRoot();
    if (wireRootEl) {
      var tabRadios = wireRootEl.querySelectorAll('.tab-radio');
      for (var ti = 0; ti < tabRadios.length; ti++) tabRadios[ti].addEventListener('change', apply);
    }

    // 검색이 부를 refresher 등록 — 필터/정렬은 보존, 가시-상태 UI 만 재계산.
    barRefreshers.push(function () { refreshRouteUI(scopeRoot(), countEl); });

    narrowPlanOptions();
    apply();
  }

  var bars = d.querySelectorAll('.explore-bar:not([data-explore-scope="session"])');
  for (var b = 0; b < bars.length; b++) wireBar(bars[b]);

  // ── (6) M3 멀티세션 진행 바 컨트롤러 — 세션 scope 바만 소유(IF2). ───────────────
  function sessDescOf(tr) {
    return {
      status: tr.getAttribute('data-status') || '',
      worktree: tr.getAttribute('data-worktree') || '',
      rank: tr.getAttribute('data-progress-rank') || '0',
      activityOrd: tr.getAttribute('data-activity-ord') || '0'
    };
  }

  function wireSessionBar(bar) {
    // 인접 멀티세션 테이블 — 같은 패널(없으면 route) 안의 table.multi-session tbody.
    var panel = bar.closest ? bar.closest('.panel') : null;
    var scope = panel || (bar.closest ? bar.closest('.route') : null) || d;
    var table = scope.querySelector ? scope.querySelector('table.multi-session') : null;
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;
    var statusSel = bar.querySelector('[data-axis="status"]');
    var wtSel = bar.querySelector('[data-axis="worktree"]');
    var sortSel = bar.querySelector('[data-axis="sort"]');
    var resetBtn = bar.querySelector('.explore-reset');
    var head = bar.closest ? bar.closest('.panel-head') : bar.parentNode;
    var countEl = head ? head.querySelector('.explore-count') : null;

    function rows() {
      var out = [];
      for (var i = 0; i < tbody.children.length; i++) {
        var tr = tbody.children[i];
        if (tr.tagName === 'TR') out.push(tr);
      }
      return out;
    }

    function apply() {
      var filters = { status: statusSel ? statusSel.value : '', worktree: wtSel ? wtSel.value : '' };
      var mode = sortSel ? sortSel.value : 'progress';
      var rs = rows();
      var vis = 0;
      for (var i = 0; i < rs.length; i++) {
        var show = EX.matchFilter(sessDescOf(rs[i]), filters);
        rs[i].hidden = !show;
        if (show) vis++;
      }
      // 진행순 정렬 — 가시/비가시 모두 결정적 재배열(compareItems 'progress').
      rs.sort(function (a, b) { return EX.compareItems(sessDescOf(a), sessDescOf(b), mode); });
      rs.forEach(function (tr) { tbody.appendChild(tr); });
      if (countEl) countEl.textContent = (vis === rs.length) ? '' : (vis + '개 표시');
      if (resetBtn) {
        var pristine = (!statusSel || !statusSel.value) && (!wtSel || !wtSel.value)
          && (!sortSel || sortSel.value === 'progress');
        resetBtn.disabled = pristine;
      }
    }

    if (statusSel) statusSel.addEventListener('change', apply);
    if (wtSel) wtSel.addEventListener('change', apply);
    if (sortSel) sortSel.addEventListener('change', apply);
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (statusSel) statusSel.value = '';
      if (wtSel) wtSel.value = '';
      if (sortSel) sortSel.value = 'progress';
      apply();
    });
    apply();
  }

  var sessionBars = d.querySelectorAll('.explore-bar[data-explore-scope="session"]');
  for (var sb = 0; sb < sessionBars.length; sb++) wireSessionBar(sessionBars[sb]);
})();
