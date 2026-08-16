'use strict';

// codex-intent-context M2 — 심판 분리 배선의 관통 test (DD8).
//
// 이 파일이 존재하는 이유는 정적 lint가 할 수 없는 것 때문이다. `plan-command-
// marker-states.test.js`의 정규식은 **키워드 존재**만 본다 — 주석 속 `arbiter_degraded`도
// 매칭되고, `parseAdjudicationFile`이 실제로 *유효성 판정에* 쓰였는지는 알 수 없다.
// 강등 축의 주장("파손 산출이면 강등한다", "늦은 유효 산출을 지우지 않는다")은
// **행위**로만 성립한다.
//
// 그래서 여기서는 명령 본문의 `node -e` 프로그램을 **plan.md에서 그대로 뽑아** 실행한다.
// 사본을 만들어 test하면 test는 사본이 옳다는 것만 증명하고, 출하되는 텍스트가 틀려도
// green이다.
//
// 관통 범위: 추출한 셸 프로그램 → 실제 `receipt/write.js` → 디스크의 receipt. 대역은
// **arbiter 자리에만** 둔다(그 subagent는 아직 발화한 적이 없다 — DD8 표의 마지막 행).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const runner = require('../plan-codex-runner');
const ic = require('../intent-context');
const codexPayload = require('../codex-review-payload');
const { validate } = require('../../receipt/schema');
const { receiptHash } = require('../../receipt/hash');

const PLAN_MD = path.join(__dirname, '..', '..', '..', 'commands', 'plan.md');
const PLUGIN_ROOT = path.join(__dirname, '..', '..', '..');

const PRD_PLAN = [
  '# Plan: arbiter e2e',
  '',
  '**Source PRD**: `.claude/prds/e2e.prd.md`',
  '',
  '## Summary',
  '',
  'body',
  '',
  '## User Intent',
  '',
  '| ID | Constraint (user-stated) | Kind |',
  '|---|---|---|',
  '| UI1 | the judge must not be the author | direction |',
  '',
  '## Tasks',
  '',
  '- do the thing',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// 명령 본문에서 프로그램을 뽑아 실행한다
// ---------------------------------------------------------------------------

const PLAN_BODY = fs.readFileSync(PLAN_MD, 'utf8');

// `node -e '<program>'` 의 본문을 고른다. Bash 작은따옴표 문자열은 `'`를 담을 수
// 없으므로 이 추출은 모호하지 않다 — 그리고 그 제약이 곧 명령 본문의 프로그램이
// 작은따옴표를 쓰면 안 된다는 규칙을 test로 고정한다.
function extractNodeProgram(anchor) {
  const re = /node -e '([^']*)'/g;
  let m;
  const hits = [];
  while ((m = re.exec(PLAN_BODY)) !== null) {
    if (m[1].indexOf(anchor) !== -1) hits.push(m[1]);
  }
  assert.strictEqual(hits.length, 1,
    'expected exactly one `node -e` program containing ' + JSON.stringify(anchor) +
    ', found ' + hits.length + ' — the command body moved and this suite is testing nothing');
  return hits[0];
}

// 두 프로그램 모두 `parseAdjudicationFile`을 쓰므로(그것이 probe의 정의다) 앵커는
// 각자에게만 있는 문자열이어야 한다.
const PROBE_PROGRAM = extractNodeProgram('staged output invalid');
const PUBLISH_PROGRAM = extractNodeProgram('linkSync');

