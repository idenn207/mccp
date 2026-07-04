'use strict';

// work-context-isolation M1 Task 1 — thin CLI wrapper around the
// dispatch-controller lib so the /mccp:work Step 3 Bash block can drive a
// single-worker implement delegation (prepare → Agent → merge) without the
// controller lib ever calling Agent itself (Agent is only legal in
// conversation context — mirror of dispatch-controller.js:3-18).
//
// Subcommands:
//   prepare-single  — prepareDispatch() with exactly ONE worker + a
//                     self-contained implement worker prompt. Emits the
//                     absolute envelopePath (local read) AND the repo-relative
//                     ipcEnvelopePath (receipt flag) as SEPARATE fields.
//   merge           — read one terminal envelope + mergeEnvelopes([env]) →
//                     {verdict, receiptsAdded, findings, failedWorkers,
//                      invariantViolations}. Detects the F1 invariant
//                      (worker leaked a PR-gate receipt = it ran commit/PR
//                      before the controller's Step 4/5).
//   mark            — worker-side envelope transition (thin passthrough to
//                     dispatch-envelope.markStatus). Kept in this CLI so the
//                     self-contained worker prompt can transition its envelope
//                     with one robust command instead of an inline node -e blob
//                     (Task 0 chose the self-contained worker shape; a Haiku
//                     subagent needs a deterministic, quote-safe helper).
//
// Codex F2 absorption — SYNCHRONOUS single worker uses skipHeartbeat:true.
// The dispatch-controller heartbeat + reclaimStale machinery exists for ASYNC
// fanout where a live controller loop refreshes the heartbeat mtime. Here the
// controller (work.md Step 3) blocks on the Agent/Task return, so it can never
// refresh a heartbeat; a worker running past 15min (same-host far-expired)
// would be reclaimed as `crashed` by another validate-cmd, pairing a SUCCESSFUL
// filesystem change with a FAILED envelope (the F2 race). A synchronous worker
// cannot orphan — if the controller dies the Task dies with it — so we create
// NO heartbeat at all, which removes the envelope from reclaimStale's scan set.
//
// Codex F3 absorption — repo-relative ipc path is emitted SEPARATELY.
// prepareDispatch's envelopePath is `${parentCwd}/.claude/state/dispatches/...`
// (ABSOLUTE). The receipt schema (schema.js ENVELOPE_PATH_RE) only accepts
// `.claude/state/dispatches/<uuid>.envelope.json` (repo-relative) for
// --ipc-envelope-path; forwarding the absolute path fail-closes the receipt
// write. So prepare-single emits `envelopePath` (absolute, for merge/read) and
// `ipcEnvelopePath` (repo-relative, for the worker's receipt --ipc-envelope-path)
// as two distinct fields.

const path = require('path');
const fs = require('fs');

const controller = require('./dispatch-controller');
const envelope = require('./dispatch-envelope');

const OK_EXIT = 0;
const USAGE_EXIT = 2;
const ERROR_EXIT = 1;

// A worker doing implement-only must never produce a PR-gate receipt. If it
// does, it ran commit/PR (Phase 7 auto-chain) inside the isolation boundary —
// the F1 irreversible-external-state risk — and merge HALTs the controller.
const FORBIDDEN_RECEIPT_RE = /(^|\/)mccp-pr-codex\//;

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
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

// Repo-relative canonical envelope path for the receipt --ipc-envelope-path
// flag. MUST match schema.js ENVELOPE_PATH_RE exactly (forward slashes, no
// leading ./). path.posix.join keeps forward slashes on Windows.
function ipcEnvelopeRelPath(dispatchId) {
  return path.posix.join('.claude', 'state', 'dispatches', dispatchId + '.envelope.json');
}

