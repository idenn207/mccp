'use strict';

// santa/detection-corpus — 탐지율 보존 측정용 계층화 결함 corpus + 순수 판정 oracle
// (santa-delta-review M2 / P3 소유).
//
// M1은 스코프를 좁혔고 *얼마나 줄었는가*를 쟀다. 이 모듈은 그 축소가 *결함을 놓치게
// 하는가*를 재기 위한 데이터와 판정을 낸다. 재는 대상은 단일 탐지율이 아니라 **결함이
// 어디 있느냐에 따라 답이 다른 네 질문**이다(DD1) — 계층 없이 수 하나를 내면 그 수는
// corpus 구성이 결정하고, corpus를 고르는 사람이 답을 고르게 된다.
//
// **순수 모듈이다.** 디스크·git·시각·env를 모른다(`scope-delta.js`·`scope-always.js`의
// 경계와 동형). 실제 저장소를 만들고 커밋하고 CLI를 부르는 것은 test가 진다 — 이 경계가
// 있어야 corpus를 바꾸지 않고 판정 규칙만 test할 수 있다(DD4).
//
// mirror: scope-delta.js:1-18(모듈 경계) · scope-delta.js:44-52(닫힌 사유 enum) ·
// scope-delta.js:397-414(미던지는 집계 + 형태 술어 공유).

// ── 사전 등록 규칙 (DD3) ─────────────────────────────────────────────────────
//
// **축자 상수다.** plan 본문 DD3의 문장을 그대로 담는다 — 규칙을 측정 결과에 맞춰
// 고치는 것이 이 milestone의 유일한 금지 행위이고(plan Task 4), 규칙이 산문으로만
// 존재하면 그 수정이 diff에서 문서 편집처럼 보인다. 상수로 두면 test가 축자 일치를
// 단언할 수 있고 report의 적용 문장도 같은 문자열을 인용한다(Acceptance 4행).
const DECISION_RULE =
  'corpus 전체(4계층 합산)에서 델타의 Layer 2 발견 수가 full 대비 단 1건이라도 적으면 ' +
  'default를 뒤집지 않는다. 같거나 크면 뒤집는다.';

// ── 계층 enum (DD5) ──────────────────────────────────────────────────────────
//
// `NO_NARROW` 동형의 닫힌 토큰 집합이다. 계층이 자유 문자열이면 corpus가 커질 때 오타가
// 새 계층을 만들고, 합산 규칙(DD3)이 그 계층을 조용히 빠뜨린다 — 규칙이 "전체 합산"이라
// 적혀 있는데 실제로는 아닌 상태이며, 어떤 단위 test도 그것을 잡지 않는다.
const DEFECT_CLASSES = {
  // 직전 fix hunk **안**. 경로도 남고 범위가 정확히 지목한다. patch-chasing 부류 —
  // 라운드 N의 수정이 라운드 N+1의 1급 표적이 되는 그 자리다.
  A_IN_FIX: 'A_IN_FIX',
  // fix가 건드린 파일이지만 `CONTEXT_LINES`(20) 밖. **이 계층이 M2의 미지수다** —
  // 범위가 절단이 아니라 포인터라는 M1의 설계 근거가 여기서 시험된다.
  B_SAME_FILE_OUT_OF_RANGE: 'B_SAME_FILE_OUT_OF_RANGE',
  // fix가 건드리지 않은 파일. 경로째 제거되므로 **산술적으로** 델타 스코프 밖이다.
  C_DROPPED_PATH: 'C_DROPPED_PATH',
  // plan·PRD 관계. `scope-always`가 되돌린다(UI7 면제).
  D_ALWAYS_SCOPE: 'D_ALWAYS_SCOPE',
};

const DEFECT_CLASS_VALUES = Object.keys(DEFECT_CLASSES).map(function (k) {
  return DEFECT_CLASSES[k];
});

