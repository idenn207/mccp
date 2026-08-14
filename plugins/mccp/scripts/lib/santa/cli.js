'use strict';

// santa/cli — `santa-loop.md`가 부르는 유일한 진입점 (M1 / Task 4).
//
// 판정은 sibling 모듈이 한다. 여기는 subcommand dispatch · 입력 검증/변환 ·
// JSON stdout · exit code만이다(mirror: plan-review/cli.js · orchestration-runaway.js:809).
//
// ── exit code (전량 매핑 — 어떤 예외도 stack trace로 새어 exit 1이 되지 않는다) ──
//   0   정상                                  stdout: 결과 JSON
//   12  캡 도달 (begin-round 전용)            stdout: {allowed:false, exitReason:"cap_reached"}
//   75  lock 획득 실패 (일시적, 재시도)        stdout: —   (mutation 0건)
//   2   그 외 전부                             stdout: —
//
// **75가 따로 있는 이유**: lock 실패만은 입력 오류가 아니라 *일시적 경합*이다.
// 5s lease가 만료되면 다음 시도가 성공하므로 호출자에게 "잠시 후 재시도"를
// 알려야 하고, 2로 뭉뚱그리면 산문이 영구 실패로 오독해 라운드를 포기한다.
// repo 선례가 같은 의미로 75를 쓴다(§4 generic-receipt quarantine tempfail).
// **12로 두면 안 된다** — 12는 `cap_reached` 전용이라 캡 도달로 오독된다.
//
// catch-all이 12가 아니라 2인 것도 같은 이유다. mirror인 plan-review/cli.js는
// 미매핑 예외를 EX_BLOCK(12)로 흡수하지만 그쪽 12는 "차단"이라 의미가 맞고,
// 여기 12는 "캡 도달"이라 맞지 않는다. 미러링은 **정책**("예외가 조용한 통과가
// 되지 않는다")을 따르는 것이지 숫자를 따르는 것이 아니다.
//
// ── 경로 주입 플래그는 존재하지 않는다 (security S2) ─────────────────────────
// `--state-dir`/`--state-path`를 두면 repo-root 앵커링과 `assertContained`가
// 동시에 무력화되어 DD3의 방어 2단이 플래그 하나로 사라진다. CLI가 받는 경로
// 인자는 `--cwd`뿐이고 그것은 repo-root **탐색 기점**일 뿐이다 — 어떤 값을 줘도
// 결과 경로는 그 repo의 `.claude/state/santa-loop/` 안이라 탈출면이 없다.
// (선례: CLAUDE.md §3.13 — intent 결정이 CLI 플래그를 0건 갖는 이유와 동형.)

const fs = require('fs');
const path = require('path');

const ledger = require('./ledger');
const counter = require('./counter');
const gate = require('./gate');
const seal = require('./seal');
const { gitRepoRoot } = require('../../receipt/hash');
const { assertContained } = require('../path-containment');

const EX_OK = 0;
const EX_USAGE = 2;
const EX_CAP = 12;
const EX_TEMPFAIL = 75;

// 리뷰어 JSON 입력 상한 (security S3). 리뷰어 출력은 LLM이 만든 신뢰 불가
// 입력이고 파싱 결과가 원장에 그대로 적재되므로(DD2 `raw`), 상한 없이 받으면
// 원장 하나가 메모리와 디스크를 동시에 태울 수 있다.
const MAX_REVIEWER_BYTES = 100 * 1024;
const MAX_REVIEWER_DEPTH = 32;
const MAX_REVIEWER_ARRAY = 1000;
// prototype pollution — `JSON.parse`는 `__proto__` 키를 **own property로** 만들고,
// 하류(P1)가 spread/Object.assign을 쓰는 순간 오염이 성립한다. 파싱 시점에 거부해
// 그 값이 원장에 **들어가지 않게** 한다.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// evidence-lock이 던지는 code 중 **일시적이 아닌** 것들. 전부 mutation 0건이라
// 2가 맞지만, catch-all에 묻지 않고 명시 분기해 stderr에 code를 실어 둔다
// (security S5 — 진단 가능성).
const EVIDENCE_NON_TRANSIENT = new Set([
  'EVIDENCE_ATOMIC_WRITE_FAILED',
  'EVIDENCE_CLAIM_DENIED',
  'EVIDENCE_CLAIM_UNAVAILABLE',
  'EVIDENCE_LOCK_REENTRANT',
  'EVIDENCE_OVERWRITE_OBSERVED',
]);

