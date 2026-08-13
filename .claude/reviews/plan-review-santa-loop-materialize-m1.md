# Plan Review Panel — santa-loop-materialize-m1

**Plan**: `.claude/plans/santa-loop-materialize-m1.plan.md` · **Plan version**: `sha256:954b24bc9a4e90cd65f32371474b761d75bcb52ee40f08b268e3fbe532f2c584`
**Verdict**: divergent via multi-agent
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) — 통과 실패 사유는 응답 수가 아니라 blocking finding 5건
**Layers**: L1 converged · L2 divergent (2 fail / 2 pass) · L3 not fired (`MCCP_PLAN_REVIEW_L3=0`)

> 위 머리글은 **round 1** 시점의 값이다. 라운드마다 plan 버전과 판정이 바뀌므로 각 라운드의
> 값은 해당 `## Round N` 제목에 있다.
>
> **총 9라운드로 종료했다** — multi-agent 5(R1~R5) + Codex 4(R6~R9). 최종 plan 버전은
> `sha256:55b2352d…`이고 **receipt는 발행되지 않았다.** 종료 사유는 라운드 수가 아니라
> 마지막 네 라운드가 전부 *직전 흡수가 만든 구멍*을 겨눴다는 것이다(patch-chasing).
> 계측은 아래 "9라운드 측정치" 절, 라운드별 상세는 plan 본문의 `## Codex Adversarial Review`.

## Round 1

### Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Step 3 리뷰어 verdict가 Step 4 `cli.js verdict`로 흐르는 경로가 미명세 | Task 4는 `record`/`verdict` subcommand만 열거하고 파라미터·저장 위치·조회 방식이 없음. Task 2는 행 스키마를 P1으로 이연 |
| architect | HIGH | `decideVerdict`의 `reviewers` 파라미터 스키마 미정의 | Task 3이 시그니처만 적고 `reviewers`의 형태(배열? a/b 객체?)를 말하지 않음. test 설명은 출력 동작이지 입력 스키마가 아님 |
| architect | MEDIUM | `record` subcommand가 Task 4에만 등장하고 호출 지점이 없음 | Task 5는 `resolve-decision`·`begin-round`·`verdict` 3개만 호출. `record`의 배선 공백 |
| architect | MEDIUM | Acceptance에 verdict 데이터 경로 end-to-end 검증 항목 부재 | 12개 항목이 cap·gitignore·회귀·버전만 검사. `record`→`verdict` round-trip 미검증 |
| invariant | HIGH | 캡 게이트가 리뷰 사이클 **뒤**에 놓여 DD4의 사전 거부 약속과 모순 | Task 5가 `begin-round`를 Step 5(NAUGHTY fix cycle)에 둠 — Step 3·4가 이미 끝난 뒤. 라운드 4 리뷰어가 실행된 뒤에야 거부됨. acceptance는 exit 12만 보고 "리뷰어가 안 돌았는가"는 안 봄 |
| invariant | MEDIUM | PRD 1순위 지표는 "receipt 봉인"인데 M1은 receipt를 쓰지 않음 | PRD Success Metrics 1행 vs M1 Acceptance 10번. DD2가 의도적 이연이나 지표 미달 상태가 문서화되지 않음 |
| invariant | MEDIUM | escalation drift 경고의 출력 지점이 미명세·미검증 | Task 2는 `escalation` 필드 반환, Task 4는 "JSON stdout only", Task 5는 "경고 출력만 잔류". 누가 출력하는지 불명확하고 acceptance가 검사하지 않음 |

### Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | `decision.js:199/25-30` 대조로 slug 설계 검증 · `orchestration-runaway.js:231/145` 대조로 cap oracle 검증 · `.gitignore:38,42` 선례 확인 · 현 `santa-loop.md` Step 3~4 대조 · `state-injector.js parseFrontmatter`로 STATE.md 판독 가능성 확인. 그 뒤 Step 3↔Step 4 계약에 집중해 결함 확보 |
| security | pass | cap exit 12 · `SLUG_RE`로 path traversal 차단 확인 · `path.join` 정규화 · env 파싱 loud fail-open · M1이 receipt를 안 써서 dual-review 우회 불가 · escalate_pending 주입 경로 · DD7 단일 writer 가정. HIGH/CRITICAL 없음 |
| test | pass | cap 강제·verdict 보존 4조합·dual-review 우회(`review-verdict.test.js:368-369,415`에서 multi-agent 배제 확인)·slug 편입·파일 소유권·산문 캡 제거·기존 receipt corpus 회귀 7축 공격. 반증 실패 |
| invariant | fail | DD4/DD5 사전-사후 거부 모순 · PRD 지표 ↔ M1 acceptance 격차 · escalation 경고 skip-predicate 공백 |

