---
description: "Single-entry orchestrator — PRD→plan→implement→PR (trivial path auto-branch)"
argument-hint: "<feature description | path/to/*.prd.md> [--full] [--trivial]"
allowed-tools: Bash(node:*), Bash(git:*), Task, Workflow, Skill(mccp:plan-prd), Skill(mccp:plan), Skill(mccp:prp-implement), Skill(mccp:prp-commit), Skill(mccp:pr)
---

# /mccp:work — single-entry chain orchestration (v0.3.1)

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

Routes a single user input through the full mccp pipeline:

- **trivial path** (simple doc/config edit) → `/mccp:prp-commit` → `/mccp:pr`
- **full chain** (new feature / architectural change) → `/mccp:plan-prd` → `/mccp:plan` → `/mccp:prp-implement` → `/mccp:prp-commit` → `/mccp:pr`

v1.20.2 M1부터 full chain의 **implement 스텝은 격리된 단일 worker로 위임**된다(최대 컨텍스트 누적원 격리, 메인은 요약만 회수). v1.20.7 M2a부터 위임 채널은 3-state(인라인 / Task-격리 / Workflow-격리)이고, 회수 판정은 반환값 ∧ envelope ∧ receipt-store 3자 reconciliation으로 통일된다. kill switch: `MCCP_WORK_ISOLATE_IMPLEMENT=0`(인라인 fallback) · `MCCP_WORK_IMPLEMENT_WORKFLOW=1`(Workflow 경로 opt-in) — Step 3 참조.

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
GITDIR=$(git rev-parse --git-path mccp/tmp)   # worktree-safe (§3.8 — .git는 worktree에서 파일)
mkdir -p "$GITDIR"

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
  $FORCE_TRIVIAL $FORCE_FULL 2> "$GITDIR/work-classify.stderr")
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

### Step 3 — `/mccp:prp-implement` (격리 위임, v1.20.2 M1 · Workflow 이전 v1.20.7 M2a)

v1.20.2 M1부터 implement 스텝은 **격리된 단일 worker 위임**으로 실행된다. worker가 파일 탐색·edit·validate 루프·Implement-Codex 게이트·receipt write를 자기 컨텍스트에서 수행하고, 메인(controller) 세션은 요약(변경 파일·receipt path·verdict)만 회수한다 — implement 스텝의 최대 컨텍스트 누적원을 격리해 메인 피크를 얇게 유지한다. 메커니즘은 신규 발명이 아니라 dispatch-controller substrate(`prepareDispatch`/envelope schema/3-flag attribution)를 single-worker로 재사용한다. v1.20.7 M2a는 위임 채널을 `Task`에서 `Workflow` primitive의 `agent()`로 등가 이전할 수 있게 하되(병렬화 전), 회수 판정을 반환값 ∧ envelope ∧ receipt-store **3자 reconciliation**(`deriveVerdict`)으로 통일한다.

**3축 kill switch (인라인 / Task-격리 / Workflow-단일-격리 / Workflow-N-병렬)**:

- `MCCP_WORK_ISOLATE_IMPLEMENT` (default `1`) — 최상위 축. `0`이면 Step 3.F 인라인 `Skill(mccp:prp-implement)` fallback(loud stderr). 미지정/오타 시 격리(보수적 default = 격리 on).
- `MCCP_WORK_IMPLEMENT_WORKFLOW` (default `0`) — 격리 활성 시 하위 축. `=1` AND prepare 성공 AND `Workflow` tool 가용이면 **Workflow 경로**(Step 3.W 단일 / Step 3.WP 병렬), 그 외(`0`/미설정/오타/tool 미가용)면 **Step 3.I**(기존 Task dispatch). fail-open — Workflow 미가용이 implement를 절대 막지 않는다. **Codex F1**: Task fallback은 Workflow 호출을 **개시하기 전**에만 허용된다(개시 후 회수 실패는 두 번째 경쟁 worker를 막기 위해 fail-closed HALT).
- `MCCP_WORK_IMPLEMENT_PARALLEL` (default **on** since v1.22.1 M1 — `off`/`0`로 opt-out) — Workflow 경로의 최하위 축. opt-out 안 함 AND partition oracle이 N>1개 서로소 partition을 산출 AND `resolveFleet`이 run=true(merge_strategy·budget·catastrophic-USD 통과)이면 **Step 3.WP**(N-worker `parallel`), 그 외는 **Step 3.W**(단일 worker). **v1.22.3 M3 — operational USD는 더 이상 발화를 막지 않는다**: sticky critical/`hard_ceiling`($100)에서도 발화하며, 차단은 catastrophic-USD(`MCCP_ORCHESTRATION_CATASTROPHIC_USD`, default $500) + 원자 runaway-cap(`MCCP_ORCHESTRATION_MAX_AGENTS`, default 24, 전 run 경로) + per-worker budget이 담당한다. `MCCP_ORCHESTRATION_USD_BOMB=1`로 M1 USD 차단 복원. **구조적 gate — merge_strategy**: `MCCP_WORK_MERGE_STRATEGY`(v1.21.0 M4부터 default `worktree-merge` — Task 0 run wf_1f689994-fb8이 live 상관 입증)가 `worktree-merge`가 **아니면** `resolveFleet`이 무조건 N=1로 fail-close한다. M3(v1.22.3) 이후 병렬 실제 발화 조건은 **opt-out 안 함 + merge_strategy=worktree-merge + N>1 partition + catastrophic-USD 미도달**이다 — cost-state green 요구는 **폐기**(operational tier autoDisable default empty). `MCCP_WORK_MERGE_STRATEGY=disable-parallel` 명시 시 M2a 단일 동작으로 back-compat 강등. same-worktree fallback(A2)은 atomic-merge 보호 실장 전까지 여전히 금지.
- `MCCP_WORK_MERGED_VERIFY` (default `enforce`, v1.20.12 M3) — 위 3축과 **직교(⊥)**. implement가 끝난 뒤(어떤 경로든) **commit 전** 통합 diff를 worker 밖에서 1회 cross-model(Codex) adversarial verify하는 **Step 3.verify** 스테이지를 지배한다. `enforce`=divergent/critical/unavailable HALT · `warn`=advisory pass · `off`=skipped. **단일 경로에서도 발화**하므로(DD6) 병렬이 gated여도 M3 verify-네이티브화가 runtime 가치를 갖는다.

**Pre-flight (기존 `next-step` HALT 보존)** — 격리 여부와 무관하게 먼저 실행:

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

> **Shell-state 독립 계약**: 아래 Bash 블록들은 **서로 다른 Bash 호출**(각각 fresh shell — env var 비지속)이고, 사이에 LLM dispatch(`Task` 또는 `Workflow`)가 낀다. 따라서 blocks 간 상태를 shell var로 넘기지 **않고** `dispatch-*.json` 아티팩트로 self-derive한다(prp-implement.md self-derive 관행 mirror). 모든 tmp 경로는 **worktree-safe** `git rev-parse --git-path mccp/tmp`(§3.9 — `.git/` hardcode 금지, worktree에서 `.git`은 파일이라 `mkdir -p .git/...`가 깨진다). prepare 아티팩트 존재 = 격리 경로 활성; 부재 = 인라인 fallback.

#### Step 3.prep-parallel — N-worker partition prep (v1.20.8 M2b, opt-in, merge_strategy-gated)

