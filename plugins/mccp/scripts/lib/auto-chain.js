'use strict';

// Plan v0.2.2 Task 5 — auto-chain decision API.
//
// auto-chain does NOT execute slash commands itself (it cannot — those run in
// Claude's command body). Instead it answers two questions from a chain step:
//
//   1. "Should I abort before the next mutating step?" — `check --next-step <s>`
//   2. "I just ran step X with status Y" — `record-step --step X --status Y`
//
// And for terminal commands:
//
//   3. "Is the advisory-env precondition for the PR step satisfied?"
//      — `preflight pr` (R2#2: refuse MCCP_ALLOW_CODEX_UNAVAILABLE=1)
//
// Output: stdout JSON, exit 0 = proceed, exit 13 = abort.
//
// shouldAbort() triggers (Codex R1#3 + R2 hardening):
//   1. MCCP_AUTO_CHAIN_DISABLE=1 env kill switch
//   2. Latest Codex receipt verdict != converged  (handled by validate-cmd already;
//      we just check that the relevant receipt validates and has no advisory flag)
//   3. Codex receipt Open Questions with severity HIGH or CRITICAL
//   4. Codex receipt criticalCategory !== null
//   5. Receipt missing / stale (validate-cmd reports it)
//   6. Previous chain step exit nonzero (recorded in STATE.md chain_progress)
//   7. Cost telemetry: cost-current.json missing / stale (>3600s) / unreadable
//      / hard_ceiling_reached === true
//   8. STATE.md chain_aborted=true

const fs = require('fs');
const path = require('path');
const cost = require('./cost-state');

const ABORT_EXIT = 13;
// v0.2.8 Task 2.6.5a A3 R2 F2 + R3 absorption — tempfail exit mirrors
// cli/preflight (sysexits 75 — temp failure, retryable). Distinct from
// ABORT_EXIT (13 — deliberate abort) so orchestrators that consume exit
// status can distinguish "retry shortly" from "stop".
const TEMPFAIL_EXIT = 75;
const COST_STALE_MS = 3600 * 1000; // R3#3 fix — older than 1h ⇒ stale

const ADVISORY_REJECTED_STEPS = new Set(['pr']);

function envBool(env, name) {
  const v = env[name];
  if (!v) return false;
  return v === '1' || /^(true|yes|on)$/i.test(String(v));
}

function findRepoRoot(cwd) {
  let dir = cwd || process.cwd();
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd || process.cwd();
}

function readStateMd(repoRoot) {
  const p = path.join(repoRoot, '.claude', 'state', 'STATE.md');
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    // Lightweight frontmatter extraction (lines between `---`).
    const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!m) return null;
    const lines = m[1].split(/\r?\n/);
    const out = {};
    for (const line of lines) {
      const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i);
      if (!kv) continue;
      const val = kv[2];
      if (val === 'true') out[kv[1]] = true;
      else if (val === 'false') out[kv[1]] = false;
      else if (/^\d+$/.test(val)) out[kv[1]] = Number(val);
      else out[kv[1]] = val.replace(/^['"]|['"]$/g, '');
    }
    return out;
  } catch {
    return null;
  }
}

function checkCostTelemetry() {
  const p = require('./cost-state-path').getCostStatePath();
  if (!fs.existsSync(p)) {
    return { ok: false, reason: 'cost-state-missing', detail: 'cost-current.json not found at ' + p };
  }
  let state;
  try {
    state = cost.readStateOrThrow();
  } catch (err) {
    return { ok: false, reason: 'cost-state-unreadable', detail: err.message };
  }
  if (cost.isStale(COST_STALE_MS)) {
    return { ok: false, reason: 'cost-state-stale', detail: 'cost-current.json mtime > 3600s old' };
  }
  if (state.hard_ceiling_reached === true) {
    return { ok: false, reason: 'cost-hard-ceiling', detail: 'hard_ceiling_reached=true' };
  }
  return { ok: true, state: state };
}

