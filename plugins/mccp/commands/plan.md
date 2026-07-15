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

## Phase 2.5 — MULTI-PERSPECTIVE FAN-OUT (PRD mode, default on, v1.22.1 live-activation)

> Runs in PRD artifact mode by **default** (live-activation M1 flipped the firing default ON — opt out with `MCCP_PLAN_FANOUT=off`). It strengthens GROUND by fanning out four **read-only** perspectives (architect / security / test / explorer) through the `Workflow` primitive, then injects a deterministic `## Multi-Perspective Fan-out` section into the plan body. The fan-out workers are dedicated read-only agents (`mccp:fanout-*`, tools: Read/Grep/Glob) — write/edit/bash are absent from their toolset, so they **cannot** modify files or write receipts. The Codex dual-review gate (Phase 5) and the receipt chain are therefore untouched: the fan-out output rides inside `plan_hash` and is reviewed like any other plan content. **Cost fail-open** (live-activation M1): a missing/corrupt cost-state now assumes green and runs (the `MCCP_ORCHESTRATION_COST_FAIL_OPEN=0` kill switch restores the old fail-closed skip). **Operational USD retired** (live-activation M3): a *present* sticky critical / `hard_ceiling` no longer skips either — M1's fail-open only covered an *absent* cost-state, so ordinary operational spend still blocked every fan-out. Runaway is now bounded by the replacement catastrophic-USD ceiling (`MCCP_ORCHESTRATION_CATASTROPHIC_USD`, default $500) + the atomic cost-state-independent session launch cap (`orchestration-runaway.js#reserveWorkers`, applied on every run path) + the per-agent token budget. `MCCP_ORCHESTRATION_USD_BOMB=1` restores the M1 operational-USD block. **Fail-open**: any skip / throw / unavailable Workflow still falls back to the inline Pattern Grounding above and NEVER blocks the plan.

### 2.5.1 — Resolve run/skip (mode × PRD-mode × cost-tier oracle)

