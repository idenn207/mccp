# Milestone Closure — orchestrator-step-wiring-m2

## Milestone
- ID         : orchestrator-step-wiring-m2
- Name       : halt-step-recording
- Plan       : .claude/plans/orchestrator-step-wiring-m2.plan.md
- Status     : done
- Closed at  : 2026-09-04T05:19:09.626Z
- Closed by  : /mccp:milestone-close (run_id=9e32e42c-0a21-4af2-9c05-8a7eaa4e0ab0)

## Acceptance Condition

**운영자는 `/goal` loop을 돌리지 않았다.** Phase 2 안내 대신 구조화된 질의로 두 축을 결정했고
(2026-09-04), 그 선택이 이 closure의 acceptance 기준을 정한다:

```
범위 : closure doc만 작성 — PRD Delivery Milestones의 M2 status는 in-progress로 유지
검증 : 기존 검증 결과를 근거로 종료 (재실행하지 않음)
```

따라서 충족 대상 조건은 자연어 acceptance condition이 아니라 **plan `## Acceptance`의 9개
항목**이다. 이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README
형식 규약). 항목별 판정은 아래 `## Goal Loop Result`가 갖는다.

## Goal Loop Result

verdict=done. 운영자 결정을 요약한 grammar (mask 통과 — `maskSecrets` hit **0건** · 원문 무변경):

```
goal-done:M2 acceptance 9절 중 8절 실측 충족, 라이브 /mccp:work 완주는 캐시 경계로 부분
```

### small fast model 평가는 일어나지 않았다 — 격리 lock은 실제로 발화했다

`/goal`의 turn-by-turn 평가 loop은 **돌지 않았다.** 운영자가 그 대신 기존 검증 결과를 근거로
삼는 쪽을 택했으므로, 아래 판정은 평가 모델의 판단이 아니라 **M2 report에 기록된 실행 출력과
이 세션이 직접 실행한 명령의 출력**이다. 숨기지 않고 기록한다 — closure의 감사 가치는 verdict가
아니라 그 verdict가 무엇을 보고 내려졌는지에 있다.

격리 자체는 관측됐다. `goal-phase-lock enter`가 `ok:true`를 냈고, lock이 활성인 동안 이 세션의
Bash 호출 2건이 `goal-phase-guard`에 의해 실제로 **BLOCK**됐다(`reason: Bash no allowlist match
(default-deny during goal-phase)`, `non-owner-write-enforce (F3 absorption)`). `exit`는
`cleared:true`. 즉 cooperative invariant는 산문이 아니라 이 실행에서 기계로 강제됐다.

### plan `## Acceptance` 9절 — 8절 충족 · 1절 부분

| # | 절 | 판정 | 근거 |
|---|---|---|---|
| 1 | Task 1~11 전부 완료 | PASS | report `## Tasks Completed` 11행. Task 10은 자체 표기로 "완료(부분)" — 아래 9번과 같은 항목 |
| 2 | Validation 1~9 전부 통과 | PASS | report `## Validation Results` 9행 전부 pass (104 · 42 · 49 · 10 pass, lint L1~L12 ok, 왕복/fail-open/커버리지/삭제검증) |
| 3 | 패턴 재발명 없이 mirror | PASS | fence 추출 `command-body/blocks` · 한 줄 정규화 `fix-task.js#oneLineExcerpt` · worktree 순회 `worktrees.js` 형태 유지 |
| 4 | 지표 4 커버리지 11/11 (DD3) | PASS | Validation 8 — `exits=11 · record-halt=11 · shell rows=11`. Task 8(d) 양방향 일치 + 8(h) 등식이 매 실행 강제 |
| 5 | 지표 5 소비 지점 + Task 8(g) pin | PASS | 배너가 A1 줄과 함께 표시되고 정적 test가 pin한다. 사람 눈 확인에 의존하지 않는다 |
| 6 | UI2 fail-open | PASS | Validation 7 — (a) repo 마커 부재 시 부작용 0 + loud stderr, (b) 실제 쓰기 실패에서 exit 0 + loud stderr |
| 7 | 보안 S1 (control character) | PASS | 쓰기·읽기 양쪽 좁히기. report `## security-reviewer S1` — HIGH 1건 ACCEPT_NOW 흡수, 나머지 5개 표면은 근거와 함께 기각 |
| 8 | UI4 집계 경계 · UI5 경계 불가침 | PASS | `last-halt` 전역 최신 선택 단위 test + cap 절삭 시 생략 사유. Task 8(f) pin green |
| 9 | 게이트/경로 1회 완주 (halt 1회 유발) | **부분** | verbatim 실행으로 배너 줄과 `chain_progress` 항목을 캡처했으나 **라이브 `/mccp:work` 완주는 아니다** — 아래 참조 |

