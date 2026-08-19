'use strict';

// santa-adjudication M1·M2 — severity contract + 게이트 재배선(M1) 및 판정 원장(M2)의
// 회귀 그물.
//
// 이 파일이 **커버리지 계약 전량을 소유한다.** test 이름의 대괄호 id는 plan
// (1~25는 `santa-adjudication-m1.plan.md`, 26~60은 `santa-adjudication-m2.plan.md`)의
// 커버리지 표와 1:1이고,
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

// ── 주변 env 정규화 ──────────────────────────────────────────────────────────
//
// `cli()`는 `runCli`를 in-process로 부르고 `cli.js`가 `env: process.env`를 그대로
// 넘기므로, **이 파일의 CLI test는 실행한 사람의 셸을 읽는다.** santa 토글은 전부
// 문서화된 운영 축이라 실제로 켜져 있을 수 있고(특히 `MCCP_SANTA_TERMINATOR=off`는
// ENVIRONMENT.md가 "종료된 루프를 되살리는 유일한 수단"으로 안내한다), 그 설정 하나로
// 발화 경로 단언(`terminate:true`)이 전부 red가 된다. 더 나쁜 것은 **미발화를 재는
// 항목들은 그대로 green**이라 실패가 편향돼 보인다는 점이다.
//
// 그래서 default를 test가 소유한다 — 여기서 지우면 각 파서가 자기 default를 쓴다.
// 비-default가 필요한 항목은 `withEnv`로 자기 범위 안에서만 설정하고 복원한다.
for (const k of Object.keys(process.env)) {
  if (k.indexOf('MCCP_SANTA_') === 0) delete process.env[k];
}

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

// santa-evidence-diversity M3 — envelope fixture의 모델명은 **실재 계열이어야 한다**.
//
// M3 이전에는 `model-A`/`model-B` 플레이스홀더로 충분했다. 이제 `seal.deriveVerdict`가
// `model-diversity.familyOf`로 계열을 분류하고 정확히 1개 계열에 매치되지 않으면
// `unknown`(→ degraded)이므로, 플레이스홀더 2인 라운드를 `converged`로 단언하는 P1의
// 교차층 test([25]·[79])가 붉어진다. **단언을 지우거나 게이트를 끄는 대신 fixture를
// 정직하게** 만든다 — 실제 실행의 Reviewer A는 `opus`, Reviewer B는 `gpt-5.4`이므로 이
// fixture는 이제 "두 리뷰어"가 아니라 "두 **이종** 리뷰어"를 뜻하고, 그것이 애초에
// `{A,B}` 완전성 단언이 말하려던 상태다.
//
// **`record` 경로(`--model`)에는 이 값을 쓰지 않는다.** 그쪽은 CLI가 `openai`/`google`
// 계열 선언에 대해 PATH를 재도출하므로 `gpt-5.4`를 넘기면 test가 이 머신에 codex가
// 설치됐는지에 따라 갈린다. 거기서는 `model-<id>`(→ unknown, PATH 대조 면제)를 그대로
// 둔다 — 그 test들은 봉인 verdict를 단언하지 않는다.
function modelFor(id) {
  if (id === 'A') return 'opus';        // anthropic
  if (id === 'B') return 'gpt-5.4';     // openai
  return 'model-' + id;                 // 그 외는 unknown — 계열을 주장하지 않는다
}

function reviewer(id, verdict, findings) {
  return {
    id: id,
    model: modelFor(id),
    verdict: verdict,
    criticalIssues: (findings || []).map(function (f) { return f.claim; }),
    findings: findings || [],
  };
}

