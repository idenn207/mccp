'use strict';

// santa-delta-review M1 Task 6(a2 · c) — 배선·순서의 **정적** 단언.
//
// 이 파일이 잡는 것은 **배선 누락과 위치 drift**이지 산문 불이행이 아니다
// (`review-single-pass-command-body.test.js`가 같은 천장을 갖는다). 셸이 실제로
// 무엇을 했는지는 라이브 실행(Task 10)이 덮고, 여기서는 "그 줄이 그 자리에 있는가"만
// 기계적으로 고정한다 — 그리고 그것이 없으면 결함이 라이브 실행에서야 드러난다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const CLI_PATH = path.join(__dirname, '..', 'santa', 'cli.js');
// __dirname = plugins/mccp/scripts/lib/tests → 셋 위가 plugins/mccp.
const BODY_PATH = path.join(__dirname, '..', '..', '..', 'commands', 'santa-loop.md');

const CLI_SRC = fs.readFileSync(CLI_PATH, 'utf8');
const BODY = fs.readFileSync(BODY_PATH, 'utf8');

// ── (a2) dispatch ↔ usage 동기 ───────────────────────────────────────────────
//
// `runCli`의 switch만 갱신하고 `usage()`를 잊으면 **모든 단위 test가 통과하고** 결함은
// 라이브 실행에서야 드러난다. 지금 기계화 가능한 것을 라이브에 미루는 것은 plan이 스스로
// 적은 "단위 test 통과 ≠ 경로 작동"의 용법이 아니다.
//
// **`scope-delta` 한 건만 검사하지 않는다.** 한 건만 pin하면 다음 하위명령이 같은
// 방식으로 새고, 두 집합의 동일성은 지금 전부 성립하므로 양방향으로 걸 수 있다.

function dispatchSubcommands(src) {
  const out = new Set();
  const re = /case\s+'([a-z][a-z0-9-]*)':\s*return\s+cmd/g;
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[1]);
  return out;
}

function usageSubcommands(src) {
  // `usage()` 본문의 배열 리터럴만 본다. 하위명령 줄은 정확히 2칸 들여쓰기로
  // 시작하고, 이어지는 설명 줄은 그보다 깊다(그 규약이 이 추출의 계약이다).
  const start = src.indexOf('function usage()');
  assert.notEqual(start, -1, 'usage() 함수를 찾지 못했다');
  const end = src.indexOf('\nfunction ', start + 1);
  const body = src.slice(start, end === -1 ? undefined : end);
  const out = new Set();
  const re = /^\s*'{2}\s{2}([a-z][a-z0-9-]*)/gm;
  let m;
  // 위 정규식은 `'  name'` 형태를 노린다 — 배열 원소는 따옴표로 시작하므로
  // 실제 형태는 `    '  resolve-decision',` 이다.
  const lineRe = /^\s*'\s{2}([a-z][a-z0-9-]*)/gm;
  while ((m = lineRe.exec(body)) !== null) out.add(m[1]);
  void re;
  return out;
}

test('a2 — runCli dispatch 집합과 usage() 열거가 양방향으로 같다', () => {
  const dispatch = dispatchSubcommands(CLI_SRC);
  const usage = usageSubcommands(CLI_SRC);

  assert.ok(dispatch.size >= 10, 'dispatch 추출이 퇴화했다 (' + dispatch.size + '건)');
  assert.ok(usage.size >= 10, 'usage 추출이 퇴화했다 (' + usage.size + '건)');

  const missingFromUsage = [...dispatch].filter(function (s) { return !usage.has(s); });
  const missingFromDispatch = [...usage].filter(function (s) { return !dispatch.has(s); });

  assert.deepEqual(missingFromUsage, [],
    'dispatch에는 있는데 usage()가 안 알리는 하위명령: ' + missingFromUsage.join(', '));
  assert.deepEqual(missingFromDispatch, [],
    'usage()는 알리는데 dispatch에 없는 하위명령: ' + missingFromDispatch.join(', '));
});

test('a2 — scope-delta가 실제로 그 두 집합에 들어 있다 (대조군)', () => {
  // 위 단언이 "양쪽 다 비었다"로 퇴화하지 않았음을 보이는 대조군이다.
  assert.ok(dispatchSubcommands(CLI_SRC).has('scope-delta'));
  assert.ok(usageSubcommands(CLI_SRC).has('scope-delta'));
});

// ── (c) 커맨드 본문 배선 ─────────────────────────────────────────────────────

