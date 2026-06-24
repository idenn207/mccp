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
.search .i { color: var(--faint); }
.search .kbd { margin-left: auto; font-family: ui-monospace, monospace; font-size: 0.7rem; color: var(--faint);
  border: 1px solid var(--border-2); border-radius: 4px; padding: 0.04rem 0.32rem; }
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
.action-prompt { display: inline-flex; align-items: center; gap: 0.55rem; flex-wrap: wrap;
  margin-top: 1rem; padding: 0.4rem 0.4rem 0.4rem 0.75rem;
  background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; max-width: 100%; }
.action-prompt .lead { font-size: 0.69rem; font-weight: 600; letter-spacing: 0.04em;
  color: var(--faint); }
.action-prompt code { font-family: var(--mono); font-size: 0.8rem; color: var(--ink-2); word-break: break-all; }
.action-prompt .stale-label { color: var(--status-stale); font-weight: 500; }
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
/* ── 대시보드 hero: host-version 줄 + named-widget(진행중/차단/위험 항목 이름) ── */
.hero-version { margin: 0.85rem 0 0; font-size: 0.78rem; color: var(--muted);
  font-variant-numeric: tabular-nums; }
.hero-version .hv-source { color: var(--faint); }
.hero-widgets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem 1.6rem;
  margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.hero-widget { min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.hw-head { display: flex; align-items: center; gap: 0.45rem; font-size: 0.82rem; color: var(--muted); }
.hw-count { margin-left: 0.1rem; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.hw-count.bad { color: var(--bad); } .hw-count.warn { color: var(--warn); }
.hw-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.3rem;
  font-size: 0.8rem; color: var(--ink-2); }
.hw-list li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.hw-empty { margin: 0; font-size: 0.8rem; color: var(--faint); }
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
aside[role="alert"].s-secret {
  background: var(--status-secret); color: var(--bg);
  padding: 0.5rem; border-radius: 4px; margin-bottom: 1rem;
}
.severity-tag { display: inline-block; padding: 0 0.35em; border-radius: 3px;
  font-size: 0.8rem; font-weight: 500; }
.severity-tag.s-critical, .severity-tag.s-high { color: var(--status-blocked); font-weight: 600; }
.severity-tag.s-medium { color: var(--status-stale); font-weight: 600; }
.severity-tag.s-low { color: var(--muted); font-weight: 600; }
/* ── 미해결 질문 / 위험 (stack-list > li-item, M2 샘플 fidelity) ── */
.stack-list { display: flex; flex-direction: column; gap: 0.9rem; margin: 0; padding: 0; list-style: none; }
.li-item { display: flex; gap: 0.65rem; }
.li-main { min-width: 0; flex: 1 1 auto; }
.li-q { font-size: 0.875rem; font-weight: 450; color: var(--ink-2); line-height: 1.5; }
.li-q code { font-family: var(--mono); font-size: 0.9em; color: var(--ink); }
.li-q strong { font-weight: 650; color: var(--ink); }
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
/* v1.18.7 M4 — 메인 복사 affordance(verbose .inline-prompt 대체). 우측 정렬·여백
   quiet. icon-only(aria-label), 강조색 0(neutral .copy-btn 토큰 재사용, Constraint 2). */
.li-action { display: flex; justify-content: flex-end; margin-top: 0.5rem; }
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
.audit-gate { font-family: var(--mono); font-size: 0.79rem; color: var(--ink); flex: none; }
/* v1.18.7 M4 (진실성) — 전체 decision_id 를 CSS ellipsis 로 prefix 유지 truncate
   (.pipe-id 동형). 단어 중간 깨짐 0, 전체는 title 툴팁 + 드로어 detail 에서 확인. */
.audit-dec { font-family: var(--mono); font-size: 0.76rem; color: var(--muted);
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
.li-item.clickable, .milestone-item.clickable, .audit-row.clickable { cursor: pointer; border-radius: var(--radius-sm); }
.li-item.clickable:hover, .milestone-item.clickable:hover, .audit-row.clickable:hover { background: var(--panel-2); }
.clickable:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
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
.d-sec p { margin: 0; font-size: 0.855rem; line-height: 1.65; color: var(--ink-2); }
.d-action { margin-top: 1.3rem; }
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
  .hero-widgets { grid-template-columns: minmax(0, 1fr); }
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
  + "var KIND={oq:'미해결 질문',risk:'위험',receipt:'Receipt',ms:'마일스톤'};"
  + "function el(t,c){var e=document.createElement(t);if(c)e.className=c;return e}"
  + "function render(d){dBody.innerHTML='';"
  + "var h=el('h2','d-title');h.innerHTML=d.title||'';dBody.appendChild(h);"
  + "if(d.tags&&d.tags.length){var tw=el('div','d-tags');d.tags.forEach(function(t){var s=el('span','sev s-'+(t.tone||'low'));s.textContent=t.label||'';tw.appendChild(s)});dBody.appendChild(tw)}"
  + "if(d.rows&&d.rows.length){var dl=el('dl','d-rows');d.rows.forEach(function(r){var row=el('div'),dt=el('dt'),dd=el('dd');dt.textContent=r[0]||'';if(r[2])dd.className='mono';dd.textContent=r[1]||'';row.appendChild(dt);row.appendChild(dd);dl.appendChild(row)});dBody.appendChild(dl)}"
  + "if(d.sections&&d.sections.length){d.sections.forEach(function(s){var sec=el('section','d-sec'),h3=el('h3'),p=el('p');h3.textContent=s[0]||'';p.innerHTML=s[1]||'';sec.appendChild(h3);sec.appendChild(p);dBody.appendChild(sec)})}"
  + "if(d.action){var wrap=el('div','d-action'),ap=el('div','action-prompt'),lead=el('span','lead'),code=el('code'),btn=el('button','copy-btn');lead.textContent='다음';code.textContent=d.action;btn.type='button';btn.setAttribute('data-copy',d.action);btn.innerHTML='<svg class=\"i i-sm\" aria-hidden=\"true\"><use href=\"#ic-copy\"/></svg><span class=\"cb-label\">복사</span>';ap.appendChild(lead);ap.appendChild(code);ap.appendChild(btn);wrap.appendChild(ap);dBody.appendChild(wrap)}}"
  + "function open(id,trigger){var d=DETAILS[id];if(!d)return;lastTrigger=trigger;dKind.textContent=KIND[String(id).split(':')[0]]||'상세';render(d);dBody.scrollTop=0;if(drawer.showModal){drawer.showModal()}else{drawer.setAttribute('open','')}}"
  + "function close(){if(drawer.close){drawer.close()}else{drawer.removeAttribute('open')}}"
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
  if (/워커/.test(title)) return 'ic-worker';
  if (/활동/.test(title)) return 'ic-activity';
  return 'ic-dashboard';
}

// 개요 hero 패널 (M2 샘플 fidelity) — hero-status(tone dot+라벨) + verdict(h1) +
// action-prompt(다음 명령 복사) + axis-legend(진행/차단/다음/위험 4축 dot).
const HERO_STATUS = {
  green: { dot: 'dot-ok', label: '릴리스 준비됨' },
  red: { dot: 'dot-bad', label: '주의 필요' },
  amber: { dot: 'dot-warn', label: '진행 중' },
  neutral: { dot: 'dot-mute', label: '대기' },
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

// named-widget — label + count + top-3 항목 이름 + 나머지 접힘(카운트 아닌 '무엇').
// 강조색 viewport당 ≤1: 차단(>0)만 loud bad, 위험(>0) amber, 진행중 neutral.
// 위험 항목 텍스트(backlog finding)는 renderProseHtml(H10/H16 안전) 경유.
function heroWidget(key, cellObj, dotClass, escapeHtml, renderProseHtml, formatUtils) {
  const label = cellObj.label || key;
  const count = cellObj.value != null ? String(cellObj.value) : '0';
  const items = Array.isArray(cellObj.items) ? cellObj.items : [];
  const isRisk = key === 'risks';
  const li = (t) => '<li>' + (isRisk ? renderProseHtml(t, formatUtils) : escapeHtml(t)) + '</li>';

  let listHtml;
  if (items.length === 0) {
    listHtml = '<p class="hw-empty">없음</p>';
  } else {
    listHtml = '<ul class="hw-list">' + items.slice(0, 3).map(li).join('') + '</ul>';
    const overflow = items.length - 3;
    if (overflow > 0) {
      listHtml += '<details class="more"><summary>'
        + '<svg class="i i-sm chev" aria-hidden="true"><use href="#ic-arrow"/></svg>+'
        + overflow + ' 더보기</summary>'
        + '<ul class="hw-list">' + items.slice(3).map(li).join('') + '</ul></details>';
    }
  }

  let countClass = 'hw-count';
  if (key === 'blocked' && count !== '0') countClass += ' bad';
  else if (key === 'risks' && count !== '0') countClass += ' warn';

  return '<div class="hero-widget">'
    + '<div class="hw-head"><span class="dot ' + dotClass + '" aria-hidden="true"></span>'
    + escapeHtml(label) + ' <span class="' + countClass + '">' + escapeHtml(count) + '</span></div>'
    + listHtml + '</div>';
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
  const version = grid && grid.version;

  // next-action — executable command(복사) | stale-label | prose | 생략(idle/대기).
  let promptHtml = '';
  if (nextAction) {
    if (nextAction.executable && nextAction.copyText) {
      promptHtml = '<div class="action-prompt"><span class="lead">다음</span>'
        + '<code>' + escapeHtml(nextAction.copyText) + '</code>'
        + '<button class="copy-btn" type="button" data-copy="' + escapeHtml(nextAction.copyText) + '">'
        + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-copy"/></svg><span class="cb-label">복사</span></button>'
        + '</div>';
    } else if (nextAction.stale) {
      promptHtml = '<div class="action-prompt"><span class="lead">다음</span>'
        + '<span class="stale-label">' + escapeHtml(nextAction.prose || '미정 (stale)') + '</span></div>';
    } else if (nextAction.source !== 'idle' && nextAction.prose) {
      promptHtml = '<div class="action-prompt"><span class="lead">다음</span>'
        + '<span class="next-prose">' + renderProseHtml(nextAction.prose, formatUtils) + '</span></div>';
    }
  } else {
    // backward-compat (nextAction 없는 stub) — 기존 next cell 폴백.
    const nextCell = cell('next');
    const nextVal = nextCell.value;
    if (nextVal && nextVal !== '대기') {
      if (nextCell.stale) {
        promptHtml = '<div class="action-prompt"><span class="lead">다음</span>'
          + '<span class="stale-label">' + escapeHtml(nextVal) + '</span></div>';
      } else if (looksLikeCommand(nextVal)) {
        promptHtml = '<div class="action-prompt"><span class="lead">다음</span>'
          + '<code>' + escapeHtml(nextVal) + '</code>'
          + '<button class="copy-btn" type="button" data-copy="' + escapeHtml(nextVal) + '">'
          + '<svg class="i i-sm" aria-hidden="true"><use href="#ic-copy"/></svg><span class="cb-label">복사</span></button></div>';
      } else {
        const titleAttr = nextCell.intent ? ' title="' + escapeAttr(nextCell.intent) + '"' : '';
        promptHtml = '<div class="action-prompt"><span class="lead">다음</span>'
          + '<code' + titleAttr + '>' + escapeHtml(nextVal) + '</code></div>';
      }
    }
  }

  // host-version 줄 — <project> · vX.Y.Z · <source>. 미상이면 정직 표기(F3).
  let versionHtml = '';
  if (version && typeof version === 'object') {
    const inner = version.version
      ? escapeHtml('v' + version.version) + ' · <span class="hv-source">' + escapeHtml(heroSourceLabel(version.source)) + '</span>'
      : '<span class="hv-source">버전 미상</span>';
    versionHtml = '<p class="hero-version">' + escapeHtml(projectName || 'mccp') + ' · ' + inner + '</p>';
  }

  // named-widget 3종 — 진행중(neutral) / 차단(loud bad) / 위험(amber).
  const widgetsHtml = '<div class="hero-widgets">'
    + heroWidget('in-progress', cell('in-progress'), 'dot-accent', escapeHtml, renderProseHtml, formatUtils)
    + heroWidget('blocked', cell('blocked'), 'dot-bad', escapeHtml, renderProseHtml, formatUtils)
    + heroWidget('risks', cell('risks'), 'dot-warn', escapeHtml, renderProseHtml, formatUtils)
    + '</div>';

  return '<section class="hero-panel' + (attention ? ' attention' : '') + '" aria-label="판정">'
    + '<span class="hero-status"><span class="dot ' + status.dot + '" aria-hidden="true"></span>'
    + escapeHtml(status.label) + '</span>'
    + '<h1 class="verdict s-' + escapeHtml(verdict.tone) + '">' + safeText + '</h1>'
    + promptHtml
    + versionHtml
    + widgetsHtml
    + '</section>';
}

// 패널 — head(아이콘 + 제목 + 옵션 count) / body(섹션 inner HTML) anatomy.
// 비중첩(H17). empty-state graceful. 섹션 내부 마크업은 M2 에서 샘플 fidelity 로.
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
  return '<section class="' + cls + '" aria-label="' + escapeHtml(title) + '">'
    + '<div class="panel-head"><svg class="i" aria-hidden="true"><use href="#' + panelIcon(title) + '"/></svg>'
    + '<h3 class="panel-title">' + escapeHtml(title) + '</h3>' + countHtml + '</div>'
    + '<div class="panel-body">' + inner + '</div>'
    + footHtml
    + '</section>';
}

function renderHtml(model, sections, verdict, derivedAt, formatUtils) {
  const { escapeHtml, formatRelativeTime } = formatUtils;
  const escapeAttr = formatUtils.escapeAttr || escapeHtml;
  const m = model || {};
  const [grid, pipeline, fanout, activeSessions, timeline, questions, risks, milestoneHistory] = sections;
  const derivedMs = new Date(derivedAt).getTime();
  const relative = formatRelativeTime(derivedAt, Date.now());

  const verdictAttention = verdict.tone === 'red' || verdict.tone === 'blocked';
  const gridCells = (grid && Array.isArray(grid.cells)) ? grid.cells : [];

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
  parts.push('<div class="search" aria-hidden="true">'
    + '<svg class="i i-sm"><use href="#ic-search"/></svg>'
    + '<span>찾기…</span><span class="kbd">F</span>'
    + '</div>');
  parts.push('<p class="rail-label">페이지</p>');
  const questionsNav = questions
    ? '<a class="nav-link" data-route="questions" href="#route-questions"><svg class="i" aria-hidden="true"><use href="#ic-help"/></svg>미해결 질문' + navCountHtml(qActiveCount) + '</a>'
    : '';
  parts.push('<nav class="nav-rail" aria-label="페이지">'
    + '<a class="nav-link" data-route="overview" href="#route-overview"><svg class="i" aria-hidden="true"><use href="#ic-dashboard"/></svg>대시보드</a>'
    + '<a class="nav-link" data-route="pipeline" href="#route-pipeline"><svg class="i" aria-hidden="true"><use href="#ic-branch"/></svg>게이트 파이프라인</a>'
    + '<a class="nav-link" data-route="risks" href="#route-risks"><svg class="i" aria-hidden="true"><use href="#ic-alert"/></svg>위험' + navCountHtml(riskActiveCount) + '</a>'
    + questionsNav
    + '<a class="nav-link" data-route="activity" href="#route-activity"><svg class="i" aria-hidden="true"><use href="#ic-activity"/></svg>활동 · 기록</a>'
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
    + '<span class="tb-title" data-t="pipeline">게이트 파이프라인</span>'
    + '<span class="tb-title" data-t="risks">위험</span>'
    + '<span class="tb-title" data-t="questions">미해결 질문</span>'
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
    + '</section>');

  // route 2 — 파이프라인: 게이트 스테퍼 패널.
  parts.push('<section class="route" id="route-pipeline" aria-label="게이트 파이프라인">'
    + '<h2 class="page-title">게이트 파이프라인</h2>'
    + renderPanel('decision 별 게이트', pipeline, escapeHtml, { span2: true, attention: verdictAttention })
    + '</section>');

  // route 3 — 위험: 전용 route(M3-b — 미해결 질문에서 분리). 패널 내 active/완화됨 탭.
  parts.push('<section class="route" id="route-risks" aria-label="위험">'
    + '<h2 class="page-title">위험</h2>'
    + '<div class="panel-grid">'
    + renderPanel('위험', risks, escapeHtml, { span2: true, attention: verdictAttention })
    + '</div>'
    + '</section>');

  // route 4 — 미해결 질문: 전용 route(사용자 결정 2026-06-25 "전용 사이드바"). 결정
  // 로그는 audit 마커로 은퇴 → 미해결 탭엔 진짜 미해결만. questions 없으면 route 생략.
  if (questions) {
    parts.push('<section class="route" id="route-questions" aria-label="미해결 질문">'
      + '<h2 class="page-title">미해결 질문</h2>'
      + '<div class="panel-grid">'
      + renderPanel('미해결 질문', questions, escapeHtml, { span2: true })
      + '</div>'
      + '</section>');
  }

  // route 5 — 활동·기록: 워커/활동/타임라인/마일스톤 패널 그리드.
  const activityHtml = activityPanels
    .map(p => renderPanel(p.title, p.section, escapeHtml, { span2: p.span2, attention: p.attention }))
    .join('');
  parts.push('<section class="route" id="route-activity" aria-label="활동 및 기록">'
    + '<h2 class="page-title">활동 · 기록</h2>'
    + '<div class="panel-grid">' + activityHtml + '</div>'
    + '</section>');

  parts.push('</main>');
  parts.push('<footer role="contentinfo" class="page-foot mono">v1.18.7 · <code lang="en">.claude/</code> 통합 derive · derive-only · LLM-free</footer>');
  parts.push('</div>');

  // v1.18.1 M3 — 우측 상세 드로어. 섹션 details(Map)를 단일 map 으로 aggregate.
  // kind prefix(oq/risk/receipt/ms)가 cross-section 충돌을 구조적으로 차단 →
  // 단순 병합으로 충분(within-section 충돌은 addDetail 이 이미 hard-fail).
  const drawerMap = new Map();
  for (const sec of [questions, risks, timeline, milestoneHistory]) {
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
