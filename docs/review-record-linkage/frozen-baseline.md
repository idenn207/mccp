# 층간 링크 baseline — 정의 고정과 실측 동결

> review-record-linkage milestone M1. 경계 `647dfecba75eecd9287ee538ca5f7056c7ba71da`
> (2026-09-01T10:10:57+09:00). 재현은 명령 한 줄이다.
>
> **이 문서가 내거는 오늘 값은 전부 아래 `## 동결된 실측` 블록에서 나온다.** 초판은
> 여기서 "손으로 옮겨 적은 숫자는 없다"고 더 넓게 주장했는데 거짓이었다 — §정의가
> 값을 바꾼다의 재현 열이 도구가 방출하지 않는 수기 값이었고, 이미 stale 이었다.
> 그 열은 삭제했다. 남은 손-인용은 둘이다 — PRD 값(**PRD 의 것으로 명시**)과,
> 아래 D3 주석·D2 표가 동결 블록에서 옮겨 적은 `27/75`. 후자는 블록 안에 실재하는
> 값이지만 test 가 대조하는 세 쌍에는 들어 있지 않으므로, 경계가 바뀌면 조용히
> stale 해질 수 있다. 그 한계를 감추지 않고 적는다.

```bash
node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only
```

도구([linkage-audit.js](../../plugins/mccp/scripts/lib/linkage-audit.js))는 read-only ·
LLM-free · standalone이며 **쓰기 0건**이다. 게이트 경로를 한 줄도 건드리지 않는다.
**임계값을 갖지 않는다** — 세는 것은 도구가 하고 판정은 이 문서가 한다.

## 무엇을 물었나

PRD는 "게이트가 한 일이 그 게이트의 기록에 남지 않는다"를 문제로 세운다. M1은 그것을
고치지 않는다. M1이 하는 일은 하나다 — **뒤따르는 마일스톤의 목표치가 설 분모를
정의로 고정하고, C1 이전의 값을 반증 가능하게 남긴다.**

정의 없이 착수하면 재현 불가능한 숫자가 하나 더 생긴다. 그것이 실제로 일어났다는
증거가 아래 §정의가 값을 바꾼다에 있다.

## 세 정의 (파서가 소유한다)

정의는 [linkage-defs.js](../../plugins/mccp/scripts/lib/plan-review/linkage-defs.js)가
소유한다. 이 문서가 그 파서를 인용하지, 파서가 이 문서를 따라가지 않는다.

| # | 이름 | 정의 | 오늘 값 |
|---|---|---|---|
| D1 | 라운드 구조 보유 | 패널 레코드 `## Measurement` JSON의 `rounds`가 **정수 ≥ 1** | 0 / 42 |
| D2 | 리뷰 대상 ship | 3값 — 명시 proof 필드(`meta.plan_review_expected`)가 결정. 부재는 `undecidable` | 75건 전건 `undecidable` |
| D3 | 층간 링크 | **구조적 위치**에서만 — receipt의 `meta.review_record_path`(repo-relative) ↔ 패널 레코드 `measurement.receipt_hash` | 양방향 각 0, **비율 계산 불가** (분모 `null`) |

