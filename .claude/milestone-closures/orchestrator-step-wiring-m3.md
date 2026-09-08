# Milestone Closure — orchestrator-step-wiring-m3

## Milestone
- ID         : orchestrator-step-wiring-m3
- Name       : instrumentation-closeout
- Plan       : .claude/plans/orchestrator-step-wiring-m3-rev2.plan.md
- Status     : done
- Closed at  : 2026-09-08T06:51:43.824Z
- Closed by  : /mccp:milestone-close (run_id=d69e8829-09a8-4198-9724-5a48d02868da)
- mccp version : 1.34.4 (브랜치는 version을 선언하지 않는다 — 우산 결정 1)

## Acceptance Condition

**운영자는 `/goal` loop을 돌리지 않았다.** 같은 PRD의 M2 closure(2026-09-04)와 동일하게 Phase 2
안내 대신 구조화된 질의로 세 축을 결정했고(2026-09-08), 그 선택이 이 closure의 acceptance
기준을 정한다:

```
preflight : dirty state 파일 2건을 chore 커밋으로 정리한 뒤 진입
범위      : closure doc만 작성 — PRD Delivery Milestones의 M3 status는 in-progress로 유지
검증      : 기존 검증 결과를 근거로 종료 (재실행하지 않음)
```

따라서 충족 대상 조건은 자연어 acceptance condition이 아니라 **plan `## Acceptance`의 13개
항목**이다. 이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README
형식 규약). 항목별 판정은 아래 `## Goal Loop Result`가 갖는다.

## Goal Loop Result

verdict=done. 운영자 결정을 요약한 grammar (mask 통과 — `applySecretMask` 반환이 원문과 **바이트
동일** · hit 0건):

```
goal-done:M3 acceptance 13절 중 8절 충족 1절 부분, 미충족 4절은 배포 간극과 조건부 판정으로 사유 기록
```

### small fast model 평가는 일어나지 않았다 — 격리 lock은 실제로 발화했다

`/goal`의 turn-by-turn 평가 loop은 **돌지 않았다.** 운영자가 기존 검증 결과를 근거로 삼는 쪽을
택했으므로, 아래 판정은 평가 모델의 판단이 아니라 **M3 report에 기록된 실행 출력과 이 세션이
직접 실행한 명령의 출력**이다. 숨기지 않고 기록한다 — closure의 감사 가치는 verdict가 아니라
그 verdict가 무엇을 보고 내려졌는지에 있다.

격리 자체는 관측됐다. `goal-phase-lock enter`가 `ok:true`를 냈고, lock이 활성인 동안 이 세션의
호출 2건이 `goal-phase-guard`에 의해 실제로 **BLOCK**됐다:

| # | 시도 | 차단 사유 (원문) |
|---|---|---|
| 1 | `Bash: grep -c "" .claude/prds/orchestrator-step-wiring.prd.md` | `Bash no allowlist match (default-deny during goal-phase) — segment: … (owner-session-match)` |
| 2 | `Write: <scratchpad>/guard-probe.txt` | `tool=Write (write-capable; owner-session-match)` |

`exit`는 `cleared:true`. 두 차단 모두 `owner-session-match` 경로이며 run_id가 이 closure의
것과 일치한다 — cooperative invariant는 산문이 아니라 이 실행에서 기계로 강제됐다.

**정정 기록**: 2번 차단은 guard 헤더 주석(`:12` — *"milestone-closures write"* 를 허용한다고
적힘)과 어긋난다. 실제 코드(`:340`)는 경로와 무관하게 `WRITE_TOOLS` 전건을 deny하고,
BASH_DENY(`:54`)는 `.claude/milestone-closures/`로의 리다이렉트를 명시적으로 막는다. 즉 lock이
활성인 동안 closure doc은 **쓸 수 없다** — 명령 본문 Phase 4가 `exit`를 write보다 앞에 둔 것이
정답이고 주석이 낡았다. 이 closure는 그 순서를 따랐다.

### plan `## Acceptance` 13절 — 8절 충족 · 1절 부분 · 4절 미충족

