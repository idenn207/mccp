'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatRelativeTime,
  formatStatusBadge,
  mask,
  escapeHtml,
  escapeAttr,
  STATUS_BADGES,
  renderProseBlockHtml,
  renderProseBlockMd,
} = require('../format-utils');

const fu = require('../format-utils');

test('formatRelativeTime — bins', () => {
  const now = 1_000_000_000_000;
  assert.equal(formatRelativeTime(new Date(now), now), '방금');
  assert.equal(formatRelativeTime(new Date(now - 30_000), now), '30초 전');
  assert.equal(formatRelativeTime(new Date(now - 5 * 60_000), now), '5분 전');
  assert.equal(formatRelativeTime(new Date(now - 3 * 3600_000), now), '3시간 전');
  assert.equal(formatRelativeTime(new Date(now - 2 * 86400_000), now), '2일 전');
});

test('formatRelativeTime — invalid + future', () => {
  assert.equal(formatRelativeTime(null), '시각 불명');
  assert.equal(formatRelativeTime('not-a-date'), '시각 불명');
  const now = 1_000_000_000_000;
  assert.equal(formatRelativeTime(new Date(now + 60_000), now), '미래');
});

// ── Dashboard Readability M2 — formatRelativeTime opt-in absoluteAfterDays (Codex F2) ──
// 양변(now/then) 모두 로컬 Date 로 포맷하므로(단일 데스크탑 사용자 로컬, PRODUCT.md 환경
// 가정) expected 도 동일 로컬 Date 메서드로 파생해 timezone-robust. 검증 핵심은 (1) >임계
// 시 '일 전' 이 아닌 절대일자 branch 진입, (2) 연도 비교 분기, (3) 경계(60/61일), (4) opts
// 미전달 byte-identical.
const _DAY = 86400_000;

test('formatRelativeTime — absoluteAfterDays opt-in: >60일 같은 연도 → M월 D일', () => {
  const now = new Date(2026, 5, 30, 12, 0, 0).getTime(); // 2026-06-30 local
  const then = now - 90 * _DAY;                          // ~2026-04 같은 연도
  const d = new Date(then);
  assert.equal(d.getFullYear(), 2026, '90일 전은 같은 연도');
  const out = formatRelativeTime(then, now, { absoluteAfterDays: 60 });
  assert.equal(out, (d.getMonth() + 1) + '월 ' + d.getDate() + '일');
  assert.ok(!/일 전$/.test(out), '절대일자라 상대 표기 미포함');
});