```bash
# PRD mode = the /mccp:plan input is a .prd.md path (mirror of Phase 4.5).
PLAN_INPUT="<original /mccp:plan argument>"
PRD_MODE=false
case "$PLAN_INPUT" in *.prd.md) PRD_MODE=true ;; esac

# Plugin root is passed as argv (not embedded in the single-quoted script) —
# mirror of the prp-implement ROUTE_JSON block convention.
FANOUT_JSON=$(node -e '
  const root = process.argv[1];
  const prdMode = process.argv[2] === "true";
  const budget = require(root + "/scripts/lib/plan-fanout/budget");
  const costState = require(root + "/scripts/lib/cost-state");
  const subscription = require(root + "/scripts/lib/subscription");
  const contextState = require(root + "/scripts/lib/context-state");
  const runaway = require(root + "/scripts/lib/orchestration-runaway");
  // live-activation M1 — cost fail-open (default true). MCCP_ORCHESTRATION_COST_FAIL_OPEN=0
  // restores the old fail-closed COST_STATE_UNKNOWN skip.
  const costFailOpen = String(process.env.MCCP_ORCHESTRATION_COST_FAIL_OPEN || "").trim() !== "0";
  // live-activation M3 — operational USD ($50/$80/$100 + hard_ceiling) no longer
  // blocks the fan-out; usdBomb restores that M1 block, catastrophicUsd is the
  // replacement bomb detector far above it (Codex F1/F4). The cost-state-independent
  // agent-count cap is now the primary structural backstop and applies to EVERY run
  // path, not just the telemetry-absent one.
  const usdBomb = runaway.parseUsdBomb(process.env);
  const catastrophicUsd = runaway.parseCatastrophicUsd(process.env);
  const sessionId = process.env.CLAUDE_SESSION_ID || "unknown";
  let reservationId = null;
  const r = budget.resolveFanout({
    env: process.env,
    prdMode: prdMode,
    costStateRead: costState.readState,
    tierFor: costState.tierFor,
    costFailOpen: costFailOpen,
    usdBomb: usdBomb,
    catastrophicUsd: catastrophicUsd,
    // M3 Codex F2 — ATOMIC reserve replaces read-then-bump: it decides the grant
    // AND counts it inside ONE lock critical section, so concurrent / re-entrant
    // fan-outs can no longer each read the same pre-bump value and overshoot the
    // cap. It only runs on a RUN path, and it ALREADY counted the grant — there is
    // deliberately no bumpCounter afterwards.
    //
    // M3 follow-up (R1 F2): the grant is PENDING, not a permanent spend. 2.5.3
    // reconciles it to the number of agents that actually spawned. The oracle
    // signature stays pure/injected — the id rides out in the emitted JSON.
    runawayClamp: function (n) {
      const res = runaway.reserveWorkers({ sessionId: sessionId, requestedN: n, env: process.env });
      reservationId = res.reservationId;
      return { n: res.granted, degraded: res.degraded, reason: res.reason };
    },
    // cost-model-subscription M1 — under MCCP_SUBSCRIPTION the fan-out bypasses
    // the USD cost-state/tier gates and evaluates the context overflow axis.
    subscriptionMode: subscription.isSubscriptionMode(process.env),
    contextStateRead: contextState.readState,
  });
  process.stdout.write(JSON.stringify(Object.assign({}, r, { reservationId: reservationId })));
' "${CLAUDE_PLUGIN_ROOT}" "$PRD_MODE")
# M3 follow-up (R1 F1) — stale-clear + persist the reservation token HERE only,
# immediately around the reserve. Fan-out has no route boundary, so 2.5.3 is the
# reconcile point and this token must survive until then.
GITDIR_FANOUT=$(git rev-parse --git-path mccp/tmp)
mkdir -p "$GITDIR_FANOUT"
rm -f "$GITDIR_FANOUT/fanout-reservation.json" "$GITDIR_FANOUT/fanout-result.json"
echo "$FANOUT_JSON" | node -e '
  const fs=require("fs");
  let j={}; try{ j=JSON.parse(fs.readFileSync(0,"utf8")); }catch(_){}
  if (j && typeof j.reservationId==="string" && j.reservationId)
    fs.writeFileSync(process.argv[1], JSON.stringify({ reservation_id:j.reservationId, granted:j.fleetSize||1 }));
' "$GITDIR_FANOUT/fanout-reservation.json"
FANOUT_RUN=$(echo "$FANOUT_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).run?"1":"0")}catch{process.stdout.write("0")}')
FANOUT_REASON=$(echo "$FANOUT_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).reason||"unknown")}catch{process.stdout.write("parse-error")}')
FANOUT_MINREM=$(echo "$FANOUT_JSON" | node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).minRemaining||0))}catch{process.stdout.write("0")}')
FANOUT_DEGRADED=$(echo "$FANOUT_JSON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).degraded?"1":"0")}catch{process.stdout.write("0")}')
# M3 (PR-Codex R1 F1) — the GRANTED fleet must reach the Workflow. reserveWorkers
# can degrade fleetSize to 1, but the workflow defaults a missing fleetKeys to all
# four perspectives — so a degraded reservation would record one worker and still
# spawn four, and the lowered minRemaining would let the budget pre-guard pass on
# one agent's budget while four ran. Deriving fleetKeys from the granted fleetSize
# makes the runaway cap actually bind (it is M3's primary backstop now, so an
# unenforced cap would make that claim false).
FANOUT_FLEETSIZE=$(echo "$FANOUT_JSON" | node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).fleetSize||0))}catch{process.stdout.write("0")}')
FANOUT_FLEET_KEYS=$(node -e '
  // Mirror of plan-fanout.js PERSPECTIVE_ORDER — the workflow filters its CATALOG
  // by these keys, so the prefix slice IS the spawned subset.
  const order = ["architect", "security", "test", "explorer"];
  const n = parseInt(process.argv[1], 10);
  const keep = (Number.isFinite(n) && n >= 1 && n < order.length) ? order.slice(0, n) : order;
  process.stdout.write(JSON.stringify(keep));
' "$FANOUT_FLEETSIZE")

if [ "$FANOUT_RUN" = "1" ]; then
  echo "[mccp:plan-fanout] fan-out 발화 (reason=$FANOUT_REASON degraded=$FANOUT_DEGRADED) — default on, MCCP_PLAN_FANOUT=off로 opt-out" 1>&2
elif [ "$FANOUT_REASON" = "lock-exhausted" ]; then
  # R1 F1 — the reserve granted 0: the counter lock was unavailable, so no agent
  # launched here could be recorded and the cap would be bypassed. Inline Pattern
  # Grounding spawns nothing, so the plan proceeds and the cap stays exact.
  echo "[mccp:plan-fanout] runaway counter lock 고갈 — 예약 불가(granted 0). 기록되지 않는 launch를 막기 위해 인라인 Pattern Grounding으로 강등한다(에이전트 0개, cap 미소비). plan은 차단되지 않는다." 1>&2
else
  echo "[mccp:plan-fanout] skipped reason=$FANOUT_REASON — using inline Pattern Grounding (default on; off로 opt-out했다면 정상)" 1>&2
fi
```

