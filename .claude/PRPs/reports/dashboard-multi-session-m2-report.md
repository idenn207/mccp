# Implementation Report: Dashboard Multi-Session — 멀티세션 대시보드 섹션 (M2)

## Summary

M1이 ship한 derive count-source `model.sources.worktrees`(live cross-worktree 진행 모델)를 소비하는 신규 전용 렌더 섹션 `sections/multi-session.js`를 추가했다. worktree당 1행(진행 요약 + 차단 강조 + self 마커), 행 클릭 시 우측 드로어 상세(`wt:` kind), graceful hide(분리 규칙), STATUS.md plain-text 동등본. 기존 `active-sessions.js`(세션 존재 축)는 무손상 — 신규 섹션은 진행 축으로 병치.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 11 (plan Files to Change) | 11 source/doc + 1 test footer 동기화 |
| Tests | 신규 multi-session + drawer guard | multi-session 16 + drawer 4 신규 (renderer 503→523) |
| Regressions | 0 목표 | 0 (renderer 523/523, derive 114/114) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1+2 | `renderMultiSession` 섹션 본체 + 상태 kind oracle | 완료 | 4-way graceful hide, `worktreeStatusKind`(blocked>degraded>active>idle), self 마커, per-worktree error surface |
| 3 | 드로어 detail `wt:` kind | 완료 | ordinal-우선 detail-id(Impl-F3) + `buildWorktreeDetail`(오류 row, Impl-F2) |
| 4+5 | index/markdown/html 3-point 배선 + 패널/아이콘/CSS | 완료 | sections 9번째 append, 활동 route 패널 맨 앞 span2, `ic-branch`, drawerMap 합류, KIND map `wt`, `.multi-session tr.self` 비-색 tint |
| 6 | 테스트 + 회귀 가드 | 완료 | multi-session.test.js 16 + drawer.test.js 4 |
| 7 | 문서 + 버전 동기화 | 완료 | dashboard-surface.md §2.6, plugin.json 1.18.13, footer ×2, CHANGELOG |
| 8 | impeccable audit/polish | 완료 | 4 Output Constraints 기계 검증 통과 + panel-only design-lint 0 violation |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | 통과 | node syntax · 모듈 로드 OK |
| Unit Tests | 통과 | multi-session 16 + drawer 4 신규, renderer 523/523, derive 114/114 |
| Build | N/A | plugin repo (node native, no build) |
| Integration | 통과 | dogfood `cli.js render` — 3 worktree 패널 렌더, self 마커, footer v1.18.13 |
| Edge Cases | 통과 | scan off / healthy single hide / 0-item degraded notice / unhealthy single / 동일 basename 충돌 0 / raw 마커 안전 렌더 |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/multi-session.js` | CREATED | 섹션 본체 |
| `plugins/mccp/scripts/lib/renderer/tests/multi-session.test.js` | CREATED | 16 test (a–o) |
| `plugins/mccp/scripts/lib/renderer/parsers/drawer-detail.js` | UPDATED | `wt` detailId + `buildWorktreeDetail` |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATED | import + safeSection + sections append |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | destructure + 섹션 + 앵커 + footer v1.18.13 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | destructure + activityPanels + panelIcon + KIND map + drawerMap + CSS + footer v1.18.13 |
| `plugins/mccp/scripts/lib/renderer/tests/drawer.test.js` | UPDATED | wt detailId + builder + KIND map + drawerMap 합류 가드 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer 버전 단언 1.18.12→1.18.13 (버전 bump 부수효과, 계획 외 minor) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.18.12 → 1.18.13 |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATED | §2.6 멀티세션 섹션 소비 계약 |
| `CHANGELOG.md` | UPDATED | [1.18.13] 행 |
| `.claude/prds/dashboard-multi-session.prd.md` | UPDATED | M2 row → complete |

## Codex Implement-Codex 흡수 (R1, 3 finding MEDIUM·ACCEPT_NOW)

- **Impl-F1** 단일 degraded/blocked worktree 무음 hide → hide는 healthy single만, unhealthy single은 1행 테이블 loud (Plan-F1과 동일 loud-fail-open을 1-item에 확장). 테스트 (l).
- **Impl-F2** per-worktree scrubbed `item.error` 유실 → 진행셀/드로어/STATUS.md에 노출, generic 뱃지 collapse 금지. 테스트 (m).
- **Impl-F3** masked path detail-id 충돌 → ordinal-우선 키(`wt:<ordinal>:<path>`)로 동일 basename 충돌 0·leak 0. 테스트 (n).

## Deviations from Plan

- **`i18n-surface.test.js` footer 버전 단언 갱신** (계획 Files to Change 외): plugin.json/footer를 1.18.13으로 bump하면서, 기존 footer v1.18.12를 단언하던 테스트가 깨져 1.18.13으로 갱신. 버전 동기화(Task 7)의 필연적 부수효과 — scope 확장 아님.
- **진행 셀 markdown 안전 렌더 추가** (Impl 보강): milestone_hint가 raw `**`/`` ` ``를 담으면 진행 셀이 raw 마커를 누출(section-level H16)하던 것을, HTML 경로에서 `renderProseHtml`(평문 truncate 후)로 안전 렌더. Output Constraint ③ 보강. 테스트 (o).
- **플랜 아카이브 생략**: mccp 컨벤션(M1 플랜도 `.claude/plans/`에 유지) + 다운스트림 `/mccp:pr` 게이트가 plan_hash를 경로로 재검증하므로 `completed/` 이동 안 함.

## Issues Encountered

- **`.git` worktree 포인터**: worktree에서 `.git`는 파일이라 `mkdir .git/mccp/tmp` 실패 → `git rev-parse --git-dir`로 실제 gitdir 사용([memory: feedback-pr-worktree-gh-first]).
- **plan-codex receipt stale**: Codex finding 흡수로 plan body 편집 → plan_hash 변경 → plan-codex receipt stale. 리뷰 실질 불변이므로 현재 hash로 재-stamp(converged verdict 보존, §3.1 복구).
- **design-lint H4**: 초기 self 행 side-stripe(`box-shadow inset 3px`)가 H4 absolute-ban 위반 → 비-색 bg tint만으로 변경.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/multi-session.test.js` | 16 (a–o + kind oracle) | graceful hide / 테이블 / self / 차단·degraded / 드로어 / escape / masked verbatim / md↔html 동등 / Plan-F1 / Impl-F1/F2/F3 / raw 마커 안전 |
| `tests/drawer.test.js` | +4 | wt detailId / buildWorktreeDetail / KIND map / drawerMap 합류 |

## Next Steps

- [ ] `/mccp:prp-commit` — M2 변경 커밋
- [ ] `/mccp:pr` — PR 생성 (PR-Codex 게이트)
- [ ] PR merge 후 worktree cleanup + plugin cache update
