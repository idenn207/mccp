# A2 대체 producer 조사 (multi-session-work-loop M9 Task 5)

> UI5는 "statusline을 교체하기 전에 대체 producer가 있는지 먼저 조사한다"이고, UI6은
> "산출이 불가능한 것으로 확인되면 증거와 함께 인정 조건을 개정한다"이다. 이 문서는 그
> 조사의 결과이며, 시도한 경로를 **전부 열거하고 각각 왜 불가인지 파일과 줄 번호로
> 지목한다**(plan Task 5 Validate).
>
> 전량 2026-08-27 실측.

## 결론 먼저

**A2는 이 설치 환경에서 산출할 수 없다. 다만 그 이유는 M9 plan이 적었던 것과 다르다.**

plan은 "하네스가 statusline 밖으로 노출하지 않아 산출 불가"로 예상했다. 실측은 더
구체적이고 더 나쁜 것을 보여준다 — **분자(토큰 회계)는 실재하고 접근 가능한데,
분모(컨텍스트 창 크기)가 어디에도 없다.** 그리고 저장소에 하나뿐인 창 크기 상수를
그대로 쓰면 관측된 모든 세션에서 잔여가 **음수**로 나온다.

즉 A2를 지금 산출하면 그것은 측정이 아니라 **검증되지 않은 가정을 숫자로 위장한 것**이
된다. 이 PRD가 A3의 감축 주장과 B3의 분모에서 두 번 거부한 바로 그 행위다.

## A2의 산출 경로 (설계된 것)

```
ecc-statusline.js:127   bridge.context_remaining_pct = remaining     <- 유일한 producer
        |
ecc-context-monitor.js:144 / :335 / :361                             <- 소비
        |
session-end.js:382      context_remaining_pct: contextRemainingPct   <- 세션 종료 이벤트에 stamp
        |
derive/sources/session-activity.js:169                               <- 이벤트에서 수집
        |
msw-metrics/index.js:213  computeA2 -> p50/p95                       <- 지표
```

체인의 2~4단계는 전부 배선돼 있고 M8 DD6이 귀속 가드까지 얹었다(스냅샷 `session_id`가
종료 세션과 일치하고 표본이 신선할 때만 stamp). **끊어진 곳은 1단계 하나뿐이다.**

## 조사한 후보 4개

### 후보 1 — 설계된 producer를 그대로 살린다

- **경로**: `plugins/mccp/scripts/hooks/ecc-statusline.js:127`
- **판정**: **불가 (설치되지 않음)**
- **근거**: 이 hook은 `statusLine.command`로 등록돼야 발화하는데, 사용자 전역 설정은
  `ccstatusline`을 등록하고 있다(저장소 밖 파일이라 경로를 인용하지 않는다). mccp의
  statusline은 실행되지 않으므로 `bridge.context_remaining_pct`는 영원히 미기록이다.
- **왜 고치지 않는가**: UI5가 명시적으로 "statusline을 교체하기 전에"라고 했다. 사용자
  환경의 statusline 교체는 이 계획의 권한 밖이고, 교체를 요구하는 지표는 산출 조건에
  사용자 환경 변경을 끼워 넣는 것이다.

### 후보 2 — bridge가 이미 값을 갖고 있는가

- **경로**: `plugins/mccp/scripts/hooks/ecc-metrics-bridge.js:210`
- **판정**: **불가 (초기화만 한다)**
- **근거**: 그 줄은 `context_remaining_pct: null`로 필드를 **만들 뿐** 값을 산출하지
  않는다. bridge는 전달자이지 producer가 아니다. 실측 스냅샷도
  `{"context_remaining_pct": null, "tool_count": 900, "session_id": null}`이다.

### 후보 3 — transcript 토큰 누적에서 추정한다

- **경로**: hook stdin의 `transcript_path` → assistant 항목의 `message.usage`
  (`plugins/mccp/scripts/hooks/cost-tracker.js:78-110`이 같은 소스를 비용에 이미 쓴다)
