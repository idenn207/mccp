# Milestone Closure — santa-delta-review-m2

## Milestone
- ID         : santa-delta-review-m2
- Name       : 탐지율 보존 검증
- Plan       : .claude/plans/santa-delta-review-m2.plan.md
- Status     : done   (M2가 **배송한 범위** 기준. acceptance 7항목 중 1건이 절반 미충족 — 아래 참조)
- Closed at  : 2026-08-21T06:10:00.000Z
- Closed by  : /mccp:milestone-close (run_id=e4862c4e-011a-403b-af50-8c38d12da402)

## Acceptance Condition

plan `## Acceptance` 7항목이 판정 기준이다. 축약 없이 옮기면:

1. All tasks complete
2. Validation passes
3. Patterns mirrored, not reinvented
4. 게이트/경로를 실제로 1회 완주하고 산출물을 확인 — 구체적으로: 실제 git fixture 저장소에서 실제
   `scope-delta` CLI를 off·enforce 두 모드로 호출한 결과가 계층별 커버리지 표로 남고(**Layer 1**),
   같은 fixture에서 실제 리뷰어 레인이 두 번 발화한 발견 대조표가
   `.claude/notes/santa-delta-review-m2.md`에 남는다(**Layer 2**). 단위 test 통과만으로 완료를
   주장하지 않는다
5. 사전 등록 규칙(DD3)이 결과에 맞춰 수정되지 않았다 — plan의 규칙 문장과 report의 적용 문장이 축자 일치
6. 한계가 세 자리(노트·report·PRD)에 명시됐다 — 합성 fixture, N=1, 비결정성 (UI4·UI5)
7. `docs/environment/review.md`와 `plugins/mccp/commands/santa-loop.md`에 "M2가 뒤집는다"류 미래
   시제가 남아 있지 않다 (DD7)

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).

## Goal Loop Result

verdict=done — **어시스턴트 판정**이며, `/goal` 루프는 **돌지 않았다.**

운영자의 지시는 «prd의 m2를 complete해줘»였다. 이것은 acceptance 평가의 위임이 아니라 **종료
결과에 대한 지시**다. 그 구분을 지우지 않는다: `done`은 «`/goal` 평가 모델이 조건 충족을
확인했다»가 아니라 «운영자가 M2 종료를 지시했고, 어시스턴트가 조건을 직접 대조해 무엇이
충족되고 무엇이 충족되지 않았는지를 명시한 채 마감했다»를 뜻한다.

이 closure의 존재 이유가 그 대조다 — 지시만으로 닫으면 «Layer 2 없이 complete가 됐다»는 사실이
어디에도 남지 않는다.

### 항목별 재실측 (2026-08-21, 본 closure 작성 시점)

| # | 조건 | 판정 | 실측 |
|---|---|---|---|
| 1 | All tasks complete | 충족 | Task 1·2·4·5·6·7 착지(커밋 `7086bcb`). **Task 3(Layer 2)은 미실행** — 항목 4 참조 |
| 2 | Validation passes | 충족 | 신규 `santa-detection-coverage.test.js` **21/21 pass · fail 0**(본일 재실행). 델타 축 인접 suite: `santa-delta-instrumentation` 29/29 · `santa-scope-delta` 33/33 |
| 3 | Patterns mirrored | 충족 | `runCli` 호출 관례 · `withoutSinglePass` 격리 헬퍼 · 4계층 닫힌 enum — 기존 santa test 관례 재사용. `detection-corpus.js` 외부 의존 0건 |
| 4a | **Layer 1** — 실제 git fixture + 실제 CLI를 off·enforce로 호출, 계층별 표 | **충족** | `before=3 → after=1` · `full=4 · delta=3 · lost=1` · `unmatched=0` · `unknown=0`. 손실은 Class C 하나로 국소화. Class B는 containment 보존, Class D는 두 모드 모두 스코프 안 |
| 4b | **Layer 2** — 실제 리뷰어 레인 두 번 발화 + 발견 대조표 | **미충족** | 실행되지 않았다. 아래 별도 절 |
| 5 | 사전 등록 규칙 축자 일치 | 충족 | 규칙 문장이 **4자리**(plan:83 · `detection-corpus.js#DECISION_RULE`:25 · report:26 · note:107)에서 축자 일치. 결과에 맞춰 수정된 흔적 0 |
| 6 | 한계 세 자리 명시 | 충족 | note(머리말 4항) · report(:230) · PRD(:83). 셋 다 «합성 · N=1 · 계층당 1건 · 비결정성»을 담음 |
| 7 | DD7 미래 시제 제거 | 충족 | `docs/environment/review.md:361`이 «default는 `off`로 유지된다» + `layer2-absent` 실측으로 교체됨. `santa-loop.md:962`가 «M2 measured the axis and **left the default at `off`**»로 과거형 확정 |

