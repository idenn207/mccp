'use strict';

// v1.12.0 — dashboard-server unit tests.
// Covers: reload-script injection, route behavior (/, identity, SSE, 404),
// missing status.html fallback, PID file roundtrip + repo/cache scoping
// (Codex F1), and 127.0.0.1 binding.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const srv = require('../dashboard-server');

function tmpRepo() {
  // realpath is load-bearing on Windows, not tidiness. os.tmpdir() returns the
  // 8.3 short form (…\ADMINI~1\…); attachWatch's fs.watch then trips a libuv
  // assertion (`!_wcsnicmp(filename, dir, dirlen)`, src/win/fs-event.c) and
  // aborts the whole test PROCESS — which silently took the 19 cases after the
  // reuse test with it.
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-dash-')));
  fs.mkdirSync(path.join(dir, '.claude', 'cache'), { recursive: true });
  return dir;
}

function getJson(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    }).on('error', reject);
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('injectReloadScript inserts before </body>', () => {
  const out = srv.injectReloadScript('<html><body>x</body></html>');
  assert.ok(out.includes('EventSource'));
  assert.ok(out.indexOf('EventSource') < out.indexOf('</body>'));
});

test('injectReloadScript appends when no </body>', () => {
  const out = srv.injectReloadScript('<div>no body tag</div>');
  assert.ok(out.includes('EventSource'));
  assert.ok(out.startsWith('<div>no body tag</div>'));
});

test('GET / serves status.html with reload script injected', async () => {
  const repo = tmpRepo();
  fs.writeFileSync(srv.statusHtmlPath(repo), '<html><body>DASH</body></html>', 'utf8');
  const server = srv.createServer({ repoRoot: repo });
  const port = await listen(server);
  const r = await getJson(port, '/');
  await close(server);
  assert.equal(r.status, 200);
  assert.ok(r.body.includes('DASH'));
  assert.ok(r.body.includes('EventSource'));
  assert.match(r.headers['content-type'], /text\/html/);
});

test('GET / returns guidance HTML when status.html is missing', async () => {
  const repo = tmpRepo();
  const server = srv.createServer({ repoRoot: repo });
  const port = await listen(server);
  const r = await getJson(port, '/');
  await close(server);
  assert.equal(r.status, 200);
  assert.ok(r.body.includes('dashboard-refresh'));
});

test('GET /__mccp_identity returns repo-scoped JSON', async () => {
  const repo = tmpRepo();
  const server = srv.createServer({ repoRoot: repo });
  const port = await listen(server);
  const r = await getJson(port, srv.IDENTITY_ROUTE);
  await close(server);
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /application\/json/);
  const j = JSON.parse(r.body);
  assert.equal(j.server, srv.SERVER_TAG);
  assert.equal(path.resolve(j.repoRoot), path.resolve(repo));
  assert.equal(path.resolve(j.statusPath), srv.statusHtmlPath(repo));
});

test('GET /__mccp_reload opens an SSE stream', async () => {
  const repo = tmpRepo();
  const server = srv.createServer({ repoRoot: repo });
  const port = await listen(server);
  const headers = await new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: srv.RELOAD_ROUTE }, (res) => {
      resolve(res.headers);
      req.destroy();
    });
  });
  await close(server);
  assert.match(headers['content-type'], /text\/event-stream/);
});

test('unknown route returns 404', async () => {
  const repo = tmpRepo();
  const server = srv.createServer({ repoRoot: repo });
  const port = await listen(server);
  const r = await getJson(port, '/nope');
  await close(server);
  assert.equal(r.status, 404);
});

test('writeServerPid / readServerPid roundtrip carries repoRoot + statusPath', () => {
  const repo = tmpRepo();
  const written = srv.writeServerPid(repo, { pid: process.pid, port: 7333 });
  assert.equal(path.resolve(written.repoRoot), path.resolve(repo));
  assert.equal(written.statusPath, srv.statusHtmlPath(repo));
  const read = srv.readServerPid(repo);
  assert.equal(read.pid, process.pid);
  assert.equal(read.host, os.hostname());
});

test('isReusablePid: live PID + matching repo/status → reusable', () => {
  const repo = tmpRepo();
  srv.writeServerPid(repo, { pid: process.pid, port: 7333 });
  const obj = srv.readServerPid(repo);
  assert.equal(srv.isReusablePid(obj, repo, srv.statusHtmlPath(repo)), true);
});

