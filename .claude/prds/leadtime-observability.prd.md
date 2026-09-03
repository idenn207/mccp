# leadtime-observability — 리드타임 값이 셋인데 서로 10배 다르다

> 우산 [harness-wiring-integrity](harness-wiring-integrity.prd.md)의 자식 C4. 우산과 독립적으로 ship·아카이브된다.
> 이 PRD의 Problem · Users · Hypothesis는 우산에서 상속된다(2026-09-01 co-created).
> Scope의 결정 3건과 milestone 분해는 **운영자 미확인** — 위임받아 작성했고 언제든 뒤집을 수 있다.

## Problem

게이트가 얼마나 걸리는지에 대해 이 저장소는 **서로 10배 다른 값 세 개**를 갖고 있고, 어느 것도 검증된 적이 없다. 패널 구간은 중앙값 7.6분이고, 패널 종료부터 ship까지는 중앙값 0.3일이며, git 근사는 4~18일이다. 앞의 둘을 더해도 하루가 안 되는데 근사는 4일 이상이다. 그 격차가 실재하는 대기인지 표본 편향인지 **오늘 데이터로는 갈리지 않는다**.

그래서 deadline을 제약으로 걸 수 없다. 임계를 정하려면 분포가 필요한데, 분포를 내는 줄이 없다 — 데이터는 이미 디스크에 있다. 우산이 지목한 실패 모드("기계는 만들어지고 그것을 부르는 한 줄이 빠진다")가 한 층 위에서 반복된 형태다: **기록은 남고 있고, 읽는 줄이 없다.**

## Evidence

전부 2026-09-01 이 worktree(`bacd96a`)에서 직접 실측했다. 재현 명령을 각 항에 적었다.

- **비수렴 벽시계는 "없다"가 아니라 "집계되지 않는다".** `record.js:308`은 verdict와 무관하게 모든 패널 레코드에 `wall_clock_ms`를 쓰고, 측정 가능 레코드 **37건 전부가 non-null**이다(null 0건). 분포는 min 44초 · 중앙값 7.6분 · p90 12.6분 · **max 7.1시간**. 그런데 `corpus.js`는 이 값을 `pass_path`(converged 5건) 아래에서만 보고한다 — 집계 커버리지 **5/37 = 13.5%**. 우산 본문의 "비수렴 33건은 측정 자체가 없다"는 틀렸고, 우산이 인용한 [baseline 문서](../_meta/data/2026-08-31-baseline-measurements.md) §7의 "37건 · 합계 12.14시간 · 중앙값 8.0분"과도 모순된다. 본 PRD와 함께 우산을 정정한다.
  - `node plugins/mccp/scripts/lib/plan-review/corpus.js --json` · `grep -h wall_clock_ms .claude/reviews/*.md`
- **근거 조사의 처방은 존재하지 않는 필드를 전제했다.** "`recorded_at` / `responded_at`에서 역산"의 `responded_at`은 런타임 코드에 **0회** 등장한다. 역산 자체가 불필요하다 — 값이 이미 쓰이고 있다.
- **끝 앵커가 둘 있고, 둘 다 커버리지가 1/3이다.** `.claude/state/completion-ledger/` 44건이 `completed_at` + `commit_sha` + `plan_basename`을, `.claude/receipts/mccp-pr-codex/` 71건이 `meta.created_at` + `plan_hash`를 갖는다(둘 다 결측 0). 패널 레코드와 join하면 basename 축 **11/37(30%)**, hash 축 **12/35(34%)**. 미짝 26건은 특정 시기에 몰려 있지 않다(2026-08-09 ~ 08-26 전 구간에 분포) — 즉 "옛날 데이터라 없다"가 아니다.
- **그 join이 내는 값이 근사와 10배 다르다.** 패널 종료 → ship: basename 축 p50 0.38일 · p90 0.70일 · max 1.74일. hash 축 p50 0.28일 · p90 1.14일 · **max 5.92일**. 음수(ship이 패널보다 먼저) 0건. 반면 git 근사는 4~18일이고 운영자 체감은 "하루~1주"다.
- **`/mccp:work` 진입 시각은 어디에도 없다.** 그 배선은 C2 소유이고 과거 데이터는 0이다. 따라서 오늘 산출 가능한 것은 e2e가 아니라 **패널 종료 이후 구간**이다.
- **`msw-metrics/e2e-leadtime.js`는 존재하지 않는다.** 근거 조사가 제안한 경로일 뿐이다.
- **[M1 확인, 2026-09-01] 위 커버리지 수치는 M1 실행으로 재현됐고, 코퍼스는 자기 자신을 늘린다.** `node plugins/mccp/scripts/lib/leadtime.js --json`이 패널 레코드 **52건 중 측정 가능 39건**(`wall_clock_ms` 결측 0건)을 낸다 — 위 항의 37/50과 다른 이유는 이 PRD의 게이트 실행 2건이 그 사이에 새 레코드가 됐기 때문이고, 비율(약 3/4)과 판정은 동일하다. 전체 39건 p50 7.6분 · max 427.4분(7.12시간) 대 `pass_path`가 보던 converged 5건 p50 6.4분 · max 13.0분 — 집계 커버리지 5/39가 max를 33배 과소보고하고 있었다. 축자 동결: [docs/leadtime-observability/panel-span.md](../../docs/leadtime-observability/panel-span.md). **따라서 이 축의 검증에 리터럴 카운트를 쓰면 안 된다**(관계 단언만 유효).

