'use strict';

// 두 chokepoint의 실제 거부 (env-contract-integrity M3 / Task 4 · Task 5).
//
// 이 파일이 다른 둘과 다른 점: 오라클이 아니라 **배선**을 본다. 이 저장소의 실측
// 교훈이 "오라클은 옳았는데 CLI가 그 분기에 도달하지 못해 production에서 dead
// code였다"(plan-review-cli-decide-dd3.test.js)이므로, 단언은 전부 실제 진입점을
// 지난다 — Codex 채널은 `invokeAdversarialReview`를 그대로 부르고, 패널 채널은
// `plan-review/cli.js`를 **자식 프로세스**로 띄운다.
//
// **"spawn 0회"는 마커로 증명한다.** classification만 보면 "거부됐다"와 "돌았는데
// 그렇게 분류됐다"를 구별할 수 없다. 가짜 companion이 실행될 때마다 파일에 한 줄씩
// 남기므로, 캡 도달 호출 뒤에도 줄 수가 그대로라는 것이 spawn이 없었다는 직접 증거다.
//
// 가짜 companion을 쓰는 이유는 실제 Codex를 부르지 않기 위해서이고, 그 대가로 이
// 파일은 companion의 **응답 내용**에 대해 아무것도 주장하지 않는다 — 주장하는 것은
// 오직 "몇 번 불렸는가"와 "그 결과가 원장에 어떻게 반영되는가"다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const codexInvoke = require('../../codex-invoke');
const seal = require('../seal');
const ledger = require('../ledger');

const GATE = 'mccp-plan-codex';
const SLUG = 'enforcement-fixture';
const PLUGIN_KEY = 'codex@openai-codex';
const PLAN_REVIEW_CLI = path.join(__dirname, '..', '..', 'plan-review', 'cli.js');

// ── fixture ──────────────────────────────────────────────────────────────────

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'round-enforce-')));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  return dir;
}

