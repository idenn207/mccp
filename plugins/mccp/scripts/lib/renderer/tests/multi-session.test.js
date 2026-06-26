'use strict';

// dashboard-multi-session M2 — 멀티세션 진행 섹션 acceptance gate.
// (a)(b) graceful hide(scan off / healthy single)
// (c)(d) 2+ table + self 마커
// (e)(f) 상태 kind(차단 강조 / degraded 행 보존)
// (g)(h)(i) 드로어 detail / escape / masked path verbatim
// (j) STATUS.md md ↔ html 정보 동등
// (k) Codex Plan-F1 — 0-item degraded scan notice
// (l) Codex Impl-F1 — unhealthy single 렌더 / healthy single hide
// (m) Codex Impl-F2 — per-worktree scrubbed error surface
// (n) Codex Impl-F3 — 동일 masked basename ordinal-keyed 충돌 0

const test = require('node:test');
const assert = require('node:assert');

const formatUtils = require('../format-utils');
const { renderMultiSession, worktreeStatusKind } = require('../sections/multi-session');

const NOW = 1700000000000;

function wtModel(over) {
  return { sources: { worktrees: Object.assign({ scanned: true }, over) } };
}

function item(over) {
  return Object.assign({
    path: '/repo', branch: 'main', head: 'abcdef1234567', detached: false,
    is_self: false, is_main: false, milestone_hint: null, current_gate: null,
    gate_converged: null, receipts: 0, last_activity: null, has_signal: false,
    active: false, blocked: false, blocked_reason: null, degraded: false, error: null,
  }, over);
}

function render(model) { return renderMultiSession(model, formatUtils, { now: NOW }); }

// ── (a) scan off / 소스 부재 ──────────────────────────────────────────────────

test('(a) worktrees 소스 없음 / scanned:false → null', () => {
  assert.equal(render({ sources: {} }), null);
  assert.equal(render({ sources: { worktrees: { scanned: false, count: 3, items: [item(), item()] } } }), null);
});

// ── (b) healthy single → graceful hide ───────────────────────────────────────

test('(b) scanned:true 단일 healthy worktree → null (graceful hide)', () => {
  const r = render(wtModel({ count: 1, items: [item({ is_self: true, active: true })] }));
  assert.equal(r, null);
});

// ── (c) 2+ → 5컬럼 테이블 ─────────────────────────────────────────────────────

