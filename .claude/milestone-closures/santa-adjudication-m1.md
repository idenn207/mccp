# Milestone Closure — santa-adjudication-m1

## Milestone
- ID         : santa-adjudication-m1
- Name       : severity contract + 게이트 재배선
- Plan       : .claude/plans/santa-adjudication-m1.plan.md
- Status     : done
- Closed at  : 2026-08-16T21:13:52.831Z
- Closed by  : /mccp:milestone-close (run_id=cc5ec15a-6e83-4392-aa4b-e472342e7a4b)

## Acceptance Condition
plan `## Acceptance` 5항목 — (1) 전 Task 완료 · (2) Validation 통과(커버리지 25/25, 각 항목에
assert 1개 이상 + 동결 함수 무변경 + 신규 export 존재) · (3) 패턴 미러링 · (4) 이 저장소에서
`/mccp:santa-loop`을 1회 완주해 네 산출물 (a) 구조화 MEDIUM만 낸 FAIL 리뷰어가 NICE로 계수,
(b) `mismatches`가 터미널에 출력, (c) `.claude/reviews/santa-review-santa-adjudication.md` 산출,
(d) `mccp-santa-review` receipt의 `meta.santa_rounds` 봉인을 전부 확인.

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).
조건별 판정과 그 판정이 선 시점은 아래 `## Goal Loop Result`가 갖는다 — 4번째 항목의 (a)·(b)는
본 closure의 `Closed at` 시점에 **미충족이었고, 운영자 판정으로 PRD Open Question에 이연됐다.**

## Goal Loop Result
verdict=done. 운영자 응답: "테스트 25/25 green, (a)(b)는 PRD Open Question으로 이연".

**라이브 `/goal` loop은 돌리지 않았다.** 운영자가 `/goal` 진입 없이 grammar로 직접 판정했고,
acceptance는 정적 증거로 검증했다. 이 사실을 숨기지 않고 기록한다 — closure의 감사 가치는
verdict가 아니라 그 verdict가 무엇을 보고 내려졌는지에 있다.

검증 근거 (2026-08-16 실측, 격리 lock enter 이전 수집):

- 브랜치 상태 — working tree clean · branch `santa-adjudication` · `origin/main..HEAD`가
  `8dab126` "feat(v1.26.1): santa-adjudication M1 — severity contract + blocking-count verdict gate"
  1건(미푸시). PR은 본 closure 이후 별도 `/mccp:pr`이 소유한다.
- 회귀 test — `node --test plugins/mccp/scripts/lib/tests/santa-adjudication.test.js`
  25 pass / 0 fail / 0 skipped. test 이름의 `[1]`~`[25]` 접두가 plan의 커버리지 계약 id이고
  전건이 green이다. 항목 21(유일 소비자가 `decideAdjudicatedVerdict`를 부르고 `decideVerdict`
  직접 호출 0건) · 항목 25(gate와 seal이 `{A,B}` 완전성과 완화 경로 양쪽에서 같은 결론)
  포함.
- 인접 suite 무회귀 — `santa-gate.test.js` + `santa-loop-cap.test.js` 합계 61 tests /
  58 pass / 0 fail / 3 skipped. DD3이 요구한 "동결 함수 `decideVerdict` 무변경"의 증거인
  `santa-gate.test.js:68`("리뷰어 1명 PASS만으로 NICE")이 green을 유지한다.
