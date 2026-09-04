# orchestrator-step-wiring — 지표가 읽는 위치에 좌우되지 않게 한다

> 우산 PRD [harness-wiring-integrity](harness-wiring-integrity.prd.md)의 **자식 C2**.
> 그룹 1 — 선행조건 없음. C9 M1과 C10의 착수 전제.
> 근거 조사: [2026-08-31-final-harness-assessment-and-umbrella-prd.md](../_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md) §B
>
> **이 PRD는 우산의 C2 서술을 정정한다.** 우산은 *"`record-step` 0회 호출 → A1이 `null`"* 이라고
> 적었으나 두 명제는 연결되지 않는다. `record-step`은 A1이 읽는 채널에 쓰지 않으며 A1은 이미
> 산출되고 있다. 아래 Evidence가 그 정정의 근거이고, 그래서 문제의 형태가 바뀐다.

## Problem

**무인 완주율(A1)은 이미 산출된다. 다만 그것을 어디서 읽느냐가 값을 정한다.** 이벤트 corpus가 worktree-local이라, 게이트를 실제로 돌린 worktree에서 derive를 돌리면 `computed 0.5`가 나오고 main repo에서 돌리면 `null`이 나온다. 같은 저장소, 같은 코드, 같은 시각에 값이 셋으로 갈린다. 우산 PRD가 *"producer에 caller가 없다"* 고 판정한 것은 게이트가 한 번도 돌지 않은 main repo에서 derive를 돌린 결과이며, 관측된 것은 배선 단절이 아니라 **집계 경계의 부재**다.

두 번째 결함은 별개 축이다. `/mccp:work`가 **어디서 멈췄는지**의 기록이 없다. `recordStep` producer는 `auto-chain.js:240`에 구현돼 있고 orchestrator CLI가 `record-step`으로 노출하지만, `commands/work.md`에 그 서브커맨드가 0회 등장한다. 우산 지표 1이 지정한 소비 행동 — *"하락 시 어느 phase가 막았는지 표시"* — 을 채울 데이터가 어디에도 없다.

대가는 지표 1의 두 반쪽이 모두 신뢰 불가라는 것이다. 값은 "누가 어느 디렉토리에서 derive를 돌렸나"라는 우연이 정하고, 값이 나빠도 무엇을 고쳐야 하는지 답할 수단이 없다. 그리고 오늘의 소비 회로는 그 값을 **"세션 착수 안정성 / 정상 완료 세션 비율"** 이라 부르는데 실제 계산 단위는 세션이 아니라 작업 단위다 — 읽는 사람이 다른 것을 읽는다.

## Evidence

전부 2026-09-01 저장소 직접 실측이며, `.worktrees/` 8개 전부와 main repo를 대상으로 했다.

