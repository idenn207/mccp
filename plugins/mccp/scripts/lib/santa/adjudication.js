'use strict';

// santa/adjudication — 판정 원장 (santa-adjudication M2 / P1 소유).
//
// 원장은 **관측 기록**이고 판정은 fold의 결과다(DD1). `entries`는 append-only이며
// 같은 issue에 대한 판정이 두 번 들어와도 지우지 않는다 — 소비자가 fold로 유효
// 판정을 얻고(같은 `issue_id`에 대해 **배열 뒤쪽**이 이긴다), `duplicates`가 발생
// 횟수를 남긴다. 중복을 *막지* 않는 이유는 `ledger.appendEntry`가 P0 동결
// 시그니처라 술어를 lock **안에서** 판정할 자리가 없기 때문이다(UI14). 검사를 lock
// 밖에 두면 동시 append 둘이 나란히 통과하는 TOCTOU이므로, 막지 않고 흡수한다.
//
// **순수 모듈이다.** 디스크·시각을 모르고, env는 아래 파서 2종만 읽는다
// (`gate.js`의 DD3a 경계와 동형 — 판정 함수는 인자만 본다). `at`을 인자로 받는 것이
// 그 경계의 다른 절반이다: 구성 함수는 시각을 모르고 CLI가 준다. 그래야 fold ·
// coverage · buildEntry 전부가 결정적으로 test된다.
//
// **손상 entry는 throw가 아니다**(DD1). `parseState`가 `rounds`·`schema_version`에
// 대해 throw하는 것은 그 값이 캡을 결정하기 때문이고(캡이 0으로 리셋되면 루프가
// 무한해진다), `entries`는 그 축이 아니다. 손상 행은 `malformed`로 계수하고
// **suppression에도 coverage에도 기여하지 않는다** — 양쪽 모두 fail-closed 방향이다
// (읽을 수 없는 판정은 blocking을 지우지도, 판정 의무를 면제하지도 않는다).
//
// 어휘(`DISPOSITIONS` · `SUPPRESSING`)와 이력 선택 규칙(`lastBefore`)의 **정본은
// `gate.js`다.** 이 모듈이 gate를 import하는 방향은 하나뿐이고(`issueIdOf` 때문에
// 이미 그렇다) 반대 방향은 순환이 된다. 그래서 gate가 소유하고 여기서 재사용한다 —
// 베껴 두면 원본이 바뀔 때 두 사본이 갈리고 그 갈림은 어떤 test도 잡지 않는다.

const gate = require('./gate');
const { validateReason } = require('../../receipt/lib/force-override-reason');

// `entries`의 행 종류 태그. 훗날 다른 종류가 생겨도 fold가 자기 것만 골라 읽는다.
const ENTRY_KIND = 'adjudication';

// `cli.js#deriveFinding`의 `MAX_CLAIM_CHARS`와 같은 값이다 — claim은 그 경로를
// 지나 원장에 들어오므로 여기서 더 좁게 잡으면 기록 가능한 지적을 판정 불가로
// 만든다. `evidence` 상한만 다르다(사유는 claim보다 길 수 있다 — DD2).
const MAX_CLAIM_CHARS = 500;
const MAX_EVIDENCE_CHARS = 2000;

const ENV_ADJUDICATION_GATE = 'MCCP_SANTA_ADJUDICATION_GATE';
const ENV_LEDGER_SUPPRESSION = 'MCCP_SANTA_LEDGER_SUPPRESSION';
const GATE_DEFAULT = 'enforce';
const GATE_VALUES = ['enforce', 'off'];

class SantaAdjudicationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'SantaAdjudicationError';
  }
}

function warn(line) {
  process.stderr.write('[mccp:santa-adjudication] ' + line + '\n');
}

function invalid(message) {
  return new SantaAdjudicationError('SANTA_ADJUDICATION_INVALID', message);
}

// ── env 파서 2종 ─────────────────────────────────────────────────────────────
//
// `parseSeverityGate`와 같은 규약이다 — 미설정은 default, 열거 밖은 loud stderr
// warn 후 default. M1이 그 fallback을 정당화하는 데 세 항의 근거를 대야 했던 것은
// `MCCP_SANTA_SEVERITY_GATE`의 `off`가 *더* 엄격했기 때문인데, 여기서는 그
// 비대칭이 없다: 아래 둘 모두 default가 엄격한 쪽이거나(gate) M1 대비 완화의
// 대상이라(suppression) 불량값이 default로 떨어지는 것이 곧 안전한 쪽이다.
function parseEnum(env, name) {
  const raw = env && env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return GATE_DEFAULT;
  const v = String(raw).trim();
  if (GATE_VALUES.indexOf(v) === -1) {
    warn(name + ' must be one of [' + GATE_VALUES.join('|') + ']; got "' + raw +
      '". Falling back to default ' + GATE_DEFAULT + '.');
    return GATE_DEFAULT;
  }
  return v;
}

