'use strict';

// B1 판정 오라클 단위 test + **변조 불변성**(독립성 반증 test).
//
// 오라클은 순수 함수라 이 test 들은 파일을 읽지 않고 주입된 `evidence` 객체만 쓴다 —
// 위조 불가성의 근거는 test 가 아니라 Task 1 의 타입 경계이고, 여기서는 그 경계가
// 유지되는지를 **확인**할 뿐이다.
//
// 변조 불변성은 **양방향**이다. status 를 뒤집으면 drift 판정은 **반드시** 바뀌어야
// 하므로("그것이 지표의 존재 이유"), 불변이어야 하는 것은 아래층인 증거 verdict 뿐이다.
// 한쪽만 단언하는 test 는 논리적으로 성립하지 않는다 — 상수를 반환하는 오라클도
// 증거층 단언을 통과하기 때문이다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  adjudicateMilestone,
  decisionFromBasename,
  EVIDENCE_FIELDS,
} = require('../msw-metrics/b1-status-drift');
const scanJs = require('../archive-complete/scan');
const { scanMilestoneEvidence } = require('../../derive/sources/milestone-evidence');

// --- helpers ----------------------------------------------------------------

function ev(over) {
  return Object.assign({
    receiptPresent: false,
    receiptVerdict: null,
    gitReachable: false,
    readError: null,
    duplicateKey: false,
  }, over || {});
}

const PLAN = 'sample-m1.plan.md';
const PLAN_PATH = '.claude/plans/sample-m1.plan.md';

// --- 판정 사다리 ------------------------------------------------------------

test('B1-EQ-BASENAME: decisionFromBasename equivalence', () => {
  // 오라클은 순수성 유지를 위해 scan.js 를 import 하지 않고 같은 규칙을 재구현한다.
  // 두 구현이 갈라지면 join key 가 두 표면에서 어긋나는데 아무도 모른다 — 그 간극을
  // 닫는 것이 이 단언이다.
  const inputs = [
    'sample-m1.plan.md', 'SAMPLE.PLAN.MD', 'a.plan.md', 'no-suffix', '', null, undefined,
    'x.plan.md.plan.md', 'weird.plan.MD', 'dotted.name.plan.md', '.plan.md',
    'multi-session-work-loop-m6.plan.md', 'trailing.plan.md ', ' lead.plan.md',
  ];
  for (const inp of inputs) {
    assert.equal(
      decisionFromBasename(inp),
      scanJs.decisionFromBasename(inp),
      'mismatch for input: ' + JSON.stringify(inp)
    );
  }
});

test('B1-EVIDENCE-SCHEMA: extra key and each missing field are both rejected', () => {
  // 여분 키 — 스키마 밖 키 주입
  const extra = adjudicateMilestone({
    planBasename: PLAN, planPath: PLAN_PATH,
    evidence: Object.assign(ev(), { docStatus: 'complete' }),
  });
  assert.equal(extra.verdict, 'undetermined');
  assert.match(extra.reason, /evidence-schema-invalid/);

  // 누락 — 5필드 각각을 하나씩 뺀 5개 입력. 한쪽만 test 하면 4필드짜리 evidence 의
  // `undefined` 가 `false` 로 접혀 **부재가 판정으로 바뀐다**(E1 위반).
  for (const drop of EVIDENCE_FIELDS) {
    const partial = ev();
    delete partial[drop];
    const r = adjudicateMilestone({ planBasename: PLAN, planPath: PLAN_PATH, evidence: partial });
    assert.equal(r.verdict, 'undetermined', 'dropping ' + drop + ' must be rejected');
    assert.match(r.reason, /evidence-schema-invalid/, 'dropping ' + drop + ' must name the schema');
    assert.match(r.reason, new RegExp(drop));
  }

  // 타입 위반도 같은 축이다.
  const badType = adjudicateMilestone({
    planBasename: PLAN, planPath: PLAN_PATH, evidence: ev({ receiptPresent: 'yes' }),
  });
  assert.equal(badType.verdict, 'undetermined');
  assert.match(badType.reason, /evidence-schema-invalid/);

  // evidence 자체가 객체가 아닌 경우
  assert.equal(adjudicateMilestone({ planBasename: PLAN, evidence: null }).verdict, 'undetermined');
  assert.equal(adjudicateMilestone({}).verdict, 'undetermined');
});