- **A1은 이미 `computed`다.** 게이트를 실제로 돌린 worktree에서 `derive/cli.js run`을 돌린 결과: `diverse-agent-review` → `{value: 0.5, numerator: 2, denominator: 4, status: "computed"}`, `multi-session-work-loop-m8` → 동일, `env-contract-integrity` → `computed`. **main repo와 게이트를 돌리지 않은 worktree에서만 `null`**(`status: "forward-only"`, 사유 `"no live startup producer wired"`)이다.
- **producer 2종이 실재하고 발화 중이다.** `task_started`는 `hooks/receipt-prompt.js:191`이 UserPromptExpansion hook(`hooks.json` matcher `^mccp:.*`)에서 emit하고, `task_completed`는 `commands/pr.md:1427`이 PR 번호 획득 직후 `state/cli.js --kind task_completed`로 emit한다. 전 worktree corpus 523 이벤트 중 KIND 기준 `task_started` 25건 · `task_completed` 5건이 실재한다.
- **`recordStep`은 A1과 다른 채널이다.** `auto-chain.js:240-254`는 `state-writer.recordChainProgress`(STATE.md `chain_progress`) 또는 fallback `.claude/state/auto-chain.log.jsonl`에 쓴다. A1이 읽는 것은 `derive/sources/session-activity.js:184-192`가 스캔하는 `.claude/state/msw-events/*.jsonl`의 KIND 이벤트다. **두 경로는 만나지 않는다** — `record-step`을 배선해도 A1은 한 자릿수도 변하지 않는다.
- **`work.md`에 `record-step`이 0회다.** orchestrator CLI를 부르는 줄은 `:90`(classify)과 `:165`(next-step) 둘이고, `:139`는 *"Between each, query `work-orchestrator.js next-step`"* 이라는 산문이다. 우산의 이 관측은 정확하며, 다만 그것이 막고 있는 것은 A1이 아니라 halt 지점 기록이다.
- **저장소 전체 합산 baseline** — 전 worktree의 `msw-events`를 work_unit 기준으로 dedupe하면 **착수 13 · 완주 5 = 38.5%**다. 착수 기록 없는 완주는 **0건**이라 데이터 정합성 자체는 양호하다.
- **분모의 granularity가 섞여 있다.** 착수 13개 중 4개가 PRD 이름(`diverse-agent-review` · `env-contract-integrity` · `multi-session-work-loop` · `release-channel-separation`)이고 9개가 milestone 이름(`-m1` · `-m3` · `-m4` · `-m5` · `-m8` · `-m9` · `-m10` · `-m11`)이다. `receipt-prompt.js:167`의 `NON_WORK_UNIT_COMMANDS`는 `mccp:plan-prd` 하나만 제외하는데, PRD 경로로 호출된 다른 명령이 PRD basename을 슬러그로 낸다. 우산 작업 단위 정의("PRD milestone 1개 = plan 1개 = PR 1개")와 어긋나는 행이 분모의 31%다.
- **대시보드도 worktree-local이다.** `.gitignore:131`이 `.claude/cache/`를 무시하므로 `STATUS.md` · `status.html`은 산출한 worktree에만 존재한다. 즉 "값이 읽히는 화면"조차 파편화의 일부이고, 지금은 그 화면이 어디에 있어야 하는지가 정해져 있지 않다.
- **소비 회로의 라벨이 계산 단위와 어긋난다.** `renderer/sections/msw-metrics.js:33-38`이 A1을 `name: '세션 착수 안정성'` · `desc: '정상 완료 세션 비율'`로 표시하는데, `computeA1`의 분모는 `task_startups_count`(distinct work_unit)다. 세션과 작업 단위는 다대다이며 이 저장소에서는 한 작업이 여러 세션에 걸치는 것이 정상이다.
- **`/mccp:work` 진입에는 지표가 없다.** `work.md:88`이 출력하는 것은 `classification=$TYPE reason=$REASON` 한 줄이고, 우산 지표 1이 지정한 소비 지점(*"`/mccp:work` 진입 배너"*)에 A1도 halt phase도 나타나지 않는다.

## Users

- **Primary**: **운영자 본인 — 지표를 근거로 무엇을 자를지 정하려는 사람.** 우산의 1차 사용자 정의를 상속한다. 이 자식에 고유한 트리거는 둘이다. (a) 무인화가 나아지고 있는지 물었을 때 답이 "어느 디렉토리에서 봤느냐에 따라 다르다"로 돌아온다. (b) 값이 낮다는 것을 알아도 다음 행동이 정해지지 않는다 — 어느 step이 막았는지가 기록되지 않기 때문이다.
- **Not for**: **marketplace 실사용자.** 이 자식은 계측과 표시만 바꾸며 게이트 판정을 건드리지 않는다. 사용자가 체감할 변화는 `/mccp:work` 진입에 줄이 하나 늘어나는 것뿐이다. 우산 병렬 안전성 표가 C2를 "중간 체감"으로 분류한 것은 실행 경로 변경 때문이며, 이 PRD는 그 변경을 fail-open으로 못박아 체감을 낮춘다.

## Hypothesis

We believe **이벤트 집계 경계를 저장소 전체로 올리고, 그 값을 실제로 읽히는 지점에 붙이는 것**이 **"지표가 읽는 위치에 좌우되어 값이 우연히 정해지고, 무인 완주가 어디서 막혔는지 답할 수단이 없다"** 는 문제를 **운영자 본인** 에게 해소할 것이다.

