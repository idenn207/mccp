'use strict';

// review-single-pass — 단일통과 토글의 단일 판정 지점 (review-loop-bypass M1).
//
// 세 게이트(plan · prp-implement · pr)가 공유하는 파서다. 판정 함수들은 env를
// 모르고 이 모듈만 안다(DD3a) — `decideReview`가 `process.env`를 읽기 시작하면
// 순수 오라클이 아니게 되고, 그 순간 완화 경계를 단위 test로 고정할 수 없다.
//
// **두 파서의 불량값 처리 방향이 서로 반대인 것은 의도적이다.**
//   parseSinglePass — 불량값은 *비활성*(fail-closed). 오타가 게이트를 열면 안 된다(UI3).
//   parseRoundCap   — 불량값은 *기본 캡*(fail-open).  오타가 라운드를 무한히 열면 안 된다.
// 둘 다 "오타는 권한을 늘리지 못한다"는 한 규칙의 서로 다른 얼굴이다. 방향을 반대로
// 잡으면 각각 조용한 우회와 무한 라운드가 된다.
//
// mirror: santa/gate.js:138 `parseSeverityGate`(열거 검사 + 불량값 loud warn) ·
//         santa/counter.js:31 `parseCap`(범위 검사 + 불량값 loud fail-open)

const fs = require('fs');
const path = require('path');

const ENV_SINGLE_PASS = 'MCCP_REVIEW_SINGLE_PASS';

// 사유는 토글의 **값 자체**다. 별도 사유 변수를 두면 잊을 수 있고, 잊힌 사유는
// 감사 불가다 — 토글을 켜는 행위와 사유를 대는 행위가 같은 동작이어야 한다(PRD).
const REASONS = Object.freeze([
  'scope_too_small',
  'deadline_pressure',
  'deferred_to_prd_completion',
]);

const ENV_ROUND_CAP = 'MCCP_GATE_ROUND_CAP';
const DEFAULT_ROUND_CAP = 1;
const MIN_ROUND_CAP = 1;
const MAX_ROUND_CAP = 3;

function warn(line) {
  process.stderr.write('[mccp:single-pass] ' + line + '\n');
}

// parseSinglePass(env) → { active, reason, rejected }
//
// 미설정/빈 값은 **조용히** 비활성이다 — 토글이 꺼진 것은 정상 상태이지 경고할
// 사건이 아니다. 열거 밖 값만 loud warn을 내고 원문을 `rejected`에 보존한다.
//
// **대소문자를 구분한다**(gate.js:138 규약). 이 값은 receipt에 그대로 봉인되므로
// 정규화하면 서로 다른 입력이 같은 필드를 채우고, 감사에서 무엇이 설정됐는지
// 되짚을 수 없게 된다.
function parseSinglePass(env) {
  const raw = env && env[ENV_SINGLE_PASS];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { active: false, reason: null, rejected: null };
  }
  const v = String(raw).trim();
  if (REASONS.indexOf(v) === -1) {
    warn(ENV_SINGLE_PASS + ' must be one of [' + REASONS.join('|') + ']; got "' + raw +
      '". Treating the toggle as OFF (fail-closed) — a typo must not become a ' +
      'silent bypass.');
    return { active: false, reason: null, rejected: String(raw) };
  }
  return { active: true, reason: v, rejected: null };
}

// parseRoundCap(env) → [MIN_ROUND_CAP..MAX_ROUND_CAP] 정수.
//
// `counter.js:31`의 실패 규약을 그대로 미러한다 — 같은 저장소의 env 파서 둘이
// 서로 다르게 실패하면 운영자가 어느 쪽 규칙을 기억해야 하는지 알 수 없다.
function parseRoundCap(env) {
  const raw = env && env[ENV_ROUND_CAP];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_ROUND_CAP;
  }
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < MIN_ROUND_CAP || n > MAX_ROUND_CAP) {
    warn(ENV_ROUND_CAP + ' must be an integer in [' + MIN_ROUND_CAP + '..' +
      MAX_ROUND_CAP + ']; got "' + raw + '". Falling back to default ' +
      DEFAULT_ROUND_CAP + '.');
    return DEFAULT_ROUND_CAP;
  }
  return n;
}