// legacy envelope — `findings` 키 자체가 없다(M1 이전에 원장에 쌓인 형태).
function legacyReviewer(id, verdict, criticalIssues) {
  return { id: id, model: modelFor(id), verdict: verdict, criticalIssues: criticalIssues || [] };
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

// santa-evidence-diversity M1 — `--lane`은 필수이고 oracle 배정과 대조된다.
// 이 파일의 관심사는 레인이 아니므로 값을 리터럴로 박지 않고 배정에서 뽑는다.
const lanesOracle = require('../santa/lanes');
function laneFor(id) {
  return lanesOracle.assignLanes({
    mode: lanesOracle.parseBlindLane(process.env), ids: [id],
  })[id];
}

function record(repo, slug, id, reviewerJson) {
  const file = writeReviewerFile(repo, 'reviewer-' + id + '.json', reviewerJson);
  return cli(['record', '--cwd', repo, '--decision', slug, '--round', '0',
    '--id', id, '--lane', laneFor(id), '--model', 'model-' + id, '--reviewer-file', file]);
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
  // santa-adjudication M2가 판정 원장 축 5필드를 **더했다**(Task 3 (2)). M1이 계측
  // 4필드를 더했을 때와 같은 성격이고, 이 단언의 요점도 그대로다 — 교체가 아니라
  // 추가이며, 새 키가 조용히 늘어나면 여기서 잡힌다. 값 축의 하위 호환은 커버리지
  // 33이, 배선 축은 46이 따로 진다.
  assert.deepEqual(Object.keys(j).sort(),
    ['blocking', 'byReviewer', 'carryOver', 'contract', 'entries', 'exitReason', 'failing',
      'ledger', 'mismatches', 'niceBySuppression', 'suppressed', 'verdict'],
    '기존 7키는 유지하고 원장 5필드를 더한다 — 교체가 아니다');
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

// ═══════════════════════════════════════════════════════════════════════════
// santa-adjudication M2 — 판정 원장 (커버리지 26~60)
// ═══════════════════════════════════════════════════════════════════════════
//
// **test 격리 계약** (fan-out이 요구한 항목, plan Task 5):
//   (1) 원장 상태의 수명은 **한 test**이고 tmpdir과 함께 사라진다.
//   (2) slug는 test마다 다르게 지어 같은 tmpdir 안에서도 스코프가 겹치지 않는다.
//   (3) **저장소의 실제 원장(`.claude/state/santa-loop/`)을 읽거나 쓰는 test는
//       0개다** — 실 경로 검증은 Task 7이 소유하고 여기서는 fixture만 만진다.
//
// 라운드를 넘나드는 항목(34~36 · 49 · 55 · 57~58)도 fixture repo 하나 안에서
// 라운드 두 개를 실제로 열고 닫는다. `node:test`는 test별 setup을 가지므로 M1의
// 1~25와 같은 파일에 공존해도 fixture가 충돌하지 않는다.

const adjudication = require('../santa/adjudication');
const ledgerMod = require('../santa/ledger');

const CLAIM = 'the merge step drops the second envelope';
const PARAPHRASE = 'the second envelope is silently discarded while merging';
const REASON = 'the reviewer misread the loop bound; the guard runs after the append, not before';
const PROOF = 'the guard now runs after the append at ledger.js:497, so the envelope survives';
// 원장에만 있어야 하는 판정 본문 — receipt·리포트로 새는지 감시하는 canary다.
const EV_CANARY = 'SANTA_EVIDENCE_CANARY_7c31d9 the guard now runs after the append step';

// `over`가 `claim`을 바꾸면 `issue_id`도 따라 파생된다 — 결속이 깨진 행을 만들려면
// `issue_id`를 **명시적으로** 넘겨야 하고, 그것이 커버리지 31의 한 축이다.
function entry(over) {
  const o = Object.assign({}, over || {});
  const claim = Object.prototype.hasOwnProperty.call(o, 'claim') ? o.claim : CLAIM;
  return Object.assign({
    kind: 'adjudication', round: 0, issue_id: gate.issueIdOf(claim), claim: claim,
    severity: 'HIGH', disposition: 'rejected', evidence: REASON,
    at: '2026-08-17T00:00:00.000Z',
  }, o);
}

function decideR(reviewers, resolved, round) {
  return gate.decideAdjudicatedVerdict({
    reviewers: reviewers, cap: 3, severityGate: 'enforce',
    round: round === undefined ? 1 : round,
    resolved: resolved,
  });
}

// 같은 claim을 낸 두 리뷰어 — 병합 행 하나가 나온다.
function bothRaise(claim) {
  return [
    reviewer('A', 'FAIL', [finding({ claim: claim })]),
    reviewer('B', 'FAIL', [finding({ claim: claim })]),
  ];
}

// ── CLI fixture helpers (M1의 것을 라운드 인자로 넓힌다) ─────────────────────

const BLOCKING_JSON = [{ claim: CLAIM, severity: 'HIGH', failure_scenario: SUBSTANTIVE }];

function recordAt(repo, slug, id, round, json) {
  const file = writeReviewerFile(repo, 'r-' + id + '-' + round + '.json', json);
  return cli(['record', '--cwd', repo, '--decision', slug, '--round', String(round),
    '--id', id, '--lane', laneFor(id), '--model', 'model-' + id, '--reviewer-file', file]);
}

function verdictAt(repo, slug, round) {
  return cli(['verdict', '--cwd', repo, '--decision', slug, '--round', String(round)]);
}

function adjudicateCli(repo, slug, round, issue, disposition, evidence) {
  return cli(['adjudicate', '--cwd', repo, '--decision', slug, '--round', String(round),
    '--issue', issue, '--disposition', disposition, '--evidence', evidence]);
}

// 라운드를 열고 blocking 하나를 낸 뒤 FINAL로 닫는다 → verdict JSON을 돌려준다.
function openBlockingRound(repo, slug, round, issues) {
  assert.equal(beginRound(repo, slug).code, EX_OK, 'round ' + round + ' should open');
  const body = { verdict: 'FAIL', critical_issues: issues || BLOCKING_JSON };
  assert.equal(recordAt(repo, slug, 'A', round, body).code, EX_OK);
  assert.equal(recordAt(repo, slug, 'B', round, body).code, EX_OK);
  const vd = verdictAt(repo, slug, round);
  assert.equal(vd.code, EX_OK, vd.stderr);
  return JSON.parse(vd.stdout);
}

// ── 26~29: 순수 모듈의 파서와 행 스키마 ─────────────────────────────────────

test('[26] 두 env 파서: 미설정은 enforce · off는 off · 불량값은 loud warn 후 enforce', () => {
  const cases = [
    ['MCCP_SANTA_ADJUDICATION_GATE', adjudication.parseAdjudicationGate],
    ['MCCP_SANTA_LEDGER_SUPPRESSION', adjudication.parseLedgerSuppression],
  ];
  cases.forEach(function (c) {
    const name = c[0], parse = c[1];
    assert.equal(parse({}), 'enforce', name + ': 미설정은 default enforce');
    assert.equal(parse(undefined), 'enforce', name + ': env 자체 부재도 default');
    const empty = {}; empty[name] = '';
    assert.equal(parse(empty), 'enforce', name + ': 빈 문자열은 미설정과 같다');
    const off = {}; off[name] = 'off';
    assert.equal(parse(off), 'off', name + ': off는 off');
    const bad = {}; bad[name] = 'ENFORCE';
    const cap = captureStderr(function () { return parse(bad); });
    assert.equal(cap.value, 'enforce', name + ': 불량값은 default로 떨어진다');
    assert.match(cap.stderr, new RegExp(name), name + ': 조용히 떨어지면 안 된다');
  });
});

test('[27] issueIdOf: 정규화 등가 claim은 같은 id · 다른 claim은 다른 id · 비문자열도 던지지 않는다', () => {
  // **`normalizeClaim` 등가성만 잰다.** 같은 결함을 다르게 쓴 문장(패러프레이즈)은
  // 이 항목의 대상이 아니고 항목 58이 그 실패 모드를 따로 고정한다.
  const id = gate.issueIdOf(CLAIM);
  assert.match(id, /^[0-9a-f]{12}$/, '12 hex');
  assert.equal(gate.issueIdOf('  The Merge   Step   Drops The Second Envelope '), id,
    '대소문자와 공백만 다른 claim은 같은 지적이다 — 라운드 안의 dedupe 키와 같은 규칙');
  assert.notEqual(gate.issueIdOf(PARAPHRASE), id, '다른 문장은 다른 id다');
  assert.doesNotThrow(function () { gate.issueIdOf(null); });
  assert.doesNotThrow(function () { gate.issueIdOf(undefined); });
  assert.doesNotThrow(function () { gate.issueIdOf(42); });
  assert.equal(gate.issueIdOf(null), gate.issueIdOf(''), '비문자열은 빈 claim으로 정규화된다');
});

test('[28] buildEntry: 정상 입력은 DD2의 8필드 정확히이고 issue_id는 claim에서 파생된다', () => {
  const e = adjudication.buildEntry({
    round: 2, claim: CLAIM, severity: 'HIGH', disposition: 'absorbed',
    evidence: PROOF, at: '2026-08-17T01:02:03.000Z',
  });
  assert.deepEqual(Object.keys(e).sort(),
    ['at', 'claim', 'disposition', 'evidence', 'issue_id', 'kind', 'round', 'severity'],
    '그 외 키를 더하지 않는다 — 8필드 정확히');
  assert.equal(e.kind, 'adjudication');
  assert.equal(e.issue_id, gate.issueIdOf(CLAIM),
    'id는 인자가 아니라 claim에서 파생된다 — 호출자가 주면 claim과 어긋난 행을 만들 수 있다');
  assert.equal(e.round, 2);
  assert.equal(e.evidence, PROOF);
  // 호출자가 id를 주려 해도 무시된다 — buildEntry가 issue_id를 만드는 유일한 경로다.
  const forged = adjudication.buildEntry({
    round: 0, claim: CLAIM, severity: 'HIGH', disposition: 'rejected',
    evidence: REASON, at: '2026-08-17T00:00:00.000Z', issue_id: 'deadbeefdead',
  });
  assert.equal(forged.issue_id, gate.issueIdOf(CLAIM), '주입된 issue_id는 채택되지 않는다');
});

test('[29] buildEntry: disposition·severity·round·evidence 위반은 각각 throw한다', () => {
  const base = {
    round: 0, claim: CLAIM, severity: 'HIGH', disposition: 'rejected',
    evidence: REASON, at: '2026-08-17T00:00:00.000Z',
  };
  const bad = function (over) {
    return function () { adjudication.buildEntry(Object.assign({}, base, over)); };
  };
  assert.throws(bad({ disposition: 'ABSORBED' }), /SANTA_ADJUDICATION_INVALID|disposition/,
    '대소문자 구분 — 어휘 밖 값은 거부다');
  assert.throws(bad({ severity: 'MEDIUM' }), /severity/,
    'MEDIUM은 애초에 blocking이 아니라 판정 대상이 아니다');
  assert.throws(bad({ round: -1 }), /round/);
  assert.throws(bad({ evidence: 'fixed' }), /substantive/,
    '"fixed" 한 단어로는 흡수를 주장할 수 없다 — validateReason strict에 위임한다');
  assert.throws(bad({ at: 'not-a-date' }), /at must be/);
  // 실패는 throw이지 부분 반환이 아니다 — code가 catch-all의 exit 2 매핑을 탄다.
  try { bad({ disposition: 'nope' })(); assert.fail('should throw'); } catch (err) {
    assert.equal(err.code, 'SANTA_ADJUDICATION_INVALID');
  }
});

// ── 30~32: fold ────────────────────────────────────────────────────────────

test('[30] foldEntries: 같은 issue의 뒤 entry가 이기고 라운드가 다르면 byRoundIssue 키가 다르다', () => {
  const id = gate.issueIdOf(CLAIM);
  const f = adjudication.foldEntries([
    entry({ round: 0, disposition: 'rejected' }),
    entry({ round: 1, disposition: 'absorbed', evidence: PROOF }),
  ]);
  assert.equal(f.resolution.get(id).disposition, 'absorbed', 'last-wins');
  assert.equal(f.history.get(id).length, 2, '이력 전체가 보존된다 — DD13이 라운드별로 다시 고른다');
  assert.deepEqual([...f.byRoundIssue].sort(), ['0:' + id, '1:' + id],
    '라운드가 다르면 coverage 키도 다르다 — 판정은 그 라운드의 제기에 대한 것이다');
  assert.deepEqual(f.counts, { absorbed: 1, rejected: 1, skipped: 0, reopened: 0 });
  assert.equal(f.duplicates, 0);
  assert.equal(f.malformed, 0);
});

test('[31] foldEntries: 손상 행은 malformed로만 계수되고, 남의 행은 그것에도 들어가지 않는다', () => {
  const id = gate.issueIdOf(CLAIM);

  // (a) 스키마 미달 — 던지지 않고 malformed로 계수된다.
  const broken = adjudication.foldEntries([
    entry({ claim: undefined }),
    entry({ evidence: 'no' }),
    // 결속이 깨진 행: claim과 issue_id가 어긋난다. 손으로 편집된 원장의 형태이고,
    // 그대로 두면 실재하지 않는 지적을 "종결"로 만들 수 있다.
    entry({ issue_id: 'deadbeefdead' }),
    null,
  ]);
  assert.equal(broken.malformed, 4);
  assert.equal(broken.resolution.size, 0, 'malformed는 resolution에 들어가지 않는다');
  assert.equal(broken.byRoundIssue.size, 0, 'coverage도 충족시키지 못한다');
  assert.deepEqual(broken.counts, { absorbed: 0, rejected: 0, skipped: 0, reopened: 0 });

  // (b) 전역 함수 — 비배열·null·undefined에 던지지 않는다.
  [null, undefined, 42, 'x', {}].forEach(function (v) {
    const f = adjudication.foldEntries(v);
    assert.equal(f.malformed, 0);
    assert.equal(f.history.size, 0);
  });

  // (c) **남의 행 vs 태그를 빠뜨린 행** — 두 경우를 각각 단언한다.
  const foreign = adjudication.foldEntries([{ kind: 'evidence-note', anything: true }]);
  assert.equal(foreign.malformed, 0, '`kind`가 다른 문자열이면 손상이 아니라 무관이다');
  assert.equal(foreign.history.size, 0);

  const untagged = entry({});
  delete untagged.kind;
  const t = adjudication.foldEntries([untagged]);
  assert.equal(t.malformed, 1,
    '태그 부재는 검증을 거쳐 malformed다 — 남의 행으로 접으면 writer의 행이 조용히 사라진다');
  assert.equal(t.byRoundIssue.size, 0);
  const nonString = adjudication.foldEntries([entry({ kind: 7 })]);
  assert.equal(nonString.malformed, 1, '비문자열 태그도 같은 취급이다');

  // 어느 쪽도 suppression을 발화시키지 않는다 — 양쪽 모두 fail-closed 방향이다.
  const r = decideR(bothRaise(CLAIM), broken.history, 1);
  assert.equal(r.suppressed.length, 0);
  assert.equal(r.blocking.length, 1);
  assert.ok(id.length === 12);
});

test('[32] foldEntries: 같은 (round, issue) 중복 append는 duplicates로 세되 fold는 하나로 수렴한다', () => {
  const id = gate.issueIdOf(CLAIM);
  const f = adjudication.foldEntries([
    entry({ round: 0, disposition: 'rejected' }),
    entry({ round: 0, disposition: 'absorbed', evidence: PROOF }),
    entry({ round: 0, disposition: 'skipped', evidence: REASON }),
  ]);
  assert.equal(f.duplicates, 2, '두 번째부터가 중복이다');
  assert.equal(f.byRoundIssue.size, 1, 'coverage 키는 하나로 수렴한다');
  assert.equal(f.resolution.get(id).disposition, 'skipped', '마지막이 이긴다');
  assert.equal(f.history.get(id).length, 3, '중복도 이력에는 남는다 — 막지 않고 흡수한다(DD1)');
});

// ── 33~38: suppression 축 ───────────────────────────────────────────────────

test('[33] 하위 호환 — resolved 부재 시 M1 7키의 값이 그대로이고 키 집합은 정확히 9개다', () => {
  const rs = [reviewer('A', 'FAIL', [finding({ severity: 'CRITICAL' })]), reviewer('B', 'PASS', [])];
  const opts = { reviewers: rs, round: 0, cap: 3, severityGate: 'enforce' };
  const absent = gate.decideAdjudicatedVerdict(opts);
  const emptyMap = gate.decideAdjudicatedVerdict(Object.assign({}, opts, { resolved: new Map() }));
  const nullRes = gate.decideAdjudicatedVerdict(Object.assign({}, opts, { resolved: null }));

  const M1_KEYS = ['verdict', 'failing', 'exitReason', 'blocking', 'mismatches',
    'contract', 'byReviewer'];
  const pick = function (o) {
    return M1_KEYS.reduce(function (acc, k) { acc[k] = o[k]; return acc; }, {});
  };
  // **반환 전체 deepEqual은 쓰지 않는다** — 같은 Task가 반환에 키 두 개를 더하므로
  // 그 형태의 단언은 설계상 통과할 수 없다. 정확한 명제는 "기존 키의 값이 하나도
  // 바뀌지 않는다"이고 그것만 잰다.
  assert.deepEqual(pick(emptyMap), pick(absent));
  assert.deepEqual(pick(nullRes), pick(absent));
  // 값 자체도 M1 의미 그대로임을 고정한다(위 비교가 공허해지지 않게).
  assert.equal(absent.verdict, 'NAUGHTY');
  assert.equal(absent.blocking.length, 1);
  assert.deepEqual(absent.failing, ['A']);
  assert.equal(absent.contract, 'full');

  assert.deepEqual(absent.suppressed, []);
  assert.equal(absent.niceBySuppression, false);
  assert.equal(Object.keys(absent).length, 9,
    '세 번째 키가 조용히 늘어나면 여기서 잡힌다');
  assert.deepEqual(Object.keys(absent).sort(),
    ['blocking', 'byReviewer', 'contract', 'exitReason', 'failing', 'mismatches',
      'niceBySuppression', 'suppressed', 'verdict']);
});

test('[34] rejected 종결 항목이 다음 라운드에 재등장하면 blocking에서 빠지고 라운드가 NICE가 된다', () => {
  const folded = adjudication.foldEntries([entry({ round: 0, disposition: 'rejected' })]);
  const r = decideR(bothRaise(CLAIM), folded.history, 1);
  assert.equal(r.blocking.length, 0, '게이트가 세는 수에서 빠진다');
  assert.equal(r.suppressed.length, 1, '사라지지 않고 suppressed로 보존된다(UI7)');
  assert.equal(r.suppressed[0].issueId, gate.issueIdOf(CLAIM));
  assert.equal(r.suppressed[0].kind, 'rejected-rereported');
  assert.equal(r.suppressed[0].entryRound, 0, '어느 라운드의 판정이 지웠는지 남는다');
  assert.deepEqual(r.suppressed[0].ids, ['A', 'B'], '누가 냈는지도 보존된다');
  assert.equal(r.verdict, 'NICE', 'PRD 재보고 차단 — 종결된 지적이 라운드를 다시 태우지 않는다');
  assert.deepEqual(r.failing, [], '지워진 지적을 낸 리뷰어를 실패자로 부르지 않는다');
});

test('[35] absorbed 재등장도 suppress되되 absorbed-rereported로 분류된다 (DD8 — 신호가 사라지지 않는다)', () => {
  const folded = adjudication.foldEntries([
    entry({ round: 0, disposition: 'absorbed', evidence: PROOF }),
  ]);
  const r = decideR(bothRaise(CLAIM), folded.history, 1);
  assert.equal(r.blocking.length, 0);
  assert.equal(r.suppressed[0].kind, 'absorbed-rereported',
    '"당신의 수정이 듣지 않았을 수 있다"는 신호가 분류로 남는다 — 라운드를 태우지 않으면서 도달하는 유일한 경로');
  assert.equal(r.suppressed[0].disposition, 'absorbed');
  assert.equal(r.niceBySuppression, true);
});

test('[36] skipped와 reopened는 suppress하지 않는다 — 같은 입력이 NAUGHTY로 남는다', () => {
  ['skipped', 'reopened'].forEach(function (d) {
    const folded = adjudication.foldEntries([entry({ round: 0, disposition: d })]);
    const r = decideR(bothRaise(CLAIM), folded.history, 1);
    assert.equal(r.suppressed.length, 0, d + '는 종결이 아니다');
    assert.equal(r.blocking.length, 1, d + ' 뒤에도 그 지적은 blocking이다');
    assert.equal(r.verdict, 'NAUGHTY',
      d + ': 판정 의무는 면제하되 회피가 공짜가 아니다');
  });
});

test('[37] suppression은 byReviewer의 원시 분모를 바꾸지 않는다 (강등 비율 보존 — UI8)', () => {
  const rs = bothRaise(CLAIM);
  const folded = adjudication.foldEntries([entry({ round: 0, disposition: 'rejected' })]);
  const raw = decideR(rs, null, 1);
  const sup = decideR(rs, folded.history, 1);
  assert.equal(sup.blocking.length, 0, 'suppression이 실제로 발화한 경로여야 의미가 있다');
  assert.deepEqual(sup.byReviewer, raw.byReviewer,
    'byReviewer는 원시값 그대로다 — suppression 이후 값으로 바꾸면 강등 비율의 분모가 사라진다');
  assert.equal(sup.byReviewer.A.blocking, 1);
  assert.equal(sup.byReviewer.B.blocking, 1);
});

test('[38] MCCP_SANTA_LEDGER_SUPPRESSION=off면 종결 항목도 blocking으로 남는다 (M1 등가 · 대조군)', () => {
  const repo = makeRepo();
  const slug = 'suppression-off';
  const v0 = openBlockingRound(repo, slug, 0);
  const id = v0.blocking[0].issueId;
  assert.equal(adjudicateCli(repo, slug, 0, id, 'rejected', REASON).code, EX_OK);
  assert.equal(beginRound(repo, slug).code, EX_OK);
  const body = { verdict: 'FAIL', critical_issues: BLOCKING_JSON };
  assert.equal(recordAt(repo, slug, 'A', 1, body).code, EX_OK);
  assert.equal(recordAt(repo, slug, 'B', 1, body).code, EX_OK);

  const off = withEnv({ MCCP_SANTA_LEDGER_SUPPRESSION: 'off' }, function () {
    return JSON.parse(verdictAt(repo, slug, 1).stdout);
  });
  assert.equal(off.blocking.length, 1, 'off는 suppression 경로를 아예 타지 않는다');
  assert.equal(off.suppressed.length, 0);
  assert.equal(off.verdict, 'NAUGHTY',
    '같은 원장에 대해 켠 판정과 끈 판정을 비교하면 M2의 효과가 한 라운드 안에서 관측된다');
  fs.rmSync(repo, { recursive: true, force: true });
});

// ── 39~40: coverage ────────────────────────────────────────────────────────

test('[39] coverageOf: 라운드 결속 — round === N인 entry만 그 라운드의 판정을 충족시킨다', () => {
  const id = gate.issueIdOf(CLAIM);
  const row = { issueId: id, claim: CLAIM, severity: 'HIGH', ids: ['A'] };

  const other = adjudication.foldEntries([entry({ round: 0 })]);
  const miss = adjudication.coverageOf({ effectiveBlocking: [row], round: 1, folded: other });
  assert.equal(miss.covered, false,
    '라운드 0의 판정이 라운드 1의 제기를 면제하면 reopened가 자기 자신을 면제하는 고리가 된다');
  assert.deepEqual(miss.missing, [{ issueId: id, claim: CLAIM, severity: 'HIGH' }]);

  const same = adjudication.foldEntries([entry({ round: 1 })]);
  assert.deepEqual(adjudication.coverageOf({ effectiveBlocking: [row], round: 1, folded: same }),
    { covered: true, missing: [] });

  // blocking 0건은 공허 참이고, round를 모르면 아무것도 증명되지 않는다.
  assert.equal(adjudication.coverageOf({ effectiveBlocking: [], round: 1, folded: same }).covered, true);
  assert.equal(adjudication.coverageOf({ effectiveBlocking: [row], round: null, folded: same }).covered,
    false, '라운드를 모르면 키를 만들 수 없다 → 증명 실패 쪽으로 떨어진다');
});

test('[40] coverageOf: suppressed 항목은 missing에 들어가지 않는다', () => {
  const folded = adjudication.foldEntries([entry({ round: 0, disposition: 'rejected' })]);
  const r = decideR(bothRaise(CLAIM), folded.history, 1);
  assert.equal(r.suppressed.length, 1);
  // 게이트가 넘기는 것은 **effective**뿐이다. 그렇지 않으면 종결 항목이 매 라운드
  // 재판정을 요구해 suppression의 목적이 사라진다.
  const cov = adjudication.coverageOf({
    effectiveBlocking: r.blocking, round: 1, folded: folded,
  });
  assert.equal(cov.covered, true);
  assert.deepEqual(cov.missing, []);
});

// ── 41~46 · 52~55: CLI 배선 ─────────────────────────────────────────────────

test('[41] cli adjudicate: 정상 append 후 entries가 1 늘고 저장된 claim은 원장 blocking 행의 원문이다', () => {
  const repo = makeRepo();
  const slug = 'adj-ok';
  const v0 = openBlockingRound(repo, slug, 0);
  const id = v0.blocking[0].issueId;
  assert.equal(readState(repo, slug).entries.length, 0);

  const r = adjudicateCli(repo, slug, 0, id, 'absorbed', PROOF);
  assert.equal(r.code, EX_OK, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout),
    { appended: true, round: 0, issueId: id, disposition: 'absorbed', entries: 1 });

  const stored = readState(repo, slug).entries;
  assert.equal(stored.length, 1);
  assert.equal(stored[0].claim, CLAIM,
    'claim은 인자가 아니라 원장 행에서 온다 — 호출자가 타이핑하면 원문과 어긋난 행이 저장된다');
  assert.equal(stored[0].severity, 'HIGH', 'severity도 마찬가지다');
  assert.equal(stored[0].issue_id, gate.issueIdOf(CLAIM));
  assert.equal(stored[0].kind, 'adjudication');
  assert.ok(!Number.isNaN(Date.parse(stored[0].at)), 'at은 CLI가 stamp한다');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[42] cli adjudicate: 미개설 라운드 · 없는 issue · 미인식 disposition은 각각 exit 2 + append 0건', () => {
  const repo = makeRepo();
  const slug = 'adj-reject';
  const v0 = openBlockingRound(repo, slug, 0);
  const id = v0.blocking[0].issueId;

  const noRound = adjudicateCli(repo, slug, 7, id, 'rejected', REASON);
  assert.equal(noRound.code, EX_USAGE);
  assert.match(noRound.stderr, /SANTA_ROUND_NOT_OPEN/);
  assert.equal(readState(repo, slug).entries.length, 0, 'append 0건');

  const noIssue = adjudicateCli(repo, slug, 0, 'deadbeefdead', 'rejected', REASON);
  assert.equal(noIssue.code, EX_USAGE);
  assert.match(noIssue.stderr, /SANTA_ADJUDICATION_UNKNOWN_ISSUE/);
  assert.equal(readState(repo, slug).entries.length, 0,
    '제기된 적 없는 지적에 대한 판정은 원장을 오염시킨다');

  const badDisp = adjudicateCli(repo, slug, 0, id, 'ABSORBED', REASON);
  assert.equal(badDisp.code, EX_USAGE);
  assert.match(badDisp.stderr, /SANTA_ADJUDICATION_INVALID/);
  assert.equal(readState(repo, slug).entries.length, 0);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[43] cli begin-round: 미판정 blocking이 남으면 exit 2이고 라운드가 열리지 않는다 (캡 미소모)', () => {
  const repo = makeRepo();
  const slug = 'cov-refuse';
  openBlockingRound(repo, slug, 0);
  const before = readState(repo, slug).rounds.length;

  const r = beginRound(repo, slug);
  assert.equal(r.code, EX_USAGE);
  assert.match(r.stderr, /SANTA_ADJUDICATION_INCOMPLETE/);
  assert.match(r.stderr, new RegExp(gate.issueIdOf(CLAIM)),
    '무엇을 판정해야 하는지 말하지 않으면 운영자는 원장 JSON을 손으로 읽어야 하고 게이트는 우회 대상이 된다');
  assert.equal(readState(repo, slug).rounds.length, before,
    '거부는 ledger.beginRound 이전이라 캡이 소모되지 않는다');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[44] cli begin-round: 전건 판정 후 같은 호출이 라운드를 연다 (43과 쌍)', () => {
  const repo = makeRepo();
  const slug = 'cov-open';
  const v0 = openBlockingRound(repo, slug, 0);
  assert.equal(beginRound(repo, slug).code, EX_USAGE, '먼저 거부되는 것이 이 쌍의 전제다');

  assert.equal(adjudicateCli(repo, slug, 0, v0.blocking[0].issueId, 'skipped', REASON).code, EX_OK);
  const opened = beginRound(repo, slug);
  assert.equal(opened.code, EX_OK, opened.stderr);
  assert.equal(JSON.parse(opened.stdout).roundIndex, 1);
  assert.equal(readState(repo, slug).rounds.length, 2);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[45] cli begin-round: MCCP_SANTA_ADJUDICATION_GATE=off면 loud warn 후 라운드가 열린다', () => {
  const repo = makeRepo();
  const slug = 'cov-off';
  openBlockingRound(repo, slug, 0);
  const r = withEnv({ MCCP_SANTA_ADJUDICATION_GATE: 'off' }, function () {
    return beginRound(repo, slug);
  });
  assert.equal(r.code, EX_OK);
  assert.match(r.stderr, /MCCP_SANTA_ADJUDICATION_GATE=off/,
    '검사를 끈 것은 조용히 일어나지 않는다 — 그 구간이 귀납의 예외이기 때문이다');
  assert.equal(readState(repo, slug).rounds.length, 2);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[46] cli verdict: M2 키가 실리고 기존 7키가 유지되며 ledger.read는 1회만 호출된다 (DD10)', () => {
  const repo = makeRepo();
  const slug = 'verdict-keys';
  const v0 = openBlockingRound(repo, slug, 0);
  assert.equal(adjudicateCli(repo, slug, 0, v0.blocking[0].issueId, 'rejected', REASON).code, EX_OK);
  assert.equal(beginRound(repo, slug).code, EX_OK);
  const body = { verdict: 'FAIL', critical_issues: BLOCKING_JSON };
  assert.equal(recordAt(repo, slug, 'A', 1, body).code, EX_OK);
  assert.equal(recordAt(repo, slug, 'B', 1, body).code, EX_OK);

  // spy — `carryOver`가 직전 라운드를 보는데도 읽기가 1회임을 같은 spy로 고정한다.
  // 최종 JSON만 보면 읽기 횟수가 보이지 않는다.
  const origRead = ledgerMod.read;
  const origReadReviewers = ledgerMod.readReviewers;
  let reads = 0, legacyReads = 0;
  ledgerMod.read = function (o) { reads += 1; return origRead(o); };
  ledgerMod.readReviewers = function (a, b) { legacyReads += 1; return origReadReviewers(a, b); };
  let vd;
  try { vd = verdictAt(repo, slug, 1); } finally {
    ledgerMod.read = origRead;
    ledgerMod.readReviewers = origReadReviewers;
  }
  assert.equal(vd.code, EX_OK, vd.stderr);
  assert.equal(reads, 1, '읽기가 2회면 그 사이 mutation이 끼어 동시에 존재한 적 없는 조합이 봉인된다');
  assert.equal(legacyReads, 0,
    '옛 경로(readReviewers)를 그대로 쓰면 spy는 여전히 1을 세므로, 리팩터 자체를 따로 잰다');

  const j = JSON.parse(vd.stdout);
  ['verdict', 'failing', 'exitReason', 'contract', 'blocking', 'mismatches', 'byReviewer']
    .forEach(function (k) { assert.ok(k in j, '기존 7키 유지: ' + k); });
  ['suppressed', 'niceBySuppression', 'entries', 'ledger', 'carryOver']
    .forEach(function (k) { assert.ok(k in j, 'M2 키: ' + k); });
  assert.equal(j.entries, 1);
  assert.deepEqual(Object.keys(j.ledger).sort(), ['counts', 'duplicates', 'malformed']);
  assert.deepEqual(Object.keys(j.carryOver).sort(),
    ['newBlocking', 'resolvedAbsent', 'suppressed']);
  assert.equal(j.suppressed.length, 1);
  assert.equal(j.carryOver.suppressed, 1);
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[47] santa-loop.md: Step 3 블록에 원장 토큰이 부재하고 M1 문언이 그 블록 안에 있다', () => {
  const md = fs.readFileSync(SANTA_LOOP_MD, 'utf8');
  const start = md.indexOf('### Step 3:');
  const end = md.indexOf('### Step 4:');
  assert.ok(start !== -1 && end > start, 'Step 3 블록 경계를 찾지 못하면 이 항목은 아무것도 재지 않는다');
  const step3 = md.slice(start, end);

  // **부재** — 원장은 리뷰어에게 가지 않는다(I3 · DD9). 주입 지점은 `cli.js#cmdVerdict`
  // 하나이고 리뷰어 프롬프트를 만드는 것은 이 절이다.
  //
  // 대소문자를 구분한다: `SANTA_ADJUDICATION_INCOMPLETE`는 **exit 진단 코드**이지
  // 원장 내용이 아니므로 이 단언의 대상이 아니다. 그 구분을 여기 적어 두는 이유는,
  // 적지 않으면 다음 편집자가 상수 이름을 소문자로 바꿔 이 test를 우연히 깨거나
  // 반대로 원장 요약을 대문자로 써서 우회하기 때문이다.
  ['adjudicate', 'entries', 'suppressed'].forEach(function (t) {
    assert.equal(step3.indexOf(t), -1,
      'Step 3에 "' + t + '"가 있으면 원장이 리뷰어 프롬프트로 새는 가장 직접적인 형태다');
  });

  // **존재** — 같은 블록 **안에** 있어야 한다. 항목 14·20은 파일 전역을 보므로
  // "지워졌다"만 잡고 "옮겨졌다"는 놓친다. 절 경계를 파싱하는 이 단언이 둘을 덮는다.
  assert.ok(step3.indexOf('You are an independent quality reviewer. You have NOT seen any ' +
    'other review. Your job is to find problems, not to approve.') !== -1,
    'FAIL-first 문장이 Step 3 밖으로 옮겨지면 리뷰어 프롬프트가 그것을 잃는다');
  assert.ok(step3.indexOf('failure_scenario') !== -1,
    'severity 계약의 blocking 조건이 Step 3 안에 있어야 리뷰어가 읽는다');

  // Step 5는 반대로 판정 기록 단계를 **가져야** 한다.
  const step5 = md.slice(md.indexOf('### Step 5: Fix Cycle'), md.indexOf('### Step 5.5:'));
  assert.match(step5, /adjudicate --decision/, 'NAUGHTY 경로에 판정 기록 단계가 있어야 한다');
  assert.match(step5, /SANTA_ADJUDICATION_INCOMPLETE/,
    '건너뛰면 다음 begin-round가 거부한다는 것을 산문이 예고해야 운영자가 거부를 버그로 오해하지 않는다');
});

test('[48] receipt에 santa_entries가 정수로 봉인되고 판정 본문은 원장에만 있다', () => {
  const repo = makeRepo();
  const slug = 'sealed-entries';
  const v0 = openBlockingRound(repo, slug, 0);
  assert.equal(adjudicateCli(repo, slug, 0, v0.blocking[0].issueId, 'absorbed', EV_CANARY).code,
    EX_OK);

  // 다음 라운드는 재등장 없이 깨끗하게 수렴한다 → NICE → seal.
  assert.equal(beginRound(repo, slug).code, EX_OK);
  assert.equal(recordAt(repo, slug, 'A', 1, { verdict: 'PASS', critical_issues: [] }).code, EX_OK);
  assert.equal(recordAt(repo, slug, 'B', 1, { verdict: 'PASS', critical_issues: [] }).code, EX_OK);
  assert.equal(verdictAt(repo, slug, 1).code, EX_OK);
  assert.equal(cli(['seal', '--cwd', repo, '--decision', slug]).code, EX_OK);

  const state = readState(repo, slug);
  assert.equal(state.entries.length, 1);
  assert.ok(JSON.stringify(state).indexOf(EV_CANARY) !== -1, '원장에는 판정 본문이 있다');

  const receiptText = fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-santa-review', slug + '.json'), 'utf8');
  const receipt = JSON.parse(receiptText);
  assert.ok(Number.isInteger(receipt.meta.santa_entries));
  assert.equal(receipt.meta.santa_entries, state.entries.length,
    '타입만 보면 원장 0건에 receipt 5가 실려도 통과한다 — 값 일치까지 잰다');
  // 두 단언이 함께 있어야 "원장에는 있고 receipt에는 없다"가 검사된다.
  assert.equal(receiptText.indexOf(EV_CANARY), -1,
    '판정 사유 본문이 git-tracked receipt로 새면 안 된다');
  assert.equal(receiptText.indexOf(CLAIM), -1, 'claim 본문도 마찬가지다');
  const reportText = fs.readFileSync(
    path.join(repo, '.claude', 'reviews', 'santa-review-' + slug + '.md'), 'utf8');
  assert.equal(reportText.indexOf(EV_CANARY), -1, '집계 리포트도 git-tracked이다');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[49] DD13 — 같은 라운드의 판정은 자기 자신을 지우지 못한다 (판정만으로 루프를 끝내는 우회 차단)', () => {
  const repo = makeRepo();
  const slug = 'self-suppress';
  const v0 = openBlockingRound(repo, slug, 0);
  const id = v0.blocking[0].issueId;
  assert.equal(v0.verdict, 'NAUGHTY');

  assert.equal(adjudicateCli(repo, slug, 0, id, 'absorbed', PROOF).code, EX_OK);
  const again = JSON.parse(verdictAt(repo, slug, 0).stdout);
  assert.equal(again.verdict, 'NAUGHTY',
    '판정 → 같은 라운드 verdict 재호출 → NICE → seal → push는 리뷰가 한 번도 다시 돌지 않는 경로다');
  assert.equal(again.suppressed.length, 0);
  assert.equal(again.blocking.length, 1);

  // 라운드 N+1에 같은 claim이 재등장했을 때만 suppress된다.
  assert.equal(beginRound(repo, slug).code, EX_OK);
  const body = { verdict: 'FAIL', critical_issues: BLOCKING_JSON };
  assert.equal(recordAt(repo, slug, 'A', 1, body).code, EX_OK);
  assert.equal(recordAt(repo, slug, 'B', 1, body).code, EX_OK);
  const v1 = JSON.parse(verdictAt(repo, slug, 1).stdout);
  assert.equal(v1.suppressed.length, 1);
  assert.equal(v1.verdict, 'NICE');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[50] resolved가 비어 있지 않은데 round가 정수가 아니면 suppression 0건 + loud warn', () => {
  const folded = adjudication.foldEntries([entry({ round: 0, disposition: 'rejected' })]);
  // `decideR`을 쓰지 않는다 — 그 helper는 `round` 미지정을 1로 채우므로 `undefined`
  // 케이스가 정수 경로로 새어 이 항목이 아무것도 재지 못한다.
  const withRound = function (bad) {
    return gate.decideAdjudicatedVerdict({
      reviewers: bothRaise(CLAIM), cap: 3, severityGate: 'enforce',
      round: bad, resolved: folded.history,
    });
  };
  [null, undefined, '1', 1.5, NaN].forEach(function (bad) {
    const cap = captureStderr(function () { return withRound(bad); });
    assert.equal(cap.value.suppressed.length, 0,
      '라운드를 모르면 자기-suppression을 막을 수 없으므로 안전한 기본값은 M1 동작이다');
    assert.equal(cap.value.blocking.length, 1);
    assert.match(cap.stderr, /round is not an integer/);
  });
  // 비-Map `resolved`도 같은 방향으로 떨어진다.
  const cap2 = captureStderr(function () { return decideR(bothRaise(CLAIM), { a: 1 }, 1); });
  assert.equal(cap2.value.suppressed.length, 0);
  assert.match(cap2.stderr, /must be a Map/);
});

test('[51] niceBySuppression: suppression 덕분에 NICE인 라운드에서만 true다 (세 경우)', () => {
  const folded = adjudication.foldEntries([entry({ round: 0, disposition: 'rejected' })]);

  const bySup = decideR(bothRaise(CLAIM), folded.history, 1);
  assert.equal(bySup.verdict, 'NICE');
  assert.equal(bySup.niceBySuppression, true, '원장이 루프를 끝낸 사건은 눈에 보여야 한다');

  const cleanNice = decideR([reviewer('A', 'PASS', []), reviewer('B', 'PASS', [])], folded.history, 1);
  assert.equal(cleanNice.verdict, 'NICE');
  assert.equal(cleanNice.niceBySuppression, false, 'suppression 없이 NICE면 false다');

  const naughty = decideR(bothRaise(PARAPHRASE), folded.history, 1);
  assert.equal(naughty.verdict, 'NAUGHTY');
  assert.equal(naughty.niceBySuppression, false, 'blocking이 남아 NAUGHTY면 false다');
});

test('[52] cli record: FINAL 라운드에 기록하면 exit 2 + append 0건 (DD14)', () => {
  const repo = makeRepo();
  const slug = 'record-final';
  openBlockingRound(repo, slug, 0);
  const before = readState(repo, slug).rounds[0].reviewers.length;

  const r = recordAt(repo, slug, 'A', 0, { verdict: 'PASS', critical_issues: [] });
  assert.equal(r.code, EX_USAGE);
  assert.match(r.stderr, /SANTA_ROUND_NOT_OPEN/);
  assert.match(r.stderr, /already FINAL/);
  assert.equal(readState(repo, slug).rounds[0].reviewers.length, before,
    'FINAL 라운드에 리뷰어가 더 붙으면 판정한 blocking 집합과 검사하는 집합이 갈린다');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[53] cli record: 같은 라운드에 같은 id를 다시 기록하면 exit 2 + append 0건 (DD14)', () => {
  const repo = makeRepo();
  const slug = 'record-dup';
  assert.equal(beginRound(repo, slug).code, EX_OK);
  const body = { verdict: 'FAIL', critical_issues: BLOCKING_JSON };
  assert.equal(recordAt(repo, slug, 'A', 0, body).code, EX_OK);

  const dup = recordAt(repo, slug, 'A', 0, body);
  assert.equal(dup.code, EX_USAGE);
  assert.match(dup.stderr, /SANTA_REVIEWER_DUPLICATE_ID/);
  assert.equal(readState(repo, slug).rounds[0].reviewers.length, 1,
    '한 리뷰어를 둘로 세면 blocking[].ids와 byReviewer가 갈리고 판정 대상 목록이 부정확해진다');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[54] cli verdict: FINAL 재호출은 mutation 없이 같은 JSON을 내고, 갈리면 SANTA_VERDICT_UNSTABLE이다', () => {
  const repo = makeRepo();
  const slug = 'verdict-once';
  const first = openBlockingRound(repo, slug, 0);
  const before = bytes(statePath(repo, slug));

  const again = verdictAt(repo, slug, 0);
  assert.equal(again.code, EX_OK);
  assert.deepEqual(JSON.parse(again.stdout), first, '재계산이 결정적이므로 같은 JSON이다(DD13)');
  assert.ok(before.equals(bytes(statePath(repo, slug))), '원장 바이트가 불변이다 — mutation 0건');

  // 저장 verdict와 재계산이 갈리는 fixture — 손으로 편집된 원장의 형태다.
  const st = readState(repo, slug);
  st.rounds[0].verdict = 'NICE';
  fs.writeFileSync(statePath(repo, slug), JSON.stringify(st, null, 2) + '\n');
  const unstable = verdictAt(repo, slug, 0);
  assert.equal(unstable.code, EX_USAGE);
  assert.match(unstable.stderr, /SANTA_VERDICT_UNSTABLE/);
  assert.equal(readState(repo, slug).rounds[0].verdict, 'NICE',
    '봉인된 verdict를 조용히 덮어쓰지 않는다 — 불일치 자체가 진단이다');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('[55] cli adjudicate: 이미 suppress된 issue도 reopened로 되돌릴 수 있다 (존재 검사가 합집합이다)', () => {
  const repo = makeRepo();
  const slug = 'reopen';
  const v0 = openBlockingRound(repo, slug, 0);
  const id = v0.blocking[0].issueId;
  assert.equal(adjudicateCli(repo, slug, 0, id, 'rejected', REASON).code, EX_OK);

  assert.equal(beginRound(repo, slug).code, EX_OK);
  const body = { verdict: 'FAIL', critical_issues: BLOCKING_JSON };
  assert.equal(recordAt(repo, slug, 'A', 1, body).code, EX_OK);
  assert.equal(recordAt(repo, slug, 'B', 1, body).code, EX_OK);
  const v1 = JSON.parse(verdictAt(repo, slug, 1).stdout);
  assert.equal(v1.blocking.length, 0, '라운드 1에서 그 지적은 effective에 없다');
  assert.equal(v1.suppressed.length, 1);

  // effective만 보면 이 호출이 불가능해진다 — 탈출구를 만들어 놓고 문을 잠그는 셈이다.
  const re = adjudicateCli(repo, slug, 1, id, 'reopened', REASON);
  assert.equal(re.code, EX_OK, re.stderr);

  assert.equal(beginRound(repo, slug).code, EX_OK);
  assert.equal(recordAt(repo, slug, 'A', 2, body).code, EX_OK);
  assert.equal(recordAt(repo, slug, 'B', 2, body).code, EX_OK);
  const v2 = JSON.parse(verdictAt(repo, slug, 2).stdout);
  assert.equal(v2.blocking.length, 1, 'reopened 이후 그 지적은 다시 blocking으로 계수된다');
  assert.equal(v2.suppressed.length, 0);
  assert.equal(v2.verdict, 'NAUGHTY');
  fs.rmSync(repo, { recursive: true, force: true });
});

// ── 56~60: 생산 지점 · 관측 · runtime 가드 ──────────────────────────────────

test('[56] analyzeReviewers: 병합 blocking 행마다 issueId가 있고 issueIdOf(그 행의 claim)과 같다', () => {
  const a = gate.analyzeReviewers(bothRaise(CLAIM));
  assert.equal(a.blocking.length, 1, '같은 claim을 낸 두 리뷰어는 한 행으로 합쳐진다');
  assert.equal(typeof a.blocking[0].issueId, 'string');
  assert.equal(a.blocking[0].issueId, gate.issueIdOf(a.blocking[0].claim),
    '이 필드가 빠지면 coverage·suppression·adjudicate 조회가 전부 undefined 키로 조용히 통과한다');
  assert.deepEqual(a.blocking[0].ids, ['A', 'B'], '병합돼도 id는 하나다');

  // 서로 다른 두 지적은 서로 다른 id를 갖는다 — 전건에 대해 성립해야 한다.
  const two = gate.analyzeReviewers([
    reviewer('A', 'FAIL', [finding({ claim: CLAIM }), finding({ claim: PARAPHRASE })]),
    reviewer('B', 'PASS', []),
  ]);
  assert.equal(two.blocking.length, 2);
  two.blocking.forEach(function (b) {
    assert.equal(b.issueId, gate.issueIdOf(b.claim));
  });
  assert.notEqual(two.blocking[0].issueId, two.blocking[1].issueId);
});

test('[57] carryOverOf: 정확 재보고는 suppressed로 잡히고 라운드 0의 newBlocking은 raw 전체다', () => {
  const folded = adjudication.foldEntries([entry({ round: 0, disposition: 'rejected' })]);
  const id = gate.issueIdOf(CLAIM);

  const c1 = adjudication.carryOverOf({
    rawBlockingIds: [id], prevBlockingIds: [id], folded: folded, round: 1,
  });
  assert.deepEqual(c1, { suppressed: 1, resolvedAbsent: 0, newBlocking: 0 });

  // 라운드 0 — 비교할 직전 라운드가 없다. 그것을 "새 지적이 없다"와 같은 0으로
  // 보고하면 첫 라운드가 영원히 조용해진다.
  const c0 = adjudication.carryOverOf({
    rawBlockingIds: [id, gate.issueIdOf(PARAPHRASE)], prevBlockingIds: null,
    folded: folded, round: 0,
  });
  assert.equal(c0.newBlocking, 2);
  assert.equal(c0.suppressed, 0, '라운드 0에는 round < 0인 판정이 없다');

  // 전부 집합 연산이고 임계가 없다 — 입력 형태(Set/배열)에 무관하다.
  const asSet = adjudication.carryOverOf({
    rawBlockingIds: new Set([id]), prevBlockingIds: new Set(), folded: folded, round: 1,
  });
  assert.equal(asSet.newBlocking, 1);
});

test('[58] 패러프레이즈는 suppress되지 않고 그 사건이 resolvedAbsent·newBlocking 쌍으로 관측된다', () => {
  const folded = adjudication.foldEntries([entry({ round: 0, disposition: 'rejected' })]);
  const r = decideR(bothRaise(PARAPHRASE), folded.history, 1);
  assert.equal(r.suppressed.length, 0,
    '같은 결함을 다르게 쓰면 id가 갈려 suppression이 발화하지 않는다 — DD5가 인정한 한계다');
  assert.equal(r.blocking.length, 1);
  assert.equal(r.verdict, 'NAUGHTY');

  const c = adjudication.carryOverOf({
    rawBlockingIds: [gate.issueIdOf(PARAPHRASE)],
    prevBlockingIds: [gate.issueIdOf(CLAIM)],
    folded: folded, round: 1,
  });
  assert.ok(c.resolvedAbsent >= 1, '종결한 지적이 사라진 것처럼 보인다');
  assert.ok(c.newBlocking >= 1, '동시에 새 지적이 같은 속도로 늘어난다');
  // **이 쌍은 패러프레이즈를 식별하지 않는다. 그 패턴을 노출할 뿐이다.** 훗날
  // 누군가 fuzzy matcher를 넣으면 위 `suppressed.length === 0`이 red가 되어 설계
  // 변경이 명시적으로 드러난다.
  assert.equal(c.suppressed, 0);
});

test('[59] lastBefore: append 순서로 마지막을 고르고 부재·비정수 round는 던지지 않는다 (네 경우)', () => {
  const id = gate.issueIdOf(CLAIM);

  // (1) 라운드 1 rejected → 라운드 2 reopened → 라운드 3의 판정은 reopened를 본다.
  const reopened = adjudication.foldEntries([
    entry({ round: 1, disposition: 'rejected' }),
    entry({ round: 2, disposition: 'reopened' }),
  ]);
  assert.equal(decideR(bothRaise(CLAIM), reopened.history, 3).suppressed.length, 0,
    '가장 최근 판정이 reopened면 suppress하지 않는다');

  // (2) 같은 라운드에 두 판정이 append되면 **뒤**가 이긴다(round 정렬이 아니다).
  const sameRound = adjudication.foldEntries([
    entry({ round: 2, disposition: 'reopened' }),
    entry({ round: 2, disposition: 'rejected' }),
  ]);
  assert.equal(decideR(bothRaise(CLAIM), sameRound.history, 3).suppressed.length, 1,
    'append 순서가 시간 순서다(DD1) — 정렬로 바꾸면 같은 라운드 안의 순서 정보가 사라진다');
  assert.equal(gate.lastBefore(sameRound.history.get(id), 3).disposition, 'rejected');

  // (3) 이력 부재는 정상 입력이다 — 판정된 적 없는 issue다.
  assert.equal(gate.lastBefore(undefined, 3), null);
  assert.equal(gate.lastBefore(null, 3), null);
  assert.doesNotThrow(function () { decideR(bothRaise(CLAIM), new Map([['zzz', []]]), 3); });

  // (4) round가 정수가 아닌 행만 있으면 suppress 0건이고 던지지 않는다.
  const corrupt = new Map([[id, [{ round: '2', disposition: 'rejected' }]]]);
  assert.equal(gate.lastBefore(corrupt.get(id), 3), null,
    '손상 행이 suppression을 발화시키면 읽을 수 없는 판정이 blocking을 지운다');
  assert.equal(decideR(bothRaise(CLAIM), corrupt, 3).suppressed.length, 0);
});

test('[60] issueId 유실 시 runtime fail-closed — coverage는 막고 suppression은 거부한다', () => {
  const id = gate.issueIdOf(CLAIM);
  const folded = adjudication.foldEntries([entry({ round: 0, disposition: 'rejected' })]);

  // (a) coverageOf — 필드가 없는 행은 `<round>:undefined` 키를 만들지 않고 missing에
  //     담긴다. 이 규칙이 없으면 coverage가 **늘 통과**한다.
  [undefined, null, '', 42].forEach(function (broken) {
    const row = { claim: CLAIM, severity: 'HIGH', ids: ['A'] };
    if (broken !== undefined) row.issueId = broken;
    const cov = adjudication.coverageOf({ effectiveBlocking: [row], round: 0, folded: folded });
    assert.equal(cov.covered, false, JSON.stringify(broken) + ': 증명되지 않은 행은 uncovered다');
    assert.equal(cov.missing[0].issueId, null);
    assert.equal(cov.missing[0].claim, CLAIM);
  });

  // (b) decideAdjudicatedVerdict — 그 행을 절대 suppress하지 않고 effective에 남기며
  //     loud warn한다. 정상 경로의 `analyzeReviewers`는 이 필드를 항상 채우므로,
  //     가드에 도달하려면 생산 지점을 stub해야 한다(그 seam이 gate.js에 문서화돼 있다).
  const orig = gate.analyzeReviewers;
  const stubbed = function (reviewers) {
    const a = orig(reviewers);
    a.blocking.forEach(function (b) { delete b.issueId; });
    return a;
  };
  let r;
  let cap;
  gate.analyzeReviewers = stubbed;
  try {
    cap = captureStderr(function () { return decideR(bothRaise(CLAIM), folded.history, 1); });
    r = cap.value;
  } finally { gate.analyzeReviewers = orig; }

  assert.equal(r.suppressed.length, 0, '필드가 없으면 절대 suppress하지 않는다');
  assert.equal(r.blocking.length, 1, '그 행은 effective에 남는다 — 게이트가 막는 쪽이다');
  assert.equal(r.verdict, 'NAUGHTY');
  assert.match(cap.stderr, /no issueId/,
    '조용히 0건이 되는 것과 명시적으로 거부하고 warn하는 것은 다르다 — 전자는 정상 동작과 구별되지 않는다');
  assert.equal(id.length, 12);
});

// ══════════════════════════════════════════════════════════════════════════════
// santa-adjudication M3 — patch-chasing terminator + 캡 정책 (커버리지 61~87)
//
// 1~60은 무변경이고 같은 파일이 계약 전량을 계속 소유한다(머리말의 규약).
// CLI를 겨눈 항목(68·73~76·81·82·84·85·86)은 tmpdir `git init` 진짜 repo fixture
// 위에서 in-process `runCli`를 지난다 — 특히 68은 진짜 `git show` 출력을 파싱해야
// 의미가 있다(합성 diff 문자열은 내가 쓴 파서를 내가 쓴 입력으로 재는 것이다).
// ══════════════════════════════════════════════════════════════════════════════

const terminator = require('../santa/terminator');
// `ledgerMod`는 M2 블록(위)이 이미 require했다 — 같은 모듈 객체를 그대로 쓴다.
const { patchRangesFrom } = require('../santa/cli');
const { validate: validateReceipt } = require('../../receipt/schema');

const SANTA_LOOP_MD_REL = ['..', '..', '..', 'commands', 'santa-loop.md'];

// 원장 fixture — CLI 경로 검증이 목적인 항목은 라운드를 8회 CLI로 쌓는 대신
// 원장을 직접 만든다(항목 73의 문언: "fixture가 locations를 채운 원장을 직접
// 만드므로 리뷰어 행동에 의존하지 않는다"). 검증 대상인 `runCli`·`ledger.read`·
// `git show`는 전부 진짜다.
function ledgerFixture(slug, over) {
  return Object.assign({
    schema_version: ledgerMod.SCHEMA_VERSION,
    decision_id: slug,
    cap: 3,
    rounds: [],
    entries: [],
    terminated: null,
  }, over || {});
}

function roundFixture(index, verdict, reviewers) {
  return {
    index: index,
    started_at: '2026-08-17T00:00:00.000Z',
    reviewers: (reviewers || []).map(function (r) { return { envelope: r, raw: null }; }),
    verdict: verdict === undefined ? null : verdict,
  };
}

function writeLedger(repo, slug, state) {
  const p = statePath(repo, slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return p;
}

// blocking 자격을 갖춘 finding + `locations`.
function locFinding(claim, locations) {
  return finding({ claim: claim, locations: locations === undefined ? [] : locations });
}

// M1/M2 형태 envelope — `findings` 키 자체가 없고 `locations`도 없다(항목 82).
function legacyEnvelope(id, verdict, claims) {
  return legacyReviewer(id, verdict, claims || []);
}

// 이 파일의 **단일** `withEnv` 정의다(이전에 같은 이름이 위쪽에도 있었고, 함수 선언은
// 호이스팅되므로 뒤의 것이 파일 전체에서 이겨 앞의 것은 죽은 코드였다 — 그 판을 고치는
// 변경은 아무 효과 없이 green이 된다). 이 정의보다 위에 있는 호출부도 호이스팅으로 이것을 쓴다.
function withEnv(patch, fn) {
  const saved = {};
  Object.keys(patch).forEach(function (k) {
    saved[k] = Object.prototype.hasOwnProperty.call(process.env, k) ? process.env[k] : undefined;
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  });
  try { return fn(); } finally {
    Object.keys(saved).forEach(function (k) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  }
}

// ── env 파서 ─────────────────────────────────────────────────────────────────

test('[61] parseTerminator: 미설정·enforce·off·불량값 4경우 — 불량값은 enforce + loud warn', () => {
  assert.equal(terminator.parseTerminator({}), 'enforce', '미설정은 default enforce');
  assert.equal(terminator.parseTerminator(undefined), 'enforce', 'env 자체 부재도 default');
  assert.equal(terminator.parseTerminator({ MCCP_SANTA_TERMINATOR: '' }), 'enforce');
  assert.equal(terminator.parseTerminator({ MCCP_SANTA_TERMINATOR: ' enforce ' }), 'enforce');
  assert.equal(terminator.parseTerminator({ MCCP_SANTA_TERMINATOR: 'off' }), 'off');

  const bad = captureStderr(function () {
    return terminator.parseTerminator({ MCCP_SANTA_TERMINATOR: 'OFF' });
  });
  assert.equal(bad.value, 'enforce', '열거 밖은 default로 떨어진다 (대소문자 구분)');
  assert.match(bad.stderr, /MCCP_SANTA_TERMINATOR/,
    '조용한 fallback은 오타를 감춘다 — 끄려는 의도가 반영되지 않았음을 warn이 알린다');
  assert.equal(terminator.ENV_TERMINATOR, 'MCCP_SANTA_TERMINATOR');
});

// ── normalizeLocations ───────────────────────────────────────────────────────

test('[62] normalizeLocations: 비배열·null·원소 타입 위반이 전부 던지지 않고 정규화된다', () => {
  [undefined, null, 0, '', {}, 'x', 42, true].forEach(function (bad) {
    assert.doesNotThrow(function () { terminator.normalizeLocations(bad); },
      JSON.stringify(bad) + ': 전역 함수는 어떤 입력에도 던지지 않는다');
    assert.deepEqual(terminator.normalizeLocations(bad), [],
      '비배열은 빈 배열이다 — 던지면 위치 표기 오류 하나가 실재 blocking을 지운다');
  });

  // 원소별 위반: 객체 아님 · file 비문자열 · file 빈 문자열 · file 상한 초과
  const dropped = terminator.normalizeLocations([
    'a.js', null, 42, [], { file: 7 }, { file: '' },
    { file: 'x'.repeat(terminator.MAX_FILE_CHARS + 1) }, { line: 3 },
  ]);
  assert.deepEqual(dropped, [], '유효한 file이 없는 원소는 전부 떨어진다');

  // `line`은 양의 정수일 때만 보존되고, 아니면 null이다 — 원소 자체는 살아남는다
  // (파일 단위 일치는 여전히 가능하므로 원소를 버리면 정보가 준다).
  const lines = terminator.normalizeLocations([
    { file: 'a.js', line: 0 }, { file: 'b.js', line: -3 }, { file: 'c.js', line: 1.5 },
    { file: 'd.js', line: '7' }, { file: 'e.js' }, { file: 'f.js', line: 12 },
  ]);
  assert.deepEqual(lines.map(function (l) { return l.line; }), [null, null, null, null, null, 12]);
  assert.deepEqual(lines.map(function (l) { return l.file; }),
    ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js']);
  lines.forEach(function (l) {
    assert.deepEqual(Object.keys(l).sort(), ['file', 'line'],
      '반환 원소는 2키 고정이다 — 소비자가 키 부재와 null을 구별할 필요가 없다');
  });
});

test('[63] normalizeLocations: 21개가 20개로 절삭되고 입력 배열이 변형되지 않는다', () => {
  const input = [];
  for (let i = 0; i < 21; i++) input.push({ file: 'f' + i + '.js', line: i + 1 });
  const snapshot = JSON.stringify(input);

  const out = terminator.normalizeLocations(input);
  assert.equal(out.length, terminator.MAX_LOCATIONS, '상한은 20이다');
  assert.equal(out.length, 20);
  assert.equal(out[19].file, 'f19.js', '앞에서부터 취한다');
  assert.equal(JSON.stringify(input), snapshot,
    '입력을 변형하면 호출자가 보는 원장 envelope가 조용히 바뀐다');
  // 절삭 사실은 반환에 남지 않는다 — 정규화이지 판정이 아니다. 남기면 위치 표기
  // 개수가 판정에 영향을 주기 시작한다.
  out.forEach(function (l) { assert.deepEqual(Object.keys(l).sort(), ['file', 'line']); });
});

// ── classifyTarget ───────────────────────────────────────────────────────────

test('[64] classifyTarget: DD11 표 4행 전수 + patchRanges 빈 집합은 unknown', () => {
  const ranges = { 'src/a.js': [[10, 20]], 'src/b.js': [[1, 3]] };

  assert.equal(terminator.classifyTarget({ locations: [], patchRanges: ranges }),
    'unknown', 'locations 빈 배열은 대조할 것이 없다');
  assert.equal(terminator.classifyTarget({ locations: null, patchRanges: ranges }),
    'unknown', 'locations 부재도 같다');
  assert.equal(terminator.classifyTarget({
    locations: [{ file: 'src/a.js', line: 12 }], patchRanges: {},
  }), 'unknown', 'patchRanges 빈 집합 — git이 실패했거나 hunk가 0건이다');
  assert.equal(terminator.classifyTarget({
    locations: [{ file: 'src/a.js', line: 12 }, { file: 'src/b.js', line: 2 }],
    patchRanges: ranges,
  }), 'round_n_patch', '모든 location이 patch 안이다');
  assert.equal(terminator.classifyTarget({
    locations: [{ file: 'src/a.js', line: 12 }, { file: 'src/z.js', line: 2 }],
    patchRanges: ranges,
  }), 'preexisting', '파일 하나가 patch 밖이면 전체가 preexisting이다');
  assert.equal(terminator.classifyTarget({
    locations: [{ file: 'src/a.js', line: 99 }], patchRanges: ranges,
  }), 'preexisting', '파일은 맞지만 라인이 hunk 밖이다');

  // 전역 함수 — 어떤 입력에도 던지지 않는다.
  [undefined, null, 0, '', [], 'x'].forEach(function (bad) {
    assert.doesNotThrow(function () {
      terminator.classifyTarget({ locations: bad, patchRanges: bad });
    });
    assert.doesNotThrow(function () { terminator.classifyTarget(bad); });
  });
});

test('[65] classifyTarget: line 부재는 파일 단위 일치, 삭제 전용 파일에 line 지정은 preexisting', () => {
  // 삭제 전용 hunk(`d === 0`)는 파일을 집합에 넣되 라인 범위를 만들지 않는다.
  const ranges = { 'src/added.js': [[1, 5]], 'src/deleted-only.js': [] };

  assert.equal(terminator.classifyTarget({
    locations: [{ file: 'src/added.js', line: null }], patchRanges: ranges,
  }), 'round_n_patch', 'line이 없으면 파일 단위 일치로 충분하다 — 라인을 요구하면 대부분이 unknown이 되어 terminator가 사실상 죽는다');
  assert.equal(terminator.classifyTarget({
    locations: [{ file: 'src/deleted-only.js' }], patchRanges: ranges,
  }), 'round_n_patch', '삭제 전용 파일도 파일 단위로는 patch가 손댄 파일이다');
  assert.equal(terminator.classifyTarget({
    locations: [{ file: 'src/deleted-only.js', line: 3 }], patchRanges: ranges,
  }), 'preexisting', '지워진 라인을 겨누는 지적은 존재할 수 없으므로 안전한 쪽으로 떨어진다');
});

// ── gate.analyzeReviewers의 locations union ──────────────────────────────────

test('[66] analyzeReviewers: 병합 blocking 행의 locations가 두 리뷰어 입력의 합집합이고 중복이 제거된다', () => {
  const CLAIM = 'the merge step loses one element';
  const a = reviewer('A', 'FAIL', [locFinding(CLAIM, [
    { file: 'src/merge.js', line: 12 }, { file: 'src/merge.js', line: 12 },
  ])]);
  const b = reviewer('B', 'FAIL', [locFinding(CLAIM, [
    { file: 'src/merge.js', line: 12 }, { file: 'src/merge.js', line: 40 },
    { file: 'src/other.js' },
  ])]);

  const an = gate.analyzeReviewers([a, b]);
  assert.equal(an.blocking.length, 1, '같은 정규화 claim은 한 행으로 병합된다');
  const locs = an.blocking[0].locations;
  assert.deepEqual(locs, [
    { file: 'src/merge.js', line: 12 },
    { file: 'src/merge.js', line: 40 },
    { file: 'src/other.js', line: null },
  ], '합집합이고 (file, line) 쌍으로 중복 제거된다');
  // 합집합인 이유: 어느 한쪽을 버리는 규칙을 두면 버림이 판정을 바꾼다(버리는 쪽이
  // patch 안이면 분류가 preexisting으로 뒤집힌다). 합집합은 그 선택을 없앤다.
  assert.deepEqual(an.blocking[0].ids, ['A', 'B']);
});

test('[67] analyzeReviewers: locations 부재·불량이 blocking 자격을 바꾸지 않는다 (M1 기대값 동일)', () => {
  const CLAIM = 'the merge step loses one element';
  const base = [reviewer('A', 'FAIL', [finding({ claim: CLAIM })]),
    reviewer('B', 'FAIL', [finding({ claim: CLAIM })])];
  const expected = gate.analyzeReviewers(base);

  [undefined, null, 'not-an-array', 42, {}, [{ nope: 1 }], [{ file: 7 }]].forEach(function (bad) {
    const rs = [
      reviewer('A', 'FAIL', [locFinding(CLAIM, bad)]),
      reviewer('B', 'FAIL', [locFinding(CLAIM, bad)]),
    ];
    const an = gate.analyzeReviewers(rs);
    assert.equal(an.contract, expected.contract,
      JSON.stringify(bad) + ': locations는 계약 축이 아니다 — 강등하면 위치 표기 오류가 실재 blocking을 지운다');
    assert.equal(an.blocking.length, expected.blocking.length);
    assert.equal(an.blocking[0].severity, expected.blocking[0].severity);
    assert.equal(an.blocking[0].issueId, expected.blocking[0].issueId);
    assert.deepEqual(an.blocking[0].locations, [], '불량은 강등 없이 빈 배열이다');
    // classifyFinding 자체도 이 필드를 보지 않는다.
    assert.equal(gate.classifyFinding(locFinding(CLAIM, bad)).blocking, true);
  });
});

// ── patchRangesFrom (진짜 git) ───────────────────────────────────────────────

test('[68] patchRangesFrom: 진짜 git show 출력에서 추가·수정·삭제전용·신규파일 4종을 파싱한다', () => {
  const repo = makeRepo();
  const run = function (args) {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  };
  fs.writeFileSync(path.join(repo, 'keep.txt'), 'k1\nk2\nk3\n');
  fs.writeFileSync(path.join(repo, 'mod.txt'), 'm1\nm2\nm3\nm4\nm5\n');
  fs.writeFileSync(path.join(repo, 'shrink.txt'), 's1\ns2\ns3\ns4\ns5\n');
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: repo, stdio: 'ignore' });

  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'new.js'), 'n1\nn2\nn3\n');   // 신규 파일
  fs.writeFileSync(path.join(repo, 'mod.txt'), 'm1\nm2\nCHANGED\nm4\nm5\n'); // 수정
  fs.writeFileSync(path.join(repo, 'shrink.txt'), 's1\ns4\ns5\n');      // 삭제 전용
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-qm', 'fix round 0'], { cwd: repo, stdio: 'ignore' });
  const rev = run(['rev-parse', 'HEAD']).trim();

  const ranges = patchRangesFrom(rev, { cwd: repo });

  assert.ok(Object.prototype.hasOwnProperty.call(ranges, 'src/new.js'),
    '신규 파일은 patch 집합에 들어간다');
  assert.deepEqual(ranges['src/new.js'], [[1, 3]], '신규 파일은 전체가 추가 범위다');
  assert.deepEqual(ranges['mod.txt'], [[3, 3]], '수정은 새 파일 기준 라인 하나다');
  assert.ok(Object.prototype.hasOwnProperty.call(ranges, 'shrink.txt'),
    '삭제 전용 파일도 집합에는 들어간다');
  assert.deepEqual(ranges['shrink.txt'], [],
    '추가 라인이 없으므로 범위는 만들지 않는다 — 그 파일의 라인 지정 지적은 preexisting이다');
  assert.equal(Object.prototype.hasOwnProperty.call(ranges, 'keep.txt'), false,
    '손대지 않은 파일은 집합에 없다');

  // 반환은 `Object.create(null)`이다 — 경로가 `__proto__`인 파일이 own property를
  // 잃고 조용히 사라지는 것을 막는다. 그래서 빈 집합 판정은 `deepEqual({})`이
  // 아니라 키 수로 한다(deepStrictEqual은 prototype까지 본다).
  const isEmpty = function (v) { return Object.keys(v).length === 0; };

  // 부재·불량·존재하지 않는 rev는 전부 빈 집합이다(오류가 아니라 unknown 쪽).
  assert.ok(isEmpty(patchRangesFrom(undefined, { cwd: repo })));
  assert.ok(isEmpty(patchRangesFrom('  ', { cwd: repo })));
  const bad = captureStderr(function () { return patchRangesFrom('--upstream', { cwd: repo }); });
  assert.ok(isEmpty(bad.value), '플래그처럼 보이는 문자열은 형식 검사에서 걸린다');
  assert.match(bad.stderr, /prev-fix-rev/);
  const gone = captureStderr(function () {
    return patchRangesFrom('0123456789abcdef0123456789abcdef01234567', { cwd: repo });
  });
  assert.ok(isEmpty(gone.value), '존재하지 않는 rev는 비영점 exit이고 빈 집합으로 흡수된다');

  // trailing newline은 셸이 쓴 앵커 파일의 정상 형태다 — trim이 없으면 정상 rev가
  // 전부 불량으로 떨어져 terminator가 영원히 미발화한다.
  assert.deepEqual(patchRangesFrom(rev + '\n', { cwd: repo }), ranges);
});

// ── decideTermination ────────────────────────────────────────────────────────

function fireInput(over) {
  const base = {
    mode: 'enforce',
    round: 1,
    minRound: terminator.MIN_ROUND,
    effectiveBlocking: [
      { issueId: 'aaaaaaaaaaaa', claim: 'c1', severity: 'HIGH', locations: [{ file: 'src/a.js', line: 4 }] },
    ],
    patchRanges: { 'src/a.js': [[1, 9]] },
    capAllowsAnotherRound: true,
  };
  return Object.assign(base, over || {});
}

test('[69] decideTermination: 5항 AND의 각 항을 하나씩 거짓으로 만든 5경우가 전부 미발화하고 reason이 그 항을 지목한다', () => {
  assert.equal(terminator.decideTermination(fireInput()).terminate, true, '기준선은 발화한다');

  const cases = [
    [{ mode: 'off' }, 'env-off'],
    [{ round: 0 }, 'round-below-min'],
    [{ effectiveBlocking: [] }, 'no-effective-blocking'],
    [{ patchRanges: { 'src/other.js': [[1, 9]] } }, 'not-all-round-n-patch'],
    [{ capAllowsAnotherRound: false }, 'cap-would-end-this-run'],
  ];
  cases.forEach(function (pair) {
    const d = terminator.decideTermination(fireInput(pair[0]));
    assert.equal(d.terminate, false, JSON.stringify(pair[0]) + ': 한 항이 거짓이면 발화하지 않는다');
    assert.equal(d.reason, pair[1], 'reason은 어느 항이 막았는지를 지목한다');
    assert.equal(d.exitReason, null, '미발화에는 종료 사유가 없다');
  });

  const fired = terminator.decideTermination(fireInput());
  assert.equal(fired.reason, null);
  assert.equal(fired.exitReason, 'patch_chasing');
  assert.equal(fired.exitReason, terminator.EXIT_REASON.PATCH_CHASING);
});

test('[70] decideTermination: effectiveBlocking이 빈 배열이면 every가 참이어도 미발화한다', () => {
  // 빈 배열에 `every`가 참이 되는 것이 이 AND에서 유일하게 위험한 자리라 조건을
  // 따로 세운다. blocking 0건 라운드는 NICE이고 루프의 정상 종료는 이미 그쪽이다 —
  // 그 라운드를 patch_chasing으로 봉인하면 수렴을 종료로 오기록한다.
  const d = terminator.decideTermination(fireInput({ effectiveBlocking: [] }));
  assert.equal(d.terminate, false);
  assert.equal(d.reason, 'no-effective-blocking');
  assert.deepEqual(d.classified, []);
  assert.deepEqual(d.unresolved, []);
  assert.deepEqual(d.targetsBreakdown, { round_n_patch: 0, preexisting: 0, unknown: 0 });
  // 비배열도 같다(전역 함수).
  assert.equal(terminator.decideTermination(fireInput({ effectiveBlocking: null })).terminate, false);
});

test('[71] decideTermination: capAllowsAnotherRound=false면 미발화 — 캡이 끝낼 run을 terminator가 주장하지 않는다', () => {
  const d = terminator.decideTermination(fireInput({ capAllowsAnotherRound: false }));
  assert.equal(d.terminate, false);
  assert.equal(d.reason, 'cap-would-end-this-run');
  // 이 항은 안전이 아니라 정직성이다: 두 종료 사유가 배타로 유지돼야 "자연 종료
  // 비율"이 의미를 갖는다.
  assert.equal(terminator.decideTermination(fireInput({ capAllowsAnotherRound: undefined })).terminate,
    false, '불리언 true가 아니면 전부 미발화 쪽이다');
  assert.equal(terminator.decideTermination(fireInput({ capAllowsAnotherRound: 'yes' })).terminate, false);
});

test('[72] decideTermination: 발화 시 unresolved가 전건을 담고 classified가 분류를 담되 입력 행은 변형되지 않는다', () => {
  const rows = [
    { issueId: 'aaaaaaaaaaaa', claim: 'c1', severity: 'HIGH', locations: [{ file: 'src/a.js', line: 4 }] },
    { issueId: 'bbbbbbbbbbbb', claim: 'c2', severity: 'CRITICAL', locations: [{ file: 'src/a.js', line: 8 }] },
  ];
  const snapshot = JSON.stringify(rows);
  const d = terminator.decideTermination(fireInput({ effectiveBlocking: rows }));

  assert.equal(d.terminate, true);
  assert.deepEqual(d.classified, [
    { issueId: 'aaaaaaaaaaaa', target: 'round_n_patch' },
    { issueId: 'bbbbbbbbbbbb', target: 'round_n_patch' },
  ], 'classified는 {issueId, target} 2키다');
  assert.deepEqual(d.unresolved, [
    { issueId: 'aaaaaaaaaaaa', severity: 'HIGH', claim: 'c1', targets: 'round_n_patch' },
    { issueId: 'bbbbbbbbbbbb', severity: 'CRITICAL', claim: 'c2', targets: 'round_n_patch' },
  ], 'unresolved는 effective blocking 전건을 담는다');

  // **입력 행에 target/targets 키가 생기지 않는다** — DD3의 분리(리뷰어 입력
  // locations ↔ 집계 판정 targets)가 코드에서 유지되는지를 재는 자리다. 집계가
  // 입력 행을 되짚어 쓰면 그 분리가 이름만 남는다.
  assert.equal(JSON.stringify(rows), snapshot, '입력 비변형');
  rows.forEach(function (r) {
    assert.equal(Object.prototype.hasOwnProperty.call(r, 'target'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(r, 'targets'), false);
  });
});

// ── check-termination (CLI) ──────────────────────────────────────────────────

// 라운드 0의 수정 커밋 + 라운드 1의 지적이 그 커밋을 겨누는 원장을 만든다.
function chasingRepo(slug) {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'fix.js'), 'l1\nl2\nl3\nl4\n');
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-qm', 'fix: address santa-loop review findings (round 0)'],
    { cwd: repo, stdio: 'ignore' });
  const rev = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

  const chasing = 'the round-0 fix left the guard unreachable';
  const state = ledgerFixture(slug, {
    rounds: [
      roundFixture(0, 'NAUGHTY', [
        reviewer('A', 'FAIL', [finding({ claim: 'original defect' })]),
        reviewer('B', 'FAIL', [finding({ claim: 'original defect' })]),
      ]),
      roundFixture(1, 'NAUGHTY', [
        reviewer('A', 'FAIL', [locFinding(chasing, [{ file: 'src/fix.js', line: 2 }])]),
        reviewer('B', 'FAIL', [locFinding(chasing, [{ file: 'src/fix.js', line: 3 }])]),
      ]),
    ],
  });
  writeLedger(repo, slug, state);
  return { repo: repo, rev: rev, slug: slug, claim: chasing };
}

