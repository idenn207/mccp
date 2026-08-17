'use strict';

// B1 증거 구성 — **유일한 I/O 지점**.
//
// b1-status-drift.js 오라클은 순수 함수라 주입된 `receiptPresent` 의 **출처를 볼 수
// 없다**: `fs.existsSync` 도 `git ls-files` 도 `git cat-file` 도 똑같이 boolean 하나를
// 낸다. 런타임에 출처를 검증할 방법이 원리상 없으므로, 대신 **생산자가 하나뿐이게**
// 만든다 — derive/sources/milestone-evidence.js 와 archive-complete/scan.js 가 둘 다
// 이 모듈만 호출하고, b1-independence-lint.js 축 (iv) 가 `receiptPresent` 의 생성이
// 이 파일 밖에 0건임을 정적으로 고정한다. 규율이 아니라 **다른 경로가 존재하지 않아서**
// 출처가 보장된다.
//
// 이 모듈은 `fs` 를 require 하지 **않는다**. 모든 증거가 git object store 에서만 나오므로
// 워킹트리 상태가 판정에 새어들 수 없다.
//
// ── receiptPresent 는 커밋 도달성이다 (index 확인도 파일 존재도 아니다) ──────────
// `git cat-file -e HEAD:<path>` 의 성공 여부로 판정한다.
//   - `fs.existsSync` 는 untracked 사본도 통과시킨다.
//   - `git ls-files --error-unmatch` 는 **index(staging area)** 를 보므로 `git add` 만
//     하고 커밋하지 않은 파일에도 exit 0 을 낸다(실측 확인). staged-only receipt 는
//     worktree 삭제와 함께 사라지므로 §3.12 가 규정한 *"worktree 삭제 후에도 대조가
//     성립"* 을 만족하지 못한다.
// 여기서 묻는 것은 *"증거가 내구적인가"* 이지 *"머지됐는가"* 가 아니라서 `HEAD` 를 쓴다.
// plan 파일 도달성이 default-ref 를 쓰는 것은 **질문이 다르기** 때문이다 — 그쪽은
// "이 작업 단위가 default branch 에 도달했는가" 를 묻는다.

const { execFileSync } = require('child_process');

const RECEIPT_DIR = '.claude/receipts/mccp-pr-codex';

// default-ref 후보. 순서가 계약이다 — 둘 다 실패하면 **조회 실패**(gitReachable=null)
// 이며 로컬 `HEAD` 로 폴백하지 않는다. 폴백하면 미머지 브랜치의 작업물이 "default
// branch 에 있다" 로 오판돼 not-shipped 방향의 drift 가 통째로 증발한다.
const DEFAULT_REF_CANDIDATES = ['origin/HEAD', 'origin/main'];

function defaultGitQuery(repoRoot) {
  return function gitQuery(args) {
    try {
      const stdout = execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return { ok: true, stdout: stdout, status: 0 };
    } catch (err) {
      return {
        ok: false,
        stdout: (err && typeof err.stdout === 'string') ? err.stdout : '',
        status: (err && typeof err.status === 'number') ? err.status : 1,
        error: (err && err.message) || String(err),
      };
    }
  };
}

function toPosix(p) {
  return String(p == null ? '' : p).split('\\').join('/');
}

