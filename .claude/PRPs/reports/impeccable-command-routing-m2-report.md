# Implementation Report: Stage-Aware impeccable Command Routing (M2)

## Summary
M1 routing oracle에 Extended Refine/Simplify/Harden 카탈로그 10개 명령을 추가하고, auto 모드 fan-out 비용을 content 기반 positive-presence 선별로 제어했다. mood/direction 명령은 recommend-only base + 4중 AND audited intent 승격. Codex 2-round(plan F1/F2/F3 + implement [0]/[1]) 전부 R1 absorb.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | oracle 카탈로그 + 선별 + intent | done | STAGE_ROUTING implement 14 / pr 5 / guide 18, extractDiffSignals, selectByDiffSignals, parseIntentCommands |
| 2 | oracle 테스트 확장 | done | 13 신규 case, 총 25 PASS |
| 3 | prp-implement diff-signal forward | done | tracked+untracked 단일 셋 + zero-signal fail-open omission (Implement [0]) |
| 4 | plan/plan-prd guide + pr recommend | done | 모두 routeCommands 동적 → 자동 전파. plan.md 예시 표만 갱신 |
| 5 | 문서 | done | CLAUDE.md §3.10 M2 + §4 intent env + CHANGELOG |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| oracle tests | PASS | 25/25 |
| receipt fields | PASS | 5/5 |
| schema | PASS | 통합 78/78 |
| full lib regression | PASS* | 612 중 608 pass / 1 fail / 3 skip. 유일한 fail은 `design-critique-loop-e2e.test.js`의 fixture(`.claude/cache/test-fixture-status.html`) 부재 — 별개 design-gate milestone 환경 의존, 본 M2와 무관(M1 report에 이미 기록) |

## Codex Findings (2-round, all R1-absorbed)

- Plan F1 (HIGH): untracked 새 UI 파일 누락 → all-false forward로 잘못 강등. → untracked 포함 + fail-open omission.
- Plan F2 (MED): 정규식 Tailwind/CSS-in-JS 미커버. → regex 확장 + fixture 테스트.
- Plan F3 (MED): mood recommend-only가 audited intent 무시. → intentCommands + MCCP_IMPECCABLE_INTENT_COMMANDS 4중 AND.
- Implement [0] (HIGH): detector/renderingSurface/extractDiffSignals 비일관 → untracked greenfield 우회. → 단일 셋 도출 + greenfield trigger gap 문서화(designIntentActive escape).
- Implement [1] (MED): routeCommands 반환에 내부 signal 노출. → 반환 schema 안정화(signal strip) + exact-key 테스트.

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/impeccable-routing.js` | UPDATED |
| `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js` | UPDATED |
| `plugins/mccp/commands/prp-implement.md` | UPDATED |
| `plugins/mccp/commands/plan.md` | UPDATED |
| `CLAUDE.md` · `CHANGELOG.md` | UPDATED |
| `.claude/prds/impeccable-command-routing.prd.md` | UPDATED (M2 → complete) |

## Deviations from Plan
- plan-prd.md / pr.md: 계획엔 UPDATE로 적혔으나 둘 다 `routeCommands`를 동적 호출·iterate하므로 oracle 변경만으로 신규 명령이 자동 전파 — 코드 편집 불필요(범위 축소, 확장 아님).
- plugin.json: M2에서 미변경 — PR #55 merge 시 main(1.15.0)과 forward-only reconcile(≥1.16.0).

## Next Steps
- [ ] M3 (System 명령 document/extract + a11y-architect auto-invoke 전환)
- [ ] PR #55 conflict 해소 + merge