function shouldAbort(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const repoRoot = opts.repoRoot || findRepoRoot(opts.cwd);
  const reasons = [];

  // 1. Kill switch
  if (envBool(env, 'MCCP_AUTO_CHAIN_DISABLE')) {
    reasons.push({ trigger: 'kill-switch', detail: 'MCCP_AUTO_CHAIN_DISABLE=1' });
  }

  // 8. STATE.md chain_aborted (read early so it can short-circuit)
  const stateMd = readStateMd(repoRoot);
  if (stateMd && stateMd.chain_aborted === true) {
    reasons.push({ trigger: 'state-md-aborted', detail: 'STATE.md chain_aborted=true' });
  }

  // 6. Previous chain step exit nonzero (from STATE.md chain_progress is simple kv;
  //    we don't fully serialize the chain log into frontmatter — caller passes
  //    previousStepStatus directly via opts.)
  if (opts.previousStepStatus && opts.previousStepStatus !== 'ok' && opts.previousStepStatus !== 'success') {
    reasons.push({ trigger: 'previous-step-failed', detail: 'previousStepStatus=' + opts.previousStepStatus });
  }

  // 2-5. Receipt validation: delegate to validate-cmd if the step requires one
  // v0.2.8 Task 2.6.5a A3 R2 F2 absorption — classify the validate result.
  // tempfail (migration in progress) is reported as a distinct trigger
  // (`receipt-tempfail`) with `retryable: true` so the orchestrator can
  // emit a retryable exit code (75) rather than the generic abort exit (13).
  if (opts.validateCommand) {
    try {
      const { validateCommand } = require(path.join(opts.pluginRoot || resolvePluginRoot(),
        'scripts', 'receipt', 'validate-cmd'));
      const v = validateCommand(opts.validateCommand, { cwd: repoRoot, decisionId: opts.decisionId });
      let classify;
      try { classify = require(path.join(opts.pluginRoot || resolvePluginRoot(),
        'scripts', 'receipt', 'classify')); }
      catch (_) { classify = null; }
      const kind = classify ? classify.classifyValidationResult(v) : (v.ok ? 'ok' : 'block');
      if (kind === 'tempfail') {
        reasons.push({
          trigger: 'receipt-tempfail',
          retryable: true,
          detail: v.reason || 'migration in progress; retry shortly',
        });
      } else if (!v.ok) {
        if ((v.missing || []).length) reasons.push({ trigger: 'receipt-missing', detail: JSON.stringify(v.missing) });
        if ((v.stale || []).length) reasons.push({ trigger: 'receipt-stale', detail: JSON.stringify(v.stale) });
        if ((v.blocking || []).length) reasons.push({ trigger: 'receipt-blocking', detail: JSON.stringify(v.blocking) });
        if ((v.open_critical || []).length) reasons.push({ trigger: 'open-critical', detail: JSON.stringify(v.open_critical) });
      }
    } catch (err) {
      reasons.push({ trigger: 'validate-cmd-error', detail: err.message });
    }
  }

  // 7. Cost telemetry
  if (!opts.skipCostCheck) {
    const cs = checkCostTelemetry();
    if (!cs.ok) {
      reasons.push({ trigger: 'cost-telemetry', detail: cs.reason + ': ' + cs.detail });
    }
  }

  return { shouldAbort: reasons.length > 0, reasons: reasons };
}

function resolvePluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');
}

function preflightStep(step, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  // R2#2: terminal `pr` step refuses advisory env unconditionally.
  if (ADVISORY_REJECTED_STEPS.has(step) && env.MCCP_ALLOW_CODEX_UNAVAILABLE === '1') {
    return {
      ok: false,
      reason: 'advisory-env-rejected',
      detail: 'MCCP_ALLOW_CODEX_UNAVAILABLE=1 is forbidden at terminal step "' + step + '" — no GitHub touch, no receipt write.',
    };
  }
  return { ok: true };
}

