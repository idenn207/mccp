# Plan: v1.3.0 Milestone 2 — LLM Briefing Stamp + Cost Telemetry

**Source PRD**: [.claude/prds/v1-3-0-observability-surface-ii.prd.md](../prds/v1-3-0-observability-surface-ii.prd.md)
**Selected Milestone**: 2 — LLM briefing stamp + cost telemetry (consumes M1 derive engine; produces input for M3 STATUS.md timeline)
**Complexity**: Medium (3 new schema fields + 1 new lib namespace + 1 inline trigger + 1 cost-tier guard, all additive, fail-open invariant. No new deps. Estimated 9–12 hours).

## Summary

Wire a single, capped, cost-tier-gated LLM call into the receipt write path. Each successful receipt produces a ≤200-token verdict-style "briefing summary" plus its own token-usage telemetry, all stamped into `meta.*` as three new present-only schema fields. The receipt write path remains fail-open: briefing failure never poisons receipt write. A cost-tier guard (`tierFor(cost_usd) ≥ 'notice'`) automatically disables the briefing call so the $50 cost-tier notice is the hard ceiling for self-generated LLM spend.

**M0 binding (schema-surface §6.1)**: Three new `meta.*` fields — `briefing_summary` (string \| null), `briefing_token_count` (non-negative integer \| null), `briefing_invocation_count` (non-negative integer \| null) — MUST be declared in `plugins/mccp/scripts/receipt/schema.js` (`validate()` + `makeSkeleton()`, present-only strictness) BEFORE any write path stamps them. This is Task 1 — non-negotiable per the M0 forward-compat policy.

**M1 binding (derive engine extension)**: The same three fields surface read-only through `derive/sources/receipts.js` `pick()` extract block. M2 does NOT change derive correlations or model shape — only widens the per-receipt extract by 3 keys so M3's audit-timeline renderer can read `briefing_summary` as raw input.

**LLM backend choice**: Reuse the existing `codex-invoke.js` fail-closed wrapper rather than adding a new Anthropic SDK dependency. Briefing is a degenerate adversarial-review call (1 round, capped focus, no findings table parsing). The wrapper's classification enum + advisory/disabled honor + 900s timeout already cover every failure mode v1.3.0 needs. M2 adds a thin `briefing/invoke.js` that builds the focus prompt + parses the 1-line summary out of `codex-invoke`'s stdout JSON. No `MCCP_CODEX_DISABLED` semantics are altered — env-disabled Codex correctly disables briefing too (loud zero-stamp + warning).

**Codex R1 absorptions applied** (3 findings, all ACCEPT_NOW):

- **F1 (HIGH 0.92) — receipt_hash carve-out is mechanical, not documentation-only.** Original plan documented in §2.5 that `briefing_*` fields are excluded from `receipt_hash` semantically; this leaves any consumer that calls `receiptHash(receipt) === receipt.receipt_hash` flagging every stamped receipt. Absorption: update `receipt/hash.js#receiptHash` canonicalization to strip `briefing_summary` / `briefing_token_count` / `briefing_token_estimated` / `briefing_invocation_count` from the meta block BEFORE hashing (alongside the existing `receipt_hash` strip). v0.2.x-era receipts without these keys re-hash to the identical value (exclusion of absent field is no-op). New Task 1b owns the hash.js update + tamper-detect regression test.
- **F2 (HIGH 0.90) — token telemetry counts input + output, with `estimated` flag.** Original plan estimated only `stdout.length / 4`, which can't bound input-side cost (focus prompt + receipt fields + derive correlations dominate input for tiny 1-line outputs). Absorption: token estimate is now `Math.ceil((focus.length + stdout.length) / 4)`, plus a new present-only `meta.briefing_token_estimated: boolean` flag distinguishing estimate-from-stdout from real-from-tokenUsage. Cost-tier guard's $50 notice threshold remains the indirect monthly budget enforcer — once cumulative session cost reaches notice tier, briefing self-disables until next cost-tier reset. This is documented as the budget mechanism (Risks table updated).
- **F3 (MEDIUM 0.74) — re-entrancy is mechanically guarded, not env-policy-only.** Original mitigation relied on `MCCP_CODEX_DISABLED=1` being set by callers; this is an external-ordering assumption. Absorption: cost-guard gets a new `PR_PHASE_LOCKED` reason that detects `.claude/state/pr-phase.lock` existence + active subphase=codex-review. Additionally, `briefing/index.js` carries a process-local `BRIEFING_IN_PROGRESS` flag to prevent self-recursive invocation if a future code path re-enters receipt-write inside briefing. New test asserts receipt-write under an active PR lock spawns zero codex-invoke processes.

**Boundary clarification with M1**: M1's `derive` is the *consumer* of stamped receipts; M2 is the *producer*. The two never touch the same code surface. No circular dependency.

