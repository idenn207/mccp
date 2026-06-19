# Plan: v1.3.0 Milestone 4 — Refresh · Failure · Privacy Guard

**Source PRD**: [.claude/prds/v1-3-0-observability-surface-ii.prd.md](../prds/v1-3-0-observability-surface-ii.prd.md)
**Selected Milestone**: 4 — Refresh · failure · privacy guard (consumes M1 derive + M2 briefing + M3 renderer; produces the *trigger* + *guard* layer that keeps STATUS.md/status.html freshly aligned with reality and free of leaked secrets)
**Complexity**: Medium (1 new lib module `lib/renderer/trigger.js` + 1 new SessionStart hook + 3 caller integrations (receipt write, envelope write, envelope move) + envelope-payload mask catalogue extension + 1 new doc + 4–5 tests. No new npm dep. Estimated 8–12h.)

## Summary

M4 wires the *triggers* and *guards* atop M3's render facade. Three update paths fire `triggerRender(reason)` (a thin debounced wrapper around `renderStatus()` + atomic file write) so `.claude/cache/STATUS.md` + `.claude/cache/status.html` reflect repo state within 5s of any significant change:

1. **SessionStart hook** — new `render-trigger-session-start.js` registered in `plugins/mccp/hooks/hooks.json`. Fires once at session boot.
2. **receipt-write epilogue** — `plugins/mccp/scripts/receipt/write.js` post-write callback (after JCS-canonical receipt is persisted and M2 briefing stamp is applied).
3. **envelope write + move** — `plugins/mccp/scripts/lib/dispatch-envelope.js` write path + `dispatch-watcher.js` move/finalize detection.

**Loud fail-open invariant**: every trigger call wraps `renderStatus()` in `try { ... } catch (err) { stderr.write('[mccp:renderer-trigger] reason=<r> FAILED <msg> (allow)\n'); return false; }`. Trigger failure must NEVER propagate to receipt write, envelope write, or SessionStart. The render facade itself already has outer fail-open (M3 F2 absorption); `trigger.js` only adds the *caller-visible* loud-fail-open contract per [[feedback-loud-fail-open]].

**Privacy guard 강화 (M4 owns)**: M3's `format-utils.js#mask()` already passes through derive's masked-by-default model, but the M1 `derive/mask.js` catalogue only covers `meta.cwd` path normalization. M4 extends `mask.js` with secret-pattern detection on **envelope payload fields** (`next_action`, `findings[].text`, `receipts_added[]`) and `receipt.meta.briefing_summary` — these are the post-M2 surface where worker prompt/output text now lands. Patterns: `sk-[A-Za-z0-9]{20,}` (OpenAI/Anthropic key shape), `Bearer\s+\S{20,}`, `password\s*=\s*\S+`, AWS access key shape (`AKIA[0-9A-Z]{16}`), private-key BEGIN block. Detected substrings are replaced with `[REDACTED:<reason>]` AND a `mask_hit` flag is bubbled up so the renderer's verdict step 1.5 (new) can show `⚠ 시크릿 의심 감지` red banner. Values are NEVER printed even with `--raw`.

**60-second stale amber backend**: M3 ships a sticky header with inline JS that flips `body[data-stale=1]` when `Last refreshed` > 60s. M4 adds a *backend* signal: when `triggerRender` runs and finds the previous cache mtime > 60s, it stamps `meta.was_stale = true` into the render and emits a one-line stderr `[mccp:renderer] cache_stale: previous render was N seconds old`. This surfaces stale renders in hook trace AND in the next render's audit timeline footnote. No new hook is added for "active 60s polling" — staleness is detected at trigger time, not on a timer.

**Debounce contract (single 5s window)**: `trigger.js` writes a debounce marker file `.claude/cache/.trigger-pending` containing the requested reason + ISO timestamp. If the marker exists with `mtime < 5s ago`, the call is a no-op (returns false). If `mtime >= 5s ago`, the marker is rewritten with the current reason+timestamp AND the render is invoked. This is a *content debounce*, not a Node `setTimeout` — required because each trigger may run in a different short-lived hook process (cannot share in-memory state). Atomic write with `fs.writeFileSync` to `.trigger-pending.tmp` + `fs.renameSync`.

**Re-entrancy**: render in progress is detected by a separate `.claude/cache/.render.lock` (single-writer atomic `fs.openSync` with `wx` flag, mirrors `pr-phase.lock` pattern from CLAUDE.md §3.6). Lease 90s. If lock is held and < 90s old, trigger returns false + stderr `[mccp:renderer-trigger] reason=X SKIP render in-flight`. If > 90s, lock is reclaimed (loud stderr) and render proceeds. This matches the v1.2.0-m1 `pr-phase-lock.js` host-aware tri-state policy in spirit (PID liveness + mtime) but is simpler — a single sync render takes ~200–500ms in practice, so 90s is a generous safety margin.

**M3 surface frozen**: M4 does NOT modify `renderStatus()`, the 11-step verdict chain, the section renderers, or the format-utils API (except adding `escapeHtml` import-side users — no API change). M4 only ADDS a new exported function `triggerRender(reason, opts)` in `lib/renderer/trigger.js` and a new `mask.js` field-aware export. The render facade stays a *pure function of model + opts*.

