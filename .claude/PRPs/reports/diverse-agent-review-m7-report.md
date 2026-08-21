# M7 보고서 — budget 게이트 라이브 발화 관측

**Milestone**: #7 — budget 게이트 라이브 발화 관측
**Plan**: `.claude/plans/diverse-agent-review-m7.plan.md` (`sha256:bce85ab6…`)
**관측일**: 2026-08-21
**결과**: **미발화.** 게이트는 발화하지 않았고, 발화하지 않은 **원인**이 실측으로 확정됐다.

## Summary

M7은 "라이브 `/mccp:plan` turn에서 budget 게이트가 실제로 발화하는 것"을 관측하려 했다. 절차는 plan이 규정한 대로 수행했다 — 운영자가 turn 프롬프트 본문에 `+200k`를 실은 채 커맨드를 실행했고, 게이트 자신의 임계(`MCCP_PLAN_REVIEW_BUDGET`)는 건드리지 않았다.

**게이트는 발화하지 않았다.** 패널이 정상적으로 agent 4개를 spawn했고 워크플로 반환값은 budget skip이 아니었다. 원인을 배제 추론으로 좁힌 뒤, agent를 하나도 쓰지 않는 프로브로 **직접 측정**했다: `budget.total = null` · `budget.remaining() = Infinity`.

이로부터 계획했던 것보다 **강한** 명제가 따라 나온다 — `total`이 null이면 `remaining()`이 `0`이 아니라 `Infinity`로 퇴화하므로, `MCCP_PLAN_REVIEW_BUDGET`을 포함해 **threshold 쪽 어떤 값으로도 이 게이트를 발화시킬 수 없다.** 발화의 열쇠는 저장소 밖(harness의 turn 토큰 목표 등록)에 있다.

따라서 #7이 소유하는 것은 "발화시켰다"가 아니라 **"왜 이 경로로는 발화시킬 수 없는지를 실측으로 확정했다"**이며, 라이브 발화 축은 PRD **#10**으로 이관했다. **동작 코드는 0줄 바꿨다**(UI6).

## 선행 조건

UI8이 지목한 순환("머지·배포된 뒤에만 관측 가능한 항목은 그 milestone의 것이 아니다")은 이번에 **없었다**. 실측:

| 축 | 실측값 |
|---|---|
| installed plugin | `1.30.0` — 워크트리 `plugin.json`과 **동일** |
| 설치 트리 ↔ 워크트리 | `workflows/plan-review.js` · `plan-review/{budget,record,cli,decide}.js` **5건 모두 바이트 동일**(`diff -q` 무출력, 이번 turn 재실측) |
| `cli.js mode` | `mode=multi-agent` · `fires.l1/l2=true`, `l3=false` · `quorum {required:3, of:4, roles_min:1}` · `fleet_keys=[architect, security, test, invariant]` |
| `derive-decision` | PRD 경로만 준 경우와 `--plan`까지 준 경우 **모두** `diverse-agent-review` |
| agent 레지스트리 | `mccp:review-{architect,security,test,invariant}` 4종 실제 spawn 확인 |

즉 관측 대상 코드가 이미 설치돼 있었고 게이트는 끝까지 돌았다. **막힌 것은 런타임도 배선도 아니었다.**

## 관측 조건

DN6이 요구한 대로 **축자로** 남긴다. 조건을 숨기고 발화만 보고하는 것이 부정직이지, 조건을 밝히는 것은 아니다.

- **예산 목표**: 운영자가 turn 프롬프트 **본문에 `+200k`를 포함**시킨 채 `/mccp:plan`을 실행했다. 이것이 DN9가 규정한 **유일한** 입력 경로다(env도 플래그도 아니다).
- **`MCCP_PLAN_REVIEW_BUDGET`**: **설정하지 않았다. 이번 관측에서 이 변수를 바꾸지 않았고 기본값 `150000`을 그대로 두었다.** 게이트 자신의 임계를 건드리지 않고 turn 쪽 조건만 만족시키는 편이 관측으로서 강하기 때문이다(DN6).
- **그 밖의 env** (전부 기존 환경, 이번에 변경하지 않음): `MCCP_PLAN_REVIEW=multi-agent` · `MCCP_REVIEW_SINGLE_PASS=deadline_pressure` · `MCCP_CODEX_DISABLED=1` · `MCCP_GATE_ROUND_CAP=3`.
- **파생된 임계**: `emit-workflow-args`가 emit한 `minRemaining = 600000` (= 기본 `150000` × granted fleet `4`). 예약은 degrade하지 않았다(`granted:4, degraded:false`).

