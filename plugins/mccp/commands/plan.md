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

   **In-scope branch first (codex-intent-context M1).** If `missing[i].gate_id` is
   `mccp-plan-codex`, do **NOT** run `cli.js write`. Step 3 above already notes that
   this is the *typical* missing receipt for `/mccp:plan` — and it is exactly the gate
   the intent gate governs, whose decision has no CLI surface by design (a flag there
   would let any shell caller stamp an approving verdict without Codex running). A
   blind write fails closed with exit 12 and surfaces as an opaque error. Instead
   output:

   ```
   [MCCP-INTENT-GATE-STOP] cannot auto-recover a missing mccp-plan-codex receipt.
   That gate is produced by plan-codex-runner.js, which invokes Codex and adjudicates
   every finding in one process — there is no CLI path that can reproduce it.
   Recovery:
     1. Re-enter `/mccp:plan <plan path>` so the runner regenerates the gate; OR
     2. Set MCCP_SKIP_INTENT_GATE="<substantive reason>" for an audited override
        (the receipt still seals the real blocking verdict, so cross-gate dedupe
        stays fail-closed).
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

## Phase 1.5 — CAPTURE USER INTENT (PRD mode, codex-intent-context M1)

Before drafting the plan body, extract what the **user** stated — from the PRD, from
this conversation, and from any explicit instruction in `$ARGUMENTS` — into the
`## User Intent` table. This is the only channel by which the out-of-process reviewer
can learn what was actually asked for; without it the reviewer sees a proposal with no
requirements attached and can only judge it on internal consistency.

Capture rules:

- **User-stated only.** "Do not touch the implement gate", "cost is not a concern",
  "split the remainder into M1.5" — these are intent. "I chose a single process because
  it removes the forgery window" is author rationale and belongs in `## Design Decisions`.
  The oracle reads the `Constraint` column and nothing else, so rationale placed there
  is the one way to defeat the separation.
- **Exclusions are intent too.** What the user ruled OUT is often the most valuable
  signal for a reviewer, because it is what a plan is most likely to quietly re-expand.
- **One row per constraint**, phrased as the user would recognize it.

If the user stated no constraints at all, do not fabricate rows to satisfy the gate —
say so and ask. A fabricated table passes the structural checks and poisons the review.

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
  const costFailOpen = require(root + "/scripts/lib/env-contract/value")
    .parseBool(process.env, "MCCP_ORCHESTRATION_COST_FAIL_OPEN");
  // live-activation M3 — operational USD ($50/$80/$100 + hard_ceiling) no longer
  // blocks the fan-out; usdBomb restores that M1 block, catastrophicUsd is the
  // replacement bomb detector far above it (Codex F1/F4). The cost-state-independent
  // agent-count cap is now the primary structural backstop and applies to EVERY run
  // path, not just the telemetry-absent one.
  const usdBomb = runaway.parseUsdBomb(process.env);
  const catastrophicUsd = runaway.parseCatastrophicUsd(process.env);
  const sessionId = runaway.resolveSessionKey(process.env); // CLAUDE_CODE_SESSION_ID — must match 2.5.3 reconcile's key
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

FANOUT_RUNAWAY_REASON=$(echo "$FANOUT_JSON" | node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write((!j.run && j.runawayReason)?String(j.runawayReason):"")}catch{process.stdout.write("")}')
if [ "$FANOUT_RUN" = "1" ]; then
  echo "[mccp:plan-fanout] fan-out 발화 (reason=$FANOUT_REASON degraded=$FANOUT_DEGRADED) — default on, MCCP_PLAN_FANOUT=off로 opt-out" 1>&2
elif [ -n "$FANOUT_RUNAWAY_REASON" ]; then
  # R1 F1 — the reserve granted 0, so no agent launched here could be recorded and
  # the cap would be bypassed. Inline Pattern Grounding spawns nothing, so the plan
  # proceeds and the cap stays exact.
  #
  # PR-Codex R1 F1 (6th round) — was a literal compare against "lock-exhausted",
  # which silently lost the 5th round's new 'cap-exhausted'. Unlike work.md this was
  # only a message-specificity bug (a zero-grant already sets FANOUT_RUN=0, and 2.5.2
  # never fires without it), but the same structural test is used here so the two
  # callers cannot drift again.
  echo "[mccp:plan-fanout] runaway 예약 거부($FANOUT_RUNAWAY_REASON) — granted 0. 기록되지 않는 launch를 막기 위해 인라인 Pattern Grounding으로 강등한다(에이전트 0개, cap 미소비). plan은 차단되지 않는다." 1>&2
else
  echo "[mccp:plan-fanout] skipped reason=$FANOUT_REASON — using inline Pattern Grounding (default on; off로 opt-out했다면 정상)" 1>&2
fi

# ── Implement-Codex R1 F2 (7th round) — PIN BEFORE THE LAUNCH ──────────────────
#
# fan-out has no pre-launch boundary: the Workflow call in 2.5.2 IS the launch
# point. 2.5.3 reconciles AFTER it returns, which is fine when it returns — but if
# the controller dies mid-flight (timeout, crash, abandoned turn), nothing ever
# reaches that block. The reservation then sits pending, and the lease prunes it as
# "never launched" while the agents really ran: an under-count, the one direction a
# cap may never err in.
#
# An earlier draft answered this with a separate "started" marker, but readCounter
# honours debt markers and NOTHING else, so a started marker read only by the
# post-call handler is worthless exactly when that handler is missed. Pin with the
# real debt marker BEFORE calling Workflow instead: the window closes, and a normal
# 2.5.3 reconcile still commits and clears it (orchestration-runaway.js#clearDebt).
# The pin is PERMANENT — it never decays (PR-Codex R1 5th round rejected time-based
# decay: a marker present after a controller death is proof those agents launched, so
# aging it out would UNDER-count the cap). A dead controller over-counts for the rest of
# the session; that self-poisoning is bounded (the counter is session-keyed, so the next
# session resets, and each incident pins ≤ fleetSize of MCCP_ORCHESTRATION_MAX_AGENTS).
#
# Pin failure ⇒ DO NOT LAUNCH: an unrecordable launch is not permitted, and inline
# Pattern Grounding spawns nothing. fan-out is a GROUND enhancement, so degrading
# here never blocks the plan.
if [ "$FANOUT_RUN" = "1" ] && [ -f "$GITDIR_FANOUT/fanout-reservation.json" ]; then
  PIN_ID=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).reservation_id||"")}catch{process.stdout.write("")}' "$GITDIR_FANOUT/fanout-reservation.json")
  PIN_N=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).granted||1))}catch{process.stdout.write("1")}' "$GITDIR_FANOUT/fanout-reservation.json")
  if [ -n "$PIN_ID" ]; then
    if node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" mark-debt \
         --reservation "$PIN_ID" --n "$PIN_N" 1>/dev/null 2>&1; then
      echo "[mccp:plan-fanout] 예약 $PIN_ID pin 완료(debt marker) — Workflow 호출 전. 컨트롤러가 죽어도 lease가 실 launch를 prune하지 못한다." 1>&2
    else
      FANOUT_RUN=0
      echo "[mccp:plan-fanout] WARNING: debt marker write 실패 — Workflow를 호출하지 않는다(기록 불가능한 launch 금지). 인라인 Pattern Grounding으로 강등. plan은 차단되지 않는다." 1>&2
    fi
  fi
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

If this artifact is missing, 2.5.3 does **not** reconcile: the reservation stays pending, **pinned by the debt marker written before the Workflow call**, and a later reconcile commits and clears it. That is the correct handling of "unknown" — guessing 0 would under-count a real launch and leave the cap over-permissive.

> **The pin is what makes this safe** (Implement-Codex R1 F2, 7th round). An earlier revision of this note claimed a bare pending entry was "conservative (still counted) and self-healing". It was neither: pending entries are counted only until the lease expires them, at which point a safe over-count silently flips into an under-count. The lease is safe for `work.md` because its route boundary is provably pre-launch; fan-out has no such boundary, so it pins instead. The pin is **permanent** — PR-Codex R1 (5th-round PR gate) rejected time-based decay on it, because a marker present after a controller death is proof the agents launched, and aging it out would let `readCounter` subtract those real launches (under-count — the one direction the cap must never err). The self-poisoning a permanent pin leaves is bounded, not permanent: the counter is session-keyed, so the next session resets it, and each dead-controller incident pins at most `fleetSize` (≤4) of `MCCP_ORCHESTRATION_MAX_AGENTS`.

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
    echo "[mccp:plan-fanout] WARNING: fanout-result.json 없음/판독 불가 — reconcile을 건너뛴다. 예약 $RES_ID 는 Workflow 호출 전 debt marker로 pin돼 있어 lease가 prune하지 못한다(counted, 보수적, 영구 pin). 뒤늦은 reconcile이 commit하며 청소하거나, 다음 세션에서 session-keyed counter가 리셋된다." 1>&2
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
    # No --session (PR-Codex R1, 8th round): the CLI resolves it via
    # resolveSessionKey(process.env) — the SAME precedence the reserve at 2.5.1 used.
    # Passing ${CLAUDE_SESSION_ID:-unknown} would key the LEGACY var; under env skew
    # (both vars set but differing) reconcile would look in the wrong bucket, exit 0 for
    # actualN=0, and the caller would delete the token while the debt marker still pins
    # the reservation — a permanent phantom pin.
    if node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" reconcile \
         --reservation "$RES_ID" --actual "$FANOUT_ACTUAL_N" 1>&2; then
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

## User Intent

<!-- REQUIRED for PRD-mode plans (codex-intent-context M1). Injected verbatim into
     the reviewer's focus. USER-STATED constraints ONLY — never author rationale
     ("why I designed it this way"), which would anchor the reviewer to your
     reasoning instead of the user's requirements. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | {what the user actually asked for or ruled out} | direction |
| UI2 | {…} | constraint |

Rules the gate enforces mechanically — violating any of them makes the section count
as **absent**, which blocks the gate on a PRD-mode plan:

- `ID` matches `^UI\d+$` and is unique.
- `Kind` ∈ `constraint` / `exception` / `exclusion` / `direction`.
- Constraint text is ≥3 words and contains no placeholder (`{...}`, `TODO`, `TBD`, `N/A`, `-`).
- No instruction-shaped text (`ignore`, `disregard`, `you must`, `system:` …) — the block
  is injected into a reviewer prompt, so it must read as data, not as directives.
- ≤200 rows.

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
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
````

The last item is not boilerplate. The diverse-agent-review M1 milestone passed
every unit test it wrote and shipped eight command-body seam defects, because
nothing in its acceptance required the path to run once end to end. State what
artifact a live run must produce, so "complete" cannot be claimed from green
tests alone.

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

### 5.-1 — Seal the Codex policy for this gate execution (v1.32.6)

Write the operator policy to disk **before any round runs**. From here on the
authority on "is Codex disabled?" is `codex-policy`, not `process.env` — so a
later round cannot resurrect Codex by clearing the variable. `seal` resolves the
git dir itself (worktree-safe) and exits 0 even when it fails, because a failed
seal must degrade to the pre-v1.32.6 behaviour (env only) rather than stop the gate.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-policy.js" seal 1>&2

# env-contract-integrity M3 — seal the ROUND policy in the same breath, and for
# the same reason. This gate has TWO reviewer channels and both enforce the cap
# in a CHILD process: `codex-invoke.js` just before spawn (5.2z) and
# `plan-review/cli.js emit-workflow-args` just before the L2 panel launches
# (5.2c). Reading env there would make the milestone fall to the defect it
# removes — this PRD's own evidence is an instance of "the value never reached
# the process" — so the cap and the ledger key travel on disk instead.
#
# This must run BEFORE 5.2, not beside 5.2z: the panel fires first, and a seal
# written after it would leave the panel channel unenrolled and uncounted.
#
# `seal` exits 0 even on failure: a failed seal degrades to pre-M3 behaviour
# (no enforcement) rather than stopping the gate, and says so loudly.
ROUND_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision \
  --command mccp:plan --args "$ARGUMENTS")
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/review-rounds/cli.js" seal \
  --gate mccp-plan-codex --decision "$ROUND_SLUG" 1>&2
```

**Never unset, override, or re-export `MCCP_CODEX_DISABLED` anywhere in this
command.** It is a persistent operator policy, not a one-shot escape, and R1 does
not consume it.

### 5.0 — impeccable design gate (자동, /mccp:plan 진입 시 MANDATORY, v0.2.6 Milestone 1 · v1.3.0-m2 3-axis trigger)

Pre-flight detection — pre-commits to mode and feeds skill_available / design_signal:

```bash
DETECT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect.js" detect \
  --mode plan \
  --plan "<plan-path>" \
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
  # 1. Invoke the RESOLVED call form (see the call-form rule below) with the
  #    argument "critique <plan slug>", OR mock when
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

**An absent line means the skill did not resolve** — take the `SKILL_AVAIL=0` row above (record the fallback note and treat as skipped).
Never guess a name, and in particular never fall back to the bare name
`impeccable` as a hardcoded call: from v1.31.3 this repository ships no bare
copy, so a guessed bare call reaches `unknown_skill` and records a skip the
gate did not have to take.

If the resolved call form still returns `unknown_skill` / `not found` at any
iteration, fall back to the same `SKILL_AVAIL=0` row (treat as skipped).

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

### 5.2 — REVIEW GATE (mode-branched, v1.23.1 diverse-agent-review M1)

The approval for this gate may be issued by Codex (legacy) or by an L1+L2 review
panel. Resolve which, then take exactly one branch. **Do NOT** ask the user which
mode to use — the oracle decides from the environment.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
mkdir -p "$REVIEW_DIR"
# Purge the previous run's artifacts before anything reads them. These files are
# the IPC between fenced blocks, so a survivor from an earlier invocation is
# indistinguishable from one this run produced — a stale `codex-verdict` would be
# stamped into a fresh receipt, a stale `decision.json` would answer for a panel
# that never fired. Every one of them is rewritten below on the paths that own it;
# absence is what each consumer already fails closed on.
# NOT purged: `dispatch-log-<slug>.jsonl` (review-loop-bypass M1). It is the one
# artifact in this directory that is a LEDGER rather than IPC — its whole job is
# to survive across invocations so a re-fire cannot hide. Purging it would let R1
# erase R0's line and present two rounds as one. Its staleness problem is solved
# differently: entries are keyed by plan hash, so an old body's lines never answer
# for a new one.
rm -f "$REVIEW_DIR/codex-verdict" "$REVIEW_DIR/codex-class" "$REVIEW_DIR/decision.json" "$REVIEW_DIR/proof.json" \
      "$REVIEW_DIR/l1.json" "$REVIEW_DIR/l2.json" "$REVIEW_DIR/l3.json" \
      "$REVIEW_DIR/reservation.json" "$REVIEW_DIR/workflow-args.json" \
      "$REVIEW_DIR/backlog.json" "$REVIEW_DIR/started-at" \
      "$REVIEW_DIR/l3-run-nonce" "$REVIEW_DIR/l3-deadline" "$REVIEW_DIR/l3-pid" \
      "$REVIEW_DIR/l3-findings.json" "$REVIEW_DIR/plan-path"
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" mode > "$REVIEW_DIR/mode.json"
REVIEW_MODE=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).mode)}catch{process.stdout.write("codex")}' "$REVIEW_DIR/mode.json")
echo "[mccp:plan-review] mode=$REVIEW_MODE" 1>&2
# review-record-linkage M3 — record the plan path ONCE, here, as the single source
# every later call site reads (5.6b's `--plan` included). It is in the purge list
# above, so a previous run's value can never answer for this one.
#
# This is a consistency device, not a provenance one: the path still comes from the
# author's own transcription of `$ARGUMENTS` (R15). What it removes is the SECOND
# transcription — re-typing a literal at each call site lets one run seal two
# different plan identities, and the M3 anchor compares exactly those strings.
printf '%s' "<plan path>" > "$REVIEW_DIR/plan-path"
```

| `$REVIEW_MODE` | Branch |
|---|---|
| `codex` | **5.2z** below — the pre-M1 Codex path, unchanged. Skip 5.2a–5.2h entirely and stamp NO `review_*` fields. |
| `multi-agent` | 5.2a-0 (no-op — `hybrid_without_l3` is false outside hybrid) → 5.2a → 5.2b → 5.2c → 5.2d → 5.2e → 5.2g → 5.2g2 → 5.2h (L3 is not fired) |
| `hybrid` | **5.2a-0** → 5.2a → 5.2b → 5.2c → 5.2d → 5.2f → 5.2e → 5.2g → 5.2g2 → 5.2h — 5.2a-0 stops the run *before any agent is reserved* when `mode.json` `hybrid_without_l3` is true, so by the time 5.2f is reached `fires.l3` is true |

`5.2g2` is a no-op unless the single-pass toggle actually relaxed this run — see its
section for why the capture is a precondition of that relaxation.

`MCCP_PLAN_REVIEW` unset means `multi-agent`; an unreadable value falls back to
`codex` with a loud warn (DD7 — an unreadable mode must not silently change who
issues approval).

##### Two invariants that govern every sub-step below

**(i) No shell state crosses a block.** Each fenced block runs in a fresh shell,
and 5.2c interposes a `Workflow` tool call, so a variable set in one block is
gone by the next. Every block therefore re-derives `REVIEW_DIR` and reads what it
needs from the artifacts in it. This is the §3.9 rule ("게이트 조건은 shell-state
독립") applied to the approval itself: a gate whose verdict lives only in `$VAR`
does not fail loudly when the variable evaporates, it silently seals a receipt
with **no approval record at all**. `REVIEW_DIR` is `.claude/state/plan-review/`
under the repo root — repo-relative (so it can be cited as evidence verbatim) and
inside the worktree (unlike `$MCCP_TMP`, which `git rev-parse --git-dir` places
*outside* it in a linked worktree).

**(ii) The plan body is FROZEN from 5.2c until the receipt is written.**
`emit-workflow-args` binds `reviewed_plan_hash` to the plan the reviewers are
about to read (DD13), and `write.js` refuses to seal if the plan on disk no longer
hashes to it. Any edit in between — including 5.3's `## Codex Adversarial Review`
injection, which changes `plan_hash` (section addition is not normalized away) —
makes the write exit 12 with "plan changed after L2 reviewed it". So in panel
modes the review record goes to a **sibling artifact** (5.2h), never into the plan.
Recovery from a genuine mismatch is to rerun L2, never to reseal.