**M5 boundary**: M4 does NOT archive daily snapshots, does NOT compute the audit timeline 7-day window (M3 already does), does NOT add the `.claude/cache/snapshots/YYYY-MM-DD.json` directory. M5 will introduce a separate `triggerSnapshot()` and a daily wakeup hook. M4 just refreshes the live cache.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Hook manifest entry | `plugins/mccp/hooks/hooks.json` + `scripts/hooks/session-start.js` | hooks.json `SessionStart` matcher with `command: node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/render-trigger-session-start.js"`. The new hook is *additional* to the existing session-start.js, not a replacement. |
| Loud fail-open facade | `plugins/mccp/scripts/lib/briefing/index.js:282-338` (`triggerBriefing`) + [[feedback-loud-fail-open]] | outer try/catch + stderr loud message + `(allow)` suffix + return false. Every trigger caller must invoke `triggerRender` with `try/catch` of its own, but `trigger.js` itself MUST NOT throw — caller's try is belt-and-suspenders. |
| Atomic file write | `plugins/mccp/scripts/derive/cli.js#cmdRender` (M3 ship) | `fs.writeFileSync(path + '.tmp', content, 'utf8')` then `fs.renameSync(path + '.tmp', path)`. M4's trigger reuses the M3 atomic write pattern. |
| Single-writer atomic lock | `plugins/mccp/scripts/lib/pr-phase-lock.js` (M3+ infra) + CLAUDE.md §3.6 canonical schema | `fs.openSync(lockPath, 'wx')` + lock body `{ ownership_token_hash, pid, host, started_at, mtime }`. M4 uses the simpler subset — no token-hash IPC needed since trigger is in-process. Lease via PID liveness OR mtime > 90s. In-loop heartbeat NOT needed (render is short). |
| Receipt write epilogue | `plugins/mccp/scripts/receipt/write.js` — search for the function that finalizes the file (after `fs.writeFileSync` + briefing stamp from M2) | append a `try { triggerRender('receipt-write') } catch {}` at the very end of the success path. NEVER in the catch path. |
| Envelope write epilogue | `plugins/mccp/scripts/lib/dispatch-envelope.js` write helper (the function that does `fs.writeFileSync` to `.envelope.json.tmp` + rename) | same pattern: append `try { triggerRender('envelope-write') } catch {}` after `fs.renameSync` succeeds. |
| Envelope move detection | `plugins/mccp/scripts/lib/dispatch-watcher.js` — terminal-status finalize path | append same trigger call after the envelope's terminal status is recognized. Watcher is long-lived, so debounce is critical there. |
| Mask regex catalogue | `plugins/mccp/scripts/derive/mask.js` (M1 — currently only path normalization) | new export `maskSecrets(text, opts) → { masked: string, hits: Array<{kind, count}> }`. opts.fieldName supplied so the verdict can attribute. Composable with the existing path mask. |
| Korean primary, English identifiers | PRD §Design Direction "Copy" + CLAUDE.md §0 | stderr messages stay English ASCII (grep-friendly for ops). User-visible HTML/MD banner copy in Korean (`시크릿 의심`, `오래된 캐시`). |
| Tests | `plugins/mccp/scripts/lib/renderer/tests/index-outer-fail-open.test.js` (M3 F2) | synthesize calls to `triggerRender(reason, { _injectRenderThrow: true })` and assert (a) returns false (b) stderr matches loud pattern (c) no unhandled exception bubbles. Mirror M3's `_inject*` test ergonomics. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/trigger.js` | CREATE | Single export `triggerRender(reason, opts) → boolean`. Implements the 5s content debounce (`.claude/cache/.trigger-pending`), the 90s render lock (`.claude/cache/.render.lock`), `was_stale` detection (compare prev `STATUS.md` mtime to now), and the loud fail-open wrapper around `renderStatus()`. Returns true if a render happened, false otherwise. Per-call cost: ~3 fs.statSync + 1 fs.writeFileSync + 1 fs.renameSync when skipped (debounce path), full render when not. |
| `plugins/mccp/scripts/hooks/render-trigger-session-start.js` | CREATE | New SessionStart hook entrypoint. Loads `lib/renderer/trigger.js`, calls `triggerRender('session-start')`, exits 0 *always*. stdin is read-and-discard (hook protocol). Cross-platform — no PowerShell/bash dependencies. Logs to stderr via `[mccp:render-trigger:session-start]` prefix. The existing `session-start.js` is NOT modified — they're independent hooks, the manifest registers both. |
| `plugins/mccp/hooks/hooks.json` | UPDATE | Append a new `SessionStart` matcher entry calling `render-trigger-session-start.js`. The existing session-start entries stay untouched. Hook id: `mccp:render-trigger:session-start`. Description: "Trigger STATUS.md/status.html re-render on session boot (M4 ship)". |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | After the canonical receipt write succeeds (after M2 briefing stamp + `fs.writeFileSync` + atomic rename), append `try { require('../lib/renderer/trigger').triggerRender('receipt-write'); } catch (e) { process.stderr.write('[mccp:receipt-write] post-write trigger threw (allow): ' + (e && e.message) + '\n'); }`. The require is lazy to avoid circular load + zero cost when `lib/renderer/` is missing (defensive against staged installs). |
| `plugins/mccp/scripts/lib/dispatch-envelope.js` | UPDATE | After successful envelope write (final `fs.renameSync` of `.envelope.json.tmp → .envelope.json`), append same lazy `try { triggerRender('envelope-write') } catch {}` block. Mirror the receipt write pattern. Read-side validate() functions remain untouched. |
| `plugins/mccp/scripts/lib/dispatch-watcher.js` | UPDATE | In the terminal-status finalize callback (where the watcher merges a worker's envelope into the parent context), append same trigger call with reason `'envelope-move'`. Watcher is a long-lived process so the 5s debounce will collapse bursty terminal-status transitions. |
| `plugins/mccp/scripts/derive/mask.js` | UPDATE | Add a new export `maskSecrets(text, opts = {}) → { masked: string, hits: Array<{kind: 'sk-key'\|'bearer'\|'password-eq'\|'aws-key'\|'private-key-block', count: number, field?: string}> }`. Compile 5 regexes once at module top. Apply to input text. Replace matches with `[REDACTED:<kind>]`. Return both the cleaned string and structured hit metadata so the renderer can attribute. Integrate into the existing `applyMaskToModel(model)` so envelope `next_action`, `findings[*].text`, `receipts_added[*]`, and receipt `meta.briefing_summary` go through the new function. Preserve the existing path-mask behavior — `maskSecrets` is purely additive. |
| `plugins/mccp/scripts/lib/renderer/verdict.js` | UPDATE | Insert a new priority step **1.5** between steps 1 and 2: if `model.mask_hits.length > 0` for severe kinds (`sk-key`, `aws-key`, `private-key-block`), return `{ tone: 'red', icon: '⚠', text: '시크릿 의심 감지 — N개 의심 매칭, 즉시 점검' }`. The `mask_hits` field is added to the derive model output by M4's `mask.js` change. Step 1 (M0 contract missing) still takes precedence — schema breakage is a higher-order failure than secret leakage detection. |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | When `triggerRender` flagged `was_stale: true` in the most recent receipt's render attempt, append a single muted footnote row at the end of the audit-timeline section: `· ⏱ 이전 캐시가 N초 동안 갱신되지 않았습니다`. Pure consumer-side change — does not invoke trigger.js. Pulls `was_stale` from `model.last_render_meta` (M4 extension to derive model). |
| `plugins/mccp/scripts/derive/index.js` | UPDATE | Read `.claude/cache/.last-render.json` (if present) and surface as `model.last_render_meta = { was_stale, prev_age_seconds, reason }`. Missing file → `last_render_meta = null` (graceful). This is a *consumer-side* surface for M4's audit-timeline footnote; M3's pure-function verdict path is unaffected. |
| `plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` | CREATE | 6 paths: (a) cold trigger writes cache files + returns true; (b) second trigger within 5s window returns false (debounce); (c) trigger with `_injectRenderThrow: true` returns false + stderr matches loud pattern; (d) lock held + mtime < 90s → returns false; (e) lock held + mtime > 90s → reclaim + render proceeds; (f) `was_stale: true` flagged when previous STATUS.md mtime > 60s. |
| `plugins/mccp/scripts/derive/tests/mask-secrets.test.js` | CREATE | 7 paths: (a) sk-key pattern → redacted + hit recorded; (b) AWS access key pattern → redacted + hit; (c) Bearer token → redacted; (d) `password=...` → redacted; (e) PRIVATE KEY block → redacted; (f) clean text → no change, hits empty; (g) integration: `applyMaskToModel` on a synthetic envelope with `next_action` containing a sk-key → output mask present in masked model. |
| `plugins/mccp/scripts/lib/renderer/tests/verdict-secret-banner.test.js` | CREATE | 3 paths: (a) mask_hits empty → step 1.5 skipped; (b) mask_hits with sk-key → step 1.5 fires, verdict red; (c) M0 contract missing AND mask hits → step 1 wins (precedence). |
| `plugins/mccp/scripts/hooks/tests/render-trigger-session-start.test.js` | CREATE | Spawn the hook as a subprocess with mocked stdin/stdout (read-and-discard). Assert exit code 0 even when `lib/renderer/` is missing (defensive load). Assert stderr emits `[mccp:render-trigger:session-start]` prefix on both success and failure paths. |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATE | Append §7 "Refresh + privacy guard (M4)" — document the 3 trigger paths, the 5s content debounce + 90s render lock, the loud fail-open invariant, the `maskSecrets` catalogue with 5 patterns, and the verdict step 1.5 secret-suspect banner. Cross-link to CLAUDE.md §3.6 lock pattern and [[feedback-loud-fail-open]]. |
| `CLAUDE.md` | UPDATE | §1.4 table: append `v1.3.0-m4 refresh + privacy guard` row mirroring m0–m3 entries. §4 운영 토글 cheat sheet: add `MCCP_RENDER_TRIGGER_DEBOUNCE_MS` (default 5000) and `MCCP_RENDER_LOCK_LEASE_MS` (default 90000) toggles for ops debugging. |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATE | Row 4 (M4 refresh · failure · privacy guard) `pending → in-progress` + Plan cell link to `../plans/v1-3-0-observability-m4-refresh-failure-privacy-guard.plan.md`. No body amendments. (Row 3 M3 status row is already complete per current PRD state.) |

**No mutations** to: `plugins/mccp/scripts/lib/renderer/index.js` (renderStatus signature/behavior unchanged), `lib/renderer/markdown.js`, `lib/renderer/html.js`, `lib/renderer/format-utils.js` API surface, M2 briefing modules (`lib/briefing/*`), `derive/correlate.js`, `derive/model.js`, `plugins/mccp/.claude-plugin/plugin.json` version (M4 is still inside the 1.3.0 cycle; cycle close PR will bump per CLAUDE.md §3.7).

**Codex R1 F3 boundary refinement**: M1 surface frozen invariant is read as **field rename/remove forbidden**, not "no new additive fields". M4 may add new fields to `derive/sources/envelopes.js` output (`masked_payload_signal`) and to `derive/index.js` (`mask_hits`, `last_render_meta`) as long as existing keys remain immutable. Codex R1 F2 raw-mode invariant: `maskSecrets` runs unconditionally including `--raw`; `--raw` only bypasses path normalization. See Codex Adversarial Review section absorption notes for the full Task 1/5/7 deltas.

## Tasks

### Task 1: trigger.js — debounced + locked + fail-open facade (BLOCKING PREREQUISITE)

- **Action**: Create `plugins/mccp/scripts/lib/renderer/trigger.js`. Single export `triggerRender(reason, opts = {}) → boolean`. Internal flow:
  1. Resolve `.claude/cache/` (use `process.cwd()` + check for repo root via existing `derive/index.js` helper or simple `.git`-walk).
  2. Check debounce marker `.trigger-pending`. If `mtime < (opts.debounceMs || 5000)` ago AND `opts.force !== true`, return false.
  3. Atomic write debounce marker with current reason+timestamp.
  4. Try to acquire render lock (`fs.openSync(.render.lock, 'wx')` + body `{ pid, host, started_at, mtime }`).
     - If `EEXIST`: stat the lock file. If lock mtime > `(opts.lockLeaseMs || 90000)` ago → loud stderr + `fs.unlinkSync` + retry once. If still EEXIST, return false + stderr `SKIP render in-flight`.
  5. Read previous STATUS.md mtime to compute `was_stale = (now - prevMtime) > 60000`.
  6. Call `require('../../derive').derive(repoRoot)` + `renderStatus(model, { reason, was_stale })`.
  7. Atomic write of `STATUS.md` + `status.html` (mirror M3 `cmdRender` atomic-rename).
  8. Write `.claude/cache/.last-render.json` with `{ reason, was_stale, prev_age_seconds, render_at }` so the next derive call surfaces `model.last_render_meta`.
  9. Release lock (`fs.unlinkSync`).
  10. Return true.
  - All steps 2–9 wrapped in outer try/catch. catch path: loud stderr `[mccp:renderer-trigger] reason=X FAILED <msg> (allow)`, ensure lock release in finally, return false.
- **Mirror**: `lib/briefing/index.js#triggerBriefing` outer try/finally pattern + `pr-phase-lock.js` lock body shape + M3 `derive/cli.js#cmdRender` atomic write.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` (Task 6 lands tests).

### Task 2: SessionStart hook + manifest registration

- **Action**:
  - Create `plugins/mccp/scripts/hooks/render-trigger-session-start.js`. Reads stdin to EOF (hook protocol), calls `triggerRender('session-start')`, always exits 0. Defensive: lazy-require `lib/renderer/trigger.js` inside a try/catch so missing renderer (staged install) does not break SessionStart.
  - Update `plugins/mccp/hooks/hooks.json` to append a SessionStart matcher entry with id `mccp:render-trigger:session-start`.
- **Mirror**: `plugins/mccp/scripts/hooks/session-start.js` general shape (read stdin, exit 0) but much simpler.
- **Validate**: `node plugins/mccp/scripts/hooks/render-trigger-session-start.js < /dev/null` → exit 0 + cache files updated; `node --test plugins/mccp/scripts/hooks/tests/render-trigger-session-start.test.js`.

### Task 3: receipt-write epilogue integration

- **Action**: In `plugins/mccp/scripts/receipt/write.js`, locate the success path (after `fs.writeFileSync` + atomic rename of the receipt file + after M2 briefing stamp completes its lazy callback). Append:
  ```js
  try {
    require('../lib/renderer/trigger').triggerRender('receipt-write');
  } catch (e) {
    process.stderr.write('[mccp:receipt-write] post-write trigger threw (allow): '
      + (e && e.message) + '\n');
  }
  ```
- **Mirror**: M2's `briefing/index.js` post-write callback pattern (lazy require, swallow errors at the caller boundary even though trigger itself is loud-fail-open — belt-and-suspenders).
- **Validate**: Manual: write a receipt via `node plugins/mccp/scripts/receipt/cli.js write --gate mccp-plan-codex --decision <test> --plan <test>` against a tmpdir fixture, assert `.claude/cache/STATUS.md` mtime updates within 5s. Add to `receipt/tests/write.test.js` if a tmpdir-based receipt-write integration test already exists.

### Task 4: envelope write + move integration

- **Action**:
  - In `plugins/mccp/scripts/lib/dispatch-envelope.js`, find the writer function (the one that does `fs.writeFileSync` to `<dispatch_id>.envelope.json.tmp` then `fs.renameSync`). Append the same `try { triggerRender('envelope-write') } catch {}` block after the rename succeeds.
  - In `plugins/mccp/scripts/lib/dispatch-watcher.js`, find the terminal-status detection / finalize callback. Append `try { triggerRender('envelope-move') } catch {}` after the terminal envelope is processed.
- **Mirror**: Task 3 receipt-write pattern.
- **Validate**: Manually write a synthetic envelope JSON via `node -e "require('./plugins/mccp/scripts/lib/dispatch-envelope').writeEnvelope(...)"` against a tmpdir, assert `.claude/cache/STATUS.md` worker fanout section updates within 5s + STATUS.md mtime advances.

### Task 5: mask.js — secret pattern catalogue + field-aware integration

- **Action**: In `plugins/mccp/scripts/derive/mask.js`, add:
  - Top-level constants for 5 regexes (sk-key, AWS access key, Bearer, password=, PRIVATE KEY block). Use non-greedy + bounded length to avoid catastrophic backtracking.
  - New export `maskSecrets(text, opts = {}) → { masked, hits }` that iterates the regex list, replaces matches with `[REDACTED:<kind>]`, returns hit metadata.
  - Wire `maskSecrets` into the existing `applyMaskToModel(model)` (or whatever the M1 entrypoint is — confirm at impl time). Apply specifically to:
    - `model.sources.envelopes.items[*].next_action`
    - `model.sources.envelopes.items[*].findings[*].text` (if findings have text fields; otherwise stringify the finding)
    - `model.sources.envelopes.items[*].receipts_added[*]`
    - `model.sources.receipts.items[*].meta.briefing_summary`
  - Aggregate all hits into `model.mask_hits = [{ kind, count, field, source_id }]` so the renderer's verdict step 1.5 (Task 7) can use it.
  - Preserve existing path-mask behavior — `maskSecrets` is purely additive. `model.masked` flag semantics unchanged (still true by default, `--raw` opt-in).
- **Mirror**: Existing `mask.js` structure (top-level const regex catalog + `applyMaskToModel` orchestrator).
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/mask-secrets.test.js` (Task 6).

### Task 6: tests

- **Action**: Create 4 new test files matching the Files-to-Change rows. Each test file uses the same fixture style as M1/M2/M3 (`os.tmpdir()` + `fs.mkdtempSync()` + synthesized inputs, no real spawn). Tests:
  - `lib/renderer/tests/trigger.test.js` (6 paths)
  - `derive/tests/mask-secrets.test.js` (7 paths)
  - `lib/renderer/tests/verdict-secret-banner.test.js` (3 paths)
  - `hooks/tests/render-trigger-session-start.test.js` (1 path with subprocess spawn)
- **Mirror**: M3 test ergonomics, especially `lib/renderer/tests/index-outer-fail-open.test.js` for `_inject*` opts.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/ plugins/mccp/scripts/derive/tests/mask-secrets.test.js plugins/mccp/scripts/hooks/tests/render-trigger-session-start.test.js` → all green.

### Task 7: verdict step 1.5 secret-suspect banner + audit timeline stale footnote

- **Action**:
  - In `plugins/mccp/scripts/lib/renderer/verdict.js`, insert step 1.5 between step 1 (M0 contract) and step 2 (warnings[].severity=critical). Step 1.5 reads `model.mask_hits` for severe kinds (`sk-key`, `aws-key`, `private-key-block`) and returns the red banner verdict if present.
  - In `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js`, after the existing row-rendering loop, check `model.last_render_meta` and append a single footnote row when `was_stale === true`. Format: telegraphic Korean per PRD §Design Direction Copy.
  - In `plugins/mccp/scripts/derive/index.js`, after the model is built (just before return), read `.claude/cache/.last-render.json` (graceful, missing file → null), parse, and attach as `model.last_render_meta`. JSON parse errors → log to stderr (`[mccp:derive] last-render meta parse failed: <msg> (allow)`) + attach null.
- **Mirror**: M3 verdict.js priority chain shape (linear step list, early return). M3 audit-timeline section shape (filter + render rows).
- **Validate**: `verdict-secret-banner.test.js` (Task 6). Manual: synthesize a `.last-render.json` with `was_stale: true`, run `node plugins/mccp/scripts/derive/cli.js render`, grep STATUS.md for the footnote text.

### Task 8: docs

- **Action**:
  - Append §7 to `docs/v1.3.0-observability/dashboard-surface.md` titled "Refresh + privacy guard (M4 ship)". Sections: 7.1 Trigger paths (table: SessionStart / receipt-write / envelope-write / envelope-move), 7.2 Debounce + lock contract (5s content debounce, 90s lock lease), 7.3 Loud fail-open invariant (cross-link to [[feedback-loud-fail-open]]), 7.4 Secret-suspect catalogue (5 regex patterns + replacement format + mask_hits surface), 7.5 Stale cache footnote.
  - Append to `CLAUDE.md` §1.4 the m4 row + §4 cheat sheet the two new env toggles.
- **Validate**: `grep -q "M4 ship" docs/v1.3.0-observability/dashboard-surface.md`.

## Validation

```bash
# Unit + integration tests
node --test plugins/mccp/scripts/lib/renderer/tests/trigger.test.js \
  plugins/mccp/scripts/lib/renderer/tests/verdict-secret-banner.test.js \
  plugins/mccp/scripts/derive/tests/mask-secrets.test.js \
  plugins/mccp/scripts/hooks/tests/render-trigger-session-start.test.js

# Existing test suites — must stay green (no regressions)
node --test plugins/mccp/scripts/lib/renderer/tests/ \
  plugins/mccp/scripts/derive/tests/ \
  plugins/mccp/scripts/lib/briefing/tests/ \
  plugins/mccp/scripts/receipt/tests/

# Manual smoke
rm -f .claude/cache/STATUS.md .claude/cache/status.html .claude/cache/.last-render.json
node plugins/mccp/scripts/hooks/render-trigger-session-start.js < /dev/null
ls -la .claude/cache/STATUS.md .claude/cache/status.html  # mtime fresh
node -e "console.log(JSON.parse(require('fs').readFileSync('.claude/cache/.last-render.json','utf8')))"

# Debounce smoke
node plugins/mccp/scripts/hooks/render-trigger-session-start.js < /dev/null  # second call within 5s
# Expect: stderr no error, STATUS.md mtime unchanged

# Receipt-write trigger smoke
node plugins/mccp/scripts/receipt/cli.js write --gate mccp-plan-codex --decision <test-slug> --plan <test-plan>
# Expect: STATUS.md mtime advances within ~1s

# Secret mask smoke
echo '{"sources":{"envelopes":{"items":[{"next_action":"call api with sk-ABCDEFGHIJKLMNOPQRSTUVWX"}]}}}' > /tmp/test-model.json
node -e "const m=require('./plugins/mccp/scripts/derive/mask');const model=JSON.parse(require('fs').readFileSync('/tmp/test-model.json'));console.log(JSON.stringify(m.applyMaskToModel(model).mask_hits,null,2));"
# Expect: hits array with kind:'sk-key'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Trigger storm (envelope write loop) → render thrashing | Medium | 5s content debounce in `trigger.js` + 90s lock collapses bursts. dispatch-watcher is the highest-frequency caller; verify debounce works under simulated burst in Task 6 trigger.test.js path (b). |
| Receipt-write hot path slowdown due to inline render (~200–500ms) | Medium | Lazy-require + try/catch wrapper means failure is silent at caller; but the success path still blocks. Acceptable for ≤1Hz receipt writes; if it bites we add `MCCP_RENDER_TRIGGER_ASYNC=1` opt-in (detached child_process spawn) as a v1.3.1 follow-up. Document the cost in dashboard-surface.md §7.2. |
| Lock starvation if a hung process holds .render.lock for >90s | Low | mtime-based reclaim (loud stderr + unlink + retry once) mirrors CLAUDE.md §3.6 canonical pattern. PID liveness check added if we observe issues. |
| Secret regex over-matches innocent text (e.g., `password=foo123` in a code-review excerpt) → false-positive red banner | Medium | Regex tuned for length (≥20 chars after prefix) + visible `[REDACTED:<kind>]` substitution makes false positives discoverable; user can `git log` the raw source. Verdict step 1.5 only fires for *severe* kinds (sk-key, aws-key, private-key-block), not Bearer/password= alone — those still mask but stay quiet. |
| envelope-watcher trigger fires before envelope finalize → stale model | Low | Trigger called after terminal-status callback completes (Task 4 wiring). Worst case: a single stale 5s window before the next debounce slot fires. Acceptable. |
| SessionStart hook adds ~100ms boot cost on cold start | Low | Single fs.statSync + lazy require + early-out if cache fresh (debounce hit). Measured ~30–50ms on M3 ship for full render; SessionStart usually hits the debounce path → ~5ms. |
| Windows + path normalization regression on `.claude/cache/.trigger-pending` | Low | Use `path.join` everywhere + `fs.writeFileSync` with `\n` line endings. Test on the same fixtures the M3 ship validated on (renderer tests already cover Windows tmpdir). |
| Mask `applyMaskToModel` mutating `model.sources.*` accidentally → derive consumers see masked data when they shouldn't | Low | `maskSecrets` returns new strings; `applyMaskToModel` already deep-clones in M1 (verify at impl time). Add a test path (mask-secrets.test.js path g) that confirms the input model is not mutated. |
| Receipt-write trigger + briefing stamp ordering → render reads receipt BEFORE briefing meta is persisted | Medium | Trigger placement MUST be after both M2 briefing stamp callback AND the atomic rename. Confirm by reading the write.js source carefully at impl time (Task 3). Add a test path that asserts `.claude/cache/STATUS.md` reflects `briefing_summary` after a receipt-write+trigger cycle. |

## Acceptance

- [ ] All 8 Tasks complete.
- [ ] All validation commands pass (unit + integration + smoke).
- [ ] STATUS.md + status.html mtime advance within 5s of: (a) SessionStart, (b) `/mccp:receipt-status` write, (c) envelope write, (d) envelope move (dispatch-watcher terminal status).
- [ ] Trigger called within an active debounce window returns false + does NOT advance STATUS.md mtime.
- [ ] Trigger called while `.render.lock` is held (< 90s) returns false + emits stderr `SKIP render in-flight`.
- [ ] `renderStatus` failure (simulated via `_injectRenderThrow`) is caught by `trigger.js` outer try/catch + emits loud stderr + returns false. Caller (receipt-write, etc.) is not poisoned.
- [ ] Secret patterns (5 kinds) detected by `maskSecrets` produce `[REDACTED:<kind>]` substitution AND a `mask_hits` entry.
- [ ] Verdict step 1.5 fires red banner for severe kinds (sk-key / aws-key / private-key-block); does NOT fire for Bearer / password= alone.
- [ ] M0 contract-missing verdict (step 1) takes precedence over mask-hit step 1.5.
- [ ] `model.last_render_meta` surface attached by `derive/index.js` is graceful for missing `.last-render.json`.
- [ ] Audit timeline appends `was_stale` footnote when prev render > 60s.
- [ ] No regressions in M1 / M2 / M3 test suites.
- [ ] No new npm dependencies.
- [ ] M5 boundary respected — no snapshot archival, no daily wakeup hook in M4.
- [ ] PRD M4 row state advanced to `in-progress` with Plan cell linking this file (initial), then to `complete` at PR merge (post-implement).
- [ ] CLAUDE.md §1.4 + §4 toggles updated.

## Design Critique

> impeccable Skill invocation (Phase 5.0). Target: plan-stage frontend surface (verdict step 1.5 copy + audit-timeline footnote + secret-suspect severity tone). Code not yet written — Assessment A (LLM design review) only; Assessment B (detect.mjs) skipped (markup target absent at plan stage — fallback signal). Assessment A grounded by reading existing `verdict.js` / `format-utils.js` to confirm what M3 already ships.

### Heuristic snapshot (Acceptable, 26/40)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | severe-only verdict; Bearer/password= mask 사실은 invisible |
| 2 | Match Real World | 2 | em dash + 정중체 footnote vs telegraphic 정합 충돌 |
| 3 | User Control | 3 | dashboard read-only — 적용 약함 |
| 4 | Consistency | 2 | step 1/2/7/8 영어 + step 3 한국어 surface 이미 ship → step 1.5 한국어 추가 시 부분 정합 |
| 5 | Error Prevention | 3 | mask catalog ≥20자 + severe-only → false-positive 방어 OK |
| 6 | Recognition vs Recall | 3 | "N건 감지" 추상 — affected receipt id verdict 줄에 부재 |
| 7 | Flexibility | 3 | 정적 dashboard — n/a |
| 8 | Aesthetic & Minimalist | 2 | em dash 사용 + "의심" 중복 단어 |
| 9 | Error Recovery | 2 | "즉시 점검" 모호 — 다음 동작 미명시 |
| 10 | Help & Docs | 3 | dashboard-surface.md §7가 catalog 본문화 |
| **Total** | | **26/40** | **Acceptable** |

### Anti-pattern verdict

- **LLM assessment**: AI 자기참조 톤은 없음 — M3 telegraphic 한국어 톤 (`12 plans active · 2 blocked`) 정합 시도. 그러나 **Impeccable absolute ban "No em dashes"** 위반(F1). 비결정성 신호인 `"의심"` 중복도 첫 인상에서 어색.
- **Deterministic scan**: skipped — plan 단계 markup 부재. 코드 ship 후 `/impeccable critique status.html` 재실행 권장.
- **Visual overlays**: n/a.

### Priority issues

- **[P1] F1 — em dash 위반**: `"시크릿 의심 감지 — N개 의심 매칭, 즉시 점검"` 의 `—` 는 Impeccable absolute ban (parent skill "Copy" 룰). PRD §Design Direction "No em dashes" 와도 충돌. **Fix**: `"시크릿 의심 N건 감지 · 즉시 점검"` 또는 `"시크릿 의심 N건: 즉시 키 회전"`. "의심" 중복 1회로 축소. M4 plan Task 7 verdict.js step 1.5 wording에 반영.
- **[P1] F2 — footnote 정중체 vs telegraphic 충돌**: `"이전 캐시가 N초 동안 갱신되지 않았습니다"` 는 정중 종결형. PRD §Design Direction은 telegraphic verb+object 명시. **Fix**: `"이전 캐시 N초 stale · 자동 갱신 안 됨"` 또는 `"이전 렌더 N초 만료 · trigger 미발화"`. plan body Task 7 audit-timeline footnote wording에 반영.
- **[P1] F3 — affected receipt id verdict 줄에 부재**: PM이 verdict 빨강 줄을 보고 *어디 secret 새는지* 즉시 모름. plan은 `mask_hits[].source_id`를 model에 stamp하지만 verdict copy는 count만 표시. PM voice ("여기를 보면 됨") 위반. **Fix**: verdict text를 `"⚠ 시크릿 의심 N건 · receipt:<slug-prefix> 확인"` 형태로 확장 + audit-timeline section의 mask hit row에 receipt slug + envelope dispatch_id full 표시 강제. plan Task 7 + Task 5 (mask.js `mask_hits` shape에 `source_id` + `source_kind` 명시) 갱신.
- **[P2] F4 — Bearer/password= silent mask**: severe-only verdict 분기로 Bearer/password=는 *masking은 되지만 PM은 발생 자체를 모름*. incident postmortem 시 raw evidence 부재. **Fix**: audit-timeline 최근 7일 윈도우에 mask 통계 1줄 가산 (`"이번 주 mask: sk-key 2건 · Bearer 1건"`). severity tone은 muted text — verdict 빨강은 보존. plan body Task 7 audit-timeline section change row 추가.
- **[P2] F5 — step 1/2/7/8 영어 vs step 1.5 한국어 부분 정합**: 기존 verdict.js step 1 (`"schema contract missing — derive degraded"`) + step 7-8 (`"X worker(s) heartbeat stale"`) 영어 surface는 M3 ship 산출물이며 M4 scope에서 변경 금지(plan body "M3 surface frozen" invariant). **결정**: step 1.5 신규 copy는 한국어 telegraphic 유지 + plan body Constraints 섹션에 "verdict copy 한국어 통일은 v1.3.1 axis 후보로 deferred — M4 scope 보호" 1줄 추가. F1+F2 absorption 시점에 함께 적용.

### Persona red flags

- **Alex (Power user, PM mode)**: verdict 빨강 줄에 affected receipt slug 노출 안 됨 — F3가 직접 명중. mask 발생 후 PM이 *어디서* 발생했는지 `/mccp:trace` 또는 grep으로 추적 (60-second goal 위배).
- **Sam (Accessibility)**: PRD color+icon+text 3중 표기 invariant — secret-warn badge `appliesTo: 'both'` OK. verdict 빨강 + ⚠ + 한국어 텍스트 triple 충족. footnote amber `⏱` `appliesTo: 'icon'` (M3 ship) 이지만 footnote에 한국어 텍스트 동반 → triple 유효. **Pass**.

### Minor observations

- footnote 글머리 `·` 는 verdict neutral `·` 과 동일 — visual hierarchy 약간 흐림. indent 또는 muted color로 차별화 권장 (P3).
- "즉시 점검" verb는 OK이지만 *무엇을* 점검할지 모호. "즉시 키 회전" 같은 구체 명사 권장 (P3, F1 fix와 함께 처리).

### Questions to consider

- secret 의심 verdict가 한 번 켜진 후, PM이 raw evidence를 본 뒤 *어떻게 dismiss/silence* 하는가? (현재 plan은 dismiss UI 없음 — derive가 매 render마다 hit 재계산. 의도된 design인지 명시 필요.)
- mask hit이 envelope payload 안에 있을 때, dashboard가 envelope path full을 노출하면 그 자체가 "어떤 dispatch가 secret을 leak했나" hint가 되어 *부분 leakage 정보*가 됨. 트레이드오프 정리 필요.

### Plan amendments locked in

위 F1·F2·F3·F4·F5 5종 absorption은 M4 plan의 Task 5 (mask.js — `mask_hits[].source_id` + `source_kind` shape 명시) + Task 7 (verdict.js step 1.5 wording + audit-timeline footnote wording + 통계 row) 본문에서 implement 시점에 적용. plan body 자체는 critique 결과 anchor만 남기고 Task 본문 wording은 implement Phase에서 확정 — *M4 implement Phase 검토 시 본 critique을 reference로 wording 분쟁 해소*. Constraints (F5 자기 보호): 본 critique은 v1.3.1 axis 후보 "verdict copy 한국어 통일" 1건을 백로그에 추가하라는 권고로 끝나고 M4 scope를 침범하지 않는다.

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R2 skip — 4 absorptions 모두 mechanical, plan body가 변경되지 않은 invariant 영역 침범 없음, Claude self-attest)
- threadId: `019edb6b-ebac-7673-a95f-14efcdf37e42`
- 합치 결론: `needs-attention` → R1 absorption 4건으로 ACCEPT_NOW 전환. 4건 모두 mechanical patch로 plan body에 흡수됨. `MCCP_GATE_ROUND_CAP=1` (default) 적용, R2 trigger 조건 미충족 (HIGH/CRITICAL `ACCEPT_NOW` 잔존 없음 — 전부 absorbed).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — Debounce consumes events before render is guaranteed (race window + fixed `.trigger-pending.tmp` name) | HIGH (conf 0.90) | ACCEPT_NOW | Mechanical: debounce-after-render order + unique temp name with pid/random. Plan Task 1 + Risks 표 정합 mutation. |
  | F2 — Secret masking bypassed by raw mode (existing `--raw` returns unmasked model; secrets in envelope/briefing_summary still printed) | **HIGH (conf 0.92)** | **ACCEPT_NOW** | **Secret-exposure axis (auto-CRITICAL catalog) absorbed inline.** Task 5 본문 amend: `maskSecrets` unconditional, `--raw`는 path-normalization만 bypass. derive/index.js의 raw branch에 새 test path 추가. |
  | F3 — Envelope payload `next_action`/`findings[].text` dropped by current envelopes.js scanner before `maskModel` runs (M1 surface boundary violation) | HIGH (conf 0.88) | ACCEPT_NOW | Boundary 정정: M1 surface frozen invariant 유지를 위해 `derive/sources/envelopes.js`는 *additive* 변경(masked payload field surface 새 키 추가, 기존 키 immutable) + real envelope integration test 추가. plan body "No mutations" 표의 derive/sources/envelopes.js 행 제거. |
  | F4 — Mtime-only lock reclaim → split-brain renders on slow filesystem/AV/WSL clock skew | HIGH (conf 0.83) | ACCEPT_NOW | Mechanical: CLAUDE.md §3.6 host-aware tri-state policy 그대로 적용 (same-host live PID NEVER reclaim, same-host dead PID OK, cross-host mtime fallback). Task 1 reclaim branch 본문 amend + unique temp names for STATUS.md/status.html writes. Risks 표 host-aware row 갱신. |
