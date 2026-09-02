# harness-wiring-integrity — 배선되지 않은 기계를 닫는다

> **우산 PRD.** 자식 11개(C0~C10)의 색인이며, 자식은 각자 독립적으로 PRD·plan·ship·아카이브된다.
> 이 문서의 `## Delivery Milestones` 표는 자식의 상태를 **미러링만** 한다 — 우산이 자식을
> 인질로 잡지 않는다(선례: `review-loop-trust`가 자식 7개 ship 후에야 아카이브됨).
>
> 근거 조사: [2026-08-31-final-harness-assessment-and-umbrella-prd.md](../_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md)
> 기준선 실측: [2026-08-31-baseline-measurements.md](../_meta/data/2026-08-31-baseline-measurements.md)

## Problem

이 저장소는 게이트 기계를 만드는 데는 능하고, **그 기계를 부르는 한 줄을 빠뜨리며, 그 부재를 볼 수 있는 test가 없다.** 세 증상이 같은 뿌리를 갖는다 — 지표 producer가 구현됐는데 caller가 0회이고, 감사 corpus의 `rounds` 필드에 게이트가 값을 넣을 **통로 자체가 없어** 전건이 리터럴 `1`로 봉인되며(C1 실측 — 최상위 `round`도 71/71이 `1`이라 소급 복원의 원천이 없다), merge-apply escape가 파일명 한 글자 차이로 조용히 미실행된다. 성공 방향 기본값(`converged: true, rounds: 1`)이 배선 단절을 **무증상**으로 만들고, CI가 346개 test 중 3개(0.87%)만 실행해 그 무증상을 확정한다.

대가는 셋이다. (a) 리드타임이 관측되지 않아 deadline을 제약으로 걸 수 없다 — 통과한 패널 5건만 벽시계가 있고 비수렴 33건은 측정 자체가 없다. (b) 자기 지표 10개 중 4개만 산출된다. (c) main = production이라 이 모든 수정이 매번 실사용자에게 나간다 — 주당 2~3 마일스톤이 곧 주당 2~3 릴리스이고, 태그가 `v1.0.0` 하나뿐이라 롤백 경로가 없다.

## Evidence

전부 2026-08-31 세션의 저장소 직접 실측이며, 6렌즈 병렬 조사 + 적대적 검증 + Codex(`gpt-5.6-sol`, read-only) 교차검증을 거쳤다. Codex는 `verdict: divergent`(이견 5 · 지지 3 · 신규 5)를 냈고, 이견 5건은 전부 수용되어 아래 근거에서 제외되거나 문언이 정정됐다. 원자료는 [workflow-raw-results.json](../_meta/data/workflow-raw-results.json).