// 결함 id 형태. `NO_NARROW` 동형으로 닫아 둔다 — 이 값은 외부 입력이 아니라 이 파일이
// 소스에 적는 리터럴이므로 injection 표면이 아니고(그 축의 통제는 `renderScopeLines`가
// caller 데이터에 거는 것이다), 여기서 닫는 이유는 **오타 방어** 하나다. corpus가 커질 때
// `D10`을 `DIO`로 적으면 두 스코프의 id 집합이 갈리고, `compareCoverage`는 그것을
// `unmatched`로 낼 뿐 어느 쪽이 오타인지는 말하지 못한다.
const DEFECT_ID_RE = /^D\d+$/;

// ── 커버리지 사유 토큰 ───────────────────────────────────────────────────────
//
// **`inScope`(불리언)와 `reason`(토큰)은 다른 것을 말한다.** 전자는 DD2가 Layer 1에
// 부여한 명제 — *containment*, 즉 "리뷰어에게 보일 기회가 있다" — 이고 그 값은 경로
// 포함 여부로만 결정된다. 후자는 그 안의 더 미세한 상태를 남긴다.
//
// 범위를 `inScope`에서 빼는 것이 요점이다(DD1). 블라인드 레인 리뷰어는 자기 도구로 파일
// 전체를 읽으므로 범위는 **잘라내기가 아니라 포인터**다(`lanes.js:146-188`). 범위 밖을
// `inScope=false`로 세면 Layer 1이 자기가 인증할 수 없는 명제("리뷰어가 범위 밖을 보지
// 않는다")를 단언하게 되고, 그것은 정확히 Layer 2가 소유한 질문이다.
const COVERAGE_REASONS = {
  IN_RANGE: 'in-range',                             // 경로 유지 + 선언된 범위 안
  PATH_KEPT_OUT_OF_RANGE: 'path-kept-out-of-range', // 경로 유지 + 범위 선언됨 + 그 밖
  PATH_UNRESTRICTED: 'path-unrestricted',           // 경로 유지 + 그 경로에 범위 선언 없음
  PATH_DROPPED: 'path-dropped',                     // 경로가 스코프에 없음
  UNKNOWN: 'unknown',                               // 형태 이탈 — 판정하지 않는다
};

const COVERAGE_REASON_VALUES = Object.keys(COVERAGE_REASONS).map(function (k) {
  return COVERAGE_REASONS[k];
});

// `degraded`가 답하지 못하는 질문이 하나 있다: **재기는 했는가.** 전 레코드가 형태 이탈이면
// `full=0, delta=0`이라 `degraded=false`가 되고, 측정 실패가 "손실 없음"과 같은 값으로 접힌다.
// `degraded`의 정의를 넓혀서 고치면 기존 소비처의 명제가 조용히 달라지므로, `FLIP_DECISIONS`가
// ABSENT를 DEGRADED와 다른 토큰으로 둔 것과 같은 수단을 쓴다 — 옆에 토큰을 하나 더 둔다(M3 DD3).
const COVERAGE_DEGRADED_REASONS = {
  LOST: 'containment-lost',        // 재봤고 delta < full
  NONE: 'no-containment-loss',     // 재봤고 손실 없음
  UNMEASURED: 'not-measured',      // 비교 가능한 쌍이 0 — 미상이지 무손실이 아니다
};

const COVERAGE_DEGRADED_REASON_VALUES = Object.keys(COVERAGE_DEGRADED_REASONS).map(function (k) {
  return COVERAGE_DEGRADED_REASONS[k];
});

// ── flip 판정 토큰 ───────────────────────────────────────────────────────────
//
// DD3의 규칙은 조건문 하나지만 **전건이 성립하지 않는 경우**가 따로 있다. 규칙은
// "델타의 Layer 2 발견 수가 full과 같거나 크면 뒤집는다"인데, Layer 2를 돌리지 않았으면
// 그 비교는 거짓이 아니라 *미상*이고 미상은 flip 근거가 아니다. 토큰을 나눠 두지 않으면
// 미상과 하락이 같은 `flip=false`로 접혀, 사후에 "재봤더니 하락"과 "안 재봤다"를 구별할
// 수 없다 — 그 구별이 이 milestone이 남기는 것의 절반이다.
const FLIP_DECISIONS = {
  PRESERVED: 'layer2-preserved',   // delta >= full → flip
  DEGRADED: 'layer2-degraded',     // delta < full  → no flip
  ABSENT: 'layer2-absent',         // 측정 없음     → no flip (전건 미성립)
  MALFORMED: 'malformed-input',    // 형태 이탈     → no flip
};

