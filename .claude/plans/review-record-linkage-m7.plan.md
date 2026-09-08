# Plan: review-record-linkage M7 — live-firing-execution

**Source PRD**: `.claude/prds/review-record-linkage.prd.md`
**Selected Milestone**: M7 — live-firing-execution
**Decision slug**: `review-record-linkage-m7` (브랜치명과 일치 — 실측: `receipt/cli.js derive-decision --command mccp:pr --args ""` → `review-record-linkage-m7`. `plugins/mccp/commands/pr.md:923`의 `SHIP_PLAN_PATH` 기본값이 `.claude/plans/${DECISION_SLUG}.plan.md`이므로 이 파일명도 같아야 한다)
**Complexity**: Small

## Summary

M1~M4가 링크 배선을 구현했고 M5가 그 배선이 발화하지 못하는 원인(판본 격차)을 말하는 입을
만들었다. M7은 **발화시킨다** — `--plugin-dir` 아래에서 체인을 완주해 ship receipt가
`meta.review_record_path`·`meta.plan_review_expected`를 실제로 봉인하게 한다.

M5의 인계는 ship만 그 경로에서 돌면 된다고 읽혔다. **그것으로는 부족하다.** 링크의
발원지는 상류 `mccp-plan-codex` receipt이고, 그 필드를 찍는 것은 `commands/plan.md`이며,
캐시 판본에는 그 줄이 없다(아래 F3). 그래서 M7은 **plan 게이트부터** 워크트리 판본에서
돈다. 코드 기여는 하나 — 네 검사를 산문이 아니라 종료코드로 만드는 강제 뷰다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | M5 보고서 인계 절의 금지 사항을 지키면서 0~4단계를 그대로 수행한다 | direction |
| UI2 | 브랜치를 `review-record-linkage-m7`로 만들고 그 이름이 ship receipt 슬러그가 되게 한다 | constraint |
| UI3 | M6가 표에서 앞서지만 마일스톤은 M7을 고른다 | direction |
| UI4 | 산출 plan 경로는 `.claude/plans/review-record-linkage-m7.plan.md` 이다 | constraint |
| UI5 | M5 브랜치의 코드는 이 사이클 안에서 함께 머지하고 별도 ship을 시도하지 않는다 | constraint |
| UI6 | `/mccp:pr`을 M5 브랜치에서 다시 시도하지 않는다 | exclusion |
| UI7 | ship은 `claude --plugin-dir <worktree>/plugins/mccp` 세션에서 완주한다 | constraint |
| UI8 | 완주 전후로 `installed_plugins.json`의 sha256 불변을 확인한다 | constraint |
| UI9 | plan 게이트도 그 세션으로 이연한다. 이 세션에서는 발화시키지 않는다 | constraint |
| UI10 | plan 작성 세션에서 멀티관점 fan-out을 돌리지 않는다 | exclusion |
| UI11 | 자식 브랜치는 `plugin.json` version을 선언하지 않는다 | exclusion |
| UI12 | acceptance는 producer가 아니라 산출된 실값이다 | constraint |
| UI13 | 과거 코퍼스는 소급하지 않는다. 재봉인도 사이드카도 만들지 않는다 | exclusion |
| UI14 | 게이트 리뷰는 1라운드가 기본이고 이후에는 triage하고 진행한다 | direction |
| UI15 | 리뷰 finding은 HIGH와 CRITICAL만 흡수하고 나머지는 backlog로 이연한다 | direction |

## 관측된 사실 (전부 이 워크트리에서 재현, 2026-09-08)

