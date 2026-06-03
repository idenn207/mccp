#!/usr/bin/env node
'use strict';

// mccp v0.2 Stop-loop hook.
//
// Contract (Stop event):
//   stdin:  raw JSON event with at minimum {transcript_path?, cwd?, ...}
//   stdout:
//     - pass-through (the original rawInput) on allow
//     - {"decision":"block","reason":"<one-line>"} on block (MCCP_STOP_LOOP=enforce only)
//   stderr: human-readable verdict + warnings (always informational)
//
// Decision tree:
//   MCCP_STOP_LOOP=off                                    → allow
//   MCCP_STOP_LOOP=observe (default)                       → check, never block
//   MCCP_STOP_LOOP=enforce                                 → check, block on fail
//
//   git diff empty                                         → allow
//   loop-counter[task].count >= MAX                        → "human takeover" + allow
//   quality runner failed                                  → fix-task.md + bump counter
//                                                            + observe→allow, enforce→block
//   quality runner passed                                  → reset counter
//     MCCP_STOP_LOOP_CODEX=1 + Codex result text present   → bridge.parseCodexResult
//       verdict='critical' or escalate=true                → fix-task + block (enforce)
//       verdict='unavailable'                              → log + allow (Risk #1)
//       verdict='converged'                                → allow

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..', '..');

const loopCounter = require(path.join(PLUGIN_ROOT, 'scripts', 'state', 'loop-counter'));
const fixTask = require(path.join(PLUGIN_ROOT, 'scripts', 'state', 'fix-task'));
const dedupeKey = require(path.join(PLUGIN_ROOT, 'scripts', 'state', 'dedupe-key'));
const codexBridge = require(path.join(PLUGIN_ROOT, 'scripts', 'lib', 'codex-bridge'));
const qualityRunner = require(path.join(PLUGIN_ROOT, 'scripts', 'quality', 'runner'));
const qualityDetect = require(path.join(PLUGIN_ROOT, 'scripts', 'quality', 'detect'));

const MAX_STDIN_BYTES = 1024 * 1024;
const CODEX_INPUT_REL = path.join('.claude', 'state', 'codex-stop-loop-input.txt');

function modeFromEnv(env) {
  const raw = String((env || {}).MCCP_STOP_LOOP || 'observe').toLowerCase().trim();
  if (raw === 'off' || raw === 'observe' || raw === 'enforce') return raw;
  return 'observe';
}

function codexOptIn(env) {
  return String((env || {}).MCCP_STOP_LOOP_CODEX || '').trim() === '1';
}

function debug(stderr, line) {
  if (stderr && typeof stderr.write === 'function') {
    stderr.write('[mccp:stop-review-loop] ' + line + '\n');
  }
}

function gitDiffEmpty(cwd) {
  // `git diff --quiet HEAD` ignores untracked files — newly added files
  // (a common Stop-loop trigger) would slip past. Use porcelain to cover
  // staged, unstaged, AND untracked changes.
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], {
      cwd: cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return !out.trim();
  } catch (_e) {
    // git failed (not a repo, permissions); treat as "no diff to evaluate"
    return true;
  }
}

function repoRootFor(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    }).trim();
  } catch (_e) {
    return null;
  }
}

function firstUserPromptFromTranscript(transcriptPath) {
  if (!transcriptPath) return '';
  try {
    const raw = fs.readFileSync(transcriptPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj && obj.type === 'user' && obj.message && Array.isArray(obj.message.content)) {
          for (const part of obj.message.content) {
            if (part && part.type === 'text' && typeof part.text === 'string') {
              return part.text;
            }
            if (typeof part === 'string') return part;
          }
        }
        if (obj && obj.role === 'user' && typeof obj.content === 'string') {
          return obj.content;
        }
      } catch (_e) { /* skip non-JSON line */ }
    }
  } catch (_e) { /* missing transcript */ }
  return '';
}

function readCodexResult(repoRoot) {
  const target = path.join(repoRoot, CODEX_INPUT_REL);
  if (!fs.existsSync(target)) return null;
  try { return fs.readFileSync(target, 'utf8'); } catch (_e) { return null; }
}

