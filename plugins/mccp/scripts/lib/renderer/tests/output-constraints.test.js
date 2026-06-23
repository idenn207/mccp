'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runOutputConstraints, RULES } = require('../output-constraints');
const { TOKENS, LAYOUT } = require('../html');

const BASELINE_CSS = TOKENS + LAYOUT;

// Helpers — wrap a fragment in a minimal :root + main block so H1/H2 don't
// fire as side effects in fail-fixture tests.
function withBaseline(fragment) {
  return BASELINE_CSS + '\n' + fragment;
}

// ----------------------------------------------------------------------
// Schema + framework tests (4)
// ----------------------------------------------------------------------

test('schema — runOutputConstraints returns {violations[], details[]}', () => {
  const out = runOutputConstraints({ css: '', html: '', md: '' });
  assert.ok(Array.isArray(out.violations));
  assert.ok(Array.isArray(out.details));
});

test('schema — RULES exports 17 rules H1..H17', () => {
  assert.equal(RULES.length, 17);
  const ids = RULES.map((r) => r.id);
  for (let i = 1; i <= 17; i += 1) {
    assert.ok(ids.includes('H' + i), 'missing H' + i);
  }
});

test('framework — multi-violation: all rules collected, not first-stop', () => {
  // Inject H4 + H5 + H7 + H12 violations simultaneously.
  const fragment = `
    .a { border-left: 5px solid red; }
    .b { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .c { backdrop-filter: blur(8px); }
    .sev-pill { font-size: 0.75rem; }
  `;
  const out = runOutputConstraints({ css: withBaseline(fragment), html: '', md: '' });
  assert.ok(out.violations.includes('H4'));
  assert.ok(out.violations.includes('H5'));
  assert.ok(out.violations.includes('H7'));
  assert.ok(out.violations.includes('H12'));
  // None of these should accidentally fail H1/H2 (baseline) or H10.
  assert.ok(!out.violations.includes('H1'));
  assert.ok(!out.violations.includes('H2'));
  assert.ok(!out.violations.includes('H10'));
});

test('framework — empty input yields no violations', () => {
  const out = runOutputConstraints({ css: '', html: '', md: '' });
  // H1 fires on missing --bg (we declare that as a violation, not silent pass).
  // H2 fires on missing main max-width. Both are expected on empty input.
  // Other rules should NOT fire.
  const expected = new Set(['H1', 'H2']);
  for (const v of out.violations) {
    assert.ok(expected.has(v), 'unexpected violation on empty input: ' + v);
  }
});

// ----------------------------------------------------------------------
// H1 — light mode default
// ----------------------------------------------------------------------

test('H1 — pass on m3-redux baseline (--bg lightness 0.99)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H1'));
});

test('H1 — fail when --bg lightness < 0.97', () => {
  const out = runOutputConstraints({
    css: ':root { --bg: oklch(0.16 0.008 250); } main { max-width: 720px; }',
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H1'));
});

// ----------------------------------------------------------------------
// H2 — max-width 720px
// ----------------------------------------------------------------------

test('H2 — pass on m3-redux baseline (main max-width 720px)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H2'));
});

test('H2 — fail when main max-width > 960 (redesign-3 ceiling)', () => {
  const out = runOutputConstraints({
    css: ':root { --bg: oklch(0.99 0 0); } main { max-width: 1024px; }',
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H2'));
});

// ----------------------------------------------------------------------
// H3 — no cards
// ----------------------------------------------------------------------

test('H3 — pass on m3-redux baseline (no border-radius >= 1)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H3'));
});

test('H3 — fail on border-radius injection', () => {
  // v1.16.0: .card is now a carved-out design affordance. Use a non-carved
  // selector to prove H3 still catches stray rounded chrome.
  const out = runOutputConstraints({
    css: withBaseline('.generic-box { border-radius: 8px; padding: 12px; }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H3'));
});

test('H3 — tl-node pill carved out (v1.14.0), general chrome still caught', () => {
  // .tl-node (timeline step marker) is an explicit affordance — carve-out.
  const carved = runOutputConstraints({
    css: withBaseline('.tl-node { border-radius: 999px; }'),
    html: '', md: '',
  });
  assert.ok(!carved.violations.includes('H3'), 'tl-node border-radius is carved out');
  // carve-out must stay narrow — a generic (non-card, non-affordance) box still fails.
  const general = runOutputConstraints({
    css: withBaseline('.tl-node { border-radius: 999px; } .generic-box { border-radius: 8px; }'),
    html: '', md: '',
  });
  assert.ok(general.violations.includes('H3'), 'general chrome border-radius still caught');
});

// ----------------------------------------------------------------------
// H4 — no side-stripe
// ----------------------------------------------------------------------

test('H4 — pass on m3-redux baseline (no border-left >= 2px)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H4'));
});

