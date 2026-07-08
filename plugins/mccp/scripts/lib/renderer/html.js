'use strict';

const fs = require('fs');
const path = require('path');
const { serializeDetails } = require('./parsers/drawer-detail');

// v1.13.0 — vendored-inline jQuery (slim, no ajax/effects). Read once at module
// load + embedded inline (NEVER an external <script src> — Codex F2 trust
// boundary: status.html can carry raw unmasked data, so no third-party origin).
// fail-open: if the vendor file is missing, the pipeline baseline still renders
// (progressive enhancement — JS layer is additive, never required).
const JQUERY_SLIM = (function () {
  try {
    return fs.readFileSync(path.join(__dirname, 'vendor', 'jquery-3.7.1.slim.min.js'), 'utf8');
  } catch (_) {
    return '';
  }
})();

// Dashboard Data Exploration M1 — PE 토대 client 스크립트(client/explore.js). 모듈-
// 로드 1회 read + inline emit(JQUERY_SLIM 패턴 미러 — NEVER 외부 <script src>, H13/H19
// 외부 fetch 0). DOM-only(network primitive 0). fail-open: 파일 누락 시 빈 문자열 →
// 그룹은 native <details> 로 JS 없이 완전 동작(PE — JS layer 는 부가).
const EXPLORE_JS = (function () {
  try {
    return fs.readFileSync(path.join(__dirname, 'client', 'explore.js'), 'utf8');
  } catch (_) {
    return '';
  }
})();

// Data Exploration M2 — 필터/정렬 pure 로직(parsers/explore-sort.js, UMD). EXPLORE_JS
// *앞에* emit 해야 window.__mccpExplore 가 먼저 정의된다(엔진이 소비). 모듈-로드 1회
// read + inline(외부 src 0, H13 · network primitive 0, H19 — 순수 값 변환). 누락 시
// 빈 문자열 → 엔진은 window.__mccpExplore 부재로 no-op(baseline 전체 가시 유지).
const EXPLORE_SORT_JS = (function () {
  try {
    return fs.readFileSync(path.join(__dirname, 'parsers', 'explore-sort.js'), 'utf8');
  } catch (_) {
    return '';
  }
})();

// v1.17.0 (dashboard-console-redesign OQ#1 — 사용자 승인) vendored Pretendard
// Variable, base64-inline @font-face. 외부 fetch 0(self-contained 불변 + H13
// 외부-fetch invariant 정합 — data: URI 는 네트워크 surface 아님). woff2 누락 시
// fail-open(빈 문자열) → body font-family 의 system 스택으로 graceful degrade.
// OFL-1.1, orioncactus/pretendard (license: vendor 동봉 woff2 metadata).
const FONT_FACE = (function () {
  try {
    const b64 = fs.readFileSync(path.join(__dirname, 'vendor', 'PretendardVariable.woff2')).toString('base64');
    return "@font-face{font-family:'Pretendard Variable';font-weight:45 920;"
      + "font-style:normal;font-display:swap;"
      + "src:url(data:font/woff2;base64," + b64 + ") format('woff2-variations');}";
  } catch (_) {
    return '';
  }
})();

// Pipeline enhancement (jQuery): node tooltips + focusable rows. Additive only —
// baseline is fully visible/legible without this. No visibility-gating animation
// (a hidden-tab transition must never leave a node blank).
const PIPELINE_SCRIPT = "jQuery(function($){"
  // v1.18.0 M2 — 노드 title 툴팁(stage + 상태) + 행 focusability(additive;
  // baseline 은 JS 없이 동작). 마커는 .node-label, 상태는 .sr-only.
  + "$('.pipe-node').each(function(){var n=$(this),s=n.find('.node-label').text(),t=n.find('.sr-only').text();if(s&&t)n.attr('title',t);});"
  + "$('.pipe-row,.audit-row').attr('tabindex','0');"
  + "});";

// v1.17.0 (dashboard-console-redesign M1) — 승인된 dashboard-sample.html 콘솔 셸
// 이식. Vercel 콘솔 결: 순수 중립 near-black(chroma 0, status 색만 채도),
// hairline border 중심, Pretendard self-contained(vendored woff2 base64 inline
// @font-face — 외부 fetch 0, woff2 파일 누락 시 system 스택 graceful degrade),
// Lucide symbol 스프라이트.
// 좌측 사이드바 = 프로젝트 스위처 + 검색 affordance + 아이콘 page nav + 차단
// pin-alert. 상단바 = 브레드크럼 + 중앙 page-title + freshness. CSS :target
// 멀티-route(JS 0, no-JS 시 개요). v1.18.0 M2 — 섹션 내부 마크업을 샘플 class
// anatomy(stack-list/li-item/sev/pipe-stages/audit-row/milestone-item)로 충실
// 이식 + 모든 더미 자리를 derive 실데이터로 채움 + prose 파이프라인(H10/H16
// 데이터-driven 해소). 우측 드로어는 M3. 샘플 섹션 마크업이 계약.
const OKLCH_DARK = `
:root {
  --bg: oklch(0.152 0 0);
  --sidebar: oklch(0.165 0 0);
  --surface: oklch(0.185 0 0);
  --panel: oklch(0.188 0 0);
  --panel-2: oklch(0.215 0 0);
  --panel-hover: oklch(0.235 0 0);
  --panel-border: oklch(0.272 0 0);
  --border: oklch(0.272 0 0);
  --border-2: oklch(0.335 0 0);
  --ink: oklch(0.975 0 0);
  --ink-2: oklch(0.78 0 0);
  --muted: oklch(0.615 0 0);
  --faint: oklch(0.48 0 0);
  --accent: oklch(0.66 0.16 252);
  --accent-dim: oklch(0.66 0.16 252 / 0.14);
  --status-blocked: oklch(0.67 0.19 25);
  --status-blocked-dim: oklch(0.67 0.19 25 / 0.14);
  --status-stale: oklch(0.81 0.13 80);
  --status-secret: oklch(0.67 0.22 25);
  --status-worker-alive: oklch(0.74 0.16 152);
  --status-worker-stale: oklch(0.81 0.13 80);
  --ok: oklch(0.74 0.16 152);
  --ok-dim: oklch(0.74 0.16 152 / 0.13);
  --warn: oklch(0.81 0.13 80);
  --warn-dim: oklch(0.81 0.13 80 / 0.13);
  --bad: oklch(0.67 0.19 25);
  --bad-dim: oklch(0.67 0.19 25 / 0.14);
  --mono: ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, 'Liberation Mono', monospace;
  --sidebar-w: 244px;
  --content-max: 1080px;
  --radius: 9px;
  --radius-sm: 6px;
  --topbar-h: 52px;
  --panel-shadow: 0 1px 2px oklch(0 0 0 / 0.28), 0 1px 1px oklch(0 0 0 / 0.16);
}`;

const OKLCH_LIGHT = `
@media (prefers-color-scheme: light) {
  :root {
    --bg: oklch(0.99 0 0);
    --sidebar: oklch(0.982 0 0);
    --surface: oklch(0.972 0 0);
    --panel: oklch(1 0 0);
    --panel-2: oklch(0.972 0 0);
    --panel-hover: oklch(0.955 0 0);
    --panel-border: oklch(0.912 0 0);
    --border: oklch(0.912 0 0);
    --border-2: oklch(0.85 0 0);
    --ink: oklch(0.20 0 0);
    --ink-2: oklch(0.36 0 0);
    --muted: oklch(0.49 0 0);
    --faint: oklch(0.62 0 0);
    --accent: oklch(0.55 0.18 252);
    --accent-dim: oklch(0.55 0.18 252 / 0.09);
    --status-blocked: oklch(0.54 0.20 25);
    --status-blocked-dim: oklch(0.54 0.20 25 / 0.08);
    --status-stale: oklch(0.60 0.12 70);
    --status-secret: oklch(0.50 0.22 25);
    --status-worker-alive: oklch(0.54 0.14 152);
    --status-worker-stale: oklch(0.60 0.12 70);
    --ok: oklch(0.54 0.14 152);
    --ok-dim: oklch(0.54 0.14 152 / 0.10);
    --warn: oklch(0.60 0.12 70);
    --warn-dim: oklch(0.60 0.12 70 / 0.11);
    --bad: oklch(0.54 0.20 25);
    --bad-dim: oklch(0.54 0.20 25 / 0.08);
    --panel-shadow: 0 1px 2px oklch(0.55 0.01 250 / 0.08), 0 1px 1px oklch(0.55 0.01 250 / 0.05);
  }
}`;

