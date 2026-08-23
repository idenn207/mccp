# mccp Gate Design Notes

> **Status**: reference-only learning document. Enforcement of these rules lives in
> command bodies (`plugins/mccp/commands/*.md`), the receipt CLI (`plugins/mccp/scripts/receipt/`),
> and the two receipt hooks (`plugins/mccp/scripts/hooks/`). Nothing in mccp's runtime
> reads this file — it exists so operators understand *why* each gate behaves the way it does.

mccp is a fork of the ECC (Extensible Claude Code) gate core. The original rules text lived in
`~/.claude/rules/ecc/common/ecc-command-gates.md` and was relied on by `/ecc:*` commands at
load time. mccp deliberately broke that dependency: gates are now expressed inline in each
command body, validated by hooks, and proven by JSON receipts. This document captures the
**intent** behind that mechanical layer.

## Why gates exist

mccp's gates exist to enforce a single principle: **adversarial review before commitment**.

- A plan should be challenged by an independent reviewer before implementation begins.
- New implementation-time decisions (file structure, abstraction boundaries, concurrency
  model, external dependencies) should be challenged before they harden into code.
- A PR should be challenged before merge, with cross-gate dedupe so already-converged
  decisions are not re-litigated.

Each gate produces a **receipt**: a structured JSON file in `<repo>/.claude/receipts/`
that captures the plan hash, git base/head, accepted/rejected findings, open questions
(with severity), and a `subject_hash` for staleness detection. Subsequent `/mccp:*`
commands cannot proceed until the receipt chain for their decision is intact.

## The Autonomy Contract (§0)

The most load-bearing rule in the original ECC text. mccp's plan and prp-implement command
bodies implement it inline. The 7 steps every gate must run in a single response:

1. **Draft the artifact** (plan body / implementation notes / PR description). Leave a
   placeholder for the Codex review section.
2. **Auto-invoke** `Skill(codex:adversarial-review, ...)` with focus text describing the
   1–3 most consequential decisions. Do not ask the user "shall I invoke Codex?".
3. **Inject the Codex result** into the artifact by editing the placeholder. The injected
   section follows a fixed schema: round count, convergence conclusion, accepted/rejected
   findings, open questions with severity, Codex session reference.
4. **Verify the section is present** with `grep -q "^## Codex Adversarial Review$"`. If
   missing, STOP and report failure.
5. **Auto-write the receipt** via `node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write
   --gate <mccp-*-codex> --decision <slug> --plan <path> --quiet`.
6. **Read-back validate** with `validate --command <next-mccp-command>` to confirm the
   receipt unblocks downstream gates.
7. **Print a one-line handoff** announcing the next command. Nothing else.

### Divergent auto-rerun

Default round cap is 1 (controlled by `MCCP_GATE_ROUND_CAP`, allowed `1`/`2`/`3`).
After R1, Claude produces a YAGNI triage table classifying each finding as
`ACCEPT_NOW` / `DEFER_TO_BACKLOG` / `REJECT_YAGNI`. R2 runs ONLY if ≥1 finding is
classified `ACCEPT_NOW` with severity `CRITICAL` or `HIGH` AND the absorption was
unable to fully address it (Claude self-attests in the plan body). R3 runs only
if R2 returns a NEW `CRITICAL`/`HIGH` unresolved. Beyond `MCCP_GATE_ROUND_CAP`,
annotate the open question as `DIVERGENT_UNRESOLVED` and proceed.

All `DEFER_TO_BACKLOG` items are appended to `.claude/plans/codex-findings-backlog.md`
with a one-line entry: `YYYY-MM-DD | severity | source plan | one-line finding`.
`REJECT_YAGNI` items require a "Why YAGNI" sentence in the triage table.

### Codex auto-fallback

If the Codex Skill call returns any of `setup_required` / `not authenticated` / 60-second
timeout / `rate_limit` / `service_unavailable`, do not ask the user. Replace the placeholder
with `> Codex unavailable, skipped (auto-fallback): <reason>` and proceed to receipt write.
The skip is recorded in receipt metadata.

### Codex Disable Toggle

There are two distinct ways a gate can run without Codex review, and they record
different reasons in the receipt:

| Env / state | Receipt field | Meaning |
|---|---|---|
| `MCCP_CODEX_DISABLED=1` | `codex_skipped: true`, `reason: 'codex_disabled'` | **Policy**: user explicitly chose to skip Codex for every gate (set during `/mccp:setup` Phase 4 or manually). `codex-bridge.parseCodexResult()` short-circuits to `verdict='skipped'` before any text is parsed. No Codex call is attempted. |
| Codex call attempted but failed | `codex_skipped: true`, `reason: 'service_unavailable' \| 'setup_required' \| 'not_authenticated' \| 'timeout' \| 'rate_limit'` | **Failure**: Codex was reachable, the call was made, the call did not return a usable verdict. `verdict='unavailable'`. The user may retry by re-running the gate later. |
| `MCCP_ALLOW_CODEX_UNAVAILABLE=0` | gate fails closed | When set, an `unavailable` verdict stops the gate instead of fallback-passing it. Use in CI. |

The receipt field is the same shape (`codex_skipped: true`), but `reason` distinguishes
"don't call again" from "try again later." Downstream commands (`/mccp:prp-implement`,
`/mccp:pr`) treat both as non-approving.

### Setup Flow

`/mccp:setup` is the idempotent entry point for installing mccp's external dependencies.

