'use strict';

// santa-loop M1 — 캡 강제 · 원장 · slug 해석을 **CLI 레벨**에서 검증한다.
//
// 순수 oracle만 test하면 배선 결함을 놓친다는 것이 이 repo의 실측 교훈이다
// (plan-review-cli-decide-dd3.test.js의 머리말: 오라클은 옳았는데 CLI가 그
// 분기에 도달하지 못해 production에서 dead code였다). 그래서 여기 단언은
// 거의 전부 `runCli` 또는 실제 자식 프로세스를 지난다.
//
// fixture repo는 tmpdir에 `git init`한 **진짜 repo**다. `--state-dir` 같은
// 경로 주입 플래그를 만들지 않기로 했으므로(security S2) test도 정상 경로와
// 똑같이 repo-root 앵커링 + `assertContained`를 지난다 — 즉 이 파일은
// 방어 장치를 우회하지 않고 **그 위에서** 돈다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const { runCli, EX_OK, EX_USAGE, EX_CAP, EX_TEMPFAIL, MAX_REVIEWER_BYTES,
  MAX_REVIEWER_DEPTH, MAX_REVIEWER_ARRAY } = require('../santa/cli');
const counter = require('../santa/counter');
const ledger = require('../santa/ledger');
const decision = require('../../receipt/decision');

const CLI_PATH = path.join(__dirname, '..', 'santa', 'cli.js');
const SANTA_LOOP_MD = path.join(__dirname, '..', '..', '..', 'commands', 'santa-loop.md');
const IS_WINDOWS = process.platform === 'win32';
const SUBCOMMANDS = ['resolve-decision', 'begin-round', 'record', 'verdict', 'status'];

// ── fixture helpers ──────────────────────────────────────────────────────────

function makeRepo(branch) {
  // realpath: macOS의 /var → /private/var, Windows의 8.3 단축 경로가
  // assertContained의 realpath 비교와 어긋나지 않게 미리 정규화한다.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'santa-cap-')));
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['checkout', '-q', '-b', branch || 'santa-fixture'],
    { cwd: dir, stdio: 'ignore' });
  return dir;
}

function statePath(repo, slug) {
  return path.join(repo, '.claude', 'state', 'santa-loop', slug + '.json');
}

function bytes(p) {
  try { return fs.readFileSync(p); } catch (_e) { return null; }
}

function sameBytes(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.equals(b);
}

function readState(repo, slug) {
  return JSON.parse(fs.readFileSync(statePath(repo, slug), 'utf8'));
}

// in-process CLI. runCli는 exit code를 **반환**하고 process.exit을 부르지
// 않으므로(그 호출은 require.main 블록에만 있다) 그대로 단언할 수 있다.
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

function json(res) { return JSON.parse(res.stdout); }

// 실제 자식 프로세스 — in-process 단언은 exit code **전파**를 증명하지 못한다.
function spawnCli(args, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const p = spawn(process.execPath, [CLI_PATH].concat(args), {
      cwd: opts.cwd || process.cwd(),
      env: Object.assign({}, process.env, opts.env || {}),
    });
    let so = '', se = '';
    p.stdout.on('data', function (d) { so += d; });
    p.stderr.on('data', function (d) { se += d; });
    p.on('close', function (code) { resolve({ code: code, stdout: so, stderr: se }); });
  });
}

function withCap(cap, fn) {
  const prev = process.env.MCCP_SANTA_ROUND_CAP;
  if (cap === null) delete process.env.MCCP_SANTA_ROUND_CAP;
  else process.env.MCCP_SANTA_ROUND_CAP = String(cap);
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.MCCP_SANTA_ROUND_CAP;
    else process.env.MCCP_SANTA_ROUND_CAP = prev;
  }
}

// 실제 Step 3 리뷰어 출력 형태 그대로 (santa-loop.md L76-85). 이 모양이
// envelope로 변환되는 것이 DD9의 계약이다.
const FIXTURE_PASS = {
  verdict: 'PASS',
  checks: [{ criterion: 'Correctness', result: 'PASS', detail: 'logic sound' }],
  critical_issues: [],
  suggestions: ['tighten the rubric'],
};
const FIXTURE_FAIL = {
  verdict: 'FAIL',
  checks: [{ criterion: 'Security', result: 'FAIL', detail: 'hardcoded token' }],
  critical_issues: ['hardcoded token at src/a.js:12'],
  suggestions: [],
};

function writeReviewer(repo, name, obj) {
  const p = path.join(repo, name);
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
}

// 라운드를 FINAL로 닫는다 — beginRound는 OPEN 위에서 멱등이므로(DD12 규칙 0)
// 다음 라운드를 열려면 verdict가 먼저 나야 한다.
function closeRound(repo, slug, round) {
  const r = cli(['verdict', '--decision', slug, '--cwd', repo, '--round', String(round)]);
  assert.equal(r.code, EX_OK, 'closeRound failed: ' + r.stderr);
}

// ── Task 1 — 순수 캡 oracle ──────────────────────────────────────────────────

test('counter — parseCap: 기본 3, 유효값 통과, 불량값은 default로 fail-open', () => {
  assert.equal(counter.parseCap({}), 3);
  assert.equal(counter.parseCap({ MCCP_SANTA_ROUND_CAP: '' }), 3);
  assert.equal(counter.parseCap({ MCCP_SANTA_ROUND_CAP: '1' }), 1);
  assert.equal(counter.parseCap({ MCCP_SANTA_ROUND_CAP: '10' }), 10);

  const se = process.stderr.write;
  process.stderr.write = function () { return true; };
  try {
    assert.equal(counter.parseCap({ MCCP_SANTA_ROUND_CAP: 'abc' }), 3);
    assert.equal(counter.parseCap({ MCCP_SANTA_ROUND_CAP: '2.5' }), 3);
    assert.equal(counter.parseCap({ MCCP_SANTA_ROUND_CAP: '11' }), 3, '상한 초과');
    // 0은 "리뷰 없이 통과"하는 조용한 kill switch가 되므로 허용하지 않는다.
    assert.equal(counter.parseCap({ MCCP_SANTA_ROUND_CAP: '0' }), 3, '하한 미만');
    assert.equal(counter.parseCap({ MCCP_SANTA_ROUND_CAP: '-1' }), 3);
  } finally { process.stderr.write = se; }
});

test('counter — decideRound: cap=3에서 0/1/2는 allowed, 3은 cap_reached', () => {
  for (const n of [0, 1, 2]) {
    const r = counter.decideRound({ roundsSoFar: n, cap: 3 });
    assert.equal(r.allowed, true);
    assert.equal(r.roundIndex, n);
    assert.equal(r.exitReason, null);
  }
  const capped = counter.decideRound({ roundsSoFar: 3, cap: 3 });
  assert.equal(capped.allowed, false);
  assert.equal(capped.exitReason, 'cap_reached');
  // 거부에 index를 실어 보내면 호출자가 그 값으로 record를 시도할 수 있다.
  assert.equal(capped.roundIndex, null);
});

// ── Task 4 — 캡 강제 (CLI) ───────────────────────────────────────────────────

test('cap — cap=3에서 4번째 begin-round가 exit 12 + rounds가 3에서 멈춘다', () => {
  const repo = makeRepo();
  const slug = 'cap-three';
  withCap(3, () => {
    for (let i = 0; i < 3; i++) {
      const r = cli(['begin-round', '--decision', slug, '--cwd', repo]);
      assert.equal(r.code, EX_OK, 'round ' + i + ' should open');
      assert.equal(json(r).roundIndex, i);
      closeRound(repo, slug, i);
    }
    const fourth = cli(['begin-round', '--decision', slug, '--cwd', repo]);
    assert.equal(fourth.code, EX_CAP);
    const body = json(fourth);
    assert.equal(body.allowed, false);
    assert.equal(body.exitReason, 'cap_reached');
    assert.equal(body.roundIndex, null);
    assert.equal(readState(repo, slug).rounds.length, 3, '거부된 라운드가 append되면 안 된다');
  });
});

