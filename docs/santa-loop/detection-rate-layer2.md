# santa 델타 리뷰 — Layer 2 (라이브 리뷰어 비교) 실측 기록

> **먼저 주장하지 않는 것을 적는다.**
>
> 1. **"탐지율 보존을 검증했다"고 주장하지 않는다.** 관측 결과는 그 반대다 — 델타
>    스코프에서 corpus 발견이 **1건 줄었다**. 이 문서가 인증하는 것은 "재봤다"이지
>    "안전하다"가 아니다.
> 2. **fixture는 합성 1건이고 계층당 결함 1건이다.** 계층별 수치는 비율이 아니라
>    **개수**다. 1/1을 100%로 읽으면 안 된다.
> 3. **모드당 관측 1회다.** 리뷰어는 비결정적이므로 재실행하면 값이 달라질 수 있다.
>    표본을 늘리지 않은 이유는 아래 R3에 있다.
> 4. **두 리뷰어가 같은 model family였다.** 계획된 cross-model 구성이 외부 CLI의
>    사용량 한도로 무너졌다(아래 「이탈」). 상관된 맹점은 끊기지 않았다.

- 일자: 2026-08-25
- 축: `MCCP_SANTA_DELTA_SCOPE` (`off` = full scope vs `enforce` = 델타 스코프)
- 소유: santa-delta-review PRD, Milestone 2 Task 3. M2 사이클에서는 세션 운영 제약
  (명시 요청 없는 서브에이전트 발화 금지)으로 **구조적 실행 불가**였고, 사용자가
  명시 요청한 이 세션에서 완주했다.
- 선행 기록: [.claude/notes/santa-delta-review-m2.md](../../.claude/notes/santa-delta-review-m2.md)
  (Layer 1 — 결정적 containment)
- 원시 증거: [layer2-evidence/](layer2-evidence/)

## 1. 사전 등록 (리뷰어 발화 **이전** 동결)

[layer2-evidence/PREREGISTRATION.md](layer2-evidence/PREREGISTRATION.md)가 정본이다.
동결한 것은 넷이다.

| # | 항목 | 요지 |
|---|---|---|
| R0 | 상위 규칙 | `detection-corpus.js#DECISION_RULE` 축자 인용 — 고치지 않는다 |
| R1 | 실행 구성 | 두 모드가 fixture·라운드·레인·rubric·리뷰어를 공유하고 변수는 `MCCP_SANTA_DELTA_SCOPE` 하나 |
| R2 | finding → 결함 id 대조 알고리즘 | 위치 우선(±12줄) → 텍스트 대체(토큰 술어) → 다중 매치는 최근접 1건 |
| R3 | 비결정성 처리 | 규칙을 완화하지 않고 **모드당 1회 관측**을 그대로 적용 |
| R4 | 실행 증명 | 원시 리뷰어 JSON 4건이 없으면 상수를 교체하지 않는다 |

R2가 존재하는 이유는 plan 승인 패널이 이 자리를 **미지정**으로 지적했기 때문이다
(L2 id=77fbb4db). 매칭 규칙이 산문으로만 있으면 결과를 본 뒤 규칙을 조정하는 것이
가능하고, 그 조정은 diff에서 문서 편집처럼 보인다.

## 2. 이탈 — Reviewer B가 cross-model이 아니다

계획은 Reviewer B를 `codex exec -m gpt-5.4`로 두었다. 두 모드 모두 exit 1 + stdout
0바이트로 실패했고 stderr는 축자로 이렇게 적혔다:

```
ERROR: You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage
to purchase more credits or try again at Aug 31st, 2026 11:09 PM.
```

`santa-loop.md`가 규정한 fallback(두 번째 Claude Agent, `code-reviewer`, opus)으로
전환했다. 파라미터가 명령 본문에 고정돼 있어 조정 여지가 없다.

**시점을 숨기지 않는다** — 이 이탈은 Reviewer A의 두 모드 결과를 **이미 본 뒤에**
결정됐다. 결과를 보고 고른 것이 아니라 외부 제약이 강제했고 대체 구성도 명령 본문이
소유하지만, 순서 자체는 기록 대상이다. 이탈은 **두 모드에 대칭으로** 적용됐으므로
델타 축의 비교는 교란되지 않는다.

