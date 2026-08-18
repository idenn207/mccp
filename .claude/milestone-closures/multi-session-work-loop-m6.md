# Milestone Closure — multi-session-work-loop-m6

## Milestone
- ID         : multi-session-work-loop-m6
- Name       : 진행 상태 기계 판정
- Plan       : .claude/plans/multi-session-work-loop-m6.plan.md
- Status     : done
- Closed at  : 2026-08-17T10:52:02.846Z
- Closed by  : /mccp:milestone-close (run_id=07a877e0-f68f-49f2-b737-6b0d996fd006)

## Acceptance Condition

plan `## Acceptance`의 22항목. 축으로 묶으면 다섯이다.

1. **전환 실측 (UI6 — 완료 판정의 유일 근거)** — `derive/cli.js run --json`이 실 repo에서
   `B1.status === 'computed'`를 반환하고, `m6-after.json`이 `m6-before.json`의 `insufficient`와
   대조되며, `derive/cli.js render`가 만든 `.claude/cache/STATUS.md`에 B1 행이 **건수**로 나타난다.
   세 산출물이 전부 없으면 미완이다.
2. **독립성의 기계적 고정** — `b1-independence-lint.js` exit 0 ∧ 위반 fixture 4종 전부에서 비영점
   exit · 증거 구성 지점이 `b1-evidence-builder.js` 단 하나 · `receiptPresent`가 커밋 도달성으로
   판정되고 *staged-but-uncommitted* stub에서 `false` · Task 2a 변조 불변성이 실 PRD와 합성 fixture
   양쪽에서 통과.
3. **판정 경계의 전수 단언** — `decisionFromBasename` 동치 · `evidence` 스키마 **양방향** 거부(여분 키
   ∧ 필수 5필드 각각의 누락) · default-ref fallback 3분기(로컬 `HEAD` 미폴백) · `computeB1` 사다리
   4분기 · `archive-complete` archivable 불변 ∧ 오라클 실패의 `degraded:true` 표면화.
4. **대조기 자신이 게이트다** — `m6-assertion-manifest.json` 대조가 absent 0으로 통과하고, 그 대조기
   자신의 test(필수 id 누락 · 미발견 `test_title`)도 통과한다. 이 항목이 없으면 나머지 Acceptance는
   게이트가 아니라 규율이다.
5. **감사·회귀·릴리스** — `drift_items` `min(3, drift_count)`건 사람 대조를 `m6-audit-sample.json` +
   구현 보고서 `## 감사 표본` 절 **양쪽**에 기록 · Task 0/9 앵커가 디스크 plan 재해싱과 일치하고
   `prd_milestone_rows`가 before/after 동일 · 전체 스위트 **신규** red 0 · version 4면 동기 ·
   Validate 명령에 머신 고유 절대경로 0건.

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).
조건별 판정과 그 판정이 선 시점은 아래 `## Goal Loop Result`가 갖는다.

## Goal Loop Result

verdict=done.

**라이브 `/goal` loop은 돌리지 않았고, verdict를 낸 주체는 운영자가 아니라 어시스턴트다.**
운영자 응답은 `goal-*` grammar가 아니라 "claude 판단으로 진행"이었다 — 즉 Phase 3의 판정 권한을
명시적으로 위임했다. 이 사실을 숨기지 않고 기록한다. closure의 감사 가치는 verdict가 아니라 그
verdict를 **누가** **무엇을 보고** 내렸는지에 있고, 이번 건은 그 "누가"가 직전 선례
(`santa-adjudication-m1` — 운영자 본인 판정)와 다르다. acceptance는 아래 정적 증거로 검증했다.

검증 근거 (2026-08-17 실측, 전부 lock enter **이전** 수집):

- **전환 (축 1)** — `node plugins/mccp/scripts/derive/cli.js run --json` 라이브 실행:
  `B1.status="computed"` · `numerator/denominator = 1/39` · `value=null`(건수가 계약 — UI4) ·
  `independence_ok=true` · `raw_row_count=41` · `noncanonical_status_count=2` ·
  `undetermined_evidence_count=30` · `no_plan_count=26` · `archived_excluded_count=29`.
  `drift_items` 1건이 `workflow-orchestration-live-activation-m2`를 가리킨다
  (문서 `in-progress` ↔ 증거 `shipped`, `codex_verdict='converged'`).
  M2 이래의 상수 `insufficient('independent evidence source unavailable')`가 실제로 뒤집혔다.
