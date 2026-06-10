# Roadmap: mccp v0.2.5+ (Milestone Index)

**Source PRD**: 통합 — 사용자 메시지(2026-06-04, `/mccp:plan` 호출) + 기존 산출물 합본
**Current plugin version**: 0.3.0 ([plugin.json](../../plugins/mccp/.claude-plugin/plugin.json))
**Branch convention**: 마일스톤마다 별도 feature branch. main 직접 push 금지.
**Index version**: 2 (2026-06-06 thin-index transform — 91KB → ~14KB. milestone body는 sub-plan으로 위임.)

> **본 plan은 진입점 index입니다.** 각 마일스톤의 상세 task/decision/validation은 `.claude/plans/v0-X-Y-*.plan.md` sub-plan에 위임됨. roadmap 자체는 단일 진입점 + status board + cross-milestone audit trail(INC-001, Codex Review)을 유지.

---

## Summary

mccp v0.2.4 (security-reviewer Skill→Task canonical contract) main merge 이후 cycle. 다음 active forward milestone은 **v0.2.8 PR workflow hardening** (Milestone 2.6 — Codex fix-loop 차단 + markdown lint 노이즈 delegation). 이후 housekeeping → S10b auto-handoff (v0.3.0) → S11 단일 entry (v0.3.1) → S12 escalate (v0.3.2)로 순차 진행.

각 마일스톤은 `plugin.json` version bump + main merge + 단일 PR을 단위로 함. 매 마일스톤 PR 본문에 `## Codex Adversarial Review` + (디자인 surface 변경 시) `## Design Review` 자동 inject.

---

## Status Snapshot (2026-06-08 기준)

### Ship History

