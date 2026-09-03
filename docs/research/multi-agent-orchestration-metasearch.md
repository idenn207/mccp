# Multi-Agent Workflow Orchestration — 메타서치 & 설계 방향

> **목적**: mccp의 plan/implement 파이프라인을 "단일 subagent 세션" 방식에서 `deep-research`·`ultracode`처럼 **multi-agent workflow orchestration**으로 재설계하기 위한 사전조사.
> **산출 경로**: `research/workflow-orchestration-metasearch` worktree.
> **다음 단계**: 이 문서를 `/mccp:plan-prd` 입력으로 사용 → 문제 정의 PRD 작성.
> **작성 근거**: (A) `/deep-research` 웹 메타서치(102 agent, 20 소스, 25 클레임 검증) + (B) 세션 실행 컨텍스트에 로드된 **`Workflow` tool 실측 스펙(1차 출처)** + (C) mccp 코드베이스 현행 진단.

---

## 0. TL;DR — 핵심 결론 7가지

1. **사용자가 본 그 기능 = `Workflow` tool.** `deep-research`·`ultracode`가 도는 엔진은 신비한 미문서화 기능이 아니라, **결정론적 JavaScript orchestration 스크립트**를 실행하는 `Workflow` primitive다. 스크립트가 `agent()`로 subagent를 fan-out하고, 중간 결과를 **스크립트 변수**에 담아 메인 context를 얇게 유지한다. ("Opus 4.8엔 사전 정보 없음"이라 하셨지만, 이 도구의 완전한 계약이 현재 실행 세션에 1차 출처로 로드돼 있음 — 웹 hearsay가 아니라 실측 스펙 기반으로 설계 가능.)

2. **Claude Code에는 오케스트레이션 모델이 두 층 있다.** ① **Subagents**(context 격리된 Agent, 기본 background 병렬 실행, 부모가 결과 synthesize) ② **Workflows**(JS 스크립트가 loop/branch/phase를 *코드로* 소유, 각 스텝을 fresh subagent에 위임). 전자는 "모델이 제어 흐름을 결정", 후자는 "당신이 제어 흐름을 코드로 고정"이 본질 차이다. (공식 문서 confirmed)

3. **mccp는 이미 orchestrator-worker를 손수 만들었다 — 단, `Agent` primitive 위에.** `dispatch-controller.js` + `dispatch-cli.js`(envelope IPC, worktree sync, heartbeat/lease)로 v1.20.2에서 implement 스텝을 **격리 단일 worker**에 위임 중. 즉 재설계는 greenfield가 아니라 **"자체 구현한 orchestrator를 공식 `Workflow` primitive로 승격/보완"** 문제다.

4. **재설계의 진짜 결정 포인트는 dual-review 게이트와의 합성이다.** mccp의 차별점(Codex cross-model adversarial review + receipt chain)은 slash-command body + hook + Bash `codex-invoke.js`로 강제된다. Workflow의 `agent()`가 이걸 **각 worker 안에서** 호출할지, 아니면 게이트가 **workflow 전체를 감쌀지**가 PRD의 척추 질문이다.

5. **강한 시너지 하나: mccp의 "state를 디스크(receipt/STATE.md/envelope)에 외부화" 설계는 Workflow 모델과 궁합이 최고다.** subagent는 fresh context로 시작(대화 이력 안 봄)하지만 디스크 파일은 누구나 읽는다. mccp는 이미 context가 아니라 파일에 진실을 둔다 → workflow subagent 격리 모델에 자연스럽게 맞는다.

6. **실패 모드가 실재한다 — 이 조사 자체가 증거다.** 이번 `/deep-research` 한 번이 **102 agent / 6.1M 토큰 / 13분**을 썼다. 커뮤니티 데이터: 단일→5-agent 시 **토큰 3배**, unbounded retry는 "1 blip → 27 LLM calls", 상충 지시는 무한 revision loop, 병렬 파일 쓰기 race는 **공식 문서가 침묵**(= 스스로 방어해야 함). 비용/검증/race 가드레일이 설계 1급 요건.

