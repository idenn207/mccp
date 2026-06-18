'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderStatus } = require('../index');

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
