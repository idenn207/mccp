# Implementation Report: Dashboard Truthfulness M4 — 메인 표현 정리

## Summary

대시보드 메인 흐름의 *표현* 비대칭/잡음 셋을 닫았다(데이터는 M1~M3에서 이미 truthful). 신규 시각 시스템·신규 색 토큰 0 — 콘솔 셸 계약(PR #57~#63)과 복사 인프라(`data-copy`/`#ic-copy`/`COPY_SCRIPT`/드로어 가드)를 전부 재사용했다.

1. **타임라인 더보기** — `audit-timeline.js`가 상위 20행만 렌더하고 나머지는 `+N older` muted 각주로만 노출(접근 불가)이던 것을, risks/OQ의 `top-N + <details class="more">+N 더보기` 패턴을 적용해 상위 `TIMELINE_EXPANDED`(8) expanded `<ol>` + 나머지(cap 내)를 접힘으로 접근 가능하게 함.
2. **OQ 메인 = 복사 버튼만** — verbose `inline-prompt`(`<code>{전체 명령}` + 버튼)를 경량 `li-action`(복사 버튼만)으로 교체. 전체 명령은 드로어 `detail.action` + STATUS.md `renderDetailMd`에 불변 보존.
3. **위험 메인 복사 버튼 추가** — 이미 빌드된 `ap`를 메인 `li-action` 복사 버튼으로 노출 → 위험/질문 메인 affordance 대칭.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (예측 일치) |
| Files Changed | 14 (source 5 + tests 6 + plugin.json + CHANGELOG + PRD + docs) | 13 (plan archive skip — 컨벤션 부적합) |
| Test baseline | 557 + 신규, 0 회귀 | 566 (557 + 9 신규), 0 실질 회귀 |
| Codex round | dedupe (plan-codex 수렴) | cross-gate dedupe applied |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 타임라인 더보기 (audit-timeline.js) — global-isLast 보존 | Complete | TIMELINE_EXPANDED=8, expanded/collapsed/note 3-way split. Codex R1 F1(글로벌 isLast + audit-notes 컨테이너) 흡수 |
| 2 | OQ 메인 = 복사 버튼만 (open-questions.js) | Complete | inline-prompt → li-action, `<code>` 제거 |
| 3 | 위험 메인 복사 버튼 추가 (risks.js) | Complete | OQ와 동일 markup·aria-label, ap.fullText 재사용 |
| 4 | 복사 버튼 클릭 ≠ 드로어 open (회귀 가드) | Complete | 신규 코드 0 — 기존 DRAWER_SCRIPT 가드를 테스트로 고정 |
| 5 | html.js / markdown.js CSS + footer | Complete | .li-action + .audit-notes CSS, footer v1.18.7 |
| 6 | 테스트 전체 + 디자인 lint | Complete | 6 테스트 파일 갱신 + 신규 단언, 566 tests |
| 7 | impeccable + 문서 + version + PRD | Complete | dashboard-surface.md §2.4, plugin.json 1.18.7, CHANGELOG, PRD M3 → complete |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 순수 JS plugin (package.json 없음, lint/typecheck 스크립트 없음) |
| Unit Tests | Pass | renderer + derive + stale-audit 566 tests, 565 pass |
| Build | N/A | 빌드 단계 없음 |
| Integration | Pass | `derive/cli.js render` end-to-end — 더보기 5 / data-copy 6 / footer v1.18.7 노출 |
| Edge Cases | Pass | boundary connector, 각주 순서, cap 초과 +N older, detailMap 전 행 적재 |

### Flaky test note

`perf-budget: 100 receipts + 20 envelopes + 5 plans complete < 1000ms` (derive 스위트)가 3 스위트 동시 실행 시 CPU 경합으로 wall-clock 1000ms 초과 fail. derive 단독 실행 시 통과(87/87). M4는 renderer 섹션만 변경 — derive perf 경로 미접촉. 환경적 flaky이지 회귀 아님.

### H16 advisory note

`derive/cli.js render`가 H16 advisory 1건(non-blocking) 보고. 원인은 truncated `relatedOpenQuestion` cue(`renderProseHtml(...) + '…'`가 `**bold**` 쌍을 중간에 잘라 raw `**` 잔존)의 **기존 cross-section 부채**(risks.js:54, M4 미수정 경로). base(stash) 렌더에서 동일하게 발생(violation set `["H16"]` 일치). M4 추가분(li-action/data-copy)에 인접한 raw 마커 0 — `data-copy`는 cleanArg된 fullText. STATE.md 기록 cross-section 부채와 일치, M4 신규 위반 아님.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATED | 더보기 분할 + audit-notes 컨테이너 + TIMELINE_EXPANDED export |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATED | inline-prompt → li-action |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATED | 메인 li-action 복사 버튼 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | .li-action + .audit-notes CSS, footer v1.18.7 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer v1.18.7 |
| `plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js` | UPDATED | 더보기 + boundary connector + 각주 순서 회귀 4건 |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | UPDATED | OQ 복사버튼-only + risk 복사 버튼 |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-aria-labels.test.js` | UPDATED | OQ wording + risk aria-label |
| `plugins/mccp/scripts/lib/renderer/tests/section-fidelity.test.js` | UPDATED | anatomy inline-prompt → li-action |
| `plugins/mccp/scripts/lib/renderer/tests/drawer.test.js` | UPDATED | 복사 클릭 가드 2건 |
| `plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js` | UPDATED | 타임라인 더보기 html↔md 동등 |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATED | M4 surface design-lint clean |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer v1.18.6 → v1.18.7 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.18.6 → 1.18.7 |
| `CHANGELOG.md` | UPDATED | 1.18.7 row + versioning note |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATED | M3 row in-progress → complete |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATED | §2.4 M4 surface 문서화 |

## Deviations from Plan

- **Plan archive 미실행**: prp-implement Phase 5의 generic archive 단계(plan → `completed/`)를 skip. M1~M3 dashboard-truthfulness plan이 모두 `.claude/plans/`에 잔존(PRD 링크·milestone-history·receipt chain 의존)하는 이 PRD의 컨벤션과 부적합. 이동 시 (1) PRD M4 링크 (2) `/mccp:pr` validate가 pin된 plan path 재read (3) M1~M3 일관성이 깨짐.
- **PRD M4 row는 in-progress 유지**: plan의 version Open Question 결정(PRD 미완 상태에서 minor 조기발행 회피)과 정합. M4 → complete 전환 + minor 정리(`1.18.7 → 1.19.0`)는 PR merge 후 별도 hot-fix(plan 명문화). M3 row만 stale-status 정리(complete, #63 ship 반영, Codex R1 F2).

## Issues Encountered

- **dedupe note가 plan hash 변경 → plan-codex stale**: cross-gate dedupe(2.5.1)가 `## Codex Implementation Review` 섹션을 plan body에 추가하면서 plan hash가 바뀌어 plan-codex receipt가 stale. 순수 additive audit 주석(아키텍처 결정 불변)이므로 plan-codex receipt를 현재 hash로 re-pin(design-critique audit 필드 보존)하여 복구. validate exit=0.

## Tests Written

| Test File | New assertions | Coverage |
|---|---|---|
| `audit-timeline-snapshot.test.js` | 4 tests | 더보기 분할, detailMap 전 행, boundary connector, 각주 순서 |
| `four-part-rendering.test.js` | 1 test + 2 augment | OQ 복사버튼-only headline, risk 복사 버튼 |
| `a11y-aria-labels.test.js` | 1 test + 1 rename | risk copy-btn aria-label |
| `drawer.test.js` | 2 tests | 복사 클릭 가드 nesting + DRAWER_SCRIPT 가드 |
| `markdown-equivalence.test.js` | 1 test | 타임라인 더보기 html↔md 동등 |
| `output-constraints.test.js` | 1 test | M4 surface design-lint clean |

## Next Steps
- [ ] Code review via `/mccp:code-review` (선택)
- [ ] Create PR via `/mccp:pr` (PR 전 사용자 시각 확인 권장 — `.claude/cache/status.html`)
- [ ] (post-merge) PRD M4 → complete + plugin.json minor 정리(1.19.0) hot-fix + worktree cleanup