> **사후 정직성 노트.** 위 조건은 관측을 성공시키기 위한 것이었고, 결과적으로 **`+200k`는 게이트에 도달하지 않았다.** 즉 이 절이 기술하는 "관측 조건"은 *의도한* 조건이며, 게이트가 실제로 본 조건은 `budget.total=null`(예산 목표 없음)이다. 그 간극 자체가 이 milestone의 산출물이다.

## B1

**발화 조건의 첫 항이 전부를 결정하고, 그 항은 저장소 밖에서 온다.**

`plugins/mccp/scripts/workflows/plan-review.js:160-161`:

```js
const budgetRemaining = budget.remaining();
if (budget.total && budgetRemaining < minRemaining) {
```

agent를 하나도 쓰지 않는 프로브로 이 turn의 `budget` 전역을 **직접 읽었다**:

```json
{
  "probe": "budget.total",
  "total_string": "null",
  "total_typeof": "object",
  "total_is_null": true,
  "total_is_undefined": false,
  "total_truthy": false,
  "spent_string": "102789",
  "remaining_string": "Infinity",
  "remaining_is_infinite": true,
  "min_remaining_used": 600000,
  "gate_expression_result": false,
  "agents_spawned": 0
}
```

프로브가 남긴 로그:

```json
[
  "[budget-probe] total=null (typeof object, truthy=false) spent=102789 remaining=Infinity",
  "[budget-probe] plan-review.js:161 expression with minRemaining=600000 -> false"
]
```

세 가지가 확정된다.

1. **`budget.total`은 `null`이다** — `typeof "object"` · `is_null true` · `is_undefined false` · `truthy false`. 즉 `budget` 객체 자체는 살아 있고(`spent()`가 `102789`를 정상 반환한다) **`total`만 비어 있다**. "프로브가 budget에 접근하지 못했다"가 아니다.
2. **`remaining()`이 `0`이 아니라 `Infinity`다.** 이것이 이 관측의 핵심이다. `plan-review.js:161`은 좌항 단락평가로 이미 안전하지만, **단락평가를 걷어내도** `Infinity < 600000`은 거짓이다. 따라서 `minRemaining`을 아무리 낮춰도 — `MCCP_PLAN_REVIEW_BUDGET`을 `1`로 두어도 — 이 게이트는 발화하지 않는다. **threshold 쪽 손잡이는 전부 무력하다.**
3. **표현식의 값은 `false`다** — 프로브가 실제 `minRemaining=600000`으로 같은 식을 재현했다(`gate_expression_result: false`).

**증거의 종류가 M4와 다르다.** M4의 `plan-review-workflow-port.test.js`는 배송된 워크플로 소스를 `AsyncFunction`으로 추출·실행해 분기를 보였고, 운영자는 그것을 "실행 가능함은 실행됨이 아니다"로 미충족 판정했다(UI5). 이 프로브는 소스를 추출하지 않는다 — **프로덕션 `Workflow` primitive가 워크플로에 주입하는 값 자체**를 같은 경로로 읽는다. 다만 이것도 "게이트가 발화했다"의 증거는 아니며 그렇게 주장하지 않는다. 증명하는 것은 **발화하지 않은 이유**다.

## B2

**라이브 발화는 관측되지 않았다. 실패한 것은 게이트가 아니라 plan이 단언한 전달 경로다.**

패널은 정상 발화했다 — `mccp:review-{architect,security,test,invariant}` 4개가 실제로 spawn돼 plan과 PRD를 읽고 findings를 반환했다(`subagent_tokens 412,349` · `duration 253,485 ms` · `agents_error 0`). 워크플로 반환값(`l2.json`) 전문은 이 보고서 말미에 싣는다. 핵심만:

