# Plan: closure-accounting M3 — registry-reachability

**Source PRD**: `.claude/prds/closure-accounting.prd.md`
**Selected Milestone**: 3 — registry-reachability
**Complexity**: Small

## Summary

PRD는 M3에 양자택일을 열어 뒀다 — 기본 리뷰 모드(`multi-agent`)에서 지적이
`finding_adjudicated`/`finding_closed`를 남기게 하거나, 그 enum을 은퇴시키거나. 이 사이클
실측으로 **둘 다 정직하게 성립하지 않는다**: 은퇴의 전제("0건")는 이미 깨졌고(3건), 패널 모드의
정직한 판정 producer는 `diverse-agent-review` #1.5 소관이다. 사용자 판정(2026-09-14)에 따라 M3는
**이관 + 정직화**다 — 합성 producer를 만들지 않고, `accepted` 상태가 부채 분모에서 조용히 빠지는
누수를 고치고, `closure report`의 registry 행이 채널·모드별 **producer 도달성**을 함께 싣게 해
1.64%가 "부채 종결률"로 인용되지 못하게 하고, 패널 판정 producer를 DAR #1.5로 넘기며
`CLOSURE_FROM_ADJUDICATION` 경유를 test로 강제되는 계약으로 남긴다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 봉인 결속(`inventory_sha256`)과 스냅샷 의미론은 바꾸지 않는다 | constraint |
| UI2 | 판정(disposed)·해소(resolved)·수정(fixed)을 한 수로 접지 않는다 | constraint |
| UI3 | 리포트는 게이트가 아니다 — 격차나 수치로 진행을 막지 않는다 | constraint |
| UI4 | backlog 표에 상태 열을 추가하지 않는다 | exclusion |
| UI5 | 이 PRD는 부채를 갚지 않는다 — 갚았는지 아닌지를 볼 수 있게만 한다 | exclusion |
| UI6 | M3 방향은 이관 + 정직화다 — 패널 모드에 합성 종결 producer를 만들지 않는다 | direction |
| UI7 | accepted 상태가 부채 분모에서 조용히 빠지는 누수를 고친다 | direction |
| UI8 | closure report의 registry 행에 gate·mode별 producer 도달성을 표기해 1.64%가 오독되지 않게 한다 | direction |
| UI9 | 패널 판정 producer는 DAR #1.5로 이관하고 `CLOSURE_FROM_ADJUDICATION` 경유를 계약으로 남긴다 | direction |
| UI10 | enum 은퇴는 증거를 붙여 기각한다 | exclusion |
| UI11 | 방어할 근거 없는 임계를 새로 만들지 않는다 | exclusion |
| UI12 | 자식 브랜치는 plugin.json version을 선언하지 않는다 | constraint |

## Evidence (2026-09-14, 이 worktree `d0fc478`)

정본은 실행 시점의 산출이다 — 아래 값은 관측 로그다(PRD Evidence 절과 같은 규율).

- **`finding_adjudicated`는 0건이 아니다.** registry 52 shard 전수: `finding_opened` 1481 ·
  `finding_adjudicated` **3** · `finding_closed` 21. 3건 전부 `closure-accounting-m2.jsonl`
  seq 4·6·9이며, M2 plan 게이트가 `mode=codex`로 돌며 `plan-codex-runner.js:896`이 남겼다.
- **채널별 종결 producer** (코드 추적):

  | 채널 | emitter | opened | adjudicated | 도달 가능한 closure_type |
  |---|---|---|---|---|
  | Plan-Codex runner (`mode=codex`) | `plugins/mccp/scripts/lib/plan-codex-runner.js:824,894,896` | 예 | 예 (`ACCEPT_NOW`) | `CLOSURE_FROM_ADJUDICATION`의 비-null 값 3종 |
  | 패널 L2 (`multi-agent`·`hybrid`) | `plugins/mccp/scripts/lib/plan-review/cli.js:1130` (`record`) · `:1094` (`backlog-append`) | 예 | **아니오** | `deferred` — 단일통과 완화에서만 |
  | santa-loop | `plugins/mccp/scripts/lib/santa/seal.js:444,476` | 예 | 아니오 | `fixed` — converged ∧ 2라운드 이상 |
  | hybrid L3 | `plugins/mccp/scripts/lib/plan-review/l3.js` | **아니오** | 아니오 | 없음 |

- **패널 판정 producer의 소유자가 이미 있다.** `.claude/prds/diverse-agent-review.prd.md` L125
  #1.5 "패널 intent adjudication — 패널이 … 자기 findings를 그에 대해 판정"(pending). 같은 PRD
  L137은 이 배선을 "게이트 배선을 더 늘리는 작업"이라 #5 뒤로 두 번 미뤘다.
- **`accepted`를 세 소비처가 서로 다르게 읽는다.**
  - `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:218` — `state === 'open'`만 부채 →
    **accepted 제외**
  - `plugins/mccp/scripts/lib/closure/report.js:406-411` — non-closed 전부 open → accepted 포함
    (`plugins/mccp/scripts/lib/closure/tests/report.test.js:464` (c8)이 단언)
  - `plugins/mccp/scripts/state/findings-registry.js:790-797` `isPromotable` — non-closed →
    accepted 승격
  - 설계 계약 `docs/multi-session-work-loop/feedback-loop-design.md:41` — `ACCEPT_NOW` →
    "**열린 채**"

  라이브: registry non-closed 1259 대 `closure report` live findings **1256** — 차이 3이 정확히
  accepted 3건이다.
- **registry 행이 무엇을 재는지 출력이 말하지 않는다.** `closure report` → `findings-registry
  Closed 21 / 1280 · 1.64%`. 그 1280 중 패널 채널이 대부분인데, 패널 채널은 기본 경로에서
  종결을 낼 수 없다는 사실이 어디에도 표기되지 않는다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 단일 매핑 지점 | `plugins/mccp/scripts/state/findings-registry.js:54-63` | `CLOSURE_FROM_ADJUDICATION` — 판정→종결 매핑은 한 곳에만 산다(DD7). 도달성 선언도 그 옆에 둔다 |
| 전사성 단언 | `plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js:364-377` | 맵이 판정 enum 전건을 덮고 `ACCEPT_NOW`의 상이 `null`임을 단언 — 선언과 현실의 대조 형태 |
| 승인 목록 + 자기면제 정적 스캔 | `plugins/mccp/scripts/lib/msw-metrics/c1-coverage-gate.js:36-60,83-107` | 승인 writer 상수 · `SELF_EXEMPT` · 주석 줄 제외 · 경로 posix 정규화 |
| unknown은 0이 아니라 null | `plugins/mccp/scripts/lib/closure/report.js:430-436` | `findingsUnknown`이면 모든 수치를 `null`로 — 부분 판독을 확정 수치로 내지 않는다 |
| 불변식 test + require mock | `plugins/mccp/scripts/lib/closure/tests/report.test.js:1-14,98-149` | 값이 아니라 구조·부등식·비공허 fixture |
| 합성 fixture 저장소 | `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js:37-73` | `makeRepo({findingEvents})` + `openEvent()` — 라이브 저장소를 읽지 않는다 |
| fail-open 산출 | `plugins/mccp/scripts/lib/closure/cli.js:140-154` | 리포트는 오류에도 exit 0(PRD 결정 4) |

