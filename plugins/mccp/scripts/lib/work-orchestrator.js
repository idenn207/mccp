'use strict';

// v0.3.1 Milestone 4 — single-entry /mccp:work orchestrator.
//
// work-orchestrator does NOT execute slash commands itself (it cannot — those
// run in Claude's command body). Instead it answers three questions:
//
//   1. "Is this a trivial change or full chain?"   — `classify --feature <text> [--prd <path>]`
//   2. "Given current state, what's the next step?" — `next-step --state <s> --type <trivial|full> --decision <slug>`
//   3. "I just ran step X with status Y"            — delegates to auto-chain.recordStep
//
// Trivial heuristic (all 5 conditions must hold):
//   1. Changed file count ≤ 2
//   2. Total LOC change (added + deleted) ≤ 20
//   3. File extensions ⊂ { .md, .txt, .json, .yaml, .yml }
//   4. Zero new files (only UPDATE)
//   5. No source-code signature in diff body (function/class/def/import/require)
//
// Override precedence:
//   1. opts.forceTrivial === true → trivial (reason: user-override-trivial)
//   2. opts.forceFull === true    → full    (reason: user-override-full)
//   3. heuristic result
//
// Conservative default: ambiguous diff / parse failure → full chain.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const autoChain = require('./auto-chain');

const ABORT_EXIT = autoChain.ABORT_EXIT;
const TEMPFAIL_EXIT = autoChain.TEMPFAIL_EXIT;