test('B1-SHIPPED-ON-DIVERGENT: a divergent ship receipt still adjudicates as shipped', () => {
  // mccp 는 audited override 로 divergent 인 채 ship 하는 경로를 정식으로 가진다
  // (직전 M5 가 그 경로로 ship 됐다). codex_verdict 를 ship 전제로 걸면 정상 ship 이
  // drift 로 오계상된다 — verdict 는 병기될 뿐 분자에 영향을 주지 않아야 한다.
  const r = adjudicateMilestone({
    planBasename: PLAN, planPath: PLAN_PATH,
    evidence: ev({ receiptPresent: true, receiptVerdict: 'divergent' }),
  });
  assert.equal(r.verdict, 'shipped');
  assert.equal(r.source, 'receipt');
  assert.equal(r.codex_verdict, 'divergent');
  assert.match(r.evidence_ref, /^\.claude\/receipts\/mccp-pr-codex\/sample-m1\.json$/);

  // unavailable·null 도 마찬가지로 shipped 를 막지 않는다.
  for (const v of ['unavailable', 'critical', 'skipped', null]) {
    const x = adjudicateMilestone({
      planBasename: PLAN, planPath: PLAN_PATH,
      evidence: ev({ receiptPresent: true, receiptVerdict: v }),
    });
    assert.equal(x.verdict, 'shipped', 'receiptVerdict=' + v + ' must not block shipped');
  }
});

test('오라클 — duplicateKey / readError / gitReachable:null 은 전부 undetermined', () => {
  const dup = adjudicateMilestone({
    planBasename: PLAN, planPath: PLAN_PATH,
    // 충돌은 receipt 존재보다 **먼저** 판정된다 — 아니면 충돌한 두 행이 같은 receipt 로
    // 조용히 복제된다.
    evidence: ev({ duplicateKey: true, receiptPresent: true }),
  });
  assert.equal(dup.verdict, 'undetermined');
  assert.match(dup.reason, /duplicate-decision-id/);

  const err = adjudicateMilestone({
    planBasename: PLAN, planPath: PLAN_PATH, evidence: ev({ readError: 'git exploded' }),
  });
  assert.equal(err.verdict, 'undetermined');
  assert.match(err.reason, /evidence-read-error/);

  const nullGit = adjudicateMilestone({
    planBasename: PLAN, planPath: PLAN_PATH, evidence: ev({ gitReachable: null }),
  });
  assert.equal(nullGit.verdict, 'undetermined');
  assert.match(nullGit.reason, /git-query-failed/);

  // plan 링크 부재
  const noPlan = adjudicateMilestone({ planBasename: '', planPath: null, evidence: ev() });
  assert.equal(noPlan.verdict, 'undetermined');
  assert.match(noPlan.reason, /no-plan-link/);
});

test('오라클 — receipt 부재 ∧ plan 이 default branch 에 있으면 evidence-gap (not-shipped 아님)', () => {
  // §3.12 이전 작업 단위는 receipt 가 git-tracked 가 아니었다. 그 구간을 not-shipped 로
  // 단정하면 과거를 drift 로 오계상한다 — 부재는 결함 부재가 아니다(E1).
  const gap = adjudicateMilestone({
    planBasename: PLAN, planPath: PLAN_PATH, evidence: ev({ gitReachable: true }),
  });
  assert.equal(gap.verdict, 'undetermined');
  assert.match(gap.reason, /evidence-gap/);

  const notShipped = adjudicateMilestone({
    planBasename: PLAN, planPath: PLAN_PATH, evidence: ev({ gitReachable: false }),
  });
  assert.equal(notShipped.verdict, 'not-shipped');
  assert.equal(notShipped.source, 'git');
});

// --- 변조 불변성 (2단 양방향) ------------------------------------------------

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-b1-mutation-'));
  fs.mkdirSync(path.join(root, '.claude', 'prds'), { recursive: true });
  return root;
}

// `## Delivery Milestones` 표의 Status 열(4번째 셀)만 프로그램적으로 뒤집는다.
// 4 토큰 전부가 drift 경계를 가로지르도록 짝지었다
// (complete↔pending · in-progress↔dropped).
const FLIP = {
  complete: 'pending', pending: 'complete',
  'in-progress': 'dropped', dropped: 'in-progress',
};