// 본문에서 각 호출이 나타나는 첫 위치. 순서 단언의 재료다.
function at(needle) {
  const i = BODY.indexOf(needle);
  assert.notEqual(i, -1, '본문에 없다: ' + needle);
  return i;
}

// **DD2 — 이 순서가 UI4의 면제다.** 특례 분기가 아니라 순서로 성립하므로, 순서가
// 뒤집히면 상시 항목이 축소 대상이 되고 그것을 막던 것이 사라진다.
test('c — scope-delta 호출이 scope-always 호출보다 앞에 있다 (DD2)', () => {
  assert.ok(at('" scope-delta --decision') < at('" scope-always --decision'),
    'scope-always가 먼저 불리면 상시 항목이 축소 대상이 된다');
});

// 초기 구현에서 실제로 발생한 결함이라 test로 고정한다: `scope-always`에 원본
// `scope-diff.json`을 넘기면 축소가 **같은 호흡에 되돌려진다** — exit 0이고,
// 관측 라인은 여전히 성립하지 않는 축소를 보고한다.
test('c — scope-always는 좁혀진 스코프 파일을 받는다 (원본 diff가 아니다)', () => {
  const alwaysCall = BODY.slice(at('" scope-always --decision'), at('" scope-always --decision') + 200);
  assert.match(alwaysCall, /scope-narrowed\.json/,
    'scope-always가 scope-diff.json을 받으면 델타가 즉시 무효화된다');
  assert.equal(/scope-always --decision "\$DECISION" \\\s*\n\s*--paths-file "\$TMPDIR_SANTA\/scope-diff\.json"/.test(BODY), false);
});

test('c — lanes 호출에 --ranges-file이 배선돼 있다', () => {
  assert.match(BODY, /RANGES_FLAG="--ranges-file \$TMPDIR_SANTA\/delta-ranges\.json"/);
  const lanesCall = BODY.slice(at('" lanes --decision'), at('" lanes --decision') + 260);
  assert.match(lanesCall, /\$RANGES_FLAG/, 'lanes 호출이 RANGES_FLAG를 쓰지 않는다');
});

test('c — begin-round에 --scope-* 스칼라 4종이 배선돼 있다 (JSON 파일이 아니다)', () => {
  assert.match(BODY, /--scope-applied \$DELTA_APPLIED/);
  assert.match(BODY, /--scope-before \$DELTA_BEFORE/);
  assert.match(BODY, /--scope-after \$DELTA_AFTER/);
  assert.match(BODY, /--scope-reason \$DELTA_REASON/);
  const beginCall = BODY.slice(at('" begin-round --decision'), at('" begin-round --decision') + 120);
  assert.match(beginCall, /\$SCOPE_FLAGS/);
  // 계측이 JSON 파일로 되돌아가면 CRITICAL-1의 prototype-pollution 경로가 다시 열린다.
  assert.equal(/--scope-file/.test(BODY), false,
    '--scope-file은 원장에 durable하게 앉는 JSON 파싱 경로다 — 스칼라로 남아야 한다');
});

test('c — --scope-reason은 applied=false일 때만 붙는다', () => {
  assert.match(BODY, /if \[ "\$DELTA_APPLIED" = "false" \] && \[ -n "\$DELTA_REASON" \]/);
});

test('c — 델타 관측 stderr 라인이 매 실행 발화한다 (0건 라운드가 미도입과 구별된다)', () => {
  assert.match(BODY, /\[santa\] delta scope: mode=/);
  // before -> after 가 실제 수치로 실려야 관측이 성립한다.
  assert.match(BODY, /j\.before\+"->"\+j\.after/);
});

test('c — scope-delta 실패는 전체 스코프로 강등되지 않고 정지한다 (DD3 동형)', () => {
  const block = BODY.slice(at('DELTA_EXIT=$?'), at('DELTA_EXIT=$?') + 500);
  assert.match(block, /NOT launching reviewers/);
  assert.match(block, /exit "\$DELTA_EXIT"/);
});

test('c — 3상태 파싱 검사가 델타에도 걸린다 (absent를 정상 0으로 읽지 않는다)', () => {
  assert.match(BODY, /DELTA_STATE=/);
  assert.match(BODY, /scope-delta exited 0 but emitted no usable paths array/);
});

