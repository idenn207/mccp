'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { triggerRender, reclaimLock, isPidAlive } = require('../trigger');

function tmpRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-trigger-'));
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  return root;
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
}

function stubModel() {
  return {
    schema_version: 'v1',
    derived_at: '2026-06-19T00:00:00.000Z',
    repo_root: '<repo>',
    masked: true,
    m0_capability: { contract_present: true, evidence: '' },
    sources: {
      plans:     { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      receipts:  { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      state:     { ok: true, item: null, degraded: false, error: null },
      backlog:   { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      fix_task:  { ok: true, item: null, degraded: false, error: null },
      pr:        { ok: true, item: null, degraded: false, error: null },
      envelopes: { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
    },
    correlations: [],
    warnings: [],
  };
}

function stubRender() {
  return { md: '# stub', html: '<html><body>stub</body></html>', verdict: { tone: 'muted', icon: '·', text: 'idle' } };
}

// Path (a) — cold trigger writes cache files + returns true.
test('trigger.test path a: cold trigger writes STATUS.md + status.html + returns true', () => {
  const root = tmpRepo();
  try {
    const ok = triggerRender('test-cold', {
      cwd: root, repoRoot: root,
      deriveImpl: () => stubModel(),
      renderImpl: () => stubRender(),
    });
    assert.equal(ok, true, 'cold trigger should return true');
    const cacheDir = path.join(root, '.claude', 'cache');
    assert.ok(fs.existsSync(path.join(cacheDir, 'STATUS.md')), 'STATUS.md exists');
    assert.ok(fs.existsSync(path.join(cacheDir, 'status.html')), 'status.html exists');
    assert.ok(fs.existsSync(path.join(cacheDir, '.last-render.json')), 'last-render.json exists');
    const lr = JSON.parse(fs.readFileSync(path.join(cacheDir, '.last-render.json'), 'utf8'));
    assert.equal(lr.reason, 'test-cold');
    assert.equal(lr.was_stale, false, 'first render is not stale');
  } finally { cleanup(root); }
});

// Path (b) — second trigger within 5s window returns false (debounce).
test('trigger.test path b: second trigger within debounce window returns false + STATUS.md mtime unchanged', () => {
  const root = tmpRepo();
  try {
    const ok1 = triggerRender('test-first', {
      cwd: root, repoRoot: root,
      deriveImpl: () => stubModel(), renderImpl: () => stubRender(),
    });
    assert.equal(ok1, true);
    const mt1 = fs.statSync(path.join(root, '.claude', 'cache', 'STATUS.md')).mtimeMs;
    const ok2 = triggerRender('test-second', {
      cwd: root, repoRoot: root,
      debounceMs: 5000,
      deriveImpl: () => stubModel(), renderImpl: () => stubRender(),
    });
    assert.equal(ok2, false, 'debounced trigger returns false');
    const mt2 = fs.statSync(path.join(root, '.claude', 'cache', 'STATUS.md')).mtimeMs;
    assert.equal(mt1, mt2, 'STATUS.md mtime unchanged after debounce skip');
  } finally { cleanup(root); }
});

// Path (c) — trigger with _injectRenderThrow returns false + stderr loud pattern.
test('trigger.test path c: _injectRenderThrow → false + loud stderr', () => {
  const root = tmpRepo();
  const stderrChunks = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrChunks.push(String(chunk)); return true; };
  try {
    const ok = triggerRender('test-throw', {
      cwd: root, repoRoot: root,
      _injectRenderThrow: true,
    });
    assert.equal(ok, false);
    const merged = stderrChunks.join('');
    assert.match(merged, /\[mccp:renderer-trigger\] reason=test-throw FAILED render: .* \(allow\)/);
  } finally {
    process.stderr.write = origWrite;
    cleanup(root);
  }
});

// Path (d) — lock held + mtime < lease + live PID on same host → returns false.
test('trigger.test path d: lock held by live same-host PID → SKIP', () => {
  const root = tmpRepo();
  const cacheDir = path.join(root, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, '.render.lock'),
    JSON.stringify({
      pid: process.pid,
      host: os.hostname(),
      started_at: new Date().toISOString(),
    }), 'utf8'
  );
  try {
    const ok = triggerRender('test-busy', {
      cwd: root, repoRoot: root,
      deriveImpl: () => stubModel(), renderImpl: () => stubRender(),
    });
    assert.equal(ok, false, 'lock held → return false');
    const dirtyPath = path.join(cacheDir, '.trigger-dirty');
    assert.ok(fs.existsSync(dirtyPath), 'dirty marker appended');
    const body = fs.readFileSync(dirtyPath, 'utf8');
    assert.match(body, /test-busy\t/);
  } finally { cleanup(root); }
});

// Path (e) — lock held + mtime > lease + dead PID → reclaim + render proceeds.
test('trigger.test path e: stale lock reclaimed + render proceeds', () => {
  const root = tmpRepo();
  const cacheDir = path.join(root, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const lockPath = path.join(cacheDir, '.render.lock');
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: 999999, host: os.hostname(),
    started_at: new Date(Date.now() - 200000).toISOString(),
  }), 'utf8');
  // Backdate mtime so it's past lease.
  const old = new Date(Date.now() - 200000);
  fs.utimesSync(lockPath, old, old);
  try {
    const ok = triggerRender('test-reclaim', {
      cwd: root, repoRoot: root,
      lockLeaseMs: 90000,
      deriveImpl: () => stubModel(), renderImpl: () => stubRender(),
    });
    assert.equal(ok, true, 'stale lock reclaim → render proceeds');
    assert.ok(fs.existsSync(path.join(cacheDir, 'STATUS.md')));
  } finally { cleanup(root); }
});

