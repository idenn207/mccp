'use strict';

// ultracode-phase-guard contract tests — M2 axis B (mccp v1.4.0).
// Coverage axes:
//   - classifyBashCommand allow/deny matrix
//   - classifySkillName mccp:* deny
//   - lockState malformed → fail-closed (F2 absorption)
//   - shouldEnforceForCaller F1 Scenario A discriminator + Scenario B fallback
//   - End-to-end PreToolUse via spawnSync stdin pipe (lock active vs absent
//     vs malformed × tool type matrix).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');

const guard = require('../ultracode-phase-guard');

const GUARD_JS = path.resolve(__dirname, '..', 'ultracode-phase-guard.js');

function withTempRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-ultracode-guard-'));
  try {
    execFileSync('git', ['init', '-q', dir], { encoding: 'utf8' });
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(dir, 'README.md'), '# tmp\n', 'utf8');
    execFileSync('git', ['-C', dir, 'add', '.'], { encoding: 'utf8' });
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'init', '--no-gpg-sign'], { encoding: 'utf8' });
    fs.mkdirSync(path.join(dir, '.claude', 'state'), { recursive: true });
    return fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
}

function writeLock(dir, body) {
  const p = path.join(dir, '.claude', 'state', 'ultracode-phase.lock');
  fs.writeFileSync(p, body, 'utf8');
}

function spawnGuard(cwd, event) {
  const result = spawnSync('node', [GUARD_JS], {
    cwd: cwd,
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_RECEIPT_DEBUG: '0' }),
  });
  return result;
}

// ───────────── Unit: classifyBashCommand allow matrix ─────────────

test('Bash allow: git status', () => {
  const r = guard.classifyBashCommand('git status --short');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: git log', () => {
  const r = guard.classifyBashCommand('git log --oneline -5');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: ultracode-phase-lock.js exit (lifecycle CLI)', () => {
  const r = guard.classifyBashCommand('node /x/lib/ultracode-phase-lock.js exit --run-id abc');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: ultracode-detect.js detect', () => {
  const r = guard.classifyBashCommand('node /x/lib/ultracode-detect.js detect --mode implement --plan p.md --json');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: gh pr view', () => {
  const r = guard.classifyBashCommand('gh pr view 42');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

// ───────────── Unit: classifyBashCommand deny matrix ─────────────

test('Bash deny: git commit (mutating git)', () => {
  const r = guard.classifyBashCommand('git commit -m "x"');
  assert.strictEqual(r.decision, 'deny');
  assert.match(r.reason, /segment-deny/);
});

test('Bash deny: receipt cli write', () => {
  const r = guard.classifyBashCommand('node /x/scripts/receipt/cli.js write --gate mccp-plan-codex');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: state-writer invoke', () => {
  const r = guard.classifyBashCommand('node /x/scripts/state/state-writer.js update');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: fix-task write', () => {
  const r = guard.classifyBashCommand('node /x/scripts/state/fix-task.js write');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: shell redirect into .claude/state/', () => {
  const r = guard.classifyBashCommand('echo x > .claude/state/foo');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: rm -rf', () => {
  const r = guard.classifyBashCommand('rm -rf /tmp/x');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: default-deny on unknown command', () => {
  const r = guard.classifyBashCommand('curl https://example.com');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: chained allow + mutating in single string', () => {
  const r = guard.classifyBashCommand('git status; git commit -m x');
  assert.strictEqual(r.decision, 'deny');
});

// ───────────── Unit: classifySkillName ─────────────

test('Skill deny: mccp:plan', () => {
  const r = guard.classifySkillName('mccp:plan');
  assert.strictEqual(r.decision, 'deny');
});

test('Skill deny: mccp:prp-implement', () => {
  const r = guard.classifySkillName('mccp:prp-implement');
  assert.strictEqual(r.decision, 'deny');
});

test('Skill allow: impeccable (non-mccp)', () => {
  const r = guard.classifySkillName('impeccable');
  assert.strictEqual(r.decision, 'allow');
});

test('Skill allow: code-review (non-mccp namespace)', () => {
  const r = guard.classifySkillName('code-review');
  assert.strictEqual(r.decision, 'allow');
});

// ───────────── Unit: shouldEnforceForCaller (F1 Scenario A + B) ─────────────

test('F1 Scenario A: session_id match → enforce=true', () => {
  const lock = { owner_session_id: 'sess-X' };
  const event = { session_id: 'sess-X' };
  const r = guard.shouldEnforceForCaller(lock, event);
  assert.strictEqual(r.enforce, true);
  assert.match(r.reason, /caller-session-match/);
});

test('F1 Scenario A: session_id mismatch → enforce=false (workflow-agent path)', () => {
  const lock = { owner_session_id: 'sess-X' };
  const event = { session_id: 'sess-Y' };
  const r = guard.shouldEnforceForCaller(lock, event);
  assert.strictEqual(r.enforce, false);
  assert.match(r.reason, /workflow-agent/);
});

test('F1 Scenario B: event.session_id absent → fallback enforce=true', () => {
  const lock = { owner_session_id: 'sess-X' };
  const event = {};
  const r = guard.shouldEnforceForCaller(lock, event);
  assert.strictEqual(r.enforce, true);
  assert.match(r.reason, /scenario-B/);
});

test('F1 Scenario B: lock.owner_session_id null → fallback enforce=true', () => {
  const lock = { owner_session_id: null };
  const event = { session_id: 'sess-Y' };
  const r = guard.shouldEnforceForCaller(lock, event);
  assert.strictEqual(r.enforce, true);
  assert.match(r.reason, /scenario-B/);
});

// ───────────── End-to-end PreToolUse (spawnSync stdin pipe) ─────────────

test('E2E: no lock → Edit ALLOWED (exit 0)', () => {
  withTempRepo((cwd) => {
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md', old_string: 'a', new_string: 'b' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 0, 'no-lock → allow');
  });
});

test('E2E: lock active + Edit → DENY (exit 2)', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({
      run_id: 'r1',
      ownership_token_hash: 'h'.repeat(64),
      owner_session_id: 'sess-X',
      pid: process.pid,
      host: os.hostname(),
      task_index: 3,
    }));
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 2, 'lock + Edit → deny');
    assert.match(r.stderr, /ultracode 격리 invariant/);
  });
});

