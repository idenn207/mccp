# v1.3.0 STATUS Dashboard — DESIGN.md (m3-redux)

> Source-of-truth for status.html + STATUS.md renderer visual layer.
> Derived from PRD `v1-3-0-observability-surface-ii.prd.md` §Design Direction
> (line 148-231) + PRODUCT.md Brand Personality / Anti-references. This document
> is what M3 should have produced before code was written.

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
| H2 | max-width 720px on main column. | `main { max-width: <= 720px }` | 880px |
| H3 | NO cards on sections. Sections separated by spacing + 1px border-bottom only. | grep `border-radius` in section/li/td > 0 = fail | grid-cell + li.open-questions + .risks were all card-shaped |
| H4 | NO side-stripe borders. Any `border-left` / `border-right` > 1px is banned. Any `box-shadow: inset Npx 0 0` simulating one is banned. | grep `border-left:\s*[2-9]` + `inset\s+[2-9]px\s+0\s+0` | grid-cell + verdict + risks tr all had 3px left accent |
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

H1–H14 are the **mechanical lint target** for the v1.3.0-design-gate axis (PR
ec4e7a0). Future renderer changes must pass all 14 grep-based checks.

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
