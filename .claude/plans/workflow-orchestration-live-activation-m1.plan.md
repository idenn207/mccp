# Plan: Workflow Orchestration Live Activation — M1 (발화 조건 반전 + 검증 harness)

**Source PRD**: `.claude/prds/workflow-orchestration-live-activation.prd.md`
**Selected Milestone**: M1 — 발화 조건 반전 + 검증 harness
**Complexity**: Medium

## Summary

fan-out(`MCCP_PLAN_FANOUT`)·병렬 implement(`MCCP_WORK_IMPLEMENT_PARALLEL`)를 **default 발화**로 반전하고(단일은 명시적 opt-out), cost-state 부재 시 `COST_STATE_UNKNOWN` fail-closed skip을 **fail-open(green 가정)**으로 뒤집는다. 폭주 방지는 이미 있는 구조적 상한(fixed fleetSize=4 / `MCCP_WORK_PARALLEL_MAX`)과 **USD tier critical / `hard_ceiling_reached` bomb-detector**만 남긴 catastrophic-runaway 최후 안전판으로 재정의한다(notice/warning tier autoDisable은 제거 — 운영자 철학상 $50/$80은 폭탄 아님). 마지막으로 실제 LLM 발화 없이 seed→mark→collect→reconcile 배선을 관측하는 **저비용 검증 harness**(합성 git-worktree e2e)를 추가해, M2 live 완주 전에 배선 끊김을 사전 제거한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Mode parse (opt-in→opt-out) | `plugins/mccp/scripts/lib/implement-dispatch/budget.js:74-77` | `parseParallelMode` — `'1'|'on'` → on. 반전: `'0'|'off'` → off, 그 외 on |
| Cost fail-open vs fail-closed | `plugins/mccp/scripts/lib/plan-fanout/budget.js:120-131` (subscription branch) | subscription 축은 이미 fail-open(absent→green run). metered 축에 동형 `costFailOpen` branch 추가 |
| Loud fail-open env parse | `plugins/mccp/scripts/lib/subscription.js:68-108` `parseOverflowThresholds` | invariant 위반 시 default + `warn()` stderr. 새 kill-switch env 동일 패턴 |
| Frozen REASONS enum | `plugins/mccp/scripts/lib/implement-dispatch/budget.js:40-53` | `Object.freeze` REASONS에 fail-open/cap 사유 추가 |
| Command-body env default | `plugins/mccp/commands/work.md:157-166` | `${MCCP_WORK_IMPLEMENT_PARALLEL:-0}` bash default. 반전: `:-1` + 주석으로 oracle default mirror 명시 |
| 합성 git-worktree e2e | `plugins/mccp/scripts/lib/implement-dispatch/tests/worktree-merge.test.js` | temp repo + 실제 `git worktree` + fake worker(seed+mark만) → reconcile 검증. LLM 미호출 |
| Oracle unit test | `plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js:17-153` | `resolveFanout`/`resolveFleet` 결정 트리 case별 assert. 새 default·fail-open·cap case 추가 |
| Present-only receipt audit | `plugins/mccp/scripts/lib/subscription.js` REASONS forward | reason 로그를 command body가 stderr로 표면화(발화율 metric) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-fanout/budget.js` | UPDATE | `parseFanoutMode` default off→on(opt-out). `resolveFanout`에 `costFailOpen` branch(unknown→green run) + tier autoDisable를 critical-only로 narrow. runaway clamp 적용. REASONS 추가 |
| `plugins/mccp/scripts/lib/implement-dispatch/budget.js` | UPDATE | `parseParallelMode` default off→on(opt-out). `resolveFleet`에 `costFailOpen` branch + critical-only narrow. runaway clamp 적용 |
| `plugins/mccp/scripts/lib/orchestration-runaway.js` | CREATE | **(Codex F2)** cost-state 독립 catastrophic-runaway 최후 안전판 — 세션 누적 worker-launch 카운터 + 절대 env cap `MCCP_ORCHESTRATION_MAX_AGENTS`. fail-open N을 clamp(초과 시 degraded maxWorkers=1). cost-state.js lock 패턴 mirror |
| `plugins/mccp/scripts/lib/implement-dispatch/route.js` | CREATE | **(Codex F3)** `resolveWorkRoute(env, artifacts)` — Step 3 route 결정 트리(inline/task/workflow-single/workflow-parallel)를 순수 함수로 승격. work.md bash gate가 이 oracle을 호출(단일 SoT) → route 로직 mechanical 테스트화 |
| `plugins/mccp/commands/work.md` | UPDATE | Step 3.prep-parallel `PARALLEL` default `:-0`→`:-1`. **WORKFLOW default flip 제거(Codex F1)** — `PARALLEL=off/0` opt-out 시 단일 worker legacy Task 경로 정확 복원. route를 `resolveWorkRoute` oracle로 위임. `costFailOpen`+runaway forward. 양성 발화 로그 + opt-out 안내 |
| `plugins/mccp/commands/plan.md` | UPDATE | Phase 2.5.1 `costFailOpen`+runaway forward + 양성 발화 로그. opt-out 안내(default on) |
| `plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js` | UPDATE | default on·fail-open·critical-only·runaway-clamp case로 갱신(기존 off/fail-closed assert는 opt-out/kill-switch case로 보존) |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js` | UPDATE | 동상 갱신 |
| `plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js` | CREATE | **(Codex F2)** cost-state 부재가 runaway cap을 우회 못 함 + degraded clamp + 카운터 증가/리셋 검증 |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/route.test.js` | CREATE | **(Codex F1+F3)** env 조합 전수(PARALLEL off/0/unset × WORKFLOW × ISOLATE × artifact 유무 × Workflow 가용/미가용) route 결정 assert |
| `plugins/mccp/scripts/lib/implement-dispatch/tests/dispatch-wiring-harness.test.js` | CREATE | 저비용 검증 harness — 합성 git-worktree seed→mark→collect→reconcile e2e(LLM 미호출) |
| `plugins/mccp/agents/fanout-architect.md` (+ security/test/explorer) | VERIFY | 4개 fanout-* agent frontmatter·도구셋(Read/Grep/Glob only) 유효성 검증. 손상 시에만 수정 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.22.0`→`1.22.1` (단일 milestone = patch, §3.7) — 새 cache 디렉토리 확보(fanout-* agent install-cache blocker 해소) |
| `CHANGELOG.md` | UPDATE | v1.22.1-m1 row |
| `CLAUDE.md` | UPDATE | §1.4 새 row + §4 토글 default 반전·kill switch·runaway cap 문서화 |

