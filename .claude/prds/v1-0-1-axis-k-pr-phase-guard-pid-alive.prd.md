# v1.0.1 axis K — `pr-phase-guard.js` PID liveness verification

## Problem

`pr-phase-guard.js` PreToolUse hook은 `pr-phase.lock`이 존재하고 subphase=codex-review이면 **모든 Bash tool 호출을 무조건 block**합니다. lock holder의 PID liveness는 검증하지 않습니다. PR helper crash로 dead PID + orphan lock이 남은 시나리오에서, 사용자가 `/mccp:pr`을 재호출하면 hook이 안내하는 escape 명령 (`detect-stale`)이 두 layer로 자기 거부됩니다 — (a) `2>&1` redirect가 `\S>\S` mutating-construct pattern에 차단, (b) `2>&1` 없이 호출해도 helper-path-anchored regex (`/pr-phase-helpers/[a-z][a-z0-9-]*\.js`)에 매칭 안 됨. Linux/macOS 사용자는 process 강제 종료 + 새 session 외 path가 없습니다 (self-trap). Windows 사용자는 PowerShell tool이 Bash PreToolUse hook 적용 범위 밖이라 우회 가능 — single-user Windows dogfood에서는 실효 BLOCKING 아님, **그러나 cross-platform credibility 위협 + v0.4.0 multi-session orchestrator 진입 시 동일 worktree 내 worker session lock 충돌로 가시화**.

## Evidence

- W4 4d row 원본 — BLOCKING / Type E / Next-step 5 단일 row 이중 트리거 → STOP_RELEASE 임계 정확 충족 (`.claude/audit/v1.0.0-receipts.md:23`)
- W4 §"임계 평가": "4d Type E AND Next-step 5 단일 row 이중 트리거 → STOP_RELEASE 권고" (line 65–66)
- W-VERDICT §2 5-tier severity tally: BLOCKING tally = 1, source = W4 4d 단일 (`.claude/audit/v1.0.0-release-verification-verdict.md:52`)
- W-VERDICT §G1-mitigation 환경 분기 (line 95–101): "Linux/macOS (cross-platform ship): process 강제 종료 + 새 session 외 path 없음 → true BLOCKING"
- W-VERDICT §6 axis K 신규 정의 (line 175): "★ pre-v1.0.0 권장 (cross-platform credibility)"
- W-VERDICT §7 C3 cherry-pick path (line 192): "BLOCKING (env-conditional) → HIGH; Linux/macOS true-BLOCKING 해소"
- Ship 결정 lineage — STATE.md prior session: 사용자 옵션 2 (CONDITIONAL acceptance) 선택, axis K (C3)는 v1.0.1로 demote → v1.0.1 patch cycle의 첫 약속
- W4 4d guard hook 동작 위치: `pr-phase-guard.js:317-329` `lockActive()` + `denyBlock()` (audit cross-reference)

## Users

- **Primary**: Linux/macOS 환경에서 `/mccp:pr`을 실행하는 mccp 사용자. 잠재적 (PR helper crash + 재호출 시) + 가시화 trigger 2개:
  - v0.4.0 multi-session orchestrator 진입 시 동일 worktree에서 worker session lock 충돌 빈도 ↑
  - cross-platform ship credibility (Linux/macOS CI runner, 다른 사용자 환경)
- **Not for**: Windows 단독 사용자. PowerShell tool 우회가 기존 작동 중이며, 본 patch는 회귀 방지만 보장. PRD 작성 시점 사용자도 여기 해당하지만, audit verdict §6에서 cross-platform credibility를 위해 K를 v1.0.1 1순위로 합의

## Hypothesis

우리는 **`pr-phase-guard.js` PreToolUse hook이 lock body의 PID liveness 검증 + dead 시 적절한 reclaim path 제공 (자동 release OR in-hook 안내된 `detect-stale` 명령을 hook allowlist에 정확 추가, 둘 중 1택)** 이 **Linux/macOS 환경에서 dead-holder self-trap 시나리오를 해소** 할 것이라고 믿는다 for **Linux/macOS 환경의 mccp 사용자**.

다음 측정이 진리값: W4 4d reproduction (dead PID + subphase=codex-review)을 Linux/macOS 환경 (Docker / WSL / CI runner 중 1택, `/mccp:plan`이 결정)에서 재실행 시 (a) `/mccp:pr`이 [hook block + 우회 path 없음] 대신 [자동 reclaim → 정상 진행] OR [in-hook 안내된 1줄 명령으로 사용자 자력 해소] 둘 중 하나로 종결되고, (b) W11 rubric에서 4d row가 Type E/NS=5 dual trigger → Type ≤C/NS ≤2 회복하며, (c) Windows PowerShell 우회 path 회귀 0.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| W4 4d reproduction (Linux/macOS) | BLOCKING → PASS | dead PID + subphase=codex-review fixture에서 `/mccp:pr` 재호출 → 자동 reclaim OR hook-안내 1줄 해소 |
| W11 rubric for 4d row | Type E + NS=5 → Type ≤C + NS ≤2 | plan §UX Decision-Type Rubric 재측정 (Type 점수 D=4 또는 C=3 이하, Next-step 2 이하) |
| Windows regression | 0건 | 기존 PowerShell 우회 path 회귀 테스트 fixture PASS 유지 |
| F11 sealed-channel schema | 무손상 | §3.6 canonical schema invariant — guard hook reclaim path가 `ownership_token_hash` + stdin-pipe IPC 우회하지 않음 |