test('[73] check-termination(CLI): 발화 시 exit 0 + terminate:true + 원장에 결속된 patch_chasing 마커', () => {
  const f = chasingRepo('m3-fire');
  const r = cli(['check-termination', '--cwd', f.repo, '--decision', f.slug,
    '--prev-fix-rev', f.rev]);

  assert.equal(r.code, EX_OK,
    'exit은 항상 0이다 — 비영점을 쓰면 "종료됨"이 Step 4.5의 다른 실패와 구별되지 않는다');
  const j = JSON.parse(r.stdout);
  assert.equal(j.terminate, true);
  assert.equal(j.exitReason, 'patch_chasing');
  assert.equal(j.reason, null);
  assert.equal(j.round, 1);
  assert.deepEqual(j.targetsBreakdown, { round_n_patch: 1, preexisting: 0, unknown: 0 });
  assert.equal(j.unresolved.length, 1);
  assert.equal(j.unresolved[0].targets, 'round_n_patch');

  const state = readState(f.repo, f.slug);
  assert.equal(state.terminated.reason, 'patch_chasing');
  assert.equal(state.terminated.rounds, 2, '마커는 관측 시점의 라운드 수에 결속된다');
  assert.ok(!Number.isNaN(Date.parse(state.terminated.at)));
  assert.equal(state.cap, 3, 'terminate는 state.cap을 건드리지 않는다');
});