We'll know we're right when **서로 다른 세 곳(main repo · 게이트를 돌린 worktree · 방금 만든 빈 worktree)에서 derive를 돌려 같은 A1이 나오고, 그 값이 `/mccp:work` 진입 시 표시되는 것이 한 번 실측될 때**.

## Success Metrics

| # | 지표 | 오늘 | 목표 | 어떻게 측정 | 읽는 주체 → 바꾸는 행동 |
|---|---|---|---|---|---|
| 1 | A1의 위치 의존성 | **3값으로 갈림** (`null` · 0.5 · 0.33) | **1값** | 3개 위치에서 `derive/cli.js run --json`을 돌려 `metrics.A1.value` 비교 | 운영자 → 갈리면 집계 경계가 새는 것 |
| 2 | 저장소 전체 A1 | **5/13 = 38.5%** (오늘 처음 산출) | 축 A: 안정적으로 산출된다. **목표치는 정하지 않는다** | 합산 derive | 운영자 → baseline 2주 후 우산 축 B에서 목표 확정 |
| 3 | 분모 granularity 정합 | **13 중 PRD 4 · milestone 9 혼재** | 단일 granularity | 착수 work_unit을 우산 작업 단위 정의와 대조 | 운영자 → 혼재하면 분모가 부풀어 값이 눌린다 |
| 4 | halt 지점 기록률 (멈춘 `/mccp:work` 중 어느 step인지 기록된 비율) | **0%** | M2 착지 후 산출된다 | `chain_progress` 또는 `auto-chain.log.jsonl` 대조 | 운영자 → A1 하락 시 그 step을 먼저 본다 |
| 5 | 소비 지점 노출 | **0곳** (`/mccp:work` 진입에 지표 없음) | **1곳 이상** | `/mccp:work` 라이브 1회 | 운영자 → 안 보이면 또 계측 부채다 |

지표 2에 목표치를 두지 않는 것은 우산 축 B의 판정을 그대로 따른 것이다 — 오늘 값이 방금 처음 생겼으므로 지금 목표를 정하면 근거 없는 숫자가 된다. 지표 1·3·5는 오늘 값이 이산이라 목표도 이산이다.

## Scope

**MVP — M1 단독.** 집계 경계를 저장소 전체로 올리고, 분모 granularity를 정합화하고, 값을 `/mccp:work` 진입에 노출한다.

M1이 MVP인 이유는 **가설이 M1만으로 검증되기 때문**이다. M2(halt 지점 기록)는 값이 신뢰 가능해진 뒤에야 의미가 있다 — 오늘은 값 자체가 위치에 좌우되므로, 하락을 관측해도 그것이 실제 하락인지 다른 디렉토리에서 봤기 때문인지 구분할 수 없다. 순서를 뒤집으면 M2가 산출하는 기록을 해석할 기준선이 없다.

### 이 PRD가 못박는 결정 4건

| # | 결정 | 근거 |
|---|---|---|
| 1 | **완주의 정의를 바꾸지 않는다 — PR 번호 생성 시점 그대로** | `pr.md:1427`이 이미 그 시점에 emit한다. 머지까지를 완주로 삼으면 지표가 사람의 리뷰 대기 시간을 재게 되어 "무인 완주"라는 축이 섞인다. 그리고 이 결정은 **변경 0**이라 M1의 diff를 늘리지 않는다 |
| 2 | **집계 경계는 저장소 전체다** | work_unit은 worktree를 넘어 같은 decision slug이고, 실측에서 같은 unit이 여러 worktree에 나타났다. 오늘은 "derive를 돌린 디렉토리"라는 우연이 경계를 정한다 — 그것은 경계가 아니라 사고다 |
| 3 | **기록 실패는 체인을 멈추지 않는다 (fail-open)** | 계측 경로의 어떤 실패도 `/mccp:work`의 게이트 판정·진행을 바꾸지 않으며, 실패는 조용히 삼키지 않고 loud stderr로 표면화한다. 우산 risk가 이것을 C2의 acceptance 조건으로 지정했다. 기록은 체인의 부수효과이지 전제조건이 아니다 — 기존 producer 2종이 이미 이 형태다(`receipt-prompt.js:201`의 fail-open catch) |
| 4 | **`work.md:224` ↔ `:715`의 파일명 불일치는 C2 밖이다** | 같은 파일이라 묶는 비용은 낮지만, 그 수정은 **미실행이던 merge-apply escape를 실행시킨다** — 계측 추가와 배포 위험 계급이 다르다. 우산도 C2 소유로 명시하지 않았다. 별도 축으로 이연한다 |

