'use strict';

// santa/model-diversity — 모델 계열 다양성 oracle (santa-evidence-diversity M3 / P2 소유).
//
// `codex`도 `gemini`도 없는 머신에서 Reviewer B는 두 번째 Claude Opus로 떨어진다.
// 그 조합의 NICE는 이종 조합의 NICE와 **어느 표면에서도 구분되지 않았다** — 라운드
// 판정도, 봉인 verdict도, receipt도 같은 값을 냈다. 이 모듈은 원장에 이미 기록된
// 리뷰어 `model` 문자열에서 계열을 분류하고 "이 라운드가 실제로 이종이었는가"를
// 판정한다. 강등을 **적용**하는 것은 `seal.deriveVerdict`이고 여기는 판정만 한다.
//
// **순수 모듈이다.** 디스크·git·시각을 모르고 env는 아래 파서 2종만 읽는다
// (`lanes.js`·`terminator.js`·`gate.js`의 경계와 동형). 외부 require는
// `force-override-reason` 1개이고 그것은 `gate.js:42`가 이미 지고 있어 santa의 외부
// 의존 집합이 **늘지 않는다**.
//
// mirror: lanes.js:200-215 `laneCoverageFrom`(투영에서만 파생하는 순수 집계) ·
// lanes.js:81-95 `parseBlindLane`(열거 검사 후 loud fail-open) ·
// gate.js:175-201(`validateReason` 재구현 금지 — import해서 위임).

const { validateReason } = require('../../receipt/lib/force-override-reason');

// ── env 표면 2종 ─────────────────────────────────────────────────────────────
//
// **default가 `enforce`(발화 쪽)인 것은 의도다**(DD8). `off`가 default면 오타 하나가
// kill switch를 켜고 **그 실행이 M3 이전과 똑같아 보인다** — 이 milestone이 닫으려는
// 결함의 모양 그대로다. `MCCP_SANTA_BLIND_LANE`·`MCCP_SANTA_ALWAYS_SCOPE`·
// `MCCP_SANTA_TERMINATOR`가 같은 근거로 발화를 default에 둔다.
const ENV_DEGRADE_GATE = 'MCCP_SANTA_DEGRADE_GATE';
const DEGRADE_GATE_DEFAULT = 'enforce';
const DEGRADE_GATE_VALUES = ['enforce', 'off'];

// ack에는 default가 **없다** — 부재가 곧 "승인 없음"이고 그것이 안전한 쪽이다.
const ENV_DEGRADE_ACK = 'MCCP_SANTA_DEGRADE_ACK';

// ── 계열 카탈로그 ────────────────────────────────────────────────────────────
//
// 이 저장소가 실제로 띄우는 리뷰어의 모델명만 담는다. 카탈로그를 넓히는 것은 1줄
// PR이고, 그 비용이 낮다는 사실이 아래 fail-closed를 감당 가능하게 만든다(DD3).
const FAMILIES = ['anthropic', 'openai', 'google'];
const FAMILY_UNKNOWN = 'unknown';

const FAMILY_TOKENS = {
  anthropic: ['claude', 'opus', 'sonnet', 'haiku', 'anthropic'],
  openai: ['gpt', 'codex', 'openai'],
  google: ['gemini', 'google'],
};

// 봉인되는 degrade 사유. **projection에서 파생 가능한 두 값뿐이다**(DD7) — 의도적
// 비활성(`MCCP_CODEX_DISABLED=1`)과 미가용(`PATH`에 없음)의 구분은 봉인 시점에
// 다시 관측해야 하는 사실이고, 그 관측은 리뷰어가 실제로 돈 시점과 어긋날 수 있다.
// 그런 값을 receipt에 실으면 "봉인 시점에 이랬다"를 라운드의 사실처럼 보여준다.
// 그 구분은 `santa-loop.md` Step 5.5의 **정지 메시지**가 그 자리에서 설명한다.
const DEGRADE_REASONS = ['same_family', 'unknown_model'];

function warn(line) {
  process.stderr.write('[mccp:santa-model-diversity] ' + line + '\n');
}