`resolveFanout` skips (first match wins) on: `MCCP_PLAN_FANOUT` == `off`/`0` (`env-off` — now default ON), non-PRD input (`not-prd-mode`), missing cost-state with the kill switch set (`cost-state-unknown`; the default is now `cost-failopen` **run**), `hard_ceiling_reached` (`hard-ceiling` bomb detector), or cost-tier == critical (`tier-critical` — narrowed from notice/warning/critical). Everything else (`ok-run` / `cost-failopen` / `subscription-overflow` green) proceeds to 2.5.2. The runaway clamp may degrade `fleetSize` on the fail-open path (`degraded=1`).

### 2.5.2 — Fan out (run path only)

When `FANOUT_RUN=1`, invoke the `Workflow` tool. This slash-command instruction plus the user's explicit `MCCP_PLAN_FANOUT=on` satisfies the Workflow opt-in contract:

    Workflow({
      scriptPath: "${CLAUDE_PLUGIN_ROOT}/scripts/workflows/plan-fanout.js",
      args: { prdPath: "<PRD path>", planPath: "<draft plan path or null>", minRemaining: <FANOUT_MINREM>, fleetKeys: <FANOUT_FLEET_KEYS> }
    })

The script spawns the read-only `mccp:fanout-*` perspectives named by `fleetKeys` in parallel (`effort:'low'`), applies its own budget pre-guard (skips without spawning a single agent when a `+Nk` target cannot cover the fleet), synthesizes deterministically, and returns `{ markdown, coverage, spent, skipped }`.

**`fleetKeys` is load-bearing, not cosmetic** (M3 / PR-Codex R1 F1): it carries the fleet the runaway reserve actually GRANTED. Omit it and the workflow falls back to all four perspectives, so a near-cap or lock-exhausted session records one worker and still spawns four — the cap M3 promotes to primary backstop would not bind, and the lowered `minRemaining` would clear the budget pre-guard on one agent's budget while four ran. Always pass `<FANOUT_FLEET_KEYS>` derived from the oracle's `fleetSize`.

### 2.5.3 — Inject or fall back (fail-open)

- **Success** (`skipped` falsy AND `coverage > 0`): inject the returned `markdown` verbatim into the plan body during Phase 4 WRITE (it becomes part of `plan_hash` and is reviewed by the Phase 5 Codex gate). Log `[mccp:plan-fanout] coverage=<N>/4 spent=<spent>`.
- **Skip / empty / throw / Workflow unavailable** (`skipped:true`, `coverage===0`, a tool error, or the primitive not present in this install): DO NOT block. Keep the inline Pattern Grounding above as the grounding source and log the reason. Fan-out is a GROUND *enhancement*, never a gate.

**Reconcile the runaway reservation (M3 follow-up, R1 F2).** 2.5.1 reserved cap headroom while resolving the oracle, and several paths below spawn nothing. Unlike `work.md`, fan-out has **no route boundary** — the `Workflow` call itself IS the launch point — so every post-invocation path must commit EXPLICITLY. Leaving a post-call path to the pending lease would expire a reservation whose agents really did spawn (over-permissive). `actualN` by outcome:

