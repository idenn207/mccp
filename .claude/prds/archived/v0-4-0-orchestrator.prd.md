---
prd_name: v0-4-0-orchestrator
prd_version: 0.3-santa-revised
status: APPROVED-with-prototype-gates — audit-revised + santa-loop round 1 findings absorbed (Risks/Axis A gate/Implementation Dependencies/meta-recursion). 3 prototype gates carry to plan/implement.
created_at: 2026-06-11
revised_at: 2026-06-11
author: skypark207
scope_axes: [A, B, C, D, E, F, G, H, I, J]
mvp_axes: [H, I, B, C]
sub_prd_reserved: []
audit_status: completed
audit_file: c:/_project/my/my-claude-code-plugin-v0.4.0/.claude/audit/v0.4.0-audit-results.md
audit_date: 2026-06-10
santa_loop_round1: completed-naughty-then-patched
santa_loop_round2: completed-divergent-then-patched (A=FAIL/B=PASS, 4 findings absorbed)
santa_loop_round3: completed-convergent-on-self-introduced-count-error (A=FAIL/B=FAIL, both flagged same 6→8 mismatch from round 2 patch — fixed)
---

# v0.4.0 Orchestrator + Workflow-Verify Milestone

> **⊘ SUPERSEDED (아카이브, 2026-07-09)** — 본 PRD의 MVP 척추가 v0.3.x~v1.x dogfood에서 실증적으로 기각/대체됐다. (1) axis **B/C**(spawn 자율 오케스트레이터) → **정직한 `notify` handoff + `/mccp:resume`**(v1.1.0)로 대체 — spawn은 IDE 세션에서 거의 항상 실패해 `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN` opt-in으로 강등. (2) axis **A**(cost USD → message-count metric pivot) → **미전환**, cost USD tier가 briefing·plan-fanout·milestone-close·merged-verify 등 6개 서브시스템에 유지되어 obsolete. (3) axis **D**(/mccp:resume)·**I**(next-session 신호) → **결과 달성, 다른 구현**(`work-queue.v1` schema 아닌 STATE.md `handoff_spawn` 신호). 완료는 axis **H**(plan-implement verify) 1개뿐. 살아있는 잔여 가치 — **E**(shared decision ledger)·**J**(issue ledger + `/mccp:work` 진입 분기)·**F**(orphan 死코드 7파일 `session-adapters/*`·`tmux-worktree-orchestrator.js`·`harness-adapter-compliance.js`·`orchestration-session.js` 제거) — 는 필요 시 현재 v1.20.x 현실에 grounding한 별도 lean PRD로 재기획한다. 아래 Delivery Milestones 표에서 axis H 외 9축은 `dropped`로 정리했다.

## Problem

mccp v0.3.x dogfood가 5-worktree 동시 `mccp:work` 환경에서 발견한 두 종류의 사용자 개입 발생원:

1. **plan-implement 단계의 검증 부재** — `/mccp:plan` 게이트가 가설로 확정된 계획을 `/mccp:prp-implement` 가 실제 테스트하다 충돌 발견 시 silent하게 plan을 벗어나 구현 진행. 사용자가 처음부터 메모리/계획/구현을 분석해 수정 요청해야 함. dual-reviewer chain의 핵심 결함.
2. **multi-session orchestration 부재** — 5-worktree 동시 작업 시 모든 세션이 cost ceiling/검토 요청으로 멈춤 → 사용자가 매번 다음 세션에 개입 → 다른 worktree의 PR review 지연. 게다가 중단된 mccp:* 명령을 resume할 1-liner도 부재.

해결하지 않으면: 사용자 한 명이 5-worktree dogfood를 운영하는 본 plugin의 정체성이 무너짐. 매 cycle마다 사용자 개입이 자원의 대부분을 차지 → plugin 개발 자체가 정체.

## Evidence

1. **5-worktree halt pattern** — *"5개 worktree에서 동시에 mccp:work를 돌리고 사용자는 PR 검토만. 현재 모든 세션이 cost ceiling 도달 → 멈춤 → 사용자 개입 요구 → 다른 세션 review 지연. 이게 plugin 개발의 본질적 motivation."* ([project_v0_4_0_orchestrator.md](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/project_v0_4_0_orchestrator.md))

