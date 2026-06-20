'use strict';

// goal-phase-guard contract tests — M3 axis C (mccp v1.x.x).
// Coverage axes:
//   - classifyBashCommand allow/deny matrix
//   - classifySkillName mccp:* deny (incl. milestone-close)
//   - lockState malformed → fail-closed (F2 absorption)
//   - shouldEnforceForCaller F3 STRICT non-owner policy:
//       owner-match → enforce; non-owner+readonly → ALLOW; non-owner+write → DENY;
//       discriminator absent → blanket-enforce + stderr warn
//   - End-to-end PreToolUse via spawnSync stdin pipe (incl. MultiEdit F4
//     parity, bash -c wrapper bypass attempt S3, malformed lock E2E F2).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const guard = require('../goal-phase-guard');

const GUARD_JS = path.resolve(__dirname, '..', 'goal-phase-guard.js');

function withTempRepo(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-goal-guard-'));
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
  const p = path.join(dir, '.claude', 'state', 'goal-phase.lock');
  fs.writeFileSync(p, body, 'utf8');
}

function freshLockBody(sess) {
  return JSON.stringify({
    run_id: 'r1',
    ownership_token_hash: 'h'.repeat(64),
    owner_session_id: sess,
    milestone_id: 'm3',
    pid: process.pid,
    host: os.hostname(),
  });
}

function spawnGuard(cwd, event) {
  return spawnSync('node', [GUARD_JS], {
    cwd: cwd,
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_RECEIPT_DEBUG: '0' }),
  });
}

// ───────────── Unit: classifyBashCommand allow matrix ─────────────

test('Bash allow: git status', () => {
  const r = guard.classifyBashCommand('git status --short');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: goal-phase-lock.js exit (lifecycle CLI)', () => {
  const r = guard.classifyBashCommand('node /x/lib/goal-phase-lock.js exit --run-id abc');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

test('Bash allow: goal-detect.js detect', () => {
  const r = guard.classifyBashCommand('node /x/lib/goal-detect.js detect --mode milestone-close --json');
  assert.strictEqual(r.decision, 'allow', r.reason);
});

// ───────────── Unit: classifyBashCommand deny matrix ─────────────

test('Bash deny: receipt cli write', () => {
  const r = guard.classifyBashCommand('node /x/scripts/receipt/cli.js write --gate mccp-plan-codex');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: redirect into milestone-closures', () => {
  const r = guard.classifyBashCommand('echo x > .claude/milestone-closures/m3.md');
  assert.strictEqual(r.decision, 'deny');
});

test('Bash deny: default-deny on curl (no allowlist match)', () => {
  const r = guard.classifyBashCommand('curl https://example.com');
  assert.strictEqual(r.decision, 'deny');
});

// S3 absorption: bash -c wrapper bypass attempts → DENY (default-deny on outer segment)
test('S3 absorption: bash -c "node ..." wrapper → DENY (default-deny outer)', () => {
  const r = guard.classifyBashCommand('bash -c "node receipt/cli.js write"');
  assert.strictEqual(r.decision, 'deny');
});

test('S3 absorption: mixed slashes mccp:plan via bash → DENY', () => {
  const r = guard.classifyBashCommand('bash -c "mccp:plan foo"');
  assert.strictEqual(r.decision, 'deny');
});

// ───────────── Unit: classifySkillName ─────────────

test('Skill deny: mccp:plan', () => {
  assert.strictEqual(guard.classifySkillName('mccp:plan').decision, 'deny');
});

test('Skill deny: mccp:milestone-close', () => {
  assert.strictEqual(guard.classifySkillName('mccp:milestone-close').decision, 'deny');
});

test('Skill allow: impeccable (non-mccp)', () => {
  assert.strictEqual(guard.classifySkillName('impeccable').decision, 'allow');
});

// ───────────── Unit: shouldEnforceForCaller F3 STRICT policy ─────────────

test('F3: owner-match → enforce=true', () => {
  const lock = { owner_session_id: 'sess-X' };
  const event = { session_id: 'sess-X' };
  const r = guard.shouldEnforceForCaller(lock, event, 'Edit');
  assert.strictEqual(r.enforce, true);
});

test('F3: non-owner + Read → enforce=false (read-only ALLOW)', () => {
  const lock = { owner_session_id: 'sess-X' };
  const event = { session_id: 'sess-Y' };
  const r = guard.shouldEnforceForCaller(lock, event, 'Read');
  assert.strictEqual(r.enforce, false);
  assert.match(r.reason, /non-owner-readonly-allow/);
});

test('F3: non-owner + Edit → enforce=true (write blocked even cross-session)', () => {
  const lock = { owner_session_id: 'sess-X' };
  const event = { session_id: 'sess-Y' };
  const r = guard.shouldEnforceForCaller(lock, event, 'Edit');
  assert.strictEqual(r.enforce, true);
  assert.match(r.reason, /non-owner-write-enforce/);
});

test('F3: discriminator absent → blanket-enforce', () => {
  const lock = { owner_session_id: null };
  const event = { session_id: 'sess-Y' };
  const r = guard.shouldEnforceForCaller(lock, event, 'Read');
  assert.strictEqual(r.enforce, true);
  assert.match(r.reason, /scenario-B/);
});

// ───────────── E2E PreToolUse — 14 plan scenarios ─────────────

// Scenario 1: lock inactive + Edit → ALLOW
test('E2E S1: no lock + Edit → ALLOW (exit 0)', () => {
  withTempRepo((cwd) => {
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 0);
  });
});

// Scenario 2: lock active (same session) + Edit → DENY
test('E2E S2: lock active (same session) + Edit → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /격리 invariant/);
  });
});

