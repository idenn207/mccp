#!/usr/bin/env node
'use strict';

// codex-runner — orchestrates the Codex-review subphase end-to-end so pr.md
// can replace its Bash block with one helper-path call.
//
// v0.2.8 Task 2.6.1-followup F10 + F11 R3-F2 — single owner of the
// ownership_token lifecycle: capture from cmdEnter via anonymous-pipe IPC,
// pipe to cmdHeartbeat / cmdExit via stdin. Token NEVER appears in argv,
// env, or filesystem (stdout-pipe-ipc.js contract).
//
// Modes:
//   (default / --mode run)    — main orchestration
//   --mode heartbeat          — internal: forked child that runs the
//                               heartbeat loop. Reads token from stdin.
//
// Argv (--mode run):
//   --base <branch>                    REQUIRED
//   --decision <slug>                  REQUIRED
//   --body-file <path>                 REQUIRED — body draft path
//   [--skip-reason <text>]             Phase 0.2 MCCP_PR_SKIP_CODEX_REVIEW
//   [--dedupe]                         Phase 2.5.2 produced skip_safe=true
//   [--codex-invoke <path>]            override (tests)
//   [--lock-cli <path>]                override (tests)
//   [--timeout-ms <int>]               default 900000
//   [--heartbeat-ms <int>]             default 10000
//   [--cwd <path>]
// Stdout (JSON):
//   { ok, codex_outcome, codex_rounds, codex_summary, codex_actionable_findings,
//     codex_verdict, codex_findings, lock_exit_ok, mutations, run_id,
//     helper_manifest, codex_skip_reason }

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const { parseArgs, locateLockCli, emit, fail } = require('./_args');
const { spawnAndCaptureToken, spawnAndPipeToken } = require('./stdout-pipe-ipc');
// v0.3.6 Task 8 (축 1 wire-up): scope split detection + output filter.
const impeccableDetect = require('../impeccable-detect');
const { filterDesignFindings, computeDroppedDigest } = require('../codex-result-filter');
// v1.22.3 M3 follow-up (F5) — the structured reader now lives in one module so
// plan / implement / pr all read `.result.verdict` the same way. This file used
// to own a private copy; plan.md and prp-implement.md had no access to it and
// fell back to a free-text keyword scan that mis-read this cycle's own review.
const { parseReviewPayload, APPROVING_VERDICTS } = require('../codex-review-payload');
const envValue = require('../env-contract/value');

const NODE = process.execPath;

function locateCodexInvoke() {
  const root = process.env.CLAUDE_PLUGIN_ROOT
    || path.resolve(__dirname, '..', '..', '..');
  return path.join(root, 'scripts', 'lib', 'codex-invoke.js');
}

// v1.22.3 M3 — READ THE ACTUAL REVIEW (PR-Codex gate blindness fix).
//
// codex-invoke.js's ok-path envelope is
//   { ok, stdout, stderr, durationMs, classification, blocking, advisory }
// The review itself lives entirely inside `.stdout` as the companion's JSON text.
// The envelope has NO `summary`, NO `conclusion`, and NO `findings` of its own.
//
// This helper used to read `codexJson.summary || codexJson.conclusion` (always
// undefined → empty summary) and hand the ENVELOPE to filterDesignFindings, which
// looks for `.findings` (never present → malformed-input path → []). The result:
// `codex_actionable_findings` was structurally ALWAYS false, so a `needs-attention`
// verdict was rubber-stamped and the PR body's 합치 결론 was always blank —
// i.e. the PR gate verified only THAT Codex ran, never WHAT it concluded.
// Measured live on the v1.22.3 M3 branch: runner said actionable=false while the
// same diff's raw stdout carried verdict="needs-attention" + a HIGH finding.
//
// The original note here claimed "plan.md / prp-implement.md already parse
// `.stdout` correctly (via codex-bridge.parseVerdict)" and then, two lines later,
// that parseVerdict "is a free-TEXT keyword scan and does NOT recognize the
// STRUCTURED verdict vocabulary". Both cannot hold. The second is the true one:
// M3 fixed the PR gate and mis-recorded the other two as already-correct while
// they stayed blind (F5). parseReviewPayload + APPROVING_VERDICTS now come from
// codex-review-payload.js, which all three gates share.

