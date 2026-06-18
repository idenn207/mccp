---
description: Code review — local uncommitted changes or GitHub PR (pass PR number/URL for PR mode, --standalone for external PRs)
argument-hint: "[pr-number | pr-url | blank for local review] [--standalone]"
---

# Code Review

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

> PR review mode adapted from PRPs-agentic-eng by Wirasm. Part of the PRP workflow series.

**Input**: $ARGUMENTS

---

## Mode Selection

Parse `$ARGUMENTS` for the `--standalone` flag. Remove it from the remaining argument string before further parsing.

| Remaining args | Standalone? | Mode |
|---|---|---|
| PR number, PR URL, or `--pr` | no | **PR Review Mode (chain-aware)** — requires preceding `mccp-pr-codex` receipt, writes `code-reviewer` receipt |
| PR number, PR URL, or `--pr` | yes | **PR Review Mode (standalone)** — runs full review without receipt chain, does NOT write `code-reviewer` receipt |
| blank | (ignored) | **Local Review Mode** — advisory pre-commit review, skips receipt chain entirely |

> **When to use `--standalone`**: reviewing an external PR that was NOT created by `/mccp:pr` (third-party contributor, vendored fork, etc.). The flag tells the gate "this review is intentionally outside the receipt chain". Both `receipt-prompt.js` and `receipt-skill.js` recognize `--standalone` for `/mccp:code-review` and bypass receipt preflight. Skipping the flag for an external PR will produce a `[MCCP-RECEIPT-GATE]` block at preflight — that block is the correct behavior; if the omission was intentional, retry with `--standalone`.

---

## Local Review Mode

Comprehensive security and quality review of uncommitted changes.

### Phase 1 — GATHER

```bash
git diff --name-only HEAD
```

If no changed files, stop: "Nothing to review."

### Phase 2 — REVIEW

Read each changed file in full. Check for:

**Security Issues (CRITICAL):**
- Hardcoded credentials, API keys, tokens
- SQL injection vulnerabilities
- XSS vulnerabilities
- Missing input validation
- Insecure dependencies
- Path traversal risks

**Code Quality (HIGH):**
- Functions > 50 lines
- Files > 800 lines
- Nesting depth > 4 levels
- Missing error handling
- console.log statements
- TODO/FIXME comments
- Missing JSDoc for public APIs

**Best Practices (MEDIUM):**
- Mutation patterns (use immutable instead)
- Emoji usage in code/comments
- Missing tests for new code
- Accessibility issues (a11y)

### Phase 3 — REPORT

Generate report with:
- Severity: CRITICAL, HIGH, MEDIUM, LOW
- File location and line numbers
- Issue description
- Suggested fix

Block commit if CRITICAL or HIGH issues found.
Never approve code with security vulnerabilities.

---

## PR Review Mode

Comprehensive GitHub PR review — fetches diff, reads full files, runs validation, posts review.

### Phase 1 — FETCH

Parse input to determine PR:

| Input | Action |
|---|---|
| Number (e.g. `42`) | Use as PR number |
| URL (`github.com/.../pull/42`) | Extract PR number |
| Branch name | Find PR via `gh pr list --head <branch>` |

```bash
gh pr view <NUMBER> --json number,title,body,author,baseRefName,headRefName,changedFiles,additions,deletions
gh pr diff <NUMBER>
```

If PR not found, stop with error. Store PR metadata for later phases.

### Phase 2 — CONTEXT

Build review context:

1. **Project rules** — Read `CLAUDE.md`, `.claude/docs/`, and any contributing guidelines
2. **Planning artifacts** — Check `.claude/prds/`, `.claude/plans/`, `.claude/reviews/`, and legacy `.claude/PRPs/{prds,plans,reports,reviews}/` for context related to this PR
3. **PR intent** — Parse PR description for goals, linked issues, test plans
4. **Changed files** — List all modified files and categorize by type (source, test, config, docs)

### Phase 2.5 — mccp CODE-REVIEWER GATE PREP (자동, /mccp:code-review 진입 시 MANDATORY)

This phase applies when invoked as `/mccp:code-review` in PR Review Mode. It implements the **Autonomy Contract** for the code-reviewer gate inline below. See `${CLAUDE_PLUGIN_ROOT}/docs/gate-design.md` for original design rationale (reference only — enforcement lives in this command body plus the receipt CLI and the two receipt hooks). **Do not skip and do not ask the user between sub-steps.**

This runs **after** Phase 2 (CONTEXT) and **before** Phase 3 (REVIEW). Its purpose: enforce the gate execution order (PR-Impeccable → PR-Codex → security-reviewer → code-reviewer), feed preceding-gate findings into the code-reviewer's own review, and prevent duplicate Codex/security rounds.

