# durable-evidence-substrate — PR-Codex No-ship findings (R1)

- **Decision**: `durable-evidence-substrate`
- **Gate**: mccp-pr-codex (working-tree dogfood, base `origin/main`)
- **Verdict**: **No-ship** — R1, 4 actionable findings (`codex_actionable_findings: true`, `lock_exit_ok: true`, `mutations: []`)
- **security-reviewer**: clean (no CRITICAL/HIGH)
- **Status**: PR NOT created. No push, no receipt, no evidence-commit. Fix in a follow-up `/mccp:prp-implement` cycle, then re-run `/mccp:pr`.
- **codex_summary**: "No-ship: this change can leak local receipt metadata and still report a green audit when the evidence is contradictory or missing."

> Handoff note: `/mccp:pr` is review-only — these must be fixed in a separate cycle. After fixing, the receipt for this decision is still absent (never written this run) and the branch is un-pushed, so re-running `/mccp:pr` starts clean (no overwrite-guard collision).

---

## F2 (HIGH) — Audit exits 0 on contradictory evidence — **FIX**

- **File**: `plugins/mccp/scripts/lib/evidence-audit.js:147-149`
- **Defect**: `state` becomes `ok` for any comparable pair once parsing succeeds. The CLI only exits nonzero for `blind`/`degraded`, so `false_positive > 0` (ledger says converged, receipt says divergent), `unverifiable > 0` (missing receipts / coverage gap), or `hash_bound < comparable` (broken binding) all still return `state: "ok"` + exit 0 — green-lighting the exact inconsistencies the tool exists to expose.
- **Not covered by any plan decision.** Independently matches this session's code-review M1 (there rated MEDIUM; Codex rates HIGH — defensible, the tool's whole purpose is audit honesty).
- **Recommendation**: introduce non-ok state(s) + nonzero CLI exit for `false_positive > 0`, coverage/`unverifiable` gaps, and `hash_bound < comparable`. Add tests asserting these FAIL rather than merely reporting counters.

## F1 (HIGH) — Evidence commit publishes historical absolute cwd — **DECIDE (plan-accepted vs. redact)**

- **File**: `plugins/mccp/commands/pr.md:805-806` (Phase 3.0 `git add -- .claude/receipts/mccp-pr-codex/`)
- **Defect (verified)**: all **33** committed ship receipts carry absolute `meta.cwd`; many leak the **old repo name** `my-claude-code-plugin` (plus the current repo-root absolute path). New-write normalization (`normalizeReceiptCwd`) protects only NEW receipts — historical ones are untouched. Wholesale `git add` of the directory publishes these local paths into public git history **irreversibly** on push.
- **Plan stance (§3.12)**: intentionally accepted — "binding 보존 > leak 제거", leak deferred to Phase B rebind (re-hashing would snap the ledger↔receipt binding, E4). Codex challenges shipping the leak at all.
- **Recommendation (Codex)**: stage only the current `${DECISION_SLUG}.json` (after rejecting absolute cwd); keep historical receipts out of git until a rebind/redaction mechanism preserves the binding without publishing local paths. **Decision required — this is the plan's core premise vs. an irreversible public leak.**

## F3 (HIGH) — Durability step is fail-open before push — **DECIDE (deliberate tradeoff)**

- **File**: `plugins/mccp/commands/pr.md:815-817` (evidence-commit fail-loud-open)
- **Defect**: the evidence-commit is non-blocking — `git commit` failure (hooks, index lock, git identity) only warns, then proceeds to `git push`. Receipts stay only in the working tree; after worktree deletion, a fresh clone is back to blind/unverifiable audit — recreating the exact failure mode Phase A closes.
- **Plan stance**: deliberate — "evidence durability is best-effort and must never block the PR."
- **Recommendation (Codex)**: make persistence fail-closed once receipt changes exist (do not push while the receipt commit failed), or persist to another durable artifact. **Decision required — durability guarantee vs. never-block-PR.**

## F4 (MEDIUM) — PR not idempotent after evidence pushed — **DOCUMENTED/ACCEPTED**

- **File**: `plugins/mccp/commands/pr.md:950-966`
- **Defect**: pushing the evidence commit before `gh pr create`; if PR creation fails afterward, re-running `/mccp:pr` re-reaches finalize with a now-tracked receipt + moved HEAD → overwrite guard rejects the same slug (different hash). Transient GitHub/API/auth failure strands the operator in manual recovery / new-branch.
- **Plan stance (§203)**: documented + accepted (new-slug / new-branch escape). This session reconciled the `[MCCP-PUSH-HALT]` wording with the guard's escape.
- **Recommendation (Codex)**: add a resume path (detect existing tracked receipt + saved HEAD/body marker → skip Phase 2.5/3, retry only `gh pr create`), or make finalization idempotent across the evidence-commit HEAD move. Optional hardening.
