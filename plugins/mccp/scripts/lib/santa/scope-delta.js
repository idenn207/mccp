'use strict';

// santa/scope-delta — 델타 스코프 oracle (santa-delta-review M1 / P1 소유).
//
// santa-loop의 라운드 2 이후는 매번 diff 스코프 **전체**를 다시 리뷰한다. 그런데 그
// 라운드가 실제로 판정해야 하는 것은 직전 라운드들이 커밋한 fix hunk이고, 나머지는
// 이미 같은 리뷰어가 같은 rubric으로 본 코드다. 이 모듈은 스코프를 그 hunk 범위로
// 좁히되, 리뷰어에게 가는 것은 **범위 지정뿐**이고 "이전은 통과했다"류 상태 단언은
// 실을 자리가 없게 만든다(UI2 / DD3).
//
// **순수 모듈이다.** 디스크·git·시각을 모르고 env는 아래 파서 1종만 읽는다
// (`scope-always.js`·`lanes.js`·`terminator.js`의 경계와 동형). anchor 열거·`git show`·
// 파일 읽기는 전부 `cli.js#cmdScopeDelta`가 진다.
//
// mirror: scope-always.js:26-40(모듈 헤더 + env 파서 1종) ·
// terminator.js:56-62(`NO_FIRE` 미발화 사유 토큰 enum) ·
// lanes.js:150-160(실을 자리를 없앤다 — 사후 검사가 아니라 인자 제거).

const ENV_DELTA_SCOPE = 'MCCP_SANTA_DELTA_SCOPE';

// **default가 형제 santa 토글 4종과 반대 방향(`off`)인 것은 의도다**(M1 DD1).
// `BLIND_LANE`·`ALWAYS_SCOPE`·`TERMINATOR`·`DEGRADE_GATE`는 전부 발화를 default에 두고
// 그 근거는 "오타가 kill switch를 켜면 그 실행이 도입 이전과 똑같아 보인다"이다. 델타는
// 방향이 반대다 — 발화가 **더 느슨한** 쪽이고(스코프를 줄인다), 틀렸을 때의 대가가
// PRD가 인용한 16~93%p 탐지율 하락이다.
// 그 대신 "조용한 영구 비활성"은 M1 DD12의 무조건 stamp가 관측 가능하게 만든다.
//
// **M2가 이 값을 재검토했고 `off`로 유지한다.** M2는 사전 등록 규칙(M2 DD3 —
// `detection-corpus.js#DECISION_RULE`에 축자 동결)을 측정 결과에 기계적으로 적용한다.
// 그 규칙의 전건은 "델타의 **Layer 2**(라이브 리뷰어) 발견 수가 full과 같거나 크다"인데,
// M2가 배송한 것은 **Layer 1**(결정적 containment)뿐이라 전건이 거짓이 아니라 *미상*이고
// 미상은 flip 근거가 아니다 — `decideDefaultFlip({layer2: null})`이 `layer2-absent`를
// 낸다. 이 정합은 산문이 아니라 test가 잡는다(`santa-detection-coverage.test.js`의
// "배송된 default는 이 저장소가 기록한 Layer 2 증거와 정합한다").
//
// Layer 1이 실제로 잰 것: corpus 4계층에서 델타가 잃는 것은 **Class C 하나**다
// (fix가 건드리지 않은 파일 — 경로째 드롭이라 산술적으로 스코프 밖). Class B(같은 파일
// 범위 밖)는 경로가 남으므로 containment가 보존된다 — 범위가 절단이 아니라 포인터라는
// 위 설계가 그 계층에서는 성립한다는 뜻이다. 다만 그것이 *리뷰어가 범위 밖을 실제로
// 본다*를 뜻하지는 않는다(그 질문은 Layer 2 소유). 배경: `.claude/notes/santa-delta-review-m2.md`.
const DELTA_SCOPE_DEFAULT = 'off';
const DELTA_SCOPE_VALUES = ['enforce', 'off'];