// begin-round coverage 선검사 하나를 끈다. `off`는 **덜 엄격한** 방향이다.
function parseAdjudicationGate(env) { return parseEnum(env, ENV_ADJUDICATION_GATE); }

// 종결 항목의 blocking 면제 하나를 끈다. `off`는 **더** 엄격한 방향(M1 등가)이고,
// 같은 원장에 대해 켠 판정과 끈 판정을 비교하는 **대조군 도구**이기도 하다(DD7).
//
// 의미가 "사후에 suppression을 되돌린다"가 아니라 **"suppression 경로를 아예 타지
// 않는다"**인 것에 주의한다(security-reviewer F6). `off`에서 `cmdVerdict`는
// `resolved`를 넘기지 않으므로 `decideAdjudicatedVerdict`는 M1과 같은 계산을 하고,
// 반환의 `blocking`은 raw와 effective가 같은 배열이 된다.
function parseLedgerSuppression(env) { return parseEnum(env, ENV_LEDGER_SUPPRESSION); }

// ── 행 스키마 (DD2 — UI4의 코드화) ───────────────────────────────────────────
//
// PRD 문언 `round | issue | ABSORBED(proof) | REJECTED(reason)`의 네 축을 필드로
// 편다. 반환은 **정확히 8필드**이고 그 외 키를 더하지 않는다.
//
// `issue_id`는 인자가 아니라 `gate.issueIdOf(claim)`으로 **파생**한다 — 호출자가
// id를 주면 claim과 어긋난 행을 만들 수 있고, 그 행은 어떤 재등장도 suppress하지
// 못하면서 coverage만 충족시킨다. `buildEntry`가 `issue_id`를 만드는 유일한
// 경로라는 것이 이 규칙의 전부다(security-reviewer F2).
function checkShape(input) {
  const o = (input !== null && typeof input === 'object' && !Array.isArray(input)) ? input : {};

  if (!Number.isInteger(o.round) || o.round < 0) {
    return 'round must be a non-negative integer; got ' + JSON.stringify(o.round);
  }
  if (typeof o.claim !== 'string' || o.claim.length < 1 || o.claim.length > MAX_CLAIM_CHARS) {
    return 'claim must be a string of 1..' + MAX_CLAIM_CHARS + ' chars';
  }
  // **blocking severity만 판정 대상이다**(DD2). MEDIUM·LOW는 애초에 라운드를 하나
  // 더 태우지 않으므로 판정할 것이 없고, 판정을 요구하면 coverage 게이트가 모든
  // remark에 30자 사유를 강제해 루프가 멈춘다. 보존은 M1이 이미 한다.
  if (gate.BLOCKING_SEVERITIES.indexOf(o.severity) === -1) {
    return 'severity must be one of [' + gate.BLOCKING_SEVERITIES.join('|') +
      ']; got ' + JSON.stringify(o.severity);
  }
  if (gate.DISPOSITIONS.indexOf(o.disposition) === -1) {
    return 'disposition must be one of [' + gate.DISPOSITIONS.join('|') +
      ']; got ' + JSON.stringify(o.disposition);
  }
  if (typeof o.evidence !== 'string' || o.evidence.length > MAX_EVIDENCE_CHARS) {
    return 'evidence must be a string of at most ' + MAX_EVIDENCE_CHARS + ' chars';
  }
  // 실질성은 `validateReason`에 **위임**한다(재구현 금지). `widthNormalized`를
  // 지나는 이유는 `gate.js`의 그 함수 주석이 갖는다 — 같은 하한이 gate와
  // adjudication에서 다르게 걸리면 "blocking으로 인정된 시나리오를 사유로 그대로
  // 붙여넣었는데 기각 사유로는 거부된다"가 성립한다.
  const r = validateReason(gate.widthNormalized(o.evidence),
    { strict: true, allowCodeVocabulary: true });
  if (!r.ok) {
    return 'evidence is not substantive (' + (r.reason || 'rejected') +
      '): a disposition must carry a proof (absorbed) or a reason (rejected)';
  }
  if (typeof o.at !== 'string' || Number.isNaN(Date.parse(o.at))) {
    return 'at must be a parseable ISO timestamp string; got ' + JSON.stringify(o.at);
  }
  return null;
}

function buildEntry(input) {
  const bad = checkShape(input);
  if (bad) throw invalid(bad);
  return {
    kind: ENTRY_KIND,
    round: input.round,
    issue_id: gate.issueIdOf(input.claim),
    claim: input.claim,
    severity: input.severity,
    disposition: input.disposition,
    evidence: input.evidence,
    at: input.at,
  };
}