## Design Decisions

> 저자 근거다. `## User Intent`에 넣지 않는다.

**DD1 — 은퇴를 기각하는 증거는 셋이다 (UI10).**

1. **전제 붕괴.** PRD의 "0건이므로 은퇴가 과거 해석을 바꾸지 않는다"는 2026-09-08 M2 게이트 이후
   거짓이다. `readRawShard`는 `KINDS` 밖의 kind를 malformed로 격리하므로(`findings-registry.js:342`),
   enum에서 빼면 `closure-accounting-m2` shard가 `degraded`로 뒤집힌다. 그러면 `report.js:393`이
   registry 행 전체를 `null`로 만든다 — 은퇴가 계기 하나를 통째로 끈다.
2. **살아 있는 producer.** `MCCP_PLAN_REVIEW=codex`는 지원되는 모드이고, 그 경로의 `ACCEPT_NOW`는
   지금도 이 이벤트를 낸다.
3. **설계 역전.** 생산만 멈추면 M7 DD2 "판정을 받은 finding이 아무 이벤트도 남기지 않는 경로는
   없다"(`plan-codex-runner.js:868-874`)를 뒤집는다. 그 역전을 정당화할 관측은 없다.

**DD2 — 패널 채널에 합성 producer를 만들지 않는다 (UI6).** 검토한 후보는 셋이고 전부 기각한다.

- **게이트 판정의 기록화**(quorum이 blocking/non-blocking으로 분류한 것을 `finding_adjudicated`로
  남기기): `foldEvents`의 `state`는 "저자가 고치기로 했다"를 뜻한다(`:601-603`). 게이트의 severity
  분류를 같은 필드에 실으면 두 의미가 섞인다. 게다가 converged 패널에는 HIGH 이상이 0건이라
  (`quorum.js:159-180`) 승격 표면을 바꾸지도 못한다 — 지표를 위한 이벤트일 뿐이다.
- **재리뷰 supersession**: 확률적 리뷰어가 다시 내지 않았을 뿐인 실재 결함이 open에서 빠진다.
  이 PRD가 진단한 "성공 방향 기본값"의 한 형태다. `MCCP_GATE_ROUND_CAP=1` 강제 이후 같은 plan의
  재리뷰는 드물어 거의 발화하지도 않는다.
- **판정 단계 신설**(5.5a 거울): DAR #1.5를 선점한다.

**DD3 — `accepted`는 부채다 (UI7).** `collectFindings`의 필터를 `state === 'open'`에서
`state !== 'closed'`로 바꾼다. 근거는 설계 계약(`docs/multi-session-work-loop/feedback-loop-design.md:41` "열린 채")이고,
나머지 두 소비처(`report.js`·`isPromotable`)가 이미 그렇게 읽는다. 바꾸는 쪽은 소수 의견 하나다.
**debt item의 형태는 바꾸지 않는다** — `coords.state`를 더하면 모든 findings item의 내용이 바뀌어
다음 봉인의 `inventoryHash`가 전 항목에서 움직인다. accepted를 구분해 볼 곳은 registry 행(DD4)이지
debt item이 아니다. **결과로 라이브 격차가 +3 커진다.** 그것은 회귀가 아니라 봉인 당시 조용히
빠졌던 3건이 드러나는 것이고(봉인 `2026-09-08T08:25`는 accepted 이벤트 `07:34`·`07:47`보다 뒤다),
재봉인은 M2 경로로 운영자가 판단한다(UI3 — 리포트는 재봉인을 실행하지 않는다).

**DD4 — 도달성은 선언 데이터이고, 선언은 falsifier test가 현실에 묶는다 (UI8·UI9).**
`findings-registry.js`에 `PRODUCER_CHANNELS`(frozen)와 순수 함수 `channelOf(finding)`를 둔다.
`CLOSURE_FROM_ADJUDICATION` 옆이어야 하는 이유는 DD7과 같다 — 종결 어휘의 소유자가 그 어휘에 닿는
길의 목록도 소유해야, 새 길이 생길 때 한 곳에서 붉어진다. Plan-Codex 채널의 `closure_types`는
리터럴로 복제하지 않고 `CLOSURE_FROM_ADJUDICATION`의 비-null 값에서 **파생**한다.

선언만으로는 첫 커밋에만 참이다(M2 DD9와 같은 함정). 그래서 신규 test가 emitter 소스를 읽어
선언과 대조한다: `registers` ⇔ `appendFindings(` 호출 · `adjudicated` ⇔
`kind: 'finding_adjudicated'` 리터럴 · `closure_types` ⇔ `closure_type: '<x>'` 리터럴 ∪ (맵 참조 시 맵의
비-null 값). DAR #1.5가 패널에 판정을 배선하는 순간 이 test가 붉어지고, 선언을 고치지 않으면 착지할
수 없다 — 도달성 표기가 조용히 낡지 못한다.

**DD5 — 관측 수치는 이벤트가 아니라 fold된 레코드로 센다.** 판정·종결 이벤트는 `gate_id`를 싣지
않는다(실측: 21건 중 2건·3건 전부 `gate_id` 부재 — `plan-codex-runner.js:894-896`). 이벤트 단위로
세면 그것들이 전부 미귀속으로 떨어진다. fold된 레코드는 opened 이벤트에서 `gate_id`·`perspective`를
물려받으므로(`:594-600`) 귀속이 성립한다. 분류 규칙은 셋이고 순서대로 적용한다:
`gate_id='mccp-santa-loop'` → `santa-loop` · `gate_id='mccp-plan-codex'` ∧ `perspective='codex'` →
`plan-codex-runner` · `gate_id='mccp-plan-codex'` → `plan-review-panel`. 어디에도 맞지 않으면
`unattributed` 행에 **센다** — 버리면 채널 합계가 ledger 합계보다 작아지고, 그 차이가 설명되지 않는다.
분할 불변식(채널 `total` 합 = ledger `total`)을 test가 단언한다.

**DD6 — 계약 (c)는 test가 강제한다 (UI9).** 비-test 소스 전수에서 `kind: 'finding_adjudicated'`
리터럴을 가진 파일은 `CLOSURE_FROM_ADJUDICATION[`도 참조해야 한다. 또 `finding_*` kind 리터럴을
갖거나 `appendFindings(`를 호출하는 파일은 `PRODUCER_CHANNELS`에 선언돼 있어야 한다
(`findings-registry.js` 자신은 면제). DAR #1.5가 이 계약을 모른 채 `closure_type`을 직접 고르면
붉어진다. 계약 문장은 `feedback-loop-design.md` §2와 DAR PRD #1.5 옆에 한 줄씩 남긴다 — 그
milestone의 planner가 읽는 곳이 거기다.

**DD7 — hybrid L3 행을 싣되 배선하지 않는다.** `registers:false`로 선언한다. 사용자의 작업 트리가
`MCCP_PLAN_REVIEW=hybrid`인 지금, L3의 Codex finding은 registry의 분모에 **아예 들어가지 않는다**.
배선은 opened 측 확장이라 M3 범위(종결 도달성) 밖이다. 다만 모드별 도달성을 표기한다면서 그 구멍만
빼면 표기가 거짓이 된다. 한계는 Risks에 적는다.

