# 환경변수 레퍼런스 (색인)

> 이 파일은 **색인**이다. 각 토글의 값·기본값·소비처 한 줄만 싣고, 서사와 사용 예시는
> `docs/environment/*.md` 상세 8장이 갖는다. 색인의 모든 행은
> [env-contract/registry.js](../plugins/mccp/scripts/lib/env-contract/registry.js)에서
> 파생 가능해야 하며, 그 대조는
> [env-contract/lint.js](../plugins/mccp/scripts/lib/env-contract/lint.js)가 fail-closed로 수행한다.

## 1. 스코프와 설정 위치

- `.claude/settings.json`의 `env` 블록 — 상주 설정. 값은 **전부 문자열**이다(JSON spec).
- 셸 — 한 호출에만 적용. 우회 플래그와 audited override는 보통 이쪽이다.

다루는 이름은 셋이다: mccp가 정의하는 `MCCP_*`, mccp가 읽지만 다른 도구가 소유하는 이름
(`CLAUDE_*` · `IMPECCABLE_*` · `ECC_*` · `CLV2_*` · `GITHUB_TOKEN`), 그리고 은퇴·부재 이름.

## 2. 값 규약

운영자가 기억할 규칙은 하나다: **평소엔 `on`/`off`, 우회 플래그는 `1`.**

| 종류 | 문서 표기 | 파서가 받는 값 | 불량값 처리 |
|---|---|---|---|
| `bool` | `on` / `off` | 대소문자 무시 — ON은 `on` `1` `true` `yes` `enabled`, OFF는 `off` `0` `false` `no` `disabled` | 레지스트리 기본값으로 복귀 + loud warn |
| `bypass-flag` | `1` / 미설정 | **정확히 `1`만.** 별칭 없음, 공백·대소문자 관용 없음 | 그 밖의 값은 전부 미설정과 같다 (조용) |
| `enum` | 열거된 값 | 열거 그대로 (앞뒤 공백만 무시) | 기본값으로 복귀 + loud warn |
| `int` | 정수 | 정수 (범위는 소비처가 정한다) | 기본값으로 복귀 + loud warn |
| `list` | 쉼표 구분 | 쉼표로 나누고 각 항목 trim, 빈 항목 제거 | 빈 목록 |
| `string` | 자유 문자열 | 그대로 | 없음 |

`bypass-flag`가 따로 있는 이유는 그 셋이 **리뷰 게이트를 약화**하기 때문이다. 별칭을 더하면
잠들어 있던 `MCCP_SKIP_RECEIPT=true`가 어느 날 게이트를 우회한다. 이름에 `DISABLE`이 들어가는
것은 기준이 아니다 — `MCCP_AUTO_CHAIN_DISABLE`은 자동 진행만 멈추므로 `bool`이다.

불량값의 기본값 복귀가 보장하는 것은 **«이전 대비 권한을 넓히지 않는다»**이지 «항상
제한적이다»가 아니다. `enum`·`int`의 불량값 처리 방향 통일은 별개 축이며, 이 문서가
«통일했다»고 주장하는 범위는 **boolean 계열**이다. 근거는
[value.js](../plugins/mccp/scripts/lib/env-contract/value.js) 헤더에 있다.

## 3. 운영 토글 색인 (canonical)

도메인 8개. 첫 화면에서 목차만 보고 원하는 표로 내려간다.

- [gates](environment/gates.md) — 게이트 · receipt · Codex (21개)
- [review](environment/review.md) — 리뷰 · 승인 · 디자인 critique (26개)
- [orchestration](environment/orchestration.md) — 오케스트레이션 · 병렬 · 핸드오프 (21개)
- [cost](environment/cost.md) — 비용 · 구독 · briefing (11개)
- [hooks](environment/hooks.md) — hook · 세션 · MCP · 설치 (25개)
- [observability](environment/observability.md) — 관측 · 대시보드 · 증거 (12개)
- [external](environment/external.md) — 외부 도구가 소유하는 이름 (28개)
- [retired](environment/retired.md) — 은퇴 · 부재 · 스캔 오탐 (17개, §4)

### gates — 게이트 · receipt · Codex

