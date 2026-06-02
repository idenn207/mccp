---
description: "Create a GitHub PR from current branch with unpushed commits — discovers templates, analyzes changes, pushes"
argument-hint: "[base-branch] (default: main)"
---

# Create Pull Request

**Input**: `$ARGUMENTS` — optional, may contain a base branch name and/or flags (e.g., `--draft`).

**Parse `$ARGUMENTS`**:
- Extract any recognized flags (`--draft`)
- Treat remaining non-flag text as the base branch name
- Default base branch to `main` if none specified

---

## Phase 1 — VALIDATE

Check preconditions:

```bash
git branch --show-current
git status --short
git log origin/<base>..HEAD --oneline
```

| Check | Condition | Action if Failed |
|---|---|---|
| Not on base branch | Current branch ≠ base | Stop: "Switch to a feature branch first." |
| Clean working directory | No uncommitted changes | Warn: "You have uncommitted changes. Commit or stash first." |
| Has commits ahead | `git log origin/<base>..HEAD` not empty | Stop: "No commits ahead of `<base>`. Nothing to PR." |
| No existing PR | `gh pr list --head <branch> --json number` is empty | Stop: "PR already exists: #<number>. Use `gh pr view <number> --web` to open it." |

If all checks pass, proceed.

---

## Phase 2 — DISCOVER

### PR Template

Search for PR template in order:

1. `.github/PULL_REQUEST_TEMPLATE/` directory — if exists, list files and let user choose (or use `default.md`)
2. `.github/PULL_REQUEST_TEMPLATE.md`
3. `.github/pull_request_template.md`
4. `docs/pull_request_template.md`

If found, read it and use its structure for the PR body.

### Commit Analysis

```bash
git log origin/<base>..HEAD --format="%h %s" --reverse
```

Analyze commits to determine:
- **PR title**: Use conventional commit format with type prefix — `feat: ...`, `fix: ...`, etc.
  - If multiple types, use the dominant one
  - If single commit, use its message as-is
- **Change summary**: Group commits by type/area

### File Analysis

```bash
git diff origin/<base>..HEAD --stat
git diff origin/<base>..HEAD --name-only
```

Categorize changed files: source, tests, docs, config, migrations.

### Planning Artifacts

Check for related artifacts produced by `/mccp:plan` (or any of the legacy `/plan-prd`, `/plan`, PRP workflows when the ECC origin marketplace is also installed):
- `.claude/prds/` — PRDs this PR implements a milestone of
- `.claude/plans/` — Plans executed by this PR
- `.claude/PRPs/prds/` — legacy PRP PRDs
- `.claude/PRPs/plans/` — legacy PRP implementation plans
- `.claude/PRPs/reports/` — legacy PRP implementation reports

Reference these in the PR body if they exist.

---

## Phase 2.5 — mccp PR-CODEX GATE (자동, /mccp:pr 진입 시 MANDATORY)

This phase applies when invoked as `/mccp:pr`. It implements the **Autonomy Contract** for the PR-Codex gate inline below. See `${CLAUDE_PLUGIN_ROOT}/docs/gate-design.md` for original design rationale (reference only — enforcement lives in this command body plus the receipt CLI and the two receipt hooks). **Do not skip and do not ask the user between sub-steps.**

This runs **after** Phase 2 (DISCOVER — template/commits/files) and **before** Phase 3 (PUSH).

### 2.5.1 — Detect design signal (optional PR-Impeccable)

Inspect `git diff origin/<base>..HEAD --name-only` from Phase 2. If any file matches `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.astro`, `*.css`, `*.scss`, `*.module.css`, `*.html`, OR any `.claude/design/*.design.plan.md` was added/modified, the PR carries a design surface. Call:

```
Skill(impeccable, "critique <PR title or branch name>")
Skill(impeccable, "audit <PR title or branch name>")
```

Capture the critique/audit highlights — they will be injected into the PR body as `## Design Review` in Phase 4. Skip this sub-step silently if no design signal is detected.

If `impeccable` is not installed (`Skill` returns `unknown_skill` / `not found`), record `> impeccable unavailable, skipped (auto-fallback)` in the same `## Design Review` placeholder and continue.

### 2.5.2 — Cross-gate dedupe check

Read the most recent receipts via:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status --json
```

Filter for `gate_id ∈ {mccp-plan-codex, mccp-implement-codex}` whose `decision_id` matches this PR's feature slug (kebab-case from branch name or referenced plan path). If both receipts exist with `resolution.converged=true` AND the PR diff stays inside the same decision set (no files outside the plan's `Files to Change`), record this as a partial dedupe:

```markdown
## Codex Adversarial Review

Decisions {decision-id} already converged in mccp-plan-codex (round N1) and mccp-implement-codex (round N2). PR-Codex limited to diff areas outside plan scope.
```

Then enumerate the residual diff areas. If residual is empty → jump to 2.5.6. Otherwise feed the residual list to Codex in 2.5.3.

### 2.5.3 — Invoke Codex with --base

Build the focus text from: PR title (Phase 2), top 1-3 risky areas (migrations, auth, external calls, performance hotspots), and the residual diff areas from 2.5.2. Call:

```
Skill(codex:adversarial-review, "challenge this PR diff against base <base-branch>: <focus text>")
```

Codex auto-fallback triggers (same as Plan-Codex Phase 7.2): `error: setup_required` / `not authenticated` / 60s timeout / `rate_limit` / `service_unavailable` → write `> Codex unavailable, skipped (auto-fallback): <reason>` into the `## Codex Adversarial Review` PR body placeholder and jump to 2.5.6.

