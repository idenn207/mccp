# Design

> mccp 진행 현황 대시보드(`.claude/cache/status.html` + `STATUS.md`)의 visual system.
> 코드 source: `plugins/mccp/scripts/lib/renderer/html.js`(TOKENS + LAYOUT) + 섹션 모듈.
> 기계 lint 계약은 `docs/v1.3.0-observability/DESIGN.md`(H1-H16) 참조 — 본 문서는 그 위의 시각 설명.

## Overview

- **Register**: product (도구/대시보드). 디자인이 product를 SERVE.
- **미학 리드**: GitHub Actions 결 — 중립 회색조 base + 상태색만 절제. 장식 최소, 정보 밀도 명확.
- **테마**: dark/light 자동(`prefers-color-scheme`). OKLCH 색 공간.
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

- **현재**: 단일 중앙 컬럼 `max-width: 720px`(H2 상한). `section` 상하 1rem + border-bottom 구분.
- **header**: sticky top, `--surface` 배경, stale 시 `--status-stale`로 전환(240ms ease-out). status-strip(4축) + brand + meta(마지막 갱신).
- **권장 방향(PRODUCT.md 원칙 6)**: 데스크톱 사이드바 + 탭바 레이아웃. 모바일 패턴 미도입.
- **여백**: 충분한 margin/padding으로 위계·가독성 확보(빽빽한 텍스트 금지).
- **금지**(design-gate): 카드(border-radius layout chrome, H3), 사이드-stripe(border-left ≥2px, H4), auto-fit 카드 그리드(H5), 그라디언트 배경(H8), 글래스모피즘(H7).

## Components

| Component | Class | 비고 |
|---|---|---|
| 상태 strip(4축) | `.status-strip .cell` | header 내. 진행/차단/다음/위험. 색+아이콘+값 |
| verdict | `h1.verdict.s-<tone>` | 1줄 PM-voice 판정(slug 금지, H14) |
| severity 태그 | `.severity-tag.s-<level>` | 색으로 표현(chrome 아님, H12). pill carve-out |
| action prompt | `.action-prompt` + `.copy-btn` | code chip + 복사 버튼. wrap 안전 |
| OQ/Risks | `.oq-item`/`.risk-item` + `.meta-cue` | 4-part, top-3 + `<details>` collapse |
| 타임라인 | `.timeline` / `.audit-row` | receipt 활동 로그(시간순) |
| (신규) 게이트 파이프라인 | `.pipeline`/`.pipe-row`/`.pipe-node` | decision별 가로 스테퍼. 노드 ✓/◐/○/✗ |
| 마일스톤 기록 | `.milestone-history`/`.milestone-item` | |

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