#### 5.2a-0 — hybrid without L3 is a dead end; stop before spending the panel

`cmdMode` already computes `hybrid_without_l3`, and until now nothing read it.
That combination — `MCCP_PLAN_REVIEW=hybrid` with `MCCP_PLAN_REVIEW_L3` unset or
`0` — has exactly one possible ending: 5.2f writes `invoked:false`, and 5.2e's
`!ran` branch turns it into `unavailable` / `multi-agent` and HALTs (DD2 row 9).
`MCCP_PLAN_REVIEW_L3` defaults to **off**, so an operator who sets only the mode
lands here every time.

This block is not a new policy. The outcome is already decided the moment the
environment is read; the only question is whether the operator learns it now or
after four agents and eight minutes of panel time. Bringing it forward costs
nothing and refunds nothing, because nothing has been reserved yet — 5.2a-0 runs
**before** 5.2b, which is where the budget is charged.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
# Absence and unreadability both read as "0" here, deliberately. This block only
# ever ADDS a halt, so a false 0 costs nothing but a panel that would have run
# anyway; a false 1 would stop a legitimate multi-agent run. The unreadable-
# mode.json case is diagnosed where it belongs — 5.2f Step 0 distinguishes it
# from "policy says no" with its own `-1` sentinel, and 5.6b HALTs on it too.
HYBRID_WITHOUT_L3=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(j.hybrid_without_l3?"1":"0")}catch{process.stdout.write("0")}' "$REVIEW_DIR/mode.json")
if [ "$HYBRID_WITHOUT_L3" = "1" ]; then
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
    --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2a-0 1>/dev/null || true
  echo "[MCCP-GATE-STOP] MCCP_PLAN_REVIEW=hybrid but MCCP_PLAN_REVIEW_L3 is off, so the cross-model layer cannot fire."
  echo "That combination can only end in verdict=unavailable — hybrid requires BOTH variables."
  echo "  · to actually run hybrid:  export MCCP_PLAN_REVIEW_L3=1"
  echo "  · to run the panel alone:  export MCCP_PLAN_REVIEW=multi-agent"
  echo "Stopping here rather than after the L2 panel: the outcome is already determined, and no agents have been reserved yet."
  exit 12
fi
```

#### 5.2a — L1 mechanical gatekeeper

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
mkdir -p "$REVIEW_DIR"
# Gate wall-clock start. An ARTIFACT, not a variable — 5.6 is five sections and
# several tool calls away, so a shell variable would be gone and the receipt
# would carry no wall-clock at all (the Acceptance criterion is that the ≤10-min
# target is MEASURED, and an absent measurement reads as a passing one).
date +%s%3N > "$REVIEW_DIR/started-at"
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" l1 --plan "<plan path>" \
  > "$REVIEW_DIR/l1.json"
L1_EXIT=$?
echo "[mccp:plan-review] L1 exit=$L1_EXIT" 1>&2
# This block already knows whether it is halting, so it records the stop itself
# rather than leaving the call to a later step to remember. exit 1 is deliberately
# NOT recorded here: that path continues to 5.2e and the stop belongs where it
# actually happens.
if [ "$L1_EXIT" = "12" ]; then
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
    --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2a 1>/dev/null || true
  echo "[MCCP-GATE-STOP] L1 could not evaluate the plan (exit 12) — this is an environment problem (plan unreadable, worktree race), not a plan defect."
  exit 12
fi
```

- exit **0** → continue to 5.2b.
- exit **1** → L1 found violations. Do NOT fire L2 (agents cost tokens and an
  LLM panel cannot overturn a mechanical fact). Jump straight to 5.2e, which
  composes `divergent` from the L1 artifact.
- exit **12** → L1 could not be evaluated (plan unreadable, worktree race). This
  is an environment problem: the block above has already recorded the stop, so
  print the stop block and end the response.

##### The recorder runs before every stop in 5.2 (M4 axis A)

Each HALT below is preceded by one line:

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:plan --args "$ARGUMENTS")
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
  --slug "$DECISION_SLUG" --plan "<plan path>" \
  --halt-stage "<5.2a-0|5.2a|5.2b|5.2c-emit|5.2c-pin|5.2d|5.2e|5.2e-proof|5.2f|5.2g|5.2g2>"
```

**That stage list is the complete set of HALTs in 5.2.** An earlier revision
listed six stages while the body emitted seven, and two stops had no recorder at
all — 5.2d and 5.2f, both *after* the panel fired, so exactly the long samples
this section claims to have stopped discarding. Leaving them out made the claim
wider than the wiring. When you add a stop to 5.2, add its stage here and call the
recorder from it.

**Every stop computes its own halt condition in shell, records from inside its own
block, and then exits.** Nothing downstream has to remember to do it, and no stage
depends on you following an instruction:

| Enforcement | Stages |
|---|---|
| Shell — the block records, then exits | 5.2a-0 · 5.2a · 5.2b · 5.2c-emit · 5.2c-pin · 5.2d · 5.2e · 5.2e-proof · 5.2f · 5.2g · 5.2g2 |

5.2e was the last holdout, and the argument for leaving it to prose turned out to
be circular. It read: 5.2e already routes through 5.2h, so recording inline would
write the record twice and 5.2h's stage-less call would erase `halt_stage`. That
is only true if the blocked run also *falls through* to 5.2h — and it does not,
because the branch exits. The fall-through was the defect, not a constraint. While
it stood, a divergent / budget-skipped / unavailable decision was written to disk
as `halt_stage: null`, which is a blocked run recorded as a pass-path record: the
one measurement UI10 asks for, corrupted at exactly the moment it matters.

**The recorder must never be the last statement on a failure branch.** It is
non-blocking by contract (`|| true`), so the branch would inherit exit 0 and a
failed check would read as a pass. Every branch here ends in an explicit `exit`,
and `plan-review-command-body.test.js` fails the build if a new one does not.

Substitute the stage that is halting; everything else is identical, and the same
call with no `--halt-stage` is what 5.2h runs on the pass path. It reads the
artifacts, writes `.claude/reviews/plan-review-<slug>.md`, and **always exits 0** —
so it can never turn a measurement failure into a gate failure. It also cannot
change a verdict: it runs after the decision is made and before the stop is
printed.

M1 recorded wall-clock only inside 5.6b's receipt write, which sits past every
one of these stops. A blocked run recorded nothing, and blocked runs are usually
the slow ones — so the instrument systematically discarded its longest samples
(40 receipts in the repository, zero with a review verdict). Recording at each
stop is what makes the measurement mean anything (UI10).

#### 5.2b — Reserve the agent budget (DD9)

Every agent launch is accounted for; L2 is no exception.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
REQUIRED=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).quorum.required))}catch{process.stdout.write("3")}' "$REVIEW_DIR/mode.json")
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" reserve --n 4 \
  > "$REVIEW_DIR/reservation.json"
RES_GRANTED=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).granted))}catch{process.stdout.write("0")}' "$REVIEW_DIR/reservation.json")
echo "[mccp:plan-review] reserved granted=$RES_GRANTED required=$REQUIRED" 1>&2
# The stop below is decided entirely from values this block already holds, so the
# recorder runs here — same shape as 5.2d/5.2f. Both readers fall back to a numeral
# ("0"/"3"), so the comparison cannot be reached with a non-numeric operand.
if [ "$RES_GRANTED" = "0" ] || [ "$RES_GRANTED" -lt "$REQUIRED" ]; then
  # This halt is BEFORE the launch, so zero reviewers ran and the reservation must
  # be given back. `--actual 0` is the module's own documented way to say "nothing
  # fired" (orchestration-runaway.js: inline/skipped/N-A → actualN = 0), not a
  # number we are inventing. Leaving it pending instead burns session headroom for
  # the whole lease window (10 min default), so a near-cap retry loop can make
  # /mccp:plan deny its own panel over agents that never existed.
  RES_ID=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).reservationId||"")}catch{process.stdout.write("")}' "$REVIEW_DIR/reservation.json")
  [ -n "$RES_ID" ] && node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" reconcile \
    --reservation "$RES_ID" --actual 0 1>/dev/null 2>&1 || true
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
    --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2b 1>/dev/null || true
  echo "[MCCP-GATE-STOP] L2 review panel could not be launched (granted $RES_GRANTED, quorum needs $REQUIRED)."
  echo "Recovery: start a new session · raise MCCP_ORCHESTRATION_MAX_AGENTS · lower MCCP_PLAN_REVIEW_QUORUM · or set MCCP_PLAN_REVIEW=codex."
  exit 12
fi
```

**HALT when `RES_GRANTED` is `0`, and equally when it is below `$REQUIRED`.**
Unlike the fan-out this is a gate, so a denied reservation degrades to nothing —
it stops. A grant below the quorum threshold is the same stop reached later and
more expensively: those reviewers would run, cost tokens, and then fail the quorum
on arithmetic. (`emit-workflow-args --granted` re-checks this at 5.2c and exits 12,
so the arithmetic is enforced in a tested oracle and not only here.) The block
above has already recorded this stop; print:

```
[MCCP-GATE-STOP] L2 review panel could not be launched (granted <N>, quorum needs <M>).
Recovery: start a new session · raise MCCP_ORCHESTRATION_MAX_AGENTS · lower MCCP_PLAN_REVIEW_QUORUM · or set MCCP_PLAN_REVIEW=codex.
```

**The reservation is returned on this path, not left pending.** An earlier
revision said the opposite — "do not reconcile it to a number you did not launch"
— which misread the API it was protecting. `--actual 0` is not a number we did not
launch; it is the module's documented value for *nothing fired*
(`orchestration-runaway.js`: `inline / skipped / N/A → actualN = 0`), and it is
the same correction 5.2d already makes for a budget-skipped panel. Leaving it
pending charges the session cap for reviewers that never existed until the lease
expires (10 min default), so a near-cap retry can make `/mccp:plan` deny its own
panel over phantom headroom.

The distinction that still holds is *unknown* vs *known-zero*. 5.2d leaves a
reservation pending when `l2.json` is absent, because the panel may have launched
and only the return was lost — guessing 0 there would under-count real agents,
the one direction a cap may never err in. Here there is no ambiguity: the halt is
before the Workflow call, so zero is observed, not assumed.

#### 5.2c — Fire the L2 refutation panel

`emit-workflow-args` computes `reviewed_plan_hash` here, **before** the reviewers
read the plan (DD13 — computing it later would read the post-edit file and erase
the very mismatch the binding exists to detect).

`--granted` is what makes the launch set the *reserved* set. `reserveWorkers`
clamps to the remaining session headroom, so reserving 4 and receiving 2 is normal;
firing 4 anyway would launch two agents the cap never recorded — the leak
`reserveWorkers` exists to close. The cap is applied inside the CLI so the
arithmetic is tested rather than improvised in shell.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
RES_GRANTED=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).granted))}catch{process.stdout.write("0")}' "$REVIEW_DIR/reservation.json")
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" emit-workflow-args \
  --plan "<plan path>" --prd "<prd path or omit>" \
  --granted "$RES_GRANTED" \
  --out "$REVIEW_DIR/workflow-args.json"
EMIT_EXIT=$?
# Any non-zero exit here is a stop (12 block, 2 misuse), and the exit code is only
# visible inside this block — so record here rather than downstream.
if [ "$EMIT_EXIT" -ne 0 ]; then
  # Pre-launch halt — same reasoning as 5.2b: give the reservation back with
  # `--actual 0` rather than leaving it pending for the lease window.
  RES_ID=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).reservationId||"")}catch{process.stdout.write("")}' "$REVIEW_DIR/reservation.json")
  [ -n "$RES_ID" ] && node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" reconcile \
    --reservation "$RES_ID" --actual 0 1>/dev/null 2>&1 || true
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
    --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2c-emit 1>/dev/null || true
  echo "[MCCP-GATE-STOP] emit-workflow-args failed (exit $EMIT_EXIT) — this decision has spent its review rounds, OR the granted fleet cannot satisfy the quorum, OR the plan could not be hashed. The CLI printed which one on stderr just above; do not guess from this line. Reservation returned (--actual 0); nothing was launched."
  exit 12
fi
```

exit **12** → HALT (the granted fleet cannot satisfy the quorum, or the plan could
not be hashed); the block above has already recorded it and returned the
reservation with `--actual 0`, because the halt is before the launch and zero is
therefore observed rather than assumed.

The payload also carries `minRemaining` — the tokens the turn must still have for
the panel to be worth firing, computed as `MCCP_PLAN_REVIEW_BUDGET` (default
150000) × the fleet size **after** the `--granted` cap. Until M4 the key was
absent from the payload, so `workflows/plan-review.js` read `undefined`,
substituted 0, and its budget branch could never fire (UI12).

**Pin the reservation with a debt marker before the panel fires.** The `Workflow`
call below IS the launch point — 5.2d reconciles only *after* it returns, and
nothing reaches 5.2d if the controller dies mid-flight (timeout, crash, abandoned
turn). The reservation would then sit pending and the lease would prune it as
"never launched" while four reviewers really ran: an under-count, the one
direction a cap may never err in. This is the same window the fan-out closes at
Phase 2.5.2, and it applies here for the same reason — `readCounter` honours debt
markers and nothing else, so the marker must exist *before* the call, not be
written by a post-call handler that may never execute.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
PIN_ID=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).reservationId||"")}catch{process.stdout.write("")}' "$REVIEW_DIR/reservation.json")
PIN_N=$(node -e 'try{process.stdout.write(String((JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).fleet||[]).length))}catch{process.stdout.write("0")}' "$REVIEW_DIR/workflow-args.json")
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:plan --args "$ARGUMENTS")
PIN_HALT() {
  # Both callers halt BEFORE the Workflow call, so nothing launched and the
  # reservation goes back with `--actual 0` — the module's documented value for
  # "nothing fired", not a guess. Guarded on PIN_ID because the first caller fires
  # precisely when the reservation artifact was unreadable, and there is then no
  # id to reconcile against.
  [ -n "$PIN_ID" ] && node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" reconcile \
    --reservation "$PIN_ID" --actual 0 1>/dev/null 2>&1 || true
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2c-pin 1>/dev/null || true
}
if [ -z "$PIN_ID" ] || [ "$PIN_N" = "0" ]; then
  PIN_HALT
  echo "[MCCP-GATE-STOP] reservation/fleet artifact unreadable — refusing to launch a panel the agent cap cannot record."; exit 1
fi
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" mark-debt \
  --reservation "$PIN_ID" --n "$PIN_N" 1>/dev/null 2>&1 \
  || { PIN_HALT; echo "[MCCP-GATE-STOP] debt marker write failed — an unrecordable launch is not permitted."; exit 1; }
echo "[mccp:plan-review] reservation $PIN_ID pinned (debt marker, n=$PIN_N) before the Workflow call." 1>&2

# ── L2 dispatch log (review-loop-bypass M1 — the UI5 observation surface) ──────
# One line per panel dispatch, appended at the launch point. `halt_stage` alone
# cannot see a re-fire: it holds only the LAST run's state and the review record
# is overwritten every run, so two dispatches that both proceed are
# indistinguishable from one. This log is what makes that falsifiable.
#
# **Purely append-only — it is deliberately NOT in 5.2's purge list.** Purging on
# entry would let a re-fire erase its own trace: R0 halts, R1 runs, purge drops
# R0's line, and the surviving single `round_index:0` entry plus a null
# halt_stage reads as a clean single round. That turns the measurement into
# fail-open, which is what it exists to prevent.
#
# `round_index` counts existing entries **with the same plan hash**, not the log
# length. Counting the whole log would give a fresh plan body's FIRST dispatch
# round_index:1 as soon as one entry from any other version survives — failing a
# perfectly normal attempt. Keying by hash also gives the two cases for free: a
# re-fire against the same body accumulates in one group (and the assertion must
# fail), while a new body after absorption starts a new group at 0.
#
# **`hash-plan`, NOT `hash-markdown`.** The two are different functions and the
# difference is invisible until it bites: for `.claude/plans/*.plan.md` the plan
# axis binds to the STRUCTURAL hash (`planAwareMarkdownHash`), which additionally
# normalizes `[x]`→`[ ]`, `PR #N`, and table status tokens. The Measurement block
# this log is compared against carries that structural hash (record.js ← the L2
# emit at plan-review/cli.js). Writing the raw hash here makes the two agree only
# while every normalization happens to be a no-op — and the first ticked
# Acceptance checkbox between two dispatches then produces the exact fail-OPEN
# this log exists to prevent: R0's entry still matches the structural hash, R1's
# does not, and `assert-single-round` reports two rounds as one.
DISPATCH_LOG="$REVIEW_DIR/dispatch-log-$DECISION_SLUG.jsonl"
DISPATCH_HASH=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" hash-plan "<plan path>") \
  || { PIN_HALT; echo "[MCCP-GATE-STOP] could not hash the plan for the dispatch log — an unmeasurable launch is not permitted."; exit 1; }
# An empty hash is not a hash. Command substitution swallows a non-zero exit if
# the guard above is ever restructured, and `reviewed_plan_hash: ""` would sit in
# the ledger looking like a record while matching nothing.
if [ -z "$DISPATCH_HASH" ]; then
  PIN_HALT
  echo "[MCCP-GATE-STOP] plan hash came back empty — refusing to launch a panel whose dispatch cannot be keyed."; exit 1
fi
node -e '
  const fs = require("fs");
  const logPath = process.argv[1], decision = process.argv[2], hash = process.argv[3];
  let n = 0;
  try {
    fs.readFileSync(logPath, "utf8").split(/\r?\n/).forEach(function (l) {
      if (!l.trim()) return;
      try { if (JSON.parse(l).reviewed_plan_hash === hash) n += 1; } catch (_) {}
    });
  } catch (_) { /* first dispatch — no log yet */ }
  fs.appendFileSync(logPath, JSON.stringify({
    decision: decision,
    round_index: n,
    at: new Date().toISOString(),
    reviewed_plan_hash: hash,
  }) + "\n");
