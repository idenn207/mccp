'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  sha256,
  canonicalizeMarkdown,
  markdownHash,
  canonicalizeMarkdownStructural,
  markdownHashStructural,
  isPlanPath,
  planAwareMarkdownHash,
  subjectHash,
  receiptHash,
} = require('../hash');

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hash-'));
  const f = path.join(dir, 'doc.md');
  fs.writeFileSync(f, content, 'utf8');
  return f;
}

function tmpFileBytes(buf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hash-'));
  const f = path.join(dir, 'doc.md');
  fs.writeFileSync(f, buf);
  return f;
}

test('sha256: prefixed and 64 hex chars', function () {
  const h = sha256('hello');
  assert.match(h, /^sha256:[0-9a-f]{64}$/);
  assert.strictEqual(h, 'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('canonicalizeMarkdown: BOM stripped', function () {
  const a = canonicalizeMarkdown('﻿# Title\nbody\n');
  const b = canonicalizeMarkdown('# Title\nbody\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdown: CRLF → LF', function () {
  const a = canonicalizeMarkdown('# Title\r\nline1\r\nline2\r\n');
  const b = canonicalizeMarkdown('# Title\nline1\nline2\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdown: bare CR → LF', function () {
  const a = canonicalizeMarkdown('# Title\rline1\rline2\r');
  const b = canonicalizeMarkdown('# Title\nline1\nline2\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdown: trailing whitespace stripped per line', function () {
  const a = canonicalizeMarkdown('line1   \nline2\t\t\nline3\n');
  const b = canonicalizeMarkdown('line1\nline2\nline3\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdown: trailing blank lines collapsed to one LF', function () {
  const a = canonicalizeMarkdown('content\n\n\n\n');
  const b = canonicalizeMarkdown('content\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdown: no trailing newline → adds one', function () {
  const a = canonicalizeMarkdown('content');
  assert.strictEqual(a, 'content\n');
});

test('canonicalizeMarkdown: frontmatter keys sorted', function () {
  const a = canonicalizeMarkdown('---\nz: zed\na: alpha\nm: mid\n---\nbody\n');
  const b = canonicalizeMarkdown('---\na: alpha\nm: mid\nz: zed\n---\nbody\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdown: no frontmatter pass-through', function () {
  const c = canonicalizeMarkdown('# heading\n\nparagraph\n');
  assert.strictEqual(c, '# heading\n\nparagraph\n');
});

test('canonicalizeMarkdown: korean content preserved', function () {
  const c = canonicalizeMarkdown('# 제목\n\n한글 본문\n');
  assert.strictEqual(c, '# 제목\n\n한글 본문\n');
});

test('markdownHash: BOM + CRLF + trailing variant produces same hash', function () {
  const variant = tmpFileBytes(Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from('# Title\r\nline1   \r\nline2\r\n\r\n\r\n', 'utf8'),
  ]));
  const clean = tmpFile('# Title\nline1\nline2\n');
  assert.strictEqual(markdownHash(variant), markdownHash(clean));
});

test('markdownHash: frontmatter key reorder same hash', function () {
  const a = tmpFile('---\nz: 1\na: 2\nm: 3\n---\nbody\n');
  const b = tmpFile('---\nm: 3\na: 2\nz: 1\n---\nbody\n');
  assert.strictEqual(markdownHash(a), markdownHash(b));
});

test('markdownHash: real content change differs', function () {
  const a = tmpFile('content A\n');
  const b = tmpFile('content B\n');
  assert.notStrictEqual(markdownHash(a), markdownHash(b));
});

function makeReceipt(overrides) {
  return Object.assign({
    schema_version: 'v1',
    gate_id: 'mccp-plan-codex',
    phase: 'plan',
    decision_id: 'feature-x',
    task_id: null,
    plan_hash: 'sha256:' + '0'.repeat(64),
    design_doc_hash: [],
    base_sha: 'a'.repeat(40),
    head_sha: 'b'.repeat(40),
    round: 1,
    findings: [],
    resolution: { converged: true, rounds: 1, accepted: [], rejected: [], open_questions: [] },
    meta: {
      created_at: '2026-06-02T00:00:00Z',
      command: '/mccp:plan',
      cwd: '/x',
      git_branch: 'master',
      skipped: false,
      skip_reason: null,
      codex_skipped: false,
    },
  }, overrides);
}

test('subjectHash: excludes findings/resolution/meta', function () {
  const a = makeReceipt({ findings: [{ severity: 'HIGH', area: 'x', description: 'y' }] });
  const b = makeReceipt({ findings: [] });
  assert.strictEqual(subjectHash(a), subjectHash(b));
});

test('subjectHash: changes when plan_hash changes', function () {
  const a = makeReceipt({ plan_hash: 'sha256:' + '0'.repeat(64) });
  const b = makeReceipt({ plan_hash: 'sha256:' + '1'.repeat(64) });
  assert.notStrictEqual(subjectHash(a), subjectHash(b));
});

test('subjectHash: changes when base_sha changes', function () {
  const a = makeReceipt({ base_sha: 'a'.repeat(40) });
  const b = makeReceipt({ base_sha: 'c'.repeat(40) });
  assert.notStrictEqual(subjectHash(a), subjectHash(b));
});

test('subjectHash: changes when round changes', function () {
  const a = makeReceipt({ round: 1 });
  const b = makeReceipt({ round: 2 });
  assert.notStrictEqual(subjectHash(a), subjectHash(b));
});

test('subjectHash: design_doc_hash array order matters (preserves order)', function () {
  const a = makeReceipt({
    design_doc_hash: [
      { path: 'a.md', sha256: 'sha256:' + '0'.repeat(64) },
      { path: 'b.md', sha256: 'sha256:' + '1'.repeat(64) },
    ],
  });
  const b = makeReceipt({
    design_doc_hash: [
      { path: 'b.md', sha256: 'sha256:' + '1'.repeat(64) },
      { path: 'a.md', sha256: 'sha256:' + '0'.repeat(64) },
    ],
  });
  assert.notStrictEqual(subjectHash(a), subjectHash(b));
});

test('receiptHash: differs when findings differ', function () {
  const a = makeReceipt({ findings: [] });
  const b = makeReceipt({ findings: [{ severity: 'LOW', area: 'x', description: 'y' }] });
  assert.notStrictEqual(receiptHash(a), receiptHash(b));
});

test('receiptHash: excludes its own receipt_hash field', function () {
  const a = makeReceipt();
  const ah1 = receiptHash(a);
  a.receipt_hash = ah1;
  const ah2 = receiptHash(a);
  assert.strictEqual(ah1, ah2);
});

// Phase 2 — Structural Hash: operational areas in ECC plan files.
// Memory: ecc-receipt-phase1-2026-06-02 §"Phase 2 — Structural Hash"
//   (a) frontmatter status pending→done                → same hash
//   (b) checkbox - [ ] → - [x]                          → same hash
//   (c) Summary line added                              → different hash
//   (d) Tasks body content changed                      → different hash
//   (e) PR placeholder #?? → #42                        → same hash

test('markdownHashStructural (a): frontmatter status change → same hash', function () {
  const a = tmpFile('---\nname: feature\nstatus: pending\n---\n\n# Plan\n\nbody\n');
  const b = tmpFile('---\nname: feature\nstatus: done\n---\n\n# Plan\n\nbody\n');
  assert.strictEqual(markdownHashStructural(a), markdownHashStructural(b));
});

test('markdownHashStructural (b): checkbox toggle → same hash', function () {
  const a = tmpFile('# Acceptance\n\n- [ ] item one\n- [ ] item two\n');
  const b = tmpFile('# Acceptance\n\n- [x] item one\n- [ ] item two\n');
  assert.strictEqual(markdownHashStructural(a), markdownHashStructural(b));
});

test('markdownHashStructural (c): summary line added → different hash', function () {
  const a = tmpFile('# Plan\n\n## Summary\n\nFirst line.\n');
  const b = tmpFile('# Plan\n\n## Summary\n\nFirst line.\nSecond line.\n');
  assert.notStrictEqual(markdownHashStructural(a), markdownHashStructural(b));
});

test('markdownHashStructural (d): tasks body changed → different hash', function () {
  const a = tmpFile('# Plan\n\n### Task 1\n\nDo X.\n');
  const b = tmpFile('# Plan\n\n### Task 1\n\nDo Y.\n');
  assert.notStrictEqual(markdownHashStructural(a), markdownHashStructural(b));
});

test('markdownHashStructural (e): PR placeholder filled → same hash', function () {
  const a = tmpFile('# Plan\n\nStatus: accepted (PR #?? — TBD).\n');
  const b = tmpFile('# Plan\n\nStatus: accepted (PR #42 — TBD).\n');
  assert.strictEqual(markdownHashStructural(a), markdownHashStructural(b));
});

// Defensive coverage beyond the 5-scenario spec.

test('canonicalizeMarkdownStructural: table status token only normalized inside table cells', function () {
  const a = canonicalizeMarkdownStructural('| Phase | Status |\n|---|---|\n| 1 | pending |\n');
  const b = canonicalizeMarkdownStructural('| Phase | Status |\n|---|---|\n| 1 | done |\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdownStructural: prose word "pending" outside table is preserved', function () {
  const a = canonicalizeMarkdownStructural('# Notes\n\nThe work is pending review.\n');
  const b = canonicalizeMarkdownStructural('# Notes\n\nThe work is done review.\n');
  assert.notStrictEqual(a, b);
});

test('canonicalizeMarkdownStructural: adjacent table cells with status tokens both normalized', function () {
  const a = canonicalizeMarkdownStructural('| in-progress | done | blocked |\n');
  const b = canonicalizeMarkdownStructural('| accepted | proposed | pending |\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdownStructural: frontmatter "pr" and "completed_at" keys stripped', function () {
  const a = canonicalizeMarkdownStructural('---\nname: x\npr: 42\ncompleted_at: 2026-06-02\n---\nbody\n');
  const b = canonicalizeMarkdownStructural('---\nname: x\n---\nbody\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdownStructural: ordered-list checkbox variants normalized', function () {
  const a = canonicalizeMarkdownStructural('- [X] upper X\n* [x] lower x asterisk\n+ [ ] plus marker\n');
  const b = canonicalizeMarkdownStructural('- [ ] upper X\n* [ ] lower x asterisk\n+ [ ] plus marker\n');
  assert.strictEqual(a, b);
});

test('canonicalizeMarkdownStructural: PR placeholder variants (?, ??, ???) all normalized', function () {
  const variants = [
    'PR #?',
    'PR #??',
    'PR #???',
    'PR #1',
    'PR #12345',
  ];
  const hashes = variants.map(function (v) {
    return canonicalizeMarkdownStructural('# H\n\n' + v + '.\n');
  });
  for (let i = 1; i < hashes.length; i++) {
    assert.strictEqual(hashes[0], hashes[i]);
  }
});

test('canonicalizeMarkdownStructural: still applies base canonicalization (BOM + CRLF)', function () {
  const variant = '﻿---\r\nname: x\r\nstatus: pending\r\n---\r\nbody\r\n';
  const clean = '---\nname: x\nstatus: done\n---\nbody\n';
  assert.strictEqual(canonicalizeMarkdownStructural(variant), canonicalizeMarkdownStructural(clean));
});

test('isPlanPath: matches .claude/plans/*.plan.md on POSIX + Windows separators', function () {
  assert.strictEqual(isPlanPath('.claude/plans/feature-x.plan.md'), true);
  assert.strictEqual(isPlanPath('/repo/.claude/plans/feature-x.plan.md'), true);
  assert.strictEqual(isPlanPath('C:\\repo\\.claude\\plans\\feature-x.plan.md'), true);
  assert.strictEqual(isPlanPath('.claude/plans/nested/feature-x.plan.md'), false);
});

test('isPlanPath: rejects non-plan paths', function () {
  assert.strictEqual(isPlanPath('.claude/prds/x.prd.md'), false);
  assert.strictEqual(isPlanPath('.claude/design/x.design.plan.md'), false);
  assert.strictEqual(isPlanPath('docs/x.md'), false);
  assert.strictEqual(isPlanPath('plans/x.plan.md'), false);
  assert.strictEqual(isPlanPath('.claude/plans/x.md'), false);
});

test('planAwareMarkdownHash: plan path uses structural canonicalization', function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-planaware-'));
  const planDir = path.join(dir, '.claude', 'plans');
  fs.mkdirSync(planDir, { recursive: true });
  const pendingPath = path.join(planDir, 'a.plan.md');
  const donePath = path.join(planDir, 'b.plan.md');
  fs.writeFileSync(pendingPath, '---\nname: a\nstatus: pending\n---\nbody\n', 'utf8');
  fs.writeFileSync(donePath, '---\nname: a\nstatus: done\n---\nbody\n', 'utf8');
  assert.strictEqual(planAwareMarkdownHash(pendingPath), planAwareMarkdownHash(donePath));
});

test('planAwareMarkdownHash: non-plan path falls back to legacy markdownHash', function () {
  const a = tmpFile('---\nname: a\nstatus: pending\n---\nbody\n');
  const b = tmpFile('---\nname: a\nstatus: done\n---\nbody\n');
  assert.notStrictEqual(planAwareMarkdownHash(a), planAwareMarkdownHash(b));
  assert.strictEqual(planAwareMarkdownHash(a), markdownHash(a));
});