test('formatRelativeTime — absoluteAfterDays opt-in: 다른 연도 → YYYY년 M월 D일', () => {
  const now = new Date(2026, 5, 30, 12, 0, 0).getTime();
  const then = now - 400 * _DAY;                         // ~2025-05 다른 연도
  const d = new Date(then);
  assert.ok(d.getFullYear() < 2026, '400일 전은 다른 연도');
  const out = formatRelativeTime(then, now, { absoluteAfterDays: 60 });
  assert.equal(out, d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일');
});

test('formatRelativeTime — absoluteAfterDays 경계(60일=상대, 61일=절대)', () => {
  const now = new Date(2026, 5, 30, 12, 0, 0).getTime();
  // days=Math.floor(60) → 60 > 60 거짓 → 상대 표기 유지.
  assert.equal(formatRelativeTime(now - 60 * _DAY, now, { absoluteAfterDays: 60 }), '60일 전');
  // days=61 > 60 → 절대일자.
  const then = now - 61 * _DAY;
  const d = new Date(then);
  assert.equal(formatRelativeTime(then, now, { absoluteAfterDays: 60 }),
    (d.getMonth() + 1) + '월 ' + d.getDate() + '일');
});

test('formatRelativeTime — absoluteAfterDays 연도 경계(전년 → YYYY년 표기)', () => {
  const now = new Date(2026, 0, 5, 12, 0, 0).getTime(); // 2026-01-05 local
  const then = now - 70 * _DAY;                         // 전년(2025) 말
  const d = new Date(then);
  assert.equal(d.getFullYear(), 2025, '70일 전은 전년');
  assert.equal(formatRelativeTime(then, now, { absoluteAfterDays: 60 }),
    d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일');
});

test('formatRelativeTime — opts 미전달/비-number 시 N일 전 byte-identical(blast radius 0, Codex F2)', () => {
  const now = new Date(2026, 5, 30, 12, 0, 0).getTime();
  assert.equal(formatRelativeTime(now - 90 * _DAY, now), '90일 전');
  assert.equal(formatRelativeTime(now - 400 * _DAY, now), '400일 전');
  assert.equal(formatRelativeTime(now - 90 * _DAY, now, {}), '90일 전', 'absoluteAfterDays 부재 → 무시');
  assert.equal(formatRelativeTime(now - 90 * _DAY, now, { absoluteAfterDays: 'x' }), '90일 전',
    'absoluteAfterDays non-number → 무시(opt-in only)');
});

test('formatStatusBadge — all 9 kinds resolve', () => {
  const kinds = [
    'blocked', 'stale', 'secret-warn',
    'worker-alive', 'worker-stale',
    'terminal-ok', 'terminal-failure',
    'in-progress', 'neutral',
  ];
  for (const k of kinds) {
    const b = formatStatusBadge(k);
    assert.equal(typeof b.text, 'string');
    assert.equal(typeof b.icon, 'string');
    assert.equal(typeof b.korean, 'string');
    assert.ok(b.colorToken.startsWith('--'), 'colorToken is CSS var name');
    assert.ok(['icon', 'text', 'both'].includes(b.appliesTo));
  }
  assert.equal(formatStatusBadge('stale').appliesTo, 'icon', 'amber tokens icon-only (impeccable P1)');
  assert.equal(formatStatusBadge('worker-stale').appliesTo, 'icon');
});

test('formatStatusBadge — throw on unknown', () => {
  assert.throws(() => formatStatusBadge('not-a-kind'), /unknown kind/);
});

test('mask — passthrough when masked=true, prepend warning when masked=false', () => {
  assert.equal(mask('hello', { masked: true }), 'hello');
  assert.equal(mask('hello', { masked: false }), '⚠ raw hello');
  assert.equal(mask('hello', null), 'hello');
  assert.equal(mask(null, { masked: false }), '');
});

test('escapeHtml — 6 chars', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('a&b"c\'d`e'), 'a&amp;b&quot;c&#39;d&#96;e');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml('plain text'), 'plain text');
});

test('escapeAttr — escapeHtml + url escape', () => {
  assert.equal(escapeAttr('a b'), 'a%20b');
  assert.equal(escapeAttr('x(y)z'), 'x%28y%29z');
  assert.equal(escapeAttr('<a>'), '&lt;a&gt;');
});

test('STATUS_BADGES — Object.freeze invariant', () => {
  assert.ok(Object.isFrozen(STATUS_BADGES));
  assert.ok(Object.isFrozen(STATUS_BADGES.blocked));
});

// ── dashboard-interactivity M1 — block-level prose renderer ───────────────────

test('renderProseBlockHtml — paragraph soft break preserved as <br> + inline markers (M1.2)', () => {
  const html = renderProseBlockHtml('첫 줄 **강조** 와 `code`.\n같은 문단 둘째 줄.', fu);
  assert.equal(html,
    '<p>첫 줄 <strong>강조</strong> 와 <code>code</code>.<br>같은 문단 둘째 줄.</p>');
});

test('renderProseBlockHtml — balanced multi-line paragraph keeps <br> per soft break (M1.2)', () => {
  const html = renderProseBlockHtml('완화 단계 하나\n완화 단계 둘\n완화 단계 셋', fu);
  assert.equal(html, '<p>완화 단계 하나<br>완화 단계 둘<br>완화 단계 셋</p>');
});

test('renderProseBlockHtml — blank line separates paragraphs', () => {
  const html = renderProseBlockHtml('문단 A\n\n문단 B', fu);
  assert.equal(html, '<p>문단 A</p><p>문단 B</p>');
});