// Self-contained implement worker prompt (Task 0 decision). The worker drives
// the /mccp:prp-implement contract from Phase 2.5 through Phase 4 with its own
// tools — no nested Skill(mccp:prp-implement) dependency. Attribution flags are
// pre-bound to the exact dispatch identity so the worker's receipt anchors to
// the controller session, and the commit/PR guardrail is stated explicitly on
// top of the propagated MCCP_AUTO_CHAIN_DISABLE=1 env.
function buildImplementWorkerBasePrompt(args) {
  args = args || {};
  const planPath = args.planPath;
  const dispatchId = args.dispatchId;
  const ipcEnvelopePath = args.ipcEnvelopePath;
  const controllerSessionId = args.controllerSessionId;

  return [
    'Execute the mccp implementation plan at: ' + planPath,
    '',
    'You are a /mccp:work dispatch worker running the /mccp:prp-implement contract',
    'in an ISOLATED context. Read the command doc at',
    '${CLAUDE_PLUGIN_ROOT}/commands/prp-implement.md and follow it from',
    'Phase 2.5 (IMPLEMENT-CODEX GATE) through Phase 4 (VALIDATE) ONLY.',
    '',
    '── HARD GUARDRAILS (dispatch isolation) ──',
    '- Do NOT run Phase 7 AUTO-CHAIN. Do NOT invoke /mccp:prp-commit or /mccp:pr.',
    '  commit + PR belong to the controller session — a HARD RULE that holds',
    '  regardless of env delivery (the controller disables auto-chain,',
    '  MCCP_AUTO_CHAIN_DISABLE=1). Never write a mccp-pr-codex receipt: the',
    '  controller merge step HALTs if you leak one (F1 invariant).',
    '- On EVERY receipt write (receipt/cli.js write), forward these attribution',
    '  flags VERBATIM so your receipt anchors to the controller session',
    '  (MCCP_DISPATCH_CONTEXT=1 makes them MANDATORY — receipt write is',
    '  fail-closed exit 12 without all three):',
    '    --dispatched-by-controller-session ' + controllerSessionId,
    '    --worker-dispatch-id ' + dispatchId,
    '    --ipc-envelope-path ' + ipcEnvelopePath,
    '',
    '── TERMINAL ENVELOPE (your data channel back to the controller) ──',
    'After VALIDATE finishes (pass OR fail), transition your envelope with:',
    '  node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js mark \\',
    '    --envelope ' + ipcEnvelopePath + ' \\',
    '    --status <ok|failure|timeout|crashed> \\',
    '    --receipts "<comma-separated receipt slugs you wrote>" \\',
    '    --next-action "<one-line handoff note for the controller>"',
    '  status=ok ONLY when every validation level is green; status=failure when',
    '  any level failed. receipts example: mccp-implement-codex/<decision-slug>.json',
    '',
    '── RETURN CONTRACT ──',
    'Return ONLY a compact summary (≤ 10 lines): changed files, verdict, test',
    'result. The envelope carries the full data — do NOT paste diffs or test logs',
    'into your final message (that would defeat the context-isolation purpose).',
  ].join('\n');
}

function cmdPrepareSingle(rest) {
  const planPath = rest['plan'];
  const controllerSessionId = rest['controller-session'];
  const subagentType = rest['subagent'] || 'general-purpose';
  const dryRun = rest['dry-run'] === true;

  if (!planPath) {
    process.stderr.write('prepare-single requires --plan\n');
    return USAGE_EXIT;
  }
  if (!controllerSessionId || controllerSessionId === true) {
    process.stderr.write('prepare-single requires --controller-session <uuid>\n');
    return USAGE_EXIT;
  }
  if (!envelope.UUID_RE.test(controllerSessionId)) {
    process.stderr.write('--controller-session must be a UUID\n');
    return USAGE_EXIT;
  }

  const parentCwd = rest['parent-cwd'] || findRepoRoot(process.cwd());

  // Generate the dispatch id up front so the worker prompt can bind the exact
  // ipc path + attribution before prepareDispatch writes the placeholder.
  const dispatchId = controller.newDispatchId();
  const ipcEnvelopePath = ipcEnvelopeRelPath(dispatchId);
  const basePrompt = buildImplementWorkerBasePrompt({
    planPath: planPath,
    dispatchId: dispatchId,
    ipcEnvelopePath: ipcEnvelopePath,
    controllerSessionId: controllerSessionId,
  });

  // dry-run: skip the real placeholder write (so a bogus --plan path is fine)
  // but still exercise prepareDispatch so the emitted JSON is byte-identical to
  // a live prepare. A no-op envelopeWrite keeps the disk untouched.
  const deps = {
    idGen: function () { return dispatchId; },
  };
  if (dryRun) {
    deps.envelopeWrite = function () { return { ok: true }; };
  }

  let prep;
  try {
    prep = controller.prepareDispatch({
      workers: [{ subagentType: subagentType, prompt: basePrompt }],
      controllerSessionId: controllerSessionId,
      parentCwd: parentCwd,
      skipHeartbeat: true, // Codex F2 — synchronous single worker: no heartbeat.
    }, deps);
  } catch (err) {
    process.stderr.write('prepare-single failed: ' + (err && err.message ? err.message : err) + '\n');
    return ERROR_EXIT;
  }

  const d = prep.dispatches[0];
  emit({
    dispatchId: d.dispatchId,
    subagentType: d.subagentType,
    controllerSessionId: prep.controllerSessionId,
    parentCwd: parentCwd,
    envelopePath: d.envelopePath,        // ABSOLUTE — for `merge`/read
    ipcEnvelopePath: ipcEnvelopePath,    // repo-relative — for receipt --ipc-envelope-path (F3)
    heartbeat: false,                    // Codex F2 — skipHeartbeat:true
    dryRun: dryRun,
    prompt: d.prompt,
    startedAt: prep.startedAt,
  });
  return OK_EXIT;
}