- **축 2~4** — 보고서 Validation 표 실행 기록: manifest 대조
  `checked 21 assertion(s); required floor 21` exit 0 · 독립성 lint `ok — 4 axes clean` exit 0 ·
  §3 전환/앵커/감사 표본 `B1 drift=1/39 undetermined_evidence=30 audited=1/1` ·
  §4 대시보드 표면에 `| **B1** · 진행 상태 drift | 1건 (대조 9/39) | 산출됨 | milestone-evidence |`.
- **축 5 감사 표본** — 표본 크기 `min(3,1)=1`, **1/1 일치**. 원자료 4종을 자동 산출값과 독립으로
  대조했고 **대조군**(같은 PRD의 M1·M3 행이 일치로 판정됨)까지 확인해 오라클이 그 PRD의 모든 행을
  무차별 drift로 만들지 않음을 보였다. `m6-audit-sample.json`과 보고서 `## 감사 표본` 양쪽에 기록됨.
- **축 5 회귀** — 전체 스위트 310 파일 `tests=4487 pass=4472 fail=0 skipped=15`, **신규 red 0**.
  중간 실행에서 관측된 flake 2건(`review-verdict-corpus-hash` · `receipt/tests/decision`)은 깨끗한
  `origin/main` worktree와 격리 실행 양쪽에서 61/61 통과했고 최종 실행에서 재현되지 않았다.
- **선재 red 비귀속** — `evidence-audit.js` exit 4(`unverifiable=19`)는 main 선재이며 M6은 그 도구가
  읽는 세 경로 중 어느 것도 건드리지 않았다. renderer `design-lint` H16 1건도 B1이 낸 두 줄을 제거해도
  동일하게 남아 선재임이 확인됐다.
- **브랜치 상태** — working tree clean · branch `v1.24.0-multi-session-m6` ·
  `origin/main..HEAD`가 `a0427ca` 1건(미푸시). PR은 본 closure 이후 별도 `/mccp:pr`이 소유한다.
- **version** — `plugin.json` `1.26.3` (§3.7 patch 축 — PRD 8 milestone 중 M6 단독 ship).
  이 값의 유효성에 대한 정정은 아래 `## 인접 축` 2번이 갖는다.

**Codex 미발화** — `MCCP_CODEX_DISABLED=1` env 정책으로 first-class skip이며 plan·implement 두
receipt 모두 `codex_verdict='skipped'`로 봉인됐다. cross-gate dedupe는 fail-closed로 남으므로
`/mccp:pr`의 PR-Codex는 그대로 발화한다. 즉 **본 milestone은 cross-model 확증을 받지 않았고**,
`Status: done`은 단일 모델 판정 위에 서 있다.

`Status: done`은 그러므로 「22개 Acceptance 항목이 정적 증거로 충족됐고, UI6이 완료 판정의 유일
근거로 지정한 B1 전환이 라이브 실행에서 실제로 관측됐다」는 뜻이다. 「PR이 통과했다」거나
「cross-model 검증을 받았다」는 뜻이 아니다.

## Deviation — plan-body anchor를 싣지 않았다

`/mccp:milestone-close` Phase 4는 이 closure의 sha256을 plan 본문 `## Milestone Closure Provenance`
섹션에 stamp할 것을 의무화한다(option B custody anchor). **이 milestone에서도 그 stamp를 싣지
않았고, 그 사실을 여기 기록한다.**

**이유는 선례 2건과 동일하다** — stamp가 plan 본문을 바꾸면 `mccp-plan-codex`·`mccp-implement-codex`
receipt의 `plan_hash`(`sha256:e2338ca5…`)가 어긋나 그 다음 게이트인 `/mccp:pr`이 stale로 막힌다.
`santa-adjudication-m1` closure가 A/B 실측(stamp 후 `ok:false` stale 2건, 제거 시 정확 복귀)으로
단일 원인이 stamp임을 확인했고, `gate-guard-integrity-m3`는 stamp를 실었다가 되돌렸다. 같은 이유로
이 milestone의 구현도 게이트 기록을 plan 본문이 아니라 `.claude/notes/`에 두었다(보고서 D3).