test('renderProseBlockHtml — unordered + ordered lists', () => {
  assert.equal(renderProseBlockHtml('- a\n- b `x`', fu),
    '<ul><li>a</li><li>b <code>x</code></li></ul>');
  assert.equal(renderProseBlockHtml('1. 첫째\n2. 둘째', fu),
    '<ol><li>첫째</li><li>둘째</li></ol>');
});

test('renderProseBlockHtml — fenced code is esc-only (markers NOT rendered, H16-safe)', () => {
  const html = renderProseBlockHtml('```\n**not bold** `not code`\n<script>x</script>\n```', fu);
  assert.match(html, /^<pre><code>/);
  assert.match(html, /<\/code><\/pre>$/);
  // markers stay literal-but-escaped inside code; no <strong>/<code> rendered inside
  assert.ok(html.includes('**not bold**'), 'code keeps literal asterisks');
  assert.ok(html.includes('&lt;script&gt;'), 'script escaped');
  assert.ok(!html.includes('<script>'), 'no raw script');
  assert.ok(!/<strong>/.test(html), 'no inline rendering inside fence');
});

test('renderProseBlockHtml — blockquote', () => {
  assert.equal(renderProseBlockHtml('> 인용 한 줄\n> 이어지는 줄', fu),
    '<blockquote>인용 한 줄 이어지는 줄</blockquote>');
});

test('renderProseBlockHtml — GFM table needs header+separator gate (Codex F1)', () => {
  const html = renderProseBlockHtml('| 열1 | 열2 |\n|---|---|\n| a `c` | b |', fu);
  assert.match(html, /^<table><thead><tr><th>열1<\/th><th>열2<\/th><\/tr><\/thead>/);
  assert.ok(html.includes('<td>a <code>c</code></td>'), 'table cell inline-rendered');
});

test('renderProseBlockHtml — heading is styled .d-h paragraph, no inner <strong>, no h4+ (M1.2 F1, H15)', () => {
  const html = renderProseBlockHtml('## 헤딩은 강등\n본문', fu);
  assert.ok(html.includes('<p class="d-h">헤딩은 강등</p>'), 'styled .d-h paragraph');
  assert.ok(!html.includes('<strong>헤딩은 강등</strong>'), 'no inner <strong> (CSS owns weight)');
  assert.ok(!/<h[1-6]/.test(html), 'no <hN> emitted');
});

// M1.2 Task 2 — render-then-validate gate: a soft break that orphans an inline
// marker falls back to space-join (single renderInline re-pairs across the break),
// leaving 0 raw/entity markers (Codex F-C1: parity checks miss double-backtick
// spans + md links). Balanced multi-line keeps <br> (test above).

test('renderProseBlockHtml — bold ** straddling soft break → space-join fallback, no raw ** (F2)', () => {
  const html = renderProseBlockHtml('앞 **강조가\n다음 줄** 끝', fu);
  assert.equal(html, '<p>앞 <strong>강조가 다음 줄</strong> 끝</p>');
  assert.ok(!html.includes('**'), 'no orphan ** leaked');
  assert.ok(!html.includes('<br>'), 'fallback to space-join (no <br>)');
});

test('renderProseBlockHtml — double-backtick span straddling soft break → fallback, no entity backtick leak (Codex F-C1)', () => {
  const html = renderProseBlockHtml('보세요 ``a `b`\nc d`` 끝', fu);
  assert.ok(html.includes('<code>'), 'double-backtick re-paired to <code> via fallback');
  const outsideCode = html.replace(/<code[\s\S]*?<\/code>/g, '');
  assert.ok(!outsideCode.includes('&#96;'), 'no entity backtick leaked outside <code>');
  assert.ok(!html.includes('<br>'), 'fallback to space-join (no <br>)');
});

