'use strict';

// env-contract/value.js — 환경변수 값 규약의 단일 판정 지점 (v1.29.1).
//
// 이전에는 production 코드에 boolean 토글을 읽는 파싱 규약이 **8종** 공존했다.
// 같은 저장소에서 `MCCP_SUBSCRIPTION=true`는 무시되고 `MCCP_ORCHESTRATION_USD_BOMB=true`는
// 켜졌다 — 운영자가 어느 규칙을 기억해야 하는지 알 방법이 없었다. 여기서 규약은 둘이고,
// 그 경계에는 검사 가능한 기준이 있다.
//
//   bool         문서 표기는 예외 없이 `on | off`. 파서는 대소문자를 무시하고
//                TRUE_ALIASES / FALSE_ALIASES를 받는다.
//   bypass-flag  문서 표기는 `1 | unset`. 수용 집합은 **오늘과 바이트 단위로 동일**하며
//                `BYPASS_ACTIVATING_LITERAL` 하나만 활성화한다. 별칭을 더하지 않는다.
//
// 소속 기준은 «활성화가 adversarial review 게이트를 제거하거나 약화하는가»다. 이름에
// `DISABLE`이 들어가는 것이 기준이 아니다 — `MCCP_AUTO_CHAIN_DISABLE`은 자동 진행만
// 멈출 뿐 명령을 직접 호출하면 게이트가 그대로 도므로 `bool`이다.
//
// **불량값의 처리 방향** — 열거 밖 값은 그 토글의 레지스트리 default로 되돌리고 loud warn을
// 낸다. 여기서 보장되는 명제는 «오늘 대비 권한을 넓히지 않는다»이지 «항상 제한적이다»가
// **아니다**. `MCCP_ORCHESTRATION_COST_FAIL_OPEN`처럼 default가 그 자체로 관대한 토글이
// 있고, 그 경우 default 복귀는 관대한 결과다 — 다만 오늘의 `!== '0'` 비교도 garbage에
// 대해 똑같이 관대하므로 **이동이 0**이다. default 자체를 안전 쪽으로 바꾸는 것은 각
// 소비처의 fail 방향을 하나씩 판정해야 하는 별개 축이다(DD6와 같은 부류).
//
// 극성은 레지스트리가 선언하고 이 모듈은 읽기만 한다(DD2). 호출부가 default를 인라인으로
// 넘기게 두면 같은 토글이 두 파일에서 다른 default를 갖는 오늘의 상태가 재생산된다.
// 레지스트리에 없는 이름으로 호출하면 **throw** — 미등재 토글이 조용히 동작하는 경로를
// 코드 수준에서 닫는다.
//
// mirror: lib/review-single-pass.js:49 `parseSinglePass` — 열거 검사 + 불량값 loud warn +
//         권한 비확대 방향 fail. 그 파일의 «두 파서의 fail 방향이 반대인 것은 의도적이다»가
//         여기서는 kind 분기로 나타난다.

const registry = require('./registry');

// DD1의 별칭 집합. `enabled`는 규약 3(hooks/ecc-context-monitor.js:47)이 이미 받고 있어
// 빼면 기존 설정이 깨지므로 상위집합에 포함하고, 대칭을 위해 `disabled`를 함께 넣는다.
const TRUE_ALIASES = Object.freeze(['on', '1', 'true', 'yes', 'enabled']);
const FALSE_ALIASES = Object.freeze(['off', '0', 'false', 'no', 'disabled']);

// bypass-flag를 활성화하는 유일한 리터럴. 이 값은 **넓히지 않는다** — 넓히는 순간
// 잠들어 있던 `MCCP_SKIP_RECEIPT=true` 류가 게이트를 우회하게 된다.
const BYPASS_ACTIVATING_LITERAL = '1';

const TRUE_SET = new Set(TRUE_ALIASES);
const FALSE_SET = new Set(FALSE_ALIASES);

function warn(line) {
  process.stderr.write('[mccp:env-contract] ' + line + '\n');
}

function entryOf(name) {
  const e = registry.get(name);
  if (!e) {
    throw new Error(
      'env-contract: unregistered toggle "' + String(name) + '". ' +
      'Add it to plugins/mccp/scripts/lib/env-contract/registry.js — an unregistered ' +
      'toggle that still works is exactly the drift this module exists to close.'
    );
  }
  return e;
}

function rawOf(env, name) {
  const src = env || {};
  // 상속 멤버를 값으로 오인하지 않는다 — `env`가 평범한 객체일 때 `toString` 같은
  // 이름이 함수를 돌려주는 것을 막는다.
  if (!Object.prototype.hasOwnProperty.call(src, name)) return undefined;
  return src[name];
}

