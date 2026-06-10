# v0.3.5 — Codex Disabled Honor (wrapper-level first-class skip)

## Problem

mccp의 영구 Codex bypass 사용자 — 현재 단일 maintainer skypark207 — 가 `MCCP_CODEX_DISABLED=1` 환경에서 `/mccp:plan`, `/mccp:prp-implement`, `/mccp:pr`을 호출하면, [codex-invoke.js](../../plugins/mccp/scripts/lib/codex-invoke.js) wrapper는 disabled flag를 모르고 매번 `codex-companion.mjs`를 spawn 시도한다. companion이 `not-authenticated` / `registry-missing` / `companion-not-found` 중 하나로 fail-closed classification을 emit하면, 사용자는 매 호출마다 `MCCP_ALLOW_CODEX_UNAVAILABLE=1` (advisory mode) 또는 terminal step의 경우 `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"` audited escape을 수동/자동 주입해야 게이트가 통과한다. 결과: (a) 매 chain마다 의미 없는 spawn 비용 + 노이즈성 stderr warning, (b) receipt가 `verdict=advisory + meta.codex_unavailable=true`로 기록되어 "사람이 Codex 미가용을 알면서도 통과시켰다"는 의미가 매번 의미 없이 반복되며 receipt audit log의 신호/노이즈 비율 하락, (c) `MCCP_RECEIPT_GATE_MODE=off`나 `MCCP_SKIP_RECEIPT=1`로 광범위 우회 시 다른 게이트까지 함께 잃어버리는 trade-off. v0.3.4 PRD §Out-of-scope에서 F1으로 명시 deferred되었고, STATE.md Open Questions 최상단 HIGH carry로 v0.3.5에 등록.

## Evidence

- **E1 (user policy as primary evidence)**: 사용자 auto-memory에 `MCCP_CODEX_DISABLED=1` + `MCCP_RECEIPT_GATE_MODE=off`를 영구 적용한다는 합의가 명시 문서화 ([feedback-codex-permanent-bypass](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-permanent-bypass.md), 2026-06-08). `/codex:setup` 재인증 제안 금지 + "chain-of-custody is broken" warning은 design feature로 채택.
- **E2 (runner-blind workaround already automated)**: 후속 memory에서 `/mccp:pr` 호출 시 자동으로 `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"`을 적용하는 사용자측 우회가 명시 등록 ([feedback-codex-runner-disabled-blind](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-runner-disabled-blind.md)). 이미 자동화된 우회 패턴이 존재한다는 사실 자체가 wrapper-level fix의 필요성을 입증.
- **E3 (deferred-from-prior-cycle ledger)**: v0.3.4 PRD §Out-of-scope에 "F1 — codex-invoke.js wrapper의 `MCCP_CODEX_DISABLED` honor — v0.3.3 report §F1이 HIGH로 식별했으나 본 milestone은 test hygiene에 집중. wrapper 행동 변경은 codex-bridge contract surface — 별도 cycle (v0.3.5 후보)." 로 명시 deferred ([v0-3-4-test-env-hygiene.prd.md:41](v0-3-4-test-env-hygiene.prd.md)).
- **E4 (state ledger continuity)**: STATE.md Open Questions 최상단(직전 commit 9190f3a 기준) "HIGH — F1 codex-invoke.js MCCP_CODEX_DISABLED honor: wrapper bypass with verdict=skipped reason=codex_disabled (v0.3.4 PRD §Out-of-scope deferred to v0.3.5)" — 두 cycle에 걸쳐 carry된 우선순위 신호.
- **E5 (existing classification surface)**: 현재 wrapper [classification enum](../../CLAUDE.md) 11개(`ok` / `registry-missing` / `plugin-not-installed` / `install-path-stale` / `companion-not-found` / `companion-version-mismatch` / `not-authenticated` / `timeout` / `exit-nonzero` / `stdout-empty` / `spawn-enoent` / `parse-error`)는 모두 "Codex가 있어야 하는데 못 닿는다"를 전제. "Codex가 의도적으로 꺼져있다"는 사용자 의도를 표현하는 enum이 부재 — `disabled` enum 추가의 contract 자리는 비어있음.

## Users