test('renderProseBlockHtml — markdown link straddling soft break → fallback, no raw [..](..) fragment (Codex F-C1)', () => {
  const html = renderProseBlockHtml('참고 [PR\n#58](http://x) 머지', fu);
  assert.ok(!/\[[^\]]*\]\([^)]*\)/.test(html), 'no raw md-link fragment leaked');
  assert.ok(!html.includes('](http'), 'no orphan link tail');
  assert.ok(!html.includes('<br>'), 'fallback to space-join (no <br>)');
});

// review LOW#1 — __bold__ detector mirrors renderInline's boundary-less __token__
// so a straddled underscore-bold (incl. intra-word) is caught, not just \b-anchored.
test('renderProseBlockHtml — __bold__ straddling soft break → space-join fallback, no raw __ (review LOW#1)', () => {
  const html = renderProseBlockHtml('앞 __강조가\n다음 줄__ 끝', fu);
  assert.equal(html, '<p>앞 <strong>강조가 다음 줄</strong> 끝</p>');
  assert.ok(!/__/.test(html), 'no orphan __ leaked');
  assert.ok(!html.includes('<br>'), 'fallback to space-join (no <br>)');
});

// review LOW#2 — a single-backtick code span whose body holds & (esc → &amp;) used
// to defeat the [^&] entity-backtick scan; the lazy inner now re-pairs it.
test('renderProseBlockHtml — single-backtick span with & straddling soft break → fallback, no entity backtick leak (review LOW#2)', () => {
  const html = renderProseBlockHtml('보세요 `a & b\nc` 끝', fu);
  assert.ok(html.includes('<code>'), 'code span re-paired to <code> via fallback');
  const outsideCode = html.replace(/<code[\s\S]*?<\/code>/g, '');
  assert.ok(!outsideCode.includes('&#96;'), 'no entity backtick leaked outside <code>');
  assert.ok(!html.includes('<br>'), 'fallback to space-join (no <br>)');
});

test('renderProseBlockHtml — malformed table (no separator) degrades to inline <p>, no raw |-marker leak', () => {
  const html = renderProseBlockHtml('| a | b |\n| c | d |', fu);
  // header without separator → not a table → inline paragraph(s)
  assert.ok(!html.includes('<table>'), 'no table without separator row');
  assert.ok(html.startsWith('<p>'), 'degrades to paragraph');
});

test('renderProseBlockHtml — unterminated fence drops marker, body degrades to inline <p> (Codex F1)', () => {
  const html = renderProseBlockHtml('```\n안 닫힘 **payload**', fu);
  assert.ok(!html.includes('```'), 'no dangling triple-backtick');
  assert.ok(!html.includes('**payload**'), 'raw bold marker rendered, not literal (H16-safe)');
  assert.ok(html.includes('<strong>payload</strong>'), 'body inline-rendered');
});

test('renderProseBlockHtml — em-dash normalized (H10) across blocks', () => {
  const html = renderProseBlockHtml('문단 — 대시\n\n- 항목 — 대시', fu);
  assert.ok(!html.includes('—'), 'em-dash normalized to comma');
});

test('renderProseBlockHtml — MAX_BLOCKS caps emitted nodes (defense-in-depth)', () => {
  const lines = [];
  for (let i = 0; i < 500; i += 1) lines.push('문단 ' + i, '');
  const html = renderProseBlockHtml(lines.join('\n'), fu);
  const count = (html.match(/<p>/g) || []).length;
  assert.ok(count <= 200, 'block count capped at MAX_BLOCKS (got ' + count + ')');
});

test('renderProseBlockHtml — empty/null → empty string (degrade)', () => {
  assert.equal(renderProseBlockHtml('', fu), '');
  assert.equal(renderProseBlockHtml(null, fu), '');
  assert.equal(renderProseBlockHtml('   \n  ', fu), '');
});

test('renderProseBlockMd — normalizeProse only (markers preserved, em-dash normalized)', () => {
  assert.equal(renderProseBlockMd('- a\n- b `x`\n\n인용 — 대시'),
    '- a\n- b `x`\n\n인용 , 대시');
});