| # | 절 | 판정 | 근거 |
|---|---|---|---|
| 1 | All tasks complete | **부분** | Task 1·2·4·5·6·7·8 완료(7건) · Task 3 삭제(L2 패널이 전제를 반증, 번호 미재사용) · Task 9 조건부 미수행 · Task 10 관측 불가. 아래 11·12번과 같은 항목 |
| 2 | Validation passes | PASS (선재 1건 제외) | in-scope 11 suite **204 pass / 0 fail** · state **217 pass / 0 fail** · env-contract lint **L1~L12 ok** · 변경 `.js` 7개 `node --check` 전건 ok. `derive/tests/mask.test.js` red 1건은 **선재** — `git archive HEAD`의 M3 미포함 트리에서도 동일 실패, diff에 인과 경로 0. backlog 기등재(2026-09-07 MEDIUM) |
| 3 | 패턴 재발명 없이 mirror | PASS | present-only 필드 부착이 `spike_guard`/`spike_guard_reason` 4개 반환 분기 전부에 동형 적용. reader 격리가 기존 `dirIsShared` 판정을 재사용 |
| 4 | 게이트/경로 1회 완주 | **미충족** | `/mccp:pr` 미진입. 13 커밋 미푸시 상태이며 이 항목은 다음 단계에서 성립한다 — 잔여 작업이 아니라 **순서**다 |
| 5 | A1 spike 가드 짝 단언 + DD2 주석 | PASS | `startupCount=51` · 기준선 부재 → `status='computed'`; 기준선 존재 시 급증 → `status='invalid'`. 두 단언 공존 + "부호 test이지 계약 test가 아니다" 주석 부착 |
| 6 | A1 가드의 가시성 | PASS | **이 closure 세션에서 재실측**: `msw-metrics/cli.js a1` → `A1 작업 단위 완주율 n/a (-/3 · status=forward-only · spike-guard=dormant)`. 임계 아래(분모 3)에서 가드 토큰이 실제로 나타난다 — PRD Risks 첫 줄이 지목한 실패를 회피 |
| 7 | reader 가드 세 단언 | PASS | `dirIsShared && !A1_AXIS_KINDS.has(kind)` 논리곱이 세션 누적 블록 **전체**를 감쌈(Implement-Codex F1 흡수). 비-A1 차단 · A1 분모 증가 · 자기 세션 보존 3단언이 `msw-a1-boundary.test.js`에 공존 |
| 8 | 배너 좁히기 | PASS | 제어문자를 심은 worktree 이름이 텍스트·JSON 양 경로에서 `safeField`를 통과. `work-halt-record.test.js` +77줄이 고정 |
| 9 | 위치 독립성 회귀 없음 | **미충족** | c2 `startups=2` · main `0` · c3 `1`. 원인은 **배포 간극이지 M3 회귀가 아니다** — 저장소 오라클은 정상(`resolveEventsDirInfo({kind:"task_started"})` → `shared:true`)이나 설치 cache `1.33.6`의 `msw-events.js`에 `A1_AXIS_KINDS`가 0건이라 이벤트를 쓰는 것이 M1 이전 본문이다. 공유 corpus `<git-common-dir>/mccp/msw-events`는 존재조차 하지 않는다. backlog HIGH 기등재(2026-09-07) |
| 10 | PRD M3 행 + Open Questions 5건 확정 | PASS | `archive-complete/scan.js`가 M3를 원시 행으로 인식(`archivable:false`) · `goal-detect`가 plan 경로를 해소(아래 §도구 정정 참조) |
| 11 | escalation 해소 | **미충족 (의도된 결과)** | **이 closure 세션 실측**: STATE.md `escalate_pending: true` · `escalate_pending_decision_id: orchestrator-step-wiring-m3-rev2`, 그리고 이 세션 SessionStart가 `## Escalation Pending`을 주입했다 — 두 소비 표면 모두에서 살아 있다. plan은 M1 알람의 해소를 지시했으나 실측 시점의 decision은 이미 M3-rev2였고, 무조건 clear는 **살아 있는 알람을 M1 머지를 근거로 지우는 것**이 된다. 하지 않은 것이 정직한 결과다(Implement-Codex R1 F3 흡수). 구조적 결함(수명이 끝난 decision에는 후속 clean receipt가 없어 clear가 영구 도달 불가)은 backlog 등재 유지 |
| 12 | 라이브 관측 (`/mccp:work` 완주 전후 `last-halt`) | **미충족** | 9번과 같은 원인. 설치 cache `1.33.6`의 `commands/work.md`에 M2가 배선한 `record-step` 호출이 **0건**(worktree는 3건)이고, hook·명령 본문은 worktree가 아니라 cache에서 로드된다(§3.7). 완주해도 supersession 경로가 없는 본문이 돈다. 배선의 *존재*는 `work-command-body.test.js`가 정적으로 고정하나 *발동*은 이 환경에서 반증 불가 |
| 13 | 브랜치가 `plugin.json` version을 선언하지 않는다 | PASS | **이 closure 세션에서 재실측**: `version-declaration-guard --json` → `ok:true` · `violations:[]` · `new_changelog_headings:[]` · 4면 전부 `1.34.4`(base와 동일) |

