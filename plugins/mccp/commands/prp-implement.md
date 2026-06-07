---
description: Execute an implementation plan with rigorous validation loops
argument-hint: <path/to/plan.md>
---

> Adapted from PRPs-agentic-eng by Wirasm. Part of the PRP workflow series.

# PRP Implement

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

Execute a plan file step-by-step with continuous validation. Every change is verified immediately — never accumulate broken state.

**Core Philosophy**: Validation loops catch mistakes early. Run checks after every change. Fix issues immediately.

**Golden Rule**: If a validation fails, fix it before moving on. Never accumulate broken state.

---

## Phase 0 — DETECT

### Package Manager Detection

| File Exists | Package Manager | Runner |
|---|---|---|
| `bun.lockb` | bun | `bun run` |
| `pnpm-lock.yaml` | pnpm | `pnpm run` |
| `yarn.lock` | yarn | `yarn` |
| `package-lock.json` | npm | `npm run` |
| `pyproject.toml` or `requirements.txt` | uv / pip | `uv run` or `python -m` |
| `Cargo.toml` | cargo | `cargo` |
| `go.mod` | go | `go` |

### Validation Scripts

Check `package.json` (or equivalent) for available scripts:

```bash
# For Node.js projects
cat package.json | grep -A 20 '"scripts"'
```

Note available commands for: type-check, lint, test, build.

---

## Phase 1 — LOAD

Read the plan file:

```bash
cat "$ARGUMENTS"
```

Extract these sections from the plan:
- **Summary** — What is being built
- **Patterns to Mirror** — Code conventions to follow
- **Files to Change** — What to create or modify
- **Step-by-Step Tasks** — Implementation sequence
- **Validation Commands** — How to verify correctness
- **Acceptance Criteria** — Definition of done

If the file doesn't exist or isn't a valid plan:
```
Error: Plan file not found or invalid.
Run /mccp:plan <feature-description> to create a plan first.
```

**CHECKPOINT**: Plan loaded. All sections identified. Tasks extracted.

---

## Phase 2 — PREPARE

### Git State

```bash
git branch --show-current
git status --porcelain
```

### Branch Decision

| Current State | Action |
|---|---|
| On feature branch | Use current branch |
| On main, clean working tree | Create feature branch: `git checkout -b feat/{plan-name}` |
| On main, dirty working tree | **STOP** — Ask user to stash or commit first |
| In a git worktree for this feature | Use the worktree |

### Sync Remote

```bash
git pull --rebase origin $(git branch --show-current) 2>/dev/null || true
```

**CHECKPOINT**: On correct branch. Working tree ready. Remote synced.

---

## Phase 2.5 — mccp IMPLEMENT-CODEX GATE (자동, /mccp:prp-implement 진입 시 MANDATORY)

This phase applies when invoked as `/mccp:prp-implement`. It implements the **Autonomy Contract** for the Implement-Codex gate inline below. See `${CLAUDE_PLUGIN_ROOT}/docs/gate-design.md` for original design rationale (reference only — enforcement lives in this command body plus the receipt CLI and the two receipt hooks). **Do not skip and do not ask the user between sub-steps.**

This runs **after** Phase 2 (PREPARE — git state, branch) and **before** Phase 3 (EXECUTE — first code change).

### 2.5.1 — Cross-gate dedupe check

Read the plan file. If it contains `## Codex Adversarial Review` with a `합치 결론` line that mentions the same architectural decisions you're about to implement (file structure, abstraction boundaries, external deps, concurrency model), AND no new decision was introduced since the plan was approved, AND `git diff --name-only origin/<base>..HEAD` ⊆ the plan's `Files to Change` list (no implement-time file expansion), write a single line into the plan body:

```markdown
## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
```

Then skip to 2.5.6 (receipt write). Otherwise continue.

### 2.5.2 — Identify new implement-time decisions

Enumerate decisions that the plan did NOT pre-commit to: file layout details, helper abstractions you'll introduce, library choices, concurrency primitives, error-handling shape. Capture as a short bullet list — this becomes the focus text for Codex.

### 2.5.3 — Invoke Codex automatically (v0.2.2 fail-closed Bash wrapper)

Skill interface `codex:adversarial-review` does not exist and the slash command is `disable-model-invocation:true`. Use the fail-closed Bash wrapper from [scripts/lib/codex-invoke.js](../scripts/lib/codex-invoke.js). Do NOT ask "shall I invoke Codex?".

