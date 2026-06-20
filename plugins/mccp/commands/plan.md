---
description: Restate requirements, assess risks, and create step-by-step implementation plan. WAIT for user CONFIRM before touching any code.
argument-hint: "[feature description | path/to/*.prd.md]"
---

# Plan Command (mccp)

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

This command creates a comprehensive implementation plan before writing any code. It accepts either free-form requirements or a PRD markdown file.

Run inline by default. Do not call the Task tool or any subagent by default. This keeps `/mccp:plan` usable from plugin installs that ship commands without agent files.

## Phase Map

The command runs six sequential phases. **Phase 5 (the gate) is mandatory and automatic** — see the Autonomy Contract there. Phase 0 is **conditional** — it only runs when the receipt-prompt hook injected an informational context block (v1.3.1).

| # | Phase | Purpose |
|---|---|---|
| 0 | RECOVER FROM HOOK CONTEXT | (v1.3.1, conditional) Auto-write missing upstream receipts when hook signaled missing-only integrity result |
| 1 | ANALYZE | Restate requirements, identify risks, estimate complexity |
| 2 | GROUND | Search the codebase for patterns the implementation must mirror |
| 3 | DECOMPOSE | Break the work into ordered, actionable tasks |
| 4 | WRITE | Produce the plan artifact (inline or `.claude/plans/{name}.plan.md`) and WAIT for user confirmation |
| 5 | PLAN-CODEX GATE | Auto-invoke Codex adversarial review, inject result, write receipt, hand off to `/mccp:prp-implement` |

## Phase 0 — RECOVER FROM HOOK CONTEXT (v1.3.1, conditional)

The receipt-prompt hook may inject an `mccp_receipt_gate` context block when this command is invoked with a missing-only upstream receipt (v1.3.1 informational path). When that block is present, auto-recover deterministically before Phase 1 ANALYZE runs. When absent, skip this phase entirely.

**Trigger detection.** The hook payload appears as a `<system-reminder>` containing serialized JSON of the form `{"mccp_receipt_gate": {...}}` per `plugins/mccp/scripts/hooks/lib/receipt-context-schema.js`. If you do not see that key in your initial context, proceed straight to Phase 1.

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

3. **Plan body completeness.** Read the plan at `mccp_receipt_gate.planPath` (or `command_args` if null). For `/mccp:plan` the missing receipt is typically `mccp-plan-codex` itself, which means the plan WRITE phase has run but Phase 5 PLAN-CODEX GATE crashed before the receipt was committed. Verify the plan contains `## Codex Adversarial Review` and the section lists no auto-CRITICAL Open Questions. If either fails:

   ```
   [MCCP-INFORMATIONAL-STOP] cannot auto-recover: plan missing Codex Adversarial Review section or has auto-CRITICAL open question.
   Action: re-enter /mccp:plan to refresh the gate manually.
   ```

   End the response.

