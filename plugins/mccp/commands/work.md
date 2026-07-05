---
description: "Single-entry orchestrator — PRD→plan→implement→PR (trivial path auto-branch)"
argument-hint: "<feature description | path/to/*.prd.md> [--full] [--trivial]"
allowed-tools: Bash(node:*), Bash(git:*), Task, Skill(mccp:plan-prd), Skill(mccp:plan), Skill(mccp:prp-implement), Skill(mccp:prp-commit), Skill(mccp:pr)
---

# /mccp:work — single-entry chain orchestration (v0.3.1)

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

Routes a single user input through the full mccp pipeline:

- **trivial path** (simple doc/config edit) → `/mccp:prp-commit` → `/mccp:pr`
- **full chain** (new feature / architectural change) → `/mccp:plan-prd` → `/mccp:plan` → `/mccp:prp-implement` → `/mccp:prp-commit` → `/mccp:pr`

v1.20.2 M1부터 full chain의 **implement 스텝은 격리된 단일 worker `Agent`로 위임**된다(최대 컨텍스트 누적원 격리, 메인은 envelope 요약만 회수). kill switch `MCCP_WORK_ISOLATE_IMPLEMENT=0`로 인라인 fallback — Step 3 참조.

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

### Step 3 — `/mccp:prp-implement` (격리 위임, v1.20.2 M1)

v1.20.2 M1부터 implement 스텝은 **격리된 단일 worker `Agent` 위임**으로 실행된다. worker가 파일 탐색·edit·validate 루프·Implement-Codex 게이트·receipt write를 자기 컨텍스트에서 수행하고, 메인(controller) 세션은 envelope 요약(변경 파일·receipt path·verdict)만 회수한다 — implement 스텝의 최대 컨텍스트 누적원을 격리해 메인 피크를 얇게 유지한다. 메커니즘은 신규 발명이 아니라 dispatch-controller substrate(`prepareDispatch`/`mergeEnvelopes`/envelope schema/3-flag attribution)를 single-worker로 재사용한다.

**kill switch**: `MCCP_WORK_ISOLATE_IMPLEMENT`(default `1`). `0`이면 Step 3.F 인라인 `Skill(mccp:prp-implement)` fallback(loud stderr). 미지정/오타 시 격리(보수적 default = 격리 on).

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

> **Shell-state 독립 계약**: 아래 3개 Bash 블록은 **서로 다른 Bash 호출**(각각 fresh shell — env var 비지속)이고, 사이에 LLM `Task` dispatch가 낀다. 따라서 blocks 간 상태를 shell var로 넘기지 **않고** `.git/mccp/tmp/dispatch-prepare.json` 아티팩트로 self-derive한다(prp-implement.md design-grounding self-derive 관행 mirror). 아티팩트 존재 = 격리 경로 활성; 부재 = 인라인 fallback.

#### Step 3.I — 격리 위임 경로 (`MCCP_WORK_ISOLATE_IMPLEMENT` != 0)

**(1) prepare** — placeholder envelope + self-contained worker prompt 생성. `$PLAN_PATH`는 Step 2에서 확정한 plan 경로. 결과를 아티팩트로 영속화(다음 blocks가 이걸로 self-derive):

```bash
mkdir -p .git/mccp/tmp
rm -f .git/mccp/tmp/dispatch-prepare.json .git/mccp/tmp/dispatch-worker-prompt.txt   # clear stale
ISOLATE="${MCCP_WORK_ISOLATE_IMPLEMENT:-1}"
if [ "$ISOLATE" != "0" ]; then
  CONTROLLER_SESSION="${CLAUDE_SESSION_ID:-$(node -e 'console.log(crypto.randomUUID())')}"
  node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" prepare-single \
    --plan "$PLAN_PATH" \
    --controller-session "$CONTROLLER_SESSION" \
    --subagent general-purpose \
    > .git/mccp/tmp/dispatch-prepare.json 2> .git/mccp/tmp/dispatch-prepare.stderr
  if [ "$?" != "0" ]; then
    echo "[mccp:work] prepare-single failed — falling back to inline implement" 1>&2
    rm -f .git/mccp/tmp/dispatch-prepare.json   # absence → inline fallback (3.F)
  else
    node -e 'const j=JSON.parse(require("fs").readFileSync(".git/mccp/tmp/dispatch-prepare.json","utf8")); require("fs").writeFileSync(".git/mccp/tmp/dispatch-worker-prompt.txt", j.prompt); console.log("[mccp:work] implement isolated → dispatch="+j.dispatchId+" envelope="+j.ipcEnvelopePath)'
  fi
else
  echo "[mccp:work] MCCP_WORK_ISOLATE_IMPLEMENT=0 — implement 인라인 실행 (격리 비활성)" 1>&2
fi
```

