'use strict';

// 하네스 판별 + receipt-gate ingress 지목 오라클 (codex-harness-portability M2 Task 4).
//
// 순수 함수다 — 파일도 프로세스도 만지지 않는다. 형태의 선례는 §3.17
// `impeccable-detect.js#resolveImpeccable()`이고, 규칙도 같다: 설치원을 **열거**한 뒤
// 실제로 성립하는 하나를 지목하고, 모호하면 지목하지 않는다.
//
// ── 왜 "부재"가 아니라 "양성 신호"인가 (구현 시점 이탈 1) ──────────────────────
// plan DD3는 `CODEX_HOME`이 값을 갖고 `CLAUDE_PLUGIN_ROOT`가 없으면 codex라고 적었다.
// 그 규칙은 M1 자신의 원자료가 반증한다:
//   `.claude/_meta/data/2026-09-09-codex-harness-truth.json`
//     runs[id=env-projection-clean].result.injected_by_codex === []
// Codex는 **아무 env도 주입하지 않는다.** 그 레코드에 `CODEX_HOME`이 값과 함께 찍힌 것은
// 프로브 자신이 자식 env에 넣었기 때문이고(`scripts/codex-probe/cli.js`의 spawn env),
// 따라서 "Codex가 CODEX_HOME을 주입한다"는 측정은 **존재한 적이 없다**. 기본 운용에서
// 운영자는 그 이름을 export하지 않으므로(Codex는 `~/.codex`를 기본으로 쓴다) DD3의 연언은
// 양성 조건을 잃고 항상 접히며, 그러면 게이트는 설치돼도 발화하지 않는다 — UI15가 금지한
// 껍데기가 판별자 자체에서 나온다. 두 리뷰어가 독립적으로 같은 곳을 지목했다.
//
// 그래서 판별은 **부재를 근거로 삼지 않는다.** 지목은 둘 중 하나로만 성립한다:
//   1. `MCCP_HARNESS` — launcher-owned 명시 designation (유일한 양성 codex 경로)
//   2. `CLAUDE_PLUGIN_ROOT`가 값을 가짐 — Claude 쪽 양성 신호
// 그 밖은 전부 `unknown`이고 `unknown`은 아무 일도 하지 않는다. 오작동의 방향이
// "안 켜짐"으로 접히는 것이 이 오라클의 설계 목표다.
//
// ── payload 판별자를 1차로 쓰지 않는 이유 ────────────────────────────────────
// security H2는 payload 형태를 1차 판별자로 쓰라고 권했다. Codex의 `UserPromptSubmit`
// payload는 M1이 쟀고(`probe_log_shape_clean_env`) `turn_id`·`model`을 갖는다. 그러나
// **Claude Code의 같은 이벤트 payload는 아직 측정되지 않았다** — 그것을 모른 채
// "turn_id가 있으면 codex"라고 적으면 DD3가 저지른 오류(미측정 값을 판별 근거로 승격)를
// 형태만 바꿔 반복하는 것이다. 그래서 payload는 **보강**으로만 쓴다: 지목을 codex 쪽으로
// 밀어 올리는 데는 쓰지 않고, 이미 codex로 지목된 실행이 codex가 아닌 형태를 보이면
// `unknown`으로 **내리는** 데만 쓴다. 방향이 한쪽뿐이라 미측정이 위험을 만들지 않는다.

// ── 측정 상수 (UI13 — 버전 없이는 인용하지 않는다) ────────────────────────────
// 출처: `.claude/_meta/data/2026-09-09-codex-harness-truth.json`
// 이 값들은 `codex-cli 0.153.4` 하나에 대한 것이고 다른 버전에 대해서는 아무 말도 하지
// 않는다. 런타임에 원자료를 읽지 않는 이유는 Codex R1 D5의 판단을 따른 것이다 —
// 같은 낡은 JSON을 런타임에 읽어도 버전 드리프트는 풀리지 않고, plugin 트리가
// `.claude/_meta/`에 결합되는 비용만 생긴다. 대신 test가 원자료에서 기대값을 파생해
// 두 표면이 조용히 갈라지지 못하게 한다(`EVENT_CANDIDATES` 선례와 같은 형태).
const MEASURED_CODEX_VERSION = '0.153.4';

// runs[id=event-enum].result.mccp_events_absent — Codex에는 `UserPromptExpansion`이 없다.
// 그래서 Claude 쪽 기존 ingress를 그대로 쓸 수 없고 M2가 존재한다.
const CODEX_ABSENT_EVENTS = ['UserPromptExpansion', 'PostToolUseFailure'];