| Outcome | actualN | Why |
|---|---|---|
| `skipped:true` (in-sandbox budget pre-guard) | **0** | the script contractually spawns zero agents |
| Workflow unavailable / never invoked | **0** | no call was made |
| success (`coverage > 0`) | granted | the fleet ran |
| throw / `coverage === 0` | **granted** | agents may already have spawned then failed — stay conservative and count them |

**The count is derived MECHANICALLY, not inferred (R1 F2).** An earlier revision had the LLM set a `FANOUT_ACTUAL_N` shell variable per this table, defaulting to `$RES_GRANTED` when unset — and the rows that say **0** are precisely the ones where the model never reaches that reasoning step, so the default committed a full phantom grant *permanently* (a committed entry leaves `open[]` and the lease can never reclaim it). Your only job now is to **write down the Workflow result verbatim**; `reconcile.js#deriveFanoutActualN` owns the mapping. Immediately after 2.5.2 resolves — success, skip, throw, or "the tool isn't available" — write the artifact:

```bash
GITDIR_FANOUT=$(git rev-parse --git-path mccp/tmp)
# Fill from the ACTUAL Workflow result. Never invoked / tool absent → {"invoked":false}.
# Invoked → {"invoked":true,"skipped":<bool>,"coverage":<number>}. On a throw, record
# what you know: {"invoked":true,"skipped":false,"coverage":0}.
echo '<result json>' > "$GITDIR_FANOUT/fanout-result.json"
```

If this artifact is missing, 2.5.3 does **not** reconcile: the reservation stays pending and the lease resolves it. That is the correct handling of "unknown" — pending is conservative (still counted) and self-healing, whereas guessing 0 would under-count a real launch and leave the cap over-permissive.

```bash
GITDIR_FANOUT=$(git rev-parse --git-path mccp/tmp)
if [ -f "$GITDIR_FANOUT/fanout-reservation.json" ]; then
  RES_ID=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).reservation_id||"")}catch{process.stdout.write("")}' "$GITDIR_FANOUT/fanout-reservation.json")
  RES_GRANTED=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).granted||1))}catch{process.stdout.write("1")}' "$GITDIR_FANOUT/fanout-reservation.json")
  # R1 F2 — actualN is DERIVED from the result artifact by deriveFanoutActualN, not
  # inferred by the model into a shell var with a default. No artifact → empty →
  # SKIP the reconcile entirely: the reservation stays pending (counted,
  # conservative) and the lease reclaims it if nothing ever launched. There is
  # deliberately no `:-` default here; a default is what made the zero-rows commit
  # a permanent phantom.
  FANOUT_ACTUAL_N=$(node -e '
    const fs=require("fs");
    const rc=require(process.argv[1]+"/scripts/lib/plan-fanout/reconcile");
    let result=null;
    try { result=JSON.parse(fs.readFileSync(process.argv[2],"utf8")); } catch(_) {}
    const d=rc.deriveFanoutActualN({ result:result, granted:parseInt(process.argv[3],10) });
    if (d) { process.stderr.write("[mccp:plan-fanout] actualN="+d.actualN+" ("+d.reason+")\n"); process.stdout.write(String(d.actualN)); }
  ' "${CLAUDE_PLUGIN_ROOT}" "$GITDIR_FANOUT/fanout-result.json" "$RES_GRANTED")
  if [ -z "$FANOUT_ACTUAL_N" ]; then
    echo "[mccp:plan-fanout] WARNING: fanout-result.json 없음/판독 불가 — reconcile을 건너뛴다. 예약 $RES_ID 는 pending으로 남아 counted(보수적)이며 lease(MCCP_ORCHESTRATION_RESERVATION_LEASE_MS)가 회수한다." 1>&2
  else
  # R1 F1 — a nonzero exit means the commit did NOT land while agents really did
  # spawn; the lease would then drop them as "never launched" and under-count the
  # cap. Retry across the lock's 5s stale window. Unlike work.md this runs AFTER
  # the launch, so halting cannot un-spawn anything — keep the token, warn loudly,
  # and let the plan proceed (fan-out is a GROUND enhancement and must never block
  # a plan).
  #
  # R1 F2 (5th round) — the line that used to sit here said the residual was "a
  # conservative over-count until the lease resolves it". That was wrong in the way
  # that mattered: the lease does not resolve it, it PRUNES it. Pending entries are
  # counted, so the error starts conservative — and then the lease flips it to an
  # UNDER-count, the one direction a cap may never err in. Warning and proceeding
  # therefore did not leave a safe residual; it left a timer on a silent bypass.
  #
  # The reconcile CLI now writes a lock-free DEBT MARKER whenever it cannot commit
  # while actual > 0, which pins the entry against the lease. The residual really is
  # a conservative over-count now, and it stays one until a later reconcile commits.
  RECONCILED=0
  for attempt in 1 2 3; do
    if node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" reconcile \
         --reservation "$RES_ID" --actual "$FANOUT_ACTUAL_N" \
         --session "${CLAUDE_SESSION_ID:-unknown}" 1>&2; then
      RECONCILED=1; break
    fi
    sleep 3
  done
  if [ "$RECONCILED" = "1" ]; then
    rm -f "$GITDIR_FANOUT/fanout-reservation.json"
  else
    echo "[mccp:plan-fanout] WARNING: reservation $RES_ID uncommitted after 3 attempts; token kept at $GITDIR_FANOUT/fanout-reservation.json. The reconcile CLI pinned these launches with a debt marker, so the lease will NOT drop them — the cap stays conservative (over-counted) until a later reconcile commits it." 1>&2
  fi
  fi
fi
```

