# Implementation Report: Multi-Agent Workflow Orchestration — M1 plan fan-out (MVP)

**Plan**: `.claude/plans/workflow-orchestration-m1-plan-fanout.plan.md`
**PRD**: `.claude/prds/workflow-orchestration.prd.md` (M1)
**Branch**: `research/workflow-orchestration-metasearch`
**Date**: 2026-07-05
**Version**: `1.20.2 → 1.20.4`

## Summary

`/mccp:plan`의 GROUND(Pattern Grounding)를 **read-only 다관점 병렬 fan-out**으로 강화했다. architect/security/test/explorer 4관점을 전용 read-only agent(`mccp:fanout-*`, tools: Read/Grep/Glob)로 `Workflow` primitive에 병렬 spawn → pure 스크립트가 synthesize → plan body에 `## Multi-Perspective Fan-out` 주입한다. write/edit/bash **도구 부재**로 파일 변형·receipt write가 구조적으로 불가하여 기존 Codex dual-review·receipt chain은 무손상이다.

## Assessment vs Reality

| Metric | Plan | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 15 (신규 12 + 수정 3+PRD) | 신규 12 + 수정 7 (footer 3 §3.7 확장 포함) |
| New tests | 3 oracle suites | 31 tests (perspectives 8 · budget 16 · synthesize 7) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | read-only fan-out agent 4개 | ✅ | Write/Edit/Bash 부재 grep 0건 (Codex F1 mechanical) |
| 1 | perspectives.js oracle | ✅ | 카탈로그 + PERSPECTIVE_SCHEMA + buildPerspectivePrompt |
| 2 | budget.js oracle | ✅ | resolveFanout + shouldSkipForBudget (cost-guard mirror, cost-state 없으면 skip=F2) |
| 3 | synthesize.js oracle | ✅ | severity-rank + 부분/전부-null fallback sentinel |
| 4 | Workflow 스크립트 | ✅ | self-contained(require 부재), meta 순수 리터럴, budget 가드 |
| 5 | plan.md Phase 2.5 wiring | ✅ | resolveFanout gate → Workflow → 주입/fallback |
| 6 | 버전·문서·PRD | ✅ | plugin.json 1.20.4 + CLAUDE.md §1.4/§4 + CHANGELOG + footer sync |
| 7 | dogfood e2e (live) | ⏸ **deferred** | 아래 "Deferred" 참조 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (syntax) | ✅ | oracle 3종 `node -c` + Workflow AsyncFunction compile-check |
| Unit tests | ✅ | plan-fanout 31/31 green |
| Regression (affected) | ✅ | renderer 665/665 (footer v1.20.4 sync 포함) |
| Regression (broad) | ✅ (내 변경) | 204 파일 2452 tests; 내 변경으로 인한 실패 0 |
| plan-conflict guard | ✅ | `conflict:false` (minor-deviation 경로) |
| dual-review chain | ✅ | plan-codex + implement-codex receipt `validate ok:true` |

### 라이브로 실증된 cost 방어

- `MCCP_PLAN_FANOUT` 미설정 → `env-off` (default off, 인라인 fallback 보존).
- 이 세션의 **critical cost-tier**에서 `resolveFanout(mode=on, prdMode=true, 실제 cost-state)` → `tier-critical` skip. cost-tier autoDisable가 실제 cost-state로 발화함을 라이브 확인.

### 기존(pre-existing) 실패 — 내 변경 무관

broad 회귀에서 5건 실패했으나 전부 내 변경 밖:
- `perf-budget` — 병렬 부하 환경성(격리 실행 시 1/1 PASS).
- `g1-patch` ×3 (receipt hooks) — 격리에서도 실패하나 hooks/derive/receipt 트리 **미변경**(git status 확인).
- `validate-callsite-lint` — `commands/pr.md:165`(미변경 파일)의 `validate --command` 콜사이트가 `--plan` 누락. 기존 부채.

> 이 3 파일군 실패는 이 M1 scope 밖(별도 fix 필요). 정직하게 기록.

## Deviations from Plan

1. **Workflow 스크립트 self-contained (require 부재)** — 플랜 Task 4는 "oracle require"를 가정했으나 Workflow 실행 샌드박스가 "No filesystem or Node.js API access"라 `require` 불가. WHAT: workflow 스크립트가 catalog/prompt/schema/synthesize를 tested oracle의 **faithful 포트**로 인라인, `{markdown, coverage, spent, skipped}` 반환. WHY: 런타임 계약. 아키텍처(얇은 Workflow, read-only agent, budget 가드, 결정론 synthesize, dual-review 무손상) 전부 보존. oracle 3종은 tested reference로 유지되며 `budget.resolveFanout`은 caller-side(plan.md 2.5.1)에서 실사용.
2. **footer sync 확장 (§3.7 mandate)** — 플랜 Files to Change에 없던 `renderer/{html,markdown}.js` + `i18n-surface.test.js` 수정. WHY: §3.7이 plugin.json bump 시 user-visible footer version 동기화를 의무화(v1.20.2 → v1.20.4, surface drift 0). 아키텍처 변경 아닌 버전 위생.

## Files Changed

**신규(12)**: `agents/fanout-{architect,security,test,explorer}.md`, `scripts/lib/plan-fanout/{perspectives,budget,synthesize}.js` + `tests/*`, `scripts/workflows/plan-fanout.js`.
**수정(7)**: `commands/plan.md`(Phase 2.5), `.claude-plugin/plugin.json`(1.20.4), `renderer/{html,markdown}.js`+`tests/i18n-surface.test.js`(footer), `CLAUDE.md`, `CHANGELOG.md`. PRD milestone은 `/mccp:plan`이 이미 in-progress로 기록.

## Deferred — Task 7 (live dogfood)

실제 Workflow 4-agent spawn 관찰은 **이번 세션에서 불가**:
1. **cost-critical** — resolveFanout이 이 세션에서 이미 skip(tier-critical). green tier 세션 필요.
2. **agent 미설치** — `mccp:fanout-*` agent는 이 worktree 신규 파일. 설치 캐시(1.20.0)에 없어 Workflow `agentType` 미해결. merge + `claude plugin update` 후 resolvable.
3. **opt-in** — 멀티-agent Workflow는 사용자 명시 opt-in 필요.

green tier + 플러그인 설치 후 `MCCP_PLAN_FANOUT=on /mccp:plan <PRD>`로 4관점 주입 + parent worktree clean(read-only 실증) 관찰이 Task 7 잔여.

## Next Steps

- [ ] **버전 충돌 확인** — audit-remediation이 이미 1.20.4 사용(commit/PR 대기). merge 순서에 따라 이 branch를 1.20.4로 forward-reconcile 필요할 수 있음(§3.7).
- [ ] `/mccp:code-review` 또는 `/mccp:prp-commit` → `/mccp:pr`
- [ ] green tier 세션에서 Task 7 live dogfood