test('H4 — fail on border-left 3px injection', () => {
  const out = runOutputConstraints({
    css: withBaseline('.x { border-left: 3px solid red; }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H4'));
});

test('H4 — fail on box-shadow inset side-stripe', () => {
  const out = runOutputConstraints({
    css: withBaseline('.y { box-shadow: inset 4px 0 0 var(--accent); }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H4'));
});

// ----------------------------------------------------------------------
// H5 — no identical card grid
// ----------------------------------------------------------------------

test('H5 — pass on m3-redux baseline (no auto-fit grid)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H5'));
});

test('H5 — fail on grid-template-columns auto-fit minmax', () => {
  const out = runOutputConstraints({
    css: withBaseline('.grid { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H5'));
});

// ----------------------------------------------------------------------
// H6 — no hero-metric
// ----------------------------------------------------------------------

test('H6 — pass on m3-redux baseline (verdict 1.5rem allowed)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H6'));
});

test('H6 — fail on 2rem hero metric', () => {
  const out = runOutputConstraints({
    css: withBaseline('.metric { font-size: 2.5rem; font-weight: 700; }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H6'));
});

test('H6 — fail on 1.7rem creeping (carve-out enforces strict 1.5)', () => {
  const out = runOutputConstraints({
    css: withBaseline('.creep { font-size: 1.7rem; }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H6'));
});

// ----------------------------------------------------------------------
// H7 — no glassmorphism
// ----------------------------------------------------------------------

test('H7 — pass on m3-redux baseline (no backdrop-filter)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H7'));
});

test('H7 — fail on backdrop-filter blur', () => {
  const out = runOutputConstraints({
    css: withBaseline('.glass { backdrop-filter: blur(12px); }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H7'));
});

// ----------------------------------------------------------------------
// H8 — no gradient bg
// ----------------------------------------------------------------------

test('H8 — pass on m3-redux baseline (no gradient bg)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H8'));
});

test('H8 — fail on linear-gradient background', () => {
  const out = runOutputConstraints({
    css: withBaseline('.hero { background: linear-gradient(120deg, #fff, #ccc); }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H8'));
});

test('H8 — fail on radial-gradient anywhere', () => {
  const out = runOutputConstraints({
    css: withBaseline('.dot { background-image: radial-gradient(circle, red, blue); }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H8'));
});

// ----------------------------------------------------------------------
// H9 — uppercase <= 1
// ----------------------------------------------------------------------

test('H9 — pass on m3-redux baseline (0 uppercase declarations)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H9'));
});

test('H9 — pass at exactly 1 uppercase declaration', () => {
  const out = runOutputConstraints({
    css: withBaseline('.tag { text-transform: uppercase; }'),
    html: '', md: '',
  });
  assert.ok(!out.violations.includes('H9'));
});

test('H9 — fail at 2 uppercase declarations', () => {
  const out = runOutputConstraints({
    css: withBaseline(`
      .a { text-transform: uppercase; }
      .b { text-transform: uppercase; }
    `),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H9'));
});

// ----------------------------------------------------------------------
// H10 — no em dash in rendered prose
// ----------------------------------------------------------------------

test('H10 — pass on empty body', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '<html><body></body></html>', md: '' });
  assert.ok(!out.violations.includes('H10'));
});

test('H10 — fail on em-dash in html body prose', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<html><body><p>Hello — world</p></body></html>',
    md: '',
  });
  assert.ok(out.violations.includes('H10'));
});

test('H10 — pass when em-dash is inside <code>', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<html><body><p><code>node — version</code> output</p></body></html>',
    md: '',
  });
  assert.ok(!out.violations.includes('H10'));
});

