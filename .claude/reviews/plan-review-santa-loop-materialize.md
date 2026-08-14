# Plan Review Panel — santa-loop-materialize

**Plan**: `.claude/plans/santa-loop-materialize-m2.plan.md`
**현재 상태**: **승인 — R9 `converged`** (4/4 pass, blockingFindings 0). `mccp-plan-codex/santa-loop-materialize-m2.json` 작성 완료, `plan_hash=sha256:c0a43a59…`. `/mccp:prp-implement` 진입 가능. R0~R8의 실결함은 전량 흡수했고 기각 근거는 라운드별 절에 남겼다.

## 라운드 이력

| Round | plan hash | L1 | L2 결과 | 게이트 |
|---|---|---|---|---|
| R0 | `9c3f6b42…` | 인용 3건 위반 → 교정 후 통과 | architect **fail**(CRITICAL 2 · HIGH 1) · security pass · test 유실 · invariant pass | `divergent` |
| R1 | `1846acc4…` | 통과 | architect pass · security pass · test pass · invariant **fail**(HIGH 1 · MEDIUM 1) | `divergent` |
| R2 | `957c0784…` | 통과 | architect **fail**(HIGH 2) · security **fail**(HIGH 1 · MEDIUM 2) · test **fail**(HIGH 1 · MEDIUM 3) · invariant pass(MEDIUM 2 · LOW 1) | `divergent` → 흡수 후 `unavailable`(DD13 hash 드리프트) |
| R3 | `370d1558…` | 통과 | architect **pass** · security **pass** · test **fail**(HIGH 2 · MEDIUM 3) · invariant **fail**(HIGH 1) | `divergent` → 흡수 후 재판정 대기 |
| R4 | `727474d2…` | 통과 | architect **fail**(HIGH 1 · MEDIUM 1) · security **pass** · test **fail**(HIGH 1 · MEDIUM 2) · invariant **fail**(HIGH 3) | `divergent` → 흡수 후 재판정 |
| R5 | `cb6e287f…` | 인용 1건 위반(`santa-loop.md` bare 파일명) → 교정 후 통과 | architect **fail**(HIGH 1) · security **pass** · test **pass** · invariant **fail**(HIGH 1 · MEDIUM 1) | `divergent` → 흡수 후 재판정 |
| R6 | `e36bcfc8…` | 인용 1건 재발 → 전수 grep 교정 후 통과 | architect **pass**(MEDIUM 1) · security **pass** · test **fail**(HIGH 3 · MEDIUM 2) · invariant **pass** | `divergent`(3/4 통과지만 명시 `fail` 1건이 침몰) → 흡수 후 재판정 |
| R7 | `373fee1d…` | 통과 (교정 없음) | architect **pass** · security **fail**(MEDIUM 1) · test **fail**(MEDIUM 3) · invariant **pass**(MEDIUM 1) | `divergent` → 흡수 후 재판정. **HIGH/CRITICAL 0건** — 지적 전량이 MEDIUM인 첫 라운드 |
| R8 | `64a6ab17…` | 통과 (교정 없음) | architect **pass**(0건) · security **pass**(0건) · test **fail**(MEDIUM 3 · LOW 3) · invariant **pass**(0건) | `divergent` → 흡수 후 재판정. **3인이 findings 0건**으로 통과 — 지적이 test 한 관점에만 남음 |
| R9 | `c0a43a59…` | 통과 (교정 없음) | architect **pass**(0건) · security **pass**(MEDIUM 1) · test **pass**(MEDIUM 1) · invariant **pass**(0건) | **`converged`** — 4/4 응답 · 4개 역할 · blockingFindings 0. receipt 작성 |

R2의 아티팩트 판정이 `unavailable`인 것은 내용 판단이 아니라 **DD13 바인딩이 정상 작동**한 결과다 — findings를 흡수해 plan을 고쳤으므로 `reviewed_plan_hash`가 더 이상 디스크의 plan을 서술하지 않는다. 복구는 재봉인이 아니라 L2 재실행이다.

## 라운드별 실결함과 흡수

### R0 — 승인축 해석 충돌 (CRITICAL)

