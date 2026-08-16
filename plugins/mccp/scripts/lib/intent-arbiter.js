'use strict';

// intent-arbiter — codex-intent-context M2의 심판 분리 오라클.
//
// M1은 판정 **누락**을 닫았고 M1.5는 **오심**을 반증 가능하게 만들었다. 둘 다 남긴
// 것이 하나 있다 — 심판이 여전히 저자다. `commands/plan.md` 5.5a에서 adjudication을
// 쓰는 것은 plan을 작성한 바로 그 세션이고, 그 세션은 자기 설계 근거를 전부 들고 있다.
//
// M2는 그 판정을 저자 컨텍스트를 상속하지 않는 fresh subagent로 옮긴다. 분리를
// 성립시키는 것은 "알려주지 않는다"가 아니라 **"열 수 없다"** 이다(DD1):
//
//   1. `mccp:intent-arbiter`의 도구는 `Write` 하나다 — 파일을 여는 수단이 없다.
//   2. 판정에 필요한 것은 아래 `buildArbiterProjection`이 **whitelist로** 뽑아
//      프롬프트에 인라인한다. blacklist가 아니라 whitelist인 것이 핵심이다 —
//      runner에 새 필드가 생겨도 자동으로 새어 들어오지 않는다.
//
// 순수성: fs / process / clock 없음 (intent-claims.js · intent-context.js 미러).
// 모든 I/O는 runner와 명령 본문이 소유한다.

const ARBITER_MODES = ['subagent', 'author'];

// 미설정·오타·`off` 전부 여기로 수렴한다. 조용히 최관대값(`author`)으로 떨어지면
// 오타 하나가 심판 분리를 통째로 끄고, 그 사실이 아무 데도 남지 않는다.
const DEFAULT_ARBITER_MODE = 'subagent';

// arbiter가 실제로 받는 것의 **전부**. 이 배열 바깥의 키는 입력에 무엇이 있든
// 출력에 나타나지 않는다 — 특히 `plan_path`(runner가 awaiting에 싣는다,
// plan-codex-runner.js:406)가 그렇다. `Read`가 없으므로 경로를 알아도 열 수는
// 없지만, 경로를 주지 않는 것이 두 번째 벽이다.
const ARBITER_PROJECTION_KEYS = Object.freeze([
  'review_payload_digest',
  'intent_items',
  'findings',
  'adjudication_path',
]);

// `finding` 본문만 원본 그대로 통과한다 — 그것이 arbiter가 판정해야 할 대상이다.
// 리뷰어가 자기 finding에 plan을 인용했다면 그것은 **리뷰의 일부**이지 우회 채널이
// 아니다. 나머지 항목 필드(`reviewer_claim_reason` 등)는 판정 입력이 아니므로 뺀다.
const ARBITER_FINDING_KEYS = Object.freeze([
  'finding_index',
  'finding_digest',
  'reviewer_claim',
  'reviewer_claim_status',
  'finding',
]);

// `section.items`는 현재 `{id, text, kind}` 닫힌 형태로만 생성된다
// (intent-context.js#extractIntentSection). 그래도 여기서 다시 좁히는 이유는
// whitelist 원칙이 최상위에만 걸리면 그 아래 한 단계가 곧 다음 누출 경로가 되기
// 때문이다 — 항목 형태가 언젠가 넓어져도 arbiter가 받는 것은 바뀌지 않는다.
const ARBITER_INTENT_ITEM_KEYS = Object.freeze(['id', 'text', 'kind']);

// 프롬프트 템플릿은 frozen 상수다. plan의 섹션명(`Design Decisions` 등)이나 plan
// 파일 위치를 **문구로도 언급하지 않는다** — 누출 회귀 test는 최종 문자열만 보므로,
// 템플릿이 구조를 이름으로 부르면 test는 통과하면서 anchoring 힌트가 새어 나간다.
const ARBITER_PROMPT_HEAD = Object.freeze([
  'You are the ARBITER for a review gate. You are NOT the author of the proposal',
  'under review, and you must not reason as if you were.',
  '',
  'Everything you need is in this prompt. You have no file-reading tool, so there',
  'is nothing to go and look up: no proposal body, no rationale, no prior',
  'discussion. That is deliberate. Your judgement must rest on the reviewer',
  'findings and the user-stated constraints below, and on nothing else.',
  '',
  '## User-stated constraints',
  '',
  'These are constraints the USER stated. They are not arguments made by the',
  'author in defence of the proposal — no such argument is available to you.',
].join('\n'));

