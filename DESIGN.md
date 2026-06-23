---
name: mccp Status Console
description: Calm, decisive PM briefing surface for an AI-driven SDLC pipeline
colors:
  console-black: "oklch(0.152 0 0)"
  sidebar-black: "oklch(0.165 0 0)"
  surface-chip: "oklch(0.185 0 0)"
  panel-graphite: "oklch(0.188 0 0)"
  panel-raised: "oklch(0.215 0 0)"
  panel-hover: "oklch(0.235 0 0)"
  hairline: "oklch(0.272 0 0)"
  hairline-strong: "oklch(0.335 0 0)"
  ink: "oklch(0.975 0 0)"
  ink-soft: "oklch(0.78 0 0)"
  muted: "oklch(0.615 0 0)"
  faint: "oklch(0.48 0 0)"
  signal-blue: "oklch(0.66 0.16 252)"
  alert-red: "oklch(0.67 0.19 25)"
  amber-stale: "oklch(0.81 0.13 80)"
  secret-red: "oklch(0.67 0.22 25)"
  worker-green: "oklch(0.74 0.16 152)"
typography:
  display:
    fontFamily: "'Pretendard Variable', Pretendard, ui-sans-serif, system-ui, -apple-system, 'Segoe UI Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 600
    lineHeight: 1.42
    letterSpacing: "-0.02em"
  title:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "1.05rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  panel-title:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.85rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.008em"
  body:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.69rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.05em"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, 'Liberation Mono', monospace"
    fontSize: "0.86em"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "9px"
  pill: "999px"
spacing:
  xs: "0.4rem"
  sm: "0.6rem"
  md: "1rem"
  lg: "1.1rem"
  xl: "1.6rem"
components:
  hero-panel:
    backgroundColor: "{colors.panel-graphite}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "1.3rem 1.4rem 1.2rem"
  panel:
    backgroundColor: "{colors.panel-graphite}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  nav-link:
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "0.44rem 0.6rem"
  nav-link-active:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.44rem 0.6rem"
  button-copy:
    backgroundColor: "{colors.panel-graphite}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.2rem 0.6rem"
  button-copy-hover:
    backgroundColor: "{colors.panel-hover}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.2rem 0.6rem"
  pipe-node:
    backgroundColor: "{colors.surface-chip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.1rem 0.55rem"
  severity-tag:
    textColor: "{colors.alert-red}"
    rounded: "{rounded.sm}"
    padding: "0 0.35em"
---

# Design System: mccp Status Console

## 1. Overview

**Creative North Star: "The Briefing Desk"**

이 인터페이스는 PM이 매일 아침 책상에서 받아보는 한 장짜리 브리핑이다. 화면을 여는 사람은 코드를 읽지 않는다. AI 에이전트가 밤사이 굴린 PRD → plan → implement → review → PR 파이프라인의 *현재 위치, 막힘, 다음 행동, 위험*을 60초 안에 파악하고, 승인 한 번을 내리고 자리를 뜬다. 따라서 첫 화면은 1줄 verdict와 인라인 4축 메타로 끝나야 한다. 깊이는 책상 위 서랍(파이프라인 · 활동·기록 page)에 넣어두고, 필요할 때만 연다.

목소리는 임원 브리핑(너무 격식)과 회계 감사 보고서(너무 건조) 사이다. `"plan 2건 진행 · 1건 차단 · 다음: PR review"` 같은 텔레그래픽 한 줄이 기준이다. 형용사를 줄이고 동사+명사를 쓴다. "혹시", "아마도"는 금지 — AI가 판단을 회피하면 raw finding을 그대로 노출하는 편이 회피보다 정직하다. 평소 톤은 조용하다. 빨강(차단)·앰버(stale/secret)는 예외 신호로만 등장하고, 그 외에는 near-black 위 한 줄의 signal-blue 강조가 화면 전체에서 단 하나다.

이 시스템이 명시적으로 거부하는 것: **SaaS hero-metric 대시보드**(Datadog/Mixpanel 류의 거대 숫자 + gradient 카드 + sparkline 더미 — mccp는 metric 광고가 아니라 PM 보고다), **AI-cream "warm minimal" 랜딩**(cream/sand 배경 + serif heading + 작은 caps eyebrow `01 · ABOUT` — vendor 랜딩의 saturated 클리셰), **Bloomberg 터미널**(형광 컬러 + tick 깜빡임 + 밀도 극대화 — PM 모드에 노이즈 + 의사결정 부담). 허용되는 것은 Linear / Vercel 대시보드 / Plain editor의 평정심 텍스트 톤뿐이다. dev-tool *maximalism*(file tree, diff viewer, commit graph)은 콘솔 결을 빌리되 도입하지 않는다.