DD3 초판이 `resolution.review_source` **부재**를 골랐으나, I4 문언은 값이 `multi-agent`일 것을 요구한다. 초판이 근거로 든 "(a)는 거짓 proof를 요구한다"도 과장이었다.

- 흡수: DD3을 (a)로 전면 개정. review triple을 싣고 `gate_id === 'mccp-santa-review'` ⇒ `review_source === 'multi-agent'`를 schema가 강제. proof 층 매핑을 표로 명시하고 `layers.l1`만이 유일한 해석 확장임을 밝힘.

### R1 — `main` slug 오진 (HIGH) · 명령줄 미고정 (MEDIUM)

`main`은 fallback이 아니라 `slugFromBranch`가 정당하게 파생하는 브랜치 slug다. 이를 fallback으로 묶어 거부하면 운영자가 받는 진단이 틀린다. 또한 seal이 push **뒤**에 있어 거부가 되돌릴 수 없는 단계 뒤에 터진다.

- 흡수: DD6을 `default`(스코프 미상)와 `main`(generic namespace 충돌 + worktree-local marker 창)으로 분리하고 각각 정확한 메시지를 내도록 개정. seal을 Step 5.5(push **이전**)로 이동. Task 5에 실제 셸 블록과 `--decision "$DECISION"` 필수를 명시.

### R2 — Task 3 입력 계약 부재 (HIGH ×3)

세 관점이 같은 뿌리를 서로 다른 각도로 지목했다. `renderReport`/`buildProof`가 이름과 출력 모양만 있고 **입력 투영과 검증**이 없었다.

| 지적 | 실질 위험 | 흡수 |
|---|---|---|
| architect — `buildProof`의 리뷰어 검증 미명시 | M1이 `record --id A` 중복을 P1로 이연했으므로, A 한 명뿐인 라운드에서 proof가 `roles:2`를 주장할 수 있다 (없는 모델 다양성을 receipt가 주장) | `quorum`·`perspectives`를 FINAL 라운드의 **distinct id**에서 파생. `ids.length < 2`면 `passed:false` + verdict가 `converged`가 아님. P1의 lifecycle 검사를 앞당기지 않고 **주장만** 막는다 |
| architect — 리뷰어 출처 미명시 | `aggregate()`는 카운트만 반환하므로 리뷰어 배열의 출처가 없었다 | `ledger.read`(라운드 골격) + `ledger.readReviewers`(envelope 전용, `raw` 미포함) 명시 |
| security — `renderReport`가 `state` 전체 수신 | `.claude/reviews/`는 git-tracked이므로 `raw` 누출 시 리뷰어 전문이 영구 커밋. UI4 준수가 "렌더러가 안 건드린다"는 약속에 걸려 있었다 | `seal`이 먼저 투영해 `raw`를 경계에서 소거. 렌더러에 `raw`를 실을 **인자가 없다** |
| test — Task 2 Mirror 오인용 | gate별 `resolution` 제약에는 선례가 없는데 있는 것처럼 인용했다 | 신규 코드임을 명시 + 실제 코드 스케치를 plan에 삽입 |
| security/test — SLUG_RE·경로 봉인 미명시 | `.claude/reviews/` 경로 조립 전 검증이 계약에 없었다 | seal 7단 순서에 SLUG_RE 검증(경로 조립 이전) + `assertContained` 명시 |
| test/invariant — 미검증 주장 4건 | DD5 읽기전용·UI4 누출·divergent proof·A-twice가 전부 test 없이 산문이었다 | Task 6을 14항목으로 재작성. 각 항목이 "없으면 red가 되지 않는 주장"에 1:1 대응 |

### R3 — seal exit code 미분기 (HIGH) · 인용 함정 · Task 순환

architect·security가 **처음으로 함께 통과**했다. 남은 둘 중 실질은 셋이다.

