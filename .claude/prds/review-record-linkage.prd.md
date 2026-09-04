# review-record-linkage — 게이트가 한 일을 결정층이 기록하게 한다

> **자식 PRD.** 우산 [harness-wiring-integrity](harness-wiring-integrity.prd.md)의 C1이며,
> 독립적으로 plan·ship·아카이브된다. 우산 표는 이 문서의 상태를 미러링만 한다.
>
> 근거 조사: [2026-08-31-final-harness-assessment-and-umbrella-prd.md](../_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md) A절
> 본 PRD의 실측: 2026-09-01 · base `bacd96a` · 재현 근거는 Evidence 각 행에 동봉

## Problem

ship receipt는 게이트가 **무엇을 결정했는지**를 봉인하지만 **몇 번 만에 결정했는지**는 봉인하지 못한다. `resolution.rounds`가 71건 중 70건에서 `1`인 이유는 값이 틀려서가 아니라 **게이트가 그 필드에 값을 넣을 통로 자체가 없기 때문**이다. 최상위 `round`도 71/71이 `1`이다. 즉 override 사유문이 "round 6"을 증언하는 실행조차, 그 6이라는 수가 남은 기계 기록은 저장소 어디에도 없다.

리뷰 내용은 소실되지 않았다 — `.claude/reviews/`가 71파일 6,708줄로 git-tracked다. 문제는 **두 층이 서로를 모른다**는 것이다. receipt에 리뷰 경로가 없고 리뷰 원문에 receipt 식별자가 없다(양방향 0건). 파일명 관례로 대조하면 24/71(33.8%)만 맞는다.

대가는 둘이다. (a) 마일스톤 리드타임의 유일한 기계 소스가 상수라, C4가 실측하려 해도 읽을 값이 없다. (b) receipt 하나를 손에 들고 그 리뷰 원문으로 건너뛸 기계 경로가 없어, 사후 감사가 사람의 파일명 추측에 의존한다.

## Evidence

전부 이 브랜치(`review-record-linkage`, base `bacd96a`)에서 직접 실행한 결과다.

> **2026-09-01 정정 — 아래 첫 항목은 이 브랜치의 base 기준으로만 참이다.** M1 게이트를
> 실행하다 발견했다: **origin/main(v1.33.6)은 `env-contract-integrity M3`로 게이트용
> `resolution.rounds` 통로를 이미 출시했다.** 근거는 셋이고 전부 기계 확인했다 —
> (a) `receipt/write.js`가 round ledger에서 `resolution.rounds`를 파생하며 그 분기는
> gate를 가리지 않는다(`mccp-pr-codex` 포함), (b) 증분 채널이 둘 실재한다
> (`lib/codex-invoke.js:534` Codex축 · `lib/plan-review/cli.js:348` 패널축),
> (c) 세 게이트 본문(`plan.md` · `prp-implement.md` · `pr.md`)이 전부 round 정책을
> seal한다. **end-to-end 실증**: 이 PRD의 M1 게이트가 패널을 3회 발화했고 발행된
> `mccp-plan-codex/review-record-linkage.json`이 `resolution.rounds: 3`을 봉인했다 —
> 리터럴 1이 아니다.
>
> 이 워크트리의 `receipt/write.js:395`는 여전히 리터럴 `rounds: 1`이므로 **PRD 작성
> 시점의 실측은 정직했다**. 바뀐 것은 upstream이다. 과거 ship receipt 71건이 전부 `1`인
> 것도 여전히 참이다(그 전부가 M3 이전 발행분이다) — 즉 **Problem의 진단은 유효하고,
> M2의 처방이 이미 상류에서 시행됐다.** 잔여 1건은 M2 행에 적었다.

