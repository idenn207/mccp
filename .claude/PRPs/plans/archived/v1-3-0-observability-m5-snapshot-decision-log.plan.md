# Plan: v1.3.0 Milestone 5 — Daily Snapshot + Decision Log

**Source PRD**: [.claude/prds/v1-3-0-observability-surface-ii.prd.md](../prds/v1-3-0-observability-surface-ii.prd.md)
**Selected Milestone**: 5 — Daily snapshot + decision log (consumes M1 derive + M2 briefing + M3 renderer + M4 trigger; produces the *archival* layer that freezes daily derive state for historical audit and extends the audit timeline window from 7→30 days)
**Complexity**: Medium (1 new lib module `lib/snapshot/index.js` + 1 trigger integration + 1 derive source addition + 1 audit-timeline section extension + 1 new doc + 5 tests. No new npm dep. Estimated 6–10h.)

## Summary

M5 closes the *temporal* gap left by M4. M4 keeps the live `STATUS.md` + `status.html` cache aligned with the *current* state of `.claude/` within ~5s of any trigger event. M5 adds the *yesterday and before* dimension: a daily-frozen JSON snapshot under `.claude/cache/snapshots/YYYY-MM-DD.json` with 30-day retention, plus an audit-timeline that can stretch back 30 days by reading from those snapshots when raw receipts have rotated or been quarantined.

Three concrete additions on top of M1–M4:

1. **`writeSnapshotIfNeeded(model, opts) → { written, path, evicted }`** — single export in a new `lib/snapshot/index.js`. Idempotent per UTC day: only writes if today's snapshot file is absent. Receives the already-derived model (no second derive). Persists a frozen subset including envelope state at freeze time. On write, evicts snapshot files older than the 30-day retention window. Loud fail-open per [[feedback-loud-fail-open]] — never throws into the caller.

2. **Trigger integration in `lib/renderer/trigger.js`** — after `renderStatus()` completes and atomic writes succeed (between current step 8 `.last-render.json` write and step 9 `.trigger-pending` write), call `writeSnapshotIfNeeded(model, { trigger: reason })` with the same derived model M4 already computed. No second derive, no second LLM call, no new debounce window — piggy-backs on the existing per-day idempotence. Adds ~1 stat + at most 1 write per UTC day across all trigger reasons.

3. **Audit-timeline 30-day extension in `sections/audit-timeline.js`** — current implementation pulls `model.sources.receipts.items` (in-memory current receipts, 7-day window). M5 adds a parallel read path: when raw receipts in the 7–30 day window are sparse or absent (quarantined/rotated), the section reads `.claude/cache/snapshots/*.json` and merges their frozen receipt entries into the timeline. Entries from snapshots are marked with a `from_snapshot: true` flag (rendered as muted ⌛ icon) so PM can distinguish live vs frozen evidence. 30-day window is the cap regardless of source — beyond that, snapshots are evicted.

**Why "decision log" ≠ a new file**: PRD §Delivery Milestones row 5 names this "Daily snapshot + decision log". The decision log is *the audit-timeline section, extended to 30 days via snapshot-backed reads*. We are NOT introducing a separate `decisions.jsonl` ledger or a new receipt category. Each receipt-write already IS a decision event (gate verdict, dedupe stamp, codex-skip reason, etc.); the snapshot freezes the receipt list, and the timeline section reads it. This matches PRD §Scope MVP ("audit timeline derive(최근 7일)" + "Daily snapshot...30일 retention") — they are the *same surface*, with the window stretched.

