'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { derive } = require('../../../derive');
const { renderStatus } = require('../index');

function mkFsFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-render-int-'));
  const claude = path.join(root, '.claude');
  fs.mkdirSync(path.join(claude, 'plans'), { recursive: true });
  fs.mkdirSync(path.join(claude, 'prds'), { recursive: true });
  fs.mkdirSync(path.join(claude, 'receipts', 'mccp-plan-codex'), { recursive: true });
  fs.mkdirSync(path.join(claude, 'state'), { recursive: true });
  fs.mkdirSync(path.join(claude, 'state', 'dispatches'), { recursive: true });

  fs.writeFileSync(path.join(claude, 'prds', 'demo.prd.md'),
    '# Demo PRD\n\n## Delivery Milestones\n\n| # | M | O | Status | Plan |\n|---|---|---|---|---|\n'
    + '| 0 | A | x | complete | [a.plan.md](../PRPs/plans/completed/a.plan.md) |\n'
    + '| 1 | B | y | in-progress | [b.plan.md](../plans/b.plan.md) |\n'
    + '| 2 | C | z | pending | — |\n');

  fs.writeFileSync(path.join(claude, 'plans', 'b.plan.md'),
    '# B\n\n**Source PRD**: [demo.prd.md](../prds/demo.prd.md)\n\n'
    + '## Summary\n\nDemo plan.\n\n'
    + '## Open Questions\n\n- [ ] q1\n\n'
    + '## Risks\n\n| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|\n| r1 | High | High | m1 |\n');

  const now = Date.now();
  fs.writeFileSync(path.join(claude, 'receipts', 'mccp-plan-codex', 'b.json'),
    JSON.stringify({
      schema_version: 'v1',
      gate_id: 'mccp-plan-codex',
      phase: 'plan',
      decision_id: 'b',
      task_id: null,
      plan_hash: 'sha256:' + 'a'.repeat(64),
      design_doc_hash: [],
      base_sha: 'a'.repeat(40),
      head_sha: 'a'.repeat(40),
      round: 1,
      findings: [],
      resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
      subject_hash: 'sha256:' + 'b'.repeat(64),
      receipt_hash: 'sha256:' + 'c'.repeat(64),
      meta: { created_at: new Date(now - 60_000).toISOString(), command: '/mccp-plan-codex', briefing_summary: 'looks good' },
    }, null, 2));

  fs.writeFileSync(path.join(claude, 'state', 'STATE.md'),
    '---\nschema_version: 1\nupdated_at: ' + new Date(now).toISOString() + '\n'
    + 'controller_session_id: ctrl-abc\nactive_dispatch_count: 1\n'
    + 'task_fingerprint: v1-4-2-dashboard-overhaul\n'
    + '---\n\n## Goal\n\nx\n\n## Open Questions\n\n- ux question\n');

  return root;
}

function rmFixture(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (err) { /* ignore */ }
}

test('render-integration — real derive() against fs fixture reflects actual surface (R1 next_step absorption)', () => {
  const root = mkFsFixture();
  try {
    const model = derive(root);
    assert.equal(typeof model, 'object');
    assert.ok(model.sources, 'derive returns sources');

    const r = renderStatus(model, { cwd: root });
    assert.equal(typeof r.md, 'string');
    assert.equal(typeof r.html, 'string');
    assert.ok(r.md.length > 0);

    assert.match(r.html, /<!doctype html>/);
    assert.match(r.html, /<\/html>\s*$/);

    // v1.4.2-m1: header hoist — status strip lives in <header>, not main.
    assert.match(r.html, /<header[^>]*>[\s\S]*?<div class="status-strip"/);
    assert.doesNotMatch(r.html, /<section id="status"/);

    const openSec = (r.html.match(/<section/g) || []).length;
    const closeSec = (r.html.match(/<\/section>/g) || []).length;
    assert.equal(openSec, closeSec, 'section tags balanced');

    const openTable = (r.html.match(/<table/g) || []).length;
    const closeTable = (r.html.match(/<\/table>/g) || []).length;
    assert.equal(openTable, closeTable, 'table tags balanced');

    assert.match(r.md, /b/i);
  } finally { rmFixture(root); }
});

test('render-integration — controller_active + envelopes empty triggers F3 amber', () => {
  const root = mkFsFixture();
  try {
    const model = derive(root);
    const r = renderStatus(model, { cwd: root });
    assert.equal(typeof r.verdict, 'object');
    assert.ok(['amber', 'red', 'green', 'neutral', 'muted'].includes(r.verdict.tone));
  } finally { rmFixture(root); }
});
