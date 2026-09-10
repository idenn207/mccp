'use strict';

const { resolveHarness } = require('./harness-ingress');
const codex = require('./codex-invoke');
const claude = require('./claude-review-invoke');
const fs = require('fs');
const executions = new WeakSet();
const contexts = new WeakMap();

function route(env) {
  const resolved = resolveHarness(env || process.env);
  return { host: resolved.harness,
    reviewer: resolved.harness === 'codex' ? 'claude' : resolved.harness === 'claude' ? 'codex' : null,
    blocking: resolved.harness === 'unknown', reason: resolved.reason };
}

function invokeAdversarialReview(focus, opts) {
  const o = opts || {};
  const selected = route(o.env);
  if (selected.blocking) return { ...claude.failure('unknown-harness'), hostFamily: selected.host, reviewerFamily: null };
  const context = o.reviewContext || null;
  let result;
  try {
    if (selected.reviewer === 'claude' && context) {
      const target = require('./review-target');
      target.assertCurrent(context);
      let budget = o.budget;
      if (!budget) {
        const rounds = require('./review-rounds/seal');
        const gitDir = rounds.resolveGitDir(context.root);
        const prior = rounds.readCap({ gitDir });
        if (prior.reason === 'unreadable') throw Error('round policy unreadable');
        if (!prior.found || prior.gateId !== context.gateId || prior.decisionId !== context.decisionId) {
          rounds.sealCap({ gitDir, env: o.env || process.env, gateId: context.gateId,
            decisionId: context.decisionId, codexDisabled: false });
        }
        budget = codex.resolveRoundBudget(o.env || process.env, { cwd: context.root, gitDir });
        if (!budget.canRecord || budget.gateId !== context.gateId || budget.decisionId !== context.decisionId) throw Error('round policy identity mismatch');
      }
      result = target.snapshot(context, snapshot => claude.invokeAdversarialReview(focus, {
        ...o, budget, cwd: snapshot.cwd, ledgerCwd: context.root, toolsDisabled: true,
        reviewContext: { reviewText: snapshot.reviewText },
      }));
    } else result = selected.reviewer === 'claude' ? claude.invokeAdversarialReview(focus, o) : codex.invokeAdversarialReview(focus, o);
  } catch (_) { result = claude.failure('review-target-unavailable'); }
  const out = Object.freeze({ ...result, hostFamily: selected.host, reviewerFamily: selected.reviewer });
  if (out.ok && !out.blocking) { executions.add(out); contexts.set(out, context); }
  return out;
}

function runCli(argv) {
  if (!argv || argv[0] !== 'adversarial-review') return 2;
  const values = new Set(['--focus', '--base', '--scope', '--timeout-ms', '--intent-reference-file']);
  const switches = new Set(['--json', '--impeccable-available', '--mislabel-contract']);
  for (let i = 1; i < argv.length; i++) {
    if (switches.has(argv[i])) continue;
    if (!values.has(argv[i]) || i + 1 >= argv.length) return 2;
    if (argv[i] === '--timeout-ms' && !/^[1-9][0-9]*$/.test(argv[i + 1])) return 2;
    i++;
  }
  const parsed = codex.parseCliArgs(argv);
  if (parsed.opts.intentReferenceFile) {
    try { parsed.opts.intentReference = fs.readFileSync(parsed.opts.intentReferenceFile, 'utf8'); }
    catch (_) { return 2; }
    if (!parsed.opts.intentReference.trim()) return 2;
  }
  const result = invokeAdversarialReview(parsed.focus, parsed.opts);
  process.stdout.write(JSON.stringify(result) + '\n');
  return result.blocking ? 12 : 0;
}

module.exports = { route, invokeAdversarialReview, runCli, isExecutionResult: value => executions.has(value), executionContext: value => contexts.get(value) };
if (require.main === module) process.exitCode = runCli(process.argv.slice(2));