| 지적 | 실질 위험 | 흡수 |
|---|---|---|
| invariant HIGH — Task 5 셸 블록이 `SEAL_EXIT=$?`를 캡처만 하고 분기하지 않음 | 산문은 "비영점이면 push 안 함"인데 블록을 그대로 옮기면 exit code가 읽히기만 하고 **push는 그대로 일어난다**. 이 repo가 반복 검출해온 "산문은 HALT, 코드는 통과" 결함 | 블록에 `if [ "$SEAL_EXIT" -ne 0 ]; then … exit; fi` 삽입 + Validate에 분기 존재 단언(c축) 추가 |
| test MEDIUM — Mirror가 `schema.js:824-834`(`merged_verify_*`, **makeSkeleton에 등록됨**)과 `write.js:690-700`(`review_l3_invoked`, 미등록)을 나란히 인용 | 구현자가 앞쪽을 따라 `santa_*`를 `makeSkeleton`에 넣으면 DD4의 hash 안정성이 깨진다 | 두 인용의 차이를 Mirror에 명시하고 따라할 대상을 못박음 |
| test MEDIUM — Task 2·3의 Validate가 Task 6이 만드는 test 파일을 가리킴(순환) | 각 Task가 자기 작업을 검증하지 못한다 | `## Tasks` 머리에 소유 표를 두고 test를 정당화 Task 안에서 쓰도록(TDD) 재배치. Task 6은 잔여+전체 스위트+커버리지 감사 |

**흡수하지 않은 지적 2건(test HIGH ×2) — 범주 오류다.** "Task 6의 test가 아직 존재하지 않아 review 시점에 반증 불가"는 **모든 plan에 정의상 참**이다. plan은 앞으로 쓸 test를 서술하는 문서이고, 그 test의 실재를 plan 자신이 증명할 수는 없다. 이것을 blocking으로 받으면 어떤 plan도 이 게이트를 통과하지 못한다. 다만 그 지적의 **정당한 핵**(Task 순환)은 위에서 닫았다.

### R4 — UI14 절반 미배선 (HIGH ×2, 독립 2인) · cap 출처 미고정 (HIGH)

R3에서 통과했던 architect가 다시 fail로 돌아섰다. R3 흡수가 새 표면(Task 5 셸 블록)을 만들었고 그 표면의 결함을 이번 라운드가 잡았으므로, 회귀가 아니라 **탐지 심화**다. 실결함은 2축이고 **셋 다 소스 대조로 사실 확인**했다.

| 지적 | 실질 위험 | 흡수 |
|---|---|---|
| architect HIGH + test HIGH (독립 2인 동일 지적) — 캡 도달 종료 경로의 seal 배치가 미정의 | plan 269행이 UI14로 "양쪽 종료 경로 봉인"을 주장하는데 코드는 Step 5.5(push 직전)에만 있었다. `santa-loop.md:77`은 `BEGIN_EXIT` 비영점(=캡 도달 exit 12)에서 ESCALATION 출력 후 **즉시 종료**하므로 Step 5.5에도 Step 6에도 도달하지 않는다 — UI14의 절반이 구조적으로 빈 상태 | Task 5에 두 번째 봉인 지점(`BEGIN_EXIT -eq 12` 분기 안)을 코드 블록으로 배선. 75·2는 종료가 아니라 실패이므로 미봉인. 캡 경로의 seal 실패는 loud stderr + **exit 12 보존**(막을 push가 없고, 1차 진단인 캡 소진을 2차 사고가 가리면 안 된다). Validate를 4축으로 확장 — (a)를 hit 여부에서 **개수 2**로 바꾼 것이 핵심이다(1개만 배선해도 통과하던 축) |
| invariant HIGH ×3 (동일 결함 + 그 test 따름정리 + 명문화 요구) — `seal`이 `state.cap`을 `aggregate()`에 전달하도록 plan이 요구하지 않음 | `aggregate`는 `opts.cap`이 정수가 아니면 `counter.parseCap(process.env)`로 폴백한다(`ledger.js:478`). 라운드를 실제 게이트한 cap은 `beginRound`가 저장한 `state.cap`이다(`ledger.js:372-376`). 두 시점 사이 env가 바뀌면 receipt가 원장을 **오기**한다 — fail-closed 방향도 아니다 | Task 3에 `cap: state.cap` 명시 전달을 요구사항으로 못박고 근거를 file:line으로 고정. `meta.santa_cap`도 같은 출처. Task 6 (16)이 `state.cap=2` × env `5`로 **어긋나게 둔** fixture로 폴백을 red화 — 값 일치만 보는 test는 두 cap이 같은 fixture에서 폴백을 관측하지 못한다는 invariant의 두 번째 지적을 그대로 반영 |
| test MEDIUM — Task 6 Validate가 디렉토리 단위라 test 파일 미생성도 초록 | 커버리지 계약이 강제되지 않는다 | Task 6·Validation 블록 모두 두 파일을 **이름으로 먼저** 실행하도록 변경 |
| test MEDIUM — `seal.js` exit code 보장 부재 | Task 5의 `SEAL_EXIT -ne 0` 분기가 전적으로 여기 의존하는데, seal이 오류에 비영점을 내지 않으면 그 분기는 영원히 거짓이고 "seal 실패는 push를 막는다"가 코드상 성립하지 않는다 | Task 3에 exit code 계약 명문화(0 · 2 · 75, `12`는 cap 전용 재사용 금지) + Task 5 분기와의 의존 관계 명시 |