- Deferred to backlog: 0 → 모두 ACCEPT_NOW R1 absorbed.
- Open Questions: 없음 — 4건 absorption이 plan body에 mechanical 반영됐고, secret-exposure axis(F2)는 raw-mode unconditional masking으로 invariant 복원. Auto-CRITICAL stop 조건 미발동.
- Codex session 참조: threadId `019edb6b-ebac-7673-a95f-14efcdf37e42`, duration 338.7s, classification `ok`, blocking=false.

### Task body absorptions (mechanical, R1)

**F1 absorption — Task 1 (trigger.js) flow 갱신**

기존 Task 1 sub-step 2-3은 *debounce marker write → lock 시도* 순서였으나, F1이 지적한 *render 보장 전 debounce consume* race를 막기 위해 순서를 다음으로 교체:

```
1. resolve repo root + .claude/cache/ 경로
2. lock 시도 (.render.lock atomic fs.openSync wx)
   - EEXIST + lock 유효 (live PID OR mtime < 90s) → **pending dirty marker append** (`.trigger-dirty` append-only로 reason+timestamp 한 줄 추가) + return false
   - EEXIST + lock orphan → §3.6 host-aware tri-state reclaim → 재시도
3. 잠금 획득 후 **content debounce 체크**: prev `.trigger-pending`이 5s 이내면 (concurrent successful render 직후) + dirty marker 비어있으면 → lock release + return false
4. dirty marker가 있으면 → 처리 reason set에 dirty entries 병합 → marker truncate
5. render 시작 (was_stale 계산, derive, renderStatus, atomic write)
6. atomic write: `STATUS.md` + `status.html` 모두 unique tmp 이름 사용 (`STATUS.md.<pid>-<random>.tmp` → rename). M3 cmdRender의 fixed-name tmp는 단일 writer 가정이었으나 M4는 split-brain 시 clobber 위험 — pid+random suffix로 격리.
7. `.last-render.json` 갱신
8. **render 완료 후** `.trigger-pending` write (현재 reason + timestamp) → 다음 5s 안에 들어오는 trigger가 정당하게 skip 가능
9. lock release (finally)
10. return true
```