// 문맥 폭. **env를 하나 더 만들지 않는다**(DD7). 블라인드 레인은 포인터만 받고 리뷰어가
// 자기 도구로 파일 전체를 읽으므로 문맥 부족이 구조적으로 없고, 이 상수가 실제로 묶는
// 것은 번들 레인의 재현성이다. 값의 타당성은 `before`/`after`가 매 실행 관측되므로
// 사후 조정 가능하다.
const CONTEXT_LINES = 20;

// 미축소 사유 토큰. `terminator.NO_FIRE` 동형 — 자유 문장이 아니라 고정 하이픈 토큰이라
// **어느 항이 막았는지를 그대로 지목**한다. 이 값은 원장의 `scope.reason`에 durable하게
// 저장되고(Task 4) `cmdBeginRound`가 열거 밖 값을 거부하므로, 자유 문자열로 두면 원장이
// 무엇이든 받는 필드를 갖게 된다 — 그 필드는 개행·마크다운 구조를 실을 수 있고 원장을
// 렌더하는 하류가 그것을 저자 텍스트로 보여준다(security-reviewer MEDIUM-2가 지목한
// 실패 모드이고, 닫는 수단은 검증 나열이 아니라 이 닫힌 enum이다).
const NO_NARROW = {
  ENV_OFF: 'env-off',
  NO_ANCHOR: 'no-anchor',
  NO_RANGES: 'no-ranges',
  EMPTY_RESULT: 'empty-result',
};

const NO_NARROW_VALUES = Object.keys(NO_NARROW).map(function (k) { return NO_NARROW[k]; });

// ── 금지 패턴 2목록 (DD4) ────────────────────────────────────────────────────
//
// **두 목록으로 나누는 이유는 적용 대상이 다르기 때문이다.** rubric은 본문 규약상
// "PASS/FAIL condition"을 포함하므로(santa-loop.md Step 2), 단일 목록을 조립된 프롬프트
// 전체에 걸면 정상 rubric이 매 라운드 터진다.
//
//   SCOPE_ASSERTION_PATTERNS — 엄격. **델타가 렌더한 스캐폴딩**에만 건다.
//   PRIOR_ROUND_PATTERNS     — 좁음. 조립된 프롬프트 **전체**(rubric 포함)에 건다.
//
// 후자가 UI2를 caller-authored rubric까지 덮는 유일한 통제다.
//
// **완결성은 주장하지 않는다.** 열거식의 우회 가능성은 plan Risks 1행이 천장으로
// 명시했고 1차 통제는 DD3의 구조 분리(`renderScopeLines`에 서술 인자가 없다)다.
// 이 목록이 사는 것은 "델타 축이 생성한 텍스트에 단언 0건"이지 "리뷰어가 아무것도
// 추론하지 못한다"가 아니다.
//
// **`g` 플래그를 쓰지 않는다** — `lastIndex`가 호출 간에 살아남아 같은 입력이 두 번째
// 호출에서 통과한다. 검사기가 조용히 꺼지는 경로다.
//
// **backtracking 폭발이 없다**: 두 목록 다 중첩 수량자(`(a+)+`)도 겹치는 교대도 없고,
// 모든 `\s*`/`\s+` 뒤에는 리터럴 또는 서로소 교대가 온다. 각 시작 위치에서 공백을 한 번
// 훑고 실패하면 그대로 다음 위치로 가므로 O(n·m)이다(security-reviewer HIGH-1은 이
// 기전을 오인했다 — 근거와 실측은 `.claude/plans/codex-findings-backlog.md`).
const SCOPE_ASSERTION_PATTERNS = [
  /pass(ed)?/i,
  /승인/,
  /문제\s*없/,
  /approved/i,
  /clean/i,
  /no issues/i,
  /looks good/i,
];

