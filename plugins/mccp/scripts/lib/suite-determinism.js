'use strict';

// gate-guard-integrity M2 축 A — 전수 실행의 결정성 관측 harness.
//
// 이 milestone이 닫으려는 결함은 "flaky test가 있다"가 아니라 **"실행마다 동일한지
// 를 말할 수 있는 장치가 없다"** 이다. 고정된 flaky 목록을 수리하는 계획은 실측으로
// 성립하지 않았다 — PRD/STATE가 지목한 4건은 전수 4회에서 한 번도 발화하지 않았고,
// 실제로 갈라진 것은 그 목록에 없던 항목이었다. 즉 "안정적"이라는 진술은 관측 없이는
// 참·거짓을 말할 수 없다. 그 관측을 1급 산출물로 만드는 것이 이 파일이다.
//
// 두 층으로 나눈다(`design-critique-decide.js`의 순수 오라클 분리를 그대로 따름):
//   · 순수층 `diffRuns(runs)` — I/O 없음. 실행 결과 배열만 받아 판정한다.
//   · 실행층 `runSuite` / `runCli` — spawn·파싱·exit code.
// 판정이 순수하므로 부정 케이스를 합성 입력으로 결정적으로 단언할 수 있다. 실제로
// 흔들리는 fixture를 스위트에 심는 것은 신규 flake 유입이라 금지다.
//
// **이 도구는 스위트를 고치지 않는다.** 재시도로 green을 만들거나 실패를 숨기지
// 않는다 — 관측만 한다.
//
// baseline 측정기가 아니라는 점도 경계다. Task 0의 `B`는 `node --test` 1회 출력을
// 봉인한 `.tap` 파일 하나이고, 이 harness는 같은 명령을 N회 돌려 **실행 간 차이**를
// 본다. 두 도구의 산출물은 서로 다른 파일에 있으며 이 파일은 그 `.tap`을 읽지도
// 쓰지도 않는다.

const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_RUNS = 3;
const DEFAULT_PATTERN = 'plugins/mccp/scripts/**/*.test.js';

// 전수 TAP은 실측 800KB대다. 여유를 크게 잡지 않으면 spawnSync가 조용히 잘린
// stdout을 돌려주고, 잘린 TAP은 "실패가 줄었다"로 오독된다.
const MAX_BUFFER_BYTES = 256 * 1024 * 1024;

// `# pass 3861` 형태의 요약 헤더. 값이 정수로 파싱되지 않으면 델타의 피감수가 될 수
// 없으므로 숫자 캡처를 강제한다.
const SUMMARY_RE = /^# (tests|pass|fail|skipped|todo|cancelled) (\d+)$/;

// top-level 실패만 센다. node의 TAP은 subtest를 들여쓰기로 중첩하고 부모도 함께
// 실패시키므로, 들여쓰기 없는 줄만 보면 이름 대조가 1:1이 된다. §Validation의
// `grep -aE "^not ok "` 와 정확히 같은 경계다.
const NOT_OK_RE = /^not ok \d+ - (.+)$/;

// `not ok 1 - name # TODO reason` 처럼 붙는 디렉티브를 이름에서 떼어낸다.
function stripDirective(name) {
  const i = name.indexOf(' # ');
  return (i === -1 ? name : name.slice(0, i)).trim();
}

function parseTap(text) {
  const out = { tests: null, pass: null, fail: null, skipped: null, failing: [] };
  const lines = String(text == null ? '' : text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const s = SUMMARY_RE.exec(line);
    if (s) { out[s[1]] = parseInt(s[2], 10); continue; }
    const f = NOT_OK_RE.exec(line);
    if (f) out.failing.push(stripDirective(f[1]));
  }
  return out;
}

// 순수층. `runs`는 `[{pass, fail, failing:[name]}]`.
//
//   unionFailing     — 어느 실행에서든 실패한 이름의 합집합
//   alwaysFailing    — 모든 실행에서 실패한 이름 (상시 red — 결정적이다)
//   sometimesFailing — union - always (실행마다 갈리는 것 = 비결정)
//   stable           — sometimesFailing이 비었고 pass/fail 카운트도 전 실행 동일
//
// 관측이 1회뿐이면 divergence를 볼 수 없으므로 `stable`은 fail-closed다 — "한 번
// 봤는데 안 갈라졌다"는 안정성의 근거가 아니다.
function diffRuns(runs) {
  const empty = { stable: false, unionFailing: [], alwaysFailing: [], sometimesFailing: [] };
  if (!Array.isArray(runs) || runs.length === 0) {
    return Object.assign({}, empty, { reason: 'no-runs' });
  }
  const sets = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (!r || !Array.isArray(r.failing)) {
      return Object.assign({}, empty, { reason: 'malformed-run-at-index-' + i });
    }
    sets.push(new Set(r.failing.map(String)));
  }

  const union = new Set();
  for (const s of sets) for (const n of s) union.add(n);
  const always = [];
  for (const n of union) {
    let inAll = true;
    for (const s of sets) { if (!s.has(n)) { inAll = false; break; } }
    if (inAll) always.push(n);
  }
  const alwaysSet = new Set(always);
  const sometimes = [];
  for (const n of union) if (!alwaysSet.has(n)) sometimes.push(n);

  const unionFailing = Array.from(union).sort();
  const alwaysFailing = always.slice().sort();
  const sometimesFailing = sometimes.slice().sort();

  if (runs.length < 2) {
    return {
      stable: false, unionFailing, alwaysFailing, sometimesFailing,
      reason: 'insufficient-runs (need >= 2 to observe divergence)',
    };
  }

  // 이름이 같아도 카운트가 흔들리면 비결정이다 — 조건부 skip이 pass/skip 사이를
  // 오가는 형태는 실패 이름 집합에 흔적을 남기지 않는다.
  let countsStable = true;
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].pass !== runs[0].pass || runs[i].fail !== runs[0].fail) { countsStable = false; break; }
  }

  const stable = sometimesFailing.length === 0 && countsStable;
  return {
    stable, unionFailing, alwaysFailing, sometimesFailing,
    reason: stable ? null
      : (sometimesFailing.length ? 'failing-set-diverged' : 'pass/fail counts diverged across runs'),
  };
}

