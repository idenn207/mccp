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
const { execFileSync } = require('child_process');

const ledger = require('./ledger');
const counter = require('./counter');
const gate = require('./gate');
const adjudication = require('./adjudication');
const terminator = require('./terminator');
const lanes = require('./lanes');
const scopeAlways = require('./scope-always');
const modelDiversity = require('./model-diversity');
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
// santa-evidence-diversity M2 — 상시 후보로 **여는 파일** 수의 상한.
//
// **`MAX_ALWAYS_PATHS`의 절반이다**(code-review M2). 후보 하나가 최대 2개 경로(plan +
// 선언된 PRD)를 내므로 후보 상한을 경로 상한과 같은 값으로 두면 최대 80 경로가 나와
// `mergeScope`가 40으로 자른다 — 그러면 `pairs`에는 있는데 `paths`에는 없는 쌍이 생기고,
// rubric이 "target paths에 열거된 쌍"을 대조하라 지시하므로 그 쌍은 검토되지 않은 채
// 개수만 보고된다(실측: 30쌍 입력 → `pairs=30 added=40 truncated=20`, 10쌍이 스코프 밖).
// 절반으로 두면 CLI 경로에서 절삭이 **구조적으로 발생하지 않는다**. `mergeScope`의 상한은
// 직접 호출자를 위한 방어로 그대로 남는다. 상한에 걸린 후보는 조용히 사라지지 않고
// `unresolved`에 이유와 함께 남는다.
const MAX_ALWAYS_CANDIDATES = Math.ceil(scopeAlways.MAX_ALWAYS_PATHS / 2);
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
      // santa-adjudication M3 — legacy 문자열 형태는 위치를 낼 자리가 없다.
      // 빈 배열이므로 terminator는 그 지적을 `unknown`으로 보고 발화하지 않는다.
      locations: [],
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
    // santa-adjudication M3 — `locations`는 선택 필드이고 **타입 위반은 강등이
    // 아니라 빈 배열이다**(DD3, `evidence`의 선례 그대로). 강등하면 위치 표기
    // 오류 하나가 `structured:false`를 만들어 **실재 blocking을 지운다** —
    // terminator를 붙이려다 게이트를 뚫는 것이다. 빈 배열로 떨어지면 그 지적은
    // `unknown`이 되고, `unknown`이 하나라도 있으면 terminator는 발화하지 않는다.
    // `structured` 계산식(위)은 이 필드를 보지 않는다.
    locations: terminator.normalizeLocations(element.locations),
    structured: structured,
  };
}