const PRIOR_ROUND_PATTERNS = [
  /이전\s*라운드/,
  /직전\s*라운드/,
  /이미\s*(검토|리뷰|확인)/,
  /previous(ly)?\s+round/i,
  /earlier\s+round/i,
  /already\s+(reviewed|approved|checked)/i,
  /previously\s+approved/i,
];

function warn(line) {
  process.stderr.write('[mccp:santa-scope-delta] ' + line + '\n');
}

function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

class ScopeDeltaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'ScopeDeltaError';
  }
}

// ── env 파서 ─────────────────────────────────────────────────────────────────
//
// 미설정은 default, 열거 밖은 loud stderr warn 후 default. trim + 소문자 정규화를 먼저
// 한다(`Off`/` enforce `가 오타로 취급돼 warn을 내는 것은 소음이다). 던지지 않는다.
function parseDeltaScope(env) {
  const raw = env && env[ENV_DELTA_SCOPE];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DELTA_SCOPE_DEFAULT;
  }
  const v = String(raw).trim().toLowerCase();
  if (DELTA_SCOPE_VALUES.indexOf(v) === -1) {
    warn(ENV_DELTA_SCOPE + ' must be one of ' + JSON.stringify(DELTA_SCOPE_VALUES) +
      '; got "' + raw + '". Falling back to default "' + DELTA_SCOPE_DEFAULT + '".');
    return DELTA_SCOPE_DEFAULT;
  }
  return v;
}

// ── 상태 단언 검사 ───────────────────────────────────────────────────────────
//
// 어느 패턴이 걸렸는지와 걸린 자리를 함께 던진다 — "어딘가 걸렸다"만으로는 조립
// 경로가 여럿일 때 진단이 불가능하다.
function assertNoStatusAssertion(text, patterns) {
  if (typeof text !== 'string' || text === '') return;
  const list = Array.isArray(patterns) ? patterns : [];
  for (let i = 0; i < list.length; i++) {
    const re = list[i];
    if (!(re instanceof RegExp)) continue;
    const hit = re.exec(text);
    if (hit) {
      const at = Math.max(0, hit.index - 40);
      throw new ScopeDeltaError('SANTA_SCOPE_ASSERTION',
        'prompt text matched a forbidden status-assertion pattern ' + String(re) +
        ' at offset ' + hit.index + ': ...' + JSON.stringify(text.slice(at, hit.index + 60)) +
        '... — the delta axis must hand the reviewer a SCOPE, never a claim about ' +
        'what a prior round concluded (UI2).');
    }
  }
}

// ── 범위 정규화 · 확장 ───────────────────────────────────────────────────────
//
// 입력은 `cli.js#patchRangesFrom`의 반환(`{path: [[start,end], ...]}`)이거나 그것의
// 합집합이다. `Object.keys`만 쓴다 — 프로토타입 체인을 읽지 않으므로 `__proto__` 키가
// 있는 입력에서도 상속 속성이 범위로 둔갑하지 않고, 반환도 `Object.create(null)`이라
// 되돌려준 맵을 읽는 쪽에서 상속 키가 own처럼 보이지 않는다.
//
// 형태가 어긋난 원소는 **그 원소만** 버린다(`patchRangesFrom`의 hunk 단위 skip과 같은
// 방향 — 범위를 덜 모으면 스코프가 덜 좁혀져 안전한 쪽이고, 전체를 버리면 한 줄의
// 형식 이탈이 정상 범위 전부를 지운다).
function normalizeRanges(ranges) {
  const out = Object.create(null);
  if (!isRecord(ranges)) return out;
  Object.keys(ranges).forEach(function (key) {
    if (typeof key !== 'string' || key === '') return;
    const list = ranges[key];
    if (!Array.isArray(list)) return;
    const kept = [];
    list.forEach(function (pair) {
      if (!Array.isArray(pair) || pair.length < 2) return;
      const s = pair[0];
      const e = pair[1];
      // `Number.isSafeInteger`가 문자열("1e10")·부동소수·NaN·Infinity를 한 번에 접는다.
      if (!Number.isSafeInteger(s) || !Number.isSafeInteger(e)) return;
      if (s < 0 || e < s) return;
      kept.push([s, e]);
    });
    if (kept.length === 0) return;
    out[key] = kept;
  });
  return out;
}