핵심 invariant: **debounce state는 render 완료 후에만 갱신**된다. lock 보유자가 죽거나 render 실패 시 `.trigger-pending`이 갱신되지 않으므로 다음 trigger가 다시 시도 가능. concurrent trigger는 dirty marker로 큐잉되어 lock holder가 render 종료 후 dirty 확인 — single lost-update 없음.

테스트 추가: `trigger.test.js` 7번째 path — "concurrent triggers within 5s: first writes, second appends to dirty marker, lock holder processes dirty after render completes" (subprocess-based race simulation 또는 promise.all flush).

**F2 absorption — Task 5 (mask.js) raw-mode invariant 정정**

기존 Task 5는 "Preserve existing path-mask behavior — `maskSecrets` is purely additive. `model.masked` flag semantics unchanged (still true by default, `--raw` opt-in)" 이라 적었으나, F2가 정확히 지적: `derive/index.js`의 `opts.raw === true` branch가 *전체 mask를 skip* 하므로 `maskSecrets`도 skip되어 secret이 그대로 raw output에 노출됨. Task 5 본문 교체:

- `applyMaskToModel(model, opts)`를 **두 단계로 분리**:
  - `applyPathMask(model)` — 경로 정규화. `opts.raw === true` 일 때 skip.
  - `applySecretMask(model)` — `maskSecrets()` 호출. **opts.raw 무관, 항상 실행 (unconditional)**.