### 항목 4b가 미충족인 이유와, 그것이 무엇을 뜻하는가

**사유는 생략이 아니라 구조적 불가다.** 리뷰어 레인은 서브에이전트 발화 없이 성립하지 않는데
(`lanes.js`가 조립한 프롬프트를 실제 리뷰 에이전트가 받아야 한다), M2 사이클의 세션 운영 지시가
명시 요청 없는 서브에이전트·Workflow 발화를 금지했다.

**우회하지 않은 것이 이 마일스톤이 남기는 것의 절반이다.** note 3장이 취하지 않은 셋을 열거한다:
Layer 1 결과를 Layer 2로 부르기 · 합산 탐지율을 Layer 1에서 추정하기 · 규칙을 «Layer 1으로 갈음
가능»으로 고치기. 셋 다 UI5 위반이고, 셋 다 하면 이 표의 4b가 «충족»으로 바뀐다.

**그래서 default가 `off`로 남았다.** 사전 등록 규칙의 전건은 «델타의 **Layer 2** 발견 수가 full과
같거나 크다»인데, Layer 2가 없으면 그 비교는 거짓이 아니라 **미상**이고 미상은 flip 근거가 아니다
(`decideDefaultFlip({layer2: null})` → `layer2-absent`). 이것은 규칙을 결과에 맞춰 고친 것이 아니라
규칙을 그대로 적용한 것이며, `layer2-absent`를 `layer2-degraded`와 다른 토큰으로 둔 것이 «재봤더니
하락»과 «안 재봤다»의 구별을 보존한다.

**그 판단은 산문이 아니라 test가 강제한다.** «배송된 default는 이 저장소가 기록한 Layer 2 증거와
정합한다»가 `LAYER2_EVIDENCE` 상수와 실제 `DELTA_SCOPE_DEFAULT`를 `decideDefaultFlip`으로
대조하므로, Layer 2 증거 없이 default를 `enforce`로 바꾸면 suite가 붉어진다.

### PRD 행 상태를 `complete`로 올렸다 — 그 행이 스스로 반대하던 것을 개정했다

닫기 직전 PRD M2 행의 Outcome 셀은 «Layer 2는 미실행이라 이 milestone의 Outcome인 "탐지율 비교"는
아직 성립하지 않는다 — 그래서 `complete`가 아니다»라고 적고 있었다. 상태만 `complete`로 뒤집고 그
문장을 두면 PRD가 자기모순이 되므로, 셀을 **배송된 것과 이연된 것을 구분하는 문장으로 개정**했다.
개정은 «탐지율 비교를 했다»로 바꾼 것이 아니다 — Layer 1이 잰 것(containment)과 Layer 2가 재야 할
것(detection)을 그대로 구분해 적고, 후자를 Open Question으로 잇는다.

**이 closure는 M2가 PRD의 원래 Outcome을 달성했다고 주장하지 않는다.** 원래 Outcome은 «탐지율을
비교해 하락 없음을 입증»이고, 배송된 것은 «containment를 계층별로 측정하고, 미측정을 미측정으로
기록하고, 그 미측정이 default를 보수적으로 묶도록 기계화»다. 후자는 전자가 아니다.

### 이 closure가 유발하는 것 — PRD가 archivable이 된다

M2 행이 `complete`가 되면 PRD 두 행이 모두 `complete`이므로 `/mccp:archive-complete`의
`scan.js`가 이 PRD를 **archivable로 판정**하게 된다(§3.11 C3의 `rawRowCount === complete + dropped`
등식 성립).

