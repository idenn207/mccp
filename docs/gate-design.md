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

If Codex returns new objections, update the artifact body to address them and re-invoke
the Skill. Repeat up to **3 rounds total**. Cap at 3 even if still divergent — annotate
the open question as `DIVERGENT_UNRESOLVED` and proceed.

### Codex auto-fallback

If the Codex Skill call returns any of `setup_required` / `not authenticated` / 60-second
timeout / `rate_limit` / `service_unavailable`, do not ask the user. Replace the placeholder
with `> Codex unavailable, skipped (auto-fallback): <reason>` and proceed to receipt write.
The skip is recorded in receipt metadata.

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

## References

- Receipt CLI source: `plugins/mccp/scripts/receipt/`
- Receipt hooks: `plugins/mccp/scripts/hooks/`
- Command bodies that implement the gate inline: `plugins/mccp/commands/plan.md`,
  `plugins/mccp/commands/prp-implement.md`
- Codex Skill (external dependency, installed separately):
  [openai-codex Claude Code plugin](https://github.com/openai/codex-plugin-cc)
