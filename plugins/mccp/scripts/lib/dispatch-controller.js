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
const path = require('path');

const envelope = require('./dispatch-envelope');

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
      prompt: prompt,
    };
  });

  return {
    dispatches: dispatches,
    envelopeDir: envelopeDir,
    envSnapshot: envSnap,
    controllerSessionId: controllerSessionId,
    startedAt: startedAt,
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

module.exports = {
  ENV_PROPAGATION_KEYS: ENV_PROPAGATION_KEYS,
  DEFAULT_ENVELOPE_REL_DIR: DEFAULT_ENVELOPE_REL_DIR,
  newDispatchId: newDispatchId,
  envSnapshotFor: envSnapshotFor,
  buildWorkerPrompt: buildWorkerPrompt,
  placeholderEnvelope: placeholderEnvelope,
  prepareDispatch: prepareDispatch,
  mergeEnvelopes: mergeEnvelopes,
};
