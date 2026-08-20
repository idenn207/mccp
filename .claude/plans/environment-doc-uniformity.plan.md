# Plan: 환경변수 문서 최신화 + 값 규약 통일

**Source PRD**: (없음 — free-form `/mccp:plan` 입력)
**Branch**: `docs/environment-uniformity` (worktree `.worktrees/environment-uniformity/`, base `origin/main`)
**Target version**: `1.29.1` (patch — 단일 plan ship. §3.7대로 머지 해소 시점과 `/mccp:pr` 진입 직전 **두 번** 재계산한다)
**Complexity**: Large

## Summary

`docs/ENVIRONMENT.md`(99,040 B / 478줄)는 두 가지가 동시에 낡았다. 첫째, **문서가 코드를 따라가지 못한다** — 런타임 표면의 실 토글 117개 중 22개가 미등재이고, 문서에만 있고 코드에 없는 이름이 10개이며, ship된 축 둘이 아직 `🚧 예정`/`🚧 미구현`으로 적혀 있다. 둘째, **값의 어휘가 토글마다 다르다** — production 코드에 boolean 토글을 읽는 서로 다른 파싱 규약이 7종 공존하고, 문서의 `값` 열도 `1` · `0|1` · `on|off` · `truthy` · `truthy/falsy` · `1`/`true`/`yes`로 흩어져 있다.

이 plan은 둘을 한 축으로 닫는다. **값 규약을 코드에 하나 만들고**(`env-contract/value.js`), **모든 토글을 그 규약으로 선언한 레지스트리**(`env-contract/registry.js`)를 두고, 문서는 그 레지스트리의 **투영**이 되게 한다. 문서 표면은 색인 1장(`docs/ENVIRONMENT.md`) + 도메인별 상세 8장(`docs/environment/*.md`)으로 갈라, 첫 화면에는 한 줄 설명만 두고 서사는 상세로 보낸다. 상세의 각 토글은 **실제로 복사해 붙일 수 있는 사용 예시**를 반드시 갖는다 — 값 어휘를 통일해도 예시가 없으면 운영자는 여전히 코드를 읽어야 한다. 색인 ↔ 레지스트리 ↔ 런타임 스캔의 삼각 정합은 `env-contract/lint.js`가 fail-closed로 검사하고, 예시의 존재와 문법 유효성도 같은 lint가 검사한다.

**문서만 고치면 문서가 거짓말을 한다.** 색인이 `on|off`라고 적어도 `codex-bridge.js:135`가 `=== '1'`이면 `on`은 동작하지 않는다. 그래서 이 plan은 문서 축과 파서 축을 **한 단위로** 묶는다 — 사용자의 "문서 수정과 환경변수 value의 통일성 추가"가 정확히 그 둘이다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 환경변수 문서를 완전히 최신화한다 | direction |
| UI2 | legacy 내용을 남겨 두지 않는다 | constraint |
| UI3 | 설정값이 on/off와 1/0으로 뒤죽박죽이므로 일정하게 유지한다 | constraint |
| UI4 | 표 형태로 깔끔하게 정리한다 | constraint |
| UI5 | index를 걸어 첫 내용에는 깔끔하고 간단한 설명만 포함한다 | constraint |
| UI6 | 나머지 상세 설명은 별도 경로로 이동하는 문서 형태를 원한다 | constraint |
| UI7 | 이번 계획의 범위는 문서 수정과 환경변수 value 통일성 추가 두 가지다 | constraint |
| UI8 | 상세 설명에는 사용 예시도 포함되기를 원한다 | constraint |

## 실측 진단

측정 명령은 Validation 1이 그대로 재실행한다. 아래 수치는 2026-08-19 기준 실행 결과다.

| 축 | 측정값 | 근거 |
|---|---|---|
| 런타임 표면 raw | 127 | `plugins/mccp/scripts/state/toggle-snapshot.js` `scanSurfaceDetailed` |
| 명명된 제외 | 10 | 같은 함수의 `excluded` |
| 실 토글 | **117** | `toggle_count` |
| `docs/ENVIRONMENT.md` 등재 | 95 | 문서 본문 이름 매칭 |
| **문서 미등재 토글**(오늘의 `docs/ENVIRONMENT.md` 기준) | **22** | 아래 목록 |
| 문서에만 있는 이름 | 10 | 아래 분류 |
| `TOGGLE_DEFAULTS` 등재 | 56 | `plugins/mccp/scripts/state/toggle-snapshot.js:13` |
| defaults 모순 | 1 (`MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL`) | `defaults_conflicts` |

### 문서 미등재 22개 — 전건이 레지스트리에 **등재된다**

`MCCP_A3_READ_USER_MEMORY` · `MCCP_CODE_CLI` · `MCCP_DASHBOARD_STALE_DAYS` · `MCCP_DEEP_RESEARCH_SKILL` · `MCCP_DISABLE_VALUES` · `MCCP_EVIDENCE_STAGE_ROOT` · `MCCP_EXPLORE_CONTROL_PLACEMENT` · `MCCP_GITIGNORE_LOCK_WAIT_MS` · `MCCP_GOAL_FEATURE` · `MCCP_IGNORE_BLOCK` · `MCCP_IGNORE_ENTRIES` · `MCCP_IMPECCABLE_SKILL` · `MCCP_JOURNAL_DEGRADED_UNRECORDED` · `MCCP_MCP_HEALTH_BACKOFF_MS` · `MCCP_MCP_HEALTH_TIMEOUT_MS` · `MCCP_MCP_HEALTH_TTL_MS` · `MCCP_MCP_RECONNECT_TIMEOUT_MS` · `MCCP_MULTI_SESSION_SCAN` · `MCCP_SESSION_LEDGER_SCOPE` · `MCCP_ULTRACODE_FEATURE` · `MCCP_WORKTREE_ACTIVE_DAYS` · `MCCP_WORKTREE_SCAN_CAP`

### 문서에만 있는 10개 — 셋으로 갈린다

| 분류 | 이름 | 처리 |
|---|---|---|
| 코드에 없음 (진짜 legacy) | `MCCP_SKIP_OBSERVE` · `MCCP_QUALITY_GATE_FIX` · `MCCP_QUALITY_GATE_STRICT` · `MCCP_STOP_LOOP_QUALITY_CWD` · `MCCP_SANTA_MAX_ROUNDS` · `MCCP_COST_HARD_CEILING_HIT` · `MCCP_ORCHESTRATION_DEBT_DECAY_HOURS` | `docs/environment/retired.md`로 이전 + 후속 축 명기. 색인 표에서 제거 |
| test 전용 (스캔이 `*.test.js`를 제외하므로 표면 밖) | `MCCP_PERF_INJECT_QUADRATIC` · `MCCP_TEST_SESSION_START_PATH` | 색인에 `test-only` status로 유지 |
| 의도적 부재 | `MCCP_PLAN_REVIEW_L1` | `docs/environment/review.md`에 "존재하지 않는다(의도)" 항목으로 유지 |

### 값 규약 — production 코드에 공존하는 8종

| # | 규약 | 코드 위치 | 적용 토글 |
|---|---|---|---|
| 1 | `=== '1'` 엄격 | `plugins/mccp/scripts/lib/codex-bridge.js:135` | `MCCP_CODEX_DISABLED` 외 7종 · 23개 지점 |
| 2 | `!== '0'` | `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js:275` | `MCCP_CODEX_DESIGN_SCOPE_HONOR` · `MCCP_ORCHESTRATION_COST_FAIL_OPEN` |
| 3 | `1` / `true` / `yes` / `on` / `enabled` | `plugins/mccp/scripts/hooks/ecc-context-monitor.js:47` | `MCCP_CONTEXT_MONITOR_COST_WARNINGS` |
| 4 | `1` / `true` / `yes` / `on` 대 `0` / `false` / `no` / `off` | `plugins/mccp/scripts/lib/orchestration-runaway.js:118` | `MCCP_ORCHESTRATION_USD_BOMB` |
| 5 | `1` / `on` | `plugins/mccp/scripts/lib/subscription.js:51` | `MCCP_SUBSCRIPTION` · `MCCP_WORK_IMPLEMENT_WORKFLOW` |
| 6 | `1` / `on` / `true` / `yes` | `plugins/mccp/scripts/lib/plan-review/decide.js:83` | `MCCP_PLAN_REVIEW_L3` |
| 7 | `off` / `0`이면 off, 그 외 on | `plugins/mccp/scripts/lib/implement-dispatch/budget.js:133` | `MCCP_WORK_IMPLEMENT_PARALLEL` |
| 8 | `'1'` 또는 `/^(true\|yes\|on)$/i` (`envBool`) | `plugins/mccp/scripts/lib/auto-chain.js:48` | `MCCP_AUTO_CHAIN_DISABLE` · `MCCP_AUTO_CHAIN_SKIP_PR` |

같은 저장소에서 `MCCP_SUBSCRIPTION=true`는 무시되고 `MCCP_ORCHESTRATION_USD_BOMB=true`는 켜진다. 운영자가 어느 규칙을 기억해야 하는지 알 방법이 없다 — 이것이 UI3이 지목한 상태다.

> 규약 8은 R1 패널이 찾아냈다. 초안은 7종으로 세었고 그 누락이 곧 `MCCP_AUTO_CHAIN_DISABLE`을
> `bypass-flag`로 오분류하는 원인이었다 — 진단이 한 칸 틀리면 설계가 그만큼 틀어진다는 실례이며,
> 그래서 Task 0이 이 세기를 **감사로 승격**한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| env 파서 실패 규약 | `plugins/mccp/scripts/lib/review-single-pass.js:49` | 열거 검사 + 불량값 loud warn + **권한을 늘리지 않는 방향**으로 fail. `parseSinglePass`(fail-closed) 대 `parseRoundCap`(fail-open)의 방향 분기를 그대로 계승 |
| 코드 상수와 규범 문서 대조 | `plugins/mccp/scripts/state/toggle-snapshot.js:184` | `crossCheckExclusions` — 양방향 drift + 근거 셀의 file:line 실재까지 검사하고, 읽기 실패도 drift로 취급 |
| 문서 이전의 도달성 lint | `plugins/mccp/scripts/lib/instruction-contract/lint.js:11` | C1 목적지 실재 · C2 anchor 실재 · C3 상주 포인터 · C4 무목적지 소실 금지. 전부 fail-closed |
| 색인에서 상세로 가는 링크 관례 | `docs/gate-design.md:432` | 상주 문서에는 규칙만 두고 서사는 앵커로 이동 |
| 표 파싱 계약 | `plugins/mccp/scripts/lib/plan-review/backlog-append.js:19` | 헤더를 리터럴로 고정하고 열 수를 계약으로 둔다 |
| 테스트 | `plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js:64` | `node:test` + fixture는 `os.tmpdir()` 하위, `finally` 회수 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/env-contract/value.js` | CREATE | 값 규약의 단일 판정 지점 — parseBool/parseEnum/parseIntInRange/parseList |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | CREATE | 전 토글의 kind·values·default·polarity·status·문서 앵커 선언 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | CREATE | 레지스트리 · 런타임 스캔 · 색인 표 삼각 정합을 fail-closed로 검사 |
| `plugins/mccp/scripts/lib/env-contract/tests/value.test.js` | CREATE | 별칭 집합·대소문자·불량값 fail 방향 단언 |
| `plugins/mccp/scripts/lib/env-contract/tests/registry.test.js` | CREATE | 레지스트리 구조 불변식 + TOGGLE_DEFAULTS 파생 동일성 |
| `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js` | CREATE | 6개 검사가 각각 실제로 붉어지는지(비공허성) |
| `docs/environment/gates.md` | CREATE | receipt·Codex·stop-loop·auto-chain·audited escape 상세 |
| `docs/environment/review.md` | CREATE | plan-review L1/L2/L3 · santa · 단일통과 · intent · design critique 상세 |
| `docs/environment/orchestration.md` | CREATE | work 격리/병렬/merge · plan fan-out · runaway · dispatch 상세 |
| `docs/environment/cost.md` | CREATE | cost-state · subscription · handoff · briefing · harness cost 상세 |
| `docs/environment/hooks.md` | CREATE | hook profile/disable · session · quality · governance · MCP · installer 상세 |
| `docs/environment/observability.md` | CREATE | renderer/dashboard · trace · journal · evidence · session-process 상세 |
| `docs/environment/external.md` | CREATE | IMPECCABLE_ · CLV2_ · ECC_ · 표준 CLAUDE_ 및 GITHUB_TOKEN |
| `docs/environment/retired.md` | CREATE | 은퇴·부재·test-only·명시 제외 토큰과 각각의 후속 축 |
| `docs/ENVIRONMENT.md` | UPDATE | 색인 1장으로 축약 — 규약 + 도메인별 표 + 상세 링크만 |
| `CLAUDE.md` | UPDATE | §1.4와 §4의 §11 포인터를 새 색인 앵커로 정정 |
| `docs/multi-session-work-loop/instruction-contract.md` | UPDATE | S4.2 행의 dest_anchor를 새 앵커로 정정해 lint C2 유지 |
| `plugins/mccp/scripts/state/toggle-snapshot.js` | UPDATE | TOGGLE_DEFAULTS를 레지스트리 파생으로 전환 — 두 번째 진실원 제거 |
| `plugins/mccp/scripts/lib/codex-bridge.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/lib/codex-reachability.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/lib/dep-check.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/lib/auto-chain.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/lib/briefing/cost-guard.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | UPDATE | parseBool 이관 — 규약 1과 2가 한 파일에 혼재 |
| `plugins/mccp/scripts/lib/orchestration-preview.js` | UPDATE | parseBool 이관 — 규약 2 |
| `plugins/mccp/scripts/lib/orchestration-runaway.js` | UPDATE | 로컬 별칭 집합을 공유 규약으로 대체 |
| `plugins/mccp/scripts/lib/subscription.js` | UPDATE | parseBool 이관 — 규약 5 |
| `plugins/mccp/scripts/lib/implement-dispatch/route.js` | UPDATE | parseBool 이관 — 규약 5 |
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | UPDATE | parseBool 이관 — 규약 7의 default-on 극성 보존 |
| `plugins/mccp/scripts/lib/plan-review/decide.js` | UPDATE | parseBool 이관 — 규약 6 |
| `plugins/mccp/scripts/lib/session-processes.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | parseBool 이관 — 규약 3의 enabled 별칭 흡수 |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/hooks/receipt-skill.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/hooks/goal-phase-guard.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/hooks/post-tool-use-failure.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/hooks/pr-phase-guard.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/hooks/session-end-trace.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/hooks/ultracode-phase-guard.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/receipt/preflight.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/quality/runner.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/derive/sources/worktrees.js` | UPDATE | parseBool 이관 |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | parseBool 이관 — `MCCP_CODEX_DISABLED !== '1'` (스캔으로 발견, R4 architect CRITICAL) |
| `plugins/mccp/scripts/hooks/governance-capture.js` | UPDATE | parseBool 이관 — `MCCP_GOVERNANCE_CAPTURE` |
| `plugins/mccp/scripts/hooks/stop-review-loop.js` | UPDATE | parseBool 이관 — `MCCP_STOP_LOOP_CODEX` |
| `plugins/mccp/scripts/state/session-spawner.js` | UPDATE | parseBool 이관 — `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN` |
| `plugins/mccp/scripts/lib/env-contract/scan.js` | CREATE | `walkSurfaces(repoRoot)` — Validation 0b·0c·lint L9가 공유하는 단일 walk. 세 번째 구현이 생기는 것을 구조적으로 막는다 (R8 invariant HIGH) |
| `plugins/mccp/commands/plan.md` | UPDATE | parseBool 이관 ×2 — `MCCP_ORCHESTRATION_COST_FAIL_OPEN`(:215) · `MCCP_CODEX_DESIGN_SCOPE_HONOR`(:1683). R6 invariant CRITICAL. **`:1686`의 `2> /dev/null` 제거** — 이관 후 그 자리가 DD1 warn 지점이 된다 (R10 architect CRITICAL) |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | parseBool 이관 — `MCCP_CODEX_DESIGN_SCOPE_HONOR`(:221). R6 invariant CRITICAL. **`:224`의 `2> /dev/null` 제거** — 같은 이유 (R10 architect CRITICAL) |
| `plugins/mccp/commands/work.md` | UPDATE | parseBool 이관 — `MCCP_ORCHESTRATION_COST_FAIL_OPEN`(:237). R6 스캔 확장으로 추가 발견 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump — §3.7 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 신규 항목 + currently 노트 동기 |