## Tasks

### Task 1: fan-out oracle 발화 반전 (`plan-fanout/budget.js`)
- **Action**:
  - `parseFanoutMode`: 반전 — `String(raw).trim().toLowerCase()`가 `'off'|'0'`이면 `'off'`, 그 외(unset 포함) `'on'`.
  - `resolveFanout`: metered branch(현 line 133-152)를 재구성. 새 opt `costFailOpen`(default true, caller가 kill-switch로 false 전달 가능):
    - cost-state 읽기 실패/null + `costFailOpen` → `run:true` + tier `'green'` + 신규 REASON `COST_FAILOPEN`(skip 아님).
    - cost-state 읽기 실패/null + `!costFailOpen` → 기존 `COST_STATE_UNKNOWN` skip 유지(back-compat).
    - autoDisable 기본 집합을 `{critical}`로 narrow(운영자 철학 — notice/warning은 폭탄 아님). `hard_ceiling_reached===true`도 skip(bomb detector). `MCCP_PLAN_FANOUT_AUTODISABLE_TIER` override는 그대로 존중.
  - REASONS에 `COST_FAILOPEN: 'cost-failopen'` 추가(frozen).
- **Mirror**: subscription branch의 fail-open 구조(`budget.js:120-131`), frozen REASONS(`implement-dispatch/budget.js:40-53`).
- **Validate**: `node --test plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js`

