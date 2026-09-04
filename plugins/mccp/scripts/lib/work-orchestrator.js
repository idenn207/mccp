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
const { spawnSync, execFileSync } = require('child_process');

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

// ── orchestrator-step-wiring M2 — halt 기록/조회 ────────────────────────────
//
// 이 두 서브커맨드(`record-halt` · `last-halt`)는 **관측이지 게이트가 아니다**.
// 계약은 하나다: 어떤 실패에도 exit 0. `/mccp:work` 의 halt 분기가 이것 때문에
// 멈추면 그것은 계측이 아니라 또 하나의 게이트다(UI2).

const HALT_STEPS = ['detect', 'plan_prd', 'plan', 'implement', 'verify', 'commit', 'pr'];
const HALT_SITE_RE = /^[a-z0-9][a-z0-9.-]{0,39}$/;
const BANNER_REASON_MAX = 80;

// DD7 (security S1) — `stripAnsi` 가 다루지 않는 잔여 control byte.
// `\t`(09) · `\n`(0a) · `\r`(0d) 은 이 집합에서 **제외**한다: 탭은 공백으로 바꾸고,
// CR/LF 는 `oneLineExcerpt` 가 공백으로 접어 단어 경계를 보존한다. 여기서 먼저
// 지우면 "a\nb" 가 "ab" 로 붙는다.
// eslint-disable-next-line no-control-regex
const RESIDUAL_CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

// 지연 require — 모듈 로드 실패가 `classify`/`next-step` 까지 죽이지 않도록,
// halt 경로에서만 그리고 호출부의 try/catch 안에서만 해소한다.
function haltDeps() {
  return {
    mask: require('../derive/mask'),
    stripAnsi: require('./utils').stripAnsi,
    oneLineExcerpt: require('../state/fix-task').oneLineExcerpt,
    stateWriter: require('../state/state-writer'),
    worktrees: require('../derive/sources/worktrees'),
  };
}

function scrubControl(text, deps) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return deps.stripAnsi(text).replace(/\t/g, ' ').replace(RESIDUAL_CONTROL_RE, '');
}

// DD7 — 순서가 계약이다: 경로 스크럽 → ANSI/control 제거 → 절삭.
// 앞의 둘이 길이를 바꾸므로 절삭이 마지막이어야 200자 계약이 최종 문자열 기준으로
// 성립한다.
function narrowReason(text, repoRoot, deps) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return deps.oneLineExcerpt(scrubControl(deps.mask.scrubAbsPaths(text, repoRoot), deps));
}

// review M1 — reader 측 재강제는 **읽는 모든 필드**에 걸린다. `scrubControl` 은
// 설계상 CR/LF 를 남기고(`oneLineExcerpt` 가 단어 경계를 보존하며 접도록) 길이도
// 제한하지 않으므로, 그것만 통과한 값은 아직 한 줄이 아니다. 배너는 인용부호 없이
// `echo` 로 나가고 `chain_progress` 는 git-tracked STATE.md 라 PR 로 유입될 수 있는
// 값이다 — 접지 않으면 개행 하나로 `[mccp:work] ` 접두를 위조한 줄을 심을 수 있다.
// 그래서 step·site·ts·work_unit 도 reason 과 같은 좁히기를 통과한다.
function safeField(value, deps) {
  return deps.oneLineExcerpt(scrubControl(String(value === undefined || value === null ? '' : value), deps));
}

// DD7 repo-root 봉쇄 가드. `findRepoRoot` 는 `.git` 조상이 없으면 cwd 를 그대로
// 돌려주므로, 가드가 없으면 비-repo 디렉토리에 `.claude/state/STATE.md` 를 새로
// 만들고 평범한 성공으로 끝난다 — 계측이 남의 디렉토리를 오염시키고, 그 exit 0 이
// fail-open 의 증거로 오독된다. mirror: msw-metrics/cli.js "security review S5".
function hasRepoMarker(root) {
  return ['.claude', '.git'].some(function (m) {
    try { fs.statSync(path.join(root, m)); return true; } catch (_e) { return false; }
  });
}

