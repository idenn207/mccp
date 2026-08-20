# Plan: santa 증거 다양성 M3 — degrade 차단

**Source PRD**: `.claude/prds/santa-evidence-diversity.prd.md`
**Selected Milestone**: 3 — degrade 차단
**Complexity**: Medium

## Summary

`codex`도 `gemini`도 설치되지 않은 머신에서 Reviewer B는 두 번째 Claude Opus로 떨어진다.
그 조합의 NICE는 이종 조합의 NICE와 **어느 표면에서도 구분되지 않는다** — 라운드 판정도,
봉인 verdict도, receipt도 같은 값을 낸다. M3은 신규 순수 oracle `model-diversity.js`가
원장에 이미 기록된 리뷰어 `model` 문자열에서 계열(family)을 분류하고, 봉인 층에서
`converged`를 `degraded`로 좁혀 push를 막되 감사되는 사람 승인 경로를 남긴다. 리뷰어 수는
늘리지 않고(I5) 라운드 판정(`gate.js`, P1 소유·동결)은 건드리지 않는다 — 바뀌는 것은
**같은 NICE가 어떤 이름으로 봉인되는가** 하나다.

## User Intent

<!-- PRD 본문(사용자 공동 작성) + 우산 PRD review-loop-trust 승계 불변식 I1·I5 +
     docs/santa-loop/ownership.md 변경 프로토콜 + CLAUDE.md 3.14/3.15에서 추출.
     저자 정당화는 ## Design Decisions 소관. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 리뷰어를 온화하게 만들지 말 것. 오탐은 판정 하류에서 거른다 | constraint |