// 각 범위를 앞뒤 `CONTEXT_LINES`만큼 넓히고 1 미만은 1로 clamp한 뒤 겹치는 범위를
// 병합한다. **인접(`end + 1 === nextStart`)도 병합한다** — 확장 후 맞닿은 두 범위를
// 따로 두면 `12-40, 41-60`처럼 사람이 읽을 이유가 없는 표기가 나온다.
//
// 상한 clamp는 `Number.MAX_SAFE_INTEGER`다. `patchRangesFrom`이 내는 값은 git 라인
// 번호라 실측 범위를 한참 벗어나지 않지만, 이 함수는 export되어 임의 입력을 받는다.
function expandRanges(ranges) {
  const norm = normalizeRanges(ranges);
  const out = Object.create(null);
  Object.keys(norm).forEach(function (key) {
    const widened = norm[key].map(function (pair) {
      const start = Math.max(1, pair[0] - CONTEXT_LINES);
      const end = Math.min(Number.MAX_SAFE_INTEGER, pair[1] + CONTEXT_LINES);
      return [start, Math.max(start, end)];
    });
    widened.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    const merged = [];
    widened.forEach(function (pair) {
      const last = merged.length > 0 ? merged[merged.length - 1] : null;
      if (last !== null && pair[0] <= last[1] + 1) {
        if (pair[1] > last[1]) last[1] = pair[1];
        return;
      }
      merged.push([pair[0], pair[1]]);
    });
    out[key] = merged;
  });
  return out;
}

// ── 축소 판정 ────────────────────────────────────────────────────────────────
//
// narrowScope({mode, diffPaths, patchRanges, anchorCount})
//   → { applied, reason, paths, ranges, before, after }
//
// **어떤 입력에도 던지지 않는다**(전역 함수 규약 — `gate.analyzeReviewers` 동형).
//
// `paths`의 의미는 두 경우 모두 확정이다:
//   applied=false → 입력 diff 스코프 그대로, `ranges`는 빈 객체
//   applied=true  → `diffPaths` ∩ `keys(ranges)` (diff 순서 보존). fix 커밋이 건드리지
//                   않은 파일은 목록에서 **빠지고**, 그 제거가 곧 축소다.
//                   `before - after`가 `santa_delta_paths_dropped`의 정의다.
// UI4의 면제는 이것과 충돌하지 않는다 — DD2대로 `scope-always`가 **그 뒤에** plan/PRD를
// 붙이므로, 여기서 빠진 파일이 plan/PRD였더라도 되돌아온다.
//
// **`anchorCount`는 `no-anchor`와 `no-ranges`를 가르는 유일한 입력이다.** 둘 다 빈
// 범위로 도달하지만 운영자에게는 다른 뜻이다 — 전자는 "라운드 1이거나 fix 커밋이 아직
// 없다"(UI3의 정상 경로), 후자는 "anchor는 있는데 `git show`가 아무 hunk도 내지
// 않았다"(진단 대상). 범위가 비어있지 않으면 `anchorCount`와 무관하게 그쪽이 이긴다.
function narrowScope(opts) {
  const o = isRecord(opts) ? opts : {};
  const diffPaths = (Array.isArray(o.diffPaths) ? o.diffPaths : []).filter(function (p) {
    return typeof p === 'string' && p !== '';
  });
  const anchorCount = Number.isInteger(o.anchorCount) && o.anchorCount >= 0 ? o.anchorCount : 0;
  const before = diffPaths.length;

  function passthrough(reason) {
    return {
      applied: false,
      reason: reason,
      paths: diffPaths.slice(),
      ranges: Object.create(null),
      before: before,
      after: before,
    };
  }

  // DD8 — 모르면 좁히지 않는다. 아래 네 갈래는 전부 전체 스코프 passthrough이고
  // 사유 토큰이 붙는다(`patchRangesFrom`의 "모르면 종료하지 않는다"와 같은 방향).
  if (o.mode !== 'enforce') return passthrough(NO_NARROW.ENV_OFF);

  const ranges = expandRanges(o.patchRanges);
  const rangeKeys = Object.keys(ranges);
  if (rangeKeys.length === 0) {
    return passthrough(anchorCount >= 1 ? NO_NARROW.NO_RANGES : NO_NARROW.NO_ANCHOR);
  }

  const inRange = Object.create(null);
  rangeKeys.forEach(function (k) { inRange[k] = true; });
  const seen = Object.create(null);
  const kept = [];
  diffPaths.forEach(function (p) {
    if (!inRange[p]) return;
    if (seen[p]) return;
    seen[p] = true;
    kept.push(p);
  });

  if (kept.length === 0) return passthrough(NO_NARROW.EMPTY_RESULT);

  // 살아남은 경로의 범위만 싣는다 — diff에 없는 파일의 범위를 프롬프트에 실으면
  // 스코프에 없는 파일을 가리키게 된다.
  const outRanges = Object.create(null);
  kept.forEach(function (p) { outRanges[p] = ranges[p]; });

  return {
    applied: true,
    reason: null,
    paths: kept,
    ranges: outRanges,
    before: before,
    after: kept.length,
  };
}