## Design Decisions

### DD1 — boolean 계열은 두 kind로 갈리고, 각 kind 안에서 100% 균일하다

**`bool`** — 문서 표기는 예외 없이 `on | off`. 파서가 받는 집합은 대소문자 무시로
`on | 1 | true | yes | enabled`를 ON, `off | 0 | false | no | disabled`를 OFF로 **고정**한다.
`enabled`는 규약 3(`plugins/mccp/scripts/hooks/ecc-context-monitor.js:47`)이 이미 받고 있어 빼면 기존
설정이 깨지므로 상위집합에 포함하고, 대칭을 위해 `disabled`를 함께 넣는다.

**`bypass-flag`** — 문서 표기는 `1 | unset`이고 수용 집합은 **오늘과 정확히 같다**(`=== '1'`).
별칭을 하나도 더하지 않는다. 소속은 레지스트리가 명시하며 **정확히 3개**다:
`MCCP_SKIP_RECEIPT` · `MCCP_CODEX_DISABLED` · `MCCP_ALLOW_CODEX_UNAVAILABLE`.

소속 기준은 **"활성화가 adversarial review 게이트를 제거하거나 약화하는가"**다. 세 토글은 각각
receipt 게이트 우회 · Codex 리뷰 skip · advisory mode 진입이라 전부 해당한다. 이름에 `DISABLE`이
들어가는 것이 기준이 **아니다** — `MCCP_AUTO_CHAIN_DISABLE`은 자동 진행만 멈출 뿐 명령을 직접
호출하면 게이트가 그대로 돌므로 리뷰를 약화하지 않는다. R1 패널이 이 오분류를 CRITICAL로
잡았고(아래 Task 0 감사표), 해당 토글은 `bool`로 간다.

**열거 밖 값은 그 토글의 default로 되돌리고 loud warn을 낸다.** `plugins/mccp/scripts/lib/review-single-pass.js:49`가
확립한 "오타는 권한을 늘리지 못한다"의 일반화다 — default가 안전 쪽으로 정의돼 있으므로 미인식
값은 결코 허용 쪽으로 움직이지 않는다.

두 kind로 가른 것이 UI3을 배신하는 것은 아니다. UI3이 지목한 상태는 규약 **7종**이 임의로
흩어진 것이고, 이 설계가 남기는 것은 **2종**이며 그 경계에 "게이트를 약화하는가"라는 검사 가능한
기준이 있다. 운영자가 기억할 규칙은 "평소엔 `on`/`off`, 우회 플래그는 `1`" 하나다.

### DD2 — 극성은 레지스트리가 선언하고 파서는 읽기만 한다

`parseBool(env, name)`은 이름으로 레지스트리를 조회해 kind와 default를 얻는다. 호출부가 default를
인라인으로 넘기게 두면 같은 토글이 두 파일에서 다른 default를 갖는 오늘의 상태가 재생산된다
(`MCCP_ORCHESTRATION_COST_FAIL_OPEN`이 `plugins/mccp/scripts/lib/orchestration-preview.js:61`과
`plugins/mccp/commands/plan.md`의 셸 블록에서 각각 따로 파싱되는 것이 실례다). 레지스트리에 없는
이름으로 호출하면 **throw** — 미등재 토글이 조용히 동작하는 경로를 코드 수준에서 닫는다.

`bool`·`bypass-flag` 항목은 **구체 default를 반드시 갖는다**(`default: null` 금지 — Task 2의
`undocumented-default` 유예는 비-boolean kind에만 허용된다). default가 `null`이면 "안전 쪽으로
되돌린다"는 DD1의 실패 규약이 가리킬 대상이 없어지고, `bypass-flag`의 T-BYPASS 단언도 무엇과
비교해야 하는지 정의되지 않는다. 레지스트리 test가 이 불변식을 검사한다 — 그리고 그 검사는 **Validation 0이 독립으로 재산출**한다(R6 test HIGH: DD2가 «test가 검사한다»고 선언만 하고 Acceptance·Validation 어디도 그것을 요구하지 않아, `REGISTRY entries=<n>` 마커는 개수만 맞으면 default가 전부 `null`이어도 초록이었다). `registry.test.js`는 `REGISTRY entries=<n> bypass=<n> boolnull=<n>`을 찍고 Validation 7c가 `boolnull=0`을 대조한다.

### DD3 — 게이트 약화 방향으로는 수용 집합을 **넓히지 않는다** (기계적 차단)

초안은 전 boolean 토글의 수용 집합을 넓히고, 그 위험을 "프로세스당 1회 loud stderr notice"라는
**관측**으로 완화하려 했다. L2 패널이 그 설계를 CRITICAL로 반증했고 반증이 맞다. 세 가지가
동시에 틀렸다.

1. **관측은 차단이 아니다.** stderr가 리다이렉트되거나 로그가 스크롤로 밀리면 우회는 그대로
   일어난다. 게이트 약화는 기계로 막아야 한다.
2. **notice 자체가 검증되지 않았다.** 초안 Validation 8은 "notice가 위에 보여야 한다"는 주석뿐이라,
   구현이 notice를 빠뜨려도 통과했다. 검사되지 않는 완화책은 완화책이 아니다.
3. **적용 범위가 이관 대상 26개 파일뿐이었다.** `MCCP_*`를 읽는 지점은 107개 파일에 걸쳐 있어,
   이관 밖 경로가 우회 토글을 읽으면 notice는 발화조차 하지 않는다.

그래서 완화를 버리고 **원인을 제거**한다. DD1의 `bypass-flag` kind는 수용 집합이 오늘과
**바이트 단위로 동일**하므로 잠들어 있던 `MCCP_SKIP_RECEIPT=true`는 이 milestone 이후에도
**여전히 무시된다**. 동작 변경 0건이므로 notice도, CHANGELOG의 동작-변경 고지도 필요 없다.

남은 `bool` 확대는 전부 **안전 방향**임을 레지스트리가 강제한다. `MCCP_RECEIPT_DEBUG=true`는
로그가 늘고, `MCCP_STOP_LOOP_E2E=true`는 test가 늘고, `MCCP_DISPATCH_CONTEXT=true`는 요구
플래그가 늘고(fail-closed), `MCCP_MULTI_SESSION_SCAN=true`는 스캔이 는다. 어느 것도 게이트를
열지 않는다.

두 가지를 기계로 못 박는다.

- **T-BYPASS** — `bypass-flag` 전 항목에 대해, 고정 적대 코퍼스(`on` · `true` · `yes` · `enabled` ·
  `TRUE` · `On` · `1 ` · ` 1` · `01` · `yes please`)의 **모든** 값이 안전 default를 반환해야 한다.
  `'1'` 하나만 활성화한다. 초안의 "주석으로 적힌 기대"를 실행되는 단언으로 바꾼 것이다.
- **lint L9** — 등록된 boolean 토글을 `env-contract/` 밖에서 raw `process.env.X === …` / `!== …`로
  비교하는 지점이 **0건**이어야 한다. 이관 누락과 신규 우회 경로를 같은 검사로 닫는다(패널이 지적한
  107개 파일 범위 문제의 기계적 답).

### DD4 — 문서는 레지스트리의 투영이고, lint가 그것을 검사한다

색인 표의 `값`과 `Default` 셀은 레지스트리에서 파생 가능해야 한다. lint는 값을 **생성**하지 않고
**대조**만 한다 — 생성으로 만들면 문서가 사람이 읽는 문장을 잃는다. 대조 실패는 fail-closed다.

### DD5 — 색인은 `상세` 열로 상세 문서를 가리키고, lint가 앵커까지 해석한다

`plugins/mccp/scripts/lib/instruction-contract/lint.js:11`의 C1/C2를 그대로 미러한다. 링크가 파일까지만
맞고 앵커가 없으면 독자는 8장짜리 문서에서 항목을 손으로 찾아야 하고, 그것은 UI5·UI6이 없애려는
상태 그 자체다.

### DD7 — 사용 예시는 산문이 아니라 검사 대상이다

상세의 각 토글 앵커는 `**사용 예시**` 하위에 fenced 코드 블록을 **최소 1개** 갖는다. 형식은 두 가지만
허용한다: `json` 블록(`settings.json`의 `env` 조각) 또는 `bash` 블록(1회성 토글의 셸 1줄).

세 가지를 함께 검사한다(lint L7). 하나만 검사하면 예시가 있다는 사실만 남고 그것이 맞는지는 아무도
모른다.

1. **존재** — 은퇴 항목을 제외한 모든 토글 앵커에 블록이 있다.
2. **문법** — `json` 블록은 `JSON.parse`가 통과한다. 예시가 붙여넣기용인데 파싱조차 안 되면 예시가 아니다.
3. **값 정합** — 예시가 설정하는 값이 그 토글의 레지스트리 `values`에 속한다. `settings.json`의 값은 전부
   문자열이므로(JSON spec) 예시도 문자열이어야 하고, boolean 토글의 예시는 **canonical 철자**(`"on"`/`"off"`)를
   쓴다 — 문서가 `1`을 가르치면 UI3이 지목한 뒤죽박죽이 예시 층에서 재생산된다.

예시를 레지스트리에서 **생성**하지 않는 이유는 DD4와 같다. 생성된 예시는 전부 같은 모양이라 "이 토글을
언제 쓰는가"를 전달하지 못하고, 그것이 사용 예시의 유일한 존재 이유다.

### DD6 — enum과 numeric 축은 이번에 선언만 하고 파서 이관은 하지 않는다

enum(`off|observe|enforce` 등)과 numeric은 이미 값이 흩어져 있지 않다 — 흩어진 것은 **불량값 처리
방향**이다. 그 통일은 각 소비처의 fail 방향을 하나씩 판정해야 하는 별개 작업이고, boolean 이관과
같은 커밋에 넣으면 회귀 표면이 두 배가 된다. 레지스트리에는 각 enum의 fail 방향을 **기록**하고,
파서 이관은 backlog에 1줄로 남긴다. 이 plan이 통일을 **주장하는 범위는 boolean 계열**이다.

## Tasks

### Task 0: 수용 집합 균일성 감사 (다른 모든 task의 선행 조건)

- **Action**: `bypass-flag` 후보의 **모든** read site를 열거해 각 지점의 비교 형태를 기록하고, 토글별
  수용 집합이 실제로 단일한지 확인한다. "오늘과 동일하게 보존한다"는 주장은 **오늘이 무엇인지
  확정한 뒤에만** 할 수 있다 — 초안은 그 확정 없이 보존을 주장했고 R1 패널이 CRITICAL로 반증했다.
  감사 결과(2026-08-19 실측):

  | 토글 | read site 수 | 비교 형태 | 수용 집합 | 판정 |
  |---|---|---|---|---|
  | `MCCP_SKIP_RECEIPT` | 4 | 전부 `=== '1'` | `{'1'}` | 균일 → `bypass-flag` |
  | `MCCP_CODEX_DISABLED` | 9 | 전부 `=== '1'` / `!== '1'` | `{'1'}` | 균일 → `bypass-flag` |
  | `MCCP_ALLOW_CODEX_UNAVAILABLE` | 3 | 전부 `=== '1'` | `{'1'}` | 균일 → `bypass-flag` |
  | `MCCP_AUTO_CHAIN_DISABLE` | 1 | `envBool` (`auto-chain.js:48`) | `{1,true,yes,on}` | **다름 → `bool`** (`bypass-flag`로 넣으면 수용 집합이 **좁아져** 기존 `=on` 사용자가 깨진다) |

  `MCCP_AUTO_CHAIN_DISABLE`·`MCCP_AUTO_CHAIN_SKIP_PR`이 `bool`로 가면 수용 집합은
  `{1,true,yes,on}` → `{on,1,true,yes,enabled}`로 **`enabled` 하나만 넓어진다**. 게이트 약화 축이
  아니므로(DD1 기준) 허용 범위다.
- **Mirror**: `plugins/mccp/scripts/state/toggle-snapshot.js:184` — 주장을 산문이 아니라 재산출
  가능한 대조로 만드는 그 방식.
- **Validate**: Validation 0b — 감사를 기계로 재실행해 위 표와 일치하는지 확인한다. 표가 낡으면
  실패한다.

### Task 1: 값 규약 파서 신설
- **Action**: `plugins/mccp/scripts/lib/env-contract/value.js`가 **정확히** 다음을 export한다: `TRUE_ALIASES` · `FALSE_ALIASES` · `BYPASS_ACTIVATING_LITERAL`(`'1'`) · `parseBool(env, name)` · `parseEnum(env, name)` · `parseIntInRange(env, name)` · `parseList(env, name)`. 전부 레지스트리에서 kind·default·열거를 읽고, 미등록 이름은 throw한다(DD2). `parseBool`은 kind로 분기한다 — `bool`은 DD1 별칭 집합, `bypass-flag`는 `BYPASS_ACTIVATING_LITERAL` **하나만** 활성화하고 그 외 전부 안전 default(DD3). stderr notice는 두지 않는다.
- **Mirror**: `plugins/mccp/scripts/lib/review-single-pass.js:49` — 열거 검사 + loud warn + 권한 비확대 방향 fail.
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/value.test.js` — **T-BYPASS 포함**: 레지스트리의 `bypass-flag` 전 항목 × 고정 적대 코퍼스(`on`·`true`·`yes`·`enabled`·`TRUE`·`On`·`"1 "`·`" 1"`·`01`·`yes please`)의 모든 조합이 안전 default를 반환하고 `'1'`만 활성화함을 단언한다. 코퍼스가 비었거나 `bypass-flag` 항목이 0개면 **공허 통과로 보지 않고 실패**시킨다. test는 마지막에 `T-BYPASS checked=<n>`을 stdout에 찍는다(n = 항목수 x 코퍼스 10) — Validation 7c가 그 수치를 대조해 단언 0개짜리 초록 test를 걸러낸다.

### Task 2: 토글 레지스트리 신설
- **Action**: (**산출물 계약**: 이 task의 test는 `REGISTRY entries=<n> bypass=<n> boolnull=<n>` 마커를 stdout에 출력한다 — Validate 절에만 두면 마커 없는 test가 초록으로 통과한 뒤 7c가 파싱에서 실패한다. R8 invariant HIGH.) `plugins/mccp/scripts/lib/env-contract/registry.js`가 **정확히** `ENTRIES` · `names()` · `get(name)` · `byKind(kind)` · `byDomain(domain)`을 export한다. 실 토글 117개 + test 전용 2개 + 비-MCCP prefix(ECC_ · CLV2_ · installer CLAUDE_ · GITHUB_TOKEN · IMPECCABLE_ 24개) + 은퇴 7개를 각각 `{ name, kind, values, default, status, domain, doc, evidence }`로 선언한다. `doc`은 `environment/gates.md#mccp_skip_receipt` 형태의 상세 앵커다.
  **`evidence`는 필수이며 `path:line` 형태로 그 토글을 읽는 실제 지점(read site)을 가리킨다** —
  추정 금지를 산문 약속이 아니라 검사 가능한 인용으로 만든다(lint L8이 형식과 실재를 확인).
  가리키는 대상이 **default 리터럴이 아니라 read site**인 것이 중요하다. read site는 모든 토글에
  반드시 존재하지만 default 리터럴은 그렇지 않아서(`process.env.X === '1'`에는 default가 코드로
  적혀 있지 않다), evidence를 "default를 읽어낸 줄"로 정의하면 `status: 'undocumented-default'`
  항목이 만족시킬 수 없는 요구가 되어 레지스트리 test가 구조적으로 실패한다(R3 architect HIGH).
  즉 `evidence`는 **언제나 채워지고**, `default: null`은 "그 지점에 default 리터럴이 없어 확정
  불가"라는 별개의 사실을 말한다.

  **read site가 여럿인 토글에 `evidence`가 하나인 것은 결함이 아니다.** `evidence`의 역할은
  default의 출처를 대는 것이지 소비처를 열거하는 것이 아니고, 소비처 간 파싱이 갈라질 가능성은
  **lint L9**가 별도로 닫는다 — Task 4 이후 등록된 boolean 토글의 raw 비교는 `env-contract/`
  밖에 0건이므로 모든 read site가 같은 `parseBool`을 지나고, 갈라질 파싱 자체가 존재하지 않는다.
  read site **수**의 변화는 Validation 0b가 Task 0 감사표와 대조해 잡는다.
  **경로는 repo-root 상대여야 한다.** `registry.js`는 git-tracked 소스이므로 절대경로를 적으면
  작성자의 홈 디렉토리·사용자명이 저장소에 영구 기록된다 — CLAUDE.md §3.12가 `meta.cwd` 절대경로
  누출을 sanctioned 재봉인 도구까지 만들어 닫았던 바로 그 부류다. 금지 형태는 절대경로(POSIX `/`
  시작 · Windows 드라이브 문자 · UNC `\\`)와 `..` 포함 경로다. 미등재 22개도 같은 규칙을 따르며, 코드를 읽어도 default를 확정할 수 없으면 `status: 'undocumented-default'`로 남기고 backlog에 1줄 append한다 — 단 이 유예는 **비-boolean kind에만** 허용된다(DD2: `bool`/`bypass-flag`는 구체 default 필수).