**Post-merge bookkeeping** (Task 11): PRD M1 status row stuck at `in-progress` due to status-roll deferral (PR #33 shipped 2eb0367 but PRD row didn't move). M2 plan absorbs the roll so PRD is consistent after this milestone lands. `plugin.json` is already at `1.3.0` (verified Phase 2 grounding) so no version bump in this milestone.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Schema bump shape | `plugins/mccp/scripts/receipt/schema.js:291-339` (deferred_findings_count, design_findings_dropped) | Present-only `meta.*` field with `Number.isInteger && >= 0` validator. Backwards-compat: old receipts without the key still validate. |
| Inline write-path trigger | `plugins/mccp/scripts/receipt/write.js:279-313` (`triggerEscalateIfNeeded`) | Wired into `write()` AFTER `writeReceipt()`. Fail-open: catch all, stderr log, never propagate. Receipt write itself is unaffected. |
| Cost-tier guard | `plugins/mccp/scripts/state/breakpoint-detector.js:64-150` (`detect`) + `lib/cost-state.js:36-43` (`tierFor`) | Read `cost-state.readState()` + `tierFor(cost_usd)`. If tier ≥ 'notice' → skip + canonical skip reason. Same vocabulary as auto-handoff. |
| LLM wrapper invocation | `plugins/mccp/scripts/lib/codex-invoke.js:113-280` (invokeAdversarialReview-style spawn) | `spawnSync(node, [companion, ...])` + classification enum + JSON stdout. Reuse the existing wrapper; do NOT shell out to a new Anthropic SDK. |
| Receipt extract widen | `plugins/mccp/scripts/derive/sources/receipts.js` (Task 3 `pick(meta, k)` block, M1 ship) | Add 3 `pick(meta, 'briefing_*')` lines in the same block. v0.2.x-era receipts (absent keys) emit `undefined`; M2-era stamped receipts emit values. M1's contract preserved verbatim. |
| Module export style | `plugins/mccp/scripts/lib/codex-invoke.js:520-540` | `module.exports = { ... }` flat surface, no default. |
| Tests | `plugins/mccp/scripts/receipt/tests/schema.test.js` + `plugins/mccp/scripts/derive/tests/mccp-fixture.test.js` (M1 ship) | Node native `node:test` + `os.tmpdir()` fixtures + `assert.strictEqual`. Briefing tests inject the codex-invoke spawn via opts (no real Codex spawn in CI). |
| Hook trace + loud-fail-open | `plugins/mccp/scripts/lib/hook-trace.js` + [[feedback-loud-fail-open]] | Briefing failure: stderr `[mccp:briefing]` prefix + receipt's `briefing_summary=null` + `briefing_invocation_count` still incremented + zero token count. Never silent. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | Add **4** present-only fields (Codex R1 F2: + `briefing_token_estimated:boolean`) to `validate()` + 4 defaults to `makeSkeleton()`. Schema-surface §6.1 binding prerequisite — must land first. |
| `plugins/mccp/scripts/receipt/hash.js` | UPDATE | **Codex R1 F1 absorption** — canonicalize `briefing_summary` / `briefing_token_count` / `briefing_token_estimated` / `briefing_invocation_count` out of the `receiptHash` input alongside the existing `receipt_hash` exclusion. Backward-compat: receipts without the keys hash unchanged. |
| `plugins/mccp/scripts/lib/briefing/invoke.js` | CREATE | Pure-ish module. Single export `invokeBriefing(receipt, deriveModel, opts) → { ok, summary, tokenCount, classification, error? }`. Wraps `codex-invoke.adversarialReview` with a capped focus prompt (≤200 tokens output target). |
| `plugins/mccp/scripts/lib/briefing/cost-guard.js` | CREATE | Single export `shouldSkipBriefing(opts) → { skip, reason, tier }`. Reads `cost-state.readState()` + `tierFor()` + **Codex R1 F3 absorption**: probes `<repoRoot>/.claude/state/pr-phase.lock` existence and active subphase. Returns `skip: true` when `tier ∈ {notice, warning, critical}` OR `MCCP_BRIEFING === 'off'` OR `MCCP_CODEX_DISABLED === '1'` OR PR-phase lock active with subphase=codex-review. |
| `plugins/mccp/scripts/lib/briefing/index.js` | CREATE | Public facade. Single export `triggerBriefing(repoRoot, receipt, receiptPath, opts) → void`. Composes cost-guard + invoke + receipt re-stamp. Catches every exception, stderr-logs, returns. Used by `receipt/write.js`. |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | After `writeReceipt(...)` returns + `triggerEscalateIfNeeded(...)` runs, call `triggerBriefing(...)` inside same try/catch shape. Order matters: escalate fires first (existing receipt is the audit trail), briefing fires after (re-reads receipt from disk to avoid mutating stale in-memory copy). |
| `plugins/mccp/scripts/derive/sources/receipts.js` | UPDATE | Widen the `pick(meta, ...)` extract block by 3 keys. Single-line additions matching M1's Codex R1 F1 absorption pattern (no `!!` coercion). |
| `plugins/mccp/scripts/receipt/tests/briefing-fields.test.js` | CREATE | Schema-level: assert receipts with valid `meta.briefing_*` validate; receipts with malformed (non-integer count, non-string summary) reject. Backward-compat: receipts without the keys still validate. |
| `plugins/mccp/scripts/lib/briefing/tests/cost-guard.test.js` | CREATE | Inject `cost-state.readState` via opts. Assert: green tier → no skip; notice/warning/critical → skip with canonical reason; missing cost-state → no skip (briefing defaults to running when telemetry absent — fail-open). `MCCP_BRIEFING=off` → skip regardless of tier. |
| `plugins/mccp/scripts/lib/briefing/tests/invoke.test.js` | CREATE | Inject the codex-invoke spawn shim via opts. Three paths: (a) classification=ok with valid stdout → returns parsed 1-line summary + token count from stdout; (b) classification=disabled → returns `{ ok: true, summary: null, tokenCount: 0, classification: 'disabled' }` (graceful no-op, not failure); (c) classification=timeout → returns `{ ok: false, summary: null, classification: 'timeout' }`. |
| `plugins/mccp/scripts/lib/briefing/tests/index.test.js` | CREATE | End-to-end with fs fixture: write a receipt via `receipt/write`, assert briefing re-stamp updates the on-disk receipt (re-read + verify `meta.briefing_summary` non-null). Cost-guard fixture sets tier='notice' → assert no LLM spawn (assertSpyCalls(spawnShim, 0)) and `meta.briefing_summary=null` + `meta.briefing_invocation_count=0`. |
| `plugins/mccp/scripts/derive/tests/briefing-surface.test.js` | CREATE | Synthesize a fixture receipt with `meta.briefing_summary="next: review M3"` + `meta.briefing_token_count=180`. Assert derive `sources.receipts.items[0]` contains the 3 keys with raw values preserved (no `!!`/`|| 0` collapse). |
| `.claude/prds/v1-3-0-observability-surface-ii.prd.md` | UPDATE | Two row state changes: row 1 (Derive engine) `in-progress → complete` + Plan link to `completed/v1-3-0-observability-m1-derive-engine.plan.md`; row 2 (LLM briefing stamp + cost telemetry) `pending → in-progress` + Plan cell link to this plan file. No body amendments. |
| `CLAUDE.md` | UPDATE | §1.4 table: append `v1.3.0-m2 briefing stamp + cost telemetry` row mirroring m0/m1 rows. §4 "운영 토글" block: add `MCCP_BRIEFING=on\|off\|auto` (default: `auto`) + `MCCP_BRIEFING_MODEL` + brief description of `MCCP_BRIEFING_AUTODISABLE_TIER` override. |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | §2.3 (present-only fields) table: add 3 new rows for `briefing_summary` / `briefing_token_count` / `briefing_invocation_count` with introducing version `v1.3.0`. §6.1 (M2 prerequisite) row: append "STATUS: implemented in v1.3.0-m2 — see `briefing/index.js`". This is bookkeeping; the doc continues to describe the live read-side surface. |

**No mutations** to: `plugins/mccp/scripts/lib/codex-invoke.js` (consumed read-only — briefing is a degenerate caller, no semantic change), `plugins/mccp/scripts/derive/index.js` or any other derive source (M1 derive surface unchanged), `plugins/mccp/scripts/state/breakpoint-detector.js` (consumed via cost-state, never edited), `plugins/mccp/scripts/lib/cost-state.js` or `cost-thresholds.js` (canonical source of cost tiers — never duplicated).

## Tasks

### Task 1: schema.js — 4 new present-only meta fields (BLOCKING PREREQUISITE)

- **Action**: Edit `plugins/mccp/scripts/receipt/schema.js`:
  - Inside `validate()` `meta` block (around line 339, after `plan_conflict_escalated`):
    ```js
    if (m.briefing_summary !== null && m.briefing_summary !== undefined) {
      req(typeof m.briefing_summary === 'string' && m.briefing_summary.length > 0
          && m.briefing_summary.length <= 1024,
        'meta.briefing_summary must be a non-empty string ≤1024 chars or null');
    }
    if (m.briefing_token_count !== null && m.briefing_token_count !== undefined) {
      req(Number.isInteger(m.briefing_token_count) && m.briefing_token_count >= 0,
        'meta.briefing_token_count must be a non-negative integer or null');
    }
    if (m.briefing_token_estimated !== undefined) {
      req(typeof m.briefing_token_estimated === 'boolean',
        'meta.briefing_token_estimated must be a boolean if present');
    }
    if (m.briefing_invocation_count !== null && m.briefing_invocation_count !== undefined) {
      req(Number.isInteger(m.briefing_invocation_count) && m.briefing_invocation_count >= 0,
        'meta.briefing_invocation_count must be a non-negative integer or null');
    }
    ```
  - Inside `makeSkeleton()` `meta` default block (around line 482, after `ipc_envelope_path: null`):
    ```js
    // v1.3.0-m2 — LLM briefing stamp + token telemetry. Present-only.
    // Stamped by lib/briefing/index.js after receipt write. Null when cost-tier
    // guard skipped the call or LLM classification != 'ok'.
    // briefing_token_estimated=true means token_count was derived from
    // (focus.length + stdout.length)/4; =false means real tokenUsage from
    // codex-companion (not currently emitted as of v1.3.0). Codex R1 F2.
    briefing_summary: null,
    briefing_token_count: null,
    briefing_token_estimated: false,
    briefing_invocation_count: null,
    ```
  - **Cap rationale**: 1024 chars maps to ~256 tokens (4 chars/token avg). PRD targets ≤200 tokens; the cap is 1.25× slack so a slightly chatty model still validates. Empty string explicitly rejected — null is the canonical "no briefing" state.
- **Mirror**: `schema.js:291-294` (deferred_findings_count present-only integer pattern) + `schema.js:336-339` (plan_conflict_escalated present-only boolean pattern).
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/briefing-fields.test.js` — 8 assertions: (a) valid summary+counts+estimated pass; (b) summary>1024 chars rejects; (c) summary=empty-string rejects; (d) token_count negative rejects; (e) token_count fractional rejects; (f) token_estimated non-boolean rejects; (g) v0.2.x-era receipt without keys passes (backward compat); (h) `briefing_token_estimated=true` + `briefing_token_count=null` legal combo passes (skipped path).

### Task 1b: hash.js — exclude briefing_* from receiptHash canonicalization

- **Action**: Edit `plugins/mccp/scripts/receipt/hash.js`. Find the `receiptHash` function (the canonicalization that strips `receipt_hash` before hashing). Extend the strip set to also remove `meta.briefing_summary` / `meta.briefing_token_count` / `meta.briefing_token_estimated` / `meta.briefing_invocation_count` before hashing.
  ```js
  // Pseudo-shape (adapt to the actual hash.js structure observed in implement phase):
  function receiptHash(receipt) {
    const clone = JSON.parse(JSON.stringify(receipt));
    delete clone.receipt_hash;
    // v1.3.0-m2 — briefing fields are stamped AFTER hash is finalized
    // (Task 5 wires triggerBriefing post-write). Excluding them from the
    // canonical hashed body lets briefing land without invalidating the
    // tamper-detect digest. Codex R1 F1.
    if (clone.meta) {
      delete clone.meta.briefing_summary;
      delete clone.meta.briefing_token_count;
      delete clone.meta.briefing_token_estimated;
      delete clone.meta.briefing_invocation_count;
    }
    return jcs.canonicalSha256(clone);
  }
  ```
- **Backward-compat invariant**: receipts written before v1.3.0-m2 lack these keys; the `delete` calls are no-ops on absent properties so the hash is bit-identical to its pre-v1.3.0-m2 value. Receipts written by v1.3.0-m2+ retain a stable hash before AND after briefing stamp because the hash never observes the stamp.
- **Mirror**: `receipt/hash.js#receiptHash` existing strip of `receipt_hash` field.
- **Validate**: New test `plugins/mccp/scripts/receipt/tests/hash-briefing-exclusion.test.js`:
  - (a) Compute `receiptHash(R1)` where R1 lacks all briefing keys. Stamp briefing fields into R1. Compute `receiptHash(R1')`. Assert both identical.
  - (b) v0.2.x-era fixture receipt: hash before v1.3.0-m2 (golden file in tests/fixtures) === hash after v1.3.0-m2 code. Captures backward-compat bit-identity.
  - (c) Different `briefing_summary` values on otherwise-identical receipts → identical hash. Asserts briefing changes don't affect hash.

### Task 2: briefing/cost-guard.js — cost-tier × env policy × PR-phase re-entrancy decision

- **Action**: Create `plugins/mccp/scripts/lib/briefing/cost-guard.js`:
  ```js
  'use strict';

  const fs = require('fs');
  const path = require('path');
  const costState = require('../cost-state');

  // Skip reasons (canonical enum for receipt audit logs).
  const REASONS = Object.freeze({
    OK_RUN: 'ok-run',
    TIER_NOTICE: 'tier-notice',
    TIER_WARNING: 'tier-warning',
    TIER_CRITICAL: 'tier-critical',
    ENV_OFF: 'env-off',
    ENV_CODEX_DISABLED: 'env-codex-disabled',
    PR_PHASE_LOCKED: 'pr-phase-locked',  // Codex R1 F3 absorption
  });

  const AUTODISABLE_TIERS_DEFAULT = new Set(['notice', 'warning', 'critical']);

  function parseTierOverride(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') return null;
    const tiers = raw.split(',').map(s => s.trim()).filter(Boolean);
    const allowed = new Set(['green', 'notice', 'warning', 'critical']);
    for (const t of tiers) if (!allowed.has(t)) return null;
    return new Set(tiers);
  }

  // Codex R1 F3 — mechanical PR-phase guard. If pr-phase.lock exists with
  // active subphase=codex-review, briefing MUST NOT spawn a second Codex
  // process. Reading the lock JSON is best-effort; missing/corrupt lock
  // counts as "not in codex-review subphase" (fail-open).
  function isInPRCodexReviewSubphase(repoRoot) {
    if (!repoRoot) return false;
    try {
      const lockPath = path.join(repoRoot, '.claude', 'state', 'pr-phase.lock');
      if (!fs.existsSync(lockPath)) return false;
      const raw = fs.readFileSync(lockPath, 'utf8');
      const obj = JSON.parse(raw);
      // pr-phase.lock body shape (per pr-phase-lock.js): { subphase, pid, ... }
      return obj && obj.subphase === 'codex-review';
    } catch (_) {
      return false;
    }
  }

  function shouldSkipBriefing(opts) {
    const env = (opts && opts.env) || process.env;
    const repoRoot = (opts && opts.repoRoot) || null;
    const read = (opts && opts.costStateRead) || costState.readState;
    const lockProbe = (opts && opts.lockProbe) || isInPRCodexReviewSubphase;

    if (env.MCCP_BRIEFING === 'off') {
      return { skip: true, reason: REASONS.ENV_OFF, tier: null };
    }
    if (env.MCCP_CODEX_DISABLED === '1') {
      return { skip: true, reason: REASONS.ENV_CODEX_DISABLED, tier: null };
    }
    if (lockProbe(repoRoot)) {
      return { skip: true, reason: REASONS.PR_PHASE_LOCKED, tier: null };
    }

    const autoDisableTiers = parseTierOverride(env.MCCP_BRIEFING_AUTODISABLE_TIER)
      || AUTODISABLE_TIERS_DEFAULT;

    const cs = read();
    if (!cs) {
      // No telemetry = no signal. Briefing defaults to running (fail-open).
      return { skip: false, reason: REASONS.OK_RUN, tier: null };
    }
    const tier = cs.threshold_tier || costState.tierFor(cs.cost_usd);
    if (autoDisableTiers.has(tier)) {
      const r = tier === 'notice' ? REASONS.TIER_NOTICE
        : tier === 'warning' ? REASONS.TIER_WARNING
        : REASONS.TIER_CRITICAL;
      return { skip: true, reason: r, tier: tier };
    }
    return { skip: false, reason: REASONS.OK_RUN, tier: tier };
  }

  module.exports = { shouldSkipBriefing, REASONS, isInPRCodexReviewSubphase };
  ```
- **Mirror**: `state/breakpoint-detector.js:45-54` REASONS Object.freeze pattern + `:64-91` cost-state read shape. PR-phase lock body shape comes from `lib/pr-phase-lock.js`.
- **Validate**: `node --test plugins/mccp/scripts/lib/briefing/tests/cost-guard.test.js` — 9 paths: (a) MCCP_BRIEFING=off → ENV_OFF; (b) MCCP_CODEX_DISABLED=1 → ENV_CODEX_DISABLED; (c) tier=green → OK_RUN; (d) tier=notice → TIER_NOTICE; (e) tier=critical → TIER_CRITICAL; (f) no cost-state → OK_RUN (fail-open); (g) MCCP_BRIEFING_AUTODISABLE_TIER='critical' → only critical skips, notice OK_RUN; **(h) pr-phase.lock present + subphase=codex-review → PR_PHASE_LOCKED (Codex R1 F3)**; **(i) pr-phase.lock present + subphase=anything-else → OK_RUN (only codex-review blocks)**.

### Task 3: briefing/invoke.js — capped LLM call via codex-invoke

- **Action**: Create `plugins/mccp/scripts/lib/briefing/invoke.js`:
  - Single export `invokeBriefing(receipt, deriveModel, opts)`.
  - Build focus prompt from receipt + derive model:
    ```
    Briefing for receipt <gate>/<decision_id>:
    - phase: <phase>
    - converged: <bool>, rounds: <n>, open_questions: <n>
    - findings: <count> [+ severity histogram]
    - corr from derive: <up to 3 correlations involving this decision_id, masked>

    Task: write a single 1-line PM-readable verdict (≤80 chars), neutral tone,
    no marketing copy, no em dashes. Verb+object cadence ("M2 ready for PR review",
    "blocked on Codex tempfail", "next: ship after schema bump").
    Output ONLY the verdict line, no preamble.
    ```
  - Invoke via `codex-invoke.adversarialReview({ focus, timeoutMs: 60_000, json: true })`. Use a hard 60s timeout (NOT the codex 900s default — briefing must finish quick).
  - Parse stdout JSON `{ classification, durationMs, stdout: '<companion stdout>', tokenUsage?: { in, out, total } }`. Extract:
    - `classification` straight from wrapper
    - `summary` = first non-blank line of companion stdout, truncated to 1024 chars
    - **Codex R1 F2 absorption** — `tokenCount` semantics:
      - If `tokenUsage.total` present: `tokenCount = tokenUsage.total`, `estimated = false`
      - Else: `tokenCount = Math.ceil((focus.length + stdout.length) / 4)`, `estimated = true`
      - The input-side estimate is critical because briefing's whole point is short output but the FOCUS prompt (PRD-derived correlations + receipt fields) dominates billable input cost. Counting only stdout under-counts the actual billed tokens by 10x+ on cache-cold sessions.
  - Map classifications:
    - `ok` + non-empty summary → `{ ok: true, summary, tokenCount, estimated, classification: 'ok' }`
    - `disabled` → `{ ok: true, summary: null, tokenCount: 0, estimated: false, classification: 'disabled' }` (graceful, no real call happened)
    - any other → `{ ok: false, summary: null, tokenCount: 0, estimated: false, classification, error: '...' }`
  - **Indirect budget enforcement**: M2 does NOT add a per-project monthly budget enforcer (out of scope here). The cost-tier guard's $50 notice threshold (auto-handoff vocabulary) acts as the indirect budget — once cumulative session cost reaches notice, briefing self-disables until the next cost-tier reset cycle. Cost-state is the single signal source for both auto-handoff and briefing, so they cannot drift.
- **Mirror**: `lib/codex-invoke.js:113-280` (spawnSync flow for shape) + `lib/pr-phase-helpers/codex-runner.js` (classification mapping).
- **Validate**: `node --test plugins/mccp/scripts/lib/briefing/tests/invoke.test.js` — 4 paths matching mapped classification table. spawn shim injected via `opts.invoker = (focus, opts) => ({ classification: 'ok', stdout: 'M2 ready for PR review', tokenUsage: null })`.

### Task 4: briefing/index.js — facade with fail-open invariant

- **Action**: Create `plugins/mccp/scripts/lib/briefing/index.js`:
  ```js
  'use strict';

  const fs = require('fs');
  const path = require('path');

  const { shouldSkipBriefing } = require('./cost-guard');
  const { invokeBriefing } = require('./invoke');
  const { readReceipt } = require('../../receipt/store');
  const { validate } = require('../../receipt/schema');

  // Codex R1 F3 absorption — process-local re-entrancy guard. If briefing
  // is already running in this node process (e.g. invokeBriefing spawned a
  // sub-command that re-enters receipt-write), short-circuit.
  let BRIEFING_IN_PROGRESS = false;

  function logSkip(reason, decisionId) {
    process.stderr.write('[mccp:briefing] skipped reason=' + reason
      + ' decision=' + decisionId + '\n');
  }

  function logFail(message, decisionId) {
    process.stderr.write('[mccp:briefing] FAILED ' + message
      + ' decision=' + decisionId + ' (allow)\n');
  }

  function triggerBriefing(repoRoot, receipt, receiptPath, opts) {
    opts = opts || {};

    // Codex R1 F3 — process-local re-entrancy guard
    if (BRIEFING_IN_PROGRESS) {
      logSkip('reentrant-briefing-in-progress', receipt && receipt.decision_id);
      return;
    }

    try {
      BRIEFING_IN_PROGRESS = true;
      const decision = receipt.decision_id;
      const guard = (opts.guard || shouldSkipBriefing)({
        env: opts.env,
        repoRoot: repoRoot,  // Codex R1 F3 — cost-guard probes pr-phase.lock here
      });
      if (guard.skip) {
        // Stamp invocation_count=0 + summary=null so audit trail records
        // "briefing attempted, skipped by guard" not "never attempted".
        stampReceipt(repoRoot, receipt, receiptPath, {
          summary: null,
          tokenCount: 0,
          estimated: false,
          invocationCount: 0,
        });
        logSkip(guard.reason, decision);
        return;
      }

      const deriveModel = opts.deriveModel || null;  // M2 doesn't run derive
                                                     // synchronously; pass-through
                                                     // null is the steady-state.
      const result = (opts.invoke || invokeBriefing)(receipt, deriveModel, opts);
      if (!result.ok) {
        stampReceipt(repoRoot, receipt, receiptPath, {
          summary: null,
          tokenCount: result.tokenCount || 0,
          estimated: !!result.estimated,
          invocationCount: 1,
        });
        logFail('classification=' + result.classification, decision);
        return;
      }

      stampReceipt(repoRoot, receipt, receiptPath, {
        summary: result.summary,
        tokenCount: result.tokenCount,
        estimated: !!result.estimated,
        invocationCount: 1,
      });
    } catch (err) {
      // Fail-open invariant: never propagate. Receipt write is already done.
      logFail((err && err.message) || String(err), receipt && receipt.decision_id);
    } finally {
      BRIEFING_IN_PROGRESS = false;
    }
  }

  function stampReceipt(repoRoot, receipt, receiptPath, fields) {
    // Re-read from disk so we don't mutate a stale in-memory copy.
    // writeReceipt overwrites atomically; we re-validate before rewrite.
    const fresh = readReceipt(repoRoot, receipt.gate_id, receipt.decision_id);
    fresh.meta.briefing_summary = fields.summary;
    fresh.meta.briefing_token_count = fields.tokenCount;
    fresh.meta.briefing_token_estimated = !!fields.estimated;  // Codex R1 F2
    fresh.meta.briefing_invocation_count = fields.invocationCount;

    const v = validate(fresh);
    if (!v.ok) {
      // schema bump regression — surface loudly, do NOT rewrite a corrupted receipt.
      throw new Error('briefing stamp produced invalid receipt: ' +
        v.errors.join('; '));
    }
    // receipt_hash and subject_hash are intentionally NOT recomputed here:
    // hash.js (Task 1b) canonicalizes briefing_* out of the hash, so the
    // pre-stamp hash remains valid for tamper-detect consumers (Codex R1 F1).
    const json = JSON.stringify(fresh, null, 2) + '\n';
    fs.writeFileSync(receiptPath, json, 'utf8');
  }

  module.exports = { triggerBriefing };
  ```
- **Mirror**: `receipt/write.js:279-313` (`triggerEscalateIfNeeded` shape) + `receipt/store.js writeReceipt` atomic write pattern.
- **Note**: `stampReceipt` does NOT recompute `receipt_hash` or `subject_hash` after stamping. This is intentional — briefing is metadata that lands AFTER the canonical receipt is on disk; `receipt_hash` is the hash of the canonical content as it existed at gate-pass time, not at briefing-stamp time. M2 explicitly carves `briefing_*` fields OUT of the hash chain in §6.1 docs (see Task 10). Without this carve-out, every briefing stamp would invalidate the receipt's tamper-detect digest.
- **Validate**: `node --test plugins/mccp/scripts/lib/briefing/tests/index.test.js` — assert: (a) skip path stamps zeros + null summary; (b) ok path stamps summary + token count; (c) thrown exception is caught + stderr logged; (d) schema-invalid stamp throws inside `stampReceipt` but is caught by outer try (receipt left in pre-stamp state — verified via re-read).

### Task 5: write.js — wire triggerBriefing into write()

- **Action**: Edit `plugins/mccp/scripts/receipt/write.js`:
  - Import: `const briefing = require('../lib/briefing');` near the top with other requires.
  - In `write(args)` function (line 315), AFTER the existing `triggerEscalateIfNeeded` block, add:
    ```js
    try {
      briefing.triggerBriefing(built.repoRoot, built.receipt, p);
    } catch (err) {
      // triggerBriefing has its own fail-open invariant; this catch is the
      // belt-and-suspenders safety net so even a module-load failure doesn't
      // poison receipt write.
      process.stderr.write('[mccp:briefing] outer catch: ' +
        (err && err.message ? err.message : err) + ' (allow)\n');
    }
    ```
- **Ordering rationale**: Escalate fires FIRST (the receipt is the audit trail for the escalation; briefing is metadata on top). Briefing fires AFTER (re-reads the receipt from disk so it sees the canonical version + does not race with concurrent updates from escalate-detector).
- **Mirror**: `write.js:315-325` (same shape as the existing escalate trigger).
- **Validate**: `node --test plugins/mccp/scripts/lib/briefing/tests/index.test.js` (end-to-end path) — write a receipt + verify on-disk file has stamped briefing fields. Also: `node --test plugins/mccp/scripts/receipt/tests/write.test.js` should still pass unchanged (briefing failure must not break existing write tests).

### Task 6: derive/sources/receipts.js — widen pick() extract block by 3 keys

- **Action**: Edit `plugins/mccp/scripts/derive/sources/receipts.js`. Inside the existing extract block (Task 3 of M1 plan), add three lines next to the other `pick(meta, ...)` calls:
  ```js
  // v1.3.0-m2 — LLM briefing stamp + token telemetry surface.
  // M3 audit-timeline renderer consumes these read-only.
  briefing_summary: pick(meta, 'briefing_summary'),
  briefing_token_count: pick(meta, 'briefing_token_count'),
  briefing_invocation_count: pick(meta, 'briefing_invocation_count'),
  ```
- **Mirror**: M1 plan Task 3 (lines 161-186 of the M1 plan) — same `pick()` helper, same absence-preserving discipline.
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/briefing-surface.test.js` — synthesize a receipt with stamped briefing + a v0.2.x-era receipt without the keys. Assert first emits string + number, second emits `undefined` (NOT `null`, NOT `false`).

### Task 7: receipt/tests/briefing-fields.test.js — schema validation

- **Action**: Create the test file. 6 paths described in Task 1's validate section. Use `makeSkeleton({})` as the base, mutate `meta.briefing_*`, run `validate()`, assert `result.ok` + error contents.
- **Mirror**: `receipt/tests/schema.test.js` (existing test style).
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/briefing-fields.test.js` — 6 passing assertions.

### Task 8: cost-guard + invoke + index integration tests

- **Action**: Create the 3 test files under `plugins/mccp/scripts/lib/briefing/tests/`. Each file is a single `node:test` test() invocation per path described in Tasks 2-4 validate sections.
- **Fixture pattern**: For end-to-end test (`index.test.js`), use `os.tmpdir()` + `fs.mkdtempSync()` to synthesize a repo with `.claude/receipts/mccp-plan-codex/<slug>.json` + `.claude/state/cost-current.json`. Inject the `invoke` and `guard` opts so no real Codex spawn occurs.
- **Mirror**: `derive/tests/mccp-fixture.test.js` (M1 ship) — same tmpdir + mkdtempSync fixture style.
- **Validate**: `node --test plugins/mccp/scripts/lib/briefing/tests/` — all 3 files pass.

### Task 9: Manual dogfood verification

- **Action**: After Tasks 1-8 pass, manually trigger a briefing-eligible receipt write:
  ```bash
  # Synthesize cost-state at green tier for the test
  node -e "require('./plugins/mccp/scripts/lib/cost-state').writeStateMerged({cost_usd:5,threshold_tier:'green',hard_ceiling_reached:false,last_write_ts:Date.now()})"

  # Trigger the receipt write that's part of plan-codex (this very M2 plan)
  # — verify the resulting receipt has meta.briefing_summary populated
  cat .claude/receipts/mccp-plan-codex/v1-3-0-observability-surface-ii.json | grep briefing
  ```
- **Acceptance**: `briefing_summary` is non-null + ≤1024 chars; `briefing_token_count` > 0; `briefing_invocation_count === 1`. If Codex is `disabled` or unavailable in advisory mode, accept `summary=null` + `tokenCount=0` + `invocationCount=1` (graceful path).
- **Out-of-scope**: M3 timeline rendering. M2 is content-correct when the receipt has the right fields; rendering that into a STATUS.md is M3's responsibility.

### Task 10: docs/v1.3.0-observability/schema-surface.md — bookkeeping update

- **Action**: Edit the §2.3 present-only table to add 3 rows:

  | `briefing_summary` | string \| null | v1.3.0-m2 | 1-line PM verdict, ≤1024 chars. Null when cost-guard skipped or LLM classification != 'ok'. |
  | `briefing_token_count` | non-negative integer \| null | v1.3.0-m2 | Token estimate (4 chars/token fallback) or real usage if codex companion emits it. |
  | `briefing_invocation_count` | non-negative integer \| null | v1.3.0-m2 | Count of LLM call attempts per receipt (0 when guard skipped, 1 when invoked). Always 0 or 1 in v1.3 (no retry). |

  Also: §6.1 row — append "STATUS: implemented in v1.3.0-m2 (lib/briefing/index.js + schema.js bump)".

  Add new §2.5 subsection "Briefing fields and receipt_hash" with one paragraph:
  > `meta.briefing_summary` / `meta.briefing_token_count` / `meta.briefing_invocation_count` are stamped AFTER the canonical receipt is on disk and are intentionally excluded from `receipt_hash` + `subject_hash`. The hash chain captures gate-pass state; briefing is metadata-on-top. M2's `stampReceipt` rewrites the receipt JSON in place without recomputing hashes.
- **Mirror**: existing §2.3 row style — Field / Type / Introduced / Notes columns.
- **Validate**: `grep "briefing_" docs/v1.3.0-observability/schema-surface.md | wc -l` ≥ 3.

### Task 11: PRD + CLAUDE.md + memory roll

- **Action**:
  - `.claude/prds/v1-3-0-observability-surface-ii.prd.md` — Delivery Milestones table:
    - Row 1 (Derive engine): `in-progress → complete` + Plan cell link to `../PRPs/plans/completed/v1-3-0-observability-m1-derive-engine.plan.md`. This catches the PRD status that was deferred when M1 PR #33 shipped.
    - Row 2 (LLM briefing stamp + cost telemetry): `pending → in-progress` + Plan cell link to `../plans/v1-3-0-observability-m2-briefing-stamp.plan.md`.
  - `CLAUDE.md` §1.4 table: append:
    ```
    | **v1.3.0 briefing stamp (M2)** | `lib/briefing/{invoke,cost-guard,index}.js` — receipt write path stamps `meta.briefing_summary` + token telemetry. cost-tier ≥ notice 자동 disable. fail-open invariant. | v1.3.0-m2 ship |
    ```
    §4 "운영 토글" block: add new lines (preserve existing comment style):
    ```
    MCCP_BRIEFING=on|off|auto                # v1.3.0-m2 default: auto. =off → never call LLM. =on → call regardless of cost-tier (debug only). =auto → cost-tier ≥ notice 자동 disable.
    MCCP_BRIEFING_AUTODISABLE_TIER="notice,warning,critical"  # default. comma-separated tiers that auto-disable briefing under MCCP_BRIEFING=auto.
    ```
  - User-level auto-memory roll: update `mccp v1.3.0 Cycle` entry to mention M2 in-progress (Phase 4 of /mccp:plan does NOT itself roll memory; this is a Task 11 explicit step the implement phase executes).
- **Validate**: `grep -c "v1-3-0-observability-m2" .claude/prds/v1-3-0-observability-surface-ii.prd.md` ≥ 1; `grep -c "MCCP_BRIEFING" CLAUDE.md` ≥ 2.

## Validation

```bash
# All Node-native test suites must pass.
node --test plugins/mccp/scripts/receipt/tests/briefing-fields.test.js
node --test plugins/mccp/scripts/lib/briefing/tests/cost-guard.test.js
node --test plugins/mccp/scripts/lib/briefing/tests/invoke.test.js
node --test plugins/mccp/scripts/lib/briefing/tests/index.test.js
node --test plugins/mccp/scripts/derive/tests/briefing-surface.test.js

# Existing suites must not regress.
node --test plugins/mccp/scripts/receipt/tests/
node --test plugins/mccp/scripts/derive/tests/
node --test plugins/mccp/scripts/state/tests/

# Manual dogfood (Task 9) — verify the receipt produced by THIS very plan's
# plan-codex gate has briefing_summary populated.
cat .claude/receipts/mccp-plan-codex/v1-3-0-observability-surface-ii.json \
  | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log({summary:r.meta.briefing_summary,tc:r.meta.briefing_token_count,ic:r.meta.briefing_invocation_count})'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Briefing LLM call adds wall-clock latency to every `receipt-write` (UX regression on otherwise instant CLI) | High | 60s hard timeout in `invoke.js`. Cost-guard skips on tier ≥ notice. Future M2.x: make the call async/queue-based (out of scope here, captured as v1.3.0 backlog candidate). |
| `codex-companion.mjs` does not currently emit `tokenUsage` in stdout — token telemetry is a `stdout.length / 4` estimate, which under-counts on cache-heavy calls | Medium | Estimate is documented in Task 3 + §6 schema-surface. Audit trail logs "estimate vs real" flag once codex companion bumps to emit real usage. Acceptable for M2's "monthly cost ≤ $5" SLO because briefing is gated to ≤200 output tokens. |
| Briefing prompt + Codex stop-review-gate interaction — briefing fires from inside `receipt-write`, which may itself be inside `/mccp:plan` Codex-review subphase. Recursive Codex invocation = lock contention | Medium | Cost-guard SHORT-CIRCUITS on `MCCP_CODEX_DISABLED=1` (Phase 3.5 of `/mccp:pr` already sets this). For other commands, briefing is at a different subphase (receipt-write happens AFTER any in-flight Codex review for THIS receipt is complete), so re-entrancy is bounded. Validate via end-to-end test on PR phase. |
| Receipt re-write after stamping briefing leaves `receipt_hash` stale (post-stamp content hash != stored receipt_hash) | High | Documented in Task 4 "stampReceipt" rationale + Task 10 §2.5 docs. `receipt_hash` is intentionally frozen at gate-pass time; briefing is metadata-on-top. Tamper-detection consumers must check `receipt_hash` against the non-`briefing_*` subset of meta. |
| Test fixtures spawn real `codex-companion.mjs` in CI → flaky / slow | High | All tests inject the LLM invoker via opts. Real-spawn smoke test is opt-in via env (`MCCP_BRIEFING_LIVE_SMOKE=1`) for local dogfood, not CI. |
| Stamping briefing fields invalidates schema for receipts written by older mccp versions in mixed-version environments (different user updates plugin mid-cycle) | Low | Backward-compat invariant: missing `briefing_*` keys validate fine (present-only). Forward-compat: stamped `briefing_*` keys also validate fine on a *new* mccp reading them. Only fragile path is OLD mccp reading NEW stamped receipt — that emits unknown-meta-key silent ignore, which is the documented v0.x semantic. Fully tolerant. |
| Briefing prompt leaks unmasked path / secret material from receipt to external LLM provider | Medium | `invokeBriefing` passes only `gate / decision_id / phase / converged / counts` (numeric+enum + slugs). Decision slug is repo-relative kebab-case — never an absolute path. Derive model parameter is masked-by-default in M1; M2 reuses the masked view. No `meta.cwd` / `repo_root` ever reaches the prompt. |
| Brief summary contains hallucinated PR numbers or commit SHAs that mislead PM in M3 dashboard | High | Prompt explicitly constrains to "verb+object cadence" (PRD design direction) and "no marketing copy". M3 renderer (out of scope) will add "briefing is summary not source-of-truth" footer disclaimer. M2 owns only the field. |

## Acceptance

- [ ] Task 1 schema bump merged: 3 new present-only fields in `validate()` + `makeSkeleton()` with backward-compat for old receipts.
- [ ] Tasks 2-4 briefing module landed under `plugins/mccp/scripts/lib/briefing/` with `cost-guard.js`, `invoke.js`, `index.js`.
- [ ] Task 5 `write.js` wired with fail-open trigger after `triggerEscalateIfNeeded`.
- [ ] Task 6 `derive/sources/receipts.js` extract block widened by 3 keys (M1 pick() contract preserved).
- [ ] Tasks 7-8 all 5 test files pass; existing receipt + derive + state suites unchanged.
- [ ] Task 9 dogfood: this very plan's plan-codex receipt has `briefing_*` populated (or null+0+1 in graceful-skip path).
- [ ] Task 10 schema-surface.md §2.3 + §6.1 + new §2.5 rows landed.
- [ ] Task 11 PRD M1 row→complete + M2 row→in-progress; CLAUDE.md §1.4 + §4 toggle additions.
- [ ] `plugin.json` version already at `1.3.0` (confirmed Phase 2 grounding) — no bump in M2; the M3/M4/etc. cycle decides next bump.
- [ ] No new npm dependencies.
- [ ] [[feedback-loud-fail-open]] invariant honored: every briefing-skip path emits a stderr `[mccp:briefing]` line.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1만; R2 escalation 조건 미충족 — 모든 ACCEPT_NOW 항목이 plan body에 mechanical absorption됨)
- 합치 결론: needs-attention → R1 absorbed → plan 본문 변경으로 모든 HIGH/MEDIUM finding 해소.
- 호출 wall-clock: 533s (durationMs=533198, 9분; codex-invoke 900s timeout 한도 내)
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — Briefing stamp이 receipt_hash를 tamper-detect 무력화 | HIGH (0.92) | ACCEPT_NOW | mechanical fix가 작음(단일 hash.js delete 5줄) + 기존 schema invariant 손상 위험. 새 Task 1b로 흡수. |
  | F2 — stdout.length/4 token estimate가 \$5/mo SLO를 enforce 불가 | HIGH (0.90) | ACCEPT_NOW | input-side cost 누락이 PRD success metric을 false-positive로 만든다. token estimate 공식을 (focus + stdout)/4로 변경 + briefing_token_estimated:bool flag 추가. cost-tier guard \$50 notice tier가 indirect budget으로 이미 작동 — receipt telemetry는 measurement, 자체 budget enforcer는 차후 cycle. |
  | F3 — receipt-write의 Codex 재진입 mechanical guard 부재 | MEDIUM (0.74) | ACCEPT_NOW | cost-guard에 PR_PHASE_LOCKED reason 추가 + briefing/index.js에 BRIEFING_IN_PROGRESS process-local flag. cost = 2개 작은 함수 추가. M2 Task 2 + Task 4 body 직접 변경. |
- Deferred to backlog: 0 (모든 R1 finding ACCEPT_NOW)
- Open Questions: 없음 (R2 escalation 조건 — `ACCEPT_NOW × {HIGH,CRITICAL} × R1 absorption 불가` — 미충족)
- Codex session 참조: threadId `019ed654-397c-7341-89bf-87c6fa24c902`
- 추가 plan 변경 요약:
  - Files-to-Change 표에 `receipt/hash.js` UPDATE row 추가
  - 신규 Task 1b — hash.js canonicalization (briefing_* 4 field 제외)
  - Task 1: schema 필드 3 → 4 (briefing_token_estimated 추가)
  - Task 2: REASONS에 PR_PHASE_LOCKED + isInPRCodexReviewSubphase probe + lockProbe opts hook
  - Task 3: token estimate 공식 변경 + estimated flag return
  - Task 4: BRIEFING_IN_PROGRESS process-local guard + stampReceipt에 estimated 필드 + hash recompute 안 함 명시 주석
  - 신규 test file: `receipt/tests/hash-briefing-exclusion.test.js`
  - Acceptance checklist에 R1 absorption 검증 행 추가 (Task 1b ship + PR-phase guard test pass + token_estimated round-trip)

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