4. **Write the missing receipt.** For each `missing[i]`:

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
     --command mccp:plan \
     --decision <mccp_receipt_gate.decisionId> \
     --plan <mccp_receipt_gate.planPath>
   ```

   If exit ≠ 0:

   ```
   [MCCP-INFORMATIONAL-STOP] post-write revalidation failed (exit=<N>). Inspect via /mccp:trace.
   <stderr from validate>
   ```

   End the response.

6. **Proceed.** Print one info line, then continue with Phase 1 ANALYZE:

   ```
   > Recovered missing receipt(s) for decision="<decisionId>" via informational hook context. Continuing.
   ```

## What This Command Does

1. **Restate Requirements** - Clarify what needs to be built
2. **Identify Risks** - Surface potential issues and blockers
3. **Create Step Plan** - Break down implementation into phases
4. **Wait for Confirmation** - MUST receive user approval before proceeding

## When to Use

Use `/mccp:plan` when:
- Starting a new feature
- Making significant architectural changes
- Working on complex refactoring
- Multiple files/components will be affected
- Requirements are unclear or ambiguous

## How It Works

The assistant will:

1. **Analyze the request** and restate requirements in clear terms
2. **Ground the plan** in relevant codebase patterns when the repo is available
3. **Break down into phases** with specific, actionable steps
4. **Identify dependencies** between components
5. **Assess risks** and potential blockers
6. **Estimate complexity** (High/Medium/Low)
7. **Present the plan** and WAIT for your explicit confirmation

## Input Modes

| Input | Mode | Behavior |
|---|---|---|
| `path/to/name.prd.md` | PRD artifact mode | Read the PRD, pick the next pending delivery milestone or implementation phase, and write `.claude/plans/{name}.plan.md` |
| Any other markdown path | Reference mode | Read the file as context and produce an inline plan |
| Free-form text | Conversational mode | Produce an inline plan |
| Empty input | Clarification mode | Ask what should be planned |

In PRD artifact mode, create `.claude/plans/` if needed. If the PRD contains a `Delivery Milestones` table, update only the selected row from `pending` to `in-progress` and set its `Plan` cell to the generated plan path. If the PRD uses the legacy `.claude/PRPs/prds/` format with `Implementation Phases`, read it without migrating paths.

## Pattern Grounding

Before writing the plan, search the codebase for conventions the implementation should mirror. Capture the top example for each relevant category with file references:

| Category | What to capture |
|---|---|
| Naming | File, function, type, command, or script naming in the affected area |
| Error handling | How failures are raised, returned, logged, or handled gracefully |
| Logging | Levels, format, and what gets logged |
| Data access | Repository, service, query, or filesystem patterns |
| Tests | Test file location, framework, fixtures, and assertion style |

If no similar code exists, state that explicitly. Do not invent a pattern.

## PRD Artifact Output

When called with a `.prd.md` file, write the plan to `.claude/plans/{kebab-case-name}.plan.md` using this structure:

````markdown
# Plan: {Feature Name}

**Source PRD**: {path}
**Selected Milestone**: {milestone or phase name}
**Complexity**: {Small | Medium | Large}

## Summary
{2-3 sentences}

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `path:line` | {short description} |
| Errors | `path:line` | {short description} |
| Tests | `path:line` | {short description} |

## Files to Change
| File | Action | Why |
|---|---|---|
| `path` | CREATE / UPDATE / DELETE | {reason} |

## Tasks
### Task 1: {name}
- **Action**: {what to do}
- **Mirror**: {pattern to follow}
- **Validate**: {command that proves correctness}

## Validation
```bash
{project-specific validation commands}
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|

## Acceptance
- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
````

After writing the artifact, report its path and WAIT for confirmation before writing code.

## Example Usage

```
User: /mccp:plan I need to add real-time notifications when markets resolve

Assistant:
# Implementation Plan: Real-Time Market Resolution Notifications

## Requirements Restatement
- Send notifications to users when markets they're watching resolve
- Support multiple notification channels (in-app, email, webhook)
- Ensure notifications are delivered reliably
- Include market outcome and user's position result

## Implementation Phases

### Phase 1: Database Schema
- Add notifications table with columns: id, user_id, market_id, type, status, created_at
- Add user_notification_preferences table for channel preferences
- Create indexes on user_id and market_id for performance

### Phase 2: Notification Service
- Create notification service in lib/notifications.ts
- Implement notification queue using BullMQ/Redis
- Add retry logic for failed deliveries
- Create notification templates

### Phase 3: Integration Points
- Hook into market resolution logic (when status changes to "resolved")
- Query all users with positions in market
- Enqueue notifications for each user

### Phase 4: Frontend Components
- Create NotificationBell component in header
- Add NotificationList modal
- Implement real-time updates via Supabase subscriptions
- Add notification preferences page

## Dependencies
- Redis (for queue)
- Email service (SendGrid/Resend)
- Supabase real-time subscriptions

## Risks
- HIGH: Email deliverability (SPF/DKIM required)
- MEDIUM: Performance with 1000+ users per market
- MEDIUM: Notification spam if markets resolve frequently
- LOW: Real-time subscription overhead

## Estimated Complexity: MEDIUM
- Backend: 4-6 hours
- Frontend: 3-4 hours
- Testing: 2-3 hours
- Total: 9-13 hours

**WAITING FOR CONFIRMATION**: Proceed with this plan? (yes/no/modify)
```

## Important Notes