## Scope

**MVP** — `pr-phase-guard.js` PreToolUse hook이 lock body 읽고 PID liveness check (`process.kill(pid, 0)` 또는 동등 cross-platform 방식) 수행. dead PID 감지 시 reclaim path 1개 작동 (자동 release OR detect-stale allowlist 명시 추가 — `/mccp:plan` R1에서 두 옵션 trade-off 비교 후 결정). alive PID는 기존 block semantics 그대로 유지 (회귀 0). Linux/macOS 환경에서 4d fixture 재현 + recovery path 측정.

**Out of scope**

- axis L (`writeBlockReason()` INVALID/CRITICAL symmetry) — 별도 v1.0.x patch, axis K와 독립
- axis N (`docs/v0.2-*` rename housekeeping) — 별도 v1.0.x cycle
- W4 4a/4b/4c 의 다른 HIGH/MED 항목 (write read-first failure, schema_version round bump, marker idempotency) — axis L과 묶일 후보, axis K scope 외
- `pr-phase.lock` host-aware tri-state policy (§3.6 same-host+pid-alive=NEVER reclaim)를 guard hook에도 mirror — 본 patch는 PID liveness 단일 axis만, minimal surgical patch 유지. tri-state는 lock library 책임
- `subphase` semantics 자체 재설계 (예: codex-review 외 추가 subphase) — 동일 이유
- multi-session 동시성 일반 처리 — v0.4.0 orchestrator의 책임, K는 single-session dead-holder만 다룸
- Codex review re-enable — [[feedback-codex-permanent-bypass]] 합의 유지
- Windows behavior 적극 변경 — 회귀 방지만, PowerShell 우회 path 그대로 보존

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | guard hook PID liveness check + reclaim path | dead PID 감지 → reclaim path 1개 (자동 또는 안내) 작동, alive PID 회귀 0 | in-progress | `.claude/plans/v1-0-1-axis-k-pr-phase-guard-pid-alive.plan.md` |
| 2 | Linux/macOS reproduction + W11 rubric 재측정 | W4 4d row가 Type E/NS=5 → ≤C/≤2 회복, Windows PowerShell 회귀 0, F11 schema 무손상 | pending | — |

## Open Questions

- [ ] **자동 release vs 안내된 사용자 액션**: hook이 dead PID 감지 시 직접 release할지 vs detect-stale 호출을 hook allowlist에 정확히 추가해서 사용자가 1줄로 자력 해소할지 — 두 path가 receipt chain integrity / audit trail에 다르게 영향. `/mccp:plan` Phase 5 Codex R1에 두 옵션 trade-off 비교 명시 위임
- [ ] **F11 sealed-channel contract 정합성**: lock body는 `ownership_token_hash`만 보관, raw token은 writer process 메모리만. guard hook은 token 소유자가 아닌데 release 가능한가? "stale reclaim" path로 우회 가능한지, guard 전용 reclaim path가 schema에 첫 stamp 필요한지
- [ ] **receipt audit field**: hook이 자동 release 시 후속 PR step receipt에 `meta.pr_phase_lock_stale_reclaimed_at_hook=true` (또는 동등 field) stamp 필요 여부 — chain-of-custody 원칙과의 정합성
- [ ] **Linux/macOS 검증 환경 선택**: 현 사용자는 Windows 단독. GitHub Actions linux/macos runner, WSL, Docker 중 어느 것을 reproduction fixture로 채택할지 — `/mccp:plan`이 결정. CI runner 채택 시 PR pipeline에 박을지 dev fixture로만 둘지도 결정 사항
- [ ] **v0.4.0 multi-session orchestrator dependency**: axis K가 single-session dead-holder만 해소할지, multi-session race도 부분 흡수할지 — orchestrator PRD ([[project_v0_4_0_orchestrator]])와의 contract 선언. 후자 시 patch surface 확장, 전자 시 orchestrator가 별도 lock 정책 정의 필요

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| guard hook의 PID check가 race window 발생 (alive → dead 사이) | LOW | MED | reclaim 직전 한 번 더 check + atomic rename, 또는 사용자 안내 path 채택 시 race 자체 회피 (안내 명령이 detect-stale을 호출 → lock library의 atomic reclaim 사용) |
| F11 sealed-channel schema 무손상 invariant 위반 | MED | HIGH | `/mccp:plan` Phase 5에서 §3.6 schema diff 검증 필수, Codex R1에서 explicit 요청. receipt acceptance에 schema 변경 0 row 박기 |
| Windows PowerShell 우회 path 회귀 | LOW | HIGH | regression test fixture 추가 — 현재 작동하는 우회 path를 PASS로 박아 변경 감지 |
| Linux/macOS reproduction이 현 사용자 환경에서 검증 불가 → ship 전 실제 검증 누락 | MED | MED | CI runner (GitHub Actions linux + macos matrix) 또는 Docker fixture 둘 중 1택, PR pipeline에 박기 |
| 자동 release 선택 시 사용자가 "왜 lock이 사라졌지?" silent recovery 발생 | MED | LOW | receipt audit field + stderr 1줄 emit 둘 다 — "Loud fail-open principle" ([[feedback-loud-fail-open]]) 정합 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-06-15 (audit-derived from `.claude/audit/v1.0.0-release-verification-verdict.md` + `.claude/audit/v1.0.0-receipts.md`; user 옵션 2 (CONDITIONAL ship) 선택 후 axis K v1.0.1 demote의 직접 후속).*