- **`resolution.rounds`에는 게이트용 입력 통로가 없다.** `receipt/cli.js:23`의 write 플래그 목록에 `--rounds`류가 0개이고, 유일 경로인 `--resolution-file`은 게이트 본문(`plan.md` · `prp-implement.md` · `pr.md`) 어디에도 등장하지 않는다 — 유일한 언급은 수동 복구 명령 `receipt-write.md`의 자기 사용 예시다. 따라서 `write.js:393-399`의 `defaultResolution` 리터럴 `rounds: 1`이 게이트 발행 receipt 전건에 **구조적으로** 실린다. 대조적으로 `meta`에는 라운드 카운터가 5종(`design_critique_rounds` · `merged_verify_rounds` · `santa_rounds` · `santa_blind_rounds` · `santa_delta_rounds`) 있고 전부 플래그를 갖는다. 결정층만 없다.
- **두 라운드 필드가 모두 상수다.** ship receipt 71건에서 최상위 `round`는 `{1: 71}`, `resolution.rounds`는 `{1: 70, 2: 1}`. 유일한 예외 `v0-2-8-task-2-6-1-fix.json`은 수동 발행분이다. 즉 라운드 수는 **틀린 것이 아니라 없다** — 소급 복원의 원천이 존재하지 않는다.
- **층간 링크가 양방향 0건이다.** receipt 71건 중 `.claude/reviews/` 경로를 담은 것 0건. 리뷰 71건 중 `receipt_hash`를 담은 것은 문자열로는 4건이지만 **전수 확인 결과 4건 모두 리뷰어가 그 필드를 *주제로 논한* finding 본문**이며 링크가 아니다.
- **파일명 관례는 계약이 될 수 없다.** receipt slug와 `plan-review-<slug>.md`의 정확 일치는 24/71(33.8%)이다. 불일치분에는 `archive-*` · `chore-*` 처럼 **애초에 plan 리뷰가 없는 chore ship**이 섞여 있다 — 즉 분모가 71이 아니다.
- **"내용층 커버리지 45.2%"는 재현 불가능한 숫자다.** "라운드 구조 보유"의 정의를 바꾸면 같은 코퍼스에서 값이 다음처럼 갈린다.

  | 정의 | 결과 |
  |---|---|
  | A. `#### Round N` 형태의 heading | 3/71 (4.2%) |
  | B. `round N` 토큰 등장 | 8/71 (11.3%) |
  | C. `R1`/`R2` 토큰 등장 | 32/71 (45.1%) |
  | D. B 또는 C | 34/71 (47.9%) |
  | E. `round`/`라운드` 단어 등장 | 42/71 (59.2%) |

  선행 조사의 45.2%는 정의 C다. 그런데 C는 "이 리뷰가 자기 라운드 구조를 기록했다"의 대리 지표로 약하다 — finding 본문이 "R1에서 흡수함"이라 적기만 해도 참이 된다. **정의가 파서로 고정되기 전에는 "100%로 올린다"가 반증 불가능하다.**
- **링크 비용은 낮다.** `plan-review/record.js:65`가 slug를 `receipt/cli.js derive-decision`에서 받는다 — 두 층이 이미 같은 원천에서 같은 식별자를 파생한다. 링크는 새 아키텍처가 아니라 이미 손에 든 값을 양쪽에 적는 일이다. 다만 `record.js`에 receipt 인지는 0건이라 배선은 실재하지 않는다.
- **얇은 ship receipt는 유지 대상이다.** `.gitignore:26-34`가 2026-07-22의 심의 결정을 명시한다(미검토 부트스트랩 기본값 대체). 이 PRD는 그 결정을 **바꾸지 않는다.**

## Users

- **Primary**: **운영자 본인.** 이 PRD의 산출물을 읽는 주체는 셋으로 한정된다 — (1) `validate-cmd`가 미달 receipt에 stderr WARN을 낸다(차단 아님), (2) C4 `leadtime-observability`가 `rounds`를 리드타임 실측의 기계 소스로 읽는다, (3) 사후 감사 시 사람이 receipt에서 리뷰 원문으로 한 번에 건너뛴다. 이 셋 밖의 소비처는 이 사이클에 만들지 않는다.
- **Secondary**: **C5 `plan-artifact-contract`.** C5는 C1을 선행조건으로 갖는다 — receipt 계약이 확정돼야 그 위에 게이트 계약을 얹을 수 있다. 즉 C1의 착수 이유는 자기 값어치보다 **두 자식(C4·C5)의 차단 해소**가 크다.
- **Not for**: marketplace 실사용자. 이 변경은 additive 필드와 read-only 계측이라 사용자 체감이 없다. 사용자에게 약속하는 것이 없다는 사실을 명시한다.

## Hypothesis

We believe **결정층에 라운드 기록 통로를 만들고, 이미 공유 중인 slug로 두 층을 양방향 연결하고, 내용층의 라운드 구조를 파서가 소유하는 정의로 고정하는 것**이 **"게이트가 한 일이 그 게이트의 기록에 남지 않는다"는 상태**를 **운영자 본인과 하류 자식(C4·C5)** 에게 해소할 것이다.

