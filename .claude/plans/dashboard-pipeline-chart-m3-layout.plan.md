# Plan: Dashboard M3 — 레이아웃 재설계 (다크 파이프라인 콘솔 + Vercel 카드 베이스)

**Source PRD**: .claude/prds/dashboard-pipeline-chart.prd.md
**Selected Milestone**: M3 — 레이아웃 구조 · 정보 계층 · 반응형
**Complexity**: Large (재설계 — 기존 단일컬럼/무카드 철학 폐기)

## Summary

status.html을 디자인 스킬 없이 만들어진 평면적 단일컬럼(스캔 어려움)에서, **다크 파이프라인 콘솔**로 재설계한다. 좌측 섹션 nav 레일 + 우측 2D 카드 콘텐츠(Vercel 대시보드 베이스 — 목적 있는 비중첩 카드)로 primary→status→detail 위계를 형태·색으로 즉시 식별하게 한다. 데이터 소스·derive·receipt 스키마 불변(read-side 시각 레이어만). impeccable shape로 방향 확정(이 plan), craft로 구현(prp-implement), audit/polish로 ship 전 검증.

## 확정 디자인 방향 (impeccable shape 산출, 사용자 confirm 2026-06-23)

- **레이아웃**: A(다크 파이프라인 콘솔) 베이스 + 필요 시 C 하이브리드. 좌측 섹션 nav 레일 + 우측 카드 콘텐츠 2D.
- **theme**: 다크 default(차분한 dev 다크 — Linear/Vercel 톤, 형광/Bloomberg 아님). light는 `prefers-color-scheme`로 opt-in.
- **카드**: Vercel 대시보드 = 베이스. **목적 있는 비중첩 카드** — 콘텐츠별 가변 크기, 카드 안에 카드 금지(깔끔함의 핵심 규율), 거대 숫자(hero-metric) 금지. 동일 타일 그리드(`repeat(auto-fit,minmax)` 무한 반복) 아님.
- **색/타이포**: Restrained→Committed(다크 콘솔이 earn). accent 1 + 3 signal(red 차단/critical, amber stale, green 수렴), 강조색 viewport당 ≤1. 단일 sans + 1 mono(식별자). 고정 rem 스케일 ratio ~1.2.
- **정보 위계 3단계**: verdict(primary, 최상단 1줄) → status 4축(status ribbon) → 섹션 카드(detail). heading ≤3.
- **M4 토대 — inert affordance 0 (Codex R1 F3 absorption)**: M3는 동작 없는 가짜 컨트롤을 ship하지 않는다. 좌측 nav 레일은 **작동하는 plain anchor 링크**(`href="#section"` — JS 없이 점프 동작, inert 아님)까지만. active-섹션 하이라이트 추적(JS)·우측 Drawer 상세(Notion/Linear)·Tailwind `설명|터미널` 복사형 prompt는 **가시 컨트롤 + 동작을 함께 M4에서** 도입(M3에 placeholder 버튼/trigger 미노출). M3는 카드 레이아웃 구조 + 작동 anchor nav까지.

### anti-ref / ban 정합성

- PRODUCT.md anti-ref #1(SaaS hero-metric): Vercel-clean 카드는 거대 숫자·gradient 카드·sparkline 더미 없음 → 통과.
- anti-ref #3(Bloomberg 형광 다크): low-chroma 차분 다크 → 통과.
- impeccable "identical card grid"/"hero-metric"/"nested card" ban: 가변 목적 카드 + 카드중첩 금지 규율로 통과.
- PRODUCT.md Calm·Decisive·Compact + "차분한 dev 미감(Linear/Vercel)" 허용 범위 안.

## H-invariant 개정 (DESIGN.md H1–H16)

사용자가 "재설계가 정당화하면 H1–H16 자유 수정"에 동의. 개정 대상:

| H | 기존 | 개정 |
|---|---|---|
| H1 | light default off-white | **다크 default**(low-chroma), light는 prefers-color-scheme opt-in |
| H2 | max-width 720px 단일컬럼 | **2D 콘솔 폭**(nav 레일 + content, content max-width 유지하되 전체는 넓게) |
| H3 | NO 카드 | **목적 있는 비중첩 카드 허용**(card-in-card 금지 신규 invariant) |
| H4 | NO side-stripe | 유지(side-stripe 여전히 금지) |
| H5 | NO 카드 그리드 / no auto-fit minmax | **콘텐츠 카드 레이아웃 허용**, 단 동일타일 무한반복 그리드는 여전히 금지 |
| H6 | NO hero-metric | 유지(거대 숫자 금지 — Vercel 카드도 hero number 안 씀) |
| H7 | NO glassmorphism | 유지 |
| H8 | NO gradient bg | 유지 |
| H9–H16 | — | 대체로 유지(all-caps/em-dash/raw-markdown/heading≤3 등 텍스트 규율) |