test('cap — MCCP_SANTA_ROUND_CAP=1이면 2번째 begin-round가 즉시 거부', () => {
  const repo = makeRepo();
  const slug = 'cap-one';
  withCap(1, () => {
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
    closeRound(repo, slug, 0);
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_CAP);
    assert.equal(readState(repo, slug).rounds.length, 1);
  });
});

// ── 종료 마커 — 거부는 관측된 사건이므로 기록된다 (PR-Codex F1) ─────────────
//
// 캡 *도달*(마지막 허용 라운드가 열림)과 다음 begin-round의 *거부*는 다른 사건이고
// `rounds.length`만으로는 구분되지 않는다. 봉인(seal)이 그 둘을 갈라야 하므로
// 거부 시점이 원장에 남아야 한다 — 남지 않으면 마지막 라운드가 NICE로 수렴한 run도
// cap_reached로 읽혀 divergent로 오봉인된다.

test('종료 마커 — 거부된 begin-round가 terminated를 기록하고 라운드는 늘지 않는다', () => {
  const repo = makeRepo();
  const slug = 'term-marker';
  withCap(1, () => {
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
    closeRound(repo, slug, 0);

    // 캡 도달 상태에서는 아직 거부가 없었으므로 마커도 없다.
    assert.equal(readState(repo, slug).terminated, null,
      '캡에 도달했을 뿐 거부는 일어나지 않았다 — 마커가 있으면 안 된다');

    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_CAP);

    const st = readState(repo, slug);
    assert.equal(st.rounds.length, 1, '거부가 라운드를 append하면 안 된다');
    assert.equal(st.terminated.reason, counter.REASONS.CAP_REACHED);
    assert.ok(!Number.isNaN(Date.parse(st.terminated.at)),
      'terminated.at은 파싱 가능한 ISO 시각이어야 한다');
    // 마커는 **관측 시점의 라운드 수에 결속**된다. 결속이 없으면 "언젠가 거부가
    // 있었다"는 영구 낙인이 되어, 캡 상향 후의 수렴까지 종료로 읽힌다.
    assert.equal(st.terminated.rounds, 1,
      '마커가 관측 시점의 라운드 수에 결속되지 않았다');
  });
});

// ── 마커는 낙인이 아니다 — 라운드가 열리면 지워진다 (code-review H1) ────────
//
// 캡 상향(`MCCP_SANTA_ROUND_CAP` 1..10)은 문서화된 운영 경로다. 거부 후 캡을
// 올려 루프를 재개하면 그 거부는 더 이상 이 원장의 종료가 아니므로, 마커가
// 남아 있으면 뒤이은 수렴까지 divergent로 봉인된다 — F1이 산술로 만들던
// 오봉인을 마커로 재현하는 것이다.

test('종료 마커 — 캡 상향으로 라운드가 다시 열리면 마커가 지워진다', () => {
  const repo = makeRepo();
  const slug = 'term-clear';
  withCap(1, () => {
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
    closeRound(repo, slug, 0);
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_CAP);
    assert.equal(readState(repo, slug).terminated.reason, counter.REASONS.CAP_REACHED);
  });
  withCap(3, () => {
    const r = cli(['begin-round', '--decision', slug, '--cwd', repo]);
    assert.equal(r.code, EX_OK, '캡을 올렸으므로 라운드가 열려야 한다');
    assert.equal(json(r).roundIndex, 1);
  });
  const st = readState(repo, slug);
  assert.equal(st.terminated, null,
    '라운드가 열렸는데도 마커가 남았다 — 이후의 수렴이 종료로 오봉인된다');
  assert.equal(st.cap, 3, '허용 분기는 원장의 cap을 갱신한다');
});

test('종료 마커 — 거부는 원장의 cap을 env 값으로 덮어쓰지 않는다', () => {
  const repo = makeRepo();
  const slug = 'term-cap';
  withCap(2, () => {
    for (let i = 0; i < 2; i++) {
      assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
      closeRound(repo, slug, i);
    }
  });
  assert.equal(readState(repo, slug).cap, 2, '라운드 2건을 게이트한 값');

  // 다른 세션이 더 낮은 캡으로 진입해 거부만 받는다. 그 거부가 원장의 cap을
  // 바꾸면 봉인이 `santa_cap`에 **라운드를 게이트한 적 없는 값**을 싣는다.
  withCap(1, () => {
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_CAP);
  });
  const st = readState(repo, slug);
  assert.equal(st.cap, 2, '거부가 원장의 cap을 env 값으로 덮어썼다');
  assert.equal(st.terminated.rounds, 2, '마커는 여전히 기록된다');
});

test('종료 마커 — 손상된 마커는 원장 계층에서 SANTA_LEDGER_CORRUPT로 잡힌다', () => {
  const repo = makeRepo();
  const slug = 'term-corrupt';
  withCap(2, () => {
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
    closeRound(repo, slug, 0);
  });

  // 검증이 없으면 이 값이 `aggregateFrom` → receipt write까지 흘러가 receipt
  // 스키마가 거부하고, 운영자가 받는 진단이 원장 손상이 아니라 receipt를 가리킨다.
  for (const bad of [{ reason: 'nope', at: '2026-08-16T00:00:00.000Z', rounds: 1 },
    { reason: counter.REASONS.CAP_REACHED, at: 'not-a-date', rounds: 1 },
    { reason: counter.REASONS.CAP_REACHED, at: '2026-08-16T00:00:00.000Z' }]) {
    const st = readState(repo, slug);
    st.terminated = bad;
    fs.writeFileSync(statePath(repo, slug), JSON.stringify(st, null, 2) + '\n');
    assert.throws(() => ledger.read({ cwd: repo, decisionId: slug }),
      (e) => e.code === 'SANTA_LEDGER_CORRUPT',
      '손상 마커 ' + JSON.stringify(bad) + '가 통과했다');
  }
});

test('종료 마커 — 거부 반복이 멱등이다 (최초 거부 시각이 밀리지 않는다)', () => {
  const repo = makeRepo();
  const slug = 'term-idem';
  withCap(1, () => {
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
    closeRound(repo, slug, 0);
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_CAP);

    const firstAt = readState(repo, slug).terminated.at;
    const before = bytes(statePath(repo, slug));

    // 프로즈는 begin-round를 여러 번 부를 수 있다(멱등 계약). 그때마다 `at`을
    // 갱신하면 **최초 거부 시각**이라는 감사값이 사라진다.
    for (let i = 0; i < 3; i++) {
      assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_CAP);
    }

    assert.equal(readState(repo, slug).terminated.at, firstAt,
      '재거부가 최초 거부 시각을 덮어썼다');
    assert.ok(sameBytes(before, bytes(statePath(repo, slug))),
      '이미 같은 사유로 종료된 원장은 재기록되지 않아야 한다');
  });
});

// ── DD11 — 캡이 기록 경계에서 기계적으로 구속된다 ────────────────────────────
//
// 이 test가 M1의 핵심이다. 산문이 exit 12를 무시하고 리뷰어를 띄우더라도
// 그 출력은 원장에 **들어갈 수 없고** verdict도 나오지 않는다는 것을 CLI
// 레벨에서 재현한다. 배치(Step 3 순서)는 아래 별도 test가 보고, 여기서는
// **능력**을 본다.

test('DD11 — 캡 거부된 라운드에 record/verdict가 각각 exit 2 + 상태 파일 byte 무변경', () => {
  const repo = makeRepo();
  const slug = 'dd11-capped';
  withCap(3, () => {
    for (let i = 0; i < 3; i++) {
      assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
      closeRound(repo, slug, i);
    }
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_CAP);

    const before = bytes(statePath(repo, slug));
    const rv = writeReviewer(repo, 'rv.json', FIXTURE_PASS);

    const rec = cli(['record', '--decision', slug, '--cwd', repo, '--round', '3',
      '--id', 'A', '--model', 'opus', '--reviewer-file', rv]);
    assert.equal(rec.code, EX_USAGE);
    assert.match(rec.stderr, /SANTA_ROUND_NOT_OPEN/);
    assert.ok(sameBytes(before, bytes(statePath(repo, slug))), 'record가 원장을 건드렸다');

    const vd = cli(['verdict', '--decision', slug, '--cwd', repo, '--round', '3']);
    assert.equal(vd.code, EX_USAGE);
    assert.match(vd.stderr, /SANTA_ROUND_NOT_OPEN/);
    assert.ok(sameBytes(before, bytes(statePath(repo, slug))), 'verdict가 원장을 건드렸다');
  });
});