- version — `plugins/mccp/.claude-plugin/plugin.json` `1.26.1` (CLAUDE.md 3.7 patch 축 —
  PRD 3개 milestone 중 1개 ship).

  **사후 정정 주석 (closure 기록 이후, 관측은 보존)**: 본 closure를 쓴 뒤 `origin/main`을
  rebase한 결과 main이 **같은 `1.26.1`을 gate-guard-integrity M3**(PR #140, `103a940`)에
  이미 발행한 것이 확인됐다. CLAUDE.md 3.7 forward-only 규칙상 발행된 번호는 불가침이므로
  본 milestone은 **`1.26.2`로 상향**됐고, 위 커밋 해시(`8dab126`)도 rebase로 `418f952`가
  됐다. 위 두 줄은 closure 기록 시점의 관측을 그대로 보존한 것이며 사후 값으로 고쳐 쓰지
  않는다 — 아래 Provenance의 `mccp version`도 같은 이유로 기록 시점 값이다. **ship된 실제
  버전은 `1.26.2`이고**, 그것이 `claude plugin update`가 만드는 캐시 디렉토리 이름이다.
- Acceptance 4번째 항목 (c) — `.claude/reviews/santa-review-santa-adjudication.md` 산출 확인
  (648 B).
- Acceptance 4번째 항목 (d) — `.claude/receipts/mccp-santa-review/santa-adjudication.json`에
  `meta.santa_rounds=3` · `santa_cap=3` · `santa_entries=0` 봉인.
  `resolution.review_source="multi-agent"`(UI4) · `review_verdict="converged"` ·
  `review_proof.quorum` `{passed:true, required:2, of:2, responded:2, roles:2}` ·
  `dispatch_evidence`가 위 (c) 리포트를 가리킨다.

미달 항목: 두 개다 — Acceptance 4번째 항목의 (a)와 (b).

- (a) "구조화 MEDIUM만 낸 **FAIL** 리뷰어가 NICE로 계수" — 미재현. 2026-08-17에 캡이 허용하는
  3라운드 전부를 돌렸고(decision slug `santa-adjudication`, 리뷰어 6명 전원 opus) **6명 모두
  `PASS`를 냈다.** `FAIL`을 내면서 blocking을 하나도 못 내는 조합이 성립하지 않았다.
- (b) "`mismatches`가 터미널에 출력" — 3라운드 모두 `mismatches` 0. 불일치 표면이 한 번도
  발화하지 않았다.

**부분적으로 확인된 것은 기록한다**: severity 게이팅 자체는 실경로에서 작동했다. 라운드 1에서
리뷰어 B가 낸 MEDIUM 1건은 실질 `failure_scenario`를 갖췄는데도 `structured:1 / blocking:0`으로
계수됐고 라운드는 NICE를 유지했다. `contract`는 3라운드 모두 `full`이었다.

**이연 판정과 그 근거.** plan `## Acceptance` 4번째 항목의 문언은 "네 산출물이 전부 확인되지
않으면 milestone은 complete가 아니다"이다. 본 closure의 `Status: done`은 그 문언을 충족했다는
주장이 **아니라**, 운영자가 미충족 두 항목을 PRD Open Question으로 이연하기로 내린 명시 판정이다.
그 판정을 정당화하는 관측은 PRD `.claude/prds/santa-adjudication.prd.md`의 Open Question 3번
항목이 이미 소유하고 있으며, 요지는 두 가지다:

1. **구조적 억제** — M1은 게이트(하류)만이 아니라 `santa-loop.md` Step 3의 리뷰어 프롬프트
   (상류)도 함께 바꿨다. 새 문언이 "서술할 수 없으면 `suggestions`로 보내라"고 지시하므로
   문체 지적만 가진 리뷰어는 애초에 `FAIL`을 내지 않는다. 즉 상류가 작동할수록 하류가 완화할
   대상이 사라지고, 관측하려던 시나리오는 상류가 이미 막은 뒤의 잔여다.
2. **두 번째 원인은 같은 사이클에서 닫혔다** — code-review H1 실측대로 `seal.js`의
   `deriveVerdict`·`buildProof`가 FINAL 라운드 리뷰어 전원 `PASS`를 계속 요구하고 있었으므로,
   설령 시나리오가 재현됐더라도 Step 5.5에서 `divergent`로 봉인돼 push가 막혔을 것이다.
   그 축은 닫혔지만, **위 3라운드 표본은 그것이 살아 있는 동안 얻은 것이다.**

따라서 이연은 "관측이 불필요하다"가 아니라 **"현 표본으로는 확정할 수 없고, 재측정의 소유자가
M1이 아니다"**는 판정이다. PRD Open Question이 적은 처방 셋 — 지표를 강등 비율로 교체 ·
대조군 측정을 별도 축으로 · 상류·하류 중 하나만 배송하는 설계로 회귀 — 중 어느 것을 택할지는
미결로 남으며, (1)의 분모는 milestone 2(판정 원장)가 들어올 때 생긴다. 임계를 낮추는 것은
처방이 아니라는 PRD 문언도 그대로 유지된다.

`Status: done`은 그러므로 「구현·검증·회귀 test가 끝났고, 실경로 완주도 네 산출물 중 둘까지
확인됐으며, 남은 둘은 M1이 닫을 수 없는 축으로 명시 이연됐다」는 뜻이다. 「이 문서가 쓰이는
순간 plan의 모든 문언이 이미 충족돼 있었다」는 뜻이 아니다. 전자를 후자로 적으면 closure가
자기 stamp 시점에 대해 거짓을 말하게 된다.

본 closure 직후의 기록 갱신: PRD `## Delivery Milestones` row 1의 status를 `in-progress` →
`complete`로 정정한다. PRD 전체(M2·M3)는 여전히 `pending`이므로 `/mccp:archive-complete`의
archivable 조건(CLAUDE.md 3.11 C2/C3)에 도달하지 않으며, 아카이브는 일어나지 않는다.

## Deviation — plan-body anchor를 싣지 않았다

`/mccp:milestone-close` Phase 4는 이 closure의 sha256을 plan 본문 `## Milestone Closure
Provenance` 섹션에 stamp할 것을 의무화한다(option B custody anchor). **이 milestone에서는
그 stamp를 싣지 않았고, 그 사실을 여기 기록한다.**

**이유 — stamp가 자기 다음 게이트를 차단한다.** stamp는 plan 본문을 바꾸므로
`mccp-plan-codex`·`mccp-implement-codex` receipt의 `plan_hash`가 어긋난다. 실측(2026-08-16,
이 브랜치): stamp **후** `validate --command mccp:pr` → `ok:false`, stale 2건
(`1f77424e…` → `85e4b461…`). stamp를 제거하면 plan hash가 두 receipt가 바인딩한
`sha256:1f77424e0164f92c172a638ac7e821149ddb3cc6b0f7e4c17033e8964f0fe475`로 **정확히**
복귀한다. 즉 stale의 단일 원인이 stamp였다.

**왜 재봉인이 아니라 제거인가.** `receipt/write.js:503`이 이 상황의 재봉인을 명시적으로
거부한다 — "plan changed after L2 reviewed it (DD13) … Recovery: rerun the L2 review against
the current plan — **do NOT reseal, that would certify an unreviewed version**". 이
receipt는 L1 + L2 4인 패널 `review_proof`(quorum 4/4)를 담고 `reviewed_plan_hash`가 옛
값에 묶여 있으므로, 재anchor는 패널이 보지 않은 본문을 승인한 것으로 봉인하게 된다.
`MCCP_RECEIPT_GATE_MODE=soft`는 대안이 아니다 — missing만 통과시키고 stale은 차단한다.

**그래서 잃은 것과 남은 것.** 잃은 것은 "closure 본문이 변조되면 다음 게이트의 plan_hash
mismatch로 검출된다"는 메커니즘이다. 남은 것은 **git**이다 — 이 closure는 `.claude/
milestone-closures/`가 git-tracked이므로 본문 자체가 커밋으로 봉인되고, 변조는 diff로
드러난다. sha256을 형제 파일에 적어 두는 것보다 약하지 않다.

이 결함은 저장소가 이미 알고 있다: [codex-findings-backlog.md](../plans/codex-findings-backlog.md)의
2026-08-16 HIGH 행(`milestone-close.md` Phase 4)이 같은 자기차단을 A/B 실측과 함께 등재했고,
권고한 진짜 수정은 **(b) closure sha256을 plan이 아니라 receipt `meta`에 싣는 것**이다 —
본 이탈은 그 방향과 같다. 그 행이 "현 회피"로 적은 receipt 재anchor는 위 write.js 가드
때문에 택하지 않았다(운영자 판정, 2026-08-16).

## Provenance
- Lock run_id        : cc5ec15a-6e83-4392-aa4b-e472342e7a4b
- Lock owner session : unknown
- Plan source        : .claude/plans/santa-adjudication-m1.plan.md
- Detection signal   : {"row":1,"name":"severity contract + 게이트 재배선","plan":".claude/plans/santa-adjudication-m1.plan.md","status":"in-progress"}
- mccp version       : 1.26.1
