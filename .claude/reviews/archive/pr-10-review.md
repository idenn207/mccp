# PR Review: #10 — feat(v0.2.9): gate round YAGNI — R1 default + DEFER_TO_BACKLOG sink

**Reviewed**: 2026-06-08
**Author**: idenn207 (박동민)
**Branch**: `feat/v0-2-9-gate-round-yagni` → `main`
**Decision**: APPROVE with comments
**Changes**: +586 / -15 across 13 files
**State**: OPEN, MERGEABLE, not draft

## Summary

v0.2.9 milestone PR introducing severity-gated round budget (default cap=1) + YAGNI triage table + `.claude/plans/codex-findings-backlog.md` defer sink. Scope discipline is strong (no schema bump, no new helper/hook/lock, additive `meta.deferred_findings_count` field with `undefined`/`null` tolerance preserves v0.2.7/v0.2.8 receipt forward-compat). Plan + report acknowledge the key trade-offs honestly. All findings below are MEDIUM/LOW PR-description and spec-consistency nits — none block merge.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

#### M1 — PR description language oversells "round-budget library"

- **Where**: PR #10 description Summary + Changes + Files Changed sections.
- **What**: PR body says "Round-budget library (`plugins/mccp/scripts/lib/round-budget.js` via tests)". That file does **not** exist. The policy oracle (`parseCap` + `decide` pure functions) is **self-contained inside the test file** at [plugins/mccp/scripts/lib/tests/round-budget.test.js:17-40](plugins/mccp/scripts/lib/tests/round-budget.test.js#L17-L40). This matches the plan's "no new helper per Out of scope" decision, but the PR title/body suggest otherwise.
- **Why it matters**: Given Codex permanent bypass (no Codex receipt), the PR body **is** the long-lived audit trail. Future readers searching for `round-budget.js` will find nothing and assume code rot.
- **Suggested fix**: Edit PR body Summary to: "round-budget policy encoded as a test-resident oracle at `tests/round-budget.test.js` — no separate helper per plan's 'no new helper' Out-of-scope decision". Edit the Changes bullet `Round-budget library` likewise.

#### M2 — 3-way duplication of round budget prose across markdown command bodies

- **Where**:
  - [plan.md:300-313](plugins/mccp/commands/plan.md#L300-L313) §5.4
  - [prp-implement.md:171-182](plugins/mccp/commands/prp-implement.md#L171-L182) §2.5.4
  - [pr.md:329-340](plugins/mccp/commands/pr.md#L329-L340) §2.5.4
- **What**: Each command body contains nearly verbatim prose specifying the severity-gated re-rerun policy (default cap=1, `ACCEPT_NOW × {CRITICAL, HIGH}` trigger, `MCCP_GATE_ROUND_CAP` env var, `DEFER_TO_BACKLOG` append) plus the YAGNI triage table schema. Combined with the test oracle at [round-budget.test.js:31-40](plugins/mccp/scripts/lib/tests/round-budget.test.js#L31-L40), there are 4 sources of truth for the same policy.
- **Why it matters**: A future policy change must edit 4 places synchronously — exactly the drift problem the receipt schema additivity was designed to avoid. The plan's Out-of-scope clause explicitly accepts this trade-off this cycle, but the cost is real.
- **Suggested fix (defer)**: Either (a) add a `<!-- canonical: tests/round-budget.test.js -->` marker comment in each command body's policy block pointing reviewers at the oracle, or (b) extract `parseCap` + `decide` into `plugins/mccp/scripts/lib/round-budget.js` in a v0.3.x housekeeping cycle and have command bodies refer to it by path.

#### M3 — Env-export pattern asymmetric across 3 gates

- **Where**:
  - [pr.md:287](plugins/mccp/commands/pr.md#L287) — explicit `export MCCP_GATE_ROUND_CAP="${MCCP_GATE_ROUND_CAP:-1}"`
  - [plan.md §5.2 codex-invoke call](plugins/mccp/commands/plan.md) — **no** explicit export
  - [prp-implement.md §2.5.3 codex-invoke call](plugins/mccp/commands/prp-implement.md) — **no** explicit export
- **What**: Only `pr.md` makes the default-1 fallback explicit before the child-process Codex call. plan/prp-implement leave the default to `parseCap()` clamp inside the test oracle (markdown prose only — there is no runtime parseCap on those paths).
- **Why it matters**: In practice the default behavior works because env-inherit semantics are identical for all 3 invocation paths. But:
  1. Inconsistent ritual creates ambiguity — reader may wonder if pr.md is special.
  2. If a future runtime wraps codex-invoke.js in a sandboxed/argv-only call site, pr.md keeps working while plan/prp-implement silently fall back to `1` without the spec saying so explicitly.
- **Suggested fix**: Add the same one-line export to plan.md §5.2 and prp-implement.md §2.5.3 immediately before their `node codex-invoke.js` calls, for symmetry. Or remove the pr.md export and document uniformly that `parseCap` fallback handles missing env.

### LOW

#### L1 — Stale codex-invoke.js reference in pr.md §2.5.4 YAGNI Triage injection template

- **Where**: [pr.md:315](plugins/mccp/commands/pr.md#L315)
- **What**: The PR body section template still says `호출: node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review --base <base-branch> (v0.2.2 fail-closed Bash wrapper)`. Since v0.2.8 F10 the actual call site is `codex-runner.js` → `codex-invoke.js`. The transitive call is still codex-invoke.js so semantics are preserved, but the audit trail points at a deprecated direct-call pattern.
- **Why it matters**: Future debugging "why is Codex behaving like X" lands a reader on the wrong source file. plan.md §5.3 and prp-implement.md §2.5.4 correctly cite `codex-invoke.js` because they actually call it directly — pr.md is the outlier post-v0.2.8.
- **Suggested fix**: Update the schema string in pr.md §2.5.4 to: `호출: node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-helpers/codex-runner.js → codex-invoke.js adversarial-review --base <base-branch> (v0.2.8 F10 helper wrapper)`.

#### L2 — PR Changes bullet incorrectly says cli.js honors MCCP_GATE_ROUND_CAP

- **Where**: PR #10 description Changes section
- **What**: The bullet says "`cli.js` honors `MCCP_GATE_ROUND_CAP` env var". [plugins/mccp/scripts/receipt/cli.js](plugins/mccp/scripts/receipt/cli.js) does **not** read `MCCP_GATE_ROUND_CAP` anywhere. The env var is honored only by command-body markdown prose (interpreted by Claude) and by the test oracle's `parseCap()` helper at [round-budget.test.js:17-22](plugins/mccp/scripts/lib/tests/round-budget.test.js#L17-L22). cli.js's only v0.2.9 change is the new `--deferred-findings <N>` flag (line 21 usage doc).
- **Why it matters**: PR description sets future readers up to grep cli.js for the env var and find nothing.
- **Suggested fix**: Edit PR body Changes section to: "`cli.js` accepts `--deferred-findings <N>` flag; `MCCP_GATE_ROUND_CAP` is honored by command-body markdown + test oracle (no JS runtime read)".

#### L3 — receipt `status --json` lacks `valid` field (acknowledged in report, out-of-scope)

- **Where**: [report:68](.claude/PRPs/reports/v0-2-9-gate-round-yagni-report.md#L68)
- **What**: The plan's validation script used `r.valid !== true` to count invalid receipts but `status --json` doesn't emit that field. Worked around via direct `validate(JSON.parse(file))` call.
- **Why it matters**: pre-existing tech debt. If `status --json` becomes a canonical health-check entry point (e.g. a future `/mccp:trace` integration), this will need an actual `valid` field.
- **Suggested fix**: Track in a follow-up housekeeping plan. Not blocking this PR.

#### L4 — `.migrations/v0.2.8-generic-quarantine.json` not filtered from receipt status output

- **Where**: receipt status output line 1 (verified live): `.migrations/v0.2.8-generic-quarantine  round=undefined  base=  open  at undefined`
- **What**: status CLI treats migration marker as a receipt. report confirms this is a v0.2.8 migration marker per CLAUDE.md §3.6, not a real receipt.
- **Why it matters**: Same as L3 — pre-existing tech debt. Tripped this cycle's validation script. Future automation that depends on `status` counts will need to filter manually.
- **Suggested fix**: Track with L3. Could be a one-liner in `status.js` to skip paths under `.migrations/` namespace.

## Validation Results

| Check | Result |
|---|---|
| Type check | N/A (pure JS, no TS config) |
| Lint (markdownlint MD032) | Pass (warnings ignored per `feedback-no-markdownlint-fix-cycle`) |
| New unit tests (`round-budget.test.js`) | Pass — 5/5 |
| Regression: schema + write + validate-cmd + state-matrix | Pass — 55/55 |
| `--deferred-findings 3` round-trip | Pass — `meta.deferred_findings_count: 3 (number)`, `schema_version: v1` |
| `MCCP_GATE_ROUND_CAP` doc presence | Pass — ≥1 hit in plan.md/prp-implement.md/pr.md/gate-design.md/CLAUDE.md |
| YAGNI Triage schema | Pass — 3 hits in each of 3 command bodies |
| Schema forward-compat | Pass — existing v1 receipts validate (undefined/null tolerance) |
| Roadmap entry (Milestone 2.7) | Pass — Active table + Patterns to Mirror row |
| Backlog file CREATE | Pass — header + empty table schema, 0 entries |

## Cross-Gate Context (PR Body Reuse)

- **Design Review (impeccable)**: PR body has audited `## Impeccable Override` section with substantive reason (≥30 chars, ≥3 words, no banlist token). Receipt CLI schema validator (`force-override-reason.js`) would have rejected a weak reason at write time. Override reason "v0.2.9 round-budget library and receipt schema additions only — no UI surface or visual design changes. impeccable Skill not installed in this project per CLAUDE.md section 1.1; design review N/A for policy/library changes" is acceptable given the change shape (markdown + JS lib only, zero UI surface).
- **Codex Adversarial Review**: PR body acknowledges `MCCP_CODEX_DISABLED=1` permanent bypass — chain-of-custody broken is **design feature** per user memory `feedback-codex-permanent-bypass`. Not flagged.
- **Security Reviewer**: Diff touches no auth/crypto/secrets/input-validation/SQL/SSRF/path-traversal surfaces. The receipt CLI addition (`--deferred-findings <N>`) is a single integer flag with schema-validated input (`Number.isFinite(n) && n >= 0` clamp at write.js:128). security-reviewer Task tool not invoked — N/A.

## Files Reviewed

- [.claude/PRPs/reports/v0-2-9-gate-round-yagni-report.md](.claude/PRPs/reports/v0-2-9-gate-round-yagni-report.md) (Added, +82)
- [.claude/plans/codex-findings-backlog.md](.claude/plans/codex-findings-backlog.md) (Added, +9)
- [.claude/plans/mccp-roadmap.plan.md](.claude/plans/mccp-roadmap.plan.md) (Modified, +2)
- [.claude/plans/v0-2-9-gate-round-yagni.plan.md](.claude/plans/v0-2-9-gate-round-yagni.plan.md) (Added, +298)
- [CLAUDE.md](CLAUDE.md) (Modified, +3)
- [docs/gate-design.md](docs/gate-design.md) (Modified, +14)
- [plugins/mccp/commands/plan.md](plugins/mccp/commands/plan.md) (Modified, +24)
- [plugins/mccp/commands/pr.md](plugins/mccp/commands/pr.md) (Modified, +24)
- [plugins/mccp/commands/prp-implement.md](plugins/mccp/commands/prp-implement.md) (Modified, +36)
- [plugins/mccp/scripts/lib/tests/round-budget.test.js](plugins/mccp/scripts/lib/tests/round-budget.test.js) (Added, +93)
- [plugins/mccp/scripts/receipt/cli.js](plugins/mccp/scripts/receipt/cli.js) (Modified, +2/-1)
- [plugins/mccp/scripts/receipt/schema.js](plugins/mccp/scripts/receipt/schema.js) (Modified, +7)
- [plugins/mccp/scripts/receipt/write.js](plugins/mccp/scripts/receipt/write.js) (Modified, +7)

## Decision Rationale

APPROVE with comments. Forward-compat preserved, tests pass, scope discipline strong, risks self-acknowledged in plan + report. M1/M2/L1/L2 are PR-description and doc-text accuracy issues (audit-trail integrity). M3 is a code-symmetry consistency nit. L3/L4 are pre-existing tech debt the report already deferred. None block merge.

> Recommended pre-merge cleanup: edit PR body to fix M1 + L2 wording (the audit trail is what readers will see in 6 months; the test oracle is the canonical policy source, not a phantom `round-budget.js`). M3 + L1 can land as a small followup edit before merge or in v0.2.10 housekeeping.