function blockJson(reason) {
  return JSON.stringify({
    decision: 'block',
    reason: reason,
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: reason,
    },
  });
}

function summarizeFailures(stages) {
  const fails = stages.filter(s => s.status !== 'pass' && s.status !== 'skipped');
  return fails.map(s => ({
    stage: s.name,
    exitCode: s.exitCode,
    excerpt: (s.stderr && s.stderr.trim()) || (s.stdout && s.stdout.trim()) || s.reason || '',
    commandHint: s.command,
  }));
}

function run(rawInput, opts) {
  const options = opts || {};
  const env = options.env || process.env;
  const stderr = options.stderr || process.stderr;

  const mode = modeFromEnv(env);
  if (mode === 'off') {
    debug(stderr, 'MCCP_STOP_LOOP=off; allow');
    return rawInput;
  }

  let event = {};
  try {
    if (rawInput && rawInput.trim()) event = JSON.parse(rawInput);
  } catch (err) {
    debug(stderr, 'rawInput parse failure: ' + err.message + '; allow');
    return rawInput;
  }

  const cwd = (event && event.cwd) || options.cwd || process.cwd();
  const repoRoot = options.repoRoot || repoRootFor(cwd);
  if (!repoRoot) {
    debug(stderr, 'not a git repo (cwd=' + cwd + '); allow');
    return rawInput;
  }

  // Empty diff fast-exit.
  const noDiff = options.gitDiffEmpty
    ? options.gitDiffEmpty(repoRoot)
    : gitDiffEmpty(repoRoot);
  if (noDiff) {
    debug(stderr, 'no working-tree diff; allow');
    return rawInput;
  }

  const firstPrompt = firstUserPromptFromTranscript(event.transcript_path);
  const fingerprint = loopCounter.fingerprintFromPrompt(firstPrompt);

  const current = loopCounter.get(repoRoot, fingerprint);
  if (current.count >= loopCounter.MAX_COUNT) {
    debug(stderr, 'counter at MAX (' + current.count + ') for ' + fingerprint +
      '; human takeover, allow');
    return rawInput;
  }

  // Quality runner.
  const detection = options.detection || qualityDetect.detect(repoRoot);
  const qualityResult = options.runQuality
    ? options.runQuality({ cwd: repoRoot, detection: detection, env: env })
    : qualityRunner.run({ cwd: repoRoot, detection: detection, env: env });

  if (qualityResult.passed) {
    debug(stderr, 'quality PASS');

    if (codexOptIn(env)) {
      const codexText = options.codexResultText !== undefined
        ? options.codexResultText
        : readCodexResult(repoRoot);
      if (codexText === null || codexText === undefined) {
        debug(stderr, 'MCCP_STOP_LOOP_CODEX=1 but no codex result file at ' +
          CODEX_INPUT_REL + '; skipping');
        loopCounter.reset(repoRoot, fingerprint);
        return rawInput;
      }
      const verdict = codexBridge.parseCodexResult(codexText, options.focus || 'stop-loop diff review');
      debug(stderr, 'codex verdict=' + verdict.verdict + ' escalate=' + verdict.escalate);
      if (verdict.verdict === 'unavailable') {
        debug(stderr, 'codex unavailable; allow (auto-fallback)');
        loopCounter.reset(repoRoot, fingerprint);
        return rawInput;
      }
      if (verdict.verdict === 'critical' || verdict.escalate) {
        // Bug fix (santa-loop Round 1, Reviewer B): do NOT reset counter
        // before the failure path. failureExit will bump based on current.count,
        // keeping loop-counter.json and fix-task.md in lockstep.
        return failureExit({
          mode: mode,
          repoRoot: repoRoot,
          fingerprint: fingerprint,
          decisionId: deriveDecisionForRoot(repoRoot, event),
          counterBefore: current.count,
          rawInput: rawInput,
          stderr: stderr,
          verdictKind: verdict.verdict === 'critical' ? 'codex_critical' : 'codex_divergent',
          codexSummary: verdict.summary,
          originalPrompt: firstPrompt,
          escalate: verdict.escalate || verdict.verdict === 'critical',
          failures: [],
        });
      }
    }
    loopCounter.reset(repoRoot, fingerprint);
    debug(stderr, 'counter reset (all checks passed)');
    return rawInput;
  }

  // Quality failed.
  return failureExit({
    mode: mode,
    repoRoot: repoRoot,
    fingerprint: fingerprint,
    decisionId: deriveDecisionForRoot(repoRoot, event),
    counterBefore: current.count,
    rawInput: rawInput,
    stderr: stderr,
    verdictKind: 'quality_fail',
    originalPrompt: firstPrompt,
    escalate: false,
    failures: summarizeFailures(qualityResult.stages),
  });
}

