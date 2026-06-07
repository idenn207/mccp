'use strict';

// v0.2.8 Task 2.6.1 R1-F1 + R2-F1 + R3-F1 absorption — pr-phase-guard tests.
//
// v0.2.8 Task 2.6.1-followup F10 + F7 + F11 absorption:
//   F10 — BASH_ALLOW_PATTERNS reduced to ONE path-anchored helper pattern
//         + ≤5 read-only catalog patterns. Direct-node-CLI rows (e.g.
//         `node receipt/cli.js validate`) are intentionally NO LONGER
//         allowed — callers must invoke via pr-phase-helpers/*.js.
//   F7  — tokenizer FIRST: chain-split, comment-strip, indirect-invoke
//         and subshell deny + mutating-construct detection.
//   F11 — BLOCK rules: `pr-phase-lock.js enter` via Bash, reads of the
//         lock file, and MCCP_LOCK_TEST_ARGV_TOKEN=1 substring.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const guard = require('../pr-phase-guard');

// ─── Axis 1: Bash allowlist (post-F10 minimal catalog) ──────────────────

test('Bash allow: git status (read-only catalog)', () => {
  const r = guard.classifyBashCommand('git status --short');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: git log', () => {
  const r = guard.classifyBashCommand('git log --oneline -5');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: git diff', () => {
  const r = guard.classifyBashCommand('git diff origin/main..HEAD --stat');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: git rev-parse HEAD', () => {
  const r = guard.classifyBashCommand('git rev-parse HEAD');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: gh api (default GET)', () => {
  const r = guard.classifyBashCommand('gh api repos/foo/bar/pulls/123');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: gh pr view', () => {
  const r = guard.classifyBashCommand('gh pr view 42');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: gh auth status', () => {
  const r = guard.classifyBashCommand('gh auth status');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: mkdir -p .git/mccp/tmp (exact pattern)', () => {
  const r = guard.classifyBashCommand('mkdir -p .git/mccp/tmp');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

// ─── Axis 2: F10 — direct-node-CLI rows are NOW DENIED (intentional) ───

test('F10 Bash deny: direct node CLI (cat) — caller must route through helper', () => {
  const r = guard.classifyBashCommand('cat README.md');
  assert.strictEqual(r.decision, 'deny');
});

test('F10 Bash deny: direct receipt CLI — caller must use finalize-receipt helper', () => {
  const r = guard.classifyBashCommand('node "/x/scripts/receipt/cli.js" validate --command mccp:pr');
  assert.strictEqual(r.decision, 'deny');
});

test('F10 Bash deny: direct pr-phase-lock.js read — even read forbidden in Bash', () => {
  // F11 substring rule blocks 'pr-phase.lock' filename in cat/node/etc.
  const r = guard.classifyBashCommand('node "/x/scripts/lib/pr-phase-lock.js" read');
  // pr-phase-lock.js doesn't contain "pr-phase.lock" so this triggers default-deny
  // (no allowlist match) — either way DENY is correct.
  assert.strictEqual(r.decision, 'deny');
});

test('F10 Bash deny: direct codex-invoke — caller must use codex-runner helper', () => {
  const r = guard.classifyBashCommand('node "/x/scripts/lib/codex-invoke.js" adversarial-review --json');
  assert.strictEqual(r.decision, 'deny');
});

// ─── Axis 3: Bash blocklist (mutation patterns) ─────────────────────────

test('Bash deny: git commit', () => {
  const r = guard.classifyBashCommand('git commit -m "rogue fix"');
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /global-block|segment-block/);
});

test('Bash deny: git push', () => {
  assert.strictEqual(guard.classifyBashCommand('git push -u origin HEAD').decision, 'deny');
});

test('Bash deny: gh pr create', () => {
  assert.strictEqual(guard.classifyBashCommand('gh pr create --title "fix"').decision, 'deny');
});

test('Bash deny: rm', () => {
  assert.strictEqual(guard.classifyBashCommand('rm -rf foo/').decision, 'deny');
});

test('Bash deny: mv', () => {
  assert.strictEqual(guard.classifyBashCommand('mv a.txt b.txt').decision, 'deny');
});

test('Bash deny: npm install', () => {
  assert.strictEqual(guard.classifyBashCommand('npm install lodash').decision, 'deny');
});

test('Bash deny: gh api with -X POST', () => {
  assert.strictEqual(guard.classifyBashCommand('gh api repos/foo/bar/issues -X POST -f title=test').decision, 'deny');
});

test('Bash deny: file redirect (>)', () => {
  assert.strictEqual(guard.classifyBashCommand('echo "x" > some-file.txt').decision, 'deny');
});

test('Bash deny: ambiguous command (default-deny)', () => {
  const r = guard.classifyBashCommand('some-random-tool --foo');
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /default-deny/);
});