const FLIP_DECISION_VALUES = Object.keys(FLIP_DECISIONS).map(function (k) {
  return FLIP_DECISIONS[k];
});

function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ── corpus 데이터 (DD4) ──────────────────────────────────────────────────────
//
// 파일 내용은 줄 배열로 조립하고 결함 좌표는 **anchor 문자열로 역산한다**. 줄 번호를
// 손으로 세어 리터럴로 박으면, 한 줄만 끼워 넣어도 전 좌표가 조용히 어긋나고 그때
// 나오는 것은 "탐지율 하락"으로 읽히는 측정 오류다. anchor 역산은 그 실패 모드가
// 아예 없다 — 못 찾거나 둘 이상이면 `null`이 되고 test가 그것을 즉시 붉힌다.
//
// **실행 가능한 취약 페이로드를 쓰지 않는다.** 심는 것은 논리 결함(경계 누락 · 계약
// 위반 · 타입 강제 누락)이다. 탐지율 측정에 필요한 것은 "리뷰어가 이 줄을 보는가"이지
// 페이로드의 실효성이 아니고, 저장소에 의도적 취약 코드를 남기면 secret/SAST 스캐너의
// 상시 오탐이 된다.

const REV0_PARSER = [
  "'use strict';",
  '',
  '// Fixture module for santa-delta-review M2 detection-rate measurement.',
  '// Synthetic content only — nothing here is imported or executed. The defect',
  '// coordinates in detection-corpus.js are resolved from anchor strings, never',
  '// from hand-counted line numbers.',
  '',
  'function parseHeader(line) {',
  "  const parts = String(line).split(':');",
  '  if (parts.length < 2) return null;',
  "  return { name: parts[0].trim(), value: parts.slice(1).join(':').trim() };",
  '}',
  '',
  'function takeField(fields, index) {',
  '  const list = Array.isArray(fields) ? fields : [];',
  "  if (index < 0 || index >= list.length) return '';",
  '  return String(list[index]).trim();',
  '}',
  '',
  'function splitRecords(text) {',
  "  return String(text).split(SEPARATOR).filter(function (l) { return l !== ''; });",
  '}',
  '',
  'function countTokens(line) {',
  '  return String(line).split(/\\s+/).filter(Boolean).length;',
  '}',
  '',
  'function normalizeKey(key) {',
  '  return String(key).trim().toLowerCase();',
  '}',
  '',
  'function indexBy(rows, key) {',
  '  const out = Object.create(null);',
  '  rows.forEach(function (row) {',
  '    const k = normalizeKey(row[key]);',
  "    if (k === '') return;",
  '    out[k] = row;',
  '  });',
  '  return out;',
  '}',
  '',
  'function pickFirst(rows, predicate) {',
  '  for (let i = 0; i < rows.length; i++) {',
  '    if (predicate(rows[i])) return rows[i];',
  '  }',
  '  return null;',
  '}',
  '',
  'function toPairs(record) {',
  '  return Object.keys(record).map(function (k) { return [k, record[k]]; });',
  '}',
  '',
  'function formatPair(pair) {',
  "  return pair[0] + '=' + String(pair[1]);",
  '}',
  '',
  'function renderRecord(record) {',
  "  return toPairs(record).map(formatPair).join(' ');",
  '}',
  '',
  'function mergeCounts(a, b) {',
  '  return a + b;',
  '}',
  '',
  'module.exports = {',
  '  parseHeader: parseHeader,',
  '  takeField: takeField,',
  '  splitRecords: splitRecords,',
  '  countTokens: countTokens,',
  '  indexBy: indexBy,',
  '  pickFirst: pickFirst,',
  '  renderRecord: renderRecord,',
  '  mergeCounts: mergeCounts,',
  '};',
];

