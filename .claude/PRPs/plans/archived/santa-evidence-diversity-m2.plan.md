# Plan: santa 증거 다양성 M2 — 상시 스코프 + 정합 rubric

**Source PRD**: `.claude/prds/santa-evidence-diversity.prd.md`
**Selected Milestone**: 2 — 상시 스코프 + 정합 rubric
**Complexity**: Medium

## Summary

리뷰 스코프가 `git diff`인 한, **두 문서의 관계**인 불변식(계획이 단언하는 마일스톤 수·
회부 건수가 현재 워킹트리 PRD와 맞는가)은 PRD가 diff에 없을 때 구조적으로 검증 불가다 —
#125가 실측한 결함이 정확히 그것이다. M2는 신규 순수 oracle `scope-always.js`가 **현재
decision의 plan과 그 plan이 선언한 Source PRD**를 diff 여부와 무관하게 스코프에 넣고,
고정 rubric 1행이 그 쌍을 워킹트리 기준으로 대조하게 한다. 리뷰어 수는 늘리지 않는다(I5) —
바뀌는 것은 **무엇이 스코프에 들어가는가** 하나다.

## User Intent

<!-- PRD 본문(사용자 공동 작성) + 우산 PRD review-loop-trust 승계 불변식 + 소유권 문서
     변경 프로토콜 + CLAUDE.md 3.15에서 추출. 저자 정당화는 ## Design Decisions 소관. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 리뷰어를 온화하게 만들지 말 것. 오탐은 판정 하류에서 거른다 | constraint |
