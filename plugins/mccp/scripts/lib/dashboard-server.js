#!/usr/bin/env node
'use strict';

// v1.12.0 — localhost dashboard server for `.claude/cache/status.html`.
//
// Public surface:
//   startServer(opts) → Promise<{ server, port, url, host, reused, repoRoot, statusPath }>
//   createServer({ repoRoot, statusPath, getClients }) → http.Server  (not listening)
//   injectReloadScript(html) → string
//   readServerPid(repoRoot) / writeServerPid(...) / isReusablePid(...)
//
// Design (Codex Plan-Codex R1 absorptions):
//   F1 — PID file is repo/cache scoped. Reuse only when same-host AND live PID
//        AND repoRoot match AND statusPath match. A stale PID copied across
//        worktrees never reuses another checkout's server.
//   F2 — No silent port fall-forward. When the requested port is busy we probe
//        whether the listener is OUR dashboard for THIS repo (identity route).
//        If yes → reuse + report URL. If foreign → loud error + require --port.
//
// Loud fail-open per [[feedback-loud-fail-open]]: best-effort paths (browser
// open, file watch) never throw; they emit a loud stderr line and degrade to
// static serving. The bind/identity contract IS allowed to reject loudly.
//
// 127.0.0.1 binding is fixed — local dogfood only, never externally exposed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const DEFAULT_PORT = 7333;
const DEFAULT_HOST = '127.0.0.1';
const PID_FILENAME = '.dashboard-server.pid';
const RELOAD_ROUTE = '/__mccp_reload';
const IDENTITY_ROUTE = '/__mccp_identity';
const SERVER_TAG = 'mccp-dashboard';
const WATCH_DEBOUNCE_MS = 200;

function cacheDir(repoRoot) {
  return path.join(repoRoot, '.claude', 'cache');
}

function statusHtmlPath(repoRoot) {
  return path.join(cacheDir(repoRoot), 'status.html');
}

function pidFilePath(repoRoot) {
  return path.join(cacheDir(repoRoot), PID_FILENAME);
}

// ── PID file (Codex F1 — repo/cache scoped identity) ──────────────────────

function writeServerPid(repoRoot, info) {
  const body = {
    pid: info.pid,
    host: os.hostname(),
    port: info.port,
    started_at: new Date().toISOString(),
    repoRoot: path.resolve(repoRoot),
    statusPath: path.resolve(info.statusPath || statusHtmlPath(repoRoot)),
  };
  const dir = cacheDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = pidFilePath(repoRoot) + '.' + process.pid + '-' + Math.random().toString(36).slice(2) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), 'utf8');
  fs.renameSync(tmp, pidFilePath(repoRoot));
  return body;
}

function readServerPid(repoRoot) {
  try {
    const raw = fs.readFileSync(pidFilePath(repoRoot), 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function pidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = process exists but owned by another user → treat as alive.
    return err && err.code === 'EPERM';
  }
}

// 3중 AND: same-host AND live PID AND repoRoot match AND statusPath match.
function isReusablePid(pidObj, repoRoot, statusPath) {
  if (!pidObj) return false;
  if (pidObj.host !== os.hostname()) return false;
  if (!pidAlive(pidObj.pid)) return false;
  if (path.resolve(pidObj.repoRoot || '') !== path.resolve(repoRoot)) return false;
  const want = path.resolve(statusPath || statusHtmlPath(repoRoot));
  if (path.resolve(pidObj.statusPath || '') !== want) return false;
  return true;
}

function removeServerPid(repoRoot) {
  try { fs.unlinkSync(pidFilePath(repoRoot)); } catch (_) { /* already gone */ }
}

// ── HTML reload-script injection (served on-the-fly; cache file stays pristine) ──

function reloadScript() {
  return [
    '<script>',
    '(function(){',
    "  try {",
    "    var es = new EventSource('" + RELOAD_ROUTE + "');",
    '    es.onmessage = function(){ location.reload(); };',
    '    es.onerror = function(){ /* keep last render; EventSource auto-retries */ };',
    '  } catch (e) {}',
    '})();',
    '</script>',
  ].join('\n');
}

function injectReloadScript(html) {
  const snippet = '\n' + reloadScript() + '\n';
  const idx = html.lastIndexOf('</body>');
  if (idx === -1) return html + snippet;
  return html.slice(0, idx) + snippet + html.slice(idx);
}

function missingStatusHtml() {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">',
    '<title>mccp dashboard</title></head><body>',
    '<h1>대시보드가 아직 생성되지 않았습니다</h1>',
    '<p><code>/mccp:dashboard-refresh</code> 를 먼저 실행해 STATUS를 렌더한 뒤 새로고침하세요.</p>',
    injectReloadScript(''),
    '</body></html>',
  ].join('\n');
}