**흡수하지 않은 지적 1건(architect MEDIUM — 리포트 지속성 모델 모순) — 오독이다.** "gitignored에 write"는 리포트가 아니라 **proof**(`.claude/state/santa-loop/`)를 가리킨 문장이고, 리포트는 `.claude/reviews/`로 git-tracked이며 DD2가 그 사실 위에 `raw` 소거 경계를 세운다. `.gitignore:48`이 proof 경로를 이미 커버하므로 `.gitignore`가 Files to Change에 없는 것도 정상이다(`git check-ignore`로 확인). 다만 한 문장이 두 산출물을 섞어 읽히게 둔 것은 사실이라, 두 경로의 지속성 모델을 명시 대비하는 문구를 seal 7단 (6)에 추가해 재발을 막았다.

### R5 — 캡 분기 명세가 산문보다 약한 코드 (HIGH ×2)

test가 pass로 전환됐다(R4의 4건 흡수 확인). 남은 지적 3건은 **전부 R4에서 내가 새로 쓴 캡 분기 명세 한 곳**에 몰렸다 — 흡수가 만든 새 표면을 다음 라운드가 즉시 공격한 형태로, R3→R4와 같은 패턴이다.

| 지적 | 실질 위험 | 흡수 |
|---|---|---|
| architect HIGH — Task 5 Validate (d)의 산문은 "분기 **내 위치**"를 주장하는데 Validation 2c 코드는 `seal > cap` 하한만 검사 | 상한이 없으므로 분기 **바깥** 아래쪽에 놓인 seal도 통과한다. 중첩을 주장하면서 중첩을 검증하지 않는 것이고, 이는 산문/코드 괴리라는 R3와 **같은 종류**의 결함이다 | 2c 코드에 종료 토큰 상한 추가(`cap < seal < exit "$BEGIN_EXIT"`) + 축 하나라도 거짓이면 **비영점 종료**(출력만 하면 검증이 아니다). Task 5 Validate 산문을 코드와 토큰 단위 1:1로 재작성 |
| invariant HIGH — 캡 분기 코드 블록에 종료문이 없음 | NICE 경로는 `exit "$SEAL_EXIT"`를 명시하는데 캡 경로는 `fi`로 끝나 fall-through 여지가 있었다. **실제 `santa-loop.md:77`을 열어보니 그 분기는 애초에 bash가 아니라 산문이었다**("print ESCALATION and end") — 내 스니펫이 존재하지 않는 블록 안에 들어간다고 가정한 것이다. 캡 게이트가 존재하는 이유 자체가 무효화되는 경로 | Task 5가 **분기 자체를 실행 가능한 블록으로 만들도록** 재명세. `if [ "$BEGIN_EXIT" -ne 0 ]` → 12면 seal → ESCALATION → `exit "$BEGIN_EXIT"`. 동작(리뷰어 미발화·ESCALATION·종료)은 무변경이고 형태만 바뀌므로 UI13 위반이 아님을 명시 |
| invariant MEDIUM — Validate가 종료문 존재를 강제하지 않음 | 위 계약이 구현에서 빠져도 탐지되지 않는다 | (d) 축이 `exit "$BEGIN_EXIT"` 존재 + 위치를 동시에 단언 |

