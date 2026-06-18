# Implementation Report — v1.3.0-m3 STATUS.md + HTML renderer

## Summary

v1.3.0 Observability Surface II milestone 3 — pure-function, dependency-free renderer that consumes M1 derive model + M2 briefing fields and produces two cache artifacts: `.claude/cache/STATUS.md` (telegraphic markdown) + `.claude/cache/status.html` (single-page HTML with OKLCH design tokens). The renderer is the human-readable surface for PRD scope ① — PM 5-axis recognition (in-progress / blocked / next-step / risk / live-worker) in under 60 seconds.

Phase 2.5 implement-codex gate was satisfied via **cross-gate dedupe** — plan-codex R1 already converged with all 4 findings ACCEPT_NOW mechanically absorbed into plan body, and `git diff origin/main..HEAD = ∅` ⊆ Files to Change. No implement-time Codex round.

## Assessment vs Reality

| Metric | Plan | Actual |
|---|---|---|
| Complexity | Medium (10–14h) | Medium, single session |
| Files (lib) | 12 | 12 |
| Files (test) | 8 | 8 |
| Files (doc/index) | 5 (dashboard-surface CREATE + 4 UPDATE) | 5 |
| Tests | 9–11 (per plan) | 63 |
| Codex rounds (implement) | up to 1 | 0 (cross-gate dedupe) |
| Codex findings absorbed | F1–F4 (plan-time R1) | F1–F4 all mechanical in plan body |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | format-utils.js + tests | ✓ | 8/8 — STATUS_BADGES frozen, 9 status kinds, escapeHtml/escapeAttr (R1 F4) |
| 2 | verdict.js (11-step + 7.5 + impeccable P2/P3) | ✓ | 15/15 |
| 3 | parsers/plan-body.js (R1 F1 absorption) | ✓ | 8/8 — PRD Delivery Milestones + Open Questions + Risks parsers |
| 4–7 | 5 section renderers | ✓ | 13/13 — status-grid + worker-fanout (graceful hide) + audit-timeline (briefing surface) + open-questions (graceful hide) + risks |
| 8 | markdown.js composer | ✓ | impeccable P2 raw blockquote |
| 9 | html.js composer (OKLCH + dark + reduced-motion) | ✓ | inline `<style>` + sticky header + 60s stale script |
| 10 | index.js facade (R1 F2 outer safeFallback) | ✓ | 5/5 outer fail-open + 4/4 escaping |
| 11 | derive/cli.js render subcommand | ✓ | 5/5 CLI paths |
| 12 | render-integration.test.js (real derive() against fs fixture) | ✓ | 2/2 — R1 next_step absorption |
| 13 | dogfood verification | ✓ | STATUS.md 5.9KB + status.html 11.1KB on real repo |
| 14 | docs/v1.3.0-observability/dashboard-surface.md (9 § sections) | ✓ | canonical spec |
| 15 | schema-surface §7 + CLAUDE.md §1.4 + §5 + PRD M2→complete M3→in-progress + user-level memory roll | ✓ | acceptance grep counts pass |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (no lint config) | N/A | repo has no eslint/prettier config |
| Renderer unit tests | ✓ Pass | 63/63 |
| Regression (derive) | ✓ Pass | 23/23 |
| Regression (receipt) | ✓ Pass | 375/375 |
| Regression (state) | ✓ Pass | 144/144 |
| Regression (briefing) | ✓ Pass | 24/24 |
| Build | N/A | pure Node (no transpile) |
| Integration (dogfood) | ✓ Pass | `node plugins/mccp/scripts/derive/cli.js render` writes both files in <5s |

