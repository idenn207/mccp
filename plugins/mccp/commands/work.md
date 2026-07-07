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
mkdir -p .git/mccp/tmp

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
  $FORCE_TRIVIAL $FORCE_FULL 2> .git/mccp/tmp/work-classify.stderr)
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

**2축 kill switch (3-state: 인라인 / Task-격리 / Workflow-격리)**:

- `MCCP_WORK_ISOLATE_IMPLEMENT` (default `1`) — 상위 축. `0`이면 Step 3.F 인라인 `Skill(mccp:prp-implement)` fallback(loud stderr). 미지정/오타 시 격리(보수적 default = 격리 on).
- `MCCP_WORK_IMPLEMENT_WORKFLOW` (default `0`) — 격리 활성 시 하위 축. `=1` AND prepare 성공 AND `Workflow` tool 가용이면 **Step 3.W**(Workflow `agent()` 경로), 그 외(`0`/미설정/오타/tool 미가용)면 **Step 3.I**(기존 Task dispatch). fail-open — Workflow 미가용이 implement를 절대 막지 않는다. **Codex F1**: Task fallback은 Workflow 호출을 **개시하기 전**에만 허용된다(개시 후 회수 실패는 두 번째 경쟁 worker를 막기 위해 fail-closed HALT).

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

#### Step 3.prep — prepare (두 격리 경로 공유, `MCCP_WORK_ISOLATE_IMPLEMENT` != 0)

placeholder envelope + self-contained worker prompt 생성 후, Workflow `args` + reconcile 입력(`expectedAnchor`)을 별도 아티팩트로 재-emit한다. `$PLAN_PATH`는 Step 2에서 확정한 plan 경로:

```bash
GITDIR=$(git rev-parse --git-path mccp/tmp)
mkdir -p "$GITDIR"
rm -f "$GITDIR"/dispatch-prepare.json "$GITDIR"/dispatch-worker-prompt.txt \
      "$GITDIR"/dispatch-workflow-args.json "$GITDIR"/dispatch-workflow-started.json \
      "$GITDIR"/dispatch-workflow-return.json "$GITDIR"/dispatch-reconcile.json   # clear stale
ISOLATE="${MCCP_WORK_ISOLATE_IMPLEMENT:-1}"
if [ "$ISOLATE" != "0" ]; then
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

#### Step 3.route — pre-invocation 경계 결정 (Codex F1)

prepare 아티팩트 + 두 env를 읽어 **worker를 spawn하기 전** 경로를 확정한다. 이 지점이 Task fallback을 허용하는 **유일한 안전 지점**이다(Codex F1 — Workflow 개시 후엔 fallback 금지):

- `$GITDIR/dispatch-prepare.json` **부재** → **Step 3.F 인라인** (`ISOLATE=0` 또는 prepare-single 실패).
- prepare 존재 + `MCCP_WORK_IMPLEMENT_WORKFLOW=1` + `dispatch-workflow-args.json` 존재 + **`Workflow` tool이 이 세션에서 가용** → **Step 3.W**.
- prepare 존재 + 그 외(`WF=0`/미설정/오타, args 부재, 또는 Workflow tool 미가용) → **Step 3.I** (Task dispatch).

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

- `ok` → Step 4로 진행. `receiptsAdded`(implement-codex receipt path) + `nextAction`을 Phase 3 REPORT에 기록.
- `invariant-violation` (**Codex F1**) → worker가 commit/PR receipt를 만듦. **HARD HALT** — 되돌릴 수 없는 external state 위험. fix-task.md에 `invariantViolations` 기록 후 종료.
- `reconcile-mismatch` (**Codex F2**) → 반환값↔envelope 불일치(status/receipt slug 집합/envelope pending). HALT.
- `unanchored` (**Codex F3**) → implement-codex receipt가 controller session에 anchor 안 됨(marker/3-플래그 불일치). HALT.
- `failed` / `result-unreadable` → worker 실패/사망(in-process이므로 spawn 부활 아님). fix-task.md HALT. 재개는 `/mccp:resume` 또는 `MCCP_WORK_ISOLATE_IMPLEMENT=0` 인라인 fallback.

#### Step 3.F — 인라인 fallback (`dispatch-prepare.json` 부재 시)

prepare 아티팩트가 **없으면**(= `MCCP_WORK_ISOLATE_IMPLEMENT=0` 명시 opt-out 또는 prepare-single 실패), 기존 동작대로 `Skill(mccp:prp-implement, "<plan path>")`를 인라인 호출한다(implement diff·validate 출력이 메인 컨텍스트에 누적됨 — baseline 경로). Step 3.prep이 이미 loud stderr로 사유를 남겼다.

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
- Treating the Step 3.gate implement reconcile `verdict != ok` (`invariant-violation` / `reconcile-mismatch` / `unanchored` / `failed` / `result-unreadable`) as "warning only" — every non-`ok` verdict is a HARD halt (fix-task.md + stop). `invariant-violation` means the isolated worker leaked a commit/PR receipt (irreversible external state); never advance to Step 4/5.
- Running a Task fallback AFTER a Workflow `started` marker exists (Codex F1) — that would spawn a second competing worker. Once `dispatch-workflow-started.json` is written, a result-recovery failure is a fail-closed HALT, never a Task retry.

The only exception is Phase 0 dirty-tree STOP (precondition violation, not a step transition).
