---
description: "Create a GitHub PR from current branch with unpushed commits — discovers templates, analyzes changes, pushes"
argument-hint: "[base-branch] (default: main)"
---

# Create Pull Request

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

**Input**: `$ARGUMENTS` — optional, may contain a base branch name and/or flags (e.g., `--draft`).

**Parse `$ARGUMENTS`**:
- Extract any recognized flags (`--draft`)
- Treat remaining non-flag text as the base branch name
- Default base branch to `main` if none specified

---

## Phase 0 — TERMINAL ADVISORY REJECTION (v0.2.2 R2#2)

`/mccp:pr` is a terminal mutating command that creates a PR. Per the plan v0.2.2 R3#2 carry-over decision (and Codex R2#2), **terminal commands MUST refuse `MCCP_ALLOW_CODEX_UNAVAILABLE=1` advisory mode**. The rejection runs **before any `gh` invocation, before Phase 1 discovery, and writes no receipt**.

```bash
# v0.3.5 — MCCP_CODEX_DISABLED=1 is an exception. "disabled" means intentional
# operator policy (env-level), not involuntary unavailability. Disabled is a
# first-class skip path — the wrapper short-circuits with classification='disabled'
# and the receipt records meta.codex_disabled=true. Advisory mode rejection
# below does NOT apply in this case.
if [ "${MCCP_ALLOW_CODEX_UNAVAILABLE:-0}" = "1" ] && [ "${MCCP_CODEX_DISABLED:-0}" != "1" ]; then
  echo "[MCCP-GATE-STOP] /mccp:pr refuses advisory mode (MCCP_ALLOW_CODEX_UNAVAILABLE=1)." 1>&2
  echo "Reason: terminal mutating command requires a converged Codex PR-Codex receipt." 1>&2
  echo "Fix Codex availability (run /codex:setup or check the codex plugin install) and re-run." 1>&2
  echo "No GitHub API calls were made. No receipt written." 1>&2
  exit 1
fi
```

This Phase 0 runs before `gh pr list` so an advisory invocation never touches GitHub. The auto-chain `pr` step from [auto-chain.js](../scripts/lib/auto-chain.js) mirrors this rejection at chain-orchestration time as defense-in-depth.

### Phase 0.0b — Seal the Codex policy for this gate execution (v1.32.6)

Write the operator policy to disk **before any round runs**. From here on the
authority on "is Codex disabled?" is `codex-policy`, not `process.env` — so a
later round cannot resurrect Codex by clearing the variable. `seal` resolves the
git dir itself (worktree-safe) and exits 0 even when it fails, because a failed
seal must degrade to the pre-v1.32.6 behaviour (env only) rather than stop the gate.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-policy.js" seal 1>&2

# env-contract-integrity M3 — seal the ROUND policy in the same breath, and for
# the same reason. PR-Codex runs two processes down (`codex-runner.js` spawns
# `codex-invoke.js`), and this PRD's own evidence is an instance of "the value
# never reached the process", so the cap and the ledger key travel on disk.
#
# The ledger is per (gate, decision): `mccp-pr-codex__<slug>` starts empty even
# when the plan and implement gates have spent theirs, so a first `/mccp:pr` is
# never refused. A SECOND `/mccp:pr` for the same decision is — deliberately
# (DD6). Recovery is `MCCP_GATE_ROUND_CAP` (max 3) or the audited
# `MCCP_PR_SKIP_CODEX_REVIEW`, and `codex-runner.js` names both when it refuses.
#
# `seal` exits 0 even on failure: a failed seal degrades to pre-M3 behaviour
# (no enforcement) rather than stopping the gate, and says so loudly.
ROUND_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision \
  --command mccp:pr --args "$ARGUMENTS")
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/review-rounds/cli.js" seal \
  --gate mccp-pr-codex --decision "$ROUND_SLUG" 1>&2
```

**Never unset, override, or re-export `MCCP_CODEX_DISABLED` anywhere in this
command.** It is a persistent operator policy, not a one-shot escape, and R1 does
not consume it.

### Phase 0.1 — `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audited escape preflight (v0.2.6 Milestone 1 Task 1.6)

Symmetric with the v0.2.4 security-reviewer audited escape but with **stricter reason validation** (Codex R1 F4 absorption). If the env var is set, validate the reason **before** 2.5.1 runs the impeccable gate, so a missing-Skill fallback can short-circuit to force-override path without re-prompting the user mid-flow.

```bash
if [ -n "${MCCP_FORCE_PR_WITHOUT_IMPECCABLE:-}" ]; then
  REASON="$MCCP_FORCE_PR_WITHOUT_IMPECCABLE"
  TRIMMED=$(echo -n "$REASON" | awk '{$1=$1; print}')
  LEN=${#TRIMMED}
  WORDS=$(echo "$TRIMMED" | wc -w)
  if [ "$LEN" -lt 30 ] || [ "$WORDS" -lt 3 ]; then
    echo "[MCCP-GATE-STOP] MCCP_FORCE_PR_WITHOUT_IMPECCABLE reason rejected (len=$LEN words=$WORDS)." 1>&2
    echo "v0.2.6 hardening (Codex R1 F4): reason must be ≥30 chars + ≥3 words, no placeholder/URL-only/banlist." 1>&2
    echo "Receipt CLI applies the same validator at schema time — reason is rejected upstream as well." 1>&2
    exit 1
  fi
  # 1-token banlist, URL-only, placeholder checks are enforced by the receipt
  # CLI helper (plugins/mccp/scripts/receipt/lib/force-override-reason.js). The
  # write step at 2.5.7 will REJECT the receipt if those checks fail, so a
  # bypass-attempting reason cannot survive past this command.
  export IMPECCABLE_FORCE_OVERRIDE_REASON="$REASON"
fi
```

When `IMPECCABLE_FORCE_OVERRIDE_REASON` is set, 2.5.1's missing-Skill fallback path takes the **force-override branch** instead of fail-stop: receipt-write (2.5.7) MUST forward `--impeccable-force-override --impeccable-force-override-reason "$IMPECCABLE_FORCE_OVERRIDE_REASON"` (mutually exclusive with `--impeccable-skipped` — schema invariant). Phase 4 MUST auto-inject a `## Impeccable Override` section into the PR body (canonical audit source — receipts dir is git-ignored).

### Phase 0.2 — `MCCP_PR_SKIP_CODEX_REVIEW` audited escape preflight (v0.2.8 Task 2.6.1)

Mirror of Phase 0.1 but for the PR-step Codex adversarial review. If the env var is set with a substantive reason, validate it **before** Phase 2.5.3 invokes Codex so the skip path short-circuits cleanly.

```bash
if [ -n "${MCCP_PR_SKIP_CODEX_REVIEW:-}" ]; then
  REASON="$MCCP_PR_SKIP_CODEX_REVIEW"
  TRIMMED=$(echo -n "$REASON" | awk '{$1=$1; print}')
  LEN=${#TRIMMED}
  WORDS=$(echo "$TRIMMED" | wc -w)
  if [ "$LEN" -lt 30 ] || [ "$WORDS" -lt 3 ]; then
    echo "[MCCP-GATE-STOP] MCCP_PR_SKIP_CODEX_REVIEW reason rejected (len=$LEN words=$WORDS)." 1>&2
    echo "v0.2.8 Task 2.6.1: reason must be ≥30 chars + ≥3 words, no placeholder/URL-only/banlist." 1>&2
    echo "Receipt CLI applies the same validator at schema time — reason is rejected upstream as well." 1>&2
    exit 1
  fi
  export CODEX_SKIP_AT_PR_REASON="$REASON"
fi
```

When `CODEX_SKIP_AT_PR_REASON` is set, Phase 2.5.3 SKIPS the Codex invocation entirely. Phase 2.5.7 MUST forward `--codex-skipped-at-pr --codex-skip-reason "$CODEX_SKIP_AT_PR_REASON"` (mutually exclusive with `--codex-dedupe-at-pr` — schema invariant). Phase 4 MUST auto-inject a `## Codex Review Skipped` footer into the PR body (canonical audit source).

`MCCP_PR_SKIP_CODEX_REVIEW` is intended for **one-shot** use (e.g. shared runtime pipe stuck + manual cross-model review confirmed out-of-band). Do not export it persistently.

### Phase 0.3 — Codex-skip mutual-exclusion preflight (v0.2.8 F9 + v0.3.5 3-way)

`MCCP_PR_SKIP_CODEX_REVIEW="<reason>"`, `CODEX_DEDUPE_AT_PR=1`, and `MCCP_CODEX_DISABLED=1` all express intent to suppress the Phase 2.5.3 Codex invocation, but with different semantics:
- `MCCP_PR_SKIP_CODEX_REVIEW` — user-issued one-shot audited escape (substantive reason ≥30 chars)
- `CODEX_DEDUPE_AT_PR` — cross-gate dedupe auto-derived (plan/implement converged)
- `MCCP_CODEX_DISABLED` — env-level operator policy (canonical reason='codex_disabled')

The receipt CLI enforces 3-way mutex at schema time (`codex_dedupe_at_pr ∩ codex_skipped_at_pr ∩ codex_disabled_at_pr = ∅`). This preflight surfaces the conflict before any phase work runs and prevents an ambiguous receipt from ever being written. v0.3.5: `MCCP_CODEX_DISABLED=1` policy wins over `MCCP_PR_SKIP_CODEX_REVIEW` — the audited escape is redundant when env policy is active, so we silently drop it with a stderr warning rather than fail-stop.

```bash
# Mutex 1: PR_SKIP vs DEDUPE (v0.2.8 F9 — both user-issued/auto, unrelated to env)
if [ -n "${MCCP_PR_SKIP_CODEX_REVIEW:-}" ] && [ "${CODEX_DEDUPE_AT_PR:-0}" = "1" ]; then
  echo "[MCCP-GATE-STOP] env mutual-exclusion violation:" 1>&2
  echo "  MCCP_PR_SKIP_CODEX_REVIEW=<set>  (audited Codex-skip escape)" 1>&2
  echo "  CODEX_DEDUPE_AT_PR=1             (cross-gate dedupe signal)" 1>&2
  echo "Both can't be set together — they map to mutually-exclusive receipt meta fields" 1>&2
  echo "(codex_skipped_at_pr ⊕ codex_dedupe_at_pr). Pick one path and re-run:" 1>&2
  echo "  - For a one-shot manual Codex skip: keep MCCP_PR_SKIP_CODEX_REVIEW, unset CODEX_DEDUPE_AT_PR" 1>&2
  echo "  - For cross-gate dedupe (auto): unset MCCP_PR_SKIP_CODEX_REVIEW, let Phase 2.5.2 export CODEX_DEDUPE_AT_PR" 1>&2
  exit 1
fi

# Mutex 2: env policy DISABLED wins over user-issued PR_SKIP (v0.3.5)
if [ "${MCCP_CODEX_DISABLED:-0}" = "1" ] && [ -n "${MCCP_PR_SKIP_CODEX_REVIEW:-}" ]; then
  echo "[mccp] MCCP_CODEX_DISABLED=1 active — MCCP_PR_SKIP_CODEX_REVIEW is redundant and will be dropped (env policy wins)." 1>&2
  unset MCCP_PR_SKIP_CODEX_REVIEW
  unset CODEX_SKIP_AT_PR_REASON
fi

# Mutex 3: env policy DISABLED + DEDUPE — disabled is canonical, dedupe is meaningless when env policy active
if [ "${MCCP_CODEX_DISABLED:-0}" = "1" ] && [ "${CODEX_DEDUPE_AT_PR:-0}" = "1" ]; then
  echo "[MCCP-GATE-STOP] env mutual-exclusion violation:" 1>&2
  echo "  MCCP_CODEX_DISABLED=1   (env-level operator policy)" 1>&2
  echo "  CODEX_DEDUPE_AT_PR=1    (cross-gate dedupe signal)" 1>&2
  echo "Disabled mode short-circuits the wrapper before any review can converge — dedupe signal is unreachable." 1>&2
  echo "Likely cause: stale dedupe export from a prior chain. Unset CODEX_DEDUPE_AT_PR and re-run." 1>&2
  exit 1
fi
```

