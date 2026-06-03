'use strict';

const SCHEMA_VERSION = 'v1';

const PHASES = ['plan', 'implement', 'pr', 'review'];

const GATE_IDS = [
  'plan-impeccable',
  'mccp-plan-codex',
  'implement-impeccable',
  'mccp-implement-codex',
  'pr-impeccable',
  'mccp-pr-codex',
  'security-reviewer',
  'code-reviewer',
];

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const GIT_SHA_RE = /^[0-9a-f]{7,40}$/;
const DECISION_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validate(receipt) {
  const errors = [];

  function err(msg) { errors.push(msg); }
  function req(cond, msg) { if (!cond) err(msg); }

  req(isPlainObject(receipt), 'receipt must be an object');
  if (errors.length) return { ok: false, errors: errors };

  req(receipt.schema_version === SCHEMA_VERSION, 'schema_version must be "' + SCHEMA_VERSION + '"');

  req(GATE_IDS.indexOf(receipt.gate_id) !== -1,
    'gate_id must be one of: ' + GATE_IDS.join(', '));

  req(PHASES.indexOf(receipt.phase) !== -1,
    'phase must be one of: ' + PHASES.join(', '));

  req(typeof receipt.decision_id === 'string' && DECISION_ID_RE.test(receipt.decision_id),
    'decision_id must be kebab-case slug matching ' + DECISION_ID_RE);

  if (receipt.task_id !== null && receipt.task_id !== undefined) {
    req(typeof receipt.task_id === 'string' && receipt.task_id.length > 0,
      'task_id must be a non-empty string or null');
  }

  req(typeof receipt.plan_hash === 'string' && SHA256_RE.test(receipt.plan_hash),
    'plan_hash must match ' + SHA256_RE);

  req(Array.isArray(receipt.design_doc_hash),
    'design_doc_hash must be an array (possibly empty)');
  if (Array.isArray(receipt.design_doc_hash)) {
    receipt.design_doc_hash.forEach(function (entry, i) {
      req(isPlainObject(entry), 'design_doc_hash[' + i + '] must be an object');
      if (isPlainObject(entry)) {
        req(typeof entry.path === 'string' && entry.path.length > 0,
          'design_doc_hash[' + i + '].path must be a non-empty string');
        req(typeof entry.sha256 === 'string' && SHA256_RE.test(entry.sha256),
          'design_doc_hash[' + i + '].sha256 must match ' + SHA256_RE);
      }
    });
  }

  req(typeof receipt.base_sha === 'string' && GIT_SHA_RE.test(receipt.base_sha),
    'base_sha must be a git SHA (7-40 hex chars)');
  req(typeof receipt.head_sha === 'string' && GIT_SHA_RE.test(receipt.head_sha),
    'head_sha must be a git SHA (7-40 hex chars)');

  req(Number.isInteger(receipt.round) && receipt.round >= 1 && receipt.round <= 10,
    'round must be an integer in [1, 10]');

  req(Array.isArray(receipt.findings),
    'findings must be an array (possibly empty)');
  if (Array.isArray(receipt.findings)) {
    receipt.findings.forEach(function (f, i) {
      req(isPlainObject(f), 'findings[' + i + '] must be an object');
      if (isPlainObject(f)) {
        req(SEVERITIES.indexOf(f.severity) !== -1,
          'findings[' + i + '].severity must be one of: ' + SEVERITIES.join(', '));
        req(typeof f.area === 'string' && f.area.length > 0,
          'findings[' + i + '].area must be a non-empty string');
        req(typeof f.description === 'string' && f.description.length > 0,
          'findings[' + i + '].description must be a non-empty string');
      }
    });
  }

  req(isPlainObject(receipt.resolution), 'resolution must be an object');
  if (isPlainObject(receipt.resolution)) {
    const r = receipt.resolution;
    req(typeof r.converged === 'boolean', 'resolution.converged must be a boolean');
    req(Number.isInteger(r.rounds) && r.rounds >= 1, 'resolution.rounds must be a positive integer');
    req(Array.isArray(r.accepted), 'resolution.accepted must be an array');
    req(Array.isArray(r.rejected), 'resolution.rejected must be an array');
    req(Array.isArray(r.open_questions), 'resolution.open_questions must be an array');
    if (Array.isArray(r.open_questions)) {
      r.open_questions.forEach(function (q, i) {
        req(isPlainObject(q), 'resolution.open_questions[' + i + '] must be an object');
        if (isPlainObject(q)) {
          req(SEVERITIES.indexOf(q.severity) !== -1,
            'resolution.open_questions[' + i + '].severity must be one of: ' + SEVERITIES.join(', '));
        }
      });
    }
  }

  req(typeof receipt.subject_hash === 'string' && SHA256_RE.test(receipt.subject_hash),
    'subject_hash must match ' + SHA256_RE);
  req(typeof receipt.receipt_hash === 'string' && SHA256_RE.test(receipt.receipt_hash),
    'receipt_hash must match ' + SHA256_RE);

  req(isPlainObject(receipt.meta), 'meta must be an object');
  if (isPlainObject(receipt.meta)) {
    const m = receipt.meta;
    req(typeof m.created_at === 'string' && ISO8601_RE.test(m.created_at),
      'meta.created_at must be ISO 8601 timestamp');
    req(typeof m.command === 'string' && m.command.length > 0,
      'meta.command must be a non-empty string');
    req(typeof m.cwd === 'string' && m.cwd.length > 0,
      'meta.cwd must be a non-empty string');
    if (m.git_branch !== null && m.git_branch !== undefined) {
      req(typeof m.git_branch === 'string', 'meta.git_branch must be a string or null');
    }
    req(typeof m.skipped === 'boolean', 'meta.skipped must be a boolean');
    if (m.skip_reason !== null && m.skip_reason !== undefined) {
      req(typeof m.skip_reason === 'string', 'meta.skip_reason must be a string or null');
    }
    req(typeof m.codex_skipped === 'boolean', 'meta.codex_skipped must be a boolean');
  }

  return { ok: errors.length === 0, errors: errors };
}

function makeSkeleton(overrides) {
  const o = overrides || {};
  return Object.assign({
    schema_version: SCHEMA_VERSION,
    gate_id: null,
    phase: null,
    decision_id: null,
    task_id: null,
    plan_hash: null,
    design_doc_hash: [],
    base_sha: null,
    head_sha: null,
    round: 1,
    findings: [],
    resolution: {
      converged: false,
      rounds: 1,
      accepted: [],
      rejected: [],
      open_questions: [],
    },
    subject_hash: null,
    receipt_hash: null,
    meta: {
      created_at: new Date().toISOString(),
      command: null,
      cwd: process.cwd(),
      git_branch: null,
      skipped: false,
      skip_reason: null,
      codex_skipped: false,
    },
  }, o);
}

module.exports = {
  SCHEMA_VERSION: SCHEMA_VERSION,
  PHASES: PHASES,
  GATE_IDS: GATE_IDS,
  SEVERITIES: SEVERITIES,
  SHA256_RE: SHA256_RE,
  GIT_SHA_RE: GIT_SHA_RE,
  DECISION_ID_RE: DECISION_ID_RE,
  validate: validate,
  makeSkeleton: makeSkeleton,
};