**L1이 내 편집을 한 번 잡았다.** R4 흡수에서 `santa-loop.md:77`을 bare 파일명으로 인용했고 `C6_UNRESOLVED_CITATION`으로 걸렸다 — 이 plan의 기존 인용은 전부 repo-root full path(`plugins/mccp/commands/work.md:788-795`)다. full path로 교정 후 통과. L2는 발화하지 않았고 예약은 재사용해 카운터 이중 계상을 피했다.

### R6 — Action이 test 파일 생성을 서술하지 않음 (HIGH ×2) · divergent l1 미명시 (MEDIUM)

architect·invariant가 pass로 전환돼 **3/4가 통과**했다. 그럼에도 divergent인 것은 `decideQuorum`이 명시 `fail` 1건을 blocking으로 취급하기 때문이며(quorum.js), 설계대로다.

| 지적 | 실질 위험 | 흡수 |
|---|---|---|
| test HIGH ×2 — Task 2·3의 **Action**이 test 파일 생성을 서술하지 않는데 Validate는 그 파일을 실행 | 파일명은 Files to Change(CREATE)와 Validate에만 있었다. 구현자는 Action을 읽고 작업하므로, 코드 변경만 하고 Validate에서 없는 파일을 만나게 된다 — plan이 자기 머리말(196행)에서 경고한 순환이 표 아래에서 되살아난 형태 | Task 2·3 Action에 **파일 생성 소유**를 명문화(2 → `santa-review-gate.test.js`, 3 → `santa-seal.test.js`). Task 6 Action은 "만들지 않고 잔여 항목을 덧붙인다"로 정정하고 순서(2→3→6)를 못박음. 머리말에도 생성 소유 문단 추가 |
| architect MEDIUM — divergent proof의 `layers.l1` 값 미명시 | 층 매핑 표가 converged만 다뤄, divergent에서 l1을 무엇으로 찍을지 근거가 없었다 | DD3에 divergent l1을 **두 값으로 분기**해 명시 — NAUGHTY는 `'converged'`(`begin-round`가 라운드를 열어줬다), 캡 도달은 `'divergent'`(거부했다). schema는 converged일 때만 층을 게이트하므로 이 구분은 **강제되지 않는 정직성 축**이고, 그래서 Task 6 (15)가 유일한 강제다 |
| test MEDIUM — 같은 파일에 Task 2와 Task 6이 항목을 나눠 갖는데 실행 순서 미문서화 | 위 생성 소유 명문화로 함께 닫힘 | Task 6 Action에 순서 명시 |
| test MEDIUM — `ownership.md` 검증이 `grep -c ""`(행 수 세기) | 3부 구성·heading depth·교집합 어느 것도 검증하지 않는다. 검증처럼 보이는 비검증 | Validation 5번을 구조 검사 스크립트로 교체(heading depth ≤ 3 · 3부 앵커 · P1/P2/P3 교집합 ∅, 비영점 종료). green/red 합성 fixture로 판별력을 실측 확인 |

**흡수하지 않은 지적 1건(test HIGH — "cap 출처 계약을 반증할 test가 아직 없다") — R3와 같은 범주 오류다.** 근거로 든 것이 "Glob 결과 `santa-seal.test.js`가 존재하지 않는다"인데, 이는 **모든 plan에 정의상 참**이다. plan은 앞으로 쓸 test를 서술하는 문서이고 그 test의 실재를 스스로 증명할 수 없다. 다만 이번에는 그 지적의 정당한 핵(Action이 생성을 서술하지 않아 *어느 Task도 그 test를 만들지 않을 수 있다*)이 위 HIGH ×2와 동일하므로, 핵은 흡수됐고 잔여만 기각한다.

### R7 — schema 검사 위치가 가드 안 (MEDIUM) · 스코프 미검증 (MEDIUM ×2) · l1 분기 절반 미검증 (MEDIUM ×2)

**HIGH/CRITICAL이 처음으로 0건**이 된 라운드다. 지적 5건 전량 MEDIUM이고, 그중 하나는 실질이 크다.