- `derive/index.js`의 raw branch는 다음과 같이 정정:
  ```js
  let m = buildModel(repoRoot);
  m = applySecretMask(m);              // 무조건 시크릿 마스킹 (raw에서도)
  if (!opts.raw) m = applyPathMask(m); // 경로 마스킹만 raw에서 bypass
  return m;
  ```
- `derive cli render --raw`는 secret-substituted model을 받으므로 `renderStatus`가 STATUS.md/status.html에 secret 노출 못 함. 단 `--raw` HTML 출력 상단의 red banner copy를 "⚠ raw mode (paths unmasked, secrets still redacted)"로 갱신하여 사용자가 raw의 정확한 scope를 인식하게 함.
- **새 테스트**: `mask-secrets.test.js` path h+i 추가:
  - h: `derive(repoRoot, {raw: true})` with synthetic envelope `next_action='sk-' + 'A'.repeat(25)` → 출력 model이 `[REDACTED:sk-key]` 포함 + `mask_hits[0].kind === 'sk-key'`.
  - i: `node derive/cli.js render --raw` against tmpdir fixture → output STATUS.md grep으로 raw sk-key 패턴이 *부재* (REDACTED 마커만 존재).

이 absorption은 plan body Out-of-scope 표에 "Secret masking is mandatory in all output paths including --raw" 를 invariant로 박는다.

