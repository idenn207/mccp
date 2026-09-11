'use strict';

// 명령 도달 오라클 회귀 (codex-harness-portability M3 Task 3·5).
//
// 두 축이다:
//   1. 해소가 실제로 되고, 되면 안 되는 것은 **구별되는 이유로** 거부된다.
//   2. **사본 금지 짝 단언** — SKILL.md의 명령 이름 리터럴과 오라클의 하드코딩 열거가
//      같은 값이어야 한다. §3.17이 기록한 실패("배선이 아니라 산문을 검사하고 있었다")를
//      반복하지 않도록, 단언 대상은 산문이 아니라 **두 파일의 실제 내용**이다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const reach = require('../command-reach');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');       // plugins/mccp
const COMMANDS = path.join(PLUGIN_ROOT, 'commands');
const SKILL = path.join(PLUGIN_ROOT, 'skills', 'run-command', 'SKILL.md');
const ORACLE_SRC = path.resolve(__dirname, '..', 'command-reach.js');

function names() {
  return fs.readdirSync(COMMANDS)
    .filter(function (f) { return f.endsWith('.md'); })
    .map(function (f) { return f.slice(0, -3); })
    .sort();
}

function v(name, env) {
  return reach.verify({ env: env || {}, name: name, rootHint: PLUGIN_ROOT });
}

test('(a) commands/ 전수가 해소된다 — 핵심 6개가 아니라 전부', () => {
  const all = names();
  assert.ok(all.length >= 20, '명령이 예상보다 적다: ' + all.length);
  all.forEach(function (n) {
    const r = v(n);
    assert.strictEqual(r.resolved, true, n + ' 이 해소되지 않았다: ' + r.reason);
    assert.strictEqual(path.basename(r.commandPath), n + '.md');
  });
});

test('(b) 미지 이름은 ENOENT가 아니라 unknown-command로 거부된다 (security S6)', () => {
  // 구별이 요점이다. "없는 명령"과 "설치가 깨졌다"가 같은 오류로 도달하면 호출자가
  // 무엇을 고쳐야 하는지 알 수 없다.
  const r = v('plan-xyz');
  assert.strictEqual(r.resolved, false);
  assert.match(r.reason, /unknown-command/);
  assert.notStrictEqual(r.root, null, 'root는 해소됐어야 한다 — 실패한 것은 이름이다');
});

test('(c) 경로 탈출은 join 이전에 형태로 거부된다', () => {
  ['../../etc/passwd', 'plan/../../x', 'a/b', './x', '..', 'x\0y'].forEach(function (bad) {
    const r = v(bad);
    assert.strictEqual(r.resolved, false, bad + ' 이 통과했다');
    assert.strictEqual(r.commandPath, null);
  });
});

test('(d) 대문자·선행숫자·과길이는 형태 위반이다', () => {
  ['PLAN', '1plan', '-plan', 'a'.repeat(65)].forEach(function (bad) {
    assert.strictEqual(v(bad).resolved, false, bad + ' 이 통과했다');
  });
});

test('(e) mccp: 접두는 벗겨서 받는다 — 호출자가 /mccp:plan을 그대로 넘길 수 있다', () => {
  const r = v('mccp:plan');
  assert.strictEqual(r.resolved, true);
  assert.strictEqual(r.name, 'plan');
});

test('(f) Claude 하네스에서는 자기 차단한다 (DD6)', () => {
  const r = v('plan', { CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT });
  assert.strictEqual(r.resolved, false);
  assert.match(r.reason, /claude harness/);
  assert.match(r.reason, /\/mccp:plan/);
});

test('(g) 순수 단계는 resolved를 주장하지 않는다 — fs를 안 봤으므로 주장할 수 없다', () => {
  const c = reach.resolveCandidate({ env: {}, name: 'plan', rootHint: PLUGIN_ROOT });
  assert.strictEqual('resolved' in c, false);
  assert.strictEqual(c.nameOk, true);
  assert.ok(Array.isArray(c.candidates));
});

test('(h) 사본 금지 짝 단언 — 본문 리터럴과 오라클 열거는 같은 값이다 (DD3)', () => {
  const skill = fs.readFileSync(SKILL, 'utf8');
  const oracle = fs.readFileSync(ORACLE_SRC, 'utf8');
  const all = names();

  const skillHasLiteral = all.some(function (n) {
    return new RegExp('(^|[^a-z0-9-])' + n + '($|[^a-z0-9-])').test(skill);
  });
  // 오라클의 "하드코딩 열거"는 명령 이름이 **소스에 리터럴로** 박힌 것을 뜻한다.
  // `readdirSync`로 얻는 집합은 원본 그 자체라 사본이 아니다 — 갈라질 것이 없다.
  const oracleHasEnumeration = all.some(function (n) {
    return new RegExp("['\"]" + n + "['\"]").test(oracle);
  });

  assert.strictEqual(skillHasLiteral, oracleHasEnumeration,
    '두 표면이 갈라졌다: skill literal=' + skillHasLiteral + ' oracle enumeration=' + oracleHasEnumeration);
  assert.strictEqual(skillHasLiteral, false, '지금의 올바른 값은 둘 다 false다');
});