신규 invariant **H17 — 카드 규율 (Codex R1 F2 absorption, DOM/CSS-aware)**: design-invariants.test.js에 3중 검증 추가:
1. **카드 중첩 금지**: `card` class token을 가진 *임의의* element(`section`/`div`/`article` 등) 내부에 또 다른 `card` class token element 0. `<section class="card">`만이 아니라 모든 태그·class 변형(`stat-card`, `card-x` 등 token 매칭).
2. **카드 래퍼 allowlist**: 카드 래퍼는 html.js의 명시적 section-purpose map에서만 생성. 섹션 모듈이 자체 card-like 래퍼를 emit하면 fail(섹션은 inner만).
3. **grid-template allowlist**: 승인된 grid-template만 허용(nav레일+content 2D). `repeat(auto-fit,minmax(...))` 동일타일 무한반복은 ban 유지하되, ban 패턴 부재만으로 통과시키지 않고 allowlist 적극 검증.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| CSS 상수 | `plugins/mccp/scripts/lib/renderer/html.js:29-233` | `OKLCH_LIGHT`/`OKLCH_DARK`/`LAYOUT` 분리 상수; 토큰 전면 교체하되 구조 유지 |
| 섹션 렌더 | `plugins/mccp/scripts/lib/renderer/sections/*.js` | `{ html }` 반환 + escapeHtml 통과 — 카드 래퍼는 html.js 조립부에서 일괄 적용(섹션은 inner만) |
| Errors | `plugins/mccp/scripts/lib/renderer/index.js` safeSection/safeCompose/safeFallback | per-section catch + loud-fail-open (dashboard-surface.md §8) |
| 인라인 JS | `html.js:235-237` STALE_SCRIPT/COPY_SCRIPT + vendored jQuery | ASCII-only, 외부 origin 금지, additive(JS 없이 baseline 동작) |
| Tests | `tests/design-invariants.test.js`, `tests/responsive-*` | node --test, grep 기반 invariant |
| Lint | `output-constraints.js` | heading ≤3 + list-of-N 정적 검증 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | 토큰 다크-default 교체 + 2D 레이아웃(nav 레일 + 카드 그리드) + 카드 래퍼 조립 + 반응형 breakpoint + 섹션 순서/위계 |
| `plugins/mccp/scripts/lib/renderer/sections/*.js` | UPDATE | 각 섹션이 카드 inner 콘텐츠 emit(카드 래퍼는 html.js) — 필요 최소 수정 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE 검토 | STATUS.md는 텍스트 유지(카드/2D 무관) — nav anchor 목록 정도만 |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE | H1–H16 개정 + 신규 H17(카드중첩 금지) + 다크 토큰/2D 레이아웃/카드 규율 명문화 |
| `.claude/prds/dashboard-pipeline-chart.prd.md` | UPDATE | §Design Direction을 새 방향으로 갱신 + M3 row in-progress |
| `plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js` | UPDATE | 개정된 H-invariant + H17 카드중첩 금지 assertion |
| `plugins/mccp/scripts/lib/renderer/tests/responsive-layout.test.js` | CREATE | nav 레일 collapse + 카드 reflow + 가로 overflow 0 |
| `plugins/mccp/scripts/lib/renderer/tests/*.test.js` | UPDATE | 기존 단일컬럼/무카드 가정 assertion 갱신(다수) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 1.15.0 → 1.16.0 |
| `CHANGELOG.md` | UPDATE | [1.16.0] M3 재설계 row |

## Tasks

### Task 1: 다크-default 토큰 시스템
- **Action**: OKLCH_DARK를 default `:root`로, light를 `@media (prefers-color-scheme: light)`로 반전. 차분 dev 다크(low-chroma surface/border/ink + accent 1 + signal 3). 카드 surface 토큰(`--card`, `--card-border`) 추가. WCAG AA(body ≥4.5:1) 검증.
- **Mirror**: `html.js:29-59` 토큰 블록 구조.
- **Validate**: `node --test ...tests/a11y-contrast.test.js oklch-conformance.test.js`

