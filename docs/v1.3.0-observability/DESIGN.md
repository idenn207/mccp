# v1.3.0 STATUS Dashboard — DESIGN.md

> Source-of-truth for status.html + STATUS.md renderer visual layer.

> **v1.16.0 재설계 (dashboard-pipeline-chart M3, 2026-06-23) — 아래 m3-redux 방향을 SUPERSEDE.**
> 사용자가 "현재 디자인은 디자인 스킬 없이 만들어져 reference 아님 — 새로 설계"로
> 미학 방향 신규 탐색 + H-invariant 자유 수정에 confirm(impeccable shape, 3 user round).
> 새 방향: **다크 파이프라인 콘솔** — 좌측 섹션 nav 레일(작동 anchor) + 우측 목적 있는
> 비중첩 카드 2D(Vercel 대시보드 베이스, card-in-card 금지). 다크 default + light opt-in.
> PRODUCT.md Brand Personality(Calm·Decisive·Compact) + Anti-references(hero-metric/
> AI-cream/Bloomberg 형광)는 product-level 진실이라 유지. M4(우측 Drawer 상세 + nav
> active-추적 + Tailwind `설명|터미널` prompt)가 이 콘솔 셸 위에 후속.
>
> v1.17.0 redesign-3 개정 invariant: **H1 다크 default + light opt-in**, **H2 `--content-max`
> ≤960 콘텐츠 폭**(멀티페이지 콘솔, 이전 ≤820), **H3 목적 있는 패널(`.panel`/`.hero-panel`)
> 허용**(carve-out, status-strip 폐기·`route`/`nav-rail` affordance 추가), **H17 카드 중첩
> 금지**(DOM-aware). status 4축은 상단 chrome 아닌 개요 hero 인라인 메타. H4/H6/H7
> (side-stripe·hero-metric·glassmorphism 금지) 유지. 아래 §Token system / §Layout / §Header의
> m3-redux 라이트 단일컬럼 서술은 historical — 코드(html.js)·lint(output-constraints.js)가
> canonical. 토큰/레이아웃 실제 값은 `plugins/mccp/scripts/lib/renderer/html.js` 참조.

> 아래는 m3-redux(b204510 이후) 원본 — historical 보존:
> Derived from PRD `v1-3-0-observability-surface-ii.prd.md` §Design Direction
> (line 148-231) + PRODUCT.md Brand Personality / Anti-references.

## Provenance

- M3 ship (b204510 "Linear-style polish") bypassed the impeccable critique loop
  (3겹 silent failure documented in
  `.claude/plans/v1-3-0-design-gate-mechanical-enforcement.plan.md` line 9).
- Re-shaped under `Skill(frontend-design-direction)` first-step + `Skill(impeccable, critique)`
  (Nielsen 15/40 Poor, 8 absolute-ban hits, 4 detector findings).
- PRD overrides anything inherited from b204510.

## Direction (frontend-design-direction axes)

1. **Purpose** — PM-mode solo developer (skypark207) lands in the dashboard
   and identifies in-progress / blocked / next / risk within 60 seconds. The
   surface is a *briefing*, not a *metric console*.
2. **Audience** — single user, desktop chat-adjacent surface, daily repeated.
   Knows the domain (mccp internals); does not need legend or onboarding.
3. **Tone** — utilitarian + calm + compact. Closer to a typed-up exec memo than
   a Datadog board. Linear-editor / Plain-editor adjacency is allowed; Linear-
   *style* dashboard hero is the slop trap.
4. **Memorable detail** — *zero cards, zero side-stripes, zero hero numbers*.
   Information sits on one column, separated by hairline borders and rhythm.
   The "design idea that makes it intentional" is the **absence** of dashboard
   chrome.
5. **Constraints** — single static HTML, no JS framework, no font CDN, derived
   from `.claude/` only, WCAG 2.2 AA, `prefers-reduced-motion` honored,
   `prefers-color-scheme` opt-in for dark.

## Hard invariants (lifted from PRD §Design Direction verbatim, with mechanical lint targets)

