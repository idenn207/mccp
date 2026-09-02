# Plan: review-record-linkage M1 — linkage-baseline-parser

**Source PRD**: `.claude/prds/review-record-linkage.prd.md`
**Selected Milestone**: M1 `linkage-baseline-parser`
**Complexity**: Medium

## Summary

M1은 세 판정 기준 — "라운드 구조 보유" · "리뷰 대상 ship" · "층간 링크" — 을 **파서 코드로**
고정하고, 그 정의로 과거 코퍼스를 동결 보고한다. 쓰기 0건 · read-only · LLM-free ·
게이트 경로 무접촉(`evidence-audit.js` · `corpus.js` 형태 미러). 순수 정의는 dep-free
모듈로 분리해 M4의 `record.js` write-time 검증이 **같은 정의를 import**하게 만든다 —
정의가 두 벌이 되면 그 순간 M1이 세운 것이 무너진다.

M1은 값을 개선하지 않는다. 무엇을 세는지 고정하고, 오늘 값이 얼마인지 반증 가능하게
남긴다.

## User Intent

<!-- PRD `.claude/prds/review-record-linkage.prd.md`는 2026-09-01 사용자와 공동 작성됐다
     (PRD 말미: "프레이밍 1-4는 사용자 확인"). 아래는 그 PRD의 결정·범위 진술에서
     사용자가 말한 것만 옮긴 것이다. 저자 정당화는 `## Design Decisions`에 있다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 과거 71건은 소급하지 않는다 — 재봉인도 마이그레이션도 사이드카도 만들지 않는다 | exclusion |
| UI2 | 지표 2의 분모는 전체 ship이 아니라 리뷰 대상 ship이며 그 판별을 M1이 파서로 정의한다 | constraint |
| UI3 | 라운드 구조 보유의 정의는 산문이 아니라 파서가 소유한다 | constraint |
| UI4 | 얇은 ship receipt 설계를 바꾸지 않는다 — 리뷰 내용을 receipt로 옮기지 않는다 | exclusion |
| UI5 | defaultResolution의 converged 축은 건드리지 않는다 | exclusion |
| UI6 | meta 라운드 카운터 5종의 통합이나 정리는 하지 않는다 | exclusion |
| UI7 | M1은 쓰기 0건이고 read-only이며 LLM-free다 | constraint |
| UI8 | 정의 선택 근거를 5개 후보 정의의 값과 함께 기록한다 | direction |
| UI9 | MVP는 M1과 M2이고 M1이 먼저다 | direction |
| UI10 | 리뷰 품질 향상이나 리뷰어 변경이나 새 게이트 추가는 하지 않는다 | exclusion |
| UI11 | 마켓플레이스 사용자에게 약속하는 것이 없다 | constraint |
| UI12 | C0가 먼저 착지하면 이 브랜치는 version 선언을 철회한다 | direction |

## Grounding — 이 계획을 쓰기 전에 실측한 것

전부 이 워크트리(base `bacd96a`)에서 직접 실행했다. PRD의 주장 일부는 재현됐고
**일부는 재현되지 않았다.** 재현되지 않은 것이 이 계획의 설계를 바꿨다.

| 실측 | 결과 | 계획에 미친 영향 |
|---|---|---|
| ship receipt 총계 | 71건, `resolution.rounds` 키 71/71 존재 | 통로 부재는 확인 |
| `plan_hash` 존재율 | **71/71** | chore ship 판별에 **쓸 수 없다** |
| `meta.command` 분포 | `/mccp-pr-codex` 71/71 (상수) | 판별에 쓸 수 없다 |
| `resolution.review_verdict` | **0/71** | 패널 triple은 ship receipt에 도달하지 않는다 |
| plan/implement receipt의 git 이력 | **한 번도 tracked된 적 없음** (`git log --all --diff-filter=A` 공집합) | 상류 게이트 receipt는 과거 코퍼스에 **존재하지 않는다** |
| 파일명 관례 일치 | 24/71 | PRD와 일치 |
| 불일치 47건의 성격 | **41/71이 최초 패널 레코드(2026-08-09T12:36:02.852Z)보다 앞선다** | 불일치의 지배 원인은 chore가 **아니라 시간 경계**다 |
| 경계 이후 ship | 30건 중 21건 일치, 9건 불일치 | 경계 이후 불일치에도 실제 마일스톤 ship이 섞여 있다 |
| 리뷰 → ship 역방향 | 패널 레코드 47건 중 **23건은 대응 ship receipt가 없다** | 미스매치는 **양방향**이다 |
| `.claude/reviews/` 구성 | 71 파일 = 47 패널 + 24 타 생산자 (+ `archive/` 7) | 파일명은 서명이 아니다 (corpus.js 선례와 동일) |
| `measurement.rounds` 존재 | **0건** | D1의 오늘 값은 0% |
| receipt 내 리뷰 경로 문자열 | **0/71** | D3 오늘 값 0% |

### PRD의 5개 후보 정의를 재현한 결과

PRD 표와 **값이 다르다.** 같은 정의여도 구현(정규식 · 코퍼스 경계)이 다르면 값이 갈린다.

| 정의 | PRD 기재 | 재현 (전체 71) | 재현 (패널 46) |
|---|---|---|---|
| A. `#### Round N` heading | 3/71 (4.2%) | **0/71 (0.0%)** | 0/46 (0.0%) |
| B. `round N` 토큰 | 8/71 (11.3%) | 8/71 (11.3%) | 4/46 (8.7%) |
| C. `R1`/`R2` 토큰 | 32/71 (45.1%) | **28/71 (39.4%)** | 17/46 (37.0%) |
| D. B 또는 C | 34/71 (47.9%) | **32/71 (45.1%)** | 19/46 (41.3%) |
| E. `round`/`라운드` 단어 | 42/71 (59.2%) | **46/71 (64.8%)** | 28/46 (60.9%) |

이 불일치가 결정 3의 근거를 **강화한다**: 정의를 바꾸면 값이 갈린다는 것이 PRD의
주장이었는데, 실제로는 *같은 정의의 다른 구현*도 값을 바꾼다. 파서가 정의를 소유하지
않으면 목표 달성 여부가 측정자마다 달라진다.

## Design Decisions

<!-- 저자 정당화. `## User Intent`와 분리돼 있고 리뷰어 focus에 주입되지 않는다. -->

### DD1 — 두 모듈로 나눈다: 순수 정의 / I·O 집계

`linkage-defs.js`(순수 · dep-free · I/O 0 · throw 0)가 **M1이 새로 만드는 세 정의와 5개
대조 정의만** 소유하고, `linkage-audit.js`(fs + git + `corpus.js`)가 그것을 소비해 집계 ·
CLI를 한다.

분리의 실제 이유는 **전이 의존**이다. M4의 `record.js`는 `require` 0건이고 헤더가 그것을
계약으로 선언한다(`record.js:16-21`). M4가 D1 술어를 쓰려면 어차피 첫 `require`가 생기므로
"import 자체가 계약 위반"은 참이 아니다 — 참인 것은, 정의가 I/O 모듈 안에 있으면 그 import가
`fs` · `child_process` · `git` 호출을 write 경로로 끌고 들어온다는 것이다. 순수 술어만 담은
파일을 import하는 것은 그 전이 의존을 0으로 만든다. 대안은 M4가 정의를 **복제**하는 것이고,
복제된 정의는 갈라진다.

### DD1a — 이미 있는 정의는 다시 만들지 않는다: `corpus.js#parseRecord`를 소비한다

DD1의 명제("정의가 두 벌이 되면 무너진다")는 M1 자신에게 먼저 적용된다. 리뷰 층 코퍼스의
경계 판별은 **이미 `corpus.js`가 소유한다** — `PANEL_TITLE_RE`(`corpus.js:211`) ·
`isPanelRecord`(`:213-217`) · `## Measurement` 펜스 파싱(`:242-273`). 그리고
`parseRecord`는 export돼 있다(`corpus.js` module.exports).

따라서 `linkage-audit.js`는 리뷰 레코드를 **`corpus.parseRecord(text)`로 읽는다.** 서명
정규식도 펜스 파서도 재구현하지 않으며, `linkage-defs.js`는 `isPanelRecord` ·
`PANEL_SIGNATURE_RE`를 **export하지 않는다**(초안은 그것을 "corpus.js와 동일 규칙"으로
새로 만들라고 적었는데, 그것이 정확히 M1이 M4에 대해 금지한 복제다). `corpus.js`는
**변경하지 않는다** — 소비만 한다.

이 결정이 부수적으로 아래 DD2의 `pre_measurement` 문제도 닫는다: `parseRecord`의 `kind`가
이미 `record` / `pre_measurement` / `out_of_corpus` / `parse_failure` 4분류이므로, M1은 그
경계를 물려받을 뿐 다시 정의하지 않는다.

### DD2 — D1(라운드 구조)은 `measurement.rounds` 정수이며, 산문 토큰이 아니다

지표 3이 지정한 읽는 주체는 "`record.js` 자체 검증 → 미달 형식은 **기록 시점에 거부**"다.
기록 시점에 거부하려면 정의가 writer가 결정론적으로 생산 · 검증할 수 있는 **구조**여야 한다.
산문 토큰(B~E)은 리뷰어가 우연히 "R1에서 흡수함"이라 적어도 참이 되므로 write-time에
강제할 대상이 아니다.

그래서 D1은 **패널 레코드의 `## Measurement` JSON에 `rounds`가 정수 ≥ 1로 존재**다.
`corpus.js`가 이미 그 블록을 기계 표면으로 다루므로 새 표면이 아니다.

**분모에서 `pre_measurement`를 뺀다.** `## Measurement` 블록 자체가 없는 패널 레코드(M4가
그 블록을 도입하기 전 것들)를 분모에 넣으면 그것들은 자동으로 "구조 미보유"로 계상되는데,
그것은 *관측된 부재*가 아니라 **읽을 블록이 없는 것**이다. 0으로 접으면 M1이 미러하겠다고
선언한 규율("부재 ≠ 0")을 자기 핵심 지표에서 위반한다. 그래서 D1의 분모는
`kind === 'record'`인 레코드이고, `pre_measurement` 건수는 `coverage`에 **하한 표식**으로
함께 실린다(`corpus.js:47-51`이 같은 이유로 같은 처리를 한다). 두 수를 하나로 뭉치면 그
숫자는 어느 것도 뜻하지 않는다.

