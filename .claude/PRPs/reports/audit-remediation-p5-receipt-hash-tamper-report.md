# Implementation Report: receipt_hash tamper-detect 실연결 (audit-remediation P5)

## Summary

`validate-cmd.js`에 `receiptHash()` 재계산·비교를 추가해, 서명 후 `findings`·`resolution`·`meta` 변조(특히 P1이 복구한 dual-review 무결성 필드 `resolution.codex_verdict`)를 실제로 탐지한다. 기존 `subject_hash` 블록을 그대로 미러링하되, Codex R1 F1 흡수로 `stale`이 아닌 `blocking(kind='receipt-tamper')`로 분류해 preflight의 "regenerate STALE" 복구 가이드(변조 증거 소실 위험)를 피하고 전용 `TAMPER` 조사 라인을 받게 했다. write/validate가 동일 `hash.js#receiptHash()`를 호출하므로 `briefing_*`·`ledger_write_skipped` carve-out parity가 구조적으로 보장된다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (핵심 로직 +24 LOC) |
| Files Changed | 9 (+backlog/PRD) | 11 tracked + plan |
| 신규 hash 로직 | 0 (기존 함수 재사용) | 0 — `receiptHash` import만 추가 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | validate-cmd.js tamper 체크 | ✅ Complete | subject_hash 직후 삽입, `kind='receipt-tamper'` blocking. classify.js가 tempfail만 특수 처리 → exit 2 확인 |
| 2 | 회귀 테스트 | ✅ Complete | validate-cmd 6 + preflight 1 신규. 기존 `meta.advisory` 테스트 receipt_hash 재봉인 정정 |
| 3 | 현존 receipt 전수 sweep | ✅ Complete | 17개 중 16 검사, **mismatch=0** (1개 receipt_hash 부재 legacy) |
| 4 | 버전 bump 하우스키핑 | ✅ Complete | plugin.json/html.js/markdown.js/i18n-test 1.20.9 동기, CHANGELOG row |
| 5 | PRD status 정합 | ✅ Complete | P5 complete + P2/P3/P4 in-progress drift→complete fold |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Unit Tests (receipt) | ✅ Pass | 420 tests, 419 pass, 0 fail, 1 skip(기존) |
| Unit Tests (renderer i18n) | ✅ Pass | 10/10 (footer 버전 동기) |
| Unit Tests (renderer a11y/overview) | ✅ Pass | 26/26 (footer landmark 무영향) |
| Version consistency | ✅ Pass | 전 surface 1.20.9, stray 1.20.8 = 0 |
| Existing-receipt sweep | ✅ Pass | mismatch=0 (오탐 부재 경험적 확인) |
| Happy-path smoke | ✅ Pass | 현재 chain validate ok=true (정상 경로 미파괴) |
| Build / Integration | N/A | JS·no-build 프로젝트 |

### Design Grounding (v1.18.22)

Design Grounding: N/A — cross-gate dedupe로 2.5.5b/2.5.5c(design detector/capture)가 skip돼 capture artifact 부재. footer 버전-string bump은 rendered surface 미도입(control-plane) → Phase 3.6/3.7 no-op 확인.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATED | +24 — receiptHash import + tamper 블록 |
| `plugins/mccp/scripts/receipt/preflight.js` | UPDATED | +14 — TAMPER 라벨 + 조사 복구 라인 |
| `plugins/mccp/scripts/receipt/tests/validate-cmd.test.js` | UPDATED | +134 — tamper 탐지/오탐 방지 6 + advisory 재봉인 정정 |
| `plugins/mccp/scripts/receipt/tests/preflight.test.js` | UPDATED | +27 — TAMPER surface 테스트 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.20.8 → 1.20.9 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | footer v1.20.9 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer v1.20.9 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer assertion v1.20.9 |
| `CHANGELOG.md` | UPDATED | `[1.20.9]` row |
| `.claude/prds/audit-remediation-followup.prd.md` | UPDATED | P5 complete + P2/P3/P4 drift fold |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | subject_hash 잠복 결함 deferral(plan 단계 append) |

## Deviations from Plan

- **plan 아카이브 안 함**: 본 PRD(audit-remediation)는 P2/P3/P4처럼 plan을 `.claude/plans/`에 유지(PRD Plan 셀이 해당 경로 참조). 아카이브 시 `/mccp:pr` chain 검증이 plan 경로 재해시에서 stale/missing이 됨.
- **recovery + dedupe 상호작용**: Phase 0.0 informational recovery가 missing plan-codex receipt를 dedupe edit **전에** 봉인 → dedupe note 주입으로 plan_hash 변동. plan-codex receipt를 현재 plan(implement 진입 최종 상태)에 재앵커해 2.5.7 통과. dedupe note는 게이트 기계적 주입(실질 plan 내용 무변경)이라 정합.

## Issues Encountered

- **테스트 회귀 1건 (예측·해결)**: 기존 `meta.advisory` 테스트가 body 변조 후 subject_hash만 재서명 → 새 receipt_hash 체크가 tamper로 선점. 정당한 advisory receipt를 시뮬레이션하도록 receipt_hash도 재봉인하여 해결.
- **findings 주입 스키마 실패 (해결)**: 초기 tamper-findings 테스트가 스키마 위반 finding 주입 → "schema invalid"가 선점. schema-valid finding(severity/area/description)으로 교체.
- **Node 24 `--test <dir>` 회귀**: 디렉토리 인자를 모듈 resolve → glob(`*.test.js`)로 전환.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/validate-cmd.test.js` | +6 | findings/resolution.codex_verdict/meta.command 탐지 · subject-우선 회귀 · briefing·ledger carve-out 오탐 방지 · grounding restamp 오탐 방지 |
| `tests/preflight.test.js` | +1 | tamper-only → TAMPER 라벨 + 조사 라인 + "regenerate STALE" 부재 |

## Next Steps

- [ ] `/mccp:prp-commit` — 변경 커밋 (P5 코드 + 버전 bump + PRD/backlog fold)
- [ ] `/mccp:pr` — PR 생성 (⚠️ PR-Codex 게이트가 Codex 재호출 — 현재 세션에서 Codex timeout 관측됨. advisory mode 또는 dedupe 조건 재확인 필요)
