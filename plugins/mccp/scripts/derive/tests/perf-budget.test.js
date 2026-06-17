'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { derive } = require('../index');
const { tmpRepo, cleanup, gitInit, writeJson, writeText } = require('./helpers');
const envelope = require('../../lib/dispatch-envelope');

const PERF_BUDGET_MS = 1000;

function rndUuid(n) {
  const s = n.toString(16).padStart(8, '0');
  return s + '-0000-0000-0000-' + n.toString(16).padStart(12, '0');
}

test('perf-budget: 100 receipts + 20 envelopes + 5 plans complete < 1000ms', () => {
  const root = tmpRepo();
  try {
    gitInit(root);
    for (let i = 0; i < 5; i++) {
      writeText(path.join(root, '.claude', 'plans', 'plan-' + i + '.plan.md'),
        '# Plan ' + i + '\n\n**Source PRD**: [p](../p.md)\n**Selected Milestone**: 1 — m\n**Complexity**: Small\n\n## Acceptance\n\n- [ ] item\n');
    }
    for (let i = 0; i < 100; i++) {
      const gate = (i % 3 === 0) ? 'mccp-plan-codex' : (i % 3 === 1 ? 'mccp-implement-codex' : 'mccp-pr-codex');
      writeJson(path.join(root, '.claude', 'receipts', gate, 'd-' + i + '.json'), {
        schema_version: 'v1', gate_id: gate, phase: 'plan', decision_id: 'd-' + i, task_id: null,
        plan_hash: 'sha256:' + '0'.repeat(64),
        design_doc_hash: [], base_sha: '0000000', head_sha: '0000000', round: 1, findings: [],
        resolution: { converged: true, rounds: 1, open_questions: [] },
        subject_hash: 'sha256:' + '0'.repeat(64), receipt_hash: 'sha256:' + '0'.repeat(64),
        meta: { created_at: '2026-06-17T00:00:00.000Z',
          skipped: false, advisory: false, codex_skipped: false,
          security_skipped: false, impeccable_skipped: false },
      });
    }
    for (let i = 0; i < 20; i++) {
      const dispatchId = rndUuid(1000 + i);
      const p = path.join(root, '.claude', 'state', 'dispatches', dispatchId + '.envelope.json');
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const w = envelope.write(p, {
        schema_version: 'v1', dispatch_id: dispatchId, worker_subagent_type: 'general-purpose',
        worker_started_at: '2026-06-17T00:00:00.000Z',
        worker_ended_at: '2026-06-17T00:00:30.000Z',
        worker_exit_status: 'ok', receipts_added: [], findings: [], next_action: null,
        controller_session_id: rndUuid(900 + i), parent_cwd: root,
      });
      assert.strictEqual(w.ok, true);
    }

    const start = Date.now();
    const m = derive(root, { raw: true });
    const elapsed = Date.now() - start;

    assert.strictEqual(m.sources.plans.count, 5);
    assert.strictEqual(m.sources.receipts.count >= 100, true,
      'expected >= 100 receipts; got ' + m.sources.receipts.count);
    assert.strictEqual(m.sources.envelopes.count, 20);
    assert.ok(elapsed < PERF_BUDGET_MS,
      'derive exceeded ' + PERF_BUDGET_MS + 'ms budget: ' + elapsed + 'ms');
  } finally {
    cleanup(root);
  }
});
