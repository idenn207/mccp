# Plan: Dashboard Console Redesign — M1 콘솔 셸 + 토큰 이식

**Source PRD**: `.claude/prds/dashboard-console-redesign.prd.md`
**Selected Milestone**: M1 — 콘솔 셸 + 토큰 이식 (Delivery Milestones #1)
**Complexity**: Large

## Summary

승인된 `.claude/cache/dashboard-sample.html`을 단일 시각 명세로 삼아, 그 **앱 셸과 디자인 토큰**을 실 렌더러(`html.js`)에 이식한다. 좌측 사이드바(프로젝트 스위처 · 검색 affordance · 아이콘 nav 레일 · 차단 pin-alert), 상단바(브레드크럼 · 중앙 페이지 타이틀 · freshness · 새로고침), near-monochrome OKLCH 토큰, Pretendard self-contained, Lucide symbol 스프라이트, CSS `:target` 라우팅, panel head/body/foot anatomy, 880px 반응형을 셸로 깐다. 섹션 콘텐츠는 **기존 derive 데이터를 새 panel anatomy 안에 정적 rehouse**만 하고(샘플 마크업 충실 이식·실데이터 추출은 M2), 충돌하는 H-invariant(H2/H3/H7/H13)를 샘플 기준으로 개정한다.

## Scope boundary (이 milestone가 닫는 것 / 닫지 않는 것)

| 영역 | M1 (이 plan) | 이후 |
|---|---|---|
| 사이드바 셸 (스위처/검색/nav 레일+아이콘/pin-alert) | ✅ 이식 + 기존 신호 wiring | — |
| 상단바 (브레드크럼/중앙 타이틀/freshness/refresh) | ✅ 이식 | — |
| 토큰 (near-mono OKLCH dark+light) | ✅ 교체 | — |
| Pretendard self-contained + Lucide 스프라이트 | ✅ | — |
| CSS `:target` 라우팅 (개요/파이프라인/활동) | ✅ 유지·이식 | — |
| panel head/body/foot anatomy (CSS + 컨테이너) | ✅ scaffold | — |
| 섹션 **내부 마크업** (pipe-row 그리드/audit-row/stack-list+sev/axis-legend/hero verdict layout) | ⛔ 기존 마크업 그대로 panel 안에 rehouse | **M2** 샘플 마크업 + 실데이터 추출 |
| 우측 상세 드로어 (native dialog + JS) | ⛔ | **M3** |
| STATUS.md plain-text 동등본 | ⛔ | **M4** |

> 이 plan은 STATE.md의 redesign-2 (구 `dashboard-pipeline-chart.prd.md` 점진 경로)를 **대체**한다. 사용자가 impeccable craft로 승인 샘플을 확정했으므로, 관성적 incremental 대신 "샘플 → 렌더러 이식"의 fidelity를 계약으로 삼는다. 현 `html.js`의 redesign-3 셸이 교체 대상 출발점이다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `renderer/html.js:36` (`const OKLCH_DARK = ...`) | 토큰·레이아웃·스프라이트를 JS template-literal 상수로. 섹션 모듈은 `{ html }` 객체 export |
| Errors | `renderer/html.js:11` (JQUERY try/catch) · `renderer/index.js:150` (lint degraded) | fail-open: 옵셔널 asset(폰트/스프라이트/jQuery)은 try/catch + 누락 시 baseline 렌더, throw 금지 |
| Lint contract | `renderer/output-constraints.js:44` (`RULES`) | H-rule = `{ id, severity, check({css,html,md}) }` 순수함수. carve-out은 selector-context 정규식 |
| Tests | `renderer/tests/design-invariants.test.js:32` | `renderStatus(...).design_constraint_violations` 가 `[]` 임을 assert. node:test |
| Composition | `renderer/html.js:424` (`renderHtml`) | `parts.push(...)` 문자열 조립 + `escapeHtml`/`escapeAttr` 경유. 섹션은 배열 destructure |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | 토큰(near-mono OKLCH) 교체, LAYOUT 셸 CSS(사이드바 스위처/검색/nav 레일/pin-alert/topbar/panel anatomy/`:target`/880 반응형/page-foot/`.i` 아이콘), `ICON_SPRITE` 상수 추가, `renderHtml` 셸 조립 재작성, `renderPanel`을 head/body/foot anatomy로, `--font-sans` Pretendard |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | H2(960→1080) · H3(radius 개정) · H7(backdrop-filter) · H13(Pretendard self-contained) 룰 개정 + carve-out/comment |
| `plugins/mccp/scripts/lib/renderer/tests/header-hoist.test.js` | UPDATE | 상단바(브레드크럼·중앙 타이틀·freshness)/스위처 구조로 assertion 갱신 |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATE | 사이드바(스위처+검색+nav 레일+아이콘)/route assertion 갱신 |
| `plugins/mccp/scripts/lib/renderer/tests/responsive-layout.test.js` | UPDATE | 720→880 breakpoint, `--sidebar-width`→`--sidebar-w` |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | UPDATE | (Codex F2) `:150` `<section class="panel"><h3>` → panel-head 계약 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | (Codex F2) `:62-65` h3 패널 라벨 → panel-title 계약 |
| `plugins/mccp/scripts/lib/renderer/tests/console-shell.test.js` | CREATE | 샘플-fidelity 셸 회귀 가드(스위처/검색/pin-alert/topbar 브레드크럼/중앙 page-title/Lucide 스프라이트/panel head·body·foot) + 패널당 canonical title 단일 |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE | H2/H3/H7/H13 개정 근거 + Pretendard self-contained 정책을 canonical 기록 (PRD §invariant 개정 요구) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | milestone ship version bump (현재 → 다음 minor, §3.7) |

## H-invariant 개정 인벤토리 (M1 핵심 — 샘플 충돌만)

> 샘플 CSS를 모든 H-rule에 통과시킨 충돌 인벤토리. M1 셸+토큰 범위에서 **fire하는 룰만** 개정. 미충돌 룰(H1/H5/H6/H8/H10/H11/H12/H14/H15/H16/H17)은 손대지 않음. H9(uppercase ≤1)는 M1 셸에서 `rail-label` 1건만 추가 → 여전히 통과, **M2로 이연**.

| Rule | 현재 | 샘플 충돌 | 개정안 (권장) |
|---|---|---|---|
| **H2** | `--content-max ≤ 960px` | 샘플 `--content-max: 1080px` (2-col 패널 그리드 폭) | 임계 `≤ 1080`으로 상향. nav 레일 폭은 별도 토큰이라 무관 |
| **H3** | layout chrome `border-radius ≥1` 금지 + carve-out 화이트리스트 | 샘플 셸이 6~9px radius 전면 사용(switcher/search/sw-mark/pin-alert/pa-btn/c-mark/tb-icon-btn…). carve-out 매 cycle 비대 | **selector-aware carve-out 유지 + 샘플 frozen 집합으로 확장** (Codex R1 F1 흡수 — magnitude 천장 폐기). 샘플이 승인 canonical로 frozen이므로 carve-out 집합은 **bounded**(무한 증식 아님). 명시 affordance 클래스(switcher/sw-mark/sw-badge/search/kbd/pin-alert/pa-btn/c-mark/tb-icon-btn/node-mark/ms-check/sev/inline-prompt/freshness dot/audit-node + 기존 panel/hero-panel/nav-rail/route)만 carve. **drift fixture 신설** — 일반 `section`/`div`/`.topbar`/`.sidebar`/`.content` 가 radius 추가 시 H3 FAIL(가드 보존 증명). 카드 규율은 H17(중첩 금지) 병행 |
| **H7** | `backdrop-filter`/`backdrop-blur` absolute-ban (glassmorphism) | 샘플 topbar `backdrop-filter: saturate blur(8px)` | **샘플에서 `backdrop-filter` 제거 → 불투명 topbar bg**(샘플도 `background: var(--bg)` solid fallback 보유). 외형 ~95% 동일 + glassmorphism 가드 유지(룰 자체는 개정 불필요 — 샘플 측을 수정). (대안: 단일 sticky topbar 한정 carve-out — 비권장, 가드 약화) |
| **H13** | font-family에 `Inter/Pretendard/JetBrains` 문자열 absolute-ban | 샘플 `--font-sans: 'Pretendard Variable', Pretendard, …` | **mechanical 외부-fetch invariant로 재정의** (Codex R1 F3 흡수 — 단순 banlist 제거 아님). 합성 `css+html` 전체에서 외부 fetch surface 검출: `@import`, `<link rel=stylesheet href=http/protocol-relative>`, `url(http(s)://…)`, `<script|img|use src/href=http>`. Pretendard 로컬 family-name 참조는 허용(fetch 아님). 렌더러는 본디 self-contained(inline jQuery/sprite/style)라 검사는 cheap·green. grep validation은 smoke-check로 강등 — invariant 본체는 H13 |

각 개정은 `docs/.../DESIGN.md`에 1줄 근거 + "샘플이 승인 기준"임을 명기. `design-invariants.test.js`는 개정 후에도 `violations == []` 유지(렌더러 산출이 개정 룰을 통과).

## Open Question 해소 — Pretendard self-contained 전달 (PRD OQ #1)

**권장: 로컬 family-name 참조 + system 스택 graceful fallback (외부 fetch 0, base64 inline 0).**

```css
--font-sans: 'Pretendard Variable', Pretendard, ui-sans-serif, system-ui,
             -apple-system, 'Segoe UI Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
```

- `status.html`은 `.claude/cache/`에 **갱신 트리거마다 재렌더**되는 단일 self-contained 파일이다. 임의 한국어(decision id·plan 명·prose)를 커버하려면 subset이 아닌 사실상 전체-KR Pretendard(수백 KB~MB woff2)를 매 렌더 base64 inline해야 — 로컬 dogfood 파일에 과대 비용.
- 로컬 참조는 **fetch 0·offline 보장·bloat 0**. Pretendard 설치 시 그대로 렌더, 미설치 시 기존 system 스택(Segoe/Apple SD Gothic/Noto Sans KR)으로 graceful degrade — H13 재정의(외부 fetch ban)와 정합.
- **Tradeoff(문서화)**: Pretendard 미설치 머신에선 system 폰트로 보임(시각 100% 동일 보장 아님). 후속에서 vendored woff2 base64로 업그레이드 가능(reversible).
- **기각 대안**: 전체-KR woff2 base64 inline → 렌더마다 MB 단위 bloat. 동적 subset(CDN unicode-range 분할) → 외부 fetch라 self-contained 위반.

> 이 해소는 **사용자 승인 필요**(PRD가 OQ로 명시). Phase 4 확인 시 vendored 선호면 woff2 base64 경로로 전환(번들 크기 수용 + asset 파일 신규).

## Tasks

### Task 1: near-monochrome 토큰 교체
- **Action**: `html.js`의 `OKLCH_DARK`/`OKLCH_LIGHT`를 샘플 토큰으로 교체 — chroma 0 무채색 계조(`--bg/--sidebar/--panel/--panel-2/--panel-hover/--border/--border-2/--ink/--ink-2/--muted/--faint`) + status 전용 채도색(`--accent/--ok/--warn/--bad` + `*-dim` 반투명). 신규 토큰 `--sidebar-w:244px`, `--content-max:1080px`, `--radius:9px`, `--radius-sm:6px`, `--topbar-h:52px`. light 블록도 동형 교체.
- **Mirror**: `html.js:36` 토큰 상수 패턴
- **Validate**: `node -e "const{TOKENS}=require('./plugins/mccp/scripts/lib/renderer/html');console.log(/--bg:\s*oklch\(0\.1/.test(TOKENS)&&/prefers-color-scheme: light/.test(TOKENS))"` → `true`

### Task 2: Lucide symbol 스프라이트 + `.i` 아이콘 CSS
- **Action**: 샘플의 `<svg><defs><symbol>` 스프라이트(terminal/dashboard/branch/activity/clock/flag/help/alert/check/arrow/search/chev-d/refresh/copy/x)를 `ICON_SPRITE` 상수로 inline. `.i`/`.i-sm`(currentColor stroke, 16/13px, viewBox 24 스케일) CSS 추가. 스프라이트는 `<body>` 직후 1회 emit(`aria-hidden`).
- **Mirror**: `html.js:11` 옵셔널 inline asset(try/catch 불필요 — 문자열 리터럴이라 누락 없음)
- **Validate**: 렌더 산출 html에 `id="ic-terminal"` 및 `<svg class="i"><use href="#ic-` 존재

### Task 3: 사이드바 셸 이식 + 기존 신호 wiring
- **Action**: `renderHtml`의 `<aside class="sidebar">`를 샘플 구조로 — `.switcher`(sw-mark 아이콘 + sw-name 프로젝트명 + sw-badge "mccp" + chev), `.search`(아이콘 + "찾기…" + kbd, **정적 affordance** — 실검색은 범위 밖), `.rail-label` "페이지", `.nav-rail`(개요/파이프라인/활동 3 링크 + Lucide 아이콘 + `nav-count` 배지), `.rail-spacer`, `.pin-alert`(차단 N건 — **기존 grid blocked-count 신호로 조건부 렌더**, 0건이면 미표시). `data-route-link` active 룰(`:has(:target)`)은 샘플 `data-route` 키로 보존. 프로젝트명은 derivable 신호(repo basename) 없으면 generic.
- **Mirror**: `html.js:458` 기존 사이드바 조립
- **Validate**: `console-shell.test.js`가 switcher/search/nav-count/pin-alert(blocked>0 fixture) assert

### Task 4: 상단바(topbar) 이식 — H7 개정 동반
- **Action**: 기존 `<header>`를 샘플 `.topbar`로 — `.crumb`(c-mark + 프로젝트명 + sep + "상태"), `.tb-title-wrap`(중앙 절대배치, `data-t` 키로 route별 page-title 토글, `aria-hidden`), `.tb-right`(freshness dot + 상대시각 + refresh 아이콘 버튼). **`backdrop-filter` 제거, 불투명 `background: var(--bg)`** (H7 개정). sticky 유지, `body[data-stale="1"]` border 색 전이 보존.
- **Mirror**: `html.js:469` 기존 header 조립
- **Validate**: 산출 html `.topbar`에 `backdrop-filter` 부재 + `tb-title` `data-t="overview|pipeline|activity"` 3개. `design_constraint_violations`에 H7 없음

### Task 4.5: 외부 source 폰트 정책 + skip-link
- **Action**: `--font-sans`에 Pretendard 로컬 참조(OQ 해소안). **외부 `<link>`/`@import`/CDN 금지**. `.skip-link`를 샘플식(fixed off-screen → focus 시 노출, 그리드 시프트 방지)으로.
- **Mirror**: `html.js:100` 기존 skip-link
- **Validate**: 산출 html에 `https://`/`@import` 폰트 fetch 부재. `design_constraint_violations`에 H13 없음

### Task 5: panel head/body/foot anatomy + 섹션 rehouse
- **Action**: `renderPanel`을 샘플 anatomy로 재작성 — `.panel`(flex col) > `.panel-head`(Lucide 아이콘 + `.panel-title` + 옵션 `.panel-count`) + `.panel-body`(**기존 섹션 `section.html` 그대로 wrap** — 내부 마크업 변경은 M2) + 옵션 `.panel-foot`. 패널별 아이콘 맵(질문→help, 위험→alert, 타임라인→clock, 마일스톤→flag, 파이프라인→branch, 워커/활동→activity). hero는 `.hero-panel`로 rehouse(기존 verdict+next 유지, axis-legend 완전 fidelity는 M2). `.grid`(2-col `repeat(2,minmax(0,1fr))`, `.span-2`), `:target` 라우팅·`.route`·`scroll-margin-top: calc(--topbar-h + …)`·page-foot CSS 이식.
- **Mirror**: `html.js:415` 기존 `renderPanel`
- **Validate**: 산출 html 각 패널에 `panel-head`>`panel-title` + `panel-body`. 기존 섹션 클래스(`.pipeline`/`.tl-rail`/`.oq-item` 등) `panel-body` 안에 보존

### Task 6: 880px 반응형 collapse
- **Action**: 샘플 `@media (max-width: 880px)` — body 1-col, 사이드바 static+가로 reflow(search/rail-label/spacer/pin-alert 숨김, nav-rail 가로), `.grid` 1-col, `.tb-title-wrap` 숨김, content 패딩 축소. 기존 720 블록 교체. `reduced-motion` 블록 보존.
- **Mirror**: `html.js:334` 기존 720 블록
- **Validate**: `responsive-layout.test.js` 880 + `--sidebar-w` 그리드 assert

### Task 7: H-invariant 룰 개정 (output-constraints.js) — Codex R1 F1+F3 흡수
- **Action**:
  - **H2** 임계 1080.
  - **H3** (F1) selector-aware carve-out 유지 — `H3_CARVEOUT` 정규식에 샘플 frozen affordance 클래스 추가(switcher/sw-mark/sw-badge/search/kbd/pin-alert/pa-btn/c-mark/tb-icon-btn/node-mark/ms-check/sev/inline-prompt/freshness/audit-node). magnitude 천장 도입 안 함. carve-out comment에 "샘플 frozen → bounded set" 근거.
  - **H7** 룰 본체 불변(샘플 측에서 backdrop-filter 제거). comment만 v1.x.x 노트.
  - **H13** (F3) mechanical 외부-fetch invariant로 재작성 — `check({css,html})`가 `@import` / `<link rel=stylesheet href=(http|//)` / `url((http|//)…)` / `src|href="(http|//)` 검출. Pretendard family-name은 fetch 아니라 통과. Inter/JetBrains family banlist는 별개 유지하거나 H13에 흡수(주석 명시).
- **Mirror**: `output-constraints.js:32` `H3_CARVEOUT` + `:44` RULES
- **Validate**: `node --test .../design-invariants.test.js` green(violations==[]) + 신규 drift fixture: (a) 일반 `section{border-radius:6px}` → H3 FIRE, (b) `<link href="https://…">` → H13 FIRE, (c) `--content-max:1081px` → H2 FIRE

### Task 8: 셸 테스트 갱신 + panel-anatomy assertion 전수 마이그레이션 (Codex R1 F2 흡수)
- **Action**: 패널 heading을 `<section class="panel"><h3>` → `.panel-head > .panel-title`로 옮기므로 **모든** 기존 panel-heading assertion을 새 contract로 마이그레이션:
  - `header-hoist.test.js` (상단바/스위처 구조)
  - `render-integration.test.js` (사이드바/route)
  - `responsive-layout.test.js` (880 + `--sidebar-w`)
  - `four-part-rendering.test.js:150` (`<section class="panel…"><h3>` → panel-head 계약)
  - `i18n-surface.test.js` (h3 내부 한국어 라벨 → panel-title 내부)
  - **grep 가드**: `grep -rn "panel[^\"]*\"><h3\|<h3>" tests/` 로 잔여 old-heading assertion 0 확인
  - `console-shell.test.js` **신규** — 스위처/검색/pin-alert(blocked fixture)/topbar 브레드크럼/중앙 page-title(data-t 3종)/Lucide 스프라이트/panel head·body·foot/hero-panel 회귀 가드 + **패널당 canonical title source 단일**(중복 h3 없음) assert
- **Mirror**: `tests/header-hoist.test.js:47`, `tests/four-part-rendering.test.js:150`
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 green + old-heading grep 0건

### Task 9: DESIGN.md 개정 기록 + plugin.json bump
- **Action**: `docs/v1.3.0-observability/DESIGN.md`에 H2/H3/H7/H13 개정 + "샘플이 승인 canonical" + Pretendard 정책 1줄씩. `plugin.json` version minor bump(§3.7) + html.js footer/`--sidebar-foot` 버전 라벨 동기.
- **Mirror**: §3.7 milestone 체크리스트
- **Validate**: `node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/.claude-plugin/plugin.json'))"` OK + version이 직전보다 증가

## Validation

```bash
# 렌더러 전체 테스트 (셸 갱신 + 신규 가드 + invariant green)
node --test plugins/mccp/scripts/lib/renderer/tests/

# derive→render 산출물 실제 생성 (회귀 0 + 산출 status.html 사용자 육안 대조)
node plugins/mccp/scripts/derive/cli.js render
#   → .claude/cache/status.html 을 dashboard-sample.html 과 셸·토큰·아이콘·panel anatomy 육안 대조

# design-lint 단독 — 개정 룰이 산출물에서 violations==[]
node -e "const{renderStatus}=require('./plugins/mccp/scripts/lib/renderer');const m=require('./plugins/mccp/scripts/derive').run?null:null" 2>/dev/null || \
node --test plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js

# 외부 fetch 부재 grep (self-contained 불변)
grep -nE "https?://|@import" .claude/cache/status.html && echo "LEAK" || echo "self-contained OK"

# plugin.json 유효 + version bump
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 셸 전면 교체가 기존 섹션 테스트 대량 회귀 | 고 | 섹션 **내부 마크업 불변**(panel-body wrap만) — 회귀를 셸 assertion 3종 + 신규 가드로 국한. Task별 단위 검증 |
| H3 radius 룰 재작성이 anti-slop 가드 약화 | 중 | 클래스 열거 폐기하되 magnitude 천장 유지(과대 bubble ban) + H17 카드중첩 가드 불변. DESIGN.md에 근거 명문화 |
| Pretendard 미설치 머신 시각 불일치 | 중 | system 스택 graceful fallback(이미 현 스택 보유) + tradeoff 문서화. vendored 업그레이드 reversible |
| H7 backdrop 제거로 topbar 외형 차이 | 저 | 샘플도 solid bg fallback 보유 — 불투명화 시 ~95% 동일. glassmorphism 가드 보존이 우선 |
| 브라우저 스크린샷 부재로 시각 회귀 미검출 | 중 | 산출 status.html을 사용자 육안 대조(필수) + 구조 회귀는 console-shell.test.js로 mechanical 가드 + 가능 시 impeccable audit/polish |
| pin-alert/nav-count를 신규 추출로 오인 | 저 | M1은 **기존** grid blocked-count·pipeline decision-count 신호만 wiring(신규 derive 추출은 M2). 부재 시 조건부 미표시 |

## Acceptance
- [ ] 샘플 셸(스위처/검색/nav 레일+아이콘/pin-alert/topbar 브레드크럼/중앙 page-title/Lucide/panel head·body·foot/`:target`/880 반응형)이 `html.js`에 이식됨
- [ ] near-mono OKLCH 토큰 + Pretendard self-contained(외부 fetch 0) 적용
- [ ] 충돌 H-invariant(H2/H3/H7/H13) 개정 + `design_constraint_violations == []`
- [ ] 섹션은 기존 derive 데이터로 새 panel anatomy 안에 정적 rehouse(내부 마크업·실데이터 추출은 M2 이연)
- [ ] `node --test .../renderer/tests/` 전체 green + console-shell 신규 가드 통과 + 0 회귀
- [ ] 산출 `status.html` self-contained grep clean + 사용자 육안 셸 대조
- [ ] DESIGN.md 개정 근거 기록 + plugin.json minor bump
- [ ] 패턴 재사용(토큰 상수/fail-open/lint RULES/node:test), 재발명 아님

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` ## Output Constraints Read 완료
- 4 제약 대조: 정보위계 3단계(H15 보존) ✓ · 강조색 ≤1(near-mono + 단일 --accent, status색 semantic 전용) ✓ · raw markdown marker 금지(H16 미개정) ✓ · 항목 수 상한(`<details>+N 더보기` overflow 보존) ✓
- round 0 verdict: **CONVERGED** (HIGH/CRITICAL finding 0건, cap=2)

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더 UI가 없어 impeccable 명령을 호출하지 않고 implementer 체크리스트만 기록한다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope)
- 라운드 수: 1 (R1 absorption으로 수렴 — ACCEPT_NOW HIGH 1건 plan body에서 해소, cap=1)
- 합치 결론: needs-attention → R1에서 3건 모두 흡수 후 CONVERGED. 게이트 무력화 위험(H3) + 회귀 커버리지 공백(panel rehouse) + invariant 정직성(H13)을 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 H3 magnitude 천장이 anti-slop 가드 무력화 | HIGH | ACCEPT_NOW | selector-aware carve-out 유지 + 샘플 frozen 집합 확장 + drift fixture로 흡수(H-invariant 표·Task 7) |
  | F2 panel rehouse가 four-part/i18n 기존 h3 assertion 깨뜨림 | MEDIUM | ACCEPT_NOW | Task 8을 전수 마이그레이션으로 확장 + grep 가드 + canonical-title 단일 assert로 흡수 |
  | F3 H13 "external-fetch" 재명명이 font만 검사 → 다른 fetch surface 미가드 | MEDIUM | ACCEPT_NOW | H13을 합성 css+html 전체 fetch-surface mechanical invariant로 재작성(Task 7), grep은 smoke 강등 |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0건 — secret/data-loss/migration/auth/external-dest/crypto 무관)
- Codex session 참조: threadId `019ef287-7be9-7f93-988e-c64945da2e5c`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (scope boundary M1/M2/M3, H-invariant 개정 H2/H3/H7/H13, Pretendard 폰트 전략 — 3 findings absorbed R1). No new implement-time architectural decision detected — 구현은 승인된 dashboard-sample.html 의 충실 이식(Files to Change 범위 내). Cross-gate dedupe applied. 실제 design-invariant 회귀는 design-invariants.test.js + 신규 console-shell.test.js 가 mechanical 검증.
