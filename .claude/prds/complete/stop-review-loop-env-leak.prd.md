# Stop Review Loop Test — MCCP_CODEX_DISABLED Env Leak Fix

> **AMENDMENT 2026-06-09 (Phase 2 GROUND in `/mccp:plan`)**: 본 PRD의 원본 Problem section은 cause direction이 잘못 추론됐습니다. 정확한 cause는 아래 "Problem (corrected)" 참조. plan body가 정확한 사실 기반.

## Problem (corrected)
`plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js`의 "path 7" 테스트(line 180-199)는 **부모 shell의 `MCCP_CODEX_DISABLED=1`** 설정(사용자의 `.claude/settings.local.json` 영구 bypass 설정)이 누설되면 false-fail합니다. 메커니즘: hook가 `codex-bridge.parseCodexResult`를 호출하고, 이 함수가 `process.env.MCCP_CODEX_DISABLED`를 read하여 verdict='unavailable'로 short-circuit → hook가 block path가 아니라 allow path로 분기 → 테스트 assertion `decoded.decision === 'block'` 실패. 검증: env unset 시 13/13 PASS, env=1 시 path 7만 fail.

## Problem (original PRD — Claude-inferred, INVERTED)
~~`tests/v0.3.0-stop-review-loop.test.js`는 `MCCP_CODEX_DISABLED` 환경변수를 in-test mutate하지만 `afterEach`/`afterAll` cleanup hook이 없습니다. 결과적으로 같은 vitest run 안에서 후속 테스트가 leaked process env로 false-green을 만들 수 있고…~~ — 이 inference는 path 가정(`tests/v0.3.0-*`), framework 가정(vitest), 그리고 leak 방향(test → 후속) 모두 틀렸음. 실제 file은 `plugins/mccp/scripts/hooks/tests/`, framework는 `node:test`, leak 방향은 환경 → test.

> *Original PRD Claude-inferred (user-delegated 2026-06-09). Phase 2 GROUND가 cause inversion을 surface하기까지 chain 내부 자가 보정 가능함을 dogfood로 검증.*

## Evidence
- *Assumption — needs validation via PR #11 review thread artifact (L2 finding).* Review artifact 자체가 leaked-env 시나리오를 기술.
- *Claude-inferred from prior session memory (`.claude/state/STATE.md` "Next Step" + Open Questions HIGH#2).*

## Users
- **Primary**: mccp plugin maintainer (skypark207) — local `npm test` / CI에서 deterministic green을 기대. test suite 무결성에 직접 의존.
- **Not for**: end user (plugin consumer)는 영향 없음 — 본 패치는 test fixture 내부 hygiene이고 runtime behavior에 변화 없음.

> *Claude-inferred (user-delegated 2026-06-09).*

## Hypothesis
We believe **`MCCP_CODEX_DISABLED` env cleanup in `tests/v0.3.0-stop-review-loop.test.js`** will **eliminate cross-test env-state bleed and the resulting false-green risk** for **mccp plugin maintainer running the suite in any order**.
We'll know we're right when **the test passes both standalone and in full-suite ordering, AND no subsequent test observes `MCCP_CODEX_DISABLED=1` carried from this file (verified via vitest env diff or explicit assert in a downstream test)**.

> *Claude-inferred (user-delegated 2026-06-09).*

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Test isolation | `MCCP_CODEX_DISABLED` unset (or restored) after suite | manual diff `process.env` before/after / explicit downstream assert |
| Full-suite green | exit 0 | `npm test` |
| Standalone green | exit 0 | `npx vitest tests/v0.3.0-stop-review-loop.test.js` |

## Scope
**MVP** — `tests/v0.3.0-stop-review-loop.test.js`에 `afterEach` 또는 `afterAll` hook 추가, mutate된 `MCCP_CODEX_DISABLED`를 명시적으로 restore (또는 unset). 이전 값 보존이 가능하면 restore, 없으면 `delete`.

**Out of scope**
- 다른 env var의 cross-test leak audit (`MCCP_RECEIPT_GATE_MODE`, `MCCP_AUTO_HANDOFF` 등) — separate task로 분리. 본 PRD가 다루는 surface는 PR #11 L2가 지적한 단일 변수에 한정.
- vitest test isolation infra 도입 (예: per-file isolated process) — patch scope를 넘어섬, 별도 architectural change.
- 다른 test file에 동일 패턴 적용 — 본 PRD는 명시된 1 file만.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | env-var cleanup fix | stop-review-loop suite가 standalone + full-suite 모두 deterministic green | complete | [plan](.claude/plans/stop-review-loop-env-leak.plan.md) + [report](.claude/PRPs/reports/stop-review-loop-env-leak-report.md) |

## Open Questions
- [ ] Cleanup 위치: 동일 file 내 `afterEach`로 충분한가, 아니면 `beforeAll` snapshot + `afterAll` restore 패턴이 더 적절한가? (test가 env를 여러 번 mutate하면 후자가 안전)
- [ ] 같은 file에 또 다른 `process.env.*` mutation이 있는가? full file scan 후 결정.
- [ ] Restore semantics: 사전에 `MCCP_CODEX_DISABLED`가 set돼 있던 경우(예: 사용자 settings.local.json에서 영구 bypass) 원래 값으로 복원해야 함 — 단순 `delete`는 leak의 반대 방향 leak을 만들 수 있음.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cleanup이 사용자 환경의 영구 `MCCP_CODEX_DISABLED=1` 설정을 덮어씀 | Medium | Low (test scope만) | 사전 값을 snapshot 후 restore, `delete`만으로 처리하지 않기 |
| 다른 test file에 동일 leak 패턴 잠복 | Medium | Medium | Out-of-scope로 분리하되 follow-up audit task open |
| `afterEach`가 fire 안 하는 vitest config 사용 중일 가능성 | Low | High (silent regression) | `/mccp:plan`이 vitest config 확인을 explicit task로 포함 |

## Design Direction
> impeccable unavailable, skipped (auto-fallback): skill-missing

본 PRD는 test-fixture hygiene fix로 UI surface 없음 — design direction이 의미를 갖지 않으므로 skill-missing fallback이 무해함을 추가로 기록.

---
*Status: **DRAFT — USER INPUT DELEGATED** (Claude-inferred from prior session STATE.md + PR #11 L2 review). User explicitly delegated PRD framing answers on 2026-06-09 (2-bounce delegation pattern per `/mccp:plan-prd` Phase 0 rule #4). Future revision should validate Problem/Users/Hypothesis fields with user before subsequent milestone planning.*
*Co-created with user on 2026-06-09 (delegation mode).*
