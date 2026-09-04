# mccp 하네스 최종 평가와 우산 PRD 골격 — 무인 자동화·리드타임·계측 3축

**Status**: active
**Date**: 2026-08-31
**Topic**: 외부 평가 세션의 종합 판정 + 우산 PRD 골격 + 지표 설계

> 이 문서는 세 입력의 종합이다 — (1) 본 세션의 기준선 실측
> ([data/2026-08-31-baseline-measurements.md](data/2026-08-31-baseline-measurements.md)),
> (2) 선행 메타 조사 2건, (3) 6렌즈 병렬 조사 + 적대적 검증 + Codex 교차검증
> (원자료 [data/workflow-raw-results.json](data/workflow-raw-results.json)).
> **반증된 finding은 제거했고, Codex의 이견은 은폐하지 않고 Open Decisions로 올렸다.**

---

## Premises

| # | 참조 | 시점 | 무엇을 전제하는가 |
|---|---|---|---|
| 1 | `.claude/receipts/mccp-pr-codex/` | d1db647 | 72건. `resolution` 키는 정확히 `converged`(72) · `rounds`(72) · `accepted`(72) · `rejected`(72) · `open_questions`(72) · `codex_verdict`(50)이다. **`findings` 키는 존재하지 않는다** |
| 2 | `.claude/receipts/mccp-pr-codex/` | d1db647 | `accepted` 비어있지 않음 **1건** · `rejected` **0건** · `open_questions` **1건**. 유일한 사례가 `v0-2-8-task-2-6-1-fix.json`(2026-06, v0.2.8기)이다 |
| 3 | `plugins/mccp/scripts/receipt/write.js:393-394` | d1db647 | `defaultResolution = { converged: true, rounds: 1, ... }` 리터럴 |
| 4 | `plugins/mccp/scripts/lib/work-orchestrator.js:318-326` | d1db647 | `record-step` 서브커맨드가 구현돼 `autoChain.recordStep`에 위임한다 |
| 5 | `plugins/mccp/commands/work.md` | d1db647 | `record-step` 등장 **0회**. orchestrator CLI를 부르는 줄은 `:139` 하나이고 그것은 산문이다 |
| 6 | `plugins/mccp/scripts/lib/msw-metrics/index.js:146` | d1db647 | `invalid_reason: "no live startup producer wired (task_started events not emitted…)"` |
| 7 | `plugins/mccp/scripts/derive/tests/mccp-fixture.test.js` | 2026-08-31 | 346개 중 105개 실행 완료 시점 **PASS 104 / FAIL 1**(`derive/tests/mccp-fixture.test.js`). 파일당 중앙값 ~12초, 전량 외삽 약 69분 |
| 8 | `.github/workflows/` | d1db647 | CI가 실행하는 test 3개 (`pr-phase-guard` · `pr-phase-lock-f11` · `gitignore-provision`) |
| 9 | `plugins/mccp/scripts/lib/plan-review/corpus.js` | d1db647 | `m_binding=0` · `k_binding=0` · `findings_binding=31`. wall-clock은 통과 5건만 산출되고 divergent 33건은 미산출 |
| 10 | `.claude/plans/codex-findings-backlog.md` | d1db647 | 데이터 행 465 · Severity 열 파싱 462 · `[ABSORBED` 32건 → 흡수율 **6.9%** |
| 11 | `plugins/mccp/commands/work.md` | d1db647 | `:224`가 `dispatch-partitions.json`을 쓰고 `:715`가 `dispatch-fleet-partitions.json`을 읽는다 |
| 12 | `.claude/plans/codex-findings-backlog.md` | d1db647 | in-flight 3축(`env-contract-integrity` · `diverse-agent-review` · `multi-session-work-loop-m9`)이 `codex-findings-backlog.md` · `STATE.md` · `CHANGELOG.md`를 공유 소유한다 |

---

## Evidence

### 조사 방법

6개 독립 렌즈(context 아키텍처 · 리드타임 경제 · 감사 채널 · 강제 최전선 · 지표 설계 · PRD 분해)를
`Workflow`로 병렬 투입하고, 각 렌즈 산출물을 별도 적대적 검증자가 반증했다. 반증에 실패한
finding만 남겼다. 이후 **Codex(`gpt-5.6-sol`, `--sandbox read-only`)가 통합 findings를 독립
재검증**했고 `verdict: divergent`(이견 5 · 지지 3 · 신규 5)를 냈다.

렌즈 3(감사 채널)의 검증자가 구조화 출력 재시도 한도를 초과해 워크플로가 중단됐다.
그 축은 본 세션의 직접 실측(전제 1·2·3)으로 대체했으며, **그 실측이 렌즈·Codex 양쪽 주장을
모두 정정했다**(아래 A절).

### A. 감사 채널 — **네 번의 오판 끝에 확정된 것** (초안 전면 개정)

이 축에서 **네 개의 서로 다른 오판**이 있었다. 마지막 정정은 운영자가 제기했고 gitignore
주석이 확정했다. 경위를 남긴다 — 정정을 본문에 흡수하면서 경위를 지우면 이 문서가 비판하는
결함을 재연하게 된다.

| # | 주장자 | 주장 | 실측 |
|---|---|---|---|
| 1 | 선행 메타 조사 B절 | "`findings`는 전부 빈 배열" | `findings` 키 자체가 없다 |
| 2 | 본 세션 초기 판정 | "72/72가 `findings: []`" | 동일 오류 — 존재하지 않는 필드의 공백을 셌다 |
| 3 | Codex 교차검증 | "71 empty + 1 receipt with 3 findings" | 필드명은 틀렸으나 **비어있지 않은 1건을 찾아낸 것은 옳다** |
| 4 | 본 세션 2차 판정 | "슬롯이 있는데 두 달 반 안 채워졌다 = **관행의 소멸**" | **거짓.** 내용은 다른 곳에 durable하게 있고, 얇은 ship receipt는 **심의된 설계**다 |

**확정 사실 — `.gitignore:26-34`가 의도를 명시한다:**

```
# Runtime receipts — 내구성 계약(CLAUDE.md):
#   plan/implement receipt = 세션 진단용 → working-tree only
#   ship receipt(mccp-pr-codex) = 감사 대조 corpus → git-tracked
# 2026-07-22: 부트스트랩 미검토 기본값(mccp-bootstrap.plan.md §11 Q3,
# commit 375157d) 대체. 그 기본값이 감사 자체를 불가능하게 만들었다(E1).
```