// probe_log_shape_clean_env 의 UserPromptSubmit.event_keys.
const CODEX_USER_PROMPT_SUBMIT_KEYS = [
  'cwd', 'hook_event_name', 'model', 'permission_mode',
  'prompt', 'session_id', 'transcript_path', 'turn_id',
];

// ── 차단 프로토콜 (B1 — 측정됨) ──────────────────────────────────────────────
// DD5가 못박은 대로 이것은 선택이 아니라 측정이다. 값이 `null`이면 ingress는 켜지지
// 않는다 — 차단할 수단을 모르는 채 발화하면 그 hook이 내는 것은 차단이 아니라 통과이고,
// 통과 관측을 차단으로 반올림하는 것이 UI17이 금지한 행위다.
//
// 출처: `scripts/codex-probe/block-probe.js` 스윕, codex-cli 0.153.4.
// `UserPromptSubmit`에서 **음성 대조가 성립한 상태로** 관측한 결과:
//   allow-control        → 보호 연산 발생   → not-blocked  (통제 성립)
//   stdout-json-block    → 보호 연산 미발생 → blocked      ← 채택
//   exit-nonzero-stderr  → 보호 연산 미발생 → blocked      (대안)
//   hook-specific-deny   → 보호 연산 발생   → not-blocked  (존중되지 않음)
//
// `stdout-json`을 고른 이유는 그것이 `receipt-prompt.js`가 **이미 내는 형식**이기
// 때문이다. 즉 DD4의 "동작 변경 0"과 차단 요구가 실제로 양립한다 — 코어는 같은 payload를
// 내고 이벤트 이름만 주입받는다.
//
// `PreToolUse`는 **측정되지 않았다.** 그 이벤트의 음성 대조가 성립하지 않아
// (모델이 도구를 쓰지 않았다) 차단 시도를 실행하지 않았다. 그 공백은 판정 문서가 적는다.
const CODEX_BLOCK_PROTOCOL = Object.freeze({
  kind: 'stdout-json',
  measuredOn: 'UserPromptSubmit',
  measuredVersion: '0.153.4',
  alsoBlocking: ['exit-nonzero-stderr'],
  notHonoured: ['hook-specific-deny'],
});

const HARNESS = { CLAUDE: 'claude', CODEX: 'codex', UNKNOWN: 'unknown' };

// env-contract vocabulary. 인라인 리터럴로 두면 registry가 가리킬 어휘가 없다.
const VALID_HARNESS = ['claude', 'codex'];
const INGRESS_SWITCH_VALUES = ['on', 'off'];

function readEnv(env, name) {
  const v = env && env[name];
  return typeof v === 'string' ? v.trim() : '';
}

// kill switch. `off`만 끄고 그 밖의 값은 전부 `on`으로 접는다 — 오타가 게이트를 조용히
// 끄지 못하게 하는 방향이다(fail-closed는 여기서 "켜진 채로"다).
function parseKillSwitch(env) {
  const raw = readEnv(env, 'MCCP_HARNESS_INGRESS').toLowerCase();
  return raw === INGRESS_SWITCH_VALUES[1] ? INGRESS_SWITCH_VALUES[1] : INGRESS_SWITCH_VALUES[0];
}

// 하네스 지목. **부재는 근거가 아니다.**
function resolveHarness(env) {
  const explicit = readEnv(env, 'MCCP_HARNESS').toLowerCase();
  if (explicit) {
    if (VALID_HARNESS.indexOf(explicit) !== -1) {
      return { harness: explicit, signal: 'explicit-designation', reason: 'MCCP_HARNESS=' + explicit };
    }
    // 열거 밖 값은 무시하지 않고 `unknown`으로 접는다. 오타를 조용히 기본값으로
    // 흡수하면 운영자는 켰다고 믿고 게이트는 꺼져 있다.
    return { harness: HARNESS.UNKNOWN, signal: null, reason: 'MCCP_HARNESS carries an unrecognised value' };
  }
  if (readEnv(env, 'CLAUDE_PLUGIN_ROOT')) {
    return { harness: HARNESS.CLAUDE, signal: 'claude-plugin-root', reason: 'CLAUDE_PLUGIN_ROOT is populated' };
  }
  return {
    harness: HARNESS.UNKNOWN,
    signal: null,
    reason: 'no positive host signal (Codex injects no environment of its own; absence proves nothing)',
  };
}

// payload 보강. **한 방향으로만 움직인다** — codex 지목을 내릴 수는 있어도 올릴 수는 없다.
function classifyPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { shape: 'absent', contradictsCodex: false, missing: [] };
  }
  const keys = Object.keys(payload);
  if (keys.length === 0) return { shape: 'absent', contradictsCodex: false, missing: [] };
  // Codex의 UserPromptSubmit이 반드시 갖는 것으로 측정된 두 키. 프롬프트 게이트가
  // 실제로 쓰는 값이라 부재하면 위임 자체가 성립하지 않는다.
  const required = ['prompt', 'turn_id'];
  const missing = required.filter(function (k) { return keys.indexOf(k) === -1; });
  return {
    shape: missing.length === 0 ? 'codex-compatible' : 'not-codex-compatible',
    contradictsCodex: missing.length > 0,
    missing: missing,
  };
}