// effectiveRoundCap(env) → { cap, pinned, reason }
//
// 토글이 켜지면 `MCCP_GATE_ROUND_CAP`의 값과 **무관하게** 1이다(PRD Open
// Question 2의 답). 근거는 토글이 상위 정책 선언이고 캡은 그 아래 조정값이라는
// 것 — 정책이 "단일 통과"라고 말했는데 조정값이 3라운드를 여는 것은 정책을
// 조정값이 뒤집는 형태다.
//
// `pinned`/`reason`은 stderr 진단 전용이다. 셸 호출자가 export하는 것은 `.cap`
// 하나뿐이므로, 이 둘이 없으면 캡이 왜 1인지가 로그 어디에도 남지 않는다.
function effectiveRoundCap(env) {
  const sp = parseSinglePass(env);
  if (sp.active) {
    return { cap: MIN_ROUND_CAP, pinned: true, reason: sp.reason };
  }
  return { cap: parseRoundCap(env), pinned: false, reason: null };
}

// ── assert-single-round ───────────────────────────────────────────────────────
//
// UI5("R0만 돌고 R1 이상은 없다")를 기계로 반증 가능하게 만드는 측정 도구다.
//
// **두 가지를 함께 단언한다.** `halt_stage`만으로는 부족하다 — 그 값은 *마지막*
// 실행 상태만 담고 리뷰 기록은 매 실행 덮어쓰기되므로, L2를 두 번 dispatch하고
// 둘 다 block:false면 두 경우가 구분되지 않는다. dispatch 로그가 그 구분을 준다.
//
// 로그는 **순수 append-only**이고 어떤 경로에서도 purge하지 않는다. 진입 purge를
// 두면 HALT 후 재발화가 자기 흔적을 지워 `round_index:0` 한 건만 남기고, 그
// 실행이 성공하면 `halt_stage`도 null이라 실제 2라운드가 단일 라운드로 오인된다
// — 측정을 강화한다며 넣은 축이 측정을 무력화하는 형태다.
//
// plan hash로 keying하면 별도 nonce 수명 관리 없이 두 경우가 갈린다: 같은 본문에
// 대한 재발화는 같은 hash 그룹에 누적돼 단언이 반드시 실패하고, 흡수로 본문이
// 바뀐 뒤의 새 시도는 새 hash 그룹에서 0부터 시작한다.
//
// **exit 0은 오직 하나의 경우에만 낸다** — 아래 `ok()`에 도달하는 단일 경로다.
// 그 밖의 모든 입력은 각각 구분되는 진단과 함께 exit 1이다. 측정 도구가 불량
// 입력에 fail-open하면 "측정이 통과했다"와 "측정이 아예 안 됐다"를 구분하지
// 못해 Acceptance가 공허해진다.

const DISPATCH_LOG_DIR = path.join('.claude', 'state', 'plan-review');

function dispatchLogPathFor(recordAbs) {
  // 기록은 `<root>/.claude/reviews/plan-review-<slug>.md`이므로 root는 두 단계 위다.
  // 로그 경로를 cwd가 아니라 **기록 경로에서** 도출하는 이유는, 두 아티팩트가 같은
  // 저장소의 같은 실행을 가리키도록 결속하기 위해서다.
  const slug = path.basename(recordAbs).replace(/^plan-review-/, '').replace(/\.md$/, '');
  const root = path.resolve(path.dirname(recordAbs), '..', '..');
  return { slug: slug, logPath: path.join(root, DISPATCH_LOG_DIR, 'dispatch-log-' + slug + '.jsonl') };
}

// 리뷰 기록에서 Measurement 블록(`## Measurement` 뒤 첫 ```json fence)을 꺼낸다.
function extractMeasurement(markdown) {
  const idx = markdown.indexOf('\n## Measurement');
  if (idx === -1) return { ok: false, reason: 'no "## Measurement" section' };
  const rest = markdown.slice(idx);
  const m = /```json\r?\n([\s\S]*?)```/.exec(rest);
  if (!m) return { ok: false, reason: 'no ```json fence under "## Measurement"' };
  let parsed;
  try {
    parsed = JSON.parse(m[1]);
  } catch (e) {
    return { ok: false, reason: 'Measurement JSON parse failed: ' + (e && e.message ? e.message : String(e)) };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'Measurement block is not a JSON object' };
  }
  return { ok: true, measurement: parsed };
}