| # | 사실 | 재현 |
|---|---|---|
| F1 | 활성 설치는 `1.33.6` @ `647dfecb`이고 HEAD보다 184커밋 뒤다 | `node plugins/mccp/scripts/lib/install-skew.js` → `{"state":"behind","commits_behind":184,"plugin_dir_override":false}` |
| F2 | 라이브 링크가 전부 0이고 분모가 `null`이다 | `node plugins/mccp/scripts/lib/linkage-audit.js --json` → `post_baseline.linkage.{receipt_to_review,review_to_receipt,bidirectional}=0`, `denominator=null`, `ship_eligibility.by_reason={producer_absent_in_build:88}` |
| F3 | **캐시 판본의 `plan.md`에는 링크를 찍는 줄이 없다** | `grep -c review-record-path ~/.claude/plugins/cache/mccp/mccp/1.33.6/commands/plan.md` → **0**. 워크트리는 `plugins/mccp/commands/plan.md:2890`에 실재 |
| F4 | **캐시 판본의 `pr.md`에는 back-patch 블록이 없다** | 같은 캐시의 `commands/pr.md`에 `link-receipt`·`SEALED_RECORD` **0건**. 워크트리는 `plugins/mccp/commands/pr.md:1049-1085` |
| F5 | ship의 링크 필드는 **상류 plan receipt의 carry-forward가 유일 경로**다 | `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:308-318` — `upstream.meta.review_record_path`를 읽어 `--review-record-path`로 전달. 재생성 분기 없음 |
| F6 | `plan_review_expected`는 상류의 `resolution.review_source`에서 파생된다 | 같은 파일 `:321-330` — `multi-agent`/`hybrid`면 `true`, `codex`면 `false`, 그 외는 **미봉인**(undecidable) |
| F7 | 이 워크트리에 plan·implement receipt가 하나도 없다 | `ls .claude/receipts/` → `mccp-pr-codex` 단독. working-tree only라 §3.12대로 소실됐다 |
| F8 | 이 슬러그의 라운드 예산은 미소진이다 | `.claude/state/review-rounds/`에 `*__review-record-linkage-m7.json` 부재. `.claude/settings.json` `MCCP_GATE_ROUND_CAP=1` |
| F9 | 라운드 캡은 산문이 아니라 기계다 | `plugins/mccp/scripts/lib/plan-review/cli.js:334-359` — `emit-workflow-args`가 원장을 읽어 `decideRound`로 판정하고 초과 시 refuse |
| F10 | ship plan 경로는 슬러그에서 파생된다 | `plugins/mccp/commands/pr.md:923` `SHIP_PLAN_PATH="${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}"` |
| F11 | 레코드의 `receipt_hash`는 생성 시 `null`이고 ship이 back-patch한다 | `plugins/mccp/scripts/lib/plan-review/record.js:395` `receipt_hash: null` · `plugins/mccp/commands/pr.md:1063-1066` `link-receipt --receipt-hash` |
| F12 | 라이브 acceptance 절차는 이미 문서가 소유한다 | `docs/dogfood-install.md:95-129` (M5 Task 9 산출) |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 강제 뷰의 종료코드 | `plugins/mccp/scripts/lib/linkage-audit.js:112-118` | `CHECK_EXIT_CODES`를 `STATE_EXIT_CODES`와 **분리**한다 — 다른 질문은 다른 표. 같은 표를 나눠 쓰면 한쪽 의미 변경이 다른 쪽으로 조용히 번진다 |
| 3값 자격 판정 | `plugins/mccp/scripts/lib/plan-review/linkage-defs.js:186-233` | `eligible`/`not_eligible`/`undecidable`. 모르는 것을 `0`으로 접지 않는다 |
| 판정 오라클의 총함수성 | `plugins/mccp/scripts/lib/install-skew.js` | 4상태 · 닫힌 사유 enum · 어떤 입력에도 throw하지 않고 sentinel을 돌려준다 |
| 배선 부재를 보는 정적 단언 | `plugins/mccp/scripts/lib/tests/install-skew-wiring.test.js` | 명령 본문을 파일로 스캔해 그 호출 줄이 **실재하는지** 단언 |
| 절차의 소유권 | `docs/dogfood-install.md:95-129` | acceptance 절차는 문서가 소유하고 plan은 인용만 한다 |
| 사유 enum화 | `plugins/mccp/scripts/lib/plan-review/cli.js#errCode` | `err.message`를 싣지 않고 원인 enum만 싣는다 (경로 유출 방지) |