function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ── 계열 분류 ────────────────────────────────────────────────────────────────
//
// familyOf(model) → 'anthropic' | 'openai' | 'google' | 'unknown'
//
// 전역 함수 규약: 어떤 입력에도 던지지 않는다.
//
// **`typeof` 가드가 어떤 코어션보다 먼저다**(security-reviewer F4). `String(model)`을
// 먼저 부르면 `{toString(){return 'gpt-5.4'}}` 같은 값이 계열을 산다. 그 입력이
// 도달 불가능하지 않다: `--model`은 `cli.js:326`이 문자열로 검사하지만, 이 함수의
// 다른 입력원인 `seal.project()`의 `e.model`은 **원장에서 읽은 값**이라 그 검사를
// 거치지 않는다(레인 필드가 없던 시절의 legacy 원장도 같은 경로다).
//
// **매치된 계열이 정확히 1이 아니면 `unknown`이다**(security-reviewer F1 흡수).
// 리뷰어의 처방은 "명시적 precedence 표"였고 채택하지 않았다 — precedence는
// `claude-gpt-bridge`처럼 두 카탈로그에 동시에 걸리는 문자열에 *어떤 계열이든 하나를
// 준다*. 그 하나가 상대 리뷰어와 다르면 곧바로 이종 판정(`degraded=false`)을 사는데,
// 그 문자열이 실제로 무엇이었는지는 아무도 모른다. DD3이 세운 원칙은 "모르겠다가
// 승인을 사지 못하게 한다"이고, 동시에 걸리는 문자열은 **모르는 것**이다. 0건도
// unknown, 2건 이상도 unknown — precedence보다 엄격하고 DD3의 판정 순서를 바꾸지 않는다.
function familyOf(model) {
  if (typeof model !== 'string') return FAMILY_UNKNOWN;
  const s = model.trim().toLowerCase();
  if (s === '') return FAMILY_UNKNOWN;

  const hits = FAMILIES.filter(function (fam) {
    return FAMILY_TOKENS[fam].some(function (tok) { return s.indexOf(tok) !== -1; });
  });
  return hits.length === 1 ? hits[0] : FAMILY_UNKNOWN;
}

// ── env 파서 ─────────────────────────────────────────────────────────────────
//
// 미설정은 default, 열거 밖은 loud stderr warn 후 default. trim + 소문자 정규화를
// 먼저 한다(`Off`/` enforce `가 오타로 취급돼 warn을 내는 것은 소음이다).
// 던지지 않는다 — "gate를 못 읽어서 강등을 건너뛴다"는 분기가 존재하지 않는다.
function parseDegradeGate(env) {
  const raw = env && env[ENV_DEGRADE_GATE];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEGRADE_GATE_DEFAULT;
  }
  const v = String(raw).trim().toLowerCase();
  if (DEGRADE_GATE_VALUES.indexOf(v) === -1) {
    warn(ENV_DEGRADE_GATE + ' must be one of ' + JSON.stringify(DEGRADE_GATE_VALUES) +
      '; got "' + raw + '". Falling back to default "' + DEGRADE_GATE_DEFAULT + '".');
    return DEGRADE_GATE_DEFAULT;
  }
  return v;
}

// parseDegradeAck(env) → { ok, reason, rejectedBecause }
//
// strict `validateReason`에 **그대로 위임한다** — 이 파일이 자체 문자열 규칙을 만들면
// override 표면마다 기준이 갈리고 원본이 바뀔 때 두 사본이 어긋난다(`gate.js:175`가
// 같은 이유로 import한다). `allowCodeVocabulary`는 넘기지 않는다: 이것은 push 게이트를
// 여는 **override 표면**이고 §3.13.1이 면제 대상에서 명시적으로 제외한 쪽이다.
//
// 미설정과 거부를 같은 모양(`ok:false`)으로 내되 `rejectedBecause`로 구분한다 —
// 호출자가 "승인이 없었다"와 "승인이 거부됐다"를 다르게 안내해야 한다.
function parseDegradeAck(env) {
  const raw = env && env[ENV_DEGRADE_ACK];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: false, reason: null, rejectedBecause: 'absent' };
  }
  const v = validateReason(raw, { strict: true });
  if (!v.ok) return { ok: false, reason: null, rejectedBecause: v.reason };
  return { ok: true, reason: String(raw).trim(), rejectedBecause: null };
}