| 키 | budget skip이라면 | 실측 |
|---|---|---|
| `skipped` | `true` | **`false`** |
| `reason` | `"budget"` | **키 부재** |
| `coverage` | `0` | **`4`** |
| `remaining` · `minRemaining` | 존재 (`plan-review.js:167-170`이 실어 보냄) | **둘 다 키 부재** |
| 워크플로 로그 | `budget-exhausted: remaining … < minRemaining …` | `panel returned 4/4 reviewer result(s)` |

`remaining`/`minRemaining` 키는 **budget-skip 반환에만** 실린다. 그 부재가 곧 "그 분기를 타지 않았다"는 워크플로 자신의 진술이다.

**배선 결손이 아니다.** M4가 닫은 결함(producer가 `minRemaining`을 emit하지 않아 consumer가 `undefined→0`으로 읽던 것)의 재발이 아니라는 근거:

- `fleetKeys` 4개가 그대로 반영됐다 — 워크플로가 `fleetKeys` 누락 시 남기는 1-reviewer 강등 로그(`plan-review.js:145-150`)가 없고 agent가 정확히 4개 떴다. 따라서 `args`는 문자열이 아니라 **객체로 파싱**됐다.
- `minRemaining`은 그 `fleetKeys`와 **같은 객체의 형제 키**이므로 함께 도달했다(`600000`).
- 그러므로 `budget.total && …`이 거짓이 된 항은 좌항 하나뿐이고, B1이 그것을 직접 측정으로 확인했다.

**#4가 만든 도달 가능성은 유효하되 그 문을 여는 열쇠가 저장소 안에 없다.** M7 plan의 DN9는 전달 경로를 "harness 계약"으로 단언했다 — *"`budget.total`은 그 turn의 사용자 프롬프트에 실린 `+Nk` 형태의 토큰 목표다"*. 실측이 그 단언을 반증했다. 무엇이 옳은 경로인지(다른 문법·다른 invocation 형태·harness 설정)는 **모르며, 표본은 1이다.** 근거 없이 절차를 날조하지 않는다 — 그것이 #10을 "발화시킨다"가 아니라 "전달 경로가 존재하는지 먼저 확정한다"로 적은 이유다.

## B3

**게이트↔fan-out 비대칭은 이번 turn에서 관측되지 않았다.**

대조하려던 것은 "같은 예산 부족 상황에서 Phase 2.5 fan-out은 fail-open으로 진행하고 Phase 5.2 패널은 fail-closed로 HALT한다"였다. 그러나 **부족 상황 자체가 성립하지 않았다** — `budget.total=null`이면 어느 쪽도 budget 분기에 들어가지 않는다. 더해 이번 실행에서 Phase 2.5 fan-out은 발화하지 않았고 인라인 Pattern Grounding으로 강등됐다.

**미관측으로 적는다.** 두 경로가 각자 정상 동작한 것을 "비대칭을 관측했다"로 승격하지 않는다 — 인접 측정을 목표 측정으로 승격하는 것이 정확히 UI10이 금지하는 형태다.

## agent 0 spawn 증명

**이 milestone은 agent 0 spawn을 관측하지 못했다.** 관측된 것은 그 반대(agent 4개)다. 따라서 이 절이 남기는 것은 *관측 결과*가 아니라 **DN5가 설계한 3층 증명 구조 중 실제로 확인된 층과, 그 구조 전체의 한계**다.

| 층 | DN5의 주장 | 이번 실측 |
|---|---|---|
| (a) `l2.json`이 `skipped:true, reason:"budget", coverage:0, results:[]`를 담는다 | 워크플로 자신의 반환값 | **미충족** — `skipped:false, coverage:4`. 이 층은 발화한 실행에서만 성립한다 |
| (b) 배송 소스에서 budget 조기 반환이 `phase('Refute')`·유일한 `agent()` 호출보다 **앞선다** | 구조적 함의 | **확인됨** — 인덱스 비교로 기계 검증 |
| (c) 5.2d의 skip 분기가 예약을 `--actual 0`으로 reconcile한다 | 회계 정합 | **미충족** — skip이 아니었으므로 `--actual 4`로 정산했다(`launched:4`) |

(b)의 기계 검증(배송 트리 = 워크트리, 바이트 동일):

```
plan-review.js:  reason:'budget' 조기 반환  <  phase('Refute')  <  agent(
```