function isUnset(raw) {
  return raw === undefined || raw === null || String(raw) === '';
}

function defaultBool(entry) {
  return entry.default === 'on';
}

// parseBool(env, name) → boolean
//
// kind로 분기한다. 두 분기는 서로 다른 계약이고, 그 차이가 이 모듈의 존재 이유다.
function parseBool(env, name) {
  const entry = entryOf(name);
  if (entry.kind !== 'bool' && entry.kind !== 'bypass-flag') {
    throw new Error('env-contract: parseBool called on kind="' + entry.kind + '" toggle ' + name);
  }
  const raw = rawOf(env, name);

  if (entry.kind === 'bypass-flag') {
    // 오늘과 바이트 단위로 동일: trim도 대소문자 접기도 하지 않는다. `' 1'`·`'1 '`·
    // `'01'`·`'true'`는 전부 미설정과 같다. 여기에 warn을 두지 않는 것은 DD3의
    // 결정이다 — 관측은 차단이 아니고, 이 kind는 애초에 동작이 바뀌지 않았다.
    // 운영자를 향한 안내는 상세 문서가 맡는다(docs/environment/gates.md).
    return raw === BYPASS_ACTIVATING_LITERAL;
  }

  if (isUnset(raw)) return defaultBool(entry);
  const v = String(raw).trim().toLowerCase();
  if (TRUE_SET.has(v)) return true;
  if (FALSE_SET.has(v)) return false;
  warn(name + ' must be one of [' + registry.BOOL_VALUES.join('|') + '] ' +
    '(also accepted: ' + TRUE_ALIASES.concat(FALSE_ALIASES).join(', ') + '); got "' + String(raw) +
    '". Falling back to the registry default "' + entry.default + '" — a typo must not ' +
    'widen what the toggle permits.');
  return defaultBool(entry);
}

// parseEnum(env, name) → string | null
function parseEnum(env, name) {
  const entry = entryOf(name);
  if (entry.kind !== 'enum') {
    throw new Error('env-contract: parseEnum called on kind="' + entry.kind + '" toggle ' + name);
  }
  const allowed = entry.values || [];
  const raw = rawOf(env, name);
  if (isUnset(raw)) return entry.default;
  const v = String(raw).trim();
  if (allowed.indexOf(v) !== -1) return v;
  warn(name + ' must be one of [' + allowed.join('|') + ']; got "' + String(raw) +
    '". Falling back to the registry default ' +
    (entry.default === null ? '(none — returning null)' : '"' + entry.default + '"') + '.');
  return entry.default;
}

// parseIntInRange(env, name, opts) → number | null
//
// opts.min / opts.max는 소비처가 아는 범위다. 레지스트리는 범위를 선언하지 않는다 —
// 범위는 kind가 아니라 소비처의 계약이고, 여기에 넣으면 같은 int가 두 소비처에서
// 다른 범위를 갖는 경우를 표현할 수 없다.
function parseIntInRange(env, name, opts) {
  const entry = entryOf(name);
  if (entry.kind !== 'int') {
    throw new Error('env-contract: parseIntInRange called on kind="' + entry.kind + '" toggle ' + name);
  }
  const o = opts || {};
  const fallback = entry.default === null ? null : Number.parseInt(entry.default, 10);
  const raw = rawOf(env, name);
  if (isUnset(raw)) return fallback;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n)) {
    warn(name + ' must be an integer; got "' + String(raw) + '". Falling back to ' +
      (fallback === null ? '(none — returning null)' : String(fallback)) + '.');
    return fallback;
  }
  if (Number.isFinite(o.min) && n < o.min) {
    warn(name + '=' + n + ' is below the minimum ' + o.min + '. Falling back to ' + String(fallback) + '.');
    return fallback;
  }
  if (Number.isFinite(o.max) && n > o.max) {
    warn(name + '=' + n + ' is above the maximum ' + o.max + '. Falling back to ' + String(fallback) + '.');
    return fallback;
  }
  return n;
}

// parseList(env, name) → string[]
function parseList(env, name) {
  const entry = entryOf(name);
  if (entry.kind !== 'list') {
    throw new Error('env-contract: parseList called on kind="' + entry.kind + '" toggle ' + name);
  }
  const raw = rawOf(env, name);
  const source = isUnset(raw) ? (entry.default === null ? '' : entry.default) : String(raw);
  return source.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

module.exports = {
  TRUE_ALIASES: TRUE_ALIASES,
  FALSE_ALIASES: FALSE_ALIASES,
  BYPASS_ACTIVATING_LITERAL: BYPASS_ACTIVATING_LITERAL,
  parseBool: parseBool,
  parseEnum: parseEnum,
  parseIntInRange: parseIntInRange,
  parseList: parseList,
};
