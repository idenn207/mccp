---
description: "Single-entry orchestrator — PRD→plan→implement→PR (trivial path auto-branch)"
argument-hint: "<feature description | path/to/*.prd.md> [--full] [--trivial]"
allowed-tools: Bash(node:*), Bash(git:*), Skill(mccp:plan-prd), Skill(mccp:plan), Skill(mccp:prp-implement), Skill(mccp:prp-commit), Skill(mccp:pr)
---

# /mccp:work — single-entry chain orchestration (v0.3.1)

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

Routes a single user input through the full mccp pipeline:

- **trivial path** (simple doc/config edit) → `/mccp:prp-commit` → `/mccp:pr`
- **full chain** (new feature / architectural change) → `/mccp:plan-prd` → `/mccp:plan` → `/mccp:prp-implement` → `/mccp:prp-commit` → `/mccp:pr`

Classification is mechanical (5-condition AND heuristic, conservative default = full). User can override with `--full` / `--trivial`. **Forbidden behavior**: do not ask the user "trivial or full?" between sub-steps. Classify once at Phase 0, then proceed without inter-step confirmation (mirror of `/mccp:plan` Phase 5 contract).

---

## Phase 0 — DETECT

### Working tree check

```bash
git branch --show-current
git status --porcelain
```

If working tree is dirty AND current branch is `main`/`master`:

```
[MCCP-WORK-STOP] Dirty working tree on main. Run /mccp:prp-commit first or stash, then re-invoke /mccp:work.
```

End the response. Do NOT proceed.

### Classification

```bash
mkdir -p .git/mccp/tmp

ARG="$ARGUMENTS"
FORCE_TRIVIAL=""
FORCE_FULL=""
PRD_PATH=""

case "$ARG" in
  *--trivial*) FORCE_TRIVIAL="--trivial" ;;
esac
case "$ARG" in
  *--full*) FORCE_FULL="--full" ;;
esac
case "$ARG" in
  *.prd.md*) PRD_PATH=$(echo "$ARG" | grep -oE '[^ ]+\.prd\.md') ;;
esac

CLASSIFY=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-orchestrator.js" classify \
  --feature "$ARG" \
  ${PRD_PATH:+--prd "$PRD_PATH"} \
  $FORCE_TRIVIAL $FORCE_FULL 2> .git/mccp/tmp/work-classify.stderr)
TYPE=$(echo "$CLASSIFY" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.type)}catch{process.stdout.write("full")}')
REASON=$(echo "$CLASSIFY" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason)}catch{process.stdout.write("classify-failed")}')

echo "[mccp:work] classification=$TYPE reason=$REASON"
```

---

## Phase 1 — BRANCH

Decide chain shape based on `$TYPE` from Phase 0:

| TYPE | Action |
|---|---|
| `trivial` | Goto Phase 2.T (commit + pr only) |
| `full` | Goto Phase 2.F (full chain) |

Print one line to user:

```
chain=<trivial|full> reason=<reason>
```

Do NOT ask for confirmation. If user wants a different route they re-invoke with `--full` / `--trivial`.

---

## Phase 2.T — TRIVIAL CHAIN

### Step 1 — `/mccp:prp-commit`

Generate a commit message from the feature description (`$ARGUMENTS` stripped of flag tokens). Invoke `Skill(mccp:prp-commit, "<message>")`.

On failure: write `.claude/state/fix-task.md` with the failure detail and STOP. Do NOT advance to Step 2.

### Step 2 — `/mccp:pr`

Invoke `Skill(mccp:pr)`. Codex bypass is automatic per user memory rule when `MCCP_CODEX_DISABLED=1` (or auto-apply `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"`).

Goto Phase 3 (REPORT).

---

## Phase 2.F — FULL CHAIN

Five sequential steps. Between each, query `work-orchestrator.js next-step` and halt if `halt:true`. **No inter-step user confirmation.**

### Step 1 — `/mccp:plan-prd` (skip if `$PRD_PATH` already provided)

If `$PRD_PATH` is non-empty: skip this step (we already have a PRD).

Otherwise invoke `Skill(mccp:plan-prd, "<feature description>")`. Capture the produced PRD path for Step 2.

### Step 2 — `/mccp:plan`

Invoke `Skill(mccp:plan, "<PRD path>")`. Capture the produced plan path. After plan-codex gate writes the receipt, advance.

### Step 3 — `/mccp:prp-implement`

Pre-flight:

```bash
NS=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-orchestrator.js" next-step \
  --state plan --type full --decision "$DECISION_SLUG" --skip-cost)
HALT=$(echo "$NS" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.halt?"1":"0")}catch{process.stdout.write("1")}')
if [ "$HALT" = "1" ]; then
  echo "[mccp:work] HALT at implement step. Writing .claude/state/fix-task.md and stopping."
  # write fix-task.md with the JSON reasons[]
  exit 13
fi
```

Invoke `Skill(mccp:prp-implement, "<plan path>")`.

### Step 4 — `/mccp:prp-commit`

Generate commit message from plan summary. Invoke `Skill(mccp:prp-commit, "<message>")`.

### Step 5 — `/mccp:pr`

Same as Phase 2.T Step 2. Invoke `Skill(mccp:pr)`.

Goto Phase 3 (REPORT).

---

## Phase 3 — REPORT

Print a summary to the user:

```
## /mccp:work complete

- **Type**: <trivial | full>
- **Classification reason**: <reason from Phase 0>
- **Steps run**: <list>
- **Receipt paths**: <list>
- **PR URL**: <if Step 5/Phase 2.T Step 2 ran>
- **fix-task.md**: <path if any step halted>
```

---

## Error recovery

If any step halts mid-chain:

1. Write `.claude/state/fix-task.md` with: failed step, reasons from `next-step` JSON, recovery options (manual `/mccp:receipt-validate <command>`, `/mccp:receipt-write <gate>`, or `MCCP_SKIP_RECEIPT=1` one-shot bypass).
2. Print the fix-task path to user.
3. END the response. Do NOT skip ahead to later steps.

The next `/mccp:work` invocation will detect `fix-task.md` presence and refuse to start until the user clears it (mirror of S8 stop-loop pattern).

---

## Forbidden during `/mccp:work`

- "Should I proceed to the next step?" / "trivial 또는 full 중 어느 쪽으로 갈까요?"
- Inter-step yes/no/proceed/confirm 컨펌 요청
- Skipping `next-step` query before invoking the next slash command
- Treating `MCCP_AUTO_CHAIN_DISABLE=1` or STATE.md `chain_aborted=true` as "warning only" — both are HARD halts

The only exception is Phase 0 dirty-tree STOP (precondition violation, not a step transition).