Tuning env (documented in CLAUDE.md §4): `MCCP_PLAN_FANOUT` (default **on** — set `off`/`0` to opt out), `MCCP_PLAN_FANOUT_BUDGET` (per-agent token estimate, default 150000), `MCCP_PLAN_FANOUT_AUTODISABLE_TIER` (v1.22.3 M3 — default **empty**: operational tiers no longer disable the fan-out; set e.g. `critical` to re-block), `MCCP_ORCHESTRATION_COST_FAIL_OPEN` (default on; `=0` restores the old fail-closed skip), `MCCP_ORCHESTRATION_CATASTROPHIC_USD` (v1.22.3 M3 — replacement bomb detector, default `500`; a spend at or above it skips the fan-out), `MCCP_ORCHESTRATION_USD_BOMB` (v1.22.3 M3 — default off; `1|true|yes|on` restores the M1 operational-USD block: `hard_ceiling` skip + critical autoDisable), `MCCP_ORCHESTRATION_MAX_AGENTS` (atomic session launch cap, default 24 — now applied on every run path, not just the telemetry-absent one).

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

### 5.0 — impeccable design gate (자동, /mccp:plan 진입 시 MANDATORY, v0.2.6 Milestone 1 · v1.3.0-m2 3-axis trigger)

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

# v1.3.0-m2 Task 6 (F1 absorption) — 3-axis trigger evaluation. Even when the
# detector returns SIGNAL=0, two side channels can force the critique loop on:
#
#   axis a: detector positive (existing — SIGNAL=1)
#   axis b: narrow whitelist hit (impeccable-detect.js DESIGN_SURFACE_PATHS
#           includes design-gate control-plane files: impeccable-detect.js
#           itself, design-critique-decide.js, frontend-design-direction/).
#           This axis is already covered by SIGNAL=1 — listing here for clarity.
#   axis c: audited intent override — MCCP_DESIGN_INTENT_REASON with a
#           substantive reason (strict mirror of impeccable_force_override
#           rules: ≥30 chars, ≥3 words, no placeholder/URL-only/banlist token)
#           forces the trigger when the author knows the change touches design
#           routing but the detector can't see it.
#
# DESIGN_INTENT_ACTIVE=1 means the user opted into the SKILL first-step + critique
# loop regardless of SIGNAL. The reason text is forwarded to receipt-write so
# the audit trail records WHO asked for the override and WHY.
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
    echo "[mccp:design-critique] MCCP_DESIGN_INTENT_REASON active — forcing SKILL first-step + critique loop (audited override)" 1>&2
  else
    echo "[mccp:design-critique] MCCP_DESIGN_INTENT_REASON rejected (${REASON_OK#0:}); falling back to detector decision" 1>&2
  fi
fi

