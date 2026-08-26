# 세션 경계 피드백 루프 설계 (multi-session-work-loop M7)

> 계약 문서다. 승격 경계의 근거, 판정 → 종결 매핑, DD3 비재발 판정의 한계,
> 그리고 **이 milestone이 주장하지 않는 것**을 소유한다.
>
> 단언 매니페스트: [m7-assertion-manifest.json](./m7-assertion-manifest.json) ·
> 전후 대조: [m7-before.json](./m7-before.json) · [m7-after.json](./m7-after.json) ·
> 감사 표본: [m7-audit-sample.json](./m7-audit-sample.json)

## 1. 무엇을 닫는가

한 세션에서 발견된 finding이 세션 경계를 넘지 못하고 사라지는 통로를 닫는다.
게이트가 **이미 구조화된 형태로 생산하고 있던** finding — 패널 `l2.json`,
Plan-Codex 판정, santa 라운드 — 을 append-only 레지스트리에 기록하고, 미해소
HIGH·CRITICAL을 다음 세션의 작업 목록에 올린다.

게이트를 하나도 추가하지 않고 LLM 호출도 늘리지 않는다(UI3). 새로 만드는 것은
**관측·전달 층**이며 판정 권한은 기존 게이트에 그대로 남는다.

## 2. 종결 유형과 판정 매핑

종결 유형은 5종이고 **앞 둘만 해소**다.

| 종결 유형 | 의미 | C1 분자 |
|---|---|---|
| `fixed` | 라운드 간 비재발로 판정된 수정 (§4) | 계상 |
| `invalidated` | 리뷰어 지적이 설계상 틀렸다고 판정됨 | 계상 |
| `deferred` | 이연 | 계상 금지 |
| `downgraded` | 강등 | 계상 금지 |
| `rejected` | 기각 (YAGNI 등) | 계상 금지 |

Plan-Codex 판정 enum과의 매핑은 `findings-registry.js`의
`CLOSURE_FROM_ADJUDICATION` **한 곳에만** 산다. 호출부에 흩어지면 `ACCEPT_NOW`를
종결로 바꾸는 변경이 어디서든 일어날 수 있고, 그때 그것을 잡는 단일 지점이 없다.

| 판정 | 레지스트리 처리 | C1 분자 |
|---|---|---|
| `REJECTED_BY_DESIGN` | `closed{type:'invalidated'}` | 계상 |
| `DEFER_TO_BACKLOG` | `closed{type:'deferred'}` | 계상 금지 |
| `REJECT_YAGNI` | `closed{type:'rejected'}` | 계상 금지 |
| `ACCEPT_NOW` | `finding_adjudicated{state:'accepted'}` — 열린 채 | 아직 아님 |

**`ACCEPT_NOW`가 `null`인 것은 종결이 없다는 뜻이지 이벤트가 없다는 뜻이 아니다.**
판정은 plan 시점이고 수정은 implement 시점이므로 그 둘 사이의 유실이 바로 이
milestone이 닫으려는 통로다. 수용 의사를 해소로 계상하면 finding을 처리하지 않고도
폐쇄율이 오른다 — UI5가 금지하는 강등·기각 계상과 같은 종류의 조작 경로다.

`C1-EMIT-PLAN-CODEX`가 두 가지를 함께 단언한다: 맵이 `ADJUDICATION_VERDICTS`
전건을 덮는다(전사성), 그리고 `ACCEPT_NOW`의 상은 `null`이다. 새 판정 enum이
추가되면 전사성 단언이 먼저 붉어지므로 매핑 누락이 조용히 통과하지 못한다.

## 3. 승격 경계 — CRITICAL·HIGH이고 상수다

PRD Open Question("어떤 심각도부터 자동 승격할 것인가")의 답이다. 새 숫자를
발명하지 않고 **CLAUDE.md §3.14가 이미 저장소를 운영하고 있는 규칙**을 승계한다 —
CRITICAL·HIGH만 그 자리에서 흡수하고 MEDIUM·LOW는 backlog에 append. 승격은 그
규칙의 세션 경계 확장이므로 임계가 저장소 관행과 일치한다.

임계는 `PROMOTE_MIN_SEVERITY` **상수**이고 env 토글을 만들지 않는다(UI7 — 환경
토글 축의 단조 증가는 해악이다). `C1-PROMOTE-CONSTANT`가 레지스트리 코드에
`process.env` 읽기가 0건임을 정적으로 단언한다.