test('isReusablePid: different repoRoot → NOT reusable (Codex F1)', () => {
  const repo = tmpRepo();
  const other = tmpRepo();
  srv.writeServerPid(repo, { pid: process.pid, port: 7333 });
  const obj = srv.readServerPid(repo);
  // Same PID alive, but the PID file claims a different repoRoot than `other`.
  assert.equal(srv.isReusablePid(obj, other, srv.statusHtmlPath(other)), false);
});

test('isReusablePid: dead PID → NOT reusable', () => {
  const repo = tmpRepo();
  srv.writeServerPid(repo, { pid: process.pid, port: 7333 });
  const obj = srv.readServerPid(repo);
  obj.pid = 2147483646; // almost certainly not a live PID
  assert.equal(srv.isReusablePid(obj, repo, srv.statusHtmlPath(repo)), false);
});

test('startServer binds 127.0.0.1 and writes PID, reports stable port', async () => {
  const repo = tmpRepo();
  fs.writeFileSync(srv.statusHtmlPath(repo), '<html><body>X</body></html>', 'utf8');
  // Pick a high port unlikely to collide in CI.
  const port = 7400 + (process.pid % 100);
  const r = await srv.startServer({ repoRoot: repo, port, open: false });
  try {
    assert.equal(r.host, '127.0.0.1');
    assert.equal(r.port, port);
    assert.equal(r.reused, false);
    assert.match(r.url, /^http:\/\/127\.0\.0\.1:/);
    const pid = srv.readServerPid(repo);
    assert.equal(pid.port, port);
  } finally {
    await close(r.server);
  }
});

test('startServer reuses our running server instead of double-binding', async () => {
  const repo = tmpRepo();
  fs.writeFileSync(srv.statusHtmlPath(repo), '<html><body>X</body></html>', 'utf8');
  const port = 7500 + (process.pid % 100);
  const first = await srv.startServer({ repoRoot: repo, port, open: false });
  try {
    const second = await srv.startServer({ repoRoot: repo, port, open: false });
    assert.equal(second.reused, true);
    assert.equal(second.server, null);
    assert.equal(second.port, port);
  } finally {
    await close(first.server);
  }
});

// ── dashboard-interactivity M4 — write-mode obsolete-resolve POST suite ──────

const { enumerate } = require('../stale-audit/enumerate');
const { computeItemId } = require('../stale-audit/item-id');
const { isResolved } = require('../renderer/parsers/resolution-marker');

const FIXTURE_PLAN = [
  '# Plan: m4 fixture',
  '',
  '## Risks',
  '',
  '| Risk | Likelihood | Impact | Mitigation |',
  '|---|---|---|---|',
  '| 첫 번째 위험 | 중 | 높음 | 완화 A |',
  '| 같은 텍스트 위험 | 낮 | 낮음 | 완화 B |',
  '| 같은 텍스트 위험 | 낮 | 낮음 | 완화 C |',
  '',
  '## Open Questions',
  '',
  '- 첫 번째 질문 — severity HIGH',
  '',
].join('\n');

function tmpRepoWithPlan(planText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-m4-'));
  fs.mkdirSync(path.join(dir, '.claude', 'plans'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude', 'cache'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'plans', 'fixture.plan.md'), planText, 'utf8');
  fs.writeFileSync(srv.statusHtmlPath(dir), '<html><body>DASH</body></html>', 'utf8');
  return dir;
}

function planSource(repo) {
  return path.join(repo, '.claude', 'plans', 'fixture.plan.md');
}

// enumerate the fixture and return the computed id for the first matching kind.
function idForKind(repo, kind, nth) {
  const { items } = enumerate({ repoRoot: repo });
  const filtered = items.filter((it) => it.kind === kind);
  const ref = filtered[nth || 0];
  return ref ? computeItemId(ref) : null;
}

function writeServer(repo, nonce) {
  return srv.createServer({ repoRoot: repo, write: true, nonce: nonce || 'testnonce' });
}

function originFor(port) { return 'http://127.0.0.1:' + port; }

function postJson(port, p, bodyObj, headers) {
  return new Promise((resolve, reject) => {
    const payload = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
    const h = Object.assign(
      { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      headers || {},
    );
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: h }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(d); } catch (_) { /* non-json */ }
        resolve({ status: res.statusCode, raw: d, body });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getWith(port, p, headers) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, headers: headers || {} }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
  });
}

// happy-path POST headers: valid Origin + nonce.
function okHeaders(port, nonce) {
  const h = { origin: originFor(port) };
  h[srv.NONCE_HEADER] = nonce || 'testnonce';
  return h;
}

