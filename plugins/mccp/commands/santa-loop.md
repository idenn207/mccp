---
description: Adversarial dual-review convergence loop — two independent model reviewers must both approve before code ships.
---

# Santa Loop

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

Adversarial dual-review convergence loop using the santa-method skill. Two independent reviewers — different models, no shared context — must both return NICE before code ships.

## Purpose

Run two independent reviewers (Claude Opus + an external model) against the current task output. Both must return NICE before the code is pushed. If either returns NAUGHTY, fix all flagged issues, commit, and re-run fresh reviewers.

Round accounting and the round cap are **code**, not prose. `plugins/mccp/scripts/lib/santa/cli.js` owns them: rounds are recorded in a gitignored ledger at `.claude/state/santa-loop/<decision-slug>.json`, and the cap (`MCCP_SANTA_ROUND_CAP`, default 3) is enforced by `begin-round` **before any reviewer is launched**. This file interprets exit codes and prints reports — it does not decide.

## Usage

```
/santa-loop [file-or-glob | description]
```

## Workflow

### Step 0: Resolve Review Scope

```bash
SANTA="${CLAUDE_PLUGIN_ROOT}/scripts/lib/santa/cli.js"
SCOPE_JSON=$(node "$SANTA" resolve-decision)
DECISION=$(echo "$SCOPE_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).decisionId)')
WARNING=$(echo "$SCOPE_JSON" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.warning||"")')
```

If `$WARNING` is non-empty, print it to stderr and continue. It is informational: the loop always reviews the **current** scope, never a scope inherited from `STATE.md`.

```bash
[ -n "$WARNING" ] && echo "[santa] $WARNING" 1>&2
```

Non-zero exit means the scope could not be resolved (bad `--decision`, no git repo). Stop and surface stderr.

### Step 1: Identify What to Review

Determine the scope from `$ARGUMENTS` or fall back to uncommitted changes:

```bash
git diff --name-only HEAD
```

Read all changed files to build the full review context. If `$ARGUMENTS` specifies a path, file, or description, use that as the scope instead.

### Step 2: Build the Rubric

Construct a rubric appropriate to the file types under review. Every criterion must have an objective PASS/FAIL condition. Include at minimum:

| Criterion | Pass Condition |
|-----------|---------------|
| Correctness | Logic is sound, no bugs, handles edge cases |
| Security | No secrets, injection, XSS, or OWASP Top 10 issues |
| Error handling | Errors handled explicitly, no silent swallowing |
| Completeness | All requirements addressed, no missing cases |
| Internal consistency | No contradictions between files or sections |
| No regressions | Changes don't break existing behavior |

Add domain-specific criteria based on file types (e.g., type safety for TS, memory safety for Rust, migration safety for SQL).

### Step 3: Dual Independent Review

**Open the round first — before launching anything.** A round is opened at the moment reviewers are launched, so the cap must be spent here, not after the tokens are gone:

```bash
ROUND_JSON=$(node "$SANTA" begin-round --decision "$DECISION")
BEGIN_EXIT=$?
ROUND=$(echo "$ROUND_JSON" | node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).roundIndex))}catch{process.stdout.write("")}')
```

If `BEGIN_EXIT` is non-zero, **do not launch any reviewer**. Print the ESCALATION block from Step 5 and end. Exit 12 means the cap was reached; exit 75 means the ledger lock was busy (retry shortly); exit 2 means a usage or integrity error (surface stderr).

`begin-round` is idempotent: calling it again while a round is still open returns the same `roundIndex` without consuming cap.

Launch two reviewers **in parallel** using the Agent tool (both in a single message for concurrent execution). Both must complete before proceeding to the verdict gate.

Each reviewer evaluates every rubric criterion as PASS or FAIL, then returns structured JSON:

```json
{
  "verdict": "PASS" | "FAIL",
  "checks": [
    {"criterion": "...", "result": "PASS|FAIL", "detail": "..."}
  ],
  "critical_issues": ["..."],
  "suggestions": ["..."]
}
```

The verdict gate (Step 4) maps these to NICE/NAUGHTY.

#### Reviewer A: Claude Agent (always runs)

Launch an Agent (subagent_type: `code-reviewer`, model: `opus`) with the full rubric + all files under review. The prompt must include:
- The complete rubric
- All file contents under review
- "You are an independent quality reviewer. You have NOT seen any other review. Your job is to find problems, not to approve."
- Return the structured JSON verdict above

#### Reviewer B: External Model (Claude fallback only if no external CLI installed)

First, detect which CLIs are available:
```bash
command -v codex >/dev/null 2>&1 && echo "codex" || true
command -v gemini >/dev/null 2>&1 && echo "gemini" || true
```

Build the reviewer prompt (identical rubric + instructions as Reviewer A) and write it to a unique temp file:
```bash
PROMPT_FILE=$(mktemp /tmp/santa-reviewer-b-XXXXXX.txt)
cat > "$PROMPT_FILE" << 'EOF'
... full rubric + file contents + reviewer instructions ...
EOF
```

Use the first available CLI:

**Codex CLI** (if installed)
```bash
codex exec --sandbox read-only -m gpt-5.4 -C "$(pwd)" - < "$PROMPT_FILE"
rm -f "$PROMPT_FILE"
```