7. **권장 방향(상세 §7): "게이트를 감싸는 얇은 fan-out"부터.** plan 단계의 다관점 병렬 탐색(read-only, 저위험)을 Workflow로 먼저 도입하고, implement의 병렬 쓰기는 mccp의 기존 worktree-envelope 격리 위에 단계적으로 확장. 전면 재작성(❌)이 아니라 **dispatch-controller를 Workflow primitive로 리팩터 + plan에 fan-out 추가**의 2-트랙.

---

## 1. 조사 방법과 신뢰도 해석 (먼저 읽을 것)

`/deep-research` harness는 **공식 문서에 문자 그대로 적힌 것만 "confirmed"** 로 통과시킨다(3표 adversarial 검증, 2표 이상 refute 시 kill). 그래서 `refuted`로 분류된 클레임 중 다수는 **거짓이 아니라 "블로그/커뮤니티 출처라 공식 문서로 재확인 불가"** 였다. 통계:

| 지표 | 값 |
|---|---|
| 검색 각도(angle) | 5 |
| fetch한 소스 | 20 |
| 추출 클레임 | 84 |
| 검증 클레임 | 25 |
| **confirmed** | **10** |
| refuted | 14 |
| unverified | 1 |
| synthesis 후 최종 finding | 7 |

**본 문서의 신뢰도 라벨 규약**:
- 🟢 **[공식]** — Anthropic/Claude Code 공식 문서가 문자 그대로 확인 (harness confirmed).
- 🔵 **[스펙]** — 현재 실행 세션에 로드된 `Workflow` tool 계약 = **1차 출처, 최고 권위**. harness가 웹에서 "refuted"한 것도 이 스펙이 사실로 확정하는 경우가 있음(아래 명시).
- 🟡 **[커뮤니티]** — 블로그/GitHub 출처. 방향성 참고용, 수치는 일화적.

> ⚠️ harness가 refuted한 것을 스펙이 뒤집는 대표 사례: "Workflows can specify which models subagents use and run subagents in separate worktrees" 는 웹에서 0-2로 refuted됐지만, **[스펙]상 사실**이다 — `agent(prompt, {model, isolation:'worktree'})`가 실제로 존재. harness는 블로그가 과장·혼동했다고 본 것이고, primitive 자체는 둘 다 지원한다. → **"refuted = 거짓"이 아님. 스펙을 신뢰하라.**

---

## 2. Part A — 두 가지 오케스트레이션 모델

### 2.1 Subagents (Agent tool)

- 🟢 **[공식]** 각 subagent는 **fresh, isolated context window**로 시작. 부모 대화 이력·이미 부른 skill·이미 읽은 파일을 **안 본다**(단 `CLAUDE.md`·git status는 preload; Explore/Plan agent는 성능상 이마저 skip).
- 🟢 **[공식]** v2.1.198+ 기준 subagent는 **기본 background 병렬** 실행. 부모 세션이 계속 일하는 동안 동시 진행. 권한 프롬프트는 메인 세션에 뜨고 어느 subagent가 요청했는지 표기(v2.1.186+).
- 🟢 **[공식]** **독립 조사는 병렬 fan-out**: 여러 subagent가 각자 영역을 탐색 → 부모가 종합. (fan-out-and-synthesize)
- 🟢 **[공식]** **중첩 깊이 max 5 고정·비설정.** depth 5의 subagent는 Agent tool을 못 받아 더 못 spawn. (무한 재귀 방지 안전 경계)
- 🟢 **[공식]** resume 시 subagent는 **전체 대화 이력 보존**하고 멈춘 지점에서 재개. transcript ~30일 보존.
- 🔵 **[스펙]** 런타임 병렬 상한 ≈ **min(16, CPU cores − 2)** 동시 / workflow. 초과분은 큐잉.

**한계**: 부모(orchestrator)가 subagent 결과를 **자기 context에 누적** → 긴 파이프라인에서 context 팽창. 큰 중간 상태를 앞으로 넘기려면 파일/env로 직렬화해야 함(fresh context라서).

### 2.2 Workflows (Workflow tool) — 사용자가 본 "그 기능"