`CODEX_DEDUPE_AT_PR` is normally exported by Phase 2.5.2 cross-gate dedupe — it is **not** a user-facing knob. If you find yourself setting it from a shell or `.claude/settings.json`, you are almost certainly working around a stale receipt and the right fix is `/mccp:receipt-validate` / `/mccp:receipt-write` rather than the escape. This preflight is defense-in-depth — the receipt CLI's 3-way `codex_skipped_at_pr ⊕ codex_dedupe_at_pr ⊕ codex_disabled_at_pr` schema invariant remains the authoritative gate.

### Phase 0.4 — `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` audited override preflight (integrity-unification M3)

Mirror of Phase 0.1/0.2 but for the M3 **ship gate**: from M3 on, a non-approving PR-Codex verdict (`divergent`/`critical`/`unavailable`/absent) mechanically HALTs the ship at finalize (2.5.7) + the self-gate read-back (2.5.9). The only sanctioned bypass is this audited override. If the env var is set, validate its reason **before** any phase work runs so a bad reason fails fast.

```bash
# santa-loop R1 (Codex FAIL absorption) — hard-reset any inherited/stale
# PR_CODEX_FORCE_OVERRIDE_REASON before evaluating the override, mirroring the
# entry `unset CODEX_DEDUPE_AT_PR` at Phase 2.5.2. This internal signal is NOT a
# user knob — the ONLY sanctioned setter is the validated branch below. If a prior
# chain (or a shell / .claude/settings.json working around a stale receipt) left it
# exported, forwarding it at 2.5.7 would stamp the override and ship a divergent PR
# with no MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE set THIS run — a bypass of the
# "only sanctioned bypass" contract. Defense-in-depth: finalize-receipt.js also
# re-validates the env var at the write locus, so a stale forward is dropped there
# even if this reset is skipped, but clearing it here keeps the signal honest.
unset PR_CODEX_FORCE_OVERRIDE_REASON
if [ -n "${MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE:-}" ]; then
  REASON="$MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE"
  REASON_OK=$(node -e "
    const { validateReason } = require('${CLAUDE_PLUGIN_ROOT}/scripts/receipt/lib/force-override-reason');
    const r = validateReason(process.env.MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE, { strict: true });
    process.stdout.write(r.ok ? '1' : '0:' + r.reason);
  " 2>/dev/null)
  if [ "$REASON_OK" != "1" ]; then
    echo "[MCCP-GATE-STOP] MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE reason rejected (${REASON_OK#0:})." 1>&2
    echo "integrity-unification M3: reason must be ≥30 chars + ≥3 words, no placeholder/URL-only/banlist." 1>&2
    echo "The receipt CLI applies the same validator at schema time — a bad reason is rejected upstream as well." 1>&2
    exit 1
  fi
  export PR_CODEX_FORCE_OVERRIDE_REASON="$REASON"
fi
```

**Independence from Phase 0.3's 3-way mutex** — the override is deliberately **not** part of that mutex. `dedupe`/`skipped`/`disabled` are three mutually-exclusive *ways Codex did not need to speak at the PR step*; the M3 override is orthogonal — it lets a ship proceed *despite* a Codex verdict that DID speak and said "No ship". Critically, the override **never rewrites `resolution.codex_verdict`** — the receipt still seals the real `divergent` verdict, so cross-gate dedupe stays fail-closed (a later `/mccp:pr` still re-runs PR-Codex) and the §3.12 sealing invariant holds. It only clears *this* invocation's mechanical HALT. Because it is not a Codex-skip path, it composes with (does not conflict with) the 0.3 mutex; a divergent verdict + override is a legal, audited state.

`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` is intended for **one-shot** use (e.g. a cherry-pick PR whose diff was already adversarially reviewed upstream). Do not export it persistently. Phase 4 auto-injects a `## PR-Codex Override` section (canonical audit source — the receipt itself is now git-tracked per §3.12, but the PR body states the objection in plain sight).

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

## Phase 1.6 — DESIGN-CRITIQUE CHAIN-CHECK PREFLIGHT (v1.3.0-m2 Task 8 · F3 absorption)

PR scope **does NOT** run the design-critique retry loop. The plan + implement
gates own convergence; PR step is enforcement-only. This preflight invokes the
canonical chain-check via validate-cmd before any Codex / impeccable Skill
call, so a divergent prior receipt blocks the PR before any side effect.

```bash
DECISION_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision \
  --command mccp:pr \
  --args "$ARGUMENTS")
# v1.23.5 G2 — forward --plan so the validator scopes to the right receipt
# instead of falling back to its plan-less path. Phase 2 DISCOVER has NOT run
# yet, so there is no discovered plan path to reuse; derive it from the slug per
# /mccp:plan's output convention (.claude/plans/<slug>.plan.md).
#
# This is a SCOPING correction, NOT staleness enforcement — and the distinction
# is load-bearing. The real staleness locus is 2.5.9, which runs after Phase 2
# and gates on the aggregate `ok`.
#
# Precisely what the derived path can and cannot do here (santa-loop R1 asked for
# this to be stated exactly rather than as a blanket "cannot false-block"):
#   - It CANNOT introduce a block, GIVEN the `|| PRECHECK_EXIT=$?` guard below.
#     validate-cmd consumes planPath in exactly two
#     places — the generic-slug guard (:213) and the staleness re-hash (:301-303).
#     A path that is absent, or present but belonging to another decision, lands
#     in `stale`. Measured both ways on a real receipt pair: wrong-but-existing
#     plan -> blocking=0 stale=2; no --plan at all -> blocking=0 stale=0.
#   - This preflight CAN still block, and is meant to: it reads `blocking` for
#     design_critique_chain_divergent, which is driven by the prior receipt's
#     meta.design_critique_verdict (validate-cmd.js:485-503) and is completely
#     independent of planPath. Passing --plan neither causes nor suppresses it.
PRECHECK_PLAN=".claude/plans/${DECISION_SLUG}.plan.md"
# santa-loop R2 (Reviewer B) — the `|| PRECHECK_EXIT=$?` tail is load-bearing, not
# style. `validate` exits 2 on ANY non-ok result (classify.js), and BEFORE this
# milestone a plan-less call at this callsite could not go non-ok on staleness at
# all. Adding --plan makes exit 2 reachable here, and a bare `VAR=$(cmd)` whose
# command fails aborts the shell under `set -e` — before CHAIN_BLOCKED is ever
# parsed. Measured both ways: default shell -> next line runs, CHAIN_BLOCKED
# empty, no false stop; `set -e` -> the block aborts with exit 2. pr.md does not
# set -e today, so this was latent, but resting the guarantee below on "nobody
# enables set -e" is exactly the kind of implicit assumption this milestone
# exists to remove. The || form is exempt from set -e and preserves the code.
PRECHECK_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" validate \
  --command mccp:pr \
  --decision "$DECISION_SLUG" \
  --plan "$PRECHECK_PLAN" 2>&1) && PRECHECK_EXIT=0 || PRECHECK_EXIT=$?
# Look for design_critique_chain_divergent blocking entries specifically — other
# blocking reasons (missing receipt, schema invalid) are handled by Phase 2.5
# downstream.
CHAIN_BLOCKED=$(echo "$PRECHECK_JSON" | node -e '
  try {
    const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const hit = (j.blocking || []).find(b => b.kind === "design_critique_chain_divergent");
    process.stdout.write(hit ? JSON.stringify(hit) : "");
  } catch { process.stdout.write(""); }
')

if [ -n "$CHAIN_BLOCKED" ]; then
  echo "[MCCP-GATE-STOP] design-critique chain divergent — PR blocked." 1>&2
  echo "$CHAIN_BLOCKED" 1>&2
  echo "" 1>&2
  echo "Recovery: resolve the divergent finding in plan/implement (re-run the" 1>&2
  echo "critique loop with a fix), OR set MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN" 1>&2
  echo "with a substantive reason (≥30 chars, ≥3 words, no placeholder)." 1>&2
  exit 1
fi
```

Notes:

- `MCCP_DESIGN_CRITIQUE_MAX_RETRY` env is **ignored** in PR scope — there is
  no retry loop to cap. The env is honored only by `/mccp:plan` and
  `/mccp:prp-implement`.
- The audited escape `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` is honored by
  validate-cmd (strict reason validator). When active, the chain-check
  downgrades to advisory warning + receipt-write at 2.5.7 stamps
  `meta.pr_design_chain_skip_reason`.
- Existing 2.5.1 single-shot impeccable critique/audit calls (design-review
  surface for PR body inject) are unchanged. The PR-scope ban is on the
  **retry loop**, not on single-shot Skill invocations.

### Stage-aware routing RECOMMEND (v1.13.0 — review-only, never invoke)

The PR step is the design lifecycle's final stage. The routing oracle returns
the `pr` gate table as **recommend-only in every mode** (the oracle's `pr`
table degrades to `recommend` even under `auto` — review-only invariant, §1.2
PR-phase guard). pr.md therefore NEVER Edit/Write-invokes an impeccable command;
it only surfaces a recommend line so the operator can run the final passes
manually before/after merge:

```bash
MODE=$(node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-routing').parseRoutingMode(process.env))")
node -e "
  const r=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-routing');
  const out=r.routeCommands({gate:'pr', mode:process.argv[1], designSignal:true});
  out.commands.forEach(c=>process.stderr.write('[mccp:impeccable-routing] recommend (final pass): /impeccable '+c.command+'\n'));
" "$MODE"
```

This is informational stderr only — it does not gate, does not write a receipt
field, and does not invoke. polish/audit/harden are surfaced as the canonical
"between good and great" final passes.

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

### 2.5.1 — Detect design signal (PR-Impeccable, v0.2.6 Milestone 1)

Standardized helper invocation — `impeccable-detect.js` is the canonical
gate-branch decision source (Codex R1 F2 absorption: skill_available is the
primary axis, cli_available is telemetry only):

```bash
DETECT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect \
  --mode pr \
  --base "origin/<base>" \
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
# v1.3.0 M1 — silent-skip surface. detect() now emits silent_skip (SKILL_AVAIL=1
# + SIGNAL=0) so the silent fall-through is observable. mccp-pr-codex is a
# strict gate — receipt with silent_skip=true is non-approving at validation
# time.
SILENT_SKIP=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.silent_skip?"1":"0")}catch{process.stdout.write("0")}')
SILENT_SKIP_REASON=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.silent_skip_reason||"")}catch{process.stdout.write("")}')
```