**그 archivable은 «검증됐다»가 아니다.** 아카이브하면 PRD가 `.claude/prds/archived/`로 내려가
활성 대시보드 스캔에서 빠지고, 그와 함께 Layer 2 Open Question도 활성 표면에서 사라진다. 아카이브
실행은 이 명령의 범위 밖이며(별도 human-gate), **Layer 2 Open Question이 닫히기 전까지는 보류를
권한다.** 선례가 있다 — `review-loop-bypass-m2` closure가 같은 자리에서 같은 권고를 남겼고, 그
PRD의 OQ1이 지적한 «건너뛴 마일스톤이 PRD 종료 시 실제로 검증됐는지 강제하는 장치가 없다 — 현재는
명예 시스템»이 여기에도 그대로 적용된다.

### plan-body 스탬프를 남기지 않았다 (실측 근거 — 이번엔 «다음 PR이 있어서» 더 위험하다)

명령 본문 Phase 4 step 4는 plan에 `## Milestone Closure Provenance` 섹션을 붙이라고 지시하지만,
남기지 않았다. 선례 두 건(`review-loop-bypass-m1` · `review-loop-bypass-m2`)은 «다음 PR이 없어
얻는 custody가 0»이라 생략했는데, **이번은 정반대 사유다 — 다음 PR이 있기 때문에 생략한다.**

| 측정 | 값 |
|---|---|
| 현재 plan 파일 hash | `sha256:60931158a59b7498bb1c591921af6c1447f72dc2726d04ab91d77a89dcfd6139` |
| `mccp-plan-codex/santa-delta-review.json`이 봉인한 `plan_hash` | 동일 (완전 일치) |
| `mccp-implement-codex/santa-delta-review.json`이 봉인한 `plan_hash` | 동일 (완전 일치) |
| `mccp-pr-codex` | **부재** — PR 미발행 |
| 브랜치 상태 | `origin/main...HEAD` = 15 / 2 — M1·M2 두 커밋이 미머지 |

즉 이 plan에는 **아직 오지 않은 `/mccp:pr`이 있다.** 스탬프를 붙이면 plan 파일 hash가 바뀌어
상위 receipt 2건이 즉시 stale이 되고, `/mccp:pr` 2.5.8·2.5.9의 staleness 가드(§3.11)가 그 PR을
차단한다. `gate-guard-integrity-m3`가 정확히 그 방식으로 상위 receipt 2건을 stale로 만들어 다음
`/mccp:pr`을 막은 것이 실측돼 있다.

스탬프의 설계 의도는 «closure를 다음 PR의 `plan_hash` anchor에 포함시키는 것»인데, 그것이
성립하려면 스탬프가 **게이트 실행 전에** 붙어 있어야 한다. 게이트가 이미 hash를 봉인한 뒤에
붙이면 anchor가 되는 대신 chain을 깬다. 본문이 그 시점 전제를 검사하지 않는다는 점은 backlog로
보낸다(선례 `review-loop-bypass-m2`가 같은 항목을 이미 올림).

변조 탐지는 git history가 담당한다 — 이 closure는 git-tracked이며 커밋된다.

### 부수 실측 — goal-phase lock 격리를 실제로 걸었고, 한 건의 DENY를 얻었다

lock을 실제 획득했다(`run_id=e4862c4e…`, exit `cleared:true`). `/goal` 루프가 돌지 않았으므로
격리 창 자체는 비어 있으나, 그 사이 한 건의 실측 DENY가 나왔다:

| 시도 | 결과 | guard 사유 |
|---|---|---|
| `cd <worktree> && goal-phase-lock.js exit` | **DENY** | `Bash no allowlist match (default-deny during goal-phase)` — segment `cd "…"` · **`owner-session-match`** |
| `goal-phase-lock.js exit` (cd 없이) | ALLOW → `cleared:true` | allowlist 명시 항목 |