// Path (f) — was_stale: true flagged when previous STATUS.md mtime > 60s.
test('trigger.test path f: was_stale=true when prev STATUS.md mtime > 60s', () => {
  const root = tmpRepo();
  const cacheDir = path.join(root, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const statusPath = path.join(cacheDir, 'STATUS.md');
  fs.writeFileSync(statusPath, '# old', 'utf8');
  const old = new Date(Date.now() - 90000);
  fs.utimesSync(statusPath, old, old);
  try {
    const ok = triggerRender('test-stale', {
      cwd: root, repoRoot: root,
      deriveImpl: () => stubModel(), renderImpl: () => stubRender(),
    });
    assert.equal(ok, true);
    const lr = JSON.parse(fs.readFileSync(path.join(cacheDir, '.last-render.json'), 'utf8'));
    assert.equal(lr.was_stale, true);
    assert.ok(Number.isFinite(lr.prev_age_seconds) && lr.prev_age_seconds >= 60);
  } finally { cleanup(root); }
});

// Path (g) — concurrent triggers: second appends to dirty marker
// while first holds the lock (F1 absorption). Simulated by injecting a
// pre-existing lock body owned by the current process.
test('trigger.test path g: concurrent trigger appends dirty marker (F1 absorption)', () => {
  const root = tmpRepo();
  const cacheDir = path.join(root, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, '.render.lock'), JSON.stringify({
    pid: process.pid, host: os.hostname(),
    started_at: new Date().toISOString(),
  }), 'utf8');
  try {
    triggerRender('reason-1', { cwd: root, repoRoot: root });
    triggerRender('reason-2', { cwd: root, repoRoot: root });
    triggerRender('reason-3', { cwd: root, repoRoot: root });
    const dirtyBody = fs.readFileSync(path.join(cacheDir, '.trigger-dirty'), 'utf8');
    assert.match(dirtyBody, /reason-1/);
    assert.match(dirtyBody, /reason-2/);
    assert.match(dirtyBody, /reason-3/);
  } finally { cleanup(root); }
});

