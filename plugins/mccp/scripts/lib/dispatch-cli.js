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
const { spawnSync } = require('child_process');

const controller = require('./dispatch-controller');
const envelope = require('./dispatch-envelope');
const resultSchema = require('./implement-dispatch/result-schema');
// workflow-orchestration M3 — worktree collect/apply + aggregate verify oracle.
const worktreeMerge = require('./implement-dispatch/worktree-merge');
const verifyOracle = require('./implement-dispatch/verify');

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
  // M2b — optional disjoint-partition scope. When present, the worker owns only
  // its slice of the plan; touching any other file is a partition-escape the
  // controller detects from the real diff. Absent → byte-identical to the M2a
  // single-worker prompt (back-compat).
  const partitionFiles = Array.isArray(args.partitionFiles)
    ? args.partitionFiles.filter(function (f) { return typeof f === 'string' && f.length > 0; })
    : [];
  const partitionTaskIds = Array.isArray(args.partitionTaskIds)
    ? args.partitionTaskIds.filter(function (t) { return typeof t === 'string' && t.length > 0; })
    : [];

  const lines = [
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
  ];

  if (partitionFiles.length > 0) {
    lines.push(
      '',
      '── PARTITION SCOPE (M2b disjoint-partition worker) ──',
      'You own a DISJOINT slice of this plan. Edit ONLY these files:'
    );
    partitionFiles.forEach(function (f) { lines.push('  - ' + f); });
    if (partitionTaskIds.length > 0) {
      lines.push('Implement ONLY these plan tasks: ' + partitionTaskIds.join(', ') + '.');
    }
    lines.push(
      'Touching ANY file outside this list (except an explicitly allowed shared',
      'output) is a PARTITION-ESCAPE: the controller detects it from your real',
      'diff and HALTs the ENTIRE fleet — no partial apply. Stay strictly inside',
      'your slice; sibling workers own the rest.'
    );
  }

  lines.push(
    '',
    '── TERMINAL ENVELOPE (your data channel back to the controller) ──');

  return lines.concat([
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
  ]).join('\n');
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