# SKILL first-step Read enforcement (Task 6) — when any trigger fires, the
# critique loop body MUST Read the SKILL.md anchors before invoking impeccable.
# This guarantees the 4 Output Constraints are in context for the critique.
if [ "$SKILL_AVAIL" = "1" ] && { [ "$SIGNAL" = "1" ] || [ "$DESIGN_INTENT_ACTIVE" = "1" ]; }; then
  echo "[mccp:design-critique] SKILL first-step Read required: plugins/mccp/skills/frontend-design-direction/SKILL.md" 1>&2
  # The LLM body of this command Read()s SKILL.md before entering the critique
  # loop. Phase 4 WRITE output is expected to cite the "## Output Constraints"
  # section when introducing design surface.
fi
```

Decision tree (v1.3.0 M1 — silent-skip is no longer silent):

| SKILL_AVAIL | SIGNAL | DESIGN_INTENT_ACTIVE | Action |
|---|---|---|---|
| 0 | * | * | Append `> impeccable unavailable, skipped (auto-fallback): $DETECT_REASON` to the plan body under a `## Design Critique` heading. Export `IMPECCABLE_SKIPPED_REASON="$DETECT_REASON"`. plan-codex is a lenient gate — `meta.impeccable_skipped=true` surfaces as warning, not blocking. |
| 1 | 0 | 0 | Detector found no design surface in this plan. Emit a loud stderr warn (`[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · plan declares no design surface (whitelist hit 0)`) and forward `--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON"` to 5.6 — UNLESS `IMPECCABLE_FORCE_OVERRIDE_REASON` is set (schema mutex; silent_skip forward suppressed). M1 records silent_skip as informational warning at every gate; M2 will promote to blocking on strict gates once SKILL first-step + critique loop are wired. |
| 1 | 1 | * | Run the **critique retry loop** (v1.3.0-m2 Task 7, described below). Append result to plan body under `## Design Critique`. Forward `--design-critique-rounds <N> --design-critique-verdict <enum>` to 5.6. |
| 1 | 0 | 1 | Audited override active (`MCCP_DESIGN_INTENT_REASON` substantive). Run the same critique retry loop as SIGNAL=1. Additionally forward `--design-intent-reason "$DESIGN_INTENT_REASON_FORWARD"` to 5.6. |

#### Critique retry loop (v1.3.0-m2 Task 7 — plan.md reference impl)

```bash
# cap is in [0, 3]; default 2. cap=0 → critique runs once and the verdict
# locks to DIVERGENT_UNRESOLVED if anything HIGH/CRITICAL/UNKNOWN remains
# (kill-switch — observable, not silent).
CAP=$(node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-critique-decide').parseRetryCap(process.env))")
ROUND=0
VERDICT=""
# Test-only fail injection (Task 10 dogfood gate). When set, the loop body
# treats the critique result as a HIGH finding without invoking impeccable.
# Production critique invocations ignore this env.
FORCE_FAIL="${MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL:-0}"

while [ "$ROUND" -le "$CAP" ]; do
  # 1. Invoke Skill(impeccable, "critique <plan slug>") OR mock when
  #    FORCE_FAIL=1 (returns [{severity:'HIGH', title:'forced-fail mock'}]).
  # 2. Parse critique findings as a JSON array under the body's actionable
  #    instructions. Critique invariant: each finding MUST name the plan
  #    section to Edit; loop terminates DIVERGENT if any finding is
  #    actionable-instruction-missing.
  # 3. Compute VERDICT via the pure oracle:
  VERDICT=$(node -e "
    const { decideCritique } = require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-critique-decide');
    const findings = JSON.parse(process.argv[1] || '[]');
    const verdict = decideCritique({ findings, round: Number(process.argv[2]), cap: Number(process.argv[3]) });
    process.stdout.write(verdict);
  " "$CRITIQUE_FINDINGS_JSON" "$ROUND" "$CAP")

  case "$VERDICT" in
    CONVERGED)
      echo "[mccp:design-critique] round=$ROUND/$CAP verdict=CONVERGED" 1>&2
      break
      ;;
    ESCALATE_NEXT_ROUND)
      echo "[mccp:design-critique] round=$ROUND/$CAP verdict=ESCALATE — editing plan body per critique" 1>&2
      # Edit ONLY the plan sections named by critique findings — DO NOT
      # regenerate the whole plan body (Phase 4 cyclic re-entry guard).
      # After edits, ROUND++ and re-critique.
      ROUND=$((ROUND + 1))
      ;;
    DIVERGENT_UNRESOLVED)
      echo "[mccp:design-critique] round=$ROUND/$CAP verdict=DIVERGENT_UNRESOLVED — annotating plan body and breaking loop" 1>&2
      # Append a DIVERGENT_UNRESOLVED note to ## Design Critique listing the
      # surviving HIGH/CRITICAL findings + the cap. The receipt verdict
      # surfaces this to /mccp:pr's chain-check (Task 5/8).
      break
      ;;
  esac
done

# Map oracle enum → receipt verdict enum (lowercase) for 5.6 receipt-write
case "$VERDICT" in
  CONVERGED)             RECEIPT_VERDICT="converged" ;;
  DIVERGENT_UNRESOLVED)  RECEIPT_VERDICT="divergent" ;;
  *)                     RECEIPT_VERDICT="skipped" ;;
esac
DESIGN_CRITIQUE_ROUNDS=$((ROUND + 1))  # ROUND is 0-indexed; receipt counts invocations
```