// 최종 지목. 호출자는 `enabled`가 false면 아무 일도 하지 않고 exit 0 한다.
// `notice`는 **반드시 stderr로 출력한다** — 무음 skip은 디스크에서 "껍데기"와
// 구분되지 않는다는 것이 security H2의 지적이고, 이 필드가 그 흡수다.
function resolveIngress(opts) {
  const o = opts || {};
  const env = o.env || {};
  const payload = Object.prototype.hasOwnProperty.call(o, 'payload') ? o.payload : undefined;

  const base = {
    harness: HARNESS.UNKNOWN,
    signal: null,
    ingress: null,
    event: null,
    blockProtocol: CODEX_BLOCK_PROTOCOL,
    measuredVersion: MEASURED_CODEX_VERSION,
    enabled: false,
    reason: null,
    notice: null,
  };

  if (parseKillSwitch(env) === 'off') {
    return Object.assign(base, {
      reason: 'kill-switch: MCCP_HARNESS_INGRESS=off',
      notice: '[mccp:harness-ingress] disabled by MCCP_HARNESS_INGRESS=off',
    });
  }

  const h = resolveHarness(env);
  base.harness = h.harness;
  base.signal = h.signal;

  if (h.harness !== HARNESS.CODEX) {
    return Object.assign(base, {
      reason: h.reason,
      // Claude Code에서는 기존 `UserPromptExpansion` ingress가 살아 있으므로 이 줄은
      // 정보이지 경고가 아니다. `unknown`에서는 게이트가 실제로 없는 상태라 같은 줄이
      // 경고로 읽혀야 한다 — 그 구분을 harness 값이 나른다.
      notice: '[mccp:harness-ingress] not routed (harness=' + h.harness + '): ' + h.reason,
    });
  }

  // 여기서부터는 codex로 지목된 실행이다.
  const p = classifyPayload(payload);
  if (p.contradictsCodex) {
    return Object.assign(base, {
      harness: HARNESS.UNKNOWN,
      reason: 'payload contradicts the measured Codex shape (missing: ' + p.missing.join(', ') + ')',
      notice: '[mccp:harness-ingress] demoted to unknown — payload lacks ' + p.missing.join(', '),
    });
  }

  if (!CODEX_BLOCK_PROTOCOL) {
    return Object.assign(base, {
      reason: 'block protocol is unmeasured for codex ' + MEASURED_CODEX_VERSION +
        ' — refusing to fire a gate that cannot block (UI17)',
      notice: '[mccp:harness-ingress] NOT firing: block protocol unmeasured. ' +
        'The receipt gate is NOT enforced on this harness.',
    });
  }

  return Object.assign(base, {
    ingress: 'user_prompt_submit',
    event: 'UserPromptSubmit',
    enabled: true,
    reason: h.reason,
    notice: null,
  });
}

// Claude 전용 hook이 이 하네스에서 돌아야 하는가.
//
// `$schema` 제거는 Codex에서 hooks.json 전체를 살린다 — 핸들러 29건이고 그중 다섯이
// exit-2 fail-closed 가드다(`receipt-skill` · `pr-phase-guard`(2 이벤트) ·
// `ultracode-phase-guard` · `goal-phase-guard`). 그 가드들의 lock 상태 가정은 Codex에서
// 한 번도 검증되지 않았고, stale lock 하나가 세션 전체를 deny로 만들 수 있다. 그래서
// 명시적으로 codex로 지목된 실행에서는 Claude 전용 hook을 돌리지 않는다.
//
// **기본값은 "돈다"**이다 — `unknown`에서 꺼 버리면 판별자가 실패한 Claude 세션에서
// 게이트가 통째로 사라진다. 끄는 것은 codex로 **적극 지목된** 경우 하나뿐이다.
function shouldRunClaudeHook(env) {
  return resolveHarness(env).harness !== HARNESS.CODEX;
}

module.exports = {
  HARNESS,
  VALID_HARNESS,
  INGRESS_SWITCH_VALUES,
  MEASURED_CODEX_VERSION,
  CODEX_ABSENT_EVENTS,
  CODEX_USER_PROMPT_SUBMIT_KEYS,
  CODEX_BLOCK_PROTOCOL,
  parseKillSwitch,
  resolveHarness,
  classifyPayload,
  resolveIngress,
  shouldRunClaudeHook,
};
