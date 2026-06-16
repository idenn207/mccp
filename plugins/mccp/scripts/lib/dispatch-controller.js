'use strict';

// dispatch-controller — Stage 2 M1 Task 5.
//
// Pure orchestration helpers that the slash-command body wraps around the
// Agent tool calls. The controller itself never invokes Agent — Agent tool
// calls are only legal in conversation context, not from a lib module.
//
// Architecture (mirror of work-orchestrator.js):
//
//   slash-cmd body
//   ├─ prepareDispatch(...)  ← controller writes placeholder envelopes,
//   │                          builds dispatch metadata + worker prompts
//   ├─ multi-Agent parallel call (slash-cmd body's responsibility)
//   ├─ collect each worker's terminal envelope (via dispatch-watcher +
//   │   worktree-sync OR direct read from envelopeDir)
//   └─ mergeEnvelopes([envelope1, envelope2, ...])
//      ↑ pure aggregator, no fs / no Agent tool
//
// F2 absorption (Implement-Codex R1): the placeholder envelope uses
// worker_exit_status='pending' + worker_ended_at=null. This is the
// schema-valid nonterminal state. Workers transition via
// envelope.markStatus(envelopePath, 'ok'|'failure'|'timeout'|'crashed', opts).
//
// Env propagation: ENV_PROPAGATION_KEYS lists the env vars the worker must
// see verbatim so its receipt-gate decisions match the controller's. Empty
// or absent keys are omitted from the prompt — workers fall back to their
// own defaults.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const envelope = require('./dispatch-envelope');

// v1.2.0-m1 Task 12 (Codex F4 absorption) — heartbeat + reclaimStale.
// Mirrors pr-phase-lock.js host-aware tri-state policy. A live controller
// rewrites the heartbeat mtime in its work loop (caller-side; not in this
// lib because lib code can't run forever). reclaimStale is called by the
// next command (validate-cmd boot) to clean up envelopes whose controller
// is dead or has been silent past `ttlMs` (default 5 min per plan body).
const HEARTBEAT_SUFFIX = '.heartbeat';
const HEARTBEAT_TTL_DEFAULT_MS = 5 * 60 * 1000;

const ENV_PROPAGATION_KEYS = [
  'MCCP_RECEIPT_GATE_MODE',
  'MCCP_ALLOW_CODEX_UNAVAILABLE',
  'MCCP_CODEX_DISABLED',
  'CLAUDE_PLUGIN_ROOT',
];

const DEFAULT_ENVELOPE_REL_DIR = path.join('.claude', 'state', 'dispatches');

function newDispatchId() {
  return crypto.randomUUID();
}

function envSnapshotFor(envObj) {
  const out = {};
  if (!envObj || typeof envObj !== 'object') return out;
  ENV_PROPAGATION_KEYS.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(envObj, k)) {
      const v = envObj[k];
      if (v !== null && v !== undefined && String(v).length > 0) {
        out[k] = String(v);
      }
    }
  });
  return out;
}

function buildWorkerPrompt(args) {
  args = args || {};
  const dispatchId = args.dispatchId;
  const envSnapshot = args.envSnapshot || {};
  const basePrompt = args.basePrompt || '';
  const subagentType = args.workerSubagentType || '(unspecified)';

  const envKeys = Object.keys(envSnapshot);
  const envBlock = envKeys.length === 0
    ? '- (none — worker uses default env)'
    : envKeys.map(function (k) { return '- ' + k + '=' + envSnapshot[k]; }).join('\n');

  return [
    '# mccp dispatch worker',
    '',
    'You are a controller-spawned worker. Identity:',
    '- subagent: ' + subagentType,
    '- dispatch_id: ' + dispatchId,
    '',
    'IPC contract:',
    '- Write your terminal envelope to .claude/state/dispatches/' + dispatchId + '.envelope.json',
    '- worker_exit_status must be one of: ok | failure | timeout | crashed',
    '- worker_ended_at must be ISO8601 (set automatically by envelope.markStatus)',
    '- receipts_added: any receipt slugs you wrote during this dispatch',
    '- findings: any structured findings you want to surface to the controller',
    '',
    'Env vars propagated from controller (honor these — receipt gates match):',
    envBlock,
    '',
    '--- task body ---',
    basePrompt,
  ].join('\n');
}

function placeholderEnvelope(args) {
  return {
    schema_version: 'v1',
    dispatch_id: args.dispatchId,
    worker_subagent_type: args.workerSubagentType,
    worker_started_at: args.startedAt,
    worker_ended_at: null,
    worker_exit_status: 'pending',
    receipts_added: [],
    findings: [],
    next_action: null,
    controller_session_id: args.controllerSessionId,
    parent_cwd: args.parentCwd,
  };
}