// 가짜 codex companion. `spawnSync(process.execPath, [companionPath, ...])`로
// 실행되므로 평범한 ESM 모듈이면 된다. mode와 마커 경로를 파일 안에 **구워 넣는다** —
// env로 전달하면 test 프로세스의 process.env를 건드려야 하고, 그 오염이 병렬 test에
// 새어나간다.
function makeCodexInstall(root, mode, markerPath) {
  const installPath = path.join(root, 'codex-install');
  fs.mkdirSync(path.join(installPath, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(installPath, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(installPath, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'codex', version: '1.0.0' }));

  const body = [
    'import fs from "node:fs";',
    'fs.appendFileSync(' + JSON.stringify(markerPath) + ', "spawn\\n");',
    'const mode = ' + JSON.stringify(mode) + ';',
    'if (mode === "hang") { setTimeout(function () {}, 60000); }',
    'else if (mode === "fail") { process.stderr.write("companion boom\\n"); process.exit(1); }',
    'else { process.stdout.write(JSON.stringify({ result: { verdict: "approve" } }) + "\\n"); }',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(installPath, 'scripts', 'codex-companion.mjs'), body);

  const registryPath = path.join(root, 'installed_plugins.json');
  const registry = { plugins: {} };
  registry.plugins[PLUGIN_KEY] = [{ installPath: installPath }];
  fs.writeFileSync(registryPath, JSON.stringify(registry));
  return registryPath;
}

function spawnCount(markerPath) {
  try {
    return fs.readFileSync(markerPath, 'utf8').split('\n').filter(Boolean).length;
  } catch (_e) {
    return 0;
  }
}

// 게이트 하나를 통째로 세운다: repo + 봉인 + 가짜 companion.
function stage(opts) {
  const o = opts || {};
  const repo = makeRepo();
  const gitDir = seal.resolveGitDir(repo) || path.join(repo, '.git');
  const marker = path.join(repo, 'spawns.log');
  const registryPath = makeCodexInstall(repo, o.mode || 'ok', marker);

  if (o.seal !== false) {
    seal.sealCap({
      gitDir: gitDir,
      env: Object.assign({ MCCP_GATE_ROUND_CAP: String(o.cap === undefined ? 1 : o.cap) },
        o.ledgerMode ? { MCCP_ROUND_LEDGER: o.ledgerMode } : {}),
      gateId: GATE,
      decisionId: SLUG,
    });
  }
  return { repo: repo, gitDir: gitDir, marker: marker, registryPath: registryPath };
}

// env는 항상 명시한다. 이 저장소의 tracked settings.json이 MCCP_GATE_ROUND_CAP=3 등을
// 싣고 있어 process.env를 그대로 쓰면 단언이 개발 환경에 따라 흔들린다.
function callCodex(st, extra) {
  return codexInvoke.invokeAdversarialReview('focus', Object.assign({
    env: {},
    gitDir: st.gitDir,
    cwd: st.repo,
    registryPath: st.registryPath,
    timeoutMs: 20000,
  }, extra || {}));
}

function count(st) {
  return ledger.count({ gateId: GATE, decisionId: SLUG, cwd: st.repo });
}

// ── Codex 채널 ───────────────────────────────────────────────────────────────

test('an answered review spends exactly one round', () => {
  const st = stage({ cap: 1 });
  assert.equal(count(st), 0);

  const r = callCodex(st);
  assert.equal(r.classification, 'ok', r.stderr);
  assert.equal(spawnCount(st.marker), 1);
  assert.equal(count(st), 1);
});

test('the second call at cap 1 returns round-cap-reached WITHOUT spawning', () => {
  // M3의 핵심 주장. 이전에는 이 자리에 아무것도 없어 네 번째, 열다섯 번째 호출까지
  // 그대로 통과했다.
  const st = stage({ cap: 1 });
  callCodex(st);
  assert.equal(spawnCount(st.marker), 1);

  const r = callCodex(st);
  assert.equal(r.classification, 'round-cap-reached');
  assert.equal(spawnCount(st.marker), 1, 'no second spawn — this is the direct evidence');
  assert.equal(count(st), 1, 'a refused call does not consume budget it never used');
});

test('round-cap-reached is a terminal outcome, not an outage (DD4)', () => {
  // blocking=true로 잡으면 예산 소진이라는 정상 종료가 환경 장애처럼 보고되고
  // 운영자는 "게이트가 고장났다"로 읽는다. durationMs=0이 "아무것도 안 돌았다"를 말한다.
  const st = stage({ cap: 1 });
  callCodex(st);
  const r = callCodex(st);

  assert.equal(r.ok, true);
  assert.equal(r.blocking, false);
  assert.equal(r.advisory, false);
  assert.equal(r.durationMs, 0);
  assert.equal(r.roundsSoFar, 1);
  assert.equal(r.cap, 1);
});

test('advisory mode does not turn a spent budget into a failure either', () => {
  // makeFail은 MCCP_ALLOW_CODEX_UNAVAILABLE을 읽어 blocking/advisory를 뒤집는다.
  // 캡 도달은 그 경로를 지나지 않아야 한다 — 예산 소진은 가용성 문제가 아니다.
  const st = stage({ cap: 1 });
  callCodex(st, { env: { MCCP_ALLOW_CODEX_UNAVAILABLE: '1' } });
  const r = callCodex(st, { env: { MCCP_ALLOW_CODEX_UNAVAILABLE: '1' } });
  assert.equal(r.classification, 'round-cap-reached');
  assert.equal(r.blocking, false);
  assert.equal(r.advisory, false);
});

test('a cap of 3 allows exactly three answered rounds, then refuses', () => {
  const st = stage({ cap: 3 });
  [1, 2, 3].forEach(function (n) {
    const r = callCodex(st);
    assert.equal(r.classification, 'ok');
    assert.equal(count(st), n);
  });
  assert.equal(callCodex(st).classification, 'round-cap-reached');
  assert.equal(spawnCount(st.marker), 3);
});

// ── DD3 — 물었을 때가 아니라 답했을 때 계상한다 ─────────────────────────────

test('a companion that exits non-zero does NOT spend a round', () => {
  // 그렇지 않으면 캡 1 + 일시적 Codex 장애의 조합이 그 decision의 게이트를 영구
  // 차단한다. transport 실패는 triage할 findings를 생산하지 않았다.
  const st = stage({ cap: 1, mode: 'fail' });
  const r = callCodex(st);
  assert.equal(r.classification, 'exit-nonzero');
  assert.equal(spawnCount(st.marker), 1, 'it really did run');
  assert.equal(count(st), 0, 'but nobody answered, so nothing was spent');
});

test('a timed-out companion does NOT spend a round', () => {
  const st = stage({ cap: 1, mode: 'hang' });
  const r = callCodex(st, { timeoutMs: 700 });
  assert.equal(r.classification, 'timeout');
  assert.equal(count(st), 0);
});

test('a transport failure leaves the budget intact for a real retry', () => {
  // 위 두 단언의 결과가 실제로 재시도를 열어 주는지 — 그것이 DD3의 목적이다.
  const st = stage({ cap: 1, mode: 'fail' });
  callCodex(st);

  // 같은 게이트를 정상 companion으로 다시 세운다(봉인과 원장은 그대로).
  const ok = makeCodexInstall(path.join(st.repo, 'retry'), 'ok', st.marker);
  fs.mkdirSync(path.join(st.repo, 'retry'), { recursive: true });
  const r = callCodex(st, { registryPath: ok });
  assert.equal(r.classification, 'ok');
  assert.equal(count(st), 1);
});

// ── 모드와 열화 ──────────────────────────────────────────────────────────────

test('observe records every round but refuses none', () => {
  // kill switch가 실재함을 실증한다. `off`가 없는 이유가 여기 있다 — observe는 이미
  // 비차단이면서 전량을 기록한다.
  const st = stage({ cap: 1, ledgerMode: 'observe' });
  assert.equal(callCodex(st).classification, 'ok');
  assert.equal(callCodex(st).classification, 'ok');
  assert.equal(spawnCount(st.marker), 2, 'both calls really spawned');
  assert.equal(count(st), 2, 'and both were counted');
});

test('without a seal the cap cannot be enforced, and nothing is counted', () => {
  // M3 이전 저장소의 정상 상태다. 이것을 막으면 모든 사용자의 모든 리뷰가 멈춘다.
  const st = stage({ seal: false });
  assert.equal(callCodex(st).classification, 'ok');
  assert.equal(callCodex(st).classification, 'ok');
  assert.equal(spawnCount(st.marker), 2);
  assert.equal(count(st), 0, 'no ledger key means nothing to count');
});

test('an expired seal degrades the same way rather than refusing', () => {
  const st = stage({ cap: 1 });
  const p = seal.sealPathFor(st.gitDir);
  const body = JSON.parse(fs.readFileSync(p, 'utf8'));
  body.sealed_at = new Date(Date.now() - seal.MAX_SEAL_AGE_MS - 60000).toISOString();
  fs.writeFileSync(p, JSON.stringify(body));

  assert.equal(callCodex(st).classification, 'ok');
  assert.equal(callCodex(st).classification, 'ok');
  assert.equal(count(st), 0);
});

test('a disabled Codex short-circuits BEFORE the budget, spending nothing', () => {
  // 순서가 계약이다. Codex가 꺼져 있으면 어떤 라운드에도 리뷰어가 없으므로 예산을
  // 소모한다는 개념 자체가 성립하지 않는다.
  const st = stage({ cap: 1 });
  const r = callCodex(st, { env: { MCCP_CODEX_DISABLED: '1' } });
  assert.equal(r.classification, 'disabled');
  assert.equal(spawnCount(st.marker), 0);
  assert.equal(count(st), 0);

  assert.equal(callCodex(st).classification, 'ok', 'the budget was never touched');
});

test('the budget check precedes registry resolution', () => {
  // 캡 도달 호출이 registry를 먼저 만졌다면 classification이 registry-missing이 된다.
  // 두 값이 갈리는 것이 곧 "판정이 spawn 경로보다 앞에 있다"는 증거다.
  const st = stage({ cap: 1 });
  callCodex(st);
  const bogus = path.join(st.repo, 'no-such-registry.json');

  const capped = callCodex(st, { registryPath: bogus });
  assert.equal(capped.classification, 'round-cap-reached');

  const fresh = stage({ cap: 1 });
  const uncapped = callCodex(fresh, { registryPath: bogus });
  assert.equal(uncapped.classification, 'registry-missing',
    'without the cap, the same call reaches registry resolution');
});

test('resolveRoundBudget reports the pin so the refusal can name its cause', () => {
  const st = stage({ cap: 3 });
  // 봉인을 single-pass가 pin한 상태로 다시 쓴다.
  seal.sealCap({
    gitDir: st.gitDir,
    env: { MCCP_GATE_ROUND_CAP: '3', MCCP_REVIEW_SINGLE_PASS: 'scope_too_small' },
    gateId: GATE, decisionId: SLUG,
  });
  const b = codexInvoke.resolveRoundBudget({}, { gitDir: st.gitDir, cwd: st.repo });
  assert.equal(b.cap, 1);
  assert.match(String(b.pinnedBy), /single-pass/);
  assert.equal(b.canRecord, true);
});

// ── 패널 채널 (Task 5) ───────────────────────────────────────────────────────

function stagePanel(capReached, sealEnv) {
  const repo = makeRepo();
  const gitDir = seal.resolveGitDir(repo) || path.join(repo, '.git');
  fs.mkdirSync(path.join(repo, '.claude', 'plans'), { recursive: true });
  const planPath = path.join('.claude', 'plans', 'fixture.plan.md');
  fs.writeFileSync(path.join(repo, planPath),
    '# Plan: fixture\n\n## Summary\n\nround cap enforcement fixture.\n');

  seal.sealCap({
    gitDir: gitDir,
    // A pinned fixture seals through the SAME oracle production uses — the pin has
    // to come from effectiveRoundCap, not from a hand-written cap, or the test
    // proves nothing about the axis it names.
    env: sealEnv || { MCCP_GATE_ROUND_CAP: '1' },
    gateId: GATE, decisionId: SLUG,
  });
  if (capReached) {
    ledger.recordRound({ gateId: GATE, decisionId: SLUG, channel: 'panel', cwd: repo });
  }
  return { repo: repo, planPath: planPath, out: path.join(repo, 'workflow-args.json') };
}

function runEmit(st) {
  return spawnSync(process.execPath, [
    PLAN_REVIEW_CLI, 'emit-workflow-args',
    '--plan', st.planPath,
    '--repo-root', st.repo,
    '--out', st.out,
  ], {
    cwd: st.repo,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      MCCP_PLAN_REVIEW_QUORUM: '3of4',
      MCCP_PLAN_REVIEW_ROLES_MIN: '1',
      MCCP_GATE_ROUND_CAP: '1',
      MCCP_ROUND_LEDGER: 'enforce',
    }),
  });
}

