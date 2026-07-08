# Plan: v1.3.0 Milestone 1 — Derive Engine

**Source PRD**: [.claude/prds/v1-3-0-observability-surface-ii.prd.md](../prds/v1-3-0-observability-surface-ii.prd.md)
**Selected Milestone**: 1 — Derive engine (input for M2 briefing stamp + M3 renderer)
**Complexity**: Medium-Large (7 source readers + correlation + graceful-fallback fixtures, but each source is < 80 LOC and no new deps)

## Summary

Build a read-only, in-memory derive engine that scans `.claude/` (plans, receipts, STATE.md, codex-findings-backlog, fix-task, PR/git refs, dispatch envelopes) and emits a single normalized model with cross-state correlations. Live in new `plugins/mccp/scripts/derive/` namespace mirroring the receipt/state/quality sibling layout. Strict invariants: zero writes, zero LLM calls, zero new npm deps, graceful fallback for non-mccp repos and partial state. Output feeds M2 (LLM briefing stamp on the model) and M3 (STATUS.md + status.html renderer).

**M0 ship absorption** (2026-06-17, PR #31):
- M0의 `docs/v1.3.0-observability/schema-surface.md`가 read-side schema surface의 **canonical binding** 문서로 격상됐다. M1 derive는 grep 대신 이 문서의 §2–§4 필드 inventory를 진실 원천으로 삼는다.
- `state-md-naming-reconciliation.md` §3 tri-state grid가 derive `state.js`의 `computeResumeState` 표 1:1 source. 별도 추론 금지 — 누락 cell 발견 시 reconciliation doc 갱신 PR이 선행.
- `dispatch-envelope.validate()`가 M0 Task 4a로 strict (`KNOWN_KEYS` unknown-key rejection) 라이브. Codex F4 capability probe는 이 변화 위에서 즉시 `contract_present=true` 반환 가정. M0 미배포 환경(가설적 fork) 대응은 capability probe + `--strict` exit code로 유지.
- M0 PRD body amend로 `handoff_dispatching/handoff_dispatched`는 PRD 본문에 없다. M1 derive는 PRD 본문이 아닌 `state-writer.emptyState()` + `VALID_EVENTS` allowlist를 읽는다.
- **Schema-surface §2.4 field-name fix** — plan 초안의 `dispatched_by_controller_session`은 schema.js의 실제 필드 `dispatched_by_controller_session_id`로 정정. 받침 `_id` 누락 시 모든 receipt가 silent attribute miss로 correlation Kind 1을 0건 보고하는 silent-loss 결함.
- **Receipt meta surface expansion** — schema-surface §2.3이 본문화한 5개 추가 present-only 필드(`codex_disabled_at_pr`, `codex_review_actionable_findings`, `deferred_findings_count`, `plan_conflict_escalated`, `pr_phase_lock_stale_reclaimed_at_hook`)를 receipt extract block에 포함. dashboard timeline·badge·escalation 시그널의 raw input.

**Codex R1 absorptions applied** (4 findings, all ACCEPT_NOW):
- **F1 (HIGH 0.94)** — Task 9 plan_hash correlation switched from a substring-prefilter to a one-pass `hash → plan` index. Codex grep on this repo found a real link the prefilter would have silently dropped (decision_id `v1-3-0-observability-surface-ii` ↔ plan slug `v1-3-0-observability-m0-schema-baseline`).
- **F2 (HIGH 0.91)** — Masking is now M1's responsibility, NOT deferred to M4. Model emits a share-safe shape by default; `--raw` opt-in for internal tooling. M2 (LLM briefing) consumes only the masked shape, so unmasked paths never reach the LLM API.
- **F3 (MEDIUM 0.86)** — Each source carries `invalid_count` + `degraded: invalid_count > 0` so envelope schema drift surfaces as `sources.envelopes.degraded=true` (loud-fail-open invariant — see [[feedback-loud-fail-open]]).
- **F4 (MEDIUM 0.82)** — `derive/capability.js` probes M0 strict-validate behavior at runtime (NOT just doc existence). If validator is still permissive, model.warnings carries a critical warning and CLI strict mode exits non-zero.

Wall-clock perf budget < 1s on a 100-receipt fixture so M3 has headroom inside the PRD's 60s entry-time SLO.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Namespace layout | `plugins/mccp/scripts/receipt/` + `plugins/mccp/scripts/state/` | Per-domain folder under `scripts/` with `index.js` (lib export), `cli.js` (entry), `tests/` subfolder |
| Source-reader contract | `plugins/mccp/scripts/lib/dispatch-envelope.js:194-220` (`read()`) | Each source-reader returns `{ ok: bool, ...data, error?: string }` — never throw, caller decides UI |
| Safe-dir scan | `plugins/mccp/scripts/receipt/store.js:65-145` (`listReceipts`) | `fs.existsSync` + `fs.readdirSync` filter + symlink rejection via `lstatSync` — no glob lib, no `dirent` walking |
| State read | `plugins/mccp/scripts/state/state-writer.js:174-203` (`readState`) | Use the canonical `emptyState()` shape as the merge target so derive gets every field including conditional-emit ones |
| Schema field surface (read-only) | `docs/v1.3.0-observability/schema-surface.md` §2 / §3 / §4 (M0 ship) | Single canonical inventory of receipt/envelope/state field names + introducing version + strictness flag. M1 grep replaces ad-hoc schema discovery with §-anchored lookups. |
| STATE.md tri-state semantics | `docs/v1.3.0-observability/state-md-naming-reconciliation.md` §3 (M0 ship) | 5-row tuple grid for `computeResumeState` derivation. derive `state.js` mirrors row order; new states require reconciliation doc PR first. |
| CLI dispatch | `plugins/mccp/scripts/receipt/cli.js:40-68` (`parseFlags`) | flat `--key value` + `--flag` parser, subcommand switch, 0/1 exit code |
| Module export | `plugins/mccp/scripts/lib/dispatch-envelope.js:287-295` | `module.exports = { ... }` flat surface, no default export |
| Logging | `plugins/mccp/scripts/state/state-writer.js:93-95` | `process.stderr.write('[mccp:derive] WARNING: ...')` prefix for non-fatal soft fallback |
| Tests | `plugins/mccp/scripts/receipt/tests/schema.test.js` + `tests/v1-3-0-baseline.test.js` (M0 fixture style) | Node native `node:test` + skeleton fixtures + `assert.strictEqual`. M0 baseline test for branch-pinning template. |
| Fixture isolation | `plugins/mccp/scripts/state/tests/state-writer.test.js` | `os.tmpdir()` + `fs.mkdtempSync` per-test repo synthesis (so derive doesn't read the host repo state in unit tests) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/derive/index.js` | CREATE | Main entry `derive(repoRoot, opts) → DeriveModel`. Single public function. Calls capability probe + 7 source-readers, hands off to normalize + correlate + mask, returns model. |
| `plugins/mccp/scripts/derive/model.js` | CREATE | Normalized model shape (constants + `emptyModel()` factory + `validate()` shape check for tests). Mirrors `state-writer.js:emptyState()` pattern so all fields are discoverable in one place. Includes `schema_version: 'v1'` + `masked: true` (default) + per-source `invalid_count: 0 / degraded: false` (Codex F3 absorption). |
| `plugins/mccp/scripts/derive/mask.js` | CREATE | **Codex F2 absorption** — `maskModel(model, repoRoot) → maskedModel` pure function. Replaces absolute paths with placeholders: `repo_root` → `<repo>`; `meta.cwd` → `<cwd>`; envelope `parent_cwd` → `<parent>`; receipt/envelope/plan absolute paths → relative-to-repoRoot via `path.relative`. Sets `model.masked = true`. Re-applied idempotently. M4 will compose on top for envelope payload + secret patterns; M1 owns path-level masking only. |
| `plugins/mccp/scripts/derive/capability.js` | CREATE | **Codex F4 absorption** — `probeM0SchemaContract() → { contract_present, evidence }`. Calls `dispatch-envelope.validate({...minimalValid, unknown_key: 1})`; if `ok === true`, M0 Task 4a strict-validate is NOT deployed → `contract_present: false`. Also probes `state-md-naming-reconciliation.md` field-name correctness by checking that `state-writer.emptyState().frontmatter` declares the post-M0 field set (`dispatch_id`, `dispatch_id_completed`, `dispatch_attempt_count`, `controller_session_id`, `active_dispatch_count`). Pure read; no fs writes. |
| `plugins/mccp/scripts/derive/sources/plans.js` | CREATE | Scan `.claude/plans/*.plan.md` + (legacy) `.claude/PRPs/plans/*.plan.md`. Extract: slug, source PRD link, milestone, complexity, acceptance checkbox progress (count `- [ ]` vs `- [x]`). Body unchanged (no markdown parse beyond regex). |
| `plugins/mccp/scripts/derive/sources/receipts.js` | CREATE | Thin wrapper over `receipt/store.listReceipts` + `readReceipt`. Per-receipt extract: gate, decision_id, round, converged, advisory, skipped, codex_skipped, codex_disabled, force-override flags, codex_dedupe_at_pr, design-scope flags, controller-context attribution (4 v1.2.0-m1 fields). Each receipt: `{ ok, data, error? }` to tolerate the parse-error path `store.readReceipt` throws (catch + downgrade). |
| `plugins/mccp/scripts/derive/sources/state.js` | CREATE | Single `state-writer.readState(repoRoot)` call → unwrap to derive's STATE record. Pass through *all* conditional-emit fields per M0 reconciliation: `dispatch_id` / `dispatch_id_completed` / `dispatch_attempt_count` / `controller_session_id` / `active_dispatch_count` / `escalate_pending` / `dep_check_at` / `dep_check_missing` / `chain_aborted` / `chain_progress` / `last_pr_url`. Includes tri-state interpretation helper (`computeResumeState(fm) → 'idle' \| 'in-flight' \| 'completed' \| 'giveup'`). |
| `plugins/mccp/scripts/derive/sources/backlog.js` | CREATE | Read `.claude/plans/codex-findings-backlog.md`. Parse the markdown table (`\| Date \| Severity \| Source plan \| Finding \|` header). Each row → `{ date, severity, source_plan, finding }`. Return rows + warning if header missing (graceful: backlog optional). |
| `plugins/mccp/scripts/derive/sources/fix-task.js` | CREATE | Wrap `state/fix-task.read(repoRoot)`. Pass through `{ title, why, failures, verdict, ttl_expires_at, body_hash }`. Handle absence (`null` return → `{ ok: true, item: null }`). |
| `plugins/mccp/scripts/derive/sources/pr.js` | CREATE | Local-only PR signal — NO GitHub API call. Spawn `git rev-parse HEAD` + `git rev-parse --abbrev-ref HEAD` + `git config --get remote.origin.url` synchronously. Parse origin URL for `owner/repo`. Return `{ ok, head_sha, branch, remote_owner_repo, last_pr_url_from_state }` (state PR url is forwarded from state source for cross-correlation, not re-derived). |
| `plugins/mccp/scripts/derive/sources/envelopes.js` | CREATE | Scan `.claude/state/dispatches/*.envelope.json`. Use `dispatch-envelope.read()` per file (gets M0 strict-validate for free post-Task 4a). Per envelope: extract `dispatch_id`, `worker_subagent_type`, `worker_started_at`, `worker_ended_at`, `worker_exit_status` (5-status enum), `controller_session_id`, `parent_cwd`, plus heartbeat staleness probe (`<id>.envelope.json.heartbeat` mtime via `lib/dispatch-controller.HEARTBEAT_TTL_DEFAULT_MS`). Each envelope: independent `{ ok, data, error? }`. Missing directory = `{ ok: true, count: 0 }` (NOT an error — non-controller repos are valid). |
| `plugins/mccp/scripts/derive/correlate.js` | CREATE | Pure aggregator (no fs, no I/O). Build correlation entries: `{ from: {kind, id}, to: {kind, id}, link_via, evidence: [...] }`. 6 correlation kinds — see Task 9 body for full list. |
| `plugins/mccp/scripts/derive/cli.js` | CREATE | Entry point. Subcommands: `run --json` (emit masked normalized model — default), `run --json --raw` (emit unmasked model, internal tooling only — **Codex F2 absorption**), `run --summary` (1-screen text, debug only — NOT user-facing renderer; that's M3), `run --strict` (exit 1 if M0 capability check fails — **Codex F4 absorption**), `version`, `--help`. parseFlags from receipt/cli.js pattern. |
| `plugins/mccp/scripts/derive/tests/empty-repo.test.js` | CREATE | Non-mccp repo (no `.claude/`) → empty model, no throws, all sources `ok: true` with `count: 0` or `item: null`. |
| `plugins/mccp/scripts/derive/tests/mccp-fixture.test.js` | CREATE | Synthesize a fixture repo with ALL 7 source types populated (1 receipt, 1 state, 1 fix-task, 1 plan, 1 backlog row, 1 envelope, git init). Assert each source `ok:true count>=1`. Run on tmpdir, not host repo. |
| `plugins/mccp/scripts/derive/tests/envelope-absent.test.js` | CREATE | Fixture with receipts present but NO `dispatches/` dir. Assert `sources.envelopes.ok===true && sources.envelopes.count===0`. Critical: matches the PRD's "envelope 미존재 OK" invariant + the live state of this repo (verified during grounding — `dispatches/` doesn't exist yet). |
| `plugins/mccp/scripts/derive/tests/correlation.test.js` | CREATE | Synthesize a receipt with `meta.ipc_envelope_path` + matching envelope at that path + STATE.md with same `controller_session_id`. Assert correlate.js produces 3 cross-links: receipt→envelope, envelope→state, state→receipt (via decision_id). |
| `plugins/mccp/scripts/derive/tests/schema-drift.test.js` | CREATE | Synthesize an envelope with an unknown top-level key (which M0 Task 4a will reject). **Codex F3 absorption**: assert `sources.envelopes.items[0].ok===false` with the M0 strict-validate error message AND `sources.envelopes.degraded===true` AND `sources.envelopes.invalid_count===1` (loud-fail-open). Overall `sources.envelopes.ok` still emits but is decoupled from `degraded` — both are present for M3 renderer's amber-warning UI decisions. |
| `plugins/mccp/scripts/derive/tests/mask.test.js` | CREATE | **Codex F2 absorption** — synthesize fixture with absolute path fields (repo_root, meta.cwd, envelope parent_cwd). Assert `derive(root)` (default) yields `model.masked===true` + no absolute path strings in JSON.stringify output. `derive(root, { raw: true })` yields `model.masked===false` + absolute paths preserved. CLI smoke: `node cli.js run --json` masked; `--raw` opt-in unmasked. |
| `plugins/mccp/scripts/derive/tests/capability.test.js` | CREATE | **Codex F4 absorption** — two paths: (a) with current (post-M0) strict-validate envelope module: assert `probeM0SchemaContract().contract_present===true`. (b) Mock `dispatch-envelope` (via `proxyquire`-free constructor injection) to return permissive `validate()`: assert `contract_present===false` + evidence string mentions which probe failed. CLI `run --strict` returns exit 1 in mocked pre-M0 path. |
| `plugins/mccp/scripts/derive/tests/perf-budget.test.js` | CREATE | Synthesize fixture: 100 receipts across 3 gates + 20 envelopes + 5 plans + 1 STATE.md. Assert `derive(root)` returns in < 1000ms wall-clock. Budget rationale: PRD success metric "< 60s entry time" — derive is one of 3 stages (derive, briefing-stamp lookup, M3 render), each gets ~5s of the 60s, derive should be 5x under that for headroom. |
| `plugins/mccp/scripts/derive/tests/no-new-deps.test.js` | CREATE | Static check: import `derive/index.js` from a child process with `NODE_OPTIONS=--require ...` shim that asserts no `require()` resolves outside `fs`/`path`/`crypto`/`os`/`url`/`child_process`/`module` + the existing `plugins/mccp/scripts/**` tree. Fails if any contributor accidentally adds `lodash` etc. |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATE | Delivery Milestones row 1 (Derive engine): Status `pending → in-progress` + Plan cell link to this plan file. No other PRD body changes (no equivalent of M0's body-amend — M1 doesn't surface new schema drift). |
| `CLAUDE.md` | UPDATE | §1.4 table: append `v1.3.0-m1 derive engine` row (mirrors v1.3.0-m0 row M0 adds). §5: add `6. plugins/mccp/scripts/derive/index.js — .claude/ 통합 모델 derive 진입점, 7 source.` |

**No mutations** to: `plugins/mccp/scripts/receipt/*` (consumed read-only), `plugins/mccp/scripts/state/state-writer.js` (consumed via `readState`), `plugins/mccp/scripts/lib/dispatch-envelope.js` (consumed via `read`), or any existing receipt JSON. M1 is strictly additive.

## Tasks

### Task 1: derive/model.js — normalized model factory

- **Action**: Create `plugins/mccp/scripts/derive/model.js` exporting:
  - `MODEL_VERSION = 'v1'`
  - `emptyModel(repoRoot) → DeriveModel` — returns the full skeleton with every field present (mirrors `state-writer.emptyState` pattern). Top-level shape (**Codex F2 + F3 + F4 absorptions applied**):
    ```
    {
      schema_version: 'v1',
      derived_at: ISO8601 string,
      repo_root: string,
      masked: true,                     // F2: default share-safe; --raw flips to false
      m0_capability: {                  // F4: runtime contract probe result
        contract_present: null,         // true | false | null (not probed yet)
        evidence: '',
      },
      sources: {
        // Each source carries invalid_count + degraded (F3 loud-fail-open).
        // `ok` reflects "scan completed without infrastructural error";
        // `degraded` reflects "≥1 item failed semantic validation".
        // M3 renderer keys off `degraded` for amber-warning UI.
        plans:     { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
        receipts:  { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
        state:     { ok: true, item: null,                            degraded: false, error: null },
        backlog:   { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
        fix_task:  { ok: true, item: null,                            degraded: false, error: null },
        pr:        { ok: true, item: null,                            degraded: false, error: null },
        envelopes: { ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null },
      },
      correlations: [],
      warnings: [],   // critical, drift, capability — M3 renders prominently
    }
    ```
  - `validateShape(model) → { ok, errors[] }` — pure shape check (test fixtures use this; not a wire schema gate).
  - `markDegraded(source, reason)` — helper that sets `source.degraded=true` + increments `invalid_count`. Called by sources/receipts.js + sources/envelopes.js per failed item.
- **Mirror**: `plugins/mccp/scripts/state/state-writer.js:116-172` (`emptyState`) — every field declared in one place so downstream readers don't have to guess at presence.
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/empty-repo.test.js` — `emptyModel()` builds; `validateShape(emptyModel('/x')).ok === true`; default `masked === true`; `m0_capability.contract_present === null` (not probed yet).

### Task 2: derive/sources/plans.js — scan plan files

- **Action**: Create the file with single export `scanPlans(repoRoot) → { ok, count, items, error }`. Implementation:
  - Probe `<root>/.claude/plans/` AND `<root>/.claude/PRPs/plans/` (legacy). If both absent → `{ ok: true, count: 0, items: [], error: null }`.
  - For each `*.plan.md` (NOT `*.md` — only plan files):
    - Read file (skip if `lstatSync().isSymbolicLink()` per `receipt/store.js:57-63` safe-dir guard).
    - Extract: filename slug (`path.basename(f, '.plan.md')`), source PRD path (regex `\*\*Source PRD\*\*: \[([^\]]+)\]\(([^)]+)\)`), selected milestone (regex `\*\*Selected Milestone\*\*: (.+)$`), complexity (regex `\*\*Complexity\*\*: (\w+)`), acceptance progress (count `- \[ \]` and `- \[x\]` lines under `## Acceptance`).
    - Push `{ slug, path: relpath, source_prd, milestone, complexity, acceptance: { total, checked } }`.
  - Catch any per-file error, push as `{ slug, path, error }` so partial state still surfaces.