test('[74] check-termination(CLI): --prev-fix-rev 부재·불량·존재하지 않는 rev 3경우가 전부 미발화 + exit 0', () => {
  [null, '--upstream', '0123456789abcdef0123456789abcdef01234567'].forEach(function (rev) {
    const f = chasingRepo('m3-norev');
    const argv = ['check-termination', '--cwd', f.repo, '--decision', f.slug];
    if (rev !== null) argv.push('--prev-fix-rev', rev);
    const r = cli(argv);

    assert.equal(r.code, EX_OK, String(rev) + ': 판정 실패는 오류가 아니다');
    const j = JSON.parse(r.stdout);
    assert.equal(j.terminate, false, String(rev) + ': 모르면 종료하지 않는다');
    assert.equal(j.reason, 'not-all-round-n-patch');
    assert.equal(j.targetsBreakdown.unknown, 1, 'patch 범위가 빈 집합이면 전량 unknown이다');
    assert.equal(readState(f.repo, f.slug).terminated, null, '미발화는 마커를 쓰지 않는다');
  });
});

test('[75] begin-round: 결속된 patch_chasing 마커에서 exit 2 · 라운드 미개설 · 캡 미소모', () => {
  const f = chasingRepo('m3-block');
  cli(['check-termination', '--cwd', f.repo, '--decision', f.slug, '--prev-fix-rev', f.rev]);
  const before = readState(f.repo, f.slug);
  assert.equal(before.terminated.reason, 'patch_chasing');

  const r = withEnv({ MCCP_SANTA_ADJUDICATION_GATE: 'off' }, function () {
    return cli(['begin-round', '--cwd', f.repo, '--decision', f.slug]);
  });
  assert.equal(r.code, EX_USAGE, 'SANTA_TERMINATED는 기존 SANTA_* → exit 2 매핑을 탄다 (신규 code 없음)');
  assert.match(r.stderr, /SANTA_TERMINATED/);

  const after = readState(f.repo, f.slug);
  assert.equal(after.rounds.length, before.rounds.length, '라운드가 열리지 않았다');
  assert.equal(after.terminated.at, before.terminated.at, '마커도 그대로다 — 캡이 소모되지 않는다');
});