Decision tree (v1.3.0 M1 — silent-skip is no longer silent):

| SKILL_AVAIL | SIGNAL | Action |
|---|---|---|
| 0 | * | Record `> impeccable unavailable, skipped (auto-fallback): $DETECT_REASON` in the in-memory `## Design Review` section. **Export** `IMPECCABLE_SKIPPED_REASON="$DETECT_REASON"` so 2.5.7 forwards it. Then check `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` (see 2.5.5c). |
| 1 | 0 | Detector found no design surface on this PR. Emit a loud stderr warn (`[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · PR declares no design surface (whitelist hit 0)`) and forward `--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON"` to 2.5.7 — UNLESS `IMPECCABLE_FORCE_OVERRIDE_REASON` is set, in which case the silent_skip forward is suppressed (schema mutex). M1 records silent_skip as informational warning at every gate; M2 will promote to blocking once SKILL first-step + critique loop are wired (Codex F2 deferred). |
| 1 | 1 | Invoke the resolved call form (see the call-form rule below) twice — with `critique <PR title or branch name>` and with `audit <PR title or branch name>` (critique+audit both since `29ded48`, 2026-06-03 Sprint 3). Capture highlights — Phase 4 injects them into PR body as `## Design Review`. **`audit` is advisory** — review-only, it surfaces in `## Design Review` but never blocks this gate; only the Phase 1.6 critique chain-check blocks (framing parallel to `code-review.md` 2.5.2). If the call-form line is absent, or the resolved call still returns `unknown_skill` / `not found`, fall back to the skipped path (set `IMPECCABLE_SKIPPED_REASON="skill-missing"`). |

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

**An absent line means the skill did not resolve** — take the skipped path (`IMPECCABLE_SKIPPED_REASON="skill-missing"`).
Never guess a name, and in particular never fall back to the bare name
`impeccable` as a hardcoded call: from v1.31.3 this repository ships no bare
copy, so a guessed bare call reaches `unknown_skill` and records a skip the
gate did not have to take.

Loud stderr warn for the SKILL_AVAIL=1 SIGNAL=0 row (M1 Task 3):

```bash
if [ "$SKILL_AVAIL" = "1" ] && [ "$SIGNAL" = "0" ]; then
  echo "[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · PR declares no design surface (whitelist hit 0)" 1>&2
fi
```

The receipt-write step (2.5.7) forwards:
- `--impeccable-skipped` + `--impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON"` when SKILL_AVAIL=0 or Skill fell back.
- `--impeccable-silent-skip` + `--impeccable-silent-skip-reason "$SILENT_SKIP_REASON"` when SILENT_SKIP=1 AND `IMPECCABLE_FORCE_OVERRIDE_REASON` is empty.
- validate-cmd treats `impeccable_skipped` as **blocking on strict gates** (audited escape via Phase 0.1 honored). `impeccable_silent_skip` is **informational warning at every gate** in M1; M2 will promote to blocking after the SKILL first-step + critique loop are wired.

### 2.5.2 — Cross-gate dedupe check (deterministic)

Use the receipt CLI's `dedupe` subcommand instead of inferring file membership from the plan. The CLI parses the plan's `## Files to Change` table, runs `git diff --name-only` against the base ref, and (if the implement-codex receipt exists) layers on `git diff --name-only <implement.head_sha>..HEAD` so that planned files modified **after** the implement gate are not silently excluded.

```bash
# Decision slug derives the same way as 2.5.7 (and as the hook computes it)
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:pr \
  --args "$ARGUMENTS")

# v1.20.3 (Task 7, Codex R1 F1) — hard-reset any inherited/stale CODEX_DEDUPE_AT_PR
# before evaluating dedupe. This flag is NOT a user knob — it is auto-derived
# fresh below and consumed by 2.5.3's `--dedupe`. If a prior chain (or a shell
# working around a stale receipt) left it exported, honoring it would skip
# PR-Codex on this run regardless of the CURRENT convergence state — a dual-review
# bypass. evaluateForDedupe is now fail-closed on codex_verdict, but the env flag
# is a SEPARATE bypass surface, so we neutralize it here and let ONLY the fresh
# skip_safe re-export it. (Phase 0.3's mutex preflight already ran; unsetting here
# never masks that guard — it fired earlier on the stale value if a conflict
# existed.)
unset CODEX_DEDUPE_AT_PR

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
| `ok === true && skip_safe === true` | Export `CODEX_DEDUPE_AT_PR=1` (v0.2.8 Task 2.6.1 — Phase 2.5.7 forwards `--codex-dedupe-at-pr` to receipt). **This is the ONLY place the flag may be set** — the entry `unset` above cleared any stale value, so `--dedupe` at 2.5.3 now reflects strictly the current evaluation. Since `evaluateForDedupe` is fail-closed on `codex_verdict` (v1.20.3), `skip_safe===true` here already means both gates recorded `codex_verdict==='converged'`. Record the dedupe note (template below) and proceed to 2.5.3 with `CODEX_OUTCOME=deduped` (short-circuits the Codex call). The lock-enter still happens so the review-only invariant is enforced across body construction. |
| `ok === true && skip_safe === false && residual.length > 0` | Feed `residual` as the focus areas to Codex in 2.5.3. Record a partial-dedupe note (template below). Do **not** export `CODEX_DEDUPE_AT_PR` — partial dedupe still runs Codex on residual. |

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

Use `convergence.plan_codex_receipt.round` and `convergence.implement_codex_receipt.round` from the JSON for N1 / N2. Each `convergence.*_codex_receipt` also carries `codex_verdict` (the real Codex outcome). If either receipt is missing or its `codex_verdict !== 'converged'` (v1.20.3 — including a **missing** verdict on a legacy receipt, which fail-closes), the CLI sets `skip_safe = false` automatically with a `reason` like `"plan-codex codex_verdict !== \"converged\" (or receipt missing) — dual-review required (fail-closed)"`. Treat that as the normal non-deduped path — PR-Codex runs.

### 2.5.3 — Invoke Codex with --base (v0.2.8 Task 2.6.1-followup F10 helper)

**v0.2.8 Task 2.6.1 review-only invariant — declarative + runtime guard.**

> Findings → PR body inject only. **NO Edit/Write/MultiEdit calls in this command body.** Fix-cycle is forbidden inside `/mccp:pr` — users invoke a separate `/mccp:plan` or `/mccp:prp-implement` after `/mccp:pr` exits. The runtime `pr-phase-guard.js` hook + `pr-phase-lock.js` CLI mechanically enforce this so a single AI lapse cannot mutate code mid-review. See [scripts/hooks/pr-phase-guard.js](../scripts/hooks/pr-phase-guard.js).

**v0.2.8 Task 2.6.1-followup F10 + F11 R3-F2 — single helper owns the full Codex-review subphase**:

`codex-runner.js` orchestrates the entire Codex-review subphase end-to-end:

- Acquires the `pr-phase` lock via `pr-phase-lock.js enter` using anonymous-pipe IPC (raw `ownership_token` captured in-process, never written to argv/env/FS — F11 R3-F2 contract).
- Forks a background heartbeat process and pipes the raw token via stdin (token never appears in heartbeat argv or env).
- Runs `codex-invoke.js adversarial-review` (long-running spawnSync, up to 900s).
- On Codex success → `pr-phase-lock.js exit` via stdin-pipe token (mutations detector finalizes).
- On Codex blocking/failure → releases lock first, then fail-stops cleanly.
- Emits a single JSON envelope: `{ ok, codex_outcome, codex_rounds, codex_summary, codex_actionable_findings, lock_exit_ok, mutations, run_id, helper_manifest, codex_skip_reason }`.

The helper handles all three branches (`invoked` / `skipped` / `deduped`) internally — pr.md does NOT need separate Bash branching. Pass `--skip-reason "$CODEX_SKIP_AT_PR_REASON"` for the Phase 0.2 skip path, `--dedupe` for the 2.5.2 cross-gate dedupe path, or neither for the normal invoke path.

```bash
# Worktree-safe tmp dir. In a git worktree, `.git` is a FILE (gitdir pointer),
# not a directory, so a literal `.git/mccp/tmp` fails with "Not a directory".
# Resolve the real gitdir via `git rev-parse --git-dir` (returns the worktree's
# actual gitdir, e.g. `<repo>/.git/worktrees/<name>`).
MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"
mkdir -p "$MCCP_TMP"
BODY_FILE_PATH=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" pr-body \
  --action path \
  --decision "$DECISION_SLUG" \
  --head "$(git rev-parse HEAD)")

# Build helper flags. Skip/dedupe are mutually exclusive — Phase 0.3 preflight
# (F9 — separate step) catches a conflicting combination. Empty/unset env vars
# omit the flag so codex-runner takes the "invoked" branch.
RUNNER_FLAGS=(--base "<base-branch>" --decision "$DECISION_SLUG" --body-file "$BODY_FILE_PATH")
if [ -n "${CODEX_SKIP_AT_PR_REASON:-}" ]; then
  RUNNER_FLAGS+=(--skip-reason "$CODEX_SKIP_AT_PR_REASON")
elif [ "${CODEX_DEDUPE_AT_PR:-0}" = "1" ]; then
  RUNNER_FLAGS+=(--dedupe)
fi

# codex-intent-context M1 (Task 10) — L1 ONLY. Rebuild the user-intent reference
# from the plan's `## User Intent` table and forward it so PR-Codex reviews the diff
# against what the USER asked for, not just against internal consistency. The L2-A
# adjudication gate is NOT re-run here: findings are triaged at the plan step, and
# this gate is review-only. Section absent / unreadable → no flag, review proceeds
# unchanged (fail-open — intent context enriches this gate, it never blocks it).
INTENT_REF_FILE="$MCCP_TMP/intent-reference-$(node -e 'process.stdout.write(require("crypto").randomUUID())').txt"
node -e '
  const ic = require(process.argv[1] + "/scripts/lib/intent-context");
  const fs = require("fs");
  let planText = "";
  try { planText = fs.readFileSync(process.argv[2], "utf8"); } catch (_) { process.exit(3); }
  const s = ic.extractIntentSection(planText);
  if (!s.present) process.exit(3);
  fs.writeFileSync(process.argv[3], ic.buildIntentReference(s.items), { mode: 0o600 });
' "${CLAUDE_PLUGIN_ROOT}" "<plan path>" "$INTENT_REF_FILE" 2>/dev/null \
  && RUNNER_FLAGS+=(--intent-reference-file "$INTENT_REF_FILE") \
  || echo "[mccp:intent] no usable ## User Intent section — PR-Codex proceeds without it" 1>&2

