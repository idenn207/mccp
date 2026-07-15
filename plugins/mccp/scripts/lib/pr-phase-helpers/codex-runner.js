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
// plan.md / prp-implement.md already parse `.stdout` correctly (via
// codex-bridge.parseVerdict); only the PR gate lacked it. Note that parseVerdict
// is a free-TEXT keyword scan and does NOT recognize the STRUCTURED verdict
// vocabulary, so it cannot be reused here: the companion's contract
// (codex/prompts/adversarial-review.md) emits exactly `approve` | `needs-attention`.
const APPROVING_VERDICTS = Object.freeze(new Set(['approve']));

// parseReviewPayload(envelope) → { verdict, summary, findings, rounds } | null
// null means "could not read the review" — callers MUST treat that as actionable
// (fail-closed): an unreadable review cannot certify approval.
function parseReviewPayload(envelope) {
  let inner = null;
  try { inner = JSON.parse((envelope && envelope.stdout) || ''); } catch (_) { return null; }
  if (!inner || typeof inner !== 'object') return null;
  // The companion wraps the model payload in `.result`; tolerate a bare payload.
  const r = (inner.result && typeof inner.result === 'object') ? inner.result : inner;
  if (typeof r.verdict !== 'string' || !r.verdict.trim()) return null;
  return {
    verdict: r.verdict.trim(),
    summary: typeof r.summary === 'string' ? r.summary : '',
    findings: Array.isArray(r.findings) ? r.findings : [],
    rounds: Number.isFinite(inner.rounds) ? inner.rounds : (Number.isFinite(r.rounds) ? r.rounds : 1),
  };
}

// isActionable({ review, filteredFindings }) → boolean
// Actionable when the review could not be read (fail-closed), when the structured
// verdict is not an approving one, or when any finding survived the design-scope
// filter. The receipt's non-approving path keys off this.
function isActionable(review, filteredFindings) {
  if (!review) return true;
  if (!APPROVING_VERDICTS.has(review.verdict.toLowerCase())) return true;
  return (filteredFindings || []).length > 0;
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
  if (process.env.MCCP_CODEX_DISABLED === '1') {
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
  const honorScope = process.env.MCCP_CODEX_DESIGN_SCOPE_HONOR !== '0';
  const impeccableAvailable = honorScope && impeccableDetect.probeSkillAvailable({});

  // 4. Invoke Codex (or short-circuit).
  let codexRounds = 0;
  let codexSummary = '';
  let codexActionableFindings = false;
  // v1.22.3 M3 — the structured verdict + surviving findings, so the caller can
  // put the ACTUAL review in the PR body instead of an empty 합치 결론.
  let codexVerdict = null;
  let codexFindings = [];
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
    codexActionableFindings = isActionable(review, findings);
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

module.exports = { main, runMain, runHeartbeat };
