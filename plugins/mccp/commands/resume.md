---
description: "Resume a session that ended with an auto-handoff signal — reads STATE.md and dispatches the appropriate next command"
argument-hint: "(no arguments — reads STATE.md handoff state)"
allowed-tools: Bash(node:*), Bash(git:*), Skill(mccp:work), Skill(mccp:prp-implement)
---

# /mccp:resume — honest handoff resume entry (v1.1.0 Stage 1)

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

Reads `.claude/state/STATE.md` for a pending `handoff_spawn` signal (written by the auto-handoff Stop hook when cost tiers cross) and dispatches the right slash command to resume the previous session's work. Implements a **2-phase atomic dispatch** with `dispatch_id` + `dispatch_attempt_count` to survive process death between the read and the dispatched command's completion.

**Why this exists**: `MCCP_AUTO_HANDOFF=notify` (the v1.1.0 default and only honest mode in IDE-launched Windows sessions) writes a STATE.md marker + emits a stderr banner — but it never *resumes* anything. The user opens the new session, sees the banner, and has to re-type `/mccp:work` with the right `--resume` flags. `/mccp:resume` makes that step mechanical and recovers cleanly from crashes mid-dispatch.

### Failure semantics (F1 absorption from plan-codex review)

- **Phase 1 NEVER clears the handoff signal.** It writes `event=resume_dispatching` + `dispatch_id` + `dispatch_attempt_count++` and stops.
- **Phase 2 clears ONLY on dispatched-command success** verified by receipt-readback. Failure / timeout / exception → STATE.md stays at `resume_dispatching` + bumped attempt count → next `/mccp:resume` invocation either re-enters as `in-flight` (under cap) or `resume_giveup` (≥ 3 attempts).
- **No automatic clear of `handoff_spawn`** ever happens without an explicit success path. User crash recovery is preserved.

---

## Phase 0 — DETECT

```bash
mkdir -p .git/mccp/tmp

ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$ROOT" ]; then
  echo "[mccp:resume] not in a git repository — /mccp:resume requires a git root for STATE.md location"
  exit 1
fi

# Resolve the plugin root the same way other mccp commands do (env override → cache path).
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.4.0}"

# Read STATE.md (via state-writer.readState) + classify via state-resumption.dispatch.
# fixTaskPending is computed by checking .claude/state/fix-task.md existence.
FIX_TASK_PENDING="false"
if [ -f "$ROOT/.claude/state/fix-task.md" ]; then
  FIX_TASK_PENDING="true"
fi

DISPATCH=$(node -e "
const path = require('path');
const root = process.argv[1];
const pluginRoot = process.argv[2];
const fixTaskPending = process.argv[3] === 'true';
const sw = require(path.join(pluginRoot, 'scripts', 'state', 'state-writer'));
const sr = require(path.join(pluginRoot, 'scripts', 'lib', 'state-resumption'));
const state = sw.readState(root);
const result = sr.dispatch(state, { fixTaskPending: fixTaskPending });
process.stdout.write(JSON.stringify(result));
" "$ROOT" "$PLUGIN_ROOT" "$FIX_TASK_PENDING")

COMMAND=$(echo "$DISPATCH" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.command)}catch{process.stdout.write("noop")}')
ARGS=$(echo "$DISPATCH" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.args||"")}catch{process.stdout.write("")}')
REASON=$(echo "$DISPATCH" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason)}catch{process.stdout.write("dispatch-parse-failed")}')
DISPATCH_ID=$(echo "$DISPATCH" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.dispatchId||"")}catch{process.stdout.write("")}')
ATTEMPT=$(echo "$DISPATCH" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(j.attemptCount||0))}catch{process.stdout.write("0")}')
SHOULD_CLEAR=$(echo "$DISPATCH" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.shouldClearOnSuccess?"true":"false")}catch{process.stdout.write("false")}')

echo "[mccp:resume] command=$COMMAND attempt=$ATTEMPT dispatch_id=$DISPATCH_ID"
```

---

## Phase 1 — BRANCH

Decide based on `$COMMAND`:

| COMMAND | Action |
|---|---|
| `noop` | Print "no pending handoff signal" + end response. No STATE.md write. |
| `in-flight` | Print "resume already dispatching" + end response. No STATE.md write. |
| `resume_giveup` | Print manual-recovery guidance + end response. No STATE.md write. **handoff_spawn signal intentionally preserved.** |
| `/mccp:work` | Goto Phase 2 (dispatch graceful or unsafe-no-fix-task path) |
| `/mccp:prp-implement` | Goto Phase 2 (dispatch unsafe + fix-task path) |