**이 선택은 오늘 값이 가장 낮다(0%).** 기준 게이밍 risk가 우려한 방향의 정반대이며,
그 사실 자체가 반증 자료로 대조 표에 남는다(UI8).

### DD3 — D2(리뷰 대상 ship)는 3값이고, 과거 코퍼스에서는 전건 `undecidable`이다

이것이 이 계획에서 가장 중요한 판단이다. PRD Open Question 5("receipt 안의 **어떤 필드**가
정직하게 말하는가")에 대한 실측 답은 **"그런 필드는 없다"** 이다:

- `plan_hash` 71/71 · `meta.command` 상수 71/71 → 판별 불가
- `resolution.review_verdict` 0/71 → 패널 축이 ship에 도달하지 않는다
- plan/implement receipt는 **git에 한 번도 tracked된 적이 없다** → 상류 증거 부재

그리고 "패널 레코드가 존재하면 리뷰 대상"이라는 정의는 **채택하지 않는다** — 그것은
분모를 분자로 정의하는 것이라 지표 2를 자명하게 100%로 만든다. 측정을 가장한 동어반복이다.

따라서 `classifyShipEligibility`는 `eligible` / `not_eligible` / `undecidable`을 내고,
과거 71건은 **전건 `undecidable` + 사유 열거**로 보고한다. 0%가 아니라 `undecidable`이다 —
부재를 판정으로 읽지 않는다(`corpus.js` DN3와 같은 규율).

그리고 M1은 M3가 만들어야 할 **전방 판별자**를 명시한다: 휴리스틱이 아니라 **명시 proof
필드**다(§3.12의 ambient `codex_disabled` 대 명시 `codex_disabled_at_pr` 구분과 동형).
파일명 prefix는 계약이 아니므로 라벨로만 세고 정의로 삼지 않는다.

### DD4 — D3(층간 링크)는 구조적 위치에서만 인정한다

- receipt → 리뷰: receipt의 **전용 필드**에 repo-relative 리뷰 레코드 경로
- 리뷰 → receipt: 패널 레코드 `## Measurement` JSON의 `receipt_hash`

**본문 어디든의 문자열 등장은 링크가 아니다.** PRD가 찾은 4건은 전수 확인 결과 리뷰어가
그 필드를 *주제로 논한* finding이었다. 구조적 위치를 요구하면 그 오탐이 파서 규칙 하나로
기계적으로 사라진다 — 산문 필터가 아니라 위치 제약이 막는다.

**`classifyLink`는 M3의 경로 안전성 게이트가 아니다 — 그렇게 쓰지 마라.** 이 술어의 경로
형태 검사는 denylist(절대경로 · `..` · 드라이브 문자 · UNC)이고, denylist는 구조적으로 자기
열거 밖에서 샌다(Windows 예약 장치명 · NTFS ADS · 유니코드 유사 점). M1 자신은 경로를
구성하지 않으므로 위험이 0이지만, M3가 이 통과만 믿고 경로를 결합하면 그 구멍을 그대로
물려받는다. **M3는 `path.resolve(root, candidate)`의 결과가 `root` 하위인지를 검사하는
containment check를 반드시 별도로 더한다** — 저장소 선례(`record.js:65-77 sanitizeSlug`)가
allowlist인 것과 같은 규율이다. 이 문장이 여기 있는 이유는 M1이 그 술어를 test로 **봉인**해
M3가 물려받게 되기 때문이고, 봉인 시점이 계약을 적을 마지막 기회이기 때문이다.

### DD5 — 동결은 시간 경계로 성립한다 (드리프트가 아니라 파티션)

`corpus.js`는 "지금"을 세지만 M1은 "동결된 과거"를 세므로, 살아 있는 트리를 그대로 세면
새 ship이 착지할 때마다 baseline이 바뀌어 baseline이 아니게 된다.

그래서 도구는 `--baseline-ref`(기본값: 핀 고정 상수)로 커밋 타임스탬프를 해소해 코퍼스를
`pre_baseline` / `post_baseline`으로 **파티션**한다. `pre_baseline` 수치는 새 ship이
쌓여도 불변이므로 동결 블록이 구조적으로 안정하다.

**날짜 원천을 여기서 못박는다** (구현자에게 넘기지 않는다 — 어느 쪽을 고르는지가 "무엇이
동결되는가"를 결정한다):

| 층 | 원천 | 원천 부재 시 |
|---|---|---|
| ship receipt | `meta.created_at` (내용 파생 · 불변) | `undated` |
| 패널 레코드 (`kind='record'`) | `measurement.recorded_at` (내용 파생 · 불변) | `undated` |
| 패널 레코드 (`kind='pre_measurement'`) | `git log --diff-filter=A --follow -1 --format=%cI -- <path>` (**추가 커밋** 시각) | `undated` |

세 번째 행이 필요한 이유는 그 레코드들에 읽을 measurement가 애초에 없기 때문이다. 미러
선례(`corpus.js:652-655`)를 그대로 따르면 그것들은 전부 `undated`로 떨어져 `pre_baseline`
에서 사라진다. git 시각은 measurement가 없는 레코드에 대한 **유일하게 남은** 관측된 시각이다.

**`-1`(마지막 손댄 커밋)이 아니라 `--diff-filter=A --follow -1`(추가된 커밋)인 것이
핵심이다.** 전자는 가변 메타데이터라, 그 리뷰 파일을 나중에 한 줄 고치거나 `archive/`로
옮기면 시각이 경계를 넘어 그 레코드가 `pre_baseline`에서 조용히 빠지고 동결 바이트가
바뀐다 — DD5가 주장하는 불변성을 날짜 원천 자신이 반증하게 된다. 추가 시각은 그 파일이
코퍼스에 **들어온** 순간이라 이후 편집·이동에 불변이고, `--follow`가 rename을 따라가므로
`archive/` 이동도 시각을 바꾸지 않는다.

**`unresolved`는 `ok`가 아니다 — 여기서 미러 선례를 의도적으로 벗어난다.** `corpus.js:670`은
`state = (read_error || parse_failures>0) ? 'degraded' : 'ok'`라서 `k_split.state='unresolved'`
여도 exit 0을 낸다. M1이 그 형태를 베끼면 **동결의 유일한 기계 장치가 무너진 상태에서 도구가
성공을 보고한다** — 계측 고장의 조용한 통과이며, 이 PRD가 닫으려는 실패와 같은 종류다. M1은
대신 `evidence-audit.js:20-51`의 규율(무결성 위반마다 별도 비-ok state)을 따라
`unresolved`에 자기 exit code를 준다(DD7).

임계값은 갖지 않는다. 어느 경계가 자기 주장에 맞는지는 소비자(C4 · 이 PRD의 지표)가 정하고,
도구는 세기만 한다.

### DD7 — 동결되는 것은 `pre_baseline`뿐이므로, 바이트 일치도 거기에만 건다

초안은 `--json` **전체 출력**을 문서에 축자 동결하고 바이트 일치를 acceptance로 걸었다.
그런데 전체 출력에는 `post_baseline`이 들어 있고 그것은 정의상 가변이다 — 새 ship이 하나만
착지해도 검증이 확정적으로 붉어진다(이 계획의 Risks 표가 그 확률을 **높음**으로 스스로
평가한다). 예측 가능하게 실패하는 검증은 무시되거나 재생성으로 덮이므로, 그것은 동결 기록을
지키는 장치가 아니라 장치가 있다는 착각이다.

그래서 도구에 `--frozen-only` 플래그를 둔다. **무엇이 그 안에 들어갈 수 있는지의 기준은
"불편한가"가 아니라 "경계가 정해지면 값이 고정되는가"다.** 그 기준으로 정확히 셋이 들어간다:

| 필드 | 왜 불변인가 |
|---|---|
| `baseline` (ref · 해소된 시각 · `baseline.state`) | 핀 고정된 ref 하나로 결정된다 |
| `pre_baseline` 파티션 | 경계 이전에 코퍼스에 들어온 레코드 집합 — DD5의 추가-커밋 시각이 이후 편집·이동에 불변이므로 고정 |
| `undated_at_baseline` (건수 + 파일명) | **baseline tree에 실재하는데**(`git ls-tree -r <ref>`) 날짜가 해소되지 않은 레코드. ref가 고정이므로 이 집합도 고정 |

`post_baseline`과 **코퍼스 전역 `undated`** 는 `--json` 전용이다.

**전역 `undated`를 넣었다가 뺀 이유를 남긴다** — 이 자리에는 직전 라운드까지 "전역 `undated`
건수와 파일명을 방출한다"고 적혀 있었다. 동기는 옳았다(탈락한 레코드를 숨기면 분모가 조용히
줄어든다). 그런데 전역 `undated`는 **경계에 속하지 않는 코퍼스 전역 수치**라, 경계 이후에
날짜 원천 없는 파일이 하나 생기기만 해도 동결 바이트가 바뀐다 — `post_baseline`을 빼서
없앴다고 주장한 가변성이 옆문으로 그대로 돌아온다. 그러면 "post_baseline 파일을 추가해도
`--frozen-only`가 바이트 불변"이라는 Task 4의 단언이 거짓이 되고, 무관한 착지가 동결 문서를
붉게 만들어 재생성을 부른다. 은폐 방지의 목적은 **baseline tree로 범위를 좁힌**
`undated_at_baseline`이 그대로 달성한다 — 동결 파티션의 커버리지 결손은 전부 그 안에 있고,
경계 밖의 결손은 동결 기록이 답할 질문이 아니다.

**state가 둘인 것도 같은 이유다.** `baseline.state ∈ {ok, unresolved, degraded}`는 동결
계산만 반영하고(따라서 불변) 동결 블록에 실린다. 코퍼스 전역 ladder는 `--json`의 최상위
`state`이고 동결 대상이 아니다. 하나로 합치면 경계 밖 사건이 동결 바이트를 움직인다.

전역 state ladder는 `evidence-audit.js` 형태를 따른다:

| state | exit | 조건 |
|---|---|---|
| `degraded` | 1 | 디렉토리 read 실패 · `parse_failures > 0` · 전역 `undated > 0` |
| `blind` | 2 | 레코드 0건 — 부재는 결함 부재가 아니다 |
| `unresolved` | 3 | 경계 ref 해소 실패 — 동결 자체가 성립하지 않는다 |
| `ok` | 0 | 위 어느 것도 아님 |

`baseline.state`는 같은 사다리를 **baseline tree 범위로만** 적용한다(`unresolved`가 최우선,
그다음 `undated_at_baseline > 0` → `degraded`). `undated`가 `degraded`인 것은 커버리지
실패이기 때문이다 — 그것이 없으면 날짜 원천 고장이 레코드를 파티션에서 **침묵 삭제하면서
exit 0을 낸다**. 미지 state → 1(비영점). exit 번호는 심각도 순위가 아니라 열거일 뿐이며,
비-ok 셋 다 비영점이라 어느 것도 성공으로 읽히지 않는다.

### DD8 — 기본 경계는 이름이 붙은 불변 커밋이다

`--baseline-ref`의 기본값은 `DEFAULT_BASELINE_REF = '647dfec'`
(`647dfecba75eecd9287ee538ca5f7056c7ba71da`, 2026-09-01T10:10:57+09:00)다. 초안은 "핀 고정
상수"라고만 적고 값을 배정하지 않아 **경계를 구현자 재량에 넘겼다.**

그 값이 이 커밋인 이유는 둘이고 둘 다 기계 확인했다:

1. **`origin/main`에서 도달 가능하다**(`git merge-base --is-ancestor 647dfec origin/main` → 참).
   이 브랜치의 base `bacd96a`는 origin/main에서 갈라져 있어 **기본값이 될 수 없다** — 머지
   후 그 ref가 통합 이력에서 해소되지 않으면 커밋된 동결 test가 영구히 `unresolved`가 된다.
2. **ship receipt 71건 전부가 이 시각보다 앞선다**(실측 0/71 after). 즉 이 경계는 "C1 이전"을
   정확히 가른다.

이 사이클이 만든 산출물(리뷰 레코드 · 이 receipt)은 경계 **이후**라 `post_baseline`으로
간다. 그것이 정상이다 — 동결 baseline은 C1 이전을 기술하지, 자기 자신을 포함하지 않는다.
test와 동결 메타는 이 ref를 **리터럴로 단언**한다(값이 조용히 바뀌면 붉어진다).

### DD6 — 파서는 적대적 마크다운에 대해 총함수다

입력 `.claude/reviews/*.md`는 리뷰어(LLM 포함)가 쓴 반신뢰 산출물이다. 파서는 어떤 입력에도
throw하지 않고 `parse_failure`로 분류하며, 경로를 만들지 않는다(읽기 전용이므로
path traversal 표면 자체가 없다). 절대 경로는 출력에 싣지 않는다 — repo-relative만
(§3.12 `meta.cwd` 선례).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 도구 형태 | `plugins/mccp/scripts/lib/evidence-audit.js:1-75` | 두 층을 대조하는 standalone read-only · LLM-free 감사 도구. `cli.js` 하위가 아님 |
| state ladder | `plugins/mccp/scripts/lib/evidence-audit.js:20-51` | 무결성 위반마다 **별도 비-ok state + 고유 exit code**. `corpus.js:91-101`의 3-state 형태가 아니라 이쪽을 따른다 (DD7) |
| 코퍼스 경계 | `plugins/mccp/scripts/lib/plan-review/corpus.js:213-273` | **재구현하지 않고 `parseRecord`를 호출한다** — `kind` 4분류(`record`/`pre_measurement`/`out_of_corpus`/`parse_failure`)를 그대로 물려받는다 (DD1a) |
| 시간 경계 | `plugins/mccp/scripts/lib/plan-review/corpus.js:600-668` | git ref → 타임스탬프 해소, 실패 시 `state='unresolved'`(조용한 대체 금지). **다만 그 state를 `ok`로 접는 `corpus.js:670`은 미러하지 않는다** |
| 부재 ≠ 0 | `plugins/mccp/scripts/lib/plan-review/corpus.js:40-86` | `blind` · `unknown` · `pre_measurement`를 0으로 접지 않는다 |
| 표 파싱 | `plugins/mccp/scripts/lib/plan-review/corpus.js:160-206` (`splitRow` · `unescapeCell`) | `record.js#cell`의 역순 이스케이프 해제 |
| 순수 모듈 | `plugins/mccp/scripts/lib/plan-review/record.js:16-21` | pure · dep-free · never-throws · opts 객체로 상태 주입 |
| 식별자 위생 | `plugins/mccp/scripts/lib/plan-review/record.js:65-77` | `sanitizeSlug` — 내부 출처라도 경로 결합 전 untrusted 취급 |
| test | `plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js:1-45` | `node:test` + `node:assert/strict`, 픽스처 빌더, 파서 규칙만 고정하고 경험적 주장은 문서로 |
| 문서 동결 | `docs/diverse-agent-review/quorum-calibration.md:1-40, 221-525` | `<!-- BEGIN … (verbatim) -->` 축자 블록 + 재현 명령 1줄, 손으로 옮긴 숫자 0 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/linkage-defs.js` | CREATE | **M1이 새로 만드는** 세 술어 + 5개 대조 정의. 순수 · dep-free · I/O 0 (DD1) — M4가 import할 대상. 패널 서명·Measurement 파싱은 **여기 없다**(DD1a) |
| `plugins/mccp/scripts/lib/linkage-audit.js` | CREATE | I/O · 집계 · state ladder · CLI. `evidence-audit.js` 형태 미러. 리뷰 층은 `corpus.js#parseRecord`를 **require해 소비**한다 (DD1a) |
| `plugins/mccp/scripts/lib/tests/linkage-defs.test.js` | CREATE | 술어 · 분류 규칙 회귀 test (픽스처) |
| `plugins/mccp/scripts/lib/tests/linkage-audit.test.js` | CREATE | 집계 · state ladder · 경계 파티션 회귀 test (픽스처) |
| `plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js` | CREATE | 커밋된 `frozen-baseline.md`의 BEGIN/END 블록 ↔ `--frozen-only` 라이브 출력 **바이트 일치** test. 이것이 없으면 동결이 산문이다 (Risks 표가 "기계로 확인된다"고 주장하는 바로 그 기계) |
| `docs/review-record-linkage/frozen-baseline.md` | CREATE | 동결 baseline — 도구 출력 축자 인용 + 정의 선택 근거 + 5개 대조값 |
| `.claude/prds/review-record-linkage.prd.md` | UPDATE | M1 행 `pending` → `in-progress`, `Plan` 셀에 이 파일 경로 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 patch — PRD 내 단일 milestone). PR 진입 직전 재계산 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (§3.7 4면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (§3.7 4면) |
| `CHANGELOG.md` | UPDATE | 새 항목 + `currently` 노트 동기 (§3.7 4면) |

**변경하지 않는 파일(명시)**: `plugins/mccp/scripts/receipt/write.js` ·
`plugins/mccp/scripts/receipt/cli.js` · `plugins/mccp/scripts/receipt/schema.js` ·
`plugins/mccp/scripts/receipt/hash.js` · `plugins/mccp/scripts/lib/plan-review/record.js` ·
**`plugins/mccp/scripts/lib/plan-review/corpus.js`**(소비만 한다 — DD1a) ·
`plugins/mccp/commands/plan.md` · `plugins/mccp/commands/prp-implement.md` ·
`plugins/mccp/commands/pr.md`. M1은 쓰기 0건이다(UI7) — 이 목록의 공집합 diff가
Task 6의 기계 검증 대상이다.

## Tasks

### Task 1: `linkage-defs.js` — 세 정의를 순수 모듈로 고정

- **Action**: 다음을 export한다.
  - `hasRoundStructure(measurement)` → `boolean` — `measurement.rounds`가 `Number.isInteger` 이고 `>= 1` (DD2)
  - `ROUND_STRUCTURE_CONTROLS` — 5개 대조 정의(A~E)를 `{id, label, test(text)}` 배열로. **정의 선택의 반증 자료**이므로 코드에 상주한다(UI8)
  - `classifyShipEligibility(receipt)` → `{verdict, reason}` where verdict is `eligible` / `not_eligible` / `undecidable` (DD3)
  - `classifyLink(receipt, record)` → `{receipt_to_review, review_to_receipt, bidirectional}` — 구조적 위치만 (DD4)
  - `LINKAGE_FIELD_NAMES` (M3가 만들 필드 이름 — 정의가 여기 상주해야 M3가 이름을 지어내지 않는다)
  - **`isPanelRecord` · `PANEL_SIGNATURE_RE`는 export하지 않는다** — `corpus.js`가 이미
    소유하며 M1은 `parseRecord`를 소비한다(DD1a). 이 부재 자체가 Task 3의 단언 대상이다.
- **Mirror**: `plan-review/record.js:16-21` 순수 · dep-free · never-throws 계약. `require` 0건.
- **Validate**: `grep -c "require(" plugins/mccp/scripts/lib/plan-review/linkage-defs.js` 가 `0`이고, 위 export가 전부 존재하며 `isPanelRecord`가 **부재**

### Task 2: `linkage-audit.js` — 수집 · 집계 · state ladder

- **Action**:
  - 수집: `.claude/receipts/mccp-pr-codex/*.json`(비재귀) + `.claude/reviews/*.md` + `.claude/reviews/archive/*.md`(각 비재귀 — corpus.js와 동일)
  - 리뷰 층 파싱은 **`require('./plan-review/corpus').parseRecord`** (DD1a). 서명·펜스 파서 재구현 0줄
  - 파티션: `--baseline-ref`(기본 `DEFAULT_BASELINE_REF` — DD8) → `git show -s --format=%cI` → `pre_baseline` / `post_baseline` / `undated`. **날짜 원천은 DD5의 3행 표를 그대로 쓴다 — 여기 재기술하지 않는다**(초안은 이 자리에 DD5가 명시적으로 거부한 `git log -1` 형태를 괄호로 다시 적어 정본이 둘이 됐다. 표가 유일 정본이고, `pre_measurement`는 `--diff-filter=A --follow`다). 해소 실패 시 `baseline.state='unresolved'`
  - 집계 축: `round_structure`(선택 정의 + 5개 대조값, **분모는 `kind='record'`**, `pre_measurement` 건수를 `coverage` 하한 표식으로 동봉) · `ship_eligibility`(3값 분포 + 사유별) · `linkage`(양방향 각각 + bidirectional) · `filename_convention`(라벨로만 — 정의 아님) · `corpus_boundary`(`parseRecord`의 **4분류 그대로**: `record` / `pre_measurement` / `out_of_corpus` / `parse_failure`)
  - state ladder: DD7 표 그대로 — `degraded`(1) · `blind`(2) · **`unresolved`(3)** · `ok`(0), 미지 state → 1
  - 출력: `--frozen-only`(동결 대상 — DD7 표의 정확히 3필드: `baseline` · `pre_baseline` · `undated_at_baseline`) · `--json`(전체 + `post_baseline` + 전역 `undated` + 전역 `state`, 진단용) · human render. **절대 경로 미출력**(DD6) — git 해소 실패 메시지를 그대로 싣지 않고 ref와 사유 분류만 싣는다(`corpus.js:723-725`가 `err.message`를 그대로 실어 절대경로를 흘리는 것을 미러하지 않는다)
- **Mirror**: `evidence-audit.js:20-51`(state ladder) · `:56-75`(STATE_EXIT_CODES · warn · 수집 함수 형태), `corpus.js:640-700`(git ref 해소 · `audit()`).
- **Validate**: `node plugins/mccp/scripts/lib/linkage-audit.js --json` 이 exit 0/1/2/3 중 하나로 끝나고 stdout이 파싱 가능한 JSON. `--frozen-only` 출력에 `post_baseline` 키가 **부재**

### Task 3: 술어 회귀 test

- **Action**: `linkage-defs.test.js` — 픽스처로 다음을 고정한다.
  - `hasRoundStructure`: `1` · `3` 참 / `0` · `-1` · `1.5` · `"2"` · `null` · `undefined` · 키 누락 거짓
  - 5개 대조 정의 각각이 의도한 텍스트에만 반응
  - `classifyShipEligibility`: `plan_hash` 존재만으로 `eligible`이 되지 **않음**(회귀 가드 — 실측이 배제한 판별자다) · 사유 없는 `not_eligible` 불가
  - `classifyLink`: 본문 산문에 `receipt_hash`가 등장해도 `review_to_receipt`가 거짓 (DD4 오탐 가드)
  - `classifyLink`: 절대경로 · `..` · 드라이브 문자 · UNC 형태의 링크 값은 `receipt_to_review`가 거짓 (DD4가 "repo-relative"라 못박은 형태 제약 — M3가 이 술어를 경로 결합 판별자로 재사용하므로 test로 봉인한다)
  - **긍정 픽스처 3종 — 이것이 없으면 상수 스텁이 전 단언을 통과한다.** 위 항목과
    Acceptance 4·5는 전부 *부정*이라 `classifyLink`가 언제나 거짓을,
    `classifyShipEligibility`가 언제나 `undecidable`을 반환해도 green이다. M3가 소비할
    두 술어가 **아무것도 인식하지 못해도 붉어지지 않는** 상태이므로 각각에 참 케이스를 건다:
    (a) `LINKAGE_FIELD_NAMES`의 receipt 필드에 잘 형성된 repo-relative 경로 → `receipt_to_review` 참,
    (b) `## Measurement` JSON에 `receipt_hash`가 실린 레코드 → `review_to_receipt` 참,
    (c) 두 방향이 모두 참인 쌍 → `bidirectional` 참,
    (d) M3가 만들 명시 proof 필드를 담은 receipt → `eligible`, 그 필드가 "이 ship에는 plan
        리뷰가 없다"를 주장하면 → `not_eligible`(사유 동봉)
  - **`isPanelRecord`가 `linkage-defs.js`에서 export되지 않음**을 단언 (DD1a 복제 금지의 기계 가드)
  - 적대적 입력(빈 문자열 · 널바이트 · 거대 줄 · 잘린 JSON)에 throw 0 (DD6)
  - **병리적 입력에 대한 벽시계 상한** — `ROUND_STRUCTURE_CONTROLS` 5개 regex가 레코드 전문에 대해 각각 돌므로, throw 없이 *멎는* 실패(ReDoS·무한 스캔)는 위 항목이 못 잡는다. 모호 토큰을 크게 반복한 입력에 대해 5개 전부가 상한(예: 1초) 안에 반환함을 단언한다. 함께 Task 1에 구성 제약을 못박는다: **중첩 quantifier 금지**, 앵커 우선, 백트래킹 유발 교대(alternation) 금지
- **Mirror**: `tests/plan-review-corpus.test.js:1-45` 픽스처 빌더 + 한계 명시 주석.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/linkage-defs.test.js`

### Task 4: 집계 회귀 test

- **Action**: `linkage-audit.test.js` — 임시 디렉토리에 합성 코퍼스를 세워 다음을 고정한다.
  - state ladder 4분기 각각(`ok` · `degraded` · `blind` · **`unresolved`**) + 미지 state → 1. 특히 **경계 ref가 해소되지 않으면 exit 0이 아님** — 미러 선례(`corpus.js:670`)가 갖는 fail-open을 M1이 물려받지 않았음을 고정한다 (DD7)
  - 경계 파티션: 같은 코퍼스에 `post_baseline` 파일을 추가해도 `pre_baseline` 수치와 **`--frozen-only` 출력 바이트가 불변** (DD5·DD7의 핵심 주장 — 이 test가 없으면 "동결"은 산문이다)
  - **경계 이후에 날짜 원천 없는(undated) 파일을 추가해도 `--frozen-only` 바이트가 불변** — 전역 `undated`를 동결 블록에서 뺀 이유를 직접 단언한다. 같은 파일이 `--json`의 전역 `undated`에는 나타나고 전역 `state`를 `degraded`로 만든다(둘이 분리돼 있음을 함께 고정)
  - `DEFAULT_BASELINE_REF`가 리터럴 `647dfec`이고 `origin/main`에서 도달 가능함 (DD8 — 조용한 값 변경 시 red)
  - `pre_measurement` 레코드가 `round_structure` 분모에 **들어가지 않고**, `coverage`가 그 건수를 하한으로 표시함 (DD2 — 부재를 0으로 접지 않는다)
  - `blind`일 때 어떤 비율도 보고하지 않음
  - `undecidable`이 0으로 접히지 않음
  - `out_of_corpus`가 결손으로 계상되지 않음
  - **`corpus.js#parseRecord`와 소속 판정이 일치**: 같은 합성 코퍼스에 대해 `linkage-audit`이 세는 패널 건수와 `corpus.aggregate`가 세는 건수가 같음 (DD1a — 두 도구가 갈리면 red). 픽스처는 **`archive/` 하위 파일을 반드시 포함**한다 — 그 경로가 빠진 픽스처는 수집 범위 누락을 구조적으로 못 잡고, 실제로 그 누락이 acceptance 건수를 47과 51로 갈랐다
  - `undated > 0` 이면 state 가 `degraded`(exit 1)이고 `ok` 가 아님 (DD7 — 날짜 원천 고장이 레코드를 침묵 삭제하며 exit 0을 내는 fail-open 가드)
  - `--frozen-only` 출력에 `undated` 건수와 파일명이 **실린다** (동결 산출물이 자기 커버리지 결손을 숨기지 않는다)
  - `pre_measurement` 레코드의 날짜가 파일 내용 수정·rename 후에도 **불변** (DD5 — `--diff-filter=A --follow` 가 마지막-손댐 시각이 아니라 추가 시각을 잡는다는 주장의 기계 확인)
- **Mirror**: `evidence-audit.test.js`의 tmp-repo 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/linkage-audit.test.js`

### Task 5: 동결 baseline 문서

- **Action**: `docs/review-record-linkage/frozen-baseline.md` 작성.
  - 재현 명령 1줄 + `<!-- BEGIN linkage-audit.js --frozen-only (verbatim) -->` 축자 블록.
    **동결 대상은 `--frozen-only` 출력이다** — 전체 `--json`은 `post_baseline`을 담아
    가변이므로 새 ship이 하나만 착지해도 바이트 검증이 확정적으로 붉어진다(DD7)
  - **손으로 옮긴 숫자 0** — 본문 서술은 블록을 인용만 한다
  - 정의 선택 근거: D1이 5개 후보 중 **오늘 값이 가장 낮은** 정의라는 사실을 대조 표와 함께 (UI8 · 기준 게이밍 risk의 직접 반증)
  - PRD 표와 재현값의 불일치(A 3→0 · C 32→28 · E 42→46)를 명시 — 같은 정의의 다른 구현도 값을 바꾼다
  - D2가 과거 코퍼스에서 `undecidable`인 이유와, M3가 만들어야 할 명시 proof 필드의 요구사항
  - 이 문서가 주장하지 않는 것: 라운드 수의 소급 복원 · 리뷰 품질 · 임계값
- **Mirror**: `docs/diverse-agent-review/quorum-calibration.md` 전체 구조.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js` —
  test가 커밋된 문서에서 `<!-- BEGIN … -->` / `<!-- END … -->` 사이를 추출하고 도구를
  실제로 spawn해 stdout과 바이트 비교한다. **산문 지시가 아니라 test다** (초안은 "바이트
  일치"를 Validate 줄의 서술로만 두었고, Risks 표는 그것을 "기계로 확인된다"고 주장했다 —
  실행 가능한 명령도 test 파일도 없이. 그 격차가 이 파일을 만든 이유다)

### Task 6: 게이트 무접촉 기계 검증 + PRD 행 갱신 + version 4면 동기

- **Action**:
  - `git diff --name-only <base>...HEAD` 가 "변경하지 않는 파일" 목록과 **교집합 0**임을 확인
  - `git diff --diff-filter=D --name-only <base>...HEAD` 가 공집합임을 확인 (§3.5.1 머지 삭제 사고 방지)
  - PRD `Delivery Milestones` M1 행: `pending` → `in-progress`, `Plan` 셀 = `.claude/plans/review-record-linkage-m1.plan.md`
  - version 4면 동기(§3.7): `plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md`(`currently` 노트 + 새 항목)
- **Mirror**: §3.7 병렬 브랜치 forward-only 절차.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 1. 순수 모듈이 실제로 dep-free인가 + 복제 금지 (DD1 · DD1a의 기계 검증)
grep -c "require(" plugins/mccp/scripts/lib/plan-review/linkage-defs.js   # 0
grep -c "isPanelRecord\|Plan Review Panel" plugins/mccp/scripts/lib/plan-review/linkage-defs.js  # 0
grep -c "parseRecord" plugins/mccp/scripts/lib/linkage-audit.js          # >= 1 (corpus.js 소비)

# 2. 술어 · 집계 회귀
node --test plugins/mccp/scripts/lib/tests/linkage-defs.test.js
node --test plugins/mccp/scripts/lib/tests/linkage-audit.test.js

# 3. 인접 코퍼스 도구 회귀 (같은 .claude/reviews/ 를 읽는다 — corpus.js 를 소비하므로 필수)
node --test plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js
node --test plugins/mccp/scripts/lib/tests/evidence-audit.test.js

# 4. 도구 라이브 완주 — 이것이 acceptance의 산출물이다
node plugins/mccp/scripts/lib/linkage-audit.js
node plugins/mccp/scripts/lib/linkage-audit.js --json          # 전체(진단용, 가변)
node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only   # 동결 대상(불변)

# 5. 문서의 동결 블록이 라이브 출력과 바이트 일치하는가 — test가 추출·spawn·비교를 한다
node --test plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js

# 5b. 동결 출력에 절대 경로가 없는가 (DD6 — 이 출력은 git-tracked 문서에 동결된다)
#     형태로 잡는다 — 디렉토리 이름을 열거하지 않는다. JSON 문자열 VALUE가
#     (a) `/`로 시작하거나 (b) 드라이브 문자로 시작하거나 (c) UNC면 절대경로다.
#     초안은 여기서 "열거식이 아니다"라고 주장하면서 8개 디렉토리를 열거해,
#     /builds · /workspace · /data 같은 CI·컨테이너 루트를 그냥 통과시켰다.
node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only \
  | grep -nE ':[[:space:]]*"(/|[A-Za-z]:[\\/]|\\\\\\\\)' && \
  echo "ABSOLUTE PATH LEAKED" || echo "no absolute path"

# 6. 게이트 무접촉 (UI7) — 출력이 없어야 한다
git diff --name-only origin/main...HEAD \
  | grep -E 'receipt/(write|cli|schema|hash)\.js|plan-review/record\.js|commands/(plan|prp-implement|pr)\.md'

# 7. 삭제 사고 검증 (§3.5.1) — 공집합
git diff --diff-filter=D --name-only origin/main...HEAD

# 8. version 4면 동기 (§3.7)
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **도구를 만들었는데 아무도 안 부른다** — 이 저장소의 지배적 실패 모드 | 중 | M1은 게이트 배선이 아니라 **판정 도구**다(`corpus.js` 선례와 동형). 소비 계약이 두 곳에 실재하고 각각 기계 장치가 있다: 문서의 축자 블록은 `linkage-frozen-baseline.test.js`가 커밋된 문서를 읽어 라이브 출력과 바이트 비교하고, `linkage-defs.js`의 export는 Task 3의 긍정 픽스처가 술어가 실제로 인식함을 단언한다. **초안은 이 칸에서 "둘 다 기계로 확인된다"고 주장하면서 그 기계를 만들지 않았다** — 그 격차가 R2의 HIGH였고 위 두 파일이 그 답이다 |
| M1 정의가 과거를 유리하게 보이도록 선택된다 (기준 게이밍) | 중 | 선택한 D1이 5개 후보 중 **오늘 값이 가장 낮다(0%)**. 5개 대조값이 코드(`ROUND_STRUCTURE_CONTROLS`)와 문서 양쪽에 상주하고 정의 변경 시 재측정 의무가 남는다 |
| 동결 baseline이 새 ship 착지로 조용히 드리프트한다 | **높음** — 사이클 중 병렬 자식이 ship한다 | DD5 경계 파티션 + DD7 `--frozen-only`. 바이트 검증을 가변 `post_baseline`이 아니라 동결 파티션에만 걸고, `pre_baseline` 불변성을 Task 4의 test가 직접 단언한다 — 산문이 아니라 test가 지킨다 |
| 경계 ref 해소 실패가 조용히 통과해 "동결"이 성립하지 않은 채 exit 0이 난다 | 중 | DD7 — `unresolved`가 자기 exit code(3)를 갖는다. 미러 선례(`corpus.js:670`)가 이 fail-open을 실제로 갖고 있으므로 **의도적으로 벗어난다**는 사실을 DD7과 Patterns 표에 명시했고, Task 4의 test와 Acceptance 6이 라이브로 확인한다 |
| M1이 `corpus.js`의 정의를 복제해 두 도구가 같은 코퍼스에 다른 건수를 보고한다 | 중 | DD1a — 재구현하지 않고 `parseRecord`를 소비한다. Task 3이 `linkage-defs.js`에 `isPanelRecord` 부재를 단언하고, Task 4가 두 도구의 소속 판정 일치를 단언한다 |
| D2를 `undecidable`로 두면 지표 2가 계산 불가로 남는다 | 중 | 그것이 **정직한 오늘 상태**다. M1은 전방 판별자(명시 proof 필드)의 요구사항을 문서로 넘겨 M3가 만들게 한다. 휴리스틱으로 채우면 지표 2가 측정을 가장한 동어반복이 된다 |
| 적대적/손상 마크다운이 파서를 죽인다 | 낮음 | DD6 총함수 + Task 3의 적대적 입력 test. 실패는 `parse_failure`로 분류되어 `degraded`를 만든다 (침묵하지 않는다) |
| M4가 정의를 import하지 않고 복제한다 | 중 | DD1 모듈 분리로 import가 `record.js`의 dep-free 계약을 깨지 않게 만든다 — 복제의 유일한 정당화를 제거한다. 강제는 M4 소관 |
| version 충돌 (§3.7 9회 재발) — origin/main이 이미 `1.33.6`, 로컬 `1.33.1`, base가 origin/main에서 갈라짐 | **높음** | forward-only 상향. 머지 해소 시점과 `/mccp:pr` 진입 직전 **두 번** 재계산. C0가 먼저 착지하면 선언 철회(UI12) |
| `.claude/reviews/` 를 in-flight `diverse-agent-review-m9`가 공유 소유 | 중 | M1은 그 디렉토리를 **읽기만** 한다(UI7). `record.js` 무접촉이 Task 6에서 기계 확인된다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

**라이브 완주가 생산해야 하는 산출물** (위 마지막 항목의 구체화 — 이것이 없으면 완료가 아니다):

1. `node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only` 이 실제 저장소 코퍼스에 대해
   완주하고, `undated_at_baseline` 이 0이다(그 건수는 `--frozen-only` 출력에 실린다 — DD7).
   하나라도 있으면 `baseline.state` 가 `degraded` 이고 DD5의 날짜 원천 표가 baseline tree를
   덮지 못한 것이다. 전역 `undated`(경계 밖 포함)는 `--json` 에서 따로 확인한다 — 동결
   블록의 판정 대상이 아니다.

   **건수는 리터럴로 못박지 않고 파생한다.** 초안은 "패널 레코드 47건"이라 적었는데 그것은
   `.claude/reviews/` 최상위만 센 수이고, Task 2의 수집 범위는 `archive/` 를 **포함한다**
   (corpus.js `REVIEW_SUBDIRS` 와 동일) — 실측 47 + 4 = **51**. 게다가 이 사이클이 만든
   `plan-review-review-record-linkage.md` 자신이 코퍼스에 들어와 있고 경계에 따라
   `post_baseline` 으로 갈 수 있다. 그래서 acceptance 는 다음 등식으로 쓴다:

   ```bash
   # 좌변: 도구가 pre_baseline 에서 센 패널 레코드 (record + pre_measurement)
   # 우변: 두 스캔 경로에서 첫 줄 서명을 갖는 파일 중 경계 이전인 것
   # 두 수가 같아야 하고, 그 값이 몇인지는 실행이 답한다 (리터럴 고정 금지 —
   # 코퍼스가 움직이면 확정적으로 붉어지는 acceptance 는 DD7 이 거부한 형태다)
   ```
2. 그 출력이 `docs/review-record-linkage/frozen-baseline.md`의 축자 블록과 **바이트 일치**하고,
   그 안에 `post_baseline` 키가 없다 (DD7 — 동결 대상은 가변 파티션을 포함하지 않는다).
3. 출력의 `round_structure` 가 **`kind='record'` 분모에 대해** `selected` 0을 보고하고,
   `coverage` 가 `pre_measurement` 건수를 하한 표식으로 함께 싣는다. `controls` 5개가
   대조값을 동봉한다.
4. 출력의 `ship_eligibility` 가 71건 전건 `undecidable` + 사유를 싣는다 (0이 아니다).
5. 출력의 `linkage` 가 양방향 각각 0을 보고하고, 리뷰 본문에 `receipt_hash` 문자열이 있는
   레코드가 `review_to_receipt` 로 계상되지 **않는다**.
5b. **위 4·5의 0은 상수 스텁으로도 만족되므로 단독으로는 acceptance 가 아니다.** Task 3의
   긍정 픽스처 4종이 green 이어야 그 0이 "인식 능력이 있는데 대상이 없다"를 뜻한다 —
   그것이 없으면 "아무것도 인식하지 못한다"와 구분되지 않는다.
6. 경계 ref를 해소 불가한 값으로 주면(`--baseline-ref deadbeef`) 도구가 **exit 3
   (`unresolved`)** 를 내고 `ok` 를 보고하지 않는다 (DD7 — 미러 선례의 fail-open을 물려받지
   않았음을 라이브로 확인).
7. `git diff --name-only origin/main...HEAD` 에 게이트 파일이 0건이고 `corpus.js` 도 0건이다.

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~40k.

### Findings (severity-ranked)

- **[HIGH][architect]** M2(rounds-channel)이 착수 전 필수로 못박은 Open Question("rounds가 세는 것이 무엇인가 — 게이트마다 라운드 개념이 다름")이 PRD 안에서 미해결 상태로 남아 있다. plan.md가 이걸 실제로 M2 착수 전 게이트로 강제하지 않으면, 세 게이트(plan/prp-implement/pr)가 서로 다른 의미의 정수를 같은 `resolution.rounds` 필드에 채워넣는 스키마 붕괴가 구조적으로 예견된다. — PRD :103 "M2 착수 전에 답해야 한다 — 답이 없으면 세 게이트가 서로 다른 것을 세면서 같은 필드에 넣는다"
- **[HIGH][test]** No draft plan exists yet — this fan-out ran against the PRD only. All findings below are testability risks the eventual plan must resolve; none can be verified against concrete task-level 'Validate' steps because there are none yet. — Prompt states 'Draft plan: (draft plan not yet written)'
- **[HIGH][test]** PRD Risk row 1 already prescribes the right test shape ('wiring-absence test — static assertion that a call line exists in the body + a real spawn e2e') but the plan has not yet instantiated it per milestone. Without an explicit task-level mapping (M2 -> which of the 3 gate bodies get a spawn e2e, M3 -> link roundtrip e2e), the PRD's own anti-pattern (new channel exists but gate never calls it) will recur silently, exactly as it did for --resolution-file (PRD:21). — PRD:113 'acceptance을 producer가 아니라 산출된 실값으로 둔다... 배선 부재를 보는 test(본문에 호출 줄이 실재하는지의 정적 단언 + 실제 spawn e2e)가 없으면 그 마일스톤은 완료가 아니다'
- **[HIGH][test]** M2's oracle for correctness is undefined pending an unresolved Open Question ('rounds가 세는 것이 무엇인가') — a plan that starts M2 test-writing before this question is answered can only assert presence/non-null, not correctness (i.e. that the recorded round count matches each gate's actual round semantics: plan L1/L2/L3 vs Codex R1/R2 vs pr dedupe-or-not). — PRD:103 'M2 착수 전에 답해야 한다 — 답이 없으면 세 게이트가 서로 다른 것을 세면서 같은 필드에 넣는다.'
- **[HIGH][test]** M3's 'present-only, makeSkeleton 미포함' hash-stability requirement needs an explicit hash-exclusion regression test mirroring the existing pattern (hash-briefing-exclusion.test.js), not just a prose acceptance note — otherwise a future accidental inclusion in makeSkeleton silently breaks receipt_hash for all 71 historical receipts (a CRITICAL-impact risk per the PRD's own Risk table). — PRD:115 risk row: 'Impact 높음 — §3.12 감사 코퍼스 파손... 선례가 확립돼 있다(pr_codex_force_override · intent 10필드)'; test pattern exists at plugins/mccp/scripts/receipt/tests/hash-briefing-exclusion.test.js and hash-ledger-exclusion.test.js
- **[HIGH][explorer]** resolution.rounds is NOT present-only — it is materialized unconditionally via defaultResolution literal (rounds:1) at write.js:393-399 and lives inside resolution, which IS hashed (unlike meta present-only fields). M2 cannot mirror the SANTA_INT_FIELDS present-only pattern verbatim since resolution already ships on every receipt; the closer precedent is codex_verdict which augments the same already-hashed resolution object. — plugins/mccp/scripts/receipt/write.js:393-400 (defaultResolution literal, unconditional) vs :402-412 (codex_verdict present-only within resolution, OMITTED not set null)
- **[MEDIUM][architect]** `meta.*_rounds` 5종(design_critique_rounds, merged_verify_rounds, santa_rounds 등)과 신설 `resolution.rounds`의 관계가 Out of Scope로 명시되면서도 동시에 Open Question으로도 남아 있어, 결정층 스키마 경계가 이번 사이클 내에 확정되지 않는다. 두 필드군이 실질적으로 같은 개념(라운드 카운트)을 서로 다른 레이어(meta vs resolution)에 중복 소유하는 상태가 그대로 고착될 위험. — PRD :83 "meta.*_rounds 5종의 통합·정리 — out of scope" 및 :104 Open Question — write.js:680-812에서 이미 5개 meta 카운터가 존재 확인
- **[MEDIUM][architect]** M3(bidirectional-link)의 링크 배선 주체가 명시되지 않았다 — record.js(리뷰 원문 writer)가 receipt_hash를 받으려면 receipt가 먼저 존재해야 하는데, 현재 시퀀스상 record.js는 receipt/cli.js derive-decision에서 slug만 받고(record.js:65 주석) receipt write는 그 이후/별도 커맨드에서 일어난다. 두 writer 간 실행 순서·데이터 흐름 경계가 PRD에 정의돼 있지 않아 M3 구현 시 어느 프로세스가 어느 값을 언제 아는지가 암묵적으로 남는다. — record.js:65 comment "The slug reaches this module from receipt/cli.js derive-decision"; PRD :36 "record.js에 receipt 인지는 0건이라 배선은 실재하지 않는다"
- **[MEDIUM][architect]** M1(linkage-baseline-parser)이 정의하는 3개의 판정 기준(라운드 구조 보유·리뷰 대상 ship·층간 링크)이 이후 M2·M3·M4 세 마일스톤 모두의 acceptance 분모로 소비되는데, 이 파서가 단일 모듈로 결합되는지 3개 독립 함수로 분리되는지 PRD가 규정하지 않는다. 결합도가 높으면 M4(review-round-structure)가 M1 파서를 import하는 구조가 강제되지만 그 계약이 명시적 인터페이스로 문서화돼 있지 않아 확장 시 순환/암묵 의존 위험이 있다. — PRD :68 "M2·M3·M4의 목표치가 전부 M1이 정하는 분모 위에 선다"; PRD :99 "M1이 선행이다" — 소비 계약의 모듈 경계는 미기술
- **[MEDIUM][architect]** chore ship 판별 기준(Open Question)이 M1 파서의 핵심 입력인데 아직 미확정이며, 이 판정이 지표 2(층간 링크율)의 분모 계산에 직접 개입한다. 판별 로직이 파일명 prefix 휴리스틱에서 receipt 필드 기반으로 바뀔 경우 M1 파서 자체가 재작업 대상이 될 구조적 위험이 있다. — PRD :107 "파일명 prefix는 관례일 뿐 계약이 아니다. receipt 안의 어떤 필드가 정직하게 말하는가"
- **[MEDIUM][security]** M2's planned `--rounds` CLI input channel would be self-attested by whichever process calls receipt/cli.js, with no cryptographic or structural tie to actual review-round execution — mirroring the exact forgery class CLAUDE.md §3.13 already had to structurally block for the intent gate (`intentDecision` non-CLI-reachable) because `parseFlags` forwards arbitrary `--*` to `write()`. — plugins/mccp/scripts/receipt/cli.js:44 parseFlags + :458 forwards all `--*` flags into write(); CLAUDE.md §3.13 'intent 결정은 CLI 표면을 갖지 않는다' explains why `--intent-*` flags were deliberately withheld. PRD Milestone 2 proposes resolution.rounds에 게이트용 입력 통로(--rounds류) — the same shape of trust boundary the intent gate exists to avoid.
- **[MEDIUM][security]** M3's bidirectional link (receipt -> review path, review -> receipt id) must reuse the existing sanitizeSlug()-style defense-in-depth already present in plan-review/record.js, or a maliciously/accidentally crafted slug/decision_id could enable path traversal when the receipt-side write constructs a review file path from an untrusted-in-principle value. — plugins/mccp/scripts/lib/plan-review/record.js:65-77 sanitizeSlug() strips to [A-Za-z0-9._-], caps length 120, and the file comment states 'the slug reaches this module from receipt/cli.js derive-decision, which is repo-internal — but it is concatenated into a filesystem path, so treat it as untrusted anyway.' The plan must apply identical discipline to any new review_path/receipt_hash link fields.
- **[MEDIUM][test]** M1's 'frozen baseline' has no described regression guard against silent drift if the corpus of 71 receipts/reviews changes (e.g. new files land in .claude/receipts or .claude/reviews before M1 code runs, or the parser is later edited). The plan should pin a fixture snapshot test (locked fixture copy or corpus hash) rather than re-deriving from the live, mutable .claude/reviews and .claude/receipts trees, or the 'frozen' baseline silently changes on each run. — PRD:105 '문서(docs/)에 축자 블록으로 동결하면 재생성 의무가 생기고(선례: M8 quorum-calibration)... 선례는 전자다' — PRD picks the doc-literal approach but doesn't specify the test that keeps doc and live corpus from diverging.
- **[MEDIUM][test]** The 5-definition comparison table (PRD:27-33, values 4.2%~59.2%) is itself an oracle the plan must pin as a golden-value regression test — without a test that re-runs the parser against a locked fixture corpus, the anti-gaming mitigation in the Risks table (row 4: '정의 변경 시 재측정 의무') has no mechanical enforcement. — PRD:116 'M1의 파서 정의가 과거 코퍼스를 유리하게 보이도록 선택된다 (기준 게이밍)... 정의 변경 시 재측정 의무' — stated as a documentation obligation, not a test obligation.
- **[MEDIUM][test]** Decision 2's chore-ship classifier (M1) has no stated test oracle for correctness beyond 'a parser decides it' — the 47 filename-mismatch ships mentioned at PRD:24 are exactly the fixture set that should become golden test cases (labeled chore vs. genuinely-unlinked review), but the PRD doesn't commit to using them as such, risking a classifier tuned only on visual inspection rather than a checked-in fixture list. — PRD:75 'plan 리뷰가 애초에 없는 ship을 분모에 넣으면 100%가 구조적으로 불가능해지고... chore ship 판별을 M1이 파서로 정의한다'; Open Question at PRD:107 'receipt 안의 어떤 필드가... 정직하게 말하는가' is unresolved
- **[MEDIUM][test]** No mention of a test for M2's downstream-consumer enumeration (dedupe/completion-ledger/derive reacting to non-constant rounds) despite Risk row 2 explicitly flagging this as medium-likelihood/high-impact — the plan should add a regression test that feeds a receipt with rounds>1 through dedupe.js/derive and asserts no behavior change, not just an enumeration document. — PRD:114 'M2의 첫 작업을 소비처 전수 열거로 못박는다 (Open Question 4). 열거 전 값 변경 금지' — enumeration is prescribed but no test to prove the enumerated consumers were actually checked for safe behavior under the new variable value.
- **[MEDIUM][explorer]** M2 (rounds-channel) has a directly-reusable prior-art pattern already in write.js: the conditional-materialization SANTA_INT_FIELDS array (spec -> flag/meta-key/min) plus the standalone design_critique_rounds/merged_verify_rounds int-parse closures. A plan that treats resolution.rounds input-channel design as greenfield would be reinventing exactly this shape. — plugins/mccp/scripts/receipt/write.js:680-685 (design_critique_rounds), :757-762 (merged_verify_rounds), :792-819 (SANTA_INT_FIELDS conditional materialization loop)
- **[MEDIUM][explorer]** The present-only + makeSkeleton-exclusion pattern is extremely well-established (pr_codex_force_override, codex_disabled_at_pr, intent_* 10 fields, mislabel 6 fields, arbiter 2 fields) — M3's link fields should follow this exact convention (schema.js validators, NOT makeSkeleton) to preserve §3.12 hash-corpus stability, per the PRD's own explicit call-out. — plugins/mccp/scripts/receipt/schema.js:1667-1808 (makeSkeleton — the sealed field list); comments at :1029, :1092, :1153, :1613-1623 documenting the same convention across milestones
- **[MEDIUM][explorer]** record.js's buildReviewRecord is documented pure/dep-free/non-throwing by design ('measuring must not be able to block approval'). Any M3/M4 plan that has record.js reach out to read receipt files or call receipt/cli.js itself would violate this stated invariant; the link value should be passed in via the existing opts object like slug/planPath/l1/l2/l3/decision. — plugins/mccp/scripts/lib/plan-review/record.js:16-21 ('Pure and dep-free... buildReviewRecord NEVER throws') and :196 (buildReviewRecord(opts) signature taking all state as plain data)
- **[LOW][architect]** M2와 M3는 "소유 파일이 다르다"는 이유로 병렬 진행이 허용되지만, 둘 다 결국 같은 ship receipt의 `resolution` 객체를 채운다 — write.js의 단일 defaultResolution 조립 지점(:393)에 두 축(rounds 채널 + 링크 필드)이 동시에 손을 대는 구조라 병렬 작업 시 머지 충돌이나 스키마 조립 순서 문제가 생길 여지가 있다. — PRD :99 "직렬 강제: M1 → (M2 병렬 M3) → M4" vs write.js:393-400 defaultResolution 단일 조립 지점
- **[LOW][security]** schema.js currently enforces `rounds >= 1` as a positive integer but has no upper bound; once rounds becomes gate-writable (not the hardcoded `1`), an unbounded or attacker/prompt-injected huge value could poison downstream leadtime math (C4) or dedupe/ledger consumers without any validator catching it. — plugins/mccp/scripts/receipt/schema.js:152 req(Number.isInteger(r.rounds) && r.rounds >= 1, ...) — no upper bound; PRD Open Question 4 explicitly flags that consumers (dedupe/completion-ledger/derive) have not been enumerated for how they react to rounds becoming a real variable.
- **[LOW][security]** Any receipt-side field embedding review-content-derived data (or vice versa) must go through the existing cell()-style escaping to prevent markdown-table injection / row-splitting; the PRD's M4 (review-round-structure format) does not mention this pattern and could regress it if reimplemented ad hoc. — plugins/mccp/scripts/lib/plan-review/record.js:46-57 cell() escapes backslash-first then pipe then strips newlines specifically because 'Evidence citations carry Windows paths and regexes, so this is not hypothetical here.' Any new M3/M4 writer touching .claude/reviews/*.md must reuse this helper.
- **[LOW][security]** hash.js's SUBJECT_FIELDS already includes top-level `round`; if M2 changes what populates `round` going forward, subject_hash semantics shift for future receipts even though historical hashes stay untouched per the no-rehash invariant — this boundary should be an explicit acceptance condition, not left implicit. — plugins/mccp/scripts/receipt/hash.js:178-187 SUBJECT_FIELDS includes 'round'; PRD Risk table row 3 requires present-only + no-rehash for M3 link fields but does not separately call out that top-level round (distinct from resolution.rounds) is a hashed SUBJECT field whose meaning is changing.
- **[LOW][explorer]** plan-review/record.js already derives and threads slug from receipt/cli.js derive-decision and already builds a measurement JSON block with reviewed_plan_hash/plan_path/recorded_at. This is the exact seam M3 (bidirectional-link) needs to extend; there is zero receipt_hash or receipt_path field in this module today, confirming the PRD's claim by direct inspection. — plugins/mccp/scripts/lib/plan-review/record.js:65-77 (sanitizeSlug/reviewRecordPath), :297-316 (measurement object — no receipt_hash/receipt_path field present)