If `Skill(impeccable, ...)` returns `unknown_skill` / `not found` at any
iteration, fall back to the SKILL_AVAIL=0 row above (treat as skipped).

Loud stderr warn pattern for the SKILL_AVAIL=1 SIGNAL=0 row (Task 3):

```bash
if [ "$SKILL_AVAIL" = "1" ] && [ "$SIGNAL" = "0" ]; then
  echo "[mccp:impeccable] silent-skip reason=$SILENT_SKIP_REASON · plan declares no design surface (whitelist hit 0)" 1>&2
fi
```

#### Stage-aware routing GUIDE (v1.13.0 — recommend-only at plan stage)

When the trigger fires (SKILL_AVAIL=1 & (SIGNAL=1 OR DESIGN_INTENT_ACTIVE=1)), the plan stage has no rendered UI yet, so it **does NOT invoke** any impeccable command — it records a routing GUIDE for the implementer. Append a `## Design Routing Guide` section to the plan body listing the stage→command sequence the implementer should follow:

```bash
MODE=$(node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-routing').parseRoutingMode(process.env))")
node -e "
  const r=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-routing');
  const out=r.routeCommands({gate:'plan', mode:process.argv[1], designSignal:true});
  const rows=out.commands.map(c=>'| '+c.stage+' | \`/impeccable '+c.command+'\` |').join('\n');
  process.stdout.write(rows);
" "$MODE"
```

The guide section format (every row recommend — plan stage never invokes):

```markdown
## Design Routing Guide

routing mode: <MODE> (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
```

> The table above is illustrative — the actual rows are generated by iterating `routeCommands({gate:'plan'}).commands`, so the v1.13.0 M2 extended catalogue (refine animate/colorize + mood bolder/quieter/overdrive/delight, the new simplify stage adapt/distill/clarify, harden optimize/onboard) flows through automatically. At implement, content-detectable refine commands (animate/colorize/typeset/adapt) only invoke when the matching diff signal is present; mood commands stay recommend unless `MCCP_IMPECCABLE_INTENT_COMMANDS` + audited intent elevate them.

Receipt-write at 5.6 forwards `--impeccable-routing-mode "$MODE"` only (the guide is not an actual invocation, so no `--impeccable-commands-routed-file`).

Receipt-write at 5.6 forwards:
- `--impeccable-skipped --impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON"` when SKILL_AVAIL=0 OR Skill fell back.
- `--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON"` when SILENT_SKIP=1 AND `IMPECCABLE_FORCE_OVERRIDE_REASON` is empty.
- The two are mutually exclusive at the runtime semantic (skill_available=true vs false). Schema also rejects silent_skip + force_override coexisting — when the audited escape env is set we suppress silent_skip forward so the force_override path produces a clean receipt.
- `--impeccable-routing-mode "$MODE"` when the routing GUIDE ran (SIGNAL=1 OR DESIGN_INTENT_ACTIVE=1).

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
MCCP_TMP="$(git rev-parse --git-dir)/mccp/tmp"   # worktree-safe (§3.8 — .git는 worktree에서 파일)
mkdir -p "$MCCP_TMP"
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
  --json $IMPECCABLE_FLAG 2> "$MCCP_TMP/codex-invoke.stderr")
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