test('the panel emits args and spends a round when budget remains', () => {
  const st = stagePanel(false);
  const r = runEmit(st);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(st.out), true);
  assert.equal(ledger.count({ gateId: GATE, decisionId: SLUG, cwd: st.repo }), 1);
});

test('at cap the panel exits 12 and writes NO workflow args', () => {
  // 종료코드만 검사하면 args가 만들어진 채로 exit 12인 구현도 통과한다. 파일이
  // 남으면 뒤의 단계가 그것을 주워 패널이 결국 발화한다 — 거부가 거부가 아니게 된다.
  const st = stagePanel(true);
  const r = runEmit(st);
  assert.equal(r.status, 12, r.stdout + r.stderr);
  assert.equal(fs.existsSync(st.out), false, 'a refused round must leave nothing behind');
  assert.match(r.stderr, /round cap reached/);
  assert.equal(ledger.count({ gateId: GATE, decisionId: SLUG, cwd: st.repo }), 1,
    'and must not charge itself for the panel it did not launch');
});

// ── 리뷰가 아닌 호출은 예산을 쓰지 않는다 ───────────────────────────────────
//
// `invokeAdversarialReview`는 두 곳에서 **리뷰가 아닌 용도**로 재사용된다. 그 사실을
// 모른 채 chokepoint를 그 안에 두면 M3은 자기 산출물을 오염시킨다 — 실측으로,
// briefing 한 번이 캡 1인 decision의 예산을 전부 먹고 `resolution.rounds`가 리뷰가
// 0건인 수를 봉인했다.

