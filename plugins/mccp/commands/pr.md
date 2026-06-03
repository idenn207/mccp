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

## Phase 0 — TERMINAL ADVISORY REJECTION (v0.2.2 R2#2)

`/mccp:pr` is a terminal mutating command that creates a PR. Per the plan v0.2.2 R3#2 carry-over decision (and Codex R2#2), **terminal commands MUST refuse `MCCP_ALLOW_CODEX_UNAVAILABLE=1` advisory mode**. The rejection runs **before any `gh` invocation, before Phase 1 discovery, and writes no receipt**.

```bash
if [ "${MCCP_ALLOW_CODEX_UNAVAILABLE:-0}" = "1" ]; then
  echo "[MCCP-GATE-STOP] /mccp:pr refuses advisory mode (MCCP_ALLOW_CODEX_UNAVAILABLE=1)." 1>&2
  echo "Reason: terminal mutating command requires a converged Codex PR-Codex receipt." 1>&2
  echo "Fix Codex availability (run /codex:setup or check the codex plugin install) and re-run." 1>&2
  echo "No GitHub API calls were made. No receipt written." 1>&2
  exit 1
fi
```

This Phase 0 runs before `gh pr list` so an advisory invocation never touches GitHub. The auto-chain `pr` step from [auto-chain.js](../scripts/lib/auto-chain.js) mirrors this rejection at chain-orchestration time as defense-in-depth.

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

### 2.5.2 — Cross-gate dedupe check (deterministic)

Use the receipt CLI's `dedupe` subcommand instead of inferring file membership from the plan. The CLI parses the plan's `## Files to Change` table, runs `git diff --name-only` against the base ref, and (if the implement-codex receipt exists) layers on `git diff --name-only <implement.head_sha>..HEAD` so that planned files modified **after** the implement gate are not silently excluded.

```bash
# Decision slug derives the same way as 2.5.7 (and as the hook computes it)
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:pr \
  --args "$ARGUMENTS")

# <plan-path> is whatever Phase 2 discovered under .claude/plans/. If Phase 2
# found multiple plans, prefer the one whose basename matches ${DECISION_SLUG}.
DEDUPE_JSON=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js dedupe \
  --plan <plan-path> \
  --base origin/<base> \
  --decision ${DECISION_SLUG})
echo "$DEDUPE_JSON"
```

Parse the JSON output (`ok`, `skip_safe`, `reason`, `residual`, `convergence`):

| Case | Action |
|---|---|
| `ok === false` (plan parse failed or git failure) | **Fail closed.** Do NOT mark as deduped. Fall through to 2.5.3 with the **full** PR diff as the focus areas. Record `> dedupe inconclusive: <reason>` above the `## Codex Adversarial Review` section. |
| `ok === true && skip_safe === true` | Record the dedupe note (template below) and jump to 2.5.6. PR-Codex skipped inside scope. |
| `ok === true && skip_safe === false && residual.length > 0` | Feed `residual` as the focus areas to Codex in 2.5.3. Record a partial-dedupe note (template below). |

Dedupe note template (write into the in-memory `## Codex Adversarial Review` section that Phase 4 will inject):

```markdown
## Codex Adversarial Review

Decision `${DECISION_SLUG}` already converged in mccp-plan-codex (round N1) and
mccp-implement-codex (round N2). PR-Codex {skipped inside scope | limited to
diff areas outside plan scope}.

Residual areas reviewed:
- <residual file 1>
- <residual file 2>
```

Use `convergence.plan_codex_receipt.round` and `convergence.implement_codex_receipt.round` from the JSON for N1 / N2. If either receipt is missing or `converged !== true`, the CLI sets `skip_safe = false` automatically with a `reason` like `"plan-codex receipt missing or not converged"`. Treat that as the normal non-deduped path.

### 2.5.3 — Invoke Codex with --base (v0.2.2 fail-closed Bash wrapper)

Build the focus text from: PR title (Phase 2), top 1-3 risky areas (migrations, auth, external calls, performance hotspots), and the residual diff areas from 2.5.2. Run the fail-closed wrapper from [scripts/lib/codex-invoke.js](../scripts/lib/codex-invoke.js):

```bash
mkdir -p .git/mccp/tmp
CODEX_STDOUT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js" adversarial-review \
  --focus "challenge this PR diff against base <base-branch>: <focus text>" \
  --base "<base-branch>" \
  --timeout-ms 90000 \
  --json 2> .git/mccp/tmp/codex-invoke.stderr)
CODEX_EXIT=$?
CODEX_BLOCKING=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.blocking?"1":"0")}catch{console.log("1")}' "$CODEX_STDOUT")
CODEX_CLASS=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.classification||"unknown")}catch{console.log("parse-error")}' "$CODEX_STDOUT")

# Phase 0 already rejected advisory mode for /mccp:pr (terminal command). Any non-ok
# classification here is a hard failure — no advisory bypass possible at this stage.
if [ "$CODEX_EXIT" != "0" ] || [ "$CODEX_BLOCKING" = "1" ] || [ "$CODEX_CLASS" != "ok" ]; then
  echo "[MCCP-GATE-STOP] Codex review failed (class=$CODEX_CLASS exit=$CODEX_EXIT)." 1>&2
  echo "Inspect: cat .git/mccp/tmp/codex-invoke.stderr" 1>&2
  exit 1
fi
```