' "$DISPATCH_LOG" "$DECISION_SLUG" "$DISPATCH_HASH" \
  || { PIN_HALT; echo "[MCCP-GATE-STOP] dispatch-log append failed — the panel would fire with no trace, which is the one thing this ledger exists to make impossible."; exit 1; }
echo "[mccp:plan-review] L2 dispatch logged for $DISPATCH_HASH → $DISPATCH_LOG" 1>&2
```

**Pin failure means do not launch.** The fan-out answers the same failure by
degrading to inline grounding, because it only enriches GROUND. This is a gate
and has no inline equivalent — an approval issued by agents the cap never
recorded is worse than no approval, so it stops, exactly as 5.2b stops on a
denied reservation. The pin is permanent by design (time-based decay was
rejected: a marker surviving a controller death is *proof* those agents ran, so
aging it out would under-count). A normal 5.2d reconcile commits and clears it.

Then invoke `Workflow` with `scriptPath: plugins/mccp/scripts/workflows/plan-review.js`
and `args` set to the **parsed contents** of `workflow-args.json` — a real JSON
object, NOT the file's text and NOT a JSON-encoded string. Passing a string is a
silent failure: every field reads as `undefined`, so `fleetKeys` is missing, the
workflow degrades to one reviewer, and `reviewedPlanHash` comes back `null`. It
fails closed (one reviewer cannot satisfy the quorum → `unavailable` → HALT), so
nothing unsafe ships, but it burns an agent and the reason is invisible unless you
notice `coverage: 0` in the return. **Write the returned object verbatim** to
`$REVIEW_DIR/l2.json`.

If the run fails with `agent type 'mccp:review-architect' not found`, the installed
plugin cache predates this milestone: the four `review-*` agents live in
`plugins/mccp/agents/` but the registry is loaded from
`~/.claude/plugins/cache/mccp/mccp/<version>/`. Run `claude plugin update` and start
a **new session** — the agent registry is built at session start, so copying files
into the cache mid-session does not register them (§3.7).

From this point the plan file is frozen (invariant ii). Do not edit it again until
the receipt is written.

**Failure handling is the opposite of the fan-out's.** The fan-out degrades to
inline grounding because it only enriches GROUND; this is a gate, so a Workflow
that throws, is unavailable in this install, or returns something unreadable must
NOT be papered over. Write whatever you got (or nothing), and let 5.2e's
`--l2-file` handling turn the absence into exit 12. Both "L2 was silently broken"
and "L2 found defects" converge on *do not proceed*, and neither can produce a
`converged` receipt.

#### 5.2d — Commit the reservation

`--actual` is the number of reviewers that were actually launched, which is
`fleet.length` in the emitted args — not the granted number and not 4. Both are
read from artifacts because `$RES_ID` from 5.2b no longer exists in this shell.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
RES_ID=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).reservationId||"")}catch{process.stdout.write("")}' "$REVIEW_DIR/reservation.json")
ACTUAL_N=$(node -e 'try{process.stdout.write(String((JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).fleet||[]).length))}catch{process.stdout.write("")}' "$REVIEW_DIR/workflow-args.json")
# This stop is reached only AFTER the panel has run, so it is one of the slow
# samples the recorder exists to keep. Record before halting.
if [ -z "$RES_ID" ] || [ -z "$ACTUAL_N" ]; then
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
    --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2d 1>/dev/null || true
  echo "[MCCP-GATE-STOP] reservation or fleet artifact unreadable — cannot reconcile the agent cap honestly."; exit 1
fi
# Only reconcile when the panel actually returned. 5.2c permits a Workflow that
# throws or is unavailable, and on that path zero reviewers may have launched —
# committing the PLANNED fleet size there records phantom launches permanently
# (committed entries never expire). Guessing 0 is equally wrong in the other
# direction: the reviewers may have launched and only the return was lost, and a
# cap may never under-count. So when l2.json is absent, do not answer at all —
# leave the reservation pending and PINNED by 5.2c's debt marker, exactly as the
# fan-out does at Phase 2.5.3. "Unknown" stays unknown and stays conservative.
#
# A budget SKIP is a third state, and it is the one M4 made reachable. The
# workflow returns `{skipped:true, results:[]}` without spawning a single agent,
# and that return IS l2.json — so the `-s` test above passes and, before this
# branch existed, the block reconciled the full planned fleet. That commits
# phantom launches (committed entries never expire) and clears the debt marker as
# if the workers had run, permanently burning session cap headroom for work that
# never happened. Axis B turned a dead branch live; this is the accounting that
# had to follow it.
SKIPPED=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).skipped===true?"1":"0")}catch{process.stdout.write("?")}' "$REVIEW_DIR/l2.json")
if [ ! -s "$REVIEW_DIR/l2.json" ] || [ "$SKIPPED" = "?" ]; then
  echo "[mccp:plan-review] l2.json absent or unreadable — NOT reconciling. Reservation $RES_ID stays pending and pinned by the debt marker; a later reconcile commits and clears it." 1>&2
else
if [ "$SKIPPED" = "1" ]; then
  ACTUAL_N=0
  echo "[mccp:plan-review] panel skipped (no agent spawned) — reconciling --actual 0 so the cap is not charged for launches that never happened." 1>&2
fi
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" reconcile \
  --reservation "$RES_ID" --actual "$ACTUAL_N"
RECONCILE_EXIT=$?
if [ "$RECONCILE_EXIT" -ne 0 ]; then
  echo "[mccp:plan-review] WARNING: reconcile exited $RECONCILE_EXIT — reservation $RES_ID stays pending. It is PINNED by the debt marker written before the Workflow call, so the lease cannot prune these $ACTUAL_N real launches; the cap stays conservative (over-counted) until a later reconcile commits and clears it." 1>&2
fi
fi
```

Unlike the fan-out, this commit is mandatory — the panel either launched the
emitted fleet or the run HALTed at 5.2b/5.2c, so there is no ambiguity to leave
pending. If the artifacts cannot be read, HALT rather than guessing a number: an
invented `--actual` is worse than a pending reservation, which the lease reclaims.

A non-zero reconcile does **not** HALT: the reviewers have already launched, so
stopping here would neither un-spawn them nor improve the count. It warns and
proceeds, and the pin from 5.2c is what makes that safe — without it this exact
path is how a real launch silently leaves the counter. Over-counting until a
later reconcile is the correct direction to err.

#### 5.2f — L3 Codex layer (hybrid only)

**Step 0 — is L3 supposed to fire at all?** `MCCP_PLAN_REVIEW_L3=0` turns L3 off
without touching the mode, so the mode table alone does not decide this. The CLI
already computed it; read the answer rather than re-deriving it from the env.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
# `-1` separates "policy says no" from "cannot tell". Recording an unreadable
# mode.json as "disabled by policy" states a cause that was never established.
FIRES_L3=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(j.fires&&j.fires.l3?"1":"0")}catch{process.stdout.write("-1")}' "$REVIEW_DIR/mode.json")
if [ "$FIRES_L3" = "-1" ]; then
  # Post-panel stop (hybrid reaches 5.2f after 5.2c/5.2d), so record before halting.
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
    --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2f 1>/dev/null || true
  echo "[MCCP-GATE-STOP] $REVIEW_DIR/mode.json unreadable — cannot tell whether L3 should fire, and guessing either way falsifies the L3 record. Re-run Phase 5.2."
  exit 12
fi
if [ "$FIRES_L3" != "1" ]; then
  printf '{"invoked":false,"reason":"MCCP_PLAN_REVIEW_L3=0 — L3 disabled by policy"}
' > "$REVIEW_DIR/l3.json"
  echo "[mccp:plan-review] L3 disabled (fires.l3=false) — skipping the Codex wrapper." 1>&2
fi
```

When `FIRES_L3` is `0`, **skip the rest of 5.2f entirely** and go to 5.2e. The
artifact above is the honest record, and 5.2e turns it into `unavailable` with
source `multi-agent` — requesting hybrid and then disabling its cross-model layer
is not hybrid, and the gate says so rather than stamping a corroboration that
never happened. Unreadable `mode.json` reads as `0`: an unknown policy must not
silently spend a Codex call.

**Step 1 — launch the dedicated L3 call.** L3 has its own subcommand,
`plan-review/cli.js l3`. Do **not** run 5.2z's block: that block launches
`plan-codex-runner.js`, whose job is to write the mccp-plan-codex receipt, and on
this path 5.6b writes that receipt. Two writers for one receipt with no ordering
between them was the defect this milestone removes, and it is removed by
SUBTRACTION — hybrid never starts the runner, so there is no order to get wrong
(DD1). `plan-codex-runner.js` must not appear anywhere in 5.2f;
`plan-review-command-body.test.js` fails the build if it does.

The subcommand writes the same two bridge artifacts 5.2z writes
(`codex-verdict`, `codex-class`) under the same names, which is what DD5 kept: the
FILENAMES stay a shared contract, and `mode=codex` — the path that actually reads
them — is left entirely outside this milestone's blast radius.

**On the hybrid path 5.6b does NOT read those files.** DD5's original wording said
5.6b was unchanged; the L3-Codex F1 absorption changed it, and this paragraph is
the corrected statement. 5.6b now takes the hybrid verdict out of the
nonce-verified `l3.json` (see its comment there for why), so on this path the two
bridge files have no reader at all — they exist for the filename contract above
and as a plain-text trace. Do not "simplify" 5.6b back to the bridge read;
`plan-review-command-body.test.js` M3(h) pins both branches.

It writes `l3.json` **last**, which is what makes polling for that one file
sufficient: its presence means the whole artifact set landed, so the poll's
success condition and the completeness condition are one fact. It writes no
receipt, takes no lock, and cannot block the gate — `decide` remains the only
place that stops this gate (DD2).

Codex can block for 900s while the Bash tool caps at 600s, so the call is
**detached** and the outcome is collected by polling, exactly as 5.2z does for the
runner.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
MCCP_TMP="$(git rev-parse --git-path mccp/tmp)"   # worktree-safe (§3.8)
mkdir -p "$REVIEW_DIR" "$MCCP_TMP"

# The focus is written through a SINGLE-QUOTED heredoc and never inlined into the
# command line. Everywhere else in this file the focus text is a shell literal you
# type into the markdown — so a backtick, a `$(`, or a stray quote inside a phrase
# you lifted out of the plan is shell SOURCE and gets expanded or breaks the
# parse. A quoted heredoc performs no expansion on its body at all, so whatever
# you write between the markers is inert. Passing it as "$L3_FOCUS" afterwards is
# then safe for a second, independent reason: a parameter expansion's VALUE is
# never rescanned for command substitution.
cat > "$MCCP_TMP/l3-focus.txt" <<'L3FOCUS'
challenge the following plan decisions: <list 1-3 key decisions from the plan>
L3FOCUS
L3_FOCUS=$(cat "$MCCP_TMP/l3-focus.txt")

# Same design-scope wire-up 5.2z uses: narrow Codex to security/correctness/perf
# when impeccable owns the design axis.
IMPECCABLE_FLAG=$(node -e "
const honored = require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/env-contract/value')
  .parseBool(process.env, 'MCCP_CODEX_DESIGN_SCOPE_HONOR');
const detect = require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect');
process.stdout.write(honored && detect.probeSkillAvailable({}) ? '--impeccable-available' : '');
" || echo "")

# The nonce goes INSIDE the record, not into a path (DD6). 5.2z can put its nonce
# in filenames because it owns those filenames; l3.json's name is fixed — 5.6b and
# `decide` both read it by that name — so the discriminator has to travel in the
# body. The poll below accepts a record only when this value comes back in it.
#
# WHAT THE NONCE DOES AND DOES NOT COVER (L3-Codex R1 F2, high — rejected with
# evidence, recorded in the backlog). It separates a STALE record — one left by an
# earlier run that has already finished — from this run's. It does NOT make two
# OVERLAPPING /mccp:plan runs in one worktree safe: this file has a fixed name, so
# a second launch overwrites it and the first run's poll would then expect the
# second run's nonce. That is not an L3 defect. REVIEW_DIR is a singleton for
# l1.json, l2.json, decision.json, proof.json, reservation.json and mode.json
# alike — see the purge list at the top of Phase 5.2 — so two concurrent runs are
# already incoherent well before L3 exists. Do not run two /mccp:plan gates
# against one worktree; use a second worktree (§3.8).
#
# It is persisted because the poll is a LATER fenced block and shell state does
# not cross a fence (invariant i). Same for the pid and the deadline: a poll that
# re-derived its own deadline would restart the clock every time the Bash tool
# cut it off, and could never time out.
RUN_NONCE=$(node -e 'process.stdout.write(require("crypto").randomUUID())')
printf '%s' "$RUN_NONCE" > "$REVIEW_DIR/l3-run-nonce"
node -e 'process.stdout.write(String(Math.floor(Date.now()/1000)+1000))' > "$REVIEW_DIR/l3-deadline"

nohup node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" l3 \
  --review-dir "$REVIEW_DIR" \
  --plan "<plan path>" \
  --focus "$L3_FOCUS" \
  --run-nonce "$RUN_NONCE" \
  $IMPECCABLE_FLAG \
  > "$MCCP_TMP/l3-call.out" 2> "$MCCP_TMP/l3-call.err" &
printf '%s' "$!" > "$REVIEW_DIR/l3-pid"
echo "[mccp:plan-review] L3 launched detached (nonce $RUN_NONCE, deadline +1000s)" 1>&2
```

**Step 2 — poll for the record.** A separate block, because Step 1 must return
immediately. Everything it needs is on disk; nothing is read from a variable.

Re-run this block if it prints `still-running` — the deadline lives in an artifact,
so re-entry continues the same clock rather than restarting it. The per-invocation
cap is 540s, under the Bash tool's 600s ceiling, so the block always returns a
state instead of being killed mid-answer.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
MCCP_TMP="$(git rev-parse --git-path mccp/tmp)"
RUN_NONCE=$(cat "$REVIEW_DIR/l3-run-nonce" 2>/dev/null || printf '')
DEADLINE=$(cat "$REVIEW_DIR/l3-deadline" 2>/dev/null || printf '0')
L3_PID=$(cat "$REVIEW_DIR/l3-pid" 2>/dev/null || printf '')
BLOCK_CAP=$(( $(date +%s) + 540 ))
L3_STATE=""

if [ -z "$RUN_NONCE" ]; then
  L3_STATE="not-launched"
fi
while [ -z "$L3_STATE" ]; do
  if [ -f "$REVIEW_DIR/l3.json" ]; then
    # Accept ONLY our own record. A survivor from another run answers about a
    # different plan body and a different Codex call; treating it as ours is how a
    # stale `converged` gets sealed into a fresh receipt.
    GOT_NONCE=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).run_nonce||""))}catch{process.stdout.write("")}' "$REVIEW_DIR/l3.json")
    if [ "$GOT_NONCE" = "$RUN_NONCE" ]; then L3_STATE="succeeded"; else L3_STATE="nonce-mismatch"; fi
  elif [ -n "$L3_PID" ] && ! kill -0 "$L3_PID" 2>/dev/null; then
    # RE-TEST BEFORE CONCLUDING. The child renames l3.json and THEN exits, so a
    # probe that lands between those two events sees no file and no process and
    # would report a completed run as a dead one. The window is microseconds, but
    # it sits exactly at the moment the run ends, and the cost of losing the race
    # is discarding a finished 900s Codex call and being told to re-run Phase 5.2.
    if [ -f "$REVIEW_DIR/l3.json" ]; then continue; fi
    # The process is gone and wrote nothing. `l3` writes a record on every path it
    # returns from — including every Codex failure — so this is not "Codex said
    # nothing", it is "the call did not survive to say anything".
    L3_STATE="died-without-record"
  elif [ "$(date +%s)" -ge "$DEADLINE" ]; then
    L3_STATE="timeout"
  elif [ "$(date +%s)" -ge "$BLOCK_CAP" ]; then
    L3_STATE="still-running"
  else
    sleep 10
  fi