// Path (h) — v1.20.6 B#2: stale-mtime + live PID on same host → reclaim
// (PID-reuse imposter). This lock has no heartbeat, but a genuine render
// holds it for only ~200-500ms ≪ the 90s lease, so a stale mtime means the
// crashed render's PID was reused by an unrelated process → reclaim.
test('trigger.test path h: live same-host PID + stale mtime → reclaimed (B#2 imposter)', () => {
  const root = tmpRepo();
  const cacheDir = path.join(root, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const lockPath = path.join(cacheDir, '.render.lock');
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: process.pid, host: os.hostname(),
    started_at: new Date(Date.now() - 200000).toISOString(),
  }), 'utf8');
  const old = new Date(Date.now() - 200000);
  fs.utimesSync(lockPath, old, old);
  const reclaimed = reclaimLock(lockPath, 90000);
  assert.equal(reclaimed, true, 'live same-host PID with stale mtime must be reclaimed (imposter)');
  assert.ok(!fs.existsSync(lockPath), 'imposter lock file unlinked');
  cleanup(root);
});

// Path (h2) — v1.20.6 B#2: fresh-mtime + live PID on same host → reclaim
// REFUSED (protect the real in-flight render).
test('trigger.test path h2: live same-host PID + fresh mtime → NEVER reclaimed (live render)', () => {
  const root = tmpRepo();
  const cacheDir = path.join(root, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const lockPath = path.join(cacheDir, '.render.lock');
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: process.pid, host: os.hostname(),
    started_at: new Date().toISOString(),
  }), 'utf8');
  // mtime is fresh (just written) — a genuine in-flight render.
  const reclaimed = reclaimLock(lockPath, 90000);
  assert.equal(reclaimed, false, 'live same-host PID with fresh mtime must NOT be reclaimed');
  assert.ok(fs.existsSync(lockPath), 'live render lock preserved');
  cleanup(root);
});

// Path (i) — stale-mtime + dead PID → reclaim succeeds.
test('trigger.test path i: stale-mtime + dead PID on same host → reclaim succeeds', () => {
  const root = tmpRepo();
  const cacheDir = path.join(root, '.claude', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const lockPath = path.join(cacheDir, '.render.lock');
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: 999999, host: os.hostname(),
    started_at: new Date(Date.now() - 200000).toISOString(),
  }), 'utf8');
  const old = new Date(Date.now() - 200000);
  fs.utimesSync(lockPath, old, old);
  const reclaimed = reclaimLock(lockPath, 90000);
  assert.equal(reclaimed, true, 'dead same-host PID should be reclaimed');
  assert.ok(!fs.existsSync(lockPath), 'lock file unlinked');
  cleanup(root);
});

test('trigger.test isPidAlive: current process is alive, fake high pid is not', () => {
  assert.equal(isPidAlive(process.pid), true);
  assert.equal(isPidAlive(999999), false);
});

// v1.3.0-m5 path j — successful trigger writes today's snapshot when the
// derive model carries at least one receipt or envelope (M5 integration).
test('trigger.test path j: successful render with non-empty receipts writes today snapshot (M5)', () => {
  const root = tmpRepo();
  try {
    const richModel = stubModel();
    richModel.sources.receipts = {
      ok: true,
      count: 1,
      items: [{
        ok: true,
        gate: 'mccp-implement-codex',
        decision_id: 'v1-3-0-m5-trigger-fixture',
        created_at: new Date().toISOString(),
        converged: true,
        receipt_hash: 'sha256:deadbeef',
        briefing_summary: null,
        briefing_token_count: null,
        briefing_invocation_count: 0,
        codex_skipped_at_pr: false, codex_skip_reason: null,
        codex_dedupe_at_pr: false, ipc_envelope_path: null,
        dispatched_by_controller_session_id: null, worker_dispatch_id: null,
      }],
      invalid_count: 0, degraded: false, error: null,
    };
    const ok = triggerRender('test-snapshot', {
      cwd: root, repoRoot: root,
      deriveImpl: () => richModel,
      renderImpl: () => stubRender(),
    });
    assert.equal(ok, true);
    const todayYmd = new Date().toISOString().slice(0, 10);
    const snapPath = path.join(root, '.claude', 'cache', 'snapshots', todayYmd + '.json');
    assert.ok(fs.existsSync(snapPath), 'today snapshot file exists: ' + snapPath);
    const payload = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    assert.equal(payload.schema_version, 'snapshot-v1');
    assert.equal(payload.receipts.length, 1);
    assert.equal(payload.receipts[0].receipt_hash, 'sha256:deadbeef');
  } finally { cleanup(root); }
});