const LAYOUT = `
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  /* Pretendard self-contained: vendored woff2 base64 @font-face(FONT_FACE 상수,
     외부 fetch 0). woff2 누락 시 system 스택으로 graceful degrade. (H13 = 외부
     fetch invariant — data: URI 는 네트워크 surface 아님) */
  font-family: 'Pretendard Variable', Pretendard, ui-sans-serif, system-ui, -apple-system, 'Segoe UI Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink);
  background: var(--bg);
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  align-items: start;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
a { color: inherit; }
code, .mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, 'Liberation Mono', monospace; font-size: 0.86em; color: var(--ink-2); }
.sr-only {
  position: absolute; width: 1px; height: 1px;
  overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%);
  white-space: nowrap; border: 0; padding: 0; margin: -1px;
}
.skip-link { position: fixed; top: -100px; left: 0.5rem; z-index: 80;
  background: var(--accent); color: oklch(0.99 0 0);
  padding: 0.45rem 0.8rem; border-radius: 6px; text-decoration: none; }
.skip-link:focus-visible { top: 0.5rem; outline: 2px solid var(--bg); outline-offset: 2px; }
/* icons — symbol(viewBox 0 0 24 24) 가 16px 박스로 정확히 스케일 */
.i { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.75;
  stroke-linecap: round; stroke-linejoin: round; flex: none; display: inline-block; vertical-align: -0.16em; }
.i-sm { width: 13px; height: 13px; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--muted); }
.dot-ok { background: var(--ok); }
.dot-bad { background: var(--status-blocked); }
.dot-warn { background: var(--warn); }
.dot-accent { background: var(--accent); }
.dot-mute { background: var(--faint); }
/* ───────────────────────── 좌측 사이드바 ───────────────────────── */
.sidebar {
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column;
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  padding: 0.65rem 0.55rem;
  overflow-y: auto;
}
.switcher { display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.5rem; border-radius: var(--radius-sm); color: var(--ink); }
.switcher:hover { background: var(--panel-2); }
.sw-mark { width: 22px; height: 22px; border-radius: 6px; flex: none;
  display: grid; place-items: center;
  background: var(--accent-dim); color: var(--accent); border: 1px solid oklch(0.66 0.16 252 / 0.35); }
.sw-name { font-weight: 600; font-size: 0.875rem; letter-spacing: -0.012em; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sw-badge { font-size: 0.66rem; font-weight: 500; color: var(--muted);
  border: 1px solid var(--border-2); padding: 0.04rem 0.34rem; border-radius: 5px; flex: none; }
.sw-chev { margin-left: auto; color: var(--faint); flex: none; }
.search { display: flex; align-items: center; gap: 0.5rem;
  margin: 0.5rem 0.05rem 0.7rem;
  padding: 0.42rem 0.55rem; border-radius: var(--radius-sm);
  background: var(--panel); border: 1px solid var(--border);
  color: var(--muted); font-size: 0.82rem; }
/* .search 는 M3 부터 .js-only <form> — [data-js=on] .js-only{display:revert} 가
   form 을 block 으로 되돌려 flex 가 깨지므로(explore-bar 와 동형) 높은 특정성으로 복원. */
[data-js="on"] .search.js-only { display: flex; }
.search .i { color: var(--faint); flex: none; }
/* native <input type=search> — borderless·투명 배경으로 .search 칩 안에 녹임. neutral
   토큰만(강조색 0). 포커스 링은 .search:focus-within 으로 폼 둘레에(carve-out accent). */
.search-input { flex: 1 1 auto; min-width: 0; font: inherit; font-size: 0.82rem;
  color: var(--ink-2); background: transparent; border: 0; padding: 0; margin: 0; }
.search-input::placeholder { color: var(--faint); }
.search-input:focus, .search-input:focus-visible { outline: none; }
.search:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
/* 검색 매칭 슬롯 — .nav-count 토큰 미러(neutral). :empty(미검색/0) 면 미표시. */
.nav-search-count { font-size: 0.72rem; color: var(--faint); font-variant-numeric: tabular-nums; }
.nav-search-count:empty { display: none; }
.rail-label { margin: 0.3rem 0.6rem 0.32rem; font-size: 0.69rem; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase; color: var(--faint); }
.nav-rail { display: flex; flex-direction: column; gap: 0.1rem; }
.nav-rail a.nav-link { display: flex; align-items: center; gap: 0.6rem;
  padding: 0.44rem 0.6rem; border-radius: var(--radius-sm);
  color: var(--muted); text-decoration: none; font-size: 0.875rem; font-weight: 450; line-height: 1.3;
  transition: background 120ms ease-out, color 120ms ease-out; }
.nav-rail a.nav-link .i { color: var(--faint); transition: color 120ms ease-out; }
.nav-rail a.nav-link:hover { background: var(--panel-2); color: var(--ink); }
.nav-rail a.nav-link:hover .i { color: var(--muted); }
.nav-rail a.nav-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.nav-count { margin-left: auto; font-size: 0.72rem; color: var(--faint); font-variant-numeric: tabular-nums; }
.rail-spacer { flex: 1 1 auto; min-height: 1rem; }
.pin-alert { margin: 0 0.05rem 0.2rem; padding: 0.7rem 0.75rem;
  background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.pin-alert .pa-top { display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.78rem; font-weight: 600; color: var(--ink); }
.pin-alert .pa-top .i { color: var(--status-blocked); }
.pin-alert .pa-body { margin: 0.32rem 0 0.6rem; font-size: 0.755rem; color: var(--muted); line-height: 1.5; }
.pin-alert .pa-body b { color: var(--ink-2); font-weight: 600; }
.pin-alert .pa-btn { display: block; text-align: center; text-decoration: none;
  font-size: 0.77rem; font-weight: 500; color: var(--ink-2);
  padding: 0.4rem 0.5rem; border-radius: 6px;
  background: var(--panel-2); border: 1px solid var(--border-2); }
.pin-alert .pa-btn:hover { background: var(--panel-hover); color: var(--ink); }
/* ───────────────────────── 메인 컬럼 ───────────────────────── */
.main-col { min-width: 0; display: flex; flex-direction: column; min-height: 100vh; }
header.topbar {
  position: sticky; top: 0; z-index: 30;
  height: var(--topbar-h); flex: none;
  display: flex; align-items: center; gap: 1rem; padding: 0 1.25rem;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  transition: border-color 200ms ease-out;
}
body[data-stale="1"] header.topbar { border-bottom-color: var(--status-stale); }
.crumb { display: flex; align-items: center; gap: 0.5rem; font-size: 0.86rem; color: var(--muted); }
.crumb .c-mark { width: 18px; height: 18px; border-radius: 5px; flex: none;
  display: grid; place-items: center;
  background: var(--accent-dim); color: var(--accent); border: 1px solid oklch(0.66 0.16 252 / 0.35); }
.crumb b { color: var(--ink); font-weight: 600; letter-spacing: -0.012em; }
.crumb .sep { color: var(--border-2); }
.tb-title-wrap { position: absolute; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; }
.tb-title { display: none; font-size: 0.9rem; font-weight: 600; color: var(--ink); letter-spacing: -0.012em; }
.tb-right { margin-left: auto; display: flex; align-items: center; gap: 0.75rem; }
.freshness { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--muted); }
.freshness .dot { width: 7px; height: 7px; background: var(--ok); box-shadow: 0 0 0 3px var(--ok-dim); }
body[data-stale="1"] .freshness .dot { background: var(--status-stale); }
.freshness .stale-suffix { display: none; }
body[data-stale="1"] .freshness .stale-suffix { display: inline; margin-left: 0.25rem; color: var(--status-stale); }
.content { width: 100%; max-width: var(--content-max); margin: 0 auto;
  padding: 1.6rem 1.5rem 4rem; flex: 1 1 auto; min-width: 0; }
main:focus { outline: none; }
/* ── CSS 라우팅 — :target 으로 단일 route, no-JS 시 개요 default. ── */
.route { display: none; scroll-margin-top: calc(var(--topbar-h) + 12px);
  flex-direction: column; gap: 1.1rem; }
.route:target { display: flex; }
body:not(:has(.route:target)) #route-overview { display: flex; }
body:not(:has(.route:target)) .nav-link[data-route="overview"],
body:has(#route-overview:target) .nav-link[data-route="overview"],
body:has(#route-pipeline:target) .nav-link[data-route="pipeline"],
body:has(#route-risks:target) .nav-link[data-route="risks"],
body:has(#route-questions:target) .nav-link[data-route="questions"],
body:has(#route-activity:target) .nav-link[data-route="activity"] {
  background: var(--panel-2); color: var(--ink); font-weight: 550;
}
body:not(:has(.route:target)) .nav-link[data-route="overview"] .i,
body:has(#route-overview:target) .nav-link[data-route="overview"] .i,
body:has(#route-pipeline:target) .nav-link[data-route="pipeline"] .i,
body:has(#route-risks:target) .nav-link[data-route="risks"] .i,
body:has(#route-questions:target) .nav-link[data-route="questions"] .i,
body:has(#route-activity:target) .nav-link[data-route="activity"] .i { color: var(--ink); }
body:not(:has(.route:target)) .tb-title[data-t="overview"],
body:has(#route-overview:target) .tb-title[data-t="overview"],
body:has(#route-pipeline:target) .tb-title[data-t="pipeline"],
body:has(#route-risks:target) .tb-title[data-t="risks"],
body:has(#route-questions:target) .tb-title[data-t="questions"],
body:has(#route-activity:target) .tb-title[data-t="activity"] { display: block; }
.page-title { font-size: 1.05rem; font-weight: 600; margin: 0 0 0.2rem; letter-spacing: -0.01em; }
/* ── 개요 hero (M2 샘플 fidelity — hero-status + verdict + action-prompt + axis-legend) ── */
.hero-panel { background: var(--panel); border: 1px solid var(--panel-border);
  border-radius: var(--radius); padding: 1.3rem 1.4rem 1.2rem; box-shadow: var(--panel-shadow); }
.hero-panel.attention { border-color: var(--bad); }
.hero-status { display: inline-flex; align-items: center; gap: 0.45rem;
  font-size: 0.78rem; font-weight: 550; color: var(--ok); }
h1.verdict { margin: 0.6rem 0 0; font-size: 1.3125rem; font-weight: 600; line-height: 1.42;
  letter-spacing: -0.02em; color: var(--ink); text-wrap: balance; max-width: 48ch; }
.verdict code { font-size: 0.84em; color: var(--ink); background: var(--panel-2);
  border: 1px solid var(--border); padding: 0.05em 0.34em; }
/* M8 next-action — '다음 작업' 라벨은 박스 밖(.na-label), 명령 박스(.action-prompt)는
   hero 폭 전체를 쓰고 복사 버튼은 맨 오른쪽(margin-left:auto), 설명(.na-desc)은 박스
   아래 full-width 로 잘림 없이 wrap. 명령(code)은 내용 폭(좌측), 길면 break-all wrap. */
.next-action { margin-top: 1rem; }
.na-label { font-size: 0.69rem; font-weight: 600; letter-spacing: 0.04em;
  color: var(--faint); margin-bottom: 0.4rem; }
.action-prompt { display: flex; align-items: center; gap: 0.55rem;
  width: 100%; padding: 0.5rem 0.5rem 0.5rem 0.8rem;
  background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; }
.action-prompt .lead { font-size: 0.69rem; font-weight: 600; letter-spacing: 0.04em;
  color: var(--faint); flex: none; }
.action-prompt code { font-family: var(--mono); font-size: 0.8rem; color: var(--ink-2);
  word-break: break-all; flex: 0 1 auto; min-width: 0; }
.action-prompt .next-prose, .action-prompt .stale-label { flex: 0 1 auto; min-width: 0; }
.action-prompt .stale-label { color: var(--status-stale); font-weight: 500; }
.action-prompt .copy-btn { margin-left: auto; }
.copy-btn { display: inline-flex; align-items: center; gap: 0.3rem; flex: none;
  font-size: 0.74rem; font-weight: 500; color: var(--ink-2); cursor: pointer;
  padding: 0.3rem 0.55rem; border-radius: 6px;
  background: var(--panel); border: 1px solid var(--border-2);
  transition: background 120ms ease-out, color 120ms ease-out; }
.copy-btn:hover { background: var(--panel-hover); color: var(--ink); }
.copy-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.copy-btn[data-copied="1"] { color: var(--ok); border-color: oklch(0.74 0.16 152 / 0.4); }
/* copied: replace the '복사' label with '복사됨' (not append — flex gap spaces it). */
.copy-btn .cb-label { display: inline; }
.copy-btn[data-copied="1"] .cb-label { display: none; }
.copy-btn[data-copied="1"]::after { content: '복사됨'; }
.axis-legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1.6rem;
  margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.axis { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--muted); }
.axis b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.axis b.bad { color: var(--bad); } .axis b.warn { color: var(--warn); }
/* ── Hero subtext(M7 ⑤ — 첫 완결 문장. intent-extractor 가 mid-word 줄임표 없이
   bounded 완결 문장을 주므로 line-clamp 는 pathological run-on 대비 generous
   safety net(6줄)로만 둔다. 그만 잘라 사용자 결정: 완전성 > 시각 밀도) + 설명 ── */
.verdict-sub { margin: 0.55rem 0 0; font-size: 0.9rem; line-height: 1.55; color: var(--muted);
  max-width: 100%; display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical; overflow: hidden; }
.na-desc { margin: 0.5rem 0 0; font-size: 0.82rem; line-height: 1.5; color: var(--muted);
  max-width: 100%; }
/* ── 대시보드 위젯 카드 (M6 Task 2 — Vercel 식 개별 카드 2컬럼 + 아래-화살표 확장) ──
   hero-panel 밖 sibling. .panel anatomy 재사용(비중첩, H17). 강조색 경쟁 방어:
   카드 컨테이너는 neutral, 상태색은 head dot + count 숫자에만 한정(viewport당 loud=
   차단/위험만, 진행중/이월은 muted). 색 단독 의미 금지(dot+라벨 병행). */
.widget-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.1rem;
  margin-top: 1.1rem; align-items: start; }
.widget-card .panel-head .dot { flex: none; }
.widget-card .panel-count { font-weight: 600; color: var(--ink); }
.widget-card .panel-count.bad { color: var(--bad); }
.widget-card .panel-count.warn { color: var(--warn); }
.hw-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.3rem;
  font-size: 0.8rem; color: var(--ink-2); }
/* M7 Task 6 (⑤) — 위젯 항목명은 공간이 있으므로 단일행 ellipsis clip 대신 최대
   2줄 wrap 으로 전체 표기(긴 마일스톤명 'm6 ver…' 잘림 해소). 2줄 cap 은 명시
   line-clamp 로(unbounded wrap 방지, design-critique LOW). */
.hw-list li { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; min-width: 0; }
.hw-empty { margin: 0; font-size: 0.8rem; color: var(--faint); }
.hw-more { display: inline-flex; align-items: center; gap: 0.28rem; margin-top: 0.6rem; font-size: 0.78rem;
  color: var(--muted); text-decoration: none; }
.hw-more:hover { color: var(--ink); }
.hw-more:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.hw-overflow { margin: 0.5rem 0 0; font-size: 0.78rem; color: var(--faint); }
/* 아래-화살표 확장(Vercel) — 카드 하단 중앙 chevron, overflow 항목 토글. reduced-motion
   은 하단 @media 가드가 transition 0. */
.card-expand { margin-top: 0.6rem; }
.card-expand > summary { list-style: none; cursor: pointer; display: flex; align-items: center;
  justify-content: center; gap: 0.3rem; font-size: 0.76rem; color: var(--muted); user-select: none;
  padding: 0.4rem; border-top: 1px solid var(--border); }
.card-expand > summary::-webkit-details-marker { display: none; }
.card-expand > summary:hover { color: var(--ink); }
.card-expand > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.card-expand .chev { transition: transform 140ms ease-out; }
.card-expand[open] .chev { transform: rotate(180deg); }
.card-expand .hw-list { margin-top: 0.55rem; }
/* ── 패널 (목적 있는 비중첩 패널 — head/body/foot anatomy) ── */
.grid, .panel-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.1rem; align-items: start; }
.span-2 { grid-column: 1 / -1; }
.panel { background: var(--panel); border: 1px solid var(--panel-border); border-radius: var(--radius);
  display: flex; flex-direction: column; min-width: 0; box-shadow: var(--panel-shadow); }
.panel.attention { border-color: var(--status-blocked); }
.panel-head { display: flex; align-items: center; gap: 0.5rem;
  padding: 0.72rem 1rem; border-bottom: 1px solid var(--border); }
.panel-head .i { color: var(--muted); }
.panel-title { margin: 0; font-size: 0.85rem; font-weight: 600; color: var(--ink); letter-spacing: -0.008em; }
.panel-count { margin-left: auto; font-size: 0.74rem; font-weight: 450; color: var(--faint);
  font-variant-numeric: tabular-nums; }
.panel-body { padding: 1rem; min-width: 0; }
.panel-empty { color: var(--muted); font-size: 0.875rem; padding: 0.5rem 0; }
h2 { font-size: 1rem; }
.muted { color: var(--muted); }
.stale-label { color: var(--status-stale); font-weight: 500; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 0.25rem 0.5rem; text-align: left; border-bottom: 1px solid var(--border); }
th { font-weight: 600; color: var(--muted); font-size: 0.8125rem; }
.table-scroll { overflow-x: auto; }
blockquote { margin: 0.25rem 0 0.5rem 1rem; padding-left: 0.5rem; border-left: 2px solid var(--border); color: var(--muted); }
ul { padding-left: 1.25rem; }
.s-blocked { color: var(--status-blocked); }
.s-stale { color: var(--status-stale); }
.s-worker-alive { color: var(--status-worker-alive); }
.s-worker-stale { color: var(--status-worker-stale); }
.s-secret { color: var(--status-secret); }
.s-in-progress, .s-terminal-ok { color: var(--accent); }
/* 멀티세션 self 행 — 비-색 텍스트 마커("이 worktree")가 primary; 아래는 보조
   구조 큐(중립 bg tint 만). side-stripe(box-shadow inset) 는 H4 금지라 미사용.
   accent/red 는 상태 셀 span 전용 보존(강조색 ≤1/viewport). */
.multi-session tr.self { background: var(--panel-2); }
/* M3 세션 바 필터로 가려진 행 — [hidden] UA 기본을 table-row 컨텍스트에서 명시 보강
   (.li-item[hidden] 선례 동형). */
.multi-session tr[hidden] { display: none; }
/* 상태·활동 셀은 짧은 고정 텍스트("◐ 진행 중" / "50분 전") — 좁은 컬럼에서 공백
   기준 줄바꿈을 막아 영역을 확보. 가변 길이(worktree 경로·진행 요약)는 1·3 컬럼이
   wrap 으로 흡수. */
.multi-session td:nth-child(4), .multi-session th:nth-child(4),
.multi-session td:nth-child(5), .multi-session th:nth-child(5) { white-space: nowrap; }
aside[role="alert"].s-secret {
  background: var(--status-secret); color: var(--bg);
  padding: 0.5rem; border-radius: 4px; margin-bottom: 1rem;
}
.severity-tag { display: inline-block; padding: 0 0.35em; border-radius: 3px;
  font-size: 0.8rem; font-weight: 500; }
.severity-tag.s-critical, .severity-tag.s-high { color: var(--status-blocked); font-weight: 600; }
.severity-tag.s-medium { color: var(--status-stale); font-weight: 600; }
.severity-tag.s-low { color: var(--muted); font-weight: 600; }
/* Dashboard Readability M2 — PRD 그룹 평탄화로 그룹 disclosure/일괄 토글 CSS 규칙
   일체 제거(위험·질문이 단일 .stack-list 평탄 렌더 → 그룹 chrome 미방출). 출처/시각
   meta-cue 는 기존 .meta-cue/.cue-sec/.mono 토큰 재사용(신규 규칙 0). */
/* M2/M3 hook — JS-only control(필터/정렬/검색)은 기본 숨김, explore.js 의 data-js="on"
   시에만 노출. M1 은 토대만(현 consumer 없음 — M2/M3 가 .js-only 부착). */
.js-only { display: none; }
[data-js="on"] .js-only { display: revert; }
/* ── 필터/정렬 컨트롤(Data Exploration M2) — 위험·질문 패널 head 우측에 통합
   (panel-header canonical). native <select>/<button>(product 표준 affordance — 커스텀
   드롭다운 reinvent 금지). neutral 토큰만(강조색 예산 0, focus-visible 만 accent).
   H3(radius 0)·H4(border-left 없음). 핵심 원칙:
   (1) PRD·plan select 폭 고정 — 위험·질문 패널이 옵션 내용과 무관하게 동일 형태(consistency).
   (2) focus outline offset 1px + gap 0.5rem — 인접 컨트롤 침범 방지.
   (3) **한 줄 고정(nowrap)** — 컨트롤이 둘째 줄로 떨어지는 2-tier 방지(좁으면 바 전체가
       제목 아래 한 줄로). 필터군 ↔ 정렬 간격 분리(Linear 패턴).
   (4) 초기화 항상 노출(현대 필터 UI 필수). 결과 수는 별도 텍스트 대신 패널 탭의 .tab-count
       를 갱신(엔진) — 시각 표면 깨끗. .explore-count 는 .sr-only live-region(스크린리더용). ── */
/* explore-bar 는 .js-only 도 함께 가진다. [data-js="on"] .js-only { display: revert }(특정성
   0,2,0)가 .explore-bar(0,1,0)의 display:flex 를 이겨 <div> UA 기본인 block 으로 되돌리면
   flex 가 깨져 ex-filters(block)가 한 줄 전체를 먹고 정렬/초기화가 둘째 줄로 흐른다(2행 회귀의
   진짜 원인). 같은 [data-js="on"] 스코프 + 높은 특정성(0,3,0)으로 flex 를 명시 복원한다. */
[data-js="on"] .explore-bar.js-only { display: flex; }
.explore-bar { display: flex; flex-wrap: nowrap; align-items: center; gap: 0.5rem; margin: 0; }
.ex-filters { display: flex; flex-wrap: nowrap; align-items: center; gap: 0.5rem; }
/* min-width:0 필수 — flex item 기본 min-width:auto 는 width:12rem 을 무시하고 select 를
   가장 긴 option(긴 PRD/plan 이름)의 min-content 폭으로 부풀린다. 그러면 ex-filters 가
   비대해져 panel-head 한 줄 배치가 깨지고 정렬/초기화가 둘째 줄로 밀린다(2-tier 회귀). */
.ex-select { font: inherit; font-size: 0.75rem; color: var(--ink-2);
  padding: 0.3rem 0.55rem; background: var(--panel-2); border: 1px solid var(--border);
  border-radius: 0; cursor: pointer; min-width: 0; max-width: 13rem; overflow: hidden; text-overflow: ellipsis; }
/* PRD·plan 은 폭 고정(내용 무관 동일) → 두 패널 형태 일치. 정렬은 짧고 옵션 동일 → 내용맞춤. */
.ex-filters .ex-select { width: 10rem; }
.ex-select.ex-sort { width: auto; min-width: 6rem; max-width: none; }
/* 필터군(PRD·plan) ↔ 정렬은 다른 개념(Linear 패턴) — 1px neutral hairline 으로 시각 구분.
   colored accent 아닌 --border hairline 이라 H4(side-stripe) 위반 아님. */
.ex-divider { align-self: stretch; flex: none; width: 1px; margin: 0.15rem 0.3rem;
  background: var(--border); }
.ex-select:hover { color: var(--ink); border-color: var(--hairline-strong); }
.ex-select:focus-visible, .explore-reset:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 1px; }
.explore-reset { font: inherit; font-size: 0.74rem; padding: 0.3rem 0.5rem; white-space: nowrap;
  background: transparent; color: var(--muted); border: 1px solid transparent;
  border-radius: 0; cursor: pointer; }
.explore-reset:hover { color: var(--ink-2); border-color: var(--border); }
/* 필터/정렬이 기본값(pristine)일 때 — 누를 게 없으므로 비활성(explore.js apply()가 토글).
   공간은 유지(레이아웃 안정) + 시각 noise 제거. baseline(JS off)은 explore-bar 자체 숨김. */
.explore-reset:disabled { color: var(--faint); border-color: transparent; cursor: default; }
.explore-reset:disabled:hover { color: var(--faint); border-color: transparent; }
.explore-empty { margin-top: 0.9rem; font-size: 0.82rem; color: var(--muted); }
/* panel-head 통합 — 제목은 좌측, 컨트롤은 우측 한 줄. 좁은 폭은 head 가 wrap 해 바 전체가
   제목 아래 한 줄로 떨어진다(컨트롤 내부는 nowrap — 데스크톱 우선, 모바일 미지원). */
.panel-head-tools { flex-wrap: wrap; row-gap: 0.5rem; column-gap: 0.5rem; }
.panel-head-tools .panel-count { margin-left: 0; }
.panel-head-tools .explore-bar { margin-left: auto; }
/* 필터로 가려진 항목 — .li-item 의 display:flex 가 [hidden] 기본을 덮으므로
   명시 규칙 필요(동일 specificity 0,1,1 > 0,1,0). */
.li-item[hidden] { display: none; }
/* ── 미해결 질문 / 위험 (stack-list > li-item, M2 샘플 fidelity) ── */
.stack-list { display: flex; flex-direction: column; gap: 0.9rem; margin: 0; padding: 0; list-style: none; }
.li-item { display: flex; gap: 0.65rem; align-items: flex-start; }
.li-main { min-width: 0; flex: 1 1 auto; }
.li-q { font-size: 0.875rem; font-weight: 450; color: var(--ink-2); line-height: 1.5; }
.li-q code { font-family: var(--mono); font-size: 0.9em; color: var(--ink); }
/* M1.2 Task 3 — 리스트 bold 중립화. 흰(--ink) vs 회(--ink-2) 대비가 '확인/미확인'
   상태 토글로 오인되던 문제 제거: 본문과 동색(--ink-2) + 미세 weight 만. loud 강조는
   드로어(.d-prose strong)로 집중. */
.li-q strong { font-weight: 600; color: var(--ink-2); }
.meta-cue { margin-top: 0.32rem; font-size: 0.745rem; color: var(--faint); }
.meta-cue.mit { color: var(--muted); }
.meta-cue b { color: var(--ink-2); font-weight: 600; }
.meta-cue .mono { font-family: var(--mono); font-size: 0.92em; color: var(--muted); }
.meta-cue .cue-sec { margin-left: 0.6rem; color: var(--faint); }
/* ── M3-b 탭(CSS-only, JS 0) — 미해결 default 노출 · 완화/해결 이력 탭 뒤. hidden
   radio + flex order + 인접 :checked 형제. 강조색 0(neutral underline + tabular 뱃지). ── */
.tabs { display: flex; flex-wrap: wrap; gap: 0; }
.tab-radio { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; margin: 0; }
.tab { order: 0; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.36rem 0.1rem; margin-right: 1.2rem; font-size: 0.82rem; font-weight: 500;
  color: var(--muted); border-bottom: 2px solid transparent; user-select: none;
  transition: color 120ms ease-out, border-color 120ms ease-out; }
.tab:hover { color: var(--ink-2); }
.tab-count { font-size: 0.72rem; color: var(--faint); font-variant-numeric: tabular-nums; }
.tab-panel { order: 1; width: 100%; display: none; margin-top: 0.95rem; }
.tab-radio:checked + .tab { color: var(--ink); border-bottom-color: var(--ink); font-weight: 600; }
.tab-radio:checked + .tab .tab-count { color: var(--muted); }
.tab-radio:checked + .tab + .tab-panel { display: block; }
.tab-radio:focus-visible + .tab { outline: 2px solid var(--accent); outline-offset: 2px; }
/* severity — 절제. HIGH/MED 만 옅은 색, LOW 는 무채색 텍스트. text-transform 없음(H9). */
.sev { flex: none; height: fit-content; font-size: 0.63rem; font-weight: 700; letter-spacing: 0.03em;
  padding: 0.16rem 0.4rem; border-radius: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sev.s-high { color: var(--bad); background: var(--bad-dim); }
.sev.s-med  { color: var(--warn); background: var(--warn-dim); }
.sev.s-low  { color: var(--muted); background: transparent; border: 1px solid var(--border-2); }
/* v1.18.7 M4 — 메인 복사 affordance(verbose .inline-prompt 대체). li-item 직속 우측
   child → 제목 줄 우상단 정렬(li-item align-items:flex-start, flex:none). 본문에서
   떨어진 '한 블럭 밑' 제거 + 소속 명확. icon-only(aria-label), 강조색 0(neutral
   .copy-btn 토큰 재사용, Constraint 2). */
.li-action { flex: none; }
.li-action .copy-btn { padding: 0.18rem 0.4rem; font-size: 0.7rem; }
details.more { margin-top: 0.9rem; }
details.more > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center;
  gap: 0.35rem; font-size: 0.78rem; color: var(--muted); user-select: none; }
details.more > summary::-webkit-details-marker { display: none; }
details.more > summary:hover { color: var(--ink); }
details.more > summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
details.more .chev { transition: transform 140ms ease-out; }
details.more[open] .chev { transform: rotate(90deg); }
details.more[open] > summary { margin-bottom: 0.9rem; }
abbr { text-decoration: underline dotted var(--ink); text-underline-offset: 2px; cursor: help; }
/* ── 게이트 파이프라인 (pipe-row grid + pipe-stages, carve-out 노드 마커) ── */
.pipeline { display: flex; flex-direction: column; }
.pipe-row { display: grid; grid-template-columns: minmax(9rem, 14rem) 1fr auto;
  align-items: center; gap: 1rem; padding: 0.82rem 0.3rem; }
.pipe-row + .pipe-row { border-top: 1px solid var(--border); }
.pipe-id { font-family: var(--mono); font-size: 0.8rem; color: var(--ink-2);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pipe-stages { display: flex; align-items: center; margin: 0; padding: 0; list-style: none; }
.pipe-node { display: inline-flex; align-items: center; gap: 0.35rem; flex: none; }
.node-mark { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; flex: none;
  border: 1.5px solid var(--border-2); background: var(--panel-2); color: var(--faint); }
.node-mark .i { width: 12px; height: 12px; stroke-width: 2.4; }
.node-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--faint); }
.node-label { font-size: 0.72rem; color: var(--faint); font-family: var(--mono); }
.node-link { width: 1.6rem; height: 1.5px; background: var(--border-2); margin: 0 0.1rem; flex: none; }
.pipe-node.is-done .node-mark { color: var(--ok); border-color: oklch(0.74 0.16 152 / 0.5); background: var(--ok-dim); }
.pipe-node.is-done .node-label { color: var(--muted); }
.pipe-node.is-active .node-mark { color: var(--accent); border-color: var(--accent); background: var(--accent-dim); }
.pipe-node.is-active .node-mark .node-dot { background: var(--accent); }
.pipe-node.is-active .node-label { color: var(--ink-2); }
.pipe-node.is-block .node-mark { color: var(--bad); border-color: var(--bad); background: var(--bad-dim); }
.pipe-node.is-block .node-label { color: var(--bad); }
/* M6 Task 6 — converged-frontier: 게이트 통과했으나 다음 미시작. done-green(✓) 과
   분화되는 neutral 마커(채워진 dot). "완료" 오독 차단 — 색 아닌 글리프로도 구분. */
.pipe-node.is-converged .node-mark { color: var(--ink-2); border-color: var(--border-2); background: var(--panel-2); }
.pipe-node.is-converged .node-mark .node-dot { background: var(--ink-2); width: 8px; height: 8px; }
.pipe-node.is-converged .node-label { color: var(--ink-2); }
.pipe-node.is-done + .node-link { background: oklch(0.74 0.16 152 / 0.4); }
.pipe-status { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.76rem; font-weight: 500;
  color: var(--muted); white-space: nowrap; }
.pipe-status.s-ok { color: var(--ok); } .pipe-status.s-active { color: var(--accent); }
.pipe-status.s-block { color: var(--bad); }
/* ── 타임라인 (audit-row grid + rail 노드/connector) ── */
.timeline { margin: 0; padding: 0; list-style: none; }
.audit-row { display: grid; grid-template-columns: 16px 1fr; gap: 0.7rem; }
.audit-rail { display: flex; flex-direction: column; align-items: center; padding-top: 0.4rem; }
.audit-node { width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--muted);
  box-shadow: 0 0 0 3px var(--panel); z-index: 1; }
.audit-node.is-ok { background: var(--ok); } .audit-node.is-bad { background: var(--bad); }
.audit-line { flex: 1 1 auto; width: 1.5px; background: var(--border); margin: 0.2rem 0; min-height: 1.1rem; }
.audit-body { padding-bottom: 1rem; min-width: 0; }
.audit-row:last-child .audit-body { padding-bottom: 0; }
.audit-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0.1rem 0.5rem; }
/* M6 followup — decision 을 main(ink, 우선), gate 를 sub(muted)로 역할 교체.
   decision 은 길어 ellipsis truncate(.pipe-id 동형) — 전체는 title 툴팁 + 드로어. */
.audit-gate { font-family: var(--mono); font-size: 0.76rem; color: var(--muted); flex: none; }
.audit-dec { font-family: var(--mono); font-size: 0.79rem; color: var(--ink);
  flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audit-when { margin-left: auto; font-size: 0.73rem; color: var(--faint); white-space: nowrap; }
.audit-meta { margin-top: 0.22rem; display: flex; align-items: center; flex-wrap: wrap; gap: 0.3rem 0.9rem;
  font-size: 0.75rem; color: var(--muted); }
.audit-meta .conv { display: inline-flex; align-items: center; gap: 0.28rem; color: var(--ok); }
.audit-meta .conv.is-bad { color: var(--bad); }
.audit-meta .conv.pending { color: var(--warn); }
.audit-meta .brief { color: var(--faint); }
.audit-row.from-snapshot .audit-body { color: var(--faint); }
.audit-row.from-snapshot .audit-node { opacity: 0.7; }
.audit-note { list-style: none; color: var(--faint); font-size: 0.74rem; padding: 0.2rem 0 0.2rem 0.7rem; }
/* v1.18.7 M4 — 타임라인 각주 컨테이너(두 <ol> 밖 valid list, Codex R1 F1). .audit-note
   muted 행 톤 재사용(노드 없음). */
.audit-notes { margin: 0; padding: 0; list-style: none; }
/* ── 마일스톤 기록 (milestone-item, ms-check/ms-text/ms-file/ms-when) ── */
.milestone-history { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; }
.milestone-item { display: flex; align-items: center; gap: 0.65rem; padding: 0.52rem 0.1rem; }
.milestone-item + .milestone-item { border-top: 1px solid var(--border); }
.ms-check { width: 18px; height: 18px; border-radius: 50%; flex: none; display: grid; place-items: center;
  color: var(--ok); background: var(--ok-dim); }
.ms-check .i { width: 11px; height: 11px; stroke-width: 2.6; }
.ms-text { font-size: 0.84rem; color: var(--ink-2); min-width: 0; display: flex; flex-direction: column; }
.ms-file { font-family: var(--mono); font-size: 0.71rem; color: var(--faint); margin-top: 0.06rem; }
.ms-when { margin-left: auto; font-size: 0.73rem; color: var(--faint); white-space: nowrap; }
/* M3 — lifecycle(pending/dropped) 비-색 텍스트 마커. ms-check 자리에 ◌/⊘ 글리프. */
.ms-life-mark { width: 18px; flex: none; display: grid; place-items: center; color: var(--faint);
  font-size: 0.9rem; line-height: 1; }
.milestone-item.ms-lifecycle .ms-text { color: var(--faint); }
/* ── 패널 foot (foot-link cross-link / foot-stat 집계) ── */
.panel-foot { display: flex; align-items: center; gap: 0.75rem;
  padding: 0.62rem 1rem; border-top: 1px solid var(--border); font-size: 0.76rem; color: var(--muted); }
.foot-link { margin-left: auto; display: inline-flex; align-items: center; gap: 0.28rem;
  color: var(--muted); text-decoration: none; }
.foot-link:hover { color: var(--ink); }
.foot-stat { font-family: var(--mono); font-size: 0.72rem; color: var(--faint); }
.foot-stat i { font-style: normal; margin-left: 1.1rem; }
.page-foot { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap;
  max-width: var(--content-max); width: 100%; margin: 0 auto;
  padding: 1.1rem 1.5rem 2rem; color: var(--faint); font-size: 0.74rem; }
/* ── clickable 항목(드로어 trigger) — 색 단독 의미 금지(hover/focus 만 affordance) ── */
.li-item.clickable, .milestone-item.clickable, .audit-row.clickable, .am-item.clickable { cursor: pointer; border-radius: var(--radius-sm); }
.li-item.clickable:hover, .milestone-item.clickable:hover, .audit-row.clickable:hover, .am-item.clickable:hover { background: var(--panel-2); }
.clickable:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* ── 개요 "진행 중 마일스톤" 패널 — worktree 진행 컴팩트 리스트. 사용자 요청(2026-06-28)
   으로 (1) 중복이던 이모지 아이콘 제거(dot 이 색 채널, statusLabel 텍스트가 비색 채널 —
   a11y 유지), (2) 상태 라벨에 색 부여(진행 중=accent, 차단=bad, 오류=warn, 대기=muted —
   배경 chrome 없이 텍스트 색만, H12 준수), (3) 시간(am-aux)을 행 우측으로 정렬,
   (4) 행 사이 hairline + ul 들여쓰기 제거로 worktree/시간 컬럼 스캔. ── */
.active-milestones { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.am-item { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.6rem 0.4rem; font-size: 0.875rem; }
.am-item + .am-item { border-top: 1px solid var(--border); }
.am-top { display: flex; align-items: center; gap: 0.6rem; }
.am-status { flex: none; min-width: 4.5rem; display: inline-flex; align-items: center; gap: 0.4rem;
  font-size: 0.8rem; font-weight: 500; color: var(--muted); }
.am-status.is-blocked { color: var(--bad); }
.am-status.is-degraded { color: var(--warn); }
.am-status.is-active { color: var(--accent); }
.am-status.is-idle { color: var(--muted); }
.am-wt { min-width: 0; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.am-aux { flex: none; margin-left: auto; padding-left: 0.6rem; color: var(--faint); font-size: 0.78rem;
  font-family: var(--mono); white-space: nowrap; }
/* 마일스톤 title — 2줄 clamp(전문은 드로어). 윗줄 메타와 위계: title 은 본문 톤. */
.am-title { color: var(--ink-2); font-size: 0.855rem; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* ── 상세 드로어 (우측 overlay-top, native dialog — 샘플 fidelity) ── */
.drawer {
  position: fixed; inset: 0 0 0 auto; margin: 0; z-index: 50;
  width: min(440px, 92vw); max-width: 92vw; height: 100dvh; max-height: 100dvh;
  padding: 0; border: none; border-left: 1px solid var(--border);
  background: var(--panel); color: var(--ink);
  box-shadow: -20px 0 50px oklch(0 0 0 / 0.45);
  transform: translateX(100%);
  transition: transform 280ms cubic-bezier(.22,.61,.36,1), overlay 280ms allow-discrete, display 280ms allow-discrete;
}
.drawer[open] { transform: translateX(0); }
@starting-style { .drawer[open] { transform: translateX(100%); } }
.drawer::backdrop {
  background: oklch(0 0 0 / 0);
  transition: background 280ms ease-out, overlay 280ms allow-discrete, display 280ms allow-discrete;
}
.drawer[open]::backdrop { background: oklch(0.10 0 0 / 0.55); backdrop-filter: blur(1px); }
@starting-style { .drawer[open]::backdrop { background: oklch(0 0 0 / 0); } }
.drawer-head { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--border); background: var(--panel); }
.drawer-kind { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.06em; color: var(--muted); }
.drawer-close { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 7px;
  color: var(--muted); background: var(--panel-2); border: 1px solid var(--border); cursor: pointer; }
.drawer-close:hover { color: var(--ink); background: var(--panel-hover); }
.drawer-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.drawer-body { padding: 1.1rem 1.2rem 2.5rem; overflow-y: auto; max-height: calc(100dvh - 53px); }
.d-title { margin: 0 0 0.8rem; font-size: 1.05rem; font-weight: 600; line-height: 1.45; letter-spacing: -0.012em;
  color: var(--ink); text-wrap: balance; }
.d-tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1.1rem; }
.d-rows { margin: 0 0 1.3rem; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.d-rows > div { display: flex; gap: 1rem; padding: 0.5rem 0.75rem; font-size: 0.8rem; }
.d-rows > div + div { border-top: 1px solid var(--border); }
.d-rows dt { margin: 0; flex: none; width: 5rem; color: var(--muted); }
.d-rows dd { margin: 0; min-width: 0; color: var(--ink-2); word-break: break-word; }
.d-sec { margin: 0 0 1.15rem; }
.d-sec h3 { margin: 0 0 0.35rem; font-size: 0.8rem; font-weight: 600; color: var(--ink); }
/* dashboard-interactivity M1 — block-level 드로어 prose 컨테이너(.d-prose, 이전엔
   inline-only <p>). near-monochrome 토큰만 재사용(Critique F2: --ink/--ink-2/--muted/
   --border/--panel-2) — 신규 강조색·tint 0(viewport당 강조색 ≤1 = severity pill 한정).
   table/blockquote 는 전역 규칙(table/th,td/blockquote) 재사용 — 간격만 보정.
   border-radius 미사용(H3 무발화) + blockquote border-left 는 전역 carve-out. */
.d-prose { font-size: 0.855rem; line-height: 1.65; color: var(--ink-2); }
.d-prose > :first-child { margin-top: 0; }
.d-prose > :last-child { margin-bottom: 0; }
.d-prose p { margin: 0 0 0.6rem; }
/* dashboard-interactivity M1.2 (Critique F1) — prose heading(##) 시각 위계. 차별화
   축은 size 가 아니라 weight + color + margin: font-size 는 .d-sec h3(0.8rem) 를
   초과하지 않아(.d-h <= .d-sec h3) prose 헤딩이 자기 섹션 라벨보다 커지는 위계
   역전을 차단. 본문(--ink-2/0.855rem) 대비는 --ink + weight 650 + margin 으로. */
.d-prose p.d-h { margin: 0.9rem 0 0.25rem; font-size: 0.8rem; font-weight: 650;
  color: var(--ink); letter-spacing: 0.01em; }
/* M1.2 Task 3 — drawer 본문 bold 는 loud(--ink). 리스트(.li-q strong) 가 quiet 로
   중립화된 만큼 강조 렌더는 loud-on-demand 표면인 드로어로 집중. --ink 는 primary
   text 토큰(accent 아님)이라 viewport 강조색 <=1(severity pill) 불변 유지. */
.d-prose strong { font-weight: 650; color: var(--ink); }
.d-prose ul, .d-prose ol { margin: 0 0 0.6rem; padding-left: 1.25rem; }
.d-prose li { margin: 0 0 0.2rem; }
.d-prose li:last-child { margin-bottom: 0; }
.d-prose pre { margin: 0 0 0.6rem; padding: 0.55rem 0.7rem; background: var(--panel-2);
  border: 1px solid var(--border); overflow-x: auto; font-size: 0.8rem; line-height: 1.5; }
.d-prose pre code { color: var(--ink-2); font-size: inherit; }
.d-prose blockquote { margin: 0 0 0.6rem; }
.d-prose table { margin: 0 0 0.6rem; font-size: 0.8rem; }
.d-action { margin-top: 1.3rem; }
/* dashboard-interactivity M2 — 드로어 마일스톤 네비게이션(위험/질문 필터 이동).
   near-monochrome 칩(중립 토큰만 — 강조색은 hover/focus 에만). 색 단독 의미 0. */
.d-nav { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.3rem; }
.d-nav-btn { flex: 1 1 7rem; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
  padding: 0.55rem 0.8rem; font-size: 0.82rem; font-weight: 500; color: var(--ink-2); text-decoration: none;
  background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;
  transition: background 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out; }
.d-nav-btn:hover { background: var(--panel-hover); color: var(--ink); border-color: var(--muted); }
.d-nav-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
/* dashboard-interactivity M4 — write-mode "제외(obsolete)" 버튼. 중립 톤(P2: red/
   accent 채움 회피 — 파괴적 색조 trap 방지). 기본 cache 에선 hidden(inert);
   write-mode resolve-action.js 가 data-mccp-write 로 노출. 강조색은 :focus-visible 만. */
.d-resolve-wrap { margin-top: 1.3rem; }
.d-resolve { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.85rem;
  font-size: 0.82rem; font-weight: 500; color: var(--muted); cursor: pointer;
  background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  transition: background 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out; }
.d-resolve:hover { background: var(--panel-hover); color: var(--ink); border-color: var(--muted); }
.d-resolve:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.d-resolve[disabled] { opacity: 0.55; cursor: default; }
/* ── 반응형 collapse: 사이드바를 상단 가로 바로, 패널 그리드 1-col. ── */
@media (max-width: 880px) {
  body { grid-template-columns: minmax(0, 1fr); }
  .sidebar { position: static; height: auto; flex-direction: row; flex-wrap: wrap;
    align-items: center; gap: 0.4rem; overflow: visible;
    border-right: none; border-bottom: 1px solid var(--border); }
  .search, .rail-label, .rail-spacer, .pin-alert { display: none; }
  .nav-rail { flex-direction: row; flex-wrap: nowrap; overflow-x: auto; margin-left: auto; gap: 0.25rem; }
  .nav-rail a.nav-link { white-space: nowrap; flex-shrink: 0; }
  .grid, .panel-grid { grid-template-columns: minmax(0, 1fr); }
  .widget-grid { grid-template-columns: minmax(0, 1fr); }
  .pipe-row { grid-template-columns: 1fr; gap: 0.5rem; }
  .tb-title-wrap { display: none; }
  .content { padding: 1.1rem 1rem 3rem; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}`;