`MCCP_WORK_IMPLEMENT_PARALLEL=1` opt-in일 때만 실행하며, **구조적으로 `MCCP_WORK_MERGE_STRATEGY=worktree-merge`가 아니면 즉시 no-op**한다(Task 0 spike가 `disable-parallel`을 실측 → default no-op). partition oracle(`partitionFromPlanText`)로 plan을 서로소 file-set으로 쪼개고 `resolveFleet`이 merge_strategy·cost-state·budget을 판정해 N을 확정한다. `run=true` & N>1일 때만 `dispatch-fleet-args.json`을 쓴다 — 이 아티팩트 존재가 Step 3.route의 병렬 경로 선택 신호다. 아티팩트가 없으면(default) Step 3.prep이 단일 worker(M2a)를 준비한다.

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
mkdir -p "$GITDIR"
rm -f "$GITDIR/dispatch-fleet-args.json" "$GITDIR/dispatch-partitions.json" \
      "$GITDIR/dispatch-fleet-prepare.json" "$GITDIR/dispatch-cap-denied.json"   # clear stale
# M3 follow-up (R1 F1) — the reservation token's stale-clear lives HERE and ONLY
# here: immediately before a new reservation is created. It must NEVER be added to
# Step 3.prep's rm -f list. Order is prep-parallel → prep → route, and route is the
# single reconcile point, so clearing it in prep would delete the token we just
# minted before it could ever be reconciled — leaving the phantom this whole axis
# exists to remove.
rm -f "$GITDIR/dispatch-fleet-reservation.json"
rm -rf "$GITDIR/dispatch-fleet-results"
ISOLATE="${MCCP_WORK_ISOLATE_IMPLEMENT:-1}"
# live-activation M1 — DEFAULT FIRING FLIPPED to on (opt-out). Mirror of
# budget.js#parseParallelMode (default on; 'off'/'0' opts out). The single opt-out
# axis is THIS env: PARALLEL=off/0 restores the single-worker Task (legacy) path
# exactly (Codex F1 — MCCP_WORK_IMPLEMENT_WORKFLOW default is NOT flipped, so a
# parallel opt-out never strands you on an unfamiliar Workflow single leg).
PARALLEL="${MCCP_WORK_IMPLEMENT_PARALLEL:-1}"
# M4 default flip — Task 0 (run wf_1f689994-fb8) PROVED the live worktree↔dispatchId
# correlation (worktrees persist + controller-enumerable + worker-seeded envelopes
# correlate), so worktree-merge is now the default. M3 then retired the OPERATIONAL
# USD block (a present sticky $186 critical / hard_ceiling was skipping every
# dispatch, which is exactly the shelf-ware the PRD exists to fix). The cost guard
# is now: PARALLEL opt-OUT (default on) · cost-state fail-OPEN by default
# (MCCP_ORCHESTRATION_COST_FAIL_OPEN=0 to restore fail-closed) · NO operational-tier
# autoDisable (MCCP_ORCHESTRATION_USD_BOMB=1 restores it) · catastrophic-USD ceiling
# (MCCP_ORCHESTRATION_CATASTROPHIC_USD, default $500) as the replacement bomb
# detector · the ATOMIC cost-state-independent session runaway cap on EVERY run path.
MERGE_STRATEGY="${MCCP_WORK_MERGE_STRATEGY:-worktree-merge}"
FLEET_N=0
# live-activation M1 — opt-OUT gate (default on). Normalize then treat only 'off'/'0'
# as opt-out; resolveFleet#parseParallelMode is the SoT that re-checks.
PARALLEL_LC=$(printf '%s' "$PARALLEL" | tr '[:upper:]' '[:lower:]' | tr -d ' ')
if [ "$ISOLATE" != "0" ] && [ "$PARALLEL_LC" != "0" ] && [ "$PARALLEL_LC" != "off" ] && [ "$MERGE_STRATEGY" = "worktree-merge" ]; then
  MAXW="${MCCP_WORK_PARALLEL_MAX:-4}"
  # (a) derive disjoint partitions from the plan (pure partitionFromPlanText).
  node -e '
    const fs=require("fs");
    const p=require(process.argv[1]+"/scripts/lib/implement-dispatch/partition");
    const text=fs.readFileSync(process.argv[2],"utf8");
    process.stdout.write(JSON.stringify(p.partitionFromPlanText(text, parseInt(process.argv[3],10)||4)));
  ' "$CLAUDE_PLUGIN_ROOT" "$PLAN_PATH" "$MAXW" > "$GITDIR/dispatch-partitions.json" 2>"$GITDIR/dispatch-partitions.stderr" \
    || { echo "[mccp:work] partition derive 실패 — 단일 경로" 1>&2; rm -f "$GITDIR/dispatch-partitions.json"; }
  if [ -f "$GITDIR/dispatch-partitions.json" ]; then
    REQ_N=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).n||1))}catch{process.stdout.write("1")}' "$GITDIR/dispatch-partitions.json")
    # (b) resolveFleet — merge_strategy + cost-state + budget → run/N/minRemaining.
    FLEET=$(node -e '
      const b=require(process.argv[1]+"/scripts/lib/implement-dispatch/budget");
      const cs=require(process.argv[1]+"/scripts/lib/cost-state");
      const sub=require(process.argv[1]+"/scripts/lib/subscription");
      const ctx=require(process.argv[1]+"/scripts/lib/context-state");
      const runaway=require(process.argv[1]+"/scripts/lib/orchestration-runaway");
      // live-activation M1 — cost fail-open (default true) + cost-state-independent
      // runaway backstop. =0 restores the old fail-closed COST_STATE_UNKNOWN skip.
      const costFailOpen=String(process.env.MCCP_ORCHESTRATION_COST_FAIL_OPEN||"").trim()!=="0";
      // live-activation M3 — operational USD ($50/$80/$100 + hard_ceiling) no longer
      // blocks firing; usdBomb restores that M1 block, catastrophicUsd is the
      // replacement bomb detector far above it (Codex F1/F4).
      const usdBomb=runaway.parseUsdBomb(process.env);
      const catastrophicUsd=runaway.parseCatastrophicUsd(process.env);
      const sessionId=process.env.CLAUDE_SESSION_ID||"unknown";
      // M3 follow-up (R1 F2) — capture the reservation id out of the closure. The
      // oracle signature stays pure/injected (it still only sees {n,degraded,reason});
      // the id rides alongside in the emitted JSON so Step 3.route can reconcile the
      // reservation against the number of workers that ACTUALLY launched.
      let reservationId=null;
      const r=b.resolveFleet({ env:process.env, mergeStrategy:process.argv[2],
        requestedN:parseInt(process.argv[3],10)||1, costStateRead:cs.readState, tierFor:cs.tierFor,
        costFailOpen:costFailOpen, usdBomb:usdBomb, catastrophicUsd:catastrophicUsd,
        // M3 Codex F2 — ATOMIC reserve replaces read-then-bump. It decides the grant
        // AND counts it inside ONE lock critical section, so concurrent / re-entrant
        // dispatches can no longer each read the same pre-bump value and overshoot
        // the cap. It only runs on a RUN path, and it ALREADY counted the grant —
        // there is deliberately no bumpCounter afterwards.
        //
        // M3 follow-up (R1 F2): the grant is now PENDING, not a permanent spend.
        // Step 3.route commits it to the real launch count (or releases it).
        runawayClamp:function(n){ const res=runaway.reserveWorkers({ sessionId:sessionId, requestedN:n, env:process.env });
          reservationId=res.reservationId;
          return { n:res.granted, degraded:res.degraded, reason:res.reason }; },
        subscriptionMode:sub.isSubscriptionMode(process.env), contextStateRead:ctx.readState });
      process.stdout.write(JSON.stringify(Object.assign({}, r, { reservationId: reservationId })));
    ' "$CLAUDE_PLUGIN_ROOT" "$MERGE_STRATEGY" "$REQ_N")
    # Persist the reservation token so Step 3.route can reconcile it. Written only
    # when reserveWorkers actually ran (a skip path never reserves, so there is
    # nothing to reconcile and no phantom to clean up).
    echo "$FLEET" | node -e '
      const fs=require("fs");
      let j={}; try{ j=JSON.parse(fs.readFileSync(0,"utf8")); }catch(_){}
      if (j && typeof j.reservationId==="string" && j.reservationId)
        fs.writeFileSync(process.argv[1], JSON.stringify({ reservation_id:j.reservationId, granted:j.n||1 }));
    ' "$GITDIR/dispatch-fleet-reservation.json"
    # M3 follow-up (PR-Codex R1 F1) — the reserve granted 0: the counter lock was
    # unavailable, so NOTHING launched from here can be recorded. Mark it as an
    # ARTIFACT (Step 3.route is a separate Bash invocation — a shell var would not
    # survive, and the gate would silently no-op). route then forces `inline`, the
    # only path that spawns no agent, keeping the cap's invariant exact. Note this
    # fires only when the reserve was actually ATTEMPTED: every earlier skip
    # (env-off / single-partition / merge-strategy) returns before the clamp runs,
    # so their single-worker routes are unaffected.
    if [ "$(echo "$FLEET" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).reason||"")}catch{process.stdout.write("")}')" = "lock-exhausted" ]; then
      echo '{"reason":"lock-exhausted"}' > "$GITDIR/dispatch-cap-denied.json"
      echo "[mccp:work] runaway counter lock 고갈 — 예약 불가(granted 0). 기록되지 않는 launch를 막기 위해 인라인 implement로 강등한다(에이전트 0개, cap 미소비)." 1>&2
    fi
    RUN=$(echo "$FLEET" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).run?"1":"0")}catch{process.stdout.write("0")}')
    FLEET_N=$(echo "$FLEET" | node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).n||1))}catch{process.stdout.write("1")}')
    MINREM=$(echo "$FLEET" | node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).minRemaining||0))}catch{process.stdout.write("0")}')
    if [ "$RUN" = "1" ] && [ "$FLEET_N" -gt 1 ]; then
      CONTROLLER_SESSION="${CLAUDE_SESSION_ID:-$(node -e 'console.log(crypto.randomUUID())')}"
      node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" prepare-fleet \
        --plan "$PLAN_PATH" --controller-session "$CONTROLLER_SESSION" \
        --partitions-file "$GITDIR/dispatch-partitions.json" --subagent general-purpose \
        > "$GITDIR/dispatch-fleet-prepare.json" 2>"$GITDIR/dispatch-fleet-prepare.stderr" \
        && node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" emit-workflow-args \
          --prepare-file "$GITDIR/dispatch-fleet-prepare.json" --min-remaining "$MINREM" \
          > "$GITDIR/dispatch-fleet-args.json" 2>"$GITDIR/dispatch-fleet-args.stderr" \
        || { echo "[mccp:work] fleet prepare/emit 실패 — 단일 경로 강등" 1>&2; rm -f "$GITDIR/dispatch-fleet-args.json"; FLEET_N=1; }
    else
      FLEET_N=1
    fi
  fi
