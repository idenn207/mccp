# Dogfood Results: mccp v0.2 S9 (compressed)

**Plan**: [.claude/plans/mccp-v0.2-s9-dogfood-test.plan.md](../../plans/mccp-v0.2-s9-dogfood-test.plan.md) (archived after this report → `completed/`)
**Mode**: compressed (2-3 runs per scenario, not the v0.2 plan §2 full 1-week dogfood)
**Date**: 2026-06-03
**Plugin under test**: `C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.0/`
**Workspace source**: `plugins/mccp/` (line-ending-normalized SHA256 identical to installed cache)
**Implement-Codex gate receipt**: `.claude/receipts/mccp-implement-codex/main.json` (auto-fallback — `codex:adversarial-review` skill unregistered, decision-set inherited from plan)

---

## Summary

All 7 dogfood scenarios (T-Pre, T-Stop-Observe, T-Stop-Enforce-Pass, T-Stop-Enforce-Fail, T-Codex-Bridge {A,B}, T-Impeccable, T-Session-Bootstrap) executed end-to-end against the installed mccp@0.2.0 plugin. **All scenarios passed**, with four finding-grade observations that warrant follow-up before S10a entry.

Headline: the v0.2 Stop-loop foundation (quality runner + loop-counter + codex-bridge + fix-task) behaves exactly per spec — including the dual-reviewer escalation body section that the plan §6 OOS had pessimistically marked as S12-unshipped (actually shipped already).

---

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (no new source code) |
| Tasks | 8 | 8 completed |
| Files created (temp) | 7 | 7 + 1 nested-git-init (sandbox) |
| Files created (permanent) | 1 | 1 (this report) |
| Validation gate | 259/259 tests | 259/259 pass |
| Verification mode | santa-loop skipped | Confirmed (verification-mode plan, not code change) |

---

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | T-Pre integrity | Pass | sha256 mismatch was line-endings only (cache=CRLF 12769B, workspace=LF 12426B; content-hash matches). 4 modules require OK. 259/259 tests green. |
| 2 | T-Stop-Observe | Pass | Decision path = `not a git repo (cwd=...); allow` (variant of empty-diff allow — same effect via `gitDiffEmpty` try/catch). Discovered: `Write` tool injects UTF-8 BOM; hook gracefully parses-failure-to-allow. |
| 3 | T-Stop-Enforce-Pass | Pass | `quality PASS` + `counter reset` + passthrough. No counter file (nothing to clear). |
| 4 | T-Stop-Enforce-Fail | Pass | Required **deviation** (see F1 below). 3-run counter cycle: RUN 1 count=1+block, RUN 2 count=2+block, RUN 3 MAX(2) -> human-takeover+allow. fix-task.md frontmatter matches `docs/v0.2-state-schema.md` §2. |
| 5 | T-Codex-Bridge | Pass | A: `verdict=converged escalate=false` -> counter reset + allow. B: `verdict=critical escalate=true` -> block + fix-task.md with `verdict: codex_critical`, `escalate: true`, and `## Dual Reviewer Escalation Required` body section. |
| 6 | T-Impeccable | Pass | `Skill(mccp:impeccable)` loaded SKILL.md `## Setup` (steps 1-5 explicit) + routing rules from bundled path. `mccp:` prefix correctly disambiguated from user-installed `impeccable`. |
| 7 | T-Session-Bootstrap | Pass | exit 0, `[SessionStart] WARNING: could not resolve ECC plugin root; skipping session-start hook` (graceful fallback), stdin echoed, no throw. STATE.md inject correctly absent (S10a OOS). |
| 8 | Report + cleanup | Pass | This file. Cleanup completed below. |

---

## Findings

### F1 — Hook walks up to git toplevel, NOT cwd (plan misjudged)

**Symptom**: T-Stop-Enforce-Fail with `cwd = .claude/state/dogfood-sandbox/` (where the failing `package.json` lives) did NOT enter the quality-fail path on the first attempt. Quality runner returned PASS because it ran against the OUTER workspace root (no package.json there).

**Root cause**: `plugins/mccp/scripts/hooks/stop-review-loop.js:160` — `const repoRoot = options.repoRoot || repoRootFor(cwd);` then `qualityDetect.detect(repoRoot)`. The hook intentionally uses `git rev-parse --show-toplevel` from cwd, then runs quality at the toplevel. This is correct, documented behavior (see docstring lines 1-26).

**Plan §5 Task 4 hypothesis** ("sandbox 서브디렉토리에 package.json 심어 cwd 변경") was therefore unreachable as stated. Worked around by `git init` inside the sandbox, making sandbox itself a git toplevel.

**Implication for S10a**: the deviation reveals an enforcement boundary worth documenting — quality always runs against the git toplevel, so **monorepo sub-package fail signals cannot be tested or enforced via cwd alone**. Either (a) add an opt-in `MCCP_STOP_LOOP_QUALITY_CWD=cwd` env override, or (b) update v0.2 plan §11 verification to test from a monorepo fixture. Recommend (b) — keep the toplevel anchor as canonical.

### F2 — `Write` tool injects UTF-8 BOM, hook handles gracefully

**Symptom**: First T-Stop-Observe run logged `rawInput parse failure: Unexpected token '﻿', "﻿{"session"... is not valid JSON; allow`. The BOM came from the `Write` tool's default encoding under Windows PowerShell.

**Root cause**: `plugins/mccp/scripts/hooks/stop-review-loop.js:153-157` — `JSON.parse(rawInput)` on BOM-prefixed JSON throws. The hook catches, logs, and falls through to allow + echo. **This is correct graceful degradation** for v0.2 (`debug(stderr, 'rawInput parse failure: ...; allow'); return rawInput;`).

