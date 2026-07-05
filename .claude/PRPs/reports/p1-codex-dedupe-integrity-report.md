# Implementation Report: P1 — Codex dual-review 무결성 복구 (cross-gate dedupe false-skip)

## Summary

cross-gate dedupe가 PR-step Codex skip 여부를 실제 Codex verdict가 아니라 receipt-write 시
항상 `true`로 default되던 `resolution.converged`로 판정하던 결함을 닫았다. Option B(fail-closed)로
신규 present-only 필드 `resolution.codex_verdict`(enum `converged|divergent|critical|unavailable|skipped`)를
추가하고, dedupe skip 조건을 `residual empty AND plan-codex codex_verdict==='converged' AND
implement-codex codex_verdict==='converged'`로 강화했다. 부재(구 receipt)·divergent·기타 값은
모두 fail-closed → PR-Codex 실행. 무테스트였던 `evaluateForDedupe`에 회귀 6건 신설.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (예상대로) |
| Files Changed | 12 (+CLAUDE.md optional) | 16 (12 계획 + cli.js help + 2 test 동반 + i18n test) |
| Round | R1 converged (cap=1) | Cross-gate dedupe applied (plan-codex 수렴) |

계획 대비 추가된 4개 파일은 전부 계획된 source 변경의 자연스러운 동반물(신규 flag용 CLI help,
finalize/renderer 변경에 대응하는 test 동기) — 새 아키텍처 결정 없음.

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | schema.js `resolution.codex_verdict` enum | 완료 | present-only, `CODEX_VERDICT_VALUES` export |
| 2 | write.js `--codex-verdict` 수용 | 완료 | 미전달 시 필드 omit(fail-closed), receipt_hash 봉인 유지 |
| 3 | dedupe.js fail-closed 검사 | 완료 | `codexConverged` helper, convergence 블록에 raw verdict 노출 |
| 4 | finalize-receipt verdict forward | 완료 | `codex_outcome→codex_verdict` 매핑(invoked→converged 외 skipped) |
| 5 | command body `$CODEX_VERDICT` 전용 변수 | 완료 | plan.md + prp-implement.md, design-critique `$RECEIPT_VERDICT`와 분리 |
| 6 | evaluateForDedupe 회귀 테스트 | 완료 | 6건(codexConverged + 5 시나리오), write→read→dedupe 전체 경로 |
| 7 | pr.md stale `CODEX_DEDUPE_AT_PR` 하드닝 | 완료 | 진입 시 hard-reset(unset) + 현재 skip_safe===true에서만 재-export |
| 8 | version + footer + CHANGELOG | 완료 | plugin.json 1.20.3 + footer 2곳 + i18n test + CHANGELOG row |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 별도 lint/typecheck config 없음(순수 JS, node --test 기반) |
| Unit Tests | 통과 | 아래 참조 |
| Build | N/A | 빌드 스텝 없음(Node 20+ 런타임 직접 실행) |
| Integration | 통과 | CLI `dedupe` 서브커맨드 end-to-end 스모크 |
| Edge Cases | 통과 | 구 receipt(verdict 부재) fail-closed, invalid verdict SCHEMA_INVALID |

테스트 스위트:
- `receipt/tests/*.test.js` — 413 tests, 412 pass, 0 fail, 1 skip (기존 skip)
- `lib/tests/pr-phase-helpers/*.test.js` — 43 tests, 42 pass, 0 fail, 1 skip
- `lib/renderer/tests/*.test.js` — 665 tests, 665 pass, 0 fail

CLI end-to-end 스모크(pr.md 실제 호출 경로):
- 양쪽 converged → `skip_safe=true` (dedupe 적용)
- 한쪽 divergent → `skip_safe=false` (PR-Codex 실행 — 버그 fix)
- verdict 부재(구 receipt 시뮬) → `skip_safe=false` (fail-closed — 버그 fix)
- parseVerdict 관용구: APPROVE→converged, REJECT→divergent, empty→unavailable (전부 유효 enum)

### Design Grounding (v1.18.22)

Design Grounding: N/A (no design trigger). 변경 파일은 receipt/lib JS + command markdown + version 문자열로
rendered design surface(`.tsx/.css/.html/.claude/cache/*.md`) 미포함. SIGNAL=0 → 캡처/lint no-op.

