'use strict';

// Codex ingress 회귀 (codex-harness-portability M2 Task 6).
//
// 두 축을 지킨다:
//   1. **no-op이 기본이다** — 오라클이 지목하지 않으면 stdout에 아무것도 쓰지 않는다.
//   2. **신뢰 불가 입력의 통로는 정규화 하나다** — security H3이 짚은 체인을 여기서 끊는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const hook = require('../receipt-prompt-submit');
const oracle = require('../../lib/harness-ingress');

const HOOK_PATH = path.resolve(__dirname, '..', 'receipt-prompt-submit.js');

function run(env, stdin) {
  return spawnSync(process.execPath, [HOOK_PATH], {
    encoding: 'utf8',
    shell: false,
    input: typeof stdin === 'string' ? stdin : '',
    timeout: 20000,
    env: Object.assign({ PATH: process.env.PATH, HOME: process.env.HOME }, env || {}),
  });
}

// ── 1. 지목되지 않으면 아무 일도 하지 않는다 ─────────────────────────────────

test('(a) 하네스가 지목되지 않으면 exit 0 + stdout 무출력', () => {
  const r = run({}, JSON.stringify({ prompt: '/mccp:pr', turn_id: 't1', cwd: process.cwd() }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '', 'a non-routed harness must not emit a payload');
});

test('(b) 지목되지 않는 경로도 stderr notice를 남긴다 — 무음 skip 금지 (security H2)', () => {
  const r = run({}, JSON.stringify({ prompt: '/mccp:pr', turn_id: 't1' }));
  assert.match(r.stderr, /\[mccp:harness-ingress\]/);
});

test('(c) kill switch가 켜져 있으면 stdin을 읽기 전에 끝난다', () => {
  const r = run({ MCCP_HARNESS: 'codex', MCCP_HARNESS_INGRESS: 'off' }, '');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /MCCP_HARNESS_INGRESS=off/);
});

test('(d) codex로 지목되면 게이트가 실제로 발화한다 — B1 측정 이후', () => {
  assert.ok(oracle.CODEX_BLOCK_PROTOCOL, 'B1 measured; the ingress is live');
  // `/mccp:pr`은 선행 receipt를 요구하는 명령이라 이 저장소에서 실제 판정이 나온다.
  const r = run({ MCCP_HARNESS: 'codex' },
    JSON.stringify({ prompt: '/mccp:pr', turn_id: 't1', cwd: process.cwd(), session_id: 's1' }));
  assert.equal(r.status, 0, 'the measured protocol is stdout-json + exit 0');
  // 발화했다는 증거: 게이트가 payload를 냈거나(차단) 조용히 통과했거나 — 어느 쪽이든
  // "지목되지 않아 즉시 나갔다"는 stderr notice는 없어야 한다.
  assert.doesNotMatch(r.stderr, /not routed/);
});

test('(d2) 채택된 형식이 Claude 코어의 형식과 같다 — 별도 직렬화기가 없다', () => {
  assert.equal(oracle.CODEX_BLOCK_PROTOCOL.kind, 'stdout-json');
  const e = hook.makeEmission(oracle.CODEX_BLOCK_PROTOCOL, 'UserPromptSubmit');
  assert.equal(e.exitOverride, null, 'stdout-json needs no exit override');
});

