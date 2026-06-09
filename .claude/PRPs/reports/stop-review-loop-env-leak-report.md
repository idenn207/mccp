# Implementation Report: Stop Review Loop Test — MCCP_CODEX_DISABLED Env Leak Fix

## Summary

`plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js`의 "path 7" 테스트(line 180-199)에 canonical env snapshot/restore guard를 적용했습니다. PR #11 review L2가 지적한 환경 격리 부재가 해소돼, 부모 shell에 `MCCP_CODEX_DISABLED=1`이 set돼 있어도 path 7이 deterministic green을 만듭니다. 적용 패턴은 `plugins/mccp/scripts/lib/tests/codex-bridge.test.js:151-162`의 canonical mirror로, 별도 helper 추출 없이 single-site inline guard.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (확인) |
| Files Changed | 1 | 1 |
| Tasks | 3 (patch + env-set validate + env-unset validate) | 3 + 1 추가 (full-suite delta 분석) |
| Codex involvement | advisory (영구 bypass) | advisory (확인) |
| Impeccable involvement | skill-missing skip | skill-missing skip (확인) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | path 7 test에 env snapshot/restore guard 추가 | [done] Complete | 4 lines added (snapshot 2 + try open + finally restore 3) |
| 2 | env unset 회귀 검증 | [done] Complete | target file 13/13 PASS unchanged |
| 3 | full suite green 확인 | [done] Complete (with caveat) | target file 13/13 PASS, full suite delta = 17 same-class leaks elsewhere (out-of-scope per PRD) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [N/A] | repo root에 lint runner script 없음 — Node 표준 `require strict mode` 만 적용됨 |
| Unit Tests (target file, env=1) | [done] Pass | 13/13 — path 7가 이전 fail → 현재 pass로 회복 |
| Unit Tests (target file, env unset) | [done] Pass | 13/13 — 회귀 없음 |
| Build | [N/A] | pure JS, compile step 없음 |
| Integration | [N/A] | hook test, server 없음 |
| Edge Cases | [done] Pass | env=1 / env unset 양 시나리오 모두 13/13 green |

### Full-Suite Delta Analysis (v0.3.3 dogfood observation)

| Suite mode | tests | pass | fail | delta vs target |
|---|---|---|---|---|
| `MCCP_CODEX_DISABLED=1` (사용자 영구 설정) | 861 | 838 | 21 | path 7 외 latent 17건 + pre-existing 4건 |
| env unset | 861 | 855 | 4 | pre-existing only (receipt-prompt G1 x2 + receipt-skill G1 x1 + real codex smoke x1) |

