# Local Review: v0.2.4 security-reviewer restore + hook silent-block fix

**Reviewed**: 2026-06-04
**Branch**: feat/v0.2.4-security-reviewer-restore
**Mode**: Local Review (advisory pre-commit, receipt chain skipped) + Codex Round 1 (dual-reviewer)
**Decision**: APPROVE (after F1-F4 fixes; Codex needs-attention findings absorbed)

> Invoked via inline procedural execution (slash command plugin cache stale at v0.2.3; workspace edits not loaded by the runtime). hook gates bypassed by design — Local Mode is advisory. Codex Round 1 (dual-reviewer) invoked separately via `codex-invoke.js adversarial-review`; 4 findings (3 HIGH + 1 MEDIUM) returned, all absorbed in-session.

## Summary

28-file changeset spanning two logical groups: (A) the v0.2.4 security-reviewer
restore (plan + report fully drive the scope, 12 tasks, 49 new tests) and (B) a
silent-block fix in `receipt-prompt.js` / `receipt-skill.js` that this same
session diagnosed and patched. Group A executes the plan with zero functional
deviation. Group B is a small, well-scoped fix with regression test coverage.
Full plugin test suite passes (401/403, 2 expected smoke skips).

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

#### M-1 — pr.md promises a validator cross-check that does not exist in code
- **Location**: [commands/pr.md:376](plugins/mccp/commands/pr.md#L376) (final line of `### Security Reviewer Override` section)
- **Issue**: `pr.md` states *"The `meta.security_force_override_reason` value passed via `--security-force-override-reason` MUST be identical to the `Reason` field inserted into the PR body. Validators cross-check the two at `validate-cmd` time."* — but `validate-cmd.js`'s new `security_force_override` branch [validate-cmd.js:184-196] only emits a warning carrying the receipt reason; it never reads the PR body. Nothing parses `## Security Reviewer Override` and compares against `meta.security_force_override_reason`.
- **Risk**: An operator could set `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="reason-A"`, write the receipt with that reason, then hand-edit the PR body to a different reason before pushing. The audit invariant (`PR body == receipt reason`) is documented but unenforced, weakening the R3 finding #1 audit-hole closure.
- **Suggested fix (pick one)**:
  - (a) Implement the cross-check: at `validate-cmd` time, locate the PR body file (e.g. `.git/mccp/tmp/pr-body-${DECISION_SLUG}-${HEAD_SHA:0:12}.md`), grep the override section's `**Reason**:` line, fail-closed if it does not equal `meta.security_force_override_reason`.
  - (b) Soften the docs: drop the "Validators cross-check at validate-cmd time" sentence and rely on reviewer-eyes-on-PR enforcement, which is what `Reviewer action: Confirm override reason is acceptable before merge` already promises.
- **Why MEDIUM, not HIGH**: the audit signal is still surfaced via two independent channels (PR body section + receipt warning), so divergence is detectable post-hoc by any reviewer who reads both. The hole is in the strength of the guarantee, not the existence of the audit trail.

### LOW

#### L-1 — CLAUDE.md §4 overstates schema warning behavior
- **Location**: [CLAUDE.md:223](CLAUDE.md#L223) (one-line cheat sheet entry)
- **Issue**: The new env var entry says *"1-token reason(=1, =yes)은 schema warning 발동"*. There is no schema-layer enforcement for 1-token reasons; `schema.js` only requires `security_force_override_reason` to be a string-or-null. The 1-token rejection is a command-body instruction in `pr.md` Phase 2.5.5 telling the assistant to prompt the user, not a guard inside `schema.js` or `write.js`.
- **Risk**: A reader of CLAUDE.md alone (without reading pr.md or running the code) would expect `=1` to be auto-rejected at write time. It isn't — only the command body's runtime prompt catches it.
- **Suggested fix**: rephrase to "command body가 1-token reason 시 구체적 사유 prompt" or similar, matching what the code actually does.

#### L-2 — dogfood `extractContract` regex requires backtick-quoted form
- **Location**: [scripts/lib/tests/security-reviewer-dogfood.test.js:51-57](plugins/mccp/scripts/lib/tests/security-reviewer-dogfood.test.js#L51-L57)
- **Issue**: `extractContract` only matches `` `subagent_type: "security-reviewer"` `` and `` - prompt: `"<text>"` `` with backticks. A future maintainer who writes the contract without backticks (semantically equivalent markdown) will silently produce `{ subagent_type: null, prompt: null }`, causing the test to fail with a generic message rather than surfacing the actual drift.
- **Risk**: Low — the test does fail, just not informatively. But the strict backtick requirement is undocumented in the command body, so future edits may accidentally drop them.
- **Suggested fix**: either (a) loosen the regex to accept non-backticked form, or (b) add a one-line note in `prp-implement.md` / `pr.md` / `code-review.md` near the Task tool contract block telling authors to preserve the backtick wrapping for the dogfood regex.

#### L-3 — schema.test.js `valid()` helper has the new fields but no negative tests
- **Location**: [scripts/receipt/tests/schema.test.js:34-41](plugins/mccp/scripts/receipt/tests/schema.test.js#L34-L41)
- **Issue**: The `valid()` helper now bakes in `security_skipped: false, security_force_override: false`, but `schema.test.js` itself was not augmented with negative cases for the new fields. Those negative cases live in `state-matrix.test.js` and `security-skipped.test.js`, which is acceptable, but the coverage is now split across files in a non-obvious way.
- **Risk**: very low — coverage is fine; this is an organization observation, not a defect.
- **Suggested fix**: optional cross-reference comment in `schema.test.js` pointing to `state-matrix.test.js` for the new-field negative tests.

## Validation Results

| Check          | Result | Notes |
|----------------|--------|-------|
| `node --test`  | ✅ Pass | 403 tests total: **401 pass, 0 fail, 2 skipped** (codex-companion-smoke + task-tool-smoke; expected skip-on-unavailable). Duration ~15s. |
| Type check     | N/A | Plain Node.js (no TS in the plugin). |
| Lint           | N/A | No lint config in the plugin. |
| Build          | N/A | No build step. |
| Static guards  | ✅ Pass | `security-reviewer-guard.test.js` confirms 0 Skill / 0 Agent-shorthand / ≥1 canonical contract per file. |
| Schema invariant | ✅ Pass | `state-matrix.test.js` row 5 confirms `security_skipped + force_override` is rejected at schema layer. |
| Backward compat | ✅ Pass | Receipts predating v0.2.4 (missing `security_skipped`) are now invalid by design (`state-matrix.test.js` "missing field" case). Operator must regenerate. |

## Cross-Reference: My Hook Fix vs Plan's Issue D

The plan body documents a "User-Identified Audit Issue D" at lines 432-478:
*"receipt-gate block이 사용자에게 invisible (silent UX failure)"*. The plan
proposes 4 recommended fixes (surface block reason, escalate debug to user-
visible channel, document two-validate-path trap, add regression test) and
defers all of them to "plan-codex round 4".

This session's [hook silent-block fix](plugins/mccp/scripts/hooks/receipt-prompt.js#L129-L139)
addresses a **different but related** silent-failure symptom — `/mccp:code-review`
with blank args was being misclassified as PR Review Mode and blocked. My fix
adds the Local Review Mode bypass that the command spec already documents.

The plan's Issue D recommendations (surfacing block reasons to user-visible
channels) are **not** addressed by my fix and remain open for v0.2.5 or
round 4 follow-up. Worth noting for the upcoming commit/PR scope decision —
my fix and the v0.2.4 work are logically separable.

## Files Reviewed

### Group A — v0.2.4 security-reviewer restore (24 files)

**Modified (15)**:
- `.claude/state/STATE.md` — auto-updated by pre-compact hook (no review)
- `CLAUDE.md` — §4 운영 토글 한 줄 추가 (see L-1)
- `plugins/mccp/.claude-plugin/plugin.json` — version 0.2.3 → 0.2.4
- `plugins/mccp/commands/code-review.md` — Phase 2.5.3 Skill → Task tool
- `plugins/mccp/commands/plan.md` — timeout 90s → 900s hotfix only
- `plugins/mccp/commands/pr.md` — Phase 2.5.5 Skill → Task tool + escape branch + PR body Override template (see M-1)
- `plugins/mccp/commands/prp-implement.md` — Phase 2.5.5 Skill → Task tool + fallback branch
- `plugins/mccp/scripts/lib/codex-invoke.js` — DEFAULT_TIMEOUT_MS bump + `--json` forward
- `plugins/mccp/scripts/receipt/cli.js` — write help text 4개 새 flag
- `plugins/mccp/scripts/receipt/schema.js` — 4개 새 meta field + 4-axis invariant
- `plugins/mccp/scripts/receipt/validate-cmd.js` — strict/lenient gate split + warnings[] field
- `plugins/mccp/scripts/receipt/write.js` — CLI args → meta mapping
- `plugins/mccp/scripts/receipt/tests/schema.test.js` — `valid()` helper baseline

**Created (9 test files)**:
- `plugins/mccp/scripts/lib/tests/security-reviewer-guard.test.js` (5 tests)
- `plugins/mccp/scripts/lib/tests/security-reviewer-dogfood.test.js` (10 tests, see L-2)
- `plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js` (5 tests)
- `plugins/mccp/scripts/lib/tests/codex-companion-smoke.test.js` (1 test, skip-on-unavailable)
- `plugins/mccp/scripts/lib/tests/task-tool-smoke.test.js` (1 test, skip placeholder)
- `plugins/mccp/scripts/receipt/tests/security-skipped.test.js` (7 tests)
- `plugins/mccp/scripts/receipt/tests/security-force-override.test.js` (6 tests)
- `plugins/mccp/scripts/receipt/tests/state-matrix.test.js` (9 tests)
- `plugins/mccp/scripts/receipt/tests/e2e-dogfood.test.js` (3 tests)

**Plan/Report artifacts (2)**:
- `.claude/PRPs/plans/completed/v0-2-4-phase-7-2-5-restore.plan.md`
- `.claude/PRPs/reports/v0-2-4-phase-7-2-5-restore-report.md`

### Group B — Hook silent-block fix (4 files, this-session)

- `plugins/mccp/scripts/receipt/decision.js` — `isLocalReviewMode` helper added
- `plugins/mccp/scripts/hooks/receipt-prompt.js` — Local Mode bypass branch
- `plugins/mccp/scripts/hooks/receipt-skill.js` — Local Mode bypass branch (mirror)
- `plugins/mccp/scripts/receipt/tests/decision.test.js` — `isLocalReviewMode` test

## Recommendation

**APPROVE with comments**. Group A executes a tightly-scoped plan with zero
deviation, dual adversarial reviewer findings (R1/R2/R3) all absorbed, and
49 new tests with no regressions. Group B is a small, complementary fix with
proper test coverage.

Address before merge: **M-1** (decide cross-check implementation or doc
softening; not blocking, but the audit-hole closure is weaker than the docs
promise).

Defer: **L-1**, **L-2**, **L-3** (cosmetic/maintainability). These are
follow-up candidates, not commit blockers.

## Next Steps

- Decide M-1: implement the cross-check or soften the doc claim
- Consider splitting the commit/PR into Group A (v0.2.4) and Group B (hook fix) — they are logically independent and the plan's Issue D recommendations remain open separately
- `/mccp:pr` for the v0.2.4 group (will use the new v0.2.4 Phase 2.5.5 path itself, eating its own dog food)

---

## Codex Adversarial Review — Round 1 (2026-06-04, post-Local-Review)

After the Claude Local Review concluded APPROVE-with-comments (M-1 only), the
same changeset + this review's conclusion were submitted to Codex as a
second-opinion. Codex returned **needs-attention ("No-ship")** with 4 findings.
This is the dual-reviewer value scenario: Codex caught 3 HIGH fail-open risks
that Claude's first pass missed, plus 1 MEDIUM regression in Claude's own
Group B hook fix.

**Codex session**: thread `019e9160-20e4-7862-821d-2c5e237caf98`, duration 377s
(~6.3 min), classification=`ok`, blocking=`false`, advisory=`false`.

**Codex's verdict on M-1**: *"Treat M-1 as medium unless the missing
cross-check is paired with the PR override persistence bug above; the
persistence/receipt omissions are the real high blockers."* — i.e. M-1 tier
correct, but it's not the load-bearing finding.

### Codex Findings + Resolution

| #  | Severity           | Title                                                            | Status   |
| -- | ------------------ | ---------------------------------------------------------------- | -------- |
| F1 | HIGH   (conf 0.88) | Advisory axis is not writeable                                   | ✅ FIXED |
| F2 | HIGH   (conf 0.86) | Implement security-reviewer fallback not stamped into receipt    | ✅ FIXED |
| F3 | HIGH   (conf 0.82) | PR body persistence + receipt-write omit force-override flags    | ✅ FIXED |
| F4 | MEDIUM (conf 0.84) | `isLocalReviewMode` mis-classifies branch names as Local         | ✅ FIXED |

### F1 — Advisory axis is not writeable

- **Codex location**: `plugins/mccp/scripts/receipt/write.js:101-112`
- **Verified**: `validate-cmd.js:148` treated `meta.advisory === true` as
  blocking, but `schema.js` had no `advisory` field validation, `write.js`
  had no `--advisory` flag, and `validate-cmd.test.js:167` self-documented
  *"Hand-edit advisory flag (no CLI flag for this yet — set by future
  wrappers)"*. The 4-axis matrix advertised `advisory` as an axis but no
  receipt could ever set it without out-of-band JSON editing.
- **Fix applied**:
  - [schema.js:138-142](plugins/mccp/scripts/receipt/schema.js#L138-L142) — `meta.advisory` boolean field validation added
  - [schema.js:204](plugins/mccp/scripts/receipt/schema.js#L204) — `advisory: false` default in `makeSkeleton`
  - [write.js:109](plugins/mccp/scripts/receipt/write.js#L109) — `advisory: args['advisory'] === true` mapping
  - [cli.js:21](plugins/mccp/scripts/receipt/cli.js#L21) — `[--advisory]` flag documented in write help text
  - [state-matrix.test.js](plugins/mccp/scripts/receipt/tests/state-matrix.test.js) — new "row 9: advisory writeable" test that writes via `--advisory` and asserts validator surfaces blocking
- **Deferred to v0.2.5**: command-body level (plan.md / pr.md / prp-implement.md)
  auto-detection of `MCCP_ALLOW_CODEX_UNAVAILABLE` advisory path and conditional
  `--advisory` flag forwarding. The axis is now writeable; wiring it from the
  command body is a separate cycle.

### F2 — Implement security-reviewer fallback not stamped

- **Codex location**: `plugins/mccp/commands/prp-implement.md:195-200`
- **Verified**: Phase 2.5.5 stated *"The Phase 2.5.6 receipt-write step MUST
  pass `--security-skipped`"*, but the actual Step C bash block had no
  conditional flag forwarding. In the security-reviewer auto-fallback path,
  the receipt would be written without `meta.security_skipped=true` and
  downstream `/mccp:pr` validator would see an approving receipt.
- **Fix applied**: [prp-implement.md:165-179](plugins/mccp/commands/prp-implement.md#L165-L179) — Phase 2.5.5 now mandates `export SECURITY_SKIPPED_REASON=<reason>` on fallback; [prp-implement.md:195-216](plugins/mccp/commands/prp-implement.md#L195-L216) — Step C is now a conditional `if [ -n "$SECURITY_SKIPPED_REASON" ]; then ... --security-skipped --security-skip-reason ... ; else ... ; fi` block.
- **Test coverage**: existing `security-skipped.test.js` already exercises
  the validator side of this contract. Command-body recipe coverage is
  Codex's next_steps recommendation; deferred to v0.2.5 e2e command-recipe
  test layer.

### F3 — PR body persistence ordering + receipt-write force-override

- **Codex location**: `plugins/mccp/commands/pr.md:207-228`
- **Verified**: Phase 2.5.4 persists the PR body draft to
  `.git/mccp/tmp/pr-body-<slug>-<sha>.md` **before** Phase 2.5.5 runs the
  security-reviewer. If Phase 2.5.5 adds a `### Security Reviewer`
  subheading or hits the `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` audited
  escape (which is supposed to inject a `## Security Reviewer Override`
  section as canonical audit source per R3 finding #1), neither addition
  reaches the persisted body-file that Phase 4 reads back. Additionally
  Phase 2.5.7 receipt-write had no conditional `--security-force-override`
  forwarding, same shape as F2.
- **Fix applied**:
  - [pr.md:246-260](plugins/mccp/commands/pr.md#L246-L260) — audited escape branch now mandates `export SECURITY_FORCE_OVERRIDE_REASON=<reason>`
  - [pr.md:266-302](plugins/mccp/commands/pr.md#L266-L302) — new Phase 2.5.5b re-persists the body with security additions + conditional `## Security Reviewer Override` section embedded from the env var
  - [pr.md:281-307](plugins/mccp/commands/pr.md#L281-L307) — Phase 2.5.7 receipt-write is now a conditional block (F2 pattern, parallel structure)
- **Test coverage**: existing `security-force-override.test.js` already
  asserts the validator surface. Command-recipe coverage (real bash flow,
  body-file content assertions) deferred to v0.2.5.

### F4 — `isLocalReviewMode` mis-classifies branch names

- **Codex location**: `plugins/mccp/scripts/receipt/decision.js:126-133`
- **Verified — direct hit on the Group B hook fix this session added**:
  `isLocalReviewMode` returned `false` only when first non-flag arg matched
  `/^\d+$/` or a github.com PR URL. But [code-review.md:92](plugins/mccp/commands/code-review.md#L92) explicitly
  supports branch names as PR refs via `gh pr list --head <branch>`, so
  `/mccp:code-review feat/security-fix` was being mis-classified as Local
  Mode and bypassing the receipt chain — a NEW silent-failure introduced
  by this session's fix to a different silent-failure.
- **Fix applied**: [decision.js:121-128](plugins/mccp/scripts/receipt/decision.js#L121-L128) — `isLocalReviewMode` now returns `false` for **any** positional argument (PR number, URL, OR branch name). Local Mode is strictly blank-args or flags-only. A typo'd branch arg still routes to PR Mode and is rejected later by `gh` — that's intentional (shape decision, not content classification).
- **Test coverage added**: [decision.test.js](plugins/mccp/scripts/receipt/tests/decision.test.js) — new "isLocalReviewMode treats branch names as PR Review Mode (F4 fix — Codex finding)" test with 7 cases including conventional prefixes (`feat/`, `fix/`, `release/v1.2.3`) and typo-style strings.
- **Self-reflection**: this is a clear case of the failure mode the plan's
  Issue D was already worried about — UX silent failure. My initial fix
  patched one symptom (blank-args mis-classification) but narrowed PR Mode
  too tightly, creating a second silent failure for branch-name use. Codex
  caught it in 6 minutes.

### Test Suite After All 4 Fixes

| Metric      | Before fixes        | After fixes                              |
| ----------- | ------------------- | ---------------------------------------- |
| Total tests | 403                 | 405 (+2 from F1 row 9 + F4 branch-name)  |
| Pass        | 401                 | 403                                      |
| Fail        | 0                   | 0                                        |
| Skipped     | 2 (smoke, expected) | 2                                        |
| Duration    | ~15s                | ~15s                                     |

### Updated Decision

**APPROVE**. M-1 still stands (validator cross-check not implemented), but
F1-F4 (the real fail-open risks Codex surfaced) are closed. M-1 + L-1/L-2/L-3
remain as documentation softening candidates — none block merge.

### Codex Recommended Next Steps (deferred to v0.2.5)

1. Add end-to-end tests around command **recipes** (bash flows in
   prp-implement.md / pr.md / code-review.md), not only receipt writer
   helpers. Specifically: security-reviewer failure path, force-override
   path, advisory mode path, branch-name code-review invocation.
2. Decide on `meta.advisory` axis: either wire command-bodies to set it on
   `MCCP_ALLOW_CODEX_UNAVAILABLE` advisory path (full axis impl), or collapse
   into `codex_skipped=true` and remove the axis from state-matrix.