### Task 2: 2D 콘솔 레이아웃 (nav 레일 + 카드 콘텐츠)
- **Action**: body를 `display:grid`(좌 nav 레일 고정폭 + 우 content). content는 목적별 카드 컨테이너. verdict는 상단 full-width(primary), status 4축은 ribbon. nav 레일은 섹션 앵커 목록(active 하이라이트 동작은 M4 — M3는 정적 링크 + `:target`/scroll 기본). z-index 시맨틱 스케일.
- **Mirror**: 없음(신규) — Vercel 대시보드 토폴로지. flex 1D 아닌 grid 2D 정당(product.md "Grid for 2D").
- **Validate**: `node plugins/mccp/scripts/derive/cli.js render` + 육안 + `tests/design-invariants.test.js`(H2 개정)

### Task 3: 목적 있는 비중첩 카드 + 섹션 매핑
- **Action**: pipeline/timeline/milestone/questions/risks/workers를 각각 카드로 래핑(html.js 조립부). 카드 = `border:1px + radius + padding`, 배경 `--card`, **중첩 금지**. 섹션 모듈은 inner 콘텐츠만 emit. hero-metric/거대숫자 금지.
- **Mirror**: `html.js:300-322` 섹션 조립부 → 카드 래퍼로 교체.
- **Validate**: `tests/design-invariants.test.js`(H3 개정 + H17 카드중첩 0) + `tests/sections.test.js`

### Task 4: 반응형 구조적 collapse
- **Action**: `@media (max-width: ~720px)`: nav 레일이 상단 가로 인덱스(또는 collapse)로, 카드 단일 컬럼 stack, 가로 pipeline/테이블 `overflow-x:auto`. fluid 타이포 아님(product.md) — breakpoint 구조 변경만.
- **Mirror**: `html.js:231` media query append 위치.
- **Validate**: `node --test ...tests/responsive-layout.test.js`

### Task 5: 정보 위계 3단계 + heading ≤3
- **Action**: verdict(h1) → status ribbon → 카드(h2 제목, 내부 h3까지). heading depth ≤3 불변. 강조색 viewport당 ≤1(accent는 next-action/현재선택만).
- **Validate**: `node --test ...tests/output-constraints.test.js`(heading depth) + design-invariants

### Task 6: DESIGN.md + PRD §Design Direction 갱신
- **Action**: DESIGN.md를 새 방향(다크 콘솔/카드 규율/H 개정/H17)으로 재작성. PRD §Design Direction을 GitHub Actions 절제 → 다크 Vercel-카드 콘솔로 갱신(M4 drawer/nav/Tailwind-prompt 비전 명시).
- **Validate**: grep 정합성(문서 ↔ 코드 토큰)

### Task 7: 테스트 회귀 가드 (2-bucket) + version/CHANGELOG
- **Action (Codex R1 F1 absorption — bulk-rewrite가 회귀를 덮지 못하게 2-bucket 분리)**:
  - **Bucket A (protected behavior — 동결)**: derive/snapshot/trigger/receipt 경로 테스트(`audit-timeline-snapshot.test.js`, `trigger.test.js`, `milestone-history.test.js`의 데이터 로직, derive `sources/*`, receipt). 재설계 전 golden output을 동결하고 **이 bucket의 assertion은 변경 금지**. 변경이 필요하면 회귀 신호로 간주, 별도 검토.
  - **Bucket B (design/layout — 변경 허용)**: 단일컬럼/무카드/light-default를 검사하던 시각 assertion만 새 방향으로 갱신. plan에 변경 허용 test 파일을 명시 enumerate.
  - snapshot diff는 리뷰 후 반영(무비판 일괄 갱신 금지).
- **Action**: plugin.json 1.16.0, CHANGELOG row.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 PASS + Bucket A diff 0(동결 확인)

## Validation

```bash
cd "C:/_project/my/my-claude-code-plugin/.worktrees/dashboard-timeline-chart"
node --test plugins/mccp/scripts/lib/renderer/tests/         # 전체
node plugins/mccp/scripts/derive/cli.js render               # 산출물 생성 + 육안
node --test plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/responsive-layout.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/a11y-contrast.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 카드 도입이 anti-ref(hero-metric/identical grid)로 표류 | 중 | 가변 목적 카드 + 거대숫자 금지 + 카드중첩 금지(H17) mechanical lint |
| 2D 레이아웃이 console-noise(Bloomberg)로 표류 | 중 | low-chroma 다크 + accent ≤1 + Calm 톤; impeccable critique/audit 게이트 |
| 다크-default 반전이 light a11y 회귀 | 중 | a11y-contrast.test.js 양 theme 검증 |
| 재설계가 ~319 test 대량 깨뜨림 | 높음 | invariant assertion을 새 방향에 맞춰 일괄 갱신, derive/snapshot/trigger 테스트는 불변 가드 |<!--mccp:resolved reason="이미 재설계가 진행되었으며 테스트가 해결됨" at="2026-06-30T00:53:26.145Z"-->
| M3 스코프가 M4(drawer/nav동작)로 번짐 | 중 | M3=정적 셸까지, drawer/active/터미널-prompt 동작은 M4로 명시 분리 |
| 좁은 viewport에서 nav 레일+카드 깨짐 | 중 | 구조적 collapse breakpoint + responsive-layout.test.js |

## Acceptance
- [ ] 모든 task 완료
- [ ] `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 PASS (derive/snapshot/trigger/receipt 0 regression)
- [ ] design-invariants(개정 H + H17 카드중첩) + output-constraints(heading≤3, accent≤1) lint PASS
- [ ] 다크 default + 2D nav레일+카드 레이아웃 + 반응형 collapse 동작
- [ ] a11y: 색+아이콘+텍스트 3중, 양 theme contrast AA, 키보드/focus
- [ ] DESIGN.md + PRD §Design Direction 갱신
- [ ] impeccable critique CONVERGED + audit PASS (design gate)
- [ ] plugin.json 1.16.0 + CHANGELOG row