function runProgram(src, args) {
  const r = spawnSync(process.execPath, ['-e', src].concat(args), { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// ---------------------------------------------------------------------------
// fixture
// ---------------------------------------------------------------------------

const NONCES = [
  '11111111-2222-4333-8444-5555555550a1',
  '11111111-2222-4333-8444-5555555550a2',
  '11111111-2222-4333-8444-5555555550a3',
  '11111111-2222-4333-8444-5555555550a4',
];

function scratchRepo() {
  const { mkTmpRepo, writeFileSync } = require('../../receipt/tests/helpers');
  const repo = mkTmpRepo();
  writeFileSync(repo, '.claude/plans/e2e.plan.md', PRD_PLAN);
  const tmpDir = path.join(repo, '.mccp-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  return { repo: repo, tmpDir: tmpDir, planRel: '.claude/plans/e2e.plan.md' };
}

function envelope() {
  return {
    ok: true,
    classification: 'ok',
    blocking: false,
    stdout: JSON.stringify({
      result: {
        verdict: 'needs-attention',
        summary: 'No ship',
        findings: [{
          severity: 'HIGH',
          title: 'a structural concern',
          body: 'the boundary is not held\nINTENT: none',
          recommendation: 'hold it',
        }],
      },
    }),
    stderr: '',
    durationMs: 1,
  };
}

// arbiter(또는 강등된 저자)가 낼 완전한 adjudication.
function adjudicationBody(planRel, degraded, mutate) {
  const payload = codexPayload.parseReviewPayload(envelope());
  const file = {
    plan_path: planRel,
    round: 1,
    review_payload_digest: ic.canonicalDigest(payload),
    adjudications: [{
      finding_index: 0,
      finding_digest: ic.canonicalDigest(payload.findings[0]),
      intent_conflict: 'none',
      verdict: 'ACCEPT_NOW',
      rationale: 'in scope for this milestone',
      intent_override_reason: null,
      intent_dispute_reason: null,
    }],
  };
  if (degraded) file.arbiter_degraded = degraded;
  if (mutate) mutate(file);
  return file;
}

// 대역은 arbiter 자리에만. 나머지(runner · write.js · schema)는 전부 실물이다.
function runRealGate(s, nonce, arbiterMode, timeoutMs) {
  return runner.run({
    plan: s.planRel,
    decision: 'e2e',
    cwd: s.repo,
    tmpDir: s.tmpDir,
    runNonce: nonce,
    arbiterMode: arbiterMode,
    adjudicationTimeoutMs: timeoutMs || 4000,
    env: { MCCP_INTENT_MISLABEL: 'enforce' },
  }, { invokeAdversarialReview: envelope });
}

function receiptPathFor(repo) {
  return path.join(repo, '.claude/receipts/mccp-plan-codex/e2e.json');
}

// ---------------------------------------------------------------------------
// 1. 성공 — arbiter가 유효한 산출을 내고 봉인이 `subagent`
// ---------------------------------------------------------------------------

test('scenario 1 — a valid arbiter output publishes, seals `subagent`, and is inside the hash', function () {
  const s = scratchRepo();
  const p = runner.paths(s.tmpDir, 'e2e', NONCES[0]);

  // 대역 arbiter: `Write`만 가진 에이전트가 할 수 있는 일 그대로 — `.tmp`에 쓴다.
  fs.writeFileSync(p.adjudication + '.tmp',
    JSON.stringify(adjudicationBody(s.planRel, null), null, 2));

  const probe = runProgram(PROBE_PROGRAM, [PLUGIN_ROOT, p.adjudication]);
  assert.strictEqual(probe.status, 0, 'a valid output must probe clean: ' + probe.stderr);
  assert.strictEqual(probe.stdout, '', 'the probe contract is exit-code only, stdout empty');
  assert.ok(fs.existsSync(p.adjudication),
    'the probe step also PUBLISHES: the arbiter cannot rename for itself');
  assert.ok(!fs.existsSync(p.adjudication + '.tmp'), 'the staged file is consumed');

  const res = runRealGate(s, NONCES[0], 'subagent');
  assert.strictEqual(res.exitCode, runner.EX_OK, res.reason);

  const receipt = JSON.parse(fs.readFileSync(receiptPathFor(s.repo), 'utf8'));
  assert.strictEqual(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
  assert.strictEqual(receipt.meta.intent_arbiter, 'subagent');
  assert.strictEqual(receipt.meta.intent_arbiter_degraded_reason, null);

  // carve-out 부재의 실증: 필드를 바꾸면 hash가 바뀐다. hash 밖에 있는 감사 필드는
  // 서명되지 않은 필드이고, validate-cmd의 receipt-tamper 검사가 그 편집을 지나친다.
  const tampered = JSON.parse(JSON.stringify(receipt));
  tampered.meta.intent_arbiter = 'author';
  assert.notStrictEqual(receiptHash(tampered), receipt.receipt_hash,
    'intent_arbiter must be sealed by receipt_hash — no carve-out');
});

// ---------------------------------------------------------------------------
// 2. 강등(파손 산출) — 존재 검사가 아니라 유효성 probe여야 발동한다
// ---------------------------------------------------------------------------

test('scenario 2 — broken arbiter JSON degrades, and does NOT wait out the timeout', function () {
  const s = scratchRepo();
  const p = runner.paths(s.tmpDir, 'e2e', NONCES[1]);

  // 대역 arbiter가 문법이 깨진 JSON을 쓴다. `[ -f ]` 검사는 이것을 통과시킨다.
  fs.writeFileSync(p.adjudication + '.tmp', '{"adjudications": [ {');

  assert.ok(fs.existsSync(p.adjudication + '.tmp'),
    'the file EXISTS — which is exactly why an existence check is not enough');
  const probe = runProgram(PROBE_PROGRAM, [PLUGIN_ROOT, p.adjudication]);
  assert.strictEqual(probe.status, 1, 'broken JSON must probe as invalid');
  assert.match(probe.stderr, /malformed-json/);
  assert.strictEqual(fs.existsSync(p.adjudication), false,
    'and it must NOT have been published — moving broken JSON onto the polled path ' +
    'hands the runner a malformed read instead of letting this step degrade');

  // 저자 경로가 완전한 adjudication + 강등 키를 staged 경로에 쓴다.
  fs.writeFileSync(p.adjudication + '.degraded.tmp', JSON.stringify(
    adjudicationBody(s.planRel,
      { from: 'subagent', to: 'author', reason: 'unknown-task-failure' }), null, 2));
  const publish = runProgram(PUBLISH_PROGRAM, [PLUGIN_ROOT, p.adjudication]);
  assert.strictEqual(publish.status, 0, 'the degraded file must publish: ' + publish.stderr);

  // The deadline is deliberately tiny. Wall-clock on the whole run measures the
  // real receipt write (seconds, on any machine) and would prove nothing about the
  // WAIT. A 500ms budget does: if the degradation had not published, the runner
  // would burn it and die `incomplete` with "timed out"; if the probe had shipped
  // the broken JSON onto the polled path, it would die `incomplete` on a malformed
  // read. Reaching EX_OK rules out both.
  const res = runRealGate(s, NONCES[1], 'subagent', 500);
  assert.strictEqual(res.exitCode, runner.EX_OK, res.reason);
  assert.doesNotMatch(String(res.reason || ''), /timed out/,
    'the stall this step removes is precisely a run that waits the deadline out');

  const receipt = JSON.parse(fs.readFileSync(receiptPathFor(s.repo), 'utf8'));
  assert.strictEqual(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
  assert.strictEqual(receipt.meta.intent_arbiter, 'author');
  assert.strictEqual(receipt.meta.intent_arbiter_degraded_reason, 'unknown-task-failure');
});

// ---------------------------------------------------------------------------
// 3. 경합 — 늦게 도착한 유효 산출을 덮지 않는다
// ---------------------------------------------------------------------------

test('scenario 3 — a late VALID arbiter output cancels the degradation instead of being erased', function () {
  const s = scratchRepo();
  const p = runner.paths(s.tmpDir, 'e2e', NONCES[2]);

  // 동시성으로 재현하지 않는다 — 재현 불가한 test가 된다. probe가 실패하도록 아무것도
  // 두지 않은 뒤, 강등 쓰기 **직전에** 유효한 파일을 그 경로에 미리 놓아 `EEXIST`를
  // 결정적으로 유발한다.
  const probe = runProgram(PROBE_PROGRAM, [PLUGIN_ROOT, p.adjudication]);
  assert.strictEqual(probe.status, 1, 'nothing was produced, so the probe must fail');

  const arbiterOutput = JSON.stringify(adjudicationBody(s.planRel, null), null, 2);
  fs.writeFileSync(p.adjudication, arbiterOutput);            // 늦게 도착한 유효 산출
  fs.writeFileSync(p.adjudication + '.degraded.tmp', JSON.stringify(
    adjudicationBody(s.planRel,
      { from: 'subagent', to: 'author', reason: 'unknown-task-failure' }), null, 2));

  const publish = runProgram(PUBLISH_PROGRAM, [PLUGIN_ROOT, p.adjudication]);
  assert.strictEqual(publish.status, 3, 'EEXIST + valid must CANCEL the degradation');
  assert.match(publish.stderr, /degradation CANCELLED/);
  assert.strictEqual(fs.readFileSync(p.adjudication, 'utf8'), arbiterOutput,
    'the separation that actually happened must survive byte-for-byte');
  assert.ok(!fs.existsSync(p.adjudication + '.degraded.tmp'), 'the staged file is cleaned up');

  const res = runRealGate(s, NONCES[2], 'subagent');
  assert.strictEqual(res.exitCode, runner.EX_OK, res.reason);
  const receipt = JSON.parse(fs.readFileSync(receiptPathFor(s.repo), 'utf8'));
  assert.strictEqual(receipt.meta.intent_arbiter, 'subagent',
    'recording `author` here would erase a separation that really occurred');
  assert.strictEqual(receipt.meta.intent_arbiter_degraded_reason, null);
});

test('scenario 3b — an INVALID late output is replaced, and says so in the reason', function () {
  const s = scratchRepo();
  const p = runner.paths(s.tmpDir, 'e2e', NONCES[3]);

  fs.writeFileSync(p.adjudication, '{"adjudications": [ {');   // 늦게 도착했지만 파손
  fs.writeFileSync(p.adjudication + '.degraded.tmp', JSON.stringify(
    adjudicationBody(s.planRel,
      { from: 'subagent', to: 'author', reason: 'unknown-task-failure' }), null, 2));

  const publish = runProgram(PUBLISH_PROGRAM, [PLUGIN_ROOT, p.adjudication]);
  assert.strictEqual(publish.status, 4, 'EEXIST + invalid must replace, not cancel');
  const published = JSON.parse(fs.readFileSync(p.adjudication, 'utf8'));
  assert.strictEqual(published.arbiter_degraded.reason, 'replaced-invalid-arbiter-output',
    'the cause changed, so the recorded reason must change with it');
});

test('scenario 3c — an unusable STAGED file is diagnosed as such, not as a publish failure', function () {
  // Same fail-closed outcome either way; what changes is what the operator reads.
  // Before the guard this path died on a raw SyntaxError/TypeError and the shell
  // above reported "could not publish", naming the publish step for a fault that is
  // entirely in the file the author just wrote.
  const cases = [
    ['{"adjudications": [ {', 'unparsable staged file'],
    [JSON.stringify(adjudicationBody('.claude/plans/e2e.plan.md', null), null, 2),
      'staged file with no arbiter_degraded key'],
  ];
  cases.forEach(function (c, i) {
    const s = scratchRepo();
    const p = runner.paths(s.tmpDir, 'e2e', NONCES[i % NONCES.length]);
    fs.writeFileSync(p.adjudication, '{"adjudications": [ {');   // EEXIST + invalid
    fs.writeFileSync(p.adjudication + '.degraded.tmp', c[0]);

    const publish = runProgram(PUBLISH_PROGRAM, [PLUGIN_ROOT, p.adjudication]);
    assert.strictEqual(publish.status, 5, c[1] + ' must exit 5, not crash');
    assert.match(publish.stderr, /arbiter_degraded/,
      'and it must name the key that is missing, not the step that is fine');
    assert.strictEqual(fs.readFileSync(p.adjudication, 'utf8'), '{"adjudications": [ {',
      'the target must be left untouched — nothing usable was ever produced');
  });
});

// ---------------------------------------------------------------------------
// 4. 강등은 M1 규칙의 면제가 아니다
// ---------------------------------------------------------------------------

test('scenario 4 — an incomplete degraded adjudication dies `incomplete` with NO receipt', function () {
  const s = scratchRepo();
  const nonce = '11111111-2222-4333-8444-5555555550b1';
  const p = runner.paths(s.tmpDir, 'e2e', nonce);

  // 저자가 `rationale`을 빠뜨린 채 강등 키만 얹었다. 강등이 자동 승인이 되는 설계라면
  // 여기서 통과한다.
  fs.writeFileSync(p.adjudication, JSON.stringify(
    adjudicationBody(s.planRel,
      { from: 'subagent', to: 'author', reason: 'unknown-task-failure' },
      function (file) { file.adjudications[0].rationale = ''; }), null, 2));

  const res = runRealGate(s, nonce, 'subagent');
  assert.strictEqual(res.exitCode, runner.EX_BLOCKED);
  assert.strictEqual(res.verdict, 'incomplete');
  assert.strictEqual(fs.existsSync(receiptPathFor(s.repo)), false,
    'a degraded run that fails the M1 rules must leave no receipt at all');
});

test('scenario 4b — `author` mode plus a degradation record is a contradiction, not a no-op', function () {
  const s = scratchRepo();
  const nonce = '11111111-2222-4333-8444-5555555550b2';
  const p = runner.paths(s.tmpDir, 'e2e', nonce);

  fs.writeFileSync(p.adjudication, JSON.stringify(
    adjudicationBody(s.planRel,
      { from: 'subagent', to: 'author', reason: 'unknown-task-failure' }), null, 2));

  const res = runRealGate(s, nonce, 'author');
  assert.strictEqual(res.exitCode, runner.EX_BLOCKED);
  assert.strictEqual(res.verdict, 'incomplete');
  assert.match(res.reason, /nothing to degrade from/);
  assert.strictEqual(fs.existsSync(receiptPathFor(s.repo)), false);
});

test('scenario 4c — `author` mode with no degradation seals `author` and no reason', function () {
  const s = scratchRepo();
  const nonce = '11111111-2222-4333-8444-5555555550b3';
  const p = runner.paths(s.tmpDir, 'e2e', nonce);
  fs.writeFileSync(p.adjudication,
    JSON.stringify(adjudicationBody(s.planRel, null), null, 2));

  const res = runRealGate(s, nonce, 'author');
  assert.strictEqual(res.exitCode, runner.EX_OK, res.reason);
  const receipt = JSON.parse(fs.readFileSync(receiptPathFor(s.repo), 'utf8'));
  assert.strictEqual(receipt.meta.intent_arbiter, 'author');
  assert.strictEqual(receipt.meta.intent_arbiter_degraded_reason, null,
    'asking for the author is not a fallback, so there is no fallback to explain');
});

// ---------------------------------------------------------------------------
// 5. runner는 이 축의 env를 읽지 않는다 (DD5 1번)
// ---------------------------------------------------------------------------

test('scenario 5 — the runner never reads MCCP_INTENT_ARBITER', function () {
  // 명령 본문이 모드를 정하고 인자로 넘긴다. runner에 env fallback이 생기면 두
  // 프로세스가 서로 다른 답을 낼 수 있고, 그때 봉인값은 어느 쪽 사실도 아니게 된다.
  // 그 회귀를 사람 리뷰가 아니라 스캔이 잡는다.
  const src = fs.readFileSync(require.resolve('../plan-codex-runner'), 'utf8');
  const hits = (src.match(/MCCP_INTENT_ARBITER/g) || []).length;
  assert.strictEqual(hits, 0,
    'plan-codex-runner.js must not know this env var exists');
});

test('scenario 5b — an env var set only in the runner process cannot flip the seal', function () {
  const s = scratchRepo();
  const nonce = '11111111-2222-4333-8444-5555555550c1';
  const p = runner.paths(s.tmpDir, 'e2e', nonce);
  fs.writeFileSync(p.adjudication,
    JSON.stringify(adjudicationBody(s.planRel, null), null, 2));

  const res = runner.run({
    plan: s.planRel, decision: 'e2e', cwd: s.repo, tmpDir: s.tmpDir,
    runNonce: nonce, arbiterMode: 'subagent', adjudicationTimeoutMs: 4000,
    env: { MCCP_INTENT_MISLABEL: 'enforce', MCCP_INTENT_ARBITER: 'author' },
  }, { invokeAdversarialReview: envelope });

  assert.strictEqual(res.exitCode, runner.EX_OK, res.reason);
  const receipt = JSON.parse(fs.readFileSync(receiptPathFor(s.repo), 'utf8'));
  assert.strictEqual(receipt.meta.intent_arbiter, 'subagent',
    'the argument is the fact; the env in this process is not consulted');
});
