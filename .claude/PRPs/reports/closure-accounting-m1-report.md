# Implementation Report: closure-accounting M1 — closure-report

**Plan**: `.claude/plans/closure-accounting-m1.plan.md`
**Source PRD**: `.claude/prds/closure-accounting.prd.md` (우산 `harness-wiring-integrity`의 C11)
**Branch**: `c11-closure-accounting`
**Commit**: `9a20265`

## Summary

부채 종결을 재던 계기 셋(disposition ledger · findings-registry 이벤트 로그 · backlog 파서)이
서로 다른 분모 위에서 서로 다른 답을 내던 상태를, **새 계기를 만들지 않고** 하나의 read-only
출력으로 합쳤다. `closure report [--json]`은 실행 시점에 세 원장을 다시 읽어 봉인 분모와 라이브
부채의 격차, 봉인 나이, 두 계기의 불일치, 판정/해소/수정 3분할을 산출한다. 재봉인 없음 ·
상태 변경 없음 · 차단 없음.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (코드 3파일) — 다만 **검증 비용은 Small이 아니었다**(리뷰 3라운드) |
| Files Changed | 8행 (코드 3 · 문서 2 · 산출물 3) | 13 파일 / +2613 −2 |
| 신규 코드 | `report.js` · `cli.js` · `report.test.js` | 동일 (445 + 163 + 1147 줄) |
| Test | 불변식 동결 | 24종 + mutation 13종 전건 killed |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 순수 오라클 `report.js` | 완료 | `EMPTY` 규약 · reader별 throw 포착 · `degraded[]` 메시지 scrubbing |
| 2 | 재봉인 경고를 출력 안에 | 완료 | `reseal_warning`이 런타임 `seal.items`·`inventory_sha256` 둘 다 포함 |
| 3 | CLI 투영 `cli.js` | 완료 | table/json exit 0 · unknown subcommand exit 2 |
| 4 | 불변식 test | 완료 | (a)~(g) 전건. 24 pass / 0 fail |
| 5 | 한계를 문서에 | 완료 | `docs/multi-session-work-loop/debt-inventory.md` +34줄 |
| 6 | 라이브 1회 완주와 출력 보존 | 완료 | 산출물 보존 + **대조 결과는 아래 절이 소유** |

## Task 6 — 라이브 대조 결과

Task 6은 산출물 보존만이 아니라 "같은 실행 시점에 `debt-inventory`를 직접 호출해 얻은 값과
대조한 결과를 보고서에 적는다"를 요구한다. 그 대조는 두 번 수행됐다 — 최초 산출 시점과,
본 보고서 작성 시점의 재확인이다.

**보존된 산출물** — `.claude/_meta/data/2026-09-08-closure-report-live.json`
(**F1 흡수 후 재산출**. 이전 판은 길이 뺄셈으로 계산된 값이라 결함 있는 구현의 출력이었고,
milestone의 증거로 남길 수 없어 폐기하고 다시 냈다. 폐기된 판의 수치는 아래 측정 이력에 남는다.)

| 축 | 값 (2026-09-08T05:25:19Z) |
|---|---|
| `seal.sealed_at` / `sealed_at_commit` | `2026-09-01T01:21:41.049Z` / `9093b08` |
| `seal.items` (봉인 분모) | 1115 |
| `live.items` (라이브 부채) | 2806 |
| `denominator_gap.count` (**ID 기준 미봉인**) | **1705 (60.76%)** |
| `denominator_gap.net_change` (길이 차) | 1691 |
| `denominator_gap.sealed_not_live` | **14** |
| `degraded[]` | 없음 (세 원장 전부 판독) |

동시점 독립 재계산과 **세 값 전부 일치**한다(`count` 1705 · `sealed_not_live` 14 ·
`net_change` 1691). 이 대조는 이제 등식 하나가 아니라 셋이고, 그중 `count`와 `net_change`가
**갈라진다는 사실 자체**가 F1이 실재했다는 증거다 — 옛 구현에서는 둘이 같은 값이었다.

**재확인 (2026-09-08T05:07:32Z)** — `readInventory` / `buildInventory`를 직접 호출해
같은 순간에 재계산했다.