// Lucide symbol 스프라이트 — symbol(viewBox 0 0 24 24) 라 .i 박스에 정확 스케일.
// inline 문자열 리터럴(외부 fetch 0). <body> 직후 1회 emit(aria-hidden).
const ICON_SPRITE = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
  + '<symbol id="ic-terminal" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 9 3 3-3 3"/><path d="M13 15h3"/></symbol>'
  + '<symbol id="ic-dashboard" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></symbol>'
  + '<symbol id="ic-branch" viewBox="0 0 24 24"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></symbol>'
  + '<symbol id="ic-activity" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></symbol>'
  + '<symbol id="ic-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></symbol>'
  + '<symbol id="ic-flag" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></symbol>'
  + '<symbol id="ic-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>'
  + '<symbol id="ic-alert" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>'
  + '<symbol id="ic-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></symbol>'
  + '<symbol id="ic-arrow" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></symbol>'
  + '<symbol id="ic-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></symbol>'
  + '<symbol id="ic-chev-d" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></symbol>'
  + '<symbol id="ic-refresh" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></symbol>'
  + '<symbol id="ic-worker" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></symbol>'
  + '<symbol id="ic-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></symbol>'
  + '<symbol id="ic-x" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></symbol>'
  + '</defs></svg>';

const STALE_SCRIPT = `(function(){var d=Number(document.body.dataset.derivedMs)||0;function c(){if(document.hidden)return;var a=Date.now()-d;document.body.dataset.stale=a>60000?'1':'0';}c();document.addEventListener('visibilitychange',c);setInterval(c,5000);})();`;