// fix 커밋 — `takeField` 본문 **3줄만** 교체한다. 줄 수를 보존하는 것이 의도다:
// 아래쪽 결함(Class B)의 좌표가 fix 때문에 이동하면, 측정하려는 것이 "범위 밖인가"가
// 아니라 "줄 번호가 밀렸는가"가 된다.
const FIX_PARSER = REV0_PARSER.map(function (line) {
  if (line === "  if (index < 0 || index >= list.length) return '';") {
    return '  const raw = list[index];';
  }
  if (line === '  return String(list[index]).trim();') {
    return '  return raw.trim();';
  }
  return line;
});

const REV0_CACHE = [
  "'use strict';",
  '',
  '// Fixture module — untouched by the fix commit, so the delta drops this path',
  '// wholesale. That drop is the arithmetic Class C measures.',
  '',
  'const store = new Map();',
  '',
  'function put(key, value, ttlMs) {',
  '  store.set(key, { value: value, expiresAt: Date.now() + ttlMs });',
  '}',
  '',
  'function get(key) {',
  '  const hit = store.get(key);',
  '  if (!hit) return null;',
  '  return hit.value;',
  '}',
  '',
  'function size() {',
  '  return store.size;',
  '}',
  '',
  'module.exports = { put: put, get: get, size: size };',
];

const REV0_FORMAT = [
  "'use strict';",
  '',
  '// Filler module with no planted defect. It exists so the diff scope has a third',
  '// path and the before/after counts are not degenerate.',
  '',
  'function pad(text, width) {',
  '  const s = String(text);',
  '  return s.length >= width ? s : s + PADDING.repeat(width - s.length);',
  '}',
  '',
  'module.exports = { pad: pad };',
];

const CORPUS_PLAN = [
  '# Plan: corpus fixture',
  '',
  '**Source PRD**: [corpus-fixture](../prds/corpus-fixture.prd.md)',
  '',
  '## Delivery Milestones',
  '',
  '| # | Milestone | Status |',
  '|---|---|---|',
  '| 1 | first | complete |',
  '| 2 | second | pending |',
  '',
  '## Notes',
  '',
  'This plan asserts the PRD declares 3 milestones.',
];

const CORPUS_PRD = [
  '# PRD: corpus fixture',
  '',
  '## Delivery Milestones',
  '',
  '| # | Milestone | Status |',
  '|---|---|---|',
  '| 1 | first | complete |',
  '| 2 | second | pending |',
];

// anchor로 줄 번호를 역산한다. 못 찾거나 둘 이상이면 `null` — 조용히 첫 매치를 고르지
// 않는다(`intent-claims.js`의 "정확히 1건이 아니면 unclaimed"와 같은 자세).
function lineOfAnchor(lines, anchor) {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf(anchor) === -1) continue;
    if (found !== -1) return null;
    found = i;
  }
  return found === -1 ? null : found + 1;
}

function joinLf(lines) {
  return lines.join('\n') + '\n';
}

