'use strict';

// santa-loop-materialize M2 — 봉인(seal)을 **CLI 레벨**에서 검증한다.
//
// 순수 oracle만 test하면 배선 결함을 놓친다는 것이 이 repo의 실측 교훈이라
// (santa-loop-cap.test.js 머리말 참조) 단언 대부분이 `runCli` 또는 실제 자식
// 프로세스를 지난다. fixture repo는 tmpdir에 `git init`한 진짜 repo이고,
// `--state-dir` 같은 경로 주입 플래그가 없으므로 test도 정상 경로와 똑같이
// repo-root 앵커링 + `assertContained`를 지난다.
//
// test 이름의 `[N]`은 plan의 커버리지 계약 id다(Validation 2d가 수집해 1~16과
// 대조한다). [17]은 plan 16항목 밖 — Implement-Codex R1 F1 흡수로 추가됐고
// `.claude/notes/santa-loop-materialize-m2.md`가 그 계약을 소유한다.
//
// 소유: 이 파일은 Task 3이 만들고 항목 8~17을 쓴다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const seal = require('../santa/seal');
const ledger = require('../santa/ledger');
const counter = require('../santa/counter');
const { isReviewProofStructurallyValid } = require('../review-verdict');
const { validate } = require('../../receipt/schema');

const CLI_PATH = path.join(__dirname, '..', 'santa', 'cli.js');
const CANARY = 'SANTA_RAW_CANARY_7f3a91';

// ── fixture ──────────────────────────────────────────────────────────────────

function makeRepo() {
  // realpath: Windows 8.3 단축 경로가 assertContained의 realpath 비교와
  // 어긋나지 않게 미리 정규화한다.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'santa-seal-')));
  const g = function (args) { execFileSync('git', args, { cwd: dir, stdio: 'ignore' }); };
  g(['init', '-q']);
  g(['checkout', '-q', '-b', 'santa-fixture']);
  g(['config', 'user.email', 'santa@test.local']);
  g(['config', 'user.name', 'santa']);
  // write.js가 base_sha/head_sha를 위해 HEAD를 요구한다.
  fs.writeFileSync(path.join(dir, 'README.md'), 'fixture\n');
  g(['add', '-A']);
  g(['commit', '-qm', 'init']);
  return dir;
}

function reviewer(id, model, verdict, criticalIssues) {
  return {
    envelope: {
      id: id, model: model, verdict: verdict,
      criticalIssues: criticalIssues || [],
    },
    // raw는 원장에만 있고 리포트에 실리면 안 된다(UI4). canary가 그 감시자다.
    raw: { verdict: verdict, checks: [CANARY], suggestions: [CANARY] },
  };
}

function round(index, verdict, reviewers) {
  return {
    index: index,
    started_at: '2026-08-14T0' + index + ':00:00.000Z',
    verdict: verdict,
    reviewers: reviewers,
  };
}

function statePath(repo, slug) {
  return path.join(repo, '.claude', 'state', 'santa-loop', slug + '.json');
}