We'll know we're right when **C1 착지 후 발행된 ship receipt가 실제 라운드 수와 리뷰 원문 링크를 둘 다 갖고, 그 값을 읽는 화면과 그 값이 바꾸는 행동이 지정되어 있으며, 과거 71건은 재봉인 없이 동결 baseline으로 보고된다**.

## Success Metrics

분모는 전부 **C1 착지 이후 발행분**이다. 과거 71건은 목표를 갖지 않는다 (결정 1).

| # | 지표 | 오늘 | 축 A (측정 개시) | 축 B (방향) | 읽는 주체 → 바꾸는 행동 |
|---|---|---|---|---|---|
| 1 | 라운드 기록 충실도 (실제 라운드 수를 담은 ship receipt / 착지 후 전체) | **0%** — 통로 부재 | 산출된다 | **100%** | `validate-cmd` stderr WARN → 미달이면 어느 게이트가 값을 안 넘겼는지 표시 |
| 2 | 층간 링크율 (양방향 링크를 가진 ship receipt / 착지 후 **리뷰 대상** ship) | **0%** (0/71) | 산출된다 | **100%** | 사후 감사 → receipt에서 리뷰 원문으로 1홉 |
| 3 | 내용층 라운드 구조 커버리지 (파서 정의를 만족한 리뷰 / 착지 후 전체) | **정의 미확정** (4.2~59.2%) | 정의가 파서로 고정되고 값이 산출된다 | **100%** | `record.js` 자체 검증 → 미달 형식은 기록 시점에 거부 |
| 4 | 리드타임 소스 가용성 (`rounds`를 읽어 라운드당 벽시계를 산출 가능한 receipt / 착지 후 전체) | **0%** | 산출된다 | C4가 목표를 소유 | C4 `leadtime-observability` |

**관측만 하고 목표를 두지 않는 것**: C1 이전 코퍼스의 동결 baseline. 이 값들은 개선 대상이 아니라 **C1 이전을 구분하는 기준선**이고, 정본은 [frozen-baseline.md](../../docs/review-record-linkage/frozen-baseline.md)의 동결 블록이다 — 여기 옮겨 적지 않는다. M1 착지 시점 실측은 ship 75 · 패널 레코드 55 · 링크 양방향 각 0/75 · 파일명 일치 27/75. (이 PRD가 Problem·Evidence 절에서 인용하는 71 계열 수치는 **작성 시점의 작업 트리** 실측이고 그때는 정직했다. M1이 멤버십을 경계 트리로 고정하면서 분모가 확정됐다 — 자세한 경위는 M1 보고서의 Deviations 4번.)

## Scope

**MVP** — **M1 단독** (원래 M1 + M2 였으나 M2가 상류 선점으로 dropped — Delivery Milestones 표 아래 주 참조). 계측 정의를 파서로 고정해 과거를 동결 보고하고(M1), `resolution.rounds`에 게이트용 통로를 만들어 세 게이트가 실값을 넣게 한다(M2). M2의 outcome은 `env-contract-integrity M3`가 상류에서 이미 출시했으므로, M1만으로 지표 1·4가 `null`을 벗어나고 C4의 차단이 풀린다. M3(링크)·M4(내용층 형식)·M5(발화)·M6(원장 종결)는 같은 사이클에 이어지되 MVP 판정에는 포함되지 않는다.

M1이 먼저인 이유는 **M2·M3·M4의 목표치가 전부 M1이 정하는 분모 위에 서기 때문**이다. 정의 없이 착수하면 45.2%와 같은 재현 불가능한 숫자를 하나 더 만든다.

### 이 PRD가 못박는 결정 3건