| UI2 | 리뷰어 수를 늘리지 말 것. 다양성은 증거 경로로만 확보한다 | constraint |
| UI3 | plan과 PRD 계열은 diff 여부와 무관하게 검토 대상이 된다 | direction |
| UI4 | 정합 rubric은 고정 1행이고 현재 워킹트리 PRD와 대조한다 | direction |
| UI5 | 계획의 항목 수와 마일스톤 범위와 회부 건수가 PRD와 불일치하면 즉시 NAUGHTY다 | direction |
| UI6 | 상시 스코프가 커져 리뷰 품질이 떨어지면 안 된다. 상시 대상은 관계 검증에만 쓰이도록 rubric으로 좁힌다 | constraint |
| UI7 | prds 디렉토리 전체는 넓다. 현재 decision 관련분으로 좁힐지 전체를 넣을지 결정이 필요하다 | direction |
| UI8 | 상시 스코프는 P3 델타 축소에서 면제하는 것이 권장이다. 관계 불변식은 매 라운드 재확인 대상이다 | direction |
| UI9 | santa verdict는 게이트 승인이 아니다 | constraint |
| UI10 | severity 판정 원장 종료 조건은 P1 소유다. 본 축은 원장을 소비만 한다 | exclusion |
| UI11 | 델타 스코프는 P3 소유다 | exclusion |
| UI12 | 블라인드 레인 자체는 M1이 끝냈다 | exclusion |
| UI13 | degrade 차단은 M3 소유다 | exclusion |
| UI14 | Codex 제거나 다른 외부 모델 도입은 하지 않는다 | exclusion |
| UI15 | gpt-5.4 하드코딩 갱신은 본 PRD 밖이다 | exclusion |
| UI16 | 동결 시그니처를 자식 PRD가 바꾸지 말 것. 바꿔야 하면 P0를 재개한다 | constraint |
| UI17 | 공유 표면인 커맨드 본문과 CLI에서는 자기 절만 편집할 것 | constraint |
| UI18 | 소유권 표가 실제 변경과 어긋나면 같은 PR에서 표를 고칠 것 | constraint |
| UI19 | 각 불변식의 회귀 test 존재를 지표에 포함할 것 | constraint |
| UI20 | 게이트 리뷰는 1라운드가 기본이다. plan을 다듬기보다 적용 후 결과로 판단한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 oracle 모듈 | `plugins/mccp/scripts/lib/santa/lanes.js:1-40` | 신규 판정 모듈은 디스크·git·시각을 모르고 env는 파서 1종만 읽는다. I/O는 `cli.js`가 진다 |
| env 파서 | `plugins/mccp/scripts/lib/santa/lanes.js:81-95` `parseBlindLane` | 열거 검사 후 불량값은 loud stderr warn + default fail-open. 던지지 않는다 |
| 고정 문구 상수 | `plugins/mccp/scripts/lib/santa/lanes.js:66-70` `DO_NOT_TRUST_NARRATIVE` | 축의 전부가 한 문단이면 자유 문장으로 두지 않는다 — 문구가 호출마다 흔들리면 "무엇을 지시했는가"가 사후 재현 불가가 된다 |
| 조용하지 않은 절삭 | 같은 파일 `buildBlindPrompt`의 `TRUNCATED:` 줄 | 상한 초과 시 절삭 **사실을 본문에 명시**한다. 조용한 절삭은 스코프를 거짓말하게 만든다 |
| 신규 subcommand 배선 | `plugins/mccp/scripts/lib/santa/cli.js:940` `cmdLanes` | 판정은 oracle, 배선은 cli, 소비는 커맨드 본문. 실패 시 stdout에 **부분 JSON을 내지 않는다** |
| 입력 파일 방어 | 같은 파일 `readJsonStringArray:381-420` | containment → 크기 상한 → JSON 파싱 → 형태 검사를 같은 순서로. 실패는 전부 typed error → exit 2 |
| Source PRD 파싱 | `plugins/mccp/scripts/derive/sources/plans.js:18-30` | 링크 형태 우선, 실패 시 평문 형태. `stripWrap`가 백틱·인용부호를 벗긴다 |
| 모듈 집합 가드 확장 | `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:1046-1113` | 신규 모듈은 열거 목록에 **한 줄로 승인**하고 receipt-free 목록·require allowlist에도 등재한다. 단언을 지우지 않는다 |
| PRD 어휘 정정 | `.claude/plans/santa-evidence-diversity-m1.plan.md` DD9 | 코드와 PRD 문언이 어긋나면 근거를 적고 **PRD를 같은 PR에서 고친다** |
| 접속점 단일화 | 같은 파일 DD10·DD11 | 스코프의 소유자는 `santa-loop.md` Step 1이고 `SCOPE_PATHS_JSON` 변수 하나가 접속점이다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/scope-always.js` | CREATE | P2 신규 순수 oracle. 소유권 표에 이미 배정된 경로 |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | `scope-always` subcommand 1개 추가 (I/O + 발견) |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | Step 1 병합 + Step 2 고정 rubric 행 + Step 3 `--rubric-file` 배선 |
| `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | UPDATE | P2 회귀 test — oracle + CLI + #125 fixture |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATE | 모듈 집합·receipt-free·require allowlist에 신규 모듈 등재 |
| `docs/ENVIRONMENT.md` | UPDATE | `MCCP_SANTA_ALWAYS_SCOPE` 등재 |
| `docs/santa-loop/ownership.md` | UPDATE | P2 M2 export 계약 + 연 파일 근거 (프로토콜 4) |
| `.claude/prds/santa-evidence-diversity.prd.md` | UPDATE | Milestone 2 status + Scope 문언 정정 + Open Question 해소 |
| `CHANGELOG.md` | UPDATE | `## [1.28.3]` 항목 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (4면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (4면) |

## Design Decisions

### DD1 — 상시 스코프는 전체 코퍼스가 아니라 decision 범위의 관계 폐포다

PRD Scope MVP (2)는 상시 대상을 `.claude/PRPs/**` · `.claude/prds/**` · `*plan*.md` ·
`*PRD*.md` 네 글롭으로 적었다. 이 저장소에서 그 글롭을 문자 그대로 취하면 다음과 같다.

| 글롭 | 실측 (2026-08-19) |
|---|---|
| `.claude/PRPs/**` | 267 파일 / 6997 KB |
| `.claude/plans/*.md` | 26 파일 / 1712 KB (`codex-findings-backlog.md` 단독 320 KB) |
| `.claude/prds/*.md` | 7 파일 / 144 KB |
| repo 전역 `*plan*.md` | 191 파일 |
| repo 전역 `*PRD*.md` | 42 파일 |

**번들 리뷰어가 받는 것은 경로가 아니라 내용이다.** 7 MB를 스코프에 넣으면 PRD Risk 2
(400 LOC 임계에서 리뷰 품질이 떨어진다)가 즉시 발화하고, 그 결과는 "더 많이 보게 했더니
아무것도 못 보게 됐다"이다. PRD Open Question("상시 스코프가 무관한 PRD까지 끌어오는가 —
현재 decision 관련분으로 좁힐지, 전체를 넣고 rubric이 걸러내게 할지", UI7)이 요구한
결정을 위 실측이 대신 내린다: **좁힌다.**

상시 대상은 다음 폐포다.

1. `--paths-file`(Step 1의 diff 스코프)에 이미 있는 모든 `*.plan.md`
2. `.claude/plans/<slug>*.plan.md` + `.claude/PRPs/plans/<slug>*.plan.md` (비재귀,
   `archived/` 제외 — 아카이브된 plan은 활성 검토 대상이 아니다, CLAUDE.md 3.11)
3. 위에서 얻은 각 plan이 `**Source PRD**:` 로 **스스로 선언한** PRD

즉 상시 스코프는 "PRD를 전부 넣는다"가 아니라 **"관계의 한쪽만 스코프에 들어오는 일이
없게 한다"**이다. 그 폐포가 정확히 #125의 회귀 시나리오가 요구하는 최소 집합이고, 실측
크기는 plan 1~2개 + PRD 1개(약 70 KB)다.

**PRD 문언은 같은 PR에서 고친다**(M1 DD9의 선례 — 코드와 PRD가 어긋나면 근거를 적고 PRD를
고친다). Scope MVP (2)의 네 글롭을 위 폐포 서술로 교체하고, Open Question 2건(무관 PRD
유입 · P3 경계)에 해소 표시를 단다.

### DD2 — 스코프를 정하는 주체는 여전히 Step 1이다 (M1 DD11 유지)

M1 DD11은 "CLI가 스코프를 정하기 시작하면 결정 지점이 둘이 된다"고 못박았다. M2는 그
경계를 옮기지 않는다.

| 책임 | 소재 |
|---|---|
| 상시 후보를 **도출한다** | `cli.js scope-always` (파일 읽기 + `Source PRD` 파싱) |
| 도출 결과를 **스코프에 합친다** | `santa-loop.md` Step 1 |
| `SCOPE_PATHS_JSON`을 **생산한다** | `santa-loop.md` Step 1 — 여전히 유일한 생산자 |

CLI는 후보를 **낼 뿐 주입하지 못한다.** `lanes`가 배정을 계산하되 리뷰어를 띄우지는
않는 것과 같은 모양이다. 도출을 셸 산문에 두지 않는 이유는 M1 DD4와 같다 — 마크다운
파싱을 커맨드 본문이 즉흥으로 하면 정직한 경로가 가장 싼 경로가 아니게 되고, 회귀 test를
걸 자리가 없어진다(UI19).

### DD3 — 실패 방향은 중단이다

이 축의 고장은 "상시 스코프가 0건 추가된 라운드"로 나타나고, **그것은 M2 이전과 똑같아
보이는 정상 실행이다**(M1이 블라인드 0건에 대해 쓴 것과 같은 논증). 그래서
`scope-always`가 0이 아닌 코드로 끝나면 Step 1은 리뷰어를 띄우지 않는다. diff 스코프만으로
진행하는 fallback을 두면 그 fallback이 곧 기본 경로가 된다.

**단, 후보가 0건인 것은 실패가 아니다.** 코드 전용 diff처럼 plan이 하나도 관여하지 않는
리뷰는 정상이고, 그때 `added`는 빈 배열이며 exit 0이다. 실패는 "도출을 시도했는데 못
했다"(파일 읽기 실패, 파싱 예외)뿐이다. 그 둘을 stdout의 `pairs` 유무가 아니라 exit code로
가른다 — M1의 `HAS_ASSIGNMENT` 검사가 `off`와 파싱 실패를 가른 것과 같은 이유다.

### DD4 — 해소 불가 포인터는 드롭하되 조용히 하지 않는다

plan이 선언한 Source PRD가 디스크에 없는 경우(오타, 아카이브 이동, free-form plan의
`(없음 — free-form 입력)`)가 실제로 존재한다. 존재하지 않는 경로를 스코프에 넣으면 블라인드
리뷰어에게 **깨진 포인터**를 주게 되고 그것이 PRD Risk 1(스코프를 못 찾아 헛돈다)이다.
그래서 존재 확인에 실패한 항목은 스코프에서 빼되 출력의 `unresolved[]`에 남기고 Step 1이
그것을 stderr로 찍는다. 드롭 자체는 라운드를 막지 않는다 — free-form plan은 정상 입력이다.

### DD5 — rubric 고정 행은 상수이고 스코프와 같은 스위치를 탄다

정합 rubric은 `CONSISTENCY_RUBRIC` 상수 1개다(`DO_NOT_TRUST_NARRATIVE`와 같은 취급 —
문구가 호출마다 흔들리면 무엇을 지시했는지가 사후 재현 불가가 된다). `MCCP_SANTA_ALWAYS_SCOPE=off`
는 스코프 추가와 rubric 행을 **함께** 끈다: 한 축이므로 스위치도 하나다. PRD가 스코프에
없는데 "PRD와 대조하라"고만 지시하면 번들 리뷰어에게 불가능한 과제를 주는 것이고, 그것은
UI1이 금지하는 완화가 아니라 그 반대 — 근거 없는 FAIL을 유도하는 소음이다.

### DD6 — 상시 대상은 P3 델타 축소에서 면제다 (UI8 채택)

PRD Open Question("상시 포함 대상이 델타 축소에서 면제되는지")을 **면제**로 확정한다.
근거는 축의 목적 자체다 — 관계 불변식은 라운드마다 재확인 대상이고(계획이 라운드 사이에
수정되므로), 델타가 그것을 잘라내면 M2는 라운드 1에서만 살아 있는 축이 된다. 이 결정은
P3가 소비할 계약이므로 소유권 문서에 한 줄로 남긴다 — P3 코드는 M2가 건드리지 않는다(UI11).

### DD7 — receipt stamp는 M2가 하지 않는다 (한계의 명시)

M1은 레인 커버리지를 receipt 정수 2종으로 봉인했다. M2는 같은 것을 하지 않으며, 그 이유를
주장이 아니라 구조로 적는다.

- 상시 스코프는 **라운드 단위 사실**인데 `ledger.beginRound`의 라운드 형태는 P0 동결
  시그니처다(UI16). 거기에 필드를 더하는 것은 변경 프로토콜 1의 P0 재개 사유다.
- 리뷰어 envelope에 실어 우회할 수는 있으나, 그러면 값이 **호출자 선언**이 된다.
  `--lane`은 CLI가 env에서 재도출해 대조할 수 있어서 선언이 검증되지만(`SANTA_LANE_MISMATCH`),
  스코프 추가 수는 CLI가 Step 1의 판단을 재현할 수 없어 **검증 불가능한 필수 플래그**가
  된다. 검증되지 않는 숫자를 봉인하면 receipt가 사실이 아닌 것을 사실처럼 기록한다.

따라서 M2의 관측 표면은 (a) Step 1의 터미널 출력(`added` 목록과 `pairs`), (b) 블라인드
프롬프트 본문의 상시 항목, (c) 회귀 test 셋이다. **한계는 이것이다**: 상시 축이 조용히
0건을 낸 실행은 receipt만 봐서는 M1 시절 실행과 구분되지 않는다. 이 공백은 PRD Open
Question으로 등재하며, 봉인이 필요하다는 실측이 나오면 그때 P0 재개로 처리한다 — 지금
검증 불가능한 필드를 만드는 것보다 공백을 이름 붙여 두는 편이 정직하다.

### DD8 — env default는 발화 쪽이다

`MCCP_SANTA_ALWAYS_SCOPE=enforce|off`, default `enforce`. `off`가 **덜 엄격**하다는 비대칭은
`MCCP_SANTA_TERMINATOR`·`MCCP_SANTA_BLIND_LANE`과 같고 근거도 같다: `off`가 default면 오타
하나가 kill switch를 켜고 **그 실행이 M2 이전과 똑같아 보인다**. 불량값은 loud stderr warn
후 `enforce`로 fail-open.

## Tasks

### Task 1: `scope-always.js` — 순수 oracle

- **Action**: 신규 파일. export 6종, 외부 require는 `path` builtin 1개(경로 정규화 전용 —
  파일시스템 접근 없음).
  - `ENV_ALWAYS_SCOPE` / `ALWAYS_SCOPE_DEFAULT`(`'enforce'`) / `ALWAYS_SCOPE_VALUES`
  - `parseAlwaysScope(env)` → `'enforce' | 'off'`. 미설정·불량값은 warn 후 default. 미throw
  - `sourcePrdFrom(planText, { planPath })` → repo 상대 PRD 경로 또는 `null`.
    링크 형태(`SOURCE_PRD_LINK_RE`) 우선, 실패 시 평문(`SOURCE_PRD_PLAIN_RE`).
    백틱·인용부호 벗기기는 `stripWrap` 동형. 링크가 plan 기준 상대경로(`../prds/x.prd.md`)면
    `planPath`의 디렉토리 기준으로 posix 정규화해 repo 상대로 환원한다. 미throw
  - `mergeScope({ diffPaths, alwaysPaths })` → `{ paths, added, truncated }`.
    diff 순서 보존 후 상시 항목을 뒤에 append, 중복 제거는 정규화된 posix 경로 기준.
    `added`는 diff에 없던 상시 항목만. `MAX_ALWAYS_PATHS`(40) 초과는 절삭하고
    `truncated` 수를 낸다 — **조용히 자르지 않는다**
  - `CONSISTENCY_RUBRIC` — 고정 문자열. 본문은 UI4·UI5를 그대로 지시한다:
    상시 쌍마다 **지금 워킹트리의** PRD를 다시 읽고 plan이 단언하는 마일스톤 식별자·
    마일스톤 수·회부/미결 항목 수가 일치하는지 확인하며, 불일치는 CRITICAL이고
    `locations`에 두 파일을 모두 적는다. **plan의 PRD 요약을 근거로 삼지 말고 PRD를 읽으라**는
    문장을 포함한다(M1 `DO_NOT_TRUST_NARRATIVE`와 같은 축)
- **Mirror**: `lanes.js`(모듈 형태·env 파서·고정 문구 상수·절삭 명시) ·
  `derive/sources/plans.js:18-30`(두 정규식과 `stripWrap`)
- **왜 재사용이 아니라 미러인가**: `derive/sources/plans.js`를 require하면 순수 oracle이
  `fs`와 `PLAN_DIRS`를 끌어오고 santa 모듈군의 외부 의존 목록(현재 6개)이 늘어난다.
  가져오는 것은 정규식 2개와 8줄짜리 헬퍼뿐이므로 미러가 싸다 — 이 판단을 주석에 근거로
  남겨 원본이 바뀔 때 재검토 지점이 되게 한다
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js`

### Task 2: `cli.js scope-always` subcommand

- **Action**:
  1. `cmdScopeAlways(args)` 추가.
     - `--paths-file <path>` **필수**(Step 1의 diff 스코프). `readJsonStringArray` 재사용 —
       containment·크기·형태 방어를 그대로 상속한다. 빈 배열은 **허용**한다(diff가 비어도
       decision slug 경로로 plan을 찾을 수 있고, 리뷰할 것이 없다는 판정은 `lanes`가
       이미 내린다)
     - `--decision <slug>`은 기존 관례대로 `baseOpts`가 해소
     - mode가 `off`면 `{ mode:'off', paths:<입력 그대로>, added:[], pairs:[], unresolved:[],
       rubricRow:'', truncated:0 }`을 내고 **디스크를 읽지 않는다**(경로에 진입하지 않는다 —
       `MCCP_SANTA_TERMINATOR=off`의 선례)
     - `enforce`면 DD1의 폐포 3단계를 수행: 입력 목록의 `*.plan.md` + slug 매칭 plan
       (`.claude/plans` · `.claude/PRPs/plans`, 비재귀, `archived/` 제외) → 각 plan을
       `MAX_REVIEWER_BYTES` 상한으로 읽어 `sourcePrdFrom` → 존재 확인 통과분만 상시 항목
     - 모든 경로는 `ledger.canonicalPath` + `assertContained`로 repo 안에 가둔다
     - 실패는 전부 typed error → exit 2. **부분 JSON을 stdout에 내지 않는다** — `out()`은
       전 검증 통과 후 1회
  2. `usage()`와 `runCli` switch에 `scope-always` 등재
- **Mirror**: `cmdLanes:940-995`(필수 플래그 검증 → 로드 → 판정 → 단일 `out()`) ·
  `readJsonStringArray:381-420`
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js`

### Task 3: `santa-loop.md` — Step 1 병합 · Step 2 고정 행 · Step 3 rubric 전달

- **Action**: 공유 표면이므로 **P2 절만** 편집한다(UI17). 편집 지점은 셋이다.
  1. **Step 1** — `SCOPE_PATHS_JSON` 확정 직후에 상시 스코프 블록을 넣는다.
     `TMPDIR_SANTA` 정의를 여기로 올리고(현재는 Step 3 레인 블록이 첫 사용), Step 3의
     "First use of the temp dir in this file" 주석을 그 사실에 맞게 고친다 — 그 주석은 P2가
     M1에서 쓴 것이라 P2가 고친다.

     ```bash
     TMPDIR_SANTA=".claude/state/santa-loop/tmp"
     mkdir -p "$TMPDIR_SANTA"
     printf '%s' "$SCOPE_PATHS_JSON" > "$TMPDIR_SANTA/scope-diff.json"

     ALWAYS_JSON=$(node "$SANTA" scope-always --decision "$DECISION" \
       --paths-file "$TMPDIR_SANTA/scope-diff.json")
     ALWAYS_EXIT=$?
     if [ "$ALWAYS_EXIT" -ne 0 ]; then
       echo "[santa] scope-always failed (exit $ALWAYS_EXIT) — NOT launching reviewers." 1>&2
       echo "[santa] A round with no always-on scope looks identical to a pre-M2 run," 1>&2
       echo "[santa] so this axis does not degrade to the diff-only scope (DD3)." 1>&2
       exit "$ALWAYS_EXIT"
     fi
     ```

     그 다음 `paths`를 꺼내 `SCOPE_PATHS_JSON`을 **교체**하고, `added`·`pairs`·`unresolved`·
     `truncated`를 stderr로 찍는다(DD7의 관측 표면 (a)). `CONSISTENCY_RUBRIC_ROW`도 여기서
     꺼내 변수로 잡는다.
     - **`paths` 부재를 exit 0과 구별한다**: M1의 `HAS_ASSIGNMENT` 검사와 같은 이유로,
       `paths`가 배열이 아니면 exit 0이어도 중단한다. 그러지 않으면 파싱 실패가 "추가 0건"과
       같은 모양이 된다
  2. **Step 2** — rubric 표 아래에 상시 정합 행을 **verbatim** 덧붙이라는 지시를 넣는다.
     문구는 저자가 짓지 않고 `$CONSISTENCY_RUBRIC_ROW`를 그대로 쓴다(DD5)
  3. **Step 3** — 레인 블록에서 rubric 전문을 `$TMPDIR_SANTA/rubric-$ROUND.md`에 쓰고
     `lanes --rubric-file`로 넘긴다. 이 플래그는 M1이 만들어 두고 호출자가 쓰지 않던
     자리이며, 이것이 **블라인드 리뷰어도 정합 행을 받는** 유일한 경로다
- **Mirror**: M1 레인 블록(호출 → exit 분기 → 파싱 성립 검사 → 소비)
- **Validate**: Task 5의 커맨드 본문 구조 test + Task 6 실측

### Task 4: 회귀 test — `santa-lanes.test.js` 확장

- **Action**: 기존 단언은 **지우지 않고** M2 블록을 추가한다.
  - `parseAlwaysScope`: 미설정·`off`·대소문자·공백·열거 밖(warn 후 `enforce`)
  - `sourcePrdFrom`: 백틱 평문 · 마크다운 링크(상대경로 환원 포함) · 부재 ·
    free-form 표기 · 비문자열 입력
  - `mergeScope`: 중복 제거 · diff 순서 보존 · `added` 계산 · 상한 초과 시 `truncated`
  - `CONSISTENCY_RUBRIC`: 고정 문자열임을 pin하고 UI4/UI5 핵심 어구(워킹트리 · 마일스톤 ·
    CRITICAL · locations)를 포함하는지 단언
  - CLI `scope-always`: `--paths-file` 부재 exit 2 · repo 밖 경로 거부 · `off` passthrough
    (디스크 미접촉) · 정상 입력에서 `{mode,paths,added,pairs,unresolved,rubricRow,truncated}`
    7키 · 해소 불가 PRD가 `unresolved`로 가고 `paths`에는 없음
  - **#125 회귀 fixture**: 임시 저장소에 마일스톤 4개를 단언하는 plan과 마일스톤 7개인
    워킹트리 PRD를 두고, diff 스코프에 PRD가 **없는** 상태에서 `scope-always`가 그 PRD를
    `added`에 넣는지 확인한다. **이 test가 증명하는 것은 스코프이지 포착이 아니다** —
    리뷰어가 실제로 그 불일치를 잡는지는 LLM 행위라 셸로 단언할 대상이 없다. 그 구분을
    test 이름과 주석에 명시한다(과대 주장 금지)
- **Mirror**: 기존 `santa-lanes.test.js`의 fixture 조립 방식
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js`

### Task 5: 모듈 집합 가드 확장 — `santa-loop-cap.test.js`

- **Action**: `scope-always.js`를 세 목록에 **한 줄씩** 등재한다 — 모듈 열거 ·
  `RECEIPT_FREE` · require allowlist(`./scope-always` 내부, 외부 의존 추가 0건, `path`는
  이미 allowlist에 있음). 승인 근거를 주석 한 문단으로 남긴다(선례 4건과 같은 형식).
  **단언을 지우지 않는다** — 넓히기만 한다
- **Mirror**: `santa-loop-cap.test.js:1046-1113`의 4개 선례
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js`

### Task 6: 실측 — 게이트 경로 1회 완주

- **Action**: 실제 `/mccp:santa-loop` 실행 1회로 다음을 관측하고 증거를 노트에 반입한다.
  1. Step 1이 `added`에 이 plan과 PRD를 넣고 그 둘이 diff에 **없었음**을 확인
  2. 블라인드 프롬프트(`lanes` 출력)에 그 두 경로와 `## Rubric` 섹션이 실림
  3. `MCCP_SANTA_ALWAYS_SCOPE=off` 실행이 `added: []` · `rubricRow: ''`를 내고 디스크를
     읽지 않음
  4. `scope-always` 실패 주입 시 리뷰어가 **뜨지 않음**(DD3)
- **Mirror**: santa-adjudication M3 Task 8(probe 실측 + 증거 반입)
- **Validate**: 노트 `.claude/notes/santa-evidence-diversity-m2.md`에 위 4건의 실제 출력

### Task 7: 문서 4면 + PRD 정정 + version

- **Action**:
  1. `docs/ENVIRONMENT.md` — `MCCP_SANTA_ALWAYS_SCOPE` 등재. default·fail-open 방향·
     비대칭 경고·`off`가 rubric 행까지 끄는 사실·DD7의 관측 한계를 함께 적는다
  2. `docs/santa-loop/ownership.md` — P2 M2 export 계약 표 + 연 파일 근거 표(프로토콜 4).
     DD6(델타 면제)을 P3가 소비할 계약으로 한 줄 남긴다
  3. `.claude/prds/santa-evidence-diversity.prd.md` — Milestone 2 status + Plan 링크,
     Scope MVP (2) 문언을 DD1의 폐포로 교체(실측 근거 포함), Open Question 2건 해소 표시,
     DD7의 공백을 신규 Open Question으로 등재
  4. `CHANGELOG.md` `## [1.28.3]` + `currently` 노트 · `plugin.json` · `html.js` page-foot ·
     `markdown.js` derived 줄 **4면 동시** 갱신
- **Mirror**: CLAUDE.md 3.7 체크리스트 · M1 Task 6(문서 4면)
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 1. P2 회귀 + 모듈 가드
node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js \
            plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js

# 2. santa 전량 (기존 단언 무회귀)
node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js \
            plugins/mccp/scripts/lib/tests/santa-gate.test.js \
            plugins/mccp/scripts/lib/tests/santa-seal.test.js \
            plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js

# 3. version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 4. CLI 표면 — 필수 플래그 거부
node plugins/mccp/scripts/lib/santa/cli.js scope-always --decision x ; echo "expect 2, got $?"

# 5. 소유권 표에 신규 모듈이 등재됐는지
grep -c 'scope-always.js' docs/santa-loop/ownership.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 폐포가 좁아 #125 유형의 다른 변종(형제 milestone plan 간 불일치)을 놓친다 | Medium | slug 매칭이 `<slug>*`라 같은 PRD의 형제 plan이 함께 들어온다. 그래도 놓치는 변종이 있으면 그것은 넓힘의 근거가 되는 실측이지 지금 넓힐 근거가 아니다(DD1의 7 MB가 반대 방향의 실측) |
| `Source PRD` 미선언 plan이 많아 상시 축이 사실상 미발화 | Medium | `unresolved`/`pairs`를 Step 1이 매 실행 출력하므로 미발화가 조용하지 않다. free-form plan은 정상 입력이라 차단하지 않는다(DD4) |
| Step 1 편집이 M1 레인 블록의 `TMPDIR_SANTA` 정의와 충돌 | Medium | 정의를 Step 1로 **올리고** Step 3의 주석을 함께 고친다. 두 곳 모두 P2가 쓴 절이라 UI17 위반이 아니다. Task 6의 실측이 이 이동을 검증한다 |
| 상시 항목이 번들 리뷰어의 컨텍스트를 키워 품질이 떨어진다 | Medium | 폐포 크기가 실측 약 70 KB이고 `MAX_ALWAYS_PATHS`(40)가 상한이다. rubric 행이 상시 대상의 용도를 관계 검증으로 좁힌다(UI6) |
| P3가 상시 대상을 델타로 잘라 축이 라운드 1에서만 산다 | Medium | DD6을 소유권 문서에 계약으로 남긴다. P3 코드는 건드리지 않는다(UI11) |
| receipt 미봉인이라 상시 축의 조용한 미발화가 사후 관측 불가 | Medium | DD7이 그 한계를 명시하고 PRD Open Question으로 등재한다. 검증 불가능한 필드를 만드는 것보다 공백을 이름 붙이는 편이 정직하다 |

## Acceptance

- [ ] Task 1~7 완료
- [ ] Validation 1~5 통과
- [ ] 기존 santa test 단언이 **하나도 삭제되지 않음**(넓히기만)
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 != 경로 작동) —
      Task 6의 4건이 그 산출물이고, 최소 조건은 **실제 `/mccp:santa-loop` 실행에서 이 plan과
      그 Source PRD가 diff에 없는 채로 `added`에 나타나고, 그 두 경로가 `lanes`가 낸 블라인드
      프롬프트 본문에 실린 것**이다