CODEX_RESULT_FILE="$MCCP_TMP/codex-result.json"
# v0.2.9 — codex-runner.js inherits env into the codex-invoke child process. No code change in the helper needed.
#
# review-loop-bypass M1 — the cap the child inherits comes from the shared oracle,
# not from a literal here. This is the one place in the three gates where the round
# budget is enforced MECHANICALLY rather than by prose: the child process cannot
# read past what it is handed. `effectiveRoundCap` pins the value to 1 whenever
# MCCP_REVIEW_SINGLE_PASS carries a valid reason, regardless of what
# MCCP_GATE_ROUND_CAP says — the toggle is the policy declaration and the cap is a
# knob underneath it, so the knob does not overturn it.
#
# The oracle returns an object; only `.cap` is exported. `.pinned`/`.reason` exist
# so the reason a cap is 1 does not vanish from the logs.
ROUND_CAP_JSON=$(node -e '
  const root = process.argv[1];
  const policy = require(root + "/scripts/lib/codex-policy");
  const {effectiveRoundCap} = require(root + "/scripts/lib/review-single-pass");
  const gitDir = policy.resolveGitDir(process.cwd());
  const codexDisabled = policy.resolveCodexDisabled({ gitDir: gitDir, env: process.env });
  process.stdout.write(JSON.stringify(effectiveRoundCap(process.env, { codexDisabled: codexDisabled })));
' "${CLAUDE_PLUGIN_ROOT}")
export MCCP_GATE_ROUND_CAP=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).cap))}catch{process.stdout.write("1")}' <<<"$ROUND_CAP_JSON")
node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(j.note)process.stderr.write("[mccp:round-cap] "+j.note+" (pinnedBy="+j.pinnedBy+")
")}catch(_){}' <<<"$ROUND_CAP_JSON"
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-helpers/codex-runner.js" "${RUNNER_FLAGS[@]}" > "$CODEX_RESULT_FILE"
CODEX_RUNNER_EXIT=$?
if [ "$CODEX_RUNNER_EXIT" != "0" ]; then
  echo "[MCCP-GATE-STOP] codex-runner failed (exit=$CODEX_RUNNER_EXIT)." 1>&2
  echo "Inspect: cat $CODEX_RESULT_FILE  AND  cat $MCCP_TMP/codex-invoke.stderr" 1>&2
  exit 1
fi

# Parse the result JSON into the variables downstream sub-steps expect. This
# is the ONLY shell consumption of token-adjacent state — the raw token never
# crossed any helper's argv or env (R3-F2 contract verified by helper unit tests).
CODEX_OUTCOME=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.codex_outcome||"invoked")}catch{process.stdout.write("invoked")}' < "$CODEX_RESULT_FILE")
CODEX_ROUNDS=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(j.codex_rounds||0))}catch{process.stdout.write("0")}' < "$CODEX_RESULT_FILE")
CODEX_SUMMARY=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.codex_summary||"")}catch{process.stdout.write("")}' < "$CODEX_RESULT_FILE")
CODEX_ACTIONABLE_FINDINGS=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.codex_actionable_findings?"1":"0")}catch{process.stdout.write("0")}' < "$CODEX_RESULT_FILE")
LOCK_EXIT_OK=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.lock_exit_ok?"1":"0")}catch{process.stdout.write("0")}' < "$CODEX_RESULT_FILE")
# v1.22.3 M3 follow-up (R1 F1) — the RAW verdict + the scope-excluded qualifier.
# CODEX_VERDICT_RAW is what the model literally said; CODEX_SCOPE_EXCLUDED marks a
# raw non-approve whose every itemized finding was design/a11y-scoped and dropped.
# 2.5.4 must state BOTH — an effective pass over a "No ship" verdict is never
# allowed to read as a plain approval.
CODEX_VERDICT_RAW=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.codex_verdict||"")}catch{process.stdout.write("")}' < "$CODEX_RESULT_FILE")
CODEX_SCOPE_EXCLUDED=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.codex_scope_excluded_verdict?"1":"0")}catch{process.stdout.write("0")}' < "$CODEX_RESULT_FILE")
DESIGN_DROPPED=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(j.design_findings_dropped||0))}catch{process.stdout.write("0")}' < "$CODEX_RESULT_FILE")
A11Y_ROUTED=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.a11y_routed_to_impeccable?"1":"0")}catch{process.stdout.write("0")}' < "$CODEX_RESULT_FILE")
```

If `LOCK_EXIT_OK != 1`, Phase 2.5.6b's finalizer will fail-stop with the violation details from `mutations[]`. The lock file has already been released by `codex-runner.js`.

### 2.5.4 — Inject review section + auto-rerun on Divergent, persist body draft

Construct the `## Codex Adversarial Review` PR body section with the same schema as Plan-Codex:

```markdown
## Codex Adversarial Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review --base <base-branch>` (v0.2.2 fail-closed Bash wrapper)
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

#### Scope-excluded block — explain it, never stonewall (v1.22.3 M3 follow-up, R1 F1 + Implement-Codex R1 F4)

When `CODEX_SCOPE_EXCLUDED=1`, Codex returned a **raw non-approving verdict** and every itemized finding matched the design/a11y scope filter, leaving zero findings on the review surface.

**This stays NON-APPROVING.** An earlier design mapped it to an effective `converged`; that was withdrawn because the drop decision is a broad keyword match over free text and the producer emits no category/scope field to verify it against — so a genuine in-scope finding ("Brand asset loader reads arbitrary local files") could be dropped and the review recorded as convergence. Keyword evidence is good enough to ROUTE a finding and to AUDIT it, not to certify approval.

Be precise about what that buys: `codex_actionable_findings` (the count of findings that survived the scope filter) has no hard-stop of its own — this body only parses it. But the **verdict** now does. Because the receipt seals `divergent`, the integrity-unification **M3 ship gate** mechanically HALTs the ship: finalize (2.5.7) re-reads the just-written receipt and returns exit 12 on any non-approving verdict, and the self-gate read-back (2.5.9) re-checks it via `validate --check-ship-verdict`. So a scope-excluded non-approve now yields (a) cross-gate dedupe fail-closes and a later `/mccp:pr` re-runs PR-Codex, (b) this section states the objection, AND (c) from M3 the PR **is** blocked from shipping — unless `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` is set with a substantive reason (Phase 0.4), and even then the sealed `divergent` verdict is preserved (the override unblocks the ship, it does not rewrite the verdict).

What this flag fixes is the **opacity** — which is what the original complaint was about. Say exactly what happened instead of showing an empty conclusion:

```markdown
- 합치 결론: Codex raw verdict=`<CODEX_VERDICT_RAW>` — **non-approving 유지**(receipt `divergent` 봉인). itemized finding <DESIGN_DROPPED + a11y>건이 전부 design/a11y scope로 분류돼 review 표면에서 라우팅됐다(design → impeccable, a11y → a11y-architect).
  in-scope 표면은 비어 있으나, 키워드 매칭은 "오직 design"임을 증명하지 못하므로(producer에 scope 필드 부재) 통과 근거가 될 수 없다.
  drop된 항목은 receipt `meta.dropped_findings_digest`로 재현 가능하며 raw verdict는 `meta.codex_raw_verdict`에 보존된다.
  해소: 라우팅된 finding을 해당 소유자(impeccable / a11y-architect)에서 처리한 뒤 재실행.
```

Do NOT collapse this to "Codex approved" and do NOT leave 합치 결론 blank. The raw verdict, the dropped count, and the routing owner all belong in the line — that is what turns a stonewall into an auditable block.

Severity-gated re-rerun (default cap=1): after R1's YAGNI triage table is written, escalate ONLY if BOTH:
  (a) ≥1 finding is `verdict=ACCEPT_NOW` AND `severity ∈ {CRITICAL, HIGH}`
  (b) The R1 absorption could not fully resolve it (Claude self-attests in PR body)
If escalate triggers, run R2 with focus restricted to the unresolved item(s).

> **Codex가 비활성이면 R2는 존재하지 않는다.** 캡이 1로 pin되어 있고, 설령 그 캡을
> 지나쳐 호출하더라도 `codex-invoke.js`가 spawn 직전에 봉인된 정책을 읽어
> `disabled`로 short-circuit한다.
>
> **`MCCP_CODEX_DISABLED`는 1회성 escape가 아니라 영구 운영자 정책이다.** 게이트는
> 어떤 라운드에서도 이 변수를 해제하거나 override하거나 `0`으로 재설정하지 않는다.
> R1이 이를 소진하지 않는다. 진짜 1회성인 형제 토글들(`MCCP_SKIP_RECEIPT`,
> `MCCP_PR_SKIP_CODEX_REVIEW`)과 혼동하지 말 것.

Repeat up to `$ROUND_CAP` — the value the shared oracle produced above, NOT the raw
`MCCP_GATE_ROUND_CAP` (default `1`, allowed `1`/`2`/`3`). The oracle pins it to 1 when
the single-pass toggle is set or when Codex is disabled, and quoting the raw env here
would tell the reader a cap the gate is not actually using. Beyond the cap,
annotate `Open Questions: DIVERGENT_UNRESOLVED` and proceed.

> **이 캡은 v1.33.4부터 산문이 아니다.** 초과 호출은 `codex-invoke.js`가 spawn 직전에
> 거부하고 `round-cap-reached`를 돌려주므로 Codex는 발화하지 않는다. 다만 이 게이트는
> plan·prp-implement와 달리 그 분류를 `divergent`로 매핑하지 **않는다** — 그렇게 하려면
> ship-gate proof 경로(`codex_outcome` enum과 verdict map)를 바꿔야 하고 그것은 이
> milestone의 Files to Change 밖이다. 여기서는 `codex-runner.js`가 HALT하되 "예산을 다
> 썼다"를 장애와 구별해 말하고 두 복구 경로를 제시한다. 원장은 게이트별이라 첫 `/mccp:pr`은
> 절대 걸리지 않는다.

If no `ACCEPT_NOW` HIGH/CRITICAL remains, stop at R1.

All `DEFER_TO_BACKLOG` items: append a line to `.claude/plans/codex-findings-backlog.md`
before Phase 2.5.5. Format:
- `YYYY-MM-DD | <severity> | <source plan path> | <one-line finding>`

**Persist the draft body to disk** so it survives between phases without shell quoting. After the section text is final for this round, write it (combined with any `## Design Review` from 2.5.1 and the dedupe note from 2.5.2) to a body-file under the worktree-safe tmp dir (`$MCCP_TMP`, i.e. `<gitdir>/mccp/tmp/` — the `pr-body` CLI resolves the real gitdir):

```bash
HEAD_SHA=$(git rev-parse HEAD)
# Task A4 (F2-a) — persist the capture-time HEAD_SHA durably so Phase 4 reads the
# SAME value instead of re-running `git rev-parse HEAD`. The body-file is keyed on
# this sha; the Phase 3 evidence-commit moves HEAD between here and Phase 4, so a
# recomputed sha would miss the body-file and silently drop the `## Design Review`
# / `## Codex Adversarial Review` sections.
GITDIR=$(git rev-parse --git-dir)   # worktree-safe (§3.8)
mkdir -p "$GITDIR/mccp/tmp"
printf '%s' "$HEAD_SHA" > "$GITDIR/mccp/tmp/pr-head-sha-${DECISION_SLUG}.txt"

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

The body-file path is `<gitdir>/mccp/tmp/pr-body-<slug>-<short-sha>.md` (gitdir resolved by the `pr-body` CLI — worktree-safe). Phase 4 reads it, prepends the title-derived summary, and passes the final file to `gh pr create --body-file`. Phase 4's cleanup step deletes it after a successful PR create.

If 2.5.3 hit the Codex auto-fallback, still persist the body — the `> Codex unavailable, skipped (auto-fallback)` line and any `## Design Review` content must reach Phase 4.

