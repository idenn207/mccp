# Plan: leadtime-observability M4 — one-line-hardening

**Source PRD**: `.claude/prds/leadtime-observability.prd.md`
**Selected Milestone**: 4 — one-line-hardening
**Complexity**: Medium

## Summary

M3이 출고한 리드타임 한 줄은 값이 맞지만 **자기 계약 셋을 지키지 못한 채** 나갔다. 폭
계측기가 표시 폭을 못 보고(`l.length` 92 대 실제 106), 한 줄에 뜨는 두 커버리지 분모가
서로 다른 모집단인데 줄에서 구분되지 않으며, `md`와 `html`의 note 구조가 다른데 test가
그 차이를 **계약으로 고정**해 버렸다. 여기에 렌더 경로가 git을 무조건 spawn하고
(`allowGit: true` 하드코딩) 되돌릴 수단이 없다.

M4는 그 자기 표면만 닫는다. 새 지표를 추가하지 않고, 값도 바꾸지 않으며, PRD가 남긴
Open Question 하나(지표 4의 정의)를 증거로 판정한다.

**폭 축의 범위는 칼럼 예산으로 한정한다** — 이 저장소에는 레이아웃 측정 수단이 없으므로
(renderer test는 jsdom-free, `plugins/mccp/scripts/lib/renderer/tests/responsive-layout.test.js:35`는 CSS 정규식만 본다) 실제 렌더
폭 검증은 **닫지 않고 열어 둔 채 명시**한다. 칼럼은 대리 지표이고 M4는 그 대리 지표만
정직하게 만든다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | M4는 자기 표면의 결함만 닫고 새 지표를 추가하지 않는다 | constraint |
| UI2 | M4의 범위는 C4가 소유한 것으로 한정하고 남의 PRD 지적은 흡수하지 않는다 | exclusion |
| UI3 | 커버리지 없는 값은 출력하지 않는다 | constraint |
| UI4 | 값이 없으면 없다고 적고 0으로 적지 않는다 | constraint |
| UI5 | corpus.js의 출력 계약을 바꾸지 않는다 | exclusion |
| UI6 | 끝 앵커를 하나로 고르지 않고 둘 다 산출하며 불일치를 표면화한다 | direction |
| UI7 | 이 지표는 대외 보고 용도가 아니다 | constraint |
| UI8 | 폭 축은 칼럼 예산으로 축소하고 실제 렌더 폭 검증은 열어 둔다 | direction |
| UI9 | 리뷰 라운드를 늘리지 않고 캡이 소진된 상태로 진행한다 | direction |
| UI10 | 브랜치는 plugin manifest의 버전을 선언하지 않는다 | exclusion |
| UI11 | 임계값과 자동 분기는 정하지 않는다 | exclusion |

출처: UI1~UI7·UI11은 PRD 본문(Scope · Success Metrics · 결정 3건 · Out of scope),
UI8·UI9는 2026-09-04 세션의 운영자 응답, UI10은 우산 PRD 결정 1(CLAUDE.md §3.7).

## 실측 (2026-09-04, HEAD `2cb173c`, 이 worktree)

재현: `formatLeadtimeLine(require('.claude/state/leadtime/distribution.json'))` 의 `text` 를
East Asian Wide 2칼럼 규약으로 셌다.

| 대상 | code unit | 표시 폭 (ambiguous=1) | 표시 폭 (ambiguous=2) |
|---|---|---|---|
| 현행 한 줄 (실코퍼스 57/70) | 92 | 102 | **106** |
| 현행 · 3자리 합성 투영 | 100 | 110 | 114 |
| 현행 · 4자리 합성 투영 | 108 | 118 | 122 |

**PRD가 적은 `표시 폭 102`와 이 표의 `106`은 같은 문자열의 두 규약이다.** PRD는 East
Asian Ambiguous(`·` U+00B7 · `→` U+2192)를 1칼럼으로 셌고, 이 plan의 가드는 2칼럼으로
센다. 후자를 택한 이유는 DD2에 있다. 두 값 모두 옳고, 서로 다른 것은 규약이지 측정이
아니다.

부수 실측 — 현행 줄이 어긴 것은 `leadtime-surface.js:105`가 선언한 100칼럼이다.
`l.length`(92)로 재면 통과하고 표시 폭(102·106)으로 재면 초과한다. 즉 결함은 값이 아니라
**계측기**다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 단일 포맷 지점 | `plugins/mccp/scripts/lib/leadtime-surface.js:107` | `formatLeadtimeLine` 이 소비처 셋이 공유하는 유일한 생산자 |
| 단일 투영 | `plugins/mccp/scripts/lib/leadtime.js:1122` | `summarizeForSurface` 가 유일한 해석 지점 |
| 닫힌 열거형 강등 | `plugins/mccp/scripts/lib/leadtime.js:1151-1170` | `degradations` 에 리터럴만 push — 자유 문자열 0건 |
| falsifier | `plugins/mccp/scripts/lib/leadtime-surface.js:172-192` | 계약을 test가 **실패시킬 수 있는** 함수로 고정 |
| env 판독 | `plugins/mccp/scripts/lib/env-contract/value.js` | `parseBool` 경유 — raw 비교는 lint L9가 막는다 |
| env 등재 | `plugins/mccp/scripts/lib/env-contract/registry.js:194` | `[NAME, type, values, default, parsed, status, domain, 'path:line', desc]` |
| 부재 규칙 | `plugins/mccp/scripts/lib/renderer/sections/leadtime-line.js:40-43` | 미계산은 hide, 값 부재는 렌더 |
| 정적 부재 단언 | `plugins/mccp/scripts/lib/tests/session-identity.test.js` | 런타임 표면에 이름이 몇 회 등장하는지를 스캔으로 단언 |