9번이 부분인 이유는 plan 자신이 미리 정한 경계다: hook과 명령 본문은 worktree가 아니라
`~/.claude/plugins/cache/mccp/mccp/<version>/`에서 로드되므로(§3.7) 이 사이클에서 라이브 완주가
구조적으로 불가능하다. plan은 그 경우 "부분으로 남기고 충족으로 주장하지 않는다"고 적었고,
report가 그대로 따랐다. M1이 지표 5에서 같은 경계를 남긴 선례를 잇는다.

### 사후 code-review 흡수와 재검증 (2026-09-04)

closure 시점의 코드는 report `## Tasks Completed`가 기록한 상태가 아니다. 그 뒤
`/mccp:code-review` 로컬 모드가 HIGH 2 · MEDIUM 3 · LOW 6을 냈고 **전건 흡수**됐다. HIGH 2건은
축이 다르다 — supersession 규칙이 도달 불가였던 것(HIGH-1)과 부재가 실패로 오보된 것(HIGH-2).
재검증 결과는 report `### 재검증`이 소유한다: `work-halt-record`+`work-command-body` 36 pass ·
인접 회귀 11파일 383 pass · `state/tests` 217 · `derive/tests` 136 · lint L1~L12 ok ·
supersession 라이브 3단계 확인.

같은 날 `goal-detect` 결함 1건도 이 브랜치에서 고쳐졌다(commit `0ac63ef`) — plan과 report를 함께
지목하는 2경로 Plan 셀을 언펜스하지 못해 milestone-close가 실재하는 plan을 `plan-missing`으로
처리하던 것이다. **이 closure가 그 수정의 수혜자다**: worktree 스크립트로 detect를 돌려
`goal_signal=true` + `signal_ref.plan=".claude/plans/orchestrator-step-wiring-m2.plan.md"`를 얻었다.
캐시 판본(1.33.7 이하)에는 그 수정이 없으므로 캐시 경로로 돌렸다면 이 milestone은 탐지되지
않았을 것이다.

### `Status: done`이 뜻하지 않는 것

`done`은 「M2의 Task·Validation·보안 흡수·사후 리뷰 흡수가 실측으로 확인됐다」는 뜻이다.
아래는 여전히 미충족이며 이연이지 실패가 아니다.

1. **PRD의 M2 status는 여전히 `in-progress`다 — 의도된 것이다.** 운영자가 그 범위를 선택했고,
   근거는 두 축이다. (a) `archive-complete/scan.js`가 이 milestone을 `evidence_verdict:
   "not-shipped"`로 판정한다 — PR이 아직 없으므로 shipped 증거가 없다. (b) status를 complete로
   쓰면 이 PRD가 `archivable: false → true`로 뒤집히고(2/2 complete), 그 상태에서
   `/mccp:archive-complete`가 돌면 plan이 `archived/`로 옮겨져 `/mccp:pr` 2.5.8·2.5.9의 plan
   staleness 가드가 이 사이클을 스스로 막는다(§3.11 가드 2 자기차단). 머지 확인 후 정정한다.
2. **ship receipt가 없다.** `.claude/receipts/mccp-pr-codex/orchestrator-step-wiring-m2.json` 부재.
   milestone-close는 chain에서 `/mccp:pr` **앞**이므로 정상 순서다.
3. **`mccp-plan-codex` receipt도 없다 — 기록된 부재다.** L2 패널이 `divergent`(halt `5.2e`,
   4관점 전원 fail)로 멈췄고, findings 16건(HIGH 4 · MEDIUM 7 · LOW 5)을 **전부 흡수**하면서
   plan 본문이 바뀌어 DD13 bind가 구조적으로 성립 불가가 됐다. 라운드 캡 1은 이미 소진됐고 캡
   상향은 §3.16의 우회 목록에 없다. 사유·대가는 plan `## Gate Record`가 소유하며 receipt를
   **위조하지 않았다**.
4. **cross-model 심사 0회.** Implement-Codex는 `classification=disabled`
   (`MCCP_CODEX_DISABLED=1` 영구 운영자 정책, §3.3) → `codex_verdict='skipped'` 봉인.
   same-model 패널이 그것을 대신하지 않는다. codex 사용량 한도는 2026-09-07 재설정 예정이며,
   cross-gate dedupe가 열리지 않으므로 `/mccp:pr`에서 PR-Codex는 정상 발화한다.