test('[76] begin-round: MCCP_SANTA_TERMINATOR=off면 마커가 있어도 라운드가 열리고 마커가 지워진다 (재개 경로)', () => {
  const f = chasingRepo('m3-resume');
  cli(['check-termination', '--cwd', f.repo, '--decision', f.slug, '--prev-fix-rev', f.rev]);
  assert.equal(readState(f.repo, f.slug).terminated.reason, 'patch_chasing');

  const r = withEnv({ MCCP_SANTA_TERMINATOR: 'off', MCCP_SANTA_ADJUDICATION_GATE: 'off' },
    function () { return cli(['begin-round', '--cwd', f.repo, '--decision', f.slug]); });

  assert.equal(r.code, EX_OK);
  assert.match(r.stderr, /MCCP_SANTA_TERMINATOR=off/, '건너뛴 사실은 loud하다');
  const after = readState(f.repo, f.slug);
  assert.equal(after.rounds.length, 3, '라운드가 열렸다');
  // **마커 삭제 코드는 새로 만들지 않는다** — `beginRound`의 기존 허용 분기가
  // 이미 `state.terminated = null`을 수행한다. 그것이 `ledger.terminate`에 짝이
  // 되는 `clearTermination`이 없는 이유다.
  assert.equal(after.terminated, null);
});