### Out of scope

- **`work.md:224`/`:715` 파일명 불일치** — 결정 4. 같은 실패 모드지만 동작 변경이다.
- **완주 정의 변경 · 새 완주 producer** — 결정 1.
- **A1 목표치 설정** — 우산 축 B가 baseline 2주 후에 정한다. 이 PRD는 값이 산출되고 안정되게만 만든다.
- **A2 · A4 · B2 등 다른 forward-only 지표의 배선** — 각각 producer 사정이 다르다. C2는 A1 축만 다룬다.
- **이벤트 corpus의 git-tracked 승격** — §3.12 내구성 계약을 건드리는 결정이라 이 PRD가 단독으로 정하지 않는다(Open Question 3).
- **halt의 원인 분류 · 자동 진행** — C9 소유. C2는 "어느 step에서 멈췄다"까지만 기록한다.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | metric-boundary-unification | 어느 위치에서 derive를 돌려도 같은 A1이 나온다. 분모가 단일 granularity를 갖는다. 그 값이 `/mccp:work` 진입에 표시되고, 표시 라벨이 계산 단위(작업 단위)와 일치한다 | complete | `.claude/plans/orchestrator-step-wiring-m1.plan.md` · 결과 `.claude/PRPs/reports/orchestrator-step-wiring-m1-report.md` |
| 2 | halt-step-recording | `/mccp:work`가 멈춘 step이 기록되어, A1이 하락했을 때 어느 phase가 막았는지 답해진다. 기록 실패는 체인을 멈추지 않는다 | in-progress | `.claude/plans/orchestrator-step-wiring-m2.plan.md` · 결과 `.claude/PRPs/reports/orchestrator-step-wiring-m2-report.md` |

## Open Questions

- [ ] **분모 granularity를 어느 쪽으로 정합화할 것인가.** PRD 단위 4건을 분모에서 제외할 것인지(`NON_WORK_UNIT_COMMANDS` 확장), milestone 단위로 정규화할 것인지, 아니면 두 축을 분리해 각각 산출할 것인지. 오늘 값 38.5%는 이 결정에 따라 달라진다 — **baseline을 확정하기 전에 답해야 한다.**
- [ ] **집계를 어떻게 성립시킬 것인가** — 이벤트를 git common dir 같은 공유 위치에 쓸 것인지, 읽는 쪽이 `git worktree list`를 순회할 것인지. 전자는 producer를 바꾸고 후자는 reader를 바꾼다. 배포 위험이 다르다(전자는 hook 경로, 후자는 derive 경로).
- [ ] **삭제된 worktree의 이벤트를 어떻게 할 것인가.** worktree를 지우면 그 이벤트가 사라져 과거 A1이 소급 변한다. 오늘도 이미 그렇지만 집계 경계를 올리면 표면화된다. 보존할 것인지, 사라지는 것을 받아들이고 그 사실을 표시할 것인지.
- [ ] **값이 읽히는 화면이 어디여야 하는가.** `STATUS.md`는 `.claude/cache/`라 gitignored이고 산출한 worktree에만 있다. `/mccp:work` 진입 배너 하나로 충분한지, 대시보드의 위치도 함께 정해야 하는지.
- [ ] **A1의 표시 라벨을 정정하는 범위.** `renderer/sections/msw-metrics.js`의 `name`/`desc`가 "세션"이라 적는데 계산은 작업 단위다. 라벨만 고칠 것인지, 같은 종류의 어긋남이 다른 지표에도 있는지 확인할 것인지.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 집계 경계를 올렸는데 소비 회로를 안 붙여 또 계측 부채가 된다 — 이 저장소의 base rate상 가장 높은 위험이다 | **높음** | 높음 | 지표 5(소비 지점 노출 1곳 이상)를 M1의 acceptance에 둔다. 값이 어딘가에 표시되지 않으면 M1은 완료가 아니다 |
| 계측 경로의 실패가 `/mccp:work` 체인을 멈춘다 | 중 | **높음** | 결정 3(fail-open)을 acceptance 조건으로 못박는다. 기존 producer 2종이 이미 그 형태이므로 새 패턴이 아니다 |
| granularity 결정을 미룬 채 baseline을 확정해, 나중에 정합화하면 값이 점프하고 그 점프가 개선으로 오독된다 | 중 | 중 | Open Question 1을 M1의 **착수 전** 결정으로 둔다. baseline 확정보다 먼저 답한다 |
| worktree 순회 집계가 다른 저장소나 중첩 worktree를 잘못 포함한다 | 낮음 | 중 | 경계를 `git worktree list`가 보고하는 목록으로 한정한다. 그 밖의 경로는 집계하지 않는다 |
| 표시된 A1을 운영자가 "세션 성공률"로 계속 오독한다 | 중 | 낮음 | 라벨 정정을 M1 acceptance에 포함한다. Open Question 5는 정정의 *범위*만 남긴 것이고, 라벨이 틀린 채 노출하는 선택지는 없다 |
| M2의 `record-step` 배선이 `work.md`를 건드려 C10(같은 파일 소유)과 충돌한다 | 중 | 낮음 | 우산 직렬 큐는 `plan.md` 축이고 C10의 `work.md` 접점은 확인 정지 경로다. M2 착수 시 C10 상태를 먼저 확인한다 |