## Users

- **Primary**: 운영자 본인. 마일스톤마다 "이게 오래 걸렸나"를 감으로만 판단하고, 무엇을 자를지 정할 숫자가 없다.
- **Not for**: 이 지표를 남에게 보고할 용도. 커버리지가 1/3인 값은 대외 지표가 아니다.

## Hypothesis

We believe **이미 기록되고 있는 벽시계와 ship 앵커를 읽어 분포로 만드는 것**이 **"리드타임 값이 셋인데 서로 10배 다르고 어느 것도 검증되지 않은"** 상태를 **운영자**에게 해소할 것이다.

We'll know we're right when **분포가 커버리지와 함께 한 화면에 뜨고, C7이 임계를 정할 때 인용할 수 있는 숫자가 생기며, 10배 격차가 '패널 밖 구간'인지 '표본 편향'인지 판정된다**.

## Success Metrics

목표치는 우산의 축 B 규칙을 따른다 — 오늘 값이 없는 축에 숫자를 지어내지 않고, 축 A(산출 개시) 달성 후 baseline으로 확정한다.

| # | 지표 | 오늘 | 축 A 기준 | 측정 | 읽는 주체 → 바꾸는 행동 |
|---|---|---|---|---|---|
| 1 | 패널 벽시계 집계 커버리지 | **5/37 (13.5%)** | **37/37** | 신규 도구 JSON | 운영자 → 미달이면 파서 결손이지 데이터 부재가 아니다 |
| 2 | 패널 종료→ship 구간 p50/p90/max | **미산출** | 실값 + 커버리지 동시 표기 | 두 앵커 각각 | 운영자 → C7 임계 산정의 유일한 입력 |
| 3 | join 커버리지와 미짝 사유 분해 | 30% / 34%, **사유 미분해** | 미짝 100%가 사유별로 분류된다 | 신규 도구 | 운영자 → 미짝이 '앵커 부재'면 그것이 다음 배선 축이다 |
| 4 | 두 끝 앵커 간 불일치 | **미측정** | 산출된다 | ledger vs receipt 차이 | 운영자 → 불일치가 크면 한쪽 기록이 거짓이다 |

**커버리지 없는 값은 출력하지 않는다.** 1/3 표본의 p50을 커버리지 없이 내는 것은 이 저장소가 반복해 지불한 "근거 없는 숫자"와 같은 오류다.

## Scope

**MVP** — M1(벽시계 전건 집계) + M2(구간 join과 미짝 분해). M3(소비 회로)까지 착지해야 완료다 — M1·M2만 남기면 우산이 지목한 "producer는 있는데 caller가 없다"를 그대로 재현한다.

### 이 PRD가 못박는 결정 3건 (운영자 미확인)

