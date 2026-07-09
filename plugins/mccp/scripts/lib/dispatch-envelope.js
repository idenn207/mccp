'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 'v1';

const WORKER_EXIT_STATUSES = ['pending', 'ok', 'failure', 'timeout', 'crashed'];

const TERMINAL_STATUSES = ['ok', 'failure', 'timeout', 'crashed'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

// v1.3.0-m0 Task 4a (Codex Plan-Codex R1 F3 absorption) — strict top-level
// key allowlist. Mirrors JSON_SCHEMA.additionalProperties:false so the hand
// validate() and the exported JSON Schema do not disagree. Adding a new key
// requires updating BOTH this set AND JSON_SCHEMA.properties AND landing
// docs/v1.x.y-orchestrator/envelope-schema-v2.md (schema bump path).
const KNOWN_KEYS = Object.freeze(new Set([
  'schema_version',
  'dispatch_id',
  'worker_subagent_type',
  'worker_started_at',
  'worker_ended_at',
  'worker_exit_status',
  'receipts_added',
  'findings',
  'next_action',
  'controller_session_id',
  'parent_cwd',
]));

const JSON_SCHEMA = Object.freeze({
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://my-claude-code-plugin/schemas/v1.2.0-dispatch-envelope.json',
  title: 'Dispatch Envelope',
  description:
    'IPC payload between a controller-spawned worker (Agent tool) and its parent ' +
    'controller. Lives at .claude/state/dispatches/<dispatch-id>.envelope.json ' +
    'in the parent cwd after worker termination. See ' +
    'docs/v1.2.0-orchestrator/envelope-schema.md for transition matrix.',
  type: 'object',
  required: [
    'schema_version',
    'dispatch_id',
    'worker_subagent_type',
    'worker_started_at',
    'worker_exit_status',
    'receipts_added',
    'findings',
    'controller_session_id',
    'parent_cwd',
  ],
  additionalProperties: false,
  properties: {
    schema_version: { const: SCHEMA_VERSION },
    dispatch_id: { type: 'string', pattern: UUID_RE.source },
    worker_subagent_type: { type: 'string', minLength: 1 },
    worker_started_at: { type: 'string', pattern: ISO8601_RE.source },
    worker_ended_at: {
      oneOf: [
        { type: 'string', pattern: ISO8601_RE.source },
        { type: 'null' },
      ],
    },
    worker_exit_status: { enum: WORKER_EXIT_STATUSES.slice() },
    receipts_added: { type: 'array', items: { type: 'string', minLength: 1 } },
    findings: { type: 'array', items: { type: 'object' } },
    next_action: {
      oneOf: [
        { type: 'string', minLength: 1 },
        { type: 'null' },
      ],
    },
    controller_session_id: { type: 'string', pattern: UUID_RE.source },
    parent_cwd: { type: 'string', minLength: 1 },
  },
  allOf: [
    {
      if: { properties: { worker_exit_status: { const: 'pending' } } },
      then: { properties: { worker_ended_at: { type: 'null' } } },
    },
    {
      if: {
        properties: {
          worker_exit_status: {
            enum: TERMINAL_STATUSES.slice(),
          },
        },
      },
      then: { properties: { worker_ended_at: { type: 'string' } } },
    },
  ],
});

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validate(envelope) {
  const errors = [];
  function err(msg) { errors.push(msg); }
  function req(cond, msg) { if (!cond) err(msg); }

  req(isPlainObject(envelope), 'envelope must be an object');
  if (errors.length) return { ok: false, errors: errors };

  req(envelope.schema_version === SCHEMA_VERSION,
    'schema_version must be "' + SCHEMA_VERSION + '"');

  req(typeof envelope.dispatch_id === 'string' && UUID_RE.test(envelope.dispatch_id),
    'dispatch_id must be UUID matching ' + UUID_RE);

  req(typeof envelope.worker_subagent_type === 'string'
      && envelope.worker_subagent_type.length > 0,
    'worker_subagent_type must be a non-empty string');

  req(typeof envelope.worker_started_at === 'string'
      && ISO8601_RE.test(envelope.worker_started_at),
    'worker_started_at must be ISO8601 string');

  req(WORKER_EXIT_STATUSES.indexOf(envelope.worker_exit_status) !== -1,
    'worker_exit_status must be one of: ' + WORKER_EXIT_STATUSES.join(', '));

  if (envelope.worker_exit_status === 'pending') {
    req(envelope.worker_ended_at === null,
      'worker_ended_at must be null when worker_exit_status="pending"');
  } else if (TERMINAL_STATUSES.indexOf(envelope.worker_exit_status) !== -1) {
    req(typeof envelope.worker_ended_at === 'string'
        && ISO8601_RE.test(envelope.worker_ended_at),
      'worker_ended_at must be ISO8601 string when worker_exit_status is terminal');
  }

  req(Array.isArray(envelope.receipts_added),
    'receipts_added must be an array (possibly empty)');
  if (Array.isArray(envelope.receipts_added)) {
    envelope.receipts_added.forEach(function (slug, i) {
      req(typeof slug === 'string' && slug.length > 0,
        'receipts_added[' + i + '] must be a non-empty string');
    });
  }

  req(Array.isArray(envelope.findings),
    'findings must be an array (possibly empty)');
  if (Array.isArray(envelope.findings)) {
    envelope.findings.forEach(function (f, i) {
      req(isPlainObject(f), 'findings[' + i + '] must be an object');
    });
  }

  if (envelope.next_action !== undefined && envelope.next_action !== null) {
    req(typeof envelope.next_action === 'string' && envelope.next_action.length > 0,
      'next_action must be a non-empty string or null');
  }

  req(typeof envelope.controller_session_id === 'string'
      && UUID_RE.test(envelope.controller_session_id),
    'controller_session_id must be UUID matching ' + UUID_RE);

  req(typeof envelope.parent_cwd === 'string' && envelope.parent_cwd.length > 0,
    'parent_cwd must be a non-empty string');

  // v1.3.0-m0 Task 4a — unknown-key rejection. Matches JSON_SCHEMA.additionalProperties:false.
  // Prevents silent envelope drift in any code path using validate() rather
  // than the exported JSON Schema. New keys require a v2 envelope schema file.
  for (const k of Object.keys(envelope)) {
    if (!KNOWN_KEYS.has(k)) {
      err('unknown top-level key "' + k + '" (envelope schema is strict; ' +
        'extensions require a new envelope-schema-v2.md + schema_version bump)');
    }
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors: errors };
}

// Atomic read/write helpers. Worker-side contract: each dispatch envelope has
// a single writer (the worker assigned the dispatch_id) and N readers (the
// controller-side watcher + validate-cmd). state-writer.js uses an advisory
// lock because PreCompact + Stop-loop can race the same STATE.md — here there
// is no analogous race, so no lock file. tmp + renameSync is sufficient: a
// crash mid-write leaves <path>.tmp orphaned but the target is either the
// previous valid envelope or absent.

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
}

