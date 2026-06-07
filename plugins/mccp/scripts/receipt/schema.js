'use strict';

const { validateReason } = require('./lib/force-override-reason');

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

    // v0.2.4 Codex Round 1 F1 — advisory axis is now writeable.
    // Previously validate-cmd treated meta.advisory=true as non-approving but
    // write.js had no way to set it. That left an MCCP_ALLOW_CODEX_UNAVAILABLE
    // advisory path silently producing approving receipts unless the command
    // also passed --codex-skipped. The axis is now first-class.
    req(typeof m.advisory === 'boolean', 'meta.advisory must be a boolean');

    // v0.2.4 Task 8 — security_skipped tracks security-reviewer auto-fallback.
    req(typeof m.security_skipped === 'boolean', 'meta.security_skipped must be a boolean');
    if (m.security_skip_reason !== null && m.security_skip_reason !== undefined) {
      req(typeof m.security_skip_reason === 'string',
        'meta.security_skip_reason must be a string or null');
    }

    // v0.2.4 Task 10 — security_force_override tracks audited escape hatch
    // (terminal /mccp:pr with MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER set).
    req(typeof m.security_force_override === 'boolean',
      'meta.security_force_override must be a boolean');
    if (m.security_force_override_reason !== null && m.security_force_override_reason !== undefined) {
      req(typeof m.security_force_override_reason === 'string',
        'meta.security_force_override_reason must be a string or null');
    }

    // v0.2.4 Task 11 — 4-axis state matrix invariant.
    // security_skipped=true AND security_force_override=true is a contradiction
    // (the override was supposed to be a deliberate audited bypass; skipped
    // means the gate silently fell through). Allowing both would fail-open
    // by writing a receipt the validator could not classify.
    if (m.security_skipped === true && m.security_force_override === true) {
      err('meta.security_skipped + meta.security_force_override cannot both be true ' +
        '(4-axis state matrix invariant: pick one — skipped = fall-through, ' +
        'force_override = deliberate audited bypass)');
    }

    // v0.2.6 Milestone 1 Task 1.2 — impeccable_* axis (Codex R1 F1 absorption:
    // primary codex receipt meta, no separate design_* namespace). Mirrors
    // security_* shape; cross-namespace combos are allowed (security_skipped +
    // impeccable_force_override is a legal state), only same-namespace combos
    // are contradictions.
    req(typeof m.impeccable_skipped === 'boolean',
      'meta.impeccable_skipped must be a boolean');
    if (m.impeccable_skip_reason !== null && m.impeccable_skip_reason !== undefined) {
      req(typeof m.impeccable_skip_reason === 'string',
        'meta.impeccable_skip_reason must be a string or null');
    }
    req(typeof m.impeccable_force_override === 'boolean',
      'meta.impeccable_force_override must be a boolean');
    if (m.impeccable_force_override_reason !== null && m.impeccable_force_override_reason !== undefined) {
      req(typeof m.impeccable_force_override_reason === 'string',
        'meta.impeccable_force_override_reason must be a string or null');
    }

    if (m.impeccable_skipped === true && m.impeccable_force_override === true) {
      err('meta.impeccable_skipped + meta.impeccable_force_override cannot both be true ' +
        '(state matrix invariant: pick one — skipped = fall-through, ' +
        'force_override = deliberate audited bypass)');
    }

    // F4 hardening + F-Sec-1 absorption: strict namespace reason validator.
    // When impeccable_force_override=true, reason must be substantive
    // (≥30 chars, ≥3 words, no placeholder/URL-only/1-token). Helper holds
    // the rules so v0.2.7 housekeeping can flip security namespace to strict
    // without touching schema.js.
    if (m.impeccable_force_override === true) {
      const v = validateReason(m.impeccable_force_override_reason, { namespace: 'impeccable' });
      if (!v.ok) {
        err('meta.impeccable_force_override_reason rejected (' + v.reason + '): ' +
          'force_override requires substantive reason ≥30 chars + ≥3 words, ' +
          'no placeholder/URL-only/banlist token');
      }
    }

    // v0.2.8 Task 2.6.1 — PR-Codex review-only audit axis (4 fields).
    //
    // Backwards-compatible: receipts written by v0.2.7 and earlier did not
    // carry these fields. Treat absent (undefined) as the default false
    // for boolean fields and null for the reason string. New write paths
    // (write.js + makeSkeleton) always populate them, so the strict invariants
    // below only fire when at least one field is explicitly present.
    //
    // Matrix invariant: codex_dedupe_at_pr + codex_skipped_at_pr cannot both
    // be true — mutually exclusive skip paths. Reason validator (strict)
    // applies only when codex_skipped_at_pr=true.
    if (m.codex_dedupe_at_pr !== undefined) {
      req(typeof m.codex_dedupe_at_pr === 'boolean',
        'meta.codex_dedupe_at_pr must be a boolean if present');
    }
    if (m.codex_skipped_at_pr !== undefined) {
      req(typeof m.codex_skipped_at_pr === 'boolean',
        'meta.codex_skipped_at_pr must be a boolean if present');
    }
    if (m.codex_skip_reason !== null && m.codex_skip_reason !== undefined) {
      req(typeof m.codex_skip_reason === 'string',
        'meta.codex_skip_reason must be a string or null');
    }
    if (m.codex_review_actionable_findings !== undefined) {
      req(typeof m.codex_review_actionable_findings === 'boolean',
        'meta.codex_review_actionable_findings must be a boolean if present');
    }

    if (m.codex_dedupe_at_pr === true && m.codex_skipped_at_pr === true) {
      err('meta.codex_dedupe_at_pr + meta.codex_skipped_at_pr cannot both be true ' +
        '(Task 2.6.1 matrix invariant: pick one — dedupe = cross-gate convergence, ' +
        'skipped = MCCP_PR_SKIP_CODEX_REVIEW audited escape)');
    }

    if (m.codex_skipped_at_pr === true) {
      const v = validateReason(m.codex_skip_reason, { strict: true });
      if (!v.ok) {
        err('meta.codex_skip_reason rejected (' + v.reason + '): ' +
          'MCCP_PR_SKIP_CODEX_REVIEW requires substantive reason ≥30 chars + ' +
          '≥3 words, no placeholder/URL-only/banlist token');
      }
    }

    if (m.deferred_findings_count !== undefined && m.deferred_findings_count !== null) {
      req(Number.isInteger(m.deferred_findings_count) && m.deferred_findings_count >= 0,
        'meta.deferred_findings_count must be a non-negative integer if present');
    }
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
      advisory: false,
      security_skipped: false,
      security_skip_reason: null,
      security_force_override: false,
      security_force_override_reason: null,
      impeccable_skipped: false,
      impeccable_skip_reason: null,
      impeccable_force_override: false,
      impeccable_force_override_reason: null,
      // v0.2.8 Task 2.6.1 — PR-Codex review-only audit axis.
      codex_dedupe_at_pr: false,
      codex_skipped_at_pr: false,
      codex_skip_reason: null,
      codex_review_actionable_findings: false,
      // v0.2.9 Task 5 — YAGNI triage DEFER_TO_BACKLOG counter (additive, no schema bump).
      deferred_findings_count: 0,
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