| # | 결정 | 왜 |
|---|---|---|
| 1 | **끝 앵커를 하나 고르지 않는다. ship receipt(`plan_hash` 결속)와 completion-ledger(basename)를 **둘 다** 산출하고 불일치를 표면화한다** | 오늘 커버리지가 34% 대 30%로 사실상 동률이라 어느 쪽이 옳은지 근거가 없다. 하나를 고르면 그 선택이 영원히 검증되지 않는다. 불일치 자체가 지표 4다 |
| 2 | **이름이 재는 구간을 말한다 — `e2e_leadtime`이 아니라 `post_panel_span`이다** | 이 값을 e2e라 부르는 순간 4~18일과 0.3일 중 어느 것이 e2e인지 영원히 흐려진다. `/mccp:work` 진입 앵커는 C2가 착지하면 같은 도구가 **세 번째 계열로** 집되, C4는 그것을 생산하지 않는다(우산의 "C4 선행조건 없음" 유지) |
| 3 | **`corpus.js`의 출력 계약을 바꾸지 않는다** | 그 출력은 `docs/diverse-agent-review/quorum-calibration.md`에 축자 동결돼 있고 소유 PRD가 다르다. 출력을 바꾸면 남의 문서가 거짓이 된다. C4는 `corpus.js`·`evidence-audit.js` 선례대로 read-only·LLM-free standalone 도구를 새로 두고 **게이트 배선 diff를 공집합으로** 유지한다 |

### Out of scope

- **임계값과 자동 분기** — C7 소유. C4는 C7이 인용할 분포를 낼 뿐 숫자를 정하지 않는다.
- **halt 대기 구간 계측** — C9 M1 소유. 리드타임의 실제 구성요소일 가능성이 높지만 소유가 다르다.
- **`/mccp:work` 진입 이벤트 생산** — C2 소유. C4는 소비만 한다.
- **없는 기록의 소급 생성** — 미짝 26건을 메우려고 과거 시각을 추정하지 않는다. 커버리지가 낮다는 사실이 산출물이다.
- **토큰·USD 비용** · **리뷰 품질이나 라운드 정책 변경**.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | wall-clock-aggregate | 측정 가능 레코드 전건의 벽시계 분포가 산출된다(이전 소비처는 converged 5건만 보고했다). 코퍼스 커버리지가 하한으로 명시된다. `corpus.js` 출력은 한 바이트도 바뀌지 않는다 | complete | `.claude/plans/leadtime-observability-m1.plan.md` |
| 2 | span-join | 패널 종료 → ship 구간이 두 끝 앵커로 각각 산출되고, 미짝 레코드 전건이 사유별로 분류된다(미ship / 앵커 부재 / 키 불일치). 두 앵커의 불일치가 함께 나온다 | complete | `.claude/plans/leadtime-observability-m2.plan.md` |
| 3 | one-line-consumption | `STATUS.md` 상단 한 줄에 값과 커버리지가 **함께** 뜬다. 값이 없으면 없다고 적고 0으로 적지 않는다. C7이 인용할 분포가 파일로 남는다 | pending | — |

## Open Questions

