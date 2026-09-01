# 오케스트레이션 · 병렬 · 핸드오프

> `docs/ENVIRONMENT.md`의 **orchestration** 도메인 상세. 색인은 값과 기본값만 싣고 서사는 여기 있다.

`/mccp:work`의 격리·병렬·병합, plan fan-out, runaway 방지, dispatch 전달을 지배한다. 비용과 직접 맞물리므로 cost 도메인과 함께 읽는다.

## 읽는 법

각 토글은 자기 이름의 앵커를 갖고, 그 아래에 값·기본값·소비처·사용 예시가 온다. `값` 열의 어휘는 **문서가 가르치는 표기**이고, 파서가 실제로 받아 주는 별칭 집합은 그보다 넓다 — 정확한 집합은 색인의 «값 규약»에 있다.

**사용 예시**는 전부 `.claude/settings.json`의 `env` 블록에 그대로 붙여 넣을 수 있는 형태다. 1회성으로만 쓰는 토글은 셸 예시를 함께 둔다.

## 토글

### MCCP_WORK_ISOLATE_IMPLEMENT

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** implement worktree 격리.

**소비처** `plugins/mccp/scripts/lib/orchestration-preview.js:78`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_WORK_ISOLATE_IMPLEMENT": "off"
  }
}
```

### MCCP_WORK_IMPLEMENT_WORKFLOW

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** Workflow 런타임 사용.

**소비처** `plugins/mccp/scripts/lib/implement-dispatch/route.js:68`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_WORK_IMPLEMENT_WORKFLOW": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_WORK_ISOLATE_IMPLEMENT=0|1          # v1.20.2 default: 1 (격리 on). /mccp:work Step 3의 implement를 격리된 단일 worker Agent로 위임 — worker가 파일 탐색·edit·validate·Implement-Codex 게이트·receipt write를 자기 컨텍스트에서 수행하고 메인(controller)은 요약(변경 파일·receipt path·verdict)만 회수해 메인 피크 컨텍스트를 얇게 유지. dispatch-controller substrate(prepareDispatch/envelope schema/3-flag attribution)를 single-worker로 재사용. worker는 implement까지만 — commit/PR은 controller Step 4/5 전용(Codex F1: worker env·prompt로 auto-chain 금지 + Step 3.gate가 mccp-pr-codex receipt 유입 시 invariant HALT). 동기 단일 worker는 skipHeartbeat(Codex F2: stale-reclaim 대상 제외, orphan 없음). receipt는 3 attribution 플래그로 controller session에 anchor(repo-relative ipc path — Codex F3). =0이면 인라인 Skill(mccp:prp-implement) fallback(loud stderr, implement diff/validate가 메인에 누적 — baseline). 미지정/오타 시 격리(보수적 default = 상위 축). prepare-single 실패 시 자동 인라인 fallback. standalone /mccp:prp-implement엔 미적용(격리 locus는 work.md 오케스트레이터 한정). v1.20.7 M2a부터 이 축이 =1일 때 하위 축 MCCP_WORK_IMPLEMENT_WORKFLOW가 Task-격리 vs Workflow-격리를 결정.
  MCCP_WORK_IMPLEMENT_WORKFLOW=0|1         # v1.20.7 M2a default: 0 (Task-격리 유지). MCCP_WORK_ISOLATE_IMPLEMENT!=0(격리 활성)일 때의 하위 축 — implement 위임 채널을 Task에서 Workflow primitive의 agent()로 등가 이전(병렬화 전, M2b seam). =1 AND prepare-single 성공(dispatch-workflow-args.json 존재) AND Workflow tool이 세션에서 가용이면 /mccp:work Step 3.W(Workflow agent() → {result, dispatchId} 회수), 그 외(=0/미설정/오타, args 부재, tool 미가용)면 Step 3.I(기존 Task dispatch). 두 격리 경로 모두 Step 3.gate 통합 reconcile(deriveVerdict 3자: 반환값 ∧ envelope ∧ receipt-store)로 수렴 — 기존 envelope-only merge를 대체하며 F1 invariant(mccp-pr-codex leak → invariant-violation HARD HALT) + F2 reconciliation(status·receipt slug 집합·envelope pending 불일치 → reconcile-mismatch) + F3 anchor 검증(marker + 3-플래그 == expectedAnchor 아니면 unanchored)을 회수 채널 불문 적용. Codex F1 lifecycle 경계: Task fallback은 Workflow 호출 개시 전(started 표식 이전)에만 허용 — 개시 후 회수 실패는 두 번째 경쟁 worker 방지를 위해 fail-closed HALT(resumeFromRunId 재개 지시). fail-open: Workflow throw/미가용은 implement를 막지 않고 Task 경로로 강등. dual-review 무손상. standalone /mccp:prp-implement엔 미적용.
  MCCP_WORK_IMPLEMENT_PARALLEL=on|off|0|1   # v1.22.1 live-activation M1부터 default: on (발화 반전 — 이전 v1.20.10 M2b default 0에서 flip). `off`/`0`이 **단일 opt-out 축**(parseParallelMode default on). MCCP_WORK_IMPLEMENT_WORKFLOW의 하위 축 — Workflow 경로에서 implement를 N-worker parallel로 돌릴지. 미설정(=on) AND partition oracle이 N>1 서로소 partition 산출 AND resolveFleet run=true(merge_strategy·budget·catastrophic-USD 통과)이면 /mccp:work Step 3.WP(parallel(fleet.map(...)) + worktree 격리), 그 외는 Step 3.W(단일). **v1.22.3 M3 — operational tier 통과 요구 폐기**: sticky critical/`hard_ceiling`($100)에서도 발화하며, USD 차단은 catastrophic-USD(default $500)만 담당(`MCCP_ORCHESTRATION_USD_BOMB=1`로 M1 복원). 구조적 gate: MCCP_WORK_MERGE_STRATEGY가 worktree-merge가 아니면 무조건 N=1로 fail-close(아래). **opt-out 계약(Codex F1)**: `off`/`0` → 단일 worker Task(legacy) 경로 정확 복원(MCCP_WORK_IMPLEMENT_WORKFLOW default는 미변경 — 병렬 opt-out이 낯선 Workflow single leg로 새지 않음). dual-review 무손상(per-worker Implement-Codex + N-way mergeVerdicts fail-closed 집계). standalone /mccp:prp-implement엔 미적용.
```