| UI2 | 리뷰어 수를 늘리지 말 것. 다양성은 증거 경로로만 확보한다 | constraint |
| UI3 | Reviewer B 부재 fallback의 NICE를 degraded 판정으로 강등한다 | direction |
| UI4 | 동일모델 앙상블의 NICE가 이종 조합의 NICE와 구분되어 사람 승인을 요구한다 | direction |
| UI5 | degraded는 차단이 아니라 구분이다. 사람 승인 경로를 남긴다 | constraint |
| UI6 | 의도적 비활성과 미가용을 분리한다. 기존 receipt 계층의 skipped 대 unavailable 선례를 따른다 | direction |
| UI7 | Codex 제거나 다른 외부 모델 도입은 하지 않는다 | exclusion |
| UI8 | santa verdict는 게이트 승인이 아니다 | constraint |
| UI9 | severity 판정 원장 종료 조건은 P1 소유다. 본 축은 원장을 소비만 한다 | exclusion |
| UI10 | 델타 스코프는 P3 소유다 | exclusion |
| UI11 | 블라인드 레인은 M1이, 상시 스코프는 M2가 이미 끝냈다 | exclusion |
| UI12 | 블라인드 레인이 꺼진 실행의 미충족은 M3 Scope가 아니다. M3은 Reviewer B 부재 fallback을 다룬다 | exclusion |
| UI13 | gpt-5.4 하드코딩 갱신은 본 PRD 밖이다 | exclusion |
| UI14 | 동결 시그니처를 자식 PRD가 바꾸지 말 것. 바꿔야 하면 P0를 재개한다 | constraint |
| UI15 | 공유 표면인 커맨드 본문과 CLI에서는 자기 절만 편집할 것 | constraint |
| UI16 | 소유권 표가 실제 변경과 어긋나면 같은 PR에서 표를 고칠 것 | constraint |
| UI17 | 각 불변식의 회귀 test 존재를 지표에 포함할 것 | constraint |
| UI18 | 게이트 리뷰는 1라운드가 기본이다. plan을 다듬기보다 적용 후 결과로 판단한다 | direction |
| UI19 | 리뷰 finding은 HIGH 이상만 그 자리에서 흡수하고 나머지는 backlog로 이연한다 | direction |
| UI20 | 검증되지 않는 값을 receipt에 봉인하지 말 것 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 파생 집계 | `plugins/mccp/scripts/lib/santa/lanes.js:200-215` `laneCoverageFrom` | 이미 투영된 projection에서만 파생한다. 디스크·시각 미접촉, 어떤 입력에도 던지지 않고 legacy 투영(필드 부재)에서 0으로 접힌다 |
| env 파서 | `lanes.js:81-95` `parseBlindLane` | 열거 검사 후 불량값은 loud stderr warn + default fail-open. 던지지 않는다 |
| 봉인 판정 | `plugins/mccp/scripts/lib/santa/seal.js:144-149` `deriveVerdict` | FINAL 라운드에서만 판정하고 조건은 좁다. 각 절이 무엇을 잡는지 주석이 1:1로 대응 |
| 조건부 present-only 정수 | `plugins/mccp/scripts/receipt/write.js:756-770` `SANTA_INT_FIELDS` | 값이 있을 때만 `meta.X`에 재료화 — `makeSkeleton` 미등록과 한 쌍이라 canonical hash가 무변동이다 (3.12) |
| 조건부 present-only 불리언 | `write.js:742` `review_l3_invoked` | `=== true`일 때만 stamp. 부재와 false를 같은 키로 뭉개지 않는다 |
| 조건부 enum 문자열 | `write.js:771-773` + `plugins/mccp/scripts/receipt/schema.js:923-925` `santa_exit_reason` | 열거 2값의 present-only 검증. 열거 밖은 schema가 거부 |
| 선언값 재도출 대조 | `plugins/mccp/scripts/lib/santa/cli.js:341-357` `SANTA_LANE_MISMATCH` | CLI가 같은 파서로 기대값을 재도출해 선언과 대조한다. 불일치는 exit 2이고 라운드는 열린 채 남아 재기록 가능 |
| audited override 사유 | `plugins/mccp/scripts/receipt/lib/force-override-reason` `validateReason({strict})` | 30자 이상·3단어 이상·1-token 금칙·filler 거부. `gate.js:42`가 이미 require하므로 santa 외부 의존이 늘지 않는다 |
| 봉인 결과의 push 분기 | `plugins/mccp/commands/santa-loop.md:735-746` Step 5.5 | `SEAL_EXIT`(완료했나)과 `SEAL_VERDICT`(무엇을 봉인했나)를 **각각** 분기한다 |
| 모듈 집합 가드 확장 | `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:1063-1134` | 신규 모듈을 열거·`RECEIPT_FREE`·require allowlist 3목록에 한 줄씩 등재하고 근거를 주석으로 남긴다. 단언을 지우지 않는다 |
| 한계의 명시 | `.claude/plans/santa-evidence-diversity-m2.plan.md` DD7 | 검증 불가능한 값을 봉인하는 대신 공백에 이름을 붙여 Open Question으로 등재한다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/model-diversity.js` | CREATE | M3 신규 순수 oracle. 계열 분류 + degrade 판정 + env 파서 2종 |
| `plugins/mccp/scripts/lib/santa/seal.js` | UPDATE | `deriveVerdict` 제3값 · 리포트 1줄 · `writeArgs` 조건부 키 · `seal()` 반환 3키 |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | `cmdRecord`의 `--model` 계열 재도출 대조 1건 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | present-only 5필드 재료화 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | 같은 5필드 present-only 검증 |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | Step 3 Reviewer B fallback 문구 · Step 5.5 degraded 분기 · Output · Notes |
| `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | UPDATE | degrade 강등 회귀 test (소유권 표가 이 파일에 배정) |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATE | 모듈 집합·receipt-free·require allowlist 등재 |
| `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js` | UPDATE | receipt 5필드 schema 회귀 |
| `docs/ENVIRONMENT.md` | UPDATE | `MCCP_SANTA_DEGRADE_GATE` · `MCCP_SANTA_DEGRADE_ACK` 등재 |
| `docs/santa-loop/ownership.md` | UPDATE | 소유권 표 신규 행 + P2 M3 export 계약 + 연 파일 근거 (프로토콜 4) |
| `.claude/prds/santa-evidence-diversity.prd.md` | UPDATE | Milestone 3 status + Open Question 1건 해소 · 1건 소유자 확정 |
| `CHANGELOG.md` | UPDATE | `## [1.30.0]` 항목 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (3.7 — PRD 전 milestone 완료라 minor) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (4면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (4면) |

## Design Decisions

### DD1 — 강등은 봉인 층에서 한다. 라운드 판정은 건드리지 않는다

`gate.decideVerdict`의 `verdict`는 `'NICE' | 'NAUGHTY'`이고 이것은 **P0 동결 시그니처**다
(UI14). 게다가 `gate.js`는 소유권 표의 **P1 행**이다. 즉 "동일모델이면 NICE를 주지 않는다"를
라운드 판정에 넣는 경로는 동결 위반과 소유권 침범을 동시에 저지른다.

봉인 층은 두 조건 모두 열려 있다. `seal.deriveVerdict`는 동결 표에 **없고**(선례:
santa-adjudication M3이 같은 근거로 `seal.buildProof`를 열었다), `seal.js`는 P0 파일이지만
M1(P2)과 santa-adjudication M3(P1)이 이미 프로토콜 2의 **추가**로 연 전례가 있다. 그리고
봉인 verdict는 **이미 push를 막는 자리**다 — `santa-loop.md` Step 5.5가 `converged`가
아니면 exit 1이므로, 강등을 여기 놓으면 차단 배선이 새로 필요하지 않다.

판정 우선순위는 `divergent` > `degraded` > `converged`다. `divergent`가 이미 비승인이므로
degraded는 **converged를 좁히는 것**이지 divergent를 완화하는 것이 아니다.

### DD2 — `degraded`를 receipt verdict 어휘에 넣지 않는다

receipt의 `resolution.review_verdict`는 `review-verdict.js:46`의
`REVIEW_VERDICT_VALUES = ['converged','divergent','critical','unavailable','skipped']`를
쓰고, 그 배열은 `receipt/schema.js`의 `CODEX_VERDICT_VALUES`와 **공유**된다(schema.js:44-47).
거기에 `degraded`를 더하면 santa와 무관한 **codex 축에서도 `degraded`가 표현 가능**해지고,
`pr-ship-gate.js`·`receipt-convergence.js`·dedupe·대시보드 전부가 새 값을 만나게 된다.
M3이 닫으려는 결함은 santa 한 축인데 폭발 반경이 receipt 계층 전체가 된다.

그래서 어휘 경계에서 **좁히는 방향으로 사영**한다: `degraded`는 receipt와 proof에
`'divergent'`로 실리고(둘 다 비승인이므로 사영은 넓히지 않는다), degrade라는 사실은
present-only 필드 `meta.santa_model_degraded` + `meta.santa_degrade_reason`이 진다.
`degraded`라는 이름 자체는 santa 자신의 표면 — `seal` stdout, `.claude/reviews/` 리포트,
Step 5.5의 정지 메시지 — 에만 나타난다.

**지표가 요구하는 "구분"은 이것으로 충족된다.** "Reviewer B 부재 실행의 verdict가
`degraded`로 구분됨(NICE 아님)"에서 기계적으로 필요한 것은 (a) 자동 통과하지 않을 것과
(b) 사후에 다른 실행과 구별될 것 둘이고, (a)는 Step 5.5의 정지가, (b)는 두 receipt 필드가
맡는다. 사영이 정보를 잃지 않는지는 회귀 test가 단언한다 — 같은 receipt에서
`review_verdict='divergent'`와 `santa_model_degraded=true`가 함께 읽히는지.

### DD3 — 모르는 모델은 degraded다

`familyOf`는 `anthropic` / `openai` / `google` / `unknown` 넷을 낸다. 판정은 두 줄이다.

1. 어느 리뷰어의 계열이든 `unknown`이면 → degraded, reason `unknown_model`
2. 아니면서 distinct 계열이 2 미만이면 → degraded, reason `same_family`

**"모르겠다"가 승인을 사지 못하게 하는 것이 이 순서의 전부다.** 반대로 두면 오탈자 하나나
신규 모델명 하나가 곧바로 이종 판정을 얻는다 — 그것은 M3이 닫으려는 결함(구분되지 않는
NICE)을 이름만 바꿔 되살리는 것이다. 대가는 명시적이다: 카탈로그에 없는 모델을 쓰면
degraded가 뜨고, 처방은 게이트 완화가 아니라 `familyOf`에 그 계열을 등재하는 **1줄 PR**이다.
등재가 싸다는 사실이 이 fail-closed를 감당 가능하게 만든다.

### DD4 — 관측은 항상, 강제는 토글

`MCCP_SANTA_DEGRADE_GATE=off`는 **verdict 강등만** 끈다. `santa_model_families` ·
`santa_model_degraded` · `santa_degrade_reason`은 `off`에서도 그대로 stamp된다.

근거는 M1이 `santa_blind_rounds=0`에 쓴 것과 같다 — present-only 의미론에서 **부재는 "이
필드가 없던 시절에 쓰였다(모름)"이고 값은 "관측했다"**라 서로 다른 상태다. `off`가 관측까지
끄면 `off` 실행이 M3 이전 실행과 구분되지 않고, 그것은 정확히 이 milestone이 닫으려는
모양의 결함이다. 관측은 원장에 이미 있는 `model` 문자열에서 파생되므로 비용이 0에 가깝고,
따라서 "kill switch가 비용까지 끈다"(M2 DD5가 `off`에 적용한 논리)는 여기서는 성립하지
않는다 — 끌 비용이 없다.

### DD5 — 사람 승인은 verdict를 재작성하지 않는다

`MCCP_SANTA_DEGRADE_ACK="<substantive reason>"`(strict `validateReason`)이 있으면 Step 5.5가
push를 진행하지만 **봉인된 verdict는 `degraded` 그대로**이고 receipt에는
`santa_degrade_ack=true` + `santa_degrade_ack_reason`이 함께 남는다. 선례는
`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`다 — 그 override도 "verdict를 재작성하지 않는다"
(3.12).

**이것이 없으면 ack는 축을 장식으로 만든다.** codex 미설치 머신에서는 모든 실행이
degraded이므로 ack가 `settings.json`에 상주하게 되는데, ack가 verdict를 `converged`로
바꾼다면 그 순간부터 degraded 실행 수는 영구히 0이 되고 지표 "degrade 가시화"는 측정할
대상을 잃는다. verdict를 그대로 두면 상주 ack 아래에서도 degraded 비율이 계속 세어지고,
그 비율이 곧 "이 머신에 codex를 설치할 이유"의 실측이 된다.

ack의 판정 주체는 CLI 한 곳이다. Step 5.5는 `seal`이 반환한 `degradeAck`를 읽을 뿐 env를
다시 읽지 않는다 — 두 곳이 각자 해석하면 두 해석이 갈릴 수 있고, 그 형태의 결함은 이
저장소가 이미 여러 번 잡았다(`--lane` 재도출을 CLI 단일 지점에 둔 것과 같은 이유).

### DD6 — 선언 모델의 PATH 재도출 대조와 그 정직한 천장

`--model`은 커맨드 본문이 **타이핑하는 선언**이다. M2 DD7은 "검증되지 않는 값을 봉인하면
receipt가 사실이 아닌 것을 사실처럼 기록한다"고 적었고(UI20), 그 기준을 여기에도 적용해야
한다. 그런데 `--lane`과 달리 이 축에는 CLI가 **부분적으로 재도출할 수 있는 사실**이 있다:
외부 CLI가 `PATH`에 있는가.

`cmdRecord`는 `familyOf(--model)`가 `openai`/`google`인데 대응 CLI(`codex`/`gemini`)가
`PATH`에 없으면 `SANTA_MODEL_UNAVAILABLE`로 exit 2한다. 라운드는 열린 채 남아 재기록
가능하고, 메시지는 실제로 무엇을 실행했는지 기록하라고 지시한다. `SANTA_LANE_MISMATCH`와
같은 모양이고 신규 exit code는 0건이다.

**막는 것**: 설치되지도 않은 CLI의 모델명을 적어 이종 판정을 얻는 경로.
**막지 못하는 것**: codex가 설치돼 있는데 Claude fallback을 쓰고 `gpt-5.4`라고 적는 것.
셸에서 어느 모델이 실제로 응답했는지 확인할 방법이 없다. M1이 `--lane`에 대해 "위조 방지를
주장하지 않는다"고 적은 것과 **같은 천장**이며, M3도 주장하지 않는다. 검증은 결과 분포에
맡긴다(PRD 지표 5 — 두 레인이 동시에 놓친 항목 비율).

### DD7 — 의도적 비활성 대 미가용은 설명하되 봉인하지 않는다

PRD Risk 3의 완화는 `MCCP_CODEX_DISABLED=1` 같은 의도적 비활성과 미가용을 분리하라고
한다(UI6). 분리의 **자리**가 문제다. 봉인 시점에 `PATH`를 다시 훑으면 리뷰어가 실제로 돈
시점과 어긋날 수 있고, 그 값은 곧 "봉인 시점에 이랬다"일 뿐인데 receipt는 그것을 라운드의
사실처럼 보여준다 — UI20이 금지하는 모양이다.

그래서 receipt의 `santa_degrade_reason`은 **projection에서 파생 가능한 두 값**
(`same_family` · `unknown_model`)만 갖는다. 의도적/미가용 구분은 Step 5.5의 **정지
메시지**가 그 자리에서 `command -v codex`와 `MCCP_CODEX_DISABLED`를 읽어 운영자에게
설명한다. 메시지는 무엇을 해야 하는지 알려주는 안내이고 봉인되는 주장이 아니다 — 그 구분을
커맨드 본문에도 한 문장으로 적는다.

### DD8 — env default는 발화 쪽이다

`MCCP_SANTA_DEGRADE_GATE=enforce|off`, default `enforce`. `off`가 **덜 엄격**하다는 비대칭은
`MCCP_SANTA_BLIND_LANE`·`MCCP_SANTA_ALWAYS_SCOPE`·`MCCP_SANTA_TERMINATOR`와 같고 근거도
같다: `off`가 default면 오타 하나가 kill switch를 켜고 **그 실행이 M3 이전과 똑같아 보인다**.
불량값은 loud stderr warn 후 `enforce`로 fail-open.

`MCCP_SANTA_DEGRADE_ACK`에는 default가 없다 — 부재가 곧 "승인 없음"이고, 그것이 안전한
쪽이다.

### DD9 — 블라인드 레인 `off`는 M3이 소유하지 않는다

PRD Open Question("`off` 모드의 UI3 미충족을 무엇이 막는가")은 소유자 후보로 "M3 범위 확장
vs 신규 milestone"을 적었다. M3은 **넓히지 않는다**(UI12 — PRD의 Milestone 3 Outcome은
Reviewer B 부재 fallback이다).