fi
FLEET_REASON=$(echo "$FLEET" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).reason||"unknown")}catch{process.stdout.write("n/a")}' 2>/dev/null || echo "n/a")
if [ -f "$GITDIR/dispatch-fleet-args.json" ]; then
  echo "[mccp:work] parallel fleet 발화 (N=$FLEET_N granted, merge_strategy=$MERGE_STRATEGY, reason=$FLEET_REASON) — operational USD 비차단(M3); backstop = catastrophic-USD(\$${MCCP_ORCHESTRATION_CATASTROPHIC_USD:-500}) + 원자 runaway-cap(${MCCP_ORCHESTRATION_MAX_AGENTS:-24}) + per-worker budget. MCCP_WORK_IMPLEMENT_PARALLEL=off로 단일 경로 opt-out, MCCP_ORCHESTRATION_USD_BOMB=1로 M1 USD 차단 복원"
else
  echo "[mccp:work] parallel implement 비활성 (parallel=$PARALLEL merge_strategy=$MERGE_STRATEGY reason=$FLEET_REASON) — 단일 worker 경로 (default on; off로 opt-out했거나 N=1/merge-strategy/budget/catastrophic-USD/usd_bomb)" 1>&2
fi
```

#### Step 3.prep — prepare (단일 격리 경로, fleet 미준비 시, `MCCP_WORK_ISOLATE_IMPLEMENT` != 0)

fleet 아티팩트(`dispatch-fleet-args.json`)가 **없을 때만** 실행 — 병렬 준비가 성사됐으면 이 단계를 건너뛴다. placeholder envelope + self-contained worker prompt 생성 후, Workflow `args` + reconcile 입력(`expectedAnchor`)을 별도 아티팩트로 재-emit한다. `$PLAN_PATH`는 Step 2에서 확정한 plan 경로:

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
mkdir -p "$GITDIR"
rm -f "$GITDIR"/dispatch-prepare.json "$GITDIR"/dispatch-worker-prompt.txt \
      "$GITDIR"/dispatch-workflow-args.json "$GITDIR"/dispatch-workflow-started.json \
      "$GITDIR"/dispatch-workflow-return.json "$GITDIR"/dispatch-reconcile.json   # clear stale
ISOLATE="${MCCP_WORK_ISOLATE_IMPLEMENT:-1}"
if [ -f "$GITDIR/dispatch-fleet-args.json" ]; then
  echo "[mccp:work] fleet 준비 완료 — 단일 prepare-single 생략 (Step 3.WP 병렬 경로)" 1>&2
elif [ "$ISOLATE" != "0" ]; then
  CONTROLLER_SESSION="${CLAUDE_SESSION_ID:-$(node -e 'console.log(crypto.randomUUID())')}"
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" prepare-single \
    --plan "$PLAN_PATH" \
    --controller-session "$CONTROLLER_SESSION" \
    --subagent general-purpose \
    > "$GITDIR/dispatch-prepare.json" 2> "$GITDIR/dispatch-prepare.stderr"
  if [ "$?" != "0" ]; then
    echo "[mccp:work] prepare-single failed — falling back to inline implement" 1>&2
    rm -f "$GITDIR/dispatch-prepare.json"   # absence → inline fallback (3.F)
  else
    node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); require("fs").writeFileSync(process.argv[2], j.prompt); console.log("[mccp:work] implement isolated → dispatch="+j.dispatchId+" envelope="+j.ipcEnvelopePath)' \
      "$GITDIR/dispatch-prepare.json" "$GITDIR/dispatch-worker-prompt.txt"
    # emit Workflow args + reconcile inputs (expectedAnchor for F3). Failure here
    # degrades to the Task path only (Workflow needs args). The reconcile gate
    # still needs args for expectedAnchor, so a failed emit forces Task; the gate
    # REGENERATES args from prepare.json if this emit failed (both are pure
    # derivations of the same prepare emit), so a transient failure here never
    # strands a healthy Task worker as result-unreadable. Keep it loud.
    node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" emit-workflow-args \
      --prepare-file "$GITDIR/dispatch-prepare.json" \
      > "$GITDIR/dispatch-workflow-args.json" 2> "$GITDIR/dispatch-workflow-args.stderr" \
      || { echo "[mccp:work] emit-workflow-args failed — Workflow 경로 비활성(Task 경로 유지)" 1>&2; rm -f "$GITDIR/dispatch-workflow-args.json"; }
  fi
else
  echo "[mccp:work] MCCP_WORK_ISOLATE_IMPLEMENT=0 — implement 인라인 실행 (격리 비활성)" 1>&2
fi
```