> **의존 관계**: §3.14는 해제 조건(`quorum.js`가 bare `verdict='fail'`을
> `severity:'FAIL'` blocking finding으로 합성하지 않게 되면)이 붙은 **임시 규칙**이다.
> 그 절이 사라질 때 이 상수의 근거도 함께 재검토해야 한다. 그때까지 두 값은 같은
> 판단(“CRITICAL·HIGH만이 그 자리에서 다룰 값이다”)의 두 표현이다.

판독 불가 severity는 승격하지 **않는다** — 상한이 있는 표면에서 모르는 값이 자리를
차지하면 아는 CRITICAL이 밀린다. 레지스트리 기록에는 그대로 남는다.

## 4. `fixed`는 라운드 간 비재발로 판정한다 — 그리고 그 한계

`ACCEPT_NOW`된 finding이 실제로 고쳐졌는지를 LLM에게 묻는 것은 UI3 위반이고 PRD
Scope의 "LLM 기반 실패 원인 판정" 배제에도 걸린다. 대신 **이미 구조화되어 있는
라운드 이력**을 쓴다: 같은 작업 단위·같은 리뷰어 축에서 라운드 N에 열린 finding이
라운드 N+1에서 pass 판정과 함께 재발하지 않으면 `closed{type:'fixed'}`로 기록한다.

**한계를 정직히 적는다.** `finding_id`는 내용 파생이므로 라운드 간 문면이 크게
바뀌면 매칭에 실패한다.

> **정정 (local review 흡수, 2026-08-21).** 이 절은 이전에 *"매칭 실패 시 그 finding은
> 새 finding으로 계상되어 분모만 늘리므로 오차가 C1을 낮게 보는 보수적 방향으로만
> 작동한다"* 고 적었고, 그것을 **이 설계를 방어 가능하게 만드는 유일한 성질**이라고
> 불렀다. 그 문장은 효과의 절반만 계산한 것이었다 — 매칭 실패는 분모를 늘리는 동시에
> **prior finding을 `fixed`로 닫는다**(분자 +1). 실측: 고쳐지지 않은 결함 1건이 문면만
> 바뀐 채 수렴하면 참값 `0/1 = 0.00`이 `1/2 = 0.50`으로 보고됐다. 즉 오차는 보수적
> 방향이 아니라 §2가 조작 경로로 지목한 **부풀리는** 방향이었고, 아래 세 제약은 그것을
> 막기는커녕 정확히 그 방향으로 작동했다(2차 키를 *끄는* 것이 곧 거짓 `fixed`를 만든다).

정정된 규칙은 **"모르겠다가 분자를 사지 못하게 한다"** 이다. 비재발을 주장하려면 같은
리뷰어 축(`perspective`)의 현재 finding들과 실제로 대조가 성립해야 한다:

1. 그 축의 현재 finding이 하나도 없으면 → **명백한 소멸**이므로 종결한다. 수렴 라운드가
   비어 있는 통상 경로가 여기이므로 지표가 죽지 않는다.
2. 같은 `matchKey` 후보가 **하나라도** 있으면 → 재발로 본다. 후보가 둘 이상이어서
   "어느 것인지 모른다"는 것은 종결 근거가 아니다.
3. prior에 `cited_path`가 없거나(`<outside-repo>` placeholder 포함 — 그 값은 서로 다른
   여러 경로가 접힌 결과다) 동축 현재 finding 중 하나라도 키가 없으면 → **대조 불가**이므로
   종결을 보류한다. 기록은 그대로 남고 다음 라운드가 다시 판정한다.

이 규칙 아래에서 오차는 실제로 한 방향이다: 대조가 성립하지 않는 구간은 분모에만 들어가고
분자에는 들어가지 않으므로 **C1을 낮게 본다.** 그것이 이 설계의 방어 가능성이며, **매칭을
관대하게 만드는 어떤 변경도 — 특히 종결 조건을 넓히는 변경은 — 이 성질을 먼저 실측으로
확인해야 한다.** 회귀 단언은 `findings-registry.test.js`의 `C1-ID-SECONDARY-KEY` 아래에
있고, 통상 경로(빈 수렴 라운드·다른 축만 남은 라운드)가 여전히 종결하는지를 함께 고정한다.

## 5. 유실 가시성 — `seq` 축과 그 경계

fail-open만 계약하면 디스크 실패 시 이벤트가 조용히 사라지고, 분모가 줄어든 C1이
아무 표시 없이 산출된다. **1차 탐지는 마커가 아니라 데이터 자체다**: writer가
work_unit별 단조 `seq`를 부여하고 reader가 수열의 구멍을 유실로 판정한다.