// 저장된 행이 `buildEntry`가 낼 수 있는 형태인지 본다. 형태 검사에 더해 **id ↔
// claim 결속**을 재검증하는 것이 요점이다: 손으로 편집된 원장은 claim과 무관한
// `issue_id`를 담을 수 있고, 그 행은 실재하지 않는 지적을 "종결"로 만들거나
// (suppression) 판정 의무를 면제한다(coverage). 결속이 깨진 행은 `malformed`이므로
// 어느 쪽에도 기여하지 않는다 — 그것이 이 검사가 fail-closed인 방식이다.
function foldFailure(entry) {
  // `kind`를 **여기서** 요구한다(`buildEntry`의 입력 검사가 아니라). 그 함수는
  // 태그를 스스로 붙이므로 입력에 받을 것이 없고, 반대로 fold는 저장된 행을 보므로
  // 태그가 계약의 일부다. 다른 문자열은 `foldEntries`가 이 함수에 오기 전에
  // 걸러 내므로(남의 행), 여기 도달하는 태그 위반은 **부재이거나 비문자열** —
  // 즉 adjudication 행이라고 주장하면서 그 주장을 표시하지 않은 행뿐이다.
  if (entry.kind !== ENTRY_KIND) {
    return 'kind must be "' + ENTRY_KIND + '"; a row that omits the tag cannot be ' +
      'distinguished from a future writer\'s row';
  }
  const bad = checkShape(entry);
  if (bad) return bad;
  if (entry.issue_id !== gate.issueIdOf(entry.claim)) {
    return 'issue_id does not match issueIdOf(claim) — the row was not produced by buildEntry';
  }
  return null;
}

// ── fold (DD1) ───────────────────────────────────────────────────────────────
//
// **입력 필터가 먼저다.** `kind`가 *다른 문자열*인 행은 남의 행이므로 검증 이전에
// 조용히 건너뛰고 `malformed`에도 `counts`에도 들어가지 않는다(손상이 아니라
// 무관). 반대로 `kind`가 **부재하거나 문자열이 아닌** 행은 adjudication 후보로
// 보고 스키마 검증에 넘긴다 → 미달이면 `malformed`. 이쪽을 "남의 행"으로 접으면
// 태그를 빠뜨린 writer의 행이 조용히 사라지는데, `malformed`는 suppression에도
// coverage에도 기여하지 않으므로 어느 쪽으로도 게이트를 열지 않는다.
//
// **전역 함수(total)다** — 비배열·null·undefined에 던지지 않고 빈 fold를 낸다.
// `decideAdjudicatedVerdict`와 `cmdBeginRound` 양쪽이 legacy 원장(= `entries`
// 부재)에서 이것을 부르므로, 던지면 그 경로 전체가 죽는다.
function emptyFold() {
  return {
    history: new Map(),
    resolution: new Map(),
    byRoundIssue: new Set(),
    counts: { absorbed: 0, rejected: 0, skipped: 0, reopened: 0 },
    duplicates: 0,
    malformed: 0,
  };
}

function foldEntries(entries) {
  const fold = emptyFold();
  if (!Array.isArray(entries)) return fold;

  const seenRoundIssue = new Set();
  entries.forEach(function (e) {
    const isRecord = e !== null && typeof e === 'object' && !Array.isArray(e);
    if (isRecord && typeof e.kind === 'string' && e.kind !== ENTRY_KIND) return;  // 남의 행
    if (!isRecord || foldFailure(e) !== null) { fold.malformed += 1; return; }

    // 이력 전체가 필요하다 — DD13 때문에 "최신 하나"로는 부족하다. 라운드 N의
    // 판정은 `round < N`인 항목 중 마지막이고, 그 선택은 질의 라운드마다 다르다.
    let hist = fold.history.get(e.issue_id);
    if (!hist) { hist = []; fold.history.set(e.issue_id, hist); }
    hist.push(e);

    fold.resolution.set(e.issue_id, e);          // 이력의 마지막. 보고 전용.
    const key = e.round + ':' + e.issue_id;
    if (seenRoundIssue.has(key)) fold.duplicates += 1;
    seenRoundIssue.add(key);
    fold.byRoundIssue.add(key);
    fold.counts[e.disposition] += 1;
  });

  return fold;
}

