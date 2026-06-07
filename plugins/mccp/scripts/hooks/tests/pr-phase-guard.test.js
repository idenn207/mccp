'use strict';

// v0.2.8 Task 2.6.1 R1-F1 + R2-F1 + R3-F1 absorption — pr-phase-guard tests.
//
// 4-axis:
//   1. Bash allowlist regex catalog
//   2. Bash blocklist patterns
//   3. Write-tool (Edit/Write/MultiEdit/NotebookEdit) blanket deny
//   4. lockActive() subphase filter (non-codex-review = null)

const test = require('node:test');
const assert = require('node:assert');
const guard = require('../pr-phase-guard');

// ──────────────────────────────────────────────────────────────────
// Axis 1: Bash allowlist
// ──────────────────────────────────────────────────────────────────

test('Bash allow: git status', () => {
  const r = guard.classifyBashCommand('git status --short');
  assert.strictEqual(r.decision, 'allow');
});

test('Bash allow: git log', () => {
  const r = guard.classifyBashCommand('git log --oneline -5');
  assert.strictEqual(r.decision, 'allow');
});

test('Bash allow: git diff', () => {
  const r = guard.classifyBashCommand('git diff origin/main..HEAD --stat');
  assert.strictEqual(r.decision, 'allow');
});

test('Bash allow: git rev-parse HEAD', () => {
  const r = guard.classifyBashCommand('git rev-parse HEAD');
  assert.strictEqual(r.decision, 'allow');
});

test('Bash allow: gh api (default GET)', () => {
  const r = guard.classifyBashCommand('gh api repos/foo/bar/pulls/123');
  assert.strictEqual(r.decision, 'allow');
});

test('Bash allow: gh pr view', () => {
  const r = guard.classifyBashCommand('gh pr view 42');
  assert.strictEqual(r.decision, 'allow');
});

test('Bash allow: cat for file inspection', () => {
  const r = guard.classifyBashCommand('cat README.md');
  assert.strictEqual(r.decision, 'allow');
});

test('Bash allow: receipt validate via node CLI', () => {
  const r = guard.classifyBashCommand('node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" validate --command mccp:pr');
  assert.strictEqual(r.decision, 'allow');
});

test('Bash allow: pr-phase-lock.js read', () => {
  const r = guard.classifyBashCommand('node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-lock.js" read');
  assert.strictEqual(r.decision, 'allow');
});

test('Bash allow: codex-invoke.js (Codex itself must run during subphase)', () => {
  const r = guard.classifyBashCommand('node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js" adversarial-review --json');
  assert.strictEqual(r.decision, 'allow');
});

// ──────────────────────────────────────────────────────────────────
// Axis 2: Bash blocklist
// ──────────────────────────────────────────────────────────────────

test('Bash deny: git commit', () => {
  const r = guard.classifyBashCommand('git commit -m "rogue fix"');
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /mutation pattern/);
});

test('Bash deny: git push', () => {
  const r = guard.classifyBashCommand('git push -u origin HEAD');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: gh pr create', () => {
  const r = guard.classifyBashCommand('gh pr create --title "fix"');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: rm', () => {
  const r = guard.classifyBashCommand('rm -rf foo/');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: mv', () => {
  const r = guard.classifyBashCommand('mv a.txt b.txt');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: npm install', () => {
  const r = guard.classifyBashCommand('npm install lodash');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: gh api with -X POST', () => {
  const r = guard.classifyBashCommand('gh api repos/foo/bar/issues -X POST -f title=test');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: file redirect (>)', () => {
  const r = guard.classifyBashCommand('echo "x" > some-file.txt');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: ambiguous command (default-deny)', () => {
  const r = guard.classifyBashCommand('some-random-tool --foo');
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /default-deny/);
});

test('Bash deny: empty command', () => {
  const r = guard.classifyBashCommand('   ');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: sed -i in-place edit', () => {
  const r = guard.classifyBashCommand('sed -i "s/foo/bar/" file.txt');
  assert.strictEqual(r.decision, 'deny');
});

// ──────────────────────────────────────────────────────────────────
// Axis 3: Write-tool blanket deny (verified via the WRITE_TOOLS set)
// ──────────────────────────────────────────────────────────────────

test('WRITE_TOOLS set includes the canonical mutation-capable tool names', () => {
  assert.ok(guard.WRITE_TOOLS.has('Edit'));
  assert.ok(guard.WRITE_TOOLS.has('Write'));
  assert.ok(guard.WRITE_TOOLS.has('MultiEdit'));
  assert.ok(guard.WRITE_TOOLS.has('NotebookEdit'));
  assert.strictEqual(guard.WRITE_TOOLS.has('Bash'), false,
    'Bash is NOT a blanket-deny tool — it has the sub-allow rule');
});