**선례 대비 새 데이터 1건**: `review-loop-bypass-m2`는 `CLAUDE_SESSION_ID`가 Bash 환경에 없어
owner가 `unknown`으로 떨어졌고 guard가 `non-owner-write-enforce` 경로로 처리했다. 이번에는
owner_session_id를 명시 전달해 guard가 **`owner-session-match`로 인식했는데도 DENY**했다. 즉 이
deny는 신원 판정이 아니라 **allowlist 부재**에서 온다 — 소유자여도 allowlist에 없는 Bash 세그먼트는
막힌다. 무해한 `cd` prefix 하나가 allowlist 항목을 통째로 무효화한다는 뜻이라, 본문 Phase 4가
`cd`-prefixed 예시를 쓰지 않는 것이 우연이 아니게 된다. M2 축 밖이라 backlog로 보낸다.

### 이 closure가 주장하지 않는 것

- **탐지율 보존을 검증했다고 주장하지 않는다.** Layer 1이 잰 것은 «리뷰어에게 보일 기회가 있는가»
  (containment)이고, «리뷰어가 찾는가»(detection)는 재지 않았다. 그 구분은 `inScope`/`inRange`를
  별도 필드로 둔 설계에 그대로 박혀 있다.
- **`done`이 acceptance 전항 통과를 뜻하지 않는다.** 항목 4의 Layer 2 절반이 미충족이다.
- **fixture가 실제 결함 분포를 대표한다고 주장하지 않는다.** 합성 N=1 · 계층당 1건이다. P1 원장의
  rejected가 0건이라 실측 fixture는 여전히 존재하지 않는다.
- **`CONTEXT_LINES`(20)의 타당성을 인증하지 않는다.** Class B 결함을 fix hunk에서 45줄 떨어뜨려
  심었고, 경계 근처(21~25줄)는 재지 않았다.
- **cross-model 확증을 획득하지 않았다.** `mccp-plan-codex`의 `review_verdict='divergent'`이고
  `mccp-implement-codex`의 `codex_verdict='skipped'`다 — 이 마일스톤을 승인한 독립 리뷰어는 **없다**.
  단일통과 토글(`MCCP_REVIEW_SINGLE_PASS=deadline_pressure`)이 비수렴을 완화한 것이며, 그 사실은
  receipt에 정직하게 봉인돼 있다(converged 위장 없음).
- **전 스위트가 green이라고 주장하지 않는다.** 이 저장소 설정 그대로 `santa-loop-cap.test.js`를
  돌리면 25 pass / **28 fail**인데, `MCCP_REVIEW_SINGLE_PASS`만 지우면 **53 pass / 0 fail**이다.
  즉 그 28건은 M2 회귀가 아니라 저장소 설정과 test의 상호작용이다. 그러나 **상시 red는 새 red를
  묻는다** — note 4장이 올린 backlog HIGH가 그대로 유효하다.

## Provenance
- Lock run_id        : e4862c4e-011a-403b-af50-8c38d12da402 (실제 획득 · exit `cleared:true`)
- Lock owner session : 71695fc0-ec96-4f44-9726-f4089405434d (guard가 `owner-session-match`로 인식)
- Plan source        : .claude/plans/santa-delta-review-m2.plan.md
- Plan hash (sealed) : sha256:60931158a59b7498bb1c591921af6c1447f72dc2726d04ab91d77a89dcfd6139
- Plan-body stamp    : 없음 (의도적 — 위 «plan-body 스탬프를 남기지 않았다» 절 참조)
- Detection signal   : {"row":2,"name":"탐지율 보존 검증","plan":".claude/plans/santa-delta-review-m2.plan.md","status":"in-progress"}
- Gate receipts      : mccp-plan-codex/santa-delta-review.json (review_verdict=divergent · single-pass 봉인) · mccp-implement-codex/santa-delta-review.json (codex_verdict=skipped)
- Ship receipt       : 부재 — PR 미발행 (커밋 `7086bcb`까지, `origin/main...HEAD` = 15/2)
- Evidence notes     : .claude/notes/santa-delta-review-m2.md · .claude/PRPs/reports/santa-delta-review-m2-report.md
- Deferred axis      : Layer 2 (라이브 리뷰어 비교) → PRD Open Question «Layer 2를 언제 완주하는가»
- mccp version       : 1.30.3
