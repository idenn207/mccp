---
name: frontend-design-direction
description: Set an ECC-specific frontend design direction for production UI work. Use when building or improving websites, dashboards, applications, components, landing pages, visual tools, or any web UI that needs stronger product-specific design judgment.
origin: community
---

# Frontend Design Direction

Use this skill when the work is not just making UI function, but making it feel
purposeful, polished, and appropriate to the product domain.

Source: salvaged from stale community PR #1659 by `linus707`.

Note: ECC intentionally does not rebundle the canonical Anthropic
`frontend-design` skill. Install that from `anthropics/skills` when you want the
official upstream skill. This skill is the ECC-specific design-direction salvage
of the useful local guidance from #1659.

## When to Use

- The user asks to build a web page, app, dashboard, artifact, component, or UI.
- The user asks to make an interface more polished, distinctive, beautiful, or
  less generic.
- The implementation needs visual hierarchy, typography, color, motion, layout,
  and interaction choices.
- The current UI works but reads as flat, generic, templated, or mismatched to
  the audience.

## Design Direction

Before coding, choose a specific direction:

1. Purpose: what job does the interface do?
2. Audience: who repeats this workflow, and what do they need to scan first?
3. Tone: utilitarian, editorial, playful, industrial, refined, technical,
   maximal, minimal, dense, calm, or another explicit direction.
4. Memorable detail: one design idea that makes the result feel intentional.
5. Constraints: framework, accessibility, performance, responsiveness, and
   existing design system.

Match the direction to the domain. A SaaS operations tool should usually be
dense, quiet, and scannable. A portfolio, launch page, game, or editorial piece
can be more expressive. Do not force a landing-page composition onto a tool that
needs repeated daily use.

## Implementation Guidance

- Build the actual usable experience as the first screen unless the user
  explicitly asks for marketing copy.
- Use existing project components, tokens, icon libraries, and routing patterns
  before introducing a new visual system.
- Use real or generated visual assets when the interface depends on images,
  products, places, people, gameplay, charts, or inspectable media.
- Prefer contextual typography and spacing over generic oversized hero text.
- Keep palettes multi-dimensional: avoid a UI dominated by one hue family.
- Use CSS variables or existing design tokens so the direction remains
  coherent across states.
- Design responsive constraints explicitly: grids, aspect ratios, min/max
  sizes, stable toolbars, and fixed-format controls should not shift when labels
  or hover states appear.
- Use motion sparingly but deliberately. Prefer high-signal transitions that
  clarify state over decorative animation.
- Verify text fit on mobile and desktop. Long labels must wrap or resize
  cleanly rather than overflowing.

## Anti-Patterns

- Do not default to common generated patterns: purple gradients, decorative
  blobs, oversized cards, vague hero copy, or stock-like atmospheric media.
- Do not add UI cards inside other cards.
- Do not use a single decorative style everywhere when the domain calls for
  restraint.
- Do not hide the primary product, tool, object, or workflow behind generic
  marketing sections.
- Do not add a new dependency for a design flourish unless it clearly pays for
  itself.
- Do not describe the UI's features inside the UI when the controls can speak
  for themselves.

## Output Constraints

These four rules are mechanically enforced anchors for the design critique retry
loop (mccp v1.3.0-m2). Output that violates any of them fails critique and is
re-edited up to `MCCP_DESIGN_CRITIQUE_MAX_RETRY` rounds (default 2). M3 lint
(`output-constraints.js`) checks the same anchors statically.

**Produced-diff grounding lint (v1.18.22).** Because critique runs *before*
EXECUTE and never sees the produced diff, `/mccp:prp-implement` Phase 3.7 also
applies the **H15** anchor (heading depth ≤ 3) statically to the rendered-surface
added lines of the produced diff (`<h4-9>` in HTML/JSX + CommonMark `#{4,6}`). When
a `DESIGN_SURFACE_PATHS` change touches a rendered surface, this is a hard,
LLM-free gate (enforce mode blocks on violation). H17 (nested-card) is NOT in the
produced-diff subset — it is DOM-aware and stays owned by the renderer's full-HTML
lint over the rendered `status.html`. Control-plane-only changes (no rendered
surface) are a no-op.

- **정보 위계 3단계** — primary action → status → detail. Heading depth must not
  exceed 3 in any primary surface. Deeper nesting collapses or moves to a
  secondary surface.
- **강조색 화면당 1개** — Accent color or highlight token use count must be ≤ 1
  per viewport. Multiple accent hues compete and dissolve hierarchy.
- **raw markdown marker 금지** — Unrendered `**bold**`, `_italic_`, MD0xx
  warnings, stray inline code, and raw HTML entities must not appear in the
  rendered surface. If markdown leaks through, the rendering pipeline is broken
  and surface ships fail.
- **한 화면 항목 수 상한** — `list-of-N` sections (Open Questions, action items,
  risk tables) show the top 3 expanded; remaining items collapse under
  `<details><summary>+N more</summary></details>`. "Quiet by default, loud on
  demand" per PRODUCT.md.

## Review Checklist

- The first viewport immediately communicates the product, workflow, or object.
- The visual hierarchy supports scanning and repeated use.
- Typography fits the container and does not overlap adjacent content.
- Color choices have contrast and do not collapse into a one-note palette.
- Icons are used for familiar tool actions where available.
- Responsive layout has stable dimensions for boards, grids, toolbars,
  controls, tiles, and counters.
- Assets render and carry the subject matter instead of acting as filler.
- Motion improves orientation and does not mask sluggishness.
- The result matches the repo's existing frontend conventions unless there is a
  clear reason to depart.
