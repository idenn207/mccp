/**
 * session-identity.js — 세션 id 우선순위 체인의 단일 진실원 (v1.33.0 · MSW M8 DD1)
 *
 * 왜 이 모듈이 있는가
 * ────────────────────────────────────────────────────────────────────────────
 * `CLAUDE_SESSION_ID`는 이 하네스의 CLI가 **설정하지 않는다**. 그럼에도 런타임
 * 12곳이 그 이름을 단독으로 읽었고, 그중 넷(`observer-sessions` ·
 * `evidence-lock` · `orchestration-runaway` · `session-bridge`)은 서로 다른
 * 우선순위 체인을 각자 들고 있었다. 갈라진 체인 중 낡은 쪽을 쓰는 소비처는
 * 항상 빈 값을 받았고, 그 falsy 값이 `session-start.js` / `session-end.js`의
 * M2 계측 블록 **전체**를 실행되지 않게 만들었다 — A1 착수 · A2 종료 ·
 * B3 사용이력 세 축의 producer가 같은 한 줄 때문에 전부 죽어 있었다.
 *
 * `orchestration-runaway.js:550`의 주석이 이미 같은 결함을 한 번 진단했다.
 * 그때는 그 파일 하나만 고쳤고, 나머지 열한 곳은 그대로 남았다. 이 모듈은
 * 체인을 한곳으로 모아 "다음에 또 갈라지는" 경로를 없앤다.
 *
 * 무엇을 옮기고 무엇을 옮기지 않는가 (DD1)
 * ────────────────────────────────────────────────────────────────────────────
 * 옮기는 것은 **체인뿐**이다. 정규화는 각 소비처에 남긴다 — `evidence-lock`은
 * `null`을, `observer-sessions`는 `''`을, `orchestration-runaway`는
 * `'unknown'`을 반환하며 호출자들이 그 차이에 의존한다. 반환 계약을 통일하려
 * 들면 M3 증거 락과 이 milestone이 같은 커밋에서 섞인다.
 *
 * 잔여 위험 (구조가 아니라 test가 막는다)
 * ────────────────────────────────────────────────────────────────────────────
 * `resolveRawSessionId`는 **sanitize하지 않는다**. 그래서 raw 값이 파일명이나
 * `path.join`에 직접 닿으면 경로 주입이 된다. 이 모듈은 그 경로를 구조적으로
 * 막지 못하므로 — 막으려면 반환 계약을 통일해야 하고 그것이 위에서 배제한
 * 축이다 — `lib/tests/session-identity.test.js`가 (b) 단언으로 "raw 반환값이
 * 파일명 생산에 직접 도달하는 호출부 0건"을 스캔으로 단언한다. 구조적 보장이
 * 아니라 test 보장이라는 한계를 그대로 기록한다. 파일명을 만드는 지점은
 * 반드시 `utils.sanitizeSessionId`를 거쳐야 한다.
 */

'use strict';

/**
 * 세션 id 원값을 우선순위대로 해소한다.
 *
 * 우선순위: `MCCP_SESSION_ID`(명시 override) → `CLAUDE_CODE_SESSION_ID`(런타임이
 * 실제로 주입하는 이름) → `CLAUDE_SESSION_ID`(legacy — CLI가 설정하지 않지만
 * 외부 래퍼가 넘길 수 있어 마지막 후보로 남긴다).
 *
 * 정규화·sanitize·fallback 상수는 **호출자 몫**이다. 이 함수는 세 이름 중
 * 처음 발견된 비어있지 않은 문자열을 trim해서 돌려주고, 아무것도 없으면
 * 빈 문자열을 돌려준다. 빈 문자열을 고른 것은 세 소비처의 fallback
 * (`null` · `''` · `'unknown'`)이 전부 falsy 검사로 갈라지기 때문이다.
 *
 * @param {NodeJS.ProcessEnv} [env] 환경 객체. 생략하면 `process.env`.
 * @returns {string} 해소된 원값(미sanitize) 또는 `''`.
 */
function resolveRawSessionId(env) {
  const source = env || process.env;
  const raw = source.MCCP_SESSION_ID
    || source.CLAUDE_CODE_SESSION_ID
    || source.CLAUDE_SESSION_ID
    || '';
  return String(raw).trim();
}

/**
 * 체인이 읽는 이름을 우선순위 순으로 노출한다.
 *
 * test의 부재 단언(DD2)과 진단 출력이 이름 목록을 재입력하지 않게 하기 위한
 * 것이다 — 목록을 두 번 적으면 그것이 곧 다음 drift의 자리다.
 */
const SESSION_ID_ENV_NAMES = Object.freeze([
  'MCCP_SESSION_ID',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_SESSION_ID',
]);

module.exports = {
  resolveRawSessionId,
  SESSION_ID_ENV_NAMES,
};