| # | Invariant | Lint signal | Where this was broken in b204510 |
|---|-----------|-------------|----------------------------------|
| H1 | Light mode default. Body bg `oklch(0.99 0 0)` true off-white. Dark via `@media (prefers-color-scheme: dark)` only. | `:root --bg` first value lightness >= 0.97 | dark navy `oklch(0.18 0.012 250)` was default |
| H2 | content width cap. `--content-max` 토큰(또는 main max-width) ≤ 960px (v1.17.0: 멀티페이지 패널 그리드 수용, 이전 ≤820). | `--content-max <= 960px` | 880px |
| H3 | NO cards on layout chrome. Sections separated by spacing + 1px border-bottom only. **v1.4.2 carve-out**: `.severity-tag` pill + `.action-prompt code` chip + `.skip-link` + `.copy-btn` + `[role="alert"].s-secret` emergency banner는 interactive affordance / 4-part 컴포넌트 / a11y / alert chrome으로 design intent. **v1.13.0 carve-out**: `.pipe-node`는 게이트 파이프라인 스테퍼의 상태 노드(pill) — GitHub Actions 결의 스테이지 affordance로 design intent(일반 layout 카드화와 구분). 연결선 `.pipe-edge`는 수평 라인(height+background)으로 H4 회피. **v1.14.0 carve-out**: `.tl-node`는 활동 step-chart rail 의 상태 노드 마커(pill) — 동일 affordance. 세로 connector `.tl-rail::before`는 background 라인(`width+background`, `border-left` 미사용)으로 H4 무관 → H4 carve-out 불필요. | selector-aware: `border-radius:\s*[1-9]` hit 중 carve-out selector 매칭 제외 후 count > 0 = fail | grid-cell + li.open-questions + .risks were all card-shaped (b204510) |
| H4 | NO side-stripe borders on layout chrome. Any `border-left` / `border-right` > 1px is banned. Any `box-shadow: inset Npx 0 0` simulating one is banned. **v1.4.2 carve-out**: `blockquote` + `.meta-cue` "왜:" rationale stripe는 4-part 컴포넌트의 핵심 design intent. | selector-aware: `border-left:\s*[2-9]\d*px` + `inset\s+[2-9]\d*px\s+0\s+0` hit 중 carve-out selector 매칭 제외 후 count > 0 = fail | grid-cell + verdict + risks tr all had 3px left accent (b204510) |
| H5 | NO identical card grids. Status 4-axis is **one inline sentence**, not a grid. | grep `repeat(auto-fit,\s*minmax(` in renderer CSS = fail | `.status-grid: repeat(auto-fit, minmax(180px, 1fr))` |
| H6 | NO hero-metric template. No `font-size >= 1.5rem` on count values. | grep numerical token sizes >= 1.5rem on `.grid-value` / similar | 1.65rem giant numbers |
| H7 | NO glassmorphism. No `backdrop-filter`, no `backdrop-blur`. | grep `backdrop-filter` = fail | header sticky `backdrop-filter: blur(8px)` |
| H8 | NO gradient bg. No `color-mix(...)` as fill on body / surface / card. (Token-internal `color-mix` for severity-bg tints is fine because we kill severity-bg entirely.) | grep `color-mix.*background` = fail | 6 grid-cell tone bgs were color-mixed |
| H9 | NO ALL CAPS body. `text-transform: uppercase` allowed only on a single class used at most twice (`.kbd` for keyboard hint, if any). | grep `text-transform:\s*uppercase` count <= 1 declaration | 5 declarations (h2, .grid-label, .sev-pill, 2x th) |
| H10 | NO em dashes in rendered prose. `—` or ` -- ` in body text from derive source must be normalized at render time to `,` or `.` or `:`. Source unchanged (SSoT). | grep `—` count in `.claude/cache/status.html` <= 0 | 16 em dashes in rendered output |
| H11 | Accent is one signal blue `oklch(0.55 0.18 230)`. No purple/violet variants. Severity vocabulary shrinks to 3 tokens: ink (default), signal-red (blocked/critical/secret unified), warn-amber (stale). | grep severity token count `--sev-` <= 3 | 9 `--sev-*` tokens |
| H12 | Status row is verb-led prose, not pills. Severity is expressed by *icon + word*, not by background color or uppercase letter-spaced badge. | grep `.sev-pill` class definition: file must not contain it | `.sev-pill` defined and used in risks + open-questions |
| H13 | font-family: system stack + 1 mono. No custom font CDN. No `Inter` / `Pretendard Variable` / `JetBrains Mono` names. | grep `font-family.*Inter|Pretendard|JetBrains` = fail | full stack `Inter, Pretendard Variable, ..., JetBrains Mono` |
| H14 | Verdict is PM-voice prose, not raw slug. Slugs appear in `<code>` inline within prose, never as the whole 1-line verdict. | derive engine emits `model.verdict.prose` separate from `model.verdict.next_slug` | verdict text was raw slug |
| H15 | Heading depth ≤ 3. h1(verdict) + h2(section) + h3(sub-section) 만 허용. h4+ 금지 — PRD §Design Direction line 149 "(a) 정보 위계 3단계". | HTML body `<h([4-9])` 카운트 == 0 AND STATUS.md *fenced code block strip* (backtick `` `{3,} `` AND tilde `~{3,}` 양쪽) 후 CommonMark ATX `^ {0,3}#{4,6}\s` 카운트 == 0 | (m3-redux baseline은 h1+h2만 emit — 본 rule은 future drift 차단) |
| H16 | NO unrendered markdown literal in HTML body. `**bold**` / `__bold__` paired markers, inline backtick `` `code` `` pairs (raw + entity-encoded backtick/asterisk/underscore: `&#96;`/`&#x60;`/`&grave;` + `&#42;`/`&#x2A;`/`&ast;` + `&#95;`/`&#x5F;`/`&lowbar;` 등 leading-zero/uppercase/named entity variant 모두), markdown link `[text](url)` 패턴, markdownlint code `MD0\d\d` 식별자가 rendered text로 노출되면 안 됨. H10(em-dash punctuation)과 직교 — H10은 prose, H16은 unrendered markup. | HTML body에서 `<code>` / `<pre>` / HTML attribute strip + Python dunder 15종 whitelist(`__init__`/`__name__`/`__main__`/`__file__`/`__doc__`/`__str__`/`__repr__`/`__call__`/`__enter__`/`__exit__`/`__all__`/`__slots__`/`__dict__`/`__iter__`/`__len__`) 제거 후 6 패턴 카운트 == 0: (i) `\*\*[^*\n]+\*\*`, (ii) `\b__[^_\n]+__\b`(dunder strip 후), (iii) `` `[^`\n]+` ``(raw backtick) + 3 entity-encoded variant(backtick/asterisk/underscore — asterisk/underscore는 paired matching), (iv) `\[[^\]]+\]\([^)]+\)`, (v) `\bMD0?\d{2,4}\b` | (m3-redux baseline은 `**`/`__`/`` ` ``/`[](`/MD0xx 가 HTML body에 미노출 — lint-only) |