const ARBITER_PROMPT_RULES = Object.freeze([
  '## Your task',
  '',
  'Produce exactly one adjudication entry for EVERY finding above — no gaps, no',
  'duplicates. A single omission makes the gate incomplete and no receipt is',
  'written.',
  '',
  'Each entry is an object with these fields:',
  '',
  '| Field | Rule |',
  '|---|---|',
  '| `finding_index` | copy verbatim from the finding |',
  '| `finding_digest` | copy verbatim from the finding |',
  '| `intent_conflict` | `"none"`, or the id of a constraint above that this finding contradicts |',
  '| `verdict` | `ACCEPT_NOW` / `DEFER_TO_BACKLOG` / `REJECT_YAGNI` / `REJECTED_BY_DESIGN` |',
  '| `rationale` | non-empty; why this verdict |',
  '| `intent_override_reason` | REQUIRED when `intent_conflict` is not `"none"` AND `verdict` is `ACCEPT_NOW` |',
  '| `intent_dispute_reason` | REQUIRED when `reviewer_claim` names a constraint id and your `intent_conflict` is not that same id. Explain why the reviewer is wrong. A one-token answer counts as no answer |',
  '',
  'Do NOT put `"none"` in `intent_conflict` for convenience. The gate mechanically',
  'catches a missing entry; it cannot catch a wrong label, which is exactly why',
  'the judgement was moved to you. If a finding contradicts a constraint, say so.',
  '',
  'Read `reviewer_claim_status`, not `reviewer_claim`: `"unclaimed"` means the',
  'reviewer was asked and did not answer usably, `null` means the reviewer was',
  'never asked. Neither is a claim you must respond to.',
  '',
  '## Output',
  '',
  'Write ONE file with the Write tool, to the path named in `adjudication_path`',
  'below with `.tmp` appended. Write nothing else, and do not write to any other',
  'path. Its content is a single JSON object:',
  '',
  '```json',
  '{',
  '  "round": 1,',
  '  "review_payload_digest": "<copy verbatim from the payload below>",',
  '  "adjudications": [ { ...one entry per finding... } ]',
  '}',
  '```',
].join('\n'));

function parseArbiterMode(env, onWarn) {
  const e = env || {};
  const raw = e.MCCP_INTENT_ARBITER;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_ARBITER_MODE;
  }
  const v = String(raw).trim().toLowerCase();
  if (ARBITER_MODES.indexOf(v) !== -1) return v;
  if (typeof onWarn === 'function') {
    onWarn('[mccp:intent-arbiter] unknown MCCP_INTENT_ARBITER="' + String(raw) +
      '" — falling back to ' + DEFAULT_ARBITER_MODE +
      ' (allowed: ' + ARBITER_MODES.join('|') + '). There is no "off" for this ' +
      'axis: turning the arbiter off means asking for ' + ARBITER_MODES[1] + '.');
  }
  return DEFAULT_ARBITER_MODE;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function pickKeys(source, keys) {
  const src = isPlainObject(source) ? source : {};
  const out = {};
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = src[keys[i]] === undefined ? null : src[keys[i]];
  }
  return out;
}

// buildArbiterProjection(awaitingJson) → arbiter가 받는 것의 전부.
//
// 키를 **빼는** 것이 아니라 **고르는** 것이다. 입력에 있는 다른 어떤 키도 출력에
// 나타나지 않으므로, awaiting 아티팩트에 새 필드가 추가돼도 이 함수를 고치지 않는 한
// arbiter는 그것을 보지 못한다.
function buildArbiterProjection(awaitingJson) {
  const a = isPlainObject(awaitingJson) ? awaitingJson : {};
  const items = Array.isArray(a.intent_items) ? a.intent_items : [];
  const findings = Array.isArray(a.findings) ? a.findings : [];
  const projection = {};
  projection.review_payload_digest =
    typeof a.review_payload_digest === 'string' ? a.review_payload_digest : null;
  projection.intent_items = items.map(function (it) {
    return pickKeys(it, ARBITER_INTENT_ITEM_KEYS);
  });
  projection.findings = findings.map(function (f) {
    return pickKeys(f, ARBITER_FINDING_KEYS);
  });
  projection.adjudication_path =
    typeof a.adjudication_path === 'string' ? a.adjudication_path : null;
  return projection;
}

