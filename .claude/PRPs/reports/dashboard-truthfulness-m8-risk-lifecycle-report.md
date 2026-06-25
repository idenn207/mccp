# Implementation Report: 대시보드 위험 lifecycle-scope (Dashboard Truthfulness M8)

## Summary

위험 active 필터가 출처 plan의 lifecycle을 무시(`!r.resolved`만 봄)해 완료/은퇴 plan의 미마커 historical 위험이 live count를 부풀리던 진실성 결함을 닫았다. 각 위험에 parse-time `sourceClosed` 플래그를 부여(planStatuses complete/dropped + terminal-receipt-fresh + `ledgerCloseFresh` strict 재사용)하고, risks 섹션을 resolved-first 우선순위 3-버킷(미해결·완화됨·이력)으로 분리. rail·섹션·md가 동일 active 필터(`!resolved && !sourceClosed`)를 공유해 reconcile. 위험-숨김은 **fresh 증거만** 인정해 reopened/edited plan의 신규 위험이 stale ledger close로 사라지지 않도록 under-claim 안전을 보장(Codex F1).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 12 | 14 (+i18n-surface.test.js 결합, +codex-findings-backlog.md 게이트 자동) |
| 신규 dep | 0 | 0 (isMilestoneClosed/ledgerCloseFresh 모두 기존 import) |
| 위험 버킷 (실물 렌더) | 미해결 23 · 이력 36 · 완화됨 243 | 미해결 18 · 이력 47 · 완화됨 243 |

M8 이전이면 active = 64(전부)로 집계됐을 것. 초기 렌더는 미해결 28 / 이력 36이었으나, 사용자 검증 중 m3-stale-audit(PR #63 머지 complete)이 미해결에 남는 false-positive 발견 → 근본 원인은 PRD 마일스톤 표의 escaped pipe(`\|`)가 `parseTableRows` 컬럼 분리를 깨 완료 plan lifecycle 미검출. follow-up 파서 수정 후 **미해결 18 · 이력 47**로 정정(escaped-pipe로 드롭되던 위험 행 1건도 복구돼 총 307→308). 미해결 18 = pipeline-chart-m3(6, 타 사이클 미완료) + m7(7) + m8(5, 본 plan).

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | parse-time `sourceClosed` 스탬프 (plan-body.js) | Complete | per-plan Map 캐시 `sourcePlanClosed`, 3-경로 fresh-evidence |
| 2 | 정규화 seam (resolution-classify.js) | Complete | `r.sourceClosed = !!r.sourceClosed` (resolved 미러) |
| 3 | 3-버킷 + 이력 탭 (risks.js) | Complete | additive 탭(historical>0 gate), md `<details>` 동등본 |
| 4 | rail 필터 정합 (status-grid.js) | Complete | `&& !r.sourceClosed`, M6→M8 주석 종료 |
| 5 | negative test + reconcile invariant | Complete | parse-level 3종 + reopened F1 regression(ledger/terminal) + 3-버킷 negative + full-render reconcile |
| 6 | version bump + footer 동기 + PRD 행 | Complete | 1.18.11→1.18.12 (plugin.json + html.js + markdown.js + i18n 테스트), PRD 행 #8 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 프로젝트 type-check/lint 스크립트 없음 (node 직접) |
| Unit Tests | Pass | renderer 510 + derive 87 = 597 PASS, 0 fail |
| Build | N/A | 빌드 단계 없음 |
| Integration | Pass | render-integration reconcile invariant(rail==section activeCount, verdict 불변) |
| Edge Cases | Pass | reopened-plan(stale ledger/terminal hash) under-claim, unknown lifecycle fail-open, historical-only 탭 |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATED | +50/-3 |
| `plugins/mccp/scripts/lib/renderer/parsers/resolution-classify.js` | UPDATED | +7/-2 |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATED | +49/-16 |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATED | +8/-3 |
| `plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` | UPDATED | +127 |
| `plugins/mccp/scripts/lib/renderer/tests/sections.test.js` | UPDATED | +39 |
| `plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js` | UPDATED | +15 |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATED | +59 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | +2/-2 (footer 버전 결합) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | version bump |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | footer v1.18.12 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer v1.18.12 |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATED | Delivery Milestones 행 #8 |

## Deviations from Plan

1. **미해결 카운트 23→28 (데이터 드리프트, 코드 결함 아님)**: plan 작성 시점 대비 `.claude/` 위험 데이터 증가. 이력 36(버그 대상)·완화됨 243은 예측대로. sourceClosed split 메커니즘은 정확.
2. **plan completed/ 미아카이브 (의도적)**: 일반 prp-implement 템플릿은 plan을 `completed/`로 이동하나, 본 프로젝트는 PRD Delivery Milestones 행이 `.claude/plans/`를 참조하고 receipt chain이 plan path에 묶이므로 plan을 `.claude/plans/`에 유지(M1~M7 동일 컨벤션).
3. **i18n-surface.test.js 추가 변경 (결합 필요)**: plan의 Files to Change엔 없으나 해당 테스트가 footer 버전을 단언(version-coupled) → 1.18.11→1.18.12 동기 불가피. 범위 내 minor 확장.

## Issues Encountered

- Phase 2.5.7 read-back validate에서 plan-codex receipt stale 검출 — dedupe note(`## Codex Implementation Review`) append로 plan hash 변경됨. plan-codex receipt를 현재 hash로 재stamp 후 chain clean. (informational 복구 경로의 receipt write가 edit 전 hash로 작성됐던 순서 이슈.)
- design-lint H16 (advisory, non-blocking): 위험 본문 em-dash. STATE.md cross-section debt에 기존 명시된 부채 — M8이 도입한 게 아니라 동일 위험이 탭만 이동. 별도 축.
- **Follow-up 파서 수정 (사용자 검증 중 발견·승인)**: `parseTableRows` 가 `inner.split('|')` 로 escaped pipe(`\|`)까지 쪼개 PRD 마일스톤 표의 `a\|b\|c` Outcome 셀이 Status/Plan 컬럼을 밀어 행이 조용히 드롭됐다(완료 plan lifecycle 미검출 → 위험 오집계 근본 원인). `split(/(?<!\\)\|/)` + `\|`→`|` unescape 로 수정. 모든 milestone/risks 파서 공유라 전역 이득. regression test 1건 추가(plan-body-parser.test.js). plan Files to Change 내 파일(plan-body.js)이라 scope 확장 없음.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plan-body-parser.test.js` | +3 | parse-level sourceClosed(complete/dropped/in-progress/unknown), reopened ledger F1, reopened terminal-receipt F1 |
| `sections.test.js` | +2 | 3-버킷 negative(완료 plan 미마커 active 제외 + 이력 탭), historical-only additive |
| `dashboard-overview.test.js` | +1 | rail 위험 셀 sourceClosed 제외 |
| `render-integration.test.js` | +1 | full-render reconcile(rail==section activeCount) + verdict 불변 |

## Next Steps

- [ ] 사용자 시각 검증 — `.claude/cache/status.html` 위험 섹션(미해결 28 / 이력 36 / 완화됨 243 3-탭) 확인 (브라우저 스크린샷 불가 환경)
- [ ] `/mccp:prp-commit` → `/mccp:pr` (PR 전 시각 확인 필수 — cycle 컨벤션)
- [ ] PR merge 후 PRD 행 #8 complete 전환 (또는 M1 completion-ledger auto-detect)
