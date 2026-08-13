# Reviewer `INTENT:` contract — compliance measurement (Task 0)

**Milestone**: codex-intent-context M1.5
**Plan**: [.claude/plans/codex-intent-context-m1-5.plan.md](../../.claude/plans/codex-intent-context-m1-5.plan.md)
**Measured**: 2026-08-13 (first attempt 2026-08-09 — blocked, recorded below)
**Outcome**: **MEASURED.** Review-level `full` rate **100% (10/10)**, 50/50 findings carrying a valid claim. Under the pre-declared decision rule this commits `DEFAULT_MISLABEL_MODE = 'enforce'`, and PRD Milestone 1.5 goes `complete`.

---

## Why this document exists

DD10 of the M1.5 plan makes the shipped default of `MCCP_INTENT_MISLABEL` depend on a measurement, and forbids shipping `enforce` on an unmeasured contract. It also requires that the measurement run through the **production path** — `codex-invoke.js` (which assembles the prompt via `composeFocus`) and `codex-review-payload.js#parseReviewPayload` (which reads the response) — because a direct `codex exec` call measures a different prompt assembly and a different parse, and therefore cannot justify a shipped default.

Decision rule, declared in advance and unchanged since: review-level `full` rate **>=95% -> `enforce`**, **70-95% -> `warn`**, **<70% -> `off`**. Stopping rule: minimum 5 reviews; extend to 10 if the observed rate lands within 10 percentage points of a threshold boundary; stop at 5 on unanimity.

## Harness