**Implication**: real Claude Code Stop events do not have BOMs (verified in `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js`), so this is fixture-tooling-only. Workaround for dogfood: `[System.IO.File]::WriteAllText` (UTF-8 no BOM) + `cmd /c '... < file'` for stdin redirection. Documented for future dogfood runs.

### F3 — `.gitignore` audit (initial finding was wrong — corrected post-write)

**Initial claim in this report (wrong)**: `find . -maxdepth 3 -name .gitignore` returned empty, so I concluded no `.gitignore` existed. **Reality**: `.gitignore` exists at repo root (583 bytes, `Jun 3 20:52`) and `git check-ignore -v` confirms it already covers `.claude/receipts/` (line 25), `.claude/state/loop-counter.json` (line 29), `.claude/state/*.lock` (line 30). The earlier `find` miss was a WSL/glob quirk, not real absence.

**Plan §4** intentionally keeps `fix-task.md` git-tracked as fail+fix audit evidence — that is NOT a gap.

**Actual gap (fixed in this session)**: `.claude/state/codex-stop-loop-input.txt` and `.claude/state/dogfood-*/` were not covered. Patched `.gitignore` to add both. The dogfood ran cleanly anyway because I swept manually in Task 8.

**Status**: closed (no further action needed).

### F4 — Dual-reviewer escalation section already shipped

**Plan §6 OOS** flagged `## Dual Reviewer Escalation Required` body section as S12-unshipped. Actual fix-task.md from T-Codex-Bridge B contains:

```
## Dual Reviewer Escalation Required
Next: run /santa-loop "<original-prompt>"
```

Either S8 silently included this work, or the plan misread the S8 report. Either way: positive finding — the escalation surface is live and points users at `/santa-loop`. Open question for S10a planner: does the originating prompt placeholder need to be substituted, or is the literal `<original-prompt>` intentional pending S11 `/mccp:work` integration?

---

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (pre-flight) | Pass | 4 modules require OK |
| Unit + integration | Pass | 259/259 in receipt+quality+state+lib+hooks |
| Build | N/A | Pure-Node, no build step |
| Integration (live hook runs) | Pass | 6 hook invocations across Tasks 2-5 + 1 session-bootstrap call |
| Edge cases | Pass | BOM tolerance (F2), not-a-git-repo fallback, MAX cap, codex unavailable path implicitly via auto-fallback receipt |

---

## Files Touched

| File | Action | Lifecycle |
|---|---|---|
| `.claude/plans/mccp-v0.2-s9-dogfood-test.plan.md` | EDITED (added `## Codex Implementation Review` section) | Archived to `.claude/PRPs/plans/completed/` after this report |
| `.claude/PRPs/reports/mccp-v0.2-s9-dogfood-results.md` | CREATED | Permanent |
| `.claude/receipts/mccp-implement-codex/main.json` | CREATED (via CLI) | Permanent |
| `.claude/state/dogfood-fixtures/*.{json,txt}` (5 files) | CREATED then DELETED | Ephemeral |
| `.claude/state/dogfood-sandbox/` (incl. nested `.git/`) | CREATED then DELETED | Ephemeral |
| `.claude/state/codex-stop-loop-input.txt` | CREATED then DELETED | Ephemeral |
| `.claude/state/loop-counter.json` | CREATED (T-Codex-Bridge B) then DELETED | Ephemeral |
| `.claude/state/fix-task.md` | CREATED (T-Codex-Bridge B) then DELETED | Ephemeral |

---

## S10a Entry Gate Evaluation

Per v0.2 plan §2:

| Gate | v0.2 plan §2 requirement | Compressed-S9 actual | Verdict |
|---|---|---|---|
| Enforce-mode receipts accumulated | >= 5 | 2 enforce-pass + 3 enforce-fail (sandbox) + 2 codex-bridge (workspace) = 7 hook invocations, but only **0 actual `mccp-implement-codex` / `mccp-plan-codex` receipts created during dogfood** beyond the implement-codex receipt for the dogfood plan itself | PARTIAL — interpretation depends on whether "receipts" means hook-runs or CLI-receipt-files |
| fail+fix cycle completion | >= 1 | 1 (Task 4 RUN 1->2->3, fix-task.md generated + counter reached MAX) | PASS |
| Counter MAX-hit rate | < 10% | 1 MAX hit / 4 enforce-fail-mode runs (Tasks 4+5B) = 25% | EXCEEDS (artifact of compressed mode — RUN 3 was deliberate to verify cap) |
| Auto-fallback rate | < 30% | 1 codex auto-fallback / 1 codex gate = 100% | EXCEEDS (artifact of unregistered codex skill, not real fallback rate) |
| Quality-pass-but-bad-diff | < 10% | N/A (canary worktree not operating) | N/A |

**Recommendation: DO NOT enter S10a from this cycle alone.** The two EXCEEDS rows are artifacts of compressed-mode + missing Codex skill, not real signal. The S10a entry decision requires either:

1. Codex skill registered + >= 5 real-traffic enforce-mode receipts over a longer window, OR
2. User accepts the EXCEEDS rows as known artifacts and proceeds at risk (decision is the user's, not this report's).

**Independent next-step recommendations** (irrespective of S10a entry):

- **F3**: closed in-session — `.gitignore` already existed; added the two missing entries (`codex-stop-loop-input.txt`, `dogfood-*/`). No follow-up needed.
- **F1 documentation**: add a one-paragraph "Quality runs at git toplevel, not cwd" note to `docs/v0.2-architecture.md` (or wherever the v0.2 architecture doc lives)
- **F2 fixture-tooling**: standardize on `[System.IO.File]::WriteAllText` + `cmd /c '... < file'` pattern for any future Windows dogfood
- **F4 confirm**: ask v0.2-plan author whether `<original-prompt>` placeholder substitution belongs in S11 or S12
