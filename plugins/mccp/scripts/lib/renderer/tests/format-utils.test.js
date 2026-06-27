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

test('renderProseBlockHtml — paragraph(soft-join) + inline markers via renderInline', () => {
  const html = renderProseBlockHtml('첫 줄 **강조** 와 `code`.\n같은 문단 둘째 줄.', fu);
  assert.equal(html,
    '<p>첫 줄 <strong>강조</strong> 와 <code>code</code>. 같은 문단 둘째 줄.</p>');
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

test('renderProseBlockHtml — heading flattened to <strong> (H15: no h4+)', () => {
  const html = renderProseBlockHtml('## 헤딩은 강등\n본문', fu);
  assert.ok(html.includes('<p class="d-h"><strong>헤딩은 강등</strong></p>'));
  assert.ok(!/<h[1-6]/.test(html), 'no <hN> emitted');
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