거절 근거는 처방이 다르다는 것이다. 모델 degrade의 처방은 "codex를 설치하라"이고 레인
degrade의 처방은 "`MCCP_SANTA_BLIND_LANE=off`를 그만 쓰라"라, 두 축을 한 verdict에 묶으면
운영자가 받은 정지 메시지가 어느 처방을 가리키는지 흐려진다. 기술적으로는 M3이 만드는 봉인
층 강등을 `santa_blind_rounds < santa_rounds`에 재사용하면 거의 공짜이므로 — 넓히자는
판단이 서면 그때는 값싸다. **지금 그 결정을 조용히 내리지 않는 것**이 이 DD의 목적이고,
PRD에는 "M3이 넓히지 않기로 했으므로 남은 후보는 신규 milestone뿐"으로 갱신한다.

## Tasks

### Task 1: `model-diversity.js` — 순수 oracle

- **Action**: 신규 파일. 외부 require는 `../../receipt/lib/force-override-reason` 1개
  (`gate.js:42`가 이미 쓰는 것이라 santa 외부 의존 집합이 **늘지 않는다**). 파일시스템·시각
  미접촉.
  - `ENV_DEGRADE_GATE`(`'MCCP_SANTA_DEGRADE_GATE'`) / `DEGRADE_GATE_DEFAULT`(`'enforce'`) /
    `DEGRADE_GATE_VALUES`(`['enforce','off']`) / `ENV_DEGRADE_ACK`(`'MCCP_SANTA_DEGRADE_ACK'`)
  - `FAMILIES`(`['anthropic','openai','google']`) / `FAMILY_UNKNOWN`(`'unknown'`) /
    `DEGRADE_REASONS`(`['same_family','unknown_model']`)
  - `familyOf(model)` → 위 4값. 입력을 소문자·trim한 뒤 부분일치로 분류
    (`claude|opus|sonnet|haiku|anthropic` → anthropic · `gpt|codex|openai` → openai ·
    `gemini|google` → google · 그 외와 비문자열·빈 문자열 → unknown). 미throw
  - `parseDegradeGate(env)` → `'enforce'|'off'`. 미설정·불량값은 warn 후 default. 미throw
  - `parseDegradeAck(env)` → `{ ok, reason, rejectedBecause }`. strict `validateReason`을
    그대로 위임한다 — 이 파일이 자체 문자열 규칙을 만들면 override 표면마다 기준이 갈린다.
    미설정은 `{ok:false, reason:null, rejectedBecause:'absent'}`. 미throw
  - `diversityFrom(projection)` → `{ finalIndex, models, families, distinctFamilies,
    unknownCount, degraded, reason }`. **FINAL 라운드 하나만** 본다(`deriveVerdict`가
    같은 라운드에서 판정하므로 두 함수가 다른 라운드를 보면 봉인이 자기모순이 된다).
    라운드 0건·리뷰어 0건이면 `degraded:true`, `reason:'unknown_model'`, `distinctFamilies:0`.
    legacy 투영(`model` 부재)에서도 던지지 않고 unknown으로 접힌다. DD3의 2줄 순서를 그대로
    구현하고 그 순서가 왜 그런지 주석에 남긴다