## Round 2 — `sha256:fc7de4fd…` · divergent (4 fail / 0 pass)

세 관점이 독립적으로 **같은 뿌리**를 찍음: round 1이 신설한 DD9 envelope의 **출처·변환이 미정의**.

| Perspective | Severity | Claim |
|---|---|---|
| architect | HIGH | `record`에 `--id`/`--model` 파라미터가 없는데 envelope는 두 필드를 요구 |
| architect | MEDIUM | 상태 파일 JSON 스키마 미명세 |
| security | HIGH | envelope 검증 규칙 부재 — 불량 입력이 원장 오염 |
| security | MEDIUM | `--reviewer-file` path traversal 미차단 |
| security | MEDIUM | ledger 초기화·손상 처리 미명세 → 캡 오작동 |
| security | MEDIUM | 파일 permission 미지정 (§3.6 `0o600` 선례) |
| test | MEDIUM | `exit_reason` ↔ `exitReason` 혼용 — plan 내부 불일치 |
| invariant | HIGH | envelope 변환 주체 미명세 — 현 Step 3 출력은 `{verdict,checks,critical_issues,suggestions}`로 envelope와 **다름** |
| invariant | HIGH | `escalate_pending_decision_id` 우선 시 반환값 모호 → 원장이 엉뚱한 slug에 쌓임 |
| invariant | MEDIUM | 캡 순서가 수동 코드 열람으로만 검증 |
| invariant | MEDIUM | `/mccp:work` 병렬 route가 DD7 단일-writer 전제를 깨뜨림 |
| invariant | MEDIUM | envelope round-trip test의 입력 포맷 미정의 |

**전량 흡수** — DD9 재작성(변환 주체 = `cli.js record`, fail-closed 검증, path containment) · DD2 신설(state schema + `read()` fail-closed + `0o600`) · DD3 반환값 표 · DD7 반전(`evidence-lock#guardedReadModifyWrite` 재사용, 신규 lock 0줄) · DD10 신설(camelCase 통일) · 캡 순서 test 자동화.

## Round 3 — `sha256:2ac373e8…` · divergent (3 fail / 1 pass)

security가 pass로 전환. 나머지 findings는 **두 부류로 갈림** — 아래 triage는 `/mccp:plan` §5.4 YAGNI 규약을 따름.

| Perspective | Severity | Claim | Verdict |
|---|---|---|---|
| invariant | CRITICAL | 브랜치명 변경 시 slug가 바뀌어 캡이 조용히 리셋 | **ACCEPT_NOW** |
| invariant | HIGH | `resolveStatePath` 3단 fallback 미명세 · cwd 기준이면 캡 분열 | **ACCEPT_NOW** |
| architect | CRITICAL | envelope가 `checks`·`suggestions`를 버려 P1의 severity 입력이 소실 | **ACCEPT_NOW** |
| architect | HIGH | `record`의 출력 포맷 미문서 | **ACCEPT_NOW** |
| test | HIGH | Step 3 구간 test가 naive 문자열 위치면 Step 2 이동을 통과 | **ACCEPT_NOW** |
| test | MEDIUM ×2 | "test 코드가 plan에 없어 검증 불가" | **REJECT_YAGNI** |
| invariant | HIGH ×2 · MEDIUM ×2 | "acceptance는 희망이지 강제가 아님 / lock 래핑 코드가 안 보임 / fixture 미제시" | **REJECT_YAGNI** |

**기각 사유** — `/mccp:plan` 산출물은 **명세**이고 test 소스는 `/mccp:prp-implement`가 만든다. "plan 안에 test 코드가 없다"는 어떤 plan도 통과할 수 없는 조건이며, 이를 수용하면 plan 단계에 구현을 끌어와 게이트의 층위가 무너진다. 해당 항목들은 Task 1~4의 `Validate` 줄과 Acceptance 체크박스로 이미 위임돼 있고, 미충족은 implement 게이트에서 red로 드러난다.

**ACCEPT_NOW 5건 흡수** — DD2에 `raw` 보존 · DD3에 캡 단위 천장 명시 + `--decision <slug>` 고정 손잡이 · `resolveStatePath` 3단 명시 + **git repo root 앵커** · `record` 출력 스펙 · Step 3 slice 우선 확정 test.

