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

// santa-evidence-diversity M3 — fixture 모델명은 **실재 계열이어야 한다**.
//
// M3 이전에는 `'m-a'`/`'m-b'` 같은 플레이스홀더로 충분했다. 이제 `deriveVerdict`가
// `model-diversity.familyOf`로 계열을 분류하고 **정확히 1개 계열에 매치되지 않으면
// `unknown`**(DD3)이므로, 플레이스홀더 2인 라운드는 `unknown_model`로 강등돼
// `converged`를 단언하는 기존 test 전부가 붉어진다. 단언을 지우거나 게이트를 끄는
// 대신 fixture를 **정직하게** 만든다 — 실제 실행의 Reviewer A는 `opus`이고 Reviewer B는
// `gpt-5.4`이므로, 이 fixture는 이제 "두 리뷰어가 있다"가 아니라 "두 **이종** 리뷰어가
// 있다"를 뜻하고 그것이 애초에 그 test들이 말하려던 상태다. 강등 자체의 회귀는
// `santa-lanes.test.js`의 M3 블록이 자기 fixture로 따로 검사한다.
function reviewer(id, model, verdict, criticalIssues, lane) {
  return {
    envelope: Object.assign({
      id: id, model: model, verdict: verdict,
      criticalIssues: criticalIssues || [],
    // lane은 **선택**이다 — 미지정이 곧 legacy envelope(레인 축 이전의 기록)이고,
    // 기존 fixture 전부가 그 상태로 남아 legacy 무해성을 상시 검사한다.
    }, lane === undefined ? {} : { lane: lane }),
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
    // `beginRound`가 거부된 시점에만 채워진다. fixture가 이것을 **명시**해야 하는
    // 이유는 그것이 원장의 실제 형태이기 때문이다 — 라운드 수만으로 거부를
    // 되짚으면 캡 *도달*과 *거부*가 뭉개진다(PR-Codex F1).
    terminated: o.terminated || null,
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
    rounds: [round(0, 'NICE', [reviewer('A', 'opus', 'PASS'), reviewer('B', 'gpt-5.4', 'PASS')])],
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
      rounds: [round(0, 'NICE', [reviewer('A', 'opus', 'PASS'), reviewer('A', 'opus', 'PASS')])],
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
      rounds: [round(0, 'NAUGHTY', [reviewer('A', 'opus', 'PASS'), reviewer('B', 'gpt-5.4', 'FAIL')])],
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
    // cap 2를 채우고 **다음 begin-round가 실제로 거부된** 상태. 그 거부가 종료이고,
    // 마커가 그것을 기록한다. 라운드 수(2 >= cap 2)만으로는 이 상태와 "마지막 허용
    // 라운드가 아직 진행 중"이 구분되지 않으므로 fixture가 마커를 명시한다.
    seedLedger(repo, 'cap-x', {
      cap: 2,
      rounds: [
        round(0, 'NAUGHTY', [reviewer('A', 'opus', 'FAIL'), reviewer('B', 'gpt-5.4', 'PASS')]),
        round(1, 'NAUGHTY', [reviewer('A', 'opus', 'FAIL'), reviewer('B', 'gpt-5.4', 'PASS')]),
      ],
      terminated: {
        reason: counter.REASONS.CAP_REACHED, at: '2026-08-14T09:00:00.000Z', rounds: 2,
      },
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
        round(0, 'NAUGHTY', [reviewer('A', 'opus', 'FAIL'), reviewer('B', 'gpt-5.4', 'PASS')]),
        round(1, 'NAUGHTY', [reviewer('A', 'opus', 'FAIL'), reviewer('B', 'gpt-5.4', 'PASS')]),
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
    // 종료는 **거부가 기록됐을 때만** 성립한다. 이 원장에는 마커가 없으므로 라운드
    // 수(2)나 env cap(5) 어느 쪽으로도 종료를 만들어낼 수 없다. 이전 구현은
    // `rounds.length >= cap` 산술을 썼기 때문에 cap의 출처가 exitReason을 좌우했고
    // 그것이 이 단언의 원래 판별력이었다 — 이제 그 축은 `santa_cap`이 단독으로
    // 지고, 여기서는 산술 파생이 돌아오지 않았음을 지킨다.
    assert.equal(receipt.meta.santa_exit_reason, undefined,
      'no begin-round refusal was recorded, so no exit reason may be sealed — ' +
      'neither the round count nor the env cap can manufacture one');
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
          [reviewer('A', 'opus', 'FAIL'), reviewer('B', 'gpt-5.4', 'FAIL')]));
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

// ── [18] 회귀 — 마지막 허용 라운드의 NICE (plan 16항목 밖, PR-Codex F1) ──────

// F1이 낸 실제 증상: cap을 정확히 채운 마지막 라운드가 NICE로 수렴했는데도
// divergent로 봉인되고, `santa-loop.md` Step 5.5는 `SEAL_EXIT`(=0)만 보므로
// 그 상태로 push까지 갔다. 원인은 `aggregateFrom`이 `rounds.length >= cap`
// 산술로 종료를 되짚은 것 — 그 술어는 캡 *도달*과 begin-round *거부*를 뭉갠다.
//
// 이 test가 [15]와 짝이다: 같은 라운드 수·같은 cap이고 **마커 유무와 최종 라운드
// verdict만** 다르다. 둘이 갈리지 않으면 파생이 다시 산술로 돌아간 것이다.
test('[18] the last allowed round converging NICE seals converged, not divergent',
  function () {
    const repo = makeRepo();
    seedLedger(repo, 'lastnice-x', {
      cap: 2,
      rounds: [
        round(0, 'NAUGHTY', [reviewer('A', 'opus', 'FAIL'), reviewer('B', 'gpt-5.4', 'PASS')]),
        // 마지막 허용 라운드. 여기서 수렴했으므로 begin-round는 다시 불리지 않았고,
        // 따라서 거부도 없다 — `terminated`는 부재다.
        round(1, 'NICE', [reviewer('A', 'opus', 'PASS'), reviewer('B', 'gpt-5.4', 'PASS')]),
      ],
    });

    const r = seal.seal({ cwd: repo, decisionId: 'lastnice-x' });

    assert.equal(r.verdict, 'converged',
      'a NICE final round must seal converged even when it is the last one the cap allowed');
    assert.equal(r.aggregate.exitReason, null,
      'no refusal happened, so there is no exit reason');
    assert.equal(r.aggregate.rounds, 2);

    const receipt = readReceipt(repo, 'lastnice-x');
    assert.equal(receipt.resolution.review_verdict, 'converged');
    assert.equal(receipt.meta.santa_exit_reason, undefined,
      'exit reason is present-only and must stay absent when nothing terminated the loop');
    assert.equal(receipt.meta.santa_rounds, 2);
    assert.equal(receipt.meta.santa_cap, 2);
    // l1은 "기계 게이트가 이 라운드를 승인했다"이다. begin-round가 거부한 적이
    // 없으므로 승인이 맞다 — [15]가 같은 자리에서 'divergent'를 요구하는 것과 대비.
    assert.equal(receipt.resolution.review_proof.layers.l1, 'converged');
    assert.equal(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
  });

// ── [19] 회귀 — 수렴 후 재진입 거부가 봉인을 강등하지 않는다 (code-review H1) ──

// 이미 수렴해 봉인된 slug에서 `/mccp:santa-loop`를 다시 돌리면 Step 3의
// `begin-round`가 캡에서 **정상 거부**되고 그 거부가 마커를 쓴다. 마커를 판정에
// 먹이면 그 재진입 하나가 converged receipt를 divergent로 덮어쓴다 — F1이 산술로
// 만들던 오봉인을 마커로 재현하는 것이다. 마커는 관측이지 종료가 아니다.
//
// 마커는 **결속돼 있다**(rounds가 현재 라운드 수와 일치) — 즉 이 test는 결속
// 검사로는 걸러지지 않는 축을 지킨다. 판정이 마커를 다시 보기 시작하면 실패한다.
test('[19] a refusal observed after the ledger already converged does not downgrade the seal',
  function () {
    const repo = makeRepo();
    seedLedger(repo, 'reentry-x', {
      cap: 2,
      rounds: [
        round(0, 'NAUGHTY', [reviewer('A', 'opus', 'FAIL'), reviewer('B', 'gpt-5.4', 'PASS')]),
        round(1, 'NICE', [reviewer('A', 'opus', 'PASS'), reviewer('B', 'gpt-5.4', 'PASS')]),
      ],
      // 수렴 뒤 재진입에서 begin-round가 거부되며 쓰인 마커. 현 라운드 수에 결속돼 있다.
      terminated: {
        reason: counter.REASONS.CAP_REACHED, at: '2026-08-15T10:00:00.000Z', rounds: 2,
      },
    });

    const r = seal.seal({ cwd: repo, decisionId: 'reentry-x' });

    assert.equal(r.verdict, 'converged',
      'a converged ledger must stay converged — a later refusal is re-entry, not termination');
    assert.equal(r.aggregate.exitReason, null,
      'santa_exit_reason means "the cap ended the loop"; convergence ended this one');

    const receipt = readReceipt(repo, 'reentry-x');
    assert.equal(receipt.resolution.review_verdict, 'converged');
    assert.equal(receipt.meta.santa_exit_reason, undefined);
    // l1이 뒤집히면 receipt가 "기계 게이트가 승인하지 않았다"고 주장하면서
    // 동시에 converged를 주장하는 자기모순이 된다.
    assert.equal(receipt.resolution.review_proof.layers.l1, 'converged');
    assert.equal(receipt.resolution.review_proof.layers.l2, 'converged');
    assert.equal(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
  });

// ── [20] 결속되지 않은 마커는 종료로 읽지 않는다 (code-review H1, 2차 방어) ──

// 정상 경로에서는 `beginRound`가 라운드를 열 때 마커를 지우므로 이 상태가 생기지
// 않는다. 손으로 편집된 원장에 대한 방어이고, 결속 검사가 사라지면 마커가 다시
// 영구 낙인이 된다.
test('[20] a termination marker bound to a stale round count is not read as termination',
  function () {
    const repo = makeRepo();
    seedLedger(repo, 'stale-marker-x', {
      cap: 3,
      rounds: [
        round(0, 'NAUGHTY', [reviewer('A', 'opus', 'FAIL'), reviewer('B', 'gpt-5.4', 'PASS')]),
        round(1, 'NAUGHTY', [reviewer('A', 'opus', 'FAIL'), reviewer('B', 'gpt-5.4', 'PASS')]),
      ],
      // 라운드가 1건이던 시점의 거부. 그 뒤 캡이 올라 라운드가 더 열렸다.
      terminated: {
        reason: counter.REASONS.CAP_REACHED, at: '2026-08-15T10:00:00.000Z', rounds: 1,
      },
    });

    const r = seal.seal({ cwd: repo, decisionId: 'stale-marker-x' });

    assert.equal(r.aggregate.exitReason, null,
      'the marker describes a ledger state that no longer exists');
    // 최종 라운드가 NAUGHTY라 판정 자체는 divergent다 — 이 test가 지키는 것은
    // **종료 사유**이지 verdict가 아니다. 둘을 한 축으로 묶으면 판별력이 사라진다.
    assert.equal(r.verdict, 'divergent');
    assert.equal(readReceipt(repo, 'stale-marker-x').meta.santa_exit_reason, undefined);
  });

// ── [M1] 증거 레인 — 투영 · 리포트 열 · stamp · legacy 무해성 ────────────────

test('[M1] lane 투영과 stamp — blind 1건인 라운드 2개가 정수 2종으로 봉인된다',
  function () {
    const repo = makeRepo();
    seedLedger(repo, 'lane-x', {
      cap: 3,
      rounds: [
        round(0, 'NAUGHTY', [reviewer('A', 'opus', 'FAIL', null, 'blind'),
          reviewer('B', 'gpt-5.4', 'PASS', null, 'bundled')]),
        round(1, 'NICE', [reviewer('A', 'opus', 'PASS', null, 'blind'),
          reviewer('B', 'gpt-5.4', 'PASS', null, 'bundled')]),
      ],
    });
    seal.seal({ cwd: repo, decisionId: 'lane-x' });
    const receipt = readReceipt(repo, 'lane-x');
    assert.equal(receipt.meta.santa_blind_records, 2);
    assert.equal(receipt.meta.santa_blind_rounds, 2);
    // [primary] 지표의 기계적 표현 — 매 라운드에 블라인드가 1명 이상 있었다.
    assert.equal(receipt.meta.santa_blind_rounds, receipt.meta.santa_rounds);
    assert.equal(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
  });

test('[M1] off 실행의 stamp는 0으로 실린다 — 생략되지 않는다',
  function () {
    // 부재는 "레인 축이 없던 시절(모름)"이고 0은 "관측했고 블라인드가 0건이었다"로
    // 서로 다른 상태다. 0을 생략하면 DD8의 "off 실행도 stamp에 남는다"가 깨지고
    // M3이 degrade를 판정할 입력이 사라진다.
    const repo = makeRepo();
    seedLedger(repo, 'lane-off', {
      cap: 3,
      rounds: [round(0, 'NICE', [reviewer('A', 'opus', 'PASS', null, 'bundled'),
        reviewer('B', 'gpt-5.4', 'PASS', null, 'bundled')])],
    });
    seal.seal({ cwd: repo, decisionId: 'lane-off' });
    const receipt = readReceipt(repo, 'lane-off');
    assert.ok(Object.prototype.hasOwnProperty.call(receipt.meta, 'santa_blind_records'),
      'off run omitted santa_blind_records — absence means "unknown", not "observed zero"');
    assert.equal(receipt.meta.santa_blind_records, 0);
    assert.equal(receipt.meta.santa_blind_rounds, 0);
    assert.equal(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
  });

test('[M1] legacy envelope(레인 부재)는 무해하다 — 0을 내고 던지지 않는다',
  function () {
    const repo = makeRepo();
    seedLedger(repo, 'lane-legacy', {
      cap: 3,
      rounds: [round(0, 'NICE', [reviewer('A', 'opus', 'PASS'),
        reviewer('B', 'gpt-5.4', 'PASS')])],
    });
    assert.doesNotThrow(function () { seal.seal({ cwd: repo, decisionId: 'lane-legacy' }); });
    const receipt = readReceipt(repo, 'lane-legacy');
    assert.equal(receipt.meta.santa_blind_records, 0);
    assert.equal(receipt.meta.santa_blind_rounds, 0);
    assert.equal(validate(receipt).ok, true, JSON.stringify(validate(receipt).errors));
  });

test('[M1] 라운드 0건 원장은 두 키를 함께 생략한다 (관측 자체가 없었다)',
  function () {
    const repo = makeRepo();
    seedLedger(repo, 'lane-empty', { cap: 3, rounds: [] });
    seal.seal({ cwd: repo, decisionId: 'lane-empty' });
    const receipt = readReceipt(repo, 'lane-empty');
    assert.equal(Object.prototype.hasOwnProperty.call(receipt.meta, 'santa_blind_records'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(receipt.meta, 'santa_blind_rounds'), false);
  });

test('[M1] 리포트 라운드 표에 레인 열이 있고 legacy는 ? 로 찍힌다', function () {
  const repo = makeRepo();
  seedLedger(repo, 'lane-report', {
    cap: 3,
    rounds: [
      round(0, 'NICE', [reviewer('A', 'opus', 'PASS', null, 'blind'),
        reviewer('B', 'gpt-5.4', 'PASS', null, 'bundled')]),
      round(1, 'NICE', [reviewer('A', 'opus', 'PASS')]),
    ],
  });
  const r = seal.seal({ cwd: repo, decisionId: 'lane-report' });
  const report = fs.readFileSync(path.join(repo, r.reportPath), 'utf8');
  assert.match(report, /\| # \| started \| verdict \| reviewers \| lanes \|/);
  assert.match(report, /A:blind · B:bundled/);
  assert.match(report, /A:\?/, 'legacy lane must render as ? — distinct from an observed value');
  // UI4 canary는 여전히 새지 않는다.
  assert.equal(report.includes(CANARY), false);
});
