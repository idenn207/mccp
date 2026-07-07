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
//   emit-workflow-args — (M2a) re-shape a prepare-single emit into the `args`
//                     object scripts/workflows/implement-dispatch.js consumes,
//                     plus the deriveVerdict reconciliation inputs (envelope
//                     paths + expectedAnchor). Keeps work.md shell-state
//                     independent (one JSON artifact, no carried shell vars).
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
const resultSchema = require('./implement-dispatch/result-schema');

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
    '── RETURN CONTRACT (structured return + envelope mirror) ──',
    'The envelope you marked above is the durable IPC channel. In ADDITION, your',
    'FINAL output MUST be ONE compact JSON object — the controller reconciles it',
    'against the envelope, so the two MUST AGREE (a disagreement HALTs the chain):',
    '  {',
    '    "status": "<ok|failure|timeout|crashed>",        // SAME value you marked on the envelope',
    '    "receiptsAdded": ["<receipt slugs you wrote>"],  // SAME slugs you passed to `mark --receipts`',
    '    "changedFiles": ["<repo-relative paths you edited>"],',
    '    "testResult": "<one-line validation summary, e.g. \'590 pass\'>",',
    '    "nextAction": "<one-line handoff note for the controller, or null>"',
    '  }',
    'status=ok ONLY when every validation level is green. Do NOT paste diffs or',
    'full test logs — the envelope carries detail; this object is the',
    'reconciliation trigger, NOT a place to dump context (that would defeat the',
    'context-isolation purpose).',
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

// workflow-orchestration M2a Task 1 — re-shape a `prepare-single` emit into the
// `args` object the scripts/workflows/implement-dispatch.js Workflow consumes,
// plus the post-hoc reconciliation inputs work.md needs after the Workflow
// returns. Emitting this as a SEPARATE artifact keeps work.md shell-state
// independent (§3.9): the Bash block reads one JSON file instead of threading
// prepare fields through carried shell vars across separate invocations.
//
// The emitted expectedAnchor is the F3 anchor-verification input for
// result-schema.js deriveVerdict — it binds the exact controller identity the
// worker's receipt must carry (marker + 3 flags), so a de-anchored receipt
// HALTs instead of silently defeating dual-review.
function cmdEmitWorkflowArgs(rest) {
  const prepareFile = rest['prepare-file'];
  if (!prepareFile || prepareFile === true) {
    process.stderr.write('emit-workflow-args requires --prepare-file <path>\n');
    return USAGE_EXIT;
  }
  let prep;
  try {
    prep = JSON.parse(fs.readFileSync(prepareFile, 'utf8'));
  } catch (err) {
    process.stderr.write('emit-workflow-args: prepare-file unreadable/invalid: '
      + (err && err.message ? err.message : err) + '\n');
    return ERROR_EXIT;
  }
  const required = ['dispatchId', 'ipcEnvelopePath', 'controllerSessionId', 'prompt'];
  const missing = required.filter(function (k) {
    return typeof prep[k] !== 'string' || prep[k].length === 0;
  });
  if (missing.length > 0) {
    process.stderr.write('emit-workflow-args: prepare-file missing/blank fields: '
      + missing.join(', ') + '\n');
    return ERROR_EXIT;
  }
  emit({
    workerPrompt: prep.prompt,
    agentType: (typeof prep.subagentType === 'string' && prep.subagentType.length > 0)
      ? prep.subagentType : 'general-purpose',
    dispatchId: prep.dispatchId,
    ipcEnvelopePath: prep.ipcEnvelopePath,          // repo-relative — envelope read + anchor
    envelopePath: prep.envelopePath || null,        // absolute — local envelope read in work.md
    controllerSessionId: prep.controllerSessionId,
    expectedAnchor: {                               // F3 anchor-verification input for deriveVerdict
      sessionId: prep.controllerSessionId,
      dispatchId: prep.dispatchId,
      ipcPath: prep.ipcEnvelopePath,
    },
  });
  return OK_EXIT;
}