| H17 | (v1.16.0 신규) 카드 중첩 금지. Vercel 베이스의 핵심 규율: "card 안에 card" 0. `<section class="card">`만이 아니라 임의 block 태그(section/div/article/main/aside)의 `card` class token nesting. carve-out 없음. | HTML body stack-scan: card-class element가 다른 card-class element 내부에 open되면 fail | (M3 재설계 baseline은 flat sibling 카드만 emit) |

H1–H17 are the **mechanical lint target** for the design-gate axis. H1/H2/H3는
v1.16.0(M3 재설계)에서 개정됨(상단 supersede 노트 참조), H17은 신규. Future
renderer changes must pass all 17 grep/scan-based checks (`output-constraints.js`).

### v1.14.0 활동 step-chart (audit-timeline) design intent

dashboard-pipeline-chart PRD M2 — audit-timeline 을 시간순 세로 step-chart rail 로
렌더. GitHub Actions job-run timeline 미학(세로 connector 위 상태 노드).

- **세로 rail, 가로 아님**: live 20행 + 보관 10행 = 30+ 노드 → 가로 step 은 밀도
  불가. 세로 rail 이 흐름(contiguity)을 유지하며 밀도를 감당.
- **connector = background 라인**: `.tl-rail::before { width:2px; background }` —
  `border-left` 미사용(H4 side-stripe ban 회피). 노드 마커 `.tl-node` 만
  `border-radius`(H3 carve-out).