## Round 4 — `sha256:3a7f3182…` · **divergent** (1 pass / 3 fail) — 패널 종료

프롬프트에 artifact-scope 절을 추가(“plan은 명세이고 test 소스는 out of scope”)한 뒤 `test` 관점이 pass로 전환. 남은 fail은 두 갈래.

| Perspective | Severity | Claim | Verdict |
|---|---|---|---|
| architect | CRITICAL ×2 · MEDIUM | `BRANCH_BASED_COMMANDS` 편입이 `/mccp:pr` 전용 **implement-receipt fallback**([decision.js:244-251](../../plugins/mccp/scripts/receipt/decision.js))을 santa에 물려준다. santa는 receipt를 안 쓰므로 `receiptExistsForSlug`가 **항상 false** → 원장이 남의 decision slug 아래로 | **ACCEPT_NOW** |
| security | CRITICAL | round 3이 신설한 `--decision <slug>`이 검증 없이 경로 조립에 들어간다 → `--decision ../../evil` 디렉토리 탈출 | **ACCEPT_NOW** |
| invariant | MEDIUM | `raw`가 원본 바이트인지 재직렬화인지 모호 | **ACCEPT_NOW** |
| invariant | HIGH ×2 · MEDIUM ×4 | "test 코드·bash 코드·lock 래핑이 plan에 없다" | **REJECT_YAGNI** (round 3과 동일 부류) |

architect CRITICAL은 **소스로 직접 확인**했다 — `decision.js:244-251`의 fallback 블록이 실재하고 주석이 그 목적을 `/mccp:pr` 해소로 명시한다. security CRITICAL은 **round 3의 수정이 만든 결함**이다.

**흡수** — `decision.js` 편입 자체를 포기하고 `santa/ledger.js#deriveSantaDecisionId`가 3단 규칙을 자체 소유(`decision.js`는 상수 export 2줄만, 동작 변경 0) · `--decision`에 `SLUG_RE` + `assertContained` 이중 방어, 전 subcommand 적용 · `raw`는 재직렬화 객체로 명시.

## Round 5 — `sha256:3029f879…` · **divergent** (3 pass / 1 fail)

round 4 이후 흡수된 3건이 반영된 새 plan 버전(`3a7f3182…` → `3029f879…`)에 대한 재심사. 응답 4/4 · 4 distinct roles로 **정족수 자체는 충족**했고, 차단 사유는 blocking finding 2건(`test/HIGH` · `test/FAIL`)이다.

L1 converged(위반 0) · L2 divergent · L3 미발화(`fires.l3=false`).

### Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | **HIGH** | Validation의 산문 캡 제거 검사가 **비단언적**이라 절대 실패하지 않는다 | plan L240 `grep -n "Maximum 3 iterations" … \|\| echo "OK"` — 패턴이 **발견되면** grep이 exit 0이라 `\|\|`가 안 타고 전체가 exit 0. 미발견이면 `echo`가 타서 또 exit 0. 양쪽 다 성공 |
| test | MEDIUM | Validate가 아직 존재하지 않는 test 파일 2개를 실행 | plan L233-234 ↔ Files to Change L53-54 (CREATE). 현 시점 부재 |
| test | MEDIUM | DD4 test가 "Step 3 **첫 줄**"이 아니라 "Reviewer A보다 앞"만 단언 | plan L216 "Step 3 첫 줄" ↔ Acceptance L268 위치 비교. Step 3 5번째 줄이어도 통과 |
| test | MEDIUM | `BRANCH_BASED_COMMANDS` 무변경을 강제하는 자동 검사 부재 | Acceptance L272는 `git diff` 육안 확인. Validation은 회귀 test만 열거 |
| invariant | MEDIUM | exit code 표(L200-208)에 **lock 획득 실패**가 없다 | plan L198 "예외까지 전부 매핑" ↔ 표에 lock 실패 행 없음. mirror인 `plan-review/cli.js`는 미매핑 예외를 12로 흡수 |
| invariant | MEDIUM | 캡 순서 test가 텍스트 위치만 봐 **exit code 무시 셸**을 잡지 못한다 | plan L222·L268 — `begin-round` 문자열 위치 단언. 호출은 하되 비영점 exit을 무시하는 구현이 통과 |
| invariant | MEDIUM | `writeFileAtomic`이 mode 인자 없이 써서 chmod 이전 race window | `evidence-lock.js:241` `fs.writeFileSync(tmp, content, 'utf8')` — DD7이 이미 인정한 한계지만 window 자체는 잔존 |
| invariant | LOW | `assertContained`의 `expectedParentDir` 인자가 미지정 | plan L110은 호출만 명시. `path-containment.js:29`는 3-arg 시그니처 |

### Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 전 인용 대조(`orchestration-runaway.js` 함수 4개 · `evidence-lock.js` API · `decision.js` 상수 · `.gitignore` 선례 · `slugFromBranch`) · ledger/counter 불변식 분리(`rounds.length` SoT) · DD3의 `BRANCH_BASED_COMMANDS` 함정 회피 · 손상 처리 fail-closed · lock 사용과 mode 책임 배치 · envelope의 `raw` 보존 · 캡 배치의 토큰 절약 · path containment 심층 방어 · 별도 CLI 프로세스라 재진입 lock 문제 없음. **반증 실패** |
| security | pass | `SLUG_RE`의 문자 수준 차단 · `assertContained`의 `fs.realpathSync` symlink 안전성 · 상태 파일 생성 race(evidence-lock 5s lease) · chmod 이전 TOCTOU window · 증거 유출(gitignored·`0o600`·비밀 없음) · JSON injection · regex 우회 · slug fallback 함정 · `--reviewer-file` containment · 상태 손상을 통한 캡 우회(`read()` throw). **반증 실패** |
| test | **fail** | 산문 캡 검사 명령의 단언성 · 신규 test 파일 부재 · "첫 줄" 요구와 위치 단언의 격차 · `BRANCH_BASED_COMMANDS` 보존의 자동화 공백 · Validate ↔ Acceptance의 자동/수동 경계 |
| invariant | pass | 캡 배치와 exit code 존중 · lock 실패 매핑 · chmod race · `assertContained` 대상 · 병렬 접근 · 손상 파일 · receipt anchoring(M2 소관) · `--decision` traversal. **게이트가 조용히 열리거나 캡이 fail-open되는 경로는 찾지 못함** |

### 이번 라운드의 성격

round 1~4와 다른 점이 둘 있다. 첫째, **architect·security·invariant 세 관점이 반증에 실패**했다 — round 1(2 fail) · round 2(4 fail) · round 3(3 fail) · round 4(3 fail)에 비해 실질 수렴이다. 둘째, 남은 fail이 round 3·4를 지배하던 "plan에 test 코드가 없다" 부류(REJECT_YAGNI)가 **아니다** — `test/HIGH`는 plan이 **실제로 적어 둔 명령 한 줄**의 결함이고 셸에서 그대로 재현된다:

```
$ grep -n "Maximum 3 iterations" plugins/mccp/commands/santa-loop.md || echo "OK: prose cap removed"
148:**Maximum 3 iterations.** …
--> exit=0
```

산문 캡이 **제거되지 않은 현 상태에서 검증이 성공을 보고한다.** 이 명령은 어떤 입력에서도 실패할 수 없으므로 Acceptance L279("산문 캡 제거")를 지지하지 못한다. patch-chasing이 아니라 원 산출물의 결함이다.

## Round 6-9 — Codex 단독 (`MCCP_PLAN_REVIEW=codex`)

R5 종료 후 운영자가 리뷰어를 **Codex(GPT-5.4 계열) cross-model로 전환**했다. 라운드별 상세와 흡수 내용은 plan 본문의 `## Codex Adversarial Review`가 소유하고, 여기에는 계측만 남긴다.

| 라운드 | plan 버전 | findings | 겨냥 대상 |
|---|---|---|---|
| R6 | `bb4f7f63…` | HIGH 1 · MED 1 | R5 흡수가 넣은 `assertContained` 3-arg 오용 (채택 시 santa-loop 전면 불능) · 사후 chmod 노출 창 |
| R7 | `54e372f3…` | HIGH 1 | R5 흡수가 Acceptance에 심은 **거짓 단언** (문자열 존재로 제어흐름을 증명하려 함) |
| R8 | `726e4f5e…` | HIGH 1 | R7 흡수(DD11)가 절반만 닫은 lifecycle — **`record --id A` ×2로 dual-review 우회 가능** |
| R9 | `b69db7ea…` | HIGH 1 | R8 흡수(DD12)가 빠뜨린 `beginRound` 멱등성 — 재시도만으로 리뷰 없이 캡 소진 |

## 9라운드 측정치 (P1 판정 계약 baseline)