- **Primary**: skypark207 (mccp maintainer + sole daily-driver). Codex 토큰 cap 운영 정책상 `MCCP_CODEX_DISABLED=1`을 shell session 영구 환경 변수로 운용. 매 `/mccp:work` chain마다 wrapper의 spawn 시도 → fail-closed → advisory mode 우회 cycle을 거침.
- **Generalized**: Codex를 의도적으로 비활성화한 채 mccp chain을 운영하는 사용자 (Codex 미설치 / 토큰 cap / 정책상 미사용 / 오프라인 환경). 본 milestone의 외형적 효과는 단일 사용자 영향이지만 wrapper contract 확장이므로 미래의 multi-user 시나리오를 포괄.
- **Not for**: Codex를 정상 운영 중인 사용자 (disabled flag 미설정 시 동작 변화 zero — 기존 11개 classification matrix 그대로). `MCCP_CODEX_DISABLED`를 모르는 codex plugin 본체 (mccp wrapper 계층에서만 honor — codex plugin 자체 API 변경 없음).

## Hypothesis

We believe **codex-invoke.js wrapper가 `MCCP_CODEX_DISABLED=1`을 spawn 직전 단계에서 first-class classification으로 인식해 `verdict='skipped' + reason='codex_disabled'`의 canonical envelope를 즉시 반환**하면 **(a) chain의 모든 Codex 게이트가 advisory mode env 주입 없이도 통과 + (b) receipt가 `verdict=skipped + meta.codex_skip_reason='codex_disabled'`로 일관 기록 + (c) terminal `/mccp:pr`이 `MCCP_PR_SKIP_CODEX_REVIEW` 강제 없이도 진입**할 수 있게 **Codex 영구 bypass 사용자 (skypark207 외)**에게 제공할 수 있다.

We'll know we're right when **(metric M1) `MCCP_CODEX_DISABLED=1` shell에서 `/mccp:work` full chain을 종단까지 실행 시 `MCCP_ALLOW_CODEX_UNAVAILABLE`/`MCCP_PR_SKIP_CODEX_REVIEW`/`MCCP_RECEIPT_GATE_MODE=off`/`MCCP_SKIP_RECEIPT` 중 어떤 우회 env도 추가 주입 없이 PR 생성까지 도달하고, (metric M2) 생성된 모든 receipt의 `verdict` 필드가 `skipped`로 일관 기록되며 `meta.codex_skip_reason='codex_disabled'`가 명시 표시**된다.

> *Hypothesis derivation: Phase 1 사용자 확정 답변 (Problem/Users/Why-now)에서 직접 도출. assistant-drafted이지만 Phase 1 confirmed content 위에 구축되었고 user가 "그대로 진행"으로 채택 + Phase 2-3 "claude에게 맡김"으로 위임. Validation은 `/mccp:plan` Phase 2 GROUND의 codex-invoke.js classification call-site grep + Phase 4 implement 후 M1/M2 측정.*

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| M1 — Workaround env injection count (primary) | `/mccp:work` 1회 chain당 0회 (현재 1-3회) | shell history grep `'MCCP_ALLOW_CODEX_UNAVAILABLE\|MCCP_PR_SKIP_CODEX_REVIEW'` count |
| M2 — Receipt verdict consistency | 모든 Codex 게이트 receipt가 `verdict="skipped"` + `meta.codex_skip_reason="codex_disabled"` | `node -e 'JSON.parse(fs.readFileSync(...)).verdict'` over `.claude/receipts/mccp-{plan,implement,pr}-codex/*.json` |
| M3 — Wrapper spawn cost | `codex-companion.mjs` spawn 0회 per chain (현재 chain step당 1회) | `node plugins/mccp/scripts/lib/codex-invoke.js` trace 또는 process audit |
| M4 — stderr noise | "not-authenticated" / "registry-missing" / "chain-of-custody is broken" stderr 라인 0건 per chain | `/mccp:trace` shard ledger inspection |
| M5 — Regression — Codex 정상 사용자 영향 | `MCCP_CODEX_DISABLED` 미설정 시 모든 classification 동작 동일 (11개 enum unchanged) | codex-bridge.test.js full suite green + 새 disabled-honor test가 unset 시 short-circuit하지 않음 verifying |
| M6 — plugin.json version bump | 0.3.4 → 0.3.5 | `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` |

## Scope

**MVP** — codex-invoke.js wrapper의 spawn 직전(classification 분기 직전) 단계에서 `process.env.MCCP_CODEX_DISABLED === '1'` 감지 시 즉시 short-circuit하여 canonical envelope `{ classification: 'disabled', verdict: 'skipped', reason: 'codex_disabled', blocking: false }`을 반환. caller 측 (codex-bridge / plan-codex / implement-codex / pr-codex 게이트) 은 새 classification을 `ok`-equivalent advisory path로 처리해 receipt에 `verdict=skipped + meta.codex_skip_reason='codex_disabled'` 기록. terminal `/mccp:pr` Phase 0 preflight도 disabled classification을 `MCCP_ALLOW_CODEX_UNAVAILABLE` 거부 룰에서 **예외**로 등록 (의도된 disable이지 unavailable 아님). `MCCP_PR_SKIP_CODEX_REVIEW`는 그대로 유지하되 disabled mode가 활성화되면 mutex preflight (CODEX_DEDUPE_AT_PR과의 기존 mutex와 별도 — disabled 진입 시 skip-env 미설정도 허용)를 통과시킴. test: 새 classification 진입/미진입 양쪽 + receipt verdict 필드 정합성 + terminal /mccp:pr 통합.