// ── 범위 렌더 ────────────────────────────────────────────────────────────────
//
// renderScopeLines({paths, ranges}) → string[]  (`- path` 또는 `- path:12-40, 88-95`)
//
// **서술 인자가 없다**(DD3). `lanes.buildBlindPrompt`가 파일 내용을 실을 인자를 없앤
// 것과 같은 수단이다 — 사후 검사 대신 자리를 제거한다.
//
// 두 가지를 던진다:
//
//   1. **구조 이탈** — 경로에 개행/CR/NUL이 있거나 범위 표기가 고정 형태를 벗어나면
//      던진다. 개행이 든 경로는 `## Rubric` 같은 **프롬프트 구조를 주입**할 수 있고
//      (경로는 `--paths-file`을 통해 들어오는 caller 데이터다), 이 함수가 그 주입의
//      마지막 관문이다. 1차 관문은 CLI가 키를 `toRepoRelative`로 접는 것이고
//      (security-reviewer HIGH-2 흡수), 여기는 그 뒤에 남는 belt다.
//
//   2. **상태 단언** — `SCOPE_ASSERTION_PATTERNS`를 **스캐폴딩**(줄에서 경로 문자열을
//      뺀 나머지 = 이 함수가 스스로 만든 텍스트)에만 건다. DD3의 구조를 미래 편집으로
//      부터 동결하는 것이 목적이므로 검사 대상은 이 함수의 산물이지 데이터가 아니다.
//
// **왜 원시 출력 전체에 걸지 않는가**(plan 문언에서의 이탈 — 실측 근거). plan은 "자기
// 출력에" 걸라고 적었지만 그대로 하면 **평범한 저장소 경로가 라운드를 죽인다**: 이
// 저장소에는 `.claude/plans/review-loop-bypass-m1.plan.md`(`/pass(ed)?/i` 매치 —
// "by**pass**") 와 `.claude/agents/refactor-cleaner.md`(`/clean/i` 매치 — "**clean**er")
// 가 실재하고, 전자는 상시 스코프가 `<slug>*.plan.md`로 끌어오는 부류다. 데이터에
// denylist를 거는 것은 fail-closed가 아니라 **정상 입력에 대한 오작동**이고 DD3이
// 막으려는 것과 무관하다. 스캐폴딩 검사는 같은 동결을 제공하면서(서술이 추가되면 그것이
// 스캐폴딩에 든다) 이 오탐이 없다.
const RANGE_PART_RE = /^:\d+-\d+(?:, \d+-\d+)*$/;