### MCCP_WORK_IMPLEMENT_PARALLEL

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** 병렬 implement 허용.

**소비처** `plugins/mccp/commands/work.md:200`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_WORK_IMPLEMENT_PARALLEL": "off"
  }
}
```

### MCCP_WORK_PARALLEL_MAX

**종류** `int` — **값** 자유 문자열 — **기본값** `4`

**한 줄** 동시 worker 상한.

**소비처** `plugins/mccp/scripts/lib/implement-dispatch/budget.js:120`

**사용 예시**

```json
{
  "env": {
    "MCCP_WORK_PARALLEL_MAX": "4"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_WORK_PARALLEL_MAX=4                  # v1.20.10 M2b default: 4. partition oracle의 maxWorkers cap + resolveFleet의 N 상한. partition 수가 이를 초과하면 작은 partition을 병합해 cap으로 맞춘다. 비정상 값 → default.
```

### MCCP_WORK_PARALLEL_BUDGET

**종류** `int` — **값** 자유 문자열 — **기본값** `150000`

**한 줄** 병렬 최소 토큰 예산.

**소비처** `plugins/mccp/scripts/lib/implement-dispatch/budget.js:121`

**사용 예시**

```json
{
  "env": {
    "MCCP_WORK_PARALLEL_BUDGET": "150000"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_WORK_PARALLEL_BUDGET=150000         # v1.20.10 M2b default: 150000. worker당 최소 예상 토큰. resolveFleet이 minRemaining=이 값×N으로 환산 → Workflow가 budget.total 설정 시(사용자 +Nk) budget.remaining()<minRemaining이면 spawn 없이 skip. budget.total+budgetRemaining을 caller가 공급하면 resolveFleet이 감당 가능 N으로 cap(2 미만이면 budget-insufficient→N=1). 비정상 값 → default + loud warn.
```

### MCCP_WORK_PARALLEL_AUTODISABLE_TIER

**종류** `list` — **값** 자유 문자열 — **기본값** 빈 값

**한 줄** 병렬 자동 해제 tier.

**소비처** `plugins/mccp/scripts/lib/implement-dispatch/budget.js:122`

**멤버 어휘**

**허용 토큰** — `plugins/mccp/scripts/lib/implement-dispatch/budget.js#allowed`에서 파생된다. 오늘의 토큰은 `green` · `notice` · `warning` · `critical`이다.

**미상 멤버** — 토큰 하나라도 열거 밖이면 override 전체가 무효가 된다 (implement-dispatch/budget.js:122 parseTierOverride)

**사용 예시**

```json
{
  "env": {
    "MCCP_WORK_PARALLEL_AUTODISABLE_TIER": "a,b"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_WORK_PARALLEL_AUTODISABLE_TIER=""     # v1.22.3 M3부터 default: **empty**(resolveFanout 미러 — 어떤 operational tier도 fleet을 막지 않음). 명시 지정 시(comma-separated subset of {green,notice,warning,critical}) 해당 tier를 다시 차단하며, 명시 override는 default·usdBomb 무관 **항상 우선**. `MCCP_ORCHESTRATION_USD_BOMB=1`이면 default가 M1의 critical-only로 복원. cost-state missing/corrupt는 default costFailOpen이면 green 가정 run; `=0`이면 옛 cost-state-unknown fail-closed skip. parse 실패/unknown token → default + warn.
```

### MCCP_WORK_MERGE_STRATEGY

**종류** `enum` — **값** `worktree-merge` · `sequential` — **기본값** `worktree-merge`

**한 줄** worker 산출물 병합 전략.

**소비처** `plugins/mccp/scripts/lib/orchestration-preview.js:70`

**값별 결과**

- `worktree-merge` — worker 산출물을 worktree 병합으로 합친다. 병렬 implement가 가능한 유일한 값이다.
- `sequential` — 병렬을 끄고 순차로 처리한다.

정본 판정은 `plugins/mccp/commands/work.md`의 셸 문자열 비교이고 JS(`orchestration-preview.js`)는 그 mirror다 — 두 경로가 오타를 다르게 처리하므로(preview는 warn 후 기본값 복귀, live는 «worktree-merge가 아니므로» 병렬 해제) 이 토글은 어휘 상수로 승격되지 않았다.

**사용 예시**

```json
{
  "env": {
    "MCCP_WORK_MERGE_STRATEGY": "sequential"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_WORK_MERGE_STRATEGY=disable-parallel|worktree-merge  # v1.21.0 M4부터 default: worktree-merge (Task 0 live dogfood이 상관 입증 → flip). 병렬 실행의 **구조적 gate** — resolveFleet이 이 값이 worktree-merge가 아니면 무조건 N=1로 fail-close(same-worktree A2 fallback은 atomic-merge 보호 실장 전까지 여전히 금지). M2b(v1.20.10)는 live 상관 미실측으로 default disable-parallel였으나, M4가 isolation:'worktree' worktree가 `<repo>/.claude/worktrees/wf_<runId>-<N>`에 생성·컨트롤러 enumerable·잔존하고 worker-seeded envelope로 collect-worktrees가 correlate함을 live 입증(run wf_1f689994-fb8/wf_98047bb7-1b1) → default를 worktree-merge로 승격. 병렬 실제 발화 조건은 v1.22.1 M1(PARALLEL default on — opt-out 축) + v1.22.3 M3(operational USD 비차단)을 거쳐 현재 **opt-out 안 함 + worktree-merge + N>1 partition + catastrophic-USD 미도달**이다 — cost-state green 요구는 폐기. `MCCP_WORK_MERGE_STRATEGY=disable-parallel` 명시 시 M2a 단일 동작으로 back-compat 강등. 미지정/기타 값 → worktree-merge(default).
```

### MCCP_WORK_MERGED_VERIFY

**종류** `enum` — **값** `enforce` · `warn` · `off` — **기본값** `enforce`

**한 줄** 병합 후 verify 모드.

**소비처** `plugins/mccp/scripts/lib/implement-dispatch/verify.js:38`

**값별 결과**

- `enforce` — 병합 후 verify가 비수렴이면 차단한다.
- `warn` — 판정은 그대로 내되 차단하지 않는다.
- `off` — 병합 후 verify를 끈다. 호출자가 그 사실을 loud하게 남긴다.

미설정과 열거 밖 값은 `enforce`로 되돌아간다(fail-closed + loud warn).

**사용 예시**

```json
{
  "env": {
    "MCCP_WORK_MERGED_VERIFY": "warn"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_WORK_MERGED_VERIFY=off|warn|enforce  # v1.20.12 M3 default: enforce (fail-closed). 위 3 병렬 축과 **직교(⊥)**. /mccp:work의 implement가 끝난 뒤(어떤 경로든 — 단일 Step 3.W/I·병렬 Step 3.WP·인라인 Step 3.F) **commit(Step 4) 전** Step 3.verify가 통합 diff를 worker 밖에서 1회 cross-model(Codex `codex-invoke.js adversarial-review`) 판정한다(PRD Open Question 1(c) pipeline-스테이지 답). `verify.js#decideMergedVerify`: `converged`→pass(Step 4 진행) · `divergent`/`critical`→HALT · `unavailable`×{enforce→HALT, warn→advisory pass} · `off` 또는 변경 없음→skipped. **DD6 — 단일 경로에서도 발화**하므로 병렬이 `disable-parallel`로 gated여도 M3 verify-네이티브화가 runtime 가치를 갖는다. **DD2 — invoker는 여전히 Codex(cross-model)**, same-model skeptic 치환 아님(dual-review 무손상). `MCCP_CODEX_DISABLED=1`이면 classification=disabled→verdict=skipped(pass). pass 시 신규 gate `mccp-implement-verify` receipt에 `meta.merged_verify_verdict`/`meta.merged_verify_rounds` stamp(audit anchor, non-invasive — 어떤 command chain에도 미진입). HALT은 runtime 1차 enforcement(receipt 무관 차단); 병렬 경로 HALT은 patch reverse-apply(F4)로 parent 복원, 단일/인라인은 uncommitted 변경 보존. 미지정/오타 → enforce(loud fail-closed). 복구: working tree에서 cross-cut 회귀 수정 후 재실행 **또는** `MCCP_WORK_MERGED_VERIFY=warn` advisory pass. /mccp:prp-implement standalone엔 미적용(verify locus는 work.md 오케스트레이터 한정).
```

### MCCP_PLAN_FANOUT

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** plan 다관점 fan-out.

**소비처** `plugins/mccp/scripts/lib/plan-fanout/budget.js:83`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_PLAN_FANOUT": "off"
  }
}
```

### MCCP_PLAN_FANOUT_BUDGET

**종류** `int` — **값** 자유 문자열 — **기본값** `150000`

**한 줄** fan-out 최소 예산.

**소비처** `plugins/mccp/scripts/lib/plan-fanout/budget.js:84`

**사용 예시**

```json
{
  "env": {
    "MCCP_PLAN_FANOUT_BUDGET": "150000"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PLAN_FANOUT_BUDGET=<tokens>           # v1.20.4 default: 150000. 관점당 최소 예상 토큰. resolveFanout이 minRemaining=이 값×fleetSize(4)로 환산 → Workflow가 budget.total 설정 시(사용자 +Nk 지시) budget.remaining() < minRemaining이면 agent() 0회 skip(Codex F2 사전 가드). budget.total 미설정 시 구조적 상한(fleetSize+effort:'low')만 유효. 비정상 값 → default + loud stderr warn.
```

### MCCP_PLAN_FANOUT_AUTODISABLE_TIER

**종류** `list` — **값** 자유 문자열 — **기본값** 빈 값

**한 줄** fan-out 자동 해제 tier.

**소비처** `plugins/mccp/scripts/lib/plan-fanout/budget.js:85`

**멤버 어휘**

**허용 토큰** — `plugins/mccp/scripts/lib/plan-fanout/budget.js#allowed`에서 파생된다. 오늘의 토큰은 `green` · `notice` · `warning` · `critical`이다.

**미상 멤버** — 토큰 하나라도 열거 밖이면 override 전체가 무효가 된다 (plan-fanout/budget.js:85 parseTierOverride)

**사용 예시**

```json
{
  "env": {
    "MCCP_PLAN_FANOUT_AUTODISABLE_TIER": "a,b"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PLAN_FANOUT_AUTODISABLE_TIER=""       # v1.22.3 M3부터 default: **empty**(어떤 operational tier도 fan-out을 막지 않음 — 이전 M1 default `critical`에서, 그 이전 v1.20.4 `notice,warning,critical`에서 순차 narrow). 운영자 철학상 operational 지출은 폭탄이 아니며, 폭주 방지는 catastrophic-USD + 원자 agent-count cap이 담당한다. 이 env에 명시 지정하면(comma-separated subset of {green,notice,warning,critical}) 해당 tier를 **다시 차단** — 명시 override는 default·usdBomb 무관하게 **항상 우선**. `MCCP_ORCHESTRATION_USD_BOMB=1`이면 default가 M1의 critical-only로 복원. cost-state missing/corrupt는 default costFailOpen이면 green 가정 run(COST_FAILOPEN); `MCCP_ORCHESTRATION_COST_FAIL_OPEN=0`이면 옛 cost-state-unknown fail-closed skip. hard_ceiling_reached는 M3부터 usdBomb에서만 별도 skip. parse 실패/unknown token → default + warn.
```

### MCCP_ORCHESTRATION_MAX_AGENTS

**종류** `int` — **값** 자유 문자열 — **기본값** `24`

**한 줄** agent 수 상한.

**소비처** `plugins/mccp/scripts/lib/orchestration-runaway.js:100`

**사용 예시**

```json
{
  "env": {
    "MCCP_ORCHESTRATION_MAX_AGENTS": "24"
  }
}
```

### MCCP_ORCHESTRATION_CATASTROPHIC_USD

**종류** `int` — **값** 자유 문자열 — **기본값** `500`

**한 줄** catastrophic 판정 USD.

**소비처** `plugins/mccp/scripts/lib/orchestration-runaway.js:115`

**사용 예시**

```json
{
  "env": {
    "MCCP_ORCHESTRATION_CATASTROPHIC_USD": "500"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_ORCHESTRATION_CATASTROPHIC_USD=500    # v1.22.3 M3 default: 500(USD). **대체 bomb detector**(Codex F1). M3이 operational USD tier($50 notice/$80 warning/$100 critical + hard_ceiling)를 발화 blocker에서 은퇴시키면서, 그와 **분리된 훨씬 높은** 임계를 신설했다 — `cost_usd >= 이 값`이면 resolveFleet/resolveFanout이 `skip(CATASTROPHIC_USD)` + auto-chain이 `cost-catastrophic` abort. 실측 sticky $186.92는 통과하고 진짜 폭주 비용은 차단한다. `MCCP_ORCHESTRATION_USD_BOMB`과 **무관하게 항상 유효**(운영자가 catastrophic까지 끄려면 아주 큰 값 지정). loud fail-open parse(비정상/음수/0 → default 500 + warn).
```

### MCCP_ORCHESTRATION_USD_BOMB

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** USD bomb 강제 판정.

**소비처** `plugins/mccp/scripts/lib/orchestration-runaway.js:112`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_ORCHESTRATION_USD_BOMB": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_ORCHESTRATION_USD_BOMB=0|1            # v1.22.3 M3 default: off. **back-compat kill switch**(Codex F4) — M1 operational-USD bomb-detector를 전 표면에서 정확 복원한다: resolveFleet/resolveFanout의 `hard_ceiling_reached` skip(`HARD_CEILING`) + critical tier autoDisable(`TIER_CRITICAL`) + auto-chain의 `cost-hard-ceiling` abort. 표준 vocabulary `1|true|yes|on`(대소문자 무시)이 on, `0|false|no|off|미설정`이 off. **unknown non-empty → off + loud stderr warn** — 이건 rollback path라 오타로 bomb이 조용히 비활성되면 안 된다(정직 warn 필수). catastrophic-USD 축과 독립.
```

### MCCP_ORCHESTRATION_COST_FAIL_OPEN

**종류** `bool` — **값** `on` · `off` — **기본값** `on`

**한 줄** 비용 신호 부재 시 진행.

**소비처** `plugins/mccp/scripts/lib/orchestration-preview.js:61`

**극성** 미설정이면 **켜져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_ORCHESTRATION_COST_FAIL_OPEN": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_PLAN_FANOUT=on|off                    # v1.22.1 live-activation M1부터 default: on (발화 반전 — 이전 v1.20.4 default off에서 flip). `off`/`0`으로 opt-out. 미설정(=on) + PRD artifact mode(`.prd.md` 입력) + catastrophic-USD 미도달 시에(**v1.22.3 M3** — operational tier autoDisable·hard_ceiling 조건은 폐기: sticky critical에서도 발화) /mccp:plan Phase 2.5가 4개 read-only 관점(architect/security/test/explorer)을 Workflow primitive로 병렬 fan-out → pure synthesize → plan body `## Multi-Perspective Fan-out` 주입. **cost fail-open**(live-activation M1): cost-state 부재 시 green 가정 run(COST_FAILOPEN) — MCCP_ORCHESTRATION_COST_FAIL_OPEN=0으로 옛 fail-closed skip 복원. read-only agent(도구 부재)라 파일 변형·receipt write 구조적 불가 → Codex dual-review·receipt chain 무손상(fan-out 결과는 plan_hash에 포함돼 review됨). skip/Workflow throw/미가용 → 인라인 Pattern Grounding fallback(fail-open, plan 절대 안 막음). free-form(비-PRD) 입력엔 미적용.
  MCCP_ORCHESTRATION_COST_FAIL_OPEN=0        # v1.22.1 M1 default: on(미설정=fail-open). resolveFanout/resolveFleet의 cost-state **부재** 처리 축. default(미설정 또는 `=0` 아님) → cost-state null/corrupt를 green 가정 run(COST_FAILOPEN reason). `=0` kill switch → 옛 fail-closed COST_STATE_UNKNOWN skip 정확 복원(back-compat). cost-state가 없어도(예: 새 세션, subscription, telemetry 미기록) 자동화가 진행. **주의(v1.22.3 M3)**: 이 축은 cost-state **부재**만 다룬다 — **존재하는** sticky critical/hard_ceiling은 M1에서 여전히 발화를 막았고, 그 축을 연 것이 아래 M3 두 토글이다.
```

### MCCP_ORCHESTRATION_RESERVATION_LEASE_MS

**종류** `int` — **값** 자유 문자열 — **기본값** `600000`

**한 줄** 예약 lease 유효 시간.

**소비처** `plugins/mccp/scripts/lib/orchestration-runaway.js:108`

**사용 예시**

```json
{
  "env": {
    "MCCP_ORCHESTRATION_RESERVATION_LEASE_MS": "600000"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_ORCHESTRATION_MAX_AGENTS=24           # v1.22.1 M1 default: 24. cost-state와 **독립적인** catastrophic-runaway 절대 상한(orchestration-runaway.js). 세션 키(CLAUDE_SESSION_ID) 누적 worker-launch 카운터(.claude/state/orchestration-runaway.json, cost-state.js lock 패턴 mirror)가 이 값을 초과 예정이면 fleet N을 **남은 headroom**으로 clamp하며, headroom이 0이면 **`granted:0`(`cap-exhausted`)**. 반복/재귀/재시도 누적이 telemetry 부재를 우회 못 하게 하는 최후 안전판. **v1.22.3 M3 follow-up(PR-Codex R1 F1, 5라운드) — floor 1 폐기**: 이전 서술은 "degraded로 1로 clamp(0 아님 — 단일 worker는 항상 진행)"였고 그게 이 값을 cap이 아니라 **병렬도 throttle**로 만들었다. `reserveWorkers`는 grant한 만큼을 **기록**하므로, cap 도달 후 모든 호출이 1개씩 grant+기록해 `launched`가 25, 26, 27… **무한 증가**했다(cap=4 실측: 5,6,7,8,9). 반복/재귀 dispatch — 정확히 이 cap이 존재하는 이유인 그 시나리오 — 가 상한 없이 초과할 수 있었고, operational USD를 은퇴시킨 M3에서 이 카운터가 **유일한** 구조적 backstop이므로 "cap이 막는다"는 헤드라인이 거짓이었다. floor의 명분("파이프라인을 완전히 막지 않는다")은 호출자의 **인라인 fallback**이 이미 제공한다 — cap이 이미 써버린 agent를 나눠주는 것으로 제공하는 게 아니다. `n===0`은 `cap-exhausted`(검증됨, 답은 no)로, `lock-exhausted`(검증 불가)와 구분된다. loud fail-open parse(비정상 값 → default 24 + warn). **v1.22.3 M3 변경 2건**: (1) clamp가 fail-open 경로 전용이 아니라 **전 run 경로**(metered 포함)에 적용된다 — operational USD가 더 이상 metered 경로도 막지 않으므로 agent-count가 양쪽의 primary backstop이다. (2) 발화 caller(work.md/plan.md)는 read-then-bump가 아니라 **원자 `reserveWorkers`**(단일 lock 임계구역 check-and-bump)를 쓴다 — 재진입/동시 dispatch가 같은 pre-bump 값을 관측해 각자 full fleet을 grant하던 TOCTOU 봉인(Codex F2). **lock 고갈 시 `granted:0`(fail-closed)** — PR-Codex R1 F1: 이전엔 1을 주며 "fail-safe"라 불렀으나 lock이 없으면 write도 없어 그 worker는 **기록되지 않고** `reservationId`도 없어 reconcile 대상이 아니다. 고갈이 반복되면 호출당 1개씩 untracked launch가 새어 cap이 원리상 무한 우회된다 — cap이 primary backstop이 된 바로 그 지점에서. 기록할 수 없는 launch를 허가하는 것은 cap 관점에서 fail-open이다. 더 기다리는 건 답이 아니고(`acquireLock`이 이미 재시도 + stale 파괴를 하므로 고갈 = 살아있는 holder가 창 내내 점유), debt 선기록은 lock 부재로 원리상 불가. 두 호출자 모두 **인라인 fallback**(work.md → 인라인 implement / plan.md → 인라인 Pattern Grounding)을 갖고 인라인은 agent를 안 띄워 cap을 미소비하므로 fail-closed가 파이프라인을 막지 않는다 — 불변식 **"모든 agent launch는 기록된다"**가 예외 없이 성립. 두 budget 오라클은 clamp `n===0`을 `run:false`+`lock-exhausted` skip으로 해석하고(`n>=1` 가드에 걸려 무시되면 수정이 무력), `resolveWorkRoute`는 신규 `reserveDenied` 축(prep-parallel이 쓰는 `dispatch-cap-denied.json` 아티팩트 — shell-state 독립)으로 **inline 강제**한다(fleet만 skip하면 task/workflow-single이 여전히 단일 worker를 untracked로 띄워 같은 누수가 축소된 채 잔존). read-only firing-preview는 bump 없는 pure `clampForRunaway`를 계속 쓴다(관측이 headroom을 소비하면 안 됨 — test가 정적 검증). **preview와 발화 경로는 같은 공식을 공유한다**(R1 F1 5라운드): read-only 불변식은 "mutate 금지"이지 "답의 모양 고정"이 아니므로, preview만 floor 1을 유지하면 발화가 거부될 상황에서 "1개 뜬다"고 보고하는 **false green-light**가 된다 — M2 Codex F1이 `effective_fire`로 막으려던 바로 그 실패 유형. 순수성(I/O·bump 없음)이 read-only를 보장하지, 공식이 보장하는 게 아니다. **v1.22.3 M3 follow-up(PR-Codex R1 F2) — 예약은 2단계(pending → committed)**: `reserveWorkers`는 이제 슬롯을 영구 소진하지 않고 `reservationId`를 반환하며 grant를 **pending**(`open[]`)으로 기록한다. 실제 launch 수가 확정되는 지점(work.md **Step 3.route** — 유일한 reconcile 지점 / plan.md **2.5.3**)에서 `reconcile --reservation <id> --actual <n>`으로 **정정 후 commit**한다: `workflow-parallel`→granted · `workflow-single`/`task`→**1**(강등돼도 단일 worker는 실제로 뜨므로 전량 release는 over-permissive) · `inline`/`skipped`→0. 이 정정이 없던 시절엔 prepare-fleet 실패·route fallback·fan-out budget skip 경로가 worker 0개로 끝나면서 headroom만 갉아(**유령 예약**) 이후 실제 작업을 조기에 N=1로 강등시켰다 — cap이 primary backstop이라는 M3 주장 자체의 정확성 결함. `launched`는 committed + pending 합(보수적)이며, **pending만** `MCCP_ORCHESTRATION_RESERVATION_LEASE_MS` 후 만료된다(committed는 영구 — 실 launch는 절대 미카운트 안 됨). **v1.22.3 M3 follow-up(Implement-Codex R1 F1, 7라운드) — 예약을 공통 pre-launch 경계로 이동**: 4·5·6라운드가 전부 `reserveWorkers` **안팎의** 구멍을 닫는 동안, 진짜 결함은 **그 함수가 불리는 범위**였다. 예약은 `resolveFleet`의 주입 `runawayClamp` 안에서만 일어났고 `resolveFleet`은 work.md의 **4중 가드**(`ISOLATE≠0 ∧ PARALLEL≠off ∧ merge-strategy=worktree-merge ∧ partitions) 뒤에서만 실행됐다. 그런데 Step 3.route는 **무조건** 돌며 `task`/`workflow-single`을 반환하고 둘 다 worker를 **실제로 spawn**한다 — 예약 없이. 즉 **cap은 병렬 fleet worker만 세어 왔고**, default 단일 worker 구성(`PARALLEL=off`·merge-strategy 비활성·single-partition plan·budget-insufficient)에서는 `launched`가 **영원히 0**이었다(A/B 실측: cap=4, 9회 호출 → BEFORE 9개 spawn·counter 0 / AFTER 4개 spawn·counter 4). "모든 agent launch는 기록된다"는 불변식은 **한 번도 참인 적이 없었고**, 6라운드 fix-task의 sweep 기준 (c)"예약 미시도 = cap 미소비"는 정확히 거꾸로였다(실제로는 **기록 없이 cap 소비**). cap을 소비할지 정하는 건 예약 시도 여부가 아니라 **route**(agent가 뜨는가)다. 이제 Step 3.route가 fleet 예약이 없고 `route.js#requiresReservation($ROUTE)`가 참이면 `orchestration-runaway.js reserve --n 1`로 **공통 경계에서 예약**하고, `granted:0`이면 `ROUTE=inline`으로 강등(기록 불가능한 launch 금지), 아니면 즉시 `--actual 1` commit 후 launch한다. commit 실패는 HALT(route가 pre-launch 경계라 중단해도 un-spawn할 게 없다). `requiresReservation`은 순수 오라클이고 `route.test.js`가 ROUTES enum **전수**를 검증해(5→6라운드의 "새 enum 값을 만들고 소비처를 안 고침" 실패 형태 방어) 새 route가 분류 없이 추가되면 실패한다.
  MCCP_ORCHESTRATION_RESERVATION_LEASE_MS=600000  # v1.22.3 M3 follow-up default: 600000(10분). **pending** 예약의 lease(orchestration-runaway.js). reserve 후 route에 닿지 못한 채(크래시·중단 턴) 방치된 예약을 이 시간 뒤 자동 회수해 세션이 영구 N=1로 자기중독되는 것을 막는다(R1 F3) — `cost-state.js#decayIfStale`의 시간축 자기치유 미러. **만료가 안전한 이유는 구조적**이다: pending 창(reserve→route)은 `work.md`가 route를 "worker를 spawn하기 전" 경계로 명시(M2a Codex F1)하므로 launch가 0이며, 따라서 만료-drop이 실제 worker를 미카운트할 수 없다. commit된 예약은 `open[]`에서 제거돼 만료 대상이 아니다. fan-out은 route 경계가 없어(Workflow 호출 자체가 launch 지점) 호출 후 전 경로를 명시 commit한다. **v1.22.3 M3 follow-up(PR-Codex R1 F2, 5라운드) — debt 마커**: 그 "전 경로 명시 commit" 전제가 한 경로에서 깨져 있었다. plan.md의 fan-out은 reconcile이 3회 재시도 후 실패하면 `"cap may under-count"`를 경고하고 **진행**했고(fan-out은 plan을 막으면 안 되므로 halt 불가), 예약은 pending으로 남아 lease가 **실제로 뜬 agent를 prune**했다. 당시 주석은 잔여 오차를 "conservative over-count until the lease resolves it"이라 적었으나, lease는 오차를 해소하는 게 아니라 안전한 over-count를 **위험한 under-count로 뒤집는다** — cap이 절대 틀리면 안 되는 over-permissive 방향. 이제 reconcile CLI가 `actual > 0`인데 commit 못 하면 **lock-free debt 마커**(`orchestration-runaway.json.debt/<id>.json`)를 남겨 `readCounter`·`reconcileReservation`이 그 항목을 만료 대상에서 제외한다(마커가 lock-free여야 하는 이유: debt를 만드는 유일한 상황이 정확히 lock 획득 실패이므로 마커에 또 lock을 요구하면 순환). 마커는 **기존 pending 항목을 고정**할 뿐 카운트를 더하지 않아 이중 계산이 없고, 뒤늦은 reconcile이 commit하며 마커를 청소한다. `work.md`는 route가 launch **전** 경계라 그냥 HALT하면 되므로(exit 1) debt가 불필요 — 두 경로의 비대칭은 의도된 것이다. `0`은 kill switch가 **아니다** — 만료 비활성은 자기중독 복원이므로 비정상 값으로 취급해 default + loud warn. read-side(`readCounter`)는 만료된 pending을 **뷰에서만** 제외하고 write는 하지 않는다(preview의 read-only 불변식 보존 — test가 디스크 불변 검증). **v1.22.3 M3 follow-up(Implement-Codex R1 F2, 7라운드) — pin은 launch *전*에**: 5라운드는 debt 마커를 reconcile **실패 시**(사후) 기록했는데, 그건 reconcile 블록에 **도달했을 때만** 작동한다. fan-out은 Workflow 호출 자체가 launch 지점이라, 호출 후 컨트롤러가 timeout/crash하면 그 블록에 영영 못 닿고 pending이 lease에 prune된다 — 실 launch 소실. 중간 초안의 "started 마커" 안은 오답이었다: `readCounter`는 **debt 마커만** 존중하므로, 사후 핸들러만 읽는 마커는 정확히 그 핸들러를 놓쳤을 때 무의미하다. 이제 plan.md 2.5.2는 **Workflow 호출 직전에 진짜 debt 마커를 pin**하고(`orchestration-runaway.js mark-debt`), pin 실패 시 **Workflow를 호출하지 않는다**(기록 불가능한 launch 금지 → 인라인 Pattern Grounding, fan-out은 GROUND 보강이라 plan 미차단). 정상 경로의 2.5.3 reconcile이 commit하며 `clearDebt`로 청소한다. **PR-Codex R1(5라운드 PR 게이트) — pin은 영구, 시간축 decay 기각**: 7라운드는 pin의 영구 고정이 자기중독을 재도입한다며 `MCCP_ORCHESTRATION_DEBT_DECAY_HOURS` 시간축 decay를 얹었으나, PR-Codex가 반려했다 — 마커가 컨트롤러 death 후에도 존재한다는 것 자체가 그 agent들이 실제로 떴다는 증거이므로, aging-out은 `readCounter`가 실 launch를 차감하게 만드는 **under-count**(cap이 절대 틀리면 안 되는 over-permissive 방향)다. 따라서 `readDebtIds`의 decay를 제거하고 pin을 **영구**로 되돌렸다(`parseDebtDecayHours`·`ENV_DEBT_DECAY_HOURS` 삭제). 영구 pin이 남기는 자기중독은 bounded다: counter가 session-keyed라 다음 세션에 리셋되고, dead-controller 사건당 ≤fleetSize(≤4)/`MAX_AGENTS`만 소진 — bounded·self-resetting liveness 비용이 cap을 절대 우회하지 않는 것의 정당한 대가다(회귀 test: aged 마커도 실 launch 카운트 유지 + 다른 session은 fresh).
```

### MCCP_ORCHESTRATOR_POLL_MS

**종류** `int` — **값** 자유 문자열 — **기본값** `500`

**한 줄** watcher 폴링 간격.

**소비처** `plugins/mccp/scripts/lib/dispatch-watcher.js:63`

**사용 예시**

```json
{
  "env": {
    "MCCP_ORCHESTRATOR_POLL_MS": "500"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_ORCHESTRATOR_POLL_MS=500            # default. dispatch-watcher polling 간격. 낮추면 envelope detection 빠름, CPU 증가. ─ live (M1)
```

### MCCP_DISPATCH_CONTEXT

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** dispatch worker 선언.

**소비처** `plugins/mccp/scripts/receipt/write.js:75`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_DISPATCH_CONTEXT": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_DISPATCH_CONTEXT=0|1                # default: 0. =1 시 mccp-receipt write가 controller-context marker 자동 stamp + 3 attribution flags(--dispatched-by-controller-session/--worker-dispatch-id/--ipc-envelope-path) 모두 require. 누락 시 fail-closed exit 12 (F2 absorption). marker detect는 env=1 OR 3 flag 중 하나라도 공급 OR ipc-envelope 파일 존재 중 하나 — detect되면 3 flag 전부 require(부분 공급은 write 시점 fail-closed, receipt/write.js#detectDispatchContext). 따라서 worker가 prompt 지시대로 3 flag를 forward하면 env=0에서도 anchor가 보장되고, 완전 미forward는 reconcile F3(work v1.20.7)가 unanchored로 별도 HALT한다. env=1은 완전 미forward를 write 시점에 즉시 잡는 추가 강제 옵션 — work.md/dispatch-cli.js는 이 env를 자동 set하지 않는다(LLM 매개 Task/Workflow dispatch는 Bash export를 worker 프로세스에 전달하지 못하므로, 세션-레벨 settings.json으로만 활성). ─ live (M1)
```

### MCCP_AUTO_HANDOFF

**종류** `enum` — **값** `off` · `notify` · `spawn` — **기본값** `notify`

**한 줄** 핸드오프 신호 처리.

**소비처** `plugins/mccp/scripts/derive/sources/toggle-usage.js:142`

**값별 결과**

- `off` — lock도 spawn도 STATE.md 기록도 하지 않는다. 즉시 noop으로 끝난다.
- `notify` — stderr 안내와 STATE.md의 handoff_spawn 신호만 쓴다. 실제 spawn은 하지 않는다.
- `spawn` — 실제로 새 세션을 띄운다. claude 바이너리나 (win32 밖의) tmux가 없으면 notify로 강등하고 그 사유를 기록한다.

`notify`가 기본이며 `/mccp:resume`이 그 신호를 읽어 다음 명령으로 dispatch한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_AUTO_HANDOFF": "off"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  | `MCCP_AUTO_HANDOFF` | `off` \| `notify` \| `spawn` | `notify` | 누적 비용($50 notice / $80 soft / $100 hard) 임계에서 자동 세션 전환 동작. `off`=no-op, `notify`=desktop notification + stdout meta, `spawn`=tmux new-window 또는 Windows Start-Process(race-lock). **현재 환경변수만 예약된 상태**, S10b 구현 시 wire. |
  MCCP_AUTO_HANDOFF=off|notify             # default: notify. cost-tier 검출 + STATE.md write + stderr 배너. 실제 세션 spawn은 아래 experimental flag에 종속됨. (spawn은 v1.1.0+ deprecated alias — flag 없으면 notify로 강등됨, ledger에 experimental_spawn_requested=true 기록.)
```

### MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** 실험적 세션 spawn.

**소비처** `plugins/mccp/scripts/state/session-spawner.js:282`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN": "on"
  }
}
```

**v1.29.0 원문** — 색인 축약 이전의 서술을 줄 단위로 보존한다.

```text
  MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1   # v1.1.0+ opt-in. PATH에 claude binary 필요. 미설정 + MCCP_AUTO_HANDOFF=spawn 요청 시 notify로 강등 + fallback_reason='spawn-experimental-flag-missing'. IDE-launched sessions에서 spawn은 거의 항상 실패하므로 default 미설정 권장.
```

### MCCP_MULTI_SESSION_SCAN

**종류** `bool` — **값** `on` · `off` — **기본값** `off`

**한 줄** 다중 세션 스캔.

**소비처** `plugins/mccp/scripts/derive/sources/worktrees.js:316`

**극성** 미설정이면 **꺼져 있다**. 극성은 레지스트리가 선언하고 파서는 읽기만 한다.

**사용 예시**

```json
{
  "env": {
    "MCCP_MULTI_SESSION_SCAN": "on"
  }
}
```

