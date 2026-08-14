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
const crypto = require('crypto');
const { spawn } = require('child_process');

const DEFAULT_PORT = 7333;
const DEFAULT_HOST = '127.0.0.1';
const PID_FILENAME = '.dashboard-server.pid';
const RELOAD_ROUTE = '/__mccp_reload';
const IDENTITY_ROUTE = '/__mccp_identity';
const SERVER_TAG = 'mccp-dashboard';
const WATCH_DEBOUNCE_MS = 200;

// dashboard-interactivity M4 — write-mode (`--write`) obsolete-resolve surface.
// The POST route exists ONLY while a `--write` server is alive (P1 — the default
// server has NO mutation surface). Security is fail-closed by construction:
// loopback Host gate (F1 DNS-rebinding) + configured-origin Origin/Referer check
// (F1) + per-process nonce + opaque id re-enumerate (no browser-supplied path) +
// .claude/**/*.md containment + apply.js CAS/lock (P5 fail-closed).
const RESOLVE_ROUTE = '/__mccp_resolve';
const NONCE_HEADER = 'x-mccp-nonce';
const RESOLVE_BODY_CAP = 8 * 1024; // 8 KiB — {id, reason} is tiny; cap a flood.
// Loopback hostnames allowed in write-mode Host header (F1). A DNS-rebind sends
// the attacker hostname (evil.com) as Host even after rebinding to 127.0.0.1.
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

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
    // M4 F2 — mode bit. A default request must NOT reuse a writer (would expose
    // write routes under a read-only expectation); a --write request must NOT
    // reuse a read-only server (route would be missing).
    writeEnabled: !!info.write,
  };
  const dir = cacheDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  // CSPRNG nonce: a guessable tmp path defeats the reason the suffix exists.
  const tmp = pidFilePath(repoRoot) + '.' + process.pid + '-' + crypto.randomUUID() + '.tmp';
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

// 4중 AND + mode: same-host AND live PID AND repoRoot match AND statusPath match
// AND write-mode match (M4 F2). `write` defaults to false (read-only request) so
// existing 3-arg callers keep their semantics.
function isReusablePid(pidObj, repoRoot, statusPath, write) {
  if (!pidObj) return false;
  if (pidObj.host !== os.hostname()) return false;
  if (!pidAlive(pidObj.pid)) return false;
  if (path.resolve(pidObj.repoRoot || '') !== path.resolve(repoRoot)) return false;
  const want = path.resolve(statusPath || statusHtmlPath(repoRoot));
  if (path.resolve(pidObj.statusPath || '') !== want) return false;
  if (!!pidObj.writeEnabled !== !!write) return false;
  return true;
}

function removeServerPid(repoRoot) {
  try { fs.unlinkSync(pidFilePath(repoRoot)); } catch (_) { /* already gone */ }
}

// ── session-process-reclaim M1 — registry wiring ──────────────────────────
//
// This server is the process the PRD's problem statement is about: it holds the
// port open after the session that started it is gone. `lifetime` is
// 'outlives-session' so it is NOT reclaimed by default — UI7 (should a dashboard
// outlive its session?) is an open PRODUCT question, and the default preserves
// today's behavior. `MCCP_RECLAIM_OUTLIVES=1` is the operator's opt-in.
//
// Registering must never be able to stop the server from booting.

// The require is INSIDE the try, not at module scope. At module scope a load
// failure anywhere in the reclaim stack would abort dashboard startup before
// this wrapper could catch anything — which would contradict, in the loader,
// the very sentence above it. Lazy keeps the claim true.
function registerServerProcess(repoRoot, opts) {
  try {
    return require('./session-processes').register(repoRoot, opts);
  } catch (err) {
    process.stderr.write('[mccp:dashboard] session-process register skipped: '
      + (err && err.message) + '\n');
    return { ok: false, reason: 'threw' };
  }
}

// A reuse record lives in OUR session dir and points at a pid we do NOT own
// (§D7). It exists so the owning session's SessionEnd can see the server is
// still in use and leave it alone. We never touch the owner's record, so there
// is no shared state and no lock.
function registerServerReuse(repoRoot, pid) {
  if (!Number.isInteger(pid) || pid <= 0) return { ok: false, reason: 'no_pid' };
  return registerServerProcess(repoRoot, {
    kind: 'dashboard-server',
    lifetime: 'outlives-session',
    role: 'reuse',
    pid: pid,
    execPath: __filename,
    // We did not start this process, so our own uptime says nothing about it.
    // Reuse records are never identity-verified (isReclaimableBy stops them at
    // `reuse_not_owner`), and if that ever changed a registration-time stamp
    // fails CLOSED rather than authorizing a kill.
    procStartedAtMs: Date.now(),
  });
}

