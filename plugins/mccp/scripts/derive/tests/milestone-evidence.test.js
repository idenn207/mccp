'use strict';

// derive source `milestone_evidence` 계약 test.
//
// 증거 구성의 **수단**을 동작으로 고정한다. 정적 lint 는 `receiptPresent` 의 생산자가
// 하나뿐임을 지키지만, 그 하나가 index 를 보는지 커밋을 보는지는 구별하지 못한다 —
// `fs.existsSync` · `git ls-files` · `git cat-file -e HEAD:` 가 전부 boolean 하나를
// 내기 때문이다. 아래 두 음성 케이스가 그 셋을 갈라놓는다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { scanMilestoneEvidence } = require('../sources/milestone-evidence');
const {
  buildEvidence,
  resolveDefaultRef,
  resolvePlanReference,
  DEFAULT_REF_CANDIDATES,
} = require('../../lib/msw-metrics/b1-evidence-builder');

// --- helpers ----------------------------------------------------------------

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-milestone-ev-'));
  fs.mkdirSync(path.join(root, '.claude', 'prds'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'plans'), { recursive: true });
  return root;
}

function writePrd(root, name, rows) {
  const body = [
    '# ' + name, '',
    '## Delivery Milestones', '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    ...rows.map((r, i) => `| ${i + 1} | ${r.name} | o | ${r.status} | ${r.plan || '—'} |`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, '.claude', 'prds', name + '.prd.md'), body);
}

function baseGit(over) {
  const handlers = over || {};
  return function gitQuery(args) {
    if (handlers.record) handlers.record(args);
    if (args[0] === 'rev-parse' && args.indexOf('--git-dir') !== -1) return { ok: true, stdout: '.git\n', status: 0 };
    if (handlers.handle) {
      const r = handlers.handle(args);
      if (r) return r;
    }
    if (args[0] === 'rev-parse') return { ok: true, stdout: 'deadbeef\n', status: 0 };
    if (args[0] === 'cat-file') return { ok: false, stdout: '', status: 1 };
    return { ok: true, stdout: '', status: 0 };
  };
}

// --- join key 정규화 + 미정규 입력 백스톱 (local review H2) -------------------

test('B1-JOINKEY-RESOLVE: 두 경로 관례를 같은 repo-root 경로로 접고 나머지는 거부한다', () => {
  const prd = '.claude/prds/sample.prd.md';
  // 백틱 셀(repo-root 기준) 과 마크다운 링크(PRD 기준 상대) 는 같은 곳을 가리킨다.
  const a = resolvePlanReference('.claude/plans/x-m1.plan.md', prd);
  const b = resolvePlanReference('../plans/x-m1.plan.md', prd);
  assert.equal(a.ok, true);
  assert.deepEqual([a.path, a.basename], ['.claude/plans/x-m1.plan.md', 'x-m1.plan.md']);
  assert.deepEqual([b.path, b.basename], [a.path, a.basename], 'both conventions must resolve identically');

  // 거부 — 자식 PRD 링크 · repo 밖 · `.claude/` 앵커 밖 · 빈 셀.
  // 전부 **판정 불가**이지 not-shipped 가 아니다(E1).
  assert.equal(resolvePlanReference('archived/other.prd.md', prd).ok, false, 'child PRD link');
  assert.equal(resolvePlanReference('../../../etc/passwd.plan.md', prd).ok, false, 'escapes repo root');
  assert.equal(resolvePlanReference('../../docs/notes.plan.md', prd).ok, false, 'resolves outside .claude/');
  assert.equal(resolvePlanReference('', prd).ok, false, 'empty cell');
  assert.equal(resolvePlanReference('—', prd).ok, false, 'em-dash placeholder');

  // 반대로, PRD 디렉토리 기준으로 풀어도 `.claude/` 안에 남으면 해석은 성립한다 —
  // 앵커 검사는 **해석 후** 위치를 보지 표기 형태를 보지 않는다.
  const nested = resolvePlanReference('sub/notes.plan.md', prd);
  assert.equal(nested.ok, true);
  assert.equal(nested.path, '.claude/prds/sub/notes.plan.md');
});

test('B1-BUILDER-GUARD: 정규화되지 않은 입력은 조회 없이 readError 로 접힌다', () => {
  // 구조적 백스톱 — 호출자가 resolvePlanReference 를 잊어도 **적극적 오판**(not-shipped)
  // 은 나올 수 없어야 한다. 이전에는 `santa-adjudication.prd.md` 같은 basename 이
  // 그대로 들어와 receipt 를 헛조회한 뒤 not-shipped 로 확정됐다.
  const root = mkRepo();
  const calls = [];
  const gitQuery = baseGit({ record: (a) => calls.push(a.join(' ')) });

  const notAPlan = buildEvidence({
    repoRoot: root, planPath: 'santa-adjudication.prd.md',
    planBasename: 'santa-adjudication.prd.md', duplicateKey: false, gitQuery,
  });
  assert.equal(notAPlan.receiptPresent, false);
  assert.match(notAPlan.readError, /does not reference a \.plan\.md file/);
  assert.deepEqual(calls, [], 'a non-plan basename must not reach git at all');

  // 앵커를 벗어난 경로는 git pathspec 이 되기 전에 걸린다.
  const unanchored = buildEvidence({
    repoRoot: root, planPath: '../plans/x-m1.plan.md',
    planBasename: 'x-m1.plan.md', duplicateKey: false, gitQuery,
  });
  assert.match(unanchored.readError, /not repo-root anchored/);
  assert.equal(unanchored.gitReachable, null);
});

// --- receiptPresent 의 판정식 (핵심 3분기) ----------------------------------

test('B1-GIT-TRACKED: an untracked receipt on disk still yields receiptPresent=false', () => {
  const root = mkRepo();
  const receiptDir = path.join(root, '.claude', 'receipts', 'mccp-pr-codex');
  fs.mkdirSync(receiptDir, { recursive: true });
  // 워킹트리에는 **존재한다**. fs.existsSync 구현이라면 여기서 true 가 나온다.
  fs.writeFileSync(path.join(receiptDir, 'sample-m1.json'), '{}');

  const evidence = buildEvidence({
    repoRoot: root,
    planPath: '.claude/plans/sample-m1.plan.md',
    planBasename: 'sample-m1.plan.md',
    duplicateKey: false,
    // untracked — cat-file 도 ls-files 도 실패한다.
    gitQuery: baseGit({ handle: (a) => (a[0] === 'ls-files' ? { ok: false, stdout: '', status: 1 } : null) }),
  });
  assert.equal(evidence.receiptPresent, false);
});

test('B1-RECEIPT-COMMITTED: a staged-but-uncommitted receipt yields receiptPresent=false', () => {
  const root = mkRepo();
  const receiptDir = path.join(root, '.claude', 'receipts', 'mccp-pr-codex');
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.writeFileSync(path.join(receiptDir, 'sample-m1.json'), '{}');

  const seen = [];
  const evidence = buildEvidence({
    repoRoot: root,
    planPath: '.claude/plans/sample-m1.plan.md',
    planBasename: 'sample-m1.plan.md',
    duplicateKey: false,
    // index 에는 등재됐다(`git add` 만 한 상태) — `ls-files --error-unmatch` 는 exit 0.
    // 커밋에는 없다 — `cat-file -e HEAD:<path>` 는 비영점.
    //
    // 이 케이스가 **유일하게** index 확인과 커밋 도달성을 갈라놓는다. untracked stub
    // 만으로는 `fs.existsSync` 구현만 걸러지고 `git ls-files` 구현은 통과한다.
    // staged-only receipt 는 worktree 삭제와 함께 사라지므로 §3.12 의 내구성 계약을
    // 만족하지 않는다.
    gitQuery: baseGit({
      record: (a) => seen.push(a.join(' ')),
      handle: (a) => (a[0] === 'ls-files' ? { ok: true, stdout: '.claude/receipts/mccp-pr-codex/sample-m1.json\n', status: 0 } : null),
    }),
  });
  assert.equal(evidence.receiptPresent, false);
  // 수단도 확인 — 판정에 쓰인 명령이 cat-file 이어야 한다.
  assert.ok(seen.some((s) => s.startsWith('cat-file -e HEAD:')), 'commit reachability must be probed with cat-file');
  assert.ok(!seen.some((s) => s.startsWith('ls-files')), 'ls-files must not be the receipt oracle');
});

test('buildEvidence — 커밋에 도달하면 receiptPresent=true 이고 verdict 를 병기한다', () => {
  const root = mkRepo();
  const evidence = buildEvidence({
    repoRoot: root,
    planPath: '.claude/plans/sample-m1.plan.md',
    planBasename: 'sample-m1.plan.md',
    duplicateKey: false,
    gitQuery: baseGit({
      handle: (a) => {
        if (a[0] === 'cat-file' && a[1] === '-e') return { ok: true, stdout: '', status: 0 };
        if (a[0] === 'cat-file' && a[1] === '-p') {
          return { ok: true, stdout: JSON.stringify({ resolution: { codex_verdict: 'divergent' } }), status: 0 };
        }
        return null;
      },
    }),
  });
  assert.equal(evidence.receiptPresent, true);
  assert.equal(evidence.receiptVerdict, 'divergent');
});

// --- default-ref fallback 3분기 ---------------------------------------------

test('B1-GIT-FALLBACK: origin/HEAD then origin/main then undetermined, never local HEAD', () => {
  assert.deepEqual(DEFAULT_REF_CANDIDATES, ['origin/HEAD', 'origin/main']);

  // (a) origin/HEAD 해석 성공 → 그 ref 로 조회
  const seenA = [];
  const a = buildEvidence({
    repoRoot: '/tmp/x',
    planPath: '.claude/plans/p.plan.md',
    planBasename: 'p.plan.md',
    duplicateKey: false,
    gitQuery: baseGit({
      record: (x) => seenA.push(x),
      handle: (x) => {
        if (x[0] === 'rev-parse' && x[x.length - 1] === 'origin/HEAD') return { ok: true, stdout: 'sha\n', status: 0 };
        if (x[0] === 'ls-tree') return { ok: true, stdout: '.claude/plans/p.plan.md\n', status: 0 };
        return null;
      },
    }),
  });
  assert.equal(a.gitReachable, true);
  const lsTreeA = seenA.filter((x) => x[0] === 'ls-tree');
  assert.ok(lsTreeA.length >= 1);
  assert.equal(lsTreeA[0][3], 'origin/HEAD');

  // (b) origin/HEAD 실패 ∧ origin/main 성공 → origin/main 으로 조회
  const seenB = [];
  const b = buildEvidence({
    repoRoot: '/tmp/x',
    planPath: '.claude/plans/p.plan.md',
    planBasename: 'p.plan.md',
    duplicateKey: false,
    gitQuery: baseGit({
      record: (x) => seenB.push(x),
      handle: (x) => {
        if (x[0] === 'rev-parse' && x[x.length - 1] === 'origin/HEAD') return { ok: false, stdout: '', status: 1 };
        if (x[0] === 'rev-parse' && x[x.length - 1] === 'origin/main') return { ok: true, stdout: 'sha\n', status: 0 };
        if (x[0] === 'ls-tree') return { ok: true, stdout: '.claude/plans/p.plan.md\n', status: 0 };
        return null;
      },
    }),
  });
  assert.equal(b.gitReachable, true);
  const lsTreeB = seenB.filter((x) => x[0] === 'ls-tree');
  assert.equal(lsTreeB[0][3], 'origin/main');

  // (c) 둘 다 실패 → gitReachable:null (undetermined) 이고 **로컬 HEAD 를 조회하지 않는다**.
  // 폴백하면 미머지 브랜치의 작업물이 "default branch 에 있다" 로 오판돼 not-shipped
  // 방향의 drift 가 통째로 증발한다.
  const seenC = [];
  const c = buildEvidence({
    repoRoot: '/tmp/x',
    planPath: '.claude/plans/p.plan.md',
    planBasename: 'p.plan.md',
    duplicateKey: false,
    gitQuery: baseGit({
      record: (x) => seenC.push(x),
      handle: (x) => (x[0] === 'rev-parse' && x.indexOf('--git-dir') === -1
        ? { ok: false, stdout: '', status: 1 } : null),
    }),
  });
  assert.equal(c.gitReachable, null);
  assert.ok(!seenC.some((x) => x[0] === 'ls-tree' && x[3] === 'HEAD'),
    'local HEAD must never be used as the default-ref fallback');

  // resolveDefaultRef 자체도 시도 순서를 보고한다.
  const resolved = resolveDefaultRef(baseGit({
    handle: (x) => (x[0] === 'rev-parse' && x.indexOf('--git-dir') === -1
      ? { ok: false, stdout: '', status: 1 } : null),
  }));
  assert.equal(resolved.ref, null);
  assert.deepEqual(resolved.attempted, ['origin/HEAD', 'origin/main']);
  assert.match(resolved.error, /local HEAD is deliberately NOT used/);
});

// --- 전역 중복 decision_id --------------------------------------------------

test('B1-DUP-DECISION: a decision_id shared across PRDs downgrades every sharing row', () => {
  const root = mkRepo();
  // decision_id 에는 PRD 성분이 없으므로 **서로 다른 PRD** 가 같은 basename 을 선언해도
  // 같은 receipt 를 가리킨다. PRD 단위로만 집계하면 이 조합이 통과한다.
  writePrd(root, 'alpha', [{ name: 'A1', status: 'complete', plan: '`.claude/plans/shared.plan.md`' }]);
  writePrd(root, 'beta', [{ name: 'B1', status: 'pending', plan: '`.claude/plans/shared.plan.md`' }]);

  // receipt 는 커밋에 도달한다 — 중복 검출이 없으면 양쪽 다 shipped 로 복제된다.
  const out = scanMilestoneEvidence(root, {
    gitQuery: baseGit({ handle: (a) => (a[0] === 'cat-file' && a[1] === '-e' ? { ok: true, stdout: '', status: 0 } : null) }),
  });

  assert.equal(out.denominator, 2);
  const verdicts = out.adjudications.map((a) => a.evidence_verdict);
  assert.deepEqual(verdicts, ['undetermined', 'undetermined'],
    'both sharing rows must be downgraded — picking either one confirms a misjudgement');
  assert.equal(out.drift_count, 0);
  assert.ok(out.warnings.some((w) => /duplicate decision_id "shared" shared by 2 rows across 2 prd\(s\)/.test(w)),
    'warnings=' + JSON.stringify(out.warnings));
});

// --- 분모 규약 · degraded ----------------------------------------------------

test('source — 비정규 status 는 분모에서 빠지고 raw_row_count 항등식이 성립', () => {
  const root = mkRepo();
  writePrd(root, 'mixed', [
    { name: 'M1', status: 'complete', plan: '`.claude/plans/m1.plan.md`' },
    { name: 'M2', status: 'complete (verify) · gated' },
    { name: 'M3', status: 'pending' },
  ]);
  const out = scanMilestoneEvidence(root, { gitQuery: baseGit() });
  assert.equal(out.raw_row_count, 3);
  assert.equal(out.noncanonical_status_count, 1);
  assert.equal(out.denominator, 2);
  assert.equal(out.raw_row_count, out.denominator + out.noncanonical_status_count);
  assert.equal(out.degraded, false);
  // 증거 미확정 행은 **분모에 남는다** — 빼면 증거를 못 구할수록 성적이 좋아진다.
  assert.ok(out.undetermined_evidence_count >= 1);
});

test('source — 조회 계층 사망(git 미존재)이면 degraded:true', () => {
  const root = mkRepo();
  writePrd(root, 'x', [{ name: 'M1', status: 'pending', plan: '`.claude/plans/m1.plan.md`' }]);
  const out = scanMilestoneEvidence(root, {
    gitQuery: () => { throw new Error('spawn git ENOENT'); },
  });
  assert.equal(out.degraded, true);
  assert.match(out.error, /git query layer unavailable/);
  assert.ok(out.warnings.length >= 1);
});

test('source — archived/ 는 비재귀 스캔에서 제외되고 그 수를 병기한다', () => {
  const root = mkRepo();
  fs.mkdirSync(path.join(root, '.claude', 'prds', 'archived'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'archived', 'old.prd.md'), '# old\n');
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'archived', 'old2.prd.md'), '# old2\n');
  writePrd(root, 'active', [{ name: 'M1', status: 'pending' }]);

  const out = scanMilestoneEvidence(root, { gitQuery: baseGit() });
  assert.equal(out.archived_excluded_count, 2);
  assert.equal(out.raw_row_count, 1);
});