// ── 커맨드 본문 회귀 ─────────────────────────────────────────────────────────

test('[77] santa-loop.md 문구 회귀: Step 4.5가 존재하고 terminate 분기·seal·exit이 조건문 안에 있다', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'commands', 'santa-loop.md'), 'utf8');
  const start = md.indexOf('### Step 4.5');
  assert.notEqual(start, -1, 'Step 4.5가 산문으로도 존재하지 않으면 나머지는 볼 것이 없다');
  const end = md.indexOf('### Step 5:', start);
  assert.ok(end > start, 'Step 4.5는 Step 5 앞에 있다 (소수점 삽입 — 기존 번호는 그대로다)');
  const sec = md.slice(start, end);
  assert.match(sec, /check-termination/);

  // **분기 존재 자체**를 if/fi 깊이로 단언한다. 토큰이 있는지만 보면 M2 R3이 잡은
  // "셸이 exit code를 캡처만 하고 분기하지 않는다"의 재발을 못 잡는다.
  let depth = 0;
  let branchDepth = -1;
  let sealDepth = -1;
  let exitDepth = -1;
  sec.split(/\r?\n/).forEach(function (raw) {
    const line = raw.trim();
    if (/^if\s/.test(line)) depth += 1;
    if (/^fi\b/.test(line)) depth -= 1;
    if (/^if\s+\[\s*"\$TERMINATE"\s*=\s*"1"\s*\]/.test(line)) branchDepth = depth;
    if (/seal\s+--decision/.test(line) && sealDepth === -1) sealDepth = depth;
    if (/^exit\s+1\b/.test(line) && exitDepth === -1) exitDepth = depth;
  });
  assert.equal(depth, 0, 'if/fi가 짝을 이룬다');
  assert.equal(branchDepth, 1, 'terminate 분기는 최상위 조건문이다');
  assert.ok(sealDepth >= 1, 'seal 호출이 조건문 밖에 있으면 미발화 라운드마다 봉인이 돈다');
  assert.ok(exitDepth >= 1, 'exit이 조건문 밖이면 Step 5로 내려가지 않는 것이 아니라 항상 멈춘다');
  assert.match(sec, /SEAL_EXIT/, 'seal 실패는 캡처되고 진단된다');
  assert.match(sec, /CHECK_EXIT/);
});

// ── ledger.terminate ─────────────────────────────────────────────────────────

test('[78] ledger.terminate: 결속·멱등·다른 reason 비덮어쓰기·열거 밖 throw·state.cap 무변경', () => {
  const repo = makeRepo();
  const slug = 'm3-terminate';
  writeLedger(repo, slug, ledgerFixture(slug, {
    rounds: [roundFixture(0, 'NAUGHTY', []), roundFixture(1, 'NAUGHTY', [])],
  }));
  const opts = { cwd: repo, decisionId: slug, env: process.env };

  // (1) 결속 — 마커는 관측 시점의 라운드 수를 담는다.
  const at2 = { expectedRounds: 2, expectedRound: 1 };
  const first = ledgerMod.terminate(Object.assign({ reason: 'patch_chasing' }, at2), opts);
  assert.equal(first.terminated, true);
  const s1 = readState(repo, slug);
  assert.equal(s1.terminated.reason, 'patch_chasing');
  assert.equal(s1.terminated.rounds, 2);
  assert.equal(s1.cap, 3, 'state.cap은 건드리지 않는다');

  // (2) 멱등 — 같은 사유·같은 결속이면 재기록하지 않는다. 재기록하면 `at`이
  //     호출마다 밀려 **최초 종료 시각**이라는 감사값이 사라진다.
  const second = ledgerMod.terminate(Object.assign({ reason: 'patch_chasing' }, at2), opts);
  assert.equal(second.already, true);
  assert.equal(readState(repo, slug).terminated.at, s1.terminated.at);

  // (3) 다른 reason이어도 덮어쓰지 않는다 — 먼저 관측된 종료가 실제 종료다.
  const third = ledgerMod.terminate(Object.assign({ reason: 'cap_reached' }, at2), opts);
  assert.equal(third.already, true);
  assert.equal(third.reason, 'patch_chasing');
  assert.equal(readState(repo, slug).terminated.reason, 'patch_chasing');

  // (4) 열거 밖은 throw이고 **lock을 잡지 않는다**(검사가 mutate 밖이다).
  [undefined, null, '', 'terminated', 42, { reason: 7 }].forEach(function (bad) {
    assert.throws(function () {
      ledgerMod.terminate(Object.assign(
        bad && bad.reason !== undefined ? bad : { reason: bad }, at2), opts);
    }, /SANTA_TERMINATION_INVALID|termination reason/);
  });
  assert.equal(readState(repo, slug).terminated.reason, 'patch_chasing', '거부는 원장을 바꾸지 않는다');

  // (5) 결속을 잃은 마커는 새 종료로 덮인다 — 영구 낙인이 되지 않는다.
  const stale = readState(repo, slug);
  stale.rounds.push(roundFixture(2, 'NAUGHTY', []));
  writeLedger(repo, slug, stale);
  const fourth = ledgerMod.terminate(
    { reason: 'cap_reached', expectedRounds: 3, expectedRound: 2 }, opts);
  assert.equal(fourth.already, false);
  assert.equal(readState(repo, slug).terminated.rounds, 3);
});

// ── 판정 좌표 (santa-adjudication M3 follow-up · PR-Codex R1 F1) ─────────────

test('[89] terminate 좌표: 판정 이후 원장이 움직이면 봉인하지 않는다 · 좌표 부재는 throw · cli 배선', () => {
  const repo = makeRepo();
  const slug = 'm3-terminate-stale';
  writeLedger(repo, slug, ledgerFixture(slug, {
    rounds: [roundFixture(0, 'NAUGHTY', []), roundFixture(1, 'NAUGHTY', [])],
  }));
  const opts = { cwd: repo, decisionId: slug, env: process.env };

  // (1) 좌표 부재·불량은 lock을 잡기 전에 throw다. 기본값을 두면 옛 호출자가 조용히
  //     옛(취약) 경로를 타므로 fail-closed가 유일한 안전한 선택이다.
  [
    { reason: 'patch_chasing' },
    { reason: 'patch_chasing', expectedRounds: 2 },
    { reason: 'patch_chasing', expectedRound: 1 },
    { reason: 'patch_chasing', expectedRounds: 2, expectedRound: 2 },
    { reason: 'patch_chasing', expectedRounds: 0, expectedRound: 0 },
    { reason: 'patch_chasing', expectedRounds: '2', expectedRound: '1' },
  ].forEach(function (bad) {
    assert.throws(function () { ledgerMod.terminate(bad, opts); },
      /SANTA_TERMINATION_INVALID|coordinates/);
  });
  assert.equal(readState(repo, slug).terminated, null, '거부는 원장을 바꾸지 않는다');

  // (2) TOCTOU 본체 — 판정은 라운드 1(전체 2)에서 났는데 봉인 전에 다른 프로세스가
  //     라운드 2를 연다. 가드가 없으면 마커가 **평가된 적 없는** 라운드 수에 결속되고
  //     이후 `begin-round`가 그것에 막혀 미평가 작업이 잘린다.
  const raced = readState(repo, slug);
  raced.rounds.push(roundFixture(2, null, []));
  writeLedger(repo, slug, raced);

  const stale = ledgerMod.terminate(
    { reason: 'patch_chasing', expectedRounds: 2, expectedRound: 1 }, opts);
  assert.equal(stale.stale, true);
  assert.equal(stale.terminated, false);
  assert.equal(stale.already, false,
    'stale은 멱등과 구별된다 — 남의 종료를 자기 종료로 보고하지 않는다');
  assert.equal(stale.rounds, 3);
  assert.equal(stale.lastFinalRound, 1);
  assert.equal(readState(repo, slug).terminated, null, '마커가 쓰이지 않았다');

  // (3) 같은 축의 두 번째 형태 — 라운드 **수**는 그대로인데 뒤 라운드가 FINAL이 됐다.
  //     길이만 비교하면 통과하므로 last-final도 함께 봐야 한다.
  const finalized = readState(repo, slug);
  finalized.rounds[2] = roundFixture(2, 'NAUGHTY', []);
  writeLedger(repo, slug, finalized);
  const stale2 = ledgerMod.terminate(
    { reason: 'patch_chasing', expectedRounds: 3, expectedRound: 1 }, opts);
  assert.equal(stale2.stale, true);
  assert.equal(readState(repo, slug).terminated, null);

  // (4) 좌표가 맞으면 평소대로 봉인한다 — 가드가 정상 경로를 막지 않는다.
  const ok = ledgerMod.terminate(
    { reason: 'patch_chasing', expectedRounds: 3, expectedRound: 2 }, opts);
  assert.equal(ok.terminated, true);
  assert.equal(readState(repo, slug).terminated.rounds, 3);

  // (5) 배선 — `cmdCheckTermination`이 좌표를 전달하고, 봉인되지 않았으면 stdout이
  //     종료를 **주장하지 않는다**. 여기가 끊기면 (2)의 가드가 있어도 커맨드 본문은
  //     일어나지 않은 종료를 escalate하고 seal을 돌린다.
  const cliSrc = fs.readFileSync(path.join(__dirname, '..', 'santa', 'cli.js'), 'utf8');
  const from = cliSrc.indexOf('function cmdCheckTermination');
  assert.ok(from > 0, 'cmdCheckTermination을 찾지 못하면 이 검사는 아무것도 증명하지 않는다');
  const rest = cliSrc.slice(from + 1);
  const nextFn = rest.indexOf(String.fromCharCode(10) + 'function ');
  const body = rest.slice(0, nextFn > 0 ? nextFn : rest.length);
  // 정규식 대신 원문 일치다 — 이 네 줄은 배선의 *형태*가 아니라 **바로 그 표현**을
  // 요구한다. 느슨하게 쓰면 좌표를 다른 값으로 바꿔도 통과한다.
  assert.ok(body.includes('expectedRounds: state.rounds.length'),
    '판정에 쓴 라운드 수를 그대로 넘긴다');
  assert.ok(body.includes('expectedRound: round'), '판정 대상 라운드를 그대로 넘긴다');
  assert.ok(body.includes('sealed && sealed.stale'), '거부를 읽는다');
  assert.ok(body.includes('terminate: decision.terminate && !staleDecision'),
    '봉인되지 않았으면 stdout이 종료를 주장하지 않는다');
});

