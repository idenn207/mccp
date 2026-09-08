# Plan Review Panel — closure-accounting

**Plan**: `.claude/plans/closure-accounting-m1.plan.md` · **Plan version**: `sha256:436d39f88f136bc1356dd8a9bdd1a4bea71e5962dd4eda42d05e82377af1ca22`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 11 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, security/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Task 4(e)와 PRD Risk 완화가 기대는 "리포트 출력 ↔ 기준선 JSON 구조 정합" 단언은 성립 불가다. 두 문서의 최상위 키 집합은 교집합이 0이다. | 기준선 `.claude/_meta/data/2026-09-08-closure-baseline.json:1-97`의 최상위 키는 `measured_at·repo_head·note·backlog·findings_registry·ship_receipts·review_records·open_questions·tool_state`다. plan이 정의한 리포트 shape는 `seal·live·denominator_gap·dispositions·ledgers·degraded`(plan:50-57)이며 공통 키가 하나도 없다. 그럼에도 plan:86은 "`--json` 출력이 기준선 JSON과 같은 키 구조를 갖는다"를 단언 항목으로 두고, PRD:148이 그 test를 "기준선이 굳는" 위험의 유일 완화로 지목한다. |
| architect | HIGH | Task 6·Acceptance가 기준선에서 읽으라고 지시한 값(`2487`, `1115`, `live.items - seal.items`)이 그 기준선 파일에 존재하지 않는다 — 인용된 산출물이 인용된 내용을 담고 있지 않다. | plan:103 "`denominator_gap.count`가 기준선의 `2487-1115`와 같다" · plan:169 "기준선의 `live.items - seal.items`와 일치". 그러나 baseline JSON에는 `live`/`seal` 키도, 숫자 2487·1115도 전무하다(backlog는 `rows:1510` 하나뿐, debt-inventory 봉인 섹션 부재). 2487/1115는 PRD 본문(:16, :34-35)에만 존재한다. |
| architect | MEDIUM | "원장 읽기" 미러 인용이 소스와 다르다. `readInventory`는 `{ok, lines}`를 반환하지 않으며, 파손 JSON에서 throw한다 — Task 1의 "읽기 실패는 throw가 아니라 degraded[]" 계약이 이 오해 위에 서면 오라클이 예외로 죽는다. | plan:31 "`readInventory` / `readDispositions`가 `{ok, lines}` 형태로 답하고". 실제 `debt-inventory.js:385-389`는 부재 시 `null`, 그 외에는 `JSON.parse(...)` 결과를 **미보호로** 반환한다(try/catch 없음). `{ok, lines}` 형태는 `readDispositions`(:432-454)에만 해당한다. |
| architect | MEDIUM | Acceptance가 "불변식만 동결하고 카운트는 동결하지 않는다"는 자기 미러 규약과 모순된다 — live 측 값은 게이트 append로 실행 중에도 움직인다고 plan 자신이 적었다. | plan:32/147은 "게이트가 append할 때마다 값이 움직인다(실측 171/443 → 181/453)"를 근거로 값 동결을 금지하는데, plan:103·125·169는 `1115` 리터럴 포함과 격차 값의 **정확 일치**를 요구한다. §3.15 M2에 따라 이 plan의 리뷰 자체가 backlog에 행을 append하므로 live 분자는 기준선 측정 이후 이미 변했을 수 있다. |
| security | HIGH | Task 1의 degraded[] '이유'가 fs 오류 메시지를 그대로 담게 되고, Task 6이 그 출력을 git-tracked 산출물로 커밋하므로 절대경로(사용자 홈 디렉토리) 유출 경로가 새로 열린다. 이 저장소에는 meta.cwd 절대경로 유출로 sanctioned 재봉인(v1.22.4-cwd-rebind.js)까지 간 실측 선례가 있고(CLAUDE.md §3.12), 플랜에는 sanitize·repo-relative 정규화 요구가 한 줄도 없다. | plan L57 'degraded[] (읽지 못한 축의 이름과 이유)' + L59 '읽기 실패는 throw가 아니라 degraded[] 항목' + L99-100 '`closure report --json`을 실제로 1회 실행해 그 출력을 `.claude/_meta/data/2026-09-08-closure-report-live.json`으로 보존'. 유출원: plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js:232 `return { ok: false, items: [], error: name + ': ' + err.message }` 및 :439 `error: err.message` — Node fs 오류 메시지는 절대경로를 포함한다. Task 4(a)는 '원장 파일을 임시로 못 읽게 한 fixture'로 바로 이 경로를 상시 경로로 만들면서 키 집합만 단언하고 절대경로 부재는 단언하지 않는다(plan L81). |
| security | MEDIUM | '모든 읽기 실패가 degraded[]로 접힌다'는 Task 1의 계약은 인용한 코드가 지지하지 않는다. Patterns 표는 `readInventory`/`readDispositions`가 둘 다 `{ok, lines}`로 답한다고 적었으나 `readInventory`는 그 형태가 아니고 JSON.parse를 감싸지 않아 손상된 봉인 파일에서 그대로 throw한다 — 오라클이 degraded 대신 스택트레이스로 죽고, 그 스택트레이스 역시 절대경로를 담는다. | plan L31 '`readInventory` / `readDispositions`가 `{ok, lines}` 형태로 답하고' (인용: debt-inventory.js:385,428). 실제 코드 debt-inventory.js:385-389 — `function readInventory(repoRoot){ const abs=inventoryPath(repoRoot); if(!fs.existsSync(abs)) return null; return JSON.parse(fs.readFileSync(abs,'utf8')); }` — `{ok,lines}`도 아니고 try/catch도 없다. |
| test | HIGH | Task 4(e)의 핵심 test는 실행 불가하다 — 기준선 JSON은 리포트와 전혀 다른 키 구조를 갖는다. '기준선 JSON과 같은 키 구조' 단언은 통과할 수 없거나, 통과하도록 쓰면 아무것도 검증하지 않는 vacuous test가 된다. | plan:86 "(e) `--json` 출력이 기준선 JSON과 **같은 키 구조**를 갖는다" vs 실제 기준선 최상위 키는 measured_at/repo_head/note/backlog/findings_registry/ship_receipts/review_records/open_questions/tool_state (.claude/_meta/data/2026-09-08-closure-baseline.json:2-97). 리포트 키는 seal/live/denominator_gap/dispositions/ledgers/degraded (plan:50-57). 교집합 0. |
| test | HIGH | Acceptance와 Task 6의 판정 기준이 기준선 JSON에 존재하지 않는 필드를 참조한다 — 그 확인 자체를 수행할 수 없다. | plan:103 "`denominator_gap.count`가 기준선의 `2487-1115`와 같다", plan:169 "기준선의 `live.items - seal.items`와 일치". 그러나 baseline JSON에는 `live`·`seal` 키도, 값 2487·1115도 등장하지 않는다(backlog.rows=1510이 유일한 카운트, :7). |
| test | HIGH | plan이 스스로 금지한 '오늘 값 동결'을 Validate 라인에서 두 번 저지른다 — 다음 backlog/findings append에 즉시 red가 된다. | Risk 행 plan:147 "test가 오늘 값을 동결해 다음 append에 red … Task 4가 값이 아니라 구조·부등식만 단언한다"인데 plan:68은 `reseal_warning`이 `1115`를 포함할 것을, plan:103은 delta가 `2487-1115`일 것을 리터럴로 요구한다. live 2487은 append마다 움직인다(같은 plan:32이 인용한 선례 171/443→181/453). |
| test | MEDIUM | Task 4(c)는 구현과 동일한 산술을 재기술하는 동어반복이라 어떤 오류도 잡지 못한다 — 세 원장을 '올바르게 읽었는가'를 반증하는 test가 plan 전체에 없다. | plan:83 "(c) `denominator_gap.count === live.items - seal.items`". live.items/seal.items가 잘못 읽혀도 이 등식은 항상 참이다. 원장 읽기 정확성(예: readInventory/readDispositions 결속, plan:31)에 대한 단언은 Task 4 (a)~(e) 어디에도 없다. |
| test | LOW | reseal_warning의 위험한 방향(격차가 없는데 경고가 뜨거나, 격차가 있는데 경고가 누락)이 한쪽만 테스트된다. | plan:68은 non-null만 확인한다. plan:63의 조건 `denominator_gap.count > 0`의 false 분기(경고 부재)를 단언하는 Validate/test 항목이 없다. |
| test | LOW | Files to Change에 있는 CHANGELOG.md 편집에 대응하는 Task도 Validate 라인도 없다. | plan:45 CHANGELOG.md UPDATE. Tasks 1~6(plan:49-103)과 Validation 1~9(plan:107-137) 어디에도 CHANGELOG 검사가 없다. |
| invariant | HIGH | Validation 7 — the only mechanical proof of the plan's central safety claim ("기존 원장 코드를 한 줄도 편집하지 않는다") — cannot fail. The shell line prints "UNEXPECTED EDIT" and still exits 0, so Acceptance criterion "Validation 1~9 전건 exit 0" is satisfied by a violating tree exactly as it is by a clean one. | plan L131: `git diff --name-only origin/main...HEAD -- ... \| grep . && echo "UNEXPECTED EDIT" \|\| echo "no edits..."` — the pipeline's status is consumed by `&&`/`\|\|`, and `echo` exits 0 on both branches. Acceptance L172 binds to it: "`report.js`·`cli.js`가 … 한 줄도 편집하지 않음 (Validation 7)". |
| invariant | MEDIUM | The reseal-warning mitigation is suppressed on exactly the unknown/degraded input. Task 2 gates `reseal_warning` on `denominator_gap.count > 0`, while Task 1 says an unreadable ledger yields `degraded[]` + null field — so when the seal or live collection cannot be read, count is null, the comparison is false, and no warning is emitted. The plan's Risks table names this warning as the sole mitigation for a HIGH-likelihood risk ("반사적으로 재봉인해 판정 1115건이 끊긴다"). | plan L63 (`denominator_gap.count > 0`이면 …), L59 ("읽기 실패는 throw가 아니라 `degraded[]` 항목 + 해당 필드 `null`"), L145 mitigation column. No task states the warning must also fire (or the output must refuse) when the gap is unknown. |
| invariant | MEDIUM | The degraded path can synthesize a success-direction zero. Task 4(c) freezes `denominator_gap.count === live.items - seal.items` with no null guard; in JS `null - null === 0`, so a run where both ledgers are unreadable reports gap 0 — 'no debt outside the denominator' — which is precisely the PRD's diagnosed pathology ("성공 방향 기본값이 배선 단절을 무증상으로 만든다", PRD L25-26). The plan nowhere states count must be null when either operand is null. | plan L83-84 (invariant (c)) vs L59 (degraded fields are null); PRD L25-26. |
| invariant | MEDIUM | The report is not anchored to what it describes. The output field list carries no `inventory_sha256` and no commit for the live recollection, so the preserved evidence artifact (`2026-09-08-closure-report-live.json`, Task 6) cannot later be bound to the seal or tree it measured — while PRD 결정 1 makes that very binding the anti-forgery device. Task 6's only cross-check is "눈으로 대조" and Task 4(e) compares structure only, never values. | plan L50-57 field list (`seal{sealed_at, sealed_at_commit, items, age_days}` — no `inventory_sha256`); L86 "(값은 비교하지 않는다)"; L101 "눈으로 대조"; PRD L100 "봉인 결속(`inventory_sha256`)은 그대로 둔다 … 그 결속이 판정의 위조 방지 장치다". |
| invariant | LOW | Validation 5 pins a literal count (`1115`) as the existence proof for the reseal warning, contradicting the plan's own declared test doctrine and making the check go red/false for reasons unrelated to the invariant (any disposition/seal movement, or M2's reseal). | plan L125 `if(!j.reseal_warning\|\|!String(j.reseal_warning).includes('1115'))` vs L87 "불변식을 동결하고 행 수는 동결하지 않는다"; L103 similarly pins `2487-1115`. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | 인용 4건을 전부 원본에서 확인했다: `env-contract/cli.js:290`(참 — `process.exit(main(...))`), `derive/sources/backlog.js:74-82`의 EMPTY 규약(참), `:146-160` 지연 require + fail-soft(참), `backlog-source.test.js:1-12`의 \\"invariants, not counts\\"(참), `debt-inventory.js:385/428`(부분 거짓 — 위 finding 3). `plugins/mccp/scripts/lib/closure/`가 실재하지 않음을 확인해 신규 파일 주장과 병렬 무충돌 주장은 반증하지 못했다. 기준선 JSON을 실제로 열어 plan의 두 acceptance 앵커(구조 정합·격차 값)를 대조했고 거기서 두 건이 무너졌다. `ledgers` 2행 vs \\"계기 셋\\" 서술, `denominator_gap` 음수 허용, exit-code 0 게이트-아님 경계, 재봉인 코드 부재 주장은 공격했으나 결함을 찾지 못했다. |
| security | fail | 플랜이 새로 여는 신뢰 경계를 다음 축으로 공격했다: (1) 커밋되는 산출물로의 유출 — Task 6의 `.claude/_meta/data/*-live.json`이 git-tracked이고 degraded[] 사유가 fs err.message를 옮긴다는 경로를 debt-inventory.js:232/439에서 확인해 finding으로 냈다. (2) Patterns 인용 대조 — `readInventory`가 플랜이 주장한 `{ok,lines}` 계약을 갖지 않고 throw 가능함을 확인해 finding으로 냈다. (3) `--repo-root <path>` 임의 경로 traversal — 도구가 read-only이고 단일 신뢰 사용자 위협모델 안이며 쓰기 경로가 없어 실질 결과에 도달하지 못했다(미보고). (4) 재봉인/무결성 훼손 — M1에 쓰기 코드가 없고 `inventory_sha256` 결속을 건드리지 않음을 sealInventory(:394-402)의 ALREADY_SEALED 거부로 확인, 공격 실패. (5) reseal_warning의 `<old sha>` 노출 — 이미 tracked 파일에 평문으로 있어 새 유출 아님(미보고). (6) exit code 항상 0(게이트 아님)로 인한 우회 — 이 도구가 어떤 승인 판정도 소비하지 않아 escalation 경로 없음, 공격 실패. |
| test | fail | plan이 인용한 backlog.js:74-82 EMPTY 규약과 backlog-source.test.js:1-12 '불변식만 동결' 선례를 실제로 읽어 인용이 정확함을 확인했고(정확했다), 그 다음 plan 자신의 test 계약이 그 선례를 지키는지 공격했다 — Task 4 (a)~(e)와 Validation 1~9, Task 6/Acceptance를 기준선 JSON 실물과 대조했다. (e)의 대조 대상이 구조적으로 다른 문서라는 점, Acceptance가 기준선에 없는 필드를 참조한다는 점, Validate 라인 두 곳이 plan이 Risk에서 금지한 값 동결을 한다는 점을 찾았다. 추가로 (c)의 동어반복성, reseal_warning 실패 방향 커버리지, CHANGELOG 무-Validate를 확인했다. degraded[] fixture 실현 가능성(repoRoot 주입)과 CLI exit-code 3경로 Validate는 공격했으나 결함을 찾지 못했다. |
| invariant | fail | Read the plan and PRD in full; verified the cited anchors (debt-inventory.js:385/432 `readInventory`/`readDispositions` shapes, backlog.js:74-82 EMPTY convention, backlog.js:146-160 lazy require fail-soft) actually say what the plan claims — they do. Then traced unknown-input paths the plan does not name: unreadable/corrupt seal JSON (note `readInventory`'s `JSON.parse` is unguarded at debt-inventory.js:388, so Task 1's no-throw contract is an unstated obligation), degraded null arithmetic in the gap, and warning suppression on degraded. Attacked the anchoring of the preserved evidence artifact to the seal it measures, and audited each of the nine Validation shell lines for checks that structurally cannot fail — line 7 is one. Did not find defects in the read-only/no-reseal claim itself (there is genuinely no write path proposed), nor in the exit-code-always-0 CLI choice (PRD 결정 4 states the failure mode it defends and it is consistent). |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
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
  "wall_clock_ms": 212831,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:436d39f88f136bc1356dd8a9bdd1a4bea71e5962dd4eda42d05e82377af1ca22",
  "plan_path": ".claude/plans/closure-accounting-m1.plan.md",
  "recorded_at": "2026-09-08T00:48:53.965Z"
}
```