### Task 2: parallel oracle 발화 반전 (`implement-dispatch/budget.js`)
- **Action**:
  - `parseParallelMode`: 반전 — `'0'|'off'`이면 off, 그 외 on.
  - `resolveFleet` metered branch(현 line 159-178): Task 1과 동형 `costFailOpen` branch + critical-only narrow + `hard_ceiling_reached` skip. merge-strategy gate(line 138)·single-partition gate(line 141)는 **불변**(구조 안전 유지).
  - catastrophic-runaway 상한 명시: `MAX_WORKERS_DEFAULT`(4) + `MCCP_WORK_PARALLEL_MAX`가 per-dispatch worker 절대 상한임을 헤더 주석에 runaway-cap으로 문서화. N은 절대 `maxWorkers`를 넘지 않음을 test로 anchor.
  - REASONS에 `COST_FAILOPEN` 추가.
- **Mirror**: `plan-fanout/budget.js` Task 1 변경, 기존 `resolveFleet` skip 헬퍼.
- **Validate**: `node --test plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js`

### Task 3: command-body default 반전 + 발화 로그 (`work.md`, `plan.md`) — Codex F1 흡수
- **Action**:
  - `work.md:158` `PARALLEL="${MCCP_WORK_IMPLEMENT_PARALLEL:-0}"` → `:-1`. 주석에 oracle `parseParallelMode` default 반전 mirror 명시.
  - **`MCCP_WORK_IMPLEMENT_WORKFLOW` default flip 안 함(Codex F1)** — default 0 유지. 이유: WORKFLOW를 독립적으로 flip하면 `PARALLEL=off/0`로 병렬을 opt-out해도 단일 worker가 Workflow로 라우팅돼 legacy Task 경로(retry/state/cost 거동)가 복원 안 됨. opt-out 계약은 **단일 축**으로: `PARALLEL=off/0` → 단일 worker Task(legacy) 경로 정확 복원. 단일 worker Workflow leg의 live 발화 관찰은 M2에서 명시적 opt-in(`MCCP_WORK_IMPLEMENT_WORKFLOW=1`)로 분리.
  - Step 3.route의 인라인 `[ ... ]` 결정 트리를 `resolveWorkRoute` oracle(Task 4b) 호출로 대체 — 단일 SoT. route 서술문을 oracle 계약 기준으로 갱신.
  - `resolveFleet`/`resolveFanout` 호출부에 `costFailOpen` 전달(신규 env `MCCP_ORCHESTRATION_COST_FAIL_OPEN` 파싱, default true, `=0`이면 false) + runaway 카운터(Task 4a) 조회 결과 forward.
  - 발화 성사 시 양성 로그(`[mccp:work] parallel fleet 발화 (N=..)` / `[mccp:plan-fanout] fan-out 발화 coverage=..`) + skip 시 opt-out 안내(`default on — MCCP_..=off로 단일 경로`). PRD Success Metric "default 발화율" 관측 근거.
  - `plan.md` Phase 2.5.1 동상: `costFailOpen`+runaway forward + 양성 로그.
- **Mirror**: 기존 stderr 로그 톤(`work.md:210`, `plan.md:186`), self-derive 아티팩트 관행(shell-state 비지속).
- **Validate**: route 결정은 Task 4b `route.test.js`가 env 조합 전수 커버(md bash는 oracle 호출만). 로그 문구는 M2 live dogfood에서 관측.

### Task 4a: cost-state 독립 catastrophic-runaway 안전판 (`orchestration-runaway.js` CREATE) — Codex F2 흡수
- **Action**: cost-state 파일과 **독립적인** 최후 안전판. cost-state 부재로 fail-open이 발동하면 `hard_ceiling_reached`를 관측할 수 없어 per-dispatch 상한(4)만 남는 Codex F2 gap을 닫는다.
  - 세션(`CLAUDE_SESSION_ID` 또는 run-id) 키 누적 worker-launch 카운터를 `.claude/state/orchestration-runaway.json`에 persist(`cost-state.js` acquireLock/`wx` 패턴 mirror, atomic tmp+rename). 새 세션 키면 리셋.
  - 순수 oracle `clampForRunaway({requestedN, launchedSoFar, env})` → `{n, degraded, reason}`. 절대 env cap `MCCP_ORCHESTRATION_MAX_AGENTS`(default 24, loud fail-open parse) 초과 예정이면 **degraded fail-open**으로 N=1(maxWorkers=1)로 clamp.
  - `resolveFanout`/`resolveFleet`가 fail-open 경로(costFailOpen로 green 가정한 경우)에서 반환 N을 이 clamp로 통과시킴 → 반복 실행/재귀/재시도 누적이 절대 상한을 못 넘음.