- **배선 누락이 코드로 확정됐다.** `work-orchestrator.js`가 `record-step`을 구현하고 `autoChain.recordStep`에 위임하는데, `commands/work.md`에 `record-step`이 **0회** 등장한다. orchestrator CLI를 부르는 줄은 하나뿐이고 그것도 실행 블록이 아니라 산문이다. v1.33.0이 *"측정 부채 상환 (A1/A2/B3 producer 배선)"* 이라는 제목으로 ship된 **이후**의 관측이다. Codex가 독립적으로 같은 결함을 발견했다.
- **감사 corpus 실측** — ship receipt 72건에서 `resolution.rounds === 1`이 71건(98.6%)이다. override 사유문이 "round 6"과 4연속 라운드를 증언하는 receipt가 `rounds:1`로 봉인돼 있다. `resolution.findings` 키는 **존재하지 않는다** — 선행 조사와 본 세션 초기 판정과 Codex가 각각 다른 방식으로 이 필드를 오인했고, 실측이 셋을 모두 정정했다.
- **얇은 ship receipt는 결함이 아니라 심의된 설계다.** `.gitignore`가 의도를 명시하고(2026-07-22, 미검토 부트스트랩 기본값 대체), 리뷰 내용은 `.claude/reviews/`에 **git-tracked 73파일 / 6,760줄**로 durable하게 있다. 따라서 남는 진짜 결함은 "내용 복원"이 아니라 **두 층의 연결 부재**다 — receipt에 리뷰 경로도, 리뷰 원문에 receipt 해시도 없고, 내용층의 라운드 구조 커버리지가 45.2%(33/73)다.
- **리뷰 경제에 수렴 장치가 없다.** `plan-review/corpus.js` 실행 결과 quorum M binding **0건** · K binding **0건** · findings binding 31건이다. 실제 승인 규칙은 severity 하나이고 정족수 손잡이는 판정을 바꾼 적이 없다. 차단 32건 중 **16건(50%)** 이 단일통과 우회로 통과했다. 벽시계는 통과 5건(357~779초, 평균 8분)만 산출되고 비수렴 33건은 미산출 — 운영자가 겪는 "하루~1주"는 정확히 그 미관측 구간에 있다.
- **CI 강제 커버리지 0.87%** (3 / 346). test는 있고 green이다 — 전수 실행 결과 **346/346 완주, 345 PASS / 1 FAIL**(`derive/tests/mccp-fixture.test.js`). 저장소는 red가 아니라 **아무도 안 돌린다**가 정확하다.
- **그 전수 실행의 타이밍은 신뢰 불가로 자체 판정됐다** — 6개 워크플로 서브에이전트와 경합한 상태에서 측정됐고, 조용한 머신 재측정에서 11배 차이가 났다. 데이터가 스스로 *"UNRELIABLE — do not use these durations to size CI"* 라 적었다. 통과/실패는 유효하다(경합은 exit code를 바꾸지 않는다).
- **배포 표면은 46%다** — marketplace manifest의 `source`가 `./plugins/mccp`이므로 그 하위 876파일만 배포되고 `.github/` · `.claude/` · `docs/` · `CLAUDE.md` 1,017파일은 사용자에게 가지 않는다. 그리고 marketplace 스키마는 ref 고정을 지원한다 — 공식 marketplace 291개 항목 중 84개가 `{path, ref, sha, source, url}` 형태이고 태그 고정 릴리스가 실재한다. **"main = production"은 제약이 아니라 현재의 설정값이다.**
- **backlog 흡수율 6.9%** (32 / 465). 탐지 비용은 매번 지불되고 수리 전환은 거의 0이며, 상태 열이 없어 닫힘률을 산출할 수 없다.

## Users

- **Primary**: **운영자 본인** — mccp로 주당 2~3 마일스톤을 돌리는 단일 개발자. 트리거는 매 사이클마다 반복되는 세 가지 마찰이다. 리드타임을 재는 숫자가 없어 deadline을 근거로 무엇을 자를지 정할 수 없고, `/mccp:work`가 어디서 왜 멈췄는지 기록이 없어 무인화 진척을 알 수 없으며, 게이트 수정 하나가 곧바로 사용자에게 나가 되돌릴 경로가 없다.
- **Secondary**: **marketplace로 mccp를 설치한 실사용자** — 주 2~3회의 게이트 변경에 노출되고, 롤백 경로가 없으며(태그 1개), 그 변경 대부분이 자기와 무관한 dogfood 반복이다. 이 PRD가 이들에게 약속하는 것은 새 기능이 아니라 **노출 빈도의 감소와 롤백의 존재**다.
- **Not for**: mccp를 외부 제품 개발에 쓰는 사용자. 이 저장소는 PRD 41건 전부가 자기 자신을 주제로 하며 외부 전달 이력이 0이다 — 저장소 밖 접지 신호가 없다는 사실은 인정하되 이 PRD가 해결하지 않는다.

## Hypothesis

We believe **게이트가 한 일을 기록하고, 그 기록을 지표로 만들고, dogfood와 릴리스를 다른 채널로 분리하는 것**이 **"기계는 만들어지고 그것을 부르는 한 줄이 빠지며 아무 test도 그 부재를 보지 못한다"는 실패 모드**를 **운영자 본인(1차)과 marketplace 실사용자(2차)** 에게 해소할 것이다.

We'll know we're right when **오늘 산출되지 않는 5대 지표가 전부 실값을 갖고, 그 값이 읽히는 화면과 그 값이 바꾸는 행동이 각각 지정되어 있으며, 사용자 노출이 주 2~3회에서 PRD 단위로 내려간다**.

### 판정 기준 — 하나가 아니라 넷을 함께 본다

