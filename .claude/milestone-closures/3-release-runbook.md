# Milestone Closure — 3-release-runbook

## Milestone

- ID         : 3-release-runbook
- Name       : release-runbook
- PRD        : .claude/prds/release-channel-separation.prd.md (Delivery Milestones row 3)
- Plan       : .claude/plans/release-channel-separation-m3.plan.md
- Status     : done
- Closed at  : 2026-09-04T02:23:58.543Z
- Closed by  : /mccp:milestone-close (run_id=bdf3f592-89e0-474e-8f64-8d672e673721)

## Acceptance Condition

사용자가 `/goal`에 전달한 조건 원문:

```
docs/release-channel.md has all 7 sections each labeled 측정됨/전사됨/미측정,
plan Validation checks 1-15 all exit 0 on the committed tree,
PRD Open Questions 1/2/3/5 are all closed,
origin/release still points at 647dfec and marketplace.json diff is 0 lines,
or stop after 15 turns
```

## Goal Loop Result

사용자 응답 (secret mask 적용 — 치환 0건):

```
release runbook 7 sections landed with evidence labels, validation checks 1-15
exit 0 on the committed tree, PRD open questions 1/2/3/5 closed, release channel
pinned at 647dfec with zero marketplace.json diff
```

### 조건 4축 실측

| 축 | 조건 | 결과 | 근거 |
|---|---|---|---|
| 1 | 런북 7절 각각 증거 라벨 | 충족 | `## 1`~`## 7` 전부 헤딩에 라벨. 측정됨 3(1·5·6) · 전사됨 1(3) · 미측정 3(2·4·7). 5절은 `측정됨(관측값) · 미측정(발화)` 이중 라벨 |
| 2 | Validation 1~15 커밋된 트리에서 exit 0 | 충족 (기록 + 델타 직접 확인) | 보고서 `## Validation Results` — 커밋 후 재실행 15/15 pass. 검사 13이 0줄이 아니라 610줄을 스캔하고 통과 |
| 3 | PRD Open Question 1/2/3/5 종료 | 충족 | 5건 전부 `[x]` + 답 + 근거 위치. OQ4도 M2 답으로 닫혀 미체크 0건 |
| 4 | 릴리스 좌표 무이동 | 충족 | `origin/release` = `647dfecba75eecd9287ee538ca5f7056c7ba71da` · `git diff origin/main...HEAD -- .claude-plugin/marketplace.json` 0줄 |

### 축 2의 잔여 — 무엇을 재지 않았는가

이 closure는 15검사를 **재실행하지 않았다.** goal-phase 격리 lock의 Bash allowlist가
`git`·`gh`·`ls`·`cat`·`echo`·lock CLI뿐이라 `node`가 default-deny였다. 대신 둘을 했다:

1. 보고서에 기록된 **커밋 후** 재실행 결과를 읽었다 (15/15 pass · probe A~D 판별력 대조 포함).
2. 그 기록이 잰 트리는 `67b969e`이고 closure 시점 HEAD는 `86a0cbb`라 **기록 커밋 자신은
   그 스캔에 포함되지 않았다.** 그 델타를 `git diff --unified=0 67b969e..HEAD`로 읽었다 —
   변경 1파일(보고서), 삭제 0건, 릴리스 표면 4파일 미접촉, 추가된 줄의 절대 경로 0건.
   즉 커밋 diff를 보는 검사 2·12·13은 델타에서도 통과 상태이고, 나머지 12검사의 입력
   파일을 델타가 건드리지 않았다.

**남는 잔여**: 델타를 검사기로 돌린 것이 아니라 사람이 읽었다. 이 한정은 code-review H1이
지목한 구조적 잔여("plan Validation 블록이 커밋 후 실행을 전제한다는 사실이 어느 계획서에도
적혀 있지 않다")와 같은 축이며, backlog에 이연돼 있다.

## Provenance

- Lock run_id        : bdf3f592-89e0-474e-8f64-8d672e673721
- Lock owner session : 4d364fb0-abf2-4e0c-bc03-bb0cd5ed6a57
- Lock path          : .claude/state/goal-phase.lock (lease 90s · exit cleared=true)
- Plan source        : .claude/plans/release-channel-separation-m3.plan.md
- Detection signal   : {"row":3,"name":"release-runbook","plan":".claude/plans/release-channel-separation-m3.plan.md","status":"in-progress"}
- Detection reason   : ok (availability=available · goal_signal=true)
- HEAD at closure    : 86a0cbb0d0046452db1bb69f11be63d95471d6be
- origin/release     : 647dfecba75eecd9287ee538ca5f7056c7ba71da
- mccp version       : 1.34.4
- Secret mask        : plugins/mccp/scripts/derive/mask.js#applySecretMask (치환 0건)

### Gate note

본 cut은 별도 `mccp-milestone-close-codex` receipt를 발행하지 않는다 (option B). 이 문서
본문과 plan body의 `## Milestone Closure Provenance` sha256 stamp가 다음 `/mccp:pr`의
plan_hash anchor 계산에 포함되어, 변조 시 plan_hash mismatch로 검출된다.