| # | 결정 | 근거 |
|---|---|---|
| 1 | **과거 71건은 소급하지 않는다. 재봉인도 사이드카도 없다.** 읽기 전용 도구가 동결 baseline을 보고할 뿐이다 | 진짜 라운드 수가 두 필드 모두에서 상수라 **복원의 원천이 없다** — 소급은 산문 파싱에 의한 추론이 되고, 추론값을 해시 봉인된 감사 코퍼스에 넣는 것은 이 PRD가 닫으려는 실패 자체다. §3.12 no-rehash 불변식도 재봉인을 금지한다. 사이드카는 `rounds`에 대해 같은 추론이 필요해 링크 절반만 사는데, 그 절반은 필요 시 파생 가능하므로 층을 늘릴 값어치가 없다 |
| 2 | **지표 2의 분모는 "전체 ship"이 아니라 "리뷰 대상 ship"이다.** chore ship(아카이브·version bump 등) 판별을 M1이 파서로 정의한다 | plan 리뷰가 애초에 없는 ship을 분모에 넣으면 100%가 **구조적으로 불가능**해지고, 달성 불가능한 지표는 즉시 무시된다. 오늘 파일명 불일치 47건에 그런 ship이 섞여 있다 |
| 3 | **"라운드 구조 보유"의 정의는 산문이 아니라 파서가 소유한다.** 문서가 그 파서를 인용하지, 파서가 문서를 따라가지 않는다 | 같은 코퍼스가 정의에 따라 4.2%와 59.2% 사이를 오간다. 정의가 코드 밖에 있으면 목표 달성 여부를 나중에 아무나 재정의할 수 있다 |

### Out of scope

- **얇은 ship receipt 설계의 변경** — 2026-07-22 심의 결정(`.gitignore:26-34`)이며 이 PRD가 손대지 않는다. 리뷰 내용을 receipt로 옮기지 않는다.
- **과거 71건의 재봉인 · 마이그레이션 · 사이드카** — 결정 1.
- **`defaultResolution`의 `converged: true` 축** — 성공 방향 기본값이 배선 단절을 무증상으로 만드는 문제는 실재하지만 **다른 축**이다(근거 조사 B절). `rounds`만 고치고 `converged`는 건드리지 않는다.
- **`meta.*_rounds` 5종의 통합·정리** — 결정층 `rounds`와 중복인지 다른 축인지는 Open Question이고, 통합은 hash 표면을 흔드는 별개 작업이다.
- **리뷰 품질 향상 · 리뷰어 변경 · 새 게이트 추가** — 게이트가 한 일을 기록하게 만들 뿐이다.
- **`.claude/reviews/` 내용 형식의 전면 재설계** — M4는 라운드 구조의 **최소 계약**만 정하고 나머지 서술 자유도는 유지한다.
- **backlog 상태 열 추가** — 우산 Open Question 2 소관. 파서 헤더 4열 고정 제약을 공유하지만 소유 파일이 다르다.
- **리드타임 목표치 설정** — C4가 소유한다. C1은 소스를 만들 뿐 값을 해석하지 않는다.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | linkage-baseline-parser | "라운드 구조 보유" · "리뷰 대상 ship" · "층간 링크"의 정의가 **파서 코드**로 고정되고, 경계 트리의 코퍼스가 그 정의로 동결 보고된다(착지 실측 ship 75 · 레코드 55). 쓰기 0건 · read-only · LLM-free | complete | [.claude/plans/review-record-linkage-m1.plan.md](../plans/review-record-linkage-m1.plan.md) |
| 2 | rounds-channel | `resolution.rounds`에 게이트용 입력 통로가 생기고 세 게이트가 실값을 넘긴다. **acceptance는 producer가 아니라 산출된 실값** — 배선 부재를 보는 test가 없으면 완료가 아니다 | dropped | 검증 산출물: [review-record-linkage-m2-upstream-verification.md](../PRPs/reports/review-record-linkage-m2-upstream-verification.md) |
| 3 | bidirectional-link | receipt가 리뷰 경로를, 리뷰가 receipt 식별자를 갖는다. 필드는 present-only(`makeSkeleton` 미포함)라 과거 receipt의 hash가 불변이다 | complete | [.claude/plans/review-record-linkage-m3.plan.md](../plans/review-record-linkage-m3.plan.md) |
| 4 | review-round-structure | `record.js`가 M1의 파서 정의를 만족하는 형식으로만 기록하고, 착지 후 리뷰의 커버리지가 100%가 된다 | complete | [.claude/plans/review-record-linkage-m4.plan.md](../plans/review-record-linkage-m4.plan.md) |
| 5 | live-firing-closure | M1~M4가 만든 배선이 **실제로 발화한다** — 착지 후 발행되는 ship receipt가 `meta.review_record_path`·`meta.plan_review_expected`를 봉인하고 `linkage.bidirectional >= 1`·`denominator != null`이 된다. 발화하지 못하면 그 사실을 설치-skew 진단이 시끄럽게 말한다 | in-progress | [.claude/plans/review-record-linkage-m5.plan.md](../plans/review-record-linkage-m5.plan.md) |
| 6 | deferred-ledger-closure | 이 PRD가 남긴 backlog **73행**(M5가 분류를 마쳤고 판정만 남았다 — [deferred-triage.md](../../docs/review-record-linkage/deferred-triage.md)) · `FAIL` 버킷 14행(§3.14 해제 조건 대기, 일괄) · Open Questions 5건 · fix-task escalation 1건이 각각 해소/이연/무효 중 하나로 **명시 판정**되고 판정 근거가 파일에 남는다. 코드 변경은 §3.14 임계(HIGH/CRITICAL) 흡수분에 한정한다 | pending | — |

