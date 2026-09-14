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

// PR-Codex R2 F2 — **경계가 되는 control 문자는 지우지 말고 공백으로 접는다.**
//
// `ABS_PATH_TOKEN_RE`의 경계 클래스는 `[\s'\"`(\[=,]` 이고 JS `\s` 에는 `\u000b`(VT)와
// `\u000c`(FF)가 들어간다. 그런데 그 둘은 `RESIDUAL_CONTROL_RE` 에도 들어 있어 **삭제**
// 대상이다. 그래서 control 을 먼저 지우면 masker 가 요구하는 경계가 함께 사라지고
// `failed\u000b/home/private/credentials.json` 이 마스킹 없이 통과한다. 실측:
//   control 삭제 먼저 → `failed/home/private/credentials.json` (원문 노출)
//   경계 보존 후 마스킹 → `failed <outside-repo:credentials.json>`
//
// 이것이 정확히 아래 `narrowReason` 주석이 "존재하지 않는다"고 단언한 입력이다. 그
// 단언의 근거였던 "control 제거는 경로 후보를 늘리기만 한다"는 `\t` 처럼 공백으로
// 접히는 문자에만 성립하고, 삭제되는 문자에는 성립하지 않는다.
//
// `\t` 를 이미 공백으로 접고 있으므로 같은 처리를 이 둘로 넓히는 것이 최소 수정이다.
// 집합이 완전한 이유: `RESIDUAL_CONTROL_RE` ∩ JS `\s` = {`\u000b`, `\u000c`} 이다
// (`\n`·`\r` 은 RESIDUAL 범위 밖이라 이미 보존되고, `\u00a0` 는 `\u007f-\u009f` 밖이다).
const BOUNDARY_CONTROL_RE = /[\t\u000b\u000c]/g;

function scrubControl(text, deps) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return deps.stripAnsi(text).replace(BOUNDARY_CONTROL_RE, ' ').replace(RESIDUAL_CONTROL_RE, '');
}

// DD7 — 순서가 계약이다: ANSI/control 제거 → 경로 스크럽 → 절삭.
// 절삭이 마지막인 이유는 앞의 둘이 길이를 바꾸므로 200자 계약이 최종 문자열 기준으로
// 성립해야 하기 때문이다. 그 근거는 앞 두 단계의 **상대 순서**에 대해서는 아무 말도
// 하지 않았고, 그 자리에 있던 순서(경로 → control)는 틀렸다.
//
// santa R4 (reviewer B/HIGH — 재현됨) — `ABS_PATH_TOKEN_RE`는 경로 앞에
// 문자열 시작이나 `[\s'"`(\[=,]` 중 하나를 요구한다(`derive/mask.js`). ESC는 그
// 집합에 없으므로 `ESC[31m/home/u/private/key.json`에서 `/` 바로 앞 문자는 `m`이고
// 매칭이 **일어나지 않는다**. 그 뒤 `scrubControl`이 ANSI 시퀀스를 통째로 지우면
// 남는 것은 마스킹되지 않은 절대경로다 — 즉 두 단계가 각자 제 일을 하는데 순서
// 때문에 경로가 정확히 그 사이로 빠져나갔다. 실측:
//   경로 먼저 → `ESC[31m/home/u/private/key.json` (무변경) → ANSI 제거 → 원문 노출
//   control 먼저 → `/home/u/private/key.json` → 경로 스크럽 → `<outside-repo:key.json>`
//
// 반대 방향의 위험은 없다: control 제거가 만들어 내는 것은 **더 많은** 경로 후보이지
// 더 적은 후보가 아니므로, 순서를 바꿔 마스킹을 놓치는 입력은 존재하지 않는다.
function narrowReason(text, repoRoot, deps) {
  if (typeof text !== 'string' || text.length === 0) return '';
  return deps.oneLineExcerpt(deps.mask.scrubAbsPaths(scrubControl(text, deps), repoRoot));
}

