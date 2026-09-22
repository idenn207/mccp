# Plan: review-record-linkage M7 — live-firing-execution

**Source PRD**: `.claude/prds/review-record-linkage.prd.md`
**Selected Milestone**: M7 — live-firing-execution
**Decision slug**: `review-record-linkage-m7b` — **R2에서 정정됐다**. `-m7`은 3라운드를 소진해 `review-single-pass.js:45`의 `MAX_ROUND_CAP=3`상 어떤 캡 값으로도 다시 열리지 않으므로, 이 사이클은 신선한 슬러그 `-m7b`로 게이트를 돌았고 plan receipt가 거기에 봉인됐다. 브랜치도 `review-record-linkage-m7b`로 맞췄다(실측: `derive-decision --command mccp:pr --args ""` → `review-record-linkage-m7b`). **plan 파일명은 `-m7`로 남는다** — 봉인된 receipt의 `meta.plan_path`가 그 경로이고 `finalize-receipt.js:289-303`의 앵커는 문자열 동등으로 매칭하므로, 파일을 리네임하면 매칭이 0건이 되어 링크가 통째로 미봉인된다(측정됨). 슬러그와 파일명의 간극은 ship 때 `PR_PLAN_PATH`가 잇는다 — `plugins/mccp/commands/pr.md:928`이 "operator 채널"이라 명시한 그것이다. 아래 문단은 **진입 인자 규칙**으로 여전히 유효하다: **게이트 진입 인자가 이것을 정한다**. `mccp:plan`은 첫 non-flag 인자에서 슬러그를 뽑고(`receipt/decision.js:77-81`), `mccp:pr`은 브랜치에서 뽑는다. 그래서 이 게이트는 **plan 경로로** 호출한다 — `/mccp:plan .claude/plans/review-record-linkage-m7.plan.md`. PRD 경로로 부르면 슬러그가 `review-record-linkage`가 되어 F8·F13대로 막힌다. 실측: `derive-decision --command mccp:pr --args ""` → `review-record-linkage-m7`이고 `plugins/mccp/commands/pr.md:923`의 `SHIP_PLAN_PATH` 기본값이 `.claude/plans/${DECISION_SLUG}.plan.md`이므로 이 파일명도 같아야 한다
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
| UI2 | 브랜치 이름이 곧 ship receipt 슬러그가 되게 한다. **문자값은 `-m7b`로 정정**(사용자 판정 2026-09-08 · R2) — `-m7`의 예산이 종료적으로 소진돼 그 슬러그로 plan receipt를 얻을 경로가 없다. 지켜진 것은 *단일 정체성*이라는 제약이고 바뀐 것은 그 값이다 | constraint |
| UI3 | M6가 표에서 앞서지만 마일스톤은 M7을 고른다 | direction |
| UI4 | 산출 plan 경로는 `.claude/plans/review-record-linkage-m7.plan.md` 이다 — **유지**(R2). 봉인된 receipt의 `meta.plan_path`가 이 값이라 리네임은 앵커를 깬다. 슬러그와의 간극은 `PR_PLAN_PATH`가 잇는다 | constraint |
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
| UI16 | 사람이 필요한 답변과 검토는 fable 과 codex 의 이중 리뷰로 대체한다 (2026-09-22) | direction |

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
| F8 | **라운드 예산은 슬러그마다 갈리고, 셋 중 둘이 소진돼 있다** (R2 재측정 — 이 행의 `-m7: 0`은 낡았고 그것을 R2 패널이 세 관점에서 반증했다) | `review-rounds/cli.js status --gate mccp-plan-codex --decision <slug>` → `review-record-linkage` `rounds_so_far:3`(M3 사이클) · **`review-record-linkage-m7` `rounds_so_far:3`**(R0·R1·R1-retry, 2026-09-08) · `review-record-linkage-m7b` `rounds_so_far:1`(R2). `.claude/settings.json` `MCCP_GATE_ROUND_CAP=1`, `review-single-pass.js:45` `MAX_ROUND_CAP=3` |
| F9 | 라운드 캡은 산문이 아니라 기계다 | `plugins/mccp/scripts/lib/plan-review/cli.js:334-359` — `emit-workflow-args`가 원장을 읽어 `decideRound`로 판정하고 초과 시 refuse |
| F10 | ship plan 경로는 슬러그에서 파생된다 | `plugins/mccp/commands/pr.md:923` `SHIP_PLAN_PATH="${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}"` |
| F11 | 레코드의 `receipt_hash`는 생성 시 `null`이고 ship이 back-patch한다 | `plugins/mccp/scripts/lib/plan-review/record.js:395` `receipt_hash: null` · `plugins/mccp/commands/pr.md:1063-1066` `link-receipt --receipt-hash` |
| F12 | 라이브 acceptance 절차는 이미 문서가 소유한다 | `docs/dogfood-install.md:95-129` (M5 Task 9 산출) |
| F13 | **plan 게이트의 슬러그는 plan 파일명이 아니라 호출 인자가 정한다** | `derive-decision --command mccp:plan --args ".claude/prds/review-record-linkage.prd.md M7"` → **`review-record-linkage`**(` M7` 토큰은 버려진다). 같은 명령을 `--args ".claude/plans/review-record-linkage-m7.plan.md"`로 부르면 → `review-record-linkage-m7`. 규칙은 `receipt/decision.js:48-81` (`firstNonFlag` → `slugFromPlanPath`) |
| F14 | **원장이 이 워크트리까지 따라온 것은 tracked이기 때문이다** | `.gitignore:64`가 `.claude/state/review-rounds/`를 무시하지만 `mccp-plan-codex__review-record-linkage.json`은 그 규칙 이전에 커밋됐다(`c5ad75b`, M1 사이클) — tracked 파일에는 ignore가 적용되지 않는다. 같은 상태의 원장이 15건 tracked |
| F15 | **상류 앵커는 receipt 파일명이 아니라 `meta.plan_path` 문자열 동등으로 찾는다** | `finalize-receipt.js:281-303` — 전 `mccp-plan-codex` receipt를 훑어 `toRepoRelativePosix(meta.plan_path) === shipPlan`인 것을 모으고 **정확히 1건**이 아니면 `link_anchor_unresolved`. 슬러그는 이 매칭에 쓰이지 않는다 |
| F16 | **`install-skew.js`를 Bash에서 부르면 override를 볼 수 없다** | 그 모듈은 `env.CLAUDE_PLUGIN_ROOT`를 읽는데(`install-skew.js:281`) 그 변수는 Bash 툴 서브프로세스에 없다. 맨몸 실행 → `override:false · behind`, `CLAUDE_PLUGIN_ROOT="$PWD/plugins/mccp"`를 주면 → `current · override:true · 0 behind` |

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
| `.claude/PRPs/reports/review-record-linkage-m7-report.md` | UPDATE | 구현 보고 (라이브 실값을 명령·출력째로). **CREATE가 아니다** — 직전 사이클이 종료 보고로 이미 만들었고(`11b08ed`), L1 `C3_CREATE_EXISTS`가 그 사실을 잡았다 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래 누적 (UI11 — 번호 미선언) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | §3.14 이연 채널 |
| `docs/review-record-linkage/hsr-decisions.jsonl` | UPDATE | HSR 판정 기록 (DD11). plan 단계의 P0가 만들었으므로 CREATE가 아니다 |

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

**그 예산은 슬러그마다 갈리며, 그것이 DD7의 근거다.** 원장 키는 `<gate-id>__<decision-slug>`
이므로(`review-rounds/ledger.js:16`) "이 마일스톤의 예산"이라는 말은 어느 슬러그로 진입하는지가
정해진 뒤에만 뜻을 갖는다. 이 plan의 초판은 그것을 `review-record-linkage-m7`로 가정하고
그 파일의 부재만 확인했는데, 실제 진입 인자(PRD 경로)가 내는 슬러그는
`review-record-linkage`였고 그쪽은 이미 3라운드 소진 상태였다(F8·F13).

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
| `unresolved` | 3 | 지목한 decision의 ship receipt가 **HEAD 트리에** 없다 — 경계 자체가 성립하지 않는다 |

`unresolved`를 `violations`로 접으면 "아직 ship하지 않았다"와 "ship했는데 링크가 없다"가
같은 종료코드가 되어, 부트스트랩 상태를 결함으로 보고한다. 그 구분이 M5 Task 6의 절반이었고
여기서도 같다.

**`unresolved`는 "아직 커밋되지 않았다"도 포함한다** (R0 invariant LOW 흡수 — DD8의 따름정리).
검사가 HEAD만 읽으므로, `/mccp:pr` 직후 evidence commit 이전 상태는 receipt가 작업 트리에만
있는 상태다. 그것을 `violations`로 접으면 정상적인 부트스트랩 시점이 결함으로 보고되고, DD3가
`unresolved`를 따로 둔 이유가 무효가 된다. 판정 기준은 **HEAD에서 읽히는가**이지 파일이
디스크에 있는가가 아니다.

### DD8 — 읽기 원천은 HEAD 트리 하나다 (R0 architect HIGH 흡수)