class SantaCliError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'SantaCliError';
  }
}

function errln(line) { process.stderr.write('[mccp:santa-cli] ' + line + '\n'); }
function out(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.slice(0, 2) !== '--') continue;
    const next = argv[i + 1];
    if (next !== undefined && next.slice(0, 2) !== '--') { args[a.slice(2)] = next; i++; }
    else { args[a.slice(2)] = true; }
  }
  return args;
}

// 전 subcommand 공통. `--decision`이 SLUG_RE를 통과하지 못하면 여기서 throw이고
// **그 시점까지 파일 접촉은 0이다**(경로 조립보다 먼저 검증된다).
function baseOpts(args) {
  const cwd = typeof args.cwd === 'string' ? args.cwd : process.cwd();
  const decisionOverride = typeof args.decision === 'string' ? args.decision : null;
  const decisionId = ledger.deriveSantaDecisionId({ decision: decisionOverride }, { cwd: cwd });
  return { cwd: cwd, decisionId: decisionId, env: process.env };
}

function requireRound(args) {
  const raw = args.round;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new SantaCliError('SANTA_USAGE', '--round <N> is required (non-negative integer)');
  }
  const s = String(raw).trim();
  // **빈 값은 round 0이 아니다.** `Number('') === 0`이라 이 거부가 없으면 빈
  // 문자열이 조용히 첫 라운드를 가리킨다. 그 값은 가설이 아니라 `santa-loop.md`
  // Step 3의 roundIndex 추출이 파싱 실패 시 **실제로 내보내는 값**이다
  // (`catch{process.stdout.write("")}`). 즉 begin-round가 죽거나 stdout이 유실된
  // 라운드의 리뷰어 출력이 round 0에 적재되고 verdict까지 나게 된다 —
  // `counter.decideRound`가 거부에 `roundIndex: null`을 싣지 않기로 한 이유
  // (호출자가 그 값으로 record를 시도하지 못하게)와 같은 축의 구멍이다.
  if (s === '') {
    throw new SantaCliError('SANTA_USAGE',
      '--round must not be empty (an empty value would silently resolve to round 0; ' +
      'if begin-round failed, there is no round to record into)');
  }
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) {
    throw new SantaCliError('SANTA_USAGE',
      '--round must be a non-negative integer; got ' + JSON.stringify(raw));
  }
  return n;
}

// ── reviewer JSON → envelope (DD9) ───────────────────────────────────────────
//
// **변환의 주체는 CLI다.** `id`·`model`은 리뷰어 JSON에 없고(caller가 아는 값),
// `critical_issues`는 이름이 다르다. 리뷰어 프롬프트를 바꾸지 않기 위해(UI10)
// 변환을 여기서 흡수한다.
//
// 검증은 fail-closed다 — 어떤 실패도 exit 2 + append 0건이다. 부분 기록으로
// 원장을 오염시키지 않는다.
function assertSafeGraph(value, depth) {
  if (depth > MAX_REVIEWER_DEPTH) {
    throw new SantaCliError('SANTA_REVIEWER_INVALID',
      'reviewer JSON nests deeper than ' + MAX_REVIEWER_DEPTH + ' levels');
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_REVIEWER_ARRAY) {
      throw new SantaCliError('SANTA_REVIEWER_INVALID',
        'reviewer JSON contains an array of ' + value.length + ' elements (max ' +
        MAX_REVIEWER_ARRAY + ')');
    }
    for (const v of value) assertSafeGraph(v, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.getOwnPropertyNames(value)) {
      if (FORBIDDEN_KEYS.has(k)) {
        throw new SantaCliError('SANTA_REVIEWER_INVALID',
          'reviewer JSON contains a forbidden key "' + k + '" — refused before it ' +
          'can reach the ledger (prototype pollution)');
      }
      assertSafeGraph(value[k], depth + 1);
    }
  }
}

