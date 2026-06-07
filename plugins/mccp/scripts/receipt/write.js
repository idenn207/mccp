'use strict';

const fs = require('fs');
const path = require('path');
const {
  markdownHash,
  planAwareMarkdownHash,
  gitRefs,
  gitBranch,
  gitRepoRoot,
  subjectHash,
  receiptHash,
} = require('./hash');
const { validate, makeSkeleton, GATE_IDS } = require('./schema');
const { phaseFromGate } = require('./aliases');
const { writeReceipt, readReceipt } = require('./store');

function asArray(v) {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

function readJsonIfPresent(filePath, fallback) {
  if (!filePath) return fallback;
  if (!fs.existsSync(filePath)) {
    throw new Error('file not found: ' + filePath);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relativeToRepo(filePath, repoRoot) {
  const abs = path.resolve(filePath);
  const rel = path.relative(repoRoot, abs);
  return rel.split(path.sep).join('/');
}

function buildReceipt(args) {
  const gateId = args.gate || args['gate-id'];
  const decisionId = args.decision || args['decision-id'];
  const planPath = args.plan;

  if (!gateId) throw new Error('--gate is required');
  if (!decisionId) throw new Error('--decision is required');
  if (!planPath) throw new Error('--plan is required');
  if (GATE_IDS.indexOf(gateId) === -1) {
    throw new Error('invalid --gate "' + gateId + '"; must be one of: ' + GATE_IDS.join(', '));
  }

  const cwd = args.cwd || process.cwd();
  const repoRoot = gitRepoRoot(cwd);
  const phase = phaseFromGate(gateId);
  const planAbs = path.resolve(cwd, planPath);
  const planHash = planAwareMarkdownHash(planAbs);

  const designDocPaths = asArray(args['design-doc']);
  const designDocHash = designDocPaths.map(function (p) {
    const abs = path.resolve(cwd, p);
    return {
      path: relativeToRepo(abs, repoRoot),
      sha256: markdownHash(abs),
    };
  });

  const refs = gitRefs({ cwd: cwd, base: args.base });
  const branch = gitBranch(cwd);

  const findings = readJsonIfPresent(args['findings-file'], []);
  const defaultResolution = {
    converged: true,
    rounds: 1,
    accepted: [],
    rejected: [],
    open_questions: [],
  };
  const resolution = readJsonIfPresent(args['resolution-file'], defaultResolution);

  const existing = readReceipt(repoRoot, gateId, decisionId);
  let round = args.round !== undefined ? parseInt(args.round, 10) : 1;
  if (args['auto-round'] && existing && Number.isInteger(existing.round)) {
    round = existing.round + 1;
  }

  const skipBypass = process.env.MCCP_SKIP_RECEIPT === '1';
  const skipped = args.skipped === true || skipBypass;
  let skipReason = args['skip-reason'] || null;
  if (skipBypass && !skipReason) skipReason = 'MCCP_SKIP_RECEIPT=1';

  const receipt = makeSkeleton({
    gate_id: gateId,
    phase: phase,
    decision_id: decisionId,
    task_id: args['task-id'] || null,
    plan_hash: planHash,
    design_doc_hash: designDocHash,
    base_sha: refs.baseSha,
    head_sha: refs.headSha,
    round: round,
    findings: findings,
    resolution: resolution,
    meta: {
      created_at: new Date().toISOString(),
      command: args.command || '/' + gateId,
      cwd: cwd,
      git_branch: branch,
      skipped: skipped,
      skip_reason: skipReason,
      codex_skipped: args['codex-skipped'] === true,
      advisory: args['advisory'] === true,
      security_skipped: args['security-skipped'] === true,
      security_skip_reason: args['security-skip-reason'] || null,
      security_force_override: args['security-force-override'] === true,
      security_force_override_reason: args['security-force-override-reason'] || null,
      impeccable_skipped: args['impeccable-skipped'] === true,
      impeccable_skip_reason: args['impeccable-skip-reason'] || null,
      impeccable_force_override: args['impeccable-force-override'] === true,
      impeccable_force_override_reason: args['impeccable-force-override-reason'] || null,
      // v0.2.8 Task 2.6.1 — PR-Codex audit axis.
      codex_dedupe_at_pr: args['codex-dedupe-at-pr'] === true,
      codex_skipped_at_pr: args['codex-skipped-at-pr'] === true,
      codex_skip_reason: args['codex-skip-reason'] || null,
      codex_review_actionable_findings: args['codex-actionable-findings'] === true,
      // v0.2.9 Task 5 — YAGNI triage DEFER_TO_BACKLOG counter. Additive, no schema bump.
      deferred_findings_count: (function () {
        const v = args['deferred-findings'];
        if (v === undefined || v === true || v === null) return 0;
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      })(),
    },
  });

  receipt.subject_hash = subjectHash(receipt);
  receipt.receipt_hash = receiptHash(receipt);

  const result = validate(receipt);
  if (!result.ok) {
    const err = new Error('receipt schema validation failed:\n  - ' + result.errors.join('\n  - '));
    err.code = 'SCHEMA_INVALID';
    err.errors = result.errors;
    throw err;
  }

  return { repoRoot: repoRoot, receipt: receipt };
}

function write(args) {
  const built = buildReceipt(args);
  const p = writeReceipt(built.repoRoot, built.receipt);
  return { path: p, receipt: built.receipt };
}

module.exports = { write: write, buildReceipt: buildReceipt };