// ── join key 정규화도 이 모듈이 소유한다 (local review H2) ─────────────────────
//
// 처음에는 이 규칙이 derive source 안에만 있었고 archive-complete/scan.js 는 원문
// plan 셀을 그대로 넘겼다. 그 비대칭이 실측으로 **같은 39행 중 5행에서 두 표면의
// 판정을 갈랐다** — 오라클과 builder 를 공유해도 *입력* 을 공유하지 않으면 "두 표면이
// 같은 질문에 같은 답을 낸다" 는 성립하지 않는다. receiptPresent 를 단일 생산자로
// 묶은 것과 **같은 이유로** 경로 해석도 여기 둔다.
//
// plan-body.js#extractPlanPath 는 렌더러용이라 관대하다: `.plan.md` 링크를 못 찾으면
// 마지막에 *괄호 안 아무 것이나* 돌려준다(`:85-86`). 그 관대함이 렌더러에는 맞지만
// join key 로는 틀리다 — 실측으로 `review-loop-trust.prd.md` 의 네 행이 자식 **PRD**
// 링크(`santa-adjudication.prd.md`)를 물고 들어왔다.
//
// 규칙은 decision_id 파생 규칙의 대우다: decision_id 는 후행 `.plan.md` 를 제거해
// 얻으므로, 그 접미사가 없는 basename 은 애초에 plan 참조가 아니다. 나아가 경로가
// repo-root 기준(`.claude/…`)이 아니면 어느 파일인지 확정할 수 없다 — 확정 불가를
// `not-shipped` 로 접으면 부재를 판정으로 바꾸는 것이므로(E1) 호출자는 `undetermined`
// 로 두어야 한다.
//
// 경로는 두 관례로 들어온다 — 백틱 셀은 repo-root 기준(`.claude/plans/x.plan.md`)이고,
// 마크다운 링크는 **PRD 파일 기준 상대**(`../plans/x.plan.md`)다. 후자를 그대로 거부하면
// 그 PRD 의 milestone 들이 통째로 대조 범위에서 빠져 커버리지가 조용히 깎인다(실측:
// 대조 가능한 11행 중 5행이 그 이유로 빠져 있었다). 정규화는 위양성을 만들지 않는다 —
// 해석 뒤에도 `.claude/` 앵커를 벗어나면 여전히 거부한다.