- **Mirror**: `plugins/mccp/scripts/state/toggle-snapshot.js:13`의 `TOGGLE_DEFAULTS` 형태 + `TOGGLE_EXCLUSIONS`의 근거 동반 규약(`plugins/mccp/scripts/state/toggle-snapshot.js:184`가 근거 셀의 file:line 실재까지 검사하는 그 방식).
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/registry.test.js` — export 표면 · `bool`/`bypass-flag`의 `default !== null` · 전 항목 `evidence` 비어있지 않음 · `bypass-flag` 집합이 DD1의 **3개와 이름까지 일치**(개수만이 아니라 집합 동일성). test는 `REGISTRY entries=<n> bypass=<n> boolnull=<n>`을 stdout에 찍는다(Validation 7c가 `boolnull=0`까지 대조 — R6 test HIGH). **이 마커 출력은 Action의 일부다** — Validate 절에만 적어 두면 마커 없는 test가 초록으로 통과한 뒤 7c가 파싱 단계에서 실패한다(R7 test MEDIUM).

### Task 3: TOGGLE_DEFAULTS 진실원 통합
- **Action**: `plugins/mccp/scripts/state/toggle-snapshot.js`의 `TOGGLE_DEFAULTS` 리터럴을 레지스트리 파생으로 바꾼다. 공개 시그니처(`captureNonDefault` · `writeSnapshot` · `scanSurfaceDetailed`)와 export 목록은 무변경. `defaults_conflicts` 1건(`MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL`이 제외 목록과 defaults에 동시 등장)은 레지스트리에서 `status: 'test-only'`로 단일화해 해소한다.
- **Mirror**: 같은 파일의 기존 `Object.freeze` 상수 관례.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/toggle-snapshot.test.js`

### Task 4: boolean 파서 이관
- **Action**: 진단표 **8종** 규약이 쓰인 전 지점을 `parseBool`로 대체한다(Files to Change의 UPDATE 코드 파일 — 이 목록은 **손으로 세지 않고** Validation 0c의 스캔 출력에서 도출한다). 이관 대상은 **두 surface**다: `plugins/mccp/scripts/**/*.js` 와 `plugins/mccp/commands/*.md`의 `node -e` 스니펫(4건 — R6 invariant CRITICAL). command body는 이미 `$ROOT` 절대경로로 플러그인 모듈을 require하므로(`impeccable-detect` 호출이 선례) `require($ROOT + "/scripts/lib/env-contract/value.js")` 형태로 같은 파서를 지난다. 로컬 별칭 집합(`plugins/mccp/scripts/lib/orchestration-runaway.js:118`의 USD_BOMB 두 Set)은 삭제하고 공유 집합을 쓴다. `plugins/mccp/scripts/lib/implement-dispatch/budget.js:133`의 default-on 극성은 레지스트리 `polarity: 'enable-by-default'`로 표현해 동작을 보존한다.

  **command body 두 지점은 `2> /dev/null`을 함께 걷어낸다** — `plugins/mccp/commands/plan.md:1686` 과 `plugins/mccp/commands/prp-implement.md:224`. 이관 전에는 그 리디렉션이 무해했다(`!== '0'` 비교는 아무것도 출력하지 않는다). 이관 후에는 그 자리가 DD1의 loud warn을 내는 지점이 되므로, 리디렉션을 남기면 **그 두 지점에서만 DD1이 조용히 성립하지 않는다** — 규약을 통일했다는 주장이 부분적으로 거짓이 되는 자리다(R10 architect CRITICAL). `|| echo ""` fail-soft 는 그대로 둔다: 그것은 stdout 대체이지 warn 억제가 아니고, 리디렉션이 사라지면 warn과 모듈 로드 실패가 둘 다 보이게 된다(둘 다 보여야 한다 — 원래 그 리디렉션이 감추던 것이 후자다). Validation 0d가 이 축을 기계로 검사한다.
- **Mirror**: `plugins/mccp/scripts/lib/orchestration-runaway.js:164` `parseUsdBomb` — 별칭 집합 조회 + 불량값 loud warn + 안전 방향 반환.
- **Validate**: Validation 7의 전수 회귀

### Task 5: 정합 lint 신설
- **Action**: `plugins/mccp/scripts/lib/env-contract/lint.js`가 `run(repoRoot)` 하나를 export하고 `--json` CLI를 갖는다. 9개 fail-closed 검사를 둔다. L1 런타임 스캔이 레지스트리의 부분집합(미등재 0) · L2 레지스트리와 색인 표가 양방향 동일(이름·kind·values·default) · L3 색인 `상세` 링크가 파일과 앵커까지 해석 · L4 은퇴 이름이 런타임 표면에 부재 · L5 코드가 실재하는 토글에 stale 상태 마커 0건 · L6 `crossCheckExclusions` 위임 · **L7 사용 예시 3검사**(존재·`JSON.parse` 실행·레지스트리 `values` 정합, DD7) · **L8 `evidence` 형식 + 실재**(Task 2 — 먼저 **어휘 검사**로 절대경로(POSIX `/` 시작 · `X:` 드라이브 · UNC `\\`)와 `..`을 거부하고, 그 다음에 repo-root 기준 실재를 확인한다. 순서가 load-bearing이다: 실재를 먼저 보면 디스크에 존재하는 절대경로가 통과해 §3.12가 닫은 누출 경로가 다시 열린다. `plugins/mccp/scripts/lib/instruction-contract/lint.js:41`의 "어휘 스크린을 fs 호출보다 먼저"와 같은 배치) · **L9 raw 비교 0건**(등록된 boolean 토글을 `env-contract/` 밖에서 `process.env.X === …` / `!== …`로 비교하는 지점 부재 — DD3의 기계적 축이자 이관 누락 탐지기). **L9의 스캔 범위는 Acceptance 주장의 범위와 같아야 한다** — `plugins/mccp/scripts/**/*.js` 뿐 아니라 `plugins/mccp/commands/*.md`까지 걷는다(R6 invariant CRITICAL: 검사 범위가 주장 범위보다 좁으면 그 주장은 fail-open이다). 범위 등식은 **`plugins/mccp/scripts/lib/env-contract/scan.js`가 export하는 `walkSurfaces(repoRoot)` 하나**로 성립한다 — Validation 0b · Validation 0c · lint L9 **셋 다 이 함수를 호출하고 자체 walk를 갖지 않는다**. R6은 “같은 구현을 공유한다”를 규범으로만 적었고, 규범은 세 번째 구현이 생기는 것을 막지 못한다(R8 invariant HIGH). 모듈을 지정하면 drift가 “두 코드가 갈라졌다”가 아니라 “호출하지 않았다”가 되어 Validation 0의 export 계약이 잡는다.

  **공유되는 것은 «파일 열거»이지 분석이 아니다.** `walkSurfaces`는 두 surface의 파일 목록만 돌려주고, 0b(토글별 비교 *형태* 감사) · 0c(파일 단위 raw 비교 유무) · L9(잔존 raw 비교 0건)는 그 목록 위에서 **각자 다른 분석**을 한다. 셋의 결론이 달라도 되는 지점은 분석이고, 절대 달라서는 안 되는 지점이 범위다 — R6 CRITICAL이 범위 불일치였으므로 공유의 단위도 범위다.

  **아래 Validation 0b·0c 블록은 이제 `walkSurfaces`를 실제로 호출한다 — 약속이 아니라 본문의 사실이다.** R9는 교체를 “구현 시”로 미루고 확인을 Acceptance 체크박스에 맡겼는데, 체크박스는 사람이 읽는 문장이지 검사가 아니다(R10에서 invariant HIGH ×2 · architect HIGH가 각각 그 점을 지적했다). 세 소비처가 전부 같은 함수를 부르게 된 지금, 남은 축은 **그 함수가 무엇을 돌려주는가** 하나이고 그것은 Validation 0이 반환 형태로 고정한다 — 두 surface를 모두 덮는 repo-root 상대 POSIX 경로 · `.test.js`와 `env-contract` 자기 자신 제외. 함수가 없으면 0b·0c는 `require`에서 죽고 L9는 spy 마커가 0이 된다(fail-closed 3중). 읽기 실패는 통과가 아니라 drift로 보고한다.

  **기계로 닫히지 않는 것 하나를 명시한다.** 누군가 이 계획서 스니펫에 인라인 walk를 *다시* 넣는 것은 산문에 대한 편집이라 어떤 test도 보지 못한다. 닫힌 것은 «교체가 일어났는가»(일어났고, 본문이 그 증거다)와 «세 범위가 갈라졌는가»(Validation 0이 본다)이며, 열린 것은 «미래의 재도입»이다. 그 축까지 닫으려면 0b·0c를 스크립트 파일로 꺼내 lint 대상으로 만들어야 하는데 그것은 Validation 블록의 자기완결성을 깨므로 이번 범위 밖이다(backlog 1줄).
- **Mirror**: `plugins/mccp/scripts/lib/instruction-contract/lint.js:11`의 4검사 fail-closed + `plugins/mccp/scripts/state/toggle-snapshot.js:184`의 양방향 drift·근거 실재 검사·읽기 실패 처리.
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/lint.test.js` — 9개 검사가 **각각** 붉어지는 fixture를 갖는다(비공허성). 특히 L9는 `process.env.MCCP_CODEX_DISABLED === '1'`을 담은 fixture 파일에서 반드시 실패해야 한다 — fixture는 `.js`와 `.md` **두 확장자로 각각** 둔다(범위 등식의 반증 장치. `.md` fixture가 없으면 L9가 `.js`만 걷도록 되돌아가도 test가 초록이다). **L8은 순서 전용 fixture를 따로 갖는다** — `evidence`가 *디스크에 실재하는 절대경로*인 항목이다. **그 절대경로는 test 실행 시점에 계산하고 소스에 literal로 적지 않는다**(`path.resolve("package.json")` 형태). 이 구분이 load-bearing이다: 리터럴 절대경로는 `plugins/mccp/scripts/lib/tests/evidence-stage-guard.test.js:13-14`가 기록한 history-leak 게이트에 걸리고(그래서 그 test는 합성 경로를 쓴다), 반대로 *합성* 절대경로는 디스크에 없으므로 두 순서 모두가 거부해 fixture가 순서를 구분하지 못한다(공허). 런타임 계산은 둘 다 피한다 — 커밋물에 절대경로 0건이면서 경로는 실제로 실재한다(R8 security HIGH). 실재 확인을 먼저 하는 구현은 이 fixture를 통과시키고 어휘 검사를 먼저 하는 구현만 거부하므로, 이 하나가 순서를 반증 가능하게 만든다(R4 security CRITICAL: 순서가 load-bearing이라고 적혀 있을 뿐 어떤 검사도 순서를 보지 않았다). test는 `LINT L8-order=ok`를 stdout에 찍는다. test는 `LINT negative-fixtures=<n> js=<a> md=<b>`를 stdout에 찍는다(n=9 · `a>=1` · `b>=1`, Validation 7c 대조) — **확장자별 분포까지 마커에 싣는 것이 load-bearing이다**: 총 개수만 보고하면 9건 전부 `.js`이고 `.md` 0건인 fixture 집합이 통과하고, 그러면 위 문장이 `.md` fixture를 반증 장치라고 부르는 근거가 사라진다(R10 test HIGH). **L9가 `scan.walkSurfaces`를 실제로 호출하는지**는 그 함수를 spy로 감싼 test로 확인한다 — 호출 0회면 L9가 자체 walk를 되살린 것이므로 실패시킨다(R8 invariant HIGH: “공유한다”를 산문이 아니라 관측으로 만든다). test는 `LINT walk-spy=<n>`을 stdout에 찍고 **Validation 7c가 `n>=1`을 대조**한다 — 마커 없는 spy는 조용히 삭제될 수 있고, 그러면 관측으로 만들었다는 주장 자체가 공허해진다(R9 architect HIGH).

### Task 6: 상세 문서 8장 신설 (토글마다 사용 예시 포함)
- **Action**: `docs/environment/` 하위 8장을 만들고, 현행 `docs/ENVIRONMENT.md` §1~§9와 §11의 서술을 도메인별로 **이전**한다(삭제 아님). 각 토글은 `### MCCP_X` 앵커를 갖고 그 아래 값·default·판정 순서·흡수 이력·소비처 file:line, 그리고 **사용 예시**를 둔다(DD7). 예시는 `settings.json` 조각을 기본으로 하고, 1회성 토글은 셸 1줄을 함께 적는다. 토글 내부 구획은 `####`가 아니라 **볼드 라벨**로 표기한다 — SKILL Output Constraints의 "정보 위계 3단계"가 heading depth 3을 상한으로 두므로, 상세 문서 전체의 최대 depth는 `###`이다. `retired.md`는 은퇴 7개와 각각의 후속 축을 적는다(은퇴 항목은 예시 면제 — 쓰지 말라는 항목에 사용법을 다는 것은 모순이다). `external.md`는 impeccable skill이 플러그인 번들이 아니라 `.claude/skills/` 설치 경로에 있다는 사실을 정정해 현행 §9의 전제 오류를 닫는다.
- **Mirror**: `docs/gate-design.md:432`의 앵커 + 본문 구조. 예시 형식은 현행 `docs/ENVIRONMENT.md` §8 "빠른 레시피"의 `settings.json` 블록 관례.
- **Validate**: Validation 3의 고아 줄 검사 + Validation 2의 lint L7

### Task 7: 색인 재작성
- **Action**: `docs/ENVIRONMENT.md`를 색인으로 축약한다. 구성은 1. 스코프와 설정 위치 / 2. 값 규약(DD1 표 1장) / **3. 운영 토글 색인 (canonical)** — 도메인별 표 8개, 각 행은 `변수 | 종류 | 값 | Default | 한 줄 설명 | 상세` 6열 / 4. 은퇴와 부재 / 5. 빠른 레시피(링크만) / 6. 변경 이력 관리 규칙. 한 줄 설명은 1문장을 넘기지 않는다(UI5). §3 맨 앞에는 **도메인 목차 8줄**을 두어 첫 화면이 117행이 아니라 8행이 되게 한다 — 표 자체를 접지는 않는다(색인을 접으면 lookup이라는 존재 이유가 사라진다). 문서 전체의 heading depth는 `###`(3)을 넘지 않는다.
- **Mirror**: `CLAUDE.md:787`의 "값을 여기 적지 않는다" 원칙의 역방향 — 색인에는 값만 두고 서사는 상세로 보낸다.
- **Validate**: Validation 2와 Validation 4

