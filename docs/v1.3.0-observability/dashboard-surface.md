# Dashboard Surface — v1.3.0-m3 STATUS.md + status.html

> Canonical spec for the renderer surface shipped in v1.3.0-m3. Mirrors the style of [schema-surface.md](./schema-surface.md). Read this before changing anything under `plugins/mccp/scripts/lib/renderer/` or `plugins/mccp/scripts/derive/cli.js` (`render` subcommand).

## §1 File paths + ownership

| Artifact | Path | Writer | Gitignored |
|---|---|---|---|
| Telegraphic markdown | `.claude/cache/STATUS.md` | `plugins/mccp/scripts/derive/cli.js render` (via `lib/renderer/markdown.js`) | yes (`.gitignore:59`) |
| HTML single page | `.claude/cache/status.html` | same | yes |

Both artifacts are *manual + on-demand* in M3. Hook-triggered refresh ships in M4; daily snapshot ships in M5.

Programmatic entry (for M4 hook wiring): `const { renderStatus } = require('plugins/mccp/scripts/lib/renderer');` — `renderStatus(model, opts) → { md, html, derivedAt, masked, warnings, verdict }`.

## §2 6-section structure

| # | Section | Markdown anchor | HTML id | Graceful hide |
|---|---|---|---|---|
| 1 | Verdict (1-line tone+icon+text) | `#verdict` | `verdict` | never |
| 2 | Status grid (4-axis: in-progress / blocked / next-step / risks-open) | `#status` | `status` | never |
| 3 | Worker fanout (envelopes + controller skew) | `#workers` | `workers` | hide if `envelopes.count===0 AND !controller_active` |
| 4 | Audit timeline (last 7 days × 30 rows + briefing surface) | `#timeline` | `timeline` | never (empty placeholder if no rows) |
| 5 | Open Questions (state + plan body merge, dedupe) | `#questions` | `questions` | hide if merged list empty |
| 6 | Risks (top in-progress plan's `## Risks` + PRD fallback) | `#risks` | `risks` | never (`no risks surface available` placeholder if none) |

Markdown uses `##` h2 headings consistently. HTML uses `<section id="...">` for stable cross-doc anchors (impeccable P3 — no emoji prefix in h2 to prevent slugify drift).

## §3 Verdict priority chain (11 steps, deterministic, LLM-free)

The verdict line is computed from derive signals in this fixed priority order. The first signal that fires writes the verdict; later signals are skipped. Both STATUS.md and status.html call the same `computeVerdict(model, planBody)` function in `plugins/mccp/scripts/lib/renderer/verdict.js`.

| Step | Signal | Tone | Output |
|---|---|---|---|
| 1 | `m0_capability.contract_present === false` | red | `🚫 schema contract missing — derive degraded` |
| 2 | `warnings[]` entry with `severity === 'critical'` | red | `🚫 <source>: <message>` |
| 3 | any `sources.*.degraded === true` | amber | `⏱ <first-source>[ + N more] 소스 손상` (impeccable P3 — name first source) |
| 4 | `sources.state.item.resume_state === 'giveup'` | red | `🚫 resume dispatch gave up after <N> attempts` |
| 5 | `sources.state.item.resume_state === 'in-flight'` | amber | `⏱ resume dispatch in-flight (attempt <N>)` |
| 6 | `sources.fix_task.item` truthy + `state.item.escalate_pending` | amber | `⚠ fix-task pending escalate` |
| 7 | envelope entries with `stale === true` count > 0 | amber | `⏱ <N> worker(s) heartbeat stale` |
| 7.5 | `state.item.controller_active === true && envelopes.length === 0` (R1 F3 absorption) | amber | `⏱ controller active, envelopes missing (<N> dispatches)` |
| 8 | envelope entries `is_terminal === false && stale === false` count > 0 | green | `● <N> worker(s) alive · <terminal-count> terminal` |
| 9 | `sources.backlog.count > 0` | neutral | `<count> findings deferred · next: <next-in-progress-plan>` |
| 10 | plans with `status === 'in-progress'` count > 0 | neutral | `<count> plans active · next: <first in-progress plan slug>` |
| 11 | fallback | muted | `no in-flight signal · select next milestone from PRDs` (impeccable P2 — not bare `idle`) |

Plan `status` is **not** an M1 derive field — it is computed in M3 via `parsers/plan-body.js`'s `parseDeliveryMilestones()` reading the PRD `## Delivery Milestones` table column 4 (Codex R1 F1 absorption).

## §4 Status triple invariant (color + icon + text — WCAG AA + color-blindness safe)

Every status cell uses three signals. Markdown surfaces only unicode-icon + Korean text (no color). HTML surfaces all three.

| Status | Color token | Icon | Korean | `appliesTo` |
|---|---|---|---|---|
| `blocked` | `--status-blocked` oklch(0.55 0.18 25) | 🚫 | 차단됨 | both |
| `stale` | `--status-stale` oklch(0.75 0.15 80) | ⏱ | 오래됨 | **icon only** (amber L=0.75 fails AA body) |
| `secret-warn` | `--status-secret` oklch(0.50 0.22 25) | ⚠ | 시크릿 의심 | both |
| `worker-alive` | `--status-worker-alive` oklch(0.65 0.15 145) | ● | 활성 | both |
| `worker-stale` | `--status-worker-stale` oklch(0.75 0.15 80) | ⏱ | 심박 끊김 | **icon only** |
| `terminal-ok` | `--accent` | ✓ | 완료 | both |
| `terminal-failure` | `--status-blocked` | ✗ | 실패 | both |
| `in-progress` | `--accent` | ◐ | 진행 중 | both |
| `neutral` | `--muted` | · | 대기 | both |

**impeccable P1 invariant**: amber tokens (L=0.75) declare `appliesTo: 'icon'`. body text on amber rows still renders with `--ink`, not the amber color. status badges render in color, but the surrounding row text does not. This is documented per `STATUS_BADGES` in `format-utils.js`.

Plain-text STATUS.md is grep-friendly because every status row contains the Korean label literally — `grep "차단됨" .claude/cache/STATUS.md` works.

## §5 Graceful hide + verdict escalation rules

- **envelope.count === 0 AND !controller_active** → `## Workers` section is skipped entirely (`renderWorkerFanout` returns `null`). HTML output omits `<section id="workers">`. Markdown anchor nav drops `[workers](#workers)`.
- **open-questions merged list empty** → `## Open Questions` skipped (same null pattern).
- **risks list empty** → renders `_(no risks surface available)_` placeholder. NOT hidden — risks are project-level signal even when nothing is in-progress.
- **audit-timeline within 7-day window === 0** → renders `_(최근 7일 활동 없음)_` placeholder. NOT hidden — empty timeline is the signal.
- **degraded source** → verdict step 3 fires amber. The source section itself still renders (graceful fail-open per per-section catch).
- **capability `contract_present===false`** → verdict step 1 fires red. All sections still render below.

## §6 Cache and refresh boundary (M3 / M4 / M5 ownership split)

| Behavior | Milestone | Status |
|---|---|---|
| Renderer (model → STATUS.md + HTML) | M3 | shipped |
| CLI `node plugins/mccp/scripts/derive/cli.js render` (manual + on-demand) | M3 | shipped |
| Hook trigger on SessionStart | M4 | pending |
| Hook trigger on receipt-write | M4 | pending |
| Hook trigger on envelope write/move | M4 | pending |
| Privacy escalation (secret/path masking enforcement) | M4 | pending |
| Daily snapshot to `.claude/cache/snapshots/YYYY-MM-DD.json` | M5 | pending |
| Decision log derive (audit timeline 30-day archive) | M5 | pending |

M3 exposes `renderStatus(model, opts)` and the CLI `render` subcommand. M4 will call these from hook callbacks — no API change expected, only new callers.

## §7 Cross-platform notes

- `markdown.js` writes content with `\n` line endings only. The cache file is gitignored so Windows CRLF normalization is moot, but consistent `\n` keeps diff-tooling sane.
- `html.js` inline `<script>` uses ASCII-only operators. No `?.`/`??` (compatibility with older browsers if user opens the file outside Chrome).
- `formatRelativeTime` and `formatStatusBadge` return Korean labels — no system locale dependency.
- `writeAtomic` in `derive/cli.js` uses `.tmp` sibling + `fs.renameSync` so a render-in-progress never corrupts the cached file mid-write.

## §8 Fail-open invariant (Codex R1 F2 absorption)

`renderStatus()` is **never permitted to throw**, regardless of input. Three protection layers:

1. **Per-section catch** (`safeSection(name, fn)`) — one broken section renderer cannot crash the page. Failed section substitutes an inline error placeholder + emits `[mccp:renderer] section=<name> FAILED <msg> (allow)` to stderr (loud-fail-open per `[[feedback-loud-fail-open]]`).
2. **Per-composer catch** (`safeCompose(name, fn, fallback)`) — markdown or HTML composer throwing returns a minimal fallback for that side; the other side still renders.
3. **Outer facade catch** — any exception escaping the above goes to `safeFallback(err)` which returns a red-verdict STATUS.md + minimal status.html with an alert ribbon. CLI exit code stays 0; the surface always exists.

## §9 HTML injection boundary (Codex R1 F4 absorption)

`escapeHtml(s)` and `escapeAttr(s)` (in `format-utils.js`) escape `& < > " ' `` ` plus URL-escape parens + whitespace. Every section HTML output MUST run dynamic text through these. Threat model is *self-injection from local `.claude/` artifacts* — a corrupted briefing_summary, envelope path, open-question text, or risk mitigation rendering as live HTML in the local browser. The 4 injection payloads are covered by `tests/escaping.test.js`.

The boundary is invariant: a new section renderer that concatenates dynamic text into HTML without going through `escapeHtml` is a regression that `tests/escaping.test.js` does not catch directly — code review must verify the call path.
