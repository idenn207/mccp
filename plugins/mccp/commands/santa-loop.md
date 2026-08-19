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

**Fix the scope as a machine-readable value.** Step 3 hands this list to the blind
lane, and the judgement of *what* is in scope stays here — the CLI receives the list,
it never derives one (DD11). Without a single variable the two steps would each
answer "what is under review?", and that is the seam where they can disagree.

```bash
# The single source of scope. If $ARGUMENTS named paths or globs, build the array
# from those instead — the decision is the same prose as above; the only change is
# that the result is pinned to one value that Step 3 passes as --paths-file.
SCOPE_PATHS_JSON=$(git diff --name-only HEAD | node -e '
  const lines=require("fs").readFileSync(0,"utf8").split(/\r?\n/).filter(Boolean);
  process.stdout.write(JSON.stringify(lines));')
```

An empty array means nothing changed; `lanes` rejects it in Step 3 and no round opens.
A run with nothing to review should not launch reviewers. **M2's always-on scope
(plan/PRD files regardless of diff) lands by adding to this variable** — that is what
keeps the join point single.

**Always-on scope (M2).** The relationship between a plan and the PRD it declares is an
invariant, and an invariant whose two halves are never in scope together cannot be
checked — that is exactly what #125 measured. `scope-always` derives the closure
(this decision's plans plus the Source PRD each one declares) and this step merges it
in. The CLI *offers* candidates; the merge happens here, so `SCOPE_PATHS_JSON` keeps a
single producer (M1 DD11).

```bash
# First use of the temp dir in this file. The lane block in Step 3 reuses the name, so
# a definition placed there would expand to empty here — the paths file would land
# outside the repo and the round would stop at containment instead of at the thing
# that was actually wrong.
TMPDIR_SANTA=".claude/state/santa-loop/tmp"      # gitignored with the ledger
mkdir -p "$TMPDIR_SANTA"
printf '%s' "$SCOPE_PATHS_JSON" > "$TMPDIR_SANTA/scope-diff.json"

ALWAYS_JSON=$(node "$SANTA" scope-always --decision "$DECISION" \
  --paths-file "$TMPDIR_SANTA/scope-diff.json")
ALWAYS_EXIT=$?
if [ "$ALWAYS_EXIT" -ne 0 ]; then
  echo "[santa] scope-always failed (exit $ALWAYS_EXIT) — NOT launching reviewers." 1>&2
  echo "[santa] A round with no always-on scope looks identical to a pre-M2 run," 1>&2
  echo "[santa] so this axis does not degrade to the diff-only scope (DD3)." 1>&2
  exit "$ALWAYS_EXIT"
fi
```

**Ask whether the output PARSED before reading anything out of it.** `paths` missing and
`paths` empty are different facts, and pulling the array first collapses them: a parse
failure would yield the same empty value as a legitimately unchanged scope, and the
round would proceed on the diff-only scope while looking exactly like a normal M2 run.
This is the same check, for the same reason, as `HAS_ASSIGNMENT` in Step 3 — and the
order is the contract.

**Those two facts also need different exits.** `paths` *absent* is a broken producer and
stops the round here. `paths` *present but empty* is the ordinary "nothing changed" case
this step already described above — it belongs to Step 3, where `lanes` rejects the empty
array and says so in those terms. Collapsing them into one error moves the stop two steps
early and reports a parse failure that did not happen.

```bash
PATHS_STATE=$(echo "$ALWAYS_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(!Array.isArray(j.paths)?"absent":(j.paths.length>0?"ok":"empty"))}catch{process.stdout.write("absent")}')
if [ "$PATHS_STATE" = "absent" ]; then
  echo "[santa] scope-always exited 0 but emitted no usable paths array." 1>&2
  echo "[santa] NOT launching reviewers: reading this as \"nothing to add\" would" 1>&2
  echo "[santa] disguise a parse failure as a normal zero-addition run (DD3)." 1>&2
  exit 1
fi
if [ "$PATHS_STATE" = "empty" ]; then
  echo "[santa] nothing to review: the diff is empty and the always-on axis added" 1>&2
  echo "[santa] nothing (mode=off, or no plan resolved). No round opens." 1>&2
  exit 0
fi

# From here the fields are known to be present. Replacing SCOPE_PATHS_JSON is the merge.
SCOPE_PATHS_JSON=$(echo "$ALWAYS_JSON" | node -e 'process.stdout.write(JSON.stringify(JSON.parse(require("fs").readFileSync(0,"utf8")).paths))')
CONSISTENCY_RUBRIC_ROW=$(echo "$ALWAYS_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).rubricRow||"")}catch{process.stdout.write("")}')
```

Surface what the axis did on every run. This is M2's observation surface (a) — the
receipt does **not** seal it (DD7), so a round that added nothing is only distinguishable
from a pre-M2 round here, in the terminal:

```bash
echo "$ALWAYS_JSON" | node -e '
  const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
  const e=process.stderr;
  e.write("[santa] always-on scope: mode="+j.mode+" added="+j.added.length+
          " pairs="+j.pairs.length+" unresolved="+j.unresolved.length+
          " truncated="+j.truncated+"\n");
  j.added.forEach(function(p){ e.write("[santa]   + "+p+"\n"); });
  j.pairs.forEach(function(p){ e.write("[santa]   pair "+p.plan+" -> "+p.prd+"\n"); });
  j.unresolved.forEach(function(u){ e.write("[santa]   unresolved "+u.plan+": "+u.reason+"\n"); });
'
```

An `unresolved` entry is **not** a failure. A free-form plan with no `**Source PRD**`
declaration, or one pointing at a PRD that has since been archived, is ordinary input —
it is dropped from scope and named here rather than handed to a reviewer as a broken
pointer (DD4). `mode=off` means the axis is switched off entirely: `added` is empty,
`CONSISTENCY_RUBRIC_ROW` is empty, and no plan file was opened.

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

**The always-on consistency row is appended by the shell, not written by you (M2).** The
whole of this axis is that one paragraph, and a criterion whose text drifts between rounds
cannot be replayed: "what was actually asked of the reviewer?" stops having an answer. It
is a constant in `scope-always.js` (`CONSISTENCY_RUBRIC`) for the same reason
`DO_NOT_TRUST_NARRATIVE` is one in `lanes.js` — so **do not retype it, do not summarize
it, and do not put the criterion in the rubric you author.** Step 3 appends
`$CONSISTENCY_RUBRIC_ROW` to the rubric file mechanically and then verifies it landed.

Author the rest of the rubric as usual; the consistency row will be added below it:

| Criterion | Pass Condition |
|-----------|---------------|
| Plan/PRD consistency | *(appended verbatim by Step 3 from `$CONSISTENCY_RUBRIC_ROW` — do not author this cell)* |

An empty `$CONSISTENCY_RUBRIC_ROW` means `MCCP_SANTA_ALWAYS_SCOPE=off`, and then the row
is omitted — scope additions and the rubric row ride the same switch (DD5). Instructing a
reviewer to cross-check a PRD that is not in scope is not a stricter review; it asks for a
FAIL that cannot be grounded in anything the reviewer was given.

Keep the full rubric text in one place: Step 3 writes it to a file and passes it to
`lanes --rubric-file`, which is the only path by which the **blind** reviewer receives it.

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

#### Resolve the evidence lanes (santa-evidence-diversity M1)

Before launching, ask the oracle which reviewer runs **blind** — pointer only, no file
bundle and no pre-summary (UI3/UI4). A failure of this axis does not look like an
error: it looks like an ordinary run, identical to one from before M1 existed. So no
layer here proceeds on partial success.

```bash
# Re-assert the constant rather than inheriting it. Step 1 defines the same value, but
# `mkdir -p` only covers a MISSING DIRECTORY — it does not cover an EMPTY VARIABLE, and
# those are different failures. If this block ever runs without Step 1's assignment in
# scope, `mkdir -p ""` fails while the pipeline masks its status and the printf below
# lands at the filesystem root; the round then stops at containment, one step away from
# what was actually wrong. The assignment is an idempotent constant, so paying for it
# twice costs nothing and removes the dependency.
TMPDIR_SANTA=".claude/state/santa-loop/tmp"      # gitignored with the ledger
mkdir -p "$TMPDIR_SANTA"
# $SCOPE_PATHS_JSON comes from Step 1. If this file ever loses that definition the
# printf writes an empty file, cmdLanes rejects the empty array, and the round stops —
# fail-closed, though the cause then surfaces one step away from its origin.
printf '%s' "$SCOPE_PATHS_JSON" > "$TMPDIR_SANTA/lane-paths-$ROUND.json"

# The rubric built in Step 2, written out in full. `--rubric-file` is the ONLY path by
# which the blind reviewer receives the rubric: it gets no file bundle by design, so a
# rubric that lives only in the bundled reviewer's context is a rubric half the panel
# never saw. Omit the flag entirely when the rubric is empty.
#
# The heredoc is quoted, so NOTHING inside it expands — write the criteria you authored
# in Step 2 and STOP THERE. The consistency row is appended by the block below.
cat > "$TMPDIR_SANTA/rubric-$ROUND.md" << 'EOF'
<the full rubric from Step 2 — criteria table and all, WITHOUT the consistency row>
EOF

# Append the always-on consistency row mechanically. Writing it by hand is the one way
# this axis can go missing while every mechanical signal still reads green: `lanes` does
# not inspect rubric content, so a row that says "$CONSISTENCY_RUBRIC_ROW" literally —
# which is exactly what the quoted heredoc above would preserve — reaches the reviewer as
# an unusable criterion, at exit 0, with `## Rubric` present. Half of M2 (DD5: scope and
# rubric are one axis) would be undelivered and indistinguishable from a good round. So
# the shell appends it, and then proves it landed.
if [ -n "$CONSISTENCY_RUBRIC_ROW" ]; then
  printf '\n| Plan/PRD consistency | %s |\n' "$CONSISTENCY_RUBRIC_ROW" \
    >> "$TMPDIR_SANTA/rubric-$ROUND.md"
  if ! grep -qF 'working tree' "$TMPDIR_SANTA/rubric-$ROUND.md"; then
    echo "[santa] the consistency row did not land in the rubric file." 1>&2
    echo "[santa] NOT launching reviewers: a blind reviewer given a rubric without it" 1>&2
    echo "[santa] cannot check the plan/PRD relation, and the round would look normal." 1>&2
    exit 1
  fi
fi

LANES_JSON=$(node "$SANTA" lanes --decision "$DECISION" \
  --paths-file "$TMPDIR_SANTA/lane-paths-$ROUND.json" \
  --rubric-file "$TMPDIR_SANTA/rubric-$ROUND.md")
LANES_EXIT=$?
if [ "$LANES_EXIT" -ne 0 ]; then
  echo "[santa] lanes failed (exit $LANES_EXIT) — no lane assignment." 1>&2
  echo "[santa] NOT launching reviewers: without an assignment a zero-blind round" 1>&2
  echo "[santa] would succeed silently, and record would reject it at exit 2 anyway," 1>&2
  echo "[santa] throwing away the round's tokens." 1>&2
  exit "$LANES_EXIT"
fi

# Ask whether the output PARSED before reading blindId. Pulling blindId first makes
# `off` (normal) and a parse failure (broken) both yield an empty string — the
# discriminator is the presence of `assignment`, and this check is it. The order is
# the contract: placing it after blindId re-opens the gap it closes.
HAS_ASSIGNMENT=$(echo "$LANES_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j&&typeof j.assignment==="object"&&j.assignment!==null?"1":"0")}catch{process.stdout.write("0")}')
if [ "$HAS_ASSIGNMENT" != "1" ]; then
  echo "[santa] lanes exited 0 but emitted no assignment — the lane map could not be read." 1>&2
  echo "[santa] NOT launching reviewers. Reading this as off would disguise a failure" 1>&2
  echo "[santa] as a normal zero-blind run (DD11)." 1>&2
  exit 1
fi
# From here an empty $BLIND_ID means exactly one thing: mode=off.
BLIND_ID=$(echo "$LANES_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).blindId||"")}catch{process.stdout.write("")}')
BLIND_PROMPT=$(echo "$LANES_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).prompt||"")}catch{process.stdout.write("")}')
```

**Both reviewer sections below branch on `$BLIND_ID` and nothing else.** Each uses the
same sentence: *if this reviewer's id equals `$BLIND_ID`, send `$BLIND_PROMPT` in place
of the file bundle; otherwise keep the current bundled prompt.* Asking "am I the blind
one?" separately inside each section would let mode `a`/`b` be interpreted twice, and
two interpretations that disagree produce zero or two blind lanes. When `$BLIND_ID` is
empty both take the bundled path — that is `off`, and it is the only legitimate route
to a zero-blind round.

The two sections stay **symmetric**: `codex`'s `-C "$(pwd)"` and the model selection are
unchanged (UI10). The only thing that varies is whether file contents ride in the prompt.

The blind prompt is **not assembled here** (DD4). The CLI emits it, so the honest path
is also the cheapest one.

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
      "evidence": "path:line or a quote",      // optional, string, 0..500 chars
      "locations": [                           // optional, ≤20 items — where the issue lives
        { "file": "repo/relative/path.js",     //   required per entry, 1..300 chars
          "line": 212 } ] }                    //   optional per entry, positive integer
    // A bare string is still accepted (legacy form), but see the severity contract below.
  ],
  "suggestions": ["…"] }
```

**Location contract.** `locations` says **where** the issue is, and nothing more.
Give the repo-relative path, plus a line number when you have one. Do not
characterise the code you are pointing at — whether it is new, whether someone
else wrote it, whether it came from an earlier round — and do not draw any
conclusion from the location. Those judgements are made downstream by the
aggregation step, which compares your paths against the repository itself; a
reviewer's own assertion about them would be unverifiable and is ignored.

Omitting `locations` is allowed and costs your issue nothing: a bad type or a
malformed entry is dropped without downgrading the issue, and an issue with no
usable location is simply treated as unclassifiable. But an unclassifiable issue
carries no information for the aggregation step, so give the field when you can.

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

**Lane branch (M1).** If `A` equals `$BLIND_ID`, do **not** include the file contents:
send `$BLIND_PROMPT` in place of the bundle, keeping the rubric and the severity
contract. Otherwise use the bundled prompt exactly as described above.

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

**Lane branch (M1).** Same single sentence as Reviewer A: if `B` equals `$BLIND_ID`,
`$BLIND_PROMPT` replaces the file contents in `$PROMPT_FILE`; otherwise the bundle
stays. The CLI invocation, sandbox flags, and model selection do not change (UI10).

In all cases, the reviewer must return the same structured JSON verdict as Reviewer A.

#### Record each reviewer into the ledger

Write each reviewer's **unmodified** JSON to a repo-internal temp file and hand it to the CLI. The reviewer contract above is untouched — `id` and `model` are values the caller already knows, and the CLI does the conversion:

```bash
# $TMPDIR_SANTA was defined in Step 1 (M2); mkdir stays for idempotence.
mkdir -p "$TMPDIR_SANTA"

# Reviewer A
cat > "$TMPDIR_SANTA/reviewer-$ROUND-A.json" << 'EOF'
... Reviewer A's structured JSON, verbatim ...
EOF
node "$SANTA" record --decision "$DECISION" --round "$ROUND" \
  --id A --model opus --reviewer-file "$TMPDIR_SANTA/reviewer-$ROUND-A.json" \
  --lane "$(echo "$LANES_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).assignment.A||"")}catch{process.stdout.write("")}')"

# Reviewer B — identical shape; the lane comes from the same assignment, never typed
# by hand. Both are shown because mode `b` inverts them, and one example gives no
# form to copy for the other.
cat > "$TMPDIR_SANTA/reviewer-$ROUND-B.json" << 'EOF'
... Reviewer B's structured JSON, verbatim ...
EOF
node "$SANTA" record --decision "$DECISION" --round "$ROUND" \
  --id B --model "<reviewer B model string>" --reviewer-file "$TMPDIR_SANTA/reviewer-$ROUND-B.json" \
  --lane "$(echo "$LANES_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).assignment.B||"")}catch{process.stdout.write("")}')"
```

`--lane` is **required** and is re-derived by the CLI from `MCCP_SANTA_BLIND_LANE`; a
value that disagrees with the assignment is rejected at exit 2 and the round stays open
for a re-record. What this checks is that the command body cannot improvise a lane
outside the oracle. What it does **not** check is whether the reviewer declared blind
actually received no bundle — nothing in a shell can observe what reached the model, and
M1 claims no forgery prevention (DD4); verification of that is left to outcome
distribution (UI7).

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
- **NAUGHTY** → `$FAILING` names the reviewers whose issues blocked (empty when the round failed only for lack of two distinct reviewers). Merge the blocking issues from both reviewers, deduplicate, proceed to Step 4.5

### Step 4.5: Termination Check (NAUGHTY path, **before** the fix cycle)

Round N's fix becomes round N+1's first-class target, and a loop in that state
does not end on its own — it ends at the cap, which is a truncation, not a
convergence. This step asks one question of round `$ROUND`: did **every**
surviving blocking issue point at the patch the previous round committed? If so
the loop is chasing its own patch and stops here.

The judgement is mechanical and it is not the reviewers'. `check-termination`
compares each issue's `locations` against the previous round's fix commit, and
the comparison has **two tiers**: an entry that carries a `line` must fall inside
one of that file's hunk ranges, while an entry with only a `file` matches on the
file alone. An issue with no usable location at all — or one naming a file the
patch never touched — falls to `unknown` or `preexisting`, and a single
`unknown` or `preexisting` leaves the loop running. It also refuses to claim a
run the cap was about to end anyway, so the two exit reasons stay mutually
exclusive.

The file-only tier is a deliberate trade-off, not an oversight, and it is the
weakest link in this step: requiring a line would drop most issues to `unknown`
and the terminator would never fire, but matching on the file alone means a
genuine pre-existing defect that happens to live in a file the last patch touched
is read as patch-chasing. The all-issues condition bounds it — one issue pointing
elsewhere keeps the loop running — and a wrong termination costs a round, not an
approval: the seal records `divergent`, the unresolved issues are printed below,
and `MCCP_SANTA_TERMINATOR=off` reopens the loop. Give a `line` when you have one
and the tier never applies to your issue.

It runs **before** Step 5, not after: judging after the fix cycle would make the
operator fix, commit and adjudicate a whole round before hearing that the loop
had already ended.

```bash
SANTA_TMP=".claude/state/santa-loop/tmp/$DECISION"
PREV_REV_FILE="$SANTA_TMP/round-$((ROUND-1))-fix-rev.txt"
PREV_REV=""
if [ "$ROUND" -ge 1 ] && [ -s "$PREV_REV_FILE" ]; then
  PREV_REV=$(cat "$PREV_REV_FILE")
fi

# Round N reads the anchor round N-1 wrote (Step 5 below writes it). Round 0 has
# no previous patch, so the flag is **not passed at all** — passing an empty
# string instead would be recorded as a malformed rev and would misreport a
# normal round-0 non-firing as an input error.
if [ -n "$PREV_REV" ]; then
  CHECK_JSON=$(node "$SANTA" check-termination --decision "$DECISION" --prev-fix-rev "$PREV_REV")
else
  CHECK_JSON=$(node "$SANTA" check-termination --decision "$DECISION")
fi
CHECK_EXIT=$?
if [ "$CHECK_EXIT" -ne 0 ]; then
  echo "[santa] check-termination failed (exit $CHECK_EXIT) — no judgement was made." 1>&2
  echo "[santa] The loop is NOT terminated; continue to Step 5 and let the cap bound it." 1>&2
fi

TERMINATE=$(echo "$CHECK_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).terminate?"1":"0")}catch{process.stdout.write("0")}')
CHECK_REASON=$(echo "$CHECK_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason||"fired")}catch{process.stdout.write("unreadable")}')
echo "$CHECK_JSON" | node -e '
  const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
  const b=j.targetsBreakdown||{};
  console.log("[termination] terminate="+j.terminate+" reason="+(j.reason||"fired")+
    " targets: round_n_patch="+(b.round_n_patch||0)+" preexisting="+(b.preexisting||0)+
    " unknown="+(b.unknown||0));' 2>/dev/null || echo "[termination] reason=$CHECK_REASON"

if [ "$TERMINATE" = "1" ]; then
  echo ""
  echo "SANTA LOOP ESCALATION (patch-chasing terminated)"
  echo ""
  echo "Every surviving blocking issue of round $ROUND targeted the patch the previous"
  echo "round committed. Another round would review the fix, not the artifact."
  echo ""
  echo "Unresolved issues:"
  echo "$CHECK_JSON" | node -e '
    const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
    (j.unresolved||[]).forEach(function(u){
      console.log("- ["+(u.severity||"?")+"] "+(u.issueId||"(no id)")+" ("+u.targets+") :: "+
        String(u.claim).slice(0,120));
    });'
  echo ""
  echo "Manual review required before proceeding. To disagree and resume, see the"
  echo "terminator toggle in docs/ENVIRONMENT.md §11 — begin-round then reopens the"
  echo "round and clears the marker."

  SEAL_JSON=$(node "$SANTA" seal --decision "$DECISION")
  SEAL_EXIT=$?
  if [ "$SEAL_EXIT" -ne 0 ]; then
    echo "[santa] terminated, but seal failed (exit $SEAL_EXIT) — escalation stands, audit anchor missing." 1>&2
  fi
  exit 1
fi
```

Three things in that block are load-bearing. `exit 1` must be the last statement
of the firing branch — without it execution falls through to Step 5 and the loop
keeps going after announcing it had stopped. The seal call lives **inside** the
branch, because a patch-chasing exit is one of the loop's real endings and an
unsealed ending is an ending with no instrumentation. And `$SEAL_EXIT` must not
overwrite the exit status: a failed seal is a secondary diagnosis and burying the
primary one (the loop terminated) under it hands the operator the wrong problem —
the same rule the cap-reached block in Step 3 follows.

The shell never reads the terminator's own toggle. `check-termination` resolves
it internally and reports `{terminate:false, reason:"env-off"}` when it is off,
so the code path here is identical either way and `$CHECK_REASON` says why on
screen. A second reading in this file would be a third judgement site, and
judgements that live in two places drift.

### Step 5: Fix Cycle (NAUGHTY path)

1. Display all critical issues from both reviewers — blocking ones first, then the rest
2. Fix every **blocking** issue (`CRITICAL`/`HIGH` with a substantive `failure_scenario`) — change only what was flagged, no drive-by refactors. `MEDIUM`/`LOW` and anything downgraded for a missing failure scenario are **not** fixed here and are **not** discarded either: they stay in the ledger and in the report, and go to `.claude/plans/codex-findings-backlog.md` if they are worth keeping (CLAUDE.md §3.14 sets the same threshold for every review surface in this repo)
3. Commit all fixes in a single commit:
   ```
   fix: address santa-loop review findings (round N)
   ```

   Then record the commit as this round's fix anchor. The next round's Step 4.5
   reads it to learn which hunks its issues may be chasing; guessing the anchor
   (`HEAD` at judgement time, or grepping the commit message) breaks silently the
   moment an unrelated commit, an amend or a squash lands in between. `$ROUND` is
   this round's 0-based index, and the `$DECISION` component keeps two parallel
   loops from overwriting each other's anchor at the same round number:

   ```bash
   mkdir -p ".claude/state/santa-loop/tmp/$DECISION"
   git rev-parse HEAD > ".claude/state/santa-loop/tmp/$DECISION/round-$ROUND-fix-rev.txt"
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
- The loop's **first** ending condition is Step 4.5, not the cap: a round whose surviving blocking issues all point at the previous round's patch ends there, and the ledger records that ending with its own reason so the two endings can be told apart afterwards. The cap is the safety net underneath it, and reaching it is itself recorded as an ending.
- The terminator's kill switch is `MCCP_SANTA_TERMINATOR`, registered in docs/ENVIRONMENT.md §11 alongside the other santa toggles. It turns off both wiring points together — the Step 4.5 judgement and the `begin-round` marker precheck — and that document owns its values, defaults and failure mode.
- Exactly one reviewer runs on the **blind evidence lane** each round: repository root plus target paths, no file bundle and no pre-summary, with a fixed instruction not to treat any handed narrative as fact. The assignment is decided by `santa/lanes.js` and re-checked by `record --lane`, so the command body cannot pick a lane on its own. What that check establishes is that the lane came from the oracle; it does **not** establish that the blind reviewer's prompt truly carried no bundle — no shell can observe what reached a model. Verification of *that* is by outcome distribution (the two lanes' co-missed rate), not by the stamp. Coverage is sealed into the receipt as two present-only integers, `meta.santa_blind_records` and `meta.santa_blind_rounds`; `santa_blind_rounds === santa_rounds` is the mechanical reading of "every round had at least one reviewer that received no bundle".
- The lane kill switch is `MCCP_SANTA_BLIND_LANE` (`a` default / `b` / `off`), registered in docs/ENVIRONMENT.md §11 with the other santa toggles. `off` is the **less strict** direction — it puts both reviewers on the bundled path, which is the pre-M1 behaviour — so the default is the firing side and a malformed value falls back to firing, not to off. An `off` run is still recorded, as `santa_blind_rounds=0`; absence of the field means "written before the lane axis existed", which is a different state from an observed zero. Nothing in M1 *blocks* a zero-blind round: M1 creates and records lanes, and no milestone currently owns enforcement (see the PRD's open question).
- The cap is scoped to the decision slug, which is derived from the branch name. Renaming or switching branches starts a fresh cap (different branch = different review scope). Pass `--decision <slug>` to every subcommand to pin one scope across a rename.