function prepareDispatch(args, deps) {
  args = args || {};
  deps = deps || {};
  const workers = args.workers;
  const controllerSessionId = args.controllerSessionId;
  const parentCwd = args.parentCwd || process.cwd();
  const envelopeDir = args.envelopeDir
    || path.join(parentCwd, DEFAULT_ENVELOPE_REL_DIR);
  const envInput = args.env || process.env;

  const idGen = deps.idGen || newDispatchId;
  const nowIso = deps.nowIso || function () { return new Date().toISOString(); };
  const writeImpl = deps.envelopeWrite || envelope.write;

  if (!Array.isArray(workers) || workers.length === 0) {
    throw new TypeError('workers must be a non-empty array');
  }
  if (typeof controllerSessionId !== 'string' || !envelope.UUID_RE.test(controllerSessionId)) {
    throw new TypeError('controllerSessionId must be a UUID string');
  }

  const envSnap = envSnapshotFor(envInput);
  const startedAt = nowIso();
  // v1.2.0-m1 Task 12 — controller-level ownership token shared across all
  // dispatches in this prepare call. Each worker's heartbeat references
  // the same token (and controller_pid + controller_host) so reclaimStale
  // can fail liveness checks atomically when the controller dies.
  const ownershipToken = (deps.ownershipToken || crypto.randomUUID());

  const dispatches = workers.map(function (w, i) {
    if (!w || typeof w !== 'object') {
      throw new TypeError('workers[' + i + '] must be an object');
    }
    if (typeof w.subagentType !== 'string' || w.subagentType.length === 0) {
      throw new TypeError('workers[' + i + '].subagentType must be a non-empty string');
    }
    if (typeof w.prompt !== 'string') {
      throw new TypeError('workers[' + i + '].prompt must be a string');
    }
    const dispatchId = idGen();
    if (!envelope.UUID_RE.test(dispatchId)) {
      throw new Error('idGen returned non-UUID: ' + dispatchId);
    }
    const ph = placeholderEnvelope({
      dispatchId: dispatchId,
      workerSubagentType: w.subagentType,
      controllerSessionId: controllerSessionId,
      parentCwd: parentCwd,
      startedAt: startedAt,
    });
    const envelopePath = path.join(envelopeDir, dispatchId + '.envelope.json');
    const writeResult = writeImpl(envelopePath, ph);
    if (!writeResult.ok) {
      throw new Error('placeholder write failed for ' + dispatchId + ': ' + writeResult.error);
    }
    // v1.2.0-m1 Task 12 — heartbeat per dispatch, sharing the controller's
    // pid + ownership token. reclaimStale uses the heartbeat's mtime + body
    // to decide whether the worker is still under a live controller.
    let heartbeatPath = null;
    if (args.skipHeartbeat !== true) {
      const hb = writeHeartbeat(envelopePath, {
        ownershipToken: ownershipToken,
        pid: deps.pid || process.pid,
        host: deps.host || os.hostname(),
        nowIso: function () { return startedAt; },
      });
      heartbeatPath = hb.heartbeatPath;
    }
    const prompt = buildWorkerPrompt({
      workerSubagentType: w.subagentType,
      dispatchId: dispatchId,
      envSnapshot: envSnap,
      basePrompt: w.prompt,
    });
    return {
      dispatchId: dispatchId,
      subagentType: w.subagentType,
      envelopePath: envelopePath,
      heartbeatPath: heartbeatPath,
      prompt: prompt,
    };
  });

  return {
    dispatches: dispatches,
    envelopeDir: envelopeDir,
    envSnapshot: envSnap,
    controllerSessionId: controllerSessionId,
    startedAt: startedAt,
    ownershipToken: ownershipToken,
  };
}