**Total**: 629/629 tests green, zero regressions.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/format-utils.js` | CREATE | +120 |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | CREATE | +160 |
| `plugins/mccp/scripts/lib/renderer/verdict.js` | CREATE | +110 |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | CREATE | +75 |
| `plugins/mccp/scripts/lib/renderer/sections/worker-fanout.js` | CREATE | +120 |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | CREATE | +80 |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | CREATE | +45 |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | CREATE | +60 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | CREATE | +95 |
| `plugins/mccp/scripts/lib/renderer/html.js` | CREATE | +145 |
| `plugins/mccp/scripts/lib/renderer/index.js` | CREATE | +120 |
| `plugins/mccp/scripts/derive/cli.js` | UPDATE | +50 |
| `plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js` | CREATE | +75 |
| `plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` | CREATE | +130 |
| `plugins/mccp/scripts/lib/renderer/tests/verdict.test.js` | CREATE | +150 |
| `plugins/mccp/scripts/lib/renderer/tests/sections.test.js` | CREATE | +170 |
| `plugins/mccp/scripts/lib/renderer/tests/index-outer-fail-open.test.js` | CREATE | +50 |
| `plugins/mccp/scripts/lib/renderer/tests/escaping.test.js` | CREATE | +60 |
| `plugins/mccp/scripts/lib/renderer/tests/integration.test.js` | CREATE | +110 |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | CREATE | +95 |
| `plugins/mccp/scripts/lib/renderer/tests/cli.test.js` | CREATE | +85 |
| `docs/v1.3.0-observability/dashboard-surface.md` | CREATE | +110 |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | +3 (§7) |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATE | +1 cell link |
| `CLAUDE.md` | UPDATE | +2 (§1.4 row + §5 entry) |
| `.claude/plans/v1-3-0-observability-m3-renderer.plan.md` | UPDATE | +10 (Codex Implementation Review dedupe section) |

(User-level auto-memory `mccp-v1.3.0-cycle.md` updated separately — outside worktree.)

## Codex R1 Absorption Audit

All 4 findings were marked ACCEPT_NOW at plan-codex time and absorbed mechanically into plan body before implement entry. Implement-codex was satisfied via cross-gate dedupe.

| Finding | Severity | Absorption | Evidence |
|---|---|---|---|
| F1 — Renderer depends on M1 fields that don't exist | HIGH | M3-local `parsers/plan-body.js` reading PRD Delivery Milestones + plan body sections | `plan-body-parser.test.js` 8/8 |
| F2 — Fail-open facade can throw outside section wrappers | HIGH | `safeFallback(err)` outer try/catch + `safeCompose(name, fn, fallback)` for md/html composers | `index-outer-fail-open.test.js` 5/5 |
| F3 — Active controller hidden when envelopes absent | MEDIUM | verdict step 7.5 `controller_active && envelopes.length===0` + worker-fanout graceful-hide condition update | `verdict.test.js` step 7.5 |
| F4 — HTML output lacks escaping boundary | HIGH | `escapeHtml(s)` + `escapeAttr(s)` exports + every section HTML output passes through them | `escaping.test.js` 4/4 injection payloads |

## impeccable P1–P3 Absorption Audit

All 5 priority issues absorbed into plan body + implementation:

| Priority | Issue | Absorption |
|---|---|---|
| P1 | amber tokens violate WCAG body contrast | `STATUS_BADGES.stale.appliesTo='icon'`, `worker-stale.appliesTo='icon'` |
| P2 | STATUS.md lacks raw-mode warning | `markdown.js` prepends `> ⚠ **raw mode — 절대 외부 공유 금지** (경로 unmasked)` when masked=false |
| P2 (verdict) | "idle" fallback drops next-step axis | step 11 emits `no in-flight signal · select next milestone from PRDs` |
| P3 | section anchor IDs collide with emoji h2 | h2 headings have no emoji prefix; section IDs are `verdict`/`status`/`workers`/`timeline`/`questions`/`risks` |
| P3 | degraded source name not surfaced | verdict step 3 emits `<first-source> [+ N more] 소스 손상` |

## Deviations from Plan

- **plan.json plugin version**: kept at `1.3.0` per plan acceptance row 568 (`plugin.json` version stays at `1.3.0` … cycle close bump deferred). User-level memory has a follow-up note ("M3 ship 시 1.3.1 → 1.4.0 minor jump") but plan body acceptance takes precedence for this ship — version bump decision deferred to cycle close.
- **Test count**: plan estimated 9–11, actual 63. Higher because each section + composer + facade got its own granular test; the plan's 9–11 figure counted *test files*, of which there are 9 (matches plan). 63 = total assertions across files.
- **`(unknown-gate)` in dogfood timeline**: a small number of historical receipts have `gate_id` missing in the M3-rendered timeline. Not an M3 regression — renderer fail-opens to `(unknown-gate)` placeholder. Minor axis for v1.3.x patch cycle.

## Issues Encountered

- Initial integration test failure: `parsePlanBody` was assuming `source_prd` is a string, but M1 derive emits it as `{label, path}` object + plan paths are repo-relative not absolute. Fix: `sourcePrdPath()` helper handles both string and object form + `opts.cwd` injected for path resolution. All tests then passed.
- `node --test <directory>` syntax fails on Node 24 if any individual file errors; using explicit `*.test.js` glob worked.
- One hook false positive: "Edit called 3 times with same parameters" was triggered by 4 separate Edit ops on `derive/cli.js` (different `old_string`s).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `format-utils.test.js` | 8 | all 9 status kinds, 5 relative-time bins, mask, escapeHtml/escapeAttr, frozen invariant |
| `plan-body-parser.test.js` | 8 | Delivery Milestones table, Open Questions, Risks 4-col + 3-col + malformed, fsRead injection, degraded flag |
| `verdict.test.js` | 15 | all 11 priority steps + step 7.5 (F3) + 2 invariants + planSlug helper |
| `sections.test.js` | 13 | 4 cells grid, worker fanout null/alive/stale/invalid, timeline briefing/empty/30-cap, open-questions merge/null/15-cap, risks sort/placeholder/8-cap |
| `index-outer-fail-open.test.js` | 5 | renderStatus(null), {}, composer-throw inject (md/html), safeFallback shape |
| `escaping.test.js` | 4 | F4 four injection payloads (script in briefing, markup in envelope path, onerror in question, backtick in risk mitigation) |
| `integration.test.js` | 3 | synthesized full model, degraded amber, capability red |
| `render-integration.test.js` | 2 | real `derive()` against `os.tmpdir()` fixture + F3 amber path |
| `cli.test.js` | 5 | render no-flags, --md, --html, --out, --raw + stderr warning |

## Next Steps

- [ ] PR via `/mccp:pr` — Codex PR-review (or cross-gate dedupe if plan-codex + implement-codex both approving) + design review + security review preflight (M3 renderer is not a security-sensitive area but pr.md will probe).
- [ ] Post-ship: roll user-level memory with PR# + squash hash + STATE.md update.
- [ ] M4 entry: hook triggers for SessionStart + receipt-write + envelope write/move. M3 exposes `renderStatus(model, opts)` as the programmatic input; no API change expected for M4.
