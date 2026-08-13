# Plan Review Panel — santa-loop-materialize-m1

**Plan**: `.claude/plans/santa-loop-materialize-m1.plan.md` · **Plan version**: `sha256:954b24bc9a4e90cd65f32371474b761d75bcb52ee40f08b268e3fbe532f2c584`
**Verdict**: divergent via multi-agent
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) — 통과 실패 사유는 응답 수가 아니라 blocking finding 5건
**Layers**: L1 converged · L2 divergent (2 fail / 2 pass) · L3 not fired (`MCCP_PLAN_REVIEW_L3=0`)

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

---

## 종료 판정과 그 근거

**패널을 round 4에서 멈춘다.** 4라운드 · 리뷰어 16인 · subagent 토큰 약 1.38M을 쓰고도 quorum(3/4)에 도달하지 못했고, 라운드별 실결함은 5 → 12 → 5 → 3으로 줄되 **0으로 수렴하지 않았다**. 더 결정적인 것은 round 4의 security CRITICAL이 **round 3의 수정이 만든 결함**이라는 점이다 — 원 산출물이 아니라 직전 라운드의 패치를 겨눈다.

이것은 이 PRD가 닫으려는 결함의 실측 재현이다([#124](https://github.com/skypark207/my-claude-code-plugin/issues/124) patch-chasing · 우산 PRD Evidence "문서상 3라운드, 실사용 15~20"). 여기서 round 5를 도는 것은 P0가 없애려는 루프를 P0를 계획하면서 그대로 반복하는 일이다.

- receipt **미발행** — `/mccp:prp-implement`는 이 상태로 시작할 수 없다.
- round 4 이후 흡수분(3건)은 **판정 이후 편집이라 미검증**이다. plan은 심사받은 버전보다 엄격해졌을 뿐이지만, 승인을 주장하지 않는다.
- 이 세션의 측정치(4라운드 · 16 리뷰어 · 실결함 25건 중 오탐 부류 11건)는 P1 판정 계약의 **baseline 자료**로 쓸 수 있다.
