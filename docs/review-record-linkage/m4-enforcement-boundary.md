# M4 강제 경계 (round structure enforcement boundary)

> review-record-linkage M4 · DD7. 이 문서는 **경계가 무엇이고 왜 필요한가**를 소유하고,
> 값 자체는 코드가 소유한다 — `plugins/mccp/scripts/lib/linkage-audit.js`의
> `DEFAULT_M4_BOUNDARY_REF`. M1의 `DEFAULT_BASELINE_REF` ↔ [frozen-baseline.md](frozen-baseline.md)
> 관계와 같은 모양이다: 문서가 코드를 인용하지 그 반대가 아니다(UI2).

## 무엇을 가르는가

두 ref는 **다른 질문**에 답한다. 이름이 비슷해서 섞기 쉬우므로 여기 한 번 못박는다.

| 상수 | 질문 | 소비처 |
|---|---|---|
| `DEFAULT_BASELINE_REF` | 동결 baseline은 어디까지인가 | `--baseline-ref` · `--frozen-only` · 동결 파티션 전체 |
| `DEFAULT_M4_BOUNDARY_REF` | **어디부터** 라운드 구조를 요구하는가 | `--check-round-structure` · `--since` |

전자는 "과거를 어디서 얼렸는가"이고 후자는 "미래에 무엇을 요구하는가"다. 하나를 다른
하나로 대체하면 강제 범위와 지표 범위가 다시 어긋난다.

## 왜 경계가 필요한가

PRD 지표 3의 분모는 이미 "**착지 후** 발행분"이다. 없던 것은 그 "착지"를 기계가 아는
방법이었다.

`linkage-audit.js`의 라이브 파티션은 HEAD 트리의 패널 레코드 **전건**이고 착지 시점
필터가 없다. UI1이 소급 주입을 금지하므로 기존 레코드는 영구히 `absent`다. 따라서
"라이브 파티션에 `absent`가 있으면 비영점"과 "착지 후 exit 0"은 **동시에 참일 수 없었다**
— 종료 코드가 구조적으로 0이 될 수 없는 검사는 검사가 아니라 상수다.

경계는 그 모순을 없앤다. 경계 이전 레코드는 **보고는 하되 강제하지 않는다**. 이것은
소급 면제가 아니라 PRD가 이미 정한 분모를 그대로 반영하는 것이다 — 애초에 목표를 갖지
않는 구간이다.

## 창(window)이 정확히 무엇인가

`<boundary>...HEAD` — **3-dot**, 즉 `merge-base(boundary, HEAD)..HEAD`다. 판정 대상은
그 창에서 **추가·수정된**(`--diff-filter=AM`) `.claude/reviews/plan-review-*.md`와
`.claude/reviews/archive/` 하위의 같은 것뿐이고, 내용은 **HEAD 트리**에서 읽는다.

- **3-dot인 이유**: 경계 ref가 HEAD의 조상이 아닐 때(브랜치 작업 중이 정확히 그렇다)
  2-dot 트리 diff는 상대편이 추가한 파일을 이쪽의 "삭제"로, 상대편이 고친 파일을
  "수정"으로 잡아 **남의 레코드를 이 분모에 끌어들인다**.
- **HEAD 트리를 읽는 이유**: 라이브 파티션이 작업 트리 대신 HEAD를 읽는 것과 같은 규율이다
  (`linkage-audit.js`의 라이브 파티션 주석). 작업 트리를 보면 커밋되지 않은 레코드가
  통과 근거가 되어, 우회가 지표를 강등시키지 않는다.
- **따라오는 성질**: 아직 커밋되지 않은 레코드는 **창 안에 없다**. 그래서 구현 직후·커밋
  이전의 실행은 `in_scope=0`으로 exit 0을 낸다. 그것은 "전건이 통과했다"가 아니라
  "판정할 것이 없었다"이고, 도구가 그 차이를 `VACUOUS PASS` 경고로 **직접 말한다**.

## 종료 코드

`STATE_EXIT_CODES`와 **분리된** 표를 쓴다(`CHECK_EXIT_CODES`). 같은 표를 나눠 쓰면 한쪽
의미가 바뀔 때 다른 쪽이 조용히 따라간다.

| state | code | 뜻 |
|---|---|---|
| `ok` | 0 | 창 안의 레코드에 `absent`가 없다 |
| `violations` | 1 | `absent`가 1건 이상 — 이 도구의 본래 목적 |
| `degraded` | 2 | 창 안의 레코드를 다 읽지 못했다 — 판정 부재는 통과가 아니다 |
| `unresolved` | 3 | 경계 ref 자체가 해소되지 않았다 |

## 알려진 한계 (사후에 발견하지 말 것)

SHA 경계는 "M4를 아는 코드가 생산했는가"를 정확히 표현하지 **못한다**. 이 커밋 이후에
머지되는 **병렬 브랜치**의 레코드는 M4 이전 코드가 만들었어도 경계 이후로 잡혀
`absent`로 판정된다. 실측: 이 사이클과 동시에 `ci-full-suite-m2`가 진행 중이고 그
브랜치도 패널 레코드를 커밋한다.

그때의 정답은 상수를 앞으로 미는 것이 **아니다** — 그러면 그 사이 착지한 M4-aware
레코드까지 분모에서 빠진다. `--since <그 사이클의 경계>`로 창을 명시하는 것이 정답이고,
상수는 기본값이지 유일한 값이 아니다.

**따라서 acceptance·CI 성격의 호출은 기본형을 쓰지 마라** (local code-review M3). 위
한계는 "언젠가"가 아니라 **다음 머지**에 발현한다. 실측(2026-09-04) — 대기 중인
in-flight 브랜치의 패널 레코드가 전부 `rounds` 키 없이 경계 이후로 들어온다:

| 브랜치 | 신규 패널 레코드 | 판정 |
|---|---|---|
| `orchestrator-step-wiring` | 1 | `absent` |
| `ci-full-suite` | 2 | `absent` |

그리고 이 브랜치 자신에서도 상수는 이미 조상이 아니다(`git merge-base 2cb173c HEAD`
= `52e11d7`, fork point). 즉 기본형의 실효 창은 선언된 경계가 아니라 fork point다 —
오늘은 결과가 같지만 그 일치는 우연이다. 사이클의 경계를 직접 주는 것이 정확하다:

```bash
node plugins/mccp/scripts/lib/linkage-audit.js \
  --check-round-structure --since "$(git merge-base origin/main HEAD)"
```

기본형(`--since` 없음)은 **탐색용**이다 — "지금 코퍼스가 어떤 상태인가"를 묻는 데 쓰고,
"이 사이클이 규약을 지켰는가"를 묻는 데는 쓰지 않는다.

## 재현

```bash
node plugins/mccp/scripts/lib/linkage-audit.js --check-round-structure
node plugins/mccp/scripts/lib/linkage-audit.js --check-round-structure --json
node plugins/mccp/scripts/lib/linkage-audit.js --check-round-structure --since <ref>
```

라이브 파티션의 **보고**(강제 아님)는 전체 감사가 낸다:

```bash
node plugins/mccp/scripts/lib/linkage-audit.js | grep round_structure
```
