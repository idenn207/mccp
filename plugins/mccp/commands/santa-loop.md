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

If `BEGIN_EXIT` is non-zero, **do not launch any reviewer**. Exit 12 means the cap was reached; exit 75 means the ledger lock was busy (retry shortly); exit 2 means a usage or integrity error (surface stderr).

Exit 2 has one case with a **recovery procedure**, and it is worth separating from the rest: when stderr names `SANTA_ADJUDICATION_INCOMPLETE`, the last FINAL round still carries blocking issues that were never judged for that round. Nothing was written and the cap was **not** consumed — the round simply did not open. Unlike cap-reached this is not a termination, so it is **not sealed**: return to Step 5, record a judgement for every issue stderr lists (it lists all of them, with ids), then call `begin-round` again. Every other exit-2 code is a usage or integrity error with no such procedure.

That branch is **code, not prose** — the termination and the seal call both have to be mechanically present. Cap-reached is one of the two loop endings UI14 requires to be instrumented, and it never reaches Step 5.5 or Step 6, so its seal call lives here:

```bash
if [ "$BEGIN_EXIT" -ne 0 ]; then
  if [ "$BEGIN_EXIT" -eq 12 ]; then
    # Cap reached — a legitimate end of the review loop, so it gets sealed (UI14).
    # 75 (lock contention) and 2 (usage/integrity) are FAILURES, not endings: they
    # are not sealed, because there is no settled review outcome to anchor.
    SEAL_JSON=$(node "$SANTA" seal --decision "$DECISION")
    SEAL_EXIT=$?
    if [ "$SEAL_EXIT" -ne 0 ]; then
      echo "[santa] cap reached, but seal failed (exit $SEAL_EXIT) — escalation stands, audit anchor missing." 1>&2
    fi
    # Print the Step 5 ESCALATION block (content and format unchanged). It belongs
    # to THIS branch alone: exit 75 is transient and exit 2 is a refusal, and
    # announcing "round cap reached" for either one hands the operator a false
    # diagnosis of an exhausted loop.
  elif [ "$BEGIN_EXIT" -eq 2 ]; then
    echo "[santa] begin-round refused (exit 2) — no round opened, no cap consumed, nothing sealed." 1>&2
    echo "[santa] If the stderr above names SANTA_ADJUDICATION_INCOMPLETE, the loop is recoverable:" 1>&2
    echo "[santa] return to Step 5, record a judgement for every issue it lists, then run Step 3 again." 1>&2
    echo "[santa] Any other SANTA_* code is a usage or integrity error with no such procedure." 1>&2
  fi
  exit "$BEGIN_EXIT"
fi
```

Two things about that block are load-bearing. `exit "$BEGIN_EXIT"` must be its last statement — without it, execution falls through to the reviewer launch and the push, which voids the entire reason the cap gate exists. And unlike Step 5.5, a seal failure here does **not** change the exit code: there is no push to prevent, and overwriting `$BEGIN_EXIT` would bury the operator's primary diagnosis (cap exhausted) under a secondary one (seal failed).

`begin-round` is idempotent: calling it again while a round is still open returns the same `roundIndex` without consuming cap.

Launch two reviewers **in parallel** using the Agent tool (both in a single message for concurrent execution). Both must complete before proceeding to the verdict gate.

Each reviewer evaluates every rubric criterion as PASS or FAIL, then returns structured JSON:

```jsonc
{ "verdict": "PASS" | "FAIL",
  "checks": [ { "criterion": "…", "result": "PASS|FAIL", "detail": "…" } ],
  "critical_issues": [
    // Preferred form — an object per issue.
    { "claim": "…",                            // required, string, 1..500 chars
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",  // required, exactly one of these four (case-sensitive)
      "failure_scenario": "…",                 // required ONLY to claim a blocker. 1..2000 chars
      "evidence": "path:line or a quote" }     // optional, string, 0..500 chars
    // A bare string is still accepted (legacy form), but see the severity contract below.
  ],
  "suggestions": ["…"] }
```

**Severity contract.** `failure_scenario` is what separates a blocker from a
remark: write the concrete misbehaviour the issue causes — what breaks, under
which input or state, and with what wrong result. An issue counts as *blocking*
only when its `severity` is `CRITICAL` or `HIGH` **and** its `failure_scenario`
is substantive. Everything else is preserved verbatim and reported, it just
carries no weight in the gate.

