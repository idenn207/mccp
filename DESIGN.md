# Design

> mccp 진행 현황 대시보드(`.claude/cache/status.html` + `STATUS.md`)의 visual system.
> 코드 source: `plugins/mccp/scripts/lib/renderer/html.js`(TOKENS + LAYOUT) + 섹션 모듈.
> 기계 lint 계약은 `docs/v1.3.0-observability/DESIGN.md`(H1-H16) 참조 — 본 문서는 그 위의 시각 설명.

## Overview

- **Register**: product (도구/대시보드). 디자인이 product를 SERVE.
- **미학 리드** (v1.17.0 redesign-3): Vercel 대시보드 결 — 다크 default + hairline border + 목적 있는 비중첩 패널. **멀티페이지 콘솔**: 좌측 사이드바가 TOC 앵커가 아니라 page 라우팅(개요 / 파이프라인 / 활동·기록 3 route). 상태색만 절제, 장식 최소.
- **status는 chrome 아님**: 4축(진행/차단/다음/위험)은 항상 노출되는 상단 스트립이 아니라 **개요 페이지 hero 패널의 인라인 메타**로만 산다. "정보의 압축·노출 제한도 디자인" — 늘 보일 필요 없는 정보는 진입점(개요)에만.
- **테마**: dark/light 자동(`prefers-color-scheme`). OKLCH 색 공간. dark default + light opt-in.
- **제약**: self-contained 단일 HTML(inline CSS/JS, 외부 script URL 0). raw 미마스킹 데이터를 third-party로 노출 금지.
- **플랫폼**: 데스크톱 전용(모바일 미지원).

## Color

OKLCH 토큰(`html.js` `OKLCH_LIGHT` / `OKLCH_DARK`). 강조색은 화면당 1개(H 규칙). 상태색은 의미 전달 전용.

| Token | Light | Dark | 용도 |
|---|---|---|---|
| `--bg` | `oklch(0.99 0 0)` | `oklch(0.18 0 0)` | 본문 배경 (light 기본, H1: L ≥ 0.97) |
| `--surface` | `oklch(0.97 0.003 250)` | `oklch(0.22 0.005 250)` | header / chip / code 배경 |
| `--border` | `oklch(0.92 0.005 250)` | `oklch(0.30 0.008 250)` | 구분선 |
| `--ink` | `oklch(0.20 0.005 250)` | `oklch(0.92 0.005 250)` | 본문 텍스트 |
| `--muted` | `oklch(0.45 0.008 250)` | `oklch(0.65 0.008 250)` | 보조 텍스트 |
| `--accent` | `oklch(0.55 0.18 230)` | `oklch(0.70 0.15 230)` | 강조(수렴/primary). 화면당 1 강조 |
| `--status-blocked` | `oklch(0.55 0.18 25)` | `oklch(0.65 0.20 25)` | 차단(✗) |
| `--status-stale` | `oklch(0.75 0.15 80)` | `oklch(0.75 0.15 80)` | stale 60s+ / 경고(앰버) |
| `--status-secret` | `oklch(0.50 0.22 25)` | `oklch(0.65 0.22 25)` | secret 탐지 alert |
| `--status-worker-alive` | `oklch(0.65 0.15 145)` | `oklch(0.70 0.18 145)` | 워커 alive(녹색) |
| `--status-worker-stale` | `oklch(0.75 0.15 80)` | `oklch(0.75 0.15 80)` | 워커 stale |

- **전략**: Restrained — 중립 틴트 + 상태색만. 빨강/노랑은 예외 신호로만(blocked/stale/secret).
- **대비**: 본문 4.5:1(WCAG AA). 색 단독 의미 전달 금지 — 아이콘/형태 병행.

## Typography

- **본문**: 시스템 sans 스택(`ui-sans-serif, system-ui, -apple-system, 'Segoe UI Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`).
- **mono**: `ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace` (`code`, `.mono`).
- **커스텀 웹폰트 금지**(H13: Inter/Pretendard/JetBrains 로딩 금지).
- **스케일**: h1 1.5rem · h2 1.125rem · body 1rem/line-height 1.5 · meta 0.85rem. hero-metric(≥1.6rem) 금지(H6, h1.verdict 1.5 carve-out).
- **heading depth ≤ 3**(H15). 대문자 변환 ≤ 1 declaration(H9). em-dash 금지(H10).