function read(envelopePath) {
  if (typeof envelopePath !== 'string' || envelopePath.length === 0) {
    return { ok: false, error: 'envelopePath must be a non-empty string' };
  }
  let raw;
  try {
    raw = fs.readFileSync(envelopePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { ok: false, error: 'envelope not found: ' + envelopePath };
    }
    return { ok: false, error: 'envelope read failed: ' + err.message };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: 'envelope parse failed: ' + err.message };
  }
  const result = validate(parsed);
  if (!result.ok) {
    return { ok: false, error: 'envelope invalid: ' + result.errors.join('; ') };
  }
  return { ok: true, envelope: parsed };
}

function write(envelopePath, envelope) {
  if (typeof envelopePath !== 'string' || envelopePath.length === 0) {
    return { ok: false, error: 'envelopePath must be a non-empty string' };
  }
  const result = validate(envelope);
  if (!result.ok) {
    return { ok: false, error: 'envelope invalid: ' + result.errors.join('; ') };
  }
  const tmpPath = envelopePath + '.tmp';
  try {
    ensureDir(envelopePath);
  } catch (err) {
    return { ok: false, error: 'mkdir failed: ' + err.message };
  }
  const body = JSON.stringify(envelope, null, 2) + '\n';
  try {
    fs.writeFileSync(tmpPath, body, 'utf8');
  } catch (err) {
    return { ok: false, error: 'tmp write failed: ' + err.message };
  }
  try {
    fs.renameSync(tmpPath, envelopePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return { ok: false, error: 'rename failed: ' + err.message };
  }
  // v1.3.0-m4 — render trigger after successful envelope write. Lazy-require
  // + try/catch so a staged install without lib/renderer/ does not break
  // envelope writes. triggerRender is itself loud fail-open.
  try {
    require('./renderer/trigger').triggerRender('envelope-write');
  } catch (err) {
    process.stderr.write('[mccp:dispatch-envelope] post-write trigger threw (allow): '
      + (err && err.message ? err.message : err) + '\n');
  }
  return { ok: true };
}

// markStatus is the worker-side declaration helper. The worker reads the
// placeholder envelope (controller wrote it with status=pending), mutates the
// status + optional terminal fields, and atomic-rewrites. opts:
//   endedAt           — ISO8601 timestamp; defaults to nowIso() for terminal
//                       statuses; ignored (must be null) for 'pending'.
//   receiptsAdded     — array of slugs to set (replaces existing).
//   findings          — array of objects to set (replaces existing).
//   nextAction        — string or null.
function markStatus(envelopePath, status, opts) {
  opts = opts || {};
  if (WORKER_EXIT_STATUSES.indexOf(status) === -1) {
    return {
      ok: false,
      error: 'status must be one of: ' + WORKER_EXIT_STATUSES.join(', '),
    };
  }
  const readResult = read(envelopePath);
  if (!readResult.ok) {
    return { ok: false, error: 'pre-read failed: ' + readResult.error };
  }
  const updated = Object.assign({}, readResult.envelope, { worker_exit_status: status });
  if (status === 'pending') {
    updated.worker_ended_at = null;
  } else {
    updated.worker_ended_at = opts.endedAt || nowIso();
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'receiptsAdded')) {
    updated.receipts_added = opts.receiptsAdded;
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'findings')) {
    updated.findings = opts.findings;
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'nextAction')) {
    updated.next_action = opts.nextAction;
  }
  return write(envelopePath, updated);
}