test('H10 — pass when em-dash is in title attribute', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<html><body><a title="link — see docs">link</a></body></html>',
    md: '',
  });
  assert.ok(!out.violations.includes('H10'));
});

test('H10 — fail on em-dash in markdown prose', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '',
    md: 'Status — all good',
  });
  assert.ok(out.violations.includes('H10'));
});

test('H10 — pass when em-dash is in markdown fenced code block', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '',
    md: 'Run this:\n```bash\nnode — version\n```\n',
  });
  assert.ok(!out.violations.includes('H10'));
});

// ----------------------------------------------------------------------
// H11 — severity <= 3 tokens
// ----------------------------------------------------------------------

test('H11 — pass on m3-redux baseline (0 --sev-* tokens)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H11'));
});

test('H11 — pass at exactly 3 --sev-* tokens', () => {
  const out = runOutputConstraints({
    css: withBaseline(`
      :root { --sev-low: red; --sev-mid: amber; --sev-high: green; }
    `),
    html: '', md: '',
  });
  assert.ok(!out.violations.includes('H11'));
});

test('H11 — fail at 4 --sev-* tokens', () => {
  const out = runOutputConstraints({
    css: withBaseline(`
      :root { --sev-low: red; --sev-mid: amber; --sev-high: green; --sev-info: blue; }
    `),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H11'));
});

// ----------------------------------------------------------------------
// H12 — no sev-pill
// ----------------------------------------------------------------------

test('H12 — pass on m3-redux baseline (no .sev-pill)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H12'));
});

test('H12 — fail on .sev-pill class declaration', () => {
  const out = runOutputConstraints({
    css: withBaseline('.sev-pill { padding: 2px 6px; }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H12'));
});

// ----------------------------------------------------------------------
// H13 — no custom font
// ----------------------------------------------------------------------

test('H13 — pass on m3-redux baseline (system font stack)', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '', md: '' });
  assert.ok(!out.violations.includes('H13'));
});

test('H13 — fail on Inter font-family', () => {
  const out = runOutputConstraints({
    css: withBaseline('body { font-family: Inter, sans-serif; }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H13'));
});

test('H13 — fail on Pretendard font-family', () => {
  const out = runOutputConstraints({
    css: withBaseline('body { font-family: "Pretendard", sans-serif; }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H13'));
});

test('H13 — fail on JetBrains Mono in code', () => {
  const out = runOutputConstraints({
    css: withBaseline('code { font-family: "JetBrains Mono", monospace; }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H13'));
});

// ----------------------------------------------------------------------
// H14 — verdict prose (not raw slug)
// ----------------------------------------------------------------------

test('H14 — pass when no verdict h1 present', () => {
  const out = runOutputConstraints({ css: BASELINE_CSS, html: '<html><body></body></html>', md: '' });
  assert.ok(!out.violations.includes('H14'));
});

test('H14 — pass when verdict text is PM-voice sentence', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<html><body><h1 class="verdict s-green"><span class="v-icon">✓</span>모든 게이트 통과, 다음: M4</h1></body></html>',
    md: '',
  });
  assert.ok(!out.violations.includes('H14'));
});

test('H14 — fail when verdict text is raw slug only', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<html><body><h1 class="verdict s-red"><span class="v-icon">⚠</span>v1.3.0-m3</h1></body></html>',
    md: '',
  });
  assert.ok(out.violations.includes('H14'));
});

// ----------------------------------------------------------------------
// H15 — heading depth (m3 follow-up: PRD §Design Direction line 149 (a))
// ----------------------------------------------------------------------

test('H15 — pass on m3-redux baseline (h1+h2+h3 only)', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<body><h1>x</h1><h2>y</h2><h3>z</h3></body>',
    md: '# x\n## y\n### z\n',
  });
  assert.ok(!out.violations.includes('H15'));
});

test('H15 — fail when <h4> appears in HTML body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<body><h1>x</h1><h4>y</h4></body>',
    md: '',
  });
  assert.ok(out.violations.includes('H15'));
});

