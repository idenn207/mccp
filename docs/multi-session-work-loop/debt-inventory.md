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

`sealInventory` refuses a second seal, and that refusal stands: it would relabel
the denominator under dispositions already bound to the first digest. What changed
is that there is now a **succession** path beside it — see [Re-sealing](#re-sealing)
below. Succession does not re-seal in place; it supersedes.

### Snapshot without refresh is a failing measurement

The sealed inventory is frozen. **It is never updated.** When this file is written,
the live debt grows as the gates append findings — but the denominator stays fixed,
and `verify` will always report `open: 0` as long as all *sealed* items have
dispositions. Meanwhile, the real debt accrues outside the denominator.

This is **not a defect in snapshot semantics** — the snapshot is the intended design.
The defect is **no refresh mechanism**: there is no schedule to re-seal, no alert
when the gap widens, no decision gate on re-seal timing. The consequence is
unseen drift: the denominator can become a historical curiosity that says
nothing about the work today.

**See the denominator gap with `closure report --json`.** The `denominator_gap`
field shows sealed vs. live counts, and the `ledgers[]` array shows the
disposition closure rate beside the findings registry closure rate.

The two rows use different denominators, and the difference is the point: the
disposition ledger counts **sealed inventory items**, so it reports every sealed
item as judged, while the findings registry counts **live registry records**,
which include everything opened since the seal. Read either alone and you get a
number that is defensible and misleading.

Quote the numbers the tool emits, not numbers from elsewhere. The registry row
is computed on **folded records** — one entry per `finding_id` after
`foldEvents` — which is a different unit from the **raw event count** the
baseline snapshot in `.claude/_meta/data/` reports. The two disagree by design
(a finding opened and later closed is two events but one record), so a ratio
derived from one basis must never be attributed to the other. Every figure here
moves on each ledger append; run the tool rather than citing this paragraph.

`seal.age_days` shows how stale the snapshot is, and `seal.ancestry_depth` shows
how many generations it descends from. `closure report` names the succession path
when the gap is non-zero; it remains an instrument and exits 0 regardless.

## Re-sealing

The denominator can move forward without breaking the judgments bound to the old
one. The tool is `plugins/mccp/scripts/lib/msw-metrics/reseal.js`. **It plans by
default and writes nothing**; `apply --apply` is the only path that changes
anything, and the doubled flag is deliberate — a tool that walks around
`sealInventory`'s refusal must not be reachable by accident.

```bash
node plugins/mccp/scripts/lib/msw-metrics/reseal.js            # plan, writes nothing
node plugins/mccp/scripts/lib/msw-metrics/reseal.js apply --apply
```

### Succession is an append, not a rewrite

Old lines are never edited. Each carried item gets a **new** line bound to the new
digest, carrying `disposition`, `evidence`, `successor` and `duplicate_of`
verbatim plus two provenance fields (`succeeded_from`, `originally_disposed_at`).

The alternative — rewriting `inventory_sha256` in place across the old lines —
would follow the precedent in `migrations/v1.22.4-cwd-rebind.js`, but that
precedent does not transfer. There the binding *is* the filename, so breaking it
leaves a dangling entry and re-keying is the only honest move. Here the binding is
a field inside a line of an append-only log, and this ledger already fixed the rule
for that shape: *"a re-judgment is recorded rather than overwritten — both readings
stay auditable"*. Editing 1115 lines would not be re-keying an index; it would be
rewriting a log.

### What succession does NOT carry

Three outcomes, all reported rather than absorbed:

- **dropped** — the item is no longer live, so there is nothing in the new
  denominator to attach a judgment to. **An item that stopped being live is not an
  item that got done.** Most commonly a backlog row was edited (`rowId` is a hash
  of the row's content) or a registry finding was closed. The row comes back as a
  *new* item with no judgment, and that is correct: it has to be judged again.
- **carry_blocked** — the item survived but its line points at another item that
  did not. `duplicate_of` is recomputed by `linkDuplicates` on every seal, so a
  twin can leave the denominator. These are left unjudged rather than re-pointed:
  substituting a different twin would be a machine editing a person's decision.
- **unjudged** — everything in the new denominator that never had a judgment.

### Editing a backlog row re-keys it

`rowId` hashes all four cells of a row, so correcting a typo in a row gives it a new
identity: the old item leaves the live pile and a new unjudged one arrives. If the
old item held a judgment bound to the current seal, that judgment is what the next
re-seal reports as **dropped**. Changing the identity scheme would unbind every
judgment ever written (PRD decision 1), so the rule is operational instead: **rows
are append-only** — a correction is a new row that names the old one.

`closure report` shows the exposure before a re-seal does. The json carries
`denominator_gap.sealed_not_live` (sealed items no longer live) and
`sealed_not_live_disposed` (those among them holding a current-seal judgment), and
the table prints both on one line:

```
  Sealed not live: 11 (1 with a disposition — dropped at the next re-seal)
```

Both are `null` — `n/a` in the table — when identities or the disposition axis
cannot be trusted.

### Acceptance is a marker, not a substring

A `deferred` disposition needs a successor document that **declares** it accepts
the handoff:

```
<!-- accepts-inventory: sha256:<64 hex> -->
```

The earlier rule was "the body contains the digest somewhere", and it does not
hold: every committed file carrying the sha becomes eligible. Measured in this
repo — both `.claude/_meta/data/2026-09-08-closure-*.json` files embed the full
digest, and so does *every line* of `debt-dispositions.jsonl`. An enumerated
deny-list cannot fix that, because the set of such files grows on its own and a
re-seal writes more of them. The marker closes the class instead.

A marker inside a fenced block, a blockquote, indented code, an inline code span,
or a raw-text HTML block (`pre`, `code`, `script`, `style`, `textarea`) does
**not** accept — otherwise a document explaining the format would accept on its
own behalf.

Two details of that rule are load-bearing and easy to get backwards. A **balanced**
raw-text block is stripped wherever it opens, including mid-line: markdown passes
raw HTML through from anywhere, so `<pre>` opened after a sentence reads as a
quoted example while an anchored matcher would leave the marker inside it live.
Only the **unterminated** opener is required to sit at the start of a line, and
that anchor exists to prevent over-removal — "use the `<code>` tag" mid-sentence is
inline HTML, not a block.

**Put the marker in a paragraph of its own, with no backtick in it** (M5). Inline
code is not paired any more: a paragraph — lines between blank lines, where blank
means only spaces and tabs as CommonMark defines it — that holds a backtick anywhere
keeps none of its lines, counted on the original text before any other rule blanks
a line. The per-line pairing this replaced accepted a marker inside a span opened on
one line and closed two lines down (M4 PR-Codex F1). Pairing cannot be repaired by
choosing boundaries better, because it fails in both directions: cut a paragraph
where CommonMark does not — a 4-column continuation line, or a line holding only a
no-break space — and the span is split open around the marker; join paragraphs that
CommonMark keeps apart and an unpaired backtick takes the next paragraph's opener as
its partner. A code span cannot cross a blank line, so a paragraph with no backtick
has no character inside one. The cost is stated rather than hidden: a genuine marker
that shares a paragraph with inline code is refused, and `checkSuccessor` names the
file that carries no accepted marker.

The block match also runs **after** the fence, blockquote and indented-code pass,
over what that pass kept. Taken first, it can start at an inline `<pre>` on a
paragraph line and end at a `</pre>` inside the fence that follows — a fence line
interrupts that paragraph, so a reader sees fenced code, but the match erases the
fence opener and leaves the quoted marker live. The price of this order is
over-removal only: a fence line inside a line-start `<pre>` block opens a fence the
renderer would not, and that can only refuse a marker.

Over-removal is the safe direction: a stripped real marker yields no match, and no
match refuses the deferral.

### The ancestor chain

A superseding seal records `meta.supersedes` and `meta.ancestry`, and archives its
predecessor under `docs/multi-session-work-loop/seals/debt-inventory-<sha12>.json`.
Lines bound to a **verified** ancestor are counted as `ancestor_bound_lines` and are
excluded from `ok`; `binding_mismatch` keeps its original meaning and still turns
the gate red.

`meta` is outside the sealed digest (`inventoryHash` covers `items[]` only), so an
ancestor is not believed as written. Three conditions must all hold: the shape is
`sha256:<64hex>`, the archive **recomputes** to the sha it is filed under, and the
archive is **in the git index**.

**Be precise about what that buys.** Recomputation alone is self-fulfilling —
`inventoryHash` is a public pure function, so anyone can hash a fabricated
`items[]` and park it under the matching filename. The index condition raises that
to *index membership*, which `git add` satisfies without leaving a commit. Neither
authenticates provenance. What they close is **drift, mistakes and silent
reclassification**; forgery stays exactly as open as CLAUDE.md §3.12 already states
for every ledger here. Claiming more would be the same comfortable-false-number
this subsystem exists to remove.

Because acceptance is checked against the whole ancestor **set**, a successor
marker written for generation 1 keeps accepting at generation 3. A **new** deferral
gets no such credit: with no `succeeded_from`, it must name the current seal.

### After a re-seal, `verify` goes red — that is the success signal

`open` jumps from 0 to the unjudged remainder and `ok` becomes `false`. The green
that preceded it was an artifact of measuring a frozen denominator, which is the
defect this whole axis exists to remove. Do not widen succession to keep the number
green.

### The gate cross-checks verify on the seal axis

`m10-coverage-gate.js` recomputes the ancestor split itself rather than taking
`verifyDispositions` at its word — that independence is the gate's stated rule. Until
M5 it never looked at the producer's answer on this axis, so two ancestry judgments
could drift apart without anyone seeing it. The seal axis now compares
`ancestor_bound_lines` and `binding_mismatch` with its own counts, and on a chain it
cannot judge it expects `verify` to report `ancestry_depth: null` too. A disagreement
is `producer_agrees: false` and turns the axis red on its own; an answer that cannot
be read (a throw, a non-object) is not agreement. This is the shape axis 2 already
had.

### `seal_intact` is a narrower claim than it sounds

`seal_intact` answers exactly one question: does `inventory_sha256` recompute from
`items[]`. It says nothing about whether the lines bound to *other* digests belong
to this seal's history — that is a separate judgment, made by `sealAncestry` under
the three conditions above, and the two are reported as separate fields for that
reason. A seal can be perfectly intact while its ancestry is malformed, and an
unjudgeable ancestry is a refusal rather than an allowance.

### Ancestor-bound lines are validated once, at append time

A carried line is checked by `appendDispositions` when it is written, and after
that it is **never re-validated**. `verifyDispositions` re-checks lines bound to
the *current* digest; lines bound to an ancestor are counted, not re-examined. So
if a successor document that satisfied a `deferred` at generation 1 is later
deleted, the generation-1 lines keep their status while an equivalent line written
today would be refused.

This is a deliberate limit, not an oversight: re-validating the whole chain on
every run would make a judgment's standing depend on the current state of files it
was never bound to, which is the opposite of what a sealed record is for. What it
costs is stated plainly — the older a generation, the weaker the evidence that its
carried judgments would still hold today.

### The 2026-09-08 seal meta was corrected

The committed seal at `docs/multi-session-work-loop/debt-inventory.json` carried
`sealed_at_commit: 9093b08…` beside `sealed_at: 2026-09-08`, and `source_digests`
from that same earlier generation. Both were **inherited**: `buildCandidate` copied
them from the predecessor instead of measuring its own. The commit was corrected to
`e5d274c4e621541f9a26e42bb85761387c5859b2` — the HEAD the re-seal actually ran at,
recorded independently as `repo_head` in
`.claude/_meta/data/2026-09-08-closure-reseal-live.json` and confirmed reachable
from this branch.

`source_digests` was set to `null` rather than back-filled. The bytes of those three
files at that moment cannot be proven after the fact (the tree may have held
uncommitted lines), and nothing reads the field. **"Not measured" is the honest
value; a plausible one would be a fabrication.** The predecessor's values are not
lost — `meta.supersedes` still carries them.

Only `meta` changed. `inventoryHash` covers `items[]`, so `inventory_sha256` and
all 1101 carried bindings are byte-identical; the change is two fields, verifiable
with `git diff --numstat`.

### The apply lock, and what it does not cover

`apply` takes `.claude/state/reseal.lock` (`O_EXCL`, body
`{pid, host, started_at, nonce}`) before it reads anything, and releases it in a
`finally` — but only if the lock is still the one this process wrote. "The one this
process wrote" is decided by `nonce` (`crypto.randomUUID()`, M5): pid, host and a
millisecond timestamp can all repeat, and a reused pid in the same millisecond would
otherwise pass for the owner. A body written before M5 has no nonce, so when either
side lacks one the old three-field match decides — that keeps an old dead-pid lock
reclaimable, and it is a window where ownership is the weaker comparison, the same
kind of legacy residue CLAUDE.md §3.6 records for `quarantine.lock`. A dead pid **on this host** is reclaimed once,
and that reclamation is itself serialized behind `.claude/state/reseal-reclaim.lock`,
because two processes that each saw the same dead owner would otherwise unlink each
other's replacement. The re-create after the unlink is `O_EXCL` too: "I removed it,
so my create must succeed" is false — an ordinary acquirer can win that gap.

Three limits, stated rather than implied:

- **Single host.** A lock held by a pid on another machine is refused, not
  reclaimed, because liveness is not observable from here. Shared checkouts across
  hosts are not protected against, they are refused.
- **No lease.** A lock whose body never landed (a crash between create and write)
  is refused with the path and a recovery instruction, not reclaimed on a guess. An
  mtime lease would just move the same check-then-act race one layer up.
- **Not forgery protection.** Same threat model as CLAUDE.md §3.12 — anyone who can
  run node here can write the seal directly. The lock stops concurrent runs, not a
  writer who means to.

### Reproducibility notice

M10's completion verdict was `m10-coverage-gate.js` exit 0. After a re-seal that
gate exits 1 on the same tree. The verdict is not being revoked — the evidence it
stood on is preserved in the seal archive, so which digest it held for stays
checkable. Only the location of that evidence moved.

**Which axis is red changed in M4, and the reason matters.** The seal axis used to
report `mismatched_lines: 1115` after a successful re-seal, because it counted
every line not bound to the current digest as drift. It now separates
`ancestor_bound_lines` using the same `sealAncestry` oracle `verifyDispositions`
has always used, so that axis is green and `mismatched_lines` means what it says.
The gate still exits 1 — now from `dispositions.open > 0`, which is the unjudged
remainder a moved denominator is supposed to expose. **That was a correction to the
reason for red, not a change from red to green.**

### Rolling back

**There is no undo.** The ledger is append-only, so carried lines cannot be
removed, and the seal swap replaces a tracked file. **git is the only rollback
path** — which is why a re-seal is kept to a single commit: reverting that one
commit restores the seal, the archive, the manifest and the carried lines together.
Revert anything less and the ledger and the denominator disagree.

### Re-entry after a crash

`.claude/state/reseal-manifest.json` is written **before** anything destructive and
carries a `state`:

- `in-progress` + `new_sha` matches the seal on disk → resume, appending only the
  carried lines. The live pile is **not** re-derived.
- `in-progress` + it does not match → the seal was never swapped; re-plan.
- `complete` → that operation is finished. A further call plans a **new**
  generation, and reports a noop if there is nothing to re-seal. (Without the
  state, "new_sha matches the seal" is true forever after a success, and every
  later generation would collapse into a replay of a finished append.)
- absent, with the seal already superseded and nothing bound to it → **refuse**.
  The target cannot be identified, and re-planning would re-derive the denominator
  from live debt that has since moved, losing the judgments in a ledger that cannot
  be un-appended.

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

### The json report is a run artifact

The `closure-report` workflow uploads `closure-report.json` as an artifact named
`closure-report` on every run. There is deliberately **no target value** for the
out-of-denominator gap (PRD OQ, closed in M5): the gap reopens after every re-seal
(0 → 454 → 488 → 525 so far), so the question worth asking is its **rate**, and a
rate needs past values. Rebuild it from the runs:

```
gh run list --workflow closure-report.yml --json databaseId,createdAt
gh run download <run-id> -n closure-report
```

Retention is the repository default — a value above the repository limit changes
behaviour — so the history reaches back as far as that default and no further. The
step fails when the file is missing, which is what red already means for this job:
the instrument did not run.

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