미충족 4절의 성격은 서로 다르며, **어느 것도 "M3 작업이 남았다"가 아니다** — 4번은 순서(다음
단계에서 성립), 9·12번은 환경(cache 배포 간극, 코드 무관), 11번은 의도된 비수행(살아 있는
알람 보존)이다. 이 구분이 verdict를 `done`으로 둔 근거이며, 그럼에도 네 항목을 체크하지 않고
남긴 것은 closure가 주장을 이기지 못하게 하기 위해서다.

### 게이트 상태 — 승인이 아니라 정직한 비수렴이다

| receipt | round | verdict | converged |
|---|---|---|---|
| `mccp-plan-codex/orchestrator-step-wiring-m3-rev2` | 1 | `review_verdict: divergent` | `resolution.converged: true` (신뢰 불가 필드 — §3.12) |
| `mccp-implement-codex/orchestrator-step-wiring-m3-rev2` | 1 | `codex_verdict: divergent` | 〃 |
| `mccp-santa-review/orchestrator-step-wiring-m3-rev2` | 1 | `review_verdict: divergent` · `santa_exit_reason: cap_reached` | 〃 |

santa-loop은 `santa_rounds: 5` · `santa_cap: 5` · `santa_entries: 13` · `santa_blind_rounds: 5` ·
`santa_model_families: 2`로 라운드 상한에서 봉인됐다. R2 HIGH 2건 · R3 HIGH 5건 · R4 HIGH 5건을
전부 흡수하고 각 수정에 mutation 검증된 회귀 test를 붙였으나, **마지막 라운드의 수정을 검증한
fresh round는 없다.** verdict는 위조하지 않고 `divergent` 그대로 봉인했다(§3.16).

Implement-Codex 재진입에서 Codex는 **발화하지 않았다** — 이 decision의 예산이 이미 1/1이라
`round-cap-reached`(spawn 0 · `durationMs=0`)로 short-circuit됐고, `plan`·`prp-implement` 매핑
규칙대로 `divergent`로 봉인됐다(§3.3). 예산 소진은 가용성 문제가 아니므로 advisory 경로를
지나지 않았다.

**결과**: cross-gate dedupe는 `divergent`에서 **닫힌 채로 남는다**. 다음 `/mccp:pr`에서
PR-Codex가 반드시 발화한다 — 이 milestone의 cross-model review는 우회되지 않았다.

### design 축

| 축 | 값 |
|---|---|
| design-critique | R0 `CONVERGED` (cap=2, 미소진). 4개 Output Constraints 전건 통과, 잔여 LOW 1건은 §3.14대로 backlog 이연 |
| design grounding | `anchor_clean` · mode `enforce` · rendered delta `no` (control-plane only → no-op) · advisory 0 |
| impeccable routing | 18건 restamp (pre 13 + finish 5). `phase:"finish"` 5종 전부 `recommend` 강등 — `renderingSurface=0`이므로 오라클의 정직한 답, invoke 0건 |

## Deviations — 이 closure가 규정대로 하지 **않은** 것

### 1. Phase 4 plan-body 스탬프를 수행하지 않았다 (3연속 skip의 4번째)

명령 본문 Phase 4는 plan 본문에 `## Milestone Closure Provenance` 섹션 추가를 의무화하지만
(option B custody anchor), 그 편집이 상위 receipt의 `plan_hash`를 어긋나게 해 **다음
`/mccp:pr`을 자기 가드로 차단한다.** backlog에 HIGH로 등재된 **3회 재현** 결함이다:

- 2026-08-16 gate-guard-integrity M3 — A/B 실측: 스탬프 전 `ok:true, stale:[]` → 스탬프 후
  `ok:false`, stale 2건(`plan file hash differs from receipt`)
- 2026-08-19 (MEDIUM) — 2차 재현
- 2026-08-21 santa-delta-review M1 — 3차 재현. `planAwareMarkdownHash`의 정규화가 스탬프
  섹션 carve-out을 갖지 않음을 코드로 확인(`hash.js:153-160`)

