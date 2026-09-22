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
const sealedRuns = new WeakSet();

function present(r) { return own(r, 'reviewer_verdict') || own(r, 'reviewer_execution'); }
function validPath(p) {
  return typeof p === 'string' && p.trim() === p && !/^[A-Za-z]:|^\/|\\|\0/.test(p) &&
    p.split('/').every(s => s && s !== '.' && s !== '..');
}

function prepareContext(options) {
  const o = options || {};
  const target = require('./review-target');
  const base = o.base ? target.git(o.cwd || process.cwd(), ['rev-parse', '--verify', o.base + '^{commit}']).trim()
    : require('../receipt/hash').gitRefs({ cwd: o.cwd }).baseSha;
  return target.capture({ ...o, base });
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
    SHA.test(e.subject_hash || '') && SHA.test(e.evidence_hash || '') && validPath(e.evidence_path) &&
    require('./review-target').validateInput(e.reviewed_input) && SHA.test(e.reviewed_input_hash || '');
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
    const target = require('./review-target');
    if (e.reviewed_input.gate_id !== e.gate_id || e.reviewed_input.decision_id !== e.decision_id ||
        target.digest(target.canonical(e.reviewed_input)) !== e.reviewed_input_hash ||
        proof.reviewed_input_hash !== e.reviewed_input_hash ||
        target.canonical(proof.reviewed_input) !== target.canonical(e.reviewed_input) ||
        !SHA.test(proof.plan_hash || '') || (c.planHash && proof.plan_hash !== c.planHash) ||
        e.evidence_path !== target.outputs(e.gate_id, e.decision_id, e.run_nonce).proof) return { ok: false, reason: 'reviewed-input-binding' };
    target.verify(e.reviewed_input, root, { mode: c.mode || 'upstream', runNonce: e.run_nonce });
    return { ok: true, absent: false };
  } catch (_) { return { ok: false, reason: 'reviewer-evidence-unavailable' }; }
}

// Programmatic runner path only. No CLI accepts a JSON claim as execution.
function seal(run, receipt, root) {
  const reviewer = require('./reviewer-invoke');
  if (!reviewer.isExecutionResult(run) || sealedRuns.has(run) || run.classification !== 'ok' || !run.ok || run.blocking) throw new Error('untrusted reviewer execution');
  const context = reviewer.executionContext(run);
  const targetInput = require('./review-target');
  if (!targetInput.isCapture(context) || context.gateId !== receipt.gate_id || context.decisionId !== receipt.decision_id ||
      context.reviewedInput.target_commit !== receipt.head_sha || context.reviewedInput.base_commit !== receipt.base_sha) throw new Error('review target changed before sealing');
  targetInput.assertCurrent(context);
  const parsed = JSON.parse(run.stdout).result;
  const verdict = parsed.verdict === 'approve' ? 'converged' : 'divergent';
  const execution = { schema_version: 1, gate_id: receipt.gate_id, decision_id: receipt.decision_id,
    host_family: run.hostFamily, reviewer_family: run.reviewerFamily, actual_model: run.actualModel,
    run_nonce: context.runNonce, subject_hash: receipt.subject_hash,
    reviewed_input: context.reviewedInput, reviewed_input_hash: context.reviewedInputHash };
  const proof = { ...execution, plan_hash: receipt.plan_hash, ok: true, classification: 'ok', verdict, review: parsed };
  const bytes = JSON.stringify(proof, null, 2) + '\n';
  execution.evidence_path = context.outputPaths.proof;
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
  sealedRuns.add(run);
  return pair;
}

module.exports = { present, validatePair, verify, seal, prepareContext };