function buildIdentity(repoRoot, statusPath) {
  return {
    server: SERVER_TAG,
    repoRoot: path.resolve(repoRoot),
    statusPath: path.resolve(statusPath || statusHtmlPath(repoRoot)),
  };
}

// ── HTTP server (fixed routes only — no req.url→file mapping → no traversal) ──

function createServer(opts) {
  const repoRoot = path.resolve(opts.repoRoot);
  const statusPath = path.resolve(opts.statusPath || statusHtmlPath(repoRoot));
  // Set of live SSE response objects. Shared so startServer can push reloads.
  const clients = opts.clients || new Set();

  const server = http.createServer((req, res) => {
    // Only GET is meaningful.
    const url = (req.url || '/').split('?')[0];

    if (url === IDENTITY_ROUTE) {
      const body = JSON.stringify(buildIdentity(repoRoot, statusPath));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(body);
      return;
    }

    if (url === RELOAD_ROUTE) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => { clients.delete(res); });
      return;
    }

    if (url === '/') {
      let html;
      try {
        html = injectReloadScript(fs.readFileSync(statusPath, 'utf8'));
      } catch (_) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(missingStatusHtml());
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  server._mccpClients = clients;
  server._mccpStatusPath = statusPath;
  return server;
}

// ── live-reload file watch (best-effort, loud fail-open) ──

function attachWatch(server) {
  const statusPath = server._mccpStatusPath;
  const clients = server._mccpClients;
  let timer = null;
  const notify = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      for (const res of clients) {
        try { res.write('data: reload\n\n'); } catch (_) { clients.delete(res); }
      }
    }, WATCH_DEBOUNCE_MS);
  };
  try {
    // Watch the cache dir (status.html is replaced via rename, which fs.watch
    // on the file alone can miss on some platforms).
    const watcher = fs.watch(path.dirname(statusPath), (_evt, fname) => {
      if (!fname || fname === path.basename(statusPath)) notify();
    });
    server.on('close', () => { try { watcher.close(); } catch (_) {} });
    return true;
  } catch (_) {
    try {
      fs.watchFile(statusPath, { interval: 1000 }, () => notify());
      server.on('close', () => { try { fs.unwatchFile(statusPath); } catch (_) {} });
      return true;
    } catch (err) {
      process.stderr.write('[mccp:dashboard] file watch unavailable; live-reload disabled, static serving continues (allow): '
        + (err && err.message) + '\n');
      return false;
    }
  }
}

// ── browser open (best-effort, loud fail-open) ──

function openBrowser(url) {
  try {
    let cmd;
    let args;
    if (process.platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '', url]; }
    else if (process.platform === 'darwin') { cmd = 'open'; args = [url]; }
    else { cmd = 'xdg-open'; args = [url]; }
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {
      process.stderr.write('[mccp:dashboard] browser open failed; open manually: ' + url + '\n');
    });
    child.unref();
  } catch (_) {
    process.stderr.write('[mccp:dashboard] browser open failed; open manually: ' + url + '\n');
  }
}