const COPY_SCRIPT = `(function(){document.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('[data-copy]');if(!t)return;var s=t.getAttribute('data-copy')||'';if(navigator&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){t.setAttribute('data-copied','1');setTimeout(function(){t.removeAttribute('data-copied')},1500)}).catch(function(){})}});})();`;

// v1.18.1 M3 — 우측 상세 드로어(native dialog). progressive enhancement: no-JS
// 시 항목은 일반 표시(클릭 무동작), 섹션 baseline 무손상. 주입 경계(Codex R1 F3):
// title/sections[].1 은 서버 렌더 안전 HTML → innerHTML, 그 외(tags/rows/action)는
// RAW → textContent. drawer-data JSON 은 \uXXXX escape 라 JSON.parse 가 복원.
// focus 관리: showModal() 자동 focus + 'close' 시 trigger 복귀, Esc/backdrop close.
const DRAWER_SCRIPT = "(function(){"
  + "var dataEl=document.getElementById('drawer-data'),drawer=document.getElementById('drawer');"
  + "if(!dataEl||!drawer)return;var DETAILS={};try{DETAILS=JSON.parse(dataEl.textContent||'{}')}catch(e){return}"
  + "var dKind=document.getElementById('d-kind'),dBody=document.getElementById('d-body'),lastTrigger=null;"
  + "var KIND={oq:'질문',risk:'위험',receipt:'Receipt',ms:'마일스톤',wt:'worktree'};"
  + "function el(t,c){var e=document.createElement(t);if(c)e.className=c;return e}"
  + "function render(d){dBody.innerHTML='';"
  + "var h=el('h2','d-title');h.innerHTML=d.title||'';dBody.appendChild(h);"
  + "if(d.tags&&d.tags.length){var tw=el('div','d-tags');d.tags.forEach(function(t){var s=el('span','sev s-'+(t.tone||'low'));s.textContent=t.label||'';tw.appendChild(s)});dBody.appendChild(tw)}"
  + "if(d.rows&&d.rows.length){var dl=el('dl','d-rows');d.rows.forEach(function(r){var row=el('div'),dt=el('dt'),dd=el('dd');dt.textContent=r[0]||'';if(r[2])dd.className='mono';dd.textContent=r[1]||'';row.appendChild(dt);row.appendChild(dd);dl.appendChild(row)});dBody.appendChild(dl)}"
  + "if(d.sections&&d.sections.length){d.sections.forEach(function(s){var sec=el('section','d-sec'),h3=el('h3'),p=el('div','d-prose');h3.textContent=s[0]||'';p.innerHTML=s[1]||'';sec.appendChild(h3);sec.appendChild(p);dBody.appendChild(sec)})}"
  + "if(d.action){var wrap=el('div','d-action'),lab=el('div','na-label'),ap=el('div','action-prompt'),code=el('code'),btn=el('button','copy-btn');lab.textContent='다음 작업';code.textContent=d.action;btn.type='button';btn.setAttribute('data-copy',d.action);btn.setAttribute('aria-label','다음 액션 복사');btn.innerHTML='<svg class=\"i i-sm\" aria-hidden=\"true\"><use href=\"#ic-copy\"/></svg><span class=\"cb-label\">복사</span>';ap.appendChild(code);ap.appendChild(btn);wrap.appendChild(lab);wrap.appendChild(ap);dBody.appendChild(wrap)}"
  + "if(d.nav&&d.nav.length){var nv=el('div','d-nav');d.nav.forEach(function(n){var b=el('a','d-nav-btn');b.href='#route-'+n.route;b.setAttribute('data-route',n.route);if(n.prd)b.setAttribute('data-prd',n.prd);b.textContent=n.label||'';b.addEventListener('click',function(e){e.preventDefault();navFilter(n.route,n.prd)});nv.appendChild(b)});dBody.appendChild(nv)}"
  + "if(d.resolveId){var rw=el('div','d-resolve-wrap'),rb=el('button','d-resolve');rb.type='button';rb.setAttribute('data-resolve-id',d.resolveId);rb.setAttribute('aria-label','이 항목 제외 처리');rb.textContent='제외';rb.hidden=!document.body.hasAttribute('data-mccp-write');rw.appendChild(rb);dBody.appendChild(rw)}}"
  + "function open(id,trigger){var d=DETAILS[id];if(!d)return;lastTrigger=trigger;dKind.textContent=KIND[String(id).split(':')[0]]||'상세';render(d);dBody.scrollTop=0;if(drawer.showModal){drawer.showModal()}else{drawer.setAttribute('open','')}}"
  + "function close(){if(drawer.close){drawer.close()}else{drawer.removeAttribute('open')}}"
  + "function navFilter(route,prd){lastTrigger=null;close();var root=document.getElementById('route-'+route);if(root&&prd){var sel=root.querySelector('.explore-bar [data-axis=\"prd\"]');if(sel){var ok=false,i;for(i=0;i<sel.options.length;i++){if(sel.options[i].value===prd){ok=true;break}}if(ok){sel.value=prd;sel.dispatchEvent(new Event('change',{bubbles:true}))}}}location.hash='route-'+route;}"
  + "var cb=drawer.querySelector('.drawer-close');if(cb)cb.addEventListener('click',close);"
  + "drawer.addEventListener('click',function(e){if(e.target===drawer)close()});"
  + "drawer.addEventListener('close',function(){if(lastTrigger&&lastTrigger.focus)lastTrigger.focus();lastTrigger=null});"
  + "Array.prototype.forEach.call(document.querySelectorAll('[data-detail-id]'),function(n){var id=n.getAttribute('data-detail-id');if(!DETAILS[id])return;n.classList.add('clickable');n.setAttribute('role','button');n.setAttribute('tabindex','0');n.setAttribute('aria-haspopup','dialog');n.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.copy-btn'))return;open(id,n)});n.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&!(e.target.closest&&e.target.closest('.copy-btn'))){e.preventDefault();open(id,n)}})});"
  + "})();";