- **Mirror**: `lanes.js:200-215`(projection 파생 집계) · `lanes.js:81-95`(env 파서) ·
  `gate.js:42`(validateReason 위임)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js`

### Task 2: `seal.js` 배선 — 판정·리포트·writeArgs·반환

- **Action**: 프로토콜 2의 **추가**만 한다. 기존 함수의 반환 계약 중 바뀌는 것은
  `deriveVerdict`의 값 집합 하나이고, 그것은 동결 표에 없다(DD1).
  1. `deriveVerdict(projection, opts)` — 두 번째 인자를 **선택**으로 받아 env를 넘긴다
     (미전달 시 `process.env`). 기존 두 절(`fin.verdict !== 'NICE'` · `distinctIds < 2`)은
     **그대로 두고**, 그 아래에 degrade 절을 더한다:
     `parseDegradeGate(env) === 'enforce'` 이고 `diversityFrom(projection).degraded`면
     `'degraded'`. 그 외 `'converged'`
  2. `renderReport` — 라운드 표 아래에 계열 1줄(`- models: A=<model>(family) B=<model>(family)
     · distinct=<N> · degraded=<bool> reason=<enum>`). `project()`가 이미 `model`을 싣고
     있으므로 투영 변경 0건이다
  3. `writeArgs` — 조건부 키. `santa-model-families`·`santa-model-degraded`·
     `santa-degrade-reason`은 **라운드가 1 이상이면 gate 값과 무관하게** 싣고(DD4),
     `santa-degrade-ack`·`santa-degrade-ack-reason`은 `verdict === 'degraded'`이고 ack가
     유효할 때만 싣는다. `'review-verdict'`는 `verdict === 'degraded' ? 'divergent' : verdict`로
     **사영**한다(DD2)
  4. `buildProof` — 같은 사영을 입력에서 받는다. `verification_verdict`에 `degraded`가
     새는 것을 막는 것이 목적이고, 사영 지점을 `seal()` 안 **한 곳**으로 모아 두 소비처가
     다른 값을 보지 않게 한다
  5. `seal()` 반환에 `degraded`(bool) · `degradeReason`(string|null) · `degradeAck`(bool)
     3키 추가. `verdict`는 `'degraded'`를 그대로 낸다 — santa 자신의 표면이므로 사영하지
     않는다
- **Mirror**: `seal.js:399-420`(M1 레인 커버리지의 조건부 writeArgs) · `seal.js:144-149`
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-seal.test.js plugins/mccp/scripts/lib/tests/santa-lanes.test.js`