### 1a — noop

```bash
if [ "$COMMAND" = "noop" ]; then
  echo "[mccp:resume] $REASON"
  echo ""
  echo "Nothing to resume. STATE.md is clean."
  exit 0
fi
```

End the response.

### 1b — in-flight (re-entry guard)

```bash
if [ "$COMMAND" = "in-flight" ]; then
  echo "[mccp:resume] $REASON"
  echo ""
  echo "Another /mccp:resume is already dispatching (attempt $ATTEMPT/3)."
  echo "If you believe the dispatching session crashed, wait until 3 attempts accumulate then re-run — the dispatch table will auto-promote to resume_giveup for manual recovery."
  exit 0
fi
```

End the response. **Do not** write any STATE.md update — the previous resume's marker stays in place.

### 1c — resume_giveup (manual recovery)

```bash
if [ "$COMMAND" = "resume_giveup" ]; then
  echo "[mccp:resume] $REASON"
  echo ""
  echo "Resume has been dispatched $ATTEMPT times without success. Manual intervention required:"
  echo "  1. Inspect .claude/state/fix-task.md if present."
  echo "  2. Inspect STATE.md handoff signals (last_event, next_chunk, unsafe_checkpoint)."
  echo "  3. To retry: manually reset dispatch_attempt_count to 0 in STATE.md, then re-run /mccp:resume."
  echo "  4. To abandon: run /mccp:work explicitly with whichever args make sense for the current goal."
  echo ""
  echo "handoff_spawn signal is intentionally preserved so you don't lose context. No STATE.md write performed by this invocation."
  exit 0
fi
```

End the response.

---

## Phase 2 — PHASE 1 ATOMIC WRITE (resume_dispatching marker)

This phase runs only for `$COMMAND` ∈ {`/mccp:work`, `/mccp:prp-implement`}.

```bash
node -e "
const path = require('path');
const sw = require(path.join(process.argv[1], 'scripts', 'state', 'state-writer'));
sw.update(process.argv[2], {
  event: 'resume_dispatching',
  dispatch_id: process.argv[3],
  dispatch_attempt_count: Number(process.argv[4]),
  clearHandoff: false,   // F1 absorption — phase 1 NEVER clears
});
" "$PLUGIN_ROOT" "$ROOT" "$DISPATCH_ID" "$ATTEMPT"
PHASE1_EXIT=$?

if [ "$PHASE1_EXIT" != "0" ]; then
  echo "[MCCP-RESUME-STOP] Phase 1 STATE.md write failed (exit=$PHASE1_EXIT). Not invoking dispatched command. handoff_spawn signal preserved."
  exit 1
fi
```

If Phase 1 STATE.md write fails, end the response — do NOT invoke the dispatched command. handoff_spawn signal stays put for the next manual resume.

---

## Phase 3 — INVOKE DISPATCHED COMMAND

Print one line to the user:

```
> Resuming via {COMMAND} {ARGS}
> reason: {REASON}
> dispatch_id: {DISPATCH_ID} (attempt {ATTEMPT}/3)
```

Then invoke the command via Skill:

| COMMAND value | Skill invocation |
|---|---|
| `/mccp:work` | `Skill(mccp:work, args="<ARGS>")` |
| `/mccp:prp-implement` | `Skill(mccp:prp-implement, args="<ARGS>")` |

The Skill invocation runs the chain in this same response. After it returns, proceed to Phase 4.

---

## Phase 4 — PHASE 2 ATOMIC WRITE (success-only)

Verify the dispatched command produced a success receipt before clearing. Use `receipt-validate` readback as the success-readback per Codex F1 absorption.