function loadReviewer(args, opts) {
  const file = args['reviewer-file'];
  if (typeof file !== 'string' || file === '') {
    throw new SantaCliError('SANTA_USAGE', '--reviewer-file <path> is required');
  }
  // repo 밖 임의 경로 읽기 차단. 호출자가 이미 쓴 파일이라 실재하므로
  // 파일에 직접 걸 수 있다(상태 디렉토리와 달리 realpath가 성립한다).
  // 양쪽을 `ledger.canonicalPath`로 통과시키는 이유는 그 함수 주석 참조 —
  // Windows 8.3 단축명 때문에 같은 경로가 두 철자를 가질 수 있다.
  assertContained(ledger.canonicalPath(file),
    ledger.canonicalPath(repoRootOrThrow(opts.cwd)), null);

  const stat = fs.statSync(file);
  if (stat.size > MAX_REVIEWER_BYTES) {
    throw new SantaCliError('SANTA_REVIEWER_INVALID',
      'reviewer file is ' + stat.size + ' bytes (max ' + MAX_REVIEWER_BYTES + ')');
  }
  const raw = fs.readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SantaCliError('SANTA_REVIEWER_INVALID',
      'reviewer file is not valid JSON: ' + err.message);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SantaCliError('SANTA_REVIEWER_INVALID', 'reviewer JSON must be an object');
  }
  assertSafeGraph(parsed, 0);

  if (parsed.verdict !== 'PASS' && parsed.verdict !== 'FAIL') {
    throw new SantaCliError('SANTA_REVIEWER_INVALID',
      'reviewer verdict must be "PASS" or "FAIL"; got ' + JSON.stringify(parsed.verdict));
  }
  if (parsed.critical_issues !== undefined && !Array.isArray(parsed.critical_issues)) {
    throw new SantaCliError('SANTA_REVIEWER_INVALID',
      'reviewer critical_issues must be an array when present');
  }

  const id = args.id;
  if (id !== 'A' && id !== 'B') {
    throw new SantaCliError('SANTA_USAGE', '--id must be "A" or "B"; got ' + JSON.stringify(id));
  }
  const model = args.model;
  if (typeof model !== 'string' || model.trim() === '') {
    throw new SantaCliError('SANTA_USAGE', '--model <str> is required and must be non-empty');
  }

  return {
    envelope: {
      id: id,
      model: model,
      verdict: parsed.verdict,
      criticalIssues: Array.isArray(parsed.critical_issues) ? parsed.critical_issues : [],
    },
    // 원본 전체를 함께 보관한다(DD2) — envelope는 gate가 쓰는 최소 투영이라
    // `checks`·`suggestions`를 버리는데, P1의 severity 축이 바로 그 `checks`에서
    // 나온다. envelope만 저장하면 P0가 P1의 입력을 파기하는 셈이다.
    raw: parsed,
  };
}

function repoRootOrThrow(cwd) {
  const root = gitRepoRoot(cwd || process.cwd());
  if (!root) {
    throw new SantaCliError('SANTA_NO_REPO_ROOT', 'could not resolve a git repo root from ' + cwd);
  }
  return root;
}

// ── subcommands ──────────────────────────────────────────────────────────────

function cmdResolveDecision(args) {
  const cwd = typeof args.cwd === 'string' ? args.cwd : process.cwd();
  const decisionOverride = typeof args.decision === 'string' ? args.decision : null;
  const r = ledger.resolveDecisionId({ cwd: cwd, args: {}, decisionOverride: decisionOverride });
  out({ decisionId: r.decisionId, escalation: r.escalation, warning: r.warning });
  return EX_OK;
}

function cmdBeginRound(args) {
  const opts = baseOpts(args);
  const r = ledger.beginRound(opts);
  out({ allowed: r.allowed, roundIndex: r.roundIndex, exitReason: r.exitReason });
  return r.allowed ? EX_OK : EX_CAP;
}

function cmdRecord(args) {
  const opts = baseOpts(args);
  const round = requireRound(args);
  const loaded = loadReviewer(args, opts);
  const r = ledger.recordReviewer(round, loaded.envelope, loaded.raw, opts);
  out({ recorded: true, round: r.round, id: r.id, reviewersInRound: r.reviewersInRound });
  return EX_OK;
}

