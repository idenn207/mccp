'use strict';

// v0.2.8 Task 2.6.5 — fixture: the exact regression scenario from the
// thin-index roadmap audit (Codex R1-F1, INC-001 §F-RA-1).
//
// Reproduction:
//   1. v0.1-era worktree has a stale receipt at
//      .claude/receipts/mccp-plan-codex/main.json
//      (decision_id="main" derived from the literal branch name).
//   2. User checks out `main` and runs /mccp:pr.
//   3. derive-decision returns "main" (no feature branch prefix).
//   4. Pre-v0.2.8: validate-cmd reads main.json and treats it as the
//      preceding plan-codex receipt regardless of plan content → false-green.
//   5. Post-v0.2.8 (this commit): boot-time quarantine renames main.json
//      to main.legacy.json, then the generic-no-plan reject fires →
//      validation blocks with a runbook pointer.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { mkTmpRepo } = require('./helpers');
const { validateCommand } = require('../validate-cmd');

function writeRawReceipt(repo, gateId, decisionId, plan_hash) {
  const dir = path.join(repo, '.claude', 'receipts', gateId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, decisionId + '.json');
  // Mimic a v0.1-era receipt that pre-dates the current plan content.
  // Schema fields aren't strictly enforced by the file presence check,
  // but we include them so the fixture is realistic.
  fs.writeFileSync(p, JSON.stringify({
    schema_version: 'v1',
    gate_id: gateId,
    phase: 'plan',
    decision_id: decisionId,
    task_id: null,
    plan_hash: plan_hash || 'sha256:' + 'a'.repeat(64),
    design_doc_hash: [],
    base_sha: '0'.repeat(40),
    head_sha: '0'.repeat(40),
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    subject_hash: 'sha256:' + 'b'.repeat(64),
    receipt_hash: 'sha256:' + 'c'.repeat(64),
    meta: {
      created_at: '2025-01-01T00:00:00.000Z',
      command: '/' + gateId,
      cwd: repo,
      git_branch: 'main',
      skipped: false, skip_reason: null,
      codex_skipped: false, advisory: false,
      security_skipped: false, security_skip_reason: null,
      security_force_override: false, security_force_override_reason: null,
      impeccable_skipped: false, impeccable_skip_reason: null,
      impeccable_force_override: false, impeccable_force_override_reason: null,
    },
  }, null, 2));
  return p;
}

test('fixture: /mccp:pr on `main` with v0.1 stale receipt → quarantined + generic-reject blocks PR gate', function () {
  const repo = mkTmpRepo();
  // helpers.mkTmpRepo creates `master` as the initial branch; rename to
  // `main` so derive-decision-by-branch reproduces the original scenario.
  execFileSync('git', ['branch', '-M', 'main'], { cwd: repo, stdio: 'ignore' });

  // Plant the stale v0.1-era main.json + implement-codex/main.json.
  writeRawReceipt(repo, 'mccp-plan-codex', 'main');
  writeRawReceipt(repo, 'mccp-implement-codex', 'main');

  // Confirm pre-state: both files exist as "default" active receipts.
  assert.ok(fs.existsSync(path.join(repo, '.claude/receipts/mccp-plan-codex/main.json')));
  assert.ok(fs.existsSync(path.join(repo, '.claude/receipts/mccp-implement-codex/main.json')));

  // Run /mccp:pr validation. Boot-time migration quarantines, then
  // generic-no-plan reject fires.
  const r = validateCommand('/mccp:pr', { cwd: repo, decisionId: 'main' });
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.strictEqual(r.blocking.length, 1);
  assert.strictEqual(r.blocking[0].gate_id, '_meta');
  assert.match(r.blocking[0].reason, /generic decision_id "main"/);

  // Post-state: stale receipts moved to legacy; no active main.json.
  assert.ok(fs.existsSync(path.join(repo, '.claude/receipts/mccp-plan-codex/main.legacy.json')));
  assert.ok(fs.existsSync(path.join(repo, '.claude/receipts/mccp-implement-codex/main.legacy.json')));
  assert.ok(!fs.existsSync(path.join(repo, '.claude/receipts/mccp-plan-codex/main.json')));
  assert.ok(!fs.existsSync(path.join(repo, '.claude/receipts/mccp-implement-codex/main.json')));

  // Migration marker reached complete.
  const marker = JSON.parse(fs.readFileSync(
    path.join(repo, '.claude/receipts/.migrations/v0.2.8-generic-quarantine.json'), 'utf8'));
  assert.strictEqual(marker.state, 'complete');
});