test('(i) 오라클의 열거는 디스크에서 온다 — readdir이 사라지면 붉어진다', () => {
  const oracle = fs.readFileSync(ORACLE_SRC, 'utf8');
  assert.match(oracle, /readdirSync/, '열거가 디스크에서 오지 않으면 (h)의 짝 단언이 의미를 잃는다');
});

test('(j) SKILL.md는 ${CLAUDE_PLUGIN_ROOT} 치환으로 경로를 만들지 않는다', () => {
  // Task 5 — 치환 축과의 정합. R-a가 미치환으로 측정되면 그것에 기대는 본문은 죽는다.
  // 검사 대상은 **경로 구성**(`${...}/`)이지 변수 이름의 언급이 아니다 — 1단계는 그 이름을
  // 하네스 신호로 *읽을* 뿐이고, 그것은 치환에 기대는 것이 아니다.
  const skill = fs.readFileSync(SKILL, 'utf8');
  assert.ok(!/\$\{CLAUDE_PLUGIN_ROOT\}\//.test(skill),
    'SKILL.md가 치환으로 경로를 조립한다 — R-a가 미치환이면 죽는 형태다');
});

test('(k) SKILL.md는 명령 본문을 인라인하지 않는다 (DD3) — 크기가 그 대리 지표다', () => {
  const bytes = fs.statSync(SKILL).size;
  assert.ok(bytes < 4096, 'SKILL.md가 ' + bytes + " bytes — 본문 사본이 실렸을 수 있다");
});

test('(l) 모호한 설치는 지목하지 않는다 (§3.17 shadowed 규칙)', () => {
  // 캐시에 mccp 사본이 둘이면 어느 것이 열릴지 측정된 바 없다. 추측 대신 거부한다.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-amb-'));
  try {
    ['1.0.0', '2.0.0'].forEach(function (ver) {
      const d = path.join(home, 'plugins', 'cache', 'mkt', 'mccp', ver, 'commands');
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'plan.md'), '# x\n');
    });
    const r = reach.verify({ env: { CODEX_HOME: home }, name: 'plan' });
    assert.strictEqual(r.resolved, false);
    assert.match(r.reason, /ambiguous/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('(m) 심어 둔 symlink는 형태 검사를 통과해도 containment에서 걸린다', () => {
  // 이름 형태가 맞다는 것은 그 자리에 무엇이 놓였는지를 말하지 않는다(security S6).
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-sym-'));
  try {
    const root = path.join(home, 'root');
    fs.mkdirSync(path.join(root, 'commands'), { recursive: true });
    const outside = path.join(home, 'outside.md');
    fs.writeFileSync(outside, 'secret\n');
    fs.symlinkSync(outside, path.join(root, 'commands', 'plan.md'));
    const r = reach.verify({ env: {}, name: 'plan', rootHint: root });
    assert.strictEqual(r.resolved, false);
    assert.match(r.reason, /outside the plugin root/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('(n) 명시 designation이 CLAUDE_PLUGIN_ROOT를 이긴다 — 두 이름이 함께 있어도 자기 차단하지 않는다', () => {
  // plan-review L3 id=421bcf19: "둘 다 설정되면 공유 오라클은 codex를 고르는데, 제안된
  // 가드는 모든 dispatcher 호출을 claude로 끝낸다." 오라클은 `resolveHarness`를 쓰므로
  // 이미 옳다 — 위험한 것은 **본문이 자기 판별을 따로 갖는 것**이고, 그래서 SKILL.md에서
  // 그 술어를 제거했다. 이 test는 두 표면을 함께 고정한다.
  const r = reach.verify({
    env: { MCCP_HARNESS: 'codex', CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    name: 'plan', rootHint: PLUGIN_ROOT,
  });
  assert.strictEqual(r.resolved, true, '명시 designation이 무시됐다');

  const skill = fs.readFileSync(SKILL, 'utf8');
  const code = skill.split(/\r?\n/).filter(function (l) { return !/^\s*(-|>)/.test(l); }).join('\n');
  assert.ok(!/If .*CLAUDE_PLUGIN_ROOT.* (is set|holds a value).*stop/i.test(code),
    'SKILL.md가 다시 자기 판별을 갖는다 — 오라클과 어긋날 수 있다');
});