`seq` 할당은 **write 시도 전에** 전진한다. 디스크의 최대값에서만 다음 번호를 뽑으면
실패한 append가 아무 흔적도 남기지 않고(다음 write가 같은 번호를 재사용한다) 이 축이
영원히 아무것도 탐지하지 못한다. 프로세스 지역 고수위가 그것을 막는다.

**다만 그 "write 시도"에 입력 검증은 포함되지 않는다** (local review 흡수). 할당보다
**먼저** 배치 전체의 `kind`를 검증한다. 뒤에 두면 호출자 쪽 버그(오타 `kind`)가 `n`개
번호를 소진한 뒤 아무것도 쓰지 않아, 디스크 실패와 **구분되지 않는 구멍**을 남기고
`.degraded` 마커도 남기지 않는다. 레지스트리는 evict도 재작성도 하지 않으므로(§7) 그
구멍은 되돌릴 수 없고, 그 work_unit은 `--acceptance`의 non-degraded 축을 영구히 통과하지
못한다. `seq` 축이 뜻하는 것은 **"이벤트가 유실됐다"** 이지 "호출자가 잘못된 값을 넘겼다"가
아니므로, 후자는 번호를 쓰기 전에 거절한다.

탐지는 두 축이다 — 정렬 후 구멍·동값 인접, 그리고 `max(seq)`와 고유 `seq` 개수의
불일치. 후자가 있어야 "6이 유실되고 5가 중복돼 구멍이 안 보이는" 상태가 잡힌다.
**중복이 계상을 바꾸지는 않는다**: `seq`는 유실 탐지 전용 축이고 계상 키는
`finding_id`다. 탐지 축이 계상 축을 건드리면 유실 신호가 조용히 데이터를 바꾸게
되고, 그것은 관측이 아니라 개입이다.

`seq` 생성에 **락을 걸지 않는 것은 의도다.** 락 대신 탐지를 택한 이유는 evidence
write lock(§3.6)이 fail-closed라 계측이 게이트를 막게 되고, 그것이 이 층이 지키려는
성질을 정면으로 깨기 때문이다.

### 꼬리는 오차 방향으로 먼저 가른다

유실 방향에 따라 C1이 낮아지기도 하고 높아지기도 한다. `finding_closed` 유실은
분자만 줄여 C1을 낮게 보이게 하지만(보수적), `finding_opened` 유실은 **분모를 줄여
폐쇄율을 부풀린다**. 후자는 §2가 막는 조작 경로와 결과가 같다. 두 기제로 가른다.

1. **batch 단위 원자 append.** N개 finding을 N번 연속 append하지 않고 N줄을 한 번의
   write로 붙인다. 부분 착지는 마지막 줄이 잘려 malformed로 격리되므로 reader가 본다.
   각 줄이 `batch_expected: N`을 실으므로 뒤가 잘려도 기대치는 이미 디스크에 있다.
   **순차 append 공개 API를 두지 않는 것이 요점**이다 — 두면 호출자가 그 경로를 택하는
   순간 "말미 k개 유실"이 되돌아온다.
2. **부풀리는 방향은 독립 축이 잡는다.** `c1-coverage-gate.js`의 런타임 falsifier가
   finding 표면(`.claude/reviews/`)이 레지스트리보다 많은 finding을 나열하는지 본다.
   표면은 레지스트리와 **다른 코드 경로가 다른 목적으로** 쓰므로 기록기의 기록기가
   아니라 독립 관측이며 무한 후퇴가 아니다.

   **대조는 같은 술어로 해야 한다** (local review 흡수). 두 표면의 포함 조건이 다르면
   유실이 없어도 좌우가 어긋난다: `record.js#findingRows`는 `isObj(f)`인 모든 finding에
   행을 쓰지만 `plan-review/cli.js#emitPanelFindings`는 `claim`이 비면 emit하지 않고,
   레지스트리는 내용 파생 `finding_id`로 **fold**한다. raw 행 수로 세면 claim 없는
   리뷰어 출력이나 내용이 같은 중복 행에서 게이트가 *"events were lost in the inflating
   direction"* 으로 **오진하며 차단**한다(실측: 행 3 · 이벤트 2 · fold 1 → exit 1). 그래서
   표면 쪽도 `(perspective, severity, normalizeClaim(claim))`으로 fold하고 빈 claim을 뺀다.

   반대 방향 사각도 같은 줄에 있었다: `shard.findings`는 그 work_unit의 **모든** 게이트
   (패널 · Plan-Codex · santa)를 fold한 집합이라, 다른 게이트의 finding이 좌변을 채워
   **실제 패널 유실을 가린다**. 이 축이 겨냥한 것이 정확히 그 방향의 유실이므로 사각이
   목적과 겹친다 — 대조 전에 `gate_id`와 `perspective` 두 축으로 패널 finding만 추린다.