// isOnPath(bin) → boolean  (santa-evidence-diversity M3)
//
// **외부 프로세스를 띄우지 않는다.** `record`는 라운드마다 2회 도는 경로이고,
// `command -v`를 spawn하면 그 자리에 프로세스 실행 의존이 들어온다(`terminator.js`가
// 순수 oracle을 유지한 것과 같은 이유 — 이 파일은 이미 `child_process`를 지고 있지만,
// 지고 있다는 것이 아무 데나 써도 된다는 뜻은 아니다).
//
// 이 함수의 판정은 **탐지이지 실행 보장이 아니다**. `existsSync` 대신 `statSync` +
// `isFile()`을 쓰는 것은 `PATH`에 `codex`라는 **디렉토리**가 있을 때 존재를 가용으로
// 오독하지 않기 위해서다. POSIX 실행 비트까지는 보지 않는다 — 그 검사는 "이 파일이
// 지금 실행 가능한가"를 답하는데, 우리가 묻는 것은 "이 CLI가 이 머신에 설치돼
// 있는가"이고 둘은 다르다(권한 문제로 실패하는 설치본은 **설치돼 있다**).
//
// Windows: `PATHEXT`를 함께 시도한다. 확장자 없는 `codex`만 보면 `codex.exe` 설치본이
// 미설치로 오독되고, 그 오판은 **정당한 이종 실행을 degraded로 만든다**
// (security-reviewer F6). 인용부호로 감싼 PATH 항목(`"C:\Program Files\x"`)은
// Windows에서 정상 형태이므로 벗겨낸다. 빈 항목은 건너뛴다 — Windows에서 빈 항목은
// 현재 디렉토리를 뜻하는데, cwd에 놓인 파일을 "설치된 CLI"로 인정하는 것은
// 이 함수가 답하려는 질문의 답이 아니다.
//
// 순회 길이의 상한은 `PATH` 자신의 길이다. 임의의 캡을 두지 않는 이유는 방어할 근거가
// 없기 때문이고(정상 PATH는 수십 항목), 이 입력은 리뷰어가 아니라 **운영자**가
// 소유한다 — 리뷰어 JSON에 상한을 둔 것과 신뢰 경계가 다르다.
function isOnPath(bin) {
  const raw = process.env.PATH;
  if (typeof raw !== 'string' || raw === '') return false;

  const exts = process.platform === 'win32'
    ? [''].concat(String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';').map(function (e) { return e.trim(); }).filter(Boolean))
    : [''];

  return raw.split(path.delimiter).some(function (entry) {
    const dir = entry.trim().replace(/^"(.*)"$/, '$1');
    if (dir === '') return false;
    return exts.some(function (ext) {
      try {
        return fs.statSync(path.join(dir, bin + ext)).isFile();
      } catch (_) {
        return false;   // ENOENT · ENOTDIR · EACCES — 어느 쪽이든 "여기엔 없다"다
      }
    });
  });
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

  // santa-evidence-diversity M3 — 선언 모델의 PATH 재도출 대조.
  //
  // `--model`은 커맨드 본문이 **타이핑하는 선언**이고, M2 DD7이 "검증되지 않는 값을
  // 봉인하면 receipt가 사실이 아닌 것을 사실처럼 기록한다"고 적은 기준이 여기에도
  // 적용된다. `--lane`과 달리 이 축에는 CLI가 **부분적으로 재도출할 수 있는 사실**이
  // 하나 있다: 외부 CLI가 `PATH`에 있는가.
  //
  // **막는 것**: 설치되지도 않은 CLI의 모델명을 적어 이종 판정을 얻는 경로.
  // **막지 못하는 것**: codex가 설치돼 있는데 Claude fallback을 쓰고 `gpt-5.4`라고
  // 적는 것 — 셸에서 어느 모델이 실제로 응답했는지 확인할 방법이 없다. M1이 `--lane`에
  // 대해 적은 것과 **같은 천장**이고 M3도 위조 방지를 주장하지 않는다. 이것은
  // 예방이 아니라 **탐지**이며 검증은 결과 분포에 맡긴다(PRD 지표 5).
  //
  // `anthropic`·`unknown`은 대조 대상이 **아니다**. Claude fallback은 정상 입력이고,
  // unknown은 `model-diversity`가 이미 degraded로 처리한다 — 여기서 또 막으면 미등재
  // 모델이 라운드를 아예 못 열게 되어 처방이 "카탈로그 1줄 PR"에서 "루프 중단"으로
  // 바뀐다.
  const REQUIRED_CLI = { openai: 'codex', google: 'gemini' };
  const declaredFamily = modelDiversity.familyOf(model);
  const requiredBin = REQUIRED_CLI[declaredFamily];
  if (requiredBin && !isOnPath(requiredBin)) {
    throw new SantaCliError('SANTA_MODEL_UNAVAILABLE',
      'reviewer ' + id + ' declared --model ' + JSON.stringify(model) + ' (family ' +
      declaredFamily + ') but "' + requiredBin + '" is not on PATH, so that model cannot ' +
      'have produced this review. The round stays open; re-record with the model you ' +
      'actually ran (a Claude fallback is a legitimate input — record it as such and the ' +
      'seal will mark the run degraded rather than claiming diversity it did not have). ' +
      'If the CLI is installed but outside PATH, put it on PATH for the loop rather than ' +
      'declaring around it.');
  }

  // santa-evidence-diversity M1 — `--lane`은 **필수**이고 oracle 배정과 대조된다.
  //
  // 검증하는 것: 커맨드 본문이 oracle을 거치지 않고 레인을 즉흥적으로 정하는 경로가
  // 막힌다. 검증하지 **않는** 것: 블라인드로 선언된 리뷰어의 프롬프트에 실제로 번들이
  // 없었는지 — 셸에서 LLM이 무엇을 받았는지 확인할 방법이 없다(DD4). M1은 위조 방지를
  // 주장하지 않으며, PRD는 그것을 알고 검증을 **결과 분포**에 맡겼다(UI7).
  //
  // mode는 여기서 **파서를 경유해** 얻는다. `cmdLanes`가 쓰는 것과 **같은 두 줄**이라
  // 두 곳이 다른 방법으로 mode를 얻어 갈리는 일이 없다. `parseBlindLane`은 던지지
  // 않으므로(불량값 → loud warn + default) "mode를 못 읽어서 검증을 건너뛴다"는 분기가
  // 존재하지 않는다 — 대조는 **항상** 수행된다.
  const lane = args.lane;
  if (lane !== lanes.LANES.BLIND && lane !== lanes.LANES.BUNDLED) {
    throw new SantaCliError('SANTA_USAGE',
      '--lane must be "' + lanes.LANES.BLIND + '" or "' + lanes.LANES.BUNDLED +
      '"; got ' + JSON.stringify(lane));
  }
  const expectedLane = lanes.assignLanes({
    mode: lanes.parseBlindLane(opts.env), ids: [id],
  })[id];
  if (lane !== expectedLane) {
    throw new SantaCliError('SANTA_LANE_MISMATCH',
      'reviewer ' + id + ' declared --lane ' + lane + ' but ' + lanes.ENV_BLIND_LANE +
      ' assigns ' + expectedLane + '. The round stays open; re-record with the assigned ' +
      'lane, or fix the caller so it takes the lane from `santa/cli.js lanes`. ' +
      '(Changing ' + lanes.ENV_BLIND_LANE + ' mid-loop produces this too — change it at ' +
      'a round boundary instead.)');
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
      // santa-evidence-diversity M1 — 증거 레인. `seal.js#project`가 이 값을 투영하고
      // `lanes.laneCoverageFrom`이 집계해 receipt에 정수 2종으로 봉인한다.
      lane: lane,
    },
    // 원본 전체를 함께 보관한다(DD2) — envelope는 gate가 쓰는 최소 투영이라
    // `checks`·`suggestions`를 버리는데, P1의 severity 축이 바로 그 `checks`에서
    // 나온다. envelope만 저장하면 P0가 P1의 입력을 파기하는 셈이다.
    raw: parsed,
  };
}