test('DD11 — begin-round 없이 record --round 0을 직접 불러도 exit 2 + 상태 파일 미생성', () => {
  const repo = makeRepo();
  const slug = 'dd11-never-opened';
  const rv = writeReviewer(repo, 'rv.json', FIXTURE_PASS);
  const rec = cli(['record', '--decision', slug, '--cwd', repo, '--round', '0',
    '--id', 'A', '--model', 'opus', '--reviewer-file', rv]);
  assert.equal(rec.code, EX_USAGE);
  assert.match(rec.stderr, /SANTA_ROUND_NOT_OPEN/);
  assert.equal(fs.existsSync(statePath(repo, slug)), false);

  const vd = cli(['verdict', '--decision', slug, '--cwd', repo, '--round', '0']);
  assert.equal(vd.code, EX_USAGE);
  assert.equal(fs.existsSync(statePath(repo, slug)), false);
});

// ── DD12 규칙 0 — beginRound 멱등 ────────────────────────────────────────────

test('DD12 규칙 0 — OPEN 상태에서 begin-round 연속 3회가 같은 roundIndex, 캡 무소모', () => {
  const repo = makeRepo();
  const slug = 'dd12-idem';
  withCap(3, () => {
    const first = cli(['begin-round', '--decision', slug, '--cwd', repo]);
    assert.equal(first.code, EX_OK);
    assert.equal(json(first).roundIndex, 0);

    for (let i = 0; i < 3; i++) {
      const again = cli(['begin-round', '--decision', slug, '--cwd', repo]);
      assert.equal(again.code, EX_OK);
      assert.equal(json(again).roundIndex, 0, '멱등 반환이어야 한다');
    }
    const st = readState(repo, slug);
    assert.equal(st.rounds.length, 1, '재호출이 라운드를 쌓으면 리뷰 없이 캡이 소진된다');
    assert.equal(st.rounds[0].reviewers.length, 0);

    // 잔여 캡이 그대로임을 실제로 확인: 닫고 나면 아직 2라운드 더 열린다.
    closeRound(repo, slug, 0);
    assert.equal(json(cli(['begin-round', '--decision', slug, '--cwd', repo])).roundIndex, 1);
    closeRound(repo, slug, 1);
    assert.equal(json(cli(['begin-round', '--decision', slug, '--cwd', repo])).roundIndex, 2);
    closeRound(repo, slug, 2);
    assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_CAP);
  });
});

test('DD12 규칙 0 — 동시 begin-round 2개가 라운드를 하나만 연다 (판정이 lock 안에 있다)', async () => {
  const repo = makeRepo();
  const slug = 'dd12-concurrent';
  const env = { MCCP_SANTA_ROUND_CAP: '3' };
  const results = await Promise.all([
    spawnCli(['begin-round', '--decision', slug, '--cwd', repo], { cwd: repo, env: env }),
    spawnCli(['begin-round', '--decision', slug, '--cwd', repo], { cwd: repo, env: env }),
  ]);
  for (const r of results) {
    assert.equal(r.code, EX_OK, 'both should succeed (one opens, one is idempotent): ' + r.stderr);
    assert.equal(JSON.parse(r.stdout).roundIndex, 0);
  }
  assert.equal(readState(repo, slug).rounds.length, 1);
});

// ── DD9 — reviewer envelope round-trip ───────────────────────────────────────

test('DD9 — 실제 Step 3 형태 fixture가 envelope로 변환·저장되고 verdict가 둘을 받는다', () => {
  const repo = makeRepo();
  const slug = 'dd9-roundtrip';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);

  const a = writeReviewer(repo, 'a.json', FIXTURE_PASS);
  const b = writeReviewer(repo, 'b.json', FIXTURE_FAIL);

  const ra = cli(['record', '--decision', slug, '--cwd', repo, '--round', '0',
    '--id', 'A', '--model', 'opus', '--reviewer-file', a]);
  assert.equal(ra.code, EX_OK);
  assert.deepEqual(json(ra), { recorded: true, round: 0, id: 'A', reviewersInRound: 1 });

  const rb = cli(['record', '--decision', slug, '--cwd', repo, '--round', '0',
    '--id', 'B', '--model', 'gpt-5.4', '--reviewer-file', b]);
  assert.equal(rb.code, EX_OK);
  assert.equal(json(rb).reviewersInRound, 2);

  // santa-adjudication M1이 envelope에 `findings`를 **더했다**(DD4). `criticalIssues`는
  // 이름·길이 그대로 남는다 — `seal.js#project`가 그 길이로 criticalIssueCount를
  // 뽑기 때문이고, 이 deepEqual이 그 보존을 계속 고정한다. legacy 문자열 원소는
  // `structured:false`로 파생되므로 그 라운드는 `contract='partial'`이다.
  const st = readState(repo, slug);
  assert.deepEqual(st.rounds[0].reviewers[0].envelope,
    { id: 'A', model: 'opus', verdict: 'PASS', criticalIssues: [], findings: [] });
  assert.deepEqual(st.rounds[0].reviewers[1].envelope,
    { id: 'B', model: 'gpt-5.4', verdict: 'FAIL',
      criticalIssues: ['hardcoded token at src/a.js:12'],
      findings: [{ claim: 'hardcoded token at src/a.js:12', severity: null,
        failureScenario: null, evidence: null, structured: false }] });

  // stdout도 **추가**다(교체가 아니다) — 기존 3필드는 그대로 있고 계측 3필드가 붙는다.
  const vd = cli(['verdict', '--decision', slug, '--cwd', repo, '--round', '0']);
  assert.equal(vd.code, EX_OK);
  assert.deepEqual(json(vd), {
    verdict: 'NAUGHTY', failing: ['B'], exitReason: null,
    contract: 'partial', blocking: [], mismatches: [
      { id: 'B', reviewerVerdict: 'FAIL', blocking: 0, kind: 'fail-without-blocking' },
    ],
    byReviewer: {
      A: { findings: 0, structured: 0, blocking: 0 },
      B: { findings: 1, structured: 0, blocking: 0 },
    },
  });
  assert.equal(readState(repo, slug).rounds[0].verdict, 'NAUGHTY', 'FINAL로 전이해야 한다');
});

test('DD2 — 리뷰어 원본이 소실되지 않는다 (raw에 checks·suggestions 보존)', () => {
  const repo = makeRepo();
  const slug = 'dd2-raw';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const a = writeReviewer(repo, 'a.json', FIXTURE_PASS);
  assert.equal(cli(['record', '--decision', slug, '--cwd', repo, '--round', '0',
    '--id', 'A', '--model', 'opus', '--reviewer-file', a]).code, EX_OK);

  const raw = readState(repo, slug).rounds[0].reviewers[0].raw;
  // envelope는 checks·suggestions를 버린다. P1의 severity 축 입력이 바로 그
  // checks이므로, 여기서 소실되면 P0가 P1의 입력을 파기하는 셈이다.
  assert.deepEqual(raw.checks, FIXTURE_PASS.checks);
  assert.deepEqual(raw.suggestions, FIXTURE_PASS.suggestions);
});

// ── 입력 검증 fail-closed (DD9 + security S3) ────────────────────────────────

