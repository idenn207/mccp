---
description: Anthropic native /goal completion-condition loop를 wrapping해 milestone 종료 acceptance를 mccp receipt chain 안에 anchor합니다 (mccp v1.x.x axis C — M3)
argument-hint: <milestone-id-or-prd-path>
---

# /mccp:milestone-close

> If I disappear silently, run `/mccp:trace` or check `.claude/state/hook-trace/<session_id>/`

`/goal`은 Anthropic Claude Code의 session-scoped prompt-based Stop hook입니다 — 사용자가 acceptance condition을 자연어로 주면 매 turn 후 small fast model이 condition 충족 여부를 판단하고, 충족 시 자동 종료합니다 (자세한 spec: https://code.claude.com/docs/en/goal). 이 명령은 native `/goal`을 호출하지 않고 **cooperative guide 패턴**으로 사용자에게 안내한 뒤, multi-turn loop 동안 mccp Stop hook + write tool이 mccp 자체 상태에 침투하지 않도록 mechanical isolation lock으로 격리하고, 사용자가 grammar로 응답한 결과를 closure document에 audit-trail로 stamping합니다.

**위치**: chain에서 `/mccp:prp-implement` 와 `/mccp:pr` 사이. milestone-close가 통과 못 하면 PR 진입은 closure-doc 부재 또는 manual revert로 차단.

**custody anchor**: closure-doc body(`.claude/milestone-closures/<milestone-id>.md`) + plan-body `## Milestone Closure Provenance` sha256 stamp가 다음 `/mccp:pr`의 plan_hash anchor에 자동 포함됩니다 (option B — receipt schema 무수정).

## Phase 0 — PREFLIGHT

```bash
# Working tree state
git status --porcelain
git branch --show-current
```

- working-tree가 dirty이면 사용자에게 안내 + STOP. milestone-close는 ship-state working-tree를 가정합니다 (commit 후 진입).
- 인수가 없으면 usage 안내 후 STOP. 인수 형태:
  - 숫자 (`3`) — PRD `Delivery Milestones` table row 번호
  - 부분 이름 (`axis C`) — 행 이름 부분 일치
  - 경로 (`.claude/plans/...plan.md` 또는 `.claude/prds/....prd.md`) — auto-pick first `in-progress` row
- cost-tier 검출:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/cost-state.js" get-tier 2>/dev/null || echo "green"
```

  - tier=`critical` ($100+) → STOP — `/goal` 무한 루프 위험.
  - tier=`warning` ($80+) → 사용자에게 confirmation 요청.
  - 그 외 → continue.

## Phase 1 — DETECT

```bash
DETECT=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/goal-detect.js" detect \
  --mode milestone-close \
  --milestone "$ARG" \
  --prd .claude/prds/<auto-derive-or-user-supplied>.prd.md \
  --json)
AVAILABILITY=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.availability)}catch{process.stdout.write("unknown")}' <<< "$DETECT")
SIGNAL=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.goal_signal?"1":"0")}catch{process.stdout.write("0")}' <<< "$DETECT")
REASON=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.reason||"unknown")}catch{process.stdout.write("parse-error")}' <<< "$DETECT")
SIGNAL_REF=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(j.signal_ref||{}))}catch{process.stdout.write("{}")}' <<< "$DETECT")
```

Decision tree:

| AVAILABILITY | SIGNAL | Action |
|---|---|---|
| `unknown` / `missing` | * | silent skip + STOP. 사용자 환경에 `/goal` 미설치 또는 spec 미확인 — phantom 안내 금지. |
| `available` | 0 | reason 안내 후 STOP. (`already-closed` / `not-started` / `plan-missing` / `no-milestones-table` / `milestone-not-found`) |
| `available` | 1 | continue to Phase 2 |

## Phase 2 — LOCK ENTER + COOPERATIVE GUIDE

```bash
RUN_ID=$(node -e "console.log(require('crypto').randomUUID())")
MILESTONE_ID="${SIGNAL_REF row + name}"   # e.g. "3" or "3-axis-C"
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
ENTER_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/goal-phase-lock.js" enter \
  --run-id "$RUN_ID" \
  --pid $$ \
  --milestone-id "$MILESTONE_ID" \
  --owner-session-id "$SESSION_ID")