| 지적 | 실질 위험 | 흡수 |
|---|---|---|
| security MEDIUM — Task 2의 gate-id 검사 위치가 `if (reviewPresent.length > 0)` 가드 **안**으로 지정됨 | 실제 코드를 열어 확인했다: `review_source` 값-기준 분기(`schema.js:236-259`)는 전부 그 가드 안에서 닫힌다. "그 바로 다음"에 넣으면 **review triple이 통째로 없는 santa receipt가 검사를 건너뛴다** — DD3의 "부재도 REJECT"가 정확히 반대로 동작하고, `write.js`의 `resolution.converged` 기본값 `true`와 결합해 승인 기록 없는 receipt가 converged로 읽힌다. 이 milestone이 5.6b에서 한 번 고친 실패와 같은 형태 | 코드 스케치 주석을 "**가드 바깥(형제)**"으로 교정하고 위치가 계약임을 명문화. Task 6 (5)를 4케이스(`codex`·`hybrid`·`review_source`만 부재·**triple 전부 부재**)로 확장 — 마지막이 위치 계약을 강제하는 유일한 test다 |
| test MEDIUM ×2 — 항목 9·12가 `layers.l1` 값을 단언하지 않음 | R6에서 divergent l1을 두 값으로 분기해 놓고 15(캡 도달 = `'divergent'`)만 강제했다. 상단 행(NAUGHTY·A-twice = `'converged'`)은 미검증으로 남아 분기의 절반이 산문이었다 | 9·12에 `layers.l1==='converged'` 단언 추가 |
| test MEDIUM + invariant MEDIUM (동일 축) — 2c가 행 순서만 보고 bash 스코프를 보지 않음 | 닫는 `fi` **뒤**에 놓인 seal도 통과한다. bash는 그때 다음 블록으로 fall-through하므로, 중첩을 주장하는 검사가 중첩을 전혀 검증하지 못한다 | 2c를 **`if`/`fi` 깊이 추적** 검사로 교체: (d) seal ∈ `-eq 12` 블록, (e) `exit "$BEGIN_EXIT"` ∈ `-ne 0` 블록 ∧ `-eq 12` 블록 뒤. 합성 fixture 3종으로 판별력 실측 — 올바른 중첩 exit 0 · **리뷰어가 지적한 정확한 우회(seal이 `fi` 바깥) `d=false` exit 1** · 현 미구현 전축 false |

**리뷰어 계약과의 편차 1건(관찰, 흡수 아님).** 에이전트 프롬프트는 "HIGH/CRITICAL finding이면 verdict=fail"을 명시하는데, 이번 라운드의 security·test는 **MEDIUM만 내고 fail**을 반환했다. 계약보다 엄격한 판정이라 안전 방향이지만, quorum이 명시 `fail`을 severity와 무관하게 blocking으로 취급하므로 MEDIUM만으로 게이트가 침몰한다. 판정 기준 자체는 `mccp:review-*` 에이전트 프롬프트 축이라 이 plan의 범위 밖이고, 지적 내용은 모두 정당했으므로 그대로 흡수했다.

### R8 — 커버리지 계약이 산문에만 존재 (MEDIUM ×3) · mutate 스파이 부재 (LOW)

architect·security·invariant **셋 다 findings 0건**으로 통과했다. 지적이 test 한 관점에만 남았고, 그 핵심은 "계약은 있는데 강제가 없다"는 한 축이다.

| 지적 | 실질 위험 | 흡수 |
|---|---|---|
| test MEDIUM ×2 — 16항목 커버리지가 산문일 뿐, 파일 이름 실행은 *있는 test가 통과하는지*만 본다 | 14/16만 쓴 구현도 초록이다. 하필 빠지기 쉬운 것이 9·15(divergent edge case)라 계약의 핵심이 조용히 소실될 수 있다 | test 이름 `[N]` 규약 도입 + **Validation 2d 커버리지 감사** 신설 — 두 파일에서 `[N]`을 수집해 1~16 전체 집합과 대조하고 누락 항목을 특정해 비영점 종료. fixture 실측: 16/16 exit 0 · 9·15 누락 시 `MISSING items: [9,15]` exit 1 · 파일 부재 시 파일명 특정 exit 1 |
| test MEDIUM — Task 2·3 Action이 test 생성을 **선언형**으로만 서술 | R6 흡수가 설명 문단에 들어가 Action 본문은 코드 변경만 서술한 채였다. 구현자는 Action을 읽는다 | 두 Action **본문에 명령형 절**을 삽입("이 Task에서 …를 생성하고 항목 …을 작성한다") |
| test LOW — 항목 11이 디스크 바이트만 봐서 in-memory `mutate` 호출을 못 잡음 | DD5가 금지하는 것은 "결과적으로 파일이 안 바뀜"이 아니라 **mutation 경로 진입 자체**다 | 11을 3축으로 확장 — (a) 바이트 동일 · (b) 재실행 멱등 · (c) **`ledger.mutate` 스파이 호출 0** |