### 2.5.5 — Security-sensitive branch (HIGH)

If the diff touches any of: auth/authz, session/token, crypto/hash/sign/key management, secret/credential handling, input validation, SQL/cmd injection paths, SSRF, path traversal, privilege escalation — additionally invoke the **Task tool** with the canonical contract:

- `subagent_type: "security-reviewer"`
- prompt: `"review this PR diff against base <base-branch>: <list affected security areas>"`

Pass the Codex result from 2.5.4 as context input (so security-reviewer doesn't duplicate). Integrate findings into the same `## Codex Adversarial Review` section under a `### Security Reviewer` subheading.

**Terminal-command fail-mode (hard-block by default):** If the Task tool returns "agent not found", harness rejection, schema mismatch, or any non-success result, `/mccp:pr` is a **terminal mutating command** — refuse to proceed by default. Output `[MCCP-GATE-STOP] security-reviewer unavailable; PR creation refused.` and end the response. Receipt MUST NOT be written.

**Audited escape hatch (`MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER`):**

The hard-block above can be opted out via `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="<specific reason string>"`. Single-token reasons (e.g. `=1`, `=yes`) trigger a schema warning and the command MUST prompt the user for a specific reason. When set with a specific reason:

- Record `> security-reviewer unavailable, force-override (audited): <reason text>` under `### Security Reviewer` in the same `## Codex Adversarial Review` section.
- **Export the override state for downstream steps** (Codex Round 1 F3 — without this export, Phase 2.5.5b can't re-persist the body and Phase 2.5.7 can't stamp the receipt; the override silently degrades to an approving receipt + PR body without the audit section):

  ```bash
  export SECURITY_FORCE_OVERRIDE_REASON="<reason text from env var>"
  ```

- Receipt-write (Phase 2.5.7) MUST pass `--security-force-override` + `--security-force-override-reason "<reason text>"`. The receipt records `meta.security_force_override: true` + `meta.security_force_override_reason: <reason>`. Validator treats force-override receipts as **non-approving** (warnings[], not blocking[]) — PR creation proceeds.
- `meta.security_skipped=true` and `meta.security_force_override=true` simultaneously on the same receipt is a **schema invariant violation** (Task 11 4-axis state matrix; rejected at write time).
- Phase 4 PR body MUST auto-inject the `## Security Reviewer Override` audit section (see Phase 4 below) — this PR body section is the **canonical audit source** because `.claude/receipts/` is git-ignored. Reviewer MUST confirm the override reason is acceptable before merge.

The env var is intended for **one-shot use** (e.g. codex registry stale + manual security review confirmed out-of-band). Do not export it persistently.

### 2.5.5b — Re-persist PR body with security-reviewer additions

Phase 2.5.4 wrote the body-file **before** Phase 2.5.5 ran, so any
`### Security Reviewer` subheading (real findings, auto-fallback note, or
audited override line) and any `## Security Reviewer Override` section are
not yet in the body-file on disk. Re-persist now so Phase 4's `--body-file`
read sees the security additions (Codex Round 1 F3):

```bash
HEAD_SHA=$(git rev-parse HEAD)
# Task A4 (F2-a) — keep the durable passthrough in lockstep with the LAST
# body-file write (this re-persist re-keys the body-file on the current sha).
GITDIR=$(git rev-parse --git-dir)
mkdir -p "$GITDIR/mccp/tmp"
printf '%s' "$HEAD_SHA" > "$GITDIR/mccp/tmp/pr-head-sha-${DECISION_SLUG}.txt"
TMP_CONTENT=$(mktemp 2>/dev/null || echo "$TMPDIR/mccp-pr-body-$$.md")
{
  echo "## Design Review"
  echo "<re-inject 2.5.1 content, or '> impeccable unavailable, skipped (auto-fallback)'>"
  echo ""
  echo "## Codex Adversarial Review"
  echo "<re-inject 2.5.4 codex content + 2.5.5 '### Security Reviewer' subsection if present>"
  if [ -n "$SECURITY_FORCE_OVERRIDE_REASON" ]; then
    echo ""
    echo "## Security Reviewer Override"
    echo ""
    echo "- **Triggered by**: \`MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER\`"
    echo "- **Reason**: $SECURITY_FORCE_OVERRIDE_REASON"
    echo "- **Receipt path**: .claude/receipts/mccp-pr-codex/${DECISION_SLUG}.json (working-tree-only, ephemeral)"
    echo "- **Timestamp**: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "- **Audit canonical**: This PR body section. Receipt is local audit aid."
    echo "- **Reviewer action**: Confirm override reason is acceptable before merge."
  fi
} > "$TMP_CONTENT"

node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js pr-body \
  --action write \
  --decision ${DECISION_SLUG} \
  --head ${HEAD_SHA} \
  --content-file "$TMP_CONTENT"
rm -f "$TMP_CONTENT"
```

If Phase 2.5.5 took the hard-block path (no findings, no override), this
step is a no-op overwrite of the same body — safe and idempotent.

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
3. End the response. Release the lock first: `node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-lock.js" exit --run-id "$RUN_ID" --ownership-token "$OWNERSHIP_TOKEN" 2>/dev/null || true`.

### 2.5.6b — Finalize Codex-review subphase lock check (v0.2.8 Task 2.6.1-followup F10)

`codex-runner.js` already called `pr-phase-lock.js exit` internally and captured the mutations finalizer. The lock file is gone. Re-read `CODEX_RESULT_FILE` for the `mutations[]` array and bail if any review-only invariant breach was detected.

```bash
MUTATIONS=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(j.mutations||[]))}catch{process.stdout.write("[]")}' < "$CODEX_RESULT_FILE")
BASELINE_MISSING=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.baseline_missing?"1":"0")}catch{process.stdout.write("1")}' < "$CODEX_RESULT_FILE")

if [ "$LOCK_EXIT_OK" != "1" ]; then
  echo "[MCCP-GATE-STOP] PR-phase guard finalizer detected violations (review-only invariant breach)." 1>&2
  echo "  baseline_missing: $BASELINE_MISSING" 1>&2
  echo "  mutations: $MUTATIONS" 1>&2
  echo "" 1>&2
  echo "Per Task 2.6.1: PR body finds → audit trail only. Fix-cycle must be a separate /mccp:plan or /mccp:prp-implement invocation after /mccp:pr exits." 1>&2
  exit 1
fi
```

If `LOCK_EXIT_OK=1`, proceed to 2.5.6c. If `baseline_missing=true`, the receipt verdict is forced to non-approving via `--codex-actionable-findings`. The lock file was unlinked by `codex-runner.js` so the next `/mccp:pr` invocation starts fresh.

### 2.5.6c — a11y-architect auto-invoke (v1.13.0 M3, review-only, dedicated lock window)

The Codex-review lock is already released (2.5.6b). When the PR diff touches a rendered design surface, auto-invoke `mccp:a11y-architect` to review it for WCAG 2.2 — but inside a **fresh pr-phase lock window** so the mutations finalizer mechanically proves the agent did not edit (Codex R1 F2). The trigger is `rendering_surface`, NOT the presence of Codex a11y findings (Codex R1 F1 — the design-scope preamble usually strips a11y from Codex output before the filter sees it). `a11y_findings` from `codex-result.json` is supplementary input.

```bash
A11Y_AUTO=$([ "${MCCP_A11Y_AUTO_INVOKE:-1}" != "0" ] && echo 1 || echo 0)
RENDERING_SURFACE=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.rendering_surface?"1":"0")}catch{process.stdout.write("0")}' < "$CODEX_RESULT_FILE")
A11Y_INVOKED=0

if [ "$A11Y_AUTO" = "1" ] && [ "$RENDERING_SURFACE" = "1" ]; then
  A11Y_FINDINGS_JSON=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(j.a11y_findings||[]))}catch{process.stdout.write("[]")}' < "$CODEX_RESULT_FILE")
  A11Y_RUN_ID=$(node -e 'console.log(crypto.randomUUID())')
  # Enter a dedicated a11y-review lock. stdout returns the raw ownership token
  # (F11 sealed-channel); exit reads it back via stdin-pipe. baseline captured
  # at enter is the diff window the mutations finalizer compares against.
  A11Y_ENTER=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-lock.js" enter \
    --run-id "$A11Y_RUN_ID" --pid $$ --subphase a11y-review --cwd "$(pwd)" 2>/dev/null)
  A11Y_TOKEN=$(echo "$A11Y_ENTER" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).ownership_token||"")}catch{process.stdout.write("")}')
fi
```

When the lock entered successfully, invoke the agent **within the lock window** (review-only — it MUST NOT edit; the finalizer is the mechanical backstop):

- `Task(subagent_type: "mccp:a11y-architect")`
- prompt: review the PR diff (changed files: `git diff <base>...HEAD --name-only`) for WCAG 2.2 compliance. Use `$A11Y_FINDINGS_JSON` as supplementary signal. **Report findings + remediation suggestions ONLY — do NOT edit any file** (a dedicated pr-phase lock is active; any write is a review-only invariant breach and will hard-stop the PR).

Capture the agent's report text into `A11Y_REVIEW_OUTPUT` for the Phase 4 PR body inject. Then exit the lock and enforce the finalizer:

```bash
if [ -n "$A11Y_TOKEN" ]; then
  A11Y_EXIT=$(printf '%s' "$A11Y_TOKEN" | node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-lock.js" exit \
    --run-id "$A11Y_RUN_ID" --ownership-token-stdin --cwd "$(pwd)" 2>/dev/null)
  A11Y_MUTATIONS=$(echo "$A11Y_EXIT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(j.mutations||[]))}catch{process.stdout.write("[]")}')
  if [ "$A11Y_MUTATIONS" != "[]" ]; then
    echo "[MCCP-GATE-STOP] a11y-architect violated review-only invariant (edited files during a11y-review lock)." 1>&2
    echo "  mutations: $A11Y_MUTATIONS" 1>&2
    exit 1
  fi
  A11Y_INVOKED=1
  # Stamp the result into codex-result.json so finalize-receipt (2.5.7) forwards
  # --a11y-auto-invoked via deriveCodexFlags (Codex R1 F3).
  node -e '
    const fs=require("fs");
    const p=process.argv[1];
    const j=JSON.parse(fs.readFileSync(p,"utf8"));
    j.a11y_auto_invoked=true;
    fs.writeFileSync(p, JSON.stringify(j));
  ' "$CODEX_RESULT_FILE"
fi
```

If `A11Y_AUTO=0` or `RENDERING_SURFACE=0`, skip the Task entirely and leave `codex-result.json` untouched (no `## Accessibility Review` section in Phase 4). Kill switch: `MCCP_A11Y_AUTO_INVOKE=0`.

### 2.5.7 — Write mccp-pr-codex receipt via finalize-receipt helper (F10)

`finalize-receipt.js` reads the `codex-result.json` produced by `codex-runner.js`, derives the conditional WRITE_FLAGS internally (codex-skipped / codex-dedupe / codex-actionable-findings), and invokes `receipt/cli.js write` in one call. No Bash array construction.

```bash
# Decision slug derives deterministically (same as 2.5.2 and 2.5.8 read-back).
DECISION_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision \
  --command mccp:pr \
  --args "$ARGUMENTS")

# Build the finalize-receipt flag list. Helper handles codex-result-driven
# conditional flags internally (skipped/dedupe/actionable) — caller only
# forwards the env-driven overrides.
FINALIZE_FLAGS=(--gate mccp-pr-codex
  --decision "$DECISION_SLUG"
  --plan "<plan path or PR title>"
  --codex-result "$CODEX_RESULT_FILE"
  --quiet)
if [ -n "$SECURITY_FORCE_OVERRIDE_REASON" ]; then
  FINALIZE_FLAGS+=(--security-force-override-reason "$SECURITY_FORCE_OVERRIDE_REASON")
fi
if [ -n "$IMPECCABLE_SKIPPED_REASON" ]; then
  FINALIZE_FLAGS+=(--impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON")
fi
# v1.3.0 M1 — silent-skip surface. impeccable_silent_skip + impeccable_skipped
# are runtime-mutually-exclusive (skill_available true vs false); detector emits
# one OR the other, not both. Schema also rejects silent_skip + force_override
# coexisting on the same receipt — so when IMPECCABLE_FORCE_OVERRIDE_REASON is
# set we suppress the silent_skip forward and let the audited escape path
# produce a force_override-only receipt (the validator surfaces that via the
# impeccable_force_override warning).
if [ "$SILENT_SKIP" = "1" ] && [ -z "${IMPECCABLE_FORCE_OVERRIDE_REASON:-}" ]; then
  FINALIZE_FLAGS+=(--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON")
fi
# v1.3.0-m2 Task 8 (F3 absorption) — pr-design-chain-skip-reason audited escape
# forward. Only set when Phase 1.6 chain-check entered advisory mode with a
# substantive MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN reason. Receipt stamps the
# audit; Phase 4 PR body inject adds a `## Design Critique Chain Skipped`
# footer (canonical audit source — receipts dir is git-ignored).
if [ -n "${MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN:-}" ]; then
  REASON_OK=$(node -e "
    const { validateReason } = require('${CLAUDE_PLUGIN_ROOT}/scripts/receipt/lib/force-override-reason');
    const r = validateReason(process.env.MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN, { strict: true });
    process.stdout.write(r.ok ? '1' : '0');
  " 2>/dev/null)
  if [ "$REASON_OK" = "1" ]; then
    FINALIZE_FLAGS+=(--pr-design-chain-skip-reason "$MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN")
  fi
fi
# integrity-unification M3 — PR-Codex ship-gate audited override forward. Phase 0.4
# validated the reason and exported PR_CODEX_FORCE_OVERRIDE_REASON. Forwarding it
# makes finalize stamp meta.pr_codex_force_override=true + reason (schema re-runs the
# strict validator) AND makes finalize's in-process ship-gate let this ship through
# WITHOUT rewriting the sealed verdict.
if [ -n "${PR_CODEX_FORCE_OVERRIDE_REASON:-}" ]; then
  FINALIZE_FLAGS+=(--pr-codex-force-override-reason "$PR_CODEX_FORCE_OVERRIDE_REASON")
fi

FINALIZE_OUT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-helpers/finalize-receipt.js" "${FINALIZE_FLAGS[@]}")
FINALIZE_EXIT=$?
if [ "$FINALIZE_EXIT" = "12" ]; then
  # integrity-unification M3 — RUNTIME PRIMARY ship gate blocked this ship: PR-Codex
  # returned a non-approving verdict (divergent/critical/unavailable/absent). The
  # helper already printed the precise [MCCP-GATE-STOP] with the verdict + override
  # instructions. This is the mechanical hard-stop the M3 backlog HIGH asked for.
  # Do NOT push. Do NOT enter Phase 3.
  echo "[MCCP-GATE-STOP] PR-Codex ship gate blocked this ship (finalize exit 12 — non-approving verdict)." 1>&2
  echo "  Resolve the divergence (re-run so PR-Codex re-fires on the fresh diff)," 1>&2
  echo "  or set MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE=\"<substantive reason ≥30 chars, ≥3 words>\"" 1>&2
  echo "  (Phase 0.4) for an audited override that ships WITHOUT rewriting the sealed verdict." 1>&2
  exit 1
elif [ "$FINALIZE_EXIT" != "0" ]; then
  echo "[MCCP-GATE-STOP] finalize-receipt failed (exit=$FINALIZE_EXIT)." 1>&2
  exit 1
fi
# R3 F5 — capture the receipt_hash finalize sealed so the 2.5.9 read-back can bind
# to THIS write (defense-in-depth against a same-decision/head receipt swap).
FINALIZE_RECEIPT_HASH=$(printf '%s' "$FINALIZE_OUT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.receipt_hash||"")}catch{process.stdout.write("")}')
```

Bash hook block handling: same as Plan-Codex Phase 7.6 — output `[MCCP-GATE-STOP]` with captured hook stderr and end the response. Do NOT enter Phase 3.

### 2.5.8 — Read-back validate, then continue to Phase 3

```bash
# v1.3.1: forward --decision/--plan explicitly so the validator scopes to the
# correct receipt instead of falling back to decisionId='default' (Codex R1 F1).
# This is the downstream chain check for /mccp:code-review (PR Review Mode).
#
# v1.25.2 G2 (gate-guard-integrity M3, C6) — `--plan` is a REAL shell variable
# here, self-derived exactly as 2.5.9 does. It used to be the literal placeholder
# `<plan path>`, which made this the one gating validate callsite in this file
# still depending on the model substituting it. That is not a mechanical gate:
# substituted wrong it is a bash SYNTAX ERROR (`<` opens a redirection), and
# dropped entirely it is silent — `validate-cmd.js` keeps the whole staleness
# check inside `if (opts.planPath)`, so an absent `--plan` skips it with neither
# error nor warning. The comment at 2.5.9 already asserted that "2.5.8's
# code-review chain-check also passes `--plan`"; before this fix that sentence
# described an intent, not the code. All three gating callsites in this file
# (Phase 1.6 preflight, this one, 2.5.9 ship-gate) now pass a real variable, and
# `validate-callsite-lint` asserts that mechanically for pr.md. NOTE the labels:
# the preflight is Phase 1.6, NOT 2.5.7 — 2.5.7 is the finalize-receipt WRITE
# step, and its `--plan "<plan path or PR title>"` is still a placeholder by
# design (it names the receipt subject; it is not a validate callsite).
#
# DECISION_SLUG is re-derived HERE rather than inherited from 2.5.7 (local
# review, 2026-08-16). Each fenced block may run as its own shell, so an
# inherited slug can arrive empty — and now that this callsite passes `--plan`,
# an empty slug yields `.claude/plans/.plan.md`, which is unreadable, which is
# `stale`, which is `ok=false`. C6 made staleness reachable here for the first
# time, so the derivation it depends on must be reachable too. derive-decision
# is deterministic in (command, args), so re-deriving is a no-op when the slug
# was already in scope.
DECISION_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision \
  --command mccp:pr \
  --args "$ARGUMENTS")
# Same derivation as SHIP_PLAN_PATH below. PR_PLAN_PATH is an OPTIONAL override
# for a plan whose basename differs from the decision slug: export it before
# running if Phase 2 DISCOVER found such a plan. No block in this body assigns
# it (verified 2026-08-16 — zero assignments plugin-wide), so unless an operator
# sets it the deterministic `.claude/plans/<slug>.plan.md` convention is what
# actually applies. A path that does not resolve lands in `stale` and blocks.
CHAIN_PLAN_PATH="${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}"
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate \
  --command mccp:code-review \
  --decision ${DECISION_SLUG} \
  --plan "$CHAIN_PLAN_PATH"
```

If exit 0: proceed to Phase 3 (PUSH). The body-file persisted in 2.5.4 (under `<gitdir>/mccp/tmp/`) is the authoritative source for the `## Design Review` and `## Codex Adversarial Review` sections — Phase 4 will read it back instead of re-deriving from memory.

If non-zero: do NOT push. Output validate stderr and end the response. Leave the body-file in place so the next attempt can re-read it.

Print one info line before Phase 3:

```
PR-Codex: converged in <N> rounds (or: skipped, auto-fallback) | Receipt: <path> | Body: <body-file path>
```

### 2.5.9 — PR-Codex ship-gate read-back (integrity-unification M3, defense-in-depth)

finalize (2.5.7) is the runtime **primary** ship gate — its exit 12 already HALTs a non-approving verdict before we ever reach here, and it cannot be skipped because it is the write path itself. 2.5.9 is the canonical/external **defense-in-depth** re-check on the freshly-written receipt, through the auditable `validate` surface, using the **same** `deriveShipDecision` oracle (`validate --check-ship-verdict`). Two loci, one oracle — the partition cannot drift.

```bash
# --check-ship-verdict opts the PR-terminal self-verdict gate ON. ONLY this
# read-back sets it — the early Phase 1.6 preflight, the auto-chain preflight, and
# the 2.5.8 code-review chain-check all leave it off, so a re-run is never
# self-poisoned by a stale divergent receipt (DD4) and historical receipts are
# never retro-blocked (DD5). An active MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE
# (env, Phase 0.4) OR meta.pr_codex_force_override=true downgrades the block to a
# warning here (ship proceeds; verdict stays sealed).
# v1.23.5 G2 — `--plan` is REQUIRED here. Without it the validator never re-hashes
# the plan, so `stale` could not fire and a plan edited AFTER its gate shipped
# unnoticed. Unlike the Phase 1.6 preflight (scoping only — it reads `blocking`),
# this read-back gates on the aggregate `ok`, so a stale plan HALTs the push.
# santa-loop R3 (Reviewer B): this is the ship-verdict locus, but not the only
# place a stale plan can stop the run — 2.5.8's code-review chain-check also
# passes `--plan` and can stale-block before Phase 3. Stated as scope, not as
# uniqueness. (v1.25.2 C6: that claim is now true of the code as well — 2.5.8
# carried a literal `<plan path>` placeholder until then, so all three gating
# callsites in this file pass a real shell variable only as of v1.25.2.)
# santa-loop R3 (Reviewer A) — this uses a real shell variable, NOT the
# `<plan-path>` placeholder the surrounding command body uses elsewhere. The
# distinction matters here specifically: an unsubstituted `<plan-path>` is not a
# bad argument, it is a bash SYNTAX ERROR (`<` opens a redirection), so a gate
# that depends on the model substituting it correctly is not the mechanical gate
# this milestone claims to restore. Phase 1.6 above already derives a real
# variable; leaving the load-bearing ship gate on a placeholder was an
# inconsistency between the two edits. Same self-derivation discipline as
# prp-implement.md's design-grounding gate (shell-state independent, re-derived
# from a stable input).
#
# PR_PLAN_PATH is an OPTIONAL override for the case where the discovered plan's
# basename differs from the decision slug — export it before running. Local
# review (2026-08-16) corrected an earlier claim here that "Phase 2 DISCOVER sets
# it": no block in this body assigns it (zero assignments plugin-wide), so unless
# an operator sets it the deterministic `.claude/plans/<slug>.plan.md` derivation
# is what actually applies, which is /mccp:plan's output convention. Either way
# this cannot degrade into a syntax error, and a path that does not resolve lands
# in `stale` and correctly blocks here.
#
# DECISION_SLUG is re-derived in this block for the same reason as 2.5.8: each
# fenced block may run as its own shell, and an empty inherited slug would send
# the load-bearing ship gate at `.claude/plans/.plan.md` → unreadable → stale →
# a false HALT. derive-decision is deterministic in (command, args), so this is a
# no-op when the slug was already in scope.
DECISION_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision \
  --command mccp:pr \
  --args "$ARGUMENTS")
# santa-loop R3 (Reviewer B) — same `|| SHIP_GATE_EXIT=$?` guard as Phase 1.6, and
# for the same reason: `validate` exits 2 on any non-ok result, so under `set -e` a
# bare capture aborts the shell. R2 hardened 1.6 and left this sibling callsite
# bare, which was an omission, not a distinction. The failure mode here is milder
# than at 1.6 — an abort still HALTs, so it cannot ship anything — but it skips
# `SHIP_OK`, the `[MCCP-GATE-STOP]` diagnostics below, and the audited-override
# warning path, turning an explained stop into a bare exit 2.
SHIP_PLAN_PATH="${PR_PLAN_PATH:-.claude/plans/${DECISION_SLUG}.plan.md}"
SHIP_GATE_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" validate \
  --command mccp:pr \
  --decision "${DECISION_SLUG}" \
  --plan "$SHIP_PLAN_PATH" \
  --check-ship-verdict \
  ${FINALIZE_RECEIPT_HASH:+--expected-receipt-hash "$FINALIZE_RECEIPT_HASH"} 2>/dev/null) \
  && SHIP_GATE_EXIT=0 || SHIP_GATE_EXIT=$?
# Gate on the aggregate `ok` flag, NOT on a single blocking kind. The ship-gate
# emits FOUR fail-closed blocking kinds on the freshly-written receipt —
# pr_codex_nonconverged (non-approving verdict / unreadable), subject-tamper,
# receipt-tamper, and ship-gate-schema-invalid — and matching only the first
# would let a tampered-to-look-converged or schema-broken receipt ship. `ok===false`
# is the superset (classify.js maps any blocking to exit 2), and an audited override
# yields a WARNING (not blocking) so `ok` stays true → ship proceeds. The `catch`
# defaults to "0" so an unparseable/empty validate output HALTs (fail-closed), never
# slips through as a silent proceed.
SHIP_OK=$(printf '%s' "$SHIP_GATE_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.ok===true?"1":"0")}catch{process.stdout.write("0")}')
if [ "$SHIP_OK" != "1" ]; then
  echo "[MCCP-GATE-STOP] PR-Codex ship-gate read-back BLOCKED (validate --check-ship-verdict)." 1>&2
  printf '%s\n' "$SHIP_GATE_JSON" 1>&2
  echo "Resolve the divergence (re-run so PR-Codex re-fires on the fresh diff)," 1>&2
  echo "or set MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE=\"<substantive reason>\" (Phase 0.4)." 1>&2
  echo "(A subject-tamper/receipt-tamper/schema-invalid block means the just-written" 1>&2
  echo " receipt failed its integrity re-check — do NOT regenerate; investigate.)" 1>&2
  exit 1
fi
```

If the read-back surfaces a `pr_codex_force_override` **warning** (not a block), log it and proceed — the ship is audited, and Phase 4 injects the `## PR-Codex Override` section.

### Forbidden during Phase 2.5

Same forbidden phrase catalog as Plan-Codex Phase 7. No "shall I invoke Codex?" / "receipt를 직접 작성해주세요" / inter-step yes/no prompts (2.5.6 CRITICAL stop only exception).

---

## Phase 3 — PUSH

### 3.0a — F1 pre-stage absolute-cwd guard (durable-evidence-substrate follow-up)

BEFORE staging any receipt, assert no ship receipt under
`.claude/receipts/mccp-pr-codex/` still carries an ABSOLUTE `meta.cwd`. A new
receipt is normalized to repo-relative on write (`normalizeReceiptCwd`), but a
historical or externally-produced receipt could still leak a `<drive>:\…` local
path into public history. This is the cheap pre-stage check; the authoritative
corpus-integrity gate is the rebind tool's own fail-closed post-apply scan
(`v1.22.4-cwd-rebind.js`, run at rebind time), so pr.md does NOT re-run the full
binding scan — it has no rebind plan in context.

```bash
GITDIR=$(git rev-parse --git-dir)
mkdir -p "$GITDIR/mccp/tmp"
LEAKING=$(node -e '
  const fs = require("fs"), p = require("path");
  const d = p.join(process.cwd(), ".claude", "receipts", "mccp-pr-codex");
  if (!fs.existsSync(d)) process.exit(0);
  const bad = [];
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith(".json")) continue;
    try {
      const c = JSON.parse(fs.readFileSync(p.join(d, f), "utf8")).meta.cwd;
      if (typeof c === "string" && (p.isAbsolute(c) || /^[A-Za-z]:[\\/]/.test(c))) bad.push(f);
    } catch (_e) { /* unreadable — skip */ }
  }
  process.stdout.write(bad.join("\n"));
')
if [ -n "$LEAKING" ]; then
  echo "[MCCP-EVIDENCE-STOP] ship receipt(s) carry an ABSOLUTE meta.cwd — refusing to stage/commit/push a local-path leak:" 1>&2
  printf '  %s\n' $LEAKING 1>&2
  echo "  Recovery: node plugins/mccp/scripts/migrations/v1.22.4-cwd-rebind.js --apply && --stage (then commit), before re-running /mccp:pr." 1>&2
  exit 1
fi
```

### 3.0 — Evidence commit (Task A4 — receipt-only, F3 fail-closed before push)

Persist the ship-receipt corpus into git history so the audit evidence survives
worktree deletion (E5). This stages **only** `.claude/receipts/mccp-pr-codex/` —
**never** `.claude/state/completion-ledger/` (E6: the ledger's untracked entry is
a poison false-positive that Phase B — not Phase A — handles; the tracked ledger
re-keys are committed at rebind time by `v1.22.4-cwd-rebind.js --stage`, not
here). A separate commit (**no `--amend`**) keeps the reviewed diff intact.

**F3 (durable-evidence-substrate follow-up)**: this step was fail-loud-OPEN — a
failed commit only warned, then pushed anyway, leaving receipts working-tree-only
and recreating the exact blind-audit failure Phase A closes. It is now
**fail-CLOSED before push**: when there ARE receipt changes to persist but they
cannot be cleanly committed, HALT rather than push. PR creation stays reachable
only when the evidence commit succeeded (or there was nothing to persist).

```bash
if [ -n "$(git status --porcelain .claude/receipts/mccp-pr-codex/ 2>/dev/null)" ]; then
  git add -- .claude/receipts/mccp-pr-codex/
  # F2 (PR-Codex R2 absorption): the corpus-wide `git add` above is deliberately
  # broad (the audit corpus is ALL ship receipts), but a corrupt, unrelated, or
  # leak-carrying receipt would otherwise be published as durable evidence. Validate
  # EVERY staged receipt fail-CLOSED before the commit — unreadable/unparseable JSON,
  # a missing receipt_hash, or an absolute meta.cwd HALTs the push (the pre-stage cwd
  # guard fail-OPEN-skipped unreadable files; this closes that exact gap).
  STAGED_OFFENDERS=$(git diff --cached --name-only -- .claude/receipts/mccp-pr-codex/ \
    | node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/evidence-stage-guard.js")
  if [ "$?" != "0" ]; then
    echo "[MCCP-EVIDENCE-STOP] staged receipt validation failed — NOT committing/pushing (unsafe evidence would be published):" 1>&2
    echo "$STAGED_OFFENDERS" 1>&2
    git reset -q HEAD -- . 2>/dev/null || true
    exit 1
  fi
  # Guard: refuse to commit if ANYTHING outside the ship-receipt path is staged
  # (esp. completion-ledger/ — E6). A wrong staged set means we cannot produce a
  # clean evidence commit → HALT (F3 fail-closed), do NOT push an unpersisted set.
  OUTSIDE=$(git diff --cached --name-only | grep -v '^\.claude/receipts/mccp-pr-codex/' | grep -v '^$' || true)
  if [ -n "$OUTSIDE" ]; then
    echo "[MCCP-EVIDENCE-STOP] non-receipt paths staged — refusing evidence commit, NOT pushing (receipts would be working-tree-only):" 1>&2
    printf '  %s\n' $OUTSIDE 1>&2
    git reset -q HEAD -- . 2>/dev/null || true
    exit 1
  fi
  if ! git commit -q -m "chore(evidence): persist mccp-pr-codex ship receipts for ${DECISION_SLUG}"; then
    echo "[MCCP-EVIDENCE-STOP] evidence-commit failed — NOT pushing (receipts would be working-tree-only, recreating blind audit)." 1>&2
    exit 1
  fi
fi
```

### 3.1 — F-H/F-I MANDATORY pre-push HISTORY-leak gate, ALL blobs (Codex R5 + R6)

The working-tree redaction + exact-manifest gate only protect the STAGED tree.
They do NOT remove leaking content from **ancestor commits** (F-H), and the leak
is NOT confined to receipt blobs — committed design artifacts (plan, findings
report) embed the same absolute paths (F-I). This is the terminal push-time
guarantee: scan **every NEW text blob** reachable in `origin/<base>..HEAD` (all
ancestor commits, not just the tip tree) for a repo-root absolute-path leak, with
a **line/fixture-specific allowlist** (never directory-wide), and HALT on any
non-allowlisted leak. The scan is a tested library
([`history-leak-scan.js`](../scripts/lib/history-leak-scan.js)), NOT an inline
regex — the pattern is repo-root-anchored + separator-flexible so it catches the
JSON-escaped `C:\\_project\\…` form receipt blobs store, while never
false-positiving on the plugin's own cache-path convention or test fixtures.

```bash
GITDIR=$(git rev-parse --git-dir); mkdir -p "$GITDIR/mccp/tmp"
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/history-leak-scan.js" --json \
  > "$GITDIR/mccp/tmp/history-leak.json" 2>/dev/null
HIST_EXIT=$?
if [ "$HIST_EXIT" != "0" ]; then
  echo "[MCCP-EVIDENCE-STOP] pre-push HISTORY-leak gate FAILED — repo-root absolute path(s) reachable in origin/<base>..HEAD (receipt OR artifact):" 1>&2
  node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));(j.leaks||[]).slice(0,25).forEach(l=>process.stderr.write("  LEAK "+l.path+":"+l.line+" ["+l.pattern+"]\n"));if((j.leaks||[]).length>25)process.stderr.write("  … +"+(j.leaks.length-25)+" more\n")}catch(_){process.stderr.write("  (leak report unreadable — HALT anyway)\n")}' "$GITDIR/mccp/tmp/history-leak.json" 1>&2
  echo "  Recovery (Task 6): run v1.22.4-cwd-rebind.js --apply && --stage; rewrite unpushed history" 1>&2
  echo "  (git reset --soft origin/<base> → rebind → re-commit); placeholder-redact committed plan/report artifacts. Then re-run /mccp:pr." 1>&2
  exit 1
fi
```

### 3.2 — Push (rebase is a fail-closed HALT, not auto-executed)

```bash
git push -u origin HEAD
```

If push fails due to remote divergence, **HALT — do NOT auto-rebase**. A rebase
rewrites HEAD, which strands the ship-receipt bindings the completion-ledger
points at (E4/F2 — dangling receipts, observed 8× in practice). Auto-reentry after
a HEAD move is exactly the unverifiable-superseded-state defect this plan closes:

```
[MCCP-PUSH-HALT] push rejected — remote diverged. NOT auto-rebasing.
  A rebase rewrites HEAD and strands the just-committed ship-receipt bindings
  the completion-ledger references (E4/F2 dangling receipts).
  The PR-Codex gate already ran and its ship receipt is committed, so finish by
  hand: `git fetch origin`, inspect `git log origin/<base>..HEAD`, reconcile
  WITHOUT rewriting already-committed receipts, then `git push` + `gh pr create`.
  Do NOT re-run /mccp:pr on THIS branch — the gate would rewrite the tracked ship
  receipt at a new HEAD and the overwrite guard fail-closes (TRACKED_RECEIPT_OVERWRITE).
  To re-run the full gate instead, re-ship from a NEW branch (a fresh decision slug).
```

End the response. Do not proceed to Phase 4.

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

### Security Reviewer Override (conditional, audit canonical)

If Phase 2.5.5 entered the `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` escape branch (security-reviewer Task tool failed AND env var set with a specific reason), the PR body is the **canonical audit source** for the override (because `.claude/receipts/` is git-ignored per CLAUDE.md §3.1). The body assembly step below MUST inject the following section immediately after `## Codex Adversarial Review` (or, if no Codex section is present, immediately after the title-derived sections):

```markdown
## Security Reviewer Override

- **Triggered by**: `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER`
- **Reason**: <reason text from env var>
- **Receipt path**: `.claude/receipts/mccp-pr-codex/<decision>.json` (working-tree-only, ephemeral)
- **Timestamp**: <ISO 8601 UTC>
- **Audit canonical**: This PR body section. Receipt is local audit aid.
- **Reviewer action**: Confirm override reason is acceptable before merge.
```

If a project `.github/pull_request_template.md` is present, inject above the template content; the template author's framing remains intact below.

The `meta.security_force_override_reason` value passed via `--security-force-override-reason` MUST be identical to the `Reason` field inserted into the PR body. Validators cross-check the two at `validate-cmd` time.

### PR-Codex Override (conditional, integrity-unification M3)

If Phase 0.4 exported `PR_CODEX_FORCE_OVERRIDE_REASON` (i.e. this PR shipped past a non-approving PR-Codex verdict via `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`), the body assembly step MUST inject the following section immediately after `## Codex Adversarial Review`. This states the objection in plain sight — the ship went through **despite** a Codex "No ship", and the reviewer must weigh that.

```markdown
## PR-Codex Override

- **Triggered by**: `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`
- **Raw PR-Codex verdict**: <sealed resolution.codex_verdict — e.g. `divergent`> (**NOT rewritten** — the receipt still seals this verdict; cross-gate dedupe stays fail-closed and a later `/mccp:pr` re-runs PR-Codex)
- **Reason**: <reason text from env var>
- **Findings routed away (scope-excluded)**: <DESIGN_DROPPED + a11y count, or 0 — from the `## Codex Adversarial Review` section>
- **Timestamp**: <ISO 8601 UTC>
- **Reviewer action**: This override unblocked the ship only; it did NOT certify convergence. Confirm the reason is acceptable and re-examine the Codex objection before merge.
```

The `Reason` field MUST be identical to `meta.pr_codex_force_override_reason` (validators cross-check at `validate-cmd` time). The `Raw PR-Codex verdict` field MUST equal the sealed `resolution.codex_verdict` — an override that rewrote it to `converged` is exactly the dedupe-defeating defect DD3 exists to prevent.

### Accessibility Review (conditional, v1.13.0 M3)

If Phase 2.5.6c invoked `mccp:a11y-architect` (`A11Y_INVOKED=1`), inject the captured `A11Y_REVIEW_OUTPUT` as a `## Accessibility Review` section, mirroring how `## Codex Review` surfaces review findings. This is review-only output (the agent ran inside the a11y-review lock and the mutations finalizer confirmed no edits):

```markdown
## Accessibility Review

<!-- Auto-invoked mccp:a11y-architect (WCAG 2.2) — review-only, no edits applied. -->

<A11Y_REVIEW_OUTPUT — findings + remediation suggestions>
```

When `A11Y_INVOKED=0` (no rendered surface in the diff, or `MCCP_A11Y_AUTO_INVOKE=0`), omit this section entirely. The remediation suggestions are advisory — the reviewer applies them in a separate `/mccp:prp-implement` cycle, never inside `/mccp:pr` (review-only invariant).

### Create the PR

The Phase 2.5 body-file under `<gitdir>/mccp/tmp/pr-body-${DECISION_SLUG}-${HEAD_SHA:0:12}.md` (gitdir resolved by the `pr-body` CLI — worktree-safe) is authoritative for the `## Design Review` and `## Codex Adversarial Review` sections. Prepend the title-derived Summary / Changes / Files / Testing sections to that file (or to the template-filled body) and pass the final body via `--body-file`, not `--body`. This avoids shell-quoting truncation of multi-line review content.

```bash
# Task A4 (F2-a) — passthrough the Phase 2.5 capture-time HEAD_SHA (the sha the
# body-file is keyed on) instead of recomputing. The Phase 3 evidence-commit moved
# HEAD, so `git rev-parse HEAD` here would key a DIFFERENT body-file path and
# silently drop the review sections. Fail-closed when the passthrough is missing.
GITDIR=$(git rev-parse --git-dir)
HEAD_SHA_FILE="$GITDIR/mccp/tmp/pr-head-sha-${DECISION_SLUG}.txt"
if [ -f "$HEAD_SHA_FILE" ]; then
  HEAD_SHA=$(cat "$HEAD_SHA_FILE")
else
  echo "[MCCP-PR-HALT] Phase 2.5 HEAD_SHA passthrough missing ($HEAD_SHA_FILE)." 1>&2
  echo "  Cannot locate the gate body-file deterministically; refusing to create a PR" 1>&2
  echo "  with silently-missing ## Design Review / ## Codex Adversarial Review sections." 1>&2
  echo "  Re-run /mccp:pr." 1>&2
  exit 1
fi
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
  rm -f "$HEAD_SHA_FILE"   # Task A4 — drop the passthrough marker on success
fi
```

If `gh pr create` fails, leave the gate body-file untouched — the next attempt re-reads it. A periodic sweep can be invoked with `node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js pr-body --action sweep` to clear bodies older than 7 days.

---

## Phase 5 — VERIFY

```bash
gh pr view --json number,url,title,state,baseRefName,headRefName,additions,deletions,changedFiles
gh pr checks --json name,status,conclusion 2>/dev/null || true
```

### 5.1 — A1 완주 기록 + C2/C3 귀속 (multi-session-work-loop M8 · DD4 · DD8)

PR 번호가 **처음 존재하는 지점**이 여기다. `task_completed`는 그 번호가 있어야
성립하므로 코드가 아니라 이 명령 본문이 기록한다 — 착수는 hook이, 완주는 본문이
쓰는 비대칭은 의도적이다(DD4). 빠지면 **분자가 준다**(과소 계상). A1은 부풀리면
안 되는 지표이므로 과소가 안전한 방향이고, 빠진 만큼은 `sealed_without_completion`
(DD5, `finalize-receipt.js`가 코드로 기록)이 수치로 드러낸다.

`$DECISION_SLUG`은 이 PR이 봉인한 ship receipt의 decision slug이고 A1의
`work_unit` 키와 **같은 키**다(DD3 — 새 키 체계를 만들지 않는다).

**`DECISION_SLUG`은 이 블록에서 재도출한다** (local review H1). 2.5.8 · 2.5.9 ·
Phase 3이 같은 이유로 같은 일을 한다 — fenced block은 각자의 셸로 돌 수 있어
상속된 슬러그는 비어 있는 것이 정상이고, 여기서 비면 `-n` 가드가 걸려 A1 분자가
**매 사이클 조용히 skip된다**(guard 자체는 옳지만 그 앞의 값이 없다). derive-decision은
(command, args)에 결정적이므로 이미 스코프에 있었다면 no-op이다. `PR_NUMBER`도
같은 블록에서 뽑아, 아래 귀속 emit이 앞 블록의 변수를 상속하지 않게 한다(H2).

```bash
DECISION_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision \
  --command mccp:pr \
  --args "$ARGUMENTS")
PR_NUMBER=$(gh pr view --json number --jq .number 2>/dev/null || echo "")

if [ -n "$PR_NUMBER" ] && [ -n "${DECISION_SLUG:-}" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state/cli.js" msw-event emit \
    --kind task_completed \
    --work-unit "$DECISION_SLUG" \
    --pr-number "$PR_NUMBER" \
    || echo "[mccp:msw-a1] task_completed emit failed (fail-open; A1 numerator undercounts)" 1>&2
else
  echo "[mccp:msw-a1] task_completed skipped — PR_NUMBER or DECISION_SLUG empty" 1>&2
fi

# ── C2/C3 귀속 (DD8 · UI8) — **이 PR이 해소한 finding이 있을 때만** ───────────
#
# 같은 블록 안에 둔다: 위에서 뽑은 두 변수를 다음 fenced block으로 넘길 수 없다.
# 레코드 0건은 정상이므로 `FINDING_ID`가 비어 있으면 통째로 건너뛴다.
#
# `FINDING_ID`는 해소한 finding의 registry id(`.claude/state/findings/` 샤드의
# `finding_id`)이고, `GATE_DECISION_ID`는 그 finding을 낳은 **차단 판정**의
# decision slug다. 셋 다 채울 수 없으면 기록하지 않는다 — 조인 키 없는 귀속
# 레코드는 어느 소비처도 읽을 수 없다(local review H3).
FINDING_ID=""          # 예: 3f2a1c9e… (해소한 finding이 없으면 빈 값 유지)
GATE_DECISION_ID=""    # 예: multi-session-work-loop-m7

if [ -n "$FINDING_ID" ] && [ -n "$GATE_DECISION_ID" ] && [ -n "$PR_NUMBER" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/scripts/state/cli.js" msw-event emit \
    --kind remediation_pr \
    --work-unit "$DECISION_SLUG" \
    --pr-number "$PR_NUMBER" \
    --finding-id "$FINDING_ID" \
    --gate-decision-id "$GATE_DECISION_ID" \
    || echo "[mccp:msw-c2] remediation_pr emit failed (fail-open; attribution coverage undercounts)" 1>&2
fi
```

CLI는 `--kind`를 `task_completed | remediation_pr` **두 종으로 고정**하고
`--work-unit`/`--gate-decision-id`를 canonical `SLUG_RE`로, `--finding-id`를
16~64자 hex로, `--pr-number`를 부호없는 정수로 검증한다. `remediation_pr`은
`--pr-number`와 `--finding-id`를 **둘 다 요구한다** — 전자가 없으면 그 이름이
뜻하는 바가 없고, 후자가 없으면 `derive/sources/findings.js`가 그 레코드를 어떤
finding에도 결속하지 못해 `with_remediation_pr`이 영원히 0에 머문다. 착수
(`task_started`)와 세션 수명 이벤트는 이 경로로 쓸 수 없다 — A1의 **분모**는
hook만 쓴다.

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