function flipStatuses(body) {
  let inTable = false;
  return body.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (/^\|\s*-+/.test(t)) { inTable = true; return line; }
    if (!inTable) return line;
    if (!t.startsWith('|')) { if (t !== '') inTable = false; return line; }
    const inner = t.replace(/^\|/, '').replace(/\|$/, '');
    const cells = inner.split('|');
    if (cells.length < 5) return line;
    const cur = cells[3].trim().toLowerCase();
    if (!FLIP[cur]) return line;
    cells[3] = ' ' + FLIP[cur] + ' ';
    return '| ' + cells.map((c) => c.trim()).join(' | ') + ' |';
  }).join('\n');
}

// 결정적 git stub — 증거층을 status 와 완전히 분리한다. `shipped` 를 낼 receipt 를
// 명시 집합으로 주고, 나머지는 도달 불가.
function stubGitQuery(shippedDecisions) {
  return function gitQuery(args) {
    if (args[0] === 'rev-parse' && args.indexOf('--git-dir') !== -1) return { ok: true, stdout: '.git\n', status: 0 };
    if (args[0] === 'rev-parse') return { ok: true, stdout: 'deadbeef\n', status: 0 };
    if (args[0] === 'cat-file' && args[1] === '-e') {
      const m = /mccp-pr-codex\/(.+)\.json$/.exec(args[2] || '');
      const hit = m && shippedDecisions.indexOf(m[1]) !== -1;
      return hit ? { ok: true, stdout: '', status: 0 } : { ok: false, stdout: '', status: 1 };
    }
    if (args[0] === 'cat-file' && args[1] === '-p') {
      return { ok: true, stdout: JSON.stringify({ resolution: { codex_verdict: 'converged' } }), status: 0 };
    }
    return { ok: true, stdout: '', status: 0 };
  };
}

function evidencePairs(result) {
  return result.adjudications
    .map((a) => (a.decision_id || '(none):' + a.milestone) + '=' + a.evidence_verdict)
    .sort();
}

// 합성 fixture — `shipped` 증거 + unshipped-side status 행을 반드시 포함해 뒤집으면
// drift 가 확실히 반전되게 구성한다. 실 PRD 만 쓰면 반전이 0 건이라 판정층 단언이
// **공허하게 통과**할 수 있다.
function writeFixture(root) {
  const rows = [
    // shipped 증거 + pending → 뒤집으면 complete 가 되어 drift 가 사라진다
    ['S1', 'pending', '`.claude/plans/fix-a.plan.md`'],
    // 증거 없음 + complete → 뒤집으면 pending 이 되어 drift 가 사라진다
    ['S2', 'complete', '`.claude/plans/fix-b.plan.md`'],
    // shipped 증거 + complete → 일치. 뒤집으면 pending 이 되어 drift 가 **생긴다**
    ['S3', 'complete', '`.claude/plans/fix-c.plan.md`'],
  ];
  const body = [
    '# fixture', '',
    '## Delivery Milestones', '',
    '| # | Milestone | Outcome | Status | Plan |',
    '|---|---|---|---|---|',
    ...rows.map((r, i) => `| ${i + 1} | ${r[0]} | o | ${r[1]} | ${r[2]} |`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'fixture.prd.md'), body);
}

test('B1-FIXTURE-SANITY: the synthetic fixture actually reverses at least one drift row', () => {
  const root = mkRepo();
  writeFixture(root);
  const git = stubGitQuery(['fix-a', 'fix-c']);

  const before = scanMilestoneEvidence(root, { gitQuery: git });
  const orig = fs.readFileSync(path.join(root, '.claude', 'prds', 'fixture.prd.md'), 'utf8');
  fs.writeFileSync(path.join(root, '.claude', 'prds', 'fixture.prd.md'), flipStatuses(orig));
  const after = scanMilestoneEvidence(root, { gitQuery: git });

  // 건전성 가드 — fixture 가 조용히 퇴화하면 아래 두 test 가 무의미해진다.
  assert.ok(before.denominator >= 3, 'fixture must enumerate its rows');
  const beforeKeys = before.drift_items.map((d) => d.milestone).sort();
  const afterKeys = after.drift_items.map((d) => d.milestone).sort();
  assert.notDeepEqual(beforeKeys, afterKeys, 'fixture must produce at least one drift reversal');
  assert.ok(before.drift_count > 0 || after.drift_count > 0, 'fixture must produce drift on one side');
});

