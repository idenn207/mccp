# Review-Loop Trust — 우산 PRD

> **우산 PRD**. 자체 구현 milestone을 갖지 않는다. 아래 7개 자식 PRD의 **의존 순서**와 **승계 불변식**만 소유하며, 실제 delivery는 각 자식이 한다.
> 근거: [.claude/_meta/2026-08-12-review-loop-meta-analysis.md](../_meta/2026-08-12-review-loop-meta-analysis.md)(본편) · [.claude/_meta/2026-08-12-prd-decomposition-addendum.md](../_meta/2026-08-12-prd-decomposition-addendum.md)(분해 판정)

## Problem

mccp의 리뷰 루프가 **수렴하지 않고**(문서상 3라운드, 실사용 15~20), 그 판정을 **신뢰할 수 없으며**(운영자 체감 오탐 80%), 무엇이 시간을 먹는지 **귀속조차 불가능**하다. 세 증상은 별개가 아니라 하나의 결함에서 나온다 — **리뷰 루프에 판정 원장도 severity 축도 계측도 없다.** 방치 비용: 운영자가 dual-review 자체를 불신하게 되어(운영자 진술) 게이트를 우회하기 시작하면 mccp의 핵심 가치가 붕괴한다.

## Evidence

- **계측 부재 (실측)** — `.claude/receipts/` 전수 149건: `findings[]` 총합 **3** · `resolution.rejected` 총합 **0** · duration 필드 보유 **0** · round 분포 `{1:148, 2:1}`. 기각 판정이 corpus 전체에 1건도 없어 오탐율이 **반증 불가능**하다.
- **santa-loop은 계측 대상 밖** — `GATE_IDS`에 없어 receipt 미발행. [santa-loop.md](../../plugins/mccp/commands/santa-loop.md) 199행 전부 산문, 백킹 스크립트 0. 라운드 카운터도 상태 파일도 없다.
- **patch-chasing 실측** ([#124](https://github.com/idenn207/mccp/issues/124)) — 6라운드 실행에서 라운드 4~6의 지적이 **전부 직전 라운드가 넣은 코드**를 겨눔. 원 산출물 불변식은 라운드 3에서 이미 전부 강제됐음.
- **증거 격리 실패 실측** ([#125](https://github.com/idenn207/mccp/issues/125)) — 동일모델 4인스턴스 × 12라운드가 못 찾은 plan⟷PRD 정합 위반을 Reviewer B가 1라운드에 포착. 승인은 모델 차이가 아니라 **저장소 재탐색** 때문.
- **문헌 — 오탐 수치는 타당** — 중립 조건 LLM 리뷰어 precision 29.0~42.4%, 즉 오탐 58~71% ([arXiv:2603.18740](https://arxiv.org/html/2603.18740v1)). 운영자 체감 80%는 문헌 범위 안.
- **문헌 — 그러나 처방은 반대** — 같은 논문: bug-free framing이 탐지율 **16~93%p 붕괴**(GPT-4o-mini 97.2%→3.6%), **FN 편향이 FP 편향의 4~114배**. 리뷰어를 온화하게 만드는 수정은 precision paradox로 귀결.

## Users

- **Primary**: mccp를 운영하며 게이트와 santa-loop을 매 사이클 통과해야 하는 단일 운영자(skypark207). trigger — 리뷰 루프 진입 시, 그리고 라운드가 3을 넘어갈 때.
- **Not for**: 팀 협업 다중 사용자 — 현재 개인용 plugin monorepo.

## Hypothesis

We believe **리뷰 루프에 판정 원장·severity 축·종료 조건·계측을 붙이는 것**이 **루프를 실제로 수렴시키고 그 판정의 신뢰도를 측정 가능하게 만드는 데** 유효하다 — for **mccp 단일 운영자**.
We'll know we're right when **santa 라운드별 제기/흡수/기각 건수가 원장에 남고 receipt에 봉인되어, 다음 사이클부터 오탐율과 라운드 수를 체감이 아닌 실측으로 말할 수 있을 때**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| **[primary] 판정 계측 가능성** | santa 실행 1회당 원장 행 수 ≥ 제기 finding 수, receipt에 aggregate 4필드 non-null | 원장 파일 + `mccp-santa-review` receipt 대조 |
| 기각 판정 보존율 | 현 **0건** → 제기 대비 기각이 기록되는 비율 100% | 원장 `REJECTED(reason)` 행 수 ÷ 제기 수 |
| 라운드 종료 정직성 | 캡 도달 없이 자연 종료한 실행 비율(baseline 측정) | receipt `rounds` + `exit_reason` 분포 |
| 게이트 wall-clock 귀속 | duration 필드가 present인 receipt 비율 100% | receipt 스키마 |
| 기존 불변식 회귀 | 0 | dedupe / ship-gate 회귀 test |

> 1순위를 "라운드 수 감소"가 아니라 **계측 가능성**으로 둔 이유: 고정 캡은 수렴시킨 게 아니라 잘라낸 것이라, 캡만 강제하면 목표는 정의상 달성되면서 실제 개선 여부는 여전히 알 수 없다. 계측이 먼저 서야 나머지 지표가 다음 사이클부터 실측으로 전환된다(본편 §1).

**종료 시점 실측(2026-08-27) — 1순위 지표는 기전 완비 · 관측 0건으로 닫힌다.** 계측 기전은 전부 착지했다: `mccp-santa-review`가 `plugins/mccp/scripts/receipt/schema.js:35`의 `GATE_IDS`에 등재됐고, aggregate 4필드도 같은 파일 1055-1075행에서 검증되며, `resolution.review_source === "multi-agent"` 강제까지 붙어 있다(289행). **그러나 이 저장소의 두 체크아웃 어디에도 `mccp-santa-review` receipt와 `.claude/state/santa-loop/` 원장이 없다** — 따라서 "원장 행 수 ≥ 제기 finding 수"를 대조할 표본이 0이고, 2·3순위 지표가 기대던 baseline도 아직 확정되지 않았다. 둘 다 gitignored이므로 이것이 "한 번도 안 돌았다"의 증명은 **아니다**. 이 상태는 아래 Risks 표 마지막 행("계측을 붙였는데 corpus가 안 쌓여…")이 예견한 것이고, 그 mitigation(forward-only 누적)에 따라 **다음 santa 실행이 첫 관측**이 된다. 우산이 아카이브되면 이 사실을 들고 있는 활성 문서가 사라지므로 `.claude/plans/codex-findings-backlog.md`에 HIGH로 이중 등재했다.

## Scope

**MVP** — 이 우산은 **코드를 만들지 않는다**. 자식 PRD 7개의 의존 순서와 승계 불변식을 확정해, 병렬 착수가 파일 충돌 없이 성립하도록 보장하는 것이 전부다.

**Out of scope**

- **리뷰어 프롬프트 완화** — FN 편향이 FP 편향의 4~114배. 오탐은 리뷰어 상류가 아니라 판정 하류에서 거른다(본편 메타 결론 C).
- **관점(agent) 수 증설** — N=4가 knee. 한계이득 +14.9/+13.5/+11.2%p 이후 평탄([arXiv:2511.16708](https://arxiv.org/html/2511.16708)). 다양성은 증거 경로로 낸다(메타 결론 E).
- **Codex 제거** — 항목 3의 불신은 모델이 아니라 증거 공급 방식에 대한 오귀속(메타 결론 B). cross-model의 blind-spot 가치는 존속(same-model 상관 0.4 vs cross-model 0.08).
- **work chain 재배열(운영자 항목 1.5)** — P1·P2·P3 종료 전에는 발산 루프를 파이프라인에 2회 삽입하는 것이 된다(메타 결론 F). 별도 PRD로 이연.
- **diverse-agent-review M2/M3** — 별도 트랙, 이미 진행 중.

## Delivery Milestones

<!-- 이 표의 각 행은 engineering task가 아니라 **자식 PRD**다. /mccp:plan은 각 자식 PRD를 직접 소비한다. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | **P0 santa-loop 실체화** | santa-loop 결정 로직이 산문에서 모듈로 내려와 캡이 기계적으로 강제되고, 후속 축들이 서로 다른 파일을 소유하게 됨. **자식 PRD 2 milestone 전부 complete**. main 머지 완료 — PR #139 (`ee9f8e0`, M1 v1.25.2 · M2 v1.26.0). 소유권 경계는 [ownership.md](../../docs/santa-loop/ownership.md)로 확정돼 P1·P2·P3는 지금 병렬 착수 가능 | complete | [santa-loop-materialize.prd.md](archived/santa-loop-materialize.prd.md) |
| 2 | **P1 판정 계약** (#124) | severity 축·판정 원장·종료 조건이 생겨 루프가 실제로 수렴하고 기각이 보존됨. main 머지 완료 — PR #141 (`767a2c7`, v1.26.2) · PR #143 (`614eb79`, v1.27.1) · PR #145 (`22937aa`, v1.28.0) | complete | [santa-adjudication.prd.md](archived/santa-adjudication.prd.md) |
| 3 | **P2 증거 다양성** (#125) | 리뷰어 최소 1명이 오케스트레이터 번들 대신 디스크를 직접 재유도해 오류 상관이 끊김. main 머지 완료 — PR #150 (`c1115c3`, v1.30.0 — M1~M3 일괄) | complete | [santa-evidence-diversity.prd.md](archived/santa-evidence-diversity.prd.md) |
| 4 | **P3 델타 리뷰** | 리뷰 스코프가 라운드마다 축소되어 인지 부하와 소요가 줄되, 이전 판정은 리뷰어에게 노출되지 않음. main 머지 완료 — PR #160 (`83ed37a`, v1.32.7 — M1~M3 일괄) | complete | [santa-delta-review.prd.md](archived/santa-delta-review.prd.md) |
| 5 | **H1 setup gitignore** | 신규 설치자가 mccp 런타임 산출물 무시 규칙을 재발명하지 않아도 됨. main 머지 완료 — PR #136 (`295b628`, v1.25.0) | complete | [setup-gitignore.prd.md](archived/setup-gitignore.prd.md) |
| 6 | **H2 메타 조사 커맨드** | 조사·판정 결과가 `_meta/`에 재현 가능한 절차로 누적됨. main 머지 완료 — PR #135 (`0ed9b1c`, v1.24.0) | complete | [meta-research-command.prd.md](archived/meta-research-command.prd.md) |
| 7 | **H3 세션 프로세스 회수** | 세션 종료 시 detached 자식 프로세스가 남지 않음. main 머지 완료 — PR #142 (`1384cbe`, v1.27.0 — M1+M2 출하 + M3 잔여 정리) | complete | [session-process-reclaim.prd.md](archived/session-process-reclaim.prd.md) |

### 착수 순서 (구속력 있음)

```
day 0 동시 착수 가능:  P0 · H1 · H2 · H3        (4개)
P0 종료 후 추가:       P1 · P2 · P3             (최대 6개 동시)
P1·P2·P3 전부 종료 후: work chain 재배열(항목 1.5) — 별도 PRD
```

**P0가 선행인 이유는 일정이 아니라 파일 충돌이다.** P1·P2·P3가 손대야 하는 곳이 전부 `santa-loop.md`(199행) 한 파일이고 P1·P2는 Step 3에서 정면 충돌한다. 이 repo는 오래 산 브랜치 머지가 파일 9개 2144줄을 조용히 지운 실측 사고를 보유한다(CLAUDE.md §3.5.1, PR #110). P0가 결정 로직을 모듈로 분리해야 P1·P2·P3가 **서로 다른 파일을 소유**해 진짜 병렬이 된다(부록 §3).

## 승계 불변식 — 자식 PRD가 본문에 명시적으로 실어야 하는 것

| # | 불변식 | 적용 | 근거 |
|---|---|---|---|
| I1 | **리뷰어를 온화하게 만들지 말 것.** 오탐은 판정 하류에서 거른다 | P1, P2 | 본편 메타 결론 C |
| I2 | **"pass 했다"를 리뷰어에게 말하지 말 것.** 기계적 스코프는 허용, 상태 단언은 금지 | P3 | 메타 결론 D |
| I3 | **원장은 리뷰어가 아니라 집계 단계가 읽는다.** 리뷰어 fresh, 원장 persistent | P0, P1 | #124 제안 3 + I2의 귀결 |
| I4 | **santa verdict는 `review_source='multi-agent'`.** `codex`/`hybrid` 참칭 금지 | P0, P1 | 부록 §2 |
| I5 | **관점 수를 늘리지 말 것.** 다양성은 증거 경로로 | P2 | 메타 결론 E |
| I6 | **계측이 먼저다.** 계측 없이 착지한 개선은 다시 체감으로만 평가된다 | 전체 | 본편 §1 |

## Open Questions

- [x] **우산 PRD의 대시보드 가시성** — 이 PRD는 자체 plan을 갖지 않는다. [archive-complete C1](../../CLAUDE.md)대로 PRD discovery는 *활성 plan의 `source_prd`*로만 이뤄지므로 **이 우산은 대시보드에 안 잡힌다**. 자식 7개는 각자 plan을 가지므로 정상 노출된다. **결정(2026-08-27): (a) 미노출 감수로 확정한다.** 재검토 조건이었던 "자식이 하나도 안 보이는 상황"은 도래하지 않았고, 자식 7개는 전부 complete로 종료해 각자의 이력을 남겼다. 실측 두 가지를 근거로 남긴다 — (1) 마감 plan(`review-loop-trust-closeout.plan.md`)이 물려 있는 동안에는 `scan.js`가 `plans=1`로 잡으므로 우산이 **일시적으로 노출**되고, 그 plan은 아카이브와 **같은 원자 단위**로 함께 이동한다(`apply.js` C2 — 실측: `archivable=true · reason=all 7 milestone rows complete/dropped · plans=1`). (2) 아카이브 후에도 `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js:218`이 `.claude/prds/archived/`를 **직접** 스캔하므로 완료 이력은 타임라인에 남는다 — 미노출은 *활성* 표면에 한한다.
- [x] **archive 시점** — 자식 7개가 전부 complete가 돼도 우산은 `Delivery Milestones` 행이 전부 complete여야 archivable(C3 등식). **결정(2026-08-16): 수동 동기화한다.** 우산 행의 `Plan` 셀이 plan이 아니라 자식 PRD를 가리키므로(`plan: null`) `/mccp:archive-complete`의 drift 스캐너에는 대조할 ledger/receipt 증거원이 없고, `/mccp:milestone-close`도 stamp할 plan body와 `in-progress` 행이 없어 구조적으로 적용 불가다(실측: `goal-detect` → `reason=not-started`). 따라서 자식 PRD가 complete/archived로 전이할 때 우산 행을 **사람이** 같은 사이클에 정정한다 — 이 규칙의 첫 적용이 P0·H1·H2 3행이다.
- [x] **santa 원장의 git-tracked 여부** — P0가 결정. 권장은 원장 본문 gitignored + 집계값만 receipt에 봉인(부록 §6). **결정(2026-08-27): P0 M1이 권고안 그대로 착지했다.** 원장 본문은 `.gitignore:53`의 `.claude/state/santa-loop/`로 gitignored이고(같은 파일 48행 주석이 UI9 근거를 명시), 집계는 `plugins/mccp/scripts/lib/santa/seal.js:51`이 `mccp-santa-review` receipt로 봉인한다 — `meta.santa_rounds` · `santa_entries` · `santa_cap` · `santa_blind_records` 4필드가 `plugins/mccp/scripts/receipt/schema.js:1055-1075`에서 검증된다. 즉 원장은 로컬 진단물, 감사 대조 corpus는 receipt다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| P0 지연이 P1·P2·P3 전부를 막는다 (단일 병목) | Medium | High | P0의 MVP를 "모듈 추출 + 캡 강제"로 최소화하고 rubric·출력 포맷 등 산문이 적합한 부분은 남긴다. day0 병렬 H1·H2·H3가 P0 대기 중에도 진행되어 유휴가 없다 |
| P1·P2가 P0 산출 인터페이스를 서로 다르게 가정해 통합 시 충돌 | Medium | Medium | P0가 모듈 **인터페이스**(원장 스키마·gate 입출력)를 확정해 산출하고, P1·P2 PRD가 그 인터페이스를 전제로 작성됨. 인터페이스 변경은 P0 재개 |
| 우산이 대시보드 밖이라 잊힌다 | Medium | Low | 자식 7개는 노출됨. 우산은 `_meta/` 두 문서와 상호 링크되어 있어 조사 경로로 도달 가능 |
| I1~I6이 자식 PRD에서 문장으로만 남고 test로 강제되지 않는다 | Medium | High | 각 자식 PRD의 Success Metrics에 해당 불변식의 **회귀 test 존재**를 지표로 포함. 특히 I2는 P3의 acceptance gate |
| 계측을 붙였는데 corpus가 안 쌓여 다음 사이클에도 실측 불가 | Medium | Medium | 1순위 지표를 "오탐율 X% 이하"가 아니라 **"기록되는가"**로 둔 이유가 이것. forward-only로 쌓이며 baseline은 첫 사이클 이후 확정 |

---
*Status: DRAFT — requirements only. 자체 구현 없음; 자식 7개 PRD가 delivery를 소유한다.*
*Co-created with user on 2026-08-12.*