// review HIGH-2 — `quiet` 는 선택이 아니라 이 reader 의 계약이다. `parseStateMd` 의
// WARNING 은 "리셋한다" 를 뜻하는데 이 경로는 아무것도 쓰지 않으므로 거짓이고, 더
// 나쁘게는 호출자(work.md 배너)가 stdout 이 빌 때 stderr 첫 줄을 실패 사유로 삼아
// **halt 부재(정상)를 읽기 실패로 오보**한다. DD1 이 읽기를 저장소 전체로 넓혔으므로
// 한 worktree 의 파손이 모든 worktree 의 진입 배너를 오염시킨다(실측 재현).
function readStateFrontmatter(worktreePath, deps) {
  const sp = path.join(worktreePath, '.claude', 'state', 'STATE.md');
  let raw;
  try { raw = fs.readFileSync(sp, 'utf8'); } catch (_e) { return null; }
  const parsed = deps.stateWriter.parseStateMd(raw, { quiet: true });
  return (parsed && parsed.frontmatter) || null;
}

// DD2 — 해소 순서는 `--work-unit` 명시 → STATE.md `task_fingerprint` → null.
// `'unknown'` 은 값이 아니라 **부재**다: `emptyState` 의 리터럴 기본값이자
// REQUIRED_FRONTMATTER_KEYS 라 실제 STATE.md 에서 결코 부재하지 않으므로, 그냥
// 읽으면 A1 corpus 와 조인되지 않는 쓰레기 키를 봉인하게 된다. 모르면 비운다.
function resolveWorkUnit(repoRoot, explicit, deps) {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  try {
    const fm = readStateFrontmatter(repoRoot, deps);
    const fp = fm && fm.task_fingerprint;
    if (typeof fp === 'string' && fp.trim() && fp.trim() !== 'unknown') return fp.trim();
  } catch (_e) { /* best-effort */ }
  return null;
}

// Task 4 (6) — append-only 원장에는 해소 개념이 없다. 단순히 "마지막 halted 항목"을
// 고르면 한 번 막힌 뒤로 모든 진입에 무기한 같은 줄이 뜬다. 그래서 후보는 그
// worktree chain_progress 의 **마지막 항목이 halted 일 때만** 이다 — 뒤에 어떤 step
// 이든 기록됐다면 그 halt 는 지나간 것으로 본다.
function trailingHalt(frontmatter) {
  if (!frontmatter || typeof frontmatter.chain_progress !== 'string') return null;
  let log;
  try { log = JSON.parse(frontmatter.chain_progress); } catch (_e) { return null; }
  const steps = log && Array.isArray(log.steps) ? log.steps : null;
  if (!steps || steps.length === 0) return null;
  const last = steps[steps.length - 1];
  if (!last || last.status !== 'halted') return null;
  return last;
}

function collectLastHalt(repoRoot, deps) {
  let stdout;
  try {
    stdout = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: deps.worktrees.SCAN_TIMEOUT_MS,
    });
  } catch (err) {
    return { error: 'git worktree list 실패: ' + ((err && err.message) || String(err)) };
  }
  const all = deps.worktrees.parseWorktreePorcelain(stdout).filter(function (w) { return !w.bare; });
  const cap = deps.worktrees.parseCap({});
  // Task 4 (5) — 절삭은 침묵할 수 없다. `scanWorktrees` 는 나열용이라 절삭돼도 행이
  // 빠질 뿐이지만, 전역 **최댓값**을 고르는 질의에서 절삭은 빈 답이 아니라 **다른
  // worktree 의 더 오래된 halt 를 정답인 양** 내놓는다. UI4 를 보장할 수 없으면
  // 답 대신 그 사실을 말한다.
  // `cap` 이지 `kept` 가 아니다 — 이 분기는 **아무 worktree 도 읽지 않고** 답을
  // 포기하므로, 유지된 개수를 보고하면 부분 답이 있었던 것처럼 읽힌다(review LOW).
  if (all.length > cap) return { truncated: { cap: cap, total: all.length } };

  let best = null;
  for (const w of all) {
    if (!w || typeof w.path !== 'string') continue;
    let hit = null;
    try { hit = trailingHalt(readStateFrontmatter(w.path, deps)); } catch (_e) { continue; }
    if (!hit || typeof hit.ts !== 'string') continue;
    if (!best || hit.ts > best.entry.ts) best = { entry: hit, worktree: w.path };
  }
  return { hit: best };
}