| 변수 | 종류 | 값 | Default | 한 줄 설명 | 상세 |
|---|---|---|---|---|---|
|`MCCP_RECEIPT_GATE_MODE`|enum|hard/soft/off|hard|receipt 게이트 강도.|[→](environment/gates.md#mccp_receipt_gate_mode)|
|`MCCP_SKIP_RECEIPT`|bypass-flag|1|off|receipt 게이트 1회 우회.|[→](environment/gates.md#mccp_skip_receipt)|
|`MCCP_RECEIPT_DEBUG`|bool|on/off|off|receipt 디버그 출력.|[→](environment/gates.md#mccp_receipt_debug)|
|`MCCP_RECEIPT_DEBUG_LEGACY_INLINE`|bool|on/off|on|구형 inline 디버그 유지.|[→](environment/gates.md#mccp_receipt_debug_legacy_inline)|
|`MCCP_ALLOW_CODEX_UNAVAILABLE`|bypass-flag|1|off|Codex 미가용 시 advisory.|[→](environment/gates.md#mccp_allow_codex_unavailable)|
|`MCCP_CODEX_DISABLED`|bypass-flag|1|off|Codex 호출 영구 skip.|[→](environment/gates.md#mccp_codex_disabled)|
|`MCCP_CODEX_DESIGN_SCOPE_HONOR`|bool|on/off|on|Codex design-scope preamble.|[→](environment/gates.md#mccp_codex_design_scope_honor)|
|`MCCP_STOP_LOOP`|enum|off/observe/enforce|observe|Stop-loop 게이트 모드.|[→](environment/gates.md#mccp_stop_loop)|
|`MCCP_STOP_LOOP_CODEX`|bool|on/off|off|Stop-loop에 Codex 병행.|[→](environment/gates.md#mccp_stop_loop_codex)|
|`MCCP_AUTO_CHAIN_DISABLE`|bool|on/off|off|auto-chain 자동 진행 중단.|[→](environment/gates.md#mccp_auto_chain_disable)|
|`MCCP_AUTO_CHAIN_SKIP_PR`|bool|on/off|off|commit까지만, PR 생략.|[→](environment/gates.md#mccp_auto_chain_skip_pr)|
|`MCCP_GATE_ROUND_CAP`|int|—|1|게이트 라운드 상한.|[→](environment/gates.md#mccp_gate_round_cap)|
|`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`|string|—|—|비수렴 ship override.|[→](environment/gates.md#mccp_force_pr_without_codex_convergence)|
|`MCCP_FORCE_PR_WITHOUT_IMPECCABLE`|string|—|—|impeccable 미가용 override.|[→](environment/gates.md#mccp_force_pr_without_impeccable)|
|`MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER`|string|—|—|security 미가용 override.|[→](environment/gates.md#mccp_force_pr_without_security_reviewer)|
|`MCCP_PR_SKIP_CODEX_REVIEW`|string|—|—|PR-Codex skip escape.|[→](environment/gates.md#mccp_pr_skip_codex_review)|
|`MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN`|string|—|—|design chain 차단 1회 우회.|[→](environment/gates.md#mccp_pr_skip_design_critique_chain)|
|`MCCP_GATEGUARD`|enum|on/off|on|gateguard hook 활성.|[→](environment/gates.md#mccp_gateguard)|
|`CODEX_DEDUPE_AT_PR`|string|1|—|cross-gate dedupe 전달 신호.|[→](environment/gates.md#codex_dedupe_at_pr)|
|`MCCP_GOAL_FEATURE`|enum|available/missing/unknown|—|native /goal 가용성 강제.|[→](environment/gates.md#mccp_goal_feature)|
|`MCCP_ULTRACODE_FEATURE`|enum|available/missing/unknown|—|ultracode 가용성 강제.|[→](environment/gates.md#mccp_ultracode_feature)|

### review — 리뷰 · 승인 · 디자인 critique

| 변수 | 종류 | 값 | Default | 한 줄 설명 | 상세 |
|---|---|---|---|---|---|
|`MCCP_PLAN_REVIEW`|enum|off/multi-agent/codex/hybrid|multi-agent|plan 승인 리뷰 소스.|[→](environment/review.md#mccp_plan_review)|
|`MCCP_PLAN_REVIEW_L3`|bool|on/off|off|hybrid에서 L3 요구.|[→](environment/review.md#mccp_plan_review_l3)|
|`MCCP_PLAN_REVIEW_BUDGET`|int|—|—|리뷰어 1인 최소 예산.|[→](environment/review.md#mccp_plan_review_budget)|
|`MCCP_PLAN_REVIEW_QUORUM`|int|—|—|수렴에 필요한 승인 수.|[→](environment/review.md#mccp_plan_review_quorum)|
|`MCCP_PLAN_REVIEW_ROLES_MIN`|int|—|—|최소 역할 수.|[→](environment/review.md#mccp_plan_review_roles_min)|
|`MCCP_REVIEW_SINGLE_PASS`|enum|scope_too_small/deadline_pressure/deferred_to_prd_completion|—|리뷰 단일통과 + 사유.|[→](environment/review.md#mccp_review_single_pass)|
|`MCCP_SANTA_ROUND_CAP`|int|—|—|santa 라운드 상한.|[→](environment/review.md#mccp_santa_round_cap)|
|`MCCP_SANTA_SEVERITY_GATE`|enum|off/high/critical|—|santa 차단 최소 severity.|[→](environment/review.md#mccp_santa_severity_gate)|
|`MCCP_SANTA_TERMINATOR`|enum|off/on|—|santa 종료 판정기.|[→](environment/review.md#mccp_santa_terminator)|
|`MCCP_SANTA_ADJUDICATION_GATE`|enum|off/warn/enforce|—|santa 심판 게이트 모드.|[→](environment/review.md#mccp_santa_adjudication_gate)|
|`MCCP_SANTA_LEDGER_SUPPRESSION`|enum|off/on|—|santa 원장 억제.|[→](environment/review.md#mccp_santa_ledger_suppression)|
|`MCCP_SANTA_BLIND_LANE`|enum|a/b/off|a|santa 증거 레인 배정.|[→](environment/review.md#mccp_santa_blind_lane)|
|`MCCP_SANTA_ALWAYS_SCOPE`|enum|enforce/off|enforce|santa 상시 스코프 + 정합 rubric.|[→](environment/review.md#mccp_santa_always_scope)|
|`MCCP_SANTA_DEGRADE_GATE`|enum|enforce/off|enforce|santa 모델 계열 degrade 강등.|[→](environment/review.md#mccp_santa_degrade_gate)|
|`MCCP_SANTA_DEGRADE_ACK`|string|—|—|santa degrade audited override 사유.|[→](environment/review.md#mccp_santa_degrade_ack)|
|`MCCP_INTENT_MISLABEL`|enum|enforce/warn/off|enforce|오심 대조 모드.|[→](environment/review.md#mccp_intent_mislabel)|
|`MCCP_SKIP_INTENT_GATE`|string|—|—|intent 게이트 override.|[→](environment/review.md#mccp_skip_intent_gate)|
|`MCCP_INTENT_ADJUDICATION_TIMEOUT_MS`|int|—|—|판정 대기 상한.|[→](environment/review.md#mccp_intent_adjudication_timeout_ms)|
|`MCCP_INTENT_ARBITER`|enum|subagent/author|subagent|판정 주체(심판 분리).|[→](environment/review.md#mccp_intent_arbiter)|
|`MCCP_DESIGN_CRITIQUE_MAX_RETRY`|int|—|2|critique 재시도 상한.|[→](environment/review.md#mccp_design_critique_max_retry)|
|`MCCP_DESIGN_GROUNDING`|enum|enforce/warn/off|enforce|grounding lint 모드.|[→](environment/review.md#mccp_design_grounding)|
|`MCCP_DESIGN_INTENT_REASON`|string|—|—|critique 강제 override.|[→](environment/review.md#mccp_design_intent_reason)|
|`MCCP_IMPECCABLE_ROUTING_MODE`|enum|auto/hybrid/recommend|auto|impeccable 라우팅 모드.|[→](environment/review.md#mccp_impeccable_routing_mode)|
|`MCCP_IMPECCABLE_INTENT_COMMANDS`|list|—|—|추가 라우팅 명령 목록.|[→](environment/review.md#mccp_impeccable_intent_commands)|
|`MCCP_IMPECCABLE_SKILL`|enum|available/missing|—|impeccable 탐지 결과 강제 override.|[→](environment/review.md#mccp_impeccable_skill)|
|`MCCP_PLAN_REVIEW_TEST_INVOKE`|bypass-flag|1|off|test 전용 — `--invoke-module` 허용.|[→](environment/review.md#mccp_plan_review_test_invoke)|
|`MCCP_A11Y_AUTO_INVOKE`|bool|on/off|on|PR에서 a11y 자동 호출.|[→](environment/review.md#mccp_a11y_auto_invoke)|
|`MCCP_DEEP_RESEARCH_SKILL`|string|—|—|deep-research skill 이름.|[→](environment/review.md#mccp_deep_research_skill)|

### orchestration — 오케스트레이션 · 병렬 · 핸드오프

| 변수 | 종류 | 값 | Default | 한 줄 설명 | 상세 |
|---|---|---|---|---|---|
|`MCCP_WORK_ISOLATE_IMPLEMENT`|bool|on/off|on|implement worktree 격리.|[→](environment/orchestration.md#mccp_work_isolate_implement)|
|`MCCP_WORK_IMPLEMENT_WORKFLOW`|bool|on/off|off|Workflow 런타임 사용.|[→](environment/orchestration.md#mccp_work_implement_workflow)|
|`MCCP_WORK_IMPLEMENT_PARALLEL`|bool|on/off|on|병렬 implement 허용.|[→](environment/orchestration.md#mccp_work_implement_parallel)|
|`MCCP_WORK_PARALLEL_MAX`|int|—|4|동시 worker 상한.|[→](environment/orchestration.md#mccp_work_parallel_max)|
|`MCCP_WORK_PARALLEL_BUDGET`|int|—|150000|병렬 최소 토큰 예산.|[→](environment/orchestration.md#mccp_work_parallel_budget)|
|`MCCP_WORK_PARALLEL_AUTODISABLE_TIER`|list|—|(빈 값)|병렬 자동 해제 tier.|[→](environment/orchestration.md#mccp_work_parallel_autodisable_tier)|
|`MCCP_WORK_MERGE_STRATEGY`|enum|worktree-merge/sequential|worktree-merge|worker 산출물 병합 전략.|[→](environment/orchestration.md#mccp_work_merge_strategy)|
|`MCCP_WORK_MERGED_VERIFY`|enum|enforce/warn/off|enforce|병합 후 verify 모드.|[→](environment/orchestration.md#mccp_work_merged_verify)|
|`MCCP_PLAN_FANOUT`|bool|on/off|on|plan 다관점 fan-out.|[→](environment/orchestration.md#mccp_plan_fanout)|
|`MCCP_PLAN_FANOUT_BUDGET`|int|—|150000|fan-out 최소 예산.|[→](environment/orchestration.md#mccp_plan_fanout_budget)|
|`MCCP_PLAN_FANOUT_AUTODISABLE_TIER`|list|—|(빈 값)|fan-out 자동 해제 tier.|[→](environment/orchestration.md#mccp_plan_fanout_autodisable_tier)|
|`MCCP_ORCHESTRATION_MAX_AGENTS`|int|—|24|agent 수 상한.|[→](environment/orchestration.md#mccp_orchestration_max_agents)|
|`MCCP_ORCHESTRATION_CATASTROPHIC_USD`|int|—|500|catastrophic 판정 USD.|[→](environment/orchestration.md#mccp_orchestration_catastrophic_usd)|
|`MCCP_ORCHESTRATION_USD_BOMB`|bool|on/off|off|USD bomb 강제 판정.|[→](environment/orchestration.md#mccp_orchestration_usd_bomb)|
|`MCCP_ORCHESTRATION_COST_FAIL_OPEN`|bool|on/off|on|비용 신호 부재 시 진행.|[→](environment/orchestration.md#mccp_orchestration_cost_fail_open)|
|`MCCP_ORCHESTRATION_RESERVATION_LEASE_MS`|int|—|600000|예약 lease 유효 시간.|[→](environment/orchestration.md#mccp_orchestration_reservation_lease_ms)|
|`MCCP_ORCHESTRATOR_POLL_MS`|int|—|500|watcher 폴링 간격.|[→](environment/orchestration.md#mccp_orchestrator_poll_ms)|
|`MCCP_DISPATCH_CONTEXT`|bool|on/off|off|dispatch worker 선언.|[→](environment/orchestration.md#mccp_dispatch_context)|
|`MCCP_AUTO_HANDOFF`|enum|off/notify/spawn|notify|핸드오프 신호 처리.|[→](environment/orchestration.md#mccp_auto_handoff)|
|`MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN`|bool|on/off|off|실험적 세션 spawn.|[→](environment/orchestration.md#mccp_auto_handoff_experimental_spawn)|
|`MCCP_MULTI_SESSION_SCAN`|bool|on/off|off|다중 세션 스캔.|[→](environment/orchestration.md#mccp_multi_session_scan)|

### cost — 비용 · 구독 · briefing

| 변수 | 종류 | 값 | Default | 한 줄 설명 | 상세 |
|---|---|---|---|---|---|
|`MCCP_COST_STATE_DECAY_HOURS`|int|—|6|cost 마커 decay 시간.|[→](environment/cost.md#mccp_cost_state_decay_hours)|
|`MCCP_HANDOFF_THRESHOLDS_USD`|list|—|50,80,100|핸드오프 임계 USD 3단계.|[→](environment/cost.md#mccp_handoff_thresholds_usd)|
|`MCCP_SUBSCRIPTION`|bool|on/off|off|구독 비용 모델.|[→](environment/cost.md#mccp_subscription)|
|`MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_WARN_PCT`|int|—|35|컨텍스트 경고 임계.|[→](environment/cost.md#mccp_subscription_overflow_context_warn_pct)|
|`MCCP_SUBSCRIPTION_OVERFLOW_CONTEXT_CRITICAL_PCT`|int|—|25|컨텍스트 critical 임계.|[→](environment/cost.md#mccp_subscription_overflow_context_critical_pct)|
|`MCCP_SUBSCRIPTION_OVERFLOW_TOOL_WARN`|int|—|0|도구 호출 경고 임계.|[→](environment/cost.md#mccp_subscription_overflow_tool_warn)|
|`MCCP_SUBSCRIPTION_OVERFLOW_TOOL_CRITICAL`|int|—|0|도구 호출 critical 임계.|[→](environment/cost.md#mccp_subscription_overflow_tool_critical)|
|`MCCP_BRIEFING`|enum|auto/off/always|auto|briefing stamp 정책.|[→](environment/cost.md#mccp_briefing)|
|`MCCP_BRIEFING_AUTODISABLE_TIER`|list|—|notice,warning,critical|briefing 자동 해제 tier.|[→](environment/cost.md#mccp_briefing_autodisable_tier)|
|`MCCP_CONTEXT_MONITOR_COST_MODE`|enum|off/observe/enforce|—|비용 모니터 모드.|[→](environment/cost.md#mccp_context_monitor_cost_mode)|
|`MCCP_CONTEXT_MONITOR_COST_WARNINGS`|bool|on/off|on|비용 경고 출력.|[→](environment/cost.md#mccp_context_monitor_cost_warnings)|

### hooks — hook · 세션 · MCP · 설치

| 변수 | 종류 | 값 | Default | 한 줄 설명 | 상세 |
|---|---|---|---|---|---|
|`MCCP_HOOK_PROFILE`|enum|full/lean/minimal|—|hook 무게 프로파일.|[→](environment/hooks.md#mccp_hook_profile)|
|`MCCP_DISABLED_HOOKS`|list|—|—|비활성 hook id 목록.|[→](environment/hooks.md#mccp_disabled_hooks)|
|`MCCP_HOOK_ID`|string|—|—|실행 중 hook id.|[→](environment/hooks.md#mccp_hook_id)|
|`MCCP_HOOK_INPUT_MAX_BYTES`|int|—|—|hook 입력 바이트 상한.|[→](environment/hooks.md#mccp_hook_input_max_bytes)|
|`MCCP_HOOK_INPUT_TRUNCATED`|bool|on/off|off|입력 절단 신호.|[→](environment/hooks.md#mccp_hook_input_truncated)|
|`MCCP_PLUGIN_ROOT`|string|—|—|플러그인 루트 경로.|[→](environment/hooks.md#mccp_plugin_root)|
|`MCCP_SESSION_ID`|string|—|—|현재 세션 id.|[→](environment/hooks.md#mccp_session_id)|
|`MCCP_SESSION_START_CONTEXT`|enum|off/on|—|STATE.md 주입 여부.|[→](environment/hooks.md#mccp_session_start_context)|
|`MCCP_SESSION_START_MAX_CHARS`|int|—|—|주입 블록 문자 상한.|[→](environment/hooks.md#mccp_session_start_max_chars)|
|`MCCP_SESSION_RETENTION_DAYS`|int|—|—|세션 산출물 보존 일수.|[→](environment/hooks.md#mccp_session_retention_days)|
|`MCCP_SESSION_RECORDING_DIR`|string|—|—|세션 기록 디렉토리.|[→](environment/hooks.md#mccp_session_recording_dir)|
|`MCCP_GOVERNANCE_CAPTURE`|bool|on/off|off|governance hook 활성.|[→](environment/hooks.md#mccp_governance_capture)|
|`MCCP_OBSERVE_RUNNER_TIMEOUT_MS`|int|—|—|observe runner 상한.|[→](environment/hooks.md#mccp_observe_runner_timeout_ms)|
|`MCCP_MCP_CONFIG_PATH`|list|—|—|MCP 설정 경로 목록.|[→](environment/hooks.md#mccp_mcp_config_path)|
|`MCCP_MCP_HEALTH_FAIL_OPEN`|bool|on/off|on|MCP 검사 실패 시 진행.|[→](environment/hooks.md#mccp_mcp_health_fail_open)|
|`MCCP_MCP_HEALTH_STATE_PATH`|string|—|—|MCP 상태 파일 경로.|[→](environment/hooks.md#mccp_mcp_health_state_path)|
|`MCCP_MCP_HEALTH_TTL_MS`|int|—|—|MCP 캐시 TTL.|[→](environment/hooks.md#mccp_mcp_health_ttl_ms)|
|`MCCP_MCP_HEALTH_TIMEOUT_MS`|int|—|—|MCP probe 상한.|[→](environment/hooks.md#mccp_mcp_health_timeout_ms)|
|`MCCP_MCP_HEALTH_BACKOFF_MS`|int|—|—|MCP 재시도 backoff.|[→](environment/hooks.md#mccp_mcp_health_backoff_ms)|
|`MCCP_MCP_RECONNECT_COMMAND`|string|—|—|MCP 재연결 명령.|[→](environment/hooks.md#mccp_mcp_reconnect_command)|
|`MCCP_MCP_RECONNECT_TIMEOUT_MS`|int|—|—|재연결 명령 상한.|[→](environment/hooks.md#mccp_mcp_reconnect_timeout_ms)|
|`MCCP_GH_SHIM`|string|—|—|gh CLI 대체 경로.|[→](environment/hooks.md#mccp_gh_shim)|
|`MCCP_CODE_CLI`|string|—|—|claude CLI 경로.|[→](environment/hooks.md#mccp_code_cli)|
|`MCCP_GITIGNORE_LOCK_WAIT_MS`|int|—|—|gitignore lock 대기 상한.|[→](environment/hooks.md#mccp_gitignore_lock_wait_ms)|
|`MCCP_A3_READ_USER_MEMORY`|bool|on/off|off|derive의 메모리 읽기 허용.|[→](environment/hooks.md#mccp_a3_read_user_memory)|

### observability — 관측 · 대시보드 · 증거

| 변수 | 종류 | 값 | Default | 한 줄 설명 | 상세 |
|---|---|---|---|---|---|
|`MCCP_RENDER_TRIGGER_DEBOUNCE_MS`|int|—|5000|재렌더 debounce.|[→](environment/observability.md#mccp_render_trigger_debounce_ms)|
|`MCCP_RENDER_LOCK_LEASE_MS`|int|—|90000|렌더 lock lease.|[→](environment/observability.md#mccp_render_lock_lease_ms)|
|`MCCP_DASHBOARD_STALE_DAYS`|int|—|—|plan stale 판정 일수.|[→](environment/observability.md#mccp_dashboard_stale_days)|
|`MCCP_STATE_JOURNAL`|enum|off/on|—|STATE.md 저널 기록.|[→](environment/observability.md#mccp_state_journal)|
|`MCCP_EVIDENCE_CONFLICT_GUARD`|enum|enforce/warn/off|enforce|중복 claim 가드 모드.|[→](environment/observability.md#mccp_evidence_conflict_guard)|
|`MCCP_EVIDENCE_STAGE_ROOT`|list|—|—|증거 스테이징 루트.|[→](environment/observability.md#mccp_evidence_stage_root)|
|`MCCP_SESSION_LEDGER_SCOPE`|enum|repo/host/global|—|세션 원장 조회 범위.|[→](environment/observability.md#mccp_session_ledger_scope)|
|`MCCP_RECLAIM_OUTLIVES`|bool|on/off|off|잔존 프로세스 회수.|[→](environment/observability.md#mccp_reclaim_outlives)|
|`MCCP_RECLAIM_BUDGET_MS`|int|—|—|회수 시간 예산.|[→](environment/observability.md#mccp_reclaim_budget_ms)|
|`MCCP_RECLAIM_IDENTITY_TOLERANCE_MS`|int|—|—|동일성 판정 허용 오차.|[→](environment/observability.md#mccp_reclaim_identity_tolerance_ms)|
|`MCCP_WORKTREE_SCAN_CAP`|int|—|—|worktree 스캔 상한.|[→](environment/observability.md#mccp_worktree_scan_cap)|
|`MCCP_WORKTREE_ACTIVE_DAYS`|int|—|—|worktree active 일수.|[→](environment/observability.md#mccp_worktree_active_days)|

### external — 외부 도구가 소유하는 이름

| 변수 | 종류 | 값 | Default | 한 줄 설명 | 상세 |
|---|---|---|---|---|---|
|`CLAUDE_PLUGIN_ROOT`|string|—|—|주입된 플러그인 루트.|[→](environment/external.md#claude_plugin_root)|
|`CLAUDE_SESSION_ID`|string|—|—|주입된 세션 id.|[→](environment/external.md#claude_session_id)|
|`CLAUDE_PID`|string|—|—|Claude Code PID.|[→](environment/external.md#claude_pid)|
|`CLAUDE_RULES_DIR`|string|—|—|ECC rule 디렉토리.|[→](environment/external.md#claude_rules_dir)|
|`CLAUDE_PACKAGE_MANAGER`|string|—|—|installer 패키지 매니저.|[→](environment/external.md#claude_package_manager)|
|`GITHUB_TOKEN`|string|—|—|gh 인증 토큰.|[→](environment/external.md#github_token)|
|`ECC_DISABLED_MCPS`|list|—|—|ECC 비활성 MCP 목록.|[→](environment/external.md#ecc_disabled_mcps)|
|`CLV2_HOMUNCULUS_DIR`|string|—|—|CLv2 instinct 디렉토리.|[→](environment/external.md#clv2_homunculus_dir)|
|`IMPECCABLE_FORCE_OVERRIDE_REASON`|string|—|—|impeccable 게이트 override.|[→](environment/external.md#impeccable_force_override_reason)|
|`IMPECCABLE_VERSION`|string|—|—|impeccable 버전 문자열.|[→](environment/external.md#impeccable_version)|
|`IMPECCABLE_NO_UPDATE_CHECK`|bool|on/off|off|업데이트 확인 끔.|[→](environment/external.md#impeccable_no_update_check)|
|`IMPECCABLE_UPDATE_HOST`|string|—|—|업데이트 확인 호스트.|[→](environment/external.md#impeccable_update_host)|
|`IMPECCABLE_UPDATE_CACHE`|string|—|—|업데이트 캐시 경로.|[→](environment/external.md#impeccable_update_cache)|
|`IMPECCABLE_CONTEXT_DIR`|string|—|—|컨텍스트 해석 디렉토리.|[→](environment/external.md#impeccable_context_dir)|
|`IMPECCABLE_CRITIQUE_META`|string|—|—|critique 메타 경로.|[→](environment/external.md#impeccable_critique_meta)|
|`IMPECCABLE_LIVE_CONFIG`|string|—|—|live mode 설정 경로.|[→](environment/external.md#impeccable_live_config)|
|`IMPECCABLE_LIVE_DEBUG_EVENTS`|bool|on/off|off|live 이벤트 디버그.|[→](environment/external.md#impeccable_live_debug_events)|
|`IMPECCABLE_LIVE_APPLY_EVENT_SOFT_DEADLINE_MS`|int|—|—|apply soft deadline.|[→](environment/external.md#impeccable_live_apply_event_soft_deadline_ms)|
|`IMPECCABLE_LIVE_APPLY_EVENT_HARD_TIMEOUT_MS`|int|—|—|apply hard timeout.|[→](environment/external.md#impeccable_live_apply_event_hard_timeout_ms)|
|`IMPECCABLE_LIVE_MANUAL_EDIT_REPAIR_ATTEMPTS`|int|—|—|수동 편집 복구 횟수.|[→](environment/external.md#impeccable_live_manual_edit_repair_attempts)|
|`IMPECCABLE_LIVE_COPY_AGENT`|string|—|—|copy-edit agent 이름.|[→](environment/external.md#impeccable_live_copy_agent)|
|`IMPECCABLE_LIVE_COPY_AGENT_MODEL`|string|—|—|copy-edit agent 모델.|[→](environment/external.md#impeccable_live_copy_agent_model)|
|`IMPECCABLE_LIVE_COPY_AGENT_EFFORT`|string|—|—|copy-edit agent effort.|[→](environment/external.md#impeccable_live_copy_agent_effort)|
|`IMPECCABLE_LIVE_COPY_AGENT_TIMEOUT_MS`|int|—|—|copy-edit agent 상한.|[→](environment/external.md#impeccable_live_copy_agent_timeout_ms)|
|`IMPECCABLE_LIVE_COPY_AGENT_MOCK_RESULT`|string|—|—|agent 결과 mock.|[→](environment/external.md#impeccable_live_copy_agent_mock_result)|
|`IMPECCABLE_LIVE_COPY_AGENT_MOCK_WRITES`|string|—|—|agent write mock.|[→](environment/external.md#impeccable_live_copy_agent_mock_writes)|
|`IMPECCABLE_LIVE_COPY_AGENT_MOCK_DELAY_MS`|int|—|—|agent mock 지연.|[→](environment/external.md#impeccable_live_copy_agent_mock_delay_ms)|
|`IMPECCABLE_PALETTE_SEED`|string|—|—|팔레트 생성 시드.|[→](environment/external.md#impeccable_palette_seed)|

## 4. 은퇴와 부재

아래 이름은 설정해도 아무 일도 일어나지 않는다. 은퇴한 것, 의도적으로 만들지 않은 것,
그리고 스캐너가 같은 이름의 코드 식별자를 잡은 오탐이 섞여 있으므로 `종류` 대신 상세의
`상태` 라벨을 본다. 이 표에는 사용 예시가 없다 — 쓰지 말라는 항목에 사용법을 다는 것은
모순이고, 정합 lint도 이 도메인을 예시 검사에서 제외한다.

| 변수 | 종류 | 값 | Default | 한 줄 설명 | 상세 |
|---|---|---|---|---|---|
|`MCCP_SKIP_OBSERVE`|string|—|—|은퇴 — MCCP_DISABLED_HOOKS로.|[→](environment/retired.md#mccp_skip_observe)|
|`MCCP_QUALITY_GATE_FIX`|string|—|—|은퇴 — Stop-loop enforce로.|[→](environment/retired.md#mccp_quality_gate_fix)|
|`MCCP_QUALITY_GATE_STRICT`|string|—|—|은퇴 — Stop-loop enforce로.|[→](environment/retired.md#mccp_quality_gate_strict)|
|`MCCP_STOP_LOOP_QUALITY_CWD`|string|—|—|은퇴 — worktree 규약으로.|[→](environment/retired.md#mccp_stop_loop_quality_cwd)|
|`MCCP_SANTA_MAX_ROUNDS`|string|—|—|은퇴 — ROUND_CAP으로 개명.|[→](environment/retired.md#mccp_santa_max_rounds)|
|`MCCP_COST_HARD_CEILING_HIT`|string|—|—|은퇴 — chain_aborted로.|[→](environment/retired.md#mccp_cost_hard_ceiling_hit)|
|`MCCP_ORCHESTRATION_DEBT_DECAY_HOURS`|string|—|—|은퇴 — COST_STATE_DECAY로.|[→](environment/retired.md#mccp_orchestration_debt_decay_hours)|
|`MCCP_PLAN_REVIEW_L1`|string|—|—|의도적 부재 — 끌 수 없다.|[→](environment/retired.md#mccp_plan_review_l1)|
|`MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL`|bool|on/off|off|test 전용 — critique 강제 실패.|[→](environment/retired.md#mccp_design_critique_test_force_fail)|
|`MCCP_PERF_INJECT_QUADRATIC`|string|—|—|test 전용, 표면 밖.|[→](environment/retired.md#mccp_perf_inject_quadratic)|
|`MCCP_TEST_SESSION_START_PATH`|string|—|—|test 전용, 표면 밖.|[→](environment/retired.md#mccp_test_session_start_path)|
|`MCCP_EXPLORE_CONTROL_PLACEMENT`|string|—|—|제거됨 — 주석만 잔존.|[→](environment/retired.md#mccp_explore_control_placement)|
|`MCCP_PLAN_REVIEW_`|string|—|—|환경변수 아님 — 접두사 오탐.|[→](environment/retired.md#mccp_plan_review_)|
|`MCCP_DISABLE_VALUES`|string|—|—|환경변수 아님 — JS 상수.|[→](environment/retired.md#mccp_disable_values)|
|`MCCP_IGNORE_BLOCK`|string|—|—|환경변수 아님 — JS 상수.|[→](environment/retired.md#mccp_ignore_block)|
|`MCCP_IGNORE_ENTRIES`|string|—|—|환경변수 아님 — JS 상수.|[→](environment/retired.md#mccp_ignore_entries)|
|`MCCP_JOURNAL_DEGRADED_UNRECORDED`|string|—|—|환경변수 아님 — 에러 코드.|[→](environment/retired.md#mccp_journal_degraded_unrecorded)|

상세: [environment/retired.md](environment/retired.md)

## 5. 빠른 레시피

레시피는 상세 문서가 갖는다. 색인은 어디로 갈지만 가리킨다.

- Codex 없이 게이트만 돌리기 — [gates.md#mccp_codex_disabled](environment/gates.md#mccp_codex_disabled)
- receipt 게이트가 막을 때 — [gates.md#mccp_receipt_gate_mode](environment/gates.md#mccp_receipt_gate_mode)
- 한 호출만 우회 — [gates.md#mccp_skip_receipt](environment/gates.md#mccp_skip_receipt)
- 리뷰 라운드를 1회로 — [review.md#mccp_review_single_pass](environment/review.md#mccp_review_single_pass)
- hook 무게 줄이기 — [hooks.md#mccp_hook_profile](environment/hooks.md#mccp_hook_profile)
- 병렬 implement 끄기 — [orchestration.md#mccp_work_implement_parallel](environment/orchestration.md#mccp_work_implement_parallel)
- 비용 임계 조정 — [cost.md#mccp_handoff_thresholds_usd](environment/cost.md#mccp_handoff_thresholds_usd)

## 6. 변경 이력 관리 규칙

손대는 곳은 **레지스트리 하나**다. 나머지는 투영이고, 어긋나면 lint가 fail-closed로 막는다.

1. `env-contract/registry.js`에 항목 추가 — `evidence`는 read site의 repo-root 상대 `path:line`.
2. 이 색인에 6열 행 추가 — `종류`·`값`·`Default`는 레지스트리에서 파생 가능해야 한다.
3. `docs/environment/<domain>.md`에 `### 이름` 앵커와 **사용 예시** 추가.
4. `node plugins/mccp/scripts/lib/env-contract/lint.js --json` 9개 검사 통과.

boolean은 `parseBool`로 읽는다 — `env-contract/` 밖의 raw 비교는 L9가 0건으로 강제한다.
게이트를 약화하는 새 토글은 `bypass-flag`여야 하고 그 집합은 이름까지 고정돼 registry test를
함께 고쳐야만 바뀐다. 그 행위가 리뷰 대상이 되는 것이 요점이다.

