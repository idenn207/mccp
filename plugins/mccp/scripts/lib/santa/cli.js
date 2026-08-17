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
const adjudication = require('./adjudication');
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

// santa-adjudication M1 (DD4) — 구조화 `critical_issues` 원소의 필드 상한.
// 초과는 **절삭하지 않고** `structured:false`로 떨어뜨린다: 조용한 절삭은 감사
// 표면을 무력화하고(§3.13.1), `partial`로 떨어지는 것은 *더 엄격한* 방향이다.
// 원소 수는 MAX_REVIEWER_ARRAY(1000)가, 전체 크기는 MAX_REVIEWER_BYTES(100KB)가
// 이미 덮으므로 새 방어를 발명하지 않고 필드 검사만 얹는다.
const MAX_CLAIM_CHARS = 500;
const MAX_FAILURE_SCENARIO_CHARS = 2000;
const MAX_EVIDENCE_CHARS = 500;
// **대소문자 구분 · 부분 일치 없음.** `cli.js`의 verdict 열거 검사와 같은 규약이고,
// `gate.SEVERITIES`와 같은 4값이다(양쪽이 갈리면 기록과 판정이 어긋난다).
const SEVERITY_VALUES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

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

// ── critical_issues 원소 → finding (santa-adjudication M1 / DD4) ─────────────
//
// 표는 **배열 전체가 아니라 원소 하나**에 적용된다 — 문자열과 객체가 섞인 배열도
// 원소별로 처리된다. 모든 원소는 종류와 무관하게 finding 한 항목을 만들고
// `criticalIssues`에 claim 문자열을 하나 넣으므로, 두 배열의 **길이는 언제나 입력
// 원소 수와 같다**. 그것이 `seal.js#project`의 `criticalIssueCount` 보존 조건이다.
//
// **타입 위반은 거부이고 계약 미달은 강등이다** — 이 구분이 fail-open을 막는다.
// 원소가 문자열·객체 어느 쪽도 아니면(숫자·불리언·배열·null) 여기서 throw이고
// `cmdRecord`에 도달하지 않으므로 append 0건이다. 반면 구조화 필드가 계약에 못
// 미치는 것은 `structured:false`로 떨어뜨린다 — 그 결과는 `contract='partial'`이고
// 그 라운드는 완화를 받지 못한다(DD1). 어느 경로도 조용한 통과를 만들지 않는다.
//
// `failure_scenario` **부재만은 예외다**(표 4행). `claim`·`severity`·길이는
// *구조화의 조건*이지만 `failure_scenario`는 *blocking의 조건*이므로(UI5 · DD6),
// 생략은 계약 위반이 아니라 "이것을 blocker로 주장하지 않는다"는 선언이다.
// 반대로 강등하면 LOW 주석 하나에도 30자 시나리오를 요구하게 되어 라운드가 상시
// `partial`이 되고 게이팅이 도달 불가가 된다. 무게는 `gate.classifyFinding`이
// `blocking:false`로 뺀다 — severity 문자열만으로 blocking이 되는 경로는 없다.
//
// 부재는 **키가 없거나 `null`인 경우로만** 정의한다. `failure_scenario: 42`는
// 부재가 아니라 계약 위반이라 강등이고, 빈 문자열 `""`도 길이 규약(1자 미만)
// 위반이라 강등이지 부재가 아니다.
function deriveFinding(element, index) {
  if (typeof element === 'string') {
    // legacy 형태 — 그대로 받고 `structured:false`로 둔다.
    return {
      claim: element,
      severity: null,
      failureScenario: null,
      evidence: null,
      structured: false,
    };
  }
  if (element === null || typeof element !== 'object' || Array.isArray(element)) {
    throw new SantaCliError('SANTA_REVIEWER_INVALID',
      'critical_issues[' + index + '] must be a string or an object; got ' +
      (element === null ? 'null' : (Array.isArray(element) ? 'array' : typeof element)));
  }

  // JSON.parse 산출물이라 own property만 존재하고 getter가 없다 — 필드 읽기가
  // 코드를 실행시키지 않는다. `assertSafeGraph`가 파싱 직후 이미 돌아
  // prototype pollution 키를 거부했으므로 여기서 더하는 것은 필드 타입·열거값·
  // 길이 검사뿐이다.
  const claimIsString = typeof element.claim === 'string';
  const claimOk = claimIsString && element.claim.length >= 1
    && element.claim.length <= MAX_CLAIM_CHARS;

  const severityOk = typeof element.severity === 'string'
    && SEVERITY_VALUES.has(element.severity);

  const fs = element.failure_scenario;
  const fsAbsent = fs === undefined || fs === null;
  const fsIsString = typeof fs === 'string';
  const fsOk = fsAbsent
    || (fsIsString && fs.length >= 1 && fs.length <= MAX_FAILURE_SCENARIO_CHARS);

  // `evidence`는 선택 필드다. 비문자열은 **강등 없이** `null`로 떨어지고(DD4 타입
  // 규약 표), 문자열이되 상한 초과일 때만 강등한다.
  const ev = element.evidence;
  const evIsString = typeof ev === 'string';
  const evOk = !evIsString || ev.length <= MAX_EVIDENCE_CHARS;

  const structured = claimOk && severityOk && fsOk && evOk;

  return {
    claim: claimIsString ? element.claim : '',
    // **강등돼도 어휘 안의 severity는 보존한다**(code-review M2). 이전에는
    // `structured ? … : null`이라, claim이 상한을 넘긴 CRITICAL이 원장에
    // `severity:null`로 남아 "리뷰어가 CRITICAL이라 했는데 기록이 계약 미달이었다"와
    // "리뷰어가 severity를 안 냈다"가 구별되지 않았다 — `failureScenario`를 원문
    // 보존하는 UI7과 같은 축인데 한쪽만 지우고 있었다. 보존해도 무게는 새지 않는다:
    // `gate.classifyFinding`이 `structured === true`를 **함께** 요구하므로 강등 행은
    // severity가 살아 있어도 `unstructured`이고 blocking이 되지 못한다.
    // 어휘 밖 값(`'BLOCKER'`)은 보존할 열거값이 없으므로 그대로 null이다.
    severity: severityOk ? element.severity : null,
    // 강등 행의 `failureScenario`는 **원문 보존**이다(UI7 — 강등된 항목이 사라지지
    // 않는다). 비문자열은 보존할 문자열이 없으므로 null이다.
    failureScenario: fsIsString ? fs : null,
    evidence: evIsString ? ev : null,
    structured: structured,
  };
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

  const elements = Array.isArray(parsed.critical_issues) ? parsed.critical_issues : [];
  const findings = elements.map(deriveFinding);

  return {
    envelope: {
      id: id,
      model: model,
      verdict: parsed.verdict,
      // `criticalIssues`는 **claim 문자열 배열로 유지**한다. `seal.js#project`가 그
      // 길이로 `criticalIssueCount`를 뽑고 `renderReport`가 리포트 셀에 찍으므로,
      // 이름을 바꾸거나 구조를 갈아치우면 M2 산출물이 조용히 깨진다. `findings`와
      // 같은 map에서 파생되므로 길이 일치는 구조적으로 보장된다.
      criticalIssues: findings.map(function (f) { return f.claim; }),
      findings: findings,
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

// ── 판정 축 공통 파생 (santa-adjudication M2) ────────────────────────────────
//
// 세 subcommand가 같은 스냅샷에서 같은 값을 파생한다. 여기 모아 두는 이유는
// DD10과 같다 — 각자 `read()`를 부르면 읽기가 늘고 읽기에는 lock이 없다.

// 마지막 FINAL 라운드. OPEN 라운드는 마지막에만 존재할 수 있으므로 뒤에서
// 스캔하면 첫 hit가 답이다. 없으면 `null`(= 아직 판정할 라운드가 없다).
function lastFinalRound(state) {
  for (let i = state.rounds.length - 1; i >= 0; i--) {
    if (state.rounds[i] && state.rounds[i].verdict !== null) return i;
  }
  return null;
}

// 그 라운드의 **raw** blocking id 집합(suppression 이전). `carryOver`의 입력이다.
function rawBlockingIds(reviewers) {
  const ids = new Set();
  gate.analyzeReviewers(reviewers).blocking.forEach(function (b) {
    if (typeof b.issueId === 'string' && b.issueId) ids.add(b.issueId);
  });
  return ids;
}

function decideFor(state, round, opts, folded) {
  return gate.decideAdjudicatedVerdict({
    reviewers: ledger.reviewersFrom(state, round, ledger.resolveStatePath(opts)),
    round: round,
    cap: counter.parseCap(opts.env),
    severityGate: gate.parseSeverityGate(opts.env),
    // `off`는 suppression **경로를 타지 않는다**(사후에 되돌리는 것이 아니다).
    resolved: adjudication.parseLedgerSuppression(opts.env) === 'off'
      ? null : folded.history,
  });
}

// begin-round coverage 선검사 (DD6) — 기각 보존율을 지시가 아니라 **능력**으로
// 만드는 자리다. "기각을 원장에 적으세요"를 산문으로 두면 M1 이전과 같은 상태이고
// 그 실측 보존율은 0%였다.
//
// **`ledger.beginRound` 이전에** 부른다. 그 순서 덕분에 거부 시 캡이 소모되지
// 않는다(라운드가 열리지 않으므로). `ledger.js`는 P0 소유라 손대지 않는다.
//
// **마지막 FINAL 라운드만 본다.** 그 이전 라운드는 자기 후속 라운드가 열릴 때 이미
// 같은 검사를 통과했으므로 귀납적으로 덮인다. 예외는 아래 env로 검사를 끈 구간이며
// 그 구멍은 닫지 않는다 — 전 라운드를 매번 재검사하면 한 번의 audited skip이 그
// slug의 루프를 영구히 막는다.
function assertAdjudicationCoverage(opts) {
  if (adjudication.parseAdjudicationGate(opts.env) === 'off') {
    errln(adjudication.ENV_ADJUDICATION_GATE + '=off — begin-round coverage precheck skipped. ' +
      'Unadjudicated blocking issues from the last FINAL round will NOT stop this round.');
    return;
  }
  const state = ledger.read(opts);
  const round = lastFinalRound(state);
  if (round === null) return;   // FINAL 라운드가 없다 → 공허 참으로 통과

  const folded = adjudication.foldEntries(state.entries);
  const decided = decideFor(state, round, opts, folded);
  const cov = adjudication.coverageOf({
    // **suppressed 항목은 재판정 대상이 아니다** — 이미 종결된 지적이 재등장한
    // 것은 blocking이 아니므로 coverage 대상이 아니고, 아니라면 종결 항목이 매
    // 라운드 판정을 재요구해 suppression의 목적이 사라진다.
    effectiveBlocking: decided.blocking,
    round: round,
    folded: folded,
  });
  if (cov.covered) return;

  // **빠진 것을 전부 열거한다.** 판정을 요구하면서 무엇을 판정해야 하는지 말하지
  // 않으면 운영자는 원장 JSON을 손으로 읽어야 하고, 그 순간 이 게이트는 우회
  // 대상이 된다.
  const lines = cov.missing.map(function (m) {
    return '    - ' + (m.issueId === null ? '(no issue id)' : m.issueId) +
      '  [' + (m.severity || '?') + ']  ' + String(m.claim).slice(0, 80);
  });
  throw new SantaCliError('SANTA_ADJUDICATION_INCOMPLETE',
    'round ' + round + ' has ' + cov.missing.length + ' blocking issue(s) with no ' +
    'adjudication entry for that round — the next round is NOT opened and the cap was ' +
    'NOT consumed.\n' + lines.join('\n') +
    '\n  Record a judgement for each of them:\n' +
    '    santa/cli.js adjudicate --round ' + round + ' --issue <id> ' +
    '--disposition absorbed|rejected|skipped|reopened --evidence "<proof or reason>"\n' +
    '  `skipped` is the in-ledger escape: it satisfies coverage without suppressing, so ' +
    'the issue stays blocking in the next round.\n' +
    '  (' + adjudication.ENV_ADJUDICATION_GATE + '=off disables this precheck entirely.)');
}

function cmdBeginRound(args) {
  const opts = baseOpts(args);
  assertAdjudicationCoverage(opts);
  const r = ledger.beginRound(opts);
  out({ allowed: r.allowed, roundIndex: r.roundIndex, exitReason: r.exitReason });
  return r.allowed ? EX_OK : EX_CAP;
}

// adjudicate — `entries`에 판정 행을 쓰는 **유일한 writer** (DD2 · DD3).
//
// `--claim`/`--severity`는 인자가 아니라 **원장의 blocking 행에서 가져온다**.
// 호출자가 타이핑하면 원문과 어긋난 claim이 저장되고 그 행의 `issue_id`가 실제
// 지적과 갈린다 — 그 행은 어떤 재등장도 suppress하지 못하면서 coverage만
// 충족시킨다.
function cmdAdjudicate(args) {
  const opts = baseOpts(args);
  const round = requireRound(args);
  const issue = typeof args.issue === 'string' ? args.issue : null;
  if (!issue) {
    throw new SantaCliError('SANTA_USAGE', '--issue <id> is required (12-hex issue id from ' +
      'the verdict stdout `blocking[].issueId` / `suppressed[].issueId`)');
  }

  const state = ledger.read(opts);
  const folded = adjudication.foldEntries(state.entries);
  const decided = decideFor(state, round, opts, folded);

  // **effective가 아니라 합집합이다.** 이미 suppress된 지적을 `reopened`로 되돌리는
  // 경로가 필요한데(DD3), effective만 보면 그 지적은 목록에 없어 재개가 구조적으로
  // 불가능해진다 — 탈출구를 만들어 놓고 문을 잠그는 셈이다. 두 배열은 raw blocking의
  // 분할이므로 합집합이 곧 그 라운드가 실제로 낸 blocking 전체다.
  const rows = decided.blocking.concat(decided.suppressed);
  let hit = null;
  for (const b of rows) { if (b.issueId === issue) { hit = b; break; } }
  if (!hit) {
    throw new SantaCliError('SANTA_ADJUDICATION_UNKNOWN_ISSUE',
      'issue "' + issue + '" is not among round ' + round + '\'s blocking issues (' +
      rows.length + ' candidate(s)). Adjudicating an issue that was never raised would ' +
      'pollute the ledger with a judgement that suppresses nothing and covers nothing.');
  }

  const entry = adjudication.buildEntry({
    round: round,
    claim: hit.claim,
    severity: hit.severity,
    disposition: args.disposition,
    evidence: args.evidence,
    // 모듈은 시각을 모른다 — CLI가 stamp한다(DD2의 순수성 경계).
    at: new Date().toISOString(),
  });
  const r = ledger.appendEntry(entry, opts);
  out({
    appended: true, round: round, issueId: entry.issue_id,
    disposition: entry.disposition, entries: r.entries,
  });
  return EX_OK;
}

// 판정 lifecycle 2종 (DD14) — M1 DD8이 "라운드 상태 기계라 원장 축이고 milestone
// 2가 소유한다"로 이관한 셋 중 앞의 둘이다. M1은 그것들을 **위생**이라 불렀는데
// (dual-review 우회 자체는 `distinctIds >= 2`가 이미 닫았으므로 맞다), M2에서는
// 둘 다 **coverage 게이트의 전제**가 된다: FINAL 라운드에 리뷰어가 더 붙으면
// blocking 집합이 커지는데 coverage는 판정 당시의 집합을 검사하므로, 판정을 마치고
// 라운드를 연 뒤에 새 blocking이 생긴다.
//
// **TOCTOU를 주장하지 않는다.** 두 검사 모두 `ledger.read()` 후 CLI 수준에서
// 판정하므로 동시 호출 둘이 나란히 통과할 수 있다. `ledger.recordReviewer`는 P0
// 동결 시그니처라 술어를 lock 안으로 주입할 자리가 없다. 실질 방어는 여전히 판정
// 계층의 `distinctIds >= 2`와 `seal.deriveVerdict`이고, 이 둘은 **순차 호출에서의
// 오용을 막는 위생**이다.
function assertRecordable(state, round, envelopeId, opts) {
  if (!Number.isInteger(round) || round < 0 || round >= state.rounds.length) {
    throw new SantaCliError('SANTA_ROUND_NOT_OPEN',
      'round ' + round + ' was never opened by begin-round (ledger has ' +
      state.rounds.length + ' round(s)) at ' + ledger.resolveStatePath(opts));
  }
  const r = state.rounds[round];
  if (r.verdict !== null) {
    throw new SantaCliError('SANTA_ROUND_NOT_OPEN',
      'round ' + round + ' is already FINAL (verdict ' + JSON.stringify(r.verdict) +
      ') — reviewers cannot be added after the verdict. The adjudication coverage gate ' +
      'checks the blocking set as it stood at verdict time; a late reviewer would raise ' +
      'blocking issues that no judgement is required to cover.');
  }
  const dup = r.reviewers.some(function (x) {
    return x && x.envelope && x.envelope.id === envelopeId;
  });
  if (dup) {
    throw new SantaCliError('SANTA_REVIEWER_DUPLICATE_ID',
      'reviewer id ' + JSON.stringify(envelopeId) + ' is already recorded in round ' + round +
      '. Recording it twice would count one reviewer as two in byReviewer and in ' +
      'blocking[].ids, which is the accuracy the adjudication target list depends on.');
  }
}

function cmdRecord(args) {
  const opts = baseOpts(args);
  const round = requireRound(args);
  const loaded = loadReviewer(args, opts);
  assertRecordable(ledger.read(opts), round, loaded.envelope.id, opts);
  const r = ledger.recordReviewer(round, loaded.envelope, loaded.raw, opts);
  out({ recorded: true, round: r.round, id: r.id, reviewersInRound: r.reviewersInRound });
  return EX_OK;
}

function cmdVerdict(args) {
  const opts = baseOpts(args);
  const round = requireRound(args);
  // **원장을 한 번만 읽는다** (santa-adjudication M2 / DD10). M2는 같은 호출에서
  // 리뷰어와 `entries` 둘 다 필요한데, `readReviewers`가 내부에서 `read()`를 하므로
  // entries를 위해 `ledger.read()`를 또 부르면 읽기가 2회가 되고 **읽기에는 lock이
  // 없다** — 그 사이 다른 CLI 호출이 mutate하면 리뷰어와 판정이 동시에 존재한 적
  // 없는 조합이 되고, 그 조합으로 라운드가 FINAL로 봉인된다. `seal.js:314`가 같은
  // 문제를 이미 이 형태로 해결했다.
  const state = ledger.read(opts);
  const reviewers = ledger.reviewersFrom(state, round, ledger.resolveStatePath(opts));
  const folded = adjudication.foldEntries(state.entries);
  // santa-adjudication M1 — 판정 대상은 `decideAdjudicatedVerdict`다. 동결
  // `decideVerdict`는 그 함수가 완화 자격을 얻지 못했을 때 **위임**으로만 불린다
  // (DD3). 여기서 직접 부르면 `{A,B}` 완전성과 blocking 게이트가 통째로 빠진다.
  const decided = decideFor(state, round, opts, folded);

  // `carryOver`의 직전 라운드 raw blocking은 **같은 스냅샷**에서 파생한다 — 이 값을
  // 위해 원장을 다시 여는 순간 DD10이 닫은 창이 그대로 다시 열린다. 라운드 0에서는
  // `null`을 넘긴다("비교 대상이 없다"와 "새 지적이 없다"는 다르다).
  const carryOver = adjudication.carryOverOf({
    rawBlockingIds: rawBlockingIds(reviewers),
    prevBlockingIds: round > 0
      ? rawBlockingIds(ledger.reviewersFrom(state, round - 1, ledger.resolveStatePath(opts)))
      : null,
    folded: folded,
    round: round,
  });

  // **라운드 verdict 1회** (DD14 3행). 단순 거부가 아니라 **재계산 일치 검사**로
  // 두는 이유는 조회 경로를 죽이지 않기 위해서다 — 운영자와 Task 7의 Validate가
  // 이미 FINAL 라운드에 `verdict`를 부르고 있고, DD13(자기-suppression 차단) 덕분에
  // 그 재계산은 결정적이다. 일치하면 mutation 없이 같은 JSON을 돌려주고, 갈리면
  // 그 사실 자체가 진단이다(그 사이 무언가가 바뀌었다는 뜻이고 조용히 덮어쓰면 안 된다).
  const stored = state.rounds[round].verdict;
  if (stored === null) {
    ledger.recordVerdict(round, decided.verdict, opts);
  } else if (stored !== decided.verdict) {
    throw new SantaCliError('SANTA_VERDICT_UNSTABLE',
      'round ' + round + ' was sealed as ' + JSON.stringify(stored) + ' but recomputes to ' +
      JSON.stringify(decided.verdict) + '. A FINAL round\'s verdict is deterministic ' +
      '(judgements of round N never enter round N\'s own decision — DD13), so a mismatch ' +
      'means the ledger changed underneath it. Refusing to overwrite the sealed verdict.');
  }

  // `blocking`·`mismatches`·`contract`·`byReviewer`가 M1의 계측 표면이다(DD12 —
  // 리포트 표면은 건드리지 않는다). `santa-loop.md` Step 4가 이 넷을 터미널에
  // 출력한다. `byReviewer`는 강등 이력의 분모라 계측 축에 함께 실린다(code-review L1).
  // M2가 더하는 넷은 판정 원장 축이고 **기존 7키는 이름·의미 모두 유지된다**
  // (`blocking`의 의미만 raw → effective로 좁아지며, entries 0건에서는 같은 값이다).
  out({
    verdict: decided.verdict,
    failing: decided.failing,
    exitReason: decided.exitReason,
    contract: decided.contract,
    blocking: decided.blocking,
    mismatches: decided.mismatches,
    byReviewer: decided.byReviewer,
    suppressed: decided.suppressed,
    niceBySuppression: decided.niceBySuppression,
    entries: state.entries.length,
    ledger: {
      counts: folded.counts,
      duplicates: folded.duplicates,
      malformed: folded.malformed,
    },
    carryOver: carryOver,
  });
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
    '  adjudicate --round <N> --issue <id> --disposition absorbed|rejected|skipped|reopened',
    '             --evidence <text>   (claim/severity come from the ledger, not from flags)',
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
      case 'adjudicate': return cmdAdjudicate(args);
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
  MAX_CLAIM_CHARS: MAX_CLAIM_CHARS,
  MAX_FAILURE_SCENARIO_CHARS: MAX_FAILURE_SCENARIO_CHARS,
  MAX_EVIDENCE_CHARS: MAX_EVIDENCE_CHARS,
};