// buildCorpus() → { decisionSlug, diffPaths, files, fix, defects }
//
// `files`는 rev0에 커밋할 전체 트리, `fix.files`는 fix 커밋이 덮어쓸 파일의 **전체
// 내용**이다(부분 패치가 아니라 전체를 쓰는 이유는 test가 `fs.writeFileSync` 하나로
// 끝나야 하고, 그래야 fixture 조립에 버그가 살 자리가 없기 때문이다).
//
// 4계층 각 1건씩을 보장한다 — 특히 Class C를 뺄 수 없다는 것이 plan Risks 3행의
// 통제다(C가 없는 corpus는 Task 2의 사전 등록 기대치가 붉힌다).
function buildCorpus() {
  const defects = [
    {
      id: 'D1',
      class: DEFECT_CLASSES.A_IN_FIX,
      path: 'src/parser.js',
      line: lineOfAnchor(FIX_PARSER, 'return raw.trim();'),
      anchor: 'return raw.trim();',
      summary: 'fix 커밋이 경계 검사를 지워, 범위 밖 index에서 raw가 undefined가 되고 ' +
        'trim()이 던진다. 직전 패치가 만든 회귀 — patch-chasing 부류.',
    },
    {
      id: 'D2',
      class: DEFECT_CLASSES.B_SAME_FILE_OUT_OF_RANGE,
      path: 'src/parser.js',
      line: lineOfAnchor(FIX_PARSER, 'return a + b;'),
      anchor: 'return a + b;',
      summary: 'mergeCounts가 숫자를 강제하지 않아 문자열 인자에서 연결이 일어난다. ' +
        'fix가 건드린 파일이지만 hunk에서 멀다.',
    },
    {
      id: 'D3',
      class: DEFECT_CLASSES.C_DROPPED_PATH,
      path: 'src/cache.js',
      line: lineOfAnchor(REV0_CACHE, 'return hit.value;'),
      anchor: 'return hit.value;',
      summary: 'get()이 expiresAt을 보지 않아 만료 항목을 반환한다. put()이 TTL을 ' +
        '기록하는데 소비처가 없다 — 계약 위반.',
    },
    {
      id: 'D4',
      class: DEFECT_CLASSES.D_ALWAYS_SCOPE,
      path: '.claude/plans/corpus-fixture.plan.md',
      line: lineOfAnchor(CORPUS_PLAN, 'asserts the PRD declares 3 milestones'),
      anchor: 'asserts the PRD declares 3 milestones',
      summary: 'plan이 PRD의 milestone 수를 3으로 단언하는데 PRD 표는 2행이다. ' +
        '두 문서의 관계이므로 상시 스코프가 아니면 구조적으로 검증 불가.',
    },
  ];

  return {
    decisionSlug: 'corpus',
    // diff 스코프(= santa-loop.md Step 1이 `git diff`로 내는 것)에 해당하는 경로.
    // plan/PRD는 여기 없다 — Class D의 전제가 "diff에 없는데 상시 스코프가 되돌린다"다.
    diffPaths: ['src/parser.js', 'src/cache.js', 'src/format.js'],
    files: [
      { path: 'src/parser.js', content: joinLf(REV0_PARSER) },
      { path: 'src/cache.js', content: joinLf(REV0_CACHE) },
      { path: 'src/format.js', content: joinLf(REV0_FORMAT) },
      { path: '.claude/plans/corpus-fixture.plan.md', content: joinLf(CORPUS_PLAN) },
      { path: '.claude/prds/corpus-fixture.prd.md', content: joinLf(CORPUS_PRD) },
    ],
    fix: {
      message: 'fix: absorb round-1 findings',
      files: [{ path: 'src/parser.js', content: joinLf(FIX_PARSER) }],
    },
    defects: defects,
  };
}

// ── 커버리지 판정 ────────────────────────────────────────────────────────────
//
// coverageOf({manifest, scope}) → { records, byId }
//
// `scope`는 `{paths: string[], ranges: {path: [[s,e], ...]}}`다 — `scope-delta`의 stdout
// 그대로이거나, 그 뒤 `scope-always`가 병합한 `paths`와 델타의 `ranges`를 합친 것이다.
// 병합을 이 함수가 하지 않는 이유는 그러려면 `scope-always`를 require해야 하고 그 순간
// 순수 경계가 깨지기 때문이다(DD4). 호출 순서(델타 → 상시)는 test가 CLI 두 개를 실제로
// 그 순서로 불러서 만든다 — santa-loop.md Step 1과 동형.
//
// **어떤 입력에도 던지지 않는다.** 형태 이탈은 예외가 아니라 `unknown` 레코드다 —
// 측정 도구가 던지면 측정이 중단되고, 중단된 측정은 "하락 없음"과 구별되지 않는다(DD4).
function coverageOf(opts) {
  const o = isRecord(opts) ? opts : {};
  const manifest = Array.isArray(o.manifest) ? o.manifest : [];
  const scope = isRecord(o.scope) ? o.scope : {};
  const paths = (Array.isArray(scope.paths) ? scope.paths : []).filter(function (p) {
    return typeof p === 'string' && p !== '';
  });
  const ranges = isRecord(scope.ranges) ? scope.ranges : {};

  const inScopePath = Object.create(null);
  paths.forEach(function (p) { inScopePath[p] = true; });

  const records = [];
  const byId = Object.create(null);

  manifest.forEach(function (d) {
    const rec = classify(d, inScopePath, ranges);
    records.push(rec);
    // 중복 id는 **덮어쓰지 않는다** — 마지막 것이 이기면 앞의 판정이 조용히 사라진다.
    // `byId`는 조회용 색인이고 정본은 `records`다.
    if (rec.id !== null && !Object.prototype.hasOwnProperty.call(byId, rec.id)) {
      byId[rec.id] = rec;
    }
  });

  return { records: records, byId: byId };
}