**남는 손상은 델타 축이 아니라 증거 다양성 축의 것이다.** 두 레인이 같은 model
family라 상관된 맹점이 끊기지 않았다. context isolation(blind vs bundled)은 유지됐다.

## 3. Layer 1 재현 (같은 fixture, 같은 CLI)

M2가 기록한 값이 그대로 재현됐다 — 델타 경로 `before=3 → after=1`, 상시 스코프 병합
뒤 `off`는 5경로 · `enforce`는 3경로 + `src/parser.js:1-37` 범위.

| id | 계층 | full (`off`) | delta (`enforce`) | containment |
|---|---|---|---|---|
| D1 | `A_IN_FIX` | `path-unrestricted` | `in-range` | 유지 |
| D2 | `B_SAME_FILE_OUT_OF_RANGE` | `path-unrestricted` | `path-kept-out-of-range` | 유지 |
| D3 | `C_DROPPED_PATH` | `path-unrestricted` | `path-dropped` | **손실** |
| D4 | `D_ALWAYS_SCOPE` | `path-unrestricted` | `path-unrestricted` | 유지 |

## 4. Layer 2 — 관측

리뷰어 4회(2 모드 × 2 레인) 발화. 한 결함은 리뷰어 **A 또는 B 중 하나라도** 지목하면
그 실행에서 `found`다(R2.4 — severity 무관).

| id | 계층 | full (`off`) | delta (`enforce`) | 판정 |
|---|---|---|---|---|
| D1 | `A_IN_FIX` | **found** (A·B) | **found** (A·B) | 보존 |
| D2 | `B_SAME_FILE_OUT_OF_RANGE` | missed | missed | 양쪽 미발견 |
| D3 | `C_DROPPED_PATH` | **found** (A) | missed | **손실** |
| D4 | `D_ALWAYS_SCOPE` | **found** (A·B) | **found** (A·B) | 보존 |

**합산: `fullFindings=3` · `deltaFindings=2`.**

비-corpus finding(manifest에 없는, fixture에 우연히 존재하는 결함)은 규칙의 집계
대상이 아니며 어느 쪽에서도 차감하지 않았다. `off`에서 2건(`src/format.js`의 미정의
`PADDING`을 A·B가 각각), `enforce`에서 0건 — `src/format.js`가 델타에서 드롭된 경로라
구조적으로 그렇다. 규칙 밖이지만 D3와 같은 이야기를 한다.

### 4.1 이 표가 말하는 것

- **실제 손실은 Class C 하나다.** 델타가 경로째 드롭한 파일의 결함(D3)을 리뷰어가
  더는 찾지 못했다. Layer 1이 containment 손실을 예측한 바로 그 계층이고, Layer 2는
  그 containment 손실이 **탐지 손실로 실현됨**을 보였다. 산술이 결과로 확인된 것이지
  새 정보는 아니다.