// ── 다양성 판정 ──────────────────────────────────────────────────────────────
//
// diversityFrom(projection) → { finalIndex, models, families, distinctFamilies,
//                               unknownCount, degraded, reason }
//
// 순수 집계이고 **어떤 입력에도 던지지 않는다**. 입력은 `seal.js#project`의 반환이고,
// legacy 투영(`model` 필드 부재)은 `familyOf`가 unknown으로 접는다.
//
// **FINAL 라운드 하나만 본다.** `deriveVerdict`가 같은 라운드에서 판정하므로 두 함수가
// 다른 라운드를 보면 봉인이 자기모순이 된다 — 최종 라운드는 이종인데 중간 라운드의
// 동일 계열을 이유로 강등하거나, 그 반대가 된다.
//
// 판정은 DD3의 **두 줄이고 순서가 전부다**:
//   1. 어느 리뷰어의 계열이든 `unknown`이면 → degraded, reason `unknown_model`
//   2. 아니면서 distinct 계열이 2 미만이면 → degraded, reason `same_family`
//
// 반대로 두면 오탈자 하나나 신규 모델명 하나가 곧바로 이종 판정을 얻는다 — M3이
// 닫으려는 결함(구분되지 않는 NICE)을 이름만 바꿔 되살리는 것이다. "모르겠다"가
// 승인을 사지 못하게 하는 것이 이 순서의 전부다.
function diversityFrom(projection) {
  const rounds = (isRecord(projection) && Array.isArray(projection.rounds))
    ? projection.rounds : [];

  // 라운드 0건은 **관측이 없는 상태**이지 이종이 아니다. 여기서 degraded=false를
  // 내면 빈 원장이 다양성을 주장한다.
  if (rounds.length === 0) {
    return {
      finalIndex: null, models: [], families: [], distinctFamilies: 0,
      unknownCount: 0, degraded: true, reason: 'unknown_model',
    };
  }

  const finalIndex = rounds.length - 1;
  const fin = rounds[finalIndex];
  const reviewers = (isRecord(fin) && Array.isArray(fin.reviewers)) ? fin.reviewers : [];

  const models = reviewers.map(function (r) {
    return (isRecord(r) && typeof r.model === 'string') ? r.model : null;
  });
  const families = reviewers.map(function (r) {
    return familyOf(isRecord(r) ? r.model : undefined);
  });

  const unknownCount = families.filter(function (f) { return f === FAMILY_UNKNOWN; }).length;
  const distinct = [];
  families.forEach(function (f) {
    if (f !== FAMILY_UNKNOWN && distinct.indexOf(f) === -1) distinct.push(f);
  });

  let degraded;
  let reason;
  // 리뷰어 0건도 `unknown_model`이다 — 관측된 계열이 없는 것이지 동일 계열이 아니다.
  if (reviewers.length === 0 || unknownCount > 0) {
    degraded = true;
    reason = 'unknown_model';
  } else if (distinct.length < 2) {
    degraded = true;
    reason = 'same_family';
  } else {
    degraded = false;
    reason = null;
  }

  return {
    finalIndex: finalIndex,
    models: models,
    families: families,
    distinctFamilies: distinct.length,
    unknownCount: unknownCount,
    degraded: degraded,
    reason: reason,
  };
}

module.exports = {
  ENV_DEGRADE_GATE: ENV_DEGRADE_GATE,
  DEGRADE_GATE_DEFAULT: DEGRADE_GATE_DEFAULT,
  DEGRADE_GATE_VALUES: DEGRADE_GATE_VALUES,
  ENV_DEGRADE_ACK: ENV_DEGRADE_ACK,
  FAMILIES: FAMILIES,
  FAMILY_UNKNOWN: FAMILY_UNKNOWN,
  DEGRADE_REASONS: DEGRADE_REASONS,
  familyOf: familyOf,
  parseDegradeGate: parseDegradeGate,
  parseDegradeAck: parseDegradeAck,
  diversityFrom: diversityFrom,
};
