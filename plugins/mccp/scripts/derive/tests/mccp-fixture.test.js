'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { derive } = require('../index');
const { tmpRepo, cleanup, gitInit, writeJson, writeText } = require('./helpers');
const stateWriter = require('../../state/state-writer');
const fixTask = require('../../state/fix-task');
const envelope = require('../../lib/dispatch-envelope');

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

function writeMinimalReceipt(root, gate, decision) {
  const p = path.join(root, '.claude', 'receipts', gate, decision + '.json');
  writeJson(p, {
    schema_version: 'v1',
    gate_id: gate,
    phase: 'implement',
    decision_id: decision,
    task_id: null,
    plan_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    design_doc_hash: [],
    base_sha: '0000000',
    head_sha: '0000000',
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    receipt_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    meta: {
      created_at: '2026-06-17T00:00:00.000Z',
      command: '/test',
      cwd: root,
      git_branch: 'main',
      skipped: false,
      skip_reason: null,
      codex_skipped: false,
      advisory: false,
      security_skipped: false,
      security_skip_reason: null,
      security_force_override: false,
      security_force_override_reason: null,
      impeccable_skipped: false,
      impeccable_skip_reason: null,
      impeccable_force_override: false,
      impeccable_force_override_reason: null,
    },
  });
}

function writePlan(root, slug, body) {
  writeText(path.join(root, '.claude', 'plans', slug + '.plan.md'), body);
}

function writeBacklog(root, rows) {
  const lines = [
    '# Codex Findings Backlog (defer-to-later)',
    '',
    '| Date | Severity | Source plan | Finding |',
    '|---|---|---|---|',
  ];
  for (const r of rows) {
    lines.push('| ' + r.date + ' | ' + r.severity + ' | ' + r.source_plan + ' | ' + r.finding + ' |');
  }
  writeText(path.join(root, '.claude', 'plans', 'codex-findings-backlog.md'), lines.join('\n') + '\n');
}

function writeEnvelope(root, dispatchId, sessionId, status) {
  const p = path.join(root, '.claude', 'state', 'dispatches', dispatchId + '.envelope.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  envelope.write(p, {
    schema_version: 'v1',
    dispatch_id: dispatchId,
    worker_subagent_type: 'general-purpose',
    worker_started_at: '2026-06-17T00:00:00.000Z',
    worker_ended_at: status === 'pending' ? null : '2026-06-17T00:00:30.000Z',
    worker_exit_status: status,
    receipts_added: [],
    findings: [],
    next_action: null,
    controller_session_id: sessionId,
    parent_cwd: root,
  });
}

test('mccp-fixture: all 7 sources populated', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    writePlan(root, 'feature-x', [
      '# Plan: feature-x',
      '',
      '**Source PRD**: [my-prd](../prds/my-prd.md)',
      '**Selected Milestone**: 1 — feature-x M1',
      '**Complexity**: Small',
      '',
      '## Acceptance',
      '',
      '- [ ] file A',
      '- [x] file B done',
    ].join('\n'));
    writeMinimalReceipt(root, 'mccp-plan-codex', 'feature-x');
    stateWriter.update(root, {
      taskFingerprint: 'feature-x-m1',
      lastEvent: 'precompact',
      goal: 'ship feature-x',
    });
    fixTask.write(root, {
      title: 'fix-task-test',
      counter: 1,
      verdict: 'quality_fail',
      failures: [{ stage: 'test', exitCode: 1, excerpt: 'fail' }],
    });
    writeBacklog(root, [
      { date: '2026-06-17', severity: 'MEDIUM', source_plan: '.claude/plans/feature-x.plan.md',
        finding: 'maybe' },
    ]);
    writeEnvelope(root, ZERO_UUID, ZERO_UUID, 'ok');

    const m = derive(root, { raw: true });

    assert.strictEqual(m.sources.plans.count >= 1, true, 'plans count >= 1');
    assert.strictEqual(m.sources.receipts.count >= 1, true, 'receipts count >= 1');
    assert.notStrictEqual(m.sources.state.item, null, 'state.item present');
    assert.strictEqual(m.sources.backlog.count, 1, 'backlog count == 1');
    assert.notStrictEqual(m.sources.fix_task.item, null, 'fix_task present');
    assert.notStrictEqual(m.sources.pr.item, null, 'pr present');
    assert.strictEqual(m.sources.envelopes.count, 1, 'envelopes count == 1');
    assert.strictEqual(m.sources.envelopes.items[0].is_terminal, true);
    assert.strictEqual(m.sources.envelopes.items[0].worker_exit_status, 'ok');
    assert.strictEqual(m.sources.envelopes.degraded, false);
  } finally {
    cleanup(root);
  }
});

test('mccp-fixture: receipt extract preserves absence vs explicit-false (Codex R1 F1 absorption)', () => {
  const root = tmpRepo();
  try {
    gitInit(root);

    // v0.2.x-era receipt: codex_disabled_at_pr key NEVER written
    const p1 = path.join(root, '.claude', 'receipts', 'mccp-plan-codex', 'legacy-era.json');
    writeJson(p1, {
      schema_version: 'v1',
      gate_id: 'mccp-plan-codex',
      phase: 'plan',
      decision_id: 'legacy-era',
      task_id: null,
      plan_hash: 'sha256:' + '0'.repeat(64),
      design_doc_hash: [],
      base_sha: '0000000',
      head_sha: '0000000',
      round: 1,
      findings: [],
      resolution: { converged: true, rounds: 1, open_questions: [] },
      subject_hash: 'sha256:' + '0'.repeat(64),
      receipt_hash: 'sha256:' + '0'.repeat(64),
      meta: {
        created_at: '2025-12-01T00:00:00.000Z',
        skipped: false, advisory: false, codex_skipped: false,
        security_skipped: false, impeccable_skipped: false,
      },
    });

    // v0.3.5+ receipt: codex_disabled_at_pr explicitly set to false
    const p2 = path.join(root, '.claude', 'receipts', 'mccp-plan-codex', 'modern-era.json');
    writeJson(p2, {
      schema_version: 'v1',
      gate_id: 'mccp-plan-codex',
      phase: 'plan',
      decision_id: 'modern-era',
      task_id: null,
      plan_hash: 'sha256:' + '0'.repeat(64),
      design_doc_hash: [],
      base_sha: '0000000',
      head_sha: '0000000',
      round: 1,
      findings: [],
      resolution: { converged: true, rounds: 1, open_questions: [] },
      subject_hash: 'sha256:' + '0'.repeat(64),
      receipt_hash: 'sha256:' + '0'.repeat(64),
      meta: {
        created_at: '2026-06-17T00:00:00.000Z',
        skipped: false, advisory: false, codex_skipped: false,
        security_skipped: false, impeccable_skipped: false,
        codex_disabled_at_pr: false,
      },
    });

    const m = derive(root, { raw: true });
    const items = m.sources.receipts.items;
    const legacy = items.find(i => i.decision_id === 'legacy-era');
    const modern = items.find(i => i.decision_id === 'modern-era');
    assert.ok(legacy, 'legacy receipt extracted');
    assert.ok(modern, 'modern receipt extracted');
    assert.strictEqual(legacy.codex_disabled_at_pr, undefined,
      'absent key must remain undefined (pick preserves absence)');
    assert.strictEqual(modern.codex_disabled_at_pr, false,
      'explicit-false key must remain false');
  } finally {
    cleanup(root);
  }
});
