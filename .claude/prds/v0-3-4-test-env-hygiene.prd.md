# v0.3.4 — Test Env Hygiene Audit + v0.3.3 Housekeeping Bundle

## Problem

mccp maintainer 겸 daily-driver(skypark207)가 `MCCP_CODEX_DISABLED=1`을 영구 설정한 shell에서 `node --test plugins/mccp/scripts/**/tests/*.test.js`를 실행하면 17건의 cross-test env leak failure가 surface된다. 해법 패턴은 same file([codex-bridge.test.js:151-162](../../plugins/mccp/scripts/lib/tests/codex-bridge.test.js#L151-L162))에 canonical snapshot/restore로 이미 존재하지만 sibling test sites에 미적용 — "pattern existence vs application gap" 클래스 결함. v0.3.3 dogfood가 surface한 finding이라 컨텍스트가 신선한 지금 처리하지 않으면 향후 dogfood/CI green이 17건 false-positive로 오염되어 진짜 신호가 묻힌다. 동시에 v0.3.3 milestone close-out housekeeping 4건도 묶어 한 cycle로 흡수한다.

## Evidence

- **E1 (quantitative)**: full test suite 861 tests, `MCCP_CODEX_DISABLED=1` 시 21 fail vs env-unset 시 4 fail — delta 17건이 cross-test env leak class ([stop-review-loop-env-leak-report.md §Full-Suite Delta Analysis](../PRPs/reports/stop-review-loop-env-leak-report.md)).
- **E2 (followup ledger)**: v0.3.3 dogfood report §Findings F6 (HIGH priority)이 "Same-class env-leak latent in 17 sibling test sites" 명시 + scope를 codex-bridge.test.js "converged/divergent/critical/unavailable fixture" + receipt-* tests로 한정 후 deferred ([stop-review-loop-env-leak-report.md §F6](../PRPs/reports/stop-review-loop-env-leak-report.md#L114)).
- **E3 (pattern viability)**: canonical snapshot/restore pattern은 [codex-bridge.test.js:151-162](../../plugins/mccp/scripts/lib/tests/codex-bridge.test.js#L151-L162)에 이미 존재. PR #14 (`cdd77fc`)가 동일 패턴을 stop-review-loop.test.js path 7에 적용해 ship됨 — pattern viability는 검증된 fix로 입증.
- **E4 (user workflow impact)**: 사용자 memory에 `MCCP_CODEX_DISABLED=1`이 영구 설정으로 문서화 ([feedback-codex-permanent-bypass](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-permanent-bypass.md)) — hygiene 부재가 maintainer의 daily workflow에 직접 영향.

## Users

- **Primary**: skypark207 (mccp maintainer + sole daily-driver). `MCCP_CODEX_DISABLED=1` permanent shell 환경에서 `node --test` 회귀 검증을 routine으로 수행.
- **Not for**: 다른 mccp end-users (현 시점 sole user 모델) / non-test production code surface (본 milestone은 test-only hygiene) / `MCCP_CODEX_DISABLED` 외 env var의 cross-test leak audit (별도 cycle).

## Hypothesis

We believe **`codex-bridge.test.js:151-162`의 canonical env snapshot/restore pattern을 17 sibling test sites (codex-bridge.test.js의 converged/divergent/critical/unavailable fixture + receipt-* tests)에 mechanical하게 inline 적용**하면 **`MCCP_CODEX_DISABLED=1` shell의 17건 cross-test env leak failure 제거**를 **mccp daily-driver(skypark207)**에게 제공할 수 있다.
We'll know we're right when **`MCCP_CODEX_DISABLED=1; node --test plugins/mccp/scripts/**/tests/*.test.js; remove env`의 fail count가 env-unset 시 fail count와 동일 (4 pre-existing only, delta 0)**.

> *Assumption — Hypothesis content는 assistant-drafted. User가 Phase 0 rule #4 second refusal("claude가 다 채워")으로 위임. Validation은 `/mccp:plan` Phase 2 GROUND의 grep 증거(실제 leak site count = 17 확정) + Phase 4 implement 후 success metric 측정으로 verified.*

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| env-polluted fail count (primary) | 17 → 0 (delta 0 vs env-unset) | `$env:MCCP_CODEX_DISABLED='1'; node --test plugins/mccp/scripts/**/tests/*.test.js; Remove-Item env:MCCP_CODEX_DISABLED` 후 fail count |
| env-unset regression | 4 pre-existing only (no new failures) | `node --test plugins/mccp/scripts/**/tests/*.test.js` fail count (env unset) |
| plugin.json version bump | 0.3.2 → 0.3.4 (skip 0.3.3 release) | `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` |
| Docs drift entries (housekeeping) | 0 stale | CLAUDE.md §1.4 grep `미구현` = 0 hit, roadmap M6 status row = ✅ shipped |
| STATE.md fingerprint sync | `v0-3-4-test-env-hygiene` | `Select-String -Path .claude/state/STATE.md -Pattern '^task_fingerprint: v0-3-4-test-env-hygiene'` |

## Scope

**MVP** — 17 test sites에 inline canonical env snapshot/restore 패치(`codex-bridge.test.js:151-162` mirror) + v0.3.3 housekeeping bundle (plugin.json 0.3.2→0.3.4 직행, CLAUDE.md §1.4 S11/S12 drift sync, roadmap M6 ship row + status ✅, STATE.md fingerprint flip). 단일 hotfix PR.

**Out of scope**
- **F1 — codex-invoke.js wrapper의 `MCCP_CODEX_DISABLED` honor** — v0.3.3 report §F1이 HIGH로 식별했으나 본 milestone은 *test hygiene*에 집중. wrapper 행동 변경은 codex-bridge contract surface — 별도 cycle (v0.3.5 후보).
- **F2 — receipt CLI validate `--plan`에서 decision-id auto-derive** — spec/CLI improvement, test hygiene 외.
- **F3 — `/mccp:work` spec rewrite ("between gate-emitting steps only")** — docs cycle.
- **`MCCP_*` 외 env var의 cross-test leak audit** — explicit non-scope, future audit milestone.
- **Helper extraction (env-guard module)** — 17 sites 모두 *inline* snapshot/restore (codex-bridge.test.js:151-162 mirror). helper 분리는 over-engineering risk + canonical pattern 일관성 약화 — Mitigation in Risks 표.
- **Pre-existing 4 failures** (receipt-prompt G1 x2 + receipt-skill G1 x1 + real codex smoke x1) — env-leak class 아님, 별도 audit.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | v0.3.4 ship | `MCCP_CODEX_DISABLED=1` shell의 fail count가 env-unset shell과 동일(4 pre-existing only)로 떨어지고 v0.3.3 housekeeping 4축 모두 drift 0 | pending | — |

## Open Questions

- [ ] 17 leak sites의 정확한 분포: codex-bridge.test.js × N₁ + receipt-* tests × N₂ (N₁ + N₂ = 17). `/mccp:plan` Phase 2 GROUND에서 grep으로 file-by-file 확정.
- [ ] `receipt-*` 카테고리에 포함되는 test file 정확한 list: `write.test.js` / `validate-cmd.test.js` / 기타 receipt-prefix tests 중 어느 것이 17건에 contribute? Phase 2에서 확정.
- [ ] env snapshot/restore가 (a) inline `try/finally`인지 (b) Node test runner `beforeEach/afterEach` lifecycle hook인지 — canonical은 inline이지만 17 sites 적용 시 lifecycle이 더 깔끔할 가능성. Phase 2에서 합의 (default: inline per MVP scope).
- [ ] v0.3.3 housekeeping을 동일 PR 안에서 *별도 commit*으로 분리할지, single squash commit으로 묶을지 — audit trail vs PR 단순성 trade-off. `/mccp:plan` Phase 5 또는 `/mccp:prp-commit` 단계 결정.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 17 sites mass edit이 다른 test 의도를 미묘하게 깨뜨림 | Medium | High | site-by-site validation — 각 file `MCCP_CODEX_DISABLED=1` set + unset 양쪽 PASS 확인. PR 전 full suite delta check. |
| 실제 leak site count가 17과 다름 (dogfood report delta vs file-level grep) | Medium | Low | `/mccp:plan` Phase 2 GROUND에서 grep으로 final count 확정. count 불일치 자체가 finding으로 기록되어 PRD revision 또는 plan amendment. |
| Codex permanent bypass + receipt gate off로 chain cross-validation이 약화된 상태에서 17 sites mass edit 수행 | Low | Medium | 사용자 영구 합의 ([feedback-codex-permanent-bypass](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-permanent-bypass.md)). advisory mode receipt + body self-attestation + test runner mechanical green이 보완. |
| Helper extraction 유혹 → over-engineering + canonical pattern 일관성 약화 | Medium | Low | MVP 명시: inline snapshot/restore only. Out of scope에 helper 분리 명시 박음. `/mccp:plan` Phase 5에서도 동일 invariant 유지. |
| v0.3.3 housekeeping이 hotfix scope 안에 묻혀 audit trail 약화 | Low | Low | PR body에 두 axis(F6 17-leak + v0.3.3 housekeeping) 분리 명시 + commit message convention(`fix(v0.3.4): ...` + `chore(v0.3.4): v0.3.3 housekeeping bundle`). |
| Hypothesis assumption marker가 downstream `/mccp:plan` Phase 2 GROUND에서 invalidate됨 | Low | Medium | Phase 2 GROUND가 grep으로 17 sites 실측. 실측이 hypothesis와 충돌하면 PRD revision으로 자가 보정 (v0.3.3 dogfood report §F7 multi-stage safety pattern). |

## Design Direction

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill은 mccp 번들 외 — CLAUDE.md §1.1 fork-lineage 결정대로 user-level 별도 설치 대상. 본 PRD는 test code env hygiene + housekeeping으로 UI/visual surface 없음 — detect의 `design_signal=true`는 본 PRD 자신의 `## Design Direction` 헤더 keyword가 trigger한 false positive로 판정. downstream `/mccp:plan` Phase 5.0에서도 동일 fallback path.)

---

*Status: **DRAFT — USER INPUT MISSING (Hypothesis assistant-drafted; user delegated full content via "claude가 다 채워" — Phase 0 rule #4 second refusal). Problem/Users/Evidence는 user-confirmed (Phase 1) 또는 user-delegated to ledgered evidence (Phase 2).***
*Co-created with user on 2026-06-10.*