test('불량 입력이 원장을 오염시키지 않는다 — 각각 exit 2 + byte 무변경', () => {
  const repo = makeRepo();
  const slug = 'bad-input';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const before = bytes(statePath(repo, slug));

  const cases = [
    ['bad verdict', writeReviewer(repo, 'v1.json', { verdict: 'MAYBE', critical_issues: [] })],
    ['non-array critical_issues', writeReviewer(repo, 'v2.json',
      { verdict: 'PASS', critical_issues: 'boom' })],
    ['not JSON', writeReviewer(repo, 'v3.json', '{not json')],
    ['not an object', writeReviewer(repo, 'v4.json', '[1,2,3]')],
    ['prototype pollution key', writeReviewer(repo, 'v5.json',
      '{"verdict":"PASS","__proto__":{"polluted":true}}')],
    ['oversize', writeReviewer(repo, 'v6.json',
      JSON.stringify({ verdict: 'PASS', critical_issues: [], pad: 'x'.repeat(MAX_REVIEWER_BYTES) }))],
    ['array too long', writeReviewer(repo, 'v7.json',
      JSON.stringify({ verdict: 'PASS', critical_issues: new Array(MAX_REVIEWER_ARRAY + 1).fill('x') }))],
    ['too deep', (function () {
      let o = 'null';
      for (let i = 0; i <= MAX_REVIEWER_DEPTH + 2; i++) o = '{"n":' + o + '}';
      return writeReviewer(repo, 'v8.json', '{"verdict":"PASS","critical_issues":[],"deep":' + o + '}');
    })()],
  ];

  for (const [label, file] of cases) {
    const r = cli(['record', '--decision', slug, '--cwd', repo, '--round', '0',
      '--id', 'A', '--model', 'opus', '--reviewer-file', file]);
    assert.equal(r.code, EX_USAGE, label + ' should exit 2 (got ' + r.code + ')');
    assert.ok(sameBytes(before, bytes(statePath(repo, slug))), label + ' mutated the ledger');
  }
  assert.equal(readState(repo, slug).rounds[0].reviewers.length, 0);
});

test('repo 밖 --reviewer-file은 exit 2 + byte 무변경 (임의 경로 읽기 차단)', () => {
  const repo = makeRepo();
  const slug = 'outside-file';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const before = bytes(statePath(repo, slug));

  const outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'santa-outside-')));
  const outside = path.join(outsideDir, 'rv.json');
  fs.writeFileSync(outside, JSON.stringify(FIXTURE_PASS));

  const r = cli(['record', '--decision', slug, '--cwd', repo, '--round', '0',
    '--id', 'A', '--model', 'opus', '--reviewer-file', outside]);
  assert.equal(r.code, EX_USAGE);
  assert.match(r.stderr, /PATH_ESCAPES_GATE/);
  assert.ok(sameBytes(before, bytes(statePath(repo, slug))));
});

test('--id / --model / --round 누락·불량은 exit 2', () => {
  const repo = makeRepo();
  const slug = 'usage-guard';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const rv = writeReviewer(repo, 'rv.json', FIXTURE_PASS);
  const base = ['record', '--decision', slug, '--cwd', repo, '--round', '0'];

  assert.equal(cli(base.concat(['--id', 'C', '--model', 'opus', '--reviewer-file', rv])).code, EX_USAGE);
  assert.equal(cli(base.concat(['--id', 'A', '--model', '  ', '--reviewer-file', rv])).code, EX_USAGE);
  assert.equal(cli(['record', '--decision', slug, '--cwd', repo,
    '--id', 'A', '--model', 'opus', '--reviewer-file', rv]).code, EX_USAGE, '--round 누락');
  assert.equal(cli(['record', '--decision', slug, '--cwd', repo, '--round', '-1',
    '--id', 'A', '--model', 'opus', '--reviewer-file', rv]).code, EX_USAGE);
  assert.equal(cli(['no-such-subcommand']).code, EX_USAGE);
});

// 빈 `--round` 회귀. `Number('') === 0`이므로 거부가 없으면 빈 값이 조용히
// round 0을 가리킨다. 이 값은 가설이 아니라 `santa-loop.md` Step 3의 roundIndex
// 추출이 파싱 실패 시 **실제로 내보내는 값**이다 — 되돌리면 begin-round가 죽은
// 라운드의 리뷰어 출력이 round 0에 적재되고 verdict까지 난다.
test('빈/공백 --round는 round 0이 아니라 exit 2 (Number("")===0 회귀)', () => {
  const repo = makeRepo();
  const slug = 'empty-round';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const before = bytes(statePath(repo, slug));
  const rv = writeReviewer(repo, 'rv.json', FIXTURE_PASS);

  for (const bad of ['', '   ']) {
    const rec = cli(['record', '--decision', slug, '--cwd', repo, '--round', bad,
      '--id', 'A', '--model', 'opus', '--reviewer-file', rv]);
    assert.equal(rec.code, EX_USAGE, 'record --round ' + JSON.stringify(bad) + ' should exit 2');
    assert.ok(sameBytes(before, bytes(statePath(repo, slug))),
      '빈 --round가 round 0에 기록됐다');

    const vd = cli(['verdict', '--decision', slug, '--cwd', repo, '--round', bad]);
    assert.equal(vd.code, EX_USAGE, 'verdict --round ' + JSON.stringify(bad) + ' should exit 2');
    assert.ok(sameBytes(before, bytes(statePath(repo, slug))));
  }
  assert.equal(readState(repo, slug).rounds[0].reviewers.length, 0);
});

// ── DD3 — traversal 방어 (전 subcommand) ─────────────────────────────────────

test('DD3 — SLUG_RE 불통과 --decision이 5개 subcommand 전부에서 exit 2 + 파일 접촉 0', () => {
  const repo = makeRepo();
  const stateRoot = path.join(repo, '.claude', 'state');
  const evil = ['../../evil', '../evil', '/etc/passwd', 'C:\\evil', 'Evil-Upper',
    'has space', 'dot.slug', 'a'.repeat(200), '.', '..', 'a/b', 'a\\b'];

  for (const sub of SUBCOMMANDS) {
    for (const bad of evil) {
      const r = cli([sub, '--decision', bad, '--cwd', repo, '--round', '0']);
      assert.equal(r.code, EX_USAGE,
        sub + ' --decision "' + bad + '" should exit 2 (got ' + r.code + ')');
      assert.match(r.stderr, /SANTA_BAD_SLUG/);
    }
  }
  // 어떤 호출도 상태 디렉토리를 만들지 않았다.
  assert.equal(fs.existsSync(stateRoot), false, 'traversal 시도가 파일 시스템을 건드렸다');
});

test('DD3 — 빈 --decision은 탈출이 아니라 브랜치 파생으로 떨어진다', () => {
  const repo = makeRepo('santa-empty-override');
  const r = cli(['resolve-decision', '--cwd', repo, '--decision', '']);
  assert.equal(r.code, EX_OK);
  assert.equal(json(r).decisionId, 'santa-empty-override',
    '빈 값은 override 부재로 취급되고, 대체값도 SLUG_RE를 통과한 것이어야 한다');
});

// 구현 중 실측한 이식성 결함의 회귀 test. `fs.realpathSync`는 Windows 8.3
// 단축명을 확장하지 않는 반면 git은 긴 이름을 돌려주므로, 두 철자가 섞이면
// **정상 호출이 traversal로 오판**됐다. `canonicalPath`(realpathSync.native)를
// 되돌리면 이 test의 record 계열이 전부 red가 된다.
//
// POSIX에서는 두 철자 문제가 없어 이 단언이 자명하게 참이지만, 그것도 정보다 —
// 정규화가 플랫폼 무관하게 무해함을 고정한다.
test('이식성 — repo 경로 철자가 git과 달라도 repo 내부 --reviewer-file이 통과한다', () => {
  const repo = makeRepo();
  const slug = 'spelling';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const rv = writeReviewer(repo, 'rv.json', FIXTURE_PASS);
  const r = cli(['record', '--decision', slug, '--cwd', repo, '--round', '0',
    '--id', 'A', '--model', 'opus', '--reviewer-file', rv]);
  assert.equal(r.code, EX_OK,
    'repo 내부 파일이 거부됐다 — 경로 철자 정규화가 빠졌다: ' + r.stderr);
});