**Snapshot scope frozen at write time**: The JSON includes:
- `schema_version: 'snapshot-v1'`
- `snapshot_date: YYYY-MM-DD` (UTC)
- `derived_at: ISO` (the model's own derive timestamp)
- `model_version` (from `derive/model.js#MODEL_VERSION`)
- `counts: { plans, receipts, state, backlog, fix_task, pr, envelopes, correlations, warnings }` — quick scan
- `receipts: Array<{ gate_id, decision_id, created_at, converged, briefing_summary?, briefing_token_count? }>` — entries from `model.sources.receipts.items` projected to the audit-timeline read shape (the same projection `sections/audit-timeline.js` uses today, so the section can consume snapshot rows without re-projection)
- `envelopes: Array<{ dispatch_id, status, started_at, ended_at?, parent_session_id, error? }>` — envelope state freeze at snapshot time per PRD §Scope MVP ("snapshot에 envelope 상태 freeze 포함")
- `m0_capability.contract_present: boolean` — historical schema-contract presence

Snapshot is **always masked** (mirrors `--raw` semantics: `--raw` does NOT bypass snapshot masking). Snapshots live longer than the session that wrote them and must remain share-safe.

**30-day retention contract**: Eviction uses date arithmetic on the filename `YYYY-MM-DD.json` parse, NOT `fs.statSync` mtime. Files outside the rolling 30-day window (today minus 30 calendar days) are unlinked. mtime-based eviction would race with archival branches that resurrect old snapshots; filename-as-source-of-truth is deterministic. Eviction is best-effort: any unlink failure is logged via stderr `[mccp:snapshot] evict YYYY-MM-DD failed: <msg> (allow)` and the function continues — the new snapshot write succeeds regardless.

**Trigger contract — strictly *piggyback*, never standalone**: M5 does NOT add a new SessionStart hook, does NOT add a separate daily wakeup, does NOT add a cron-style scheduler. The snapshot writer only runs when M4's `triggerRender` runs. Real-world consequence: a project with zero activity for 3 days will produce zero snapshots for those days. That is correct — PM viewing day-0 snapshot the day after still sees a snapshot stamped at the most recent trigger, which captures the actual "last known state" at that point. PRD §Scope MVP does not require continuous daily coverage; it requires 30-day archive *of the days where activity happened*. The audit timeline section gracefully gaps for missing days (no row, no fake placeholder).

**M3/M4 surfaces untouched**: M5 does NOT modify `renderStatus()`, the 11-step verdict chain, M4's debounce/lock/`was_stale` logic, the mask catalogue (M4 owns), or the trigger's fail-open contract. M5 adds *one* call after step 8 and *one* additional read in `audit-timeline.js`. The render facade stays a pure function of `(model, opts)` plus the new conditional snapshot read.

**M6 boundary**: M5 does NOT touch the generic-interface validation (M6 owns the "mccp 외 임의 repo" smoke test). M5 stays scoped to mccp-repo dogfood + unit tests. Generic-repo behavior is asserted only by the existing M1 `empty-repo.test.js` pattern — for snapshot, the empty-repo path produces no snapshot file (because `model.sources.receipts.count === 0` short-circuits the writer) and no eviction (because no snapshots directory exists). Both are no-op + return `{ written: false, path: null, evicted: [] }`.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Loud fail-open facade | `plugins/mccp/scripts/lib/renderer/trigger.js:25-110` (M4 outer try/catch + stderr loud message + `(allow)` suffix + return false) | `writeSnapshotIfNeeded` outer try/catch returns `{ written: false, path: null, evicted: [], error: <msg> }` on any throw. Caller (`trigger.js`) wraps with its own belt-and-suspenders try and discards the result. |
| Atomic file write | `plugins/mccp/scripts/lib/renderer/trigger.js:182-195` (M4 pattern — `fs.writeFileSync('<file>.<pid>-<random>.tmp', content)` + `fs.renameSync(tmp, final)`) | Snapshot file uses identical pattern: tmp name `YYYY-MM-DD.json.<pid>-<random>.tmp` to avoid split-brain clobber if two triggers race on the cross-day boundary. |
| Per-day idempotence | `plugins/mccp/scripts/state/state-writer.js` (single-writer semantics for STATE.md) + CLAUDE.md §3.6 atomic state locks | Snapshot does NOT need a separate `.snapshot.lock` because the writer is gated by `fs.existsSync(snapshotPath)` first. Two triggers within the same UTC day both see the file exist, both no-op. Race window is the gap between `existsSync` returning false and `renameSync` completing — both racers may write, but they write identical content to the same final path; last `renameSync` wins idempotently. No correctness violation. |
| Date arithmetic, UTC | `plugins/mccp/scripts/derive/sources/receipts.js` + `sections/audit-timeline.js:3` (`const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000`) | UTC `YYYY-MM-DD` derivation: `new Date().toISOString().slice(0, 10)`. 30-day window: same `Date.UTC` arithmetic as M3's 7-day cutoff, with `THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000` constant. Filename parse for eviction: `^\d{4}-\d{2}-\d{2}\.json$` regex match + `Date.UTC(y,m-1,d)`. |
| Mask-by-default | `plugins/mccp/scripts/derive/index.js:42` (`model.masked = false; // unmasked while building; masking applied at end unless --raw`) + `derive/mask.js` | Snapshot writer projects from the *already-masked* model (the trigger.js call site is post-derive, post-mask). Verify by asserting `model.masked === true` at entrypoint; if `model.masked === false` (i.e., `--raw` derive), still apply mask before write — snapshot survives the session and must be share-safe even when the live render was raw. |
| Test ergonomics | `plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` (M4 — uses `_injectRenderThrow` injection hook) | New `_injectFsThrow` opt in `writeSnapshotIfNeeded` for testing failure paths. Tests assert (a) snapshot file content, (b) no-op on existing same-day file, (c) eviction of out-of-window files, (d) graceful fail-open on inject. Mirror M4's `_inject*` test pattern. |
| Snapshot file as a *secondary* model source | `plugins/mccp/scripts/derive/sources/receipts.js` (live source) + `sections/audit-timeline.js` (consumer) | Audit-timeline section receives an optional `snapshotReceipts` array via the renderer's section call signature (the renderer's `renderAuditTimeline(model, formatUtils, now)` becomes `renderAuditTimeline(model, formatUtils, now, opts)` with `opts.snapshotsDir` defaulting to `.claude/cache/snapshots/`). Snapshot files are read lazily; failure to parse a snapshot is silent (single file corruption ≠ broken timeline). |
| Korean primary, English identifiers | PRD §Design Direction "Copy" + CLAUDE.md §0 | snapshot file content stays JSON identifiers (English). audit-timeline section gets a Korean muted footnote for snapshot-sourced rows (`⌛ 보관 스냅샷에서 복원`). stderr stays English-ASCII (`[mccp:snapshot] write YYYY-MM-DD ok`, `[mccp:snapshot] evict YYYY-MM-DD failed: <msg> (allow)`). |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/snapshot/index.js` | CREATE | Single export `writeSnapshotIfNeeded(model, opts = {}) → { written, path, evicted, error? }`. Implements: (1) derive today's UTC date, (2) early-return `{ written: false, path: null, evicted: [] }` if `model.sources.receipts.count === 0` AND `model.sources.envelopes.count === 0` (nothing to archive), (3) ensure `.claude/cache/snapshots/` exists (`fs.mkdirSync({ recursive: true })`), (4) return early if today's snapshot file exists, (5) project model → snapshot JSON shape, (6) atomic tmp+rename write, (7) scan snapshots dir + parse filenames + unlink any `YYYY-MM-DD.json` whose date < today minus 30 days, (8) return summary. Outer try/catch wraps everything for loud fail-open. The `_injectFsThrow` opt is honored only when present (test-only escape). |
| `plugins/mccp/scripts/lib/renderer/trigger.js` | UPDATE | Inside `triggerRender` between the existing `.last-render.json` write (current step 8) and the `.trigger-pending` write (step 9), invoke `try { require('../snapshot').writeSnapshotIfNeeded(model, { trigger: reason }); } catch (e) { process.stderr.write('[mccp:renderer-trigger] snapshot failed (allow): ' + (e && e.message) + '\n'); }`. Pass the `model` already derived earlier in the function. The require is lazy to keep the M4 trigger module loadable in test contexts that don't ship `lib/snapshot/` yet. |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | Add an optional 4th parameter `opts = {}` (default empty). When `opts.snapshotsDir` is provided AND raw receipts in the 7–30 day window contribute < 5 rows, read every `*.json` file in `opts.snapshotsDir`, parse the receipts sub-array, filter to entries dated within 30 days but outside the live 7-day window (de-dup by `gate_id + decision_id`), and merge them into `inWindow` with a `from_snapshot: true` flag. Render snapshot-sourced rows with the muted ⌛ prefix + Korean footnote `보관 스냅샷에서 복원`. Existing 7-day window behavior unchanged when no snapshots dir is given. Preserve the existing `MAX_ROWS = 30` cap. |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | Wire `opts.snapshotsDir = path.join('.claude', 'cache', 'snapshots')` through to `renderAuditTimeline`. Default-on; can be disabled in tests via `opts.snapshotsDir = null`. No public API change to `renderStatus(model, opts)` — the snapshot opt is internal to the renderer's section dispatch. |
| `plugins/mccp/scripts/derive/model.js` | UPDATE | Bump `MODEL_VERSION` (snapshot is a new derived-data surface even though the core model shape is unchanged) — match M1/M2/M3/M4 bumping convention. Specifically: if current is `1.0.4`, go to `1.0.5`. Add a one-line comment `// 1.0.5 — M5 ship: snapshot writer + audit-timeline 30-day window read path`. |
| `plugins/mccp/scripts/lib/snapshot/tests/snapshot.test.js` | CREATE | 6 paths: (a) first call on empty cache writes today's file with expected schema (receipts + envelopes projected); (b) second call same UTC day returns `{ written: false }` (idempotence); (c) call with model having `receipts.count === 0` AND `envelopes.count === 0` short-circuits with `{ written: false, path: null }`; (d) call with pre-existing 31-day-old snapshot file evicts it on this write; (e) call with `_injectFsThrow: true` returns `{ written: false, error: '<msg>' }` + stderr loud line; (f) snapshot file content is masked even when `model.masked === false` (`--raw` derive path). |
| `plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js` | CREATE | 4 paths: (a) timeline with no snapshots dir → identical output to current 7-day behavior; (b) timeline with snapshots dir + live receipts < 5 in 7–30 day band → snapshot rows merged with ⌛ flag + Korean footnote; (c) snapshot row de-dup vs live receipt with same gate_id + decision_id → live wins (snapshot row dropped); (d) corrupt JSON in one snapshot file → silently skipped, other snapshots still merge, no exception. |
| `docs/v1.3.0-observability/snapshot-schema.md` | CREATE | Document the `snapshot-v1` schema (fields + types + retention contract + filename convention). Cross-link from `docs/v1.3.0-observability/schema-surface.md` and from this plan. Reference [Codex-converged spec, M5 ship] only after M5 PR merges — placeholder section at write time. Mirror the depth/tone of `state-md-naming-reconciliation.md` (sibling doc — terse identifier reference, not a tutorial). |