// 실행층. 전수를 1회 돌리고 TAP을 파싱한다.
function runSuite(opts) {
  const o = opts || {};
  const repoRoot = o.repoRoot || process.cwd();
  const pattern = o.pattern || DEFAULT_PATTERN;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', pattern], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER_BYTES,
    env: Object.assign({}, process.env, o.env || {}),
  });
  if (r.error) {
    return { ok: false, reason: 'spawn-failed: ' + r.error.message, pass: null, fail: null, failing: [] };
  }
  const parsed = parseTap(r.stdout);
  // 요약 헤더가 없으면 TAP이 잘렸거나 실행이 중도 사망한 것이다. 그런 실행을
  // "실패 0건"으로 읽으면 harness가 정확히 자기 목적의 반대로 동작한다.
  if (parsed.pass === null || parsed.fail === null) {
    return {
      ok: false,
      reason: 'incomplete-tap (no "# pass"/"# fail" summary — truncated or aborted run)',
      pass: parsed.pass, fail: parsed.fail, failing: parsed.failing,
    };
  }
  return {
    ok: true, reason: null,
    tests: parsed.tests, pass: parsed.pass, fail: parsed.fail, skipped: parsed.skipped,
    failing: parsed.failing, exitCode: r.status,
  };
}

function parseArgs(argv) {
  const out = { runs: DEFAULT_RUNS, json: false, pattern: DEFAULT_PATTERN, repoRoot: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') { out.runs = parseInt(argv[++i], 10); }
    else if (a === '--json') { out.json = true; }
    else if (a === '--pattern') { out.pattern = argv[++i]; }
    else if (a === '--repo-root') { out.repoRoot = argv[++i]; }
    else if (a === '-h' || a === '--help') { out.help = true; }
    else { out.unknown = a; }
  }
  return out;
}

const USAGE = [
  'suite-determinism — observe whether the test suite gives the same answer twice.',
  '',
  'usage: node plugins/mccp/scripts/lib/suite-determinism.js [--runs N] [--json]',
  '                                                          [--pattern <glob>] [--repo-root <dir>]',
  '',
  '  --runs N       how many full-suite runs to compare (default ' + DEFAULT_RUNS + ', minimum 2)',
  '  --json         machine-readable output',
  '',
  'exit 0 only when the runs agree. A divergence — or a run whose TAP never',
  'produced a summary — exits non-zero. "stable" means "no divergence observed',
  'in N runs", never "deterministic".',
].join('\n');

function runCli(argv) {
  const a = parseArgs(argv);
  if (a.help) { process.stdout.write(USAGE + '\n'); return 0; }
  if (a.unknown) { process.stderr.write('[suite-determinism] unknown argument "' + a.unknown + '"\n'); return 2; }
  if (!Number.isFinite(a.runs) || a.runs < 1) {
    process.stderr.write('[suite-determinism] --runs must be a positive integer\n');
    return 2;
  }
  const repoRoot = a.repoRoot ? path.resolve(a.repoRoot) : process.cwd();

  const runs = [];
  const broken = [];
  for (let i = 0; i < a.runs; i++) {
    process.stderr.write('[suite-determinism] run ' + (i + 1) + '/' + a.runs + ' …\n');
    const r = runSuite({ repoRoot: repoRoot, pattern: a.pattern });
    if (!r.ok) { broken.push({ run: i + 1, reason: r.reason }); continue; }
    runs.push({ pass: r.pass, fail: r.fail, skipped: r.skipped, failing: r.failing });
    process.stderr.write('[suite-determinism]   pass=' + r.pass + ' fail=' + r.fail
      + ' skipped=' + r.skipped + '\n');
  }

  const verdict = diffRuns(runs);
  const result = Object.assign({
    runs_requested: a.runs,
    runs_observed: runs.length,
    broken_runs: broken,
    per_run: runs.map(function (r) { return { pass: r.pass, fail: r.fail, skipped: r.skipped }; }),
  }, verdict);

  if (a.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    process.stdout.write((result.stable ? '[OK] ' : '[DIVERGENT] ')
      + 'observed ' + runs.length + '/' + a.runs + ' runs; '
      + 'always=' + result.alwaysFailing.length
      + ' sometimes=' + result.sometimesFailing.length + '\n');
    if (result.sometimesFailing.length) {
      process.stdout.write('  sometimes-failing:\n');
      result.sometimesFailing.forEach(function (n) { process.stdout.write('    - ' + n + '\n'); });
    }
  }

  // 관측 실패도 비영점이다. 돌지 못한 실행을 "차이 없음"으로 읽으면 안 된다.
  if (broken.length) {
    process.stderr.write('[suite-determinism] ' + broken.length + ' run(s) produced no usable TAP\n');
    return 1;
  }
  return result.stable ? 0 : 1;
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  diffRuns: diffRuns,
  parseTap: parseTap,
  runSuite: runSuite,
  parseArgs: parseArgs,
  runCli: runCli,
  DEFAULT_RUNS: DEFAULT_RUNS,
  DEFAULT_PATTERN: DEFAULT_PATTERN,
};