// `a/b/../c` → `a/c`. `..` 가 앞을 다 먹고 밖으로 나가면 남겨 두어 아래 앵커 검사가 거부한다.
function posixNormalize(p) {
  const out = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

const PLAN_ANCHOR = '.claude/';

function resolvePlanReference(planPath, prdRelPath) {
  const raw = toPosix(planPath).trim();
  if (!raw) return { ok: false, reason: 'row declares no plan link' };

  if (!/\.plan\.md$/i.test(raw)) {
    return { ok: false, reason: 'plan cell does not reference a .plan.md file: ' + raw };
  }

  const prdDir = toPosix(prdRelPath).split('/').slice(0, -1).join('/');
  const resolved = raw.indexOf(PLAN_ANCHOR) === 0
    ? posixNormalize(raw)                                   // repo-root 기준(백틱 셀)
    : posixNormalize(prdDir + '/' + raw);                   // PRD 파일 기준(마크다운 링크)

  if (resolved.indexOf('..') === 0 || resolved.indexOf('/..') !== -1) {
    return { ok: false, reason: 'plan path escapes the repo root: ' + raw };
  }
  if (resolved.indexOf(PLAN_ANCHOR) !== 0) {
    return { ok: false, reason: 'plan path is not repo-root anchored (expected .claude/…): ' + raw };
  }
  return { ok: true, path: resolved, basename: resolved.split('/').pop() };
}

// decision_id 는 receipt **경로 성분**으로 들어가므로 경로 성분이 될 수 있는 문자를
// 거부한다. basename 추출 후에도 `..` 나 구분자가 남으면 traversal 이 되므로
// fail-closed 로 막는다(오라클의 판정 이전 단계에서 걸러야 git 인자에 닿지 않는다).
function isSafeDecisionId(id) {
  return typeof id === 'string'
    && id.length > 0
    && id.length <= 200
    && !/[\\/]/.test(id)
    && id !== '.'
    && id !== '..'
    && !/\.\./.test(id)
    && !id.startsWith('-');
}

function decisionFromBasename(planBasename) {
  return String(planBasename || '').replace(/\.plan\.md$/i, '');
}

// origin/HEAD → origin/main → null. 시도한 ref 를 `attempted` 로 돌려주어 test 가
// "로컬 HEAD 를 조회하지 않았다" 를 **호출 인자로** 확인할 수 있게 한다.
function resolveDefaultRef(gitQuery) {
  const attempted = [];
  for (const ref of DEFAULT_REF_CANDIDATES) {
    attempted.push(ref);
    const r = gitQuery(['rev-parse', '--verify', '--quiet', ref]);
    if (r && r.ok && String(r.stdout || '').trim()) {
      return { ref: ref, attempted: attempted, error: null };
    }
  }
  return {
    ref: null,
    attempted: attempted,
    error: 'default ref unresolved (tried ' + DEFAULT_REF_CANDIDATES.join(', ') + '); '
      + 'local HEAD is deliberately NOT used as a fallback',
  };
}

// receipt 의 committed 사본에서 resolution.codex_verdict 를 읽는다. 워킹트리 사본을
// 읽지 않는 이유는 receiptPresent 와 **같은 객체**를 설명해야 하기 때문이다.
// 판정에 쓰이지 않는 병기 필드이므로 판독 실패는 readError 로 올리지 않고 null 로 둔다.
function readReceiptVerdict(gitQuery, receiptPath) {
  const r = gitQuery(['cat-file', '-p', 'HEAD:' + receiptPath]);
  if (!r || !r.ok) return null;
  try {
    const parsed = JSON.parse(r.stdout);
    const v = parsed && parsed.resolution && parsed.resolution.codex_verdict;
    return typeof v === 'string' && v ? v : null;
  } catch (_) {
    return null;
  }
}

// default ref 위의 plan 파일 목록. plan 이 `.claude/plans/` 에서
// `.claude/PRPs/plans/archived/` 로 **이동**해도 그 작업 단위가 default branch 에
// 도달했다는 사실은 변하지 않으므로, 정확 경로가 빗나가면 basename 으로 한 번 더 본다.
// 이 fallback 이 없으면 아카이브 chore(§3.11)가 지나간 모든 milestone 이
// `not-shipped` 로 오계상된다 — 측정하려는 drift 가 아니라 링크의 낡음이다.
const PLAN_DIRS = ['.claude/plans', '.claude/PRPs/plans'];

function buildPlanIndex(gitQuery, ref) {
  const r = gitQuery(['ls-tree', '-r', '--name-only', ref, '--'].concat(PLAN_DIRS));
  const index = { paths: new Set(), basenames: new Set() };
  if (!r || !r.ok) return index;
  String(r.stdout || '').split(/\r?\n/).filter(Boolean).forEach((p) => {
    const norm = toPosix(p).trim();
    if (!norm) return;
    index.paths.add(norm);
    index.basenames.add(norm.split('/').pop());
  });
  return index;
}

// buildEvidence — 오라클이 먹을 **정확히 5필드** 객체를 만든다.
//
//   buildEvidence({ repoRoot, planPath, planBasename, duplicateKey, gitQuery, defaultRef })
//     → { receiptPresent, receiptVerdict, gitReachable, readError, duplicateKey }
//
// `defaultRef` 를 주입하면 ref 해석을 건너뛴다(source 가 행마다 재해석하지 않도록).
function buildEvidence(opts) {
  const o = opts || {};
  const gitQuery = typeof o.gitQuery === 'function' ? o.gitQuery : defaultGitQuery(o.repoRoot || process.cwd());
  const duplicateKey = !!o.duplicateKey;

  const evidence = {
    receiptPresent: false,
    receiptVerdict: null,
    gitReachable: null,
    readError: null,
    duplicateKey: duplicateKey,
  };

  // 정규화되지 않은 입력에 대한 fail-closed 백스톱 (local review H2). 호출자는
  // resolvePlanReference 를 먼저 거쳐야 하지만, 규율은 기계 장치가 아니다 — 잊은
  // 호출자가 **적극적 오판**(not-shipped)을 얻는 일만은 구조적으로 막는다. 접미사가
  // 없으면 basename 은 애초에 plan 참조가 아니므로 조회를 시작하지 않는다.
  const rawBasename = String(o.planBasename == null ? '' : o.planBasename).trim();
  if (!/\.plan\.md$/i.test(rawBasename)) {
    evidence.readError = 'plan basename does not reference a .plan.md file: ' + JSON.stringify(rawBasename)
      + ' (caller must resolve the plan cell with resolvePlanReference first)';
    return evidence;
  }

  const decisionId = decisionFromBasename(rawBasename);
  if (!isSafeDecisionId(decisionId)) {
    evidence.readError = 'unsafe decision_id derived from plan basename: ' + JSON.stringify(rawBasename);
    return evidence;
  }

  // 1) receipt 커밋 도달성 — 판정의 강증거.
  const receiptPath = RECEIPT_DIR + '/' + decisionId + '.json';
  let receiptProbe;
  try {
    receiptProbe = gitQuery(['cat-file', '-e', 'HEAD:' + receiptPath]);
  } catch (err) {
    evidence.readError = 'receipt reachability probe threw: ' + ((err && err.message) || String(err));
    return evidence;
  }
  if (!receiptProbe || typeof receiptProbe !== 'object') {
    evidence.readError = 'receipt reachability probe returned no result';
    return evidence;
  }
  evidence.receiptPresent = receiptProbe.ok === true;

  if (evidence.receiptPresent) {
    evidence.receiptVerdict = readReceiptVerdict(gitQuery, receiptPath);
    // receipt 가 있으면 오라클이 곧바로 shipped 를 내므로 git 도달성은 판정에 무관하다.
    // 불필요한 spawn 을 아끼되, 필드는 스키마대로 null 을 유지한다.
    return evidence;
  }

  // 2) plan 파일의 default-branch 도달성 — not-shipped 를 가르는 유일한 축.
  //
  // 여기서만 planPath 를 검사한다(receipt 축은 basename 만 쓰므로 위에서 이미 끝났다).
  // repo-root 앵커를 벗어난 경로는 어느 파일인지 확정할 수 없다 — git 에 넘겨 오류를
  // 유발하고 그 오류를 조회 실패로 읽는 것보다, 여기서 이유를 밝히는 편이 정직하다.
  const planPath = toPosix(o.planPath).trim();
  if (!planPath) {
    evidence.readError = 'milestone row declares no plan path';
    return evidence;
  }
  if (planPath.indexOf('.claude/') !== 0 || planPath.indexOf('/..') !== -1) {
    evidence.readError = 'plan path is not repo-root anchored: ' + JSON.stringify(planPath)
      + ' (caller must resolve the plan cell with resolvePlanReference first)';
    return evidence;
  }

  let ref = typeof o.defaultRef === 'string' && o.defaultRef ? o.defaultRef : null;
  if (!ref) {
    const resolved = resolveDefaultRef(gitQuery);
    if (!resolved.ref) {
      // gitReachable 을 null 로 남겨 오라클이 undetermined 를 내게 한다.
      evidence.gitReachable = null;
      return evidence;
    }
    ref = resolved.ref;
  }

  let treeProbe;
  try {
    treeProbe = gitQuery(['ls-tree', '-r', '--name-only', ref, '--', planPath]);
  } catch (err) {
    evidence.readError = 'plan reachability probe threw: ' + ((err && err.message) || String(err));
    return evidence;
  }
  if (!treeProbe || !treeProbe.ok) {
    evidence.gitReachable = null;
    return evidence;
  }
  if (String(treeProbe.stdout || '').trim().length > 0) {
    evidence.gitReachable = true;
    return evidence;
  }

  // 정확 경로 miss — 이동했을 수 있으므로 basename 으로 한 번 더 본다(위 PLAN_DIRS 주석).
  const index = o.planIndex || buildPlanIndex(gitQuery, ref);
  const basename = planPath.split('/').pop();
  evidence.gitReachable = !!(index && index.basenames && index.basenames.has(basename));
  return evidence;
}

module.exports = {
  buildEvidence,
  buildPlanIndex,
  resolveDefaultRef,
  resolvePlanReference,
  defaultGitQuery,
  decisionFromBasename,
  isSafeDecisionId,
  RECEIPT_DIR,
  DEFAULT_REF_CANDIDATES,
};