test('H15 — fail when ^#### appears in markdown', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '',
    md: '# x\n## y\n#### z\n',
  });
  assert.ok(out.violations.includes('H15'));
});

// Codex F2 (plan) absorption: indented ATX heading (CommonMark allows 0-3 leading spaces)
test('H15 — fail when indented #### appears in markdown (CommonMark ATX)', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '', md: '# x\n   #### indented drift\n',
  });
  assert.ok(out.violations.includes('H15'));
});

// Codex F2 (plan) absorption: triple-backtick fenced code containing #### must NOT trigger
test('H15 — pass when #### appears inside backtick fenced code block', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '',
    md: '# x\n```md\n#### example only\n```\n',
  });
  assert.ok(!out.violations.includes('H15'));
});

// Codex F2 (implement) absorption: tilde fenced code containing #### must NOT trigger
test('H15 — pass when #### appears inside tilde fenced code block', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '',
    md: '# x\n~~~md\n#### example only\n~~~\n',
  });
  assert.ok(!out.violations.includes('H15'));
});

// ----------------------------------------------------------------------
// H16 — unrendered markdown literal (m3 follow-up: PRD §Design Direction line 149 (c))
// ----------------------------------------------------------------------

test('H16 — pass on m3-redux baseline (no unrendered markers)', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<body><strong>x</strong> <code>**literal**</code></body>',
    md: '',
  });
  assert.ok(!out.violations.includes('H16'));
});

test('H16 — fail when **bold** literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see **important** note</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

test('H16 — fail when __bold__ literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see __important__ note</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

test('H16 — fail when markdown link literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>read [docs](https://example.com)</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

test('H16 — fail when MD0xx markdownlint code in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>fix MD025 in heading</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

test('H16 — carve-out: literal inside <code> does not trigger', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<body>example: <code>**bold**</code> here</body>',
    md: '',
  });
  assert.ok(!out.violations.includes('H16'));
});

// Codex F1 (plan) absorption: raw inline backtick pairs must fire H16
test('H16 — fail when raw inline backtick `foo` literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see `foo` inline</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

// Codex F1 (plan) absorption: entity-encoded backticks must fire H16
test('H16 — fail when entity-encoded &#96;foo&#96; literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see &#96;foo&#96; inline</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

test('H16 — fail when hex entity &#x60;foo&#x60; literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see &#x60;foo&#x60; inline</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

// Codex F4 (implement) absorption: leading-zero entity variants
test('H16 — fail when leading-zero entity &#096;foo&#096; literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see &#096;foo&#096; inline</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

// Codex F4 (implement) absorption: uppercase hex entity variants
test('H16 — fail when uppercase hex entity &#X60;foo&#X60; literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see &#X60;foo&#X60; inline</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

// Codex F4 (implement) absorption: named entity backtick
test('H16 — fail when named entity &grave;foo&grave; literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see &grave;foo&grave; inline</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

// Codex F4 (implement) absorption: entity-encoded asterisk pair (bypass of raw **)
test('H16 — fail when entity-asterisk pair &ast;&ast;bold&ast;&ast; literal in body', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see &ast;&ast;bold&ast;&ast; here</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

// Codex F3 (plan + implement) absorption: Python dunder identifiers strict pass
test('H16 — Python dunder __init__ does NOT trigger (strict assertion)', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>Python __init__ constructor</body>', md: '',
  });
  assert.ok(!out.violations.includes('H16'));
});

test('H16 — Python dunder __name__ / __main__ do NOT trigger', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>__name__ == __main__</body>', md: '',
  });
  assert.ok(!out.violations.includes('H16'));
});

// Codex F3 (implement) absorption: expanded dunders (__all__, __slots__, __dict__) present in repo skill docs
test('H16 — Python dunder __all__ / __slots__ / __dict__ do NOT trigger (expanded whitelist)', () => {
  const out1 = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>module exports __all__</body>', md: '',
  });
  assert.ok(!out1.violations.includes('H16'));
  const out2 = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>class uses __slots__</body>', md: '',
  });
  assert.ok(!out2.violations.includes('H16'));
  const out3 = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>instance.__dict__ holds attrs</body>', md: '',
  });
  assert.ok(!out3.violations.includes('H16'));
});