> **M1 의 조인은 파일명 관례였고 그것이 이 방향의 천장이었다 — M3 가 그 천장을 없앴다.**
> M1 의 `review->receipt` 은 ship 을 순회하며 그 slug 로 레코드를 찾았으므로, 파일명이
> 어긋난 ship 은 레코드가 아무리 정확한 `receipt_hash` 를 실어도 미계상이었다. 실측
> 상한이 `filename_convention.match`(27/75)였다. **v1.34.5(M3)부터 조인은
> `explicit_field`** 다 — receipt 가 봉인한 `meta.review_record_path` 로 조회한다.
> 그 경로로 파일을 여는 것이 아니라 이미 스캔한 코퍼스 맵에서 찾을 뿐이므로 traversal
> 표면이 생기지 않고, 조회 실패는 링크 부재로 계상된다(dangling 봉인 경로는 링크가
> 아니다). `filename_convention.match` 는 이제 **라벨로만** 남는다.
>
> 위 동결 수치가 M3 에서 **한 자리도 움직이지 않은** 것은 조인이 무력해서가 아니라
> 이 코퍼스의 자격 ship 이 0건(전건 `undecidable`)이라 두 조인 모두 0 을 내기
> 때문이다. 재생성 diff 에서 바뀐 것은 `join` · `join_note` 문자열 **둘뿐**이고,
> 그것이 "정의를 바꾸되 기준선은 흔들지 않는다" 의 기계적 확인이다.
>
> 같은 milestone 에서 `bidirectional` 이 **더 엄격**해졌다: 레코드의
> `measurement.receipt_hash` 가 그 receipt 의 실제 `receipt_hash` 와 **같아야** 한다.
> `linkage-defs.js` 의 `classifyLink` 는 비어있지 않은 문자열인지만 보므로(그 정의는
> M1 소유이고 M3 는 손대지 않는다 — UI4), 이전 ship 이 남긴 stale 해시가 새 receipt
> 와 짝지어져 계수되는 경로가 실재했다. 감사 쪽에서 더 강한 조건을 얹고 그 차이를
> `join_note` 가 명시한다.

### D1을 산문 토큰이 아니라 구조로 정한 이유

지표 3이 지정한 읽는 주체는 "`record.js` 자체 검증 → 미달 형식은 **기록 시점에 거부**"다.
기록 시점에 거부하려면 정의가 writer가 결정론적으로 생산·검증할 수 있는 구조여야 한다.
산문 토큰은 리뷰어가 "R1에서 흡수함"이라 적기만 해도 참이 되므로 write-time에 강제할
대상이 아니다.

**그 선택은 오늘 값이 5개 후보 중 가장 낮다(0%).** 기준 게이밍 risk가 우려한 방향의
정반대이며, 그 사실이 아래 `controls` 배열에 매 실행마다 함께 실린다.

### D2가 전건 `undecidable`인 이유 — 그리고 그것이 결함이 아닌 이유

"receipt 안의 어떤 필드가 '이 ship에는 plan 리뷰가 없다'를 정직하게 말하는가"에 대한
실측 답은 **"그런 필드는 없다"** 이다:

| 후보 | 실측 | 판정 |
|---|---|---|
| `plan_hash` | 75/75 존재 | 판별 불가 |
| `meta.command` | `/mccp-pr-codex` 75/75 (상수) | 판별 불가 |
| `resolution.review_verdict` | 0/75 | 패널 축이 ship receipt에 도달하지 않는다 |
| 상류 plan/implement receipt | git에 **한 번도 tracked된 적 없음** | 증거 자체가 부재 |
| 파일명 관례 | 27/75 일치 | 관례이지 계약이 아니다 — 라벨로만 센다 |

그리고 **"패널 레코드가 존재하면 리뷰 대상"이라는 정의는 채택하지 않았다.** 그것은
분모를 분자로 정의하는 것이라 층간 링크율을 자명하게 100%로 만든다 — 측정을 가장한
동어반복이다.

`undecidable`은 0이 아니다. 0이라고 쓰면 "리뷰 대상 ship이 없다"는 판정이 되지만,
사실은 **판정할 수단이 없다**는 관측이다. 전방 판별자는 하류 마일스톤이 만들 **명시
proof 필드**여야 한다(휴리스틱이 아니라) — `codex_disabled`(ambient)와
`codex_disabled_at_pr`(명시)의 구분과 같은 형태다.

### D3이 구조적 위치만 인정하는 이유

선행 조사는 리뷰 71건 중 `receipt_hash` 문자열을 담은 것이 4건이라고 셌다. 전수 확인
결과 **4건 모두 리뷰어가 그 필드를 주제로 논한 finding 본문**이었고 링크가 아니었다.
파서가 `## Measurement` JSON의 키만 보면 그 오탐이 규칙 하나로 사라진다 — 산문 필터가
아니라 위치 제약이 막는다.

