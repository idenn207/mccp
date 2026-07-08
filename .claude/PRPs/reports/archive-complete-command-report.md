# Implementation Report: `/mccp:archive-complete` command

## Summary

직전 세션(`v1.20.14`)에서 **수동** 수행한 "완료 PRD/plan을 `archived/`로 이동 + status drift 정정 + 대시보드 재렌더" 흐름을 재사용 가능한 human-gate command `/mccp:archive-complete`로 제품화했다. `/mccp:dashboard-audit`의 레이어 분리(agent 평가 ↔ 결정적 scan/apply)를 미러하되, 비파괴 마커 대신 **파일 이동 + status flip**을 수행한다. 핵심 정확성 기준은 PRD 전체 완료 시에만 archive하는 dangling-active-PRD 불변식(C2).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 10 CREATE/UPDATE | 11 (plan body 포함, dedupe marker) |
| Tests | scan + apply fixture | 21 pass (scan 11 · apply 10) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | scan.js — 결정적 스캐너 + 분류기 | ✅ Complete | rawRowCount fail-closed 등식(F1), plan↔PRD 인덱스, drift 증거 |
| 2 | apply.js — 원자 archive 트랜잭션 | ✅ Complete | preflight-all → journal → rollback(F2/F3), CAS, collision-legacy |
| 3 | archive-complete.md — 6-phase command | ✅ Complete | dashboard-audit 미러, `${CLAUDE_PLUGIN_ROOT}` 경로 |
| 3t | scan.test.js + apply.test.js | ✅ Complete | 21 pass |
| 4 | CLAUDE.md §3.11 + 릴리스 동기 | ✅ Complete | version/footer×2/CHANGELOG/i18n test 동기 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | ✅ Pass | 두 모듈 로드 OK (프로젝트에 별도 lint 스크립트 없음) |
| Unit Tests | ✅ Pass | archive-complete 21 · i18n-surface 10 |
| Build | N/A | 순수 Node CJS, 빌드 단계 없음 |
| Integration | ✅ Pass | `derive/cli.js render` → degraded sources `[]`, footer `v1.20.15` |
| Edge Cases | ✅ Pass | 비정규 status·git mv 중간 실패 rollback·CAS·idempotent·collision-legacy·C2 solo-move |

### Design Grounding

Design Grounding: N/A — cross-gate dedupe(2.5.1)로 design-critique 서브스텝(2.5.5b/c) skip. 유일한 rendered-surface touch는 footer 버전 문자열 swap(`html.js`/`markdown.js`)으로 control-plane no-op(plan Design Critique = CONVERGED). Phase 3.6/3.7 no-op(capture 아티팩트 없음).

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/archive-complete/scan.js` | CREATED | 결정적 스캐너 |
| `plugins/mccp/scripts/lib/archive-complete/apply.js` | CREATED | 원자 트랜잭션 (+ `onBeforeApply` 테스트 seam) |
| `plugins/mccp/scripts/lib/archive-complete/tests/scan.test.js` | CREATED | 11 tests |
| `plugins/mccp/scripts/lib/archive-complete/tests/apply.test.js` | CREATED | 10 tests |
| `plugins/mccp/commands/archive-complete.md` | CREATED | 6-phase command body |
| `CLAUDE.md` | UPDATED | §3.11 archived/ 관례 |
| `CHANGELOG.md` | UPDATED | `[1.20.15]` row |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | `1.20.14 → 1.20.15` |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | footer `v1.20.15` |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer `v1.20.15` |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer assertion `v1.20.15` |

## Deviations from Plan

1. **`parseTableRows`/`findSection` 로컬 포트** — plan Task 1은 `parseTableRows 재사용`을 지시했으나 두 함수가 `plan-body.js`에서 export되지 않는다. cross-gate dedupe subset 불변식(diff ⊆ Files to Change)을 지키려 `plan-body.js`를 건드리는 대신 scan.js에 self-contained 포트(enumerate.js `scanInProgressRows`의 로컬-표-스캔 패턴 미러, 동일 정규식). 동작 동일 — 재사용 메커니즘만 상이.
2. **테스트 실행 형태** — plan Validation의 `node --test <dir>/`는 이 환경(node v24 Windows)에서 디렉토리를 모듈로 resolve하려다 실패한다. command body/validation은 glob/명시-파일 형태 사용. 테스트 자체는 plan 의도대로 존재·green.
3. **plan archive 보류** — Phase 5의 `mv → completed/`는 (a) `completed/`가 아닌 `archived/`가 현 repo 관례(v1.20.14)이고 (b) 이 plan은 Source PRD가 없어 dashboard active 스캔 대상이 아니며 receipt/PR-dedupe가 in-place 경로로 resolve되므로, `.claude/plans/`에 **보존**(STATE.md 관행 — 완료 plan은 별도 housekeeping/deliberate archive 시 이동). dangling active PRD 위험 0(PRD 없음).

## Issues Encountered

- 렌더러 broad sweep의 `verdict-label metric (F1) — #drawer-data` 1건 fail은 **사전 존재**(committed HEAD `18ebe94`에서 내 renderer 변경 stash 후에도 fail = `pass 6 fail 1`) — footer/버전 무관, 별도 이슈. 본 변경 회귀 0.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/scan.test.js` | 11 | normalizeStatus·classifyMilestones(F1 등식)·isArchivable(C2/dropped/비정규)·scan 통합·비재귀·drift 증거 |
| `tests/apply.test.js` | 10 | status flip(surgical/escaped-pipe)·성공 archive+journal+git history·rollback(F2)·C2 solo-move·non-archivable·CAS·idempotent·collision-legacy |

## Next Steps

- [ ] `/mccp:prp-commit` — 커밋 (사용자 승인 후)
- [ ] `/mccp:pr` — PR 생성
- [ ] merge 후 `claude plugin update`로 `1.20.15` 캐시 디렉토리 생성 확인 (§3.7)