// ── Unit invariants ──

test('M4 isValidReason: empty / 1-token reject, 2+ tokens accept', () => {
  assert.equal(srv.isValidReason(''), false);
  assert.equal(srv.isValidReason('   '), false);
  assert.equal(srv.isValidReason('하나'), false);
  assert.equal(srv.isValidReason('두 단어'), true);
  assert.equal(srv.isValidReason('중복 제거됨 obsolete'), true);
});

test('M4 isContained: only .claude/**/*.md under repoRoot', () => {
  const repo = path.resolve('/tmp/some-repo');
  assert.equal(srv.isContained(repo, '.claude/plans/x.plan.md'), true);
  assert.equal(srv.isContained(repo, '.claude/prds/x.prd.md'), true);
  assert.equal(srv.isContained(repo, 'src/evil.md'), false);          // outside .claude
  assert.equal(srv.isContained(repo, '.claude/plans/x.txt'), false);   // not .md
  assert.equal(srv.isContained(repo, '../escape.md'), false);          // traversal
  assert.equal(srv.isContained(repo, '.claude/../../etc/passwd.md'), false);
});

test('M4 isLoopbackHost: loopback only, port-matched', () => {
  assert.equal(srv.isLoopbackHost('127.0.0.1:7333', 7333), true);
  assert.equal(srv.isLoopbackHost('localhost:7333', 7333), true);
  assert.equal(srv.isLoopbackHost('127.0.0.1', 7333), true); // no port in Host is fine
  assert.equal(srv.isLoopbackHost('evil.com:7333', 7333), false);
  assert.equal(srv.isLoopbackHost('127.0.0.1:9999', 7333), false); // port mismatch
  assert.equal(srv.isLoopbackHost('', 7333), false);
  assert.equal(srv.isLoopbackHost(undefined, 7333), false);
});

test('M4 [F3] isApplySuccess: only applied==1 & 0 error/abort/skip', () => {
  assert.equal(srv.isApplySuccess({ applied: [1], skipped: [], aborted: [], errors: [] }), true);
  assert.equal(srv.isApplySuccess({ applied: [], skipped: [1], aborted: [], errors: [] }), false);
  assert.equal(srv.isApplySuccess({ applied: [1], skipped: [1], aborted: [], errors: [] }), false);
  assert.equal(srv.isApplySuccess({ applied: [1], skipped: [], aborted: ['x'], errors: [] }), false);
  assert.equal(srv.isApplySuccess({ applied: [1], skipped: [], aborted: [], errors: [{ e: 1 }] }), false);
  assert.equal(srv.isApplySuccess({ applied: [1, 1], skipped: [], aborted: [], errors: [] }), false);
  assert.equal(srv.isApplySuccess(null), false);
});

test('M4 [F2] isReusablePid: write-mode mismatch → NOT reusable (both directions)', () => {
  const repo = tmpRepo();
  // read-only PID, --write request → not reusable.
  srv.writeServerPid(repo, { pid: process.pid, port: 7333, write: false });
  let obj = srv.readServerPid(repo);
  assert.equal(srv.isReusablePid(obj, repo, srv.statusHtmlPath(repo), true), false);
  assert.equal(srv.isReusablePid(obj, repo, srv.statusHtmlPath(repo), false), true);
  // write PID, default request → not reusable.
  srv.writeServerPid(repo, { pid: process.pid, port: 7333, write: true });
  obj = srv.readServerPid(repo);
  assert.equal(srv.isReusablePid(obj, repo, srv.statusHtmlPath(repo), false), false);
  assert.equal(srv.isReusablePid(obj, repo, srv.statusHtmlPath(repo), true), true);
});

// ── Route presence (test 1) ──

test('M4 [1] default server: POST /__mccp_resolve → 404 (route absent) + no write script', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = srv.createServer({ repoRoot: repo }); // no write
  const port = await listen(server);
  try {
    const r = await postJson(port, srv.RESOLVE_ROUTE, { id: 'x', reason: 'a b' });
    assert.equal(r.status, 404);
    const g = await getWith(port, '/');
    assert.ok(!g.body.includes('data-mccp-write'), 'no write affordance in default serve');
    assert.ok(!g.body.includes('__MCCP_RESOLVE_NONCE'), 'no nonce leaked in default serve');
    // source unchanged
    assert.ok(!isResolved(fs.readFileSync(planSource(repo), 'utf8').split(/\r?\n/).find((l) => l.includes('첫 번째 위험'))));
  } finally {
    await close(server);
  }
});