// ── coverage (DD6) ───────────────────────────────────────────────────────────
//
// 라운드 N의 effective blocking 전건에 대해 `round === N`인 entry가 있어야 한다.
// **라운드 결속이 필수다**: entry가 `issue_id`만 갖는다면 라운드 N에서 `reopened`된
// 지적이 라운드 N+1에 재등장했을 때 "이미 판정된 것"으로 읽혀 coverage가 통과하고,
// `reopened`가 자기 자신을 면제하는 고리가 된다. 판정은 **그 라운드의 제기**에
// 대한 것이다.
//
// **`issueId`가 없는 blocking 행은 uncovered로 떨어뜨린다.** 비문자열·빈 문자열이면
// `<round>:undefined` 키를 만들지 말고 그 행을 `missing`에 `{issueId:null}`로 담는다.
// 이 규칙이 없으면 필드가 유실됐을 때 coverage가 **늘 통과**하고 suppression이
// **늘 0건**이 되는데, 그 조합은 크래시가 아니라 게이트가 조용히 꺼진 상태다.
// (생산 지점의 build-time 가드는 커버리지 56이고 이것은 runtime 가드다 — 둘은
// 대체재가 아니다.)
function coverageOf(opts) {
  const o = opts || {};
  const list = Array.isArray(o.effectiveBlocking) ? o.effectiveBlocking : [];
  const folded = o.folded && o.folded.byRoundIssue instanceof Set ? o.folded : emptyFold();
  // 라운드를 모르면 키를 만들 수 없다 → 어느 행도 "판정됐다"를 증명하지 못한다.
  const roundKnown = Number.isInteger(o.round);
  const missing = [];

  list.forEach(function (b) {
    const row = (b !== null && typeof b === 'object') ? b : {};
    const hasId = typeof row.issueId === 'string' && row.issueId.length > 0;
    if (!hasId) {
      missing.push({ issueId: null, claim: row.claim || '', severity: row.severity || null });
      return;
    }
    if (!roundKnown || !folded.byRoundIssue.has(o.round + ':' + row.issueId)) {
      missing.push({ issueId: row.issueId, claim: row.claim || '', severity: row.severity || null });
    }
  });

  return { covered: missing.length === 0, missing: missing };
}

// ── carryOver (DD5) ──────────────────────────────────────────────────────────
//
// 초안은 이 자리에 `reReportCandidates`("직전 라운드에도 있었으나 id가 다른 blocking
// 수")를 두었는데 **그 수는 계산할 수 없다**. id가 다른 두 지적이 같은 결함이라는
// 판정은 정확히 DD5가 만들지 않기로 한 fuzzy matching이므로, 그 정의를 유지하면
// 구현자가 임계값을 발명하거나 키를 조용히 0으로 채우게 된다.
//
// 계산 가능한 것은 **집합 차이 셋**이고 전부 임계가 없다. 패러프레이즈 실패의
// 서명은 `resolvedAbsent > 0 ∧ newBlocking > 0`이 연속 라운드에 유지되는 것이다 —
// 다만 **이 쌍은 패러프레이즈를 식별하지 않는다. 그 패턴을 노출할 뿐이다.**
function toIdSet(v) {
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v.filter(function (x) { return typeof x === 'string' && x; }));
  return new Set();
}

function carryOverOf(opts) {
  const o = opts || {};
  const raw = toIdSet(o.rawBlockingIds);
  const folded = o.folded && o.folded.history instanceof Map ? o.folded : emptyFold();
  const round = o.round;

  let suppressed = 0;
  raw.forEach(function (id) {
    const e = gate.lastBefore(folded.history.get(id), round);
    if (e && gate.SUPPRESSING.has(e.disposition)) suppressed += 1;
  });

  let resolvedAbsent = 0;
  folded.history.forEach(function (hist, id) {
    if (raw.has(id)) return;
    const e = gate.lastBefore(hist, round);
    if (e && gate.SUPPRESSING.has(e.disposition)) resolvedAbsent += 1;
  });

  // `prevBlockingIds === null` = 비교할 직전 라운드가 없다. 그것을 "새 지적이
  // 없다"와 같은 0으로 보고하면 첫 라운드가 영원히 조용해진다.
  let newBlocking;
  if (o.prevBlockingIds === null || o.prevBlockingIds === undefined) {
    newBlocking = raw.size;
  } else {
    const prev = toIdSet(o.prevBlockingIds);
    newBlocking = 0;
    raw.forEach(function (id) { if (!prev.has(id)) newBlocking += 1; });
  }

  return { suppressed: suppressed, resolvedAbsent: resolvedAbsent, newBlocking: newBlocking };
}

module.exports = {
  buildEntry: buildEntry,
  foldEntries: foldEntries,
  coverageOf: coverageOf,
  carryOverOf: carryOverOf,
  parseAdjudicationGate: parseAdjudicationGate,
  parseLedgerSuppression: parseLedgerSuppression,
  SantaAdjudicationError: SantaAdjudicationError,
  ENTRY_KIND: ENTRY_KIND,
  ENV_ADJUDICATION_GATE: ENV_ADJUDICATION_GATE,
  ENV_LEDGER_SUPPRESSION: ENV_LEDGER_SUPPRESSION,
  GATE_DEFAULT: GATE_DEFAULT,
  GATE_VALUES: GATE_VALUES,
  MAX_CLAIM_CHARS: MAX_CLAIM_CHARS,
  MAX_EVIDENCE_CHARS: MAX_EVIDENCE_CHARS,
};