즉 2026-07-22의 **심의된 결정**이며, 미검토 부트스트랩 기본값을 대체한 것이다. 그리고
리뷰 내용은 소실되지 않았다 — `.claude/reviews/`가 **git-tracked 80파일**(73 `.md`, 6,760줄)이다.

**층위가 둘로 나뉘어 있다.**

| 층 | 아티팩트 | 내구성 | 담는 것 |
|---|---|---|---|
| 결정 기록 | `mccp-pr-codex/*.json` (72) | git-tracked | verdict · skip · override · 사유 |
| 내용 기록 | `.claude/reviews/*.md` (73) | git-tracked | 라운드별 finding · 흡수/기각 근거 |

**따라서 C1의 설계가 바뀐다.** "receipt에 내용 기록을 복원"이 아니라 **"두 층의 연결 + 내용층의
커버리지"** 다. `write.js`의 `defaultResolution`은 결정 기록층에서 대체로 정당하다.

**남는 진짜 결함 2건** (이것들은 정정에도 살아남는다):

1. **`rounds: 1`은 결정 기록층의 필드인데 거짓이다.** 사유문이 "round 6"을 증언하는 receipt가
   `rounds:1`로 봉인돼 있다. 층위 분리는 라운드 *수*를 결정층에서 빼야 할 이유가 되지 않는다 —
   리드타임 계측의 유일한 기계 소스이기 때문이다.
2. **내용층 커버리지가 45.2%다** — `.claude/reviews/` 73건 중 라운드 구조를 보유한 것이
   33건뿐이고 평균 94줄이다. 그리고 **두 층을 잇는 기계적 링크가 없다** — receipt에
   `review_path`도, review 원문에 `receipt_hash`도 없다. `derive`의
   `receipt-anchored-to-plan` correlation은 20/72다.

`defaultResolution`의 성공 방향 기본값(`converged:true`)은 여전히 **다른 축에서** 문제다 —
배선 누락을 무증상으로 만드는 장치라는 점은 B절에서 유효하다.

### B. 계측 부재의 근인은 "producer에 caller가 없다"

A1(`work-completion`)이 `null`인 이유가 코드로 확정됐다.

- `work-orchestrator.js:318-326`이 `record-step`을 구현하고 `autoChain.recordStep`에 위임한다(전제 4).
- `work.md`에 `record-step`이 **0회** 등장한다(전제 5).
- `work.md`가 orchestrator CLI를 부르는 줄은 `:139` 하나이고, 그것도 실행 블록이 아니라
  *"Between each, query `work-orchestrator.js next-step` and halt if `halt:true`"* 라는 **산문**이다.

즉 v1.33.0이 *"측정 부채 상환 (A1/A2/B3 producer 배선)"* 이라는 제목으로 ship됐는데,
A1의 producer는 여전히 caller가 없다. **Codex가 이 결함을 독립적으로 발견했고**(교차검증
additions 1번) 본 세션이 코드로 확인했다.

이것이 이 저장소의 지배적 실패 모드를 한 문장으로 보여준다: **기계는 만들어지고, 그 기계를
부르는 한 줄이 빠지며, 아무 test도 그 부재를 보지 못한다.** 같은 형태가
`work.md:224` ↔ `:715`의 파일명 불일치(전제 11)에서도 반복된다 — 한 글자 차이로
merge-apply escape 재확인이 조용히 미실행된다.

### C. 리뷰 경제에 수렴 장치가 없다 (재검증 완료)

`plan-review/corpus.js`를 직접 돌린 결과(전제 9):

| 지표 | 값 | 함의 |
|---|---|---|
| quorum M binding | **0건** | 정족수 손잡이가 판정을 바꾼 적이 없다 |
| quorum K binding | **0건** | 같음 |
| findings binding | 31건 | 실제 승인 규칙은 **severity 하나**다 |
| single-pass 우회 | **16 / 32 (50%)** | 차단의 절반이 우회로 통과 |
| wall-clock 산출 | 통과 5건만 | divergent 33건은 **측정 자체가 없다** |
| backlog 흡수율 | **6.9%** (32/465) | 탐지 비용은 매번 지불, 수리 전환은 거의 0 |

wall-clock 5건: 357s ~ 779s (평균 476s ≈ 8분). **그러나 이것은 통과한 것만의 분포다.**
운영자가 겪는 "하루~1주"는 정확히 측정되지 않은 33건 쪽에 있고, 그 구간에 **관측이 없다**.

`MCCP_GATE_ROUND_CAP=3` 설정과 §3.16의 "실무 기본 1라운드" 산문이 이원화돼 있고,
강제는 산문 쪽에 없다.

### D. 강제 최전선 — 실측으로 확정된 것

- **CI 3/346 = 0.87%**(전제 8). 전량 실행 시 약 69분, **8-shard면 약 9분**(전제 7의 파일별 시간에서 산출).
- test 실제 상태: 105개 실행 시점 **104 PASS / 1 FAIL**. 저장소는 red가 아니다 —
  **green인데 아무도 안 돌린다**가 정확하다.
- `git push` / `gh pr create`를 막는 hook이 없다. terminal ship gate의 `exit 12`는
  `pr.md` 본문 블록이 호출해야만 실행된다.

### E. Codex 교차검증 — 이견 5건 (은폐하지 않는다)

`verdict: divergent`. 지지 3 · 이견 5 · 신규 5.