done
echo "[mccp:plan-review] L3 poll state=$L3_STATE" 1>&2

if [ "$L3_STATE" = "still-running" ]; then
  echo "[mccp:plan-review] L3 has not finished within this block's 540s window. Re-run THIS block; the deadline artifact keeps the overall 1000s bound." 1>&2
  exit 0
fi
if [ "$L3_STATE" != "succeeded" ]; then
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
    --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2f 1>/dev/null || true
  echo "[MCCP-GATE-STOP] L3 did not produce a usable record (state=$L3_STATE)."
  echo "  not-launched        Step 1 never ran — \$REVIEW_DIR/l3-run-nonce is absent."
  echo "  died-without-record the l3 call exited without writing; see $MCCP_TMP/l3-call.err."
  echo "  nonce-mismatch      l3.json belongs to another run; wait for it, then re-run /mccp:plan."
  echo "  timeout             1000s elapsed with no record. Do NOT assume success."
  echo "Recovery is to re-run Phase 5.2, or MCCP_PLAN_REVIEW=multi-agent to drop the L3 layer."
  exit 12
fi
```

`succeeded` is the only path into 5.2e. There is no Step 3: `l3.json` is written by
the subcommand, in full, from the record oracle — there is nothing left for the
shell to assemble. That is the point of moving production into Node. The old Step 2
built the JSON with `printf` from a shell variable, and an empty variable there
emits `"verdict":""` — a value `REVIEW_VERDICT_VALUES` forbids and `decide.js:355`
had to defend against downstream. `buildL3Record` cannot construct it.

The verdict, when present, is one of `converged|divergent|critical|unavailable|skipped`.
When Codex did not speak — disabled, timed out, unauthenticated, or answered with
something unreadable — the record is `{"invoked":false,"reason":"<why>"}` with **no
verdict key at all** (DD4). "Requested hybrid" is not "hybrid happened", and 5.2e
fails closed on the difference.

**L3's findings are in `$REVIEW_DIR/l3-findings.json`.** Read them there when the
verdict is not `converged`; the plan body stays frozen, so nothing is injected into
it. This artifact exists because the first live hybrid run returned `divergent` and
there was no way to learn *to what*: `l3.json` carries a verdict and a reason, and
`record.js#readL3` reads exactly those two, so 5.2h prints one word. Codex's findings
were parsed, collapsed to that word, and dropped. 5.2h still prints only the verdict
— surfacing the findings inside the review record is a separate change to
`record.js`, tracked in the backlog — so this file is where they live today.

#### 5.2e — Compose the verdict

The evidence path is written as a **literal repo-relative string**, not computed
with `path.relative`. Computing it was wrong twice over: in a linked worktree
`git rev-parse --git-dir` points outside the working tree, so the result began
with `../..`, and on Windows the separators stayed backslashes — both rejected by
`isRepoRelativeEvidencePath`, which made every converged proof structurally
invalid and blocked 5.2g unconditionally. `REVIEW_DIR` is under the repo root
precisely so the literal is correct on every platform.

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
REVIEW_MODE=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).mode)}catch{process.stdout.write("codex")}' "$REVIEW_DIR/mode.json")
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" decide \
  --mode "$REVIEW_MODE" \
  --plan "<plan path>" \
  --l1-file "$REVIEW_DIR/l1.json" \
  --l2-file "$REVIEW_DIR/l2.json" \
  $( [ -f "$REVIEW_DIR/l3.json" ] && echo --l3-file "$REVIEW_DIR/l3.json" ) \
  --evidence ".claude/state/plan-review/l2.json" \
  > "$REVIEW_DIR/decision.json"
DECIDE_EXIT=$?

# Clear any proof from an earlier round FIRST, then write this round's. Deleting
# after the fact is the wrong order: if the unlink is the step that fails, a
# stale converged proof survives and 5.6's `-f` test happily seals it against a
# decision it does not belong to.
rm -f "$REVIEW_DIR/proof.json"
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(j.review_proof)fs.writeFileSync(process.argv[2],JSON.stringify(j.review_proof,null,2));' \
  "$REVIEW_DIR/decision.json" "$REVIEW_DIR/proof.json"
PROOF_EXIT=$?
if [ "$PROOF_EXIT" -ne 0 ]; then
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2e-proof 1>/dev/null || true
  echo "[MCCP-GATE-STOP] proof extraction failed (exit $PROOF_EXIT) — the panel's decision cannot be recorded, so no receipt may claim it."; exit 12
fi
node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.error("[mccp:plan-review] verdict="+j.review_verdict+" source="+j.review_source+" forwardCodex="+(j.forwardCodexVerdict?1:0));console.error("[mccp:plan-review] reason: "+j.reason)}catch(e){console.error("[mccp:plan-review] decision unreadable")}' \
  "$REVIEW_DIR/decision.json"
# A blocked decision stops HERE, with its stage recorded, and never reaches the
# 5.2h pass-path call. `DECIDE_EXIT` was captured above and then never branched
# on: the instruction to "run 5.2h with --halt-stage 5.2e" lived in prose while
# the executable 5.2h snippet passes no stage at all, so a divergent /
# budget-skipped / unavailable run was recorded as `halt_stage: null` — a blocked
# run written to disk as a pass-path record, corrupting the exact blocked-path
# measurement this milestone exists to produce.
#
# Recording inline is safe precisely BECAUSE this exits: the double-write that
# once justified leaving 5.2e to prose only happens if the run also falls through
# to 5.2h, and it cannot now.
if [ "$DECIDE_EXIT" -ne 0 ]; then
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2e 1>/dev/null || true
  echo "[MCCP-GATE-STOP] plan review did not approve (decide exit $DECIDE_EXIT). The reason printed above is the decision's own; do not substitute a generic recovery list for it."
  exit 12
fi
```

The unconditional `rm -f` before the write is what keeps a superseded proof from
outliving its run. Extraction failure is a stop, not a shrug: the alternative is
a receipt that records no approval while the gate prints success, which is the
same silent-omission class this milestone already had to fix once at 5.6.

`DECIDE_EXIT` 12 → the block above has already written the review record with
`--halt-stage 5.2e` and exited. Print the `reason` field from the decision JSON
and end the response without writing a receipt. Do not also run 5.2h: the record
exists, and 5.2h's call passes no stage, so a second write would replace
`halt_stage: "5.2e"` with `null`.

**Print `reason` verbatim and do not substitute a generic recovery list for it.**
`decide` names the recovery that fits the specific stop — a budget skip reports
the observed `remaining`/`minRemaining` and says to raise the turn's token target,
lower `MCCP_PLAN_REVIEW_BUDGET`, or fall back to `MCCP_PLAN_REVIEW=codex`. Only
when `reason` names no recovery of its own, add the general three
(`MCCP_PLAN_REVIEW=codex` · a new session · raise the agent cap). Offering the
agent cap to someone who ran out of tokens sends them to fix the wrong thing.

**The record is what the author actually needs.** A blocked decision is the only
case where they need the findings, and the record is the one artifact that carries
them — `review_proof.perspectives` keeps `{perspective, verdict}` pairs, which
prove a quorum and explain nothing. That is why the branch records *before* it
exits rather than leaving the write to a step the run has already left: a gate
that stops without telling the author what was found is a gate they will route
around. 5.2g never runs on this path (there is no converged proof to verify).

**Read `forwardCodexVerdict` from `decision.json` and nothing else** to decide
whether `--codex-verdict` is forwarded at 5.6. Do NOT re-derive it in shell from
the mode and the L3 result — that AND is precisely the shape that produced the
v1.22.3 M3 round-4 defect. 5.6 reads it from the artifact for the same reason.

**Single-pass relaxation (`MCCP_REVIEW_SINGLE_PASS`, review-loop-bypass M1).**
When the toggle carries one of its three reasons and the panel dissented on the
quorum, `decide` exits **0** with `block:false`, prints a `SINGLE-PASS:` line on
stderr, and puts `single_pass_reason` in `decision.json`. Continue to 5.2g/5.2h/5.6b
as on any passing path — but understand precisely what has and has not happened:

- The verdict is **still `divergent`** and is sealed that way. Nothing is
  laundered into `converged`, so the dashboard, `evidence-audit`, and the ship
  gate all keep reading it as non-approving.
- The findings are **not discarded**. They stay in `l2.json` and in
  `.claude/reviews/plan-review-<slug>.md`, and since M2 they are also appended to
  `.claude/plans/codex-findings-backlog.md` by 5.2g2 — mechanically, and as a
  *precondition* of the relaxation rather than a side effect of it. What the toggle
  removes is the repeat round, not the review.
- Only this one branch relaxes. An L1 divergence, an unreadable or skipped L2, a
  zero-response panel, and a DD13 hash mismatch all still HALT with the toggle on
  — each of them returned above this point, before the toggle was ever consulted.

`decide` exits 12 exactly as before whenever the toggle is unset, misspelled (a
typo fails closed to OFF with a loud warn), or the stop came from any of those
earlier branches.

#### 5.2g — Verify the proof's evidence exists

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
# An absent proof is a SKIP, not a failure — a non-converged decision produces
# none. The earlier `[ -f … ] && node …` one-liner could not say which had
# happened: the test failing and the verification failing both left a non-zero
# status, so "nothing to check" was indistinguishable from "the check failed".
VERIFY_EXIT=0
if [ -f "$REVIEW_DIR/proof.json" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" verify-proof \
    --proof-file "$REVIEW_DIR/proof.json"
  VERIFY_EXIT=$?
fi
if [ "$VERIFY_EXIT" -ne 0 ]; then
  DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
    --command mccp:plan --args "$ARGUMENTS")
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
    --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2g 1>/dev/null || true
  echo "[MCCP-GATE-STOP] proof evidence verification failed (exit $VERIFY_EXIT) — the proof names evidence that is missing or not repo-relative, so no receipt may claim it."
  exit 12
fi
```

The stop **exits the block**; it does not merely record and fall through. The
recorder is deliberately non-blocking (`|| true`), so if it were the last command
in the branch the block would exit 0 and a failed verification would read as a
pass — 5.2h and 5.6b would then run against the same `proof.json`, and the receipt
writer checks the proof's hash, not whether the evidence it names exists. Every
halt in 5.2 ends in an explicit `exit` for this reason; a recorder must never be
the last statement on a failure path.

#### 5.2g2 — Capture the relaxed findings into the backlog (review-loop-bypass M2)

M1's toggle relaxes exactly one branch, and the moment it returns `block:false` the
`quorum.blockingFindings` array goes nowhere. It survives in `l2.json` and in the
review record, but both are overwritten on the next run and both leave with the
worktree. This step moves that set into the append-only ledger
`.claude/plans/codex-findings-backlog.md`, where `derive/sources/backlog.js` already
reads it and the dashboard already surfaces it as a carried-over finding.

**The capture is a precondition of the relaxation, not a side effect of it.** If the
findings cannot be recorded, the run does not proceed — a silent failure here leaves
exactly the debt M1 created (the objection disappears while the receipt records a
pass), and closing that is why M2 exists. This is the same line DD2 drew: `divergent`
("we looked and found a defect") may be relaxed, `unavailable` ("we could not
certify") may not, and "we could not write the defect down" is the second kind.

**The way out is turning the toggle off, not a new env.** With the toggle off the run
returns to the ordinary non-convergence HALT and the author absorbs the findings from
the review record — loss stays at zero. The worst failure mode is "the toggle does not
help here", never "the findings vanished".

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:plan --args "$ARGUMENTS")

# Gate on the APPLIED relaxation, never on the env. `single_pass_reason` is
# present-only and only `mkSinglePass` writes it, so its presence in decision.json
# means the bypass actually happened — the env only says the toggle was SET.
SINGLE_PASS_REASON=$(node -e 'try{const d=require(process.argv[1]);const r=d.single_pass_reason;process.stdout.write(typeof r==="string"?r:"")}catch(e){process.stdout.write("")}' \
  "$REVIEW_DIR/decision.json")

if [ -n "$SINGLE_PASS_REASON" ]; then
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" backlog-append \
    --review-dir "$REVIEW_DIR" --plan "<plan path>" --slug "$DECISION_SLUG"
  APPEND_EXIT=$?
  if [ "$APPEND_EXIT" -ne 0 ]; then
    node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
      --slug "$DECISION_SLUG" --plan "<plan path>" --halt-stage 5.2g2 1>/dev/null || true
    echo "[MCCP-GATE-STOP] backlog capture failed (exit $APPEND_EXIT) — the single-pass relaxation may not proceed while the findings it drops cannot be recorded."
    echo "  Recovery: unset MCCP_REVIEW_SINGLE_PASS and re-run the gate. The panel's objection then HALTs as it always did, and the findings stay in .claude/reviews/plan-review-$DECISION_SLUG.md for you to absorb."
    exit 12
  fi
fi
```

A run with the toggle off never enters the branch, so the default path is byte-identical
to M1 — no row is appended and `backlog_appended` is recorded as `null`, not `0`.

The stop **exits the block** for the same reason 5.2g's does: the recorder is
deliberately non-blocking (`|| true`), so leaving it as the last statement on the
failure path would let the block exit 0 and a failed capture would read as a pass.

**Position is part of the contract.** This runs after 5.2g and before 5.2h. After
5.2g, because writing the findings of a run whose proof did not verify would enter an
unverified review into the ledger. Before 5.2h, because the record must carry the
capture result in its `## Measurement` block — that is the anchor
`assert-backlog-parity` reads, exactly as `assert-single-round` reads `halt_stage`.

#### 5.2h — Write the review record (sibling artifact, NOT the plan)

The panel's findings are the substance of the review, and until now they existed
only inside `l2.json`. `review_proof.perspectives` keeps `{perspective, verdict}`
pairs — enough to prove a quorum, useless to an author who has just been blocked.
Write the readable record where the author and a later audit can both find it:

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:plan --args "$ARGUMENTS")
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-review/cli.js" record \
  --slug "$DECISION_SLUG" --plan "<plan path>"
```

That writes `.claude/reviews/plan-review-<DECISION_SLUG>.md` — the same title,
Verdict, Quorum, Layers, Findings and Refutation sections this step used to ask
the LLM to type, plus a `## Measurement` block carrying the machine-readable
record (verdict, source, layers, quorum counts, `wall_clock_ms`, `halt_stage`,
`reviewed_plan_hash`).

**Generated, not typed, because a typed record cannot be measured.** M1 asked for
this markdown by hand and put the wall-clock stamp in 5.6b's receipt write
instead — past every stop in 5.2, so blocked runs recorded nothing and the
instrument lost its slowest samples. `record.js` is a pure function over the
REVIEW_DIR artifacts, so the format is pinned by unit test and the measurement
exists on every path. Absent artifacts are the normal early-halt case: missing
axes are written as `null` and named under `### Recording degradations`, never
guessed at.