## Files to Change

> 경로는 전부 repo-root 상대 full 경로다 (§1.2 — dedupe matcher가 리터럴 매칭한다).

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/linkage-audit.js` | UPDATE | `--check-live-linkage` 강제 뷰 — 네 검사를 하나의 종료코드로 접는다 (UI12) |
| `plugins/mccp/scripts/lib/tests/linkage-audit.test.js` | UPDATE | 강제 뷰의 4상태 · 종료코드 · "모름을 위반으로 접지 않음" 회귀 |
| `docs/dogfood-install.md` | UPDATE | **plan 게이트도 같은 경로여야 한다**는 정정 (F3·F5 — 현재 문서는 ship만 말한다) |
| `docs/review-record-linkage/frozen-baseline.md` | UPDATE | 라이브 절에 M7 실값. **동결 블록은 바이트 불변**(M5 DD5) |
| `.claude/prds/review-record-linkage.prd.md` | UPDATE | M7 행 status + Plan 셀 |
| `.claude/plans/review-record-linkage-m7.plan.md` | UPDATE | 이 파일. 게이트가 리뷰 기록을 주입한다 |
| `.claude/PRPs/reports/review-record-linkage-m7-report.md` | CREATE | 구현 보고 (라이브 실값을 명령·출력째로) |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래 누적 (UI11 — 번호 미선언) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | §3.14 이연 채널 |

## Design Decisions

### DD1 — plan 게이트도 `--plugin-dir` 아래에서 돈다 (M5 인계의 정정)

M5 보고서 인계 3단계는 "ship은 `--plugin-dir` 세션에서 완주한다"고만 적었다. 그 문장대로
하면 네 검사 중 **1·2·3이 구조적으로 불가능**하다.

근거는 F3·F5다. ship receipt의 `meta.review_record_path`는 `finalize-receipt.js:308-318`이
상류 plan receipt의 같은 필드를 **carry-forward하는 것이 유일 경로**이고, 그 필드를 찍는
것은 `plugins/mccp/commands/plan.md:2890`인데 캐시 `1.33.6`의 `plan.md`에는 그 줄이 **0건**이다. 즉
plan 게이트가 캐시 판본에서 돌면 상류에 실을 값이 없고, ship이 아무리 새 판본이어도
carry-forward할 것이 없다. 같은 이유로 `pr.md`의 back-patch(F4)도 `SEALED_RECORD`가 비어
"nothing to back-patch"로 접힌다 — 검사 2도 불가.

**되돌릴 수 없는 대가가 붙는다.** 라운드 캡이 1이고(F8) 캡은 기계 강제이므로(F9), 캐시
판본에서 패널을 한 번 돌리면 그 슬러그의 예산이 소진돼 워크트리 판본 재실행이
`round-cap-reached`로 거부된다. 그래서 순서는 선택이 아니라 **제약**이다.

사용자 판정(2026-09-08, UI9): plan 게이트를 `--plugin-dir` 세션으로 이연한다. 이 plan
artifact는 게이트 없이 작성되고, 그 세션의 `/mccp:plan`이 Phase 1~4를 다시 돌며 이 본문을
확인한 뒤 R1을 발화한다.

### DD2 — 코드 기여는 하나뿐이고, 그것은 acceptance를 기계로 바꾸는 것이다

M5 Task 6의 acceptance는 "네 값을 보고서에 명령과 출력째로 싣는다"였다. 그것은 **1회성
전사(transcript)**이고, 나중에 누구도 재실행으로 반증할 수 없다. UI12가 요구하는 "산출된
실값"은 값이 있다는 뜻이지 값이 **재검증 가능하다**는 뜻은 아니었고, 그 틈이 이 PRD의
지배적 실패 모드가 반복해 들어온 자리다.

`--check-live-linkage`는 네 검사를 하나의 종료코드로 접는다. 새 정의를 만들지 않는다 —
검사 3·4는 이미 `--json`이 내는 값이고, 1·2는 receipt와 레코드를 각각 한 번 읽는 것이다.
새 아키텍처가 아니라 **이미 손에 든 값을 종료코드로 바꾸는 일**이다(이 PRD가 M3에서 링크에
대해 쓴 것과 같은 문장).

**그 외의 코드는 건드리지 않는다.** M7은 실행 마일스톤이고, 실행 중에 발견되는 결함은
§3.14대로 HIGH/CRITICAL만 흡수하고 나머지는 backlog로 간다(UI15).

### DD3 — 강제 뷰는 "모름"을 "위반"으로 접지 않는다

`--check-round-structure`가 이미 그 사다리를 갖는다(`CHECK_EXIT_CODES`, `linkage-audit.js:112-118`).
`--check-live-linkage`는 **자기 표**를 갖되 같은 원리를 따른다.

| state | exit | 뜻 |
|---|---|---|
| `ok` | 0 | 네 검사 전부 충족 |
| `violations` | 1 | 지목한 ship이 실재하는데 검사 중 하나가 미충족 — 이 도구의 본래 목적 |
| `degraded` | 2 | 판정 대상을 다 읽지 못했다 (레코드 판독 불가 · receipt 파손). 통과시키면 fail-open |
| `unresolved` | 3 | 지목한 decision의 ship receipt가 아예 없다 — 경계 자체가 성립하지 않는다 |

`unresolved`를 `violations`로 접으면 "아직 ship하지 않았다"와 "ship했는데 링크가 없다"가
같은 종료코드가 되어, 부트스트랩 상태를 결함으로 보고한다. 그 구분이 M5 Task 6의 절반이었고
여기서도 같다.

### DD4 — 검사 2의 비교는 문자열 동등이지 존재가 아니다

`linkage-audit`의 `join_note`가 이미 그 계약을 적었다 — bidirectional은 레코드의
`measurement.receipt_hash`가 그 receipt의 `receipt_hash`와 **같아야** 성립하고, 이전 ship이
남긴 stale hash는 세지 않는다(`stale_receipt_hash`가 따로 센다). 강제 뷰는 그 규칙을
재정의하지 않고 **호출**한다. 정의는 한 곳이 소유한다(M1의 결정 3).

### DD5 — M5 status는 `complete`로 유지한다 (M5 보고서의 열린 질문 종결)

M5 보고서는 "PRD의 M5는 `complete`인데 이 코드는 아직 머지되지 않았다"를 열린 질문으로
남기고 (i) 유지 / (ii) `in-progress`로 되돌림 중 하나를 다음 세션이 정하라고 했다.

**(i)을 택한다.** 근거는 UI5다 — M5 코드는 이 사이클의 PR에 함께 머지되므로, 이 PRD에서
`complete`가 뜻해 온 "ship됨"이 M7 머지 시점에 참이 된다. 되돌렸다가 같은 PR에서 다시
올리는 것은 표를 두 번 흔들 뿐 정보를 더하지 않는다. 다만 **M7이 머지되지 못하면 그 표기는
다시 앞서 있게 되므로**, 그 경우 M7 보고서가 그 사실을 적는다.

### DD6 — 실행이 막히면 라운드를 늘리지 않는다

`--plugin-dir` 아래에서 워크트리 본문이 처음 실행된다. 미지의 정지가 나올 수 있다.
§3.16대로 그때의 정답은 재리뷰가 아니라 **정지 지점을 기록하고 triage**다. plan 본문을
고쳐 게이트를 다시 돌리는 것은 기본 선택지가 아니며, 캡이 1이라 기계도 그것을 거부한다(F9).

## Tasks

### Task 0: 실행 판본 preflight (게이트 진입 **전**에 돈다)

- **Action**: `--plugin-dir` 세션에서 `/mccp:plan` 진입 **전에** 다음을 확인한다.
  ```bash
  node plugins/mccp/scripts/lib/install-skew.js
  sha256sum ~/.claude/plugins/installed_plugins.json
  ```
  `plugin_dir_override`가 `true`이고 `state`가 `current`여야 한다. `false`거나 `behind`면
  그 세션은 여전히 캐시 본문을 돌고 있으므로 **게이트에 진입하지 않는다** — 진입하면
  DD1대로 라운드 예산만 소진된다.
- **Mirror**: `docs/dogfood-install.md:118-129` ("지금 어느 판본이 실행 중인지는 추측하지 말고 물어라")
- **Validate**: 두 출력을 보고서에 원문으로 싣는다. 완주 전 sha256이
  `26925fd8b72568ea12712e023985445c97567dff129c1f6bbdd8e4a21cab16fc`와 일치

### Task 1: 상류 앵커 검증 (fail-closed — 미충족이면 즉시 정지)

- **Action**: plan 게이트가 발행한 `.claude/receipts/mccp-plan-codex/review-record-linkage-m7.json`이
  아래 셋을 갖는지 확인한다. 하나라도 없으면 구현을 계속하지 않고 정지한다 — 없는 앵커
  위에서 하는 나머지 작업은 전부 낭비다(D3 (b)의 재현).
  1. `meta.plan_path == ".claude/plans/review-record-linkage-m7.plan.md"` (F5의 매칭 키)
  2. `meta.review_record_path == ".claude/reviews/plan-review-review-record-linkage-m7.md"` (F3)
  3. `resolution.review_source == "multi-agent"` (F6 — `plan_review_expected=true`의 근거)
- **Mirror**: `finalize-receipt.js:258-335`의 매칭 규칙을 그대로 읽는다. 특히 **"정확히 1건"** —
  같은 `meta.plan_path`를 선언한 plan receipt가 둘이면 `link_anchor_unresolved`가 되어 링크가
  통째로 미봉인된다. F7대로 현재 그 디렉토리는 비어 있으므로 1건이 기대값이다
- **Validate**: 세 값을 출력으로 싣는다. 2번이 없으면 그 세션이 캐시 본문을 돌았다는 뜻이므로
  Task 0으로 돌아간다

### Task 2: `--check-live-linkage` 강제 뷰

- **Action**: `plugins/mccp/scripts/lib/linkage-audit.js`에 서브커맨드를 더한다.
  ```
  node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage [--decision <slug>] [--json]
  ```
  `--decision`을 주면 그 ship 하나를, 안 주면 HEAD 트리 전체를 판정한다. 검사 4종:
  1. 지목한 `mccp-pr-codex` receipt가 `meta.review_record_path`를 봉인
  2. 그 경로의 레코드가 `measurement.receipt_hash`로 **그 receipt의 `receipt_hash`와 동등**(DD4)
  3. `post_baseline.linkage.bidirectional >= 1`
  4. `post_baseline.linkage.denominator != null`
  종료코드는 DD3의 자기 표를 쓴다. `STATE_EXIT_CODES`·`CHECK_EXIT_CODES`를 재사용하지 않는다.
- **Mirror**: `checkRoundStructure`(`linkage-audit.js:767-`)의 구조 — 순수 함수가 상태 객체를
  돌려주고 CLI가 그 `state`를 종료코드로 사상한다. 사유는 enum, 경로는 싣지 않는다
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/linkage-audit.test.js` — 4상태 각각
  fixture로 재현. 특히 **레코드 판독 불가 → `degraded`(2)이지 `violations`(1)가 아님**과
  **ship 부재 → `unresolved`(3)** 를 단언