이 저장소의 서명 실패 모드가 "근거 없는 숫자"이므로, 오늘 baseline이 없는 지표에 목표치를 지어내지 않는다. 대신 판정을 계층으로 나눈다.

| 축 | 기준 | 왜 이 축인가 |
|---|---|---|
| **A. 측정 개시 (최소 성공)** | 5대 지표가 전부 `null`을 벗어나 실값을 갖는다 | 오늘 2개는 값 자체가 없다. 값이 없으면 방향도 목표도 논할 수 없다. 이 축을 넘지 못하면 나머지는 전부 무의미하다 |
| **B. 방향 (2차)** | 지표 3·5는 100%, 지표 4는 20% 미만. 지표 1·2의 목표치는 **축 A 달성 후 baseline 2주로 확정** | 100%와 20%는 오늘 값(0% · 0.87% · 50%)이 있어 방어 가능하다. 1·2는 오늘 값이 없어 지금 정하면 근거 없는 숫자가 된다 |
| **C. 체감 (2차 사용자)** | 사용자 노출이 PRD 단위로 내려가고, 롤백이 manifest 한 줄 되돌리기로 성립한다 | 실사용자에게 이 PRD가 약속하는 유일한 것이다. 지표와 독립적으로 판정된다 |
| **D. 반증 (설계 가설)** | C5 착지 후 halt의 "계약공백" 분류 비율이 유의하게 감소하지 않으면, *"계약을 조이면 질문은 답해지는 것이 아니라 발생하지 않는다"* 는 예측이 반증된다 | 이 PRD가 세운 가장 값비싼 가설이다. 반증되면 C9의 M2·M3 투자 근거가 오히려 강화되고, 확증되면 M2·M3이 불필요해진다. 어느 쪽이든 다음 투자를 바꾼다 |

축 A만 이 PRD의 완료 조건이다. B·C·D는 자식별로 판정되며, D는 C5와 C9 M1이 함께 착지한 뒤에만 판정 가능하다.

## Success Metrics

**1차 5개 — 운영자용 한 화면.** 각 지표는 *읽는 주체*와 *바꾸는 행동*이 함께 지정된다. 이것이 빠지면 또 계측 부채가 된다 — 선행 조사가 "계측은 붙었는데 소비 회로가 없다"를 이미 지목했다.

| # | 지표 | 오늘 | 축 A 기준 | 축 B 기준 | 읽는 주체 → 바꾸는 행동 |
|---|---|---|---|---|---|
| 1 | 무인 완주율 (사람 개입 없이 완료된 `/mccp:work` / 전체) | **미측정** | 산출된다 | baseline 후 확정 | `/mccp:work` 진입 배너 → 하락 시 어느 phase가 막았는지 표시 |
| 2 | 마일스톤 e2e 리드타임 p50/p90/max | git 근사 4~18일 | 실측이 근사를 대체 | baseline 후 확정 | `STATUS.md` 상단 → p90 초과 시 timebox 임계 재조정 |
| 3 | 게이트 기록 충실도 (실제 라운드 수 + 리뷰 원문 링크를 **둘 다** 가진 ship receipt / 전체) | **0%** (rounds 통로 부재, 링크 양방향 0/71) | 산출된다 | **100%** — 분모는 착지 후 **리뷰 대상** ship (C1 결정 2) | `validate-cmd` 경고 → 미달 시 stderr WARN (차단 아님) |
| 4 | 단일통과 우회율 (단일통과로 통과한 차단 / 전체 차단) | **50%** (16/32) | 유지 | **20% 미만** | 주간 리포트 → 초과 시 라운드 정책 재검토 |
| 5 | CI 강제 커버리지 (CI가 실행하는 test / 전체) | **0.87%** (3/346) | 산출된다 | **100%** | PR 체크 → 미달 시 머지 차단 |

**2차 지표.** 자식이 착지하는 대로 대시보드 2열에 붙는다.