// readJsonStringArray — `--paths-file` 전용 로더.
//
// `loadReviewer`와 **같은 방어를 같은 순서로** 건다: repo 안 containment →
// 크기 상한 → JSON 파싱 → 형태 검사. 경로 목록도 리뷰 파이프라인 입력이므로
// 리뷰어 JSON보다 느슨할 이유가 없다.
//
// 실패는 전부 typed error → exit 2이고, 이 함수는 **아무것도 stdout에 쓰지 않는다**
// (호출자 `cmdLanes`가 전 검증 통과 후 1회만 out()한다).
function readJsonStringArray(file, opts, flagName) {
  assertContained(ledger.canonicalPath(file),
    ledger.canonicalPath(repoRootOrThrow(opts.cwd)), null);

  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    throw new SantaCliError('SANTA_USAGE',
      flagName + ' does not exist: ' + file + ' (' + err.code + ')');
  }
  if (stat.size > MAX_REVIEWER_BYTES) {
    throw new SantaCliError('SANTA_USAGE',
      flagName + ' is ' + stat.size + ' bytes (max ' + MAX_REVIEWER_BYTES + ')');
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new SantaCliError('SANTA_USAGE',
      flagName + ' is not valid JSON: ' + err.message);
  }
  if (!Array.isArray(parsed)) {
    throw new SantaCliError('SANTA_USAGE',
      flagName + ' must be a JSON array of strings; got ' +
      (parsed === null ? 'null' : typeof parsed));
  }
  if (parsed.length > MAX_REVIEWER_ARRAY) {
    throw new SantaCliError('SANTA_USAGE',
      flagName + ' has ' + parsed.length + ' entries (max ' + MAX_REVIEWER_ARRAY + ')');
  }
  parsed.forEach(function (v, i) {
    if (typeof v !== 'string' || v === '') {
      throw new SantaCliError('SANTA_USAGE',
        flagName + '[' + i + '] must be a non-empty string; got ' + JSON.stringify(v));
    }
  });
  return parsed;
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
// 정본은 `ledger.lastFinalRound`다 — `terminate`의 좌표 검증이 같은 술어를 쓰므로,
// 여기서 다시 구현하면 검증이 통과시키는 상태와 판정이 고른 라운드가 갈릴 수 있다.
function lastFinalRound(state) {
  return ledger.lastFinalRound(state);
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

// ── patch-chasing terminator (santa-adjudication M3) ─────────────────────────
//
// **git 호출은 원장 lock 밖에서 일어난다**(DD4). `ledger.mutate`는
// `guardedReadModifyWrite` 임계구역 안에서 콜백을 돌리므로, 그 안에서 `git show`를
// 부르면 프로세스 spawn 시간만큼 lock을 잡는다. 순서를 고정한다:
// **git → 분류 → 판정 → (발화 시에만) `ledger.terminate`**.

// rev는 원장 옆 gitignored 파일에서 온 **외부 입력**이다. 형식 검사를 먼저
// 통과시키는 이유는 주입이 아니라 진단이다 — 인자 배열이라 셸 해석이 없고 `--`
// 종결자가 붙지만, `--upstream` 같은 문자열이 git 자신의 플래그로 해석되는 것은
// 막아야 한다.
const REV_RE = /^[0-9a-f]{7,40}$/;

// `git show`의 출력 상한. 기본 buffer(1MB)를 넘기면 `execFileSync`가 **throw**하고
// 그 throw가 `check-termination` 전체를 죽인다 — 큰 커밋 하나가 루프의 종료 판정을
// 오류로 바꾸는 것은 이 축의 기본 자세("모르면 종료하지 않는다")와 어긋난다.
// 상한을 명시하고 초과는 아래 catch가 빈 집합으로 흡수한다.
const GIT_SHOW_MAX_BUFFER = 32 * 1024 * 1024;

// unified diff 파일/hunk 헤더. **줄 단위로** 적용한다 — 한 정규식으로 전체 출력을
// 훑으면 백트래킹 면이 출력 크기에 비례한다.
//
// `+++ /dev/null`(삭제된 파일)은 `b/` prefix가 없으므로 이 앵커에 걸리지 않고, 그
// 파일은 patch 집합에 **열리지 않는다**.
const DIFF_FILE_RE = /^\+\+\+ b\/(.+)$/;
// `,d` 생략은 `d=1`이다(unified diff 규약).
const DIFF_HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

// patchRangesFrom(rev, opts) → { [file]: Array<[start, end]> }
//
// **부재·불량은 오류가 아니라 빈 집합이다**(DD4). 파일이 없거나, rev가 형식을
// 벗어나거나, `git show`가 비영점이거나, 출력에 hunk가 없으면 patch 범위는 빈
// 집합이고 모든 지적이 `unknown`이 되어 terminator는 발화하지 않는다. 루프는 캡이
// 끝낸다 — 모르면 종료하지 않는다.
//
// **개별 hunk가 형태에 맞지 않으면 그 줄만 건너뛴다.** 파일 전체나 결과 전체를
// 버리지 않는 이유는 방향이 안전한 쪽이기 때문이다: 범위를 덜 모으면 그 위치의
// 지적이 `preexisting`이 되어 terminator가 **덜** 발화한다. 반대로 전체를 버리면
// 결과는 같은 미발화지만 한 줄의 형식 이탈이 정상 hunk 전부를 지워 진단이 나빠진다.
//
// 반환은 `Object.create(null)`이다 — 경로가 `__proto__`인 파일이 own property를
// 잃고 **조용히 사라지는** 것을 막는다(오염이 아니라 소실이 여기서의 실패 모드다).
function patchRangesFrom(rev, opts) {
  const empty = Object.create(null);
  // 셸이 쓴 파일에는 trailing newline이 붙는다 — trim 없이는 정상 rev가 전부
  // 불량으로 떨어져 terminator가 영원히 미발화한다(security-reviewer 권고 1).
  const clean = typeof rev === 'string' ? rev.trim() : '';
  if (clean === '') return empty;
  if (!REV_RE.test(clean)) {
    errln('--prev-fix-rev ' + JSON.stringify(rev) + ' is not a 7..40 hex object name; ' +
      'patch ranges are empty, every location falls to `unknown`, and the terminator ' +
      'will not fire. The loop ends at the cap instead.');
    return empty;
  }

  let stdout;
  try {
    stdout = execFileSync('git',
      ['show', '--unified=0', '--no-color', '--format=', clean, '--'], {
        cwd: (opts && opts.cwd) || process.cwd(),
        encoding: 'utf8',
        maxBuffer: GIT_SHOW_MAX_BUFFER,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
  } catch (_err) {
    errln('git show ' + clean + ' failed or exceeded the output limit; patch ranges are ' +
      'empty and the terminator will not fire.');
    return empty;
  }

  const ranges = Object.create(null);
  let current = null;
  const lines = String(stdout).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fileHit = DIFF_FILE_RE.exec(line);
    if (fileHit) {
      current = fileHit[1];
      if (!Object.prototype.hasOwnProperty.call(ranges, current)) ranges[current] = [];
      continue;
    }
    if (current === null) continue;
    const hunkHit = DIFF_HUNK_RE.exec(line);
    if (!hunkHit) continue;
    const start = Number(hunkHit[1]);
    const count = hunkHit[2] === undefined ? 1 : Number(hunkHit[2]);
    if (!Number.isInteger(start) || !Number.isInteger(count)) continue;
    // **추가·수정 라인만 patch 범위다**(DD11). `d === 0`인 삭제 전용 hunk는 파일을
    // 집합에 넣되(위에서 이미 열렸다) 라인 범위를 만들지 않는다 — 지워진 라인을
    // 겨누는 지적은 존재할 수 없고, 그 파일에 대한 라인 지정 지적은 `preexisting`이
    // 된다(안전한 쪽).
    if (count <= 0) continue;
    ranges[current].push([start, start + count - 1]);
  }
  return ranges;
}

// assertNotTerminated(opts) — `begin-round`의 기계적 재확인(DD7의 두 번째 배선).
//
// **여기에 git이 필요 없다는 것이 요점이다** — 마커가 이미 기록이므로 재판정이
// 아니라 **조회**다. 판정 함수는 `terminator.decideTermination` 하나이고 이 함수는
// 그것을 부르지 않는다. 같은 계산을 두 곳에서 하지 않으므로 갈릴 자리가 없다.
//
// 커맨드 본문 산문은 절 하나가 건너뛰어질 수 있고 "prose says HALT, code proceeds"가
// 이 저장소에서 세 번 잡혔다. Step 4.5를 건너뛴 루프도 다음 라운드를 열지 못한다.
function assertNotTerminated(opts) {
  // **첫 줄이 kill-switch다.** `off`면 검사를 건너뛰므로 `ledger.beginRound`가 그대로
  // 실행되고, **그 함수의 기존 허용 분기가 이미 `state.terminated = null`을
  // 수행한다**(ledger.js — 캡 상향으로 루프를 재개할 때의 마커 clear). 즉 마커 삭제
  // 코드는 새로 만들지 않는다. 이것이 DD7의 재개 경로를 성립시키는 유일한 코드다.
  if (terminator.parseTerminator(opts.env) === 'off') {
    errln(terminator.ENV_TERMINATOR + '=off — begin-round termination precheck skipped. ' +
      'A recorded patch_chasing marker will NOT stop this round, and ledger.beginRound ' +
      'clears it when the round opens.');
    return;
  }
  const state = ledger.read(opts);
  const t = state.terminated;
  if (!t || t.reason !== terminator.EXIT_REASON.PATCH_CHASING) return;
  // **결속되지 않은 마커는 종료가 아니다.** 그러지 않으면 "언젠가 종료했다"는 영구
  // 낙인이 되어, 캡이 상향돼 라운드가 더 열린 뒤에도 마커가 종료를 계속 주장한다.
  if (t.rounds !== state.rounds.length) return;
  throw new SantaCliError('SANTA_TERMINATED',
    'the loop was terminated as `' + terminator.EXIT_REASON.PATCH_CHASING + '` after round ' +
    (t.rounds - 1) + ' (marker bound to ' + t.rounds + ' round(s), recorded at ' + t.at + ').\n' +
    '  Every surviving blocking issue of that round targeted the previous round\'s patch, ' +
    'so another round would chase the patch rather than the artifact.\n' +
    '  No round was opened and the cap was NOT consumed.\n' +
    '  If you disagree with that judgement, re-run with ' + terminator.ENV_TERMINATOR +
    '=off — begin-round then opens the round and clears the marker.');
}

// cmdCheckTermination — Step 4.5. 라운드 N의 verdict 직후, Step 5 수정 사이클
// **이전**에 판정한다. 여기서 발화하면 운영자는 헛수고를 한 번 덜 한다.
//
// **exit은 항상 0이다** — 이 명령은 판정을 *보고*하는 것이고, 커맨드 본문이 stdout의
// `terminate` 불리언에 분기한다. 비영점을 쓰면 "종료됨"이 오류로 읽혀 Step 4.5의
// 다른 실패와 구별되지 않는다.
function cmdCheckTermination(args) {
  const opts = baseOpts(args);
  // 원장을 **한 번만** 읽는다(M2 DD10과 같은 이유 — 읽기에는 lock이 없다).
  const state = ledger.read(opts);
  const round = lastFinalRound(state);
  const mode = terminator.parseTerminator(opts.env);

  if (round === null) {
    // 판정할 FINAL 라운드가 없다. `decideTermination`의 `round < minRound` 항과 같은
    // 미발화이지만 사유를 구별해 둔다 — 입력이 아예 없는 것과 라운드가 이른 것은
    // 운영자에게 다른 뜻이다.
    out({
      terminate: false, exitReason: null, reason: 'no-final-round', round: null,
      targetsBreakdown: { round_n_patch: 0, preexisting: 0, unknown: 0 },
      classified: [], unresolved: [],
    });
    return EX_OK;
  }

  const folded = adjudication.foldEntries(state.entries);
  const decided = decideFor(state, round, opts, folded);
  // 캡이 이미 끝낼 run을 terminator가 자기 공으로 가져가지 않는다(DD5의 정직성 항).
  const capAllows = counter.decideRound({
    roundsSoFar: state.rounds.length, cap: state.cap,
  }).allowed;

  const patchRanges = patchRangesFrom(args['prev-fix-rev'], opts);
  const decision = terminator.decideTermination({
    mode: mode,
    round: round,
    minRound: terminator.MIN_ROUND,
    effectiveBlocking: decided.blocking,
    patchRanges: patchRanges,
    capAllowsAnotherRound: capAllows,
  });

  // **미발화 원인을 진단으로 남긴다.** `locations`가 선택 필드인 이상 미발화가
  // *설계상 정상 경로*와 *리뷰어 미준수* 둘 다에서 나오는데, 그 둘을 구별하지 못하면
  // 종료가 관측되지 않은 이유가 사후에 진단 불가가 된다. 카운트는 판정을 바꾸지
  // 않는 계측이고(DD5의 AND는 무변경), 바꾸는 것은 그 이유가 기록에 남는다는 것뿐이다.
  //
  // **부분 `unknown`에서는 침묵한다** — 그것은 정상 미발화다.
  if (decided.blocking.length > 0 &&
      decision.targetsBreakdown.unknown === decided.blocking.length) {
    errln('all ' + decided.blocking.length + ' effective blocking issue(s) of round ' + round +
      ' classified `unknown` — the terminator had nothing to compare. Either the reviewers ' +
      'emitted no `locations`, or --prev-fix-rev produced no patch ranges. This is NOT the ' +
      'same as "the loop has not converged yet": the judgement never ran.');
  }

  // **판정에 쓴 좌표를 함께 넘긴다** (PR-Codex R1 F1 흡수). 위 `read()`에는 lock이
  // 없으므로 판정과 봉인 사이에 다른 프로세스가 `begin-round`로 라운드를 열 수 있고,
  // 좌표가 없으면 마커가 **평가된 적 없는** 라운드에 결속된다. `terminate`는 lock
  // 안에서 좌표를 재확인하고 어긋나면 쓰지 않는다.
  let staleDecision = false;
  if (decision.terminate) {
    const sealed = ledger.terminate({
      reason: decision.exitReason,
      expectedRounds: state.rounds.length,
      expectedRound: round,
    }, opts);
    // 거부됐는데 stdout이 `terminate:true`를 그대로 실으면 커맨드 본문이 **일어나지
    // 않은 종료**를 escalate하고 seal을 돌린다. 그래서 보고는 실제 write를 따른다.
    if (sealed && sealed.stale) {
      staleDecision = true;
      errln('termination NOT sealed: the decision was computed from round ' + round +
        ' of ' + state.rounds.length + ' round(s), but under the lock the ledger showed ' +
        'last-final=' + sealed.lastFinalRound + ' of ' + sealed.rounds + ' — it moved in ' +
        'between. Nothing was written and the loop continues; the next round re-judges ' +
        'on the current state.');
    }
  }

  out({
    terminate: decision.terminate && !staleDecision,
    exitReason: staleDecision ? null : decision.exitReason,
    reason: staleDecision ? 'stale-decision' : decision.reason,
    round: round,
    targetsBreakdown: decision.targetsBreakdown,
    classified: decision.classified,
    unresolved: decision.unresolved,
  });
  return EX_OK;
}

function cmdBeginRound(args) {
  const opts = baseOpts(args);
  assertAdjudicationCoverage(opts);
  // **`assertAdjudicationCoverage` 뒤, `ledger.beginRound` 이전이다**(DD7). 순서가
  // 뒤가 아니라 앞이면 판정 미완료 루프가 종료 메시지를 받아 진단이 틀린다.
  assertNotTerminated(opts);
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

// cmdLanes — Step 3 진입 직전. 레인을 배정하고 블라인드 프롬프트를 조립한다.
//
// **프롬프트 조립을 CLI가 하는 이유는 위조 비용 때문이다**(DD4). 커맨드 본문이
// 조립하면 정직한 경로와 위조 경로의 비용이 같아진다 — 여기서 내주면 정직한 경로가
// 가장 싼 경로가 된다.
//
// 스코프는 **정하지 않고 받는다**(DD11). `--paths-file`을 만드는 주체는
// `santa-loop.md` Step 1이다. CLI가 정하기 시작하면 M2의 상시 스코프와 결정 지점이
// 둘이 된다.
//
// **어떤 실패에서도 stdout에 부분 JSON을 내지 않는다** — 호출자가 그것을 파싱하면
// 절반만 성립한 배정으로 리뷰어를 띄우게 된다. 그래서 out()은 전 검증 통과 후 1회다.
function cmdLanes(args) {
  const opts = baseOpts(args);
  const repoRoot = repoRootOrThrow(opts.cwd);

  // --paths-file 은 **필수**다. 선택으로 두면 부재 시 targetPaths=[] 인 프롬프트가
  // 나가고, 그것은 "저장소 루트만 알고 대상은 모르는" 리뷰어 — UI4가 주라고 한 것을
  // 주지 않은 상태이고 PRD Risk 1(스코프를 못 찾아 헛돈다)이 그 자리에서 발화한다.
  const pathsFile = args['paths-file'];
  if (typeof pathsFile !== 'string' || pathsFile === '') {
    throw new SantaCliError('SANTA_USAGE',
      '--paths-file <path> is required (JSON array of repo-relative paths, written by ' +
      'santa-loop.md Step 1). A blind reviewer without target paths violates UI4.');
  }
  const targetPaths = readJsonStringArray(pathsFile, opts, '--paths-file');
  if (targetPaths.length === 0) {
    throw new SantaCliError('SANTA_USAGE',
      '--paths-file resolved to an empty array — there is nothing to review. ' +
      'A blind prompt with no target paths is not a reduced scope, it is a broken one.');
  }

  let rubric = null;
  const rubricFile = args['rubric-file'];
  if (typeof rubricFile === 'string' && rubricFile !== '') {
    assertContained(ledger.canonicalPath(rubricFile), ledger.canonicalPath(repoRoot), null);
    const st = fs.statSync(rubricFile);
    if (st.size > MAX_REVIEWER_BYTES) {
      throw new SantaCliError('SANTA_USAGE',
        '--rubric-file is ' + st.size + ' bytes (max ' + MAX_REVIEWER_BYTES + ')');
    }
    rubric = fs.readFileSync(rubricFile, 'utf8');
  }

  const mode = lanes.parseBlindLane(opts.env);
  const assignment = lanes.assignLanes({ mode: mode, ids: undefined });
  const blindIds = lanes.blindIdsFrom(assignment);

  // DD2가 블라인드 ≤ 1을 보장하므로 "유일한 id"가 성립한다. 2개가 나오면 그것은
  // oracle 결함이고, 그 상태로 진행하면 UI6이 경계한 전원 블라인드에 도달한다.
  if (blindIds.length > 1) {
    throw new SantaCliError('SANTA_LANE_MISMATCH',
      'assignLanes returned ' + blindIds.length + ' blind ids (' + blindIds.join(',') +
      ') for mode "' + mode + '" — DD2 guarantees at most one. This is an oracle defect; ' +
      'refusing to emit an assignment that would put every reviewer on the blind lane.');
  }

  // `off`에는 블라인드가 없으므로 blindId는 **빈 문자열**이다(null이 아니다) —
  // 커맨드 본문이 문자열 비교를 하므로 타입이 갈리면 비교가 조용히 어긋난다.
  // prompt도 같은 이유로 빈 문자열이다: 배정된 블라인드가 없는데 프롬프트를 내면
  // 호출자가 그것을 쓸 자리가 생긴다.
  const blindId = blindIds.length === 1 ? blindIds[0] : '';
  const prompt = blindId === '' ? '' : lanes.buildBlindPrompt({
    repoRoot: repoRoot, targetPaths: targetPaths, rubric: rubric,
  });

  out({ assignment: assignment, blindId: blindId, prompt: prompt });
  return EX_OK;
}

// santa-evidence-diversity M2 — 상시 스코프 발견.
//
// **발견은 여기가 소유한다**(implement-gate 2.5.2 결정 3). `scope-always.js`는 fs를
// 모르는 순수 oracle이라 `mergeScope`가 내는 것은 `{paths, added, truncated}` 3키뿐이고,
// `pairs`·`unresolved`·`mode`·`rubricRow`를 붙여 7키 출력을 만드는 자리는 CLI다.
//
// **도출된 경로에는 `assertContained`를 쓰지 않는다.** 그 함수는 `fs.realpathSync`
// 실패를 전부 `PATH_ESCAPES_GATE`로 던지므로(path-containment.js:30-36), 단순 부재도
// exit 2가 되어 "해소 불가 포인터는 드롭하되 라운드를 막지 않는다"(DD4)와 정면으로
// 충돌한다. 대신 두 방어를 나눠 건다:
//   1. 문자열 이탈 거부 — oracle의 `toRepoRelative`가 `..`·절대경로·NUL을 이미 접었다
//   2. 심볼릭 링크 이탈 + 존재 확인 — 아래 `resolveInRepo`가 **던지지 않고** 판정한다
// 필수 입력(`--paths-file`)은 기존 `assertContained`를 그대로 쓴다 — 그쪽은 부재가 곧
// 오류다.
function resolveInRepo(repoRoot, rel) {
  const abs = path.resolve(repoRoot, rel);
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch (err) {
    return { ok: false, reason: 'not-found (' + (err && err.code ? err.code : 'ERR') + ')' };
  }
  // realpath 후에 판정한다 — 링크가 저장소 밖을 가리키면 여기서만 드러난다. 이 경로는
  // 블라인드 리뷰어가 자기 도구로 읽을 대상이 되므로, 통과시키면 저장소 밖 파일 내용이
  // 프롬프트 대상이 된다.
  const realRoot = (function () {
    try { return fs.realpathSync(repoRoot); } catch (_) { return repoRoot; }
  }());
  if (real !== realRoot && real.indexOf(realRoot + path.sep) !== 0) {
    return { ok: false, reason: 'resolves outside the repository' };
  }
  let st;
  try { st = fs.statSync(real); } catch (_) { return { ok: false, reason: 'not-found' }; }
  if (!st.isFile()) return { ok: false, reason: 'not a regular file' };
  return { ok: true, size: st.size };
}

// `<slug>*.plan.md` 후보를 비재귀로 연다. `archived/` 는 디렉토리라 `.plan.md` 접미사
// 필터에서 자연히 빠진다(CLAUDE.md §3.11 — 아카이브된 plan은 활성 검토 대상이 아니다).
//
// glob 라이브러리를 쓰지 않는다. slug은 `SLUG_RE`(`/^[a-z0-9][a-z0-9-]{0,80}$/`)를 이미
// 통과했으므로 메타문자가 없지만, `readdirSync` + 리터럴 `startsWith`는 주입 클래스를
// **설계로** 없앤다 — 검증에 의존하지 않는 쪽이 싸다(implement-gate security review 4).
const ALWAYS_PLAN_DIRS = [
  path.join('.claude', 'plans'),
  path.join('.claude', 'PRPs', 'plans'),
];

function discoverSlugPlans(repoRoot, slug) {
  const found = [];
  ALWAYS_PLAN_DIRS.forEach(function (rel) {
    let names;
    try { names = fs.readdirSync(path.resolve(repoRoot, rel)); } catch (_) { return; }
    names.sort();
    names.forEach(function (name) {
      if (name.indexOf(slug) !== 0) return;
      if (name.slice(-'.plan.md'.length) !== '.plan.md') return;
      found.push(rel.split(path.sep).join('/') + '/' + name);
    });
  });
  return found;
}

// 정규화에 실패해 스코프에서 빠진 입력 경로를 stderr로 표면화한다(code-review M4).
//
// JSON 계약(7키)은 건드리지 않는다 — 이것은 `truncated`처럼 정상 운용에서 나오는 수치가
// 아니라 **호출자 입력이 잘못됐다는 신호**이고, 그 자리는 stdout이 아니라 stderr다.
// 던지지 않는 이유는 `--paths-file`이 이미 형태 검사를 통과했고(비어있지 않은 문자열 배열),
// 남은 실패는 "저장소 밖을 가리킨다" 뿐이라 드롭이 곧 올바른 처리이기 때문이다.
function warnDroppedDiffPaths(dropped) {
  if (!Array.isArray(dropped) || dropped.length === 0) return;
  errln('scope-always dropped ' + dropped.length + ' path(s) that do not normalize to a ' +
    'repo-relative location — they are NOT in the review scope:');
  dropped.forEach(function (p) { errln('  dropped ' + JSON.stringify(p)); });
}

function cmdScopeAlways(args) {
  const opts = baseOpts(args);
  const repoRoot = repoRootOrThrow(opts.cwd);

  // `--paths-file` 은 **필수**다(`cmdLanes` 동형). 선택으로 두면 diff 스코프 없이
  // 상시 항목만 낸 출력이 나오고, 호출자가 그것으로 `SCOPE_PATHS_JSON`을 교체하면
  // 변경 파일이 통째로 스코프에서 사라진다.
  const pathsFile = args['paths-file'];
  if (typeof pathsFile !== 'string' || pathsFile === '') {
    throw new SantaCliError('SANTA_USAGE',
      '--paths-file <path> is required (JSON array of repo-relative paths, the diff ' +
      'scope written by santa-loop.md Step 1). Always-on scope is a merge, not a ' +
      'replacement — without the diff scope there is nothing to merge into.');
  }
  const diffPaths = readJsonStringArray(pathsFile, opts, '--paths-file');

  const mode = scopeAlways.parseAlwaysScope(opts.env);

  // `off`는 스코프 추가와 rubric 행을 **함께** 끈다(DD5 — 한 축이므로 스위치도 하나다).
  // 여기서 즉시 반환하므로 plan 열거도 파일 읽기도 일어나지 않는다: kill switch가
  // 비용까지 끄지 못하면 그것은 절반만 꺼진 것이다.
  //
  // **다만 diff 스코프는 `off`에서도 같은 정규화를 거친다**(code-review M4). 예전에는
  // `diffPaths`를 날것으로 통과시켜, 이탈 형태를 접는 `enforce`와 그대로 두는 `off`가
  // 서로 다른 스코프를 냈다 — kill switch가 *무엇이 검토되는가*를 아무도 선언하지 않은
  // 방향으로 바꾸는 셈이다. `alwaysPaths: []`로 같은 병합을 태우면 두 모드의 차이는
  // 정확히 "상시 항목이 붙는가" 하나로 좁혀진다.
  if (mode === 'off') {
    const passthrough = scopeAlways.mergeScope({ diffPaths: diffPaths, alwaysPaths: [] });
    warnDroppedDiffPaths(passthrough.dropped);
    out({
      mode: mode, paths: passthrough.paths, added: [], pairs: [], unresolved: [],
      rubricRow: '', truncated: 0,
    });
    return EX_OK;
  }

  // 후보 plan = (1) diff 스코프에 이미 있는 `*.plan.md` + (2) `<slug>*.plan.md` 열거.
  // 순서는 diff 우선이고 중복은 뒤에서 제거된다.
  const candidates = [];
  const seenPlan = Object.create(null);
  // **oracle과 같은 규칙으로 접는다**(code-review L2). 예전에는 백슬래시만 바꿔서
  // `./x.plan.md` 같은 표기가 후보로 살아남았고, 그 문자열이 그대로 `pairs[].plan`이
  // 되는데 `paths`·`added`는 `mergeScope`가 정규화한 `x.plan.md`를 담아 같은 파일이 두
  // 표기로 갈렸다. 여기서 접으면 두 필드가 항상 같은 문자열을 쓴다. `null`(이탈 형태)은
  // 애초에 유효한 후보가 아니므로 조용히 버려도 손실이 아니다 — 그 경로가 diff에서
  // 왔다면 `mergeScope`의 `dropped`가 같은 입력을 이미 보고한다.
  function pushPlan(p) {
    const n = scopeAlways.toRepoRelative(p);
    if (n === null) return;
    if (n.slice(-'.plan.md'.length) !== '.plan.md') return;
    if (seenPlan[n]) return;
    seenPlan[n] = true;
    candidates.push(n);
  }
  diffPaths.forEach(pushPlan);
  discoverSlugPlans(repoRoot, opts.decisionId).forEach(pushPlan);

  const pairs = [];
  const unresolved = [];
  const alwaysPaths = [];

  // 후보 자체도 상한을 넘기지 않는다 — 여기서 자르지 않으면 병리적 열거가 파일 읽기
  // 횟수로 그대로 번진다. 잘린 사실은 아래 `truncated`가 아니라 이 목록의 길이로
  // 드러나므로, 상한에 걸린 후보는 `unresolved`에 이유와 함께 남긴다.
  candidates.slice(MAX_ALWAYS_CANDIDATES).forEach(function (planPath) {
    unresolved.push({ plan: planPath, prd: null, reason: 'candidate cap reached (max ' + MAX_ALWAYS_CANDIDATES + ')' });
  });

  candidates.slice(0, MAX_ALWAYS_CANDIDATES).forEach(function (planPath) {
    const planHit = resolveInRepo(repoRoot, planPath);
    if (!planHit.ok) {
      unresolved.push({ plan: planPath, prd: null, reason: 'plan ' + planHit.reason });
      return;
    }
    if (planHit.size > MAX_REVIEWER_BYTES) {
      // 상한 **전에** 읽지 않는다. 이 상한이 Source PRD 정규식이 보는 입력 크기를
      // 묶어 주는 자리이기도 하다(implement-gate security review 3).
      unresolved.push({
        plan: planPath, prd: null,
        reason: 'plan is ' + planHit.size + ' bytes (max ' + MAX_REVIEWER_BYTES + ')',
      });
      return;
    }
    let text;
    try {
      text = fs.readFileSync(path.resolve(repoRoot, planPath), 'utf8');
    } catch (err) {
      unresolved.push({
        plan: planPath, prd: null,
        reason: 'plan unreadable (' + (err && err.code ? err.code : 'ERR') + ')',
      });
      return;
    }

    // plan 자체는 해소됐으므로 스코프에 넣는다 — Source PRD가 없어도 plan은 검토
    // 대상이다(free-form plan은 정상 입력이다, DD4).
    alwaysPaths.push(planPath);

    const prdPath = scopeAlways.sourcePrdFrom(text, { planPath: planPath });
    if (prdPath === null) {
      unresolved.push({ plan: planPath, prd: null, reason: 'no usable **Source PRD** declaration' });
      return;
    }
    const prdHit = resolveInRepo(repoRoot, prdPath);
    if (!prdHit.ok) {
      unresolved.push({ plan: planPath, prd: prdPath, reason: 'Source PRD ' + prdHit.reason });
      return;
    }
    alwaysPaths.push(prdPath);
    pairs.push({ plan: planPath, prd: prdPath });
  });

  const merged = scopeAlways.mergeScope({ diffPaths: diffPaths, alwaysPaths: alwaysPaths });
  warnDroppedDiffPaths(merged.dropped);

  // 전 검증 통과 후 1회만 out() — 부분 JSON을 stdout에 내지 않는다(`cmdLanes` 동형).
  out({
    mode: mode,
    paths: merged.paths,
    added: merged.added,
    pairs: pairs,
    unresolved: unresolved,
    rubricRow: scopeAlways.CONSISTENCY_RUBRIC,
    truncated: merged.truncated,
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
    '           --lane blind|bundled   (required; must match the `lanes` assignment)',
    '  verdict  --round <N>',
    '  adjudicate --round <N> --issue <id> --disposition absorbed|rejected|skipped|reopened',
    '             --evidence <text>   (claim/severity come from the ledger, not from flags)',
    '  lanes    --paths-file <path> [--rubric-file <path>]',
    '             (assignment/blindId/prompt on stdout; blindId is "" when lane=off)',
    '  scope-always --paths-file <path>',
    '             (mode/paths/added/pairs/unresolved/rubricRow/truncated on stdout;',
    '              `off` passes the diff scope through and reads no plan file)',
    '  check-termination [--prev-fix-rev <rev>]',
    '             (always exits 0 — branch on stdout `terminate`, not on the exit code)',
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
      case 'lanes': return cmdLanes(args);
      case 'scope-always': return cmdScopeAlways(args);
      case 'check-termination': return cmdCheckTermination(args);
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
  // santa-adjudication M3 — hunk 추출은 CLI 계층에 산다(순수 oracle은 git을 모른다).
  // export하는 이유는 항목 68이 **진짜 `git show` 출력**으로 이 파서를 재기 때문이다 —
  // 합성 diff 문자열은 내가 쓴 파서를 내가 쓴 입력으로 재는 것이다.
  patchRangesFrom: patchRangesFrom,
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