function classify(d, inScopePath, ranges) {
  if (!isRecord(d)) {
    return unknownRecord(null, null, 'defect is not an object');
  }
  const id = typeof d.id === 'string' ? d.id : null;
  if (id === null || !DEFECT_ID_RE.test(id)) {
    return unknownRecord(id, null, 'defect id is not the closed `D<n>` shape');
  }
  const cls = typeof d.class === 'string' ? d.class : null;
  if (cls === null || DEFECT_CLASS_VALUES.indexOf(cls) === -1) {
    return unknownRecord(id, cls, 'defect class is not a DEFECT_CLASSES member');
  }
  const p = typeof d.path === 'string' && d.path !== '' ? d.path : null;
  if (p === null) {
    return unknownRecord(id, cls, 'defect path is missing');
  }
  if (!Number.isSafeInteger(d.line) || d.line < 1) {
    // anchor 역산이 실패하면 `line`이 `null`로 온다. 그것을 0으로 접거나 범위 밖으로
    // 세면 corpus 조립 버그가 측정 결과로 둔갑한다.
    return unknownRecord(id, cls,
      'defect line is not a positive integer (anchor lookup failed?)');
  }

  if (!inScopePath[p]) {
    return {
      id: id, class: cls, path: p, line: d.line,
      inScope: false, inRange: null, reason: COVERAGE_REASONS.PATH_DROPPED, note: null,
    };
  }

  const list = Object.prototype.hasOwnProperty.call(ranges, p) && Array.isArray(ranges[p])
    ? ranges[p] : [];
  const spans = list.filter(function (pair) {
    return Array.isArray(pair) && pair.length >= 2 &&
      Number.isSafeInteger(pair[0]) && Number.isSafeInteger(pair[1]) && pair[1] >= pair[0];
  });

  if (spans.length === 0) {
    return {
      id: id, class: cls, path: p, line: d.line,
      inScope: true, inRange: null, reason: COVERAGE_REASONS.PATH_UNRESTRICTED, note: null,
    };
  }

  const hit = spans.some(function (pair) { return d.line >= pair[0] && d.line <= pair[1]; });
  return {
    id: id, class: cls, path: p, line: d.line,
    inScope: true,
    inRange: hit,
    reason: hit ? COVERAGE_REASONS.IN_RANGE : COVERAGE_REASONS.PATH_KEPT_OUT_OF_RANGE,
    note: null,
  };
}

function unknownRecord(id, cls, note) {
  return {
    id: id, class: cls, path: null, line: null,
    inScope: false, inRange: null, reason: COVERAGE_REASONS.UNKNOWN, note: note,
  };
}

