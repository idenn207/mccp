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

### 0.0 — RECOVER FROM HOOK CONTEXT (v1.3.1, conditional)

The receipt-prompt hook may inject an `mccp_receipt_gate` context block when this command is invoked with a missing-only upstream receipt (v1.3.1 informational path). When that block is present, auto-recover deterministically before the rest of Phase 0 runs. When absent, skip this sub-step entirely.

**Trigger detection.** The hook payload appears as a `<system-reminder>` containing serialized JSON of the form `{"mccp_receipt_gate": {...}}` per `plugins/mccp/scripts/hooks/lib/receipt-context-schema.js`. If you do not see that key in your initial context, skip to 0.1.

**Recovery contract.** When the block is present, execute these checks in order. Any failure stops the response with the indicated message — do NOT silently continue.

1. **Defensive must_not_proceed check.** Read `mccp_receipt_gate.must_not_proceed`. If `true`, the hook would have hard-blocked; the fact that we got here means a contract violation. Output:

   ```
   [MCCP-INFORMATIONAL-STOP] must_not_proceed=true in injected context — hook/command contract mismatch. Run /mccp:trace and report.
   ```

   End the response.

2. **Invariant check on validateResult.** Confirm `missing.length > 0 && stale.length === 0 && blocking.length === 0 && open_critical.length === 0`. If any other partition is non-empty:

   ```
   [MCCP-INFORMATIONAL-STOP] validateResult partition mismatch — informational branch should not have ALLOWed.
   missing=<N> stale=<N> blocking=<N> open_critical=<N>
   ```

   End the response.

3. **Plan body completeness.** Read the plan at `mccp_receipt_gate.planPath` (or `command_args` if null). Verify it contains `## Codex Adversarial Review` and that the section does not list any Open Questions tagged auto-CRITICAL (§0 catalog: security boundary, atomic state, schema breakage). If either fails:

   ```
   [MCCP-INFORMATIONAL-STOP] cannot auto-recover: plan missing Codex Adversarial Review section or has auto-CRITICAL open question.
   Action: run /mccp:plan <plan path> to refresh the gate manually.
   ```

   End the response.

4. **Write the missing receipt.** For each `missing[i]`:

   **In-scope branch first (codex-intent-context M1).** If `missing[i].gate_id` is
   `mccp-plan-codex`, do **NOT** run `cli.js write`. That gate is governed by the
   intent gate, whose decision has no CLI surface by design (a flag there would let
   any shell caller stamp an approving verdict without Codex running). A blind write
   would fail closed with exit 12 and surface as an opaque error. Instead output:

   ```
   [MCCP-INTENT-GATE-STOP] cannot auto-recover a missing mccp-plan-codex receipt.
   That gate is produced by plan-codex-runner.js, which invokes Codex and adjudicates
   every finding in one process — there is no CLI path that can reproduce it.
   Recovery:
     1. Run `/mccp:plan <plan path>` to regenerate the gate properly; OR
     2. Set MCCP_SKIP_INTENT_GATE="<substantive reason>" and re-enter
        /mccp:prp-implement for an audited override (the receipt still seals the
        real blocking verdict, so cross-gate dedupe stays fail-closed).
   ```

   End the response. For every other `gate_id`, the existing blind write is unchanged:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
     --gate <missing[i].gate_id> \
     --decision <mccp_receipt_gate.decisionId> \
     --plan <mccp_receipt_gate.planPath> \
     --quiet
   ```

5. **Re-validate.** Re-run the same validator the hook ran:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate \
     --command mccp:prp-implement \
     --decision <mccp_receipt_gate.decisionId> \
     --plan <mccp_receipt_gate.planPath>
   ```

   If exit ≠ 0:

   ```
   [MCCP-INFORMATIONAL-STOP] post-write revalidation failed (exit=<N>). Inspect via /mccp:trace.
   <stderr from validate>
   ```

   End the response.

6. **Proceed.** Print one info line, then continue with the rest of Phase 0:

   ```
   > Recovered missing receipt(s) for decision="<decisionId>" via informational hook context. Continuing.
   ```

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
GITDIR=$(git rev-parse --git-dir)   # worktree-safe (§3.8 — .git는 worktree에서 파일); Phase 2.5.5b와 동형
mkdir -p "$GITDIR/mccp/tmp"
# v0.3.6 Task 8 (축 1 wire-up) — emit --impeccable-available when impeccable
# detected AND MCCP_CODEX_DESIGN_SCOPE_HONOR != 0. Wrapper then prepends
# DESIGN_SCOPE_PREAMBLE so Codex stays scoped to security/correctness/perf.
IMPECCABLE_FLAG=$(node -e "
const honored = require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/env-contract/value')
  .parseBool(process.env, 'MCCP_CODEX_DESIGN_SCOPE_HONOR');
const detect = require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect');
process.stdout.write(honored && detect.probeSkillAvailable({}) ? '--impeccable-available' : '');
" || echo "")
CODEX_STDOUT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js" adversarial-review \
  --focus "challenge the following implement-time decisions: <bullet list from 2.5.2>" \
  --timeout-ms 900000 \
  --json $IMPECCABLE_FLAG 2> "$GITDIR/mccp/tmp/codex-invoke.stderr")
CODEX_EXIT=$?
CODEX_BLOCKING=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.blocking?"1":"0")}catch{console.log("1")}' "$CODEX_STDOUT")
CODEX_CLASS=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.classification||"unknown")}catch{console.log("parse-error")}' "$CODEX_STDOUT")

if [ "$CODEX_EXIT" != "0" ] || [ "$CODEX_BLOCKING" = "1" ] || { [ "$CODEX_CLASS" != "ok" ] && [ "$CODEX_CLASS" != "disabled" ]; }; then
  if [ "${MCCP_ALLOW_CODEX_UNAVAILABLE:-0}" = "1" ]; then
    echo "[mccp] Codex unavailable in advisory mode (class=$CODEX_CLASS exit=$CODEX_EXIT)"
    # Write '> Codex unavailable, skipped (auto-fallback): <class>' into the review section and jump to 2.5.6.
    # Receipt will record advisory=true → downstream validator treats as non-approving.
  else
    echo "[MCCP-GATE-STOP] Codex unavailable (blocking=$CODEX_BLOCKING class=$CODEX_CLASS exit=$CODEX_EXIT)."
    echo "Set MCCP_ALLOW_CODEX_UNAVAILABLE=1 to proceed in advisory mode (non-approving receipt)."
    exit 1
  fi
elif [ "$CODEX_CLASS" = "disabled" ]; then
  # v0.3.5 — MCCP_CODEX_DISABLED=1 first-class skip. No advisory env required.
  # Receipt write at 2.5.6 auto-stamps meta.codex_disabled=true via env detection.
  echo "[mccp] Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class)"
  # Write '> Codex skipped per MCCP_CODEX_DISABLED=1' into the review section and jump to 2.5.6.
fi

# v1.20.3 (Task 5) — derive $CODEX_VERDICT, the REAL Implement-Codex verdict, for
# the 2.5.6 receipt-write. DEDICATED variable: NEVER reuse the design-critique
# loop's $VERDICT / $RECEIPT_VERDICT. A converged design critique must not
# over-stamp a divergent Codex review — that reintroduces the P1 cross-gate
# false-skip bug. Cross-gate dedupe (dedupe.js#evaluateForDedupe) fail-closes on
# any value other than 'converged'.
CODEX_VERDICT=""
if [ "$CODEX_CLASS" = "disabled" ]; then
  CODEX_VERDICT="skipped"          # MCCP_CODEX_DISABLED=1 env policy — Codex never ran
elif [ "$CODEX_EXIT" != "0" ] || [ "$CODEX_BLOCKING" = "1" ] || [ "$CODEX_CLASS" != "ok" ]; then
  CODEX_VERDICT="unavailable"      # advisory-mode auto-fallback (non-approving)