**CRITICAL**: This command will **NOT** write any code until you explicitly confirm the plan with "yes" or "proceed" or similar affirmative response.

If you want changes, respond with:
- "modify: [your changes]"
- "different approach: [alternative]"
- "skip phase 2 and do phase 3 first"

## Integration with Other mccp Commands

After planning:

- Use `/mccp:prp-implement <plan path>` to execute the plan with the Phase 2.5 Implement-Codex gate
- Use `/mccp:code-review` to review completed implementation
- Use `/mccp:pr` to open a pull request with the PR-Codex gate

> For richer PRD planning, dead-code cleanup, or build-error resolution, install the ECC origin marketplace alongside mccp. mccp deliberately keeps the gate-core scope minimal.

---

## Phase 4.5 — External Research Provenance stamping (v1.4.0 axis A, M1-experimental)

> Runs **only when the plan input is a `.prd.md` path**. Free-form / non-PRD plan inputs skip silently. Provides the mechanical chain-of-custody anchor for `/deep-research` integration shipped in `plan-prd.md` Phase 4.0b — see `docs/automation-modernization/integration-template.md` §5 option (b).

After the plan artifact has been written in Phase 4 and **before entering Phase 5 PLAN-CODEX GATE**, scan the source PRD for a `## References` section. If present, compute a sha256 digest of the References content and append it to the plan body as `## External Research Provenance`. This section is captured by `plan-codex` receipt's `plan_hash` — any subsequent PRD `## References` mutation will mismatch on the next `/mccp:plan` validate.

```bash
# Only when the plan input is a PRD path. PRD_PATH below uses the same
# placeholder convention as the rest of this command body — the LLM
# substitutes the original /mccp:plan argument verbatim (or leaves it
# empty for free-form plan inputs).
PRD_PATH="<original /mccp:plan input>"
case "$PRD_PATH" in
  *.prd.md) ;;
  *) PRD_PATH="" ;;  # skip — non-PRD input
esac

if [ -n "$PRD_PATH" ] && [ -f "$PRD_PATH" ]; then
  node -e '
    const fs = require("fs");
    const crypto = require("crypto");
    const prdPath = process.argv[1];
    const planPath = process.argv[2];
    const body = fs.readFileSync(prdPath, "utf8");
    // Extract ## References content until next ## heading or EOF.
    // [\t ]+ avoids \n in \s+ swallowing the next blank line, mirroring
    // deep-research-detect.js evidence-gap regex (hasEvidenceGap channel b).
    const m = body.match(/(?:^|\n)##[ \t]+References[ \t]*\r?\n([\s\S]*?)(?:\n##\s+|$)/i);
    if (!m) process.exit(0);  // silent skip — no ## References section
    const content = m[1].trim();
    if (!content) process.exit(0);  // empty References — nothing to anchor
    const digest = crypto.createHash("sha256").update(content, "utf8").digest("hex");
    const iso = new Date().toISOString();
    const stampedSection = [
      "## External Research Provenance",
      "",
      "- Source PRD: " + prdPath,
      "- References section sha256: " + digest,
      "- Stamped at: " + iso,
      "- Anchor: plan body content is hash-anchored by the plan-codex receipt'\''s plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.",
      "",
    ].join("\n");
    let plan = fs.readFileSync(planPath, "utf8");
    // Idempotent — replace prior ## External Research Provenance section if present.
    const sectionPattern = /(?:^|\n)## External Research Provenance[\s\S]*?(?=\n## |\n?$)/;
    if (sectionPattern.test(plan)) {
      plan = plan.replace(sectionPattern, "\n" + stampedSection);
    } else {
      if (!plan.endsWith("\n")) plan += "\n";
      plan += "\n" + stampedSection;
    }
    fs.writeFileSync(planPath, plan, "utf8");
  ' "$PRD_PATH" "<plan-path>"
fi
```

This step is **idempotent** — re-running `/mccp:plan` after a PRD `## References` update will replace the prior provenance section in place with the new sha256. The `plan-codex` receipt write (5.6) uses the same `plan_hash` mechanism with no schema change.

When the PRD has no `## References` section, this step is a silent no-op. No section is appended; receipt schema is untouched.