| 항목 | 값 |
|---|---|
| `readInventory().items.length` | 1115 |
| `buildInventory().items.length` | 2467 |
| 재계산 격차 (`build − read`) | **1352** |
| `report.denominator_gap.count` | **1352** |
| 일치 | **yes** |

Acceptance가 요구한 것은 "돈다"가 아니라 "그 시점의 실제 격차를 낸다"이며, 위 등식이 그것을
만족한다. 기준선 JSON의 고정 숫자와는 비교하지 않았다 — plan이 금지한 대조다.

**세 번째 측정 — base 머지가 값을 움직였다 (2026-09-08T05:13:02Z).** `origin/main` 9커밋을
머지하자 격차가 **1352 → 1689**로 움직였다. 머지가 backlog 84행과 ci-full-suite의 findings를
들여왔기 때문이고, 봉인 분모는 그대로 1115이므로 격차 전부가 라이브 쪽 증가다.

(아래 세 측정은 전부 **옛 의미**, 즉 길이 뺄셈이다. F1 흡수 이후 그 값은 `net_change`라는
이름으로 계속 관측되며, 그때의 `count`는 각 시점에서 14 정도 더 컸을 것이다.)

| 항목 | 머지 전 (05:07) | 머지 후 (05:13) |
|---|---|---|
| `seal.items` | 1115 | 1115 (불변 — 봉인은 `9093b08`에 고정) |
| `live.items` | 2467 | **2804** |
| `denominator_gap.count` | 1352 (54.8%) | **1689 (60.24%)** |
| 동시점 재계산과 일치 | yes | **yes** |
| findings-registry 종결률 | 1.91% | **1.52%** |

**이것이 plan이 값 동결을 금지한 이유의 실증이다.** 리터럴 `1352`를 test나 Validation에 박았다면
이 머지 하나로 붉어졌을 것이다. 고정된 것은 숫자가 아니라 등식
(`buildInventory − readInventory == denominator_gap.count`)이고, 그 등식은 두 측정 모두에서
성립했다. 보존된 산출물의 1352는 **틀린 값이 아니라 05:07 시점의 값**이며, 그 시각성이 곧
이 milestone이 표면화하려는 성질이다 — 봉인은 멈춰 있고 부채는 움직인다.

부수 효과로 두 계기의 불일치는 **넓어졌다**: 100% 대 1.52%. 봉인 분모가 정지한 채 라이브가
자라므로 이 간격은 재봉인 전까지 단조 증가한다.

**두 계기의 불일치가 실제로 관측됐다** — 이 milestone의 존재 이유다.

| ledger | closed / total | pct | denominator_note |
|---|---|---|---|
| disposition-ledger | 1115 / 1115 | **100%** | sealed inventory at `9093b08` |
| findings-registry | 19 / 997 | **1.91%** | live registry entries |

같은 저장소의 같은 순간에 종결률이 100%와 1.91%로 갈린다. 분모가 다르기 때문이고, 그 사실이
`denominator_note`로 각 행에 명시된다. 3분할은 `disposed 1115 ≥ resolved 132 ≥ fixed 1`로
부등식을 만족한다 — 판정은 전건 났지만 실제 수정은 1건이다.

**재봉인 경고가 발화했다** (`denominator_gap.count > 0`):

> Re-sealing is M2 responsibility. Calling re-seal now will unbind all 1115 disposition
> records from the old inventory (they are all bound to `inventory_sha256=sha256:f171a42e…`).

## PR-Codex R1 — 게이트가 실재하는 HIGH를 잡았다

`/mccp:pr`의 PR-Codex가 1라운드 발화해 `divergent`를 냈고, ship gate가 push를 차단했다.
지적 2건 중 HIGH 1건은 **이 milestone의 신규 코드에 있는 진짜 결함**이었고 그 자리에서
흡수했다(§3.14). 리뷰어 주장을 그대로 받지 않고 독립 재계산으로 먼저 재현했다.

### F1 [HIGH · ACCEPT_NOW] — 격차를 길이 차가 아니라 식별자로 세라

`report.js`가 `denominator_gap.count`를 `live.items.length − seal.items.length`로 계산했다.
이는 **봉인 항목이 전부 라이브에 남아 있다고 가정**하는데, 수집기는 닫힌 finding을 제외하고
fix-task 항목을 교체하므로 사라진 봉인 항목이 새로 늘어난 부채를 상쇄한다.