## Design Decisions

### DD1 — 폭 예산은 120칼럼이고, 그 숫자는 데이터가 아니라 관례가 정했다

`SHARED_LINE_BUDGET = 120`. 선정 **순서**가 근거의 전부다: 먼저 120을 관례에서 골랐고,
그 다음 줄 설계 후보들을 재서 그 예산에 맞는 것을 택했다. 반대 방향(설계를 정하고 숫자를
거기 맞추는 것)이 §3.16과 이전 라운드의 패널이 경계한 침식이다.

기존 `leadtime-surface.js:105`의 100칼럼을 유지하지 않는 이유는 그 숫자가 **달성 불가**
이기 때문이다 — 라벨을 하나도 더하지 않은 현행 줄이 이미 106이고, 100에 맞추려면
계약된 토큰(두 앵커 중 하나)을 떨어뜨려야 하는데 그것은 UI6 위반이다. 100은 `l.length`
로 재던 시절의 숫자이고, 계측기를 고치면 그 숫자도 함께 정정 대상이 된다.

침식 방지 장치는 **4자리 투영 단언**이다(Task 5). 채택 설계의 4자리 폭이 정확히 예산과
같으므로(DD3), 줄을 조금이라도 넓히면 그 test가 붉어진다. 예산을 올려 통과시키는 것은
가능하지만 그러려면 예산 상수와 그 test를 **함께** 고쳐야 하고, 그 diff가 곧 기록이다.

### DD2 — East Asian Ambiguous는 2칼럼으로 센다 (fail-closed)

`·` 와 `→` 는 UAX #11의 Ambiguous라 로케일이 폭을 정한다 — 서구 1, 동아시아 2. 이 줄이
실제로 읽히는 터미널은 운영자의 한국어 로케일이므로, 1로 세면 가드가 **정확히 그
환경에서** 넘침을 놓친다. 예산 가드의 오차 방향은 보수적이어야 하므로 2를 택한다. 서구
로케일에서 같은 줄이 4칼럼 짧게 보이는 것은 여유이지 위반이 아니다.

`displayWidth` 는 Wide/Fullwidth를 2, 명시 Ambiguous 집합을 2, 나머지를 1로 센다.
**전각 판정은 코드 포인트 범위 열거이지 유니코드 테이블 전체가 아니다** — 의존성을 늘리지
않기 위한 선택이며, 이 줄이 쓰는 문자 집합(한글 · ASCII · `·` · `→`)에 대해 정확하다. 그
범위 밖 문자가 줄에 들어오면 폭이 과소 계산될 수 있고, 그 한계를 함수 주석에 적는다.

### DD3 — 분모는 그룹 라벨이 한 번 선언한다 (파일 자신의 패턴 확장)

두 분모가 오늘 우연히 같은 값(57)이라 화면에서 구분되지 않는다. 실제로는 다른 모집단이다.

- `coverage.measurable` = `result.records` (`leadtime.js:942`) — 패널 span이 측정된 레코드
- `post_panel_span.coverage.eligible` = `eligible.length` (`leadtime.js:827`) — `recorded_at`
  파싱에 성공해 조인 후보가 된 레코드 (`leadtime.js:617-626`)

해법은 **분모를 토큰마다 반복하지 않고 그룹 라벨이 한 번 선언**하는 것이다. 새 발명이
아니라 이 파일이 이미 문서화한 패턴의 확장이다 — `leadtime-surface.js:30-32`은 통계 이름
`p50` 을 헤드에서 한 번 선언해 토큰마다 반복하지 않는다고 적었고, 같은 이유로 같은 절약이
성립한다.

채택 형태:

```text
리드타임 (57/70 측정) · p50: 패널 7.5min (57) · 패널→ship (조인 57): ledger 0.40d (13) · hash 0.28d (18)
```

- 헤드 `(57/70 측정)` 이 **측정 분모 57**을 선언하고 `패널` 토큰을 지배한다.
- `패널→ship (조인 57):` 이 **조인 분모 57**을 선언하고 `ledger` · `hash` 를 지배한다.
- 모든 값 토큰은 예외 없이 `(n)` 하나를 단다. 예외를 두지 않는 것이
  `leadtime-surface.js:28`이 선언한 이 파일의 계약이다.