// Read every receipt named in `slugs` off disk, keyed by slug. A slug absent
// from the store maps to nothing — deriveVerdict then fails an implement-codex
// slug closed (unanchored: cannot verify) while ignoring non-implement slugs.
function readReceiptStore(slugs, repoRoot) {
  const store = {};
  slugs.forEach(function (slug) {
    if (typeof slug !== 'string' || slug.length === 0) return;
    const p = path.join(repoRoot, '.claude', 'receipts', slug);
    try {
      store[slug] = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (_) { /* absent/invalid → deriveVerdict flags unanchored for implement slugs */ }
  });
  return store;
}

// workflow-orchestration M2a Task 3 — the UNIFIED reconcile+anchor gate for BOTH
// isolation paths (Workflow and Task). It reads the envelope + the receipt store,
// builds the `result` object (from the Workflow return file, OR mirrored from the
// envelope on the Task path), then runs the pure deriveVerdict oracle. This is
// the caller-side fs-read leg the oracle contract requires; it supersedes the
// envelope-only `merge` gate by adding the F1 invariant + F2 3-way reconciliation
// + F3 anchor verification on both paths.
//
//   --envelope <abs>       absolute envelope path (prepare.json envelopePath)
//   --args-file <path>     dispatch-workflow-args.json (expectedAnchor + paths)
//   --result-file <path>   Workflow return {result, dispatchId} (Workflow path)
//   --from-envelope        mirror `result` from the envelope (Task path)
//   --repo-root <path>     receipts root override (default: findRepoRoot)
function cmdReconcile(rest) {
  const argsFile = rest['args-file'];
  if (!argsFile || argsFile === true) {
    process.stderr.write('reconcile requires --args-file <path>\n');
    return USAGE_EXIT;
  }
  let wfArgs;
  try {
    wfArgs = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
  } catch (err) {
    process.stderr.write('reconcile: args-file unreadable/invalid: '
      + (err && err.message ? err.message : err) + '\n');
    return ERROR_EXIT;
  }
  const expectedAnchor = (wfArgs && typeof wfArgs === 'object') ? wfArgs.expectedAnchor : null;
  const repoRoot = (typeof rest['repo-root'] === 'string' && rest['repo-root'].length > 0)
    ? rest['repo-root'] : findRepoRoot(process.cwd());

  // Read the envelope (null when unreadable → deriveVerdict fail-closes).
  let env = null;
  const envelopePath = rest['envelope'];
  if (typeof envelopePath === 'string' && envelopePath.length > 0) {
    const r = envelope.read(envelopePath);
    if (r.ok) env = r.envelope;
  }

  // Build `result`: from the Workflow return file, or mirror the envelope (Task).
  let result = null;
  const resultFile = rest['result-file'];
  const fromEnvelope = rest['from-envelope'] === true;
  if (typeof resultFile === 'string' && resultFile.length > 0) {
    try {
      const parsed = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      // The Workflow returns { result, dispatchId }; unwrap to the schema object.
      result = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && ('result' in parsed))
        ? parsed.result : parsed;
    } catch (err) {
      process.stderr.write('reconcile: result-file unreadable/invalid: '
        + (err && err.message ? err.message : err) + '\n');
      // leave result null → deriveVerdict → result-unreadable
    }
  } else if (fromEnvelope && env) {
    // Task path has no structured return — mirror the envelope so the F2 reconcile
    // steps pass trivially while the F1 invariant + F3 anchor checks still apply.
    result = {
      status: env.worker_exit_status,
      receiptsAdded: Array.isArray(env.receipts_added) ? env.receipts_added.slice() : [],
      changedFiles: [],
      testResult: '(Task path — detail in envelope)',
      nextAction: (typeof env.next_action === 'string' && env.next_action.length > 0)
        ? env.next_action : null,
    };
  }

  const slugSet = Object.create(null);
  if (result && Array.isArray(result.receiptsAdded)) {
    result.receiptsAdded.forEach(function (s) { if (s) slugSet[s] = 1; });
  }
  if (env && Array.isArray(env.receipts_added)) {
    env.receipts_added.forEach(function (s) { if (s) slugSet[s] = 1; });
  }
  const receiptStore = readReceiptStore(Object.keys(slugSet), repoRoot);

  const verdict = resultSchema.deriveVerdict({
    result: result,
    envelope: env,
    receiptStore: receiptStore,
    expectedAnchor: expectedAnchor,
  });
  emit(verdict);
  return OK_EXIT;
}

function runCli(argv) {
  if (!argv || argv.length === 0) {
    process.stderr.write(
      'usage: dispatch-cli <prepare-single|emit-workflow-args|reconcile|merge|mark> [options]\n' +
      '  prepare-single      --plan <path> --controller-session <uuid> [--subagent <type>] [--parent-cwd <path>] [--dry-run]\n' +
      '  emit-workflow-args  --prepare-file <path>\n' +
      '  reconcile           --args-file <path> [--envelope <abs>] [--result-file <path>] [--from-envelope] [--repo-root <path>]\n' +
      '  merge               --envelope <path>\n' +
      '  mark                --envelope <path> --status <ok|failure|timeout|crashed> [--receipts <csv>] [--findings-file <path>] [--next-action <text>]\n'
    );
    return USAGE_EXIT;
  }
  const cmd = argv[0];
  const rest = parseFlags(argv.slice(1));

  if (cmd === 'prepare-single') return cmdPrepareSingle(rest);
  if (cmd === 'emit-workflow-args') return cmdEmitWorkflowArgs(rest);
  if (cmd === 'reconcile') return cmdReconcile(rest);
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
  cmdEmitWorkflowArgs: cmdEmitWorkflowArgs,
  cmdReconcile: cmdReconcile,
  cmdMerge: cmdMerge,
  cmdMark: cmdMark,
  readReceiptStore: readReceiptStore,
  runCli: runCli,
  FORBIDDEN_RECEIPT_RE: FORBIDDEN_RECEIPT_RE,
};