### Task 3: receipt 5필드 — `write.js` + `schema.js`

- **Action**:
  1. `write.js` — `SANTA_INT_FIELDS`에 `['santa-model-families','santa_model_families',0]`
     1행 추가. 불리언 2종(`santa_model_degraded`·`santa_degrade_ack`)은 `review_l3_invoked`
     블록을 미러해 `=== true`일 때만 stamp. 문자열 2종
     (`santa_degrade_reason`·`santa_degrade_ack_reason`)은 `santa_exit_reason` 블록을
     미러해 비어 있지 않은 문자열일 때만 stamp
  2. `schema.js` — 같은 5필드의 present-only 검증을 santa 블록(`:893-925`) 끝에 잇는다.
     `santa_model_families`는 비음 정수, 불리언 2종은 `=== true`만 허용(false를 명시
     저장하지 않는다 — 부재와 뜻이 겹친다), `santa_degrade_reason`은
     `['same_family','unknown_model']` 열거, `santa_degrade_ack_reason`은 비어 있지 않은
     문자열. **양방향 불변식 1개**: `santa_degrade_ack`가 있으면
     `santa_degrade_ack_reason`도 있어야 하고 그 역도 성립한다(적용되지 않은 override의
     사유만 남거나 사유 없는 승인이 남는 두 모양을 함께 막는다)
  3. `makeSkeleton`은 **건드리지 않는다** — 키를 넣으면 전 receipt의 canonical hash 입력이
     바뀐다(3.12)
