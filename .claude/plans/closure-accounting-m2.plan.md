# Plan: closure-accounting M2 — reseal-path

**Source PRD**: `.claude/prds/closure-accounting.prd.md`
**Selected Milestone**: 2 — reseal-path
**Complexity**: Medium

## Summary

M1은 격차를 **보이게** 만들었다(`closure report` → `denominator_gap`). M2는 그 격차를
**닫는 경로**를 만든다 — 기존 판정 1115건의 결속을 끊지 않고 재봉인하는 길이다. 답해야 할
질문은 PRD가 열어 둔 것 하나다: *승계인가 재키잉인가.* 이 plan은 **승계(append)** 를 택하고,
그 선택을 원장이 append-only라는 코드상의 사실로 정당화한다. 재봉인 1회를 실제로 수행해
`denominator_gap.count`가 0으로 떨어지는 것을 실측하고, 같은 실행이 `verify`의 `open`을
0에서 1700대로 **뒤집는다** — 그 뒤집힘이 결함이 아니라 이 milestone의 성공 신호다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 스냅샷 의미론을 바꾸지 않는다 — 봉인 결속(`inventory_sha256`)은 그대로 둔다 | constraint |
| UI2 | 판정(disposed)·해소(resolved)·수정(fixed)을 한 수로 접지 않는다 | constraint |
| UI3 | 리포트는 게이트가 아니다 — 격차가 크다고 진행을 막지 않는다 | constraint |
| UI4 | backlog 표에 상태 열을 추가하지 않는다 | exclusion |
| UI5 | 재봉인이 기존 판정 1115건의 결속을 끊지 않고 수행되는 경로가 생긴다 | direction |
| UI6 | 격차가 실제로 0으로 떨어지는 것이 1회 실측된다 | direction |
| UI7 | 승계 규칙과 재키잉 선례 중 어느 쪽을 따를지는 M2가 답한다 | direction |
| UI8 | 분모 밖 부채의 목표값을 날조하지 않는다 — 방어할 근거 없는 임계를 만들지 않는다 | exclusion |
| UI9 | 두 종결 계기를 통합하지 않는다 — 통합 여부는 M3의 enum 은퇴 결정과 묶여 있다 | exclusion |
| UI10 | M3 범위(`multi-agent`에서의 registry reachability)는 이 milestone에서 건드리지 않는다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Sanctioned re-seal + 원자적 재결속 | `plugins/mccp/scripts/migrations/v1.22.4-cwd-rebind.js:11-42` | dry-run 기본 · `--apply` 명시 · manifest/lock · "결속을 같은 run에서 다시 맺기 때문에 정당하다"는 헤더 선언 |
| Append-only 원장의 재판정 | `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:565-571` (`foldDispositions`) | "Latest line wins per item"(`:565-570`). 재판정은 덮어쓰지 않고 기록한다 — 두 판독이 모두 감사 가능하게 남는다" |
| 봉인 대상 범위 | 같은 파일 `:292-310` (`inventoryHash`) | 다이제스트는 `items[]` **만** 덮는다. `meta`는 밖 — 그래서 `meta`에 필드를 더해도 결속이 움직이지 않는다 |
| 정적 파일 신뢰 함정 | 같은 파일 `:456-486` (`checkSuccessor`) | "파일 존재만으로는 한 번 착지하면 영구히 참" — 그래서 successor가 봉인 sha를 **이름으로 부르게** 강제한다 |
| 읽기 실패 = null, 0 아님 | `plugins/mccp/scripts/lib/closure/report.js:345-357` | 판정할 수 없으면 `degraded[]` + `null`. 추측해서 숫자를 만들지 않는다 |
| 불변식만 동결하는 test | `plugins/mccp/scripts/lib/closure/tests/report.test.js:1-14` | 값이 아니라 구조·부등식·양방향 mutation을 단언 |
| 합성 fixture 저장소 | `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js:237-241` (`sealed()`) | 임시 repo를 만들어 `sealInventory`를 실제로 돌린다 — 라이브 저장소를 읽지 않는다 |
| CLI 종료 코드 규약 | `debt-inventory.js:745-747` | `EX_OK 0` · `EX_FAIL 1` · `EX_USAGE 2` |

## Design Decisions

> 저자 근거다. `## User Intent`에 넣지 않는다 — 리뷰어를 사용자 요구가 아니라 내 추론에
> 정박시키기 때문이다.

**DD1 — 승계는 append이지 재키잉이 아니다 (UI7의 답).** cwd-rebind 선례는 **파일명이 키인
저장소**를 다룬다: 그곳에서 결속이 끊기면 ledger 엔트리가 실제로 dangling이 되므로 같은 run에서
키를 다시 맺는 것 외에 길이 없다. 여기서 결속은 **JSONL 한 줄 안의 필드**이고 원장은 **로그**다.
1115줄의 `inventory_sha256`을 제자리에서 고쳐 쓰는 것은 인덱스 재키잉이 아니라 **로그 개작**이며,
"재판정은 덮어쓰지 않고 기록한다"(`:565-570`)를 정면으로 지운다. 그래서 옛 줄은 **한 글자도
건드리지 않고**, 승계 항목마다 새 sha에 결속된 줄을 **덧붙인다**. 승계는 재판정의 한 종류다 —
"새 분모 아래에서 이 항목의 판정을 그대로 물려받는다".