function formatHaltLine(best, repoRoot, deps) {
  const e = best.entry;
  // Task 4 (3) + security S1 + review M1 — reader 는 자신이 읽은 레코드에 대해 좁히기를
  // **다시** 강제한다. 쓰기 시점 좁히기는 이미 디스크에 있는(구버전 recorder 가 쓴,
  // 또는 손으로 편집된) 레코드를 되돌리지 못하고, 이 줄은 인용부호 없이 터미널로 나간다.
  // 네 필드 전부가 같은 좁히기를 통과한다 — 셋만 통과시키면 남은 하나가 통로가 된다.
  const parts = ['직전 halt:', 'step=' + safeField(e.step, deps),
    'site=' + safeField(e.halt_site, deps), '(' + safeField(e.ts, deps) + ')'];
  const reason = safeField(e.reason, deps);
  if (reason) {
    parts.push('reason=' + (reason.length > BANNER_REASON_MAX
      ? reason.slice(0, BANNER_REASON_MAX - 1) + '…' : reason));
  }
  let line = parts.join(' ');
  if (!deps.worktrees.isSelfWorktree(best.worktree, repoRoot)) {
    line += ' · worktree=' + path.basename(best.worktree);
  }
  return line;
}

function runCli(argv) {
  if (!argv || argv.length === 0) {
    process.stderr.write(
      'usage: work-orchestrator <classify|next-step|record-step|record-halt|last-halt> [options]\n' +
      '  record-halt --step <s> --site <id> [--reason <t>] [--work-unit <slug>]   (always exit 0)\n' +
      '  last-halt   [--json]                                                     (always exit 0)\n' +
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

  // ── orchestrator-step-wiring M2 — halt 기록 (producer) ────────────────────
  // 전체가 try/catch 안이고 모든 갈래가 `return 0` 이다. `recordChainProgress` →
  // `applyLocked` 에는 실제 throw 경로가 있으므로(DD6) fail-open 은 가정이 아니라
  // 방어해야 하는 조건이다. 인자 실수도 거부가 아니라 **기록 생략 + loud stderr**
  // 다 — 인자가 halt 경로를 바꾸면 그것은 계측이 아니라 게이트다(DD7).
  if (cmd === 'record-halt') {
    try {
      const deps = haltDeps();
      const repoRoot = path.resolve(findRepoRoot(process.cwd()));
      if (!hasRepoMarker(repoRoot)) {
        process.stderr.write('[mccp:record-halt] resolved root has no .claude or .git '
          + 'marker — refusing (nothing written).\n');
        return 0;
      }
      const step = rest['step'];
      if (typeof step !== 'string' || HALT_STEPS.indexOf(step) < 0) {
        process.stderr.write('[mccp:record-halt] --step must be one of '
          + HALT_STEPS.join('|') + ' — record skipped (halt path unaffected).\n');
        return 0;
      }
      const site = rest['site'];
      if (typeof site !== 'string' || !HALT_SITE_RE.test(site)) {
        process.stderr.write('[mccp:record-halt] --site must match '
          + HALT_SITE_RE.source + ' — record skipped (halt path unaffected).\n');
        return 0;
      }
      const entry = { step: step, status: 'halted', halt_site: site };
      const reason = narrowReason(
        typeof rest['reason'] === 'string' ? rest['reason'] : '', repoRoot, deps);
      if (reason) entry.reason = reason;
      const workUnit = resolveWorkUnit(repoRoot,
        typeof rest['work-unit'] === 'string' ? rest['work-unit'] : null, deps);
      if (workUnit) entry.work_unit = workUnit;
      autoChain.recordStep(repoRoot, entry);
      return 0;
    } catch (err) {
      let why;
      try {
        why = require('../derive/mask')
          .scrubAbsPaths((err && err.message) || String(err), process.cwd());
      } catch (_e) { why = 'unreportable'; }
      process.stderr.write('[mccp:record-halt] record failed (' + why
        + ') — halt path unaffected.\n');
      return 0;
    }
  }

  // ── orchestrator-step-wiring M2 — halt 조회 (repo-wide reader) ─────────────
  // UI4: 집계 경계는 저장소 전체다. 쓰기는 worktree-local 이지만 읽기는
  // `git worktree list` 가 보고하는 목록 전체를 순회해 **전역 최신 1건**을 고른다.
  // 실패는 전부 빈 stdout + exit 0 이고 사유는 stderr 한 줄이다 — 호출자(배너)는
  // stdout 이 비면 줄을 생략하고, 사유는 A1 선례대로 자기 wrapper 가 합성한다.
  if (cmd === 'last-halt') {
    try {
      const deps = haltDeps();
      const repoRoot = path.resolve(findRepoRoot(process.cwd()));
      if (!hasRepoMarker(repoRoot)) {
        process.stderr.write('[mccp:last-halt] resolved root has no .claude or .git '
          + 'marker — refusing (banner omitted).\n');
        return 0;
      }
      const r = collectLastHalt(repoRoot, deps);
      if (r.error) {
        process.stderr.write('[mccp:last-halt] ' + deps.mask.scrubAbsPaths(r.error, repoRoot)
          + ' (banner omitted).\n');
        return 0;
      }
      if (r.truncated) {
        // 절삭은 실패가 아니라 **보장 불가** 다. 빈 답이 아니라 그 사실을 낸다.
        const note = 'halt 배너 생략: worktree 목록 절삭(cap ' + r.truncated.cap + '/'
          + r.truncated.total + ')';
        if (rest['json'] === true) {
          emit({ omitted: 'worktree-list-truncated', cap: r.truncated.cap, total: r.truncated.total });
        } else {
          process.stdout.write(note + '\n');
        }
        return 0;
      }
      if (!r.hit) return 0;   // halt 없음 — 조용한 것이 맞다
      if (rest['json'] === true) {
        // review M1 — JSON 소비자도 그대로 출력할 수 있으므로 텍스트 경로와 같은
        // 좁히기를 통과시킨다. `JSON.stringify` 는 파일을 지키지 재생을 지키지 않는다.
        emit({
          step: safeField(r.hit.entry.step, deps) || null,
          site: safeField(r.hit.entry.halt_site, deps) || null,
          ts: safeField(r.hit.entry.ts, deps) || null,
          reason: safeField(r.hit.entry.reason, deps) || null,
          work_unit: safeField(r.hit.entry.work_unit, deps) || null,
          worktree: path.basename(r.hit.worktree),
          self: deps.worktrees.isSelfWorktree(r.hit.worktree, repoRoot),
        });
        return 0;
      }
      process.stdout.write(formatHaltLine(r.hit, repoRoot, deps) + '\n');
      return 0;
    } catch (err) {
      let why;
      try {
        why = require('../derive/mask')
          .scrubAbsPaths((err && err.message) || String(err), process.cwd());
      } catch (_e) { why = 'unreportable'; }
      process.stderr.write('[mccp:last-halt] read failed (' + why + ') — banner omitted.\n');
      return 0;
    }
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
  // orchestrator-step-wiring M2 — 단위 test 가 CLI spawn 없이도 좁히기·해소·선택
  // 규칙을 직접 겨냥할 수 있도록 내보낸다.
  HALT_STEPS: HALT_STEPS,
  HALT_SITE_RE: HALT_SITE_RE,
  BANNER_REASON_MAX: BANNER_REASON_MAX,
  haltDeps: haltDeps,
  scrubControl: scrubControl,
  narrowReason: narrowReason,
  safeField: safeField,
  hasRepoMarker: hasRepoMarker,
  resolveWorkUnit: resolveWorkUnit,
  trailingHalt: trailingHalt,
  collectLastHalt: collectLastHalt,
  formatHaltLine: formatHaltLine,
};
