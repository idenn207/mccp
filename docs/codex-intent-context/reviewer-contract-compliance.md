# Reviewer `INTENT:` contract — compliance measurement (Task 0)

**Milestone**: codex-intent-context M1.5
**Plan**: [.claude/plans/codex-intent-context-m1-5.plan.md](../../.claude/plans/codex-intent-context-m1-5.plan.md)
**Attempted**: 2026-08-09
**Outcome**: **NOT MEASURED — blocked on Codex account quota.** `MCCP_INTENT_MISLABEL` ships with the DD10 fallback default `warn`, and PRD Milestone 1.5 does **not** go `complete`.

---

## Why this document exists

DD10 of the M1.5 plan makes the shipped default of `MCCP_INTENT_MISLABEL` depend on a measurement, and forbids shipping `enforce` on an unmeasured contract. It also requires that the measurement run through the **production path** — `codex-invoke.js` (which assembles the prompt via `composeFocus`) and `codex-review-payload.js#parseReviewPayload` (which reads the response) — because a direct `codex exec` call measures a different prompt assembly and a different parse, and therefore cannot justify a shipped default.

This file records the attempt, the harness, the blocker, and what the fallback obliges us to do.

## Harness (built, verified up to the spawn boundary)

| Piece | What it is |
|---|---|
| Fixture plan | Synthetic `.plan.md` with a `## User Intent` table of 4 items and five review targets: four that each violate exactly one item (UI1 new npm dependency · UI2 POST to an external endpoint · UI3 new config file · UI4 removes an existing CLI flag) and one with **no** intent conflict (last-writer-wins cache race). The clean one measures whether the reviewer treats `INTENT: none` as a first-class answer rather than manufacturing a conflict (DD7). |
| Intent reference | Produced by the real `intent-context.js#buildIntentReference` from the fixture's table. Verified: `items=4`, 1542 bytes. |
| Contract paragraph | The verbatim text from plan Task 5. |
| Invocation | `codex-invoke.js#invokeAdversarialReview` with `intentReference`, `timeoutMs: 900000`, `json: true`. `MCCP_CODEX_DISABLED` is deleted from the child env **for this measurement only** (DD10 explicitly sanctions this; the operator's global setting is untouched). |
| Reader | `codex-review-payload.js#parseReviewPayload` on the returned envelope. |

**Known deviation, to be closed when Task 5 lands.** Production will carry the contract paragraph in a `codex-invoke` preamble constant placed *before* the reference block; this harness appends it to the end of the `--intent-reference-file` payload. Same wrapper, same reader, same reviewer-visible text — only the ordering inside the preamble region differs. When the measurement is finally run against the implemented Task 5, confirm the ordering change does not move the numbers.

## What happened

Two invocations were made. Both returned `classification=exit-nonzero`, `blocking=true`, with empty stdout (119.9s and 38.3s).

The wrapper reported no reason, so the companion was run directly to recover it:

```
node <codex-install>/scripts/codex-companion.mjs adversarial-review --wait --json "<focus>"
```

```json
{
  "codex": { "status": 1, "stderr": "", "stdout": "" },
  "result": null,
  "parseError": "You've hit your usage limit. Upgrade to Pro (...), visit
                 https://chatgpt.com/codex/settings/usage to purchase more
                 credits or try again at Aug 16th, 2026 6:07 AM."
}
```

The Codex account's usage limit is exhausted. Quota resets **2026-08-16 06:07**. The codex plugin itself is healthy: registry entry present, `codex-companion.mjs` on disk, plugin version `1.0.4` inside `codex-invoke.js`'s compatible range (`1.0.x`). This is not a configuration fault and not an authentication fault.

Corroborating evidence that the failure is quota and not the wrapper: three `codex exec --sandbox read-only -m gpt-5.4` reviewer invocations succeeded earlier the same day (santa-loop rounds 1-3 for this plan). Those runs consumed the remaining quota.

## Consequence for the milestone (DD10 fallback)

1. `MCCP_INTENT_MISLABEL` ships with **`warn`** as `DEFAULT_MISLABEL_MODE`. This is the fallback value, **not a measured one**.
2. **UI10 is not delivered.** DD9 item 1 already states that `warn` does not achieve it — no blocking means the author can proceed past a reviewer-asserted conflict. M1.5 ships an audit surface, not the metric.
3. **PRD Milestone 1.5 does not go `complete`.** It stays open with the `enforce` flip as a named follow-up whose precondition is this measurement.
4. The follow-up is exactly: re-run this harness after 2026-08-16, at least 5 reviews, extend to 10 if the observed `full` rate lands within 10 percentage points of a threshold boundary, then commit the result to `DEFAULT_MISLABEL_MODE` with the evidence path and date in the comment above it.

Decision rule (declared in advance, unchanged): review-level `full` rate **>=95% -> `enforce`**, **70-95% -> `warn`**, **<70% -> `off`**.

## Side finding — the wrapper discards the companion's reason

Worth recording because it is not specific to this milestone and has cost time before.

`codex-invoke.js` builds its failure message as `stderr || ('companion exited with status ' + status)`. The companion writes nothing to stderr on this path; it reports the reason in its **stdout JSON** as `parseError`. So every failure of this shape collapses to `classification=exit-nonzero` with no cause attached.

That matters because `exit-nonzero` has been observed and worked around in at least three cycles (multi-session-work-loop M2, integrity-unification M2, and here), each time treated as an opaque environment fault. They may well have had different causes; the wrapper made them indistinguishable. A quota exhaustion in particular deserves its own classification alongside `not-authenticated`, since the operator response is "wait or buy credits", not "debug the install".

Filed to [.claude/plans/codex-findings-backlog.md](../../.claude/plans/codex-findings-backlog.md). Out of scope for M1.5.

## Reproducing

The harness lives in the session scratchpad, not the repo (it is measurement tooling, not shipped code). To rebuild it: create a fixture plan with a `## User Intent` table and planted per-item violations, render the reference with `buildIntentReference`, append the Task 5 contract text, and call `invokeAdversarialReview` with `MCCP_CODEX_DISABLED` removed from the child env. Score the returned `findings[]` with the DD1 rules (line-anchored, exactly one match after stripping quote structures, single `UI<n>` or `none`).