else
  # class=ok — read the STRUCTURED verdict (`.result.verdict`) out of the wrapper
  # JSON's `.stdout`, via the shared codex-review-payload oracle that the PR gate
  # also uses. Free-text scanning is the FALLBACK only.
  #
  # v1.22.3 M3 follow-up (F5) — this used to call codex-bridge.parseVerdict
  # directly: a free-TEXT keyword scan that does not know the structured
  # vocabulary (`approve` | `needs-attention`) and whose /\bconverged\b/ rule
  # matches the word anywhere in the prose. Because resolution.codex_verdict is
  # the cross-gate dedupe input, a false 'converged' here plus one on the plan
  # receipt makes /mccp:pr skip PR-Codex entirely — dual review bypassed.
  CODEX_VERDICT=$(node -e '
    const payload = require("'"${CLAUDE_PLUGIN_ROOT}"'/scripts/lib/codex-review-payload");
    let envelope = null;
    try { envelope = JSON.parse(process.argv[1] || "{}"); } catch (_) {}
    const g = payload.deriveGateVerdict({
      envelope: envelope,
      freeText: (envelope && envelope.stdout) || "",
    });
    if (g.source !== "structured") {
      process.stderr.write("[mccp:implement-codex] verdict source=" + g.source +
        " (no structured .result.verdict; free-text fallback)\n");
    }
    process.stdout.write(g.verdict);
  ' "$CODEX_STDOUT")
fi
```

After Phase 2.5.4's YAGNI triage loop: if it annotated `Open Questions: DIVERGENT_UNRESOLVED`, set `CODEX_VERDICT="divergent"` (overriding the parsed value) so the receipt records the unresolved divergence. This is the ONLY triage-driven override.

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

Read the cap from the shared oracle — do NOT hardcode a literal here. This gate
has no child-process export point (unlike `pr.md`, which hands the value to
codex-runner), so the value lands in `$ROUND_CAP` and the round loop's entry
condition reads it (review-loop-bypass M1):

```bash
ROUND_CAP_JSON=$(node -e '
  const {effectiveRoundCap}=require(process.argv[1]+"/scripts/lib/review-single-pass");
  process.stdout.write(JSON.stringify(effectiveRoundCap(process.env)));
' "${CLAUDE_PLUGIN_ROOT}")
ROUND_CAP=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).cap))}catch{process.stdout.write("1")}' <<<"$ROUND_CAP_JSON")
node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(j.pinned)process.stderr.write("[mccp:single-pass] round cap pinned to "+j.cap+" by MCCP_REVIEW_SINGLE_PASS="+j.reason+"\n")}catch(_){}' <<<"$ROUND_CAP_JSON"
```

Repeat up to `$ROUND_CAP` rounds (default `1`, allowed `1`/`2`/`3`). Beyond the cap,
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

### 2.5.5b — impeccable design gate (자동, /mccp:prp-implement 진입 시 MANDATORY, v0.2.6 Milestone 1 · v1.3.0-m2 3-axis trigger)

Pre-flight detection — `implement` mode reads git diff for UI extensions + `.claude/design/*.design.plan.md` changes + design-gate control-plane whitelist:

```bash
DETECT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect \
  --mode implement \
  --json)
SKILL_AVAIL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.skill_available?"1":"0")}catch{process.stdout.write("0")}')
# v1.31.3 M3 — the call form is RESOLVED, never hardcoded. The plugin channel
# registers the skill as <pluginName>:<skillDirName>, so a hardcoded bare name
# reaches unknown_skill for every plugin-only install; the oracle already knows
# which body opens, so ask it.
#
# The carrier the LLM reads is the stderr LINE below, not this shell variable:
# shell state does not survive a tool-call boundary, so a prompt that said
# "use $IMPECCABLE_INVOCATION" would be read as an empty name.
#
# Exactly one line, exactly this shape. Its absence is meaningful — see the
# call-form rule in the prose below.
IMPECCABLE_INVOCATION=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.impeccable_invocation||"")}catch{process.stdout.write("")}')
if [ -n "$IMPECCABLE_INVOCATION" ]; then
  echo "[mccp:impeccable] call-form: Skill($IMPECCABLE_INVOCATION, ...)" 1>&2
fi
SIGNAL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.design_signal?"1":"0")}catch{process.stdout.write("0")}')
DETECT_REASON=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason||"unknown")}catch{process.stdout.write("parse-error")}')
# v1.3.0 M1 — silent-skip surface. detect() now emits silent_skip
# (SKILL_AVAIL=1 + SIGNAL=0) so the silent fall-through path is observable.
SILENT_SKIP=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.silent_skip?"1":"0")}catch{process.stdout.write("0")}')
SILENT_SKIP_REASON=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.silent_skip_reason||"")}catch{process.stdout.write("")}')

# v1.3.0-m2 Task 6 (F1 absorption) — 3-axis trigger evaluation (mirror of plan.md 5.0).
# axis a: detector positive (SIGNAL=1)
# axis b: narrow whitelist hit (already inside DESIGN_SURFACE_PATHS via SIGNAL=1)
# axis c: MCCP_DESIGN_INTENT_REASON audited override (strict validator)
DESIGN_INTENT_ACTIVE=0
DESIGN_INTENT_REASON_FORWARD=""
if [ -n "${MCCP_DESIGN_INTENT_REASON:-}" ]; then
  REASON_OK=$(node -e "
    const { validateReason } = require('${CLAUDE_PLUGIN_ROOT}/scripts/receipt/lib/force-override-reason');
    const r = validateReason(process.env.MCCP_DESIGN_INTENT_REASON, { strict: true });
    process.stdout.write(r.ok ? '1' : '0:' + r.reason);
  " 2>/dev/null)
  if [ "$REASON_OK" = "1" ]; then
    DESIGN_INTENT_ACTIVE=1
    DESIGN_INTENT_REASON_FORWARD="$MCCP_DESIGN_INTENT_REASON"
    echo "[mccp:design-critique] MCCP_DESIGN_INTENT_REASON active (implement mode) — forcing SKILL first-step + critique loop" 1>&2
  else
    echo "[mccp:design-critique] MCCP_DESIGN_INTENT_REASON rejected (${REASON_OK#0:}); falling back to detector decision" 1>&2
  fi
fi

# SKILL first-step Read enforcement when any trigger fires.
if [ "$SKILL_AVAIL" = "1" ] && { [ "$SIGNAL" = "1" ] || [ "$DESIGN_INTENT_ACTIVE" = "1" ]; }; then
  echo "[mccp:design-critique] SKILL first-step Read required: plugins/mccp/skills/frontend-design-direction/SKILL.md" 1>&2
fi
```

Decision tree (mirror of plan.md 5.0, v1.3.0-m2 3-axis):

| SKILL_AVAIL | SIGNAL | DESIGN_INTENT_ACTIVE | Action |
|---|---|---|---|
| 0 | * | * | Record `> impeccable unavailable, skipped (auto-fallback): $DETECT_REASON` under `### Design Review` in `## Codex Implementation Review`. Export `IMPECCABLE_SKIPPED_REASON="$DETECT_REASON"`. mccp-implement-codex is a **strict gate** — receipt with `impeccable_skipped=true` BLOCKS downstream `/mccp:pr`. |
| 1 | 0 | 0 | Detector found no design surface in this diff/artifact. Emit a loud stderr warn (`[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · implementation declares no design surface (whitelist hit 0)`) and forward `--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON"` to 2.5.6 — UNLESS `IMPECCABLE_FORCE_OVERRIDE_REASON` is set (schema mutex; silent_skip forward suppressed). M1 records silent_skip as informational warning at every gate; M2 promotes to blocking on strict gates once SKILL first-step + critique loop are wired. |
| 1 | 1 | * | Run the **critique retry loop** (same as plan.md Task 7 reference impl — see below) but Edit target is the produced code/diff, NOT the plan body. Forward `--design-critique-rounds <N> --design-critique-verdict <enum>` to 2.5.6. |
| 1 | 0 | 1 | Audited override active. Run the critique retry loop as above. Additionally forward `--design-intent-reason "$DESIGN_INTENT_REASON_FORWARD"` to 2.5.6. |

#### Stage-aware command routing (v1.13.0 — runs BEFORE the critique loop when triggered)

When the trigger fires (SKILL_AVAIL=1 & (SIGNAL=1 OR DESIGN_INTENT_ACTIVE=1)), route stage-appropriate impeccable commands via the routing oracle. **`critique` is NOT routed here** — it stays owned by the critique retry loop below so `decideCritique`/`design_critique_verdict` blocking is preserved (Codex Plan-Codex R1 F2).

**Pre/post timing framing (v1.18.21 M3 · phase axis v1.31.4 M4)** — this routing pass runs **before** Phase 3 EXECUTE (first code change), so it can only act on the design direction, not on produced code. It asks the oracle for `phase:"pre"`; Phase 3.6 asks the same oracle for `phase:"finish"`:

- **`layout` leads (선행)** — routed `invoke` at the head of the refine stage. Because this gate precedes Phase 3 EXECUTE, `layout` shapes the design direction *before* implementation begins. This is its correct timing.
- **The finish commands are not in this pass at all (v1.31.4 M4)** — `clarify`, `distill`, `polish`, `harden` and `optimize` act on produced code, which does not exist yet, so they carry `phase:"finish"` in the routing table and this pass (`phase:"pre"`) does not return them. Phase 3.6 asks the same oracle for `phase:"finish"` after EXECUTE. **The duplicate-call invariant is enforced by that filter, not by this paragraph**: an entry belongs to exactly one phase, so no command can be routed by both passes (pinned by `impeccable-routing.test.js` M4-3c). Before M4 the two lists were kept disjoint by hand and had already drifted — Phase 3.6 invoked `polish`, which the implement table did not carry at all, so the receipt could not record it.
- **`shape` no longer fires here (v1.31.4 M4)** — it is demoted to `recommend` because the vendor makes it an interview command (`command-metadata.json`: "Runs a required multi-round discovery interview"), and an interview cannot complete in a non-interactive gate. It stays in the catalogue as a guide row.
- **`audit` is advisory** — an evaluate-stage Skill whose findings are recorded present-only via `impeccable_commands_routed` (no gate block).
- **`critique` alone blocks** — the retry loop (§3.9) owns divergent gate-blocking, reaffirmed above.

```bash
MODE=$(node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-routing').parseRoutingMode(process.env))")
# v1.13.0 M2 (Implement-Codex [0] absorption) — derive renderingSurface AND the
# content signals from ONE rendered-surface file set = tracked diff (git diff
# HEAD) ∪ untracked (git ls-files --others --exclude-standard). `git diff HEAD`
# alone misses untracked greenfield .tsx/.css, which would falsely degrade
# routing. The single node invocation also enforces the F1/F2 fail-open
# omission contract: forward diffSignals ONLY when ≥1 signal fired; a rendered
# surface with zero matched signals omits diffSignals so the oracle keeps M1
# fail-open (content commands at base) instead of degrading on absence.
ROUTE_JSON=$(node -e '
  const { execSync } = require("child_process");
  const fs = require("fs");
  const r = require(process.argv[1] + "/scripts/lib/impeccable-routing");
  const mode = process.argv[2];
  const designSignal = process.argv[3] === "1";
  const designIntentActive = process.argv[4] === "1";
  const ui = /\.(tsx|jsx|vue|svelte|astro|css|scss|html)$/i;
  // v1.32.1 M6 — the .claude/cache/(STATUS.md|status.html) arm was removed
  // because it could never be true. This file set is the tracked diff
  // (git diff --name-only HEAD) UNION non-ignored untracked files
  // (git ls-files --others --exclude-standard), and .gitignore:131 excludes
  // .claude/cache/ from BOTH halves, so no input ever reached that branch.
  // What remains is the honest current state: a dashboard-only change reports
  // renderingSurface=0. Reviving it was considered and rejected (DD3 of
  // .claude/plans/impeccable-detection-contract-m6.plan.md): probing the two
  // files directly would make renderingSurface always 1 in any repo that has
  // ever rendered them, and the real signal is the renderer .js source, which
  // the ui regex does not match and which widening would re-open the firing
  // scope M4 just settled.
  const isSurface = (f) => ui.test(f);
  const sh = (c) => { try { return execSync(c, {encoding:"utf8", stdio:["ignore","pipe","ignore"]}); } catch (_) { return ""; } };
  const tracked = sh("git diff --name-only HEAD").split(/\r?\n/).filter(Boolean);
  const untracked = sh("git ls-files --others --exclude-standard").split(/\r?\n/).filter(Boolean);
  const surfaceFiles = Array.from(new Set(tracked.concat(untracked))).filter(isSurface);
  const renderingSurface = surfaceFiles.length > 0;
  let text = sh("git diff HEAD");
  const MAX = 64 * 1024;
  untracked.filter(isSurface).forEach((f) => { try { text += "\n" + fs.readFileSync(f, "utf8").slice(0, MAX); } catch (_) {} });
  const opts = { gate:"implement", phase:"pre", mode, designSignal, designIntentActive, renderingSurface };
  if (renderingSurface) {
    const sig = r.extractDiffSignals(text);
    if (Object.keys(sig).some((k) => sig[k])) opts.diffSignals = sig;  // else omit → fail-open
  }
  if (designIntentActive) {
    const ic = r.parseIntentCommands(process.env);
    if (ic.length) opts.intentCommands = ic;
  }
  const out = r.routeCommands(opts);
  out._renderingSurface = renderingSurface;
  process.stdout.write(JSON.stringify(out));
' "${CLAUDE_PLUGIN_ROOT}" "$MODE" "$SIGNAL" "$DESIGN_INTENT_ACTIVE")
RENDERING_SURFACE=$(echo "$ROUTE_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8"))._renderingSurface?"1":"0")}catch{process.stdout.write("0")}')
echo "[mccp:impeccable-routing] mode=$MODE renderingSurface=$RENDERING_SURFACE → $(echo "$ROUTE_JSON" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write((j.commands||[]).map(c=>c.command+":"+c.callForm).join(" "))')" 1>&2
```

> **Untracked greenfield trigger gap (Implement-Codex [0], documented limitation)**: the `impeccable-detect.js` `design_signal` axis (the trigger that sets `SIGNAL`) still reads the tracked diff, so a brand-new untracked rendered surface may produce `SIGNAL=0` and skip routing entirely. The audited `MCCP_DESIGN_INTENT_REASON` override (axis c → `DESIGN_INTENT_ACTIVE=1`) is the escape: it fires the trigger regardless of detector blindness, and the block above then sees the untracked surface for `renderingSurface` + signal extraction. Extending the detector itself to scan untracked files is a separate axis (detector scope, not M2 routing scope).

For each command in `ROUTE_JSON.commands` **except `critique`**, process by `callForm` and record a structured outcome `{command, call_form, status}`:

| callForm | Action | status on success | status on failure |
|---|---|---|---|
| `invoke` | the resolved call form (see the call-form rule below) with `<command> <slug>`, against the produced code/diff | `invoked` | `failed` (or `unknown-skill` if the call-form line is absent or the Skill is not found) |
| `background` | best-effort background Agent for `<command>`; if background unavailable in this gate, fall back to the foreground resolved call form with `<command> <slug>` and set call_form=`foreground-fallback` + loud stderr | `invoked` | `failed` |
| `recommend` | emit stderr `[mccp:impeccable-routing] recommend: /impeccable <command> <slug>` (no invoke) | `recommended` | n/a |

> **System stage (v1.13.0 M3)**: `document` (generate DESIGN.md) and `extract` (pull reusable tokens/components) route with stage `system` and a `recommend`-only base in every gate — heavyweight generative actions that should be a deliberate operator step, not an auto-invoke. They surface here exactly like the harden-group recommend rows. a11y-architect auto-invoke is **not** part of implement-gate routing; it is PR-gate-only (review-only invariant) — see `pr.md` Phase 2.5.6c.

Accumulate every processed entry into a JSON array and write it to a tempfile for the receipt forward (loud fail-open — record `failed`/`unknown-skill` honestly, do NOT silently drop):

```bash
GITDIR=$(git rev-parse --git-dir)
mkdir -p "$GITDIR/mccp/tmp"
ROUTED_JSON_FILE="$GITDIR/mccp/tmp/impeccable-routed-$$.json"
# The LLM writes the accumulated [{command, call_form, status}, ...] array here.
# Example shape (NOT a literal — fill with real per-command outcomes):
#   [{"command":"shape","call_form":"background","status":"invoked"},
#    {"command":"layout","call_form":"invoke","status":"invoked"}]
```

2.5.6 forwards `--impeccable-routing-mode "$MODE" --impeccable-commands-routed-file "$ROUTED_JSON_FILE"` alongside the existing design-critique flags. If the routing oracle returned `skipped:true` (no trigger), set `MODE`/routed-file empty and forward neither.

#### Critique retry loop (mirror of plan.md Task 7, implement-scope)

The loop body is the same `decideCritique` oracle + cap parser. The semantic
difference is **Edit target**:

- plan.md: Edit the plan markdown sections named by critique findings.
- prp-implement.md: Edit the produced code/diff (not the plan body).
- If `MCCP_DESIGN_CRITIQUE_MAX_RETRY` cap reached with `DIVERGENT_UNRESOLVED`,
  append surviving findings to `.claude/state/fix-task.md` AND stamp
  `--design-critique-verdict divergent` on the implement receipt (which the
  PR step's chain-check then BLOCKs).

```bash
CAP=$(node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-critique-decide').parseRetryCap(process.env))")
ROUND=0
VERDICT=""
FORCE_FAIL="${MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL:-0}"
# (Same loop body as plan.md Task 7 — see plan.md Phase 5.0 for the full
# resolved call-form invocation + decideCritique evaluation + Edit
# instruction. The only difference is Edit target: code/diff, not plan body.)
case "$VERDICT" in
  CONVERGED)             RECEIPT_VERDICT="converged" ;;
  DIVERGENT_UNRESOLVED)  RECEIPT_VERDICT="divergent" ;;
  *)                     RECEIPT_VERDICT="skipped" ;;
esac
DESIGN_CRITIQUE_ROUNDS=$((ROUND + 1))
```

**Call-form rule (v1.31.3 M3) — do NOT type a literal skill name.** The detect
block above printed exactly one line:

```
[mccp:impeccable] call-form: Skill(<invocation>, ...)
```

Invoke the name that line carries between `Skill(` and the comma. That is the
body the oracle established will actually open — `impeccable` for a bare
install, `impeccable:impeccable` for a plugin-only one. Read it off the line,
not off `$IMPECCABLE_INVOCATION`: shell state does not survive a tool-call
boundary, so the variable is empty by the time this instruction is acted on.

**An absent line means the skill did not resolve** — take the `SKILL_AVAIL=0` row (record the fallback note and skip).
Never guess a name, and in particular never fall back to the bare name
`impeccable` as a hardcoded call: from v1.31.3 this repository ships no bare
copy, so a guessed bare call reaches `unknown_skill` and records a skip the
gate did not have to take.

Loud stderr warn for the SKILL_AVAIL=1 SIGNAL=0 row (M1 Task 3):

```bash
if [ "$SKILL_AVAIL" = "1" ] && [ "$SIGNAL" = "0" ]; then
  echo "[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · implementation declares no design surface (whitelist hit 0)" 1>&2
fi
```

Receipt-write (2.5.6) forwards:
- `--impeccable-skipped --impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON"` when SKILL_AVAIL=0 or Skill fell back.
- `--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON"` when SILENT_SKIP=1 AND `IMPECCABLE_FORCE_OVERRIDE_REASON` is empty.

### 2.5.5c — Capture design direction for post-EXECUTE grounding (v1.18.22)

When the design trigger fired (`SKILL_AVAIL=1 && { SIGNAL=1 || DESIGN_INTENT_ACTIVE=1 }`),
capture the impeccable direction + a **pre-EXECUTE rendered-surface snapshot** so the
new **Phase 3.7 — DESIGN GROUNDING VERIFY** can lint the produced diff against the
source-diff-safe H15 anchor. The critique loop (above) runs *before* EXECUTE and never
sees the produced diff — this artifact is what closes that gap mechanically. **No new
LLM call** — `captureDirection` is an artifact write only. When the trigger did NOT
fire, skip this sub-step (leave `DESIGN_GROUNDING_CAPTURED=0`).

```bash
DESIGN_GROUNDING_CAPTURED=0
if [ "$SKILL_AVAIL" = "1" ] && { [ "$SIGNAL" = "1" ] || [ "$DESIGN_INTENT_ACTIVE" = "1" ]; }; then
  GROUNDING_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
    --command mccp:prp-implement --args "$ARGUMENTS")
  # F1 — worktree-safe artifact path. In a git worktree `.git` is a FILE
  # (gitdir pointer), so a `.git/...` hardcode breaks. Resolve the per-worktree
  # gitdir via `git rev-parse --git-path` (NEVER hardcode `.git/`).
  GROUNDING_DIR=$(git rev-parse --git-path mccp/tmp)
  mkdir -p "$GROUNDING_DIR"
  GROUNDING_ARTIFACT="$GROUNDING_DIR/design-direction--$GROUNDING_SLUG.json"
  # F2 — baseline rev + pre-EXECUTE diff snapshot (tracked dirty since baseline
  # + untracked rendered-surface as synthetic added-file diff, §3.10 M2 mirror).
  # Phase 3.7 subtracts this so only the EXECUTE delta is linted, even though
  # Phase 2 admits an already-dirty worktree.
  BASELINE_REV=$(git rev-parse HEAD)
  PRE_DIFF_FILE="$GROUNDING_DIR/pre-diff--$GROUNDING_SLUG.txt"
  git diff "$BASELINE_REV" > "$PRE_DIFF_FILE" 2>/dev/null || true
  for f in $(git ls-files --others --exclude-standard 2>/dev/null); do
    git diff --no-index /dev/null "$f" >> "$PRE_DIFF_FILE" 2>/dev/null || true
  done
  node -e '
    const dg = require(process.argv[1] + "/scripts/lib/design-grounding");
    const fs = require("fs");
    dg.captureDirection({
      path: process.argv[2],
      slug: process.argv[3],
      baselineRev: process.argv[4],
      direction: { summary: process.argv[5] },
      critiqueVerdict: process.argv[6] || null,
      // requiredSignals: machine-checkable dimensions the captured direction
      // explicitly demands (subset of motion/color/typography/responsive).
      // Empty unless the routing/critique step declared one — leave the
      // enforce-mode inconclusive-on-absence path off for control-plane changes.
      requiredSignals: (process.argv[7] || "").split(",").filter(Boolean),
      preExecuteDiffText: fs.readFileSync(process.argv[8], "utf8"),
    });
  ' "${CLAUDE_PLUGIN_ROOT}" "$GROUNDING_ARTIFACT" "$GROUNDING_SLUG" "$BASELINE_REV" \
    "impeccable direction captured pre-EXECUTE (routed=${MODE:-none} critique=${RECEIPT_VERDICT:-none})" \
    "${RECEIPT_VERDICT:-}" "" "$PRE_DIFF_FILE"
  DESIGN_GROUNDING_CAPTURED=1
  echo "[mccp:design-grounding] direction captured → $GROUNDING_ARTIFACT (baseline $BASELINE_REV)" 1>&2
fi
```

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
# v1.3.0 M1 — forward silent-skip flags + impeccable-skipped flags. Schema
# enforces mutex (silent_skip + force_override cannot coexist), so we suppress
# silent_skip forward when IMPECCABLE_FORCE_OVERRIDE_REASON is set and let the
# audited escape produce a force_override-only receipt. impeccable_skipped and
# impeccable_silent_skip are runtime-mutually-exclusive (skill_available true
# vs false) — detector emits one OR the other, never both. Bash array form
# avoids eval and preserves quoting around reasons that may contain spaces.
#
# v1.20.8 B#13 — DISPATCH-WORKER ATTRIBUTION (3 flags). When THIS prp-implement
# runs as a /mccp:work dispatch worker (the worker prompt built by
# dispatch-cli.js:buildImplementWorkerBasePrompt binds --worker-dispatch-id), it
# MUST forward all three attribution flags on EVERY receipt write so the receipt
# anchors to the controller session:
#   --dispatched-by-controller-session <controller session uuid>
#   --worker-dispatch-id                <dispatch uuid>
#   --ipc-envelope-path                 <repo-relative .claude/state/dispatches/<uuid>.envelope.json>
# The worker prompt states the exact bound values verbatim — copy them as-is.
# Under MCCP_DISPATCH_CONTEXT=1 the schema enforces them all-or-nothing: a
# partial/absent set fail-closes the write at exit 12 (surfaced by the B#6 guard
# below). This is no longer a mere cooperative convention: the controller's
# Step 3.gate (dispatch-cli.js `reconcile` → result-schema `deriveVerdict`, the
# v1.20.7 F3 post-hoc anchor check) MECHANICALLY re-verifies each worker implement
# receipt against the store (controller_context_marker_present + the 3 flags ==
# expectedAnchor) and HALTs the whole /mccp:work chain with verdict=`unanchored`
# if a receipt is not store-anchored. Forwarding the flags is thus load-bearing
# for the chain, not advisory. Standalone /mccp:prp-implement (no controller)
# sets none of these — omit all three.
WRITE_FLAGS=(
  write
  --gate mccp-implement-codex
  --decision "$DECISION_SLUG"
  --plan "<plan path>"
)
if [ -n "$SECURITY_SKIPPED_REASON" ]; then
  WRITE_FLAGS+=(--security-skipped --security-skip-reason "$SECURITY_SKIPPED_REASON")
fi
# v1.20.3 (Task 5) — forward the real Implement-Codex verdict so cross-gate
# dedupe (at /mccp:pr) checks the actual outcome instead of the always-true
# resolution.converged. $CODEX_VERDICT is the DEDICATED Phase 2.5.3 variable —
# NOT the design-critique $RECEIPT_VERDICT below. Omit when empty.
if [ -n "${CODEX_VERDICT:-}" ]; then
  WRITE_FLAGS+=(--codex-verdict "$CODEX_VERDICT")
fi
if [ -n "$IMPECCABLE_SKIPPED_REASON" ]; then
  WRITE_FLAGS+=(--impeccable-skipped --impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON")
elif [ "$SILENT_SKIP" = "1" ] && [ -z "${IMPECCABLE_FORCE_OVERRIDE_REASON:-}" ]; then
  WRITE_FLAGS+=(--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON")
fi
# v1.3.0-m2 — design-critique retry-loop audit forward.
if [ -n "${RECEIPT_VERDICT:-}" ] && [ "${RECEIPT_VERDICT:-skipped}" != "skipped" ]; then
  WRITE_FLAGS+=(--design-critique-rounds "$DESIGN_CRITIQUE_ROUNDS"
                --design-critique-verdict "$RECEIPT_VERDICT")
fi
if [ -n "${DESIGN_INTENT_REASON_FORWARD:-}" ]; then
  WRITE_FLAGS+=(--design-intent-reason "$DESIGN_INTENT_REASON_FORWARD")
fi
# v1.13.0 — stage-aware impeccable command routing forward. Only when the
# routing step actually ran (non-empty MODE + routed-file present on disk).
if [ -n "${MODE:-}" ] && [ -n "${ROUTED_JSON_FILE:-}" ] && [ -f "${ROUTED_JSON_FILE:-/nonexistent}" ]; then
  WRITE_FLAGS+=(--impeccable-routing-mode "$MODE"
                --impeccable-commands-routed-file "$ROUTED_JSON_FILE")
fi
# v1.18.22 — design-grounding capture forward (gate-time boolean). Keyed off the
# capture artifact's presence on disk (mirrors the routing-forward presence check
# above), NOT the DESIGN_GROUNDING_CAPTURED shell flag — the flag does not survive
# across separate Bash invocations, and the artifact's existence IS the ground
# truth for "capture happened". The post-EXECUTE verdict is NOT written here — it
# is restamped at Phase 3.7 close via `cli.js restamp-grounding` (F3).
if [ -f "${GROUNDING_ARTIFACT:-/nonexistent}" ]; then
  WRITE_FLAGS+=(--design-grounding-captured)
fi
WRITE_FLAGS+=(--quiet)
node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" "${WRITE_FLAGS[@]}"
# v1.20.8 B#6 — surface the receipt-write exit code. A silent non-zero (esp.
# exit 12 = DISPATCH_MARKER_MISSING_FIELDS) previously let Phase 3 EXECUTE begin
# on top of a NON-WRITTEN receipt. Capture the exit immediately and hard-stop
# BEFORE Phase 3 on any failure, preserving the exact code (12 vs 1) for triage.
WRITE_EXIT=$?
if [ "$WRITE_EXIT" != "0" ]; then
  echo "[MCCP-GATE-STOP] mccp-implement-codex receipt write failed (exit $WRITE_EXIT)." 1>&2
  echo "  exit 12 = DISPATCH_MARKER_MISSING_FIELDS — a MCCP_DISPATCH_CONTEXT=1 dispatch" 1>&2
  echo "  worker did not forward all three attribution flags" 1>&2
  echo "  (--dispatched-by-controller-session / --worker-dispatch-id / --ipc-envelope-path);" 1>&2
  echo "  the receipt schema enforces them all-or-nothing. exit 1 = other write/schema error." 1>&2
  echo "  Do NOT enter Phase 3. Fix the write inputs and re-enter /mccp:prp-implement." 1>&2
  exit "$WRITE_EXIT"
fi
```

> **PreToolUse hook-block interplay**: this exit-code guard fires only when the
> `node` receipt-write process actually RAN and returned non-zero. If a PreToolUse
> hook blocks the Bash tool call outright (the LLM-level block described just
> below), `node` never executes, so `WRITE_EXIT` is meaningless and the hook-block
> handling path owns the stop instead. The two mechanisms are disjoint by
> construction — no double-stop, no missed stop.

Bash hook block handling: same as mccp Plan-Codex Phase 7.6 — output `[MCCP-GATE-STOP]` with captured hook stderr and end the response. Do NOT enter Phase 3.

### 2.5.7 — Read-back validate, then enter Phase 3

```bash
# Verify the receipt is valid (no specific downstream command yet; just sanity check)
# v1.3.1: forward --decision/--plan explicitly so the validator scopes to the
# correct receipt instead of falling back to decisionId='default' (Codex R1 F1).
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate \
  --command mccp:prp-implement \
  --decision ${DECISION_SLUG} \
  --plan <plan path>
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

### Design Grounding Constraints (v1.18.22 — read once before the per-task loop)

If Phase 2.5.5c captured a design-direction artifact (detected by its presence on disk),
read it now and hold its 4 Output Constraints as **explicit implementation context**
for every task that touches a rendered surface. This is the "consume" leg of the
capture → consume → verify contract: the captured impeccable direction must actually
shape the produced code, not just sit in an artifact.

```bash
# Self-derive capture state from the artifact's presence — DESIGN_GROUNDING_CAPTURED
# does not survive across separate Bash invocations, and the slug is re-derived from
# the stable $ARGUMENTS command input (never a carried shell var) so this block is
# fully shell-state independent.
GROUNDING_DIR=$(git rev-parse --git-path mccp/tmp)
GROUNDING_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:prp-implement --args "$ARGUMENTS")
GROUNDING_ARTIFACT="$GROUNDING_DIR/design-direction--$GROUNDING_SLUG.json"
if [ -f "$GROUNDING_ARTIFACT" ]; then
  node -e '
    const dg = require(process.argv[1] + "/scripts/lib/design-grounding");
    const d = dg.readDirection(process.argv[2]);
    if (!d) { process.stderr.write("[mccp:design-grounding] no readable direction artifact (continue)\n"); process.exit(0); }
    process.stdout.write("── Design Grounding Constraints (from captured impeccable direction) ──\n");
    (d.output_constraints || []).forEach(function (c, i) { process.stdout.write("  " + (i + 1) + ". " + c + "\n"); });
    if ((d.required_signals || []).length) process.stdout.write("  required signals: " + d.required_signals.join(", ") + "\n");
    process.stdout.write("  direction: " + ((d.direction && d.direction.summary) || "(none)") + "\n");
  ' "${CLAUDE_PLUGIN_ROOT}" "$GROUNDING_ARTIFACT"
fi
```

Treat each rule as a hard constraint while implementing rendered-surface code:
heading depth ≤ 3 (H15 is the mechanically-verified anchor in Phase 3.7), accent
token ≤ 1 per viewport, no raw markdown markers in rendered output, list-of-N top-3
expanded + rest collapsed. A control-plane-only change (no `.tsx/.css/.html` or
`.claude/cache/*.md` output) has no rendered surface and these are advisory.

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

### Sub-Phase 3.5 — ULTRACODE_DELEGATE (mccp v1.4.0 axis B / M2 — opt-in per task)

**Purpose**: When the plan body marks a task with `- **Effort**: ultracode`, prp-implement does NOT execute that task's per-task loop directly. Instead it acquires an isolation lock, guides the user to switch into Anthropic's native `/effort ultracode` mode (workflow runtime), waits for a structured response, records the delegation result, and proceeds to the next task. The lock + PreToolUse guard hook (`ultracode-phase-guard.js`) mechanically block mccp from writing files, receipts, STATE.md, or invoking mccp:* skills while the lock is active — the cooperative prompt is the secondary, not primary, defense.

**Invariant (M2 PRD Principle)**: mccp NEVER calls `/effort ultracode` directly. Delegation is always a user turn handoff.

#### 3.5.0 — DETECT (per-task probe)

Before each task in the per-task loop, probe the plan body for a marker on the current task:

```bash
DETECT_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-detect.js" detect \
  --mode implement \
  --plan "$ARGUMENTS" \
  --json)
SIGNAL=$(echo "$DETECT_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.ultracode_signal?"1":"0")}catch{process.stdout.write("0")}')
AVAIL=$(echo "$DETECT_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.availability||"unknown")}catch{process.stdout.write("unknown")}')
UNKNOWN_TIERS=$(echo "$DETECT_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write((j.unknown_tiers||[]).map(u=>u.tier+"@"+u.line).join(","))}catch{process.stdout.write("")}')
```

Check whether the current task index (N) is in `signal_tasks`. Use jq-style extraction:

```bash
TASK_IN_SIGNAL=$(echo "$DETECT_JSON" | node -e '
  const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
  const N=parseInt(process.argv[1],10);
  const hit=(j.signal_tasks||[]).find(t=>t.index===N);
  process.stdout.write(hit?"1":"0");
' "$CURRENT_TASK_INDEX")
```

Surface unknown tier warnings to the user (F5 absorption — no silent fall-through):

```bash
if [ -n "$UNKNOWN_TIERS" ]; then
  echo "[ultracode-detect] WARN — plan body contains unknown Effort tier(s): $UNKNOWN_TIERS. Known tiers: ultracode. Skipping these markers." 1>&2
fi
```

#### 3.5.1 — 분기 매트릭스 (mirror of integration template §4)

| availability | current task in signal_tasks | Action |
|---|---|---|
| `available` | included | proceed to 3.5.2 LOCK ENTER |
| `unknown` or `missing` | * | silent skip — run original Phase 3 per-task loop (phantom 안내 금지) |
| `available` | NOT included | silent skip — run original Phase 3 per-task loop |

Default (`unknown`) is the phantom-안내-금지 invariant — without a positive availability signal (env override or filesystem probe), do NOT emit the GUIDE PROMPT.

#### 3.5.2 — IDEMPOTENCY CHECK (F4 absorption — sidecar journal lookup)

Before LOCK ENTER, check the sidecar journal for a prior delegation entry matching the current `(plan_hash, task_index)` pair:

```bash
JOURNAL="${ARGUMENTS}.delegations.jsonl"
PLAN_HASH=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" hash-markdown "$ARGUMENTS")
PRIOR=""
if [ -f "$JOURNAL" ]; then
  PRIOR=$(node -e '
    const fs=require("fs");
    const N=parseInt(process.argv[1],10);
    const ph=process.argv[2];
    const lines=fs.readFileSync(process.argv[3],"utf8").split(/\r?\n/).filter(Boolean);
    let latest=null;
    for (const line of lines) {
      try {
        const o=JSON.parse(line);
        if (o.task_index===N && o.plan_hash===ph) latest=o;
      } catch(_) {}
    }
    process.stdout.write(latest ? JSON.stringify(latest) : "");
  ' "$CURRENT_TASK_INDEX" "$PLAN_HASH" "$JOURNAL")
fi

if [ -n "$PRIOR" ]; then
  VERDICT=$(echo "$PRIOR" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).verdict)')
  STAMPED=$(echo "$PRIOR" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).stamped_at)')
  echo "[ultracode-delegated-previously] Task $CURRENT_TASK_INDEX: verdict=$VERDICT (stamped at $STAMPED, plan_hash unchanged) — skip sub-phase 3.5, proceed to next task."
  # M1 absorption: mark this task as "delegated from journal" so Forwarded
  # effects (3.5.10) and PROVENANCE STAMP (3.5.9) surface it without a fresh
  # GUIDE PROMPT round. No in-memory queue push is needed because both
  # downstream steps re-read the sidecar journal (filtered by current
  # plan_hash) as their canonical input source.
  ULTRACODE_PRIOR_HIT=1
  # Skip sub-phases 3.5.3 through 3.5.8 (LOCK ENTER / GUIDE / WAIT / STAMP /
  # LOCK EXIT / SKIP IMPLEMENTATION) and proceed to the next per-task loop
  # iteration. Do NOT execute the task's Phase 3 body — it was already
  # delegated in the prior run.
  continue
fi
```

If a prior entry exists with matching `plan_hash`, skip sub-phase 3.5 entirely for this task (idempotent re-run). The `continue` above is the canonical exit — both `## Ultracode Delegations` report inject (3.5.10) and `## Ultracode Delegation Provenance` plan-body stamp (3.5.9) read the sidecar journal at consolidation time, so this task's prior entry is automatically surfaced without re-asking the user. If plan body has been edited since the prior delegation, `plan_hash` changes and the prior entry no longer matches — new delegation is required (intentional invalidation).

#### 3.5.3 — LOCK ENTER

```bash
RUN_ID=$(node -e 'console.log(crypto.randomUUID())')
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
ENTER_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js" enter \
  --run-id "$RUN_ID" \
  --pid $$ \
  --task-index "$CURRENT_TASK_INDEX" \
  --owner-session-id "$SESSION_ID")
ENTER_EXIT=$?
```

Failure handling:

- **Exit 11 (lock held)**: invoke detect-stale once for orphan reclaim, then retry enter:

  ```bash
  if [ "$ENTER_EXIT" = "11" ]; then
    node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js" detect-stale > /dev/null
    ENTER_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js" enter \
      --run-id "$RUN_ID" --pid $$ --task-index "$CURRENT_TASK_INDEX" --owner-session-id "$SESSION_ID")
    ENTER_EXIT=$?
  fi
  ```

- **Still failing**: output `[MCCP-GATE-STOP] ultracode lock 진입 실패 (이미 점유 중)` and end the response. Do NOT proceed.

The sidecar token file is written automatically by `enter` to `<gitdir>/mccp/tmp/ultracode-token-<run-id>.dat` (F3 absorption — durable across turn boundary; no shell-var stash needed).

#### 3.5.4 — GUIDE PROMPT

Emit the following message to the user (Korean primary, terminology preserved):

```
Task <N> '<task-name>' 본문에 ultracode 위임 marker가 있습니다.

다음 turn에서 '/effort ultracode' 모드로 진입한 뒤 이 task를 처리해 주세요.
완료 후 mccp 세션으로 돌아와 다음 response grammar 중 하나로 답해 주세요:

  ultracode-done: <≥3 단어 one-line summary of changes>
  ultracode-failed: <one-line reason — attempted but did not complete>
  ultracode-skipped: <one-line reason — intentionally not delegated>

── 격리 invariant (mechanical + cooperative) ──
- lock 활성 동안 mccp는 file change / receipt write / mccp:* 명령을 거부합니다 (PreToolUse hook).
- ultracode 모드 안에서 mccp:* 명령을 호출하지 마세요 — audit chain이 깨집니다.
- lock crash 잔존 시 60s 후 자동 reclaim (host-aware policy).

다른 token / 짧은 summary로 응답하면 prompt가 재출력됩니다.
```

#### 3.5.5 — WAIT for response

Validate user response against the grammar:

- `^ultracode-done:\s+(\S+\s+\S+\s+\S+.*)$` (summary ≥ 3 words required)
- `^ultracode-failed:\s+(.+)$`
- `^ultracode-skipped:\s+(.+)$`

If the response does not match, re-emit the GUIDE PROMPT and wait again. Do NOT auto-answer. These tokens are explicitly disjoint from Phase 0 `skip` / `you decide` and the M1 plan-prd Phase 2.5 `paste:` / `skip-research:` / `failed-research:` grammars.

Parse out verdict (`done | failed | skipped`) and summary.

#### 3.5.6 — IMMEDIATE STAMP (sidecar journal + plan body incremental — F4 absorption)

Before LOCK EXIT, append the delegation entry to the sidecar journal `<plan-path>.delegations.jsonl`:

```bash
# M2 absorption: character-aware truncate (UTF-8 safe — Korean summaries that
# would land on a byte boundary mid-codepoint must NOT be byte-truncated.
# `head -c 280` is byte-truncate and produces mojibake on CJK input.)
SUMMARY_TRUNC=$(printf '%s' "$USER_SUMMARY" | node -e 'process.stdout.write(require("fs").readFileSync(0,"utf8").slice(0,280))')
SUMMARY_SHA=$(printf '%s' "$VERDICT:$USER_SUMMARY" | node -e 'const c=require("crypto");process.stdout.write(c.createHash("sha256").update(require("fs").readFileSync(0)).digest("hex"))')
STAMPED_AT=$(node -e 'console.log(new Date().toISOString())')

JOURNAL_ENTRY=$(node -e '
  process.stdout.write(JSON.stringify({
    run_id: process.argv[1],
    plan_hash: process.argv[2],
    task_index: parseInt(process.argv[3], 10),
    task_name: process.argv[4],
    verdict: process.argv[5],
    summary_sha256: process.argv[6],
    summary: process.argv[7],
    stamped_at: process.argv[8],
  }));
' "$RUN_ID" "$PLAN_HASH" "$CURRENT_TASK_INDEX" "$CURRENT_TASK_NAME" "$VERDICT" "$SUMMARY_SHA" "$SUMMARY_TRUNC" "$STAMPED_AT")

echo "$JOURNAL_ENTRY" >> "${ARGUMENTS}.delegations.jsonl"
```

This is the **idempotency ledger** — durable record persists even if the next mccp turn crashes before the consolidation stamp.

#### 3.5.7 — LOCK EXIT

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/ultracode-phase-lock.js" exit --run-id "$RUN_ID"
```

The exit subcommand reads the raw token from the sidecar file (F3 — no shell-var stash) and unlinks both lock and sidecar on success. If exit returns non-zero, output stderr trace and continue (the lock will be reclaimed by detect-stale within 60s; no user blocking).

#### 3.5.8 — SKIP IMPLEMENTATION + log

Skip the current task's Phase 3 per-task loop body (Read MIRROR → Implement → Validate). Log:

```
[ultracode-delegated] Task <N>: verdict=<verdict> | summary_sha=<short-hex> | stamped at <ISO>
```

Continue to the next task.

#### 3.5.9 — PROVENANCE STAMP (after per-task loop completes)

After the entire per-task loop finishes, consolidate the sidecar journal entries (filtered by current `plan_hash`) into a single `## Ultracode Delegation Provenance` section appended to the plan body (idempotent — replace the whole section if it already exists):

```markdown
## Ultracode Delegation Provenance

<!-- Auto-injected by /mccp:prp-implement Phase 3.5 at <ISO> -->

- Task <N> '<name>': verdict=<done|failed|skipped> | sha256(verdict:summary) = <hex> | stamped at <ISO>
- Task <M> '<name>': verdict=... | sha256 = ... | stamped at <ISO>
```

This is the audit anchor — implement-codex receipt's `plan_hash` will pick up the new section on the next `validate-cmd` call. Tampering with the consolidated section (without a fresh `/mccp:prp-implement` run) breaks the receipt chain.

#### 3.5.10 — Forwarded effects (Phase 5 + Phase 6)

- **Phase 5 REPORT**: inject a `## Ultracode Delegations` section into the implementation report. For each delegation: task index + name + verdict + summary text + stamped_at.
- **Phase 6 OUTPUT**: append one line:

  ```
  Ultracode Delegations: <total> (done=<N> failed=<M> skipped=<K>)
  ```

### Handling Deviations

During task execution AND after each validation level, run **plan-conflict detection** to decide whether a divergence between plan and actual results is a minor deviation (absorbed silently) or a true plan ↔ implementation gap (escalated). This guard is mandatory — silently absorbing a true gap is the exact failure axis H exists to prevent.

```bash
CONFLICT_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-conflict-detector.js" detect \
  --plan "$ARGUMENTS" \
  --failure-output "$LAST_VALIDATION_OUTPUT" \
  --files-changed "$(git diff --name-only origin/main..HEAD)" \
  --json)
CONFLICT=$(echo "$CONFLICT_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.conflict?"1":"0")}catch{process.stdout.write("0")}')
CONFLICT_REASON=$(echo "$CONFLICT_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason||"")}catch{process.stdout.write("")}')
CONFLICT_SIGNAL=$(echo "$CONFLICT_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.signal||"")}catch{process.stdout.write("")}')
```

**CONFLICT=0 (minor deviation)**: Original pre-axis-H behavior preserved.

- Note **WHAT** changed
- Note **WHY** it changed
- Continue with the corrected approach
- These deviations will be captured in the Phase 5 report

**CONFLICT=1 (plan-implement gap detected)**: Three-step escalation, then exit 1. Do NOT proceed to Phase 4 / Phase 5.

1. Write `fix-task.md` with verdict='plan_conflict':

   ```bash
   node -e "
   const fixTask = require('${CLAUDE_PLUGIN_ROOT}/scripts/state/fix-task');
   fixTask.write(process.cwd(), {
     verdict: 'plan_conflict',
     counter: 1,
     escalate: true,
     decisionId: '${DECISION_SLUG}',
     failures: [{stage: 'plan-conflict-detector', exitCode: 1, excerpt: '${CONFLICT_SIGNAL}: ${CONFLICT_REASON}'}],
     originatingReceipts: ['mccp-implement-codex/${DECISION_SLUG}.json']
   });"
   ```

2. Set `STATE.md.chain_aborted=true` + emit `plan_conflict_escalated` event:

   ```bash
   node -e "
   const sw = require('${CLAUDE_PLUGIN_ROOT}/scripts/state/state-writer');
   sw.update(process.cwd(), {
     event: 'plan_conflict_escalated',
     chainAborted: true,
     openQuestions: ['plan-implement conflict — see .claude/state/fix-task.md']
   });"
   ```

3. Stamp `meta.plan_conflict_escalated=true` on the implement receipt (advisory audit; does not block — `STATE.md.chain_aborted` is the binding surface that `auto-chain.js shouldAbort()` honors):

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js write \
     --gate mccp-implement-codex \
     --decision ${DECISION_SLUG} \
     --plan "$ARGUMENTS" \
     --plan-conflict-escalated \
     --quiet
   ```

Then print escalation block + exit 1:

```
[MCCP-PLAN-CONFLICT-STOP] Implementation diverged from plan.
Signal: <CONFLICT_SIGNAL>
Reason: <CONFLICT_REASON>
Next action queued in .claude/state/fix-task.md.
Run /mccp:plan <plan-path> to revise the plan, OR add a deviation rationale to the plan body, then re-enter /mccp:prp-implement.
```

Phase 7 AUTO-CHAIN automatically detects `STATE.md.chain_aborted=true` via [auto-chain.js shouldAbort](../scripts/lib/auto-chain.js) (one of 8 existing triggers) — commit/PR auto-progression stops without additional wiring.

**CHECKPOINT**: All tasks executed. Plan-conflict detection green. Deviations logged.

---

## Phase 3.6 — DESIGN FINISH: post-EXECUTE routing pass (v1.18.21 · rewired v1.31.4 M4, advisory)

This is the **post-implementation** complement to the pre-implementation `layout` lead in 2.5.5b. Commands that act on *produced* code run here — after Phase 3 EXECUTE has actually written the diff — not in the pre-EXECUTE pass.

**M4 rewired what chooses them.** Until v1.31.4 this step invoked a hardcoded list (`clarify`/`distill`/`polish`) that never reached the routing oracle. Two things followed from that, and both were wrong: the oracle answered `recommend` for two of those commands and did not carry `polish` at all, so the receipt's `impeccable_commands_routed` **disagreed with what actually fired**; and `harden`/`optimize` — commands the vendor describes as *fixing* produced code — had no gate anywhere. Now both passes read the same table, split by a `phase` axis: 2.5.5b asks for `phase:"pre"`, this step asks for `phase:"finish"`.

**Duplicate-call invariant is now mechanical, not prose.** The two passes are disjoint *by table construction* — `routeCommands` filters on `phase`, so a command can only be in one of them, and `impeccable-routing.test.js` (M4-3c) asserts the two sets never intersect. The previous wording ("this pass defers, Phase 3.6 invokes — never both") asked a reader to maintain the invariant by hand.

### 3.6.1 — Gate

Run this step ONLY when ALL hold:

1. The design trigger holds — `SKILL_AVAIL=1` AND (`SIGNAL=1` OR `DESIGN_INTENT_ACTIVE=1`), evaluated on values **re-derived in 3.6.2**. 2.5.5b's variables cannot reach this phase (that block explains why); it is the same detector and the same rule, not a second one.
2. `MCCP_IMPECCABLE_ROUTING_MODE` is not `recommend` (recommend mode = advisory-only, no invoke). The oracle degrades every row in that mode too, so the two layers agree; this check just avoids the work.

**`renderingSurface` is deliberately NOT a gate condition here.** It is an *input* to the oracle (3.6.2): on a control-plane-only diff the finish rows degrade to `recommend`, which is the honest answer and still gets recorded. Gating on it would discard that record instead — the same evidence loss M4 exists to close.

If the trigger does not hold or the mode is `recommend`, skip this phase with a single stderr line and proceed to Phase 3.7:

```bash
echo "[mccp:design-finish] skip (trigger or mode gate not met) — finish pass not routed" 1>&2
```

### 3.6.2 — Route the finish phase through the oracle

Same shape as the 2.5.5b `ROUTE_JSON` block, with two differences: `phase:"finish"`, and the surface/signal inputs are recomputed over the **post-EXECUTE** diff. `renderingSurface=0` is not a skip condition here — it is an input; the oracle degrades the finish rows to `recommend` on a control-plane-only diff, which is the honest answer and still gets recorded.

```bash
# 2.5.5b's SKILL_AVAIL / SIGNAL / DESIGN_INTENT_ACTIVE cannot be carried here,
# so they are re-derived from the SAME detector under names that cannot collide.
# Two independent reasons, either one fatal:
#   - shell state does not survive the tool-call boundary between Phase 2.5 and
#     this phase, so reading $SIGNAL here yields an empty string — and an empty
#     string routes NOTHING while looking like a clean run;
#   - `SIGNAL` is REASSIGNED by sub-phase 3.5.0 (the ultracode probe), so if the
#     state DID survive, this phase would route on an unrelated fact.
# Same detector, same trigger rule as 2.5.5b — not a second detector. Phase 3.7
# self-derives for exactly this reason; this block mirrors it.
FINISH_DETECT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect \
  --mode implement \
  --json)
FINISH_SKILL_AVAIL=$(echo "$FINISH_DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.skill_available?"1":"0")}catch{process.stdout.write("0")}')
FINISH_SIGNAL=$(echo "$FINISH_DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.design_signal?"1":"0")}catch{process.stdout.write("0")}')
# Carrier rule, same as 2.5.5b — the LLM reads the invocation NAME off this
# stderr line, never off a shell variable. Its absence means "do not guess".
FINISH_INVOCATION=$(echo "$FINISH_DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.impeccable_invocation||"")}catch{process.stdout.write("")}')
if [ -n "$FINISH_INVOCATION" ]; then
  echo "[mccp:impeccable] call-form: Skill($FINISH_INVOCATION, ...)" 1>&2
fi
FINISH_INTENT_ACTIVE=0
if [ -n "${MCCP_DESIGN_INTENT_REASON:-}" ]; then
  FINISH_REASON_OK=$(node -e "
    const { validateReason } = require('${CLAUDE_PLUGIN_ROOT}/scripts/receipt/lib/force-override-reason');
    const r = validateReason(process.env.MCCP_DESIGN_INTENT_REASON, { strict: true });
    process.stdout.write(r.ok ? '1' : '0');
  " 2>/dev/null)
  if [ "$FINISH_REASON_OK" = "1" ]; then FINISH_INTENT_ACTIVE=1; fi
fi
# 3.6.1 condition 1, evaluated on the values just derived.
if [ "$FINISH_SKILL_AVAIL" != "1" ] || { [ "$FINISH_SIGNAL" != "1" ] && [ "$FINISH_INTENT_ACTIVE" != "1" ]; }; then
  echo "[mccp:design-finish] skip (trigger not met) — finish pass not routed" 1>&2
fi

MODE=$(node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-routing').parseRoutingMode(process.env))")
ROUTE_FINISH_JSON=$(node -e '
  const { execSync } = require("child_process");
  const fs = require("fs");
  const r = require(process.argv[1] + "/scripts/lib/impeccable-routing");
  const mode = process.argv[2];
  const designSignal = process.argv[3] === "1";
  const designIntentActive = process.argv[4] === "1";
  const ui = /\.(tsx|jsx|vue|svelte|astro|css|scss|html)$/i;
  // v1.32.1 M6 — the .claude/cache/(STATUS.md|status.html) arm was removed
  // because it could never be true. This file set is the tracked diff
  // (git diff --name-only HEAD) UNION non-ignored untracked files
  // (git ls-files --others --exclude-standard), and .gitignore:131 excludes
  // .claude/cache/ from BOTH halves, so no input ever reached that branch.
  // What remains is the honest current state: a dashboard-only change reports
  // renderingSurface=0. Reviving it was considered and rejected (DD3 of
  // .claude/plans/impeccable-detection-contract-m6.plan.md): probing the two
  // files directly would make renderingSurface always 1 in any repo that has
  // ever rendered them, and the real signal is the renderer .js source, which
  // the ui regex does not match and which widening would re-open the firing
  // scope M4 just settled.
  const isSurface = (f) => ui.test(f);
  const sh = (c) => { try { return execSync(c, {encoding:"utf8", stdio:["ignore","pipe","ignore"]}); } catch (_) { return ""; } };
  const tracked = sh("git diff --name-only HEAD").split(/\r?\n/).filter(Boolean);
  const untracked = sh("git ls-files --others --exclude-standard").split(/\r?\n/).filter(Boolean);
  const surfaceFiles = Array.from(new Set(tracked.concat(untracked))).filter(isSurface);
  const renderingSurface = surfaceFiles.length > 0;
  let text = sh("git diff HEAD");
  const MAX = 64 * 1024;
  untracked.filter(isSurface).forEach((f) => { try { text += "\n" + fs.readFileSync(f, "utf8").slice(0, MAX); } catch (_) {} });
  const opts = { gate:"implement", phase:"finish", mode, designSignal, designIntentActive, renderingSurface };
  if (renderingSurface) {
    const sig = r.extractDiffSignals(text);
    if (Object.keys(sig).some((k) => sig[k])) opts.diffSignals = sig;  // else omit → fail-open
  }
  if (designIntentActive) {
    const ic = r.parseIntentCommands(process.env);
    if (ic.length) opts.intentCommands = ic;
  }
  const out = r.routeCommands(opts);
  out._renderingSurface = renderingSurface;
  process.stdout.write(JSON.stringify(out));
' "${CLAUDE_PLUGIN_ROOT}" "$MODE" "$FINISH_SIGNAL" "$FINISH_INTENT_ACTIVE")
FINISH_SURFACE=$(echo "$ROUTE_FINISH_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8"))._renderingSurface?"1":"0")}catch{process.stdout.write("0")}')
echo "[mccp:impeccable-routing] phase=finish mode=$MODE renderingSurface=$FINISH_SURFACE → $(echo "$ROUTE_FINISH_JSON" | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write((j.commands||[]).map(c=>c.command+":"+c.callForm).join(" ")||"(none)")')" 1>&2
```

### 3.6.3 — Process each routed command and accumulate outcomes

For each command in `ROUTE_FINISH_JSON.commands`, process by `callForm` with the **same table as 2.5.5b** and record `{command, call_form, status}`. The call form is resolved by the **Call-form rule** in 2.5.5b — read the name off the `[mccp:impeccable] call-form:` stderr line; never type a literal skill name.

| callForm | Action | status on success | status on failure |
|---|---|---|---|
| `invoke` | invoke `<command> <slug>` against the produced diff | `invoked` | `failed` (or `unknown-skill` if the name does not resolve) |
| `background` | best-effort background agent; on unavailability fall back to foreground and set call_form=`foreground-fallback` + loud stderr | `invoked` | `failed` |
| `recommend` | emit stderr `[mccp:impeccable-routing] recommend: /impeccable <command> <slug>` (no invoke) | `recommended` | n/a |

> The `background` row is **currently unreachable**: `(M4-2)` in `impeccable-routing.test.js` pins that no oracle configuration resolves to it, because the only `background` base was `shape` — demoted in M4. It stays in this table because `background` remains a legitimate future base and the receipt enum still carries it; that test goes red the day it becomes reachable again, which is the day this row starts mattering.

`<slug>` is the decision-slug used for the receipt. Record `failed` / `unknown-skill` honestly — this phase is fail-open and a dropped outcome is exactly the evidence loss M4 exists to close.

Order is simplify → harden → verify, so `polish` (when routed) runs last as the final pass over the finished implementation.

### 3.6.4 — Apply advisory findings (bounded)

Findings are **advisory**, not gate-blocking (parallel to `audit` and to the Phase 6 routing recommend rows). prp-implement is an editable gate (not review-only), so you MAY apply cleanup — but bounded, and the bound now covers all five finish commands, `harden`/`optimize` included:

- Apply only **trivial / safe** cleanups in this same cycle, then re-run Phase 4 VALIDATE so the change is regression-guarded.
- Defer any larger restructuring to a separate `/mccp:prp-implement` cycle (do not expand scope here). `harden` and `optimize` can propose broad rewrites; those are deferrals, not this cycle's work.
- Surface every finding (applied or deferred) into the Phase 5 REPORT under a `### Design Finish` subheading.

### 3.6.5 — Restamp the outcomes onto the implement receipt

The receipt was sealed at 2.5.6, before any of this ran. Without this step the finish pass leaves no machine-readable trace — the gap M4 closes.

Write the accumulated array to a tempfile and restamp. The slug is re-derived from the command input, never a carried shell variable.

```bash
FINISH_TMPDIR=$(git rev-parse --git-path mccp/tmp)   # F1 worktree-safe gitdir
mkdir -p "$FINISH_TMPDIR"
DECISION_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision \
  --command mccp:prp-implement --args "$ARGUMENTS")
ROUTED_FINISH_FILE="$FINISH_TMPDIR/impeccable-routed-finish--$DECISION_SLUG.json"
# The LLM writes the accumulated [{command, call_form, status}, ...] array here.
# Exactly those three keys — restamp-routed refuses an entry carrying any other.

RESTAMP_OK=0
for attempt in 1 2 3; do
  if node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" restamp-routed \
       --gate mccp-implement-codex \
       --decision "$DECISION_SLUG" \
       --impeccable-commands-routed-file "$ROUTED_FINISH_FILE" \
       --quiet; then
    RESTAMP_OK=1
    break
  fi
  echo "[mccp:design-finish] restamp attempt $attempt failed — retrying" 1>&2
done
```

Replaying this restamp is safe: `restamp-routed` suppresses an append whose entries are already the tail of the receipt's array, so a retry cannot forge a second history. Two *different* finish records still both append — a command appearing twice is a real drift signal and is kept.

**On final failure — fail-open, but loudly and recoverably.** This phase is advisory and M4 does not change that: a receipt-write failure must not block an implementation that already succeeded. But "덜 기록" is the failure M4 exists to fix, so the evidence must survive the receipt not getting it (Codex Implement-R1 F2):

```bash
if [ "$RESTAMP_OK" != "1" ]; then
  echo "[MCCP-DESIGN-FINISH-RESTAMP-FAILED] the finish pass ran but its outcomes are NOT in the receipt." 1>&2
  echo "  outcomes preserved at: $ROUTED_FINISH_FILE (do NOT delete)" 1>&2
  echo "  recover with: node \"\${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js\" restamp-routed --gate mccp-implement-codex --decision $DECISION_SLUG --impeccable-commands-routed-file $ROUTED_FINISH_FILE" 1>&2
fi
```

and, in the same failure branch, append one line to `.claude/state/fix-task.md` naming the artifact path, and record the failure in the Phase 5 REPORT.

> **What this does not achieve.** The receipt alone still cannot prove the loss happened — detecting it from the receipt would need a present-only meta field, and M4 is explicitly a zero-schema-change milestone. The residual is named here rather than deferred: a validator cannot require what was never stamped. What the retry + preserved artifact + fix-task line buy is that the loss is loud and recoverable instead of silent.

**CHECKPOINT**: Finish pass routed through the oracle (or skipped at the gate). Outcomes restamped onto the implement receipt, or the failure surfaced with the artifact preserved. Phase 4 VALIDATE re-passed if any cleanup applied.

---

## Phase 3.7 — DESIGN GROUNDING VERIFY (v1.18.22, post-EXECUTE mechanical gate)

This phase closes the gap the impeccable critique loop (Phase 2.5.5b) structurally
cannot: critique runs *before* EXECUTE and never sees the produced diff. It runs
**after Phase 3.6 DESIGN FINISH**, so it lints the *final* produced diff (including
any polish edits) against the source-diff-safe **H15** anchor (heading depth ≤ 3)
plus optional required-signal
consistency. **No new LLM call** — `lintProducedDiff` + `decideGrounding` are pure
functions. This is a **separate locus** from the critique divergent-block (§3.9):
that one is LLM-judged on plan/direction; this one is a mechanical check on the diff.
layout/audit/clarify/distill/polish stay advisory (zero promotion). Review-only
gates (pr/code-review) are untouched (implement-only).

**Run only when the Phase 2.5.5c capture artifact exists on disk** — detected by
presence, NOT the `DESIGN_GROUNDING_CAPTURED` shell flag (a non-persisting flag would
silently no-op this mechanical gate across a separate Bash invocation). When no
artifact exists, Phase 3.7 is a complete no-op — skip to Phase 4.

```bash
GROUNDING_DIR=$(git rev-parse --git-path mccp/tmp)   # F1 worktree-safe gitdir
# Self-derive capture state from artifact presence (shell-state independent). The
# slug is re-derived from the stable $ARGUMENTS input, never a carried shell var —
# so the mechanical gate cannot be silently skipped by a lost DESIGN_GROUNDING_CAPTURED.
GROUNDING_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:prp-implement --args "$ARGUMENTS")
GROUNDING_ARTIFACT="$GROUNDING_DIR/design-direction--$GROUNDING_SLUG.json"
if [ -f "$GROUNDING_ARTIFACT" ]; then
  GROUNDING_RESULT="$GROUNDING_DIR/design-grounding-result--$GROUNDING_SLUG.json"
  MODE_G=$(node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-grounding').parseGroundingMode(process.env))")

  # F2 — produced-diff source = baseline rev (recorded at capture) + tracked
  # diff since baseline + untracked rendered-surface (synthetic added-file). The
  # lib subtracts the captured pre-EXECUTE buckets so only the EXECUTE delta is
  # linted, even on an already-dirty worktree.
  BASELINE_REV=$(node -e "const d=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-grounding').readDirection(process.argv[1]); process.stdout.write((d&&d.baseline_rev)||'')" "$GROUNDING_ARTIFACT")
  CUR_DIFF_FILE="$GROUNDING_DIR/cur-diff--$GROUNDING_SLUG.txt"
  if [ -n "$BASELINE_REV" ]; then
    git diff "$BASELINE_REV" > "$CUR_DIFF_FILE" 2>/dev/null || true
  else
    git diff HEAD > "$CUR_DIFF_FILE" 2>/dev/null || true
  fi
  for f in $(git ls-files --others --exclude-standard 2>/dev/null); do
    git diff --no-index /dev/null "$f" >> "$CUR_DIFF_FILE" 2>/dev/null || true
  done

  # Lint + decide. readFailed = capture was expected (artifact path set) but the
  # direction is unreadable → enforce returns inconclusive-block (F4), never a
  # silent no-op.
  GROUNDING_JSON=$(node -e '
    const dg = require(process.argv[1] + "/scripts/lib/design-grounding");
    const fs = require("fs");
    const direction = dg.readDirection(process.argv[2]);
    const mode = process.argv[3];
    const readFailed = direction === null;  // artifact expected (captured=1) but unreadable
    let out;
    if (readFailed) {
      const dec = dg.decideGrounding({ mode: mode, readFailed: true });
      out = { verdict: dec.verdict, block: dec.block, mode: mode, read_failed: true, advisories: ["captured direction artifact unreadable"] };
    } else {
      const lint = dg.lintProducedDiff({ currentDiffText: fs.readFileSync(process.argv[4], "utf8"), direction: direction, mode: mode });
      const dec = dg.decideGrounding({
        mode: mode,
        blockingViolations: lint.blockingViolations,
        missingRequiredSignals: lint.missingRequiredSignals,
        requiredSignalsDeclared: lint.requiredSignals.length > 0,
        hasRenderedDiff: lint.hasRenderedDiff,
        readFailed: false,
      });
      out = {
        verdict: dec.verdict, block: dec.block, mode: mode, read_failed: false,
        baseline_rev: (direction && direction.baseline_rev) || null,
        has_rendered_diff: lint.hasRenderedDiff,
        blocking_violations: lint.blockingViolations,
        missing_required_signals: lint.missingRequiredSignals,
        advisories: lint.advisories,
      };
    }
    fs.writeFileSync(process.argv[5], JSON.stringify(out, null, 2));
    process.stdout.write(JSON.stringify({ verdict: out.verdict, block: out.block }));
  ' "${CLAUDE_PLUGIN_ROOT}" "$GROUNDING_ARTIFACT" "$MODE_G" "$CUR_DIFF_FILE" "$GROUNDING_RESULT")
  GROUNDING_VERDICT=$(echo "$GROUNDING_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).verdict)}catch{process.stdout.write("inconclusive")}')
  GROUNDING_BLOCK=$(echo "$GROUNDING_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).block?"1":"0")}catch{process.stdout.write("1")}')
  echo "[mccp:design-grounding] verdict=$GROUNDING_VERDICT block=$GROUNDING_BLOCK mode=$MODE_G → $GROUNDING_RESULT" 1>&2
fi
```

### Verdict handling

| verdict | mode=enforce | mode=warn / off |
|---|---|---|
| `grounded` / `anchor_clean` / `skipped` | pass | pass |
| `violations` (H15 in produced delta) | **block** → fix-task + bounded retry | record advisory, pass |
| `inconclusive` (read-failed or required signal absent) | **block** → fix-task + bounded retry | record advisory, pass |

**On block (`GROUNDING_BLOCK=1`)** — bounded retry, then hard-stop. Mirror the
stop-loop / critique fix-task pattern:

1. Append the offending evidence (the `blocking_violations[].rule` + `.evidence`
   from `$GROUNDING_RESULT`, or the missing-signal / read-failure note) to
   `.claude/state/fix-task.md`.
2. Re-edit ONLY the rendered-surface added lines that triggered the H15 hit
   (collapse `<h4+>`/`####` headings to depth ≤ 3 or move to a secondary surface),
   then re-run the lint block above. Repeat up to `MCCP_DESIGN_CRITIQUE_MAX_RETRY`
   rounds (the shared design retry cap; default 2).
3. Cap reached and still blocking → print the stop block and **exit 1** (do NOT
   enter Phase 4):

   ```
   [MCCP-DESIGN-GROUNDING-STOP] produced diff violates design grounding anchors (verdict=<verdict>).
   Evidence: <rule>:<evidence> | <missing-signal> | <read-failure>
   Next: fix the rendered-surface lines listed in .claude/state/fix-task.md, then re-enter /mccp:prp-implement,
   OR set MCCP_DESIGN_GROUNDING=warn for an advisory (non-blocking) pass with the verdict recorded honestly.
   ```

**On pass (or warn/off advisory)** — restamp the implement-codex receipt with the
post-EXECUTE verdict. This is the **field-preserving** restamp (Codex Implement-R1
F3): it mutates ONLY `meta.design_grounding_verdict`, preserving the
`design_critique_*`/routing/attribution fields written at 2.5.6, and recomputes the
digests. `$GROUNDING_RESULT` (mode/verdict/baseline/advisories) is the canonical
post-EXECUTE evidence consumed by Phase 5 REPORT.

```bash
# Self-sufficient restamp — reads the persisted Phase 3.7 result JSON instead of
# carried shell vars (GROUNDING_VERDICT/GROUNDING_BLOCK do not survive a separate
# Bash invocation). Slug re-derived from $ARGUMENTS; restamp only on a non-blocking
# verdict (a blocking verdict hard-stops above and leaves the receipt verdict null
# until a clean re-run).
GROUNDING_DIR=$(git rev-parse --git-path mccp/tmp)
GROUNDING_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:prp-implement --args "$ARGUMENTS")
GROUNDING_RESULT="$GROUNDING_DIR/design-grounding-result--$GROUNDING_SLUG.json"
if [ -f "$GROUNDING_RESULT" ]; then
  G_VERDICT=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).verdict||"")}catch{process.stdout.write("")}' "$GROUNDING_RESULT")
  G_BLOCK=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).block?"1":"0")}catch{process.stdout.write("1")}' "$GROUNDING_RESULT")
  if [ -n "$G_VERDICT" ] && [ "$G_BLOCK" != "1" ]; then
    node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" restamp-grounding \
      --gate mccp-implement-codex \
      --decision "$GROUNDING_SLUG" \
      --design-grounding-verdict "$G_VERDICT" \
      --quiet
    echo "[mccp:design-grounding] receipt restamped design_grounding_verdict=$G_VERDICT" 1>&2
  fi
fi
```

**CHECKPOINT**: Design grounding verified (or no-op when no capture). Receipt restamped with verdict.

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

### Design Grounding (v1.18.22, when captured)

If Phase 3.7 ran (the `design-grounding-result--<slug>.json` file exists on disk),
surface its verdict from
`$(git rev-parse --git-path mccp/tmp)/design-grounding-result--<slug>.json`:

| Field | Value |
|---|---|
| Verdict | `grounded` / `anchor_clean` / `inconclusive` / `violations` / `skipped` |
| Mode | `enforce` / `warn` / `off` |
| Rendered delta | yes / no (control-plane-only → anchor_clean no-op) |
| Advisories | from `result.json.advisories` |

When no capture happened, record "Design Grounding: N/A (no design trigger)".

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

### Do NOT archive the plan here (v1.25.2 — gate-guard-integrity M3, C2)

**Leave the plan where it is.** Archiving is owned by `/mccp:archive-complete`
(CLAUDE.md §3.11), which runs as a separate human-gated step **after the whole PRD
is complete** — not once per milestone implement. This step used to run
an unconditional `mkdir -p` + `mv "$ARGUMENTS" …` into a `completed/` directory
under `.claude/PRPs/plans/`, and that instruction
was wrong on three independent axes:

1. **Data loss (§3.11 C2).** Archiving a single milestone's plan while its PRD is
   still `in-progress` breaks the invariant that a PRD and *all* its active plans
   move as one atomic unit. `plans.js` (`PLAN_DIRS`, non-recursive) discovers PRDs
   only through an active plan's `source_prd`, so moving the last active plan out
   makes the PRD invisible to every dashboard scan. `archive-complete/apply.js`
   re-verifies archivability and rolls back on failure; an unconditional `mv` here
   bypasses that safety net entirely.
2. **Self-blocking (guard 2).** v1.23.5 restored the staleness guard, and
   `/mccp:pr` 2.5.8/2.5.9 now forward `--plan`. If this step has already moved the
   plan, the validator cannot read it to re-hash and returns `stale` → aggregate
   `ok=false` → **this cycle's own PR is blocked by the guard this repo just
   restored** (measured: absent path → 2 stale entries).
3. **Wrong destination.** §3.11, `archive-complete/apply.js` and
   `renderer/sections/milestone-history.js` all read `archived/`, never
   `completed/`. A plan moved to `completed/` is picked up by no scan at all.

When the PRD's final milestone lands, archive deliberately and atomically:

```bash
# Only after every milestone row is complete/dropped — the tool refuses otherwise
# (`scan.js` → archivable:false), which is the mechanical second line of defense.
#
# `${CLAUDE_PLUGIN_ROOT}`, not a repo-relative path: this command body runs in the
# USER's repository, which has no `plugins/mccp/` tree. Every other node call in
# this file (24 of them) already resolves through the plugin root; a monorepo-
# internal path here would be `Cannot find module` for every installed user.
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/archive-complete/scan.js" --json
```

then run `/mccp:archive-complete` (human gate, atomic transaction + operation
journal). Orphan free-form plans with no active source PRD are archived by hand
with `git mv` per §3.11.

**CHECKPOINT**: Report created. PRD updated. Plan left in place for `/mccp:pr`.

---

## Phase 6 — OUTPUT

Report to user:

```
## Implementation Complete

- **Plan**: [plan file path] → left in place (archiving is `/mccp:archive-complete`'s job, post-PRD)
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
- Plan (still active): the plan path this run was invoked with — `.claude/plans/`
  or the legacy `.claude/PRPs/plans/`, whichever it came from. Report it verbatim
  rather than assuming a directory (§3.11 treats both as active sources).

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
# Fix Invariant (F1) — Phase 2.5와 분리된 fresh shell이므로 자체 재도출 + mkdir.
# redirect(2>)는 파일은 만들어도 부모 dir은 못 만들어 clean worktree에서 깨진다.
GITDIR=$(git rev-parse --git-dir)   # worktree-safe (§3.8 — .git는 worktree에서 파일)
mkdir -p "$GITDIR/mccp/tmp"
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/auto-chain.js" check \
  --next-step commit \
  --decision "<decision-slug>" 2> "$GITDIR/mccp/tmp/auto-chain.stderr"
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
- `MCCP_AUTO_CHAIN_DISABLE=1` — kill switch (operator). **Mechanical** — `auto-chain.js` `shouldAbort()` honors this first.
- `MCCP_AUTO_CHAIN_SKIP_PR=1` — commit only, no PR (for direct-push cycles). **LLM-observed only** — no hook/script enforces this. The LLM running this prompt reads the env before Phase 7 and decides whether to skip the `/mccp:pr` invocation. If you expect mechanical enforcement it will fail-open (chain continues to PR). W-VERDICT C2 axis M (F-W10-1).

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
- **PLAN_RETAINED**: Plan left in `.claude/plans/` so `/mccp:pr` can re-hash it (archiving belongs to `/mccp:archive-complete`)

---

## Next Steps

- Run `/code-review` to review changes before committing
- Run `/prp-commit` to commit with a descriptive message
- Run `/mccp:pr` to create a pull request
- Run `/mccp:plan <next-phase>` if the PRD has more phases