```bash
# Pick which receipt to check based on the dispatched command.
VALIDATE_COMMAND=""
case "$COMMAND" in
  "/mccp:work")          VALIDATE_COMMAND="mccp:work" ;;
  "/mccp:prp-implement") VALIDATE_COMMAND="mccp:prp-implement" ;;
esac

# Best-effort validate. If the dispatched command failed, the receipt either
# does not exist or is stale — validate exits non-zero, we DO NOT advance to
# resume_dispatched, the dispatch_attempt_count stays bumped, and next
# /mccp:resume re-enters via the in-flight or giveup row.
#
# Capture validate stderr to a temp file so the failure path can surface the
# actual reason (schema mismatch, missing chain receipt, etc.). Loud fail-open
# principle: silently discarding `2>&1 > /dev/null` makes manual recovery
# guesswork — the user would have to re-run validate by hand to learn why.
VALIDATE_STDERR=$(mktemp -t mccp-resume-validate.XXXXXX 2>/dev/null || echo "${TMPDIR:-/tmp}/mccp-resume-validate.$$")
if [ -n "$VALIDATE_COMMAND" ]; then
  # v1.3.1: forward --decision/--plan explicitly so the validator scopes to the
  # dispatched command's slug instead of falling back to decisionId='default'
  # (Codex R1 F1). DECISION_SLUG is derived from the dispatched command + args
  # the same way the dispatched command body itself derives it.
  DECISION_SLUG=$(node "$PLUGIN_ROOT/scripts/receipt/cli.js" derive-decision \
    --command "$VALIDATE_COMMAND" \
    --args "$ARGS" 2> /dev/null)
  node "$PLUGIN_ROOT/scripts/receipt/cli.js" validate \
    --command "$VALIDATE_COMMAND" \
    --decision "$DECISION_SLUG" \
    --plan "$ARGS" \
    > /dev/null 2> "$VALIDATE_STDERR"
  VALIDATE_EXIT=$?
else
  VALIDATE_EXIT=1   # unknown dispatched command — fail closed
fi

if [ "$VALIDATE_EXIT" = "0" ]; then
  # Phase 2 success path — emit resume_dispatched marker + clearHandoff per dispatch.shouldClearOnSuccess.
  node -e "
  const path = require('path');
  const sw = require(path.join(process.argv[1], 'scripts', 'state', 'state-writer'));
  sw.update(process.argv[2], {
    event: 'resume_dispatched',
    dispatch_id_completed: process.argv[3],
    clearHandoff: process.argv[4] === 'true',
  });
  " "$PLUGIN_ROOT" "$ROOT" "$DISPATCH_ID" "$SHOULD_CLEAR"
  echo "[mccp:resume] Phase 2 success — dispatch_id=$DISPATCH_ID marked complete (handoff_signal_cleared=$SHOULD_CLEAR)"
  rm -f "$VALIDATE_STDERR"
else
  # Failure / timeout / exception. STATE.md stays at resume_dispatching + bumped attempt.
  echo "[mccp:resume] Dispatched command did not produce a success receipt (validate exit=$VALIDATE_EXIT)."
  if [ -s "$VALIDATE_STDERR" ]; then
    echo "[mccp:resume] validate stderr:"
    sed 's/^/  /' "$VALIDATE_STDERR"
  fi
  echo "[mccp:resume] STATE.md retained: event=resume_dispatching, dispatch_attempt_count=$ATTEMPT."
  echo "[mccp:resume] Next /mccp:resume invocation will re-enter via in-flight (attempt < 3) or resume_giveup (≥ 3)."
  rm -f "$VALIDATE_STDERR"
  exit 0
fi
```

End the response.

---

## Failure-mode summary

| Symptom | What happens |
|---|---|
| Phase 1 write crashes | handoff_spawn preserved. No marker written. Next invocation re-classifies from scratch (treats as fresh handoff). |
| Dispatched command crashes mid-run | resume_dispatching marker persists. attempt count bumped. Next invocation: in-flight or giveup. |
| Dispatched command succeeds but Phase 4 validate fails | Treated as failure — attempt stays. User can re-run /mccp:resume; if next dispatch also fails the same way, giveup triggers (manual review needed). |
| 3 consecutive failures | Next `/mccp:resume` reports `resume_giveup` with recovery guidance. handoff_spawn signal preserved. |
| User resets `dispatch_attempt_count` to 0 manually | Next `/mccp:resume` treats it as a fresh handoff (re-enters via Rows 1–3). |

## Forbidden behaviors

- Do **NOT** ask the user "shall I clear the handoff signal?" — phase 2 is mechanical.
- Do **NOT** clear handoff_spawn outside the Phase 4 success path.
- Do **NOT** auto-call `/mccp:resume` recursively if Phase 4 reports validate failure — the dispatch_attempt_count caps it, but the user should make the next call deliberately.