2. **v0.3.5 dogfood mccp:work 중단 인용** (2026-06-10 user statement) — *"이번에 v0.3.5 테스트를 진행했는데, mccp:work의 동작이 순서대로 진행하지만 가끔 검토하라고 세션이 멈추거나 cost ceiling 떄문에 멈추는걸 확인했어."*

3. **plan-implement gap 직접 인용** (2026-06-10 user statement) — *"결국 prp-implement 단계에서 직접 구현하면서 테스트를 통해 '어? 이거 안되는데요? 다른 조건으로 진행할까요? (권장)' 이렇게 요청하고서는 implement 단계에서는 plan 파일밖에 참조 안하니까 본래 의도와 다른 설계가 진행되었어. 이건 경험에서 나온 고통이야."*

4. **Pro/Windows/OAuth spawn 실측** (재실행 금지, 메모리 표):
   - `claude --print --bare` + OAuth: ❌ `Not logged in` (8.9s 후 exit 1)
   - `claude --print` (`--bare` 제거) + OAuth: ✅ exit 0, 8.9s
   - `--help` 문서 인용: *"Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read)"*
   - stdin redirect 필요(`$null |` 또는 `< NUL`), spawn overhead ~8.9s/spawn
   - cost-state 위치: user-level 단일 `~/.claude/plugins/data/mccp/cost-current.json` (spawn으로 cost ceiling 자동 회피 불가)

5. **ECC orchestrator infra audit** (재실행 금지, 메모리 표): 5개 파일 1971줄, 평균 활용도 17%, 활용 가능 핵심은 `canonical-session.js` (40%, schema/recording layer).

6. **v0.3.5 ship cycle incident — direct STATE.md citation** (audit Q7 흡수): v0.4.0 worktree의 `.claude/state/STATE.md` 가 v0.3.5 ship cycle 종료 후에도 `chain_aborted: true` + `session_end_imminent: true` 두 incident marker를 동시에 보유. PR #16(commit 816e8b6)으로 v0.3.5가 ship 됐음에도 STATE.md는 chain abort 흔적을 남김 — automation이 읽지 않는 stale incident marker가 다음 세션으로 누수. 이게 정확히 v0.4.0 axis C+D+I가 막아야 할 실패 모드. 인용: [v0.4.0/.claude/state/STATE.md:6-12](C:/_project/my/my-claude-code-plugin-v0.4.0/.claude/state/STATE.md#L6-L12).

7. **audit-completed evidence** (2026-06-10) — `c:/_project/my/my-claude-code-plugin-v0.4.0/.claude/audit/v0.4.0-audit-results.md` 단일 read-only audit. 모든 PRD-blocking findings (Q1/Q2/Q6) actionable evidence로 해소. PRD-revisable findings (Q3/Q4/Q5/Q7) 모두 본 PRD revision에 흡수.

## Users

- **Primary**: skypark207 1인 (`@idenn207`). Pro 구독 + Windows 11 + 5-worktree dogfood operator. 본 plugin의 유일한 사용자이자 maintainer.
- **Not for**: 외부 mccp 사용자. ECC(MIT) + impeccable(Apache-2.0) fork lineage의 저작권 lineage 이슈로 일반 배포 시도는 본 milestone scope 밖.

## Hypothesis

**정성적 hypothesis** (정량 metric은 axis A prototype gate 결과 calibration 후 확정):

> 우리는 **plan-implement 검증 layer + next-session 1-liner + on-demand multi-session orchestrator + workflow entry 분기**가 **사용자 개입 빈도를 dogfood의 critical 자원 소모 요인에서 부차 요인으로 강등**시킬 것이라 믿는다. **skypark207 1인 5-worktree dogfood 환경**에서, **v0.4.0 ship 후 2주 dogfood 윈도우에서 (a) plan-implement 무단 divergence 사례 보고 0회, (b) mccp:* 중단 후 resume 시 사용자가 새 prompt 작성 0회, (c) child Claude spawn으로 부모 cost ceiling 우회 성공(MCCP_COST_STATE_DIR 격리 동작), (d) 5-worktree 동시 운영 중 `usage_limit_exceeded` 발생 0회**가 모두 충족될 때 우리가 맞다는 것을 알 수 있다.

정량 metric은 axis A prototype 결과(message-count-per-5h calibration) 이후 add-on.

## Success Metrics