### Task 3: 문서 정정 — plan 게이트 축을 `dogfood-install.md`에 더한다

- **Action**: `docs/dogfood-install.md`의 "배선 마일스톤의 라이브 acceptance" 절은 현재
  ship만 말한다. DD1의 근거(F3·F5)를 한 문단으로 더한다 — "**링크를 봉인하는 마일스톤은
  plan 게이트부터** 이 경로여야 한다. 링크의 발원지가 상류 plan receipt이고 그 필드를 찍는
  것은 `commands/plan.md`이기 때문이다. ship만 이 경로에서 돌리면 carry-forward할 값이 없다."
  라운드 캡 때문에 순서를 되돌릴 수 없다는 사실도 함께 적는다(F8·F9).
- **Mirror**: 같은 문서가 이미 쓰는 형식 — 사실 → 결과 → 확인 명령
- **Validate**: 문서가 인용하는 file:line이 실재 (`plugins/mccp/commands/plan.md:2890` · `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js:308`)

### Task 4: 라이브 실값 산출 (이 마일스톤의 유일한 실측 근거)

> 이 Task는 `prp-implement` 안이 아니라 그 뒤의 `/mccp:pr`에서 일어난다. 여기 적는 이유는
> M5 Task 6과 같다 — acceptance의 소유자가 plan이어야 하기 때문이다.

