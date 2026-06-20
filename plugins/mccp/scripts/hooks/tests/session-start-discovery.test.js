'use strict';

// v1.4.0-m2 — summarizeOtherActiveLedgers privacy regression.
//
// HIGH-1 from the M2 local code review: when a sibling worktree's `cwd`
// resolved outside the *current* worktree root (the typical sibling layout
// `<repo>/.worktrees/<branch>`), the previous `maskPath(cwd, currentWorktree)`
// path fell through its `rel.startsWith('..')` guard and returned the raw
// absolute path — leaking the operator's username into Claude's first
// system-reminder on every multi-worktree SessionStart.
//
// Fix narrows the surface to `path.basename(cwd)`, which is enough context
// for the "which sibling is alive?" question and is leak-free regardless of
// how worktrees are laid out on disk.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sessionLedger = require('../../state/session-ledger');
const { summarizeOtherActiveLedgers } = require('../session-start');

const SELF_ID = '11111111-2222-3333-4444-555555555555';
const SIBLING_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function mkSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-discovery-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const projectRoot = path.join(root, 'repo');
  fs.mkdirSync(path.join(projectRoot, '.claude', 'state'), { recursive: true });
  return { root, home, projectRoot };
}

function fakeProjectContext(sandbox) {
  const projectId = 'abc123abc123';
  const projectsDir = path.join(sandbox.home, '.local', 'share', 'ecc-homunculus', 'projects');
  const projectDir = path.join(projectsDir, projectId);
  fs.mkdirSync(projectDir, { recursive: true });
  return { projectId, projectRoot: sandbox.projectRoot, projectDir, isGlobal: false };
}

test('summarizeOtherActiveLedgers — sibling cwd outside projectRoot is reduced to basename, no absolute-path leak', () => {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);

  // Self ledger — must be filtered out of the banner.
  sessionLedger.createLedger({
    sessionId: SELF_ID,
    cwd: sandbox.projectRoot,
    gitBranch: 'v1.4.0-multi-session-m2',
    projectContext: ctx,
  });

  // Sibling worktree whose cwd is OUTSIDE the current worktree root — the
  // exact shape that triggered the HIGH-1 leak before the fix.
  const externalCwd = process.platform === 'win32'
    ? 'C:\\Users\\someoneprivate\\projects\\sibling-worktree'
    : '/home/someoneprivate/projects/sibling-worktree';
  sessionLedger.createLedger({
    sessionId: SIBLING_ID,
    cwd: externalCwd,
    gitBranch: 'feat/sibling',
    projectContext: ctx,
  });

  const banner = summarizeOtherActiveLedgers(ctx, SELF_ID);
  assert.ok(banner, 'banner present when a sibling session exists');

  // Positive: basename surfaces so the user can identify which sibling is alive.
  assert.ok(banner.includes('sibling-worktree'),
    'sibling worktree basename is shown so the discovery banner stays useful');
  assert.ok(banner.includes('feat/sibling'),
    'branch label preserved');

  // Negative invariants — nothing username- or layout-revealing makes it in.
  assert.ok(!banner.includes('someoneprivate'),
    'username segment from absolute path must not leak into the banner');
  assert.ok(!banner.includes('C:\\Users'),
    'Windows-style absolute prefix must not leak');
  assert.ok(!banner.includes('/home/'),
    'POSIX-style absolute prefix must not leak');
  assert.ok(!banner.includes(externalCwd),
    'raw cwd string must not appear verbatim in the banner');

  // Self is filtered out.
  assert.ok(!banner.includes(SELF_ID.slice(0, 8)),
    'self session id must not appear in the "other sessions" banner');
});

test('summarizeOtherActiveLedgers — returns empty string when only self ledger exists', () => {
  const sandbox = mkSandbox();
  const ctx = fakeProjectContext(sandbox);
  sessionLedger.createLedger({
    sessionId: SELF_ID,
    cwd: sandbox.projectRoot,
    projectContext: ctx,
  });
  const banner = summarizeOtherActiveLedgers(ctx, SELF_ID);
  assert.strictEqual(banner, '', 'no other sessions → no banner');
});
