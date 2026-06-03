'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ft = require('../fix-task');

function mkRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-fixtask-'));
}

test('write produces frontmatter with required keys', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'quality_fail',
    counter: 1,
    taskFingerprint: 'abc123',
    decisionId: 'feat-something',
    failures: [{ stage: 'lint', exitCode: 1, excerpt: 'eslint failed: 3 errors' }],
  });
  assert.ok(fs.existsSync(result.path));
  assert.match(result.body, /^---\nfix_task_version: 1\n/);
  assert.match(result.body, /task_fingerprint: abc123/);
  assert.match(result.body, /gate_id: stop-review-loop/);
  assert.match(result.body, /decision_id: feat-something/);
  assert.match(result.body, /counter: 1/);
  assert.match(result.body, /verdict: quality_fail/);
  assert.match(result.body, /escalate: false/);
});

test('quality_fail produces Failures section with stage + exit code', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'quality_fail',
    failures: [{ stage: 'typecheck', exitCode: 2, excerpt: 'TS error TS2304' }],
  });
  assert.match(result.body, /## Failures/);
  assert.match(result.body, /- typecheck: exit=2/);
  assert.match(result.body, /TS error TS2304/);
});

test('codex_critical produces escalation section', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'codex_critical',
    counter: 1,
    escalate: true,
    codexSummary: 'CRITICAL: secret_exposure',
    originalPrompt: 'rename function',
  });
  assert.match(result.body, /escalate: true/);
  assert.match(result.body, /## Dual Reviewer Escalation Required/);
  assert.match(result.body, /Next: run \/santa-loop "rename function"/);
});

test('codex_divergent without 3R does not escalate', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'codex_divergent',
    escalate: false,
    codexSummary: '2R divergent',
  });
  assert.match(result.body, /escalate: false/);
  assert.doesNotMatch(result.body, /## Dual Reviewer Escalation Required/);
});

test('expires_at frontmatter is set 7 days into the future', () => {
  const repo = mkRepo();
  const result = ft.write(repo, { verdict: 'quality_fail', failures: [] });
  const m = result.body.match(/created_at: (\S+)\nexpires_at: (\S+)/);
  assert.ok(m);
  const created = new Date(m[1]).getTime();
  const expires = new Date(m[2]).getTime();
  const days = (expires - created) / (24 * 60 * 60 * 1000);
  assert.ok(Math.abs(days - 7) < 0.01, 'expected ~7 days, got ' + days);
});

test('counter is capped to 2', () => {
  const repo = mkRepo();
  const result = ft.write(repo, { verdict: 'quality_fail', counter: 9, failures: [] });
  assert.match(result.body, /counter: 2/);
});

test('write overwrites previous fix-task.md', () => {
  const repo = mkRepo();
  ft.write(repo, { verdict: 'quality_fail', decisionId: 'first', failures: [] });
  ft.write(repo, { verdict: 'quality_fail', decisionId: 'second', failures: [] });
  const body = ft.read(repo);
  assert.match(body, /decision_id: second/);
});

test('markApplied moves fix-task.md to fix-task-applied.md', () => {
  const repo = mkRepo();
  ft.write(repo, { verdict: 'quality_fail', failures: [] });
  assert.strictEqual(ft.markApplied(repo), true);
  assert.ok(!fs.existsSync(ft.fixTaskPath(repo)));
  assert.ok(fs.existsSync(ft.appliedPath(repo)));
});

test('markApplied returns false when no fix-task.md exists', () => {
  const repo = mkRepo();
  assert.strictEqual(ft.markApplied(repo), false);
});

test('sweepStaleApplied honors maxAgeMs', () => {
  const repo = mkRepo();
  ft.write(repo, { verdict: 'quality_fail', failures: [] });
  ft.markApplied(repo);
  // Backdate the file 10 days
  const target = ft.appliedPath(repo);
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  fs.utimesSync(target, past, past);
  assert.strictEqual(ft.sweepStaleApplied(repo), true);
  assert.ok(!fs.existsSync(target));
});

test('escalation prompt quotes are escaped', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'codex_critical',
    escalate: true,
    originalPrompt: 'add "noop()" function',
  });
  assert.match(result.body, /add \\"noop\(\)\\" function/);
});

test('originatingReceipts surface as frontmatter list AND body section', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'quality_fail',
    failures: [],
    originatingReceipts: [
      'plan-codex/feat-x',
      'implement-codex/feat-x',
    ],
  });
  assert.match(result.body, /originating_receipts:\n {2}- plan-codex\/feat-x\n {2}- implement-codex\/feat-x/);
  assert.match(result.body, /## Originating Decisions\n- plan-codex\/feat-x\n- implement-codex\/feat-x/);
});