> **M6 행의 "79행"을 정정했다 (M5 Task 7, 2026-09-04).** 실측은 `Source plan` 열 기준
> 이 PRD 103행이고 그중 M5 자신의 사이클이 16행이다. M5 이전 누적은 87행이며, M5가
> (a) 이미 해소 6 · (b) M5 흡수 10 · (c) M6 이연 73 · (d) `FAIL` 버킷 14로 분류를
> 마쳤다(합계 103, 누락 0). 79는 어느 세는 규칙으로도 재현되지 않는다 — 근거 없는
> 수치가 관측표에 남아 있던 것이고, 그 정정 자체가 이 PRD가 닫으려는 결함이다.

> **M2 dropped 사유 (2026-09-01, 기계 확인).** `env-contract-integrity M3`(origin/main
> v1.33.6)가 이 마일스톤의 outcome을 그대로 출시했다 — 통로(`write.js`의 ledger 파생) ·
> 세 게이트의 seal · 증분 채널 2종이 전부 실재하고, 이 PRD 자신의 M1 게이트가 `rounds: 3`을
> 실제로 봉인해 "산출된 실값" acceptance까지 충족했다. 여기서 다시 만들면 두 번째 통로가
> 생기고, 그것은 이 PRD가 M1에서 세운 "정의는 한 곳이 소유한다"를 결정층에서 위반한다.
>
> **잔여 1건(이연, M2 재개 사유 아님)**: `/mccp:pr`의 증분 채널은 Codex축 하나뿐이라
> Codex가 발화하지 않은 ship(dedupe skip · `MCCP_CODEX_DISABLED`)은 ledger count가 0이 되고,
> `schema.js`의 `rounds >= 1` 때문에 `resolution.rounds`가 리터럴 1로 남는다. 참값 0은
> `meta.round_ledger_count`가 따로 싣는다 — 즉 **소실이 아니라 표현 한계**다. 지표 1의
> 분모를 "착지 후 발행분"으로 잡을 때 이 경우를 어떻게 셀지는 **C4가 소비 시점에 정한다**.
>
> 이 결정으로 **MVP는 M1 단독**이 된다(원래 M1 + M2). Scope 절의 MVP 문장은 그 전제 위에서
> 읽어야 한다.
>
> **2026-09-02 — 판단을 증거로 대체했다.** PR-Codex R1 F2(HIGH)가 "저자 판단이 사용자
> 범위 진술(UI9)을 대체할 수 없다"를 지적했고, 그 지적이 옳다. 위 사유는 **판단**이었지
> acceptance 대조가 아니었다. 이제 M2 outcome 문장을 A~D 네 명제로 쪼개 각각 재현 명령과
> 함께 대조한 산출물이 있다 —
> [review-record-linkage-m2-upstream-verification.md](../PRPs/reports/review-record-linkage-m2-upstream-verification.md).
> 결정적 증거는 C절이다: 이 PRD 자신의 M1 plan 게이트가 `resolution.rounds: 3`을 봉인했고
> 그 값이 `meta.round_ledger_count: 3`과 일치한다 — "산출된 실값" acceptance의 end-to-end
> 실물이다. D절은 배선 부재를 겨냥한 test 85 pass / 0 fail을 싣는다.
>
> 따라서 **UI9는 폐기가 아니라 충족**으로 읽는다 — MVP가 요구한 상태(M1의 정의 + M2의
> 통로)에 도달했고, 통로만 상류가 제공한다. 사용자가 2026-09-02에 이 해소 방식을 택했다.