본 patch는 target file 범위(stop-review-loop.test.js)에서 의도된 효과만 발생시킵니다. 17건의 잔여 env-leak failure는 동일 class의 latent bug가 codex-bridge.test.js 등 sibling test files에 분포함을 보여줍니다 — PRD Out-of-scope("다른 env var의 cross-test leak audit") 정책에 따라 본 patch에서 미흡수, follow-up task로 분리.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` | UPDATED | +6 / -1 (path 7 test body wrap) |
| `.claude/prds/stop-review-loop-env-leak.prd.md` | CREATED + AMENDED | +~70 (Phase 2 GROUND 보정 노트 포함) |
| `.claude/plans/stop-review-loop-env-leak.plan.md` | CREATED + AMENDED | +~150 (plan-codex + implement-codex sections) |
| `.claude/receipts/mccp-plan-codex/stop-review-loop-env-leak.json` | CREATED | receipt (advisory) |
| `.claude/receipts/mccp-implement-codex/stop-review-loop-env-leak.json` | CREATED | receipt (advisory) |

## Deviations from Plan

| Deviation | Why |
|---|---|
| `npm test` 명령을 plan의 Validation에 그대로 둠 vs 실제 실행은 `node --test` 직접 호출 | repo root에 package.json 없음 → `npm test` 실행 불가. plan은 사용자의 일반화된 mental model을 기록(README/CI 흐름과 일치)이고, 실 실행은 monorepo 직접 호출. 본 deviation은 plan-codex의 advisory mode가 catch하지 못한 minor blind spot. |
| Task 3 validation 범위가 plan 예상보다 넓게 17건 surface | plan은 target file 회귀 검증 의도였으나 monorepo 전체 추론을 통해 latent class를 발견. PRD Out-of-scope 정책에 따라 흡수하지 않고 본 report에 기록. |
| chain 안에서 PRD/plan을 mid-chain amend | Phase 2 GROUND가 PRD inversion을 surface한 결과. spec이 명시적으로 forbid하지 않음 + audit trail 보존 + downstream consistency 유지 위해 정당화. |

## Issues Encountered

1. **codex-invoke wrapper가 MCCP_CODEX_DISABLED를 honor 안 함** (HIGH dogfood finding)
   - CLAUDE.md §1.2가 약속한 "codex-bridge: verdict='skipped'" 행위가 wrapper 레이어에서 미발현
   - exit 12 + classification=exit-nonzero + blocking=true로 떨어짐
   - 우회: `MCCP_ALLOW_CODEX_UNAVAILABLE=1` advisory mode + `MCCP_RECEIPT_GATE_MODE=off` 영구 설정으로 통과
   - Follow-up: codex-invoke.js에 MCCP_CODEX_DISABLED 처음 check 추가, classification='skipped' 매핑

2. **receipt validate CLI가 --plan 인자에서 decision-id 추론 안 함** (MEDIUM)
   - `validate --command mccp:prp-implement --plan <path>`는 decision-id를 path에서 derive 못하고 "default" fallback → v0.2.8 quarantine 차단
   - 우회: `--decision <slug>` 명시
   - Follow-up: CLI가 `--plan` 인자로부터 decision-id를 자동 derive하도록 하거나, spec 5.7 예시를 `--decision` 포함으로 갱신

3. **work-orchestrator state machine이 plan-prd step를 모름** (MEDIUM)
   - `next-step --state prd`가 `halt=true, reason=unknown-state` 반환
   - plan-prd가 receipt 미발행 step이므로 state machine 외부 — 정상 동작이지만 spec 문구 "between each query next-step"이 잘못된 인상을 줌
   - Follow-up: /mccp:work spec rewrite로 "between gate-emitting steps only" 명확화

4. **PRD inversion: prior session memory의 cause direction이 반대** (HIGH dogfood finding)
   - PRD 추론: test가 env를 mutate해서 후속 leak
   - 실제: 부모 shell의 env가 test 안으로 leak
   - 검출: Phase 2 GROUND가 grep + 실제 file 검사를 통해 자가 보정
   - 본 finding이 chain의 multi-stage safety가 실증된 사례 — PRD 단독 오류가 plan grounding으로 회복됨

5. **Same-class env-leak latent in 17 sibling test sites** (HIGH dogfood finding, follow-up scope)
   - codex-bridge.test.js의 "converged/divergent/critical/unavailable fixture" 17건이 동일 클래스
   - 패턴은 이미 codex-bridge.test.js:151-162에 존재 — 같은 file 안의 sibling tests에 미적용 (pattern existence vs application gap)
   - 본 PRD Out-of-scope ("다른 env var의 cross-test leak audit") 정책으로 미흡수
   - Follow-up PRD/plan: "test file env hygiene audit" — codex-bridge.test.js + receipt-* tests 대상

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| (수정만, 신규 작성 없음) | path 7 guard wrap | env=1 시 path 7 deterministic block path |

신규 test를 추가하지 않은 이유: PR #11 L2 finding이 "기존 test가 env에 의존성을 갖는다"이고, fix는 그 의존성 제거. 의존성 제거 자체의 회귀 검증은 기존 path 7가 이미 수행 (env=1 + env unset 양쪽 모두 PASS). 별도 dedicated test는 over-engineering.

## v0.3.3 Dogfood Findings Summary (Task 3 deliverable)

본 implementation report는 v0-3-3-intent-dogfood.plan.md Task 3 ("record findings")의 primary artifact로도 기능합니다. 본 절은 dogfood 전용 finding을 정리.

### Findings worth landing in CLAUDE.md / spec rewrite

| # | Surface | Description | Priority |
|---|---|---|---|
| F1 | codex-invoke.js | MCCP_CODEX_DISABLED를 wrapper level에서 skip으로 매핑 안 함 — CLAUDE.md §1.2 contract와 drift | HIGH |
| F2 | receipt CLI validate | `--plan` 인자에서 decision-id 자동 derive 안 됨, spec 5.7 예시 갱신 필요 | MEDIUM |
| F3 | /mccp:work spec | "between each query next-step" 문구가 plan-prd → plan 전이에 잘못 적용 가능 — "between gate-emitting steps" 명확화 | MEDIUM |
| F4 | plan-prd Phase 0 | "user-delegated PRD"의 Claude-inferred content에 대해 "Assumption" vs "Claude-inferred" 구분이 spec에 없음 — 둘 다 honest path 필요 | MEDIUM |
| F5 | impeccable Skill | user-level 미설치 정책이 fork-lineage 의도(§1.1)이지만, mode=plan/implement 양쪽에서 skill-missing → fallback이 spec-compliant하게 작동함을 확인 (positive finding) | INFO |
| F6 | test env hygiene class | 17 latent sites in codex-bridge.test.js + receipt-* — separate follow-up task | HIGH |
| F7 | dogfood multi-stage safety | PRD inversion이 plan Phase 2 GROUND로 자가 회복 — chain design이 single-stage 오류에 robust함을 실증 | INFO |

### Plan retrospective (mitigated by design)

v0-3-3-intent-dogfood plan 자체는 dogfood 없이 plan됨 — self-referential 한계. 본 milestone 자체가 "validate v0.3.x by using it"이므로 mitigated by design. plan body는 dogfood 결과로 정확히 갱신될 수 있음 (drift sync).

### Codex-disabled handling assessment (Task 3 specific section)

사용자의 영구 bypass 설정(`MCCP_CODEX_DISABLED=1` + `MCCP_RECEIPT_GATE_MODE=off`)이 chain 전반에서 일관되게 동작함을 확인:

- plan-codex gate: wrapper exit 12 + advisory mode env → receipt write 통과, validate ok
- implement-codex gate: 동일 path → receipt write 통과, validate ok (impeccable warning informational)
- chain-of-custody warning은 spec design feature (`MCCP_RECEIPT_GATE_MODE=off`가 receipt 미작성 시에만 통과시키므로, advisory receipt는 schema-valid → 통과)
- **False-green risk 검증**: 단순히 모든 gate가 advisory로 떨어지면 cross-validation 가치가 0이 됨. 그러나 본 chain은 plan body의 self-attested findings + Phase 2 GROUND grep evidence + 실 test 실행 결과를 통해 "Codex 없는 검증"을 분산 수행. 단일 dependency가 아니라 multi-source independence가 안전망.

## Next Steps

- [ ] `/mccp:prp-commit` — commit chain artifacts + patch (자동 다음 step, /mccp:work Phase 2.F Step 4)
- [ ] `/mccp:pr` — PR open (자동 다음 step, /mccp:work Phase 2.F Step 5)
- [ ] Follow-up plan (별도 milestone or v0.3.4): test env hygiene audit (codex-bridge.test.js + receipt-* 17 sites) — F6
- [ ] Follow-up patch: codex-invoke.js에 MCCP_CODEX_DISABLED honor 추가 — F1
- [ ] Spec patches: /mccp:work + /mccp:plan(5.7 validate) + plan-prd Phase 0 — F2/F3/F4
- [ ] STATE.md / CLAUDE.md sync (Task 4 of v0-3-3 plan) — separate step