# v1.20.3 (Task 5) — derive $CODEX_VERDICT, the REAL Codex adversarial-review
# verdict, for the 5.6 receipt-write. This is a DEDICATED variable: NEVER reuse
# the design-critique loop's $VERDICT / $RECEIPT_VERDICT. A converged design
# critique must not over-stamp a divergent Codex review — that reintroduces the
# P1 cross-gate false-skip bug. Cross-gate dedupe (dedupe.js#evaluateForDedupe)
# fail-closes on any value other than 'converged', so an accurate verdict here
# is what keeps dual-review honest at the /mccp:pr step.
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
  # directly. That is a free-TEXT keyword scan with no `needs-attention` in its
  # vocabulary, and its /\bconverged\b/ rule matches the word ANYWHERE in the
  # prose. Measured on this cycle's own Plan-Codex R1 ('needs-attention', "No
  # ship", 4 findings) it returned **converged** — matching the word inside a
  # finding that was warning against stamping converged. Since
  # resolution.codex_verdict feeds cross-gate dedupe, two such false stamps make
  # /mccp:pr skip PR-Codex entirely: dual review silently bypassed.
  CODEX_VERDICT=$(node -e '
    const payload = require("'"${CLAUDE_PLUGIN_ROOT}"'/scripts/lib/codex-review-payload");
    let envelope = null;
    try { envelope = JSON.parse(process.argv[1] || "{}"); } catch (_) {}
    const g = payload.deriveGateVerdict({
      envelope: envelope,
      freeText: (envelope && envelope.stdout) || "",
    });
    if (g.source !== "structured") {
      process.stderr.write("[mccp:plan-codex] verdict source=" + g.source +
        " (no structured .result.verdict; free-text fallback)\n");
    }
    process.stdout.write(g.verdict);
  ' "$CODEX_STDOUT")
fi
```

After Phase 5.4's YAGNI triage loop finishes: if the loop annotated `Open Questions: DIVERGENT_UNRESOLVED` (cap reached with an unresolved ACCEPT_NOW HIGH/CRITICAL), set `CODEX_VERDICT="divergent"` — overriding the parsed value so the receipt records the unresolved divergence. This is the ONLY place the triage outcome overrides the raw parse.

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
# v1.3.0-m2 — design-critique retry-loop audit forward. Only emitted when the
# retry loop actually ran (SIGNAL=1 OR DESIGN_INTENT_ACTIVE=1). The audited
# override reason is separate so receipt-write can apply the strict validator.
if [ -n "${RECEIPT_VERDICT:-}" ] && [ "${RECEIPT_VERDICT:-skipped}" != "skipped" ]; then
  WRITE_FLAGS+=(--design-critique-rounds "$DESIGN_CRITIQUE_ROUNDS"
                --design-critique-verdict "$RECEIPT_VERDICT")
fi
if [ -n "${DESIGN_INTENT_REASON_FORWARD:-}" ]; then
  WRITE_FLAGS+=(--design-intent-reason "$DESIGN_INTENT_REASON_FORWARD")
fi
# v1.13.0 — routing GUIDE recorded the effective mode (plan stage is recommend-
# only, so no commands-routed-file is forwarded here).
if [ -n "${MODE:-}" ]; then
  WRITE_FLAGS+=(--impeccable-routing-mode "$MODE")
fi
# v1.20.3 (Task 5) — forward the real Codex verdict so cross-gate dedupe (at
# /mccp:pr) checks the actual outcome instead of the always-true
# resolution.converged. $CODEX_VERDICT is the DEDICATED Phase 5.2 variable — NOT
# the design-critique $RECEIPT_VERDICT. Omit when empty (blocked/exited path).
if [ -n "${CODEX_VERDICT:-}" ]; then
  WRITE_FLAGS+=(--codex-verdict "$CODEX_VERDICT")
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