| 지표 | 오늘 | 소유 자식 | 비고 |
|---|---|---|---|
| halt율 · halt당 차단 벽시계 (p50/p90) | 미측정 | C9 M1 | **리드타임의 실제 구성요소.** 패널 통과분은 평균 8분인데 마일스톤은 하루~1주다 — 그 차이의 대부분이 계산이 아니라 대기일 가능성이 높고 그 구간에 관측이 없다 |
| 사용자 노출 케이던스 | 주 2~3회 | C0 | PRD 단위(2~3주 1회)로. 기존 bump 기준을 릴리스 경계로 승격하는 것이라 새 규칙이 아니다 |
| 내용층 라운드 구조 커버리지 | **정의 미확정** — 같은 코퍼스가 정의에 따라 4.2~59.2% (C1 실측). 45.2%는 그중 `R1`/`R2` 토큰 정의의 값 | C1 | `.claude/reviews/` 71파일 평균 94줄. C1 M1이 정의를 파서로 고정한 뒤에야 목표가 반증 가능해진다 |
| backlog 흡수율 | 6.9% (32/465) | 미정 | 상태 열이 없어 closure 추적 불가 — Open Question 2 |
| evidence chain coverage | 0.568 (`evidence-audit` exit 4) | 미정 | 상시 비영점 baseline이라 신호가 되지 못한다 — Open Question 3 |
| 자기 지표 산출률 | 4 / 10 computed | C2·C4 | A3는 `integrity_ok:false` |

**나중에 (지금은 설계만).** finding 신규성 비율 — 라운드 N+1의 신규 finding 비율. 라운드 폭주가 새 축을 여는지 앞 라운드의 수정을 겨냥하는지를 가르는 유일한 정량 신호다. finding 사후 적중률 — 흡수한 finding 중 revert/재발이 없었던 비율. 리뷰 기계가 실제로 결함을 잡는지의 유일한 ground truth다.

## Scope

**MVP** — **C0 `release-channel-separation` 단독.** dogfood trunk(main)와 사용자 채널(`release` ref)을 분리하고, 로컬 dogfood 설치 절차를 명문화하고, 릴리스 런북과 롤백 경로를 세운다. 여기에 아래 결정 1(버전 번호의 소유자 이전)이 포함된다.

C0가 MVP인 이유는 그것이 **안전의 전제**이기 때문이다. C5·C6·C7·C8·C10은 사용자가 체감하는 게이트 변경이고 현재는 머지가 곧 배포다. C0 없이 그 다섯을 열면 실사용자가 미검증 게이트 변경을 그대로 받는다. C1~C4는 C0와 병렬 착수 가능하되(배포 위험 0~낮음) MVP 판정에는 포함되지 않는다.

### 이번 PRD에서 못박은 결정 3건

| # | 결정 | 귀속 |
|---|---|---|
| 1 | **자식 브랜치는 `plugin.json` version을 선언하지 않는다. 번호는 릴리스 컷이 결정한다.** 병렬 브랜치 version 충돌(9회 재발 이력)은 브랜치가 미리 번호를 잡기 때문에 생긴다. main이 릴리스가 아니게 되면 그 원인이 소멸한다 — 별도 재번호 기계를 만들 필요가 없다 | C0 |
| 2 | **`plan.md` Phase 4 확인 정지 해소는 C2에 넣지 않고 별도 자식(C10)으로 분리한다.** 배포 위험 계급이 다르고(C2는 fail-open 로깅 배선, C10은 사용자가 의존하던 확인 정지의 제거 → dark ship 필수), `plan.md`를 건드리므로 C5·C8과 같은 직렬 큐에 들어가야 하는데 C2를 그 큐에 묶으면 그룹 1 병렬성이 깨진다 | C10 (신설) |
| 3 | **C8 `command-body-diet`은 색인에 남기되 이번 사이클 착수를 금한다.** 착수 게이트는 C5 머지 완료 **그리고** 선행조건 2건(lint before-state 파라미터화 · 본문별 relocation ledger)의 충족이다. 그 게이트 이전에는 plan 생성 자체를 하지 않는다 | C8 |

### Out of scope