**Key Characteristics:**
- **Calm** — 화면당 강조색 1개. hero number / gradient / animated badge 부재. 정보는 정적, 톤은 차분.
- **Decisive** — 모든 verdict는 1줄. slug·hash·raw JSON은 detail 진입 후에만 등장.
- **Compact** — 멀티페이지 콘솔. 개요 1화면에 핵심이 다 들어가고, 디테일은 page 전환으로.
- **Derive, don't author** — 모든 화면은 `.claude/` 하위 source(.md + receipt JSON)에서 derive된다. stale이면 "X초 전 갱신"으로 정직하게 노출.
- **Desktop-only** — 단일 데스크톱 가정. ≤880px에서 사이드바를 상단 가로 바로 collapse하지만 모바일 패턴(햄버거)은 도입 안 함.

## 2. Colors

전략은 **Restrained**다. 순수 chroma-0 near-black 중립 램프 위에 의미를 가진 색만 얹는다. 색은 절대 장식이 아니다.

### Primary
- **Signal Blue** (`oklch(0.66 0.16 252)`): 화면 전체에서 강조가 허용되는 단 하나의 색. verdict 톤(수렴/in-progress), nav active 상태, focus-visible outline, copy 버튼 포커스, 사이드바 프로젝트 마크에만 쓴다. light 테마에서는 `oklch(0.55 0.18 252)`로 어두워져 대비를 지킨다.

### Secondary (Status signals)
상태색은 의미 전달 전용이며 색 단독으로 의미를 싣지 않는다 — 항상 아이콘·형태·텍스트와 병행한다.
- **Alert Red** (`oklch(0.67 0.19 25)`): 차단(✗). 패널/hero `.attention` 테두리, 사이드바 차단 pin-alert, severity-tag(critical/high).
- **Amber Stale** (`oklch(0.81 0.13 80)`): stale 60s+ 경고, 워커 stale, severity-tag(medium), 미수렴 게이트. topbar 하단 테두리가 stale 시 이 색으로 200ms 전환.
- **Worker Green** (`oklch(0.74 0.16 152)`): 워커 alive, 정상 freshness dot, 복사 완료(✓) 피드백.
- **Secret Red** (`oklch(0.67 0.22 25)`): masked=false일 때 raw 데이터 노출 경고 배너 배경 — 가장 채도 높은 빨강. 절대 외부 공유 금지 신호.

### Neutral
순수 무채색(chroma 0) 7단 램프. page < panel elevation을 명도 단차로만 만든다.
- **Console Black** (`oklch(0.152 0 0)`): 본문 배경. dark default. topbar 배경.
- **Sidebar Black** (`oklch(0.165 0 0)`): 좌측 사이드바 — 콘텐츠 표면보다 살짝 어두운 두 번째 중립 레이어.
- **Surface Chip** (`oklch(0.185 0 0)`): code chip, pipe-node pill, 타임라인 노드 배경.
- **Panel Graphite** (`oklch(0.188 0 0)`): 모든 패널·hero 패널 배경 — 페이지보다 한 단 밝아 떠 보인다.
- **Hairline** (`oklch(0.272 0 0)`): 패널·구분선 1px 테두리. 이 시스템의 깊이는 그림자가 아니라 hairline이 만든다.
- **Ink** (`oklch(0.975 0 0)`): 본문·제목 텍스트. dark 테마에서 거의 흰색.
- **Muted** (`oklch(0.615 0 0)`) / **Faint** (`oklch(0.48 0 0)`): 보조·메타 텍스트, 아이콘 기본색, count.

### Named Rules
**The One Voice Rule.** signal-blue는 한 viewport에 단 한 곳에만 산다(강조/active/primary). 그 희소성이 핵심이다. 둘 이상 등장하면 하나는 틀렸다.

**The Exception-Only Rule.** 빨강과 앰버는 예외 신호다 — 차단·stale·secret이 *아닐 때* 이 두 색은 화면에 0번 등장한다. alert fatigue 없는 콘솔이 목표다.

## 3. Typography

**Body / Display Font:** Pretendard Variable (fallback: system-ui, Segoe UI Variable, Apple SD Gothic Neo, Noto Sans KR)
**Label/Mono Font:** ui-monospace 시스템 스택 (SF Mono, Cascadia Mono, Consolas)