function unregisterServerProcess(repoRoot, pid) {
  try {
    const sid = require('../receipt/evidence-lock').resolveSessionId(process.env);
    if (sid) require('./session-processes').unregister(repoRoot, sid, pid);
  } catch (_) { /* best-effort — teardown must not throw */ }
}

// The reuse record is the ONLY thing that tells the owning session "someone else
// is still using this server". If writing it fails we are not merely missing
// bookkeeping — the owner's `in_use_by_live_session` guard has nothing to fire
// on, and under MCCP_RECLAIM_OUTLIVES=1 it will SIGTERM a server this session is
// actively using. We cannot repair that from here (the owner is another
// process), so the honest move is to say exactly that, loudly, at the moment the
// guard goes missing. Discarding this result was the defect.
function announceReuseRegistration(result, pid) {
  if (result && result.ok) return result;
  process.stderr.write('[mccp:dashboard] reuse record NOT written for pid ' + pid
    + ' (reason=' + ((result && result.reason) || 'unknown') + '). '
    + 'The owning session cannot see that this session is using its dashboard; '
    + 'if that session ends with MCCP_RECLAIM_OUTLIVES=1 the server may be '
    + 'terminated while still in use. Restart the dashboard from this session to '
    + 'own it outright.\n');
  return result;
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

function buildIdentity(repoRoot, statusPath, write) {
  return {
    server: SERVER_TAG,
    repoRoot: path.resolve(repoRoot),
    statusPath: path.resolve(statusPath || statusHtmlPath(repoRoot)),
    // M4 F2 — identity probe surfaces the mode so reuse can require a match.
    writeEnabled: !!write,
  };
}

// ── write-mode (M4) — serve-time client injection + nonce config ─────────────
// resolve-action.js is a browser IIFE (mirrors client/explore.js inline pattern)
// read at serve time. It is injected ONLY for a --write server's `/` response —
// the cache `status.html` stays byte-pristine and a non-write serve never sees
// the script or the nonce.

function resolveActionScript() {
  try {
    return fs.readFileSync(path.join(__dirname, 'renderer', 'client', 'resolve-action.js'), 'utf8');
  } catch (_) { return ''; }
}

function writeConfigScript(nonce) {
  return '<script>window.__MCCP_RESOLVE_NONCE=' + JSON.stringify(String(nonce || ''))
    + ';window.__MCCP_RESOLVE_PATH=' + JSON.stringify(RESOLVE_ROUTE)
    + ';window.__MCCP_NONCE_HEADER=' + JSON.stringify(NONCE_HEADER) + ';</script>';
}

function injectWriteScript(html, nonce) {
  const script = resolveActionScript();
  if (!script) return html; // fail-open: no client script → no write affordance.
  const snippet = '\n' + writeConfigScript(nonce) + '\n<script>' + script + '</script>\n';
  const idx = html.lastIndexOf('</body>');
  if (idx === -1) return html + snippet;
  return html.slice(0, idx) + snippet + html.slice(idx);
}

// ── write-mode (M4) — security primitives (fail-closed) ──────────────────────

// "host[:port]" / "[::1]:port" → { hostname, port }. IPv6 bracket-aware.
function splitHostPort(hostHeader) {
  const h = String(hostHeader || '');
  if (h.charAt(0) === '[') {
    const end = h.indexOf(']');
    if (end === -1) return { hostname: h.toLowerCase(), port: null };
    const hostname = h.slice(1, end).toLowerCase();
    const rest = h.slice(end + 1);
    const port = rest.charAt(0) === ':' ? rest.slice(1) : null;
    return { hostname, port };
  }
  const idx = h.lastIndexOf(':');
  if (idx === -1) return { hostname: h.toLowerCase(), port: null };
  return { hostname: h.slice(0, idx).toLowerCase(), port: h.slice(idx + 1) };
}

// F1 — DNS-rebinding gate. Host MUST be a loopback hostname AND (if a port is
// present) the server's actual bound port. A rebind keeps the attacker hostname
// in Host, so a non-loopback Host is rejected before serving (so the page — and
// the injected nonce — never reaches the attacker page).
function isLoopbackHost(hostHeader, serverPort) {
  if (!hostHeader) return false; // HTTP/1.1 requires Host; absent → reject.
  const { hostname, port } = splitHostPort(hostHeader);
  if (!LOOPBACK_HOSTNAMES.has(hostname)) return false;
  if (port != null && serverPort != null && String(port) !== String(serverPort)) return false;
  return true;
}

// F1 — allowed Origin set is SERVER-derived (loopback hostnames × bound port),
// never req.headers.host (a rebind would forge both Host and Origin to match).
function allowedOriginSet(serverPort) {
  const set = new Set();
  const suffix = serverPort != null ? ':' + serverPort : '';
  set.add('http://127.0.0.1' + suffix);
  set.add('http://localhost' + suffix);
  set.add('http://[::1]' + suffix);
  return set;
}

function originAllowed(req, serverPort) {
  const allowed = allowedOriginSet(serverPort);
  const origin = req.headers && req.headers.origin;
  if (origin) return allowed.has(origin);
  // Some same-origin requests omit Origin → fall back to Referer's origin.
  const ref = req.headers && (req.headers.referer || req.headers.referrer);
  if (ref) {
    try { return allowed.has(new URL(ref).origin); } catch (_) { return false; }
  }
  return false; // neither present → reject (strict; CSRF cannot omit both).
}

// reason strict — non-empty AND ≥2 whitespace-separated tokens (1-token reject).
function isValidReason(reason) {
  if (typeof reason !== 'string') return false;
  const t = reason.trim();
  if (!t) return false;
  return t.split(/\s+/).filter(Boolean).length >= 2;
}

// containment — server-derived ref.source must resolve under <repoRoot>/.claude
// and end in `.md`. Defense-in-depth even though enumerate only yields .claude
// sources (the opaque-id path means a posted id can't supply an arbitrary path,
// but a future enumerate extension must not silently widen the write surface).
function isContained(repoRoot, source) {
  if (typeof source !== 'string' || !source) return false;
  if (!/\.md$/i.test(source)) return false;
  const claudeDir = path.resolve(repoRoot, '.claude');
  const abs = path.resolve(repoRoot, source);
  return abs !== claudeDir && abs.startsWith(claudeDir + path.sep);
}

function readBody(req, cap, cb) {
  let size = 0;
  let done = false;
  const chunks = [];
  const finish = (err, data) => { if (done) return; done = true; cb(err, data); };
  req.on('data', (c) => {
    if (done) return;
    size += c.length;
    if (size > cap) { finish(Object.assign(new Error('body too large'), { tooLarge: true })); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
  req.on('error', (e) => finish(e));
}

function getServerPort(server) {
  try { const a = server.address(); return a && typeof a === 'object' ? a.port : null; }
  catch (_) { return null; }
}

// F3 — strict apply-result interpretation. apply() does NOT throw; it returns a
// summary. Only exactly-one-applied with zero error/abort/skip is success. A
// no-exception summary carrying skipped/aborted/errors (TOCTOU text-mismatch,
// lock-abort, CAS-mismatch) is NOT a false success.
function isApplySuccess(summary) {
  return !!summary
    && Array.isArray(summary.applied) && summary.applied.length === 1
    && (summary.errors || []).length === 0
    && (summary.aborted || []).length === 0
    && (summary.skipped || []).length === 0;
}

// Task 6 (F4) — single render-after-write path. debounce OFF so the just-applied
// marker isn't swallowed by triggerRender's 5s content debounce; then verify the
// cache advanced before claiming success (an invisible durable write would let
// the user retry a write that already landed).
function renderAfterWrite(repoRoot, statusPath) {
  const { triggerRender } = require('./renderer/trigger');
  let before = -1;
  try { before = fs.statSync(statusPath).mtimeMs; } catch (_) { /* missing → -1 */ }
  const ok = triggerRender('resolve-write', { repoRoot, debounceMs: 0 });
  if (!ok) return false; // lock contention / render failure → "written, render-pending".
  let after = -1;
  try { after = fs.statSync(statusPath).mtimeMs; } catch (_) { /* missing → -1 */ }
  return after > 0 && after >= before;
}

// POST /__mccp_resolve handler — Task 4 validation chain (fail-closed). Host gate
// (F1) is applied by the caller before this runs. Order: Origin → nonce → body →
// {id,reason} → re-enumerate id→ref → containment → apply → strict result (F3).
function handleResolve(req, res, ctx) {
  const repoRoot = ctx.repoRoot;
  const nonce = ctx.nonce;
  const statusPath = ctx.statusPath;
  const serverPort = getServerPort(ctx.server);
  const reject = (code, msg, extra) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(Object.assign({ ok: false, error: msg }, extra || {})));
  };

  // (3) Origin/Referer vs configured origin (NOT req.host).
  if (!originAllowed(req, serverPort)) return reject(403, 'origin not allowed');
  // (4) nonce.
  const got = req.headers[NONCE_HEADER];
  if (!nonce || !got || got !== nonce) return reject(403, 'nonce mismatch');

  // (5) body cap + JSON parse.
  readBody(req, RESOLVE_BODY_CAP, (err, raw) => {
    if (err) return reject(err.tooLarge ? 413 : 400, err.tooLarge ? 'body too large' : 'body read error');
    let body;
    try { body = JSON.parse(raw); } catch (_) { return reject(400, 'invalid json'); }

    // (6) {id, reason} strict.
    const id = body && typeof body.id === 'string' ? body.id.trim() : '';
    const reason = body && typeof body.reason === 'string' ? body.reason : '';
    if (!/^[0-9a-f]{16}$/.test(id)) return reject(400, 'invalid id');
    if (!isValidReason(reason)) return reject(400, 'reason required (>= 2 words)');

    // (7) re-enumerate → id → SERVER-DERIVED ref (browser path never trusted).
    let matched = null;
    try {
      const { enumerate } = require('./stale-audit/enumerate');
      const { computeItemId } = require('./stale-audit/item-id');
      const { items } = enumerate({ repoRoot });
      for (const ref of items) {
        if (ref.kind !== 'risk' && ref.kind !== 'oq') continue;
        if (computeItemId(ref) === id) { matched = ref; break; }
      }
    } catch (_) { return reject(500, 'enumerate failed'); }
    if (!matched) return reject(409, 'stale or unknown id', { stale: true });

    // (8) containment — .claude/**/*.md.
    if (!isContained(repoRoot, matched.source)) return reject(403, 'containment violation');

    // (9) apply (fail-closed — CAS/lock in apply.js; throws caught here).
    let summary;
    try {
      const { apply } = require('./stale-audit/apply');
      summary = apply({ refs: [Object.assign({}, matched, { reason })], repoRoot });
    } catch (_) { return reject(500, 'apply error'); }

    // F3 — strict result. A no-exception summary with skipped/aborted/errors is
    // NOT success (TOCTOU text-mismatch / lock-abort must not read as success).
    if (!isApplySuccess(summary)) {
      // Source unchanged by apply's own guards. Tell the client to reload (the
      // server state may have drifted) — fail-closed, no false success.
      return reject(409, 'not applied (stale/conflict)', { stale: true });
    }

    // Task 6 — render so the marker collapses; report render state honestly.
    let rendered = false;
    try { rendered = renderAfterWrite(repoRoot, statusPath); } catch (_) { rendered = false; }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, rendered: rendered, id: id }));
  });
}

