'use strict';

// santa-adjudication M1 — severity contract + 게이트 재배선의 회귀 그물.
//
// 이 파일이 **커버리지 계약 전량을 소유한다.** test 이름의 대괄호 id는 plan
// `.claude/plans/santa-adjudication-m1.plan.md`의 커버리지 표와 1:1이고,
// Validation의 스크립트가 그 id의 존재와 각 본문에 assert가 하나 이상 있는지를
// 기계로 대조한다. 항목이 다루는 대상이 `gate.js`든 `cli.js`든 `santa-loop.md`든
// receipt든 **test가 사는 곳은 이 파일**이다 — 대상 모듈별로 나누면 스크립트가
// 찾지 못한다. 예외는 `santa-gate.test.js` 하나이고 그 파일은 단언 코드에 diff가
// 없으므로 새 id를 받지 않는다.
//
// 순수 oracle만 test하면 배선 결함을 놓친다는 것이 이 repo의 실측 교훈이므로
// (`santa-loop-cap.test.js` 머리말), CLI를 겨눈 항목은 tmpdir에 `git init`한 진짜
// repo fixture 위에서 in-process `runCli`를 지난다 — 방어 장치를 우회하지 않고
// 그 위에서 돈다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const gate = require('../santa/gate');
const seal = require('../santa/seal');
const { runCli, EX_OK, EX_USAGE, MAX_FAILURE_SCENARIO_CHARS } = require('../santa/cli');

const SANTA_LOOP_MD = path.join(__dirname, '..', '..', '..', 'commands', 'santa-loop.md');

// `validateReason(strict)`을 실제로 통과하는 문자열 — 30자 이상 · 3단어 이상 ·
// 금칙 1-token 아님 · filler 아님. 코드 어휘(`test` 등)는 면제되지만 굳이 쓰지
// 않는다.
const SUBSTANTIVE = 'recordReviewer drops the second envelope, so a one-reviewer round seals as converged';
// 원장에만 있어야 하는 문자열 — receipt·리포트에 새는지 감시하는 canary다.
const CANARY = 'SANTA_FINDING_CANARY_4b17c2';

// ── fixture helpers ──────────────────────────────────────────────────────────

function finding(over) {
  return Object.assign({
    claim: 'the merge step loses one element',
    severity: 'HIGH',
    failureScenario: SUBSTANTIVE,
    evidence: null,
    structured: true,
  }, over || {});
}

function reviewer(id, verdict, findings) {
  return {
    id: id,
    model: 'model-' + id,
    verdict: verdict,
    criticalIssues: (findings || []).map(function (f) { return f.claim; }),
    findings: findings || [],
  };
}

// legacy envelope — `findings` 키 자체가 없다(M1 이전에 원장에 쌓인 형태).
function legacyReviewer(id, verdict, criticalIssues) {
  return { id: id, model: 'model-' + id, verdict: verdict, criticalIssues: criticalIssues || [] };
}

function decide(reviewers, severityGate) {
  return gate.decideAdjudicatedVerdict({
    reviewers: reviewers,
    round: 0,
    cap: 3,
    severityGate: severityGate === undefined ? 'enforce' : severityGate,
  });
}

function captureStderr(fn) {
  const chunks = [];
  const orig = process.stderr.write;
  process.stderr.write = function (c) { chunks.push(String(c)); return true; };
  let value;
  try { value = fn(); } finally { process.stderr.write = orig; }
  return { value: value, stderr: chunks.join('') };
}

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'santa-adj-')));
  const g = function (args) { execFileSync('git', args, { cwd: dir, stdio: 'ignore' }); };
  g(['init', '-q']);
  g(['checkout', '-q', '-b', 'santa-fixture']);
  g(['config', 'user.email', 'santa@test.local']);
  g(['config', 'user.name', 'santa']);
  // seal → receipt write가 base_sha/head_sha를 위해 HEAD를 요구한다.
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n');
  g(['add', '-A']);
  g(['commit', '-qm', 'init']);
  return dir;
}

function statePath(repo, slug) {
  return path.join(repo, '.claude', 'state', 'santa-loop', slug + '.json');
}

function readState(repo, slug) {
  return JSON.parse(fs.readFileSync(statePath(repo, slug), 'utf8'));
}

function bytes(p) {
  try { return fs.readFileSync(p); } catch (_e) { return null; }
}

// in-process CLI. runCli는 exit code를 **반환**하고 process.exit을 부르지 않는다.
function cli(args) {
  const outC = [], errC = [];
  const so = process.stdout.write, se = process.stderr.write;
  process.stdout.write = function (c) { outC.push(String(c)); return true; };
  process.stderr.write = function (c) { errC.push(String(c)); return true; };
  let code;
  try { code = runCli(args); } finally {
    process.stdout.write = so;
    process.stderr.write = se;
  }
  return { code: code, stdout: outC.join(''), stderr: errC.join('') };
}

