# Debt inventory — vocabulary, rules, and what it does not claim

**Inventory**: `sha256:f171a42e2c344849b988f613e827b11e3515dfcd777ad1d997645d917e71dfba`
**Sealed at**: commit `9093b08` (2026-09-01) · 1115 items
**Tooling**: [`debt-inventory.js`](../../plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js)
· gate: [`m10-coverage-gate.js`](../../plugins/mccp/scripts/lib/msw-metrics/m10-coverage-gate.js)

## What this is

Three ledgers in this repository accumulate findings, and none of them records
that a finding was dealt with:

| Source | Where | Items sealed |
|---|---|---|
| backlog | `.claude/plans/codex-findings-backlog.md` | 936 |
| findings registry | `.claude/state/findings/*.jsonl` (state `open`) | 178 |
| fix-task slot | `.claude/state/fix-task*.md` | 1 |

M10 normalized all three into one immutable denominator and recorded a
disposition for every item in an append-only ledger beside it. The seal covers
`items[]` only — generation time and commit sha sit outside it — so
`inventory_sha256` can be recomputed from the file and checked.

## Why dispositions are not written into the findings registry

`computeC1` divides closed findings by all findings **without a work-unit
attribution check**, while C1's frozen numerator is "findings resolved within the
same work unit". Closing another work unit's finding in the registry would count
it in a numerator it is by definition not part of — the manipulation this PRD's
integrity rule names. `state/cli.js` already reached the same conclusion and
writes attribution to a sidecar for exactly this reason.

So the registry is untouched, C1 does not move, and a low C1 keeps meaning what
it means: findings are not being resolved where they are found.

## Disposition vocabulary

| Term | Means | Requires |
|---|---|---|
| `fixed` | the defect was corrected | evidence |
| `obsolete` | the thing it was about no longer exists | evidence |
| `superseded` | a judgment on it is already recorded elsewhere | evidence |
| `duplicate` | the same claim is carried by another inventory item | `duplicate_of` |
| `rejected` | examined and refused | evidence |
| `deferred` | counted, not judged | a successor that names this seal |

Evidence takes one of four forms, and the path component of each is normalized
through the registry's `normalizeCitedPath`, so an absolute path or `..`
traversal is refused rather than recorded: `<repo-path>:<line>`, a 40-hex commit
sha, `#<PR>`, or a bare repo path (successors only).

### Only resolving dispositions suppress promotion

`fixed` · `obsolete` · `superseded` · `duplicate` remove a finding from the
SessionStart promotion list. **`deferred` and `rejected` do not.**

This mirrors the registry's own `RESOLVING_CLOSURE_TYPES`, which fixed the same
boundary in code because counting a deferral as a resolution is a manipulation
path. Three L2 perspectives (architect, security, invariant) each landed a HIGH
on the plan for missing it: a still-open CRITICAL marked `deferred` would vanish
from the next session's list while the registry still called it open and C1 still
counted it unresolved — M7's invariant switched off with every gate reading
green, and C1 does not watch promotion, so nothing would have detected it.

Suppression is fail-open: an absent, unreadable, or unsealed ledger suppresses
nothing.

### A successor must name the seal

A deferral's successor must exist **and** contain this inventory's digest. File
existence alone is the trap the M9 coverage gate names in its own source — a
committed static file is true forever, so any file in the repository could absorb
an unlimited deferral. Requiring the digest means the successor was edited in
this cycle to accept the handoff, and one line covers a whole batch.

## Snapshot semantics

The denominator is the debt at `sealed_at_commit`. Debt appended afterwards —
including by M10's own gates, which shed findings into the backlog through the
single-pass path — is **outside it** and belongs to the next cycle. `verify` can
report `open: 0` while the live backlog is larger than the sealed one; that is
the boundary, not a defect.

Re-sealing is refused. A second seal would relabel the denominator under
dispositions already bound to the first digest.

## What the disposition mix actually shows

| Disposition | Count |
|---|---|
| `deferred` | 983 |
| `superseded` | 111 |
| `duplicate` | 19 |
| `fixed` | 1 |
| `obsolete` | 1 |

Deferrals by successor: [critical](debt-deferred-critical.md) 31 ·
[high](debt-deferred-high.md) 316 · [minor](debt-deferred-minor.md) 636.

**The backlog is not a list of open defects.** It is a mixed ledger of claims and
judgments. Reading the CRITICAL band item by item — 65 backlog rows — found that
the large majority were already-adjudicated records (a triage verdict, a
rebuttal, an absorption note) that no machine ledger had ever registered. That
is the asymmetry M10 was opened to address, and it is larger than the plan
assumed: the problem is less that debt goes unfixed than that fixing it leaves no
trace a machine can read.

Two provenance forms make this checkable without reading prose:

- an auto-appended panel row has the fixed shape
  `L2 <perspective>: <claim> · 원문 <path> · id=<digest>`, and its adjudication
  lives elsewhere. When that digest is cited again in the same file, the citation
  **is** the judgment — 111 rows were disposed `superseded` on that trace alone.
- anything else was written by a person and normally states a judgment inline.

## What this does not claim

- **It does not claim the debt was settled.** 983 of 1115 items are deferred. The
  scope was CRITICAL-first by operator decision once the sealed denominator came
  in at 1115 rather than the ~800 the plan estimated from an older branch.
- **It does not claim what is still valid.** The gate requires every item to have
  a disposition and at least one CRITICAL/HIGH to be `fixed`; it cannot tell a
  correct judgment from a lazy one. There is no defensible ratio threshold, so
  none is asserted — concentration is reported instead (`deferrals_by_successor`)
  and the audit sample the PRD already requires is where a human looks.
- **It does not claim C1 improved.** By construction it cannot: that is the point
  of writing outside the registry.
- **Cross-source duplicate detection is weak, and measurably so.** Only 19 of 243
  panel rows link to a registry finding. The registry stores `claim_digest` and
  never the claim, so a link requires the backlog row to carry the claim
  byte-identically; 50 rows are truncated with `…` and can never match. Rows that
  do link are kept as separate items and given a cheap `duplicate` disposition
  rather than folded, because folding would let one disposition — including a
  machine one granted from prose — silence a finding inside it.
- **It is not tamper-proof.** Anyone who can run node with write access here can
  write these files directly. The gate targets an unclaimed flip and producer
  drift, the same threat model the M8 and M9 gates state.