- 🟢 **[공식]** Workflow = **JavaScript orchestration 스크립트**. "스크립트가 loop·branch·중간 결과를 스스로 쥐고 있어, Claude의 context엔 *최종 답*만 남는다." (공식 문서가 subagent와 대비해 명시)
- 🟢 **[공식]** "Dynamic workflows execute a javascript file with special functions that spawn and coordinate subagents." 블로그(공식): "제어 흐름을 *당신이* 평범한 코드로 쓰고, 각 스텝을 fresh subagent에 위임한다 — 모델이 제어 흐름을 결정하지 못하게 뒤집는다."
- 🔵 **[스펙]** 스크립트는 반드시 `export const meta = { name, description, phases }`(순수 리터럴)로 시작. 본문에서 아래 hook 사용:

| hook | 역할 | 핵심 성질 |
|---|---|---|
| `agent(prompt, opts?)` | subagent 1개 spawn | `opts.schema` 주면 **StructuredOutput 강제 + 검증된 객체 반환**(파싱 불필요, 불일치 시 자동 retry). `opts`: `label`·`phase`·`model`·`effort`·`isolation:'worktree'`·`agentType`. schema 없으면 최종 텍스트 문자열 반환. 실패 시 `null`. |
| `pipeline(items, s1, s2, …)` | 각 item을 **모든 스테이지에 독립 통과**, 스테이지 간 **배리어 없음** | 기본 다단계 패턴. item A가 stage3일 때 item B는 stage1 가능. wall-clock = 가장 느린 단일 체인. |
| `parallel(thunks)` | 동시 실행 후 **전부 대기(배리어)** | 스테이지 N이 N−1 전체 결과를 함께 봐야 할 때만(dedup/merge/early-exit). throw는 `null`로 흡수 → `.filter(Boolean)` 필수. |
| `phase(title)` | 진행 그룹핑 | 이후 `agent()`가 이 phase에 묶임. |
| `log(msg)` | 사용자에게 진행 narration | |
| `budget` | 토큰 예산 | `total`·`spent()`·`remaining()`. main loop + 모든 workflow 공유 풀. `total` 도달 시 이후 `agent()` **throw(하드 상한)**. |
| `workflow(name/ref, args)` | 다른 workflow를 sub-step으로 | **중첩 1레벨만**(child 안에서 또 부르면 throw). |
| `args` | 입력값(그대로) | named workflow 파라미터화. |

- 🔵 **[스펙]** 전 생애 **agent 총량 상한 1000**(폭주 방지). 단일 `parallel`/`pipeline` 호출 item **최대 4096**.
- 🔵 **[스펙]** `isolation:'worktree'` — agent마다 fresh git worktree(비쌈 ~200-500ms + 디스크). **병렬로 파일을 변형해 충돌 위험일 때만** 사용, 안 바뀌면 자동 제거.
- 🔵 **[스펙]** **Resume**: `Workflow({scriptPath, resumeFromRunId})` — 바뀌지 않은 `agent()` 호출은 캐시 즉시 반환, 편집된 첫 호출부터 라이브 재실행. 같은 스크립트+args = 100% 캐시 히트. (`journal.jsonl`에 agent별 실제 반환값 기록.)
- 🔵 **[스펙]** 스크립트는 **plain JS(TS 아님)**. `Date.now()`/`Math.random()`/argless `new Date()`는 throw(resume 결정성 보호) — 타임스탬프는 args로 주입.
- 🔵 **[스펙]** 기본 **background 실행** — tool은 즉시 task ID 반환, 완료 시 알림. `/workflows`로 라이브 관찰.

### 2.3 두 모델 비교 요약

| 축 | Subagents (Agent) | Workflows (Workflow) |
|---|---|---|
| 제어 흐름 소유 | **모델**(부모가 turn마다 결정) | **코드**(JS 스크립트가 결정론적으로) |
| 중간 결과 저장소 | 부모 **context window**(누적) | **스크립트 변수**(context 오염 없음) |
| 결정론 | 낮음(모델 판단) | 높음(loop/branch가 코드) |
| 재현/재개 | resume는 대화 이력 재생 | `resumeFromRunId` 캐시 replay |
| fan-out 규모 | 실무 ~16 동시 | ~16 동시 / 생애 1000 / 호출당 4096 |
| 적합 | 탐색적·소수 위임 | 대규모 병렬 파이프라인·다단계 검증 |