- **Mirror**: `cost-state.js:159-189` lock/release + atomic write, `subscription.js:68-108` loud fail-open env parse.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/orchestration-runaway.test.js`

### Task 4b: work route oracle (`implement-dispatch/route.js` CREATE) — Codex F3 흡수
- **Action**: work.md Step 3 route 결정 트리(현 line 256-263의 markdown-only 로직)를 순수 함수 `resolveWorkRoute({env, hasFleetArgs, hasPrepare, hasWorkflowArgs, workflowAvailable, isolate})` → `'inline'|'task'|'workflow-single'|'workflow-parallel'`로 승격. work.md bash가 이 oracle을 호출(단일 SoT)해 route를 결정 → 지금까지 untested markdown이던 발화 route가 mechanical 테스트 대상이 됨.
- **Mirror**: `implement-dispatch/budget.js`의 first-match 결정 트리 + frozen enum 스타일.
- **Validate**: `node --test plugins/mccp/scripts/lib/implement-dispatch/tests/route.test.js`

### Task 5: 저비용 검증 harness (`dispatch-wiring-harness.test.js` CREATE)
- **Action**: 합성 temp git repo 생성 → plan 텍스트로 2-partition prepare-fleet → 각 partition worktree(`isolation:'worktree'` 모사, 실제 `git worktree add`) → worker 대역이 `seed-envelope` + `mark --status ok`(실제 LLM/Agent 미호출) → `collect-worktrees` → `reconcile`(fleet) → verdict `ok` + attribution anchor(3-flag) + F1(no mccp-pr-codex leak) assert. rollback-apply/merge-apply의 patch-scoped 계약도 1 case smoke.
- **Mirror**: `worktree-merge.test.js`의 real-git temp repo + fakeGit 패턴, `result-schema.test.js`의 fixture factory.
- **Validate**: `node --test plugins/mccp/scripts/lib/implement-dispatch/tests/dispatch-wiring-harness.test.js`

### Task 6: fanout-* agent install-cache blocker 해소
- **Action**: `plugins/mccp/agents/fanout-{architect,security,test,explorer}.md` 4개 존재 + frontmatter(name/description/tools: Read,Grep,Glob only — write/edit/bash 부재) 검증. 손상·누락 시에만 수정. `plugin.json` version bump(Task 7)이 `~/.claude/plugins/cache/mccp/mccp/1.22.1/agents/`에 4개 agent를 fresh cache로 실어 install 환경에서 `mccp:fanout-*` 해결 가능케 함.
- **Mirror**: 기존 fanout agent frontmatter, §3.7 version-bump→cache 계약.
- **Validate**: `node -e` frontmatter 파싱 4/4 통과 + tools 배열에 write/edit/bash 부재 assert. (Task 5 harness가 seed/envelope 배선을 별도 검증.)

### Task 7: version bump + CHANGELOG
- **Action**: `plugin.json` `1.22.0`→`1.22.1`. `CHANGELOG.md`에 v1.22.1-m1 row(발화 반전 + fail-open + runaway 재정의 + route oracle + harness). user-visible footer version(html.js/markdown.js) 동기화 확인.
- **Mirror**: §3.7 patch bump(단일 milestone), 기존 CHANGELOG row 포맷.
- **Validate**: `node -e "require('./plugins/mccp/.claude-plugin/plugin.json').version"` → `1.22.1`.

### Task 8: 문서화 (`CLAUDE.md`)
- **Action**: §1.4 자동 게이트 표에 v1.22.1-m1 row 추가(발화 반전 + fail-open + cost-state 독립 runaway 안전판 + route oracle + harness). §4 운영 토글에서 `MCCP_PLAN_FANOUT`/`MCCP_WORK_IMPLEMENT_PARALLEL` default 반전(on) 명시 + 신규 `MCCP_ORCHESTRATION_COST_FAIL_OPEN=0` kill switch + `MCCP_ORCHESTRATION_MAX_AGENTS`(default 24) + opt-out 계약(§Open Question 6 답: `PARALLEL=off/0` 단일 축, WORKFLOW 미변경) + Open Question 1(catastrophic-runaway 임계 = **cost-state 독립** 누적 worker-launch 절대 상한 + per-dispatch 상한 + USD critical/hard_ceiling) 결정 기록.
- **Mirror**: 기존 §4 토글 블록 서술 톤, §1.4 표 행 포맷.
- **Validate**: 육안 + grep으로 default 반전·kill switch·runaway env 문구 존재 확인.

## Validation

```bash
# oracle 결정 트리 (default 반전 + fail-open + critical-only + cap)
node --test plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/budget.test.js