- **context 아키텍처 재설계** — 운영자가 "가장 큰 이슈"로 지목했으나 Codex와 내부 검증자가 독립적으로 같은 강등을 냈다. 셸 상태가 도구 경계를 못 넘는 것은 사실이고 `plan.md`가 검토 디렉토리 경로를 18회 재파생하지만, `/mccp:work`와 orchestrator가 JSON artifact 계약으로 이미 우회한다. **재파생은 비용이지 차단이 아니다.**
- **리뷰 품질 향상 · 새 게이트 추가** — 이 PRD는 기존 게이트가 한 일을 기록하게 만들 뿐 게이트를 늘리거나 리뷰어를 바꾸지 않는다.
- **cross-model 리뷰 전략 재검토** — `diverse-agent-review` PRD 소관.
- **quorum M·K의 존폐** — binding 0건이라 유지비만 남은 장식이거나 강제를 복원해야 할 미완성 기제인데, `diverse-agent-review`가 이미 이연 결정을 했다. 본 우산이 손대면 충돌한다. 다만 **결정 시한은 이 PRD가 요구한다**(Open Question 1).
- **halt에서의 결정 대행** — C9는 대기 제거가 목표이지 판단 대행이 아니다. "0 halt"를 목표로 두지 않는다. 사용자는 비즈니스 의도의 유일한 원천이고, 다음 주 deadline이 당겨진 것을 과거 기록 461행이 알려주지 않는다. 자동 진행의 판정 기준은 확신도가 아니라 **가역성**이며, 비가역 행동(push · 외부 부작용)에는 절대 적용하지 않는다.
- **외부 문헌 조사** — 이 사이클에 수행하지 않았다. 판정 근거는 전부 저장소 실측과 Codex 교차검증이다.
- **토큰·USD 비용 계측** — 지표 설계에는 자리를 뒀으나 오늘 값이 없고 이 PRD가 만들지 않는다.

## Delivery Milestones
<!-- 이 표의 각 행은 engineering task가 아니라 **자식 PRD**다. /mccp:plan은 우산이 아니라 각 자식 PRD를 직접 소비한다. -->
<!-- 표는 자식의 상태를 미러링만 하며, 자식은 각자 독립 ship·아카이브된다. -->
<!-- Plan 열에는 plan 경로가 아니라 자식 PRD 경로가 들어간다 (선례: review-loop-trust.prd.md). -->
<!-- Status: pending | in-progress | complete -->

> **이 우산에 `/mccp:plan`을 직접 걸지 마라.** `plan.md`에는 우산을 구분하는 코드가 없어
> 마일스톤 0을 골라 자식 PRD 없이 구현 plan을 써 버린다(`:148`, `:153`). 순서는
> `/mccp:plan-prd`로 자식 PRD 생성 → 그 자식에 `/mccp:plan`이다. 이 규율은 기계가 아니라
> 관례로만 강제된다.

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 0 | release-channel-separation | main이 dogfood trunk가 되고 `release` ref가 사용자 채널이 된다. 롤백이 manifest 한 줄 되돌리기로 성립한다. 버전 번호의 소유자가 브랜치에서 릴리스 컷으로 이전한다. 로컬 dogfood 설치가 문서화되어 캐시 직접 복사 workaround가 은퇴한다 | pending | `release-channel-separation.prd.md` (미생성) |
| 1 | review-record-linkage | `rounds`가 실제 라운드 수를 담고, ship receipt와 리뷰 원문이 양방향으로 연결되며, 내용층 라운드 구조 커버리지가 100%가 된다. **얇은 ship receipt 설계는 유지한다** | in-progress | [review-record-linkage.prd.md](review-record-linkage.prd.md) |
| 2 | orchestrator-step-wiring | `/mccp:work`가 orchestrator를 실제로 호출해 무인 완주율이 `null`을 벗어난다. 기록 실패가 체인을 멈추지 않는다 | pending | `orchestrator-step-wiring.prd.md` (미생성) |
| 3 | ci-full-suite | CI가 전체 test를 강제한다. 그 전에 실행 시간이 신뢰 가능해진다 — 오늘 타이밍은 경합 오염으로 자체 무효 판정됐다. 첫 작업은 순수 in-process 단언 파일이 조용한 머신에서도 30초 걸리는 **미설명 100배 격차**의 규명이다. red 1건 해소 | pending | `ci-full-suite.prd.md` (미생성) |
| 4 | leadtime-observability | 비수렴 33건의 벽시계가 복원되고, 마일스톤 e2e 리드타임이 git 근사가 아닌 실측으로 산출된다 | pending | `leadtime-observability.prd.md` (미생성) |
| 5 | plan-artifact-contract | plan 산출물의 검증 절이 자유 서술에서 게이트 계약으로 재정의되고, 검증이 형식이 아니라 내용을 본다 | pending | `plan-artifact-contract.prd.md` (미생성) |
| 6 | santa-surface-acceptance | 무인 push에 human-gate와 브랜치 가드가 생기고, 리뷰어가 범위 밖 관찰을 버릴 곳을 갖는다 | pending | `santa-surface-acceptance.prd.md` (미생성) |
| 7 | deadline-timebox | 라운드 벽시계가 임계를 넘으면 자동으로 분기한다. 라운드 캡 설정과 "실무 기본 1라운드" 산문의 이원화가 끝난다 | pending | `deadline-timebox.prd.md` (미생성) |
| 8 | command-body-diet | 명령 본문이 블록에서 CLI 호출로 치환되어 절반 이하가 된다. **착수 게이트: C5 머지 + 선행조건 2건 충족.** 그 전에는 plan을 만들지 않는다 | pending | `command-body-diet.prd.md` (미생성) |
| 9 | decision-precedent-corpus | halt가 계측되고(M1), 선례가 인용과 함께 제시되며(M2), 가역적 halt에 한해 자동 진행한다(M3). **결정 대행이 아니라 대기 제거** | pending | `decision-precedent-corpus.prd.md` (미생성) |
| 10 | unattended-confirmation-contract | 직접 `/mccp:plan` 호출은 확인 정지를 유지하고, `/mccp:work` 경유일 때만 우회하며, 어느 경로든 게이트와 receipt는 강제 실행된다 | pending | `unattended-confirmation-contract.prd.md` (미생성) |