// deriveEffectiveReview(review, filtered) → { actionable, scopeExcluded }
//
// v1.22.3 M3 follow-up (PR-Codex R1 F1) — the post-filter EFFECTIVE verdict.
//
// The predecessor (isActionable) short-circuited to `true` on any non-approving
// verdict BEFORE looking at the surviving findings. That path was unreachable
// before M3 (isActionable was structurally always false — the runner read the
// envelope, not the review), and M3's verdict-read fix ACTIVATED it. Consequence:
// when Codex returned needs-attention purely because of design/a11y findings, the
// design-scope filter dropped every one of them and the PR was still sealed as
// `divergent` with zero in-scope evidence — the opposite of what the design-scope
// preamble contract promises. This PR opened that door, so this PR closes it.
//
// SCOPE-EXCLUSION EXPLAINS A BLOCK; IT DOES NOT MAKE A PASS (Implement-Codex R1 F4).
//
// The first cut of this oracle let row 5 below flip `actionable` to false: a
// non-approving review whose every itemized finding was design/a11y-scoped became
// an effective pass. Codex refuted the evidence that pass rests on, and the
// refutation holds — the drop decision is a broad keyword match over free text
// (`brand`, `color`, `spacing`), and the producer emits NO category/scope field to
// check against (render.mjs#normalizeReviewFinding is exactly
// {severity,title,body,file,line_start,line_end,recommendation}). Measured:
//
//   "Brand asset loader reads arbitrary local files"
//     → no IN_SCOPE_VETO term matches → \bbrand\b matches the title → DROPPED
//     → survivors 0 → row 5 → PR passes with a real security objection removed.
//
// A finite veto list cannot prove a negative. Keyword evidence is fine for ROUTING
// (send design findings to impeccable, a11y to a11y-architect) and for AUDIT, but
// it is not strong enough to authorize a pass — and the two error directions are
// not symmetric: a false pass is a silent security bypass, a false block is a
// human reading a finding.
//
// The original backlog complaint (Implement-Codex R1 F2 @ M3) was that such a
// block is OPAQUE — not that it is wrong. So we keep the block and kill the
// opacity: `scopeExcluded` still rides out, and pr.md uses it to state the raw
// verdict, the dropped count, and who owns those findings.
//
// Rule order (each row states the direction it errs in):
//   1. unreadable review          → actionable  (fail-closed — an unreadable review
//                                   cannot certify approval. NEVER relax this.)
//   2. approving verdict          → survivors > 0  (pre-existing path, unchanged)
//   3. non-approve, survivors > 0 → actionable  (partial drop still blocks)
//   4. non-approve, 0 itemized    → actionable  (a non-approve with no evidence is
//                                   not trustworthy; do not let it dissolve)
//   5. non-approve, survivors 0,
//      dropped > 0                → actionable + scopeExcluded=true
//                                   (BLOCK, but say exactly why)
//
// There is no relaxation row. Every non-approving verdict remains actionable.
function deriveEffectiveReview(review, filtered) {
  if (!review) return { actionable: true, scopeExcluded: false };
  const survivors = (filtered && filtered.filteredFindings) || [];
  const dropped = (filtered && filtered.droppedFindings) || [];
  if (APPROVING_VERDICTS.has(String(review.verdict).toLowerCase())) {
    return { actionable: survivors.length > 0, scopeExcluded: false };
  }
  if (survivors.length > 0) return { actionable: true, scopeExcluded: false };
  if (dropped.length === 0) return { actionable: true, scopeExcluded: false };
  // Everything itemized was scope-routed. Still blocking — but the caller now has
  // the signal it needs to explain the block instead of stonewalling.
  return { actionable: true, scopeExcluded: true };
}

