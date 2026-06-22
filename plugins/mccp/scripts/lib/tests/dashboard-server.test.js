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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-dash-'));
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