// ── HTTP server (fixed routes only — no req.url→file mapping → no traversal) ──

function createServer(opts) {
  const repoRoot = path.resolve(opts.repoRoot);
  const statusPath = path.resolve(opts.statusPath || statusHtmlPath(repoRoot));
  // Set of live SSE response objects. Shared so startServer can push reloads.
  const clients = opts.clients || new Set();
  // M4 — write-mode toggle. POST route + nonce + serve-time injection are gated
  // on this. A default server (write=false) has NO mutation surface at all.
  const write = !!opts.write;
  const nonce = write ? (opts.nonce || null) : null;

  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const method = (req.method || 'GET').toUpperCase();

    // M4 F1 — write-mode DNS-rebinding gate. Applies to EVERY request (incl.
    // GET / which would otherwise serve the injected nonce to a rebind page).
    // Non-write serving is read-only (no secret, no mutation) → unchanged.
    if (write && !isLoopbackHost(req.headers.host, getServerPort(server))) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('forbidden: non-loopback Host');
      return;
    }

    // M4 — POST resolve route exists ONLY in write-mode. A default server never
    // registers it (falls through to 404), so the mutation surface is absent.
    if (write && method === 'POST' && url === RESOLVE_ROUTE) {
      handleResolve(req, res, { repoRoot: repoRoot, nonce: nonce, statusPath: statusPath, server: server });
      return;
    }

    if (url === IDENTITY_ROUTE) {
      const body = JSON.stringify(buildIdentity(repoRoot, statusPath, write));
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
      // M4 — write affordance injected at serve time only (cache stays pristine).
      if (write) html = injectWriteScript(html, nonce);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });

  server._mccpClients = clients;
  server._mccpStatusPath = statusPath;
  server._mccpWrite = write;
  server._mccpNonce = nonce;
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
  // M4 — write-mode. Per-process nonce minted once (write-mode only); the raw
  // nonce only ever travels to the loopback browser via the served `/` HTML.
  const write = !!opts.write;
  const nonce = write ? (opts.nonce || crypto.randomBytes(24).toString('hex')) : null;

  // 1. Reuse-our-server check via PID file (Codex F1) + mode match (M4 F2).
  const existing = readServerPid(repoRoot);
  if (isReusablePid(existing, repoRoot, statusPath, write)) {
    const ident = await probeIdentity(host, existing.port, 800);
    if (ident && ident.server === SERVER_TAG
        && path.resolve(ident.repoRoot) === repoRoot
        && path.resolve(ident.statusPath) === statusPath
        && !!ident.writeEnabled === write) {
      const u = urlFor(host, existing.port);
      announceReuseRegistration(registerServerReuse(repoRoot, existing.pid), existing.pid);
      if (open) openBrowser(u);
      return { server: null, port: existing.port, url: u, host, reused: true, repoRoot, statusPath, writeEnabled: write };
    }
    // PID file claimed reuse but no live/mode identity match → stale; clear it.
    removeServerPid(repoRoot);
  }

  // 2. Bind. On EADDRINUSE, distinguish our-server (reuse) vs foreign/mode-
  //    mismatch (reject loudly). M4 F2 — a read-only server must NOT be reused
  //    by a --write request (route missing) and a writer must NOT be reused by a
  //    default request (read-only invariant violation); both yield a loud error.
  const server = createServer({ repoRoot, statusPath, write, nonce });

  const bound = await new Promise((resolve, reject) => {
    const onError = async (err) => {
      if (err && err.code === 'EADDRINUSE') {
        const ident = await probeIdentity(host, port, 800);
        if (ident && ident.server === SERVER_TAG && path.resolve(ident.repoRoot) === repoRoot) {
          if (!!ident.writeEnabled === write) {
            resolve({ reused: true });
            return;
          }
          reject(Object.assign(new Error(
            'port ' + port + ' is in use by a ' + (ident.writeEnabled ? 'write' : 'read-only')
            + '-mode dashboard server for this repo, but a ' + (write ? 'write' : 'read-only')
            + '-mode server was requested. Stop the other server or use --port <n>.'),
            { code: 'EADDRINUSE_MODE_MISMATCH' }));
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
    // Re-read: `existing` above may have been null or cleared as stale, while
    // the EADDRINUSE identity probe just proved a live server for this repo.
    const owner = readServerPid(repoRoot);
    const ownerPid = owner && owner.pid;
    announceReuseRegistration(registerServerReuse(repoRoot, ownerPid), ownerPid);
    if (open) openBrowser(u);
    return { server: null, port, url: u, host, reused: true, repoRoot, statusPath, writeEnabled: write };
  }

  attachWatch(server);
  writeServerPid(repoRoot, { pid: process.pid, port, statusPath, write });
  registerServerProcess(repoRoot, {
    kind: 'dashboard-server',
    lifetime: 'outlives-session',
    role: 'owner',
    pid: process.pid,
    execPath: __filename,
  });
  server.on('close', () => {
    removeServerPid(repoRoot);
    unregisterServerProcess(repoRoot, process.pid);
  });

  const u = urlFor(host, port);
  if (open) openBrowser(u);
  return { server, port, url: u, host, reused: false, repoRoot, statusPath, writeEnabled: write };
}

// ── CLI ──

function parseArgs(argv) {
  const out = { open: true, write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-open') out.open = false;
    else if (a === '--write') out.write = true; // M4 — enable the obsolete-resolve POST surface.
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
    const modeNote = r.writeEnabled ? ' [write-mode: obsolete-resolve enabled]' : '';
    if (r.reused) {
      process.stdout.write('[mccp:dashboard] reusing running server: ' + r.url + modeNote + '\n');
    } else {
      process.stdout.write('[mccp:dashboard] serving ' + r.url + ' (pid ' + process.pid + ')' + modeNote + '\n');
      process.stdout.write('[mccp:dashboard] live-reload on; stop with: kill ' + process.pid + '\n');
      if (r.writeEnabled) {
        process.stdout.write('[mccp:dashboard] write-mode active — "제외" buttons can mark risks/questions obsolete (reversible). Stop this server to return to read-only.\n');
      }
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
  // M4 — write-mode surface (exported for tests).
  RESOLVE_ROUTE,
  NONCE_HEADER,
  injectWriteScript,
  resolveActionScript,
  isLoopbackHost,
  splitHostPort,
  allowedOriginSet,
  originAllowed,
  isValidReason,
  isContained,
  isApplySuccess,
  renderAfterWrite,
};
