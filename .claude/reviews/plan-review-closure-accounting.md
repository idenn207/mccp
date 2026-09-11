# Plan Review Panel — closure-accounting

**Plan**: `.claude/plans/closure-accounting-m2.plan.md` · **Plan version**: `sha256:963c4bfe6fdb9c99160017b80cb5fd7111c1c044ab3e031dcc480a727227915f`
**Verdict**: `unavailable` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: plan changed after L2 read it: reviewed sha256:963c4bfe6fdb… but current is sha256:79e5148118ca… — recovery is to rerun L2 against the current plan, NOT to reseal (DD13)

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | DD9의 경로 술어는 자기가 닫겠다고 선언한 불변식을 담지 못한다 — 같은 plan의 Task 9가 만드는 커밋 산출물이 새 봉인 sha를 본문에 담아 checkSuccessor를 똑같이 무력화한다. 술어는 `seals/`와 `debt-inventory.json`만 거부한다(plan L136-138, L183-187). | Task 9는 `.claude/_meta/data/2026-09-08-closure-reseal-live.json`에 `after`의 `closure report --json`을 커밋한다(plan L157, L283-284). 그 출력에는 봉인 sha 전문이 실린다 — `closure/report.js:502-505` (`seal: { … inventory_sha256: inventorySha … }`). `checkSuccessor`의 통과 조건은 `body.indexOf(inventorySha) !== -1` 하나이고(`msw-metrics/debt-inventory.js:477-484`), successor 경로는 `classifyEvidence(..., {allowBarePath:true})`가 저장소 안 임의 경로를 허용한다(`debt-inventory.js:146-152`). 따라서 앞으로 어떤 deferral이든 `--successor .claude/_meta/data/2026-09-08-closure-reseal-live.json`으로 무제한 흡수가 통과한다 — DD9가 인용한 바로 그 경로(`:478-484`)가 커밋물로 다시 열린다. |
| architect | HIGH | 승계 줄의 `succeeded_from`을 '직전 sha'로 덮어쓰는 규칙 때문에 이 설계는 **1회성**이다 — 2차 재봉인에서 983건 deferred 승계가 전부 거부되고, append가 all-or-nothing이라 승계 batch 전체가 실패한다. 다음 사이클이 붙을 이음매가 없다. | plan L226-228: 승계 줄은 `succeeded_from = 옛 sha`(직전 봉인)로 덮어쓴다. Task 2(c)는 `checkSuccessor(repoRoot, rec.successor, rec.succeeded_from)`로 검증한다(plan L182). 그러나 successor는 사람이 쓴 원본 인계 문서이고 그 본문은 **최초** 봉인 sha만 담는다(plan L83: "세 successor 문서는 옛 sha만 담고 있다"). 2차 재봉인 시 `succeeded_from`은 1세대 sha가 되는데 문서 본문에는 그 sha가 없으므로 `debt-inventory.js:477-484`가 거부하고, `appendDispositions`의 all-or-nothing(`:551-555`)이 배치 전량을 반려한다 → 새 봉인만 착지하고 승계 0건. plan L252-253의 '재실행하면 3만 완료된다'는 결정적으로 같은 거부에 다시 걸리므로 성립하지 않는다. |
| security | HIGH | DD9의 경로 술어(`seals/` 아래 + `debt-inventory.json`만 거부)는 자기가 닫는다고 선언한 '무제한 deferral 흡수' 축을 실제로 닫지 못한다. plan 자신이 Task 9에서 커밋하는 `.claude/_meta/data/2026-09-08-closure-reseal-live.json`이 `after` 키로 `closure report --json`을 통째로 담고, 그 출력은 `seal.inventory_sha256`에 **현재 봉인의 full sha**를 싣는다(report.js:502-505, 그리고 warning 문자열 report.js:467). 그 파일은 `seals/` 밖이므로 술어를 통과하고, 앞으로 어떤 deferral이든 `successor=.claude/_meta/data/2026-09-08-closure-reseal-live.json`으로 쓰면 `checkSuccessor`의 `body.indexOf(inventorySha)`(debt-inventory.js:477-484)를 무조건 통과한다. 입력: 새 deferral 줄 1개. 결과: `:456-463`이 명시한 '한 번 착지하면 영구히 참' 함정이 마찰 0으로 부활. 더구나 이 경로는 이미 열려 있다 — M1이 커밋한 `.claude/_meta/data/2026-09-08-closure-baseline.json`이 full `sha256:<64hex>`를 1건 담고 있다(grep 실측 1건). 즉 술어를 '한 줄이고 그 축을 완전히 닫는다'(plan L138)고 주장한 것은 반증된다. | plan L129-141(DD9) · L183-188(Task 2) · L283-284(Task 9 산출물) vs plugins/mccp/scripts/lib/closure/report.js:502-505,467 및 plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:477-484; `.claude/_meta/data/2026-09-08-closure-baseline.json`에 full sha 1건 실재 |
| security | MEDIUM | DD2의 '재계산으로 신뢰한다'는 완화는 위조 비용을 주장만큼 올리지 않는다. Task 1의 검증은 `seals/debt-inventory-<sha12>.json`의 `items[]`를 `inventoryHash`로 재계산해 sha와 일치하는지만 본다 — 그 아카이브가 **실재했던 과거 봉인**이라는 어떤 결속도 요구하지 않는다(git 도달성·`sealed_at_commit` 검증·서명 없음). `inventoryHash`는 공개 순수 함수(debt-inventory.js:295-310)이므로, 임의의 `items[]` JSON을 하나 쓰고 그 해시를 계산해 파일명을 그 sha12로 지으면 그 sha는 '검증된 조상'이 된다. 따라서 '한 줄 위조에는 완전한 인벤토리 원본 위조가 필요하다'(plan L73-77)는 비용 주장은 성립하지 않고, 그 sha에 결속된 모든 줄이 `binding_mismatch`와 `ok` 식에서 빠져나간다(Task 3). Risks 표가 이 HIGH를 '흡수됨'으로 표기한 근거(plan L349)가 그만큼 약하다. | plan L67-78(DD2) · L162-172(Task 1) · L349(Risks) vs plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:295-310 (`inventoryHash`는 items[]만의 순수 sha256, 외부 결속 없음) |
| test | HIGH | Acceptance asserts `invalid_dispositions === 0` after the live reseal, but no task wires `ancestry` into the `validateDisposition` call inside `verifyDispositions`, and no Validate line tests that a carried `deferred` line survives verification. The single load-bearing new path (carried line bound to the NEW sha, `succeeded_from` set, successor naming only the ANCESTOR sha) is exercised nowhere except the one-shot live run in Task 9. | debt-inventory.js:602 `const v = validateDisposition(repoRoot, rec, index, doc.inventory_sha256);` — inside verifyDispositions, 4 args, no ancestry. Carried lines are current-sha bound so they do NOT hit the `continue` at :597-599 and DO reach this call; checkSuccessor (:477-484) then fails because the successor doc names only the old sha. The plan's `Files to Change` names only `appendDispositions가 … ancestry를 validateDisposition에 전달` (plan:150) and Task 3's Action/Validate cover only the binding 3-way split (plan:193-205). Task 3 Validate (a) `binding_mismatch === 0 && ancestor_bound_lines > 0` uses ancestor-bound (old-sha) lines, which short-circuit before validateDisposition — so that test passes whether or not this path works. |
| test | MEDIUM | DD7's consumer-continuity claim ('억제와 집계가 끊기지 않는다') is validated by test files that never see reseal output — they run their own synthetic fixtures, so they would stay green even if carried lines broke suppression/aggregation. | plan:303-306 names `derive/tests/backlog-source.test.js` and `state/tests/handoff-items.test.js` as the consumer-regression command, but neither consumes `reseal.js`; suppression is computed via `debt.suppressedFindingIds(cwd)` (handoff-items.js:155-156) over the live ledger, and no plan task builds a fixture where carried lines are the ledger content for these consumers. Additionally only resolving dispositions suppress (handoff-items.js:146-150), so 983 carried `deferred` lines are irrelevant to that suite — it cannot falsify DD7. |
| test | MEDIUM | Task 5's idempotence rule ('(item_id, 새 sha) 쌍이 이미 있는 줄은 제외') has no Validate line; the only Task 5 Validate covers a forced-throw resume, and re-running apply after a fully successful apply (the most likely operator action) is untested. | plan:250-256 — Action states the idempotence filter; `- **Validate**: 3단계 사이에 강제로 throw를 넣은 fixture에서 재실행이 상태를 수습하는 것`. No acceptance bullet covers double-apply producing 0 new lines against an append-only ledger that `:551-555` says cannot be undone. |
| invariant | HIGH | DD9의 경로 술어가 '그 축을 완전히 닫는다'는 주장은 거짓이다 — 같은 plan의 Task 9가 새 봉인 sha를 본문에 담은 커밋 파일을 하나 더 만들어, 무제한 deferral 흡수 경로를 스스로 다시 연다. | plan:138 "한 줄이고 그 축을 완전히 닫는다" / 술어 대상은 `seals/` 하위와 `debt-inventory.json` 뿐(plan:136-138, Task 2 plan:183-185). 그러나 Task 9(plan:281-284)가 커밋하는 `.claude/_meta/data/2026-09-08-closure-reseal-live.json`은 `closure report --json` 출력을 담고, 그 출력은 `report.js:505`에서 `seal.inventory_sha256`(full sha)를 그대로 싣는다. 따라서 `checkSuccessor`의 `body.indexOf(inventorySha)`(debt-inventory.js:477)를 그 파일이 영구히 통과시킨다 — `:478-484`가 명시한 "file existence alone would let any committed file absorb an unlimited deferral"이 그대로 성립한다. 같은 성질의 파일이 이미 하나 더 있다: `docs/multi-session-work-loop/debt-dispositions.jsonl`은 모든 줄에 현재 sha를 담으므로 재봉인 후에도 즉시 successor 자격을 얻는다. 술어를 열거식 2건으로 두는 설계 자체가 이 축을 닫지 못한다. |
| invariant | MEDIUM | DD2의 '위조 비용이 한 줄 편집에서 인벤토리 위조로 오른다'는 완화 주장이 성립하지 않는다 — 재계산은 자기충족적이라 계보를 전혀 인증하지 않는다. | plan:70-78 / Risks plan:349 "HIGH — 흡수됨 … 위조 비용이 '한 줄 편집'에서 '인벤토리 위조'로 오른다". 검사는 `seals/debt-inventory-<sha12>.json`의 `items[]`를 `inventoryHash`로 재계산해 그 sha와 같은지만 본다(Task 1, plan:166-170). `inventoryHash`(debt-inventory.js:295-310)는 임의의 items 배열에 대해 해시를 산출하므로, 공격자/드리프트는 아무 items 배열이나 담은 아카이브 파일을 쓰고 그 해시를 이름으로 붙이면 검사를 통과한다 — 현재 인벤토리와의 어떤 관계(부분집합·계보·순서)도 요구되지 않는다. ancestry 필드와 아카이브 파일 둘 다 서명(`items[]`) 밖이므로, `:428-431`이 결속의 존재 이유로 든 시나리오는 '한 줄 + 자기생성 파일 한 개'로 여전히 통과한다. 비용은 오르지 않았고 Risks 표의 '흡수됨' 등급은 근거가 없다. |
| invariant | MEDIUM | Task 5의 부분실패 복구(멱등) 주장에 판별자가 없다 — 2단계 착지 후 3단계 실패 시 재실행이 판정 1115건을 승계 없이 유실시키는 경로가 열려 있고, 그 경로는 append-only라 되돌릴 수 없다. | plan:252-254 "재실행하면 3만 완료된다 — 새 봉인이 이미 있으면 그 sha를 목표로 잡고 라이브를 다시 만들지 않는다". 그러나 재진입 시 `planReseal(repoRoot)`(Task 4, plan:207-209)이 읽는 `debt-inventory.json`은 이미 **새** 봉인이므로 `old_sha`가 그 새 sha가 되고, 그 sha에 결속된 disposition 줄은 0건이다(3단계 미완). '이미 착지한 봉인이 곧 내 목표'임을 식별하는 술어가 plan 어디에도 정의되지 않았고, 라이브 부채는 매 append마다 움직이므로(PRD:34-39) 라이브 재계산으로도 그 sha를 재현할 수 없다. Task 5의 Validate(plan:256)는 '재실행이 상태를 수습하는 것'을 단언만 하고 수습의 메커니즘을 명세하지 않는다. Risks plan:353은 이 상태에 롤백 경로가 git뿐임을 이미 인정한다. |
| invariant | LOW | 조상 허용의 배선이 `verifyDispositions`의 호출 지점에 명세되지 않아, 기본값 `[]`로 남으면 승계된 `deferred` 줄 전부가 `invalid_disposition`이 된다. | Task 2는 `validateDisposition(..., ancestry)` 5번째 인자와 '기본 []'를 정의하고(plan:178-179), Files to Change는 ancestry 전달을 `appendDispositions` 축으로만 적는다(plan:150). 그러나 `verifyDispositions`도 `validateDisposition(repoRoot, rec, index, doc.inventory_sha256)`를 직접 호출한다(debt-inventory.js:602). Task 3의 Action(plan:194-197)은 결속 3분할만 다루고 이 호출의 ancestry 전달을 언급하지 않는다. 누락 시 `succeeded_from`을 가진 승계 줄은 Task 2 (b) 분기로 거부되어 `invalid_dispositions > 0`가 된다. Acceptance(plan:369)가 사후에 잡지만, 태스크 명세 자체에는 없다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | plan이 인용한 코드 지점을 전부 열어 대조했다: `inventoryHash`의 items-only 범위(:292-310, DD2/UI1 논증 — 참), `foldDispositions`의 latest-line-wins(:565-571 — 참), `verifyDispositions`의 binding_mismatch 루프(:596-604 — 참), `appendDispositions`의 all-or-nothing과 rec shape(:525-563 — 참, succeeded_from/originally_disposed_at 미통과를 plan이 이미 Files to Change에서 인지), `sealInventory`의 재봉인 거부(:394-402 — 참), `m10-coverage-gate.js:144-148`이 자기 계산 후 producer와 대조만 한다는 주장(참 — ancestor_bound_lines를 읽지 않음). Task 5의 아카이브→봉인→append 순서와 ancestry 재계산 선후, 멱등 필터, carry_blocked의 duplicate twin 축(`:498-505`, `linkDuplicates:277-289`)도 공격했으나 결함을 찾지 못했다. 무너진 두 축은 (1) DD9 경로 술어의 커버리지가 같은 plan의 Task 9 산출물을 빠뜨린 것, (2) `succeeded_from` 덮어쓰기가 2회차 재봉인을 구조적으로 막는 이음매 부재다. |
| security | fail | 공격한 축: (1) `meta.ancestry`가 서명 밖이라는 자기 인정 위에 DD2 재계산이 실제로 무엇을 요구하는지 — `inventoryHash`가 순수 함수이고 아카이브가 과거 봉인임을 요구하지 않아 위조 비용 주장이 과장임을 확인. (2) DD9 경로 술어의 커버리지 — plan 자신의 Task 9 커밋 산출물과 M1의 baseline JSON이 full 봉인 sha를 담아 술어 밖에서 `checkSuccessor`를 무력화함을 실측(grep 1건). (3) 경로 traversal: Task 1이 sha 형태(`sha256:<64hex>`)를 재계산 **전에** 검사해 `seals/<sha12>` 경로를 조립하므로 traversal 경로는 찾지 못했다 — 지적하지 않는다. (4) `checkSuccessor`의 successor 경로 정규화: `classifyEvidence`가 `normalizeCitedPath`로 접고 repo 밖을 거부하므로(:139-151) `../` 우회는 성립하지 않아 보고하지 않는다. (5) 절대경로 leak: Task 4가 `scrubPathsFromMessage`를 재사용하고 `report.js`의 나머지 출력 필드는 repo-relative라 §3.12 재발 경로를 찾지 못했다. (6) `--apply` dry-run 기본·`appendDispositions` 초크포인트 우회: plan이 둘 다 명시 배선하고 스캔 단언까지 두어 결함 없음. |
| test | fail | Read the plan and PRD in full, then verified every cited line in debt-inventory.js (inventoryHash :292-310, sealInventory :391-402, checkSuccessor :456-486, validateDisposition :488-517, appendDispositions :525-563, foldDispositions :565-571, verifyDispositions :573-608) — the citations are accurate. Traced each new invariant to a Validate line: Task 1 (ancestry recompute), Task 2 (a)/(b) rejection directions, Task 3 (b) over-permissive direction, Task 6 dry-run write-count, Task 8 grep are all genuinely falsifiable and cover the dangerous direction. Attacked the tests-that-pin-the-bug angle on closure/tests/report.test.js (reseal_warning assertions at :1197-1198, :320, :581, :679) — Task 7 changes wording only and those assertions on count/sha survive, so no encoded-defect regression found there. Attacked m10-coverage-gate coupling (:144 reads verifyDispositions output and recomputes) — plan's 'do not touch' claim holds. The three gaps I could evidence are the verify-side ancestry wiring (no test would catch it before the live run), the consumer-regression suite that cannot falsify DD7, and untested apply idempotence. |
| invariant | fail | DD2의 ancestry 재계산이 서명 밖 앵커를 실제로 방어하는지(→ 자기충족적 검사로 반증), DD9 경로 술어가 열거식으로 축을 닫는지(→ Task 9 산출물과 debt-dispositions.jsonl이 같은 흡수 경로를 여는 것으로 반증), Task 2의 기본값 `[]`가 fail-open인지(→ fail-closed, 반증 실패), Task 1의 null 접기 방향(→ fail-closed, 반증 실패), Task 3의 `ok` 면제가 `unmatched`/`invalid` 축을 오염시키는지(→ :597-604 continue 순서상 무영향, 반증 실패), Task 5의 순서·멱등이 crash window를 실제로 덮는지(→ 재진입 판별자 부재로 반증), 그리고 verifyDispositions:602의 ancestry 배선 누락을 확인했다. `inventoryHash`가 `items[]`만 덮는다는 UI1 근거(:292-310)와 `foldDispositions`(:565-571) 인용은 실제 코드와 일치함을 확인했고 반증하지 못했다. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "unavailable",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 1443021,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:963c4bfe6fdb9c99160017b80cb5fd7111c1c044ab3e031dcc480a727227915f",
  "plan_path": ".claude/plans/closure-accounting-m2.plan.md",
  "receipt_hash": null,
  "recorded_at": "2026-09-08T07:00:03.115Z",
  "rounds": 3
}
```