1. **Detect** — `node scripts/lib/dep-check.js --json` reads
   `~/.claude/plugins/installed_plugins.json` for the codex plugin, resolves the
   impeccable skill through `checkImpeccable()` (every install channel — see
   [impeccable-detection](#impeccable-detection)), and additionally runs the
   platform-appropriate `where` / `which impeccable` as **telemetry only**: that PATH
   probe answers a different question and no gate branch reads it.
2. **Install codex plugin** (if missing) — `claude plugin install codex@openai-codex`
   under user scope.
3. **Resolve the impeccable skill** (only when `checkImpeccable().available === false`) —
   the operator picks a channel. Plugin-first is the recommendation:
   `claude plugin marketplace add pbakaus/impeccable` then
   `claude plugin install impeccable@impeccable`; the CLI channel is
   `npx impeccable install`. The two are not interchangeable for gate firing —
   the plugin channel registers the skill as `impeccable:impeccable` while mccp's
   command bodies call the bare name, so setup states that consequence explicitly
   at install time (§3.17, and `#### setup·경고 정합 (M2)` below).
4. **Chain `/codex:setup`** — invoked as `Skill(codex:setup)`. If Codex is installed but
   not authenticated, the user picks among `!codex login`, set `MCCP_CODEX_DISABLED=1`
   permanently, or skip.
5. **Final report** — re-runs dep-check and prints the green/yellow table.

`SessionStart` writes `dep_check_at` / `dep_check_missing` into STATE.md frontmatter
on every boot. Re-warns only when the missing set changes or 24h have elapsed. When
`MCCP_CODEX_DISABLED=1` is set, the warning emit path is silenced entirely (user has
opted in to the no-Codex world; nothing to remind).

## Auto-CRITICAL catalog

The only conditions that override the autonomous flow and require user input. If a Codex
Open Question or any review explicitly flags one of these, the command STOPs and emits
`[MCCP-GATE-STOP]`:

- Secret / credential / API-key exposure
- Data loss or irreversible migration without backups
- Authentication or authorization bypass
- External communication destination change (data exfiltration vector)
- Cryptographic key, signing key, or token-handling change

Everything else (HIGH, MEDIUM, LOW open questions) is recorded as follow-up and the
command proceeds.

## Gate matrix

| User command | Produces receipt | Requires preceding |
|---|---|---|
| `/mccp:plan` | `mccp-plan-codex` | — |
| `/mccp:prp-implement` | `mccp-implement-codex` | `mccp-plan-codex` |
| `/mccp:pr` | `mccp-pr-codex` | `mccp-plan-codex` + `mccp-implement-codex` |
| `/mccp:code-review` | `code-reviewer` | `mccp-pr-codex` |

Receipt gate IDs use the `mccp-` prefix to coexist with the ECC origin's `plan-codex` /
`implement-codex` / `pr-codex` IDs on machines that install both plugins. The CLI's
schema also accepts `plan-impeccable` / `implement-impeccable` / `pr-impeccable` so
users who install [impeccable](https://impeccable.style/) alongside mccp can write
impeccable-side receipts through the same CLI.

## Cross-gate dedupe

The implement gate's Phase 2.5 checks the plan's `## Codex Adversarial Review` section.
If the same architectural decisions you are about to implement were already converged in
the plan-codex review and no new decision was introduced, the implement-codex review is
skipped — a single line is written into `## Codex Implementation Review` noting
"decision-set already converged in mccp-plan-codex review". This prevents double-paying
review cost on the same content. Identical dedupe applies between implement-codex and
PR-codex.

## Forbidden phrases

The autonomous contract is broken if a command body emits any of:

- "Codex 호출 진행할까요?" / "shall I invoke Codex?"
- "receipt 직접 작성해주세요" / "execute the receipt CLI manually please"
- "/mccp:prp-implement 직접 실행해주세요" / "the next step is for the user to run"
- Any yes/no/proceed/confirm request between sub-steps (the auto-CRITICAL STOP is the
  one exception)

The hook layer enforces the surface contract — receipts must exist before downstream
gates run — but the command body is what makes the gate **autonomous** rather than
turn-by-turn.

## What mccp deliberately omits

The original ECC rule text covered several concepts mccp does not own:

- **Plan-Impeccable / Implement-Impeccable / PR-Impeccable** design gates. mccp does not
  bundle the impeccable skill. If installed separately, the receipt CLI still accepts those
  gate IDs so the chain remains consistent.
- **`multi-plan`, `multi-execute`, `multi-frontend`, `plan-prd`, `prp-plan`, `prp-pr`,
  `feature-dev`** — these belong to the ECC origin marketplace. mccp keeps `/mccp:plan`
  / `/mccp:prp-implement` / `/mccp:pr` / `/mccp:code-review` only.
- **Tier-2 receipt schema fields** (status, reason, rounds_completed, last_error,
  blocking:true) — deferred for a later mccp release if needed.

## Single-pass review toggle

`MCCP_REVIEW_SINGLE_PASS` (v1.27.3, review-loop-bypass M1) is a per-task opt-in that
removes the **repetition** in the review loop without removing the review. Its value is
its reason — one of `scope_too_small` / `deadline_pressure` / `deferred_to_prd_completion`
— because a separate reason variable can be forgotten, and a forgotten reason cannot be
audited. Anything outside that set fails closed to OFF with a loud warn.

The parser and the effective-cap oracle live in
[`lib/review-single-pass.js`](../plugins/mccp/scripts/lib/review-single-pass.js). The
decision oracle never reads env; the CLI injects the parsed result.

### The relaxation boundary

Exactly one return in `decideReview` changes behaviour: the `quorum.passed !== true`
branch returns `block:false` instead of `block:true`. Everything else is untouched, and
the reason is structural rather than a list of checks — the relaxation sits *below* every
other blocking return, so the toggle is never even consulted on those paths.

| Path | Relaxed? | Why |
|---|---|---|
| L1 `divergent` / `inconclusive` | No | L1 is inviolable (UI7). Its branch returns above the relaxation. |
| L2 artifact missing / unreadable | No | There was no review to be single-passed. |
| L2 `responded === 0` | No | Nobody answered. |
| L2 budget skip | No | The panel never fired. Returned in `cmdDecide` before the oracle is called at all. |
| DD13 plan-hash mismatch | No | An integrity fact, not a review opinion. |
| hybrid without a converged L3 | No | "Requested" is not "happened" — the eligibility test carries this precondition itself. |
| L2 quorum not satisfied | **Yes** | The panel looked and objected. That objection is recorded, not erased. |

The distinction the table turns on is `divergent` ("we looked and found a defect") versus
`unavailable` ("we could not certify"). Passing the second would not be a single pass; it
would be no pass.

The hybrid row needs its own guard because `decide.js`'s hybrid block runs only on the
quorum-PASSED path. A relaxation placed in the failure branch would never reach it, so the
eligibility predicate re-states the precondition inline (`mode !== 'hybrid' ||
l3Corroborated(o)`).

### What the receipt says

Nothing is laundered. `resolution.review_verdict` seals the real `divergent`, so the
dashboard, `evidence-audit`, and the ship gate all keep reading it as non-approving, and
cross-gate dedupe stays shut (`isCrossModelCorroborated` demands `converged` first).
Two present-only meta fields carry the audit trail, and they are **different axes** —
the same split §3.12 paid for with `codex_disabled` vs `codex_disabled_at_pr`:

- `meta.review_single_pass_reason` — the toggle was SET (env ambient; an explicit flag wins).
- `meta.review_single_pass_bypassed_verdict` — a bypass was APPLIED (explicit flag only).

The schema enforces both directions.

**Forward**: a bypass claim requires a reason and a sealed `divergent` verdict —
`divergent` specifically, not "anything but converged". `converged` had nothing to bypass,
and `unavailable`/`skipped` are verdicts DD2 never relaxes, so a bypass claim beside one of
those asserts an event the gate cannot produce.

**Reverse**: on a `mccp-plan-codex` receipt with a `divergent` verdict and a panel source,
the discriminator is the **proof shape**, not the source name. Both sources read
`review_proof.layers`, each looking at the layers its own axis has — `multi-agent` at L2
alone, `hybrid` at L2 and L3:

| source | relaxation shape | flag |
|---|---|---|
| `multi-agent` | `layers.l2` non-converged | required |
| `multi-agent` | anything else (L1 collapsed, so L2 is null or converged) | forbidden |
| `hybrid` | `layers.l2` non-converged AND `layers.l3 === 'converged'` | required |
| `hybrid` | anything else (notably a dissenting L3) | forbidden |

Each branch both requires the flag on the relaxation shape and forbids it elsewhere.
Requiring without forbidding lets a dissenting L3 — which DD2 explicitly refuses to relax —
be dressed up as a genuine bypass; forbidding without requiring lets a real relaxation ship
unmarked. Binding to the source name alone fails the same way one step earlier: it would
force an honest record of an L1 collapse to claim a bypass that never happened, since the
only thing making that receipt otherwise impossible is command-body prose the schema cannot
see. An `unavailable` panel receipt is outside all of this and is recorded honestly with no
bypass claim.

### Why santa-loop refuses instead of capping

`/mccp:santa-loop` is invoked by a person, not fired by the three gates, so "does not
fire" has to be implemented in the santa CLI itself. `begin-round` checks the toggle
**before** `ledger.beginRound`, which is why the refusal leaves the ledger untouched and
consumes no cap. It reuses exit 2 with `reason:"SANTA_SINGLE_PASS_ACTIVE"` rather than
minting a code, since 12 is reserved for `cap_reached` and would be misread as an
exhausted loop. No receipt is written: `mccp-santa-review` is produces-only, and a
"did not fire" receipt would require the schema to accept a receipt with no round tally —
the opposite of a change already queued in the backlog. The audit anchor is the loud
refusal plus the absence of a ledger entry.

### What this does NOT claim

The round loops in `plan.md` and `prp-implement.md` are still prose an LLM follows. What
is mechanical is (a) the cap computation and its tests, (b) `pr.md` exporting a pinned cap
to the codex-runner child, which cannot read past what it inherits, (c) the receipt
sealing the toggle state for after-the-fact audit, and (d) a static test asserting all
three bodies read the shared oracle instead of their own literal. (d) catches a gate left
out of the wiring; it does not catch an LLM disregarding prose. The L2 cost is still paid
once.

### Backlog capture is a precondition of the relaxation (M2)

The findings the toggle drops are appended to `.claude/plans/codex-findings-backlog.md` by
`5.2g2`, between the proof verification (`5.2g`) and the review record (`5.2h`). Both
neighbours are load-bearing: appending *before* `5.2g` would enter the findings of a run
whose proof never verified into the ledger, and appending *after* `5.2h` would leave the
record unable to carry `backlog_appended` — the anchor `assert-backlog-parity` reads,
exactly as `assert-single-round` reads `halt_stage`.

**A failed capture blocks (`EX_BLOCK`).** This is the same line DD2 already drew, not a new
one: `divergent` ("we looked and found a defect") may be relaxed and `unavailable` ("we
could not certify") may not, and "we could not write the defect down" belongs to the
second kind. Making the capture a side effect instead would leave exactly the debt M1
created — the objection disappears while the receipt records a pass.

The recovery is **turning the toggle off**, not a new escape hatch. M2 adds no environment
variable at all: a switch that disables capture is a switch that enables loss. With the
toggle off the run returns to the ordinary non-convergence HALT and the author absorbs the
findings from the review record, so the worst failure mode is "the toggle does not help
here" rather than "the findings vanished".

**What is appended is `quorum.blockingFindings`, exactly.** That array is what the toggle
drops, so capture set and relaxation set must be the same set for "no loss" to hold as
arithmetic. `l2.json` is never an append source — a second input for the same fact leaves
the oracle unable to say which is canonical — though it is read for the *count* of
non-blocking findings, recorded as `null` rather than `0` when unreadable. `UNKNOWN` and
synthesized `FAIL` rows are appended with the rest: capture is not adjudication, and
filtering them would be M2 quietly redoing the severity judgement §3.14 owns.

**The table stays four columns.** `derive/sources/backlog.js` pins that header literally,
so a fifth column would make the parser miss the table entirely and every existing row
would disappear at once. The path reference and the idempotency tag therefore live inside
the Finding cell, and everything entering a cell is escaped first — pipes to a numeric
character reference (markdown renders it as a pipe; the parser does not split on it),
whitespace folded, and truncation applied to the raw text *before* escaping so no partial
entity can survive.

## Hybrid L3 wiring

`MCCP_PLAN_REVIEW=hybrid` (v1.31.0, codex-intent-context M3) adds a Codex layer on
top of the L1+L2 panel. Every piece of it — the composition oracle
([`decide.js`](../plugins/mccp/scripts/lib/plan-review/decide.js)), the schema
fields, `review_source: 'hybrid'` in `CROSS_MODEL_SOURCES` — shipped with M1. The
execution path did not, and M3 is the wiring alone. Firing-target selection (which
plans deserve L3) stays with `diverse-agent-review.prd.md`.

### What was broken

`plan.md` 5.2f Step 1 told the operator to run 5.2z's Codex block *verbatim*. That
block launches [`plan-codex-runner.js`](../plugins/mccp/scripts/lib/plan-codex-runner.js),
whose job is to write the `mccp-plan-codex` receipt — and on the panel paths 5.6b
writes that receipt. So the instruction produced one of two outcomes, neither of
them hybrid:

- the runner won the race and sealed a receipt before L1/L2 proof existed, or
- nothing set `$CODEX_STDOUT` (hybrid never enters 5.2z's block, where it is
  assigned), 5.2f wrote `invoked:false`, and `decide` fell to `unavailable` —
  a mode that always HALTs.

### What M3 changed

L3 got its own subcommand, `plan-review/cli.js l3`, which writes the L3 inputs and
nothing else: no receipt, no adjudication, no lock. Blocking authority stays with
`decide`, so there is exactly one place a reader looks to find what stopped a gate.

The double-writer problem is closed by **subtraction, not sequencing**. Ordering
the two writers would have kept two writers; not launching the runner means the
ordering requirement does not exist. What remains is a static assertion —
`plan-codex-runner` appears zero times in 5.2f — pinned by
[`plan-review-command-body.test.js`](../plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js).

| Piece | Before | After |
|---|---|---|
| L3 invocation | "run 5.2z verbatim" (launches the receipt writer) | `cli.js l3`, detached |
| Record production | `printf` from a shell variable | `buildL3Record` in Node |
| Staleness guard | none | `run_nonce` **inside the record**, compared by the poll |
| Bridge artifacts | 5.2z only | `l3` (hybrid) or 5.2z (codex) — same filenames, 5.6b unchanged |
| hybrid without L3 | full panel, then a determined HALT | 5.2a-0 halts first, **zero agents** |

`run_nonce` lives in the record rather than the filename because `l3.json`'s name
is fixed — both `decide` and 5.6b read it by that name — so unlike 5.2z, which
owns its artifact names, the discriminator has to travel in the body.

**It discriminates staleness, not concurrency.** A record left by an earlier,
finished run is rejected; two *overlapping* `/mccp:plan` runs in one worktree are
not made safe by it, because `l3-run-nonce` has a fixed name too and the second
launch overwrites it. That is a `REVIEW_DIR`-wide property rather than an L3 one —
`l1.json`, `l2.json`, `decision.json`, `proof.json`, `reservation.json` and
`mode.json` all collide the same way, which is why Phase 5.2 purges the whole set
at entry. Run concurrent gates in separate worktrees (§3.8). Making one worktree
safe for overlapping gates would need a lock over the whole of 5.2, or
nonce-scoped staging with an atomically published manifest; both are tracked in
the backlog and neither is L3-specific.

On the hybrid path 5.6b reads the Codex verdict — and the `review_l3_reason` that
annotates it — out of `l3.json` rather than the `codex-verdict` bridge file, and it
**re-checks `run_nonce` itself instead of inheriting the poll's check**. The poll is
an earlier fenced block and `l3.json`'s name is fixed, so without a second check a
third overlapping run could swap the record in between; with it, the verdict the
receipt seals and the record the poll accepted genuinely cannot come from different
runs. A mismatched or absent nonce yields an empty value, which drops the flag —
fail-closed, dedupe stays shut. The `mode=codex` path still reads the bridge file:
5.2z is its only producer there.

The record is built in Node because the shell version emitted `"verdict":""` from
an empty variable, and after a fenced-block boundary an empty variable is the
normal case. `REVIEW_VERDICT_VALUES` forbids that value; `decide.js` had to defend
against it downstream. `buildL3Record` cannot construct it.

### Poll states

`l3` writes four artifacts — `codex-verdict`, `codex-class`, `l3-findings.json`,
then `l3.json` **last**, so its presence implies the other three landed. That is
what makes polling for one file sufficient. Four tmp+renames are four atomic
operations, and ordering is the only guarantee available; a failed write of any of
them is `exit 12` with no `l3.json` at all.

The two bridge files have **no reader on the hybrid path** — 5.6b takes the verdict
from `l3.json` (above) and `mode=codex` never runs this subcommand. They are kept
because DD5 made the filenames a shared contract with 5.2z, and because they are the
plain-text trace of the same record. The all-or-nothing rule is therefore not about
a missing reader: it is that `l3.json` is the completeness signal, so a directory
that could not take all four must not be left holding one that claims otherwise.

| State | Meaning | Result |
|---|---|---|
| `succeeded` | `l3.json` present, `run_nonce` matches | continue to 5.2e |
| `still-running` | 540s block window elapsed, deadline not reached | re-run the poll block |
| `nonce-mismatch` | the record belongs to another run | HALT (`--halt-stage 5.2f`) |
| `died-without-record` | the process is gone and wrote nothing | HALT |
| `timeout` | 1000s deadline passed | HALT |
| `not-launched` | Step 1 never ran | HALT |

The deadline and the nonce are artifacts, not variables: the poll is a later
fenced block, and a poll that re-derived its own deadline would restart the clock
on every re-entry and could never time out.

### Recovery

Both variables are required. `MCCP_PLAN_REVIEW=hybrid` alone stops at 5.2a-0 with
the two ways out named: set `MCCP_PLAN_REVIEW_L3=1` to actually run hybrid, or
`MCCP_PLAN_REVIEW=multi-agent` to drop the layer. A HALT inside 5.2f names its
state; recovery is to re-run Phase 5.2, never to hand-write `l3.json`.

## References

- Receipt CLI source: `plugins/mccp/scripts/receipt/`
- Receipt hooks: `plugins/mccp/scripts/hooks/`
- Command bodies that implement the gate inline: `plugins/mccp/commands/plan.md`,
  `plugins/mccp/commands/prp-implement.md`
- Codex Skill (external dependency, installed separately):
  [openai-codex Claude Code plugin](https://github.com/openai/codex-plugin-cc)

---

## v0.2.2 — Codex Invocation Path + Mode + Auto-Chain

### Codex Invocation Path

The Skill interface `codex:adversarial-review` does not exist in the codex plugin's skill index (only `codex:codex-cli-runtime`, `codex:codex-result-handling`, `codex:gpt-5-4-prompting`), and the `/codex:adversarial-review` slash command has `disable-model-invocation: true` blocking model-driven auto-invocation. v0.2.2 replaces both paths with a **fail-closed Bash wrapper**:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review --focus "..." --json
```

See [scripts/lib/codex-invoke.js](../plugins/mccp/scripts/lib/codex-invoke.js). The wrapper resolves codex plugin via `~/.claude/plugins/installed_plugins.json`, verifies companion interface (`scripts/codex-companion.mjs` exists + plugin.json version matches compatible list `["1.0.x"]`), then spawns the companion via `process.execPath`. All non-`ok` classifications are blocking by default. Exit 12 = blocking, exit 0 = ok or advisory.

Classification enum (see CLAUDE.md §3.3 table):
`ok` / `registry-missing` / `registry-malformed` / `plugin-not-installed` / `install-path-stale` / `companion-not-found` / `companion-version-mismatch` / `not-authenticated` / `timeout` / `exit-nonzero` / `stdout-empty` / `spawn-enoent` / `parse-error`

### Mode

`MCCP_RECEIPT_GATE_MODE` env (`hard` default, `soft` opt-in, `off` debug-only). See [scripts/lib/receipt-mode.js](../plugins/mccp/scripts/lib/receipt-mode.js).

- `hard`: receipt-prompt.js + receipt-skill.js block on any missing/stale/blocking/critical. validate-cmd.js treats `meta.codex_skipped=true` and `meta.advisory=true` as non-approving.
- `soft`: ONLY missing receipts pass. Stale, schema-invalid, CRITICAL Open Questions still block.
- `off`: Hook bypass with loud stderr warning. Chain-of-custody is broken; use for debugging only.

### Auto-Chain

[scripts/lib/auto-chain.js](../plugins/mccp/scripts/lib/auto-chain.js) is a decision API (not an executor):

- `check --next-step <s>` → returns `{should_abort, reasons[]}`. 8 abort triggers.
- `preflight <step>` → R2#2 terminal advisory rejection for `pr` step.
- `record-step --step --status` → appends to STATE.md `chain_progress`.

shouldAbort() checks: kill switch env, STATE.md `chain_aborted`, previous step failed, receipt validate failures (missing/stale/blocking/critical), and **cost telemetry from `~/.claude/plugins/data/mccp/cost-current.json`** (missing/stale/unreadable/`hard_ceiling_reached`).

Cost writer ([scripts/lib/cost-state.js](../plugins/mccp/scripts/lib/cost-state.js)) uses **lockfile + monotonic merge**:

- Lockfile `cost-current.lock` opened with `wx` (O_EXCL). 5 retries × 20ms.
- **Unconditional sticky merge** (R2#1): `hard_ceiling_reached = prev OR new`, `cost_usd = max(prev, new)` regardless of `last_write_ts`. A stale older-true event still turns ceiling on.
- Canonical path: `os.homedir()/.claude/plugins/data/mccp/`. Never cwd-relative.

Terminal `pr` advisory rejection (R2#2): runs in two layers as defense-in-depth:
1. `pr.md` Phase 0 preflight (before `gh pr list`, before any GitHub API)
2. `auto-chain.js preflight pr` (before invoking `pr.md` from chain)

---

## v0.2.7 — Silent Hook UX (Observability Surface)

**Goal**: ALLOW-path silent failure 제거. UserPromptExpansion hook이 통과시키고 다운스트림이 침묵하는 시나리오를 hook surface로 가시화.

**Positioning**: observability + recovery hint system. **No trust claim. No machine-enforced attestation.** Operates strictly within Claude Code's documented hook API surface.

### Layered Design v3-minimal

| Layer | Priority | What it does |
| --- | --- | --- |
| **L1** | P0 | Per-invocation shard ledger at `.claude/state/hook-trace/<session_id>/<tool_use_id>-<phase>.jsonl`. Write-time allowlist enforced (C6 — event payload only). Per-shard cap 64KB / 100 entries. Global 100MB via SessionStart LRU evict (active-lease guarded). Atomic temp+rename; malformed shards auto-quarantine. |
| **L2a** | P1 | `MCCP_RECEIPT_DEBUG=1` + ALLOW path → `systemMessage` emit from `receipt-prompt.js`. v0.2.5 block-payload inline mode preserved orthogonally. Advanced opt-out: `MCCP_RECEIPT_DEBUG_LEGACY_INLINE=0`. |
| **L2b** | P0 | `PostToolUseFailure` surface (`post-tool-use-failure.js`). Reads event payload (`tool_use_id`, `tool_name`, `error`) and emits `systemMessage` + `hookSpecificOutput.additionalContext`. L1 shard write is opportunistic — surface keeps working even if L1 is disabled. |
| **L2c** | P1 | `claude --version` external probe at SessionStart (`session-start-trace-injector.js` + `hook-caps.js`). Cache at `.claude/state/hook-caps.json` with provenance: `version`, `probed_at`, `binary_path`, `stderr_capture`, `supported_features`. Probe fail OR `version < 2.1.141` → minimum-spec mode (systemMessage only). Cross-session crash alerts injected as `<system-reminder>` blocks (≤3, active lease respected). |
| **L5** | P1 | `SessionEnd` marker + compactor (`session-end-trace.js`). Writes `.end` marker, consolidates per-shard files into `consolidated.jsonl`, releases lease. Anchored to `SessionEnd` event (C1 — "Pre-Stop" does not exist). Active-session lease guard prevents touching concurrent session dirs (C3). |
| **G1** | P0 | Loud Fail-Open invariant. `receipt-prompt.js` + `receipt-skill.js` route all internal exceptions (module load, validate execution) through `g1Allow(...)` → opportunistic L1 shard write + `systemMessage` emit + return ALLOW. Silent fail-open is now a regression detectable by `g1-guard.test.js`. |

### Event-shape contract (G1 fail-open per hook event)

| Hook event | ALLOW shape | Fail-open behavior on internal error |
| --- | --- | --- |
| `UserPromptExpansion` | `{decision:"block", reason}` on block; silent (exit 0) on allow | `systemMessage` + `hookSpecificOutput.additionalContext` via `g1Allow`. Decision = allow. |
| `PreToolUse` (Skill) | exit 2 + stderr on block; exit 0 on allow | Same as above with `hookEventName: "PreToolUse"`. Decision = allow. |
| `PostToolUseFailure` | `systemMessage` + `additionalContext` always | Last-ditch `systemMessage` with `internal error` message; exit 0 (never escalate). |
| `Stop` | advisory | Caller-defined; v0.2 stop-loop preserves existing semantics. |
| `SessionEnd` | advisory | runSync is sync best-effort; failures logged to debug stderr only. Marker + compactor failures never block SessionEnd. |

### MUST constraints (R3 critical issues — non-negotiable)

| # | Constraint | Where enforced |
| --- | --- | --- |
| **C1** | End-marker writes anchor to `SessionEnd` hook ("Pre-Stop" does not exist) | `session-end-trace.js` |
| **C2** | `.claude/state/hook-trace/` listed in `.gitignore` from milestone's FIRST commit | `.gitignore` + Task 2.5.0 commit |
| **C3** | SessionStart LRU eviction respects active-session leases | `hook-trace.js#evictLRU` + lease guard in `scanCrashAlerts` |
| **C4** | Atomic temp + rename per shard write; malformed shards auto-quarantine; `hook-caps.json` corrupt → reprobe | `hook-trace.js#appendShardAtomic` + `quarantineShard`; `hook-caps.js#readCache` |
| **C5** | `systemMessage` user-visibility integration-tested before L2a ships | `hook-trace-integration.test.js` |
| **C6** | "live hook state" = event payload only — allowlist enforced at write | `hook-trace.js#SHARD_ENTRY_FIELDS` + `validateEntry` |
| **C7** | `MCCP_RECEIPT_DEBUG` precedence table includes unset default | `ENVIRONMENT.md` precedence table |
| **C8** | `claude --version` probe records binary path + stderr; attempted-feature-use fallback when probe fails | `hook-caps.js#probeBinary` + `buildPayload.stderr_capture` |

### Accepted blind spots

| ID | Scenario | Mitigation |
| --- | --- | --- |
| **B1** | `StopFailure` event fires + user does not resume | Manual ledger inspection via `/mccp:trace` |
| **B2** | Power loss before shard write completes | Data loss accepted; atomic rename narrows the window to a single line |
| **B3** | In-session Claude Code binary upgrade | Restart required for new probe; cache stays valid until next SessionStart |
| **B4** | Concurrent ledger global ordering across shards | Per-shard ordering preserved; cross-shard global ordering is not guaranteed |
| **B5** | L0 subagent contract attestation | Out of v0.2.7 scope — deferred to W2 workstream (separate plan). Hook API has no cryptographic transport so self-reported stamps are forgeable. |

### Origin trace

- Source incident: 2026-06-05 — `MCCP_RECEIPT_DEBUG=1` with `/mccp:pr` failure produced zero output (silent block due to v0.2.6 schema-bump forward-migration miss; see INC-001 in roadmap plan).
- Brainstorming: Claude(자체) + subagent + Codex GPT-5.4 via `codex exec`.
- Adversarial review: `mccp:santa-loop` R1 → R2 → R3 (v3-minimal converged after specific spec-gap findings).
- INC-001-R3 absorbed: block-path observability is the same UX problem as ALLOW-path silent fail, now covered by L2a + G1.

---

## CLAUDE.md 게이트 섹션 원문 아카이브

CLAUDE.md §3.6 / §3.9 / §3.10이 싣던 **원문 전문**이다(합 22,725 B). CLAUDE.md는 세션마다
자동 주입되는 지시문이라 그만큼을 이고 갈 수 없어, 원문을 손실 없이 여기로 옮기고
CLAUDE.md에는 현재 유효한 규칙·트리거·복구 절차만 남겼다.

**여기 있는 것은 배경이다 — 계약이 아니다.** 운영 규칙은 전부 CLAUDE.md에 남아 있다.

### atomic-state-locks

CLAUDE.md §3.6의 원문이다. 한 글자도 다듬지 않았다 — 이전이 재작성으로
변질되지 않았음을 줄 단위로 기계 검증할 수 있어야 하기 때문이다.

### 3.6 Atomic state locks (`pr-phase.lock` + `quarantine.lock` + `evidence write lock`)

v0.2.8 Task 2.6.1-followup F10+F11+F7 (PR #8)부터 mccp는 state lock을 운용합니다(v1.23.1에서 **세 번째** lock 추가). 셋 다 단일 writer + multi-reader, lease-based reclaim, heartbeat를 **공유**하지만, **ownership-token 모델과 실패 정책은 서로 다릅니다** — `pr-phase.lock`은 hash + stdin-pipe sealed channel(canonical), `quarantine.lock`은 raw-token/advisory(lock body 평문 token, 0o600 보호), evidence write lock은 raw-token/advisory이면서 **유일하게 fail-closed**입니다. 아래 락별 구분을 참조하세요("공통"으로 뭉뚱그리지 말 것).

| Lock file | 사용처 | 생명주기 |
|---|---|---|
| `<repo>/.claude/state/pr-phase.lock` | `/mccp:pr` Phase 3.5 Codex-review subphase 진입/이탈. PreToolUse가 write-tool block 결정에 사용. | enter (Phase 3.5 직전) → exit (PR 본문 inject 직후, gh pr create 직전). crash 시 다음 invocation의 `detect-stale`이 finalizer 우선 실행 후 clear. |
| `<repo>/.claude/receipts/.migrations/v0.2.8-generic-quarantine.lock` | validate-cmd / `/mccp:pr` Phase 0 부팅 시 동시 trigger 직렬화. winner만 rename 수행, loser는 marker complete bounded poll. | acquire (`fs.openSync wx`) → release (try/finally). |
| `<target>.lock` (receipt 파일별 · claim 파일별) — [evidence-lock.js](plugins/mccp/scripts/receipt/evidence-lock.js) | v1.23.1 multi-session-work-loop M3. **모든** receipt write(`store.js#writeReceipt`/`updateReceipt` · briefing/completion-ledger 메타 stamp)와 모든 claim mutation을 감싸는 짧은 임계구역. | acquire → base-hash 캡처 → claim fence → 원자 rename(retry 안에서도 heartbeat) → post-rename 검증 → release. 한 호출 안에서 완결(helper IPC 없음). |

#### evidence write lock이 앞의 둘과 다른 점 (v1.23.1)

- **실패 정책이 fail-closed**입니다. `session-ledger.js#withLedgerLock`은 획득 실패 시 경고만 남기고 lock 없이 진행하는데(last-writer-wins), 그 동작이 PRD가 구조적 취약으로 지목한 결함 자체라 여기서는 **throw**합니다(`EVIDENCE_LOCK_UNAVAILABLE` — 에러에 lock 경로·잔여 lease·복구 지침·kill switch 포함). 단 **caller별 비대칭은 의도적**입니다: `writeReceipt`는 fail-closed, hash-carved 메타 stamper 2건(briefing · completion-ledger 진단)은 fail-open + loud skip.
- **lease(5s)가 PID liveness와 무관하게 항상 적용**됩니다. `pr-phase-lock.js`의 tri-state("same-host + pid alive → 절대 reclaim 안 함")를 **차용하지 않습니다** — 그 정당화는 분 단위 lock에만 성립하고, ms 단위 임계구역에서 live holder의 lease 초과는 *작업 중*이 아니라 **고장**이라 tri-state + fail-closed 조합은 해당 receipt를 영구 차단합니다. liveness는 reclaim을 *막는* 조건이 아니라 lease 이전에도 즉시 reclaim하게 하는 **추가 trigger**입니다(dead PID·cross-host → 즉시).
- **파일명 규약이 강제**입니다: lock은 `.lock`, tmp는 `<target>.<pid>.<rand>.tmp`. `.gitignore`가 `mccp-pr-codex/*.lock`·`*.tmp`만 재무시하므로 다른 이름은 git-tracked ship receipt 디렉토리를 오염시킵니다. tmp 이름이 고정이면 동시 writer가 tmp에서 충돌하므로 pid + nonce가 필수입니다.
- 보증 범위와 명시된 잔여는 [docs/multi-session-work-loop/evidence-conflict-design.md](docs/multi-session-work-loop/evidence-conflict-design.md) §1 참조. **무조건적 상호배제를 주장하지 않습니다** — `rename`은 advisory lock에 대한 CAS가 아닙니다.

#### Ownership-token 모델 (락별 상이 — "양쪽 공통" 아님)

**`pr-phase.lock` — canonical hash + stdin-pipe sealed channel** ([`pr-phase-lock.js`](plugins/mccp/scripts/lib/pr-phase-lock.js))

```json
{
  "ownership_token_hash": "<sha256 of writer-side random token>",
  "pid": 12345,
  "host": "<hostname>",
  "started_at": "<ISO>",
  "mtime": "<lease anchor>"
}
```

- **`ownership_token_hash` (v0.2.8 F11 redesign)**: writer가 `crypto.randomUUID()`로 생성한 token의 sha256만 lock body에 기록. raw token은 writer 메모리에만 존재. release 시 writer가 stdin pipe로 raw token을 helper에 sealed channel로 전달 → helper가 hash 재계산 후 match → unlink. 외부 reader가 lock 파일을 읽어도 token을 위조할 수 없음 (F11 IPC contract). 이전 `ownership_token` (raw token 기록) 방식은 v0.2.7 schema로 deprecated.
- **Stdin-pipe IPC contract**: writer ↔ helper 간 모든 mutating call (enter/exit/release)은 stdin pipe로 token 전달. command-line argument로 token 전달 금지 — process listing 노출.

**`quarantine.lock` — raw-token / advisory** ([`migrations/v0.2.8-generic-receipt-quarantine.js`](plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js))

```json
{
  "pid": 12345,
  "started_at": "<ISO>",
  "host": "<hostname>",
  "token": "<raw crypto.randomUUID() — 평문>"
}
```

- **raw token in-body**: `acquireLock`이 `crypto.randomUUID()` token을 lock body에 **평문**으로 기록합니다(hash 아님, stdin-pipe 아님). `0o600` owner-only 파일 모드로 shared-tenant에서 타 사용자 read를 차단. `releaseLock`은 `body.token === token` ownership 일치 시에만 unlink(zero-byte / unparsable / mismatch는 unlink 안 하고 lease reclaim에 위임).
- **잔여 리스크 (문서화된 것 — "무해"로 단정 금지)**: `releaseLock`에 **no-token legacy 경로**가 있습니다 — 호출자가 token 없이(`undefined`/`null`) release하면 ownership 검증 없이 unlink합니다(단 loud stderr warn). 현재 유일 호출자 `migrate()`는 **항상 token을 전달**하므로 실제 트리거 caller는 없지만, legacy / 직접 호출자가 이 경로를 타면 live holder의 락을 삭제할 수 있습니다. code hardening(no-token 경로 제거 / test-gate)은 PRD out-of-scope로 [backlog](.claude/plans/codex-findings-backlog.md)에 이연했고 P6은 문서만 정정합니다.

#### 공통 (양쪽 실제 공유) — lease + heartbeat

- **Lease + heartbeat**: orphan 판정은 `(recorded PID is dead via process.kill(pid, 0))` OR `(file mtime > 60s)`. 둘 중 하나라도 만족 시 reclaim. v0.2.7 이전의 `started_at` 기반 판정은 clock skew / PID reuse에 약함 — 폐기.
- **In-loop heartbeat**: 장기 작업(quarantine migration 8+ rename)이 lock 점유 중에는 25 step마다 `fs.utimesSync`로 mtime을 갱신해 live holder 보호. sync 함수에서는 `setInterval`이 fire 안 되므로 in-loop counter가 정답.

#### Legacy v0.2.7 upgrade scenario (host-aware tri-state)

v0.2.7 lock holder가 살아있는 동안 v0.2.8 binary가 부팅하면, v0.2.8은 v0.2.7 schema lock(=`ownership_token` raw value, no hash)을 발견합니다. F11 R2-F2 absorption per:

- `cmdEnter` startup pre-check + `tryReclaimStaleLock`의 legacy-schema discriminator가 (lock에 `ownership_token_hash` 부재) detect.
- Same-host + pid alive → **NEVER reclaim**. v0.2.7 holder가 정상 종료할 때까지 대기 또는 caller exit 75 (EX_TEMPFAIL).
- Different-host OR pid dead → 즉시 reclaim. 양쪽 schema 모두 정상 처리.

이 tri-state가 없으면 v0.2.8가 v0.2.7 live holder를 강제 reclaim → race 발생. PR #8의 R2-F2 commit이 핵심.

운영 detail (수동 quarantine 절차 + tempfail propagation 등)은 §4 cheat sheet의 "Generic-receipt quarantine runbook" 참조. lock 파일은 직접 편집 금지 — schema mismatch / token mismatch 시 release가 실패해 mtime 만료(60s)까지 차단됩니다.

---


### design-critique-loop

CLAUDE.md §3.9의 원문이다. 한 글자도 다듬지 않았다 — 이전이 재작성으로
변질되지 않았음을 줄 단위로 기계 검증할 수 있어야 하기 때문이다.

### 3.9 디자인 surface 변경 시 SKILL first-step + critique retry loop (v1.3.0-m2)

v1.3.0-m2부터 design surface를 건드리는 plan/implement/PRD는 `frontend-design-direction` SKILL의 **Output Constraints**를 Phase 진입 즉시 Read 후, impeccable critique을 bounded retry loop으로 돌립니다. M1이 silent-skip을 *관측*만 했던 axis를 M2는 *positive enforcement*로 닫습니다.

#### 언제 trigger (3-axis)

trigger는 OR — 한 축이라도 hit하면 SKILL Read + critique loop:

| Axis | Source | When |
|---|---|---|
| (a) detector positive | `impeccable-detect.js` `design_signal=true` | git diff에 UI 확장자/`.claude/design/*.design.plan.md`/whitelist path hit. 기존(M1). |
| (b) 좁은 whitelist 확장 | `DESIGN_SURFACE_PATHS` (M2 신규 3 path) | `impeccable-detect.js` 자체 / `design-critique-decide.js` / `skills/frontend-design-direction/` — design-gate control-plane 변경 자기-적용. `commands/*.md` 전체는 overshoot 회피로 제외. |
| (c) audited intent override | `MCCP_DESIGN_INTENT_REASON="<reason>"` env (strict validator — empty/1-token/URL-only/<30자/<3단어 reject) | 사용자가 "detector가 못 잡는 design routing 변경"을 명시할 때만. M1 `IMPECCABLE_FORCE_OVERRIDE_REASON` 룰 mirror. |

#### 4 출력 제약 (SKILL.md `## Output Constraints` anchor)

critique loop이 critique fail로 판정하는 anchor — M3 (output-constraints.js lint)가 같은 anchor를 mechanical 검증할 예정:

1. **정보 위계 3단계** — primary action → status → detail. Heading depth ≤ 3 in primary surface.
2. **강조색 화면당 1개** — Accent color/highlight token use ≤ 1 per viewport.
3. **raw markdown marker 금지** — Unrendered `**bold**`, MD0xx, stray inline code 미surface.
4. **한 화면 항목 수 상한** — `list-of-N` 섹션 상위 3개 expanded + 나머지 `<details><summary>+N more</summary>` collapse.

#### Bounded retry loop

| Round | Condition | Action |
|---|---|---|
| R0 | critique invoke + decideCritique enum | CONVERGED → 종료 / ESCALATE_NEXT_ROUND → R1 / DIVERGENT_UNRESOLVED → 즉시 종료 |
| R1~Rcap | critique fail 항목의 *명시 섹션*만 Edit | cap (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` default 2, 0~3) 도달 시 DIVERGENT_UNRESOLVED |

cap=0이면 R0 1회만 + verdict DIVERGENT_UNRESOLVED 즉시 — silent disable 불가 (loud stderr warn).

> `decideCritique` oracle의 실제 verdict enum은 정확히 `CONVERGED` / `ESCALATE_NEXT_ROUND` / `DIVERGENT_UNRESOLVED` 3종입니다([`design-critique-decide.js`](plugins/mccp/scripts/lib/design-critique-decide.js)). 본 문서 다른 위치의 `ESCALATE` / `DIVERGENT` 축약 표기는 각각 `..._NEXT_ROUND` / `..._UNRESOLVED`의 준말입니다.

#### Severity → fail (M2 oracle, F2 absorption)

`design-critique-decide.js#decideCritique`는 HIGH/CRITICAL/UNKNOWN(missing severity)을 fail-closed로 판정. lowercase/alias(`P0`/`P1`/`blocker`/`critical`) 모두 normalize. parse 실패 시 DIVERGENT (caller 책임).

#### Receipt audit trail

retry loop 결과는 `mccp-plan-codex` / `mccp-implement-codex` receipt에 4 신규 필드로 stamp:

- `meta.design_critique_rounds: int|null` — 실행 round 수
- `meta.design_critique_verdict: 'converged'|'divergent'|'skipped'|null`
- `meta.design_intent_reason: string|null` — axis (c) audited override reason
- `meta.pr_design_chain_skip_reason: string|null` — pr-step audited escape reason

#### PR step — critique invoke 제거 + chain-check 강제 (F3 absorption)

`/mccp:pr`와 `/mccp:prp-pr`는 critique retry loop을 **돌리지 않습니다**. 대신 Phase 1.6 preflight가 validate-cmd을 호출 — prior `mccp-plan-codex` + `mccp-implement-codex` receipt 중 어느 한쪽이라도 `design_critique_verdict='divergent'`이면 PR step BLOCK (gh 호출 전 exit 1, receipt 미작성). 이유:

- dual-review invariant 보호 — critique 결정은 plan/implement에서 수렴
- cross-gate dedupe과 충돌 회피
- `MCCP_DESIGN_CRITIQUE_MAX_RETRY`는 PR scope에서 무시

복구: prior gate에서 critique 재실행 (plan body / implement body fix 후 게이트 재진입) **또는** `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="<substantive reason>"`로 1회 advisory mode (strict reason validator). advisory mode 진입 시 receipt `meta.pr_design_chain_skip_reason` stamp + PR body `## Design Critique Chain Skipped` section auto-inject (canonical audit source).

#### 자기-적용 (dogfood)

본 M2 plan은 좁은 whitelist (axis b)로 자기-재현을 차단 — `impeccable-detect.js` / `design-critique-decide.js` / `skills/frontend-design-direction/` 변경은 detector positive로 인식됩니다. pre-ship dogfood는 `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1` test env가 보장합니다(critique invoke 결과를 mock해 retry loop 회귀를 강제). `.claude/cache/test-fixture-status.html`은 커밋물이 아니라 필요 시 test-time에만 쓰이는 임시 합성 파일이며 현재 tracked 상태가 아닙니다 — dogfood는 env 경로만으로 성립하므로 fixture 존재에 의존하지 않습니다 (M2 acceptance gate).

#### Produced-diff grounding lint (v1.18.22 — post-EXECUTE mechanical 게이트)

critique retry loop(위)은 EXECUTE *이전* plan/방향만 보고 produced diff는 절대 보지 못합니다. v1.18.22는 그 gap을 닫는 **별도 locus**의 post-EXECUTE mechanical 게이트를 `/mccp:prp-implement` Phase 3.7에 추가합니다(같은 PRD의 advisory `Phase 3.6 DESIGN FINISH` 뒤 — polish가 편집한 최종 diff를 lint) — critique의 divergent-block(§3.9 retry loop)은 그대로 두고 그 위에 얹는 구조(중복 아님, [[feedback-impeccable-full-delegation]] 해석 A: advisory → mechanical).

- **3-step 계약**: Phase 2.5.5c가 impeccable 방향 + pre-EXECUTE rendered-surface 스냅샷을 캡처(신규 LLM 호출 0, artifact write only) → per-task loop가 4 Output Constraints를 implementation context로 소비 → Phase 3.7이 produced rendered-surface delta를 source-diff-safe **H15**(heading depth ≤ 3) anchor로 lint(`lintProducedDiff`+`decideGrounding`, pure function). dirty worktree에서도 capture 시점 버킷을 per-bucket line-set 차감해 EXECUTE delta만 격리(Codex F2).
- **scope**: rendered surface(`.css/.scss` · `.tsx/.jsx/.vue/.svelte/.astro` · `.html` · `.claude/cache/*.md`)의 *added line*만. generic `.md`(command doc/plan/README/CHANGELOG)는 제외 — `####` 다수에 H15 오발화 회피. control-plane-only 변경은 no-op. H17(nested-card)은 DOM-aware라 added-line 버킷서 enforce 불가 → renderer full-HTML lint이 계속 소유(Codex F1, backlog).
- **verdict enum 5종**: `grounded`/`anchor_clean`/`inconclusive`/`violations`/`skipped`. receipt `meta.design_grounding_captured`(gate-time bool) + `meta.design_grounding_verdict`(post-EXECUTE enum) — present-only(migration 불필요). verdict는 field-preserving restamp(`cli.js restamp-grounding`, Codex F3 — `design_critique_*`/routing 보존)로 `receipt_hash` 재봉인. read 실패 시 enforce는 silent no-op이 아니라 `inconclusive` block(Codex F4).
- **게이트 조건은 shell-state 독립**: consume/verify/restamp + 2.5.6 forward는 비영속 `DESIGN_GROUNDING_CAPTURED` flag가 아니라 capture 아티팩트(restamp는 result JSON) 존재 + `$ARGUMENTS` 재파생 slug로 self-derive — separate Bash invocation에서 mechanical 게이트가 silent no-op 되지 않도록([[feedback-loud-fail-open]]). 모든 artifact 경로는 `git rev-parse --git-path`(worktree-safe, `.git/` hardcode 0).
- **모드/복구**: `MCCP_DESIGN_GROUNDING=off|warn|enforce`(default enforce, §4 토글). enforce `violations`/`inconclusive` → fix-task + bounded retry(`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 공유 cap) 후 hard-stop. 복구는 rendered-surface 라인 수정 후 게이트 재진입 **또는** `MCCP_DESIGN_GROUNDING=warn` advisory pass. pr/code-review(review-only invariant) 미적용 — implement-only.

---


### impeccable-routing

CLAUDE.md §3.10의 원문이다. 한 글자도 다듬지 않았다 — 이전이 재작성으로
변질되지 않았음을 줄 단위로 기계 검증할 수 있어야 하기 때문이다.

### 3.10 Stage-aware impeccable command routing (v1.13.0 M1)

v1.3.0-m2의 design-critique는 impeccable `critique` 하나만 호출했습니다. v1.13.0-m1은 디자인 라이프사이클 단계에 impeccable 명령군을 매핑하는 **stage-aware routing oracle**(`scripts/lib/impeccable-routing.js`)을 도입합니다. critique은 여전히 §3.9 retry loop 전용(divergent blocking 보존) — routing은 그 **둘레의 나머지 단계**를 채웁니다.

#### Stage → command (MVP 6 + critique)

| 단계 | 명령 | implement 게이트 호출 형태(auto) |
|---|---|---|
| discovery | `shape` | background (best-effort, 불가 시 foreground-fallback) |
| refine | `layout` · `typeset` | invoke |
| evaluate | `critique`(§3.9 loop) · `audit` | invoke |
| harden | `harden` | pr 단계 recommend |
| polish | `polish` | pr 단계 recommend |

`craft`(명령 chain)·`live`(localhost:4321 실시간)는 비대화형 게이트와 부적합으로 **제외**.

#### 모드 (`MCCP_IMPECCABLE_ROUTING_MODE`)

| 모드 | 동작 |
|---|---|
| `auto` (default) | callForm 그대로 — evaluate/refine/discovery 실제 호출 |
| `hybrid` | evaluate(critique/audit)만 invoke, 나머지 recommend로 강등 |
| `recommend` | 전부 recommend (호출 없음) |

운영 중 비용/latency 문제 식별 시 `hybrid`/`recommend`로 강등 가능(사용자 결정 — auto가 기본).

#### 게이트별 배치

- **plan / plan-prd**: 렌더 UI 없음 → `## Design Routing Guide` recommend-only 기록(invoke 안 함).
- **prp-implement**: 실제 stage-aware 라우팅. `renderingSurface` selector(diff에 UI ext/STATUS·status.html 출력 없으면 control-plane-only로 판단 → refine/discovery를 recommend로 강등; evaluate는 유지 — Codex F4).
- **pr**: polish/audit/harden recommend-only stderr(review-only invariant — Edit/Write invoke 없음).

#### Receipt audit (present-only)

- `meta.impeccable_routing_mode`: `auto|hybrid|recommend|null`
- `meta.impeccable_commands_routed`: structured 배열 `[{command, call_form, status}]` — per-command **outcome**(invoked/recommended/failed/unknown-skill/skipped). 실패도 정직히 기록(loud fail-open); M1은 blocking 승격 안 함(M2 결정).

#### Codex Plan-Codex R1 absorptions

F1(`designIntentActive`로 audited override escape hatch 보존) · F2(critique은 routing 흡수 대상 아님, 기존 loop 유지) · F3(structured outcome 배열) · F4(`renderingSurface` selector + auto 기본 유지, cost-tier/SLO는 M2 defer).

#### M2 — Extended Refine/Simplify 카탈로그 + content 선별 (v1.13.0 M2)

M1의 6개(shape/layout/typeset/critique/audit + harden/polish)에 Extended 카탈로그 10개를 추가하고, auto 모드 fan-out 비용을 **content 기반 선별**로 제어합니다.

| 단계(추가분) | 명령 | callForm base | content signal |
|---|---|---|---|
| refine | `animate` | invoke | motion |
| refine | `colorize` | invoke | color |
| refine | `bolder`·`quieter`·`overdrive`·`delight` | **recommend (mood)** | — (diff 감지 불가) |
| simplify(신규) | `adapt` | invoke | responsive |
| simplify | `distill`·`clarify` | recommend | — |
| harden(pr) | `optimize`·`onboard` | recommend | — |

- **Content 선별 (positive-presence narrow)**: content-detectable 명령(animate/colorize/typeset/adapt)은 `extractDiffSignals`가 diff에서 해당 signal을 **positive로 잡았을 때만** auto invoke 유지, 못 잡으면 recommend로 강등. signal 추출은 tracked diff + **untracked rendered-surface 파일**(`git ls-files --others --exclude-standard`)을 합친 셋에서 수행하며, 정규식은 CSS property + Tailwind utility(`md:`/`bg-primary`/`transition-all`) + CSS-in-JS camelCase(`fontSize`)를 커버.
- **Fail-open omission**: rendered surface인데 signal이 0개면 `diffSignals`를 **omit** → oracle은 M1 fail-open(content 명령 base 유지). all-false forward로 "부재 강등"하지 않음(Implement-Codex [0]·[1], Plan-Codex F1·F2).
- **Mood 명령**: bolder/quieter/overdrive/delight는 diff로 의도 감지 불가 → recommend-only base. 유일한 invoke 경로는 4중 AND(auto + renderingSurface + designIntentActive + `MCCP_IMPECCABLE_INTENT_COMMANDS` membership) audited intent 승격(Plan-Codex F3).
- **Untracked greenfield trigger gap**: detector `design_signal`은 여전히 tracked diff 기반 → 신규 untracked surface는 `MCCP_DESIGN_INTENT_REASON`(axis c)로 trigger. detector 자체 untracked scan은 별도 axis.
- **Receipt schema 무변경**: `impeccable_commands_routed[].command`가 open string이라 신규 명령은 schema 변경 없이 수용.

#### M3 — System 명령 wiring + a11y-architect auto-invoke (v1.13.0 M3)

M3은 PRD의 마지막 두 축을 닫습니다.

**Axis A — System 명령(document/extract) wiring**: impeccable System 군의 `document`(DESIGN.md 생성)·`extract`(재사용 토큰/컴포넌트 추출)를 routing 카탈로그에 `system` stage + **recommend-only base**로 추가. 모든 게이트(implement/pr/plan/prd)·모든 모드에서 recommend — heavyweight 생성 명령이라 비대화형 게이트에서 auto-invoke 부적합(harden/optimize/onboard 처리 미러). `resolveCallForm` downgrade-only 로직상 invoke 승격 경로 없음. `craft`/`live`/`init`/`detect`/`hooks`는 out-of-scope 유지. Receipt schema 무변경(`impeccable_commands_routed[].command` open string).

**Axis B — a11y-architect routing-only → 실제 auto-invoke**: 기존엔 `codex-result-filter.js`가 a11y finding을 drop하고 `a11yRoutedCount`만 셀 뿐 a11y-architect를 호출하지 않았다. M3은 PR 게이트에서 실제 `Task(mccp:a11y-architect)`를 review-only로 auto-invoke한다.

- **트리거는 `rendering_surface`(PR diff에 UI ext 존재), Codex finding 유무가 아님** (Codex R1 F1): codex-invoke가 design-scope preamble로 a11y를 억제하므로 finding 기반 트리거는 starve된다. a11y-architect는 변경된 diff를 **직접** WCAG 2.2 관점에서 review하고, `codex-runner`가 surface한 `a11y_findings`는 보조 입력.
- **review-only 불변식 = 전용 lock window** (Codex R1 F2): codex-runner가 codex-review lock을 이미 exit했으므로, `pr.md` Phase 2.5.6c가 **a11y 전용 pr-phase lock**을 새로 enter → Task → exit + mutations finalizer. a11y-architect가 파일을 편집하면 `mutations[]`가 비지 않아 PR이 hard-stop.
- **audit**: receipt present-only `meta.a11y_auto_invoked: boolean`. `finalize-receipt.js#deriveCodexFlags`가 codex-result.json의 `a11y_auto_invoked=true`를 보고 `--a11y-auto-invoked`를 forward + `write_flags_used`에 노출(Codex R1 F3). 결과는 PR body `## Accessibility Review` 섹션에 inject(`## Codex Review` 동형). remediation은 advisory — 적용은 별도 `/mccp:prp-implement` cycle.
- **kill switch**: `MCCP_A11Y_AUTO_INVOKE=0` (default 1). `rendering_surface=false`면 invoke skip.

plugin.json `1.13.0 → 1.16.0` — main(1.15.0, PR #53 dashboard chart)과 forward-only reconcile per §3.7(plan은 1.14.0 가정이었으나 main 이동으로 상향).

#### 게이트 발화 정합 (v1.31.4 — impeccable-detection-contract M4)

M1~M3은 탐지를 정직하게 만들고(오라클) 이름을 바로잡았다(재배선). M4는 **그 이름으로
무엇을 부르는가**를 다룬다. 셋을 닫는다: 완주 불가능한 발화를 빼고, 발화가 0인 단계에
자리를 주고, 오라클 밖에서 일어나던 발화를 오라클 안으로 들여 기록되게 한다.

##### 벤더 계약이 `shape`를 막는다 — 추정이 아니라 인용

`INTERVIEW_REQUIRED_COMMANDS = ['shape', 'init', 'teach']`의 근거는 impeccable이 **함께
배포하는** 두 파일이다(4.1.1 실측):

- `skills/impeccable/scripts/command-metadata.json` — `shape.description` = "Plan UX and UI
  before code. **Runs a required multi-round discovery interview**, uses visual probes when
  available, and produces a user-confirmed design brief for implementation." **조건이 없다** —
  PRODUCT.md 유무와 무관하다. 카탈로그 23개 중 `interview`를 서술에 담은 것은 `shape`(무조건)와
  `init`(조건부) 둘뿐이다.
- `skills/impeccable/scripts/context.mjs:1116`·`:1132` — "For `init`, `teach`, `shape`, … create
  PRODUCT.md with the user first" · `:1121` `BUILD_INIT_REQUIRED`: "init must capture PRODUCT.md
  with the human **or structured simulated user**."

두 번째 인용이 왜 결정적인가: 비대화형 게이트가 이 분기에 들어가면 (a) 질문하며 멎거나
(b) "structured simulated-user interview"로 **제품 진실을 지어내어 사용자 저장소에 PRODUCT.md를
쓴다**. 후자가 더 나쁘다 — 게이트가 조용히 실패하는 것이 아니라 조용히 **거짓을 커밋**한다.

`teach`는 벤더 측 불일치다: `context.mjs`의 차단 문장은 부르는데 `command-metadata.json`의 23개
카탈로그에는 **없다**. 그래도 집합에 두는 이유는 이 집합의 목적이 "미래에 카탈로그가 넓어질 때
인터뷰형 명령이 조용히 발화하지 않게 막는 것"이고 `teach`가 정확히 그 후보이기 때문이다.
mccp 라우팅 카탈로그에는 추가하지 않는다(UI5). **오늘 교집합은 `shape` 하나다.**

##### `background`는 은퇴가 아니라 도달 불가다

`shape`가 오라클 전체에서 유일한 `background` base였으므로, 강등 후 `resolveCallForm`은
`background`를 **절대 반환하지 않는다**. 그런데 `schema.js`의 `ROUTING_CALL_FORM_VALUES`와
`prp-implement.md`의 callForm 표는 **남긴다**:

- enum을 좁히는 것은 **과거 receipt의 해석을 바꾸는 일**이다. 이미 `background`로 봉인된 항목이
  있고(M4 이전 pre 패스), 그것을 invalid로 만들 이유가 없다.
- `background`는 정당한 **미래** base다. 오늘 아무도 쓰지 않는다는 사실과 앞으로 쓸 수 없다는
  주장은 다르다.

대신 `impeccable-routing.test.js` (M4-2)가 전수 조합(128)에서 `background` 0건을 단언한다.
다시 도달 가능해지는 날 그 test가 붉어져, 그것이 의도된 결정이었음을 증명하게 만든다.
M3의 `impeccable-cleanup.test.js` `rules 1+2 jointly`와 같은 형태다.

##### 왜 새 callForm이 아니라 `phase`인가

finish 패스에 자리를 주는 방법은 둘이었다. `'finish'`라는 **새 callForm**을 만들면
`resolveCallForm`·`selectByDiffSignals`·`schema.js`의 **닫힌 enum**이 전부 따라 움직이고,
receipt schema가 바뀌면 과거 receipt 해석이 흔들린다. `phase`는 이미 존재하는 **테이블 메타** 축
(`signal`)의 형제다 — 공개 반환에서 strip되고, 소비처 코드도 receipt schema도 **한 줄도**
건드리지 않는다. **schema 변경 0**이 M4의 제약이었고 이 선택이 그것을 지킨다.

필터는 callForm 해소 **이전**에 건다. 다른 패스의 엔트리가 mood upgrade나 content narrowing에
영향을 주지 못하게 하려는 것이다. plan·prd·pr 테이블은 전 엔트리가 `pre`이므로 세 게이트의
출력은 **바이트 동일**하고, test M4-3a/M4-3b가 그것을 명시 배열로 pin한다.

모르는 phase는 **빈 목록**이지 `pre` fallback이 아니다. 오타로 인한 조용한 pre 재실행은 finish
패스가 통째로 사라지는 것보다 나쁘다 — 그 경우 pre 명령이 EXECUTE 이후에 한 번 더 발화해
duplicate-call 불변식을 깬다.

##### `onboard`을 제외한 선

`harden`("error handling, i18n, text overflow, edge case management")과 `optimize`("Diagnoses and
**fixes** UI performance")는 **산출된 코드를 손보는** 성질이라 이미 발화하는
`polish`·`clarify`·`distill`과 같은 부류다. `onboard`은 다르다 — "welcome screens, account setup,
progressive disclosure"는 기존 코드를 고치는 것이 아니라 **없던 표면을 새로 짓는다**. implement
게이트에서 자동 발화시키면 plan이 요구하지 않은 surface를 만든다. 이 구분이 harden 단계를 열되
scope 확장은 막는 선이다.

##### 남는 0-발화 단계는 둘이고 각각 근거가 다르다

UI12("발화가 0인 라이프사이클 단계가 없어야 한다")를 **문자 그대로** 달성하는 것은 UI11과
충돌한다. M4는 UI12를 "모든 단계가 발화하거나, 발화 0인 단계는 증거와 함께 기록되고 test로
고정된다"로 읽고 그렇게 착지한다.

| stage | 왜 0인가 |
|---|---|
| `discovery` | 유일한 명령 `shape`가 벤더 계약상 인터뷰를 요구한다. UI11을 지키는 한 영구히 0 |
| `system` | `document`/`extract`는 v1.13.0 M3이 "heavyweight generative actions that should be a deliberate operator step"로 확정했다. M4가 뒤집을 근거가 없다 |

test M4-4가 이 집합이 **정확히** `{discovery, system}`임을 전수 조합 위에서 단언한다. 이 test는
"발화 0인 단계가 없다"를 억지로 만들지 않고 **남은 0을 봉인**한다 — 집합이 늘면 어떤 단계가
목소리를 잃은 것이고, 줄면 정당화됐던 침묵이 열린 것이라 어느 쪽이든 근거를 여기 적어야 한다.

##### restamp — 두 축이 다르다

`restampRoutedCommands`(`write.js`)는 `restampGroundingVerdict`의 형제다. 존재 이유가 같다:
finish 패스는 2.5.6 receipt write **이후**에 도는데, 유일한 사후 restamp가 grounding 한 키만
건드려서 실제 발화가 receipt에 **기록될 경로가 구조적으로 없었다**.

- **restamp 간에는 append-only, dedupe 없음.** duplicate-call 불변식이 깨져 한 명령이 양쪽
  패스에서 발화하면, receipt에 **두 번 보이는 것이 그 drift 신호**다. 조용히 합치면 이 필드가
  존재하는 이유 자체가 사라진다.
- **한 restamp 안에서는 멱등.** 같은 restamp의 **재시도**가 두 번째 이력을 위조하면 안 된다
  (Codex Implement-R1 F1). 재시도는 두 번째 패스가 아니다. 판별자는 canonical 항목형에 대한
  **tail match**이고, 판정은 `updateReceipt`의 **임계구역 안**에서 이뤄진다 — 락 밖이면 검사와
  쓰기 사이에 다른 writer가 꼬리를 바꿀 수 있고, 그것이 §3.12가 막는 lost-update와 같은 부류다.
  불확실하면 **append**한다: 중복은 보이고 복구 가능하지만, 진짜 두 번째 패스를 삼키면 기록이
  사라진다.
- **게이트는 `mccp-implement-codex` 하나로 제한**한다. `store.js#assertNoTrackedOverwrite`가
  이미 git-tracked ship receipt의 재봉인을 거부하므로 §3.12 불변식은 이 제한 **없이도** 지켜졌다
  — 다만 락 안에서, 시도한 **뒤에** 거부하는 형태였다. 문 앞에서 이름을 대는 편이 낫다.
- **항목의 키가 정확히 셋이 아니면 거부**한다. `schema.js`는 세 필수 필드를 검증하되 여분 키를
  금지하지 않으므로, writer가 막는다. 조용히 정규화하지 않는 이유: 예상 밖 키는 producer와
  consumer가 어긋났다는 뜻이고, 말없이 버리면 caller가 기록됐다고 믿는 것과 다른 receipt가 봉인된다.

##### fail-open을 유지하되 소실을 시끄럽게 만든다

Phase 3.6은 advisory이고 M4가 그 성질을 바꾸지 않는다 — receipt 기록 실패가 이미 성공한 구현을
막으면 안 된다. 그러나 "덜 기록"이 정확히 M4가 고치려는 실패이므로(Codex Implement-R1 F2), 셋을 더한다:
**bounded 재시도 3회**(현실적 실패 원인은 락 경합) · **entries tempfile 보존 + 복구 명령 출력** ·
`.claude/state/fix-task.md` **인계** + Phase 5 REPORT 기록.

> **주장하지 않는 것**: 이것은 receipt만 보고 소실을 탐지할 수 있게 만들지 **못한다**. 검증기가
> 요구할 수 있는 receipt 내 상태를 만들려면 present-only meta 필드가 필요하고, 그것은 M4가
> "schema 변경 0"으로 못 박은 축이다. 이 잔여는 범위 결정의 결과이지 놓친 것이 아니라서 여기
> 명시하고 backlog로 넘기지 않는다.

##### M4가 주장하지 않는 것

- **`shape`를 고치지 않았다.** 비대화형 게이트에서 완주할 수 없다는 사실을 인정하고 뺐을 뿐이다.
- **UI12를 문자 그대로 달성하지 않았다.** 남은 0이 둘이고, 각각의 근거를 test가 봉인한다.
- **finish 5종의 발화 비용은 실제로 는다** (3종 → 5종). 전부 advisory·fail-open이고 3.6.1의
  3중 gate가 그대로 걸린다. 비용이 문제면 `MCCP_IMPECCABLE_ROUTING_MODE=hybrid`가 evaluate만
  남긴다 — **새 토글을 추가하지 않는다**.
- **라우팅 카탈로그에 명령을 더하거나 빼지 않았다**(UI5). 바뀐 것은 call form과 phase 배치뿐이다.

---



---


### impeccable-detection

CLAUDE.md §3.17의 배경이다. 절 자체는 불변식 둘만 상주시키고, 4소스 표·해소
규칙·모호성 처리·주장하지 않는 것은 여기가 소유한다.

#### 왜 boolean이 틀린 답이었나

v1.31.1 이전의 `probeSkillAvailable`는 "impeccable이 설치돼 있는가"에 boolean으로
답했다. 그 질문 자체가 틀렸다 — mccp 명령 본문은 전부 `Skill(impeccable, ...)`를
부르는데, plugin 채널의 skill은 `<pluginName>:<skillDirName>`으로 등록된다.
"설치돼 있다"와 "우리가 부르는 이름이 해소된다"는 **다른 사실**이고, 전자만 답하면
탐지가 true인데 호출이 `unknown_skill`로 떨어지는 상태를 만들 수 있다.

같은 함수가 반대 방향으로도 틀렸다. 하드코딩 키가 `impeccable@anthropics`였는데
default 설치의 실측 키는 `impeccable@impeccable`이라, **완전히 설치된 plugin이 모든
게이트에서 보이지 않았다**. 그리고 `~/.claude/skills/impeccable`은 디렉토리 존재만
확인해 `SKILL.md`가 없는 빈 디렉토리도 설치로 셌다 — 열릴 본문이 없는데 있다고
답하는 것이다.

`resolveImpeccable()`은 두 번째 질문에 답하고, 본 소스를 전부 열거해서 호출자가
추정할 필요를 없앤다. 절대 throw하지 않고, 모든 파일시스템 경로를 주입 가능하게 둔다.

#### 4소스

| # | 소스 | 위치 | invocation | version |
|---|---|---|---|---|
| 1 | `env` | `MCCP_IMPECCABLE_SKILL` = `available` / `missing` | `impeccable` (주장) | `null` |
| 2 | `plugin` | `installed_plugins.json` 키를 `/^impeccable@/` 접두어 매칭 + legacy bare `impeccable` | `<pluginName>:<skillDirName>` | manifest `version` 우선, 없으면 frontmatter |
| 3 | `project` | `<repoRoot>/.claude/skills/impeccable/SKILL.md` | `impeccable` | frontmatter |
| 4 | `user` | `~/.claude/skills/impeccable/SKILL.md` | `impeccable` | frontmatter |

레지스트리 키는 `<pluginName>@<marketplaceName>`이므로 **키 전체가 plugin 이름이
아니다.** `@` 앞부분만 이름이고, 독립 반례로 codex는 키가 `codex@openai-codex`인데
namespace는 `codex:setup`이다. 접두어 매칭을 쓰는 이유는 marketplace 절반이 바뀌어도
탐지가 다시 깨지지 않게 하기 위해서다 — `@`가 `impeccable` 바로 뒤에 와야 하므로
무관한 `impeccable-foo@x`는 잡히지 않는다.

#### 해소 규칙 넷

- **`env`가 최우선**이고 `missing`이면 즉시 `available:false`로 끝낸다. 이때
  `sources`는 **비운다** — 무시하라고 지시받은 소스를 열거하면 호출자에게 override를
  건너뛸 통로를 알려주는 셈이다.
- **plugin 엔트리는 `installPath`가 디스크에 실재하고 그 안에 `skills/<name>/SKILL.md`가
  있을 때만 센다.** stale installPath는 `codex-invoke.js`가 `install-path-stale`로
  이미 거부하는 실패이고, 여기서 세면 "지목한 본문이 열리지 않는" 상태를 우리가 직접
  만든다. `<name>`은 디렉토리를 **읽어서** 정하고 `impeccable`이라고 가정하지 않는다.
- **project와 user는 디렉토리가 아니라 `SKILL.md` 존재를 요구한다.** 의도된 동작
  변경이다. plan 게이트는 lenient라 무영향이고 implement·pr에서만 막히며, 탈출구는
  `MCCP_IMPECCABLE_SKILL=available`이다.
- **승자는 bare 소스가 정한다.** mccp 본문이 부르는 이름이 bare이므로 bare 소스가
  하나라도 있으면 그것이 이기고, 없으면 plugin이다. plugin과 bare는 **경쟁하지
  않는다** — 이름이 다르므로 shadow 관계가 성립하지 않는다.

#### 모호하면 답하지 않는다

bare 소스가 둘이면(project + user) `Skill(impeccable, ...)`가 어느 본문을 여는지는
**측정된 바 없다**. 그때 `shadowed:true`로 두고 `source` · `path` · `version`을 전부
`null`로 답한다. 이 오라클의 약속이 "실제로 열릴 본문 하나를 지목한다"이므로, 둘 중
하나를 고르는 것은 이 오라클이 할 수 있는 가장 해로운 일이다. **이름은 여전히
안다** — 양쪽 다 `impeccable`에 답하므로 `invocation`은 남는다.

이것이 "다중 bare 소스의 우선순위가 무엇인가"라는 질문을 **답하지 않고 닫는**
방법이다. 정확도가 그 답에 의존하지 않게 된다.

#### 경로와 방어

보고되는 `path`는 repo 내부면 repo-relative, repo 밖이면 홈 축약이다. M1 자신은
`path`를 receipt에 쓰지 않지만 M2·M3가 이 오라클을 소비하므로, 절대경로를 내보내면
다음 milestone에 이미 만들어진 누출을 건네는 셈이다(§3.12 E7이 `meta.cwd`를
정규화하는 것과 같은 이유).

디스크에서 읽은 디렉토리 이름은 `invocation` 문자열과 `path.join` 양쪽으로 흐르므로
`^[A-Za-z0-9_-]+$`를 통과해야만 쓰인다. skill 디렉토리는 `lstat`으로 심볼릭 링크를
거부하고(열거와 판독 사이에 링크가 재지정되는 창을 닫는다), `SKILL.md`는 `isFile()`을
통과해야만 열린다 — FIFO가 놓여 있으면 판독이 영원히 블록되고 게이트는 원인 불명
timeout으로 죽는다. `installPath` 자체는 재검증하지 않는다: 그 값은
`dep-check.js`가 소유하는 레지스트리에서 오고, 그 파일을 편집할 수 있는 주체는 이미
더 직접적인 수단을 갖는다.

frontmatter는 선두 8KB만 읽는다. 실측 2종(4.1.1 · 3.5.0)이 `version`을 선두 300바이트
안에 두고, 그 창을 넘긴 값은 추정하지 않고 `null`로 답한다.

#### 주장하지 않는 것

- **호출부를 고치지 않는다.** plugin 단독 설치에서 `available:true`가 나와도 명령
  본문 4곳은 여전히 bare `Skill(impeccable, ...)`를 부른다. M1은 `invocation`을 1급
  반환값으로 실어 그 사실을 표면화하는 데까지만 책임진다. 결과는 M1 전후가 같다 —
  전에는 `available:false`로, 후에는 `unknown_skill` fallback으로 똑같이
  `impeccable_skipped`에 도달한다. 재배선은 M3가 project-local 사본을 지울 때
  **반드시** 함께 해야 하는 전제다.
- **다중 bare 우선순위를 측정하지 않았다.** 위 규칙은 그 질문을 회피하는 것이지
  답하는 것이 아니다.
- **`setup`·SessionStart 배너의 다채널화는 M2**(아래 절에서 소진), 섀도잉의 사용자
  표면화와 사본 정리는 **M3** 소유다. `checkImpeccableCli`는 M2에서 **제거되지 않았다** —
  다채널화의 답은 그 함수를 고치는 것이 아니라 판정 권한을 뺏는 것이었다.

#### setup·경고 정합 (M2)

M1은 오라클을 만들고 아무도 부르지 않게 뒀다. M2는 소비처 셋을 배선한다 —
`dep-check`·SessionStart 배너·`/mccp:setup` Phase 3 — 그리고 같은 사이클에
`.impeccable/` 무시 규칙의 극성을 공식 계약에 맞춘다.

**판정 권한은 `available` 하나다.** `checkImpeccable()`이 `resolveImpeccable`을
지연 require로 감싸 `dep-check`에 합류시키고, `checkAll()`은 기존 4키를 그대로 둔 채
`impeccable` 키를 얹는 엄격한 상위집합이 된다. `checkImpeccableCli`는 남지만
**telemetry**다 — 배너도 setup 분기도 그것을 읽지 않는다. 두 사실을 한 필드로 뭉치지
않는 것이 v1.0.0-baseline F-W1-2의 자체 처방이었고, 그 처방은 "두 필드"였지
"CLI 필드 삭제"가 아니었다.

지연 require는 순환(`impeccable-detect` → `dep-check`) 때문이고, `dep-check`의 헤더가
선언한 "Never throws" 계약 때문에 그 require는 try/catch로 감싸 **fail-closed sentinel**
(`available:false`, `reason:'detect-load-error'`)을 돌려준다. 관대한 방향으로 실패하면
깨진 require가 조용한 디자인 리뷰 skip이 된다.

**4채널과 그 귀결** (M2 Task 0 실측, 2026-08-22):

| 채널 | 설치 형태 | 등록 invocation | 게이트가 오늘 발화하는가 |
|---|---|---|---|
| plugin | `claude plugin marketplace add pbakaus/impeccable` → `claude plugin install impeccable@impeccable` | `impeccable:impeccable` | **아니오** — 호출부가 bare |
| CLI | `npx impeccable install` | `impeccable` (bare) | 예 |
| project | `.claude/skills/impeccable/` | `impeccable` (bare) | 예 |
| user | `~/.claude/skills/impeccable/` | `impeccable` (bare) | 예 |

plugin을 기본 권장으로 두는 것은 운영자 결정(UI6)이고, 그 선택이 오늘 게이트를
발화시키지 않는다는 것도 사실이다. M2는 그 사실을 **숨기지 않고 설치 시점에 출력한다** —
setup Phase 3.4가 등록 이름과 호출 이름의 불일치를 그 자리에서 말하고 bare 채널 대안을
병기한다. 측정 근거: 리터럴 `Skill(impeccable` **16건 / 7개 명령 본문**(표·산문 언급 포함한
grep 전수), `Skill(impeccable:` **0건**, 그리고 `impeccable-guard.test.js`가 canonical 5개
명령 전부에 bare 호출 존재를 단언한다. 재배선은 M3가 project 사본 제거와 단일 커밋으로 한다.

**`.impeccable/` 극성 — `config.json`은 commit, `design.json`은 생성물.** 이 블록은
`gitignore-provision.js`가 **모든 사용자 저장소에** 심으므로 오답이 전파되는 유일한
표면이고, 그래서 근거가 상주해야 한다. 근거는 impeccable 자신의 레퍼런스다:
per-developer override와 설치 동의 값(`hook.consent`)은 **gitignored**
`.impeccable/config.local.json`에 살고, `config.json`은 팀이 공유하는 커밋 대상이다
(`reference/hooks.md`). 따라서 예외를 정확히 한 파일에만 두는 새 블록
(`.impeccable/*` + `!.impeccable/config.json`)은 `config.local.json`도
`live/config.json`도 되살리지 않는다 — git은 제외된 디렉토리 내부를 되살릴 수 없고,
파일 예외는 이름이 정확히 일치하는 하나만 되살린다.

**pollution 보고 1건은 정상 동작이다.** 이 저장소의 `.impeccable/design.json`은 tracked로
남는다(UI7). 새 규칙에서 그 파일은 무시 대상이므로 provisioner의 pollution 스캔이 매번
1건을 보고한다. provisioner는 자동 untrack하지 않는다는 기존 계약 그대로이며, 보고는
결함이 아니라 "규칙과 이력이 어긋나 있다"는 정직한 관측이다. 사용자가 그것을 없애려고
수동 untrack하면 팀원의 체크아웃에서 파일이 사라지므로, 그 유도를 하지 않는 것이 계약의
목적이다.


#### 섀도잉 해소 (M3)

M1은 오라클을 만들고, M2는 소비처를 배선했다. 둘 다 **다중 사본이 공존할 때 무엇이 실제로
열리는가**를 사용자에게 말하지 않았고, 무엇보다 mccp 자신이 그 답을 쓰지 않았다 — 명령 본문
4곳이 여전히 bare 이름을 하드코딩했다. M3는 그 셋을 닫는다.

##### `eclipsed` — 승자가 아닌 소스

정의는 하나다: *승자가 정해졌을 때, 열거된 소스 중 승자 행이 아닌 전부.* 규칙 셋은 CLAUDE.md
§3.17이 상주시키고, 여기는 **왜 identity로 제외하는가**를 소유한다.

승자 행은 **그것을 고른 분기에서 객체 참조로 포착**해 제외한다. `source`+`invocation`+`path`
3-필드 비교는 틀린다 — 같은 install 트리를 가리키는 레지스트리 항목이 둘이면 그 삼중값이
바이트 단위로 동일하므로 비교가 **양쪽 다** 승자로 판정하고 `eclipsed`를 비운다. 두 본문이
열거돼 있는데 가려진 것이 없다고 답하는 셈이고, 그것은 이 필드의 존재 이유 자체를 지운다.
`pluginNameFromRegistryKey`가 매처가 받아들이는 모든 키에 대해 리터럴 `impeccable`을 내므로
그 중복은 가설이 아니라 실제로 구성 가능한 상태다 — `impeccable-resolve.test.js`의
`eclipsed (i-dup)` fixture가 그 상태를 만든다.

resolve CLI의 승자 표시(`*`)도 같은 이유로 identity를 쓴다. 3-필드 비교로 표를 그리면 중복
행에서 별표가 둘 찍혀, "어느 본문이 열리는가"를 보여주려는 표가 정확히 그 질문에 두 답을 낸다.

##### 재배선 — 부르는 이름을 하드코딩하지 않는다

detect 블록이 `impeccable_invocation`을 뽑아 **정확히 한 줄**을 stderr로 낸다:

```
[mccp:impeccable] call-form: Skill(<invocation>, ...)
```

본문은 그 줄이 `Skill(`와 쉼표 사이에 나르는 이름을 부른다. **셸 변수가 carrier가 아닌 이유**는
셸 상태가 도구 호출 경계를 넘어 살아남지 못하기 때문이다 — `$IMPECCABLE_INVOCATION`을 쓰라고
적으면 그 지시가 읽히는 시점에 값은 비어 있다. 같은 이유로 **그 줄의 부재가 의미를 갖는다**:
이름을 추정하지 않고 `SKILL_AVAIL=0` 행(fallback note + skip)으로 간다. 이 두 규칙이 없으면
재배선은 "이름을 어디선가 알아내라"는 지시가 되고, 모델은 사라진 bare 이름으로 되돌아간다.

`plan-prd.md`는 impeccable을 **호출하지 않으므로** 재배선 대상이 아니다. 그 파일이 M3 이전
guard를 통과하던 근거는 impeccable을 부르지 않는다고 적은 산문 한 줄이었다 — 단언이 애초에
참을 검사하고 있지 않았다.

##### 단일 커밋 불변식과 그 실제 강제 지점

`impeccable-guard.test.js`의 짝 단언은 *사본이 디스크에 있다*와 *본문이 bare 리터럴을 갖는다*를
**하나의 등식**으로 묶는다. 위험한 것은 한 방향뿐이다 — 사본만 지우면 전 게이트가 동시에
`unknown_skill`이 되고, 재배선만 착지하면 bare 소스가 여전히 승자라 동작이 전날과 같다. 그런데도
등식을 쓰는 이유는, 반쪽만 착지시켜서는 만족시킬 수 없는 형태가 그것뿐이기 때문이다.

bare 리터럴 쪽 검사는 명령 본문 **전문**을 훑어 `Skill(impeccable` 이 0건임을 요구한다. 살아
있는 지시와 그것을 설명하는 문장을 구분하려는 시도는 하지 않는다 — 마크다운에 그 둘을 가르는
문법이 없어 구분하려는 guard는 추측을 하게 되고, 문서에 반응하는 guard는 없느니만 못하다.
대신 옛 형태를 논해야 하는 산문이 그것을 **인용하지 않고 서술**한다.

**강제 지점은 CI가 아니다.** `.github/workflows/`에 등재된 test는
`pr-phase-guard` · `pr-phase-lock-f11` · `gitignore-provision` 셋뿐이라 이 guard는 어떤 워크플로도
돌리지 않는다. 실제 강제는 각 사이클의 `## Validation`이 로컬에서 돌리는 `node --test`이며,
"커밋 시점에 잡힌다"는 서술은 정확하지 않다. CI 등재는 별도 축으로 backlog에 있다.

##### 정리 오라클 — 거부가 본체다

[impeccable-cleanup.js](../plugins/mccp/scripts/lib/impeccable-cleanup.js)는 디렉토리를 지우므로,
**무엇을 지울 수 있는가를 정하는 규칙이 전부 코드에** 있고 닫힌 `REASONS` enum으로 답한다.
호출하는 명령 본문(`/mccp:setup` Phase 3.5)은 화면을 그리고 선택을 전달할 뿐 경로를 판단하지
않는다 — 판단했다면 그것은 규칙의 두 번째, 더 약한 사본이 됐을 것이다.

경로 봉쇄에서 갈리는 지점 하나: **앵커(repo root · home) 자신이 심볼릭 링크인 것은 거부하지
않는다.** 거부하면 심볼릭 경로 아래 사는 정상 저장소(macOS `/tmp`, Windows junction 개발
드라이브)를 전부 막으면서 아무것도 얻지 못한다 — 기대 부모와 대상이 **같은 링크를 통과해**
동일하게 해소되므로 봉쇄가 유지되기 때문이다. 거부하는 것은 **앵커와 대상 사이**의 링크다.
거기서는 두 쪽이 더 이상 일치하지 않는다: `.claude/skills` 가 junction이면 어휘적 경로는 그대로
맞는데 실제 디렉토리는 다른 곳이다. Node가 Windows junction을 심볼릭 링크로 보고하므로 `lstat`
한 번이 두 reparse point 종류를 함께 덮는다.

`git rm`은 `execFileSync` + `--` 구분자로만 부른다(셸 미경유 + `-`로 시작하는 경로가 옵션으로
읽히지 않게). 성공 판정은 명령의 종료코드가 아니라 **재-resolve로 증명한 부재**다 — `git rm`은
tracked 파일에서 멈추므로 untracked 내용이 남은 디렉토리는 여전히 `SKILL.md`를 들고 있을 수 있다.

##### 주장하지 않는 것

- **정리 도구는 실사용 구성에서 아무것도 지우지 않는다.** 규칙 1(승자 불가침)과 2(plugin 불가침)가
  함께 걸리면 `removable`이 구조적으로 빈다 — bare 소스가 항상 이기므로 bare 사본은 승자이거나
  둘 중 하나이고, 남는 eclipsed 행은 plugin뿐이다. `MCCP_IMPECCABLE_SKILL=available`로 env 행이
  승자가 되는 구성만 예외다. 규칙을 넓히지 않았고, setup 화면이 그 사실을 그대로 말한다.
  `impeccable-cleanup.test.js`의 `rules 1+2 jointly`가 이 성질을 고정하므로, 나중에 bare 사본을
  제거 가능하게 만들려는 milestone은 그 test를 의도적으로 붉히면서 규칙을 바꿔야 한다.
- **check↔delete TOCTOU 창을 닫지 않았다.** 삭제 직전 realpath 재확인이 창을 좁히지만 마지막
  확인과 syscall 사이는 열려 있다. Windows에 `O_NOFOLLOW` 상당이 없어 포터블한 원자적 대안이
  없고, 닫으려면 디렉토리 핸들을 유지하는 플랫폼별 경로가 필요하다.
- **비-bypass 권한 모드에서의 게이트 완주는 측정되지 않았다.** M3의 라이브 측정은 bypass 모드
  세션에서 이뤄져 권한 프롬프트 축을 관측할 수 없었다. 다만 ambient allow 목록이
  `node ${CLAUDE_PLUGIN_ROOT}/scripts/*` 도 덮지 않으므로 그 공백은 impeccable 고유가 아니라
  mccp 게이트 전체가 공유하는 baseline이다.

---

#### 문서·계약 드리프트 정리 (M5)

M1~M4는 탐지를 정직하게 만들고(M1), 판정 권한을 일원화하고(M2), 이름을 바로잡고(M3),
발화를 정합화했다(M4). M5가 다루는 것은 **그 사실들을 적어 둔 곳**이다.

##### 근인은 부주의가 아니라 만족 불가능한 스키마다 (DD1)

`registry.js`는 `evidence`를 "이 토글을 **실제로 읽는 지점**의 `path:line`"으로 정의한다.
그런데 `IMPECCABLE_VERSION` · `IMPECCABLE_UPDATE_HOST` 등 19종은 impeccable 자신의
스크립트가 읽는 변수이고 이 저장소에는 read site가 **존재하지 않는다** — M3가 벤더 사본을
지웠으므로 impeccable 본문을 가리킬 수도 없다. 필드를 비울 수 없으니 과거에 무관한 한 줄
(`impeccable-detect.js:135`, 실제로는 `isDesignSurfacePath()` 내부)이 19번 적혔다.

그래서 고침은 "옳은 행을 찾는 것"이 아니다 — **옳은 행이 없다.** 새 status
`not-consumed`가 그 사실을 말할 수 있게 하고, `evidence`는 read site 대신 그 계약을
문서화한 앵커(`docs/environment/*.md`)를 가리킨다. 선례가 이미 있었다:
`MCCP_PLAN_REVIEW_L1`의 `absent-by-design` + `retired.md:1`.

##### 실측 A/B/C (2026-08-23, `measure-evidence.js`)

착수 시점 162개 항목: **A 110**(evidence 행 ±2 안에 이름 있음) · **B 28**(같은 파일 다른
행 — *낡았다*) · **C 24**(그 파일에 이름 없음 — *거짓이다*). impeccable 축의 몫은 C 19 +
B 4 = **23건**이고 전부 L8을 `ok`로 통과했다. 착지 후 그 23건은 A 4 + `not-consumed` 19다.

수치는 문서 안의 숫자가 아니라 스크립트의 출력이다 —
`node plugins/mccp/scripts/lib/env-contract/measure-evidence.js --json`이 언제든 재현한다.
그 스크립트는 **경계 일치**를 쓴다: 이름이 `[A-Z][A-Z0-9_]*`라 부분 문자열 일치를 쓰면
`MCCP_PLAN_REVIEW_L3`가 적힌 행이 `MCCP_PLAN_REVIEW`를 인증한다. 부작용을 숨기지 않는다 —
`scan-artifact`인 `MCCP_PLAN_REVIEW_`(끝이 밑줄인 접두사 오탐)는 경계 일치로는 **원리상**
A가 될 수 없고, 그것이 오분류가 아니라 그 항목의 성질이다.

##### L10 — 이름이 그 행에 있는가 (DD2)

L8은 evidence가 repo-relative이고 파일이 있고 행이 범위 안인지만 본다. 셋을 전부 통과하면서
무관한 줄을 가리킬 수 있다. L10은 한 질문만 더한다: **그 행 근처에 그 이름이 있는가.**

- **정방향** — `not-consumed`이 아닌 모든 항목: evidence 행 **±2 창** 안에 이름이 있어야
  한다. 창을 두는 이유는 명령 본문(markdown)에서 이름이 코드 펜스 바로 위 산문에 있는 정상
  사례가 있기 때문이다. 창이 좁아 정상 항목이 붉어지면 **창을 넓히지 말고 evidence를 고친다.**
- **역방향** — `not-consumed` 항목: evidence는 `docs/environment/*.md`의 **그 변수 자신의 절**을
  가리켜야 하고, 런타임 표면에 그 이름이 **없어야** 한다. 주장이 "mccp는 읽지 않는다"이므로
  읽기 시작하면 붉어야 한다. 두 방향이 함께 있어야 status가 도피처가 되지 않는다.
- **범위는 주장보다 좁고, 그 사실을 적는다.** 역방향은 `scan.walkSurfaces`로 부재를 단언하는데
  `scan.js`의 `isExcluded`가 `env-contract`를 경로 substring으로 **디렉토리째** 제외한다
  (registry 선언 행이 자기 자신을 트리거하는 것을 막으려면 필요하다). 즉 이 검사가 증명하는
  것은 "어디에도 없다"가 아니라 **"walkSurfaces 범위에 없다"** 이다. 좁히는 2차 검사는
  backlog에 있다(Implement-Codex R1 F2).
- **L7은 건드리지 않는다.** L7은 status로 분기하지 않고 `docs/environment/*.md`의 `### NAME`
  앵커를 전수 순회하므로, `not-consumed` 19종은 여전히 실행 가능한 사용 예시를 요구받는다.
  조용히 검사 밖으로 나가지 않게 하려는 **명시적 결정**이며 registry 헤더에 적혀 있다.

##### 래칫은 숫자가 아니라 이름이고, 로더는 fail-closed다 (DD3)

repo 전체에 L10을 걸면 impeccable 축을 다 고쳐도 **29건**이 붉다. 그것들은 다른 축의 부채이고
이 사이클이 대신 갚으면 M5는 자기가 검증할 수 없는 파일들을 만지게 된다. 그렇다고 L10을 보고
전용으로 내리면 §3.16이 경계하는 "막을 수 없는 계측"이 된다. 그래서 **열거된 `EVIDENCE_DEBT`**
를 둔다 — 29개 이름과 소유 축을 적고 목록에 있는 것만 통과시킨다.

- **숫자가 아니라 이름인 이유**: 상한을 숫자로 두면 하나 고치고 하나 깨뜨려도 그대로다.
  숫자는 신원을 감춘다.
- **양방향이다**: 목록에 있는데 실제로는 통과하는 이름도 실패다("지워라"). 래칫은 줄어들기만
  한다. registry에서 사라진 이름이 목록에 남아도 붉다 — 화석 방지.
- **로더가 fail-closed다**: 모듈이 없거나 throw하거나 모양이 틀리면 면제 집합이 **빈 집합**이
  되고 정방향 검사가 전부 그대로 판정된다. 관대한 방향으로 실패하면 목록이 조용히 "전체 면제"가
  된다. 이 축은 Implement-Codex R1이 HIGH로, plan 게이트 L2 invariant가 CRITICAL로 각각
  독립 지목했다. 방어는 `evidence-debt.js`의 **로드 시점 throw**와 lint 쪽 try/catch 둘 다에
  있다 — 이 저장소의 test는 어떤 CI도 돌리지 않으므로 test에만 두는 불변식은 커밋을 못 막는다.
- **축을 밀어 넣을 수 없다**: 목록에 `^(MCCP_)?IMPECCABLE_` 이름이 있으면 로드가 throw한다.

##### 보존된 원문은 지우지 않고 정정을 붙인다 (DD4)

`docs/environment/external.md`의 "v1.29.0 원문" 블록은 색인 축약 이전 서술의 아카이브다. 그 안의
`IMPECCABLE_VERSION`이 "`/mccp:setup` dep-check가 fallback hint로 honor"한다는 문장은 거짓이다
(실측: `plugins/mccp/scripts/` 전체에서 그 이름을 읽는 코드 0건). 아카이브를 고쳐 쓰면 아카이브가
아니게 되므로 위에 정정 줄을 붙였다 — CLAUDE.md §3.7의 "v1.23.12 정정:"과 같은 형태다.

같은 사이클에서 19개 절의 자기모순도 닫혔다: 헤더가 "기본값 없음"이라 적으면서 같은 절의 보존
표는 `https://impeccable.style` 같은 구체값을 적고 있었다. 이제 헤더는 **mccp의 기본값이 아니라
벤더 관측**임을 명시하며 원문과 같은 값을 싣는다. 거짓 셸 예시(`IMPECCABLE_X=... /mccp:pr`)도
지웠다 — 그 변수는 impeccable 프로세스가 읽으므로 mccp 명령 앞에 붙여도 아무 일도 일어나지 않는다.

##### 주장하지 않는 것

- **다른 축의 29건을 고치지 않는다.** 이름과 소유 축을 적어 각 축이 갚게 할 뿐이다.
- **역방향이 "mccp가 이 변수를 절대 읽지 않는다"를 증명하지 않는다.** 위의 범위 한계 그대로다.
- **`MCCP_PLAN_REVIEW_TEST_INVOKE` 등재는 이 축이 아니다.** origin/main에서 상속된 L1 red이고,
  이 한 줄이 없으면 M5는 자기가 확장하는 lint를 green으로 검증할 수 없었다. 등재가 그 이름을
  L9의 boolean 집합에 넣으므로 `plan-review/cli.js`의 raw 비교 한 줄도 `parseBool`로 옮겼다 —
  bypass-flag 분기가 `raw === '1'`이라 **바이트 단위로 동일**하다. "런타임 무변경 1행"이라는
  plan의 예상보다 한 줄 넓어졌고, 그 사실을 여기 적는다.