// ── 두 스코프 대조 ───────────────────────────────────────────────────────────
//
// compareCoverage({fullCoverage, deltaCoverage}) → { byClass, totals, unmatched, degraded }
//
// `deltaCoverageFrom` 규약과 같다 — **미던짐**. 한쪽에만 있는 id나 계층이 열거 밖인
// 레코드는 예외가 아니라 `unmatched` 원소다(DD4).
//
// `degraded`는 **containment 축의 판정이지 탐지 축의 판정이 아니다**(DD2). 이름을
// `detectionDegraded`로 짓지 않은 이유가 그것이다 — Layer 1이 인증하는 명제는 "리뷰어에게
// 보일 기회가 있다"이고, 기회가 줄었다는 것과 발견이 줄었다는 것은 다른 문장이다.
function compareCoverage(opts) {
  const o = isRecord(opts) ? opts : {};
  const full = coverageRecords(o.fullCoverage);
  const delta = coverageRecords(o.deltaCoverage);

  const fullById = indexRecords(full);
  const deltaById = indexRecords(delta);

  const byClass = Object.create(null);
  DEFECT_CLASS_VALUES.forEach(function (c) {
    byClass[c] = { full: 0, delta: 0, lost: 0, lostIds: [] };
  });

  const unmatched = [];
  const totals = { full: 0, delta: 0, lost: 0, unknown: 0 };

  // 형태 이탈과 색인 불가는 **배열에서** 센다. 색인을 훑으면 (a) delta 쪽 unknown이 한 번도
  // 세어지지 않고 (b) id를 못 읽은 레코드는 `indexRecords`가 건너뛰므로 어느 집계에도 남지
  // 않는다 — corpus 조립이 깨진 만큼 정확히 조용해진다(M3 DD4).
  [full, delta].forEach(function (records) {
    records.forEach(function (r) {
      if (r.reason === COVERAGE_REASONS.UNKNOWN) totals.unknown += 1;
      if (typeof r.id !== 'string') unmatched.push({ id: null, side: 'unindexable' });
    });
  });

  // 「재기는 했는가」의 근거. 양쪽에 다 있고, 계층이 열거 안이고, 형태 이탈이 아닌 쌍만
  // 실제로 비교된 것이다.
  let compared = 0;

  Object.keys(fullById).forEach(function (id) {
    const f = fullById[id];
    const d = deltaById[id];
    if (!d) {
      unmatched.push({ id: id, side: 'delta-missing' });
      return;
    }
    const bucket = Object.prototype.hasOwnProperty.call(byClass, f.class)
      ? byClass[f.class] : null;
    if (bucket === null) {
      // 계층이 열거 밖인 레코드. 합산에 넣으면 DD3의 "전체 합산"이 거짓이 되므로
      // 넣지 않고, 조용히 버리지도 않는다.
      unmatched.push({ id: id, side: 'class-unknown' });
      return;
    }
    if (f.reason !== COVERAGE_REASONS.UNKNOWN && d.reason !== COVERAGE_REASONS.UNKNOWN) {
      compared += 1;
    }
    if (f.inScope) { bucket.full += 1; totals.full += 1; }
    if (d.inScope) { bucket.delta += 1; totals.delta += 1; }
    if (f.inScope && !d.inScope) {
      bucket.lost += 1;
      bucket.lostIds.push(id);
      totals.lost += 1;
    }
  });

  Object.keys(deltaById).forEach(function (id) {
    if (!Object.prototype.hasOwnProperty.call(fullById, id)) {
      unmatched.push({ id: id, side: 'full-missing' });
    }
  });

  const degraded = totals.delta < totals.full;
  const measured = compared > 0;

  return {
    byClass: byClass,
    totals: totals,
    unmatched: unmatched,
    // 정의 무변경 — 기존 소비처의 명제를 건드리지 않는다(M3 DD3).
    degraded: degraded,
    measured: measured,
    degradedReason: !measured
      ? COVERAGE_DEGRADED_REASONS.UNMEASURED
      : (degraded ? COVERAGE_DEGRADED_REASONS.LOST : COVERAGE_DEGRADED_REASONS.NONE),
  };
}

function coverageRecords(c) {
  if (Array.isArray(c)) return c.filter(isRecord);
  if (isRecord(c) && Array.isArray(c.records)) return c.records.filter(isRecord);
  return [];
}

function indexRecords(records) {
  const out = Object.create(null);
  records.forEach(function (r) {
    const id = typeof r.id === 'string' ? r.id : null;
    if (id === null) return;
    if (Object.prototype.hasOwnProperty.call(out, id)) return; // 첫 것이 이긴다
    out[id] = r;
  });
  return out;
}

