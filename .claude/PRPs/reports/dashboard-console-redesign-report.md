# Implementation Report: Dashboard Console Redesign — M1 콘솔 셸 + 토큰 이식

## Summary

승인된 `.claude/cache/dashboard-sample.html`(2026-06-23 사용자 confirm)의 앱 셸 + 디자인
토큰을 실 렌더러(`html.js`)에 이식. 좌측 사이드바(프로젝트 스위처 · 검색 affordance ·
아이콘 nav 레일 · 차단 pin-alert), 상단바(브레드크럼 · 중앙 page-title · freshness),
near-monochrome OKLCH 토큰, Pretendard self-contained(로컬 family-name 참조), Lucide
symbol 스프라이트(inline), CSS `:target` 라우팅, panel head/body/foot anatomy, 880px 반응형.
섹션 콘텐츠는 기존 derive 데이터로 새 panel anatomy 안에 정적 rehouse(샘플 섹션 마크업 +
실데이터 추출은 M2, 우측 드로어는 M3, STATUS.md 동등본은 M4). 충돌 H-invariant 4건
(H2/H3/H7/H13)을 샘플 기준으로 개정.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large |
| Files Changed | 10 | 10 |
| Codex (plan) | converged R1 (3 absorbed) | converged R1 (3 absorbed) |
| Tests | renderer green + console-shell 신규 | 340/340 renderer + 68/68 derive, 0 회귀 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | near-mono OKLCH 토큰 교체 | ✅ | chroma 0 무채색 + status 채도색 + dim, light 동형 |
| 2 | Lucide 스프라이트 + `.i` CSS | ✅ | 15 symbol inline, 1회 emit |
| 3 | 사이드바 셸 이식 | ✅ | 스위처/검색/nav 레일/pin-alert(blocked 신호 wiring) |
| 4 | 상단바 이식 (+H7) | ✅ | 브레드크럼/중앙 title(data-t)/freshness, backdrop-filter 제거 |
| 4.5 | 폰트 정책 + skip-link | ✅ | Pretendard 로컬 참조, 외부 fetch 0, fixed off-screen skip-link |
| 5 | panel anatomy + rehouse | ✅ | renderPanel head/body, 섹션 내부 마크업 보존 |
| 6 | 880px 반응형 | ✅ | 사이드바 가로 reflow, grid 1-col |
| 7 | H-invariant 개정 | ✅ | H2 1080 / H3 carve 확장 / H13 외부-fetch invariant |
| 8 | 테스트 갱신 + console-shell 신규 | ✅ | 7 파일 갱신 + 14 신규 가드 |
| 9 | DESIGN.md + plugin.json bump | ✅ | 1.16.0 → 1.17.0 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (lint) | ✅ | node --test green |
| Unit | ✅ | renderer 340/340, derive 68/68 |
| Build | N/A | JS, no build step |
| Integration | ✅ | `derive/cli.js render` → status.html, self-contained(외부 fetch 0) |
| Edge (drift) | ✅ | H3/H13/H2 drift fixture 가 가드 보존 증명 |

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE (셸+토큰+스프라이트 전면) |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE (H2/H3/H13) |
| `plugins/mccp/scripts/lib/renderer/tests/header-hoist.test.js` | UPDATE |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | (no change needed — passed) |
| `plugins/mccp/scripts/lib/renderer/tests/responsive-layout.test.js` | UPDATE (880, sidebar-w) |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | UPDATE (panel-head) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE (switcher/freshness) |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-aria-labels.test.js` | UPDATE (data-route) |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-landmarks.test.js` | UPDATE (skip-link) |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE (H2/H9/H13) |
| `plugins/mccp/scripts/lib/renderer/tests/console-shell.test.js` | CREATE (14 가드) |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE (개정 근거) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE (1.17.0) |

## Deviations from Plan

- render-integration.test.js 는 갱신 불필요(기존 sidebar/route assertion 이 새 셸과 호환).
- H9 (uppercase) 룰 자체는 개정 안 함(M2 이연) — 단 baseline 에 rail-label 1개 uppercase 가
  추가돼 output-constraints 단위 테스트의 fixture 산술을 self-contained 로 정정(룰 동작 불변).
- **폰트 OQ#1 — vendored 채택(사용자 결정)**: plan 권장안은 로컬 family-name 참조였으나
  사용자가 시각 100% 일치를 위해 vendored woff2 base64 inline 선택. `vendor/PretendardVariable.woff2`
  (2.0MB, OFL-1.1) → `FONT_FACE` 상수가 `data:font/woff2;base64` `@font-face` 로 inline,
  fail-open. H13(data: ≠ 외부 fetch) + self-contained grep green. status.html ~3.15MB.
- **IA 이탈 — 위험·질문 전용 route 추가(사용자 결정)**: sample 3-route 에서 위험 + 미해결
  질문을 활동·기록에서 분리해 4번째 `route-attention`(nav "위험 · 질문", ic-alert)으로 격상.
  `:target`/tb-title/nav-active 셀렉터 + `console-shell.test.js` 가드. 항목별 상세 드로어는 M3.

## Issues Encountered

- worktree `.git` 가 파일(gitdir 포인터)이라 Codex wrapper 의 `.git/mccp/tmp` mkdir 실패 →
  `git rev-parse --git-dir` 로 실제 gitdir 해결([[feedback-pr-worktree-gh-first]] 재현).
- plan-codex receipt 가 implement-review 섹션 append 로 stale → 정착된 plan hash 로 재-stamp(복구).
- 실데이터 render 의 H10/H16 advisory: 실 plan prose(섹션 내부, M1 미변경)의 em-dash/markdown
  에서 발생. design-invariants(minimal model)는 violations==[] 통과 — 셸 자체는 clean. 섹션
  콘텐츠 정규화는 M2 범위.

## Next Steps

- [ ] 사용자 육안: `.claude/cache/status.html` 을 `dashboard-sample.html` 과 셸 대조
- [ ] `/mccp:prp-commit` → `/mccp:pr` (PR 전 시각 확인 필수)
- [ ] PRD M1 row → complete
- [ ] M2: 섹션 샘플 마크업 + derive 실데이터 추출