**DD2 — ancestry는 `meta`에 들어가므로 UI1이 지켜지지만, 그것만으로는 가드의 앵커를
서명 밖으로 옮기는 것이다 (L2 security HIGH · invariant HIGH 흡수).** `inventoryHash`는
`items[]`만 덮는다(`:292-310`). 그래서 `meta.supersedes` · `meta.ancestry`를 더해도
다이제스트는 움직이지 않고 결속 규칙도 한 줄 안 바뀐다 — UI1은 지켜진다. **그러나 그 사실의
반대편이 있다**: DD3의 조상 허용과 DD4의 `ok` 면제가 전부 `meta.ancestry`를 신뢰 입력으로
삼는데 그 필드는 서명 밖이므로, 임의 sha를 한 줄 더하면 `seal_intact: true`를 유지한 채 그
sha에 결속된 모든 줄이 `binding_mismatch`에서 빠져나간다. 그것은 `:428-431`이 이 결속의
존재 이유로 명시한 시나리오("delete the seal, seal again over a changed tree, and the old
lines would silently certify a different denominator")가 **그대로 통과**한다는 뜻이다.

따라서 **ancestry 항목은 선언으로 신뢰하지 않고 재계산으로 신뢰한다.** 어떤 sha가 조상으로
인정되려면 두 조건을 함께 만족해야 한다:

1. `docs/multi-session-work-loop/seals/debt-inventory-<sha12>.json` 아카이브가 실재한다.
2. 그 아카이브의 `items[]`를 `inventoryHash`로 **재계산한 값이 그 sha와 같다**.

**그리고 이 재계산만으로는 계보를 인증하지 못한다 (L2 R3 security·invariant MEDIUM 흡수).**
`inventoryHash`는 공개 순수 함수(`:295-310`)라 **아무 `items[]`나 쓰고 그 해시를 파일명으로
붙이면** 재계산 검사를 통과한다 — 그 아카이브가 실재했던 과거 봉인이라는 결속을 아무것도
요구하지 않는다. 초안이 Risks에 적은 "위조 비용이 '한 줄 편집'에서 '인벤토리 위조'로 오른다"는
**과장이었다**: 실제 비용은 "한 줄 + 자기생성 파일 한 개"였다.

그래서 조건이 하나 더 붙는다. **3. 그 아카이브 파일이 git-tracked여야 한다**
(`git ls-files --error-unmatch`). 디스크에 놓기만 한 파일은 조상이 될 수 없다.

**단 그 술어가 세우는 바는 인덱스 멤버십이지 커밋 이력이 아니다 (Plan-Codex R1 HIGH 흡수).**
초안은 여기서 "계보에 넣으려면 **커밋이 남는다**"고 적었는데 그것은 `git ls-files`가 재는 것이
아니다 — `git add` 한 번이면 통과하고 커밋은 하나도 남지 않는다. 정직한 진술은 이렇다: 이 술어가
올리는 것은 "디스크에 놓기만 한 파일"에서 **"인덱스에 올린 파일"** 까지이고, *커밋*은 이 술어가
아니라 `## Acceptance`의 **단일 커밋 규약**이 세운다(롤백 경로가 git뿐이라는 같은 이유에서다).
두 축을 한 문장으로 뭉치면 이 조건이 실제보다 강해 보인다. 여기까지가 정직하게 주장할 수 있는 전부다 —
위협모델은 §3.12와 같아(같은 권한으로 node를 돌리는 주체는 원장을 직접 쓴다) **위조는 여전히
막지 못한다.** 닫는 것은 드리프트·실수·조용한 재분류이며, 그 이상을 주장하지 않는다.
재계산·git 검사에 실패한 항목은 조상이 **아니며**, 그 sha에 결속된 줄은 `ancestor_bound`가
아니라 `binding_mismatch`로 남는다(fail-closed). 이 재계산이 Task 1의 형식 검사와 별개의 축이라는 점이 중요하다 — 형식 검사는
`sha256:<64hex>` 모양만 보고, 이 검사는 그 값이 실재하는 부채 집합을 가리키는지를 본다.

**DD3 — `checkSuccessor`의 조상 허용은 `succeeded_from`이 ancestry 안에 있을 때만이다.**
이 축이 없으면 M2는 성립하지 않는다: 판정 1115건 중 **983건이 `deferred`** 이고,
`validateDisposition`은 `deferred`마다 successor 문서가 **현재 봉인 sha를 이름으로 부를 것**을
요구하는데(`:478-484`), 세 successor 문서는 옛 sha만 담고 있다(각 1회 실측). 따라서 순진한 승계는
983건 전부 검증 실패한다.

해소는 두 갈래였고 하나는 틀렸다. **(a) 재봉인이 successor 문서에 새 sha를 자동으로 찍는다** —
그러면 `checkSuccessor`가 존재하는 이유("이 사이클에 실제로 편집되어 인계를 수락했다")가 공허해진다.
**(b) 조상 sha를 허용한다** — successor는 자기가 인계를 수락한 그 봉인을 이름으로 불렀고 그 사실은
여전히 참이다. (b)를 택한다.

단, (b)를 무조건 허용하면 `:456-463`이 경고한 "한 번 착지하면 영구히 참" 함정이 되살아난다.
그래서 조상 허용은 **줄에 `succeeded_from`이 있고 그 값이 봉인 doc의 `ancestry`에 실재할 때만**
적용된다. 손으로 쓴 **새** deferral은 여전히 현재 sha를 불러야 한다 — 마찰은 신규에 대해 그대로
남고, 이미 한 번 치른 마찰만 다시 청구하지 않는다. `succeeded_from`을 임의 값으로 적어 아무 파일이나
successor로 만드는 경로는 ancestry 대조가 닫는다.

**DD4 — `binding_mismatch`를 `ancestor_bound`와 분리하지 않으면 재봉인은 즉시 거짓 경보를 낸다.**
`verifyDispositions:596-599`은 현재 sha가 아닌 모든 줄을 `binding_mismatch`로 센다. 재봉인 직후
옛 1115줄이 전부 거기 떨어지고, 그 필드가 잡으라고 만들어진 것 — *봉인을 지우고 바뀐 트리 위에
다시 봉인해 옛 줄이 다른 분모를 조용히 인증하는 것* — 과 **역사적 정상 상태**가 한 수로 뭉개진다.
따라서 조상 sha에 결속된 줄은 `ancestor_bound_lines`로 따로 세고, `binding_mismatch`는
**ancestry에도 없는 sha**만 남긴다. 그래야 그 필드가 계속 무언가를 잡는다.

**DD5 — dry-run이 기본이고 `--apply`가 명시여야 한다.** `sealInventory`는 재봉인을 설계상 거부한다
(`:394-402`). 그 거부를 우회하는 도구가 손쉽게 불릴 수 있으면 거부가 의미를 잃는다. cwd-rebind와
같은 자세를 취한다.

**DD6 — 분모에서 탈락하는 항목을 보고하지 않으면 재봉인은 판정된 부채를 조용히 지우는 장치가 된다.**
실측: 봉인 1115건 중 **14건이 라이브에 없다**(`sealed_not_live`). 그중 **13건이 `deferred`** —
즉 일이 끝난 것이 아니라 정체성이 바뀌었거나(backlog 행 편집 → `rowId`는 행 내용 해시,
`backlog.js#rowId`) 레지스트리에서 닫혔다(수집기가 `state === 'open'`만 담는다). 재봉인은 이들에게
승계 줄을 쓰지 않는다 — 새 분모에 없는 항목에 판정을 붙일 수 없기 때문이다. 대신 **탈락 목록을
출력과 문서에 남긴다**. 편집으로 정체성이 바뀐 행은 새 item_id로 미판정 상태가 되고, 그것이 옳다
(다시 판정받아야 한다) — 그러나 그 사실이 어디에도 안 보이면 재봉인이 곧 세탁이 된다.

**DD7 — 재봉인 후 `verify`가 `open: 0` → `open: ~1700`, `ok: false`로 뒤집히는 것은 성공이다.**
이 PRD의 `## Problem`이 지목한 "성공 방향 기본값"이 바로 그 `open: 0`이다. 뒤집힘을 막으려고
승계 범위를 넓히는 것은 문제를 되돌리는 것이다. 소비처 영향은 실측했다 —
`m10-coverage-gate.js`를 부르는 것은 **합성 fixture를 쓰는 test 1개뿐**이고 워크플로 6개 중
0개다(PRD Evidence와 일치). 라이브 재봉인으로 붉어지는 test는 없다.
`handoff-items.js#suppressedFindingIds`와 `derive/sources/backlog.js#countDisposed`는 둘 다
현재 sha 결속으로 필터하므로 승계 줄을 그대로 읽는다 — 억제와 집계가 끊기지 않는다.

**DD8 — 이 재봉인은 M10 완료 판정의 HEAD 재현성을 끝낸다.** 아카이브된 M10 PRD는 완료를
`m10-coverage-gate.js` exit 0으로 판정했다. 재봉인 후 그 게이트는 같은 트리에서 exit 1이다.
숨기지 않고 **옛 봉인을 아카이브로 보존**해 그 판정이 어느 다이제스트 위에서 성립했는지 사후
대조가 가능하게 남기고, 그 사실을 문서에 적는다.

**DD9 — successor 자격은 경로 목록이 아니라 명시 수락 마커로 정한다 (L2 R3 architect·security·invariant HIGH 만장일치 흡수).**

초안의 DD9는 `seals/` 아래와 `debt-inventory.json`을 **거부 목록**으로 두고 "한 줄이고 그 축을
완전히 닫는다"고 적었다. **그 주장은 반증됐다.** `checkSuccessor`의 통과 조건은
`body.indexOf(inventorySha) !== -1` 하나뿐이라(`:477`), 봉인 sha를 본문에 담는 **모든** 커밋
파일이 successor 자격을 얻는다. 리뷰어가 실측으로 든 반례가 셋이다:

- 이 plan **자신의** Task 9 산출물 `.claude/_meta/data/2026-09-08-closure-reseal-live.json` —
  `closure report --json`을 통째로 담고 그 출력은 `report.js:505`가 `seal.inventory_sha256`을
  full sha로 싣는다.
- `docs/multi-session-work-loop/debt-dispositions.jsonl` — **모든 줄**이 현재 sha를 담는다.
- M1이 이미 커밋한 `.claude/_meta/data/2026-09-08-closure-baseline.json` — full sha 1건(grep 실측).

즉 **열거식 술어로는 이 축을 닫을 수 없다.** 파일이 늘 때마다 구멍이 늘고, 그중 둘은 이
milestone이 스스로 만든다.

**그래서 통과 조건의 모양을 바꾼다.** successor 문서는 봉인 sha를 *어딘가에 담는* 것이 아니라
**명시적으로 수락을 선언**해야 한다 — 전용 마커 한 줄:

```
<!-- accepts-inventory: sha256:<64hex> -->
```

`checkSuccessor`는 `indexOf` 대신 이 마커를 앵커 정규식으로 찾는다. sha를 우연히 담은 리포트
JSON·원장·기준선은 이 모양이 아니므로 통과하지 못하고, 마커를 넣는 행위는 사람이 인계를
수락했다는 **의도의 표현**이라 `:456-463`이 요구한 마찰이 그대로 산다. 거부 목록과 달리 이것은
**클래스를 닫는다** — 새 파일이 생겨도 구멍이 늘지 않는다.

**비용**: 기존 successor 문서 3건에 마커 한 줄씩 추가한다(M2 범위). 그 편집이 곧 재수락이다.

**DD9-b — 승계는 조상 *집합*에 대해 검증한다. 그러지 않으면 이 설계는 1회성이다
(L2 R3 architect HIGH 흡수).** 초안은 승계 줄을 `checkSuccessor(..., rec.succeeded_from)`로
검증하고 `succeeded_from`을 **직전** sha로 덮어썼다. 2차 재봉인에서 그 값은 1세대 sha가 되는데
successor 문서의 마커는 **최초** sha를 담으므로 983건이 전부 거부되고, `appendDispositions`의
all-or-nothing(`:551-555`)이 배치 전량을 반려한다 → 새 봉인만 착지하고 승계 0건. **다음 사이클이
붙을 이음매가 없다.**

따라서 승계 줄의 successor 검증은 **검증된 조상 sha 집합 ∪ {현재 sha}** 중 **하나라도** 마커로
수락돼 있으면 통과한다. `succeeded_from`은 조회 키가 아니라 **어느 세대에서 왔는지의 출처 기록**이
된다. 마커가 최초 sha를 담고 그 sha가 계보에 남아 있는 한 N세대까지 합성된다. 이 완화가
안전한 이유는 조상 집합이 DD2의 검증을 통과한 것들뿐이기 때문이다 — 임의 sha가 아니다.


## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/reseal.js` | CREATE | 승계 오라클(순수) + apply + CLI. 재봉인 로직 전부를 여기 둔다 |
| `plugins/mccp/scripts/lib/tests/msw-reseal.test.js` | CREATE | 합성 fixture 위 불변식 test (msw-metrics test는 `lib/tests/`에 산다) |
| `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` | UPDATE | DD3 조상 규칙 · DD9 경로 술어 · DD4 `ancestor_bound_lines` 분리 · `sealAncestry` (형태+재계산) · `appendDispositions`가 `succeeded_from`/`originally_disposed_at`를 통과시키고 `ancestry`를 `validateDisposition`에 전달 |
| `plugins/mccp/scripts/lib/closure/report.js` | UPDATE | `reseal_warning` 문구가 "M2 소유"라고 말한다 — 더는 참이 아니다. `seal.ancestry_depth` 표기 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | UPDATE | 위 두 변경에 대한 단언 추가 |
| `docs/multi-session-work-loop/debt-deferred-{critical,high,minor}.md` | UPDATE | DD9 수락 마커 한 줄씩 — 그 편집이 곧 재수락이다 |
| `.claude/state/reseal-manifest.json` | CREATE (실행 산출) | 재진입 판별자. 없으면 재봉인 미시작(fail-closed) |
| `docs/multi-session-work-loop/debt-inventory.md` | UPDATE | 재봉인 절 · 승계 규칙 · 탈락 항목 · DD8 재현성 고지 |
| `.claude/prds/closure-accounting.prd.md` | UPDATE | M1 `in-progress` → `complete`(PR #187로 착지 실측) · M2 → `in-progress` + Plan 셀 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래 한 줄 (공유 파일 — 충돌 시 해소가 싸다) |
| `docs/multi-session-work-loop/seals/debt-inventory-f171a42e.json` | CREATE (실행 산출) | 옛 봉인 아카이브. DD8 재현성의 유일한 근거 |
| `.claude/_meta/data/2026-09-08-closure-reseal-live.json` | CREATE (실행 산출) | UI6 실측 증거 — 재봉인 전/후 `closure report` 출력 |

## Tasks

### Task 1: `ancestry` — 봉인 doc의 조상 사슬 판독
- **Action**: `debt-inventory.js`에 `sealAncestry(repoRoot, doc)` 추가 — 두 단계다.
  1. **형태**: `meta.ancestry` 배열(없으면 `[]`). `sha256:<64hex>` + 중복 없음 +
     **자기 자신 미포함**. 어긋난 항목은 조용히 버리지 않고 배열 전체를 `null`로 접는다
     (판정 불가 = 조상 허용 미적용, fail-closed).
  2. **재계산** (DD2): 각 sha마다 `seals/debt-inventory-<sha12>.json`을 읽어
     `inventoryHash(archived.items)`가 그 sha와 **같은지 확인한다**. 아카이브가 없거나 해시가
     어긋나면 그 항목은 조상이 **아니다** — 배열에서 제외하고 `unverified[]`에 담아 호출자가
     보고할 수 있게 한다. 서명 밖 필드를 선언만으로 신뢰하면 DD2가 지적한 대로 한 줄 편집이
     `binding_mismatch` 면제를 사 온다.
  3. **git-tracked** (DD2, L2 R3 흡수): 아카이브가 `git ls-files --error-unmatch`를 통과해야
     한다. 재계산만으로는 자기생성 파일이 통과하므로 — `inventoryHash`는 임의 `items[]`에
     대해 해시를 내는 순수 함수다 — 계보에 넣으려면 커밋이 남아야 한다는 조건을 붙인다.
- **반환**: `{ verified: [...], unverified: [...] }` 또는 형태 실패 시 `null`.
  `verified`만 DD3의 조상 허용과 DD4의 `ok` 면제에 쓰인다.
- **Mirror**: `report.js:345-357` — 판독 불가는 0이 아니라 null
- **Validate**: 정상/빈/오염 3형태 → `[]`·`[..]`·`null`. **그리고** ancestry에 sha를 한 줄
  더했지만 대응 아카이브가 없는 fixture에서 그 항목이 `verified`에 **들어가지 않는 것**

### Task 2: `checkSuccessor` 조상 허용 (DD3)
- **Action**: `validateDisposition(repoRoot, rec, index, inventorySha, ancestry)` — 5번째 인자 추가
  (기본 `[]`이라 기존 호출자 무영향). `rec.succeeded_from`이 비어 있으면 **현행 동작 그대로**.
  값이 있으면 (a) `ancestry`가 `null`이면 거부, (b) `ancestry`에 없으면 거부
  (`succeeded_from names a seal this inventory does not descend from`), (c) 있으면
  `checkSuccessor(repoRoot, rec.successor, rec.succeeded_from)`.
- **DD9 수락 마커 (같은 함수, 같은 커밋)**: `checkSuccessor`의 통과 조건을 `body.indexOf(sha)`에서
  **앵커 정규식**으로 바꾼다 — `<!--\s*accepts-inventory:\s*(sha256:[0-9a-f]{64})\s*-->`.
  sha를 우연히 담은 파일(리포트 JSON · `debt-dispositions.jsonl` · 기준선 JSON · 봉인 아카이브)은
  이 모양이 아니라 통과하지 못한다. 열거식 거부 목록이 **왜 안 되는지**는 DD9에 있다.
  **기존 successor 3건에 마커 한 줄씩 추가**한다(`debt-deferred-{critical,high,minor}.md`) —
  그 편집이 곧 재수락이고 `:456-463`이 요구한 마찰이다.
- **DD9-b 조상 집합 검증**: 승계 줄(`succeeded_from` 있음)은 **검증된 조상 sha ∪ {현재 sha}**
  중 하나라도 마커로 수락돼 있으면 통과한다. `succeeded_from`을 조회 키로 쓰면 2차 재봉인에서
  전량 거부되어 설계가 1회성이 된다(DD9-b). 신규 deferral(마커 없음)은 **현재 sha**를 요구한다 —
  마찰은 신규에 대해 그대로다.
  **세 변경은 단일 커밋 불변식이다**: 조상 허용만 착지하고 마커·집합 검증이 빠지면 마찰이 사라지거나
  승계가 통째로 거부된다.
- **Mirror**: `debt-inventory.js:478-484`의 거부 문구 톤 — *왜* 거부하는지를 한 문장으로 적는다
- **Validate**: (a) `succeeded_from`이 ancestry에 없는 줄이 `deferred` 검증에서 거부된다
  (b) sha를 **본문에 담기만 한** 파일(리포트 JSON fixture)이 successor로 거부된다 — 마커가 없으므로
  (c) 마커가 **최초** sha만 담은 successor로 **2세대** 승계 줄이 통과한다 (DD9-b 합성 회귀)
  (d) 신규 deferral(마커 없음·`succeeded_from` 없음)이 조상 sha 마커만으로는 통과하지 **못한다**

### Task 3: `verifyDispositions`의 결속 3분할 (DD4)
- **Action**: 루프에서 `rec.inventory_sha256 !== doc.inventory_sha256`일 때 그 sha가 ancestry에
  있으면 `ancestorBound`, 없으면 `boundMismatch`. 반환에 `ancestor_bound_lines` 추가.
  `ok` 식에서 `ancestor_bound_lines`는 **제외**한다(정상 상태이므로). `binding_mismatch`는
  `ok` 식에 그대로 남긴다.
- **ancestry 배선은 두 호출 지점 모두다 (L2 R3 test HIGH 흡수).** `verifyDispositions`는
  `validateDisposition(repoRoot, rec, index, doc.inventory_sha256)`를 **직접** 호출한다
  (`debt-inventory.js:602`, 4인자). 승계 줄은 **현재 sha 결속**이라 조상 `continue`(`:597-599`)에
  걸리지 않고 이 호출에 도달하므로, ancestry가 기본값 `[]`로 남으면 승계된 `deferred` 983건이
  전부 `invalid_disposition`이 된다 — Task 9의 `invalid_dispositions === 0`이 착지 직후 깨진다.
  `appendDispositions`와 `verifyDispositions` **양쪽 모두** ancestry를 전달한다.
- **주의**: `m10-coverage-gate.js#checkDispositions`는 자기 계산을 따로 하고 producer와 대조만
  하므로(`:144-148`) 이 필드를 읽지 않는다 — **그 파일은 건드리지 않는다**.
- **Validate**: 두 방향을 모두 본다. (a) 조상 결속 줄이 있는 fixture에서
  `binding_mismatch === 0 && ancestor_bound_lines > 0` — 과소허용 방향.
  (b) **과다허용 방향**: `meta.ancestry`에 대응 아카이브 없는 임의 sha를 한 줄 넣은 fixture에서
  그 sha 결속 줄이 `ancestor_bound`로 **빠져나가지 못하고** `binding_mismatch`에 남아 `ok:false`가
  되는 것. (b)가 없으면 Task 3은 `binding_mismatch`가 잡으라고 만들어진 시나리오를 통과시키는
  완화를 검증 없이 착지시킨다.
  (c) **합성 fixture에서 승계된 `deferred` 줄이 검증을 통과한다** — `invalid_dispositions === 0`.
  이 축은 Task 9의 라이브 1회 실행에만 걸려 있으면 안 된다(그때 깨지면 되돌릴 수 없다)

### Task 4: `reseal.js` — 순수 오라클 `planReseal(repoRoot)`
- **Action**: 쓰기 없이 계산만 한다. 반환:
  `{ ok, old_sha, new_sha, carried[], carry_blocked[], dropped[], unjudged_count, ancestry[], degraded[] }`.
  - `carried` = (옛 items ∩ 새 items) 중 folded disposition이 있고 **줄 안의 교차 참조가
    새 분모에서도 유효한** 항목 → 승계 줄 초안
  - `carry_blocked` = 항목 자신은 살아남았지만 그 줄이 참조하는 **다른 item_id**가 새 분모에
    없는 것 (L2 architect HIGH 흡수). 구체적으로 `disposition==='duplicate'`인데
    `duplicate_of`가 새 index에 없는 경우다 — `validateDisposition:502-504`가 twin의 존재를
    **새 doc 인덱스로** 요구하므로, 항목 자신의 생존만 보고 승계하면 그 줄은 append 이후에야
    `invalid_disposition`으로 드러난다. 게다가 `duplicate_of`는 봉인마다 `linkDuplicates`
    (`:277-289`)가 **재계산**하는 값이라 twin 매핑이 재봉인에서 달라질 수 있다.
    `carry_blocked` 항목은 승계하지 않고 **미판정으로 남긴다**(다시 판정받아야 한다) —
    임의로 twin을 갈아끼우는 것은 사람이 내린 판정을 기계가 고쳐 쓰는 것이다
  - `dropped` = 옛 items 중 새 items에 없는 것 + 그 disposition (DD6)
  - `unjudged_count` = 새 items 중 승계도 못 받고 판정도 없는 수 (재봉인 후 `open`이 될 값)
  - 어떤 소스든 판독 실패면 `degraded[]`에 담고 `ok:false` — 부분 재봉인 금지.
    오류 문구는 `report.js`의 `scrubPathsFromMessage`(`:36-79`)를 **재사용**해 절대경로를 접는다
    (L2 security MEDIUM 흡수) — 이 출력은 `.claude/_meta/data/`에 커밋되는 산출물이고,
    이 저장소는 이미 receipt 절대경로 leak으로 sanctioned re-seal을 한 번 치렀다(§3.12)
- **승계 줄 shape**: 옛 줄을 그대로 복사하되 `inventory_sha256` = 새 sha,
  `disposed_at` = now, `succeeded_from` = 옛 sha, `originally_disposed_at` = 옛 `disposed_at`,
  `note` = `carried forward by reseal from <old sha>`. **`disposition`·`evidence`·`successor`·
  `duplicate_of`는 원본 그대로** — 판정 내용을 새로 만들지 않는다.
- **Mirror**: `report.js`의 `buildClosureReport` — 순수 함수 + `degraded[]`, throw 없음
- **Validate**: 합성 fixture에서 `carried + carry_blocked + dropped === 판정된 옛 항목 수`가 항상 성립

### Task 5: `reseal.js` — `applyReseal(repoRoot, {apply})`
- **선행 조건**: `planReseal(repoRoot).ok !== true`이면 **아무것도 쓰지 않고 exit 12**.
  Task 4의 fail-closed가 `planReseal` 안에서만 선언되고 apply 경로에 배선되지 않으면,
  소스 판독 실패 상태에서 새 봉인이 착지해 판독하지 못한 부채가 조용히 새 분모에서 사라진다.
- **Action**: 순서는 **manifest → 아카이브 → 조상 신뢰 확립·검증 → 새 봉인 → 승계 append**.
  0. **manifest를 먼저 쓴다** (L2 R3 invariant MEDIUM 흡수) —
     `.claude/state/reseal-manifest.json`에 `{old_sha, new_sha, carried_item_ids[], started_at}`.
     초안은 "재실행하면 3만 완료된다"고 적었지만 **판별자가 없었다**: 재진입 시 `planReseal`이
     읽는 `debt-inventory.json`은 이미 **새** 봉인이므로 `old_sha`가 그 새 sha가 되고 결속된
     disposition은 0건이며, 라이브 부채는 매 append마다 움직여 목표 sha를 재현할 수도 없다 →
     판정 1115건이 승계 없이 유실되고 append-only라 되돌릴 수 없다. manifest가 있으면 재진입은
     **라이브를 다시 만들지 않고** manifest의 `new_sha`·`carried_item_ids`로 3단계만 완료한다.
     이것이 `v1.22.4-cwd-rebind.js`의 manifest 선례를 실제로 적용한 것이다(초안은 인용만 했다).
  1. 옛 `debt-inventory.json`을 `docs/multi-session-work-loop/seals/debt-inventory-<oldsha12>.json`로
     복사(이미 있으면 내용 동일성 확인 후 통과 — 멱등).
  1b. **아카이브를 인덱스에 올리고, 조상으로 실제로 해소되는지 확인한 뒤에야 다음으로 간다**
     (Plan-Codex R1 HIGH 흡수). `git add <archive>` 후 `sealAncestry`를 **조립 예정인 새 doc의
     ancestry로 미리 돌려** 옛 sha가 `verified`에 들어오는지 본다. 안 들어오면 **exit 12로 중단**한다.

     초안에는 이 단계가 없었고, 그 부재가 최초 재봉인을 구조적으로 실패시킨다: Task 1 조건 3이
     아카이브의 git-tracked를 요구하는데 1단계는 **복사만** 하므로 갓 만든 아카이브는 untracked다 →
     옛 sha가 `unverified`로 떨어짐 → DD3의 조상 허용 미적용 → 승계 `deferred` 983건이
     `checkSuccessor`에서 전부 거부 → `appendDispositions`의 all-or-nothing이 배치를 반려.
     그 시점에 **새 봉인은 이미 착지해 있다**. 즉 UI5가 금지하는 바로 그 상태(결속이 끊긴 재봉인)로
     끝나고, manifest 재진입도 같은 거부에 다시 걸려 수습하지 못한다.

     이 검사를 **봉인 교체 앞**에 두는 것이 핵심이다 — 여기까지 파괴적 변경은 0건이므로(manifest와
     복사본 하나뿐) 중단이 곧 안전한 원복이다. 검사 자체는 새 술어가 아니라 Task 1이 이미 정의한
     `sealAncestry`를 그대로 부르는 것이다: 나중에 판정할 것을 **미리 같은 함수로** 판정한다.
  2. 새 doc 조립: `meta.supersedes = {inventory_sha256, sealed_at, sealed_at_commit, archived_at}` ·
     `meta.ancestry = [...옛 ancestry, 옛 sha]`. tmp+rename로 원자 write.
  3. 승계 줄 append — **`appendDispositions`를 통해서만** (L2 architect HIGH 흡수).
     초안은 여기서 직접 `fs.appendFileSync`를 쓰려 했다. 그러면 검증 초크포인트를 우회해
     **미검증 줄 1101건**을 되돌릴 수 없는 append-only 원장에 쓰게 되고, `:551-555`가
     자기 존재 이유로 적어 둔 all-or-nothing("a partially applied batch leaves the ledger
     in a state no one asked for, and the ledger is append-only so it cannot be undone")을
     정면으로 지운다. Task 5가 `sealInventory`를 부르지 않는 것은 논증했지만(재봉인 거부가
     설계이므로) `appendDispositions`를 부르지 않을 이유는 **없다** — 그 함수의 거부 조건은
     승계 줄에 전부 정당하게 적용된다.
     **멱등**: append 전에 원장을 읽어 `(item_id, 새 sha)` 쌍이 이미 있는 줄은 records에서
     제외한다(전량 거부 규약을 건드리지 않도록 호출 **전에** 거른다).
- **부분 실패의 성질을 명시**: 2까지 하고 3에서 죽으면 `verify`가 `open`을 크게 보고한다(시끄럽다).
  재실행은 **manifest를 먼저 읽는다** — `new_sha`가 디스크의 봉인과 일치하면 그것이 내 목표이므로
  라이브를 다시 만들지 않고 `carried_item_ids`로 3단계만 완료한다. manifest가 없으면 재봉인은
  **시작하지 않는다**(fail-closed) — 목표를 식별할 수 없는 재진입이 곧 판정 유실 경로다.
  이것이 이 도구가 `sealInventory`를 호출하지 않고 doc을 직접 조립하는 이유다.
- **Mirror**: `v1.22.4-cwd-rebind.js`의 순서 논증("모든 crash window가 결속 1개 이상을 남긴다")
- **Validate**: (a0) **최초 재봉인 경로** — 아카이브가 하나도 없는 fixture에서 `--apply`가
  완주하고 승계가 착지하는 것. 그리고 1b의 `git add`를 제거하면 그 test가 red가 되는 것
  (양방향 mutation — 이 축이 test 없이 라이브 1회 실행에만 걸려 있던 것이 R1이 지적한 바다).
  (a) 2단계 착지 후 3단계에 강제 throw를 넣은 fixture에서 재실행이 manifest로
  목표를 식별해 승계를 완료하고 `open`이 승계분만큼 줄어드는 것 — "수습한다"를 단언만 하지 않고
  **메커니즘을 실행해** 확인한다. (b) manifest를 지운 뒤 재실행하면 **거부**되는 것(fail-closed).
  (c) **완주 후 재실행이 신규 줄 0건**을 만드는 것 — 멱등 필터의 정방향 회귀
  (L2 R3 test MEDIUM 흡수; 되돌릴 수 없는 원장에 이중 append가 없음을 보인다)

### Task 6: `reseal.js` CLI — dry-run 기본 (DD5)
- **Action**: `plan` (기본, 쓰기 0) · `apply --apply` · `--json` · `--repo-root`.
  `--apply` 없이 부르면 `planReseal` 결과를 출력하고 exit 0. `apply`인데 `--apply` 플래그가
  없으면 exit 2(usage)와 함께 "재봉인은 명시 동의를 요구한다"를 말한다.
- **Mirror**: `debt-inventory.js:745-747` 종료 코드 · `:775-787` USAGE 문자열 형태
- **Validate**: `node plugins/mccp/scripts/lib/msw-metrics/reseal.js` 가 쓰기 0으로 끝난다
  (`git status --short`가 실행 전후 동일)

### Task 7: `closure report`의 재봉인 문구 정정
- **Action**: `report.js`의 `resealWarning`이 "Re-sealing is M2 responsibility"라고 말한다 —
  M2가 착지하면 거짓이다. 새 문구는 **경로를 가리키되 자동 실행을 권하지 않는다**:
  격차 수와 함께 `node plugins/mccp/scripts/lib/msw-metrics/reseal.js`(dry-run)를 안내하고,
  승계가 덮지 못하는 것(탈락 항목)을 한 문장으로 적는다. `seal`에 `ancestry_depth` 추가.
- **UI3 준수**: 문구만 바뀐다. `closure report`는 여전히 게이트가 아니고 exit 0이다.
- **Validate**: `report.test.js`에 "gap>0이면 warning이 reseal 경로를 이름으로 부른다" 단언

### Task 8: 문서 · PRD · CHANGELOG
- **Action**: `debt-inventory.md`에 `## Re-sealing` 절 — 승계 규칙(DD1·DD3) · `ancestry` ·
  탈락 항목(DD6) · `open`이 뒤집히는 것이 성공이라는 것(DD7) · M10 판정 재현성 고지(DD8).
  기존 "Re-sealing is refused" 문장(`:84-85`)과 "Re-sealing is M2's scope"(`:120`)를 정정한다.
  PRD 표에서 M1 → `complete`, M2 → `in-progress` + Plan 셀. CHANGELOG `## [Unreleased]`에 한 줄.
- **Validate**: `grep -n "Re-sealing is refused" docs/multi-session-work-loop/debt-inventory.md` 가 0건

### Task 9: 라이브 재봉인 1회 (UI6 — 이 milestone의 실제 산출)
- **Action**: 재봉인 **전** `closure report --json` 저장 → `reseal.js apply --apply --json` →
  **직후** `closure report --json` 저장. 셋을 `.claude/_meta/data/2026-09-08-closure-reseal-live.json`에
  하나의 문서로 봉인한다(`before` · `reseal` · `after` 3키).
- **읽는 법**: `after.denominator_gap.count === 0`이 목표다. 그러나 게이트가 그 사이에 부채를
  덧붙이면 0이 아닐 수 있다 — 그때는 **차이가 재봉인과 측정 사이의 append 수와 일치**함을 확인하고
  그 사실을 그대로 적는다. 0을 만들려고 다시 재봉인하지 않는다.
- **Validate**: 값이 아니라 **관계**를 단언한다. `after.seal.ancestry_depth ===
  before.seal.ancestry_depth + 1` · `binding_mismatch === 0` · `invalid_dispositions === 0` ·
  `ancestor_bound_lines === before.dispositions.total` (리터럴 `1115`가 아니다 — 원장은
  append-only라 재봉인 직전까지 줄이 늘 수 있고, PRD Risks가 "값은 단언하지 않는다 — 값은
  append마다 움직인다"를 이미 규약으로 세웠다)

## Validation

```bash
# 1. 신규 + 인접 test
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/msw-reseal.test.js \
  plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js \
  plugins/mccp/scripts/lib/closure/tests/report.test.js

# 2. 소비처 회귀 — 재봉인이 억제·집계를 끊지 않는지
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/derive/tests/backlog-source.test.js \
  plugins/mccp/scripts/state/tests/handoff-items.test.js

# 3. dry-run이 진짜 쓰기 0인지 (실행 전후 트리 동일)
git status --porcelain > /tmp/c11-before.txt
node plugins/mccp/scripts/lib/msw-metrics/reseal.js --json > /dev/null
git status --porcelain > /tmp/c11-after.txt
diff /tmp/c11-before.txt /tmp/c11-after.txt && echo "dry-run clean"

# 4. 재봉인 전 기준 — 이 값들이 Task 9의 before가 된다
node plugins/mccp/scripts/lib/closure/cli.js report --json
node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js verify

# 5. 승계 계획의 산술 (쓰기 없음)
node plugins/mccp/scripts/lib/msw-metrics/reseal.js --json \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
      console.log("carried",j.carried.length,"dropped",j.dropped.length,
        "carry_blocked",j.carry_blocked.length,
        "sum",j.carried.length+j.carry_blocked.length+j.dropped.length,
        "(판정된 옛 항목 수와 같아야 한다)");'

# 6. 라이브 재봉인 (Task 9 — 한 번만)
node plugins/mccp/scripts/lib/msw-metrics/reseal.js apply --apply --json

# 7. 재봉인 후 — 격차 0 · 조상 결속 정상 · 위조 결속 0
node plugins/mccp/scripts/lib/closure/cli.js report --json
node plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js verify

# 8. 문서 정정이 실제로 착지했는지
grep -n "Re-sealing is refused" docs/multi-session-work-loop/debt-inventory.md; test $? -ne 0

# 9. 버전 선언 금지 (§3.7 — 자식 브랜치는 번호를 선언하지 않는다)
node scripts/version-declaration-guard.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 승계가 `deferred` 983건에서 `checkSuccessor`에 걸려 전부 거부된다 | **확실 — 완화하지 않으면 M2가 성립하지 않는다** | Task 2(DD3). 세 successor 문서가 옛 sha만 담는 것을 실측 확인했다(각 1회). 조상 허용을 `succeeded_from` ∈ ancestry로 제한해 신규 deferral의 마찰은 보존 |
| 옛 1115줄이 `binding_mismatch`로 떨어져 거짓 경보를 낸다 | **확실** | Task 3(DD4). 조상 결속을 별도 필드로 분리하고 `ok` 식에서 뺀다 |
| 재봉인이 판정된 부채 14건을 조용히 분모에서 지운다 | HIGH | Task 4·8(DD6). 탈락 목록을 출력과 문서에 남긴다. 13건이 `deferred`(=미해소)라는 사실을 명시 |
| `succeeded_from`을 임의 값으로 적어 아무 파일이나 successor로 만든다 | MEDIUM | ancestry 대조(Task 2 (b)). 단 위협모델은 §3.12와 같다 — 같은 권한으로 node를 돌리는 주체는 원장을 직접 쓸 수 있다. 이 대조가 닫는 것은 **드리프트와 실수**이지 위조가 아니다 |
| 부분 실패로 봉인은 새것인데 승계 줄이 없다 | MEDIUM | Task 5의 순서 + 멱등 append. 이 상태는 `verify`가 크게 시끄럽고, 재실행이 3단계만 완료한다 |
| `meta.ancestry`가 봉인 밖이라 조상 허용의 앵커가 서명되지 않는다 | **HIGH — 부분 흡수** | DD2. 재계산 + **git-tracked** 2조건. 단 초안이 적었던 "위조 비용이 인벤토리 위조로 오른다"는 **과장이었고 정정했다** — 재계산은 자기충족적이라 계보를 인증하지 않는다. 실제로 닫는 것은 드리프트·실수이고 위조는 §3.12 위협모델대로 열려 있다 |
| sha를 본문에 담은 커밋 파일이 `checkSuccessor`를 무력화한다 | **HIGH — 흡수됨** | DD9. 열거식 거부 목록을 **수락 마커**로 교체 — 클래스를 닫는다. 초안의 경로 술어는 리뷰어가 반례 3건(이 plan의 Task 9 산출물 · `debt-dispositions.jsonl` · M1 baseline)으로 반증했다 |
| 승계가 2회차 재봉인에서 전량 거부돼 설계가 1회성이 된다 | **HIGH — 흡수됨** | DD9-b. 조상 **집합**에 대해 검증하므로 최초 sha 마커가 N세대까지 유효 |
| 재진입이 목표 봉인을 식별하지 못해 판정 1115건을 유실한다 | **HIGH — 흡수됨** | Task 5 step 0의 manifest. 없으면 재봉인 미시작(fail-closed) |
| `verifyDispositions`가 ancestry를 못 받아 승계 줄이 전부 invalid가 된다 | **HIGH — 흡수됨** | Task 3이 두 호출 지점을 모두 명시. 합성 fixture Validate (c)가 라이브 이전에 잡는다 |
| 승계 append가 검증 초크포인트를 우회한다 | **HIGH — 흡수됨** | Task 5 step 3이 `appendDispositions`를 통과하도록 고정. `reseal.js`에 직접 append가 0건임을 스캔으로 단언 |
| `duplicate` 승계 줄의 twin이 새 분모에 없어 `invalid_disposition`이 된다 | **HIGH — 흡수됨** | Task 4의 `carry_blocked[]`. 승계하지 않고 미판정으로 남긴다 — 기계가 사람 판정을 고쳐 쓰지 않는다 |
| 최초 재봉인에서 아카이브가 untracked라 조상 미검증 → 승계 983건 전량 거부 (봉인은 이미 교체됨) | **HIGH — 흡수됨** | Task 5 step 1b. 봉인 교체 **앞**에서 `git add` + `sealAncestry` 사전 검증, 불통과 시 exit 12(파괴적 변경 0건 지점). Validate (a0)이 아카이브 0건 fixture로 최초 경로를 덮고 `git add` 제거 mutation으로 비공허성 확인 |
| `git ls-files` 통과를 "커밋이 남는다"로 읽어 조건을 실제보다 강하게 주장한다 | **MEDIUM — 흡수됨** | DD2 정정. 그 술어는 **인덱스 멤버십**까지만 세우고, *커밋*은 `## Acceptance`의 단일 커밋 규약이 세운다. 두 축을 분리해 적었다 |
| 0 격차를 한 번도 관측하지 않고 M2를 완료로 선언한다 | **MEDIUM — 흡수됨** (UI6) | Acceptance에서 "0이 아니면 append 수와 일치함을 적는다" 퇴로를 제거. `after.denominator_gap.count === 0`이 필수이고, append가 끼어들면 재측정한다 |
| 완료된 재봉인을 되돌릴 수 없다 (원장 append-only) | MEDIUM | 롤백 경로는 git뿐이고 그 사실을 문서에 적는다. 재봉인을 **단일 커밋**으로 유지하는 이유 |
| 재봉인이 M10 완료 판정의 HEAD 재현성을 끝낸다 | MEDIUM | DD8. 옛 봉인을 아카이브하고 문서에 적는다. 판정을 되돌리지 않고 근거의 소재만 이전한다 |
| 아카이브 봉인이 누적돼 저장소가 부푼다 | LOW | 봉인 1건 ≈ 600KB. 현 시점 1건. 사슬이 길어지면 그때 정리 정책을 만든다 — 지금 만들면 근거 없는 규칙이다(UI8과 같은 선) |
| `closure report`가 게이트가 된다 | LOW | UI3. Task 7은 문구만 바꾼다. exit 0 불변 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation 1~9 전건 exit 0 (3번은 diff 무출력, 8번은 grep 미매치)
- [ ] Patterns mirrored, not reinvented — 특히 append-only 재판정 규약과 "판독 불가 = null"
- [ ] `## User Intent` 전건 미위반 — 특히 UI1(결속 불변: `inventoryHash`가 `items[]`만 덮는다는
      사실로 증명) · UI3(exit 0 불변) · UI8(임계 0개 추가)
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동):
      `.claude/_meta/data/2026-09-08-closure-reseal-live.json`이 `before`/`reseal`/`after` 3키로
      존재하고, `after.denominator_gap.count`가 **0이다**. 초안은 "0이 아니면 그 값이 append 수와
      일치함을 문서에 적는다"는 퇴로를 뒀는데, 그 퇴로는 **0을 한 번도 관측하지 않고 M2를 완료로
      선언할 수 있게 한다** — UI6이 요구한 것이 정확히 그 관측이므로 성립하지 않는다
      (Plan-Codex R1 MEDIUM 흡수). 측정 창은 재봉인 직전·직후로 좁혀 append가 끼어들지 않게
      만들고, 그래도 끼어들면 **재측정한다**. append 진단값은 계속 기록하되 0 관측의 대체물이
      아니다. `after` 시점의 `verify`가
      `binding_mismatch: 0` · `invalid_dispositions: 0` ·
      `ancestor_bound_lines === before.dispositions.total` · `open > 0`을 보고한다.
      **`open > 0`은 실패가 아니라 이 milestone이 만들려던 상태다**(DD7).
- [ ] 승계 줄이 판정 내용을 **새로 만들지 않았음** — `carried[]`의 각 줄이
      `disposition`·`evidence`·`successor`·`duplicate_of`에서 원본과 동일함을 test가 단언
- [ ] `carry_blocked[]`가 출력과 문서에 등장하고, 그 항목이 승계 줄을 **받지 않았음**을
      test가 단언 (H2)
- [ ] 승계 줄이 `appendDispositions`를 거쳤음이 test로 고정 — 검증을 우회하는 두 번째 writer가
      존재하지 않는다 (H1). `reseal.js`에 `appendFileSync` 직접 호출이 0건임을 스캔으로 단언
- [ ] 양방향 mutation으로 test 비공허성 확인: (a) 조상 허용을 끄면 `deferred` 승계 test가 red
      (b) `ancestor_bound_lines` 분리를 되돌리면 결속 test가 red
      (c) DD2의 재계산을 끄면 "아카이브 없는 ancestry 항목" test가 red
      (d) DD9 경로 술어를 빼면 "seals/ 아래 successor" test가 red
- [ ] **롤백 절차가 문서에 적혀 있다** (L2 invariant MEDIUM 흡수). 라이브 재봉인은 tracked
      파일 2개를 1회 파괴적으로 바꾸고 원장은 append-only라 승계 줄을 되돌릴 수단이 없다.
      되돌리는 유일한 길은 **git**이다 — `debt-inventory.md`에 그 사실과 되돌릴 커밋 범위를
      적는다. 이 재봉인을 단일 커밋으로 유지해야 하는 이유가 그것이다

## External Research Provenance

- Source PRD: .claude/prds/closure-accounting.prd.md
- References section sha256: f0e684f1fd00c5fe7ebd1b418efd2e119072b6364be46f4648e0827938702505
- Stamped at: 2026-09-08T06:34:31.348Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

- 트리거: `impeccable-detect` `design_signal=true`,
  `signal_files=["plugins/mccp/skills/frontend-design-direction/SKILL.md"]` (§3.9 axis b — 좁은 whitelist)
- **이 신호는 자기참조다.** 이 절이 직전 실행에서 그 SKILL 경로를 본문에 적었고 탐지기가 그것을 다시
  읽는다. 실질 근거는 그대로다 — `Files to Change` 12건 중 렌더링 표면(`.html`/`.jsx`/`.tsx`/`.css`)은
  **0건**이다(실측). 이 milestone은
  CLI 하나와 JSONL 원장 하나를 다루며 viewport를 만들지 않는다.
- SKILL first-step Read 완료: `plugins/mccp/skills/frontend-design-direction/SKILL.md`
  `## Output Constraints` 4항.
- round=0/2 verdict=**CONVERGED** (`decideCritique`, findings 0건)

| 제약 | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | pass | `^#{4,}` 매치 0건 |
| 강조색 화면당 1개 | n/a | accent token을 갖는 표면이 없다 |
| raw markdown marker 금지 | n/a | 산출물이 markdown 문서 자체이고 렌더 파이프라인을 거치지 않는다 |
| 한 화면 항목 수 상한 | n/a | `list-of-N`이 향하는 viewport가 없다. plan 문서의 표는 그 표면이 아니다 |

## Design Routing Guide

routing mode: auto (implement 단계에서 유효). plan 단계는 호출하지 않고 체크리스트로만 남긴다.
**이 milestone은 렌더링 표면을 만들지 않으므로 아래 표는 실제로 발화할 대상이 없다** —
오라클 출력을 그대로 기록해 두는 것이지 실행 지시가 아니다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed wrapper) via
  `plan-codex-runner.js` · `decision_id=closure-accounting-m2`
- 라운드 수: **2** (`MCCP_GATE_ROUND_CAP` 1 → 2로 상향, 사유는 아래 「라운드 회계」)
- 심판: `Task(mccp:intent-arbiter)`, `arbiter_mode=subagent` (§3.13.2 — 저자가 심판을 겸하지 않는다).
  arbiter는 파일 읽기 도구가 없고 whitelist 투영만 받는다 — 이 plan의 `## Design Decisions`에
  도달할 경로가 없다.
- 리뷰어 계약 준수: R1 `full`(3/3) · R2 `full`(2/2)
- **합치 결론: `divergent`.** R2 요약 원문: *"The index/commit distinction is substantially
  corrected, but reseal preflight remains weaker than append validation, and the zero-gap retry
  cannot recover from intervening debt."* R1의 흡수 하나(DD2 index/commit 구분)는 리뷰어가 직접
  성립을 인정했고, 두 축이 미흡수로 남아 receipt는 `divergent`를 그대로 봉인한다. 따라서
  cross-gate dedupe는 닫힌 채이고 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.

### 라운드 회계 (§3.16)

R1은 `ok`로 발화해 3건을 냈으나 **receipt를 남기지 못했다** — 저자가 리뷰와 write 사이에 plan
본문을 고쳤고 runner의 `intent_plan_digest` 가드가 "리뷰한 본문과 봉인할 본문이 다르다"로
거부했다(`exit 12`, `intent_gate_verdict=incomplete`). 절차 오류이지 리뷰 결과가 아니다.
cap이 소진된 상태에서는 재실행도 receipt를 낼 수 없다(`round-cap-reached`는 `stdout:''`이라
`parseReviewPayload`가 `null`을 반환하고 runner가 그 지점에서 조기 반환한다). 그래서 사용자
판단으로 cap을 2로 올려 R2를 발화했다. **R2가 마지막 라운드다** — 아래 미흡수 2건은 R3를 열지
않고 기록·이연한다(§3.16: 우선순위는 배포다).

### YAGNI Triage

| 라운드 | # | Severity | 리뷰어 INTENT | arbiter 판정 | Verdict | 처리 |
|---|---|---|---|---|---|---|
| R1 | F0 | HIGH | UI5 | `none` + dispute | ACCEPT_NOW | 본문 흡수 — DD2 정정 · Task 5 step 1b · Validate (a0) |
| R1 | F1 | MEDIUM | none | `none` (일치) | DEFER_TO_BACKLOG | backlog 적재 |
| R1 | F2 | MEDIUM | UI6 | `none` + dispute | ACCEPT_NOW | 본문 흡수 — Acceptance의 nonzero 퇴로 제거 |
| R2 | F0 | HIGH | UI5 | `none` + dispute | ACCEPT_NOW | **아래 「구속력 있는 수정」 A** (본문 동결) |
| R2 | F1 | MEDIUM | UI6 | `none` + dispute | DEFER_TO_BACKLOG | backlog 적재 |

- Deferred to backlog: **2** → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (auto-CRITICAL 0건)

### R1이 남긴 것

**R1-F0 (HIGH, 흡수됨)** — Task 1 조건 3이 아카이브의 git-tracked를 요구하는데 Task 5는 그것을
**복사만** 했다. 최초 재봉인에서 갓 만든 아카이브는 untracked이므로 옛 sha가 조상으로 인정되지
않고 → 승계 `deferred` 983건이 거부되고 → all-or-nothing이 배치를 반려하는데 **그 시점에 새
봉인은 이미 착지해 있다**. 부수 지적(`git ls-files`는 인덱스 멤버십이지 커밋 이력이 아니다)도
성립해 DD2를 정정했다. R2가 이 정정의 성립을 인정했다.

**R1-F2 (MEDIUM, 흡수됨)** — Acceptance가 "0이 아니면 append 수와 일치함을 적는다"는 퇴로를 둬
**0을 한 번도 관측하지 않고** 완료 선언이 가능했다. severity는 MEDIUM이지만 코드 품질이 아니라
UI6 준수 축이라 arbiter가 이연 대상이 아니라고 판정했다.

### 구속력 있는 수정 (본문 동결로 여기 기록한다)

R2의 두 지적은 **plan 본문이 아니라 이 절에 적힌다.** runner가 리뷰 시점에 본문 digest를
봉인하므로, 이 절 밖을 고치면 receipt를 다시 쓸 수 없고 그것은 R3를 여는 것과 같다. 이 절은
digest 가드가 명시적으로 허용하는 유일한 변경면이며(gate-injected review record),
**`/mccp:prp-implement`는 아래 A·B를 Task 5·Acceptance의 구속력 있는 수정으로 읽어야 한다.**

**A — R2-F0 (HIGH · ACCEPT_NOW). Task 5 step 1b는 선검증 술어가 사후 수락 술어보다 좁다.**
step 1b는 `old_sha`가 `verified`에 들어오는지만 본다. 그러나 실제 수락 술어는
`validateDisposition`이 승계 줄마다 적용하는 것이고, 그 줄들의 `succeeded_from`은 **더 오래된**
세대를 가리킬 수 있다(DD9-b가 조상 **집합**을 허용하기 때문에 정상 상태다). 2세대 이후 재봉인에서
직전 아카이브는 검증되는데 더 오래된 아카이브가 없거나 손상돼 있으면, step 1b는 통과시키고
`appendDispositions`가 **봉인 교체 뒤에** 배치를 반려한다 — R1-F0이 닫으려던 상태가 그대로 재현되고,
재시도로는 없는 아카이브를 만들 수 없다. **수정**: step 1b는 `old_sha` 확인이 아니라 **승계 예정
레코드 전건을 후보 inventory + verified ancestry에 대해 `appendDispositions`와 동일한 validator로
선검증**하고, 하나라도 해소되지 않으면 봉인 교체 **전에** exit 12한다. **Validate 추가**: 가장 오래된
아카이브가 없는 2세대 fixture에서 실패가 **현재 봉인을 보존**하는 것.

**B — R2-F1 (MEDIUM · DEFER_TO_BACKLOG). Acceptance의 "재측정한다"는 실행 불가다.**
`report.js:353-355`는 라이브 id 중 **고정된** 봉인 집합에 없는 것을 센다. inventory 수집과 측정
사이에 backlog 행이 하나 들어오면 재측정을 몇 번 하든 그 행은 계속 분모 밖이다 — 기다림은 그것을
봉인에 넣지 못하고, Task 9는 0을 얻으려는 재봉인을 금지한다. 즉 R1-F2 흡수가 퇴로를 없애면서
**도달 불가능한 기준**을 만들었다. 이연 항목이므로 M2 범위에서 고치지 않되, 구현자는 Acceptance의
"재측정한다"를 **문자 그대로 실행하려 하지 말 것**: 0 관측은 부채 writer가 없는 조용한 창에서
수행하고, 창이 깨지면 재측정이 아니라 **창을 다시 잡는다**. 실행 가능한 창 정의 또는 append 감지 시
재봉인-재측정 허용은 backlog 항목이다.

**두 라운드 모두에서 arbiter가 리뷰어 라벨을 dispute했다 (4건 중 4건).** 리뷰어 계약
(`codex-invoke.js:78-79`)은 `INTENT: UI5`를 "이 finding이 지적하는 **제안**이 UI5와 충돌함"으로
정의하고, 저자측 `intent_conflict`는 `intent-context.js:719`가 "**이 finding을 수용하면** 제약을
위반하는가"로 쓴다. 두 축의 방향이 반대라, 수용이 곧 제약 **집행**인 finding에 그 id를 적으면
`ACCEPT_NOW`와 결합해 "제약을 넘어서 수용했다"는 거짓 override 기록이 남는다. dispute 원문은
`meta.intent_mislabel_audit`에 봉인된다. 이 비대칭은 이 milestone이 만든 것이 아니며 backlog 대상이다.