### 병렬 안전성 근거 (자세한 분해는 각 자식의 `/mccp:plan` 소유)

병렬 가능성은 의욕이 아니라 **파일 배타 소유**가 정한다. 아래는 착수 순서를 정하는 제약이며 구현 설계가 아니다.

| 자식 | 그룹 | 선행조건 | 배포 표면 | 사용자 체감 | dark ship |
|---|---|---|---|---|---|
| C0 | 0 | 없음 | manifest + 문서 | 채널 이전 1회 | 불필요 |
| C1 | 1 | 없음 | 배포 | 낮음 (필드 additive) | 불필요 |
| C2 | 1 | 없음 | 배포 | 중간 (`/mccp:work` 실행 경로) | 권장 |
| C3 | 1 | 없음 | **미배포** (`.github/`는 배포 표면 밖) | 없음 | 해당 없음 |
| C4 | 1 | 없음 | 배포 | 없음 (read-only 계측) | 불필요 |
| C6 | 1 | C0 | 배포 | **높음** (기존 무인 push가 멈춘다) | **필수** |
| C5 | 2 | C0 · C1 | 배포 | **높음** (통과하던 plan이 거부된다) | **필수** |
| C9 M1 | 2 | C2 | 배포 | 없음 (append-only) | 불필요 |
| C10 | 2 | C2 · C5 | 배포 | **높음** (확인 정지 제거) | **필수** |
| C7 | 3 | C0 · C4 | 배포 | **높음** (게이트가 시간으로 중단) | **필수** |
| C8 | 4 | **C5 머지 + 선행조건 2건** | 배포 | **최고** (명령 본문 전면 재구성) | **구조적으로 불가능** |

**동시 착수 가능 최대치는 6개**다 — C0·C1·C2·C3·C4는 소유 파일이 완전히 분리되고, C6은 C0 착지만 기다린다. 근거 조사 본문에 5개와 6개가 함께 적힌 자기모순이 있었고, 6개가 맞다 — C6의 소유 파일이 어느 축과도 겹치지 않는다.

**직렬 강제 2건**: C5와 C8은 둘 다 `plan.md`를 수정하므로 병렬 불가이며, C10도 같은 파일의 다른 절을 소유하므로 같은 큐에 들어간다. 큐 순서는 C5 → C10 → C8이다.

**dark ship에는 만기를 붙인다.** 이 저장소는 이미 dark ship 패턴을 갖지만, 토글 146개가 그 자체로 부채이고 어떤 토글은 "for local debugging"으로 도입돼 2.5개월 영구화됐다. 따라서 규율은 "dark ship하라"가 아니라 **"dark ship하되 등록 시점에 제거 마일스톤을 함께 명시하라"** 다. 만기 없는 신규 토글은 거부된다.

