# santa-delta-review M2 — 탐지율 보존 측정 실측 기록

> **이 문서가 주장하지 않는 것을 먼저 적는다** (plan UI4 · UI5).
>
> 1. **"탐지율 보존을 검증했다"고 주장하지 않는다.** 이 사이클이 배송한 것은
>    Layer 1(결정적 containment)뿐이고, Layer 2(라이브 리뷰어 비교)는 **실행되지
>    않았다**. 아래 3장이 그 사실과 사유를 갖는다.
> 2. **fixture는 합성 1건이다.** `detection-corpus.js`가 소스에 적는 리터럴이며 과거
>    santa 실행에서 실재로 판명된 결함이 아니다(PRD Open Question 4가 지적한 그 공백 —
>    현 원장의 rejected는 0건이라 실측 fixture가 존재하지 않는다). 표본 N=1이다.
> 3. **심어둔 결함은 각 계층이 1건씩이다.** 계층별 수치는 비율이 아니라 **개수**이고,
>    1/1을 100%로 읽으면 안 된다.
> 4. **Layer 1은 비결정성이 없지만 그만큼 좁은 것을 인증한다.** 재는 것은 "리뷰어에게
>    보일 기회가 있는가"이지 "리뷰어가 찾는가"가 아니다(plan DD2).

- 일자: 2026-08-21
- 대상: `MCCP_SANTA_DELTA_SCOPE` (`enforce` vs `off`)
- 경로: 실제 git fixture 저장소 + 실제 `runCli(['scope-delta', ...])` + 실제
  `runCli(['scope-always', ...])`. 내부 함수 직접 호출 0건.
- 재현: `node --test plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js`

## 1. fixture 구성

`detection-corpus.js#buildCorpus()`가 데이터로 낸다. test가 `mkdtemp` + `git init`으로
저장소를 만들고 rev0 커밋 → fix 커밋 → `round-1-fix-rev.txt` anchor를 심는다.

| 경로 | fix가 건드리는가 | diff 스코프 | 비고 |
|---|---|---|---|
| `src/parser.js` | 예 (`takeField` 본문 2줄) | 포함 | 결함 2건 (D1 · D2) |
| `src/cache.js` | 아니오 | 포함 | 결함 1건 (D3) |
| `src/format.js` | 아니오 | 포함 | 결함 0건 (before/after가 degenerate하지 않게 하는 채움) |
| `.claude/plans/corpus-fixture.plan.md` | 아니오 | **미포함** | 결함 1건 (D4). 상시 스코프가 되돌린다 |
| `.claude/prds/corpus-fixture.prd.md` | 아니오 | **미포함** | D4의 대조 상대 |

결함 좌표는 **anchor 문자열로 역산**한다(손으로 센 줄 번호를 박지 않는다 — 한 줄만
끼워 넣어도 전 좌표가 어긋나고, 그때 나오는 것은 "탐지율 하락"으로 읽히는 측정 오류다).

| id | 계층 | 위치 | 결함 |
|---|---|---|---|
| D1 | `A_IN_FIX` | `src/parser.js:17` | fix가 경계 검사를 지워 범위 밖 index에서 `raw.trim()`이 던진다 — 직전 패치가 만든 회귀 |
| D2 | `B_SAME_FILE_OUT_OF_RANGE` | `src/parser.js:62` | `mergeCounts`가 타입을 강제하지 않아 문자열 인자에서 연결이 일어난다 |
| D3 | `C_DROPPED_PATH` | `src/cache.js:15` | `get()`이 `expiresAt`을 보지 않아 만료 항목을 반환한다 — `put()`의 TTL에 소비처가 없다 |
| D4 | `D_ALWAYS_SCOPE` | `corpus-fixture.plan.md:14` | plan이 PRD milestone 수를 3으로 단언하는데 PRD 표는 2행이다 |

**실행 가능한 취약 페이로드를 쓰지 않았다.** 전부 논리 결함이다 — 측정에 필요한 것은
"리뷰어가 이 줄을 보는가"이지 페이로드의 실효성이 아니고, 저장소에 의도적 취약 코드를
남기면 secret/SAST 스캐너의 상시 오탐이 된다.

## 2. Layer 1 — 결정적 containment (실행함)