- [ ] PRD Milestone 2 status 갱신 + Scope 문언 정정 + Open Question 2건 해소 · 1건 신규 등재
- [ ] version 4면 동기 (`/mccp:pr` 진입 직전 CLAUDE.md 3.7 재계산 포함)

## Multi-Perspective Fan-out

skipped — 세션 정책이 사용자 요청 없는 Workflow 호출을 금지한다. Phase 2.5의 문서화된
fail-open 경로대로 인라인 Pattern Grounding(위 표)을 근거로 삼았고, plan은 차단되지 않는다.

## Design Critique

- 트리거: detector positive (`design_signal=true`). signal 파일은 `renderer/html.js` ·
  `renderer/markdown.js` — 본 plan이 그 둘에 가하는 변경은 **version 리터럴 1개**
  (`v1.28.2` → `v1.28.3`)이고 rendered surface의 구조·색·마크다운 마커·항목 수는 무변경이다.
- 라운드: 1 / cap 2 · verdict: **CONVERGED**
- 4 Output Constraints 대조:

| Constraint | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | PASS | footer 문자열 교체로 heading을 추가·심화하지 않는다 (`html.js:1418`) |
| 강조색 화면당 1개 | PASS | accent/highlight 토큰 미접촉 |
| raw markdown marker 금지 | PASS | `markdown.js:163`의 `_..._`는 마크다운 **출력 표면의 소스**이며 선재·무변경. 신규 마커 0건 |
| 한 화면 항목 수 상한 | PASS | `list-of-N` 섹션 미접촉 |

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없어 **호출하지 않고**
체크리스트로만 기록한다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