#### Step 3.route — pre-invocation 경계 결정 (Codex F1/F3)

prepare 아티팩트 + env를 읽어 **worker를 spawn하기 전** 경로를 확정한다. 이 지점이 Task fallback을 허용하는 **유일한 안전 지점**이다(Codex F1 — Workflow 개시 후엔 fallback 금지). live-activation M1(Codex F3)부터 route 결정은 인라인 `[ ... ]` 트리가 아니라 **순수 오라클 `resolveWorkRoute`(단일 SoT, `route.test.js`가 env 조합 전수 검증)** 를 호출해 확정한다:

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
ISOLATE="${MCCP_WORK_ISOLATE_IMPLEMENT:-1}"
# WORKFLOW_AVAILABLE — the LLM sets this to 1 when the `Workflow` tool is present
# in THIS session, else 0. Bash cannot introspect tool availability; the model
# supplies this bit (default 1). It is the only non-artifact input the oracle needs.
WORKFLOW_AVAILABLE="${WORKFLOW_AVAILABLE:-1}"
ROUTE=$(node -e '
  const route=require(process.argv[1]+"/scripts/lib/implement-dispatch/route");
  const fs=require("fs");
  const has=function(p){ try{ fs.accessSync(p); return true; }catch(_){ return false; } };
  const gitdir=process.argv[2];
  process.stdout.write(route.resolveWorkRoute({
    env:process.env,
    isolate:process.argv[3]!=="0",
    hasFleetArgs:has(gitdir+"/dispatch-fleet-args.json"),
    hasPrepare:has(gitdir+"/dispatch-prepare.json"),
    hasWorkflowArgs:has(gitdir+"/dispatch-workflow-args.json"),
    workflowAvailable:process.argv[4]==="1",
    // R1 F1 — prep-parallel wrote this when the atomic reserve granted 0. Forces
    // inline: no agent, nothing to record, cap invariant intact.
    reserveDenied:has(gitdir+"/dispatch-cap-denied.json"),
  }));
' "$CLAUDE_PLUGIN_ROOT" "$GITDIR" "$ISOLATE" "$WORKFLOW_AVAILABLE")
echo "[mccp:work] Step 3 route=$ROUTE" 1>&2

# M3 follow-up (R1 F1 + F2) — THE single reconcile point for the fleet reservation.
#
# Step 3.prep-parallel reserved cap headroom while resolving the oracle, but the
# route decided here is the last word on how many workers actually launch. Placing
# the correction at this ONE boundary covers BOTH phantom paths (prepare-fleet
# failure → FLEET_N=1, and route falling back off the parallel leg) because route
# is evaluated after both and before any worker exists.
#
# actualN per route — a CORRECTION, not a blanket release (R1 F2): the degraded
# single-worker routes really do launch one worker, so releasing the whole
# reservation there would under-count a real launch (over-permissive).
#   workflow-parallel        → granted   (the fleet fires)
#   workflow-single / task   → 1         (one worker fires)
#   inline                   → 0         (nothing fires)
# Never fails the pipeline: the CLI always exits 0, and an un-reconciled
# reservation self-heals via the pending lease.
if [ -f "$GITDIR/dispatch-fleet-reservation.json" ]; then
  RES_ID=$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).reservation_id||"")}catch{process.stdout.write("")}' "$GITDIR/dispatch-fleet-reservation.json")
  RES_GRANTED=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).granted||1))}catch{process.stdout.write("1")}' "$GITDIR/dispatch-fleet-reservation.json")
  case "$ROUTE" in
    workflow-parallel) ACTUAL_N="$RES_GRANTED" ;;
    workflow-single|task) ACTUAL_N=1 ;;
    *) ACTUAL_N=0 ;;
  esac
  if [ -n "$RES_ID" ]; then
    # R1 F1 — the exit code is load-bearing when ACTUAL_N > 0. An uncommitted
    # reservation whose workers DO launch gets dropped by the lease later, which
    # under-counts the cap (over-permissive). Retry across the lock's 5s stale
    # window before giving up; deleting the token on failure would erase the only
    # handle we have on those launches.
    RECONCILED=0
    for attempt in 1 2 3; do
      if node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/orchestration-runaway.js" reconcile \
           --reservation "$RES_ID" --actual "$ACTUAL_N" \
           --session "${CLAUDE_SESSION_ID:-unknown}" 1>&2; then
        RECONCILED=1; break
      fi
      echo "[mccp:work] reconcile attempt $attempt failed (actual=$ACTUAL_N) — retrying" 1>&2
      sleep 3
    done
    if [ "$RECONCILED" = "1" ]; then
      echo "[mccp:work] runaway reservation reconciled (route=$ROUTE actual=$ACTUAL_N granted=$RES_GRANTED)" 1>&2
      rm -f "$GITDIR/dispatch-fleet-reservation.json"   # consumed; reconcile is idempotent anyway
    else
      # Fail-closed: we are about to launch workers we cannot account for, and the
      # agent-count cap is the PRIMARY structural backstop (M3 retired the
      # operational-USD block). Keep the token for a later retry and stop.
      echo "[MCCP-GATE-STOP] runaway reservation $RES_ID could not be committed after 3 attempts" 1>&2
      echo "  (actual=$ACTUAL_N would launch). Launching now would under-count the cap." 1>&2
      echo "  Token kept at $GITDIR/dispatch-fleet-reservation.json — inspect .claude/state/orchestration-runaway.json{,.lock}" 1>&2
      exit 1
    fi
  else
    rm -f "$GITDIR/dispatch-fleet-reservation.json"
  fi
fi
```

`$ROUTE` 값별 다음 sub-step으로 진행한다 (오라클 결정 트리는 [route.js](../scripts/lib/implement-dispatch/route.js) 참조):

- `workflow-parallel` → **Step 3.WP** (N-worker `parallel`). fleet 준비는 `MCCP_WORK_IMPLEMENT_PARALLEL` opt-out 미설정 + `merge_strategy=worktree-merge` + N>1 + run=true에서만 성사되므로(Step 3.prep-parallel), 이 route는 그 조건이 모두 참 + Workflow tool 가용일 때만 반환된다.
- `workflow-single` → **Step 3.W** (`MCCP_WORK_IMPLEMENT_WORKFLOW=1` + args 존재 + Workflow tool 가용).
- `task` → **Step 3.I** (Task dispatch — 격리 default fallback).
- `inline` → **Step 3.F 인라인** (`ISOLATE=0` 또는 prepare-single 실패로 아티팩트 부재).

#### Step 3.W — Workflow 격리 경로 (`MCCP_WORK_IMPLEMENT_WORKFLOW=1`)

**(1) started 표식** — Workflow 호출 **직전** 기록. 이 표식이 존재한 뒤로는 **Task fallback을 절대 하지 않는다**(Codex F1 — Workflow가 이미 mutating worker를 spawn했을 수 있어, fallback이 같은 worktree/envelope에 두 번째 경쟁 worker를 만들면 edit/receipt/gate state가 중복된다):

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({started:true}))' "$GITDIR/dispatch-workflow-started.json"
echo "[mccp:work] Workflow 격리 경로 진입 — started 표식 기록(이후 회수 실패는 fail-closed HALT)" 1>&2
```

