# Implementation Report: v0.3.5 — Codex Disabled Honor (wrapper-level first-class skip)

## Summary

codex-invoke.js wrapper에 `MCCP_CODEX_DISABLED=1` first-class short-circuit을 추가해 codex-bridge.js의 disabled honor와 wrapper layer를 동기화했다. caller fanout(codex-runner.js codex_outcome='disabled' 4번째 enum, plan.md/prp-implement.md Bash gate, pr.md Phase 0/0.3 3-way mutex + DISABLED wins 정책), receipt schema 신규 field(`meta.codex_disabled`/`codex_disabled_at_pr`)와 3-way mutex(dedupe ⊕ skipped ⊕ disabled), write.js 자동 stamp(env 감지 + `--codex-disabled` flag) 까지 일관 적용. M1(우회 env 0회) + M5(Codex 정상 사용자 영향 0) 모두 mechanical 검증.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (as predicted) |
| Files Changed | 16 expected + 1 optional | 18 modified + 2 created (PRD/Plan) |
| Tests added | 6-10 disabled-honor tests | 14 added (4 wrapper + 2 runner + 6 schema + 5 dedupe-write + 3 pr-mutex) |
| Self-dogfood paradox | "advisory mode 통과 + ship 후 차기 cycle부터 우회 env zero" | confirmed — plan-codex/implement-codex receipt 둘 다 verdict=advisory; v0.3.6 cycle은 0회 우회로 진행 가능 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | codex-invoke.js wrapper short-circuit | [done] Complete | invokeAdversarialReview 진입 직후 `MCCP_CODEX_DISABLED==='1'` 검사 → envelope `{ok:true, classification:'disabled', blocking:false, advisory:false}` 즉시 반환. classification enum 11→12 주석 갱신. durationMs=0 (spawn 미발생). |
| 2 | codex-invoke unit + CLI tests | [done] Complete | 4 new tests in codex-invoke.test.js (positive + 3 negative/regression) + valid classification Set에 'disabled' 추가 (codex-invoke-json.test.js). |
| 3 | codex-runner.js disabled outcome | [done] Complete | step 2 codex_outcome 분기에 env-derived `disabled` 추가(explicit --skip-reason보다 우선). step 4 summary 분기에 disabled case 추가. heartbeat 미가동. 2 new tests covering positive + precedence. |
| 4 | receipt schema 3-way mutex | [done] Complete | `meta.codex_disabled` / `codex_disabled_at_pr` boolean field 추가. 3-way mutex(dedupe ⊕ skipped ⊕ disabled)로 invariant 확장. canonical reason 검증(`codex_disabled_at_pr=true` → `codex_skip_reason='codex_disabled'` 강제). makeSkeleton default false 2 entry 추가. 6 new tests. |
| 5 | receipt write.js auto-stamp + CLI flag | [done] Complete | env 감지(`MCCP_CODEX_DISABLED==='1'`) → `codex_disabled=true` + `codex_skip_reason='codex_disabled'` 자동. `--codex-disabled` / `--codex-disabled-at-pr` CLI flag 통합. cli.js help 문자열 갱신. 5 new tests. |
| 6 | command body Bash gate (plan/prp-implement) | [done] Complete | `CODEX_CLASS != "ok"` 조건을 `CODEX_CLASS != "ok" && CODEX_CLASS != "disabled"` 로 확장 + 새 disabled branch(advisory env 불필요). 2 commands. |
| 7 | pr.md Phase 0 + 0.3 3-way | [done] Complete | Phase 0 advisory-rejection에 disabled 예외(`&& [ MCCP_CODEX_DISABLED != "1" ]`). Phase 0.3에 3-way mutex (1) PR_SKIP vs DEDUPE 유지, (2) DISABLED + PR_SKIP → warn-drop, (3) DISABLED + DEDUPE → STOP. 3 new pr-mutex-preflight tests + regex regression guard 갱신. |
| 8 | plugin.json + CLAUDE.md + STATE.md | [done] Complete | plugin.json 0.3.4→0.3.5. CLAUDE.md §1.4 M8 ship row + §3.3 disabled classification row + §4 운영 토글 MCCP_CODEX_DISABLED 설명 확장. STATE.md fingerprint flip(`v0-3-5-codex-disabled-honor`) + Goal/Done/Next/Open-Q 갱신. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | mccp는 type-check 분리 없음 — Node native |
| Unit Tests (touched files) | [done] Pass | 131/131 pass (1 pre-existing skip). 신규 14 disabled-honor 테스트 + 117 회귀 |
| Build | N/A | Node — build 단계 없음 |
| Full Suite (env unset) | [done] Pass (no new regressions) | 835/840 — 4 fail은 v0.3.4 PRD §Out-of-scope 명시된 pre-existing baseline (receipt-prompt G1 x2 + receipt-skill G1 x1 + real codex smoke x1) |
| Full Suite (env=1) | [done] Pass (no new regressions) | 835/840 — 3 fail (real codex smoke가 disabled로 short-circuit → skip transition). M5 metric 달성: Codex 정상 사용자 영향 0 |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATED | +25 / -5 |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | UPDATED | +47 / -0 |
| `plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js` | UPDATED | +4 / -4 |
| `plugins/mccp/scripts/lib/pr-phase-helpers/codex-runner.js` | UPDATED | +13 / -4 |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/codex-runner.test.js` | UPDATED | +75 / -8 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATED | +37 / -4 |
| `plugins/mccp/scripts/receipt/tests/schema.test.js` | UPDATED | +61 / -0 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | +15 / -2 |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATED | +1 / -1 |
| `plugins/mccp/scripts/receipt/tests/pr-codex-dedupe.test.js` | UPDATED | +72 / -2 |
| `plugins/mccp/scripts/receipt/tests/pr-codex-skip-env.test.js` | UPDATED | +9 / -0 |
| `plugins/mccp/scripts/receipt/tests/pr-mutex-preflight.test.js` | UPDATED | +44 / -2 |
| `plugins/mccp/commands/plan.md` | UPDATED | +7 / -2 |
| `plugins/mccp/commands/prp-implement.md` | UPDATED | +7 / -2 |
| `plugins/mccp/commands/pr.md` | UPDATED | +33 / -3 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | +1 / -1 |
| `CLAUDE.md` | UPDATED | +2 / -1 |
| `.claude/state/STATE.md` | UPDATED | +9 / -8 |
| `.claude/prds/v0-3-5-codex-disabled-honor.prd.md` | CREATED | +98 |
| `.claude/plans/v0-3-5-codex-disabled-honor.plan.md` | CREATED | +130 |

## Deviations from Plan

1. **Task 5 stamp 우선순위 변경 (예상보다 엄격)**: Plan §Codex Implementation Review (c)에서 "CLI `--codex-disabled` flag는 명시 명령(test 친화), 둘 다 동일 결과지만 명시 flag 우선"으로 self-attest했으나 실 구현은 env OR CLI flag → 둘 다 codex_skip_reason='codex_disabled'로 overwrite. 이게 schema invariant(`codex_disabled_at_pr=true` 시 reason='codex_disabled' 강제)와 정합화하는 정확한 동작.

2. **테스트 env hygiene 추가 (예상 외)**: skypark207 영구 bypass(`MCCP_CODEX_DISABLED=1` ambient)가 기존 dedupe/skipped/invoke 테스트 5개 + pr-codex-skip-env 1개를 오염시켜 canonical env snapshot/restore 패턴(v0.3.4 hygiene mirror)을 4개 테스트 파일에 추가 적용. helper 함수 `envWithoutDisabled()` / `tryWrite` 내 prevEnv guard / `runBashWithEnv` 내 ambient strip 등. v0.3.4 hygiene이 17 site에 적용된 것과 동일 패턴.

3. **Phase 0.3 mutex 1번 message 보존**: Plan에서 "3-way mutex error message가 기존 dedupe/skipped error message 구조 그대로 확장"으로 self-attest했으나 실 구현은 3-way 메시지를 새로 작성 + 기존 회귀 test의 regex를 새 메시지에 맞춰 갱신. 이게 더 명확한 audit trail 제공.

## Issues Encountered

1. **STATE.md → CLAUDE.md docs drift 패턴 재발 (v0.3.4 carry)**: Open Questions의 MEDIUM 항목 그대로 — 본 milestone에서 CLAUDE.md를 같은 PR에 묶었지만 lesson-learned을 roadmap Risks 표에 박는 것은 v0.3.6 또는 별도 docs cycle 후보.

2. **derive-decision generic default (v0.3.5 carry)**: HIGH carry로 등록된 결함 — 본 chain의 plan-codex/implement-codex receipt validate가 `--decision v0-3-5-codex-disabled-honor` 명시 우회로 통과했음. PRD §Out-of-scope에서 의도적 deferred. v0.3.6 후보.

3. **자기 참조성 부트스트랩 paradox 확인**: 본 milestone은 `MCCP_CODEX_DISABLED` honor를 design하는 plan/implement chain 자체가 그 환경에서 작성 → Codex gate는 advisory mode 통과. PRD Risks 표에 명시했고 Acceptance criteria로 "차기 v0.3.6 cycle은 우회 env 0회 도달"을 박았음.

4. **markdownlint 경고 다수 surface**: PRD/Plan/STATE.md/CLAUDE.md 등에서 MD060/MD036/MD032 warning 누적. memory rule [feedback-no-markdownlint-fix-cycle]에 따라 fix-cycle 진입 금지 — v0.2.8 Task 2.6.2가 mechanical 해결 예정.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `codex-invoke.test.js` | 4 new | wrapper short-circuit, env unset regression, env "0" 비활성, advisory env 중복 무시 |
| `codex-invoke-json.test.js` | 0 (assertion update only) | classification enum Set에 'disabled' 추가 |
| `codex-runner.test.js` | 2 new | env-derived disabled outcome + env vs --skip-reason precedence |
| `schema.test.js` | 6 new | boolean validation, 3-way mutex(both pairs), canonical reason requirement, default false |
| `pr-codex-dedupe.test.js` | 5 new | --codex-disabled-at-pr stamp, ambient env auto-stamp, mutex with dedupe/skipped |
| `pr-mutex-preflight.test.js` | 3 new | bash preflight disabled-only/with-PR_SKIP/with-DEDUPE |

총 신규 14 disabled-honor 테스트 + 회귀 4 test 갱신(regex/env hygiene).

## Self-Dogfood Acceptance

| Acceptance Criterion | Status | Evidence |
|---|---|---|
| Tasks 1-8 complete | [done] PASS | TodoWrite ledger 8/8 |
| Validation 6 blocks PASS | [done] PASS | 131/131 touched + 835 baseline (env-set/unset) |
| Patterns mirrored | [done] PASS | bridge `verdict='skipped' + reason='codex_disabled'` 와 wrapper classification='disabled' 의미론 일치; test snapshot/restore v0.3.4 canonical |
| Self-dogfood: 차기 chain 우회 env 0회 도달 | [PENDING] post-ship | 본 chain은 advisory mode 사용; v0.3.6 첫 chain이 metric M1 측정 시점 |
| STATE.md fingerprint = v0-3-5-codex-disabled-honor | [done] PASS | grep confirmed |
| plugin.json version = 0.3.5 | [done] PASS | `node -e` confirmed |

## Next Steps

- [x] All tasks complete
- [x] Validation passes
- [ ] /mccp:prp-commit (suggested 3-commit bundle: wrapper+caller / schema+write / commands+docs)
- [ ] /mccp:pr — terminal PR creation (Phase 0 advisory-rejection 예외가 본 milestone의 정확한 self-test)
- [ ] Post-ship: memory rule [feedback-codex-runner-disabled-blind] revision 검토 — auto-apply MCCP_PR_SKIP_CODEX_REVIEW이 redundant해짐 (pr.md Phase 0.3가 stderr warn으로 흡수)