**(2) dispatch** — `.git/mccp/tmp/dispatch-prepare.json`이 **존재하면** (격리 경로) **단일 `Task`** 를 런칭한다: `subagent_type: "general-purpose"`, prompt = `.git/mccp/tmp/dispatch-worker-prompt.txt` 내용 그대로. **아티팩트가 없으면 이 dispatch를 건너뛰고 Step 3.F(인라인)로 간다.** worker는 프롬프트가 지정한 대로 prp-implement Phase 2.5~4를 자기 컨텍스트에서 구동하고, 모든 receipt write에 3 attribution 플래그(`--dispatched-by-controller-session`/`--worker-dispatch-id`/`--ipc-envelope-path`)를 forward하며, 완료 후 `dispatch-cli.js mark`로 terminal envelope를 쓴다. **controller는 이 `Task` 반환까지 동기 블록**된다(Codex F2 — heartbeat 없음이라 stale-reclaim 대상 아님, controller 사망 시 Task도 사망하므로 orphan 없음).

격리 invariant (worker에 위임하되 mutating 소유권은 controller):

- worker는 **implement까지만**. commit(Step 4)/PR(Step 5)은 controller 전용 — worker prompt가 `/mccp:prp-commit`·`/mccp:pr` 호출과 Phase 7 auto-chain을 명시 금지한다(**Codex F1** — 격리 안에서의 auto-commit/PR은 되돌릴 수 없는 external state change). 방어는 belt-and-suspenders: (i) prompt guardrail, (ii) worker가 mccp-pr-codex receipt를 만들면 (3)의 merge가 invariant 위반으로 감지해 HALT.
- attribution: worker의 receipt는 3 플래그로 controller session에 anchor → PR 스텝 cross-gate dedupe가 plan-codex + implement-codex verdict를 정상 대조(dual-review 가치 보존). worker prompt가 forward를 명시하지만, prp-implement.md 2.5.6 문서 경로는 이 플래그를 자동 추가하지 않으므로 worker의 순응이 필요한 cooperative anchor다(M1 한계 — 미forward 시 receipt는 fail이 아니라 un-anchored로 기록).

**(3) merge** — 아티팩트 존재 시 worker 반환 후 요약 회수 + verdict 게이트(shell-state 독립 — `$ENV_ABS`를 prepare.json에서 self-derive):

```bash
if [ -f .git/mccp/tmp/dispatch-prepare.json ]; then
  ENV_ABS=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(".git/mccp/tmp/dispatch-prepare.json","utf8")).envelopePath)')
  MERGE=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/dispatch-cli.js" merge --envelope "$ENV_ABS")
  VERDICT=$(echo "$MERGE" | node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).verdict)}catch{process.stdout.write("envelope-unreadable")}')
  echo "[mccp:work] implement merge verdict=$VERDICT"
  echo "$MERGE" > .git/mccp/tmp/dispatch-merge.json
  if [ "$VERDICT" != "ok" ]; then
    echo "[mccp:work] HALT: implement worker verdict=$VERDICT. Writing .claude/state/fix-task.md and stopping."
    # write fix-task.md with the MERGE json (verdict + failedWorkers + invariantViolations)
    exit 13
  fi
fi
```

verdict별 처리:

- `ok` → Step 4로 진행. `receiptsAdded`(implement-codex receipt path) + `nextAction`을 Phase 3 REPORT에 기록.
- `invariant-violation` (**Codex F1**) → worker가 commit/PR receipt를 만듦. **HARD HALT** — 되돌릴 수 없는 external state 위험. fix-task.md에 `invariantViolations` 기록 후 종료.
- `failed` / `crashed` / `envelope-unreadable` → worker 실패/사망(in-process Agent이므로 spawn 부활 아님). fix-task.md HALT. 재개는 `/mccp:resume` 또는 `MCCP_WORK_ISOLATE_IMPLEMENT=0` 인라인 fallback.

#### Step 3.F — 인라인 fallback (`.git/mccp/tmp/dispatch-prepare.json` 부재 시)

prepare 아티팩트가 **없으면**(= `MCCP_WORK_ISOLATE_IMPLEMENT=0` 명시 opt-out 또는 prepare-single 실패), 기존 동작대로 `Skill(mccp:prp-implement, "<plan path>")`를 인라인 호출한다(implement diff·validate 출력이 메인 컨텍스트에 누적됨 — baseline 경로). block (1)이 이미 loud stderr로 사유를 남겼다.

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
- Treating Step 3 implement merge `verdict != ok` (especially `invariant-violation`) as "warning only" — it is a HARD halt (fix-task.md + stop). `invariant-violation` means the isolated worker leaked a commit/PR receipt (irreversible external state); never advance to Step 4/5.

The only exception is Phase 0 dirty-tree STOP (precondition violation, not a step transition).