- **Mirror**: `receipt/store.js:65-102` (existsSync + readdirSync + filter, no glob).
- **Validate**: Synthesize fixture in `tests/mccp-fixture.test.js` Task 12 with a minimal plan and assert one item with parsed source_prd link.

### Task 3: derive/sources/receipts.js — list receipts via store

- **Action**: Single export `scanReceipts(repoRoot) → { ok, count, items, error }`. Implementation:
  - `const { listReceipts, readReceipt } = require('../../receipt/store')`.
  - Try `listReceipts(repoRoot)`. If receipts dir doesn't exist, listReceipts returns `[]` → `{ ok: true, count: 0, items: [], error: null }`.
  - Per entry: try `readReceipt(...)`. On parse error (the `RECEIPT_PARSE_ERROR` thrown path), catch + push `{ gate, decision_id, path, ok: false, error: err.message }`.
  - On success, extract a shallow view (NOT the full receipt — derive consumers don't need everything):
    Use a **presence-preserving pick helper** to avoid the `!!` / `|| 0` coercion that
    Codex R1 F1 flagged. The helper returns the raw value when set, or `undefined`
    when the key was never present in the receipt — so v0.2.x-era receipts (key
    never written) are distinguishable from v0.3.x receipts (key written with explicit
    `false`/`0`). Pattern:
    ```js
    const pick = (m, k) => (m && Object.prototype.hasOwnProperty.call(m, k)) ? m[k] : undefined;
    ```
    Extract block:
    ```
    {
      ok: true,
      gate, decision_id, round, converged: !!resolution.converged,
      open_questions_count: (resolution.open_questions||[]).length,
      // Strict fields (always present per schema-surface §2.2) — boolean pass-through OK
      advisory: !!meta.advisory,
      skipped: !!meta.skipped,
      skip_reason: meta.skip_reason,                                              // string | null (v0.1, strict)
      codex_skipped: !!meta.codex_skipped,
      security_skipped: !!meta.security_skipped,
      security_skip_reason: meta.security_skip_reason,
      security_force_override: !!meta.security_force_override,
      security_force_override_reason: meta.security_force_override_reason,
      impeccable_skipped: !!meta.impeccable_skipped,
      impeccable_skip_reason: meta.impeccable_skip_reason,
      impeccable_force_override: !!meta.impeccable_force_override,
      impeccable_force_override_reason: meta.impeccable_force_override_reason,
      // Present-only fields (schema-surface §2.3) — preserve absence via pick().
      // Codex R1 F1 absorption: NO `!!` coercion, NO `|| 0` collapse.
      codex_dedupe_at_pr: pick(meta, 'codex_dedupe_at_pr'),
      codex_skipped_at_pr: pick(meta, 'codex_skipped_at_pr'),
      codex_disabled_at_pr: pick(meta, 'codex_disabled_at_pr'),
      codex_skip_reason: pick(meta, 'codex_skip_reason'),                         // §2.3 row, was missing in plan v2
      codex_review_actionable_findings: pick(meta, 'codex_review_actionable_findings'),
      codex_disabled: pick(meta, 'codex_disabled'),
      codex_design_scope_excluded: pick(meta, 'codex_design_scope_excluded'),     // §2.3 row, was missing in plan v2
      design_findings_dropped: pick(meta, 'design_findings_dropped'),
      a11y_routed_to_impeccable: pick(meta, 'a11y_routed_to_impeccable'),
      dropped_findings_digest: pick(meta, 'dropped_findings_digest'),             // §2.3 row, was missing in plan v2
      deferred_findings_count: pick(meta, 'deferred_findings_count'),
      plan_conflict_escalated: pick(meta, 'plan_conflict_escalated'),
      pr_phase_lock_stale_reclaimed_at_hook: pick(meta, 'pr_phase_lock_stale_reclaimed_at_hook'),
      // v1.2.0-m1 attribution (4-field marker-gated axis, schema-surface §2.4).
      // schema.js source of truth: schema.js:370-403 + 478-481.
      // marker present → all 3 attribution fields MUST be present (schema invariant).
      // marker absent  → all 3 MUST be null (schema invariant).
      // pick() preserves both states; correlate.js Kind 1 checks all 3 + UUID equality.
      controller_context_marker_present: pick(meta, 'controller_context_marker_present'),
      dispatched_by_controller_session_id: pick(meta, 'dispatched_by_controller_session_id'),
      worker_dispatch_id: pick(meta, 'worker_dispatch_id'),
      ipc_envelope_path: pick(meta, 'ipc_envelope_path'),
      created_at: meta.created_at, command: meta.command,
      base_sha: receipt.base_sha, head_sha: receipt.head_sha,
      plan_hash: receipt.plan_hash,
      path: entry.path,
    }
    ```
    **Acceptance test (Codex R1 F1 absorption guard)**: `tests/mccp-fixture.test.js` writes one v0.2.x-era receipt (no `codex_disabled_at_pr` key at all) + one v0.3.5+ receipt (`codex_disabled_at_pr: false` explicit). Assert both receipts produce distinct extract outputs: first `=== undefined`, second `=== false`. The `!!` coercion path collapses both to `false`; the `pick()` path preserves the distinction.
  - **DO NOT** read `meta.briefing_summary` / `meta.briefing_token_count` / `meta.briefing_invocation_count` — these are M2's responsibility per schema-surface §6.1 binding. M1 derive is forward-compatible (silently ignores) but doesn't surface them. M2 plan's Task 1 MUST add them to `schema.js` before any write path; without that prerequisite, derive would never see populated values anyway.
- **Mirror**: `receipt/status.js:6-45` for the listReceipts → readReceipt loop pattern.
- **Validate**: `tests/mccp-fixture.test.js` writes one minimal valid receipt to the fixture, asserts `count===1`.

### Task 4: derive/sources/state.js — read STATE.md

- **Action**: Single export `scanState(repoRoot) → { ok, item, error }`. Implementation:
  - `const stateWriter = require('../../state/state-writer')`.
  - Call `stateWriter.readState(repoRoot)`. NEVER throws (it falls back to `emptyState` on read failure with stderr warning).
  - Determine if a real STATE.md exists: `fs.existsSync(path.join(repoRoot, '.claude/state/STATE.md'))`. If not, `{ ok: true, item: null, error: null }`.
  - Extract:
    ```
    {
      frontmatter: { /* full frontmatter pass-through — let consumers pick fields */ },
      body: { /* same */ },
      // Derived helpers (M0 reconciliation outputs):
      resume_state: computeResumeState(fm),
        // 'idle' | 'in-flight' | 'completed' | 'giveup'
        // 'idle' if !dispatch_id && !dispatch_id_completed
        // 'in-flight' if dispatch_id && !dispatch_id_completed
        // 'completed' if dispatch_id_completed
        // 'giveup' if dispatch_attempt_count >= 3 (overrides others)
      controller_active: !!(fm.controller_session_id && fm.active_dispatch_count > 0),
      escalate_pending: !!fm.escalate_pending,
    }
    ```
  - `computeResumeState` is a pure helper exported from this file so M3 renderer can also use it (single source of truth).
- **Mirror**: `state-writer.js:174-186` read pattern + M0's `state-md-naming-reconciliation.md` tri-state table.
- **Validate**: Synthesize STATE.md with `dispatch_id: <uuid>` + `dispatch_id_completed: null` + `dispatch_attempt_count: 1` → assert `resume_state === 'in-flight'`. Repeat for each of the 4 states.

### Task 5: derive/sources/backlog.js — codex-findings-backlog parser

- **Action**: Single export `scanBacklog(repoRoot) → { ok, count, items, error }`. Implementation:
  - Probe `<root>/.claude/plans/codex-findings-backlog.md`. Absent → `{ ok: true, count: 0, items: [], error: null }`.
  - Read file. Find the table header line matching `^\| Date \| Severity \| Source plan \| Finding \|$` (per existing file at `.claude/plans/codex-findings-backlog.md:8`).
  - Skip the separator row (`|---|---|---|---|`).
  - For each subsequent non-empty line starting with `|`: split on `\s*\|\s*`, drop first+last empty elements, push `{ date, severity, source_plan, finding }`.
  - If header missing → `{ ok: true, count: 0, items: [], warning: 'backlog file present but header not found' }` (graceful — file may be empty or have a different layout in another repo).
- **Mirror**: backlog file format documented in `.claude/plans/codex-findings-backlog.md` lines 1-9.
- **Validate**: Fixture writes a backlog with 1 row + 1 empty row → assert `count===1` + parsed fields.

### Task 6: derive/sources/fix-task.js — wrap state/fix-task.read + parseFixTaskMd

- **Action** (Codex R1 F2 absorption — actual API contract): Single export `scanFixTask(repoRoot) → { ok, item, error }`. Implementation:
  - `const fixTask = require('../../state/fix-task')`.
  - `const raw = fixTask.read(repoRoot)`. **Contract**: `read()` returns **raw markdown string** (or `null` if file absent). Source: `state/fix-task.js:344-348`.
  - If `raw === null` → `{ ok: true, item: null, error: null }` (no fix-task present is the healthy case).
  - `const parsed = fixTask.parseFixTaskMd(raw)`. **Contract** (per `state/fix-task.js:237-272`):
    - Returns `{ fm, body }` — frontmatter key is **`fm`**, not `frontmatter`.
    - Returns `null` (NOT throw) when the input has no fenced `---` frontmatter block or the close fence is missing.
  - If `parsed === null`: file existed but the frontmatter is corrupt / malformed → `{ ok: false, item: null, error: 'fix-task frontmatter unparseable' }`. Push a model.warnings entry in `index.js`. Loud-fail-open.
  - On success, extract:
    ```
    {
      ok: true,
      // Frontmatter fields actually emitted by buildBody (fix-task.js:117-128):
      schema_version: parsed.fm.schema_version,    // integer (FIX_TASK_VERSION=1)
      created_at: parsed.fm.created_at,            // ISO 8601
      expires_at: parsed.fm.expires_at,            // ISO 8601 — NOT `ttl_expires_at`
      counter: parsed.fm.counter,                  // integer 1..2
      verdict: parsed.fm.verdict,                  // enum (quality_fail / codex_critical / codex_divergent / plan_conflict)
      originating_receipts: parsed.fm.originating_receipts || [],  // array of receipt paths
      // Body markdown — sections (Title / Why / Failures / Next actions / Notes).
      // Surface as raw string so M3 can render without re-parsing.
      body: parsed.body,
      // body_hash is NOT in frontmatter — compute here using the public helper.
      body_hash: fixTask.bodyHash(parsed.body),    // 12-char sha256 prefix
      path: fixTask.fixTaskPath(repoRoot),
    }
    ```
  - **TTL check**: if `parsed.fm.expires_at < new Date().toISOString()`, set the item's `expired: true` flag and push `'fix-task expired ' + expires_at` to model.warnings in `index.js`. Still return the item — M3 renderer decides whether to hide.
  - **Catch policy**: do NOT blanket-catch every throw. `parseFixTaskMd` already returns `null` for the expected malformed-frontmatter case; if it throws unexpectedly (extractor bug), let it propagate to `index.js`'s last-resort try/catch — that path generates a `warning: 'source fix_task threw: ...'` entry rather than silently masking an extractor bug as a "parse error". This is the Codex F2 specifically-requested distinction.
- **Mirror**: `state/fix-task.js:376-389` exported API surface — `read`, `parseFixTaskMd`, `bodyHash`, `fixTaskPath` are the only binding entry points.
- **Validate**: 3 fixture paths in `tests/mccp-fixture.test.js`:
  1. Healthy fix-task (verdict=`quality_fail`) → `item.verdict === 'quality_fail'` + `item.expires_at` is a valid ISO + `item.body_hash` is a 12-char hex string.
  2. Corrupt frontmatter (no `---` close fence) → `ok === false`, `error` mentions "unparseable".
  3. Expired fix-task (`expires_at` 7 days in the past) → `item.expired === true` + model.warnings includes the expiry note.

### Task 7: derive/sources/pr.js — local git/PR signal

- **Action**: Single export `scanPR(repoRoot) → { ok, item, error }`. Implementation:
  - Spawn 3 sync `git` commands via `child_process.execFileSync('git', [...], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })`:
    1. `rev-parse HEAD` → `head_sha`
    2. `rev-parse --abbrev-ref HEAD` → `branch`
    3. `config --get remote.origin.url` → `origin_url` (may fail in repos without remote — catch and `null`).
  - Parse `origin_url` for `(?:github\.com[:/])([^/]+)\/([^/.]+)` → `{ owner, repo }`.
  - **Never call GitHub API**. M1 is local-only. Cross-checking `last_pr_url` from STATE.md happens in correlate.js (Task 9), not here.
  - If repo is not a git repo (the first execFileSync throws), `{ ok: false, item: null, error: 'not a git repo' }`. Non-fatal upstream (warnings array gets a note).
- **Mirror**: `plugins/mccp/scripts/receipt/hash.js` has `gitRepoRoot(cwd)` doing `git rev-parse --show-toplevel` — same execFileSync pattern. Use stdio:'pipe' to capture stdout, 'ignore' to mute stderr.
- **Validate**: Fixture initializes a git repo (`git init && git commit --allow-empty -m init`), assert `head_sha` is a 40-char hex.

### Task 8: derive/sources/envelopes.js — dispatch envelope scan

- **Action**: Single export `scanEnvelopes(repoRoot) → { ok, count, items, invalid_count, degraded, error }`. Implementation:
  - Probe `<root>/.claude/state/dispatches/`. Absent → `{ ok: true, count: 0, items: [], invalid_count: 0, degraded: false, error: null }`. **Verified during grounding**: this exact path is missing in the current repo, so derive must tolerate this.
  - List `*.envelope.json` (filter out `.tmp` partial writes from `dispatch-envelope.write` rename, filter out `.heartbeat` sidecars).
  - For each file:
    - `const envelope = require('../../lib/dispatch-envelope')`.
    - `const result = envelope.read(filePath)`. On `{ ok: false, error }` → push `{ ok: false, path, error }` AND increment `invalid_count`. (Post-M0 Task 4a, unknown-key envelopes surface here naturally.)
    - On success, extract:
      ```
      {
        ok: true,
        dispatch_id, worker_subagent_type, worker_started_at, worker_ended_at,
        worker_exit_status, // 'pending' | 'ok' | 'failure' | 'timeout' | 'crashed'
        controller_session_id, parent_cwd,
        receipts_added: result.envelope.receipts_added,
        finding_count: result.envelope.findings.length,
        // Heartbeat staleness (Task 12 in M0/m1 controller plan):
        heartbeat_path: filePath + '.heartbeat',
        heartbeat_age_ms: <fs.statSync mtime diff or null if absent>,
        is_terminal: TERMINAL_STATUSES.includes(worker_exit_status),
        path: filePath,
      }
      ```
    - For staleness probe: use `dispatch-controller.HEARTBEAT_TTL_DEFAULT_MS` to mark `stale: heartbeat_age_ms > TTL`. Import that constant via `require('../../lib/dispatch-controller')`.
  - **Codex F3 absorption (loud-fail-open)**: after the loop, set `degraded = invalid_count > 0`. Source still reports `ok: true` (scan didn't infrastructurally fail), but `degraded: true` makes M3 render an amber warning rather than treating fanout as healthy. Push a model-level warning entry if `degraded`: `'envelope source degraded: ' + invalid_count + ' of ' + count + ' envelopes failed validation'`. Same convention applied in Task 3 (receipts.js) for receipt parse errors.
- **Mirror**: `lib/dispatch-envelope.js:165-189` for read + `lib/dispatch-controller.js:43-44` for heartbeat constants.
- **Validate**: 3 test paths — `tests/envelope-absent.test.js` (count===0, degraded===false), `tests/mccp-fixture.test.js` (1 valid envelope, count===1, invalid_count===0, degraded===false), `tests/schema-drift.test.js` (unknown-key envelope, items[0].ok===false, invalid_count===1, **degraded===true**, model.warnings includes envelope source message).

### Task 9: derive/correlate.js — cross-state correlation

- **Action**: Single export `correlate(model) → correlationEntries[]`. Pure function — no I/O, no mutation. Receives the partially-filled model (after sources are scanned, before correlate runs), returns the correlations array which `index.js` then assigns to `model.correlations`.
- Produce 6 correlation kinds:
  1. **receipt ↔ envelope (M0 v1.2.0-m1 attribution, Codex R1 F3-hardened 3-way equality)** — for each receipt with `controller_context_marker_present === true`, run the full 4-axis equality check before emitting a correlation. Required matches:
     - (a) Parse the UUID embedded in `receipt.meta.ipc_envelope_path` (the `<uuid>` segment of `.claude/state/dispatches/<uuid>.envelope.json` — capture via `ENVELOPE_PATH_RE`).
     - (b) `receipt.meta.worker_dispatch_id === parsedUuid` — schema-surface §2.4 marker invariant says these MUST agree at write time.
     - (c) Envelope file at `path.join(repoRoot, receipt.meta.ipc_envelope_path)` exists AND its parsed `envelope.dispatch_id === parsedUuid`.
     - (d) `receipt.meta.dispatched_by_controller_session_id === envelope.controller_session_id` — explicit controller-session equality (this prevents a copied/renamed envelope from forming a confident-looking link with stale controller attribution, per Codex F3).
     - Any of (a)–(d) failing: do NOT emit a correlation; push a warning to `model.warnings` naming the specific axis that failed.
     - All 4 pass: `{ kind: 'receipt-attributed-to-envelope', from: {kind:'receipt', id: receipt.path}, to: {kind:'envelope', id: envelope.dispatch_id}, link_via: '4-axis equality', evidence: ['ipc_envelope_path UUID == worker_dispatch_id', 'envelope.dispatch_id == worker_dispatch_id', 'envelope.controller_session_id == receipt.dispatched_by_controller_session_id (' + value + ')', 'envelope file present at ' + repo_relative_path] }`.
     - **Field-name guardrail**: receipt field is `meta.dispatched_by_controller_session_id` (with `_id` suffix per schema-surface §2.4 + schema.js:378). A typo here yields zero correlations and a silently empty dashboard fanout — `tests/correlation.test.js` MUST include a populated-attribution fixture asserting ≥1 emitted correlation, otherwise the typo can re-creep in.
     - **Negative fixtures** (Codex R1 F3 absorption — required in `tests/correlation.test.js`):
       1. **Path-content mismatch**: write a receipt pointing at `dispatches/<uuid-A>.envelope.json` but the file at that path has `dispatch_id: <uuid-B>` (renamed envelope). Assert no Kind 1 correlation emitted + warning mentions axis (c).
       2. **Controller-session mismatch**: receipt + envelope agree on `dispatch_id` but `dispatched_by_controller_session_id !== controller_session_id` (e.g. envelope copied across worktrees). Assert no Kind 1 correlation emitted + warning mentions axis (d).
  2. **state ↔ envelope (controller layer)** — if `state.frontmatter.controller_session_id` is set, link to every envelope whose `controller_session_id` matches. `link_via: 'controller_session_id'`. Multiple envelopes per state is normal (fanout).
  3. **state ↔ envelope (resume layer)** — if `state.frontmatter.dispatch_id` is set AND there's an envelope with matching `dispatch_id`, emit link. M0 reconciliation already declares that resume's `dispatch_id` and controller's `dispatch_id` share UUID namespace but different lifecycle, so the correlation kind is distinct: `kind: 'state-resume-tracks-envelope'`.
  4. **receipt ↔ plan (plan_hash)** — **Codex F1 absorption (HIGH 0.94)**. Build a one-pass `Map<plan_hash, planEntry>` by hashing **every** plan file's canonical markdown ONCE per derive call. Then for each receipt with `plan_hash` set, do an `O(1)` map lookup. NO substring/slug prefilter — Codex grep on this repo found a real link the prefilter would have silently dropped (decision_id `v1-3-0-observability-surface-ii` matches plan slug `v1-3-0-observability-m0-schema-baseline`; substring-match fails). Match found → `{ kind: 'receipt-anchored-to-plan', link_via: 'plan_hash', evidence: ['sha256 of canonicalized plan markdown matches receipt.plan_hash', 'one-pass hash index', 'plan path: <X>'] }`. Match missing → push to `model.warnings` (NOT silently absent). Use `receipt/hash.js:hashMarkdown` (verify exposure during Task 1 grounding extension; if not exported, replicate inline — this is a 1-call site). Perf: 5 plans × ~5ms hash = ~25ms; 100 receipts × O(1) lookup = negligible. Comfortably inside the 1s budget — `perf-budget.test.js` will catch any regression.
  5. **backlog ↔ plan (source_plan path)** — for each backlog row, match `source_plan` substring against scanned plan file paths.
  6. **fix-task ↔ STATE.md (event)** — if state's last_event ∈ {'plan_conflict_escalated', 'receipt_write'} AND fix-task item is present, emit link.
- For each emitted correlation, include `evidence: string[]` with the concrete fact that produced the link.
- Emit `warnings: string[]` for unresolved references (receipt points at missing envelope, etc.).
- **Mirror**: pure-function pattern of `lib/dispatch-controller.js:mergeEnvelopes`.
- **Validate**: `tests/correlation.test.js` synthesizes receipt+envelope+state with matching IDs → asserts 3 correlations present + each has `evidence.length >= 1`.

### Task 9b: derive/mask.js — share-safe path masking (Codex F2 absorption)

- **Action**: Create `plugins/mccp/scripts/derive/mask.js` exporting `maskModel(model, repoRoot) → maskedModel`. Pure function (no fs, no mutation of input — clones via `JSON.parse(JSON.stringify(model))`). Replacements:
  - `model.repo_root` → `'<repo>'`
  - `model.sources.receipts.items[i].path` → `path.relative(repoRoot, item.path)` (POSIX separator)
  - `model.sources.envelopes.items[i].path` / `.heartbeat_path` / `.parent_cwd` → relative-to-repoRoot
  - `model.sources.plans.items[i].path` → relative
  - `model.sources.state.item.frontmatter` — scrub any absolute path fields (currently none, but defensive)
  - For each receipt item: rewrite `meta.cwd` → `'<cwd>'` if it equals repoRoot, else `path.relative` form. **Note**: M1 receipt extract (Task 3) doesn't surface `meta.cwd` today, but `mask.js` is the contract surface for M4 to extend.
  - Set `model.masked = true`.
- Idempotent — applying twice yields same result (already-masked paths are no-ops).
- M4 will compose ON TOP of this mask for envelope payload + secret regex patterns. M1 owns only path-level masking.
- **Mirror**: `lib/dispatch-controller.mergeEnvelopes` pure-aggregator style + `path.relative` + `path.posix.normalize` cross-platform.
- **Validate**: `tests/mask.test.js` — `JSON.stringify(maskedModel)` has no absolute-path strings (no `C:\`, no `/Users/`, no `/home/`); `maskModel(maskModel(m)) === maskModel(m)` (idempotent).

### Task 9c: derive/capability.js — M0 runtime contract probe (Codex F4 absorption)

- **Action**: Create `plugins/mccp/scripts/derive/capability.js` exporting `probeM0SchemaContract() → { contract_present, evidence }`. Probes:
  1. **envelope strict-validate** — build a minimal valid envelope, add `unknown_top_level_key: 1`, call `require('../lib/dispatch-envelope').validate(probe)`. If `result.ok === true`, M0 Task 4a is NOT deployed → contract absent. Evidence string: `'envelope.validate accepted unknown_top_level_key — M0 Task 4a strict-validate not deployed'`.
  2. **STATE.md field surface** — read `require('../state/state-writer').emptyState().frontmatter`. Assert all 5 v1.1.0+v1.2.0-m1 dispatch fields exist (`dispatch_id`, `dispatch_id_completed`, `dispatch_attempt_count`, `controller_session_id`, `active_dispatch_count`). If any missing → contract absent. Evidence: `'state-writer emptyState missing field: <name>'`.
- Both probes pass → `{ contract_present: true, evidence: 'M0 schema contract verified at runtime' }`.
- Pure read of in-process modules; no fs writes; no subprocess.
- Called by `derive/index.js` at startup. Result attached to `model.m0_capability`. If `contract_present === false`, push a critical entry to `model.warnings` with the evidence string.
- **Mirror**: receipt schema test fixture pattern (`tests/schema.test.js` valid() factory).
- **Validate**: `tests/capability.test.js` — direct call returns `contract_present: true` against current head; mocked permissive validator returns `contract_present: false` with the expected evidence string.

### Task 10: derive/index.js — main entry (capability + mask wiring)

- **Action**: Single public export `derive(repoRoot, opts = {}) → DeriveModel`. Implementation:
  - Validate `repoRoot` is a string (else throw — this is a programmer error, not a graceful path).
  - Resolve to absolute path. Probe `<root>/.claude/` existence — if missing AND `opts.strict` is true, return empty model with `warning: 'no .claude/ directory'`. If `opts.strict` is unset (default) → still return empty model, no warning. Graceful for non-mccp repos.
  - **Codex F4 absorption** — call `probeM0SchemaContract()`. Attach result to `model.m0_capability`. If `contract_present === false`, push `{ severity: 'critical', source: 'capability', message: evidence }` to `model.warnings`. (Does NOT short-circuit derive — model still returns, but consumers know to distrust envelope.degraded signals because validator is wrong.)
  - Call 7 source-readers, in any order (no dependency between them). Wrap each in try/catch as last-resort safety net — a source-reader throwing is a bug, not graceful, so push a `warning: 'source X threw: ' + msg` rather than crashing the whole derive.
  - Call `correlate(model)`. Assign result + its warnings.
  - Stamp `derived_at = new Date().toISOString()`.
  - **Codex F2 absorption** — unless `opts.raw === true`, return `maskModel(model, repoRoot)`. Default path returns masked model. `opts.raw: true` returns the unmasked model (internal tooling + tests only). `model.masked` reflects which path was taken.
  - Return.
- Opts: `opts.skipSources` (array of source names — for tests + future M2 partial derive). `opts.maxPlanScanBytes` (perf safety — skip plan file if > N bytes; default 256 KB). `opts.raw` (boolean — emit unmasked).
- **Mirror**: `state/state-writer.js:update` for the read-modify-write pattern (without write).
- **Validate**: `tests/empty-repo.test.js` calls `derive('/tmp/empty')`; assert returned shape passes `model.validateShape`; assert `model.masked===true` by default; assert `model.m0_capability.contract_present` is non-null after probe.

### Task 11: derive/cli.js — CLI entry point (--raw + --strict)

- **Action**: Create `plugins/mccp/scripts/derive/cli.js` with shebang + parseFlags pattern from `receipt/cli.js`. Subcommands:
  - `run --json` → masked-by-default. `process.stdout.write(JSON.stringify(derive(cwd), null, 2) + '\n')` + exit 0.
  - `run --json --raw` → **Codex F2 absorption** — unmasked, internal tooling only. Stderr WARNING line: `[mccp:derive] --raw emits absolute paths; do NOT pipe to LLM/log/share`.
  - `run --summary` → emit a debug-only text summary (line per source: `plans: 12, receipts: 47, state: present, envelopes: 0, degraded sources: <list>`). NOT user-facing — that's M3 STATUS.md renderer.
  - `run --strict` → **Codex F4 absorption** — exit code 1 if `model.m0_capability.contract_present === false`. (Without `--strict`, exit 0 even with the critical warning — caller decides whether to treat as fatal.)
  - `version` → print MODEL_VERSION + exit 0.
  - Unknown → print usage + exit 1.
- Wire in `plugins/mccp/.claude-plugin/plugin.json` if there's a command-binary table (verify during Task 11 — if not, CLI is invocable by direct `node` only, which is fine for M1).
- **Mirror**: `plugins/mccp/scripts/receipt/cli.js:1-80` shebang + parseFlags + subcommand dispatch.
- **Validate**: `node plugins/mccp/scripts/derive/cli.js run --json` from repo root, parse stdout as JSON, assert `.schema_version === 'v1'` AND `.masked === true`. `node ... run --json --raw` → `.masked === false`. `node ... run --strict` against current head → exit 0.

### Task 12: Tests — 6 fixture suites

- **Action**: Create 6 test files (one per row in Files to Change table). Each uses Node native test runner (`require('node:test')`). Common pattern:
  ```js
  const test = require('node:test');
  const assert = require('node:assert');
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  function tmpRepo() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mccp-derive-'));
  }
  function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
  ```
- Fixture composition table:
  | Test file | Setup | Assertion |
  |---|---|---|
  | `empty-repo.test.js` | tmpRepo only | `derive(root).sources.plans.count === 0` etc., all sources `ok:true` |
  | `mccp-fixture.test.js` | git init + 1 receipt + 1 plan + 1 state + 1 fix-task + 1 backlog row + 1 envelope | all 7 sources `count>=1` or `item != null` |
  | `envelope-absent.test.js` | git init + 1 receipt, no `dispatches/` dir | `sources.envelopes.ok===true && count===0` |
  | `correlation.test.js` | receipt + matching envelope + state with matching IDs | `model.correlations.length >= 3` with all 3 kinds present + each has evidence |
  | `schema-drift.test.js` | envelope with `my_extra_key: 1` (rejected post-M0 Task 4a strict-validate) | `sources.envelopes.items[0].ok===false` + error mentions "unknown top-level key" + overall `sources.envelopes.ok===true` |
  | `perf-budget.test.js` | 100 receipts + 20 envelopes + 5 plans | `endMs - startMs < 1000` (NOT 5000 — give M3 budget headroom) |
- **Mirror**: `plugins/mccp/scripts/state/tests/state-writer.test.js` for tmpRepo + cleanup pattern; `plugins/mccp/scripts/receipt/tests/schema.test.js` for assertion style.
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/` exit 0.

### Task 13: tests/no-new-deps.test.js — dep boundary check

- **Action**: Create dedicated test asserting M1 introduces no new npm dep. Approach:
  - Spawn `node` child with `--require ./assert-no-extra-deps.js` shim. The shim overrides `Module._resolveFilename` to whitelist: built-ins (`fs`, `path`, `crypto`, `os`, `url`, `child_process`, `module`, `node:test`, `node:assert`) + any path under `plugins/mccp/scripts/**`. Anything outside throws.
  - Child requires `plugins/mccp/scripts/derive/index.js` and calls `derive(repoRoot)` on an empty tmp dir. If any forbidden resolve fires, child exits non-zero.
  - Test asserts child exit code === 0.
- Rationale: PRD MVP says "새 npm 의존성 0". Future contributors adding `chalk`/`yargs`/etc. break the test, not the user.
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/no-new-deps.test.js` exit 0.

### Task 14: PRD milestone row flip

- **Action**: Edit `.claude/prds/v1-3-0-observability-surface-ii.prd.md` Delivery Milestones row 1:
  - Status: `pending → in-progress`
  - Plan cell: `—` → `[v1-3-0-observability-m1-derive-engine.plan.md](../plans/v1-3-0-observability-m1-derive-engine.plan.md)`
- No body amend (M0 already handled the stale-identifier rewrite for the entire PRD).
- **Mirror**: M0 Task 8 pattern (only row flip, not body amend, because M1 doesn't surface new corrections).
- **Validate**: `grep -q "1 | Derive engine | .* | in-progress" .claude/prds/v1-3-0-observability-surface-ii.prd.md`

### Task 15: CLAUDE.md — register derive entry point

- **Action**: Edit `CLAUDE.md`:
  1. §1.4 table — append row after the v1.2.0-m1 row:
     `| **derive engine (v1.3.0-m1)** | plugins/mccp/scripts/derive/* — .claude/ 7 source (plans/receipts/STATE/backlog/fix-task/PR/envelopes)를 단일 normalized model로 통합. read-only, LLM-free, dep-free. M2 briefing stamp + M3 STATUS.md renderer가 input으로 소비. | v1.3.0-m1 ship |`
  2. §5 (모르거나 막힐 때) — append:
     `6. plugins/mccp/scripts/derive/index.js — .claude/ 통합 모델 derive 진입점. 7 source. M0 schema-surface.md 가정 동기.`
- **Mirror**: M0 Task 7 pattern.
- **Validate**: `grep -q "derive engine (v1.3.0-m1)" CLAUDE.md && grep -q "plugins/mccp/scripts/derive/index.js" CLAUDE.md`

### Task 16: validation pass

- **Action**: Run the full new suite + existing receipt/state/lib suites + a smoke derive run against this repo:
  ```bash
  node --test plugins/mccp/scripts/derive/tests/
  node --test plugins/mccp/scripts/receipt/tests/
  node --test plugins/mccp/scripts/state/tests/
  node --test plugins/mccp/scripts/lib/tests/
  node plugins/mccp/scripts/derive/cli.js run --json > /tmp/derive-out.json
  node -e "const m=JSON.parse(require('fs').readFileSync('/tmp/derive-out.json'));console.log(JSON.stringify({plans:m.sources.plans.count,receipts:m.sources.receipts.count,envelopes:m.sources.envelopes.count,correlations:m.correlations.length},null,2))"
  ```
- **Validate**: All test suites exit 0. Smoke run prints non-zero plans + receipts (this repo has many) + envelopes:0 (verified during grounding) + correlations:>=0 (could be 0 if no receipt currently carries `ipc_envelope_path`).

## Validation

```bash
# New derive test suite
node --test plugins/mccp/scripts/derive/tests/

# Existing suites must remain green (M1 is read-only + additive)
node --test plugins/mccp/scripts/receipt/tests/
node --test plugins/mccp/scripts/state/tests/
node --test plugins/mccp/scripts/lib/tests/

# Smoke derive run against this repo (should succeed)
node plugins/mccp/scripts/derive/cli.js run --json | head -50

# Dep boundary
node --test plugins/mccp/scripts/derive/tests/no-new-deps.test.js

# Perf budget (separately invocable for diagnosis)
node --test plugins/mccp/scripts/derive/tests/perf-budget.test.js

# PRD row flipped
grep -q "Derive engine" .claude/prds/v1-3-0-observability-surface-ii.prd.md
grep -q "v1-3-0-observability-m1-derive-engine" .claude/prds/v1-3-0-observability-surface-ii.prd.md

# CLAUDE.md updated
grep -q "derive engine (v1.3.0-m1)" CLAUDE.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ~~M1 implemented before M0 docs ship → derive code re-derives schema surface via grep, drifts from M0 declarations~~ **CLOSED 2026-06-17** (M0 ship PR #31) | n/a | M0 docs (`schema-surface.md` + `state-md-naming-reconciliation.md`) are LIVE on `main`. derive plan now treats them as binding sources (see Patterns to Mirror). `capability.js` runtime probe is still kept as defense-in-depth in case a fork re-introduces the regression. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| ~~M0's strict envelope-validate (Task 4a) lands AFTER some envelopes are written with extra fields → all such envelopes flagged invalid~~ **CLOSED 2026-06-17** (M0 ship + grounding-verified zero pre-M0 envelopes) | n/a | M0 Task 4a landed with `dispatch-envelope-forward-compat.test.js` (5 tests green). Pre-M0 envelopes don't exist (`dispatches/` still missing — re-verified during this re-review). New writers post-M0 honor `KNOWN_KEYS`. `tests/schema-drift.test.js` still gates the regression path. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| **Receipt field-name drift** — plan's first draft used `dispatched_by_controller_session` (no `_id`); schema.js uses `dispatched_by_controller_session_id`. Typo → every receipt evaluates as falsy → correlation Kind 1 silently emits 0 entries; dashboard's worker fanout renders empty even with active controller | Was High during plan review (this re-review caught it) | **Resolved in plan v2** (Task 3 + Task 9 Kind 1 + Summary "Schema-surface §2.4 field-name fix" bullet). `tests/correlation.test.js` MUST include a fixture with a real receipt carrying populated v1.2.0-m1 attribution fields and assert correlation Kind 1 emits at least one entry — without that assertion, the typo could re-creep in. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| **Receipt meta surface drift** — schema-surface §2.3 names 5 present-only fields (`codex_disabled_at_pr`, `codex_review_actionable_findings`, `deferred_findings_count`, `plan_conflict_escalated`, `pr_phase_lock_stale_reclaimed_at_hook`) that plan v1 omitted from extract block. M3 dashboard's audit timeline / escalation badge needs these as raw input | Medium (closes in plan v2) | Task 3 extract block now lists all 5 + cross-reference to schema-surface §2.3 row. Acceptance bullet added. Any future schema-surface field addition triggers a follow-up Task 3 patch. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| **fix-task read API mismatch** — plan v1 assumed `fixTask.read(repoRoot)` returns `{title, why, failures, verdict, ttl_expires_at, body_hash}`; actual return is `string | null`. Implementer following plan v1 would throw at runtime on field access | Was High (this re-review caught it) | **Resolved in plan v2** (Task 6 rewrite: `read()` → raw string, then `parseFixTaskMd(raw) → {frontmatter, body}`). Corrupt-fix-task fixture added to Validate step. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| plan_hash correlation (Task 9 kind 4) requires hashing every plan file → perf budget concern on 50+ plans | Low (was Medium) | **Codex F1 absorption** — replaced substring-prefilter mitigation (which silently lost correctness — Codex found real receipts that prefilter would have missed) with **one-pass hash index**: hash every plan ONCE per derive call (5 plans × ~5ms = ~25ms), then O(1) Map lookup per receipt. 100 receipts × O(1) lookup = negligible. Cross-call cache (path/size/mtimeMs) is optional future opt-in. `perf-budget.test.js` (5 plans + 100 receipts) gates the budget; `tests/correlation.test.js` includes a fixture where decision_id intentionally does NOT substring-match plan slug → asserts the link still found. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Correlation algorithm too tight — link_via mismatch breaks on Windows path separators | Medium | All path comparisons normalize via `path.posix.join` for ENVELOPE_PATH_RE matching (which uses `/`) and `path.normalize` for fs probes. `tests/correlation.test.js` runs Windows-style paths through. v1.0.1 axis K already mandates CRLF + path-sep tolerance for the broader codebase (W11 rubric). |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| derive accidentally reads `/ECC/` tree → fork-tree data leaks into model | Low | All source readers root at `path.join(repoRoot, '.claude', ...)`. `/ECC/` is sibling, never under `.claude/`. Grep test: `grep -r "ECC" plugins/mccp/scripts/derive/` should yield 0 hits. Test added as part of validation pass. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| New npm dep snuck in by future contributor → CI green but bundles bloat | Medium | `tests/no-new-deps.test.js` (Task 13) statically asserts no external require resolves. Fails fast on any addition. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| ~~derive output JSON leaks absolute paths (incl. `meta.cwd`) → privacy risk if user shares the output~~ **F2 absorbed**: derive emits masked-by-default. Raw mode is `--raw` opt-in with stderr WARNING. M2 LLM consumer reads masked shape. M4 layers envelope-payload + secret-pattern masking ON TOP (composable). Test `tests/mask.test.js` enforces no absolute-path strings in default JSON output. | Low (was High) | Codex F2 absorption — moved from "deferred to M4" to "M1 contract" |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| derive completes < 1s budget but JSON serialization (M3 input pipeline) is slow → 60s SLO blown elsewhere | Low | M3 plan will inherit the budget headroom (5s overall budget, M1 < 1s, M3 < 4s for parse+render). Cross-milestone budget is documented in CLAUDE.md §1.4 derive row. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| receipt parse error during scan crashes derive (vs degrades gracefully) | Low | Task 3 explicitly catches `RECEIPT_PARSE_ERROR` per-entry and pushes `{ok:false, error}` instead of throwing. Test `mccp-fixture.test.js` extension: write one valid + one syntactically broken receipt → assert overall scan ok + 1 item ok + 1 item ok:false. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| envelope heartbeat probe (Task 8) fails on non-Windows but works on Windows or vice versa due to fs.statSync semantics | Low | `fs.statSync` is cross-platform; mtime in ms epoch is the same. Tests in `correlation.test.js` use `fs.utimesSync` to set a known mtime; that's also cross-platform. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| M2 (briefing stamp) ships before adding `meta.briefing_summary` to schema.js → M2 receipts validate via "silently ignored unknowns" path → derive can't surface them | Medium | This is the M2 prerequisite already flagged in M0 plan's schema-surface.md §6. M1 derive's `receipts.js` is forward-prepared: it will silently ignore the field (no read attempt). M2 plan must include a schema.js field-add task PLUS a derive update task (add `briefing_summary` to the extract block). M0 prerequisite naturally cascades to M2 plan. |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance

- [ ] `plugins/mccp/scripts/derive/index.js` exists with `derive(repoRoot, opts)` exported; calls capability probe + sources + correlate + mask
- [ ] `plugins/mccp/scripts/derive/model.js` exports `emptyModel`, `validateShape`, `markDegraded`, `MODEL_VERSION='v1'`; per-source `invalid_count`/`degraded` fields present
- [ ] `plugins/mccp/scripts/derive/mask.js` exports pure `maskModel(model, repoRoot)`; idempotent; default for `run --json` (Codex F2 absorption)
- [ ] `plugins/mccp/scripts/derive/capability.js` exports `probeM0SchemaContract()`; result attached to `model.m0_capability` (Codex F4 absorption)
- [ ] All 7 source files under `plugins/mccp/scripts/derive/sources/` exist with `scanX(repoRoot) → { ok, ... invalid_count, degraded, ... }` contract
- [ ] `plugins/mccp/scripts/derive/correlate.js` pure function emitting 6 correlation kinds with `evidence: []`; plan_hash uses one-pass hash index (Codex F1 absorption); `tests/correlation.test.js` covers the slug-divergent fixture Codex flagged
- [ ] `plugins/mccp/scripts/derive/cli.js` runnable: `node plugins/mccp/scripts/derive/cli.js run --json` emits masked valid JSON; `--raw` flips to unmasked + stderr WARNING; `--strict` exits 1 on capability fail
- [ ] All 9 test fixtures green: `empty-repo`, `mccp-fixture`, `envelope-absent`, `correlation`, `schema-drift`, `perf-budget`, `mask`, `capability`, `no-new-deps`
- [ ] `tests/correlation.test.js` includes a v1.2.0-m1 attribution fixture with populated `meta.dispatched_by_controller_session_id` (with `_id` suffix per schema-surface §2.4) and asserts correlation Kind 1 emits ≥1 entry — guards the field-name typo regression
- [ ] Task 3 receipt extract block surfaces all 5 v0.2.8-v1.0.1 present-only meta fields (`codex_disabled_at_pr`, `codex_review_actionable_findings`, `deferred_findings_count`, `plan_conflict_escalated`, `pr_phase_lock_stale_reclaimed_at_hook`) per schema-surface §2.3
- [ ] Task 6 `fix-task.js` honors `read() → string | null` + `parseFixTaskMd(raw) → {frontmatter, body}` two-step contract; corrupt-fix-task fixture asserts `ok: false`
- [ ] Existing receipt/state/lib test suites remain green (zero regressions)
- [ ] Perf budget test asserts < 1000ms on 100-receipt fixture
- [x] M0 prerequisite docs SHIPPED 2026-06-17 (PR #31): `docs/v1.3.0-observability/schema-surface.md` + `state-md-naming-reconciliation.md` on `main` — verified via `git log -- docs/v1.3.0-observability/`
- [ ] PRD Delivery Milestones row 1 Status = `in-progress` and Plan cell links to this plan
- [ ] CLAUDE.md §1.4 has v1.3.0-m1 derive engine row; §5 references derive/index.js as new entry 6 (M0 ship already populated entry 5 with `schema-surface.md`)
- [ ] No mutations to `schema.js`, `state-writer.js`, `dispatch-envelope.js`, `receipt/store.js`, or any existing receipt JSON
- [ ] Zero new npm dependencies introduced (verified by `no-new-deps.test.js`)
- [ ] derive output is read-only — no `.claude/cache/` write (that's M3+M4 scope)
- [ ] derive does NOT call any LLM (that's M2 scope)
- [ ] Privacy mask applied at M1 by default (Codex F2 absorption — M4 composes envelope-payload + secret-pattern masking ON TOP)

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review --impeccable-available` (fail-closed Bash wrapper, v0.2.2; design-scope preamble active since impeccable Skill is available — v0.3.6 축 1)
- 라운드 수: 1 (R2 escalation 조건 미충족 — 3 finding 중 HIGH 1건 + MEDIUM 2건만, 모두 R1에서 plan amendment로 흡수됨; ACCEPT_NOW HIGH 미해소 잔여 0)
- 합치 결론: verdict=`needs-attention`. 3 findings 모두 plan-level 흡수 완료. plan v2 → plan v3 transitions: (a) Task 3 extract block에 schema-surface §2.3 잔여 3개 필드(`codex_skip_reason`, `codex_design_scope_excluded`, `dropped_findings_digest`) 추가 + present-only 필드에 대해 `!!`/`|| 0` coercion 제거하고 raw `undefined | bool | number` 전달(absence vs explicit-false 보존), (b) Task 6 fix-task contract를 실 코드(`parseFixTaskMd → {fm, body} | null`, `fm.expires_at`, `bodyHash()` 별도 호출) 기준으로 재작성, (c) Task 9 Kind 1 correlation에 **3-way UUID equality**(ipc_envelope_path UUID == receipt.worker_dispatch_id == envelope.dispatch_id) + `receipt.dispatched_by_controller_session_id === envelope.controller_session_id` explicit guard 추가, negative correlation fixture 2종(path-content mismatch + controller-session mismatch).
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1: Receipt extract is not schema-complete and collapses absent fields | MEDIUM (0.90) | **ACCEPT_NOW** | schema-surface §2.3 binding 직접 확인 결과 plan v2가 3개 필드(`codex_skip_reason`/`codex_design_scope_excluded`/`dropped_findings_digest`) 누락. 또한 `!!`+`\|\| 0` coercion이 v0.2.x receipt(필드 자체 미기록)와 v0.3.x receipt(필드 false/0 명시 기록)을 dashboard에서 동일하게 보이게 만들어 M3가 schema-era 인식 못 함. 흡수: Task 3 extract block에 누락 3개 + present-only 필드를 raw pass-through(`meta.X === undefined ? null : meta.X` 패턴)로 변경. |
  | F2: Fix-task parse contract does not match the actual API | HIGH (0.97) | **ACCEPT_NOW** | 실 코드 확인: `parseFixTaskMd(raw) → {fm, body} \| null` (frontmatter 키가 아니라 **`fm`**, broken frontmatter 시 throw 안 하고 `null` 반환). frontmatter 필드명은 `expires_at` (NOT `ttl_expires_at`), `body_hash`는 frontmatter에 없고 `bodyHash(body)` 별도 호출. 흡수: Task 6 본문을 실 contract로 재작성(`null` 반환 path는 corrupt-fixture 시 `ok:false`, expected-parser-error만 catch하고 그 밖의 throw는 propagate). |
  | F3: Envelope correlation cross-check is incomplete | MEDIUM (0.78) | **ACCEPT_NOW** | Kind 1 evidence는 controller_session match를 claim하는데 실제 guard는 worker_dispatch_id 한 축만 보고 있음. 복사된 envelope이 stale controller attribution으로 confident link 생성 가능. 흡수: Kind 1을 3-way UUID equality(path UUID == worker_dispatch_id == envelope.dispatch_id) + controller_session_id explicit equality로 강화. `tests/correlation.test.js`에 negative fixture 2종(path-content mismatch + controller-session mismatch) 추가. |

- Deferred to backlog: 0 → no append to `.claude/plans/codex-findings-backlog.md`
- Open Questions: none — all 3 findings resolved in-plan via R1 absorption (auto-CRITICAL catalog 미해당)
- Codex session 참조: threadId `019ed43a-305e-7382-bd0a-a91f467e9b13` (durationMs 327643)

## Codex Adversarial Review (v1 — superseded)

> 본 섹션은 plan v1 작성 시점(2026-06-16)의 Codex R1 결과 audit 보존본입니다.
> M0 ship 이후 plan을 갱신(plan v2)했으므로 위 새 섹션의 신규 Codex 결과가 binding입니다.

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review --impeccable-available` (fail-closed Bash wrapper, v0.2.2; design-scope preamble active since impeccable Skill is available — v0.3.6 축 1)
- 라운드 수: 1 (R2 escalation 조건 미충족 — 4 ACCEPT_NOW HIGH/MEDIUM findings 모두 R1에서 plan amendment로 흡수됨)
- 합치 결론: needs-attention 4 finding 모두 plan-level 흡수 완료. 흡수 후 plan은 (a) plan_hash correlation 정확성 보존 (substring-prefilter 제거, one-pass hash index 도입), (b) path masking을 M1 contract로 끌어옴 (M4 deferral 제거 — M2 LLM consumer는 masked shape만 받음), (c) envelope source가 schema drift에 loud-fail-open (degraded flag + invalid_count + model.warnings), (d) M0 schema contract를 runtime capability probe로 검증 (doc-existence acceptance gate에 더해).
- Codex session 참조: threadId `019ed341-1e96-7821-9079-62a18ffe9a9a` (durationMs 453220)

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (round=1, converged=true, 3 findings ACCEPT_NOW absorbed in plan v3 + 4 findings absorbed in plan v1 — both audit-preserved above). No new implement-time decisions detected — Task 1–16 architecture (`derive/` namespace, 7 source readers, 6 correlation kinds, mask + capability + cli, 9 test fixtures, no-new-deps boundary, masking-by-default, runtime capability probe, plan_hash one-pass index, 3-way UUID equality) all pre-specified in plan body. Files-to-change list identical to planned set; no source-tree expansion at implement time. Cross-gate dedupe applied per Phase 2.5.1 (plan-codex receipt `.claude/receipts/mccp-plan-codex/v1-3-0-observability-m1-derive-engine.json` is approving and chained to this plan_hash).