**It always exits 0.** Every other subcommand answers "may this plan be
approved?", where an unknown input must block. This one answers "what happened?",
and instrumentation that can block the gate is instrumentation that gets deleted
the first time it misfires. Degradations still go to stderr — exit 0 means "I did
not block you", not "everything was fine".

This is a **new file, not an edit to the plan** — writing it into the plan body
would change `plan_hash` and make the 5.6 write exit 12 on the DD13 bind. It also
survives the `.claude/state/` working artifacts, which are transient, and
`.claude/reviews/` is git-tracked, so the record outlives the §3.8 worktree
cleanup that takes the plan-gate receipt with it.

**This section is the PASS path only, and it passes no `--halt-stage`.** A
converged run reaches it after 5.2g. Every stop in 5.2 — including 5.2e, which
used to route through here — records from inside its own block with its own stage
and then exits, so no blocked run ever arrives at this call. That matters more
than it reads: this call is deliberately stage-less, so a blocked run that did
reach it would overwrite its own `halt_stage` with `null` and file itself as a
pass. The section stays here because document order is not execution order, not
because two outcomes share it.

#### 5.2z — Codex path (`mode=codex` only — unchanged from v1.23.0)

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
const honored = require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/env-contract/value')
  .parseBool(process.env, 'MCCP_CODEX_DESIGN_SCOPE_HONOR');
const detect = require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/impeccable-detect');
process.stdout.write(honored && detect.probeSkillAvailable({}) ? '--impeccable-available' : '');
" || echo "")
# codex-intent-context M1 — the review now runs inside plan-codex-runner.js, which
# ALSO writes the receipt. One process holds the review payload in memory from
# invocation through decision to write, so no on-disk artifact is ever a decision
# input (DD3). Launch it DETACHED: codex can block up to 900s while the Bash tool
# caps at 600s, so a foreground call loses the whole review to SIGTERM.
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:plan --args "$ARGUMENTS")
RUN_NONCE=$(node -e 'process.stdout.write(require("crypto").randomUUID())')
AWAITING="$MCCP_TMP/intent-awaiting-$RUN_NONCE.json"
ADJUDICATION="$MCCP_TMP/intent-adjudication-$RUN_NONCE.json"
MARKER="$MCCP_TMP/intent-marker-$RUN_NONCE.json"
LOCKFILE="$MCCP_TMP/intent-gate-$DECISION_SLUG.lock"

# The nonce is part of every path, so a stale artifact from a previous run can
# never be mistaken for this one (R2 F3) — no pre-launch cleanup needed.
# The runner owns the receipt write now, so every audit value Phase 5.0 computed
# has to travel WITH it. A flag omitted here is not "defaulted" — it is silently
# absent from the receipt, while the prose above ("Receipt-write at 5.6 forwards")
# and plan-codex-runner.js's parseArgs both say it is sealed. Keep these three in
# agreement: this list, that prose, and parseArgs.
SILENT_SKIP_FORWARD=""
if [ "${SILENT_SKIP:-0}" = "1" ] && [ -z "${IMPECCABLE_FORCE_OVERRIDE_REASON:-}" ]; then
  SILENT_SKIP_FORWARD=1     # schema mutex: suppressed when the audited escape is set
fi

# codex-intent-context M2 (DD5 #1) — the REQUIRED arbiter mode is decided HERE and
# handed to the runner as an argument. The runner does not read MCCP_INTENT_ARBITER
# at all: if both processes interpreted the same env independently they could reach
# different answers, and the value the receipt seals would then be neither one's
# fact. `subagent` is the default; `author` is how you ask for the M1 behaviour back.
# The `|| echo` is not decoration. Without it a module-load or node failure leaves
# ARBITER_MODE empty: the runner still lands on `subagent` (an out-of-enum argument
# falls back), but 5.5a's routing table has no row for "" and would be left guessing —
# and a guess of `author` records a separation that never happened. stderr is NOT
# redirected: parseArbiterMode's warning on a typo is the whole point of it.
ARBITER_MODE=$(node -e "
  const a = require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/intent-arbiter');
  process.stdout.write(a.parseArbiterMode(process.env, function (w) { process.stderr.write(w + '\n'); }));
" || echo "subagent")

nohup node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/plan-codex-runner.js" \
  --plan "<plan path>" \
  --decision "$DECISION_SLUG" \
  --run-nonce "$RUN_NONCE" \
  --arbiter-mode "$ARBITER_MODE" \
  --focus "challenge the following plan decisions: <list 1-3 key decisions from the plan>" \
  $IMPECCABLE_FLAG \
  ${IMPECCABLE_SKIPPED_REASON:+--impeccable-skipped --impeccable-skip-reason "$IMPECCABLE_SKIPPED_REASON"} \
  ${SILENT_SKIP_FORWARD:+--impeccable-silent-skip --impeccable-silent-skip-reason "$SILENT_SKIP_REASON"} \
  ${MODE:+--impeccable-routing-mode "$MODE"} \
  ${DESIGN_CRITIQUE_ROUNDS:+--design-critique-rounds "$DESIGN_CRITIQUE_ROUNDS"} \
  ${RECEIPT_VERDICT:+--design-critique-verdict "$RECEIPT_VERDICT"} \
  ${DESIGN_INTENT_REASON_FORWARD:+--design-intent-reason "$DESIGN_INTENT_REASON_FORWARD"} \
  > "$MCCP_TMP/plan-codex-runner.out" 2> "$MCCP_TMP/plan-codex-runner.err" &
RUNNER_PID=$!

# Exit 11 means another live run already owns this decision. The runner refuses to
# become a second writer for the same receipt (R1 F5) and writes no marker, so this
# invocation has nothing of its own to wait for. Phase 5.6 detects the foreign lock
# owner and stops with that diagnosis instead of waiting out its deadline.
```

Then wait for the runner to publish the findings (it stays alive while you adjudicate):

```bash
RUN_STARTED_AT=$(date +%s)

# The runner is detached, so it needs a moment to create its lock. Without this
# grace the very first poll below races the spawn, sees no lock, and reports a
# crash for a runner that simply had not started yet.
SPAWN_GRACE=$(( RUN_STARTED_AT + 30 ))
while [ ! -f "$LOCKFILE" ] && [ ! -f "$AWAITING" ] && [ ! -f "$MARKER" ] \
      && [ "$(date +%s)" -lt "$SPAWN_GRACE" ]; do
  sleep 1
done

MARKERLESS_EARLY=0
DEADLINE=$(( $(date +%s) + 1200 ))
while [ ! -f "$AWAITING" ] && [ ! -f "$MARKER" ] && [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if [ -f "$LOCKFILE" ]; then
    # A lock owned by someone else means our runner exited 11 without writing
    # anything, so neither $AWAITING nor $MARKER can EVER appear here.
    LOCK_OWNER=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).run_nonce||"")}catch{}' "$LOCKFILE" 2>/dev/null)
    if [ -n "$LOCK_OWNER" ] && [ "$LOCK_OWNER" != "$RUN_NONCE" ]; then
      echo "[MCCP-GATE-STOP] another run (nonce $LOCK_OWNER) already owns decision \"$DECISION_SLUG\"."
      echo "This invocation launched no second writer, by design. Wait for that run to"
      echo "finish, then re-run /mccp:plan."
      exit 1
    fi
  else
    # No lock: our runner has exited. Three very different things look identical
    # from here, and deciding between them is the whole point of this branch —
    # otherwise all three decay into the same 1200s timeout. Note this also covers
    # the no-adjudication paths (free-form plan / zero findings / codex disabled):
    # those never create $AWAITING, so without this check a lost marker on such a
    # run would time out here and never reach 5.6's recovery.
    SEALED=$(node -e '
      const {readReceipt}=require("'"${CLAUDE_PLUGIN_ROOT}"'/scripts/receipt/store");
      const {gitRepoRoot}=require("'"${CLAUDE_PLUGIN_ROOT}"'/scripts/receipt/hash");
      try{const r=readReceipt(gitRepoRoot(process.cwd()),"mccp-plan-codex",process.argv[1]);
        process.stdout.write((r&&r.meta&&r.meta.intent_run_nonce)||"");}catch(_){}
    ' "$DECISION_SLUG" 2>/dev/null)
    # (1) Ours: the run finished and only the marker is missing. Fall through to
    #     5.6, whose markerless branch confirms and consumes it.
    if [ "$SEALED" = "$RUN_NONCE" ]; then MARKERLESS_EARLY=1; break; fi
    # (2) A DIFFERENT nonce is sealed. That is a concurrent winner only if the
    #     receipt was written after we started; a receipt left by an earlier run
    #     looks identical from the nonce alone. Reporting both as "completed by
    #     another run" sends the operator hunting for a race that never happened,
    #     so compare against this run's start before naming it.
    if [ -n "$SEALED" ]; then
      RECEIPT_AT=$(node -e '
        const {readReceipt}=require("'"${CLAUDE_PLUGIN_ROOT}"'/scripts/receipt/store");
        const {gitRepoRoot}=require("'"${CLAUDE_PLUGIN_ROOT}"'/scripts/receipt/hash");
        try{const r=readReceipt(gitRepoRoot(process.cwd()),"mccp-plan-codex",process.argv[1]);
          const t=r&&r.meta&&r.meta.created_at;
          process.stdout.write(t?String(Math.floor(Date.parse(t)/1000)):"");}catch(_){}
      ' "$DECISION_SLUG" 2>/dev/null)
      if [ -n "$RECEIPT_AT" ] && [ "$RECEIPT_AT" -ge "$RUN_STARTED_AT" ]; then
        echo "[MCCP-GATE-STOP] decision \"$DECISION_SLUG\" was completed by a concurrent run"
        echo "(sealed nonce $SEALED, ours $RUN_NONCE). Our runner exited without writing,"
        echo "by design. Re-run /mccp:plan if you need the current body reviewed."
      else
        echo "[MCCP-GATE-STOP] plan-codex runner exited without writing a receipt."
        echo "The receipt on disk predates this run (sealed nonce $SEALED) — it is STALE,"
        echo "not evidence that this run succeeded. The runner either crashed or blocked"
        echo "and could not write its marker; $MCCP_TMP/plan-codex-runner.err has the detail."
      fi
      exit 1
    fi
    # (3) Nothing sealed at all.
    echo "[MCCP-GATE-STOP] plan-codex runner exited without writing a receipt."
    echo "Either it crashed, or it blocked and could not write its marker — in the"
    echo "latter case the verdict and reason are in $MCCP_TMP/plan-codex-runner.err."
    exit 1
  fi
  sleep 10
done

# The documented timeout state, which until now existed only in the prose below.
# Without this branch the loop simply falls through into the next phase after
# 1200s of silence — the one outcome the state table says must never happen:
# nothing produced, and nothing saying so. MARKERLESS_EARLY guards the legitimate
# break above, where neither file exists but the receipt already seals our nonce.
if [ "$MARKERLESS_EARLY" = "0" ] && [ ! -f "$AWAITING" ] && [ ! -f "$MARKER" ]; then
  echo "[MCCP-GATE-STOP] intent gate timed out after 1200s: the runner still holds its"
  echo "lock but has produced neither findings nor a marker. Do NOT assume success —"
  echo "re-run /mccp:plan once the holding run has finished or been cleared."
  exit 1
fi
```

- `$MARKER` appearing first means the gate finished without needing adjudication
  (zero findings / free-form plan / `MCCP_CODEX_DISABLED=1`) — skip to 5.6.
- `$AWAITING` appearing means findings need adjudication — do 5.3/5.4, then **5.5a**.
- The loop ending because the lock is gone and the receipt already seals OUR nonce
  means the run finished but its marker never landed — continue to 5.6, whose
  markerless branch confirms it. This is why the no-adjudication paths (which never
  create `$AWAITING`) cannot time out here with a valid receipt on disk.
- Any `[MCCP-GATE-STOP]` the loop printed already named the state — foreign owner,
  completed by another run, or crashed. Do not re-interpret it as a timeout.
- Neither file, and the deadline passed → `[MCCP-GATE-STOP]` (do NOT assume success).

The classification/verdict derivation below is performed **by the runner**; the values
are reported in `$MARKER` (`codex_verdict`, `intent_gate_verdict`). The block below is
retained only to document the mapping the runner applies.

```bash
CODEX_EXIT=0

CODEX_BLOCKING=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.blocking?"1":"0")}catch{console.log("1")}' "$CODEX_STDOUT")
CODEX_CLASS=$(node -e 'try{const j=JSON.parse(process.argv[1]);console.log(j.classification||"unknown")}catch{console.log("parse-error")}' "$CODEX_STDOUT")

if [ "$CODEX_EXIT" != "0" ] || [ "$CODEX_BLOCKING" = "1" ] || { [ "$CODEX_CLASS" != "ok" ] && [ "$CODEX_CLASS" != "disabled" ] && [ "$CODEX_CLASS" != "round-cap-reached" ]; }; then
  if [ "${MCCP_ALLOW_CODEX_UNAVAILABLE:-0}" = "1" ]; then
    echo "[mccp] Codex unavailable in advisory mode (class=$CODEX_CLASS exit=$CODEX_EXIT)"
    # Replace the placeholder with auto-fallback marker + advisory annotation, then jump to 5.5
    # The downstream receipt will stamp advisory=true → non-approving.
  else
    echo "[MCCP-GATE-STOP] Codex unavailable (blocking=$CODEX_BLOCKING class=$CODEX_CLASS exit=$CODEX_EXIT)."
    echo "Set MCCP_ALLOW_CODEX_UNAVAILABLE=1 to proceed in advisory mode (yields non-approving receipt)."
    exit 1
  fi