This is not permission to look less hard. It says: if you cannot describe the
malfunction, the observation belongs in `suggestions`, which already exists for
exactly that. A round in which any issue omits `severity`/`claim` (or uses a
value outside the four) is recorded as `contract: partial` and is then judged by
the **stricter** rule — skipping the structure never buys a looser gate.

The verdict gate (Step 4) maps these to NICE/NAUGHTY.

#### Reviewer A: Claude Agent (always runs)

Launch an Agent (subagent_type: `code-reviewer`, model: `opus`) with the full rubric + all files under review. The prompt must include:
- The complete rubric
- All file contents under review
- "You are an independent quality reviewer. You have NOT seen any other review. Your job is to find problems, not to approve."
- The severity contract above, verbatim: every entry in `critical_issues` carries a `claim` and a `severity`, and only an issue whose concrete failure you can write out in `failure_scenario` may be called a blocker
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
VERDICT_EXIT=$?
if [ "$VERDICT_EXIT" -ne 0 ]; then
  echo "[santa] verdict failed (exit $VERDICT_EXIT) — the round was NOT transitioned to FINAL." 1>&2
  echo "[santa] 75=ledger lock busy (retry shortly), 2=usage/ledger error. Do NOT push and do NOT" 1>&2
  echo "[santa] open another round: neither NICE nor NAUGHTY was decided." 1>&2
  exit "$VERDICT_EXIT"
fi

VERDICT=$(echo "$VERDICT_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).verdict)')
FAILING=$(echo "$VERDICT_JSON" | node -e 'process.stdout.write((JSON.parse(require("fs").readFileSync(0,"utf8")).failing||[]).join(", "))')
CONTRACT=$(echo "$VERDICT_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).contract||"")')
BLOCKING_N=$(echo "$VERDICT_JSON" | node -e 'process.stdout.write(String((JSON.parse(require("fs").readFileSync(0,"utf8")).blocking||[]).length))')
SUPPRESSED_N=$(echo "$VERDICT_JSON" | node -e 'process.stdout.write(String((JSON.parse(require("fs").readFileSync(0,"utf8")).suppressed||[]).length))')
ENTRIES_N=$(echo "$VERDICT_JSON" | node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).entries||0))')
```

**The gate reads merged, deduplicated blocking issues — not the reviewer's
`verdict` string.** A round is NICE only when all three hold: zero blocking
issues, at least two distinct reviewer ids, and — whenever the round did not
earn the mitigation — the current all-PASS rule as well. The mitigation (ignoring
the `verdict` string and looking only at blocking count) applies solely when
`contract` is `full`; a `partial` round keeps the all-PASS requirement **on top
of** the other two. Neither the blocking gate nor the two-reviewer requirement
can be switched off; `MCCP_SANTA_SEVERITY_GATE=off` turns off only the
mitigation.

The exit-code branch above is load-bearing for the same reason Step 5.5's is: on
exit 75 (ledger lock busy) `$VERDICT_JSON` is empty, every parse below throws, and
`$VERDICT` ends up an empty string that matches neither branch — "prose says HALT,
code proceeds" with no verdict at all.

Print the mismatches and the per-reviewer counts — they are the point of the
measurement, and nothing else surfaces them:

```bash
# `blocking` is what the gate ACTUALLY counted — issues the ledger has already
# closed are subtracted from it. Print the raw number beside it so the narrowing
# is visible on screen rather than only in the JSON.
echo "contract=$CONTRACT blocking=$BLOCKING_N raw=$((BLOCKING_N + SUPPRESSED_N)) suppressed=$SUPPRESSED_N ledger_entries=$ENTRIES_N"
echo "$VERDICT_JSON" | node -e '
  const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
  Object.keys(j.byReviewer||{}).forEach(function(id){
    const s=j.byReviewer[id];
    console.log("[reviewer] "+id+" findings="+s.findings+
      " structured="+s.structured+" blocking="+s.blocking);
  });
  (j.mismatches||[]).forEach(function(m){
    console.log("[mismatch] "+m.id+" reviewerVerdict="+m.reviewerVerdict+
      " blocking="+m.blocking+" kind="+m.kind);
  });
  (j.suppressed||[]).forEach(function(s){
    console.log("[suppressed] "+s.issueId+" kind="+s.kind+" judged in round "+s.entryRound+
      " :: "+String(s.claim).slice(0,80));
    if (s.kind === "absorbed-rereported") {
      console.log("             ^ a reviewer raised this again AFTER it was recorded as fixed — " +
        "your fix may not have worked. If you agree, reopen it and the round counts it again.");
    }
  });
  if (j.niceBySuppression) {
    console.log("[santa] this round is NICE only because the ledger closed issues that were " +
      "raised again. Read the [suppressed] lines above before pushing.");
  }
  const L=j.ledger||{};
  if (L.malformed) console.log("[ledger] "+L.malformed+" unreadable row(s) — they suppress nothing and excuse nothing.");
  if (L.duplicates) console.log("[ledger] "+L.duplicates+" duplicate row(s) — the fold keeps the last one.");
  const c=j.carryOver||{};
  console.log("[carryOver] suppressed="+c.suppressed+" resolvedAbsent="+c.resolvedAbsent+
    " newBlocking="+c.newBlocking);'