// 슬래시 커맨드처럼 보이는 next-action 만 복사 버튼 부여. 일반 plan 라벨은 텍스트.
function looksLikeCommand(v) {
  return typeof v === 'string' && /^\/?mccp:|^\//.test(v.trim());
}

// 패널 제목 → Lucide symbol id 매핑. 미매핑은 dashboard 기본.
function panelIcon(title) {
  if (/질문/.test(title)) return 'ic-help';
  if (/위험/.test(title)) return 'ic-alert';
  if (/타임라인/.test(title)) return 'ic-clock';
  if (/마일스톤/.test(title)) return 'ic-flag';
  if (/파이프라인|게이트|결정/.test(title)) return 'ic-branch';
  if (/멀티세션|worktree/.test(title)) return 'ic-branch';
  if (/워커/.test(title)) return 'ic-worker';
  if (/활동/.test(title)) return 'ic-activity';
  return 'ic-dashboard';
}

// 개요 hero 패널 (M2 샘플 fidelity) — hero-status(tone dot+라벨) + verdict(h1) +
// action-prompt(다음 명령 복사) + axis-legend(진행/차단/다음/위험 4축 dot).
// M5 Task 4 — neutral(in-progress 진행 톤)과 muted(진짜 idle) 라벨 분화. 이전엔 둘 다
// '대기'라 진행 중인데도 '대기'로 보였다. neutral=진행 중(◐ in-flight plan), muted=대기
// (no in-flight signal). amber 도 진행 톤이나 staleness/degraded 경고 맥락이라 '진행 중'.
const HERO_STATUS = {
  green: { dot: 'dot-ok', label: '릴리스 준비됨' },
  red: { dot: 'dot-bad', label: '주의 필요' },
  amber: { dot: 'dot-warn', label: '진행 중' },
  neutral: { dot: 'dot-accent', label: '진행 중' },
  muted: { dot: 'dot-mute', label: '대기' },
};

// host_version.source → 한국어 라벨(status-grid sourceLabel 미러). provenance 를
// 항상 노출(F3) — 어느 신호가 채택됐는지 사용자가 검증 가능.
function heroSourceLabel(source) {
  switch (source) {
    case 'changelog': return 'CHANGELOG';
    case 'git-tag': return 'git 태그';
    case 'plan-cycle': return '최신 plan cycle';
    case 'unknown': return '미상';
    default:
      if (typeof source === 'string' && source.indexOf('meta:') === 0) return source.slice(5);
      return source || '미상';
  }
}