function recordStep(repoRoot, entry) {
  // Lightweight append to STATE.md `chain_progress` via state-writer if available.
  try {
    const stateWriter = require(path.join(resolvePluginRoot(), 'scripts', 'state', 'state-writer'));
    if (typeof stateWriter.recordChainProgress === 'function') {
      return stateWriter.recordChainProgress(repoRoot, entry);
    }
  } catch { /* state-writer optional; fall through */ }
  // Fallback: append a json sidecar so the info isn't lost
  const dir = path.join(repoRoot, '.claude', 'state');
  fs.mkdirSync(dir, { recursive: true });
  const log = path.join(dir, 'auto-chain.log.jsonl');
  fs.appendFileSync(log, JSON.stringify(Object.assign({ ts: Date.now() }, entry)) + '\n', 'utf8');
  return { path: log };
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function runCli(argv) {
  if (!argv || argv.length === 0) {
    process.stderr.write(
      'usage: auto-chain <check|preflight|record-step> [options]\n' +
      '  check     --next-step <s> [--validate-command <slug>] [--decision <slug>] [--prev-status <status>] [--skip-cost]\n' +
      '  preflight <step>\n' +
      '  record-step --step <s> --status <ok|failed> [--receipt-path <p>]\n'
    );
    return 2;
  }
  const cmd = argv[0];
  const rest = parseFlags(argv.slice(1));

  if (cmd === 'check') {
    const opts = {
      env: process.env,
      cwd: process.cwd(),
      validateCommand: rest['validate-command'],
      decisionId: rest['decision'] || 'default',
      previousStepStatus: rest['prev-status'],
      skipCostCheck: rest['skip-cost'] === true,
    };
    const r = shouldAbort(opts);
    // v0.2.8 Task 2.6.5a A3 R3 absorption — tempfail wins the exit code
    // selection. Orchestration scripts checking exit status get a
    // canonical retryable signal (75) instead of the generic abort (13).
    const isTempfail = r.reasons.some(x => x.trigger === 'receipt-tempfail');
    emit({
      next_step: rest['next-step'] || null,
      should_abort: r.shouldAbort,
      reasons: r.reasons,
      // Machine-readable retry signal for callers parsing stdout JSON.
      reason: isTempfail ? 'receipt-tempfail' : null,
      retryable: isTempfail,
    });
    if (isTempfail) return TEMPFAIL_EXIT;
    return r.shouldAbort ? ABORT_EXIT : 0;
  }

  if (cmd === 'preflight') {
    const step = rest._[0];
    if (!step) {
      process.stderr.write('preflight requires a step name\n');
      return 2;
    }
    const r = preflightStep(step, { env: process.env });
    emit(r);
    return r.ok ? 0 : ABORT_EXIT;
  }

  if (cmd === 'record-step') {
    const step = rest['step'];
    const status = rest['status'];
    if (!step || !status) {
      process.stderr.write('record-step requires --step and --status\n');
      return 2;
    }
    const repoRoot = findRepoRoot(process.cwd());
    const r = recordStep(repoRoot, {
      step: step,
      status: status,
      receipt_path: rest['receipt-path'] || null,
    });
    emit({ ok: true, recorded: r });
    return 0;
  }

  process.stderr.write('unknown subcommand: ' + cmd + '\n');
  return 2;
}

function parseFlags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        out[a.slice(2)] = args[++i];
      } else {
        out[a.slice(2)] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  shouldAbort: shouldAbort,
  preflightStep: preflightStep,
  recordStep: recordStep,
  checkCostTelemetry: checkCostTelemetry,
  readStateMd: readStateMd,
  ABORT_EXIT: ABORT_EXIT,
  TEMPFAIL_EXIT: TEMPFAIL_EXIT,
  COST_STALE_MS: COST_STALE_MS,
  ADVISORY_REJECTED_STEPS: ADVISORY_REJECTED_STEPS,
};