## Design Routing Guide
<!-- v1.13.0 stage-aware routing — PRD 단계는 recommend-only. 아무것도 invoke하지 않으며 receipt도 쓰지 않는다. -->
<!-- 하류 /mccp:plan이 이 가이드를 재파생해 mccp-plan-codex receipt에 routing mode를 stamp한다. -->

이 PRD의 M1은 렌더링 표면 둘(`/mccp:work` 진입 출력 · A1 라벨)을 건드리므로 detector가
`design_signal=true`를 냈다. 아래는 하류 게이트가 참조할 권장 목록이며 PRD 단계의 발화는 0건이다.

| Stage | Command |
|---|---|
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable quieter` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| polish | `/impeccable polish` |

`shape`는 다단계 discovery interview를 요구해 비대화형 게이트에서 제품 진실을 지어내므로
카탈로그에서 제외한다(CLAUDE.md 3.10 UI5). `craft`·`live`도 같은 이유로 제외다.

## Design Critique Record
<!-- plan-prd는 receipt를 쓰지 않으므로 이 판정은 observational이다. 하류 /mccp:plan이 재실행한다. -->

R0 1회, verdict `CONVERGED`. SKILL `## Output Constraints` 4개 앵커를 이 PRD 본문에 적용한 결과:

| 앵커 | 측정 | 판정 |
|---|---|---|
| 정보 위계 3단계 (H15) | heading depth `#`1 / `##`9 / `###`2 — 최대 3 | 통과 |
| 강조색 화면당 1개 | 강조 계층 1종(bold)만 사용, 불균형 마커 0건 | 통과 |
| raw markdown marker 금지 | 미완결 `**` 0건 | 통과 |
| 한 화면 항목 수 상한 | Open Questions 5 · Risks 6 · Evidence 9 — 상한 초과 | **적용 대상 아님** |

마지막 앵커를 적용하지 않는 근거는 셋이다. (a) PRD는 rendered surface가 아니라 downstream
파서의 입력이고, `archive-complete/scan.js:117`이 `## Delivery Milestones`를 리터럴 섹션으로
찾아 원시 행 단위로 파싱한다. (b) `<details>` collapse 선례가 이 저장소 PRD 8건에 **0건**이라,
넣으면 이 문서만 다른 형식이 된다. (c) 그 앵커의 출처인 PRODUCT.md의 "quiet by default"는
대시보드 뷰포트를 전제하며 요구사항 문서에는 대응물이 없다. 이 판단은 앵커를 완화한 것이
아니라 **적용 범위를 명시한 것**이며, 하류 `/mccp:plan`이 산출할 rendered surface에는 그대로 적용된다.

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-09-01 — 범위·집계 경계·완주 정의·MVP 4건은 사용자 확인, 나머지는 저장소 실측 기반 assistant 판단.*
