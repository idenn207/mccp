'use strict';

// L2b PostToolUseFailure surface integration test — spawnSync end-to-end.
// Validates systemMessage + additionalContext emit, malformed payload handling,
// and opportunistic L1 shard write without surface dependency.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK = path.resolve(__dirname, '..', 'post-tool-use-failure.js');
const ht = require('../../lib/hook-trace');

function mkTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-l2b-'));
}

function runHook(repo, eventPayload) {
  return spawnSync(process.execPath, [HOOK], {
    cwd: repo,
    input: eventPayload === null ? '' : (typeof eventPayload === 'string' ? eventPayload : JSON.stringify(eventPayload)),
    encoding: 'utf8',
    timeout: 15000,
    env: Object.assign({}, process.env, { MCCP_RECEIPT_DEBUG: '0' }),
  });
}

test('happy path: emits systemMessage + additionalContext for valid event', () => {
  const repo = mkTempRepo();
  try {
    const r = runHook(repo, {
      tool_use_id: 'toolu_abc',
      tool_name: 'Bash',
      error: 'Command not found: foo',
      cwd: repo,
    });
    assert.strictEqual(r.status, 0);
    const payload = JSON.parse(r.stdout);
    assert.match(payload.systemMessage, /PostToolUseFailure: Bash/);
    assert.match(payload.systemMessage, /toolu_abc/);
    assert.match(payload.systemMessage, /Command not found/);
    assert.strictEqual(payload.hookSpecificOutput.hookEventName, 'PostToolUseFailure');
    assert.match(payload.hookSpecificOutput.additionalContext, /L2b surface/);
    assert.match(payload.hookSpecificOutput.additionalContext, /\/mccp:trace/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('malformed JSON stdin still emits systemMessage (never silent)', () => {
  const repo = mkTempRepo();
  try {
    const r = runHook(repo, '{not valid');
    assert.strictEqual(r.status, 0);
    const payload = JSON.parse(r.stdout);
    assert.match(payload.systemMessage, /malformed event payload/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('empty stdin emits "no event payload" systemMessage', () => {
  const repo = mkTempRepo();
  try {
    const r = runHook(repo, null);
    assert.strictEqual(r.status, 0);
    const payload = JSON.parse(r.stdout);
    assert.match(payload.systemMessage, /no event payload/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('event without session_id: surface still emits (event-only, no L1 trace)', () => {
  const repo = mkTempRepo();
  try {
    const r = runHook(repo, {
      tool_use_id: 'toolu_xyz',
      tool_name: 'Edit',
      error: 'permission denied',
      cwd: repo,
    });
    assert.strictEqual(r.status, 0);
    const payload = JSON.parse(r.stdout);
    assert.match(payload.systemMessage, /PostToolUseFailure: Edit/);
    // No trace path because session_id missing → L1 skipped
    assert.doesNotMatch(payload.systemMessage, /\n  trace: /);
    assert.doesNotMatch(payload.hookSpecificOutput.additionalContext, / — see /);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('event with session_id: L1 shard write succeeds + trace path in surface', () => {
  const repo = mkTempRepo();
  try {
    const r = runHook(repo, {
      session_id: 'sess1',
      tool_use_id: 'toolu_123',
      tool_name: 'Bash',
      error: 'exit 1',
      command_name: 'mccp:pr',
      cwd: repo,
    });
    assert.strictEqual(r.status, 0);
    const payload = JSON.parse(r.stdout);
    assert.match(payload.systemMessage, /\n  trace: /);
    assert.match(payload.hookSpecificOutput.additionalContext, / — see /);
    // L1 shard exists and contains the entry
    const shard = ht.shardPath(repo, 'sess1', 'toolu_123', 'PostToolUseFailure');
    assert.ok(fs.existsSync(shard), 'shard file should exist at ' + shard);
    const entries = fs.readFileSync(shard, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].layer, 'L2b');
    assert.strictEqual(entries[0].command_name, 'mccp:pr');
    assert.strictEqual(entries[0].exception_class, 'Bash');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// Unit-level coverage of pure helpers (no spawn)
test('summarizeError + buildSurface unit shape', () => {
  const m = require('../post-tool-use-failure');
  assert.strictEqual(m.summarizeError(undefined), 'no error payload');
  assert.strictEqual(m.summarizeError(null), 'no error payload');
  assert.strictEqual(m.summarizeError('line1\nline2'), 'line1');
  const long = 'x'.repeat(300);
  const summary = m.summarizeError(long);
  assert.ok(summary.length <= 200);
  assert.ok(summary.endsWith('…'));
  const surface = m.buildSurface({ tool_name: 'X', tool_use_id: 'tu1', error: 'oops' }, '/p/log.jsonl');
  assert.match(surface, /PostToolUseFailure: X/);
  assert.match(surface, /trace: \/p\/log.jsonl/);
});