# 저비용 배선 harness (seed→mark→collect→reconcile, LLM 미호출)
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/dispatch-wiring-harness.test.js

# 회귀 — dispatch 전 표면
node --test plugins/mccp/scripts/lib/implement-dispatch/tests/
node --test plugins/mccp/scripts/lib/plan-fanout/tests/

# version bump 확인
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # 1.22.1

# fanout agent frontmatter 4/4
node -e "const fs=require('fs');['architect','security','test','explorer'].forEach(a=>{const t=fs.readFileSync('plugins/mccp/agents/fanout-'+a+'.md','utf8');if(!/tools:\s*Read/.test(t)||/tools:.*(Write|Edit|Bash)/.test(t))throw new Error(a);});console.log('ok')"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| default 반전이 기존 fail-closed 안전 계약 파괴 → 예상 밖 회귀 | 중간 | `costFailOpen=false` kill switch로 옛 fail-closed 완전 복원 가능. 반전은 gate 값·branch만 추가(merge-strategy·single-partition·anchor invariant 불변). 기존 test는 명시적 opt-out case로 보존 |
| opt-out(`PARALLEL=off`)이 legacy 경로 미복원 (Codex F1) | — | **흡수**: WORKFLOW default flip 제거 → opt-out은 단일 축(`PARALLEL=off/0` → 단일 worker Task 정확 복원). route.test.js가 env 조합 전수로 복원 검증 |
| fail-open이 telemetry 부재 시 bomb detector 무력화 (Codex F2) | — | **흡수**: cost-state와 **독립적인** 누적 worker-launch 절대 상한(`orchestration-runaway.js`)이 fail-open N을 clamp → 반복/재귀/재시도가 절대 상한 초과 불가(degraded maxWorkers=1). test가 cost-state 부재의 우회 불가 증명 |
| USD critical narrow(notice/warning 제거)가 진짜 비용 폭주 방치 | 낮음 | critical($100)/hard_ceiling은 여전히 skip = USD bomb detector. decay(M3)가 stale critical 자기치유. cost-state 독립 누적 상한(F2)이 telemetry 부재 시 최후 안전판 |
| fanout-* agent가 install cache에 안 실려 M2 live에서 미해결 | 중간 | Task 7 version bump으로 fresh cache 디렉토리 강제. Task 6이 frontmatter/도구셋 mechanical 검증. M2 live가 실제 해결을 최종 확인 |
| M1 검증이 실제 발화 leg를 커버 못 해 착시 (Codex F3) | 중간 | **흡수**: route 결정을 `resolveWorkRoute` oracle로 승격 → env 조합 전수 mechanical 테스트(발화 route는 더 이상 untested markdown 아님). harness는 배선(seed/mark/collect/reconcile), route.test.js는 발화 분기 검증. 실제 LLM 완주만 M2로 정직히 분리(loud) |
| command-body md 블록은 unit-test 불가 → 로그/default 오타 잠복 | 낮음 | route·oracle 계약은 test 커버(F3). default 리터럴은 oracle default와 1:1 주석 mirror. 남는 표면은 로그 문구뿐 → M2 live dogfood가 실발화 관측으로 확인 |