**F3 absorption — Task 5 + Files-to-Change boundary 정정**

F3는 `derive/sources/envelopes.js`가 `next_action` + `findings[].text`를 projection 전에 drop함을 지적. plan body는 "No mutations to derive/sources/* (M1 surface frozen)" 라 적었지만 그 invariant 자체가 mask hit 검출을 불가능하게 함. **Boundary 정정**:

- M1 surface frozen invariant는 **field rename/remove에만 적용** — *new additive fields*는 허용 (M3 ship이 이미 read-only consumer로서 `_render_meta` 필드 추가 가정). 이를 plan body Patterns to Mirror 표 + No-mutations 블록에 명시.
- `derive/sources/envelopes.js`에 **새 필드** `masked_payload_signal: { mask_hit_count, mask_kinds: [string] }` 추가. 기존 `receipts_added` + `finding_count` 키는 그대로 immutable.
- envelope JSON read 시점에 raw `next_action`/`findings[].text` 문자열을 `maskSecrets()`로 스캔 → 매칭이 있으면 `masked_payload_signal` 생성. raw payload 문자열 자체는 model에 **저장 안 함** (privacy + memory 감축). hits 메타만 surface.
- `model.mask_hits`는 envelopes 스캐너가 만든 `masked_payload_signal` + receipt scanner가 만든 briefing_summary hits를 합쳐서 derive/index.js facade가 단일 배열로 surface.
- **새 테스트 — integration**: `derive/tests/envelopes-mask.test.js`. 실제 `.envelope.json` 파일을 tmpdir에 작성 (`next_action: 'sk-ABCDEFGHIJKLMNOPQRSTUVWX'` + `findings: [{ text: 'AKIA....' }]`) → `derive(tmpRoot)` 호출 → 출력 model의 `mask_hits`에 `sk-key` + `aws-key` 모두 포함 + `sources.envelopes.items[0].masked_payload_signal.mask_hit_count === 2`. synthetic `applyMaskToModel` fixture만으로는 real pipeline 검증 불가 — 이 통합 path로 보장.
- plan body "Files to Change" 표에서 `derive/sources/envelopes.js` 행을 UPDATE로 추가. 기존 "No mutations" 블록에서 같은 파일 제거.

