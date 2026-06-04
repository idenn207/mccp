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

// Codex Round 1 finding #4 (MEDIUM, conf 0.84) — consolidateSession used to
// blindly copy every non-empty line into consolidated.jsonl. A shard corrupted
// after the last successful write would poison the consolidated ledger that
// /mccp:trace reads. Each line must be JSON.parse-validated before inclusion.
test('consolidateSession: quarantines shards with malformed JSON, omits from consolidated', () => {
  withRepoRoot((root) => {
    // Clean shard
    ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse', baseEntry());
    // Hand-write a second shard with a corrupted trailing line
    const corrupt = ht.shardPath(root, 'sess1', 'tu2', 'PostToolUseFailure');
    fs.mkdirSync(path.dirname(corrupt), { recursive: true });
    const goodLine = JSON.stringify({
      ts: '2026-01-01T00:00:00Z', session_id: 'sess1', tool_use_id: 'tu2', layer: 'L2b',
    });
    fs.writeFileSync(corrupt, goodLine + '\n{not valid json}\n', 'utf8');

    const result = ht.consolidateSession(root, 'sess1');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lines, 1, 'only the clean shard line is consolidated');
    assert.deepStrictEqual(result.quarantined, ['tu2-PostToolUseFailure.jsonl']);
    const consolidated = fs.readFileSync(result.path, 'utf8').trim().split('\n');
    assert.strictEqual(consolidated.length, 1);
    const parsed = JSON.parse(consolidated[0]);
    assert.strictEqual(parsed.tool_use_id, 'tu1');
    // Corrupt shard must have moved to quarantine
    const quarantineDir = path.join(ht.sessionDir(root, 'sess1'), ht.QUARANTINE_SUBDIR);
    assert.ok(fs.existsSync(quarantineDir));
    const qfiles = fs.readdirSync(quarantineDir);
    assert.ok(qfiles.some((n) => n.startsWith('tu2-PostToolUseFailure.jsonl.')));
    assert.ok(!fs.existsSync(corrupt), 'original corrupt shard must be moved away');
  });
});

// Codex Round 1 finding #3 (HIGH, conf 0.88) — appendShardAtomic used to read
// the full shard, build prior+line, then rename a tmp file over the shard.
// Two concurrent hook processes both reading the same prior content meant the
// later rename erased the earlier line. The new O_APPEND single-syscall write
// preserves both lines.
test('recordWrite: rapid sequential writes to same shard preserve all entries (no last-writer-wins)', () => {
  withRepoRoot((root) => {
    const N = 20;
    const targetPath = ht.shardPath(root, 'sess1', 'tu1', 'PreToolUse');
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const results = [];
    for (let i = 0; i < N; i++) {
      results.push(ht.recordWrite(root, 'sess1', 'tu1', 'PreToolUse',
        baseEntry({ command_id: 'seq-' + i })));
    }
    const okCount = results.filter((r) => r.ok).length;
    assert.strictEqual(okCount, N, 'all writes report ok');
    const raw = fs.readFileSync(targetPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, N, 'shard contains all N lines');
    const parsed = lines.map(JSON.parse);
    const ids = new Set(parsed.map((p) => p.command_id));
    assert.strictEqual(ids.size, N, 'all command_ids distinct (no overwrite)');
  });
});

// Codex Round 1 finding #2 (HIGH, conf 0.91) — lease was written once at
// SessionStart with a 5-minute mtime stale check; no renewal in recordWrite
// meant normal long sessions got false-crashed + LRU-evicted after 5 min.
// Fix: TTL bumped to 24h + recordWrite heartbeats the lease.
test('recordWrite: does NOT create a lease for sessions that never called acquireLease', () => {
  // Critical invariant — auto-creating leases on every write would defeat
  // crash detection (scanCrashAlerts treats lease absence as the crash signal).
  // Heartbeat must be refresh-only.
  withRepoRoot((root) => {
    ht.recordWrite(root, 'sessNoLease', 'tu1', 'PreToolUse', baseEntry());
    const leaseFile = ht.leasePath(root, 'sessNoLease');
    assert.ok(!fs.existsSync(leaseFile),
      'recordWrite must not lazy-create lease — crash detection depends on lease absence');
  });
});

test('recordWrite: renews existing lease ts on each write (heartbeat)', () => {
  withRepoRoot((root) => {
    ht.acquireLease(root, 'sessB');
    const leaseFile = ht.leasePath(root, 'sessB');
    const firstPayload = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
    // Backdate ts deterministically — recordWrite must overwrite with current ts.
    const backdated = Object.assign({}, firstPayload, { ts: '2026-01-01T00:00:00.000Z' });
    fs.writeFileSync(leaseFile, JSON.stringify(backdated), 'utf8');
    ht.recordWrite(root, 'sessB', 'tu1', 'PreToolUse', baseEntry());
    const refreshed = JSON.parse(fs.readFileSync(leaseFile, 'utf8'));
    assert.notStrictEqual(refreshed.ts, '2026-01-01T00:00:00.000Z',
      'heartbeat must overwrite backdated ts');
    assert.strictEqual(refreshed.sessionId, 'sessB');
  });
});

test('listActiveLeases: session active beyond legacy 5-minute window is still active', () => {
  withRepoRoot((root) => {
    ht.acquireLease(root, 'longSess');
    const leaseFile = ht.leasePath(root, 'longSess');
    // Backdate mtime to 10 minutes ago (well past the old 5min cutoff)
    const tenMinAgo = Date.now() - (10 * 60 * 1000);
    fs.utimesSync(leaseFile, tenMinAgo / 1000, tenMinAgo / 1000);
    const active = ht.listActiveLeases(root);
    assert.ok(active.longSess, 'lease >5min old must remain active under 24h TTL');
    assert.strictEqual(active.longSess.sessionId, 'longSess');
  });
});
