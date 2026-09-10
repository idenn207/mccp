'use strict';

// One process owns capture -> external review -> verdict -> receipt. JSON is
// diagnostic output only; there is deliberately no result-file input.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const reviewer = require('./reviewer-invoke');
const target = require('./review-target');
const evidence = require('./reviewer-evidence');
const writer = require('../receipt/write');
const store = require('../receipt/store');
const hashes = require('../receipt/hash');
function run(opts) {
  const o = opts || {};
  const root = fs.realpathSync(o.cwd || process.cwd());
  if (reviewer.route(o.env).reviewer !== 'claude') return { ok: false, exitCode: 12, reason: 'opposite-family Claude runner requires Codex host' };
  const nonce = crypto.randomUUID();
  let lock;
  let ownsLock = false;
  try {
    target.outputs('mccp-implement-codex', o.decision, nonce);
    const gitDir = target.git(root, ['rev-parse', '--absolute-git-dir']).trim();
    const dir = path.join(gitDir, 'mccp', 'implement-review'); fs.mkdirSync(dir, { recursive: true });
    lock = path.join(dir, o.decision + '.lock');
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, nonce }), { flag: 'wx', mode: 0o600 }); ownsLock = true;
    const context = evidence.prepareContext({ cwd: root, gateId: 'mccp-implement-codex', decisionId: o.decision,
      planPath: o.plan, base: o.base, runNonce: nonce, designPaths: o.designPaths });
    const result = reviewer.invokeAdversarialReview(o.focus || 'Review the complete implementation against the authoritative plan.', {
      cwd: root, env: o.env, bin: o.bin, timeoutMs: o.timeoutMs, reviewContext: context,
      intentReference: context.reviewText, budget: o.budget,
    });
    if (!result.ok || result.blocking || result.classification !== 'ok') return { ok: false, exitCode: 12, reason: result.classification };
    target.assertCurrent(context);
    if (JSON.parse(fs.readFileSync(lock, 'utf8')).nonce !== nonce) throw Error('review lock ownership lost');
    const written = writer.write({ gate: 'mccp-implement-codex', decision: o.decision, plan: o.plan,
      base: context.reviewedInput.base_commit, cwd: root, reviewerRun: result });
    const receipt = store.readReceipt(root, 'mccp-implement-codex', o.decision);
    target.assertCurrent(context);
    if (!receipt || receipt.receipt_hash !== written.receipt.receipt_hash || hashes.receiptHash(receipt) !== receipt.receipt_hash ||
        !evidence.verify(receipt.resolution, { repoRoot: root, gateId: receipt.gate_id, decisionId: receipt.decision_id,
          subjectHash: receipt.subject_hash, planHash: receipt.plan_hash, hostFamily: 'codex', mode: 'current-target' }).ok) throw Error('implement receipt read-back failed');
    const ok = receipt.resolution.reviewer_verdict === 'converged';
    return { ok, exitCode: ok ? 0 : 12, verdict: receipt.resolution.reviewer_verdict, receiptPath: written.path,
      hostFamily: result.hostFamily, reviewerFamily: result.reviewerFamily, actualModel: result.actualModel };
  } catch (err) { return { ok: false, exitCode: 12, reason: err.code === 'EEXIST' ? 'review owner already active' : err.message }; }
  finally {
    if (ownsLock) {
      try { if (JSON.parse(fs.readFileSync(lock, 'utf8')).nonce === nonce) fs.unlinkSync(lock); } catch (_) {}
    }
  }
}
function cli(argv) {
  const names = { '--plan': 'plan', '--decision': 'decision', '--base': 'base', '--cwd': 'cwd', '--focus': 'focus', '--timeout-ms': 'timeoutMs' };
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!names[argv[i]] || !argv[i + 1] || argv[i + 1].startsWith('--')) return 2;
    args[names[argv[i]]] = argv[i + 1];
  }
  if (!args.plan || !args.decision) return 2;
  if (args.timeoutMs && !/^[1-9][0-9]*$/.test(args.timeoutMs)) return 2;
  if (args.timeoutMs) args.timeoutMs = Number(args.timeoutMs);
  const result = run(args); process.stdout.write(JSON.stringify(result) + '\n'); return result.exitCode;
}
module.exports = { run, cli };
if (require.main === module) process.exitCode = cli(process.argv.slice(2));