test('DD3 — assertContained 3번째 인자가 null이라 정상 경로 2종이 통과한다', () => {
  // repoRoot를 3번째 인자로 넘기면 `.claude/state`가 receipts 밖이라
  // 모든 정상 호출이 `gate dir escapes receipts root`로 죽는다(R6 Codex F0).
  // 최초 실행(디렉토리 미존재)과 재실행(존재) 둘 다 통과해야 한다.
  const repo = makeRepo();
  const slug = 'contain-ok';
  assert.equal(fs.existsSync(path.join(repo, '.claude', 'state')), false);
  const first = cli(['begin-round', '--decision', slug, '--cwd', repo]);
  assert.equal(first.code, EX_OK, '최초 실행 실패: ' + first.stderr);
  closeRound(repo, slug, 0);
  const second = cli(['begin-round', '--decision', slug, '--cwd', repo]);
  assert.equal(second.code, EX_OK, '재실행 실패: ' + second.stderr);
});

test('DD3 — .claude/state가 repo 밖 symlink면 차단된다', { skip: IS_WINDOWS ? 'POSIX only (symlink privilege)' : false }, () => {
  const repo = makeRepo();
  const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'santa-escape-')));
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true });
  fs.symlinkSync(outside, path.join(repo, '.claude', 'state'), 'dir');

  const r = cli(['begin-round', '--decision', 'escaped', '--cwd', repo]);
  assert.equal(r.code, EX_USAGE);
  assert.match(r.stderr, /PATH_ESCAPES_GATE/);
});

// ── DD2 — 손상 상태 파일 ─────────────────────────────────────────────────────

test('DD2 — 손상 JSON에서 exit 2 (exit 0도 12도 아니다) + 캡이 0으로 리셋되지 않는다', () => {
  const repo = makeRepo();
  const slug = 'corrupt';
  const p = statePath(repo, slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '{ this is not json');

  for (const sub of ['begin-round', 'status']) {
    const r = cli([sub, '--decision', slug, '--cwd', repo]);
    assert.equal(r.code, EX_USAGE, sub + ' on corrupt ledger must be exit 2');
    assert.match(r.stderr, /SANTA_LEDGER_CORRUPT/);
  }
  assert.equal(fs.readFileSync(p, 'utf8'), '{ this is not json', '손상 파일을 덮어쓰면 안 된다');
});

test('DD2 — schema_version 불일치도 exit 2 (조용한 폴백 없음)', () => {
  const repo = makeRepo();
  const slug = 'wrong-version';
  const p = statePath(repo, slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ schema_version: 999, rounds: [], entries: [] }));

  const r = cli(['begin-round', '--decision', slug, '--cwd', repo]);
  assert.equal(r.code, EX_USAGE);
  assert.match(r.stderr, /SANTA_LEDGER_CORRUPT/);
});

test('DD2 — 부재는 최초 실행이다 (throw가 아니라 빈 상태)', () => {
  const repo = makeRepo();
  const r = cli(['status', '--decision', 'never-run', '--cwd', repo]);
  assert.equal(r.code, EX_OK);
  assert.deepEqual(json(r), { rounds: 0, entries: 0, exitReason: null });
});

// ── DD3 — 경로 앵커 ──────────────────────────────────────────────────────────

test('DD3 — 하위 디렉토리에서 호출해도 같은 원장을 본다 (repo root 앵커)', () => {
  const repo = makeRepo();
  const slug = 'anchor';
  const sub = path.join(repo, 'deep', 'nested');
  fs.mkdirSync(sub, { recursive: true });

  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const fromSub = cli(['begin-round', '--decision', slug, '--cwd', sub]);
  assert.equal(fromSub.code, EX_OK);
  assert.equal(json(fromSub).roundIndex, 0, '하위 디렉토리가 별도 원장을 만들면 캡이 쪼개진다');
  assert.equal(readState(repo, slug).rounds.length, 1);
  assert.equal(fs.existsSync(path.join(sub, '.claude')), false);
});

test('DD3 — 브랜치명이 slug가 되고, prefix 제거 + [._] 정규화를 거친다', () => {
  const repo = makeRepo('feat/Santa_Loop.M1');
  const r = cli(['resolve-decision', '--cwd', repo]);
  assert.equal(r.code, EX_OK);
  assert.equal(json(r).decisionId, 'santa-loop-m1');
});

test('DD3 — git repo가 아니면 exit 2 (cwd 폴백으로 조용히 진행하지 않는다)', () => {
  const notRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'santa-norepo-')));
  const r = cli(['begin-round', '--decision', 'x', '--cwd', notRepo]);
  assert.equal(r.code, EX_USAGE);
  assert.equal(fs.existsSync(path.join(notRepo, '.claude')), false);
});

// ── DD3 — escalate_pending 3분기 ─────────────────────────────────────────────

function writeStateMd(repo, lines) {
  const dir = path.join(repo, '.claude', 'state');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'STATE.md'), lines.join('\n') + '\n');
}

test('DD3 — escalate_pending 3분기 전부에서 decisionId가 파생 slug이고 drift에서만 warning', () => {
  // 1) escalate_pending 부재
  const r1repo = makeRepo('santa-scope-one');
  const a = json(cli(['resolve-decision', '--cwd', r1repo]));
  assert.deepEqual(a, { decisionId: 'santa-scope-one', escalation: 'none', warning: null });

  // 2) escalate_pending=true + 승계 id 일치
  const r2repo = makeRepo('santa-scope-two');
  writeStateMd(r2repo, ['---', 'escalate_pending: true',
    'escalate_pending_decision_id: santa-scope-two', '---']);
  const b = json(cli(['resolve-decision', '--cwd', r2repo]));
  assert.deepEqual(b, { decisionId: 'santa-scope-two', escalation: 'aligned', warning: null });

  // 3) 불일치 — decisionId는 **승계 slug가 아니라 파생 slug**여야 한다.
  //    승계 slug를 반환하면 원장이 엉뚱한 파일에 쌓여 UI10이 깨진다.
  const r3repo = makeRepo('santa-scope-three');
  writeStateMd(r3repo, ['---', 'escalate_pending: true',
    'escalate_pending_decision_id: some-other-scope', '---']);
  const c = json(cli(['resolve-decision', '--cwd', r3repo]));
  assert.equal(c.decisionId, 'santa-scope-three');
  assert.equal(c.escalation, 'drift');
  assert.match(c.warning, /fingerprint drift/);
  assert.match(c.warning, /some-other-scope/);
  assert.match(c.warning, /santa-scope-three/);
});

test('DD3 — --decision override가 escalation 계산을 없애지 않는다', () => {
  const repo = makeRepo('santa-scope-four');
  writeStateMd(repo, ['---', 'escalate_pending: true',
    'escalate_pending_decision_id: pinned-scope', '---']);
  const r = json(cli(['resolve-decision', '--cwd', repo, '--decision', 'pinned-scope']));
  assert.equal(r.decisionId, 'pinned-scope');
  assert.equal(r.escalation, 'aligned');
});

// ── DD7 — lock / mode ────────────────────────────────────────────────────────