| Version | Date | Scope | Sub-plan |
|---|---|---|---|
| v0.1 | 2026-06-02 | ECC fork + Phase 게이트 + receipt 인프라 + 49 agents + 47 skills | (archive) |
| v0.2.1-v0.2.4 | 2026-06-04 | Q5 patch / Codex fail-closed wrapper / `/mccp:setup` / security-reviewer Skill→Task | (archive) |
| **v0.2.5/0.2.6** | 2026-06-04~05 | Impeccable design-review wiring (M1) + Housekeeping + INC-001 R1/R4 (M2) | [v0-2-5](v0-2-5-impeccable-wiring.plan.md) + [v0-2-6](v0-2-6-housekeeping.plan.md) |
| **v0.2.7** | 2026-06-07 | Silent Hook UX observability surface (M2.5) — landed via Codex R1/R2 fix commits (PR-Codex, e84df19→48964a5 on main) | [v0-2-7](v0-2-7-silent-hook-ux.plan.md) |
| **v0.2.8** | 2026-06-07/08 | PR Workflow Hardening + markdownlint delegation + F9/F6 finalize (M2.6 — PRs #6/#7/#8 + finalize) | [v0-2-8](v0-2-8-pr-workflow-hardening.plan.md) |
| **v0.2.9** | 2026-06-08 | Gate Round Budget + YAGNI Triage (R1 default cap=1 + DEFER_TO_BACKLOG sink, M2.7 — PR #10) | [v0-2-9](v0-2-9-gate-round-yagni.plan.md) |
| **v0.3.0** | 2026-06-08 | S10b Auto-Handoff cost-tier breakpoint + session spawn (M3 — PR #11) | [v0-3-0](../PRPs/plans/completed/v0-3-0-auto-handoff.plan.md) |
| **v0.3.1** | 2026-06-08 | S11 `/mccp:work` single-entry orchestrator (M4 — PR #12) | [v0-3-1](v0-3-1-mccp-work.plan.md) |
| **v0.3.2** | 2026-06-08 | S12 cross-gate dual-reviewer escalate detection (M5 — PR #13) | [v0-3-2](../PRPs/plans/completed/v0-3-2-escalate.plan.md) |
| **v0.3.4** | 2026-06-10 | M7 test env hygiene (17 leak sites in codex-bridge.test.js) + v0.3.3 housekeeping bundle | [v0-3-4](v0-3-4-test-env-hygiene.plan.md) |

### Active / Pending Milestones

| # | Version | Scope | Sub-plan | Status |
|---|---|---|---|---|
| **Milestone 0** | (메타) | Roadmap consolidation + archive (본 plan + sub-plan split) | (본 plan 자체) | 🚧 진행 중 (2026-06-06 thin-index transform) |
| **Milestone 2.6** | v0.2.8 | PR Workflow Hardening (Codex fix-loop 차단 + markdown lint 노이즈) | [v0-2-8](v0-2-8-pr-workflow-hardening.plan.md) | ✅ shipped (PRs #6/#7/#8 + finalize cycle 2026-06-07/08) |
| **Milestone 2.7** | v0.2.9 | Gate Round Budget + YAGNI Triage (default cap=1 + DEFER_TO_BACKLOG file) | [v0-2-9](v0-2-9-gate-round-yagni.plan.md) | ✅ shipped (PR #10, commit 759db7c, 2026-06-08) |
| **Milestone 3** | v0.3.0 | S10b Auto-Handoff ($100 hard ceiling) | [v0-3-0](../PRPs/plans/completed/v0-3-0-auto-handoff.plan.md) | ✅ shipped (PR #11, commit b83596b, 2026-06-08) |
| **Milestone 4** | v0.3.1 | S11 `/mccp:work` single entry orchestration | [v0-3-1](v0-3-1-mccp-work.plan.md) | ✅ shipped (PR #12, commit 575becf, 2026-06-08) |
| **Milestone 5** | v0.3.2 | S12 dual-reviewer escalate (자동 안내, invoke X) | [v0-3-2](../PRPs/plans/completed/v0-3-2-escalate.plan.md) | ✅ shipped (PR #13, commit 472b005, 2026-06-08) |
| **Milestone 6** | v0.3.3 | Intent-driven E2E dogfood — `/mccp:work` 단일 entry full-chain validation + PR #11 L2 fix + docs drift sync | [v0-3-3](v0-3-3-intent-dogfood.plan.md) | ✅ shipped (PR #14, commit cdd77fc, 2026-06-09) |
| **Milestone 7** | v0.3.4 | Test env hygiene audit (17 leak sites in codex-bridge.test.js) + v0.3.3 housekeeping bundle (plugin.json 0.3.4, CLAUDE.md §1.4 S11/S12 drift, STATE.md fingerprint) | [v0-3-4](v0-3-4-test-env-hygiene.plan.md) | 🚧 in-progress (2026-06-10) |

### Out of scope — do not reference

- `~/.claude/hooks/impeccable-flag.ps1`
- `~/.claude/hooks/impeccable-guard.ps1`

이전 ECC 잔재 hook. v0.2.5 impeccable wiring은 새로 설계됨 — plugin manifest hook + command 본문 inline only. 잔재 cleanup은 README에 안내만 추가하고 코드는 무시.

---

## Milestone 0 — Roadmap Consolidation + Archive

**Goal**: 본 roadmap을 단일 진입점으로 확립 + 기존 산출물 archive + per-milestone sub-plan split.

### Completed (2026-06-04 ~ 2026-06-06)

- ✅ A.1: archive 디렉토리 생성 (`.claude/plans/archive/`, `.claude/notes/archive/`, `.claude/PRPs/plans/completed/`)
- ✅ A.2: 기존 plan/note `git mv` archive (4 plan + 1 PRP plan + 1 note)
- ✅ A.3 Step 1-2: MEMORY.md backup + roadmap pointer prepend + Step 4 validation 4/4 PASS
- ✅ A.4: STATE.md fingerprint `roadmap-active` 갱신 (2026-06-04 — 이후 2026-06-06 thin-index transform에서 `roadmap-index`로 진화. 현재 canonical 값은 Acceptance 항목 참조)
- ✅ 2026-06-06 thin-index transform: roadmap 91KB → ~14KB, milestone body를 7개 sub-plan으로 분리 ([v0-2-5](v0-2-5-impeccable-wiring.plan.md), [v0-2-6](v0-2-6-housekeeping.plan.md), [v0-2-7](v0-2-7-silent-hook-ux.plan.md), [v0-2-8](v0-2-8-pr-workflow-hardening.plan.md), [v0-3-0](../PRPs/plans/completed/v0-3-0-auto-handoff.plan.md), [v0-3-1](v0-3-1-mccp-work.plan.md), [v0-3-2](../PRPs/plans/completed/v0-3-2-escalate.plan.md))

### Deferred

- ⏳ A.3 Step 3: MEMORY.md demotion via separate migration script (`.claude/scripts/migrations/memory-archive-2026-06-04.js` — 이미 CREATED in M1, `--apply` 실행은 user trigger 대기)

### Acceptance

- [x] `.claude/plans/` archive 분리 (`mccp-roadmap.plan.md` + 7 sub-plans + archive/)
- [x] `.claude/notes/`에 active note 0건
- [x] MEMORY.md 1번 줄 = `mccp-roadmap` 진입점
- [x] STATE.md fingerprint=`roadmap-index` (2026-06-06 thin-index transform 이후 canonical 값. 본 checklist ↔ `.claude/state/STATE.md` frontmatter ↔ Done 섹션 lineage가 동일 fingerprint를 가리켜야 함 — Codex PR-Codex R1 F-2 absorption)
- [x] 본 plan thin-index transform 완료 (<16KB)
- [ ] thin-index transform receipt 재발행 (PLAN-CODEX gate via `/mccp:plan`)
- [ ] STATE↔roadmap fingerprint 일치 검증 (mechanical): `grep '^task_fingerprint:' .claude/state/STATE.md` 출력값이 본 checklist의 `STATE.md fingerprint=…` 항목과 정확히 일치해야 함. 불일치 시 thin-index migration 미완으로 판정 (Codex PR-Codex R1 F-2 mechanical guard)

---

## Patterns to Mirror (cross-milestone canonical)

각 sub-plan은 자체 Patterns 표를 보유. 본 표는 cross-milestone에서 반복 참조되는 canonical pattern.

| Category | Source | Note |
|---|---|---|
| Audited escape env (`MCCP_FORCE_PR_WITHOUT_*` / `MCCP_PR_SKIP_*`) | [pr.md](../../plugins/mccp/commands/pr.md) Phase 0 + [force-override-reason.js](../../plugins/mccp/scripts/receipt/lib/force-override-reason.js) | reason validator strict REJECT (v0.2.5+) + PR body audit section auto-inject |
| Receipt schema bump | [schema.js](../../plugins/mccp/scripts/receipt/schema.js) + [migrations/](../../plugins/mccp/scripts/migrations/) | BREAKING bump = forward-migration script 동반 (INC-001 R2 lesson) |
| Cross-gate dedupe | [code-review.md:151-162](../../plugins/mccp/commands/code-review.md#L151-L162) | 같은 decision-slug + 둘 다 approve → 재호출 skip |
| Phase sub-step naming | [plan.md Phase 5](../../plugins/mccp/commands/plan.md) | `Phase N.M — title (자동, MANDATORY)` 형식 |
| Atomic state write | [state-writer.js](../../plugins/mccp/scripts/state/state-writer.js) | lock + CRLF normalize + schema version guard |
| Hook fail-open + observability | v0.2.7 G1 invariant + L1 shard ledger + L2 systemMessage | event-shape-specific output |
| CLI PATH probe | [dep-check.js:53-59](../../plugins/mccp/scripts/lib/dep-check.js#L53-L59) | Windows shim + WSL fallback |
| YAGNI triage + backlog file (v0.2.9+) | [docs/gate-design.md](../../docs/gate-design.md) §Divergent + [codex-findings-backlog.md](codex-findings-backlog.md) | R1 결과 ACCEPT_NOW/DEFER_TO_BACKLOG/REJECT_YAGNI 3분류, `MCCP_GATE_ROUND_CAP=1\|2\|3` default 1 |

---

## Validation (전체 roadmap)

각 마일스톤 PR 머지 전 다음 모두 통과:

```bash
# Baseline + new tests (Node native runner)
node --test plugins/mccp/scripts/**/tests/*.test.js

# Receipt chain validate
node plugins/mccp/scripts/receipt/cli.js status --json

# Cross-milestone grep guards
grep -c "Skill(impeccable" plugins/mccp/commands/*.md         # ≥ 7 (v0.2.5+)
grep -rn "Skill(security-reviewer" plugins/mccp/commands/     # 0 (v0.2.4 no regression)
grep -rn "impeccable-flag\|impeccable-guard" plugins/mccp/   # 0 (ECC 잔재 무참조)

# Plugin manifest
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
```

각 sub-plan은 milestone-specific validation 명령을 자체 보유.

---

## Risks (전체 roadmap)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ECC 잔재 hook이 새 hook과 동시 발화 | Medium | Medium | README cleanup checklist; user-level 잔재는 mccp가 강제 삭제 못 함 |
| `MEMORY.md` 갱신 도중 active 항목 손실 | Low | Medium | Step 3 demotion은 별도 commit; `feedback-cost-not-stop-signal` 보존 명시 |
| 본 plan 비대화 → 가독성 저하 | (해소됨 2026-06-06) | — | thin-index transform 완료. 본문은 status board + audit trail로 한정. milestone body는 sub-plan에 위임. |
| v0.2.5 schema bump처럼 BREAKING change에 migration 누락 (INC-001 R2 pattern) | Medium | High | 매 schema bump마다 `plugins/mccp/scripts/migrations/` script 동반 (acceptance criterion) |
| Receipts gitignored — chain integrity가 worktree-local | High (constant) | Medium | sub-plan + INC-001에 명시. cumulative migration runbook (CLAUDE.md §4) 운영 |
| sub-plan vs roadmap drift (forward milestone이 변경되면 두 곳 갱신 필요) | Medium | Medium | sub-plan이 source of truth. roadmap entry는 1-line + path link만 유지 |

---

## Acceptance (roadmap 전체)

- [x] Milestone 0: archive 완료 + thin-index transform + per-milestone sub-plan split
- [x] Milestone 1 (v0.2.5): impeccable wiring shipped — [v0-2-5 sub-plan](v0-2-5-impeccable-wiring.plan.md)
- [x] Milestone 2 (v0.2.6): housekeeping + INC-001 R1/R4 shipped — [v0-2-6 sub-plan](v0-2-6-housekeeping.plan.md)
- [x] Milestone 2.5 (v0.2.7): silent-hook UX shipped via Codex R1/R2 fix commits on main (e84df19→48964a5, 2026-06-07) — [v0-2-7 sub-plan](v0-2-7-silent-hook-ux.plan.md)
- [x] Milestone 2.6 (v0.2.8): PR workflow hardening shipped via PRs #6/#7/#8 + finalize cycle (Task 2.6.2 markdownlint + 2.6.3 docs + F9 mutex preflight + F6 lock-pattern doc), 2026-06-07/08 — [v0-2-8 sub-plan](v0-2-8-pr-workflow-hardening.plan.md)
- [x] Milestone 2.7 (v0.2.9): gate round YAGNI triage shipped via PR #10 (commit 759db7c, 2026-06-08) — [v0-2-9 sub-plan](v0-2-9-gate-round-yagni.plan.md)
- [x] Milestone 3 (v0.3.0): S10b auto-handoff shipped via PR #11 (commit b83596b, 2026-06-08) — [v0-3-0 sub-plan](../PRPs/plans/completed/v0-3-0-auto-handoff.plan.md)
- [x] Milestone 4 (v0.3.1): `/mccp:work` shipped via PR #12 (commit 575becf, 2026-06-08) — [v0-3-1 sub-plan](v0-3-1-mccp-work.plan.md)
- [x] Milestone 5 (v0.3.2): S12 escalate shipped via PR #13 (commit 472b005, 2026-06-08) — [v0-3-2 sub-plan](../PRPs/plans/completed/v0-3-2-escalate.plan.md)
- [x] Milestone 6 (v0.3.3): intent-driven E2E dogfood + docs sync + PR #11 L2 fix shipped via PR #14 (commit cdd77fc, 2026-06-09) — [v0-3-3 sub-plan](v0-3-3-intent-dogfood.plan.md)
- [ ] Milestone 7 (v0.3.4): test env hygiene audit (17 leak sites) + v0.3.3 housekeeping bundle — [v0-3-4 sub-plan](v0-3-4-test-env-hygiene.plan.md)
- [ ] 매 마일스톤마다 `plugin.json` bump + main merge + PR 본문에 `## Codex Adversarial Review` (+`## Design Review` if applicable)
- [ ] 매 마일스톤 shipping 후 본 roadmap의 Status Snapshot 갱신 (sub-plan의 status field가 source of truth)

---

## Codex Adversarial Review (R1 + R2 — converged, 본 roadmap thin-index 변환 전)

본 섹션은 thin-index transform 이전 시점의 PLAN-CODEX gate 결과 보존. R3 quota-deferred status는 유효 — Codex quota 회복 후 사용자가 R3 verification trigger 가능.

- **호출**: `node "C:/Users/skypark207/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" adversarial-review --wait --json ...` (companion 직접 호출 — mccp wrapper의 spawnSync stdout 캡처 이슈 우회. wrapper fix는 v0.2.6 housekeeping에 잔존 debt)
- **라운드 수**: R1 + R2 완료, R3 quota-deferred (Codex usage limit)
- **합치 결론 (R1)**: verdict `needs-attention`, summary "the roadmap leaves the v0.2.5 design gate with conflicting state models, unreliable detection, and an under-audited override path". 5 HIGH findings 모두 ACCEPT, plan 본문에 흡수 완료.

### R1+R2 Absorptions (6 HIGH, 모두 ACCEPT)

F1-F4 (impeccable wiring 관련, design_* namespace 폐기 + skill-vs-CLI primary dimension + mode-aware detection + force-override reason REJECT) + R2-F1(absorption 완전성) → [v0-2-5 sub-plan](v0-2-5-impeccable-wiring.plan.md) §Codex R1 Absorptions. F5 (MEMORY.md 4-step safe migration: backup + append-only + 별도 demotion script + validation matrix) → 본 roadmap §Milestone 0 + M1 `memory-archive-2026-06-04.js`.

### Open Questions (post-R2)

- **MEDIUM (R3 deferred)**: Codex quota 리셋 후 R3 verification trigger 가능. R3가 새 finding 반환 시 plan 추가 amend + receipt revise 필요.
- **MEDIUM (wrapper bug)**: codex-invoke.js spawnSync stdout-empty 이슈. companion 직접 호출은 정상 — v0.2.6 housekeeping debt (미해결 — v0.2.7/8로 carry).
- **MEDIUM (security backport)**: F4 absorption 후 security_force_override는 warning, impeccable_force_override는 REJECT로 강도 다름. 호환성 risk — 별도 cycle.
- **LOW (Milestone 0 split)**: F5 migration script는 M1 ship에서 CREATE 완료, `--apply` 실행은 user trigger 대기.

### Codex Implementation Review (M1)

decision-set already converged in mccp-plan-codex review (R1 + R2, F1-F5 absorbed). No new implement-time decisions. Architectural choices pre-committed. Micro-decisions remaining are implementation details. **Cross-gate dedupe applied (Phase 2.5.1).**

### Security Reviewer (M1) — 5 findings (0 HIGH/CRITICAL)

Verdict **NEEDS-ATTENTION** → gate proceeds with implement-time absorption. F-Sec-1~5 (reason validator helper 분리, path traversal 차단, telemetry isolation, schema bypass 차단, markdown injection 방어) 모두 v0.2.5 ship. 상세는 [v0-2-5 sub-plan](v0-2-5-impeccable-wiring.plan.md) §Security Reviewer 참조. v0.2.4 security backport debt 잔존.

### Codex session 참조

- `019e9193-65fe-7871-ae60-95b8ddec2956` (R1, direct companion)
- `019e91a2-2783-7382-bdfa-203adc739823` (R3 quota-deferred)
- `019e9184-19ce-7ed1-bba4-58510a78dd74` (preliminary working-tree review)

---

## Operational Incidents Log

> Roadmap 진행 중 발견된 운영 incident와 그 대응. milestone scope에 들어가지 않더라도 **schema/wiring 가설**이 명시적으로 흔들린 시점이므로 plan에 누적 기록. 후속 milestone이 incident pattern을 흡수해야 함.

### INC-001 (2026-06-05) — `/mccp:prp-implement` silent block

**증상**: v0.2.6 schema 확장 후 forward-migration 누락 → `/mccp:prp-implement` 실행 시 error/stderr surface 0건으로 즉시 종료.

**근본 원인**:
1. v0.2.6 Milestone 1 Task 1.2 — [schema.js:178-189](../../plugins/mccp/scripts/receipt/schema.js#L178-L189)가 receipt `meta`에 4 impeccable_* 필드를 **required**로 추가.
2. v0.2.4 schema로 발행된 11개 기존 receipt들이 4 필드 부재 → `validateSchema()` blocking 분류.
3. `MCCP_RECEIPT_GATE_MODE=soft`는 `missing`만 통과 — `blocking/stale/critical`은 차단 (의도된 의미).
4. `UserPromptExpansion` hook block payload가 클라이언트 UI에서 silent → 사용자에게는 "사라진" 것처럼 보임.

**v0.2.7 design intent와의 정합**: v0.2.7 silent-hook UX milestone은 **fail-open 침묵**, 본 incident는 **fail-closed silent block** — 정반대 축. 같은 UX 문제 → v0.2.7 scope에 _block-path observability_ 추가가 합당.

**Residual debt 흡수 상태**:

| ID | Severity | 항목 | 흡수 milestone | Status |
|---|---|---|---|---|
| INC-001-R1 | MEDIUM | 11 receipts batch-migrate (cumulative chain) | v0.2.6 housekeeping | ✅ **resolved** (M2 ship — local working-tree 적용, repo entry는 R4 scripts) |
| INC-001-R2 | HIGH | Schema migration runbook 부재 | v0.2.7 silent-hook UX (또는 v0.2.6) | ⚠ **partial** (migrations 디렉토리 + 2 cumulative scripts ship. validate-cmd hint listing 잔존) |
| INC-001-R3 | MEDIUM | Block-path observability 부재 (`UserPromptExpansion` block payload silent) | v0.2.7 silent-hook UX | ⏳ **deferred** (v0.2.7 scope) |
| INC-001-R4 | LOW | migration 스크립트 위치 (`.claude/state/`) → `plugins/mccp/scripts/migrations/` 이전 + idempotent | v0.2.6 housekeeping | ✅ **resolved** (M2 ship) |

**Why log here, not in `.claude/notes/`**: roadmap이 단일 진입점이라 명시했으므로 ([CLAUDE.md §5](../../CLAUDE.md), [MEMORY.md:1](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/MEMORY.md)) operational incident도 본 plan에 누적. `.claude/notes/`는 archive only.

**Residual finding (M2 absorption)**: persistent FAIL chains for `default mccp:pr` + `v0-2-4-phase-7-2-5-restore mccp:prp-implement` after migration are *semantic* gate decisions (`codex_skipped=true` preserved from session-of-record), NOT schema bugs. fail-closed working as designed.

### Receipt namespace audit (2026-06-06)

요약: (1) `mccp-plan-codex/mccp-roadmap.json` schema v0.2.6 migrated이지만 plan_hash drift — 2026-06-06 thin-index transform 후 새 PLAN-CODEX receipt가 canonical hash 기록. (2) **`mccp-implement-codex/{default,main}.legacy.json`은 이미 `.legacy.json` 접미사로 격리 완료** (작업 ship 됨 — `git ls .claude/receipts/mccp-implement-codex/` 확인). (3) **`mccp-plan-codex/{default,main}.json`은 active schema 명으로 잔존 — 현재 false-green 노출 surface는 이쪽**. terminal branch-based 명령(`/mccp:pr`)이 `main` branch에서 decision_id를 branch로 derive하면 unrelated v0.1 plan receipt가 chain을 false-green으로 충족시킬 수 있음 (Codex R1 F1 / R2 F1 absorption — implement-codex가 아니라 plan-codex가 잔여 노출). 권고: `/mccp:pr` on `main` (또는 generic-slug 호출) 직전에 `mccp-plan-codex/{default,main}.json` 두 파일을 `.legacy.json`으로 rename 또는 quarantine 디렉토리로 이동 필수. 자동화는 v0.2.8 (Milestone 2.6) Task 2.6.5 validate-cmd generic-decision reject로 mechanical 해결 — 두 namespace 모두 cover (`mccp-plan-codex/{default,main}.json` + `mccp-implement-codex/{default,main}.json` 잠재 재생성 모두). (4) `mccp-implement-codex/mccp-roadmap.json` 부재. 자세한 사실관계 + 복구 옵션 + canonical hash lineage는 [receipt-audit-2026-06-06.md](../PRPs/reports/receipt-audit-2026-06-06.md) Recommendation 3-4 참조 (receipt 자체가 canonical hash source — plan 본문은 hash 값 미포함).

---

## Pre-thinning history

본 plan은 2026-06-06 thin-index transform 이전 ~91KB monolith. milestone body는 sub-plan으로 *이동*되었지 *재검토*되지 않음 — R1/R2 absorption 모두 보존. 추적은 `git log -p .claude/plans/mccp-roadmap.plan.md`.

---

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill 미등록 — plan-codex는 lenient gate이므로 `meta.impeccable_skipped=true` warning으로 처리. thin-index transform 자체는 markdown structural reorg로 UI/디자인 surface 없음 — design_signal=false도 일치.)

## Codex Adversarial Review (thin-index transform — Phase 5)

- **호출**: `node "C:/Users/skypark207/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" adversarial-review --wait --json` (companion 직접 호출 — wrapper의 spawnSync stdout-empty 이슈 우회, 본 roadmap의 §Open Questions wrapper bug debt와 동일 패턴)
- **라운드 수**: R1 → R2 → R3 (Phase 5.4 cap-at-3 도달)
- **합치 결론**: substantive convergence (severity descending: HIGH+MEDIUM → HIGH → MEDIUM, finding count descending: 2 → 1 → 1). 모든 findings 흡수 적용 + R4 verification은 cap에 의해 차단.

### R1 (verdict `needs-attention`, 2 findings, both ACCEPT)

- **F1 HIGH (0.92)** — Legacy `mccp-implement-codex/{default,main}.json` namespace 점거. terminal branch-based 명령(`/mccp:pr` on `main`)이 decision_id를 branch에서 derive → v0.1 era `mccp-implement-codex/main.json` (plan_hash 무관)을 chain validate에서 oring → false-green path. **흡수**: F-RA-1을 `informational` → `HIGH/blocking-for-PR` reclassify (receipt-audit-2026-06-06.md). working-tree quarantine runbook 추가 + v0.2.8 Task 2.6.5 mechanical fix (validate-cmd generic decision_id hardening) 추가.
- **F2 MEDIUM (0.9)** — Receipt audit에서 hash 불일치 (`2d21fde4…` vs `b31a5204…`) + `validate --command mccp:prp-implement`이 plan_hash 검사 없이 exit 0 (false-green). **흡수**: roadmap 본문에서 specific hash 값 제거 (recursive paradox 회피), receipt를 single canonical hash source로 declare. Plan Hash Lineage 표를 event-based (no hash values cited)로 재작성. Validation Commands에 `--decision mccp-roadmap --plan <path>` hash-aware form 추가.

### R2 (verdict `needs-attention`, 1 finding, ACCEPT)

- **R2-F1 HIGH (0.9)** — v0.2.8 sub-plan에 Task 2.6.5 documented되었지만 `Files to Change` + `Acceptance` sections에 mechanical fix 항목 누락. implementer가 checklist 모두 통과해도 false-green path 잔존. **흡수**: v0.2.8 `Files to Change`에 `validate-cmd.js` + 3 test files + CLAUDE.md §4 quarantine runbook 추가. `Acceptance`에 4개 BLOCKING items 추가 + 명시적 invariant (skip 시 ship 차단 + self-dogfood failure 경고).

### R3 (verdict `needs-attention`, 1 finding, ACCEPT — cap reached, no R4 verification)

- **R3-F1 MEDIUM (0.78)** — Task 2.6.5의 test matrix가 `default` no-`--plan` 케이스 미커버. branch lookup fail 시 `default` fallback path 잔존. **흡수**: `validate-cmd-generic-no-plan-reject.test.js` 신규 (BLOCKING acceptance). Phase 5.4 cap-at-3 정책에 의해 R4 재검증은 수행하지 않음 — absorption은 plan body에 commit, audit trail은 본 섹션이 보존.

### Open Questions

- **MEDIUM (R3 unverified)** — R3 absorption (validate-cmd-generic-no-plan-reject.test.js)이 Phase 5.4 cap에 의해 Codex 재검증 없이 plan에 commit. v0.2.8 cycle 진입 시 santa-loop 또는 별도 plan-codex round로 재검증 권고. 단, finding 자체가 MEDIUM (severity 명확, mechanical guarantee 단순)이므로 ship-blocking은 아님.
- **MEDIUM (wrapper bug carry-over)** — 본 R1/R2/R3 모두 companion 직접 호출로 우회. mccp wrapper의 spawnSync stdout-empty 이슈는 여전히 v0.2.6 housekeeping debt 상태로 잔존.

### Codex session 참조

- R1: threadId `019e98dd-b3bb-7bb2-a68e-69fe535aacb5`
- R2: threadId `019e98e4-e820-7133-98e9-0e08562620b7`
- R3: threadId `019e98e7-d060-7d33-b12c-dcf1038f21a7`

raw outputs preserved at `.git/mccp/tmp/codex-r{1,2,3}-thinindex.json`.

## Codex Adversarial Review (Re-issue R4 — post-thin-index drift, 2026-06-07)

- **호출**: `node "C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.7/scripts/lib/codex-invoke.js" adversarial-review --focus "post-thin-index drift re-verification" --timeout-ms 120000 --json` (mccp wrapper 직접 사용 — prior R1/R2/R3는 companion 직접 호출이었으나 본 라운드에서 wrapper가 정상 응답함을 확인. v0.2.6 wrapper bug debt의 부분적 자연 회복 가능성.)
- **이유**: plan_hash drift(`50a8f866…` → `58cf9131…`) + base_commit advance(`48964a5` → `8cc9ac5`)로 인한 receipt re-stamp 요구. plan body의 substantive 변경은 `4ab8988`(thin-index transform commit 자체)뿐이며 prior R1/R2/R3가 이미 흡수.
- **라운드 수**: R4 (verification-only, 1 라운드)
- **합치 결론**: `verdict=approve`, 0 findings, 0 next_steps. Codex가 working-tree diff(STATE.md timestamp refresh + dep_check_at)를 review하고 ship 승인. committed thin-index transform은 prior 라운드에서 substantively 처리되었으므로 별도 검증 surface 없음. classification `ok`, blocking=false.
- **수용한 제안**: 없음 (findings=[])
- **거부한 제안**: 없음 (findings=[])
- **Open Questions**: 없음. prior 섹션의 MEDIUM 항목(R3 unverified, wrapper bug carry-over)은 본 라운드에서도 status quo 유지 — 별도 escalation 불필요.
- **Codex session 참조**: threadId `019e9efb-b398-7623-b693-9a6f25a00692` (durationMs 29351s).
- **Receipt re-stamp 목표**: 본 라운드의 핵심 가치는 advance된 plan_hash + base_commit으로 `mccp-plan-codex/mccp-roadmap.json`을 re-issue하여 chain hygiene 회복 (Phase 5.6/5.7 후속).