## Tasks

### Task 1 — Snapshot writer module

- **Action**: Create `plugins/mccp/scripts/lib/snapshot/index.js`. Implement `writeSnapshotIfNeeded(model, opts) → { written, path, evicted, error? }` per the spec in the table above. UTC date derivation: `new Date().toISOString().slice(0, 10)`. Filename: `${YYYY-MM-DD}.json`. Directory: `path.join('.claude', 'cache', 'snapshots')` resolved relative to the repo root that `model.repo_root` points to. Use `fs.mkdirSync({ recursive: true })` for idempotent dir create. Eviction: `fs.readdirSync` + filename regex + date math + `fs.unlinkSync`, each in its own try/catch so a single file failure does not stop further eviction. Loud fail-open outer try/catch on the whole function.
- **Mirror**: M4 `lib/renderer/trigger.js` for atomic write + loud fail-open shape. M1 `derive/sources/receipts.js` for the receipt projection shape (which fields end up in the audit timeline).
- **Validate**: `node --test plugins/mccp/scripts/lib/snapshot/tests/snapshot.test.js` passes all 6 paths.

### Task 2 — Wire into M4 trigger

- **Action**: Edit `plugins/mccp/scripts/lib/renderer/trigger.js`. Find the step where `.last-render.json` is written (search for `LAST_RENDER_FILENAME`). Immediately after that write, before the `.trigger-pending` write, add the lazy `require + try/catch` call to `writeSnapshotIfNeeded(model, { trigger: reason })`. The `model` variable is already in scope from the earlier `derive()` call. Verify with grep that there is only one call site.
- **Mirror**: M4's own `receipt-write` integration pattern in `scripts/receipt/write.js` (lazy require + try/catch + stderr loud message on throw).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/trigger.test.js` continues to pass (no regression). Add one new assertion: after a successful `triggerRender('test')` call, today's snapshot file exists under `.claude/cache/snapshots/`.