// buildArbiterTaskPrompt({ projection, adjudicationPath }) → 결정적 문자열.
//
// awaiting 경로도 plan 경로도 인자로 받지 않는다. arbiter는 파일을 열 수 없으므로
// 그 경로들이 무의미하고, 시그니처가 곧 DD1의 강제다.
function buildArbiterTaskPrompt(opts) {
  const o = isPlainObject(opts) ? opts : {};
  const projection = isPlainObject(o.projection) ? o.projection : buildArbiterProjection(null);
  // 인자가 우선이고 투영이 fallback이다. 둘은 같은 경로여야 하지만 인자를 만드는 것은
  // 셸이고 투영을 만드는 것은 runner라, 인자가 비면 arbiter는 빈 `adjudication_path`를
  // 받아 아무 데도 쓰지 못한다. fallback이 없으면 `adjudication_path`는 whitelist에만
  // 있고 프롬프트에는 도달하지 않는 죽은 키가 된다 — 그 주석이 "arbiter가 받는 것의
  // 전부"라고 말하는 동안.
  const explicit = typeof o.adjudicationPath === 'string' ? o.adjudicationPath : '';
  const adjudicationPath = explicit !== '' ? explicit
    : (typeof projection.adjudication_path === 'string' ? projection.adjudication_path : '');
  return [
    ARBITER_PROMPT_HEAD,
    '',
    JSON.stringify(projection.intent_items, null, 2),
    '',
    '## Reviewer findings',
    '',
    JSON.stringify(projection.findings, null, 2),
    '',
    '## Payload binding',
    '',
    'review_payload_digest: ' + String(projection.review_payload_digest),
    'adjudication_path: ' + adjudicationPath,
    '',
    ARBITER_PROMPT_RULES,
  ].join('\n');
}

// resolveArbiterSeal({ requiredMode, degraded }) → { arbiter, reason, conflict }
//
// DD5 8·9번 규칙의 **유일한** 구현체. 봉인되는 값은 "subagent가 썼다"는 증명이
// 아니라 **"이 실행이 요구한 심판 모드와 관측된 강등"** 이다(DD4) — runner는 파일을
// 누가 썼는지 관측할 수 없다.
//
// `author`인데 강등 플래그가 실려 오면 모순이다: 강등할 것이 없다. 조용히 무시하면
// 파일이 주장하는 이력과 봉인값이 어긋난 채 통과한다.
function resolveArbiterSeal(opts) {
  const o = isPlainObject(opts) ? opts : {};
  const requiredMode = ARBITER_MODES.indexOf(o.requiredMode) !== -1
    ? o.requiredMode : DEFAULT_ARBITER_MODE;
  const degraded = isPlainObject(o.degraded) ? o.degraded : null;

  if (requiredMode === 'author') {
    if (degraded) return { arbiter: null, reason: null, conflict: true };
    return { arbiter: 'author', reason: null, conflict: false };
  }
  if (degraded) {
    return { arbiter: 'author', reason: degraded.reason, conflict: false };
  }
  return { arbiter: 'subagent', reason: null, conflict: false };
}

module.exports = {
  ARBITER_MODES: ARBITER_MODES,
  DEFAULT_ARBITER_MODE: DEFAULT_ARBITER_MODE,
  ARBITER_PROJECTION_KEYS: ARBITER_PROJECTION_KEYS,
  ARBITER_FINDING_KEYS: ARBITER_FINDING_KEYS,
  ARBITER_INTENT_ITEM_KEYS: ARBITER_INTENT_ITEM_KEYS,
  parseArbiterMode: parseArbiterMode,
  buildArbiterProjection: buildArbiterProjection,
  buildArbiterTaskPrompt: buildArbiterTaskPrompt,
  resolveArbiterSeal: resolveArbiterSeal,
};