초판은 검사 3·4만 `post_baseline`(HEAD)에서 온다고 적고 1·2는 "receipt와 레코드를 각각 한 번
읽는 것"이라고만 적었다. 그 서술은 작업 트리 읽기를 자연스러운 구현으로 만들고, 그러면 한
종료코드 안에 두 코퍼스가 섞인다.

그 혼합이 왜 치명적인지는 이 모듈 자신이 적어 두었다 — `linkage-audit.js:621-628`: 작업 트리를
읽으면 "`MCCP_PR_SKIP_LINK_EVIDENCE`를 쓰거나 evidence commit이 실패해도 back-patch된 레코드는
작업 트리에 남으므로 감사가 `bidirectional`을 만점으로 세고, 히스토리에 증거가 0인 채로 100%를
보고한다." 즉 **우회가 지표를 강등시키지 않는다.** M7의 유일한 acceptance가 이 도구의 exit 0이므로,
그 상태에서는 마일스톤이 통과했다는 주장 자체가 반증 불가능해진다.

따라서 **네 검사 전부 HEAD 트리**다. 작업 트리 카운트는 지우지 않되(그 축은 `post_baseline.ships`/
`records`가 M1 의미 그대로 소유한다) 강제 뷰의 판정에는 들어오지 않는다.

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

### DD7 — 게이트는 **plan 경로**로 진입한다 (M5 인계 1단계의 정정)

M5 인계 1단계는 `/mccp:plan .claude/prds/review-record-linkage.prd.md`를 쓰라고 적고, 그
근거로 "산출물이 `.claude/plans/review-record-linkage-m7.plan.md`이어야 slug가 브랜치와
일치한다"를 들었다. **그 인과가 거꾸로다.** plan 파일명은 `mccp:plan`의 슬러그를 정하지
않는다 — 첫 non-flag **인자**가 정한다(F13). PRD 경로로 부르면 ` M7` 토큰은 버려지고
슬러그는 `review-record-linkage`가 된다.

그 슬러그로 진입하면 두 축에서 동시에 막힌다:

1. **라운드 예산 소진** — 그 원장은 M3 사이클의 3라운드를 이미 담고 있고 cap은 1이라
   `emit-workflow-args`가 5.2c에서 거부한다(F8·F9). 패널은 발화하지 못하고 plan receipt도
   나오지 않으므로 Task 1의 앵커가 원리상 산출 불가다.
2. **체인 슬러그 불일치** — 설령 1을 캡 상향으로 뚫어도 receipt는
   `mccp-plan-codex/review-record-linkage.json`에 떨어지는데 `/mccp:pr` 2.5.9는
   `review-record-linkage-m7`을 조회한다. M5 사이클이 실측한 HALT가 그 형태다.

따라서 **`/mccp:plan .claude/plans/review-record-linkage-m7.plan.md`** 로 진입한다 —
실측 슬러그 `review-record-linkage-m7`, 원장 `rounds_so_far:0`. 부수효과로 `PRD_MODE=false`가
되어 Phase 2.5 fan-out이 `not-prd-mode`로 skip되는데, 이는 UI10과 일치하므로 대가가 아니다.

**캡 상향은 대안이 아니다.** 2를 고치지 못하고, §3.16이 라운드를 늘리는 것을 기본
선택지에서 뺐다. 원장을 지우는 것도 §3.16의 정당한 행동 목록에 없다. 여기서 필요한 것은
완화가 아니라 **맞는 인자**다.

