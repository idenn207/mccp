'use strict';

// gate-guard-integrity M2 축 B — codex companion 도달 가능성 판정 오라클.
//
// 실측된 결함: `codex-companion-smoke.test.js` 가
//
//     ok 1 # SKIP real codex --json contract appears to be non-JSON; v0.2.4 followup
//
// 로 skip 하는데 **이 사유는 거짓이다**. `MCCP_CODEX_DISABLED=1` 이 켜져 있으면
// `codex-invoke.js:182-192` 가 spawn 직전 short-circuit 하며
// `{ok:true, stdout:'', classification:'disabled'}` 를 돌려준다. 테스트의 기존
// `shouldSkip()` 은 그 env 축을 **보지 않으므로** 도달했다고 판단하고, 빈 stdout 에서
// brace 를 못 찾아 "companion 의 JSON 계약이 드리프트했다"고 보고한다. 실제로는
// companion 이 호출된 적이 없다. PRD 가 지목한 "skip 판정이 실제 도달성과 어긋난다"가
// 정확히 이것이다.
//
// 이 오라클은 **판정의 정확성만** 고친다. 외부 서비스의 한도·가용성 자체는 범위
// 밖(UI3)이고, 도달 **성공 후** 계약 드리프트로 인한 skip 은 사유가 이미 참이므로
// 현행 유지다.
//
// ── precedence: env policy > classification ─────────────────────────────────
// `env.MCCP_CODEX_DISABLED === '1'` 이면 `invokeResult` 가 무엇이든
// `{reachable:false, kind:'env-policy'}` 다. 실제로 그 env 에서는 `classification`
// 이 `'disabled'` 로 오지만 **오라클은 그 사실에 의존하지 않는다** — env 가 켜져
// 있다는 것은 companion 이 spawn 되지 않았다는 뜻이고, 그 판정은 하위 계층의
// 정직성과 무관하게 성립해야 한다(방어적 중복, fail-closed).

// `codex-invoke.js:14-22` 주석 헤더의 14종과 1:1. 이름을 그대로 쓰고 새 이름을
// 만들지 않는다.
const CLASSIFICATION_KIND = Object.freeze({
  'ok': 'reached',

  'disabled': 'env-policy',

  'registry-missing': 'not-installed',
  'registry-malformed': 'not-installed',
  'plugin-not-installed': 'not-installed',
  'install-path-stale': 'not-installed',
  'companion-not-found': 'not-installed',
  'companion-version-mismatch': 'not-installed',

  'not-authenticated': 'unauthenticated',

  'timeout': 'transport',
  'exit-nonzero': 'transport',
  'stdout-empty': 'transport',
  'spawn-enoent': 'transport',
  'parse-error': 'transport',
});

const KNOWN_CLASSIFICATIONS = Object.freeze(Object.keys(CLASSIFICATION_KIND));

const KINDS = Object.freeze(['env-policy', 'not-installed', 'unauthenticated', 'transport', 'reached']);

const REASON = Object.freeze({
  'env-policy': 'env-policy: MCCP_CODEX_DISABLED=1 — codex-invoke short-circuits before spawn, '
    + 'so the companion was never reached (this is a policy decision, not a contract observation)',
  'not-installed': 'not-installed: the codex plugin/companion could not be resolved on this machine',
  'unauthenticated': 'unauthenticated: the codex CLI is installed but not authenticated (/codex:setup)',
  'transport': 'transport: the companion could not be reached or produced no usable response',
  'reached': 'reached: the companion answered',
});

function reasonFor(kind, detail) {
  const base = REASON[kind] || ('unknown-kind: ' + kind);
  return detail ? base + ' [' + detail + ']' : base;
}

// classify({ env, invokeResult, registryProbe }) → { reachable, kind, reason }
//
// `registryProbe` 는 **선택 인자**다. 판정 순서가 env → invokeResult 이고 그 둘만으로
// 모든 `kind` 가 결정되므로 부재는 정상 경로이며, 오라클은 그것 때문에 다른 답을
// 내지 않는다. 존재할 때만 `not-installed` 를 **호출 이전에** 앞당겨 판정하는 데
// 쓰인다(정적 조건이라 spawn 없이 알 수 있다). 즉 *같은 답을 더 일찍* 주는 용도이지
// 답을 바꾸는 축이 아니다.
function classify(input) {
  const i = input || {};
  const env = i.env || {};

  // 1. env policy — 무조건 최우선.
  if (env.MCCP_CODEX_DISABLED === '1') {
    return { reachable: false, kind: 'env-policy', reason: reasonFor('env-policy') };
  }

  // 2. 정적 registry probe (있을 때만). spawn 없이 알 수 있는 not-installed 를 앞당긴다.
  const probe = i.registryProbe;
  if (probe && probe.installed === false) {
    return {
      reachable: false,
      kind: 'not-installed',
      reason: reasonFor('not-installed', probe.reason || 'registry probe says not installed'),
    };
  }

  // 3. 실제 호출 결과.
  const r = i.invokeResult;
  if (!r || typeof r !== 'object') {
    return {
      reachable: false,
      kind: 'transport',
      reason: reasonFor('transport', 'no invoke result to judge (call not made or result lost)'),
    };
  }

  const c = r.classification;
  const kind = Object.prototype.hasOwnProperty.call(CLASSIFICATION_KIND, c)
    ? CLASSIFICATION_KIND[c] : null;

  // 표를 벗어난 값은 **도달 성공으로 읽지 않는다**. enum 이 늘어났는데 오라클이
  // 모르는 상태를 통과시키면, 모르는 실패가 성공으로 계상된다.
  if (kind === null) {
    return {
      reachable: false,
      kind: 'transport',
      reason: reasonFor('transport', 'unknown classification "' + String(c) + '" (fail-closed)'),
    };
  }

  if (kind === 'reached') {
    return { reachable: true, kind: 'reached', reason: reasonFor('reached') };
  }
  return { reachable: false, kind: kind, reason: reasonFor(kind, 'classification=' + c) };
}

module.exports = {
  classify: classify,
  CLASSIFICATION_KIND: CLASSIFICATION_KIND,
  KNOWN_CLASSIFICATIONS: KNOWN_CLASSIFICATIONS,
  KINDS: KINDS,
};