> **설계 함의**: plan/implement처럼 "결정론적 다단계 + 병렬 + 검증"이 필요한 파이프라인은 **Workflow 모델이 정답에 가깝다.** mccp의 receipt-chain 결정론과 철학이 일치.

---

## 3. Part B — 오케스트레이션 패턴 카탈로그

🔵 **[스펙]**(Workflow tool 설명이 직접 열거) + 🟡 **[커뮤니티]** 교차. harness는 블로그의 "6패턴 정확 목록"을 refuted했지만, 스펙이 사실상 동일 카탈로그를 문서화한다:

| 패턴 | 형태 | mccp 매핑 후보 |
|---|---|---|
| **fan-out & synthesize** | N개 finder 병렬 → 종합 | plan의 다관점 탐색(architect/security/test 동시) |
| **adversarial verify** | finding마다 독립 skeptic N명이 *반증* 시도, 과반 refute 시 kill | **Codex dual-review의 workflow 네이티브화** |
| **perspective-diverse verify** | 검증자마다 다른 렌즈(correctness/security/perf/repro) | code-review 다관점 |
| **judge panel** | N개 독립 시안 생성 → 병렬 채점 → 승자 종합 | plan 대안 설계 비교 |
| **loop-until-dry** | 새 발견 0이 K회 연속까지 finder 반복 | 미해소 finding 소진 루프 |
| **multi-modal sweep** | 각자 다른 방식으로 검색(by-container/content/entity/time) | 코드베이스 다각 탐색 |
| **completeness critic** | 마지막에 "무엇이 빠졌나" 묻는 agent | 게이트 종료 전 누락 점검 |
| **pipeline (기본)** | item×스테이지, 배리어 없음 | 파일별 구현→검증 독립 진행 |

**canonical 예시(스펙 인용)**: 차원별 review → 각 finding을 리뷰 완료 즉시 병렬 verify(`pipeline`). 배리어는 "전체 결과를 dedup한 뒤 비싼 검증"일 때만.

---

## 4. Part C — 실패 모드 & 안티패턴 (설계 가드레일의 근거)

🟡 **[커뮤니티]** 수치는 일화적이나 방향은 일관. **이 조사 실행 자체(102 agent/6.1M tok/13분)가 비용 실재의 1차 증거.**

| 실패 모드 | 증상/데이터 | mccp 기존 방어 | 추가 필요 |
|---|---|---|---|
| **비용 폭증** | 단일→5-agent 토큰 **3×**. 극단 사례 "$47K / 11일". | cost-tier($50/$80/$100), auto-handoff | Workflow `budget.total` 하드 상한 필수 |
| **unbounded retry 폭발** | "1 blip → 27 LLM calls"(3층×3회). 건강한 系 agent turn당 1-4 calls, 저하 系 20+. | `MCCP_GATE_ROUND_CAP`(기본 1) | fan-out 내부 retry에도 캡 전파 |
| **상충 지시 무한 루프** | Editor "professional" vs Writer "casual" → Mirror-Mirror 순환, 분 단위 수천 달러 | dual-review 수렴 룰(R1/R2 cap) | 병렬 worker 간 목표 상충 검출 |
| **orchestrator context overflow** | 부모가 모든 worker context 흡수 | **envelope 요약만 회수**(v1.20.2) | Workflow는 스크립트 변수라 구조적 해결 |
| **병렬 파일 쓰기 race / merge 충돌** | 🟢 **공식 문서 침묵**(open question) — 동시 파일 I/O 안전·락·충돌 해결 미문서화 | worktree 격리 + envelope→parent atomic sync | `isolation:'worktree'` 표준화 |
| **검증 부재(verification-absent)** | fan-out만 하고 adversarial verify 안 함 | receipt chain + fail-closed | verify를 pipeline 스테이지로 강제 |