test('source — plan 셀이 .plan.md 가 아니면 no_plan (not-shipped 로 접지 않는다)', () => {
  const root = mkRepo();
  // 실측 회귀: review-loop-trust.prd.md 의 행들은 Plan 셀에 **자식 PRD** 를 건다.
  // plan-body.js#extractPlanPath 의 관대한 fallback 이 그것을 경로로 돌려주므로,
  // 가드가 없으면 있지도 않은 receipt 를 조회한 뒤 not-shipped 로 오계상된다.
  writePrd(root, 'parent', [
    { name: 'P1', status: 'complete', plan: '[child.prd.md](archived/child.prd.md)' },
    // 해석은 되지만 `.claude/` 앵커 밖으로 나간다 → 어느 파일인지 확정 불가.
    { name: 'P2', status: 'complete', plan: '`../../outside/x.plan.md`' },
    // `..` 가 repo root 위로 올라간다 → 별도 분기.
    { name: 'P3', status: 'complete', plan: '`../../../../etc/passwd.plan.md`' },
  ]);
  const out = scanMilestoneEvidence(root, { gitQuery: baseGit() });
  assert.equal(out.denominator, 3);
  assert.equal(out.no_plan_count, 3);
  assert.equal(out.drift_count, 0);
  assert.deepEqual(out.adjudications.map((a) => a.evidence_verdict),
    ['undetermined', 'undetermined', 'undetermined']);
  assert.ok(out.warnings.some((w) => /does not reference a \.plan\.md file/.test(w)));
  assert.ok(out.warnings.some((w) => /not repo-root anchored/.test(w)));
  assert.ok(out.warnings.some((w) => /escapes the repo root/.test(w)));
});