**Gemini CLI** (if installed and codex is not)
```bash
gemini -p "$(cat "$PROMPT_FILE")" -m gemini-2.5-pro
rm -f "$PROMPT_FILE"
```

**Claude Agent fallback** (only if neither `codex` nor `gemini` is installed)
Launch a second Claude Agent (subagent_type: `code-reviewer`, model: `opus`). Log a warning that both reviewers share the same model family — true model diversity was not achieved but context isolation is still enforced.

In all cases, the reviewer must return the same structured JSON verdict as Reviewer A.

#### Record each reviewer into the ledger

Write each reviewer's **unmodified** JSON to a repo-internal temp file and hand it to the CLI. The reviewer contract above is untouched — `id` and `model` are values the caller already knows, and the CLI does the conversion:

```bash
TMPDIR_SANTA=".claude/state/santa-loop/tmp"      # gitignored with the ledger
mkdir -p "$TMPDIR_SANTA"

# Reviewer A (repeat verbatim for B with --id B and its own model string)
cat > "$TMPDIR_SANTA/reviewer-$ROUND-A.json" << 'EOF'
... Reviewer A's structured JSON, verbatim ...
EOF
node "$SANTA" record --decision "$DECISION" --round "$ROUND" \
  --id A --model opus --reviewer-file "$TMPDIR_SANTA/reviewer-$ROUND-A.json"
```

The file must live inside the repo — the CLI refuses paths outside it. Non-zero exit means nothing was appended; surface stderr and stop rather than proceeding to a verdict built on partial evidence.

### Step 4: Verdict Gate

```bash
VERDICT_JSON=$(node "$SANTA" verdict --decision "$DECISION" --round "$ROUND")
VERDICT=$(echo "$VERDICT_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).verdict)')
FAILING=$(echo "$VERDICT_JSON" | node -e 'process.stdout.write((JSON.parse(require("fs").readFileSync(0,"utf8")).failing||[]).join(", "))')
```

- **NICE** → proceed to Step 6 (push)
- **NAUGHTY** → `$FAILING` names the reviewers that failed. Merge all critical issues from both reviewers, deduplicate, proceed to Step 5

### Step 5: Fix Cycle (NAUGHTY path)

1. Display all critical issues from both reviewers
2. Fix every flagged issue — change only what was flagged, no drive-by refactors
3. Commit all fixes in a single commit:
   ```
   fix: address santa-loop review findings (round N)
   ```
4. Return to Step 3 with **fresh reviewers** (no memory of previous rounds). Step 3's `begin-round` decides whether another round may open — this step never makes that call itself.

When `begin-round` refuses, print and stop. Do NOT push.

```
SANTA LOOP ESCALATION (round cap reached)

Cap: MCCP_SANTA_ROUND_CAP (default 3)
Remaining issues:
- [list all unresolved critical issues from both reviewers]

Manual review required before proceeding.
```

### Step 6: Push (NICE path)

When both reviewers return PASS:

```bash
git push -u origin HEAD
```

### Step 7: Final Report

Print the output report (see Output section below). `node "$SANTA" status --decision "$DECISION"` reports `{rounds, entries, exitReason}` for the iteration count.

## Output

```
SANTA VERDICT: [NICE / NAUGHTY (escalated)]

Reviewer A (Claude Opus):   [PASS/FAIL]
Reviewer B ([model used]):  [PASS/FAIL]

Agreement:
  Both flagged:      [issues caught by both]
  Reviewer A only:   [issues only A caught]
  Reviewer B only:   [issues only B caught]

Iterations: [N]/[cap]
Result:     [PUSHED / ESCALATED TO USER]
```

## Notes

- Reviewer A (Claude Opus) always runs — guarantees at least one strong reviewer regardless of tooling.
- Model diversity is the goal for Reviewer B. GPT-5.4 or Gemini 2.5 Pro gives true independence — different training data, different biases, different blind spots. The Claude-only fallback still provides value via context isolation but loses model diversity.
- Strongest available models are used: Opus for Reviewer A, GPT-5.4 or Gemini 2.5 Pro for Reviewer B.
- External reviewers run with `--sandbox read-only` (Codex) to prevent repo mutation during review.
- Fresh reviewers each round prevents anchoring bias from prior findings.
- The rubric is the most important input. Tighten it if reviewers rubber-stamp or flag subjective style issues.
- Commits happen on NAUGHTY rounds so fixes are preserved even if the loop is interrupted.
- Push only happens after NICE — never mid-loop.
- The cap binds at the **ledger index**, not just here: `record` and `verdict` refuse an index `begin-round` never opened, so ignoring a refusal and launching reviewers produces no ledger entry and no verdict *at that index*. Two things it does **not** prevent, and this file claims neither: the reviewer tokens being spent (launching a reviewer is an LLM act, with nothing for a shell to intercept), and reuse of the last already-FINAL index — `record --round <cap-1>` still succeeds, because restricting `record` to `OPEN` rounds is judgement lifecycle and belongs to P1.
- The cap is scoped to the decision slug, which is derived from the branch name. Renaming or switching branches starts a fresh cap (different branch = different review scope). Pass `--decision <slug>` to every subcommand to pin one scope across a rename.