### 2.5.4 — Inject review section + auto-rerun on Divergent

Construct the `## Codex Adversarial Review` PR body section (kept in memory until Phase 4 writes the PR body) with the same schema as Plan-Codex:

```markdown
## Codex Adversarial Review

- 호출: `Skill(codex:adversarial-review)` --base <base-branch>
- 라운드 수: <N>
- 합치 결론: <one-line summary>
- 수용한 제안: <bullet list>
- 거부한 제안 + 근거: <bullet list>
- Open Questions: <item — severity CRITICAL/HIGH/MEDIUM/LOW>
- Codex session 참조: <task-id from Skill result>
```

Divergent re-rerun: same as Plan-Codex Phase 7.4 — up to **3 rounds total**. Cap at 3 even if still divergent — annotate `Open Questions: DIVERGENT_UNRESOLVED`.

### 2.5.5 — Security-sensitive branch (HIGH)

If the diff touches any of: auth/authz, session/token, crypto/hash/sign/key management, secret/credential handling, input validation, SQL/cmd injection paths, SSRF, path traversal, privilege escalation — additionally invoke:

```
Skill(security-reviewer, "review this PR diff against base <base-branch>: <list affected security areas>")
```

Pass the Codex result from 2.5.4 as context input (so security-reviewer doesn't duplicate). Integrate findings into the same `## Codex Adversarial Review` section under a `### Security Reviewer` subheading.

### 2.5.6 — Auto-CRITICAL check

Scan the combined Codex + security-reviewer Open Questions for §0 auto-CRITICAL catalog. If any present:

1. Do NOT proceed to Phase 3 (PUSH)
2. Output:
   ```
   [MCCP-GATE-STOP] CRITICAL Open Question detected before PR push:
   - <item>
   Branch: <current branch>
   사용자 결정 필요. 진행 의사 또는 수정 지시를 주세요.
   ```
3. End the response.

### 2.5.7 — Write mccp-pr-codex receipt

```bash
# Derive decision-slug from branch or PR title (kebab-case)
DECISION_SLUG=<derived slug>

node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
  --gate mccp-pr-codex \
  --decision ${DECISION_SLUG} \
  --plan <plan path if discovered in Phase 2, else PR title> \
  --quiet
```

Bash hook block handling: same as Plan-Codex Phase 7.6 — output `[MCCP-GATE-STOP]` with captured hook stderr and end the response. Do NOT enter Phase 3.

### 2.5.8 — Read-back validate, then continue to Phase 3

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate --command mccp:code-review
```

If exit 0: proceed to Phase 3 (PUSH). Hold the `## Codex Adversarial Review` (and `## Design Review` if any) sections in memory — Phase 4 will append them to the PR body.

If non-zero: do NOT push. Output validate stderr and end the response.

Print one info line before Phase 3:

```
PR-Codex: converged in <N> rounds (or: skipped, auto-fallback) | Receipt: <path>
```

### Forbidden during Phase 2.5

Same forbidden phrase catalog as Plan-Codex Phase 7. No "shall I invoke Codex?" / "receipt를 직접 작성해주세요" / inter-step yes/no prompts (2.5.6 CRITICAL stop only exception).

---

## Phase 3 — PUSH

```bash
git push -u origin HEAD
```

If push fails due to divergence:
```bash
git fetch origin
git rebase origin/<base>
git push -u origin HEAD
```

If rebase conflicts occur, stop and inform the user.

---

## Phase 4 — CREATE

### With Template

If a PR template was found in Phase 2, fill in each section using the commit and file analysis. Preserve all template sections — leave sections as "N/A" if not applicable rather than removing them.

### Without Template

Use this default format:

```markdown
## Summary

<1-2 sentence description of what this PR does and why>

## Changes

<bulleted list of changes grouped by area>

## Files Changed

<table or list of changed files with change type: Added/Modified/Deleted>

## Testing

<description of how changes were tested, or "Needs testing">

## Related Issues

<linked issues with Closes/Fixes/Relates to #N, or "None">
```

### Create the PR

```bash
gh pr create \
  --title "<PR title>" \
  --base <base-branch> \
  --body "<PR body>"
  # Add --draft if the --draft flag was parsed from $ARGUMENTS
```

---

## Phase 5 — VERIFY

```bash
gh pr view --json number,url,title,state,baseRefName,headRefName,additions,deletions,changedFiles
gh pr checks --json name,status,conclusion 2>/dev/null || true
```

---

## Phase 6 — OUTPUT

Report to user:

```
PR #<number>: <title>
URL: <url>
Branch: <head> → <base>
Changes: +<additions> -<deletions> across <changedFiles> files

CI Checks: <status summary or "pending" or "none configured">

Artifacts referenced:
  - <any PRDs/plans linked in PR body>

Next steps:
  - gh pr view <number> --web   → open in browser
  - /code-review <number>       → review the PR
  - gh pr merge <number>        → merge when ready
```

---

## Edge Cases

- **No `gh` CLI**: Stop with: "GitHub CLI (`gh`) is required. Install: <https://cli.github.com/>"
- **Not authenticated**: Stop with: "Run `gh auth login` first."
- **Force push needed**: If remote has diverged and rebase was done, use `git push --force-with-lease` (never `--force`).
- **Multiple PR templates**: If `.github/PULL_REQUEST_TEMPLATE/` has multiple files, list them and ask user to choose.
- **Large PR (>20 files)**: Warn about PR size. Suggest splitting if changes are logically separable.