test('M4 write server: GET / injects nonce + write script', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo, 'noncE123');
  const port = await listen(server);
  try {
    const g = await getWith(port, '/');
    assert.ok(g.body.includes('__MCCP_RESOLVE_NONCE'));
    assert.ok(g.body.includes('noncE123'));
    assert.ok(g.body.includes('data-mccp-write'));
  } finally {
    await close(server);
  }
});

// ── Validation chain rejections (tests 2,3,6,4,8) ──

test('M4 [2] write server: Origin mismatch POST → reject, source unchanged', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const id = idForKind(repo, 'risk', 0);
    const h = { origin: 'http://evil.com:1234' };
    h[srv.NONCE_HEADER] = 'testnonce';
    const r = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '제외 사유 충분' }, h);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'origin not allowed');
    const src = fs.readFileSync(planSource(repo), 'utf8');
    assert.ok(!/mccp:resolved/.test(src), 'source must be unchanged');
  } finally {
    await close(server);
  }
});

test('M4 [3] write server: missing / wrong nonce → reject', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const id = idForKind(repo, 'risk', 0);
    // missing nonce
    let r = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '제외 사유 충분' }, { origin: originFor(port) });
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'nonce mismatch');
    // wrong nonce
    const h = { origin: originFor(port) }; h[srv.NONCE_HEADER] = 'WRONG';
    r = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '제외 사유 충분' }, h);
    assert.equal(r.status, 403);
  } finally {
    await close(server);
  }
});

test('M4 [6] write server: empty / 1-token reason → reject', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const id = idForKind(repo, 'risk', 0);
    let r = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '' }, okHeaders(port));
    assert.equal(r.status, 400);
    r = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '한단어' }, okHeaders(port));
    assert.equal(r.status, 400);
  } finally {
    await close(server);
  }
});

test('M4 [4] write server: unknown / stale id → reject (re-enumerate miss)', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const r = await postJson(port, srv.RESOLVE_ROUTE, { id: '0000000000000000', reason: '제외 사유 충분' }, okHeaders(port));
    assert.equal(r.status, 409);
    assert.equal(r.body.stale, true);
  } finally {
    await close(server);
  }
});

test('M4 [6b] write server: malformed id → 400', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const r = await postJson(port, srv.RESOLVE_ROUTE, { id: 'NOT-HEX', reason: '제외 사유 충분' }, okHeaders(port));
    assert.equal(r.status, 400);
  } finally {
    await close(server);
  }
});

test('M4 [8][F1] non-loopback Host → / and POST both 403 (DNS-rebinding)', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const id = idForKind(repo, 'risk', 0);
    const g = await getWith(port, '/', { host: 'evil.com' });
    assert.equal(g.status, 403);
    assert.ok(!g.body.includes('__MCCP_RESOLVE_NONCE'), 'nonce must not leak to rebind page');
    const h = { origin: originFor(port), host: 'evil.com' };
    h[srv.NONCE_HEADER] = 'testnonce';
    const r = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '제외 사유 충분' }, h);
    assert.equal(r.status, 403);
    assert.ok(!/mccp:resolved/.test(fs.readFileSync(planSource(repo), 'utf8')));
  } finally {
    await close(server);
  }
});

test('M4 [body cap] oversized body → 413', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const big = '{"id":"0000000000000000","reason":"' + 'x'.repeat(20000) + '"}';
    const r = await postJson(port, srv.RESOLVE_ROUTE, big, okHeaders(port));
    assert.equal(r.status, 413);
  } finally {
    await close(server);
  }
});

// ── Happy path + collapse (tests 7,12,13) ──

test('M4 [7][12] happy path: valid id+reason+nonce+Origin → apply marks source', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const id = idForKind(repo, 'risk', 0);
    const r = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '중복 제거됨 obsolete' }, okHeaders(port));
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    const src = fs.readFileSync(planSource(repo), 'utf8');
    const firstRisk = src.split(/\r?\n/).find((l) => l.includes('첫 번째 위험'));
    assert.ok(isResolved(firstRisk), 'first risk row must carry the resolved marker');
    assert.ok(/reason="중복 제거됨 obsolete"/.test(firstRisk), 'reason recorded in marker');
  } finally {
    await close(server);
  }
});