| # | 대상 | Codex 입장 | 본 문서 처리 |
|---|---|---|---|
| 1 | `F1-shell-state-loss` (medium) | REVIEW_DIR 18회 재파생은 사실이나 JSON artifact fresh-shell 계약이 이미 있으므로 "무인 자동화 불가"의 직접 증거가 아니다. 인과와 severity 과장 | **수용.** 내부 검증자도 독립적으로 같은 강등을 냈다("재파생은 비용이지 차단이 아니다"). 아래 근인 목록에서 제외하고 비용 축으로만 유지 |
| 2 | `F5-state-fragmentation` (medium) | `state-writer.js:624`가 이미 state journal을 권위 투영층으로 통합. santa ledger와 evidence ledger는 다른 감사 도메인이라 실제 충돌 없음 | **수용.** "통합 SoT 부재"를 결함으로 세우지 않는다 |
| 3 | `F6-unattended-metric` (low) | A1 정의는 존재한다(`msw-metrics/index.js:38`). "전혀 없다"가 아니라 "운영 산출 불가"가 정확 | **수용.** B절을 그 문언으로 썼다 |
| 4 | `R1-detached-runner-generalization` (**high**) | `plan-codex-runner`는 Codex 장시간 실행·nonce·receipt 봉인 전용이며 **일반 command fence의 대체물이 아니다**. "400줄 절감" 근거 부재, effort는 L이 아니라 **XL** | **수용, 권고에서 삭제.** 가장 값비싼 오판을 막았다 — 이 권고를 그대로 PRD에 넣었으면 XL 작업을 L로 예산하고 착수했을 것이다 |
| 5 | `M1-재파생 빈도` (medium) | 구현 세부이며 무인 완주율·blocking phase를 측정하지 못하므로 **핵심 성공 지표로 부적합** | **수용.** 5대 지표에서 제외 |

**Codex 신규 지적 5건**: (1) `record-step` 0회 배선 누락 — *본 세션이 코드로 확인, A절·B절의
근간이 됨*. (2) 버전 드리프트(v1.33.1 vs baseline v1.33.0 인용). (3) receipt findings 주장
불일치 — *양쪽 다 틀렸고 실측이 정정*. (4) **R1·R2가 둘 다 `plan.md`를 수정하므로 둘 다
`parallel_safe=true`일 수 없다** — *아래 병렬 그룹 설계에 반영*. (5) Phase 4 bypass에는
직접 plan 호출의 확인 유지 · work-scoped bypass · Phase 5/receipt 강제 실행을 검증하는
acceptance test가 필수.

---

## Prior Art

**미조사.** 외부 문헌 조사를 이 사이클에서 수행하지 않았다. 판정 근거는 전부 저장소 실측과
Codex 교차검증이다. 리뷰어 이질성 축의 문헌 근거는
[diverse-agent-review-analysis.md](diverse-agent-review-analysis.md)가 이미 보유한다.

## Precedent

- [2026-08-31-harness-instability-and-command-bloat.md](2026-08-31-harness-instability-and-command-bloat.md) —
  본 문서가 그 B절(감사 채널)을 A절로 **재정정**하고, backlog 분모를 465로 정정한다.
  방향 5(명령 본문 다이어트)가 유일한 신규 축이라는 판정은 유효하되 `plan.md` 소유권이
  PRD A와 겹친다는 제약이 추가된다(Codex 신규 4번).
- [2026-08-31-remaining-issue-disposition.md](2026-08-31-remaining-issue-disposition.md) —
  PRD A/PRD B 2축 병렬 판정은 렌즈 6이 독립 재검증해 **유지**된다.
- [2026-08-12-review-loop-meta-analysis.md](2026-08-12-review-loop-meta-analysis.md) —
  "계측 부재"가 근인이라는 판정 → 선행 조사가 "계측은 붙었는데 소비 회로가 없다"로 한 겹
  안쪽을 지목 → **본 조사는 다시 한 겹 안쪽을 지목한다: 소비 회로 이전에 producer의
  caller가 없다.** 세 층이 순차적으로 열린 것이지 앞의 판정이 무효화된 것이 아니다.
- [2026-08-12-prd-decomposition-addendum.md](2026-08-12-prd-decomposition-addendum.md) —
  판정 3a(병렬 가능성은 파일 소유권이 정한다)를 아래 병렬 그룹 설계에 그대로 적용한다.

---

## Verdict

### 1. 근인은 하나다 — **"배선되지 않은 기계"**

세 가지 증상이 같은 뿌리를 갖는다.

> **이 저장소는 기계를 만드는 데는 능하고, 그 기계를 부르는 한 줄을 빠뜨리며,
> 그 부재를 볼 수 있는 test가 없다.**

| 증상 | 실측 | 빠진 한 줄 |
|---|---|---|
| A1 지표가 `null` | `record-step` 0회 호출(전제 4·5) | `work.md`에 orchestrator 호출 블록 |
| 감사 corpus에 리뷰 내용 없음 | 내용 기록률 1.4%(전제 2) | 게이트 runner → `write.js`의 `accepted`/`rejected`/`open_questions` 전달 |
| merge-apply escape 미실행 | 파일명 불일치(전제 11) | `dispatch-partitions.json` 철자 |
| 리뷰 손잡이 무력 | M·K binding 0(전제 9) | 손잡이를 강제하는 코드(또는 손잡이 제거) |

**성공 방향 기본값이 이 실패 모드를 무증상으로 만든다.** `defaultResolution`이 `converged:true,
rounds:1`을 채워 넣기 때문에, 배선이 끊겨도 산출물은 정상 형상이다. 같은 패턴이
`schema.js`의 `security_skipped:false`에도 있다.

그리고 CI 0.87%가 이 전부를 잡지 못하게 만든다 — **test는 있고 green이다. 아무도 안 돌린다.**

### 2. 무인 자동화의 진짜 병목은 context가 아니다

운영자가 "가장 큰 이슈"로 지목한 context 문제를 렌즈 1이 조사했고, **Codex와 내부 검증자가
독립적으로 같은 강등을 냈다**: 셸 상태가 도구 경계를 못 넘는 것은 사실이고 `plan.md`에서
`REVIEW_DIR`을 18회 재파생하지만, `/mccp:work`와 `work-orchestrator.js`가 JSON artifact
계약으로 이미 우회하고 있다. **재파생은 비용이지 차단이 아니다.**

무인 완주를 실제로 막는 것은 둘이다.

1. **`plan.md` Phase 4 "WAITING FOR CONFIRMATION"** — `work.md:139`의 "No inter-step user
   confirmation" 무인 계약과 정면 충돌한다. 라이브 full-chain 완주 로그가 없어 어느 쪽이
   실제로 이기는지 **아무도 모른다**. 두 선행 조사도 이것을 미판정으로 남겼다.
2. **무인 완주율 자체가 관측되지 않는다** — `/mccp:work`가 사람 개입 없이 끝난 비율이
   0건 기록이다. 목표를 표방하면서 그 목표의 달성도를 재는 숫자가 없다.

따라서 처방의 1순위는 "context 아키텍처 재설계"가 아니라 **"Phase 4 충돌 해소 + 무인
완주율 계측"** 이다. 훨씬 싸고 훨씬 직접적이다.