test('DD7 — lock 획득 실패는 exit 75 (일시적) + mutation 0건', () => {
  const repo = makeRepo();
  const slug = 'lock-busy';
  const p = statePath(repo, slug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // 살아 있는 PID + 갓 만든 mtime = orphan 판정 실패 → reclaim 안 됨 →
  // 획득 예산(50 × 20ms) 소진 후 EVIDENCE_LOCK_UNAVAILABLE.
  fs.writeFileSync(p + '.lock', JSON.stringify({
    pid: process.pid, host: os.hostname(), session_id: 'test',
    started_at: new Date().toISOString(), token: 'held-by-test',
  }));

  const r = cli(['begin-round', '--decision', slug, '--cwd', repo]);
  assert.equal(r.code, EX_TEMPFAIL, 'lock 실패는 2가 아니라 75여야 한다 (재시도 가능 신호)');
  assert.match(r.stderr, /EVIDENCE_LOCK_UNAVAILABLE/);
  assert.equal(fs.existsSync(p), false, 'mutation이 일어나면 안 된다');
  fs.unlinkSync(p + '.lock');
});

// R2 Codex F1 회귀. `mutate`가 `mode:'enforce'`를 명시하지 않으면
// `runGuarded`가 `parseGuardMode(env)`로 떨어져, 상속된
// `MCCP_EVIDENCE_CONFLICT_GUARD=off`만으로 원장이 **lock 없이** 쓰인다.
// 그러면 동시 begin-round 둘이 같은 pre-state를 읽고 각자 허가를 받은 뒤
// write가 하나로 붕괴해 — 리뷰어는 두 번 도는데 rounds.length는 하나만 늘고
// **캡이 fail-open**된다. M1이 유일하게 주장하는 불변식이 env 하나로 무너지는
// 자리라, 그 kill switch를 santa 원장은 존중하지 않는다.
//
// 판정을 결정적으로 만들기 위해 lock을 미리 점유해 둔다: 강제가 살아 있으면
// exit 75(경합), 무력화되면 exit 0 + 파일 생성이다.
test('R2 F1 — MCCP_EVIDENCE_CONFLICT_GUARD=off/warn이 원장 lock을 무력화하지 못한다', async () => {
  for (const guard of ['off', 'warn']) {
    const repo = makeRepo();
    const slug = 'guard-' + guard;
    const p = statePath(repo, slug);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p + '.lock', JSON.stringify({
      pid: process.pid, host: os.hostname(), session_id: 'test',
      started_at: new Date().toISOString(), token: 'held-by-test',
    }));

    const r = await spawnCli(['begin-round', '--decision', slug, '--cwd', repo], {
      cwd: repo,
      env: { MCCP_EVIDENCE_CONFLICT_GUARD: guard, MCCP_SANTA_ROUND_CAP: '3' },
    });
    assert.equal(r.code, EX_TEMPFAIL,
      'guard=' + guard + '이 lock 강제를 무력화했다 (캡 fail-open): exit ' + r.code);
    assert.equal(fs.existsSync(p), false, 'guard=' + guard + '에서 mutation이 일어났다');
    fs.unlinkSync(p + '.lock');
  }
});

// 위 test가 **결정적 탐지기**다(수정을 되돌리면 red — 실측 확인). 아래는
// best-effort 보조다: 실측상 `mode:'enforce'`를 되돌려도 통과했다 —
// 세 프로세스가 우연히 직렬화되면 lock 없이도 결과가 같기 때문이다.
// 경합은 재현이 보장되지 않으므로 이것을 캡 강제의 증거로 삼지 말 것.
test('R2 F1 — guard=off에서도 동시 begin-round가 라운드를 하나만 연다 (보조, 비결정적)', async () => {
  const repo = makeRepo();
  const slug = 'guard-off-concurrent';
  const env = { MCCP_EVIDENCE_CONFLICT_GUARD: 'off', MCCP_SANTA_ROUND_CAP: '3' };
  const results = await Promise.all([
    spawnCli(['begin-round', '--decision', slug, '--cwd', repo], { cwd: repo, env: env }),
    spawnCli(['begin-round', '--decision', slug, '--cwd', repo], { cwd: repo, env: env }),
    spawnCli(['begin-round', '--decision', slug, '--cwd', repo], { cwd: repo, env: env }),
  ]);
  for (const r of results) assert.equal(r.code, EX_OK, r.stderr);
  assert.equal(readState(repo, slug).rounds.length, 1,
    '라운드가 하나로 붕괴하지 않으면 리뷰어 실행 수와 rounds.length가 어긋나 캡이 새어 나간다');
});

test('DD7/DD2 — 정상 종료 후 상태 파일 mode가 0600', { skip: IS_WINDOWS ? 'POSIX mode is inert on Windows' : false }, () => {
  const repo = makeRepo();
  const slug = 'mode-check';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  assert.equal(fs.statSync(statePath(repo, slug)).mode & 0o777, 0o600);
});

test('DD7 — mode self-repair: 0644로 바꿔도 다음 진입점이 0600으로 복구', { skip: IS_WINDOWS ? 'POSIX mode is inert on Windows' : false }, () => {
  const repo = makeRepo();
  const slug = 'mode-repair';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const p = statePath(repo, slug);
  fs.chmodSync(p, 0o644);

  const r = cli(['status', '--decision', slug, '--cwd', repo]);
  assert.equal(r.code, EX_OK, '복구 경로가 동작을 깨면 안 된다');
  assert.equal(fs.statSync(p).mode & 0o777, 0o600);
});

// ── DD10 — camelCase ─────────────────────────────────────────────────────────

test('DD10 — CLI JSON stdout 필드가 전부 camelCase (snake_case 혼용 0)', () => {
  const repo = makeRepo();
  const slug = 'camel';
  const rv = writeReviewer(repo, 'rv.json', FIXTURE_PASS);
  const outs = [];
  outs.push(json(cli(['resolve-decision', '--cwd', repo, '--decision', slug])));
  outs.push(json(cli(['begin-round', '--decision', slug, '--cwd', repo])));
  outs.push(json(cli(['record', '--decision', slug, '--cwd', repo, '--round', '0',
    '--id', 'A', '--model', 'opus', '--reviewer-file', rv])));
  outs.push(json(cli(['verdict', '--decision', slug, '--cwd', repo, '--round', '0'])));
  outs.push(json(cli(['status', '--decision', slug, '--cwd', repo])));

  for (const o of outs) {
    for (const k of Object.keys(o)) {
      assert.ok(!k.includes('_'), 'snake_case field leaked to CLI stdout: ' + k);
    }
  }
});

// ── Task 5 — santa-loop.md 산문 ──────────────────────────────────────────────

test('Task 5 — 산문 캡/분기 잔존 0', () => {
  const md = fs.readFileSync(SANTA_LOOP_MD, 'utf8');
  assert.equal(/Maximum 3 iterations/.test(md), false, '산문 캡이 남아 있다');
  assert.equal(/ESCALATE ==/.test(md), false, 'Step 0 3분기 판정이 남아 있다');
});