측정 폭(ambiguous=2): 실코퍼스 **108** · 3자리 **114** · 4자리 **120**. 셋 다 예산 120 이내이고
4자리가 정확히 예산이다(DD1의 침식 방지 장치).

`패널→ship` 을 줄이지 않은 것은 PRD 결정 2("이름이 재는 구간을 말한다")가 운영자 소유
제약이기 때문이다. 칼럼을 벌려고 그 이름을 깎는 것은 UI6/결정 2를 조용히 약화시키는
거래이므로 하지 않는다. 측정한 대안 4종 — `ship ledger` 110/118/126 · `→ship ledger`
112/120/128 · 라벨 전체 병기 121/129/137 · `ship:ledger`+`ship:hash` 115/123/131 — 중
예산 안에 들면서 이름을 온전히 지키는 것은 채택안뿐이다.

### DD4 — falsifier는 약해지지 않고 의무가 하나 늘어난다

`ADJACENT_COVERAGE` 가 `(a/b)` 에서 `(n)` 으로 바뀌므로 형태만 보면 검사가 느슨해 보인다.
그래서 **분모 지배 검사**를 더한다. `assertCoverageAdjacency` 는 이제 셋을 단언한다.

1. 헤드가 코퍼스 커버리지로 시작한다 (기존 `HEAD_COVERAGE`).
2. 모든 값 토큰 바로 뒤에 `(n)` 이 온다 (기존 인접성, 형태만 변경).
3. **각 값 토큰의 왼쪽에 자기 분모를 선언한 그룹 라벨이 존재한다.** 헤드의 `(a/b 측정)`
   또는 `(조인 n):` 형태이며, 어느 것도 지배하지 않는 값 토큰이 있으면 throw.

3이 없으면 그룹 라벨을 지운 줄이 통과해 DD3이 없던 일이 된다. 이 함수는 test가 강제하고
production 호출부는 0건이라는 기존 사실(`leadtime-surface.js:166-171`)은 그대로다.

### DD5 — md의 note는 문단 분리다. test는 계약을 고정한다

`renderer/sections/leadtime-line.js:51` 이 `line.text + '\n' + note` 를 쓴다. CommonMark에서
단일 개행은 **soft break**라 두 줄이 한 문단으로 접히는데, 같은 함수의 `html` 은 `<p>` 둘을
낸다(`:52-53`). 두 면의 구조가 다르다.

`md` 를 빈 줄 하나를 낀 문단 분리로 바꿔 html과 같은 구조로 만든다. 그러면
`renderer/tests/leadtime-line.test.js:68` 의 `out.md.split('\n').length === 2` 가 붉어진다 —
그 단언은 계약이 아니라 **결함을 고정**하고 있었으므로 함께 고친다. 새 단언은 문단
분리(빈 줄 존재)와 두 면의 구조 동형을 고정한다.

`status-grid` 의 삽입 지점은 영향을 받지 않는다 — 같은 파일의 배선 단언은
`line.md.split('\n')[0]`(첫 줄)만 보므로 뒤에 줄이 하나 늘어도 성립한다.

### DD6 — git spawn을 끄는 것은 축을 끄는 것이 아니다

`leadtime-derive.js:81` 이 `allowGit: true` 를 하드코딩한다. 렌더 경로가 항상 git을 spawn하고
되돌릴 수단이 없다(같은 파일 `:17-18` 이 렌더 경로 약 16% 추가라고 실측을 적었다).

