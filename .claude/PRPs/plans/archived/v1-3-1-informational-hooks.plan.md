# Plan: v1.3.1 — Informational Hooks + Auto-Recovery

**Parent**: patch cycle on top of v1.3.0-m1 (commit `2eb0367`)
**Complexity**: Small-medium (~250 LoC, no new modules, no new deps, mechanical scope)
**Version bump**: `plugin.json` 1.3.0 → 1.3.1 (CLAUDE.md §3.7 patch)
**Branch / worktree**: `v1.3.1-informational-hooks` / `.worktrees/v1.3.1-informational-hooks/` (CLAUDE.md §3.8)

## Problem

Receipt gate hook (`receipt-prompt.js`) fails-closed at `UserPromptExpansion` — missing/stale receipts exit-block the prompt before Claude can see it. The user must then run a separate `/mccp:receipt-write` command (with the right `--gate/--decision/--plan` args) just to unblock. This 4-step workaround happens every time a prior session crashes mid-`/mccp:plan` (today's incident is the 3rd+ recurrence in three milestones — STATE.md `Open Questions` line 49 documents the pattern). The mechanical proof value of receipts is preserved by the *hash/validator logic*, not by *hook authoritarianism* — relocating the validator from hook to Claude eliminates the block without losing the chain.

## Direction (3 changes, zero toggles) — **R2 absorption tightens scope**

1. **Hook ALLOWs only for `missing-only` integrity failure** (Codex R2-F1 absorption). `receipt-prompt.js` partitions the validator result:
   - `result.missing.length > 0 && result.stale.length === 0 && result.blocking.length === 0 && result.open_critical.length === 0` → ALLOW + structured `additionalContext`.
   - Any of `stale[] | blocking[] | open_critical[]` non-empty → **hard-block unchanged** (mechanical invariant preserved). The hook sets `must_not_proceed=true` for these.
   - Recovery in Claude is a deterministic synthesize-then-revalidate cycle, NOT a re-classification.
2. **Claude executes deterministic recovery for the missing-only path** in `plan.md` / `prp-implement.md` Phase 0 — reads injected context, validates plan body completeness, calls `cli.js write` + re-runs `validate-cmd` with the SAME slug/plan. If post-write revalidation fails for any reason → stop + ask user.
3. **Terminal/mutating commands keep hook hard-block** — `/mccp:pr` AND `/mccp:code-review` (Codex R2-F2 absorption: PR Review Mode POSTs GitHub review = external mutation). Recoverable allow-list = `{/mccp:plan, /mccp:prp-implement}` only. `/mccp:resume` is informational-only (no mutation if it just dispatches), kept recoverable.

**Defaults change. No new env vars. Existing toggles (`MCCP_RECEIPT_GATE_MODE`) become legacy but not removed — kept for advanced debugging.**

## Codex Perspectives Absorbed (R1)

Codex review verdict: `needs-attention` (viable with two preservation steps). Both findings absorbed:

| Finding | Severity / Conf | Absorption |
|---|---|---|
| **F1 — read-back validate scope mismatch (HIGH 0.94)** | 5 callsites (`prp-implement.md:295`, `plan.md:380`, `pr.md:539`, `code-review.md:128`, `resume.md:199`) call `validate --command <X>` without `--decision`/`--plan` → CLI falls back to `decisionId='default'`. After hook relocation, Claude's recovery would consume false validation. | **Sequenced first** (Task 1) — must land before Task 3/4. Every callsite gets explicit `--decision ${DECISION_SLUG} --plan <path>`. |
| **F2 — lossy injected context (HIGH 0.86)** | If hook just re-uses the current human block payload as injection, Claude loses structured fields (`stale[]`, `blocking[]`, `open_critical[]`, `missing[]`, `classify.kind`, `must_not_proceed`). | **Schema explicit** (Task 2) — define exact `additionalContext` schema with raw `validateResult` JSON + 7 named fields (see §Context Schema). Recovery path MUST re-run `validate-cmd` after synthesizing receipt. |

Codex-identified "strictly worse" scenario: stale implement receipt before `/mccp:pr` currently stops at hook; under naive Claude-as-validator a misread warning enters mutating flow. **Mitigation: Direction 3 (terminal gate exception). The `/mccp:pr` hook block stays unchanged.**

## Context Schema (Task 2 contract)

```jsonc
// Injected via hookSpecificOutput.additionalContext when receipt gate would have blocked
{
  "mccp_receipt_gate": {
    "commandName": "mccp:prp-implement",          // never null
    "decisionId": "v1-3-1-informational-hooks",   // derived slug, never "default" silently
    "planPath": ".claude/plans/v1-3-1-informational-hooks.plan.md", // null only if not derivable
    "cwd": "C:/_project/my/my-claude-code-plugin",
    "classifierKind": "block",                    // ok | block | tempfail | advisory | skipped
    "must_not_proceed": false,                    // true = Claude must stop + ask user (terminal/mutating)
    "validateResult": {                           // raw output of validateCommand(), NOT prose
      "ok": false,
      "missing": [{ "gate_id": "mccp-plan-codex", "decision_id": "...", "reason": "no receipt written" }],
      "stale": [],
      "blocking": [],
      "open_critical": [],
      "warnings": []
    }
  }
}
```

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/prp-implement.md` (line 295) | UPDATE | Add `--decision ${DECISION_SLUG} --plan "$PLAN_PATH"` to validate call. Add Phase 0 auto-recovery body. |
| `plugins/mccp/commands/plan.md` (line 380) | UPDATE | Add `--decision/--plan` to validate call. Add Phase 0 auto-recovery body. |
| `plugins/mccp/commands/pr.md` (line 539) | UPDATE | Add `--decision/--plan` to validate call. **Phase 0 does NOT auto-recover** (terminal gate). |
| `plugins/mccp/commands/code-review.md` (line 128) | UPDATE | Add `--decision/--plan` to validate call. **NOT added to recoverable allow-list** (R2-F2 absorption: PR Review Mode POSTs GitHub review). Hook block unchanged. |
| `plugins/mccp/commands/resume.md` (line 199) | UPDATE | Add `--decision/--plan` to validate call (uses `$VALIDATE_COMMAND` var — wrap with derived slug). |
| `plugins/mccp/scripts/hooks/receipt-prompt.js` (lines 295-310) | UPDATE | Replace `block(...)` with structured `additionalContext` + ALLOW **only when** `commandName ∈ RECOVERABLE_ALLOW_LIST` (= `{/mccp:plan, /mccp:prp-implement, /mccp:resume}`) **AND** `result.missing.length>0 && result.stale.length===0 && result.blocking.length===0 && result.open_critical.length===0`. All other cases keep existing `block(...)` path unchanged. Keep `MCCP_RECEIPT_GATE_MODE` honored. |
| `plugins/mccp/scripts/hooks/lib/receipt-context-schema.js` | CREATE | Single export `buildAdditionalContext(commandName, decisionId, planPath, cwd, result)`. Centralizes the schema in §Context Schema. ~30 LoC. |
| `plugins/mccp/scripts/hooks/tests/receipt-prompt.test.js` | UPDATE | Add tests: (a) recoverable command + missing receipt → ALLOW + structured context emitted, (b) terminal `/mccp:pr` + missing → BLOCK unchanged, (c) non-default slug correctly forwarded, (d) `must_not_proceed=true` set when terminal. |
| `plugins/mccp/scripts/receipt/tests/cli-validate.test.js` | UPDATE | Add regression: `validate --command X` without `--decision/--plan` is *still allowed* by CLI (back-compat) but command-body callsites MUST pass them — codified by Task 6 lint test. |
| `plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js` | CREATE | **(R2-F3 absorption)** Static regression: scan all `plugins/mccp/commands/*.md` for `validate --command` invocations. Fail unless both `--decision` AND `--plan` are present (or the file is on an explicit allow-list with documented reason). Cover aliases (`review-pr.md`, `prp-pr.md`). ~40 LoC. |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version`: `1.3.0` → `1.3.1`. |
| `CHANGELOG.md` | UPDATE | New row under v1.3.1. |

## Tasks (Order Matters — Codex F1+F3 priority)

1. **Patch 5 validate-call callsites** to forward `--decision/--plan`. Add regression test for non-default slug. *No hook changes yet.* Verify: re-running today's incident manually shows correct scope being validated.
2. **Create `receipt-context-schema.js`** + unit tests for the schema shape (§Context Schema). Pure data, no behavior change yet.
3. **(NEW R2-F3 absorption) Create `validate-callsite-lint.test.js`** — static scan + assertion. Run via `node --test`. Must pass BEFORE Task 4. This is the mechanical guard that Task 1 stays correct across future callsite additions.
4. **Patch `receipt-prompt.js`** — strict partition logic:
   - Compute `RECOVERABLE = ['/mccp:plan', '/mccp:prp-implement', '/mccp:resume']` (NB: `/mccp:code-review` and `/mccp:pr` are NOT in this list — R2-F2 absorption).
   - If `commandName ∈ RECOVERABLE` AND `kind === 'block'` AND `result.missing.length>0 && result.stale.length===0 && result.blocking.length===0 && result.open_critical.length===0` → emit `additionalContext` via `buildAdditionalContext(...)` + ALLOW.
   - All other `kind === 'block'` cases → existing `block(...)` path unchanged + `must_not_proceed=true` mirrored in any audit log.
   - `kind === 'tempfail'` → existing tempfail path unchanged.
5. **Add Phase 0 auto-recovery body** to `plan.md` + `prp-implement.md` ONLY (NOT `code-review.md`):
   - Read injected `mccp_receipt_gate` context.
   - If `must_not_proceed === true` → stop + report (defensive: hook should already have blocked, this is belt-and-suspenders).
   - Verify `validateResult.missing.length>0 && stale.length===0 && blocking.length===0 && open_critical.length===0`. If invariant fails → stop + diagnose (mismatch with hook contract).
   - Verify plan body has `## Codex Adversarial Review` section + no auto-CRITICAL opens. If fails → stop + ask user.
   - Call `cli.js write --gate <missing.gate_id> --decision <decisionId> --plan <planPath>`.
   - Re-run `validate-cmd --command <commandName> --decision <decisionId> --plan <planPath>`. If exit≠0 → stop + report.
   - Proceed.
6. **Bump `plugin.json` to 1.3.1** + CHANGELOG row.

## Out of Scope (Explicit Deferrals)

- **Atomic finalizer state machine** (Codex MED 0.88 from prior round) — separate milestone. This patch prevents the *recurrence* of today's incident class via auto-recovery; atomicity would prevent the *occurrence*. Complementary, not gated by each other.
- **Receipt JSON → derive-from-plan/git replacement** — Codex HIGH 0.93 REJECT preserved. Not touched here.
- **`MCCP_RECEIPT_GATE_MODE` env removal** — legacy honored but deprecated. Removal in v1.4.x after one cycle of soak.
- **Recovery for stale/blocking/open_critical** (R2-F1 absorption) — these stay mechanical hard-block. Recovery requires human triage by design.

## Validation

- Re-run today's incident (missing-only): prior session leaves plan with Codex section + no receipt → fresh session types `/mccp:prp-implement <plan>` → completes in 1 step. Log line confirms `auto-recovered receipt`.
- **(NEW R2-F1 regression)** Manually mark a receipt stale (touch plan to invalidate hash) → `/mccp:prp-implement` MUST still hard-block. Hook returns block, not ALLOW.
- **(NEW R2-F2 regression)** `/mccp:code-review` with missing `mccp-pr-codex` receipt → MUST still hard-block (not in recoverable allow-list).
- `/mccp:pr` with missing receipt → still blocks (terminal gate invariant).
- **(NEW R2-F3 regression)** `node --test plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js` passes; intentionally remove `--plan` from one callsite to confirm the test fails.
- `node --test plugins/mccp/scripts/hooks/tests/receipt-prompt.test.js` passes.
- `node --test plugins/mccp/scripts/receipt/tests/cli-validate.test.js` passes.
- Manual: change `MCCP_RECEIPT_GATE_MODE=hard` (legacy) → behavior unchanged from new default for the recoverable subset.

## Open Questions

- ~~**Should `code-review.md` auto-recover or just diagnose?**~~ **Resolved by R2-F2** — code-review.md POSTs GitHub review = mutating. Removed from recoverable allow-list. Hook block unchanged. <!--mccp:resolved reason="plan이 completed/ 로 아카이브됨 = ship 시점에 질문이 해소되어 본문 결정에 반영됨" at="2026-06-24T16:29:04.758Z"-->
- **Phase 0 body — markdown body vs separate `phase0-recover.js` lib?** Markdown body is consistent with existing pattern (Codex bridge, validate calls). Separate lib is more testable but adds a file. Default: markdown body to keep patch small; extract later if logic grows. <!--mccp:resolved reason="plan이 completed/ 로 아카이브됨 = ship 시점에 질문이 해소되어 본문 결정에 반영됨" at="2026-06-24T16:29:04.758Z"-->
- **`MCCP_RECEIPT_GATE_MODE` deprecation banner**: should the hook stderr-warn once per session if the env is set, given new default supersedes it? Default: yes, single warning, harmless. <!--mccp:resolved reason="plan이 completed/ 로 아카이브됨 = ship 시점에 질문이 해소되어 본문 결정에 반영됨" at="2026-06-24T16:29:04.758Z"-->

## Notes

- This patch addresses STATE.md `Open Questions` line 49 mechanically (the `--decision/--plan` missing arg) — that axis closes with Task 1 + Task 3 lint.
- pr.md `.git/` hardcode (STATE.md line 50) is *not* in scope here — separate axis.
- Post-ship receipt drift (STATE.md line 51) is *not* in scope here — separate axis.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.2.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 — class=ok, blocking=false, threadId=`019ed881-47cf-7843-9de4-d9fc2f381091`)
- 라운드 수: R1 (single round, all findings absorbed without R2 trigger)
- 합치 결론: 3 findings (HIGH 0.86 / HIGH 0.9 / MED 0.74) all ACCEPT_NOW + fully resolved by R1 plan amendments. No CRITICAL. Architecture invariant preserved by tightening Direction 1 scope to `missing-only` and moving the missing/stale partition from a Claude-instruction to a hook-mechanical decision.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — ALLOW-on-block turns receipt proof into Claude instruction | HIGH 0.86 | ACCEPT_NOW | Plan amended: hook now ALLOWs ONLY when `missing.length>0 && stale.length===0 && blocking.length===0 && open_critical.length===0`. Stale/blocking/open_critical remain hard-block (mechanical). Recovery in Claude becomes a deterministic synthesize-then-revalidate, not a re-classification. Invariant: hook still gatekeeps integrity. |
  | F2 — code-review is treated as recoverable but POSTs GitHub | HIGH 0.9 | ACCEPT_NOW | Plan amended: recoverable allow-list narrowed to `{/mccp:plan, /mccp:prp-implement, /mccp:resume}`. `/mccp:code-review` removed (chain-aware PR Review Mode posts external review). Hook block for code-review unchanged. Open Question line 106 closed. |
  | F3 — Task-1-first sequencing leaves bare validate calls dangerous | MED 0.74 | ACCEPT_NOW | Plan amended: new Task 3 creates `validate-callsite-lint.test.js`. Static scan of `plugins/mccp/commands/*.md` fails unless every `validate --command` call also has `--decision` and `--plan`. Cover aliases (`review-pr.md`, `prp-pr.md`). Lint must pass before Task 4 (hook patch) — mechanical guard. |
- Deferred to backlog: 0
- Open Questions: None CRITICAL. Remaining design choices (Phase 0 markdown vs lib, deprecation banner) are explicit Open Questions in plan body and do not block implementation.
- Codex session 참조: thread `019ed881-47cf-7843-9de4-d9fc2f381091`, duration ~ wrapper-tracked. raw verdict stored at `.git/mccp/tmp/codex-stdout.json` for audit.

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- Architectural decisions pre-committed in Plan-Codex R1: missing-only hook ALLOW partition, recoverable allow-list `{/mccp:plan, /mccp:prp-implement, /mccp:resume}`, terminal hard-block (`/mccp:pr` + `/mccp:code-review`), validate-callsite static lint mechanical guard.
- Files to Change list (10 files: 5 command md + 1 hook + 1 lib create + 2 test + 1 manifest + CHANGELOG) is layout-final — no new deps, no concurrency-model change, no new abstraction boundaries.
- `git diff --name-only origin/main..HEAD` ⊆ Files to Change list (empty at dedupe-eval time — fresh branch).
- Cross-gate dedupe per `/mccp:prp-implement` Phase 2.5.1 invariants. Receipt at 2.5.6 will stamp `codex_dedupe_at_implement=true`.