function assertSingleRound(recordPath) {
  const fail = function (line) {
    process.stderr.write('[mccp:single-pass] assert-single-round FAIL — ' + line + '\n');
    return 1;
  };

  if (typeof recordPath !== 'string' || recordPath.trim() === '') {
    return fail('usage: review-single-pass.js assert-single-round <review-record.md>');
  }
  const recordAbs = path.resolve(recordPath);

  let markdown;
  try {
    markdown = fs.readFileSync(recordAbs, 'utf8');
  } catch (e) {
    return fail('cannot read the review record at ' + recordAbs + ' (' +
      (e && e.code ? e.code : String(e)) + ') — 리뷰 기록이 없으면 라운드 수를 알 수 없다');
  }

  const mx = extractMeasurement(markdown);
  if (!mx.ok) {
    return fail(mx.reason + ' in ' + recordAbs);
  }
  const measurement = mx.measurement;

  // 키 **부재**와 명시적 null은 다르다. 부재는 기록기가 그 축을 쓰지 않았다는
  // 뜻이라 판독 실패이고, null이 "halt 없이 완주했다"는 관측이다.
  if (!Object.prototype.hasOwnProperty.call(measurement, 'halt_stage')) {
    return fail('Measurement block has no `halt_stage` key — 판독할 수 없는 기록이다');
  }
  if (measurement.halt_stage !== null) {
    return fail('halt_stage = ' + JSON.stringify(measurement.halt_stage) +
      ' (기대 null) — 게이트가 그 단계에서 멈췄으므로 재발화가 요구된 실행이다');
  }

  const wantHash = measurement.reviewed_plan_hash;
  if (typeof wantHash !== 'string' || wantHash === '') {
    return fail('Measurement block has no usable `reviewed_plan_hash` — dispatch 로그를 ' +
      '어느 plan 본문으로 keying해야 하는지 알 수 없다');
  }

  const d = dispatchLogPathFor(recordAbs);
  let logText;
  try {
    logText = fs.readFileSync(d.logPath, 'utf8');
  } catch (e) {
    return fail('cannot read the dispatch log at ' + d.logPath + ' (' +
      (e && e.code ? e.code : String(e)) + ') — L2가 발화했다면 5.2c가 한 줄을 ' +
      'append했어야 한다. 로그 부재는 통과 근거가 아니다');
  }

  const entries = [];
  const malformed = [];
  logText.split(/\r?\n/).forEach(function (line, i) {
    if (line.trim() === '') return;
    try {
      const o = JSON.parse(line);
      if (o !== null && typeof o === 'object' && !Array.isArray(o)) entries.push(o);
      else malformed.push(i + 1);
    } catch (_) {
      malformed.push(i + 1);
    }
  });
  if (malformed.length > 0) {
    return fail('dispatch log has unparsable line(s) at ' + malformed.join(',') +
      ' in ' + d.logPath + ' — 판독 불가한 로그로는 라운드 수를 셀 수 없다');
  }

  const mine = entries.filter(function (o) { return o.reviewed_plan_hash === wantHash; });
  if (mine.length === 0) {
    return fail('dispatch log has 0 entries for reviewed_plan_hash ' + wantHash.slice(0, 19) +
      '… (' + entries.length + ' entries for other plan versions) — 이 본문에 대한 ' +
      'dispatch 기록이 없다');
  }
  if (mine.length > 1) {
    return fail('dispatch log has ' + mine.length + ' entries for reviewed_plan_hash ' +
      wantHash.slice(0, 19) + '… — 같은 본문이 두 번 이상 심사받았다 (UI5 위반)');
  }
  if (mine[0].round_index !== 0) {
    return fail('the single dispatch entry has round_index = ' +
      JSON.stringify(mine[0].round_index) + ' (기대 0) — R0이 아닌 라운드가 열렸다');
  }

  process.stdout.write('OK: single L2 dispatch (round_index 0) for ' +
    wantHash.slice(0, 19) + '… and halt_stage is null\n');
  return 0;
}

function main(argv) {
  const sub = argv[0];
  if (sub === 'assert-single-round') {
    return assertSingleRound(argv[1]);
  }
  process.stderr.write('[mccp:single-pass] unknown subcommand ' + JSON.stringify(sub || '') +
    '\n  usage: review-single-pass.js assert-single-round <review-record.md>\n');
  return 2;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  parseSinglePass: parseSinglePass,
  parseRoundCap: parseRoundCap,
  effectiveRoundCap: effectiveRoundCap,
  assertSingleRound: assertSingleRound,
  // M2 — `assert-backlog-parity`가 같은 Measurement 블록을 읽는다. 두 번째
  // 파서를 쓰면 한쪽이 읽는 형식을 다른 쪽이 못 읽는 순간 두 단언이 서로 다른
  // 기록을 검사하게 된다.
  extractMeasurement: extractMeasurement,
  ENV_SINGLE_PASS: ENV_SINGLE_PASS,
  ENV_ROUND_CAP: ENV_ROUND_CAP,
  REASONS: REASONS,
  DEFAULT_ROUND_CAP: DEFAULT_ROUND_CAP,
  MIN_ROUND_CAP: MIN_ROUND_CAP,
  MAX_ROUND_CAP: MAX_ROUND_CAP,
};