// M6 Task 2 — 위젯을 개별 .panel 카드로(Vercel 분해). head(상태 dot + 라벨 + count) /
// body(top-3 + 아래-화살표 확장). 강조색 경쟁 방어: 카드 컨테이너 neutral, 상태색은
// dot + count 에만(차단=loud bad, 위험=amber, 진행중/이월=muted). 색 단독 의미 금지
// (dot + 라벨 텍스트 병행). 위험/이월 finding 텍스트는 renderProseHtml(H10/H16 안전).
function renderWidgetCard(key, cellObj, dotClass, escapeHtml, escapeAttr, renderProseHtml, formatUtils) {
  const label = cellObj.label || key;
  const count = cellObj.value != null ? String(cellObj.value) : '0';
  const items = Array.isArray(cellObj.items) ? cellObj.items : [];
  const isProse = key === 'risks' || key === 'deferred';
  const li = (t) => '<li>' + (isProse ? renderProseHtml(t, formatUtils) : escapeHtml(t)) + '</li>';

  let bodyHtml;
  if (items.length === 0) {
    // M5 Task 2 — 차단 0건은 '검토 충돌 없음' empty-state(의미 노출).
    const emptyText = key === 'blocked' ? '검토 충돌 없음' : '없음';
    bodyHtml = '<p class="hw-empty">' + escapeHtml(emptyText) + '</p>';
  } else {
    bodyHtml = '<ul class="hw-list">' + items.slice(0, 3).map(li).join('') + '</ul>';
    const overflow = items.length - 3;
    if (overflow > 0) {
      if (cellObj.routeHref) {
        // route 있는 위젯(위험)은 전체보기 링크 — route 가 해당 섹션 full 을 렌더하므로
        // overflow 항목이 target HTML 에 실존(도달성, Codex F2).
        bodyHtml += '<a class="hw-more" href="' + escapeAttr(cellObj.routeHref) + '">'
          + '전체 보기 (+' + overflow + ')'
          + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-arrow"/></svg></a>';
      } else {
        // route 없는 위젯(진행중/이월)은 Vercel 식 아래-화살표 확장(<details>).
        const rest = items.slice(3).map(li).join('');
        bodyHtml += '<details class="card-expand"><summary>'
          + '<svg class="i i-sm chev" aria-hidden="true"><use href="#ic-chev-d"/></svg>'
          + '<span>' + overflow + '개 더보기</span></summary>'
          + '<ul class="hw-list">' + rest + '</ul></details>';
      }
    }
  }

  // viewport당 loud ≤1: 차단(>0)만 bad, 위험(>0) amber, 진행중/이월 neutral count.
  let countClass = 'panel-count';
  if (key === 'blocked' && count !== '0') countClass += ' bad';
  else if (key === 'risks' && count !== '0') countClass += ' warn';

  // 차단 셀 의미 툴팁(decision-state 판정). title 은 human-readable → escapeHtml.
  const headTitle = cellObj.intent ? ' title="' + escapeHtml(cellObj.intent) + '"' : '';

  return '<section class="panel widget-card" aria-label="' + escapeAttr(label) + '">'
    + '<div class="panel-head"' + headTitle + '>'
    + '<span class="dot ' + dotClass + '" aria-hidden="true"></span>'
    + '<h3 class="panel-title">' + escapeHtml(label) + '</h3>'
    + '<span class="' + countClass + '">' + escapeHtml(count) + '</span></div>'
    + '<div class="panel-body">' + bodyHtml + '</div>'
    + '</section>';
}

// M6 Task 2 — 위젯 카드 2컬럼 그리드(hero-panel 밖 sibling). 진행중/이월은 muted dot,
// 차단=bad dot, 위험=amber dot(색 단독 금지 — head 라벨 텍스트 병행).
function renderWidgetCards(grid, escapeHtml, escapeAttr, formatUtils) {
  const renderProseHtml = (formatUtils && formatUtils.renderProseHtml) || ((t) => escapeHtml(t));
  const cells = (grid && Array.isArray(grid.cells)) ? grid.cells : [];
  const cell = (key) => cells.find((c) => c.key === key) || {};
  return '<div class="widget-grid">'
    + renderWidgetCard('in-progress', cell('in-progress'), 'dot-mute', escapeHtml, escapeAttr, renderProseHtml, formatUtils)
    + renderWidgetCard('blocked', cell('blocked'), 'dot-bad', escapeHtml, escapeAttr, renderProseHtml, formatUtils)
    + renderWidgetCard('deferred', cell('deferred'), 'dot-mute', escapeHtml, escapeAttr, renderProseHtml, formatUtils)
    + renderWidgetCard('risks', cell('risks'), 'dot-warn', escapeHtml, escapeAttr, renderProseHtml, formatUtils)
    + '</div>';
}

// Dashboard Interactivity M2 — 개요(route-overview) "진행 중 마일스톤" 패널.
// multiSession.overview projection(in-progress worktree 요약) 소비 — worktree 별
// 마일스톤(라벨 + milestone_hint + status). status 는 icon+label+소형 dot(widget-card
// dot discipline 재사용, colored-text/행 색칠 0 → 강조색 ≤1, hero verdict 가 유일 loud).
// overview 부재/0-item → '' (graceful hide, 빈 chrome 0). data-detail-id 는 표가 없을
// 때(healthy-single = 그 worktree 드로어 유일 trigger)만 부여 — 표 present(2+/unhealthy)
// 시엔 H18 중복-id invariant 회피로 display-only(드로어는 활동·기록 route 표가 trigger,
// foot 링크가 경로). 신규 detail 0(drawerMap 은 multiSession.details 그대로 소비).
const AM_DOT = { blocked: 'dot-bad', degraded: 'dot-warn', active: 'dot-accent', idle: 'dot-mute' };
const AM_CLS = { blocked: 'is-blocked', degraded: 'is-degraded', active: 'is-active', idle: 'is-idle' };

function renderActiveMilestones(multiSession, formatUtils) {
  const escapeHtml = formatUtils.escapeHtml;
  const ov = multiSession && multiSession.overview;
  if (!ov || !Array.isArray(ov.items) || ov.items.length === 0) return '';
  // 각 항목 = 2줄 블록(영역 정의). 윗줄: 상태 배지 · worktree(굵게) · 시간(우측).
  // 아랫줄: 마일스톤 title(.am-title, 최대 2줄 clamp — 전문은 드로어). detailId 는
  // 항상 부여(ms:ov 네임스페이스 → 표 wt: 와 충돌 0, H18 균형은 multi-session 이 보증).
  const rows = ov.items.map((it) => {
    const dot = AM_DOT[it.kind] || 'dot-mute';
    const statusCls = AM_CLS[it.kind] || 'is-idle';
    const wt = it.isSelf ? '<strong>이 worktree</strong>' : escapeHtml(it.label);
    const aux = [];
    if (it.gate) aux.push(it.gate);
    if (it.activity) aux.push(it.activity);
    const auxHtml = aux.length
      ? '<span class="am-aux">' + escapeHtml(aux.join(' · ')) + '</span>'
      : '';
    const titleHtml = it.milestoneHint
      ? '<div class="am-title">' + escapeHtml(it.milestoneHint) + '</div>'
      : '';
    const detailAttr = it.detailId
      ? ' data-detail-id="' + escapeHtml(it.detailId) + '"'
      : '';
    return '<li class="am-item"' + detailAttr + '>'
      + '<div class="am-top">'
      + '<span class="am-status ' + statusCls + '"><span class="dot ' + dot + '" aria-hidden="true"></span>'
      + escapeHtml(it.statusLabel) + '</span>'
      + '<span class="am-wt">' + wt + '</span>'
      + auxHtml
      + '</div>'
      + titleHtml
      + '</li>';
  }).join('');
  const ul = '<ul class="active-milestones" role="list">' + rows + '</ul>';
  const opts = { count: String(ov.total) };
  if (ov.total > ov.shown) {
    opts.foot = '<a href="#route-activity">활동 · 기록에서 +'
      + escapeHtml(String(ov.total - ov.shown)) + '개 더 보기</a>';
  }
  return renderPanel('진행 중 마일스톤', { html: ul }, escapeHtml, opts);
}

// 대시보드 hero — hero-status(tone dot) + verdict(h1) + next-action(STATE.md
// full command line 복사, executable 만) + host-version 줄 + named-widget 3종.
// grid 는 status-grid 산출 섹션({cells, version, nextAction}). console-shell stub
// 처럼 version/nextAction 부재 시 graceful degrade(next cell 폴백).
function renderHeroPanel(verdict, grid, projectName, escapeHtml, escapeAttr, formatUtils) {
  const norm = (formatUtils && formatUtils.normalizeProse) || ((s) => s);
  const renderProseHtml = (formatUtils && formatUtils.renderProseHtml) || ((t) => escapeHtml(t));
  const attention = verdict.tone === 'red';
  const status = HERO_STATUS[verdict.tone] || HERO_STATUS.neutral;
  const safeText = escapeHtml(norm(verdict.text));

  const cells = (grid && Array.isArray(grid.cells)) ? grid.cells : [];
  const cell = (key) => cells.find(c => c.key === key) || {};
  const nextAction = grid && grid.nextAction;

  // M8 next-action — '다음 작업' 라벨은 박스 밖(.na-label, 디자인 영역), 명령 박스
  // (.action-prompt)는 code(좌) + 복사(맨 오른쪽), 설명(.na-desc)은 박스 아래
  // full-width 로 잘림 없이 wrap. 설명은 명령 용도(CMD_PURPOSE) — plan intent 는 위
  // subtext 가 full 로 노출하므로 desc 중복/잘림을 피한다(describeAction 우선순위).
  const naLabel = '<div class="na-label">다음 작업</div>';
  const copyBtn = (txt) => '<button class="copy-btn" type="button" data-copy="'
    + escapeHtml(txt) + '" aria-label="다음 액션 복사">'
    + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-copy"/></svg>'
    + '<span class="cb-label">복사</span></button>';
  let promptHtml = '';
  if (nextAction) {
    const descHtml = nextAction.description
      ? '<p class="na-desc">' + renderProseHtml(nextAction.description, formatUtils) + '</p>'
      : '';
    let boxHtml = '';
    if (nextAction.executable && nextAction.copyText) {
      boxHtml = '<div class="action-prompt"><code>' + escapeHtml(nextAction.copyText) + '</code>'
        + copyBtn(nextAction.copyText) + '</div>';
    } else if (nextAction.stale) {
      boxHtml = '<div class="action-prompt"><span class="stale-label">'
        + escapeHtml(nextAction.prose || '미정 (stale)') + '</span></div>';
    } else if (nextAction.source !== 'idle' && nextAction.prose) {
      boxHtml = '<div class="action-prompt"><span class="next-prose">'
        + renderProseHtml(nextAction.prose, formatUtils) + '</span></div>';
    }
    if (boxHtml) promptHtml = '<div class="next-action">' + naLabel + boxHtml + descHtml + '</div>';
  } else {
    // backward-compat (nextAction 없는 stub) — 기존 next cell 폴백.
    const nextCell = cell('next');
    const nextVal = nextCell.value;
    if (nextVal && nextVal !== '대기') {
      let boxHtml = '';
      if (nextCell.stale) {
        boxHtml = '<div class="action-prompt"><span class="stale-label">'
          + escapeHtml(nextVal) + '</span></div>';
      } else if (looksLikeCommand(nextVal)) {
        boxHtml = '<div class="action-prompt"><code>' + escapeHtml(nextVal) + '</code>'
          + copyBtn(nextVal) + '</div>';
      } else {
        const titleAttr = nextCell.intent ? ' title="' + escapeAttr(nextCell.intent) + '"' : '';
        boxHtml = '<div class="action-prompt"><code' + titleAttr + '>'
          + escapeHtml(nextVal) + '</code></div>';
      }
      promptHtml = '<div class="next-action">' + naLabel + boxHtml + '</div>';
    }
  }

  // M6 Task 4 — Hero subtext(요약 prose). h1 은 마일스톤명(짧음), subtext 는 2줄
  // line-clamp(잘림 대신). renderProseHtml 경유로 raw marker 누출 0(H10/H16).
  const subtextHtml = verdict.subtext
    ? '<p class="verdict-sub">' + renderProseHtml(verdict.subtext, formatUtils) + '</p>'
    : '';

  // M6 Task 2 — hero-panel 은 1칼럼 상단 밴드(hero-status + verdict h1 + subtext +
  // next-action)만. named-widget 4종은 hero-panel 밖 별도 widget-grid 카드 2컬럼으로
  // 분해(renderWidgetCards). M5 Task 5 — hero-version 줄은 footer 가 노출(중복 제거).
  return '<section class="hero-panel' + (attention ? ' attention' : '') + '" aria-label="판정">'
    + '<span class="hero-status"><span class="dot ' + status.dot + '" aria-hidden="true"></span>'
    + escapeHtml(status.label) + '</span>'
    + '<h1 class="verdict s-' + escapeHtml(verdict.tone) + '">' + safeText + '</h1>'
    + subtextHtml
    + promptHtml
    + '</section>';
}

// 패널 — head(아이콘 + 제목 + 옵션 count + opt 필터/정렬 tools) / body(섹션 inner HTML)
// anatomy. 비중첩(H17). empty-state graceful. 섹션 내부 마크업은 M2 에서 샘플 fidelity 로.
// Data Exploration M2 — opts.tools(.explore-bar)가 있으면 head 우측에 통합(panel-head-tools).
// 컨트롤이 자기 리스트 바로 위 head 에 살아 scope=배치 일치 + 사이드바 nav 무게감 0.
function renderPanel(title, section, escapeHtml, opts) {
  opts = opts || {};
  const cls = 'panel' + (opts.span2 ? ' span-2' : '') + (opts.attention ? ' attention' : '');
  const inner = (section && section.html)
    ? section.html
    : '<p class="panel-empty">데이터 없음</p>';
  // count/foot — opts override, 없으면 section 이 자체 제공한 값(파이프라인 foot-stat
  // · 위험 foot-link 등)을 소비. foot 은 raw html(섹션 모듈 책임).
  const count = opts.count || (section && section.count);
  const foot = opts.foot || (section && section.foot);
  const countHtml = count
    ? '<span class="panel-count">' + escapeHtml(count) + '</span>'
    : '';
  const footHtml = foot
    ? '<div class="panel-foot">' + foot + '</div>'
    : '';
  const tools = opts.tools || '';
  const headCls = 'panel-head' + (tools ? ' panel-head-tools' : '');
  // 필터 결과 수 — 시각 표면은 패널 탭의 .tab-count 를 엔진이 갱신(미해결 18→8). 별도 텍스트
  // 안 보임. 이 span 은 .sr-only live-region 으로 스크린리더에게만 "N개 표시"를 announce.
  const exCount = tools
    ? '<span class="explore-count sr-only" role="status" aria-live="polite"></span>'
    : '';
  return '<section class="' + cls + '" aria-label="' + escapeHtml(title) + '">'
    + '<div class="' + headCls + '"><svg class="i" aria-hidden="true"><use href="#' + panelIcon(title) + '"/></svg>'
    + '<h3 class="panel-title">' + escapeHtml(title) + '</h3>' + exCount + countHtml + tools + '</div>'
    + '<div class="panel-body">' + inner + '</div>'
    + footHtml
    + '</section>';
}