# Sidecar token file is written to <gitdir>/mccp/tmp/goal-token-<run-id>.dat
# (mode 0o600). Phase 4 reads token from sidecar — DO NOT stash raw token in
# shell var (turn boundary kills shell-var state per Codex impl-R1 F1).
SIDECAR_PATH=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(j.sidecar_path||"")}catch{}' <<< "$ENTER_JSON")
```

이후 다음 안내를 사용자에게 출력:

```
[mccp:milestone-close] /goal mode 진입 안내 (milestone={MILESTONE_ID})

1. 다음 turn에서 `/goal <acceptance condition>` 명령을 **직접** 실행하세요.
   예: `/goal all tests pass, CHANGELOG entry exists, plan archived to completed/, or stop after 20 turns`
2. `/goal`은 매 turn 후 small fast model이 condition을 평가합니다. condition을
   충족하면 자동 종료, 충족 못 하면 다음 turn 시작. 화면에 `◎ /goal active`
   indicator가 표시됩니다.
3. 종료 후 (또는 condition 평가 불가 시) 다음 grammar로 응답하세요:
   - `goal-done:<≥3-word summary>`    — acceptance 통과
   - `goal-failed:<reason>`           — 통과 못 함 (revise plan / re-implement 필요)
   - `goal-skipped:<reason>`          — 본 cycle에서 closure 건너뛰기

⚠ /goal 모드 안에서 `mccp:*` 명령 호출 금지 (cooperative invariant).
⚠ lock 활성 중 mccp의 Edit/Write/receipt-write는 mechanical block됩니다.
⚠ 사용자 mid-loop interrupt (Ctrl+C) 시 `/goal clear` 후 본 명령 재호출 권장.
⚠ lease 90s. 사용자 응답 대기가 길어지면 lock이 stale로 판정될 수 있습니다 —
   필요 시: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/goal-phase-lock.js heartbeat --run-id $RUN_ID`
```

## Phase 3 — WAIT

사용자의 응답을 기다립니다. grammar parsing:

```regex
^goal-(done|failed|skipped):\s*(.+)$
```

- mismatch 시 (예: 빈 응답 또는 grammar 외 응답): Phase 2 prompt 재출력 + 계속 wait
- `goal-done:` summary length < 3 단어 → grammar mismatch 처리
- mid-loop interrupt detect (사용자가 명시적으로 cancel/clear): cleanup만 수행 후 STOP

`goal-done` / `goal-failed` / `goal-skipped` 각 분기에 따라 Phase 4 진입.

## Phase 4 — LOCK EXIT + INJECT

```bash
# 1) Read token from sidecar (Codex impl-R1 F1 — token survives turn boundary
#    only via sidecar file, not shell var).
if [ ! -f "$SIDECAR_PATH" ]; then
  echo "[mccp:milestone-close] sidecar token missing. lock may have been reclaimed."
  echo "Run: node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/goal-phase-lock.js detect-stale"
  echo "Then re-invoke /mccp:milestone-close $ARG."
  exit 1
fi

# 2) Exit lock (token read internally from sidecar via run-id).
EXIT_JSON=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/goal-phase-lock.js" exit --run-id "$RUN_ID")

# 3) Write closure document. Apply secret mask via derive/mask.js#applySecretMask
#    (S5 absorption — evaluator output may contain credentials/PII).
mkdir -p .claude/milestone-closures
CLOSURE_PATH=".claude/milestone-closures/${MILESTONE_ID}.md"
RAW_RESULT="<user response text from Phase 3>"
MASKED=$(node -e '
  const mask = require(process.env.CLAUDE_PLUGIN_ROOT + "/scripts/derive/mask").applySecretMask;
  process.stdout.write(mask(process.argv[1]).text);
' "$RAW_RESULT")

cat > "$CLOSURE_PATH" <<EOF
# Milestone Closure — ${MILESTONE_ID}

## Milestone
- ID         : ${MILESTONE_ID}
- Name       : ${SIGNAL_REF.name}
- Plan       : ${SIGNAL_REF.plan}
- Status     : ${VERDICT}   (done | failed | skipped)
- Closed at  : ${ISO_NOW}
- Closed by  : /mccp:milestone-close (run_id=${RUN_ID})

## Acceptance Condition
<acceptance condition the user passed to /goal — paste verbatim or summary>

## Goal Loop Result
${MASKED}

## Provenance
- Lock run_id        : ${RUN_ID}
- Lock owner session : ${SESSION_ID}
- Plan source        : ${SIGNAL_REF.plan}
- Detection signal   : ${SIGNAL_REF (JSON)}
- mccp version       : ${plugin.json.version}
EOF

# 4) Append provenance stamp to plan body (in original source plan, not archived copy).
#    Idempotent — second invocation REPLACES the section, not append.
PLAN_PATH="${SIGNAL_REF.plan}"
CLOSURE_HASH=$(node "${CLAUDE_PLUGIN_ROOT}/scripts/receipt/cli.js" hash-markdown "$CLOSURE_PATH")
# Then edit PLAN_PATH: remove existing `## Milestone Closure Provenance` section
# if present, then append:
#   ## Milestone Closure Provenance
#   - Milestone : ${MILESTONE_ID}
#   - Verdict   : ${VERDICT}
#   - Closure   : ${CLOSURE_PATH}
#   - sha256    : ${CLOSURE_HASH}
#   - Stamped at: ${ISO_NOW}
```

## Phase 5 — CODEX GATE (option B, first cut)

본 cut은 별도 `mccp-milestone-close-codex` receipt를 발행하지 않습니다 (option B per plan body §5). closure document body + plan-body `## Milestone Closure Provenance` sha256 stamp가 다음 `/mccp:pr`의 plan_hash anchor 계산에 자동 포함되어, mutation 시 plan_hash mismatch로 detect 가능합니다.

