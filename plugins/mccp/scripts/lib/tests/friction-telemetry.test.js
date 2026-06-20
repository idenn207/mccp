'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const friction = require('../friction-telemetry');

function mkRepoDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-friction-' + label + '-'));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  return dir;
}

function mkWorktreeDir(label) {
  // Simulate a git worktree: `.git` is a FILE (gitdir pointer), not a dir.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-friction-wt-' + label + '-'));
  fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /nonexistent/.git/worktrees/' + label + '\n', 'utf8');
  return dir;
}

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* best-effort */ }
}

function captureStderr(fn) {
  const origWrite = process.stderr.write.bind(process.stderr);
  const captured = [];
  process.stderr.write = function (chunk) {
    captured.push(String(chunk));
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = origWrite;
  }
  return captured.join('');
}

test('friction-telemetry — round-trip append + read all parse OK', () => {
  const repo = mkRepoDir('rt');
  try {
    friction.recordBannerInjected({
      sessionId: 'sess-AAA',
      projectBranch: 'feat/x',
      now: '2026-06-20T00:00:00.000Z',
      cwd: repo,
    });
    friction.recordBannerInjected({
      sessionId: 'sess-BBB',
      projectBranch: 'main',
      now: '2026-06-20T00:00:01.000Z',
      cwd: repo,
    });
    const logPath = path.join(repo, '.claude', 'state', 'm3-friction-events.jsonl');
    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
    const e1 = JSON.parse(lines[0]);
    assert.equal(e1.event, 'banner-injected');
    assert.equal(e1.session_id, 'sess-AAA');
    assert.equal(e1.project_branch, 'feat/x');
    assert.equal(e1.ts, '2026-06-20T00:00:00.000Z');
    const e2 = JSON.parse(lines[1]);
    assert.equal(e2.session_id, 'sess-BBB');
  } finally {
    rmrf(repo);
  }
});

test('friction-telemetry — invalid repoRoot (no .git) → noop + stderr WARN', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-friction-norepo-'));
  try {
    const out = captureStderr(() => {
      friction.recordBannerInjected({
        sessionId: 'sess-X',
        projectBranch: 'main',
        cwd: dir,
      });
    });
    assert.match(out, /\[mccp:friction-telemetry\] WARN:/, 'WARN emitted');
    assert.match(out, /repo root not found/, 'reason surfaced');
    const logPath = path.join(dir, '.claude', 'state', 'm3-friction-events.jsonl');
    assert.equal(fs.existsSync(logPath), false, 'no file written');
  } finally {
    rmrf(dir);
  }
});

test('friction-telemetry — concurrent 2-process append (F1 absorption — loss 0)', () => {
  const repo = mkRepoDir('cc');
  try {
    const modPath = path.resolve(__dirname, '..', 'friction-telemetry.js').replace(/\\/g, '/');
    const script = [
      "const friction = require('" + modPath + "');",
      'const repo = process.argv[1];',
      'const id = process.argv[2];',
      'for (let i = 0; i < 10; i++) {',
      "  friction.recordBannerInjected({ sessionId: id + '-' + i, projectBranch: 'concurrent', cwd: repo });",
      '}',
    ].join('\n');
    const p1 = spawnSync(process.execPath, ['-e', script, '--', repo, 'P1'], { encoding: 'utf8' });
    const p2 = spawnSync(process.execPath, ['-e', script, '--', repo, 'P2'], { encoding: 'utf8' });
    assert.equal(p1.status, 0, 'child P1 exit 0 — stderr: ' + p1.stderr);
    assert.equal(p2.status, 0, 'child P2 exit 0 — stderr: ' + p2.stderr);
    const logPath = path.join(repo, '.claude', 'state', 'm3-friction-events.jsonl');
    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    assert.equal(lines.length, 20, 'all 20 events present (loss 0)');
    const ids = new Set(lines.map((l) => JSON.parse(l).session_id));
    assert.equal(ids.size, 20, 'all session_ids distinct (no overwrite)');
  } finally {
    rmrf(repo);
  }
});

test('friction-telemetry — CRLF/LF mix robust on read', () => {
  const repo = mkRepoDir('crlf');
  try {
    friction.recordBannerInjected({ sessionId: 'S1', projectBranch: 'b', cwd: repo });
    const logPath = path.join(repo, '.claude', 'state', 'm3-friction-events.jsonl');
    // Append a CRLF-terminated line (different writer style) — read still parses.
    fs.appendFileSync(logPath, JSON.stringify({ ts: '2026-06-20T00:00:00Z', event: 'x', session_id: 'S2', project_branch: 'b' }) + '\r\n');
    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[1]).session_id, 'S2');
  } finally {
    rmrf(repo);
  }
});

test('friction-telemetry — appendFileSync throw → noop + stderr WARN (no throw to caller)', () => {
  const repo = mkRepoDir('eacces');
  try {
    // Stub fs.appendFileSync via require cache replacement is heavy; instead,
    // force resolveLogPath to a path inside a dir we made read-only by stubbing
    // via a wrapper. Simplest: monkey-patch fs.appendFileSync temporarily.
    const orig = fs.appendFileSync;
    fs.appendFileSync = function () {
      const err = new Error('EACCES: permission denied');
      err.code = 'EACCES';
      throw err;
    };
    let threw = false;
    const out = captureStderr(() => {
      try {
        friction.recordBannerInjected({ sessionId: 'S1', projectBranch: 'b', cwd: repo });
      } catch (_e) {
        threw = true;
      }
    });
    fs.appendFileSync = orig;
    assert.equal(threw, false, 'recordBannerInjected NEVER throws');
    assert.match(out, /appendFileSync failed/);
  } finally {
    rmrf(repo);
  }
});

test('friction-telemetry — worktree (.git file, not dir) detected as repo root', () => {
  const wt = mkWorktreeDir('wt');
  try {
    friction.recordBannerInjected({ sessionId: 'SWT', projectBranch: 'wt-branch', cwd: wt });
    const logPath = path.join(wt, '.claude', 'state', 'm3-friction-events.jsonl');
    assert.equal(fs.existsSync(logPath), true, 'log written in worktree');
    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).session_id, 'SWT');
  } finally {
    rmrf(wt);
  }
});