// Scenario 3: lock active (same session) + Write → DENY
test('E2E S3: lock active (same session) + Write → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: 'foo.md', content: 'x' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
  });
});

// Scenario 4: lock active + Bash receipt write → DENY
test('E2E S4: lock active + Bash receipt write → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node receipt/cli.js write --gate mccp-pr-codex' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
  });
});

// Scenario 5: lock active + Bash milestone-closures write → DENY
test('E2E S5: lock active + Bash milestone-closures write → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'echo done > .claude/milestone-closures/m3.md' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
  });
});

// Scenario 6: lock active + Skill mccp:plan → DENY
test('E2E S6: lock active + Skill mccp:plan → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Skill',
      tool_input: { skill: 'mccp:plan' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
  });
});

// Scenario 7: lock active + Read/Grep/Glob → ALLOW
test('E2E S7a: lock active + Read → ALLOW', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 0);
  });
});

test('E2E S7b: lock active + Grep → ALLOW', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Grep',
      tool_input: { pattern: 'TODO' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 0);
  });
});

// Scenario 8: lock active + Bash git status → ALLOW
test('E2E S8: lock active + Bash git status → ALLOW', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git status --short' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 0);
  });
});

// Scenario 9: lock active + Bash goal-phase-lock.js heartbeat → ALLOW
test('E2E S9: lock active + Bash goal-phase-lock heartbeat → ALLOW', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node /plugin/lib/goal-phase-lock.js heartbeat --run-id r1' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 0);
  });
});

// Scenario 10: F3 absorption — non-owner + Edit → DENY (mutation blocked)
test('E2E S10 (F3): non-owner + Edit → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-Y',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
  });
});

// Scenario 11: F3 absorption — non-owner + Read → ALLOW (read-only path)
test('E2E S11 (F3): non-owner + Read → ALLOW', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-Y',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 0);
  });
});

// Scenario 12: discriminator absent + Edit → DENY + stderr warn
test('E2E S12: discriminator absent + Edit → DENY + stderr WARN', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody(null));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /WARN — caller-identity discriminator absent/);
  });
});

// Scenario 13: F2 fail-CLOSED on malformed lock + Read → DENY
test('E2E S13 (F2): malformed lock (JSON parse error) + Read → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, '{not-json');
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'foo.md' },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /lock file malformed/);
  });
});

// Scenario 14: F4 absorption — MultiEdit (same + non-owner) both DENY
test('E2E S14a (F4): lock active (same session) + MultiEdit → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'MultiEdit',
      tool_input: { file_path: 'foo.md', edits: [] },
      session_id: 'sess-X',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
  });
});

test('E2E S14b (F4): lock active (non-owner) + MultiEdit → DENY', () => {
  withTempRepo((cwd) => {
    writeLock(cwd, freshLockBody('sess-X'));
    const r = spawnGuard(cwd, {
      hook_event_name: 'PreToolUse',
      tool_name: 'MultiEdit',
      tool_input: { file_path: 'foo.md', edits: [] },
      session_id: 'sess-Y',
      cwd: cwd,
    });
    assert.strictEqual(r.status, 2);
  });
});