```bash
mkdir -p .git/mccp/tmp
CODEX_STDOUT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js" adversarial-review \
  --focus "challenge the following implement-time decisions: <bullet list from 2.5.2>" \
  --timeout-ms 900000 \
  --json 2> .git/mccp/tmp/codex-invoke.stderr)
CODEX_EXIT=$?
CODEX_BLOCKING=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.blocking?"1":"0")}catch{console.log("1")}' "$CODEX_STDOUT")
CODEX_CLASS=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.classification||"unknown")}catch{console.log("parse-error")}' "$CODEX_STDOUT")

if [ "$CODEX_EXIT" != "0" ] || [ "$CODEX_BLOCKING" = "1" ] || [ "$CODEX_CLASS" != "ok" ]; then
  if [ "${MCCP_ALLOW_CODEX_UNAVAILABLE:-0}" = "1" ]; then
    echo "[mccp] Codex unavailable in advisory mode (class=$CODEX_CLASS exit=$CODEX_EXIT)"
    # Write '> Codex unavailable, skipped (auto-fallback): <class>' into the review section and jump to 2.5.6.
    # Receipt will record advisory=true → downstream validator treats as non-approving.
  else
    echo "[MCCP-GATE-STOP] Codex unavailable (blocking=$CODEX_BLOCKING class=$CODEX_CLASS exit=$CODEX_EXIT)."
    echo "Set MCCP_ALLOW_CODEX_UNAVAILABLE=1 to proceed in advisory mode (non-approving receipt)."
    exit 1
  fi
fi
```

### 2.5.4 — Inject review section + severity-gated re-rerun (default cap=1)

Edit the plan (or `.claude/notes/<topic>.md` if plan is in `completed/`): append/replace `## Codex Implementation Review` with the YAGNI-triage schema (mirror of plan.md Phase 5.3):

```markdown
## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: <N>
- 합치 결론: <one-line summary>
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 | CRITICAL | ACCEPT_NOW | <one-line> |
  | F2 | HIGH | DEFER_TO_BACKLOG | <one-line> |
  | F3 | LOW | REJECT_YAGNI | <one-line, "not needed because…"> |
- Deferred to backlog: <count> → `.claude/plans/codex-findings-backlog.md`
- Open Questions: <item — severity CRITICAL/HIGH/MEDIUM/LOW>
- Codex session 참조: <task-id from Skill result>
```

After R1's YAGNI triage table is written, escalate ONLY if BOTH:
  (a) ≥1 finding is `verdict=ACCEPT_NOW` AND `severity ∈ {CRITICAL, HIGH}`
  (b) The R1 absorption could not fully resolve it (Claude self-attests in plan body)
If escalate triggers, run R2 with focus restricted to the unresolved item(s).
Repeat up to `MCCP_GATE_ROUND_CAP` (default `1`, allowed `1`/`2`/`3`). Beyond the cap,
annotate as `Open Questions: DIVERGENT_UNRESOLVED` and proceed.

If no `ACCEPT_NOW` HIGH/CRITICAL remains, stop at R1.

All `DEFER_TO_BACKLOG` items: append a line to `.claude/plans/codex-findings-backlog.md`
before Phase 2.5.5. Format:
- `YYYY-MM-DD | <severity> | <source plan path> | <one-line finding>`

### 2.5.5 — Auto-CRITICAL check

Scan Open Questions for §0 auto-CRITICAL catalog. If any present, output the same `[MCCP-GATE-STOP]` block as Plan-Codex Phase 7.5 (substituting "Implement" for "Plan") and end the response. Do NOT enter Phase 3.

For security-sensitive areas (auth, crypto, secrets, input validation, SQL/cmd
injection, SSRF, path traversal, privilege escalation): after 2.5.4, invoke the
**Task tool** with the canonical contract:

- `subagent_type: "security-reviewer"`
- prompt: `"review proposed implementation: <list affected areas>"`

If the Task tool returns "agent not found", harness rejection, schema mismatch,
or any non-success result:

- Record `> security-reviewer unavailable, skipped (auto-fallback): <one-line reason>`
  in `## Codex Implementation Review` under `### Security Reviewer` subheading.