---

## Phase 5 — PLAN-CODEX GATE (자동, /mccp:plan 진입 시 MANDATORY)

This phase applies when the command is invoked as `/mccp:plan`. It implements the **Autonomy Contract** for the plan gate inline below. The original gate design rationale is preserved at `${CLAUDE_PLUGIN_ROOT}/docs/gate-design.md` for reference only — enforcement lives in this command body plus the receipt CLI and the two receipt hooks. **Do not skip and do not ask the user between sub-steps**. Run all sub-steps in one response.

After the plan artifact is written in Phase 4:

### 5.0 — impeccable design gate (자동, /mccp:plan 진입 시 MANDATORY, v0.2.6 Milestone 1)

Pre-flight detection — pre-commits to mode and feeds skill_available / design_signal:

```bash
DETECT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect \
  --mode plan \
  --plan "<plan-path>" \
  --json)
SKILL_AVAIL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.skill_available?"1":"0")}catch{process.stdout.write("0")}')
SIGNAL=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.design_signal?"1":"0")}catch{process.stdout.write("0")}')
DETECT_REASON=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason||"unknown")}catch{process.stdout.write("parse-error")}')
# v1.3.0 M1 — silent-skip surface. detect() now emits silent_skip (SKILL_AVAIL=1
# + SIGNAL=0) so the silent fall-through path is observable. Default empty
# string so the `--impeccable-silent-skip*` flags only fire on actual hits.
SILENT_SKIP=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.silent_skip?"1":"0")}catch{process.stdout.write("0")}')
SILENT_SKIP_REASON=$(echo "$DETECT" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.silent_skip_reason||"")}catch{process.stdout.write("")}')
```

Decision tree (v1.3.0 M1 — silent-skip is no longer silent):

| SKILL_AVAIL | SIGNAL | Action |
|---|---|---|
| 0 | * | Append `> impeccable unavailable, skipped (auto-fallback): $DETECT_REASON` to the plan body under a `## Design Critique` heading. Export `IMPECCABLE_SKIPPED_REASON="$DETECT_REASON"`. plan-codex is a lenient gate — `meta.impeccable_skipped=true` surfaces as warning, not blocking. |
| 1 | 0 | Detector found no design surface in this plan. Emit a loud stderr warn (`[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · plan declares no design surface (whitelist hit 0)`) and forward `--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON"` to 5.6 — UNLESS `IMPECCABLE_FORCE_OVERRIDE_REASON` is set (schema mutex; silent_skip forward suppressed). M1 records silent_skip as informational warning at every gate; M2 will promote to blocking on strict gates once SKILL first-step + critique loop are wired. |
| 1 | 1 | Invoke `Skill(impeccable, "critique <plan slug>")`. Append result to the plan body under `## Design Critique`. If Skill returns `unknown_skill` / `not found`, fall back to skipped path. |

Loud stderr warn pattern for the SKILL_AVAIL=1 SIGNAL=0 row (Task 3):

```bash
if [ "$SKILL_AVAIL" = "1" ] && [ "$SIGNAL" = "0" ]; then
  echo "[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · plan declares no design surface (whitelist hit 0)" 1>&2
fi
```

Receipt-write at 5.6 forwards:
- `--impeccable-skipped --impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON"` when SKILL_AVAIL=0 OR Skill fell back.
- `--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON"` when SILENT_SKIP=1 AND `IMPECCABLE_FORCE_OVERRIDE_REASON` is empty.
- The two are mutually exclusive at the runtime semantic (skill_available=true vs false). Schema also rejects silent_skip + force_override coexisting — when the audited escape env is set we suppress silent_skip forward so the force_override path produces a clean receipt.

### 5.1 — Append placeholder section to the plan

Edit the plan file to add at the bottom:

```markdown
## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
```

### 5.2 — Invoke Codex automatically (v0.2.2 fail-closed Bash wrapper)