## Design Critique

- 방식: `Skill(frontend-design-direction)` Output Constraints first-step + impeccable `shape` 워크플로 (사용자 confirm 2026-06-23, 3 user round: 미학 범위 → H-invariant 처리 → 레퍼런스 선택).
- 라운드: R0 CONVERGED.
- 4 Output Constraints 점검:
  1. 정보 위계 3단계 — verdict(h1)→status ribbon→카드(h2/h3). heading ≤3 명시. PASS.
  2. 강조색 화면당 1개 — accent는 next-action/현재선택만, signal 3은 예외 신호. PASS.
  3. raw markdown marker 금지 — 렌더 출력 escapeHtml + H16 lint 유지. PASS.
  4. 한 화면 항목 수 상한 — list-of-N collapse(M3 카드 + M4 drawer로 점진적 공개). PASS.
- HIGH/CRITICAL design finding: 없음. anti-ref(hero-metric/Bloomberg/nested-card) 정합성은 §anti-ref 정합성 + H17로 mechanical 보장.
- verdict: converged

## Codex Adversarial Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review --impeccable-available` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1, cap=1)
- Codex verdict: needs-attention → R1 absorption 후 해소
- 합치 결론: 재설계 방향은 타당하나 (1) 테스트 일괄 갱신의 회귀-마스킹, (2) 카드 invariant의 좁은 범위, (3) M3 inert affordance ship 위험 — 3건 모두 R1에서 plan에 흡수.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 test 일괄 갱신이 derive/snapshot/trigger/receipt 회귀를 마스킹 | HIGH | ACCEPT_NOW | Task 7을 2-bucket(protected 동결 + design 변경허용)으로 분리 흡수 |
  | F2 H17이 `<section class="card">` 중첩만 잡아 너무 좁음 | MEDIUM | ACCEPT_NOW | H17을 DOM/CSS-aware 3중(token 중첩 + 래퍼 allowlist + grid-template allowlist)으로 확장 흡수 |
  | F3 M3가 inert M4 affordance(drawer/prompt/active) 노출 위험 | MEDIUM | ACCEPT_NOW | M3 inert affordance 0, nav는 작동 plain anchor만 — 가시컨트롤+동작은 M4 동시 흡수 |

- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 없음, 3건 R1 해소)
- Codex session 참조: threadId 019ef03e-51d2-75a2-996c-4fbe38d37cd0

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (다크 콘솔 + Vercel 카드 + H17 + 2-bucket 테스트 아키텍처). No new implement-time decisions detected — 구현은 plan Files to Change 범위 내. Cross-gate dedupe applied.

### Design Review (impeccable critique — 2.5.5b)

- 방식: impeccable shape(사용자 confirm) + mechanical 검증. 산출물(status.html)이 17개 H-invariant(개정 H1 다크-default / H2 content-max / H3 카드 carve-out / 신규 H17 카드중첩 + H4/H6/H7 금지 유지) + a11y(contrast/landmarks/aria-labels/severity-non-color) + responsive-layout + oklch-conformance lint를 전부 통과. PRODUCT.md anti-refs(hero-metric/AI-cream/Bloomberg) 준수.
- 4 Output Constraints: 위계 3단계(verdict→status→카드, heading≤3) PASS / accent ≤1(next-action·nav-attention만) PASS / raw markdown(escapeHtml + H16, em-dash·md literal advisory는 데이터 content로 기존) PASS / list-of-N collapse는 M4 progressive disclosure로 분리.
- 라운드: 1, verdict: converged.
- test: renderer 323(+11) + derive 68 = 391 PASS, 0 regression. behavior(snapshot/trigger/derive/receipt) bucket 동결 green.