### 3. 리드타임을 1차 제약으로 만드는 설계

운영자 요구("deadline이 최우선")를 기계 불변식으로 바꾸는 경로는 셋이다.

- **관측 복구가 선행이다.** 지금은 통과한 5건만 wall-clock이 있고 비수렴 33건은 없다.
  "하루~1주"가 실재하는지조차 corpus로 증명할 수 없다. `corpus.js`가 divergent 레코드의
  `recorded_at` / `responded_at`에서 벽시계를 역산하도록 확장하는 것이 첫 작업이다.
- **시간 예산을 게이트화한다.** 라운드 N이 임계(예: 통과 중앙값 8분의 2배)를 넘으면
  자동으로 (a) single-pass 강제 (b) scope 축소 (c) backlog 이연 중 하나로 분기한다.
  §3.16의 "1라운드 기본"이 산문이 아니라 벽시계 불변식이 된다.
- **`MCCP_GATE_ROUND_CAP=3`과 §3.16의 이원화를 끝낸다.** 캡을 1로 내리거나, 3을 유지하되
  "천장이지 목표가 아니다"를 코드가 강제하도록 한다. 둘 중 하나여야 한다.

### 4. 우산 PRD 골격

**우산은 쓰되 "인질 비용"을 피한다** — `review-loop-trust`가 자식 7개 ship 후에야 아카이브된
선례가 있다. 아래 구조는 **자식이 우산과 독립적으로 ship·아카이브되고, 우산은 색인 역할만
한다**(§3.11 C2를 위반하지 않도록 우산 자신의 milestone 표는 자식의 상태를 미러링만 한다).

#### 제목: `harness-wiring-integrity` — 배선되지 않은 기계를 닫는다

**Problem**: 이 저장소는 게이트 기계를 만들고 그것을 부르는 한 줄을 빠뜨리며, CI 0.87%가
그 부재를 보지 못한다. 결과적으로 (a) 감사 corpus가 리뷰 내용을 1.4%만 담고, (b) 자기 지표
10개 중 4개만 산출되며, (c) 리드타임이 관측되지 않아 deadline을 제약으로 걸 수 없다.

**Goal**: 게이트가 한 일이 기록되고, 기록이 지표가 되고, 지표가 deadline 결정을 바꾼다.

**Non-goals**: 리뷰 품질 향상 · 새 게이트 추가 · context 아키텍처 재설계(근인 아님) ·
cross-model 전략 재검토(`diverse-agent-review` 소관).

#### 자식 PRD와 병렬 그룹