- **Class B는 델타가 잃지 않았다 — 그러나 애초에 아무도 못 찾았다.** D2(`mergeCounts`
  타입 미강제)는 **full 스코프에서도 미발견**이다. 파일 전체를 번들로 받은 `off`의
  bundled 레인조차 지목하지 않았다. 즉 M2가 남긴 핵심 질문("범위 밖으로 리뷰어의
  주의가 실제로 가는가")은 **이 관측으로 답해지지 않았다** — 델타가 주의를 뺏은 것이
  아니라 표본이 그 질문에 도달하지 못했다. 이 결함이 다른 셋보다 미묘했다는 것이
  가장 단순한 설명이고, 그것을 확인하려면 Class B 결함을 여러 난이도로 심어야 한다.
- **Class A·D는 두 모드에서 동일하다.** A는 범위가 정확히 지목하고, D는 상시 스코프가
  되돌리므로 예측대로다.

### 4.2 매처 허용오차의 부작용 (관측 사실, 규칙 무변경)

R2.1의 ±12줄 허용오차 때문에 `src/parser.js:21`의 비-corpus 결함(미정의 `SEPARATOR`)이
D1(`:17`)에 흡수됐다. **어떤 found/missed 값도 바꾸지 않는다** — D1은 네 실행 모두에서
`takeField`를 이름으로 직접 지목한 finding이 따로 있어 독립적으로 `found`다(민감도
확인 완료). 비-corpus 집계만 과소 계상된다. 규칙은 사전 등록된 그대로 적용했고
결과를 보고 고치지 않았다.

## 5. 사전 등록 규칙의 기계적 적용

규칙 축자(`detection-corpus.js#DECISION_RULE`):

> corpus 전체(4계층 합산)에서 델타의 Layer 2 발견 수가 full 대비 단 1건이라도 적으면
> default를 뒤집지 않는다. 같거나 크면 뒤집는다.

```
decideDefaultFlip({ layer2: { fullFindings: 3, deltaFindings: 2 } })
→ { flip: false, reason: 'layer2-degraded',
    detail: "delta found 2 of the full scope's 3 — the rule refuses a flip on
             any shortfall, however small." }
```

**`MCCP_SANTA_DELTA_SCOPE`의 default는 `off`로 유지된다.** 코드 변경은 없다 —
`scope-delta.js#DELTA_SCOPE_DEFAULT`도 `registry.js`의 default도 이미 `off`이고,
규칙이 요구하는 값과 일치한다.

**바뀐 것은 값이 아니라 사유 토큰이다.** M2까지는 `layer2-absent`("재지 않았다")였고
이제 `layer2-degraded`("재봤더니 하락")다. 그 둘을 다른 토큰으로 나눠 둔 이유가
정확히 이 순간을 위해서였다 — 같은 `off`라도 근거가 다르고, 미상과 하락을 구별할 수
없으면 이 측정은 아무것도 남기지 못한다.

회귀 test `santa-detection-coverage.test.js`가 `LAYER2_EVIDENCE` 상수와 실제
`DELTA_SCOPE_DEFAULT`의 정합을 강제하므로, 이 증거를 지운 채 default를 뒤집거나
증거를 남긴 채 default만 뒤집으면 붉어진다.

## 6. 이 측정이 닫은 것과 닫지 않은 것

**닫은 것**

- PRD Open Question "Layer 2를 언제 완주하는가" — 완주했다. default를 묶던 미상이
  해소됐고, 그 자리를 실측이 대신한다.
- default `off`의 근거가 "안 재봤다"에서 "재봤더니 델타가 1건 적다"로 바뀌었다.

**닫지 않은 것**

- **Class B의 핵심 질문은 여전히 열려 있다.** D2를 full 스코프에서도 못 찾았으므로,
  "경로가 남으면 리뷰어의 주의가 범위 밖까지 가는가"는 미답이다. 답하려면 Class B에
  난이도가 다른 결함을 복수로 심어야 하고, 그것은 이 사이클의 범위가 아니다.
- **N=1 합성 fixture의 대표성.** PRD Risks가 이미 `High`로 적은 항목이며 이 관측이
  그 확률을 낮추지 않는다. P1 원장에 실측 결함이 쌓이면 재검증 대상이다.
- **cross-model 독립성.** 이번 관측은 same-family 2레인이다. 재실행 시 codex 한도가
  회복돼 있으면 그 구성으로 다시 재는 것이 더 강한 증거다.
- **델타를 켜야 하는가**는 이 문서가 답하지 않는다. 규칙은 flip을 거부했고, 규칙을
  바꾸는 것은 M2의 결론이 아니라 새 PRD다.

## 7. 재현

```bash
# 1. fixture + 두 모드 스코프 (결정적)
node docs/santa-loop/layer2-evidence/build-fixture.js <out-dir>

# 2. 리뷰어 4회 발화 — layer2-evidence/prompt-{off,enforce}-{A,B}.txt 를
#    각각 blind lane(Agent code-reviewer/opus) · bundled lane 으로 보낸다.
#    반환 JSON 을 verdict-<mode>-<id>.json 으로 저장.

# 3. 사전 등록 매처
node docs/santa-loop/layer2-evidence/matcher.js <out-dir>

# 4. Layer 1 회귀 (LLM 무관, CI 상주)
node --test plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js
```

2단계는 비결정적이다. 1·3·4단계는 결정적이며 같은 입력에 같은 출력을 낸다.