같은 PRD의 M2 closure도 스탬프를 하지 않았다. 이번에도 하지 않았고, 그 사실을 여기 기록한다 —
**custody anchor는 이 closure에 대해 실질적으로 미작동이다.** 대체 anchor는 이 문서 자체와
git history이며, plan 본문은 receipt가 봉인한 hash 그대로 남는다.

### 2. `/goal` 라이브 loop 미수행

위 `## Acceptance Condition` 참조. 운영자 결정이며 격리 lock은 실제로 발화했다.

### 3. PRD status flip 미수행

M3 행은 `in-progress`로 유지한다. M1·M2가 머지 시점에 flip된 관례를 따르며, STATE.md와
CLAUDE.md가 적어 둔 「M3는 머지 전까지 in-progress」와 일치한다. PRD 전체 완료 판정과
`/mccp:archive-complete` 자격은 머지 이후로 미룬다.

## 도구 정정 — 설치 cache가 낡아 detect가 거짓 음성을 냈다

이 closure를 실행하며 발견했고, **worktree 코드에는 이미 fix가 있다**:

명령 본문이 하드코딩한 `cache/mccp/mccp/1.33.6`의 `goal-detect.js`는 M3 행에
`reason:"plan-missing"`을 냈다. 원인은 `extractPlanPath`의 whole-cell 백틱 regex
(`` /^`+([^`]+)`+$/ ``)가 이 저장소가 실제로 쓰는 복합 셀
(`` `<plan>` · 결과 `<report>` ``)을 못 맞추는 것이다 — 백틱이 경로 해소까지 살아남아
실재하는 plan을 `plan-missing`으로 보고한다. M1·M2 행은 `status=complete`라 `already-closed`
에서 단락돼 이 형태가 표면화된 적이 없었다.

| 실행 사본 | `goal_signal` | `plan` | `reason` |
|---|---|---|---|
| cache `1.33.6` | `false` | 원시 셀(백틱 포함) | `plan-missing` |
| worktree | `true` | `.claude/plans/orchestrator-step-wiring-m3-rev2.plan.md` | `ok` |

worktree 사본은 first-span 추출(`` /`([^`]+)`/ ``)을 가지므로 정상 해소한다. 이 closure의
Phase 1은 worktree 사본으로 돌렸고, **설치 상태는 건드리지 않았다**(§3.7 v1.34.5 — cache 직접
copy 금지). `goal-phase-lock.js`는 두 사본이 **바이트 동일**이라 lock 경로 drift는 없다.

부수 관측 1건 — 명령 본문 Phase 4의 마스킹 스니펫 `mask(process.argv[1]).text`는 깨져 있다.
`applySecretMask`는 **문자열을 반환**하므로 `.text`는 `undefined`이고
`process.stdout.write(undefined)`는 throw한다. 이 closure는 반환값을 그대로 썼다.

## Provenance
- Lock run_id        : d69e8829-09a8-4198-9724-5a48d02868da
- Lock owner session : b559c2ef-f4cd-48bb-a3ed-e007b254e3e1
- Lock path          : .claude/state/goal-phase.lock (enter `ok:true` → exit `cleared:true`)
- Plan source        : .claude/plans/orchestrator-step-wiring-m3-rev2.plan.md
- Report             : .claude/PRPs/reports/orchestrator-step-wiring-m3-report.md
- Detection signal   : `{"row":3,"name":"instrumentation-closeout","plan":".claude/plans/orchestrator-step-wiring-m3-rev2.plan.md","status":"in-progress"}` (worktree `goal-detect.js`, `reason:"ok"`)
- Branch / HEAD      : `c2-orchestrator-step-wiring` / `bbb7121`
- Preflight commit   : `bbb7121 chore(state): consume the M3-rev2 fix-task escalation`
- Review corpus      : .claude/reviews/santa-review-orchestrator-step-wiring-m3-rev2.md
- mccp version       : 1.34.4 (미선언 — 우산 결정 1, version-declaration-guard `ok:true`)

## Next
- `/mccp:pr` — dedupe가 `divergent`에서 닫혀 있으므로 PR-Codex가 발화한다. 이 단계에서
  acceptance 4번(게이트/경로 1회 완주)이 성립한다
- 머지 후 PRD Delivery Milestones의 M3 status를 `complete`로 flip → PRD 전체 완료 →
  `/mccp:archive-complete` 자격
- backlog 잔여 HIGH 2건(cache 배포 간극 · escalation clear 영구 도달 불가)은 별도 사이클 소유