**(2) Workflow 호출** (LLM 액션) — `dispatch-workflow-args.json` 내용을 `args`로 전달한다. 이 slash-command instruction이 Workflow opt-in 계약을 만족한다:

    Workflow({
      scriptPath: "${CLAUDE_PLUGIN_ROOT}/scripts/workflows/implement-dispatch.js",
      args: <dispatch-workflow-args.json 내용 그대로 (JSON 값)>
    })

Workflow는 단일 `agent(workerPrompt, {agentType, schema: IMPLEMENT_RESULT_SCHEMA})`를 구동하고 완료 시 `{result, dispatchId}`를 반환한다(plan-fanout이 검증한 background task → 완료 회수 흐름). 반환 객체를 그대로 `dispatch-workflow-return.json`에 영속화한다(reconcile 게이트의 `--result-file` 입력):

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
# LLM이 Workflow 반환 {result, dispatchId}를 이 파일에 기록한다. 예:
#   cat > "$GITDIR/dispatch-workflow-return.json" <<'JSON'
#   { "result": { "status": "ok", "receiptsAdded": [...], ... }, "dispatchId": "<uuid>" }
#   JSON
```

worker 계약은 Step 3.I와 동일(implement까지만, commit/PR 금지, 3 attribution 플래그 forward, `dispatch-cli.js mark`로 terminal envelope). 반환 객체는 회수 트리거일 뿐 — 판정의 유일 근거가 아니다(Step 3.gate가 envelope + store와 3자 reconcile).

**(3) 회수 실패 = fail-closed HALT** (Codex F1) — started 표식이 있는데 Workflow가 throw/tool 오류/결과 상실로 `dispatch-workflow-return.json`을 못 만들면, **Task fallback을 하지 않고** 종료한다. fix-task.md HALT + cleanup 지시:

```
[MCCP-WORKFLOW-HALT] Workflow 격리 worker 결과 회수 실패 (started 표식 존재).
두 번째 경쟁 worker 방지 — Task fallback 금지 (Codex F1).
Cleanup: envelope 상태 점검(dispatch-cli.js reconcile --from-envelope로 현재 상태 확인),
필요 시 Workflow({scriptPath, args, resumeFromRunId:<run id>})로 재개 후 다시 Step 3.gate.
```

→ 반환 파일 생성 성공 시 **Step 3.gate**로.

#### Step 3.I — Task 격리 경로 (fallback)

`$GITDIR/dispatch-prepare.json`이 존재하고 3.route가 이 경로를 선택하면 **단일 `Task`** 를 런칭한다: `subagent_type: "general-purpose"`, prompt = `$GITDIR/dispatch-worker-prompt.txt` 내용 그대로. worker는 프롬프트가 지정한 대로 prp-implement Phase 2.5~4를 자기 컨텍스트에서 구동하고, 모든 receipt write에 3 attribution 플래그(`--dispatched-by-controller-session`/`--worker-dispatch-id`/`--ipc-envelope-path`)를 forward하며, 완료 후 `dispatch-cli.js mark`로 terminal envelope를 쓴다. **controller는 이 `Task` 반환까지 동기 블록**된다(Codex F2 — heartbeat 없음이라 stale-reclaim 대상 아님, controller 사망 시 Task도 사망하므로 orphan 없음).

격리 invariant (worker에 위임하되 mutating 소유권은 controller):

- worker는 **implement까지만**. commit(Step 4)/PR(Step 5)은 controller 전용 — worker prompt가 `/mccp:prp-commit`·`/mccp:pr` 호출과 Phase 7 auto-chain을 명시 금지한다(**Codex F1**). 방어는 belt-and-suspenders: (i) prompt guardrail, (ii) worker가 mccp-pr-codex receipt를 만들면 Step 3.gate의 `deriveVerdict`가 `invariant-violation`으로 감지해 HALT.
- attribution: worker의 receipt는 3 플래그로 controller session에 anchor. **cooperative forward만으로는 부족**(Codex F3 — fresh-context worker가 플래그를 누락하면 un-anchored receipt가 조용히 dual-review·PR cross-gate dedupe를 무력화)하므로, Step 3.gate가 **post-hoc anchor 검증**(marker + 3-플래그 == `expectedAnchor`)을 hard로 수행해 미anchor를 `unanchored`로 HALT한다.

→ Task 반환 후 **Step 3.gate**로.

#### Step 3.gate — 통합 reconcile+anchor 게이트 (두 격리 경로 공통, Codex F2/F3)

Workflow·Task 어느 경로든 worker 종료 후 동일 게이트로 수렴한다. `deriveVerdict`가 반환값 ∧ envelope ∧ receipt-store를 **3자 reconcile**해 verdict를 판정한다 — 기존 envelope-only `merge`를 대체하며 F1 invariant + F2 reconciliation + F3 anchor 검증을 회수 채널 불문 적용한다. `--result-file`(Workflow 반환) 존재 여부로 경로를 자동 판별(존재=Workflow, 부재=`--from-envelope` Task):

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
if [ -f "$GITDIR/dispatch-prepare.json" ]; then
  # Codex F1 belt-and-suspenders: Workflow가 개시(started 표식)됐는데 반환을 못
  # 만들었다면 envelope로 reconcile하지 않는다(경쟁 worker와 pairing 위험) — HALT.
  if [ -f "$GITDIR/dispatch-workflow-started.json" ] && [ ! -f "$GITDIR/dispatch-workflow-return.json" ]; then
    echo "[MCCP-WORKFLOW-HALT] Workflow started but no return recovered — fail-closed (Codex F1). No Task fallback." 1>&2
    # write fix-task.md; cleanup 지시(envelope 점검, resumeFromRunId 재개)
    exit 13
  fi
  # reconcile 입력(args)은 prepare 파생물이다. Step 3.prep의 emit이 드문 fs 오류로
  # 실패해 args가 없으면 여기서 prepare로부터 재생성한다 — expectedAnchor 원천이
  # prepare에 이미 있으므로, 정상 종료한 Task worker를 result-unreadable로 오분류하지
  # 않는다(리뷰 발견 M1). 재생성도 실패하면 prepare 산출물 자체가 손상된 것이므로
  # worker 결과와 구분되는 정확한 진단으로 HALT. Workflow 경로는 3.route가 args 존재를
  # 이미 요구하므로 이 재생성은 Task 경로에서만 실질 발동한다.
  if [ ! -f "$GITDIR/dispatch-workflow-args.json" ]; then
    node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" emit-workflow-args \
      --prepare-file "$GITDIR/dispatch-prepare.json" \
      > "$GITDIR/dispatch-workflow-args.json" 2> "$GITDIR/dispatch-workflow-args.stderr" \
      || { echo "[MCCP-RECONCILE-HALT] reconcile args 재생성 실패 — prepare 산출물 손상(worker 결과와 무관). fix-task 후 재개." 1>&2; rm -f "$GITDIR/dispatch-workflow-args.json"; exit 13; }
  fi
  ENV_ABS=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).envelopePath)' "$GITDIR/dispatch-prepare.json")
  RECON_ARGS=(reconcile --args-file "$GITDIR/dispatch-workflow-args.json" --envelope "$ENV_ABS")
  if [ -f "$GITDIR/dispatch-workflow-return.json" ]; then
    RECON_ARGS+=(--result-file "$GITDIR/dispatch-workflow-return.json")   # Workflow 경로
  else
    RECON_ARGS+=(--from-envelope)                                          # Task 경로
  fi
  RECON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" "${RECON_ARGS[@]}")
  VERDICT=$(echo "$RECON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).verdict)}catch{process.stdout.write("result-unreadable")}')
  echo "[mccp:work] implement reconcile verdict=$VERDICT"
  echo "$RECON" > "$GITDIR/dispatch-reconcile.json"
  if [ "$VERDICT" != "ok" ]; then
    echo "[mccp:work] HALT: implement reconcile verdict=$VERDICT. Writing .claude/state/fix-task.md and stopping."
    # write fix-task.md with the RECON json (verdict + mismatches + invariantViolations + unanchored)
    exit 13
  fi
fi
```