const TRIVIAL_MAX_FILES = 2;
const TRIVIAL_MAX_LOC = 20;
const TRIVIAL_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);
const SOURCE_CODE_SIGNATURES = [
  /\bfunction\s/,
  /\bclass\s/,
  /\bdef\s/,
  /\bimport\s/,
  /\brequire\s*\(/,
  /\bexport\s/,
  /=>\s*\{/,
];

const FULL_CHAIN = ['init', 'plan_prd', 'plan', 'implement', 'commit', 'pr', 'done'];
const TRIVIAL_CHAIN = ['init', 'commit', 'pr', 'done'];

const STEP_TO_SLASH = {
  plan_prd: '/mccp:plan-prd',
  plan: '/mccp:plan',
  implement: '/mccp:prp-implement',
  commit: '/mccp:prp-commit',
  pr: '/mccp:pr',
};

const STEP_TO_VALIDATE_COMMAND = {
  plan: 'mccp:plan',
  implement: 'mccp:prp-implement',
  commit: null,
  pr: 'mccp:pr',
};

function classifyTrivial(diffInfo, opts) {
  opts = opts || {};
  if (opts.forceTrivial === true) {
    return { type: 'trivial', reason: 'user-override-trivial', evidence: null };
  }
  if (opts.forceFull === true) {
    return { type: 'full', reason: 'user-override-full', evidence: null };
  }
  if (!diffInfo || diffInfo.parseError) {
    return {
      type: 'full',
      reason: 'diff-parse-failed',
      evidence: diffInfo ? { error: diffInfo.parseError } : { error: 'no-diff-input' },
    };
  }
  const fileCount = (diffInfo.files || []).length;
  if (fileCount === 0) {
    return { type: 'full', reason: 'empty-diff', evidence: { fileCount: 0 } };
  }
  if (fileCount > TRIVIAL_MAX_FILES) {
    return {
      type: 'full',
      reason: 'too-many-files',
      evidence: { fileCount: fileCount, max: TRIVIAL_MAX_FILES },
    };
  }
  if ((diffInfo.totalLoc || 0) > TRIVIAL_MAX_LOC) {
    return {
      type: 'full',
      reason: 'too-many-loc',
      evidence: { totalLoc: diffInfo.totalLoc, max: TRIVIAL_MAX_LOC },
    };
  }
  if ((diffInfo.newFiles || []).length > 0) {
    return {
      type: 'full',
      reason: 'new-files-present',
      evidence: { newFiles: diffInfo.newFiles },
    };
  }
  for (let i = 0; i < (diffInfo.files || []).length; i++) {
    const f = diffInfo.files[i];
    const ext = path.extname(String(f)).toLowerCase();
    if (!TRIVIAL_EXTENSIONS.has(ext)) {
      return {
        type: 'full',
        reason: 'non-trivial-extension',
        evidence: { file: f, ext: ext },
      };
    }
  }
  const body = diffInfo.body || '';
  for (let i = 0; i < SOURCE_CODE_SIGNATURES.length; i++) {
    if (SOURCE_CODE_SIGNATURES[i].test(body)) {
      return {
        type: 'full',
        reason: 'source-code-signature',
        evidence: { pattern: SOURCE_CODE_SIGNATURES[i].source },
      };
    }
  }
  return {
    type: 'trivial',
    reason: 'heuristic-passed',
    evidence: {
      fileCount: fileCount,
      totalLoc: diffInfo.totalLoc,
      files: diffInfo.files,
    },
  };
}

function readGitDiff(repoRoot) {
  const r = spawnSync('git', ['diff', '--numstat', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    return { parseError: 'git-diff-failed: ' + (r.stderr || 'unknown') };
  }
  const lines = r.stdout.split(/\r?\n/).filter(Boolean);
  const files = [];
  let totalLoc = 0;
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/\t/);
    if (parts.length < 3) continue;
    const added = parts[0] === '-' ? 0 : Number(parts[0]) || 0;
    const deleted = parts[1] === '-' ? 0 : Number(parts[1]) || 0;
    files.push(parts[2]);
    totalLoc += added + deleted;
  }
  const statusR = spawnSync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const newFiles = [];
  if (statusR.status === 0) {
    const statusLines = statusR.stdout.split(/\r?\n/).filter(Boolean);
    for (let i = 0; i < statusLines.length; i++) {
      const code = statusLines[i].slice(0, 2);
      if (/^A|^\?\?/.test(code)) {
        newFiles.push(statusLines[i].slice(3));
      }
    }
  }
  const bodyR = spawnSync('git', ['diff', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  return {
    files: files,
    totalLoc: totalLoc,
    newFiles: newFiles,
    body: bodyR.status === 0 ? bodyR.stdout : '',
  };
}

function nextStep(currentState, opts) {
  opts = opts || {};
  const type = opts.type || 'full';
  const chain = type === 'trivial' ? TRIVIAL_CHAIN : FULL_CHAIN;
  const idx = chain.indexOf(currentState);
  if (idx === -1) {
    return {
      step: null,
      halt: true,
      reasons: [{ trigger: 'unknown-state', detail: 'state "' + currentState + '" not in ' + type + ' chain' }],
    };
  }
  let nextIdx = idx + 1;
  // PRD skip: if --prd path is provided and we're advancing from init, skip plan_prd.
  if (type === 'full' && currentState === 'init' && opts.prdProvided === true) {
    nextIdx = chain.indexOf('plan');
  }
  if (nextIdx >= chain.length) {
    return { step: 'done', halt: false, reasons: [] };
  }
  const next = chain[nextIdx];
  if (next === 'done') {
    return { step: 'done', halt: false, reasons: [] };
  }
  const validateCommand = STEP_TO_VALIDATE_COMMAND[next];
  if (validateCommand) {
    const abort = autoChain.shouldAbort({
      env: opts.env || process.env,
      cwd: opts.cwd,
      repoRoot: opts.repoRoot,
      validateCommand: validateCommand,
      decisionId: opts.decisionId,
      skipCostCheck: opts.skipCostCheck === true,
    });
    if (abort.shouldAbort) {
      return {
        step: next,
        slash_command: STEP_TO_SLASH[next],
        halt: true,
        reasons: abort.reasons,
      };
    }
  }
  return {
    step: next,
    slash_command: STEP_TO_SLASH[next],
    halt: false,
    reasons: [],
  };
}

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

function runCli(argv) {
  if (!argv || argv.length === 0) {
    process.stderr.write(
      'usage: work-orchestrator <classify|next-step|record-step> [options]\n' +
      '  classify    --feature <text> [--prd <path>] [--full] [--trivial] [--dry-run]\n' +
      '  next-step   --state <init|plan_prd|plan|implement|commit|pr|done> [--type trivial|full] [--decision <slug>] [--prd-provided] [--skip-cost]\n' +
      '  record-step --step <s> --status <ok|failed> [--receipt-path <p>]\n'
    );
    return 2;
  }
  const cmd = argv[0];
  const rest = parseFlags(argv.slice(1));

  if (cmd === 'classify') {
    const repoRoot = findRepoRoot(process.cwd());
    const diffInfo = rest['dry-run'] === true ? null : readGitDiff(repoRoot);
    const r = classifyTrivial(diffInfo, {
      forceTrivial: rest['trivial'] === true,
      forceFull: rest['full'] === true,
    });
    emit({
      feature: rest['feature'] || null,
      prd: rest['prd'] || null,
      type: r.type,
      reason: r.reason,
      evidence: r.evidence,
    });
    return 0;
  }

  if (cmd === 'next-step') {
    const state = rest['state'];
    if (!state) {
      process.stderr.write('next-step requires --state\n');
      return 2;
    }
    const r = nextStep(state, {
      type: rest['type'] === 'trivial' ? 'trivial' : 'full',
      prdProvided: rest['prd-provided'] === true,
      decisionId: rest['decision'],
      skipCostCheck: rest['skip-cost'] === true,
    });
    const isTempfail = r.reasons && r.reasons.some(x => x.trigger === 'receipt-tempfail');
    emit({
      current_state: state,
      next_step: r.step,
      slash_command: r.slash_command || null,
      halt: r.halt,
      reasons: r.reasons || [],
      retryable: isTempfail,
    });
    if (isTempfail) return TEMPFAIL_EXIT;
    return r.halt ? ABORT_EXIT : 0;
  }

  if (cmd === 'record-step') {
    const step = rest['step'];
    const status = rest['status'];
    if (!step || !status) {
      process.stderr.write('record-step requires --step and --status\n');
      return 2;
    }
    const repoRoot = findRepoRoot(process.cwd());
    const r = autoChain.recordStep(repoRoot, {
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

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  classifyTrivial: classifyTrivial,
  nextStep: nextStep,
  readGitDiff: readGitDiff,
  TRIVIAL_MAX_FILES: TRIVIAL_MAX_FILES,
  TRIVIAL_MAX_LOC: TRIVIAL_MAX_LOC,
  TRIVIAL_EXTENSIONS: TRIVIAL_EXTENSIONS,
  SOURCE_CODE_SIGNATURES: SOURCE_CODE_SIGNATURES,
  FULL_CHAIN: FULL_CHAIN,
  TRIVIAL_CHAIN: TRIVIAL_CHAIN,
  STEP_TO_SLASH: STEP_TO_SLASH,
  ABORT_EXIT: ABORT_EXIT,
  TEMPFAIL_EXIT: TEMPFAIL_EXIT,
};