fix 커밋이 `src/parser.js:16-17`을 바꾸므로 `patchRangesFrom`이 `[16,17]`을 내고
`CONTEXT_LINES`(20) 확장 뒤 `[1,37]`이 된다.

**스코프 축소 실측**: `before=3 → after=1` (경로 2개 드롭). `applied=true`.

| id | 계층 | full (`off`) | delta (`enforce`) | containment |
|---|---|---|---|---|
| D1 | `A_IN_FIX` | `path-unrestricted` | **`in-range`** | 유지 — 범위가 정확히 지목 |
| D2 | `B_SAME_FILE_OUT_OF_RANGE` | `path-unrestricted` | **`path-kept-out-of-range`** | 유지 — 경로는 남고 범위 밖 |
| D3 | `C_DROPPED_PATH` | `path-unrestricted` | **`path-dropped`** | **손실** |
| D4 | `D_ALWAYS_SCOPE` | `path-unrestricted` | `path-unrestricted` | 유지 — 상시 스코프가 되돌림 |

계층 합산: `full=4 · delta=3 · lost=1`. `unmatched=0` · `unknown=0`.

### 2.1 이 표가 말하는 것

- **델타의 containment 손실은 Class C 하나로 국소화된다.** 그것은 산술이다 — fix가
  건드리지 않은 파일은 `paths = diffPaths ∩ keys(ranges)`에서 제거되므로 스코프 밖이
  된다. 예측 가능했고 plan DD3이 미리 그렇게 적었다.