- **emphasis 반전**: pipeline(M1)은 노드 3개 소수 행이라 converged=accent. timeline
  은 20행 log → 같은 매핑이면 accent 벽. cardinality + "개입 필요 scan" 목적 차이로
  **converged 는 quiet(`.tl-done` = muted), pending 만 loud(`.s-stale`)**. accent 는
  timeline 노드에 미사용 → viewport 당 accent ≤ 1(PRD §Design Direction "강조색
  화면당 1개") 보존.
- **항목 수 상한**: timeline 은 list-of-N 결정 surface 가 아닌 flow log → collapse-to-3
  미적용(흐름 파괴). "quiet by default" 는 기존 `MAX_ROWS_LIVE=20` cap + `+N older`
  footnote + archived desaturate 가 충족.
- **데이터 로직 불변**: snapshot read / caps / 정렬 / footnote / briefing / md 출력은
  M1(M5) 그대로 — 시각 레이어(`renderRow` HTML + wrapper + footnote class)만 변환.
- **a11y**: 노드는 색 + 아이콘(✓/◐) + `.sr-only` label 병행(색 단독 금지). briefing
  은 `.tl-body`(div — flow content `<blockquote>` 를 phrasing span 으로 감싸지 않음).

## Token system (true to PRD §Color strategy line 152-169)

```css
:root {
  /* Surfaces — all true off-white, chroma 0 to ≤ 0.005 */
  --bg:        oklch(0.99 0    0);      /* true off-white body */
  --surface:   oklch(0.97 0.003 250);   /* micro-elevation for table thead only */
  --border:    oklch(0.92 0.005 250);   /* hairline section separator */
  --border-2:  oklch(0.85 0.006 250);   /* table cell separator */

  /* Text */
  --ink:       oklch(0.20 0.005 250);   /* body — 4.5:1 against --bg */
  --ink-2:     oklch(0.32 0.006 250);   /* secondary text */
  --muted:     oklch(0.48 0.008 250);   /* meta, timestamps — verified ≥4.5:1 */

  /* Single accent — PRD-mandated signal blue */
  --accent:    oklch(0.55 0.18 230);    /* links, current selection, in-progress */

  /* Three signal colors — no others */
  --signal:    oklch(0.55 0.18 25);     /* red — blocked, critical, secret unified */
  --warn:      oklch(0.60 0.15 80);     /* amber — stale 60s+ */
  --ok:        oklch(0.50 0.14 145);    /* green — convergence, terminal_ok */
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg:       oklch(0.16 0.008 250);
    --surface:  oklch(0.20 0.010 250);
    --border:   oklch(0.28 0.012 250);
    --border-2: oklch(0.34 0.014 250);
    --ink:      oklch(0.95 0.005 250);
    --ink-2:    oklch(0.82 0.008 250);
    --muted:    oklch(0.66 0.012 250);
    --accent:   oklch(0.72 0.16 230);
    --signal:   oklch(0.70 0.20 25);
    --warn:     oklch(0.78 0.16 80);
    --ok:       oklch(0.68 0.16 145);
  }
}
```

**Total color tokens: 6 surface + 3 ink + 4 signal/accent = 13.** Previous: 26.

## Typography (true to PRD §Typography line 171-184)

```css
body {
  font-family: ui-sans-serif, system-ui, -apple-system,
               "Segoe UI Variable", "Apple SD Gothic Neo",
               "Noto Sans KR", sans-serif;
  font-size: 15px;       /* base */
  line-height: 1.55;
  color: var(--ink);
  background: var(--bg);
}
code, .mono {
  font-family: ui-monospace, "SF Mono", Consolas,
               "Liberation Mono", monospace;
  font-size: 0.92em;
  color: var(--ink-2);
}
h1 { font-size: 1.5rem; font-weight: 600; text-wrap: balance; }
h2 { font-size: 1.0625rem; font-weight: 600; text-wrap: balance; margin: 0 0 8px; }
.verdict { font-size: 1.125rem; line-height: 1.5; }
.meta    { font-size: 0.8125rem; color: var(--muted); }
```

**Scale steps: 0.8125, 0.92, 1.0, 1.0625, 1.125, 1.5 rem.** 5 distinct steps,
ratio 1.06–1.33. Detector `flat-type-hierarchy` warns about 1.7+ jumps; we
intentionally allow gentler steps because PRD line 176 mandates *modest* scale
("1.25 ratio. base 15~16px, compact 우선"). The detector finding gets a known
exception comment in the source.

No `text-transform: uppercase`. No `letter-spacing` other than browser default
on body (`text-wrap: balance` on h1–h3, `text-wrap: pretty` on prose `<p>`).

## Layout (true to PRD §Layout line 186-193)

```
+-- header (NOT sticky, NOT blurred) ------------------+
|   mccp Status         Refreshed: 2s ago  [⏱ stale?] |  (~48px tall)
+------------------------------------------------------+
|                                                      |
|  Verdict (1 line, h1-sized, max 1 wrap)              |
|                                                      |
+-- 1px border-bottom ---------------------------------+
|                                                      |
|  Status                                              |
|  진행 중 2, 차단 1, 다음 v0-3-5-codex-disabled-honor, |  (inline sentence)
|  risks 1 open                                        |
|                                                      |
+-- 1px border-bottom ---------------------------------+
|                                                      |
|  Worker fanout      ← only present if envelope >0    |
|                                                      |
+-- 1px border-bottom ---------------------------------+
|  ... Timeline, Open Questions, Risks ...             |
+------------------------------------------------------+
```

- `<main>` `max-width: 720px; margin: 0 auto; padding: 24px 24px 80px;`
- Sections: `<section>` with `padding: 24px 0;` and `border-top: 1px solid
  var(--border);`. No `background`, no `border-radius`, no card wrapper.
- Status row is a single `<p>`, not a grid. Counts inline: `진행 중 <b>2</b>,
  차단 <b>1</b>, 다음 <code>v0-3-5-codex-disabled-honor</code>, risks <b>1</b>
  open`. `<b>` carries weight 600, no color change unless signal.
- Worker fanout uses a plain `<table>`. No card wrapper, no `bg-elev`, no
  rounded corners. `border-collapse: collapse` + `border-bottom: 1px solid
  var(--border-2)` on `tr`.
- Open questions are a `<ul>` with `<li>` rows. Severity comes from a leading
  small lowercase tag (`<span class="tag tag-critical">critical</span>`) +
  `<b>` text. No card, no pill, no UPPERCASE.
- Risks are a plain `<table>` with `th { font-weight: 600; color: var(--muted);
  text-align: left; font-size: 0.8125rem; }` (sentence case, not UPPERCASE).

## Severity vocabulary (true to PRD §Color line 169 — color+icon+text 3중)

| Token | Color | Icon | Text label | When |
|-------|-------|------|------------|------|
| `signal` | `--signal` red | `⛔` | "차단" / "critical" / "secret" | blocked work / receipts critical / secret detected (all unified) |
| `warn` | `--warn` amber | `⏱` | "stale" | cache > 60s, snapshot > 30d gap |
| `accent` | `--accent` blue | `→` | "다음" | next action (single per page) |
| `ok` | `--ok` green | `✓` | "수렴" | terminal_ok receipts on timeline |
| (default) | `--ink` | — | — | everything else (in-progress, idle, neutral) |

No `low` / `medium` / `high` color tier. Severity within risks/open-questions
uses a *small textual prefix* (`critical`, `high`, `medium`, `low`) in
`<span class="tag">` weight 500 lowercase, no background, no border. The signal
red is reserved for `critical` only, and only when the row is genuinely
blocking — not as a generic decoration.

## Motion (PRD line 195-204 — almost none)

- No transitions on page load.
- Stale chip: 240ms `opacity` crossfade only.
- `@media (prefers-reduced-motion: reduce)`: `transition: none` everywhere.

## Copy normalization layer (em-dash + slop strings)

Renderer applies a `normalizeProse(text)` step on derive output before
inserting into HTML body:

1. `—` (U+2014 em dash) → `,` (or `:` if followed by capital, or `.` if
   sentence-ending). Single deterministic substitution.
2. ` -- ` (double hyphen) → ` , `.
3. " - " (single hyphen surrounded by spaces) preserved (legitimate
   parenthetical).
4. Source files (PRD, STATE.md, receipt summaries) are untouched. Normalization
   is *render-time only* — SSoT invariant preserved.

This satisfies detector `em-dash-overuse` while keeping derive sources
authoritative.

## Verdict prose contract

Derive engine `model.verdict` must produce two separate strings:

```js
model.verdict = {
  prose: "2 findings deferred, next: PR review for v0-3-5",  // PM voice
  next_slug: "v0-3-5-codex-disabled-honor",                  // raw identifier
  tone: "neutral" | "blocked" | "stale" | "secret" | "terminal_ok" | "in_progress",
};
```

Renderer uses `model.verdict.prose` as the h1 sentence. `model.verdict.next_slug`
appears in the Status row as `<code>v0-3-5-codex-disabled-honor</code>`. The
verdict is **never** the raw slug.

If derive engine cannot synthesize prose (no Codex/LLM available), fall back to
a deterministic template: `"{N} findings active, next: {next_slug or '없음'}"`.
Never emit the slug alone.

## Header (NOT sticky)

PRD line 192 mandates sticky header. We honor that, **without backdrop-filter**:

```css
header {
  position: sticky;
  top: 0;
  background: var(--bg);             /* solid, no blur */
  border-bottom: 1px solid var(--border);
  padding: 14px 24px;
}
body[data-stale="1"] header {
  border-bottom-color: var(--warn);  /* status via border tint, not pill */
}
```

Stale state surfaces via *header border color* + an inline text suffix
(`Refreshed 2분 전 · stale`). No floating pill.

## What's intentionally removed

- All severity pills (`.sev-pill` class definition gone).
- All grid layouts (status-grid, worker-fanout grid).
- All cards (background-on-section, border-radius on rows).
- All side-stripe borders (3px left accents, inset box-shadow accents).
- `backdrop-filter` (header glassmorphism).
- Tabular-nums and feature-settings (`'cv11', 'ss01'`) — irrelevant for system
  stack and adds 1KB of CSS for no visual gain.
- Footer attribution line (`Derived from .claude/ via plugins/mccp/scripts/derive`)
  — PM doesn't need to know the codepath.

## Test contract (sections.test.js + html.test.js)

Existing 89 tests will need updates:

- Drop assertions that look for `.status-grid` class, `.sev-pill s-*`,
  `.grid-cell[data-tone=*]`, `text-transform: uppercase`, `backdrop-filter`,
  `border-left: 3px`.
- Add assertions for: max-width 720px, no severity pills, status row is
  single `<p>`, em-dash normalized in output, light-mode default tokens.
- The 14 lint checks (H1–H14) become a new test file
  `tests/design-invariants.test.js`.

Target: 89 → ~92 tests, 0 regressions in derive/snapshot/trigger/receipt.

---

*Co-shaped 2026-06-20 via `Skill(frontend-design-direction)` first-step + `Skill(impeccable, critique)` (Nielsen 15/40 Poor, 8 absolute-ban hits). Replaces b204510 visual layer. Locked to PRD §Design Direction line 148-231 verbatim.*

---

## v1.17.0 — dashboard-console-redesign M1 (승인 sample 이식 + H-invariant 개정)

승인된 `.claude/cache/dashboard-sample.html`(2026-06-23 사용자 confirm)을 단일 시각
canonical 로 삼아 앱 셸 + 토큰을 `html.js` 에 이식. 미감 방향 재탐색 종료 — sample 이
계약이다. sample 과 충돌하는 lint 계약 4건을 개정(나머지 H1/H5/H6/H8/H10~H12/H14~H17 불변):

- **H2 `≤ 960 → ≤ 1080`** — sample 콘솔이 2-col 패널 그리드를 담는 `--content-max:1080px`.
  nav 레일 폭(`--sidebar-w`)은 별도라 무관.
- **H3 selector-aware carve-out 유지(magnitude 천장 폐기) + sample frozen 집합 확장**
  (Codex Plan-Codex R1 F1) — sample 이 frozen canonical 이라 carve 집합은 bounded.
  추가 affordance: switcher/sw-mark/sw-badge/search/kbd/pin-alert/pa-btn/c-mark/
  tb-icon-btn/node-mark/ms-check/sev/inline-prompt/freshness/audit-node/dot.
  일반 layout chrome(section/div/topbar/sidebar/content)은 carve 밖 — radius 추가 시
  H3 FIRE. `console-shell.test.js` drift fixture 가 이 가드를 증명.
- **H7 룰 불변, sample 측 수정** — sample topbar `backdrop-filter` 제거 → 불투명 bg.
  glassmorphism absolute-ban 가드 보존(외형 ~95% 동일).
- **H13 font-family banlist → 외부 fetch invariant 재정의** (Codex Plan-Codex R1 F3) —
  이전엔 "Pretendard 로컬 family-name 참조"(fetch 아님)까지 막는 과잉. 이제 렌더 산출물
  전체(css+html)의 외부 fetch surface(`@import`/`url(http|//)`/`<link|script|img|use src|href=http|//>`)
  를 mechanical 검출. self-contained 산출물(inline jQuery/sprite/style + 로컬 폰트)은 green.

### 폰트 정책 (PRD OQ #1 — 사용자 결정: vendored)

Pretendard self-contained = **vendored woff2 base64 `@font-face`**(`FONT_FACE` 상수,
`vendor/PretendardVariable.woff2` 2.0MB OFL-1.1 → `data:font/woff2;base64` inline,
외부 fetch 0). `data:` URI 는 네트워크 surface 가 아니라 H13 외부-fetch invariant 통과.
woff2 누락 시 fail-open(빈 문자열) → body font-family 의 system 스택으로 graceful degrade.
tradeoff: 매 렌더 산출물에 ~2.7MB base64 가 inline 돼 `status.html` ~3.15MB(로컬 캐시
파일이라 수용). 사용자가 시각 100% 일치를 위해 로컬 family-name 참조 대신 vendored 선택.

### IA — 위험·질문 전용 route (사용자 결정, sample 3-route 에서 의도적 이탈)

승인 sample 의 nav 는 3-route(개요/파이프라인/활동·기록)였으나, 위험 + 미해결 질문은
attention surface(진입점 우선순위가 다름)라 활동·기록에서 분리해 **4번째 전용 route**
(`route-attention`, nav 라벨 "위험 · 질문", `ic-alert`)로 격상. `:target` 라우팅 +
tb-title + nav active 셀렉터 체인에 `attention` 추가, `console-shell.test.js` 가 가드.
항목별 상세 드로어(native dialog + JS)는 M3 — 본 route 가 그 진입점이 된다.

scope: M1 = 셸 + 토큰 + invariant 개정 + vendored 폰트 + 위험·질문 route 분리.
섹션 내부 마크업 + 실데이터 추출 = M2, 우측 드로어 = M3, STATUS.md 동등본 = M4.

> 현재 상태(Dashboard Data Exploration M1 기준): 위 4번째 attention route 는 이후
> 위험(`#route-risks`)·질문(`#route-questions`)으로 다시 분리되어 **현재 5 route**
> (개요/파이프라인/위험/질문/활동·기록)다. 라우팅은 여전히 CSS-only(`:target`+`:has()`)
> 이고, 데이터 탐색 레이어(PRD 그룹핑 등)만 progressive-enhancement JS 를 얹는다
> (canonical 서술은 루트 `DESIGN.md` Routing/Progressive Enhancement 절).

### M2 — 섹션 fidelity + prose 파이프라인 (v1.18.0)

M1 셸 위에서 각 섹션 내부 마크업을 승인 sample 의 class anatomy 로 충실 이식하고
(stack-list/li-item/sev/pipe-stages/audit-row/milestone-item), 모든 더미 자리를 derive
실데이터로 채웠다. **샘플 섹션 마크업이 계약** — `section-fidelity.test.js` 가 각 섹션의
sample anatomy emit + deprecated 구조 class 속성 0 을 mechanical 가드한다.

핵심은 H10/H16 의 **데이터-driven 해소**(룰 본체 불변, 산출물만 clean):

- `format-utils.renderProseHtml/renderProseMd` 공용 헬퍼가 전 섹션 prose 에 적용.
  html 은 normalizeProse(em-dash→comma) 후 inline-markdown(code/bold/link, GFM 이중
  백틱 포함)을 실제 HTML 로 렌더 + MD0xx 를 `<code>` 로 중성화 + 나머지 escape. md 는
  normalizeProse 만(markdown 마커는 정당 — H16 은 html-only).
- bold 내부 중첩 코드는 재귀 렌더로 `<code>` 화 → H16 strip.
- `action-prompt.cleanArg` 가 복사 명령 인자의 마커/em-dash/MD0xx 를 plain 으로 강등 —
  data-copy 속성(H16 carve-out 밖)이 마커를 품지 않게.
- 섹션 md/html 템플릿의 하드코드 ` — ` separator 도 `·`/`,` 로 정리(emitted fragment
  전체 clean).

is-block/is-bad/active 는 공유 `parsers/decision-state.deriveDecisionState` 가 (decision,
gate)별 latest(created_at/round)를 시간순으로 골라 판정한다 — `converged===false` 단순
판정 폐기. divergent(round≥2 미수렴)=blocked, 첫 라운드 미수렴=active(in-progress).
pipeline·timeline·status-grid 가 이 단일 SSoT 를 소비(스키마 확장 0).