> **R2 정정 — 위 두 문단의 슬러그 값은 낡았다.** DD7이 세운 **규칙**("진입 인자가 슬러그를
> 정한다", "캡 상향도 원장 삭제도 대안이 아니다")은 전부 유효하고 R2가 그것을 재확인했다.
> 낡은 것은 값이다: 그때 `rounds_so_far:0`이던 `review-record-linkage-m7`은 R0·R1·R1-retry로
> 3/3이 되었고, 그래서 이 사이클은 DD7이 남겨 둔 유일한 사용 가능 경로 — **신선한 슬러그**
> `review-record-linkage-m7b` — 로 들어갔다(PRD:156이 미리 지목한 경로). 문단을 지우지 않는
> 이유는 §3.7·§3.17과 같다: 무엇이 왜 달라졌는지가 함께 남아야 한다.

**사용자 판정(2026-09-08)**: A안(plan 경로) 채택 + 게이트 진입 전 이 plan 본문의 거짓 사실
정정. 정정 범위는 사실과 진입 절차이고 설계(DD1~DD6 · Task 2~5)는 무변경이다.

### DD9 — Acceptance는 단일 기준이고 사유는 통과 경로가 아니다 (R0 invariant HIGH 흡수)

초판 Acceptance는 `exit 0`을 요구하는 항목과 "3·4가 안 되면 사유를 적는다"는 항목을 **같은
체크리스트에 우선순위 없이** 나열했다. DD3 표상 3·4 미충족은 `violations`(exit 1)이므로 둘은
동시에 참일 수 없다. 그 형태를 PRD가 이미 이름 붙여 두었다 — "주장을 남긴 채 acceptance만
무르게 하는 것이 M2가 dropped된 이유이자 이 PRD의 지배적 실패 모드다"(PRD:143-145).

규칙은 하나다: **`exit 0`이 acceptance**다. 사유 기록은 미통과의 설명이며, 부트스트랩과 결함의
구분은 산문이 아니라 **종료코드**가 한다(`unresolved`(3) 대 `violations`(1)). `unresolved`로
끝난 사이클은 M7을 complete로 선언하지 않는다.

### DD10 — 축 1에는 진입 전 기계 검사가 없다 (R0 invariant HIGH 흡수 · **대체 게이트는 R1-retry에서 철회, R2에서 본문 정리**)

> **철회된 부분과 남는 부분을 먼저 가른다.** 남는 것은 전반부의 진단 — "초판 축 1의 두 검사는
> 상수였다" — 이고 그것은 여전히 참이다. 철회된 것은 후반부의 처방 — `REVIEW_DIR/plan-path`
> 실재 확인을 대체 게이트로 삼는 것 — 이다. 그 검사도 **양방향 모두 상수-참**임이
> R1-retry에서 실측됐다: 캐시 `1.33.6` 본문은 그 파일을 쓰지도 **purge하지도** 않으므로
> (purge 목록 `:960-965`가 `l3-findings.json`에서 끝난다) 잔여 파일이 살아남아 통과하고,
> 워크트리 본문은 purge(`:965`)와 write(`:977`)가 같은 fenced 블록이라 자기가 방금 쓴 파일을
> 확인하는 동어반복이다.
>
> R2는 그 철회를 **본문에서 실행한다**. R1-retry는 Cycle Outcome에 기록만 하고 Task 0·Risks의
> 서술을 남겼고, R2의 architect·test·invariant 세 관점이 독립적으로 그것을 지적했다
> ("게이트처럼 보이는 게이트" · 착지 파일 없음 · `## Validation`에 검사 없음). 따라서:
>
> - **Task 0 축 1에서 그 게이트를 제거**했고 텔레메트리로 강등했다.
> - **Risks 표 1행의 완화를 정직하게 다시 적었다** — 진입 전 방어는 *없고*, 있는 것은
>   사후 증거(Task 1)뿐이다.
> - **`plugins/mccp/commands/plan.md`는 `## Files to Change`에 넣지 않는다.** 넣을 코드가
>   없기 때문이다 — 철회된 검사는 구현되지 않는다. 착지 파일 부재는 이제 결함이 아니라
>   *아무것도 착지시키지 않는다*는 결정의 귀결이다.
>
> 아래 전반부는 진단으로서 그대로 두고, 후반부 처방 문단에 철회 표시를 단다.

초판 Task 0 축 1은 두 명령을 통과 조건으로 삼았는데 **둘 다 상수**였다. `install-skew.js`는
`env.CLAUDE_PLUGIN_ROOT`를 읽고(`:281`), 그 변수가 없으면 항상 `override:false`(F16), 주입하면
`:292-299`가 주입한 디렉토리 자신의 HEAD를 `installed_sha`로 삼아 항상 `current · 0 behind`다.
디스크 grep 3종도 캐시 파일과 워크트리 파일을 읽을 뿐 *실행된 본문*을 읽지 않는다. 즉 Risks
표 첫 행이 "복구 경로가 없다"고 적은 그 실패를 막는 장치가 실제로는 없었다.

~~**관측 불가한 명제를 통과 조건으로 삼은 것이 원인**이므로, 고치는 방향은 검사를 강화하는 것이
아니라 **관측 가능한 명제로 바꾸는 것**이다. `REVIEW_DIR/plan-path`는 워크트리 본문만 쓰고
env 주입으로 위조되지 않으며, 예약(5.2b)과 라운드 소모(5.2c) 이전에 판정할 수 있다.~~

**철회(R1-retry 실측 · R2 본문 반영).** 위 처방의 전제 — "그 아티팩트의 실재가 워크트리
본문을 함의한다" — 가 거짓이다. 캐시 본문이 그 파일을 purge하지 않으므로 *실재*는 이전
실행의 잔여로도 성립하고, 워크트리 본문은 같은 블록에서 쓰고 읽으므로 *부재*가 성립할 수
없다. 통과와 미통과를 가르지 못하는 검사는 게이트가 아니다.

**대신 무엇이 남는가.** 이 축의 보증은 사전 검사가 아니라 **사후 증거**로 옮겨간다 —
캐시 판본에는 `meta.review_record_path`를 찍는 줄이 아예 없으므로(F3), receipt에 그 필드가
봉인돼 있다는 사실이 워크트리 본문이 돌았다는 증거다. 그 확인은 Task 1 검사 2번이 한다.
주장 범위는 그대로 "실행된 `plan.md`가 M3 배선을 가졌다"까지이고 "세션이 `--plugin-dir`로
떴다"는 아니다 — 후자는 이 프로세스에서 관측 불가하며, 그것을 통과 조건으로 적는 것이
초판의 실수였다.

### DD11 — 사람이 필요한 결정은 Fable × Codex 이중 리뷰(HSR)가 대신한다 (UI16 · 2026-09-22)

지난 사이클들을 멈춘 것은 코드가 아니라 **사람 판정 대기**였다 — 캡 상향 두 번 · 크래시 복구
판정 · A안 선택 · UI14 대 UI15 우선순위. UI16이 그 자리를 두 모델 리뷰로 대체하라고 정한다.
규칙은 넷이다.

1. **두 리뷰어는 독립이다.** F = `Agent(subagent_type: "mccp:architect", model: "fable")`
   (도구가 Read/Grep/Glob뿐이라 쓰기 불가), C = `codex exec --sandbox read-only -C "$PWD"
   -o <out> - < <packet>`(`plugins/mccp/commands/santa-loop.md:532`의 Reviewer B 호출 형태.
   모델 핀은 두지 않고 사용자 codex 설정의 기본값을 쓰며, 실제 모델명을 기록에 남긴다).
   둘은 같은 packet을 받고 서로의 출력을 보지 않는다. packet은 질문 · **보수→허용 순으로
   미리 정렬한** 선택지 · 증거(file:line과 실측 명령·출력) · 적용 제약을 담는다. **답변형
   packet에는 저자의 권고를 넣지 않는다** — §3.13.2 심판 분리와 같은 이유다.
2. **판정은 기계적이다.** 답변형: 두 리뷰어가 같은 선택지를 고르면 그것, 다르면 **더 보수적인
   쪽**. 검토형: 둘 다 `approve`이고 두 출력 어디에도 blocking(CRITICAL/HIGH + `evidence` +
   `failure_scenario`)이 없을 때만 승인하고, blocking은 §3.14대로 한 번 흡수하되 같은 산출물에
   HSR을 다시 돌리지 않는다(§3.16). 출력 파손 · 타임아웃 · `MCCP_CODEX_DISABLED=1` · codex
   부재는 그 리뷰어의 **가장 보수적인 표**로 센다. 한 리뷰어만으로는 진행하지 않는다.
   **검토형 `object`의 결과는 비대칭이다** (P0 Fable HIGH 흡수 — 없으면 검토형은 고무도장이다):
   저자가 자기 인증으로 흡수할 수 있는 것은 **보수 방향**(이탈 제거 · 검사 추가 · 범위 축소)
   뿐이다. **허용 방향**(새 이탈 · 새 메커니즘 · 새 선택지)은 흡수가 아니라 **새 답변형
   판정점**이어야 하고, 그 판정점은 새 packet으로 묻는다 — 그것은 "같은 산출물"이 아니다.
3. **권한 상한이 있다.** HSR이 승인할 수 없는 것 — PR merge · receipt나 라운드 원장의
   삭제·재작성·재봉인 · 어떤 (gate, slug)이든 **3라운드째** · 리뷰어 프롬프트 변경 ·
   `.claude/settings.json` 변경 · force push. 이 선 밖의 선택지는 packet에 애초에 넣지 않는다.
   가장 보수적인 선택지는 항상 `halt`이고, `halt`는 `fix-task.md`와 보고서에 기록된 뒤
   **사람을 기다리는 유일한 경우**다. 아래 판정점 목록에 없는 정지도 HSR 없이 `halt`다
   — 선택지를 사후에 지어내지 못하게 하는 것이 목록을 미리 못박는 이유다. 헤드리스 하위
   세션에서는 `--settings`의 `permissions.deny`가 이 상한의 **일부**를 기계로 막는다 —
   `bypassPermissions`에서도 거부됨을 실측했다(`//` 절대경로 규칙의 Edit 거부). 다만 규칙은 접두
   매칭이라 `git push origin --force` · `gh api …/merge` · Bash로 파일 쓰기 같은 변형은 통과하고
   `permission_denials`에도 남지 않는다(P1 Codex · Fable MEDIUM). 나머지는 여전히 산문이고, 권한
   좁히기는 `headless-delegation` M1c 소유다.
4. **기록은 한 파일이다.** 판정점마다 `docs/review-record-linkage/hsr-decisions.jsonl`에 한 줄 —
   **packet 원문**과 그 sha256 · 선택지와 그 순서 · 두 리뷰어의 원문 출력(가공 없이) · 적용
   규칙 · 결과. packet 원문을 싣는 이유는 sha256만 남기면 "무엇을 물었는가"를 사후에 재구성할
   수 없기 때문이다(P0 Fable MEDIUM). `.claude/reviews/`에 두지 않는 이유는 그 디렉토리의
   `plan-review-*` 파일이 M1 파서의 레코드 코퍼스이기 때문이다
   (`plugins/mccp/scripts/lib/linkage-audit.js:177`). 검증 스크립트는 M6 plan `## Validation`
   검사 11이 소유한다 — 판정점 목록을 **스크립트 안에 고정**해 두고(기록이 스스로 적은 선택지
   순서를 믿지 않는다 · P0 Codex HIGH), 필수 판정점의 존재 · 판정점당 한 줄 · packet sha256 ·
   결과 재계산을 전부 대조한다.

| 판정점 | 형 | 선택지 (보수 → 허용) | 언제 |
|---|---|---|---|
| `P0` | 검토 | `object` · `approve` | plan 단계 — 2026-09-22 개정 1차 |
| `P0-M7CAP` · `P0-M6CAP` | 답변 | `halt` · `regate` | plan 단계 — 같은 슬러그 +1라운드 (둘 다 `halt`로 판정됨) |
| `P1` | 검토 | `object` · `approve` | plan 단계 — P0 흡수 뒤의 개정 |
| `P1-M7PATH` | 답변 | `halt` · `fresh-slug` | plan 단계 — `-m7c` ship 구간 분리 |
| `R-PR` | 답변 | `halt` · `absorb-rerun` · `absorb-rerun-armed` | ship에서 PR-Codex 비승인. `absorb-rerun` = CRITICAL·HIGH를 **코드에서만** 고치고 pr 게이트를 캡 2로 1회 재실행(재실행도 비승인이면 `halt`). `absorb-rerun-armed` = 같되 `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`를 두 리뷰어의 근거로 쓴 사유와 함께 무장(verdict는 봉인 유지) |
| `R-SEC` | 답변 | `halt` · `absorb-rerun` | ship에서 security reviewer CRITICAL·HIGH 정지. 코드에서만 고치고 pr 게이트 캡 2 |
| `M6-DISP` · `M6-OQ1`~`M6-OQ5` | 검토 · 답변 | M6 plan DD15 | M6 구현 중 |

`R-PR`·`R-SEC` 어느 경로로든 pr 게이트는 **최대 2라운드**다. 둘이 겹쳐 합이 2를 넘으면 `halt`다.

**이것은 게이트가 아니다** — receipt를 쓰지 않고 어떤 명령 체인도 막지 않으며, 사람이 내리던
결정만 대신한다. 그래서 PRD의 "새 게이트 추가는 범위 밖"과 충돌하지 않는다.

**주장하지 않는 것**: HSR은 판정이 옳다는 증명이 아니다 — 독립성은 모델 계열(anthropic ×
openai)의 차이뿐이고 두 리뷰어는 같은 packet을 읽는다. 그리고 이것은 `headless-delegation`
PRD M4("판정 대행", pending)의 **구현이 아니다** — 코드 0줄의 PRD-국소 절차이고, M4가
착지하면 그것으로 대체된다. 그 PRD가 그은 선(가역 결정만 · merge는 사람)을 그대로 따른다.

## Review Rounds

### R0 — 2026-09-08 · `multi-agent` 패널 · verdict `divergent`

| 항목 | 값 |
|---|---|
| responded / required | 4 / 3 → **passed: false** (pass 1 = security, fail 3) |
| halt_stage | `5.2e` |
| wall_clock | 255,026 ms |
| blocking | 7 = **실제 HIGH 4** + synthetic `FAIL` 3 (§3.14가 해제 조건으로 지목한 `quorum.js:175-181` 누수 — bare `verdict=fail`을 severity로 합성) |
| 레코드 | `.claude/reviews/plan-review-review-record-linkage-m7.md` |
| receipt | 미작성 (정직한 상태 — 위조하지 않음) |

**흡수 (§3.14 · UI15 — HIGH·CRITICAL만 그 자리에서):**

| finding | 흡수 위치 |
|---|---|
| architect#1 HIGH — 검사 1·2 코퍼스 미지정(fail-open) | **DD8** 신설 + Task 2 검사표를 "전부 HEAD 트리"로 |
| test#1 HIGH — 검사 3·4가 전역 집계라 과다승인 | Task 2 검사표를 "전부 지목한 ship"으로 + 반증 fixture 2종 |
| invariant#2 HIGH — Acceptance 자기모순 | **DD9** 신설 + Acceptance 우선순위 확정 + Task 4 문구 |
| invariant#1 HIGH — Task 0 축 1이 상수 | **DD10** 신설 + 게이트를 5.2 진입 직후·5.2b 이전으로 이전 |
| architect#3 MEDIUM — `--decision` scope 주장이 3·4에 대해 거짓 | test#1과 같은 축이라 함께 닫힘 |
| invariant#4 LOW — 읽기 원천 비대칭으로 종료코드 의미 미정의 | DD3에 "`unresolved`는 미커밋도 포함" 따름정리 |
| security#1 MEDIUM — 보고서 전사의 홈 경로 유출 | Task 0 Validate에 `~` 축약 의무 |

**이연 (증거와 함께 [codex-findings-backlog.md](codex-findings-backlog.md) 5행):**
architect#2(per-decision API 부재로 DD4 재사용 불가) · test#2+invariant#3(Task 1이 산문뿐,
두 리뷰어 독립 동일 축) · test#3(Risks가 지목한 test가 Validate에 없음) · test#4(Task 3
Validate에 명령 없음).

