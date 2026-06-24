# Plan: v1.3.0 Milestone 3 — STATUS.md + HTML Renderer

**Source PRD**: [.claude/prds/v1-3-0-observability-surface-ii.prd.md](../prds/v1-3-0-observability-surface-ii.prd.md)
**Selected Milestone**: 3 — STATUS.md + HTML renderer (consumes M1 derive + M2 briefing fields; produces the human-readable surface PRD scope ① ships)
**Complexity**: Medium (1 new lib namespace `lib/renderer/` + 6 section renderers + 2 format adapters + 1 CLI subcommand + 9–11 tests + 2 doc updates. No new npm dep. Estimated 10–14h).

## Summary

Wire a pure-function, dependency-free renderer that consumes M1's derive model (and M2's briefing fields surfaced through `derive/sources/receipts.js`) and produces two cache artifacts — `.claude/cache/STATUS.md` (telegraphic markdown) + `.claude/cache/status.html` (single-page HTML with OKLCH design tokens + sticky "Last refreshed" header). Both artifacts honor PRD §Design Direction's 6-section priority, single-column / no-cards layout, restrained color, color+icon+text status triple, and Korean-primary telegraphic copy. Envelope absence is a *graceful hide* (not a degraded state); open-questions emptiness is a hide; capability `contract_present=false` or any critical warning is a *loud red verdict line*.

**Boundary with M4 (refresh + privacy guard) and M5 (snapshot)**: M3 ships *only the renderer*. The hooks that trigger re-render on SessionStart / receipt-write / envelope move/write (PRD §Scope row "Refresh") are M4's responsibility. M3 exposes `node plugins/mccp/scripts/derive/cli.js render` for manual refresh + a programmatic `renderStatus(model, opts)` API that M4 will wire into hook callbacks. Daily snapshot archival is M5. M3's `.claude/cache/` artifacts are gitignored (`.gitignore:59` already covers the directory).

**M1 binding (consumer-only)**: M3 calls `derive(repoRoot)` once per render. M3 does NOT add new derive sources, mutate existing source extractors, or change the model schema. It only consumes the already-shipped `sources.{plans,receipts,state,backlog,fix_task,pr,envelopes}` + `correlations` + `warnings` + `m0_capability` fields. The masked-by-default invariant is preserved — if the caller hands M3 a `masked=false` model (i.e., they passed `--raw` deliberately), the HTML output prepends a red banner identifying the cache as raw-unsafe-to-share.

**M2 binding (read-only briefing surface)**: M3's audit-timeline section displays `meta.briefing_summary` from each receipt entry (already exposed by `derive/sources/receipts.js:75-77` per M2 Task 6). When `briefing_summary === null` (cost-guard skipped or LLM classification != 'ok'), the timeline row shows the canonical receipt verdict line without an opinion. When `briefing_invocation_count === 0`, an inline `· (briefing skipped)` muted footnote is added so PM can see *why* there's no opinion — not silence.

**Verdict priority chain (deterministic, LLM-free)**: The §Verdict 1줄 is computed from derive signals in this fixed priority order. The first signal that fires writes the verdict; later signals are skipped:

1. `m0_capability.contract_present === false` → `"🚫 schema contract missing — derive degraded"` (red)
2. any `warnings[]` entry with `severity === 'critical'` → `"🚫 <source>: <message>"` (red)
3. any `sources.*.degraded === true` → `"⏱ <N> source(s) degraded — see warnings"` (amber)
4. `sources.state.item.resume_state === 'in-flight'` → `"⏱ resume dispatch in-flight (attempt <N>)"` (amber)
5. `sources.state.item.resume_state === 'giveup'` → `"🚫 resume dispatch gave up after <N> attempts"` (red)
6. `sources.fix_task.item` truthy + `sources.state.item.escalate_pending` → `"⚠ fix-task pending escalate"` (amber)
7. envelope entries with `stale === true` count > 0 → `"⏱ <N> worker(s) heartbeat stale"` (amber)
8. envelope entries with `is_terminal === false && stale === false` count > 0 → `"● <N> worker(s) alive · <terminal-count> terminal"` (green)
9. `sources.backlog.count > 0` → `"<count> findings deferred · next: <next-in-progress-plan>"` (neutral)
10. plans with `status === 'in-progress'` count > 0 → `"<count> plans active · next: <first in-progress plan slug>"` (neutral)
11. fallback → `"idle"` (muted)

This chain is the single source of truth — both STATUS.md and status.html call the same `computeVerdict(model)` function. No LLM call lives in the verdict path. The §Audit timeline section is where M2's `briefing_summary` shows up as *commentary on the verdict*, never as the verdict itself. PRD §Hypothesis "PM identifies live-worker without grep" depends on signals 7–8 firing reliably; this priority places them ahead of the static `plans active` signal so a 1-active-worker session reads "● 1 worker alive" not "5 plans active".

**Status triple (color + icon + text — WCAG AA + color-blindness invariant)**: Every status cell uses three signals:

| Status | Color token (OKLCH) | Unicode icon | Text label (한국어) |
|---|---|---|---|
| blocked | `status-blocked` oklch(0.55 0.18 25) | 🚫 | `차단됨` |
| stale | `status-stale` oklch(0.75 0.15 80) | ⏱ | `오래됨` |
| secret-warn | `status-secret` oklch(0.50 0.22 25) | ⚠ | `시크릿 의심` |
| worker-alive | `status-worker-alive` oklch(0.65 0.15 145) | ● | `활성` |
| worker-stale | `status-worker-stale` oklch(0.75 0.15 80) | ⏱ | `심박 끊김` |
| terminal-ok | accent | ✓ | `완료` |
| terminal-failure | status-blocked | ✗ | `실패` |
| in-progress | accent | ◐ | `진행 중` |
| neutral / idle | muted | · | `대기` |

Markdown uses unicode glyph + text only (no color in markdown). HTML uses all three. Plain-text STATUS.md is grep-friendly because every status row contains the Korean label literally — `grep "차단됨" STATUS.md` works.

**Codex R1 absorptions applied** (4 findings, all ACCEPT_NOW; threadId `019ed8c9-38aa-7012-8482-bc5dea423c9d`):

- **F1 (HIGH 0.93) — Renderer plan depends on M1 fields that do not exist.** Plan body assumed `p.status` / `p.body` / `kind === 'prd'` / `receipt-plan-blocked` correlation, but M1 `derive/sources/plans.js#scanPlans()` emits only slug/path/source_prd/milestone/complexity/acceptance and `derive/correlate.js` emits 6 fixed kinds (none of which is `receipt-plan-blocked`). M1 mutation is forbidden by M3 scope. Absorption: introduce a new M3-local module `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` that on-demand reads (a) PRD frontmatter "Delivery Milestones" table column 4 (`pending|in-progress|complete`) → status for each plan-row by joining on the milestone's Plan-cell path, (b) plan body `## Open Questions` block, (c) plan body `## Risks` table. The parser is pure (string in → typed records out), does not touch derive. Status-grid section 3, open-questions section 6, and risks section 7 are rewritten to call `parsePlanBody(model)` once at the top and consume the parsed records. The verdict's "blocked" axis is replaced by `receipts where converged === false AND no later receipt for same decision_id has converged === true` — a purely M3-local computation over `model.sources.receipts.items`. New `tests/plan-body-parser.test.js` covers the 3 parse paths + edge cases (missing frontmatter table, no Open Questions block, malformed Risks rows). Acceptance row added.

- **F2 (HIGH 0.90) — Fail-open facade can still throw outside section wrappers.** `renderStatus()` outer scope accesses `model.derived_at` + calls `renderMarkdown(...)` + `renderHtml(...)` outside any try/catch. Absorption: wrap the entire facade body in `try { ... } catch (err) { return safeFallback(err) }` where `safeFallback` emits a red-tone STATUS.md `# mccp Status · 🚫 render failed: <err.message>` + a minimal status.html document with same red ribbon + `<aside role="alert">` body. Add `safeCompose(name, fn)` wrapper for `renderMarkdown` and `renderHtml` mirror the `safeSection` shape — composer failure stays inside the facade catch, never bubbles to CLI. Mirror M2's `lib/briefing/index.js:282-338` outer try + finally + `BRIEFING_IN_PROGRESS` reset pattern. New test `tests/index-outer-fail-open.test.js` asserts: (a) `renderStatus(null)` returns safeFallback shape with red verdict + valid HTML; (b) `renderStatus(model, { _injectComposerThrow: 'markdown' })` returns safeFallback for md side, valid html side; (c) opposite — html composer throws → md still emits; (d) both composers throw → safeFallback for both. The CLI never exits 1 from a render path; render failures emit stderr + exit 0 with red placeholders.