elif [ "$CODEX_CLASS" = "round-cap-reached" ]; then
  # env-contract-integrity M3 — the budget for this decision is spent. This is a
  # TERMINAL OUTCOME, not an outage: it is the mechanical form of the sentence
  # this body already carried ("Beyond the cap, annotate as Open Questions:
  # DIVERGENT_UNRESOLVED and proceed"). blocking=false, durationMs=0, no spawn.
  echo "[mccp] round cap reached — Codex did not fire. Recording the divergence and proceeding."
  # Replace the placeholder with a round-cap marker and annotate
  # 'Open Questions: DIVERGENT_UNRESOLVED', then jump to 5.5.
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
elif [ "$CODEX_CLASS" = "round-cap-reached" ]; then
  # DD4 — divergent, NOT unavailable. `unavailable` claims Codex could not be
  # reached; here it was deliberately not asked because this decision had already
  # spent its rounds. divergent is also the value that keeps cross-gate dedupe
  # CLOSED (§3.12), so a spent budget can never be used to slip past dual review.
  CODEX_VERDICT="divergent"
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
# v1.23.1 M1 (santa-loop R2) — PERSIST the verdict, do not carry it in a shell
# variable. 5.2f and 5.6 both consume it and both run in LATER fenced blocks, and
# shell state does not survive a block boundary (§3.9). Held only in $CODEX_VERDICT
# it arrives EMPTY at both: 5.6's `[ -n "${CODEX_VERDICT:-}" ]` silently drops
# --codex-verdict, so a receipt records no Codex verdict even though Codex spoke,
# and 5.2f writes `"verdict":""` — the exact value its own prose forbids.
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
mkdir -p "$REVIEW_DIR" || { echo "[MCCP-GATE-STOP] cannot create $REVIEW_DIR — the Codex verdict cannot be persisted, and an unrecorded review must not be sealed as if it never happened."; exit 12; }
printf '%s' "$CODEX_VERDICT" > "$REVIEW_DIR/codex-verdict" || { echo "[MCCP-GATE-STOP] cannot write $REVIEW_DIR/codex-verdict — Codex spoke but the verdict would be lost, and 5.6 would stamp a receipt claiming no Codex review."; exit 12; }
# Read it back. A write that returns 0 and lands empty (a full disk that reports
# success on the open, a filesystem that defers the error) is the failure mode a
# bare exit-code check misses, and the whole point of this artifact is that it is
# the ONLY carrier across the block boundary — there is no second copy to fall
# back on. Verifying costs one read.
# Persist the classification too. 5.2f needs it for the L3 record and runs behind
# a later fence, where $CODEX_CLASS is empty — the same block-boundary loss this
# artifact exists to fix.
printf '%s' "${CODEX_CLASS:-unknown}" > "$REVIEW_DIR/codex-class" || { echo "[MCCP-GATE-STOP] cannot write $REVIEW_DIR/codex-class — the L3 record would have to invent a reason."; exit 12; }
CODEX_VERDICT_BACK=$(cat "$REVIEW_DIR/codex-verdict" 2>/dev/null || printf '')
[ "$CODEX_VERDICT_BACK" = "$CODEX_VERDICT" ] || { echo "[MCCP-GATE-STOP] codex-verdict artifact read back as '$CODEX_VERDICT_BACK' but Codex returned '$CODEX_VERDICT' — refusing to continue with a corrupted audit record."; exit 12; }
echo "[mccp:plan-codex] codex verdict persisted: '${CODEX_VERDICT}'" 1>&2
```

After Phase 5.4's YAGNI triage loop finishes: if the loop annotated `Open Questions: DIVERGENT_UNRESOLVED` (cap reached with an unresolved ACCEPT_NOW HIGH/CRITICAL), set `CODEX_VERDICT="divergent"` — overriding the parsed value so the receipt records the unresolved divergence. This is the ONLY place the triage outcome overrides the raw parse. **Re-write the artifact when you do**, or the override lives only in a shell variable that 5.6 will never see:

```bash
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
printf '%s' "divergent" > "$REVIEW_DIR/codex-verdict"
```

When `CODEX_CLASS=disabled`: replace the placeholder with `> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy)` and jump to 5.5. When in advisory mode (auto-fallback for unavailable): replace with `> Codex unavailable, skipped (auto-fallback): <classification>` and jump to 5.5.

### 5.3 — Inject Codex result into the plan (`mode=codex` ONLY)

**Skip this entire step in `multi-agent` and `hybrid` modes.** The plan is frozen
(5.2 invariant ii): this injection changes `plan_hash`, and `write.js` would then
refuse to seal the receipt because `review_proof.reviewed_plan_hash` no longer
describes the plan on disk. In panel modes the equivalent record is 5.2h, and the
L3 verdict is already sealed inside `review_proof.layers.l3`. Leave the
placeholder in place — 5.6 Step A only demands the Codex heading on the codex path.

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

> **Codex가 비활성이면 R2는 존재하지 않는다.** 캡이 1로 pin되어 있고, 설령 그 캡을
> 지나쳐 호출하더라도 `codex-invoke.js`가 spawn 직전에 봉인된 정책을 읽어
> `disabled`로 short-circuit한다.
>
> **`MCCP_CODEX_DISABLED`는 1회성 escape가 아니라 영구 운영자 정책이다.** 게이트는
> 어떤 라운드에서도 이 변수를 해제하거나 override하거나 `0`으로 재설정하지 않는다.
> R1이 이를 소진하지 않는다. 진짜 1회성인 형제 토글들(`MCCP_SKIP_RECEIPT`,
> `MCCP_PR_SKIP_CODEX_REVIEW`)과 혼동하지 말 것.


Read the cap from the shared oracle — do NOT hardcode a literal here. It is the
one source the three gates agree on, and it pins the cap to 1 whenever
`MCCP_REVIEW_SINGLE_PASS` carries a valid reason, whatever `MCCP_GATE_ROUND_CAP`
holds (review-loop-bypass M1):

```bash
ROUND_CAP_JSON=$(node -e '
  const root = process.argv[1];
  const policy = require(root + "/scripts/lib/codex-policy");
  const {effectiveRoundCap} = require(root + "/scripts/lib/review-single-pass");
  const gitDir = policy.resolveGitDir(process.cwd());
  const codexDisabled = policy.resolveCodexDisabled({ gitDir: gitDir, env: process.env });
  process.stdout.write(JSON.stringify(effectiveRoundCap(process.env, { codexDisabled: codexDisabled })));
' "${CLAUDE_PLUGIN_ROOT}")
ROUND_CAP=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).cap))}catch{process.stdout.write("1")}' <<<"$ROUND_CAP_JSON")
node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(j.note)process.stderr.write("[mccp:round-cap] "+j.note+" (pinnedBy="+j.pinnedBy+")
")}catch(_){}' <<<"$ROUND_CAP_JSON"
```

Repeat up to `$ROUND_CAP` rounds (default `1`, allowed `1`/`2`/`3`). Beyond the cap,
annotate as `Open Questions: DIVERGENT_UNRESOLVED` and proceed.

> **이 캡은 v1.33.4부터 산문이 아니다.** 초과 호출은 `codex-invoke.js`가 spawn 직전에
> 거부하고 `round-cap-reached`를 돌려주므로 Codex는 발화하지 않으며, L2 패널 쪽은
> `emit-workflow-args`가 exit 12로 끝나고 `workflow-args.json`을 만들지 않는다. 위 문장은
> 그대로 유효하되, 그것을 지키는 것이 더는 이 문서를 읽는 실행 주체의 성실성이 아니라
> 5.-1이 봉인한 정책과 라운드 원장이다. 봉인이 없으면(M3 이전 저장소) 강제도 없고, 그
> 사실은 receipt의 `meta.round_cap=null`로 남는다 — 조용히 넘어가지 않는다.

If no `ACCEPT_NOW` HIGH/CRITICAL remains, stop at R1.

All `DEFER_TO_BACKLOG` items: append a line to `.claude/plans/codex-findings-backlog.md`
before Phase 5.5. Format:
- `YYYY-MM-DD | <severity> | <source plan path> | <one-line finding>`

### 5.4a — Intent-gate block (codex-intent-context M1)

If the marker reports `exit_code=12`, the intent gate blocked and **no receipt was
written**. Read `intent_gate_verdict` + `reason` from `$MARKER` and output:

```
[MCCP-INTENT-GATE-STOP] intent gate blocked (verdict=<intent_gate_verdict>).
Reason: <reason from marker>
No mccp-plan-codex receipt was written, so /mccp:prp-implement cannot start.
Recovery:
  - incomplete            → the gate could not certify that every finding was adjudicated.
                            Usually that is a missing row, but the same verdict covers a
                            file written against a DIFFERENT review (stale
                            review_payload_digest), a count that does not match the
                            findings, and a duplicate or out-of-range finding_index — the
                            marker's reason says which.
                            Re-run /mccp:plan and write a complete one at 5.5a; that
                            regenerates the review and the adjudication together, which
                            resolves every one of those causes. Do NOT go
                            looking for this run's intent-adjudication-<nonce>.json: its
                            path carries the run nonce, so a new run neither reads nor
                            reuses it, and it is removed with the run's other scratch.
  - conflict_unresolved   → a finding conflicting with a UI<n> constraint was ACCEPT_NOW'd
                            without intent_override_reason; either reject it, or write down
                            why the user's constraint is being overridden
  - skipped-unproven      → a skip was claimed with no corroborated proof (this is a bug —
                            report it)
  - inconclusive          → the REVIEWER did not follow the per-finding `INTENT:` contract,
                            so your labels had nothing to be checked against. This is NOT
                            fixed by editing the adjudication file: re-run the review so the
                            reviewer emits exactly one `INTENT:` line per finding. The
                            marker's reason carries the claimed/total count, which is how
                            far off it was — under `enforce` that is the ONLY place it
                            exists, because a blocked run writes no receipt. (Under `warn`
                            the receipt is written, so meta.intent_claim_counts is there
                            too.) If the reviewer simply will not comply, set
                            MCCP_INTENT_MISLABEL=warn to record the gap instead of blocking
                            on it — the receipt then seals `inconclusive` and cross-gate
                            dedupe stays closed, so PR-Codex still runs.
  - mislabel_unresolved   → the reviewer named a UI<n> id that you did not (see the marker's
                            reason for the first offending index). At 5.5a either correct
                            `intent_conflict` to the id the reviewer named, or write an
                            `intent_dispute_reason` saying why the reviewer is wrong. A
                            one-token reason is rejected and counts as no answer.
                            MCCP_INTENT_MISLABEL=warn records it instead of blocking.
  - or set MCCP_SKIP_INTENT_GATE="<substantive reason>" for an audited override
    (the receipt still seals the real blocking verdict, so PR-Codex will still run)
```

End the response. Do NOT hand-write the receipt.

### 5.5 — Auto-CRITICAL check

Scan for auto-CRITICAL items (per §0 catalog: secret exposure, data loss, irreversible migration, auth bypass, external destination change, crypto key handling). The source depends on who reviewed: on the codex path, the Codex Open Questions in the plan body; in panel modes, the `CRITICAL` rows of the 5.2h findings table (equivalently `results[].findings[]` in `l2.json`). If any present:

1. Do NOT proceed to 5.6 / 5.7
2. Output:
   ```
   [MCCP-GATE-STOP] CRITICAL Open Question 감지:
   - <item>
   Plan: <path>
   사용자 결정 필요. 진행 의사 또는 수정 지시를 주세요.
   ```
3. End the response.

### 5.5a — Adjudicate every finding (codex-intent-context M1 · M2 심판 분리)

**PRD-mode plans only.** If Phase 5.2 launched the runner (i.e. `$RUN_NONCE` is set)
and the awaiting artifact lists ≥1 finding, the runner is **still alive**, holding the
review payload in memory and waiting for the adjudication. Every finding must receive
an explicit verdict — a single omission makes the gate `incomplete` and **no receipt is
written**.

M2 did not change *what* is decided. It changed *who decides*. You wrote the plan, so
you hold every argument in its favour; that is exactly the party that should not also
rule on whether it violates the user's constraints. The required mode selects the path.

**Read that mode from `$AWAITING`, not from the `$ARBITER_MODE` shell variable.** 5.2z
computed it, but shell state does not survive across tool calls and that value is
recoverable from nowhere else on disk — while the runner holds the authoritative copy
(it arrived as `--arbiter-mode`) and seals it either way. A lost variable guessed as
`author` therefore produces the one outcome this milestone exists to prevent: the
author adjudicates, nothing records a degradation, and the receipt says `subagent`.
`$AWAITING` is the file you have to read anyway, so key off it:

```bash
ARBITER_MODE=$(node -e '
  const fs = require("fs");
  const a = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  process.stdout.write(typeof a.arbiter_mode === "string" ? a.arbiter_mode : "subagent");
' "$AWAITING")
```

| `$ARBITER_MODE` | path |
|---|---|
| `subagent` (default) | **5.5a-1** — dispatch `Task(mccp:intent-arbiter)`; fall through to 5.5a-2 **only** when the probe rejects its output |
| `author` | **5.5a-2** directly, with **no** `arbiter_degraded` key |

#### 5.5a-1 — Dispatch the arbiter (`$ARBITER_MODE = subagent`)

Build the projection and the prompt. The projection is a **whitelist**: it carries the
payload digest, the user-stated constraints, and the findings, and nothing else — not
`plan_path`, not any field a future runner adds. The arbiter also has no file-reading
tool, so the whitelist is the second wall rather than the only one.

```bash
ARBITER_PROMPT_FILE="$MCCP_TMP/intent-arbiter-prompt-$RUN_NONCE.txt"
node -e '
  const fs = require("fs");
  const a = require(process.argv[1] + "/scripts/lib/intent-arbiter");
  const awaiting = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  // 0600, same as the awaiting artifact it is derived from: this file carries the
  // findings and the user constraints, and it is written by this shell rather than by
  // the runner, so it would otherwise land with the ambient umask. The runner deletes
  // it in its own `finally` — cleanup in prose is cleanup that gets skipped.
  fs.writeFileSync(process.argv[4], a.buildArbiterTaskPrompt({
    projection: a.buildArbiterProjection(awaiting),
    adjudicationPath: process.argv[3],
  }), { mode: 0o600 });
' "${CLAUDE_PLUGIN_ROOT}" "$AWAITING" "$ADJUDICATION" "$ARBITER_PROMPT_FILE"
```

The path is fixed by `plan-codex-runner.js#paths` (`intent-arbiter-prompt-<nonce>.txt`)
so the runner can remove it. Renaming it here orphans the file, it does not relocate it.

Read `$ARBITER_PROMPT_FILE` and dispatch its contents **verbatim**:

> `Task(mccp:intent-arbiter, "<contents of $ARBITER_PROMPT_FILE>")`

Add nothing of your own to that prompt — no plan excerpt, no rationale, no summary of
what you were trying to achieve. Everything you would be tempted to add is the author
context the separation exists to withhold.

Then publish and **probe**. The probe is a validity check, not an existence check: an
arbiter that writes syntactically broken JSON passes `[ -f ]`, and the runner would
then sit until its adjudication timeout before dying as `incomplete` — reinstating the
exact stall this step removes. The contract is narrow on purpose: `parseAdjudicationFile`
says `ok` → **exit 0**, anything else → **exit 1**, stdout stays empty, reasons go to
stderr. Branch on the exit code only. A probe that crashes outright (module gone, node
gone) also exits non-zero and therefore lands on "invalid", which is the fail-closed
direction — folding "cannot tell" into "fine" would switch the degradation off silently.

```bash
if node -e '
  const fs = require("fs");
  const ic = require(process.argv[1] + "/scripts/lib/intent-context");
  const target = process.argv[2];
  const staged = target + ".tmp";
  const parse = function (p) {
    try { return ic.parseAdjudicationFile(fs.readFileSync(p, "utf8")); }
    catch (e) { return { ok: false, reason: "unreadable (" + e.message + ")" }; }
  };
  // The arbiter writes "<path>.tmp" because the runner polls the un-suffixed path
  // and reads it the instant it appears; a direct write could be read half-done.
  // Publishing here with rename(2) is atomic, and the arbiter (Write-only) has no
  // way to rename for itself.
  //
  // VALIDATE FIRST, then publish. Moving the staged file across unconditionally
  // would hand the runner a malformed read instead of letting this step degrade —
  // the gate would die `incomplete` on the arbiter output rather than falling back.
  if (fs.existsSync(staged)) {
    const s = parse(staged);
    if (!s.ok) {
      process.stderr.write("[mccp:intent-arbiter] staged output invalid: " + s.reason + "\n");
      process.exit(1);
    }
    fs.renameSync(staged, target);
  }
  const t = parse(target);
  if (!t.ok) {
    process.stderr.write("[mccp:intent-arbiter] no usable output: " + t.reason + "\n");
    process.exit(1);
  }
' "${CLAUDE_PLUGIN_ROOT}" "$ADJUDICATION"; then
  ARBITER_DEGRADE_REASON=""
  echo "[mccp:intent-arbiter] arbiter output accepted — adjudication is separated" 1>&2
else
  # Cause is deliberately NOT enumerated. Agent not registered, tool refused, error,
  # cancellation, returned-but-wrote-nothing, wrote-garbage — all the same branch.
  # An earlier draft handled only "agent type not found" and every other failure fell
  # into the runner's timeout.
  ARBITER_DEGRADE_REASON="unknown-task-failure"
  echo "[mccp:intent-arbiter] DEGRADING to author adjudication — see stderr above" 1>&2
fi
```

**When `$ARBITER_DEGRADE_REASON` is non-empty**, write the adjudication yourself with
the 5.5a-2 procedure below — with two differences: the file goes to
`"$ADJUDICATION.degraded.tmp"` instead of `"$ADJUDICATION.tmp"`, and it carries one
extra top-level key:

```json
"arbiter_degraded": { "from": "subagent", "to": "author", "reason": "unknown-task-failure" }
```

Write the **complete** adjudication — every field, every finding, judged by you the way
M1 always had you judge it. Nothing here reconstructs a judgement programmatically, and
no helper fills in default verdicts: a degradation that writes its own verdicts is an
automatic approval, which is the "acceptance with no record" M1 exists to prevent. An
incomplete degraded file simply dies on the M1 rules — `arbiter_degraded` exempts
nothing.

Then publish it:

```bash
node -e '
  const fs = require("fs");
  const ic = require(process.argv[1] + "/scripts/lib/intent-context");
  const target = process.argv[2];
  const staged = target + ".degraded.tmp";
  const ok = function (p) {
    try { return ic.parseAdjudicationFile(fs.readFileSync(p, "utf8")).ok; } catch (_) { return false; }
  };
  // Create-EXCLUSIVE, never clobber. A late arbiter can still land a valid file at
  // the target, and overwriting it would erase a separation that really happened and
  // record `author` in its place. link(2) is atomic and fails EEXIST instead.
  let published = false;
  try { fs.linkSync(staged, target); published = true; }
  catch (e) {
    if (e.code !== "EEXIST") {
      // Hard links are unavailable on some filesystems. "wx" is create-exclusive too;
      // writing through the fd is not atomic against the runner poll, which is why it
      // is the fallback and not the primary.
      try {
        const fd = fs.openSync(target, "wx");
        try { fs.writeSync(fd, fs.readFileSync(staged)); } finally { fs.closeSync(fd); }
        published = true;
      } catch (e2) { if (e2.code !== "EEXIST") throw e2; }
    }
  }
  if (!published) {
    // Re-probe and re-decide IN THIS PROCESS. Splitting the check and the write across
    // two shell steps reopens the window between them.
    if (ok(target)) {
      fs.unlinkSync(staged);
      process.stderr.write("[mccp:intent-arbiter] late arbiter output is valid — degradation CANCELLED\n");
      process.exit(3);
    }
    // Guard before the mutation. Without it a staged file that is malformed, or that
    // simply lost its `arbiter_degraded` key, dies on a raw SyntaxError/TypeError and
    // the shell below reports "could not publish" — naming the publish step for a
    // fault that is entirely in the file you just wrote. Still fail-closed; only the
    // diagnosis changes, and the diagnosis is what someone acts on at 2am.
    let body = null;
    try { body = JSON.parse(fs.readFileSync(staged, "utf8")); } catch (e3) { body = null; }
    if (!body || typeof body.arbiter_degraded !== "object" || body.arbiter_degraded === null) {
      process.stderr.write("[mccp:intent-arbiter] the degraded adjudication you staged at " +
        staged + " is not usable (unparsable, or missing the arbiter_degraded key). " +
        "Rewrite it per 5.5a-2 including that key, then re-run this publish.\n");
      process.exit(5);
    }
    body.arbiter_degraded.reason = "replaced-invalid-arbiter-output";
    fs.writeFileSync(staged, JSON.stringify(body, null, 2));
    fs.renameSync(staged, target);
    process.stderr.write("[mccp:intent-arbiter] replaced an invalid late arbiter output\n");
    process.exit(4);
  }
  try { fs.unlinkSync(staged); } catch (_) {}
' "${CLAUDE_PLUGIN_ROOT}" "$ADJUDICATION"
PUBLISH_EXIT=$?
# 0 = degraded and published · 3 = cancelled, the arbiter won after all · 4 = replaced
# an invalid late file. 3 leaves the seal at `subagent`, which is the honest record.
if [ "$PUBLISH_EXIT" != "0" ] && [ "$PUBLISH_EXIT" != "3" ] && [ "$PUBLISH_EXIT" != "4" ]; then
  # 5 = the staged file itself was unusable. Anything else = a real publish failure.
  echo "[MCCP-INTENT-GATE-STOP] degraded adjudication not published (exit $PUBLISH_EXIT) — the stderr above says why." 1>&2
  exit 1
fi
```

The reason is never omitted. `unknown-task-failure` covers "we could not tell why", and
`replaced-invalid-arbiter-output` covers "a late file was there and it was broken" —
because an empty reason makes `parseAdjudicationFile` reject the whole degradation, and
then the file claims nothing at all.

#### 5.5a-2 — Write the adjudication yourself (`$ARBITER_MODE = author`, or after a degradation)

Read `$AWAITING` (written by the runner) and produce one entry per finding. Copy
`finding_index` and `finding_digest` **verbatim** from that file — they bind your
adjudication to this exact review, so a stale or reordered payload is rejected.

```bash
# Write to a temp path and rename. The runner polls for $ADJUDICATION and reads it
# the moment it appears, so writing in place lets it read a half-written heredoc,
# fail JSON parsing, and block the gate as `incomplete` for a file that was in fact
# complete a millisecond later. rename(2) is atomic within a directory.
cat > "$ADJUDICATION.tmp" <<'JSON'
{
  "plan_path": "<plan path>",
  "round": 1,
  "review_payload_digest": "<review_payload_digest, verbatim from $AWAITING>",
  "adjudications": [
    {
      "finding_index": 0,
      "finding_digest": "<finding_digest for index 0, verbatim from $AWAITING>",
      "intent_conflict": "none",
      "verdict": "ACCEPT_NOW",
      "rationale": "<why — must be non-empty>",
      "intent_override_reason": null,
      "intent_dispute_reason": null
    }
  ]
}
JSON
mv "$ADJUDICATION.tmp" "$ADJUDICATION"
```

Field rules (all enforced mechanically by `intent-context.js`):

| Field | Rule |
|---|---|
| `finding_index` | 0..N-1, each exactly once — no gaps, no duplicates |
| `finding_digest` | verbatim from `$AWAITING`; a mismatch means the payload changed |
| `intent_conflict` | `"none"`, or a `UI<n>` id that EXISTS in `## User Intent` |
| `verdict` | `ACCEPT_NOW` / `DEFER_TO_BACKLOG` / `REJECT_YAGNI` / `REJECTED_BY_DESIGN` |
| `rationale` | non-empty |
| `intent_override_reason` | **required** when `intent_conflict != "none"` AND `verdict = ACCEPT_NOW` |
| `intent_dispute_reason` | **required** when the reviewer named an id you did not — see below. ≥30 chars, ≥3 words, no one-token shrug. Unlike an override reason it MAY name code (`test`, `bar.ts`, a `TODO`); only outright filler (`lorem`, `asdf`) is refused |

The `intent_override_reason` rule is the one substantive constraint M1 enforces:
accepting a finding that contradicts a user-stated constraint requires you to write
down why.

#### Check your label against the reviewer's (codex-intent-context M1.5)

Each finding in `$AWAITING` now also carries **`reviewer_claim`** — the id the reviewer
itself named for that finding (`"none"`, a `UI<n>`, or `null` when its claim was
missing or ambiguous). Marking a genuine conflict as `"none"` no longer passes
silently: **if `reviewer_claim` is a `UI<n>` and your `intent_conflict` is not that
same id**, you must do exactly one of two things:

1. **Correct your label** — set `intent_conflict` to the id the reviewer named. (The
   M1 rule then applies as usual: `ACCEPT_NOW` on a real conflict needs an
   `intent_override_reason`.)
2. **Dispute it** — write `intent_dispute_reason` explaining why the reviewer is
   wrong. A one-token answer (`"no"`, `"ok"`) is rejected by the validator and counts
   as no answer at all.

Doing neither makes the gate `mislabel_unresolved`. The gate is not asking you to be
right; it is refusing to let a disagreement disappear without a record — every disputed
finding is sealed into `meta.intent_mislabel_audit` with the reviewer's claim, your
label, and your reason.

Read `reviewer_claim_status`, not `reviewer_claim`, to tell those two apart. A `null`
`reviewer_claim` means one of two very different things, and only the status field
distinguishes them:

| `reviewer_claim_status` | meaning |
|---|---|
| `"unclaimed"` | the reviewer was asked and did not answer usably → the review is `inconclusive`, which you cannot fix in this file (see 5.6) |
| `null` | the mislabel axis never ran (`MCCP_INTENT_MISLABEL=off`), so nothing on this page applies — no claim was requested, none is missing, and there is nothing to dispute |

`$AWAITING` also carries `mislabel_mode` at the top level, which says the same thing
once for the whole file.

### 5.6 — Await the runner's completion marker (`mode=codex` ONLY — receipt is written BY the runner)

**Skip this entire step in `multi-agent` and `hybrid` modes.** Only 5.2z launches a
runner, so on the panel paths `$RUN_NONCE`, `$MARKER` and `$LOCKFILE` do not exist and
there is nothing to await — 5.6b writes the receipt there instead. Go straight to 5.6b.

The runner — not this command body — writes the `mccp-plan-codex` receipt, because the
intent decision travels in-process and has **no CLI surface** (a flag there would let any
shell caller stamp an approving verdict without Codex running). So there is no
`cli.js write` step here; instead, wait for the marker and verify it.

```bash
# Poll for the marker this run owns. The nonce is in the PATH, so a stale marker
# from an earlier run cannot be mistaken for this one.
DEADLINE=$(( $(date +%s) + 2400 ))
MARKERLESS=0

# "Did the runner finish without leaving a marker?" is asked from two places
# below, so read the nonce the receipt sealed (meta.intent_run_nonce) once here.
sealed_nonce() {
  node -e '
    const {readReceipt}=require("'"${CLAUDE_PLUGIN_ROOT}"'/scripts/receipt/store");
    const {gitRepoRoot}=require("'"${CLAUDE_PLUGIN_ROOT}"'/scripts/receipt/hash");
    try{const r=readReceipt(gitRepoRoot(process.cwd()),"mccp-plan-codex",process.argv[1]);
      process.stdout.write((r&&r.meta&&r.meta.intent_run_nonce)||"");}catch(_){}
  ' "$DECISION_SLUG" 2>/dev/null
}

# The lock names its owner. A lock held by a DIFFERENT nonce means the runner we
# launched exited 11 (another live run owns this decision) and wrote no marker,
# so our nonce-scoped $AWAITING/$MARKER paths will never appear. Without this
# check the loop below would wait out the full deadline and then blame a timeout,
# or — once the winner released the lock — read the winner's nonce, find it is
# not ours, and report "crashed" for a run that actually succeeded.
LOCK_OWNER=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).run_nonce||"")}catch{}' "$LOCKFILE" 2>/dev/null)
if [ -n "$LOCK_OWNER" ] && [ "$LOCK_OWNER" != "$RUN_NONCE" ]; then
  echo "[MCCP-GATE-STOP] another run (nonce $LOCK_OWNER) already owns decision \"$DECISION_SLUG\"."
  echo "This invocation launched no second writer, by design. Wait for that run to"
  echo "finish, then re-run /mccp:plan."
  exit 1
fi

while [ ! -f "$MARKER" ] && [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if [ ! -f "$LOCKFILE" ]; then
    # Lock gone with no marker: the runner died, or its marker write failed. Tell
    # "died after the receipt was written" from "died before" by looking for OUR
    # nonce sealed inside the receipt (meta.intent_run_nonce).
    SEALED=$(sealed_nonce)
    if [ "$SEALED" = "$RUN_NONCE" ]; then MARKERLESS=1; break; fi   # succeeded-markerless
    echo "[MCCP-GATE-STOP] plan-codex runner died before writing a receipt (crashed)."
    exit 1
  fi
  sleep 5
done

# Deadline reached with the lock still in place. The loop only consults the
# receipt when the lock DISAPPEARS, but a hard kill (SIGKILL, host power loss)
# skips the runner's finally block, so the lock outlives the process and the
# receipt it already wrote is never noticed. Ask once more before calling this a
# timeout — otherwise a completed gate is reported as a failure.
if [ "$MARKERLESS" = "0" ] && [ ! -f "$MARKER" ]; then
  SEALED=$(sealed_nonce)
  if [ "$SEALED" = "$RUN_NONCE" ]; then
    echo "[mccp:intent-gate] deadline passed with a stale lock, but the receipt seals run_nonce $RUN_NONCE — treating as succeeded-markerless." 1>&2
    MARKERLESS=1
  fi
fi
```

Marker states — handle each explicitly, never "proceed because the file appeared":

| State | Condition | Action |
|---|---|---|
| `running` | awaiting artifact present AND lock alive | keep polling |
| `ok` | marker `exit_code=0` AND `run_nonce` matches | continue to 5.7 |
| `blocked` | marker `exit_code=12` | 5.4a `[MCCP-INTENT-GATE-STOP]` |
| `succeeded-markerless` | lock gone, receipt seals our `intent_run_nonce` | continue to 5.7 |
| `crashed` | lock gone, no marker, nonce not sealed | STOP (above) |
| `timeout` | deadline passed | STOP — do not assume success |

```bash
if [ "$MARKERLESS" = "1" ]; then
  # There is no marker to verify — the receipt IS the evidence. Reading it as a
  # success is only sound because the runner quarantines any receipt it refuses to
  # stand behind (post-write digest mismatch renames it aside), so a readable
  # receipt carrying this run_nonce is never a blocked run. Phase 5.7 re-validates
  # it regardless. Do NOT fall through to the marker checks below: $MARKER does not
  # exist, and parsing it would report a foreign-marker mismatch for a run that in
  # fact succeeded.
  echo "[mccp:intent-gate] marker absent but the receipt seals run_nonce $RUN_NONCE — succeeded-markerless." 1>&2
  MARKER_EXIT=0
else
  if [ ! -f "$MARKER" ]; then
    echo "[MCCP-GATE-STOP] intent gate timed out (2400s): no marker, and no receipt seals run_nonce $RUN_NONCE. Do NOT assume success — re-run /mccp:plan."
    exit 1
  fi
  # Verify the marker belongs to THIS run before trusting any of its contents.
  MARKER_NONCE=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).run_nonce||"")}catch{}' "$MARKER")
  [ "$MARKER_NONCE" = "$RUN_NONCE" ] || {
    echo "[MCCP-GATE-STOP] marker run_nonce mismatch — refusing to trust a foreign run's marker."
    exit 1
  }
  MARKER_EXIT=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).exit_code))}catch{process.stdout.write("12")}' "$MARKER")
fi

# The documented `blocked` state. Without this branch MARKER_EXIT is write-only and
# 5.4a is unreachable prose. The chain would still stop — 5.7's read-back validate
# finds no receipt — but the operator would get a generic "no receipt" error instead
# of the verdict, the reason, and the recovery steps that tell them how to fix it.
if [ "$MARKER_EXIT" != "0" ]; then
  MARKER_VERDICT=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).intent_gate_verdict||"unknown")}catch{process.stdout.write("unknown")}' "$MARKER")
  MARKER_REASON=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).reason||"(none recorded)")}catch{process.stdout.write("(marker unreadable)")}' "$MARKER")
  echo "[MCCP-INTENT-GATE-STOP] intent gate blocked (verdict=$MARKER_VERDICT, exit=$MARKER_EXIT)."
  echo "Reason: $MARKER_REASON"
  exit 1
fi
```

If that branch fired, print the **5.4a** recovery block using the `verdict` and
`reason` it echoed, and end the response. Do not continue to 5.6b.

### 5.6b — Verify the review record the mode produced

```bash
# v1.23.1 M1 — every review value below is re-derived from the 5.2 artifacts.
# Shell state does not survive between fenced blocks, so reading $REVIEW_VERDICT
# here would silently find it empty and seal a receipt with NO approval record
# while printing success (§3.9: gate conditions must be shell-state independent).
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
REVIEW_MODE=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).mode)}catch{process.stdout.write("codex")}' "$REVIEW_DIR/mode.json")

# Step A: verify the review record the mode actually produces.
#   codex path  → 5.3 injected the Codex section into the plan.
#   panel modes → the plan is FROZEN (no injection ever happens); what must exist
#                 is a readable decision. Demanding the Codex heading here would
#                 stop the default mode outright, or invite an invented section
#                 claiming a Codex review that never ran.
if [ "$REVIEW_MODE" = "codex" ]; then
  grep -q "^## Codex Adversarial Review$" <plan path> || {
    echo "[MCCP-GATE-STOP] plan에 Codex 섹션 주입 실패. Phase 5.3 재시도 필요."
    exit 1
  }
  # The heading on its own proves nothing: Phase 5.1 appended it TOGETHER WITH the
  # placeholder, so the check above passes even when 5.3 never replaced the body —
  # and the command would hand off an approved receipt for a plan carrying no review
  # record at all. `if` rather than `grep … && { … }` so a non-match cannot trip
  # `set -e` on the way past.
  #
  # This lives INSIDE the codex branch on purpose. 5.1 appends the placeholder for
  # every mode, but only 5.3 replaces it and 5.3 is codex-only (the panel path keeps
  # the plan frozen). Left at top level — where the origin/main merge put it — it
  # would fire unconditionally on the default mode and HALT every panel run, or
  # push the operator into inventing a Codex section that no Codex ever wrote.
  if grep -q "placeholder: will be replaced" <plan path>; then
    echo "[MCCP-GATE-STOP] Codex 섹션이 5.1의 placeholder 그대로입니다 — Phase 5.3이 triage 기록으로 교체하지 않았습니다."
    exit 1
  fi
else
  node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!j.review_verdict)process.exit(1)' \
    "$REVIEW_DIR/decision.json" || {
    echo "[MCCP-GATE-STOP] review decision 아티팩트 부재/불량 — Phase 5.2e 재실행 필요."
    exit 1
  }
fi

# Step B: derive the decision slug deterministically (must match what the hook computes).
DECISION_SLUG=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js derive-decision \
  --command mccp:plan \
  --args "$ARGUMENTS")

# codex-intent-context M1 × diverse-agent-review M1 — WHO WRITES THE RECEIPT
# depends on the mode, and only one writer may exist per receipt:
#   mode=codex  → plan-codex-runner.js already wrote it (5.2z). The intent decision
#                 travels in-process and has NO CLI surface, so a `cli.js write`
#                 here fails closed with INTENT_GATE_BLOCKED — and if it somehow
#                 succeeded it would be a SECOND writer for an existing receipt.
#   panel modes → Codex never ran, so there is no runner and no in-process intent
#                 decision to carry. This block writes the receipt, and write.js
#                 stamps intent_gate_verdict='skipped' / skip_proof='codex_not_invoked'
#                 from the mechanical evidence in the receipt itself (review_source).
# End the block on the codex path; 5.7 reads the runner's receipt back either way.
if [ "$REVIEW_MODE" = "codex" ]; then
  echo "[mccp:plan-review] mode=codex — receipt was written by plan-codex-runner.js (5.2z). 5.6b writes nothing."
  exit 0
fi

# Step C: auto-write the mccp-plan-codex receipt.
# v1.3.0 M1 — forward silent-skip flags when Phase 5.0 detected SKILL_AVAIL=1
# + SIGNAL=0. plan-codex validator emits silent_skip as informational warning;
# M2 will promote strict gates to blocking after SKILL first-step is wired.
# Schema mutex: silent_skip + force_override cannot coexist, so we suppress
# silent_skip forward when IMPECCABLE_FORCE_OVERRIDE_REASON is set. Bash array
# form avoids eval and keeps quoting around reasons safe.
# review-record-linkage M3 — the plan path is read from the ONE artifact 5.2 wrote,
# never re-typed. Shell state does not cross a fenced block, and a literal retyped
# per call site drifts within a single run (§5.2 invariant (i)). This value is one
# end of the M3 path anchor: `/mccp:pr` matches its ship plan path against the
# `meta.plan_path` this write derives from it, so a second transcription here would
# be a second identity. This does NOT mechanize where the path came from — the
# author still typed it once, at 5.2 (R15) — it makes one run self-consistent.
PLAN_PATH_FILE="$REVIEW_DIR/plan-path"
PLAN_PATH=$(cat "$PLAN_PATH_FILE" 2>/dev/null || printf '')
if [ -z "$PLAN_PATH" ]; then
  echo "[MCCP-GATE-STOP] $PLAN_PATH_FILE is missing or empty — 5.2 did not record the plan path, so this receipt cannot seal a plan identity. Re-run Phase 5.2."
  exit 12
fi
# Emptiness is not the failure that actually happens here. 5.2 writes the literal
# `<plan path>` when the substitution is skipped, and that value is NON-empty — it
# sails past the check above and dies later inside `write.js` as an opaque ENOENT
# from `planAwareMarkdownHash`, with the recovery text above never printed. So test
# for the file, exactly as `pr.md` 2.5.7 does for `SHIP_PLAN_PATH`; the two gates
# now fail the same way on the same class of mistake.
if [ ! -f "$PLAN_PATH" ]; then
  echo "[MCCP-GATE-STOP] the recorded plan path does not resolve: $PLAN_PATH"
  echo "  5.2 records this value verbatim, so an unsubstituted \`<plan path>\` placeholder lands here intact."
  echo "  The receipt write hashes this file, so a missing path is an ENOENT throw."
  echo "  Recovery: re-run Phase 5.2 with the real repo-relative plan path."
  exit 12
fi

WRITE_FLAGS=(
  write
  --gate mccp-plan-codex
  --decision "$DECISION_SLUG"
  --plan "$PLAN_PATH"
)
# M3 — carry the panel record's path onto the receipt (receipt -> review). The path
# is NOT reassembled as a shell string: `record.js#reviewRecordPath` owns that
# filename because `sanitizeSlug` (record.js:69-77) may rewrite the slug, and a
# hand-interpolated `.claude/reviews/plan-review-$DECISION_SLUG.md` would then seal
# a path pointing at a DIFFERENT file than the one on disk — a dangling link that
# still passes the shape check and gets counted as "linked". Carry, do not derive.
# mode=codex already exited above, so this branch is panel-only by construction.
REVIEW_RECORD_PATH=$(node -e '
  const r = require(process.argv[1] + "/scripts/lib/plan-review/record");
  process.stdout.write(r.reviewRecordPath(process.argv[2]));
' "${CLAUDE_PLUGIN_ROOT}" "$DECISION_SLUG" 2>/dev/null || printf '')
if [ -n "$REVIEW_RECORD_PATH" ] && [ -f "$REVIEW_RECORD_PATH" ]; then
  WRITE_FLAGS+=(--review-record-path "$REVIEW_RECORD_PATH")
else
  echo "[mccp:linkage] no review record at ${REVIEW_RECORD_PATH:-<unresolved>} — sealing NO link. The audit reports this ship as unlinked rather than pointing at a file that is not there." 1>&2
fi
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
# v1.23.1 M1 — in a review-panel mode the ONLY authority on whether a codex
# verdict may be forwarded is decideReview's forwardCodexVerdict boolean, read
# verbatim at 5.2e. Do NOT reconstruct it here from mode + L3 result. Unset (the
# codex path, which never runs 5.2e) defaults to 1 so the legacy behaviour is
# byte-identical.
REVIEW_VERDICT=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).review_verdict||"")}catch{process.stdout.write("")}' "$REVIEW_DIR/decision.json")
REVIEW_SOURCE=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).review_source||"")}catch{process.stdout.write("")}' "$REVIEW_DIR/decision.json")
# Absent decision artifact = the codex path, which never ran 5.2e → default 1 so
# legacy behaviour is byte-identical. On a panel path the artifact exists (Step A
# just proved it), so this reads the oracle's answer, never a shell reconstruction.
FORWARD_CODEX=$(node -e 'const fs=require("fs");try{process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).forwardCodexVerdict?"1":"0")}catch{process.stdout.write("1")}' "$REVIEW_DIR/decision.json")
# santa-loop R2 — read the verdict from the artifact 5.2z persisted. It was set in
# an earlier fenced block, so `${CODEX_VERDICT:-}` alone is empty here and the flag
# was silently dropped: a receipt that recorded NO Codex verdict on a run where
# Codex actually spoke. Cross-gate dedupe fail-closes on the absence, so nothing
# unsafe shipped — but the audit record was false, and this is the very path
# MCCP_PLAN_REVIEW=codex exists to fall back to.
#
# santa-loop R6 — the artifact is the ONLY carrier. The shell fallback that used to sit here read
# `${CODEX_VERDICT:-}`, which is always empty in this block — 5.2z ran behind a
# fence — so it could never fire. A safety net that cannot catch anything is worse
# than none: it reads as a second line of defence that does not exist. 5.2z now
# fails closed (exit 12) if the artifact cannot be written or does not read back,
# so an empty value here means Codex genuinely produced no verdict.
#
# M3 (L3-Codex R1 F1, high) — on the HYBRID path the verdict comes out of
# `l3.json`, not out of the bridge file. The four L3 artifacts carry fixed names
# and are renamed independently, so two overlapping runs can interleave as
# A:codex-verdict → B:codex-verdict → A:l3.json. A's poll then accepts l3.json on
# a matching nonce while this line reads B's bridge file, and the receipt seals a
# verdict from a review of someone else's plan.
#
# So this block RE-VERIFIES the nonce; it does not inherit the poll's check. An
# earlier revision said reading the same record the poll accepted made the two
# "agree by construction" — that is true within one run and false as stated,
# because the poll is an earlier fenced block and l3.json's name is fixed, so a
# third overlapping run can replace the record in between. Checking it here costs
# one comparison and makes the sentence true. A missing or mismatched nonce yields
# an empty verdict, which drops --codex-verdict: fail-closed, and cross-gate
# dedupe stays shut.
#
# The codex path is deliberately untouched (DD5): there 5.2z is the only producer,
# there is no l3.json, and rerouting it would pull `mode=codex` into this
# milestone's blast radius for no gain.
if [ "$REVIEW_SOURCE" = "hybrid" ]; then
  L3_NONCE_EXPECT=$(cat "$REVIEW_DIR/l3-run-nonce" 2>/dev/null || printf '')
  CODEX_VERDICT_EFF=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const want=process.argv[2]||"";process.stdout.write(want!==""&&String(j.run_nonce||"")===want&&j.invoked===true&&typeof j.verdict==="string"?j.verdict:"")}catch{process.stdout.write("")}' "$REVIEW_DIR/l3.json" "$L3_NONCE_EXPECT")