> **결론**: mccp가 이미 만든 방어(cost-tier·round-cap·envelope 요약·worktree·fail-closed)가 이 실패 모드 목록과 **거의 1:1로 대응**한다. 재설계는 이 방어들을 Workflow primitive 위로 옮기는 작업이지, 새로 발명하는 게 아니다.

---

## 5. Part D — 커뮤니티/서드파티 응용 사례

🟡 **[커뮤니티]** harness가 대부분 공식 재확인 실패로 refuted했으나, **선행 패턴 참고용**으로 유효:

| 프로젝트/출처 | 접근 | 시사점 |
|---|---|---|
| `alexop.dev` (블로그) | "Workflow는 제어 흐름을 코드로 뒤집는다 — 각 스텝을 fresh subagent 위임" | **[스펙]과 일치** — 가장 정확한 3rd-party 설명 |
| `xirothedev/claude-workflow-plugin` | 스테이지 내 병렬 spawn(한 메시지 다중 Agent), JSON schema 검증 + 1회 retry | mccp schema 게이트와 유사 발상(단 세부는 refuted) |
| `barkain/claude-code-workflow-orchestration` | `DONE\|{path}` output-based handoff, plan-mode 기반 phase 분해 | **envelope handoff = mccp dispatch-controller가 이미 하는 것** |
| `Dicklesworthstone/claude_code_agent_farm` | tmux pane N개 + `claude` CLI 개별 invocation | **구식 workaround**. Workflow primitive 등장 전 시대. mccp가 이걸 넘어섰음을 확인 |
| `anthropics/claude-code#10599` | git worktree 격리로 병렬 agent 파일 충돌 방지 제안 | 커뮤니티도 worktree 격리로 수렴 — mccp 방향 검증 |
| `platform.claude.com` managed-agents (beta) | agent별 독립 session thread, 공유 sandbox/fs/vault | 🟢 별도 beta API(Claude Code subagent와 다름). 참고만 |

> **메타 관찰**: 서드파티들이 손수 재발명한 것(tmux farm, DONE|path handoff, worktree 격리)을 **Anthropic이 `Workflow` primitive로 1급화**했다. mccp의 `dispatch-controller`는 이 재발명 계보에 속하며, 이제 primitive로 승격할 타이밍.

---

## 6. Part E — mccp 현행 아키텍처 진단

**핵심 사실: mccp는 `Workflow()` tool을 쓰지 않는다.** `Agent`(Task) primitive 위에 자체 orchestrator를 구축했다.

### 현행 구성
- `dispatch-controller.js` + `dispatch-cli.js`: envelope schema(`.claude/state/dispatches/<uuid>.envelope.json`), Monitor+polling watcher, worktree→parent atomic sync, `prepareDispatch`/`mergeEnvelopes` 순수 lib(controller 자체는 Agent 호출 안 함 — caller가 함).
- **v1.20.2 M1**: `/mccp:work` Step 3 implement를 **격리 단일 worker Agent**로 위임(`prepare-single` → `Task` → `merge`). 메인은 envelope 요약만 회수.
- 격리 invariant: worker는 **implement까지만**, commit(Step 4)/PR(Step 5)은 controller 전용. worker가 mccp-pr-codex receipt를 leak하면 merge가 **HARD HALT**(Codex F1).
- attribution: worker receipt를 3 플래그로 controller session에 anchor → PR cross-gate dedupe가 dual-review 보존.

### 진단 (gap)
| 항목 | 현재 | Workflow 모델이면 |
|---|---|---|
| primitive | `Agent`(Task) 수동 오케스트레이션 | `Workflow` 스크립트 결정론 제어 |
| 병렬도 | **single-worker**(implement 1스텝만) | N-way fan-out(~16 동시) |
| plan 단계 | 단일 planner subagent + Codex | 다관점 병렬 탐색 + judge panel |
| 중간 상태 | envelope(디스크) — 잘 됨 | 스크립트 변수 — 구조적으로 더 깔끔 |
| 제어 흐름 | slash-command body(마크다운 지시) | JS 코드(테스트·재개 가능) |
| 재개 | STATE.md handoff + resume | `resumeFromRunId` 캐시 replay |