### Task 8: 인바운드 포인터 정합
- **Action**: `CLAUDE.md`의 두 §11 참조(§1.4의 자동 게이트 줄, §4의 canonical 레퍼런스 줄)를 `§3 운영 토글 색인 (canonical)`로 고친다. `docs/multi-session-work-loop/instruction-contract.md`의 S4.2 행 dest_anchor를 `3. 운영 토글 색인 (canonical)`로 고친다. 두 편집은 **단일 커밋 불변식** — 한쪽만 착지하면 instruction-contract lint C2가 붉어진다.
- **Mirror**: `plugins/mccp/scripts/lib/instruction-contract/lint.js:11`의 C2/C3 계약.
- **Validate**: Validation 5

### Task 9: 버전 4면 동기
- **Action**: `plugins/mccp/.claude-plugin/plugin.json`을 1.29.0에서 1.29.1로, `plugins/mccp/scripts/lib/renderer/html.js:1419`의 page-foot, `plugins/mccp/scripts/lib/renderer/markdown.js:163`의 derived 줄, `CHANGELOG.md`(신규 항목 + 머리말 currently 노트)를 동기한다. §3.7대로 머지 해소 시점과 `/mccp:pr` 진입 직전 재계산하고, 재상향하면 Validation 6을 다시 돌린다.
- **Mirror**: `CHANGELOG.md:8`의 기존 항목 형식.
- **Validate**: Validation 6

## Validation

