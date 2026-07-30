'use strict';

// session-activity source test — active span merge, conflict detection, A4 restore matching

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { scanSessionActivity } = require('../../derive/sources/session-activity');

// Test helper to create temp directory with msw-events
function createTempRepo(tmpDir) {
  const claudeDir = path.join(tmpDir, '.claude', 'state', 'msw-events');
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  return tmpDir;
}

function writeMswEvent(tmpDir, sessionId, event) {
  const claudeDir = path.join(tmpDir, '.claude', 'state', 'msw-events');
  const filePath = path.join(claudeDir, `${sessionId}.jsonl`);
  fs.appendFileSync(filePath, JSON.stringify(event) + '\n');
}

test('session-activity: concurrent pairs detected', (t) => {
  const tmpDir = path.join(__dirname, '.tmp-session-activity-test-' + Date.now());
  createTempRepo(tmpDir);

  try {
    // Session 1: 10:00 - 10:30
    writeMswEvent(tmpDir, 'sid-1', {
      kind: 'session_start',
      session_id: 'sid-1',
      created_at: '2026-07-24T10:00:00Z',
      ts: '2026-07-24T10:00:00Z',
    });
    writeMswEvent(tmpDir, 'sid-1', {
      kind: 'session_end',
      session_id: 'sid-1',
      ended_at: '2026-07-24T10:30:00Z',
      ts: '2026-07-24T10:30:00Z',
      context_remaining_pct: 45,
      task_completed: true,
    });

    // Session 2: 10:15 - 10:45 (overlaps sid-1)
    writeMswEvent(tmpDir, 'sid-2', {
      kind: 'session_start',
      session_id: 'sid-2',
      created_at: '2026-07-24T10:15:00Z',
      ts: '2026-07-24T10:15:00Z',
    });
    writeMswEvent(tmpDir, 'sid-2', {
      kind: 'session_end',
      session_id: 'sid-2',
      ended_at: '2026-07-24T10:45:00Z',
      ts: '2026-07-24T10:45:00Z',
      context_remaining_pct: 62,
      task_completed: true,
    });

    // Session 3: 11:00 - 11:30 (no overlap)
    writeMswEvent(tmpDir, 'sid-3', {
      kind: 'session_start',
      session_id: 'sid-3',
      created_at: '2026-07-24T11:00:00Z',
      ts: '2026-07-24T11:00:00Z',
    });
    writeMswEvent(tmpDir, 'sid-3', {
      kind: 'session_end',
      session_id: 'sid-3',
      ended_at: '2026-07-24T11:30:00Z',
      ts: '2026-07-24T11:30:00Z',
      context_remaining_pct: 38,
      task_completed: true,
    });

    const result = scanSessionActivity(tmpDir);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.task_startups_count, 3);
    assert.strictEqual(result.concurrent_pairs_count, 1); // sid-1 overlaps sid-2
    assert.strictEqual(result.sessions.length, 3);
  } finally {
    // Cleanup
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
});

test('session-activity: collision events detected', (t) => {
  const tmpDir = path.join(__dirname, '.tmp-session-activity-test-' + Date.now());
  createTempRepo(tmpDir);

  try {
    writeMswEvent(tmpDir, 'sid-1', {
      kind: 'session_start',
      session_id: 'sid-1',
      created_at: '2026-07-24T10:00:00Z',
    });
    writeMswEvent(tmpDir, 'sid-1', {
      kind: 'collision',
      session_id: 'sid-1',
    });
    writeMswEvent(tmpDir, 'sid-1', {
      kind: 'collision',
      session_id: 'sid-1',
    });
    writeMswEvent(tmpDir, 'sid-1', {
      kind: 'session_end',
      session_id: 'sid-1',
      ended_at: '2026-07-24T10:30:00Z',
      context_remaining_pct: 50,
    });

    const result = scanSessionActivity(tmpDir);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.collision_events_count, 2);
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
});

test('session-activity: malformed line isolation (per-line skip)', (t) => {
  const tmpDir = path.join(__dirname, '.tmp-session-activity-test-' + Date.now());
  createTempRepo(tmpDir);

  try {
    const claudeDir = path.join(tmpDir, '.claude', 'state', 'msw-events');
    const filePath = path.join(claudeDir, 'sid-1.jsonl');

    // Write: valid, malformed, valid
    fs.writeFileSync(filePath, '{"kind":"session_start","session_id":"sid-1"}\n');
    fs.appendFileSync(filePath, 'not-valid-json\n');
    fs.appendFileSync(filePath, '{"kind":"session_end","session_id":"sid-1","context_remaining_pct":55}\n');

    const result = scanSessionActivity(tmpDir);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.invalid_count, 1); // one malformed line
    assert.strictEqual(result.sessions.length, 1); // but session still parsed
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
});

test('session-activity: empty repo returns ok with 0 counts', (t) => {
  const tmpDir = path.join(__dirname, '.tmp-session-activity-test-' + Date.now());
  createTempRepo(tmpDir);

  try {
    const result = scanSessionActivity(tmpDir);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.task_startups_count, 0);
    assert.strictEqual(result.concurrent_pairs_count, 0);
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
});

test('session-activity: span end uses LAST session_end, not first (PR-Codex F3)', (t) => {
  // session-end.js는 Stop hook이라 응답마다 session_end를 emit한다. sid-A는
  // 10:10에 첫 session_end(첫 응답)을 내지만 10:50까지 지속된다. 첫 session_end로
  // span을 닫으면 [10:00,10:10]이 되어 sid-B[10:30,10:40]와 안 겹쳐 동시성을
  // 놓친다. 마지막 session_end(10:50)를 쓰면 [10:00,10:50]이 sid-B를 포함한다.
  const tmpDir = path.join(__dirname, '.tmp-session-activity-test-' + Date.now());
  createTempRepo(tmpDir);

  try {
    writeMswEvent(tmpDir, 'sid-A', { kind: 'session_start', session_id: 'sid-A', created_at: '2026-07-24T10:00:00Z', ts: '2026-07-24T10:00:00Z' });
    writeMswEvent(tmpDir, 'sid-A', { kind: 'session_end', session_id: 'sid-A', ended_at: '2026-07-24T10:10:00Z', ts: '2026-07-24T10:10:00Z' });
    writeMswEvent(tmpDir, 'sid-A', { kind: 'session_end', session_id: 'sid-A', ended_at: '2026-07-24T10:50:00Z', ts: '2026-07-24T10:50:00Z' });

    writeMswEvent(tmpDir, 'sid-B', { kind: 'session_start', session_id: 'sid-B', created_at: '2026-07-24T10:30:00Z', ts: '2026-07-24T10:30:00Z' });
    writeMswEvent(tmpDir, 'sid-B', { kind: 'session_end', session_id: 'sid-B', ended_at: '2026-07-24T10:40:00Z', ts: '2026-07-24T10:40:00Z' });

    const result = scanSessionActivity(tmpDir);
    assert.strictEqual(result.concurrent_pairs_count, 1, 'last session_end extends span so overlap is detected');
  } finally {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
});