// ── 증거 절단 (santa-adjudication M3 follow-up · PR-Codex R2 F2) ─────────────

test('[90] classifyTarget: 상한을 넘긴 locations는 대조 불가다 — 절단이 발화 쪽으로 틀리지 않는다', () => {
  const ranges = { 'src/a.js': [[1, 100]] };
  const inside = function (n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ file: 'src/a.js', line: i + 1 });
    return out;
  };

  // (1) 경계는 그대로다 — 상한 이하는 평소대로 판정한다.
  assert.equal(terminator.classifyTarget({ locations: inside(20), patchRanges: ranges }),
    terminator.TARGETS.ROUND_N_PATCH, '20건은 절단되지 않았으므로 대조가 완전하다');

  // (2) 상한 초과는 `unknown`이다. 전부 patch 안이어도 그렇다 — 판단 근거는 '밖이
  //     있었나'가 아니라 '전부 봤나'이고, 절단된 입력에서는 후자를 말할 수 없다.
  assert.equal(terminator.classifyTarget({ locations: inside(21), patchRanges: ranges }),
    terminator.TARGETS.UNKNOWN);

  // (3) Codex가 지목한 바로 그 시나리오 — 잘려 나간 21번째가 patch **밖**이다.
  //     가드가 없으면 앞 20건만 보고 `round_n_patch`가 되어, `preexisting`이어야 할
  //     지적이 전량 조건을 통과시킨다. 절단의 오차는 발화 쪽 한 방향이라 위험하다.
  const hidden = inside(20).concat([{ file: 'src/untouched.js', line: 3 }]);
  assert.equal(terminator.classifyTarget({ locations: hidden, patchRanges: ranges }),
    terminator.TARGETS.UNKNOWN, '증거가 잘렸으면 종료를 만들지 않는다');

  // (4) 정규화 자체는 무변경이다 — 항목 63이 그은 경계(정규화는 판정이 아니다)를
  //     이 수정이 옮기지 않았음을 여기서 고정한다.
  assert.equal(terminator.normalizeLocations(inside(21)).length, terminator.MAX_LOCATIONS);

  // (5) end-to-end — 상한 초과 지적 하나가 있으면 전량 조건이 성립하지 않아 미발화다.
  const d = terminator.decideTermination({
    mode: 'enforce',
    round: 1,
    minRound: terminator.MIN_ROUND,
    effectiveBlocking: [
      { issueId: 'aaaaaaaaaaaa', claim: 'c1', severity: 'HIGH', locations: hidden },
    ],
    patchRanges: ranges,
    capAllowsAnotherRound: true,
  });
  assert.equal(d.terminate, false);
  assert.equal(d.reason, 'not-all-round-n-patch');
  assert.equal(d.targetsBreakdown.unknown, 1);
  assert.equal(d.targetsBreakdown.round_n_patch, 0);
});

// ── seal 술어 일반화 ─────────────────────────────────────────────────────────

test('[79] seal: cap_reached 회귀 대조군 · patch_chasing 종료 · converged 투영 3경우', () => {
  const nice = function (index) {
    return roundFixture(index, 'NICE', [
      reviewer('A', 'PASS', []), reviewer('B', 'PASS', []),
    ]);
  };
  const naughty = function (index) {
    return roundFixture(index, 'NAUGHTY', [
      reviewer('A', 'FAIL', [finding({})]), reviewer('B', 'FAIL', [finding({})]),
    ]);
  };

  // (a) **회귀 대조군.** 술어를 `exitReason !== null`로 일반화한 뒤에도 캡 경로의
  //     봉인이 그대로여야 한다. 1~60에 캡 경로 seal test가 하나도 없어서, 술어를
  //     `rounds.length` 같은 다른 축으로 잘못 일반화한 변이가 (b)·(c)만으로는
  //     green을 유지하면서 캡 경로를 조용히 깬다.
  const capRepo = makeRepo();
  writeLedger(capRepo, 'm3-cap', ledgerFixture('m3-cap', {
    cap: 1,
    rounds: [naughty(0)],
    terminated: { reason: 'cap_reached', at: '2026-08-17T00:00:00.000Z', rounds: 1 },
  }));
  const capSeal = JSON.parse(cli(['seal', '--cwd', capRepo, '--decision', 'm3-cap']).stdout);
  assert.equal(capSeal.verdict, 'divergent');
  const capProof = JSON.parse(fs.readFileSync(path.join(capRepo, capSeal.proofPath), 'utf8'));
  assert.equal(capProof.layers.l1, 'divergent');
  const capReceipt = JSON.parse(fs.readFileSync(path.resolve(capRepo, capSeal.receiptPath), 'utf8'));
  assert.equal(capReceipt.meta.santa_exit_reason, 'cap_reached');

  // (b) patch_chasing 종료도 같은 층 매핑을 받는다. 일반화하지 않으면 여기서
  //     l1='converged'가 되어 **승인하지 않은 게이트가 승인했다고 receipt가 적는다**.
  const pcRepo = makeRepo();
  writeLedger(pcRepo, 'm3-pc', ledgerFixture('m3-pc', {
    rounds: [naughty(0), naughty(1)],
    terminated: { reason: 'patch_chasing', at: '2026-08-17T00:00:00.000Z', rounds: 2 },
  }));
  const pcSeal = JSON.parse(cli(['seal', '--cwd', pcRepo, '--decision', 'm3-pc']).stdout);
  assert.equal(pcSeal.verdict, 'divergent');
  const pcProof = JSON.parse(fs.readFileSync(path.join(pcRepo, pcSeal.proofPath), 'utf8'));
  assert.equal(pcProof.layers.l1, 'divergent');
  const pcReceipt = JSON.parse(fs.readFileSync(path.resolve(pcRepo, pcSeal.receiptPath), 'utf8'));
  assert.equal(pcReceipt.meta.santa_exit_reason, 'patch_chasing');
  assert.equal(validateReceipt(pcReceipt).ok, true, 'schema가 새 값을 받는다');
  // 리포트에 exit reason 줄이 남는다 — Acceptance (B)의 파일 증명이 이 줄을 읽는다.
  const pcReport = fs.readFileSync(path.join(pcRepo, pcSeal.reportPath), 'utf8');
  assert.match(pcReport, /^- exit reason: `patch_chasing`$/m);

  // (c) converged 원장에서는 exitReason이 null로 투영된다(기존 규칙, 무변경).
  const okRepo = makeRepo();
  writeLedger(okRepo, 'm3-ok', ledgerFixture('m3-ok', {
    rounds: [naughty(0), nice(1)],
    terminated: { reason: 'patch_chasing', at: '2026-08-17T00:00:00.000Z', rounds: 2 },
  }));
  const okSeal = JSON.parse(cli(['seal', '--cwd', okRepo, '--decision', 'm3-ok']).stdout);
  assert.equal(okSeal.verdict, 'converged');
  const okProof = JSON.parse(fs.readFileSync(path.join(okRepo, okSeal.proofPath), 'utf8'));
  assert.equal(okProof.layers.l1, 'converged', '수렴한 원장에는 종료 사유가 투영되지 않는다');
  const okReceipt = JSON.parse(fs.readFileSync(path.resolve(okRepo, okSeal.receiptPath), 'utf8'));
  assert.equal(okReceipt.meta.santa_exit_reason, undefined);
});

// ── receipt schema ───────────────────────────────────────────────────────────

test('[80] schema: santa_exit_reason이 2종을 받고 그 밖은 invalid하며 필드 부재는 여전히 valid', () => {
  const repo = makeRepo();
  writeLedger(repo, 'm3-schema', ledgerFixture('m3-schema', {
    rounds: [roundFixture(0, 'NAUGHTY', [
      reviewer('A', 'FAIL', [finding({})]), reviewer('B', 'FAIL', [finding({})]),
    ])],
    terminated: { reason: 'patch_chasing', at: '2026-08-17T00:00:00.000Z', rounds: 1 },
  }));
  const sealed = JSON.parse(cli(['seal', '--cwd', repo, '--decision', 'm3-schema']).stdout);
  const receipt = JSON.parse(fs.readFileSync(path.resolve(repo, sealed.receiptPath), 'utf8'));

  ['cap_reached', 'patch_chasing'].forEach(function (v) {
    receipt.meta.santa_exit_reason = v;
    assert.equal(validateReceipt(receipt).ok, true, v + '는 열거 안이다');
  });
  ['', 'terminated', 'CAP_REACHED', 42, true, [], {}].forEach(function (v) {
    receipt.meta.santa_exit_reason = v;
    assert.equal(validateReceipt(receipt).ok, false,
      JSON.stringify(v) + ': 열거는 닫혀 있다 (additive-permissive는 2종까지다)');
  });
  delete receipt.meta.santa_exit_reason;
  assert.equal(validateReceipt(receipt).ok, true,
    '부재는 "종료가 기록되지 않았다"이고 과거 receipt가 그 형태다');
});

// ── 읽기·쓰기 열거 동기 ──────────────────────────────────────────────────────

test('[81] 읽기·쓰기 열거 동기: patch_chasing 마커가 쓰인 원장을 ledger.read가 던지지 않고 읽는다', () => {
  // **이 항목이 DD2의 한 커밋 불변식 전부다.** `assertTerminationMarker`를 넓히지
  // 않으면 마커를 쓴 직후의 첫 read()가 SANTA_LEDGER_CORRUPT로 던져 그 slug의
  // 원장이 통째로 읽히지 않는다 — seal도, status도, begin-round도.
  const repo = makeRepo();
  const slug = 'm3-sync';
  writeLedger(repo, slug, ledgerFixture(slug, {
    rounds: [roundFixture(0, 'NAUGHTY', [])],
    terminated: { reason: 'patch_chasing', at: '2026-08-17T00:00:00.000Z', rounds: 1 },
  }));
  const opts = { cwd: repo, decisionId: slug, env: process.env };

  let state;
  assert.doesNotThrow(function () { state = ledgerMod.read(opts); });
  assert.equal(state.terminated.reason, 'patch_chasing');
  assert.deepEqual(ledgerMod.TERMINATION_REASONS.slice().sort(),
    ['cap_reached', 'patch_chasing'], '읽기와 쓰기가 같은 집합을 본다');

  // status(= aggregateFrom)까지 그대로 흐른다.
  const st = cli(['status', '--cwd', repo, '--decision', slug]);
  assert.equal(st.code, EX_OK);
  assert.equal(JSON.parse(st.stdout).exitReason, 'patch_chasing');

  // 열거 밖 reason은 여전히 손상이다 — 넓힌 것은 2종이지 아무 문자열이 아니다.
  writeLedger(repo, slug, ledgerFixture(slug, {
    rounds: [roundFixture(0, 'NAUGHTY', [])],
    terminated: { reason: 'whatever', at: '2026-08-17T00:00:00.000Z', rounds: 1 },
  }));
  assert.throws(function () { ledgerMod.read(opts); },
    function (err) { return err.code === 'SANTA_LEDGER_CORRUPT'; },
    '열거 밖 reason은 여전히 손상이다 — 넓힌 것은 2종이지 아무 문자열이 아니다');
});

test('[82] legacy 원장 전방 호환: locations 없는 M1/M2 envelope에서 terminator가 던지지 않고 전량 unknown → 미발화', () => {
  const repo = makeRepo();
  const slug = 'm3-legacy';
  const CLAIM = 'the merge step loses one element';
  writeLedger(repo, slug, ledgerFixture(slug, {
    rounds: [
      roundFixture(0, 'NAUGHTY', [legacyEnvelope('A', 'FAIL', [CLAIM]),
        legacyEnvelope('B', 'FAIL', [CLAIM])]),
      // M1 형태(findings는 있고 locations 키가 없다)
      roundFixture(1, 'NAUGHTY', [
        { id: 'A', model: 'm', verdict: 'FAIL', criticalIssues: [CLAIM], findings: [finding({ claim: CLAIM })] },
        { id: 'B', model: 'm', verdict: 'FAIL', criticalIssues: [CLAIM], findings: [finding({ claim: CLAIM })] },
      ]),
    ],
  }));

  const r = cli(['check-termination', '--cwd', repo, '--decision', slug]);
  assert.equal(r.code, EX_OK, 'legacy 원장에서 죽지 않는다');
  const j = JSON.parse(r.stdout);
  assert.equal(j.terminate, false);
  assert.equal(j.targetsBreakdown.unknown, j.classified.length);
  assert.ok(j.classified.length > 0, 'blocking은 정상적으로 계산된다');
  assert.equal(readState(repo, slug).terminated, null);
});

test('[83] I1·I3 회귀: Step 3에 종료 판정 토큰이 부재하고 M1 severity 계약 문언이 무변경이다', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'commands', 'santa-loop.md'), 'utf8');
  const s3 = md.indexOf('### Step 3: Dual Independent Review');
  const s4 = md.indexOf('### Step 4: Verdict Gate');
  assert.ok(s3 !== -1 && s4 > s3);
  const step3 = md.slice(s3, s4);

  // I1 — 리뷰어는 위치만 말하고 판정은 하지 않는다. 종료 어휘가 Step 3에 새면
  // 리뷰어가 그 판정을 자기 것으로 삼는다.
  ['patch_chasing', 'check-termination', 'terminate'].forEach(function (tok) {
    assert.equal(step3.includes(tok), false,
      'Step 3에 종료 판정 토큰 "' + tok + '"이 있다 — 리뷰어를 판정 주체로 만든다');
  });

  // I3 — M1 severity 계약 문언은 한 글자도 바뀌지 않는다(UI1: 리뷰어를 온화하게
  // 만들지 말 것). 공백만 정규화해 대조한다.
  const flat = step3.replace(/\s+/g, ' ');
  assert.ok(flat.includes('An issue counts as *blocking* only when its `severity` is `CRITICAL` or `HIGH` **and** its `failure_scenario` is substantive.'),
    'M1 severity 계약 문언이 바뀌었다');
  assert.ok(flat.includes('This is not permission to look less hard.'),
    'FAIL-first 프레이밍이 사라졌다');

  // 반면 `locations` **계약 문언**은 Step 3에 있어야 한다 — 절 경계와 토큰을 나눠
  // 단언하는 것이 이 항목의 요점이다.
  assert.ok(step3.includes('"locations"'), 'Step 3의 리뷰어 JSON에 locations가 없다');
  assert.ok(flat.includes('**Location contract.**'), 'locations 계약 문단이 없다');
});