**DD8 — falsifier는 신규 test 파일에 둔다.** `c1-feedback-loop.test.js`는
`docs/multi-session-work-loop/m7-assertion-manifest.json`이 test 이름을 참조하는 파일이다. 거기
더하면 manifest 결합이 생기므로 `plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js`를
새로 만든다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` | UPDATE | `collectFindings` 필터 `!== 'closed'` (DD3) |
| `plugins/mccp/scripts/state/findings-registry.js` | UPDATE | `PRODUCER_CHANNELS` · `channelOf` export (DD4·DD5) |
| `plugins/mccp/scripts/lib/closure/report.js` | UPDATE | registry ledger 행에 `producers[]` (DD4·DD5) |
| `plugins/mccp/scripts/lib/closure/cli.js` | UPDATE | 텍스트 출력에 채널별 행 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | UPDATE | `producers` 불변식 · 기존 mock이 실제 모듈을 spread하도록 |
| `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js` | UPDATE | accepted는 부채 · closed는 부채 아님 |
| `plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js` | CREATE | 선언↔소스 falsifier + 계약 (c) (DD4·DD6) |
| `docs/multi-session-work-loop/feedback-loop-design.md` | UPDATE | §2에 채널별 도달성 + 계약 (c) + 주장하지 않는 것 |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | #1.5 옆 계약 한 줄 (DD6) |
| `.claude/prds/closure-accounting.prd.md` | UPDATE | M3 행 · Open Question "두 계기를 통합할 것인가" 답 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 항목 한 줄 |
| `.claude/PRPs/reports/closure-accounting-m3-report.md` | CREATE | 라이브 1회 실행 출력 첨부 |

`plugins/mccp/.claude-plugin/plugin.json`은 **목록에 없다**(UI12 · §3.7).

## Tasks

### Task 1: `accepted`를 부채로 센다

- **Action**: `debt-inventory.js#collectFindings`의 `.filter(f => f && f.state === 'open')`를
  `f && f.state !== 'closed'`로 바꾼다. 주석에 DD3 한 문단(세 소비처 · 설계 계약 · item 형태 불변)을
  남긴다.
- **Test first** (`msw-m10-producers.test.js`): `makeRepo`로 finding 3건을 만든다 — opened만(A),
  opened + `finding_adjudicated{state:'accepted'}`(B), opened + `finding_closed{closure_type:'deferred'}`(C).
  `buildInventory` 결과의 findings item이 A·B이고 C가 아님을 단언한다. **수정 전 실패를 실측**한다
  (B가 빠져 red).
