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
  assert.match(result.body, /Next: run \/mccp:santa-loop 'rename function'/);
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

// v0.3.2 — writeOrAppend mode (cross-gate escalate path)
test('writeOrAppend: missing file falls back to write()', () => {
  const repo = mkRepo();
  const result = ft.writeOrAppend(repo, {
    verdict: 'codex_critical',
    escalate: true,
    codexSummary: 'CRITICAL: finding_critical',
    originatingReceipts: ['.claude/receipts/mccp-plan-codex/foo.json'],
  });
  assert.strictEqual(result.created, true);
  assert.ok(fs.existsSync(result.path));
  assert.match(result.body, /## Dual Reviewer Escalation Required/);
  assert.match(result.body, /^originating_receipts:\n {2}- \.claude\/receipts\/mccp-plan-codex\/foo\.json/m);
});

test('writeOrAppend: new receipt appends + preserves created_at + expires_at', async () => {
  const repo = mkRepo();
  const first = ft.writeOrAppend(repo, {
    verdict: 'codex_critical',
    escalate: true,
    codexSummary: 'CRITICAL: first',
    originatingReceipts: ['.claude/receipts/mccp-plan-codex/foo.json'],
  });
  const firstCreated = first.body.match(/^created_at: (.+)$/m)[1];
  const firstExpires = first.body.match(/^expires_at: (.+)$/m)[1];

  // Wait a few ms so we'd notice if buildBody silently re-emitted now().
  await new Promise(r => setTimeout(r, 15));

  const second = ft.writeOrAppend(repo, {
    verdict: 'codex_critical',
    escalate: true,
    codexSummary: 'CRITICAL: second',
    originatingReceipts: ['.claude/receipts/mccp-implement-codex/foo.json'],
  });
  assert.strictEqual(second.appended, true);
  const secondCreated = second.body.match(/^created_at: (.+)$/m)[1];
  const secondExpires = second.body.match(/^expires_at: (.+)$/m)[1];
  assert.strictEqual(secondCreated, firstCreated, 'created_at must be preserved');
  assert.strictEqual(secondExpires, firstExpires, 'expires_at must be preserved');
  // Both receipts present in frontmatter
  assert.match(second.body, /mccp-plan-codex\/foo\.json/);
  assert.match(second.body, /mccp-implement-codex\/foo\.json/);
  // Escalation section still present (idempotent)
  assert.match(second.body, /## Dual Reviewer Escalation Required/);
});

test('writeOrAppend: duplicate receipt is a no-op', () => {
  const repo = mkRepo();
  ft.writeOrAppend(repo, {
    verdict: 'codex_critical',
    escalate: true,
    codexSummary: 'CRITICAL: dup test',
    originatingReceipts: ['.claude/receipts/mccp-plan-codex/dup.json'],
  });
  const before = fs.readFileSync(ft.fixTaskPath(repo), 'utf8');
  const result = ft.writeOrAppend(repo, {
    verdict: 'codex_critical',
    escalate: true,
    codexSummary: 'CRITICAL: dup test',
    originatingReceipts: ['.claude/receipts/mccp-plan-codex/dup.json'],
  });
  assert.strictEqual(result.skipped, true);
  const after = fs.readFileSync(ft.fixTaskPath(repo), 'utf8');
  assert.strictEqual(after, before, 'file must be byte-identical after duplicate writeOrAppend');
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

test('escalation prompt single quotes are escaped', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'codex_critical',
    escalate: true,
    originalPrompt: "add 'noop()' function",
  });
  assert.match(result.body, /add \\'noop\(\)\\' function/);
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

test('escalation prompt is truncated at 140 chars with ellipsis', () => {
  const repo = mkRepo();
  const longPrompt = 'a'.repeat(200);
  const result = ft.write(repo, {
    verdict: 'codex_critical',
    escalate: true,
    originalPrompt: longPrompt,
  });
  const expected = "Next: run /mccp:santa-loop '" + 'a'.repeat(139) + "…'";
  assert.ok(
    result.body.includes(expected),
    'expected body to contain 139 chars + ellipsis, got: ' + result.body
  );
});

test('escalation falls back to literal placeholder when originalPrompt is missing', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'codex_critical',
    escalate: true,
    // originalPrompt omitted
  });
  assert.match(result.body, /Next: run \/mccp:santa-loop '<original-prompt>'/);
});

test('escalation falls back to literal placeholder when originalPrompt is empty', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'codex_critical',
    escalate: true,
    originalPrompt: '',
  });
  assert.match(result.body, /Next: run \/mccp:santa-loop '<original-prompt>'/);
});

test('escalation normalizes newlines in original prompt to spaces', () => {
  const repo = mkRepo();
  const result = ft.write(repo, {
    verdict: 'codex_critical',
    escalate: true,
    originalPrompt: 'first line\nsecond line',
  });
  assert.match(result.body, /Next: run \/mccp:santa-loop 'first line second line'/);
});

test('oneLineExcerpt normalizes CR, CRLF, and runs of newlines', () => {
  assert.strictEqual(ft.oneLineExcerpt('a\rb'), 'a b');
  assert.strictEqual(ft.oneLineExcerpt('a\r\nb'), 'a b');
  assert.strictEqual(ft.oneLineExcerpt('a\n\r\nb'), 'a b');
  assert.strictEqual(ft.oneLineExcerpt('a\r\rb'), 'a b');
});

test('escalation normalizes CR, CRLF, and runs of newlines to a single space', () => {
  const repo = mkRepo();
  const cases = [
    { in: 'a\rb', expect: 'a b' },        // CR only (classic Mac)
    { in: 'a\r\nb', expect: 'a b' },      // CRLF
    { in: 'a\n\r\nb', expect: 'a b' },    // mixed run collapses to one space
    { in: 'a\r\rb', expect: 'a b' },      // repeated CR collapses
  ];
  for (const c of cases) {
    const result = ft.write(repo, {
      verdict: 'codex_critical',
      escalate: true,
      originalPrompt: c.in,
    });
    const expectedLine = "Next: run /mccp:santa-loop '" + c.expect + "'";
    assert.ok(
      result.body.includes(expectedLine),
      "input " + JSON.stringify(c.in) + " expected line " + JSON.stringify(expectedLine) +
      "; body was: " + result.body
    );
  }
});

test('escalation truncates after escaping so quote-heavy prompts stay ≤140 chars', () => {
  const repo = mkRepo();
  // 140 single quotes — pre-escape length 140, post-escape length 280.
  // Without escape-before-truncate, the 140-char contract is violated.
  const result = ft.write(repo, {
    verdict: 'codex_critical',
    escalate: true,
    originalPrompt: "'".repeat(140),
  });
  const prefix = "Next: run /mccp:santa-loop '";
  const escalateLine = result.body.split('\n').find(l => l.startsWith(prefix));
  assert.ok(escalateLine, 'escalate line not found in body: ' + result.body);
  assert.ok(escalateLine.endsWith("'"), 'escalate line must close with quote');
  const injected = escalateLine.slice(prefix.length, -1);
  assert.ok(
    injected.length <= 140,
    'injected substring must be ≤140 chars post-escape, got ' + injected.length
  );
  assert.ok(injected.endsWith('…'), 'expected ellipsis suffix on truncated input');
  // No dangling backslash from a half-cut \' pair.
  assert.ok(
    !injected.slice(0, -1).endsWith('\\'),
    'expected no dangling backslash before ellipsis, got: ' + injected
  );
});