## Files Changed

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `resolution.codex_verdict` optional enum + export |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `--codex-verdict` 수용 → resolution 반영(omit-when-absent) |
| `plugins/mccp/scripts/receipt/dedupe.js` | UPDATE | `evaluateForDedupe` fail-closed + `codexConverged` helper |
| `plugins/mccp/scripts/lib/pr-phase-helpers/finalize-receipt.js` | UPDATE | codex_outcome→codex_verdict forward |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | write help에 `--codex-verdict` 노출 |
| `plugins/mccp/commands/plan.md` | UPDATE | Phase 5.2 `$CODEX_VERDICT` 도출 + 5.6 forward |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | Phase 2.5.3 `$CODEX_VERDICT` 도출 + 2.5.6 forward |
| `plugins/mccp/commands/pr.md` | UPDATE | Phase 2.5.2 stale env hard-reset + convergence 설명 갱신 |
| `plugins/mccp/scripts/receipt/tests/dedupe.test.js` | UPDATE | evaluateForDedupe 회귀 6건 |
| `plugins/mccp/scripts/lib/tests/pr-phase-helpers/finalize-receipt.test.js` | UPDATE | codex_verdict 매핑 테스트 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.20.2 → 1.20.3 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer v1.20.3 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer v1.20.3 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer version 스냅샷 v1.20.3 |
| `CHANGELOG.md` | UPDATE | 1.20.3 row |
| `CLAUDE.md` | UPDATE | §1.2 dedupe 조건을 codex_verdict 기준으로 정정 |

## Deviations from Plan

1. **plan 본문 `## Codex Implementation Review` dedupe 마커 미추가**: Phase 2.5.1은 dedupe 적용 시
   plan 본문에 마커를 append하도록 하나, append가 plan 구조 해시를 바꿔 prior mccp-plan-codex
   receipt를 stale로 만들었다(자기유발 hash churn). dedupe 사실은 mccp-implement-codex receipt
   (cross-gate dedupe applied + `codex_verdict=converged`) + 본 리포트에 기록됨 — plan 본문은 원본 유지.
2. **파일 4개 추가**(WHAT: cli.js help / finalize·i18n·finalize test 동기, WHY: 신규 flag·source 변경의
   필수 test/doc 동반물) — 계획된 아키텍처 밖 확장 아님.

## Issues Encountered

- `node --test <directory>` 가 Node 24에서 디렉토리를 모듈로 해석(ENOENT) — glob 패턴(`*.test.js`)으로 우회.
- Phase 2.5.1 plan-body append → plan-codex receipt stale → append revert + receipt 원본 plan 기준 재작성으로 해소(최종 validate exit=0).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `receipt/tests/dedupe.test.js` | +6 | codexConverged fail-closed + evaluateForDedupe(양쪽 converged/한쪽 divergent/verdict 부재/plan receipt 부재/residual 존재) |
| `lib/tests/pr-phase-helpers/finalize-receipt.test.js` | +1, ~2 갱신 | codex_outcome→codex_verdict 매핑 |

## Acceptance (plan §Acceptance 대조)

- [x] 양쪽 게이트 divergent 시 PR-Codex가 skip되지 않음(회귀 테스트 + CLI e2e로 증명)
- [x] 구 receipt(필드 부재)에서 fail-closed(skip 안 함)
- [x] evaluateForDedupe 테스트 커버리지 신설(6건)
- [x] 전체 관련 테스트 green(receipt/pr-phase-helpers/renderer)
- [x] plugin.json 1.20.3 + footer 2곳 + CHANGELOG 동기
- [x] receipt_hash 무결성 유지(write 후 validate green + smoke로 봉인 확인)
- [x] stale `CODEX_DEDUPE_AT_PR=1`이 fail-closed를 우회 못 함(pr.md hard-reset + evaluateForDedupe fail-closed 이중 방어)
- [x] `--codex-verdict`가 design-critique `$VERDICT`와 분리된 변수(`$CODEX_VERDICT`)에서 도출

## Next Steps

- [ ] `/mccp:code-review` 로 변경 리뷰
- [ ] `/mccp:prp-commit` 로 커밋 (16개 파일)
- [ ] `/mccp:pr` 로 PR 생성 (implement-codex receipt chain 준비 완료 — validate exit=0)