## Open Questions

- [ ] **quorum M·K를 살릴 것인가 버릴 것인가 — 그리고 언제까지 정할 것인가.** binding 0건이므로 유지비만 남은 장식이거나 강제를 복원해야 할 미완성 기제다. 결정 자체는 `diverse-agent-review` 소관이라 본 우산이 손대면 충돌하지만, **결정 시한이 없으면 무한 이연된다.**
- [ ] **backlog에 상태 열을 추가할 것인가.** 파서가 헤더를 4열로 리터럴 고정하므로 5번째 열은 기존 465행 전부를 파서에서 사라지게 한다. 별도 파일 분리라는 우회가 있다. **닫힘률을 산출할 수 없으면 자기개선을 주장할 수 없다.**
- [ ] **`evidence-audit`의 상시 exit 4 baseline을 어떻게 할 것인가.** coverage 0.568이 개선 목표인지 수용 가능한 상수인지 정하지 않으면, 20번째 dangling이 신호를 만들지 못한다.
- [ ] **우산 PRD 자신의 대시보드 가시성.** PRD discovery는 활성 plan의 `source_prd`로만 이뤄지는데 이 우산은 자체 plan을 갖지 않을 예정이다(자식이 각자 PRD를 갖는다). 자식은 보이되 우산은 안 보인다. `_meta` 색인과 자식 PRD의 상호 참조로만 추적할 것인지, 우산에도 최소 plan을 붙일 것인지.
- [ ] **C3의 타이밍 재측정을 어디서 할 것인가.** 오늘 값은 경합 오염으로 무효 판정됐고, 조용한 머신을 확보하지 못하면 CI 목표 크기를 산정할 근거가 계속 없다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| C0의 `source` 타입 변경을 marketplace 갱신이 어떻게 처리하는지 **미검증**이다 (이 환경에서 `claude` 바이너리가 PATH에 없어 실측 불가) | 중 | 높음 — 사용자 설치가 깨질 수 있다 | C0의 완료 조건에 **라이브 검증 1회**를 포함한다. 검증 전 릴리스 금지 |
| 자식 5~6개를 동시에 열면 `CHANGELOG.md`가 공유 소유가 되어 병렬 이득의 상당분을 머지 비용으로 반납한다 | 높음 | 중 | 결정 1(버전 소유자 이전)이 `plugin.json` 축을 닫는다. `CHANGELOG` 항목을 릴리스 컷까지 미확정으로 누적하는 형태를 C0가 함께 정한다 |
| in-flight 3축(`env-contract-integrity` · `diverse-agent-review` · `multi-session-work-loop-m9`)이 backlog · STATE · CHANGELOG를 공유 소유한다 | 높음 | 중 | 본 우산의 자식 중 앞의 둘을 소유하는 것은 없다. CHANGELOG 충돌은 위 행과 같은 완화를 받는다 |
| C8이 산문 의무를 조용히 죽이는 파손을 만들고 현행 static test가 그것을 못 잡는다 | 중 | **높음** | 착수 게이트(결정 3)를 릴리스 차단 조건으로 격상. relocation ledger와 lint before-state 파라미터화가 "있으면 좋음"이 아니라 필수다 |
| C2의 기록 배선 실패가 `/mccp:work` 체인을 멈춘다 | 중 | 높음 | fail-open을 C2의 acceptance 조건으로 못박는다. 기록은 체인의 부수효과이지 전제조건이 아니다 |
| 새 producer를 추가했는데 또 caller가 없어 `null`로 남는다 — base rate상 자기 지표 5개가 이미 그렇다 | **높음** | 높음 | 모든 자식의 acceptance에 producer가 아니라 **산출된 실값**을 조건으로 둔다. 배선 부재를 보는 test가 없다면 그 자식은 완료가 아니다 |
| 우산이 자식을 인질로 잡아 아카이브가 지연된다 (`review-loop-trust` 선례) | 중 | 낮음 | 자식은 각자 ship·아카이브되고 우산 표는 미러링만 한다. 우산 자신의 은퇴는 수동 절차로 처리한다 |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-09-01.*
