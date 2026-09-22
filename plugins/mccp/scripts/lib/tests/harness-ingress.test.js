'use strict';

// harness-ingress 오라클 회귀 (codex-harness-portability M2 Task 4).
//
// 이 파일이 지키는 것은 판별표 자체가 아니라 **판별의 방향**이다. plan DD3가 실패한
// 지점이 "부재를 양성 근거로 승격"이었으므로, 그 형태가 되살아나면 red가 되게 한다.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const oracle = require('../harness-ingress');
const truth = require('../../../../../.claude/_meta/data/2026-09-09-codex-harness-truth.json');

const H = oracle.HARNESS;

// ── 판별표 전수 ────────────────────────────────────────────────────────────────

test('(a) 명시 designation이 유일한 양성 codex 경로다', () => {
  assert.equal(oracle.resolveHarness({ MCCP_HARNESS: 'codex' }).harness, H.CODEX);
  assert.equal(oracle.resolveHarness({ MCCP_HARNESS: 'codex' }).signal, 'explicit-designation');
  assert.equal(oracle.resolveHarness({ MCCP_HARNESS: 'claude' }).harness, H.CLAUDE);
});

test('(b) CLAUDE_PLUGIN_ROOT는 claude 쪽 양성 신호다', () => {
  const r = oracle.resolveHarness({ CLAUDE_PLUGIN_ROOT: '/some/root' });
  assert.equal(r.harness, H.CLAUDE);
  assert.equal(r.signal, 'claude-plugin-root');
});

test('(c) 명시 designation이 CLAUDE_PLUGIN_ROOT를 이긴다 (launcher-owned가 상위)', () => {
  assert.equal(
    oracle.resolveHarness({ MCCP_HARNESS: 'codex', CLAUDE_PLUGIN_ROOT: '/x' }).harness,
    H.CODEX
  );
});

test('(d) MCCP_HARNESS의 열거 밖 값은 기본값으로 흡수되지 않고 unknown으로 접힌다', () => {
  // 오타를 조용히 무시하면 운영자는 켰다고 믿고 게이트는 꺼져 있다.
  const r = oracle.resolveHarness({ MCCP_HARNESS: 'CoDeX-ish' });
  assert.equal(r.harness, H.UNKNOWN);
  assert.equal(r.signal, null);
});

test('(e) 빈 문자열·공백만 있는 값은 신호가 아니다', () => {
  assert.equal(oracle.resolveHarness({ MCCP_HARNESS: '   ' }).harness, H.UNKNOWN);
  assert.equal(oracle.resolveHarness({ CLAUDE_PLUGIN_ROOT: '  ' }).harness, H.UNKNOWN);
});

// ── DD3 회귀: 부재는 근거가 아니다 ────────────────────────────────────────────

test('(f) CODEX_HOME 단독으로는 codex를 지목하지 못한다 — plan DD3의 반증을 고정한다', () => {
  // M1 원자료: Codex는 아무 env도 주입하지 않는다. 관측된 CODEX_HOME은 프로브가
  // 자식 env에 직접 넣은 값이다. 이 단언이 red가 되면 DD3가 되살아난 것이다.
  const r = oracle.resolveHarness({ CODEX_HOME: '/home/u/.codex' });
  assert.equal(r.harness, H.UNKNOWN);
});

test('(g) CODEX_HOME 있음 + CLAUDE_PLUGIN_ROOT 없음(=DD3의 연언)도 unknown이다', () => {
  const r = oracle.resolveIngress({ env: { CODEX_HOME: '/home/u/.codex' } });
  assert.equal(r.harness, H.UNKNOWN);
  assert.equal(r.enabled, false);
});

test('(h) 원자료가 injected_by_codex=[] 임을 이 test가 직접 확인한다', () => {
  // 오라클의 설계 근거가 원자료에서 사라지면 red. 상수 pin의 parity 짝(Codex D5).
  const run = truth.runs.find((r) => r.id === 'env-projection-clean');
  assert.ok(run, 'env-projection-clean run must exist');
  assert.deepEqual(run.result.injected_by_codex, []);
  assert.equal(run.result.CLAUDE_PLUGIN_ROOT_injected, false);
});

// ── 상수 parity (Codex D5 — 런타임 read 대신 test가 두 표면을 묶는다) ──────────

test('(i) 측정 버전 상수가 원자료와 일치한다 (UI13)', () => {
  assert.equal(oracle.MEASURED_CODEX_VERSION, truth.codex_version);
});

test('(j) UserPromptSubmit 키 상수가 원자료에서 파생된다', () => {
  const shape = truth.probe_log_shape_clean_env.find((s) => s.event_name === 'UserPromptSubmit');
  assert.ok(shape, 'UserPromptSubmit shape must exist in raw data');
  assert.deepEqual(oracle.CODEX_USER_PROMPT_SUBMIT_KEYS.slice().sort(), shape.event_keys.slice().sort());
});

test('(k) Codex에 UserPromptExpansion이 없다는 사실이 원자료와 일치한다', () => {
  const run = truth.runs.find((r) => r.id === 'event-enum');
  assert.deepEqual(oracle.CODEX_ABSENT_EVENTS.slice().sort(), run.result.mccp_events_absent.slice().sort());
});

// ── UI17: 차단할 수 없으면 발화하지 않는다 ────────────────────────────────────