**Out of scope**
- **codex plugin 본체 API 변경** — mccp wrapper layer에서만 honor. codex plugin은 자기 자신이 disabled인지 모른 채 정상 동작 (의도된 책임 분리).
- **Re-enable orchestration** — `MCCP_CODEX_DISABLED=0` 또는 unset 시 wrapper가 자동으로 spawn 경로 복원하는 것은 본 milestone의 default 동작. 별도 명시적 "re-enable wizard" 또는 토큰 갱신 안내는 out-of-scope.
- **chain-of-custody fingerprint 시각화** — disabled 상태에서 generate된 PR/receipt가 정상 Codex review를 거치지 않았음을 명시 표시하는 PR body banner / receipt schema field 추가는 별도 docs cycle. 본 milestone은 wrapper 행동에만 집중.
- **`MCCP_RECEIPT_GATE_MODE=off` 사용자의 receipt write 자체 skip** — 사용자 영구 정책 (feedback-codex-permanent-bypass)이지만 본 milestone은 *wrapper*만 다루고 receipt write logic은 변경 안 함. 사용자가 `MCCP_RECEIPT_GATE_MODE=off` 동시 적용 시 receipt 자체가 미생성될 수 있고 그건 의도된 별도 운영.
- **codex-companion.mjs 자체의 disabled-mode awareness** — companion 프로세스가 시작되지조차 않으므로 무관.
- **STATE.md fingerprint 자동 갱신** — 사용자 영구 정책 carry는 별도 cycle.
- **새 audited escape env var 추가** — 기존 `MCCP_ALLOW_CODEX_UNAVAILABLE` / `MCCP_PR_SKIP_CODEX_REVIEW` 의 의미를 보존하되, `MCCP_CODEX_DISABLED`가 활성이면 우회 env 자체가 불필요해지는 게 핵심.
- **codex-invoke.js의 다른 classification enum 11개 동작 변경** — 영향 zero.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | v0.3.5 ship | `MCCP_CODEX_DISABLED=1` shell에서 `/mccp:work` full chain이 어떤 우회 env 주입 없이도 PR 생성까지 도달하고, 모든 Codex receipt가 `verdict=skipped + reason=codex_disabled`로 일관 기록 | in-progress | [.claude/plans/v0-3-5-codex-disabled-honor.plan.md](../plans/v0-3-5-codex-disabled-honor.plan.md) |

## Open Questions