- **Mirror**: `write.js:742`·`:756-773` · `schema.js:893-925`
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js`

### Task 4: `cli.js` — `--model` 계열 재도출 대조

- **Action**: 공유 표면이므로 **P2 절만** 편집한다(UI15). `cmdRecord`의 기존 `--model`
  비어있음 검사(`cli.js:326-329`) 바로 뒤에 대조를 잇는다.
  - `familyOf(model)`가 `openai`면 `codex`, `google`면 `gemini`가 `PATH`에 있어야 한다.
    없으면 `SantaCliError('SANTA_MODEL_UNAVAILABLE', ...)` → 기존 `SANTA_*` → exit 2 매핑
    (신규 exit code 0건)
  - `PATH` 조회는 `process.env.PATH`를 분해해 `fs.existsSync`로 확인한다(Windows는
    `PATHEXT` 확장자를 함께 시도). 외부 프로세스를 띄우지 않는다 — `record`는 라운드마다
    2회 도는 경로다
  - 메시지는 `SANTA_LANE_MISMATCH`와 같은 형식: 무엇이 어긋났는지 · 라운드가 열린 채라
    재기록 가능하다는 것 · 처방(실제로 실행한 모델을 적을 것)
  - `anthropic`·`unknown`은 대조 대상이 아니다. Claude fallback은 정상 입력이고 unknown은
    DD3이 이미 degraded로 처리한다 — 여기서 또 막으면 미등재 모델이 라운드를 아예 못 열게
    되어 처방이 "1줄 PR"에서 "루프 중단"으로 바뀐다
- **Mirror**: `cli.js:341-357`
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js`

### Task 5: `santa-loop.md` — Step 3 · Step 5.5 · Output · Notes

- **Action**: 공유 표면이므로 **P2 절만** 편집한다(UI15). 편집 지점은 넷이다.
  1. **Step 3 Reviewer B의 Claude fallback 문단**(`:420-421`) — 현재 "Log a warning"에서
     끝나는 자리에, 그 경고가 이제 **봉인 verdict를 바꾼다**는 사실 한 문장을 잇는다.
     여기서 무엇을 하라는 지시는 늘지 않는다 — 판정은 봉인 층이 한다
  2. **Step 5.5** — `SEAL_VERDICT` 분기를 3갈래로 넓힌다. `degraded`를 **먼저** 검사한다
     (`!= converged` 절이 앞서면 degraded가 divergent 메시지로 흡수된다). 새 분기가 하는
     일은 넷이다: (a) `SEAL_JSON`에서 `degradeAck`·`degradeReason`을 기존 파싱 관용구
     그대로 꺼내고, (b) ack가 없으면 `verdict='degraded'`와 reason을 찍고 exit 1로
     **push를 막고**, (c) 그 자리에서 `command -v codex`와 `MCCP_CODEX_DISABLED`를 읽어
     의도적 비활성과 미가용을 구분해 설명하되 그 두 줄이 **운영자 안내이지 봉인되는
     주장이 아님**을 주석으로 명시하며(DD7), (d) ack가 있으면 push를 진행하되
     "ack는 push를 열 뿐 verdict를 재작성하지 않는다"를 함께 찍는다(DD5)
  3. **Output 블록** — `SANTA VERDICT` 줄에 `degraded (acked)` 표기를 더하고 Reviewer B
     줄이 모델 계열을 함께 적게 한다
  4. **Notes** — 레인/터미네이터 항목과 같은 형식으로 degrade 항목 1개. 무엇이 봉인되는지,
     ack가 verdict를 바꾸지 않는다는 것, DD6의 천장을 한 문단으로
- **Mirror**: `plugins/mccp/commands/santa-loop.md:735-748`(Step 5.5의 2축 분기) ·
  M1/M2가 같은 파일에 쓴 절의 주석 밀도
- **Validate**: Task 6의 커맨드 본문 구조 test + Task 7 실측

### Task 6: 회귀 test 3파일