### R1 — §3.16 이탈 기록

**§3.16과 UI14는 1라운드가 기본이라고 정한다. R1은 그 이탈이다.**

사유: R0의 HIGH 4건이 전부 이 마일스톤의 **유일한 acceptance 오라클**(`--check-live-linkage`)의
건전성을 겨냥했고, UI15가 HIGH를 흡수하라고 정한다. 흡수하면 plan hash가 바뀌어
`write.js:626`의 DD13 bind가 R0의 proof로는 어떤 receipt도 봉인하지 못하므로, **흡수와
single-pass 통과는 상호배타**다. M7의 목적 자체가 plan receipt를 링크의 발원지로 만드는 것이라
receipt 없는 진행은 M5의 2.5.9 HALT를 재현한다. 따라서 "건전한 spec + 실제 승인" 둘 다로
끝나는 경로는 재리뷰뿐이었다.

판정 주체: 사용자 (2026-09-08, UI14 대 UI15 우선순위를 명시적으로 물어 UI15 채택).
조치: `MCCP_GATE_ROUND_CAP`을 1 → 2로 올려 R1 1회만 연다. 원장은 **지우지 않는다**
(§3.16 금지). R0 증거는 레코드 + scratchpad 사본으로 보존한다.

**알려진 한계** (§3.16 IV1): 패널 dispatch 원장의 `round_index`는 같은 plan hash 안에서만
증가하므로, 흡수로 본문이 바뀐 R1은 원장에서 `round_index:0`으로 기록된다. 즉 이 사이클이
2라운드를 돌았다는 사실은 원장이 아니라 **이 절**이 소유한다.

> **위 "1 → 2"는 낡았다 — 실제로는 3까지 올랐다.** R1은 dispatch 직후 세션이 죽어
> **산출 0**으로 끝났고(아래 R1-retry 표), 사용자 판정으로 캡을 3으로 올려 같은 본문
> hash에 대해 한 번 더 발화했다. 이 문단을 지우지 않고 남기는 이유는 §3.7·§3.17과 같다 —
> 무엇이 왜 달라졌는지가 함께 남아야 한다. R1-retry의 invariant 리뷰어가 이 불일치를
> 지적했고 그것은 옳다.

### R1-retry — 2026-09-08 · 크래시 복구 · verdict `divergent`

R1은 원장에 `emitted`를 남긴 뒤 `l2.json`·`decision.json`·`proof.json`을 하나도 만들지
못하고 죽었다(리뷰 레코드 두 파일 바이트 동일). 본문 hash가 불변이므로 재발화는
"고쳐서 재리뷰"가 아니라 **크래시 복구**로 판정됐다(사용자, 2026-09-08).

| 항목 | 값 |
|---|---|
| responded / required | 4 / 3 → **passed: false** (4관점 **전원** fail) |
| halt_stage | `5.2e` |
| wall_clock | 271,048 ms |
| blocking | 10 = 실제 HIGH 6 + synthetic `FAIL` 4 (§3.14 해제 조건 대기) |
| receipt | 미작성 |

**흡수 0건.** 이 라운드로 원장이 3/3이 되었고 `review-single-pass.js:45`의
`MAX_ROUND_CAP`이 3이므로, `MCCP_GATE_ROUND_CAP`의 **어떤 값으로도** 이 슬러그의 라운드가
더 열리지 않는다. 흡수 후 재리뷰가 구조적으로 불가능하므로 findings 11건을 전부
[codex-findings-backlog.md](codex-findings-backlog.md)에 적재했다(HIGH 5 · MEDIUM 4 · LOW 2).

### R2 — 2026-09-08 · 신선한 슬러그 `review-record-linkage-m7b` · verdict `divergent` (single-pass)

`-m7`의 예산이 종료적으로 소진돼(3/3 · `MAX_ROUND_CAP=3`) 그 슬러그로는 라운드가 더 열리지
않으므로, **PRD:156이 지목한 유일한 사용 가능 경로**인 신선한 슬러그로 게이트를 돌았다.
`MCCP_REVIEW_SINGLE_PASS=deadline_pressure`로 진입했다(§3.15).

| 항목 | 값 |
|---|---|
| responded / required | 4 / 3 → **passed: false** (pass 1 = security, fail 3) |
| halt_stage | `5.2e` |
| wall_clock | 307,790 ms |
| blocking | 12 = 실제 CRITICAL 1 + HIGH 5 + MEDIUM 2 + synthetic `FAIL` 4 (§3.14 해제 조건 대기) |
| 레코드 | `.claude/reviews/plan-review-review-record-linkage-m7b.md` |
| receipt | **작성됨** — `mccp-plan-codex/review-record-linkage-m7b.json`. `resolution.review_verdict`는 `divergent` **그대로 봉인**(converged 위장 없음), `meta.review_single_pass_reason=deadline_pressure` · `meta.review_single_pass_bypassed_verdict=true` |
| backlog 적재 | 12건 전부 (§3.15 M2 — 적재는 완화의 부수효과가 아니라 **전제조건**) |

**흡수 (§3.14 · UI15 — CRITICAL·HIGH만 그 자리에서):**

| finding | 흡수 위치 |
|---|---|
| invariant CRITICAL — 결정 정체성 미앵커(게이트는 `-m7b`, 본문은 전부 `-m7`) | **헤더 슬러그 · UI2 · UI4 · Task 0 축 2 · Task 1 · Task 4 · Acceptance · Validation** 전면 정정 + 브랜치를 `review-record-linkage-m7b`로 리네임 |
| architect·test·invariant HIGH — Task 0 축 2의 통과 조건이 충족 불가 | Task 0을 preflight에서 **사후 기록**으로 재작성. `rounds_so_far`는 통과 조건이 아니라 근거로 강등 |
| architect·test·invariant HIGH — DD10 대체 게이트가 판별력 0 · 착지 파일 없음 | **DD10 후반부 철회를 본문에서 실행** — Task 0 축 1에서 제거, Risks 1행을 "진입 전 완화 없음"으로 정직화, `commands/plan.md`를 Files to Change에 넣지 **않는** 결정을 명시 |
| architect MEDIUM — F8이 원장과 불일치 | F8 재측정 (세 슬러그 전부) |

**이연 (증거와 함께 [codex-findings-backlog.md](codex-findings-backlog.md)):** security#1(상류
receipt가 working-tree only · hash 미검증이라 acceptance 오라클의 신뢰 근원이 약함) ·
security#2(보고서 홈 경로 유출을 산문 의무로만 막음) · test MEDIUM 2건 · invariant MEDIUM·LOW.

**이 라운드가 마지막이다.** 흡수로 본문이 바뀌어 `plan_hash`가 달라졌고 상류 receipt는
`prp-implement`·`pr` 양쪽에서 stale이다(Task 0b에 실측). 신선한 슬러그로 다시 도는 것은
§3.16 IV1이 이름 붙여 금지한 "고쳐서 재리뷰"이므로 **하지 않는다**. 다음은 재리뷰가 아니라
진행이고, 막히는 게이트는 문서화된 감사 우회로 사유를 남기며 지난다.
(2026-09-22: 마지막 문장의 전제 — 지날 감사 우회가 있다 — 는 거짓으로 실측됐다. Task 0b가 이
문단을 재판정했고, 그 결과 새 슬러그 여부는 HSR `P1-M7PATH`를 거쳐 사람의 판정으로 넘어갔다.)

## Cycle Outcome — 직전 사이클(`-m7` 슬러그)의 종료 기록