**F4 absorption — Task 1 reclaim branch + Risks 표 갱신**

CLAUDE.md §3.6 host-aware tri-state policy 그대로 적용. Task 1 sub-step 2의 EEXIST orphan branch 본문 교체:

```
- lock 파일 read → { pid, host, mtime }
- same-host (host === os.hostname()):
  - PID alive (process.kill(pid, 0) 성공) → NEVER reclaim. return false + stderr SKIP render in-flight (alive holder).
  - PID dead (ESRCH) → loud stderr + unlink + retry 1회.
- cross-host (host !== os.hostname()):
  - mtime < 90s → return false + stderr SKIP render in-flight (cross-host).
  - mtime >= 90s → loud stderr + unlink + retry 1회.
```

또한 STATUS.md/status.html atomic write의 **fixed-name tmp** (`.tmp` suffix)는 split-brain 발생 시 two writers가 같은 tmp path를 clobber → corruption 위험. unique temp name으로 교체: `STATUS.md.<pid>-<random>.tmp` → `fs.renameSync` to final path. M3 `cmdRender`도 같은 패턴을 따르도록 향후 미세조정 후보(v1.3.x patch axis), M4는 자신의 write path만 정정.

Risks 표 갱신:
- "Lock starvation if a hung process holds .render.lock for >90s | Low | mtime-based reclaim ..." 행을 다음으로 교체:
  - "Lock split-brain on slow filesystem/AV/WSL clock skew | Medium | Host-aware tri-state reclaim per CLAUDE.md §3.6 — same-host live PID NEVER reclaim. Unique temp names (pid+random) for STATUS.md/status.html writes prevent two-writer clobber."

테스트 추가: `trigger.test.js` 8번째 path — "stale-mtime but live PID on same host → reclaim refused, return false"; 9번째 path — "stale-mtime + dead PID → reclaim succeeds + render proceeds".