- **Action**: 기존 단언은 **지우지 않고** M3 블록을 추가한다(UI17).
  1. `santa-lanes.test.js`(소유권 표가 degrade 강등 회귀를 이 파일에 배정)
     - `familyOf`: 4계열 대표값 · 대소문자 · 공백 · 비문자열 · 빈 문자열 · 미등재 모델
     - `parseDegradeGate` / `parseDegradeAck`: 미설정 · 열거 밖 · 짧은 사유 거부 ·
       유효 사유 통과
     - `diversityFrom`: 이종 2계열(degraded=false) · 동일 계열 2인(same_family) ·
       unknown 포함(unknown_model, **same_family보다 우선**) · 라운드 0건 · legacy 투영
       (`model` 부재)
     - `deriveVerdict`: NICE + 이종 → converged · NICE + 동일 → degraded ·
       NAUGHTY + 동일 → **divergent**(우선순위 DD1) · distinct id 1 + 이종 → divergent ·
       `MCCP_SANTA_DEGRADE_GATE=off` + 동일 → converged
     - CLI `record`: 미설치 CLI 계열 선언 → exit 2 `SANTA_MODEL_UNAVAILABLE`, 라운드가
       열린 채 남는지 · anthropic/unknown은 통과
  2. `santa-loop-cap.test.js` — `model-diversity.js`를 모듈 열거 · `RECEIPT_FREE` ·
     require allowlist(내부 `./model-diversity`, 외부 추가 0건) 3목록에 **한 줄씩** 등재하고
     근거를 주석 한 문단으로. 단언 삭제 0건
  3. `santa-review-gate.test.js` — receipt 5필드 present-only 검증 · 열거 밖 reason 거부 ·
     `ack` 단독(사유 부재) 거부 · **DD2 사영 회귀**: degraded 봉인이 낸 receipt에서
     `review_verdict === 'divergent'`이고 `santa_model_degraded === true`가 함께 읽히며
     proof의 `verification_verdict`에 `degraded`가 **없는지**
- **Mirror**: 기존 3파일의 fixture 조립 방식 · `santa-loop-cap.test.js:1063-1134`
- **Validate**: 아래 Validation 1~2

### Task 7: 실측 — 게이트 경로 1회 완주

- **Action**: 실제 `/mccp:santa-loop` 실행 1회로 다음을 관측하고 증거를 노트에 반입한다.
  이 머신에는 `codex`가 설치돼 있으므로 **두 방향 모두** 관측 가능하다.
  1. Reviewer B를 Claude fallback으로 돌린 실행에서 `seal` stdout의 `verdict`가
     `degraded`이고 `degradeReason=same_family`이며 **push가 일어나지 않음**
  2. 같은 원장에 `MCCP_SANTA_DEGRADE_ACK="<사유>"`를 주면 push가 진행되고 receipt는
     여전히 `santa_model_degraded=true`를 갖는지 — 그리고 `review_verdict`가 `divergent`인지
  3. Reviewer B를 실제 `codex`로 돌린 실행에서 `degraded=false`이고 `verdict=converged`
  4. `MCCP_SANTA_DEGRADE_GATE=off`가 verdict를 `converged`로 되돌리면서도
     `santa_model_degraded=true`를 **여전히 stamp**하는지(DD4)
  5. 미설치 CLI 계열(`gemini-2.5-pro`)을 `record --model`에 넣으면 exit 2로 거부되는지
- **Mirror**: M2 Task 6(probe 실측 + 증거 반입) · santa-adjudication M3 Task 8
- **Validate**: 노트 `.claude/notes/santa-evidence-diversity-m3.md`에 위 5건의 실제 출력

### Task 8: 문서 4면 + PRD + 소유권 + version

- **Action**:
  1. `docs/ENVIRONMENT.md` §11 — `MCCP_SANTA_DEGRADE_GATE`(default·fail-open 방향·비대칭
     경고·`off`가 관측은 끄지 않는다는 사실) · `MCCP_SANTA_DEGRADE_ACK`(strict 사유 요건 ·
     verdict 미재작성 · 상주 설정 시의 의미). 기존 santa 토글 5개와 같은 밀도로
  2. `docs/santa-loop/ownership.md` — 소유권 표에 `model-diversity.js` P2 행 추가(교집합이
     비어 있음을 유지) · P2 M3 export 계약 표 · "P2 M3이 연 P0 파일과 근거" 표
     (`seal.js`·`cli.js`·`receipt/write.js`·`receipt/schema.js`·`commands/santa-loop.md`와
     각각 열지 **않은** 경계) · `gate.js`를 열지 않은 근거
  3. `.claude/prds/santa-evidence-diversity.prd.md` — Milestone 3 status `complete` + Plan
     링크 · Open Question "degraded 판정의 하류 취급"을 해소로 표시(막는 것은 push이고
     승인은 audited env이며 verdict는 재작성되지 않는다) · Open Question "`off` 모드의 UI3
     미충족"에 DD9의 결정을 반영(M3이 넓히지 않으므로 남은 후보는 신규 milestone)
  4. `CHANGELOG.md` `## [1.30.0]` + `currently` 노트 · `plugin.json` · `html.js` page-foot ·
     `markdown.js` derived 줄 **4면 동시** 갱신. **minor인 이유는 M3이 PRD의 마지막
     milestone이기 때문**(3.7 — PRD 전체 완료). 현재 branch가 `1.29.1`, origin/main이
     `1.29.0`이므로 목표는 `1.30.0`이되, 3.7의 두 시점(base 머지 해소 직후 · `/mccp:pr`
     진입 직전)에 **재계산**한다
- **Mirror**: CLAUDE.md 3.7 체크리스트 · M2 Task 7
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 1. P2 회귀 + 모듈 가드
node --test plugins/mccp/scripts/lib/tests/santa-lanes.test.js \
            plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js