verdict별 처리:

- `ok` → **Step 3.verify**(commit 전 aggregate adversarial-verify)로 진행. `receiptsAdded`(implement-codex receipt path) + `nextAction`을 Phase 3 REPORT에 기록.
- `invariant-violation` (**Codex F1**) → worker가 commit/PR receipt를 만듦. **HARD HALT** — 되돌릴 수 없는 external state 위험. fix-task.md에 `invariantViolations` 기록 후 종료.
- `reconcile-mismatch` (**Codex F2**) → 반환값↔envelope 불일치(status/receipt slug 집합/envelope pending). HALT.
- `unanchored` (**Codex F3**) → implement-codex receipt가 controller session에 anchor 안 됨(marker/3-플래그 불일치). HALT.
- `failed` / `result-unreadable` → worker 실패/사망(in-process이므로 spawn 부활 아님). fix-task.md HALT. 재개는 `/mccp:resume` 또는 `MCCP_WORK_ISOLATE_IMPLEMENT=0` 인라인 fallback.

#### Step 3.WP — Workflow 병렬 경로 (v1.20.8 M2b, `dispatch-fleet-args.json` 존재 시)

M2a Step 3.W의 N-worker 확장. worker 계약은 동일(implement까지만, commit/PR 금지, 3-플래그 attribution, `dispatch-cli.js mark`)하되 각 worker는 **자기 서로소 partition 파일만** 편집한다(prompt PARTITION SCOPE + Step 3.gate-parallel의 실제-diff 강제).

**(1) started 표식** — Workflow 호출 직전 기록. 이후 **Task/단일 fallback 절대 금지**(Codex F1 — N개 경쟁 재spawn 방지):

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({started:true,parallel:true}))' "$GITDIR/dispatch-workflow-started.json"
echo "[mccp:work] Workflow 병렬 경로 진입 — started 표식(이후 회수 실패는 fail-closed HALT)" 1>&2
```

**(2) Workflow 호출** (LLM 액션) — `dispatch-fleet-args.json`(fleet 배열 + minRemaining + reconcileInputs)을 `args`로 전달:

    Workflow({
      scriptPath: "${CLAUDE_PLUGIN_ROOT}/scripts/workflows/implement-dispatch.js",
      args: <dispatch-fleet-args.json 내용 그대로 (JSON 값)>
    })

Workflow는 `parallel(fleet.map(w => agent(w.workerPrompt, {isolation:'worktree', schema})))`로 N worker를 동시 구동(N>1일 때 worktree 격리)하고 `{workers:[{dispatchId, result}], dispatchIds, skipped}`를 반환한다. 각 worker 반환을 `dispatch-fleet-results/<dispatchId>.json`(`{result, dispatchId}`) 형태로 영속화한다:

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
mkdir -p "$GITDIR/dispatch-fleet-results"
# LLM이 Workflow 반환의 각 workers[i]를 파일로 기록:
#   {"result": <workers[i].result>, "dispatchId": <workers[i].dispatchId>}
#   → "$GITDIR/dispatch-fleet-results/<dispatchId>.json"
```

**(3) 회수 실패 = fail-closed HALT** (Codex F1) — started 표식이 있는데 Workflow가 throw/결과 상실로 result 파일들을 못 만들면, **재spawn 없이** 종료. `Workflow({scriptPath, args, resumeFromRunId:<run id>})`로 재개 후 Step 3.gate-parallel. `skipped:true`(budget)이면 개시 후이므로 Task 강등 대신 HALT + 재개 안내.

→ result 파일 생성 성공 시 **Step 3.gate-parallel**로.

#### Step 3.gate-parallel — verdict-before-merge 게이트 (Codex F1/F2/F4)

**핵심 안전 계약(Codex F1): 집계 판정을 merge-back 전에, 격리 worktree 결과만으로 실행한다.** 이 시점 parent worktree는 여전히 clean → 어떤 verdict든 **부분 적용 0**.

**(collect FIRST — worktree map 빌드, Mechanism 1)** Workflow 반환 후 컨트롤러가 `git worktree list`로 agent worktree를 enumerate해 dispatchId↔worktree map을 빌드한다(`collect-worktrees`). 누락/중복 dispatchId는 fail-closed HALT(lost worker silent drop 금지):

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
if [ -f "$GITDIR/dispatch-workflow-started.json" ] && [ ! -d "$GITDIR/dispatch-fleet-results" ]; then
  echo "[MCCP-WORKFLOW-HALT] fleet started but no results recovered — fail-closed (Codex F1). No fallback." 1>&2
  # write fix-task.md; cleanup(resumeFromRunId 재개) 지시
  exit 13
fi
# dispatchId 목록은 fleet args에서. collect-worktrees가 map을 dispatch-fleet-worktrees.json에 쓴다.
node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(JSON.stringify((a.reconcileInputs||a.fleet||[]).map(w=>w.dispatchId).filter(Boolean)))' \
  "$GITDIR/dispatch-fleet-args.json" > "$GITDIR/dispatch-fleet-ids.json"
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" collect-worktrees \
  --dispatch-ids-file "$GITDIR/dispatch-fleet-ids.json" \
  --out "$GITDIR/dispatch-fleet-worktrees.json" > "$GITDIR/dispatch-fleet-collect.json" \
  || { echo "[MCCP-COLLECT-HALT] worktree collect 실패(missing/ambiguous dispatchId) — lost worker fail-closed. fix-task 후 재개." 1>&2; exit 13; }