| ID | 제목 | Outcome | 소유 파일 (배타) | 그룹 | 선행조건 |
|---|---|---|---|---|---|
| **C1** | `review-record-linkage` (A절 정정 반영) | (a) `rounds`가 실제 라운드를 담는다 (b) receipt ↔ `.claude/reviews/` 양방향 링크 (c) 내용층 라운드 구조 커버리지 45.2% → 100%. **얇은 ship receipt 설계는 유지한다** — gitignore §26-34의 심의된 결정 | `receipt/write.js` · `lib/plan-codex-runner.js` · `lib/codex-runner.js` · `lib/plan-review/record.js` + 그 test | **1** | 없음 |
| **C2** | `orchestrator-step-wiring` | `work.md`가 `record-step`을 실제로 호출한다. 무인 완주율(A1)이 `null`에서 벗어난다 | `commands/work.md` · `lib/work-orchestrator.js` · `lib/auto-chain.js` + test | **1** | 없음 |
| **C3** | `ci-full-suite` | CI가 346개 test를 8-shard로 약 9분에 실행한다. `mccp-fixture.test.js` 1건 red 해소 | `.github/workflows/*` · `derive/tests/mccp-fixture.test.js` | **1** | 없음 |
| **C4** | `leadtime-observability` | divergent 33건의 wall-clock이 복원되고, 마일스톤 e2e 리드타임이 산출된다 | `lib/plan-review/corpus.js` · `lib/msw-metrics/e2e-leadtime.js` · `msw-metrics/index.js` | **1** | 없음 |
| **C5** | `plan-artifact-contract` (= 선행 조사 PRD A / issue #127) | Validate 줄이 '게이트 계약'으로 재정의되고 L1 C4가 내용을 검사한다 | `commands/plan.md` (`:451-525` 한정) · `lib/plan-review/l1-check.js` + test | **2** | C1 (receipt 계약 확정 후) |
| **C6** | `santa-surface-acceptance` (= 선행 조사 PRD B / issue #130) | 무인 push에 human-gate + 브랜치 가드. 리뷰어 `out_of_scope_observations[]` 버킷 | `commands/santa-loop.md` · `lib/santa/{gate,adjudication,seal}.js` · `agents/code-reviewer.md` + test | **2** | 없음 (완전 독립) |
| **C7** | `deadline-timebox` | 라운드 벽시계 임계 초과 시 자동 분기. `MCCP_GATE_ROUND_CAP`과 §3.16 이원화 해소 | `lib/plan-review/decide.js` · `lib/review-policy.js`(신설) · CLAUDE.md §3.16 | **3** | C4 (관측 없이 임계를 못 정한다) |
| **C8** | `command-body-diet` (= 선행 조사 방향 5) | `plan.md` 3,044줄을 블록→CLI 치환으로 절반 이하. 회고 주석은 `gate-design.md` 앵커로 이전 | `commands/plan.md` (전체) · `lib/instruction-contract/lint.js` | **4** | **C5 머지** (같은 파일) |
| **C9** | `decision-precedent-corpus` | halt를 계측하고(M1) 선례를 검색해 제시하며(M2) 가역적 halt에 한해 자동 진행한다(M3). **결정 대행이 아니라 대기 제거가 목표** | `lib/halt-ledger/*`(신설) · `lib/msw-metrics/halt-rate.js`(신설) · `commands/work.md`(계측 지점만 — C2와 조율) | **2** | **C2** (배선 선행) |

#### 착수 DAG

```
그룹 0 (안전의 전제 — 사용자 체감 변경의 선행조건):
  C0 release-channel-separation   ← §7. 없으면 C5·C6·C7·C8 착수 불가

그룹 1 (즉시 병렬, 파일 완전 분리 — C0와도 병렬):
  C1 review-record-linkage ────┐   배포 위험 낮음
  C2 orchestrator-step-wiring ─┤   배포 위험 중간 (fail-open 필수)
  C3 ci-full-suite ────────────┼─> 배포 위험 0 (미배포 표면)
  C4 leadtime-observability ───┘   배포 위험 낮음

그룹 2 (C0 착지 후 — 여기부터 사용자 체감):
  C5 plan-artifact-contract   (C0 + C1 이후) ──┐  dark ship 필수
  C6 santa-surface-acceptance (C0 이후)       ─┤  dark ship 필수
  C9 decision-precedent-corpus M1 (C2 이후)   ─┼─> 그룹 3
                                                │
그룹 3:  C7 deadline-timebox  (C0 + C4 이후) ──┘  dark ship 필수
그룹 4:  C8 command-body-diet (C5 머지 후 — plan.md 단독 소유)
                                                  dark ship 불가 →
                                                  relocation ledger + lint가 릴리스 차단 조건

병행 in-flight (본 우산 밖, 머지만 대기):
  env-contract-integrity · diverse-agent-review · multi-session-work-loop-m9
```

**동시 착수 가능 최대치가 6개로 늘었다** — C0·C1·C2·C3·C4는 파일이 완전히 분리되고,
C6은 C0 착지만 기다린다. C0 자체가 manifest 1파일 + README + 신규 문서라 가장 가볍다.

**동시 착수 가능 최대치는 5개**(C1·C2·C3·C4·C6)다. C6은 그룹 2로 표기했으나 소유 파일이
어느 축과도 겹치지 않아 실제로는 그룹 1과 동시 착수해도 된다.

**Codex 신규 4번 반영**: C5와 C8은 둘 다 `plan.md`를 수정하므로 **병렬 불가**다.
C5는 `:451-525` 템플릿 절만 소유하고 C8은 전체를 재구성하므로, C8을 C5 머지 뒤로 직렬화했다.

**in-flight 3축과의 충돌**: 세 브랜치가 `codex-findings-backlog.md` · `STATE.md` ·
`CHANGELOG.md`를 공유 소유한다(전제 12). 본 우산의 자식 중 그 셋을 소유하는 것은 없으나,
**모든 자식이 `CHANGELOG.md`와 `plugin.json`을 건드린다** — §3.7 forward-only 재번호가
자식 수만큼 발생한다. 이것이 병렬화의 실제 세금이며 아래 Open Decisions 1번이다.

### 5. 지표 — 운영자용 한 화면 5개 숫자

Codex 이견 5번을 반영해 "셸 재파생 빈도"를 제외하고, 목표(무인 자동화)와
제약(deadline)에 직결되는 것만 남겼다.

| # | 지표 | 정의 (분자/분모) | 오늘 값 | 목표 | producer |
|---|---|---|---|---|---|
| 1 | **무인 완주율** | 사람 개입 없이 `done`에 도달한 `/mccp:work` 실행 / 전체 실행 | **미측정** | 측정 개시 → 상승 | C2가 배선 (`record-step`) |
| 2 | **마일스톤 e2e 리드타임** | ship 커밋 시각 − work 진입 시각 (p50/p90/max) | git 근사 4~18일 | p90 ≤ 3일 | C4 (`msw-metrics/e2e-leadtime.js`) |
| 3 | **receipt 내용 기록률** | 리뷰 내용을 담은 receipt / 전체 ship receipt | **1.4%** (1/72) | 100% | C1 (`write.js` 배선) |
| 4 | **단일통과 우회율** | single-pass로 통과한 차단 / 전체 차단 | **50%** (16/32) | < 20% | 기존 receipt meta 집계 |
| 5 | **CI 강제 커버리지** | CI가 실행하는 test / 전체 test | **0.87%** (3/346) | 100% | C3 |

**halt 축 2개 (C9 M1이 산출) — 리드타임의 미관측 구간**

| 지표 | 정의 | 오늘 | 왜 필요한가 |
|---|---|---|---|
| **halt율** | 사람 개입으로 멈춘 `/mccp:work` 실행 / 전체 실행 | **미측정** | 무인 완주율의 역상이되 *어느 phase에서* 멈췄는지를 담는다 |
| **halt당 차단 벽시계** | 질문 emit ~ 사용자 응답 (p50/p90) | **미측정** | **리드타임의 실제 구성요소.** 패널 통과분은 평균 8분인데 마일스톤은 하루~1주다 — 그 차이의 대부분이 계산이 아니라 **대기**일 가능성이 높고, 그 구간에 관측이 없다 |

**보조 지표 3개** (즉시 산출 가능, 대시보드 2열):

| 지표 | 오늘 값 | 비고 |
|---|---|---|
| backlog 흡수율 | 6.9% (32/465) | 상태 열이 없어 closure 추적 불가 — C1과 함께 열 추가 검토 |
| evidence chain coverage | 0.568 (`evidence-audit` exit 4) | 상시 비영점 baseline이라 신호가 안 된다 |
| 자기 지표 산출률 | 4/10 computed | A3는 `integrity_ok:false` |

**나중에 가능한 것 2개** (지금 설계만):

- **finding 신규성 비율** (1~2주) — 라운드 N+1의 신규 finding / N+1 전체.
  라운드 폭주가 "새 축을 여는가, 앞 라운드의 수정을 겨냥하는가"를 가르는 유일한 정량 신호.
  `.claude/reviews/` 72개 원문 1회 스캔으로 baseline 수집 후 자동화.
- **finding 사후 적중률** (3개월) — 흡수한 finding 중 revert/재발이 없었던 비율.
  **리뷰 기계가 실제로 결함을 잡는지의 유일한 ground truth**이고, deadline 제약 환경에서
  "이 리뷰가 비용인가 가치인가"를 증명해야 다음 투자가 정당화된다.

#### 소비 회로를 함께 설계한다 (이것이 빠지면 또 계측 부채가 된다)

선행 조사가 "계측이 붙었는데 소비 회로가 없다"를 지목했다. 위 5개는 각각 **읽는 주체와
바꾸는 행동**이 명시돼야 한다.

| 지표 | 읽는 주체 | 무엇을 바꾸는가 |
|---|---|---|
| 1 무인 완주율 | `/mccp:work` 진입 배너 | 하락 시 어느 phase가 막았는지 표시 |
| 2 리드타임 | `STATUS.md` 대시보드 상단 | p90 초과 시 C7 timebox 임계 재조정 |
| 3 내용 기록률 | `validate-cmd` 경고 | 100% 미만이면 stderr WARN (차단 아님) |
| 4 우회율 | 주간 리포트 | 20% 초과 시 라운드 정책 재검토 |
| 5 CI 커버리지 | PR 체크 | 100% 미만이면 머지 차단 |

---

### 6. halt 자동화 — 운영자 제안과 본 조사의 이견

**운영자 제안**: `/mccp:work`가 open question으로 멈추는 것이 무인화의 최대 장애다. 완전
자동화를 하려면 그 판단조차 Claude가 해야 하므로, 과거 사용자의 의도·판단을 **학습**해
대신 결정하는 지표·자료를 사전에 수집하자.

**동의하는 부분**: halt가 진짜 병목이라는 진단과, 결정기를 만들기 **전에** 데이터를 모으자는
순서. 후자는 특히 옳다 — 이 저장소의 지배적 실패(§1 근인)를 정확히 뒤집는 순서다.

**이견 4건** — 근거와 함께 기록한다.

**이견 1 — 이 규모에서 성립하는 것은 학습이 아니라 검색이다.**

| 소재 | 실측량 | 결함 |
|---|---|---|
| `## User Intent` UI 제약 | **461행** (plan 176건 중 41건 = 23.3%) | kind: constraint 183 · exclusion 155 · direction 120 · exception 3 |
| PRD Open Questions | **231항목** (41 PRD 전부 보유) | **해소 기록 필드가 없다** |
| STATE.md 커밋 | 156 | Last Decision이 자유 서술 |

692개 표본은 정책 학습에 두 자릿수 부족하고, 더 결정적으로 **결과 라벨이 0**이다. 과거 판단이
옳았는지가 어디에도 없다. 라벨 없는 데이터로 가능한 것은 학습이 아니라 **모방**이고,
`complete (인정 조건 미충족)`으로 ship된 마일스톤이 실재하는 corpus에서 모방은 오판을 함께
인코딩한다. 이 규모에서 되는 것은 **선례 검색 + 인용**이며, 산출이 예측이 아니라 인용이라
감사 가능하다. 이는 `intent-context.js`(§3.13)가 이미 채택한 아키텍처다.

**이견 2 — halt의 상당수는 판단 부재가 아니라 계약 부재의 결과다.**
`plan.md:503`의 Validate가 자유 문자열, `:514-518` Acceptance가 상수 boilerplate,
`l1-check.js` C4가 정규식 존재만 검사한다. backlog에 acceptance 계약 결함이 6개 PRD에 걸쳐
23행 이상이다. 산출물이 "done"을 명시하지 않으면 세션은 물을 수밖에 없다. **계약을 조이면
(C5) 질문은 답해지는 것이 아니라 발생하지 않는다.** 반증 가능한 예측: *C5만으로 halt의
상당 비율이 사라진다.* C9 M1이 이 예측을 반증하거나 확증한다.

**이견 3 — "0 halt"를 목표로 두면 안 된다.**
사용자는 비즈니스 의도의 유일한 원천이다. 다음 주 deadline이 당겨진 것을 461행이 알려주지
않는다. "Claude가 전부 판단한다"로 목표를 세우면 시스템은 구조적으로 알 수 없는 것을
자신 있게 결정하고 **그 실패는 조용하다** — 이 저장소의 서명 실패 모드다.

대신 halt를 (a) 기록으로 답 가능 / (b) 새 의도 필요로 가르고, **(b)를 자동 진행하지도
차단하지도 않는다**: 가역적 기본값 채택 → 산출물에 가정 stamp → 질문 큐잉 → 계속 진행.
사용자는 batch로 답한다. **판정 기준은 확신도가 아니라 가역성이다.** 대기를 0으로 만드는 데
정확한 판단은 필요 없고 되돌릴 수 있는 판단이면 충분하다. 이는 present-only 감사 필드 ·
fail-closed · backlog 이연이라는 저장소 관용구와 정합한다.

**이견 4 — 새 수집기 이전에 기존 수집물이 소비되지 않는 이유를 닫아야 한다.**
메타 조사 3층이 순차적으로 지목했다: 계측 부재 → 소비 회로 부재 → **producer에 caller 부재**.
지금 새 producer를 추가하면 base rate상 A1·A2·B2·C2·C3와 함께 `null`이 된다. 그리고
**수집기는 이미 있다** — 231개 Open Questions에 해소 필드만 없다.

#### C9 마일스톤 (각 단계가 다음 단계의 투자를 반증할 수 있게 배치)

| M | 이름 | 하는 일 | 이 단계가 결정하는 것 |
|---|---|---|---|
| M1 | halt 계측 (**결정 0건**) | 체인이 사람 때문에 멈추는 모든 지점을 기록: 게이트 · phase · 질문 원문 · 산출물 경로 · 사용자 답변 · **차단 벽시계** · 분류(계약공백 / 선례있음 / 신규의도) | 2~4주 실데이터의 base rate. **"계약공백"이 다수면 M2·M3은 불필요하고 답은 C5다** |
| M2 | 선례 검색 (**대행 아님**) | halt 시 UI 제약 461행 + 해소된 OQ를 조회해 **인용과 함께** 제시. 사람이 여전히 결정하되 빨리 결정 | 선례 적용 가능 비율 → M3의 상한 |
| M3 | 가역성 기반 자동 진행 | (선례 존재) ∧ (가역 — push 없음 · 외부 부작용 없음 · 산출물 한정)일 때만 선례 기본값 + 가정 stamp + 질문 큐잉 + 진행. **비가역 행동엔 절대 미적용** | — |

M1의 산출물이 `halt-ledger`이며, 이것이 위 지표 표의 halt율 · 차단 벽시계를 낳는다.

---

### 7. 실사용자 제약 — 배포 채널과 blast radius

운영자가 제기했다: mccp에 실사용자가 있고, marketplace가 main 기준으로 배포되므로
(a) 게이트 수정이 매번 사용자에게 나가 품질 저하·오류를 겪게 하고, (b) 실측 확인을 하려면
main에 배포해야 한다.

#### 7.1 "main = production"은 제약이 아니라 **현재의 설정값**이다

현행 `.claude-plugin/marketplace.json`:

```json
{ "name": "mccp", "plugins": [ { "name": "mccp", "source": "./plugins/mccp" } ] }
```

`source`가 **상대 경로**라 marketplace 저장소의 체크아웃(=main)에 대해 해소된다. 그래서
main 머지가 곧 릴리스가 된다.

**그러나 marketplace 스키마는 ref 고정을 지원한다.** 공식 marketplace
(`~/.claude/plugins/marketplaces/claude-plugins-official/`) 291개 항목의 `source` 형태 전수:

| 형태 | 건수 |
|---|---|
| `{sha, source, url}` | 149 |
| `{path, ref, sha, source, url}` | **84** |
| 문자열(상대 경로) | 53 |
| `{path, sha, source, url}` | 5 |

실제 예시 — **태그로 고정한 릴리스**가 실재한다:

```json
{"source":"git-subdir","url":"https://github.com/42Crunch-AI/claude-plugins.git",
 "path":"plugins/api-security-testing","ref":"v1.5.5","sha":"30287f5e…"}
```

따라서 처방은 manifest 한 줄이다:

```json
{ "source": "git-subdir", "url": "https://github.com/idenn207/mccp.git",
  "path": "plugins/mccp", "ref": "release" }
```

**main은 dogfood trunk가 되고, `release` ref가 사용자 채널이 된다.** 릴리스는
검증된 main 커밋으로 `release`를 fast-forward하는 행위가 된다.

manifest 자체는 main에 남지만 문제가 아니다 — 공식 marketplace가 정확히 그 구조다
(main = 색인, ref = 페이로드). 그리고 **롤백이 처음으로 생긴다**: 현재 태그가
`v1.0.0` **1개뿐**이라 사용자가 `claude plugin update`를 돌린 뒤 되돌릴 경로가 없다.
ref 고정이면 롤백은 manifest 한 줄 되돌리기다.

> **미검증 1건**: 이 환경에서 `claude` 바이너리가 PATH에 없어(SessionStart hook ENOENT)
> `/plugin marketplace update`가 `source` 타입 변경을 어떻게 처리하는지 실측하지 못했다.
> **채택 전 라이브 검증 1회가 필요하다.**

#### 7.2 "실측하려면 배포해야 한다"는 절반만 참이다

두 가지가 뭉뚱그려져 있다.

| 요구 | 배포 필요? | 근거 |
|---|---|---|
| (a) 코드가 사용자 캐시 경로에서 로드되는지 | **불필요** | `installed_plugins.json`의 `installPath`를 worktree로 향하게 하거나 로컬 디렉토리를 별도 marketplace로 add하면 된다. 이 저장소가 이미 "cache 직접 copy" workaround를 매 cycle 반복하고 있다(CLAUDE.md §3.7) — 그것이 **로컬 설치 채널이 필요하다는 증상**이다 |
| (b) 실제 마일스톤을 완주해야 나오는 계측 | 실사용 필요 | 그러나 **그 실사용자는 운영자 자신이면 된다.** 타인에게 배포할 필요가 없다 |

즉 **dogfood 채널(로컬 설치 → worktree/main) + release 채널(ref 고정)** 두 개면 (a)와 (b)가
모두 충족되고 사용자는 노출되지 않는다. C9 M1의 halt 계측도 운영자 자신의 사이클에서 나온다.

#### 7.3 배포 표면은 46%다 — blast radius가 생각보다 작다

`marketplace.json`의 `source`가 `./plugins/mccp`이므로 **그 하위만 배포된다.**

| | tracked 파일 |
|---|---|
| `plugins/mccp/` (배포) | **876** |
| 저장소 전체 | 1,902 |
| `.github/` · `.claude/` · `docs/` · `CLAUDE.md` · `CHANGELOG.md` (미배포) | 1,017 |

**C3(ci-full-suite)는 사용자에게 아예 가지 않는다.** `.github/`는 배포 표면 밖이다.
즉 5축 중 하나는 릴리스 위험이 **0**이고 채널 논의와 무관하게 지금 main에 넣어도 된다.

#### 7.4 자식별 blast radius — **배포 순서는 병렬 실행 순서와 다르다**

| 자식 | 배포 표면 | 사용자 체감 | 위험 | dark ship 가능? |
|---|---|---|---|---|
| C3 `ci-full-suite` | **미배포** | 없음 | **0** | n/a |
| C4 `leadtime-observability` | 배포 | 없음 (read-only 계측) | 낮음 | 불필요 |
| C9 M1 halt 계측 | 배포 | 없음 (append-only 로깅) | 낮음 | 불필요 |
| C1 `review-record-linkage` | 배포 | 낮음 (필드 additive) | 낮음 — 단 `rounds` 값 변경이 하류(dedupe · ledger)에 미치는 영향 확인 필요 | 불필요 |
| C2 `orchestrator-step-wiring` | 배포 | **중간** — `/mccp:work` 실행 경로 변경 | 중간 — `record-step` 실패가 체인을 멈추면 안 된다(**fail-open 필수**) | 권장 |
| C6 `santa-surface-acceptance` | 배포 | **높음** — 기존 무인 push가 멈춘다 | **높음** — 사용자가 의존하던 자동화의 제거 | **필수** |
| C5 `plan-artifact-contract` | 배포 | **높음** — 통과하던 plan이 거부된다 | **높음** — l1-check 강화가 기존 사용자 plan을 막는다 | **필수** |
| C7 `deadline-timebox` | 배포 | **높음** — 게이트가 시간으로 중단된다 | **높음** | **필수** |
| C8 `command-body-diet` | 배포 | **최고** — `plan.md` 전면 재구성 | **최고** — 산문 의무가 조용히 죽는 파손을 현행 static test가 못 잡는다 | **불가능** |

**C8은 dark ship이 구조적으로 불가능하다.** 재작성된 명령 본문은 로드되거나 안 되거나 둘뿐이고
토글로 절반만 적용할 수 없다. 따라서 C8의 유일한 안전장치는 선행 조사가 조건으로 못박은
**relocation ledger + lint before-state 파라미터화**이며, 이 제약은 "있으면 좋음"이 아니라
**릴리스 차단 조건**으로 격상된다.

#### 7.5 처방 — dark ship에 **만기**를 붙인다

이 저장소는 이미 dark ship 패턴을 갖고 있다(`MCCP_PLAN_REVIEW_L3` 기본 `off`).
그러나 토글 146개가 그 자체로 부채이고, `MCCP_DISABLED_HOOKS`는 "for local debugging"으로
도입돼(`36fb0d5`, 2026-06-17) **2.5개월 영구화**됐으며 diff에 사유가 없다.

따라서 규율은 "dark ship하라"가 아니라 **"dark ship하되 만기를 붙여라"** 다.

- 행동을 바꾸는 자식은 **기본 off 토글**과 함께 ship한다.
- 그 토글은 영구 설정이 아니라 **릴리스 밸브**이며, 등록 시점에 **제거 마일스톤**을 함께 명시한다.
- 만기 없는 신규 토글은 `env-contract` lint가 거부한다 — `EVIDENCE_DEBT_CEILING`(상수 + 짝 test)
  선례를 그대로 쓴다. 이러면 채널 분리가 토글 부채를 늘리는 방향으로 되갚지 않는다.

#### 7.6 릴리스 케이던스 — 주 2~3회에서 2~3주 1회로

현재 주당 2~3 마일스톤이 곧 **주당 2~3 릴리스**다. 사용자 관점의 불안정은 대부분 여기서 온다.
채널을 나누면 **main은 빠르게, release는 느리게** 갈 수 있다.

권고: release는 **PRD 단위**로 자른다. §3.7의 bump 기준(PRD 전체 완료 = minor)과 이미 일치하므로
새 규칙이 아니라 **기존 규칙을 릴리스 경계로 승격**하는 것이다. 결과적으로 사용자 노출이
주 2~3회에서 2~3주 1회가 되고, 그 사이 main에서 dogfood 사이클이 정상 속도로 돈다.

#### 7.7 이 절이 우산 PRD에 추가하는 것

**C0 `release-channel-separation`을 그룹 0(모든 것의 선행)으로 신설한다.**

| M | Outcome |
|---|---|
| 1 | `marketplace.json`을 `git-subdir` + `ref: release`로 전환. `release` 브랜치 생성 후 현재 사용자 버전(1.33.x)에 고정. **라이브 검증 1회 포함**(7.1 미검증 항목) |
| 2 | 로컬 dogfood 채널 문서화 — worktree를 가리키는 설치 절차를 `/mccp:setup` 또는 README에 명문화해 "cache 직접 copy" workaround를 은퇴 |
| 3 | 릴리스 런북 — PRD 완료 시 tag + `release` fast-forward + manifest 확인. 롤백 절차 포함 |

소유 파일: `.claude-plugin/marketplace.json` · `README.md` · `docs/release-channel.md`(신설).
**어느 in-flight 브랜치도 이 파일들을 소유하지 않으므로 즉시 착수 가능하다.**

C0가 없으면 C5·C6·C7·C8은 착수할 수 없다 — 그 넷은 사용자가 체감하는 게이트 변경이고
현재는 머지가 곧 배포이기 때문이다. **C0는 병렬화의 전제가 아니라 안전의 전제다.**

---

## Open Questions

운영자가 내려야 할 결정이다. 본 조사는 자리까지만 지목한다.

1. **§3.7 version 재번호를 기계화할 것인가.** 자식 5개를 동시에 열면 `plugin.json` 충돌이
   자식 수만큼 발생한다(9회 재발 이력). 머지 시점에 번호를 결정하는 설계(브랜치는 `0.0.0`
   placeholder, 머지 훅이 확정)가 가능하나, `CHANGELOG` 헤딩·footer 4면 동기와 얽힌다.
   **이 결정 없이 5축 병렬을 열면 병렬화 이득의 상당분을 재번호 비용으로 반납한다.**
2. **`plan.md` Phase 4 확인 정지를 무인 경로에서 어떻게 다룰 것인가.** Codex 신규 5번이
   요구한 acceptance test 3종(직접 plan 호출의 확인 유지 · work-scoped bypass ·
   Phase 5/receipt 강제 실행)이 전제다. C2에 포함할지 별도 자식으로 뺄지.
3. **quorum M·K를 살릴 것인가 버릴 것인가.** binding 0건이므로 유지비만 남은 장식이거나,
   강제를 복원해야 할 미완성 기제다. `diverse-agent-review` #5/#11이 이미 이연 결정을 했으므로
   본 우산이 손대면 충돌한다 — 그쪽에 라우팅하되 **결정 시한**은 정해야 한다.
4. **backlog에 상태 열을 추가할 것인가.** `derive/sources/backlog.js`가 헤더를 4열로 리터럴
   고정하므로 5번째 열은 기존 465행 전부를 파서에서 사라지게 한다. 별도 `closed.md`로
   분리하는 우회가 있다. 닫힘률을 산출할 수 없으면 자기개선을 주장할 수 없다.
5. **`evidence-audit`의 상시 exit 4 baseline을 어떻게 할 것인가.** coverage 0.568이
   개선 목표인지 수용 가능한 상수인지 정하지 않으면, 20번째 dangling이 신호를 만들지 못한다.
6. **C8(명령 본문 다이어트)의 감축 단위.** 선행 조사가 "블록→CLI 치환만" 안전 조건으로 못박고
   선행 조건 둘(lint before-state 파라미터화 · 본문별 relocation ledger)을 명시했다.
   Codex는 유사 작업의 effort를 XL로 봤다. 이 사이클에 넣을지 다음으로 미룰지.

## 이 조사가 보지 못한 것

- **`.claude/reviews/` 72개 원문**을 판독하지 않았다. 리드타임 분해의 가장 직접적인 증거원이고
  C4의 첫 작업이다.
- **`plugins/mccp/agents/` 58개 · `skills/` 47종 본문** — 선행 조사와 동일한 사각.
  패널 wall-clock을 논하면서 그 비용을 쓰는 리뷰어의 지시문을 읽지 않았다.
- **test 전수 실행이 105/346에서 중단**됐다(머신 메모리 고갈). 104 PASS / 1 FAIL은
  30% 표본이며 나머지 241개는 미측정이다.
- **토큰·USD 비용을 재지 않았다.** 지표 설계에는 넣었으나 오늘 값이 없다.
- **선행 조사의 wall-clock 수치(37건 12.14시간 · 최대 427.4분)를 corpus로 재현하지 못했다** —
  본 세션의 `corpus.js` 실행은 통과 5건만 산출했다. 두 수치의 분모가 다르며 어느 쪽이
  맞는지 판정하지 않았다.