5. **지표 4의 런타임 축은 미측정이다.** 사이트 커버리지(11/11)로 측정했고 "멈춘 `/mccp:work` 중
   기록된 비율"은 독립 관측원이 없어 정의상 100%이거나 측정 불가다(report `## 주장하지 않는 것`).

## Milestone Closure Provenance stamp — 싣지 않는다 (A/B 실측 근거)

**Phase 4의 plan-body stamp를 싣지 않는 이탈을 택했다.** 선례 두 건
([santa-adjudication-m1](santa-adjudication-m1.md) ·
[session-process-reclaim-m3](session-process-reclaim-m3.md))과 같은 형태이고, 세 번째 선례
([review-record-linkage-m3](review-record-linkage-m3.md))가 stamp를 실은 것과는 갈린다. 갈린
이유는 취향이 아니라 **측정값이 다르기 때문**이다.

- **measurement A (stamp 이전, 실측)** — `validate --command mccp:pr --decision
  orchestrator-step-wiring-m2 --plan <plan>` → `missing` **1건**(`mccp-plan-codex`, 위 3번의
  기록된 부재) · **`stale` 0건** · `blocking` 0 · `open_critical` 0.
- **stamp가 만들 hash 변화 (원본 미변경 probe)** — plan 사본에 stamp 절을 붙여 재해시:
  `sha256:42643dfd…` → `sha256:aa380959…`.
- **`mccp-implement-codex` receipt가 봉인한 plan_hash는 `sha256:42643dfd…`로 현재 파일과
  바이트 단위로 일치한다.** 즉 stamp는 그 receipt를 **새로 stale로 만든다.**

review-record-linkage-m3에서는 stale 2건이 stamp **이전에 이미** 존재했으므로 stamp가 새 비용을
만들지 않았다. 여기서는 반대다 — stale 0건인 상태에서 stamp가 1건을 **생성**한다. 그리고 이
저장소는 `MCCP_RECEIPT_GATE_MODE=soft`라 누락 receipt는 통과하지만 **stale은 여전히 차단된다**
(§1.2). 따라서 stamp를 실으면 이 사이클의 `/mccp:pr`이 stamp 자신에 막히며, 그것은 운영자가
이 closure의 범위를 정하며 명시적으로 피한 결과다.

**대가**: option B custody anchor가 이 milestone에서는 작동하지 않는다. closure 본문 변조가
다음 게이트의 `plan_hash` 대조에서 드러나지 않는다. 남는 무결성 근거는 이 문서가 git-tracked라는
것과 커밋 이력뿐이다 — 숨기지 않고 여기 적는다.

## Deviation — 명령 본문의 결함 4건 (전부 기등재 · 재현 카운트를 갱신한다)

**네 건 모두 새 발견이 아니다.** 작성 중 backlog를 대조한 결과 전부 이미 등재돼 있었고, 처음에
이 절은 그중 둘을 "2회 재현"이라 적었으나 **그것도 틀렸다** — 실제로는 축마다 2~3회씩 독립
재현됐다. 정정해 적는다. 여기서 새로 기여하는 것은 결함의 발견이 아니라 **재현 횟수**이며,
그 숫자가 이 항목들의 우선순위에 대한 유일한 새 정보다.

| # | 결함 | 이 실행의 관측 | 기등재 |
|---|---|---|---|
| 1 | Phase 4 mask snippet이 잘못된 함수를 가리킨다 — `applySecretMask`는 문자열이 아니라 derive **model** 객체를 받아 model을 반환하며 `.text`를 갖지 않는다 | snippet대로면 `## Goal Loop Result`에 `undefined`가 실린다. 본 closure는 `maskSecrets(text) -> {masked, hits}`를 사용(hit 0건) | backlog L197(2026-08-17) · L234(2026-08-17) → **3회차** |
| 2 | Phase 0 cost-tier probe가 무출력 — `cost-state.js`는 CLI entrypoint가 없는 순수 모듈이라 subcommand를 해석하지 않는다 | exit 0 · stdout 빈 문자열. `\|\|` fallback이 exit 0이라 발화하지 않아 빈 값이 green과 구별되지 않는다 | backlog L233(2026-08-17) · L334(2026-08-19, HIGH) → **3회차** |
| 3 | Phase 2의 `${CLAUDE_SESSION_ID:-unknown}`이 항상 `unknown`으로 접힌다 | CLAUDE.md §3.18대로 그 이름은 이 하네스 CLI가 설정하지 않는다. 정본 체인 `session-identity.js#resolveRawSessionId`로 해소한 실제 값은 `1d696bc7-3e7b-458d-803e-b9fd1d6906b7`이고 lock에는 `unknown`이 기록됐다 | backlog L337(2026-08-19) · L454(2026-08-21, fix 방향 정정) → **3회차** |
| 4 | 명령 본문이 머신 고유 절대경로 + 고정 version(`1.33.6`)을 하드코딩 | 이 worktree는 `1.34.4`다. 본 실행은 worktree 스크립트를 썼고 **그 선택이 결과를 바꿨다** — 위 `goal-detect` 수정 때문이다 | backlog L235(2026-08-17, LOW) → **2회차** |