// workflow-orchestration M2b Task 4 — prepare N disjoint-partition workers in ONE
// prepareDispatch call. Consumes the partition oracle output (--partitions-file)
// + a shared plan path, binds each partition to its own dispatch identity (ipc
// path + attribution), and scopes each worker prompt to its partition's
// files/tasks. skipHeartbeat stays true: the Workflow runtime owns worker
// liveness (Design Decision 5), so the async heartbeat/reclaim machinery is
// redundant on this path. prepareDispatch already accepts a workers array
// (dispatch-controller.js:123-214) — this is "unlock the N that was always
// there", not new fanout plumbing.
function cmdPrepareFleet(rest) {
  const planPath = rest['plan'];
  const controllerSessionId = rest['controller-session'];
  const subagentType = rest['subagent'] || 'general-purpose';
  const partitionsFile = rest['partitions-file'];
  const dryRun = rest['dry-run'] === true;

  if (!planPath || planPath === true) {
    process.stderr.write('prepare-fleet requires --plan\n');
    return USAGE_EXIT;
  }
  if (!controllerSessionId || controllerSessionId === true) {
    process.stderr.write('prepare-fleet requires --controller-session <uuid>\n');
    return USAGE_EXIT;
  }
  if (!envelope.UUID_RE.test(controllerSessionId)) {
    process.stderr.write('--controller-session must be a UUID\n');
    return USAGE_EXIT;
  }
  if (!partitionsFile || partitionsFile === true) {
    process.stderr.write('prepare-fleet requires --partitions-file <json>\n');
    return USAGE_EXIT;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(partitionsFile, 'utf8'));
  } catch (err) {
    process.stderr.write('prepare-fleet: partitions-file unreadable/invalid: '
      + (err && err.message ? err.message : err) + '\n');
    return ERROR_EXIT;
  }
  const partitions = Array.isArray(parsed && parsed.partitions)
    ? parsed.partitions
    : (Array.isArray(parsed) ? parsed : null);
  if (!partitions || partitions.length === 0) {
    process.stderr.write('prepare-fleet: partitions-file has no partitions[]\n');
    return ERROR_EXIT;
  }

  const parentCwd = rest['parent-cwd'] || findRepoRoot(process.cwd());

  // Pre-generate a dispatch id per partition so each prompt binds its exact
  // identity before prepareDispatch writes placeholders.
  const dispatchIds = partitions.map(function () { return controller.newDispatchId(); });
  let idx = 0;
  const idGen = function () { return dispatchIds[idx++]; };

  const workers = partitions.map(function (part, i) {
    const files = Array.isArray(part.files) ? part.files : [];
    const taskIds = Array.isArray(part.taskIds) ? part.taskIds : [];
    const ipc = ipcEnvelopeRelPath(dispatchIds[i]);
    const prompt = buildImplementWorkerBasePrompt({
      planPath: planPath,
      dispatchId: dispatchIds[i],
      ipcEnvelopePath: ipc,
      controllerSessionId: controllerSessionId,
      partitionFiles: files,
      partitionTaskIds: taskIds,
    });
    return { subagentType: subagentType, prompt: prompt };
  });

  const deps = { idGen: idGen };
  if (dryRun) deps.envelopeWrite = function () { return { ok: true }; };

  let prep;
  try {
    prep = controller.prepareDispatch({
      workers: workers,
      controllerSessionId: controllerSessionId,
      parentCwd: parentCwd,
      skipHeartbeat: true, // Design Decision 5 — Workflow owns liveness.
    }, deps);
  } catch (err) {
    process.stderr.write('prepare-fleet failed: '
      + (err && err.message ? err.message : err) + '\n');
    return ERROR_EXIT;
  }

  const outWorkers = prep.dispatches.map(function (d, i) {
    const ipc = ipcEnvelopeRelPath(d.dispatchId);
    return {
      dispatchId: d.dispatchId,
      subagentType: d.subagentType,
      envelopePath: d.envelopePath,       // absolute — reconcile read
      ipcEnvelopePath: ipc,               // repo-relative — receipt --ipc-envelope-path (F3)
      partitionFiles: Array.isArray(partitions[i].files) ? partitions[i].files : [],
      partitionTaskIds: Array.isArray(partitions[i].taskIds) ? partitions[i].taskIds : [],
      prompt: d.prompt,
      expectedAnchor: { sessionId: controllerSessionId, dispatchId: d.dispatchId, ipcPath: ipc },
    };
  });

  emit({
    controllerSessionId: prep.controllerSessionId,
    parentCwd: parentCwd,
    n: outWorkers.length,
    heartbeat: false,
    dryRun: dryRun,
    startedAt: prep.startedAt,
    workers: outWorkers,
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

  // M2b — fleet shape. A prepare-fleet emit carries a `workers` array; reshape it
  // into `args.fleet` (per-worker prompt array the Workflow parallel() consumes)
  // + `reconcileInputs` (per-worker deriveVerdict/mergeVerdicts inputs work.md
  // needs after the fleet returns). `minRemaining` (optional, from resolveFleet)
  // rides along for the Workflow budget pre-guard.
  if (Array.isArray(prep.workers)) {
    const minRemaining = (function () {
      const raw = rest['min-remaining'];
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    })();
    const bad = [];
    const fleet = [];
    const reconcileInputs = [];
    prep.workers.forEach(function (w, i) {
      if (!w || typeof w.prompt !== 'string' || w.prompt.length === 0
          || typeof w.dispatchId !== 'string' || w.dispatchId.length === 0
          || typeof w.ipcEnvelopePath !== 'string' || w.ipcEnvelopePath.length === 0) {
        bad.push(i);
        return;
      }
      fleet.push({
        workerPrompt: w.prompt,
        agentType: (typeof w.subagentType === 'string' && w.subagentType.length > 0)
          ? w.subagentType : 'general-purpose',
        dispatchId: w.dispatchId,
        ipcEnvelopePath: w.ipcEnvelopePath,
      });
      reconcileInputs.push({
        dispatchId: w.dispatchId,
        ipcEnvelopePath: w.ipcEnvelopePath,
        envelopePath: w.envelopePath || null,
        partitionFiles: Array.isArray(w.partitionFiles) ? w.partitionFiles : [],
        expectedAnchor: (w.expectedAnchor && typeof w.expectedAnchor === 'object')
          ? w.expectedAnchor
          : { sessionId: prep.controllerSessionId, dispatchId: w.dispatchId, ipcPath: w.ipcEnvelopePath },
      });
    });
    if (bad.length > 0 || fleet.length === 0) {
      process.stderr.write('emit-workflow-args: fleet workers malformed at index/es: '
        + bad.join(',') + '\n');
      return ERROR_EXIT;
    }
    emit({
      fleet: fleet,
      minRemaining: minRemaining,
      controllerSessionId: prep.controllerSessionId,
      reconcileInputs: reconcileInputs,
    });
    return OK_EXIT;
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

// M2b Task 4 (Codex F2) — collect a worker's ACTUAL changed + untracked files
// from its worktree via `git status --porcelain`, so partition-escape is judged
// on the real diff, not the prompt guardrail. Returns null when the worktree
// path is absent/unreadable → mergeVerdicts then skips the escape check for that
// worker (rather than fabricating a false pass). Rename lines ("old -> new") keep
// the destination path.
function collectChangedFiles(worktreePath) {
  if (typeof worktreePath !== 'string' || worktreePath.length === 0) return null;
  let out;
  try {
    const r = spawnSync('git', ['-C', worktreePath, 'status', '--porcelain'],
      { encoding: 'utf8' });
    if (r.status !== 0) return null;
    out = r.stdout || '';
  } catch (_) {
    return null;
  }
  const files = [];
  out.split(/\r?\n/).forEach(function (line) {
    if (line.length < 4) return;
    let p = line.slice(3).trim();
    const arrow = p.indexOf(' -> ');
    if (arrow !== -1) p = p.slice(arrow + 4).trim();
    // strip surrounding quotes git adds for paths with spaces/unicode
    if (p.length >= 2 && p[0] === '"' && p[p.length - 1] === '"') p = p.slice(1, -1);
    if (p.length > 0 && files.indexOf(p) === -1) files.push(p);
  });
  return files;
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

// M2b Task 4 — N-way reconcile. Assembles the per-worker mergeVerdicts input
// (return ∧ envelope ∧ store ∧ actual-diff) for every reconcileInput, then runs
// the fail-closed aggregate. Result source per worker: --results-dir/<id>.json
// (Workflow return) OR --from-envelope mirror (Task path). Actual files for the
// partition-escape check come from --actual-files-map (direct inject) or
// --worktree-map (git collect); absent → escape check skipped for that worker.
function cmdReconcileFleet(rest, wfArgs) {
  const repoRoot = (typeof rest['repo-root'] === 'string' && rest['repo-root'].length > 0)
    ? rest['repo-root'] : findRepoRoot(process.cwd());
  const resultsDir = (typeof rest['results-dir'] === 'string' && rest['results-dir'].length > 0)
    ? rest['results-dir'] : null;
  const fromEnvelope = rest['from-envelope'] === true;

  let actualFilesMap = null;
  if (typeof rest['actual-files-map'] === 'string' && rest['actual-files-map'].length > 0) {
    try { actualFilesMap = JSON.parse(fs.readFileSync(rest['actual-files-map'], 'utf8')); }
    catch (err) {
      process.stderr.write('reconcile: actual-files-map unreadable/invalid: '
        + (err && err.message ? err.message : err) + '\n');
      return ERROR_EXIT;
    }
  }
  let worktreeMap = null;
  if (typeof rest['worktree-map'] === 'string' && rest['worktree-map'].length > 0) {
    try { worktreeMap = JSON.parse(fs.readFileSync(rest['worktree-map'], 'utf8')); }
    catch (err) {
      process.stderr.write('reconcile: worktree-map unreadable/invalid: '
        + (err && err.message ? err.message : err) + '\n');
      return ERROR_EXIT;
    }
  }
  const sharedAllowlist = (typeof rest['shared-allowlist'] === 'string' && rest['shared-allowlist'].length > 0)
    ? rest['shared-allowlist'].split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    : [];

  const perWorker = wfArgs.reconcileInputs.map(function (inp) {
    inp = inp || {};
    const dispatchId = inp.dispatchId;

    let env = null;
    if (typeof inp.envelopePath === 'string' && inp.envelopePath.length > 0) {
      const r = envelope.read(inp.envelopePath);
      if (r.ok) env = r.envelope;
    }

    let result = null;
    if (resultsDir && typeof dispatchId === 'string') {
      const rp = path.join(resultsDir, dispatchId + '.json');
      try {
        const parsed = JSON.parse(fs.readFileSync(rp, 'utf8'));
        result = (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && ('result' in parsed))
          ? parsed.result : parsed;
      } catch (_) { /* missing → deriveVerdict → result-unreadable for this worker */ }
    } else if (fromEnvelope && env) {
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

    let actualFiles;
    if (actualFilesMap && Array.isArray(actualFilesMap[dispatchId])) {
      actualFiles = actualFilesMap[dispatchId];
    } else if (worktreeMap && typeof worktreeMap[dispatchId] === 'string') {
      const collected = collectChangedFiles(worktreeMap[dispatchId]);
      if (collected) actualFiles = collected;
    }

    const entry = {
      result: result,
      envelope: env,
      receiptStore: receiptStore,
      expectedAnchor: inp.expectedAnchor || null,
      partitionFiles: Array.isArray(inp.partitionFiles) ? inp.partitionFiles : [],
      sharedAllowlist: sharedAllowlist,
    };
    if (actualFiles !== undefined) entry.actualFiles = actualFiles;
    return entry;
  });

  emit(resultSchema.mergeVerdicts(perWorker));
  return OK_EXIT;
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

  // M2b — N-way reconcile. A fleet args file carries `reconcileInputs`; run
  // deriveVerdict per worker (return ∧ envelope ∧ store) + the F2 partition-
  // escape check (real diff ⊆ partition ∪ allowlist), then mergeVerdicts
  // fail-closed. This runs on the ISOLATED-worktree results BEFORE any merge-back
  // (Codex F1 — the caller only merges when the aggregate is ok).
  if (Array.isArray(wfArgs.reconcileInputs)) {
    return cmdReconcileFleet(rest, wfArgs);
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

// ── M3 helpers ────────────────────────────────────────────────────────────────

function readJsonFileOr(p, fallback) {
  if (typeof p !== 'string' || p.length === 0) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; }
}

function normResolve(p) {
  let r;
  try { r = path.resolve(p); } catch (_) { return null; }
  if (/^[A-Za-z]:/.test(r)) r = r[0].toLowerCase() + r.slice(1);
  return r.replace(/\\/g, '/');
}

// Minimal `git worktree list --porcelain` parse — path per block (leading
// `worktree <path>` line), skip bare. Kept local to avoid a lib→derive dep
// (mirror of derive/sources/worktrees.js parseWorktreePorcelain).
function parseWorktreeListPorcelain(stdout) {
  if (typeof stdout !== 'string' || stdout.length === 0) return [];
  const out = [];
  stdout.replace(/\r\n/g, '\n').split(/\n[ \t]*\n+/).forEach(function (block) {
    let p = null; let bare = false;
    block.split('\n').forEach(function (line) {
      const l = line.trim();
      if (l.indexOf('worktree ') === 0) p = l.slice('worktree '.length).trim();
      else if (l === 'bare') bare = true;
    });
    if (p && !bare) out.push({ path: p });
  });
  return out;
}

function normFileArg(f) { return typeof f === 'string' ? f.replace(/\\/g, '/').trim() : ''; }

function csvArg(v) {
  return (typeof v === 'string' && v.length > 0)
    ? v.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
}

// collect-worktrees — enumerate worktrees, correlate to expected dispatchIds via
// each worktree's envelope, emit {map, missing, ambiguous, unmatchedWorktrees}.
// --out writes just the {dispatchId: worktreePath} map (the reconcile /
// merge-apply --worktree-map consumable). Missing/ambiguous → ERROR_EXIT so the
// caller HALTs a lost/duplicated worker (Codex F1: no silent drop).
function cmdCollectWorktrees(rest) {
  const repoRoot = (typeof rest['repo-root'] === 'string' && rest['repo-root'].length > 0)
    ? rest['repo-root'] : findRepoRoot(process.cwd());
  let dispatchIds = [];
  if (typeof rest['dispatch-ids-file'] === 'string' && rest['dispatch-ids-file'].length > 0) {
    dispatchIds = readJsonFileOr(rest['dispatch-ids-file'], null);
    if (!Array.isArray(dispatchIds)) {
      process.stderr.write('collect-worktrees: --dispatch-ids-file must hold a JSON array\n');
      return ERROR_EXIT;
    }
  } else if (typeof rest['dispatch-ids'] === 'string' && rest['dispatch-ids'].length > 0) {
    const raw = rest['dispatch-ids'].trim();
    if (raw[0] === '[') {
      try { dispatchIds = JSON.parse(raw); } catch (_) { dispatchIds = csvArg(raw); }
    } else {
      dispatchIds = csvArg(raw);
    }
  }
  if (!Array.isArray(dispatchIds) || dispatchIds.length === 0) {
    process.stderr.write('collect-worktrees requires --dispatch-ids <csv|json> or --dispatch-ids-file <path>\n');
    return USAGE_EXIT;
  }

  const r = spawnSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write('collect-worktrees: git worktree list failed: ' + (r.stderr || '') + '\n');
    return ERROR_EXIT;
  }
  const selfNorm = normResolve(repoRoot);
  const worktrees = parseWorktreeListPorcelain(r.stdout || '')
    .filter(function (w) { return normResolve(w.path) !== selfNorm; });

  const result = worktreeMerge.buildWorktreeMap({ worktrees: worktrees, dispatchIds: dispatchIds });
  if (typeof rest.out === 'string' && rest.out.length > 0) {
    try { fs.writeFileSync(rest.out, JSON.stringify(result.map, null, 2)); }
    catch (err) {
      process.stderr.write('collect-worktrees: --out write failed: ' + (err && err.message) + '\n');
      return ERROR_EXIT;
    }
  }
  emit(result);
  return (result.missing.length > 0 || result.ambiguous.length > 0) ? ERROR_EXIT : OK_EXIT;
}

// merge-apply — collect each worker's diff, F2 subset re-confirm (actual ⊆
// partition ∪ allowlist), pre-apply clean assert on the union of target paths,
// then applyDisjointDiffs. --patches-out records the applied patches (JSON array)
// so a later verify HALT reverses them via rollback-apply. Verdict-gating is the
// CALLER's job (work.md runs reconcile/mergeVerdicts BEFORE this — Codex F1).
function cmdMergeApply(rest) {
  const repoRoot = (typeof rest['repo-root'] === 'string' && rest['repo-root'].length > 0)
    ? rest['repo-root'] : findRepoRoot(process.cwd());
  const dryRun = rest['dry-run'] === true;
  const worktreeMap = readJsonFileOr(rest['worktree-map'], null);
  if (!worktreeMap || typeof worktreeMap !== 'object') {
    process.stderr.write('merge-apply requires --worktree-map <path> (a {dispatchId: worktreePath} JSON)\n');
    return USAGE_EXIT;
  }
  const partitions = readJsonFileOr(rest['partitions-file'], null); // {dispatchId: [files]}
  const sharedAllowlist = csvArg(rest['shared-allowlist']);
  const ids = Object.keys(worktreeMap);

  const diffs = [];
  const escapes = [];
  const allFiles = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const c = worktreeMerge.collectWorkerDiff(worktreeMap[id]);
    if (!c.ok) {
      emit({ ok: false, reason: 'collect-failed', dispatchId: id, error: c.error });
      return ERROR_EXIT;
    }
    if (partitions && Array.isArray(partitions[id])) {
      const allowed = Object.create(null);
      partitions[id].concat(sharedAllowlist).forEach(function (f) {
        const n = normFileArg(f); if (n) allowed[n] = true;
      });
      c.files.forEach(function (f) {
        const n = normFileArg(f);
        if (n && !allowed[n]) escapes.push({ dispatchId: id, file: n });
      });
    }
    c.files.forEach(function (f) {
      const n = normFileArg(f);
      if (n && allFiles.indexOf(n) === -1) allFiles.push(n);
    });
    diffs.push(c.diff);
  }
  if (escapes.length > 0) {
    emit({ ok: false, reason: 'partition-escape', escapes: escapes });
    return ERROR_EXIT;
  }

  const clean = worktreeMerge.assertPathsClean({ paths: allFiles, cwd: repoRoot });
  if (!clean.clean) {
    emit({ ok: false, reason: 'pre-apply-dirty', dirty: clean.dirty, error: clean.error || null });
    return ERROR_EXIT;
  }

  const applied = worktreeMerge.applyDisjointDiffs({ diffs: diffs, cwd: repoRoot, dryRun: dryRun });
  if (applied.ok && !dryRun && typeof rest['patches-out'] === 'string' && rest['patches-out'].length > 0) {
    try { fs.writeFileSync(rest['patches-out'], JSON.stringify(applied.appliedPatches)); }
    catch (err) {
      emit({ ok: false, reason: 'patches-out-write-failed', error: (err && err.message) || String(err) });
      return ERROR_EXIT;
    }
  }
  emit({
    ok: applied.ok, applied: applied.applied, dryRun: !!applied.dryRun,
    files: allFiles, appliedPatchCount: applied.appliedPatches ? applied.appliedPatches.length : 0,
    error: applied.error,
  });
  return applied.ok ? OK_EXIT : ERROR_EXIT;
}

// rollback-apply — patch-scoped reverse-apply of the merge-apply --patches-out
// artifact (verify HALT recovery). NEVER broad checkout/clean (F4).
function cmdRollbackApply(rest) {
  const repoRoot = (typeof rest['repo-root'] === 'string' && rest['repo-root'].length > 0)
    ? rest['repo-root'] : findRepoRoot(process.cwd());
  const patches = readJsonFileOr(rest['patches-file'], null);
  if (!Array.isArray(patches)) {
    process.stderr.write('rollback-apply requires --patches-file <path> (a JSON array of patch strings)\n');
    return USAGE_EXIT;
  }
  const r = worktreeMerge.rollbackApplied({ appliedPatches: patches, cwd: repoRoot });
  emit(r);
  return r.ok ? OK_EXIT : ERROR_EXIT;
}

// verify-focus — assemble the codex-invoke adversarial-review focus for the
// aggregate verify stage. --partitions-file is a JSON array of {files:[]} (the
// buildVerifyFocus shape).
function cmdVerifyFocus(rest) {
  const base = (typeof rest.base === 'string' && rest.base.length > 0) ? rest.base : 'HEAD';
  let changedFiles = [];
  if (typeof rest['changed-files-file'] === 'string' && rest['changed-files-file'].length > 0) {
    const arr = readJsonFileOr(rest['changed-files-file'], []);
    changedFiles = Array.isArray(arr) ? arr : [];
  } else if (typeof rest['changed-files'] === 'string') {
    changedFiles = csvArg(rest['changed-files']);
  }
  const partitions = readJsonFileOr(rest['partitions-file'], []);
  const workerFindings = readJsonFileOr(rest['findings-file'], []);
  const focus = verifyOracle.buildVerifyFocus({
    changedFiles: changedFiles,
    partitions: Array.isArray(partitions) ? partitions : [],
    workerFindings: Array.isArray(workerFindings) ? workerFindings : [],
    base: base,
  });
  emit({ focus: focus });
  return OK_EXIT;
}

// verify-decide — map the codex-invoke JSON → merged-verify verdict + block.
// An unreadable/absent codex-json fails CLOSED (deriveVerdictFromCodex → unavailable
// → enforce blocks). --verdict overrides (pre-parsed by the caller); --mode/--rounds
// optional.
function cmdVerifyDecide(rest) {
  const input = {};
  if (typeof rest['codex-json'] === 'string' && rest['codex-json'].length > 0) {
    input.codexJson = readJsonFileOr(rest['codex-json'], null);
  }
  if (typeof rest.mode === 'string' && rest.mode.length > 0) input.mode = rest.mode;
  if (typeof rest.verdict === 'string' && rest.verdict.length > 0) input.verdict = rest.verdict;
  if (rest.rounds !== undefined && rest.rounds !== true) {
    const n = parseInt(rest.rounds, 10);
    if (Number.isFinite(n)) input.rounds = n;
  }
  emit(verifyOracle.decideMergedVerify(input));
  return OK_EXIT;
}

function runCli(argv) {
  if (!argv || argv.length === 0) {
    process.stderr.write(
      'usage: dispatch-cli <prepare-single|prepare-fleet|emit-workflow-args|reconcile|merge|mark|collect-worktrees|merge-apply|rollback-apply|verify-focus|verify-decide> [options]\n' +
      '  prepare-single      --plan <path> --controller-session <uuid> [--subagent <type>] [--parent-cwd <path>] [--dry-run]\n' +
      '  prepare-fleet       --plan <path> --controller-session <uuid> --partitions-file <json> [--subagent <type>] [--parent-cwd <path>] [--dry-run]\n' +
      '  emit-workflow-args  --prepare-file <path> [--min-remaining <n>]\n' +
      '  reconcile           --args-file <path> [--envelope <abs>] [--result-file <path>] [--from-envelope] [--repo-root <path>]\n' +
      '                      (fleet) --args-file <fleet emit> [--results-dir <dir>] [--from-envelope] [--actual-files-map <json>] [--worktree-map <json>] [--shared-allowlist <csv>] [--repo-root <path>]\n' +
      '  merge               --envelope <path>\n' +
      '  mark                --envelope <path> --status <ok|failure|timeout|crashed> [--receipts <csv>] [--findings-file <path>] [--next-action <text>]\n' +
      '  collect-worktrees   --dispatch-ids <csv|json> | --dispatch-ids-file <path> [--repo-root <path>] [--out <path>]  (M3)\n' +
      '  merge-apply         --worktree-map <path> [--partitions-file <json>] [--shared-allowlist <csv>] [--repo-root <path>] [--patches-out <path>] [--dry-run]  (M3)\n' +
      '  rollback-apply      --patches-file <path> [--repo-root <path>]  (M3)\n' +
      '  verify-focus        --base <ref> [--changed-files <csv> | --changed-files-file <path>] [--partitions-file <json>] [--findings-file <json>]  (M3)\n' +
      '  verify-decide       --codex-json <path> [--mode off|warn|enforce] [--verdict <enum>] [--rounds <N>]  (M3)\n'
    );
    return USAGE_EXIT;
  }
  const cmd = argv[0];
  const rest = parseFlags(argv.slice(1));

  if (cmd === 'prepare-single') return cmdPrepareSingle(rest);
  if (cmd === 'prepare-fleet') return cmdPrepareFleet(rest);
  if (cmd === 'emit-workflow-args') return cmdEmitWorkflowArgs(rest);
  if (cmd === 'reconcile') return cmdReconcile(rest);
  if (cmd === 'merge') return cmdMerge(rest);
  if (cmd === 'mark') return cmdMark(rest);
  if (cmd === 'collect-worktrees') return cmdCollectWorktrees(rest);
  if (cmd === 'merge-apply') return cmdMergeApply(rest);
  if (cmd === 'rollback-apply') return cmdRollbackApply(rest);
  if (cmd === 'verify-focus') return cmdVerifyFocus(rest);
  if (cmd === 'verify-decide') return cmdVerifyDecide(rest);

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
  cmdPrepareFleet: cmdPrepareFleet,
  cmdEmitWorkflowArgs: cmdEmitWorkflowArgs,
  cmdReconcile: cmdReconcile,
  cmdReconcileFleet: cmdReconcileFleet,
  cmdMerge: cmdMerge,
  cmdMark: cmdMark,
  cmdCollectWorktrees: cmdCollectWorktrees,
  cmdMergeApply: cmdMergeApply,
  cmdRollbackApply: cmdRollbackApply,
  cmdVerifyFocus: cmdVerifyFocus,
  cmdVerifyDecide: cmdVerifyDecide,
  parseWorktreeListPorcelain: parseWorktreeListPorcelain,
  readReceiptStore: readReceiptStore,
  collectChangedFiles: collectChangedFiles,
  runCli: runCli,
  FORBIDDEN_RECEIPT_RE: FORBIDDEN_RECEIPT_RE,
};