test('Bash deny: empty command', () => {
  assert.strictEqual(guard.classifyBashCommand('   ').decision, 'deny');
});

test('Bash deny: sed -i in-place edit', () => {
  assert.strictEqual(guard.classifyBashCommand('sed -i "s/foo/bar/" file.txt').decision, 'deny');
});

// ─── Axis 4: F7 tokenizer 14 bypass cases (acceptance criterion) ────────

test('F7 chain: git status; git commit → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('git status; git commit').decision, 'deny');
});

test('F7 chain: git status && git commit → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('git status && git commit').decision, 'deny');
});

test('F7 chain: git status || git commit → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('git status || git commit').decision, 'deny');
});

test('F7 indirect: eval "git commit -m fix" → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('eval "git commit -m fix"').decision, 'deny');
});

test('F7 indirect: bash -c "git commit -m fix" → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('bash -c "git commit -m fix"').decision, 'deny');
});

test('F7 indirect: sh -c "git push" → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('sh -c "git push"').decision, 'deny');
});

test('F7 subshell: $(git commit -m fix) → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('$(git commit -m fix)').decision, 'deny');
});

test('F7 subshell: `git commit -m fix` → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('`git commit -m fix`').decision, 'deny');
});

test('F7 mutating: echo x>file (no-space redirect) → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('echo x>file').decision, 'deny');
});

test('F7 mutating: cmd 2>file (fd redirect) → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('cmd 2>file').decision, 'deny');
});

test('F7 mutating: echo x | tee file (pipe to mutator) → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('echo x | tee file').decision, 'deny');
});

test('F7 mutating: awk system("rm x") → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand("awk 'BEGIN{system(\"rm x\")}'").decision, 'deny');
});

test('F7 mutating: find -delete → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('find . -name x -delete').decision, 'deny');
});

test('F7 mutating: find -exec rm → DENY', () => {
  assert.strictEqual(guard.classifyBashCommand('find . -name x -exec rm {} \\;').decision, 'deny');
});

// F7 expected-pass: chain inside comment becomes inert
test('F7 comment-strip: "git status # safe ; git commit" → bare git status PASSES (chain stripped)', () => {
  // Per plan body adjusted expectation: comment-strip kills the chain, so the
  // bare `git status` is allowed via catalog.
  const r = guard.classifyBashCommand('git status # safe ; git commit');
  assert.strictEqual(r.decision, 'allow', 'comment-stripped command is allowlist-clean');
});

// ─── Axis 5: F11 lock-related block patterns ────────────────────────────

test('F11 deny: pr-phase-lock.js enter via Bash (codex-runner only path)', () => {
  const r = guard.classifyBashCommand('node "/x/scripts/lib/pr-phase-lock.js" enter --run-id abc');
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /pr-phase-lock\\.js|enter/);
});

test('F11 deny: cat .claude/state/pr-phase.lock', () => {
  const r = guard.classifyBashCommand('cat .claude/state/pr-phase.lock');
  assert.strictEqual(r.decision, 'deny');
});

test('F11 deny: head -n5 .claude/state/pr-phase.lock', () => {
  const r = guard.classifyBashCommand('head -n5 .claude/state/pr-phase.lock');
  assert.strictEqual(r.decision, 'deny');
});

test('F11 deny: MCCP_LOCK_TEST_ARGV_TOKEN=1 substring (any segment)', () => {
  const r = guard.classifyBashCommand('MCCP_LOCK_TEST_ARGV_TOKEN=1 git status');
  assert.strictEqual(r.decision, 'deny');
});