### D3의 분모가 `null`인 이유 — 0이 아니다 (PR-Codex R1 흡수)

이 문서의 초판은 D3을 `양방향 각 0`에 **전체 ship 수**를 분모로 붙여 적었다. 그런데
바로 위 D2가 그 ship 전건을 `undecidable`로 판정한다. 즉 도구가 자격 판별자를 정의해
놓고(UI2 전반부) 지표는 그 판별을 쓰지 않았다(UI2 후반부 위반). 그 조합의 실제 대가는
숫자가 틀린 것이 아니라 **읽는 사람이 그 분수를 유효 링크율 0%로 읽을 수밖에 없다**는
것이다 — 사실은 분자도 분모도 아직 의미를 갖지 않는데.

(이 문단이 은퇴한 분수를 리터럴로 인용하지 않는 것은 의도다. 인용하면 "블록 밖 산문이
오늘 값으로 내건 수치"를 검사하는 정합 test가 그것을 현재 주장으로 읽는다 — 실제로
초고가 그렇게 걸렸다.)

이제 링크는 자격 집합 **위에서만** 세고 분모는 그 집합의 크기다. 자격 집합이 비면
분모는 `null`이며, 이는 D2가 `undecidable`을 0으로 접지 않는 것과 **같은 구분**이다:

- `0`은 "리뷰 대상 ship이 없다"는 **판정**이다.
- `null`은 "리뷰 대상을 판별할 수단이 없다"는 **관측**이다.

오늘 값은 후자다. `linkage.coverage.rate_computable=false`가 그 사실을 기계로 나르고,
사람이 읽는 표면도 비율 대신 `RATE NOT COMPUTABLE`을 인쇄한다. 명시 proof 필드
(`meta.plan_review_expected`)가 서는 순간 분모는 자격 집합 크기가 되고 비율이 성립한다 —
그 전이는 `linkage-audit.test.js`의 PR-Codex R1 회귀 test 2건이 양방향으로 고정한다.

## 정의가 값을 바꾼다 — 그리고 같은 정의의 다른 구현도 바꾼다

PRD는 "정의를 바꾸면 4.2%~59.2% 사이를 오간다"고 적었다. 이 사이클이 그 표를 재현하다
발견한 것은 더 강한 명제다: **같은 정의의 다른 구현도 값을 바꾼다.**

| 정의 | PRD 기재 (n=71, PRD 의 값) | 동결 블록 (pre_baseline, n=55) |
|---|---|---|
| A `#### Round N` heading | 3 (4.2%) | `controls[A]` |
| B `round N` 토큰 | 8 (11.3%) | `controls[B]` |
| C `R1`/`R2` 토큰 | 32 (45.1%) | `controls[C]` |
| D B 또는 C | 34 (47.9%) | `controls[D]` |
| E `round`/`라운드` 단어 | 42 (59.2%) | `controls[E]` |

두 열의 분모가 다르다 — 왼쪽은 PRD 가 `.claude/reviews/` 최상위 71파일에 대해 적은
값이고, 오른쪽은 **경계 트리의 패널 레코드 55건**이다(타 생산자 문서를 제외한다).
왼쪽은 이 도구가 낸 값이 아니며 재현 명령도 없다 — "정의가 코드 밖에 있을 때 무슨
일이 생기는가"의 증거로만 읽어야 한다.

> **초판에는 세 번째 열("M1 재현", n=71)이 있었고 삭제했다.** 그 값들은 도구가
> 방출하지 않는 수기 값이라 재생성 명령이 없었고, 문서가 바로 위에서 "손으로 옮겨
> 적은 숫자는 없다"고 주장하는 것과 모순이었으며, 리뷰 파일이 하나 착지한 것만으로
> 이미 stale 이었다(E 46 → 47). 대조가 필요하면 도구에 그 모드를 만들어 바이트
> test 범위에 넣는 것이 답이지, 문서에 손으로 적는 것이 아니다.