```

**(gate SECOND — verdict BEFORE merge, Codex F1)** N-way reconcile → `mergeVerdicts` (worker 실제-diff subset F2 포함). **집계 판정을 merge-back 전에, 격리 worktree 결과만으로** 실행 — 이 시점 parent는 여전히 clean → 어떤 verdict든 부분 적용 0:

```bash
RECON_ARGS=(reconcile --args-file "$GITDIR/dispatch-fleet-args.json" --results-dir "$GITDIR/dispatch-fleet-results")
# worktree-map은 (i) worker 실제-diff subset(F2, partition-escape) + (ii) M4 Task 2 —
# terminal envelope read 위치 둘 다에 공급된다. worker는 자기 worktree에 seed→mark하므로
# parent placeholder는 pending 잔존 → reconcile는 <worktree>/.claude/state/dispatches/<id>.envelope.json에서
# terminal envelope를 읽어야 오탐 mismatch를 피한다(map 부재 시 parent envelopePath fallback).
[ -f "$GITDIR/dispatch-fleet-worktrees.json" ] && RECON_ARGS+=(--worktree-map "$GITDIR/dispatch-fleet-worktrees.json")
RECON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" "${RECON_ARGS[@]}")
VERDICT=$(echo "$RECON" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).verdict)}catch{process.stdout.write("result-unreadable")}')
echo "$RECON" > "$GITDIR/dispatch-fleet-reconcile.json"
echo "[mccp:work] fleet reconcile verdict=$VERDICT"
if [ "$VERDICT" != "ok" ]; then
  echo "[mccp:work] HALT: fleet verdict=$VERDICT — parent worktree still clean(부분 적용 0). fix-task.md 작성 후 종료."
  # write fix-task.md with RECON(verdict + perWorker + invariantViolations + unanchored + partitionEscapes + mismatches)
  exit 13
fi
```

verdict별: `invariant-violation`(worker가 commit/PR receipt 생성, HARD) · `unanchored`(3-플래그 anchor 실패) · `partition-escape`(실제-diff가 partition 이탈) · `reconcile-mismatch` · `failed`/`result-unreadable` — **전부 HARD HALT**(부분 성공도 전체 중단; 서로소여도 부분 적용은 plan 무결성 파괴).

**(merge-back — 집계 ok일 때만, F4 patch-scoped)** `merge-apply`가 각 worker의 서로소 diff를 parent에 적용한다 — apply 직전 (i) actual-diff ⊆ partition∪allowlist 재확인(F2), (ii) 적용 대상 경로 pre-apply clean assert(F4 — 사용자 사전 dirty 보호), (iii) 적용한 **정확한 patch를 `dispatch-fleet-patches.json`에 기록**(rollback 근거). mid-apply 실패는 lib가 즉시 patch reverse-apply로 자체 rollback:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" merge-apply \
  --worktree-map "$GITDIR/dispatch-fleet-worktrees.json" \
  --partitions-file "$GITDIR/dispatch-fleet-partitions.json" \
  --patches-out "$GITDIR/dispatch-fleet-patches.json" > "$GITDIR/dispatch-fleet-mergeapply.json" \
  || { echo "[MCCP-MERGE-HALT] merge-apply 실패(collect/escape/pre-apply-dirty/conflict) — parent 미오염(자체 rollback). fix-task 후 종료." 1>&2; exit 13; }
```

> **F4 (Codex R1) — 광범위 `git checkout --`/`git clean` 절대 금지**: /mccp:work는 main 밖 dirty feature branch를 허용하므로 광범위 복원은 사용자의 기존 uncommitted 변경·untracked 파일을 파괴(data loss)한다. rollback은 **기록된 patch만** `git apply -R`로 역적용한다(`rollback-apply` — Step 3.verify HALT 경로에서 사용). merge-apply의 pre-apply clean assert가 사용자 사전 dirty를 먼저 감지해 HALT하므로 apply-후-충돌 자체가 드물다.

> **M4 활성화(merge_strategy default=worktree-merge, v1.21.0)**: worktree→parent 자동 merge의 **live harness 상관(worktree↔dispatchId)**이 Task 0(run wf_1f689994-fb8)에서 empirical하게 입증됐다 — isolation:'worktree' worker의 worktree는 `<repo>/.claude/worktrees/wf_<runId>-<N>`에 생성되고 `parallel()` 반환 후에도 컨트롤러 `git worktree list`에 잔존하며, worker가 first-step으로 in-worktree seed한 envelope를 `collect-worktrees`가 correlate한다(`.claude/state/dispatches/`는 gitignored라 parent placeholder가 fresh worktree에 미복사 → seed-required). 이 병렬 경로는 이제 `MCCP_WORK_IMPLEMENT_PARALLEL=1` opt-in + cost-state green + N>1 partition에서 **실제 도달**한다. collect/merge-apply/rollback lib의 git 메커니즘은 Task 0 실측 A(합성)로, live 상관은 Task 0 실측 B(M4 dogfood)로 양쪽 입증됐다. `MCCP_WORK_MERGE_STRATEGY=disable-parallel` 명시 시 M2a 단일 동작으로 back-compat 강등(same-worktree A2는 여전히 금지).

**(integrated test — Codex R1 F4)** merge-back 후 통합 검증 1회 — 서로소 partition이 각자 local review(per-worker Implement-Codex)를 통과해도 통합 시 깨지는 회귀(public API·import graph·shared config·test fixture)를 잡는다. 실패 시 `rollback-apply --patches-file "$GITDIR/dispatch-fleet-patches.json"` + HALT:

```bash
node --test  # 또는 affected 파일 대상. 실패 시 rollback-apply(F4 patch reverse-apply) + HALT.
```

**(commit-gate)** 통합 test green이면 **Step 3.verify**(공유 aggregate adversarial-verify)로. 병렬 경로도 단일 경로와 동일하게 verify를 거친 뒤에만 Step 4.

#### Step 3.F — 인라인 fallback (`dispatch-prepare.json` 부재 시)

prepare 아티팩트가 **없으면**(= `MCCP_WORK_ISOLATE_IMPLEMENT=0` 명시 opt-out 또는 prepare-single 실패), 기존 동작대로 `Skill(mccp:prp-implement, "<plan path>")`를 인라인 호출한다(implement diff·validate 출력이 메인 컨텍스트에 누적됨 — baseline 경로). Step 3.prep이 이미 loud stderr로 사유를 남겼다.

→ 인라인 implement 완료 후 **Step 3.verify**로.

#### Step 3.verify — aggregate adversarial-verify (모든 implement 경로 공통, commit 전 필수, v1.20.12 M3 · DD1/DD2/DD6)

implement가 끝난 뒤(단일 Step 3.gate `ok` / 병렬 Step 3.gate-parallel commit-gate / 인라인 Step 3.F) **commit(Step 4) 전에**, 통합 diff를 worker 밖에서 **1회 cross-model(Codex) adversarial review**한다. 이것이 PRD Open Question 1(c)의 pipeline-스테이지 답 — worker 안(per-worker Implement-Codex) + workflow 외곽(/mccp:pr PR-Codex) 사이의 **통합 verify 층**. per-partition·per-worker 리뷰가 놓치는 cross-cut 회귀(public API·import graph·shared config)를 test보다 깊은 LLM 판정으로 잡는다.