// ─── Axis 6: F10 helper-path allowlist + content-hash gate ──────────────

test('F10 helper-path: matches under realpath(CLAUDE_PLUGIN_ROOT)/scripts/lib/pr-phase-helpers/*.js', () => {
  const pat = guard.helperPathPattern();
  const helpersDir = path.join(process.env.CLAUDE_PLUGIN_ROOT
    || path.resolve(__dirname, '..', '..', '..'), 'scripts', 'lib', 'pr-phase-helpers').replace(/\\/g, '/');
  const sample = 'node "' + helpersDir + '/codex-runner.js" --base main';
  assert.match(sample.replace(/\\/g, '/'), pat);
});

test('F10 helper-path: underscore-prefix helpers NOT matched (_args.js)', () => {
  const pat = guard.helperPathPattern();
  const helpersDir = path.join(process.env.CLAUDE_PLUGIN_ROOT
    || path.resolve(__dirname, '..', '..', '..'), 'scripts', 'lib', 'pr-phase-helpers').replace(/\\/g, '/');
  const sample = 'node "' + helpersDir + '/_args.js"';
  assert.ok(!pat.test(sample.replace(/\\/g, '/')), '_args.js (internal) must not match');
});

test('F10 verifyHelperContent: missing manifest returns ok=false', () => {
  const result = guard.verifyHelperContent('node /tmp/fake.js', null);
  assert.strictEqual(result.ok, false);
});

test('F10 verifyHelperContent: helper not in manifest returns ok=false', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-vrf-'));
  const helper = path.join(tmpDir, 'h.js');
  fs.writeFileSync(helper, '// content\n');
  const result = guard.verifyHelperContent('node ' + helper, {});
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /not-in-manifest/);
});

test('F10 verifyHelperContent: content matches manifest → ok=true', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-vrf-'));
  const helper = path.join(tmpDir, 'h.js');
  fs.writeFileSync(helper, '// v1\n');
  const realP = fs.realpathSync(helper);
  const expected = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(realP)).digest('hex');
  const manifest = {}; manifest[realP] = expected;
  const result = guard.verifyHelperContent('node ' + helper, manifest);
  assert.strictEqual(result.ok, true);
});

test('F10 verifyHelperContent: content modified after manifest → DENY (helper-content-changed-during-lock)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-vrf-'));
  const helper = path.join(tmpDir, 'h.js');
  fs.writeFileSync(helper, '// v1\n');
  const realP = fs.realpathSync(helper);
  const expected = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(realP)).digest('hex');
  const manifest = {}; manifest[realP] = expected;
  // Mutate helper after manifest was captured
  fs.writeFileSync(helper, '// v2 attacker payload\n');
  const result = guard.verifyHelperContent('node ' + helper, manifest);
  assert.strictEqual(result.ok, false);
  assert.match(result.reason, /helper-content-changed-during-lock/);
});

test('F10 classifyBashCommand allows helper-path when content matches manifest', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-clf-'));
  const helper = path.join(tmpDir, 'demo.js');
  fs.writeFileSync(helper, '// v1\n');
  const realP = fs.realpathSync(helper);
  const expected = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(realP)).digest('hex');
  const manifest = {}; manifest[realP] = expected;
  // Use override pattern matching the tmpDir so we don't depend on real PLUGIN_ROOT
  const pattern = new RegExp('^\\s*node\\s+["\']?' +
    tmpDir.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '/[a-z][a-z0-9-]*\\.js["\']?(\\s|$)');
  const cmd = 'node ' + helper.replace(/\\/g, '/') + ' --foo';
  const r = guard.classifyBashCommand(cmd, {
    helperManifest: manifest,
    helperPathPattern: pattern,
  });
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('F10 classifyBashCommand: helper-path with mutated content → DENY', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-clf-'));
  const helper = path.join(tmpDir, 'demo.js');
  fs.writeFileSync(helper, '// v1\n');
  const realP = fs.realpathSync(helper);
  const expected = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(realP)).digest('hex');
  const manifest = {}; manifest[realP] = expected;
  // Mutate before invocation
  fs.writeFileSync(helper, '// v2 attack\n');
  const pattern = new RegExp('^\\s*node\\s+["\']?' +
    tmpDir.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '/[a-z][a-z0-9-]*\\.js["\']?(\\s|$)');
  const cmd = 'node ' + helper.replace(/\\/g, '/');
  const r = guard.classifyBashCommand(cmd, {
    helperManifest: manifest,
    helperPathPattern: pattern,
  });
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /helper-content/);
});

