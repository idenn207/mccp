# Implementation Report: v1.3.0-m4 Refresh · Failure · Privacy Guard

## Summary

M4 wires the *triggers* and *guards* atop M3's render facade. 4 trigger paths (SessionStart hook / receipt-write epilogue / envelope write / envelope-move watcher) keep `.claude/cache/STATUS.md` + `.claude/cache/status.html` aligned with repo state within ~5s of any meaningful change. A 5-pattern secret catalogue (sk-key / aws-key / private-key-block severe + bearer / password-eq quiet) detects secrets in envelope payloads + receipt briefing surfaces, with `applySecretMask` running UNCONDITIONALLY including `--raw` mode (Codex F2 absorption). Loud fail-open invariant: `triggerRender` never throws, tagged stderr lines surface all failure axes.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium (8-12h) | Medium (one session, ~3-4h elapsed) |
| Confidence | High (M3 foundation stable, F1+F2+F3+F4 absorbed pre-implement) | High — cross-gate dedupe applied |
| Files Changed | 1 new lib + 1 hook + 3 caller integrations + mask catalogue + 1 doc + 4-5 tests | 1 new lib + 1 hook + 3 caller integrations + mask catalogue + 1 doc + 5 tests + verdict.js + audit-timeline + derive/index + CLAUDE.md (PRD already in-progress, no edit needed) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | trigger.js — debounced + locked + fail-open facade | ✓ Complete | F1+F4 absorptions implemented (lock-first / debounce-after-render / unique tmp / host-aware tri-state reclaim) |
| 2 | SessionStart hook + manifest entry | ✓ Complete | Sibling to existing `session:start` entry, id=`mccp:render-trigger:session-start` |
| 3 | receipt-write epilogue | ✓ Complete | Added after briefing stamp, lazy-require + try/catch |
| 4 | envelope write + move epilogues | ✓ Complete | `dispatch-envelope.js#write` + `dispatch-watcher.js#scan` both wired |
| 5 | mask.js — maskSecrets + applySecretMask / applyPathMask split | ✓ Complete | F2 unconditional secret mask + F3 envelopes.js `masked_payload_signal` additive field. `derive/index.js` refactored to split-mask pattern |
| 6 | tests (5 new files — added envelopes-mask.test.js for F3 integration) | ✓ Complete | trigger (10) + mask-secrets (11) + verdict-secret-banner (4) + envelopes-mask (1) + session-start-hook (2) = 28 new test cases, all green |
| 7 | verdict step 1.5 + audit-timeline footnote + derive last_render_meta | ✓ Complete | impeccable F1-F4 absorbed in copy (telegraphic Korean, no em dash, source_id surfaced, Bearer/password= silent in verdict but visible in audit timeline) |
| 8 | docs (dashboard-surface.md §10 + CLAUDE.md §1.4 + §4 toggles) | ✓ Complete | dashboard-surface.md §10 added (6 subsections); CLAUDE.md §1.4 m4 row + §4 MCCP_RENDER_TRIGGER_DEBOUNCE_MS / MCCP_RENDER_LOCK_LEASE_MS env toggles |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | ✓ Pass | Node native — no separate type-check phase |
| Unit Tests | ✓ Pass | 512 tests across renderer/derive/briefing/receipt suites, 0 failures |
| Build | n/a | Pure JS, no build step |
| Integration | ✓ Pass | envelopes-mask.test.js drives real envelope JSON → derive → masked model → no raw secret in JSON output |
| Edge Cases | ✓ Pass | F1 absorption (concurrent triggers → dirty marker), F4 absorption (live same-host PID NEVER reclaimed), F2 absorption (raw mode still masks secrets), F3 absorption (envelope payload strings never stored, only masked_payload_signal) |

### Smoke validation