// 실행되는 CLI 경로는 **plugin-root 앵커**여야 한다. repo-relative(`plugins/mccp/…`)면
// cwd가 이 repo일 때만 동작한다 — plugin은 `~/.claude/plugins/cache/mccp/mccp/<ver>/`에
// 설치되고 cwd는 사용자 프로젝트 루트이므로, 설치된 모든 사용자에게 node가
// MODULE_NOT_FOUND(exit 1)로 죽는다. 그러면 Step 3의 "비영점 exit → 리뷰어 미발화"
// 규칙 탓에 santa-loop이 **영구히 cap reached로 보인다**(exit 1은 문서화된 map
// 0/12/75/2에도 없어 진단 불가). 산문 본문의 소스 경로 언급은 대상이 아니고,
// 여기서 보는 것은 `SANTA=` 대입뿐이다.
test('실행 경로가 ${CLAUDE_PLUGIN_ROOT} 앵커다 (repo-relative면 설치 환경에서 죽는다)', () => {
  const md = fs.readFileSync(SANTA_LOOP_MD, 'utf8');
  const assigns = md.split(/\r?\n/).filter(function (l) { return /^SANTA=/.test(l); });
  assert.ok(assigns.length > 0, 'SANTA= 대입을 찾지 못했다');
  for (const line of assigns) {
    assert.ok(line.includes('${CLAUDE_PLUGIN_ROOT}'),
      'CLI 경로가 plugin-root 앵커가 아니다: ' + line);
    assert.equal(/=["']?plugins\//.test(line), false,
      'repo-relative 경로는 이 repo 밖에서 존재하지 않는다: ' + line);
  }
});

// DD4의 배치 요구를 **눈이 아니라 test가** 본다. 전역 문자열 위치 비교였다면
// begin-round를 Step 2로 옮겨도 통과했을 것이다 — 그래서 `### Step 3` slice를
// 먼저 확정하고 그 안에서만 순서를 본다.
//
// **이 test가 보는 것은 배치이지 셸 의미론이 아니다.** 올바른 위치에서
// 호출하면서 비영점 exit을 무시하는 산문을 쓰면 여기는 통과한다. 그 축은
// 위의 DD11 test들이 담당한다(능력 기반 강제).
test('DD4 — begin-round가 `### Step 3` slice 안에서 `#### Reviewer A`보다 앞에 있다', () => {
  const md = fs.readFileSync(SANTA_LOOP_MD, 'utf8');
  const lines = md.split(/\r?\n/);

  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && /^### Step 3\b/.test(lines[i])) { start = i; continue; }
    if (start !== -1 && /^### /.test(lines[i])) { end = i; break; }
  }
  assert.notEqual(start, -1, '`### Step 3` 헤딩을 찾지 못했다');

  const slice = lines.slice(start, end).join('\n');
  const beginAt = slice.indexOf('begin-round');
  const reviewerAt = slice.indexOf('#### Reviewer A');

  assert.notEqual(beginAt, -1, 'Step 3 slice 안에 begin-round 호출이 없다');
  assert.notEqual(reviewerAt, -1, 'Step 3 slice 안에 `#### Reviewer A`가 없다');
  assert.ok(beginAt < reviewerAt,
    '캡 게이트가 리뷰어 발화보다 뒤에 있다 — 거부가 토큰 소진 후에 온다(DD4)');
});

// ── Task 6 — decision.js 무변경 ──────────────────────────────────────────────

test('Task 6 — BRANCH_BASED_COMMANDS 무변경: santa 미포함 + 기존 4개 유지', () => {
  const s = decision.BRANCH_BASED_COMMANDS;
  assert.ok(s instanceof Set);
  assert.equal(s.has('mccp:santa-loop'), false,
    'santa를 이 Set에 넣으면 DD3이 회피한 lastImplementReceiptSlug fallback이 다시 열린다');
  assert.deepEqual([...s].sort(),
    ['mccp:code-review', 'mccp:pr', 'mccp:prp-pr', 'mccp:review-pr']);
});

test('Task 6 — santa가 재사용하는 상수가 실제로 export돼 있다', () => {
  assert.ok(decision.SLUG_RE instanceof RegExp);
  assert.ok(decision.BRANCH_PREFIX_RE instanceof RegExp);
  // 복사가 아니라 같은 상수를 쓴다 — 규칙이 갈라지면 slug 해석이 어긋난다.
  assert.equal(decision.SLUG_RE.test('santa-loop-materialize-m1'), true);
  assert.equal(decision.SLUG_RE.test('../evil'), false);
});

// ── exit code 전파 (실제 자식 프로세스) ──────────────────────────────────────
//
// in-process runCli 단언은 반환값만 본다. `require.main` 블록이
// `process.exit(runCli(...))`를 제대로 하는지는 실제 프로세스만 증명한다.

test('exit code가 실제 프로세스에서 전파된다 — 12 / 2 / 0', async () => {
  const repo = makeRepo();
  const slug = 'exit-prop';
  const env = { MCCP_SANTA_ROUND_CAP: '1' };

  const ok = await spawnCli(['begin-round', '--decision', slug, '--cwd', repo], { cwd: repo, env: env });
  assert.equal(ok.code, EX_OK);

  const closed = await spawnCli(['verdict', '--decision', slug, '--cwd', repo, '--round', '0'],
    { cwd: repo, env: env });
  assert.equal(closed.code, EX_OK);

  const capped = await spawnCli(['begin-round', '--decision', slug, '--cwd', repo], { cwd: repo, env: env });
  assert.equal(capped.code, EX_CAP, 'cap 도달이 exit 12로 전파돼야 한다');
  assert.equal(JSON.parse(capped.stdout).exitReason, 'cap_reached');

  const bad = await spawnCli(['begin-round', '--decision', '../../evil', '--cwd', repo],
    { cwd: repo, env: env });
  assert.equal(bad.code, EX_USAGE, 'traversal 거부가 exit 2로 전파돼야 한다');
});

// ── UI11 — 판정 lifecycle이 P0에 선반영되지 않음 ─────────────────────────────

test('UI11 — record --id A 두 번은 여전히 성공하되 그 라운드는 NICE가 되지 못한다 (P1이 닫음)', () => {
  const repo = makeRepo();
  const slug = 'no-lifecycle';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const a = writeReviewer(repo, 'a.json', FIXTURE_PASS);

  for (let i = 0; i < 2; i++) {
    const r = cli(['record', '--decision', slug, '--cwd', repo, '--round', '0',
      '--id', 'A', '--model', 'opus', '--reviewer-file', a]);
    assert.equal(r.code, EX_OK, 'M1은 id 중복을 검사하지 않는다(UI11)');
  }
  // **P1(santa-adjudication M1)이 이 우회를 닫았고, 이 단언은 그 지시대로 갱신됐다.**
  // 이전 문언은 "리뷰어 하나로 NICE가 나온다 — 여기서 막으면 UI10·UI11 위반"이었고
  // "P1이 {A,B} 완전성 규칙을 넣으면 이 단언을 함께 갱신하라"를 달고 있었다.
  //
  // 닫힌 것은 **판정**이지 record가 아니다: `record --id A`를 두 번 넣는 것은 여전히
  // 성공한다(id 중복 거부는 라운드 상태 기계라 milestone 2 소유다). 대신
  // `decideAdjudicatedVerdict`가 distinct id ≥ 2를 요구하므로 그 라운드는 NICE에
  // 도달하지 못한다 — A×2 우회를 닫는 데 필요한 것은 그 한 규칙뿐이다(DD8).
  const vd = cli(['verdict', '--decision', slug, '--cwd', repo, '--round', '0']);
  assert.equal(json(vd).verdict, 'NAUGHTY',
    'distinct id가 1이면 NICE가 아니다 — dual-review 우회 경로가 닫혔다');
  assert.deepEqual(json(vd).failing, [],
    '실패한 리뷰어는 없다. 진단은 verdict가 아니라 다양성 부족이 진다');
});

test('UI11 — envelope 0건 verdict가 CLI 경유로 도달 가능하다 (동작 보존)', () => {
  const repo = makeRepo();
  const slug = 'empty-verdict';
  assert.equal(cli(['begin-round', '--decision', slug, '--cwd', repo]).code, EX_OK);
  const vd = cli(['verdict', '--decision', slug, '--cwd', repo, '--round', '0']);
  assert.equal(vd.code, EX_OK, 'CLI가 이 경로를 막으면 UI10(동작 보존) 위반이다');
  assert.equal(json(vd).verdict, 'NAUGHTY');
});

// ── UI4 — receipt 미발행 ─────────────────────────────────────────────────────

// M2(santa-loop-materialize)가 착륙하면서 이 단언의 경계가 이동했다. 원래 문언은
// "receipt write 경로가 **아예 없다**"였고 그것이 M1의 스코프 표시였다. 이제 그
// 경로는 존재하지만, 존재해도 되는 곳은 **`seal.js` 하나**다 — M1이 동결한 네
// 모듈은 여전히 receipt를 모른다. 단언을 지우는 대신 그렇게 좁혔다: 지우면
// "receipt 배선이 어디에나 퍼져도 아무도 모른다"가 되고, 그건 M1이 이 test로
// 막으려던 것과 같은 결함이다.
test('UI4/UI11 — receipt 배선은 seal.js에만 있다 (M1 4개 모듈은 여전히 receipt-free)', () => {
  const santaDir = path.join(__dirname, '..', 'santa');
  const files = fs.readdirSync(santaDir).filter(function (f) { return f.endsWith('.js'); });
  assert.deepEqual(files.sort(), ['cli.js', 'counter.js', 'gate.js', 'ledger.js', 'seal.js']);

  const M1_FROZEN = ['cli.js', 'counter.js', 'gate.js', 'ledger.js'];
  for (const f of M1_FROZEN) {
    const src = fs.readFileSync(path.join(santaDir, f), 'utf8');
    // 주석의 서술("M2 소유")은 허용하고, 실제 배선만 금지한다.
    assert.equal(/require\([^)]*receipt\/(write|store|cli)/.test(src), false,
      f + ' wires a receipt write path — that belongs to seal.js alone');
    assert.equal(/mccp-santa-review/.test(src), false,
      f + ' references the santa GATE_ID — only seal.js may name it');
  }

  // 그리고 seal.js는 실제로 그 경로를 갖는다 — 위 단언이 "아무 데도 없다"로
  // 퇴화하지 않았음을 보이는 대조군이다.
  const sealSrc = fs.readFileSync(path.join(santaDir, 'seal.js'), 'utf8');
  assert.match(sealSrc, /require\([^)]*receipt\/write/);
  assert.match(sealSrc, /mccp-santa-review/);
});

test('Acceptance — 외부 의존이 문서화된 6개뿐이고 npm 의존 0', () => {
  const santaDir = path.join(__dirname, '..', 'santa');
  // M2가 정확히 둘을 더했다: 내부 `./seal`, 외부 `../../receipt/write`.
  // 목록을 열거식으로 두는 것이 이 단언의 전부다 — 새 의존이 조용히 들어오면
  // red가 되고, 들어와야 한다면 여기 한 줄이 그 승인 기록이 된다.
  //
  // santa-adjudication M1이 여섯 번째를 더했다: `gate.js`가 `failure_scenario`의
  // 실질성 검사에 `force-override-reason#validateReason`을 **재사용**한다. 규칙을
  // 베껴 적으면 원본이 바뀔 때 두 사본이 갈리고 그 갈림은 어떤 test도 잡지 않으므로
  // 의존을 지는 쪽이 옳다(Task 1). 이 줄이 그 승인 기록이다.
  const allowed = new Set([
    './counter', './ledger', './gate', './seal',          // 내부
    '../../receipt/evidence-lock', '../../receipt/hash',
    '../../receipt/decision', '../path-containment',
    '../../receipt/write',                                // 외부 5 (M2)
    '../../receipt/lib/force-override-reason',            // 외부 6 (santa-adjudication M1)
    'fs', 'os', 'path', 'child_process',                  // node builtin
  ]);
  for (const f of fs.readdirSync(santaDir)) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(santaDir, f), 'utf8');
    const re = /require\(['"]([^'"]+)['"]\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      assert.ok(allowed.has(m[1]), f + ' requires unexpected module: ' + m[1]);
    }
  }
});