**한계 — 이것은 프로세스 외부에서 spawn 수를 직접 센 것이 아니다.** DN5가 적은 그대로이며 이번 관측이 그 한계를 완화하지 않는다. (b)는 *만약* budget 분기를 탔다면 agent가 만들어질 수 없다는 **구조적 함의**를 줄 뿐이고, 그 분기를 탔다는 사실은 (a)가 증명해야 하는데 이번에는 (a)가 반대를 보였다. 즉 **"budget skip 시 agent 0개"는 여전히 라이브로 관측되지 않았다.**

이번에 라이브로 확인된 0-spawn은 **다른 것**이다 — B1의 프로브가 `agentCount 0` · `subagent_tokens 0`으로 돌았다는 사실이며, 그것은 프로브 스크립트에 `agent()` 호출이 없기 때문이지 budget 게이트 때문이 아니다. 두 가지를 섞지 않는다.

## 승인자 기록

**이 milestone의 구현은 패널 승인으로 진행되지 않았다.**

| 축 | 값 |
|---|---|
| 경로 | `MCCP_PLAN_REVIEW=multi-agent` (codex 폴백 아님) |
| L1 | `converged` (violations 0) |
| L2 | `divergent` — 4/4 응답, `architect=pass` · `security=pass` · `test=fail` · `invariant=fail` |
| quorum | `required 3` / `passed false` · blocking findings 5건 |
| 진행시킨 것 | **단일통과 토글** `MCCP_REVIEW_SINGLE_PASS=deadline_pressure` |
| 봉인된 verdict | `divergent` (세탁 없음 — CLAUDE.md §3.15) |
| receipt | round 1의 `mccp-plan-codex/diverse-agent-review`가 같은 plan hash를 이미 봉인. **round 2는 새 receipt를 쓰지 않았다** |

**단일통과 토글이 낸 진행은 승인이 아니다.** 토글은 `divergent`를 `divergent` 그대로 봉인하고 라운드만 없앤다. 따라서 이 turn의 wall-clock(`482,116 ms`)은 **차단 경로 표본**이며 통과 경로 표본이 아니다 — DN8이 요구한 양방향 판정에서 `approved=false` 쪽이고, PRD Success Metrics의 통과 경로 행은 forward-only를 유지했다.

**미흡수 findings는 유실되지 않았다.** 5.2g2가 blocking findings를 `.claude/plans/codex-findings-backlog.md`에 기계적으로 적재했다 — 신규 3건(`invariant/CRITICAL` 1 · `test/HIGH` 1 · `invariant/HIGH` 1), 중복 2건 skip(round 1에 이미 적재됨). §3.14대로 그 자리에서 흡수하지 않았다: 세 지적이 전부 **이 plan의 Validate 규격**에 관한 것이라 흡수하려면 plan 본문을 고쳐야 하는데, plan은 frozen이고(DN3 — 고치면 round 1 receipt가 stale) §3.16이 재리뷰를 기본에서 뺐다.

**패널이 이 결함을 먼저 지목했다.** `test/HIGH` 원문:

> "there is no test in this repository that verifies the Workflow harness actually extracts `+200k` from the prompt and sets `budget.total`. The only place `budget.total` is set in code is in the unit test mock (plan-review-workflow-port.test.js:165), which bypasses the harness entirely."

라이브 실행이 이 지적을 실측으로 확인했다. **패널의 예측과 라이브 관측이 같은 지점에서 만난 첫 사례**다. 다만 이것이 O1("승인 0건")을 뒤집지는 않는다 — 같은 패널이 같은 turn에 승인하지 않았다.

## 한계

1. **표본은 1이다.** `+200k`가 `budget.total`을 세우지 못한 것을 한 번 관측했다. 이것이 harness 사양인지 결함인지, slash-command invocation에만 해당하는지, 다른 전달 문법이 있는지는 **모른다.** 이 보고서는 그 어느 것도 주장하지 않는다.
2. **`Infinity` 퇴화의 파급을 전수 확인하지 않았다.** `remaining()`만 읽고 분기하는 다른 소비처가 있다면 무예산 turn을 "무한 예산"으로 읽겠지만, 그런 소비처가 실재하는지 저장소를 전수 조사하지 않았다. PRD Open Questions에 남겼다.
3. **budget skip 경로의 agent 0 spawn은 여전히 라이브 미관측**이다(위 `agent 0 spawn 증명` 참조).
4. **B3는 미관측**이다.
5. **plan의 Validate 두 곳이 이 결과로는 충족 불가**하다(아래 대조표). 그것을 충족시키려 문구를 조정하지 않았다.
6. **round 1 레코드의 증거 강도가 균일하지 않다.** round 2는 파일로 고정했으나(`-m7-budget.md`) round 1은 스크래치 캡처다 — O3이 원인이며 #9 소관이다.