function mergeEnvelopes(envelopes) {
  if (!Array.isArray(envelopes)) {
    throw new TypeError('envelopes must be an array');
  }
  const receiptsAdded = [];
  const findings = [];
  const failedWorkers = [];

  envelopes.forEach(function (env, i) {
    if (env === null || typeof env !== 'object' || Array.isArray(env)) {
      failedWorkers.push({ index: i, reason: 'envelope-not-object' });
      return;
    }
    const status = env.worker_exit_status;
    if (status === 'pending') {
      failedWorkers.push({
        index: i,
        dispatchId: env.dispatch_id,
        reason: 'envelope-still-pending',
      });
    } else if (status !== 'ok') {
      failedWorkers.push({
        index: i,
        dispatchId: env.dispatch_id,
        status: status,
        reason: 'worker-non-ok-exit',
      });
    }
    if (Array.isArray(env.receipts_added)) {
      env.receipts_added.forEach(function (slug) {
        if (typeof slug === 'string' && slug.length > 0
            && receiptsAdded.indexOf(slug) === -1) {
          receiptsAdded.push(slug);
        }
      });
    }
    if (Array.isArray(env.findings)) {
      env.findings.forEach(function (f) {
        if (f && typeof f === 'object' && !Array.isArray(f)) {
          findings.push(Object.assign({ source_dispatch_id: env.dispatch_id }, f));
        }
      });
    }
  });

  return {
    receiptsAdded: receiptsAdded,
    findings: findings,
    failedWorkers: failedWorkers,
  };
}

// v1.2.0-m1 Task 12 — heartbeat helpers (caller-driven lifecycle).
//
// Schema:
//   {
//     controller_pid: <int>,        // process.pid at write time
//     controller_host: <string>,    // os.hostname() at write time
//     started_at: <ISO8601>,        // first writeHeartbeat call
//     ownership_token_hash: <sha256:hex>,  // sha256(crypto.randomUUID())
//     last_heartbeat_at: <ISO8601>, // most-recent refresh
//   }
// mtime of the file is the canonical liveness anchor (cheaper than reading
// body each scan); body is supplementary audit data.

function heartbeatPathFor(envelopePath) {
  if (typeof envelopePath !== 'string' || envelopePath.length === 0) {
    throw new TypeError('envelopePath must be a non-empty string');
  }
  // .envelope.json → .heartbeat (same dir, same UUID stem)
  return envelopePath.replace(/\.envelope\.json$/, HEARTBEAT_SUFFIX);
}

function writeHeartbeat(envelopePath, opts) {
  opts = opts || {};
  const heartbeatPath = heartbeatPathFor(envelopePath);
  const dir = path.dirname(heartbeatPath);
  fs.mkdirSync(dir, { recursive: true });
  const nowIso = (opts.nowIso || function () { return new Date().toISOString(); })();
  const token = opts.ownershipToken || crypto.randomUUID();
  const tokenHash = 'sha256:' +
    crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  const body = {
    controller_pid: opts.pid || process.pid,
    controller_host: opts.host || os.hostname(),
    started_at: nowIso,
    ownership_token_hash: tokenHash,
    last_heartbeat_at: nowIso,
  };
  fs.writeFileSync(heartbeatPath, JSON.stringify(body, null, 2) + '\n', 'utf8');
  return { heartbeatPath: heartbeatPath, ownershipToken: token, body: body };
}

function refreshHeartbeat(envelopePath, opts) {
  opts = opts || {};
  const heartbeatPath = heartbeatPathFor(envelopePath);
  const now = opts.now || new Date();
  // utimesSync bumps mtime (the canonical liveness signal). We also rewrite
  // the body's last_heartbeat_at so on-disk audit matches mtime — but only
  // if the file still exists. If a reclaim already deleted it, refresh is
  // a loud no-op (caller can detect via return false).
  if (!fs.existsSync(heartbeatPath)) return { ok: false, reason: 'heartbeat-missing' };
  try {
    const raw = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
    raw.last_heartbeat_at = now.toISOString();
    fs.writeFileSync(heartbeatPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  } catch (_) {
    // Body got corrupted — fall through to mtime-only refresh.
  }
  fs.utimesSync(heartbeatPath, now, now);
  return { ok: true, heartbeatPath: heartbeatPath };
}

function pidIsAlive(pid, deps) {
  deps = deps || {};
  if (deps.pidIsAlive) return deps.pidIsAlive(pid);
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM'; // EPERM means process exists but no signal perm
  }
}