```bash
set -eu
cd "$(git rev-parse --show-toplevel)"

# 0) 모듈 계약 — 산문으로만 적힌 인터페이스를 실행 가능한 단언으로 고정한다.
#    Validation 1~8이 전부 이 export들을 전제하므로, 여기서 먼저 반증 가능해야 한다.
node -e 'const v=require("./plugins/mccp/scripts/lib/env-contract/value.js");
const r=require("./plugins/mccp/scripts/lib/env-contract/registry.js");
const l=require("./plugins/mccp/scripts/lib/env-contract/lint.js");
const s=require("./plugins/mccp/scripts/lib/env-contract/scan.js");
const want={value:["TRUE_ALIASES","FALSE_ALIASES","BYPASS_ACTIVATING_LITERAL","parseBool","parseEnum","parseIntInRange","parseList"],
            registry:["ENTRIES","names","get","byKind","byDomain"], lint:["run"], scan:["walkSurfaces"]};
const mods={value:v,registry:r,lint:l,scan:s};
let bad=0;
Object.keys(want).forEach(function(m){want[m].forEach(function(k){
  if(!(k in mods[m])){console.error("missing export: "+m+"."+k);bad++;}});});
// 개수만 세지 않고 **집합 동일성**을 고정한다. `length>0`만 보면 4번째 항목이 몰래 들어와도
// 전 validation을 통과하면서 Acceptance("3개")를 위반한다(invariant/test HIGH).
const WANT_BYPASS=["MCCP_ALLOW_CODEX_UNAVAILABLE","MCCP_CODEX_DISABLED","MCCP_SKIP_RECEIPT"].sort();
if(typeof r.byKind!=="function"){console.error("registry.byKind is not a function");bad++;}
else{
  const got=r.byKind("bypass-flag").map(function(e){return e.name;}).sort();
  if(JSON.stringify(got)!==JSON.stringify(WANT_BYPASS)){
    console.error("bypass-flag set mismatch:\n  want "+WANT_BYPASS.join(", ")+"\n  got  "+(got.join(", ")||"(empty)"));bad++;}
}
if(v.BYPASS_ACTIVATING_LITERAL!=="1"){console.error("BYPASS_ACTIVATING_LITERAL must be \"1\"");bad++;}
// R6 test HIGH — DD2의 `default !== null` 불변식을 여기서 **독립으로** 재산출한다.
// registry.test.js 안에만 두면 그 test가 약해질 때 아무도 모른다. 7c의 `boolnull=0`
// 대조와 합쳐 두 지점에서 같은 사실을 본다.
if(typeof r.byKind==="function"){
  const boolish=r.byKind("bool").concat(r.byKind("bypass-flag"));
  if(boolish.length===0){console.error("no bool/bypass-flag entries — the null-default check would pass vacuously");bad++;}
  const nulls=boolish.filter(function(e){return e.default===null||e.default===undefined;}).map(function(e){return e.name;});
  if(nulls.length){console.error("bool/bypass-flag entries with null default ("+nulls.length+"): "+nulls.join(", "));bad++;}
}
// R10 invariant·architect HIGH — export 실재만으로는 «0b·0c·L9가 같은 범위를 본다»가
// 성립하지 않는다. 셋이 이 함수의 반환을 **그대로** 쓰므로 반환 형태까지 여기서 고정한다.
// 이것이 R9의 「Acceptance 체크박스로 확인」을 대체하는 기계 축이다: 형태가 어긋나면
// 0b·0c·L9가 동시에 붉어지고, 함수가 없으면 셋이 require에서 죽는다(fail-closed).
let walkN=0;
if(typeof s.walkSurfaces!=="function"){console.error("scan.walkSurfaces is not a function");bad++;}
else{
  const got=s.walkSurfaces(process.cwd());
  if(!Array.isArray(got)||got.length===0){console.error("walkSurfaces returned no files — every scope check downstream would pass vacuously");bad++;}
  else{
    walkN=got.length;
    // repo-root 상대 POSIX 경로여야 한다. 0c가 반환값을 그대로 계획서 본문과 문자열
    // 대조하고(백틱 경로), L8이 절대경로를 거부하는 것과 같은 이유다(§3.12 누출).
    const absolute=got.filter(function(p){return /^([A-Za-z]:|[\/\\])/.test(p);});
    if(absolute.length){console.error("walkSurfaces must return repo-root-relative paths; "+absolute.length+" absolute (e.g. "+absolute[0]+")");bad++;}
    if(got.some(function(p){return p.indexOf("\\")!==-1;})){console.error("walkSurfaces must return POSIX separators — 0c compares them against literal paths in the plan body");bad++;}
    if(!got.some(function(p){return p.indexOf("plugins/mccp/scripts/")===0&&p.endsWith(".js");})){console.error("walkSurfaces missed the plugins/mccp/scripts/**/*.js surface");bad++;}
    if(!got.some(function(p){return p.indexOf("plugins/mccp/commands/")===0&&p.endsWith(".md");})){console.error("walkSurfaces missed the plugins/mccp/commands/*.md surface — this is the R6 CRITICAL scope gap");bad++;}
    const leaked=got.filter(function(p){return p.endsWith(".test.js")||p.indexOf("env-contract")!==-1;});
    if(leaked.length){console.error("walkSurfaces must exclude tests and env-contract itself; "+leaked.length+" leaked (e.g. "+leaked[0]+")");bad++;}
  }
}
if(bad)process.exit(1);
console.log("module contract ok (bypass-flag set = "+WANT_BYPASS.join(", ")+", bool-null defaults = 0, walkSurfaces = "+walkN+" files)");'

# 0b) 수용 집합 균일성 감사 재산출 (Task 0) — "오늘과 동일"의 '오늘'을 기계로 확정한다.
#     bypass-flag 로 등록된 토글은 모든 read site가 `=== '1'` / `!== '1'` 형태여야 하고,
#     그 밖의 비교 형태가 하나라도 있으면 그 토글은 bypass-flag 자격이 없다.
node -e 'const fs=require("fs");
const reg=require("./plugins/mccp/scripts/lib/env-contract/registry.js");
const {walkSurfaces}=require("./plugins/mccp/scripts/lib/env-contract/scan.js");
// 공유되는 것은 «파일 열거»이지 분석이 아니다(Task 5). 0b의 분석은 `process.env.<NAME>`
// 비교 **형태** 감사이고 그 대상은 `.js` 표면이므로 열거 결과를 여기서 거른다 — 필터는
// 분석의 일부이지 범위의 축소가 아니다. command body의 bypass-flag 비교는 실측상 전건이
// `[ "${X:-0}" = "1" ]` 셸 형태라 `process.env` read site가 아니고, 이미 canonical
// 리터럴이다(별도 축 — backlog). 그 사실이 뒤집히면 아래 WANT 개수 대조가 먼저 붉어진다.
const files=walkSurfaces(process.cwd()).filter(function(p){return p.endsWith(".js");});
if(files.length===0){console.error("walkSurfaces yielded no .js files — the form audit would pass vacuously");process.exit(1);}
const flags=reg.byKind("bypass-flag").map(function(e){return e.name;});
if(flags.length===0){console.error("no bypass-flag entries — audit would pass vacuously");process.exit(1);}
const bad=[];
flags.forEach(function(n){
  let sites=0;
  files.forEach(function(f){
    const lines=fs.readFileSync(f,"utf8").split(/\r?\n/);
    lines.forEach(function(l,i){
      if(l.indexOf(n)===-1) return;
      if(/^\s*(\/\/|\*)/.test(l)) return;
      sites++;
      // 3줄 창으로 본다. 한 줄만 보면 `const raw = process.env.X;` / `return raw === "1";`
      // 처럼 이름과 비교가 갈라진 정상 코드가 거짓 위반이 된다(R3 test HIGH). 창을 넓히면
      // 반대로 무관한 인접 비교를 삼킬 수 있으므로 3줄로 제한하고, 창 안에 `=== '1'`류나
      // parseBool 호출이 전혀 없을 때만 위반으로 본다.
      const win=lines.slice(i,i+3).join("\n");
      const strict=/(===|!==)\s*[\x27"]1[\x27"]/.test(win);
      const viaParser=/parseBool\(/.test(win);
      if(!strict && !viaParser) bad.push(n+" @ "+f+":"+(i+1)+" -> "+l.trim().slice(0,90));
    });
  });
  // Acceptance 가 "Task 0 감사표와 일치"를 요구하므로 존재가 아니라 **개수**를 본다.
  // sites>0 만 보면 read site 가 늘거나 줄어도 표가 낡은 채 통과한다(R4 invariant HIGH).
  const WANT={"MCCP_SKIP_RECEIPT":4,"MCCP_CODEX_DISABLED":9,"MCCP_ALLOW_CODEX_UNAVAILABLE":3};
  if(!(n in WANT)) bad.push(n+" is bypass-flag but has no expected read-site count in the Task 0 audit table");
  else if(sites!==WANT[n]) bad.push(n+" read sites = "+sites+", Task 0 audit table says "+WANT[n]+" — the table is stale or a site moved");
});
if(bad.length){console.error("bypass-flag acceptance-set drift ("+bad.length+"):");
  bad.slice(0,20).forEach(function(b){console.error("  "+b);});process.exit(1);}
console.log("bypass-flag acceptance sets uniform across "+files.length+" files ("+flags.join(", ")+")");'

# 0c) 이관 목록 완전성 — Files to Change 가 스캔 출력을 **덮는지**.
#     R4 architect가 `session-start.js:1062`(`MCCP_CODEX_DISABLED !== '1'`)이 목록에 없어
#     lint L9가 이 계획 자신의 산출물에서 실패한다고 CRITICAL로 지적했다. 손으로 센 목록은
#     또 틀리므로, 완전성 주장 자체를 여기서 기계로 검사한다.
#
#     R6 invariant CRITICAL 흡수: 스캔은 이제 `plugins/mccp/scripts/**/*.js` 와
#     `plugins/mccp/commands/*.md` **두 surface**를 모두 걷는다. command body 안의
#     `node -e` 스니펫도 실행되는 production 코드이고, 실제로 등록 boolean 토글을 raw로
#     비교하는 지점이 4건(plan.md ×2 · prp-implement.md · work.md) 있었다.
#
#     알려진 한계: 이 스캔은 `process.env.<NAME>` 리터럴 지점을 찾는다. 토글을 모듈 상수로
#     한 번 감싼 소비처(`subscription.js`의 `ENV_MODE` 등)는 이름이 비교 줄에 없어 잡히지
#     않으므로 Files to Change 에 명시로 올려 두었다. L9는 두 형태를 모두 봐야 한다.
node -e '
const fs=require("fs");
const reg=require("./plugins/mccp/scripts/lib/env-contract/registry.js");
const {walkSurfaces}=require("./plugins/mccp/scripts/lib/env-contract/scan.js");
const BOOL=reg.byKind("bool").concat(reg.byKind("bypass-flag")).map(function(e){return e.name;});
if(BOOL.length===0){console.error("no boolean entries in registry — 0c would pass vacuously");process.exit(1);}
const hits=new Set();
// R6 invariant CRITICAL — 두 surface를 모두 걷는다. 이전에는 `plugins/mccp/scripts`의
// `.js`만 걸어서 command body(`plugins/mccp/commands/*.md`)의 raw 비교 4건이 스캔 밖에
// 있었다. Acceptance는 «env-contract/ 밖 0건»을 주장하는데 검사 범위가 그보다 좁으면
// 그 주장은 fail-open이다 — 주장 범위 == 검사 범위 == 이관 범위를 여기서 맞춘다.
// R10: 그 범위를 이제 `scan.js#walkSurfaces`가 **소유**하고 Validation 0이 반환 형태로
// 고정한다. 여기에 인라인 walk를 다시 두면 셋이 갈라지므로 두지 않는다.
walkSurfaces(process.cwd()).forEach(function(f){
  const lines=fs.readFileSync(f,"utf8").split(/\r?\n/);
  lines.forEach(function(l,i){
    if(/^\s*(\/\/|\*)/.test(l))return;
    if(!BOOL.some(function(n){return l.indexOf(n)!==-1;}))return;
    const win=lines.slice(Math.max(0,i-2),i+3).join("\n");
    if(/(===|!==)\s*[\x27"](0|1|on|off|true|false)[\x27"]/.test(win)||/envBool\(/.test(win))
      hits.add(f);   // walkSurfaces가 이미 repo-root 상대 POSIX 경로를 준다(Validation 0이 고정)
  });
});
const plan=fs.readFileSync(".claude/plans/environment-doc-uniformity.plan.md","utf8");
const missing=[...hits].filter(function(f){return plan.indexOf("`"+f+"`")===-1;}).sort();
if(missing.length){console.error("raw-comparison files NOT in Files to Change ("+missing.length+"):");
  missing.forEach(function(m){console.error("  "+m);});
  console.error("lint L9 would fail on these after Task 4. Add them or explain the exclusion.");process.exit(1);}
console.log("migration list covers all "+hits.size+" scanned raw-comparison files");'

# 0d) 경고가 도달하는가 — DD1의 "열거 밖 값은 default로 되돌리고 loud warn을 낸다"는
#     stderr가 살아 있을 때만 성립한다. 실측(R10 architect CRITICAL): 이관 대상인
#     `plugins/mccp/commands/plan.md:1686` 과 `plugins/mccp/commands/prp-implement.md:224` 의 `node -e` 블록이
#     `2> /dev/null` 로 stderr를 버린다. 그 자리에서 parseBool이 warn을 내면 그 warn은
#     아무에게도 도달하지 않으므로, DD1은 이 두 지점에서만 조용히 성립하지 않는다 —
#     «규약을 통일했다»가 부분적으로 거짓이 되는 지점이라 흡수 대상이다.
#     `|| echo ""` fail-soft 는 유지한다: 그것은 stdout 대체이지 warn 억제가 아니고,
#     리디렉션을 걷어내면 warn과 모듈 로드 실패가 둘 다 보이게 된다(둘 다 보여야 한다).
node -e '
const fs=require("fs");
const dir="plugins/mccp/commands";
const files=fs.readdirSync(dir).filter(function(f){return f.endsWith(".md");});
const bad=[];let blocks=0;
files.forEach(function(f){
  const p=dir+"/"+f;
  const lines=fs.readFileSync(p,"utf8").split(/\r?\n/);
  lines.forEach(function(l,i){
    if(l.indexOf("env-contract/value")===-1)return;
    blocks++;
    // 창은 그 `node -e` 블록의 종료 줄(닫는 따옴표 + 리디렉션)을 덮을 만큼만 잡는다.
    // 0b의 3줄 창과 같은 이유로 좁게 둔다 — 넓히면 무관한 인접 리디렉션을 삼킨다.
    const from=Math.max(0,i-6);
    lines.slice(from,i+7).forEach(function(w,j){
      if(/2>\s*\/dev\/null|\/dev\/null\s+2>&1/.test(w))
        bad.push(p+":"+(from+j+1)+" -> "+w.trim().slice(0,80));
    });
  });
});
if(blocks===0){console.error("no command-body block requires env-contract/value — the Task 4 command-body migration did not land, so 0d would pass vacuously");process.exit(1);}
if(bad.length){console.error("stderr suppressed around a migrated parseBool block ("+bad.length+"):");
  bad.forEach(function(b){console.error("  "+b);});
  console.error("DD1 requires a loud warn for non-canonical values; 2> /dev/null discards it. Drop the redirect and keep the `|| echo \"\"` fallback.");process.exit(1);}
console.log("command-body parseBool blocks keep stderr: "+blocks+" block(s), 0 suppressed");'

# 1) 진단 재산출 — 미등재 0, defaults 모순 0
node -e 'const ts=require("./plugins/mccp/scripts/state/toggle-snapshot.js");
const reg=require("./plugins/mccp/scripts/lib/env-contract/registry.js");
const r=ts.scanSurfaceDetailed(process.cwd());
const known=new Set(reg.names());
const missing=r.toggles.filter(function(n){return !known.has(n);});
if(missing.length){console.error("undocumented toggles: "+missing.join(", "));process.exit(1);}
if(r.defaults_conflicts.length){console.error("defaults_conflicts: "+r.defaults_conflicts.join(", "));process.exit(1);}
console.log("toggles="+r.toggle_count+" registry="+known.size+" undocumented=0 conflicts=0");'

# 2) 삼각 정합 lint — 레지스트리 / 런타임 / 색인 표, 앵커 해석, 사용 예시(L7)까지
#    exit 0 만으로는 부족하다: 빈 JSON을 뱉고 정상 종료하는 lint 도 통과한다(R9 test HIGH).
#    9개 검사가 **각각 보고됐고 각각 ok** 인지를 출력에서 확인한다 — 보고되지 않은 검사는
#    "통과"가 아니라 "돌지 않았다"이다.
node plugins/mccp/scripts/lib/env-contract/lint.js --json > /tmp/env-lint.json || { echo "lint exited non-zero"; exit 1; }
node -e 'const fs=require("fs");
let j=null;try{j=JSON.parse(fs.readFileSync("/tmp/env-lint.json","utf8"));}catch(e){console.error("lint --json produced unparsable output: "+e.message);process.exit(1);}
const WANT=["L1","L2","L3","L4","L5","L6","L7","L8","L9"];
const checks=(j&&j.checks)||{};
const reported=WANT.filter(function(k){return Object.prototype.hasOwnProperty.call(checks,k);});
const absent=WANT.filter(function(k){return reported.indexOf(k)===-1;});
if(absent.length){console.error("lint did not REPORT these checks (absent != passing): "+absent.join(", "));process.exit(1);}
const failed=WANT.filter(function(k){return checks[k]&&checks[k].ok===false;});
if(failed.length){console.error("lint checks failed: "+failed.join(", "));process.exit(1);}
console.log("lint ok: 9/9 checks reported and passing");'

# 2b) 사용 예시 커버리지 — lint L7과 같은 사실을 독립적으로 재산출한다.
#     lint가 검사를 조용히 건너뛰어도(공허 통과) 이 줄이 0/N을 드러낸다.
node -e 'const fs=require("fs");const path=require("path");
const reg=require("./plugins/mccp/scripts/lib/env-contract/registry.js");
const dir="docs/environment";
let anchors=0, withExample=0; const missing=[];
fs.readdirSync(dir).filter(function(f){return f.endsWith(".md") && f!=="retired.md";}).forEach(function(f){
  const body=fs.readFileSync(path.join(dir,f),"utf8");
  const secs=body.split(/\n(?=### )/).filter(function(s){return /^### [A-Z][A-Z0-9_]+/.test(s);});
  secs.forEach(function(s){
    anchors++;
    const name=s.match(/^### ([A-Z][A-Z0-9_]+)/)[1];
    // 라벨 표기 변형(`**사용 예시:**` · `**사용 예시 (…)**`)을 허용한다. 닫는 `**`까지 요구하면
    // 정당한 변형이 거짓 실패가 되고, 저자는 검사를 만족시키려 표기를 비트는 법을 배운다.
    if(!/\*\*사용 예시/.test(s)){ missing.push(f+"#"+name+" (no 사용 예시 block)"); return; }
    const blocks=[...s.matchAll(/```(json|bash)\r?\n([\s\S]*?)```/g)];
    if(blocks.length===0){ missing.push(f+"#"+name+" (no json/bash fence)"); return; }
    // 존재만으로는 부족하다 — json 블록은 실제로 파싱해야 하고, 그 값이 이 토글의
    // 레지스트리 values에 속해야 한다. 정규식만 보면 trailing comma 같은 깨진 예시가
    // 통과한다(패널 지적).
    let ok=true;
    blocks.filter(function(b){return b[1]==="json";}).forEach(function(b){
      let parsed=null;
      try{ parsed=JSON.parse(b[2]); }catch(e){ missing.push(f+"#"+name+" (JSON.parse failed: "+e.message+")"); ok=false; return; }
      const env=(parsed && parsed.env) || parsed || {};
      if(Object.prototype.hasOwnProperty.call(env,name)){
        const val=env[name];
        if(typeof val!=="string"){ missing.push(f+"#"+name+" (example value is not a string; settings.json env values are strings)"); ok=false; return; }
        const e=reg.get(name);
        if(e && Array.isArray(e.values) && e.values.length && e.values.indexOf(val)===-1){
          missing.push(f+"#"+name+" (example value \""+val+"\" not in registry values ["+e.values.join("|")+"])"); ok=false;
        }
      }
    });
    if(ok) withExample++;
  });
});
if(anchors===0){console.error("no toggle anchors found under "+dir+" — the check would pass vacuously");process.exit(1);}
if(missing.length){console.error("usage-example defects ("+missing.length+"):");
  missing.slice(0,15).forEach(function(m){console.error("  "+m);});process.exit(1);}
console.log("usage examples: "+withExample+"/"+anchors+" (existence + JSON.parse + registry values)");'

# 3) 고아 줄 검사 — 축약이 이전인지 삭제인지
node -e 'const cp=require("child_process");const fs=require("fs");const path=require("path");
function norm(s){return s.replace(/\s+/g," ").trim();}
const before=cp.execFileSync("git",["show","origin/main:docs/ENVIRONMENT.md"],{encoding:"utf8"});
const dest=["docs/ENVIRONMENT.md"].concat(fs.readdirSync("docs/environment").map(function(f){return path.join("docs/environment",f);}));
const pool=new Set();
dest.forEach(function(p){fs.readFileSync(p,"utf8").split(/\r?\n/).forEach(function(l){pool.add(norm(l));});});
const orphans=before.split(/\r?\n/).map(norm)
  .filter(function(l){return l.length>=40 && /MCCP_|IMPECCABLE_|CLV2_|ECC_/.test(l);})
  .filter(function(l){return !pool.has(l);});
if(orphans.length){console.error("orphan lines ("+orphans.length+"):");
  orphans.slice(0,10).forEach(function(l){console.error("  "+l.slice(0,120));});process.exit(1);}
console.log("orphan lines: 0");'

# 4) 색인이 실제로 색인인가 — 크기 상한 + 6열 고정 + stale 마커 0
node -e 'const fs=require("fs");const b=fs.readFileSync("docs/ENVIRONMENT.md","utf8");
const bytes=Buffer.byteLength(b,"utf8");
if(bytes>28000){console.error("index too large: "+bytes+" B (limit 28000)");process.exit(1);}
if(!/^## 3\. .*\(canonical\)$/m.test(b)){console.error("canonical index heading missing");process.exit(1);}
const stale=(b.match(/\u{1F6A7}\s*(미구현|예정)/gu)||[]).length;
if(stale){console.error("stale status markers: "+stale);process.exit(1);}
const rows=b.split(/\r?\n/).filter(function(l){return /^\|\s*`(MCCP|ECC|CLV2|CLAUDE|IMPECCABLE|GITHUB)_/.test(l);});
const bad=rows.filter(function(l){return l.split("|").length-1!==7;});
if(bad.length){console.error("index rows with wrong column count: "+bad.length);
  bad.slice(0,5).forEach(function(l){console.error("  "+l.slice(0,100));});process.exit(1);}
console.log("index bytes="+bytes+" rows="+rows.length+" stale=0");'

# 4b) heading depth 상한 — SKILL Output Constraints "정보 위계 3단계"
node -e 'const fs=require("fs");const path=require("path");
const files=["docs/ENVIRONMENT.md"].concat(fs.readdirSync("docs/environment").map(function(f){return path.join("docs/environment",f);}));
const bad=[];
files.forEach(function(f){
  fs.readFileSync(f,"utf8").split(/\r?\n/).forEach(function(l,i){
    if(/^#{4,6}\s/.test(l)) bad.push(f+":"+(i+1)+" "+l.slice(0,60));
  });
});
if(bad.length){console.error("heading depth > 3 ("+bad.length+"):");
  bad.slice(0,10).forEach(function(b){console.error("  "+b);});process.exit(1);}
console.log("heading depth <= 3 across "+files.length+" files");'

# 5) 지시문 도달성 lint — S4.2 dest_anchor 정정이 실제로 해석되는가
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 6) version 4면 동기
node -e 'const fs=require("fs");
const v=JSON.parse(fs.readFileSync("plugins/mccp/.claude-plugin/plugin.json","utf8")).version;
const need=[["plugins/mccp/scripts/lib/renderer/html.js","v"+v],
            ["plugins/mccp/scripts/lib/renderer/markdown.js","v"+v],
            ["CHANGELOG.md","["+v+"]"]];
let bad=0;
need.forEach(function(p){if(!fs.readFileSync(p[0],"utf8").includes(p[1])){console.error("version drift: "+p[0]+" lacks "+p[1]);bad++;}});
if(bad)process.exit(1);
console.log("version 4-surface sync ok at "+v);'

# 7a) 신규 test 파일 실재 — 이것이 없으면 7b의 glob 실패가 "회귀 검출"로 오독된다.
#     파일 부재와 회귀는 다른 사실이므로 다른 검사로 가른다(패널 지적).
node -e 'const fs=require("fs");
const need=["plugins/mccp/scripts/lib/env-contract/tests/value.test.js",
            "plugins/mccp/scripts/lib/env-contract/tests/registry.test.js",
            "plugins/mccp/scripts/lib/env-contract/tests/lint.test.js"];
const missing=need.filter(function(p){return !fs.existsSync(p);});
if(missing.length){console.error("planned test files not created ("+missing.length+"): "+missing.join(", "));
  console.error("This is an IMPLEMENTATION GAP, not a regression. Create them before running 7b.");process.exit(1);}
console.log("new test files present: "+need.length+"/"+need.length);'

# 7b) 전수 회귀 — Node v24에서 디렉토리 인자는 MODULE_NOT_FOUND이므로 glob 형태
node --test \
  "plugins/mccp/scripts/lib/tests/*.test.js" \
  "plugins/mccp/scripts/lib/env-contract/tests/*.test.js" \
  "plugins/mccp/scripts/lib/plan-review/tests/*.test.js" \
  "plugins/mccp/scripts/lib/implement-dispatch/tests/*.test.js" \
  "plugins/mccp/scripts/hooks/tests/*.test.js" \
  "plugins/mccp/scripts/receipt/tests/*.test.js" \
  "plugins/mccp/scripts/derive/tests/*.test.js" \
  "plugins/mccp/scripts/lib/renderer/tests/*.test.js"

# 7c) 비공허성 — "test가 통과했다"와 "test가 그 일을 했다"는 다르다.
#     `test('T-BYPASS', () => {})`는 단언 0개로도 초록이므로 7b가 잡지 못한다(패널 지적).
#     세 신규 test 파일은 각자 **기계 판독 가능한 마커**를 stdout에 찍고, 7c가 그 마커와
#     기대 수치를 대조한다. 마커가 없거나 수치가 0이면 실패한다.
#       value.test.js    → "T-BYPASS checked=<n>"           n = |bypass-flag| x |corpus|
#       registry.test.js → "REGISTRY entries=<n> bypass=<n> boolnull=<n>"   boolnull must be 0
#       lint.test.js     → "LINT negative-fixtures=<n> js=<a> md=<b>"  n = 9 (L1..L9 각각) · a>=1 · b>=1
#       lint.test.js     → "LINT L8-order=ok"                절대경로-실재 fixture 거부 확인
#       lint.test.js     → "LINT walk-spy=<n>"                n >= 1 (L9가 scan.walkSurfaces를 실제 호출)
node -e '
const cp=require("child_process");
const reg=require("./plugins/mccp/scripts/lib/env-contract/registry.js");
const out=cp.execFileSync(process.execPath,["--test",
  "plugins/mccp/scripts/lib/env-contract/tests/value.test.js",
  "plugins/mccp/scripts/lib/env-contract/tests/registry.test.js",
  "plugins/mccp/scripts/lib/env-contract/tests/lint.test.js"],{encoding:"utf8"});
function num(re,label){const m=out.match(re);
  if(!m){console.error("missing marker: "+label+" — the test did not report doing its work");return null;}
  return parseInt(m[1],10);}
const nBypass=reg.byKind("bypass-flag").length;
const checked=num(/T-BYPASS checked=(\d+)/,"T-BYPASS checked");
const entries=num(/REGISTRY entries=(\d+)/,"REGISTRY entries");
const fixtures=num(/LINT negative-fixtures=(\d+)/,"LINT negative-fixtures");
let bad=0;
if(checked===null||checked< nBypass*10){console.error("T-BYPASS covered "+checked+" combinations; expected >= "+(nBypass*10)+" (bypass-flags x 10-value corpus)");bad++;}
if(entries===null||entries<100){console.error("REGISTRY entries="+entries+" — expected the full surface (>=100)");bad++;}
// R6 test HIGH — 개수만 맞으면 default가 전부 null이어도 초록이던 구멍. 마커 부재는
// 0이 아니라 실패다(null 은 «측정되지 않음»이지 «0건»이 아니다).
const boolnull=num(/REGISTRY entries=\d+ bypass=\d+ boolnull=(\d+)/,"REGISTRY boolnull");
if(boolnull===null){console.error("REGISTRY boolnull marker absent — registry.test.js did not report the null-default count");bad++;}
else if(boolnull!==0){console.error("REGISTRY boolnull="+boolnull+" — bool/bypass-flag entries must all carry a concrete default (DD2)");bad++;}
if(fixtures===null||fixtures<9){console.error("LINT negative-fixtures="+fixtures+" — each of L1..L9 needs a fixture that actually fails");bad++;}
// R10 test HIGH — 총 개수만 보면 9건 전부 `.js` 이고 `.md` 0건이어도 초록이다. 그러면
// L9가 `.js`만 걷도록 되돌아가도 test가 붉어지지 않아, Task 5가 `.md` fixture를 «범위
// 등식의 반증 장치»라 부른 근거 자체가 사라진다. 분포를 여기서 대조한다.
const fxJs=num(/LINT negative-fixtures=\d+ js=(\d+)/,"LINT negative-fixtures js");
const fxMd=num(/LINT negative-fixtures=\d+ js=\d+ md=(\d+)/,"LINT negative-fixtures md");
if(fxJs===null||fxMd===null){console.error("negative-fixture extension split not reported — absent != passing (the marker must carry js=<a> md=<b>)");bad++;}
else if(fxJs<1||fxMd<1){console.error("negative fixtures js="+fxJs+" md="+fxMd+" — L9 needs a failing fixture in BOTH extensions; a one-sided set lets a .js-only walk stay green");bad++;}
if(!/LINT L8-order=ok/.test(out)){console.error("missing marker: LINT L8-order=ok — nothing proved that L8 rejects an EXISTING absolute path, i.e. that the lexical screen runs before the fs check");bad++;}
const walkSpy=num(/LINT walk-spy=(\d+)/,"LINT walk-spy");
if(walkSpy===null){console.error("LINT walk-spy marker absent — the spy that proves L9 calls scan.walkSurfaces was not reported (absent != passing)");bad++;}
else if(walkSpy<1){console.error("LINT walk-spy="+walkSpy+" — L9 never called scan.walkSurfaces, so it has its own walk again");bad++;}
// 이 `exit`은 **모든** 검사 뒤에 온다. R9가 walk-spy 검사를 뒤에 덧붙이면서 exit이 그
// 앞에 남았고, 그래서 spy 마커가 없거나 0이어도 `bad++` 만 되고 종료코드는 0이었다 —
// "마커 부재는 통과가 아니라 실패"라는 R9의 흡수가 정확히 그 지점에서 무력했다
// (R10 흡수 중 실측. 라운드가 흡수 편집으로 결함을 만든다는 R4의 교훈의 또 한 사례다).
if(bad)process.exit(1);
console.log("non-vacuity ok: T-BYPASS="+checked+" REGISTRY="+entries+" LINT-fixtures="+fixtures+" (js="+fxJs+" md="+fxMd+") L8-order=ok walk-spy="+walkSpy);'

# 8) 라이브 1회 완주 — 규약이 실제 소비처에서 먹는지 (단위 test 통과와 별개 축).
#    8a: bool 확대가 실제로 동작한다.  8b: bypass-flag 는 확대되지 **않았다**.
#     Acceptance가 "`on`과 `1` 양쪽"을 요구하므로 두 값을 **모두** 실행한다. R3 test 패널이
#     `on`만 돌리면서 양쪽을 주장하던 불일치를 HIGH로 잡았다.
MCCP_SUBSCRIPTION=on node -e 'const s=require("./plugins/mccp/scripts/lib/subscription.js");
if(typeof s.isSubscriptionMode!=="function"){console.error("8a FAIL: subscription.isSubscriptionMode is not a function");process.exit(1);}
if(!s.isSubscriptionMode(process.env)){console.error("8a FAIL: canonical on not honored by MCCP_SUBSCRIPTION");process.exit(1);}
console.log("8a ok: MCCP_SUBSCRIPTION=on honored (kind=bool)");'
MCCP_SUBSCRIPTION=1 node -e 'const s=require("./plugins/mccp/scripts/lib/subscription.js");
if(!s.isSubscriptionMode(process.env)){console.error("8a FAIL: legacy 1 no longer honored by MCCP_SUBSCRIPTION — the bool widening REGRESSED the historical value");process.exit(1);}
console.log("8a ok: MCCP_SUBSCRIPTION=1 still honored (no regression)");'
MCCP_SUBSCRIPTION=off node -e 'const s=require("./plugins/mccp/scripts/lib/subscription.js");
if(s.isSubscriptionMode(process.env)){console.error("8a FAIL: canonical off did not turn MCCP_SUBSCRIPTION off");process.exit(1);}
console.log("8a ok: MCCP_SUBSCRIPTION=off honored");'

# 8b) DD3의 핵심 단언 — 잠들어 있던 non-canonical 값이 우회를 켜지 못한다.
#     초안은 여기서 "notice가 stderr에 보여야 한다"는 주석뿐이라 구현이 빠져도 통과했다.
#     이제는 실제 소비처를 실행해 결과를 단언한다. 레지스트리에서 bypass-flag 전 항목을
#     끌어와 코퍼스를 도는 것은 T-BYPASS(단위)이고, 여기서는 실 소비처 2곳을 확인한다.
#     소비처 함수명은 `codex-bridge.js:210`의 실제 export인 `isDisabled`다. R1 패널이 초안의
#     `isCodexDisabled` 오타를 CRITICAL로 잡았다 — 존재하지 않는 이름이라 TypeError로 즉사해,
#     단언에 도달하기 전에 죽는 test가 통과처럼 보일 수 있었다. 아래 typeof 가드가 그 부류를
#     "검사 실패"로 드러낸다(이름이 또 바뀌면 조용히 넘어가지 않는다).
MCCP_CODEX_DISABLED=true node -e 'const cb=require("./plugins/mccp/scripts/lib/codex-bridge.js");
if(typeof cb.isDisabled!=="function"){console.error("8b FAIL: codex-bridge.isDisabled is not a function — the validation names a consumer API that does not exist");process.exit(1);}
if(cb.isDisabled()){console.error("8b FAIL: MCCP_CODEX_DISABLED=true ACTIVATED the bypass — the acceptance set was widened for a gate-weakening toggle (DD3 violated)");process.exit(1);}
console.log("8b ok: MCCP_CODEX_DISABLED=true stays inert (kind=bypass-flag, unchanged from pre-1.29.1)");'
MCCP_CODEX_DISABLED=1 node -e 'const cb=require("./plugins/mccp/scripts/lib/codex-bridge.js");
if(typeof cb.isDisabled!=="function"){console.error("8b FAIL: codex-bridge.isDisabled is not a function");process.exit(1);}
if(!cb.isDisabled()){console.error("8b FAIL: MCCP_CODEX_DISABLED=1 no longer activates — historical behavior was BROKEN");process.exit(1);}
console.log("8b ok: MCCP_CODEX_DISABLED=1 still activates (no regression)");'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 잠들어 있던 `MCCP_SKIP_RECEIPT=true` 류가 이 milestone 이후 게이트를 우회한다 | **제거됨** | DD3이 원인을 없앴다 — `bypass-flag` kind의 수용 집합이 오늘과 동일해 그 값은 여전히 무시된다. 완화가 아니라 동작 변경 0건이므로 관측에 의존하지 않는다. T-BYPASS(단위) + Validation 8b(실 소비처)가 양쪽에서 단언 |
| `bool` 확대가 안전 방향이라는 주장이 검사되지 않는다 | Medium | kind 소속이 레지스트리에 명시되고 lint L9가 `env-contract/` 밖의 raw 비교를 0건으로 강제한다. 새 토글이 우회 성격인데 `bool`로 등록되면 이 검사는 못 잡으므로, `bypass-flag` 집합은 DD1에 열거하고 registry test가 그 3개와의 집합 동일성을 단언한다 — 집합 변경은 test를 고쳐야만 가능하다 |
| 26개 파일 파서 이관이 조용한 회귀를 만든다 | Medium | Validation 7이 8개 test 디렉토리 전수를 돌린다. 이관은 Task 4 단일 커밋으로 묶어 되돌리기를 1회로 만든다 |
| 레지스트리가 세 번째 진실원이 된다 | Medium | Task 3이 TOGGLE_DEFAULTS를 파생으로 바꿔 진실원을 하나로 줄인다. lint L1/L2가 레지스트리와 런타임·색인의 drift를 fail-closed로 잡는다 |
| 미등재 22개의 default를 추정으로 채운다 | Medium | Task 2가 추정 금지를 명시 — 확인 불가 항목은 `default: null` + `status: 'undocumented-default'`로 남기고 backlog에 1줄. 모르는 것을 아는 것처럼 적는 쪽이 미등재보다 나쁘다 |
| 색인 축약이 이전이 아니라 삭제가 된다 | Medium | Validation 3의 고아 줄 검사가 원본의 실질 줄(40자 이상이며 토글 이름을 포함)이 목적지에 도착했는지 정규화 일치로 검사한다. `.claude/plans/context-budget-cleanup.plan.md`가 같은 게이트를 이미 설계했다 |
| S4.2 dest_anchor만 고치고 CLAUDE.md 포인터를 빠뜨린다(또는 반대) | Medium | Task 8이 두 편집을 단일 커밋 불변식으로 묶고 Validation 5가 lint C2/C3로 검사 |
| §3.7 병렬 브랜치 version 충돌 — 실측 4회 재발 | High | target을 미리 고정하지 않는다. 머지 해소 시점과 `/mccp:pr` 진입 직전 두 번 재계산하고, 재상향 시 Validation 6을 다시 돌린다 |
| enum과 numeric 축이 통일되지 않은 채 "통일했다"로 읽힌다 | Medium | DD6이 범위를 boolean으로 명시하고, 색인 §2 값 규약 표가 enum/numeric은 fail 방향만 선언임을 적는다. 파서 이관은 backlog 1줄 |
| 사용 예시가 형식만 채우고 낡는다 — 존재 검사만으로는 잘못된 예시를 잡지 못한다 | Medium | DD7이 존재·JSON 문법·레지스트리 `values` 정합 3검사를 요구하고 lint L7이 강제한다. 값이 열거를 벗어나면 붉어지므로 default나 열거가 바뀌면 예시가 함께 붉어진다. Validation 2b가 같은 사실을 독립 재산출해 lint의 공허 통과를 드러낸다 |

## Acceptance

- [ ] 모든 task 완료
- [ ] Validation **0 · 0b · 0c · 0d · 1~8** 전부 통과 (0계열은 모듈 계약과 범위 계약이라 1~8의 전제다 — “1~8”로만 적으면 전제가 빠진 채 통과를 주장하게 된다)
- [ ] 패턴을 재발명하지 않고 미러 — review-single-pass의 fail 방향, toggle-snapshot의 양방향 drift, instruction-contract lint의 도달성 4검사
- [ ] 런타임 실 토글 미등재 **0건**, 색인과 레지스트리가 양방향 동일, 색인의 모든 `상세` 링크가 파일과 앵커까지 해석
- [ ] `docs/ENVIRONMENT.md`가 28,000 B 이하이고 stale 상태 마커 0건이며 색인 행이 6열 고정
- [ ] 은퇴 항목을 제외한 **모든** 상세 토글 앵커가 사용 예시를 갖고, 예시의 JSON이 파싱되며 그 값이 레지스트리 `values`에 속함 — Validation 2b가 `N/N`을 출력(앵커 0건이면 공허 통과로 보지 않고 실패)
- [ ] `bool` 토글이 `on`과 `1` 양쪽으로 동일하게 동작 — Validation 8a가 실 소비처를 **실제로 실행**해 확인
- [ ] `bypass-flag` **3개**의 수용 집합이 **오늘과 동일** — T-BYPASS가 적대 코퍼스 전량에 대해 안전 default를 단언하고(공허 통과 불가), Validation 8b가 `=true` 무시 · `=1` 활성 두 방향을 실 소비처에서 확인. 게이트 약화 동작 변경 **0건**
- [ ] Task 0 감사표가 Validation 0b로 재산출되어 일치 — `bypass-flag` 전 항목의 모든 read site가 `=== '1'`/`!== '1'` 형태이고, read site 0건인 유령 항목이 없음
- [ ] 신규 test 3종이 **공허하지 않음** — Validation 7c가 `T-BYPASS checked` · `REGISTRY entries` · `LINT negative-fixtures`(+`js=`/`md=` 분포) · `LINT L8-order` · `LINT walk-spy` 마커와 기대 수치를 대조하고, **종료코드 판정이 그 전부의 뒤에 온다**. 마커 부재는 통과가 아니라 실패
- [ ] 레지스트리 `evidence` 전 항목이 **repo-root 상대 경로** — lint L8이 어휘 검사(절대경로·`..` 거부)를 fs 실재 확인보다 **먼저** 수행. git-tracked 소스에 홈 디렉토리 누출 0건 (§3.12)
- [ ] Validation의 모든 소비처 API 호출이 실재 — 8a/8b의 `typeof` 가드가 존재하지 않는 이름을 통과가 아니라 실패로 드러냄
- [ ] `env-contract/` 밖에서 등록된 boolean 토글을 raw 비교하는 지점 **0건** — lint L9. **주장 범위 == 검사 범위**: `plugins/mccp/scripts/**/*.js` 와 `plugins/mccp/commands/*.md` 두 surface를 모두 걷고, `.js`/`.md` negative fixture를 **각각** 갖고 그 분포를 Validation 7c가 `js=<a> md=<b>` 마커로 대조한다(R6 invariant CRITICAL — 이전 스캔은 `.js`만 걸어 command body의 raw 비교 4건이 주장 밖에 있었다. R10 test HIGH — 총 개수만 세면 한쪽으로 몰린 fixture 집합이 통과해 반증 장치가 무력해진다). 이관 누락과 신규 우회 경로를 같은 검사가 닫음
- [ ] Validation 0b · 0c 스크립트와 lint L9가 **`env-contract/scan.js#walkSurfaces`로 파일을 열거**하고 인라인 `walk` 정의를 갖지 않음 — 0b·0c는 본문에서 이미 호출로 교체됐고(약속이 아니라 사실), L9의 호출은 spy 마커가 관측하며, **반환 형태**(두 surface · repo-root 상대 POSIX · test·env-contract 제외)는 Validation 0이 고정한다. 셋 중 하나라도 어긋나면 붉어진다 (R8 invariant HIGH → R10 invariant·architect HIGH)
- [ ] DD1의 loud warn이 **모든 이관 지점에서 실제로 도달** — command body의 `node -e` 블록이 `2> /dev/null`로 stderr를 버리지 않음. Validation 0d가 `plugins/mccp/commands/*.md` 전량을 스캔하고, 이관 블록 0건이면 공허 통과로 보지 않고 실패 (R10 architect CRITICAL)
- [ ] `bool`·`bypass-flag` 전 항목이 **구체 default를 가짐**(`null` 0건) — DD2의 불변식을 Validation 0이 독립 재산출하고 7c가 `boolnull=0` 마커로 대조. 마커 부재는 통과가 아니라 실패(R6 test HIGH)
- [ ] 레지스트리 전 항목의 `evidence`가 실재하는 `path:line`을 가리킴 — lint L8. default가 확인이었지 추정이 아니었음을 사후 대조 가능
- [ ] `value.js` / `registry.js` / `lint.js`의 export 표면이 계획서 산문과 일치 — Validation 0
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

## L2 Refutation Panel — R0 흡수 기록

R0(`sha256:6e974965…`)은 **divergent**로 막혔다: quorum 3of4 미충족(architect pass · security/test/invariant fail), blocking 10건. 원문은 `.claude/reviews/plan-review-environment-uniformity.md`.

CRITICAL 3 + HIGH 4를 흡수했다(§3.14). 네 건은 **한 축**이었다 — DD3의 "수용 집합을 넓히고 stderr notice로 완화한다"가 틀렸다는 것.

| 지적 | Severity | 흡수 |
|---|---|---|
| invariant: 게이트 약화를 관측(notice)으로 완화한 것은 불변식 위반 | CRITICAL | **DD3 전면 교체** — `bypass-flag` kind 신설, 수용 집합 무변경, 완화 대신 원인 제거 |
| invariant: notice가 실제로 나왔는지 요구하는 acceptance·validation이 없다 | CRITICAL | notice 자체를 폐기. 대신 T-BYPASS(단위) + Validation 8b(실 소비처)가 "무시된다"를 단언 |
| test: Validation 8이 stderr 캡처·단언 없이 주석뿐이라 구현 누락에도 통과 | CRITICAL | Validation 8을 8a/8b로 분리하고 둘 다 결과를 단언. 8b는 `=true` 무시 · `=1` 활성 양방향 |
| security: notice 적용 범위가 26개 파일뿐인데 `MCCP_*` 접근은 107개 파일에 걸침 | HIGH | lint **L9** — `env-contract/` 밖 raw 비교 0건. 범위 문제를 기계 검사로 전환 |
| test: DD7이 `JSON.parse`를 요구하는데 Validation 2b는 정규식만 본다 | HIGH | 2b가 실제로 `JSON.parse` 실행 + 값의 레지스트리 `values` 소속까지 검사 |
| test: 22개 미등재 default가 확인인지 추정인지 검사할 방법이 없다 | HIGH | 레지스트리 `evidence`(`path:line`) **필수** + lint **L8** 경로 실재 검사 |
| invariant: Validation이 전제하는 모듈 인터페이스가 산문에만 있다 | HIGH | **Validation 0** 신설 — export 표면과 `bypass-flag` 비공허성을 실행으로 고정 |

MEDIUM 4건(security ×2 · test ×1 · architect ×1)은 §3.14대로 증거와 함께 `.claude/plans/codex-findings-backlog.md`에 적재했다.

### R1 흡수 기록

R1(`sha256:fd361d53…`)은 **security pass · invariant pass**로 R0의 두 CRITICAL 축이 닫혔음을 확인했으나, architect와 test가 새 결함 2건을 CRITICAL로 냈다. 둘 다 **실측으로 확인**했다.

| 지적 | Severity | 실측 | 흡수 |
|---|---|---|---|
| architect: `MCCP_AUTO_CHAIN_DISABLE`을 `bypass-flag`에 넣으면 수용 집합이 **좁아진다** — `auto-chain.js:48` `envBool`이 이미 `{1,true,yes,on}`을 받는데 `{'1'}`로 줄이는 것은 breaking change이고 "byte-identical" 주장과 모순 | CRITICAL | 확인 — `envBool` 실재, `MCCP_AUTO_CHAIN_DISABLE`의 유일 read site가 그것 | `bypass-flag`를 **3개로 축소**. 분류 기준을 이름(`DISABLE`)이 아니라 "adversarial review 게이트를 약화하는가"로 명문화. 해당 토글은 `bool`(→ `enabled` 하나만 확대) |
| test: Validation 8b가 `cb.isCodexDisabled()`를 부르는데 실제 export는 `isDisabled` — TypeError로 즉사해 단언에 도달조차 못 한다 | CRITICAL | 확인 — `codex-bridge.js:210`이 `isDisabled`로 export | 이름 정정 + **`typeof` 가드** 추가. 이름이 또 바뀌면 조용히 넘어가지 않고 "검사 실패"로 드러난다 |
| architect: "오늘과 동일"을 주장하기 전에 오늘이 균일한지 확인하지 않았다 | HIGH | — | **Task 0 신설** — 후보 4종의 전 read site 감사표를 본문에 기록하고, Validation 0b가 기계로 재산출 |
| test: Validation 7의 glob 실패가 "파일 미생성"인지 "회귀"인지 구분되지 않는다 | HIGH | — | 7a(신규 test 파일 실재) / 7b(전수 회귀)로 분리 |

부수 정정: 진단표의 파싱 규약이 **7종 → 8종**으로 늘었다(`envBool` 누락). 그 누락이 곧 오분류의 원인이었으므로, 세기 자체를 Task 0의 감사로 승격했다.

architect MEDIUM 2 + test MEDIUM 1은 backlog에 적재.

### R2 흡수 기록

R2(`sha256:d0fa1c3f…`)는 **architect pass**로 R1의 오분류 축이 닫혔음을 확인했다. 남은 blocking 9건 중 CRITICAL 2 + HIGH 3을 흡수했다.

| 지적 | Severity | 흡수 |
|---|---|---|
| invariant: `bypass-flag` 개수가 문서 안에서 3과 4로 갈린다(DD1은 3, Task 2 Validate·Risks는 4) | CRITICAL | 편집 누락이었다 — 3으로 통일. 잔여 `4개` 언급 0건 확인 |
| security: `evidence`가 절대경로여도 lint L8을 통과해 git-tracked 소스에 홈 디렉토리가 박힌다 (§3.12가 닫은 `meta.cwd` 누출과 동형) | CRITICAL | `evidence`를 **repo-root 상대**로 규정하고, L8이 **어휘 검사(절대경로·`..` 거부)를 fs 실재 확인보다 먼저** 수행하도록 순서를 고정 |
| invariant·test: Validation 0이 `length===0`만 보아 4번째 항목이 몰래 들어와도 통과한다 | HIGH ×2 | 개수가 아니라 **집합 동일성**(이름까지)을 단언 |
| invariant: `test('T-BYPASS', () => {})`처럼 단언 0개인 test도 7b를 통과한다 | HIGH | **Validation 7c 신설** — 세 test가 마커(`T-BYPASS checked` · `REGISTRY entries` · `LINT negative-fixtures`)와 수치를 stdout에 찍고 7c가 기대값과 대조. 마커 부재는 실패 |

부수 수정(패널이 MEDIUM으로 낸 것 중 **본 계획서 자체의 코드 결함** 2건): Validation 0b의 `.test("")` 죽은 분기 제거, Validation 2b의 `**사용 예시**` 정규식을 표기 변형 허용으로 완화. 설계 지적이 아니라 내가 쓴 스크립트의 버그라 그 자리에서 고쳤다.

architect MEDIUM 1 + test MEDIUM 2는 backlog에 적재.

### R3 흡수 기록

R3(`sha256:bf8fa722…`)은 **security pass · invariant pass**이고 **CRITICAL 0건**이다. blocking은 10 → 9 → **5**로 줄었다. HIGH 3건을 흡수했다.

| 지적 | Severity | 흡수 |
|---|---|---|
| architect: `evidence` 필수와 `status:'undocumented-default'` 허용이 서로 배타라 레지스트리 test가 구조적으로 실패한다 | HIGH | `evidence`의 **지시 대상을 read site로 확정**했다. read site는 모든 토글에 있지만 default 리터럴은 없을 수 있으므로, 둘을 분리하면 배타가 사라진다 — `evidence`는 언제나 채워지고 `default: null`은 별개 사실을 말한다 |
| test: Acceptance는 `on`과 `1` 양쪽을 요구하는데 Validation 8a는 `on`만 실행한다 | HIGH | 8a를 `on` · `1` · `off` 3값으로 확장. `1` 케이스는 확대가 **기존 값을 회귀시키지 않았음**을 보는 축이라 별도 가치가 있다 |
| test: Validation 0b가 한 줄 단위 정규식이라 `const raw = process.env.X;` / `return raw === '1';`처럼 갈라진 정상 코드를 거짓 위반으로 잡는다 | HIGH | **3줄 창** 스캔으로 교체. 창을 넓히면 무관한 인접 비교를 삼키므로 3줄로 제한했다 |

부수 정정: Task 4 서술이 아직 "7종 규약"이라 진단표(8종)와 어긋나 있었다 — R1이 늘린 세기를 task 산문에 반영하지 않은 누락으로, 8종으로 정정했다.

architect MEDIUM 1 + test MEDIUM 2 + invariant MEDIUM 2는 backlog에 적재.

### R4 흡수 기록

R4(`sha256:67f4cdff…`)는 CRITICAL 3 + HIGH 2를 냈다. **전부 이 계획서가 자기 검사에 걸리는 지점**이었고, 셋 다 실측으로 확인했다.

| 지적 | Severity | 실측/흡수 |
|---|---|---|
| architect: `session-start.js:1062`이 `MCCP_CODEX_DISABLED !== '1'`을 쓰는데 Files to Change에 없다 — lint L9가 **이 계획의 산출물에서** 실패한다 | CRITICAL ×2 | 확인. 스캔으로 재도출하니 누락이 4개였다(`session-start.js` · `governance-capture.js` · `stop-review-loop.js` · `session-spawner.js`). 목록에 추가하고, 더 중요하게 **완전성 주장 자체를 Validation 0c로 기계화**했다 — 손으로 센 목록은 또 틀린다 |
| security: L8의 "어휘 검사 먼저" 순서가 load-bearing이라고 적혀 있을 뿐, 어떤 검사도 순서를 보지 않는다 | CRITICAL | **순서 전용 fixture** 의무화 — `evidence`가 *디스크에 실재하는 절대경로*인 항목. 실재를 먼저 보는 구현은 통과시키고 어휘를 먼저 보는 구현만 거부하므로, 이 하나가 순서를 반증 가능하게 만든다. 마커 `LINT L8-order=ok` |
| invariant: Acceptance는 "Task 0 감사표와 일치"를 요구하는데 Validation 0b는 `sites===0`만 본다 | HIGH | 개수를 정확히 대조(4/9/3). read site가 늘거나 줄면 표가 낡은 채로 통과하지 못한다 |
| architect: 추상화 경계가 새는 채로 "단일 진실원"을 주장한다 | HIGH | 위 0c + L9가 함께 닫는다. 다만 스캔의 **알려진 한계**(모듈 상수 경유 소비처는 이름이 비교 줄에 없어 미검출)를 0c 주석에 명시하고, 해당 파일들은 명시 목록으로 올려 두었다 |

security HIGH(3항목 집합을 정의 시점에 구조적으로 강제) + MEDIUM 4 + LOW 2는 backlog에 적재.

이 라운드의 교훈은 하나다 — **손으로 유지하는 목록은 라운드마다 새 결함을 만든다.** R2·R3·R4의 지적 상당수가 설계가 아니라 내가 앞 라운드에서 흡수하며 만든 어긋남이었고, 0c는 그 부류를 구조적으로 없앤다.

### R5 흡수 기록

R5(`sha256:3188f08a…`)는 **security · test · invariant 세 관점이 모두 pass**했다. 남은 blocking은 architect의 CRITICAL 1 + HIGH 1이고, **둘 다 증거로 기각**했다(§3.14).

| 지적 | Severity | 판정 |
|---|---|---|
| "Validation 1이 `undocumented=0`으로 통과하는데 문서 미등재 22개는 레지스트리 엔트리가 없다 — 논리적 모순" | CRITICAL | **기각.** 사실이 반대다. Task 2가 레지스트리에 «실 토글 117개»를 선언하고 117 = 문서 등재 95 + 문서 미등재 22이므로 그 22개는 전부 등재된다. "22"는 **오늘의 `docs/ENVIRONMENT.md` 상태**를 말한 수치이지 미래 레지스트리의 부재가 아니다 |
| "`evidence`가 단수라 read site 9곳 중 1곳만 감사 가능 — 나머지가 갈라지면 못 잡는다" | HIGH | **기각.** `evidence`는 default의 출처를 대는 필드이지 소비처 열거가 아니다. 소비처 간 파싱 분기는 **L9**가 닫는다 — Task 4 이후 raw 비교가 `env-contract/` 밖에 0건이므로 모든 read site가 같은 `parseBool`을 지나고, 갈라질 파싱 자체가 없다. site 수 변화는 0b가 감사표와 대조 |

**기각했지만 원인은 내 쪽에 있었다.** 첫째는 «미등재»라는 한 단어를 (a) 오늘의 문서 상태와 (b) 레지스트리 부재 두 뜻으로 써서 리뷰어가 두 번 헷갈린 것이고, 둘째는 L9가 그 우려를 닫는다는 근거를 본문 어디에도 적지 않은 것이다. 판정은 기각이되 **표현은 둘 다 고쳤다** — 리뷰어를 통과시키려 근거를 바꾼 것이 아니라, 없던 근거를 적었다.

architect MEDIUM 4는 backlog에 적재.

### R6 흡수 기록

R6(`sha256:6aff4206…`)은 **architect pass · security pass**로 R5에서 기각했던 두 축이 다시
제기되지 않았음을 확인했다. 남은 blocking은 invariant CRITICAL 2 + test HIGH 1이고,
**CRITICAL 두 건은 실측으로 확인해 전부 흡수**했다(§3.14). 단일통과 토글이 켜져 있어 `decide`는
`block:false`로 완화했지만, §3.14는 CRITICAL·HIGH를 그 자리에서 흡수하라고 정하므로 완화를
받지 않고 고친 뒤 다시 돌렸다 — 토글이 없애는 것은 라운드 반복이지 결함 수정 의무가 아니다.

| 지적 | Severity | 실측/흡수 |
|---|---|---|
| invariant: Validation 0c·L9의 walk가 `plugins/mccp/scripts`의 `.js`만 걸어서 command body의 raw 비교를 구조적으로 못 본다 | CRITICAL | **확인.** 재산출하니 리뷰어가 든 2건(`plugins/mccp/commands/plan.md:1683` · `plugins/mccp/commands/prp-implement.md:221`)보다 많은 **4건**이었다 — `plugins/mccp/commands/plan.md:215`(`MCCP_ORCHESTRATION_COST_FAIL_OPEN`)와 `plugins/mccp/commands/work.md:237`이 추가. walk를 `plugins/mccp/commands/*.md`까지 넓히고 Files to Change에 3파일을 올렸다 |
| invariant: Acceptance는 “env-contract/ 밖 0건”을 주장하는데 검사 범위가 그보다 좁아 fail-open이다 | CRITICAL | **확인.** 주장 범위 > 검사 범위는 게이트가 아니라 게이트의 외형이다. Acceptance 문구에 두 surface를 명시하고, L9가 0c와 **같은 walk 구현을 공유**하게 해 둘이 갈라지지 않게 했다. `.md` negative fixture를 의무화해 `.js`만 걷도록 되돌아가면 test가 붉어진다 |
| test: DD2가 “레지스트리 test가 이 불변식을 검사한다”고 선언하지만 Acceptance·Validation 어디도 그것을 요구하지 않는다 | HIGH | **확인.** 7c의 `REGISTRY entries=<n>`은 개수만 보므로 `bool` default가 전부 `null`이어도 초록이었다. Validation 0에 독립 재산출을 넣고, 마커를 `boolnull=<n>`으로 확장해 7c가 `0`을 대조한다. 마커 부재는 실패로 처리한다 |

test MEDIUM 1(L8의 positive format regex 미문서화) + LOW 1(`WANT_BYPASS` 정렬 비대칭)은 §3.14대로
처리했다 — LOW는 한 글자 수정이라 그 자리에서 고쳤고(`.sort()` 추가), MEDIUM은 backlog에 적재했다.

**이 라운드가 확인해 준 것**: R4의 교훈(손으로 유지하는 목록은 라운드마다 새 결함을 만든다)이
한 겹 더 있었다. R4는 목록을 스캔으로 대체했지만 **그 스캔의 범위 자체가 손으로 정한 상수**였고,
이번 CRITICAL은 정확히 거기서 나왔다. 그래서 이번 흡수는 파일 3개를 목록에 더한 것이 아니라
주장·검사·이관 세 범위를 **같은 walk 하나로 묶은 것**이다.

### R7 흡수 기록

R7(`sha256:49531ce1…`)이 확인해 준 것이 먼저다 — **architect와 security 두 관점이 R6의 두**
**CRITICAL이 닫혔음을 명시적으로 재확인**했다. architect는 “R6 absorption identifies all 4
command files with raw comparisons (all 3 now in Files to Change)”를, security는 “Validation 0c
scans both .js and .md per R6 fix”를 각각 근거로 들었다. 즉 완화로 넘긴 것이 아니라 실제로
닫혔다는 것을 독립된 두 관점이 확인했다.

남은 blocking에서 CRITICAL은 **하나뿐이고, 그것은 내가 R6에서 만든 오타**였다.

| 지적 | Severity | 실측/흡수 |
|---|---|---|
| test: Validation 7c의 `boolnull` 정규식이 `d+`가 아니라 리터럴 `d+`라 test 출력과 절대 매칭되지 않는다 | CRITICAL | **확인 — 내 오타다.** R6 편집을 셸 경유로 넣으면서 역슬래시가 소실됐다. 같은 블록의 다른 세 정규식(615~617)은 `d+`가 살아 있어 대조가 됐다. **결과는 fail-open이 아니라 fail-closed** — 매칭 실패 시 `boolnull===null`이 되고 바로 위 분기가 `bad++`로 실패시키므로, 통과를 가장하는 것이 아니라 항상 거짓 실패한다. 그래도 깨진 검사이므로 고쳤다(`d+` 복원, 문자코드로 삽입해 재소실 차단). 파일 전체를 재스캔해 다른 소실 0건 확인 |
| test: Task 2의 **Action**은 마커 출력을 요구하지 않고 **Validate**에만 적혀 있어, 마커 없는 test가 초록으로 통과한 뒤 7c가 파싱에서 실패한다 | MEDIUM | 한 절 추가로 흡수했다 — §3.14는 MEDIUM을 backlog로 보내지만, 이 항목은 방금 내가 추가한 마커 계약 자체의 구멍이라 그 자리에서 닫는 편이 왕복보다 싸다 |

invariant는 이번 라운드에 **CRITICAL·HIGH를 하나도 내지 않았다**(MEDIUM 2건뿐). §3.14의
판정 규칙대로 자기 최고 severity가 MEDIUM 이하인 리뷰어는 수렴으로 본다. 그 2건과 architect가
pass 판정 중 관찰로 남긴 “walk 공유가 규범일 뿐 추출 메커니즘이 없다” 1건은 backlog에 적재했다.

**여기서 라운드를 닫는다.** R6→R7의 이동은 «설계 결함 2건»에서 «내 오타 1건 + MEDIUM»으로
내려왔고, 이것이 수렴의 형태다. 남은 MEDIUM들은 전부 “검사를 더 촘촘히 할 수 있다” 부류이지
“주장과 검사가 어긋난다” 부류가 아니다 — 후자였던 R6의 두 건과는 종류가 다르다.

### R8 흡수 기록 (최종 라운드)

R8(`sha256:25e98b49…`)에서 **architect와 test가 pass**했다. R7에서 fail이던 test가 pass로,
R7에서 pass이던 security가 fail로 바뀌었다 — 관점별 verdict가 라운드마다 자리를 바꾸는 것은
§3.14가 임시 규칙을 둔 이유(리뷰어 verdict 불안정)의 실측이고, 이것이 이 라운드를 마지막으로
두는 근거다. 남은 HIGH 3건은 전부 **국소적이고 설계를 바꾸지 않는** 명세 정밀도 결함이라 흡수했다.

| 지적 | Severity | 실측/흡수 |
|---|---|---|
| security: L8 순서 fixture가 «디스크에 실재하는 절대경로»를 요구하는데 Acceptance는 «git-tracked 소스에 절대경로 0건»을 요구한다 — 명세 충돌 | HIGH | **확인.** 선례 `plugins/mccp/scripts/lib/tests/evidence-stage-guard.test.js:13-14`가 history-leak 게이트 때문에 *합성* 절대경로를 쓴다고 명시한다. 그런데 합성 경로는 디스크에 없어 두 순서 모두 거부 → fixture가 공허해진다. 해소는 제3의 길이다: **런타임 계산**(`path.resolve("package.json")`) — 커밋물에 절대경로 0건이면서 경로는 실재한다. 그 문장을 Task 5에 명시했다 |
| invariant: «Validation 0c와 같은 walk를 공유한다»가 규범일 뿐 공유 모듈 위치가 없다 — 세 번째 구현이 생기면 셋이 갈라진다 | HIGH | **확인. R6 흡수가 만든 구멍이다.** 모듈을 `plugins/mccp/scripts/lib/env-contract/scan.js#walkSurfaces`로 **지정**하고 0b·0c·L9 셋이 그것을 호출하게 했다. 지정의 효과는 drift의 성격을 바꾸는 것이다 — «두 코드가 갈라졌다»(관측 불가)에서 «호출하지 않았다»(spy로 관측 가능 + Validation 0의 export 계약이 모듈 실재를 고정)로 |
| invariant: Task 2의 마커 요구가 Validate 절에만 있어 Action만 읽는 구현자는 마커 없는 test를 만든다 | HIGH | **확인. R7 흡수가 절반만 된 것이다** — R7에서 “이 마커 출력은 Action의 일부다”라는 문장을 넣었지만 그 문장 자체를 **Validate 절에** 두었다. Action 불릿 맨 앞으로 «산출물 계약»을 올렸다 |

MEDIUM 3(0c 주석 필터 정밀도 · 머리말 version 고정의 자기모순 · Task 8 단일커밋의 비기계적 강제)과
LOW 1(L8이 인용 줄의 내용을 보지 않음)은 §3.14대로 backlog에 적재했다.

**여기서 게이트를 닫는다.** R6→R8의 궤적은 «설계 결함»(주장과 검사의 범위 불일치) → «내 오타» →
«명세 정밀도»로 내려왔고, 마지막 두 라운드의 HIGH는 전부 *직전 라운드에서 내가 흡수하며 만든*
것이었다. 이 수렴 형태에서 라운드를 더 도는 것은 새 결함을 만드는 쪽에 가깝다 — R4가 이미 같은
교훈을 기록했다. 이후 라운드의 지적은 backlog가 받는다.

### R9 흡수 기록 (게이트 종료 라운드)

R9(`sha256:24a3f8ec…`)에서 **security가 pass**했다. 흡수한 HIGH 3건 중 **두 건은 내가 R8에서**
**만든 것**이고, 그것이 이 라운드를 마지막으로 두는 결정적 근거다.

| 지적 | Severity | 실측/흡수 |
|---|---|---|
| invariant: “0b·0c·L9 셋 다 `walkSurfaces`를 호출하고 자체 walk를 갖지 않는다”는 R8의 문장이 **같은 계획서의 0b·0c 스니펫과 모순**된다(둘 다 인라인 `walk`를 정의한다) | HIGH | **확인 — R8 흡수가 만든 자기모순이다.** 두 가지를 고쳤다. (1) 공유의 **단위**를 «파일 열거»로 정확히 했다 — 0b/0c/L9는 분석이 서로 다르고, 같아야 하는 것은 범위뿐이다(R6 CRITICAL이 범위 불일치였으므로). (2) 인라인 스니펫이 `scan.js` 이전에 쓰인 참조 구현임을 **명시하고 교체를 Task 5 범위 + Acceptance 항목으로** 올렸다. 스니펫을 지금 다시 쓰지 않은 것은 의도적이다 — R7의 CRITICAL이 정확히 «셸 경유로 코드를 고치다 생긴 오타»였다 |
| architect: R8이 도입한 spy가 마커를 갖지 않아 Validation 7c가 그 존재를 관측하지 못한다 — spy가 조용히 삭제돼도 아무도 모른다 | HIGH | **확인 — 역시 R8이 만든 것이다.** 다른 세 마커와 같은 형태로 `LINT walk-spy=<n>`을 찍게 하고 7c가 `n>=1`을 대조한다. 마커 부재는 통과가 아니라 실패 |
| test: Validation 2가 lint를 실행만 하고 **출력에 아무 단언도 하지 않는다** — 빈 JSON을 뱉고 exit 0 하는 lint도 통과한다 | HIGH | **확인.** 9개 검사가 **각각 보고됐고 각각 ok** 인지를 대조한다. 핵심은 «보고되지 않은 검사 = 통과»가 아니라 «돌지 않았다»로 처리하는 것이다 |
| test: Task 0 감사표와 0b가 같은 방법을 써서 순환 검증이다 | HIGH | **증거로 기각(§3.14).** 전제가 틀렸다 — Task 0은 사람이 read site를 열거한 수기 표이고 0b는 정규식 스캔이다. 서로 다른 두 방법이므로 순환이 아니라 교차검증이고, 0b의 하드코딩 `WANT`가 대조하는 대상이 바로 그 수기 표다. backlog에 기각 사유와 함께 기록 |

MEDIUM 4건(부트스트랩 순서 미문서화 · 0b 기대치 갱신 경로 · 0c의 `.md` 양성 fixture · Validation
task 의존성 주석)은 backlog에 적재했다.

**게이트를 여기서 닫는다 — 판단 근거를 남긴다.** R6~R9 네 라운드의 궤적은 명확하다:
R6의 CRITICAL 2건은 **원래 계획서에 있던 설계 결함**(주장 범위 > 검사 범위)이었고 그것은 닫혔다.
이후 R7·R8·R9가 낸 CRITICAL·HIGH는 **한 건을 빼고 전부 직전 라운드의 내 흡수 편집이 만든 것**이다
— 오타 1건, 명세 미지정 2건, 자기모순 1건, 마커 누락 1건. 즉 지금 관측되는 것은 계획의 결함률이
아니라 **편집의 결함률**이고, 라운드를 더 도는 것은 그 분모를 키운다. R4가 이미 같은 교훈을
기록했다(“손으로 유지하는 것은 라운드마다 새 결함을 만든다”).

관점별 verdict도 라운드마다 자리를 바꿨다 — test는 R7 fail → R8 pass → R9 fail, security는
R7 pass → R8 fail → R9 pass. §3.14가 임시 규칙을 둔 이유(리뷰어 verdict 불안정)의 실측이다.
남은 지적은 backlog가 받고, 구현 단계의 Validation이 실제 코드에 대해 같은 축을 다시 검사한다.

### R10 흡수 기록 (단일통과 봉인 라운드)

R9가 “게이트를 여기서 닫는다”고 적은 뒤에도 라운드가 한 번 더 돌았다. R10(`sha256:6ce355ac…`)은
divergent였고 `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`로 봉인됐다 — receipt는
`review_verdict='divergent'` 그대로이고, blocking 9건은 §3.15대로 backlog에 자동 적재됐다
(`backlog_appended=9`). 그 9건의 CRITICAL 1 + HIGH 5는 **세 축**으로 모이고 셋 다 §3.14 기준
흡수 대상이라 여기서 흡수했다. 원문은 `.claude/reviews/plan-review-environment-doc-uniformity.md`.

| 지적 | Severity | 실측/흡수 |
|---|---|---|
| architect: 이관 대상 command body 두 지점이 `2> /dev/null`로 stderr를 버려, 이관 후 DD1이 요구하는 loud warn이 아무에게도 도달하지 않는다 | CRITICAL | **확인 — 소스에서 실측했다**(`plugins/mccp/commands/plan.md:1686` · `plugins/mccp/commands/prp-implement.md:224`, 둘 다 `2> /dev/null \|\| echo ""`). 이관 **전에는 무해했다**는 점이 핵심이다 — `!== '0'` 비교는 아무것도 출력하지 않으므로 그 리디렉션이 감추던 것은 모듈 로드 실패뿐이었고, 이관이 그 자리를 warn 지점으로 바꾼다. Task 4에 리디렉션 제거를 명시하고 **Validation 0d**를 신설해 `commands/*.md` 전량에서 이관 블록 주변의 stderr 억제를 기계로 금지했다. `\|\| echo ""` 는 유지 — stdout 대체이지 warn 억제가 아니다 |
| test: Validation 7c가 negative fixture를 **총 개수로만** 본다 — 9건 전부 `.js`이고 `.md` 0건이어도 통과하므로 `.md` fixture를 “범위 등식의 반증 장치”라 부른 근거가 사라진다 | HIGH | **확인.** 마커를 `LINT negative-fixtures=<n> js=<a> md=<b>`로 확장하고 7c가 `a>=1 ∧ b>=1`을 대조한다. 마커 부재는 0이 아니라 실패 |
| invariant ×2 · architect ×1: “0b·0c·L9 셋이 `walkSurfaces`를 쓴다”의 확인이 0b·0c 쪽에서는 **사람 체크박스뿐**이다(L9만 spy를 갖는다) | HIGH | **확인 — R9가 교체를 “구현 시”로 미룬 것이 원인이다.** 미루는 대신 **지금 교체했다**: 0b·0c 스니펫이 실제로 `walkSurfaces`를 호출한다. 남는 축(“그 함수가 무엇을 돌려주는가”)은 Validation 0의 **반환 형태 계약**으로 고정했다 — 두 surface 커버 · repo-root 상대 POSIX · test/`env-contract` 제외. 확인이 «체크박스»에서 «본문의 사실 + 3중 fail-closed»로 옮겨졌다. 닫히지 않는 축(미래의 인라인 재도입)은 Task 5에 명시하고 backlog로 |

**흡수 중 실측한, 패널이 못 본 결함 1건.** Validation 7c의 `if(bad)process.exit(1)`이 walk-spy
대조보다 **앞**에 있었다. R9가 spy 대조를 블록 끝에 덧붙이면서 exit이 그 위에 남은 것이고, 그래서
spy 마커가 없거나 0이어도 `bad++`만 되고 종료코드는 0이었다 — “마커 부재는 통과가 아니라 실패”라는
R9 자신의 흡수가 정확히 그 지점에서 무력했다. exit을 모든 검사 뒤로 내렸다. 패널 4명 중 누구도
이것을 지적하지 않았다는 사실을 함께 기록한다.

**여기서 라운드를 닫는다 — R9와 같은 근거이되 데이터가 하나 늘었다.** R10의 CRITICAL은 «원래
계획에 있던 결함»(이관이 warn 지점을 *만든다*는 것을 보지 못한 것)이지만 HIGH 5건은 전부 «앞
라운드의 흡수가 미뤄 둔 것»이다. 그리고 위 7c 결함이 보여주듯 **패널이 못 보는 결함을 흡수 작업
자체가 찾아낸다** — 라운드를 늘리는 것보다 흡수를 정확히 하는 쪽의 수익이 크다. MEDIUM 이하와
기각분은 §3.14대로 backlog가 받고, 구현 단계의 Validation 0 · 0b · 0c · **0d** · 7c가 실제 코드에
대해 같은 축을 다시 검사한다.

## Design Critique

- 트리거: axis a — `impeccable-detect.js` `design_signal=true`. signal files는 `plugins/mccp/scripts/lib/renderer/html.js` · `plugins/mccp/scripts/lib/renderer/markdown.js`(version footer 2면)와 receipt/derive 경유 파일들.
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료.
- rounds: 2 (R0 + R10 델타 재검) · cap: `MCCP_DESIGN_CRITIQUE_MAX_RETRY` default 2
- verdict: **CONVERGED** — 잔존 HIGH/CRITICAL 0건
- R10 델타 재검(2026-08-19): 흡수 편집은 Validation 코드 블록 · Task 4/5 산문 · Acceptance 항목 ·
  R10 기록뿐이고 rendering surface(`renderer/html.js` · `renderer/markdown.js`의 version 문자열)는
  건드리지 않았다. 4 제약 재확인 — heading depth 최대 3 유지(`####` 0건, 신설 R10 기록은 `###`) ·
  accent token 미추가 · 렌더 대상 표면에 raw marker 미유입(계획서와 신설 `docs/environment/*.md`는
  렌더 파이프라인 밖) · 신설 표는 데이터 3행으로 상위 3개 상한 이내. 신규 finding 0건

| Finding | Constraint | Severity | 처리 |
|---|---|---|---|
| F1 색인 첫 화면이 도메인 표 8개 = 약 117행이라 "깔끔하고 간단한 설명만"이 성립하지 않음 | 한 화면 항목 수 상한 | HIGH | 흡수 — Task 7에 도메인 목차 8줄 추가. 표 자체는 접지 않는다(색인을 접으면 lookup이 사라짐) |
| F2 상세 문서의 토글 내부 구획이 `####`로 갈 여지가 있어 depth 4가 생길 수 있음 | 정보 위계 3단계 | MEDIUM | 흡수 — Task 6에 볼드 라벨 규약 명시 + Validation 4b가 depth ≤ 3을 기계 검사. §3.14는 MEDIUM을 backlog로 보내지만, 이 항목은 본 loop이 강제하는 anchor 자체의 준수라 1줄 흡수가 왕복보다 싸다 |
| — 강조색 화면당 1개 | 강조색 | n/a | renderer 변경이 version 문자열 1개뿐 — accent token 미추가 |
| — raw markdown marker 금지 | raw marker | n/a | footer는 HTML 문자열 치환 1건. 신규 문서는 렌더 대상이 아님 |

## Design Routing Guide

routing mode: `auto` (effective at implement stage). At implement the design gate routes these
stage-appropriate impeccable commands; here they are a checklist only — the plan stage has no
rendered UI yet, so nothing is invoked.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

이 계획의 rendering surface는 version 문자열 2면(`renderer/html.js` page-foot · `renderer/markdown.js`
derived 줄)뿐이고 나머지는 markdown 문서다. 따라서 implement 단계에서 content-detectable refine
명령군은 신호 부재로 강등될 것이 예상되며, 실제 라우팅은 `renderingSurface` 판정에 따른다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