- **Mirror**: `msw-m10-producers.test.js:57-73` `openEvent(over)` — seq·event_id·finding_id를 명시해
  fold가 결정적이게 한다.
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js`

### Task 2: 도달성 선언과 채널 분류

- **Action**: `findings-registry.js`에 추가한다.

  ```js
  const PRODUCER_CHANNELS = Object.freeze([
    { channel: 'plan-codex-runner', emitter: 'plugins/mccp/scripts/lib/plan-codex-runner.js',
      registers: true, adjudicated: true,
      closure_types: Object.values(CLOSURE_FROM_ADJUDICATION).filter(Boolean), pending_owner: null },
    { channel: 'plan-review-panel', emitter: 'plugins/mccp/scripts/lib/plan-review/cli.js',
      registers: true, adjudicated: false, closure_types: ['deferred'],
      pending_owner: 'diverse-agent-review #1.5' },
    { channel: 'santa-loop', emitter: 'plugins/mccp/scripts/lib/santa/seal.js',
      registers: true, adjudicated: false, closure_types: ['fixed'], pending_owner: null },
    { channel: 'plan-review-l3', emitter: 'plugins/mccp/scripts/lib/plan-review/l3.js',
      registers: false, adjudicated: false, closure_types: [], pending_owner: null },
  ]);
  ```

  `channelOf(finding)`은 DD5의 세 규칙을 적용하고, 맞는 것이 없으면 `'unattributed'`를 돌려준다.
  두 이름 모두 `module.exports`에 더한다. 각 항목과 배열을 freeze한다.
- **Mirror**: `:58-63` `CLOSURE_FROM_ADJUDICATION` 주석 톤 — 왜 여기인지를 적는다.
- **Validate**: Task 3의 test

### Task 3: falsifier test (신규 파일)

- **Action**: `plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js`를 만든다. 스캐너는
  `root`를 인자로 받는 함수로 쓴다(양성 대조를 임시 트리로 돌리기 위해).
  - (R1) 각 채널의 `emitter` 파일이 실재한다.
  - (R2) `registers` ⇔ 파일이 `appendFindings(`를 호출한다(주석 줄 제외).
  - (R3) `adjudicated` ⇔ `kind:\s*['"]finding_adjudicated['"]` 리터럴이 있다.
  - (R4) `closure_types`(집합) = `closure_type:\s*['"](\w+)['"]` 리터럴 집합 ∪
    (`CLOSURE_FROM_ADJUDICATION[` 참조 시 맵의 비-null 값 집합).
  - (R5 · 계약 c) `plugins/mccp/scripts/` 비-test `.js` 전수에서 `finding_adjudicated` kind 리터럴을
    가진 파일은 `CLOSURE_FROM_ADJUDICATION[`도 참조한다.
  - (R6) 같은 전수에서 `finding_(opened|adjudicated|closed)` kind 리터럴을 갖거나 `appendFindings(`를
    호출하는 파일 ⊆ 선언된 emitter ∪ `{findings-registry.js}`.
  - (R7) `channelOf` 분류: 네 입력(santa · codex perspective · 패널 perspective · 모르는 gate)이 각각 기대
    채널로 간다.
  - (R8 · 비공허 양성 대조) 임시 트리에 미선언 emitter 한 파일(`kind: 'finding_closed'`)을 두면 R6 스캐너가
    그 파일을 **잡는다**. 또 `closure_type`을 맵 없이 직접 고르는 `finding_adjudicated` emitter를 두면 R5가
    잡는다.
- **Mirror**: `c1-coverage-gate.js:83-107`(주석 줄 판정 · 파일 열거) · `c1-feedback-loop.test.js:364`
  (전사성 단언).
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js`
  그리고 **mutation 2건을 손으로 실측한다**: 패널 `closure_types`에서 `'deferred'`를 빼면 R4가 red,
  `adjudicated:true`로 바꾸면 R3가 red. 되돌린 뒤 green.

### Task 4: registry 행에 `producers[]`

- **Action**: `report.js`의 findings-registry ledger push(`:459-468`)에 `producers`를 더한다.

  ```js
  producers: PRODUCER_CHANNELS.map(c => ({
    channel, registers, pending_owner,
    reachable: { adjudicated, closure_types },
    observed: findingsUnknown ? null : { total, open, accepted, closed, by_closure_type },
  })).concat([{ channel: 'unattributed', registers: null, pending_owner: null,
    reachable: null, observed: findingsUnknown ? null : {...} }])
  ```

  `observed`는 `allFindings.findings`를 `channelOf`로 분류해 센다. `open` = `state !== 'closed'`
  (accepted 포함), `accepted` = `state === 'accepted'`(open의 부분집합 — 접지 않고 병기, UI2),
  `by_closure_type`은 closed 레코드의 `closure_type`별 계수다. `reachable`은 정적 데이터라
  `findingsUnknown`이어도 유지한다. 채널이 필요로 하는 export가 없으면(모듈 결손) `producers: null` +
  `degraded`에 `{name:'findings-producers', reason}`을 넣는다. 조용한 null은 금지다.
- **Test** (`report.test.js`): 기존 `'../../state/findings-registry'` mock 전부를 **실제 모듈을 spread하고
  `readAll`만 덮는** 형태로 바꾼다(그렇지 않으면 전 test가 degraded를 얻는다). 새 불변식은 넷이다.
  - (p1) `producers`의 channel 순서 = `PRODUCER_CHANNELS` 순서 + `unattributed`
  - (p2) 분할 — 채널 `observed.total` 합 = ledger `total`, `observed.closed` 합 = ledger `closed`.
    fixture는 네 분류가 모두 1건 이상 나오도록 섞는다.
  - (p3) registry가 degraded면 모든 `observed`가 `null`이고 `reachable`은 보존된다
  - (p4) accepted 1건은 `open`과 `accepted`에 모두 잡히고, closed는 `open`에서 빠진다.
    **mutation 실측**: `open`을 `state === 'open'`으로 바꾸면 red.
- **Mirror**: `plugins/mccp/scripts/lib/closure/tests/report.test.js:464-510` (c8)의 인라인 mock · `:972` (c5) degraded 경로
- **Validate**: `MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/lib/closure/tests/report.test.js`

### Task 5: 텍스트 출력

- **Action**: `cli.js#formatTable`의 ledger 루프에서 `ledger.producers`가 배열이면 채널당 한 줄을 출력한다.
  형식: `      <channel>  open <n> / total <n> · accepted <n> · closures reachable: <types|none> · adjudication: <reachable|unreachable>[ (owner: <pending_owner>)]`.
  `registers:false`는 `not registered in the findings registry`로 적는다. `observed:null`이면 `not counted`.
- **Validate**: `node plugins/mccp/scripts/lib/closure/cli.js report`의 출력에 채널 5행이 보인다. 이 CLI의
  종료 코드는 0으로 유지한다(UI3).

### Task 6: 계약 문서화

- **Action**:
  - `docs/multi-session-work-loop/feedback-loop-design.md` §2 뒤에 "채널별 도달성 (closure-accounting
    M3)" 소절을 둔다: Evidence의 표 · 계약 (c) · test 이름 · "M3가 주장하지 않는 것".
  - `.claude/prds/diverse-agent-review.prd.md` milestone 표 아래 blockquote 한 줄: #1.5가 finding을 판정해
    registry에 남길 때는 `CLOSURE_FROM_ADJUDICATION`을 경유하고 `PRODUCER_CHANNELS`의 패널 행을 갱신해야
    한다(`findings-producer-reachability.test.js` R3~R6가 강제).
  - `.claude/prds/closure-accounting.prd.md`: Open Question "두 계기를 통합할 것인가"를 체크하고 답을 적는다
    — 통합하지 않는다. 대신 registry 행이 자기 도달성을 싣는다(M3).
  - `CHANGELOG.md` `## [Unreleased]` 한 줄.
- **Validate**: `node scripts/version-declaration-guard.js` exit 0

### Task 7: 라이브 1회 완주

- **Action**: 이 저장소에서 `node plugins/mccp/scripts/lib/closure/cli.js report --json`을 실행하고, 출력을
  `.claude/PRPs/reports/closure-accounting-m3-report.md`에 첨부한다. 다음을 **값 대조로** 확인해 적는다.
  - `live.by_source.findings` = registry non-closed 레코드 수 (Task 1 전에는 accepted 수만큼 작았다)
  - accepted 레코드의 `item_id` 전부가 live inventory에 있다
  - `producers`의 `plan-review-panel.reachable.adjudicated === false` · `closure_types` = `['deferred']` ·
    `plan-codex-runner.observed.accepted` ≥ 1 · 채널 `total` 합 = ledger `total`
  - 격차는 **증가 방향으로만** 기록하고 재봉인하지 않는다(DD3·UI3)
- **Validate**: 위 네 항목이 보고서에 실측값과 함께 있다

## Validation

```bash
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js \
  plugins/mccp/scripts/lib/closure/tests/report.test.js \
  plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js \
  plugins/mccp/scripts/lib/tests/msw-reseal.test.js \
  plugins/mccp/scripts/lib/tests/c1-feedback-loop.test.js \
  plugins/mccp/scripts/lib/tests/c1-coverage-gate.test.js \
  plugins/mccp/scripts/state/tests/findings-registry.test.js
node plugins/mccp/scripts/lib/closure/cli.js report --json > /dev/null   # exit 0
node plugins/mccp/scripts/lib/closure/cli.js report                      # 채널 5행 육안 확인
node scripts/version-declaration-guard.js                                # 선언 0
git diff --diff-filter=D --name-only origin/main...HEAD                  # 의도치 않은 삭제 0 (§3.5.1)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 라이브 격차가 +3 커지는 것을 회귀로 읽는다 | MEDIUM | DD3 — 봉인 당시 빠졌던 3건이 드러나는 방향이다. 보고서에 봉인 시각과 accepted 이벤트 시각을 나란히 적는다. 재봉인은 하지 않는다 |
| falsifier가 텍스트 스캔이라 변수로 kind를 고르는 emitter를 놓친다 | MEDIUM | R6가 `appendFindings(` 호출자도 전수로 묶으므로 새 emitter 파일은 kind 표기와 무관하게 잡힌다. 남는 사각은 **이미 선언된 파일 안에** 새 채널을 추가하는 경우다(예: `plan-review/cli.js`의 `l3` 핸들러가 emit을 시작하는 것) — 문서에 한계로 적는다 |
| `report.test.js` mock 교체가 기존 불변식을 흔든다 | LOW | spread는 `readAll`만 덮으므로 기존 단언의 입력이 바뀌지 않는다. 교체 직후, 새 test를 더하기 전에 기존 스위트 green을 먼저 확인한다 |
| M2 PR #194가 열린 채 같은 브랜치에 M3가 쌓인다 | MEDIUM | 구현 착수는 #194 머지 후 base를 병합한 뒤, 또는 새 브랜치에서 한다. `report.js`는 M2도 편집한 파일이라 순서가 뒤집히면 충돌한다 |
| DAR PRD 한 줄 편집이 DAR 브랜치와 충돌 | LOW | 표가 아니라 표 아래 blockquote 한 줄이다. 충돌 시 양쪽 보존 |
| registry 1.64%는 여전히 오르지 않는다 — "M3가 아무것도 안 했다"로 읽힘 | MEDIUM | 의도다(UI5·UI6). 보고서의 "주장하지 않는 것" 절에 명시한다 |

## M3가 주장하지 않는 것

- **registry 종결률은 오르지 않는다.** 패널 finding은 계속 open이고, 세션 시작의 승격 목록(현재 448건)도
  줄지 않는다. 그것을 줄이는 정직한 경로는 DAR #1.5의 판정 producer다.
- **두 계기를 통합하지 않는다.** registry 행이 자기 도달성을 싣게 할 뿐이다.
- **hybrid L3를 배선하지 않는다.** 구멍이 있다는 사실을 표기할 뿐이다.
- **falsifier는 위조 방지가 아니다.** 우발적 드리프트를 잡는다(`c1-coverage-gate.js:16-20`과 같은 위협 모델).

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] Task 1·3·4의 mutation을 **수정 전·후 red/green으로 실측**하고 보고서에 기록
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) — `closure report --json`
  라이브 실행 출력에서 Task 7의 네 항목이 실측값으로 성립
- [ ] `plugin.json` diff 0 · CHANGELOG는 `## [Unreleased]` 아래에만

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~39k.

### Findings (severity-ranked)

- **[CRITICAL][explorer]** PRD's own diagnosis that multi-agent mode produces 0 finding_closed events (attributing all producers to plan-codex-runner.js:896, mode=codex-only) is already false in the current codebase — plan-review/cli.js's emitPanelClosures (called at cli.js:1682 from the panel/quorum decide path) already emits finding_closed events with closure_type:'deferred' for the default multi-agent mode. Any M3 plan that proposes 'make multi-agent mode emit finding_closed' would duplicate existing, already-shipped code. — plugins/mccp/scripts/lib/plan-review/cli.js:1065-1116 (emitPanelClosures) + :1682 (closureResult = emitPanelClosures(root, slug, rows)); .claude/prds/closure-accounting.prd.md L53-58 claims 'finding_closed 19건은 전부 multi-session-work-loop-m7·m9에서 나왔다' and '유일 producer가 plan-codex-runner.js:896'.
- **[HIGH][architect]** M3(registry-reachability)의 유일한 미결 milestone은 아직 plan이 없고, PRD 자체가 '이 enum을 은퇴시킬 것인지'와 'multi-agent에서 발화시킬 것인지'를 양자택일로 열어두고 있다 — 구조 결정(어느 쪽을 만들 것인가)이 plan 작성 이전에 내려지지 않으면 두 개의 서로 다른 아키텍처(신규 producer 배선 vs enum deprecation)가 뒤섞인 plan이 나올 위험이 있다. — PRD :121 'finding_adjudicated/finding_closed를 남긴다. 또는 그 enum을 은퇴시킨다' ·  :156-158 Open Question '두 계기를 통합할 것인가... M3의 enum 은퇴 결정과 묶여 있다'
- **[HIGH][architect]** finding_adjudicated의 유일 producer가 plan-codex-runner.js:896이고 mode=codex 전용이며, 현재 settings.json이 MCCP_PLAN_REVIEW=multi-agent로 고정되어 있다 — M3가 'multi-agent에서도 이벤트를 남기게 한다'를 택하면, 단일 writer(런너)에 결합된 이벤트 생산 로직을 멀티에이전트 패널 경로(quorum.js/plan-review 계열)로 복제 또는 추상화해야 하는데, PRD 어디에도 이 두 경로의 결합 지점(공유 헬퍼 vs 병렬 구현)이 명시돼 있지 않다. — PRD :54-56 '유일 producer가 plan-codex-runner.js:896이고 그 러너는 mode=codex 전용인데 .claude/settings.json이 MCCP_PLAN_REVIEW=multi-agent로 고정돼 있기 때문'
- **[HIGH][security]** The PRD's core finding is that no CI workflow (0/6) invokes debt-inventory.js or m10-coverage-gate.js, meaning the closure/disposition integrity checks (seal_intact, binding_mismatch, invalid_dispositions) that gate against tampering are never run automatically — a forged or drifted disposition ledger could persist indefinitely undetected in normal operation, and M1/M2 add a read-only reporter and a manual reseal CLI but do not add any CI/scheduled invocation, so the underlying blind spot (mechanical checks exist but nothing calls them) remains open going into M3. — PRD Evidence: '아무도 이 계기를 부르지 않는다 — .github/workflows/ 6개 중 debt-inventory.js나 m10-coverage-gate.js를 호출하는 것은 0개다... 비-test 호출자는 3곳이며 전부 읽기 소비자이고 재봉인자는 없다.' Success Metric #5 targets only '≥1, M1은 수동 CLI 1개로 충분' — no CI wiring is committed.
- **[HIGH][test]** The plan's own zero-gap acceptance criterion (Task 9 / Acceptance: `after.denominator_gap.count === 0`) is admitted by the R2 adversarial review itself to be structurally unattainable in a live repo — but this is only recorded as a DEFER_TO_BACKLOG note buried in prose (구속력 있는 수정 B), not reflected back into the Acceptance checklist or Task 9 Validate block as an updated, achievable oracle. — .claude/plans/closure-accounting-m2.plan.md L614-621 '재측정한다는 실행 불가다 ... 그때는 창을 다시 잡는다' vs .claude/plans/closure-accounting-m2.plan.md L466-475 Acceptance still requires literal `after.denominator_gap.count === 0`. No amended Validate step exists for the 'measurement window retry' protocol described in prose.
- **[HIGH][explorer]** The real, narrower gap in multi-agent mode is specifically finding_adjudicated (the ACCEPT_NOW-equivalent non-closure event), not finding_closed in general — emitPanelClosures only emits finding_closed (mapped to closure_type 'deferred') and never emits finding_adjudicated for panel findings that reviewers accept without deferring. A correct M3 plan should target this precise gap by mirroring emitAdjudicationOutcomes's DD7 pattern (lookup table CLOSURE_FROM_ADJUDICATION, null-> finding_adjudicated) into the panel/quorum path, not build a generic panel-closure mechanism from scratch. — plugins/mccp/scripts/lib/plan-codex-runner.js:869-911 (emitAdjudicationOutcomes, DD7 comment: 'null이면 종결이 아니라 finding_adjudicated를 남긴다'); plugins/mccp/scripts/state/findings-registry.js:58-63 (CLOSURE_FROM_ADJUDICATION table) is the reusable primitive; cli.js's emitPanelClosures has no equivalent branch for the non-closing 'accepted' outcome.
- **[HIGH][explorer]** PRD explicitly reserves M3 scope as 'registry-reachability' targeting exactly this multi-agent/finding_adjudicated gap or retiring the enum if it stays at 0 — but the plan-drafting session must re-verify the 2026-09-08 baseline numbers against current emitPanelClosures code before committing to 'retire the enum' vs 'wire it', since the premise (0 producers in multi-agent) is demonstrably stale for finding_closed and likely stale for the overall registry-reachability story too. — .claude/prds/closure-accounting.prd.md L121 ('M3 registry-reachability: 기본 리뷰 모드에서 지적이 finding_adjudicated/finding_closed를 남긴다. 또는 그 enum을 은퇴시킨다 — 0건이므로 은퇴가 과거 해석을 바꾸지 않는다') combined with the CRITICAL finding above.
- **[MEDIUM][architect]** findings-registry 이벤트 로그(27개 파일 중 25개가 0건 close)와 disposition ledger(1115건 판정)는 서로 다른 항목 식별자·다른 단위로 부채를 센다(976 대 1196) — M3가 registry에 새 이벤트를 흘려보내는 배선을 추가하면, M2가 이미 완료한 closure/report.js의 'ledgers[] 2행 병기' 설계와 새 producer의 카운트 단위가 다시 어긋날 구조적 위험이 있다. M2 plan은 두 원장 통합을 명시적으로 UI9(exclusion)로 배제했으므로, M3가 통합을 시도하면 M2의 경계 결정과 정면 충돌한다. — PRD :59-61 '두 계기가 서로 55배 다른 답을 낸다' · m2.plan.md UI9 '두 종결 계기를 통합하지 않는다 — 통합 여부는 M3의 enum 은퇴 결정과 묶여 있다'
- **[MEDIUM][architect]** M3의 소유 파일이 plan-review/cli.js·findings-registry.js로 예고되어 있고, PRD가 명시적으로 review-record-linkage·diverse-agent-review 두 PRD와의 병렬 충돌을 인정한다 — 이는 M3의 경계가 단일 PRD 안에서 닫히지 않고 최소 3개 PRD의 소유권이 겹치는 지점임을 뜻한다. 이 겹침을 조율할 메커니즘(파일 잠금/순서/오너십 표)이 이 PRD에는 없다. — PRD :140-142 'M3는 plan-review/cli.js·findings-registry.js를 건드리므로 각각 review-record-linkage·diverse-agent-review와 겹칠 수 있고, 그 병렬 무충돌은 주장하지 않는다'
- **[MEDIUM][security]** reseal.js write path has no lock against concurrent invocation. Two operators (or a script + a human) running `apply --apply` concurrently could both pass the pre-manifest read, both copy the old seal archive, and race on `debt-inventory.json` tmp+rename — the append-only ledger's all-or-nothing guarantee in appendDispositions does not protect the seal-doc write itself. — closure-accounting-m2.plan.md Task 5 step 0-3 describes manifest + tmp+rename but no advisory lock comparable to §3.6's pr-phase.lock/quarantine.lock/evidence-write-lock trio; the plan's own §3.6 pattern (evidence write lock, 5s lease, fail-closed) is not cited or mirrored here despite this being a similarly destructive one-shot mutation of a git-tracked file.
- **[MEDIUM][security]** Ancestor trust is authenticated by index membership (`git ls-files --error-unmatch`) not by commit history, and the plan itself admits this only raises the forgery cost from 'one line' to 'one line + one self-generated, git-added file' — an attacker (or a buggy automated caller) with the same repo write access as the reseal tool can synthesize an arbitrary items[] array, compute inventoryHash over it, drop it at seals/debt-inventory-<sha12>.json, `git add` it, and have it accepted as a verified ancestor without ever having been a real historical seal. — plan.md DD2 R3: '재계산만으로는 계보를 인증하지 못한다... 아무 items[]나 쓰고 그 해시를 파일명으로 붙이면 재계산 검사를 통과한다' and 'git add 한 번이면 통과하고 커밋은 하나도 남지 않는다' — the residual mitigation is 'a single-commit convention in ## Acceptance', which is a process control, not a mechanical one.
- **[MEDIUM][security]** The successor-acceptance marker (`<!-- accepts-inventory: sha256:<64hex> -->`) is a purely textual convention with no cryptographic binding to the actor who wrote it — any writer with repo access can add the marker to any of the three deferred-doc files (or a new one) to manufacture successor acceptance for an arbitrary sha, and the plan explicitly says the ancestry check 'closes drift and mistakes, not forgery' (same threat model as §3.12: same-privilege node execution can write the ledger directly). — plan.md DD2/DD9-b: '위협모델은 §3.12와 같아(같은 권한으로 node를 돌리는 주체는 원장을 직접 쓴다) 위조는 여전히 막지 못한다' and risk table row '## succeeded_from을 임의 값으로 적어 아무 파일이나 successor로 만든다 | MEDIUM'.
- **[MEDIUM][security]** M3 (registry-reachability) has no plan file yet, and the PRD flags that the only producer of finding_adjudicated is plan-codex-runner.js:896 which is mode=codex-only, while the repo's default MCCP_PLAN_REVIEW is pinned to multi-agent — any M3 design that makes the multi-agent path also close findings needs to define who/what is trusted to mark a finding closed (a security-relevant authorization boundary: closing findings can suppress future gate blocking per §3.14's 'no unabsorbed HIGH/CRITICAL' criterion) and this trust boundary is entirely undesigned. — PRD line 55-56: '0인 이유는 유일 producer가 plan-codex-runner.js:896이고 그 러너는 mode=codex 전용인데 .claude/settings.json이 MCCP_PLAN_REVIEW=multi-agent로 고정돼 있기 때문이다.' CLAUDE.md §3.14 ties absorbed-finding accounting directly to gate/round convergence decisions.
- **[MEDIUM][test]** Task 9's live-reseal acceptance is a single, non-repeatable, irreversible run (append-only ledger + git-only rollback) with no rehearsal test that exercises the full code path against a repo-shaped fixture (2487 live items, 1115 sealed, real ancestry files) before the one live shot. — .claude/plans/closure-accounting-m2.plan.md L453 '완료된 재봉인을 되돌릴 수 없다 (원장 append-only)' + Task 5 apply description; Task 9 Validate only asserts post-hoc relationships, not a pre-live rehearsal against repo-scale synthetic data.
- **[MEDIUM][test]** Post-implementation, four real out-of-band review findings on reseal.js targeting the exact code paths this plan's Validate blocks cover (non-atomic append under concurrent read, backward-debt permanent abort, exit-code swallowing of ok:false, scrub not applied to preflight/append rejection reasons) were deferred to backlog rather than covered by new regression tests. — .claude/plans/codex-findings-backlog.md L1624-1628 — four LOW findings against reseal.js dated 2026-09-11, all 'closure-accounting M2 PR ... 이연(§3.14)', none with a corresponding test added.
- **[MEDIUM][explorer]** findingsRegistry.deriveFindingId + appendFindings + stampGateDecision (DD8 attribution) is the established convention for producing registry events from any gate — both the codex path (plan-codex-runner.js:842-867, 875-911) and the panel path (cli.js:1065-1159) already follow it verbatim, including identical error-handling prose ('the gate is unaffected, C1 will show the loss as a seq gap'). Any M3 work must reuse this exact triad rather than inventing a new event-emission helper. — plugins/mccp/scripts/lib/plan-codex-runner.js:857-858 vs plugins/mccp/scripts/lib/plan-review/cli.js:1104,1150 — identical appendFindings call shape and error message wording.
- **[MEDIUM][explorer]** There is a second, parallel disposition channel — plan-review/backlog-append.js (review-loop-bypass M2) — that writes blocking findings straight to .claude/plans/codex-findings-backlog.md as an out-of-band disposition, bypassing the findings-registry entirely when MCCP_REVIEW_SINGLE_PASS mitigation fires. M3's registry-reachability plan should account for this second sink; findings dropped there never reach finding_adjudicated/finding_closed and would still show as registry-gap even after M3 ships, unless the plan explicitly scopes around it. — plugins/mccp/scripts/lib/plan-review/backlog-append.js:1-30 (module header: DD1/DD2 — appends quorum.blockingFindings to backlog.md as the toggle's mitigation path, independent of findings-registry).
- **[MEDIUM][explorer]** M1's closure/report.js and M2's msw-metrics/reseal.js already exist and are the direct integration points for any M3 output — the PRD's Delivery Milestones table names these as sibling/dependency files. The plan should confirm whether M3 needs to extend closure/report.js's ledgers[] output to reflect the corrected finding_closed producer count, since M1's baseline numbers embedded that stale premise. — .claude/prds/closure-accounting.prd.md L119-120 (M1/M2 file ownership) and Success Metric #3 ('두 계기의 불일치 ... 리포트의 ledgers[] 2행').
- **[LOW][architect]** M1/M2가 세운 패턴(순수 오라클 + apply 분리, degraded[]/null 실패 모델, manifest 기반 재진입 판별자, append-only 원장에 대한 단일 writer 강제)은 M3에서도 재사용 가능한 강한 선례이지만, PRD는 M3의 구조적 접근(신규 파일 vs 기존 파일 편집)을 규정하지 않아 이 선례들이 자동 상속되지 않을 위험이 있다. — m2.plan.md 'Patterns to Mirror' 표 (cwd-rebind manifest 선례, append-only latest-line-wins, 읽기 실패=null)
- **[LOW][architect]** 결정 5(backlog에 상태 열 추가 금지, 4열 파서 고정)와 유사한 '파서 고정 스키마' 함정이 findings-registry 이벤트 로그의 KINDS enum(3종 고정)에도 존재할 수 있다 — M3가 새 이벤트 종류나 필드를 얹으면 기존 소비처(코드에 3종만 처리)가 조용히 무시하거나 오분류할 위험이 있는데 PRD에 이 소비처 목록이 없다. — findings-registry.js:46 'const KINDS = [\'finding_opened\', \'finding_adjudicated\', \'finding_closed\']' — PRD Evidence :53-58에는 이 KINDS의 다른 소비처가 열거되지 않음
- **[LOW][security]** planReseal/applyReseal error messages are written into a committed artifact (`.claude/_meta/data/2026-09-08-closure-reseal-live.json`) and the plan requires reusing report.js's scrubPathsFromMessage to fold absolute paths — but this scrubbing is scoped only to Task 4's degraded[] messages; no equivalent scrub is specified for manifest (`.claude/state/reseal-manifest.json`) or the seal-doc `meta.supersedes`/`meta.ancestry` fields, which could leak local absolute paths or usernames if error objects or cwd-derived values are captured verbatim there. — plan.md Task 4: 'scrubPathsFromMessage(...)를 재사용해 절대경로를 접는다 (L2 security MEDIUM 흡수)... 이 저장소는 이미 receipt 절대경로 leak으로 sanctioned re-seal을 한 번 치렀다(§3.12)' — the scrub is named only for report.js's degraded[] path, not for reseal-manifest.json or the seal doc itself.
- **[LOW][test]** DD2 admits a residual forgery path (an archive file containing arbitrary items[] whose hash happens to match, with no proof it was ever a real historical seal) that only the git-tracked condition partially closes (proves index membership, not commit history) — no dedicated adversarial fixture test targets this residual gap distinctly from the simpler 'no archive at all' case. — .claude/plans/closure-accounting-m2.plan.md L73-77 '아무 items[]나 쓰고 그 해시를 파일명으로 붙이면 재계산 검사를 통과한다' and DD2 correction at :82-90 conceding the git-tracked predicate proves index membership only; Task 1/3 Validate lists only cover the archive-absent case explicitly.
- **[LOW][test]** The `## Validation` bash script's step 6 (live reseal apply) is embedded as a plain command with only a human-readable comment '한 번만' (do this only once) — nothing in the script mechanically guards against accidental re-invocation via copy-paste or CI re-run. — .claude/plans/closure-accounting-m2.plan.md L420-421 '# 6. 라이브 재봉인 (Task 9 — 한 번만)\nnode plugins/mccp/scripts/lib/msw-metrics/reseal.js apply --apply --json' — idempotency is claimed to live inside applyReseal via manifest (Task 5), but the validation script itself has no assertion step confirming manifest state before invoking apply.

