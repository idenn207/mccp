# STATE.md Role Narrowing (v1.4.0 → v1.5.0-m1)

> v1.5.0-m1 — single-purpose explainer.
> Companion to [`session-ledger-schema.md`](./session-ledger-schema.md).
> Cross-references [v1.3.0 reconciliation](../v1.3.0-observability/state-md-naming-reconciliation.md)
> (same tone, same anchor doc role).

## 1. The change in one sentence

`STATE.md` schema is **unchanged** in v1.5.0-m1. What changes is its *role*:
it is no longer a candidate place for cross-session discovery anchors. That
responsibility is delegated to the
[session-ledger directory scan](./session-ledger-schema.md).

## 2. Why STATE.md cannot host session anchors

Earlier plan revisions proposed adding `session_id` and `session_ledger_path`
fields to STATE.md frontmatter, with both keys added to
`HASH_EXCLUDE_FRONTMATTER_KEYS`
([state-writer.js:554](../../plugins/mccp/scripts/state/state-writer.js))
so per-session anchor churn would not dirty `git status`.

Codex Implement Round 1 finding F2 surfaced the structural flaw:

```js
// state-writer.js update() — line 580-584
if (fileExisted && contentHash(existing) === contentHash(merged)) {
  // Content is semantically identical — only timestamps would change.
  // Skip disk write so STATE.md stays out of `git status`.
  return existing;
}
```

- If the anchor fields are in `HASH_EXCLUDE_FRONTMATTER_KEYS`:
  changing *only* the anchor leaves `contentHash` unchanged → the skip
  branch fires → **the disk write never happens** → the anchor is never
  persisted. SessionStart's `state-writer.update({session_id: ...})` would
  return the previous (or empty) state.
- If the anchor fields are *not* excluded from the hash:
  every SessionStart with a new UUID forces a disk write → `git status`
  shows STATE.md dirty every session → v0.3.6 axis 2 noise-elimination
  invariant breaks → the PR #38 ↔ #39 last-write-wins scenario reappears
  the moment a user accidentally stages STATE.md.

Both directions are unviable simultaneously. The only resolution is to
**not put anchors in STATE.md at all**.

## 3. The single surface that replaced it

Discovery moves entirely to the ledger directory:

```text
~/.local/share/ecc-homunculus/projects/<projectId>/.session-ledgers/<session_id>.json
```

(plus `<repo>/.claude/state/session-ledgers/<session_id>.json` for repo /
hybrid scope). Both are scanned by
[`listLedgers({activeOnly:true})`](./session-ledger-schema.md#3-public-api),
which is the only API any consumer should call to enumerate active
sessions. STATE.md keeps its current job: this worktree's narrative
(`goal`, `nextStep`, `last_event`, …).

`derive/sources/state.js#scanState` returns `item.active_session_ledgers`
as a separate array — not as an anchor field on STATE.md.

## 4. PRD ↔ code reconciliation

The PRD
([`.claude/prds/v1-4-0-multi-session-first-class.prd.md`](../../.claude/prds/v1-4-0-multi-session-first-class.prd.md))
lists the question "STATE.md vs new per-session layer?" as Q-mechanism.
The plan's R1 absorption resolves it as **new layer only; STATE.md is
not modified**. PR body amends the PRD Open Questions to lock in this
decision and references this explainer.

This pattern — narrow surface change disguised as "keep STATE.md
schema-stable" — is the same anti-pattern the v1.3.0 reconciliation
explainer guarded against: schema docs and code identifiers must agree.
Here they happen to agree by *no change at all*. The contract surface
freezes one more level: a new milestone (M1) ships without touching the
v1.3.0 frozen STATE.md frontmatter.

## 5. Relation to prior PRDs

| Cycle | Touched STATE.md frontmatter? | Notes |
|---|---|---|
| v1.1.0 Stage 1 | yes — added `dispatch_id`, `dispatch_id_completed`, `dispatch_attempt_count` | resume 2-phase atomic dispatch. |
| v1.2.0-m1 | yes — added `controller_session_id`, `active_dispatch_count` | dispatch-controller fanout. |
| v1.3.0-m0 | no schema bump; froze read-side schema-surface. | M0 created the schema baseline doc. |
| **v1.5.0-m1** | **no — F2 absorption** | Discovery moves to a separate per-session ledger surface. |

Each prior cycle that touched the frontmatter had a single-worktree
ownership reason: resume layer (one resume chain at a time per worktree),
controller layer (one controller per worktree). Cross-worktree state has
no single owner — that's exactly why a separate per-session surface is
the right level.

## 6. References

- Plan: [`.claude/plans/v1-4-0-multi-session-m1-continuity-primitive.plan.md`](../../.claude/plans/v1-4-0-multi-session-m1-continuity-primitive.plan.md)
- Session-ledger schema: [`./session-ledger-schema.md`](./session-ledger-schema.md)
- v1.3.0 reconciliation: [`../v1.3.0-observability/state-md-naming-reconciliation.md`](../v1.3.0-observability/state-md-naming-reconciliation.md)
- state-writer.js noise-elimination origin: v0.3.6 (axis 2)
- PR #38 ↔ #39 last-write-wins post-mortem: see memory `mccp-v1.3.0-cycle`.