// 필터/정렬 컨트롤 바(.js-only — JS 없으면 숨김, explore.js 가 data-js="on" 시 노출).
// Data Exploration M2 — **배치는 panel-header 통합 단일 canonical**(impeccable critique +
// 사용자 확정 2026-06-26): 각 바가 자기 위험·질문 패널의 head 우측에 통합돼 컨트롤이 제어
// 대상 리스트 바로 위에 산다(scope=배치 일치). 이전 global 사이드바 배치는 scope↔placement
// 불일치(5 route 중 2개만 제어 + nav 무게감 + 키보드 탭순서 비용 + 위험·질문 옵션 결합으로
// cross-route 빈 상태)로 폐기 — dual-path 토글(MCCP_EXPLORE_CONTROL_PLACEMENT)도 제거.
// 모든 바는 scope='route'(closest('.route') 항목 대상, 패널 head 위치 무관 동일 동작).
// PRD/plan select 는 옵션 2개 미만이면 생략(단일 축은 필터 무의미). 정렬은 항상 노출.
// option label 은 normalizeProse 통과 — PRD H1 라벨이 em-dash 를 포함할 수 있고 option
// 텍스트는 attribute 가 아니라 H10/H16 carve-out 밖이므로 raw 노출 시 em-dash 위반(그룹
// summary 와 동일 정규화). value 는 머신 키(carve-out 됨)라 정규화 불요.
// 필터 option 라벨 — plain 텍스트화. <option> 텍스트는 자식 요소를 못 가지므로
// renderProseHtml(태그화)이 불가하고, escapeHtml 이 backtick 을 &#96; 로 인코딩하면
// H16 entity-backtick(unrendered marker)이 발화한다(실데이터 plan H1 에 `code` 포함
// 시). 그래서 norm 후 inline code/bold 마커를 strip 해 plain 라벨로(multi-session.js
// plainSummary 동형). snake_case 보호 위해 leftover 는 backtick/asterisk 만 제거.
function plainLabel(label, norm) {
  let t = norm ? norm(String(label)) : String(label);
  return t
    .replace(/``([^\n]+?)``/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/[`*]/g, '');
}

function buildExploreBar(opts, formatUtils) {
  opts = opts || {};
  const escapeHtml = formatUtils.escapeHtml;
  const norm = formatUtils.normalizeProse || ((s) => s);
  const scope = opts.scope === 'global' ? 'global' : 'route';
  const options = opts.options || {};
  const prds = Array.isArray(options.prds) ? options.prds : [];
  const plans = Array.isArray(options.plans) ? options.plans : [];
  const opt = (value, label, extra) => '<option value="' + escapeHtml(value) + '"'
    + (extra || '') + '>' + escapeHtml(plainLabel(label, norm)) + '</option>';
  const prdSel = prds.length >= 2
    ? '<select class="ex-select" data-axis="prd" aria-label="PRD 필터">'
      + opt('', '전체 PRD') + prds.map((o) => opt(o.key, o.label)).join('') + '</select>'
    : '';
  const planSel = plans.length >= 2
    ? '<select class="ex-select" data-axis="plan" aria-label="plan 필터">'
      + opt('', '전체 plan')
      + plans.map((o) => opt(o.key, o.label, ' data-prd="' + escapeHtml(o.prdKey || '') + '"')).join('')
      + '</select>'
    : '';
  // 필터군(PRD·plan)을 ex-filters 로 묶고 정렬은 그 뒤로 분리 — 필터와 정렬은 다른 개념
  // (Linear 패턴). 필터 옵션이 없으면(둘 다 <2) ex-filters 생략, 정렬만 노출.
  const filterGroup = (prdSel || planSel)
    ? '<div class="ex-filters">' + prdSel + planSel + '</div>'
    : '';
  // 필터군이 실재할 때만 정렬 앞 hairline 구분(필터 vs 정렬 다른 개념). 필터 옵션이 없어
  // 정렬만 노출되면 divider 불필요(구분할 군이 없음). aria-hidden — 순수 시각 구획.
  const divider = filterGroup ? '<span class="ex-divider" aria-hidden="true"></span>' : '';
  const sortSel = '<select class="ex-select ex-sort" data-axis="sort" aria-label="정렬">'
    + opt('severity', '위험도순') + opt('time', '시간순') + '</select>';
  // 초기화 — 항상 노출(현대 필터 UI 필수 affordance, 사용자 요청). 결과 수는 컨트롤 사이에
  // 텍스트로 끼우지 않고 패널 탭의 .tab-count 를 엔진이 갱신(미해결 18→8) — 컨트롤 cluster 청정.
  const reset = '<button type="button" class="explore-reset">초기화</button>';
  return '<div class="explore-bar js-only" role="group" aria-label="필터 및 정렬"'
    + ' data-explore-scope="' + escapeHtml(scope) + '">'
    + filterGroup + divider + sortSel + reset + '</div>';
}

// 섹션 → 컨트롤 바 html. 의미 있는 경우에만(li-item 2+ OR 필터 옵션 2+) emit, 그 외 ''.
function exploreBarHtml(section, scope, formatUtils) {
  if (!section || !section.filterOptions) return '';
  const opts = section.filterOptions;
  const liCount = (String(section.html || '').match(/class="li-item"/g) || []).length;
  const hasFilter = (Array.isArray(opts.prds) && opts.prds.length >= 2)
    || (Array.isArray(opts.plans) && opts.plans.length >= 2);
  if (liCount < 2 && !hasFilter) return '';
  return buildExploreBar({ scope, options: opts }, formatUtils);
}

// Data Exploration M3 — 멀티세션 진행 바(잔여 축). buildExploreBar 와 동일 chrome·토큰
// (native <select>/<button>, neutral, H3/H4) 재사용 — 진행상태/worktree 필터 + 진행순
// 정렬. data-explore-scope="session" 마커로 M2 리스트 컨트롤러와 소유권 분리(Codex
// Impl R1 IF2 — wireBar 는 :not([data-explore-scope="session"]) 만 loop). status/
// worktree select 는 옵션 2개 미만이면 생략(단일 축은 필터 무의미). 진행순 정렬은 항상.
function buildSessionBar(opts, formatUtils) {
  opts = opts || {};
  const escapeHtml = formatUtils.escapeHtml;
  const norm = formatUtils.normalizeProse || ((s) => s);
  const options = opts.options || {};
  const statuses = Array.isArray(options.statuses) ? options.statuses : [];
  const worktrees = Array.isArray(options.worktrees) ? options.worktrees : [];
  const opt = (value, label) => '<option value="' + escapeHtml(value) + '">'
    + escapeHtml(plainLabel(label, norm)) + '</option>';
  const statusSel = statuses.length >= 2
    ? '<select class="ex-select" data-axis="status" aria-label="진행상태 필터">'
      + opt('', '전체 상태') + statuses.map((o) => opt(o.key, o.label)).join('') + '</select>'
    : '';
  const wtSel = worktrees.length >= 2
    ? '<select class="ex-select" data-axis="worktree" aria-label="worktree 필터">'
      + opt('', '전체 worktree') + worktrees.map((o) => opt(o.key, o.label)).join('') + '</select>'
    : '';
  const filterGroup = (statusSel || wtSel)
    ? '<div class="ex-filters">' + statusSel + wtSel + '</div>'
    : '';
  const divider = filterGroup ? '<span class="ex-divider" aria-hidden="true"></span>' : '';
  // 정렬은 현재 진행순 단일(작업범위순은 PRD 명시 보류). 컨트롤러는 sortSel 부재 시
  // mode='progress' fallback 이라 단일 옵션이어도 행은 진행순. 작업범위순 추가 시 2옵션.
  const sortSel = '<select class="ex-select ex-sort" data-axis="sort" aria-label="정렬">'
    + opt('progress', '진행순') + '</select>';
  const reset = '<button type="button" class="explore-reset">초기화</button>';
  return '<div class="explore-bar js-only" role="group" aria-label="멀티세션 필터 및 정렬"'
    + ' data-explore-scope="session">'
    + filterGroup + divider + sortSel + reset + '</div>';
}

// 멀티세션 섹션 → 세션 바 html. 의미 있는 경우에만(status 옵션 2+ OR worktree 옵션 2+)
// emit, 그 외 ''. 2+ worktree 행이면 worktree 옵션이 2+ 라 자연히 통과(graceful-hide
// 단일 healthy worktree 는 섹션 자체가 null → filterOptions 부재 → '').
function sessionBarHtml(section, formatUtils) {
  if (!section || !section.filterOptions) return '';
  const opts = section.filterOptions;
  const hasFilter = (Array.isArray(opts.statuses) && opts.statuses.length >= 2)
    || (Array.isArray(opts.worktrees) && opts.worktrees.length >= 2);
  if (!hasFilter) return '';
  return buildSessionBar({ options: opts }, formatUtils);
}

function renderHtml(model, sections, verdict, derivedAt, formatUtils) {
  const { escapeHtml, formatRelativeTime } = formatUtils;
  const escapeAttr = formatUtils.escapeAttr || escapeHtml;
  const m = model || {};
  const [grid, pipeline, fanout, activeSessions, timeline, questions, risks, milestoneHistory, multiSession] = sections;
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, Date.now());

  const verdictAttention = verdict.tone === 'red' || verdict.tone === 'blocked';
  const gridCells = (grid && Array.isArray(grid.cells)) ? grid.cells : [];

  // Data Exploration M2 — 필터/정렬 컨트롤은 위험·질문 패널 head 에 통합(panel-header
  // canonical, 사이드바 global 배치 폐기). 각 패널이 자기 route 옵션만 소비 → 옵션 결합
  // cross-route 빈 상태 0. Dashboard Readability M2 — 그룹 chrome 평탄화 후 exploreBarRendered
  // 가 inline 엔진 emit gate(.li-item 검색 타겟 OR .explore-bar OR 세션 바)의 한 축이다.
  let exploreBarRendered = false;
  // Data Exploration M3 — 멀티세션 진행 바(잔여 축) 렌더 여부. emit gate 의 한 축.
  let sessionBarRendered = false;

  // 프로젝트명 — repo_root basename, 없으면 generic. 사이드바 스위처 + 브레드크럼.
  const projectName = (function () {
    const root = m.repo_root;
    if (typeof root === 'string' && root && root !== '<repo>') {
      const base = root.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
      if (base) return base;
    }
    return 'mccp';
  })();

  // 차단 alert — 기존 grid blocked 신호로 조건부(0 건이면 미표시). M1 은 신규
  // 추출 없이 기존 derive 신호만 wiring(상세 추출은 M2/M3).
  const blockedCell = gridCells.find(c => c.accent === 'blocked');
  const blockedCount = blockedCell ? String(blockedCell.value) : '0';
  const hasBlocked = blockedCount !== '0' && blockedCount !== '';

  // 활동·기록 page 패널 목록 — present 한 섹션만. timeline 항상 present.
  const activityPanels = [
    // 멀티세션 진행 — 5컬럼 → full-width headline(워커/최근 활동 앞). 활동 route 의
    // 진행-축 요약. present=false(graceful hide)면 filter 로 제거.
    { title: '멀티세션 진행', section: multiSession, present: !!(multiSession && multiSession.html), span2: true },
    { title: '워커', section: fanout, present: !!fanout, span2: false },
    { title: '최근 활동', section: activeSessions, present: !!activeSessions, span2: false },
    { title: '타임라인', section: timeline, present: true, span2: true },
    // 마일스톤 기록: 위험·질문 분리 후 활동 route 에서 짝 없는 단독 패널 →
    // half-orphan(오른쪽 빈칸) 방지로 full-width. 마일스톤 표도 full 이 적합.
    { title: '마일스톤 기록', section: milestoneHistory, present: !!milestoneHistory, span2: true },
  ].filter(p => p.present);

  // M3-b — 위험·질문을 전용 route 로 분리(사용자 결정 2026-06-25 "전용 사이드바").
  // nav-link 에 active count 뱃지(neutral, 0 이면 미표시). 미해결만 카운트 — 완화/해결
  // 이력은 패널 내 탭 뒤(메인 흐름 비노출). questions 없으면 nav/route 모두 생략.
  const riskActiveCount = (risks && Number.isFinite(risks.activeCount)) ? risks.activeCount : 0;
  const qActiveCount = (questions && Number.isFinite(questions.activeCount)) ? questions.activeCount : 0;
  const navCountHtml = (n) => (n > 0 ? '<span class="nav-count">' + escapeHtml(String(n)) + '</span>' : '');

  const parts = [];
  parts.push('<!doctype html>');
  parts.push('<html lang="ko">');
  parts.push('<head>');
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push('<title>mccp 상태 · ' + escapeHtml(formatUtils.normalizeProse(verdict.text)) + '</title>');
  parts.push('<style>' + FONT_FACE + OKLCH_DARK + OKLCH_LIGHT + LAYOUT + '</style>');
  parts.push('</head>');
  parts.push('<body data-stale="0" data-derived-ms="' + (Number.isFinite(derivedMs) ? derivedMs : 0) + '">');
  parts.push('<a class="skip-link" href="#main">본문 바로가기</a>');
  parts.push(ICON_SPRITE);

  // 좌측 사이드바 — 스위처 + 검색 + page nav 레일 + 차단 pin-alert.
  parts.push('<aside class="sidebar" aria-label="대시보드 탐색">');
  parts.push('<div class="switcher">'
    + '<span class="sw-mark"><svg class="i i-sm" aria-hidden="true"><use href="#ic-terminal"/></svg></span>'
    + '<span class="sw-name">' + escapeHtml(projectName) + '</span>'
    + '<span class="sw-badge">mccp</span>'
    + '<svg class="i i-sm sw-chev" aria-hidden="true"><use href="#ic-chev-d"/></svg>'
    + '</div>');
  // Data Exploration M3 — 형태만 있던 검색을 실제 input 으로 wiring(`.js-only` →
  // JS off 시 숨김). role="search" landmark + native <input type=search>(단축키 0,
  // kbd "F" 제거). <form> 은 Enter 시 native submit 하므로 explore.js 가
  // submit→preventDefault 바인딩(action/method 미지정, Codex F1). 바로 아래 sr-only
  // 전역 live-region 이 검색 결과 수를 스크린리더에 announce(빈 검색 시 빈 텍스트).
  parts.push('<form class="search js-only" role="search" aria-label="항목 검색">'
    + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-search"/></svg>'
    + '<input type="search" class="search-input" aria-label="항목 검색" placeholder="찾기…" autocomplete="off">'
    + '</form>'
    + '<p class="search-status sr-only" role="status" aria-live="polite"></p>');
  // Data Exploration M2 — 필터/정렬 바는 사이드바가 아닌 위험·질문 패널 head 에 통합
  // (panel-header canonical). 사이드바는 순수 wayfinding(스위처 · 검색 · 페이지 nav)만
  // 유지 — nav 무게감 0 + 키보드 탭순서에 필터 컨트롤 선행 안 함.
  parts.push('<p class="rail-label">페이지</p>');
  // Data Exploration M3 — nav-link 검색 매칭 슬롯(빈, JS 활성 시 컨트롤러가 해당 route
  // 가시 .li-item 수로 채움; :empty 면 미표시). neutral 토큰(.nav-count 미러).
  const navS = '<span class="nav-search-count"></span>';
  const questionsNav = questions
    ? '<a class="nav-link" data-route="questions" href="#route-questions"><svg class="i" aria-hidden="true"><use href="#ic-help"/></svg>질문' + navS + navCountHtml(qActiveCount) + '</a>'
    : '';
  parts.push('<nav class="nav-rail" aria-label="페이지">'
    + '<a class="nav-link" data-route="overview" href="#route-overview"><svg class="i" aria-hidden="true"><use href="#ic-dashboard"/></svg>대시보드' + navS + '</a>'
    + '<a class="nav-link" data-route="pipeline" href="#route-pipeline"><svg class="i" aria-hidden="true"><use href="#ic-branch"/></svg>파이프라인' + navS + '</a>'
    + '<a class="nav-link" data-route="risks" href="#route-risks"><svg class="i" aria-hidden="true"><use href="#ic-alert"/></svg>위험' + navS + navCountHtml(riskActiveCount) + '</a>'
    + questionsNav
    + '<a class="nav-link" data-route="activity" href="#route-activity"><svg class="i" aria-hidden="true"><use href="#ic-activity"/></svg>활동 · 기록' + navS + '</a>'
    + '</nav>');
  parts.push('<div class="rail-spacer"></div>');
  if (hasBlocked) {
    parts.push('<div class="pin-alert">'
      + '<div class="pa-top"><svg class="i i-sm" aria-hidden="true"><use href="#ic-alert"/></svg>차단 ' + escapeHtml(blockedCount) + '건</div>'
      + '<p class="pa-body">진행이 막힌 게이트가 있습니다. 파이프라인에서 확인하세요.</p>'
      + '<a class="pa-btn" href="#route-pipeline">파이프라인에서 보기</a>'
      + '</div>');
  }
  parts.push('</aside>');

  // 메인 컬럼 — topbar(브레드크럼 + 중앙 타이틀 + freshness) + 콘텐츠 + footer.
  parts.push('<div class="main-col">');
  parts.push('<header class="topbar">'
    + '<div class="crumb"><span class="c-mark"><svg class="i i-sm" aria-hidden="true"><use href="#ic-terminal"/></svg></span>'
    + '<b>' + escapeHtml(projectName) + '</b><span class="sep">/</span><span>상태</span></div>'
    + '<div class="tb-title-wrap" aria-hidden="true">'
    + '<span class="tb-title" data-t="overview">대시보드</span>'
    + '<span class="tb-title" data-t="pipeline">파이프라인</span>'
    + '<span class="tb-title" data-t="risks">위험</span>'
    + '<span class="tb-title" data-t="questions">질문</span>'
    + '<span class="tb-title" data-t="activity">활동 · 기록</span>'
    + '</div>'
    + '<div class="tb-right"><span class="freshness"><span class="dot" aria-hidden="true"></span>'
    + escapeHtml(relative) + ' 갱신<span class="stale-suffix">· stale</span></span></div>'
    + '</header>');

  parts.push('<main id="main" class="content" tabindex="-1">');
  if (m.masked === false) {
    parts.push('<aside role="alert" class="s-secret">⚠ raw — 절대 외부 공유 금지</aside>');
  }

  // route 1 — 대시보드: hero 패널(verdict + next-action + host-version + named-widget).
  // route id/data-route 식별자는 'overview' 불변(CSS 라우팅) — 표시 텍스트만 '대시보드'.
  parts.push('<section class="route" id="route-overview" aria-label="대시보드">'
    + renderHeroPanel(verdict, grid, projectName, escapeHtml, escapeAttr, formatUtils)
    + renderActiveMilestones(multiSession, formatUtils)
    + renderWidgetCards(grid, escapeHtml, escapeAttr, formatUtils)
    + '</section>');

  // route 2 — 파이프라인: 게이트 스테퍼 패널.
  parts.push('<section class="route" id="route-pipeline" aria-label="파이프라인">'
    + '<h2 class="page-title">파이프라인</h2>'
    + renderPanel('decision 별 게이트', pipeline, escapeHtml, { span2: true, attention: verdictAttention })
    + '</section>');

  // route 3 — 위험: 전용 route(M3-b — 미해결 질문에서 분리). 패널 내 active/완화됨 탭.
  // Data Exploration M2 — 필터/정렬 바를 위험 패널 head 에 통합(scope='route', 자기 route
  // 옵션만). exploreBarHtml 은 li-item 2+ OR 필터 옵션 2+ 일 때만 emit.
  const risksTools = exploreBarHtml(risks, 'route', formatUtils);
  if (risksTools) exploreBarRendered = true;
  parts.push('<section class="route" id="route-risks" aria-label="위험">'
    + '<h2 class="page-title">위험</h2>'
    + '<div class="panel-grid">'
    + renderPanel('위험', risks, escapeHtml, { span2: true, attention: verdictAttention, tools: risksTools })
    + '</div>'
    + '</section>');

  // route 4 — 미해결 질문: 전용 route(사용자 결정 2026-06-25 "전용 사이드바"). 결정
  // 로그는 audit 마커로 은퇴 → 미해결 탭엔 진짜 미해결만. questions 없으면 route 생략.
  if (questions) {
    const questionsTools = exploreBarHtml(questions, 'route', formatUtils);
    if (questionsTools) exploreBarRendered = true;
    parts.push('<section class="route" id="route-questions" aria-label="질문">'
      + '<h2 class="page-title">질문</h2>'
      + '<div class="panel-grid">'
      + renderPanel('질문', questions, escapeHtml, { span2: true, tools: questionsTools })
      + '</div>'
      + '</section>');
  }

  // route 5 — 활동·기록: 워커/활동/타임라인/마일스톤 패널 그리드.
  // Data Exploration M3 — 멀티세션 진행 패널 head 에 잔여-축 바(진행상태/worktree 필터
  // + 진행순 정렬) 통합. section 동일성으로 그 패널에만 부착(scope=배치 일치).
  const sessionBarTools = sessionBarHtml(multiSession, formatUtils);
  if (sessionBarTools) sessionBarRendered = true;
  const activityHtml = activityPanels
    .map(p => renderPanel(p.title, p.section, escapeHtml, {
      span2: p.span2,
      attention: p.attention,
      tools: (p.section === multiSession) ? sessionBarTools : '',
    }))
    .join('');
  parts.push('<section class="route" id="route-activity" aria-label="활동 및 기록">'
    + '<h2 class="page-title">활동 · 기록</h2>'
    + '<div class="panel-grid">' + activityHtml + '</div>'
    + '</section>');

  parts.push('</main>');
  parts.push('<footer role="contentinfo" class="page-foot mono">v1.20.14 · <code lang="en">.claude/</code> 통합 derive · derive-only · LLM-free</footer>');
  parts.push('</div>');

  // v1.18.1 M3 — 우측 상세 드로어. 섹션 details(Map)를 단일 map 으로 aggregate.
  // kind prefix(oq/risk/receipt/ms)가 cross-section 충돌을 구조적으로 차단 →
  // 단순 병합으로 충분(within-section 충돌은 addDetail 이 이미 hard-fail).
  const drawerMap = new Map();
  for (const sec of [questions, risks, timeline, milestoneHistory, multiSession]) {
    if (sec && sec.details && typeof sec.details.forEach === 'function') {
      sec.details.forEach((v, k) => { drawerMap.set(k, v); });
    }
  }
  if (drawerMap.size > 0) {
    parts.push('<dialog class="drawer" id="drawer" aria-label="상세">'
      + '<div class="drawer-head"><span class="drawer-kind" id="d-kind">상세</span>'
      + '<button class="drawer-close" type="button" aria-label="닫기">'
      + '<svg class="i" aria-hidden="true"><use href="#ic-x"/></svg></button></div>'
      + '<div class="drawer-body" id="d-body"></div></dialog>');
    // drawer-data: \uXXXX escape JSON(JSON.parse 가 복원). <script type=application/json>
    // 본문은 브라우저가 raw text 로 두므로 entity 디코딩 없음 — JSON escape 가 맞다.
    parts.push('<script type="application/json" id="drawer-data">'
      + serializeDetails(drawerMap) + '</script>');
  }

  parts.push('<script>' + STALE_SCRIPT + '</script>');
  parts.push('<script>' + COPY_SCRIPT + '</script>');
  if (drawerMap.size > 0) {
    parts.push('<script>' + DRAWER_SCRIPT + '</script>');
  }
  // Data Exploration M1/M2/M3 — PE 토대 + 필터/정렬/검색 엔진 스크립트. emit gate 는
  // 검색 타겟(문서에 .li-item 존재) OR 컨트롤 바(.explore-bar) OR 멀티세션 바가 렌더된
  // 경우. Dashboard Readability M2 — PRD 그룹 평탄화로 dead hasPrdGroups gate(now-always-
  // false) 제거; .li-item/explore-bar/session-bar 축이 wiring 유지. EXPLORE_SORT_JS(pure
  // window.__mccpExplore)를 EXPLORE_JS(DOM 엔진) *앞에* emit. 외부 src 0(H13)·network 0(H19).
  const hasSearchTargets = [risks, questions, timeline, milestoneHistory].some(
    (s) => s && typeof s.html === 'string' && s.html.includes('class="li-item"'));
  if ((hasSearchTargets || exploreBarRendered || sessionBarRendered) && EXPLORE_JS) {
    if (EXPLORE_SORT_JS) parts.push('<script>' + EXPLORE_SORT_JS + '</script>');
    parts.push('<script>' + EXPLORE_JS + '</script>');
  }
  // vendored-inline jQuery + pipeline enhancement. Only when pipeline present and
  // the vendor bundle loaded. Inline only — no external origin. Additive.
  if (pipeline && JQUERY_SLIM) {
    parts.push('<script>' + JQUERY_SLIM + '</script>');
    parts.push('<script>' + PIPELINE_SCRIPT + '</script>');
  }
  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n');
}

const TOKENS = OKLCH_DARK + OKLCH_LIGHT;

module.exports = { renderHtml, TOKENS, LAYOUT };