> **이 절은 과거다.** 아래는 `-m7` 슬러그로 돌던 사이클이 R1-retry 뒤 미완료로 닫힌 기록이고,
> 그 판정은 그 시점에 옳았다. 현재 사이클은 R2에서 신선한 슬러그로 재개했고 위 세 반증을
> **본문에서 실행**했다 — 그것이 아래 "그대로 옮기지 마라"가 요구한 바다. 지우지 않는 이유는
> 무엇이 왜 달라졌는지가 함께 남아야 하기 때문이다.

**acceptance 미충족.** `--check-live-linkage`는 구현되지 않았고 Task 0~5 어느 것도
착수되지 않았다. DD9가 정한 단일 기준(`exit 0`)에 도달하지 못했으므로 M7을 complete로
선언하지 않는다.

패널이 실측으로 반증한 것 셋 — **plan을 다음 사이클로 옮길 때 그대로 옮기지 마라**:

1. **DD10의 대체 게이트는 판별력이 0이다.** 캐시 `1.33.6` 본문은 `$REVIEW_DIR/plan-path`를
   쓰지도 **purge하지도 않으므로**(purge 목록 `:960-965`가 `l3-findings.json`에서 끝난다)
   잔여 파일이 살아남아 통과하고, 워크트리 본문은 purge(`:965`)와 write(`:977`)가 같은
   블록이라 자기가 방금 쓴 파일을 확인하는 동어반복이다. 양방향 모두 통과한다.
   DD10은 상수-참 검사를 다른 상수-참 검사로 바꾼 것이다.
2. **그 게이트는 착지처가 없다.** `## Files to Change`에 `plugins/mccp/commands/plan.md`가
   없고 `## Validation`에도 그 검사가 없다 — Risks 표 1행의 유일한 완화가 산문이다.
3. **F8 · DD7 · Task 0 축 2의 `rounds_so_far: 0`은 거짓이다.** 그리고 그 결과 acceptance
   도달 경로가 plan 자신의 제약(캡 상향 금지 · 원장 삭제 금지) 안에 존재하지 않는다.

전체 기록과 다음 사이클 handoff는
[review-record-linkage-m7-report.md](../PRPs/reports/review-record-linkage-m7-report.md).

## Tasks

### Task 0: 정체성 축 — 이미 확정됐다 (진입 preflight의 사후 기록)

> **이 Task는 더 이상 fail-closed preflight가 아니다.** 초판은 "게이트 진입 **전**에 돈다"고
> 적었고 그 통과 조건이 `rounds_so_far == 0`이었는데, R2 패널이 세 관점에서 그 명제가
> 결정적으로 거짓임을 원장으로 반증했다(CRITICAL 1 · HIGH 3). 게이트는 이미 돌았으므로
> 진입 전 검사는 지나간 시점의 것이고, 남는 것은 **무엇이 확정됐는가**와 **ship에서 무엇이
> 성립해야 하는가** 둘이다.

- **축 1 — 어느 본문이 실행 중인가**: **진입 전 기계 검사가 없다**(DD10, 그리고 DD10이
  제안한 대체 게이트도 판별력 0으로 철회됐다 — 아래). 남는 것은 텔레메트리다.
  ```bash
  CLAUDE_PLUGIN_ROOT="$PWD/plugins/mccp" node plugins/mccp/scripts/lib/install-skew.js
  sha256sum ~/.claude/plugins/installed_plugins.json   # 보고서에는 홈 경로를 `~`로 축약해 싣는다
  ```
  이 축의 실질 보증은 검사가 아니라 **결과**다 — 캐시 판본은 `meta.review_record_path`를
  찍는 줄 자체가 없으므로(F3), receipt에 그 필드가 봉인돼 있다는 사실이 곧 워크트리 본문이
  돌았다는 증거다. 그 확인은 Task 1이 한다. 즉 이 축은 **사전 검사에서 사후 증거로** 옮겨간다.

- **축 2 — 어느 슬러그로 진입했는가**: **확정됨 — `review-record-linkage-m7b`.**

  | 축 | 값 | 확인 |
  |---|---|---|
  | plan 게이트 슬러그 | `review-record-linkage-m7b` | `.claude/receipts/mccp-plan-codex/review-record-linkage-m7b.json` |
  | 브랜치 (= ship 슬러그) | `review-record-linkage-m7b` | `derive-decision --command mccp:pr --args ""` |
  | plan 파일 | `.claude/plans/review-record-linkage-m7.plan.md` | receipt `meta.plan_path`와 문자열 동등 (앵커 키, F15) |
  | ship plan 경로 | 같은 값을 `PR_PLAN_PATH`로 명시 | `plugins/mccp/commands/pr.md:923`·`:1136`·`:1210` |

  **`-m7`으로 돌아가는 경로는 없다.** 그 원장은 3/3이고 `MAX_ROUND_CAP=3`이라 캡 상향으로
  열리지 않으며, 원장 삭제는 §3.16이 정당한 행동 목록에서 뺐다. 신선한 슬러그가 유일한
  사용 가능 경로였고 PRD:156이 그것을 미리 지목했다.

  **`-m7c`로 다시 도는 것도 경로가 아니다.** 본문을 고쳐 재리뷰하는 것은 §3.16 IV1이
  이름을 붙여 금지한 바로 그 패턴이다. 그래서 이 흡수 뒤에 오는 것은 재리뷰가 아니라 진행이다.

- **Validate**: 위 표 네 줄이 전부 실측과 일치. Validation 1번이 그 명령을 담는다

### Task 0b: 흡수의 대가 — 상류 receipt는 stale이고, 지날 우회는 없다 (구 Task 0.5 · 2026-09-22 정정)

> 번호가 바뀐 이유: L1의 Task 헤딩 정규식 `Task\s+[0-9]+[a-z]?`(`plugins/mccp/scripts/lib/plan-review/l1-check.js:175`)이
> "Task 0.5"를 "Task 0"으로 읽어 `C7_DUPLICATE_TASK`·`C4_MISSING_VALIDATE`가 났다. 그 상태로는
> 이 plan의 재게이트가 L1에서 멈추고, L1 실패는 §3.15 single-pass도 완화하지 않는다.

R2 흡수는 plan 본문을 고치므로 `receipt/hash.js`의 구조적 정규화(checkbox · PR 번호 ·
표의 status 토큰만 접고 산문은 전부 해시)상 `plan_hash`가 반드시 바뀐다. 실측:

```
prp-implement --decision review-record-linkage-m7b --plan <this>
  → stale: mccp-plan-codex "plan file hash differs from receipt (plan changed since gate)"
pr           --decision review-record-linkage-m7b --plan <this>
  → 같은 stale 1건
```

**정정 — 초판의 처방 두 줄은 둘 다 틀렸다.**

1. "`prp-implement` 진입에 `MCCP_SKIP_RECEIPT=1`" — 그 토글은 CLI validator를 움직이지
   않는다(보고서 §8.4: 우회 유무 모두 exit 2). hook 경로만 소비한다.
2. "ship에서 같은 stale을 문서화된 감사 우회로 지난다" — **지날 우회가 없다.** 2026-09-22
   실측: `validate --command mccp:pr --decision review-record-linkage-m7b --plan <this>`가
   `MCCP_RECEIPT_GATE_MODE`의 `soft`·`hard`·`off` **세 값 모두**에서 `ok:false` · exit 2다.
   `plugins/mccp/scripts/receipt/validate-cmd.js:871`의 `ok` 산식이 `stale.length === 0`을
   무조건 요구하고, `plugins/mccp/commands/pr.md` 2.5.9가 그 `ok`로 HALT한다.
   `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`는 verdict 축만 낮추고 stale은 낮추지 않는다.
   즉 초판대로 `/mccp:pr`에 들어가면 **ship이 구조적으로 불가능**했다.

더 나쁜 사실이 하나 있다 — **두 상류 receipt가 서로 다른 본문에 묶여 있다.** 2026-09-22
실측: plan receipt `plan_hash` `c27c5a…` = R2 흡수 **이전** 본문(`e2c09a6`), implement
receipt `plan_hash` `952d9c…` = 현재 본문(`202d49b`). 그래서 plan 파일을 어느 판본으로
두어도 둘을 동시에 fresh로 만들 수 없다.

**같은 슬러그(`-m7b`)로는 해소할 수 없다 — HSR P0(2026-09-22)의 판정이다.** 이 절의 초판(같은
날)은 `-m7b`의 plan·implement 게이트를 캡 1→2로 한 라운드씩 더 돌리자고 적었다. 두 리뷰어가
독립적으로 그것이 no-op임을 코드로 보였고(`P0-M7CAP` = `halt`, 기록은
`docs/review-record-linkage/hsr-decisions.jsonl`): `MCCP_REVIEW_SINGLE_PASS`가 켜지면
`plugins/mccp/scripts/lib/review-single-pass.js:117`이 캡을 1로 고정해 원장 1인 슬러그의
다음 라운드를 5.2c에서 거부하고, single-pass를 빼면 패널이 divergent일 때 receipt가 쓰이지
않는다(이 PRD의 패널 라운드 통과 0건). 초판이 "`-m7c`로 다시 도는 것도 경로가 아니다"라고
적은 전제 — 문서화된 감사 우회가 있다 — 가 거짓으로 드러났으므로 그 문장도 함께 다시 판정한다.