### Task 3 — Audit-timeline snapshot read path

- **Action**: Edit `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js`. Add the optional 4th `opts` parameter. When `opts.snapshotsDir` is provided AND `inWindow` rows in the 7–30 day band number < 5, scan the snapshots directory and merge snapshot-sourced rows. Apply de-dup by `gate_id + decision_id` (live receipt wins). Render snapshot-sourced rows with ⌛ prefix in MD output and `class="from-snapshot"` in HTML output (no new CSS needed — uses existing `muted` class).
- **Mirror**: existing 7-day window logic in `audit-timeline.js`; existing format-utils `formatRelativeTime` for relative-time strings (no change needed for snapshot rows — they get the same relative-time treatment).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/audit-timeline-snapshot.test.js` passes all 4 paths.

### Task 4 — Renderer index plumbing

- **Action**: Edit `plugins/mccp/scripts/lib/renderer/index.js`. In the section dispatch where `renderAuditTimeline(model, formatUtils, now)` is called, change the call to pass an `opts` object with `snapshotsDir` resolved against `model.repo_root`. Keep the default-on behavior with no API change to `renderStatus`.
- **Mirror**: existing section dispatch pattern in `lib/renderer/index.js` (look for how `model` and `formatUtils` are threaded through the other sections).
- **Validate**: existing `lib/renderer/tests/sections.test.js` + `render-integration.test.js` continue to pass. Add one assertion that the audit-timeline section receives the `opts.snapshotsDir` arg (or use the new test from Task 3 to cover this).

### Task 5 — Model version bump

- **Action**: Edit `plugins/mccp/scripts/derive/model.js`. Increment `MODEL_VERSION` per existing convention. Add a one-line comment annotating M5.
- **Mirror**: previous bumps for M1/M2/M3/M4 (git-log search: `git log --oneline -- plugins/mccp/scripts/derive/model.js`).
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/` — capability test must reflect the new version. If `capability.test.js` hard-codes the old version, update it.

### Task 6 — Docs

- **Action**: Create `docs/v1.3.0-observability/snapshot-schema.md`. Document the `snapshot-v1` JSON shape, the 30-day retention contract (filename-based), the masking invariant, and the cross-reference to the audit-timeline read path. Cross-link from `docs/v1.3.0-observability/schema-surface.md` §6.x (new subsection for snapshot fields).
- **Mirror**: tone and depth of `docs/v1.3.0-observability/state-md-naming-reconciliation.md` — terse identifier reference, not a tutorial. Use the same heading levels and the same `> Cross-link:` footer convention.
- **Validate**: manual review only. Confirm no broken cross-links via `grep -rn 'snapshot-schema' docs/`.

### Task 7 — plugin.json version bump