// ── ledger JS API (프로그래매틱 전용 — CLI 표면 없음) ────────────────────────

test('security S2 — 경로 주입은 JS API에만 있고 CLI 플래그로는 존재하지 않는다', () => {
  const src = fs.readFileSync(CLI_PATH, 'utf8');
  assert.equal(/--state-dir|--state-path/.test(src.replace(/^\/\/.*$/gm, '')), false,
    'CLI가 경로 주입 플래그를 노출하면 repo-root 앵커링과 assertContained가 함께 무력화된다');
  // JS API는 Task 2 명세대로 남아 있다.
  assert.equal(typeof ledger.resolveStatePath, 'function');
  const injected = ledger.resolveStatePath({ statePath: '/tmp/x.json' });
  assert.equal(injected, '/tmp/x.json');
});

// ── Step 4 — verdict exit code 분기 (code-review M3) ─────────────────────────
//
// Step 3(record)과 Step 5.5(seal)는 비영점 exit에 분기하는데 Step 4만 없었다. exit
// 75(원장 lock 경합)면 `$VERDICT_JSON`이 비고 아래 파싱이 전부 throw해서 `$VERDICT`가
// 빈 문자열이 되는데, 산문의 분기 목록은 NICE와 NAUGHTY 둘뿐이라 **정의된 동작이
// 없다**. 라운드는 FINAL로 전이되지도 않은 상태다. Step 5.5 test와 같은 이유로
// 산문 설명이 아니라 이 test가 분기의 존재를 소유한다.
test('Step 4 — verdict의 비영점 exit에 실제로 분기한다 (파싱 전에 멈춘다)', () => {
  const md = fs.readFileSync(SANTA_LOOP_MD, 'utf8');
  const lines = md.split(/\r?\n/);

  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && /^### Step 4\b/.test(lines[i])) { start = i; continue; }
    if (start !== -1 && /^### /.test(lines[i])) { end = i; break; }
  }
  assert.notEqual(start, -1, '`### Step 4` 헤딩을 찾지 못했다');
  const slice = lines.slice(start, end);
  const at = (re) => slice.map((l, i) => (re.test(l) ? i + 1 : 0)).filter(Boolean);

  const capture = at(/VERDICT_EXIT=\$\?/);
  const branch = at(/if \[ "\$VERDICT_EXIT" -ne 0 \]/);
  const halt = at(/^\s*exit "\$VERDICT_EXIT"$/);
  const firstParse = at(/^VERDICT=\$\(/);

  assert.ok(capture.length > 0, 'Step 4가 verdict의 exit code를 캡처하지 않는다');
  assert.ok(branch.length > 0, 'exit code를 캡처만 하고 분기하지 않는다');
  assert.ok(halt.length > 0, '분기 안에 종료문이 없다');
  assert.ok(capture[0] < branch[0], '분기가 캡처보다 앞에 있다');
  assert.ok(branch[0] < halt[0], '종료문이 분기 밖에 있다');
  assert.ok(firstParse.length > 0 && halt[0] < firstParse[0],
    'JSON 파싱이 종료문보다 앞에 있다 — 빈 stdout을 파싱하면 그 자리에서 죽고, ' +
    '분기가 주는 진단(75는 재시도)이 stack trace에 묻힌다');
});

// ── Step 5.5 — sealed verdict 분기 (PR-Codex F1의 세 번째 축) ────────────────
//
// `SEAL_EXIT`는 "봉인이 끝났는가"만 답한다. 봉인이 exit 0으로 성공하면서
// `divergent`를 기록할 수 있으므로, exit code에만 분기하면 "리뷰가 수렴하지
// 않았다"고 적힌 receipt 위에서 push가 일어난다. 그 결함이 F1의 세 번째 축이고,
// 이 test가 그 분기의 존재를 강제한다 — 산문 설명만으로는 회귀 시 조용히 사라진다.
//
// 2c(plan Validation)는 `SEAL_EXIT -ne 0` 분기 **수**를 세므로 이 축을 보지 않는다.
// plan 본문은 `mccp-plan-codex` receipt에 hash로 결속돼 편집할 수 없어(§3.12),
// 새 축의 강제는 여기 test가 소유한다.
test('Step 5.5 — sealed verdict에 실제로 분기한다 (변수 캡처만으로는 부족하다)', () => {
  const md = fs.readFileSync(SANTA_LOOP_MD, 'utf8');
  const lines = md.split(/\r?\n/);

  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && /^### Step 5\.5\b/.test(lines[i])) { start = i; continue; }
    if (start !== -1 && /^### /.test(lines[i])) { end = i; break; }
  }
  assert.notEqual(start, -1, '`### Step 5.5` 헤딩을 찾지 못했다');
  const slice = lines.slice(start, end);
  const at = (re) => slice.map((l, i) => (re.test(l) ? i + 1 : 0)).filter(Boolean);

  const derive = at(/SEAL_VERDICT=/);
  const branch = at(/if \[ "\$SEAL_VERDICT" != "converged" \]/);
  const halt = at(/^\s*exit 1$/);

  assert.ok(derive.length > 0, 'Step 5.5가 sealed verdict를 읽지 않는다');
  assert.ok(branch.length > 0,
    'sealed verdict를 캡처만 하고 분기하지 않는다 — "산문은 HALT, 코드는 통과" 결함');
  assert.ok(derive[0] < branch[0], '분기가 파생보다 앞에 있다');
  assert.ok(halt.some((h) => h > branch[0]),
    '분기 안에 종료문이 없다 — divergent 봉인 뒤에도 실행이 push로 흘러간다');

  // 배치: 분기가 push보다 앞이어야 한다. Step 6이 push를 소유하므로 slice 밖이며,
  // 전역 위치로 비교한다.
  const pushLine = lines.map((l, i) => (/git push/.test(l) ? i + 1 : 0)).filter(Boolean)[0];
  assert.ok(pushLine, 'santa-loop.md에서 git push를 찾지 못했다');
  assert.ok(start + branch[0] < pushLine, 'verdict 분기가 push보다 뒤에 있다');
});