function writeReviewerFile(repo, name, obj) {
  const p = path.join(repo, '.claude', 'state', 'santa-loop', 'tmp', name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  return p;
}

function record(repo, slug, id, reviewerJson) {
  const file = writeReviewerFile(repo, 'reviewer-' + id + '.json', reviewerJson);
  return cli(['record', '--cwd', repo, '--decision', slug, '--round', '0',
    '--id', id, '--model', 'model-' + id, '--reviewer-file', file]);
}

function beginRound(repo, slug) {
  return cli(['begin-round', '--cwd', repo, '--decision', slug]);
}

// ── env 파서 ─────────────────────────────────────────────────────────────────

test('[1] parseSeverityGate: 미설정은 enforce · off는 off · 불량값은 loud warn 후 enforce', () => {
  assert.equal(gate.parseSeverityGate({}), 'enforce', '미설정은 default enforce');
  assert.equal(gate.parseSeverityGate(undefined), 'enforce', 'env 자체 부재도 default');
  assert.equal(gate.parseSeverityGate({ MCCP_SANTA_SEVERITY_GATE: '' }), 'enforce');
  assert.equal(gate.parseSeverityGate({ MCCP_SANTA_SEVERITY_GATE: 'off' }), 'off');
  assert.equal(gate.parseSeverityGate({ MCCP_SANTA_SEVERITY_GATE: ' enforce ' }), 'enforce');

  const bad = captureStderr(function () {
    return gate.parseSeverityGate({ MCCP_SANTA_SEVERITY_GATE: 'OFF' });
  });
  assert.equal(bad.value, 'enforce', '열거값 밖은 default로 fail-open (대소문자 구분)');
  assert.match(bad.stderr, /MCCP_SANTA_SEVERITY_GATE/,
    '조용한 fallback은 오타를 감춘다 — warn이 필수다');
});

// ── classifyFinding ──────────────────────────────────────────────────────────

test('[2] classifyFinding: CRITICAL/HIGH + 실질 failureScenario → blocking', () => {
  ['CRITICAL', 'HIGH'].forEach(function (sev) {
    const c = gate.classifyFinding(finding({ severity: sev }));
    assert.equal(c.blocking, true, sev + '는 실질 시나리오가 있으면 blocking이다');
    assert.equal(c.structured, true);
    assert.equal(c.severity, sev);
    assert.equal(c.reason, 'ok', 'blocking:true일 때만 reason은 ok다');
  });
});

test('[3] classifyFinding: MEDIUM/LOW는 structured이되 blocking이 아니다 (보존)', () => {
  ['MEDIUM', 'LOW'].forEach(function (sev) {
    const c = gate.classifyFinding(finding({ severity: sev }));
    assert.equal(c.blocking, false, sev + '는 무게를 갖지 않는다');
    assert.equal(c.structured, true, '강등이 아니라 무게 제외다 — finding은 남는다');
    assert.equal(c.severity, sev, '값이 사라지면 보고서에서 복원할 수 없다');
    assert.equal(c.reason, 'severity-below-gate');
  });
});

test('[4] classifyFinding: 시나리오 부재·1-token·filler·실질성 하한 미달은 전부 blocking이 아니다 (하한은 표시폭 기준)', () => {
  const absent = gate.classifyFinding(finding({ failureScenario: null }));
  assert.equal(absent.blocking, false);
  assert.equal(absent.reason, 'no-failure-scenario');
  assert.equal(absent.structured, true, '부재는 계약 위반이 아니라 blocking 미주장 선언이다');

  const oneToken = gate.classifyFinding(finding({ failureScenario: 'no' }));
  assert.equal(oneToken.blocking, false);
  assert.equal(oneToken.reason, 'insubstantial-failure-scenario');

  const filler = gate.classifyFinding(finding({
    failureScenario: 'lorem ipsum dolor sit amet consectetur adipiscing elit',
  }));
  assert.equal(filler.blocking, false);
  assert.equal(filler.reason, 'insubstantial-failure-scenario');

  // MIN_LENGTH = 30 (force-override-reason.js). 29자는 거부, 그 위는 통과.
  const short = 'crashes on an empty input';
  assert.ok(short.length < 30, '이 fixture는 30자 하한 아래여야 의미가 있다');
  const tooShort = gate.classifyFinding(finding({ failureScenario: short }));
  assert.equal(tooShort.blocking, false);
  assert.equal(tooShort.reason, 'insubstantial-failure-scenario');

  // 넷 다 형태는 계약을 만족했으므로 structured는 유지된다 — 강등하면 실질성
  // 미달 하나가 라운드 전체를 partial로 만들어 계약 축과 무게 축이 섞인다.
  assert.equal(tooShort.structured, true);
  assert.equal(filler.structured, true);

  // ── 하한은 문자 수가 아니라 **표시폭**이다 (code-review M1) ────────────────
  //
  // `validateReason`의 MIN_LENGTH(30)는 영어 override 사유용으로 보정된 문자 수라,
  // 같은 정보량을 한글로 쓰면 하한 아래로 떨어져 구체적인 시나리오가 강등된다.
  // 그 강등은 fail-open이고(blocking이 remark가 된다), 완화와 겹치면 CRITICAL을 낸
  // FAIL 리뷰어가 있는 라운드가 NICE가 된다. 게이트의 엄격도가 리뷰어가 고른 언어에
  // 달리게 두는 것은 방어할 수 없다.
  const korean = '빈 배열에서 첫 원소를 읽어 크래시한다';
  assert.ok(korean.length < 30, '이 fixture는 문자 수로는 하한 아래여야 의미가 있다');
  assert.equal(gate.classifyFinding(finding({ failureScenario: korean })).blocking, true,
    '전각 폭 환산 뒤에는 하한을 넘는다');

  // 그러나 폭 환산은 **길이 축 하나만** 스크립트 중립으로 만든다. 나머지 규칙은
  // 원본 그대로다 — 이것이 없으면 "한글이면 다 통과"가 되어 완화가 아니라 무력화다.
  const noSpaces = '가나다라마바사아자차카타파하가나다';   // 폭 34 ≥ 30, 그러나 1 token
  assert.ok(noSpaces.length * 2 >= 30, '이 fixture는 폭으로는 하한을 넘어야 한다');
  const fewWords = gate.classifyFinding(finding({ failureScenario: noSpaces }));
  assert.equal(fewWords.blocking, false, '단어 수 규칙은 폭 환산 뒤에도 살아 있다');
  assert.equal(fewWords.reason, 'insubstantial-failure-scenario');

  // 순수 ASCII에는 **항등**이다 — 영어 경로의 판정은 한 건도 바뀌지 않는다.
  // (위 네 단언이 그 항등의 본체이고, 경계값 하나를 명시로 못박는다.)
  const exactly30 = 'crashes when the input list is emptyy'.slice(0, 30);
  assert.equal(exactly30.length, 30);
  assert.equal(gate.classifyFinding(finding({ failureScenario: exactly30 })).blocking, true);
  assert.equal(
    gate.classifyFinding(finding({ failureScenario: exactly30.slice(0, 29) })).blocking, false,
    'ASCII 29자는 여전히 하한 미달이다 — 폭 환산이 영어 임계를 흔들지 않는다');
});

test('[5] classifyFinding: 미인식 severity는 blocking이 아니라 계약 위반이다', () => {
  const c = gate.classifyFinding(finding({ severity: 'BLOCKER' }));
  assert.equal(c.structured, false, '미인식 severity는 finding 하나를 올리는 대신 라운드를 partial로 떨어뜨린다');
  assert.equal(c.blocking, false);
  assert.equal(c.severity, null);
  assert.equal(c.reason, 'unstructured');

  const lower = gate.classifyFinding(finding({ severity: 'critical' }));
  assert.equal(lower.structured, false, 'severity 비교는 대소문자를 구분한다');

  const nonString = gate.classifyFinding(finding({ severity: 3 }));
  assert.equal(nonString.severity, null);
  assert.equal(nonString.blocking, false);
});

// ── analyzeReviewers ─────────────────────────────────────────────────────────

test('[6] analyzeReviewers: 두 리뷰어의 동일 claim은 blocking 1건으로 합쳐지고 byReviewer는 각각 센다', () => {
  const shared = { claim: '  The Merge   Step loses one element  ' };
  const a = reviewer('A', 'FAIL', [finding(), finding({ claim: shared.claim })]);
  const b = reviewer('B', 'FAIL', [finding()]);
  const r = gate.analyzeReviewers([a, b]);

  assert.equal(r.blocking.length, 1, '정규화 claim이 같으면 한 건이다 (소문자 + 공백 축약 + trim)');
  assert.deepEqual(r.blocking[0].ids, ['A', 'B'], 'ids는 같은 지적을 낸 리뷰어 전부를 담는다');
  assert.deepEqual(r.byReviewer.A, { findings: 2, structured: 2, blocking: 2 });
  assert.deepEqual(r.byReviewer.B, { findings: 1, structured: 1, blocking: 1 });
  assert.equal(r.contract, 'full');
  assert.deepEqual(r.distinctIds, ['A', 'B']);

  // 같은 claim을 두 리뷰어가 **다른 무게로** 냈다면 병합 행은 높은 쪽을 남긴다
  // (code-review L2). 최초 관측값을 유지하면 A의 HIGH가 B의 CRITICAL을 가려 보고서가
  // 실제보다 가벼운 severity를 보여준다.
  const mixed = gate.analyzeReviewers([
    reviewer('A', 'FAIL', [finding({ claim: 'same claim', severity: 'HIGH' })]),
    reviewer('B', 'FAIL', [finding({ claim: 'Same  Claim ', severity: 'CRITICAL' })]),
  ]);
  assert.equal(mixed.blocking.length, 1, '정규화 claim이 같으므로 한 건이다');
  assert.equal(mixed.blocking[0].severity, 'CRITICAL',
    '병합 행은 관측된 최고 severity를 남긴다');

  // 전역 함수 — 어떤 입력에도 던지지 않는다. Task 2의 의사코드가 증거 0건 검사보다
  // 먼저 이 함수를 부르므로 빈 입력에서 던지면 그 경로 전체가 죽는다.
  [[], null, undefined, 'nope', 42].forEach(function (bad) {
    const empty = gate.analyzeReviewers(bad);
    assert.equal(empty.contract, 'full');
    assert.deepEqual(empty.blocking, []);
    assert.deepEqual(empty.distinctIds, []);
    assert.deepEqual(empty.mismatches, []);
  });
});

// ── decideAdjudicatedVerdict ─────────────────────────────────────────────────

test('[7] contract=full · blocking 0 · 리뷰어 하나가 FAIL → NICE (PRD 1순위 시나리오)', () => {
  const r = decide([
    reviewer('A', 'FAIL', [finding({ severity: 'MEDIUM' })]),
    reviewer('B', 'PASS', []),
  ]);
  assert.equal(r.verdict, 'NICE',
    '문구·스타일 지적(MEDIUM)만 낸 FAIL은 NAUGHTY를 만들지 못한다');
  assert.equal(r.contract, 'full');
  assert.deepEqual(r.failing, []);
});

test('[8] 같은 입력에서 mismatches가 그 리뷰어를 지목한다', () => {
  const r = decide([
    reviewer('A', 'FAIL', [finding({ severity: 'MEDIUM' })]),
    reviewer('B', 'PASS', []),
  ]);
  assert.equal(r.mismatches.length, 1, '완화가 적용돼도 불일치는 사라지지 않는다');
  assert.deepEqual(r.mismatches[0], {
    id: 'A', reviewerVerdict: 'FAIL', blocking: 0, kind: 'fail-without-blocking',
  });
});

test('[9] contract=full · blocking ≥1 → NAUGHTY, failing은 그 finding을 낸 id', () => {
  const r = decide([
    reviewer('A', 'FAIL', [finding({ severity: 'CRITICAL' })]),
    reviewer('B', 'PASS', []),
  ]);
  assert.equal(r.verdict, 'NAUGHTY');
  assert.deepEqual(r.failing, ['A']);
  assert.equal(r.blocking.length, 1);
});

test('[10] 리뷰어가 PASS인데 CRITICAL을 쓰면 blocking이 이긴다 (+ mismatch 기록)', () => {
  const r = decide([
    reviewer('A', 'PASS', [finding({ severity: 'CRITICAL' })]),
    reviewer('B', 'PASS', []),
  ]);
  assert.equal(r.verdict, 'NAUGHTY', '전원 PASS여도 blocking이 있으면 통과하지 못한다');
  assert.deepEqual(r.failing, ['A']);
  assert.equal(r.mismatches[0].kind, 'pass-with-blocking');
  assert.equal(r.mismatches[0].blocking, 1);
});

test('[11] contract=partial → 현행 규칙으로 판정, 완화 미적용', () => {
  const mitigated = decide([
    reviewer('A', 'FAIL', [finding({ severity: 'MEDIUM' })]),
    reviewer('B', 'PASS', []),
  ]);
  assert.equal(mitigated.verdict, 'NICE', '대조군 — 계약을 지킨 같은 라운드는 NICE다');

  const r = decide([
    reviewer('A', 'FAIL', [finding({ severity: 'MEDIUM' })]),
    reviewer('B', 'PASS', [finding({ structured: false, severity: null, failureScenario: null })]),
  ]);
  assert.equal(r.contract, 'partial', '비구조화 finding 하나가 라운드 전체를 partial로 만든다');
  assert.equal(r.verdict, 'NAUGHTY',
    '계약 미준수는 완화를 받지 못한다 — allPass가 추가로 걸리고 A가 FAIL이다');
  assert.deepEqual(r.failing, ['A'], '위임한 decideVerdict의 failing이 합류한다');
});

test('[12] findings 부재 legacy envelope → partial → 현행 규칙 (크래시 없음)', () => {
  const a = legacyReviewer('A', 'FAIL', ['something went wrong']);
  const b = legacyReviewer('B', 'PASS', []);

  const an = gate.analyzeReviewers([a, b]);
  assert.equal(an.contract, 'partial', 'findings가 없는 envelope는 criticalIssues에서 structured:false로 파생된다');
  assert.deepEqual(an.byReviewer.A, { findings: 1, structured: 0, blocking: 0 });
  assert.deepEqual(an.blocking, [], 'legacy는 blocking을 만들 수 없다');

  const r = decide([a, b]);
  assert.equal(r.verdict, 'NAUGHTY', 'A가 FAIL이고 완화를 받지 못하므로 현행 규칙 그대로다');

  // criticalIssues가 비어 있는 legacy 리뷰어는 계약 위반이 아니다 — 지적할 것이
  // 없었을 뿐이다. 이 구분이 없으면 무결점 라운드가 영원히 partial이 된다.
  const clean = decide([legacyReviewer('A', 'PASS', []), legacyReviewer('B', 'PASS', [])]);
  assert.equal(clean.contract, 'full');
  assert.equal(clean.verdict, 'NICE');
});

test('[13] severityGate=off에서도 distinct id < 2면 NICE에 도달하지 못한다', () => {
  const r = decide([reviewer('A', 'PASS', [])], 'off');
  assert.equal(r.verdict, 'NAUGHTY', '{A,B} 완전성은 env 값과 무관하게 항상 적용된다');
  assert.deepEqual(r.failing, [],
    '아무도 실패하지 않은 라운드에서 누군가를 failing에 넣는 것이 더 나쁜 거짓이다');

  // 같은 리뷰어를 두 번 기록해도 distinct id는 1이다 — backlog가 지목한 A×2 우회.
  const twice = decide([reviewer('A', 'PASS', []), reviewer('A', 'PASS', [])], 'off');
  assert.equal(twice.verdict, 'NAUGHTY');
});

// ── 커맨드 본문 (문서를 읽어 단언하는 일반 test) ──────────────────────────────

test('[14] santa-loop.md의 FAIL-first 문장이 문자 그대로 남아 있다', () => {
  const body = fs.readFileSync(SANTA_LOOP_MD, 'utf8');
  assert.ok(body.indexOf(
    'You are an independent quality reviewer. You have NOT seen any other review. ' +
    'Your job is to find problems, not to approve.') !== -1,
  'severity contract는 리뷰어를 온화하게 만들지 않는다 — 이 문장은 한 글자도 바뀌지 않는다');
});

// ── CLI 경유 ─────────────────────────────────────────────────────────────────

test('[15] cli record: 구조화 critical_issues가 findings로 들어가고 criticalIssues 길이가 보존된다', () => {
  const repo = makeRepo();
  const slug = 'structured-x';
  assert.equal(beginRound(repo, slug).code, EX_OK);
  const res = record(repo, slug, 'A', {
    verdict: 'FAIL',
    critical_issues: [
      { claim: 'the merge loses one element', severity: 'HIGH',
        failure_scenario: SUBSTANTIVE, evidence: 'santa/gate.js:42' },
      { claim: 'naming is inconsistent', severity: 'LOW' },
    ],
    suggestions: ['rename the helper'],
  });
  assert.equal(res.code, EX_OK);

  const env = readState(repo, slug).rounds[0].reviewers[0].envelope;
  assert.equal(env.findings.length, 2);
  assert.equal(env.criticalIssues.length, env.findings.length,
    '두 배열의 길이는 언제나 입력 원소 수와 같다 — seal의 criticalIssueCount 보존 조건이다');
  assert.deepEqual(env.criticalIssues, ['the merge loses one element', 'naming is inconsistent']);
  assert.equal(env.findings[0].structured, true);
  assert.equal(env.findings[0].severity, 'HIGH');
  assert.equal(env.findings[0].failureScenario, SUBSTANTIVE);
  assert.equal(env.findings[0].evidence, 'santa/gate.js:42');
  assert.equal(env.findings[1].structured, true, 'failure_scenario 부재는 의도된 예외다');
  assert.equal(env.findings[1].failureScenario, null);
});

test('[16] cli record: 문자열 critical_issues(legacy)도 그대로 통과한다', () => {
  const repo = makeRepo();
  const slug = 'legacy-x';
  assert.equal(beginRound(repo, slug).code, EX_OK);
  const res = record(repo, slug, 'A', {
    verdict: 'FAIL',
    critical_issues: ['a bare legacy string', { claim: 'mixed in', severity: 'MEDIUM' }],
  });
  assert.equal(res.code, EX_OK, 'legacy 형태는 거부 대상이 아니다');

  const env = readState(repo, slug).rounds[0].reviewers[0].envelope;
  assert.equal(env.findings.length, 2, '문자열과 객체가 섞인 배열도 원소별로 처리된다');
  assert.equal(env.findings[0].structured, false);
  assert.equal(env.findings[0].claim, 'a bare legacy string');
  assert.equal(env.findings[1].structured, true);
  assert.deepEqual(env.criticalIssues, ['a bare legacy string', 'mixed in']);
});

test('[17] cli record: failure_scenario가 상한을 넘으면 절삭 없이 structured:false', () => {
  const repo = makeRepo();
  const slug = 'overlong-x';
  const long = 'x'.repeat(MAX_FAILURE_SCENARIO_CHARS + 1);
  assert.equal(beginRound(repo, slug).code, EX_OK);
  assert.equal(record(repo, slug, 'A', {
    verdict: 'FAIL',
    critical_issues: [{ claim: 'oversized', severity: 'CRITICAL', failure_scenario: long }],
  }).code, EX_OK);

  const f = readState(repo, slug).rounds[0].reviewers[0].envelope.findings[0];
  assert.equal(f.structured, false, '상한 초과는 계약 미달이므로 강등이다');
  assert.equal(f.failureScenario.length, MAX_FAILURE_SCENARIO_CHARS + 1,
    '조용한 절삭은 감사 표면을 무력화한다 — 원문을 보존한다');

  // **강등돼도 어휘 안의 severity는 보존한다** (code-review M2). 지우면 "리뷰어가
  // CRITICAL이라 했는데 기록이 계약 미달이었다"와 "리뷰어가 severity를 안 냈다"가
  // 구별되지 않는다 — failureScenario를 원문 보존하는 UI7과 같은 축이다.
  assert.equal(f.severity, 'CRITICAL');
  // 보존이 무게를 새게 하지 않는다: classifyFinding은 structured를 **함께** 요구한다.
  assert.equal(gate.classifyFinding(f).blocking, false);
  assert.equal(gate.classifyFinding(f).reason, 'unstructured');

  // 어휘 밖 값은 보존할 열거값이 없으므로 그대로 null이다.
  assert.equal(record(repo, slug, 'B', {
    verdict: 'FAIL',
    critical_issues: [{ claim: 'unknown vocabulary', severity: 'BLOCKER' }],
  }).code, EX_OK);
  const g = readState(repo, slug).rounds[0].reviewers[1].envelope.findings[0];
  assert.equal(g.severity, null);
  assert.equal(g.structured, false);
});

test('[18] cli verdict: stdout JSON에 contract·mismatches·blocking이 실린다', () => {
  const repo = makeRepo();
  const slug = 'stdout-x';
  assert.equal(beginRound(repo, slug).code, EX_OK);
  record(repo, slug, 'A', {
    verdict: 'FAIL',
    critical_issues: [{ claim: 'style nit', severity: 'MEDIUM' }],
  });
  record(repo, slug, 'B', { verdict: 'PASS', critical_issues: [] });

  const res = cli(['verdict', '--cwd', repo, '--decision', slug, '--round', '0']);
  assert.equal(res.code, EX_OK);
  const j = JSON.parse(res.stdout);
  assert.equal(j.contract, 'full');
  assert.equal(j.verdict, 'NICE', 'MEDIUM만 낸 FAIL은 실경로에서도 NICE로 계수된다');
  assert.deepEqual(j.blocking, []);
  assert.equal(j.mismatches.length, 1);
  assert.equal(j.mismatches[0].kind, 'fail-without-blocking');
  // 강등 이력의 분모가 배송 경로에 실린다 (code-review L1) — `analyzeReviewers`가
  // 이미 세고 있었는데 판정 반환에서 떨어져 소비자가 없었다.
  assert.deepEqual(j.byReviewer, {
    A: { findings: 1, structured: 1, blocking: 0 },
    B: { findings: 0, structured: 0, blocking: 0 },
  });
  assert.deepEqual(Object.keys(j).sort(),
    ['blocking', 'byReviewer', 'contract', 'exitReason', 'failing', 'mismatches', 'verdict'],
    '기존 3필드는 유지하고 계측 4필드를 더한다 — 교체가 아니다');
});

test('[19] cli record: 타입 위반 finding은 exit 2 + append 0건', () => {
  const repo = makeRepo();
  const slug = 'typeviolation-x';
  assert.equal(beginRound(repo, slug).code, EX_OK);
  const before = bytes(statePath(repo, slug));

  [[42], [null], [['nested']], [true]].forEach(function (issues) {
    const res = record(repo, slug, 'A', { verdict: 'FAIL', critical_issues: issues });
    assert.equal(res.code, EX_USAGE, JSON.stringify(issues) + ' must be refused, not downgraded');
    assert.match(res.stderr, /SANTA_REVIEWER_INVALID/);
  });

  assert.ok(before.equals(bytes(statePath(repo, slug))),
    '부분 기록으로 원장을 오염시키지 않는다 — 어떤 실패도 append 0건이다');
});

test('[20] santa-loop.md Step 3에 구조화 스키마와 failure_scenario 요구가 문서화돼 있다', () => {
  const body = fs.readFileSync(SANTA_LOOP_MD, 'utf8');
  assert.ok(body.indexOf('"severity": "CRITICAL|HIGH|MEDIUM|LOW"') !== -1,
    '리뷰어가 실제로 낼 형태가 커맨드 본문에 있어야 계약이 성립한다');
  assert.ok(body.indexOf('"failure_scenario"') !== -1);
  assert.ok(/failure_scenario[\s\S]{0,400}blocker/i.test(body),
    'blocker 자격이 failure_scenario에 못박혀 있어야 한다');
  assert.ok(body.indexOf('MCCP_SANTA_SEVERITY_GATE') !== -1,
    'Step 4가 어떤 축이 꺼지는지 밝혀야 한다');
});

test('[21] cmdVerdict의 판정 호출 대상은 decideAdjudicatedVerdict이고 decideVerdict 직접 호출은 0건', () => {
  const repo = makeRepo();
  const slug = 'delegation-x';
  assert.equal(beginRound(repo, slug).code, EX_OK);
  record(repo, slug, 'A', { verdict: 'PASS', critical_issues: [] });
  record(repo, slug, 'B', { verdict: 'PASS', critical_issues: [] });

  const origAdj = gate.decideAdjudicatedVerdict;
  const origDec = gate.decideVerdict;
  let adjCalls = 0, decCalls = 0;
  gate.decideAdjudicatedVerdict = function () { adjCalls += 1; return origAdj.apply(null, arguments); };
  gate.decideVerdict = function () { decCalls += 1; return origDec.apply(null, arguments); };
  let res;
  try {
    res = cli(['verdict', '--cwd', repo, '--decision', slug, '--round', '0']);
  } finally {
    gate.decideAdjudicatedVerdict = origAdj;
    gate.decideVerdict = origDec;
  }

  assert.equal(res.code, EX_OK);
  assert.ok(adjCalls >= 1, 'CLI는 새 판정 함수를 부른다');
  assert.equal(decCalls, 0,
    '최종 verdict만 보면 위임 경로와 재구현이 구별되지 않으므로 호출 자체를 잰다');
});

// ── receipt 경계 (없어야 할 것의 부재) ───────────────────────────────────────

test('[23] receipt에 findings·raw·리뷰어 본문이 부재하고, 같은 왕복의 원장에는 존재한다', () => {
  const repo = makeRepo();
  const slug = 'sealed-x';
  assert.equal(beginRound(repo, slug).code, EX_OK);
  record(repo, slug, 'A', {
    verdict: 'PASS',
    critical_issues: [{ claim: CANARY + ' claim', severity: 'LOW' }],
    checks: [{ criterion: CANARY, result: 'PASS', detail: CANARY }],
    suggestions: [CANARY],
  });
  record(repo, slug, 'B', { verdict: 'PASS', critical_issues: [] });
  assert.equal(cli(['verdict', '--cwd', repo, '--decision', slug, '--round', '0']).code, EX_OK);
  assert.equal(cli(['seal', '--cwd', repo, '--decision', slug]).code, EX_OK);

  // 원장에는 있다 — 없으면 loadReviewer가 애초에 findings를 만들지 않은 경우와
  // 만들었는데 seal이 떨궈낸 경우가 구별되지 않는다.
  const env = readState(repo, slug).rounds[0].reviewers[0].envelope;
  assert.ok(env.findings.length > 0, '원장에는 findings가 실제로 쌓여 있어야 한다');
  assert.ok(JSON.stringify(readState(repo, slug)).indexOf(CANARY) !== -1);

  // receipt에는 없다. **receipt 자신의 `findings` 배열은 다른 것이다** — 그것은
  // 게이트 finding 슬롯이고 santa 경로에서는 비어 있다. 겨누는 것은 리뷰어가 낸
  // 축(`envelope.findings` · `raw` · claim/시나리오 본문)의 부재다.
  const receiptText = fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-santa-review', slug + '.json'), 'utf8');
  const receipt = JSON.parse(receiptText);
  assert.equal(receiptText.indexOf(CANARY), -1, '리뷰어 본문이 git-tracked receipt로 새면 안 된다');
  assert.equal(receiptText.indexOf('"raw"'), -1);
  // `"envelope"` 키 그대로를 겨눈다 — receipt skeleton에는 `ipc_envelope_path`처럼
  // 이 축과 무관한 필드가 따로 있어서 부분 문자열로 재면 거짓 red가 난다.
  assert.equal(receiptText.indexOf('"envelope"'), -1);
  assert.equal(receiptText.indexOf('criticalIssues'), -1);
  assert.equal(receiptText.indexOf('failureScenario'), -1);
  assert.deepEqual(receipt.findings, [],
    'receipt의 finding 슬롯에 리뷰어 축이 흘러들지 않는다');
  // 실리는 santa 값은 집계 정수뿐이다 (DD4의 저장 위치 표).
  assert.ok(Number.isInteger(receipt.meta.santa_rounds));
  assert.ok(Number.isInteger(receipt.meta.santa_entries));

  const reportText = fs.readFileSync(
    path.join(repo, '.claude', 'reviews', 'santa-review-' + slug + '.md'), 'utf8');
  assert.equal(reportText.indexOf(CANARY), -1, '집계 리포트도 git-tracked이다');
});

// ── env 축의 단조성 ──────────────────────────────────────────────────────────

test('[22] severityGate=enforce · contract=full · blocking 0 · distinct id 1 → NAUGHTY', () => {
  const r = decide([reviewer('A', 'PASS', [finding({ severity: 'LOW' })])], 'enforce');
  assert.equal(r.contract, 'full', '완화가 실제로 적용되는 경로여야 이 항목이 의미를 갖는다');
  assert.deepEqual(r.blocking, []);
  assert.equal(r.verdict, 'NAUGHTY',
    '{A,B} 완전성은 완화 경로에서도 살아 있다 — 항목 13은 off 경로만 덮는다');
});

test('[24] off에서도 partial에서도 blocking ≥1이면 전원 PASS라도 NAUGHTY', () => {
  const blockingFinding = finding({ severity: 'CRITICAL' });

  const off = decide([
    reviewer('A', 'PASS', [blockingFinding]),
    reviewer('B', 'PASS', []),
  ], 'off');
  assert.equal(off.contract, 'full');
  assert.equal(off.verdict, 'NAUGHTY', 'off는 완화만 끄고 blocking 게이트는 끄지 않는다');

  const partial = decide([
    reviewer('A', 'PASS', [blockingFinding]),
    reviewer('B', 'PASS', [finding({ structured: false, severity: null, failureScenario: null })]),
  ], 'enforce');
  assert.equal(partial.contract, 'partial');
  assert.equal(partial.verdict, 'NAUGHTY',
    '비구조화 finding 하나로 다른 리뷰어의 blocking을 지우는 우회가 없다');
});

// ── 두 층의 정합 ─────────────────────────────────────────────────────────────

test('[25] gate와 seal이 {A,B} 완전성과 완화 경로 양쪽에서 같은 결론을 낸다', () => {
  // 두 층의 **관측 가능한 결론**을 대조한다. seal.js의 내부 distinctIds는
  // export되지 않으며, export시키는 것은 소유권 표 밖 P0 산출물의 선점이다.
  function projectionOf(rows) {
    return {
      rounds: [{
        index: 0,
        started_at: '2026-08-17T00:00:00.000Z',
        verdict: 'NICE',
        reviewers: rows.map(function (r) {
          return {
            id: r.id, model: r.model, verdict: r.verdict,
            criticalIssueCount: r.criticalIssues.length,
          };
        }),
      }],
    };
  }

  const none = [];
  assert.equal(decide(none).verdict, 'NAUGHTY');
  assert.equal(seal.deriveVerdict(projectionOf(none)), 'divergent',
    '증거 0건에서 두 층이 갈리면 게이트가 NICE를 내고 봉인이 divergent를 낸다');

  const one = [reviewer('A', 'PASS', [])];
  assert.equal(decide(one).verdict, 'NAUGHTY');
  assert.equal(seal.deriveVerdict(projectionOf(one)), 'divergent');

  const two = [reviewer('A', 'PASS', []), reviewer('B', 'PASS', [])];
  assert.equal(decide(two).verdict, 'NICE');
  assert.equal(seal.deriveVerdict(projectionOf(two)), 'converged',
    '한쪽이 바뀌면 이 단언이 red가 된다 — 두 곳에서 세되 갈리면 즉시 잡힌다');

  // ── 완화 경로에서도 두 층이 갈리지 않는다 (code-review H1) ─────────────────
  //
  // MEDIUM만 낸 FAIL을 NICE로 두는 것은 M1의 **설계된 결과**(PRD Scope MVP 2)인데,
  // 봉인이 리뷰어 전원 PASS를 요구하던 동안에는 같은 라운드를 divergent로 막았다.
  // 실측 결과는 Step 5.5의 `exit 1`(push 차단) · git-tracked receipt의 divergent ·
  // fix-task.md의 `divergent_unresolved`였다 — M1의 1순위 경로가 end-to-end 도달
  // 불가였다는 뜻이다. `{A,B}` 축과 달리 이쪽은 두 층이 **다른 질문**에 답하고 있었다.
  const mitigated = [
    reviewer('A', 'FAIL', [finding({ severity: 'MEDIUM' })]),
    reviewer('B', 'PASS', []),
  ];
  assert.equal(decide(mitigated).verdict, 'NICE');
  assert.equal(seal.deriveVerdict(projectionOf(mitigated)), 'converged',
    '리뷰어의 verdict 문자열은 어느 층에서도 판정 입력이 아니다');

  // proof도 같은 축에서 자기모순이었다: `review-verdict.js`가 `quorum.passed !== true`인
  // converged proof를 구조적으로 무효로 보므로, 완화로 converged가 된 라운드는
  // 봉인은 통과하고 검증에서 떨어지는 receipt를 만들었다.
  const proof = seal.buildProof({
    projection: projectionOf(mitigated),
    verdict: 'converged',
    exitReason: null,
    reportRelPath: '.claude/reviews/santa-review-x.md',
    reportHash: 'sha256:' + '0'.repeat(64),
  });
  assert.equal(proof.quorum.passed, true);
  assert.equal(proof.quorum.responded, 2);
  assert.equal(proof.layers.l2, 'converged');
});