test('extractFilePath: Edit input', () => {
  const fp = guard.extractFilePath('Edit', { file_path: '/abs/path.js' });
  assert.strictEqual(fp, '/abs/path.js');
});

test('extractFilePath: NotebookEdit input', () => {
  const fp = guard.extractFilePath('NotebookEdit', { notebook_path: '/abs/n.ipynb' });
  assert.strictEqual(fp, '/abs/n.ipynb');
});

test('extractFilePath: unknown tool returns null', () => {
  const fp = guard.extractFilePath('Bash', { command: 'ls' });
  assert.strictEqual(fp, null);
});

// ──────────────────────────────────────────────────────────────────
// Axis 4: lockActive subphase filter
// ──────────────────────────────────────────────────────────────────

test('lockActive returns null when lock module unavailable', () => {
  const r = guard.lockActive(null, process.cwd());
  assert.strictEqual(r, null);
});

test('lockActive returns null when lock file absent', () => {
  // Build a fake lock module that returns no lock
  const fakeLock = {
    repoRoot: function () { return process.cwd(); },
    readLock: function () { return null; },
    SUBPHASE_DEFAULT: 'codex-review',
  };
  const r = guard.lockActive(fakeLock, process.cwd());
  assert.strictEqual(r, null);
});

test('lockActive returns null when subphase != codex-review', () => {
  const fakeLock = {
    repoRoot: function () { return process.cwd(); },
    readLock: function () {
      return { run_id: 'x', subphase: 'pr-create', pid: 1 };
    },
    SUBPHASE_DEFAULT: 'codex-review',
  };
  const r = guard.lockActive(fakeLock, process.cwd());
  assert.strictEqual(r, null);
});

test('lockActive returns lock metadata when subphase = codex-review', () => {
  const fakeLock = {
    repoRoot: function () { return '/repo'; },
    readLock: function () {
      return { run_id: 'rid-1', subphase: 'codex-review', pid: 1 };
    },
    SUBPHASE_DEFAULT: 'codex-review',
  };
  const r = guard.lockActive(fakeLock, '/repo');
  assert.ok(r);
  assert.strictEqual(r.root, '/repo');
  assert.strictEqual(r.lock.run_id, 'rid-1');
});

test('lockActive returns null on parse error in lock file', () => {
  const fakeLock = {
    repoRoot: function () { return '/repo'; },
    readLock: function () { return { _parse_error: 'bad json' }; },
    SUBPHASE_DEFAULT: 'codex-review',
  };
  const r = guard.lockActive(fakeLock, '/repo');
  assert.strictEqual(r, null);
});

// ──────────────────────────────────────────────────────────────────
// Axis 5: hooks.json registration invariant
//
// Codex Round-1 F1 (CRITICAL, confidence 0.97) absorbed: the pre-guard
// block was registered under PreCompact instead of PreToolUse. PreCompact
// fires for context compaction, not before tool execution, so the lock
// could be active but writes would not be blocked. The Round-1 fix moves
// the block; this regression test parses hooks.json and asserts the
// registration invariant so the same mistake cannot reland silently.
// ──────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');

function loadHooksJson() {
  const p = path.join(__dirname, '..', '..', '..', 'hooks', 'hooks.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('hooks.json: mccp:pr-phase-guard:pre is registered under PreToolUse', () => {
  const j = loadHooksJson();
  const pre = (j.hooks && j.hooks.PreToolUse) || [];
  const found = pre.find(function (h) { return h && h.id === 'mccp:pr-phase-guard:pre'; });
  assert.ok(found, 'mccp:pr-phase-guard:pre must be present in hooks.PreToolUse');
  assert.strictEqual(found.matcher, 'Edit|Write|MultiEdit|NotebookEdit|Bash');
  assert.ok(Array.isArray(found.hooks) && found.hooks.length > 0, 'hooks array must be non-empty');
  assert.ok(/pr-phase-guard\.js/.test(found.hooks[0].command), 'command must invoke pr-phase-guard.js');
});

test('hooks.json: mccp:pr-phase-guard:pre is NOT registered under PreCompact', () => {
  const j = loadHooksJson();
  const pc = (j.hooks && j.hooks.PreCompact) || [];
  const found = pc.find(function (h) { return h && h.id === 'mccp:pr-phase-guard:pre'; });
  assert.strictEqual(found, undefined, 'mccp:pr-phase-guard:pre must NOT appear under hooks.PreCompact');
});

test('hooks.json: mccp:pr-phase-guard:post stays under PostToolUse (audit ledger)', () => {
  const j = loadHooksJson();
  const post = (j.hooks && j.hooks.PostToolUse) || [];
  const found = post.find(function (h) { return h && h.id === 'mccp:pr-phase-guard:post'; });
  assert.ok(found, 'mccp:pr-phase-guard:post must be present in hooks.PostToolUse for audit ledger');
});