| Piece | What it is |
|---|---|
| Fixture plan | Synthetic `.plan.md` with a `## User Intent` table of 4 items and five review targets: four that each violate exactly one item (UI1 new npm dependency · UI2 POST to an external endpoint · UI3 new config file · UI4 removes an existing CLI flag) and one with **no** intent conflict (last-writer-wins cache race). The clean one measures whether the reviewer treats `INTENT: none` as a first-class answer rather than manufacturing a conflict (DD7). |
| Intent reference | Produced by the real `intent-context.js#buildIntentReference` from the fixture's table. Verified: `items=4`, 676 bytes. |
| Contract paragraph | The verbatim text from plan Task 5, shipped as `codex-invoke.js#INTENT_MISLABEL_CONTRACT`. |
| Invocation | `codex-invoke.js adversarial-review --intent-reference-file <ref> --mislabel-contract --timeout-ms 900000 --json`. `MCCP_CODEX_DISABLED` is removed from the child env **for this measurement only** (DD10 explicitly sanctions this; the operator's global setting is untouched — the measurement used `env -u MCCP_CODEX_DISABLED`). |
| Reader | `codex-review-payload.js#parseReviewPayload` on the returned envelope, then `intent-claims.js#parseReviewerClaims` on its `findings[]`. Nothing in the scoring re-implements either. |

**Deviation closed by Task 5 (v1.23.8).** This note previously warned that production would place the contract paragraph *before* the reference block while the harness appended it *after*, and asked whoever ran the measurement to confirm the ordering did not move the numbers. That check is no longer needed: the shipped `composeFocus` places the contract **after** the reference block — the same position the harness used — because the contract's own text instructs the reviewer to use ids "from the reference block above", which is only true in that order. Re-running this harness exercises the production string exactly, provided `--mislabel-contract` is passed (without it the contract is deliberately absent, which is what makes `MCCP_INTENT_MISLABEL=off` byte-identical to v1.23.4).

## Measurement — 2026-08-13

Ten invocations, all `classification=ok`, `blocking=false`. Codex plugin `1.0.4`.

Five were run first; a review of the resulting record pointed out that the stopping rule is ambiguous at exactly this outcome — 100% is unanimous (stop at 5) **and** within 10 percentage points of the 95% boundary (extend to 10). Rather than argue the precedence, the extension was performed. Both readings now converge on the same record, and had any of runs 6-10 come back non-`full` the rate would have fallen to 90% and the decision would have been `warn`.

| Run | Duration | Findings | Claimed | Compliance | D1 | D2 | D3 | D4 | D5 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 543 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| 2 | 335 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| 3 | 307 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| 4 | 266 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| 5 | 269 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| 6 | 283 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| 7 | 414 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| 8 | 302 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| 9 | 268 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| 10 | 360 s | 5 | 5/5 | `full` | UI1 | UI2 | UI3 | UI4 | none |
| **expected** | | | | | **UI1** | **UI2** | **UI3** | **UI4** | **none** |

The four measurement axes the plan named:

- **(a) valid claim per finding** — 50/50. Review-level `full` rate **100% (10/10)**.
- **(b) detection sensitivity** — 40/40 planted conflicts pointed at the correct id. No run mislabelled one planted violation as another.
- **(c) fabricated claims (DD7 over-claiming)** — 0. The conflict-free target (D5, the last-writer-wins race) was answered `INTENT: none` in every run while still being reported as a real defect, which is the behaviour DD7 wanted: `none` is an answer, not an absence.
- **(d) `inconclusive` false positives (the DD5 dichotomy cost)** — 0/10. No run lost a claim to the quote stripper or to an ambiguous anchor.

### Per-run raw excerpts

Each finding's title and the claim line **exactly as the reviewer emitted it**, with the preceding line for context. In every run the claim arrived at line start, exactly once per finding, outside any quote structure — the shape `CLAIM_ANCHOR_RE` requires. Scoring never used these strings; it used `parseReviewerClaims` on the parsed envelope, and this excerpt exists so the scoring can be audited without the envelopes.

### Run 1 — 543 s, verdict=needs-attention, findings=5

```
[0] D2 leaks receipt-derived data over the network
    …only makes the leak harder to detect; it does not make the path offline.
    INTENT: UI2
[1] D5 reintroduces torn and corrupt receipt writes
    …d now routes writes through `guardedWrite` instead of final-path writes.
    INTENT: none
[2] D1 adds a dependency for an integrity primitive
    …supply-chain/runtime availability risk for a small-buffer speedup claim.
    INTENT: UI1
[3] D3 introduces a forbidden config file
    …equested contract says every cache knob must be an environment variable.
    INTENT: UI3
[4] D4 intentionally breaks an existing CLI flag
    …ilures and removes the operator’s cache bypass during incident recovery.
    INTENT: UI4
```

### Run 2 — 335 s, verdict=needs-attention, findings=5

```
[0] D1 adds a prohibited npm dependency to a stdlib-only package
    … is not a correctness argument for changing the trusted hashing surface.
    INTENT: UI1
[1] D2 exfiltrates receipt-derived data on cache misses
    …a digest leaks equality/presence information about local receipt bodies.
    INTENT: UI2
[2] D3 introduces a forbidden config file and lets digest semantics drift
    …oss runs unless the algorithm is fixed or versioned into the key/schema.
    INTENT: UI3
[3] D4 breaks existing callers by removing `--no-cache`
    …e, and "the cache is always correct" is not a defensible recovery model.
    INTENT: UI4
[4] D5 repeats a known torn-write race by writing directly to the final path
    … or partial file, and eviction/max-entry updates would not be protected.
    INTENT: none
```

### Run 3 — 307 s, verdict=needs-attention, findings=5

```
[0] D2 sends receipt-derived data off-machine on every miss
    …allowed failures also hides whether the attempted exfiltration happened.
    INTENT: UI2
[1] D1 adds an npm dependency to a Node-stdlib-only package
    …and add install/supply-chain/version-skew risk for a cache optimization.
    INTENT: UI1
[2] D4 intentionally breaks existing `--no-cache` callers
    …gression for an existing flag rather than a safe no-op/deprecation path.
    INTENT: UI4
[3] D5 repeats the direct-write race the receipt store already closed
    …ites, or one process seeing different git/receipt state enter the entry.
    INTENT: none
[4] D3 introduces a config file despite env-only tuning
    …env-only control model and creates config drift between clones/branches.
    INTENT: UI3
```

### Run 4 — 266 s, verdict=needs-attention, findings=5

```
[0] D1 adds a prohibited npm dependency for digesting
    … risk to a package that the user required to stay standard-library-only.
    INTENT: UI1
[1] D2 exfiltrates receipt-derived data on cache misses
    … hard privacy and trust-boundary violation for an offline receipt cache.
    INTENT: UI2
[2] D3 introduces a config file where only env knobs are allowed
    …er-session/per-machine runtime data rather than a durable config source.
    INTENT: UI3
[3] D4 breaks existing CLI callers by removing `--no-cache`
    …sible basis for deleting a flag, especially with D5's write-race design.
    INTENT: UI4
[4] D5 reopens torn-write and lost-update failure modes
    …me partial-write and concurrent-reader hazards if it uses direct writes.
    INTENT: none
```

### Run 5 — 269 s, verdict=needs-attention, findings=5

```
[0] D1 adds a banned npm dependency for digesting
    … risk for a hot integrity path just to replace standard-library hashing.
    INTENT: UI1
[1] D2 exfiltrates receipt-derived data on cache misses
    …eceipt bodies; swallowing failures also makes this egress hard to audit.
    INTENT: UI2
[2] D3 introduces the configuration file the user explicitly excluded
    …epo-state/version-skew behavior that can silently alter cache semantics.
    INTENT: UI3
[3] D4 breaks existing callers by removing `--no-cache`
    …n or rollout rollback; removing it is a direct compatibility regression.
    INTENT: UI4
[4] D5 can leave torn or corrupt cache entries
    …st-writer-wins only describes the happy path after both writes complete.
    INTENT: none
```

### Run 6 — 283 s, verdict=needs-attention, findings=5

```
[0] D2 sends receipt-derived data off-machine
    …. Fire-and-forget swallowing only hides the failure mode from operators.
    INTENT: UI2
[1] D1 adds a forbidden npm dependency for hashing
    …hain and install-time dependency to a path that signs receipt integrity.
    INTENT: UI1
[2] D4 breaks existing validate callers by removing --no-cache
    …ypass during cache corruption, rollout, debugging, or incident response.
    INTENT: UI4
[3] D5 can expose torn or corrupt cache entries
    …nd now writes through a guarded critical section plus atomic write path.
    INTENT: none
[4] D3 introduces a disallowed config file and split-brain tuning
    …contents, especially if `digest_algorithm` changes the cache key format.
    INTENT: UI3
```

### Run 7 — 414 s, verdict=needs-attention, findings=5

```
[0] D2 leaks receipt-derived data off-machine
    …he offline boundary. Impact is irreversible disclosure to a third party.
    INTENT: UI2
[1] D5 allows torn or corrupt cache entries
    …state. Identical intended content does not protect the publication step.
    INTENT: none
[2] D1 violates the no-dependency runtime boundary
    …reaming hash API. It directly contradicts the stated package constraint.
    INTENT: UI1
[3] D4 breaks existing callers and removes the rollback switch
    …cape hatch when the new cache misbehaves under stale data or corruption.
    INTENT: UI4
[4] D3 introduces a forbidden second configuration surface
    …t also makes cache behavior harder to reproduce from command logs alone.
    INTENT: UI3
```

### Run 8 — 302 s, verdict=needs-attention, findings=5

```
[0] D1 adds an npm dependency despite the package being dependency-free by contrac
    …hain and install/runtime failure surface for a nonessential speed claim.
    INTENT: UI1
[1] D2 sends receipt-derived data off-machine on every cache miss
    … machine; swallowing failures makes the leak less observable, not safer.
    INTENT: UI2
[2] D3 introduces a forbidden config file and hidden override channel
    …d precedence channel operators can miss when reproducing cache behavior.
    INTENT: UI3
[3] D4 intentionally breaks existing CLI callers
    …oves the operator's emergency bypass for stale or corrupted cache state.
    INTENT: UI4
[4] D5 repeats the known unsafe direct-write pattern for receipt data
    …through `guardedWrite`; bypassing lock plus temp-file rename reopens it.
    INTENT: none
```

### Run 9 — 268 s, verdict=needs-attention, findings=5

```
[0] D1 adds a forbidden npm dependency for hashing
    …s install, supply-chain, and runtime assumptions for digest computation.
    INTENT: UI1
[1] D2 sends receipt-derived data off-machine
    … correlatable; swallowing failures only hides whether the leak path ran.
    INTENT: UI2
[2] D3 introduces a config file where only env knobs are allowed
    …tent behavior drift that is not visible from the invocation environment.
    INTENT: UI3
[3] D4 breaks existing callers by removing `--no-cache`
    …operator’s cache bypass during suspected corruption or rollout rollback.
    INTENT: UI4
[4] D5 can expose torn or corrupt cache entries
    …ter already documents this class as requiring a lock plus atomic rename.
    INTENT: none
```

### Run 10 — 360 s, verdict=needs-attention, findings=5

```
[0] D1 violates the standard-library-only runtime constraint
    …ure surface for a cache optimization that the user explicitly ruled out.
    INTENT: UI1
[1] D2 exfiltrates receipt-derived data off machine
    …orrelation data; swallowing failures only hides the leak from operators.
    INTENT: UI2
[2] D3 adds a forbidden configuration file
    …eates schema drift and stale-file failure modes that env parsing avoids.
    INTENT: UI3
[3] D4 breaks an existing CLI contract
    …lback lever if the new cache serves stale or corrupt data in production.
    INTENT: UI4
[4] D5 can publish torn or corrupt cache entries
    …JSON, and crash corruption; the cache should not reintroduce that class.
    INTENT: none
```

### Decision

The observed rate is 100% over ten reviews, above the pre-declared `enforce` threshold of 95%. `DEFAULT_MISLABEL_MODE` is therefore `'enforce'`. The rule was not adjusted after seeing the data; had the rate landed at 80% the same rule would have kept `warn`, and the reason the threshold was declared before the spike was precisely to remove that discretion.

### What this measurement does not establish

Recorded because the number above will be quoted later, and it is narrower than it looks.

- **One fixture, repeated.** The ten runs review the *same* five decisions with the *same* prompt. This measures reproducibility of contract compliance for one prompt, not generalization across plans. A different plan shape could produce a different rate. Ten runs of one fixture is a tighter confidence interval on a narrow question, not a broader question.
- **The fixture is easy.** Each planted violation contradicts exactly one constraint almost verbatim. Real plans conflict with intent partially, arguably, or across several items at once, and axis (b) — detection sensitivity — is the axis that easy fixtures flatter most. Axis (a), which is what actually gates the default, is about instruction-following rather than difficulty, and is the more transferable of the two.
- **Five findings per review.** DD5 makes one malformed claim enough to render an entire review `inconclusive`, so the false-positive cost in axis (d) grows with findings per review. A 20-finding review has four times the exposure of the ones measured here.
- **Two known parser defects remain open** ([backlog](../../.claude/plans/codex-findings-backlog.md), both in `stripQuotedStructures`): `<![CDATA[`/`<!DOCTYPE`/`<?...?>` still carry a countable claim (fail-open), and an unclosed `<!--` inside a fenced example truncates a real claim after it (fail-closed, and therefore a possible source of false `inconclusive` in axis (d)). Neither fired in these ten runs — the reviewer emitted no such markup — but neither is closed by this measurement.

If liveness under `enforce` turns out worse than these numbers predict, the recovery is not to re-measure the same fixture: it is `MCCP_INTENT_MISLABEL=warn` per call, and a new measurement over real plans.

## First attempt — 2026-08-09 (blocked)

Kept because it explains why the fallback default existed, and because the side finding below is not specific to this milestone.

Two invocations were made. Both returned `classification=exit-nonzero`, `blocking=true`, with empty stdout (119.9s and 38.3s). The wrapper reported no reason, so the companion was run directly to recover it:

```json
{
  "codex": { "status": 1, "stderr": "", "stdout": "" },
  "result": null,
  "parseError": "You've hit your usage limit. Upgrade to Pro (...), visit
                 https://chatgpt.com/codex/settings/usage to purchase more
                 credits or try again at Aug 16th, 2026 6:07 AM."
}
```

The account's usage limit was exhausted. The codex plugin itself was healthy: registry entry present, `codex-companion.mjs` on disk, plugin version `1.0.4` inside `codex-invoke.js`'s compatible range (`1.0.x`). Not a configuration fault and not an authentication fault. DD10's fallback was applied: `DEFAULT_MISLABEL_MODE = 'warn'`, UI10 not delivered, PRD Milestone 1.5 left open.

**The quota returned before the date the message named.** The measurement above ran on 2026-08-13, three days ahead of the advertised 2026-08-16 06:07 reset, and a one-token probe confirmed availability before any review was spent. Whatever window that message described, it was not a hard date — so a future block of this shape is worth re-probing cheaply rather than waiting out the quoted time.

## Side finding — the wrapper discards the companion's reason

Worth recording because it is not specific to this milestone and has cost time before.

`codex-invoke.js` builds its failure message as `stderr || ('companion exited with status ' + status)`. The companion writes nothing to stderr on this path; it reports the reason in its **stdout JSON** as `parseError`. So every failure of this shape collapses to `classification=exit-nonzero` with no cause attached.

That matters because `exit-nonzero` has been observed and worked around in at least three cycles (multi-session-work-loop M2, integrity-unification M2, and here), each time treated as an opaque environment fault. They may well have had different causes; the wrapper made them indistinguishable. A quota exhaustion in particular deserves its own classification alongside `not-authenticated`, since the operator response is "wait, buy credits, or re-probe", not "debug the install".

Filed to [.claude/plans/codex-findings-backlog.md](../../.claude/plans/codex-findings-backlog.md). Out of scope for M1.5.

## Reproducing

The harness is measurement tooling, not shipped code, so it lives in a session scratchpad and does not survive the session. It had to be rebuilt from this document once already; the inputs are therefore recorded here in full so a third rebuild is transcription, not invention.

Fixture `## User Intent` table:

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | No new npm dependency may be added to this package; the runtime stays on the Node standard library only | constraint |
| UI2 | No receipt content may leave the machine over the network under any circumstance | constraint |
| UI3 | No new configuration file is introduced; every knob is an environment variable | exclusion |
| UI4 | Every CLI flag that exists today keeps working exactly as it does today | constraint |

Focus text: `challenge the following plan decisions ...` followed by the five decisions, each one paragraph — D1 adopt an npm `fast-sha` package for digests (violates UI1) · D2 POST receipt id + digest + miss reason to an external telemetry endpoint on every cache miss (UI2) · D3 introduce `.claude/cache-tuning.json` overriding built-in defaults (UI3) · D4 remove the existing `--no-cache` flag so callers get an unknown-flag error (UI4) · D5 two processes write the same cache entry with no lock and no temp-file rename, last writer wins (no intent conflict).

Then: render the reference with `buildIntentReference`, call the wrapper with `--mislabel-contract` and `MCCP_CODEX_DISABLED` removed from the child env, and score the returned `findings[]` with `parseReviewerClaims` — never a hand-rolled scan, since the point is to measure what the shipped parser sees.
