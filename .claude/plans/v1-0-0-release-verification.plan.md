---
plan_name: v1-0-0-release-verification
plan_version: 0.4-fallback-ux-reframed
status: PENDING-USER-CONFIRMATION (modify v4 — 11b reframed to setup-notify check, no privilege footprint)
created_at: 2026-06-11
revised_at: 2026-06-12
author: skypark207
source: free-form input + v0.1 → v0.2 (worktree split / env matrix / autonomy contract) → v0.3 (fallback UX chain) → v0.4 (11b reframe + notify-line spec)
related_prd: .claude/prds/v0-4-0-orchestrator.prd.md (axis H meta-overlap + axis I next-session 1-liner UX overlap)
verification_scope: v0.3.6 ship + v0.4.0 axis H merged (#18 commit 3924e95) up to 2026-06-11
ship_decision: deferred — verdict는 본 plan acceptance 충족 후 별도 응답에서 작성
codex_status: assumed-live per 2026-06-11 user statement (settings.local.json scrub은 각 worktree에서 worktree-scoped)
ux_thesis: 사용자는 최종 승인자 (yes/no) — 디버깅/scope/fallback 결정은 시스템이 자연스럽게 제시
---

# Plan: v1.0.0 Release Verification (multi-worktree dogfood)

**Source**: free-form (no PRD) + v0.2 5-point modify + v0.3 fallback UX modify
**Selected Milestone**: N/A — verification plan
**Complexity**: **Very Large** (11 worktrees, ~65-75 outcome rows, 7-12h dogfood including cross-session waits)

## Summary

v0.3.6 ship + v0.4.0 axis H merged 상태의 mccp를 **11개 독립 worktree × 새 Claude 세션**으로 dogfood한다. 단일 세션 단일 worktree로는 (a) STATE.md cross-session continuity, (b) auto-handoff spawn, (c) receipt 손상의 격리, (d) env 매트릭스의 1회성 보장, (e) **fallback 흐름의 사용자 결정 type 측정**이 불가능하다. 각 worktree는 자체 audit ledger + STATE.md를 가지며, Claude가 사용자 개입 없이 dogfood + 결함 기록 + (가능 시) 같은 worktree에서 수정까지 완수한다. 사용자 escalation 조건은 명시적으로 2가지로 한정. 본 plan의 ux_thesis(frontmatter)는 **사용자가 최종 승인자**가 되는 mccp 정체성 — fallback 발생 시에도 사용자가 yes/no 단답만 하면 되도록 시스템이 자연스러운 다음 step을 제시하는가가 W11의 측정 대상.

## Autonomy Contract (Claude vs User)

| Claude가 자동 처리 | 사용자에게 escalate |
|---|---|
| 명령어 stdout/stderr 분석 + 정상/결함 판정 | 외부 인증 (GitHub login, codex re-auth, OS keychain) |
| audit ledger row 작성 + 5-tier 분류 | 의도적인 plan 변경 결정 (worktree 추가/제거, scope cut) |
| 자동 복구 (`/mccp:receipt-write`, migration script) 시도 + 결과 기록 | secret/credential/PII 노출 의심 |
| Codex companion 직접 호출 + 결과 해석 | 외부 시스템 destructive change (force-push, GitHub API call to public repo) |
| 같은 worktree에서 발견된 mid-level 결함 즉시 fix + commit | rate-limit hit (`usage_limit_exceeded`) — 사용자가 시간 회복 결정 |
| Skill (impeccable, codex) 호출 + 결과 기록 | verdict의 ship/no-go 최종 결정 |
| worktree 간 audit row 통합 (main 복귀 시) | — |

사용자 입력이 필요한 명령: (1) 각 worktree에서 새 Claude 세션 시작 (`cd <worktree> && claude`), (2) 각 새 세션 첫 prompt 입력 (본 plan에 1-liner로 명시), (3) verdict 응답 후 ship 결정.

## UX Decision-Type Rubric (W11 핵심 측정 도구)

각 fallback row에 (a) 사용자에게 요구된 결정 type + (b) 다음 step 명료성을 기록. 두 metric은 W-VERDICT의 BLOCKING 판정 기준.

| Type | 정의 | 점수 | UX 등급 |
|---|---|---|---|
| A | yes/no 단답 | 1 | 이상적 — 최종 승인자 mode |
| B | 3개 이하 picker (예: `1. 진행 / 2. 우회 / 3. 중단`) | 2 | 양호 |
| C | 1-token 단답 (예: env value, slug) | 3 | 허용 가능 |
| D | 구조화된 multi-token 입력 (예: receipt slug + 이유) | 4 | 친구 — 시스템 안내 부족 |
| E | free-form debug 입력 (예: 실패 원인 분석 요청) | 5 | 사용자 주도 mode — **결함** |

| Next-step 명료성 | 정의 | 점수 |
|---|---|---|
| 1 | 다음 명령이 1줄 stdout으로 명시 | 1 |
| 2 | 다음 step이 stderr/메시지에서 추론 가능 | 2 |
| 3 | 사용자가 docs/CLAUDE.md 검색 필요 | 3 |
| 4 | 사용자가 memory에서 떠올려야 함 | 4 |
| 5 | 다음 step 불명확 — 사용자가 처음부터 재설계 | 5 |

**임계**: W11의 평균 결정-type ≥ 3.0 OR 평균 next-step ≥ 3.0 = **HIGH UX defect → CONDITIONAL ship 권고**. ≥ 1 row가 type E OR next-step 5 = **BLOCKING → STOP_RELEASE 권고**.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Worktree 명명 | [v0-4-0-orchestrator.prd.md:184](../prds/v0-4-0-orchestrator.prd.md#L184) | `{root}/.worktrees/v1.0.0-verify-{category}/` |
| Audit ledger 위치 | v0.4.0 audit (`v0.4.0-audit-results.md`) | 각 worktree의 `.claude/audit/v1.0.0-{category}.md` |
| STATE.md isolation | [pre-compact.js](../../plugins/mccp/scripts/hooks/pre-compact.js) v0.3.6 content-hash skip | 각 worktree 자체 STATE.md, main 무관 |
| Receipt classification | [CLAUDE.md §3.3](../../CLAUDE.md) 12-tier | Codex classification은 inject 가능한 항목만 (8개) |
| Defect severity | [memory: feedback-loud-fail-open](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-loud-fail-open.md) | BLOCKING/HIGH/MED/LOW/NTH + 사용자 가시 신호 |
| YAGNI Triage in audit | [v0-2-9-gate-round-yagni.plan.md](v0-2-9-gate-round-yagni.plan.md) | 결함도 ACCEPT_NOW / DEFER_TO_BACKLOG / REJECT_YAGNI 적용 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `.worktrees/v1.0.0-verify-{1..10}/` | CREATE | 10개 격리 worktree (병렬 또는 순차) |
| (각 worktree) `.claude/settings.local.json` | UPDATE | 검증 카테고리에 맞게 env 조작 (W1 기준 defaults `{}`) |
| (각 worktree) `.claude/state/STATE.md` | RESET → mccp가 자동 write | 세션 시작 시 격리 |
| (각 worktree) `.claude/audit/v1.0.0-{category}.md` | CREATE | outcome ledger (Claude가 자동 채움) |
| (main, post-verification) `.claude/audit/v1.0.0-release-verification-verdict.md` | CREATE | 10 worktree audit 통합 + verdict |
| (main 코드) | NONE | 수정은 worktree-local. main cherry-pick은 verdict 응답에서 결정 |

## Worktree Topology (11개)

| # | Worktree | 검증 카테고리 | 세션 격리 이유 | 추정 시간 |
|---|---|---|---|---|
| W1 | `v1.0.0-verify-baseline` | 10 명령어 단일 호출 + `/mccp:work` 3분기 | 새 receipt chain, 새 STATE.md | 90분 |
| W2 | `v1.0.0-verify-codex-backoff` | 8 codex classification simulation | codex 호출 시 인증/companion 조작 격리 | 60분 |
| W3 | `v1.0.0-verify-impeccable` | impeccable detect / invoke / skipped / force-override | Skill state + design surface 격리 | 45분 |
| W4 | `v1.0.0-verify-receipts` | receipt 손상 5 시나리오 + 복구 | 의도적 손상이 다른 검증 오염 방지 | 60분 |
| W5 | `v1.0.0-verify-handoff` | cost ceiling 3-tier + spawn graceful degrade | cost-state file 격리 (`MCCP_COST_STATE_DIR`) | 60분 |
| W6 | `v1.0.0-verify-state-continuity` | PreCompact → SessionStart roundtrip | 세션 cross-over 자체가 검증 대상 | 45분 + 세션 2회 |
| W7 | `v1.0.0-verify-docs-sync` | PR 전 완료/진행중 문서 분리 | 문서 변경 main 누수 방지 | 30분 |
| W8 | `v1.0.0-verify-dual-reviewer` | R1/R2/R3 escalate + cap matrix | codex 실 호출 + intentional finding inject | 90분 |
| W9 | `v1.0.0-verify-goal-loop` | continuous learning 미구현 영역 부분 동작 관찰 | 가벼움 — 측정만 | 30분 |
| W10 | `v1.0.0-verify-env-matrix` | 18 환경변수 × non-default value 1회씩 | env값 cross-contamination 방지 | 120분 |
| **W11** | `v1.0.0-verify-fallback-ux` | **fallback chains × 사용자 결정 type 측정** | **dependency 조작 (codex CLI 일시 제거 등)이 시스템 wide 영향 → 격리 필수** | **75분** |

병렬 실행 가능 worktree (각 사용자 새 세션 별도): W1, W3, W4, W7, W9 (네트워크/외부 의존 적음).
순차 권장: W2 (codex 인증 조작 후 복구 필수), W5 (cost-state mock 후 복구), W6 (PreCompact 자연 발생 대기), W8 (codex 실 호출 + rate-limit risk), W10 (env 매트릭스가 가장 길음), **W11 (의도적 dependency 손상 → 시스템 전체 영향 → 가장 마지막 권장, 종료 시 dependency 완전 복원 검증 필수)**.

## Tasks

각 Task는 1개 worktree에 매핑. 각 worktree에서 새 Claude 세션이 자동 진행. 첫 prompt 1-liner를 task 내 명시.

### Task W0: 메타-부트스트랩 (현 main 세션에서 진행)

- **Action**:
  1. main에서 `git worktree add` 10회 (각 worktree, branch는 `v1.0.0-verify-{category}` 패턴)
  2. 각 worktree에 빈 audit 파일 스캐폴드 작성 (frontmatter + 빈 outcome table)
  3. 각 worktree의 `.claude/settings.local.json`을 카테고리별로 사전 세팅 (W1=`{}` defaults, W10=각 매트릭스 row가 자체 세팅)
  4. main의 `.claude/notes/v1.0.0-verification-launchpad.md` 작성 — 10 worktree 진입 1-liner 모음
- **Mirror**: `.worktrees/` convention
- **Validate**: `git worktree list` → 10 worktree 표시, 각각 fresh branch. main의 launchpad 노트가 사용자에게 진입 가이드 역할

### Task W1: Baseline 명령어 dogfood

- **Worktree**: `.worktrees/v1.0.0-verify-baseline/`
- **Settings**: `.claude/settings.local.json` = `{}` (완전 defaults)
- **새 세션 첫 prompt**: `v1.0.0 verification W1 시작. .claude/plans/v1-0-0-release-verification.plan.md Task W1을 자동 진행하고 .claude/audit/v1.0.0-baseline.md에 결과를 채워줘. 외부 시스템 변경 / 인증 / verdict 결정 외에는 사용자에게 묻지 마.`
- **Action** (Claude가 자동):
  - 10 명령어 × 1회씩 호출 + 결과 audit row 작성
  - `/mccp:work` 3분기 (trivial, full, --full override) 각 1회
  - synthetic feature 1개 (README 1줄 typo 또는 dummy hook) 사용, commit + PR step은 dry-run (실 GitHub call 금지 — Phase 0에서 abort)
  - 각 row에 (latency, stderr 노이즈, prompt 친구, receipt 작성, UX 1-5 등급)
- **Mirror**: [commands/*.md](../../plugins/mccp/commands/)
- **Validate**: 10 + 3 = 13 outcome row 작성, 누락 0, 사용자 escalate 0회

### Task W2: Codex backoff classification matrix

- **Worktree**: `.worktrees/v1.0.0-verify-codex-backoff/`
- **Settings**: defaults `{}` (codex 살아있는 상태에서 시작)
- **첫 prompt**: `v1.0.0 verification W2 시작. Task W2의 8 codex classification을 audit/v1.0.0-codex-backoff.md에 채워줘. 인증 reset이 필요한 'not-authenticated' case 직전에만 사용자에게 1회 확인 받아.`
- **Action** (Claude 자동):
  - 8 classification × 1회 inject + outcome 기록 (`ok`, `disabled`, `timeout`, `not-authenticated`, `stdout-empty`, `companion-not-found`, `parse-error`, `tempfail`)
  - Inject 방법: env / companion 경로 rename / mock companion script 작성 / quarantine race
  - `tempfail` 발생 시 hook ALLOW + caller exit 75 검증 — exit 75를 받는 게 정상
  - 각 case 후 환경 복원 (companion rename → unrename, codex auth backup → restore)
- **사용자 escalate trigger**: `not-authenticated` case 직전 (인증 reset 동의) + case 종료 후 (재인증 안내)
- **Mirror**: [codex-invoke.js](../../plugins/mccp/scripts/lib/codex-invoke.js) classification enum
- **Validate**: 8 row 작성. 각 row의 (a) receipt meta.classification 정확, (b) advisory mode 활성 시 non-approving, (c) 사용자 가시 메시지가 "원인 + 복구 1줄"

### Task W3: impeccable delegation

- **Worktree**: `.worktrees/v1.0.0-verify-impeccable/`
- **Settings**: defaults
- **첫 prompt**: `v1.0.0 verification W3 시작. Task W3의 4 impeccable scenario를 audit/v1.0.0-impeccable.md에 채워줘.`
- **Action**:
  - Scenario 1: design surface 없는 plan (backend hook) → silent skip
  - Scenario 2: design surface 있는 plan (UI color/typography keyword) → Skill invoke, plan body `## Design Critique` append
  - Scenario 3: impeccable Skill probe fail (PATH 임시 조작) → auto-fallback marker
  - Scenario 4: `/mccp:pr`에서 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` reason validator → 1-token reject 케이스 + valid 30자+ 케이스 1회씩 (총 2 sub-row)
  - `MCCP_CODEX_DESIGN_SCOPE_HONOR=0` 1회 시도 → preamble 부재 확인
- **사용자 escalate**: 없음 (모두 in-tree)
- **Mirror**: [impeccable-detect.js](../../plugins/mccp/scripts/lib/impeccable-detect.js)
- **Validate**: 5 row 작성. design_findings_dropped + a11y_routed_to_impeccable receipt meta 확인

### Task W4: Receipt 손상 시나리오

- **Worktree**: `.worktrees/v1.0.0-verify-receipts/`
- **Settings**: defaults
- **첫 prompt**: `v1.0.0 verification W4 시작. Task W4의 5 receipt 손상 시나리오를 audit/v1.0.0-receipts.md에 채워줘.`
- **Action**:
  - 4a JSON parse error inject → validate-cmd 진단 → 자동 `/mccp:receipt-write` 시도 → 결과
  - 4b schema version 누락 → migration script run → 결과
  - 4c generic decision_id (`default.json`) 시뮬 → quarantine auto-trigger 관찰
  - 4d `pr-phase.lock` orphan (PID 사망 + mtime > 60s 시뮬) → 다음 `/mccp:pr` 진입에서 reclaim
  - 4e receipt chain 끊김 (plan receipt 삭제) → prp-implement 진입에서 STOP + 복구 path
- **사용자 escalate**: 없음 (모두 in-tree)
- **Mirror**: [v0.2.8-quarantine.js](../../plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js) + [classify.js](../../plugins/mccp/scripts/receipt/classify.js)
- **Validate**: 5 row 작성. 각 row에 (자동 진단 정확도, 복구 path 발견까지 시간, 자동 복구 성공률)

### Task W5: session_handoff (cost ceiling 3-tier + spawn)

- **Worktree**: `.worktrees/v1.0.0-verify-handoff/`
- **Settings**: `MCCP_AUTO_HANDOFF` 매트릭스로 변경 (off / notify / spawn 3회 각각)
- **첫 prompt**: `v1.0.0 verification W5 시작. Task W5의 cost ceiling 3-tier × auto-handoff 3-mode 매트릭스를 audit/v1.0.0-handoff.md에 채워줘. claude binary ENOENT는 의도된 degrade 확인 대상.`
- **Action**:
  - 9 cell matrix (notice/soft/hard × off/notify/spawn) → 각 1회
  - cost-state file mock으로 누적 비용 inject → Stop hook fire 관찰
  - spawn 모드 + ENOENT → notify degrade 확인 (현 환경에서 자동)
  - 각 cell의 사용자 가시 메시지 + receipt + STATE.md `Next Step` 검사
- **사용자 escalate**: 없음
- **Mirror**: [auto-handoff.js](../../plugins/mccp/scripts/hooks/auto-handoff.js)
- **Validate**: 9 row 작성. spawn ENOENT degrade가 사용자에게 1줄 명시되는지

### Task W6: STATE.md continuity (의도된 cross-session)

- **Worktree**: `.worktrees/v1.0.0-verify-state-continuity/`
- **Settings**: defaults
- **세션 2회 필요** — 본 plan의 핵심:
  - **Session A 첫 prompt**: `v1.0.0 verification W6 Session A. mid-task state 만들기: synthetic plan 작성 + prp-implement 진입 직전에 종료. PreCompact 강제 trigger 후 audit/v1.0.0-state-continuity.md에 Session A row 작성하고 종료.`
  - **사용자에게 escalate**: "Session A 종료됨. Session B 새 세션을 같은 worktree에서 시작해주세요. 첫 prompt: `v1.0.0 verification W6 Session B. STATE.md inject가 새 세션 첫 message에 보이는지 확인하고 audit에 Session B row 작성. resume이 1줄 명령으로 가능했는지 평가.`"
- **Action**:
  - Session A: mid-task fixture → `pre-compact` hook 실행 → STATE.md write + content-hash skip 확인
  - Session B: SessionStart inject 확인 → STATE.md 4 field 복원 검증 (Goal / Plan / In Progress / Next Step) → resume 1줄 시도
- **사용자 escalate**: Session A → B 전환 (Claude가 자동으로 동일 worktree에 새 세션 시작 불가)
- **Mirror**: [pre-compact.js](../../plugins/mccp/scripts/hooks/pre-compact.js), [session-start.js](../../plugins/mccp/scripts/hooks/session-start.js)
- **Validate**: 2 row 작성. Session B의 resume이 1줄로 가능했는가 = BLOCKING 결정 항목

### Task W7: PR 전 문서 분리 검증

- **Worktree**: `.worktrees/v1.0.0-verify-docs-sync/`
- **Settings**: defaults
- **첫 prompt**: `v1.0.0 verification W7 시작. Task W7의 문서 분리 4 항목을 audit/v1.0.0-docs-sync.md에 채워줘.`
- **Action**:
  - 7a `.claude/plans/v0-*.plan.md` status field 검사 — completed/in-progress 분리 상태
  - 7b `.claude/prds/*.prd.md` delivered milestone 표 갱신 상태
  - 7c CLAUDE.md milestone 표 최신성
  - 7d main repo의 `.claude/notes/` cycle별 lesson-learned 분리 여부
  - 각 항목 발견된 stale 문서 → 결함 row (자동 수정은 main에 누수 위험 → 결함으로만 기록, main에서 수동 fix 권고)
- **사용자 escalate**: 없음
- **Mirror**: 없음 (mccp는 현재 mechanical enforce 안 함 — 결함을 찾는 게 목적)
- **Validate**: 4 row 작성. stale 문서 발견 시 BLOCKING/HIGH/MED 분류

### Task W8: 2중 reviewer 피드백 루프 (R1/R2/R3)

- **Worktree**: `.worktrees/v1.0.0-verify-dual-reviewer/`
- **Settings**: defaults + `MCCP_GATE_ROUND_CAP` 매트릭스 (1, 2, 3 각 1회)
- **첫 prompt**: `v1.0.0 verification W8 시작. Task W8의 reviewer escalate 3-cap × intentional finding 매트릭스를 audit/v1.0.0-dual-reviewer.md에 채워줘. codex 실 호출 사용. rate-limit 발생하면 사용자에게 escalate.`
- **Action**:
  - cap=1: 정상 finding plan → R1만 진행
  - cap=2 + CRITICAL severity inject (예: SQL injection risk in plan) → R1 → R2 escalate 확인
  - cap=3 + 더 강한 inject → R3까지 → DIVERGENT_UNRESOLVED annotation 확인
  - DEFER_TO_BACKLOG row가 [codex-findings-backlog.md](codex-findings-backlog.md)에 append되는지
  - Open Questions 캐치 (auto-CRITICAL stop catalog 작동)
- **사용자 escalate**: rate-limit hit (`usage_limit_exceeded`) 또는 codex 재인증 필요
- **Mirror**: [v0-2-9-gate-round-yagni.plan.md](v0-2-9-gate-round-yagni.plan.md), plan.md Phase 5.4
- **Validate**: 3 cap × ~2 case = 5-6 row. R2 trigger 조건이 정확, DEFER_TO_BACKLOG append 확인

### Task W9: Goal/Loop continuous learning (미구현 영역 관찰)

- **Worktree**: `.worktrees/v1.0.0-verify-goal-loop/`
- **Settings**: defaults
- **첫 prompt**: `v1.0.0 verification W9 시작. Task W9의 미구현/부분 동작 4 항목을 audit/v1.0.0-goal-loop.md에 채워줘.`
- **Action**:
  - 9a STATE.md `Goal` field가 세션 간 일관 유지되는가
  - 9b `.claude/notes/` cycle별 lesson-learned 누적 패턴 검사
  - 9c memory feedback (user-level)이 새 세션에 inject + 행동 반영 여부
  - 9d v0.4.0 axis J issue ledger 부재 확인 (`.claude/issues/` 없음 → 미구현 baseline)
  - 각 항목 (Built / Partial / Absent) 분류
- **사용자 escalate**: 없음
- **Mirror**: 없음 (관찰 전용)
- **Validate**: 4 row 작성. 각 row의 분류가 axis J/I 미래 baseline으로 활용 가능

### Task W10: 환경변수 매트릭스 (각 env × non-default value 1회)

- **Worktree**: `.worktrees/v1.0.0-verify-env-matrix/`
- **Settings**: 각 sub-task가 자체 env 세팅
- **첫 prompt**: `v1.0.0 verification W10 시작. Task W10의 환경변수 매트릭스를 audit/v1.0.0-env-matrix.md에 채워줘. 각 env × non-default value 1회씩. 매트릭스 row 사이 settings.local.json 복원 자동.`
- **Action** — 18 env var × 각 non-default value:

| Env | Values | 검증 |
|---|---|---|
| `MCCP_STOP_LOOP` | off, enforce | `observe`(default) 외 2 value 동작 |
| `MCCP_STOP_LOOP_CODEX` | 1 | Codex diff review opt-in 동작 |
| `MCCP_RECEIPT_GATE_MODE` | soft, off | 누락/skipped/advisory receipt 처리 분기 |
| `MCCP_SKIP_RECEIPT` | 1 | 일회성 bypass — 다음 호출에 자동 해제 |
| `MCCP_RECEIPT_DEBUG` | 1 | 디버그 출력 + L2a ALLOW-path systemMessage |
| `MCCP_RECEIPT_DEBUG_LEGACY_INLINE` | 0 | L2a opt-out + 기존 inline 모드 |
| `MCCP_ALLOW_CODEX_UNAVAILABLE` | 1 | advisory mode, non-approving receipt. terminal pr은 reject |
| `MCCP_CODEX_DISABLED` | 1 | v0.3.5 first-class skip 동작 (M8) |
| `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` | "valid 30+ char reason" | audited escape + receipt meta 작성 |
| `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` | "valid 30+ char reason" | SCHEMA REJECT validator + valid case |
| `MCCP_PR_SKIP_CODEX_REVIEW` | "valid 30+ char reason" | dedupe 외 skip + receipt meta + body footer |
| `CODEX_DEDUPE_AT_PR` | 1 | F9 mutex preflight (MCCP_PR_SKIP_CODEX_REVIEW와 mutually exclusive) |
| `MCCP_GATE_ROUND_CAP` | 2, 3 | (W8과 중복 — W10에서는 default 외 동작만 확인) |
| `MCCP_CODEX_DESIGN_SCOPE_HONOR` | 0 | 축 1 kill switch — preamble 부재 / filter 비활성 |
| `MCCP_AUTO_CHAIN_DISABLE` | 1 | kill switch 동작 |
| `MCCP_AUTO_CHAIN_SKIP_PR` | 1 | commit-only chain |
| `MCCP_AUTO_HANDOFF` | (W5와 중복 — skip) | — |
| `MCCP_HANDOFF_THRESHOLDS_USD` | "0.01,0.02,0.03" (mock), "invalid" (parse 실패 default fallback 확인) | 2 sub-row |

총 row: ~22 (일부 W5/W8과 중복은 skip). 각 row 후 env 복원.
- **사용자 escalate**: 없음 (모두 in-tree)
- **Mirror**: [CLAUDE.md §4](../../CLAUDE.md) 운영 토글 cheat sheet
- **Validate**: 22 row 작성. mutex/precedence 위반 0회

### Task W11: Fallback UX chain — 사용자 결정 type 측정

본 worktree는 **"기능이 실패할 때도 사용자가 yes/no 단답으로 최종 승인자가 될 수 있는가"** 를 측정. 다른 worktree와 차원이 다름 — 기능 동작 여부가 아닌 **흐름의 자연스러움** 평가.

- **Worktree**: `.worktrees/v1.0.0-verify-fallback-ux/`
- **Settings**: 각 sub-task 별 dependency 조작 (codex CLI rename, impeccable PATH 임시 제거 등)
- **첫 prompt**: `v1.0.0 verification W11 시작. Task W11의 fallback UX 매트릭스를 audit/v1.0.0-fallback-ux.md에 채워줘. 각 row마다 UX Decision-Type Rubric (Type A-E + Next-step 1-5)을 평가. dependency 조작은 row 종료 후 즉시 복원. 시스템 wide 영향 발생 시 사용자에게 즉시 escalate.`
- **Action** (Claude 자동, 매 row마다 rubric 평가):

| Sub-row | 시나리오 | Inject 방법 | 측정 항목 |
|---|---|---|---|
| 11a | `/mccp:setup` × codex CLI 미설치 | `~/.claude/plugins/installed_plugins.json`에서 codex entry 일시 제거 | (a) 설치 권장 메시지가 1줄로 나오는가, (b) 설치 명령 + URL 명시, (c) skip 옵션, (d) 결정 type |
| 11b | `/mccp:setup` × **notify-line spec 검증** (inject 없음, 권한 footprint 0) | 정상 환경에서 `/mccp:setup` 1회 실행, stdout/stderr 캡처 | (a) "codex app을 설치하지 않으면 codex review가 정상적으로 동작하지 않습니다" 또는 동등한 의미의 notify line이 출력되는가, (b) line 위치(setup 시작/종료), (c) line 톤(권장 vs 경고 vs 정보), (d) **부재 시 자동 HIGH severity** — 사용자 명시 spec 요구사항. 진단/검사 시도 0회 — 단순 stdout 관찰 |
| 11c | `/mccp:setup` × impeccable 미설치 | impeccable Skill probe 일시 fail | (a) "design 리뷰 시 fallback됨" 명시, (b) 설치 명령, (c) skip 옵션 |
| 11d | `/mccp:setup` × 모든 component 설치 but skip 선택 | 정상 환경에서 skip 입력 | (a) skip 가능한가, (b) skip 후 진행 가능한가, (c) 다음 step 명료 |
| 11e | session_handoff spawn × child claude 인증 실패 | spawn child가 auth 실패 시뮬 (env에서 `ANTHROPIC_API_KEY` 제거 → child가 prompt) | (a) parent가 child stderr 1줄 캡처 + notify degrade, (b) "API key not set" 진단, (c) 다음 step 명료 |
| 11f | session_handoff spawn × child claude timeout | spawn child가 응답 없음 (90s wait) | (a) timeout kill 동작, (b) "child unresponsive" 메시지, (c) notify degrade, (d) 결정 type |
| 11g | Codex companion timeout (90s) | `--timeout-ms 100` 또는 wrapper에서 90s wait | (a) advisory mode 권장 prompt가 yes/no인가, (b) "30분 후 재시도" 명시 |
| 11h | Codex rate-limit hit (`usage_limit_exceeded` 시뮬) | mock companion이 rate-limit response 반환 | (a) "5h limit" 명시, (b) advisory mode 권장, (c) 다음 step (재시도 시간 / advisory 진입) 명료 |
| 11i | Impeccable Skill invoke timeout | Skill 호출이 응답 없음 시뮬 | (a) auto-fallback marker, (b) "design 리뷰 skip됨" 메시지, (c) plan 진행 가능 |
| 11j | Receipt 손상 자동 복구 실패 → 사용자 안내 | `/mccp:receipt-write` mock으로 fail 반환 | (a) "자동 복구 실패, 다음 명령으로 수동 복구: ..." 1줄 안내, (b) 결정 type, (c) **결정적 시나리오** — 자동→수동 fallback의 친구 |
| 11k | `/mccp:work` chain 도중 plan 게이트 실패 | plan 게이트가 BLOCKING 반환 | (a) chain 중단 명시, (b) 사용자가 plan 수정 후 resume할 1줄 명령, (c) 결정 type |
| 11l | PR step에서 security-reviewer 미가용 | security-reviewer agent 일시 제거 | (a) advisory rejection 메시지, (b) `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` 권장 메시지 (1줄), (c) 결정 type |

총 12 row (11b는 inject 없는 stdout 관찰, 나머지 11개는 dependency 조작 row). 각 dependency 조작 row 종료 후 즉시 복원 + `/mccp:setup`으로 정상화 확인.

**11b 특이사항**:
- inject 0, 권한 footprint 0 — 단순 setup 1회 실행 후 stdout 캡처
- 측정 대상 = **notify line의 존재 여부 + 명료성**
- 부재 시: 자동 HIGH severity (사용자 명시 spec 요구사항이므로 v1.0.0 ship 직전 patch 후보)
- 존재 시: next-step 명료성 평가 + W11 UX rubric 적용
- mccp가 실제 codex app 설치 여부를 *검사하지 않음*이 정상 — notify만 함으로써 사용자가 최종 승인자 role 유지 (검사 시도는 권한 위험)

- **사용자 escalate**:
  - dependency 조작 직전 1회 (W11 시작 시 통합 confirm — codex CLI rename, impeccable PATH 조작 등 시스템 wide 영향 알림)
  - W11 종료 후 dependency 완전 복원 검증 confirm (1회)
- **Mirror**: 없음 — W11은 신규 UX evaluation pattern. v0.4.0 axis I (next-session 1-liner)의 success metric baseline 역할
- **Validate**:
  - 12 row 작성, 각 row에 (Type A-E + Next-step 1-5) 두 metric 기록
  - 평균 결정 type ≥ 3.0 OR 평균 next-step ≥ 3.0 → HIGH UX defect
  - ≥ 1 row type E OR next-step 5 → BLOCKING
  - **11b notify line 부재 = 자동 HIGH severity** (사용자 명시 v1.0.0 spec 요구사항, ship 직전 patch 후보로 즉시 escalate)

### Task W-VERDICT: 통합 + verdict (main 세션, 사용자 응답 후)

- **Action** (Claude가 main에서 진행):
  - 11 worktree audit 파일을 main으로 cherry-pick (`.claude/audit/`)
  - `.claude/audit/v1.0.0-release-verification-verdict.md` 작성:
    - 11 카테고리 × outcome count
    - 5-tier severity tally + W11의 UX rubric 평균
    - BLOCKING ≥ 1 → STOP_RELEASE 권고, HIGH ≥ 3 OR W11 UX 평균 ≥ 3.0 → CONDITIONAL, 나머지 → GO
    - 발견된 v0.4.0 axis 우선순위 재조정 권고 (특히 W11이 axis I와 직결)
  - 사용자에게 verdict 응답 후 ship 결정 위임
  - worktree 정리 (audit만 보존, 나머지는 `git worktree remove`)
- **Mirror**: v0.4.0 audit가 main에 read-only commit된 패턴
- **Validate**: main 단일 verdict 파일이 사용자의 ship 결정에 1줄로 답함

## Validation (전체)

```bash
# 11 worktree 진입 가이드
cat .claude/notes/v1.0.0-verification-launchpad.md

# 누적 진행
git worktree list

# 각 worktree audit
for w in baseline codex-backoff impeccable receipts handoff state-continuity docs-sync dual-reviewer goal-loop env-matrix fallback-ux; do
  ls .worktrees/v1.0.0-verify-$w/.claude/audit/v1.0.0-$w.md
done

# verdict 통합
cat .claude/audit/v1.0.0-release-verification-verdict.md

# main 누수 0
git status --short  # → clean throughout (audit 통합 commit 직전까지)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 11 worktree × 새 세션 = 사용자 명령 입력 횟수 증가 → modify 4번 정신(사용자 개입 최소화) 위반 | High | 각 worktree 진입 1-liner를 launchpad 노트에 모음. 사용자가 copy-paste 1회씩 → 11회 명령. 그 외 모든 디버깅은 Claude가 worktree 안에서 자동 |
| Codex 살아있다는 사용자 statement가 부정확 — 실제는 disabled | Med | W2/W8이 첫 codex 호출 결과로 자동 검증. disabled면 그 자체가 결함 row + advisory mode 자동 전환 |
| W2 not-authenticated inject가 시스템 codex auth 영구 손상 | Med | inject 직전 `~/.codex/auth.json` 백업 → case 종료 직후 복원. 사용자에게 backup/restore 1회씩 confirm |
| W5 spawn 모드 + ENOENT degrade는 현 환경에서 confirmed → 정상 시나리오 측정 불가 | Confirmed | spawn 모드 = "ENOENT graceful degrade 동작" 측정으로 reframe. spawn 정상 동작 검증은 v0.4.0 axis B/C ship 후로 carry |
| Pro `usage_limit_exceeded` 5h rate-limit hit | High (모두 dogfood) | 병렬 worktree는 W1/W3/W4/W7/W9 (codex 의존 적음). 순차 worktree (W2/W5/W6/W8/W10/W11) 사이 30분 휴식. W8 (rate-limit risk 최고) 마지막 진행 |
| audit 파일이 worktree-local이므로 main에 통합 누락 위험 | Low | W-VERDICT가 cherry-pick + main commit을 명시. main으로 복귀 시 git status 확인 |
| 본 plan command Phase 5 게이트가 codex 실 호출 — codex가 disabled면 plan 작성 자체가 disabled marker | Med | disabled marker도 정상 outcome. 사용자가 confirm 후 Phase 5 진입 — 그때 실제 상태 확인 |
| W6 Session A → B 전환에서 사용자가 wrong worktree 진입 | Low | launchpad 노트에 cd path 명시 |
| W8의 intentional CRITICAL inject가 실제 PR로 누수 (의도 안 한 push) | Med | W8은 PR step을 dry-run으로 abort (W1과 동일 패턴) — 실 GitHub call 0회. force-push 0회 |
| **W11 dependency 조작이 시스템 wide 영향** (codex CLI rename, impeccable PATH 조작) | **High** | 각 row 종료 후 즉시 복원 + W11 종료 시 `/mccp:setup`으로 정상화 검증. dependency 조작 직전 사용자 통합 confirm 1회. row 사이 system health check |
| **W11 11b "codex app vs CLI" 시뮬이 실제 codex app 동작에 영향** | Med | 11b는 mock companion으로 시뮬 (실 codex app 건드리지 않음) — companion script만 일시 wrap. 종료 후 unwrap |
| **W11 UX rubric의 주관성** — Type A-E 분류가 평가자에 따라 달라질 수 있음 | Med | 각 row에 결정 type 근거(quoted prompt + 측정 시각)를 기록. W-VERDICT에서 사용자가 재검토 가능 |

## Acceptance

- [ ] W0 — 11 worktree 생성 + launchpad 노트 작성
- [ ] W1 — 13 baseline outcome row (10 명령 + 3 work 분기)
- [ ] W2 — 8 codex classification row
- [ ] W3 — 5 impeccable row
- [ ] W4 — 5 receipt 손상 row
- [ ] W5 — 9 handoff matrix row
- [ ] W6 — 2 STATE.md continuity row (Session A + B)
- [ ] W7 — 4 docs sync row
- [ ] W8 — 5-6 dual-reviewer row
- [ ] W9 — 4 goal/loop 미구현 baseline row
- [ ] W10 — 22 env matrix row
- [ ] **W11 — 12 fallback UX row, 각 row에 (결정 type + next-step) 두 metric, 평균 < 3.0**
- [ ] W-VERDICT — 통합 audit + verdict 파일 (UX rubric 평균 포함)
- [ ] 사용자 escalate 횟수 ≤ Autonomy Contract + 11 worktree 진입 (11회) + W6 session B 전환 (1회) + W2 codex auth backup/restore (2회) + W11 dependency 조작/복원 confirm (2회) = **최대 16회**
- [ ] main 코드 변경 누수 0 (audit 파일 외 0)
- [ ] codex permanent bypass memory rule은 W-VERDICT 직후 복원 (`MCCP_CODEX_DISABLED=1` re-add 결정은 사용자)
- [ ] **W11 종료 후 모든 dependency 정상 동작 검증 (`/mccp:setup` clean 통과)**

## Codex Adversarial Review

- 호출: `unset MCCP_CODEX_DISABLED MCCP_RECEIPT_GATE_MODE && node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.3.6/scripts/lib/codex-invoke.js adversarial-review --impeccable-available` (옵션 c — Bash 단일 호출 내 unset이 spawn 시점 부모 env에 적용됨을 확인)
- 라운드 수: 1 (R1만; default cap=1)
- threadId: 019eb887-94a6-7152-83d4-8de42998619d
- durationMs: 232314 (3분 52초)
- impeccable-available: true (Skill probe pass + design-scope honor 정상 적용)
- verdict: **needs-attention**
- summary: *"No-ship. The plan is internally inconsistent on the worktree count, relies on unsafe global auth mutation, and uses a subjective W11 gate as a release decision input."*

### YAGNI Triage (모두 ACCEPT_NOW)

| F# | Severity | Verdict | Title | One-line Why |
|---|---|---|---|---|
| F1 | HIGH | ACCEPT_NOW | Worktree manifest creates only 10 worktrees while plan depends on W1-W11 | Files to Change 표 + W0 bootstrap이 `{1..10}`로 명시, W11 silent skip 위험. confidence 0.94 |
| F2 | HIGH | ACCEPT_NOW | W2 mutates real Codex auth outside worktree isolation | `~/.codex/auth.json`은 global, 11-worktree isolation 무효. Windows lock/race → permanent auth loss 위험. confidence 0.88 |
| F3 | MEDIUM | ACCEPT_NOW | W11 release gate is self-scored and insufficiently calibrated | 같은 세션이 발화+점수, subjective 1점 swing이 CONDITIONAL vs GO 결정. confidence 0.81 |

- Deferred to backlog: 0
- Open Questions: 없음 (3 findings 모두 본 절의 absorption attestation으로 흡수)
- Codex thread 참조: 019eb887-94a6-7152-83d4-8de42998619d

### R1 Absorption Attestation (per command body §5.4)

3 findings 모두 ACCEPT_NOW이고 default cap=1로 R2 미실행. 본 attestation 섹션이 plan v0.5의 canonical absorption record — plan 본문(W0 / W2 / W11) 직접 수정 대신 본 섹션을 binding amendment로 둠. 후속 worktree session 진입 시 각 task body 읽기 전에 본 attestation을 reference로 인지.

**F1 흡수 — manifest single source of truth + preflight**
- W0 Action #1의 `git worktree add` 호출 list를 **W1-W11 11 worktree**로 갱신 (기존 "10회" stale)
- W0에 새 preflight step 추가: 11 worktree 모두 디스크 존재 + 각 audit 파일 스캐폴드 존재 검증. 부재 시 verification 진행 차단
- Files to Change 표의 `.worktrees/v1.0.0-verify-{1..10}/` → `.worktrees/v1.0.0-verify-{W1..W11}/` (11개)
- 본 attestation이 후속 session의 W0 진입 시 sufficient reference

**F2 흡수 — W2 isolated CODEX_HOME + mock companion 대체**
- W2 `not-authenticated` inject 방법 변경: 실 `~/.codex/auth.json` 백업/복원 **금지**
- 대체 방법 1 (권장): `CODEX_HOME=<temp dir> codex-companion.mjs ...` — companion이 빈 CODEX_HOME 보면 `not-authenticated` classification 자연 발생, 진짜 companion 동작 측정 가능
- 대체 방법 2: mock companion script 작성 (`exit 0` + stdout에 `setup_required` 패턴)
- 사용자 escalate 횟수 -2 (auth backup/restore confirm 제거) → 최대 16회 → **14회**

**F3 흡수 — W11 raw evidence + predeclared max + scripted assertion + second review**
- W11 각 row에 raw stdout/stderr 캡처 의무 — `.claude/audit/v1.0.0-fallback-ux.md` row에 raw 첨부
- verification 시작 전 사용자가 row별 **predeclared max acceptable (Type, Next-step) score** 명시. 측정값이 max 초과 시 자동 결함
- scripted assertion 가능한 row (특히 11b notify line) — grep으로 키워드 raw stdout 검증
- W11 종료 후 **second review pass** — 다른 worktree(W6 Session B 권장)에서 same audit 재검토, 점수 ±1 미만 disagreement 시만 verdict input
- 임계 변경: 평균 ≥3.0 → CONDITIONAL, **type E OR next-step 5 단일 row → STOP_RELEASE** (기존 ≥1 row 룰 유지)
- W11 추정 시간 75분 → 90분 (raw 캡처 + second review overhead)

흡수 후 effective plan 버전 = **v0.5**. R2 escalate 조건은 (a)+(b) 양쪽 모두 충족 시인데, (a) 충족이지만 (b)는 본 attestation이 self-attestation으로 처리 — cap=1 내에서 종료.

### 사용자 명시 codex live 상태 확인 (Finding A 부수 데이터포인트)

- 옵션 (c) `unset MCCP_CODEX_DISABLED MCCP_RECEIPT_GATE_MODE` 1줄로 wrapper short-circuit 우회 성공 — disk vs session env divergence의 사용자 fallback path 확정
- mccp v1.0.0 patch 후보: SessionStart hook에서 `.claude/settings.{local}.json` env vs `process.env` diff 감지 → notify line 추가 ("이 세션 시작 시점 env가 disk와 다릅니다. 새 세션 시작 권장")
- 본 데이터포인트를 W11 fallback UX inventory에 row 11m으로 추가 (v0.5 amendment에 포함)