- **판정**: **불가 (분모가 없다 — 이것이 이 조사의 핵심 발견이다)**
- **근거**:
  - **분자는 실재한다.** 마지막 assistant 항목의
    `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`가 그 요청의
    프롬프트 크기이고, 이것은 API가 청구한 실제 값이지 추정이 아니다.
  - **분모는 어디에도 없다.** `context_remaining_pct`를 내려면 창 크기로 나눠야 하는데,
    transcript는 창 크기를 싣지 않고 hook payload도 싣지 않는다(후보 4).
  - **있는 상수를 쓰면 값이 불가능해진다.** 저장소의 유일한 창 크기 선언은
    `plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js:136`의
    `denominator_tokens: 200000, // Claude model context window (documented value)`인데,
    최근 세션 5건의 프롬프트 크기는 전부 그것을 넘는다:

    | transcript | model | 마지막 프롬프트 | 200k 기준 잔여 |
    |---|---|---|---|
    | `50f7c4a0` | `claude-opus-5` | 589,673 | **-194.8%** |
    | `245ccc24` | `claude-opus-5` | 454,976 | **-127.5%** |
    | `c9ed6dfa` | `claude-opus-5` | 423,136 | **-111.6%** |
    | `6f8e2be4` | `claude-opus-5` | 370,069 | **-85.0%** |
    | `ac0f42d6` | `claude-opus-5` | 241,983 | **-21.0%** |

  - 음수 잔여는 산술 오류가 아니라 **가정이 틀렸다는 증거**다. 실제 창은 200k보다 크지만
    그 값을 이 저장소도 하네스도 말해 주지 않는다. 모델별 창 크기 표를 손으로 넣는 것은
    지표의 정확도를 **모델 목록의 최신성**에 결속시키는 것이고, 그 목록이 낡으면 A2는
    조용히 틀린 값을 내기 시작한다 — 미산출보다 나쁘다.

> **부수 발견 (M9 범위 밖, 별도 축)**: 같은 상수가 A3의 분모로도 쓰인다
> (`a3-instruction-cost.js:598` `DENOMINATOR_TOKENS: 200000`). 위 표가 그 값도
> 이 모델에서는 정확하지 않음을 시사한다. A3의 분모는 문서화된 별도 축이고 M9의
> `## Files to Change`에 없으므로 여기서 바꾸지 않고 관측만 기록한다.

### 후보 4 — 하네스가 다른 hook payload 필드로 노출하는가

- **경로**: 전 hook의 stdin payload 필드 전수
- **판정**: **불가 (그런 필드가 없다)**
- **근거**: `plugins/mccp/scripts/hooks/*.js`가 실제로 읽는 payload 필드는
  `cwd` · `error` · `last_assistant_message` · `mcp_server` · `mcp_tool` · `message` ·
  `session_id` · `tool_input` · `tool_name` · `tool_output` · `tool_response` ·
  `transcript_path`뿐이다. `context`/`window`/`remaining`/`token`을 이름에 포함하는
  필드는 **0건**이다.

## 인정 조건 개정문 (UI6)

M8의 A2 조항을 다음으로 개정한다. **"A2를 달성했다"고 주장하지 않으며, plan이 예상한
"노출하지 않아 불가"보다 정확한 사유를 적는다.**

> A2(세션 종료 컨텍스트 잔여)는 이 설치 환경에서 산출하지 않는다. 소비 체인
> (`session-end.js:382` → `session-activity.js:169` → `computeA2`)은 M8 DD6의 귀속
> 가드까지 배선을 마쳤고 끊긴 곳은 producer 한 지점(`ecc-statusline.js:127`)뿐인데,
> 그 hook은 사용자 전역 `statusLine.command`가 다른 도구를 가리켜 발화하지 않는다.
> 대체 경로 3종을 조사한 결과 **분자(토큰 회계)는 transcript로 접근 가능하나 분모(창
> 크기)를 하네스도 저장소도 노출하지 않으며**, 저장소의 유일한 창 크기 상수(200,000)를
> 적용하면 관측된 전 세션에서 잔여가 음수가 된다. 따라서 지금 산출하면 그 값은 측정이
> 아니라 검증되지 않은 가정이다. A2는 `forward-only`로 남기고, 해제 조건은 다음 둘 중
> 하나다: (a) mccp statusline이 등록된 환경에서 세션이 종료되어 표본이 쌓이거나,
> (b) 하네스가 컨텍스트 창 크기 또는 잔여를 hook payload로 노출한다.

## 이 문서가 주장하지 않는 것

- **A2가 영원히 불가능하다고 말하지 않는다.** 해제 조건 두 개를 명시했고, 둘 다
  이 저장소 밖의 변화다.
- **statusline 교체를 권하지 않는다.** UI5가 그 순서를 정했고, 조사 결과는 교체가
  *유일한* 경로임을 보여주지만 그 결정은 사용자 몫이다.
- **transcript 경로가 쓸모없다고 말하지 않는다.** 분모만 확보되면 그 경로는
  `session_id`가 파일명에 있어 현재 스냅샷 매칭 가드보다 **귀속이 강하다**.
  불가 판정은 분모 하나에 걸려 있다.