## 동결은 트리다 — 파티션이 아니다

**이 절은 santa-loop R0 이 뒤집었다.** 초판은 여기서 "살아 있는 트리를 핀 고정 ref 로
pre/post 파티션한다"고 적었고, 그 설계가 자기 주장을 만족하지 못했다. ref 는 *날짜
하나*만 주고 무엇을 셀지는 작업 트리가 정했으므로:

- 경계 커밋이 이 브랜치의 조상이 **아니면** 트리가 다르다. 실제로 아니었다 —
  `647dfec` 의 트리에는 ship 75건이 있는데 도구는 작업 트리의 71건을 셌고, 그 차이는
  어느 카운터에도 나타나지 않은 채 `state: "ok"` 로 완전 커버리지를 주장했다.
- `measurement.recorded_at` 은 불변이 아니다. 리뷰 레코드는 PRD slug 당 1파일이라
  같은 결정의 재실행이 덮어쓰고, 그 순간 레코드가 경계를 넘어 분모가 내려갔다.
- `origin/main` 병합(머지는 선택이 아니다)만으로 경계보다 앞선 파일이 들어와 동결
  바이트가 움직였다.

이제 멤버십을 **고정 SHA 의 트리**가 정한다. 목록은 `git ls-tree -r`, 내용은
`git show <ref>:<path>` 다. 트리는 정의상 불변이므로 위 세 벡터가 한꺼번에 닫힌다 —
이 사이클이 실제로 `origin/main` 을 머지해 확인했고, 동결 블록의 바이트는 움직이지
않았다(움직인 것은 진단용 `post_baseline` 뿐이다).

**다만 ref 가 고정하는 것은 코퍼스의 *바이트*이지 그 *해석*이 아니다.** 각 레코드의
`kind` 는 `plan-review/corpus.js#parseRecord` 가 정하고 그 모듈은 살아 있다 — 다른
브랜치가 패널 서명 정규식이나 펜스 파서를 고치면 이 문서의 분모가 움직이고,
`linkage-frozen-baseline.test.js` 가 이 마일스톤의 파일을 하나도 건드리지 않은
변경에서 붉어진다. 그것은 동결이 닫지 **못하는** 드리프트 벡터이고, 여기 적어 둔다.
바이트 test 의 실패 메시지가 "경계 파티션부터 확인하라"고 말하므로, `corpus.js`
편집에서 온 red 라면 그 안내는 잘못된 방향을 가리킨다.

`--frozen-only` 가 방출하는 것:

- `baseline` — ref · 해소된 시각 · `baseline.state`
- `pre_baseline` — **경계 트리에 실재하는 코퍼스 전체**
- `unreadable_at_baseline` — 트리에 있는데 읽거나 파싱하지 못한 것

마지막 항목이 "부재 ≠ 0" 의 자리다. 이전의 `undated_at_baseline` 은 날짜가 멤버십을
정할 때만 의미가 있었고, 트리에 있으나 작업 트리에 없는 파일은 애초에 세어지지도
않아 `files: []` 로 완전 커버리지를 주장했다. 이제 트리에서 직접 읽으므로 그 상태는
존재할 수 없다.

`post_baseline` 은 `--json` 전용이고 동결 계산에 한 줄도 기여하지 않는다. 코퍼스
전역 `undated` 는 개념째 사라졌다 — 날짜가 아무것도 결정하지 않으므로 답할 질문이
없다.

**M3 이후 `post_baseline` 은 두 가지를 함께 싣는다 (지표 2 가 읽는 것은 후자다).**

- `ships` / `records` — M1 그대로의 **작업 트리** 진단(디스크에 있으나 경계 트리에
  없는 것). 의미는 바뀌지 않았다.
- `ref` · `state` · `head_ships` · `head_records` · `ship_eligibility` · `linkage` —
  **`HEAD` 트리**를 동결 파티션과 같은 판독 경로(`ls-tree` + `git show`)로 읽은
  라이브 파티션. 동결 파티션과 **결코 합산하지 않는다**.