- **Export the fallback state for Phase 2.5.6** (this is mandatory — not
  exporting causes the receipt-write step to silently produce an approving
  receipt and `/mccp:pr` validator then sees no `security_skipped=true`,
  collapsing the fail-closed invariant. Codex Round 1 F2.):

  ```bash
  export SECURITY_SKIPPED_REASON="<one-line reason text from the fallback>"
  ```

- `receipt validate-cmd` treats `security_skipped` as **blocking** for implement
  and pr gates (parallel to `codex_skipped`, enforced by the receipt CLI
  `security_skipped` enforcement landed in v0.2.4 Task 8).

Integrate findings into the same `## Codex Implementation Review` section under
a `### Security Reviewer` subheading. CRITICAL/HIGH security findings →
MCCP-GATE-STOP.

### 2.5.5b — impeccable design gate (자동, /mccp:prp-implement 진입 시 MANDATORY, v0.2.6 Milestone 1)

Pre-flight detection — `implement` mode reads git diff for UI extensions + `.claude/design/*.design.plan.md` changes:

```bash
DETECT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect \
  --mode implement \
  --json)
SKILL_AVAIL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.skill_available?"1":"0")}catch{process.stdout.write("0")}')
SIGNAL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.design_signal?"1":"0")}catch{process.stdout.write("0")}')
DETECT_REASON=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason||"unknown")}catch{process.stdout.write("parse-error")}')
```

Decision tree (mirror of pr.md 2.5.1):

| SKILL_AVAIL | SIGNAL | Action |
|---|---|---|
| 0 | * | Record `> impeccable unavailable, skipped (auto-fallback): $DETECT_REASON` under `### Design Review` in `## Codex Implementation Review`. Export `IMPECCABLE_SKIPPED_REASON="$DETECT_REASON"`. mccp-implement-codex is a **strict gate** — receipt with `impeccable_skipped=true` BLOCKS downstream `/mccp:pr`. |
| 1 | 0 | Sub-step skip silently — no design surface in this implementation. |
| 1 | 1 | Invoke `Skill(impeccable, "audit <implementation summary>")`. Append result under `### Design Review` in `## Codex Implementation Review`. If Skill returns `unknown_skill` / `not found`, fall back to skipped path (set `IMPECCABLE_SKIPPED_REASON="skill-missing"`). |

Receipt-write (2.5.6) MUST forward `--impeccable-skipped --impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON"` when SKILL_AVAIL=0 or Skill fell back.

### 2.5.6 — Verify section, write mccp-implement-codex receipt

```bash
# Step A: verify Codex section was injected
grep -q "^## Codex Implementation Review$" <plan or notes path> || {
  echo "[MCCP-GATE-STOP] plan에 Codex Implementation Review 섹션 주입 실패."
  exit 1
}

# Step B: derive decision-slug (must match what /mccp:plan wrote — usually plan basename)
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:prp-implement \
  --args "$ARGUMENTS")

# Step C: auto-write the mccp-implement-codex receipt.
# If Phase 2.5.5 hit the security-reviewer auto-fallback, SECURITY_SKIPPED_REASON
# was exported with the fallback reason. The receipt-write MUST forward it as
# --security-skipped + --security-skip-reason; without that flag the receipt
# looks approving and /mccp:pr validator collapses (Codex Round 1 F2).
if [ -n "$SECURITY_SKIPPED_REASON" ]; then
  node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
    --gate mccp-implement-codex \
    --decision ${DECISION_SLUG} \
    --plan <plan path> \
    --security-skipped \
    --security-skip-reason "$SECURITY_SKIPPED_REASON" \
    --quiet
else
  node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
    --gate mccp-implement-codex \
    --decision ${DECISION_SLUG} \
    --plan <plan path> \
    --quiet
fi
```

Bash hook block handling: same as mccp Plan-Codex Phase 7.6 — output `[MCCP-GATE-STOP]` with captured hook stderr and end the response. Do NOT enter Phase 3.

### 2.5.7 — Read-back validate, then enter Phase 3

```bash
# Verify the receipt is valid (no specific downstream command yet; just sanity check)
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate --command mccp:prp-implement
```

If exit 0: proceed to Phase 3 (EXECUTE). Print one info line first:

```
Implement-Codex: converged in <N> rounds (or: skipped, auto-fallback) | Receipt: <path>
```