test('(c) 2+ worktree → md+html 5컬럼 테이블', () => {
  const r = render(wtModel({ count: 2, items: [
    item({ path: '/repo', is_self: true, active: true, milestone_hint: 'M2' }),
    item({ path: '<outside-repo:other>', branch: 'feat-x', active: true }),
  ] }));
  assert.ok(r && r.md && r.html);
  assert.match(r.md, /\| worktree \| 브랜치 \| 진행 \| 상태 \| 활동 \|/);
  assert.match(r.html, /<table class="multi-session">/);
  // 5 th
  const ths = (r.html.match(/<th>/g) || []).length;
  assert.equal(ths, 5);
  // 2 body 행 (각 행 worktree 셀에 data-detail-id — thead 제외 정확)
  assert.equal((r.html.match(/data-detail-id="/g) || []).length, 2);
});

// ── (d) self 마커 정확히 1 ────────────────────────────────────────────────────

test('(d) is_self → tr.self + "이 worktree" 정확히 1', () => {
  const r = render(wtModel({ count: 3, items: [
    item({ path: '/repo', is_self: true, active: true }),
    item({ path: '<outside-repo:a>', active: true }),
    item({ path: '<outside-repo:b>', active: true }),
  ] }));
  assert.equal((r.html.match(/<tr class="self"[ >]/g) || []).length, 1);
  assert.equal((r.html.match(/<strong>이 worktree<\/strong>/g) || []).length, 1);
  assert.equal((r.md.match(/\*\*이 worktree\*\*/g) || []).length, 2); // md row + inline detail header
});

// ── (e) blocked 강조 ──────────────────────────────────────────────────────────

test('(e) blocked item → s-blocked + 🚫 차단됨 + blocked_reason 노출', () => {
  const r = render(wtModel({ count: 2, items: [
    item({ path: '/repo', is_self: true, active: true }),
    item({ path: '<outside-repo:x>', blocked: true, blocked_reason: 'fix-task.md present' }),
  ] }));
  assert.equal(worktreeStatusKind({ blocked: true }), 'blocked');
  assert.match(r.html, /<span class="s-blocked">🚫 차단됨<\/span>/);
  assert.ok(r.html.includes('fix-task.md present'), 'blocked_reason in progress cell');
  assert.ok(r.md.includes('fix-task.md present'));
});

// ── (f) degraded 행 보존 ──────────────────────────────────────────────────────

test('(f) degraded(state-unparseable) row in 2+ scan → s-stale + ⚠ 오류, 행 보존(드롭 아님)', () => {
  const r = render(wtModel({ count: 2, degraded: true, items: [
    item({ path: '/repo', is_self: true, active: true }),
    item({ path: '<outside-repo:bad>', degraded: true, blocked_reason: 'state-unparseable' }),
  ] }));
  assert.equal(worktreeStatusKind({ degraded: true }), 'degraded');
  assert.match(r.html, /<span class="s-stale">⚠ 오류<\/span>/);
  // 행 보존: 2 body 행 그대로(드롭 아님)
  assert.equal((r.html.match(/data-detail-id="/g) || []).length, 2);
});

// ── (g) 드로어 detail ─────────────────────────────────────────────────────────

test('(g) 드로어 detail Map size·키 wt:<ordinal>:<path>·data-detail-id', () => {
  const r = render(wtModel({ count: 2, items: [
    item({ path: '/repo', is_self: true, active: true }),
    item({ path: '<outside-repo:o>', active: true }),
  ] }));
  assert.ok(r.details instanceof Map);
  assert.equal(r.details.size, 2);
  assert.deepEqual([...r.details.keys()], ['wt:0:/repo', 'wt:1:<outside-repo:o>']);
  assert.equal((r.html.match(/data-detail-id="/g) || []).length, 2);
});

// ── (h) escape ────────────────────────────────────────────────────────────────

test('(h) 브랜치/경로 <> escape (html)', () => {
  const r = render(wtModel({ count: 2, items: [
    item({ path: '/repo', is_self: true, active: true }),
    item({ path: '<outside-repo:x>', branch: 'feat<script>', active: true }),
  ] }));
  assert.ok(r.html.includes('feat&lt;script&gt;'), 'branch escaped');
  assert.ok(!r.html.includes('feat<script>'), 'no raw branch injection');
  assert.ok(r.html.includes('&lt;outside-repo:x&gt;'), 'path escaped in html');
});

// ── (i) masked path verbatim (재마스킹 0) ────────────────────────────────────

test('(i) masked path <outside-repo:…> verbatim 렌더(섹션 재마스킹 0)', () => {
  const r = render(wtModel({ count: 2, items: [
    item({ path: '/repo', is_self: true, active: true }),
    item({ path: '<outside-repo:sibling>', active: true }),
  ] }));
  // md 는 verbatim, 재마스킹·변형 0
  assert.ok(r.md.includes('<outside-repo:sibling>'), 'masked path verbatim in md');
  assert.ok(r.md.includes('`<outside-repo:sibling>`'), 'detail 경로 row mono verbatim');
});

// ── (j) STATUS.md md ↔ html 정보 동등 ────────────────────────────────────────

test('(j) 드로어 detail 각 row 값이 md 에 정보 동등(진행/차단 사유 누락 0)', () => {
  const r = render(wtModel({ count: 2, items: [
    item({ path: '/repo', is_self: true, active: true, milestone_hint: 'M2 멀티세션 섹션',
      current_gate: 'mccp-implement-codex', gate_converged: true, receipts: 7,
      last_activity: new Date(NOW - 60000).toISOString() }),
    item({ path: '<outside-repo:b>', branch: 'feat-y', blocked: true,
      blocked_reason: 'gate mccp-pr-codex not converged' }),
  ] }));
  for (const detail of r.details.values()) {
    for (const row of (detail.rows || [])) {
      if (!Array.isArray(row) || row.length < 2 || row[1] == null) continue;
      const val = String(row[1]);
      if (val.length < 2) continue;
      assert.ok(r.md.includes(val), 'detail row 값 "' + val + '" md 에 부재 (정보 손실)');
    }
  }
});

// ── (k) Codex Plan-F1 — 0-item degraded scan notice ──────────────────────────

test('(k) scanned:true degraded count:0 error → null 아님, scrubbed error notice', () => {
  const r = render(wtModel({ count: 0, items: [], degraded: true,
    error: '<outside-repo:x> ENOENT git worktree list' }));
  assert.notEqual(r, null);
  assert.ok(r.md.includes('<outside-repo:x> ENOENT'), 'scrubbed error in md notice');
  assert.ok(r.html.includes('s-stale'), 'degraded notice uses s-stale');
  assert.ok(!r.html.includes('<table'), 'notice 는 테이블 아님');
  // 대비: 정상 0-item → null
  assert.equal(render(wtModel({ count: 0, items: [], degraded: false, error: null })), null);
});

// ── (l) Codex Impl-F1 — unhealthy single 렌더 / healthy single hide ──────────

test('(l) 단일 degraded/blocked self → null 아님(1행 테이블 loud); healthy single → null', () => {
  // degraded single (self STATE 손상)
  const rDeg = render(wtModel({ count: 1, degraded: true, items: [
    item({ path: '/repo', is_self: true, degraded: true, blocked_reason: 'state-unparseable' }),
  ] }));
  assert.notEqual(rDeg, null);
  assert.match(rDeg.html, /<table class="multi-session">/);
  assert.equal((rDeg.html.match(/data-detail-id="/g) || []).length, 1);
  assert.match(rDeg.html, /<span class="s-stale">⚠ 오류<\/span>/);
  // blocked single
  const rBlk = render(wtModel({ count: 1, items: [
    item({ path: '/repo', is_self: true, blocked: true, blocked_reason: 'fix-task.md present' }),
  ] }));
  assert.notEqual(rBlk, null);
  assert.match(rBlk.html, /<span class="s-blocked">🚫 차단됨<\/span>/);
  // healthy single → null (대비)
  assert.equal(render(wtModel({ count: 1, items: [item({ is_self: true, active: true })] })), null);
});

// ── (m) Codex Impl-F2 — per-worktree scrubbed error surface ──────────────────

test('(m) degraded item error → 진행셀/드로어/STATUS.md 에 scrubbed error 노출(generic collapse 금지)', () => {
  const errText = '<outside-repo:x> EACCES open STATE.md';
  const r = render(wtModel({ count: 2, degraded: true, items: [
    item({ path: '/repo', is_self: true, active: true }),
    item({ path: '<outside-repo:x>', degraded: true, error: errText }),
  ] }));
  // 진행 셀(테이블)
  assert.ok(r.html.includes(errText.replace(/</g, '&lt;').replace(/>/g, '&gt;')), 'error in html progress cell (escaped)');
  // STATUS.md md (drawer detail 오류 row 인라인)
  assert.ok(r.md.includes(errText), 'error verbatim in md');
  // 드로어 detail 오류 row 존재
  const detail = [...r.details.values()].find((d) => d.rows.some((row) => row[0] === '오류'));
  assert.ok(detail, '오류 row present in detail');
  assert.ok(detail.rows.some((row) => row[0] === '오류' && String(row[1]).includes('EACCES')));
});

// ── (n) Codex Impl-F3 — 동일 masked basename ordinal-keyed 충돌 0 ────────────

test('(n) 동일 masked basename 2 worktree → detail Map size=2 (충돌 0), 키 ordinal 구분', () => {
  const r = render(wtModel({ count: 2, items: [
    item({ path: '<outside-repo:foo>', branch: 'a', active: true }),
    item({ path: '<outside-repo:foo>', branch: 'b', active: true }),
  ] }));
  assert.equal(r.details.size, 2, '동일 basename 도 충돌 없이 2 detail');
  assert.deepEqual([...r.details.keys()], ['wt:0:<outside-repo:foo>', 'wt:1:<outside-repo:foo>']);
  // data-detail-id 2개 distinct
  const ids = (r.html.match(/data-detail-id="([^"]+)"/g) || []);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
});

// ── (o) Output Constraint ③ — 진행 셀 plain 요약(raw 누출 0) + 드로어 서식 보존 ──

test('(o) 진행 셀 milestone_hint 마커 strip plain(raw 누출 0); 드로어 detail 서식 보존', () => {
  const r = render(wtModel({ count: 2, items: [
    item({ path: '/repo', is_self: true, active: true, milestone_hint: 'M2 **굵게** 와 `코드` 마커' }),
    item({ path: '<outside-repo:o>', active: true, milestone_hint: '평문' }),
  ] }));
  // 진행 셀(테이블 html): 마커 strip plain — raw ** / 백틱 누출 0, 텍스트 보존
  assert.ok(!/\*\*/.test(r.html), '진행 셀 raw ** 누출 0');
  assert.ok(!r.html.includes('`'), '진행 셀 raw 백틱 누출 0');
  assert.ok(r.html.includes('굵게') && r.html.includes('코드'), '텍스트 보존(plain)');
  // 드로어 detail 진행 섹션: renderProseHtml 서식 보존(<strong>/<code>)
  const proseDetail = [...r.details.values()].find((d) => d.sections);
  const proseHtml = proseDetail.sections[0][1];
  assert.ok(/<strong>굵게<\/strong>/.test(proseHtml), '드로어 bold 보존');
  assert.ok(/<code>코드<\/code>/.test(proseHtml), '드로어 code 보존');
  // 드로어 detail md(full prose)는 raw 마커 보존(markdown 표면)
  assert.ok(r.md.includes('**굵게**'), 'md 드로어 진행 섹션 raw 마커 보존(valid markdown)');
});

// ── (p) self path='.' → trailing dot 없음(이 worktree 마커만) ──────────────────

test('(p) self path="." → dangling dot 없음(이 worktree 마커만)', () => {
  const r = render(wtModel({ count: 2, items: [
    item({ path: '.', branch: 'feat-self', is_self: true, active: true }),
    item({ path: '<outside-repo:o>', active: true }),
  ] }));
  assert.ok(!/이 worktree<\/strong> \./.test(r.html), 'html dangling dot 없음');
  assert.ok(!/\*\*이 worktree\*\* \./.test(r.md), 'md dangling dot 없음');
  assert.match(r.html, /<strong>이 worktree<\/strong>/); // 마커는 존재
});

// ── (q) Codex H1 — bold 마커가 truncate(48) 경계 넘는 hint → raw ** 누출 0 ──────

test('(q) bold 마커가 truncate 경계 넘는 긴 hint → 진행 셀 html raw ** 누출 0', () => {
  const longBold = '**아주 길고 긴 굵은 강조 텍스트가 사십팔자 제한을 확실히 넘어가도록 더 길게 작성된다 정말로**';
  const r = render(wtModel({ count: 2, items: [
    item({ path: '/repo', is_self: true, active: true, milestone_hint: longBold }),
    item({ path: '<outside-repo:o>', active: true }),
  ] }));
  assert.ok(!/\*\*/.test(r.html), '진행 셀 html 에 raw ** 누출 0(truncate 가 페어 분리해도)');
});

// ── status kind oracle 우선순위 ──────────────────────────────────────────────

test('worktreeStatusKind 우선순위 blocked > degraded > active > idle', () => {
  assert.equal(worktreeStatusKind({ blocked: true, degraded: true, active: true }), 'blocked');
  assert.equal(worktreeStatusKind({ degraded: true, active: true }), 'degraded');
  assert.equal(worktreeStatusKind({ error: 'x', active: true }), 'degraded');
  assert.equal(worktreeStatusKind({ active: true }), 'active');
  assert.equal(worktreeStatusKind({}), 'idle');
  assert.equal(worktreeStatusKind(null), 'idle');
});

// ── (r) 상태·활동 컬럼 nowrap CSS — 좁은 컬럼 공백 줄바꿈 방지(영역 확보) ────────

test('(r) 상태(4)·활동(5) 컬럼 nowrap CSS 존재', () => {
  const { LAYOUT } = require('../html');
  assert.match(LAYOUT, /\.multi-session td:nth-child\(4\)/);
  assert.match(LAYOUT,
    /\.multi-session td:nth-child\(5\),\s*\.multi-session th:nth-child\(5\)\s*\{\s*white-space:\s*nowrap/);
});