**남은 후보 — ship 구간을 새 정체성 `-m7c`로 분리 — 도 HSR이 채택하지 않았다 (`P1-M7PATH` =
`halt`).** 두 리뷰어가 갈렸다: Fable은 기계적 성립을 코드로 확인하고 조건부 `fresh-slug`, Codex는
"기록 가시성은 IV1의 재리뷰 예산 우회 자체를 없애지 않는다"며 `halt`. 불일치는 보수 쪽이므로
결과는 `halt`이고, **M7은 `in-progress`로 남아 사람의 판정을 기다린다** — DD11이 정한 유일한
대기 경우다. 후보 본문과 두 리뷰어가 단 채택 조건은
`.claude/notes/review-record-linkage-m7c-candidate.md`에 있다(활성 plan이 아니다).

- **링크 자체는 어느 경로에서도 진짜 값이다** — `finalize-receipt.js:281-330`의 carry-forward는
  `meta.plan_path` 문자열 동등만 보고 `plan_hash`를 보지 않는다. 막혀 있는 것은 *체인 검증*이다.
- 구조 결함 자체(2.5.4 주입이 상류 plan receipt를 stale로 만들고 ship에는 우회가 없다)는 이
  PRD 밖이다 — backlog 2026-08-09 MEDIUM · 2026-08-13 HIGH 행이 이미 소유한다.
- **Validate**: `docs/review-record-linkage/hsr-decisions.jsonl`에 `P0-M7CAP`와 `P1-M7PATH` 판정이
  원문과 함께 있고 M6 plan `## Validation` 검사 11이 재계산으로 일치한다

### Task 1: 상류 앵커 검증 (fail-closed — 미충족이면 즉시 정지)

- **Action**: plan 게이트가 발행한 receipt가 아래 셋을 갖는지 확인한다. 하나라도 없으면
  구현을 계속하지 않고 정지한다 — 없는 앵커 위에서 하는 나머지 작업은 전부 낭비다.
  1. `meta.plan_path == ".claude/plans/review-record-linkage-m7.plan.md"` (F15의 매칭 키)
  2. `meta.review_record_path == ".claude/reviews/plan-review-review-record-linkage-m7b.md"`
     — **`-m7b`다**(R2 정정). 초판은 `-m7.md`를 적었는데 그것은 슬러그가 `-m7`이라는 전제에서
     나온 값이었고, R2 test HIGH가 실행 중 구성에서 반드시 실패한다고 지적했다. 이 검사가
     실제로 묻는 것은 파일명이 아니라 **필드가 봉인됐는가**다(F3 — 캐시 판본은 그 줄이 없다)
  3. `resolution.review_source == "multi-agent"` (F6 — `plan_review_expected=true`의 근거)
- **receipt 파일명**: `review-record-linkage-m7b.json` (R2 정정 — 초판은 `-m7.json`).
  이 파일명이 슬러그와 같아야 하는 이유는 앵커(F15, 파일명 무관)가 아니라 `/mccp:pr`
  2.5.8·2.5.9의 체인 조회가 `--decision ${DECISION_SLUG}`로 **슬러그 키**를 쓰기 때문이다
  (`plugins/mccp/commands/pr.md:1136`·`:1213`). 브랜치를 `-m7b`로 맞춘 것이 그 축을 닫는다
- **Mirror**: `finalize-receipt.js:281-303`의 매칭 규칙을 그대로 읽는다. 특히 **"정확히 1건"** —
  같은 `meta.plan_path`를 선언한 plan receipt가 둘이면 `link_anchor_unresolved`가 되어 링크가
  통째로 미봉인된다. **이것이 `-m7` 슬러그로 receipt를 수동 발행하는 복구안을 배제한 이유다**:
  그 receipt도 같은 `meta.plan_path`를 선언하므로 매칭이 2건이 되어 링크를 깬다(측정됨)
- **Validate**: 세 값을 출력으로 싣는다. **파일명을 가정하지 말고 디렉토리를 훑는다** —
  ```bash
  node -e 'const fs=require("fs"),d=".claude/receipts/mccp-plan-codex";
  for (const f of fs.readdirSync(d)) { const r=JSON.parse(fs.readFileSync(d+"/"+f,"utf8"));
    console.log(f, JSON.stringify({plan_path:r.meta.plan_path,
      review_record_path:r.meta.review_record_path,
      review_source:r.resolution && r.resolution.review_source})); }'
  ```
  2번이 없으면 그 세션이 캐시 본문을 돌았다는 뜻이므로 축 1로 돌아간다

### Task 2: `--check-live-linkage` 강제 뷰

- **Action**: `plugins/mccp/scripts/lib/linkage-audit.js`에 서브커맨드를 더한다.
  ```
  node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage [--decision <slug>] [--json]
  ```
  **네 검사 전부 HEAD 트리를 읽는다** (R0 architect HIGH · DD8). 작업 트리는 읽지 않는다 —
  섞으면 `linkage-audit.js:621-628`이 "이 축의 급소"로 지목한 fail-open이 그대로 재현된다:
  evidence commit이 실패하거나 `MCCP_PR_SKIP_LINK_EVIDENCE`를 써도 back-patch된 레코드·receipt는
  작업 트리에 남아 검사 1·2가 통과한다. 이 도구의 exit 0이 M7의 **유일한** acceptance이므로
  그 틈은 곧 마일스톤 반증 불가다.

  **네 검사 전부 `--decision`이 지목한 ship 하나에 대해 판정한다** (R0 test HIGH). 코퍼스 전역
  집계는 acceptance가 아니다 — `bidirectional`·`denominator`는 `eligibleShips` 전체 위에서
  계산되므로(`linkage-audit.js:353-359`), 전역값을 쓰면 **다른 ship의 링크**로 exit 0이 나서
  과다승인이 된다. 검사 4종:

  | # | 검사 (전부 HEAD 트리 · 전부 지목한 ship) |
  |---|---|
  | 1 | 지목한 `mccp-pr-codex` receipt가 `meta.review_record_path`를 봉인 |
  | 2 | 그 경로의 레코드가 `measurement.receipt_hash`로 **그 receipt의 `receipt_hash`와 동등**(DD4) |
  | 3 | 지목한 ship이 `computeLinkage`의 `bidirectional` 판정을 **자신이** 충족 (전역 `>= 1`이 아니다) |
  | 4 | 지목한 ship이 **eligible 집합의 원소** — 즉 `meta.plan_review_expected`가 실려 자격이 확정됐다(F6). 전역 `denominator != null`이 아니다 |

  `--decision`을 생략하면 HEAD 트리의 eligible ship **각각**에 같은 4검사를 적용하고 하나라도
  미충족이면 `violations`다(전역 집계로 갈음하지 않는다).
  종료코드는 DD3의 자기 표를 쓴다. `STATE_EXIT_CODES`·`CHECK_EXIT_CODES`를 재사용하지 않는다.
- **Mirror**: `checkRoundStructure`(`linkage-audit.js:767-`)의 구조 — 순수 함수가 상태 객체를
  돌려주고 CLI가 그 `state`를 종료코드로 사상한다. 사유는 enum, 경로는 싣지 않는다
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/linkage-audit.test.js` — 4상태 각각
  fixture로 재현. 반드시 포함할 4개:
  1. **레코드 판독 불가 → `degraded`(2)**이지 `violations`(1)가 아님
  2. **지목한 ship이 HEAD에 부재 → `unresolved`(3)** (작업 트리에만 있는 경우도 여기다 — DD8)
  3. **과다승인 반증**: 지목한 ship은 미링크인데 **다른 ship이 링크됨** → `ok`가 **아님**.
     이 fixture가 없으면 R0 test HIGH가 그대로 남는다
  4. **코퍼스 혼합 반증**: 레코드·receipt가 작업 트리에만 있고 HEAD에는 없음 → `ok`가 **아님**
     (`unresolved`). 이것이 DD8을 반증 가능하게 만드는 유일한 fixture다

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

- **Action**: `--plugin-dir` 세션에서 `/mccp:prp-commit` → `/mccp:pr`을 완주한다. **2026-09-22 —
  이 Task의 실행은 `-m7b`에서 불가능하고(Task 0b), 대안 `-m7c`는 HSR `P1-M7PATH`가 `halt`로
  판정했다.** 사람이 경로를 정하기 전까지 이 Task는 대기다. 정해지면 그 세션을 사람이 여는 대신
  오케스트레이터가 `claude -p --plugin-dir` 하위 세션으로 띄울 수 있다(실측 — 후보 notes의 S5~S7).
  아래 산출·Validate는 `-m7b` 기준의 원문이다. 산출:
  1. `mccp-pr-codex/review-record-linkage-m7b.json`이 `meta.review_record_path` 봉인 (F5 carry-forward).
     (`-m7b`판은 여기서 `PR_PLAN_PATH` export를 지시했다. 2026-09-22 H1 번복으로 ship은 `-m7c`가
     맡고, 거기서는 슬러그와 plan 파일명이 같으므로 **설정하지 않는다** — `-m7c` plan K1)
  2. `.claude/reviews/plan-review-review-record-linkage-m7b.md`가 `measurement.receipt_hash`로
     그 receipt를 되짚음 (F11 back-patch)
  3. `linkage.bidirectional >= 1`
  4. `meta.plan_review_expected`가 실려 `denominator != null` (F6)
  - **부분 성립에는 사유를 적되, 그것이 acceptance를 대체하지는 않는다** (R0 invariant HIGH 흡수 —
    DD9). 이 Task의 절반이 부트스트랩과 결함의 구분인 것은 M5 Task 6에서 그대로 상속하지만,
    그 구분은 **종료코드가 이미 표현한다**(`unresolved`(3) 대 `violations`(1)). 사유는 그
    종료코드를 **설명**하는 것이지 통과로 바꾸는 것이 아니다.
- **Validate**: `node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision review-record-linkage-m7b`
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
- **ship 이후 산출물의 운반자** (2026-09-22): 이 Task의 PRD 행 · frozen-baseline 라이브 절 ·
  보고서 실값은 A6의 exit 0 **뒤에야** 존재하는 값이다. ship 뒤 이 브랜치에 커밋을 올리면
  ship receipt가 `ship-gate-stale-head`가 되고 tracked receipt는 재봉인할 수 없으므로(§3.12),
  그 셋은 **M6 브랜치가 운반한다**(M6 plan Task 7). 이 PR의 CHANGELOG 항목은 구현 사이클에서
  이미 착지했다.

## Validation

```bash
# 1. 정체성 축 — 확정값 대조 (Task 0). install-skew는 변수를 넘겨야 override를 본다(F16)
CLAUDE_PLUGIN_ROOT="$PWD/plugins/mccp" node plugins/mccp/scripts/lib/install-skew.js
sha256sum ~/.claude/plugins/installed_plugins.json   # 보고서 전사 시 홈 경로는 `~`로 축약
git branch --show-current                                                        # => review-record-linkage-m7b
node plugins/mccp/scripts/receipt/cli.js derive-decision \
  --command mccp:pr --args ""                                                    # => review-record-linkage-m7b