// seedEnvelope(envelopePath, opts) → { ok, created, error }
//
// workflow-orchestration M4 — worker-side idempotent envelope seed. Task 0
// (2026-07-09, Workflow run wf_1f689994-fb8) PROVED that a fresh
// isolation:'worktree' worker has NO `.claude/state/dispatches/` dir at all: it
// is gitignored, so the clean `git worktree add` checkout never copies the
// parent's placeholder envelope. Without a pre-existing envelope the worker's
// terminal markStatus fails ENOENT (read() pre-read) and buildWorktreeMap cannot
// correlate the worktree by its envelope filename. The worker therefore seeds its
// OWN envelope as a FIRST STEP: seedEnvelope atomic-writes a valid PENDING
// envelope when the file is ABSENT, and is a strict NO-OP when a file already
// exists (a harness that copied the working tree, or a re-seed) so it never
// clobbers a marked terminal envelope. Existence — NOT validity — gates the
// no-op (mirrors the plan's "존재 시 no-op"); a live terminal envelope must never
// be reset to pending.
function seedEnvelope(envelopePath, opts) {
  opts = opts || {};
  if (typeof envelopePath !== 'string' || envelopePath.length === 0) {
    return { ok: false, created: false, error: 'envelopePath must be a non-empty string' };
  }
  const dispatchId = opts.dispatchId;
  if (typeof dispatchId !== 'string' || !UUID_RE.test(dispatchId)) {
    return { ok: false, created: false, error: 'dispatchId must be a UUID matching ' + UUID_RE };
  }
  const controllerSessionId = opts.controllerSessionId;
  if (typeof controllerSessionId !== 'string' || !UUID_RE.test(controllerSessionId)) {
    return { ok: false, created: false, error: 'controllerSessionId must be a UUID matching ' + UUID_RE };
  }

  // Idempotent: an existing file (pending OR terminal OR even unparseable) is a
  // NO-OP — never clobber. Existence, not validity, gates the seed.
  let exists = false;
  try { exists = fs.existsSync(envelopePath); } catch (_) { exists = false; }
  if (exists) {
    return { ok: true, created: false, error: null };
  }

  const parentCwd = (typeof opts.parentCwd === 'string' && opts.parentCwd.length > 0)
    ? opts.parentCwd : process.cwd();
  const pending = {
    schema_version: SCHEMA_VERSION,
    dispatch_id: dispatchId,
    worker_subagent_type: (typeof opts.workerSubagentType === 'string' && opts.workerSubagentType.length > 0)
      ? opts.workerSubagentType : 'general-purpose',
    worker_started_at: (typeof opts.workerStartedAt === 'string' && ISO8601_RE.test(opts.workerStartedAt))
      ? opts.workerStartedAt : nowIso(),
    worker_ended_at: null,
    worker_exit_status: 'pending',
    receipts_added: [],
    findings: [],
    next_action: null,
    controller_session_id: controllerSessionId,
    parent_cwd: parentCwd,
  };
  const w = write(envelopePath, pending);
  if (!w.ok) return { ok: false, created: false, error: w.error };
  return { ok: true, created: true, error: null };
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  WORKER_EXIT_STATUSES: WORKER_EXIT_STATUSES,
  TERMINAL_STATUSES: TERMINAL_STATUSES,
  UUID_RE: UUID_RE,
  ISO8601_RE: ISO8601_RE,
  KNOWN_KEYS: KNOWN_KEYS,
  JSON_SCHEMA: JSON_SCHEMA,
  validate: validate,
  read: read,
  write: write,
  markStatus: markStatus,
  seedEnvelope: seedEnvelope,
};