## Acceptance 대조

| 항목 | 판정 | 근거 |
|---|---|---|
| Task 1 — 관측 전 게이트 레코드 확보 | **충족** | `<gitdir>/mccp/tmp/m7-gate-record.md`, Measurement `verdict=divergent halt_stage=null wall_clock_ms=458271` |
| Task 2 단계 1 — 관측 전 고정 | **충족** | `plan_sha256_before=8bdd6510…` · `observed_after=2026-08-21T01:30:23.108Z` · 바이트 사본 |
| Task 2 단계 2 — 운영자 turn 발행 | **충족(절차)** / **미충족(결과)** | `+200k`를 실은 turn을 발행했으나 게이트는 발화하지 않았다 |
| Task 2 단계 3 — 캡처·고정 | **충족** | `.claude/reviews/plan-review-diverse-agent-review-m7-budget.md` · `## Measurement` 바이트 무변경 · `recorded_at 2026-08-21T03:42:10.877Z > observed_after` |
| Task 2 단계 4 — plan 복원 | **충족(자명하게)** | 관측 turn이 plan을 **한 바이트도 쓰지 않았다** — Phase 4 재작성을 수행하지 않았으므로 복원할 것이 없었다. sha256이 핀과 일치 |
| **Task 2 Validate (a)** — `layers.l2`가 `skipped (budget: remaining N < M)` | **미충족** | 실측은 `divergent`. 게이트가 발화하지 않았으므로 이 형태가 만들어지지 않는다. **수치를 지어내지 않았다** |
| Task 2 Validate (b) — budget 조기 반환이 agent 호출보다 선행 | **충족** | 인덱스 비교 통과 |
| Task 2 Validate (c) — plan 본문 복원 | **충족** | sha256 일치 |
| Task 2 Validate (d) — `recorded_at > observed_after` | **충족** | `03:42:10.877Z > 01:30:23.108Z` |
| Task 3 — PRD 기입 | **충족** | Evidence M7(B1·B2·B3) · `#7 complete` + Plan 셀 · `#8/#5/#9` pending 유지 · `#10` 신설 · 통과 경로 행 forward-only 유지 |
| **Task 3 Validate — DN8 양방향** | **미충족(선재 결함)** | `hasNum` 정규식이 "How measured" 셀이 아니라 **행 전체**를 스캔해 Target 열의 `"10분"`을 관측치로 오인한다. `approved=false`인 어떤 실행에서도 실패한다. **HEAD 시점 PRD에서도 `hasNum=true`임을 실측**했으므로 이번 편집이 만든 것이 아니다 |
| Task 4 — 보고서 | **충족** | 이 문서 (필수 10개 절 모두 존재) |
| **Task 4 Validate — `"reason": "budget"` 축자 포함** | **미충족** | 아래 `l2.json` 전문에 그 키가 없다. 게이트가 발화하지 않았기 때문이다. 정규식을 통과시키려 문자열을 심는 것은 게이팅 회피이므로 하지 않았다 |
| Task 5 — version 동기 | **충족** | `plugin.json` · `renderer/html.js` · `renderer/markdown.js` · `CHANGELOG.md` 4면 |
| 라이브 완주 확인 (게이트 1회 실주행) | **충족** | L1 → 예약 → pin → dispatch log → Workflow → reconcile → decide → proof → backlog → record 전 구간 실행 |

**미충족 3건의 공통 성격**: 셋 다 "게이트가 발화했다면 참일 것"을 단언하며, 발화하지 않은 실행에서는 구조적으로 충족될 수 없다. 이는 plan이 **음성 관측을 상정하지 않고 쓰였다**는 뜻이고, 패널이 반복해서 지목한 지점이기도 하다(Validate가 입력 가정을 검사하지 않는다). 세 항목 모두 문구 조정으로 통과시키지 않았다 — §3.16이 금지하는 receipt 위조와 같은 축이기 때문이다.