4번에는 이 실행에서 **새로 관측된 축**이 하나 붙는다. 명령 본문의 경로만 worktree로 대체하면
되는 것이 아니라, **hook은 여전히 캐시에서 로드된다** — 격리 BLOCK 메시지가
`1.33.6/scripts/hooks/goal-phase-guard.js`를 가리켰다. 즉 한 실행 안에서 명령이 부르는 코드와
hook이 부르는 코드의 판본이 갈리며, 본문의 경로를 `${CLAUDE_PLUGIN_ROOT}`로 통일해도(L235의
처방) 그 갈림은 닫히지 않는다. 이 관측만 backlog에 새로 append한다.

**이연이 아니라 수정 대상이라는 신호로 읽는다.** 네 축이 2026-08-16부터 이 날까지 열 번 넘게
등재됐는데 하나도 고쳐지지 않았다면, 문제는 항목이 잊히는 것이 아니라 **소유 축이 이 명령을
자기 사거리로 보지 않는다**는 것이다. 소유 축은 `v1-4-0-automation-modernization` 계열이다.

## 종료 이후에도 남는 일

1. **`/mccp:pr --args=--decision orchestrator-step-wiring-m2`** — STATE.md의 Next Step. 브랜치명이
   plan 이름과 달라 slug fallback이 직전 milestone을 집어올 수 있으므로 `--decision`을 명시한다.
2. **머지 확인 후 PRD M2 status를 `complete`로 정정** — 위 미충족 1번. 그 시점에 PRD 전체가
   완료되므로 `/mccp:archive-complete`(사람 게이트)가 후속이다.
3. **`/mccp:pr` 진입 직전 version 재확인** — 현재 `plugin.json` = `1.34.4`이고
   `version-declaration-guard`가 `ok:true` · `violations: []` · 4면 일치를 확인했다. 자식
   브랜치는 번호를 선언하지 않는다(§3.7 우산 결정 1). report Task 11의 `1.35.0` 선언은 그
   규칙 전환으로 **철회된 상태**다.
4. **`/mccp:milestone-close` 본문 결함 4축** — 위 Deviation. 새 등재가 아니라 **재현 카운트
   갱신**을 backlog에 1행 append했고(2026-09-04), 거기에 새 축 하나를 붙였다: 본문 경로를
   `${CLAUDE_PLUGIN_ROOT}`로 통일해도 hook이 캐시에서 로드되는 갈림은 닫히지 않는다.
5. **supersession 배선의 라이브 관측** — test와 합성 실행으로만 검증됐다. 라이브 `/mccp:work`
   완주는 캐시 판본이 이 브랜치를 따라잡은 뒤에야 가능하다.
6. **선재 test 실패 2축** — `plan-review-cli-emit.test.js` 4건 + `meta-research.test.js:583`.
   둘 다 M2와 무관하며 backlog 등재. 전자는 라운드 원장을 오염시키므로 PR 전에 돌리지 않는다.

## Provenance
- Lock run_id        : 9e32e42c-0a21-4af2-9c05-8a7eaa4e0ab0
- Lock owner session : unknown (기록된 값 — 실제 세션은 1d696bc7-3e7b-458d-803e-b9fd1d6906b7, 위 Deviation 2 참조)
- Plan source        : .claude/plans/orchestrator-step-wiring-m2.plan.md
- Detection signal   : {"row":2,"name":"halt-step-recording","plan":".claude/plans/orchestrator-step-wiring-m2.plan.md","status":"in-progress"}
- mccp version       : 1.34.4
