# Plan: Multi-Agent Workflow Orchestration — M1 plan fan-out (MVP)

**Source PRD**: `.claude/prds/workflow-orchestration.prd.md`
**Selected Milestone**: M1 — plan fan-out (MVP)
**Complexity**: Medium

## Summary

`/mccp:plan`의 GROUND 단계를 **read-only 다관점 병렬 fan-out**으로 강화한다. architect/security/test/explorer 관점을 **전용 read-only agent**(`fanout-*`, tools: Read/Grep/Glob)로 `Workflow` primitive의 `agent()`에 병렬 spawn → 스크립트가 결과를 synthesize → plan body에 `## Multi-Perspective Fan-out` 섹션으로 주입한다. write/bash 도구 부재로 파일 변형이 **구조적으로 불가**하고 **receipt도 쓰지 않으므로** 기존 Codex dual-review·receipt chain은 무손상이며, PRD "receipt attribution" Open Question은 M2로 자연 이연된다. 비용은 default-off 명시 opt-in + fleetSize 고정(`effort:'low'`) + cost-tier autoDisable + `budget.remaining()` 사전 skip으로 통제한다(Codex R1 F1/F2/F3 흡수).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/impeccable-routing.js:117` · `design-critique-decide.js:25` | pure oracle: `parseXxx(env)` + `decideXxx(opts)`, `Object.freeze` 상수, enum 반환, `module.exports` 하단 |
| Cost gate | `plugins/mccp/scripts/lib/briefing/cost-guard.js:63` | `shouldSkipBriefing(opts) → {skip,reason,tier}`, frozen `REASONS`, `parseTierOverride`, cost-state read → tier → autoDisable, **fail-open**(cost-state 없으면 진행) |
| Env toggle | `plugins/mccp/scripts/lib/cost-thresholds.js:29` | `parseEnvOverride` loud fail-open + stderr warn + default 반환 |
| CLI/emit | `plugins/mccp/scripts/lib/dispatch-cli.js:60` | `emit(obj)` = JSON stdout 1줄, `parseFlags`, `runCli` subcommand dispatch, exit code 상수 |
| Worker prompt | `plugins/mccp/scripts/lib/dispatch-cli.js:105` | `buildImplementWorkerBasePrompt` — 명시적 read-only guardrail + 구조화 return contract 지시 |
| Tests | `plugins/mccp/scripts/lib/tests/*.test.js` · `derive/tests/*` | Node native runner (`node --test`), oracle 단위 테스트 분리 |
| Doc gate row | `CLAUDE.md` §1.4 표 · §4 운영 토글 블록 | 새 게이트 축은 표 1행 + 토글 env 문서화 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/agents/fanout-architect.md` | CREATE | read-only(`tools: Read, Grep, Glob`) 구조·확장성 관점 agent (Codex F1) |
| `plugins/mccp/agents/fanout-security.md` | CREATE | read-only 공격면·데이터 관점 agent (write-capable `security-reviewer` 대체) |
| `plugins/mccp/agents/fanout-test.md` | CREATE | read-only 검증 전략 관점 agent (write-capable `tdd-guide` 대체) |
| `plugins/mccp/agents/fanout-explorer.md` | CREATE | read-only 기존 코드 추적·재사용 관점 agent |
| `plugins/mccp/scripts/lib/plan-fanout/perspectives.js` | CREATE | 관점 카탈로그(4 read-only agent 참조) + prompt builder (pure) |
| `plugins/mccp/scripts/lib/plan-fanout/budget.js` | CREATE | `resolveFanout(opts) → {run,reason,tier,fleetSize,budgetTotal}` mode/cost-tier oracle (cost-guard mirror, pure) |
| `plugins/mccp/scripts/lib/plan-fanout/synthesize.js` | CREATE | `perspectives[] → ## Multi-Perspective Fan-out` 마크다운 조립 + metaGaps 집계 (pure) |
| `plugins/mccp/scripts/workflows/plan-fanout.js` | CREATE | `Workflow` 스크립트 — 얇게, oracle 소비, `parallel` fan-out + synthesize 반환 |
| `plugins/mccp/scripts/lib/plan-fanout/tests/perspectives.test.js` | CREATE | 카탈로그 무결성 + prompt read-only 문구 검증 |
| `plugins/mccp/scripts/lib/plan-fanout/tests/budget.test.js` | CREATE | mode 파싱·cost-tier autoDisable·PRD-mode gate·override·fail-open |
| `plugins/mccp/scripts/lib/plan-fanout/tests/synthesize.test.js` | CREATE | 조립·빈 결과·부분 결과(agent null) 처리 |
| `plugins/mccp/commands/plan.md` | UPDATE | Pattern Grounding 뒤에 Phase 2.5 MULTI-PERSPECTIVE FAN-OUT 추가(트리거·Workflow 호출 지시·fallback·주입) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.20.2 → 1.20.3` patch bump (§3.7 단일 milestone) |
| `CLAUDE.md` | UPDATE | §1.4 표 1행 + §4 `MCCP_PLAN_FANOUT*` 토글 문서화 |
| `CHANGELOG.md` | UPDATE | 새 row |
| `.claude/prds/workflow-orchestration.prd.md` | UPDATE | Delivery Milestones M1 `pending → in-progress` + Plan cell |

## Design Decisions (이 plan이 확정하는 것)

> Codex R1 흡수 반영본. F1(read-only mechanical) · F2(budget 정직 재서술) · F3(default off opt-in)이 아래 2·4·5에 각각 녹아 있다.

1. **게이트 합성 = (b) workflow-외곽** (PRD 척추 Open Question). fan-out은 GROUND 강화일 뿐, Codex 게이트(Phase 5)는 그대로 감싼다. fan-out 결과는 plan body에 주입돼 `plan_hash`에 포함 → Codex가 review → **dual-review 무손상**.
2. **read-only는 mechanical 강제 (Codex F1 흡수)** = M1의 핵심 안전 장치. fan-out worker는 **전용 read-only agent**(`fanout-*`, frontmatter `tools: Read, Grep, Glob`)만 쓴다 — write/edit/bash 도구가 **정의에 존재하지 않으므로** prompt 문장이 아니라 **도구 부재**로 편집·명령 실행이 불가능하다. 기존 `mccp:security-reviewer`(Read/Write/Edit/Bash/Grep/Glob)·`mccp:tdd-guide`(Read/Write/Edit/Bash/Grep)는 write-capable이라 fan-out에 **직접 쓰지 않는다**. 파일 변형·receipt write가 구조적으로 불가 → PRD Open Question "receipt attribution"은 M1에서 발생 안 함 → M2로 이연.
3. **트리거는 4-AND**: PRD artifact mode(`.prd.md` 입력) · `MCCP_PLAN_FANOUT=on`(명시 opt-in, default off) · cost-tier autoDisable 미해당 · `Workflow` tool 가용. 하나라도 miss → 현행 인라인 Pattern Grounding fallback(loud stderr).
4. **비용 방어 — 정직한 재서술 (Codex F2 흡수)**: `Workflow` `budget`은 read-only(`total`/`spent()`/`remaining()`)라 스크립트가 `total`을 **설정할 수 없다**("hard ceiling 설정" 주장은 거짓 → 제거). 실제 상한은 ① fleetSize 고정(4, loop 없는 1-shot `parallel`) + 각 fan-out agent `effort:'low'` = **구조적 상한(항상 유효)** ② fan-out 진입 전 `budget.total && budget.remaining() < 관점당최소×fleet`면 **skip**(사용자 `+Nk` 지시를 존중하되 설정하진 않음) ③ cost-tier autoDisable(notice $50+) = 세션 방어. cost-state가 missing/corrupt/stale이면 **fail-open(run)이 아니라 skip**(보수적). budget 소진이 추가 agent를 멈추는지는 smoke test로 증명(Task 4).
5. **default `MCCP_PLAN_FANOUT=off` — 명시 opt-in (Codex F3 흡수)**: 현행 `/mccp:plan` "inline by default, no subagent by default" 계약을 보존한다. command body에 Workflow 호출을 심는 것은 invocation-boundary opt-in이 **아니므로**, 사용자가 `=on`으로 명시해야만 fan-out이 발화한다. opt-in은 CLAUDE.md에 command 구현과 **별도로** 문서화한다. (default-on 비용 폭증 Risk 동시 해소.)
6. **synthesize는 agent 아닌 pure 스크립트 조립**: 4관점 결과 배열 → 결정론적 마크다운. 추가 LLM 호출 0, 재현성 확보(`resumeFromRunId` 캐시 친화).

## Tasks

### Task 0: read-only fan-out agent 정의 (Codex F1 — mechanical enforcement)
- **Action**: `agents/fanout-{architect,security,test,explorer}.md` 4개 생성. 각 frontmatter `tools: Read, Grep, Glob`만 — write/edit/bash가 **정의에 부재**해 편집·명령이 구조적으로 불가. system prompt는 관점 lens(구조·확장성 / 공격면·데이터 / 검증 전략 / 코드 추적·재사용)로 "read-only meta 조사, propose only, PERSPECTIVE_SCHEMA 반환" 지시.
- **Mirror**: `agents/architect.md`·`agents/code-explorer.md` frontmatter(이미 read-only tools) + `agents/security-reviewer.md` 도메인 렌즈(도구만 축소).
- **Validate**: 4개 파일 frontmatter `tools:`에 Write/Edit/Bash 부재를 grep으로 확인.

### Task 1: 관점 카탈로그 oracle
- **Action**: `plan-fanout/perspectives.js` 작성. `PERSPECTIVES` frozen 배열 = `[{key:'architect', agentType:'mccp:fanout-architect', lens:'구조·확장성·경계'}, {key:'security', agentType:'mccp:fanout-security', lens:'공격면·데이터'}, {key:'test', agentType:'mccp:fanout-test', lens:'검증 전략·테스트 가능성'}, {key:'explorer', agentType:'mccp:fanout-explorer', lens:'기존 코드 추적·재사용'}]` — **전부 read-only agent**(Codex F1). `buildPerspectivePrompt({perspective, prdPath, planPath})` = 관점 lens + "propose only, do NOT edit" + PERSPECTIVE_SCHEMA 안내 prompt. `PERSPECTIVE_SCHEMA` = `{perspective, findings:[{claim,evidence,severity}], metaGaps:[...], patternsToMirror:[...]}` JSON Schema export.
- **Mirror**: `dispatch-cli.js:105` worker prompt(명시 guardrail) + `impeccable-routing.js` frozen 카탈로그.
- **Validate**: `node --test plugins/mccp/scripts/lib/plan-fanout/tests/perspectives.test.js` — 4관점 존재, agentType이 전부 `mccp:fanout-*`(write-capable agent 참조 0건), 각 prompt에 read-only 문구.

### Task 2: budget/mode oracle (cost-guard mirror)
- **Action**: `plan-fanout/budget.js` 작성. `parseFanoutMode(env) → 'off'|'on'`(**default off** — Codex F3). `parseFanoutMinPerAgent(env)`(관점당 최소 예상 토큰, default 150_000, 비정상 → default + warn). `resolveFanout({env, prdMode, costStateRead}) → {run, reason, tier, fleetSize, minRemaining}`. 결정 순서(first match): mode≠on → `ENV_OFF`; `prdMode!==true` → `NOT_PRD_MODE`; **cost-state missing/corrupt → `COST_STATE_UNKNOWN`(skip, 보수적 — Codex F2)**; cost-tier ∈ autoDisableTiers(default notice/warning/critical) → `TIER_*`; else → `OK_RUN` + fleetSize=4 + minRemaining(=minPerAgent×fleet). frozen `REASONS`.
- **Mirror**: `briefing/cost-guard.js:63` `shouldSkipBriefing` 구조 + `cost-thresholds.js` env override. **의도적 차이**: cost-guard는 cost-state 없으면 run(briefing 저비용)이지만 fan-out은 고비용이라 **없으면 skip**(Codex F2).
- **Validate**: `node --test .../tests/budget.test.js` — mode off/미설정→skip, non-PRD→skip, **cost-state 없음→skip(COST_STATE_UNKNOWN)**, notice/warning/critical→skip, green+on→run(fleetSize=4), 잘못된 env→default+warn.

### Task 3: synthesize oracle
- **Action**: `plan-fanout/synthesize.js` 작성. `synthesizeFanout({perspectives, spent, budgetTotal}) → markdown`. `perspectives`는 `null` 요소(agent 실패) 허용 → `.filter(Boolean)`. 관점별 findings를 severity 정렬 + metaGaps 합집합 + "관점 커버리지(4/4 or 부분)" + 비용 요약을 `## Multi-Perspective Fan-out` 섹션으로 조립. 전부 실패 시 명시적 "fan-out yielded no perspectives — inline grounding used" 문구 반환(caller가 fallback 신호로 사용).
- **Mirror**: `derive/` 렌더러의 pure 마크다운 조립 + `synthesize` 부재 시 정직한 fallback 문자열.
- **Validate**: `node --test .../tests/synthesize.test.js` — 4관점 조립, 부분(2/4 null) 조립, 전부 null → fallback 문구.

### Task 4: Workflow 스크립트 (얇게)
- **Action**: `scripts/workflows/plan-fanout.js` 작성. `export const meta = {name:'mccp-plan-fanout', description, phases:[{title:'Fan-out'},{title:'Synthesize'}]}`(순수 리터럴). 본문: `args`에서 `{prdPath, planPath, minRemaining, fleetKeys}` 수신 → oracle require. **budget 사전 가드(Codex F2)**: 첫 `agent()` 전에 `if (budget.total && budget.remaining() < minRemaining) { log('budget-exhausted skip'); return {skipped:true, reason:'budget'} }`. → `phase('Fan-out')` → `const results = await parallel(list.map(p => () => agent(buildPerspectivePrompt(...), {agentType:p.agentType, effort:'low', label:'fanout:'+p.key, phase:'Fan-out', schema:PERSPECTIVE_SCHEMA})))` (`effort:'low'`로 관점당 내부 소비 억제) → `phase('Synthesize')` → `return {markdown: synthesizeFanout({perspectives:results, spent:budget.spent()}), spent: budget.spent(), coverage: results.filter(Boolean).length}`. `Date.now()` 미사용. `isolation` 미사용(read-only agent라 worktree 불필요).
- **Mirror**: Workflow tool 설명의 canonical `parallel` fan-out-then-synthesize + loop-until-budget 가드.
- **Validate**: `node -c .../plan-fanout.js`(구문). **budget smoke(Codex F2)**: 주입 가능한 budget mock으로 `budget.total` 낮게 준 상태 진입 시 `agent()` 0회 + `skipped:true` 반환 검증. 헬퍼 로직은 oracle(Task 1-3)이 커버, 실행 통합은 Task 7 dogfood.

### Task 5: plan.md Phase 2.5 wiring
- **Action**: Pattern Grounding(§134) 뒤에 `## Phase 2.5 — MULTI-PERSPECTIVE FAN-OUT (opt-in, PRD mode)` 추가. (a) `budget.js resolveFanout` 호출로 run/skip 판정 Bash 블록 → skip이면 인라인 Pattern Grounding 유지 + loud stderr `[mccp:plan-fanout] skipped reason=<R>`. (b) run이면 **본문 LLM에게** `Workflow({scriptPath:'<plugin>/scripts/workflows/plan-fanout.js', args:{prdPath, planPath, budgetTotal, fleetKeys}})` 호출 지시(Workflow tool opt-in 계약: slash-command 지시가 충족). (c) 반환 `markdown`을 plan body에 주입, `coverage`/`spent` 로깅. (d) Workflow throw/미가용 → 인라인 fallback(fail-open, plan 진행 절대 안 막음).
- **Mirror**: plan.md 기존 Phase 구조(5.0 detector→decision→forward 3단) + `MCCP_*` kill switch 관행.
- **Validate**: `MCCP_PLAN_FANOUT=off /mccp:plan <prd>` → 인라인(현행) 무변화. `=on` + green → 주입 확인. 수동 dogfood(Task 7).

### Task 6: 버전·문서·PRD milestone
- **Action**: `plugin.json` `1.20.2→1.20.3`. `CLAUDE.md` §1.4 표 1행("plan fan-out (v1.20.3 M1)") + §4 `MCCP_PLAN_FANOUT`/`MCCP_PLAN_FANOUT_BUDGET`/`MCCP_PLAN_FANOUT_AUTODISABLE_TIER` 토글 문서화. `CHANGELOG.md` row. PRD Delivery Milestones M1 `pending→in-progress` + Plan cell = 이 파일 경로.
- **Mirror**: §3.7 milestone PR 의무 체크리스트.
- **Validate**: `grep 1.20.3 plugin.json`; PRD 표 diff 1행.

### Task 7: dogfood e2e
- **Action**: `MCCP_PLAN_FANOUT=on`으로 이 PRD의 다음 milestone(또는 합성 fixture PRD)에 `/mccp:plan`을 재실행해 fan-out 4관점 → synthesis 주입 → Codex 게이트 무손상 통과를 1회 관찰. `off` 재실행이 현행과 byte-동일 fallback인지 대조. 비용(`spent`)이 fleetSize 상한 내인지 기록(metric baseline 관찰 시작).
- **Mirror**: dashboard cycle의 pre-ship dogfood 관행.
- **Validate**: fan-out on/off 양 경로 동작 + `node --test`(전체 회귀 그린) + plan-codex receipt 정상.

## Validation

```bash
# oracle 단위 테스트 (3 모듈)
node --test plugins/mccp/scripts/lib/plan-fanout/tests/

# Workflow 스크립트 구문
node -c plugins/mccp/scripts/workflows/plan-fanout.js

# oracle 스모크 — mode/cost-tier gate
node -e "const {resolveFanout}=require('./plugins/mccp/scripts/lib/plan-fanout/budget'); console.log(resolveFanout({env:{},prdMode:true,costStateRead:()=>null}))"

# 전체 회귀 (기존 게이트 무손상 확인)
node --test

# 버전 bump 확인
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"  # → 1.20.3
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| fan-out worker가 read-only를 어기고 편집·명령 실행 (Codex F1) | 높음→낮음 | **전용 read-only agent**(`fanout-*`, tools: Read/Grep/Glob) — write/edit/bash **도구 부재**로 구조적 불가. prompt 문장 의존 제거. Task 7이 parent worktree clean 대조 |
| 비용 폭증 (Codex F2) | 높음→중간 | default **off**(명시 opt-in) + fleetSize 고정 + `effort:'low'` + `budget.remaining()` 사전 skip + cost-state 없으면 skip. budget 소진 smoke test |
| `Workflow` opt-in 계약 — command-body가 invocation opt-in 아님 (Codex F3) | 중간→낮음 | default off로 사용자가 `=on` 명시해야 발화. CLAUDE.md에 opt-in 별도 문서화 |
| fan-out이 meta 품질을 실제로 안 높임(가설 반증) | 중간 | 저비용 MVP·관찰 metric으로 조기 판단. read-only라 되돌리기 자유 |
| dual-review 게이트 손상 | 낮음 | 구조적 보장: read-only + receipt 미기록 + Codex 게이트 외곽 배치. plan_hash에 주입돼 review됨 |
| Workflow 결정론 깨짐(`Date.now`/`Math.random` throw) | 낮음 | 스크립트에서 시간·난수 미사용, 타임스탬프는 `args` 주입. synthesize는 pure |
| Workflow 미가용 환경(plugin-only install) | 중간 | 인라인 Pattern Grounding fallback(현행 동작) — fail-open, plan 절대 안 막음 |

## Open Questions — M1 해소/이연 매핑

| PRD Open Question | M1 처리 |
|---|---|
| 게이트 합성 방식 | **해소** — (b) workflow-외곽 확정 |
| receipt attribution | **이연 M2** — M1은 read-only라 receipt 미기록, 발생 안 함 |
| 자체 IPC(envelope) 운명 | **이연 M2** — M1은 envelope 미사용 |
| 비용 정책(budget↔cost-tier) | **해소** — green=run/notice+=disable, fleetSize 고정, budget.total 2차 |
| 병렬 파일 쓰기 안전 | **N/A M1**(read-only) → M2 |
| 결정론/재개(resumeFromRunId·STATE.md) | **부분** — M1은 1-shot(resume 미사용), STATE.md 통합 M2 |
| metric baseline | **관찰 착수** — Task 7이 on/off 비용·재작업 빈도 기록 시작 |

## Acceptance

- [ ] oracle 3개(perspectives/budget/synthesize) 단위 테스트 통과
- [ ] fan-out agent 4개 frontmatter에 Write/Edit/Bash 부재(Codex F1 mechanical) — grep 0건
- [ ] `MCCP_PLAN_FANOUT` 미설정(default off) → 현행 인라인 Pattern Grounding과 동등(무변화)
- [ ] `=on` + PRD mode + green tier → 4관점 fan-out → `## Multi-Perspective Fan-out` 주입
- [ ] cost-tier notice+ **또는 cost-state 없음** → 자동 skip(loud stderr, reason 기록)
- [ ] budget 사전 가드 smoke — `budget.total` 낮으면 `agent()` 0회 skip(Codex F2)
- [ ] fan-out 후 parent worktree clean(read-only 실증, Codex F1)
- [ ] dual-review 무손상 — plan-codex receipt chain 정상 통과
- [ ] `plugin.json` 1.20.3 + CLAUDE.md(opt-in 별도 문서)/CHANGELOG/PRD milestone 갱신
- [ ] Patterns mirrored, not reinvented (cost-guard/oracle 패턴 재사용)

## Design Critique

> impeccable detector가 `briefing/cost-guard.js:63`(Patterns to Mirror 참조)을 design signal로 오탐(false-positive: plan body의 파일:라인 인용을 surface로 오인). 본 plan은 순수 백엔드 orchestration(`Workflow` fan-out + pure oracle lib)으로 rendered design surface가 없음 — impeccable skill scope("Not for backend-only or non-UI tasks") 밖. critique 판정: no design surface → 0 failing findings → **CONVERGED**.

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, worktree-safe tmp)
- 라운드 수: 1 (R1, `MCCP_GATE_ROUND_CAP=1` default)
- 합치 결론: verdict=`needs-attention`("No-ship: prompt-only read-only + unenforced budget + command-body self-authorization") → **R1 absorption으로 3 findings 전부 흡수**. prompt-only 안전가정을 mechanical 강제·정직 재서술·default-off opt-in으로 교체.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 read-only 미강제 (`security-reviewer`/`tdd-guide`가 write-capable) | HIGH | ACCEPT_NOW | 전용 read-only agent(`fanout-*`, tools: Read/Grep/Glob)로 **도구 부재=mechanical 강제** (Design Decision 2 · Task 0/1) |
  | F2 budget hard ceiling 미강제 | HIGH | ACCEPT_NOW | `budget`은 read-only라 설정 불가 → 정직 재서술: fleetSize+`effort:'low'` 구조적 상한 + `remaining()` 사전 skip + cost-state 없으면 skip + smoke test (Design Decision 4 · Task 2/4) |
  | F3 command-body가 opt-in 아님 | MEDIUM | ACCEPT_NOW | `MCCP_PLAN_FANOUT` **default off** + CLAUDE.md 별도 문서화 (Design Decision 5 · Task 5/6) |
- Deferred to backlog: 0
- Self-attest (R1 충분성): 3 findings 모두 **plan 설계 레벨 결함**이라 문서 수정으로 흡수 완결. Codex의 "mechanical enforcement/budget smoke를 추가하라"는 요구는 Task 0/2/4 acceptance에 명시 편입 → 실제 mechanical 검증은 정상 파이프라인(`/mccp:prp-implement` + Implement-Codex 게이트)에서 수행. plan 단계 R2 escalate 불필요(cap=1 존중, ACCEPT_NOW HIGH는 설계로 해소됨).
- Open Questions: 없음 (auto-CRITICAL 0 — secret/data-loss/auth-bypass/irreversible migration 해당 없음)
- Codex session 참조: threadId `019f313b-59e1-7511-89a9-7c5014a67626`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