// review M1 — reader 측 재강제는 **읽는 모든 필드**에 걸린다. `scrubControl` 은
// 설계상 CR/LF 를 남기고(`oneLineExcerpt` 가 단어 경계를 보존하며 접도록) 길이도
// 제한하지 않으므로, 그것만 통과한 값은 아직 한 줄이 아니다. 배너는 인용부호 없이
// `echo` 로 나가고 `chain_progress` 는 git-tracked STATE.md 라 PR 로 유입될 수 있는
// 값이다 — 접지 않으면 개행 하나로 `[mccp:work] ` 접두를 위조한 줄을 심을 수 있다.
// 그래서 step·site·ts·work_unit 도 reason 과 같은 좁히기를 통과한다.
//
// santa R3 (reviewer B/HIGH) — "읽는 모든 필드"는 필드 목록만이 아니라 **좁히기의
// 축 전체**를 뜻해야 한다. 이 함수는 control 축만 재강제하고 경로 축을 빠뜨렸고,
// 그 축은 `narrowReason` 이 **쓰기 경로에서만** 걸고 있었다. 그래서 구버전 recorder
// 가 썼거나 손으로 편집된, 또는 다른 worktree 의 STATE.md 에서 읽어 온 halt 의
// `reason`·`step`·`work_unit` 에 담긴 절대경로가 배너와 `--json` 양쪽으로 그대로
// 나갔다. 쓰기 시점 좁히기가 이미 디스크에 있는 레코드를 되돌리지 못한다는 것이
// 이 reader 재강제의 존재 이유이므로, 축을 하나만 되걸면 그 이유가 절반만 성립한다.
//
// 따라서 `safeField` 는 `narrowReason` 과 **같은 3단계**(경로 스크럽 → control 제거
// → 절삭)를 지난다. 두 함수를 나란히 두면 축이 다시 갈라지므로 하나를 다른 하나로
// 정의한다 — 차이는 null/undefined 강제뿐이다. `repoRoot` 는 선택 인자가 아니다:
// 기본값을 두면 그것을 잊은 호출자가 조용히 옛 동작으로 돌아간다.
function safeField(value, deps, repoRoot) {
  return narrowReason(String(value === undefined || value === null ? '' : value), repoRoot, deps);
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
// santa R2 (reviewer B/HIGH) — `quiet` 는 **parse 경고**에 대한 계약이고, 위 근거는
// 전부 그 축이다. read **실패**는 다른 축인데 같은 침묵을 상속하고 있었다. ENOENT 는
// 정상이다(STATE.md 없는 worktree 는 halt 도 없다) — 그러나 EACCES·EIO 는 "halt 가
// 없다" 가 아니라 **읽지 못했다** 이고, `collectLastHalt` 가 전역 최댓값을 고르므로
// 그 침묵은 곧 다른 worktree 의 더 오래된 halt 를 최신인 양 내놓는다. 그것은 바로
// 아래 절삭 분기가 "보장 불가면 답 대신 사실을 말한다" 로 이미 거부한 실패 모드다.
// PRD 결정 3(fail-open 이되 조용히 삼키지 않는다)도 같은 것을 요구한다.
//
// 그래서 반환 계약은 **바뀌지 않는다**(여전히 null, 여전히 fail-open). 바뀌는 것은
// 호출자가 그 사실을 알 수 있게 되었다는 것뿐이고, 보고 여부는 호출자가 정한다 —
// `resolveWorkUnit` 처럼 커버리지를 주장하지 않는 호출자는 콜백을 넘기지 않는다.
function readStateFrontmatter(worktreePath, deps, onReadError) {
  const sp = path.join(worktreePath, '.claude', 'state', 'STATE.md');
  let raw;
  try {
    raw = fs.readFileSync(sp, 'utf8');
  } catch (e) {
    if (e && e.code !== 'ENOENT' && typeof onReadError === 'function') {
      onReadError(e.code);
    }
    return null;
  }
  const parsed = deps.stateWriter.parseStateMd(raw, { quiet: true });
  return (parsed && parsed.frontmatter) || null;
}

// errno 는 Node 가 만드는 값이지 입력이 아니지만, 이 줄도 인용부호 없이 터미널로
// 나가므로 `safeField` 와 같은 규율을 둔다 — 열거 밖은 값을 옮기지 않고 이름만 낸다.
function errnoToken(code) {
  return (typeof code === 'string' && /^[A-Z][A-Z0-9]{1,15}$/.test(code)) ? code : 'UNKNOWN';
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
// santa R4 (reviewer A/MEDIUM · reviewer B/HIGH) — `onParseError`는 read 축과 **다른
// 축**이고, 둘을 가르는 선은 "이 reader 가 모르는 것"과 "손상된 것"이다.
//
// `readStateFrontmatter` 가 frontmatter 를 못 얻는 경우는 보고하지 **않는다**: 다른
// `state_version` 을 쓰는 이웃 worktree 의 STATE.md 가 정확히 그 형태이고(실측:
// `parseStateMd` 가 `frontmatter:null` 반환), 그것은 손상이 아니라 버전 차이다 —
// 흔하고, 정상이고, test (12) 가 그 침묵을 계약으로 못박는다.
//
// 반면 여기는 frontmatter 가 **파싱됐고** `chain_progress` 가 **존재하는데** 그 값이
// JSON 이 아닌 경우다. 그것은 버전 차이로 설명되지 않는 손상이고, 그 worktree 가 전역
// 최댓값 비교에서 조용히 빠지면 다른 worktree 의 더 오래된 halt 가 최신인 양 나간다 —
// R2 가 errno 축에서 닫은 바로 그 실패 모드가 parse 채널로 도착한 것이다.
function trailingHalt(frontmatter, onParseError) {
  if (!frontmatter || typeof frontmatter.chain_progress !== 'string') return null;
  let log;
  try {
    log = JSON.parse(frontmatter.chain_progress);
  } catch (_e) {
    if (typeof onParseError === 'function') onParseError();
    return null;
  }
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
  // santa R2 — 커버리지 구멍을 **세는** 자리. 경로는 담지 않는다: 운영자가 행동하는 데
  // 필요한 것은 "몇 개를 못 읽었고 왜인가" 이고, worktree 이름은 신뢰 불가 입력이라
  // 담으면 좁히기 표면이 하나 더 늘어난다.
  const unreadable = [];
  for (const w of all) {
    if (!w || typeof w.path !== 'string') continue;
    let hit = null;
    try {
      hit = trailingHalt(readStateFrontmatter(w.path, deps, function (code) {
        unreadable.push(errnoToken(code));
      }), function () {
        // 토큰은 errno 와 같은 열거 규율을 지난다 — 이 배열은 stderr 로 그대로 나가고,
        // 두 축을 한 배열에 담되 사유는 구별 가능해야 한다.
        unreadable.push('PARSE');
      });
    } catch (_e) { continue; }
    if (!hit || typeof hit.ts !== 'string') continue;
    if (!best || hit.ts > best.entry.ts) best = { entry: hit, worktree: w.path };
  }
  // present-only — 키 부재는 "구멍 없음" 이고, 0 을 실어 두면 이 축이 생기기 전의
  // 결과와 구별되지 않는다(이 저장소의 present-only 규약).
  return unreadable.length ? { hit: best, unreadable: unreadable } : { hit: best };
}

function formatHaltLine(best, repoRoot, deps) {
  const e = best.entry;
  // Task 4 (3) + security S1 + review M1 — reader 는 자신이 읽은 레코드에 대해 좁히기를
  // **다시** 강제한다. 쓰기 시점 좁히기는 이미 디스크에 있는(구버전 recorder 가 쓴,
  // 또는 손으로 편집된) 레코드를 되돌리지 못하고, 이 줄은 인용부호 없이 터미널로 나간다.
  // 이 줄로 나가는 **다섯 구성요소**(step · site · ts · reason · worktree)가 전부 같은
  // 좁히기를 통과한다 — 넷만 통과시키면 남은 하나가 통로가 된다.
  //
  // orchestrator-step-wiring M3 (Task 2) — `worktree`가 정확히 그 남은 하나였다.
  // 주석은 M1부터 이 불변식을 선언했지만 아래 `path.basename(...)`은 좁히기를
  // 우회했고, 주석이 센 "네 필드"는 실제 구성요소 수와도 어긋나 있었다.
  const parts = ['직전 halt:', 'step=' + safeField(e.step, deps, repoRoot),
    'site=' + safeField(e.halt_site, deps, repoRoot), '(' + safeField(e.ts, deps, repoRoot) + ')'];
  const reason = safeField(e.reason, deps, repoRoot);
  if (reason) {
    parts.push('reason=' + (reason.length > BANNER_REASON_MAX
      ? reason.slice(0, BANNER_REASON_MAX - 1) + '…' : reason));
  }
  let line = parts.join(' ');
  if (!deps.worktrees.isSelfWorktree(best.worktree, repoRoot)) {
    // 규율은 둘이다: 모든 값이 같은 경로를 지난다, **그리고** 빈 값이면 구성요소째
    // 생략한다. `safeField`는 `narrowReason`(control 제거 → 경로 스크럽 → 절삭)이라
    // 제어문자만으로 이루어진 basename을 빈 문자열로 접는데, 출력 조건이 값이 아니라
    // `!isSelfWorktree(...)`라서 그대로 두면 라벨만 남은 `· worktree=`가 나간다.
    // 위 `reason`이 이미 값 기반 가드를 쓰는 것과 같은 형태로 맞춘다.
    const worktreeName = safeField(path.basename(best.worktree), deps, repoRoot);
    if (worktreeName) line += ' · worktree=' + worktreeName;
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
      // santa R2 (reviewer B/HIGH) — 커버리지 구멍은 halt 유무보다 **먼저** 나간다.
      // `!r.hit` 뒤에 두면 정확히 최악의 경우 — 못 읽은 worktree 에만 halt 가 있어
      // 답이 비는 경우 — 에 침묵하게 되고, 그때 호출자(배너)는 빈 stdout 을 "halt
      // 없음(정상)" 으로 읽는다. 절삭 분기와 같은 규율이되 답을 버리지는 않는다:
      // 절삭은 아무 worktree 도 읽지 못한 것이고 이쪽은 부분 커버리지라, 있는 답을
      // 내되 그것이 전역 최신이라고 보장하지 못한다는 사실을 함께 낸다.
      // santa R3 (reviewer A/HIGH · reviewer B/HIGH — 양 lane 독립 검출) — stderr 만으로는
      // 이 경고가 **정확히 필요한 경우에** 운영자에게 닿지 않는다. 유일한 소비처인
      // work.md 배너는 `if (out) { …stdout… } else { …stderr… }` 형태라 stdout 이 비었을
      // 때만 stderr 를 읽는데, 커버리지 구멍이 문제가 되는 경우는 정반대다 — 답이
      // **있고** 그 답이 전역 최신이 아닐 수 있는 경우다. 그래서 R2 는 reader 에만
      // 배선하고 표면을 열지 못했다.
      //
      // 그러므로 자격은 답과 같은 스트림을 탄다. stderr 도 남긴다 — errno 목록이라는
      // 더 자세한 사실을 나르고, `!r.hit`(못 읽은 worktree 에만 halt 가 있어 답이 비는
      // 경우) 에서는 그쪽이 유일한 통로이기 때문이다. 둘은 중복이 아니라 서로 다른
      // 경우를 덮는다.
      if (r.unreadable) {
        process.stderr.write('[mccp:last-halt] coverage incomplete: '
          + r.unreadable.length + ' worktree STATE.md unreadable ('
          + Array.from(new Set(r.unreadable)).sort().join(',')
          + ') — the reported halt may not be the newest.\n');
      }
      if (!r.hit) return 0;   // halt 없음 — 조용한 것이 맞다
      if (rest['json'] === true) {
        // review M1 — JSON 소비자도 그대로 출력할 수 있으므로 텍스트 경로와 같은
        // 좁히기를 통과시킨다. `JSON.stringify` 는 파일을 지키지 재생을 지키지 않는다.
        emit({
          step: safeField(r.hit.entry.step, deps, repoRoot) || null,
          site: safeField(r.hit.entry.halt_site, deps, repoRoot) || null,
          ts: safeField(r.hit.entry.ts, deps, repoRoot) || null,
          reason: safeField(r.hit.entry.reason, deps, repoRoot) || null,
          work_unit: safeField(r.hit.entry.work_unit, deps, repoRoot) || null,
          // Task 2 — 텍스트 경로와 같은 좁히기. 다른 필드가 전부 `safeField`를
          // 지나는데 이것만 raw basename이면 JSON 소비자가 그대로 재생할 때
          // 통로가 남는다.
          worktree: safeField(path.basename(r.hit.worktree), deps, repoRoot) || null,
          self: deps.worktrees.isSelfWorktree(r.hit.worktree, repoRoot),
          // santa R2 — present-only. JSON 소비자도 텍스트 소비자와 같은 사실을
          // 받아야 한다. `undefined` 는 `JSON.stringify` 가 키째 지우므로 구멍이
          // 없으면 필드 자체가 없다.
          coverage_incomplete: r.unreadable ? r.unreadable.length : undefined,
        });
        return 0;
      }
      // 텍스트 경로의 자격. 배너는 한 줄 예산이라 errno 원문이 아니라 개수만 싣고,
      // 상세는 stderr 와 `--json` 의 `coverage_incomplete` 가 나른다. 구멍이 없으면
      // 토큰 자체가 없다(구성요소 생략 규율 — 위 `reason`·`worktree` 와 같은 형태).
      let haltLine = formatHaltLine(r.hit, repoRoot, deps);
      if (r.unreadable) haltLine += ' · coverage=incomplete(' + r.unreadable.length + ')';
      process.stdout.write(haltLine + '\n');
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