test('E2E: lock active + Read → ALLOW (read-only)', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({
      run_id: 'r1',
      ownership_token_hash: 'h'.repeat(64),
      owner_session_id: 'sess-X',
      pid: process.pid,
      host: os.hostname(),
    }));
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 0);
  });
});

test('E2E: lock active + Bash git diff → ALLOW', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({
      run_id: 'r1',
      ownership_token_hash: 'h'.repeat(64),
      owner_session_id: 'sess-X',
      pid: process.pid,
      host: os.hostname(),
    }));
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git diff origin/main..HEAD --stat' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 0);
  });
});

test('E2E: lock active + Bash git commit → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({
      run_id: 'r1',
      ownership_token_hash: 'h'.repeat(64),
      owner_session_id: 'sess-X',
      pid: process.pid,
      host: os.hostname(),
    }));
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "x"' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 2);
  });
});

test('E2E: lock active + Bash ultracode-phase-lock.js exit → ALLOW (lifecycle CLI)', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({
      run_id: 'r1',
      ownership_token_hash: 'h'.repeat(64),
      owner_session_id: 'sess-X',
      pid: process.pid,
      host: os.hostname(),
    }));
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node /plugin/lib/ultracode-phase-lock.js exit --run-id r1' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 0);
  });
});

test('E2E: lock active + Skill mccp:plan → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({
      run_id: 'r1',
      ownership_token_hash: 'h'.repeat(64),
      owner_session_id: 'sess-X',
      pid: process.pid,
      host: os.hostname(),
    }));
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'mccp:plan', args: '' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 2);
  });
});

test('E2E: lock active + Skill impeccable → ALLOW (non-mccp)', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({
      run_id: 'r1',
      ownership_token_hash: 'h'.repeat(64),
      owner_session_id: 'sess-X',
      pid: process.pid,
      host: os.hostname(),
    }));
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'impeccable', args: 'audit foo' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 0);
  });
});

test('E2E: F2 lock JSON parse error → DENY (fail-closed)', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, '{not-json garbage');
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 2, 'F2 fail-closed on parse error');
    assert.match(r.stderr, /malformed/);
  });
});

test('E2E: F2 lock zero-byte → DENY (fail-closed)', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, '');
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /malformed/);
  });
});

test('E2E: F2 lock missing ownership_token_hash → DENY (fail-closed)', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({ run_id: 'r1', pid: process.pid }));
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /missing-required-field/);
  });
});

test('E2E: F1 Scenario A — session_id mismatch → Edit ALLOWED (workflow caller)', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({
      run_id: 'r1',
      ownership_token_hash: 'h'.repeat(64),
      owner_session_id: 'sess-X',
      pid: process.pid,
      host: os.hostname(),
    }));
    const event = {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-Y',  // different session → workflow agent
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 0, 'mismatched session → allow workflow caller');
  });
});

test('E2E: PostToolUse event → no-op (only PreToolUse enforces)', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, JSON.stringify({
      run_id: 'r1',
      ownership_token_hash: 'h'.repeat(64),
      owner_session_id: 'sess-X',
      pid: process.pid,
      host: os.hostname(),
    }));
    const event = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    };
    const r = spawnGuard(cwd, event);
    assert.strictEqual(r.status, 0);
  });
});