If non-zero: do NOT enter Phase 3. Output validate stderr and end the response.

### Forbidden during Phase 2.5

Same forbidden phrase catalog as Plan-Codex Phase 7. No "shall I invoke Codex?" / "receipt를 직접 작성해주세요" / inter-step yes/no prompts (2.5.5 CRITICAL stop only exception).

---

## Phase 3 — EXECUTE

Process each task from the plan sequentially.

### Per-Task Loop

For each task in **Step-by-Step Tasks**:

1. **Read MIRROR reference** — Open the pattern file referenced in the task's MIRROR field. Understand the convention before writing code.

2. **Implement** — Write the code following the pattern exactly. Apply GOTCHA warnings. Use specified IMPORTS.

3. **Validate immediately** — After EVERY file change:
   ```bash
   # Run type-check (adjust command per project)
   [type-check command from Phase 0]
   ```
   If type-check fails → fix the error before moving to the next file.

4. **Track progress** — Log: `[done] Task N: [task name] — complete`

### Handling Deviations

If implementation must deviate from the plan:
- Note **WHAT** changed
- Note **WHY** it changed
- Continue with the corrected approach
- These deviations will be captured in the report

**CHECKPOINT**: All tasks executed. Deviations logged.

---

## Phase 4 — VALIDATE

Run all validation levels from the plan. Fix issues at each level before proceeding.

### Level 1: Static Analysis

```bash
# Type checking — zero errors required
[project type-check command]

# Linting — fix automatically where possible
[project lint command]
[project lint-fix command]
```

If lint errors remain after auto-fix, fix manually.

### Level 2: Unit Tests