```
$ node plugins/mccp/scripts/hooks/render-trigger-session-start.js < /dev/null
$ ls -la .claude/cache/{STATUS.md,status.html,.last-render.json}  # all present, mtime fresh

# debounce: back-to-back triggers leave mtime unchanged
$ node hooks/...; MT1=$(stat -c %Y STATUS.md); node hooks/...; MT2=$(stat -c %Y STATUS.md)
$ # MT1 = MT2 ✓
```

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/trigger.js` | CREATED | +234 |
| `plugins/mccp/scripts/hooks/render-trigger-session-start.js` | CREATED | +35 |
| `plugins/mccp/hooks/hooks.json` | UPDATED | +11 (sibling SessionStart entry) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | +12 (epilogue) |
| `plugins/mccp/scripts/lib/dispatch-envelope.js` | UPDATED | +11 (epilogue) |
| `plugins/mccp/scripts/lib/dispatch-watcher.js` | UPDATED | +11 (per-envelope trigger) |
| `plugins/mccp/scripts/derive/mask.js` | UPDATED | +136 / -34 (split + secret catalogue) |
| `plugins/mccp/scripts/derive/sources/envelopes.js` | UPDATED | +45 (masked_payload_signal additive) |
| `plugins/mccp/scripts/derive/index.js` | UPDATED | +28 / -2 (split-mask call + last_render_meta) |
| `plugins/mccp/scripts/lib/renderer/verdict.js` | UPDATED | +17 (step 1.5) |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATED | +30 (mask stats + was_stale footnote) |
| `plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` | CREATED | +200 (10 paths) |
| `plugins/mccp/scripts/lib/renderer/tests/verdict-secret-banner.test.js` | CREATED | +70 (4 paths) |
| `plugins/mccp/scripts/derive/tests/mask-secrets.test.js` | CREATED | +175 (11 paths) |
| `plugins/mccp/scripts/derive/tests/envelopes-mask.test.js` | CREATED | +58 (1 integration path) |
| `plugins/mccp/scripts/hooks/tests/render-trigger-session-start.test.js` | CREATED | +50 (2 subprocess paths) |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATED | +86 (§10 six subsections) |
| `CLAUDE.md` | UPDATED | +7 (§1.4 m4 row + §4 env toggles) |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | (unchanged in this cycle — PRD M4 row was set to in-progress prior to implement entry) | 0 |

Approximate total: ~1100 LOC added.

## Deviations from Plan

- **Plan listed 4 test files; shipped 5.** Added `derive/tests/envelopes-mask.test.js` (F3 integration test). The plan's "## Codex Adversarial Review > Task body absorptions > F3" explicitly called this out as required, so this is plan-conformant, not a deviation.
- **Audit-timeline mask statistics row** appended (impeccable F4 absorption) — plan body had this in design-critique but I implemented it in the same task to keep the surface coherent. Bearer/password= now show in timeline footnote even though they don't trip the verdict step 1.5 banner.
- **`maskModel` retained as backward-compat facade** — kept the previous public `maskModel(model, root)` export for `derive/tests/mask.test.js#test 3` (idempotency test), implemented as `applySecretMask` + `applyPathMask` composed on a deep clone. The old test still passes.

## Issues Encountered

- **`validate-cmd` does not auto-derive decision-slug from args.** When called `--command mccp:prp-implement` without `--plan` or `--decision`, the CLI falls back to `default` and reports the v0.2.8 generic-receipt quarantine error. Workaround: passed `--decision <slug>` explicitly. Known axis (already in mccp roadmap auto-memory). Not blocking.
- **Edit-loop hook warning fired during distinct envelope.js edits** — false positive. Verified by inspecting old_string/new_string in each call — three separate, non-identical edits. Proceeded.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/renderer/tests/trigger.test.js` | 10 | cold trigger, debounce, _injectRenderThrow, lock+live-pid, lock+dead-pid, was_stale, dirty marker (F1), reclaim refused (F4 host-aware), reclaim succeeds, isPidAlive helper |
| `lib/renderer/tests/verdict-secret-banner.test.js` | 4 | empty mask_hits, severe banner, non-severe quiet, M0 precedence |
| `derive/tests/mask-secrets.test.js` | 11 | each of 5 regex kinds, clean text, applySecretMask on receipts, derive --raw F2, derive default F2, isSevereKind helper |
| `derive/tests/envelopes-mask.test.js` | 1 | real envelope JSON → derive → masked_payload_signal + model.mask_hits, no raw secret in model JSON (F3) |
| `hooks/tests/render-trigger-session-start.test.js` | 2 | fresh tmpdir exit 0, missing CLAUDE_PLUGIN_ROOT exit 0 |

Total: 28 new test cases. All green. Existing 484 tests across renderer/derive/briefing/receipt suites unchanged — 512 total green.

## Next Steps

- [ ] Code review via `/mccp:code-review` (optional — Codex review was deduped via plan-stage Codex Adversarial Review with 4 absorptions)
- [ ] Create PR via `/mccp:pr` — this PR should bundle `plugin.json` version bump 1.3.1 → 1.4.0 per CLAUDE.md §3.7 (M3 already shipped at 1.4.0 per [[mccp-v1.3.0-cycle]] auto-memory — M4 ride-along is the simpler path; if M3 left version at 1.3.1, this M4 ship bumps to 1.4.0)
- [ ] Worktree cleanup post-merge per CLAUDE.md §3.8 (`git worktree remove .worktrees/v1.3.0-observability-m4`)
- [ ] M5 (daily snapshot archive) — separate cycle