## 부록 — `l2.json` 전문 (워크플로 반환값 축자)

```json
{
  "skipped": false,
  "results": [
    {
      "perspective": "architect",
      "verdict": "pass",
      "findings": [
        {
          "claim": "Task 2 Validate checks that the budget gate fired but does not verify the budget goal was set to +200k as documented in DN9, creating risk of false-positive observation",
          "evidence": "plan.md Task 2 Validate (lines 164-175): checks `l2.json` verdict and `remaining < minRemaining` but no verification of budget.total value. DN9 (lines 82-85) documents budget goal as ONLY input: '+200k' in prompt text, but Task 2 Validate doesn't enforce this. Risk: operator omits +200k, actual tokens are low, gate fires anyway, Validate passes incorrectly (line 172-175 checks numbers satisfy inequality but not how they were set).",
          "severity": "MEDIUM"
        },
        {
          "claim": "Preconditions section documents that code is already installed (1.30.0) but Validation section includes no commands to verify preconditions before Task 2 begins",
          "evidence": "plan.md Preconditions (lines 34-45): claims 'installed plugin 1.30.0' equals worktree version, verified only by text claim '바이트 동일 (`diff -q` 5건 무출력)'. Validation section (lines 301-324) includes 7 bash/node Validate blocks for Tasks 1-5 and global invariants but no precondition check. If operator hasn't run `claude plugin update`, Task 2 will fail cryptically with missing budget.js. This is a verification gap: documented precondition but no enforcement.",
          "severity": "MEDIUM"
        },
        {
          "claim": "Task 4 Validate checks that report mentions MCCP_PLAN_REVIEW_BUDGET but does not verify the report explicitly states this variable was NOT changed, as required by DN6",
          "evidence": "plan.md Task 4 Validate (line 268): `if(!/MCCP_PLAN_REVIEW_BUDGET/.test(cond)) throw new Error(...)` only checks textual presence. DN6 (lines 80-81) states '`MCCP_PLAN_REVIEW_BUDGET`은 기본값 그대로 둔다' (don't change it). Report should explicitly state 'was not changed' but Validate only requires the text appears, allowing false positives (e.g., 'MCCP_PLAN_REVIEW_BUDGET=150000 was set' would pass).",
          "severity": "LOW"
        }
      ],
      "refutationAttempted": "Verified DN1 (budget.total from harness contract): code at workflows/plan-review.js:161 checks `budget.total`, which is external Workflow primitive per harness spec in DN9 — not env var or code-generated. Verified DN3 (plan restoration by sha256): plan.md Task 2 step 4 captures baseline sha256 and restores after observation turn; Validate (line 189-190) enforces restoration. Verified DN4 (task ordering): l1-check.js:333-335 checks CREATE targets for absence; if files exist, C3_CREATE_EXISTS blocks. Task 2 must run before Tasks 3-5. Verified DN5b (budget precedes panel): workflows/plan-review.js:161 budget early return, line 182 phase('Refute'), line 185 agent() — indices confirm ordering. Verified L1 checking: l1-check.js:68-69 ACTIONS_REQUIRING_ABSENCE=['CREATE'] confirms CREATE targets must not exist. Architecture is sound — only verification/documentation gaps found, no structural invariant leaks."
    },
    {
      "perspective": "security",
      "verdict": "pass",
      "findings": [],
      "refutationAttempted": "Examined plan's observation procedure focusing on: (1) trust boundaries for before-state capture and restoration — traced Task 2 flow from hash computation through provenance comment writing to validate block; found operator writes plan_sha256_before post-observation which theoretically allows matching a modified restored state, but this is mitigated by single-operator context and peer review so not a finding; (2) concurrency/TOCTOU risks between plan copy and restoration — git-path/tmp is operator-controlled but not attacked path in single-session context; (3) budget goal transmission (DN9) — traced plan-review.js to confirm budget.total cannot be forged; (4) timestamp spoofing — both observed_after and recorded_at are operator-writable but checking inequality is best-effort audit, acceptable given peer review; (5) absolute path leaks — plan includes history-leak-scan validation (line 318), checked scanner coverage for repo-root patterns and old-repo-name paths; (6) credential/secret exposure through task validation blocks — no credentials passed or logged. Attacked all major claim paths in plan: budget gate precedes agent call (verified workflow line 161 fires before line 182), plan restoration fidelity (hash comparison logic sound despite source-validation gap), receipt staleness prevention (restoration needed to preserve planAwareMarkdownHash). Found no evidence that plan introduces new attack surface or violates existing integrity contracts.\""
    },
    {
      "perspective": "test",
      "verdict": "fail",
      "findings": [
        {
          "claim": "Operator can specify budget goal by including '+200k' in the `/mccp:plan` prompt body, and the Workflow harness will set `budget.total` accordingly",
          "evidence": "Plan M7 DN9: '`budget.total`은 **그 turn의 사용자 프롬프트에 실린 `+Nk` 형태의 토큰 목표**다 — 목표가 없으면 `null`이다(harness 계약, `plan-review.js:160`이 `budget.remaining()`을 호출하는 지점의 입력)'. Task 2 Action step 2 assumes this: '운영자가 새 turn의 **프롬프트 본문에 `+200k`를 포함**시킨 채'. However, there is no test in this repository that verifies the Workflow harness actually extracts `+200k` from the prompt and sets `budget.total`. The only place `budget.total` is set in code is in the unit test mock (plan-review-workflow-port.test.js:165), which bypasses the harness entirely. The mechanism by which '+200k' in the prompt becomes `budget.total = 200000` in the workflow is not tested.",
          "severity": "HIGH"
        },
        {
          "claim": "The plan body will be modified by Phase 4 of the workflow, making the restoration validation meaningful",
          "evidence": "Plan DN3 states: '/mccp:plan은 PRD 모드에서 Phase 4가 plan 아티팩트를 다시 쓴다... 따라서 `observed_after`가 시간 앵커다'. Task 2 Step 4: '되돌림 — 1단계 사본으로 plan 본문을 복원하고 sha256이 일치하는지 확인한다'. The Validate for Task 2(c) only checks that final sha256 matches the before-sha256: `if(got!==want) throw new Error('plan body not restored: '+got+' != '+want);` This test passes equally if (1) plan was modified and perfectly restored, or (2) plan was never modified. Without a test that verifies Phase 4 actually modifies the plan (e.g., checking that an intermediate state differs from the before state), the restoration claim cannot be falsified. The test would pass if Phase 4 stops writing the plan entirely.",
          "severity": "MEDIUM"
        },
        {
          "claim": "The observed `remaining` and `minRemaining` values in the recorded JSON correspond to the `+200k` budget goal actually being provided by the operator",
          "evidence": "Task 4 Validate checks that report `## 관측 조건` section exists and mentions MCCP_PLAN_REVIEW_BUDGET: `if(!/MCCP_PLAN_REVIEW_BUDGET/.test(cond)) throw new Error('관측 조건 must state what the panel threshold was set to');` However, this only verifies the **reported** budget goal is documented, not that it matches the **observed** minRemaining value. If the operator provided `+300k` instead of `+200k`, the test would still pass (recorded `minRemaining` would be ≥ 600000 still, within the expected set). Without cross-checking the reported budget goal against the observed threshold, the test cannot falsify whether the operator actually provided `+200k`.",
          "severity": "MEDIUM"
        }
      ],
      "refutationAttempted": "Searched for test coverage of: (1) Workflow harness budget goal extraction mechanism — found only mock budget objects in unit tests, no test of real harness parsing `+200k` from prompt; (2) Verification that Phase 4 modifies plan body — found only sha256 restoration check, which can't distinguish between modification+restoration vs no-modification; (3) Validation blocks for all Tasks 1-5 — found they test observable effects (gate fires, numbers recorded, timestamps match) but don't test the input assumption (harness correctly extracts budget goal); (4) Existing plan-review test suite (plan-review-budget.test.js, plan-review-workflow-port.test.js) — verified they test budget calculation and workflow branching with mocks, but not the harness input chain; (5) Code search for where `budget.total` is assigned — found only test mocks, no code in this repo that converts prompt `+200k` to `budget.total`; (6) Plan's stated preconditions vs test guarantees — Plan acknowledges \"harness contract\" in DN9 but makes no test assertion about it."
    },
    {
      "perspective": "invariant",
      "verdict": "fail",
      "findings": [
        {
          "claim": "Task execution order (Task 1 → Task 2) is required by DN4 but not enforced by Acceptance criteria, allowing provenance anchoring to be broken without detection",
          "evidence": "Plan DN4 (line 76): 'Task 순서상 맨 앞이어야 한다' + 'L1이 CREATE 행을 실존으로 검사'. Task 1 Action (line 112) copies gate-review record before Task 2 overwrites it. But Acceptance line 343 only lists '- [ ] All tasks complete' with no ordering constraint. Acceptance line 355 says 'Task 1이 캡처한 이 게이트 자신의 레코드이며' — assumes Task 1 captured the correct record, but doesn't verify Task 1 ran first. If Task 1 runs after Task 2, it captures Task 2's observation record instead. Acceptance line 348 check (recorded_at > observed_after) would still pass because both timestamps come from Task 2's run.",
          "severity": "CRITICAL"
        },
        {
          "claim": "The pinned record's `recorded_at` timestamp cannot distinguish between 'gate-review verdict' and 'wrong-task verdict' when both are budget halts, because the timestamp comparison (line 195-198 Validate) is agnostic to which turn produced the data",
          "evidence": "Plan Task 2 Validate (d) at lines 195-198 compares recorded_at > observed_after, but both values come from the same run's measurement JSON. If Task 1 mistakenly captures Task 2's observation record instead of the gate-review record, both timestamps are from Task 2, and the check passes. The acceptance goal (line 348) was to detect 'previous run records are stale', but the check only detects timestamp inversion, not record-source confusion.",
          "severity": "HIGH"
        },
        {
          "claim": "The plan assumes `observed_after` is set before observation runs, but Task 2 Action doesn't document the mechanism or provide code to set it, creating opportunity for honest timing mistakes",
          "evidence": "Plan line 149 says 'UTC ISO 시각(`observed_after`)을 기록하고' but doesn't show how. Task 2 Action is prose-only ('기록하고'='record it') with no code snippet. The Validate block (lines 195-198) reads it from provenance comments in the pinned file, implying manual editing. If operator sets `observed_after` after running observation (honest mistake, e.g., due to low timestamp precision), the check fails even though observation succeeded: `recorded_at <= observed_after` throws 'this record predates the observation'. The invariant is fail-closed, but the precondition is fragile.",
          "severity": "MEDIUM"
        },
        {
          "claim": "The plan does not verify the operator actually provides the `+200k` budget goal in the prompt, creating a gap between documented procedure (DN9: 'turn 프롬프트 본문의 `+200k` 토큰') and what the machine can check",
          "evidence": "Plan line 85 (DN9) specifies: 'turn 프롬프트 본문에 `+200k`를 포함시킨 채'. Line 150 Task 2 Action: 'operator runs `/mccp:plan` with the budget goal'. But there is no check that the operator actually included it. If they don't, `budget.total` is null, the gate doesn't fire, `halt_stage !== '5.2e'`, and Task 2 Validate throws. The failure is HALT (good), but the error message won't clarify 'you forgot to supply +200k' — it will just say stage mismatch. DN9 acknowledges this is an external-input procedure, not code, but the task doesn't verify it ran correctly.",
          "severity": "MEDIUM"
        }
      ],
      "refutationAttempted": "Attacked the receipt anchoring invariant by tracing the record-capture sequence (Task 1 → Task 2 data overwrite flow) and testing whether Acceptance criteria enforce the required order. Found that out-of-order execution (Task 1 after Task 2) would pass all timestamp and content checks while capturing the wrong record's provenance. Tested the `observed_after` timestamp mechanism for clock-skew vulnerabilities and documentation gaps. Verified that the workflow source code has budget-return before phase/agent (lines 161 < 182 < 185 in plan-review.js, confirmed by Grep). Examined the human-input procedure (DN9: operator supplies +200k in prompt) and found no automated guard that the input actually happened.\""
    }
  ],
  "coverage": 4,
  "spent": 84818,
  "reviewedPlanHash": "sha256:bce85ab6ad9faf5719edd759f67b79773e8e1a6f9c457ea3ec79be5c9492fcae"
}
```