- [x] **`pre_measurement` 13건을 분모에서 뺄 것인가, 하한으로 계속 표시할 것인가.** → **하한 표시로 결정**(M1 DD5). `corpus.js`와 같은 규약을 따른다. 분모에서 빼면 커버리지가 영원히 100%로 보여 코퍼스의 시간 경계가 출력에서 사라진다. `leadtime.js`는 `counts_are_lower_bound`를 매 출력에 싣고 `renderHuman`이 값보다 먼저 커버리지를 낸다.
- [x] **미짝 26건의 분해 결과에 따라 C4가 아닌 축이 열릴 수 있다.** → **열린다**(M2 실측, 2026-09-02 · [post-panel-span.md](../../docs/leadtime-observability/post-panel-span.md)). `ledger_basename` 미짝 38건 중 `anchor_absent` **29건**이 'ship됐는데 이 축의 앵커가 없다'이고, 그중 **10건**은 반대축 ship receipt가 직접, **19건**은 아카이브된 plan이 증언한다(§3.11 C2대로 archived ⇒ shipped). 집계 문제가 아니라 **기록 배선 문제**가 맞고 C1 사거리다. 남은 **8건**은 `unclassified`, **1건**은 `not_shipped` — 증인 어느 것도 ship을 증언하지 못한 상태다. **초판 측정(2026-09-02 오전)에서는 이 둘이 12 대 17로 반대였고**, base 병합이 아카이브 plan을 늘리자 8 대 29로 뒤집혔다 — 즉 `unclassified`의 상당 부분은 영구적 미지가 아니라 아직 아카이브되지 않은 PRD의 그림자이고, 배선 축을 여는 근거는 그 버킷이 아니라 `anchor_absent` 29건이다. `not_shipped`는 **1건**이다(초판 측정에서는 0건이었고, base 재병합으로 실코퍼스 사례를 얻었다 — 근거는 문서 결론 2).
- [ ] **10배 격차가 표본 편향인지 패널 밖 구간인지.** 갈리지 않으면 지표 2는 "무엇의 리드타임인지"를 말하지 못한다. M2의 미짝 분해가 1차 증거다. → **부분 진전**: 패널 밖 구간이 실제로 측정됐다(`post_panel_span` p50 0.28~0.38일). 그러나 커버리지가 11~16/49라 이 값으로 격차를 설명하는 것은 **생존 편향에 노출**된다 — 조인된 것은 ship까지 간 것들뿐이다. 나머지 축(`/mccp:work` 진입 → 패널)이 C2에 남아 있으므로 이 질문은 **열어 둔다**.
- [x] **completion-ledger가 2026-08-21에서 멈췄다.** → **쓰기가 멈춘 것이다**(M2 실측, 2026-09-02). `anchor_absent` 29건 중 10건이 '자격 있는 ship receipt는 있는데 ledger 엔트리가 없다'이고, ledger 마지막 엔트리(08-21) 이후 발행된 자격 receipt가 실재한다. 그 판정은 **receipt 존재가 아니라 `pr-ship-gate.js#deriveShipDecision`이 자격을 인정한 것만** 센 결과다(무증거 skip 6건 배제 · audited override 11건 포함). 지표 4의 한쪽 축이 죽어 있는 것이 맞고, **복구는 C1 사거리**다 — M2는 고치지 않고 표면화했다.
- [ ] **지표 4('두 앵커의 불일치')는 시각 축에서 구조적으로 0이다.** (M2가 새로 연 질문) 양쪽 매치 6건의 `anchor_delta_ms`가 전건 정확히 0이다 — ledger의 `completed_at`이 ship receipt의 `meta.created_at`을 그대로 복사하기 때문이다. 두 앵커는 독립된 증인이 아니라 **한 사건의 두 기록**이므로, 살아있는 신호는 시각 불일치가 아니라 **커버리지 차이**(`ledger`만 5 · `ship`만 10)다. 지표 4의 정의를 커버리지 축으로 옮길지, 아니면 C2가 세 번째 **독립** 앵커를 만들 때까지 보류할지 미판정.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 커버리지 1/3 표본의 생존 편향 — 짧게 끝난 것만 남아 리드타임을 과소보고한다 | **높음** | **높음** | 값과 커버리지를 항상 같이 낸다. 커버리지 없는 값 출력을 금지(지표 표 각주) |
| 또 producer만 만들고 소비 회로가 없어 지표가 `null`로 남는다 (우산이 base rate로 지목) | **높음** | 높음 | M3을 완료 조건에 포함. M1·M2만 착지하면 이 PRD는 미완이다 |
| `corpus.js` 출력을 건드려 M8 문서의 동결 블록이 거짓이 된다 | 중 | 중 | 결정 3으로 출력 무변경을 못박고, 그 사실을 test로 고정 |
| 지표 이름이 'e2e'라 4~18일과 혼동되어 C7이 잘못된 임계를 잡는다 | 중 | 중 | 결정 2 (이름이 재는 구간을 말한다) |
| C2 착지로 세 번째 앵커가 생기면 과거 값과 비교 불가해진다 | 중 | 낮음 | 앵커별 별도 계열로 저장하고 합치지 않는다 |

## References

- 우산 PRD: [harness-wiring-integrity.prd.md](harness-wiring-integrity.prd.md) (C4 행 · 지표 2 · 2차 지표 표)
- 근거 조사: [2026-08-31-final-harness-assessment-and-umbrella-prd.md](../_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md) §3 · §5
- 기준선: [2026-08-31-baseline-measurements.md](../_meta/data/2026-08-31-baseline-measurements.md) §7 · §9
- 코드 근거: `plugins/mccp/scripts/lib/plan-review/record.js:308` (벽시계 write) · `.../corpus.js` (pass_path 한정 보고) · `.claude/state/completion-ledger/` · `.claude/receipts/mccp-pr-codex/`

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-09-01 (우산 상속분). 설계 결정 3건은 위임 작성 — 운영자 미확인.*