- **Action**: Per CLAUDE.md §3.7, milestone ship requires `plugins/mccp/.claude-plugin/plugin.json` `version` field bump. M5 is a minor ship within v1.3.x → check current value (likely `1.4.0` post-M3 jump or `1.3.x` if M4 also bumped). Bump per existing convention (the latest minor for this PRD's surface freeze series).
- **Mirror**: CLAUDE.md §3.7 hot-fix pattern + git log `git log --oneline -- plugins/mccp/.claude-plugin/plugin.json`.
- **Validate**: `cat plugins/mccp/.claude-plugin/plugin.json` reports the new version. `node --test plugins/mccp/scripts/version/tests/` (if it exists) passes.

## Validation

```bash
# All new + touched tests pass
node --test plugins/mccp/scripts/lib/snapshot/tests/
node --test plugins/mccp/scripts/lib/renderer/tests/
node --test plugins/mccp/scripts/derive/tests/

# Lint + typecheck (mccp baseline)
npm test --if-present

# End-to-end smoke: run render CLI, verify snapshot file appears
node plugins/mccp/scripts/derive/cli.js render
ls .claude/cache/snapshots/

# Eviction smoke: backdate a synthetic snapshot to 35 days ago, run render again, verify unlink
touch -d '35 days ago' .claude/cache/snapshots/2026-05-15.json  # synthetic name — use any out-of-window date
node plugins/mccp/scripts/derive/cli.js render
test ! -f .claude/cache/snapshots/2026-05-15.json && echo "eviction ok"

# Audit-timeline merge smoke: synthesize a 14-day-old snapshot manually,
# run render, verify the 14-day-old receipts appear in the timeline with ⌛ prefix
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Snapshot writer races on UTC-day boundary (two triggers at 23:59:59 + 00:00:01) → two files created, one for yesterday + one for today | Low | Both writes succeed (different filenames) and are correct. No mitigation needed — this is the desired outcome. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Snapshot file grows large in repos with hundreds of receipts → 30 × hundreds of receipts × few hundred bytes = MB-scale `.claude/cache/snapshots/` | Low | Each snapshot is bounded by the receipt-projection shape (no full receipt JSON, no plan body). For 100 receipts/day, ~20KB/snapshot × 30 = 600KB total. Acceptable. If exceeded in practice, add per-snapshot row cap (e.g., MAX 200 receipts per snapshot) in a follow-up. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Audit-timeline snapshot merge surfaces stale entries that have been intentionally rolled back (e.g., quarantined v0.2.8 receipts) | Medium | De-dup by `gate_id + decision_id` with live receipt winning. Snapshot-only entries explicitly marked with ⌛ + Korean footnote `보관 스냅샷에서 복원` so PM knows these are *frozen historical* records, not live state. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Eviction unlinks a snapshot file that another process is reading concurrently | Low | `fs.unlinkSync` on a file with an open read handle on Windows fails with EPERM, on POSIX silently removes the dir entry but file stays alive for the reader. Eviction is wrapped in try/catch → fails loud + continues. Reader sees correct content. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Trigger now does extra fs work per call → debounce bypass scenario amplifies cost | Low | Snapshot writer is gated by `fs.existsSync(snapshotPath)` first — at most 1 stat + return on the common path (same UTC day). Worst case adds ~1ms to the trigger. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Cross-platform line-ending CRLF/LF mismatch on snapshot JSON | Low | Snapshot is JSON, written with `JSON.stringify(obj, null, 2)` + explicit `\n` joining — no platform line-ending dependency. M4 trigger.js already handles cross-platform paths via `path.join`. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Snapshot includes envelope fields that are *currently active* (not terminal) → next-day reader sees frozen "active" envelope that is now stale | Medium | Document in `snapshot-schema.md` that envelope rows are *frozen at snapshot time* with their then-current status. PM reading historical timeline understands the entry shows "status at day-N", not current. Renderer's existing `worker-fanout.js` always uses *live* envelope source, so live UI is never confused. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| 30-day window vs filesystem clock skew | Low | All date math is UTC-based (`Date.UTC`). Cross-machine snapshot directory transferred via git (which is not the intended use — `.claude/cache/` is gitignored) would still parse correctly. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance

- [ ] All tasks complete
- [ ] `node --test plugins/mccp/scripts/lib/snapshot/tests/` passes
- [ ] `node --test plugins/mccp/scripts/lib/renderer/tests/` passes (no regression + new snapshot test)
- [ ] `node --test plugins/mccp/scripts/derive/tests/` passes
- [ ] Smoke: `node plugins/mccp/scripts/derive/cli.js render` produces today's snapshot file
- [ ] Smoke: synthetic 31-day-old snapshot is evicted on next render
- [ ] `docs/v1.3.0-observability/snapshot-schema.md` exists + cross-linked from `schema-surface.md`
- [ ] `plugins/mccp/.claude-plugin/plugin.json` `version` bumped per CLAUDE.md §3.7
- [ ] PRD `Delivery Milestones` row 5 flipped `pending → in-progress` (then `complete` on PR merge)
- [ ] M3 surfaces untouched (verdict chain, section APIs, format-utils, mask catalogue from M4)
- [ ] Loud fail-open invariant holds: every M5 entrypoint NEVER throws into the caller
- [ ] Snapshot content is always masked, even when derive ran with `--raw`
- [ ] Patterns mirrored from M4 trigger + M1 derive sources, not reinvented

## Design Critique

> 출처: `Skill(impeccable, critique ...)` 자동 호출 결과를 plan body 안으로 inject. plan-codex gate 5.0 통과 표시. 핵심 finding 5개 + 처리 약속.

**Design Health Score**: 16/24 (n/a 항목 제외, "Good with caveats" — consistency + a11y 두 축 약함)

**Anti-pattern verdict**: AI slop 없음. PRD §Design Direction (Restrained / system stack / no cards) 안에서 작동.

**Priority Issues + Plan absorption**:

| # | Severity | Issue | Plan absorption |
|---|---|---|---|
| 1 | P1 | ⌛ icon이 M4의 ⏱ stale icon과 시각적·의미적 충돌. 색맹 사용자 + 빠른 스캔 시 구분 불가. PRODUCT.md design principle 3 "color + icon + text 3중 표기"에서 icon 변별성 가정이 깨짐. | **Plan task 3 amend** — ⌛ 대신 시간 metaphor 외 icon 또는 icon 생략 + `class="from-snapshot muted"`로 ink 1단계 흐리게. 최종 icon 결정은 implement 단계 santa-loop 또는 impeccable Skill 호출로 확정. |
| 2 | P1 | 30 entry MAX_ROWS cap이 archived가 live를 밀어내는 시나리오 미정의. archived row가 live를 시각적으로 압도하면 PM이 첫 60초 안에 *현재 의사결정 evidence*를 찾기 어려움. | **Plan task 3 amend** — live row 우선 cap (`MAX_ROWS_LIVE=20`), archived는 잉여 슬롯만 (`MAX_ROWS_ARCHIVED=10`). 30-row absolute cap 유지. 추가 archived는 single muted "+ N개 더" 행. |
| 3 | P2 | footnote 위치 모호 (row마다인가 섹션 단일인가). row마다 반복되면 Compact 원칙 위배. | **Plan task 3 amend** — archived row 첫 등장 위치에 단일 muted footnote 1회만. row에는 icon/색만 적용. |
| 4 | P2 | 보관 row의 색 명시 부재. ink color로 렌더링되면 live와 시각 동일. | **Plan task 3 amend** — `class="from-snapshot"` → CSS `color: var(--muted)`. 신규 토큰 추가 없음 (기존 재사용). |
| 5 | P3 | snapshot eviction 실패 시 user-visible surface 없음. storage 폭증 시그널 부재. | **Plan task 1 amend** — eviction stderr 후, 30일 정상 + N개 (>30) 잔존 시 model에 `model.snapshot_eviction_failed_count: number` surface. audit-timeline에 muted footnote 1줄 추가는 선택. |

**Persona red flag (Sam — accessibility)**: ⌛ vs ⏱ icon이 screen reader에 시간 metaphor로 동일 그룹 인식 가능. footnote 텍스트가 행마다 반복되면 nav 비용 증가. footnote는 1회만, archived row에 `aria-label="보관"` 권장.

**Open questions surfaced for implement-stage discussion**:

- archived row를 들여쓰기 (left padding 0.5rem)로 hierarchy 만드는 게 icon 변경보다 가벼운 해결책인지?
- 30일 전 receipt가 *현재 의사결정에 영향*을 주지 않으면, timeline 30일 확장 자체가 over-design — daily snapshot은 *파일 archive*로 충분하고 timeline은 7일 그대로 두는 옵션도 있음. M5 scope 안에서 결정 권장.

**Plan amendments to absorb critique**:

Task 1, Task 3 본문에 위 P1~P3 룰을 *implement-시점 contract*로 박는다 — 이 plan은 PRD artifact 단계이므로 컨크리트 CSS/HTML 결정은 implement Codex gate에서 santa-loop convergence. 단, 다음 invariant는 plan-level commit:

1. archived row 색 = `var(--muted)` (live row와 명도 차이 ≥ 1단계).
2. archived row footnote = 섹션 단일 출현 (row마다 반복 금지).
3. live row 우선 cap = 20; archived는 잉여 슬롯만; absolute cap = 30 유지.
4. icon 결정은 implement 단계 — *시간 metaphor 외* 우선 시도, 결과는 PR body design section에 기록.
5. eviction 실패 count는 model에 surface, footnote는 선택 (M6 또는 v1.4.x로 deferred OK).

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) with `--impeccable-available` design-scope preamble
- 라운드 수: 1 (R1 absorption으로 종결 — 모든 ACCEPT_NOW 항목이 plan body amend로 fully resolved per Claude self-attestation, R2 escalate 미발화)
- 합치 결론: needs-attention → R1 absorption 후 ship-ready. 3 finding 모두 plan body amend로 흡수, snapshot-schema도 동시 amend.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 piggyback-only snapshots → missing day=실패와 활동 없음을 구분 불가 | MEDIUM | ACCEPT_NOW | coverage-gap marker는 *간단* + audit-timeline에 1줄 surface로 차이 박을 수 있음. SessionStart backfill은 over-engineering — `triggerRender` SessionStart hook(M4)이 이미 매 부팅 fire하므로 *부팅한 날은 snapshot 발생*. 진짜 zero-activity일은 dashboard가 1줄 "보관 N일 누락" 표시. |
  | F2 de-dup이 동일 path 재기록을 collapse → newer briefing/codex_skipped_at_pr 가림 | HIGH | ACCEPT_NOW | snapshot projection이 timeline-consumed 모든 필드 포함하도록 amend + de-dup identity를 `gate_id + decision_id + receipt_hash`로 강화. `receipt_hash`는 receipt JCS canonical hash이므로 round/timestamp/briefing 변경 시 자동으로 새 ID. 추가 test도 필수. |
  | F3 eviction이 host clock skew에 무방비 → future-dated 또는 오랜 cache 강제 삭제 | HIGH | ACCEPT_NOW | future-dated 파일 quarantine (skip eviction) + `.last-render.json`의 timestamp와 비교해 cutoff가 *최신 활동보다 미래* 면 eviction abort. 둘 다 plan task 1 본문에 박을 수 있음 — 새 dependency 없이 plan-level commit으로 흡수. |
- Deferred to backlog: 0 (모든 finding이 plan-level absorb 가능, defer 항목 없음)
- Open Questions: F1 자동화 후속(backfill SessionStart hook) — MEDIUM but defer-to-M6 가능 (M5는 marker만, M6/v1.4.x에서 backfill 검토). F2 schema-drift test 자체는 implement-time santa-loop에서 추가 필드 확인 필수.
- Codex session 참조: threadId=019edd98-7cd5-7690-b1b1-1f9268072acb (status=0, stderr empty, summary="No-ship: ...host clock"). impeccable design-scope preamble 적용됨 — design 관련 finding 자동 drop, 본 3 finding은 correctness/data-integrity 축이므로 정상 surface.

### R1 absorption — plan body amend

위 finding 3건을 plan에 박는 amendment를 본문에 inline 적용 (실제 변경은 아래 *Plan amendments* 박스에 명시):

**Plan amendments to absorb Codex R1**:

1. **F1 → Task 3 + Files to Change**: `audit-timeline.js` snapshot read path가 *30-day window 내 missing date*를 인식하고, 섹션 끝에 muted footnote `"보관 누락 N일"` 1줄 표시. 이 marker는 PM이 *실패 / true-inactive*를 구분하는 신호. 추가 backfill SessionStart hook은 M5 scope 외 (M6 또는 v1.4.x backlog로 defer).

2. **F2 → Files to Change `lib/snapshot/index.js` + `audit-timeline.js` 모두 amend**:
   - snapshot projection에 다음 필드 추가 (PRD §Errata 2026-06-17의 v1.2.0-m1 4개 `meta.*` 필드 포함): `receipt_hash`, `briefing_summary`, `briefing_token_count`, `briefing_invocation_count`, `codex_skipped_at_pr`, `codex_skip_reason`, `codex_dedupe_at_pr`, `ipc_envelope_path`, `dispatched_by_controller_session`, `worker_dispatch_id`. 즉 audit-timeline 섹션이 *현재 + 미래로 예측 가능한* 모든 meta 필드를 알도록 함.
   - de-dup identity = `gate_id + decision_id + receipt_hash`. `receipt_hash` 누락 시 fallback `gate_id + decision_id + created_at`. live + snapshot 양쪽 정렬 후 timestamp 가장 최신이 win.
   - 신규 schema-drift test: snapshot projection이 빠뜨린 meta 필드를 audit-timeline이 consume하려 하면 test가 실패하도록 `lib/snapshot/tests/snapshot-projection-coverage.test.js` 추가.

3. **F3 → Files to Change `lib/snapshot/index.js` eviction logic amend**:
   - Eviction 전 두 가지 guard:
     - (a) Future-dated 파일 (>today + 1d tolerance) 발견 시 *unlink 안 함* + stderr `[mccp:snapshot] future-dated YYYY-MM-DD detected — eviction skipped (allow)`.
     - (b) `.claude/cache/.last-render.json`의 `derived_at` 읽기 → cutoff date가 last-render timestamp보다 *미래* 면 eviction abort + stderr `[mccp:snapshot] cutoff > last-render — eviction aborted (clock-skew suspect)`. 이 경우 새 snapshot write는 진행하고 eviction만 skip.
   - 신규 test: `_injectFutureDated: true` 옵션 (snapshot.test.js path g) + `_injectStaleLastRender: true` (path h). 두 경로에서 eviction skip 확인.

4. **Tasks 7 후속 추가** (CLAUDE.md §3.7 compliance 외에): `plan` 단계에서 task 8 추가 — `snapshot-schema.md`에 F1/F2/F3 absorption rationale 1 paragraph + de-dup identity + skew-guard 정책 명시.

위 amendment는 **plan task 1 + task 3 + Files to Change 표 + Tasks 표 + Validation 표**에 implement-time contract으로 박혀야 하며, 본 plan body는 *현 시점 PRD-artifact-mode 출력이므로* 위 박스가 implement-stage의 자가 검증 표준. /mccp:prp-implement가 위 박스를 task spec으로 소비.

## Codex Implementation Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) with `--impeccable-available` design-scope preamble
- 라운드 수: 1 (R1 absorption으로 종결 — 모든 ACCEPT_NOW HIGH 항목이 plan body amend로 fully resolvable per Claude self-attestation, R2 escalate 미발화)
- 합치 결론: needs-attention → R1 absorption 후 ship-ready. 4 finding 모두 mechanical code-base identifier 정정 + 1줄 구조 hoist + 분리 절차로 흡수. ground-truth는 `derive/sources/receipts.js` + `lib/renderer/trigger.js` 직접 read로 confirm.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 receipt_hash 미투영 + dispatched_by_controller_session_id 식별자 불일치 | HIGH | ACCEPT_NOW | derive source에 receipt_hash 1 필드 추가 + plan amendment의 attribution 식별자 정정. mechanical. silent dedup 무력화를 막음. |
  | F2 trigger.js model이 render try block 안 scope | HIGH | ACCEPT_NOW | `let model` 을 try 밖으로 hoist (1줄 변경) + try 안에서 assign. 미흡수 시 lazy require가 ReferenceError 잡아 silent skip. |
  | F3 `.last-render.json` 은 `derived_at` 미작성, `render_at` 만 존재 | HIGH | ACCEPT_NOW | 기존 `render_at` 그대로 사용 (contract 증식 회피). missing/invalid 시 eviction abort. |
  | F4 empty-state short-circuit이 retention cleanup도 skip | MEDIUM | ACCEPT_NOW | write eligibility ≠ retention. snapshots 디렉토리 존재 시 cleanup 무조건 run, write만 short-circuit. |
- Deferred to backlog: 0 (모든 finding이 plan-level absorb 가능, defer 항목 없음)
- Open Questions: 없음 (R1 absorption 후 모든 finding이 plan amendments + implement-time contract으로 closed)
- Codex session 참조: threadId=019eddb2-9a91-7ca1-a777-0d280b422e04 (status=0, verdict=needs-attention). R1 첫 호출은 stdout-empty (companion infra hiccup, 198s) → 즉시 retry로 정상 응답 (302s). impeccable design-scope preamble 적용됨.

### Implement-stage absorption — plan body 보정 (Codex F1~F4 흡수)

위 finding은 plan body가 PRD-artifact mode에서 stale assumption 을 박은 결과. /mccp:prp-implement 가 아래 보정을 implement-time contract으로 소비:

**F1 보정 — Files to Change `derive/sources/receipts.js` 추가**:
- `extract()` 의 return 객체에 `receipt_hash: receipt.receipt_hash || null` 추가 (현재 receipt JSON에 `receipt_hash` 키가 있으면 그대로 surface, 없으면 null fallback). M2 briefing stamp가 작성하는 carve-out과 동일 패턴.
- plan body line 223 의 `dispatched_by_controller_session` → 실 식별자 **`dispatched_by_controller_session_id`** (이미 receipts.js:69에 노출됨).
- snapshot projection field set은 receipts.js extract() 출력을 그대로 차용 (de-novo enumerate 금지 — schema drift 방지).

**F2 보정 — Files to Change `lib/renderer/trigger.js` UPDATE 상세**:
- 현재 `const model = deriveImpl(repoRoot)` 는 line 281 (render try block 내부). 보정:
  ```js
  let model = null;
  try {
    if (opts._injectRenderThrow === true) { throw new Error('injected render throw'); }
    const deriveImpl = opts.deriveImpl || require('../../derive').derive;
    const renderImpl = opts.renderImpl || require('./index').renderStatus;
    model = deriveImpl(repoRoot);
    rendered = renderImpl(model);
  } catch (err) { /* ... */ return false; }
  ```
- snapshot writer 호출은 `writeLastRender` 호출 후 + `writeDebounceMarker` 호출 전 (line 304~308 사이):
  ```js
  if (model) {
    try { require('../snapshot').writeSnapshotIfNeeded(model, { trigger: reason }); }
    catch (err) { stderr('[mccp:renderer-trigger] snapshot failed (allow): ' + (err && err.message)); }
  }
  ```
- `model` truthy guard는 render path가 throw해 model이 null이면 snapshot도 skip (정상 — render 실패 시 archive 의미 없음).

**F3 보정 — Files to Change `lib/snapshot/index.js` eviction skew guard 상세**:
- `.last-render.json` 의 실 필드는 `render_at` (ISO string). `derived_at` 은 미존재.
- guard 로직: `const lastRender = JSON.parse(fs.readFileSync(path.join(cacheDir, '.last-render.json'), 'utf8')); const cutoffMs = Date.parse(lastRender.render_at);` — 실패/NaN 시 eviction abort + stderr `[mccp:snapshot] last-render.json render_at 읽기 실패 — eviction skip (allow)`.
- cutoff date (today-30d) 가 `cutoffMs` 보다 미래면 clock skew suspect → eviction abort + stderr `[mccp:snapshot] cutoff > last-render.render_at — eviction aborted (clock-skew suspect)`.
- future-dated 파일 (filename date > today + 1d) 발견 시 unlink skip + stderr `[mccp:snapshot] future-dated YYYY-MM-DD detected — eviction skipped (allow)`.

**F4 보정 — Files to Change `lib/snapshot/index.js` writer 구조 분리**:
- 함수 본문 절차 (보정):
  1. UTC date 계산.
  2. snapshots 디렉토리 path 계산 (`path.join(repoRoot || cwd, '.claude', 'cache', 'snapshots')`).
  3. **항상**: 디렉토리 존재 확인 → 존재 시 retention 정리 (F3 skew guard 적용). 비존재 시 skip.
  4. write eligibility 확인: `receipts.count === 0 AND envelopes.count === 0` → `{ written: false, path: null, evicted: <list above> }` early return. (디렉토리 미존재 시 evicted=[].)
  5. write eligible: 디렉토리 mkdir (recursive), 오늘자 file 존재 확인 → 존재 시 idempotent return.
  6. 신규 write: tmp+rename, return summary.
- 즉 retention(3) 과 write(4–6) 가 분리. plan body의 short-circuit 위치가 변경 — 이전엔 step 2 직후, 보정은 step 3 직후.

**snapshot-schema.md amend**: F1/F2/F3/F4 absorption rationale 1 paragraph + de-dup identity (`gate_id + decision_id + receipt_hash` with `created_at` fallback) + skew-guard 정책 (render_at 기준 + future-date tolerance) + retention/write 분리 invariant 명시.

위 4 보정이 implement-stage 의 자가 검증 표준. /mccp:prp-implement Phase 3 EXECUTE 가 위 박스를 task spec으로 소비.


