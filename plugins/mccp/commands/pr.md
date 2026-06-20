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
| 1 | 1 | Invoke `Skill(impeccable, "critique <PR title or branch name>")` and `Skill(impeccable, "audit <PR title or branch name>")`. Capture highlights — Phase 4 injects them into PR body as `## Design Review`. If Skill returns `unknown_skill` / `not found`, fall back to the skipped path (set `IMPECCABLE_SKIPPED_REASON="skill-missing"`). |

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
| `ok === true && skip_safe === true` | Export `CODEX_DEDUPE_AT_PR=1` (v0.2.8 Task 2.6.1 — Phase 2.5.7 forwards `--codex-dedupe-at-pr` to receipt). Record the dedupe note (template below) and proceed to 2.5.3 with `CODEX_OUTCOME=deduped` (which short-circuits the Codex call). The lock-enter still happens so the review-only invariant is enforced across body construction. |
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

Use `convergence.plan_codex_receipt.round` and `convergence.implement_codex_receipt.round` from the JSON for N1 / N2. If either receipt is missing or `converged !== true`, the CLI sets `skip_safe = false` automatically with a `reason` like `"plan-codex receipt missing or not converged"`. Treat that as the normal non-deduped path.

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
mkdir -p .git/mccp/tmp
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

CODEX_RESULT_FILE=".git/mccp/tmp/codex-result.json"
# v0.2.9 — codex-runner.js inherits env into the codex-invoke child process. No code change in the helper needed.
export MCCP_GATE_ROUND_CAP="${MCCP_GATE_ROUND_CAP:-1}"
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-helpers/codex-runner.js" "${RUNNER_FLAGS[@]}" > "$CODEX_RESULT_FILE"
CODEX_RUNNER_EXIT=$?
if [ "$CODEX_RUNNER_EXIT" != "0" ]; then
  echo "[MCCP-GATE-STOP] codex-runner failed (exit=$CODEX_RUNNER_EXIT)." 1>&2
  echo "Inspect: cat $CODEX_RESULT_FILE  AND  cat .git/mccp/tmp/codex-invoke.stderr" 1>&2
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

Severity-gated re-rerun (default cap=1): after R1's YAGNI triage table is written, escalate ONLY if BOTH:
  (a) ≥1 finding is `verdict=ACCEPT_NOW` AND `severity ∈ {CRITICAL, HIGH}`
  (b) The R1 absorption could not fully resolve it (Claude self-attests in PR body)
If escalate triggers, run R2 with focus restricted to the unresolved item(s).
Repeat up to `MCCP_GATE_ROUND_CAP` (default `1`, allowed `1`/`2`/`3`). Beyond the cap,
annotate `Open Questions: DIVERGENT_UNRESOLVED` and proceed.

If no `ACCEPT_NOW` HIGH/CRITICAL remains, stop at R1.

All `DEFER_TO_BACKLOG` items: append a line to `.claude/plans/codex-findings-backlog.md`
before Phase 2.5.5. Format:
- `YYYY-MM-DD | <severity> | <source plan path> | <one-line finding>`

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

If `LOCK_EXIT_OK=1`, proceed to 2.5.7. If `baseline_missing=true`, the receipt verdict is forced to non-approving via `--codex-actionable-findings`. The lock file was unlinked by `codex-runner.js` so the next `/mccp:pr` invocation starts fresh.

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

node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/pr-phase-helpers/finalize-receipt.js" "${FINALIZE_FLAGS[@]}"
FINALIZE_EXIT=$?
if [ "$FINALIZE_EXIT" != "0" ]; then
  echo "[MCCP-GATE-STOP] finalize-receipt failed (exit=$FINALIZE_EXIT)." 1>&2
  exit 1
fi
```

Bash hook block handling: same as Plan-Codex Phase 7.6 — output `[MCCP-GATE-STOP]` with captured hook stderr and end the response. Do NOT enter Phase 3.

### 2.5.8 — Read-back validate, then continue to Phase 3

```bash
# v1.3.1: forward --decision/--plan explicitly so the validator scopes to the
# correct receipt instead of falling back to decisionId='default' (Codex R1 F1).
# This is the downstream chain check for /mccp:code-review (PR Review Mode);
# DECISION_SLUG was derived in 2.5.7 (mccp:pr decisionId reused for the chain).
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate \
  --command mccp:code-review \
  --decision ${DECISION_SLUG} \
  --plan <plan path>
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