**흡수하지 않은 지적 2건.** (1) "Validation은 구현 전에 실행할 수 없다" — 리뷰어 스스로 근거란에 "This isn't a defect—it's expected behavior for a multi-task plan"이라 적었다. 자기 부인한 지적은 흡수 대상이 아니다. (2) "buildProof가 `l1='converged'`를 하드코딩해도 test 코드를 읽지 않으면 확인 불가" — 잔여는 R3·R6과 같은 범주 오류(plan은 test의 실재를 스스로 증명할 수 없다)이고, 정당한 핵인 "15의 fixture가 캡 도달이어야 한다"는 이미 항목 15 본문에 명시돼 있다. 다만 위 2d 커버리지 감사가 9·15의 **존재**를 기계 강제하므로 지적의 실효 부분은 함께 닫혔다.

### R9 — 승인 (converged)

4인 전원 pass. `decideQuorum` 결과 `responded 4/3 · roles 4 · blockingFindings 0`, `verify-proof` ok. `mccp-plan-codex/santa-loop-materialize-m2.json`을 `review_verdict=converged` · `review_source=multi-agent` · review triple 봉인으로 작성했다.

잔여 MEDIUM 2건은 **blocking이 아니며 흡수하지 않았다** — 승인 라운드에서 plan을 고치면 `reviewed_plan_hash` 바인딩이 깨져(DD13) receipt를 봉인할 수 없고, 세션 에이전트 cap(24/24)도 소진돼 재판정이 불가능했다. 둘 다 구현 단계에서 다룰 성질이고 `.claude/reviews/plan-review-santa-loop-materialize-m2.md`에 전문이 남아 있다:

- **security MEDIUM** — Validation 2d는 `[N]` 항목의 *존재*만 세고 항목 5의 4개 sub-case 유무는 못 본다. 5는 Task 2의 위치 계약(가드 바깥)을 강제하는 유일한 test라, sub-case 1개만 써도 2d가 통과한다. 구현 시 5의 4케이스를 반드시 다 쓸 것.
- **test MEDIUM** — 2c는 bash를 파싱할 뿐 실행하지 않고, 항목 1~16 어디에도 `/mccp:santa-loop` end-to-end 호출이 없다. 구조 검사는 배선을, 항목 15는 seal 값을 각각 덮지만 둘을 잇는 실행 경로는 미검증이다.

## 결론

R0~R9 총 10라운드. **R9에서 승인**됐고 `mccp-plan-codex/santa-loop-materialize-m2.json`이 존재하므로 `/mccp:prp-implement` 진입이 열렸다.

- 수렴 추이(pass 인원): R4 1 → R5 2 → R6 3 → R7 2 → R8 3 → **R9 4**. HIGH/CRITICAL은 R7부터 0건.
- 에이전트 소비: 이전 세션 16/24 + 이번 세션 24/24(R4~R9 6라운드 × 4인). 예약은 매 라운드 정산(delta 0), 잔여 pending 0.
- **plan 본문은 확정이다.** Phase 1~4로 재생성하지 말 것 — 10라운드 누적 흡수가 사라진다.
- `plan_hash`는 `sha256:c0a43a59…`이고 receipt의 `reviewed_plan_hash`와 일치한다. **plan을 수정하면 이 바인딩이 깨져 receipt가 무효가 되므로**(DD13), 구현 중 plan 변경이 필요하면 게이트를 재실행해야 한다.