> **M5·M6 추가 사유 (2026-09-04, 사용자 지시 + 기계 확인).** M1~M4가 전부 `complete`인데
> **이 PRD의 지표 2가 라이브에서 `0`이고 분모가 `null`이다.** 실측:
> `node plugins/mccp/scripts/lib/linkage-audit.js --json` → `post_baseline`의
> `linkage.{receipt_to_review, review_to_receipt, bidirectional}` 전부 `0`(HEAD 트리 ship
> 88 · 레코드 72), `ship_eligibility.counts.undecidable = 88`, `linkage.denominator = null`.
> M3·M4 **자신의** ship receipt에도 `meta.review_record_path`·`meta.plan_review_expected`가
> 부재다.
>
> 원인은 코드가 아니다. 배선은 워크트리에 실재하고(`commands/plan.md:2884-2892` ·
> `commands/pr.md:1049-1085` · `finalize-receipt.js:309-315`), 게이트가 실행하는 명령
> 본문이 **설치 캐시 `1.33.6`**(commit `647dfecb`)의 것이라 그 판본에 M3·M4 배선이 없다.
> `marketplace.json`이 `ref: release`를 가리키므로 `claude plugin update`로도 좁혀지지
> 않는다 — **캐시가 뒤처지는 것은 릴리스 채널 분리 이후의 항구적 기본 상태**다.
> M4 completion-ledger의 R10이 이미 이 사실을 등재했고, M3 보고서의 Next Steps가
> "다음 사이클에서 라이브 링크 완주 확인"을 이연했다. **그 이연이 M5다.**
>
> 이것은 이 PRD가 Risks 표 첫 행에 적은 **"새 통로를 만들었는데 게이트가 안 부른다"의
> 실현**이다. 완화로 적었던 "acceptance를 산출된 실값으로 둔다"는 단위 test와 워크트리
> 실행까지만 덮었고, **게이트가 어느 판본을 실행하는가**는 덮지 못했다.
>
> M6는 그 사이 쌓인 이연 원장을 닫는다 — backlog 79행(m1 29 · m3 25 · m4 12 · 출처 미상
> 24 중 이 PRD 귀속분), 미체크 Open Question 5건, `fix-task-applied.md`의 미해소
> escalation 1건. 분리 근거는 M5 plan의 DD8이다: 둘을 한 마일스톤에 넣으면 acceptance가
> "판정 79건"이 되어 라이브 실값 축이 그 안에 묻힌다.

**직렬 강제**: M1 → (M2 병렬 M3) → M4 → M5 → M6. M2와 M3는 소유 파일이 다르나(`receipt/write.js`+`cli.js` 대 `plan-review/record.js`) 둘 다 M1의 정의를 소비하므로 M1이 선행이다. M4는 M3의 링크 필드를 형식 계약에 포함하므로 M3 뒤다. M5는 M1~M4의 배선 전부가 착지한 뒤에만 "발화 여부"를 물을 수 있으므로 M4 뒤다. M6는 M5가 Task 7에서 backlog를 분류한 결과 위에 서므로 M5 뒤다.

## Open Questions

> **종결 소유자는 M6다** (2026-09-04). 다섯 항목 모두 미체크로 남아 있고, 그중 3번은
> 산출물이 실재하므로(`docs/review-record-linkage/frozen-baseline.md`) 사실상 답이 있는데
> 체크만 안 된 상태다. 5번은 M3가 `meta.plan_review_expected`로 답했으나 그 생산자가
> 라이브에서 한 번도 발화하지 않아(위 M5 사유 참조) **답이 반증 불가 상태로 남아 있다**.
> M6는 다섯 항목 각각을 해소 / 이연 / 무효 중 하나로 명시 판정하고 근거를 파일에 남긴다.

