'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ht = require('../hook-trace');

function withRepoRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-hook-trace-'));
  try {
    return fn(root);
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  }
}

function baseEntry(extra) {
  return Object.assign({
    layer: 'L1',
    gate_decision: 'ALLOW',
    command_id: 'roadmap',
    command_name: 'mccp:prp-implement',
  }, extra || {});
}

test('recordWrite: happy path writes one parseable JSONL entry', () => {
  withRepoRoot((root) => {
    const result = ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse', baseEntry());
    assert.strictEqual(result.ok, true);
    assert.ok(fs.existsSync(result.path));
    const raw = fs.readFileSync(result.path, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.strictEqual(parsed.layer, 'L1');
    assert.strictEqual(parsed.command_name, 'mccp:prp-implement');
    assert.strictEqual(parsed.session_id, 'sess1');
    assert.strictEqual(parsed.tool_use_id, 'tu1');
  });
});

test('recordWrite: allowlist rejects forbidden field "command_args"', () => {
  withRepoRoot((root) => {
    const result = ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse',
      Object.assign(baseEntry(), { command_args: '/secret/path' }));
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'forbidden_field');
    assert.match(result.reason, /command_args/);
  });
});

test('sanitizeCommandName: passthrough mccp:, fingerprint others', () => {
  assert.strictEqual(ht.sanitizeCommandName('mccp:prp-implement'), 'mccp:prp-implement');
  assert.strictEqual(ht.sanitizeCommandName(null), null);
  const fp = ht.sanitizeCommandName('gh pr list');
  assert.match(fp, /^sha256:[a-f0-9]{16}$/);
  // determinism: same input → same fingerprint
  assert.strictEqual(fp, ht.sanitizeCommandName('gh pr list'));
});

test('recordWrite: per-shard byte cap returns shard_full', () => {
  withRepoRoot((root) => {
    const target = ht.shardPath(root, 'sess1', 'tu1', 'PreToolUse');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Pre-seed shard with valid JSONL up to cap
    const filler = JSON.stringify(Object.assign({
      ts: '2026-01-01T00:00:00Z',
      session_id: 'sess1',
      tool_use_id: 'tu1',
    }, baseEntry()));
    let blob = '';
    while (blob.length < ht.PER_SHARD_MAX_BYTES) {
      blob += filler + '\n';
    }
    fs.writeFileSync(target, blob, 'utf8');
    const result = ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse', baseEntry());
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'shard_full');
    assert.match(result.reason, /byte cap/);
  });
});

test('recordWrite: per-shard entry cap returns shard_full', () => {
  withRepoRoot((root) => {
    const target = ht.shardPath(root, 'sess1', 'tu1', 'PreToolUse');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const filler = JSON.stringify(Object.assign({
      ts: '2026-01-01T00:00:00Z',
      session_id: 'sess1',
      tool_use_id: 'tu1',
    }, baseEntry()));
    // Write exactly PER_SHARD_MAX_ENTRIES lines well under byte cap
    const lines = Array(ht.PER_SHARD_MAX_ENTRIES).fill(filler).join('\n') + '\n';
    fs.writeFileSync(target, lines, 'utf8');
    assert.ok(lines.length < ht.PER_SHARD_MAX_BYTES, 'fixture must stay under byte cap');
    const result = ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse', baseEntry());
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'shard_full');
    assert.match(result.reason, /entry cap/);
  });
});

test('recordWrite: malformed shard is quarantined, then writable on retry', () => {
  withRepoRoot((root) => {
    const target = ht.shardPath(root, 'sess1', 'tu1', 'PreToolUse');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{not valid json\n', 'utf8');
    const first = ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse', baseEntry());
    assert.strictEqual(first.ok, false);
    assert.strictEqual(first.code, 'shard_corrupt_quarantined');
    const sdir = ht.sessionDir(root, 'sess1');
    const quarantineDir = path.join(sdir, ht.QUARANTINE_SUBDIR);
    assert.ok(fs.existsSync(quarantineDir));
    assert.strictEqual(fs.readdirSync(quarantineDir).length, 1);
    // Retry — shard was renamed away, so write lands cleanly.
    const second = ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse', baseEntry());
    assert.strictEqual(second.ok, true);
  });
});

test('shardPath / sessionDir reject path-traversal tokens', () => {
  withRepoRoot((root) => {
    assert.throws(() => ht.sessionDir(root, '..'),
      (err) => err.code === 'invalid_session_id');
    assert.throws(() => ht.shardPath(root, 'sess1', '../etc/passwd', 'PreToolUse'),
      (err) => err.code === 'invalid_tool_use_id');
    assert.throws(() => ht.shardPath(root, 'sess1', 'tu1', 'P/Q'),
      (err) => err.code === 'invalid_phase');
    // Path-safe tokens accepted
    const ok = ht.shardPath(root, 'sess1', 'toolu_01ABC', 'PreToolUse');
    assert.ok(ok.endsWith('toolu_01ABC-PreToolUse.jsonl'));
  });
});

test('evictLRU: active lease shields session from eviction', () => {
  withRepoRoot((root) => {
    // Two sessions, both at base dir; the "old" one held by lease must survive.
    const oldRes = ht.recordWrite(root, 'old', 'tu1', 'PreToolUse', baseEntry());
    assert.strictEqual(oldRes.ok, true);
    const newRes = ht.recordWrite(root, 'new', 'tu1', 'PreToolUse', baseEntry());
    assert.strictEqual(newRes.ok, true);
    // Pretend "old" is the active session — lease must guard it.
    ht.acquireLease(root, 'old');
    // Force tiny budget so eviction has to drop *something*.
    const result = ht.evictLRU(root, { maxBytes: 16 });
    const evictedIds = result.evicted.map(e => e.sessionId);
    assert.ok(!evictedIds.includes('old'), 'leased session evicted: ' + evictedIds.join(','));
    assert.ok(fs.existsSync(ht.sessionDir(root, 'old')));
    ht.releaseLease(root, 'old');
  });
});

test('markSessionEnd + hasEndMarker: lifecycle', () => {
  withRepoRoot((root) => {
    assert.strictEqual(ht.hasEndMarker(root, 'sess1'), false);
    ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse', baseEntry());
    ht.markSessionEnd(root, 'sess1');
    assert.strictEqual(ht.hasEndMarker(root, 'sess1'), true);
  });
});

test('consolidateSession: merges per-shard files into consolidated.jsonl', () => {
  withRepoRoot((root) => {
    ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse', baseEntry());
    ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse', baseEntry({ gate_decision: 'BLOCK' }));
    ht.recordWrite(root, 'sess1', 'tu2', 'PostToolUseFailure', baseEntry({ layer: 'L2b' }));
    const result = ht.consolidateSession(root, 'sess1');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lines, 3);
    const consolidated = fs.readFileSync(result.path, 'utf8');
    const parsed = consolidated.trim().split('\n').map(JSON.parse);
    assert.strictEqual(parsed.length, 3);
    const layers = parsed.map(p => p.layer).sort();
    assert.deepStrictEqual(layers, ['L1', 'L1', 'L2b']);
  });
});