test('M4 [7] happy path: OQ resolve marks source', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const id = idForKind(repo, 'oq', 0);
    const r = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '이미 해결됨 obsolete' }, okHeaders(port));
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    const src = fs.readFileSync(planSource(repo), 'utf8');
    const oqLine = src.split(/\r?\n/).find((l) => l.includes('첫 번째 질문'));
    assert.ok(isResolved(oqLine), 'OQ line must carry the resolved marker');
  } finally {
    await close(server);
  }
});

test('M4 [13][F4] success write re-renders status.html (rendered=true) + idempotent re-post stale', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    const id = idForKind(repo, 'risk', 0);
    const before = fs.readFileSync(srv.statusHtmlPath(repo), 'utf8');
    const r = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '중복 제거 obsolete' }, okHeaders(port));
    assert.equal(r.status, 200);
    assert.equal(r.body.rendered, true, 'render-after-write must advance the cache');
    const after = fs.readFileSync(srv.statusHtmlPath(repo), 'utf8');
    assert.notEqual(before, after, 'status.html must be re-rendered (collapse reflected)');
    // re-posting the SAME id now misses re-enumerate (resolved rows are dropped) → stale.
    const r2 = await postJson(port, srv.RESOLVE_ROUTE, { id, reason: '중복 제거 obsolete' }, okHeaders(port));
    assert.equal(r2.status, 409);
    assert.equal(r2.body.stale, true);
  } finally {
    await close(server);
  }
});

// ── duplicate-text safety (test 14) ──

test('M4 [14] duplicate-text risks: resolving ordinal-0 id marks ONLY that row', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const server = writeServer(repo);
  const port = await listen(server);
  try {
    // risk index 1 and 2 share "같은 텍스트 위험" — resolve the FIRST of the pair.
    const { items } = enumerate({ repoRoot: repo });
    const dups = items.filter((it) => it.kind === 'risk' && it.text === '같은 텍스트 위험');
    assert.equal(dups.length, 2);
    const firstDupId = computeItemId(dups[0]);
    const r = await postJson(port, srv.RESOLVE_ROUTE, { id: firstDupId, reason: '중복 항목 obsolete' }, okHeaders(port));
    assert.equal(r.status, 200);
    const lines = fs.readFileSync(planSource(repo), 'utf8').split(/\r?\n/).filter((l) => l.includes('같은 텍스트 위험'));
    const resolvedCount = lines.filter(isResolved).length;
    assert.equal(resolvedCount, 1, 'exactly one of the duplicate-text rows is marked');
  } finally {
    await close(server);
  }
});

// ── mode transition (test 10) ──

test('M4 [10] mode transition: read-only up then --write starts fresh (no reuse)', async () => {
  const repo = tmpRepoWithPlan(FIXTURE_PLAN);
  const ro = await srv.startServer({ repoRoot: repo, port: 7600 + (process.pid % 80), open: false });
  try {
    // --write request on a DIFFERENT port must not reuse the read-only server.
    const w = await srv.startServer({ repoRoot: repo, port: 7700 + (process.pid % 80), open: false, write: true });
    try {
      assert.equal(w.reused, false);
      assert.equal(w.writeEnabled, true);
    } finally {
      if (w.server) await close(w.server);
    }
  } finally {
    if (ro.server) await close(ro.server);
  }
});

// ── session-process-reclaim M1 — registry wiring (Task 3) ───────────────────
//
// The reuse branch is driven the same way the existing
// 'startServer reuses our running server instead of double-binding' case drives
// it — two startServer calls on one repo and port — with the only addition
// being a different session id on the second call. No new injection seam.

const sessionProcesses = require('../session-processes');

// Ask the OS for a free port instead of guessing one from the pid.
// `7600 + (process.pid % 100)` collided with TCP 7680, which Windows Delivery
// Optimization holds — the bind failed with EACCES and took a whole full-suite
// run with it, on roughly 1% of pids. Binding port 0 and reading back what the
// kernel assigned removes the entire class. The tiny race (another process could
// claim it between close and re-listen) is far smaller than the odds of landing
// on a service port, and unlike that case it is not deterministic per machine.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function setSid(sid) {
  const prev = process.env.CLAUDE_CODE_SESSION_ID;
  if (sid === null) delete process.env.CLAUDE_CODE_SESSION_ID;
  else process.env.CLAUDE_CODE_SESSION_ID = sid;
  return prev;
}