**Character:** 단일 한국어 친화 sans 하나가 제목·버튼·라벨·본문·데이터를 전부 짊어진다. 위계는 패밀리 대비가 아니라 크기·굵기·자간 대비로만 만든다. Pretendard Variable은 `vendor/PretendardVariable.woff2`를 base64로 inline한 `@font-face`로 산출물에 self-contained 임베드된다 — 외부 fetch는 0이다(`data:` URI는 네트워크 surface가 아니므로 H13 외부 fetch invariant 통과). 빌드 시 woff2 파일이 없으면 fail-open(빈 `@font-face`)으로 system sans 스택에 graceful degrade.

### Hierarchy
- **Display / Verdict** (600, 1.3125rem ≈ 21px, line-height 1.42, letter-spacing -0.02em): 개요 hero의 1줄 판정. 이 시스템에서 가장 큰 글자이며 화면당 하나뿐이다. `text-wrap: balance`로 줄을 고르게 끊는다.
- **Title** (600, 1.05rem, letter-spacing -0.01em): 각 page 상단의 page-title("게이트 파이프라인", "활동 · 기록").
- **Panel Title** (600, 0.85rem, letter-spacing -0.008em): 패널 head의 제목 — 작지만 굵어 head/body anatomy를 가른다.
- **Body** (400, 14px, line-height 1.55): 모든 본문·메타. 산문은 65–75ch, 표·콤팩트 UI는 더 빽빽하게 가도 된다.
- **Label** (600, 0.69rem, letter-spacing 0.05em, UPPERCASE): 사이드바 섹션 라벨("페이지") 한 군데. 대문자 변환은 이 라벨에 한정한다.

### Named Rules
**The Fixed-Scale Rule.** rem 고정 스케일만 쓴다. clamp() 유동 타이포는 금지 — 데스크톱 단일 DPI 가정이고, 사이드바 안에서 줄어드는 유동 h1은 더 나빠진다.

**The No-Metric-Type Rule.** 1.6rem 이상의 hero-metric 타이포는 금지(H6). verdict h1(1.3125rem)만 carve-out. 거대 숫자는 SaaS 대시보드의 언어이지 브리핑의 언어가 아니다.

## 4. Elevation

이 시스템은 그림자를 거의 쓰지 않는다. 깊이는 **명도 단차(tonal layering)와 hairline 테두리**가 만든다: 페이지(`oklch(0.152)`) < 패널(`oklch(0.188)`)의 한 단 밝기 차이 + 1px hairline이 "떠 있음"을 전달한다. 그 위에 단 하나, 거의 보이지 않는 속삭임 그림자만 패널에 얹는다.

### Shadow Vocabulary
- **Panel Whisper** (`box-shadow: 0 1px 2px oklch(0 0 0 / 0.28), 0 1px 1px oklch(0 0 0 / 0.16)`): 모든 `.panel`·`.hero-panel`에 적용되는 유일한 그림자. 카드를 "들어올리는" 게 아니라 페이지에서 살짝 떼어내는 정도. light 테마에서는 더 옅은 중립 그림자로 미러링.

### Named Rules
**The Hairline-First Rule.** 깊이는 그림자가 아니라 hairline + 명도 단차로 만든다. 큰 blur·짙은 drop-shadow·glow는 금지. 그림자가 눈에 띄면 이미 과하다.

## 5. Components

### Buttons
- **Shape:** 부드러운 모서리(6px, `rounded.sm`).
- **Copy 버튼** (`.copy-btn`): panel-graphite 배경 + ink 텍스트 + hairline-strong 테두리, padding `0.2rem 0.6rem`. 슬래시 커맨드처럼 보이는 next-action에만 붙는다(일반 plan 라벨은 plain 텍스트).
- **Hover / Focus:** hover 시 panel-hover로 배경 상승. focus-visible은 signal-blue 2px outline(offset 2px).
- **Copied 상태:** `data-copied="1"`이면 worker-green 텍스트·테두리 + `✓복사됨` 접미사. 색 + 텍스트 이중 표기.

### Chips & Pills
- **Pipe Node** (`.pipe-node`): surface-chip 배경, 완전 둥근 pill(999px), padding `0.1rem 0.55rem`. 게이트 스테퍼의 상태 노드(✓/◐/○/✗) — H17 카드중첩 금지의 carve-out affordance.
- **Severity Tag** (`.severity-tag`): 배경 없는 색-only 태그. critical/high=alert-red, medium=amber-stale, low=muted. 모두 굵기 600으로 강조하되 칩 chrome은 두르지 않는다(H12).