읽기 원천이 `HEAD` 인 것이 이 축의 급소다. 작업 트리를 세면
`MCCP_PR_SKIP_LINK_EVIDENCE` 를 쓰거나 evidence commit 이 실패해도 back-patch 된
레코드가 디스크에 남아 있으므로 감사가 `bidirectional` 을 만점으로 세고, 히스토리에
증거가 0 인 채로 100% 를 보고한다 — 우회가 지표를 강등시키지 않는다. 두 카운트를
나란히 두는 이유도 같다: 값이 갈라지는 것 자체가 "커밋되지 않은 링크가 있다"는
신호다.

`state` 는 동결 쪽과 같은 사다리다 — `ok` · `degraded` · `blind`, 그리고 `HEAD`
트리를 통째로 못 읽으면 `scope_unknown: true` 이며 그때는 **`linkage` 를 방출하지
않는다**. 판독 실패가 "정상적으로 링크 0건" 과 구별되지 않으면 그 위의 어떤
acceptance 도 아무것도 반증하지 못한다.

### 아카이브는 링크를 일방향으로 끊는다 (알려진 한계)

조인 키는 receipt 가 봉인한 **경로 그대로**다. 따라서 패널 레코드를
`.claude/reviews/` 에서 `.claude/reviews/archive/` 로 옮기면 그 ship 의 링크는
소실되고 `post_baseline.linkage.dangling_record_path` 로 계수된다. receipt 는
hash 봉인이라 새 경로로 고쳐 가리킬 수 없다(CLAUDE.md §3.12 no-rehash 불변식) —
즉 아카이브는 **되돌릴 수 없는 링크 절단**이다. 가정이 아니라 이미 실재하는
관행이다: 이 저장소에 아카이브된 패널 레코드가 4건 있다.

`basename` 으로 되찾는 fallback 은 **의도적으로 넣지 않았다.** 그것은 M3 가 없앤
파일명 관례 조인을 뒷문으로 되살리는 일이고, 서로 다른 두 디렉토리의 동명 레코드를
같은 것으로 보게 만든다. 끊긴 링크를 끊겼다고 보고하는 편이, 이름이 우연히 맞는
레코드를 승인 증거로 세는 것보다 낫다.

**운영 지침**: 패널 레코드를 아카이브하면 그 ship 의 링크가 영구히 끊긴다.
`dangling_record_path` 가 0 이 아니면 그 값은 대개 결함이 아니라 아카이브 이력이며,
지표 2 를 읽을 때 그 사실을 함께 인용해야 한다. 링크율을 보존해야 하는
코퍼스라면 레코드를 옮기지 않는 것이 유일한 방법이다.

**동결 뷰의 종료 코드가 이제 blind 와 read_error 를 반영한다.** 초판은 그 둘을 전역
`state` 에만 실었는데 `--frozen-only` 는 `baseline.state` 로 종료하므로, 코퍼스를
통째로 못 본 실행이 `state: "ok"` + exit 0 + 전 필드 0 인 블록을 내보냈다. 잘못된
cwd 에서 재생성하면 그 0 들이 이 문서에 커밋되고 바이트 test 가 그 거짓을 봉인했을
것이다.

**다만 종료 코드는 상황마다 다르다.** 잘못된 cwd 는 대개 경계 SHA 자체가 해소되지
않아 **exit 3(`unresolved`)** 이고, 그때는 파티션이 아예 방출되지 않는다.
**exit 2(`blind`)** 는 ref 는 해소되는데 그 트리에 코퍼스 파일이 하나도 없는 경우다.
트리 목록 자체를 못 읽으면 `scope_unknown` 으로 **exit 1** 이고 역시 파티션을 싣지
않는다. 셋 다 성공이 아니라는 점이 요지이고, 어느 것인지는 `baseline.reason` 이 말한다.

## 이 문서가 주장하지 않는 것

