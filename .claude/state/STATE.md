---
state_version: 1
task_fingerprint: v0-3-6-codex-scope-state-noise
created_at: 2026-06-03T18:51:31.328Z
updated_at: 2026-06-10T09:26:25.381Z
last_event: sprint_kickoff
last_event_at: 2026-06-10T09:26:25.381Z
unsafe_checkpoint: false
confirm_required: false
session_end_imminent: false
chain_aborted: false
dep_check_at: 2026-06-07T15:54:42.147Z
dep_check_missing: impeccable
---
## Goal
mccp v0.3.6 sprint — pre-v1.0 housekeeping bundle. 3축: (1) Codex/impeccable reviewer scope separation — impeccable 사용 환경에서 Codex review가 web-design domain finding을 emit하지 않게 prompt-level exclusion + output-level filter. (2) STATE.md noise elimination — pre-compact.js write API에 content-hash skip 추가. timestamp만 다를 때는 disk write 없음 → git status clean 유지. (3) HIGH bug: derive-decision generic default for /mccp:pr — plan-path 인자 제공 시에도 generic 'default' slug fallback. plan/implement slug와 매칭하도록 수정 (--decision override 의존성 제거).

## Plan
- .claude/plans/v0-3-6-codex-scope-state-noise.plan.md (PENDING — /mccp:plan-prd → /mccp:plan)
- .claude/prds/v0-3-6-codex-scope-state-noise.prd.md (PENDING — /mccp:plan-prd output)
- .claude/plans/codex-findings-backlog.md (append-on-defer ledger, untouched)
- .claude/plans/mccp-roadmap.plan.md (thin-index — v0.3.6 entry 등록 필요)

## Done
- M0 A.1-A.4 + 2026-06-06 thin-index transform (roadmap 91KB → 15.3KB, 7 sub-plans CREATE)
- M1 (v0.2.5/0.2.6): impeccable wiring + housekeeping + INC-001
- M2.5 (v0.2.7): silent-hook UX code-complete + R1/R2 fixes
- v0.2.8 Task 2.6.5 + 2.6.1 base + 2.6.1-followup (F5/F8/F10/F11/F7) + finalize (PRs #6/#7/#8/#9)
- v0.2.9 (PR #10, commit 759db7c): gate round YAGNI — R1 default + DEFER_TO_BACKLOG sink
- v0.3.0 (PR #11, commit b83596b): S10b auto-handoff — cost-tier breakpoint + session spawn
- v0.3.1 (PR #12, commit 575becf): S11 /mccp:work single-entry orchestrator
- v0.3.2 (PR #13, commit 472b005): S12 cross-gate dual-reviewer escalate detection
- v0.3.3 (PR #14, commit cdd77fc): M6 stop-review-loop path 7 env-leak guard (dogfood subject)
- v0.3.4 (PR #15, commit 730396a): M7 test env hygiene — 17 codex-bridge.test.js leak sites + v0.3.3 housekeeping bundle
- v0.3.5 (PR #16, commit 816e8b6): M8 codex-invoke.js MCCP_CODEX_DISABLED first-class honor — wrapper short-circuit + 'disabled' classification + caller fanout + 3-way mutex + receipt auto-stamp

## In Progress
v0.3.6 sprint kickoff — 사용자 결정으로 v1.0 직행 대신 housekeeping cycle 채택. PRD 작성 단계 진입 예정 (/mccp:plan-prd). 3축 묶음 PRD vs 분리 PRD는 plan-prd 안에서 결정.

## Next Step
/mccp:plan-prd "v0.3.6: codex-impeccable scope split + STATE.md content-hash skip + derive-decision generic default fix" → /mccp:plan → /mccp:prp-implement → /mccp:prp-commit → /mccp:pr.

## Last Decision
2026-06-10 v1.0 직행 vs v0.3.6 sprint 양자택일에서 v0.3.6 sprint 채택. 이유: STATE.md noise는 매 세션 dirty tree를 만들어 v1.0 첫인상 위협. derive-decision HIGH 버그는 dual-reviewer chain의 핵심 invariant 위반. Codex/impeccable scope split은 v1.0 정체성("multi-model dual reviewer") 명확화에 필수. Idea 3(multi-session orchestrator)은 IPC 설계 부담으로 v1.1 별도 milestone 권장.

## Open Questions
- HIGH — derive-decision returns generic default for /mccp:pr mode even with plan-path arg; explicit --decision override required to match plan/implement slugs (v0.3.6 PRD scope)
- MEDIUM — STATE.md → CLAUDE.md docs drift lesson-learned: roadmap Risks 표에 milestone ship 직후 docs sync rule 추가 검토 (carry from v0.3.4)
- MEDIUM — fix-task.md option 2 description in /mccp:work spec ambiguous — auto-chain disable was claimed to skip Phase 7 only but actually halts entire chain (clarification candidate)
- LOW — wrapper bug debt: codex-invoke.js spawnSync stdout-empty (v0.2.6 housekeeping carry, partial natural recovery R4 noted)
- LOW — v0.2.4 security_force_override REJECT hardening backport (carry from v0.2.7)
- LOW — MEMORY.md Step 3 demotion script --apply trigger (user deferred)
- LOW — MCCP_SKIP_RECEIPT=1 session-env latch (settings.json env block lifecycle uninvestigated)
- LOW — v0.3.5 ship 이후 feedback-codex-runner-disabled-blind memory rule revision 검토 (auto-apply MCCP_PR_SKIP_CODEX_REVIEW이 redundant — pr.md Phase 0.3 stderr warn 흡수)
- DEFER (v1.1) — Multi-session orchestrator (Idea 3): work session as central command center + spawned child sessions execute tasks + cross-session askUserQuestion forwarding. IPC 설계 별도 PRD 필요.

## Last Updated
2026-06-10T09:26:25.381Z