test('(l) 차단 프로토콜은 B1에서 측정됐고 그 값이 ingress를 켠다', () => {
  const r = oracle.resolveIngress({
    env: { MCCP_HARNESS: 'codex' },
    payload: { prompt: 'x', turn_id: 't' },
  });
  assert.equal(r.harness, H.CODEX);
  assert.equal(r.enabled, true);
  assert.equal(r.ingress, 'user_prompt_submit');
  assert.equal(r.event, 'UserPromptSubmit');
  assert.equal(r.notice, null, 'a firing path has nothing to warn about');
});

test('(l2) 채택된 형식은 receipt-prompt.js가 이미 내는 형식이다 — DD4가 실제로 성립한다', () => {
  assert.equal(oracle.CODEX_BLOCK_PROTOCOL.kind, 'stdout-json');
  assert.equal(oracle.CODEX_BLOCK_PROTOCOL.measuredOn, 'UserPromptSubmit');
  assert.equal(oracle.CODEX_BLOCK_PROTOCOL.measuredVersion, '0.153.4');
});

test('(l3) 프로토콜 상수가 사라지면 ingress는 즉시 꺼진다 — UI17 fail-closed 방향', () => {
  // 상수를 지우는 편집이 "게이트가 조용히 통과시키는" 상태를 만들지 않음을 고정한다.
  // 오라클은 순수 함수라 상수를 가릴 수 없으므로, 대신 규칙 자체를 단언한다:
  // enabled는 blockProtocol이 truthy일 때만 true다.
  const r = oracle.resolveIngress({ env: { MCCP_HARNESS: 'codex' }, payload: { prompt: 'x', turn_id: 't' } });
  assert.equal(r.enabled, Boolean(r.blockProtocol));
});

test('(m) 발화하지 않는 모든 경로가 notice를 갖는다 — 무음 skip 금지 (security H2)', () => {
  const cases = [
    { env: {} },
    { env: { CODEX_HOME: '/x' } },
    { env: { CLAUDE_PLUGIN_ROOT: '/x' } },
    { env: { MCCP_HARNESS: 'codex' }, payload: { cwd: '/x' } },
    { env: { MCCP_HARNESS: 'codex', MCCP_HARNESS_INGRESS: 'off' } },
    { env: { MCCP_HARNESS: 'nonsense' } },
  ];
  for (const c of cases) {
    const r = oracle.resolveIngress(c);
    assert.equal(r.enabled, false);
    assert.ok(r.notice && r.notice.length > 0, 'every non-firing path must carry a stderr notice');
  }
});

// ── kill switch ───────────────────────────────────────────────────────────────

test('(n) kill switch는 off만 끄고 오타는 on으로 접힌다', () => {
  assert.equal(oracle.parseKillSwitch({ MCCP_HARNESS_INGRESS: 'off' }), 'off');
  assert.equal(oracle.parseKillSwitch({ MCCP_HARNESS_INGRESS: 'OFF' }), 'off');
  assert.equal(oracle.parseKillSwitch({ MCCP_HARNESS_INGRESS: 'no' }), 'on');
  assert.equal(oracle.parseKillSwitch({}), 'on');
});

test('(o) kill switch off는 codex 지목보다 앞선다', () => {
  const r = oracle.resolveIngress({ env: { MCCP_HARNESS: 'codex', MCCP_HARNESS_INGRESS: 'off' } });
  assert.equal(r.enabled, false);
  assert.match(r.reason, /kill-switch/);
});

// ── payload 보강은 한 방향으로만 움직인다 ─────────────────────────────────────

test('(p) payload는 codex 지목을 올리지 못한다 — codex 모양이어도 env가 없으면 unknown', () => {
  const r = oracle.resolveIngress({ env: {}, payload: { prompt: 'x', turn_id: 't' } });
  assert.equal(r.harness, H.UNKNOWN);
});

test('(q) payload는 codex 지목을 내릴 수 있다', () => {
  const r = oracle.resolveIngress({ env: { MCCP_HARNESS: 'codex' }, payload: { cwd: '/x' } });
  assert.equal(r.harness, H.UNKNOWN);
  assert.match(r.reason, /contradicts/);
});

test('(r) payload 부재는 모순이 아니다 (env 전용 조기 판정 경로를 막지 않는다)', () => {
  const c = oracle.classifyPayload(undefined);
  assert.equal(c.contradictsCodex, false);
  assert.equal(c.shape, 'absent');
});

// ── Claude 전용 hook 가드 (L2-11 / security M2 흡수) ──────────────────────────

test('(s) shouldRunClaudeHook의 기본값은 "돈다" — unknown에서 게이트를 지우지 않는다', () => {
  assert.equal(oracle.shouldRunClaudeHook({}), true);
  assert.equal(oracle.shouldRunClaudeHook({ CODEX_HOME: '/x' }), true);
  assert.equal(oracle.shouldRunClaudeHook({ CLAUDE_PLUGIN_ROOT: '/x' }), true);
});

test('(t) 적극 지목된 codex에서만 Claude 전용 hook이 멈춘다', () => {
  assert.equal(oracle.shouldRunClaudeHook({ MCCP_HARNESS: 'codex' }), false);
  assert.equal(oracle.shouldRunClaudeHook({ MCCP_HARNESS: 'claude' }), true);
});

// ── 순수성 ────────────────────────────────────────────────────────────────────

test('(u) 오라클은 process.env를 읽지 않는다 — 인자만 본다', () => {
  const saved = process.env.MCCP_HARNESS;
  process.env.MCCP_HARNESS = 'codex';
  try {
    assert.equal(oracle.resolveHarness({}).harness, H.UNKNOWN);
  } finally {
    if (saved === undefined) delete process.env.MCCP_HARNESS;
    else process.env.MCCP_HARNESS = saved;
  }
});