- **DD6 / Codex R1 F2 — 단일 경로에서도 발화**: 병렬이 gated(`disable-parallel`)여도 M3의 verify-네이티브화가 실제 runtime 가치를 갖는다. Axis A(verify) ⊥ Axis B(병렬 활성화).
- **DD2 — cross-model 불변식**: invoker는 여전히 Codex(`codex-invoke.js`). "adversarial-verify" 패턴은 **worker 밖 독립 검증** 구조만 차용하며 same-model Claude skeptic으로 치환하지 않는다(dual-review 무손상).
- 모드 `MCCP_WORK_MERGED_VERIFY`(default `enforce`, §4): `enforce`=divergent/critical/unavailable HALT · `warn`=advisory pass(verdict 정직 기록) · `off`=skipped. `MCCP_CODEX_DISABLED=1`이면 classification=disabled→verdict=skipped(pass).

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
DECISION_SLUG=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" derive-decision --command mccp:prp-implement --args "$PLAN_PATH")
MV_MODE=$(node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/implement-dispatch/verify').parseMergedVerifyMode(process.env))")

# 통합 diff = HEAD 대비 uncommitted 변경(단일: worker가 parent 직접 편집 / 병렬: merge-apply가 적용 / 인라인: Skill 편집). commit(Step 4) 전이므로 모두 uncommitted.
# tracked 수정/삭제(git diff HEAD) ∪ untracked 신규(ls-files --others) — 신규 파일만 추가하는 implement가 verify를 skip하지 않도록 union(H1). git apply로 생긴 신규 파일도 unstaged라 병렬 경로 포함 모든 경로에 필요. worktree-merge.js#collectWorkerDiff와 동일 계약.
git diff --name-only HEAD > "$GITDIR/mv-changed.txt" 2>/dev/null || true
git ls-files --others --exclude-standard >> "$GITDIR/mv-changed.txt" 2>/dev/null || true
node -e 'const fs=require("fs");const l=[...new Set(fs.readFileSync(process.argv[1],"utf8").split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];fs.writeFileSync(process.argv[2],JSON.stringify(l))' "$GITDIR/mv-changed.txt" "$GITDIR/mv-changed.json"
CHANGED_N=$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).length))' "$GITDIR/mv-changed.json")

if [ "$MV_MODE" = "off" ] || [ "$CHANGED_N" = "0" ]; then
  # off 또는 변경 없음 → skipped(advisory pass, verdict 정직 기록)
  MV_VERDICT="skipped"; MV_ROUNDS=0; MV_BLOCK=0
  echo "[mccp:work] merged-verify skipped (mode=$MV_MODE changed=$CHANGED_N)"
else
  # focus 조립 → Codex(cross-model) 1회 호출 → verdict 판정
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" verify-focus \
    --base HEAD --changed-files-file "$GITDIR/mv-changed.json" > "$GITDIR/mv-focus.json"
  FOCUS=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).focus)' "$GITDIR/mv-focus.json")
  CODEX_STDOUT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js" adversarial-review \
    --focus "$FOCUS" --timeout-ms 900000 --json 2> "$GITDIR/mv-codex.stderr")
  echo "$CODEX_STDOUT" > "$GITDIR/mv-codex.json"
  MV=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" verify-decide \
    --codex-json "$GITDIR/mv-codex.json" --mode "$MV_MODE")
  MV_VERDICT=$(echo "$MV" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).verdict)}catch{process.stdout.write("unavailable")}')
  MV_BLOCK=$(echo "$MV" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).block?"1":"0")}catch{process.stdout.write("1")}')
  MV_ROUNDS=$(echo "$MV" | node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).rounds))}catch{process.stdout.write("1")}')
  echo "[mccp:work] merged-verify verdict=$MV_VERDICT block=$MV_BLOCK mode=$MV_MODE"
fi

if [ "$MV_BLOCK" = "1" ]; then
  echo "[MCCP-MERGED-VERIFY-HALT] aggregate verify verdict=$MV_VERDICT (mode=$MV_MODE) — commit(Step 4) 차단."
  # 병렬 경로: merge-apply가 patch를 기록했으면 patch reverse-apply로 parent 복원(F4 — 광범위 checkout/clean 금지).
  if [ -f "$GITDIR/dispatch-fleet-patches.json" ]; then
    node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" rollback-apply --patches-file "$GITDIR/dispatch-fleet-patches.json" 1>&2 || true
  fi
  # 단일/인라인 경로: worker가 parent를 직접 편집 — 변경은 uncommitted로 **보존**(auto-rollback 안 함; 사용자가 cross-cut 회귀를 working tree에서 수정 후 재실행. 광범위 rollback은 F4 data-loss).
  # write .claude/state/fix-task.md with $MV(verdict+reason) + $GITDIR/mv-codex.stderr excerpt
  exit 13
fi

# pass(converged / warn-advisory / skipped) → mccp-implement-verify receipt(audit anchor, DD5). 신규 gate, non-invasive(어떤 command chain에도 진입 안 함).
node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" write \
  --gate mccp-implement-verify --decision "$DECISION_SLUG" --plan "$PLAN_PATH" \
  --merged-verify-verdict "$MV_VERDICT" --merged-verify-rounds "$MV_ROUNDS" --quiet
echo "[mccp:work] mccp-implement-verify receipt 기록 (verdict=$MV_VERDICT rounds=$MV_ROUNDS) → Step 4"
```

- **pass**(`converged` / `warn` advisory / `skipped`) → Step 4로. `merged_verify_verdict`/`merged_verify_rounds`가 `mccp-implement-verify` receipt에 stamp됨.
- **block**(`divergent` / `critical` / `unavailable`×enforce) → **HARD HALT**. 병렬은 patch reverse-apply로 parent 복원, 단일/인라인은 uncommitted 변경 보존(F4). fix-task.md 후 종료. 복구: working tree에서 cross-cut 회귀 수정 후 재실행 **또는** `MCCP_WORK_MERGED_VERIFY=warn` advisory pass.

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
- Treating the Step 3.gate / Step 3.gate-parallel reconcile `verdict != ok` (`invariant-violation` / `reconcile-mismatch` / `unanchored` / `partition-escape` / `failed` / `result-unreadable`) as "warning only" — every non-`ok` verdict is a HARD halt (fix-task.md + stop). `invariant-violation` means an isolated worker leaked a commit/PR receipt (irreversible external state); `partition-escape` means a worker's real diff left its disjoint slice; never advance to Step 4/5.
- Running a Task/단일 fallback AFTER a Workflow `started` marker exists (Codex F1) — that would spawn a second competing worker (N개 for the parallel path). Once `dispatch-workflow-started.json` is written, a result-recovery failure is a fail-closed HALT, never a Task/단일 retry. Resume via `resumeFromRunId`.
- (M2b) Merging any worker's changes into the parent worktree BEFORE `mergeVerdicts` returns `ok` (Codex F1) — the aggregate verdict runs on the ISOLATED worktree results while the parent is still clean, so a non-`ok` aggregate leaves ZERO partial application. Never merge-back first and judge after.
- (M3) Treating the Step 3.verify merged-verify `block=1` (`divergent` / `critical` / `unavailable`×enforce) as "warning only" — it is a HARD halt before Step 4 (fix-task.md + stop). Skipping the aggregate verify stage entirely, or advancing to commit without writing the `mccp-implement-verify` receipt on a pass, breaks the pipeline-verify contract (DD1). The one advisory escape is `MCCP_WORK_MERGED_VERIFY=warn`, which passes but records the verdict honestly — never silently skip.
- (M3) Rolling back a Step 3.verify HALT with a broad `git checkout -- .` / `git clean -fd` (Codex R1 F4) — that destroys the user's pre-existing uncommitted changes + untracked files on a dirty feature branch (irreversible data loss). Only `rollback-apply` (patch-scoped `git apply -R` of the recorded fleet patches) is permitted; the single/inline path preserves its uncommitted diff for the user to fix.

The only exception is Phase 0 dirty-tree STOP (precondition violation, not a step transition).