test('a call marked notAReviewRound neither spends nor is refused', () => {
  const st = stage({ cap: 1 });
  assert.equal(callCodex(st, { notAReviewRound: true }).classification, 'ok');
  assert.equal(callCodex(st, { notAReviewRound: true }).classification, 'ok');
  assert.equal(spawnCount(st.marker), 2, 'both really ran');
  assert.equal(count(st), 0, 'and neither was charged');

  // 그리고 진짜 리뷰의 예산은 그대로 남아 있다.
  assert.equal(callCodex(st).classification, 'ok');
  assert.equal(count(st), 1);
});

test('the exemption is opt-OUT: an undeclared call is still counted', () => {
  // 반대 방향(opt-in)이면 선언을 잊은 리뷰가 세어지지 않고, 세어지지 않는 라운드는
  // 곧 구속하지 않는 캡이다.
  const st = stage({ cap: 1 });
  callCodex(st, { notAReviewRound: false });
  assert.equal(count(st), 1);
  const st2 = stage({ cap: 1 });
  callCodex(st2, {});
  assert.equal(count(st2), 1);
});

test('the exemption has NO CLI surface', () => {
  // parseCliArgs는 임의 `--*` passthrough가 없는 닫힌 allowlist다. 그렇지 않았다면
  // 아무 셸 호출자나 자기에게 면제를 발급해 캡을 우회할 수 있다 (§3.13의 같은 논증).
  const attempts = [
    ['adversarial-review', '--focus', 'x', '--not-a-review-round'],
    ['adversarial-review', '--focus', 'x', '--notAReviewRound', 'true'],
    ['adversarial-review', '--focus', 'x', '--not-a-review-round', '1'],
  ];
  attempts.forEach(function (argv) {
    const parsed = codexInvoke.parseCliArgs(argv);
    assert.equal(parsed.opts.notAReviewRound, undefined,
      'no CLI form may produce the exemption: ' + argv.join(' '));
  });
});