**Standalone bypass**: if `--standalone` was parsed from `$ARGUMENTS` in Mode Selection, the receipt-prompt/skill hooks already let the command through. Skip sub-steps 2.5.1, 2.5.3 (security reuse-first), 2.5.4 entirely. Jump to 2.5.5 with empty PR-Codex context. **Phase 7.5 must NOT write a `code-reviewer` receipt in standalone mode** — see that phase for handling.

### 2.5.1 — Verify preceding mccp-pr-codex receipt

```bash
# Derive decision-slug deterministically (must match what /mccp:pr wrote)
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:code-review \
  --args "$ARGUMENTS")


# v1.3.1: forward --decision/--plan explicitly so the validator scopes to the
# correct receipt instead of falling back to decisionId='default' (Codex R1 F1).
# DECISION_SLUG was derived just above; <plan path> is the plan that the
# preceding mccp:pr gate stamped on the mccp-pr-codex receipt.
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate \
  --command mccp:code-review \
  --decision ${DECISION_SLUG} \
  --plan <plan path>
```

If exit 0: PR-Codex receipt exists for this decision. Read it via:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status --json --gate mccp-pr-codex
```

Capture: `resolution.converged`, `resolution.accepted`, `resolution.rejected`, `resolution.open_questions`. These become Phase 3 input context (the code-reviewer must NOT re-challenge already-converged areas).

If exit non-zero (no `mccp-pr-codex` receipt, or stale): output:

```
[MCCP-GATE-STOP] /mccp:code-review requires a preceding mccp-pr-codex receipt.
Run /mccp:pr first, or write the receipt manually if you have already run Codex against this PR diff:

  node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
    --gate mccp-pr-codex --decision <slug> --plan <plan-or-pr-title>

Missing/stale: <CLI stderr output>
```

End the response.

### 2.5.2 — Detect design signal (reuse-first PR-Impeccable, v0.2.6 Milestone 1)

Pre-flight detection via standardized helper (`review` mode = git diff vs base + PR body reuse check):

```bash
DETECT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect \
  --mode review \
  --base "origin/<base>" \
  --json)
SKILL_AVAIL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.skill_available?"1":"0")}catch{process.stdout.write("0")}')
SIGNAL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.design_signal?"1":"0")}catch{process.stdout.write("0")}')
DETECT_REASON=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason||"unknown")}catch{process.stdout.write("parse-error")}')
```

**Reuse-first**: If design signal present, check the PR body for an existing `## Design Review` section (injected by `/mccp:pr` Phase 2.5.1). Reuse those findings — do NOT re-invoke `Skill(impeccable, ...)`. Cross-gate dedupe — same PR shouldn't pay impeccable cost twice.

Decision tree (reuse-first):

| SKILL_AVAIL | SIGNAL | PR body has `## Design Review` | Action |
|---|---|---|---|
| * | 0 | * | Sub-step skip silently |
| * | 1 | yes | Reuse existing `## Design Review` findings into Phase 6 REPORT |
| 0 | 1 | no | Record `> impeccable unavailable, skipped (auto-fallback): $DETECT_REASON` in Phase 6 REPORT. Export `IMPECCABLE_SKIPPED_REASON="$DETECT_REASON"`. code-reviewer gate is **lenient** — surfaces as warning, not blocking |
| 1 | 1 | no | Invoke `Skill(impeccable, "critique PR #<NUMBER>")`. If Skill returns `unknown_skill` / `not found`, fall back to skipped path |

Receipt-write at 7.5 MUST forward `--impeccable-skipped --impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON"` when skipped or fell back.

### 2.5.3 — Security-sensitive area check (reuse-first)

If the diff touches §0 security-sensitive areas (auth/authz, session/token, crypto/hash/sign/key, secret/credential, input validation, SQL/cmd injection, SSRF, path traversal, privilege escalation), check the PR body for `### Security Reviewer` subheading under `## Codex Adversarial Review` (injected by `/mccp:pr` Phase 2.5.5). Reuse those findings.

If not present, invoke the **Task tool** with the canonical contract:

- `subagent_type: "security-reviewer"`
- prompt: `"review PR #<NUMBER> against base <base>: <list affected security areas>"`

Pass the PR-Codex receipt findings from 2.5.1 as context. Integrate findings into Phase 6 REPORT.