**강점(보존할 것)**: state 디스크 외부화(receipt/STATE/envelope), fail-closed 게이트, cost-tier, round-cap, worktree 격리, dual-review dedupe. → **이 전부가 Workflow 모델과 호환·시너지.**

**약점(재설계 대상)**: (1) plan이 여전히 단일 세션. (2) implement가 single-worker(병렬 아님). (3) 제어 흐름이 마크다운 지시라 결정론/테스트/재개가 약함. (4) 자체 IPC(envelope watcher)가 primitive와 중복.

---

## 7. Part F — 설계 방향 (권장)

### 결정 척추 질문
> **dual-review 게이트(Codex + receipt chain)와 Workflow의 `agent()`를 어떻게 합성하는가?**
> — (a) 각 worker *안에서* 게이트 호출? (b) 게이트가 workflow *전체를 감쌈*? (c) verify를 pipeline 스테이지로?

### 3가지 옵션

**옵션 1 — "얇은 fan-out 우선"(권장 시작점, 저위험)**
- **plan 단계에만** Workflow 도입: architect/security/test/code-explorer를 **read-only 병렬 fan-out** → synthesize → 기존 Codex 게이트는 그대로.
- 파일 변형 없음(read-only) → race/merge 무위험. 비용은 `budget`으로 상한.
- implement는 당분간 현행 single-worker dispatch 유지.
- 장점: dual-review·receipt chain 무손상. 빠른 가치 증명. 되돌리기 쉬움.

**옵션 2 — "dispatch-controller를 Workflow로 리팩터"(중위험)**
- 자체 envelope watcher/IPC를 `Workflow` primitive(`agent`+`pipeline`+`isolation:'worktree'`)로 교체. implement를 **파일별/모듈별 N-worker 병렬**로 확장.
- verify를 `pipeline` 마지막 스테이지로 강제(Codex adversarial를 workflow 네이티브 adversarial-verify 패턴으로).
- 장점: 중복 IPC 제거, 병렬 구현. 단점: receipt-chain 앵커링을 workflow 컨텍스트에 재설계 필요(현 3-플래그 attribution → workflow 반환값 기반).

**옵션 3 — "전면 Workflow 오케스트레이터"(고위험, 비권장 초기)**
- work.md 전체(PRD→plan→implement→PR)를 단일 workflow 스크립트로. commit/PR 같은 되돌릴 수 없는 external state를 workflow가 소유 → **위험**. Workflow tool 설명도 "hard-to-reverse는 확인 후"를 요구.

### 권장: **옵션 1 → 옵션 2 단계적**
1. **Phase A(plan fan-out)**: 저위험 read-only 병렬 탐색으로 Workflow 도입, dual-review 무손상 검증.
2. **Phase B(implement 병렬)**: dispatch-controller를 Workflow primitive로 리팩터, worktree 격리 표준화, verify를 pipeline 스테이지화.
3. **commit/PR은 계속 controller/메인 소유**(irreversible state 격리 invariant 유지 — v1.20.2 Codex F1 원칙 그대로).

### 반드시 실을 가드레일 (Part C 근거)
- `budget.total` 하드 상한(비용 폭증) — cost-tier와 연동.
- fan-out 내부 retry에도 `MCCP_GATE_ROUND_CAP` 전파(retry 폭발).
- 파일 변형 병렬은 `isolation:'worktree'` 강제(race).
- verify 스테이지 필수(verification-absent 안티패턴).
- kill switch(기존 `MCCP_*` 토글 관행) — 인라인 fallback 보존.

---

## 8. Part G — `/mccp:plan-prd`로 넘길 열린 질문 & 결정 포인트

