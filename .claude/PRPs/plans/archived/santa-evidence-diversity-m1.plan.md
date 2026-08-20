# Plan: santa 증거 다양성 M1 — 블라인드 레인

**Source PRD**: `.claude/prds/santa-evidence-diversity.prd.md`
**Selected Milestone**: 1 — 블라인드 레인
**Complexity**: Medium

## Summary

리뷰어 한 명에게 **파일 번들·사전 요약 대신 저장소 루트 + 대상 경로 포인터만** 건네고,
"주어진 서술을 사실로 취급하지 말 것"을 계약으로 명시한다. 레인 배정은 신규 순수 oracle
`lanes.js`가 결정하고, `cli.js record`가 그 배정과 어긋난 선언을 거부하며, `seal.js`가
레인 커버리지를 **집계 정수 2종**으로 receipt에 봉인해 "매 실행에서 ≥1명이 번들을 받지
않았다"가 사후에 반증 가능해진다. 리뷰어 수는 늘리지 않는다(I5) — 바뀌는 것은 기존
인스턴스의 **입력 경로**뿐이다.

## User Intent

<!-- PRD 본문(사용자 공동 작성) + 우산 PRD review-loop-trust의 승계 불변식 + 소유권
     문서의 변경 프로토콜에서 추출. 저자 정당화는 이 표에 넣지 않는다 — ## Design
     Decisions 소관. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 리뷰어를 온화하게 만들지 말 것. 오탐은 판정 하류에서 거른다 | constraint |