function cmdVerdict(args) {
  const opts = baseOpts(args);
  const round = requireRound(args);
  const reviewers = ledger.readReviewers(round, opts);
  const cap = counter.parseCap(opts.env);
  const decided = gate.decideVerdict({ reviewers: reviewers, round: round, cap: cap });
  // 라운드를 FINAL로 전이. **완전성·중복·재판정 검사는 넣지 않는다** — P1 소유(DD12).
  ledger.recordVerdict(round, decided.verdict, opts);
  out({ verdict: decided.verdict, failing: decided.failing, exitReason: decided.exitReason });
  return EX_OK;
}

function cmdStatus(args) {
  const opts = baseOpts(args);
  out(ledger.aggregate(opts));
  return EX_OK;
}

// santa-loop-materialize M2 — 봉인. 신규 exit code는 만들지 않는다: seal이 던지는
// `SANTA_*` 코드는 아래 catch-all이 EX_USAGE(2)로, evidence lock 경합은
// EX_TEMPFAIL(75)로 이미 매핑한다. `12`는 cap 전용이라 재사용하지 않는다.
function cmdSeal(args) {
  const opts = baseOpts(args);
  out(seal.seal(opts));
  return EX_OK;
}

function usage() {
  process.stderr.write([
    'usage: santa/cli.js <subcommand> [--decision <slug>] [--cwd <path>]',
    '  resolve-decision',
    '  begin-round',
    '  record   --round <N> --id A|B --model <str> --reviewer-file <path>',
    '  verdict  --round <N>',
    '  status',
    '  seal',
    '',
    'exit: 0 ok · 12 cap reached (begin-round) · 75 lock busy, retry · 2 everything else',
    '',
  ].join('\n'));
}

function runCli(argv) {
  const sub = argv[0];
  const args = parseArgs(argv.slice(1));
  try {
    switch (sub) {
      case 'resolve-decision': return cmdResolveDecision(args);
      case 'begin-round': return cmdBeginRound(args);
      case 'record': return cmdRecord(args);
      case 'verdict': return cmdVerdict(args);
      case 'status': return cmdStatus(args);
      case 'seal': return cmdSeal(args);
      default:
        usage();
        return EX_USAGE;
    }
  } catch (err) {
    const code = err && err.code;

    if (code === 'EVIDENCE_LOCK_UNAVAILABLE') {
      errln('lock busy (' + code + ') — mutation NOT attempted. Retry shortly; a stalled ' +
        'holder is reclaimed once its 5s lease expires.');
      return EX_TEMPFAIL;
    }
    if (EVIDENCE_NON_TRANSIENT.has(code)) {
      errln('evidence guard refused (' + code + ') — mutation NOT attempted. This is NOT ' +
        'transient; retrying will not help.\n  ' + (err.message || ''));
      return EX_USAGE;
    }
    if (code === 'PATH_ESCAPES_GATE') {
      errln('path containment refused (' + code + ') — no file was touched.\n  ' + (err.message || ''));
      return EX_USAGE;
    }
    if (code === 'GIT_FAILED' || code === 'SANTA_NO_REPO_ROOT') {
      errln('repo root unresolved (' + code + '). santa ledger paths are anchored to the ' +
        'git repo root.\n  ' + (err.message || ''));
      return EX_USAGE;
    }
    if (typeof code === 'string' && code.indexOf('SANTA_') === 0) {
      errln(code + ': ' + (err.message || ''));
      return EX_USAGE;
    }
    // 미매핑 예외 — 조용한 통과가 되지 않는다.
    errln('unexpected failure: ' + (err && err.stack ? err.stack : String(err)));
    return EX_USAGE;
  }
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  runCli: runCli,
  EX_OK: EX_OK,
  EX_USAGE: EX_USAGE,
  EX_CAP: EX_CAP,
  EX_TEMPFAIL: EX_TEMPFAIL,
  MAX_REVIEWER_BYTES: MAX_REVIEWER_BYTES,
  MAX_REVIEWER_DEPTH: MAX_REVIEWER_DEPTH,
  MAX_REVIEWER_ARRAY: MAX_REVIEWER_ARRAY,
};