test -f .claude/receipts/mccp-plan-codex/review-record-linkage-m7b.json          # => exit 0
# 예산은 재확인만 한다 — 통과 조건이 아니라 "왜 -m7b인가"의 근거다 (R2)
node plugins/mccp/scripts/lib/review-rounds/cli.js status \
  --gate mccp-plan-codex --decision review-record-linkage-m7 --json              # => rounds_so_far: 3
node plugins/mccp/scripts/lib/review-rounds/cli.js status \
  --gate mccp-plan-codex --decision review-record-linkage-m7b --json             # => rounds_so_far: 1

# 2. 상류 앵커 (Task 1) — 파일명을 가정하지 않고 디렉토리를 훑는다 (F15)
node -e 'const fs=require("fs"),d=".claude/receipts/mccp-plan-codex";
for (const f of fs.readdirSync(d)) { const r=JSON.parse(fs.readFileSync(d+"/"+f,"utf8"));
  console.log(f, JSON.stringify({plan_path:r.meta.plan_path,
    review_record_path:r.meta.review_record_path,
    review_source:r.resolution && r.resolution.review_source})); }'

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
node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision review-record-linkage-m7b

# 6. version 미선언 (UI11)
node scripts/version-declaration-guard.js

# 7. 머지가 파일을 조용히 지우지 않았는지 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **세션이 캐시 본문을 돌아 라운드만 소진한다** | 중 | **진입 전 완화가 없다 — 이 표는 이제 그 사실을 적는다**(R2 3관점 흡수). 초판의 Task 0 축 1도, DD10의 대체 게이트도 양방향 상수-참으로 반증됐고 후자는 철회됐다(DD10). 남는 것은 사후 탐지뿐이다: Task 1 검사 2번이 `meta.review_record_path` 봉인 여부로 *이미 일어난* 실행이 어느 본문이었는지 가른다(F3 — 캐시 판본엔 그 줄이 없다). 즉 라운드 소진 자체는 막지 못하고, 잘못된 본문으로 얻은 receipt를 앵커로 쓰는 것만 막는다. 이 축을 진짜로 닫으려면 세션의 plugin root를 서브프로세스에서 관측할 수단이 필요하고 그것은 이 PRD 밖이다 — backlog |
| **틀린 인자로 진입해 다른 슬러그의 게이트를 돈다** — 이 마일스톤의 유일한 치명 실패 | ~~중~~ → **진입 전 해소** | Task 0 축 2. 2026-09-08 실측으로 PRD 경로가 소진된 슬러그(`review-record-linkage`, 3라운드)로 간다는 것이 드러났고 DD7이 진입 인자를 plan 경로로 고정했다. 잔여는 "인자를 다시 틀리는 것"뿐이라 Task 0이 슬러그와 `rounds_so_far`를 출력으로 확인한다 |
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
- [ ] **게이트를 `--plugin-dir` 아래에서 1회 완주**하고 `node plugins/mccp/scripts/lib/linkage-audit.js --check-live-linkage --decision review-record-linkage-m7b`가 **exit 0**
- [x] `mccp-plan-codex/review-record-linkage-m7b.json`이 `meta.review_record_path`를 봉인 (Task 1) —
      값은 `.claude/reviews/plan-review-review-record-linkage-m7b.md`. 파일명이 그 슬러그여야
      하는 것은 앵커(F15, 파일명 무관)가 아니라 `/mccp:pr` 2.5.8·2.5.9의 체인 조회가 슬러그
      키를 쓰기 때문이다 (DD7 · R2 정정)
- [ ] `mccp-pr-codex/review-record-linkage-m7b.json`이 `meta.review_record_path` + `meta.plan_review_expected`를 봉인
      (`-m7b` 기준 원문 — ship은 `-m7c`가 `PR_PLAN_PATH` 없이 수행한다)
- [ ] `installed_plugins.json` sha256이 완주 전후로 불변 (UI8)
- [ ] 보고서가 **어느 경로에서 완주했는지** 명시 (`docs/dogfood-install.md:113`)
- [ ] 강제 뷰가 `unresolved`(3)로 끝났다면 그 사유가 보고서에 있고, **M7은 complete로 선언되지 않는다**

> **Acceptance에는 우선순위가 있다** (R0 invariant HIGH 흡수 — DD9). 초판은 위에서 `exit 0`을
> 요구하면서 아래에서는 "3·4가 안 되면 사유만 적으면 된다"고 적었다. DD3 표상 3·4 미충족은
> `violations`(exit 1)이므로 **두 항목은 동시에 참일 수 없었다.** 그리고 그것은 PRD가 자기
> 지배적 실패 모드로 명시한 형태다 — "주장을 남긴 채 acceptance만 무르게 하는 것"(PRD:143-145).
>
> 이제 규칙은 하나다: **`exit 0`이 acceptance이고 대체 경로는 없다.** 사유 기록은 통과 사유가
> 아니라 미통과의 **설명**이며, `unresolved`(아직 HEAD에 없음)로 끝난 사이클은 M7을 complete로
> 선언하지 않는다(그 처리는 M5의 "완료 선언을 하지 않는다"와 같다).

## External Research Provenance

- Source PRD: .claude/prds/review-record-linkage.prd.md
- References section sha256: 6285d0d8018061d14bd81f59fab68b7c3fcdd25580472eb34dd5b2f6449f5647
- Stamped at: 2026-09-08T02:00:10.261Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

- 트리거: `impeccable-detect` `design_signal=true` (축 a) · `signal_files=["<keyword:design>"]` — 키워드 매치이지 렌더링 표면이 아니다
- 호출 형태: `Skill(impeccable:impeccable, ...)` (오라클 해소, source=plugin v4.2.2)
- 결과: `round=0/2` `verdict=CONVERGED` · findings **0**
- 4 Output Constraints 대조 (`skills/frontend-design-direction/SKILL.md`):
  | Anchor | 판정 | 근거 |
  |---|---|---|
  | 정보 위계 3단계 (H15, depth ≤ 3) | pass | 측정: `H1=1 · H2=11 · H3=13 · H4+=0` (fenced 블록 제외) |
  | 강조색 화면당 1개 | N/A | 렌더링 표면 0 |
  | raw markdown marker 금지 | N/A | 렌더링 표면 0 |
  | 한 화면 항목 수 상한 | N/A | 렌더링 표면 0 |
- 렌더링 표면 0의 근거: `## Files to Change` 9행이 전부 `.js`(오라클 + test)와 `.md`(문서·plan·PRD·CHANGELOG·backlog·보고서)이고 `.html/.css/.jsx/.tsx/.vue/.svelte` 0행
- H15 측정은 이 절을 덧붙이기 **전**의 본문 기준이다. 이후 추가된 절은 전부 H2/H3라 depth 판정은 불변이다

## Design Routing Guide