test('(e) 깨진 stdin에도 fail-open', () => {
  const r = run({ MCCP_HARNESS: 'codex' }, '{not json');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

// ── 2. 정규화 — 무엇이 명령으로 인식되는가 ───────────────────────────────────

const CWD = process.cwd();

test('(f) 슬래시 유무 모두 인식한다', () => {
  assert.equal(hook.normalizePrompt('/mccp:pr', CWD).commandName, 'mccp:pr');
  assert.equal(hook.normalizePrompt('mccp:pr', CWD).commandName, 'mccp:pr');
});

test('(g) 명령으로 시작하지 않으면 인식하지 않는다 (ALLOW)', () => {
  assert.equal(hook.normalizePrompt('please run /mccp:pr for me', CWD), null);
  assert.equal(hook.normalizePrompt('  x /mccp:pr', CWD), null);
  assert.equal(hook.normalizePrompt('', CWD), null);
  assert.equal(hook.normalizePrompt(null, CWD), null);
  assert.equal(hook.normalizePrompt('/mccpX:pr', CWD), null);
  assert.equal(hook.normalizePrompt('/mccp:', CWD), null);
  assert.equal(hook.normalizePrompt('/mccp:-bad', CWD), null);
});

test('(h) 첫 줄만 args가 된다 — 붙여넣은 본문의 --decision 주입을 끊는다 (security H3-C)', () => {
  const n = hook.normalizePrompt('/mccp:pr\n--decision attacker-slug\n--plan /etc/passwd', CWD);
  assert.equal(n.commandName, 'mccp:pr');
  assert.equal(n.commandArgs, '');
});

test('(i) 길이 상한을 넘는 첫 줄은 인식하지 않는다', () => {
  const long = '/mccp:pr ' + 'a'.repeat(hook.MAX_COMMAND_LINE);
  assert.equal(hook.normalizePrompt(long, CWD), null);
});

// ── 3. planPath containment (security H3-A/B) ────────────────────────────────

test('(j) 작업 디렉토리 밖 경로는 떨어진다', () => {
  assert.equal(hook.checkPlanPath('/etc/shadow', CWD).ok, false);
  assert.equal(hook.checkPlanPath('../../../etc/passwd', CWD).ok, false);
});

test('(k) 캐릭터 디바이스·FIFO는 정규 파일이 아니므로 떨어진다 (무한 read 차단)', () => {
  assert.equal(hook.checkPlanPath('/dev/zero', CWD).ok, false);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-plan-'));
  try {
    // 디렉토리도 정규 파일이 아니다.
    assert.equal(hook.checkPlanPath('.', CWD).ok, false);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('(l) symlink는 따라가지 않는다 — lstat이라 containment를 우회하지 못한다', () => {
  const link = path.join(CWD, '.mccp-test-link.md');
  try {
    fs.symlinkSync('/etc/passwd', link);
    assert.equal(hook.checkPlanPath('.mccp-test-link.md', CWD).ok, false,
      'a symlink inside the tree must not smuggle an outside target');
  } finally {
    try { fs.unlinkSync(link); } catch (_) {}
  }
});

test('(m) 크기 상한을 넘는 파일은 떨어진다', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-plan-big-'));
  try {
    const f = path.join(base, 'big.md');
    fs.writeFileSync(f, Buffer.alloc(hook.MAX_PLAN_BYTES + 1, 0x61));
    assert.equal(hook.checkPlanPath('big.md', base).ok, false);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('(n) 정상 plan 경로는 살아남는다 — 게이트가 계속 작동해야 한다', () => {
  const rel = '.claude/plans/codex-harness-portability-m2.plan.md';
  assert.equal(hook.checkPlanPath(rel, CWD).ok, true);
  const n = hook.normalizePrompt('/mccp:prp-implement --plan ' + rel, CWD);
  assert.equal(n.commandArgs, '--plan ' + rel);
});

test('(o) --plan=<v> 형태도 같은 검사를 받는다', () => {
  const good = hook.sanitizePlanArg('--plan=.claude/plans/codex-harness-portability-m2.plan.md', CWD);
  assert.match(good.args, /^--plan=/);
  const bad = hook.sanitizePlanArg('--plan=/etc/shadow', CWD);
  assert.equal(bad.args, '');
  assert.ok(bad.dropped);
});

test('(p) --plan을 떨어뜨려도 나머지 args는 보존된다', () => {
  const r = hook.sanitizePlanArg('--standalone --plan /etc/shadow --verbose', CWD);
  assert.equal(r.args, '--standalone --verbose');
  assert.ok(r.dropped);
});

test('(q) 드롭 사유에 경로 원문을 싣지 않는다 — 컨텍스트 재주입 축 (security H3-B)', () => {
  const r = hook.sanitizePlanArg('--plan /etc/shadow', CWD);
  assert.ok(r.dropped);
  assert.ok(r.dropped.indexOf('/etc/shadow') === -1, 'the rejected path must not travel in the reason');
});

// ── 4. 방출 형태 ─────────────────────────────────────────────────────────────

test('(r) 기본 방출은 stdout JSON이고 이벤트 이름이 주입된다 (security M1)', () => {
  const e = hook.makeEmission(null, 'UserPromptSubmit');
  assert.equal(e.hookEventName, 'UserPromptSubmit');
  assert.equal(e.exitOverride, null);
});

test('(s) exit-2 프로토콜은 stderr + exit override로 나온다', () => {
  const e = hook.makeEmission({ kind: 'exit-nonzero-stderr', exitCode: 2 }, 'UserPromptSubmit');
  assert.equal(e.exitOverride, 2);
});

// ── 5. 게이트 코어와의 계약 ──────────────────────────────────────────────────

test('(t) 코어는 이벤트 이름을 주입받아 그대로 payload에 싣는다', async () => {
  const core = require('../receipt-prompt');
  const chunks = [];
  // 차단 조건을 만들지 않고 debug ALLOW 경로만 확인한다 — 이름 주입이 코어를 통과하는지가 축이다.
  const code = await core.runGate(
    { command_name: 'mccp:not-a-real-command-xyz', command_args: '' },
    { hookEventName: 'UserPromptSubmit', emit: function (t) { chunks.push(t); } }
  );
  assert.equal(code, 0, 'a non-mccp-gated command allows');
  assert.equal(core.CLAUDE_HOOK_EVENT_NAME, 'UserPromptExpansion');
});

// ── S1·S2·S4 회귀 (codex-harness-portability M3 보안 흡수) ────────────────────
//
// 아래 넷은 **실제로 재현된 우회**를 고정한다. 리뷰어 주장을 옮겨 적은 것이 아니라,
// 수정 전 이 저장소에서 그대로 성립하던 입력이다.

const { extractPlanPath, tokenize } = require('../../lib/extract-plan-path');

test('(u) 따옴표로 감싼 --plan은 검사를 우회하지 못한다 (security S1 — 재현된 우회)', () => {
  // 수정 전: 두 입력 모두 sanitizer를 dropped:null로 통과했고 하류는 /dev/zero를 봤다.
  // 원인은 containment 논리가 아니라 **tokenizer 차이**였다 — sanitizer는 공백으로 쪼개고
  // 소비처는 따옴표를 해석했다.
  for (const raw of ['"--plan" /dev/zero', '--pl"an" /dev/zero', '--plan /dev/zero', '--plan=/dev/zero']) {
    const out = hook.sanitizePlanArg(raw, process.cwd());
    assert.notStrictEqual(out.dropped, null, raw + ' 이 떨어지지 않았다');
    assert.strictEqual(extractPlanPath(out.args), null, raw + ' 이 하류에 도달했다');
  }
});

test('(u2) sanitizer와 소비처가 같은 tokenizer를 쓴다 — 사본이 아니라 차용', () => {
  // 두 번째 tokenizer가 생기면 같은 차이가 다시 벌어진다. 이 단언은 그 재발을 막는다.
  const src = fs.readFileSync(HOOK_PATH, 'utf8');
  assert.ok(/require\('\.\.\/lib\/extract-plan-path'\)/.test(src),
    'sanitizer가 공유 tokenizer를 빌려오지 않는다');
  // **주석은 제외한다.** 이 파일의 주석은 되살아나면 안 되는 형태를 설명을 위해 인용하고
  // 있고, 그것까지 세면 단언이 산문을 검사하게 된다 — §3.17이 기록한 실패("배선이 아니라
  // 산문을 검사하고 있었다")와 같은 형태다.
  const code = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  assert.ok(!/\.split\(\/\\s\+\//.test(code), '공백 분해 tokenizer가 되살아났다');
});

test('(v) 재조립은 무손실이다 — tokenize(rebuild(t)) === t', () => {
  // 검증한 토큰을 공백으로 잇기만 하면 공백을 품은 정당한 경로가 하류에서 다시 쪼개진다.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-rt-'));
  const real = fs.realpathSync(dir);
  const withSpace = path.join(real, 'a b.md');
  fs.writeFileSync(withSpace, '# x\n');
  try {
    const out = hook.sanitizePlanArg('--plan "a b.md" --standalone', real);
    assert.strictEqual(out.dropped, null);
    assert.deepStrictEqual(tokenize(out.args), ['--plan', 'a b.md', '--standalone']);
    assert.strictEqual(extractPlanPath(out.args), 'a b.md');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('(v2) requote는 재해석이 필요한 토큰만 감싼다 — 흔한 형태는 바이트 그대로', () => {
  assert.strictEqual(hook.requote('--standalone'), '--standalone');
  assert.strictEqual(hook.requote('.claude/plans/a.md'), '.claude/plans/a.md');
  assert.deepStrictEqual(tokenize(hook.requote('a b')), ['a b']);
  assert.deepStrictEqual(tokenize(hook.requote("it's")), ["it's"]);
  assert.deepStrictEqual(tokenize(hook.requote('')), ['']);
});

test('(w) 중간 디렉토리 symlink 탈출을 거부한다 (security S2 — 재현된 우회)', () => {
  // 수정 전: lstat이 **마지막 요소만** 봤으므로 /proc/self, /proc/<pid>/root 같은 중간
  // symlink를 OS가 투명하게 따라가 밖의 일반 파일에 도달했다. 실측 ok:true / realpath
  // /etc/passwd. realpath containment가 그것을 닫는다.
  const v = hook.checkPlanPath('self/root/etc/passwd', '/proc');
  assert.strictEqual(v.ok, false, '중간 symlink 탈출이 여전히 통과한다');
});