**남는 잔여**: `finding_closed` batch 전체가 유실되고 그 work_unit에 이후 성공한
write가 없는 구간, 그리고 실패 직후 프로세스가 종료해 고수위가 사라진 뒤 다른
프로세스가 이어 쓰는 구간. 두 경우 모두 C1이 실제보다 **낮게** 보고된다. 이 잔여를
닫는다고 주장하지 않으며, 남는 이유는 무한 후퇴 회피다.

## 6. 신뢰 경계 — 승격 표면은 프롬프트 표면이다

승격 표면의 독자는 사람이 아니라 **다음 세션의 모델**이다. 승격 대상이 CRITICAL·HIGH로
좁고 건수가 상한으로 잘린다는 것은 **분량**의 방어이지 **내용**의 방어가 아니다.

이 경계는 저장소가 이미 한 번 닫아 둔 것이므로 새로 발명하지 않고 승계한다 —
CLAUDE.md §3.13의 `<user_intent_reference>` 주입이 정확히 같은 문제를 풀었다.
`state-injector.js`는 `intent-context.js`의 함수를 **호출**한다:

```
decodeBoundedEntities  →  escapeReferenceText  →  길이 상한 + trimDanglingEscape
                          (역슬래시 우선)
```

그리고 `anyTokenMixedScript` 또는 `looksDirective`에 걸리는 항목은 **주입에서
제외**하고 제외 건수만 적는다. 레지스트리 기록 자체는 남는다 — 관측을 지우지 않는
것이 §5와 같은 원칙이다. `cited_path`는 산문이 아니라 **데이터로 렌더한다**(백틱
코드 스팬): 문장 안에 벌거벗은 경로로 두면 그 줄이 지시로 읽힐 여지가 생긴다.

새 sanitizer를 쓰지 않는 것이 요점이다 — 두 벌을 두면 §3.13이 이미 닫은 경계가
이쪽에서만 조용히 뒤처진다. 그 재사용이 성립하려면 네 함수가 `module.exports`에
있어야 하며, 그 export 확대도 이 milestone의 작업이다(`C1-PROMOTE-SANITIZED`가
import 가능성과 호출 여부를 함께 단언한다).

**레지스트리에 리뷰어 산문은 들어가지 않는다.** allowlist에 `claim` 필드가 없고
`claim_digest`만 있으므로, 승격 표면에 도달하는 리뷰어 authored 텍스트는
`cited_path`와 `perspective` 둘뿐이다. 원문은 항목이 가리키는 리뷰 기록이 갖는다.

## 7. 내구성과 병합

레지스트리가 worktree 정리(§3.8)와 함께 사라지면 "발견과 해소 사이의 유실이
사라진다"는 이 milestone의 표제 결과가 그 자리에서 반증된다. 그래서
`.claude/state/findings/`는 STATE.md·fix-task.md와 같은 이유로 **git-tracked**다.

- **evict하지 않는다.** git-tracked 파일을 evict하면 이력을 재작성하게 되고, 그것이
  PRD가 없애려는 "되돌릴 수 없는 압축"이다. per-file cap 초과는 loud warn만 한다.
- **`merge=union`이 계약이다.** 선언 없이 git-tracked append-only 로그를 병렬로 쓰면
  병합이 한쪽 append를 조용히 버린다. 선언이 있어도 glob이 어긋나면 미적용이므로,
  검증은 파일 grep이 아니라 `git check-attr`이며 **실재 이름 하나와 아직 없는 이름
  하나**를 함께 묻는다. 그 검사는 단언(`C1-MERGE-UNION`)과 게이트
  (`C1-GATE-MERGE-UNION`) 두 층에 있다.
- **`cited_path`는 repo-relative로 정규화**한다. 절대경로를 실으면 §3.12가
  `v1.22.4-cwd-rebind`로 이미 한 번 되돌린 누출을 재도입한다. 정규화는 레지스트리
  **내부의 단일 초크 포인트**이고, 그 주장은 coverage gate의
  `APPROVED_REGISTRY_WRITERS`(원소 하나)가 지탱한다.