- **Action**: `--plugin-dir` 세션에서 `/mccp:prp-commit` → `/mccp:pr`을 완주한다. 산출:
  1. `mccp-pr-codex/review-record-linkage-m7.json`이 `meta.review_record_path` 봉인 (F5 carry-forward)
  2. `.claude/reviews/plan-review-review-record-linkage-m7.md`가 `measurement.receipt_hash`로
     그 receipt를 되짚음 (F11 back-patch)
  3. `linkage.bidirectional >= 1`
  4. `meta.plan_review_expected`가 실려 `denominator != null` (F6)
  - **1~2가 되고 3~4가 안 되면 그 이유를 보고서에 적는다.** 부트스트랩 상태와 결함을
    구분하는 것이 이 Task의 절반이다 (M5 Task 6에서 그대로 상속).
- **Validate**: `node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision review-record-linkage-m7`
  이 **exit 0**. 실행 후 `installed_plugins.json` sha256이 Task 0의 값과 동일

### Task 5: 산출물 — PRD · frozen-baseline · CHANGELOG · 보고서

- **Action**:
  - `.claude/prds/review-record-linkage.prd.md` M7 행 status를 갱신하고 Plan 셀에 이 파일을 건다.
    M5 행은 DD5대로 `complete` 유지 — 되돌리지 않는다.
  - `docs/review-record-linkage/frozen-baseline.md`의 **라이브 절에만** M7 실값을 더한다.
    **동결 블록은 바이트 불변**이고 그것이 계약이다(M5 DD5).
  - `CHANGELOG.md`의 `## [Unreleased]` 아래 누적. `plugin.json` version은 선언하지 않는다(UI11).
  - `.claude/PRPs/reports/review-record-linkage-m7-report.md` — 네 값을 명령·출력째로 싣고,
    **어느 경로에서 완주했는지 명시**한다(`docs/dogfood-install.md:113`의 의무). M5 코드가
    같은 PR에 실린다는 사실(UI5)과 M5 status 판정(DD5)을 함께 적는다.