## Acceptance

- [ ] `parseFanoutMode`/`parseParallelMode` default on(unset→발화), `off`/`0`만 opt-out
- [ ] cost-state 부재 + `costFailOpen`(default) → `resolveFanout`/`resolveFleet` run=true(green), `COST_FAILOPEN` reason
- [ ] `costFailOpen=false`(kill switch) → 기존 `COST_STATE_UNKNOWN` fail-closed 정확 복원(back-compat test green)
- [ ] tier autoDisable가 critical-only로 narrow(notice/warning → run), `hard_ceiling_reached` → skip 유지
- [ ] N/fleetSize가 fail-open에서도 per-dispatch 상한(≤`maxWorkers`) 초과 안 함 — runaway cap test green
- [ ] **(Codex F1)** opt-out은 단일 축 — `PARALLEL=off/0` → 단일 worker Task(legacy) 경로 정확 복원. WORKFLOW default 미변경. `route.test.js` env 조합 전수 green
- [ ] **(Codex F2)** cost-state 독립 누적 worker-launch 절대 상한(`orchestration-runaway.js`)이 telemetry 부재를 우회 못 함 — degraded maxWorkers=1 clamp test green
- [ ] **(Codex F3)** work route 결정이 `resolveWorkRoute` oracle로 승격돼 mechanical 테스트 대상 — 발화 route가 untested markdown 아님
- [ ] 저비용 harness: 합성 worktree seed→mark→collect→reconcile → verdict ok + 3-flag anchor + F1 no-leak, LLM 0회
- [ ] fanout-* agent 4/4 frontmatter·도구셋(write/edit/bash 부재) 검증 통과
- [ ] `plugin.json` 1.22.1, CHANGELOG·CLAUDE.md §1.4/§4 갱신(default 반전·kill switch·runaway 임계 결정)
- [ ] dispatch 전 회귀 test(implement-dispatch/plan-fanout 전량) green
- [ ] dual-review·receipt chain 무손상(read-only fan-out + workflow-외곽 게이트 invariant 불변)
- [ ] Patterns mirrored, not reinvented

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.22.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) · `--impeccable-available`
- 라운드 수: 1 (R1 absorption — cap=1, ACCEPT_NOW HIGH 전량 R1에서 완전 해소 → escalate 미발동)
- 합치 결론: converged. Codex 원 stance는 "needs-attention/No-ship" (3 HIGH), 3건 모두 plan body amend로 흡수 — opt-out 단일 축화(F1), cost-state 독립 runaway 안전판(F2), route oracle 승격(F3). implement-codex 게이트가 실제 코드를 이 amended plan 기준으로 독립 재검증.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 parallel opt-out이 legacy 경로 미복원 (WORKFLOW default 0→1 flip이 PARALLEL opt-out을 무력화) | HIGH | ACCEPT_NOW | WORKFLOW default flip 제거 → opt-out을 단일 축(`PARALLEL=off/0` → 단일 worker Task 정확 복원)으로. route.test.js env 조합 전수 |
  | F2 fail-open이 telemetry 부재 시 USD bomb-detector 무력화 (per-dispatch 상한만 남아 반복/재귀/재시도 미방어) | HIGH | ACCEPT_NOW | cost-state와 독립적인 누적 worker-launch 절대 상한(`orchestration-runaway.js`) 신설 → fail-open N clamp(degraded maxWorkers=1). test가 우회 불가 증명 |
  | F3 M1 검증이 활성화 대상 경로를 안 건드림 (synthetic harness + untested md default = false-confidence) | HIGH | ACCEPT_NOW | Step 3 route 결정을 `resolveWorkRoute` oracle로 승격 → env 조합 전수 mechanical 테스트. 실제 LLM 완주만 M2로 정직히 분리 |
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (auto-CRITICAL 없음 — secret/data-loss/migration/auth/external/crypto 무관)
- Codex session 참조: threadId 019f6051-8ce3-7452-925e-8c4c85be16e1

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