function cmdMerge(rest) {
  const envelopePath = rest['envelope'];
  if (!envelopePath || envelopePath === true) {
    process.stderr.write('merge requires --envelope <path>\n');
    return USAGE_EXIT;
  }

  const readResult = envelope.read(envelopePath);
  if (!readResult.ok) {
    // A missing / invalid envelope is a worker-death signal, not a CLI crash —
    // surface it as a non-ok verdict the controller can HALT on (loud fail).
    emit({
      verdict: 'envelope-unreadable',
      error: readResult.error,
      receiptsAdded: [],
      findings: [],
      failedWorkers: [{ index: 0, reason: 'envelope-unreadable' }],
      invariantViolations: [],
    });
    return OK_EXIT;
  }

  const env = readResult.envelope;
  const merged = controller.mergeEnvelopes([env]);

  // F1 invariant — a leaked PR-gate receipt means the worker ran commit/PR
  // inside the isolation boundary (irreversible external state).
  const invariantViolations = [];
  merged.receiptsAdded.forEach(function (slug) {
    if (FORBIDDEN_RECEIPT_RE.test(slug)) {
      invariantViolations.push({ kind: 'worker-ran-pr-gate', slug: slug });
    }
  });

  let verdict;
  if (invariantViolations.length > 0) {
    verdict = 'invariant-violation';
  } else if (merged.failedWorkers.length > 0) {
    verdict = 'failed';
  } else {
    verdict = 'ok';
  }

  emit({
    verdict: verdict,
    workerExitStatus: env.worker_exit_status,
    dispatchId: env.dispatch_id,
    receiptsAdded: merged.receiptsAdded,
    findings: merged.findings,
    failedWorkers: merged.failedWorkers,
    invariantViolations: invariantViolations,
    nextAction: env.next_action || null,
  });
  return OK_EXIT;
}

function cmdMark(rest) {
  const envelopePath = rest['envelope'];
  const status = rest['status'];
  if (!envelopePath || envelopePath === true) {
    process.stderr.write('mark requires --envelope <path>\n');
    return USAGE_EXIT;
  }
  if (!status || status === true) {
    process.stderr.write('mark requires --status <ok|failure|timeout|crashed>\n');
    return USAGE_EXIT;
  }

  const opts = {};
  if (typeof rest['receipts'] === 'string' && rest['receipts'].length > 0) {
    opts.receiptsAdded = rest['receipts'].split(',')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }
  if (typeof rest['findings-file'] === 'string') {
    try {
      const raw = fs.readFileSync(rest['findings-file'], 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) opts.findings = parsed;
    } catch (err) {
      process.stderr.write('mark: findings-file unreadable/invalid: '
        + (err && err.message ? err.message : err) + '\n');
      return ERROR_EXIT;
    }
  }
  if (typeof rest['next-action'] === 'string' && rest['next-action'].length > 0) {
    opts.nextAction = rest['next-action'];
  }

  const result = envelope.markStatus(envelopePath, status, opts);
  if (!result.ok) {
    process.stderr.write('mark failed: ' + result.error + '\n');
    return ERROR_EXIT;
  }
  emit({ ok: true, envelope: envelopePath, status: status });
  return OK_EXIT;
}

function runCli(argv) {
  if (!argv || argv.length === 0) {
    process.stderr.write(
      'usage: dispatch-cli <prepare-single|merge|mark> [options]\n' +
      '  prepare-single  --plan <path> --controller-session <uuid> [--subagent <type>] [--parent-cwd <path>] [--dry-run]\n' +
      '  merge           --envelope <path>\n' +
      '  mark            --envelope <path> --status <ok|failure|timeout|crashed> [--receipts <csv>] [--findings-file <path>] [--next-action <text>]\n'
    );
    return USAGE_EXIT;
  }
  const cmd = argv[0];
  const rest = parseFlags(argv.slice(1));

  if (cmd === 'prepare-single') return cmdPrepareSingle(rest);
  if (cmd === 'merge') return cmdMerge(rest);
  if (cmd === 'mark') return cmdMark(rest);

  process.stderr.write('unknown subcommand: ' + cmd + '\n');
  return USAGE_EXIT;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  parseFlags: parseFlags,
  findRepoRoot: findRepoRoot,
  ipcEnvelopeRelPath: ipcEnvelopeRelPath,
  buildImplementWorkerBasePrompt: buildImplementWorkerBasePrompt,
  cmdPrepareSingle: cmdPrepareSingle,
  cmdMerge: cmdMerge,
  cmdMark: cmdMark,
  runCli: runCli,
  FORBIDDEN_RECEIPT_RE: FORBIDDEN_RECEIPT_RE,
};