test('F10+F7 tokenizer-first: node helper.js; git commit → DENY at chain-split (not helper match)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-tof-'));
  const helper = path.join(tmpDir, 'demo.js');
  fs.writeFileSync(helper, '// v1\n');
  const realP = fs.realpathSync(helper);
  const expected = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(realP)).digest('hex');
  const manifest = {}; manifest[realP] = expected;
  const pattern = new RegExp('^\\s*node\\s+["\']?' +
    tmpDir.replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '/[a-z][a-z0-9-]*\\.js["\']?(\\s|$)');
  const cmd = 'node ' + helper.replace(/\\/g, '/') + '; git commit';
  const r = guard.classifyBashCommand(cmd, {
    helperManifest: manifest,
    helperPathPattern: pattern,
  });
  assert.strictEqual(r.decision, 'deny', 'chain-split rejects mutator segment 2');
});

// ─── Axis 7: tokenizer + utilities ───────────────────────────────────────

test('stripComment respects quoted hash', () => {
  assert.strictEqual(guard.stripComment('echo "hello # not-comment" # tail'),
    'echo "hello # not-comment" ');
});

test('splitSegments splits on ; && || at depth 0', () => {
  const segs = guard.splitSegments('a; b && c || d');
  assert.deepStrictEqual(segs, ['a', 'b', 'c', 'd']);
});

test('splitSegments preserves quoted separators', () => {
  const segs = guard.splitSegments('echo "a;b" && echo c');
  assert.deepStrictEqual(segs, ['echo "a;b"', 'echo c']);
});

// ─── Axis 8: Write-tool blanket deny (verified via the WRITE_TOOLS set) ─

test('WRITE_TOOLS set includes the canonical mutation-capable tool names', () => {
  assert.ok(guard.WRITE_TOOLS.has('Edit'));
  assert.ok(guard.WRITE_TOOLS.has('Write'));
  assert.ok(guard.WRITE_TOOLS.has('MultiEdit'));
  assert.ok(guard.WRITE_TOOLS.has('NotebookEdit'));
  assert.strictEqual(guard.WRITE_TOOLS.has('Bash'), false,
    'Bash is NOT a blanket-deny tool — it has the tokenizer + sub-allow rule');
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

// ─── Axis 9: lockActive subphase filter ─────────────────────────────────

test('lockActive returns null when lock module unavailable', () => {
  assert.strictEqual(guard.lockActive(null, process.cwd()), null);
});

test('lockActive returns null when lock file absent', () => {
  const fakeLock = {
    repoRoot: function () { return process.cwd(); },
    readLock: function () { return null; },
    SUBPHASE_DEFAULT: 'codex-review',
  };
  assert.strictEqual(guard.lockActive(fakeLock, process.cwd()), null);
});

test('lockActive returns null when subphase != codex-review', () => {
  const fakeLock = {
    repoRoot: function () { return process.cwd(); },
    readLock: function () { return { run_id: 'x', subphase: 'pr-create', pid: 1 }; },
    SUBPHASE_DEFAULT: 'codex-review',
  };
  assert.strictEqual(guard.lockActive(fakeLock, process.cwd()), null);
});

test('lockActive returns lock metadata when subphase = codex-review', () => {
  const fakeLock = {
    repoRoot: function () { return '/repo'; },
    readLock: function () { return { run_id: 'rid-1', subphase: 'codex-review', pid: 1 }; },
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
  assert.strictEqual(guard.lockActive(fakeLock, '/repo'), null);
});

// ─── Axis 10: hooks.json registration invariant ─────────────────────────

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
