'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');
const fu = require('../format-utils');

test('escape — briefing_summary script injection neutralized in HTML', () => {
  const now = Date.now();
  const r = renderStatus({
    sources: {
      receipts: {
        items: [{
          gate_id: 'g', decision_id: 'd', converged: true,
          created_at: new Date(now - 60_000).toISOString(),
          briefing_summary: '<script>alert(1)</script>',
          briefing_token_count: 1,
        }],
      },
    },
  });
  assert.ok(!r.html.includes('<script>alert'), 'script tag must not appear raw');
  assert.match(r.html, /&lt;script&gt;/);
});

test('escape — envelope path containing markup neutralized', () => {
  const r = renderStatus({
    sources: {
      envelopes: {
        count: 1,
        items: [{ ok: false, path: 'a"><script>x</script>', error: 'bad' }],
      },
    },
  });
  assert.ok(!r.html.includes('<script>x'), 'embedded script in path neutralized');
});

test('escape — open-question text with onerror payload neutralized', () => {
  const r = renderStatus({
    sources: {
      state: { item: { body: { open_questions: ['<img onerror="alert(2)">'] } } },
    },
  });
  assert.ok(!r.html.includes('<img onerror'), 'onerror attribute must not appear raw');
  assert.match(r.html, /&lt;img onerror/);
});

test('escape — risk mitigation backtick payload neutralized', () => {
  const model = {
    sources: {
      plans: { items: [{ path: 'p.plan.md', source_prd: 'prd.md' }] },
    },
  };
  const r = renderStatus(model, {
    cwd: '/test',
    fsRead: (p) => {
      if (p.endsWith('prd.md')) {
        return '## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n| 0 | x | y | in-progress | [p.plan.md](p.plan.md) |\n';
      }
      if (p.endsWith('p.plan.md')) {
        return '## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| r1 | High | High | `injection-payload` |\n';
      }
      throw new Error('ENOENT ' + p);
    },
  });
  assert.match(r.html, /injection-payload/);
  assert.ok(!r.html.includes('`injection-payload`'), 'backtick must be escaped');
});

// ── dashboard-interactivity M1 — block-level prose self-injection guards ───────
// renderProseBlockHtml lifts the drawer prose from inline-only to block-level; every
// block path (list / fence / table cell / blockquote) must still terminate in the
// escape-then-render SSoT so a payload in any block vector cannot break out.

test('escape — block list item with <script> payload neutralized', () => {
  const html = fu.renderProseBlockHtml('- 정상 항목\n- <script>alert(1)</script>', fu);
  assert.ok(html.includes('<ul>'), 'rendered as list');
  assert.ok(!html.includes('<script>alert'), 'no raw script in list item');
  assert.ok(html.includes('&lt;script&gt;'), 'script escaped');
});

test('escape — fenced code with onerror payload stays escaped (no inline render)', () => {
  const html = fu.renderProseBlockHtml('```\n<img onerror="alert(2)">\n```', fu);
  assert.ok(html.startsWith('<pre><code>'), 'rendered as code block');
  assert.ok(!html.includes('<img onerror'), 'onerror not raw');
  assert.ok(html.includes('&lt;img onerror'), 'onerror escaped');
});

test('escape — table cell backtick + markup payload neutralized', () => {
  const html = fu.renderProseBlockHtml(
    '| 키 | 값 |\n|---|---|\n| `tok` | <b onmouseover=x>v</b> |', fu);
  assert.ok(html.includes('<table>'), 'rendered as table');
  // backtick cell becomes a real <code> span; raw backtick must not survive
  assert.ok(!html.includes('`tok`'), 'no raw backtick in cell');
  assert.ok(html.includes('<code>tok</code>'), 'backtick rendered to code span');
  assert.ok(!html.includes('<b onmouseover'), 'no raw event-handler markup');
  assert.ok(html.includes('&lt;b onmouseover'), 'markup escaped');
});

test('escape — blockquote with markup payload neutralized', () => {
  const html = fu.renderProseBlockHtml('> <script>x</script> 인용', fu);
  assert.ok(html.startsWith('<blockquote>'), 'rendered as blockquote');
  assert.ok(!html.includes('<script>x'), 'no raw script in blockquote');
});