| 축 | 값 |
|---|---|
| 총 라운드 | **9** (multi-agent 5 + Codex 4) |
| 리뷰어 인스턴스 | agent 20인(5라운드 × 4관점) + Codex 4회 |
| 라운드별 실결함 | 5 → 12 → 5 → 3 → 4 → 2 → 1 → 1 → 1 |
| 오탐/기각 부류 | R3·R4에 집중(11건, "plan에 test 코드가 없다" 계열) · R5 이후 1건 |
| 수렴 여부 | **미수렴.** 결함 수는 줄었으나 0에 도달하지 않음 |
| 패널 토큰 | R1~R4 약 1.38M + R5 351k |
| receipt | **0건** — 9라운드 전부 미발행 |

**이 데이터가 말하는 것.** 결함 수는 단조 감소했지만(5→12→5→3→4→2→1→1→1) 마지막 네 라운드가 전부 **직전 흡수가 만든 구멍**을 겨눴다. 즉 감소는 수렴이 아니라 *패치 표면이 좁아진 것*이고, 각 패치가 다음 패치의 대상을 생산하는 한 이 수열은 0에 닿지 않는다. PRD Evidence의 "문서상 3라운드, 실사용 15~20"이 여기서 실측으로 재현됐다 — 9라운드에서 **사전 종료 규칙이 없었다면 계속 돌았을 것**이다.

동시에 반대 방향의 사실도 있다: R6·R8이 찾은 것은 사소하지 않았다. 하나는 채택 시 santa-loop이 전면 불능이 되는 결함이었고, 다른 하나는 **dual-review 자체가 기계적으로 우회되는** 경로였다. "라운드를 많이 썼으니 그만"은 여기서 틀린 이유가 된다 — 옳은 이유는 *패치가 패치를 낳는 구조*이지 라운드 수가 아니다.

**cross-model이 실제로 다른 것을 봤다.** R5 패널의 security 관점은 `assertContained` 호출을 "심층 방어 확인"으로 pass시켰고, invariant 관점은 캡 검증 축을 MEDIUM으로 짚고 넘어갔다. R6·R7 Codex는 같은 두 지점에서 각각 전면 불능 결함과 거짓 단언을 HIGH로 찾았다. 패널이 통과시킨 자리를 다른 모델이 뚫은 사례 2건이 P1의 "증거 다양성" 축을 뒷받침한다.

**P1이 이 데이터로 답해야 할 질문.** (1) 종료 조건을 결함 수로 둘 것인가, *결함의 출처*(원 산출물 vs 직전 패치)로 둘 것인가. 이 세션에서는 후자만이 R9를 마지막으로 지목할 수 있었다. (2) severity 축이 "채택 시 전면 불능"(R6-F0)과 "acceptance 문구 부정확"을 같은 HIGH로 묶는 것이 옳은가. (3) 오탐 11건이 R3·R4에 몰린 것은 프롬프트에 artifact-scope 절이 없어서였다 — 리뷰어 계약의 결함이 severity 분포를 왜곡한 실측 사례다.

---

## 종료 판정과 그 근거 (round 4 시점)

**패널을 round 4에서 멈춘다.** 4라운드 · 리뷰어 16인 · subagent 토큰 약 1.38M을 쓰고도 quorum(3/4)에 도달하지 못했고, 라운드별 실결함은 5 → 12 → 5 → 3으로 줄되 **0으로 수렴하지 않았다**. 더 결정적인 것은 round 4의 security CRITICAL이 **round 3의 수정이 만든 결함**이라는 점이다 — 원 산출물이 아니라 직전 라운드의 패치를 겨눈다.

이것은 이 PRD가 닫으려는 결함의 실측 재현이다([#124](https://github.com/skypark207/my-claude-code-plugin/issues/124) patch-chasing · 우산 PRD Evidence "문서상 3라운드, 실사용 15~20"). 여기서 round 5를 도는 것은 P0가 없애려는 루프를 P0를 계획하면서 그대로 반복하는 일이다.

- receipt **미발행** — `/mccp:prp-implement`는 이 상태로 시작할 수 없다.
- round 4 이후 흡수분(3건)은 **판정 이후 편집이라 미검증**이다. plan은 심사받은 버전보다 엄격해졌을 뿐이지만, 승인을 주장하지 않는다.
- 이 세션의 측정치(4라운드 · 16 리뷰어 · 실결함 25건 중 오탐 부류 11건)는 P1 판정 계약의 **baseline 자료**로 쓸 수 있다.
