'use strict';

// v0.4.0 axis H — fix-task.md `plan_conflict` verdict.
//
// When /mccp:prp-implement Phase 3 detects a plan-implement gap via
// plan-conflict-detector, it writes fix-task.md with verdict='plan_conflict'.
// This test verifies the title/why/nextActions branches added in Task 3.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ft = require('../fix-task');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-fixtask-pc-'));
}

test('plan_conflict verdict produces title/why/nextActions for plan-implement gap', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'plan_conflict',
    counter: 1,
    escalate: true,
    decisionId: 'feature-x',
    taskFingerprint: 'abc123',
    failures: [{
      stage: 'plan-conflict-detector',
      exitCode: 1,
      excerpt: 'signature-level error references file outside plan: helpers.js',
    }],
    originatingReceipts: ['mccp-implement-codex/feature-x.json'],
  });

  assert.ok(fs.existsSync(result.path));

  assert.match(result.body, /verdict: plan_conflict/);

  assert.match(result.body, /## Title\s*\nplan-implement conflict — review and revise plan/);

  assert.match(result.body, /## Why\s*\nImplement phase detected a conflict/);
  assert.match(result.body, /cannot be silently absorbed/);
  assert.match(result.body, /re-enter \/mccp:prp-implement/i);

  assert.match(result.body, /## Failures\s*\n- plan-conflict-detector: exit=1/);
  assert.match(result.body, /signature-level error references file outside plan: helpers\.js/);

  assert.match(result.body, /## Next Actions/);
  assert.match(result.body, /1\. Read \.claude\/state\/fix-task\.md and the source plan/);
  assert.match(result.body, /2\. Run \/mccp:plan <plan-path> if the plan needs revision/);
  assert.match(result.body, /3\. Re-enter \/mccp:prp-implement <plan-path> after deciding/);

  assert.match(result.body, /originating_receipts:\n  - mccp-implement-codex\/feature-x\.json/);
});