# 2. santa 전량 (기존 단언 무회귀) + receipt 표면
node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js \
            plugins/mccp/scripts/lib/tests/santa-gate.test.js \
            plugins/mccp/scripts/lib/tests/santa-seal.test.js \
            plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js

# 3. receipt 계층 전반 — DD2가 주장하는 "어휘 무접촉"의 기계적 확인
node --test plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js
grep -n "REVIEW_VERDICT_VALUES" plugins/mccp/scripts/lib/review-verdict.js   # degraded 부재 확인

# 4. version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 5. CLI 표면 — 미설치 CLI 계열 선언 거부
node plugins/mccp/scripts/lib/santa/cli.js record --decision x --round 0 \
     --id B --model gemini-2.5-pro --reviewer-file /dev/null --lane bundled ; echo "expect 2, got $?"

# 6. 소유권 표에 신규 모듈이 등재됐는지
grep -c 'model-diversity.js' docs/santa-loop/ownership.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| codex 미설치 머신에서 매 실행이 degraded라 ack가 상주 설정이 되어 축이 장식화 | High | ack는 verdict를 재작성하지 않으므로(DD5) degraded 비율이 계속 세어지고 사유가 매 receipt에 봉인된다. 상주 ack 아래에서도 "이 머신에 codex를 설치할 이유"의 실측이 남는다 |
| `familyOf` 카탈로그 미등재 모델이 정당한 이종 실행을 degraded로 만든다 | Medium | fail-closed는 의도다(DD3). 처방이 게이트 완화가 아니라 카탈로그 1줄 추가라 비용이 낮고, Step 5.5 메시지가 그 처방을 직접 지시한다 |
| `--model`이 여전히 선언이라 위조 가능 | Medium | PATH 재도출이 "설치되지 않은 CLI를 참칭"하는 경로만 막는다는 천장을 DD6이 명시한다. M1이 `--lane`에 대해 같은 천장을 적었고 검증은 결과 분포에 맡긴다 |
| `deriveVerdict` 값 집합 변경이 다른 소비처를 깬다 | Medium | 소비처는 `seal()` 내부와 Step 5.5 둘뿐이고 receipt·proof는 사영을 거친다(DD2). Validation 3이 receipt 어휘 무접촉을 기계적으로 확인한다 |
| `seal.js`를 여는 것이 P0 경계를 침범한다 | Medium | `deriveVerdict`는 동결 표에 없고 M1(P2)·santa-adjudication M3(P1)이 같은 파일을 프로토콜 2의 추가로 연 전례가 있다. 열지 않은 경계를 소유권 문서에 표로 남긴다(Task 8) |
| 봉인 시점 PATH 관측이 라운드 시점과 어긋난다 | Medium | 그 관측은 receipt에 봉인하지 않고 Step 5.5 안내 메시지로만 쓴다(DD7). 봉인되는 reason은 projection 파생 2값뿐이다 |
| 블라인드 레인 `off`의 미충족이 여전히 무주인 | Medium | DD9가 거절을 근거와 함께 기록하고 PRD Open Question의 후보를 신규 milestone으로 좁힌다. 조용히 남기지 않는다 |

## Acceptance

- [ ] Task 1~8 완료
- [ ] Validation 1~6 통과
- [ ] 기존 santa test 단언이 **하나도 삭제되지 않음**(넓히기만)
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과는 경로 작동과 다르다) —
      Task 7의 5건이 그 산출물이고, 최소 조건은 **실제 `/mccp:santa-loop` 실행에서 Claude
      fallback 라운드가 `verdict=degraded`로 봉인되어 push가 일어나지 않고, 그 receipt가
      `review_verdict='divergent'`와 `meta.santa_model_degraded=true`를 함께 갖는 것**
- [ ] PRD Milestone 3 status 갱신 + Open Question 1건 해소 · 1건 소유자 확정
- [ ] version 4면 동기 (`/mccp:pr` 진입 직전 CLAUDE.md 3.7 재계산 포함 — PRD 종료이므로
      minor 자리)

## Multi-Perspective Fan-out

skipped — 세션 정책이 사용자 요청 없는 Workflow 호출을 금지한다. Phase 2.5의 문서화된
fail-open 경로대로 인라인 Pattern Grounding(위 표)을 근거로 삼았고, plan은 차단되지 않는다.

## Design Critique

- 트리거: detector positive (`design_signal=true`). signal 파일은 `renderer/html.js` ·
  `renderer/markdown.js` — 본 plan이 그 둘에 가하는 변경은 **version 리터럴 1개**
  (`v1.29.1` → `v1.30.0`)이고 rendered surface의 구조·색·마크다운 마커·항목 수는 무변경이다.
- 라운드: 1 / cap 2 · verdict: **CONVERGED**
- 4 Output Constraints 대조:

| Constraint | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth 3 이하) | PASS | footer 문자열 교체로 heading을 추가·심화하지 않는다 |
| 강조색 화면당 1개 | PASS | accent/highlight 토큰 미접촉 |
| raw markdown marker 금지 | PASS | 신규 마커 0건. 기존 마크다운 출력 소스는 선재·무변경 |
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