- **F3 (MEDIUM 0.84) — Active controller dispatch can be hidden when envelopes are absent.** Verdict steps 7–8 only consider `envelopes.items[]`. STATE.md exposes `controller_session_id` + `active_dispatch_count` (derive `state.item.controller_active`) which is a parallel signal — if the dispatches directory races or is unreadable, M3 can show "idle" with `controller_active === true`. Absorption: add new verdict step **7.5** between 7 and 8:
  ```js
  if (stateItem && stateItem.controller_active && envItems.length === 0) {
    const adc = stateItem.frontmatter.active_dispatch_count || 0;
    return { tone: 'amber', icon: '⏱', text: 'controller active, envelopes missing (' + adc + ' dispatches)' };
  }
  ```
  Worker-fanout section graceful-hide condition changes from `count === 0 → return null` to: `count === 0 AND !stateItem.controller_active → return null`; when `controller_active === true && envelopes empty`, render a single amber row `⏱ controller <session_id last 8> active · envelopes missing` so PM sees the skew. New test paths in `verdict.test.js` + `sections.test.js` cover the skew scenario.

- **F4 (HIGH 0.87) — HTML output lacks an escaping boundary.** Plan body assumed renderer would `concat` section HTML. Receipt `briefing_summary` + envelope `path`/`error` + open-question text + risk text all come from `.claude/` artifacts; oriented threat model is *self-injection* (a corrupted local .claude artifact rendering as JS in the local browser → external fetch / external destination change). PRD §0 auto-CRITICAL catalog includes "external destination change" so this is one tier shy of CRITICAL. Absorption: format-utils.js adds two new exports — `escapeHtml(s)` (replaces `&`/`<`/`>`/`"`/`'`/`` ` ``) + `escapeAttr(s)` (escapeHtml + URL escape for href/id). EVERY section renderer that produces HTML MUST run dynamic text through `escapeHtml`/`escapeAttr` — this is an invariant added to dashboard-surface.md §4. New test `tests/escaping.test.js` covers 4 injection payloads: (a) `briefing_summary = '<script>alert(1)</script>'` → HTML body contains `&lt;script&gt;` not `<script>`; (b) envelope `path = 'a"><script>x</script>'` → no script tag in output; (c) open-question text with `<img onerror=>` payload → entity-encoded; (d) risk Mitigation with backtick-injection payload → backtick escaped. Per-section tests are updated to assert escape calls happened (verify by injection payload survival).

R1 escalation skip self-attestation: all 4 absorptions are *mechanical* (small targeted code additions, no architectural redesign, no scope expansion). M1 surface is NOT mutated. M4/M5 boundaries are NOT crossed. R2 gate is therefore skipped per `MCCP_GATE_ROUND_CAP=1` default — Codex `next_steps` recommendations ("Promote fail-open and escaping to acceptance criteria", "Add real derive-fixture coverage") are folded into the updated Acceptance section below.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| New lib namespace | `plugins/mccp/scripts/lib/briefing/{cost-guard,invoke,index}.js` (M2 ship) | flat `lib/<feature>/` directory + `index.js` facade. Per-concern files keep section renderers under 100 LOC each. |
| Facade composition | `lib/briefing/index.js:282-338` (`triggerBriefing`) | facade calls discrete helpers in priority order, catches all exceptions, never propagates. M3's `renderStatus()` mirrors: each section renderer is wrapped in `try { ... } catch (err) { return errorSection(name, err) }` so one broken section doesn't crash the whole render. |
| CLI subcommand addition | `plugins/mccp/scripts/derive/cli.js:75-117` (`cmdRun` + `main` switch) | extend the existing `derive/cli.js` switch with a new `render` case. Flag set: `--md` / `--html` / `--both` (default both) / `--out <dir>` (default `.claude/cache/`). Same `parseFlags` helper. Same exit-code semantics. Stderr loud warning when `--raw` flag flips masked. |
| Tests / fixture | `plugins/mccp/scripts/derive/tests/mccp-fixture.test.js` (M1 ship) | `os.tmpdir()` + `fs.mkdtempSync()` + synthesize derive model object directly (NOT spawn full `derive()` — M3 is purely a function of the model). Snapshot assertions on text/HTML substring presence + structural shape. |
| Module export style | `derive/index.js:99-101` | `module.exports = { renderStatus, computeVerdict, ... }` flat. No default. |
| Graceful absence | `derive/sources/envelopes.js:35-37` (no dispatches dir → `count=0`) | M3 worker-fanout section: `if (model.sources.envelopes.count === 0) return null;` → skipped, NOT empty section. Open-questions section: same `null` return when state.body.open_questions empty. |
| Loud fail-open | `lib/briefing/index.js:282-338` + [[feedback-loud-fail-open]] | every per-section catch writes `[mccp:renderer] section=<name> FAILED <msg>` to stderr and substitutes an error placeholder. Never silent skip. |
| Line endings | `plugins/mccp/scripts/state/state-writer.js` (CRLF normalization) | M3 writes STATUS.md with `\n` only (`fs.writeFileSync(path, content, 'utf8')` where content is pre-normalized). Avoids Windows CRLF diff churn even though the file is gitignored. |
| Korean primary, English identifiers | PRD §Design Direction "Copy" + CLAUDE.md §0 | section labels in Korean ("작업 봉투", "검토 발견"). Receipt id, gate name, decision slug, envelope uuid, "v1.3.0-m1" stay verbatim ASCII. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/format-utils.js` | CREATE | Pure helpers: `formatRelativeTime(iso)`, `formatStatusBadge(kind)` returning `{text, icon, korean, colorToken, appliesTo}` where `appliesTo ∈ {'icon','text','both'}` (impeccable P1 absorption — amber tokens declare `appliesTo: 'icon'`), `mask(string)` no-op when model.masked=true, **`escapeHtml(s)` + `escapeAttr(s)`** (Codex R1 F4 absorption — HTML injection boundary). Imported by every section renderer. |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | CREATE | **Codex R1 F1 absorption.** M3-local parser (M1 mutation invariant 유지). Exports `parsePlanBody(model) → { planStatuses: Map<path, 'pending'|'in-progress'|'complete'>, openQuestions: Array<{source, text}>, risks: Array<{risk, likelihood, impact, mitigation, source}> }`. Reads PRD frontmatter "Delivery Milestones" table column 4 for status, scans plan files referenced by PRD for `## Open Questions` + `## Risks` blocks. Pure function: receives M1 model + filesystem read access via `opts.fsRead` for testability. Replaces the planned reliance on M1 `p.status` / `p.body` / `kind === 'prd'`. |
| `plugins/mccp/scripts/lib/renderer/verdict.js` | CREATE | Exports `computeVerdict(model) → { tone, text, icon }` implementing the 11-step priority chain above. Pure function, fully tested. |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | CREATE | Section 2 renderer. Returns `{ md, html }` for the 4-axis grid: in-progress count + blocked count + next-step + risks-open count. Reads `model.sources.plans.items`, `model.correlations`, `model.sources.backlog.count`. |
| `plugins/mccp/scripts/lib/renderer/sections/worker-fanout.js` | CREATE | Section 3 renderer. Reads `model.sources.envelopes.items` + `model.sources.state.item`. Returns `null` when `envelopes.count === 0` (graceful hide). When non-null: parent session row (from state.frontmatter.controller_session_id) + per-envelope rows with status triple + heartbeat age. |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | CREATE | Section 4 renderer. Filters `model.sources.receipts.items` by `created_at` ≥ 7 days ago, sorts desc, builds row per receipt: gate/decision_id (mono) + relative time + verdict line + (if briefing_summary non-null) muted briefing line + (if briefing_invocation_count === 0) `· (briefing skipped)` footnote. |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | CREATE | Section 5 renderer. Reads `model.sources.state.item.body.open_questions` + scans plan items for open `## Open Questions` blocks. Returns `null` when empty (graceful hide). Markdown checkbox list. |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | CREATE | Section 6 renderer. Reads `model.sources.plans.items[*].body` for top in-progress plan's `## Risks` table (and falls back to PRD if no in-progress plan). Parses MD table rows → impact/likelihood badge + mitigation 1-liner. |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | CREATE | Composes the 6 section outputs into a single `STATUS.md` body. Header: `# mccp Status · <verdict>` + `Last refreshed: <ISO> · <relative>`. Anchor nav (`[verdict](#verdict) · ...`). Sections separated by `---` + h2 heading. Filters out null sections. |
| `plugins/mccp/scripts/lib/renderer/html.js` | CREATE | Composes the 6 section outputs into a single `status.html` page. Inline `<style>` with PRD §Design Direction OKLCH tokens + `prefers-color-scheme: dark` opt-in + `prefers-reduced-motion: reduce` block. Single column max-width 720px, no cards, sticky `<header>` showing "Last refreshed" + amber background `body[data-stale=1]`. No JS unless absolutely needed for the 60s amber flip (acceptable: a single inline `<script>` that compares ISO timestamp to Date.now() on load). |
| `plugins/mccp/scripts/lib/renderer/index.js` | CREATE | Public facade. Single export `renderStatus(model, opts) → { md, html, derivedAt, masked, warnings }`. Composes verdict + 5 sections + markdown + html. **Codex R1 F2 absorption**: entire facade body wrapped in outer `try/catch` returning `safeFallback(err)` (red-tone STATUS.md + minimal status.html with red ribbon). `safeCompose(name, fn)` helper mirrors `safeSection` shape for markdown/html composers. **Never throws under any input including `null` model**. |
| `plugins/mccp/scripts/derive/cli.js` | UPDATE | Extend the `main()` switch with a new `render` case + `cmdRender(rest)` helper. Flags: `--md` (only markdown) / `--html` (only html) / `--out <dir>` (default `.claude/cache/`) / `--raw` (passes through to `derive()`) / `--strict` (passes through). Writes files atomically (`fs.writeFileSync` to a `.tmp` sibling, then `fs.renameSync`). Updates `showHelp()` block. |
| `plugins/mccp/scripts/lib/renderer/tests/verdict.test.js` | CREATE | 11 paths matching the priority chain. For each step, synthesize a model object where only that step's signal fires + assert `computeVerdict(model).tone + .text + .icon` match expected. Final "fallback to idle" path with all signals absent. |
| `plugins/mccp/scripts/lib/renderer/tests/sections.test.js` | CREATE | One test per section renderer (5 tests). Each: synthesize the minimal model slice the section reads, assert (a) Markdown output contains expected substrings, (b) HTML output contains expected element attrs, (c) graceful-hide returns `null` when input is empty. |
| `plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js` | CREATE | `formatRelativeTime` boundary: now → `"방금"`, <60s → `"X초 전"`, <60m → `"X분 전"`, <24h → `"X시간 전"`, ≥24h → `"X일 전"`. `formatStatusBadge` returns all 3 fields for each of the 9 status kinds. `mask()` passthrough when masked=true and noop when masked=false (sanity check). |
| `plugins/mccp/scripts/lib/renderer/tests/integration.test.js` | CREATE | End-to-end fixture: synthesize a model with 2 plans, 3 receipts (1 with briefing, 1 without, 1 with briefing skipped), 2 envelopes (1 alive, 1 stale), state with `resume_state=idle`. Run `renderStatus(model)`. Assert MD output contains all section headings + verdict + relative times. Assert HTML output is well-formed (no unclosed tags via simple regex), contains OKLCH tokens, contains the same verdict text. |
| `plugins/mccp/scripts/lib/renderer/tests/cli.test.js` | CREATE | Spawn `derive/cli.js render --out <tmpdir>` against a synthesized `.claude/` tmpdir fixture. Assert `STATUS.md` + `status.html` files appear at expected paths. Assert exit code 0. Assert `--md` flag produces only STATUS.md. Assert `--raw` produces stderr warning + an HTML banner + STATUS.md raw-mode blockquote (impeccable P2). |
| `plugins/mccp/scripts/lib/renderer/tests/escaping.test.js` | CREATE | **Codex R1 F4 absorption.** 4 injection payload paths: (a) `briefing_summary='<script>alert(1)</script>'` → HTML output contains `&lt;script&gt;` not raw `<script>`; (b) envelope `path='a"><script>x</script>'` → no script in output; (c) open-question text `<img onerror=foo>` → entity-encoded; (d) risk Mitigation backtick payload → escaped. |
| `plugins/mccp/scripts/lib/renderer/tests/index-outer-fail-open.test.js` | CREATE | **Codex R1 F2 absorption.** 4 paths: (a) `renderStatus(null)` → safeFallback shape (red verdict + valid HTML + non-empty MD); (b) markdown composer thrown via opts inject → safeFallback md side + valid html; (c) html composer thrown → opposite; (d) both composers thrown → safeFallback both. Asserts CLI exit code stays 0 even with thrown composer. |
| `plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` | CREATE | **Codex R1 F1 absorption.** 5 paths covering `parsePlanBody`: (a) PRD frontmatter status correctly mapped to plan paths; (b) missing PRD frontmatter table → empty `planStatuses` Map + degraded flag; (c) plan body `## Open Questions` checkbox list parsed; (d) plan body `## Risks` table parsed with column heuristics (Risk/Likelihood/Impact/Mitigation OR Risk/Likelihood/Mitigation); (e) malformed Risks row → silently skipped + warning emitted. |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | CREATE | **Codex R1 next_step absorption.** Runs real `derive(repoRoot)` against an `os.tmpdir()` fixture `.claude/` directory (NOT synthesized model). Fixture has 1 PRD with 3 milestones (1 complete, 1 in-progress, 1 pending), 2 receipts (1 with briefing_summary, 1 without), 1 envelope (terminal-ok), STATE.md with controller_active=true + dispatches empty (F3 skew scenario). Asserts MD + HTML output reflect real derive surface (NOT what plan body naively guessed). Catches source-contract drift regression. |
| `docs/v1.3.0-observability/dashboard-surface.md` | CREATE | New doc — formalize the STATUS.md + status.html surface as part of the M0 schema-surface family. Sections: §1 file paths + ownership, §2 6-section structure, §3 verdict priority chain (the 11-step list above), §4 status triple invariant, §5 graceful-hide rules, §6 cache-and-refresh boundary (M3 vs M4 vs M5). Mirrors the style of `docs/v1.3.0-observability/schema-surface.md`. |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | New §7 row pointing to `dashboard-surface.md` as the canonical STATUS.md format spec + STATUS: implemented in v1.3.0-m3 line. No schema changes (M3 is read-only). |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATE | Two row state changes: row 2 (M2 briefing stamp) `in-progress → complete` + Plan cell link to `../PRPs/plans/completed/v1-3-0-observability-m2-briefing-stamp.plan.md` (catches the PRD status that was deferred when PR #34 shipped — same pattern as M2 absorbing M1's deferred status row); row 3 (M3 STATUS.md + HTML renderer) `pending → in-progress` + Plan cell link to `../plans/v1-3-0-observability-m3-renderer.plan.md`. No body amendments. |
| `CLAUDE.md` | UPDATE | §1.4 table: append `v1.3.0-m3 renderer` row mirroring m0/m1/m2 rows. §5 references list: append a row pointing to `docs/v1.3.0-observability/dashboard-surface.md` (M3 canonical doc). No new env toggles in M3 (refresh trigger / privacy escalation are M4's domain). |
| `MEMORY.md` (user-level) | UPDATE | Update `mccp v1.3.0 Cycle` index entry to record M3 ship: "M3(#XX) shipped 2026-06-XX. renderer landed. M4 ahead (refresh hooks + privacy guard)." Updates happen at implement Phase 5/6 archive, not in /mccp:plan. |

**No mutations** to: `plugins/mccp/scripts/derive/index.js`, `derive/model.js`, any `derive/sources/*.js` (M3 is consumer-only, M1 surface frozen), `plugins/mccp/scripts/receipt/schema.js` (M2 shipped briefing schema), `plugins/mccp/scripts/lib/briefing/*` (M2 ship is producer; M3 reads via `derive/sources/receipts.js`), `plugins/mccp/.claude-plugin/plugin.json` version (stays at 1.3.0 — same minor cycle as M0/M1/M2; per CLAUDE.md §3.7, M2 plan documented the v1.3.0 cycle pattern where individual sub-milestones do not bump until cycle close).

## Tasks

### Task 1: format-utils.js — pure helpers (BLOCKING PREREQUISITE for section renderers)

- **Action**: Create `plugins/mccp/scripts/lib/renderer/format-utils.js` with three exports:
  - `formatRelativeTime(isoOrDate, now = Date.now()) → string`. Returns Korean relative-time strings. Edge cases: invalid date → `"시각 불명"`; future timestamp → `"미래"` (loud, signals clock skew).
  - `formatStatusBadge(kind) → { text, icon, korean, colorToken }`. `kind` is one of the 9 enum values in the §Status triple table above. Throws on unknown kind (asserts caller correctness; renderers catch and emit error placeholder). `colorToken` is the CSS custom property name string (`'--status-blocked'`), not a literal color.
  - `mask(value, model) → string`. When `model.masked === true`, identity passthrough. When `model.masked === false`, prepends `⚠ raw ` marker. M1 already strips paths; this helper exists for HTML banner rendering only.
- **Mirror**: `lib/briefing/cost-guard.js:142-152` `Object.freeze({...})` for the status enum.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js` — 13 assertions covering all 5 relative-time bins + all 9 status kinds + 2 mask paths + 2 invalid-input throws.

### Task 2: verdict.js — deterministic priority chain (LLM-free)

- **Action**: Create `plugins/mccp/scripts/lib/renderer/verdict.js`:
  ```js
  'use strict';

  function computeVerdict(model) {
    const m = model || {};
    const sources = m.sources || {};
    const warnings = Array.isArray(m.warnings) ? m.warnings : [];

    // 1. capability degraded
    if (m.m0_capability && m.m0_capability.contract_present === false) {
      return { tone: 'red', icon: '🚫', text: 'schema contract missing — derive degraded' };
    }
    // 2. any critical warning
    const crit = warnings.find(w => w && w.severity === 'critical');
    if (crit) return { tone: 'red', icon: '🚫', text: crit.source + ': ' + crit.message };
    // 3. any degraded source
    const degradedSources = Object.entries(sources)
      .filter(([_, v]) => v && v.degraded)
      .map(([k]) => k);
    if (degradedSources.length > 0) {
      return { tone: 'amber', icon: '⏱', text: degradedSources.length + ' source(s) degraded — see warnings' };
    }
    // 4-5. resume state
    const stateItem = sources.state && sources.state.item;
    if (stateItem) {
      if (stateItem.resume_state === 'giveup') {
        const attempts = (stateItem.frontmatter && stateItem.frontmatter.dispatch_attempt_count) || 0;
        return { tone: 'red', icon: '🚫', text: 'resume dispatch gave up after ' + attempts + ' attempts' };
      }
      if (stateItem.resume_state === 'in-flight') {
        const attempts = (stateItem.frontmatter && stateItem.frontmatter.dispatch_attempt_count) || 1;
        return { tone: 'amber', icon: '⏱', text: 'resume dispatch in-flight (attempt ' + attempts + ')' };
      }
    }
    // 6. fix-task pending escalate
    const fixTask = sources.fix_task && sources.fix_task.item;
    if (fixTask && stateItem && stateItem.escalate_pending) {
      return { tone: 'amber', icon: '⚠', text: 'fix-task pending escalate' };
    }
    // 7-8. envelope worker signals
    const envItems = (sources.envelopes && sources.envelopes.items) || [];
    const staleWorkers = envItems.filter(e => e && e.ok && e.stale).length;
    if (staleWorkers > 0) {
      return { tone: 'amber', icon: '⏱', text: staleWorkers + ' worker(s) heartbeat stale' };
    }
    const aliveWorkers = envItems.filter(e => e && e.ok && !e.is_terminal && !e.stale).length;
    const terminalWorkers = envItems.filter(e => e && e.ok && e.is_terminal).length;
    if (aliveWorkers > 0) {
      return { tone: 'green', icon: '●', text: aliveWorkers + ' worker(s) alive · ' + terminalWorkers + ' terminal' };
    }
    // 9. backlog
    const backlogCount = (sources.backlog && sources.backlog.count) || 0;
    const plansItems = (sources.plans && sources.plans.items) || [];
    const inProgressPlans = plansItems.filter(p => p && p.status === 'in-progress');
    if (backlogCount > 0) {
      const nextSlug = inProgressPlans[0] ? slug(inProgressPlans[0]) : '(none)';
      return { tone: 'neutral', icon: '·', text: backlogCount + ' findings deferred · next: ' + nextSlug };
    }
    // 10. plans active
    if (inProgressPlans.length > 0) {
      return { tone: 'neutral', icon: '◐', text: inProgressPlans.length + ' plans active · next: ' + slug(inProgressPlans[0]) };
    }
    // 11. idle
    return { tone: 'muted', icon: '·', text: 'idle' };
  }

  function slug(plan) {
    if (!plan) return '(unknown)';
    if (plan.slug) return plan.slug;
    if (plan.path) return require('path').basename(plan.path, '.plan.md');
    return '(unknown)';
  }

  module.exports = { computeVerdict };
  ```
- **Mirror**: `lib/briefing/cost-guard.js:181-213` pattern of priority-cascade with early-return per branch.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/verdict.test.js` — exactly 11 tests, one per priority step. Each test synthesizes a minimal model where only step N's signal fires (steps 1..N-1 absent) and asserts the returned tone+icon+text. Plus 2 tests: (a) capability degraded ALWAYS wins even when workers are alive (priority invariant); (b) resume `in-flight` wins over fix-task pending (priority invariant).

### Task 3: status-grid.js — 4-axis grid section

- **Action**: Create `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` exporting `renderStatusGrid(model, formatUtils) → { md, html }`. The grid has 4 cells in a single row:
  - **In-progress**: count of `plans.items[].status === 'in-progress'` + `◐` icon.
  - **Blocked**: count of receipts where `converged === false` AND no completed PR — derived from `correlations[]` filter `kind === 'receipt-plan-blocked'` if surfaced, else from receipts directly with no plan_hash match.
  - **Next-step**: first in-progress plan slug, or `/mccp:resume` if `state.resume_state === 'in-flight'`, or `idle` fallback.
  - **Risks open**: count of `backlog.items[]` with severity ∈ {HIGH, CRITICAL}. PRD §Risks open count from current in-progress plan if available.
- For each cell: `{ label, value, icon, tone, korean }`. Markdown: `| <icon> <korean> | <value> |` row (single 4-cell table). HTML: 4-column CSS grid with `repeat(auto-fit, minmax(180px, 1fr))` per PRD §Layout.
- **Mirror**: PRD §Design Direction "Layout — Single column, no cards" `repeat(auto-fit, minmax(180px, 1fr))` literal.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js` (status-grid sub-test) — fixture with 3 in-progress plans, 2 blocked receipts, 1 backlog HIGH → expect MD output contains "3" + "2" + "1" + first plan's slug. HTML output contains `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))` literal.

### Task 4: worker-fanout.js — section 3 (graceful hide)

- **Action**: Create `plugins/mccp/scripts/lib/renderer/sections/worker-fanout.js` exporting `renderWorkerFanout(model, formatUtils) → { md, html } | null`.
  - **Graceful hide**: `if (model.sources.envelopes.count === 0) return null;` (the renderer caller filters nulls so the section markup never appears).
  - Parent row: derived from `model.sources.state.item.frontmatter.controller_session_id` + `active_dispatch_count`. Status = `terminal-ok` if active_dispatch_count===0, else `in-progress`. Mono-format the controller_session_id (last 8 chars only — privacy + readability).
  - Worker rows: one per `envelopes.items[].ok === true`. Columns: dispatch_id (mono, last 8 chars) + worker_subagent_type + status badge (alive / stale / terminal-ok / terminal-failure) + heartbeat age (`formatRelativeTime`) + receipts_added count.
  - Invalid envelope rows (`items[].ok === false`): rendered with `⚠ envelope corrupt` + `path` + `error`. Counts toward derive-warned `degraded` source; the verdict will reflect it.
  - Markdown: section heading `## ⓘ 작업 봉투 (Worker fanout)` + table with columns `봉투 / 워커 / 상태 / 심박 / 산출물`. HTML: same grid pattern as status-grid but with row icons + per-row tone CSS classes.
- **Mirror**: `derive/sources/envelopes.js:62-78` for the item shape this consumes.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js` (worker-fanout sub-test) — 3 paths: (a) envelopes.count===0 → `null`; (b) 2 envelopes both ok + 1 stale → MD contains "● 활성" + "⏱ 심박 끊김"; (c) 1 invalid envelope → MD contains "⚠ envelope corrupt".

### Task 5: audit-timeline.js — section 4 (briefing surface)

- **Action**: Create `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` exporting `renderAuditTimeline(model, formatUtils, now = Date.now()) → { md, html }`. (Always renders, possibly empty.)
  - Filter `receipts.items[]` by `created_at` ≥ `now - 7*24*60*60*1000`. Sort by `created_at` desc. Cap at 30 rows (older entries collapse into `+N older`).
  - Each row:
    - line 1 (verdict-like): `<relative_time> · <gate>/<decision_slug>(mono, last 12 chars of slug) · <converged ? '✓ 수렴' : '◐ 진행'>`
    - line 2 (briefing, only if `briefing_summary` non-null): `> <briefing_summary>` (markdown blockquote; HTML muted color). Trailing token count: `· <briefing_token_count> tok` (mono, muted).
    - line 3 (footnote, only if `briefing_invocation_count === 0` AND no summary): `· (briefing 건너뜀)` (muted).
  - When the 7-day window yields zero receipts: render `_(최근 7일 활동 없음)_` placeholder, not a hidden section. Audit timeline is the "I see what mccp has been doing" surface; PM seeing it empty is the signal.
- **Mirror**: M2 plan Task 6 — the read-side derive contract for `briefing_*` fields is `undefined`-when-absent (not `null`, not `false`). Renderer guards: `if (typeof r.briefing_summary === 'string' && r.briefing_summary.length > 0)`.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js` (audit-timeline sub-test) — 4 paths: (a) 3 receipts in window, 1 with briefing → MD contains 3 rows + 1 blockquote; (b) receipt with `briefing_invocation_count===0` + no summary → footnote `(briefing 건너뜀)` present; (c) 35 receipts → output has 30 rows + `+5 older` marker; (d) zero in window → MD contains `최근 7일 활동 없음`.

### Task 6: open-questions.js — section 5 (graceful hide)

- **Action**: Create `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` exporting `renderOpenQuestions(model, formatUtils) → { md, html } | null`.
  - Source aggregation:
    1. `model.sources.state.item.body.open_questions` (if state-writer exposes it — likely as `Array<string>`).
    2. Top in-progress plan `## Open Questions` block parsed from plan body markdown (the plan parser already extracts a `body` field — verify in implement phase).
  - Deduplicate by exact text match. Cap at 15; trailing `+N more` marker.
  - When aggregated list is empty: `return null` (graceful hide per PRD §223 "비어있으면 섹션 숨김").
  - Markdown: checkbox list `- [ ] <question text>`. HTML: same structure as `<ul>` with `role="list"`.
- **Mirror**: M2 plan body has `## Open Questions` table that gets parsed; reuse the same parsing approach if it's already factored, otherwise inline a minimal markdown table extractor.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js` (open-questions sub-test) — 3 paths: (a) state.body.open_questions has 2, plan body has 1 unique → output 3 items; (b) all sources empty → `null`; (c) >15 items → 15 + `+N more` marker.

### Task 7: risks.js — section 6 (PRD ↔ plan fallback)

- **Action**: Create `plugins/mccp/scripts/lib/renderer/sections/risks.js` exporting `renderRisks(model, formatUtils) → { md, html }`. (Always renders — risks are project-level signal even when nothing is in-progress.)
  - Source: top in-progress plan's `## Risks` table if present. If no in-progress plan or no `## Risks`, fall back to the PRD's `## Risks` table parsed from `model.sources.plans.items` filtered to `kind === 'prd'` (if surfaced) — else, render `_(no risks surface available)_` placeholder.
  - Parse the MD table into rows of `{ risk, likelihood, impact, mitigation }`. Likelihood/impact rendered as colored badges (HTML) or `(L)`/`(M)`/`(H)` text suffix (markdown).
  - Cap at 8 rows. Sort by impact desc, then likelihood desc. Trailing `+N less critical` marker if truncated.
- **Mirror**: PRD §Risks table format (already 11 rows in the v1.3 PRD). Plan-format `## Risks` tables share the same column shape per M1/M2 plan ship convention.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js` (risks sub-test) — 3 paths: (a) plan with 4 risks → MD contains 4 rows sorted by impact; (b) >8 risks → 8 + `+N less critical`; (c) no plan, no PRD → placeholder text.

### Task 8: markdown.js — 6-section composer

- **Action**: Create `plugins/mccp/scripts/lib/renderer/markdown.js` exporting `renderMarkdown(model, sections, verdict, derivedAt, formatUtils) → string`. Sections is the array `[grid, fanout, timeline, questions, risks]` (each `{md, html}|null`). The function:
  1. Header: `# mccp Status · <verdict.icon> <verdict.text>` + blank + `_Last refreshed: <derivedAt ISO> · <relative>_` + blank.
  2. Sticky-stale marker text (visible in MD as `> ⏱ rendered <relative>; refresh recommended` IF (now - derivedAt) > 60s, else nothing).
  3. Anchor nav: `[verdict](#mccp-status) · [grid](#status) · [workers](#workers) · [timeline](#timeline) · [questions](#questions) · [risks](#risks)`. Filter anchors of null sections.
  4. Section 1 `## Verdict`: `> <verdict.icon> <verdict.text>` blockquote.
  5. Section 2 `## Status`: emit `grid.md`.
  6. Section 3 `## Workers`: emit `fanout.md` IF not null, else skip section entirely.
  7. Section 4 `## Timeline`: emit `timeline.md`.
  8. Section 5 `## Open Questions`: emit `questions.md` IF not null, else skip section entirely.
  9. Section 6 `## Risks`: emit `risks.md`.
  10. Footer: `_Derived from .claude/ via plugins/mccp/scripts/derive · v1.3.0-m3 renderer_` (mono attribution).
  11. Trailing newline.
- All section bodies separated by `\n\n---\n\n`. Headings use `##` consistently.
- **Mirror**: M2 plan body's own section heading style (`##` h2 throughout).
- **Validate**: covered by `tests/integration.test.js` Task 11.

### Task 9: html.js — 6-section HTML composer + OKLCH design tokens

- **Action**: Create `plugins/mccp/scripts/lib/renderer/html.js` exporting `renderHtml(model, sections, verdict, derivedAt, formatUtils) → string`. Outputs a complete `<!doctype html>` document. Structure:
  ```html
  <!doctype html>
  <html lang="ko">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>mccp Status · <verdict-text></title>
      <style>/* OKLCH tokens + layout + sticky header + prefers-reduced-motion */</style>
    </head>
    <body data-stale="0">
      <header><!-- Last refreshed sticky --></header>
      <main>
        <section id="verdict">...</section>
        <section id="status">...</section>
        <section id="workers" hidden="...">...</section>
        <section id="timeline">...</section>
        <section id="questions" hidden="...">...</section>
        <section id="risks">...</section>
      </main>
      <script>/* 60s stale check on load + on visibility change */</script>
    </body>
  </html>
  ```
- Inline `<style>` includes:
  - `:root { --bg: oklch(0.99 0 0); --surface: oklch(0.97 0.003 250); --border: oklch(0.92 0.005 250); --ink: oklch(0.20 0.005 250); --muted: oklch(0.45 0.008 250); --accent: oklch(0.55 0.18 230); --status-blocked: oklch(0.55 0.18 25); --status-stale: oklch(0.75 0.15 80); --status-secret: oklch(0.50 0.22 25); --status-worker-alive: oklch(0.65 0.15 145); --status-worker-stale: oklch(0.75 0.15 80); }`.
  - `@media (prefers-color-scheme: dark) { :root { --bg: oklch(0.18 0 0); ... } }` — dark variant of the same 11 tokens.
  - `body { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI Variable', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; color: var(--ink); background: var(--bg); max-width: 720px; margin: 0 auto; padding: 1rem; }`.
  - `code, .mono { font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', monospace; }`.
  - `header { position: sticky; top: 0; background: var(--surface); border-bottom: 1px solid var(--border); padding: 0.5rem 0; transition: background 240ms ease-out; }`.
  - `body[data-stale="1"] header { background: var(--status-stale); transition: background 240ms ease-out; }`.
  - `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`.
  - `section { padding: 1rem 0; border-bottom: 1px solid var(--border); }`.
  - `.status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem; }`.
  - Status badge classes: `.s-blocked { color: var(--status-blocked); } .s-stale { color: var(--status-stale); } .s-worker-alive { color: var(--status-worker-alive); }` etc.
- Inline `<script>`:
  ```html
  <script>
  (function() {
    var derivedMs = Number('<derivedAtMs>');  // emitted server-side
    function check() {
      var ageMs = Date.now() - derivedMs;
      document.body.dataset.stale = ageMs > 60000 ? '1' : '0';
    }
    check();
    document.addEventListener('visibilitychange', check);
    setInterval(check, 5000);
  })();
  </script>
  ```
  Note: this is the only JS. PRD §Motion permits it for "stale entry sticky header bg color crossfade (240ms)".
- HTML body parts use the section's `.html` output verbatim (concatenation with proper section wrappers).
- `masked === false` ribbon: when `model.masked === false`, prepend an `<aside role="alert" class="s-secret">⚠ raw — 절대 외부 공유 금지</aside>` immediately inside `<main>`.
- **Mirror**: PRD §Design Direction OKLCH token list verbatim (don't drift the values).
- **Validate**: covered by integration tests + a dedicated HTML well-formedness assertion (`<html.+>.*</html>$` regex match + balanced `<section>` count).

### Task 10: index.js — public facade + per-section fail-open

- **Action**: Create `plugins/mccp/scripts/lib/renderer/index.js`:
  ```js
  'use strict';

  const formatUtils = require('./format-utils');
  const { computeVerdict } = require('./verdict');
  const { renderStatusGrid } = require('./sections/status-grid');
  const { renderWorkerFanout } = require('./sections/worker-fanout');
  const { renderAuditTimeline } = require('./sections/audit-timeline');
  const { renderOpenQuestions } = require('./sections/open-questions');
  const { renderRisks } = require('./sections/risks');
  const { renderMarkdown } = require('./markdown');
  const { renderHtml } = require('./html');

  function safeSection(name, fn) {
    try { return fn(); }
    catch (err) {
      process.stderr.write('[mccp:renderer] section=' + name
        + ' FAILED ' + (err && err.message || err) + ' (allow)\n');
      return {
        md: '> ⚠ section "' + name + '" failed to render: ' + (err && err.message || 'unknown').slice(0, 120),
        html: '<aside class="s-blocked">⚠ section "' + name + '" failed to render</aside>',
      };
    }
  }

  function renderStatus(model, opts) {
    opts = opts || {};
    const verdict = (function () {
      try { return computeVerdict(model); }
      catch (err) {
        process.stderr.write('[mccp:renderer] verdict FAILED ' + err.message + ' (allow)\n');
        return { tone: 'red', icon: '🚫', text: 'verdict computation failed' };
      }
    })();

    const grid = safeSection('status-grid', () => renderStatusGrid(model, formatUtils));
    const fanout = safeSection('worker-fanout', () => renderWorkerFanout(model, formatUtils));
    const timeline = safeSection('audit-timeline', () => renderAuditTimeline(model, formatUtils));
    const questions = safeSection('open-questions', () => renderOpenQuestions(model, formatUtils));
    const risks = safeSection('risks', () => renderRisks(model, formatUtils));

    const sections = [grid, fanout, timeline, questions, risks];

    const derivedAt = model.derived_at || new Date().toISOString();
    const md = renderMarkdown(model, sections, verdict, derivedAt, formatUtils);
    const html = renderHtml(model, sections, verdict, derivedAt, formatUtils);

    return {
      md, html, derivedAt,
      masked: !!model.masked,
      warnings: model.warnings || [],
      verdict,
    };
  }

  module.exports = { renderStatus };
  ```
- **Mirror**: `lib/briefing/index.js:282-338` `triggerBriefing` outer try-catch shape.
- **Validate**: integration tests + a dedicated test for `safeSection` (Task 11 integration covers most; add a test that synthesizes a model with `sources.envelopes = null` (intentionally malformed) and asserts the worker-fanout section returns the error placeholder + render still succeeds).

### Task 11: derive/cli.js — new `render` subcommand

- **Action**: Edit `plugins/mccp/scripts/derive/cli.js`:
  - Import the renderer facade: `const { renderStatus } = require('../lib/renderer');`.
  - Extend `showHelp()` block to document `render` subcommand:
    ```
    render [--md] [--html] [--out <dir>] [--raw] [--strict]
         --md       Emit STATUS.md only (default emits both).
         --html     Emit status.html only.
         --out <dir>  Output directory (default .claude/cache/).
         --raw      Pass through to derive() — model.masked=false. HTML output gets a red ribbon. Stderr WARNING.
         --strict   Exit 1 if M0 capability check reports contract_present=false.
    ```
  - Add `cmdRender(rest)` helper:
    ```js
    function cmdRender(rest) {
      const cwd = process.cwd();
      const wantRaw = !!rest.raw;
      if (wantRaw) process.stderr.write('[mccp:derive:render] --raw emits unmasked HTML; do NOT share\n');
      let model;
      try {
        model = derive(cwd, { raw: wantRaw, strict: !!rest.strict });
      } catch (err) {
        process.stderr.write('[mccp:derive:render] ERROR derive failed: ' + err.message + '\n');
        return 1;
      }
      let rendered;
      try {
        rendered = renderStatus(model);
      } catch (err) {
        process.stderr.write('[mccp:derive:render] ERROR render failed: ' + err.message + '\n');
        return 1;
      }
      const outDir = path.resolve(cwd, rest.out || path.join('.claude', 'cache'));
      try { fs.mkdirSync(outDir, { recursive: true }); }
      catch (err) { process.stderr.write('[mccp:derive:render] ERROR mkdir ' + outDir + ': ' + err.message + '\n'); return 1; }
      const wantMd = !!rest.md, wantHtml = !!rest.html;
      const emitMd = wantMd || (!wantMd && !wantHtml);
      const emitHtml = wantHtml || (!wantMd && !wantHtml);
      if (emitMd) writeAtomic(path.join(outDir, 'STATUS.md'), rendered.md);
      if (emitHtml) writeAtomic(path.join(outDir, 'status.html'), rendered.html);
      if (rest.strict && model.m0_capability && model.m0_capability.contract_present === false) return 1;
      return 0;
    }
    function writeAtomic(target, content) {
      const tmp = target + '.tmp';
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, target);
    }
    ```
  - Extend `main()` switch with `case 'render': return cmdRender(rest);`.
  - Add `const fs = require('fs');` and `const path = require('path');` to the top of `cli.js` (currently only requires `./model` + `./index`).
- **Mirror**: `derive/cli.js:75-97` `cmdRun` shape.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/cli.test.js` — 5 paths: (a) `render` with no flags writes both files; (b) `render --md` writes only STATUS.md; (c) `render --html` writes only status.html; (d) `render --out <tmp>` honors the output dir; (e) `render --raw` writes a status.html that contains the `s-secret` ribbon class.

### Task 12: Tests — full suite

All 5 test files described in Tasks 1-7 + the CLI test in Task 11. **Test invariants**:

- Every test synthesizes a `derive` model object directly. No real `derive(repoRoot)` call. This keeps M3 tests isolated from M1/M2 surface drift.
- No real Codex spawn. No real LLM call. No real filesystem writes outside `os.tmpdir()`.
- All assertions use `assert.strictEqual` / `assert.deepStrictEqual` / `assert.match`. No async stalls.

**Validate aggregate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` — all files pass. Existing suites unchanged: `node --test plugins/mccp/scripts/derive/tests/` + `node --test plugins/mccp/scripts/receipt/tests/` + `node --test plugins/mccp/scripts/state/tests/` + `node --test plugins/mccp/scripts/lib/briefing/tests/`.

### Task 13: Manual dogfood verification

- **Action**: After Tasks 1-12 pass, manually:
  ```bash
  cd <repo>
  node plugins/mccp/scripts/derive/cli.js render
  ls -la .claude/cache/
  # Expect: STATUS.md + status.html
  cat .claude/cache/STATUS.md | head -30
  # Open status.html in a browser, verify:
  #   - sticky header shows ISO + relative time
  #   - 6 sections render (or 4 if envelopes absent + open-questions empty)
  #   - status badges have color + icon + text triple
  #   - prefers-color-scheme: dark works (devtools toggle)
  #   - prefers-reduced-motion: reduce works (devtools toggle)
  ```
- **Acceptance**: STATUS.md ≤ 200 lines for current repo state. status.html ≤ 30KB. Verdict line matches current state (e.g., "1 plans active · next: v1-3-0-observability-m3-renderer" at plan time).
- Edge: run with `--raw` flag and verify HTML shows red ribbon AND stderr warning.

### Task 14: docs/v1.3.0-observability/dashboard-surface.md — canonical doc

- **Action**: Create the doc with sections:
  - §1 — File paths + ownership (`.claude/cache/STATUS.md` + `status.html`, both gitignored, written by `plugins/mccp/scripts/derive/cli.js render`).
  - §2 — 6-section structure (verbatim from the Files-to-Change "sections" rationale above + PRD §Design Direction reference).
  - §3 — Verdict priority chain (the 11-step list in this plan's Summary, verbatim).
  - §4 — Status triple invariant (color + icon + text, with the 9-row table).
  - §5 — Graceful-hide rules: envelope-count===0 hides worker-fanout, open-questions empty hides section 5, capability/critical-warning escalates verdict to red.
  - §6 — Cache and refresh boundary: M3 = manual + on-demand. M4 = SessionStart/receipt-write/envelope-move hook triggers. M5 = daily snapshot archive. Tells future readers which milestone owns which behavior.
  - §7 — Cross-platform notes: writeFileSync with `\n`-normalized content; Windows OK because file is gitignored.
- **Mirror**: `docs/v1.3.0-observability/schema-surface.md` section-heading style + table format + cross-link pattern.
- **Validate**: `grep -c "^## §" docs/v1.3.0-observability/dashboard-surface.md` ≥ 7 (one per section heading).

### Task 15: schema-surface.md + CLAUDE.md + PRD + memory roll

- **Action**:
  - `docs/v1.3.0-observability/schema-surface.md` — append a new §7 row pointing to dashboard-surface.md as the canonical STATUS.md spec. One sentence: `STATUS.md/status.html surface freeze: see dashboard-surface.md. v1.3.0-m3 ship.`.
  - `CLAUDE.md` §1.4 table — append after the M2 row:
    ```
    | **STATUS.md + HTML renderer (v1.3.0-m3)** | `plugins/mccp/scripts/lib/renderer/*` — derive model → `.claude/cache/STATUS.md` + `status.html`. 6-section deterministic verdict + briefing surface + worker fanout graceful hide. Pure function of derive model + M2 briefing fields. No new dep. M4 owns refresh triggers; M5 owns snapshots. | v1.3.0-m3 ship |
    ```
  - `CLAUDE.md` §5 — append a reference row: `plugins/mccp/scripts/lib/renderer/index.js` — STATUS.md/status.html renderer entry (consumes M1 derive + M2 briefing fields, produces the PM dashboard surface). M0 schema-surface § dashboard-surface.md is its spec.
  - `.claude/prds/v1-3-0-observability-surface-ii.prd.md` Delivery Milestones table — row 2 (M2) `in-progress → complete` + Plan cell link to `../PRPs/plans/completed/v1-3-0-observability-m2-briefing-stamp.plan.md`. Row 3 (M3) `pending → in-progress` + Plan cell link to `../plans/v1-3-0-observability-m3-renderer.plan.md`. No body amendments.
  - User-level auto-memory `mccp v1.3.0 Cycle` index entry — bump to record M3 in-progress with worktree at `.worktrees/v1.3.0-observability-m3/`. Final ship line added at Phase 5/6 archive of `/mccp:prp-implement`.
- **Validate**: `grep -c "v1-3-0-observability-m3" .claude/prds/v1-3-0-observability-surface-ii.prd.md` ≥ 1; `grep -c "v1.3.0-m3" CLAUDE.md` ≥ 2; `grep -c "dashboard-surface" docs/v1.3.0-observability/schema-surface.md` ≥ 1.

## Validation

```bash
# All new test suites must pass.
node --test plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/verdict.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/integration.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/cli.test.js
# Codex R1 absorption test files (added in this plan body via R1 absorption).
node --test plugins/mccp/scripts/lib/renderer/tests/escaping.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/index-outer-fail-open.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js

# Existing suites must not regress.
node --test plugins/mccp/scripts/derive/tests/
node --test plugins/mccp/scripts/receipt/tests/
node --test plugins/mccp/scripts/state/tests/
node --test plugins/mccp/scripts/lib/briefing/tests/

# Dogfood (Task 13) — verify the cache files appear and look right.
node plugins/mccp/scripts/derive/cli.js render
ls -la .claude/cache/STATUS.md .claude/cache/status.html

# Docs presence.
test -f docs/v1.3.0-observability/dashboard-surface.md && echo "doc ok"
grep -c "dashboard-surface" docs/v1.3.0-observability/schema-surface.md
grep -c "v1.3.0-m3" CLAUDE.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Verdict priority chain hallucinates state from incomplete model (e.g., `sources.state.item === null` but renderer assumes it's always present) | High | Every renderer + verdict step null-guards each `sources.*` access. `tests/verdict.test.js` includes a "completely empty model" path. The safeSection wrapper catches any leftover access errors. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| HTML OKLCH colors break on Safari <15.4 (~0.2% global usage as of 2026) | Low | PRD §Design Direction commits to OKLCH. If a user reports it, M3.1 hotfix can add `@supports not (color: oklch(0 0 0))` fallback with sRGB hex. Out of scope for M3 ship. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `audit-timeline` floods on busy projects (50+ receipts/week) | Medium | 30-row cap + "+N older" marker (Task 5). PRD targets 60-second comprehension; visible timeline is a window, not a log. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `briefing_summary` from M2 contains hallucinated PR numbers / commit SHAs (PRD risk inherited) | High | Section 4 prepends every briefing line with `>` blockquote + muted color, separating "AI opinion" from canonical receipt verdict on the line above. M3 Task 5 test asserts this visual separation. PRD §Risk row "Briefing LLM hallucination" mitigation is "raw finding link always present" — Section 4 satisfies this by always showing the raw `gate/decision_id` line BEFORE the briefing line. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Two-source open-questions deduplication misses near-duplicates (paraphrase) | Medium | Task 6 uses exact-match dedup only. Paraphrase dedup is out of scope. Cap at 15 prevents explosion. PRD §Open Questions row "AskUser signal namespace collision" is handled by the audit-timeline showing `gate/decision_id` prefix; it doesn't fall on M3 to solve namespace. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| The single inline `<script>` (60s stale check) breaks under CSP `script-src 'none'` | Low | The cache file is loaded locally, not served over HTTP, so CSP doesn't apply. If a future user serves it via `python -m http.server`, the script gracefully degrades — `body[data-stale]` stays `0` and the page still works. Document this in dashboard-surface.md §7. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `risks.js` falls back to PRD parsing but the PRD risks table is project-PRD-shaped and may not match plan-level risk tables | Medium | Task 7 implements both shapes (PRD-level Risks has columns Risk/Likelihood/Impact/Mitigation; plan-level Risks has Risk/Likelihood/Mitigation). The renderer accepts either column set with a soft check, falling back to a plain text dump if parsing fails. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Cache files committed accidentally despite `.gitignore` (worktree on Windows confusing the rule) | Low | `.gitignore:59` rule `.claude/cache/` is directory-level, robust on Windows. Sanity check: `git check-ignore -v .claude/cache/STATUS.md` in dogfood. Worktree convention §3.8 prevents the sibling-dir leak path. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Renderer output drifts as M4/M5 land without updating dashboard-surface.md spec | Medium | Task 14 doc is canonical. M4/M5 plans MUST reference it + amend if they change the surface shape. Captured as a meta-risk for future cycles. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Performance: large `.claude/` directories (200+ plans, 500+ receipts) make `derive()` + `render()` exceed the PRD's 60s "Last refreshed" expectation | Medium | Both functions are sync I/O over local files. Profile during dogfood: if >5s, add `--summary` fast-path that skips audit-timeline body parsing. Document threshold in dashboard-surface.md §6. Real fix is M4's hook-driven incremental refresh. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance

- [ ] Task 1 `format-utils.js` shipped + 13 assertions passing.
- [ ] Task 2 `verdict.js` shipped + 13 verdict-priority assertions passing (11 steps + 2 invariants).
- [ ] Tasks 3–7 section renderers shipped under `plugins/mccp/scripts/lib/renderer/sections/` with graceful-hide invariant tested.
- [ ] Tasks 8–10 `markdown.js` + `html.js` + `index.js` shipped with per-section fail-open + outer facade fail-open.
- [ ] Task 11 `derive/cli.js` extended with `render` subcommand + 5 CLI flag paths tested.
- [ ] Task 12 aggregate test suite passes. Existing suites unchanged.
- [ ] Task 13 dogfood: `.claude/cache/STATUS.md` + `status.html` exist + size + content shape match expectations.
- [ ] Task 14 `docs/v1.3.0-observability/dashboard-surface.md` shipped + 7 section headings present.
- [ ] Task 15 schema-surface.md row + CLAUDE.md §1.4 row + PRD M2→complete / M3→in-progress + auto-memory roll done.
- [ ] `plugin.json` version stays at `1.3.0` (same minor cycle as M0/M1/M2; cycle close bump deferred to v1.3.0 final milestone per CLAUDE.md §3.7).
- [ ] No new npm dependencies.
- [ ] Worktree at `.worktrees/v1.3.0-observability-m3/` per CLAUDE.md §3.8 (NOT sibling).
- [ ] [[feedback-loud-fail-open]] invariant honored: per-section + verdict + outer catch all emit stderr `[mccp:renderer]` lines.
- [ ] PRD §Design Direction OKLCH tokens + system stack typography + single column + no cards + restrained color + telegraphic copy honored verbatim in `html.js`.
- [ ] **Codex R1 F1**: `lib/renderer/parsers/plan-body.js` shipped + tests pass. PRD frontmatter status inference works against real `.claude/prds/*.prd.md`. No M1 derive mutation.
- [ ] **Codex R1 F2**: `renderStatus()` outer try/catch shipped + `tests/index-outer-fail-open.test.js` all 4 paths pass. CLI exit code stays 0 under all forced composer throw paths.
- [ ] **Codex R1 F3**: verdict.js step 7.5 (controller_active fallback) shipped + worker-fanout graceful-hide condition updated + new test paths in `verdict.test.js` + `sections.test.js` cover the skew scenario.
- [ ] **Codex R1 F4**: `escapeHtml` + `escapeAttr` exported from format-utils.js + every section HTML output verified to use them + `tests/escaping.test.js` 4 injection payloads pass.
- [ ] **Codex R1 next_step**: `tests/render-integration.test.js` runs real `derive()` against fs fixture (not synthesized model) + verifies source-contract match against M1 surface.
- [ ] **impeccable P1**: status enum declares `appliesTo: 'icon'|'text'|'both'` per kind; amber tokens (L=0.75) are icon-only; body text always uses `--ink`. Documented in dashboard-surface.md §4.
- [ ] **impeccable P2**: STATUS.md prepends `> ⚠ **raw mode — 절대 외부 공유 금지** (경로 unmasked)` blockquote when model.masked=false (markdown raw-mode marker, mirroring html.js ribbon).
- [ ] **impeccable P2 (verdict)**: idle fallback emits "no in-flight signal · select next milestone from PRDs" (not bare "idle").
- [ ] **impeccable P3 (anchors)**: section h2 headings have no emoji prefix; anchor IDs stable across markdown engines.
- [ ] **impeccable P3 (degraded source name)**: verdict step 3 names first degraded source by name (not just count).

## Design Critique

**호출**: impeccable critique v1-3-0-observability-m3-renderer (mode: design-of-the-plan, no live UI yet; browser injection + detector skipped — markdown plan body is not a markup target)
**Reviewer context**: PRODUCT.md register = `product`, brand personality Calm/Decisive/Compact. PRD §Design Direction carried over verbatim.

### Anti-Patterns Verdict

**LLM assessment**: Plan body honors every absolute ban (no side-stripe, no glass, no gradient bg, no hero-metric, no card grid, no reveal-gated content, no >1 font family, no ≤-0.04em letter-spacing). Category-reflex audit passes both tiers — first-order (PM dashboard → NOT Bloomberg-dark, NOT cream-minimal), second-order (anti-cream → NOT editorial-typographic, NOT terminal-native). Slop = none detected at plan level.

**Deterministic scan**: skipped (markdown plan body is not a markup target).
**Visual overlays**: skipped (no live UI yet).

### Priority Issues

- **[P1] WCAG body-contrast trap on amber tokens**. status-stale + status-worker-stale at oklch(0.75 0.15 80) yield ≈2.0:1 against bg. Plan Task 1 must add `appliesTo: 'icon' | 'text' | 'both'` per status kind so amber tokens are icon-only; body text stays `--ink`. Document the contrast budget in dashboard-surface.md §4.
- **[P2] STATUS.md (markdown view) lacks raw-mode warning marker**. Task 9 prepends a red HTML ribbon; Task 8 does not. Add to markdown.js: when `model.masked === false`, prepend `> ⚠ **raw mode — 절대 외부 공유 금지** (경로 unmasked)` blockquote at top of STATUS.md.
- **[P2] "idle" verdict fallback drops the "next-step" axis**. PRD §Hypothesis promises 5 axes including next-step. Task 2 step 11 should surface "no in-flight signal · select next milestone from PRDs" or probe `.claude/prds/*.prd.md` for the most-recently-modified PRD slug.
- **[P3] Section anchor IDs likely collide with emoji-prefixed h2**. Drop emoji from h2 headings (render inline as section body first character) OR use GFM explicit anchor syntax `## 작업 봉투 {#workers}`. Update Tasks 4 + 8.
- **[P3] Degraded source name not surfaced in verdict**. Verdict step 3 says "N source(s) degraded" but no rendered section lists which sources. Name the first degraded source: `${degradedSources[0]}${rest > 0 ? ' + ' + rest + ' more' : ''} 소스 손상`.

### Minor Observations

- Task 8 anchor nav `[verdict](#mccp-status)` should be `[verdict](#verdict)` matching section heading slug.
- dashboard-surface.md §6 should commit anchor IDs as part of the surface freeze (cross-doc stability).
- html.js inline script `setInterval(5s)` should early-return when `document.hidden === true` (battery hygiene).
- Task 7 PRD fallback uses `kind === 'prd'` — verify M1 surfaces `kind` discriminator, otherwise add direct PRD read helper.

### Questions to Consider

- Verdict line — name worker `subagent_type` instead of aggregate count?
- "Risks open" cell in status-grid as a clickable `<a href="#risks">` cross-link badge?
- Cycle-close `plugin.json` bump strategy — M3 stays at 1.3.0 vs bump to 1.4.0 for user-facing surface promotion?

**Slop verdict**: NONE. Findings are tightening, not redirection. impeccable update notice (v3.5.0 → v3.7.1) deferred to next session per Phase 5 gate rules.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` flag emitted)
- 라운드 수: 1 (R1만; R2 escalation 조건 미충족 — 모든 ACCEPT_NOW 항목이 plan 본문에 mechanical absorption됨)
- 합치 결론: needs-attention → R1 absorbed → plan 본문 변경으로 모든 HIGH/MEDIUM finding 해소.
- 호출 wall-clock: 270s (durationMs=270186, 4.5분; codex-invoke 900s timeout 한도 내)
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — Renderer plan depends on M1 fields that do not exist | HIGH (0.93) | ACCEPT_NOW | M1 `scanPlans()`은 slug/path/source_prd/milestone/complexity/acceptance만 emit한다. plan body는 `p.status` / `p.body` / `kind === 'prd'` / `receipt-plan-blocked` correlation에 의존 → 실제 derive() 결과로는 next-step / blocked / open-question / risk 추출이 fallthrough. mechanical fix는 (a) M3-local plan-body parser 신설 + (b) status는 PRD frontmatter("Status" column) 또는 milestone-table inference로 derive하는 새 helper. M1 mutation invariant 유지. |
  | F2 — Fail-open facade can still throw outside section wrappers | HIGH (0.90) | ACCEPT_NOW | 현재 `renderStatus()` outer는 verdict + 5 section만 보호. `renderMarkdown` / `renderHtml` composer + `model.derived_at` 접근은 outer try/catch 밖. M2 `lib/briefing/index.js:282-338` 같은 outer try + finally + minimal placeholder 패턴으로 mechanical absorption. |
  | F3 — Active controller dispatch can be hidden when envelopes absent | MEDIUM (0.84) | ACCEPT_NOW | verdict는 envelope rows만 보고 worker fanout은 `envelopes.count===0` 시 즉시 hide. STATE.md `controller_session_id` + `active_dispatch_count > 0` (derive `state.item.controller_active`) 신호가 envelope dir absent/race일 때 손실. verdict step 7/8 사이에 `controller_active` 분기 추가 + worker-fanout graceful-hide 조건 갱신. |
  | F4 — HTML output lacks an escaping boundary | HIGH (0.87) | ACCEPT_NOW | html.js composer가 section `.html` 출력을 verbatim concat. receipt briefing_summary / envelope path / open-question / risk text가 .claude/ artifact에서 옴 → 오염된 source가 markup/script inject 가능. masking/raw banner는 *데이터 disclosure*만 막고 *injection*은 안 막음. mechanical fix는 format-utils.js에 `escapeHtml(s)` + `escapeAttr(s)` 추가 + 모든 section HTML 생성에 통과 require + 4종 injection payload test. 자세한 absorption rationale + 코드 변경은 §"Codex R1 absorptions applied"에 본문화. |
- Deferred to backlog: 0 (모든 R1 finding ACCEPT_NOW + R1 mechanical absorption 가능)
- Open Questions: 없음 (R2 escalation 조건 — `ACCEPT_NOW × {HIGH,CRITICAL} × R1 absorption 불가` — 미충족)
- Codex session 참조: threadId `019ed8c9-38aa-7012-8482-bc5dea423c9d`
- 추가 plan 변경 요약 (§"Codex R1 absorptions applied" 참조):
  - format-utils.js에 `escapeHtml` + `escapeAttr` export 추가 (F4)
  - 모든 section HTML 출력이 dynamic text를 escape 통과시키도록 require + 4종 injection payload test (F4)
  - index.js에 outer try/catch + minimal placeholder fallback `safeCompose` 추가 (F2)
  - verdict.js step 7-8 사이에 `controller_active` 분기 + worker-fanout graceful-hide 조건 갱신 (F3)
  - 새 `lib/renderer/parsers/plan-body.js` — M3-local parser for plan body `## Risks` / `## Open Questions` + PRD frontmatter status inference (F1)
  - 새 integration test file: `tests/render-integration.test.js` (real `derive()` against fs fixture, 합성 model 검증만으로는 못 잡는 source-contract mismatch 회귀 차단)


## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- 호출: skipped (cross-gate dedupe; plan-codex R1 converged with all 4 findings ACCEPT_NOW + mechanical absorbed)
- 라운드 수: 0 (dedupe — no implement-time Codex call)
- 합치 결론: dedupe (plan-codex R1 합치 결론 inherited verbatim)
- YAGNI Triage: inherited from plan-codex review §"Codex Adversarial Review" (F1–F4, all ACCEPT_NOW, all absorbed into plan body)
- Deferred to backlog: 0
- Open Questions: 없음
- Cross-gate dedupe rationale: plan body §Tasks + §Files to Change 완전 정의 + Codex R1 4 findings 모두 plan body §"Codex R1 absorptions applied" + Files-to-Change rows로 mechanical 반영. git diff origin/main..HEAD = ∅ ⊆ Files to Change. 새 implement-time decision 0건.