function probeIdentity(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: IDENTITY_ROUTE, timeout: timeoutMs || 1000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function urlFor(host, port) {
  return 'http://' + host + ':' + port + '/';
}

// ── orchestration ──

async function startServer(opts = {}) {
  const repoRoot = path.resolve(opts.repoRoot || process.cwd());
  const host = opts.host || DEFAULT_HOST;
  const port = opts.port || DEFAULT_PORT;
  const open = opts.open !== false;
  const statusPath = path.resolve(opts.statusPath || statusHtmlPath(repoRoot));

  // 1. Reuse-our-server check via PID file (Codex F1).
  const existing = readServerPid(repoRoot);
  if (isReusablePid(existing, repoRoot, statusPath)) {
    const ident = await probeIdentity(host, existing.port, 800);
    if (ident && ident.server === SERVER_TAG
        && path.resolve(ident.repoRoot) === repoRoot
        && path.resolve(ident.statusPath) === statusPath) {
      const u = urlFor(host, existing.port);
      if (open) openBrowser(u);
      return { server: null, port: existing.port, url: u, host, reused: true, repoRoot, statusPath };
    }
    // PID file claimed reuse but no live identity match → stale; clear it.
    removeServerPid(repoRoot);
  }

  // 2. Bind. On EADDRINUSE, distinguish our-server (reuse) vs foreign (reject).
  const server = createServer({ repoRoot, statusPath });

  const bound = await new Promise((resolve, reject) => {
    const onError = async (err) => {
      if (err && err.code === 'EADDRINUSE') {
        const ident = await probeIdentity(host, port, 800);
        if (ident && ident.server === SERVER_TAG && path.resolve(ident.repoRoot) === repoRoot) {
          resolve({ reused: true });
          return;
        }
        reject(Object.assign(new Error(
          'port ' + port + ' is in use by a foreign process on ' + host
          + '. Re-run with --port <n> to choose another port.'), { code: 'EADDRINUSE_FOREIGN' }));
        return;
      }
      reject(err);
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.removeListener('error', onError);
      resolve({ reused: false });
    });
  });

  if (bound.reused) {
    const u = urlFor(host, port);
    if (open) openBrowser(u);
    return { server: null, port, url: u, host, reused: true, repoRoot, statusPath };
  }

  attachWatch(server);
  writeServerPid(repoRoot, { pid: process.pid, port, statusPath });
  server.on('close', () => removeServerPid(repoRoot));

  const u = urlFor(host, port);
  if (open) openBrowser(u);
  return { server, port, url: u, host, reused: false, repoRoot, statusPath };
}

// ── CLI ──

function parseArgs(argv) {
  const out = { open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') out.open = false;
    else if (a === '--port') out.port = parseInt(argv[++i], 10);
    else if (a.startsWith('--port=')) out.port = parseInt(a.slice(7), 10);
    else if (a === '--repo-root') out.repoRoot = argv[++i];
    else if (a.startsWith('--repo-root=')) out.repoRoot = a.slice(12);
  }
  return out;
}

async function main(argv) {
  const opts = parseArgs(argv.slice(2));
  try {
    const r = await startServer(opts);
    if (r.reused) {
      process.stdout.write('[mccp:dashboard] reusing running server: ' + r.url + '\n');
    } else {
      process.stdout.write('[mccp:dashboard] serving ' + r.url + ' (pid ' + process.pid + ')\n');
      process.stdout.write('[mccp:dashboard] live-reload on; stop with: kill ' + process.pid + '\n');
    }
    return 0;
  } catch (err) {
    process.stderr.write('[mccp:dashboard] ' + (err && err.message ? err.message : err) + '\n');
    return 1;
  }
}

if (require.main === module) {
  main(process.argv).then((code) => {
    // When a real server is listening, keep the event loop alive (do not exit).
    if (code !== 0) process.exit(code);
  });
}

module.exports = {
  startServer,
  createServer,
  injectReloadScript,
  reloadScript,
  missingStatusHtml,
  buildIdentity,
  readServerPid,
  writeServerPid,
  removeServerPid,
  isReusablePid,
  pidAlive,
  probeIdentity,
  statusHtmlPath,
  pidFilePath,
  DEFAULT_PORT,
  DEFAULT_HOST,
  IDENTITY_ROUTE,
  RELOAD_ROUTE,
  SERVER_TAG,
};