- **Validate**: `--frozen-only` 출력이 문서의 동결 블록과 바이트 동일(0줄 diff) ·
  `node scripts/version-declaration-guard.js` exit 0

## Validation

```bash
# 1. 실행 판본 (게이트 진입 전 — Task 0)
node plugins/mccp/scripts/lib/install-skew.js
sha256sum ~/.claude/plugins/installed_plugins.json

# 2. 상류 앵커 (Task 1)
node -e 'const r=require("./.claude/receipts/mccp-plan-codex/review-record-linkage-m7.json");
console.log(JSON.stringify({plan_path:r.meta.plan_path,review_record_path:r.meta.review_record_path,
review_source:r.resolution.review_source},null,2))'

# 3. 단위 + 회귀 (Task 2)
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/linkage-audit.test.js \
  plugins/mccp/scripts/lib/tests/linkage-defs.test.js \
  plugins/mccp/scripts/lib/tests/install-skew.test.js \
  plugins/mccp/scripts/lib/tests/install-skew-wiring.test.js

# 4. 동결 블록 불변 (Task 5)
node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only

# 5. 라이브 실값 — 이 사이클의 acceptance (Task 4)
node plugins/mccp/scripts/lib/linkage-audit.js --json
node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision review-record-linkage-m7

# 6. version 미선언 (UI11)
node scripts/version-declaration-guard.js

# 7. 머지가 파일을 조용히 지우지 않았는지 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **`--plugin-dir` 세션이 실제로는 캐시 본문을 돌아 라운드만 소진한다** — 이 마일스톤의 유일한 치명 실패 | 중 | Task 0을 게이트 진입 **전에** 강제한다. `plugin_dir_override=false`면 진입 금지. 캡은 기계라(F9) 소진 후 복구 경로가 없다 |
| 워크트리 본문이 처음 실행되며 미지의 정지가 난다 | **높음** | DD6 — 정지 지점을 보고서에 기록하고 §3.16대로 triage. 라운드를 늘리지 않는다 |
| 상류 plan receipt가 둘이 되어 `link_anchor_unresolved` | 낮음 | F7대로 현재 `mccp-plan-codex/`는 비어 있다. Task 1이 "정확히 1건"을 명시 확인 |
| back-patch가 push **전에** 일어나 ship이 HALT하면 레코드가 dangling으로 남는다 | 중 | `plugins/mccp/commands/pr.md:1052-1060`이 이미 그 잔여를 적었다 — `stale_receipt_hash`가 그 형태를 세고 재실행이 멱등이다. 되돌리려 hash를 재작성하지 않는다(§3.12) |
| M5 코드가 같은 PR에 실려 diff가 커지고 머지가 다른 브랜치 파일을 지운다 | 중 | Validation 7 (§3.5.1). 삭제 목록이 비어 있지 않으면 정지하고 조사 |
| 강제 뷰가 네 검사를 재정의해 `linkage-audit --json`과 갈린다 | 낮음 | DD4 — 정의는 호출하고 재정의하지 않는다. test가 두 경로의 값 일치를 단언 |
| M7이 머지되지 못해 PRD의 M5 `complete` 표기가 다시 앞선다 | 낮음 | DD5 — 그 경우 보고서가 그 사실을 적는다. 표를 두 번 흔들지 않는다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] **게이트를 `--plugin-dir` 아래에서 1회 완주**하고 `node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision review-record-linkage-m7`가 **exit 0**
- [ ] `mccp-plan-codex/review-record-linkage-m7.json`이 `meta.review_record_path`를 봉인 (Task 1)
- [ ] `mccp-pr-codex/review-record-linkage-m7.json`이 `meta.review_record_path` + `meta.plan_review_expected`를 봉인
- [ ] `installed_plugins.json` sha256이 완주 전후로 불변 (UI8)
- [ ] 보고서가 **어느 경로에서 완주했는지** 명시 (`docs/dogfood-install.md:113`)
- [ ] 1~2가 되고 3~4가 안 됐다면 그 이유가 보고서에 있다 (부트스트랩 vs 결함의 구분)

## External Research Provenance

- Source PRD: .claude/prds/review-record-linkage.prd.md
- References section sha256: 6285d0d8018061d14bd81f59fab68b7c3fcdd25580472eb34dd5b2f6449f5647
- Stamped at: 2026-09-08T02:00:10.261Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