function seedLedger(repo, slug, opts) {
  const o = opts || {};
  const state = {
    schema_version: ledger.SCHEMA_VERSION,
    decision_id: slug,
    cap: o.cap === undefined ? 3 : o.cap,
    rounds: o.rounds || [],
    entries: o.entries || [],
  };
  const p = statePath(repo, slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n');
  return p;
}

// 정상 NICE 라운드 1건 (A·B 전원 PASS)
function seedNice(repo, slug, cap) {
  return seedLedger(repo, slug, {
    cap: cap === undefined ? 3 : cap,
    rounds: [round(0, 'NICE', [reviewer('A', 'm-a', 'PASS'), reviewer('B', 'm-b', 'PASS')])],
  });
}

function readReceipt(repo, slug) {
  return JSON.parse(fs.readFileSync(
    path.join(repo, '.claude', 'receipts', 'mccp-santa-review', slug + '.json'), 'utf8'));
}

function readReport(repo, result) {
  return fs.readFileSync(path.join(repo, result.reportPath), 'utf8');
}

// CLI를 자식 프로세스로 — exit code와 stderr를 동시에 본다.
function runSealCli(repo, slug) {
  const args = [CLI_PATH, 'seal', '--cwd', repo];
  if (slug !== null && slug !== undefined) args.push('--decision', slug);
  try {
    const stdout = execFileSync(process.execPath, args, { cwd: repo, encoding: 'utf8' });
    return { code: 0, stdout: stdout, stderr: '' };
  } catch (err) {
    return {
      code: err.status === undefined ? -1 : err.status,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : '',
    };
  }
}

// ── [8] proof 구조 ───────────────────────────────────────────────────────────

test('[8] buildProof output passes isReviewProofStructurallyValid on the converged path',
  function () {
    const repo = makeRepo();
    seedNice(repo, 'proof-ok');
    const r = seal.seal({ cwd: repo, decisionId: 'proof-ok' });
    assert.equal(r.verdict, 'converged');

    const receipt = readReceipt(repo, 'proof-ok');
    const proof = receipt.resolution.review_proof;
    assert.equal(isReviewProofStructurallyValid(proof), true,
      'proof must satisfy the oracle that gates converged review verdicts');
    assert.equal(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
    // DD13 — proof가 가리키는 버전은 receipt가 봉인한 subject와 같아야 한다.
    assert.equal(proof.reviewed_plan_hash, receipt.plan_hash);
  });

// ── [9] negative — A-twice ───────────────────────────────────────────────────

test('[9] a round where the same id recorded twice yields roles=1, passed=false, not converged',
  function () {
    const repo = makeRepo();
    seedLedger(repo, 'a-twice', {
      cap: 3,
      // M1은 판정 lifecycle 검사(id 중복 거부)를 P1으로 이연했으므로 이 라운드는
      // **실재할 수 있다**. receipt가 있지도 않은 모델 다양성을 주장하면 안 된다.
      rounds: [round(0, 'NICE', [reviewer('A', 'm-a', 'PASS'), reviewer('A', 'm-a', 'PASS')])],
    });
    const r = seal.seal({ cwd: repo, decisionId: 'a-twice' });

    assert.notEqual(r.verdict, 'converged',
      'distinct id < 2 must not seal as converged');
    const proof = readReceipt(repo, 'a-twice').resolution.review_proof;
    assert.equal(proof.quorum.responded, 1);
    assert.equal(proof.quorum.roles, 1);
    assert.equal(proof.quorum.passed, false);
    assert.equal(proof.perspectives.length, 1);
    // DD3 divergent l1 분기의 **상단 행**: begin-round가 이 라운드를 열어줬으므로
    // 기계 게이트는 통과했고, 갈린 것은 다양성이다.
    assert.equal(proof.layers.l1, 'converged');
  });

// ── [10] UI4 — raw 누출 ──────────────────────────────────────────────────────

test('[10] the rendered report never contains reviewer raw content (canary absent)',
  function () {
    const repo = makeRepo();
    seedNice(repo, 'canary-x');
    const r = seal.seal({ cwd: repo, decisionId: 'canary-x' });

    const report = readReport(repo, r);
    assert.equal(report.indexOf(CANARY), -1,
      'reviewer raw (checks/suggestions) must never reach the git-tracked report');
    // 원장에는 그대로 남아 있어야 한다 — 소거는 투영 경계에서 일어나는 것이지
    // 데이터를 파기하는 것이 아니다(P1이 그 checks를 입력으로 쓴다).
    assert.notEqual(fs.readFileSync(statePath(repo, 'canary-x'), 'utf8').indexOf(CANARY), -1);
    // receipt도 마찬가지.
    assert.equal(JSON.stringify(readReceipt(repo, 'canary-x')).indexOf(CANARY), -1);
  });

// ── [11] DD5 읽기 전용 · 멱등 ────────────────────────────────────────────────

test('[11] seal is read-only and idempotent: bytes unchanged, report stable, 0 mutation calls',
  function () {
    const repo = makeRepo();
    const sp = seedNice(repo, 'ro-x');
    const before = fs.readFileSync(sp);

    // (c) mutation 진입점 스파이. `mutate`는 module-private이라 직접 감시할 수
    // 없다(ledger의 module.exports에 없다) — 대신 **export된 mutation 4종**을
    // 감싼다. 모든 mutation 경로가 그 넷을 지나므로 커버리지는 동일하고,
    // DD5가 금지하는 것("mutation 경로 진입 자체")에 직접 대응한다.
    const MUTATORS = ['beginRound', 'recordReviewer', 'recordVerdict', 'appendEntry'];
    const original = {};
    let mutationCalls = 0;
    MUTATORS.forEach(function (name) {
      original[name] = ledger[name];
      ledger[name] = function () {
        mutationCalls++;
        return original[name].apply(ledger, arguments);
      };
    });

    let first, second;
    try {
      first = seal.seal({ cwd: repo, decisionId: 'ro-x' });
      second = seal.seal({ cwd: repo, decisionId: 'ro-x' });
    } finally {
      MUTATORS.forEach(function (name) { ledger[name] = original[name]; });
    }

    assert.equal(mutationCalls, 0, 'seal must not enter any ledger mutation entry point');
    // (a) 디스크 바이트 동일.
    assert.equal(fs.readFileSync(sp).equals(before), true, 'ledger bytes must be untouched');
    // (b) 재실행 멱등 — 리포트 내용이 같다.
    assert.equal(readReport(repo, first), readReport(repo, second));
    assert.equal(first.verdict, second.verdict);
  });

// ── [12] divergent — NAUGHTY ─────────────────────────────────────────────────

test('[12] a NAUGHTY final round seals divergent with l1=converged and repo-relative evidence',
  function () {
    const repo = makeRepo();
    seedLedger(repo, 'naughty-x', {
      cap: 3,
      rounds: [round(0, 'NAUGHTY', [reviewer('A', 'm-a', 'PASS'), reviewer('B', 'm-b', 'FAIL')])],
    });
    const r = seal.seal({ cwd: repo, decisionId: 'naughty-x' });
    assert.equal(r.verdict, 'divergent');

    const receipt = readReceipt(repo, 'naughty-x');
    assert.equal(receipt.resolution.review_verdict, 'divergent');
    const proof = receipt.resolution.review_proof;
    // 라운드는 열렸고 리뷰어가 발화했다 — 기계 게이트는 통과했다(DD3 상단 행).
    assert.equal(proof.layers.l1, 'converged');
    assert.equal(proof.layers.l2, 'divergent');
    assert.equal(proof.verification_verdict, 'divergent');
    assert.equal(proof.quorum.passed, false);
    // schema는 verdict와 무관하게 evidence 경로 형식을 검사한다.
    assert.equal(proof.dispatch_evidence.length, 1);
    assert.match(proof.dispatch_evidence[0], /^\.claude\/reviews\/santa-review-naughty-x\.md$/);
    assert.equal(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
  });

// ── [13] generic slug 거부 — 서로 다른 메시지 ────────────────────────────────

test('[13] "default" and "main" are both rejected exit 2 but for DIFFERENT stated reasons',
  function () {
    const repo = makeRepo();
    seedNice(repo, 'default');
    seedNice(repo, 'main');

    const d = runSealCli(repo, 'default');
    const m = runSealCli(repo, 'main');

    assert.equal(d.code, 2, 'default must exit 2 (usage), not a new code');
    assert.equal(m.code, 2, 'main must exit 2 (usage), not a new code');
    assert.notEqual(d.stderr, m.stderr,
      'the two rejections must not share one message — a wrong reason misdiagnoses the operator');
    // default = 스코프 미상 (진짜 fallback)
    assert.match(d.stderr, /UNKNOWN|fallback/i);
    // main = 정당한 파생 slug이나 generic namespace 충돌 (quarantine)
    assert.match(m.stderr, /quarantine|namespace/i);
    // 어느 쪽도 receipt를 남기지 않는다.
    assert.equal(fs.existsSync(
      path.join(repo, '.claude', 'receipts', 'mccp-santa-review', 'default.json')), false);
    assert.equal(fs.existsSync(
      path.join(repo, '.claude', 'receipts', 'mccp-santa-review', 'main.json')), false);
  });

// ── [14] 원장 부재 / 손상 ────────────────────────────────────────────────────

test('[14] a missing ledger seals an empty-but-honest divergent; a corrupt ledger exits 2',
  function () {
    const repo = makeRepo();

    // 부재 — read()가 emptyState를 돌려주므로 seal은 성공하되 승인하지 않는다.
    // 라운드 0건에서 converged를 찍으면 아무 리뷰도 없이 승인이 된다.
    const r = seal.seal({ cwd: repo, decisionId: 'absent-x' });
    assert.equal(r.verdict, 'divergent');
    assert.equal(r.aggregate.rounds, 0);
    const proof = readReceipt(repo, 'absent-x').resolution.review_proof;
    assert.equal(proof.layers.l1, 'divergent', 'no round was ever opened');
    assert.equal(proof.quorum.responded, 0);
    assert.equal(proof.quorum.passed, false);

    // 손상 — parseState가 throw한다(캡을 0으로 리셋하는 폴백은 금지). CLI는 2.
    const sp = seedNice(repo, 'corrupt-x');
    fs.writeFileSync(sp, '{ not json');
    const res = runSealCli(repo, 'corrupt-x');
    assert.equal(res.code, 2);
    assert.match(res.stderr, /SANTA_LEDGER_CORRUPT|not valid JSON/);
  });

// ── [15] 캡 도달 봉인 (UI14 두 번째 종료 경로) ───────────────────────────────

test('[15] a cap-reached ledger seals divergent with exit_reason=cap_reached and l1=divergent',
  function () {
    const repo = makeRepo();
    // cap 2를 정확히 채운 상태. 마지막 라운드가 NICE여도 캡 소진은 divergent다 —
    // "캡을 다 썼다"는 NICE에 도달하지 못했다는 뜻이 아니라 더 돌 수 없다는 뜻이고,
    // begin-round가 다음 라운드를 거부한 지점이 바로 이 종료다.
    seedLedger(repo, 'cap-x', {
      cap: 2,
      rounds: [
        round(0, 'NAUGHTY', [reviewer('A', 'm-a', 'FAIL'), reviewer('B', 'm-b', 'PASS')]),
        round(1, 'NAUGHTY', [reviewer('A', 'm-a', 'FAIL'), reviewer('B', 'm-b', 'PASS')]),
      ],
    });
    const r = seal.seal({ cwd: repo, decisionId: 'cap-x' });

    assert.equal(r.verdict, 'divergent');
    assert.equal(r.aggregate.exitReason, counter.REASONS.CAP_REACHED);

    const receipt = readReceipt(repo, 'cap-x');
    assert.equal(receipt.meta.santa_exit_reason, 'cap_reached');
    assert.equal(receipt.meta.santa_rounds, 2);
    assert.equal(receipt.meta.santa_cap, 2);
    // DD3 divergent l1 분기의 **하단 행**: begin-round가 거부했으므로 l1을
    // 'converged'로 찍으면 승인하지 않은 게이트가 승인했다고 주장하는 것이 된다.
    // schema는 이 구분을 강제하지 않으므로(converged일 때만 층을 본다) 이 단언이
    // 유일한 강제다.
    assert.equal(receipt.resolution.review_proof.layers.l1, 'divergent');
    assert.equal(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
  });

// ── [16] negative — cap 출처가 env가 아니다 ─────────────────────────────────

test('[16] cap comes from the ledger state, not the environment (deliberate mismatch)',
  function () {
    const repo = makeRepo();
    // 라운드를 실제로 게이트한 cap은 2다(beginRound가 state에 저장했다).
    seedLedger(repo, 'capsrc-x', {
      cap: 2,
      rounds: [
        round(0, 'NAUGHTY', [reviewer('A', 'm-a', 'FAIL'), reviewer('B', 'm-b', 'PASS')]),
        round(1, 'NAUGHTY', [reviewer('A', 'm-a', 'FAIL'), reviewer('B', 'm-b', 'PASS')]),
      ],
    });

    // env는 **일부러 어긋나게** 둔다. 두 값이 같은 fixture에서는 폴백 여부가
    // 관측되지 않으므로, 이 불일치가 이 test의 전부다.
    const prior = process.env[counter.ENV_CAP];
    process.env[counter.ENV_CAP] = '5';
    let receipt;
    try {
      seal.seal({ cwd: repo, decisionId: 'capsrc-x' });
      receipt = readReceipt(repo, 'capsrc-x');
    } finally {
      if (prior === undefined) delete process.env[counter.ENV_CAP];
      else process.env[counter.ENV_CAP] = prior;
    }

    assert.equal(receipt.meta.santa_cap, 2,
      'santa_cap must be the ledger state cap, not the env value');
    // exitReason도 state.cap 기준이어야 한다. env(5)를 탔다면 2 라운드는 캡
    // 미달이라 exitReason이 없었을 것이다 — 그 차이가 이 단언의 판별력이다.
    assert.equal(receipt.meta.santa_exit_reason, 'cap_reached',
      'exitReason must be computed from state.cap (2 rounds >= cap 2), not env cap 5');
  });

// ── [17] 단일 스냅샷 일관성 (plan 16항목 밖 — Implement-Codex R1 F1) ────────

test('[17] seal derives everything from ONE ledger snapshot (concurrent mutation cannot leak in)',
  function () {
    const repo = makeRepo();
    const sp = seedNice(repo, 'snap-x');

    // ledger.read를 감싸 (a) 호출 횟수를 세고 (b) 첫 read 직후 디스크를 바꾼다.
    // 라운드별 재읽기로 회귀하면 두 번째 read가 바뀐 상태를 보게 되어, 리포트가
    // 한 버전에서 파생됐다는 보장이 깨진다.
    const originalRead = ledger.read;
    let reads = 0;
    ledger.read = function () {
      const state = originalRead.apply(ledger, arguments);
      reads++;
      if (reads === 1) {
        // 동시 CLI 호출이 라운드를 하나 더 append한 상황.
        const mutated = JSON.parse(fs.readFileSync(sp, 'utf8'));
        mutated.rounds.push(round(1, 'NAUGHTY',
          [reviewer('A', 'm-a', 'FAIL'), reviewer('B', 'm-b', 'FAIL')]));
        fs.writeFileSync(sp, JSON.stringify(mutated, null, 2) + '\n');
      }
      return state;
    };

    let r;
    try {
      r = seal.seal({ cwd: repo, decisionId: 'snap-x' });
    } finally {
      ledger.read = originalRead;
    }

    assert.equal(reads, 1,
      'seal must read the ledger exactly once — every derived value comes from that snapshot');
    const receipt = readReceipt(repo, 'snap-x');
    assert.equal(receipt.meta.santa_rounds, 1,
      'the count must reflect the snapshot, not the concurrently-appended round');
    const report = readReport(repo, r);
    assert.equal(report.indexOf('NAUGHTY'), -1,
      'the report must not mix in a round that appeared after the snapshot was taken');
    assert.equal(r.verdict, 'converged');
  });
