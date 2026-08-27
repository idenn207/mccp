'use strict';

// santa-delta-review M3 Task 4 — hook-trace repo-root anchoring (DD6).
//
// Both trace-writing hooks used to take `event.cwd` as the repository root. A
// single failed Bash call made from a subdirectory therefore created
// `plugins/mccp/scripts/.claude/state/hook-trace/<sid>/` — measured during the
// M3 plan session. Stray directories are the visible half; the load-bearing
// half is that a shard and the `.end` marker can land in DIFFERENT session
// directories, after which the next session's crash scan reports a crash that
// never happened (§3.2, the failure mode v1.20.5 closed).
//
// Three assertions, deliberately separate:
//   1. a subdirectory cwd still writes to ONE place — the repo root — and the
//      shard and the `.end` marker share that session directory;
//   2. the user-facing surface carries no repo-root absolute path — scoped to
//      the git-resolved path, which is the only case the implementation can
//      honour (DD6-3);
//   3. a non-git cwd keeps the old fallback, emits the original path, and
//      throws from no entry point.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const POST_TOOL_USE_FAILURE = path.join(PLUGIN_ROOT, 'scripts', 'hooks', 'post-tool-use-failure.js');
const SESSION_END_TRACE = path.join(PLUGIN_ROOT, 'scripts', 'hooks', 'session-end-trace.js');
const hookTrace = require('../../lib/hook-trace');

const TRACE_REL = path.join('.claude', 'state', 'hook-trace');
const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function mkRepo() {
  // realpath: macOS /var -> /private/var and Windows 8.3 short paths would
  // otherwise make the `git rev-parse` answer differ from the fixture path.
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-trace-anchor-')));
  execFileSync('git', ['init', '-q'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo, stdio: 'ignore' });
  const sub = path.join(repo, 'plugins', 'mccp', 'scripts');
  fs.mkdirSync(sub, { recursive: true });
  return { repo, sub };
}

function runHook(hookPath, cwd, event) {
  return spawnSync(process.execPath, [hookPath], {
    cwd: cwd,
    input: JSON.stringify(event),
    encoding: 'utf8',
    timeout: 30000,
  });
}

// Every `.claude/state/hook-trace` directory anywhere under the fixture. More
// than one means the hooks disagreed about where the repository root is.
function traceDirsUnder(root) {
  const found = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_e) { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (e.name === '.git') continue;
      if (full.endsWith(TRACE_REL)) { found.push(full); continue; }
      walk(full);
    }
  })(root);
  return found;
}

test('단언 1 — 하위 디렉토리 cwd에서도 shard와 .end가 저장소 루트 한 곳에 모인다', () => {
  const { repo, sub } = mkRepo();

  // The failing tool call is made from a subdirectory — exactly the shape that
  // was measured creating `plugins/mccp/scripts/.claude/state/hook-trace/`.
  const failure = runHook(POST_TOOL_USE_FAILURE, sub, {
    cwd: sub,
    session_id: SESSION_ID,
    tool_use_id: 'toolu_anchor01',
    tool_name: 'Bash',
    error: 'boom',
  });
  assert.equal(failure.status, 0, 'PostToolUseFailure hook exits 0');

  // The session ends from the repo root — the other half of the split.
  const ended = runHook(SESSION_END_TRACE, repo, {
    cwd: repo,
    session_id: SESSION_ID,
  });
  assert.equal(ended.status, 0, 'SessionEnd hook exits 0');

  const dirs = traceDirsUnder(repo);
  assert.deepEqual(dirs, [path.join(repo, TRACE_REL)],
    'exactly one hook-trace root, and it is the repository root');

  const sessDir = path.join(repo, TRACE_REL, SESSION_ID);
  const names = fs.readdirSync(sessDir);
  assert.ok(names.some((n) => n.endsWith('.jsonl')), 'shard landed in the session dir');
  assert.ok(names.includes('.end'), '.end marker landed in the SAME session dir');
});

test('단언 2 — git 해석이 성공한 경로에서 사용자 표면에 저장소 절대경로가 0건이다', () => {
  const { repo, sub } = mkRepo();
  const res = runHook(POST_TOOL_USE_FAILURE, sub, {
    cwd: sub,
    session_id: SESSION_ID,
    tool_use_id: 'toolu_anchor02',
    tool_name: 'Bash',
    error: 'boom',
  });
  assert.equal(res.status, 0);

  const payload = JSON.parse(res.stdout);
  const surface = [
    payload.systemMessage || '',
    (payload.hookSpecificOutput && payload.hookSpecificOutput.additionalContext) || '',
  ].join('\n');

  // The claim is scoped: no REPO-ROOT absolute path on the surface. Both
  // separator spellings are checked because the value is built with path.join.
  const rootVariants = [repo, repo.split(path.sep).join('/')];
  for (const variant of rootVariants) {
    assert.ok(surface.indexOf(variant) === -1,
      'surface must not carry the repo-root absolute path: ' + variant + '\n' + surface);
  }
  // ...and it still says something useful: the repo-relative trace path.
  assert.match(surface, /\.claude\/state\/hook-trace\//,
    'the repo-relative trace path is still surfaced');
  assert.ok(surface.indexOf('..') === -1 || !/\.\.[\/]/.test(surface),
    'no parent-escape chain is surfaced');
});

test('단언 3 — 비-git cwd는 종전 fallback이고 어떤 경로에서도 던지지 않는다', () => {
  const nonGit = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-trace-nogit-')));

  // Oracle level: fallback is `event.cwd`, and neither helper throws on junk.
  assert.equal(hookTrace.resolveRepoRoot({ cwd: nonGit }), nonGit);
  [undefined, null, 0, '', [], {}, { cwd: 42 }].forEach((bad) => {
    assert.doesNotThrow(() => hookTrace.resolveRepoRoot(bad));
  });
  [[null, null], [undefined, '/abs'], ['', ''], [nonGit, 42], [42, nonGit]].forEach((pair) => {
    assert.doesNotThrow(() => hookTrace.toRepoRelative(pair[0], pair[1]));
  });

  // Outside the root the ORIGINAL path is returned — a `..` chain on the
  // surface would be worse than an absolute path (DD6-3, stated residue).
  const outside = path.join(os.tmpdir(), 'somewhere-else', 'x.jsonl');
  assert.equal(hookTrace.toRepoRelative(nonGit, outside), outside);

  // Hook level: both hooks exit 0 from a non-git cwd and still emit a surface.
  const failure = runHook(POST_TOOL_USE_FAILURE, nonGit, {
    cwd: nonGit,
    session_id: SESSION_ID,
    tool_use_id: 'toolu_anchor03',
    tool_name: 'Bash',
    error: 'boom',
  });
  assert.equal(failure.status, 0, 'no throw from a non-git cwd');
  const payload = JSON.parse(failure.stdout);
  assert.match(payload.systemMessage, /PostToolUseFailure/);

  const ended = runHook(SESSION_END_TRACE, nonGit, { cwd: nonGit, session_id: SESSION_ID });
  assert.equal(ended.status, 0, 'SessionEnd hook exits 0 from a non-git cwd');
});