- **Class B는 containment가 보존된다.** 이것이 M2의 미지수였다(plan DD3: "그렇다면 왜
  재는가 — Class B가 미지수이기 때문이다"). 경로가 남으므로 블라인드 레인 리뷰어는 자기
  도구로 파일 전체를 읽을 수 있고, 범위는 **절단이 아니라 포인터**라는 M1의 설계 근거가
  이 계층에서 성립한다.
- **그러나 "리뷰어가 실제로 범위 밖을 본다"는 여기서 인증되지 않는다.** Layer 1은
  기회를 재고 주의 배분은 재지 않는다. 그 질문은 Layer 2 소유이고 아래 3장대로 미실행이다.
  `inScope`(경로 포함)와 `inRange`(범위 안)를 별도 필드로 둔 이유가 그것이다 — 둘을
  접으면 Layer 1이 자기가 인증할 수 없는 명제를 단언하게 된다.
- **D4는 델타가 되돌린 것이 아니다.** 델타의 `paths`에는 plan이 없고, 그 뒤 호출되는
  `scope-always`가 넣는다. 면제가 조건 분기가 아니라 **호출 순서**라는 것(plan DD2)이
  test에서 그대로 재현된다 — `off`·`enforce` 양 모드 모두 D4가 스코프 안이다.

### 2.2 UI1 재확인

조립된 스코프 줄에 `PRIOR_ROUND_PATTERNS` 매치 **0건**. corpus 경로(`src/parser.js`,
`.claude/plans/corpus-fixture.plan.md`)로 렌더한 결과이며 M1 fixture 경로로 잰 것과
별개 입력이다. 범위 표기는 고정 형태(`- src/parser.js:1-37`)로 나온다.

## 3. Layer 2 — 라이브 리뷰어 비교 (**실행하지 않음**)

plan Task 3은 같은 fixture에서 실제 리뷰어 레인을 `off`·`enforce` 두 번 완주해 발견
id를 대조하라고 적었다. **이 사이클에서 실행되지 않았다.**

**사유**: 이 세션의 운영 지시가 명시 요청 없는 서브에이전트·Workflow 발화를 금지하고,
리뷰어 레인은 그 발화 없이 성립하지 않는다(`lanes.js`가 조립한 프롬프트를 실제 리뷰
에이전트가 받아야 한다). 구조적 불가이지 생략이 아니다.

**우회하지 않았다.** 다음 셋은 전부 UI5 위반이라 취하지 않았다:

1. Layer 1 결과를 Layer 2로 부르기 — plan DD2가 두 층이 서로를 대신하지 않는다고 명시.
2. 합산 탐지율을 Layer 1에서 추정하기 — 추정은 측정이 아니다.
3. 규칙을 "Layer 1으로 갈음 가능"으로 고치기 — plan Task 4가 유일하게 금지한 행위.

### 3.1 사전 등록 규칙의 적용

규칙(plan DD3 · `detection-corpus.js#DECISION_RULE`에 축자 동결):

> corpus 전체(4계층 합산)에서 델타의 Layer 2 발견 수가 full 대비 단 1건이라도 적으면 default를 뒤집지 않는다. 같거나 크면 뒤집는다.

전건은 "델타의 **Layer 2** 발견 수가 full과 같거나 크다"이다. Layer 2가 없으면 그
비교는 거짓이 아니라 **미상**이고, 미상은 flip 근거가 아니다.

`decideDefaultFlip({layer2: null})` → `{flip: false, reason: 'layer2-absent'}`.

**따라서 `MCCP_SANTA_DELTA_SCOPE`의 default는 `off`로 남는다.** 이는 규칙을 결과에
맞춰 고친 것이 아니라 규칙을 그대로 적용한 것이다.

`layer2-absent`를 `layer2-degraded`와 같은 토큰으로 접지 않았다 — 사후에 "재봤더니
하락"과 "안 재봤다"를 구별할 수 없게 되고, 그 구별이 이 milestone이 남기는 것의
절반이다.

### 3.2 이 판단이 기계적으로 강제된다

plan 승인 패널이 "Task 3(측정)을 건너뛰고도 Task 4가 default를 뒤집을 수 있다"를
지적했고(L2 id=6116eeb8 · 5fb50bd9), 그 지적은 실재했다 — 규칙이 산문으로만 존재하면
flip은 사람이 문장을 읽고 손으로 상수를 고치는 행위이고, 그 행위는 측정을 했을 때와
안 했을 때가 diff에서 똑같아 보인다.

`santa-detection-coverage.test.js`의 **"배송된 default는 이 저장소가 기록한 Layer 2
증거와 정합한다"** 가 그 자리를 닫는다: `LAYER2_EVIDENCE` 상수와 실제
`DELTA_SCOPE_DEFAULT`를 `decideDefaultFlip`으로 대조하므로, Layer 2 증거 없이 default를
`enforce`로 바꾸면 test가 붉어진다. Layer 2를 실제로 완주하면 그 상수를
`{fullFindings, deltaFindings}`로 교체하고 같은 test가 그때의 default를 다시 판정한다.

## 4. 부수 실측 — 이 저장소의 설정이 자기 test를 가린다

측정 중 별개 사실이 드러났다. `plugins/mccp/scripts/lib/tests/*.test.js` 전체를 이
저장소의 환경 그대로 돌리면 **53건이 실패**하는데, `MCCP_REVIEW_SINGLE_PASS`(이 저장소
`.claude/settings.json`이 `deadline_pressure`로 켜 둔 값)만 지우면 대부분이 통과한다.
`santa-loop-cap.test.js` 단독 실측: **29 fail → 1 fail**.

원인은 결함이 아니라 상호작용이다 — `begin-round`는 단일통과 구간에서 라운드를 열지
않으므로(review-loop-bypass M1 DD5), 원장을 실제로 여는 test는 그 변수를 지워야 축을
검사할 수 있다. `santa-delta-instrumentation.test.js`가 `withoutSinglePass` 헬퍼로 그
격리를 하고 있고, M2의 신규 test도 같은 헬퍼를 쓴다.

**격리가 없는 test들이 이 저장소에서 상시 red라는 것이 문제다.** red가 상시면 새 red가
그 안에 묻힌다. 이 milestone의 축이 아니므로 backlog로 이연한다.

## 5. 덮지 않은 것

- **Layer 2 전체** (3장). PRD Open Question으로 이연.
- **실측 fixture** — corpus는 합성이다. P1 원장에 실재 결함이 쌓인 뒤 재검증하는 것이
  PRD Risk 3행이 예고한 후속이고, 그 조건은 아직 충족되지 않았다(rejected 0건).
- **표본 확대** — 계층당 1건이다. 계층별 개수가 늘면 "어느 계층에서 얼마나" 가 비율로
  읽히기 시작하지만, 현재는 개수일 뿐이다.
- **`CONTEXT_LINES`(20)의 타당성** — Class B 결함을 fix hunk에서 45줄 떨어뜨려 심었다.
  경계 근처(21~25줄) 결함이 어떻게 되는지는 재지 않았다. 산술적으로는 확장 범위 안팎이
  갈리는 자리이므로 표본을 늘린다면 여기가 먼저다.