// reclaimStale scans `envelopeDir` for `*.heartbeat` files and applies the
// host-aware tri-state policy:
//   same-host + pid alive  → NEVER reclaim (controller is working)
//   same-host + pid dead   → reclaim (orphan)
//   cross-host             → mtime-only (foreign PID is meaningless)
//   unparseable body       → mtime-only
//
// On reclaim: the corresponding envelope file is rewritten with
// worker_exit_status='crashed' + worker_ended_at=now, and the heartbeat is
// unlinked. The caller (validate-cmd boot or hook) is responsible for
// emitting the STATE.md dispatch_chain_aborted event — see plan body Task
// 12 Action #2.
function reclaimStale(args, deps) {
  args = args || {};
  deps = deps || {};
  const envelopeDir = args.envelopeDir;
  const ttlMs = typeof args.ttlMs === 'number' ? args.ttlMs : HEARTBEAT_TTL_DEFAULT_MS;
  if (typeof envelopeDir !== 'string' || envelopeDir.length === 0) {
    throw new TypeError('envelopeDir must be a non-empty string');
  }
  const nowMs = deps.nowMs ? deps.nowMs() : Date.now();
  const myHost = deps.host || os.hostname();
  const reclaimed = [];
  const skipped = [];

  let entries;
  try {
    entries = fs.readdirSync(envelopeDir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return { reclaimed: reclaimed, skipped: skipped };
    throw err;
  }

  entries.filter(function (e) { return e.endsWith(HEARTBEAT_SUFFIX); }).forEach(function (basename) {
    const heartbeatPath = path.join(envelopeDir, basename);
    let body = null;
    try { body = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8')); } catch (_) { body = null; }
    let stat;
    try { stat = fs.statSync(heartbeatPath); } catch (_) { return; }
    const mtimeMs = stat.mtimeMs;
    const ageMs = nowMs - mtimeMs;

    const sameHost = body && body.controller_host === myHost;
    const pid = body && body.controller_pid;
    let staleReason = null;

    if (sameHost) {
      if (!pidIsAlive(pid, deps)) {
        staleReason = 'pid-dead';
      }
    } else {
      // cross-host OR unparseable body — mtime-only policy.
      if (ageMs > ttlMs) {
        staleReason = body ? 'cross-host-mtime-expired' : 'unparseable-mtime-expired';
      }
    }

    // Additional same-host TTL safety net: even if pid appears alive, a stale
    // mtime beyond TTL is a sign the heartbeat loop died. Be conservative —
    // only reclaim if mtime is significantly past TTL (3x default 5min = 15min).
    if (!staleReason && sameHost && ageMs > ttlMs * 3) {
      staleReason = 'same-host-mtime-far-expired';
    }

    if (!staleReason) {
      skipped.push({
        heartbeatPath: heartbeatPath,
        reason: sameHost ? 'pid-alive' : 'cross-host-fresh',
        ageMs: ageMs,
      });
      return;
    }

    // Reclaim: overwrite envelope as crashed, unlink heartbeat. Envelope
    // path derives from heartbeat path (same UUID stem).
    const envelopePath = heartbeatPath.replace(/\.heartbeat$/, '.envelope.json');
    let envelopeBefore = null;
    try {
      const r = envelope.read(envelopePath);
      envelopeBefore = r.ok ? r.envelope : null;
    } catch (_) {}
    const crashed = envelopeBefore
      ? Object.assign({}, envelopeBefore, {
          worker_exit_status: 'crashed',
          worker_ended_at: new Date(nowMs).toISOString(),
        })
      : null;
    let envelopeWriteOk = false;
    if (crashed) {
      const writeResult = envelope.write(envelopePath, crashed);
      envelopeWriteOk = writeResult.ok;
    }
    try { fs.unlinkSync(heartbeatPath); } catch (_) {}
    reclaimed.push({
      heartbeatPath: heartbeatPath,
      envelopePath: envelopePath,
      reason: staleReason,
      ageMs: ageMs,
      envelopeRewritten: envelopeWriteOk,
      dispatchId: body && body.controller_pid !== undefined
        ? path.basename(heartbeatPath, HEARTBEAT_SUFFIX) : null,
    });
  });

  return { reclaimed: reclaimed, skipped: skipped };
}

module.exports = {
  ENV_PROPAGATION_KEYS: ENV_PROPAGATION_KEYS,
  DEFAULT_ENVELOPE_REL_DIR: DEFAULT_ENVELOPE_REL_DIR,
  HEARTBEAT_SUFFIX: HEARTBEAT_SUFFIX,
  HEARTBEAT_TTL_DEFAULT_MS: HEARTBEAT_TTL_DEFAULT_MS,
  newDispatchId: newDispatchId,
  envSnapshotFor: envSnapshotFor,
  buildWorkerPrompt: buildWorkerPrompt,
  placeholderEnvelope: placeholderEnvelope,
  prepareDispatch: prepareDispatch,
  mergeEnvelopes: mergeEnvelopes,
  heartbeatPathFor: heartbeatPathFor,
  writeHeartbeat: writeHeartbeat,
  refreshHeartbeat: refreshHeartbeat,
  reclaimStale: reclaimStale,
  pidIsAlive: pidIsAlive,
};