```

`raw` is `blocking + suppressed`: before this milestone the two were the same
number, and they still are for a ledger with no judgements in it. A `[suppressed]`
line means a reviewer raised an issue the ledger had already closed — the round no
longer burns on it, and the line is the only place that fact surfaces.

`[carryOver]` is measurement, not a gate. `resolvedAbsent` counts issues you closed
that this round did not raise at all; `newBlocking` counts issues this round raised
that the previous one did not. Both staying high across consecutive rounds is the
signature of reviewers **rewording** the same defect — the issue identity is the
normalized claim, so a reworded claim is a different issue and is not suppressed.
There is no threshold here and none is coming: the two numbers expose the pattern,
reading it is yours.

`[reviewer]` lines carry the downgrade ratio: `findings - blocking` is how much a
reviewer raised that the gate gave no weight to. A reviewer whose `structured`
count keeps trailing its `findings` count is not complying with the schema, and a
reviewer whose `blocking` is always 0 while `findings` climbs is the signal the
PRD wants measured — neither is fixed by loosening the gate.

A `fail-without-blocking` line is a reviewer who returned `FAIL` while raising
nothing that qualifies as a blocker; `pass-with-blocking` is the reverse, and
there the blocking issue wins (the round is NAUGHTY). A `contract` stuck at
`partial` round after round is not a reason to loosen the threshold — it means
the reviewer prompt needs rewriting.

- **NICE** → proceed to Step 5.5, then Step 6 (push)
- **NAUGHTY** → `$FAILING` names the reviewers whose issues blocked (empty when the round failed only for lack of two distinct reviewers). Merge the blocking issues from both reviewers, deduplicate, proceed to Step 5

### Step 5: Fix Cycle (NAUGHTY path)

1. Display all critical issues from both reviewers — blocking ones first, then the rest
2. Fix every **blocking** issue (`CRITICAL`/`HIGH` with a substantive `failure_scenario`) — change only what was flagged, no drive-by refactors. `MEDIUM`/`LOW` and anything downgraded for a missing failure scenario are **not** fixed here and are **not** discarded either: they stay in the ledger and in the report, and go to `.claude/plans/codex-findings-backlog.md` if they are worth keeping (CLAUDE.md §3.14 sets the same threshold for every review surface in this repo)
3. Commit all fixes in a single commit:
   ```
   fix: address santa-loop review findings (round N)
   ```
4. **Record a judgement for every blocking issue of this round.** This is not optional bookkeeping: the next `begin-round` refuses to open while any of them is unjudged (`SANTA_ADJUDICATION_INCOMPLETE`, exit 2, cap untouched), so skipping it stops the loop rather than speeding it up. Take the ids from the `blocking[].issueId` values Step 4 printed:

   ```bash
   node "$SANTA" adjudicate --decision "$DECISION" --round "$ROUND" \
     --issue "<issueId>" --disposition absorbed --evidence "<what you changed and where>"
   ```

   | disposition | when | what `--evidence` must carry |
   |---|---|---|
   | `absorbed` | you fixed it | proof of the fix — the commit, the file and line, what now happens instead |
   | `rejected` | it is not a defect | why the reviewer is wrong, concretely |
   | `skipped` | you are not deciding now | why not. It does **not** close the issue: the next round still counts it as blocking |
   | `reopened` | an earlier judgement was wrong | why. The issue starts counting again from the next round |

   `--evidence` goes through the same substantiveness check a blocking `failure_scenario` does, so `"fixed"` is refused. `--claim` and `--severity` are not flags — they come from the ledger row, so the stored judgement cannot drift from the issue it judges.

   A judgement takes effect from the **next** round: re-running `verdict` on this round returns the same result it already returned. That is deliberate — otherwise recording "absorbed" and asking again would reach NICE with no reviewer ever looking at the fix.

5. Return to Step 3 with **fresh reviewers** (no memory of previous rounds). Step 3's `begin-round` decides whether another round may open — this step never makes that call itself.

When `begin-round` refuses, print and stop. Do NOT push.

```
SANTA LOOP ESCALATION (round cap reached)