test('source — PRD 기준 상대 링크는 해석해서 대조한다 (커버리지를 조용히 깎지 않는다)', () => {
  const root = mkRepo();
  // 실측 회귀: 이 repo 의 PRD 는 두 관례를 섞어 쓴다 — 백틱 셀은 repo-root 기준이고,
  // 마크다운 링크는 PRD 파일 기준 상대다(`../plans/x.plan.md`). 후자를 거부하면
  // multi-session-work-loop PRD 자신의 milestone 들이 통째로 대조 범위에서 빠진다.
  writePrd(root, 'mixed', [
    { name: 'R1', status: 'complete', plan: '[m1](../plans/mixed-m1.plan.md)' },
    { name: 'R2', status: 'complete', plan: '`.claude/plans/mixed-m2.plan.md`' },
  ]);
  const out = scanMilestoneEvidence(root, {
    gitQuery: baseGit({
      handle: (a) => {
        if (a[0] === 'cat-file' && a[1] === '-e') {
          // 두 경로 모두 같은 규칙으로 decision_id 가 파생돼야 한다.
          return /mixed-m[12]\.json$/.test(a[2]) ? { ok: true, stdout: '', status: 0 } : null;
        }
        return null;
      },
    }),
  });
  assert.equal(out.no_plan_count, 0, 'both conventions must resolve');
  assert.deepEqual(out.adjudications.map((a) => a.decision_id), ['mixed-m1', 'mixed-m2']);
  assert.deepEqual(out.adjudications.map((a) => a.evidence_verdict), ['shipped', 'shipped']);
  assert.equal(out.drift_count, 0);
});

test('source — plan 이 아카이브로 이동해도 basename 으로 도달성을 인정한다', () => {
  const root = mkRepo();
  writePrd(root, 'moved', [{ name: 'M1', status: 'complete', plan: '`.claude/plans/moved-m1.plan.md`' }]);
  const out = scanMilestoneEvidence(root, {
    gitQuery: baseGit({
      handle: (a) => {
        if (a[0] !== 'ls-tree') return null;
        // 정확 경로 조회는 빈 결과(파일이 옮겨졌다).
        if (a.indexOf('.claude/plans/moved-m1.plan.md') !== -1) return { ok: true, stdout: '', status: 0 };
        // 디렉토리 인덱스에는 아카이브 경로로 살아 있다.
        return { ok: true, stdout: '.claude/PRPs/plans/archived/moved-m1.plan.md\n', status: 0 };
      },
    }),
  });
  // 도달 가능 ∧ receipt 부재 → evidence-gap(undetermined) 이지 not-shipped 가 아니다.
  assert.equal(out.adjudications[0].evidence_verdict, 'undetermined');
  assert.match(out.adjudications[0].reason, /evidence-gap/);
  assert.equal(out.drift_count, 0);
});