function renderScopeLines(opts) {
  const o = isRecord(opts) ? opts : {};
  const paths = (Array.isArray(o.paths) ? o.paths : []).filter(function (p) {
    return typeof p === 'string' && p !== '';
  });
  const ranges = isRecord(o.ranges) ? o.ranges : Object.create(null);

  return paths.map(function (p) {
    if (/[\r\n\0]/.test(p)) {
      throw new ScopeDeltaError('SANTA_SCOPE_PATH_INVALID',
        'target path contains a newline, carriage return, or NUL: ' + JSON.stringify(p) +
        ' — such a path can inject prompt structure (a fake `## Rubric` section) into ' +
        'the blind reviewer prompt. Refusing to render it.');
    }
    const list = Object.prototype.hasOwnProperty.call(ranges, p) && Array.isArray(ranges[p])
      ? ranges[p] : [];
    const spans = list.filter(function (pair) {
      return Array.isArray(pair) && Number.isSafeInteger(pair[0]) && Number.isSafeInteger(pair[1]);
    }).map(function (pair) { return pair[0] + '-' + pair[1]; });

    const rangePart = spans.length > 0 ? ':' + spans.join(', ') : '';
    if (rangePart !== '' && !RANGE_PART_RE.test(rangePart)) {
      throw new ScopeDeltaError('SANTA_SCOPE_RANGE_INVALID',
        'rendered range notation ' + JSON.stringify(rangePart) + ' for ' + JSON.stringify(p) +
        ' is not the fixed `:start-end[, start-end]` shape — refusing to emit free text ' +
        'into the target-path list (DD3).');
    }
    const line = '- ' + p + rangePart;
    // 스캐폴딩 = 줄에서 경로를 뺀 나머지. 미래의 편집이 서술을 끼워 넣으면 여기에 든다.
    assertNoStatusAssertion(line.replace(p, ''), SCOPE_ASSERTION_PATTERNS);
    return line;
  });
}

// ── 라운드 `scope` 레코드의 형태 술어 ────────────────────────────────────────
//
// **이 저장소에서 `scope` 레코드가 유효한지 판정하는 자리는 여기 하나다.** 소비처가
// 셋(`cli.js#parseScopeFlags`의 쓰기 · `seal.js#projectScope`의 투영 ·
// `deltaCoverageFrom`의 집계)이고, 규칙을 각자 적으면 사본 셋이 갈린다 — 그리고 그
// 갈림은 "리포트에는 없는데 집계에는 있다" 형태로 나타나 어떤 단위 test도 잡지 않는다.
//
// 네 필드가 **전부** 맞아야 유효하다. 부분 통과를 두지 않는 이유는 집계가
// `before - after`를 더하기 때문이다 — 반쪽 레코드가 통과하면 조용히 틀린 수가 나온다.
//
// **`applied` ↔ `reason` 상호배제도 여기서 진다**(code-review MEDIUM-3). 이전에는
// `reason`이 문자열이기만 하면 통과시켰는데, 그러면 `cli.js#parseScopeFlags`가 CLI에서
// 명시적으로 거부하는 자기모순(좁혀진 라운드에 미축소 사유가 붙은 레코드)이 프로그래매틱
// 경로로 들어와 원장에 durable하게 앉는다. 규칙을 "여기 하나"라고 적어 두고 정작 실질
// 규칙은 CLI에만 있으면 그 선언이 거짓이 된다 — 두 자리가 갈릴 수 있다는 뜻이고, 이
// 술어가 애초에 존재하는 이유가 그 갈림을 없애는 것이다.
//
//   applied=true  → `reason`은 부재 또는 `null`이어야 한다
//   applied=false → `reason`은 `NO_NARROW` 원소여야 한다 (자유 문자열이 아니다 —
//                   닫힌 enum이 원장의 자유 필드를 막는다는 위 머리말과 같은 근거)
function isValidScopeRecord(s) {
  if (!isRecord(s)) return false;
  if (typeof s.applied !== 'boolean') return false;
  if (!Number.isSafeInteger(s.before) || s.before < 0) return false;
  if (!Number.isSafeInteger(s.after) || s.after < 0) return false;
  if (s.after > s.before) return false;
  if (s.applied) return s.reason === null || s.reason === undefined;
  return typeof s.reason === 'string' && NO_NARROW_VALUES.indexOf(s.reason) !== -1;
}