- [ ] short-circuit 주입 위치: codex-invoke.js의 `main()` 진입 직후 vs `dispatch(action)` 분기 직전 vs `spawnCodexCompanion()` 호출 직전 — 가장 좁은 surface 선택 (default candidate: spawnCodexCompanion 직전). `/mccp:plan` Phase 2 GROUND에서 codex-invoke.js call-graph 실측 후 확정.
- [ ] canonical envelope 필드명: `{ classification: 'disabled', verdict: 'skipped', reason: 'codex_disabled', blocking: false }` vs `{ classification: 'codex-disabled', verdict: 'skip', reason: 'env-disabled', blocking: false }` — 기존 11 classification 스키마 일관성 분석 후 결정. (default: 'disabled' / 'skipped' / 'codex_disabled' — STATE.md Open Question 표현과 일치)
- [ ] caller 측 처리: 새 classification을 `ok`-equivalent로 처리하는 분기를 (a) codex-bridge.js 단일 지점에 추가할지 (b) plan-codex / implement-codex / pr-codex 각각에 분기 박을지. (default: codex-bridge.js 단일 — DRY)
- [ ] terminal `/mccp:pr` Phase 0 preflight 처리: 현재 `MCCP_ALLOW_CODEX_UNAVAILABLE=1`을 명시 거부하는데, `disabled` classification은 *unavailable*이 아닌 *intentionally-off* 의미라 거부 룰에서 예외 처리해야 함. F9 mutex preflight (`MCCP_PR_SKIP_CODEX_REVIEW` vs `CODEX_DEDUPE_AT_PR`)와의 상호작용 검증 필요.
- [ ] receipt schema migration: `meta.codex_skip_reason='codex_disabled'` 필드 추가가 기존 v0.2.6-impeccable-fields / v0.2.8-generic-receipt-quarantine migration과 충돌하는지 확인. (default: 새 optional field — backward compat 100%, migration 불필요)
- [ ] dedupe 상호작용: cross-gate dedupe (v0.2.8 PR step 보호) + `codex_dedupe_at_pr=true` 와 `codex_skipped_at_pr=true` 가 동시 만족 가능한지 — disabled mode에서는 의미 모호. 한쪽 우선 정의 필요. (default candidate: disabled가 dedupe보다 우선 — wrapper 단계에서 이미 short-circuit이라 dedupe 평가 자체가 무의미)
- [ ] CLAUDE.md §1.2 receipt-gate-mode 표 + §3.3 classification matrix + §4 운영 토글 cheat sheet 갱신 — 본 milestone scope에 포함할지 별도 docs cycle로 분리할지. (default: 같은 PR에 묶음 — 11→12 classification 변경은 contract surface라 docs 동시 변경이 정상)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 새 `disabled` classification이 기존 11 enum과 의미 중첩 (e.g. `not-authenticated`와 사용자 입장에선 동일) | Low | Medium | classification 의미 분리 명시: `disabled`=intentional, 나머지 11개=involuntary. test로 양쪽 mutex 검증. |
| short-circuit이 너무 일찍 발생해서 receipt write logic을 우회 → 게이트 trace 단절 | Medium | High | short-circuit은 `spawnCodexCompanion()` 직전에만 — caller 측 receipt write는 그대로 호출되도록 envelope를 정상 return. test로 receipt write call 횟수 검증. |
| terminal `/mccp:pr` preflight의 advisory mode 거부 룰을 예외로 뚫는 게 다른 fail-closed 경로(예: `companion-not-found`)에도 새는 hole 생성 | Low | High | 거부 예외는 `classification === 'disabled'` exact match로만 — 다른 11개 classification은 기존 그대로 거부. test에 negative case (예: `disabled` 외 classification + advisory mode) 포함. |
| codex-bridge.test.js 기존 fixture (v0.3.4 hygiene으로 정리된) 가 새 classification 진입 후 다시 leak class 회귀 | Medium | Medium | 새 test도 v0.3.4 canonical env snapshot/restore 패턴 inline 적용. PR 전 `MCCP_CODEX_DISABLED=1` shell full suite delta 재측정. |
| sole user (skypark207) 가 wrapper-level fix 적용 후 자기 memory rule ("auto-apply MCCP_PR_SKIP_CODEX_REVIEW") 와 충돌해 이중 우회 발생 | Medium | Low | 사용자 memory rule이 disabled honor 적용 후 redundant해짐 — PRD report 작성 시 memory revision 권고 명시. |
| Codex permanent bypass + receipt gate off 환경에서 chain cross-validation이 약화된 상태로 wrapper contract surface 수정 수행 | Low | Medium | 사용자 영구 합의 ([feedback-codex-permanent-bypass](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-permanent-bypass.md)). Codex 정상 사용자 영향 zero(M5 metric)를 mechanical test로 보완 — wrapper unit test + caller integration test 양축. |
| Hypothesis 가 codex-invoke.js의 실제 call-graph와 어긋남 (예: `spawnCodexCompanion()`이 단일 지점 아닌 다중 분기) | Low | Medium | `/mccp:plan` Phase 2 GROUND가 grep으로 call-site 실측. 실측이 hypothesis와 충돌하면 PRD revision으로 자가 보정 (v0.3.4 PRD 패턴 답습). |

## Design Direction

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill은 mccp 번들 외 — CLAUDE.md §1.1 fork-lineage 결정대로 user-level 별도 설치 대상. 본 PRD는 codex-invoke.js wrapper 행동 변경 + receipt schema field 추가 + caller integration으로 UI/visual surface 없음 — detect의 `design_signal=true`는 본 PRD 자신의 `## Design Direction` 헤더 keyword가 trigger한 false positive로 판정. downstream `/mccp:plan` Phase 5.0에서도 동일 fallback path.)

---

*Status: **DRAFT — USER INPUT MISSING (Phase 2-3 assistant-drafted; user delegated full content via "claude한테 답변 받아 / 모두 claude에게 맡김" — Phase 0 rule #4 second refusal). Phase 1 Problem/Users/Why-now는 user-confirmed via "그대로 진행" — assistant-proposed 표 채택. Hypothesis/Evidence/Metrics/MVP/Out-of-scope/Open Questions/Risks는 Phase 1 confirmed content 위에서 derive.***
*Co-created with user on 2026-06-10.*