// v1.13.0 M3 — does the PR diff touch a rendered design surface? This is the
// PRIMARY a11y-auto-invoke trigger (Codex R1 F1): the design-scope preamble
// usually strips a11y findings from Codex output, so a finding-based trigger
// starves. The surface check is independent of Codex findings. UI ext regex
// mirrors prp-implement.md's routing block + the STATUS/status.html cache pair.
const UI_SURFACE_RE = /\.(tsx|jsx|vue|svelte|astro|css|scss|html)$/i;
const CACHE_SURFACE_RE = /\.claude[\\/]cache[\\/](STATUS\.md|status\.html)$/;
function computeRenderingSurface(base, cwd) {
  try {
    const r = spawnSync('git', ['diff', '--name-only', base + '...HEAD'], {
      cwd: cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (r.status !== 0 || !r.stdout) return false;
    return r.stdout.split(/\r?\n/).filter(Boolean).some(function (f) {
      return UI_SURFACE_RE.test(f) || CACHE_SURFACE_RE.test(f);
    });
  } catch (_) {
    return false;
  }
}

function readTokenFromStdinSync() {
  try {
    const buf = fs.readFileSync(0);
    return buf.toString('utf8').replace(/\r?\n$/, '').trim();
  } catch (_) { return ''; }
}

// --mode heartbeat (forked child). One-shot stdin read for the token, then
// setInterval loop. Exits on SIGTERM (parent kill) or lock-file disappearance.
function runHeartbeat(args) {
  const tok = readTokenFromStdinSync();
  if (!tok) { process.stderr.write('codex-runner heartbeat: empty token via stdin\n'); process.exit(1); }
  const runId = args['run-id'];
  const cwd = args.cwd || process.cwd();
  const lockCli = args['lock-cli'] || locateLockCli();
  const lockPath = path.join(cwd, '.claude', 'state', 'pr-phase.lock');
  const intervalMs = parseInt(args['heartbeat-ms'], 10) || 10000;

  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    clearInterval(t);
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const t = setInterval(function () {
    if (!fs.existsSync(lockPath)) { shutdown(); return; }
    const r = spawnAndPipeToken(
      [NODE, lockCli, 'heartbeat', '--run-id', runId,
        '--ownership-token-stdin', '--cwd', cwd],
      tok,
      { captureStderr: true, timeoutMs: 5000 });
    if (r.exitCode !== 0) {
      // Heartbeat refused — stop loop. Lock may have been reclaimed.
      shutdown();
    }
  }, intervalMs);
}

// --mode run main orchestration.
function runMain(args) {
  if (!args.base) return fail('--base <branch> required');
  if (!args.decision) return fail('--decision <slug> required');
  if (!args['body-file']) return fail('--body-file <path> required');

  const cwd = args.cwd || process.cwd();
  const lockCli = args['lock-cli'] || locateLockCli();
  const codexInvoke = args['codex-invoke'] || locateCodexInvoke();
  const codexTimeout = parseInt(args['timeout-ms'], 10) || 900000;
  const heartbeatMs = parseInt(args['heartbeat-ms'], 10) || 10000;
  const runId = crypto.randomUUID();

  // 1. Acquire lock via anonymous-pipe capture (F11 R3-F2).
  const enterRes = spawnAndCaptureToken(
    [NODE, lockCli, 'enter',
      '--run-id', runId, '--pid', String(process.pid),
      '--subphase', 'codex-review', '--cwd', cwd],
    { captureStderr: true, timeoutMs: 15000 });
  if (enterRes.exitCode !== 0 || !enterRes.rawToken) {
    return fail('lock enter failed (exit=' + enterRes.exitCode + ' err=' +
      (enterRes.stderr || enterRes.parseError || '') + ')', 11);
  }
  const rawToken = enterRes.rawToken;
  const helperManifest = enterRes.stdoutJSON.helper_manifest || {};

  // 2. Determine codex outcome (disabled / skip / dedupe / invoke).
  // v0.3.5 — env-derived MCCP_CODEX_DISABLED takes precedence over explicit
  // --skip-reason. Rationale: env policy is canonical operator intent; an
  // accidentally-supplied --skip-reason in disabled mode would still get
  // recorded as audited escape (substantive reason ≥30 chars validator),
  // which is wrong — the canonical signal here is "policy says don't call".
  let codexOutcome = 'invoked';
  let codexSkipReason = null;
  if (envValue.parseBool(process.env, 'MCCP_CODEX_DISABLED')) {
    codexOutcome = 'disabled';
    codexSkipReason = 'codex_disabled';
  } else if (args['skip-reason'] && args['skip-reason'] !== true) {
    codexOutcome = 'skipped';
    codexSkipReason = String(args['skip-reason']);
  } else if (args.dedupe) {
    codexOutcome = 'deduped';
  }

  // 3. Fork background heartbeat (token via stdin, run_id via argv — not secret).
  // disabled / skipped / deduped all bypass heartbeat — no Codex spawn to keep alive.
  let heartbeatChild = null;
  if (codexOutcome === 'invoked') {
    heartbeatChild = spawn(NODE, [__filename,
      '--mode', 'heartbeat',
      '--run-id', runId,
      '--cwd', cwd,
      '--lock-cli', lockCli,
      '--heartbeat-ms', String(heartbeatMs),
    ], {
      stdio: ['pipe', 'ignore', 'inherit'],
      detached: false,
    });
    heartbeatChild.stdin.write(rawToken + '\n');
    heartbeatChild.stdin.end();
  }

  // v0.3.6 Task 8 — detect impeccable availability ONCE per run. The probe is
  // cheap (env override + plugin manifest fs read + user-level dir stat) so
  // calling it here keeps the wrapper invocation, output filter, and audit
  // emit all keyed off the same truth. MCCP_CODEX_DESIGN_SCOPE_HONOR=0 kill
  // switch overrides detection to false (debug-only opt-out).
  const honorScope = envValue.parseBool(process.env, 'MCCP_CODEX_DESIGN_SCOPE_HONOR');
  const impeccableAvailable = honorScope && impeccableDetect.probeSkillAvailable({});

  // 4. Invoke Codex (or short-circuit).
  let codexRounds = 0;
  let codexSummary = '';
  let codexActionableFindings = false;
  // v1.22.3 M3 — the structured verdict + surviving findings, so the caller can
  // put the ACTUAL review in the PR body instead of an empty 합치 결론.
  let codexVerdict = null;
  let codexFindings = [];
  // v1.22.3 M3 follow-up (R1 F1) — true when a non-approving verdict survived the
  // design-scope filter with zero in-scope findings. The receipt maps this to an
  // effective 'converged' while preserving the raw verdict; pr.md states both.
  let codexScopeExcludedVerdict = false;
  let designFindingsDropped = 0;
  let a11yRoutedToImpeccable = false;
  let droppedFindingsDigest = null;
  // v1.13.0 M3 — a11y findings (supplementary input for pr.md → a11y-architect)
  // and the rendering-surface trigger (primary a11y-auto-invoke signal). The
  // surface check runs regardless of codexOutcome so disabled/skipped/deduped
  // PRs still trigger a11y review when a design surface changed.
  let a11yFindings = [];
  const renderingSurface = computeRenderingSurface(args.base, cwd);
  if (codexOutcome === 'disabled') {
    codexSummary = 'Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy).';
  } else if (codexOutcome === 'skipped') {
    codexSummary = 'MCCP_PR_SKIP_CODEX_REVIEW audited escape (reason recorded in receipt).';
  } else if (codexOutcome === 'deduped') {
    codexSummary = 'Decision ' + args.decision + ' already converged in mccp-plan-codex + mccp-implement-codex; cross-gate dedupe applied at PR step.';
  } else {
    const focus = args.focus || ('challenge this PR diff against base ' + args.base);
    const invokeArgs = [codexInvoke, 'adversarial-review',
      '--focus', focus,
      '--base', args.base,
      '--timeout-ms', String(codexTimeout),
      '--json',
    ];
    if (impeccableAvailable) invokeArgs.push('--impeccable-available');
    // codex-intent-context M1 (Task 10) — L1 ONLY at the PR gate. The user-intent
    // reference is forwarded so PR-Codex reviews the diff against what the user
    // actually asked for; the L2-A adjudication gate is NOT run here. Adjudication
    // is owned by the plan step (it is where findings are triaged), and re-running
    // it at PR time would both duplicate that work and collide with the review-only
    // invariant this gate is built around. Absent/unreadable → flag omitted, and the
    // PR review proceeds exactly as before (fail-open: intent context is an
    // enhancement to this gate, never a new way for it to fail).
    if (typeof args['intent-reference-file'] === 'string' && args['intent-reference-file']) {
      invokeArgs.push('--intent-reference-file', args['intent-reference-file']);
    }
    const codexRes = spawnSync(NODE, invokeArgs, {
      cwd: cwd,
      env: process.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: codexTimeout + 30000,
    });
    let codexJson = null;
    try { codexJson = JSON.parse(codexRes.stdout || '{}'); } catch (_) {}
    const codexClass = codexJson && codexJson.classification;
    const codexBlocking = codexJson && codexJson.blocking;
    if (codexRes.status !== 0 || codexBlocking || codexClass !== 'ok') {
      // Release lock before fail-stop so next invocation isn't blocked.
      tryHeartbeatStop(heartbeatChild);
      tryLockExit(lockCli, runId, rawToken, cwd);
      return fail('codex review failed (class=' + codexClass +
        ' exit=' + codexRes.status + ')', 12);
    }
    // v1.22.3 M3 — read the REVIEW, not the envelope. `.stdout` carries the
    // companion's JSON; the envelope has no verdict/summary/findings (see
    // parseReviewPayload). A null payload is unreadable → fail-closed actionable.
    const review = parseReviewPayload(codexJson);
    if (!review) {
      process.stderr.write('[mccp:codex-runner] could not parse the review payload from ' +
        'codex-invoke stdout — treating as actionable (fail-closed: an unreadable ' +
        'review cannot certify approval).\n');
    }
    // v0.3.6 Task 8 — apply output-level filter when impeccable is honoring.
    // When impeccable is missing or kill-switch active, filter is identity
    // (filteredFindings = original findings, dropped = []). The filter reads
    // `.findings`, so it must receive the parsed REVIEW, not the envelope.
    const filtered = filterDesignFindings(review || { findings: [] },
      { impeccableAvailable: impeccableAvailable });
    const findings = filtered.filteredFindings;
    const effective = deriveEffectiveReview(review, filtered);
    codexActionableFindings = effective.actionable;
    codexScopeExcludedVerdict = effective.scopeExcluded;
    designFindingsDropped = filtered.droppedFindings.length - filtered.a11yRoutedCount;
    a11yRoutedToImpeccable = filtered.a11yRoutedCount > 0;
    a11yFindings = filtered.a11yFindings || [];
    droppedFindingsDigest = computeDroppedDigest(filtered.droppedFindings);
    codexRounds = (review && review.rounds) || codexJson.rounds || 1;
    codexVerdict = review ? review.verdict : null;
    codexSummary = review ? review.summary : '';
    codexFindings = findings;
  }

  // 5. Kill heartbeat, then exit lock and capture mutations.
  tryHeartbeatStop(heartbeatChild);
  const exitRes = spawnAndPipeToken(
    [NODE, lockCli, 'exit',
      '--run-id', runId, '--ownership-token-stdin', '--cwd', cwd],
    rawToken,
    { captureStderr: true, timeoutMs: 15000 });
  let exitJson = null;
  try { exitJson = JSON.parse(exitRes.stdout || '{}'); } catch (_) {}
  const lockExitOk = !!(exitJson && exitJson.ok);
  const mutations = (exitJson && Array.isArray(exitJson.mutations)) ? exitJson.mutations : [];
  const baselineMissing = !!(exitJson && exitJson.baseline_missing);

  return emit({
    ok: lockExitOk,
    codex_outcome: codexOutcome,
    codex_rounds: codexRounds,
    codex_summary: codexSummary,
    codex_actionable_findings: codexActionableFindings,
    // v1.22.3 M3 — surfaced so pr.md can inject the real verdict + findings into
    // `## Codex Adversarial Review`. null verdict = the review was unreadable
    // (codex_actionable_findings is then fail-closed true).
    codex_verdict: codexVerdict,
    codex_findings: codexFindings,
    // v1.22.3 M3 follow-up (R1 F1) — codex_verdict above stays RAW on purpose
    // (what the model actually said). This flag is the post-filter qualifier the
    // receipt + PR body need to explain an effective pass over a raw non-approve.
    codex_scope_excluded_verdict: codexScopeExcludedVerdict,
    codex_skip_reason: codexSkipReason,
    lock_exit_ok: lockExitOk,
    baseline_missing: baselineMissing,
    mutations: mutations,
    run_id: runId,
    helper_manifest: helperManifest,
    // v0.3.6 Task 8 — scope audit fields. Caller (commands/pr.md Phase 3.5)
    // forwards these to mccp-receipt write so receipt.meta carries the audit
    // trail. design_findings_dropped excludes a11y items (a11y has its own
    // counter so caller can route to impeccable a11y-architect).
    codex_design_scope_excluded: !!impeccableAvailable,
    design_findings_dropped: designFindingsDropped,
    a11y_routed_to_impeccable: a11yRoutedToImpeccable,
    dropped_findings_digest: droppedFindingsDigest,
    // v1.13.0 M3 — a11y-auto-invoke inputs for pr.md. rendering_surface is the
    // primary trigger (Codex R1 F1); a11y_findings is supplementary payload.
    a11y_findings: a11yFindings,
    rendering_surface: renderingSurface,
  }, lockExitOk ? 0 : 1);
}

function tryHeartbeatStop(child) {
  if (!child) return;
  try { child.kill('SIGTERM'); } catch (_) {}
}

function tryLockExit(lockCli, runId, rawToken, cwd) {
  try {
    spawnAndPipeToken(
      [NODE, lockCli, 'exit',
        '--run-id', runId, '--ownership-token-stdin', '--cwd', cwd],
      rawToken,
      { captureStderr: true, timeoutMs: 10000 });
  } catch (_) { /* best-effort */ }
}

function main(argv) {
  const args = parseArgs(argv);
  const mode = args.mode || 'run';
  if (mode === 'heartbeat') return runHeartbeat(args);
  return runMain(args);
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  main, runMain, runHeartbeat,
  // Exported so the effective-verdict rules can be unit-tested directly, without
  // paying the full spawn/lock round trip of the integration tests above.
  deriveEffectiveReview,
};
