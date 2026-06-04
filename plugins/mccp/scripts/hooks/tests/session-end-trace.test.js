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