// ── 집계 (DD10) ──────────────────────────────────────────────────────────────
//
// deltaCoverageFrom(projection) → { deltaRounds, pathsDropped, rounds }
//
// `lanes.laneCoverageFrom` 동형 — 순수이고 **어떤 입력에도 던지지 않는다**. 입력은
// `seal.js#project`의 반환이고, 델타 필드가 없던 시절의 라운드는 `scope: null`로
// 투영되므로 여기서 0으로 세어진다.
//
// 세는 규칙:
//   deltaRounds  : `scope.applied === true`인 **라운드 수**
//   pathsDropped : 그 라운드들의 `before - after` 합
//   rounds       : 투영에 있는 전체 라운드 수
// `applied=false` 라운드는 둘 다 증가시키지 않는다 — 축소가 일어나지 않았으므로 드롭도
// 0이고, 그 라운드의 사유는 원장의 `scope.reason`이 갖는다.
function deltaCoverageFrom(projection) {
  const rounds = (isRecord(projection) && Array.isArray(projection.rounds))
    ? projection.rounds : [];
  let deltaRounds = 0;
  let pathsDropped = 0;
  rounds.forEach(function (r) {
    // **`isValidScopeRecord`를 쓰는 것이 요점이다.** `applied === true`만 보고 세면
    // 형태 불량 레코드가 `deltaRounds`에는 들어가고 `pathsDropped`에는 안 들어가,
    // `seal.js#projectScope`가 그것을 `null`로 접은 것과 규칙이 갈린다 — 리포트는
    // 안 보여주는데 집계는 세는 상태이고, 그 갈림이 `lane` fold가 막으려던 바로 그
    // 실패 모드다. 술어를 하나만 두면 갈릴 자리가 없다.
    if (!isRecord(r) || !isValidScopeRecord(r.scope)) return;
    if (r.scope.applied !== true) return;
    deltaRounds += 1;
    pathsDropped += r.scope.before - r.scope.after;
  });
  return { deltaRounds: deltaRounds, pathsDropped: pathsDropped, rounds: rounds.length };
}

module.exports = {
  ENV_DELTA_SCOPE: ENV_DELTA_SCOPE,
  DELTA_SCOPE_DEFAULT: DELTA_SCOPE_DEFAULT,
  DELTA_SCOPE_VALUES: DELTA_SCOPE_VALUES,
  CONTEXT_LINES: CONTEXT_LINES,
  NO_NARROW: NO_NARROW,
  NO_NARROW_VALUES: NO_NARROW_VALUES,
  SCOPE_ASSERTION_PATTERNS: SCOPE_ASSERTION_PATTERNS,
  PRIOR_ROUND_PATTERNS: PRIOR_ROUND_PATTERNS,
  parseDeltaScope: parseDeltaScope,
  assertNoStatusAssertion: assertNoStatusAssertion,
  expandRanges: expandRanges,
  narrowScope: narrowScope,
  renderScopeLines: renderScopeLines,
  isValidScopeRecord: isValidScopeRecord,
  deltaCoverageFrom: deltaCoverageFrom,
};
