# Plan Review Panel — diverse-agent-review

**Plan**: `.claude/plans/diverse-agent-review-m5.plan.md` · **Plan version**: `sha256:98d30390534bab8bc2bf9d15a286588cd983b342f743e41fc6e63a9d2b0f4f4e`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 5 blocking finding(s): test/HIGH, test/FAIL, invariant/HIGH, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | "정본화"가 실제로는 단일 원천을 세우지 못한다 — 승격 원본(donor)이 이전 대상에서 빠져 있고, 저장소에는 plan이 센 4벌보다 많은 0칼럼 추출기 사본이 남으며, 새 사본을 막는 기계 장치가 없다 | plan Summary는 "정본화는 ... 넷째를 승격하는 일"이라 적고 Files to Change(58-66행)는 `plan-review-command-body.test.js`·`review-single-pass-command-body.test.js` 2건만 UPDATE한다. 승격 원본 `plugins/mccp/scripts/lib/tests/command-tmp-worktree-safe.test.js:34-49`는 목록에 없어 `blocks.js`와 독립 구현으로 병존한다. 게다가 commands/*.md를 같은 방식으로 훑는 0칼럼 고정 사본이 최소 4벌 더 있다: `plugins/mccp/scripts/lib/tests/plan-command-marker-states.test.js:34`(`/```bash\\n([\\s\\S]*?)```/g`) · `plugins/mccp/scripts/lib/tests/gitignore-provision.test.js:1366` · `plugins/mccp/scripts/receipt/tests/pr-mutex-preflight.test.js:39` · `plugins/mccp/scripts/lint/tests/validate-callsite-lint.test.js:97`. plan에는 "신규 사본 금지" 단언이 없어(Task 1~6 Validate 어디에도 없음) 정본은 호출자가 자유롭게 우회 가능한 헬퍼로 남는다. |
| architect | MEDIUM | Task 1의 닫는-fence 규칙은 승격 원본에 없는 발명이며, plan이 "옮겨 오는 계약"이라 적은 것과 어긋나고 그 차이를 검증하는 단언도 없다 | plan Task 1: "닫는 fence 는 같은 들여쓰기 폭 이상을 요구한다 ... 새로 발명할 계약이 아니라 옮겨 오는 계약", Mirror는 `command-tmp-worktree-safe.test.js:39` 의 정규식을 합친다고 적는다. 그러나 그 원본(`:38-43`)은 여는·닫는 구분 없이 `/^\\s*```(\\w*)/` 하나로 토글할 뿐 들여쓰기 폭을 전혀 비교하지 않는다. CommonMark는 닫는 fence가 여는 fence보다 덜 들여써도 유효하므로, 새 규칙은 원본보다 엄격해 그런 블록을 닫지 못하고 이후 산문을 bash로 흡수한다. Task 1 Validate(90-92행)는 들여쓴 fence 포함·비-bash 제외·무태그만 단언하고 이 케이스를 다루지 않는다. |
| architect | MEDIUM | S2 술어("블록 끝")가 분기가 아닌 블록까지 위반으로 접고, Validation #9가 그 항목 전부를 backlog에 실결함으로 적재하도록 강제한다 | plan Task 2 S2: "비차단 접미사로 끝나는 명령 뒤의 첫 유효 줄이 `fi` 이거나 블록 끝이면 위반" — 근거는 "분기의 exit status 가 항상 0"이다. 그러나 열거된 후보 `plugins/mccp/commands/work.md:60`(`... 2>&1 \|\| true` 뒤 :61 이 블록 끝)은 분기가 아니며 바로 다음 산문 `work.md:63-65`가 "이 단계는 **조기 경고 전용**이다 ... 이 경고를 무시하고 진행해도 안전하며"라고 적어 비차단이 의도임을 명시한다. plan은 helper escape(`plan.md:1252`)만 예외로 두고 이 클래스에는 escape가 없어, Validation #9("debt.js 의 각 항목이 backlog 에 대응 행을 갖는지" · 미대응 시 exit 1)가 위양성을 이연 결함으로 적재하게 만든다. |
| security | LOW | 부채 면제의 결속 키와 backlog parity 게이트의 결속 키가 다르다 — plan 스스로 'line 은 비결속 메타데이터'라 선언해 놓고(Risks 표, plan.md:311) Validation 9는 정확히 그 line 으로 backlog 대조를 한다(plan .claude/plans/diverse-agent-review-m5.plan.md:299 `bl.indexOf(d.file+":"+d.line)`). #9·#1.5 가 커맨드 본문을 편집해 줄번호가 밀리면 감사 링크(부채 항목 ↔ backlog 행)는 두 갈래로만 끝난다: (a) debt.line 을 갱신하지 않아 parity 가 붉어지거나, (b) 갱신하면 backlog 행과 조용히 어긋나 이연 기록의 추적 가능성이 끊긴다. 보안 결과는 권한 상승이 아니라 audit-trail 부패이므로 LOW 이나, plan 이 §3.15 '적재할 수 없으면 진행 불가' 선례를 계승했다고 주장하는 근거가 바로 이 대조라 그 주장의 강도가 실제보다 높다. | .claude/plans/diverse-agent-review-m5.plan.md:299 (parity 는 file:line) vs :311 ("`line` 은 사람이 찾아가기 위한 **비결속 메타데이터**") |
| security | LOW | S1 sizing 이 스캔한 바로 그 블록에 provenance 결손이 실재하는데 seam 인벤토리·미채택 목록 어디에도 기록되지 않는다. `plugins/mccp/commands/prp-implement.md:978` 이 `SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"` 로 락 소유자 id 를 만들고 `:984` (plan 이 S1 위반으로 열거한 그 줄) 바로 위에서 `--owner-session-id` 로 넘긴다. CLAUDE.md §3.18 은 이 하네스 CLI 가 `CLAUDE_SESSION_ID` 를 설정하지 않으므로 단독 read 는 항상 빈 값이라고 실측으로 못박았다 — 즉 ultracode phase lock 의 `owner_session_id` 는 모든 실행에서 상수 `"unknown"` 이다. `ultracode-phase-lock.js:223/315/524` 를 보면 이 값은 신뢰 판정에 쓰이지 않고 기록·보고만 되므로 권한 우회는 아니며(그래서 LOW), 결과는 orphan lock 진단 시 소유 세션 귀속 불가다. plan 이 도입한 결함이 아니라 기존 결함이지만, M5 가 그 블록의 seam 목록을 '실측 열거'로 봉인하면서 §3.18 위반 클래스를 S1/S2/S3 에도 Task 7 미채택 목록에도 남기지 않아 이후 사이클에서 '이미 훑은 줄'로 취급될 위험이 있다. | plugins/mccp/commands/prp-implement.md:978,983-984 · plugins/mccp/scripts/lib/ultracode-phase-lock.js:223,315,524 · CLAUDE.md §3.18 |
| test | HIGH | Validation 3b (단언 완화 방지)는 원리상 실패할 수 없는 게이트다 — baseline이 그것이 지키려는 변경과 같은 커밋에서 저자가 정하는 값이고, 도출 가능한 ground truth(origin/main의 파일)와 대조되지 않는다. 이는 plan 자신이 금지한 형태와 동형이다. | plan:147-150 "`ASSERT_BASELINE`... baseline 은 **커밋된 데이터**여야 하고 산문 문서에 적힌 숫자여서는 안 된다 — 문서의 숫자는 비교되지 않으므로 그 검사는 실패할 수 없는 게이트가 된다. 값은 Task 6a 가 교체 **전에** 측정해 채운다." + plan:257-271 스크립트는 `ASSERT_BASELINE[f]`와만 비교한다. Risks 행(plan:314)은 이 검사를 "red 를 만난 구현자가 단언을 완화"에 대한 유일 mitigation으로 지정한다. 미러 대상인 `plugins/mccp/scripts/lib/env-contract/evidence-debt.js:102-119`는 상한을 올리려면 별도 편집이 필요하도록 test가 짝 단언하지만, ASSERT_BASELINE에는 대응하는 독립 검증(예: `git show origin/main:<test>` 재계수)이 plan 어디에도 없다. |
| test | MEDIUM | Task 6(추출기 이전)이 실제로 커버리지를 넓혔는지 검증하는 것이 아무것도 없다. Task 6d의 선택지 (2)를 모든 red 단언에 적용하면 결과는 '이전하지 않음'과 동일한데 Validation 3·3b·8이 전부 green이고 assert 수도 불변이다. | plan:199 "(2) 그 단언만 구 추출기 유지(이전 범위 축소)"; Task 6 Validate(plan:202-204)는 "두 파일이 green 이고, 파일별 `assert` 호출 수가 이전 전보다 줄지 않는다"만 요구한다. Task 6a의 delta는 `docs/diverse-agent-review/gate-wiring-oracle.md`(산문)에만 기록되고, plan:148-150 자신이 산문 숫자는 비교되지 않는다고 적는다. Validation 8(plan:289-290)은 신규 lint의 debt 수만 찍고 이전된 두 파일의 블록 집합을 대조하지 않는다. |
| test | MEDIUM | `filesRead !== filesExpected` 검사는 plan이 지목한 실패 모드(커맨드 파일 개명·이동으로 커버리지가 조용히 줄어듦)를 탐지할 수 없다 — 두 값이 같은 glob에서 같은 시점에 파생되므로 개명은 양쪽을 동시에 움직인다. 실제로 이 검사가 잡을 수 있는 것은 fs read 실패뿐이다. | plan:158-162 "`filesExpected` 는 `plugins/mccp/commands/*.md` 의 실제 glob 개수이고, 하드코딩 상수가 아니다... 22개 중 5개만 읽어도 check 3개가 전부 통과해 게이트가 초록으로 보이는데, 커맨드 파일이 개명·이동되면 정확히 그 형태로 seam 커버리지가 조용히 줄어든다." 두 값이 동일 glob 파생이면 개명 시 filesExpected도 함께 줄어 등식이 유지된다. |
| test | LOW | debt 결속 키와 backlog parity 검사의 키가 어긋난다 — plan은 `line`을 '비결속 메타데이터'로 선언하면서 Validation 9는 `file:line` 문자열로 대조한다. 결속되지 않는(따라서 어떤 검사도 정합을 확인하지 않는) 값이 게이트의 판정 입력이 된다. | plan:311 "면제 키는 **`(file, rule, textDigest)`** 이고 `line` 은 사람이 찾아가기 위한 **비결속 메타데이터**다" vs plan:299 `const miss=SEAM_DEBT.filter(function(d){return bl.indexOf(d.file+":"+d.line)===-1;});`. debt의 `line`이 규칙 출력의 실제 line과 일치하는지 확인하는 단언은 plan에 없다. |
| invariant | HIGH | Validation 3b의 baseline(ASSERT_BASELINE)이 이 plan 어디에도 미리 고정되지 않아, 같은 구현자가 교체 '후'에 값을 채우면 검사는 언제나 green이다 — plan 자신이 debt 상한에 대해 지목한 '사후에 맞출 수 있어 실패할 수 없는 게이트' 클래스가 이 축에서만 열려 있다 | plan :150 "값은 Task 6a 가 교체 **전에** 측정해 채운다"(순서 보장이 산문뿐) vs :121-123 "열거가 없으면 부채 상한을 **사후에 맞출 수 있어** ... 언제나 green 이 되기 때문이다" — S1/S2/S3는 file:line을 전부 열거했으나 ASSERT_BASELINE의 기대 숫자는 plan 본문에 0건 열거됨 |
| invariant | HIGH | Validation 3b는 단언 '삭제'만 탐지하고 '제자리 완화'는 구조적으로 못 잡는데, Risks 표는 그것을 완화 시나리오의 mitigation으로 선언한다 — 게이트가 게이트처럼 보이면서 멈추지 않는다 | plan :265 카운트 로직 `(l.match(/\\bassert\\.[a-zA-Z]/g)\|\|[]).length` + :267 `if(n<want)` — `assert.deepEqual(offenders, [])`(plan-review-command-body.test.js:64)를 `assert.ok(true)`로 바꿔도 카운트 불변. Risks :314는 이 검사를 "red 를 만난 구현자가 단언을 완화해 해소한다"의 mitigation으로 적는다 |
| invariant | MEDIUM | Validation #9 backlog parity가 `line`에 결속하는데, Risks 표는 같은 `line`을 '비결속 메타데이터'로 선언한다 — 두 기계 검사가 서로 다른 키를 쓰므로 커맨드 본문 편집(#9·#1.5가 예고)으로 줄번호가 밀리면 backlog 앵커가 낡은 채로 parity는 green이다 | plan :299 `bl.indexOf(d.file+":"+d.line)===-1` vs :311 "면제 키는 **`(file, rule, textDigest)`** 이고 `line` 은 ... **비결속 메타데이터**다 — 그래야 #9·#1.5 가 커맨드 본문을 편집해 줄번호가 밀려도 부채가 통째로 무효화되지 않는다" |
| invariant | MEDIUM | Validation #8은 'sizing 수치가 재측정과 일치한다'를 표제로 걸지만 실제 명령은 debt 개수를 출력만 하고 비교도 비영점 exit도 하지 않는다 — 3b가 스스로 금지한 '실패할 수 없는 게이트'가 같은 블록에 남아 있다 | plan :285-290 `# 8. 문서의 sizing 수치가 재측정과 일치한다 (Task 7)` 아래 명령이 `console.log("debt="+d)` 뿐이며 문서 표의 수치를 읽지도 비교하지도 않는다. 대비: :252-253 "**비교하고 비영점 exit 한다** — 숫자만 찍는 검사는 실패할 수 없는 게이트" |
| invariant | LOW | Task 5의 Validate 기준(debt 길이 = 상한)이 커밋되는 Validation 블록 1번에서는 검사되지 않는다 — 상한 래칫의 런타임 확인은 test 파일에만 남고 lint 실행 경로에서는 관측만 된다 | plan :166-167 "debt 길이가 상한과 같고" vs :244 실제 검사는 `k.length!==3`, `!j.ok`, `filesRead!==filesExpected` 셋뿐이고 debt는 `console.log`로만 출력 |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 인용을 전부 열어 대조했다. 실재 확인(반증 실패): `command-tmp-worktree-safe.test.js:39` 정규식 · `plan-review-command-body.test.js:26/59/64/78/93/264-269/271-291/304/315-319`(6b·6c가 지목한 0칼럼 종결자·prose 판별자 재사용이 실제로 그 형태다) · `review-single-pass-command-body.test.js:30` · `env-contract/evidence-debt.js:107`의 CEILING+assertShape throw 형태 · S1 실측 앵커 `prp-implement.md:984/992/996/998`(들여쓴 fence 안 재캡처, 술어의 \\"이후\\" 조건이 실제로 필요함) · `santa-loop.md:281` 캡처와 `:293-294` 소비가 서로 다른 fence임 · S3/S2 앵커 `dashboard-audit.md:21`·`work.md:60` 실재. Task 7의 L1 범주오류 논증(`ACTIONS_REQUIRING_ABSENCE`)도 PRD Evidence의 선례와 정합했다. 깨진 것 셋: (1) 승격 원본 미이전 + 미열거 사본 4벌 잔존으로 \\"정본\\"이 구조적으로 우회 가능, (2) 닫는-fence 들여쓰기 규칙이 원본에 없는 발명인데 \\"옮겨 온다\\"고 적히고 검증도 없음, (3) S2 술어가 분기 아닌 블록 끝까지 접어 위양성을 backlog 적재로 강제. 셋 다 MEDIUM이라 HIGH/CRITICAL 부재로 pass. |
| security | pass | 공격한 것: (1) 부채 래칫이 새 우회 통로인가 — `evidence-debt.js:107/112-142` 의 로드시 `assertShape` throw + 상한 짝 단언을 실제로 확인했고 M5 가 그 형태를 축자 계승하므로 면제 추가는 diff 에 숫자로 남는다. 무증거 통과 경로 못 찾음. (2) `textDigest` 로 결속하면 같은 줄의 다른 위반이 면제를 승계하는가 — plan Task 4 가 정확히 그 시나리오를 이유로 digest 를 도입했고 방향이 옳다. (3) 신규 lint 이 durable artifact 에 절대경로·머신명·cwd 를 흘리는가 — 출력 스키마가 `{file,line,rule,text,why}` + 카운트뿐이고 `run(repoRoot)` 상대경로라 §3.12 cwd leak 선례 재개방 없음. (4) `filesExpected` glob 가 traversal/부분코퍼스 우회에 열리는가 — 입력이 고정 glob 이고 사용자 입력이 닿지 않으며, 부분 코퍼스는 plan 이 명시적으로 problem 으로 만든다. (5) plan 이 인용한 신뢰 판정 코드가 실제로 그렇게 말하는지 — `l1-check.js:69,334` 의 `ACTIONS_REQUIRING_ABSENCE`/`C3_CREATE_EXISTS`, `prp-implement.md:991-998` 의 cross-fence 재캡처, `plan.md:1997` 의 `2>/dev/null` 전부 인용대로였다. (6) receipt/verdict 필드나 dedupe·ship-gate 신뢰 경계를 건드리는가 — `Files to Change` 에 receipt/schema/commands 계열이 0건이고 게이트 본문 diff 공집합이 기계 검증된다. HIGH/CRITICAL 은 찾지 못했고, 남은 두 건은 감사 링크 부패와 기존 provenance 결손이라 LOW 로 적는다. |
| test | fail | plan의 file:line 인용을 실물 대조했다 — `command-tmp-worktree-safe.test.js:34-49`의 fence 정규식(승격 대상)·`plan-review-command-body.test.js:26-35,50-95`(0칼럼 고정·`deepEqual(offenders,[])` 면제 훅 부재)·`env-contract/evidence-debt.js:102-119` 상한 래칫·`env-contract/lint.js:261,373` \\"read failure is drift\\"는 모두 plan 서술대로였다. S1 실측 앵커도 확인했다: `prp-implement.md:976-985`(984 캡처 후 미참조)·`:991-998`(992가 읽은 뒤 996 재캡처)·`santa-loop.md:281` 대 `:293-294`(cross-fence 상태 소실) — 전부 참이고 '이후' 술어 구분도 정확하다. 부채 래칫의 양방향(과소보고→고쳐진 항목 red, 과대보고→ok=false)과 변이 test 짝 단언은 공허하지 않다고 판단해 findings에서 뺐다. L1 재실행을 Validation에서 제외한 근거(`l1-check.js` CREATE 규칙)도 범주 오류 주장이 타당하다고 보아 공격하지 않았다. 남은 반증 4건은 (a) 자기 커밋이 정하는 ASSERT_BASELINE의 순환, (b) 이전 커버리지 확대를 검증하는 단언 부재, (c) filesRead/filesExpected가 주장한 실패 모드를 못 잡음, (d) debt 결속 키와 parity 키 불일치다. |
| invariant | fail | plan과 PRD 전문을 읽고, 인용된 기존 모듈을 실제로 열어 대조했다: command-tmp-worktree-safe.test.js:39(`/^\\s*```(\\w*)/` 승격 주장 — 사실 확인됨), plan-review-command-body.test.js:26/30(0칼럼 고정 확인) · :59(자체 블록 종결자 정규식 — 6b의 fail-open 서술 정확) · :64/:78/:93(면제 훅 부재 — 6d 서술 정확). 그 다음 각 기계 검사가 '알 수 없는 입력'에서 어느 방향으로 접히는지 추적했다: (a) lint가 throw하면 파이프의 JSON.parse가 비어 exit 1 — fail-closed, 문제없음. (b) filesRead/filesExpected 부분 코퍼스 가드 — 실제로 검사됨, 문제없음. (c) 부채 래칫의 textDigest 결속 — 본문 편집 시 면제가 소멸해 fail-closed, 문제없음. (d) 반면 ASSERT_BASELINE·assert 카운트·backlog parity 키·Validation #8은 각각 사후 채움·제자리 완화·키 불일치·비교 부재로 통과 방향으로 접힌다(위 findings). 라이브 완주/acceptance 산출물과 UI2 diff 공집합 검사는 공격했으나 결함을 찾지 못했다. |

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
  "wall_clock_ms": 668403,
  "halt_stage": null,
  "backlog_appended": 5,
  "backlog_skipped_nonblocking": 11,
  "granted": 4,
  "reviewed_plan_hash": "sha256:98d30390534bab8bc2bf9d15a286588cd983b342f743e41fc6e63a9d2b0f4f4e",
  "plan_path": ".claude/plans/diverse-agent-review-m5.plan.md",
  "recorded_at": "2026-08-31T07:56:12.943Z"
}
```