독립 재현(리뷰어 수치와 일치):

| 측정 | 값 |
|---|---|
| 길이 차 (옛 구현) | 1689 |
| ID 기준 `live \ sealed` | **1703** |
| 봉인됐으나 라이브에 없음 | **14** |

**최악의 경우가 단순 과소계상보다 나쁘다** — 추가와 삭제가 같은 수면 격차가 `0`으로
보고되고 그 순간 `reseal_warning`이 **침묵한다**. 미봉인 부채가 실재하는데 계기가
"봉인 밖에 아무것도 없다"고 말하는 것이고, 그것이 이 PRD가 없애려는 병리 그 자체다.

**흡수**: `count`를 `|live \ sealed|`(음수 불가)로 바꾸고, 옛 뺄셈은 다른 질문
("더미가 늘었나 줄었나")인 `net_change`로 분리했다. `sealed_not_live`를 함께 싣는다.
식별자가 없는 항목이 하나라도 있으면 비교가 불가능하므로 **숫자를 지어내지 않고**
`count`/`sealed_not_live`를 null로 두고 `degraded[]`에 사유를 남긴다.

기준선 구조 대조(Task 4(e))는 **부분집합** 단언이라 필드 추가로 깨지지 않는다.

**비공허성 확인** — 새 test `invariant (h)`는 봉인 10건과 라이브 10건이 **크기는 같고
식별자는 하나도 겹치지 않는** fixture다. 옛 구현이라면 `count=0` + 경고 침묵이 된다.
mutation(옛 뺄셈 복원)을 심으니 `invariant (h)`와 `(c9)` 정확히 둘이 red가 되고 복원 시
25/25 green으로 돌아왔다.

### F2 [MEDIUM · DEFER_TO_BACKLOG]

`findings-registry.js:674-681`의 `listWorkUnits`가 `readdirSync` 실패를 삼켜
(`catch (_e) { return []; }`) degradation 없이 빈 목록을 돌려준다. 리뷰어가 EACCES를
주입해 `live.items` 2804 → 1573, findings total 1250 → 0으로 떨어지는 동안 `degraded`가
계속 비어 있음을 실측했고, 코드를 열어 재확인했다.

**이연 사유는 선호가 아니라 범위다** — 그 파일은 이 plan의 **Validation 7이 편집을 명시
금지**한 upstream 원장 코드다(리뷰어도 "exists in the current upstream implementation"으로
귀속했다). 여기서 고치면 M1의 병렬 안전성 주장이 깨진다. `codex-findings-backlog.md`에
처방과 재현 절차를 함께 적재했다.

### 하지 않은 것

`MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE` override를 쓰지 않았다. 그 우회는 "diff가 상류에서
이미 적대적으로 리뷰됐다"는 상황을 위한 것이지, **리뷰어가 실재하는 결함을 찾았을 때** 쓰는
것이 아니다. 게이트는 옳게 막았고, 옳게 막은 게이트를 밀어내는 것이 이 저장소가 없애려는
행동이다.

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 1 오라클 | Pass | exit 0 · `denominator_gap.count = 1352` |
| 2 CLI 3경로 | Pass | table 0 · json 0 · bogus 2 |
| 3 closure test | Pass | **24 pass / 0 fail** |
| 4 이웃 회귀 | Pass | `backlog-source.test.js` 9 pass / 0 fail |
| 5 재봉인 경고 | Pass | 런타임 `seal.items`·`inventory_sha256` 둘 다 포함 |
| 5b 절대경로 | Pass | POSIX 홈 · macOS 홈 · Windows 드라이브 세 접두사 0건 |
| 6 문서 앵커 | Pass | `closure report` 앵커 존재 |
| 7 / 7b 원장 코드 편집 | Pass | 커밋·작업트리 모두 0건 |
| 8 삭제 | Pass | 0건 (§3.5.1) |
| 9 version 미선언 | Pass | merge-base 1.34.4, 선언 없음 (§3.7) |

### Design Grounding