### Cards / Containers
- **Corner Style:** 9px (`rounded.md`).
- **Background:** panel-graphite, 페이지보다 한 단 밝게.
- **Border:** 1px hairline. 차단/위험 패널은 `.attention`으로 테두리가 alert-red로 전환.
- **Shadow:** Elevation의 Panel Whisper 하나만.
- **Anatomy:** `.panel-head`(아이콘 + 제목 + 옵션 count) / `.panel-body`. 패널 안에 또 다른 패널을 넣지 않는다(H17 DOM-aware, 카드 중첩 금지). hero 패널은 `h1.verdict` + `.hero-next`(복사 가능 next-action) + `.hero-meta`(인라인 4축).
- **Internal Padding:** 패널 body `1rem`, hero `1.3rem 1.4rem 1.2rem`.

### Detail Drawer (v1.18.1 M3)
- **What:** 미해결 질문·위험·타임라인(receipt)·마일스톤 항목을 클릭/Enter/Space로 열면 우측에서 슬라이드-인하는 native `<dialog class="drawer">` overlay. 항목별 상세(제목·sev 태그·rows·sections·다음 액션)를 표시한다. "요약 우선, 깊이는 on-demand"(PRODUCT.md Compact 원칙)의 surface.
- **Anatomy:** `.drawer-head`(kind 라벨 + 닫기 버튼) / `.drawer-body`(`.d-title` → `.d-tags` → `.d-rows` → `.d-sec` → `.d-action`). `width: min(440px, 92vw)`, 우측 hairline + 좌향 그림자.
- **Data:** 항목↔상세는 **안정 키**(`data-detail-id` = `oq:<planPath>#L<line>` / `risk:<planPath>#r<ordinal>` / `receipt:<rowKey>` / `ms:<planPath>`)로 매핑한다 — 인덱스 매핑 금지. 상세는 `<script type="application/json" id="drawer-data">`에 유니코드-escape JSON으로 임베드. 모든 값은 derive source 유래(더미 0). 부재 필드는 placeholder 없이 graceful degrade.
- **주입 경계(보안):** prose(title·section 본문)만 서버 `renderProseHtml` 안전 HTML → 클라이언트 `innerHTML`. 그 외(tags/rows/action)는 raw 텍스트 → `textContent`. raw derive 값이 `innerHTML`로 가는 경로 0. serializer는 `<`/`>`/`&`/LS/PS를 `\uXXXX`로 escape해 `</script>` break-out을 차단.
- **a11y/motion:** trigger는 `role=button` + `tabindex=0` + `aria-haspopup=dialog`, `<dialog>`는 `aria-label`. `showModal()` 자동 focus + Esc/backdrop 닫힘 + 닫은 뒤 trigger로 focus 복귀. `@starting-style` slide-in은 `prefers-reduced-motion`에서 즉시 전환. no-JS 시 항목은 일반 표시(클릭 무동작) — progressive enhancement.
- **invariant carve-out:** 드로어 `::backdrop`의 `backdrop-filter: blur(1px)`는 의도된 overlay scrim → **H7(glassmorphism) carve-out**(`::backdrop` rule block strip 후 스캔). `.drawer-close`(7px)·`.d-rows`(8px)·`.clickable`(radius-sm)는 명시 affordance → **H3 carve-out**. 신규 **H18**이 (i) `<dialog>` aria-label, (ii) trigger 수 == 유일 `data-detail-id` 수 == JSON 키 수(중복 키 hard-fail), (iii) 인덱스 매핑 잔재 부재를 mechanical 강제.

### Navigation
- **Sidebar** (`.sidebar`, 244px sticky full-height): 프로젝트 스위처 + 검색 affordance(현재 `aria-hidden` 시각 placeholder — 필터 활성은 후속 마일스톤) + page nav 레일 + 차단 pin-alert. sidebar-black 배경 + 우측 hairline.
- **Nav Link** (`.nav-link`): 기본 muted 텍스트 + faint 아이콘, padding `0.44rem 0.6rem`. hover 시 panel-raised 배경 + ink. **active**(현재 route)는 panel-raised 배경 + ink 텍스트 + 굵기 550 + 아이콘 ink화 — 색 단독이 아니라 배경·굵기·아이콘 복합 신호.
- **Routing:** 3 route(`#route-overview` / `#route-pipeline` / `#route-activity`)를 순수 CSS `:target` + `:has()`로 전환한다. JS 0. no-JS 환경에서 개요가 default 노출(progressive enhancement). `scroll-margin-top`으로 sticky topbar 밑에 앵커가 가리지 않게 보정.
- **Mobile (≤880px):** 사이드바가 상단 가로 바로 collapse, 검색·라벨·pin-alert는 숨김, nav만 가로 스크롤. 햄버거 메뉴는 도입 안 함.