Write tests for every new function (as specified in the plan's Testing Strategy).

```bash
[project test command for affected area]
```

- Every function needs at least one test
- Cover edge cases listed in the plan
- If a test fails → fix the implementation (not the test, unless the test is wrong)

### Level 3: Build Check

```bash
[project build command]
```

Build must succeed with zero errors.

### Level 4: Integration Testing (if applicable)

```bash
# Start server, run tests, stop server
[project dev server command] &
SERVER_PID=$!

# Wait for server to be ready (adjust port as needed)
SERVER_READY=0
for i in $(seq 1 30); do
  if curl -sf http://localhost:PORT/health >/dev/null 2>&1; then
    SERVER_READY=1
    break
  fi
  sleep 1
done

if [ "$SERVER_READY" -ne 1 ]; then
  kill "$SERVER_PID" 2>/dev/null || true
  echo "ERROR: Server failed to start within 30s" >&2
  exit 1
fi

[integration test command]
TEST_EXIT=$?

kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

exit "$TEST_EXIT"
```

### Level 5: Edge Case Testing

Run through edge cases from the plan's Testing Strategy checklist.

**CHECKPOINT**: All 5 validation levels pass. Zero errors.

---

## Phase 5 — REPORT

### Create Implementation Report

```bash
mkdir -p .claude/PRPs/reports
```

Write report to `.claude/PRPs/reports/{plan-name}-report.md`:

```markdown
# Implementation Report: [Feature Name]

## Summary
[What was implemented]

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | [from plan] | [actual] |
| Confidence | [from plan] | [actual] |
| Files Changed | [from plan] | [actual count] |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | [task name] | [done] Complete | |
| 2 | [task name] | [done] Complete | Deviated — [reason] |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [done] Pass | |
| Unit Tests | [done] Pass | N tests written |
| Build | [done] Pass | |
| Integration | [done] Pass | or N/A |
| Edge Cases | [done] Pass | |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `path/to/file` | CREATED | +N |
| `path/to/file` | UPDATED | +N / -M |

## Deviations from Plan
[List any deviations with WHAT and WHY, or "None"]

## Issues Encountered
[List any problems and how they were resolved, or "None"]

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `path/to/test` | N tests | [area covered] |

## Next Steps
- [ ] Code review via `/code-review`
- [ ] Create PR via `/mccp:pr`
```

### Update PRD (if applicable)

If this implementation was for a PRD phase:
1. Update the phase status from `in-progress` to `complete`
2. Add report path as reference

### Archive Plan

```bash
mkdir -p .claude/PRPs/plans/completed
mv "$ARGUMENTS" .claude/PRPs/plans/completed/
```

**CHECKPOINT**: Report created. PRD updated. Plan archived.

---

## Phase 6 — OUTPUT

Report to user:

```
## Implementation Complete

- **Plan**: [plan file path] → archived to completed/
- **Branch**: [current branch name]
- **Status**: [done] All tasks complete

### Validation Summary

| Check | Status |
|---|---|
| Type Check | [done] |
| Lint | [done] |
| Tests | [done] (N written) |
| Build | [done] |
| Integration | [done] or N/A |

### Files Changed
- [N] files created, [M] files updated

### Deviations
[Summary or "None — implemented exactly as planned"]

### Artifacts
- Report: `.claude/PRPs/reports/{name}-report.md`
- Archived Plan: `.claude/PRPs/plans/completed/{name}.plan.md`

### PRD Progress (if applicable)
| Phase | Status |
|---|---|
| Phase 1 | [done] Complete |
| Phase 2 | [next] |
| ... | ... |

> Next step: Run `/mccp:pr` to create a pull request, or `/mccp:code-review` to review changes first.
```

---

## Phase 7 — AUTO-CHAIN (v0.2.2, opt-in)

After Phase 6 OUTPUT, query [scripts/lib/auto-chain.js](../scripts/lib/auto-chain.js) for chain orchestration. The chain steps are `commit` → `pr`. Each step is a separate slash command invocation; auto-chain.js only answers "should I proceed?" — it does not invoke commands itself.

```bash
# Pre-commit check
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/auto-chain.js" check \
  --next-step commit \
  --decision "<decision-slug>" 2> .git/mccp/tmp/auto-chain.stderr
CHAIN_EXIT=$?
```

Behavior:
- Exit 0: proceed by invoking `/mccp:prp-commit <message>`.
- Exit 13: auto-chain decided to abort (8 triggers per `shouldAbort()`; e.g. cost hard ceiling, missing receipts, STATE.md `chain_aborted=true`). Read stdout JSON for `reasons`, log to STATE.md, end response quietly.
- Other non-zero: configuration error. Stop chain, surface to user.

After `/mccp:prp-commit` succeeds:

```bash
# Pre-PR preflight + check
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/auto-chain.js" preflight pr
PREFLIGHT_EXIT=$?
if [ "$PREFLIGHT_EXIT" != "0" ]; then
  echo "[mccp] auto-chain pr step preflight refused (likely MCCP_ALLOW_CODEX_UNAVAILABLE=1 set)." 1>&2
  exit 0  # quiet abort; user can manually run /mccp:pr later
fi

node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/auto-chain.js" check \
  --next-step pr \
  --validate-command mccp:pr \
  --decision "<decision-slug>"
CHAIN_EXIT=$?
```

If 0 → invoke `/mccp:pr`. If 13 → end response quietly.

This Phase 7 is enabled by default. Opt-out via env:
- `MCCP_AUTO_CHAIN_DISABLE=1` — kill switch (operator)
- `MCCP_AUTO_CHAIN_SKIP_PR=1` — commit only, no PR (for direct-push cycles)

---

## Handling Failures

### Type Check Fails
1. Read the error message carefully
2. Fix the type error in the source file
3. Re-run type-check
4. Continue only when clean

### Tests Fail
1. Identify whether the bug is in the implementation or the test
2. Fix the root cause (usually the implementation)
3. Re-run tests
4. Continue only when green

### Lint Fails
1. Run auto-fix first
2. If errors remain, fix manually
3. Re-run lint
4. Continue only when clean

### Build Fails
1. Usually a type or import issue — check error message
2. Fix the offending file
3. Re-run build
4. Continue only when successful

### Integration Test Fails
1. Check server started correctly
2. Verify endpoint/route exists
3. Check request format matches expected
4. Fix and re-run

---

## Success Criteria

- **TASKS_COMPLETE**: All tasks from the plan executed
- **TYPES_PASS**: Zero type errors
- **LINT_PASS**: Zero lint errors
- **TESTS_PASS**: All tests green, new tests written
- **BUILD_PASS**: Build succeeds
- **REPORT_CREATED**: Implementation report saved
- **PLAN_ARCHIVED**: Plan moved to `completed/`

---

## Next Steps

- Run `/code-review` to review changes before committing
- Run `/prp-commit` to commit with a descriptive message
- Run `/mccp:pr` to create a pull request
- Run `/mccp:plan <next-phase>` if the PRD has more phases