test('startServer registers itself, records reuse under the reusing session, and unregisters on close', async () => {
  const repo = tmpRepo();
  fs.writeFileSync(srv.statusHtmlPath(repo), '<html><body>X</body></html>', 'utf8');
  const port = await freePort();
  const OWNER = 'sess-dash-owner';
  const REUSER = 'sess-dash-reuser';
  const prev = setSid(OWNER);

  let first = null;
  try {
    first = await srv.startServer({ repoRoot: repo, port, open: false });
    assert.equal(first.reused, false);

    // (a) the booting server owns its own record.
    const owned = sessionProcesses.list(repo, OWNER, { isAlive: () => true }).records;
    assert.equal(owned.length, 1);
    assert.equal(owned[0].pid, process.pid);
    assert.equal(owned[0].kind, 'dashboard-server');
    assert.equal(owned[0].role, 'owner');
    // Not reclaimed by default: whether a dashboard should outlive its session
    // is an open product question, so the default preserves today's behavior.
    assert.equal(owned[0].lifetime, 'outlives-session');

    const ownerFile = path.join(sessionProcesses.sessionDir(repo, OWNER), process.pid + '.json');
    const ownerBytesBefore = fs.readFileSync(ownerFile);

    // (b) a second session reusing the server writes a reuse record of its own.
    setSid(REUSER);
    const second = await srv.startServer({ repoRoot: repo, port, open: false });
    assert.equal(second.reused, true);

    const reuse = sessionProcesses.list(repo, REUSER, { isAlive: () => true }).records;
    assert.equal(reuse.length, 1);
    assert.equal(reuse[0].pid, process.pid);
    assert.equal(reuse[0].role, 'reuse');
    assert.deepEqual(fs.readFileSync(ownerFile), ownerBytesBefore,
      'the owner record is never touched by the reusing session — there is no shared '
      + 'mutable state and therefore no write race');
  } finally {
    setSid(OWNER);
    if (first && first.server) await close(first.server);
    setSid(prev === undefined ? null : prev);
  }

  // (c) a clean shutdown leaves nothing for SessionEnd to reclaim.
  assert.equal(sessionProcesses.list(repo, OWNER, { isAlive: () => true }).records.length, 0);
});

// ── round-1 santa-loop finding: a FAILED reuse registration must be loud ─────
//
// The reuse record is the only thing that tells the owning session "someone else
// is still using this". Both call sites discarded the result, so a reusing
// session with no resolvable session identity silently deleted the owner's
// `in_use_by_live_session` guard — and under MCCP_RECLAIM_OUTLIVES=1 the owner
// would then SIGTERM a server actively in use. We cannot repair that from the
// borrower (the owner is another process), so the requirement is that the
// missing guard is announced at the moment it goes missing.

test('a reuse registration that fails is surfaced, not swallowed', async () => {
  const repo = tmpRepo();
  fs.writeFileSync(srv.statusHtmlPath(repo), '<html><body>X</body></html>', 'utf8');
  const port = await freePort();
  const OWNER = 'sess-dash-owner-2';
  const prev = setSid(OWNER);
  const prevMccp = process.env.MCCP_SESSION_ID;
  const prevClaude = process.env.CLAUDE_SESSION_ID;

  const written = [];
  const realWrite = process.stderr.write.bind(process.stderr);

  let first = null;
  try {
    first = await srv.startServer({ repoRoot: repo, port, open: false });
    assert.equal(first.reused, false);

    // A reusing session with NO resolvable identity anywhere: register() bails
    // at `no_session_identity`, which is the cheapest real way to lose the guard.
    setSid(null);
    delete process.env.MCCP_SESSION_ID;
    delete process.env.CLAUDE_SESSION_ID;

    process.stderr.write = (chunk, ...rest) => { written.push(String(chunk)); return realWrite(chunk, ...rest); };
    let second;
    try {
      second = await srv.startServer({ repoRoot: repo, port, open: false });
    } finally {
      process.stderr.write = realWrite;
    }
    assert.equal(second.reused, true, 'reuse itself must still work — the dashboard is not broken by this');

    const announced = written.join('');
    assert.ok(/reuse record NOT written/.test(announced),
      'the failure must name itself; discarding the result was the defect');
    assert.ok(/MCCP_RECLAIM_OUTLIVES/.test(announced),
      'and it must name the CONSEQUENCE — an operator who does not know which '
      + 'toggle turns this into a kill cannot act on the warning');
  } finally {
    process.stderr.write = realWrite;
    setSid(OWNER);
    if (first && first.server) await close(first.server);
    setSid(prev === undefined ? null : prev);
    if (prevMccp === undefined) delete process.env.MCCP_SESSION_ID;
    else process.env.MCCP_SESSION_ID = prevMccp;
    if (prevClaude === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = prevClaude;
  }
});