### Topbar (signature)
- **Style:** sticky, 52px 높이, console-black 배경 + 하단 hairline. 좌측 브레드크럼(`프로젝트 / 상태`), 중앙 절대배치 page-title(현재 route에 따라 `:has()`로 토글), 우측 freshness("X초 전 갱신" + worker-green dot).
- **Stale 전이:** `body[data-stale="1"]`이면 하단 테두리가 amber-stale로, freshness dot도 앰버로 200ms ease-out 전환. JS는 5초마다 `derived-ms` 대비 60s 초과 여부만 검사.

### Icons
Lucide symbol 스프라이트를 inline SVG(viewBox 0 0 24 24)로 1회 emit하고 `<use>`로 참조한다. 외부 fetch 0. 필수 affordance(사이드바·로고·버튼·라벨·패널 head)에만 쓰고 장식 아이콘은 금지. 기본 16px(`.i`), small 13px(`.i-sm`).

## 6. Do's and Don'ts

### Do:
- **Do** 강조색(signal-blue)을 한 viewport에 정확히 1번만 쓴다(The One Voice Rule). active/primary/focus 중 하나에만.
- **Do** 빨강·앰버를 차단·stale·secret *예외*에만 등장시킨다. 정상 상태 화면에는 0번(The Exception-Only Rule).
- **Do** 깊이를 hairline(1px) + 명도 단차(page < panel)로 만든다. 그림자는 Panel Whisper 하나로 충분하다.
- **Do** rem 고정 스케일을 쓴다. 모든 상태색을 색 + 아이콘 + 텍스트로 이중 표기한다(WCAG 2.2 AA, 본문 4.5:1).
- **Do** 첫 화면(개요)을 1줄 verdict + 인라인 4축 메타로 끝낸다. slug·hash·raw JSON은 detail 진입 후에만.
- **Do** verdict를 단정적으로 쓴다. "혹시/아마도" 금지 — AI가 판단을 회피하면 raw finding을 그대로 노출.

### Don't:
- **Don't** SaaS hero-metric 대시보드처럼 보이게 한다 — 거대 숫자, gradient 카드, sparkline 더미 금지. mccp는 metric 광고가 아니라 PM 보고다(H6 hero-metric 금지, verdict h1만 carve-out).
- **Don't** AI-cream "warm minimal" 외관을 쓴다 — cream/sand/warm-neutral 배경, serif heading, 작은 caps eyebrow(`01 · ABOUT`) 금지. 콘솔은 순수 chroma-0 near-black이다.
- **Don't** Bloomberg 터미널을 흉내낸다 — 형광 컬러, tick 단위 깜빡임, 밀도 극대화 금지. 평소 톤은 조용하다.
- **Don't** border-left/right를 1px 초과 컬러 stripe로 쓴다(H4 사이드-stripe 금지). 강조는 full 테두리(`.attention`)나 텍스트 색으로.
- **Don't** auto-fit 카드 그리드(H5), 그라디언트 배경(H8), 글래스모피즘(H7)을 쓴다. 패널 그리드는 명시 `repeat(2, minmax(0,1fr))`.
- **Don't** 패널 안에 패널을 중첩한다(H17 카드중첩 금지, DOM-aware). 단일 `.panel`/`.hero-panel`만 목적 있는 비중첩 affordance.
- **Don't** clamp() 유동 타이포, 1.6rem+ hero-metric 타이포(H6), em-dash(H10), heading depth > 3(H15), 외부 폰트/스크립트 fetch(H13)를 쓴다.
- **Don't** 모션을 장식으로 쓴다. transition은 상태 전이(topbar stale, hover)에만, prefers-reduced-motion에서 전부 off돼도 동작은 동일해야 한다.

---
*Generated 2026-06-23 via `/impeccable document` (코드 scan: `html.js` OKLCH_DARK/LIGHT + LAYOUT + 컴포넌트 함수, v1.17.0 redesign-3 멀티페이지 콘솔). v1.18.1 M3 Detail Drawer + H18 추가. 기계 lint 계약 H1-H18은 `docs/v1.3.0-observability/DESIGN.md` 참조.*