**돈위 위반 검출 시 (option A 전환 조건)**: dogfood에서 closure-doc-only audit이 root-cause 추적에 부족하다고 판단되면, 별도 `mccp-milestone-close-codex` gate를 추가하는 revision round를 trigger합니다 (plan body §5 CIQ3 참조).

## Phase 6 — OUTPUT

```
## Milestone Closed

- Milestone : {MILESTONE_ID} — {NAME}
- Plan      : {PLAN_PATH}
- Verdict   : {done | failed | skipped}
- Closure   : {CLOSURE_PATH}
- sha256    : {CLOSURE_HASH}

### Next
- done   → /mccp:pr (closure-doc anchor stamped on plan body)
- failed → revise plan / re-implement, then /mccp:milestone-close 재호출
- skipped → 본 cycle은 closure 건너뜀. PR은 별도 justification 필요.
```

## Failure modes

### Sidecar token missing
- 원인: turn boundary 중 `<gitdir>/mccp/tmp/goal-token-<run-id>.dat` deletion 또는 worktree switch.
- 복구: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/goal-phase-lock.js detect-stale` 호출, lock이 reclaim되면 본 명령 재호출.

### Lock-held / stale lock
- 원인: 이전 invocation이 정상 종료 못 함.
- 복구: detect-stale로 reclaim 또는 90s mtime 만료 후 자동 reclaim.

### `/goal` mode 진입 못 함
- 원인: Claude Code v2.1.139 미만 또는 `disableAllHooks` 설정.
- 복구: 사용자 환경 점검. detect probe가 이 경우를 모두 `unknown`으로 처리하므로 본 명령은 silent skip하지만, Phase 2 진입 후 사용자가 `/goal`을 실패하면 `goal-failed:` grammar로 종료해도 됨.

### Cost ceiling breach mid-loop
- Phase 0이 critical 시 STOP하지만, `/goal` loop 도중 cost가 증가하면 사용자 책임 — `/goal clear`로 early-exit 권장 (acceptance condition 자체에 "or stop after N turns" clause 포함 권장).

## Out of scope

- 자동 PR 생성 (별도 `/mccp:pr`).
- 자동 plan-archive (Phase 3 closure 결과에 따라 사용자 또는 후속 `/mccp:pr` 단계가 처리).
- mccp-milestone-close-codex 신규 receipt gate — option B 채택. dogfood signal 기반 option A 전환 가능.

## See also

- `/mccp:work` — full-chain orchestrator (PRD→plan→implement→PR). milestone-close는 자동 orchestration 대상에 포함되지 않음 (사용자 explicit invocation 패턴).
- `/mccp:pr` — closure-doc anchor가 PR body에 자동 반영.
- [docs/automation-modernization/integration-template.md](../../docs/automation-modernization/integration-template.md) — axis C cells.
- [plan: v1.4.0 axis C — /goal milestone-close](../../.claude/plans/v1-4-0-m3-goal-milestone-close.plan.md).