### 2.5.4 — Inject review section + auto-rerun on Divergent, persist body draft

Construct the `## Codex Adversarial Review` PR body section with the same schema as Plan-Codex:

```markdown
## Codex Adversarial Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review --base <base-branch>` (v0.2.2 fail-closed Bash wrapper)
- 라운드 수: <N>
- 합치 결론: <one-line summary>
- 수용한 제안: <bullet list>
- 거부한 제안 + 근거: <bullet list>
- Open Questions: <item — severity CRITICAL/HIGH/MEDIUM/LOW>
- Codex session 참조: <task-id from Skill result>
```

Divergent re-rerun: same as Plan-Codex Phase 7.4 — up to **3 rounds total**. Cap at 3 even if still divergent — annotate `Open Questions: DIVERGENT_UNRESOLVED`.

**Persist the draft body to disk** so it survives between phases without shell quoting. After the section text is final for this round, write it (combined with any `## Design Review` from 2.5.1 and the dedupe note from 2.5.2) to a body-file under `.git/mccp/tmp/`:

```bash
HEAD_SHA=$(git rev-parse HEAD)

# Write content to a temp file first (multi-line shell-safe), then call CLI.
TMP_CONTENT=$(mktemp 2>/dev/null || echo "$TMPDIR/mccp-pr-body-$$.md")
cat > "$TMP_CONTENT" <<'EOF'
## Design Review
<inject 2.5.1 content here, or "> impeccable unavailable, skipped (auto-fallback)" if signal absent>

## Codex Adversarial Review
<inject the section constructed above>
EOF

BODY_FILE=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js pr-body \
  --action write \
  --decision ${DECISION_SLUG} \
  --head ${HEAD_SHA} \
  --content-file "$TMP_CONTENT")
rm -f "$TMP_CONTENT"
echo "PR body draft persisted at: $BODY_FILE"
```

The body-file path is `.git/mccp/tmp/pr-body-<slug>-<short-sha>.md`. Phase 4 reads it, prepends the title-derived summary, and passes the final file to `gh pr create --body-file`. Phase 4's cleanup step deletes it after a successful PR create.

If 2.5.3 hit the Codex auto-fallback, still persist the body — the `> Codex unavailable, skipped (auto-fallback)` line and any `## Design Review` content must reach Phase 4.

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
# Derive decision-slug deterministically (must match what /mccp:plan and /mccp:prp-implement wrote)
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:pr \
  --args "$ARGUMENTS")

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

If exit 0: proceed to Phase 3 (PUSH). The body-file persisted in 2.5.4 (under `.git/mccp/tmp/`) is the authoritative source for the `## Design Review` and `## Codex Adversarial Review` sections — Phase 4 will read it back instead of re-deriving from memory.

If non-zero: do NOT push. Output validate stderr and end the response. Leave the body-file in place so the next attempt can re-read it.

Print one info line before Phase 3:

```
PR-Codex: converged in <N> rounds (or: skipped, auto-fallback) | Receipt: <path> | Body: <body-file path>
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

The Phase 2.5 body-file under `.git/mccp/tmp/pr-body-${DECISION_SLUG}-${HEAD_SHA:0:12}.md` is authoritative for the `## Design Review` and `## Codex Adversarial Review` sections. Prepend the title-derived Summary / Changes / Files / Testing sections to that file (or to the template-filled body) and pass the final body via `--body-file`, not `--body`. This avoids shell-quoting truncation of multi-line review content.

```bash
HEAD_SHA=$(git rev-parse HEAD)
GATE_BODY=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js pr-body \
  --action path \
  --decision ${DECISION_SLUG} \
  --head ${HEAD_SHA})

# Build the final body by concatenating the title-driven sections with the
# gate-generated sections. <tmp_final> ends up containing the complete body.
TMP_FINAL=$(mktemp 2>/dev/null || echo "$TMPDIR/mccp-pr-final-$$.md")
cat > "$TMP_FINAL" <<'EOF'
<title-driven Summary / Changes / Files / Testing sections, OR the
PR template filled in from Phase 2>

EOF
if [ -f "$GATE_BODY" ]; then
  cat "$GATE_BODY" >> "$TMP_FINAL"
fi

gh pr create \
  --title "<PR title>" \
  --base <base-branch> \
  --body-file "$TMP_FINAL"
  # Add --draft if the --draft flag was parsed from $ARGUMENTS

# Cleanup: remove only the gate body-file on success. Keep $TMP_FINAL for
# debug only if `gh pr create` failed; otherwise unlink it too.
GH_EXIT=$?
rm -f "$TMP_FINAL"
if [ $GH_EXIT -eq 0 ]; then
  node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js pr-body \
    --action delete \
    --decision ${DECISION_SLUG} \
    --head ${HEAD_SHA}
fi
```

If `gh pr create` fails, leave the gate body-file untouched — the next attempt re-reads it. A periodic sweep can be invoked with `node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js pr-body --action sweep` to clear bodies older than 7 days.

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
