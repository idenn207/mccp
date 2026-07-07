'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const trace = require('../session-end-trace');
const ht = require('../../lib/hook-trace');

function withRepo(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-l5-'));
  try { return fn(root); }
  finally { try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {} }
}

test('runSync: writes .end marker + consolidated.jsonl + releases lease', () => {
  withRepo((root) => {
    // Seed with a couple of entries
    ht.recordWrite(root, 'sessA', 'tu1', 'PreToolUse',
      { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    ht.recordWrite(root, 'sessA', 'tu2', 'PostToolUseFailure',
      { layer: 'L2b', gate_decision: 'OBSERVED' });
    ht.acquireLease(root, 'sessA');

    const rc = trace.runSync({ session_id: 'sessA', cwd: root });
    assert.strictEqual(rc, 0);

    assert.strictEqual(ht.hasEndMarker(root, 'sessA'), true);
    const consolidated = path.join(ht.sessionDir(root, 'sessA'), ht.CONSOLIDATED_FILENAME);
    assert.ok(fs.existsSync(consolidated));
    const entries = fs.readFileSync(consolidated, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
    assert.strictEqual(entries.length, 2);
    // Lease must be released (so the next LRU evict can reclaim if needed)
    assert.deepStrictEqual(ht.listActiveLeases(root), {});
  });
});

test('runSync: leaves other sessions untouched (C3)', () => {
  withRepo((root) => {
    ht.recordWrite(root, 'sessA', 'tu1', 'PreToolUse',
      { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    ht.recordWrite(root, 'sessB', 'tu1', 'PreToolUse',
      { layer: 'L1', gate_decision: 'ALLOW', command_name: 'mccp:plan' });
    ht.acquireLease(root, 'sessB');

    trace.runSync({ session_id: 'sessA', cwd: root });

    // sessB still alive — no end marker, lease intact
    assert.strictEqual(ht.hasEndMarker(root, 'sessB'), false);
    const leases = ht.listActiveLeases(root);
    assert.ok(leases.sessB, 'sessB lease should still exist');
    ht.releaseLease(root, 'sessB');
  });
});

test('runSync: no-op when session_id missing', () => {
  withRepo((root) => {
    const rc = trace.runSync({ cwd: root }); // no session_id
    assert.strictEqual(rc, 0);
    assert.strictEqual(fs.existsSync(path.join(root, '.claude', 'state', 'hook-trace')), false);
  });
});

test('markSessionEndResilient: writes degraded marker when ht is null (B#4)', () => {
  withRepo((root) => {
    const ok = trace.markSessionEndResilient(root, 'sessDeg', null);
    assert.strictEqual(ok, true);
    assert.strictEqual(ht.hasEndMarker(root, 'sessDeg'), true);
  });
});

test('markSessionEndResilient: falls back to degraded when ht.markSessionEnd throws (B#4)', () => {
  withRepo((root) => {
    const throwingHt = { markSessionEnd() { throw new Error('boom'); } };
    const ok = trace.markSessionEndResilient(root, 'sessThrow', throwingHt);
    assert.strictEqual(ok, true);
    assert.strictEqual(ht.hasEndMarker(root, 'sessThrow'), true);
  });
});

test('writeDegradedEndMarker: releases the session lease so evictLRU can reclaim (Codex F2)', () => {
  withRepo((root) => {
    ht.acquireLease(root, 'sessLease');
    assert.ok(ht.listActiveLeases(root).sessLease, 'lease exists before degraded marker');
    const ok = trace.writeDegradedEndMarker(root, 'sessLease');
    assert.strictEqual(ok, true);
    assert.strictEqual(ht.hasEndMarker(root, 'sessLease'), true);
    assert.deepStrictEqual(ht.listActiveLeases(root), {}, 'lease removed after degraded marker');
  });
});

test('writeDegradedEndMarker: rejects unsafe sessionId (no write, no throw)', () => {
  withRepo((root) => {
    assert.strictEqual(trace.writeDegradedEndMarker(root, '..'), false);
    assert.strictEqual(trace.writeDegradedEndMarker(root, 'a/b'), false);
    assert.strictEqual(trace.writeDegradedEndMarker(root, ''), false);
    const traversal = path.join(root, '.claude', 'state', 'hook-trace', '..', '.end');
    assert.strictEqual(fs.existsSync(traversal), false, 'no traversal artifact created');
  });
});