Cap: MCCP_SANTA_ROUND_CAP (default 3)
Remaining issues:
- [list all unresolved critical issues from both reviewers]

Manual review required before proceeding.
```

### Step 5.5: Seal (NICE path, **before** push)

Seal the loop into a `mccp-santa-review` receipt before anything irreversible happens. Everything the seal needs — rounds, aggregate counts, verdict — is settled at Step 4, so moving it ahead of the push costs no information and makes slug rejection and lock contention surface while they are still recoverable.

```bash
SEAL_JSON=$(node "$SANTA" seal --decision "$DECISION")
SEAL_EXIT=$?
if [ "$SEAL_EXIT" -ne 0 ]; then
  echo "[santa] seal failed (exit $SEAL_EXIT) — NOT pushing. 2=slug/usage, 75=ledger lock busy (retry)." 1>&2
  exit "$SEAL_EXIT"
fi

SEAL_VERDICT=$(echo "$SEAL_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).verdict||"")}catch{process.stdout.write("")}')
if [ "$SEAL_VERDICT" != "converged" ]; then
  echo "[santa] sealed verdict is '${SEAL_VERDICT:-<unreadable>}', not 'converged' — NOT pushing." 1>&2
  echo "[santa] Step 4 read NICE but the seal disagreed. The receipt is the audit anchor, so it wins:" 1>&2
  echo "[santa] pushing here would ship under a receipt that records non-convergence." 1>&2
  exit 1
fi
```

`--decision "$DECISION"` is **required**: without it `seal` re-derives the slug itself and can disagree with the scope Step 0 fixed. The conditional is part of the contract, not decoration — capturing `SEAL_EXIT` without branching on it would let a failed seal be followed by a push, which is exactly the "prose says HALT, code proceeds" defect this repo keeps finding. An unsealed push is a ship with no instrumentation, and UI14 forbids it.

**Both branches are load-bearing, and they check different things.** `SEAL_EXIT` answers "did the seal complete?"; `SEAL_VERDICT` answers "what did it seal?" A seal can succeed (exit 0) while recording `divergent`, and branching on the exit code alone would push under an anchor that says the review did not converge — the same class of defect one layer up. Step 4's NICE is a read of the final round; the sealed verdict is derived from the whole ledger (round count, the recorded round verdict, distinct reviewer ids), so a disagreement means the ledger does not support what Step 4 read — an empty ledger, a final round that is not NICE, or fewer than two distinct reviewers.

The seal deliberately does **not** re-gate on the reviewers' `verdict` strings. Those stopped being a judgment input at Step 4 (a `FAIL` raising nothing blocking leaves the round NICE by design), so a seal that still failed on them would not be "stricter" — it would be answering a different question and contradicting the gate, which is exactly what it did before santa-adjudication M1 fixed it. What the seal keeps is the axis it can check independently: two distinct reviewer ids, counted a second time from the ledger.

`$SEAL_JSON` carries `reportPath` / `proofPath` / `receiptPath` / `verdict`; Step 7 reports them.

### Step 6: Push (NICE path)

When both reviewers return PASS **and** Step 5.5 sealed successfully:

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