**Read-only command fail-mode (informational fallback):** If the Task tool returns "agent not found", harness rejection, schema mismatch, or any non-success result, `/mccp:code-review` is **read-only** — proceed without hard-block. Record `> security-reviewer unavailable, skipped (auto-fallback): <one-line reason>` under `### Security Reviewer` in Phase 6 REPORT, and pass `--security-skipped` + `--security-skip-reason "<reason>"` to the receipt-write step. For code-review gate the receipt CLI treats `meta.security_skipped` as informational (warnings[], not blocking[]) — implement/pr gates are stricter (blocking).

### 2.5.4 — Auto-CRITICAL check (preceding gates)

Scan the PR-Codex receipt's `resolution.open_questions` (from 2.5.1) and any security-reviewer findings (from 2.5.3) for §0 auto-CRITICAL items. If any unresolved:

1. Do NOT proceed to Phase 3
2. Output:
   ```
   [MCCP-GATE-STOP] CRITICAL Open Question from preceding gate is unresolved:
   - <item> (source: mccp-pr-codex receipt or security-reviewer)
   PR: #<NUMBER>
   사용자 결정 필요. 진행 의사 또는 수정 지시를 주세요.
   ```
3. End the response.

### 2.5.5 — Continue to Phase 3 with context loaded

Proceed to Phase 3 REVIEW. The code-reviewer checklist (7 categories) runs as designed, but for each category, the assistant MUST first check the captured PR-Codex `resolution.accepted` / `resolution.rejected` lists — do not re-flag converged decisions. Mark cross-gate dedupe in the Phase 6 REPORT.

Print one info line before Phase 3:

```
PR-Codex: reused from receipt (converged in <N> rounds) | Security: <reused | newly invoked | n/a>
```

### Forbidden during Phase 2.5

Same forbidden phrase catalog as Plan-Codex Phase 7. No "shall I invoke Codex?" / "shall I run security-reviewer?" / inter-step yes/no prompts (2.5.4 CRITICAL stop only exception).

---

### Phase 3 — REVIEW

Read each changed file **in full** (not just the diff hunks — you need surrounding context).

For PR reviews, fetch the full file contents at the PR head revision:
```bash
gh pr diff <NUMBER> --name-only | while IFS= read -r file; do
  gh api "repos/{owner}/{repo}/contents/$file?ref=<head-branch>" --jq '.content' | base64 -d
done
```

Apply the review checklist across 7 categories:

| Category | What to Check |
|---|---|
| **Correctness** | Logic errors, off-by-ones, null handling, edge cases, race conditions |
| **Type Safety** | Type mismatches, unsafe casts, `any` usage, missing generics |
| **Pattern Compliance** | Matches project conventions (naming, file structure, error handling, imports) |
| **Security** | Injection, auth gaps, secret exposure, SSRF, path traversal, XSS |
| **Performance** | N+1 queries, missing indexes, unbounded loops, memory leaks, large payloads |
| **Completeness** | Missing tests, missing error handling, incomplete migrations, missing docs |
| **Maintainability** | Dead code, magic numbers, deep nesting, unclear naming, missing types |

Assign severity to each finding:

| Severity | Meaning | Action |
|---|---|---|
| **CRITICAL** | Security vulnerability or data loss risk | Must fix before merge |
| **HIGH** | Bug or logic error likely to cause issues | Should fix before merge |
| **MEDIUM** | Code quality issue or missing best practice | Fix recommended |
| **LOW** | Style nit or minor suggestion | Optional |

### Phase 4 — VALIDATE

Run available validation commands:

Detect the project type from config files (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, etc.), then run the appropriate commands:

**Node.js / TypeScript** (has `package.json`):
```bash
npm run typecheck 2>/dev/null || npx tsc --noEmit 2>/dev/null  # Type check
npm run lint                                                    # Lint
npm test                                                        # Tests
npm run build                                                   # Build
```

**Rust** (has `Cargo.toml`):
```bash
cargo clippy -- -D warnings  # Lint
cargo test                   # Tests
cargo build                  # Build
```

**Go** (has `go.mod`):
```bash
go vet ./...    # Lint
go test ./...   # Tests
go build ./...  # Build
```

**Python** (has `pyproject.toml` / `setup.py`):
```bash
pytest  # Tests
```

Run only the commands that apply to the detected project type. Record pass/fail for each.

### Phase 5 — DECIDE

Form recommendation based on findings:

| Condition | Decision |
|---|---|
| Zero CRITICAL/HIGH issues, validation passes | **APPROVE** |
| Only MEDIUM/LOW issues, validation passes | **APPROVE** with comments |
| Any HIGH issues or validation failures | **REQUEST CHANGES** |
| Any CRITICAL issues | **BLOCK** — must fix before merge |

Special cases:
- Draft PR → Always use **COMMENT** (not approve/block)
- Only docs/config changes → Lighter review, focus on correctness
- Explicit `--approve` or `--request-changes` flag → Override decision (but still report all findings)