// ── default flip 판정 (DD3의 기계적 적용) ────────────────────────────────────
//
// decideDefaultFlip({layer2}) → { flip, reason, detail }
//
// **이 함수가 존재하는 이유는 하나다**: plan 승인 패널이 "Task 3(측정)을 건너뛰고도
// Task 4가 default를 뒤집을 수 있다"를 지적했고(L2 id=6116eeb8 · 5fb50bd9), 그 지적이
// 실재하기 때문이다. 규칙이 산문으로만 존재하면 flip은 사람이 문장을 읽고 손으로 상수를
// 고치는 행위이고, 그 행위는 측정을 안 했을 때와 했을 때가 diff에서 똑같아 보인다.
//
// `layer2`는 라이브 리뷰어 비교의 결과다: `{fullFindings, deltaFindings}`. **부재는
// 거짓이 아니라 미상이고, 미상은 flip 근거가 아니다** — 규칙의 전건("델타의 발견 수가
// full과 같거나 크다")이 성립하지 않는다. `ABSENT`를 `DEGRADED`와 같은 토큰으로 접지
// 않는 이유는 사후에 "재봤더니 하락"과 "안 재봤다"를 구별해야 하기 때문이다.
//
// **이 함수는 상수를 고치지 않는다.** `DELTA_SCOPE_DEFAULT`는 여전히 사람이 편집하는
// 리터럴이고, 여기서 얻는 것은 그 편집이 정당한지에 대한 기계적 답과 그 답의 사유
// 토큰이다. 자동 편집으로 만들지 않은 이유는 default 전환이 배송 결정이라 리뷰를
// 거쳐야 하기 때문이다 — 회귀 test가 이 함수의 답과 실제 상수의 정합을 단언한다.
//
// 미던짐. 어떤 입력에도 `flip`은 불리언이고 `reason`은 `FLIP_DECISIONS` 원소다.
function decideDefaultFlip(opts) {
  const o = isRecord(opts) ? opts : {};
  const l2 = o.layer2;

  if (l2 === null || l2 === undefined) {
    return {
      flip: false,
      reason: FLIP_DECISIONS.ABSENT,
      detail: 'no Layer 2 (live reviewer) comparison was recorded; the rule\'s antecedent ' +
        'is unmeasured, not satisfied. The shipped default stands.',
    };
  }
  if (!isRecord(l2) ||
      !Number.isSafeInteger(l2.fullFindings) || l2.fullFindings < 0 ||
      !Number.isSafeInteger(l2.deltaFindings) || l2.deltaFindings < 0) {
    return {
      flip: false,
      reason: FLIP_DECISIONS.MALFORMED,
      detail: 'layer2 must be {fullFindings, deltaFindings} with non-negative safe integers.',
    };
  }
  if (l2.deltaFindings < l2.fullFindings) {
    return {
      flip: false,
      reason: FLIP_DECISIONS.DEGRADED,
      detail: 'delta found ' + l2.deltaFindings + ' of the full scope\'s ' +
        l2.fullFindings + ' — the rule refuses a flip on any shortfall, however small.',
    };
  }
  return {
    flip: true,
    reason: FLIP_DECISIONS.PRESERVED,
    detail: 'delta found ' + l2.deltaFindings + ' vs full ' + l2.fullFindings +
      ' — no shortfall, so the rule permits the flip.',
  };
}

module.exports = {
  DECISION_RULE: DECISION_RULE,
  DEFECT_CLASSES: DEFECT_CLASSES,
  DEFECT_CLASS_VALUES: DEFECT_CLASS_VALUES,
  DEFECT_ID_RE: DEFECT_ID_RE,
  COVERAGE_REASONS: COVERAGE_REASONS,
  COVERAGE_REASON_VALUES: COVERAGE_REASON_VALUES,
  COVERAGE_DEGRADED_REASONS: COVERAGE_DEGRADED_REASONS,
  COVERAGE_DEGRADED_REASON_VALUES: COVERAGE_DEGRADED_REASON_VALUES,
  FLIP_DECISIONS: FLIP_DECISIONS,
  FLIP_DECISION_VALUES: FLIP_DECISION_VALUES,
  buildCorpus: buildCorpus,
  coverageOf: coverageOf,
  compareCoverage: compareCoverage,
  decideDefaultFlip: decideDefaultFlip,
};