N/A — design trigger 미발화. rendered surface(`.tsx/.css/.html`) 변경 0건인 control-plane
전용 변경이다.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/closure/report.js` | CREATED | +445 |
| `plugins/mccp/scripts/lib/closure/cli.js` | CREATED | +163 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | CREATED | +1147 |
| `.claude/prds/closure-accounting.prd.md` | CREATED | +168 |
| `.claude/plans/closure-accounting-m1.plan.md` | CREATED | +308 |
| `.claude/reviews/plan-review-closure-accounting.md` | CREATED | +73 |
| `.claude/_meta/data/2026-09-08-closure-baseline.json` | CREATED | +152 |
| `.claude/_meta/data/2026-09-08-closure-report-live.json` | CREATED | +63 |
| `.claude/state/findings/closure-accounting.jsonl` | CREATED | +17 |
| `docs/multi-session-work-loop/debt-inventory.md` | UPDATED | +34 |
| `CHANGELOG.md` | UPDATED | +24 (`## [Unreleased]`) |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +15 |
| `.claude/prds/harness-wiring-integrity.prd.md` | UPDATED | +6 / −2 |

`plugin.json`은 손대지 않았다 — §3.7대로 브랜치는 번호를 선언하지 않는다.

## Deviations from Plan

**게이트 receipt 부재 (계승 · plan `## Gate Deviation`이 소유).** `mccp-plan-codex` receipt가
없다. L2 패널이 `divergent`를 냈고 `decide`가 exit 12로 차단했으며, `MCCP_GATE_ROUND_CAP=1`이
enforce·봉인 상태라 재리뷰가 열리지 않는다. §3.16대로 1라운드를 triage하고 진행했다.

`mccp-implement-codex` receipt도 없다. 라운드 원장
(`mccp-implement-codex__closure-accounting-m1{,-r3}.json`)은 그 게이트가 실제로 발화했음을
기록하지만(각 `index: 0` · channel `codex` · classification `ok`), receipt는 봉인되지 않았다.
**이 사이클은 그것을 사후에 만들어 넣지 않았다** — 게이트를 돌리지 않은 세션이 receipt를 쓰는
것은 §3.16이 금지하는 위조에 가깝고, 정직한 부재가 기록된 부재보다 낫다고 판단했다. 그 부재는
본 절과 PR 본문이 소유한다.

**미행 항목을 본 사이클이 채웠다.** Task 6의 "대조 결과를 보고서에 적는다"가 이행되지 않은
상태였다(산출물은 있었으나 보고서가 없었다). 위 「Task 6 — 라이브 대조 결과」 절이 그것이다.

## Issues Encountered

구현 리뷰가 3라운드 모두 `fail`로 돌아왔고, 그 순서 자체가 이 milestone의 논지를 실증한다.

| 라운드 | 스위트 | 실제로 발견된 것 |
|---|---|---|
| R1 | 8/8 green | **green이 공허했다** — 기준선 경로가 `plugins/.claude/…`로 해소돼 부재였고 try/catch가 조용히 return. 가장 중요한 단언이 한 번도 실행된 적 없었다 |
| R2 | 15/15 green | 10건 수정 보고 중 **3건 미착지** — unmatched disposition으로 300% closure 재현 · `degraded`가 boolean인데 `Array.isArray` 검사 · scrub 3연속 replace의 재스캔 |
| R3 | 20/20 green | **돌지만 아무것도 고정하지 않았다** — 의미 mutation 20종 중 15종 생존(`disposed := sealItems`는 영구 100%). 모든 fixture가 세 카운트를 우연히 일치시켰다 |

R3 흡수 후 `disposed(6) ≠ resolved(3) ≠ fixed(1) < total(10)` fixture를 도입해 그 계열을
죽였고, **비공허성은 이제 주장이 아니라 측정이다** — mutation 13종 전건 killed.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | 24 | EMPTY 규약 · `disposed ≥ resolved ≥ fixed` · 주입 fixture 산출값 · ledgers 2행 · 기준선 구조 부분집합 · 절대경로 0건 · gap=0 → warning null · reader별 throw 포착 · 봉인 shape 불량 강등 · 열화 신호 3종 단독 발화 |

## Next Steps

- [ ] `/mccp:pr` — PR 본문에 위 「Deviations from Plan」을 `## Gate Deviation`으로 인용
- [ ] 머지 후 PRD `closure-accounting`의 M1 status를 complete로 정정
- [ ] M2(재봉인) — 이 리포트가 낸 격차 1352를 닫는 것은 M2 소유. **지금 재봉인하면 판정 1115건이 전부 unmatched가 된다**