- [ ] **`rounds`가 세는 것이 무엇인가 — 게이트마다 라운드 개념이 다르다.** `/mccp:plan`은 L1/L2/L3 층이 있고, `/mccp:prp-implement`는 Codex R1/R2이며, `/mccp:pr`은 dedupe 여부로 갈린다. 하나의 정수로 접을 수 있는지, 아니면 게이트별 의미를 receipt가 함께 밝혀야 하는지. **M2 착수 전에 답해야 한다** — 답이 없으면 세 게이트가 서로 다른 것을 세면서 같은 필드에 넣는다.
- [ ] **`meta.*_rounds` 5종과 `resolution.rounds`의 관계.** 중복이면 결정층이 정본이고 meta는 상세인지, 아니면 애초에 다른 축을 세는지. 중복 판정이 나면 통합은 out of scope이나 **문서에 관계를 명시할 의무**는 남는다.
- [ ] **동결 baseline을 어디에 두는가.** 문서(`docs/`)에 축자 블록으로 동결하면 재생성 의무가 생기고(선례: M8 quorum-calibration), 산출물로 두면 갱신되어 baseline이 아니게 된다. 선례는 전자다.
- [ ] **`rounds` 값 변경이 하류에 미치는 영향.** 소비처를 열거하지 않은 채 상수를 변수로 바꾸면 dedupe · completion-ledger · `derive`가 어떻게 반응하는지 모른다. **M2의 첫 작업이 소비처 전수 열거여야 한다.**
- [ ] **chore ship의 판별 기준.** 파일명 prefix(`archive-*` · `chore-*`)는 관례일 뿐 계약이 아니다. receipt 안의 어떤 필드가 "이 ship에는 plan 리뷰가 없다"를 정직하게 말하는가.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **새 통로를 만들었는데 게이트가 안 부른다** — 이 저장소의 지배적 실패 모드이고 C1이 고치려는 것 자체다. base rate상 자기 지표 5개가 이미 그렇다 | **높음** | **높음** | 모든 마일스톤의 acceptance를 producer가 아니라 **산출된 실값**으로 둔다. 배선 부재를 보는 test(본문에 호출 줄이 실재하는지의 정적 단언 + 실제 spawn e2e)가 없으면 그 마일스톤은 완료가 아니다 |
| `rounds`가 상수에서 변수가 되며 하류 소비처가 예기치 않게 반응한다 (dedupe · ledger · derive) | 중 | 높음 | M2의 첫 작업을 소비처 전수 열거로 못박는다 (Open Question 4). 열거 전 값 변경 금지 |
| 링크 필드 추가가 과거 receipt의 `receipt_hash`를 흔든다 | 낮음 | **높음** — §3.12 감사 코퍼스 파손 | present-only(`makeSkeleton` 미포함)를 M3의 acceptance 조건으로 못박는다. 선례가 확립돼 있다(`pr_codex_force_override` · intent 10필드) |
| M1의 파서 정의가 과거 코퍼스를 유리하게 보이도록 선택된다 (기준 게이밍) | 중 | 중 | 정의 선택 근거를 5개 후보 정의의 값과 **함께** 기록한다. 위 표(4.2~59.2%)가 그 대조군이다. 정의 변경 시 재측정 의무 |
| in-flight `diverse-agent-review-m9`가 `plan-review/`를 공유 소유한다 | 중 | 중 | M3·M4가 `record.js`를 건드리므로 착수 전 그 브랜치의 소유 범위를 확인한다. M1·M2는 겹치지 않는다 |
| 우산 결정 1(version 소유자 이전)이 C0 착지 전이라 이 브랜치가 `plugin.json` version을 선언해야 하고, 병렬 자식과 충돌한다 (9회 재발 이력) | **높음** | 낮음 | §3.7 forward-only 상향을 따르되, C0가 먼저 착지하면 이 브랜치는 version 선언을 **철회**한다. PR 진입 직전 재계산 의무 |
| 4개 마일스톤이 CHANGELOG를 공유 소유해 병렬 자식과 머지 비용이 생긴다 | 중 | 낮음 | 우산 Risk 표의 완화(릴리스 컷까지 미확정 누적)를 그대로 상속 |

## References

- 우산 PRD: [harness-wiring-integrity.prd.md](harness-wiring-integrity.prd.md) — C1 행
- 근거 조사 A절(층위 분리 + 정정 이력): [2026-08-31-final-harness-assessment-and-umbrella-prd.md](../_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md)
- 기준선 실측: [2026-08-31-baseline-measurements.md](../_meta/data/2026-08-31-baseline-measurements.md)
- 내구성 계약(재봉인 금지 · present-only 규율): CLAUDE.md §3.12
- 얇은 ship receipt의 심의 결정 원문: `.gitignore:26-34`

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*Co-created with user on 2026-09-01. 프레이밍 1-4는 사용자 확인, 소급 처리 결정은 사용자 위임에 따라 조사 결과로 판정.*