### Meta-gaps

- draft plan이 아직 작성되지 않아(plan path: '(draft plan not yet written)') 구조적 리뷰의 절반은 PRD 레벨 추정에 그친다 — M1 파서의 실제 모듈 경계(단일 파일 vs 다중 모듈), M2 게이트 3곳의 통로 배선 지점(write.js 플래그 추가 vs cli.js), M3의 record.js↔write.js 데이터 전달 프로토콜이 plan에서 구체화돼야 이 리뷰의 findings가 실제 코드에 매핑된다.  _(architect)_
- PRD가 '소비처 전수 열거'를 M2의 첫 작업으로 못박았지만(Open Question 4, Risk 표) 그 열거의 산출물 형식(문서? 코드 주석? test?)이 정의돼 있지 않다 — plan이 이를 명시적 산출물로 지정하지 않으면 구조 경계 확인 없이 값 변경이 착수될 위험.  _(architect)_
- M4(review-round-structure)가 record.js의 기존 형식 자유도를 얼마나 제약하는지 — '최소 계약만 정하고 나머지 서술 자유도는 유지'라 하지만 그 계약의 정확한 스키마(필수 heading 형태, 필드 이름)가 아직 없어 M1 파서 정의와 M4 writer 정의가 두 마일스톤에 걸쳐 분리 결정되는 구조 — 정의 소유권이 갈라질 위험.  _(architect)_
- PRD Open Question 1 (누가 rounds를 채우는가) does not ask WHO/WHAT PROCESS is authorized to set the value — no authenticity/provenance requirement is specified for the new rounds channel, unlike the intent-gate precedent in CLAUDE.md §3.13 which explicitly closed the CLI-forgery surface. The plan should decide whether --rounds is CLI-reachable at all, and if so, name the forgery risk and accept/reject it explicitly.  _(security)_
- PRD does not mention path-traversal/identifier-sanitization requirements for the new M3 bidirectional link fields even though the sibling module (plan-review/record.js) already treats its own slug input as untrusted-by-design — the plan should cite and reuse that pattern rather than silently re-deriving it.  _(security)_
- No mention of what happens if .claude/reviews/*.md content (LLM/reviewer-authored, semi-untrusted) is read back by M1's read-only parser to compute 'review 대상 ship' or 'layer link' — parser must be robust against adversarial/malformed markdown since the PRD says the parser is 'LLM-free' but it consumes LLM-authored artifacts.  _(security)_
- No secrets/PII concern surfaced in the PRD (receipts/reviews are git-tracked, low sensitivity), but the plan should confirm no full absolute filesystem paths (§3.12 meta.cwd precedent) get embedded in the new link fields; review paths should be repo-relative only.  _(security)_
- No draft plan was available to review — this fan-out could only validate the PRD's own testing claims, not concrete task-level validate commands, file targets, or test file names.  _(test)_
- PRD does not specify which milestone (M1-M4) each new test file will live under, nor whether tests are unit (pure parser logic, read-only per M1's own 'LLM-free' constraint) vs integration (spawn e2e per gate for M2/M3).  _(test)_
- No mention of how the frozen 71-receipt/71-review baseline corpus will be made available to tests deterministically (fixture copy vs. reading the live git-tracked .claude/receipts and .claude/reviews trees, which could grow before CI runs).  _(test)_
- PRD Open Question 1 (what does 'rounds' count per gate — plan L1/L2/L3 vs Codex R1/R2 vs pr dedupe) is unresolved and flagged as needing an answer before M2; a draft plan must not skip straight to write.js wiring without first inspecting how each of the three gates (plan.md, prp-implement.md, pr.md) currently tracks round-like state internally to decide if one integer can represent all three.  _(explorer)_
- PRD Open Question 4 (rounds consumers: dedupe.js, completion-ledger, derive) requires an explicit consumer inventory before M2 changes the constant to a variable — no such inventory exists yet in the codebase; a plan lacking a 'grep all readers of resolution.rounds' step would violate the PRD's own stated M2 first-task requirement.  _(explorer)_
- record.js's slug/path derivation (from receipt/cli.js derive-decision) and receipt/cli.js's own derive-decision command were only grepped, not cross-checked for whether the SAME slug is guaranteed to match between the two writer invocations (receipt write vs record write) in a single gate run — the plan should verify this empirically rather than assume the PRD's 'already share slug' claim holds in all three gates.  _(explorer)_

### Patterns to mirror

- Present-only field 추가로 receipt_hash 안정성 보존 — 기존 선례 pr_codex_force_override·intent 10필드(CLAUDE.md §3.12, §3.13) — M3 링크 필드도 이 패턴을 따르도록 명시됨(PRD Risk 표, present-only를 M3 acceptance 조건으로 못박음)  _(architect)_
- 'acceptance는 producer가 아니라 산출된 실값' 원칙(PRD :95, Risk 표) — 이 저장소의 지배적 실패 모드(새 통로를 만들었지만 게이트가 안 부름)에 대한 구조적 대응 패턴으로, 기존 impeccable-detection-contract(§3.17)·intent-context(§3.13) M1들이 동일 패턴(배선 정적 단언 + e2e)을 이미 채택함 — M2/M3도 이 패턴을 재사용해야 함  _(architect)_
- meta.*_rounds 5종이 각각 독립 플래그를 갖는 write.js:680-812 구조 — 결정층 rounds 채널을 추가할 때 이 기존 5종의 플래그 조립 패턴(named flag → schema field)을 그대로 mirror할 수 있음  _(architect)_
- plugins/mccp/scripts/lib/plan-review/record.js:69-73 sanitizeSlug() — treat any identifier reaching a path-construction site as untrusted regardless of claimed internal provenance.  _(security)_
- plugins/mccp/scripts/lib/plan-review/record.js:46-57 cell() — backslash-first-then-pipe escaping order for markdown table cells; reuse verbatim for any new table rows in review records.  _(security)_
- plugins/mccp/scripts/receipt/schema.js:152 pattern of Number.isInteger(x) && x >= N guards for round/count fields — extend with an explicit upper bound for any newly gate-writable numeric field.  _(security)_
- CLAUDE.md §3.13 'intent 결정은 CLI 표면을 갖지 않는다' — precedent for withholding a CLI flag surface entirely when the value is a security-relevant self-attestation any shell caller could forge without the underlying event actually happening.  _(security)_
- plugins/mccp/scripts/receipt/hash.js:198-224 receiptHash() carve-out-by-delete pattern for present-only fields that must not perturb historical hashes — exact mechanism M3's link fields should follow.  _(security)_
- plugins/mccp/scripts/receipt/tests/hash-briefing-exclusion.test.js and hash-ledger-exclusion.test.js — canonical pattern for asserting a new field does NOT perturb receipt_hash; M3's present-only bidirectional-link fields should get an analogous test.  _(test)_
- plugins/mccp/scripts/receipt/tests/restamp-routed.test.js — canonical pattern for testing append-only-across-restamp + idempotent-within-restamp semantics with a real tmp-repo spawn (mkTmpRepo/writeFileSync helpers, process.chdir sandboxing, MCCP_BRIEFING=off to avoid live LLM calls) — directly reusable for M2's gate-body wiring e2e tests.  _(test)_
- node --test convention across plugins/mccp/scripts/receipt/tests/*.test.js (node:test + node:assert, no external framework) — M1's parser and M2/M3's schema/write changes should follow this, colocated under receipt/tests/ or a new plan-review/tests/ directory mirroring lib/plan-review/ structure (currently plan-review/ has zero dedicated test files per Glob).  _(test)_
- Conditional present-only int field materialization: plugins/mccp/scripts/receipt/write.js:792-819 (SANTA_INT_FIELDS loop) and :680-685 (design_critique_rounds) — parseInt + Number.isFinite/isInteger guard + skip-if-undefined/null/true.  _(explorer)_
- Present-only augmentation of an already-hashed nested object (resolution.codex_verdict): plugins/mccp/scripts/receipt/write.js:402-412 — closest analog for adding real round data to resolution.rounds without perturbing legacy receipts.  _(explorer)_
- schema.js present-only field convention with explicit makeSkeleton exclusion comments: plugins/mccp/scripts/receipt/schema.js:1029, :1092, :1153, :1613-1623 — the exact recipe M3's link fields should follow.  _(explorer)_
- record.js's total/non-throwing/pure-input design (opts object, no I/O, degradations array instead of exceptions): plugins/mccp/scripts/lib/plan-review/record.js:16-21, :196-220 — any new axis (receipt link, round count) should be threaded in the same way.  _(explorer)_

## External Research Provenance

- Source PRD: .claude/prds/review-record-linkage.prd.md
- References section sha256: 6285d0d8018061d14bd81f59fab68b7c3fcdd25580472eb34dd5b2f6449f5647
- Stamped at: 2026-09-01T06:40:39.910Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Design Critique

> DEGRADED: single-context — this session forbids spawning sub-agents unless the user asks, so Assessment A (design review) and Assessment B (detector) ran inline in one context instead of two isolated sub-agents. Declared per the critique reference's Hard Invariants; a silent degraded critique is a failed critique.

- 트리거: axis (b) — `DESIGN_SURFACE_PATHS` 화이트리스트의 `plugins/mccp/scripts/lib/renderer/` 가 `Files to Change` 에 등장 (§3.7 version 4면 동기).
- 라운드: 1 (R0) / cap 2 · verdict `CONVERGED`
- 변경되는 rendered surface는 정확히 두 리터럴이다 — `renderer/html.js:1419` page-foot 의 `v1.33.1`, `renderer/markdown.js:163` 의 `_derived from .claude/ · v1.33.1_`. 구조·토큰·레이아웃 변경 0.
- Assessment B (detector, `detect.mjs --json plugins/mccp/scripts/lib/renderer/`): 65건(advisory 59 · warning 6) — **전건 기존 부채이며, 이 계획이 바꾸는 두 줄에 걸린 finding은 0건**이다. exit 0.

4개 Output Constraints 대조 (Assessment A):

| 제약 | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | pass | 이 계획 본문의 `####` 이상 heading 0건, 최대 depth 3. rendered surface 에 heading 추가 없음 |
| 강조색 화면당 1개 | pass | accent/color 토큰 변경 0건 |
| raw markdown marker 금지 | pass | 두 리터럴 모두 기존 컨테이너(`<footer class="page-foot mono">` · 이미 이탤릭으로 렌더되는 derived 줄) 안의 버전 문자열 교체이며 마커 신규 도입 없음 |
| 한 화면 항목 수 상한 | pass | `list-of-N` 섹션(Open Questions · risk 표 등) 무접촉 |

주장하지 않는 것: 이 critique 은 렌더된 `status.html` 을 브라우저로 검사하지 않았고, 기존 65건 부채를 판정하지 않는다. produced-diff 의 H15 는 `/mccp:prp-implement` Phase 3.7 이 별도로 강제한다.

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더된 UI 가 없으므로 어떤 impeccable 명령도 **호출하지 않는다** — 아래는 구현자용 체크리스트다.

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

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) · classification `ok` · durationMs 51436
- 라운드 수: 1 (§3.16 — 1라운드 기본)
- 합치 결론: **needs-attention → HIGH 2건 + MEDIUM 1건 전부 ACCEPT_NOW로 흡수했다.** 세 지적 모두 이 계획이 자기 DD와 어긋난 지점을 정확히 짚었고, 코드가 아니라 계획 본문의 결함이었다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 Task 2가 DD5가 금지한 `git log -1`(마지막 손댐)을 괄호로 재기술해 정본이 둘 | HIGH | ACCEPT_NOW | L2 test 리뷰어도 독립적으로 잡은 동일 축. Task 2에서 명령을 지우고 "표가 유일 정본"으로 대체 |
  | F2 `--frozen-only`가 코퍼스 전역 `undated`를 실어, 경계 밖 파일 하나로 동결 바이트가 바뀜 | HIGH | ACCEPT_NOW | `post_baseline`을 빼서 없앤 가변성이 옆문으로 복귀. `undated_at_baseline`(baseline tree 범위)으로 좁히고 state를 `baseline.state`/전역 둘로 분리 (DD7 재작성) |
  | F3 기본 baseline 상수에 값이 배정되지 않아 경계가 구현자 재량 | MEDIUM | ACCEPT_NOW | §3.14는 MEDIUM 이연이 기본이나 **예외로 흡수**: 해소 불가 ref는 커밋된 동결 test를 영구 red로 만들고 F2 수정(baseline tree 조회)이 ref 해소에 의존한다. DD8 신설 — `647dfec`, origin/main 도달성 + ship 71/71 선행을 기계 확인 |
- Deferred to backlog: 0 (세 건 모두 그 자리에서 흡수)
- Open Questions: 없음 — auto-CRITICAL 카탈로그(secret 노출 · 데이터 손실 · 비가역 마이그레이션 · auth 우회 · 외부 목적지 변경 · 암호키) 해당 0건. M1은 쓰기 0건 read-only 도구다
- 잔여(구현 시 확인): plan-gate L2가 남긴 미해소 5건은 `.claude/plans/codex-findings-backlog.md`에 기계 적재돼 있다 (§3.15 단일통과 — verdict는 divergent 그대로 봉인).


### Security Reviewer

`Task(mccp:security-reviewer)` — pre-EXECUTE 제안 검토. **verdict: CRITICAL/HIGH 0건** (구현 착수를 막는 결함 없음). M1은 쓰기 0건 · 경로 구성 0건이라 즉시 착취 가능한 경로가 없고, subprocess는 전부 `execFileSync` + argv 배열(shell 미경유)이며 `<path>` 인자는 `--` 뒤에 온다.

| Finding | Severity | Verdict | 처리 |
|---|---|---|---|
| S1 `ROUND_STRUCTURE_CONTROLS` 5 regex의 ReDoS·무한스캔 회귀 test 부재 — 기존 적대적 입력 test는 throw 여부만 본다 | MEDIUM | ACCEPT_NOW | Task 3에 벽시계 상한 단언 + Task 1에 regex 구성 제약(중첩 quantifier 금지) 추가 |
| S2 §5b 절대경로 가드가 "형태로 잡는다"고 선언하면서 실제로는 8개 디렉토리 열거 — `/builds` · `/workspace` · `/data` 통과 | MEDIUM | ACCEPT_NOW | 자기모순이고 L2 test 리뷰어도 독립적으로 지적한 축. 열거를 지우고 JSON value 시작 앵커(`: "/` · 드라이브 문자 · UNC)로 교체 |
| S3 `classifyLink`가 denylist인데 M3의 경로 결합 판별자로 재사용 명시 — 저장소 선례(`sanitizeSlug`)는 allowlist | MEDIUM | ACCEPT_NOW | 술어를 바꾸지 않되 **DD4에 계약을 명문화**: M3는 이 통과만으로 경로를 만들지 않고 `path.resolve` containment check를 반드시 더한다. 봉인 시점이 계약을 적을 마지막 기회다 |
| S4 `git show -s --format=%%cI <ref>`에 `--` 구분자 없음 (argument injection 이론적 여지) | LOW | DEFER_TO_BACKLOG | `corpus.js:714` 선례를 그대로 미러한 것이라 **M1이 만든 신규 리스크가 아니다**. shell 미경유 + `--baseline-ref`는 로컬 CLI 사용자 자신의 입력. 방어 종심 차원의 통일은 별도 축 |

§3.14 예외 적용 근거: S1~S3은 전부 **계획 본문 한 줄** 수정이고, S2·S3은 이 계획이 스스로 선언한 설계와 어긋난 지점이다. 코드를 쓰기 전에 명세 결함을 고치는 것이 backlog 이연 후 재작업보다 싸다. S4만 이연한다.