### Meta-gaps

- M3에 대해 '발화시킨다' vs '은퇴시킨다' 중 어느 것을 택할지, 그리고 그 선택이 어떤 실측 기준(예: multi-agent 패널에서 이벤트를 실제로 남길 수 있는지 사전 스파이크)으로 결정되는지가 PRD/plan 모두에 없다 — 이 결정 없이 plan을 쓰면 Task 구조 전체가 재작업될 수 있다.  _(architect)_
- M2 plan이 세운 '병렬 무충돌 미주장' 파일(plan-review/cli.js, findings-registry.js)에 대해 M3 plan이 다른 진행 중 PRD(review-record-linkage, diverse-agent-review)의 현재 상태를 먼저 확인해야 하는데, 그 확인 절차가 PRD에 지시되지 않음.  _(architect)_
- registry 이벤트 로그의 976/1196 카운트 불일치의 근본 원인(항목 식별자 단위 차이)이 조사되지 않은 채 M3로 이연됐다 — M3가 배선만 고치고 단위 불일치를 그대로 두면 '두 번째 원장도 부정확하게 채워지는' 새 계기가 생길 수 있다.  _(architect)_
- No draft plan exists yet for M3 (registry-reachability) — the security lens has nothing concrete to review there; when it's drafted it must address who is authorized to emit finding_adjudicated/finding_closed in the multi-agent (non-Codex) review path, since that event feeds gate-convergence decisions (§3.14) and is currently a single trusted producer (plan-codex-runner.js).  _(security)_
- PRD/M2 plan never states a threat model boundary explicitly outside of scattered DD notes — it should say once, up front, that the closure-accounting subsystem assumes 'same local repo-write privilege as attacker' (per §3.12) and is NOT designed to resist a malicious committer; several findings above are really restatements of that single unstated assumption.  _(security)_
- No mention of concurrent-writer protection (lock) for reseal.js despite the repo having three established lock patterns (§3.6) for exactly this class of destructive, git-tracked, one-shot mutation — the plan should either adopt one or explicitly document why it's unnecessary (e.g., 'M2 Acceptance requires human-run single execution, no automation calls apply').  _(security)_
- CI-wiring absence (Success Metric #5, satisfied by 'manual CLI ≥1') means the entire closure-accounting mechanism remains operator-memory-dependent for invocation — this is the PRD's own diagnosed pathology recurring one level up: a security-relevant integrity check (seal tamper detection) that nothing calls automatically.  _(security)_
- PRD Success Metric #1 leaves the post-reseal target value of denominator_gap undefined for ongoing operation ('값 자체의 목표는 M2가 정한다'), and M2's plan never states an acceptable re-drift threshold before the next reseal is a regression versus expected — no test or metric exists for this beyond the single one-time 0 observation.  _(test)_
- Success Metric #5 ('계기 호출 빈도 ≥ 1, M1은 수동 CLI 1개로 충분') and the PRD's own diagnosed pathology ('아무도 이 계기를 부르지 않는다') are not mechanically re-tested by M2 — no assertion exists that the manual-invocation habit will actually recur; this is the exact failure mode the PRD exists to detect.  _(test)_
- No plan-level test asserts cross-artifact consistency after the live run (e.g. that debt-inventory.md's new '## Re-sealing' narrative numbers match the actual .claude/_meta/data/2026-09-08-closure-reseal-live.json output) — a doc/code drift class this same PRD's Evidence section explicitly flags elsewhere in the repo.  _(test)_
- PRD's Evidence section for M3's premise (finding_closed producer count/attribution) was not re-verified against current plan-review/cli.js at plan-drafting time — the fan-out session should re-run the registry stats before scoping M3, since 19 finding_closed events may already be flowing from the panel path and the '0 producer' framing may be outdated.  _(explorer)_
- PRD does not mention backlog-append.js as a competing disposition sink at all — Open Questions list 'deferred 983건' and 'integrate two ledgers' but never surfaces this third channel, so M3 plan risks declaring victory on registry-reachability while findings routed through the single-pass bypass remain permanently unreachable.  _(explorer)_
- No explicit mapping in the PRD from quorum/panel verdict states (accept/reject/defer as used in decide.js and quorum.js) to the CLOSURE_FROM_ADJUDICATION enum — the plan needs this mapping table before it can wire finding_adjudicated for the panel path, and it isn't sketched anywhere yet.  _(explorer)_

### Patterns to mirror

- plugins/mccp/scripts/lib/msw-metrics/reseal.js (M2, planReseal/applyReseal 분리) — 순수 계산과 부작용 분리, degraded[]+ok:false로 부분 실행 금지  _(architect)_
- plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:565-571 foldDispositions — append-only 원장에 대한 'latest line wins, 덮어쓰지 않고 기록' 규약  _(architect)_
- closure-accounting-m2.plan.md DD9의 '열거식 거부 목록 대신 명시 마커로 클래스를 닫는다' 패턴 — M3가 어떤 경로/파일 목록으로 조건을 판정하려 하면 같은 함정(새 파일마다 구멍 증가)에 걸릴 가능성이 높음  _(architect)_
- CLAUDE.md §3.7 — 자식 브랜치는 plugin.json version을 선언하지 않는다(M3 plan도 이 규칙을 상속해야 함)  _(architect)_
- plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:678-686 collectAcceptedShas — bounds scan length (MAX_SUCCESSOR_SCAN_CHARS), strips quoted/fenced content before regex match, and uses a fixed-format anchor regex rather than substring search, closing a real forgery vector (Codex R1 HIGH) where any file merely containing the sha string could pose as an accepting successor.  _(security)_
- plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:693-696 checkSuccessor — resolves the successor path through classifyEvidence (path allowlist) before touching the filesystem, rather than joining raw user/ledger-supplied paths directly.  _(security)_
- §3.12 durable-evidence-substrate no-rehash invariant and sanctioned single re-seal tool pattern (v1.22.4-cwd-rebind.js) — dry-run default, --apply required, manifest for crash-safe reentrancy, atomic rekeying in one run — correctly mirrored by this plan's DD5/Task5/Task6; worth citing explicitly in any future plan touching git-tracked receipt/ledger mutation.  _(security)_
- report.js scrubPathsFromMessage (§ referenced at :36-79) for redacting absolute paths before writing to committed artifacts — should be applied uniformly to every new committed diagnostic surface, not just the one call site the plan names.  _(security)_
- Invariant-not-value testing: report.test.js and msw-reseal.test.js assert structural relationships and bidirectional mutations (disable a guard, confirm the test goes red) instead of pinning literal counts that drift with live data (.claude/plans/closure-accounting-m2.plan.md L40, Acceptance requirement for '양방향 mutation').  _(test)_
- Fail-closed on unreadable/ambiguous input: report.js's degraded[]+null pattern (never guess a number when a source is unreadable) is explicitly reused by reseal.js's ok:false/degraded[] design (.claude/plans/closure-accounting-m2.plan.md L284-285).  _(test)_
- Synthetic fixture-repo pattern for destructive/irreversible operations under test: msw-m10-producers.test.js's sealed() helper builds a temp repo and actually runs sealInventory rather than mocking, so tests never touch the live repository (.claude/plans/closure-accounting-m2.plan.md L41).  _(test)_
- Single-writer choke-point enforced by a static scan test, not just code review: Acceptance requires a scan asserting reseal.js has zero direct appendFileSync calls, ensuring all ledger writes funnel through the validated appendDispositions (.claude/plans/closure-accounting-m2.plan.md L481).  _(test)_
- plugins/mccp/scripts/lib/plan-codex-runner.js:869-874 (DD7) — closure-vs-adjudication event selection lives in ONE lookup table (findings-registry.js CLOSURE_FROM_ADJUDICATION), never branched ad hoc at call sites.  _(explorer)_
- plugins/mccp/scripts/lib/plan-review/cli.js:1065-1116 (emitPanelClosures) — matches closure events to only-open finding_ids via a Set read from the shard before appending, avoiding double-closing.  _(explorer)_
- plugins/mccp/scripts/state/findings-registry.js:36 — import canonical SLUG_RE from '../receipt/decision' rather than re-declaring a regex literal for gate_decision_id validation (explicitly called out in cli.js:1144-1146 as a lesson from a prior local-review finding).  _(explorer)_
- Error handling convention across both producers: never throw on registry-append failure, always loud stderr warn with 'the gate is unaffected ... C1 will show the loss as a seq gap' — fail-open by design, must be mirrored for any new M3 emit site.  _(explorer)_

## Design Critique

- trigger: `design_signal=true` · `signal_files=["<keyword:design>"]` — 본문의 "Design Decisions"·`feedback-loop-design.md` 문자열에서 잡힌 키워드 신호다. 이 plan은 렌더링 표면(HTML/JSX/CSS/`status.html`)을 건드리지 않는다.
- critique: `Skill(impeccable:impeccable, "critique closure-accounting-m3")` R0 · findings `[]` — 유일한 사용자 가시 표면은 Task 5의 터미널 평문 한 줄 형식이고, Output Constraints 4종(heading 깊이 · 강조색 · raw markdown · 항목 수 상한)이 적용될 rendered surface가 없다.
- verdict: `CONVERGED` (round 0/2) → receipt `design_critique_verdict=converged`, rounds 1

## Design Routing Guide

routing mode: auto (effective at implement stage). At implement the design gate routes these stage-appropriate impeccable commands; here they are a checklist only. 이 plan은 rendered surface가 0이므로 implement에서는 refine/discovery가 강등된다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## External Research Provenance

- Source PRD: .claude/prds/closure-accounting.prd.md
- References section sha256: f0e684f1fd00c5fe7ebd1b418efd2e119072b6364be46f4648e0827938702505
- Stamped at: 2026-09-14T02:33:07.291Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
