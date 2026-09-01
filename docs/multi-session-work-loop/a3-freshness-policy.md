# A3 신선도 정책 (multi-session-work-loop M9 Task 1b·1d)

> A3(상시 지시문 점유율)는 **한 번 일어난 감축 사건의 측정**이지 상시 게이지가 아니다.
> 이 문서는 그 측정이 시간이 지나며 무엇을 계속 주장할 수 있고 무엇을 주장할 수 없는지를
> 고정한다. 산출 코드는 [`a3-instruction-cost.js`](../../plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js),
> 신선도 판정은 [`derive/sources/instruction-cost.js`](../../plugins/mccp/scripts/derive/sources/instruction-cost.js)가
> 소유한다.

## 1. tiktoken은 전제조건이고, 이 저장소는 그것을 강제하지 않는다

A3의 분자는 python `tiktoken`(`o200k_base`)으로 센다. 이 저장소는 그 설치를 **요구하지 않는다** —
사용자 환경을 바꾸는 일이고, 게이트 통과 조건도 아니다.

부재 시의 정직한 결과는 **미산출**이다. M9 Task 1a 이전에는 그것이 미산출이 아니라 **크래시**였다:

```
Error: write EOF
    at WriteWrap.onWriteComplete (node:internal/stream_base_commons:87:19)
```

원인은 stdin의 broken pipe가 **비동기 `'error'` 이벤트**로 오는데 `proc.stdin`에 리스너가 없어
Node가 unhandled로 처리한 것이다. `write()`를 감싼 try/catch는 **동기 throw만** 잡으므로 이 경로를
원리상 못 잡는다. 리스너를 등록한 뒤로는 이렇게 끝난다:

```
[A3 MEASUREMENT] Not delivered: tiktoken unavailable: tiktoken subprocess failed: tiktoken import failed: No module named 'tiktoken'
```

`status`는 두 값으로 갈린다. 둘을 하나로 뭉치면 서로 다른 두 고장이 같은 이름을 갖게 된다.

| 상황 | status | 뜻 |
|---|---|---|
| 인터프리터 자체가 없음 | `baseline-unavailable` | 측정 수단에 도달하지 못했다 |
| 인터프리터는 있으나 tiktoken import 실패 | `error` | 측정 경로가 고장났다 |
| CLAUDE.md 부재 등 입력 결손 | `baseline-unavailable` | 분자 성분이 없다 |

설치하려면 `pip install tiktoken`. 설치하지 않아도 다른 지표와 게이트는 영향받지 않는다.

## 2. 신선도 범위는 `claude_md` 하나다 — 넓힐 수 없다

분자는 세 성분(CLAUDE.md · MEMORY.md 색인 · 주입된 STATE.md 블록)인데, 신선도를 **검증할 수 있는**
것은 첫 번째뿐이다.

- user-level `MEMORY.md`는 의도적으로 커밋되지 않는다(S5). 저장소 안에 대조할 원본이 없다.
- 주입 STATE.md 블록은 세션마다 달라진다. 세션 밖에서 재현할 기준값이 없다.

그래서 산출물은 `freshness_scope: "claude_md"`를 **값과 함께** 싣는다. 이 필드는 장식이 아니라
*이 숫자가 무엇에 대해 신선한지*의 한정이다. 범위를 넓히려면 두 성분을 재현 가능하게 만들어야
하는데 그것은 각각 별도 축이고, **넓히는 선택지는 이 정책에 없다**.

## 3. 정책: 주장을 좁힌다 — 재측정으로 주장을 유지하지 않는다

CLAUDE.md는 사이클마다 자란다. 봉인된 `after`는 2026-08-09에 87,583B 기준으로 측정됐고 현재는
119,295B다. 따라서 `stale: true`가 뜨는 것은 고장이 아니라 **설계대로의 관측**이다.

여기서 매 사이클 `--emit-after`로 재측정해 `stale`을 지우고 싶은 유혹이 생기는데, 그것은
**주장을 유지하는 것이 아니라 바꾸는 것**이다.

- `before`는 `7fe48d9`에 봉인돼 있고 emitter가 재봉인을 거부한다.
- 오늘 다시 잰 `after`는 M4가 감축한 그 파일이 아니라 **그 뒤로 자란 다른 파일**이다.
- 그 둘의 비율은 "M4의 감축이 얼마였나"가 아니라 "2026-08-09 대비 지금 얼마나 줄었나(또는
  늘었나)"다. 유용한 수치지만 **다른 명제**다.

그래서 정책은 이렇다.

1. **감축 주장은 봉인된 쌍에 한정된다.** `reduction.total_ratio` 등은 *그 측정 쌍이 기록한
   시점 사이의* 감축이며, 그 이후의 변화에 대해 아무것도 말하지 않는다. 대시보드·PRD·회고에서
   이 수치를 인용할 때는 `measured_at`을 함께 인용한다.
2. **그 이후의 증가는 재성장(regrowth)이고, 감축 비율에 접어 넣지 않는다.** 재측정이 필요하면
   `--emit-after`로 갱신하되, 갱신된 값은 "감축"이 아니라 "봉인 시점 대비 현재"로 읽는다.
3. **`stale: true`는 지워야 할 경고가 아니라 사실이다.** 지우는 유일한 정당한 방법은 재측정이고,
   재측정은 위 2번대로 의미가 바뀐다. 의미를 바꾸지 않으려면 stale을 그대로 둔다.
4. **범위를 넓히지 않는다.** `freshness_scope`를 `claude_md` 밖으로 확장하는 변경은 두 성분의
   재현성을 먼저 해결해야 하며, 그 전까지는 이 정책 위반이다.

### 재측정 런북

```bash
# 전제: python + tiktoken 사용 가능 (없으면 status=error 로 정직하게 미산출)
node plugins/mccp/scripts/lib/msw-metrics/cli.js a3 --print          # 먼저 산출 가능한지 확인
node plugins/mccp/scripts/lib/msw-metrics/cli.js a3 --emit-after docs/multi-session-work-loop/a3-baseline.json
```

`--emit-after`는 `after`와 `reduction`만 갱신한다. `before`는 재봉인되지 않는다 — 그 비대칭이
감축 주장을 반증 가능하게 유지하는 장치이고, 제거 대상이 아니다.

## 4. 이 정책이 주장하지 않는 것

- **A3가 지시문 준수율을 측정한다고 말하지 않는다.** A3는 점유 *비용*이고, 감축 후 준수가
  유지되는지는 B1·C1의 축이며 M4 시점에 producer가 없어 측정되지 않았다(PRD `## 순서의 근거`).
- **재성장이 나쁘다고 말하지 않는다.** 자란 양을 감축 비율 안에 숨기지 말라고만 한다.
- **tiktoken 설치를 요구하지 않는다.** 부재는 미산출이고, 미산출은 거짓 산출보다 낫다.