## Spacing & Layout

- **앱 셸**: `body`가 2-컬럼 그리드 — 좌측 사이드바(`--sidebar-width: 13.5rem`, full-height sticky) + 메인 컬럼. 메인 = 슬림 header(freshness only) + `--content-max: 880px`(H2 상한) 콘텐츠 + footer.
- **라우팅**: 3 route(`#route-overview` / `#route-pipeline` / `#route-activity`)를 **순수 CSS `:target` + `:has()`**로 전환 — JS 0. no-JS 시 개요가 default 노출(progressive enhancement). 사이드바 `.nav-rail a`가 page 링크, active는 색+굵기+배경+`›` 마커(색 단독 아님).
- **header**: static(sticky 아님), `--bg` 배경, stale 시 border-bottom `--status-stale`로 전환(240ms ease-out). 우측 정렬 "마지막 갱신" 만 — status-strip 폐기.
- **패널 그리드**: 활동·기록 page는 `repeat(2, minmax(0,1fr))` 명시 2-col(auto-fit 아님 → H5 무관). `.span-2`로 타임라인/위험은 full-width.
- **여백**: 충분한 margin/padding으로 위계·가독성 확보(빽빽한 텍스트 금지). 좁은 viewport(≤720px)는 사이드바를 상단 가로 바로, 패널 그리드를 1-col로 구조 collapse.
- **금지**(design-gate): 사이드-stripe(border-left ≥2px, H4), auto-fit 카드 그리드(H5), 그라디언트 배경(H8), 글래스모피즘(H7), **카드 중첩(card-in-card, H17 DOM-aware)**. 단일 패널(`.panel`/`.hero-panel`)은 목적 있는 비중첩 affordance로 H3 carve-out.

## Components

| Component | Class | 비고 |
|---|---|---|
| 사이드바 라우팅 | `.sidebar` / `.nav-rail a[data-route-link]` | brand + 3 page 링크. active = 색+굵기+배경+`›` 마커 |
| route 뷰 | `.route#route-<name>` | CSS `:target`로 단일 표시, no-JS 시 개요 default |
| hero 패널(개요) | `.hero-panel` > `h1.verdict.s-<tone>` + `.hero-next` + `.hero-meta` | 1줄 판정(slug 금지, H14) + next-action 복사 + 인라인 4축 메타 |
| 패널 | `.panel` > `h3` | 활동·기록 page 2-col 그리드 요소. 비중첩(H17) |
| severity 태그 | `.severity-tag.s-<level>` | 색으로 표현(chrome 아님, H12). pill carve-out |
| action prompt | `.action-prompt` + `.copy-btn` | code chip + 복사 버튼. wrap 안전 |
| OQ/Risks | `.oq-item`/`.risk-item` + `.meta-cue` | 4-part, top-3 + `<details>` collapse |
| 타임라인 | `.timeline` / `.audit-row` | receipt 활동 로그(시간순). 활동·기록 패널 |
| 게이트 파이프라인 | `.pipeline`/`.pipe-row`/`.pipe-node` | 파이프라인 route. decision별 가로 스테퍼. 노드 ✓/◐/○/✗ |
| 마일스톤 기록 | `.milestone-history`/`.milestone-item` | 활동·기록 패널 |

- **아이콘**: 필수 affordance만(사이드바/로고/버튼/라벨). 장식 아이콘 금지.
- **collapse**: "quiet by default, loud on demand" — top-3 펼침, blocked/unconverged는 절대 숨기지 않음.

## Motion

- 절제. transition은 header 배경(240ms ease-out) 등 상태 전이에 한정. ease-out 곡선, bounce 금지.
- **`prefers-reduced-motion: reduce`**: 모든 animation/transition off. 모션 부재해도 동작 동일(enhancement only).

## Accessibility

- WCAG 2.2 **AA** + reduced-motion. 본문 4.5:1, 색+아이콘+텍스트 이중 표기.
- semantic landmark(header/main/footer), skip-link(`#main`), focus-visible outline(`--accent`).
- plain text 동등본(`STATUS.md`) 항상 동시 생성 — 스크린리더/키보드/SSH/텍스트 환경 fallback.

---
*Generated 2026-06-22 via `/impeccable init` (코드 scan: `html.js` TOKENS+LAYOUT + 섹션 모듈 + `docs/v1.3.0-observability/DESIGN.md` H1-H16).*