**아카이브는 work_unit을 바꾸지 않는다** — `slugFromPlanPath`가 basename만 취하므로
PRD를 `archived/`로 옮겨도 slug은 동일하다. slug이 갈리는 것은 파일명 자체가 바뀔
때뿐이고, 그때도 derive source가 **전 샤드를 스캔**하므로 옛 샤드가 계속 분모에
들어간다. 그 전 샤드 스캔은 명시 계약이다: "현재 slug만 읽기"로 좁혀지면 그 순간
분모가 조용히 줄어 **부풀리는 방향**이 열린다(`C1-SOURCE-WIRED`가 둘 이상의 샤드를
놓고 합산을 단언한다).

## 8. 유형 분리 계약 — 무엇이 틀렸었나

`computeC1`의 이전 무결성 검사는 `(deferred + downgraded + rejected) > 0`을
요구했다. 즉 **모든 finding이 실제로 고쳐진 작업 단위가 `invalid`로 판정됐다.**
무결성 요구는 "비해소가 존재해야 한다"가 아니라 "유형이 분리 기록되어야 한다"이므로
그 추론은 요구를 잘못 구현한 것이었고, 정정 없이는 이 milestone이 성공할수록 C1이
invalid가 된다.

정정: 소스가 유형별 카운트를 **계약으로 선언**했는지(`type_separation`)를 검사한다.
**그 선언은 상수가 아니라 파생값이다** — 소스가 리터럴 `true`를 하드코딩하면 계약
검사가 findings 소스에 대해 항진명제가 되고, 현행 추론이 (틀린 방향으로나마) 갖고
있던 런타임 반응성을 잃는다. 종결된 항목이 전부 5종 enum 안의 `closure_type`을
가질 때만 `true`이고, enum 밖 값이나 `closure_type` 없는 종결이 하나라도 있으면
`false`다.

두 실패는 이름을 나눈다 — `type_separation_undeclared`(계약 미선언)와
`type_separation_violated`(합이 전체를 넘음). 한 이름으로 접으면 진단이 사라진다.

**`degraded`는 `status`를 뒤집지 않는다.** 유실 표시가 붙은 C1은 여전히 `computed`
이고 그 사실은 `coverage`에 실린다 — 유실이 대부분 분자만 줄이는 보수적 방향이라
값이 하한으로서 유효하고, 계측 결함이 지표를 통째로 지우면 M2가 겪은 "산출 0개"로
되돌아간다. 대신 **배송 증거로는 쓰지 않는다**: `--acceptance`가 degraded를 거부한다.
두 층을 분리하지 않으면 둘 중 하나가 반드시 틀린다.

## 9. 이 milestone이 주장하지 않는 것

- **저자가 고친 것을 해소로 계상하지 않는다.** implement 중 흡수한 finding을 저자가
  스스로 닫는 경로는 **의도적으로 없다** — 그 경로를 만들면 자기신고가 곧 분자가 되어
  UI5가 막는 조작이 열린다. 그래서 이 milestone 자신의 C1은 `0/12`이며, 그 0은 결함이
  아니라 설계의 결과다.
- **coverage gate는 위조를 막지 않는다.** 겨냥 대상은 *우발적 미계측 emit 지점*이지
  repo write 권한을 가진 적대적 위조자가 아니다. 후자는 게이트 코드 자체를 고칠 수
  있으므로 in-repo gate로 원리상 방어 불가다. `--acceptance`도 마찬가지로 *건너뛰기*를
  막고 *위조*를 막지 않는다.
- **정적 lint는 동적 경로를 못 본다.** 여러 단계로 세탁된 경로, 런타임 결정 경로,
  `plugins/mccp/scripts` 밖, 셸 writer는 원리상 보이지 않는다. 그 축은 런타임
  falsifier가 담당하고, 그것도 표면 delta가 남는 경우에 한한다.
- **`cited_path`는 검증된 사실이 아니다.** 리뷰어가 주장한 값이며 환각이거나 무관한
  경로일 수 있다. 레지스트리는 그것을 **기록만 하고 열지도 실행하지도 해석하지도
  않는다** — 기계적 소비처는 2차 매칭 키 하나뿐이고 §4의 세 제약이 그 축을 막는다.
  승격은 그 경로를 작업 목록에 표면화할 뿐 권한을 주지 않는다.
