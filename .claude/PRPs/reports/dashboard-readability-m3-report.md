# Implementation Report: Dashboard Readability M3 — 판정 어휘 사용자 친화화

## Summary

대시보드 전 섹션에 흩어진 dual-review 판정 라벨을 사용자 친화 어휘로 SSoT 모듈을 통해 일관 치환했다: `수렴→통과`, `진행→진행 중`, `divergent`/`미수렴→보류`. 세 어휘를 단일 frozen 맵(`parsers/verdict-label.js` `VERDICT`)으로 뽑아 5개 렌더 파일이 소비하게 하고, 렌더 출력(`r.md`/visible `r.html`)의 잔여 구 어휘 0 을 강제하는 metric 테스트를 신설했다. 아이콘(✓/◐/⚠)·톤(low/med/high)·CSS class·decision-state enum(`converged`/`blocked`)은 불변 — 텍스트 라벨 스왑만.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (텍스트 라벨 치환, 로직 무변경) |
| Confidence | 높음 (SSoT + metric 테스트로 HIGH 리스크 방어) | 확정 — 662/662 렌더러 테스트 green |
| Files Changed | 15 (plan Files to Change) | 15 소스/테스트/버전 + PRD(이미 in-progress) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | verdict-label.js SSoT 모듈 생성 | 완료 | `VERDICT = Object.freeze({PASS:'통과', IN_PROGRESS:'진행 중', HOLD:'보류'})` |
| 2 | pipeline.js 라벨 치환 | 완료 | NODE_MARK/STAGE_CONVERGED/fallback → VERDICT. foot-stat `진행`(count)은 불변 |
| 3 | audit-timeline.js conv 라벨 치환 | 완료 | 3분기 + mdMark + sr-only + 주석. convText→drawer 자동 정합 |
| 4 | drawer-detail.js 기본/워크트리 conv | 완료 | buildReceiptDetail 기본 + buildWorktreeDetail 게이트 행 |
| 5 | next-action.js prose/description | 완료 | `미수렴→보류` + 모순 어휘 `수렴 진행 중`→`진행 중` 제거 |
| 6 | status-grid.js 툴팁 | 완료 | blockedIntent `미수렴`→`보류` |
| 7 | html.js CSS 주석 리워드 + 양 footer bump | 완료 | emit되는 `<style>` `수렴`→`통과` + footer v1.20.0 |
| 8 | metric 테스트 신설 (Codex R1 F1) | 완료 | 7 테스트. #drawer-data 보존+파싱 단언 |
| 9 | 기존 테스트 어휘 갱신 | 완료 | 5 test 파일. briefing/요약 데이터 문자열은 유지 |
| 10 | 버전/CHANGELOG/PRD 동기 | 완료 | 1.20.0 + [1.20.0] row. PRD M3는 이미 in-progress(/mccp:plan) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | 통과 | plugin.json valid JSON, 모듈 로드 정상 |
| Unit Tests | 통과 | 662/662 렌더러 스위트 green (신규 verdict-label 7 포함) |
| Build | N/A | dep-free Node 스크립트 (빌드 단계 없음) |
| Integration | 통과 | `derive/cli.js render` exit 0, 출력 통과/진행 중/보류 노출 |
| Edge Cases | 통과 | 3 판정 상태 + worktree gate 2 상태 + #drawer-data blanket-strip false-negative 차단 |

### Design Grounding (v1.18.22)

Design Grounding: N/A (no design trigger) — impeccable available (skill_available=true) but design_signal=0. 렌더러 `.js` 소스는 감지기 관점에서 control-plane(UI-ext/whitelist hit 0), 렌더 출력(status.html/STATUS.md)은 gitignore. 2.5.5c capture 미발화 → Phase 3.6/3.7 no-op. Plan-stage design critique 이미 R0 CONVERGED.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/verdict-label.js` | CREATED | 판정 어휘 SSoT frozen 맵 |
| `plugins/mccp/scripts/lib/renderer/sections/pipeline.js` | UPDATED | NODE_MARK/STAGE_CONVERGED |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATED | conv 3분기 + mdMark + sr-only |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATED | blockedIntent 툴팁 |
| `plugins/mccp/scripts/lib/renderer/parsers/drawer-detail.js` | UPDATED | receipt/worktree conv |
| `plugins/mccp/scripts/lib/renderer/parsers/next-action.js` | UPDATED | prose/description |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | CSS 주석 + footer v1.20.0 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer v1.20.0 |
| `plugins/mccp/scripts/lib/renderer/tests/verdict-label.test.js` | CREATED | metric + F1 드로어 파싱 |
| `plugins/mccp/scripts/lib/renderer/tests/{pipeline,timeline-chart,i18n-surface,drawer,markdown-equivalence}.test.js` | UPDATED | 라벨 단언 갱신 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.19.2 → 1.20.0 |
| `CHANGELOG.md` | UPDATED | [1.20.0] row |
| `.claude/prds/dashboard-readability.prd.md` | (이미 갱신됨) | M3 in-progress + Plan 셀 (/mccp:plan) |

## Deviations from Plan

- **플랜 아카이브 미실행 (의도적)**: Phase 5 의 `mv → completed/` 는 실행하지 않았다. M1/M2 플랜도 shipped 후 `.claude/plans/` 에 그대로 있는 repo 관행 + PR 게이트가 recorded plan_hash 를 원 경로에서 readback 하므로 receipt chain 무결성 보존을 위해 in-place 유지. 아카이브는 post-merge housekeeping.
- **PRD M3 status = in-progress 유지**: Phase 5 의 in-progress→complete 갱신 대신 in-progress 유지. 아직 미merge 상태이고, shipped 된 M2 도 PRD 상 in-progress(drift)라 동일 관행. complete 전이는 PR merge 시점.
- **plan-codex receipt hash re-anchor**: 2.5.1 dedupe 가 plan body 에 `## Codex Implementation Review` 를 추가하며 plan_hash 가 바뀌어 기존 plan-codex receipt 가 stale 판정 → converged verdict 보존한 채 hash re-anchor(§3.1 recovery). 계획 의도 이탈 아님.

## Issues Encountered

- **STATUS.md 실데이터 grep 271 hit (오탐, 예상됨)**: 실렌더 STATUS.md 는 이 M3 플랜 자체의 Risks/Questions + backlog 등 **데이터 콘텐츠**가 `수렴`/`미수렴`/`divergent` 를 다수 언급(플랜이 이 어휘 치환에 관한 것). 판정 라벨 아님. metric 테스트가 통제 fixture(데이터에 구 어휘 미시드)로 라벨 경로만 격리하는 이유(plan Risks 표 LOW 항목). 라벨 경로 grep-0 은 통제 model 로 검증 완료.
- **`node --test <dir>` 미동작 (Node v24)**: 디렉토리 인자를 모듈로 해석 → glob(`tests/*.test.js`)로 우회.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/verdict-label.test.js` | 7 tests | VERDICT 값 + 빌더 verdict 필드 + renderStatus r.md metric + F1 #drawer-data 보존/파싱 |

## Next Steps

- [ ] `/mccp:prp-commit` 으로 커밋
- [ ] `/mccp:pr` 로 PR 생성 — **주의**: 브랜치가 origin/main 과 squash-divergence(a5359eb tree-identical, 커밋 해시만 상이). PR 직전 `git diff --name-only origin/main..HEAD` 빈출력 검증 + origin/main rebase + `--force-with-lease` 필요(메모리 기록 재발 부채)
- [ ] Post-merge: worktree cleanup + PRD M1~M3 status/drift housekeeping