- **라운드 수를 소급 복원하지 않는다.** 과거 71건에서 두 라운드 필드가 모두 상수라
  복원의 원천이 없다. 추론값을 해시 봉인된 감사 코퍼스에 넣는 것은 이 PRD가 닫으려는
  실패 자체다.
- **리뷰 품질을 판정하지 않는다.** 세는 것은 기록의 형태이지 내용의 값어치가 아니다.
- **임계값을 갖지 않는다.** "몇 %면 충분한가"는 이 문서도 도구도 답하지 않는다.
- **`undecidable`을 결함으로 읽지 않는다.** 그것은 오늘 판정 수단이 없다는 관측이다.

## 동결된 실측

아래는 `node plugins/mccp/scripts/lib/linkage-audit.js --frozen-only`의 stdout 축자
인용이다. 손으로 편집하지 마라 — [linkage-frozen-baseline.test.js](../../plugins/mccp/scripts/lib/tests/linkage-frozen-baseline.test.js)가
도구를 실제로 spawn해 이 블록과 **바이트 비교**한다.

<!-- BEGIN linkage-audit.js --frozen-only (verbatim) -->
```json
{
  "schema_version": 2,
  "baseline": {
    "ref": "647dfecba75eecd9287ee538ca5f7056c7ba71da",
    "resolved_at": "2026-09-01T10:10:57+09:00",
    "state": "ok"
  },
  "pre_baseline": {
    "ships": 75,
    "records": 55,
    "round_structure": {
      "definition": "measurement.rounds is an integer >= 1",
      "selected": 0,
      "denominator": 42,
      "coverage": {
        "measurable": 42,
        "pre_measurement": 13,
        "counts_are_lower_bound": true
      },
      "controls": [
        {
          "id": "A",
          "label": "`#### Round N` heading",
          "hits": 0,
          "denominator": 55
        },
        {
          "id": "B",
          "label": "`round N` 토큰",
          "hits": 4,
          "denominator": 55
        },
        {
          "id": "C",
          "label": "`R1`/`R2` 토큰",
          "hits": 21,
          "denominator": 55
        },
        {
          "id": "D",
          "label": "B 또는 C",
          "hits": 23,
          "denominator": 55
        },
        {
          "id": "E",
          "label": "`round`/`라운드` 단어",
          "hits": 32,
          "denominator": 55
        }
      ]
    },
    "ship_eligibility": {
      "counts": {
        "eligible": 0,
        "not_eligible": 0,
        "undecidable": 75
      },
      "by_reason": {
        "no explicit meta.plan_review_expected — and nothing else in a ship receipt decides it (plan_hash and meta.command are present on every receipt; the upstream plan receipt was never git-tracked)": 75
      }
    },
    "linkage": {
      "receipt_to_review": 0,
      "review_to_receipt": 0,
      "bidirectional": 0,
      "denominator": null,
      "scope": "review_eligible_ships",
      "coverage": {
        "eligible": 0,
        "not_eligible": 0,
        "undecidable": 75,
        "rate_computable": false,
        "note": "numerators are counted over the eligible set only; denominator is null (NOT 0) when that set is empty, so a link RATE is not computable — see ship_eligibility.by_reason for why"
      },
      "join": "explicit_field",
      "join_note": "joined on the receipt-sealed meta.review_record_path (NOT the filename convention, whose 27/75 match was M1's structural ceiling); bidirectional additionally requires the record's measurement.receipt_hash to EQUAL that receipt's receipt_hash, which is stricter than linkage-defs classifyLink (non-empty string) — a stale hash left by an earlier ship does not count"
    },
    "filename_convention": {
      "note": "label only — NOT the definition of review-eligibility (see ship_eligibility)",
      "match": 27,
      "denominator": 75
    }
  },
  "unreadable_at_baseline": {
    "ships": 0,
    "records": 0,
    "files": []
  }
}
```
<!-- END linkage-audit.js --frozen-only (verbatim) -->