else
  CODEX_VERDICT_EFF=$(cat "$REVIEW_DIR/codex-verdict" 2>/dev/null || printf '')
fi
if [ "$FORWARD_CODEX" = "1" ] && [ -n "$CODEX_VERDICT_EFF" ]; then
  WRITE_FLAGS+=(--codex-verdict "$CODEX_VERDICT_EFF")
fi
# v1.23.1 M1 — review_* triple. All three or none (DD11): write.js exits 12 on a
# partial supply, so there is deliberately no branch here that forwards a subset.
# A panel mode that reaches this point WITH a verdict but WITHOUT a proof file is
# a non-converged decision; the flags stay off and the receipt records no approval,
# which is correct — but 5.2e already HALTed on those, so it should not occur.
if [ -n "$REVIEW_VERDICT" ] && [ -n "$REVIEW_SOURCE" ] \
   && [ -f "$REVIEW_DIR/proof.json" ]; then
  WRITE_FLAGS+=(--review-verdict "$REVIEW_VERDICT"
                --review-source "$REVIEW_SOURCE"
                --review-proof-file "$REVIEW_DIR/proof.json")
fi
# santa-loop R3 — declare the mode so write.js can refuse a panel receipt that
# carries no approval record. The all-or-nothing guard above prevents a PARTIAL
# stamp by forwarding NOTHING, and a receipt with neither axis inherits
# `resolution.converged: true` from write.js's defaults — so a panel run that
# certified nothing would read as converged. Re-derived from mode.json, which is
# written at Phase 5.2 entry and is therefore still trustworthy when the decision
# artifact is not.
REVIEW_MODE_EFF=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).mode||"")}catch{process.stdout.write("")}' "$REVIEW_DIR/mode.json")
# An unreadable mode.json HALTS. It is written at Phase 5.2 entry for EVERY mode,
# so by receipt-write time its absence means something is broken — and the failure
# is not benign. Dropping the flag on a read error disarms BOTH guards at once:
# write.js only demands the triple when --review-mode names a panel, and the HALT
# below only fires when the mode is known. A panel run would then seal a receipt
# with no verdict axis, which resolveEffectiveVerdict answers axis:'none' for and
# receipt-convergence reads as `resolution.converged === true`. An earlier note
# called this guard's limit "a caller that forgets the flag"; in fact the command
# dropped it itself on any read failure (santa-loop R6, Codex GPT-5.4).
if [ -z "$REVIEW_MODE_EFF" ]; then
  echo "[MCCP-GATE-STOP] $REVIEW_DIR/mode.json is missing or unreadable at receipt-write time. It is created at Phase 5.2 entry, so this is not a first-run condition. Without the mode neither the write-side triple requirement nor the HALT below can fire, and a panel receipt carrying no approval record reads as CONVERGED. Re-run Phase 5.2."
  exit 12