Skill interface `codex:adversarial-review` does not exist in the codex plugin's skill index (only `codex-cli-runtime` / `codex-result-handling` / `gpt-5-4-prompting`), and the `/codex:adversarial-review` slash command sets `disable-model-invocation: true` to block model-driven auto-invocation. v0.2.2 replaces both blocked paths with a **fail-closed Bash wrapper** that spawns `codex-companion.mjs` directly via `node` and normalizes every failure to a JSON `classification` (see [scripts/lib/codex-invoke.js](../scripts/lib/codex-invoke.js)).

Run the wrapper. **Do NOT** ask the user "shall I invoke Codex?".

```bash
mkdir -p .git/mccp/tmp
# v0.3.6 Task 8 (축 1 wire-up) — emit --impeccable-available when impeccable
# is detected AND the design-scope honor toggle isn't disabled. The wrapper
# then prepends DESIGN_SCOPE_PREAMBLE to focus, narrowing Codex's scope to
# security/correctness/performance. The kill switch MCCP_CODEX_DESIGN_SCOPE_HONOR=0
# restores the v0.3.5 behaviour (no preamble, no output filter).
IMPECCABLE_FLAG=$(node -e "
const honored = process.env.MCCP_CODEX_DESIGN_SCOPE_HONOR !== '0';
const detect = require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect');
process.stdout.write(honored && detect.probeSkillAvailable({}) ? '--impeccable-available' : '');
" 2> /dev/null || echo "")
CODEX_STDOUT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js" adversarial-review \
  --focus "challenge the following plan decisions: <list 1-3 key decisions from the plan>" \
  --timeout-ms 900000 \
  --json $IMPECCABLE_FLAG 2> .git/mccp/tmp/codex-invoke.stderr)
CODEX_EXIT=$?

CODEX_BLOCKING=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.blocking?"1":"0")}catch{console.log("1")}' "$CODEX_STDOUT")
CODEX_CLASS=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.classification||"unknown")}catch{console.log("parse-error")}' "$CODEX_STDOUT")

if [ "$CODEX_EXIT" != "0" ] || [ "$CODEX_BLOCKING" = "1" ] || { [ "$CODEX_CLASS" != "ok" ] && [ "$CODEX_CLASS" != "disabled" ]; }; then
  if [ "${MCCP_ALLOW_CODEX_UNAVAILABLE:-0}" = "1" ]; then
    echo "[mccp] Codex unavailable in advisory mode (class=$CODEX_CLASS exit=$CODEX_EXIT)"
    # Replace the placeholder with auto-fallback marker + advisory annotation, then jump to 5.5
    # The downstream receipt will stamp advisory=true → non-approving.
  else
    echo "[MCCP-GATE-STOP] Codex unavailable (blocking=$CODEX_BLOCKING class=$CODEX_CLASS exit=$CODEX_EXIT)."
    echo "Set MCCP_ALLOW_CODEX_UNAVAILABLE=1 to proceed in advisory mode (yields non-approving receipt)."
    exit 1
  fi
elif [ "$CODEX_CLASS" = "disabled" ]; then
  # v0.3.5 — MCCP_CODEX_DISABLED=1 first-class skip. No advisory env required.
  # Receipt write at 5.6 auto-stamps meta.codex_disabled=true via env detection.
  echo "[mccp] Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy, first-class)"
  # Replace the placeholder with disabled-skip marker, then jump to 5.5.
fi
```

When `CODEX_CLASS=disabled`: replace the placeholder with `> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy)` and jump to 5.5. When in advisory mode (auto-fallback for unavailable): replace with `> Codex unavailable, skipped (auto-fallback): <classification>` and jump to 5.5.

### 5.3 — Inject Codex result into the plan

Edit the plan: replace the placeholder section with:

```markdown
## Codex Adversarial Review

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

### 5.4 — Severity-gated re-rerun (default cap=1)

After R1's YAGNI triage table (5.3) is written, escalate ONLY if BOTH:
  (a) ≥1 finding is `verdict=ACCEPT_NOW` AND `severity ∈ {CRITICAL, HIGH}`
  (b) The R1 absorption could not fully resolve it (Claude self-attests in plan body)
If escalate triggers, run R2 with focus restricted to the unresolved item(s).
Repeat up to `MCCP_GATE_ROUND_CAP` (default `1`, allowed `1`/`2`/`3`). Beyond the cap,
annotate as `Open Questions: DIVERGENT_UNRESOLVED` and proceed.

If no `ACCEPT_NOW` HIGH/CRITICAL remains, stop at R1.

All `DEFER_TO_BACKLOG` items: append a line to `.claude/plans/codex-findings-backlog.md`
before Phase 5.5. Format:
- `YYYY-MM-DD | <severity> | <source plan path> | <one-line finding>`

### 5.5 — Auto-CRITICAL check

Scan Codex Open Questions for any auto-CRITICAL items (per §0 catalog: secret exposure, data loss, irreversible migration, auth bypass, external destination change, crypto key handling). If any present:

1. Do NOT proceed to 5.6 / 5.7
2. Output:
   ```
   [MCCP-GATE-STOP] CRITICAL Open Question 감지:
   - <item>
   Plan: <path>
   사용자 결정 필요. 진행 의사 또는 수정 지시를 주세요.
   ```
3. End the response.

### 5.6 — Verify plan integrity, then write receipt

```bash
# Step A: verify Codex section was injected
grep -q "^## Codex Adversarial Review$" <plan path> || {
  echo "[MCCP-GATE-STOP] plan에 Codex 섹션 주입 실패. Phase 5.3 재시도 필요."
  exit 1
}

# Step B: derive decision-slug deterministically (must match what the hook computes)
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:plan \
  --args "$ARGUMENTS")

# Step C: auto-write the mccp-plan-codex receipt.
# v1.3.0 M1 — forward silent-skip flags when Phase 5.0 detected SKILL_AVAIL=1
# + SIGNAL=0. plan-codex validator emits silent_skip as informational warning;
# M2 will promote strict gates to blocking after SKILL first-step is wired.
# Schema mutex: silent_skip + force_override cannot coexist, so we suppress
# silent_skip forward when IMPECCABLE_FORCE_OVERRIDE_REASON is set. Bash array
# form avoids eval and keeps quoting around reasons safe.
WRITE_FLAGS=(
  write
  --gate mccp-plan-codex
  --decision "$DECISION_SLUG"
  --plan "<plan path>"
)
if [ -n "$IMPECCABLE_SKIPPED_REASON" ]; then
  WRITE_FLAGS+=(--impeccable-skipped --impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON")
elif [ "$SILENT_SKIP" = "1" ] && [ -z "${IMPECCABLE_FORCE_OVERRIDE_REASON:-}" ]; then
  WRITE_FLAGS+=(--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON")
fi
WRITE_FLAGS+=(--quiet)
node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" "${WRITE_FLAGS[@]}"
```

If the Bash call is blocked by a PreToolUse hook (output contains `[hook]` rejection / `permission denied` / non-zero exit), output:

```
[MCCP-GATE-STOP] receipt write가 Bash hook에 의해 차단됨.
Hook 응답: <captured stderr>
~/.claude/settings.json permissions.allow에 등록 필요. 등록 후 같은 명령 재실행.
```

and end the response. Do NOT print the Phase 5.7 handoff.

### 5.7 — Read-back validate, then print one-line handoff

```bash
# Verify the receipt is valid and unblocks /mccp:prp-implement
# v1.3.1: forward --decision/--plan explicitly so the validator scopes to the
# correct receipt instead of falling back to decisionId='default' (Codex R1 F1).
node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js validate \
  --command mccp:prp-implement \
  --decision ${DECISION_SLUG} \
  --plan <plan path>
```

If exit code is 0:

```
Receipt: <receipt path from 5.6 stdout> | Codex: converged in <N> rounds  (or: skipped, auto-fallback)
Next: /mccp:prp-implement <plan path>
```

If exit code is non-zero: do NOT print the handoff. Output the validate stderr and end the response — let the user inspect via `node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status`.

### Forbidden during Phase 5

- "Codex 호출 진행할까요?" / "shall I invoke Codex?"
- "receipt 직접 작성해주세요" / "receipt를 만드는 커맨드를 터미널에 입력해주세요"
- "/mccp:prp-implement 직접 실행해주세요" / "다음 단계는 사용자가 직접 진행"
- 단계 사이 yes/no/proceed/confirm 컨펌 요청 (5.5 CRITICAL stop만 예외)