function deriveDecisionForRoot(repoRoot, event) {
  if (event && event.decision_id) return String(event.decision_id);
  // Fall back to current git branch for the dedupe key (matches receipt CLI's
  // BRANCH_BASED slugFromBranch). The Stop hook does not always have a plan path.
  try {
    const branch = execFileSync('git', ['branch', '--show-current'], {
      cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    }).trim();
    return dedupeKey.normalizeSlug(branch);
  } catch (_e) {
    return 'default';
  }
}

function failureExit(ctx) {
  // Reviewer B Round 2 #1: read the under-lock current count, write fix-task
  // with the SAME nextCount the counter will advance to, then bump — all
  // inside one withCounterLock so two concurrent failing hooks cannot leave
  // fix-task.md's counter out of sync with loop-counter.json's counter.
  const bumped = loopCounter.bumpAndCompose(ctx.repoRoot, ctx.fingerprint, function (nextCount) {
    const writeResult = fixTask.write(ctx.repoRoot, {
      verdict: ctx.verdictKind,
      counter: nextCount,
      taskFingerprint: ctx.fingerprint,
      decisionId: ctx.decisionId,
      failures: ctx.failures,
      codexSummary: ctx.codexSummary,
      escalate: ctx.escalate,
      originalPrompt: ctx.originalPrompt,
    });
    return writeResult.bodyHash;
  });
  const oneLine = oneLineReason(ctx, bumped);
  debug(ctx.stderr, oneLine);
  if (ctx.mode === 'enforce') {
    return blockJson(oneLine);
  }
  // observe mode: log but allow
  debug(ctx.stderr, '(observe mode; not blocking)');
  return ctx.rawInput;
}

function oneLineReason(ctx, bumped) {
  if (ctx.verdictKind === 'quality_fail') {
    const first = (ctx.failures && ctx.failures[0]) || { stage: 'unknown', exitCode: '?' };
    return 'mccp Stop-loop: quality fail (' + first.stage +
      ', exit=' + first.exitCode + '); fix-task.md written, counter=' + bumped.count;
  }
  if (ctx.verdictKind === 'codex_critical') {
    return 'mccp Stop-loop: Codex CRITICAL; fix-task.md + escalation, counter=' + bumped.count;
  }
  if (ctx.verdictKind === 'codex_divergent') {
    return 'mccp Stop-loop: Codex divergent (3R); fix-task.md + escalation, counter=' + bumped.count;
  }
  return 'mccp Stop-loop: blocked (' + ctx.verdictKind + ')';
}

function readStdin(maxBytes) {
  return new Promise(function (resolve) {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) {
      if (buf.length < maxBytes) buf += chunk.substring(0, maxBytes - buf.length);
    });
    process.stdin.on('end', function () { resolve(buf); });
    process.stdin.on('error', function () { resolve(buf); });
    setTimeout(function () { resolve(buf); }, 280000);
  });
}

if (require.main === module) {
  readStdin(MAX_STDIN_BYTES).then(function (raw) {
    try {
      const out = run(raw);
      process.stdout.write(out);
    } catch (err) {
      process.stderr.write('[mccp:stop-review-loop] fatal: ' + (err && err.stack || err) + '\n');
      // Fail-open: never block on bridge bug.
      process.stdout.write(raw);
    }
    process.exit(0);
  });
}

module.exports = {
  run: run,
  modeFromEnv: modeFromEnv,
  codexOptIn: codexOptIn,
  firstUserPromptFromTranscript: firstUserPromptFromTranscript,
  summarizeFailures: summarizeFailures,
  CODEX_INPUT_REL: CODEX_INPUT_REL,
};