| Metric | Target | How measured | Status |
|---|---|---|---|
| plan-implement 무단 divergence | 0회 / 2주 dogfood | implement receipt에 plan-conflict escalation log 검사 | TBD — axis H ship 후 baseline 측정 |
| mccp:* resume 1-liner 사용 | 100% (모든 mccp:* 중단 시) | STATE.md `next_session_prompt` field 검사 | TBD — axis I ship 후 baseline |
| child spawn 부모 cost 격리 | `MCCP_COST_STATE_DIR` override로 격리 성공 | child의 cost-state file이 parent path와 다른 디렉토리에 작성됨 확인 | **defined** — audit Q2 isolation contract 확정 |
| 5-worktree 동시 운영 `usage_limit_exceeded` | 0회 / 2주 | spawn log + rate-limit terminal error 검사 | TBD — Q3 prototype-gate (ONE worktree first → scale) |
| message-count-per-5h false-positive halt | **Pre-dogfood pass**: env var honored + default `"35,40,45"` 활성 + ledger 기록 가능 (mechanical, not numeric). **Post-dogfood target**: 2주 dogfood 후 ledger의 90-percentile 5h count보다 threshold가 ≥10% 위에 위치 (false-positive rate를 데이터로 추론). | `auto-handoff-log.jsonl` ledger 분석 | TBD — Pre-dogfood pass는 axis A ship 직후 검증, post-dogfood target은 calibration window 종료 시 (2주차 마지막 stop hook fire 기준) |

axis A는 *prototype-first* — audit Q1이 "Anthropic-official prompt count 부재"를 evidenced 했으므로 threshold는 hardcoded 금지, env-configurable + dogfood calibration 필수.

## Scope

### MVP — 4축 (H + I + B + C)

가장 큰 pain을 가장 작은 단위로 해결하는 조합:

- **H plan-implement 검증 layer**: `/mccp:prp-implement` 가 실제 테스트 중 plan과 충돌 발견 시 silent하게 진행하지 않고 사용자에게 1-liner로 escalate. 사용자가 새 세션에서 plan revision 요청 가능.
- **I next-session 1-liner**: 모든 `/mccp:*` 명령이 session-end 직전 다음 세션 진입 prompt 1줄을 stdout + STATE.md에 명시. mccp:work 중단/cost ceiling/검토 요청 모두 포함.
- **B Windows headless spawn**: `claude.exe --print --output-format stream-json --session-id` 가 OAuth 환경에서 `--bare` 제거 조건으로 **1회 측정 (single datapoint)** 작동 관찰 (8.9s/spawn baseline, 2026-06-10). Multi-run stability + 5-worktree scale 은 prototype gate B/C 로 carry. **이 항목은 "확정"이 아닌 "1 datapoint observed"** — axis H 정신 적용 (single observation을 확정으로 포장하지 않음).
- **C on-demand orchestrator**: Stop hook fire 시 child Claude spawn. **신규 hook 작성 금지 — 기존 [auto-handoff.js:71-138](plugins/mccp/scripts/hooks/auto-handoff.js#L71-L138)를 extend** (audit Q6: 80% already done). `MCCP_ORCHESTRATED_CHILD=1` 재귀 가드 + `MCCP_COST_STATE_DIR=<per-child>` cost-state 격리, **2-layer 모두 필수** (audit Q6).

MVP가 ship되면 사용자 개입의 두 큰 발생원(plan-implement gap + multi-session halt)이 모두 mitigation됨.

### v0.4.0 Full Scope — 10축 (나머지 6축)

- **A metric pivot** — `cost USD` → `message-count-per-5h` 전환 (audit Q1). `MCCP_HANDOFF_MSG_THRESHOLDS_PER_5H="35,40,45"` (default permissive, calibration 대상). 기존 `MCCP_HANDOFF_THRESHOLDS_USD` deprecated. `auto-handoff-log.jsonl` schema 재사용.
- **D `/mccp:resume`** — work-queue.json + `lib/work-queue-schema.js` **신규 작성** + `mccp.work-queue.v1` schema name. canonical-session.js 일부 패턴(`parseUpdatedMs`, `STALE_THRESHOLD_MS`, `buildAggregates`)만 EXTRACT-PATTERN. **`ecc.session.v1` schema name 재사용 금지** (audit Q4, ECC semantic baggage 방지). **가설 검증 필수 (axis D plan 단계)**: `buildAggregates`의 worker-aggregation semantic이 mccp:work-queue (PRD→plan→implement→commit→PR chain) context에 fit한다는 가정은 unverified. plan 단계에서 적용 가능성을 spot-test로 확인 후 EXTRACT 여부 결정 (fit하지 않으면 from-scratch 작성).
- **E shared decision ledger** — `.claude/state/shared/decisions.jsonl` 신규. multi-session 결정 단일 source.
- **F worktree path 자동 고정** — spawn 시 cwd 명시 + **`{프로젝트루트}/.worktrees/{이름}`** 규칙. (1) sibling worktree `my-claude-code-plugin-v0.4.0/` cleanup + 재배치 → `c:\_project\my\my-claude-code-plugin\.worktrees\v0-4-0-orchestrator\`. (2) ECC dead code 1500 LOC removal (audit Q4): `tmux-worktree-orchestrator.js`, `harness-adapter-compliance.js`, `orchestration-session.js`, `session-adapters/{dmux-tmux.js, registry.js, claude-history.js, canonical-session.js}` 모두 cascade REMOVE.
- **G sub-agent 일관성** — **본 PRD에 thin contract로 포함** (audit Q5: 실제 race surface는 `security-reviewer` + `code-reviewer` 2개만, 47개 아님. `impeccable`은 Skill이라 lifecycle 다름). Sub-PRD 분리 불필요. Prototype gate: 2 concurrent worktree에서 `/mccp:code-review` 동시 호출 → receipt write contention 측정. 0 incidents over 5 runs면 현재 design 유지, ≥1 race면 그때 `code-reviewer` 전용 design 추가.
- **J issue ledger + `/mccp:work` entry 분기** — issue는 `.claude/issues/{slug}.md` 누적. `/mccp:work` 진입 시 issue-only / feature / hybrid 3-way 선택. issue-only면 plan-prd skip, plan부터.

### Out of Scope

- **외부 사용자 지원** — 저작권 lineage 이슈, dogfood-only.
- **always-on daemon** — on-demand spawn만 (사용자 명시).
- **tmux/Unix dmux dependency** — Windows 환경, ECC orchestrator의 tmux hardcoded 부분은 pattern만 활용 후 cascade REMOVE.
- **codex token cap 해제 / 재발급** — 영구 bypass 합의 ([[feedback-codex-permanent-bypass]]).
- **Pro 외 plan 지원** — Team/Enterprise는 본 milestone scope 밖.
- **새 Stop hook 작성** — axis C는 기존 `auto-handoff.js` extend (audit Q6).
- **`ecc.session.v1` schema 재사용** — axis D는 새 `mccp.work-queue.v1` (audit Q4).
- **`security-reviewer` 추가 design** — axis G prototype 결과 race 0회면 변경 없음 (audit Q5).
- **47개 agent 일관성 일반화** — 실제 호출 surface 2개에 한정 (audit Q5).

## Delivery Milestones

<!-- Business outcomes, not engineering tasks. /mccp:plan turns each into a plan. -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | **H — plan-implement verify** | implement 중 plan 충돌이 사용자 escalation 없이 silent하게 plan 변경되지 않음. escalation surface는 plan 단계에서 결정 (fix-task.md / askUserQuestion / STATE.md chain_aborted 중). | complete | [v0-4-0-axis-h-plan-implement-verify.plan.md](../plans/v0-4-0-axis-h-plan-implement-verify.plan.md) |
| 2 | **I — next-session 1-liner** | 모든 mccp:* 종료 시 다음 세션 첫 메시지 1줄 자동 제공. 생성 책임 위치(command body / Stop hook / wrapper)는 plan 단계 결정. | dropped | — |
| 3 | **B — Windows headless spawn** | Stop hook fire 시 child Claude 자동 spawn 기술적 가능성 확정. OAuth + `--bare` 제거 + stream-json output. **prototype gate: ONE worktree 1회 spawn 측정 후 5-worktree로 scale** (audit Q3). | dropped | — |
| 4 | **C — on-demand orchestrator** | `auto-handoff.js` extend로 Stop hook이 spawn trigger 작동. 2-layer 재귀 가드 (entry MCCP_ORCHESTRATED_CHILD check + spawner env injection). cost-state 격리 `MCCP_COST_STATE_DIR=<per-child>` 동시 적용. (audit Q2 + Q6) | dropped | — |
| 5 | **A — metric pivot** | cost USD → message-count-per-5h. `MCCP_HANDOFF_MSG_THRESHOLDS_PER_5H="35,40,45"` (default permissive). dogfood calibration 후 threshold 확정. (audit Q1) | dropped | — |
| 6 | **D — /mccp:resume** | 중단된 mccp:* 명령을 receipt 정합성 유지하며 resume. `lib/work-queue-schema.js` 신규 + `mccp.work-queue.v1` schema. canonical-session.js 일부 패턴만 EXTRACT-PATTERN. (audit Q4) | dropped | — |
| 7 | **E — shared decision ledger** | 5-worktree 결정사항 단일 ledger, conflict 감지 가능. | dropped | — |
| 8 | **F — worktree path 자동 고정 + ECC cleanup** | spawn 시 worktree cwd 오인식 0회 + `.worktrees/` 규칙 일관 + sibling worktree migration + ECC 1500 LOC removal (Q4 dead-code list). | dropped | — |
| 9 | **J — issue ledger + entry 분기** | dogfood issue 자동 누적, mccp:work 진입 시 issue-only/feature/hybrid 선택. issue-only면 plan-prd skip. | dropped | — |
| 10 | **G — sub-agent thin contract** | `security-reviewer` + `code-reviewer` 2개 agent의 multi-session race 측정. prototype gate(2 worktree code-review 동시) 후 design 확정/유지 결정. sub-PRD 불필요. (audit Q5) | dropped | — (in-PRD thin contract) |

## Open Questions

audit-pending이 모두 closed됨. plan-단계 결정 사항만 남음:

- [ ] **axis H의 정확한 escalation surface** — implement 중 plan 충돌이 발견되는 시점에 어떤 channel(fix-task.md / askUserQuestion / STATE.md `chain_aborted=true`)이 가장 자연스러운가. axis H plan 단계에서 결정.
- [ ] **axis I의 1-liner 생성 책임 위치** — 각 mccp:* command body / Stop hook / wrapper 중 어디서 생성할지. axis I plan 단계에서 결정.
- [ ] **axis J의 issue ledger schema** — `.claude/issues/{slug}.md` frontmatter + body 구조. axis J plan 단계에서 결정.
- [ ] **prototype-gate calibration targets** (3종, plan/implement 단계로 carry):
  - axis A: `MCCP_HANDOFF_MSG_THRESHOLDS_PER_5H` default `"35,40,45"` permissive — dogfood 후 calibrate.
  - axis B/C scale-up: prototype은 ONE worktree spawn 1회 → measure → 5-worktree로 scale.
  - axis G: 2-worktree concurrent `/mccp:code-review` over 5 runs → 0 race면 현재 design 유지.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| meta-recursive H risk — v0.4.0 자체가 plan-implement gap의 victim 될 수 있음 | High | High | MVP에서 H를 최우선 ship. 본 PRD 작성 자체가 axis H 정신 적용 — audit-pending fields를 가설로 채우지 않고 prototype gate로 carry. |
| Pro `usage_limit_exceeded` terminal failure (5-worktree 동시 spawn) | Medium | High | **audit Q3 mitigation 확정**: Pro plan 한도는 programmatic visibility 없음, hit-rate-limit은 sticky-defer signal로 처리 (retry 금지). prototype-gate: ONE worktree spawn 먼저 → 5h/weekly 소비 측정 → scale 결정. |
| child Claude cost-state 공유로 spawn loop 발생 | Was Critical → **mitigated by design** | Critical | **audit Q2 mitigation 확정**: `cost-state-path.js:15-21` 3-line override + `MCCP_COST_STATE_DIR=<per-child>` spawn env injection. PRD invariant로 박힘. |
| Stop hook 재귀 spawn (parent→child→grandchild→...) | Was Critical → **mitigated by design** | Critical | **audit Q6 mitigation 확정**: 2-layer guard 필수. layer 1 = `auto-handoff.js` entry `MCCP_ORCHESTRATED_CHILD=1` check, layer 2 = `session-spawner.js` env injection. 기존 race-lock는 tertiary defense (recursion gate 아님). |
| sub-agent state divergence (axis G) | Low (audit revised) | Medium | **audit Q5 결과**: 실제 surface는 `security-reviewer` + `code-reviewer` 2개만. `impeccable`은 Skill로 분리됨. prototype-gated: 2-worktree concurrent code-review over 5 runs → race 0이면 design 변경 없음. |
| ECC orchestrator code 재사용 시 hidden coupling | Low (audit revised) | Medium | **audit Q4 결과**: 5개 파일 중 4개 orphan + 1개 intra-cluster. `canonical-session.js` 일부 패턴만 EXTRACT-PATTERN으로 `lib/work-queue-schema.js` 신규 작성. **`ecc.session.v1` schema name 재사용 금지**. cascade REMOVE 안전. |
| `.worktrees/` 규칙 migration 중 worktree 손상 (axis F) | Low | High | sibling worktree `my-claude-code-plugin-v0.4.0/` 의 모든 uncommitted 변경 점검 후 `git worktree move` 또는 `remove + add`. axis F plan 단계에서 step-by-step migration script. |
| axis A threshold calibration이 dogfood 부족으로 부정확 | Medium | Medium | **default permissive**: `"35,40,45"` (third-party estimate 45 prompt/5h 기반). env-configurable이라 ship 후 user calibration 가능. PRD는 specific threshold를 hardcode하지 않음. Pre-dogfood pass criterion + post-dogfood target은 Success Metrics 표 참조. |
| **axis F worktree migration mid-flight 실패** — `git worktree move` 중 crash 또는 사용자 interrupt 시 sibling/`.worktrees/` 양쪽이 dangling 상태 | Low | High | axis F plan 단계에서 migration script가 (1) pre-check (uncommitted 확인 + 동일 path 존재 확인), (2) `git worktree list` snapshot 저장, (3) `move` 실패 시 `add` 재시도 fallback, (4) 완료 후 verify step 포함. atomic 보장 불가능하면 사용자 명시적 confirm 후 시작. |
| **axis B `ANTHROPIC_API_KEY` env propagation 미보장** — OAuth 환경에서 child Claude spawn 시 parent shell에 API key 부재 + keychain 미사용이면 child auth 실패 | Medium | High | axis B prototype 시 spawn env에 `ANTHROPIC_API_KEY` 존재 여부 verify. 부재 시 사용자에게 `apiKeyHelper`/`--settings` 경로 명시 안내. 본 PRD는 API key 존재를 가정하지 않음 — prototype-gate 결과에 따라 axis I 1-liner에 setup instruction 포함 검토. |
| **axis B/C claude binary PATH divergence** — parent shell의 `claude`가 child PowerShell spawn 환경에서 다른 binary (또는 not found) | Medium | Medium | `session-spawner.js:defaultClaudeAvailable()` 가 parent context에서 검증하지만 child의 PATH는 spawn 시점 env에 종속. axis C extend 시 spawner가 absolute path를 child env에 명시 전달 (where.exe claude 결과) 패턴 검토. |
| **axis C `settings.local.json` vs `settings.json` env precedence in child spawn** — child가 parent의 env override를 inherit하는지 reset하는지 불명확. `MCCP_CODEX_DISABLED`/`MCCP_RECEIPT_GATE_MODE` 등 user-local 영구 bypass가 child에 propagate 안 되면 child가 codex 호출 시도 → 재인증 prompt | Medium | Medium | axis C plan 단계에서 spawn env block 명시 — child env = `{...parentEnv, MCCP_ORCHESTRATED_CHILD: '1', MCCP_COST_STATE_DIR: <per-child>}`. `parentEnv`가 settings.local.json values를 이미 포함 가정 (claude harness가 settings를 process.env에 inject). prototype-gate에서 검증. |
| **axis F `.worktrees/v0-4-0-orchestrator/` 디렉토리 collision** — sibling `my-claude-code-plugin-v0.4.0/` 존재 중 `.worktrees/` 하위에 같은 branch checkout 시도 시 git refuses | Low | Medium | axis F migration 첫 step = sibling worktree status check + (a) committed-only면 `git worktree remove` 후 `.worktrees/`에 `add`, (b) uncommitted 있으면 stash/commit 후 같은 step, (c) collision 시 사용자에게 explicit prompt. plan 단계에서 precondition 명시. |

## Implementation Dependencies — Assumptions to Validate in Plan/Implement

본 PRD는 다음 8개 가정 위에 작성됨 (#1-#6 = 본 PRD 초기 작성 시점, #7-#8 = santa-loop round 2 추가). 각 가정은 axis 진입 시 plan 단계에서 명시적으로 verify해야 하며, 실패 시 해당 axis scope 조정 필수:

1. **Anthropic `/status` quota signal parsability** (axis A) — `/status` slash command이 출력하는 quota remaining text를 automation layer가 parse 가능하다는 가정. audit Q1이 "interactive only"라 언급 → axis A plan에서 (a) automation에서 `/status` invoke 가능 여부 확인, (b) 불가능 시 ledger-only fallback으로 scope 축소. 본 PRD scope에서는 ledger가 primary, `/status`는 nice-to-have.
2. **Windows PowerShell stdin redirection at spawn** (axis B) — `claude --print` 가 `$null |` 또는 `< NUL` stdin redirect 필요 (출처: PRD Evidence §4 "Pro/Windows/OAuth spawn 실측" 표 — audit가 아닌 본 PRD의 사용자 실측). `session-spawner.js:platformSpawn` PowerShell branch가 `stdio: 'ignore'`로 spawn하므로 stdin은 already null이지만 child Claude가 interactive prompt 시도하면 hang. axis B prototype 시 hang detection (timeout 30s) 포함.
3. **OAuth credential inheritance parent→child** (axis B/C) — child Claude process가 parent의 OAuth token을 inherit하는지 (`~/.claude/.credentials.json` file-based) 또는 별도 auth 필요한지 미검증. file-based credential 가정 — `--help` 문서 인용 "OAuth never read" 인데 정작 parent가 동작 중이므로 file-based read가 어딘가 일어남. axis B prototype에서 child가 first response 가능한지 확인 (auth 실패 시 prompt가 stderr로 새어나옴).
4. **`mccp.work-queue.v1` first-version migration cost** (axis D) — 본 schema는 신규이므로 backward migration 없음 = cost zero. 단 axis D ship 후 schema 변경 시 migration script 의무 (mccp 기존 receipt schema 관행 따라). plan 단계에서 schema field 신중 결정 — 이후 변경은 cost 발생.
5. **ECC cascade-remove safety criterion** (axis F) — audit Q4 grep이 5개 파일 모두 (a) intra-cluster import만 있거나 (b) zero external imports임을 evidenced. 본 PRD는 이 grep 결과의 정확성을 가정. axis F implement 직전 grep 재수행으로 확인 (다른 axis가 그 사이 reference를 새로 추가했을 가능성 차단).
6. **`git worktree move` vs `git worktree remove + add` semantic** (axis F) — `move`는 working tree files를 그대로 옮김 (uncommitted 보존), `remove + add`는 fresh checkout (uncommitted 손실). sibling worktree가 uncommitted 있으면 `move`만 안전. axis F plan 단계에서 sibling 상태 점검 후 선택 — PRD는 둘 다 옵션으로 명시.
7. **`mccp.work-queue.v1` schema namespace uniqueness** (axis D) — mccp에 schema registry(e.g., 중앙 schema name 목록)가 존재하는지 확인되지 않음. 단순 "name 직접 명시" 패턴이라 collision 검출은 grep + naming convention 의존. axis D plan 단계에서 (a) `grep -r "mccp.*\.v1"` 으로 기존 사용 name 모두 enumerate, (b) `mccp.work-queue.v1` 충돌 여부 검증, (c) 충돌 시 다른 이름 (e.g., `mccp.work-queue.v1.0`). 본 PRD는 `mccp.work-queue.v1` 이 unique함을 가정 — plan 단계 verify 필수.
8. **Stop hook fire frequency = message delivery frequency** (axis A) — `message-count-per-5h` metric의 정의가 Stop hook fire를 message proxy로 사용. Stop hook이 (a) 1 message당 1회 (정상), (b) 0회 (message 도중 hook 미발화), (c) 다회 (response 분할 또는 retry) 어느 경우인지 미검증. axis A prototype 시 ledger와 실제 conversation 길이를 한 세션에서 비교해 ratio 검증 — 1:1 가정이 무너지면 metric 보정(e.g., conversation length 기반 normalization) 필요.

이 8개 가정 중 axis A의 #1/#8, axis B의 #2/#3, axis F의 #5/#6 은 prototype gate 결과에 따라 scope 변경 가능. axis D의 #4/#7 은 plan 단계 결정. 모두 plan 단계에서 verify는 의무.

---

## Design Direction

본 milestone은 backend orchestrator + workflow verify layer로 직접적 UI surface가 없음. 사용자 가시 변경은 (1) mccp:* command의 stdout 1-liner format, (2) STATE.md의 `next_session_prompt` field, (3) PR body의 추가 footer 정도. 모두 textual artifact라 impeccable design direction 적용 영역 밖.

> impeccable unavailable, skipped (auto-fallback): skill-missing
>
> impeccable-detect.js (mode=prd) 결과: `skill_available=false, design_signal=true (matched: <keyword:design>)`. design_signal은 본 섹션 헤더 자체의 keyword 매칭에 의한 false-positive로 판단. 실 design surface 없음.

## Worktree Note

본 PRD는 `c:\_project\my\my-claude-code-plugin\.claude\prds\v0-4-0-orchestrator.prd.md` (현재 main worktree, post-v0.3.6 ship) 에 작성됨. v0.4.0 구현은 axis F의 첫 task로 `{프로젝트루트}/.worktrees/v0-4-0-orchestrator/` 신규 worktree에서 진행 예정. sibling worktree `c:\_project\my\my-claude-code-plugin-v0.4.0\` 은 axis F 구현 시 cleanup (uncommitted 변경 확인 후 `git worktree remove` + `.worktrees/` 하위에 `git worktree add`).

## Audit Reference

본 PRD revision은 다음 audit 결과로 정당화됨:

- **Source**: `c:/_project/my/my-claude-code-plugin-v0.4.0/.claude/audit/v0.4.0-audit-results.md` (2026-06-10 23:15, read-only, main worktree @ `a73bae9` v0.3.6 + sibling @ `816e8b6` v0.3.5 시점)
- **PRD-blocking findings closed**: Q1 (metric pivot → message-count-per-5h), Q2 (cost-state isolation via `MCCP_COST_STATE_DIR`), Q6 (2-layer recursion guard)
- **PRD-revisable findings folded**: Q3 (rate-limit prototype-gate), Q4 (ECC dead code 1500 LOC + schema name rule), Q5 (sub-agent surface 2개 thin contract), Q7 (STATE.md `chain_aborted` direct citation)
- **Code citations** (audit-grounded, plan 단계 직접 참조):
  - [cost-state-path.js:15-21](plugins/mccp/scripts/lib/cost-state-path.js#L15-L21) — hardcoded homedir, override 지점
  - [cost-state.js:120-138](plugins/mccp/scripts/lib/cost-state.js#L120-L138) — monotonic merge (sticky tier)
  - [auto-handoff.js:71-138](plugins/mccp/scripts/hooks/auto-handoff.js#L71-L138) — axis C extend target (80% done)
  - [session-spawner.js:53-57, 65-74, 84-114](plugins/mccp/scripts/state/session-spawner.js) — env passing, taskHash, race-lock
  - [canonical-session.js:7-9, 71-100](plugins/mccp/scripts/lib/session-adapters/canonical-session.js#L7-L100) — EXTRACT-PATTERN source
  - `.gitignore:24` — `.claude/receipts/` gitignored (Q7 absence-by-design)

---

*Status: APPROVED-with-prototype-gates — audit-completed + santa-loop round 1+2 findings absorbed + round 3 count consistency fix. 3 prototype gates carry to plan/implement (axis A threshold calibration, axis B/C scale-up, axis G race measurement). 8 Implementation Dependencies named for plan-stage validation (#1-#6 initial + #7-#8 round 2 additions).*
*Implementation planning ready via /mccp:plan — first milestone M1 = axis H (plan-implement verify).*
*Co-created with user on 2026-06-11 (KST), audit-revised on 2026-06-11 (KST) from 2026-06-10 audit results, santa-loop round 1 patched on 2026-06-11 (KST) for Risks completeness + axis A pre-dogfood pass criterion + Implementation Dependencies subsection + meta-recursion softening (axis B "1회 측정 확정" + axis D canonical-session 가설 명시), santa-loop round 2 patched on 2026-06-11 (KST) for citation precision (Implementation Dependencies §2 audit-reference fix) + 2 추가 silent assumptions (schema namespace uniqueness §7, Stop-hook ↔ message ratio §8) + axis B "확정" 단어 완전 제거 ("1 datapoint observed").*