test('H16 — non-dunder __custom__ still triggers (whitelist is narrow)', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS, html: '<body>see __custom__ marker in body</body>', md: '',
  });
  assert.ok(out.violations.includes('H16'));
});

test('H16 — false-positive guard: <pre> 안의 marker는 trigger 안 됨', () => {
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<body><pre>some **bold** and [link](url)</pre></body>',
    md: '',
  });
  assert.ok(!out.violations.includes('H16'));
});

// ----------------------------------------------------------------------
// v1.13.0 — pipeline carve-out + <script> strip
// ----------------------------------------------------------------------

test('H3 — pipe-node pill carve-out passes (v1.13.0)', () => {
  const out = runOutputConstraints({
    css: withBaseline('.pipe-node { border-radius: 999px; background: var(--surface); }'),
    html: '', md: '',
  });
  assert.ok(!out.violations.includes('H3'), 'pipe-node border-radius is carved out');
});

test('H3 — general layout chrome border-radius still caught (carve-out is narrow)', () => {
  const out = runOutputConstraints({
    css: withBaseline('.some-card { border-radius: 8px; }'),
    html: '', md: '',
  });
  assert.ok(out.violations.includes('H3'), 'non-carved border-radius still fails');
});

test('H10/H16 — inline <script> content is stripped (vendored jQuery, v1.13.0)', () => {
  // Minified JS legitimately contains em-dash-like and **/[x](y) byte sequences;
  // it is not rendered prose, so it must not trip H10/H16.
  const script = '<script>var a="x — y";function f(){return "**b** [c](d)"}</script>';
  const out = runOutputConstraints({
    css: BASELINE_CSS,
    html: '<body><h2>게이트 파이프라인</h2>' + script + '</body>',
    md: '',
  });
  assert.ok(!out.violations.includes('H10'), 'script em-dash not counted');
  assert.ok(!out.violations.includes('H16'), 'script markdown markers not counted');
});

// ----------------------------------------------------------------------
// H17 — no nested cards (v1.16.0, Codex R1 F2 absorption — DOM-aware)
// ----------------------------------------------------------------------

test('H17 — pass on flat sibling cards', () => {
  const html = '<body>'
    + '<section id="a" class="card"><h2>A</h2><p>x</p></section>'
    + '<section id="b" class="card"><h2>B</h2><p>y</p></section>'
    + '</body>';
  const out = runOutputConstraints({ css: BASELINE_CSS, html, md: '' });
  assert.ok(!out.violations.includes('H17'), 'flat sibling cards are allowed');
});

test('H17 — fail on card nested inside card', () => {
  const html = '<body><section class="card"><div class="card">nested</div></section></body>';
  const out = runOutputConstraints({ css: '', html, md: '' });
  assert.ok(out.violations.includes('H17'), 'card-in-card must fail');
});

test('H17 — catches non-section card wrappers (div/article)', () => {
  const html = '<body><article class="panel card"><aside class="card">x</aside></article></body>';
  const out = runOutputConstraints({ css: '', html, md: '' });
  assert.ok(out.violations.includes('H17'), 'div/article/aside card nesting caught');
});

test('H17 — non-card nesting inside a card is fine', () => {
  const html = '<body><section class="card"><ul><li>x</li></ul><table><tr><td>y</td></tr></table></section></body>';
  const out = runOutputConstraints({ css: BASELINE_CSS, html, md: '' });
  assert.ok(!out.violations.includes('H17'), 'plain content inside a card is allowed');
});

test('H17 — actual renderer output has no nested cards', () => {
  const { renderStatus } = require('../index');
  const model = {
    derived_at: new Date().toISOString(), masked: true,
    m0_capability: { contract_present: true }, warnings: [],
    sources: {
      plans: { count: 0, items: [] }, receipts: { count: 0, items: [] },
      state: { item: { resume_state: 'idle', body: {}, frontmatter: {} } },
      backlog: { count: 0, items: [] }, fix_task: { item: null }, pr: { item: null },
      envelopes: { count: 0, items: [] },
    },
    correlations: [],
  };
  const r = renderStatus(model, { snapshotsDir: null });
  assert.ok(!r.design_constraint_violations.includes('H17'));
});
