'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dk = require('../dedupe-key');

function mkGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-dedupe-key-'));
  execFileSync('git', ['init', '--initial-branch=master', '--quiet'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n', 'utf8');
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial', '--quiet'], { cwd: dir, stdio: 'ignore' });
  // git rev-parse should resolve symlinks the same way the dedupe-key
  // module's child_process call will, so use the resolved repo path.
  return fs.realpathSync(dir);
}

test('same plan path + same decision_id → same key', () => {
  const repo = mkGitRepo();
  fs.writeFileSync(path.join(repo, 'plan.md'), 'x');
  const a = dk.dedupeKey('plan.md', 'foo', { cwd: repo });
  const b = dk.dedupeKey('plan.md', 'foo', { cwd: repo });
  assert.strictEqual(a, b);
  assert.match(a, /^[0-9a-f]{24}$/);
});

test('same plan path + different decision_id → different keys', () => {
  const repo = mkGitRepo();
  const a = dk.dedupeKey('plan.md', 'foo', { cwd: repo });
  const b = dk.dedupeKey('plan.md', 'bar', { cwd: repo });
  assert.notStrictEqual(a, b);
});

test('different plan paths + same decision_id → different keys', () => {
  const repo = mkGitRepo();
  const a = dk.dedupeKey('one.md', 'shared-slug', { cwd: repo });
  const b = dk.dedupeKey('two.md', 'shared-slug', { cwd: repo });
  assert.notStrictEqual(a, b);
});

test('empty plan path → planSha12 collapses to all-zero', () => {
  assert.strictEqual(dk.planSha12(''), '000000000000');
  const a = dk.dedupeKey('', 'pr-decision', { cwd: process.cwd() });
  const b = dk.dedupeKey(null, 'pr-decision', { cwd: process.cwd() });
  assert.strictEqual(a, b);
});

test('feat/foo branch slug normalizes to "foo"', () => {
  assert.strictEqual(dk.normalizeSlug('feat/foo'), 'foo');
  assert.strictEqual(dk.normalizeSlug('fix/bug-name'), 'bug-name');
  assert.strictEqual(dk.normalizeSlug('chore/cleanup'), 'cleanup');
});

test('Windows backslashes normalize to forward-slash', () => {
  // Use a non-git tmp dir so we exercise the no-git path with absolute paths.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-dedupe-key-noset-'));
  fs.writeFileSync(path.join(tmp, 'plan.md'), 'x');
  const norm = dk.normalizePlanPath(path.join(tmp, 'sub', 'plan.md'), { cwd: tmp });
  assert.ok(!norm.includes('\\'), 'expected forward slashes only, got: ' + norm);
});

test('absolute and relative paths to same file yield same key', () => {
  const repo = mkGitRepo();
  const absA = path.join(repo, 'plan.md');
  fs.writeFileSync(absA, 'x');
  const keyAbs = dk.dedupeKey(absA, 'slug', { cwd: repo });
  const keyRel = dk.dedupeKey('plan.md', 'slug', { cwd: repo });
  assert.strictEqual(keyAbs, keyRel);
});

test('dedupeKeyFromReceipt reads plan_path + decision_id from receipt shape', () => {
  const repo = mkGitRepo();
  const direct = dk.dedupeKey('plan.md', 'foo', { cwd: repo });
  const fromReceipt = dk.dedupeKeyFromReceipt({
    decision_id: 'foo',
    subject: { plan_path: 'plan.md' },
  }, { cwd: repo });
  assert.strictEqual(direct, fromReceipt);
});

test('dedupeKeyFromReceipt handles missing plan_path as empty', () => {
  const direct = dk.dedupeKey('', 'pr-slug', { cwd: process.cwd() });
  const fromReceipt = dk.dedupeKeyFromReceipt({ decision_id: 'pr-slug', subject: {} });
  assert.strictEqual(direct, fromReceipt);
});

test('decisionId with non-slug chars falls back to default (mirror receipt CLI)', () => {
  assert.strictEqual(dk.normalizeSlug('Hello World!'), 'default');
  assert.strictEqual(dk.normalizeSlug('  spaced  out  '), 'default');
  assert.strictEqual(dk.normalizeSlug(''), 'default');
  assert.strictEqual(dk.normalizeSlug(null), 'default');
  assert.strictEqual(dk.normalizeSlug('feat/foo_bar'), 'default');
});

test('decisionId longer than 80 chars falls back to default (mirror SLUG_RE)', () => {
  const long = 'a'.repeat(200);
  assert.strictEqual(dk.normalizeSlug(long), 'default');
});

test('valid kebab-case slugs round-trip unchanged', () => {
  assert.strictEqual(dk.normalizeSlug('foo'), 'foo');
  assert.strictEqual(dk.normalizeSlug('foo-bar'), 'foo-bar');
  assert.strictEqual(dk.normalizeSlug('feat/foo-bar'), 'foo-bar');
  assert.strictEqual(dk.normalizeSlug('a1-b2-c3'), 'a1-b2-c3');
});

test('SLUG_RE matches receipt/decision.js SLUG_RE exactly', () => {
  const receiptDecision = require('../../receipt/decision');
  assert.strictEqual(dk.SLUG_RE.toString(), receiptDecision.SLUG_RE.toString());
});

test('dedupe key output length is 24 hex chars', () => {
  const k = dk.dedupeKey('any.md', 'any', { cwd: process.cwd() });
  assert.match(k, /^[0-9a-f]{24}$/);
});