fi
WRITE_FLAGS+=(--review-mode "$REVIEW_MODE_EFF")
# Defence in depth: HALT here too. write.js is the mechanism (it cannot be
# forgotten by an LLM), but stopping before the call gives the operator the
# actionable message instead of a stack trace.
if { [ "$REVIEW_MODE_EFF" = "multi-agent" ] || [ "$REVIEW_MODE_EFF" = "hybrid" ]; } \
   && { [ -z "$REVIEW_VERDICT" ] || [ -z "$REVIEW_SOURCE" ] || [ ! -f "$REVIEW_DIR/proof.json" ]; }; then
  echo "[MCCP-GATE-STOP] mode=$REVIEW_MODE_EFF but the review triple is incomplete (verdict='$REVIEW_VERDICT' source='$REVIEW_SOURCE' proof=$([ -f "$REVIEW_DIR/proof.json" ] && echo present || echo absent))."
  echo "A panel receipt with no approval record would read as CONVERGED. Re-run 5.2c-5.2e; do not write a receipt for a review whose outcome is unknown."
  exit 12
fi
# review-loop-bypass M1 — the single-pass audit stamp. Read from decision.json,
# never re-derived from env: the env says the toggle was SET, `single_pass_reason`
# says the relaxation was APPLIED, and only the second one may claim a bypass.
# `decide` puts the key on the relaxed decision alone (mk() has no null twin), so
# its presence is the signal.
#
# The two flags go together or not at all. Forwarding one without the other is
# not a quiet audit gap — schema.js's bidirectional invariant rejects it and the
# receipt is not written, which is the loud failure we want here.
#
# Tested for a non-empty VALUE rather than key presence, matching the `[ -n … ]`
# idiom used throughout this block. Both readings agree today; keeping the shell
# on the value side removes any chance of the two layers drifting apart.
#
# The valueless flag goes FIRST. `parseFlags` reads `--foo` as boolean `true` only
# when the next argv element starts with `--`; otherwise it consumes that element
# as the flag's value and `write.js`'s `=== true` test then silently declines to
# stamp. Ordering the pair this way makes the boolean's neighbour a `--` flag
# inside the pair itself, so the append is correct wherever it lands in
# WRITE_FLAGS rather than by luck of what a later block happens to append.
SINGLE_PASS_REASON=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).single_pass_reason||""))}catch{process.stdout.write("")}' "$REVIEW_DIR/decision.json")
if [ -n "$SINGLE_PASS_REASON" ]; then
  WRITE_FLAGS+=(--review-single-pass-bypassed-verdict
                --review-single-pass-reason "$SINGLE_PASS_REASON")
fi
# L3 instrumentation + gate wall-clock (Acceptance: the ≤10-minute target is
# measured, not asserted). 5.2a wrote started-at as a FILE for exactly this hop.
if [ "$REVIEW_SOURCE" = "hybrid" ]; then
  WRITE_FLAGS+=(--review-l3-invoked)
  # …and WHY it reached that verdict. `write.js` has accepted --review-l3-reason
  # since the field was introduced; nothing ever passed it, so every hybrid
  # receipt recorded that L3 fired and nothing about what it saw — the boolean
  # alone cannot distinguish a structured `approve` from a free-text fallback.
  # `l3.json.reason` carries exactly that (`classification=ok verdict-source=…`).
  #
  # A hybrid decision can only exist when L3 actually ran, so the file is present
  # here by construction. Guarded on a non-empty VALUE anyway, because
  # schema.js:1007 rejects an empty string and would fail the whole write over a
  # missing annotation — the flag is dropped rather than the receipt lost.
  #
  # Same nonce re-verification as the verdict read above, and for the same reason:
  # a reason lifted from another run's record annotates this receipt with an
  # explanation of a review that was not this one. An audit field is not worth
  # less scrutiny than the verdict it explains.
  REVIEW_L3_REASON=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const want=process.argv[2]||"";process.stdout.write(want!==""&&String(j.run_nonce||"")===want?String(j.reason||""):"")}catch{process.stdout.write("")}' "$REVIEW_DIR/l3.json" "$L3_NONCE_EXPECT")
  if [ -n "$REVIEW_L3_REASON" ]; then
    WRITE_FLAGS+=(--review-l3-reason "$REVIEW_L3_REASON")
  fi
fi
if [ -f "$REVIEW_DIR/started-at" ]; then
  WRITE_FLAGS+=(--review-wall-clock-ms "$(( $(date +%s%3N) - $(cat "$REVIEW_DIR/started-at") ))")
fi
WRITE_FLAGS+=(--quiet)
node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" "${WRITE_FLAGS[@]}"
```

> **On `mode=codex` the receipt is NOT written here (codex-intent-context M1).**
> `cli.js write --gate mccp-plan-codex` cannot satisfy that path: the intent decision
> is programmatic-only, so a hand-written receipt fails closed with an actionable
> `INTENT_GATE_BLOCKED` error. `plan-codex-runner.js` performed the review, held the
> payload in memory, consumed your adjudication, and wrote the receipt itself —
> including `--codex-verdict` and every impeccable/design-critique audit flag, which
> Phase 5.2 forwarded to it. If you find yourself reaching for `cli.js write` on that
> path, the correct move is to re-run `/mccp:plan`, or set
> `MCCP_SKIP_INTENT_GATE="<substantive reason>"` for an audited override.
>
> **On the panel paths the write above IS the receipt write, and it is legitimate.**
> No runner exists there because Codex was never invoked, so there is no in-process
> intent decision to carry and nothing for a CLI flag to forge. `write.js` derives the
> intent axis itself from evidence already sealed in the receipt — `review_source`
> naming a panel is mechanical proof that Codex did not speak — and stamps
> `intent_gate_verdict='skipped'` with `intent_skip_proof='codex_not_invoked'`, exactly
> as it already does for a free-form plan (DD1). Cross-gate dedupe is unaffected: DD2
> already refuses a panel receipt as cross-model corroboration, so a PR-Codex run still
> fires at the ship point regardless of this intent stamp.

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
review: <review_verdict> via <review_source> (<wall-clock>s) — .claude/reviews/plan-review-<slug>.md
Next: /mccp:prp-implement <plan path>
```

The `review:` line is printed only when the review panel actually issued the
verdict (`review_verdict` present in `decision.json` — i.e. not the `codex` path). When
`review_source` is `multi-agent`, add one line so the operator is not surprised
later at the ship gate:

```
note: multi-agent approval does not satisfy cross-gate dedupe — PR-Codex will run at /mccp:pr (DD2).
```

If exit code is non-zero: do NOT print the handoff. Output the validate stderr and end the response — let the user inspect via `node ${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js status`.

### Forbidden during Phase 5

- "Codex 호출 진행할까요?" / "shall I invoke Codex?"
- "receipt 직접 작성해주세요" / "receipt를 만드는 커맨드를 터미널에 입력해주세요"
- "/mccp:prp-implement 직접 실행해주세요" / "다음 단계는 사용자가 직접 진행"
- 단계 사이 yes/no/proceed/confirm 컨펌 요청 (5.5 CRITICAL stop만 예외)