// 번들 레인은 프롬프트가 산문이라 구조로 막을 수 없다 — 그래서 지시가 본문에 한 번
// 명시돼야 하고, 이 단언이 그것이 사라지지 않게 한다.
test('c — 번들 레인 지시가 범위만 말하고 이전 라운드 상태를 말하지 않는다 (UI2)', () => {
  assert.match(BODY, /Bundled lane on a delta round/);
  assert.match(BODY, /hands out a \*scope\*, never a \*status\*/);
});

test('c — Notes에 델타 축 6항목이 있다 (천장 서술 + M2 판정 포함)', () => {
  assert.match(BODY, /santa\/scope-delta\.js/);
  assert.match(BODY, /MCCP_SANTA_DELTA_SCOPE/);
  assert.match(BODY, /meta\.santa_delta_rounds/);
  assert.match(BODY, /meta\.santa_delta_paths_dropped/);
  // DD11 — 위조 저항 천장을 `--lane`·`--model` 항목과 같은 형태로 적는다.
  assert.match(BODY, /not forgery-resistant/);
  // DD1 — default 비대칭의 근거.
  assert.match(BODY, /opposite of every other santa toggle/);

  // M2 DD7 — 이 자리에는 M1의 "does **not** claim detection is preserved"가 있었다.
  // 그 문장의 짝인 "M2 owns that measurement and flips the default if it holds"가 같은
  // 항목에 있었으므로, M2가 착지한 뒤 그 둘을 남겨 두면 본문이 **이미 지나간 미래**를
  // 가리킨다. 그래서 M2는 두 문장을 실측 결과로 교체했고 이 단언도 함께 옮긴다.
  //
  // **완화가 아니라 이동이다.** M1이 이 자리에서 막으려던 것은 "본문이 탐지율 보존을
  // 주장하는 것"이고, 아래 두 단언은 같은 것을 더 강하게 막는다 — 본문이 (1) default를
  // `off`로 두었다고 명시하고 (2) 잰 것이 **도달 범위이지 발견이 아님**을 명시해야
  // 통과한다. 어느 쪽이든 "탐지율이 보존됐다"는 문장은 이 단언들을 만족시키지 못한다.
  assert.match(BODY, /left the default at/);
  assert.match(BODY, /where the delta loses reach, not whether reviewers still find things/);

  // Layer 2 완주(2026-08-25) 이후 추가 — **완화가 아니라 확장이다.** 위 두 단언은
  // 본문이 "탐지율이 보존됐다"고 말하는 것을 막지만, 이제 실측이 존재하므로 막아야 할
  // 것이 하나 늘었다: 본문이 그 실측을 **하락 없음으로 바꿔 적는 것**. 규칙이 하락의
  // 크기와 무관하게 flip을 거부한다는 문장이 본문에 남아 있어야 통과한다 —
  // "1건이라도 적으면"이 사라진 본문은 곧 임계를 도입한 본문이고, 그 임계는
  // `DECISION_RULE`의 축자와 어긋난다.
  assert.match(BODY, /refuses a flip on any shortfall/);
});

// ── 소유권 경계 ──────────────────────────────────────────────────────────────

test('scope-delta.js는 receipt 배선도 GATE_ID도 갖지 않는다 (seal.js 단독 소유)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'santa', 'scope-delta.js'), 'utf8');
  assert.equal(/require\([^)]*receipt\/(write|store|cli)/.test(src), false);
  assert.equal(/mccp-santa-review/.test(src), false);
});

test('scope-delta.js는 fs·child_process·git을 모른다 (순수 oracle)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'santa', 'scope-delta.js'), 'utf8');
  assert.equal(/require\(['"]fs['"]\)|require\(['"]child_process['"]\)/.test(src), false);
  // 주석의 서술("git show")은 허용하고 실제 호출만 금지한다.
  assert.equal(/execFileSync|execSync|spawnSync/.test(src), false);
});

// `--round`를 되살리면 `counter.decideRound`와 라운드 판정 자리가 둘이 된다.
test('scope-delta 하위명령은 --round를 받지 않는다', () => {
  const start = CLI_SRC.indexOf('function cmdScopeDelta');
  assert.notEqual(start, -1);
  const end = CLI_SRC.indexOf('\nfunction ', start + 1);
  const body = CLI_SRC.slice(start, end === -1 ? undefined : end);
  assert.equal(/args\[?['"]?round/.test(body), false,
    'anchor 집합이 이미 라운드의 답이다 — 라운드 번호를 재도출하면 판정 자리가 둘이 된다');
});