### Phase 6 — REPORT

Create review artifact at `.claude/reviews/pr-<NUMBER>-review.md` unless the repo already uses legacy `.claude/PRPs/reviews/` for this workstream:

```markdown
# PR Review: #<NUMBER> — <TITLE>

**Reviewed**: <date>
**Author**: <author>
**Branch**: <head> → <base>
**Decision**: APPROVE | REQUEST CHANGES | BLOCK

## Summary
<1-2 sentence overall assessment>

## Findings

### CRITICAL
<findings or "None">

### HIGH
<findings or "None">

### MEDIUM
<findings or "None">

### LOW
<findings or "None">

## Validation Results

| Check | Result |
|---|---|
| Type check | Pass / Fail / Skipped |
| Lint | Pass / Fail / Skipped |
| Tests | Pass / Fail / Skipped |
| Build | Pass / Fail / Skipped |

## Files Reviewed
<list of files with change type: Added/Modified/Deleted>
```

### Phase 7 — PUBLISH

Post the review to GitHub:

```bash
# If APPROVE
gh pr review <NUMBER> --approve --body "<summary of review>"

# If REQUEST CHANGES
gh pr review <NUMBER> --request-changes --body "<summary with required fixes>"

# If COMMENT only (draft PR or informational)
gh pr review <NUMBER> --comment --body "<summary>"
```

For inline comments on specific lines, use the GitHub review comments API:
```bash
gh api "repos/{owner}/{repo}/pulls/<NUMBER>/comments" \
  -f body="<comment>" \
  -f path="<file>" \
  -F line=<line-number> \
  -f side="RIGHT" \
  -f commit_id="$(gh pr view <NUMBER> --json headRefOid --jq .headRefOid)"
```

Alternatively, post a single review with multiple inline comments at once:
```bash
gh api "repos/{owner}/{repo}/pulls/<NUMBER>/reviews" \
  -f event="COMMENT" \
  -f body="<overall summary>" \
  --input comments.json  # [{"path": "file", "line": N, "body": "comment"}, ...]
```

### Phase 7.5 — Write code-reviewer receipt (자동, chain-aware PR Review Mode 전용)

After the GitHub review is published, write the `code-reviewer` gate receipt. This closes the receipt chain (`mccp-plan-codex` → `mccp-implement-codex` → `mccp-pr-codex` → `code-reviewer`).

**Skip entirely in two cases**:
1. **Standalone PR Review Mode** (`--standalone` was passed): this mode is intentionally outside the receipt chain. Do NOT write a receipt. Print one info line `Standalone PR review — receipt chain bypassed by --standalone` and proceed to Phase 8.
2. **Local Review Mode** (no PR number, no published review): advisory mode, no receipt.

For **chain-aware PR Review Mode**:

```bash
# Step A: verify the review report file was created in Phase 6
test -f .claude/reviews/pr-<NUMBER>-review.md || {
  echo "[MCCP-GATE-STOP] Phase 6 review report not found. Cannot write code-reviewer receipt."
  exit 1
}

# Step B: write the receipt (DECISION_SLUG was derived in Phase 2.5.1)
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
  --gate code-reviewer \
  --decision ${DECISION_SLUG} \
  --plan .claude/reviews/pr-<NUMBER>-review.md \
  --quiet
```

Bash hook block handling: same as Plan-Codex Phase 7.6 — output `[MCCP-GATE-STOP]` with captured hook stderr and end the response. Do NOT print the Phase 8 output.

If the review decision was `BLOCK` (CRITICAL findings) or `REQUEST CHANGES` (HIGH findings), still write the receipt — its `resolution.open_questions` will block downstream `/mccp:*` commands at preflight until the issues are addressed and a new round is recorded.

### Phase 8 — OUTPUT

Report to user:

```
PR #<NUMBER>: <TITLE>
Decision: <APPROVE|REQUEST_CHANGES|BLOCK>

Issues: <critical_count> critical, <high_count> high, <medium_count> medium, <low_count> low
Validation: <pass_count>/<total_count> checks passed

Artifacts:
  Review: .claude/reviews/pr-<NUMBER>-review.md
  GitHub: <PR URL>

Next steps:
  - <contextual suggestions based on decision>
```

---

## Edge Cases

- **No `gh` CLI**: Fall back to local-only review (read the diff, skip GitHub publish). Warn user.
- **Diverged branches**: Suggest `git fetch origin && git rebase origin/<base>` before review.
- **Large PRs (>50 files)**: Warn about review scope. Focus on source changes first, then tests, then config/docs.