1. **게이트 합성 방식** — dual-review를 (a) worker-내부 / (b) workflow-외곽 / (c) pipeline-스테이지 중 무엇으로? (receipt chain 앵커링 재설계 범위 결정)
2. **receipt attribution** — workflow subagent가 fresh context인데, 현 3-플래그 controller-session anchor를 workflow 반환값 기반으로 어떻게 옮기나?
3. **첫 도입 범위** — plan만(옵션 1) vs implement 포함(옵션 2)? milestone 분할(M1=plan fan-out, M2=implement 병렬, M3=verify 네이티브화)?
4. **자체 IPC 운명** — dispatch-controller/envelope를 Workflow primitive로 교체 vs 병존? (v1.2.0-m1 substrate 폐기/승계 결정)
5. **비용 정책** — Workflow `budget`을 cost-tier($50/$80/$100)와 어떻게 매핑? 게이트별 상한?
6. **병렬 파일 쓰기 안전** — 공식 문서 침묵 영역. worktree 격리 + envelope merge invariant로 충분한가, 추가 락 필요한가?
7. **결정론/재개** — 마크다운 slash-command body → JS workflow 스크립트 이전 시, 기존 STATE.md handoff/resume와 `resumeFromRunId`를 어떻게 통합?
8. **plugin.json 버전** — ~~이 정도 변경은 PRD 전체 완료 시 minor bump(§3.7). milestone별 patch 누적.~~ **무효(2026-09-03)**: 우산 결정 1 이후 자식 브랜치는 번호를 선언하지 않는다. 이 항목의 판정 자체가 브랜치가 내릴 판정이 아니다 — 릴리스 컷이 소유한다(§3.7 현행).

---

## Appendix — 출처 & 검증 상세

### A. 🟢 공식 confirmed findings (harness 2/3+ 표)
1. Subagent fresh isolated context(CLAUDE.md·git status만 preload; Explore/Plan은 skip); resume 시 전체 이력 보존; transcript ~30일. — `code.claude.com/docs/en/sub-agents`
2. v2.1.198+ 기본 background 병렬; 권한 프롬프트 메인 세션 표기(v2.1.186+). — 동일
3. Workflow = JS 스크립트가 loop/branch/중간결과 소유, context엔 최종답만. — `code.claude.com/docs/en/workflows`, `claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code`
4. 독립 조사 병렬 fan-out → 부모 synthesize. — sub-agents docs
5. 중첩 depth max 5 고정·비설정. — sub-agents docs
6. Agent SDK 4단계 loop: gather context → take action → verify work → repeat. — `anthropic.com/engineering/building-agents-with-the-claude-agent-sdk`
7. (medium 신뢰) managed-agents beta: agent별 독립 session thread, 공유 sandbox/fs/vault. — `platform.claude.com/docs/en/managed-agents/multi-agent`

### B. 🟡 refuted이나 방향 참고(공식 재확인 실패 ≠ 거짓)
- Workflow가 model 지정·worktree 격리 가능 → **[스펙]상 사실**(`agent({model, isolation})`).
- 6패턴 카탈로그 → **[스펙]이 유사 카탈로그 문서화**(§3).
- git worktree 병렬 격리, DONE|path handoff, tmux farm → 커뮤니티 선행 패턴(§5).
- 실패 모드 수치(3× 토큰, 27 calls, $47K) → 일화적, 방향 유효(§4).

### C. 열린 질문(공식 문서 침묵)
- 병렬 파일 쓰기 충돌/락/merge 전략 — 미문서화.
- background 동시 subagent 토큰 과금 모델 — 미문서화.
- workflow를 subagent로 spawn 가능한가(재귀 orchestration) — 불명확(스펙상 `workflow()` 중첩은 1레벨).
- ~30일 transcript 보존이 장기 파이프라인과 충돌하나 — 미문서화.

### D. 방법론 메모
- 실행: `/deep-research` dynamic workflow, run `wf_5bd5a27f-c42`. 102 agent, 6.1M subagent 토큰, 868 tool use, ~816s.
- 3 agent가 "Prompt is too long"으로 실패(verify 단계 일부) → 최종 confirmed 수에 반영됨(보수적).
- 원본 결과: `tasks/w5zjzzs5k.output`(2502줄), 저널: `subagents/workflows/wf_5bd5a27f-c42/journal.jsonl`.
- **1차 출처 보강**: `Workflow` tool 계약이 실행 세션에 로드돼 있어, 웹 hearsay를 실측 스펙으로 교차검증함(🔵 라벨).