**재봉인이 아니라 미stamp인 이유** — `receipt/write.js:503`이 이 상황의 재봉인을 명시적으로 거부한다
("plan changed after L2 reviewed it (DD13) … do NOT reseal, that would certify an unreviewed
version"). 이 receipt는 L2 패널 `review_proof`를 담고 `reviewed_plan_hash`가 옛 값에 묶여 있으므로
재anchor는 패널이 보지 않은 본문을 승인한 것으로 봉인하게 된다.

**잃은 것과 남은 것** — 잃은 것은 "closure 본문이 변조되면 다음 게이트의 plan_hash mismatch로
검출된다"는 메커니즘이다. 남은 것은 **git**이다. 이 디렉토리는 git-tracked이므로 본문이 커밋으로
봉인되고 변조는 diff로 드러난다. 이 결함은 [codex-findings-backlog.md](../plans/codex-findings-backlog.md)의
2026-08-16 HIGH 행이 이미 등재했고, 권고된 진짜 수정은 closure sha256을 plan이 아니라 receipt `meta`에
싣는 것이다 — 본 이탈은 그 방향과 같다.

## Decision — PRD 표 status flip을 지금 수행했다 (권고 반려 후 재확인)

**결정 경위를 순서대로 남긴다.** 운영자 최초 지시는 "M6를 complete 처리"였고, 판정은 어시스턴트에게
위임됐다("claude 판단으로 진행"). 어시스턴트는 아래 분석을 근거로 **flip을 머지 이후로 보류할 것을
권고**했고 closure를 그렇게 기록했다. 운영자는 그 권고를 받은 뒤 **최초 지시를 그대로 재확인**했고,
따라서 flip을 즉시 수행했다. 이 절은 보류 권고를 삭제하지 않고 그 위에 실제 결정을 얹는다 — 무엇을
권고했고 누가 무엇으로 결정했는지가 감사 대상이지, 최종 결정만 남기면 그 기록이 사라진다.

수행 결과 (실측): PRD `## Delivery Milestones` row 6 status `in-progress` → `complete`.
직전 선례 2건(`santa-adjudication-m1` · `gate-guard-integrity-m3`)과 **같은 시점 선택**이 됐다.

**실측** — 지금 뒤집으면 M6 자신의 오라클이 그 행을 drift로 잡는다. ship receipt
`.claude/receipts/mccp-pr-codex/multi-session-work-loop-m6.json`이 **부재**하고(plan·implement receipt만
존재), plan 파일이 `origin/main`에 **미도달**이다(`git cat-file -e origin/main:<plan>` → exit 128
"exists on disk, but not in 'origin/main'"). 따라서 `b1-status-drift.js`의 evidence-gap 분기
(`gitReachable===true` → `undetermined`)에 걸리지 않고 `gitReachable===false` → `not-shipped`로
**확정**된다. 문서가 `complete`면 `isDrift(true, 'not-shipped')`가 참이 되어 `drift_count`가
`1/39 → 2/39`가 된다.

**보류를 권고했던 근거 (반려됨, 기록 보존)** — 두 선례가 뒤집었을 때 B1은 `insufficient`였다. 측정이
존재하지 않았으므로 그 flip은 아무것도 오염시키지 않았다. **그 측정을 켠 것이 바로 이 milestone이므로
선례의 전제가 이번에는 성립하지 않는다.** B1의 target은 0건이고, 그 지표를 배송하는 커밋이 그 지표가
policing하는 바로 그 PRD에 자기 손으로 drift를 하나 넣는 것은 — 비록 머지와 함께 사라지는 일시적
항목이라도 — 지표가 라이브로 전환되는 그 시점의 판독을 흐린다. M6 구현 보고서 `## Next Steps`도 같은
이유로 *"지금 미리 바꾸지 않는다"* 를 명시했다. **이 권고는 운영자 재확인으로 반려됐다.**

**반려를 지지하는 논거** — 이 drift는 오라클의 **위양성이 아니라 진양성**이다. 오라클의 의미론은
"done"이 아니라 "shipped"이고, 문서가 `complete`인데 ship 증거가 없다는 관측은 정확하다. 즉 보류
권고가 지키려던 것은 지표의 *정확성*이 아니라 *판독의 명료성*이었고, 두 선택의 실질 차이는 작다.
그리고 지금 flip하면 보류가 안고 있던 유일한 실패모드 — **머지 후 flip을 잊는 것** — 이 소거된다.
그 망각이야말로 이 PRD가 없애려는 drift이므로, 반려는 원문제에 더 가까운 쪽을 택한 것으로 읽을 수 있다.

**flip 직후 실측 (2026-08-17)** — `derive/cli.js run --json`: `drift = 2/39`(1/39에서 증가),
`status` `computed` · `independence_ok` `true` 불변. 신규 항목이 **M6 자신**이다:

| milestone | doc_status | evidence_verdict | evidence_ref |
|---|---|---|---|
| 진행 상태 기계 판정 (M6) | `complete` | `not-shipped` | `.claude/plans/multi-session-work-loop-m6.plan.md` |
| live 완주 검증 (복수 cycle) | `in-progress` | `shipped` | `.claude/receipts/mccp-pr-codex/workflow-orchestration-live-activation-m2.json` |

**이 표는 뜻하지 않게 오라클의 자기 시연이 됐다** — 양방향 대조식
(`docSideExpectsShipped !== (verdict === shipped)`)의 두 방향이 라이브 산출에 동시에 나타났다.
위는 문서가 증거를 앞선 경우, 아래는 증거가 문서를 앞선 경우다. 한쪽 방향만 잡는 오라클이었다면
둘 중 하나는 침묵했을 것이다. **M6 행은 머지로 ship receipt가 커밋에 도달하는 순간 자동 해소된다**
(증거가 `shipped`로 바뀌어 `complete`와 일치). 그때 `drift`는 1/39로 복귀하며, 남는 1건은 M6가
아니라 별개 PRD의 미해소 항목이다.

## 인접 축 — closure 범위 밖이지만 `/mccp:pr` 전에 처리해야 하는 것

1. **`security_skipped=true`가 `/mccp:pr`을 막는다.** implement receipt에 봉인돼 있다. 이 세션의
   harness 정책이 subagent 발화를 금지해 `security-reviewer`가 호출되지 못했고, 구현은 그것을 조용히
   approving으로 만들지 않고 fail-closed로 남겼다(보고서 기록). 복구는 subagent가 가능한 세션에서
   `/mccp:prp-implement` 재진입이거나 운영자의 명시적 처리다.
2. **version이 이미 추월당했다 (§3.7 forward-only, 12번째 재발).** 이 브랜치는 `1.26.3`인데
   `origin/main`은 `1384cbe`(PR #142, session-process-reclaim)로 **`1.27.0`**까지 가 있다. 발행된
   번호는 불가침이므로 미머지인 이쪽을 **`1.27.1`**로 상향해야 하고, 동기 대상은 4면
   (`plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md`)이다.
   `renderer/tests/i18n-surface.test.js`는 `plugin.json`에서 version을 파생하므로 동기 대상이 아니라
   **검증 수단**이다(보고서 D4). 위 `## Goal Loop Result`의 `1.26.3`은 closure 기록 시점의 관측이며
   사후 값으로 고쳐 쓰지 않는다.
3. **base가 102 커밋 이상 벌어져 있다.** D1이 Task 0 **전**에 `origin/main`을 병합한 이유(활성 PRD
   1 → 9, 앵커 통약성)와 같은 축이며, 머지 전 재병합 시 `prd_milestone_rows`가 다시 움직여 앵커 대조가
   깨질 수 있다. Validation §3이 `denominator incommensurable`로 throw하므로 조용히 지나가지는 않는다.

## Follow-up (이 문서가 소유하는 잔여 행동)

- [x] PRD `.claude/prds/multi-session-work-loop.prd.md` `## Delivery Milestones` row 6 status를
      `in-progress` → `complete`로 정정. **본 closure와 같은 세션에서 수행**(운영자 재확인 후).
- [ ] 머지 후 `node plugins/mccp/scripts/derive/cli.js run --json`으로 `drift`가 **2/39 → 1/39**로
      복귀하는지 확인. 2에 머무르면 ship receipt가 커밋에 도달하지 못한 것이고, 3이 되면 flip이
      의도치 않은 다른 행까지 건드린 것이다. **이 확인이 본 flip의 사후 검증이며, 생략하면
      "지금 뒤집는다"는 결정이 반증 불가능해진다.**
- [ ] `/mccp:pr` 전에 위 `## 인접 축` 3건 처리 — `security_skipped` · version `1.27.1` 상향 4면 동기 ·
      base 재병합 시 앵커 통약성.
- [ ] PRD 전체(M7·M8이 `pending`)는 여전히 미완이므로 `/mccp:archive-complete`의 archivable 조건
      (§3.11 C2/C3)에 도달하지 않는다. 아카이브는 일어나지 않으며, 그것이 정상이다.

## Provenance
- Lock run_id        : 07a877e0-f68f-49f2-b737-6b0d996fd006
- Lock owner session : c62a3a13-dda3-4fa2-af8a-5d135d9fb0e3
- Plan source        : .claude/plans/multi-session-work-loop-m6.plan.md
- Detection signal   : {"row":6,"name":"**진행 상태 기계 판정**","plan":".claude/plans/multi-session-work-loop-m6.plan.md","status":"in-progress"}
- mccp version       : 1.26.3