test('the briefing declares itself not a review round', () => {
  // 기능 단언이다 — 소스 문자열 검사가 아니라 실제로 wrapper에 무엇이 전달되는지 본다.
  const briefing = require('../../briefing/invoke');
  let seen = null;
  briefing.invokeBriefing({ gate_id: 'mccp-plan-codex', decision_id: 'x', meta: {} }, {}, {
    env: {},
    invoker: function (_focus, opts) {
      seen = opts;
      return { ok: true, stdout: '{}', stderr: '', classification: 'ok',
        blocking: false, advisory: false, durationMs: 1 };
    },
  });
  assert.ok(seen, 'the invoker must have been called');
  assert.equal(seen.notAReviewRound, true,
    'a receipt summary must not spend the decision\'s review budget');
});

test('the hybrid L3 layer declares itself not a review round', () => {
  // L3는 emit-workflow-args가 이미 과금한 pass의 3번째 **층**이다. 다시 과금하면
  // hybrid 한 번이 2라운드가 되어 기본 캡 1에서 매번 산술로 멎는다.
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
  // `--review-dir` must be inside the repository — L3 writes its artifacts there
  // and the CLI refuses an escape. `.claude/cache/` is the gitignored scratch the
  // existing L3 suite uses for the same reason.
  const dir = path.join(repoRoot, '.claude', 'cache',
    'round-cap-l3-' + process.pid + '-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(dir, { recursive: true });
  // 이 fixture만 tmpdir이 아니라 저장소 안에 산다(`--review-dir`가 격리를 요구한다).
  // 그래서 정리도 이 파일의 책임이다 — plan-review-l3.test.js의 `rmFixtureDir`와 같은
  // 규약이고, 없으면 test를 돌릴 때마다 `.claude/cache/`에 디렉토리가 쌓인다.
  const cleanup = function () {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  };
  const optsFile = path.join(dir, 'seen-opts.json');
  const double = path.join(dir, 'invoke-double.js');
  fs.writeFileSync(double,
    'module.exports = { invokeAdversarialReview: function (focus, opts) {\n' +
    '  require("fs").writeFileSync(' + JSON.stringify(optsFile) +
    ', JSON.stringify(opts || {}));\n' +
    '  return { ok: true, stdout: JSON.stringify({ result: { verdict: "approve" } }),\n' +
    '    stderr: "", classification: "ok", blocking: false, advisory: false };\n' +
    '} };\n');

  const r = spawnSync(process.execPath, [
    PLAN_REVIEW_CLI, 'l3',
    '--review-dir', dir,
    '--plan', path.join('plugins', 'mccp', 'commands', 'plan.md'),
    '--focus', 'round-cap exemption fixture',
    '--run-nonce', 'nonce-round-cap-1',
    '--invoke-module', double,
  ], {
    cwd: repoRoot, encoding: 'utf8',
    env: Object.assign({}, process.env, { MCCP_PLAN_REVIEW_TEST_INVOKE: '1' }),
  });

  try {
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const seen = JSON.parse(fs.readFileSync(optsFile, 'utf8'));
    assert.equal(seen.notAReviewRound, true);
  } finally {
    cleanup();
  }
});

test('a seal call that cannot name its key CLEARS the previous seal', () => {
  // 조기반환이 기존 봉인을 남기면, 이 게이트의 chokepoint가 **앞 게이트의 키**로
  // 판정하고 계상한다. 도달 경로는 산문이 아니다 — 세 본문이 `--decision "$ROUND_SLUG"`를
  // 넘기고 `derive-decision`이 실패하면 그 변수는 빈 문자열이다.
  const st = stage({ cap: 1 });
  assert.equal(seal.readCap({ gitDir: st.gitDir }).reason, 'ok', 'fixture must start sealed');

  const CLI = path.join(__dirname, '..', 'cli.js');
  const r = spawnSync(process.execPath, [CLI, 'seal', '--gate', GATE, '--decision', ''], {
    cwd: st.repo, encoding: 'utf8', env: Object.assign({}, process.env),
  });

  assert.equal(r.status, 0, 'a failed seal must never stop the gate');
  assert.match(r.stderr, /SEAL FAILED/);
  assert.equal(seal.readCap({ gitDir: st.gitDir }).reason, 'absent',
    'the stale seal must be gone — absent means fail-open, not someone else\'s key');

  // 그리고 그 상태에서 호출은 통과하되 세어지지 않는다(등록되지 않은 실행).
  assert.equal(callCodex(st).classification, 'ok');
  assert.equal(count(st), 0);
});

test('a PINNED refusal does not prescribe raising a cap the pin makes unreadable', () => {
  // PR-Codex R1 F2. The refusal printed `pinned by …` and then, two clauses later,
  // named MCCP_GATE_ROUND_CAP as "the only in-band recovery" — but
  // `effectiveRoundCap` returns MIN_ROUND_CAP without reading that variable once
  // any axis pins, so the operator was told to do something that cannot work, in
  // the same sentence that told them why it cannot. An operator who tries the
  // prescribed action and watches it fail reaches for the ledger next, which is
  // exactly the outcome the sibling test above exists to prevent.
  const st = stagePanel(true, { MCCP_REVIEW_SINGLE_PASS: 'scope_too_small' });
  const r = runEmit(st);

  assert.equal(r.status, 12, 'a spent budget still blocks');
  assert.match(r.stderr, /pinned by single-pass/, 'the pin is still named');
  assert.match(r.stderr, /never reads MCCP_GATE_ROUND_CAP|no effect here/,
    'the refusal must say the cap knob is inert while pinned');
  assert.match(r.stderr, /MCCP_REVIEW_SINGLE_PASS/,
    'and name the axis-specific action that DOES work');
  assert.match(r.stderr, /3\.16/, 'triage remains the fallback');
  assert.doesNotMatch(r.stderr, /delete|rm -|unlink/i,
    'the refusal must never point at the ledger as an escape');
});

test('the codex-disabled pin is reported as having no cap-raising path at all', () => {
  // The two axes are not interchangeable. `single-pass` is a per-work-unit opt-in
  // the operator drops on the retry; `codex-disabled` is a standing policy
  // (CLAUDE.md 3.3 — the gate must never clear it), so there is no cap action to
  // offer and 3.16 triage is the whole answer. Collapsing the two into one
  // sentence would hand a standing-policy operator a per-call remedy they do not
  // have.
  const st = stagePanel(true, { MCCP_CODEX_DISABLED: '1' });
  const r = runEmit(st);

  assert.equal(r.status, 12);
  assert.match(r.stderr, /pinned by codex-disabled/);
  assert.match(r.stderr, /no cap-raising path at all/,
    'a standing policy leaves no per-call cap remedy — say so instead of implying one');
  assert.doesNotMatch(r.stderr, /MCCP_REVIEW_SINGLE_PASS/,
    'the single-pass remedy must not be offered for an axis that is not active');
});

test('the panel refusal names a recovery path that this channel actually has', () => {
  // 캡에 걸린 운영자의 첫 반응이 원장 삭제가 되면 캡은 장식이 된다. 그래서
  // 메시지가 경로를 직접 말해야 한다 — 그런데 **실재하는 것만** 말해야 한다.
  // Codex 채널의 두 경로 중 'accept the divergence and proceed'는 여기서
  // 성립하지 않는다: emit의 EX_BLOCK이 5.2c를 HALT시키고, l2.json이 없으면
  // `decide`가 unavailable로 막는다. 없는 출구를 안내하면 운영자는 그것을 시도한
  // 뒤 원장으로 손이 간다 — 이 test가 막으려던 바로 그 결과다.
  const st = stagePanel(true);
  const r = runEmit(st);
  assert.match(r.stderr, /MCCP_GATE_ROUND_CAP/, 'the in-band recovery must be named');
  assert.match(r.stderr, /3.16/, 'and what to do once the cap is already at its max');
  assert.doesNotMatch(r.stderr, /accept the divergence/,
    'this channel cannot proceed on a spent budget, so it must not offer that');
  assert.doesNotMatch(r.stderr, /delete|rm -|unlink/i,
    'the refusal must never point at the ledger as an escape');
});
