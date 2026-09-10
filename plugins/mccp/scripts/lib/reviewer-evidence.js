'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SHA = /^sha256:[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERDICTS = ['converged', 'divergent', 'critical', 'unavailable', 'skipped'];
const GATES = ['mccp-plan-codex', 'mccp-implement-codex', 'mccp-pr-codex'];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const hash = value => 'sha256:' + crypto.createHash('sha256').update(value).digest('hex');

function present(r) { return own(r, 'reviewer_verdict') || own(r, 'reviewer_execution'); }
function validPath(p) {
  return typeof p === 'string' && p.trim() === p && !/^[A-Za-z]:|^\/|\\|\0/.test(p) &&
    p.split('/').every(s => s && s !== '.' && s !== '..');
}

function prepareContext(options) {
  const o = options || {};
  const h = require('../receipt/hash');
  const refs = h.gitRefs({ cwd: o.cwd, base: o.base });
  const subject = { task_id: null, phase: GATES.indexOf(o.gateId) === 0 ? 'plan' : GATES.indexOf(o.gateId) === 1 ? 'implement' : 'pr',
    gate_id: o.gateId, plan_hash: h.planAwareMarkdownHash(path.resolve(o.cwd || process.cwd(), o.planPath)),
    design_doc_hash: [], base_sha: refs.baseSha, head_sha: refs.headSha, round: o.round || 1 };
  return { gateId: o.gateId, decisionId: o.decisionId, subjectHash: h.subjectHash(subject),
    reviewText: fs.readFileSync(path.resolve(o.cwd || process.cwd(), o.planPath), 'utf8') };
}

function validatePair(r) {
  const e = r && r.reviewer_execution;
  if (!present(r)) return { ok: true, absent: true };
  const ok = r && VERDICTS.includes(r.reviewer_verdict) && e && e.schema_version === 1 &&
    !['codex_verdict', 'review_verdict', 'review_source', 'review_proof'].some(k => own(r, k)) &&
    GATES.includes(e.gate_id) && SLUG.test(e.decision_id || '') &&
    ['claude', 'codex'].includes(e.host_family) && ['claude', 'codex'].includes(e.reviewer_family) &&
    e.host_family !== e.reviewer_family && typeof e.actual_model === 'string' &&
    (e.reviewer_family === 'claude' ? /^claude-[a-z0-9][a-z0-9.-]*$/ : /^(gpt-|o[1-9])/).test(e.actual_model) &&
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(e.run_nonce || '') &&
    SHA.test(e.subject_hash || '') && SHA.test(e.evidence_hash || '') && validPath(e.evidence_path);
  return { ok: !!ok, absent: false, reason: ok ? null : 'invalid-reviewer-evidence-pair' };
}

function verify(r, context) {
  const structure = validatePair(r);
  if (!structure.ok || structure.absent) return structure;
  const c = context || {};
  const e = r.reviewer_execution;
  if (!c.repoRoot || !c.gateId || !c.decisionId || !c.subjectHash || !['claude', 'codex'].includes(c.hostFamily)) return { ok: false, reason: 'reviewer-context-required' };
  for (const [key, field] of [['gateId', 'gate_id'], ['decisionId', 'decision_id'], ['subjectHash', 'subject_hash'], ['hostFamily', 'host_family']]) {
    if (c[key] && c[key] !== e[field]) return { ok: false, reason: 'reviewer-context-mismatch' };
  }
  try {
    const root = fs.realpathSync(c.repoRoot);
    const file = fs.realpathSync(path.resolve(root, e.evidence_path));
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return { ok: false, reason: 'reviewer-evidence-outside-repo' };
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 1024 * 1024) return { ok: false, reason: 'reviewer-evidence-size' };
    const bytes = fs.readFileSync(file);
    if (hash(bytes) !== e.evidence_hash) return { ok: false, reason: 'reviewer-evidence-hash' };
    const proof = JSON.parse(bytes);
    if (proof.ok !== true || proof.classification !== 'ok' || proof.verdict !== r.reviewer_verdict) return { ok: false, reason: 'reviewer-evidence-not-successful' };
    for (const key of ['gate_id', 'decision_id', 'host_family', 'reviewer_family', 'actual_model', 'run_nonce', 'subject_hash']) {
      if (proof[key] !== e[key]) return { ok: false, reason: 'reviewer-evidence-binding' };
    }
    return { ok: true, absent: false };
  } catch (_) { return { ok: false, reason: 'reviewer-evidence-unavailable' }; }
}

// Programmatic runner path only. No CLI accepts a JSON claim as execution.
function seal(run, receipt, root) {
  const reviewer = require('./reviewer-invoke');
  if (!reviewer.isExecutionResult(run) || run.classification !== 'ok' || !run.ok || run.blocking) throw new Error('untrusted reviewer execution');
  const context = reviewer.executionContext(run);
  if (!context || context.gateId !== receipt.gate_id || context.decisionId !== receipt.decision_id ||
    context.subjectHash !== receipt.subject_hash) throw new Error('review target changed before sealing');
  const parsed = JSON.parse(run.stdout).result;
  const verdict = parsed.verdict === 'approve' ? 'converged' : 'divergent';
  const execution = { schema_version: 1, gate_id: receipt.gate_id, decision_id: receipt.decision_id,
    host_family: run.hostFamily, reviewer_family: run.reviewerFamily, actual_model: run.actualModel,
    run_nonce: crypto.randomUUID(), subject_hash: receipt.subject_hash };
  const proof = { ...execution, ok: true, classification: 'ok', verdict };
  const bytes = JSON.stringify(proof, null, 2) + '\n';
  execution.evidence_path = '.claude/reviews/reviewer-' + execution.run_nonce + '.json';
  execution.evidence_hash = hash(bytes);
  const pair = { reviewer_verdict: verdict, reviewer_execution: execution };
  if (!validatePair(pair).ok) throw new Error('invalid reviewer execution');
  const dir = path.resolve(root, '.claude/reviews');
  fs.mkdirSync(dir, { recursive: true });
  const realRoot = fs.realpathSync(root);
  const relative = path.relative(realRoot, fs.realpathSync(dir));
  if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('reviewer evidence outside repository');
  const target = path.join(root, execution.evidence_path);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, bytes, { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, target);
  if (!verify(pair, { repoRoot: root, gateId: receipt.gate_id, decisionId: receipt.decision_id, subjectHash: receipt.subject_hash, hostFamily: run.hostFamily }).ok) throw new Error('reviewer evidence read-back failed');
  return pair;
}

module.exports = { present, validatePair, verify, seal, prepareContext };