test('[84] 미발화 원인 진단: 전량 unknown이면 stderr가 발화하고 부분 unknown에서는 침묵한다', () => {
  // `locations`가 선택 필드인 이상 미발화가 **설계상 정상 경로**와 **리뷰어
  // 미준수** 둘 다에서 나온다. 그 둘을 구별하지 못하면 종료가 관측되지 않은 이유가
  // 사후에 진단 불가가 된다.
  const all = chasingRepo('m3-allunknown');
  const allState = readState(all.repo, all.slug);
  allState.rounds[1].reviewers.forEach(function (r) {
    r.envelope.findings.forEach(function (f) { f.locations = []; });
  });
  writeLedger(all.repo, all.slug, allState);
  const rAll = cli(['check-termination', '--cwd', all.repo, '--decision', all.slug,
    '--prev-fix-rev', all.rev]);
  const jAll = JSON.parse(rAll.stdout);
  assert.equal(jAll.targetsBreakdown.unknown, jAll.classified.length);
  assert.ok(jAll.classified.length > 0);
  assert.match(rAll.stderr, /classified `unknown`/,
    '전량 unknown은 "리뷰어가 재료를 내지 않았다"이고 그것이 기록에 남아야 한다');

  // 부분 unknown(1건만)은 정상 미발화다 — 침묵한다.
  const part = chasingRepo('m3-partunknown');
  const partState = readState(part.repo, part.slug);
  partState.rounds[1].reviewers[0].envelope.findings.push(
    finding({ claim: 'a second issue with no location', locations: [] }));
  partState.rounds[1].reviewers[1].envelope.findings.push(
    finding({ claim: 'a second issue with no location', locations: [] }));
  writeLedger(part.repo, part.slug, partState);
  const rPart = cli(['check-termination', '--cwd', part.repo, '--decision', part.slug,
    '--prev-fix-rev', part.rev]);
  const jPart = JSON.parse(rPart.stdout);
  assert.equal(jPart.classified.length, 2);
  assert.equal(jPart.targetsBreakdown.unknown, 1);
  assert.equal(jPart.terminate, false, 'unknown이 하나라도 있으면 발화하지 않는다');
  assert.equal(/classified `unknown`/.test(rPart.stderr), false,
    '부분 unknown은 정상 미발화라 침묵한다 — 여기서 떠들면 신호가 노이즈가 된다');
});

test('[85] kill-switch 두 자리: off에서 check-termination이 env-off를 내고 마커를 쓰지 않는다', () => {
  const f = chasingRepo('m3-killswitch');
  const r = withEnv({ MCCP_SANTA_TERMINATOR: 'off' }, function () {
    return cli(['check-termination', '--cwd', f.repo, '--decision', f.slug,
      '--prev-fix-rev', f.rev]);
  });
  assert.equal(r.code, EX_OK);
  const j = JSON.parse(r.stdout);
  assert.equal(j.terminate, false);
  // 셋째 자리(커맨드 본문 셸 `if`)가 생기면 이 값이 `env-off`가 아니게 된다 —
  // 커맨드 본문은 `terminate` 불리언에만 분기하므로 off에서도 코드 경로가 같고
  // `reason`이 그 이유를 터미널에 남긴다.
  assert.equal(j.reason, 'env-off');
  assert.equal(readState(f.repo, f.slug).terminated, null, 'off는 마커를 쓰지 않는다');

  // 같은 env로 켰을 때는 발화한다 — off가 판정을 억제한 것이 맞다는 대조군.
  const on = cli(['check-termination', '--cwd', f.repo, '--decision', f.slug,
    '--prev-fix-rev', f.rev]);
  assert.equal(JSON.parse(on.stdout).terminate, true);
});

test('[86] tmp 앵커 파일의 slug 격리: 두 slug가 같은 라운드 번호에서 서로의 rev를 덮지 않는다', () => {
  // slug 없는 경로(`round-<N>-fix-rev.txt`)로 되돌리면 나중 write가 앞의 rev를
  // 덮고, terminator가 **다른 루프의 패치 범위**로 대조해 오분류한다.
  const one = chasingRepo('m3-iso-one');
  // 같은 repo에 두 번째 slug — 다른 파일을 손댄 두 번째 커밋을 앵커로 갖는다.
  fs.writeFileSync(path.join(one.repo, 'src', 'other.js'), 'o1\no2\no3\n');
  execFileSync('git', ['add', '-A'], { cwd: one.repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-qm', 'other loop fix'], { cwd: one.repo, stdio: 'ignore' });
  const otherRev = execFileSync('git', ['rev-parse', 'HEAD'],
    { cwd: one.repo, encoding: 'utf8' }).trim();

  const tmpFor = function (slug, round) {
    return path.join(one.repo, '.claude', 'state', 'santa-loop', 'tmp', slug,
      'round-' + round + '-fix-rev.txt');
  };
  [['m3-iso-one', one.rev], ['m3-iso-two', otherRev]].forEach(function (pair) {
    const p = tmpFor(pair[0], 0);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, pair[1] + '\n', 'utf8');
  });

  // 두 앵커가 같은 라운드 번호를 쓰고도 서로 다른 값을 유지한다(교차 read 0건).
  assert.equal(fs.readFileSync(tmpFor('m3-iso-one', 0), 'utf8').trim(), one.rev);
  assert.equal(fs.readFileSync(tmpFor('m3-iso-two', 0), 'utf8').trim(), otherRev);
  assert.notEqual(one.rev, otherRev);

  // 자기 slug의 rev로 판정하면 발화하고(src/fix.js를 겨눈 지적), 다른 루프의
  // rev를 넣으면 그 범위에 없으므로 발화하지 않는다 — 덮어쓰기가 일어났다면
  // 첫 단언이 무너진다.
  const mine = cli(['check-termination', '--cwd', one.repo, '--decision', one.slug,
    '--prev-fix-rev', fs.readFileSync(tmpFor('m3-iso-one', 0), 'utf8').trim()]);
  assert.equal(JSON.parse(mine.stdout).terminate, true);

  const crossed = cli(['check-termination', '--cwd', one.repo, '--decision', one.slug,
    '--prev-fix-rev', fs.readFileSync(tmpFor('m3-iso-two', 0), 'utf8').trim()]);
  assert.equal(JSON.parse(crossed.stdout).terminate, false,
    '남의 패치 범위로 대조하면 preexisting이다 — 교차오염이 오분류를 만든다는 증거');
});

test('[87] 라운드 대응: Step 4.5가 round-$((ROUND-1))을 읽고 ROUND=0에서는 --prev-fix-rev를 넘기지 않는다', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'commands', 'santa-loop.md'), 'utf8');
  const start = md.indexOf('### Step 4.5');
  const sec = md.slice(start, md.indexOf('### Step 5:', start));

  // 라운드 N은 **직전 라운드가 쓴** 앵커를 읽는다. N을 잘못 고르면 파일이 없어
  // patchRanges가 빈 집합이 되고 전량 unknown으로 떨어져 terminator가 예외도
  // 로그도 없이 영원히 미발화한다 — 그 상태는 정상 미발화와 구별되지 않는다.
  assert.match(sec, /round-\$\(\(ROUND-1\)\)-fix-rev\.txt/,
    'Step 4.5가 N-1의 앵커를 읽지 않는다');
  assert.match(sec, /\$DECISION/, '앵커 경로에 slug 성분이 없으면 병렬 루프가 교차오염된다');

  // Step 5는 **자기** 라운드 번호로 쓴다(N ↔ N-1 대응의 다른 절반).
  const s5 = md.indexOf('### Step 5:');
  const step5 = md.slice(s5, md.indexOf('### Step 5.5:', s5));
  assert.match(step5, /round-\$ROUND-fix-rev\.txt/, 'Step 5가 자기 라운드로 앵커를 쓰지 않는다');
  assert.match(step5, /git rev-parse HEAD/);

  // ROUND=0에서는 플래그를 **아예 넘기지 않는다** — 빈 문자열을 넘기면 같은
  // 미발화로 가더라도 사유가 "불량 rev"로 잘못 기록되어, 항목 84가 가르려는
  // "정상 미발화 vs 입력 이상"의 구분이 무너진다.
  const calls = sec.split(/\r?\n/).filter(function (l) { return /check-termination/.test(l) && /node /.test(l); });
  assert.equal(calls.length, 2, 'check-termination 호출은 rev 있음/없음 두 분기다');
  assert.equal(calls.filter(function (l) { return /--prev-fix-rev/.test(l); }).length, 1);
  assert.equal(calls.filter(function (l) { return !/--prev-fix-rev/.test(l); }).length, 1);
  assert.equal(/--prev-fix-rev\s*""/.test(sec), false, '빈 문자열을 넘기지 않는다');
  assert.match(sec, /if \[ -n "\$PREV_REV" \]/, '분기 조건이 rev 존재 여부다');
});

// ── Implement-Codex R1 F1-b 흡수 (2026-08-18) ────────────────────────────────
//
// 항목 88은 plan의 커버리지 표(61~87) 밖이다. Codex가 implement 게이트에서 낸
// 단독 HIGH의 **수용한 절반**이고, plan 본문은 `mccp-plan-codex`가 `plan_hash`로
// 봉인한 대상이라 표를 늘리지 않는다(표를 고치면 그 receipt가 stale이 되어 이번
// cycle의 PR이 막힌다 — §3.11 guard 2). 커버리지 스크립트는 1..MAX의 **존재**만
// 보므로 MAX 밖의 추가 항목은 계약을 깨지 않는다.
//
// Codex의 지적: "`line` 없는 location은 파일 존재만으로 `round_n_patch`가 되므로,
// 직전 패치가 큰 파일의 한 줄만 건드려도 그 파일 어디의 선재 결함이든 patch-chasing이
// 되어 조기 종료가 봉인된다." **기전은 정확하고 그것은 DD11이 명시적으로 수용한
// trade-off다**(plan:405-418 · PRD Risks:143이 Medium/High로 사전 등재). 설계 반전
// (라인 교집합 강제)은 근거를 붙여 기각했다 — backlog 2026-08-18 행.
//
// 이 항목이 **실제로 증명하는 것**은 그 수용의 경계가 유지된다는 것뿐이다: 리뷰어가
// 라인을 준 경우, 같은 파일이어도 미변경 라인은 `preexisting`으로 떨어져 발화하지
// 않는다. 항목 64가 oracle 층에서 재던 그 경계를 **실 git + 실 CLI**로 올린다
// (Codex가 함께 권고한 "end-to-end negative test"가 이것이다).
//
// **증명하지 않는 것**: 파일 단위 일치의 실제 오분류율. 그 표본은 Task 8 (B)의
// `targetsBreakdown` 실측이 소유하고 M3은 어떤 수치도 주장하지 않는다.

// 큰 파일의 좁은 영역만 고치는 fixture — `--unified=0`이므로 hunk 범위는 정확히
// 바뀐 줄(2..3)이고 context는 범위에 들어오지 않는다.
function partialFixRepo(slug, loc) {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  const wide = [];
  for (let i = 1; i <= 60; i++) wide.push('line ' + i);
  fs.writeFileSync(path.join(repo, 'src', 'wide.js'), wide.join('\n') + '\n');
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-qm', 'seed: wide file'], { cwd: repo, stdio: 'ignore' });

  wide[1] = 'line 2 // round-0 fix';
  wide[2] = 'line 3 // round-0 fix';
  fs.writeFileSync(path.join(repo, 'src', 'wide.js'), wide.join('\n') + '\n');
  execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'ignore' });
  execFileSync('git', ['commit', '-qm', 'fix: narrow region only'], { cwd: repo, stdio: 'ignore' });
  const rev = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

  const claim = 'the surviving guard is still unreachable';
  writeLedger(repo, slug, ledgerFixture(slug, {
    rounds: [
      roundFixture(0, 'NAUGHTY', [
        reviewer('A', 'FAIL', [finding({ claim: 'original defect' })]),
        reviewer('B', 'FAIL', [finding({ claim: 'original defect' })]),
      ]),
      roundFixture(1, 'NAUGHTY', [
        reviewer('A', 'FAIL', [locFinding(claim, [loc])]),
        reviewer('B', 'FAIL', [locFinding(claim, [loc])]),
      ]),
    ],
  }));
  return { repo: repo, rev: rev, slug: slug };
}

test('[88] check-termination(CLI, 실 git): 손댄 파일이어도 미변경 라인을 겨눈 blocking은 preexisting이라 미발화한다', () => {
  // (a) 음성 대조군 — Codex가 요구한 negative test. 직전 패치는 src/wide.js의
  //     2..3만 건드렸고 blocking은 같은 파일 40행을 겨눈다. 파일은 일치하지만
  //     라인이 hunk 밖이므로 `preexisting`이고, 전량 조건이 깨져 미발화다.
  const neg = partialFixRepo('m3-partial-neg', { file: 'src/wide.js', line: 40 });
  const rn = cli(['check-termination', '--cwd', neg.repo, '--decision', neg.slug,
    '--prev-fix-rev', neg.rev]);
  assert.equal(rn.code, EX_OK);
  const jn = JSON.parse(rn.stdout);
  assert.equal(jn.terminate, false,
    '손댄 파일이라는 사실만으로 종료가 봉인되면 안 된다 — 라인이 주어졌으면 라인이 판정한다');
  assert.equal(jn.reason, 'not-all-round-n-patch');
  assert.deepEqual(jn.targetsBreakdown, { round_n_patch: 0, preexisting: 1, unknown: 0 });
  assert.equal(readState(neg.repo, neg.slug).terminated, null,
    '미발화는 마커를 쓰지 않는다 — 다음 라운드가 정상으로 열린다');

  // (b) 양성 대조군 — 같은 repo 형태, 같은 파일, blocking의 라인만 hunk 안(2행)으로
  //     옮긴다. 이것이 red면 (a)의 green은 "판정이 늘 false"라는 뜻이라 무의미하다.
  const pos = partialFixRepo('m3-partial-pos', { file: 'src/wide.js', line: 2 });
  const rp = cli(['check-termination', '--cwd', pos.repo, '--decision', pos.slug,
    '--prev-fix-rev', pos.rev]);
  assert.equal(rp.code, EX_OK);
  const jp = JSON.parse(rp.stdout);
  assert.equal(jp.terminate, true, '같은 파일의 변경된 라인을 겨누면 발화한다');
  assert.equal(jp.exitReason, 'patch_chasing');
  assert.deepEqual(jp.targetsBreakdown, { round_n_patch: 1, preexisting: 0, unknown: 0 });

  // (c) **수용된 trade-off를 기대값으로 못박는다.** 같은 repo에서 라인을 아예
  //     주지 않으면 파일 단위 일치로 발화한다 — Codex가 지적한 그 경로이고,
  //     DD11이 의도한 동작이다. 여기 적어 두는 이유는 이것이 사고가 아니라
  //     **선택**임을 회귀로 고정하기 위해서다. 누군가 이 동작을 바꾸면 그것은
  //     DD11의 재검토를 요구하는 변경이지 조용한 버그 수정이 아니다.
  const fileOnly = partialFixRepo('m3-partial-fileonly', { file: 'src/wide.js' });
  const rf = cli(['check-termination', '--cwd', fileOnly.repo, '--decision', fileOnly.slug,
    '--prev-fix-rev', fileOnly.rev]);
  assert.equal(rf.code, EX_OK);
  const jf = JSON.parse(rf.stdout);
  assert.equal(jf.terminate, true,
    'line 부재는 파일 단위 일치로 충분하다 (DD11) — 라인을 요구하면 terminator가 사실상 죽는다');
  assert.equal(jf.exitReason, 'patch_chasing');

  // (d) 그 trade-off의 **경계**: 파일 자체가 patch 밖이면 라인 유무와 무관하게
  //     preexisting이다. 파일 단위 일치가 "아무 파일이나"로 넓어지지 않았음을 잰다.
  const other = partialFixRepo('m3-partial-other', { file: 'src/untouched.js' });
  const ro = cli(['check-termination', '--cwd', other.repo, '--decision', other.slug,
    '--prev-fix-rev', other.rev]);
  assert.equal(ro.code, EX_OK);
  const jo = JSON.parse(ro.stdout);
  assert.equal(jo.terminate, false);
  assert.deepEqual(jo.targetsBreakdown, { round_n_patch: 0, preexisting: 1, unknown: 0 });
});