test('B1-MUTATION-EVIDENCE: evidence verdicts are invariant under status mutation', () => {
  // 실 PRD 와 합성 fixture **양쪽**에서 돌린다 — 실 PRD 는 프로덕션 형태를,
  // fixture 는 경계 조합을 각각 덮는다.
  const cases = [];

  // (a) 합성 fixture
  const fxRoot = mkRepo();
  writeFixture(fxRoot);
  cases.push({ label: 'fixture', root: fxRoot, git: stubGitQuery(['fix-a', 'fix-c']) });

  // (b) 실 PRD 사본 — 프로덕션 표 형태를 그대로 쓴다.
  const realRoot = mkRepo();
  const realPrdDir = path.resolve(__dirname, '..', '..', '..', '..', '..', '.claude', 'prds');
  let copied = 0;
  for (const name of fs.readdirSync(realPrdDir).filter((n) => n.endsWith('.prd.md'))) {
    fs.copyFileSync(path.join(realPrdDir, name), path.join(realRoot, '.claude', 'prds', name));
    copied += 1;
  }
  assert.ok(copied > 0, 'real PRD corpus must be readable');
  cases.push({ label: 'real-prd', root: realRoot, git: stubGitQuery(['workflow-orchestration-live-activation-m2']) });

  for (const c of cases) {
    const before = scanMilestoneEvidence(c.root, { gitQuery: c.git });
    for (const name of fs.readdirSync(path.join(c.root, '.claude', 'prds'))) {
      const p = path.join(c.root, '.claude', 'prds', name);
      fs.writeFileSync(p, flipStatuses(fs.readFileSync(p, 'utf8')));
    }
    const after = scanMilestoneEvidence(c.root, { gitQuery: c.git });

    // 증거층은 불변이어야 한다. 하나라도 달라지면 증거 판정이 문서에 의존한다는 뜻이다.
    assert.deepEqual(evidencePairs(after), evidencePairs(before),
      c.label + ': evidence verdicts moved when only the document status changed');
    // decision_id 추출도 동일해야 한다 — status 셀 위치에 영향받으면 join 이 어긋난다.
    assert.deepEqual(
      after.adjudications.map((a) => a.decision_id).sort(),
      before.adjudications.map((a) => a.decision_id).sort(),
      c.label + ': decision_id extraction moved with the status column'
    );
    assert.equal(after.denominator, before.denominator, c.label + ': denominator moved');
  }
});

test('B1-MUTATION-DRIFT: the drift verdict DOES change under status mutation', () => {
  // 판정층은 **반드시** 바뀌어야 한다. 이 단언이 없으면 상수를 반환하는 오라클도
  // 위 증거층 단언을 통과한다(무의미한 불변성).
  const root = mkRepo();
  writeFixture(root);
  const git = stubGitQuery(['fix-a', 'fix-c']);

  const before = scanMilestoneEvidence(root, { gitQuery: git });
  const p = path.join(root, '.claude', 'prds', 'fixture.prd.md');
  fs.writeFileSync(p, flipStatuses(fs.readFileSync(p, 'utf8')));
  const after = scanMilestoneEvidence(root, { gitQuery: git });

  const beforeSet = before.drift_items.map((d) => d.milestone + ':' + d.doc_status).sort();
  const afterSet = after.drift_items.map((d) => d.milestone + ':' + d.doc_status).sort();
  assert.notDeepEqual(afterSet, beforeSet, 'drift items must react to the document status');

  // 구체적 방향도 고정한다: S3 는 원본에서 일치(complete + shipped)였다가
  // 뒤집힌 뒤 pending + shipped 가 되어 drift 로 올라온다.
  assert.ok(!beforeSet.some((s) => s.startsWith('S3:')), 'S3 must agree before the flip');
  assert.ok(afterSet.some((s) => s.startsWith('S3:')), 'S3 must become drift after the flip');
});