되돌릴 레버는 **`allowGit`** 이다 — 축 전체를 끄는 토글이 아니다. 축을 끄면 관측이 사라져
UI3/UI4가 지키려는 것을 잃지만, `allowGit:false` 는 백분위와 커버리지를 **그대로 두고**
증인만 뺀다. 그 성질은 코드가 이미 보장한다(`leadtime.js:170-173`: "분포는 영향을 받지
않는다 — 증인은 미짝의 *분류*에만 쓰인다"). 대가는 `not_shipped` 가 도달 불가가 되어 그
행이 `unclassified` 로 떨어지는 것이고, 그 사실은 `degradations:['git-disabled']` 로
산출물에 실린다(`leadtime.js:1155-1156`).

`MCCP_LEADTIME_GIT` (bool, 기본 on). `parseBool` 경유 — raw 비교는 lint L9가 막는다.

### DD7 — "spawn 0회"는 주장하지 않는다. 관측 가능한 것만 단언한다

`execFileSync` 는 모듈 최상위에서 require되고(`leadtime.js:178`) `audit()` 은 내부 바인딩을
직접 부르므로(`:1075`), export를 monkey-patch해도 가로채지 못한다. **주입된 실행기 seam은
존재하지 않는다.** 따라서 프로세스 수를 세는 단언은 이 저장소에서 쓸 수 없다.

대신 둘을 단언한다.

- **결과 단언** — 토글 off에서 `git_witness.reason === 'git-disabled'` 이고 `degradations` 에
  `'git-disabled'` 가 있으며, **백분위와 커버리지가 on일 때와 동일**하다.
- **정적 단언** — `leadtime.js` 소스에서 `readGitTouchedPaths(` 호출이 정확히 1건이고 그것이
  `allowGit ?` 삼항 안에 있다 (`session-identity.test.js` 의 스캔 단언과 같은 형태).

둘을 합치면 "그 분기를 타지 않았다"와 "그 분기가 spawn의 유일한 관문이다"가 각각 고정된다.
이것은 spawn 계수가 아니며, 그 한계를 test 이름과 주석에 적는다.

### DD8 — 지표 4의 정의를 커버리지 축으로 옮긴다

PRD Open Question 103행이 M4에 판정을 맡겼다. 판정: **시각 불일치를 지표 4의 정의에서
내리고 커버리지 차이로 대체한다.**

근거는 구조다. `completion-ledger/index.js:183-185` 가 `completedAt = meta.created_at` 을
그대로 복사한다 — 즉 두 앵커는 독립된 두 증인이 아니라 **한 사건의 두 기록**이고, 시각
차이는 우연히 0이 아니라 **구성상 0**이다. 실측이 그것을 확인한다: 양쪽 매치 7건의
`anchor_delta_ms` 가 전건 0(`distribution.json` 의 `disagreement: {n:7, p50:0, max:0}`),
그리고 M3이 이미 `structurally-zero: ledger.completed_at copies ship receipt meta.created_at`
을 `disagreement_note` 로 stamp해 뒀다(`leadtime.js:1102-1103`).

살아있는 신호는 **커버리지 차이**다: `only_ledger` 6 · `only_ship` 11 · `both` 7. 이 비대칭은
이미 실제 배선 결함 하나를 표면화했다(PRD Open Question 102행 — ledger 쓰기가 멈췄다).

판정의 범위는 **PRD 문서**다 — 지표 4 행의 "측정" 열과 Open Question 항목을 고쳐 적는다.
한 줄과 산출물은 바꾸지 않는다: 시각 불일치는 `disagreement` + `disagreement_note` 로 파일에
계속 실리고(UI6 — 표면화는 유지), 한 줄에는 원래부터 없다(`leadtime-surface.js:34-39`).
C2가 세 번째 **독립** 앵커를 만들면 시각 축이 다시 의미를 갖고, 그때 재판정한다.

### DD9 — 완료 ledger 엔트리 커밋은 M4가 하지 않는다

`.claude/state/completion-ledger/leadtime-observability-m3__e337d9e3d659.json` 이 untracked이고
같은 디렉토리의 다른 45건은 tracked다. §3.12가 그 corpus를 tracked로 두라고 하므로 공백은
실재한다. 그런데도 M4에서 빼는 이유는 둘이다.

1. **PRD의 M4 Outcome 행에 없다.** UI1/UI2가 범위를 자기 표면으로 한정했다.
2. **그 엔트리가 `"version": "1.35.0"` 을 주장한다.** 어떤 릴리스 컷도 발행하지 않은
   번호이고(UI10 · §3.7), 파일명 정체성이 `<decision_id>__<receipt_hash[0:12]>` 라 결속을
   깨지 않고는 고칠 수 없다(§3.12 no-rehash). 지금 커밋하면 **감사 corpus에 영구적인 거짓
   버전 주장**이 들어간다.

그러므로 커밋하지 않고 backlog에 증거와 함께 적재한다. 이연이며, 조용히 버리는 것이 아니다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/leadtime-surface.js` | UPDATE | `displayWidth` + `SHARED_LINE_BUDGET` 신설 · 한 줄 재설계(DD3) · falsifier 3단언(DD4) |
| `plugins/mccp/scripts/lib/renderer/sections/leadtime-line.js` | UPDATE | md note를 문단 분리로(DD5) |
| `plugins/mccp/scripts/lib/leadtime-derive.js` | UPDATE | `allowGit` 하드코딩 제거 · `MCCP_LEADTIME_GIT` 판독(DD6) |
| `plugins/mccp/scripts/lib/tests/leadtime-surface.test.js` | UPDATE | 폭 예산 3투영 · bare-count falsifier 회귀 |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | UPDATE | `:1123` 의 `l.length` → `displayWidth` · 예산 상수 참조 |
| `plugins/mccp/scripts/lib/tests/leadtime-derive.test.js` | CREATE | 토글 결과 단언 + spawn 관문 정적 단언(DD7) |
| `plugins/mccp/scripts/lib/renderer/tests/leadtime-line.test.js` | UPDATE | `:68` 단언을 결함 고정에서 계약 고정으로(DD5) |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | `MCCP_LEADTIME_GIT` 등재(observability 도메인) |
| `docs/ENVIRONMENT.md` | UPDATE | §3 observability 색인 행 |
| `docs/environment/observability.md` | UPDATE | 상세 절 + 사용 예시(lint L7) |
| `docs/leadtime-observability/one-line-consumption.md` | UPDATE | 동결면 재생성 — 스키마(`:33`) + 예시(`:125`·`:131`) |
| `.claude/prds/leadtime-observability.prd.md` | UPDATE | milestone 4 `complete` · 지표 4 정의 판정 · Open Question 103행 종결 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | DD9 이연 1건 + 렌더 폭 CRITICAL 이연 1건 |
| `.claude/state/leadtime/distribution.json` | UPDATE | 재생성(내용 변화 시에만 — writer가 content-stable) |

`plugins/mccp/.claude-plugin/plugin.json` 은 **바꾸지 않는다**(UI10 · §3.7). `.claude/cache/`
산출물(STATUS.md · status.html)은 gitignored라 커밋 대상이 아니다.

## Tasks

### Task 1: 표시 폭 계측기와 예산 상수를 신설한다

- **Action**: `leadtime-surface.js` 에 `displayWidth(text)` 와 `SHARED_LINE_BUDGET = 120` 을
  추가하고 export한다. `displayWidth` 는 코드 포인트를 순회하며 Wide/Fullwidth 범위와 명시
  Ambiguous 집합(`·` U+00B7 · `→` U+2192)을 2, 나머지를 1로 센다. 함수 주석에 (a) 왜
  ambiguous가 2인지(DD2) (b) 범위 열거라 그 밖의 문자는 과소 계산될 수 있다는 한계를 적는다.
  `leadtime-surface.js:105` 의 "100칼럼" 문구를 예산 상수를 가리키도록 정정한다.
- **Mirror**: 같은 파일의 `fmtMin`/`fmtDay` — 어휘와 상수를 이 모듈이 단독 소유하고 소비처가
  그것만 읽는다.
- **Validate**: `displayWidth('리드타임') === 8` · `displayWidth('abc') === 3` ·
  `displayWidth('·') === 2` 가 성립한다.

### Task 2: 한 줄을 그룹 분모 형태로 재설계한다

- **Action**: `formatLeadtimeLine` 의 `token()` 이 `(matched/total)` 대신 `(matched)` 를 내도록
  바꾸고, ship 그룹 앞에 `패널→ship (조인 <eligible>):` 라벨을 넣는다. 헤드는 무변경
  (`(측정/코퍼스 측정) · p50:`). `parts` 의 키는 유지하되 새 그룹 라벨을 `parts.shipGroup` 으로
  추가한다 — 기존 키를 제거하면 소비처가 조용히 `undefined` 를 렌더한다.
- **Mirror**: `leadtime-surface.js:30-32` — 반복되는 선언을 헤드로 올려 한 번만 말하는 기존 결정.
- **Validate**: 실코퍼스 투영으로 만든 줄이 DD3의 채택 문자열과 토큰 구조가 같고,
  `displayWidth` 가 120 이하다.

### Task 3: falsifier에 분모 지배 검사를 더한다

- **Action**: `ADJACENT_COVERAGE` 를 `(n)` 형태로 바꾸고, `assertCoverageAdjacency` 에 DD4의
  3번 단언(각 값 토큰의 왼쪽에 그 분모를 선언한 그룹 라벨이 존재한다)을 추가한다. 위반은
  기존과 같이 throw이고 메시지에 어느 토큰이 지배자를 못 찾았는지 싣는다.
- **Mirror**: 같은 함수의 기존 두 단언 — 실패 메시지가 위반 토큰과 인덱스를 싣는 형태.
- **Validate**: 그룹 라벨을 지운 문자열과 값 토큰의 `(n)` 을 뗀 문자열이 **각각** throw한다.
  통과 문자열 하나로는 falsifier가 no-op인지 알 수 없다.

### Task 4: md note를 문단 분리로 바꾸고 그 test를 계약으로 되돌린다

- **Action**: `renderer/sections/leadtime-line.js:51` 의 `md` 조립을 빈 줄 하나를 낀 문단
  분리로 바꾼다. `renderer/tests/leadtime-line.test.js:68` 의 `length === 2` 단언을 (a) 줄이
  3개이고 (b) 가운데가 빈 줄이며 (c) `html` 의 `<p>` 개수와 `md` 의 문단 개수가 같다로 바꾼다.
- **Mirror**: 같은 test 파일의 status-grid 배선 단언 — "빈 줄이 없으면 CommonMark가 한 문단으로
  접는다"를 이미 같은 이유로 단언하고 있다.
- **Validate**: `degraded` 와 `blind` 두 상태 모두에서 md 문단 수와 html `<p>` 수가 일치한다.

### Task 5: 폭 예산 회귀 test를 세운다 (실코퍼스 + 2개 합성 투영)

- **Action**: `leadtime-surface.test.js` 에 폭 단언 3건을 추가한다 — 실코퍼스 투영 · 3자리 합성
  투영 · 4자리 합성 투영이 모두 `displayWidth <= SHARED_LINE_BUDGET`. 합성 투영은 픽스처
  빌더의 카운트만 10배·100배로 곱해 만든다. **리터럴 폭 숫자를 단언하지 않는다** — 코퍼스가
  자기 자신을 늘리므로(PRD Evidence 마지막 항) 관계 단언만 유효하다.
- **Mirror**: 같은 파일의 기존 픽스처 빌더(`:27`)와 관계 단언 스타일.
- **Validate**: 세 단언이 모두 통과하고, `SHARED_LINE_BUDGET` 를 119로 낮추면 4자리 단언이
  실패한다(가드가 실제로 무는지 확인 — 확인 후 되돌린다).

### Task 6: 폭 계측기의 오작동 지점을 고친다

- **Action**: `leadtime.test.js:1116-1124` 의 `l.length > 100` 을 `displayWidth(l) >
  SHARED_LINE_BUDGET` 로 바꾸고 test 이름의 "100 columns"를 예산 상수 표현으로 고친다. 이
  test가 검사하는 것은 `renderHuman` 전체 출력의 모든 줄이므로, 한 줄 외의 줄이 예산을
  넘으면 여기서 드러난다.
- **Mirror**: 없다 — 이 저장소에 표시 폭 가드 선례가 0건이라 Task 1이 그 선례를 만든다.
- **Validate**: 고친 test가 통과한다. 통과하지 않으면 `renderHuman` 의 다른 줄이 예산을 넘는
  것이므로 **그 사실을 Risks에 기록하고 예산을 올리지 않는다** — 넘는 줄을 줄이거나, 줄일 수
  없으면 그 줄을 이 가드의 범위 밖으로 명시 제외하고 사유를 test 주석에 적는다.

### Task 7: git spawn 토글을 배선하고 계약을 등재한다

- **Action**: `leadtime-derive.js` 가 `env-contract/value.js#parseBool` 로 `MCCP_LEADTIME_GIT`
  를 읽어 `allowGit` 에 넘긴다(기본 on). `registry.js` 의 observability 도메인에 항목을 추가하고
  evidence를 그 판독 지점 `path:line` 으로 적는다. `docs/ENVIRONMENT.md` §3 색인 행과
  `docs/environment/observability.md` 상세 절(사용 예시 포함)을 더한다.
- **Mirror**: `registry.js:194` 의 `MCCP_ORCHESTRATION_COST_FAIL_OPEN` 행 — bool · 기본 on ·
  evidence가 실제 판독 지점.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` 가 L1~L12 전부 통과한다
  (특히 L2 양방향 · L3 앵커 해석 · L7 예시 · L10 정방향).

### Task 8: 토글의 관측 가능한 결과와 spawn 관문을 단언한다

- **Action**: `leadtime-derive.test.js` 를 신설한다. (a) 토글 off에서 `degradations` 에
  `'git-disabled'` 가 있고 `git_witness.reason === 'git-disabled'` 이며, (b) 같은 코퍼스에 대해
  on/off 의 `panel_span` 백분위와 `coverage` 가 **동일**하고, (c) `leadtime.js` 소스에서
  `readGitTouchedPaths(` 호출이 정확히 1건이며 `allowGit` 삼항 안에 있다.
- **Mirror**: `session-identity.test.js` 의 소스 스캔 단언.
- **Validate**: 세 단언 통과. test 이름과 주석에 **"이것은 spawn 계수가 아니다"** 를 명시한다(DD7).

### Task 9: 동결면과 PRD를 실제 산출물로 재생성한다

- **Action**: `node plugins/mccp/scripts/derive/cli.js render` 를 돌려 나온 실제 줄로
  `docs/leadtime-observability/one-line-consumption.md` 의 스키마(`:33`)와 예시(`:125`·`:131`)를
  교체한다. PRD의 milestone 4 상태를 `complete` 로, 지표 4 행의 "측정" 열을 커버리지 축으로,
  Open Question 103행을 판정 결과로 고쳐 적는다(DD8). backlog에 DD9 이연 1건과 렌더 폭
  CRITICAL 이연 1건을 증거와 함께 append한다.
- **Mirror**: M3 사이클의 `fix(v1.35.0): resync one-line-consumption prose figures to the
  regenerated freeze` — 산문 수치를 손으로 적지 않고 재생성 결과로 맞춘 선례.
- **Validate**: 동결면의 예시 문자열이 방금 렌더된 STATUS.md의 줄과 **문자 단위로 일치**한다.

## Validation

```bash
# 1. 축 test 전량 (codex 경로 차단 — CLAUDE.md §3.4)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/leadtime.test.js \
  plugins/mccp/scripts/lib/tests/leadtime-surface.test.js \
  plugins/mccp/scripts/lib/tests/leadtime-derive.test.js \
  plugins/mccp/scripts/lib/tests/leadtime-distribution.test.js \
  plugins/mccp/scripts/lib/renderer/tests/leadtime-line.test.js

# 2. 환경변수 계약 (L1~L12)
node plugins/mccp/scripts/lib/env-contract/lint.js

# 3. 실제 렌더 — 한 줄이 STATUS.md에 뜨는지, 그 폭이 예산 안인지
node plugins/mccp/scripts/derive/cli.js render
node -e "const s=require('./plugins/mccp/scripts/lib/leadtime-surface');const d=require('./.claude/state/leadtime/distribution.json');const t=s.formatLeadtimeLine(d).text;const w=s.displayWidth(t);console.log(w+'/'+s.SHARED_LINE_BUDGET+' '+t);s.assertCoverageAdjacency(t);if(w>s.SHARED_LINE_BUDGET)process.exit(1)"

# 4. 토글 off — 백분위 불변 + git-disabled 강등
node -e "const{scanLeadtime}=require('./plugins/mccp/scripts/lib/leadtime-derive');const on=scanLeadtime(process.cwd(),{leadtimeScan:true});process.env.MCCP_LEADTIME_GIT='0';const off=scanLeadtime(process.cwd(),{leadtimeScan:true});const eq=JSON.stringify(on.panel_span)===JSON.stringify(off.panel_span)&&JSON.stringify(on.coverage)===JSON.stringify(off.coverage);console.log('panel/coverage identical:',eq,'| off degradations:',off.degradations);if(!eq||!off.degradations.includes('git-disabled'))process.exit(1)"

# 5. 동결면이 실제 산출물과 일치하는지
grep -n '리드타임 (' docs/leadtime-observability/one-line-consumption.md
grep -n '리드타임 (' .claude/cache/STATUS.md

# 6. 버전 선언 금지 (UI10 · §3.7)
node scripts/version-declaration-guard.js

# 7. 회귀 범위 — renderer 전체
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 plugins/mccp/scripts/lib/renderer/tests/*.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 칼럼 예산이 실제 렌더 폭의 대리 지표일 뿐이라, 예산 안인 줄이 브라우저에서 두 줄로 접힌다 | 높음 | **닫지 않는다**(UI8). 이 plan은 칼럼만 정직하게 만들고 렌더 폭 검증은 backlog로 이연하며 소유 축을 renderer로 명시한다. Task 1의 함수 주석과 이 표가 그 사실을 남긴다 |
| `displayWidth` 의 범위 열거가 미래에 들어올 문자(이모지 · 결합 문자)를 과소 계산한다 | 중간 | 한계를 함수 주석에 적는다. 오늘 이 줄의 문자 집합은 한글·ASCII·`·`·`→` 로 닫혀 있고 투영에 자유 문자열이 없다(DD12 계보) |
| 값 토큰이 `(n)` 만 달아 그룹 라벨과 떨어져 읽히면 분모를 잃은 숫자로 보인다 | 중간 | falsifier 3번 단언이 라벨 없는 줄을 구조적으로 금지한다. 그래도 잘린 컨텍스트(검색 결과 한 줄 등)에서는 남는 위험이라 여기 기록한다 |
| 4자리 투영이 정확히 예산이라 여유가 0이고, 라벨을 조금만 늘려도 붉어진다 | 높음 | 의도된 설계다(DD1). 붉어졌을 때의 정답은 예산 상향이 아니라 설계 축소이며, 상향하려면 상수와 test를 함께 고쳐 diff에 남긴다 |
| `renderHuman` 의 **다른** 줄이 표시 폭 예산을 넘어 Task 6이 붉어진다 | 중간 | 예산을 올리지 않는다. 넘는 줄을 줄이거나, 못 줄이면 명시 제외 + 사유를 test 주석에 적는다(Task 6 Validate) |
| 동결면 재생성이 코퍼스 성장 때문에 다음 게이트 실행에서 또 어긋난다 | 높음 | 동결면은 리터럴을 쓰지만 **test는 쓰지 않는다**(Task 5). PRD Evidence 마지막 항이 정한 규칙 그대로 |
| PRD 지표 4 판정이 C2의 세 번째 앵커 착지로 뒤집힌다 | 중간 | 판정문에 재판정 조건을 명시한다(DD8 마지막 문단). 되돌릴 수 있게 적는 것이 판정을 미루는 것보다 낫다 |
| `MCCP_LEADTIME_GIT` 를 끈 채 잊어 `unclassified` 증가가 코퍼스 성질로 오독된다 | 낮음 | 코드가 이미 `degradations:['git-disabled']` 를 산출물에 싣는다(`leadtime.js:1155-1156`). 문서 상세 절에 그 신호를 읽는 법을 적는다 |

## Gate Deviation

**이 plan은 L2 패널 승인 없이 착지한다.** 사유와 상태를 그대로 남긴다.

- 이 decision slug(`leadtime-observability-m4`)의 리뷰 라운드는 **소진됐다** —
  `.claude/state/review-rounds/mccp-plan-codex__leadtime-observability-m4.json` 이
  `rounds:[{index:0, channel:'panel', classification:'emitted'}]` 이고 봉인은
  `cap:1 · pinned:true · pinned_by:'codex-disabled' · mode:'enforce'` 다.
- 캡은 `MCCP_GATE_ROUND_CAP` 로 열리지 않는다 — `review-single-pass.js:109-137` 의
  `effectiveRoundCap` 이 `MCCP_CODEX_DISABLED=1` 을 보면 env 캡을 무시하고 1로 pin한다. 그
  변수는 사용자 전역 `settings.json` 의 **영구 운영자 정책**이고 §3.4가 게이트의 해제를
  금지한다. 원장 삭제는 §3.16이 금지한다.
- 따라서 `/mccp:plan` Phase 5.2는 `5.2c-emit` 에서 exit 12로 HALT하고 **receipt는 작성되지
  않는다**. 이 저장소는 `MCCP_RECEIPT_GATE_MODE=soft` 라 누락 receipt는 후속 게이트를 막지
  않는다(stale/blocking/critical만 차단).
- **직전 라운드의 리뷰 대상은 이 본문이 아니다.** 그 라운드가 본 plan(hash
  `sha256:f252ab4d…`)은 디스크에서 소실됐고 커밋된 적이 없어 복구 불가다. 이 본문은
  `.claude/reviews/plan-review-leadtime-observability-m4.md` 에 보존된 11건 지적을 반영해
  **처음부터 다시 쓴 것**이며, 그 지적 중 이 본문에 직접 대응하는 것은 다음과 같다.

| 이전 라운드 지적 | 이 본문의 처리 |
|---|---|
| 폭 예산이 120과 125로 갈리고 자기 예시가 그것을 넘는다 (architect·test·invariant HIGH) | 예산은 **120 단일**이고 DD1·DD3·Task 5가 같은 숫자를 쓴다. 세 투영(108·114·120)을 실측해 실었다 |
| Task 5가 4자리 투영에 "예산 안"을 단언하게 해 결정적으로 실패한다 (architect·test·invariant HIGH) | 채택 설계의 4자리가 예산과 같아 단언이 성립한다. 그리고 그 여유 0을 침식 방지 장치로 **명시**했다 |
| 렌더 폭 CRITICAL이 측정 수단 없이 닫힌 것처럼 보인다 (test HIGH · invariant HIGH) | 닫지 않는다. UI8로 범위를 칼럼으로 축소하고 Risks 1행 + backlog 이연으로 열어 둔다 |
| Task 8의 `ledger_count` 오라클이 tracked 전환을 관측하지 못한다 (architect·security·test·invariant MEDIUM) | 해당 Task를 **삭제**했다. DD9가 이연 사유(버전 주장 + 범위)를 적는다 |
| ledger 엔트리가 미발행 버전 `1.35.0` 을 주장한다 (security MEDIUM) | DD9가 그것을 커밋하지 않는 **주된 근거**로 삼는다 |
| DD7의 "주입된 실행기" seam이 존재하지 않는다 (test MEDIUM) | DD7이 seam 부재를 인정하고 spawn 계수를 **주장하지 않는다**. 결과 단언 + 정적 단언으로 대체 |
| `summarizeForSurface` 인용이 `:942` 로 틀렸다 (architect LOW) | Patterns 표에서 `:1122` 로 정정. `:942` 는 `measurable` 분모 근거로만 인용(DD3) |
| 토글이 `distribution.json` 에는 낡은 파일을 남긴다 (architect MEDIUM) | 해당 없음 — DD6이 축을 끄지 않고 `allowGit` 만 끄므로 투영은 계속 갱신된다 |

## Acceptance

- [ ] 모든 Task 완료
- [ ] Validation 1~7 전부 통과
- [ ] 패턴을 재발명하지 않고 mirror 표의 선례를 따랐다
- [ ] **게이트/경로를 실제로 1회 완주하고 산출물을 확인** — `node plugins/mccp/scripts/derive/cli.js render`
      가 실제로 `.claude/cache/STATUS.md` 에 DD3 형태의 한 줄을 내고, 그 줄의 `displayWidth` 가
      120 이하이며, `assertCoverageAdjacency` 가 그 줄에 대해 통과한다. 단위 test 통과만으로는
      이 항목을 채우지 못한다
- [ ] 토글 off 실행이 백분위·커버리지를 바꾸지 않고 `git-disabled` 강등만 더한다 (Validation 4)
- [ ] 동결면의 예시 문자열이 방금 렌더된 줄과 문자 단위로 일치한다 (Validation 5)
- [ ] PRD의 milestone 4가 `complete` 이고 지표 4 판정과 Open Question 종결이 기록됐다
- [ ] `plugin.json` 의 `version` 이 base와 동일하다 (Validation 6 · UI10)
- [ ] 이연 2건(렌더 폭 CRITICAL · DD9 ledger 엔트리)이 backlog에 증거와 함께 적재됐다

## Out of Scope

- **실제 렌더 폭 측정** — 소유 축은 renderer. 이 저장소에 레이아웃 엔진이 없고 root
  `package.json` 도 없어 의존성 추가가 선행돼야 한다. backlog 이연.
- **완료 ledger 엔트리의 tracked 전환** — DD9. 미발행 버전 주장 때문에 단순 `git add` 가 아니다.
- **`1.35.0` 주장이 `version-declaration-guard.js` 사거리 밖인 문제** — 소유 축은
  release-channel-separation. 그 가드는 `plugin.json` · footer 2면 · CHANGELOG만 본다.
- **hero 슬롯에서 리드타임 줄의 위치·강조 등급** — M3 PR 게이트가 이연한 UX 결정. 소유 축이 다르다.
- **임계값 · 자동 분기**(C7) · **`/mccp:work` 진입 앵커 생산**(C2) · **halt 대기 구간**(C9 M1).