| UI2 | 관점 수를 늘리지 말 것. 다양성은 증거 경로로만 확보한다 | constraint |
| UI3 | 리뷰어 최소 1명은 파일 번들과 사전 요약을 받지 않는다 | direction |
| UI4 | 그 리뷰어에게 저장소 루트와 대상 파일 경로는 준다. 금지되는 것은 번들과 요약이다 | exception |
| UI5 | 블라인드 리뷰어에게 주어진 서술을 사실로 취급하지 말라고 지시한다 | direction |
| UI6 | 블라인드 레인은 1명 고정이 권장이고 전원 블라인드는 오케스트레이터의 스코프 결정을 무의미하게 만든다 | direction |
| UI7 | 증거 경로를 receipt에 stamp해 주장이 아니라 결과 분포로 검증한다 | direction |
| UI8 | santa verdict는 게이트 승인이 아니다 | constraint |
| UI9 | 리뷰어 프롬프트를 완화하지 말 것 | constraint |
| UI10 | Codex 제거나 다른 외부 모델 도입은 하지 않는다 | exclusion |
| UI11 | severity 판정 원장 종료 조건은 P1 소유다. 본 축은 원장을 소비만 한다 | exclusion |
| UI12 | 델타 스코프는 P3 소유다 | exclusion |
| UI13 | 상시 스코프와 정합 rubric은 M2 소유다 | exclusion |
| UI14 | degrade 차단은 M3 소유다 | exclusion |
| UI15 | `gpt-5.4` 하드코딩 갱신은 본 PRD 밖이다 | exclusion |
| UI16 | 동결 시그니처를 자식 PRD가 바꾸지 말 것. 바꿔야 하면 P0를 재개한다 | constraint |
| UI17 | 공유 표면인 커맨드 본문과 CLI에서는 자기 절만 편집할 것 | constraint |
| UI18 | 소유권 표가 실제 변경과 어긋나면 같은 PR에서 표를 고칠 것 | constraint |
| UI19 | 각 불변식의 회귀 test 존재를 지표에 포함할 것 | constraint |
| UI20 | 블라인드 레인의 토큰 비용을 실측한 뒤 스코프 힌트 수준을 조정한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 oracle 모듈 | `plugins/mccp/scripts/lib/santa/terminator.js:1-60` | 신규 판정 모듈은 디스크·git·시각을 모르고 env는 파서 1종만 읽는다. I/O는 `cli.js`가 진다 |
| env 파서 | `plugins/mccp/scripts/lib/santa/counter.js:33-44` | `parseX(env)` → 열거/범위 검사 → 불량값은 loud stderr warn 후 default fail-open. 판정 함수는 env를 모른다 |
| 미발화 사유 토큰 | `plugins/mccp/scripts/lib/santa/terminator.js:56-60` `NO_FIRE` | 값이 고정된 하이픈 토큰으로 어느 항이 막았는지를 지목한다. 자유 문장 금지 |
| 구조적 누출 차단 | `plugins/mccp/scripts/lib/santa/seal.js:70-90` `project()` | 실어서는 안 되는 것은 렌더러에서 거르지 않고 **인자를 없앤다** — `renderReport`는 `raw`를 실을 인자가 없다 |
| CLI 표면 부재로 위조 차단 | `CLAUDE.md` §3.13 (intent 결정) | 오라클이 소유한 값은 임의 셸 호출자가 stamp할 수 있는 플래그를 만들지 않는다 |
| receipt present-only 정수 | `plugins/mccp/scripts/receipt/schema.js:893-903` | `santa_rounds`/`santa_entries` — `makeSkeleton` 미등록 + 존재 시에만 검증. 키 추가가 봉인된 corpus의 hash를 건드리지 않는다 |
| 신규 subcommand 배선 | `plugins/mccp/scripts/lib/santa/cli.js:582` `cmdCheckTermination` | 판정은 oracle, 배선은 cli, 소비는 커맨드 본문. 판정 사이트는 하나뿐이다 |
| 모듈 집합 가드 확장 | `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:1039-1113` | 신규 모듈은 열거 목록에 **한 줄로 승인**하고 receipt-free 목록·require allowlist에도 등재한다. 단언을 지우지 않는다 |
| P0 파일 개방 근거 | `.claude/PRPs/plans/archived/santa-adjudication-m3.plan.md` DD2 | 자식 PRD가 P0 파일을 열 때는 여는 근거와 **열지 않는 경계**를 DD에 함께 적는다 |
| PRD 어휘 정정 | 같은 파일 DD8 | 코드와 PRD 문언이 어긋나면 근거를 적고 **PRD를 같은 PR에서 고친다** |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/lanes.js` | CREATE | P2 소유 신규 순수 oracle — 레인 배정 · 블라인드 프롬프트 조립 · 커버리지 집계 (소유권 표 P2 행) |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | 공유 표면 P2 절 — `lanes` subcommand 추가 + `record --lane` 수용/대조 |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | 공유 표면 P2 절 — **Step 1**에 스코프의 기계 판독 형태(`$SCOPE_PATHS_JSON`) + **Step 3**에 레인 분기와 record 플래그 |
| `plugins/mccp/scripts/lib/santa/seal.js` | UPDATE | P0 파일 개방(DD5) — `project`에 lane 투영, 라운드 표에 레인 열, 집계 2종 stamp |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | 신규 2 플래그를 meta로 옮기는 배선 (기존 `santa-rounds` 경로와 동형) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | present-only 정수 2종 검증 추가 (`santa_blind_records` · `santa_blind_rounds`) |
| `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | CREATE | P2 소유 회귀 test — 배정·프롬프트 구조·대조 거부·집계 |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATE | 모듈 집합 · receipt-free 목록 · require allowlist 가드 확장 |
| `plugins/mccp/scripts/lib/tests/santa-seal.test.js` | UPDATE | 투영·stamp·legacy envelope 무해성 |
| `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js` | UPDATE | 신규 meta 2종의 schema 수용/거부 |
| `docs/santa-loop/ownership.md` | UPDATE | 프로토콜 4 — P2 M1 추가 기록 + P0 파일 개방 근거 |
| `docs/ENVIRONMENT.md` | UPDATE | `MCCP_SANTA_BLIND_LANE` 등재 (§11) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 1.28.0 → 1.28.1 (§3.7 patch — 단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (§3.7 4면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | `## [1.28.1]` 항목 + `currently` 노트 |
| `.claude/prds/santa-evidence-diversity.prd.md` | UPDATE | Milestone 1 → in-progress + Plan 경로 · 어휘 정정(DD9) · Open Question 1 해소 |

## Design Decisions

### DD1 — 레인은 **역량**이 아니라 오케스트레이터가 **건넨 것**이다

"블라인드"를 "디스크를 읽을 수 없다"로 정의하면 이 축은 성립하지 않는다 — `code-reviewer`
서브에이전트는 이미 Read/Grep/Glob/Bash를 갖고, codex도 `-C "$(pwd)"`로 저장소를 본다.
#125가 관측한 차이는 **역량**이 아니라 **입력**이었다: Reviewer B만 자기 루프로 재탐색했고
A 계열은 `"all files under review"`로 주입된 스냅샷을 코퍼스로 취급했다.

따라서 레인의 정의는 하나다 — **번들과 사전 요약을 받았는가**. `blind`는 저장소 루트 +
대상 경로 포인터 + "주어진 서술을 사실로 취급하지 말 것"만 받은 상태이고(UI4·UI5),
`bundled`는 지금까지의 파일 내용 주입이다. 이 정의는 셸 경계에서 관측 가능한 것과
정확히 일치한다 — 프롬프트에 무엇이 들어갔는가는 조립 시점에 알 수 있지만, LLM이
그것으로 무엇을 했는지는 알 수 없다(DD4가 그 한계를 다룬다).

### DD2 — 블라인드는 **Reviewer A 1명**이다. 전원 블라인드가 아니다

PRD Open Question 1("몇 명인가")을 여기서 닫는다: **1명 고정**이고 배정 대상은 A다.

근거 셋. (1) PRD Scope MVP (1)이 "Reviewer A 인스턴스 중 1명"이라고 지목한다. (2) #125의
증거가 가리키는 결함은 A 계열이 스냅샷을 코퍼스로 삼은 것이지 B가 아니다 — B는 이미 우연히
재탐색하고 있었고, M1의 outcome은 그 우연을 계약으로 바꾸는 것이다. (3) A를 블라인드로
두면 B가 번들을 그대로 받으므로 **오케스트레이터의 스코프 결정이 살아 있고**, 이것이
Open Question이 전원 블라인드를 경계한 이유(UI6)에 대한 답이다.

배정은 `MCCP_SANTA_BLIND_LANE`으로 `a`(default) · `b` · `off` 셋을 갖고, **각 값의 결과를
여기서 전부 못박는다.** 열거만 하고 결과를 적지 않으면 구현이 해석으로 갈리고, 그
해석은 어떤 test도 잡지 않는다(L2 architect R1이 지적한 공백이 정확히 이것이다).

| mode | A | B | 블라인드 수 |
|---|---|---|---|
| `a` (default) | `blind` | `bundled` | 1 |
| `b` | `bundled` | `blind` | 1 |
| `off` | `bundled` | `bundled` | 0 |

`b`를 남기는 이유는 대칭성이 아니라 **M3의 입력**이다 — degrade(Reviewer B 부재로 B가
같은 모델 fallback이 되는 경우) 시 블라인드를 어느 쪽에 둘지는 M3이 결정할 문제이고,
그때 값을 새로 만드는 것보다 지금 결과를 정의해 두는 편이 싸다. **M1은 `b`를 기본으로
쓰지 않으며 어떤 경로도 자동으로 `b`를 선택하지 않는다** — 운영자가 env로 명시할 때만
도달한다.

`both`는 **만들지 않는다** — UI6이 명시적으로 경계한 상태를 env 값 하나로 도달 가능하게
만들면 그 경계가 문서에만 남는다. 필요가 실측되면 그때 값을 더한다(YAGNI).

### DD3 — 번들 부재는 검사가 아니라 **인자 부재**로 구조화한다

`lanes.buildBlindPrompt({ repoRoot, targetPaths, rubric })`에는 **파일 내용을 실을 인자가
없다**. 번들이 새는지 사후에 검사하는 대신 새로 넣을 자리를 없애는 방식이고,
`seal.js#project`가 리뷰어 `raw` 전문을 리포트에서 막을 때 쓴 것과 같은 수단이다
(`renderReport`는 `raw`를 실을 인자가 없다).

`targetPaths`는 문자열 배열이고 각 원소는 repo-relative 경로다. 내용이 아니라 경로만
받는다는 것이 이 함수의 전부이고, 그것이 UI4가 허용한 것과 UI3이 금지한 것의 경계다.

### DD4 — `--lane`은 **선언**이지 관측이 아니다. 그렇게 부른다

`record`는 `--lane <blind|bundled>`를 **필수로** 요구하고, `lanes.assignLanes`가 같은
mode·같은 id에 대해 계산한 값과 다르면 거부한다(exit 2).

이 대조가 검증하는 것과 하지 않는 것을 분명히 적는다. 검증하는 것: 커맨드 본문이 oracle을
거치지 않고 레인을 즉흥적으로 정하는 경로가 막힌다. 검증하지 **않는** 것: 블라인드로
선언된 리뷰어의 프롬프트에 실제로 번들이 없었는지. 셸에서 LLM이 무엇을 받았는지 확인할
방법은 없고, PRD도 그것을 알고 있어 검증을 **결과 분포**에 맡겼다("주장이 아니라 결과
분포로 검증" — UI7). M1이 제공하는 것은 그 분포를 잴 수 있는 계기이지 위조 방지가 아니다.

위조 비용을 낮추지 않기 위해 프롬프트 조립은 CLI가 한다 — `lanes` subcommand가 블라인드
프롬프트를 stdout으로 내므로 정직한 경로가 가장 싼 경로가 된다.

### DD5 — P0 파일 2곳(`seal.js` · `schema.js`)을 연다. 여는 근거와 열지 않는 경계

**여는 근거.** PRD의 [primary] 지표가 "receipt stamp"라 봉인 경로를 지나지 않고는
M1의 성공 조건 자체가 관측 불가다. `seal.js`가 유일한 receipt writer이고(cap test가
그것을 단언한다), `schema.js`가 유일한 validator다. 프로토콜 2대로 **추가만** 한다 —
`project`에 필드 1개, 라운드 표에 열 1개, `writeArgs`에 조건부 키 2개, schema에 present-only
검증 2블록. 기존 함수의 시그니처와 반환 계약은 무변경이고 legacy envelope(레인 부재)는
`null`로 투영돼 집계에서 0을 낸다.

**열지 않는 경계 셋.** (1) `gate.js` — P1 소유이고 판정 축이다(DD7). (2) `ledger.js` —
envelope는 `recordReviewer(round, envelope, raw, opts)`의 불투명 인자라 필드 1개 추가에
ledger 변경이 필요 없다. (3) `seal.js#deriveVerdict` — 봉인 판정에 레인 항을 더하는 것은
차단이고 그것은 M3 소유다.

### DD6 — receipt에는 **집계 정수만** 싣는다

`santa-loop-cap.test.js:1044`가 이미 규약을 적고 있다 — "판정 원장은 gitignored 원장에만
살고 receipt에는 집계 정수만 실린다(DD12)". 레인도 같은 규약을 따른다.

| 필드 | 의미 |
|---|---|
| `meta.santa_blind_records` | 블라인드 레인으로 기록된 **리뷰어 레코드 수**(전 라운드 합) |
| `meta.santa_blind_rounds` | 블라인드 레코드가 **1건 이상인 라운드 수** |

둘 다 present-only(makeSkeleton 미등록)다 — §3.12의 git-tracked ship corpus는 `makeSkeleton`을
공유하므로 키를 skeleton에 넣으면 전 receipt의 canonical hash 입력이 바뀐다.

id→레인 맵을 싣지 않는 이유: receipt는 루프 단위인데 맵은 라운드 단위 사실이라, 라운드마다
달랐던 경우 "mixed" 같은 없는 값을 발명하거나 마지막 라운드로 나머지를 지워야 한다. 정수
둘이면 PRD의 지표가 그대로 계산된다 — **`santa_blind_rounds === santa_rounds`가 "매 실행에서
≥1명 번들 미수령"의 기계적 표현**이다. 라운드별 상세는 원장과 `.claude/reviews/` 리포트에
남는다.

### DD7 — `gate.js`를 열지 않는다. 블라인드 부재는 M1에서 **차단하지 않는다**

레인 커버리지 부족(블라인드 0건)을 라운드 판정에 넣으면 `gate.js`를 열어야 하고, 그것은
소유권 표의 P1 행이며 UI17이 금지하는 남의 절 편집이다. M1은 레인을 **만들고 기록**한다.

M1이 대신 확보하는 것은 **구조적 커버리지**다. `assignLanes`가 결정적이고 `record`가
불일치를 거부하므로, A와 B를 모두 기록한 라운드는 블라인드 1건을 **가질 수밖에 없다**.
`off`로 끄거나 리뷰어를 1명만 기록한 라운드는 0이 되고, 그 사실은 stamp에 그대로 남는다.
M1은 "블라인드가 없으면 막는다"를 **주장하지 않는다**.

**`off`의 차단은 M3 소유가 아니다 — 현재 어느 milestone도 소유하지 않는다**(Plan-Codex
R1 F2 흡수). 이 절의 이전 판본은 "차단은 M3(degrade 차단)이 소유한다(UI14)"라고 적었으나
그것은 **사실이 아니다**. PRD M3의 outcome은 "동일모델 앙상블의 NICE가 이종 조합의 NICE와
구분되어 사람 승인을 요구함"이고 Scope MVP (3)은 "**Reviewer B 부재** fallback의 NICE를
`degraded`로 강등"이다 — M3이 다루는 것은 *Reviewer B가 없어서 동일모델 2인이 되는* 경우
이지 `MCCP_SANTA_BLIND_LANE=off`로 *블라인드 레인 자체가 꺼진* 경우가 아니다. 두 축은
겹치지 않으므로, 잘못된 소유자를 적어 두면 UI3("리뷰어 최소 1명은 파일 번들과 사전 요약을
받지 않는다")이 **어느 milestone에서도 강제되지 않은 채** 영구히 남는다. 리뷰어가 지적한
것이 정확히 이것이다.

정정한 상태는 셋이다.

1. M1은 여전히 차단하지 않는다 — `gate.js`는 P1 소유이고 UI17이 막는다. 이 판단은 무변경
   이며, 리뷰어가 권고한 "M1 소유 pre-seal 경계에서 `blindRounds === rounds` 강제"는
   그래서 채택하지 않는다.
2. 그러나 M1의 **완료 조건**은 `off`로 충족되지 않는다. Acceptance가 live run에
   `meta.santa_blind_records >= 1`을 요구하므로 블라인드 0건 실행은 M1을 complete로 만들지
   못한다. `off`는 진단·복귀용 kill switch이지 정상 운용 상태가 아니다.
3. `off`가 상시 켜져 UI3이 지속 미충족되는 상태를 **무엇이 막는가**는 열린 문제다. 본
   plan은 그것을 PRD Open Question으로 등재하고(같은 PR, DD9 선례) M1에서 해결하지 않는다.
   소유자 후보는 M3 범위 확장 또는 신규 milestone이며 그 결정은 이 plan 밖이다.

### DD8 — env 1종. default는 `a`이고 불량값은 loud warn 후 `a`

`MCCP_SANTA_BLIND_LANE=a|b|off`(default `a`). 파서는 `counter.parseCap` ·
`terminator.parseTerminator`와 같은 규약이다 — 값을 trim + 소문자 정규화한 뒤 열거와
비교하고, 열거 밖이면 loud stderr warn 후 default. `off`가 default가 되면 오타가 kill
switch를 켜므로 default는 발화 쪽이다(SEVERITY_GATE·TERMINATOR와 같은 근거).

`off`의 방향은 **덜 엄격**(M1 이전 동작 = 전원 bundled)이고, 그 사실을 ENVIRONMENT.md에
명시한다 — TERMINATOR가 같은 비대칭을 이미 문서화한 선례가 있다.

### DD9 — PRD 문언 `evidence_paths`는 코드에서 `santa_blind_*`로 착지한다. PRD를 고친다

PRD 지표 열의 "receipt `evidence_paths` stamp"에서 "경로"는 filesystem path가 아니라
**증거 경로(route)**를 뜻한다(I5 "다양성은 증거 경로로"와 같은 용법). 그 이름을 코드에
그대로 쓰면 `evidence_paths`가 파일 경로 배열로 읽히고, 이 저장소는 이름이 거짓말하는
것을 비싸게 친다.

M3 DD8의 선례(캡 env 이름·범위 불일치를 PRD 쪽에서 정정)를 따라 **같은 PR에서 PRD 문언을
고친다** — Success Metrics 행의 측정 수단을 `receipt meta.santa_blind_rounds === santa_rounds`로
바꾸고, Risks 표의 "증거 경로를 receipt에 stamp하고" 서술도 같은 필드명을 가리키게 한다.

### DD10 — 대상 경로는 M1에서 **기존 changed-files 그대로**다

블라인드 리뷰어가 받는 `targetPaths`는 Step 1이 이미 정한 스코프(`git diff --name-only HEAD`
또는 `$ARGUMENTS`)를 그대로 쓴다. 그 목록에 plan·PRD 계열을 diff와 무관하게 더하는 것은
M2(상시 스코프) 소유이고(UI13), M1이 미리 넣으면 M2가 착지할 때 두 곳이 같은 목록을
만들게 된다. `buildBlindPrompt`의 `targetPaths` 인자가 M2의 접속점이다.

### DD11 — 이음매 계약: 누가 스코프를 정하고, 실패하면 무엇이 멈추는가

M1은 `santa-loop.md` ↔ `cli.js` ↔ `lanes.js` 셋을 가로지르므로 이음매를 여기 한 번에
못박는다. 세 층에 흩어 적으면 각 층이 상대가 처리했다고 가정하고, 그 가정의 교집합이
비는 자리가 정확히 fail-open이 생기는 곳이다.

| 책임 | 소재 | 근거 |
|---|---|---|
| 스코프(대상 경로)를 **정한다** | `santa-loop.md` Step 1 | 이미 스코프의 소유자이고, M2가 상시 스코프를 더할 자리도 여기다(DD10). CLI가 정하기 시작하면 결정 지점이 둘이 된다 |
| 스코프를 **파일로 건넨다** | `santa-loop.md` → `--paths-file` | 인자 경유라 CLI가 저장소를 다시 탐색하지 않는다 |
| mode를 **읽는다** | `cli.js`(`parseBlindLane`) | env는 파서만 안다 — `cmdLanes`와 `loadReviewer`가 **같은 두 줄**을 쓴다 |
| 레인을 **배정한다** | `lanes.assignLanes` | 순수 oracle. 판정 사이트는 하나뿐이다 |
| 프롬프트를 **조립한다** | `lanes.buildBlindPrompt` (CLI가 호출) | 커맨드 본문이 조립하지 않는다 — 정직한 경로가 가장 싼 경로(DD4) |

**실패 방향은 전부 중단이다.** 이 축의 고장은 "블라인드가 0개인 라운드"로 나타나는데,
그것은 눈에 띄는 오류가 아니라 **M1 이전과 똑같아 보이는 정상 실행**이다. 그래서 어느
층도 부분 성공으로 진행하지 않는다:

- `lanes` 호출 실패/파싱 실패 → 리뷰어를 **띄우지 않는다**(Task 4.1). 배정 없이 띄우면
  `record`가 어차피 exit 2로 거부해 그 라운드의 토큰이 통째로 버려진다.
- `--paths-file` 부재/빈 배열 → `cmdLanes` exit 2(Task 2.2). 포인터 없는 블라인드 프롬프트는
  UI4를 어긴 상태이지 축소된 상태가 아니다.
- 실패 시 stdout은 **비어 있다** — 부분 JSON은 절반짜리 배정을 정상처럼 보이게 한다.
- `--lane` 불일치 → `record` exit 2(Task 2.3). 라운드는 열린 채 남고 재기록이 가능하다.

**`off` 모드만이 블라인드 0개의 정당한 경로다.** 그 경우에도 실행은 `santa_blind_rounds=0`
으로 receipt에 남아(Task 3.3) 고장과 구분된다 — 고장은 애초에 receipt에 도달하지 못한다.

**남는 TOCTOU**: `lanes` 호출과 `record` 호출 사이에 `MCCP_SANTA_BLIND_LANE`이 바뀌면
`record`의 재계산이 어긋나 exit 2가 난다. 이는 **fail-closed 방향**이라 잘못된 stamp를
만들지 않고, 진단은 `SANTA_LANE_MISMATCH` 메시지가 그대로 지목한다. 루프 중 env를 바꾸는
것은 지원하지 않으며, 바꾸려면 라운드 경계에서 한다.

## Tasks

### Task 1: `lanes.js` 신규 — 순수 oracle

- **Action**: `plugins/mccp/scripts/lib/santa/lanes.js`를 만든다. export 5종 + 상수:
  - `parseBlindLane(env)` → `'a'|'b'|'off'`. 불량값 loud warn 후 `'a'`.
  - `assignLanes({ mode, ids })` → `{ [id]: 'blind'|'bundled' }`. **DD2의 3행 표가 이 함수의
    전체 명세다** — `a`는 `{A:'blind', B:'bundled'}`, `b`는 `{A:'bundled', B:'blind'}`,
    `off`는 전원 `bundled`. 열거 밖 mode는 `parseBlindLane`이 이미 걸러 도달하지 않지만,
    방어적으로 default(`a`)와 같게 처리하고 던지지 않는다(전역 함수 규약).
    `ids` 부재/비배열은 `['A','B']`로 정규화(현 CLI가 그 둘만 허용). `ids`에 표에 없는
    id가 오면 **`bundled`**로 배정한다 — 모르는 id에 블라인드를 주면 커버리지가 우연히
    충족되고, 그 우연은 stamp에서 진짜 배정과 구분되지 않는다.
  - `buildBlindPrompt({ repoRoot, targetPaths, rubric })` → string. **파일 내용 인자 없음**(DD3).
    본문에 UI5 문구를 고정 포함하고, 경로 목록은 `MAX_TARGET_PATHS`까지만 싣되 절삭 사실을
    프롬프트 안에 명시한다(조용한 절삭은 스코프를 거짓말하게 만든다).
  - `laneCoverageFrom(projection)` → `{ blindRecords, blindRounds, rounds }`. 순수 집계이고
    어떤 입력에도 던지지 않는다(`gate.analyzeReviewers`와 같은 전역 함수 규약).
  - 상수: `ENV_BLIND_LANE` · `BLIND_LANE_DEFAULT` · `BLIND_LANE_VALUES` · `LANES` ·
    `MAX_TARGET_PATHS`.
- **Mirror**: `terminator.js`(순수 oracle · env 파서 1종 · 고정 토큰 상수) ·
  `counter.js:33-44`(fail-open 파서) · `seal.js#project`(인자 부재로 누출 차단)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js`

### Task 2: `cli.js` — `lanes` subcommand + `record --lane`

- **Action**: 공유 표면에 **P2 절만** 추가한다(UI17).
  1. `const lanes = require('./lanes');`
  2. `cmdLanes(args)` — `--paths-file` **필수** · `--rubric-file`(선택)을 받아
     `{ assignment, blindId, prompt }`를 stdout JSON으로 낸다. 세 키의 값 계약:
     - `assignment` — `assignLanes` 반환 그대로. 객체이고 키는 리뷰어 id다.
     - `blindId` — `assignment`에서 값이 `'blind'`인 **유일한 id**. `off` 모드에는 그런 id가
       없으므로 **빈 문자열**이다(`null`이 아니다 — Task 4.1의 셸이 문자열 비교를 하므로
       타입이 갈리면 비교가 조용히 어긋난다). DD2가 블라인드 ≤ 1을 보장하므로 "유일한"이
       성립하고, 2개가 나오면 그것은 oracle 결함이라 `cmdLanes`가 exit 2로 거부한다.
     - `prompt` — `blindId`가 비어 있지 않으면 `buildBlindPrompt` 결과, `off`면 빈 문자열.
       배정된 블라인드가 없는데 프롬프트를 내면 호출자가 그것을 쓸 자리가 생긴다.
     - `--paths-file`은 repo 안 JSON 문자열 배열이고 **필수다.** 없으면 `SANTA_USAGE`로
       거부한다(exit 2). 선택으로 두면 부재 시 `targetPaths=[]`인 프롬프트가 나오고, 그것은
       "저장소 루트만 알고 대상은 모르는" 리뷰어 — UI4가 주라고 한 것을 주지 않은 상태다.
       PRD Risk 1(스코프를 못 찾아 헛돈다)이 그 자리에서 발화하므로 **빈 배열도 거부**한다.
     - 파일을 만드는 주체는 `santa-loop.md` Step 1이다(DD11). CLI는 스코프를 **정하지 않고**
       받기만 한다 — 정하기 시작하면 M2의 상시 스코프와 결정 지점이 둘이 된다(DD10).
     - `--rubric-file` 부재는 정상이고 rubric 없는 프롬프트를 낸다(Step 2가 rubric을 아직
       만들지 않은 시점에도 배정만 물을 수 있어야 한다).
     - 경로 인자는 `loadReviewer`와 동일하게 `ledger.canonicalPath` + `assertContained`로
       repo 안에 가둔다. 파일 부재·JSON 파싱 실패·비배열·비문자열 원소는 전부 typed error →
       exit 2다. **어떤 실패에서도 stdout에 부분 JSON을 내지 않는다** — 호출자가 그것을
       파싱하면 절반만 성립한 배정으로 리뷰어를 띄우게 된다.
  3. `loadReviewer`에 `--lane` 필수 검증을 더한다 — 값이 `blind`/`bundled` 밖이면
     `SANTA_USAGE`, `assignLanes`가 그 id에 배정한 값과 다르면 신규 typed error
     `SANTA_LANE_MISMATCH`(신규 exit code 없이 기존 `SANTA_*` → exit 2 매핑을 탄다).
     envelope에 `lane` 필드를 더한다.
     - **mode는 `cli.js`가 읽는다**: `lanes.parseBlindLane(process.env)` → `assignLanes({mode, ids})`.
       `loadReviewer`가 env를 직접 보지 않고 파서를 경유하는 것이 `counter.parseCap` ·
       `terminator.parseTerminator`와 같은 경계이고(판정 모듈은 env를 모른다), `cmdLanes`도
       **같은 두 줄**을 쓴다 — 두 곳이 다른 방법으로 mode를 얻으면 그 둘이 갈릴 수 있다.
     - `parseBlindLane`은 던지지 않으므로(불량값 → loud warn + `a`) 이 경로에 mode 획득
       실패는 없다. 즉 `--lane` 대조는 **항상** 수행되며 "mode를 못 읽어서 검증을 건너뛴다"는
       분기가 존재하지 않는다.
  4. `usage()`와 `runCli` switch에 `lanes`를 등재한다.
- **Mirror**: `cmdCheckTermination`(신규 subcommand 배선) · `loadReviewer`의 `--id`/`--model`
  검증(호출자가 아는 값은 플래그로 받고 CLI가 검증) · 소유권 문서 §CLI exit code(신규 code 금지)
- **Validate**: `lanes`가 `--paths-file` 없이 exit 2로 거부하고, 정상 입력에서
  `{assignment, blindId, prompt}` 3키를 내며, `record`가 `--lane` 부재·불일치에서 exit 2로
  거부하는 것을 전부 test로 확인(Task 5.1)

### Task 3: `seal.js` 투영·리포트·stamp + `write.js`/`schema.js` 배선

- **Action**:
  1. `project()`의 리뷰어 매핑에 `lane: (e.lane === 'blind' || e.lane === 'bundled') ? e.lane : null`
     을 더한다(legacy envelope → `null`).
  2. `renderReport`의 라운드 표에 레인 열을 더한다 — 사람이 읽는 유일한 라운드별 표면.
  3. `seal()`에서 `lanes.laneCoverageFrom(projection)`을 부르고 `writeArgs`에
     `'santa-blind-records'` · `'santa-blind-rounds'`를 싣는다.
     **조건은 "라운드 ≥ 1"이고 값이 0인 것은 생략 사유가 아니다.** DD6의 present-only
     의미론에서 **부재는 "이 필드가 없던 시절에 쓰였다(모름)"이고 `0`은 "관측했고 0이었다"**로
     서로 다른 상태다. `MCCP_SANTA_BLIND_LANE=off` 실행은 반드시 후자로 남아야 하며(§DD8이
     "`off` 실행도 stamp에 남는다"고 약속한 바로 그 지점), 0을 생략하면 그 약속이 깨지고
     M3이 소비할 입력도 사라진다. 라운드가 0건인 원장에서만 두 키를 함께 생략한다 —
     그때는 관측 자체가 없었다.
  4. `write.js`가 두 플래그를 `meta.santa_blind_records`/`meta.santa_blind_rounds`로 옮긴다.
  5. `schema.js`의 santa 블록에 present-only 비음 정수 검증 2블록을 더한다.
     `makeSkeleton`은 **건드리지 않는다**(DD6).
- **Mirror**: `schema.js:893-903`(present-only 정수) · `seal.js`의 조건부 `writeArgs` ·
  santa-adjudication M3의 `santa_exit_reason` 추가(additive-permissive, 마이그레이션 없음)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-seal.test.js plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js`

### Task 4: `santa-loop.md` — Step 3 레인 분기

- **Action**: 공유 표면에 **P2 절만** 편집하되, 편집 지점은 **Step 1과 Step 3 둘**이다(UI17).
  0. **Step 1 "Identify What to Review"에 스코프의 기계 판독 형태를 더한다.** 현재 Step 1은
     `git diff --name-only HEAD`를 부르고 그 결과를 산문으로 "read all changed files"라고만
     쓴다 — 사람이 읽는 목록이지 다음 단계로 넘길 값이 아니다. DD11이 Step 1에 스코프
     소유를 배정했으므로 그 산출을 **변수로 고정**한다:

     ```bash
     # 스코프의 단일 출처. $ARGUMENTS가 경로/글롭을 주면 그것을, 아니면 uncommitted diff를
     # 쓴다 — 판단 자체는 기존 Step 1 산문 그대로이고, 바뀌는 것은 결과를 JSON 배열로
     # 고정한다는 점뿐이다. 이 값을 Step 3(4.1)이 --paths-file로 넘긴다.
     SCOPE_PATHS_JSON=$(git diff --name-only HEAD | node -e '
       const lines=require("fs").readFileSync(0,"utf8").split(/\r?\n/).filter(Boolean);
       process.stdout.write(JSON.stringify(lines));')
     ```

     빈 배열이면(변경 없음) `lanes`가 exit 2로 거부하고 라운드가 열리지 않는다 — 리뷰할
     것이 없는 실행이 리뷰어를 띄우지 않는 것은 옳은 방향이다. **M2의 상시 스코프는 이
     변수에 추가하는 형태로 들어온다**(DD10) — 그것이 접속점을 하나로 유지하는 방법이다.
  1. Step 3 "Dual Independent Review" 앞에 레인 해소 블록을 넣는다. **정확한 셸과 실패
     분기를 함께 적는다** — 이 파일의 다른 oracle 호출부(Step 4.5 · Step 5.5)가 전부 그렇고,
     "불러서 얻는다"로만 적으면 호출 실패 시 `$BLIND_ID`가 빈 문자열이 되어 두 리뷰어 모두
     번들 경로를 타고 **블라인드 0개인 라운드가 조용히 성립한다**(M1이 만든 축이 그 실행에서
     존재하지 않게 된다). 블록의 계약:

     ```bash
     # Step 1이 정한 스코프를 파일로 넘긴다 — CLI는 스코프를 정하지 않는다(DD11).
     # $SCOPE_PATHS_JSON은 아래 4.0이 Step 1에서 만든다. 이 파일이 그 정의를 갖지
     # 않으면 여기서 빈 문자열이 되고, cmdLanes가 빈 배열을 거부해 라운드가 통째로
     # 멈춘다(fail-closed지만 원인이 엉뚱한 곳에서 나타난다).
     mkdir -p "$TMPDIR_SANTA"
     printf '%s' "$SCOPE_PATHS_JSON" > "$TMPDIR_SANTA/lane-paths-$ROUND.json"

     LANES_JSON=$(node "$SANTA" lanes --decision "$DECISION" \
       --paths-file "$TMPDIR_SANTA/lane-paths-$ROUND.json")
     LANES_EXIT=$?
     if [ "$LANES_EXIT" -ne 0 ]; then
       echo "[santa] lanes failed (exit $LANES_EXIT) — 레인을 배정하지 못했다." 1>&2
       echo "[santa] 리뷰어를 띄우지 않는다: 배정 없이 띄우면 블라인드 0개 라운드가" 1>&2
       echo "[santa] 성립하고 record가 그것을 exit 2로 거부해 라운드가 버려진다." 1>&2
       exit "$LANES_EXIT"
     fi

     # 파싱 성공 여부를 **먼저** 묻는다. blindId만 뽑으면 `off`(정상)와 파싱 실패(고장)가
     # 똑같이 빈 문자열이 되어 고장이 정상 모드로 위장된다 — DD11이 요구하는 구분자는
     # `assignment` 키의 존재이고, 그 검사가 이 두 줄이다.
     HAS_ASSIGNMENT=$(echo "$LANES_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j&&typeof j.assignment==="object"&&j.assignment!==null?"1":"0")}catch{process.stdout.write("0")}')
     if [ "$HAS_ASSIGNMENT" != "1" ]; then
       echo "[santa] lanes가 exit 0을 냈으나 출력에 assignment가 없다 — 배정을 읽지 못했다." 1>&2
       echo "[santa] 리뷰어를 띄우지 않는다. 이 상태를 off로 오인하면 블라인드 0개 라운드가" 1>&2
       echo "[santa] 정상 실행으로 위장된다(DD11)." 1>&2
       exit 1
     fi
     # 여기부터 빈 $BLIND_ID는 `off` 모드 하나뿐이다 — 두 절 모두 번들 경로를 탄다.
     BLIND_ID=$(echo "$LANES_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).blindId||"")}catch{process.stdout.write("")}')
     ```

     **순서가 계약이다.** `assignment` 검사가 `blindId` 추출보다 **먼저**여야 한다 — 뒤에
     두면 그 사이에 빈 `$BLIND_ID`로 분기하는 코드가 끼어들 자리가 생기고, 그 자리가 정확히
     R3이 닫으려던 fail-open이다.
  2. **분기는 리뷰어 절이 아니라 `$BLIND_ID` 하나로 한다.** A 절과 B 절 각각에 "내가
     블라인드인가"를 묻는 조건을 심으면 mode `a`/`b`가 두 곳에서 따로 해석되고, 그 둘이
     어긋나면 블라인드 0개 또는 2개가 조용히 나온다. 두 절 모두 같은 문장을 쓴다 —
     *"이 리뷰어의 id가 `$BLIND_ID`와 같으면 파일 내용 대신 CLI가 낸 블라인드 프롬프트를
     그대로 쓰고, 아니면 현행 번들을 유지한다."* 블라인드 프롬프트의 문구는 이 파일이
     조립하지 않는다(DD4 — 정직한 경로가 가장 싼 경로).
  3. 따라서 A 절과 B 절은 **대칭**이다. mode `a`에서는 A가 블라인드·B가 번들,
     mode `b`에서는 그 반대이며(DD2 표), 어느 경우에도 codex의 `-C "$(pwd)"`와 모델
     선택은 무변경이다(UI10) — 바뀌는 것은 프롬프트에 파일 내용이 실리는지 하나뿐이다.
     `off`면 `$BLIND_ID`가 비어 두 절 모두 현행 번들 경로를 탄다.
  4. `record` 호출 예시에 `--lane`을 더한다. 예시는 A와 B **양쪽**을 보이고, 각자의 값이
     `lanes` 출력에서 오는 것임을 명시한다(한쪽만 보이면 `b`에서 베껴 쓸 형태가 없다).
  5. Notes에 레인 계약 1행 + kill switch 1행을 더한다.
- **Mirror**: Step 4.5(oracle 호출 → JSON 파싱 → 분기)의 구조 · §3.5.1 삭제 검증 습관
- **Validate**: Validation 4번(`--diff-filter=D`) + 아래 회귀 test

### Task 5: 회귀 test — 신규 + 기존 가드 확장

- **Action**:
  1. `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` 신규:
     - 파서 3값 + 불량값 fail-open + 대소문자/공백 정규화
     - `assignLanes`가 **DD2 표 3행 전부**를 낸다 — `a` → `{A:blind,B:bundled}` ·
       `b` → `{A:bundled,B:blind}` · `off` → 전원 bundled. 한 행만 단언하면 나머지 두
       값은 test가 없는 채로 남고, 그것이 R1이 지적한 공백이다
     - 모르는 id는 `bundled`로 떨어진다(우연한 커버리지 충족 차단)
     - **불변식: 어느 mode에서도 블라인드는 최대 1개다**(`off`는 0, 나머지는 정확히 1) —
       UI6의 "전원 블라인드 금지"를 값이 아니라 성질로 단언한다
     - `buildBlindPrompt`가 **파일 내용을 실을 인자를 갖지 않는다**(인자 키 집합 단언) ·
       UI5 문구 포함 · 경로 절삭 시 그 사실을 본문에 명시
     - `record --lane` 부재 exit 2 · 불일치 exit 2 · 일치 시 envelope에 `lane` 기록
     - **`cmdLanes` 출력 계약**: 정상 입력에서 `{assignment, blindId, prompt}` 정확히 3키를
       내고, `assignment`가 DD2 표와 일치하며, `prompt`에 `--paths-file`의 경로가 전부 실린다
     - **`cmdLanes` 실패 계약**: `--paths-file` 부재 · 빈 배열 · 파일 부재 · 비JSON · 비배열 ·
       비문자열 원소가 각각 exit 2이고, **그 어느 경우에도 stdout이 비어 있다**(부분 JSON을
       내면 호출자가 절반짜리 배정으로 리뷰어를 띄운다)
     - **stamp 0 보존**: `off` 모드 원장(라운드 ≥ 1, 블라인드 0건)에서 두 키가 값 `0`으로
       실린다 — 생략되지 않는다(Task 3.3의 부재 ≠ 0)
     - `laneCoverageFrom`이 legacy(레인 부재) 투영에서 0을 내고 예외를 던지지 않음
     - I5 회귀: `assignLanes`의 출력 키 수가 입력 리뷰어 수와 같다(수를 늘리지 않는다)
  2. `santa-loop-cap.test.js` 확장: 모듈 열거에 `lanes.js` 한 줄 · receipt-free 목록에
     `lanes.js` 한 줄 · require allowlist에 `./lanes` 한 줄. **단언을 지우지 않는다.**
  3. `santa-seal.test.js` 확장: 투영 lane · 리포트 레인 열 · stamp 2종 · legacy 무해성.
  4. `santa-review-gate.test.js` 확장: 신규 meta 2종의 수용/거부(음수·비정수).
- **Mirror**: `santa-loop-cap.test.js:1039-1113`(열거 확장 규약)
- **Validate**: 아래 Validation 전량

### Task 6: 문서 · 버전 · PRD

- **Action**:
  1. `docs/santa-loop/ownership.md` — 소유권 표에 `lanes.js`·`santa-lanes.test.js`가 이미
     P2 행으로 있으므로 **추가 기록**만 한다(프로토콜 4): P2 M1이 연 P0 파일과 근거,
     신규 export 5종의 계약 표.
  2. `docs/ENVIRONMENT.md` §11 — `MCCP_SANTA_BLIND_LANE` 등재. 기본값·열거·실패 규약·
     `off`가 덜 엄격한 방향이라는 비대칭·DD4의 한계(선언이지 관측이 아님)를 함께 적는다.
  3. `plugin.json` 1.28.0 → **1.28.1** + `html.js` page-foot + `markdown.js` derived 줄 +
     `CHANGELOG.md` `## [1.28.1]` 및 `currently` 노트 — §3.7 4면 동기. **PR 진입 직전 재계산**
     (§3.7 병렬 브랜치 충돌 — target은 머지 해소 시점과 `/mccp:pr` 직전 두 번 다시 센다).
  4. PRD: Milestone 1 행 `pending` → `in-progress` + Plan 경로 · Success Metrics의
     `evidence_paths` 문언 정정(DD9) · Open Question 1에 해소 표기(DD2) · `off` 모드의
     UI3 미충족 소유자 부재를 신규 Open Question으로 등재(DD7).
- **Mirror**: §3.7 체크리스트 · M3 Task 7(문서 3면)
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

### Task 7: 실 경로 1회 완주 (게이트 실행 ≠ 단위 test)

- **Action**: 별도 probe 워크트리(§3.8)에서 `/mccp:santa-loop`를 **1라운드** 실제로 돌려
  다음을 관측한다: (a) `lanes` subcommand가 블라인드 프롬프트를 내고 그 본문에 파일 내용이
  없다 (b) Reviewer A가 그 프롬프트로 기동한다 (c) `record --lane blind`가 통과하고
  `--lane bundled`가 거부된다 (d) seal이 `santa_blind_records`/`santa_blind_rounds`를 실은
  receipt를 쓰고 schema가 valid를 낸다 (e) `.claude/reviews/` 리포트에 레인 열이 보인다.
  토큰 비용은 블라인드 A와 번들 A를 같은 스코프에서 비교해 기록한다(UI20).
- **Mirror**: M3 Task 8(probe 워크트리 실측 + 증거 반입)
- **Validate**: 관측 결과를 `.claude/notes/santa-evidence-diversity-m1.md`에 기록하고
  receipt 경로를 인용한다. probe 워크트리는 같은 cycle에서 정리한다.

## Validation

```bash
# 1. 신규 + 영향 test 전량
node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js \
            plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js \
            plugins/mccp/scripts/lib/tests/santa-seal.test.js \
            plugins/mccp/scripts/lib/tests/santa-adjudication.test.js \
            plugins/mccp/scripts/lib/tests/santa-gate.test.js \
            plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js

# 2. version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 3. 소유권 교집합 공집합 (소유권 문서가 요구하는 기계 검증)
node -e '
  const fs=require("fs");
  const md=fs.readFileSync("docs/santa-loop/ownership.md","utf8");
  const byOwner={};
  md.split("\n").forEach(function(l){
    const m=l.match(/^\| (P[123]) \| `([^`]+)`/);
    if(m){ (byOwner[m[1]]=byOwner[m[1]]||new Set()).add(m[2]); }
  });
  const keys=Object.keys(byOwner);
  for(let i=0;i<keys.length;i++) for(let j=i+1;j<keys.length;j++){
    const inter=[...byOwner[keys[i]]].filter(function(p){return byOwner[keys[j]].has(p);});
    if(inter.length){console.error("OVERLAP "+keys[i]+"x"+keys[j]+": "+inter.join(", "));process.exit(1);}
  }
  console.log("ownership intersection is empty");'

# 4. 머지 삭제 사고 검증 (§3.5.1) — 공유 표면 2개를 셋이 편집하므로 필수
git diff --diff-filter=D --name-only origin/main...HEAD

# 5. CLI 실경로 smoke — 배정·프롬프트 + 필수 인자 거부가 실제로 발화하는지
#    (--paths-file은 Task 2.2에서 필수가 됐다. 이 명령이 그것 없이 도는 형태로 남아
#     있으면 smoke가 항상 exit 2를 내고, 그 실패가 정상인지 회귀인지 구분되지 않는다.)
SANTA_CLI=plugins/mccp/scripts/lib/santa/cli.js
printf '%s' '["CLAUDE.md"]' > .claude/state/santa-loop/tmp/smoke-paths.json

# 5a. 정상 입력 → exit 0 + 3키
node "$SANTA_CLI" lanes --decision santa-evidence-diversity   --paths-file .claude/state/santa-loop/tmp/smoke-paths.json   | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
    const k=Object.keys(j).sort().join(",");
    if(k!=="assignment,blindId,prompt"){console.error("keys="+k);process.exit(1)}
    if(!/CLAUDE\.md/.test(j.prompt)){console.error("prompt lost the target path");process.exit(1)}
    console.log("5a ok blindId="+j.blindId);'

# 5b. --paths-file 부재 → exit 2 (부재가 통과하면 포인터 없는 블라인드가 가능해진다)
if node "$SANTA_CLI" lanes --decision santa-evidence-diversity 2>/dev/null; then
  echo "5b FAIL: --paths-file 없이 통과했다"; exit 1
fi
echo "5b ok (rejected)"

# 6. receipt 왕복 — 신규 meta 2종을 실은 receipt가 status/validate를 통과
node plugins/mccp/scripts/receipt/cli.js status
```

### 어느 명령이 무엇을 증명하는가

명령 목록만으로는 "이 Acceptance 항목을 무엇이 확인하는가"가 암묵적으로 남는다. 특히
`seal → write → receipt meta` 이음매는 세 계층에 걸쳐 있어, 어느 하나만 보면 덮인 것처럼
보이고 실제로는 비어 있을 수 있다. 대응을 여기 못박는다.

| Acceptance 항목 | 증명하는 것 | 어디서 |
|---|---|---|
| `assignLanes` 3 mode | DD2 표 3행 + "블라인드 최대 1개" 성질 | Validation 1 → `santa-lanes.test.js` (Task 5.1) |
| `buildBlindPrompt` 인자 부재 | 파일 내용 인자가 시그니처에 없음 | Validation 1 → `santa-lanes.test.js` (Task 5.1) |
| `--lane` 대조 | 부재 exit 2 · 불일치 exit 2 · 일치 시 envelope 기록 | Validation 1 → `santa-lanes.test.js` (Task 5.1) |
| **`santa_blind_*` stamp** | `seal()`이 `laneCoverageFrom`을 부르고 두 키가 **receipt에 실제로 실린다** — 단위 계층은 `seal()`을 end-to-end로 돌려 산출 receipt를 되읽어 단언한다(기존 `santa-seal.test.js`가 실 receipt를 쓰는 방식 그대로) | Validation 1 → `santa-seal.test.js` (Task 5.3) |
| 같은 stamp의 **schema 수용** | 두 키의 present-only 검증 · 음수/비정수 거부 | Validation 1 → `santa-review-gate.test.js` (Task 5.4) |
| 같은 stamp의 **실경로 관측** | 실제 루프가 낸 receipt에 값이 있고 valid | Task 7 live run + Validation 6 |
| I5 (리뷰어 수 불변) | 출력 키 수 == 입력 리뷰어 수 | Validation 1 → `santa-lanes.test.js` (Task 5.1) |
| 소유권 교집합 공집합 | P1·P2·P3 경로 집합이 겹치지 않음 | Validation 3 |
| 머지 삭제 사고 없음 | 반대편 신규 파일이 사라지지 않음 | Validation 4 |
| version 4면 동기 | footer·manifest drift 부재 | Validation 2 |

`santa-lanes.test.js`는 Task 5.1이 **생성**하므로 Validation 1은 구현 이후에만 성립한다 —
Validation 절은 완료 시점의 상태를 기술한다.

**stamp 이음매를 3계층으로 두는 이유**: 단위(`seal()` 왕복)는 호출이 실제로 일어나는지를,
schema는 그 값이 receipt 계약에 맞는지를, live run은 실 루프가 그 경로를 지나는지를 각각
답한다. 셋은 서로를 대체하지 못한다 — 단위만 있으면 실경로가 그 코드를 안 지날 수 있고,
live run만 있으면 실패 시 어느 계층이 깨졌는지 알 수 없다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 블라인드 A가 스코프를 못 찾아 헛돌고 탐지율이 떨어진다 | Medium | 포인터에 저장소 루트 + **대상 파일 경로**를 준다(UI4). #125 실측에서 codex가 이 조건으로 성공했다. Task 7이 1라운드 실측으로 확인하고, 하락이 보이면 스코프 힌트 수준을 조정한다(UI20) |
| `--lane`이 선언일 뿐이라 커맨드 본문이 블라인드라 적고 번들을 건네도 아무도 모른다 | Medium | 이 한계는 DD4가 명시하고 M1은 위조 방지를 **주장하지 않는다**. 완화는 CLI가 프롬프트를 조립해 정직한 경로를 가장 싸게 만드는 것이고, 검증은 PRD가 정한 결과 분포(두 레인이 동시에 놓친 항목 비율)로 한다 |
| 블라인드 레인의 토큰 비용이 번들보다 커서 라운드당 비용이 오른다 | High | 비용 증가는 설계상 예상된 대가이고 PRD가 Open Question으로 이미 등재했다. Task 7이 같은 스코프에서 blind vs bundled를 비교 기록하고, 값이 크면 `MCCP_SANTA_BLIND_LANE=off`가 즉시 복귀 경로다 |
| 공유 표면(`santa-loop.md`·`cli.js`)에서 P1/P3 편집을 지운다 | Medium | 자기 절만 편집(UI17) + Validation 4번의 `--diff-filter=D` + P1은 이미 머지됐고 P3는 미착수라 현재 충돌면이 최소다 |
| `off`가 kill switch로 상시 켜져 축이 사실상 없는 것이 된다 | Medium | default가 발화 쪽이고 불량값도 발화로 fail-open한다(DD8). 그리고 `off` 실행은 stamp에 `santa_blind_rounds=0`으로 **남는다** — 조용히 사라지지 않는다 |
| P0 파일 개방이 P0 계약을 침식한다 | Low | 프로토콜 2의 추가만 하고 시그니처·반환 계약은 무변경이다. 열지 않는 경계 셋을 DD5가 명시하고 소유권 문서에 추가 기록한다(UI18) |
| M2의 상시 스코프가 착지할 때 대상 경로 목록이 두 곳에서 만들어진다 | Medium | DD10이 접속점을 `buildBlindPrompt`의 `targetPaths` 인자 하나로 고정한다. M1은 목록을 만들지 않고 받기만 한다 |
| 병렬 브랜치가 1.28.1을 선점해 version이 밀린다 | Medium | §3.7대로 target을 머지 해소 시점과 `/mccp:pr` 직전 두 번 재계산하고, 재상향 시 4면 + CHANGELOG 헤딩을 전부 다시 맞춘다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes (6개 명령 전부)
- [ ] Patterns mirrored, not reinvented — `lanes.js`가 `terminator.js`의 순수 oracle 규약을
      따르고, 가드 확장은 열거 한 줄 추가이며 어떤 단언도 지우지 않았다
- [ ] I5 회귀 test가 존재한다 — `assignLanes`의 출력 키 수가 입력 리뷰어 수와 같다(UI2·UI19)
- [ ] `buildBlindPrompt`에 파일 내용을 실을 인자가 없다는 단언이 test로 존재한다(UI3·DD3)
- [ ] **DD2 표 3행 전부에 test가 있다** — `a`·`b`·`off` 중 어느 하나라도 단언 없이 남으면
      그 값의 동작은 명세가 아니라 해석이다
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) —
      **live run이 반드시 산출해야 하는 것**: `mccp-santa-review` receipt 1건이
      `meta.santa_blind_records >= 1` 과 `meta.santa_blind_rounds >= 1` 을 싣고 schema valid를
      내며, `.claude/reviews/santa-review-<slug>.md` 라운드 표에서 **`lanes`가 배정한 그
      리뷰어**의 레인이 `blind`로 찍혀 있고(default 실행이면 A, `MCCP_SANTA_BLIND_LANE=b`
      실행이면 B — 조건은 "A가 blind"가 아니라 "배정과 기록이 일치한다"이다), 같은 라운드에서
      배정과 어긋난 `--lane` 값이 exit 2로 거부되는 것이 터미널에 관측된다. 이 셋 중
      하나라도 없으면 M1은 complete가 아니다
- [ ] live run은 **default(`a`) 1회로 충분하다.** `b`는 단위 test로만 덮는다 — mode를 바꾸는
      것이 프롬프트 조립과 record 대조에 미치는 영향은 전부 `assignLanes`의 반환값을
      경유하므로, 두 번째 live run이 새로 관측할 경로가 없다. 이 판단이 틀렸다면(예: 커맨드
      본문이 id를 어딘가에 하드코딩) Task 4의 `$BLIND_ID` 단일 분기가 그 자리에서 깨지므로
      단위 test가 먼저 붉어진다
- [ ] Task 7의 토큰 비용 비교가 기록됐다(UI20) — 수치를 주장하지 않고 관측만 남긴다

## Design Critique

critique retry loop: round 0/2 → verdict `CONVERGED` (findings 0건).

검토 대상은 본 plan이 도입하는 유일한 디자인 표면 — `renderer/html.js` page-foot와
`renderer/markdown.js` derived 줄의 version 리터럴 교체(§3.7 4면 동기)다. SKILL.md
`## Output Constraints` 4항 대조 결과:

| Anchor | 결과 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | PASS | plan 본문 최대 깊이 `###`. 렌더 표면에 신규 heading 0건 |
| 강조색 화면당 1개 | PASS | 색 토큰 미도입 — 변경은 version 문자열 리터럴 하나 |
| raw markdown marker 금지 | PASS | footer 문자열 내부 리터럴 교체라 렌더 파이프라인 무접촉 |
| 한 화면 항목 수 상한 | PASS | 대시보드 `list-of-N` 섹션 신규 0건. plan의 표는 렌더 표면이 아니다 |

Phase 3.7 produced-diff grounding lint(H15)가 구현 단계에서 같은 anchor를 산출 diff에
다시 적용한다 — critique은 EXECUTE 이전에 돌므로 그 gap은 그쪽이 닫는다.

## Design Routing Guide

routing mode: auto (effective at implement stage). At implement the design gate routes these
stage-appropriate impeccable commands; here they are a checklist only.

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

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) — `plan-codex-runner.js` 경유, run nonce `053d3896`
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=1`; 아래 triage에 미해소 ACCEPT_NOW HIGH가 없어 escalate 조건 미충족)
- 리뷰어 계약: `full` — 2건 전부 `INTENT:` 주장 동반 (F1 → UI7, F2 → UI3). 저자 라벨과 **양쪽 일치**
- 합치 결론: F2(‑`off` 모드의 UI3 미충족에 소유자가 없다)는 실재하며 흡수했다. F1(레인 stamp는 선언을 인증할 뿐 실제 번들 부재를 인증하지 않는다)은 기전이 정확하나 DD4가 명시하고 PRD Risks가 사전 등재한 **수용된 한계**의 재기술이라 설계상 기각한다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 receipt가 선언을 인증한다 | HIGH | REJECTED_BY_DESIGN | DD4가 "검증하지 않는 것"으로 이미 명시하고 UI7 자체가 검증을 결과 분포에 위임한다. 권고안(manifest digest 결속)도 gap을 닫지 못한다 — 어느 텍스트가 LLM 컨텍스트에 들어갔는지 관측하는 기계적 채널이 없다 |
  | F2 `off`가 UI3을 무기한 미충족시킨다 | HIGH | ACCEPT_NOW | DD7의 "차단은 M3 소유" 주장이 **사실이 아니었다**. PRD M3 Scope는 Reviewer B 부재 fallback이라 `off`를 다루지 않아 UI3에 소유자가 없다. DD7 정정 + PRD Open Question 등재로 흡수 |
- Deferred to backlog: 1 (F1) → `.claude/plans/codex-findings-backlog.md`
- Open Questions: `off` 모드의 UI3 미충족 소유자 부재 — severity HIGH, PRD Open Questions에 등재됨(M1 밖에서 결정). 그 외 미해소 항목 없음
- 흡수의 반경: F2 흡수는 **문서 축 전용**이다. `gate.js`는 열지 않았고(UI17·DD7 무변경) 코드 Task 1~5와 Validation은 무변경이다 — 바뀐 것은 DD7의 소유권 서술, Task 6.4의 PRD 편집 목록, PRD Open Questions 1행이다