routing mode: auto (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (cap=1, 봉인됨 — `mccp-implement-codex__review-record-linkage-m7b`)
- classification: `ok` · durationMs 82,576 · structured verdict `needs-attention` → `CODEX_VERDICT=divergent`
- 합치 결론: 제안한 7개 implement-time 결정 중 **D3·D2 두 축이 실제로 틀렸다**. 나머지 5개(D1 별도 종료코드 표 · D4 슬러그 allowlist · D5 상태 우선순위 · D6 빈 자격집합을 `unresolved`로 · D7 사유 enum)는 반증되지 않았다. 두 HIGH는 §3.14대로 **그 자리에서 흡수**했고, 흡수 후 재리뷰는 §3.16대로 하지 않는다 — 따라서 receipt는 `divergent`를 그대로 봉인하고 cross-gate dedupe는 닫힌 채로 남아 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — `computeLinkage`는 자격 오라클이 아니다 | HIGH | ACCEPT_NOW | 코드로 확인: `:383`이 `eligibleShips`를 그대로 순회할 뿐 `classifyShipEligibility`를 부르지 않는다. 자격 판정은 **호출자**가 `:539-545`·`:695`에서 한다. 따라서 `computeLinkage([ship],…)`만으로 검사 4를 삼으면 `plan_review_expected` 미봉인 ship도 통과해 검사 4가 **공허**해진다 — Task 2 표가 "자격이 확정됐다(F6)"라고 적은 바로 그 명제가 검사되지 않는다 |
  | F2 — 증거 수집 전에 HEAD를 고정해야 한다 | HIGH | ACCEPT_NOW | 코드로 확인: `baselineTree`가 `ls-tree <ref>`를 돌리고 `readShipReceipts`·`readReviewRecords`가 각각 `git show <ref>:<path>`를 **따로** 실행한다. `ref='HEAD'`면 매 호출이 HEAD를 재해소하므로, 그 사이 커밋·체크아웃이 일어나면 옛 receipt와 새 레코드가 짝지어질 수 있다. DD8이 약속한 "읽기 원천은 HEAD 트리 **하나**"가 성립하지 않는다 |

- 흡수 내용 (Task 2 구현에 반영):
  1. **검사 4를 `classifyShipEligibility(ship.body)`로 명시 판정**한다. `verdict === 'eligible'`이
     아니면 검사 3에 들어가지 않는다 — `computeLinkage`는 자격이 확정된 뒤에만 링크 판정에 쓴다.
     회귀 fixture 2종 추가: `plan_review_expected` **부재** · **`false`**.
  2. **HEAD를 full commit OID로 1회 고정**하고 그 OID를 `ls-tree`·모든 `git show`·타깃 조회에
     전부 넘긴다. 검사 결과에 그 OID를 실어 어느 트리를 봤는지 남긴다. 회귀 fixture 1종 추가:
     receipt 수집과 레코드 수집 **사이에 HEAD가 움직여도** 판정이 고정된 트리 하나에서 나온다.
- Deferred to backlog: 0 (MEDIUM·LOW finding 없음)
- Open Questions: 없음 — 두 HIGH 모두 R1에서 해소됐고 `DIVERGENT_UNRESOLVED`가 아니다.
  `CODEX_VERDICT=divergent`는 미해소가 아니라 **재리뷰를 하지 않았다**는 뜻이다(§3.16).

### Security Reviewer

`Task(mccp:security-reviewer)` — 산출 코드가 아니라 **제안 설계**를 대상으로 발화(명령 본문 2.5.5의 순서). CRITICAL 1 · HIGH 2 · MEDIUM 2 · LOW 2.

**게이트 이탈 기록.** 명령 본문 2.5.5는 security CRITICAL/HIGH를 `[MCCP-GATE-STOP]`으로 규정한다. 여기서는 **멈추지 않고 흡수했다.** 사유: 이 지적들은 "설계가 안전하지 않다"가 아니라 **"이렇게 재구현하면 깨진다"** 는 조건부이고(CRITICAL 본문이 "if reimplemented instead of reused"라고 명시한다), 그 조건은 plan의 DD4가 이미 금지한 행위다. 즉 지적은 *구현을 구속하는 제약*이며 전부 흡수 가능하다. 멈추는 것은 §3.14가 요구한 흡수를 하지 않은 채 사이클을 버리는 것이다. 대신 **구현 후 같은 리뷰어로 산출 코드를 재검증**해(§3.16의 "재리뷰가 아니라 진행"의 예외가 아니다 — Codex 라운드 원장을 소모하지 않는 Phase 4 검증이다) CRITICAL을 주장이 아니라 증거로 닫는다.

| # | Severity | 지적 | 흡수 |
|---|---|---|---|
| S1 | **CRITICAL** | 해시 동등 비교를 재구현하면 fail-open이 열린다. `:394-401`의 실제 비교는 `typeof actual === 'string' && actual.length > 0` 가드를 갖는데, 순진한 `declared === actual`은 **양쪽이 다 `null`일 때 통과**한다. 그리고 그것은 예외가 아니라 back-patch **이전의 기본 상태**다(`record.js:395` `receipt_hash: null`, F11). DD9가 `exit 0`을 유일 acceptance로 못박았으므로 이는 네 사실을 하나도 세우지 않고 exit 0이 나오는 상태다 | 비교를 **재구현하지 않는다** — `computeLinkage([ship], …)`를 호출하고 `.bidirectional === 1`만 읽는다(DD4를 코드로 강제). fixture 추가: 양쪽 `receipt_hash`가 전부 `null`이면 bidirectional 아님 |
| S2 | **HIGH** | 봉인된 `meta.review_record_path`로 파일을 **직접 여는** 재구현 압력. 그 필드는 receipt 생산자가 통제하고(수동 `/mccp:receipt-write` 포함), 형태 가드는 *쓰기* 경로(`finalize-receipt.js:311`)에만 있어 이 도구가 읽는 모든 receipt에 적용됐다고 가정할 수 없다. `:310-313`이 "봉인된 경로로 파일을 열지 않는다"를 명시한 이유 | 전수 스캔 + 메모리 맵 조회 경로를 그대로 쓴다. fixture 추가: `meta.review_record_path`가 `../../../etc/passwd`여도 그 값이 git/fs 인자로 **나가지 않는다** |
| S3 | **HIGH** | `--decision` 단건 조회를 `fs.readFileSync`/`existsSync`로 처리하면 DD8이 닫은 작업-트리 fail-open이 **이 도구의 유일한 acceptance 경로에서** 되살아난다(`:621-628`이 "이 축의 급소"로 지목한 것) | 내용 read는 전부 `git show`. fixture 추가: `--check-live-linkage --decision`이 `fs` 내용 read를 하지 않음을 spy로 단언 |
| S4 | MEDIUM | 제안한 슬러그 정규식 `^[A-Za-z0-9._-]+$`가 이 파일 자신의 두 선례보다 약하다 — `REF_SHAPE`(`:256`)는 **선두 영숫자 강제** + 255자 상한이고 `isRepoRelativePath`(`linkage-defs.js:330`)는 `..`을 명시 거부한다. 오늘 악용 불가인 이유는 오직 **위치적**이다(토큰이 항상 `<OID>:` 접두를 갖고, `<slug>`와 `.json` 사이에 구분자가 없어 `..`이 독립 세그먼트가 못 된다) — 검증자가 강제하는 성질이 아니다 | `^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$` + `indexOf('..') === -1` 명시 거부. 조회는 `gitRev()`(`:265-267`, `--end-of-options` 부착)를 경유 |
| S5 | MEDIUM | OID 고정 실패를 `r.ok ? … : 'HEAD'`로 처리하면(같은 파일 `:1049-1050`에 그 idiom이 실재한다) 핀이 **실패 시에만 무효**가 되어 닫으려던 race가 조용히 되살아난다 | OID 해소 실패 → `unresolved`(3) fail-closed. fixture 추가: 이 서브커맨드가 `'HEAD'` 문자열을 ls-tree/git show에 **넘기지 않음** |
| S6 | LOW | 지목한 receipt가 HEAD에 있으나 `JSON.parse` 실패인 경우가 fixture에 없다 — 재구현이 이를 "없음"(`unresolved`)으로 접으면 DD3가 세운 구분이 흐려진다 | 파손 → `degraded`(2). fixture 추가 |
| S7 | LOW/info | 우선순위 `unresolved > degraded > violations`는 안전하지만(셋 다 비영점, `checkRoundStructure:838-849`의 선례와 동형) **호출자 계약이 암묵적**이다. 이 저장소는 다른 곳에서 실패 등급을 차등 취급하므로(§3.3의 15종 표) 다음 사람이 습관으로 `degraded`를 advisory로 볼 수 있다 | usage와 함수 주석에 "**비영점 셋을 전부 동등하게 미통과로 취급하라**"를 명시 계약으로 적는다 |

**추가 관측 (프로세스)**: R2 패널의 security `pass`는 `--decision` 주입 축을 "`REF_SHAPE` + `--end-of-options` 이중 가드"로 통과시켰는데, 그 가드는 `--baseline-ref`/`--since`의 것이고 신규 `--decision` 슬러그 검증자가 아니다. 즉 **그 pass는 이 산출물을 덮지 않는다.** S4가 그 간극을 닫는다 — 패널의 통과를 근거로 삼지 않고 실제로 같은 강도의 가드를 단다.
