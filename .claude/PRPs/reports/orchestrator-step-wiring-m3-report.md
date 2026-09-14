# Implementation Report: instrumentation-closeout (orchestrator-step-wiring M3)

**Plan**: `.claude/plans/orchestrator-step-wiring-m3-rev2.plan.md`
**Branch**: `c2-orchestrator-step-wiring`
**Baseline**: `ffa8317`
**Implement receipt**: `.claude/receipts/mccp-implement-codex/orchestrator-step-wiring-m3-rev2.json`

## Summary

M1·M2가 자기가 고친 축 옆에 남긴 결함과 이 PRD 자신의 Open Questions를 닫았다. 가장 무거운
하나는 시한폭탄이었다 — A1의 anti-gaming 가드가 기준선 **부재**를 급증의 증거로 읽어,
`startupCount > 50`을 넘는 순간 지표를 통째로 `invalid`로 죽이게 돼 있었다. 부호를 바로잡고,
그 대가(가드가 영구히 잠든다)를 숨기지 않고 배너 토큰으로 표면화했다.

**두 축은 완료되지 않았고 그 사유는 코드가 아니라 배포다.** 설치된 plugin cache가 M1·M2
배선을 갖지 않아(`1.33.6`, `A1_AXIS_KINDS` 0건) 위치 독립성과 supersession 발동을 이 환경에서
라이브로 관측할 수 없다. 저장소 코드는 정상이고 단위 test가 그것을 고정한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 12 (표) | 13 (registry.js 대신 orchestration.md + report 신규) |
| Tasks | 9 (Task 3 삭제) | 7 완료 · 1 조건부 미수행 · 1 관측 불가 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | A1 spike 가드 부호 정정 | 완료 | `spikeBaselinePresent` 논리곱 + present-only `spike_guard`/`spike_guard_reason` 4개 반환 분기 전부에 부착 |
| 2 | 배너 값 전건 좁히기 | 완료 | 텍스트·JSON 양 경로에서 `worktree`가 `safeField` 통과 + 빈 값 구성요소째 생략. 주석의 "네 필드"를 "다섯 구성요소"로 정정 |
| 3 | (삭제됨) | 해당 없음 | L2 패널이 전제를 반증. 번호 미재사용 |
| 4 | A2 분자/분모 동일 모집단 | 완료 | `samples`를 `sessions` → `localSessions` |
| 5 | reader 측 격리 2번째 축 | 완료 | `dirIsShared && !A1_AXIS_KINDS.has(kind)` 논리곱이 세션 누적 블록 **전체**를 감쌈(Codex F1). 독립 계수기는 블록 밖 유지 |
| 6 | 토글 영속 사유 기록 | 완료(편차) | 착지면이 `registry.js` note 열 → `docs/environment/orchestration.md`. 그 열이 실재하지 않았다 |
| 7 | Open Questions 5건 확정 + PRD M3 행 | 완료 | `scan.js`가 M3를 원시 행으로 인식(`archivable:false`), `goal-detect`가 plan 경로 해소 |
| 8 | backlog 정리 | 완료 | 삭제 0건 · 해소 표시 + 신규 등재. 파서 1498행 전건 인식 |
| 9 | escalation 플래그 해소 | **조건부 미수행** | 아래 참조 |
| 10 | 라이브 `/mccp:work` 완주 관측 | **관측 불가** | 아래 참조 |

### Task 9 — 지우지 않은 것이 정직한 결과다

plan은 `escalate_pending_decision_id: orchestrator-step-wiring-m1`을 해소하라고 지시했다.
그러나 Implement-Codex R1 F3 흡수가 clear를 **decision이 M1일 때만** 수행하도록 좁혔고,
실측 시점의 값은 이미 `orchestrator-step-wiring-m3-rev2`였다 — 이 사이클의 plan receipt가
divergent를 봉인하며 `write.js:1213-1234`가 escalation을 재점화했기 때문이다.

무조건 clear는 **살아 있는 M3-rev2 알람**을 M1 머지를 근거로 지우는 것이 된다. 하지 않았다.
같은 이유로 Acceptance의 "두 소비 표면에서 침묵" 항목은 이 사이클에 **충족되지 않는다**.
구조적 결함(수명이 끝난 decision에는 후속 clean receipt가 없어 clear가 영구 도달 불가)은
backlog 등재 상태로 남는다.

### Task 10 — 관측 자체가 불가능하다

`/mccp:work` 완주 전 baseline(원문):

```
$ node plugins/mccp/scripts/lib/work-orchestrator.js last-halt --json
{"step":"implement","site":"3.preflight","ts":"2026-09-03T06:25:42.446Z","reason":"next-step reported HALT before implement","work_unit":"orchestrator-step-wiring-m1","worktree":"mccp","self":false}
```

완주 후 값은 **없다**. 완주를 돌려도 의미 있는 관측이 나오지 않기 때문이다 — 설치 cache
`1.33.6`의 `commands/work.md`에 M2가 배선한 `record-step` 호출이 **0건**이다(worktree는 3건).
hook·command 본문은 worktree가 아니라 cache에서 실행되므로, 완주해도 supersession 경로가
아예 존재하지 않는 본문이 돈다. 배선의 *존재*는 `work-command-body.test.js`가 정적으로
고정하고 있으나 *발동*은 이 환경에서 반증 불가다.

닫히는 조건은 cache가 M1·M2 이후 버전을 담는 것이며, 사이클 중 관측이 필요하면
`docs/dogfood-install.md`의 `claude --plugin-dir <worktree>/plugins/mccp` 경로를 쓴다
(CLAUDE.md §3.7 v1.34.5 정정 — cache 직접 copy는 금지).

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | Pass | 변경 `.js` 7개 `node --check` 전건 ok. type-check/lint 스크립트는 이 저장소에 없음 |
| Unit Tests | Pass | in-scope 11 suite **204 pass / 0 fail** · state 217 pass |
| Build | N/A | 빌드 단계 없음 |
| Integration | N/A | 서버 없음 |
| Edge Cases | Pass (1 선재 실패) | 아래 |

Validation 항목별 실측:

- **V1 in-scope suite** — 204 pass / 0 fail
- **V2 derive** — **fail 1**: `derive/tests/mask.test.js` "default derive emits masked model".
  `toggle_usage.error` · `exclusion_doc_drift[0]` · `B3.invalid_reason` 3곳이 절대경로를 leak.
  **선재 확정** — `git archive HEAD`로 뽑은 M3 미포함 트리에서도 동일하게 fail 1. 인과 경로 0
  (diff에 `toggle`/`mask`/`measurement-design` 없음). backlog 기등재(2026-09-07 MEDIUM)
- **V2 state** — 217 pass / 0 fail
- **V3 위치 독립성** — **미성립**. c2 `startups=2` · main `0` · c3 `1`. 원인은 배포 간극(아래)
- **V4 spike 가드** — `startups=51` 기준선 부재 → `status=computed` · `spike_guard=dormant`
- **V5 env-contract lint** — L1~L12 ok
- **V6 PRD 파싱** — M3 행 인식 · `archivable:false` · `goal-detect`가 plan 경로 해소
- **V7 version guard** — `ok: no version declaration on this branch`
- **V8 삭제 검증** — 삭제 0건

### V3 상세 — 코드가 아니라 cache다

세 위치의 A1 분모가 갈리는 원인을 원장까지 추적했다:

- 공유 corpus `<git-common-dir>/mccp/msw-events`가 **존재조차 하지 않는다**
- 모든 `task_started`가 worktree-local에 있다 (c2 4건 · main 0건 · c3 3건)
- 그런데 저장소 코드의 오라클은 정상이다 —
  `resolveEventsDirInfo({kind:"task_started"})` → `{"dir":".../.git/mccp/msw-events","shared":true}`
- 설치 cache `1.33.6`의 `scripts/state/msw-events.js`에 `A1_AXIS_KINDS`가 **0건**

즉 이벤트를 쓰는 것은 cache의 M1 이전 본문이고, 오늘 이 세션이 쓴 `task_started` 2건
(`00:29:08Z`, `00:34:03Z`)도 로컬에 착지했다. M3가 만든 회귀가 아니다.

### Design Grounding

| Field | Value |
|---|---|
| Verdict | `anchor_clean` |
| Mode | `enforce` |
| Rendered delta | no (control-plane only → no-op) |
| Baseline | `ffa8317` |
| Advisories | 없음 |

### Design Finish

`phase:"finish"` 5종(`clarify`·`distill`·`harden`·`optimize`·`polish`)이 전부 `recommend`로
강등됐다 — `renderingSurface=0`(diff에 `.tsx/.css/.html` 0건)이므로 오라클의 정직한 답이다.
invoke 0건이라 적용할 finding도 없다. receipt에 18건(pre 13 + finish 5) restamp 완료.

design-critique R0은 `CONVERGED`(cap=2, 미소진). 4개 Output Constraints 전건 통과, 남은 위반은
LOW 1건(배너 중복 진술)이라 §3.14대로 backlog 이연. `audit`은 invoke되어 LOW 1건(배너 폭) 이연.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/index.js` | UPDATED | +39 / -6 |
| `plugins/mccp/scripts/lib/msw-metrics/cli.js` | UPDATED | +12 / -2 |
| `plugins/mccp/scripts/derive/sources/session-activity.js` | UPDATED | +83 / -30 |
| `plugins/mccp/scripts/lib/work-orchestrator.js` | UPDATED | +20 / -4 |
| `plugins/mccp/scripts/lib/tests/msw-a1-boundary.test.js` | UPDATED | +132 |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | UPDATED | +100 |
| `plugins/mccp/scripts/lib/tests/work-halt-record.test.js` | UPDATED | +77 |
| `docs/environment/orchestration.md` | UPDATED | +10 |
| `.claude/prds/orchestrator-step-wiring.prd.md` | UPDATED | +33 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | +29 |
| `.claude/plans/orchestrator-step-wiring-m3.plan.md` | RENAMED → `-rev2` | +356 |
| `.claude/notes/orchestrator-step-wiring-m3-implement-codex.md` | CREATED | 신규 |
| `.claude/PRPs/reports/orchestrator-step-wiring-m3-report.md` | CREATED | 이 파일 |

`plugins/mccp/.claude-plugin/plugin.json`은 **건드리지 않았다**(우산 결정 1 · V7 통과).

## Deviations from Plan

1. **Task 6 착지면** — `env-contract/registry.js`의 "note 열"이 실재하지 않아
   `docs/environment/orchestration.md`로 옮겼다. L2 architect/HIGH와 Implement-Codex F2가
   독립적으로 같은 지목·같은 권고를 냈다. backlog 등재(2026-09-07 MEDIUM).
2. **Task 5 가드 범위** — plan은 엔트리 생성만 막게 읽혔으나 Codex F1 흡수로 세션 누적 블록
   **전체**를 감쌌다. 생성만 막으면 앞선 공유 A1 이벤트가 만든 엔트리에 외래 span이 실린다.
3. **Task 9 미수행** — 위 참조. 조건부 판정의 정상 결과이지 누락이 아니다.
4. **Task 10 미관측** — 위 참조. 환경 제약이며 코드 결함이 아니다.

`plan-conflict-detector` 판정: `conflict: false` (minor deviation).

## Issues Encountered

- **`derive/tests/mask.test.js` red** — 선재. A/B로 확증(HEAD 트리에서도 동일 실패). M3 사거리
  밖(UI3)이라 고치지 않고 backlog 유지.
- **cache 배포 간극** — 위 V3·Task 10. HIGH로 backlog 기등재(2026-09-07).
- **round cap 소진** — 이 decision의 Codex 예산이 이미 1/1이라 재진입에서 Codex가 발화하지
  않았다(`round-cap-reached`, spawn 0, `durationMs=0`). §3.16대로 `divergent`로 봉인하고
  진행했으며 verdict를 위조하지 않았다. cross-gate dedupe는 닫힌 채로 남아 `/mccp:pr`에서
  PR-Codex가 반드시 발화한다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `msw-a1-boundary.test.js` | +132줄 | Task 5 세 단언(비-A1 차단 · A1 분모 증가 · 자기 세션 보존) |
| `msw-metrics.test.js` | +100줄 | Task 1 짝 단언(부호) + 가시성 · Task 4 모집단 |
| `work-halt-record.test.js` | +77줄 | Task 2 제어문자 좁히기(텍스트·JSON) |

in-scope 11 suite 합계 **204 pass / 0 fail**.

## Acceptance

- [x] Validation passes (선재 1건 제외 — 사유 기록)
- [x] Patterns mirrored, not reinvented
- [x] A1 spike 가드 짝 단언 + DD2 주석
- [x] A1 가드 가시성 — 임계 아래(실측 3 · santa R4 정정, 이전에 23으로 적혔던 값)에서도 `spike-guard=dormant` 출력 실측
- [x] reader 가드 세 단언
- [x] 배너 좁히기 — 텍스트·JSON 양 경로
- [x] PRD M3 행 + Open Questions 5건 확정
- [x] 브랜치가 `plugin.json` version을 선언하지 않는다
- [ ] **위치 독립성 회귀 없음** — 미성립(배포 간극, M3 무관). V3 상세 참조
- [ ] **escalation 해소** — 조건부 미수행. Task 9 참조
- [ ] **라이브 관측** — 관측 불가. Task 10 참조
- [ ] 게이트/경로 1회 완주 — `/mccp:pr`까지 가야 성립

## Next Steps

- [ ] `/mccp:santa-loop` — `fix-task-applied.md`가 지시하는 dual-reviewer escalation
- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — dedupe가 `divergent`에서 닫혀 있으므로 PR-Codex가 발화한다

---

## Addendum — 2026-09-08 closure 세션 실측 (사후 추가)

이 절은 report 본문이 쓰인 뒤(14:58) `/mccp:milestone-close` 세션에서 재측정한 결과다.
본문의 판정 중 **두 건이 뒤집혔고**, 뒤집힌 근거를 함께 남긴다.

### A. 회귀 재실행 — 본문보다 강한 결과

| 축 | 본문 기록 | 재측정 (2026-09-08, Linux node v22.23.2) |
|---|---|---|
| in-scope 11 suite | 204 pass / 0 fail | **223 pass / 0 fail** (santa R2~R4 추가분 포함) |
| state | 217 pass / 0 fail | 217 pass / 0 fail |
| derive | fail 1 (선재) | 146 pass / **fail 1** — 동일. `mask.test.js "default derive emits masked model"` |
| V4 spike 가드 | `computed` | `computed` · `spike_guard=dormant` |
| V5 env-contract | L1~L12 ok | L1~L12 ok |
| V7 version guard | `ok` | `ok: no version declaration on this branch` |
| V8 삭제 검증 | 0건 | 0건 |

`derive/tests/mask.test.js` 는 main 이 머지한 ci-full-suite M3 의 **격리 목록에 이미 등재**돼 있다
(`.github/test-suite-exclusions.json`, ticket `backlog:ci-full-suite-linux-red-mask`, 사유
"Linux-only red … green on Windows local"). 즉 이 red 는 머지 차단 게이트를 막지 않는다.

### B. **acceptance 9(위치 독립성) — 미충족 → 충족으로 뒤집힘**

본문 V3 는 "미성립. 공유 corpus `<git-common-dir>/mccp/msw-events` 가 존재조차 하지 않는다"
고 적었다. 그 관측은 그 시점에 정확했으나 **원인 진단이 불완전했다** — 저장소는 이 상태의
해소 도구를 이미 담고 있었다. M1 Task 3 이 만든
[msw-events-common-dir.js](../../../plugins/mccp/scripts/migrations/msw-events-common-dir.js) 가
그것이고, 헤더가 문제를 정확히 서술한다:

> reader가 두 위치를 다 읽으므로 유실은 없지만, **A1 baseline이 위치마다 다른 상태**는 그대로다
> — 이 milestone의 표제 성질이 성립하려면 과거 corpus도 한 곳에 모여야 한다.

즉 reader 가 로컬 ∪ 공유를 읽는 것은 **버그가 아니라 명시된 호환 설계**이고, 위치 독립성에는
과거 로컬 corpus 의 1회 수집이 추가로 필요하다. 그 수집을 실행했다(원본 미삭제 · idempotent ·
marker `state: complete`):

```
$ node plugins/mccp/scripts/migrations/msw-events-common-dir.js
candidates: 25 · new_lines: 25 · skipped_non_a1: 301 · invalid: 0 · unreadable: []
sources: mccp 0 · c0 4 · c1 4 · c11 3 · c2 4 · c3 8 · meta-claude-p-invocation 2
```

수집 후 plan `## Validation` 3 이 지정한 정본 측정을 세 위치에서 돌린 결과:

```
$ cd <위치> && node <c2>/plugins/mccp/scripts/derive/cli.js run --json  → metrics.A1
mccp                          status=computed value=0.07692307692307693 1/13 spike_guard=dormant
c2-orchestrator-step-wiring   status=computed value=0.07692307692307693 1/13 spike_guard=dormant
c3-ci-full-suite              status=computed value=0.07692307692307693 1/13 spike_guard=dormant
```

**세 위치가 같은 값이다.** 분모 13 은 PRD `## Evidence` 가 기록한 저장소 전체 baseline
("착수 13 · 완주 5 = 38.5%")의 **착수 13 과 정확히 일치**한다. 수집 전 값은 `-/1` · `-/3` ·
`1/4` 였다.

**충족의 수명에는 조건이 붙는다 (숨기지 않는다).** 이 수렴은 **일회성**이다 — 설치 cache
`1.33.6` 의 `resolveEventsDir()` 에는 공유 kind/토글/common-dir 분기가 없어 **새 이벤트는
여전히 worktree-local 에 착지**한다. 따라서 이벤트가 더 쌓이면 세 위치는 다시 갈린다. 항구적
해소 조건은 이 PR 이 머지되고 사용자 cache 가 M1 배선을 담는 것이며, 그때까지 재수렴이
필요하면 같은 마이그레이션을 다시 돌리면 된다(idempotent). 즉 **저장소 코드는 이 acceptance
를 만족하고, 남는 것은 배포다.**

### C. **acceptance 11(escalation 해소) — 해소 경로가 특정됐다**

본문 Task 9 는 "구조적 결함(수명이 끝난 decision 에는 후속 clean receipt 가 없어 clear 가
영구 도달 불가)"이라 적었다. 코드를 추적하니 **도달 경로가 있다** —
[write.js:1240-1247](../../../plugins/mccp/scripts/receipt/write.js) 의 역방향 경로는 *같은
decision_id* 에 대해 escalate 하지 않는 receipt 가 쓰이면 플래그를 내린다. 실측:

```
$ node -e '… escalate-detector.detectFromReceipt …'
mccp-plan-codex        escalate=true  trigger=divergent_unresolved
mccp-implement-codex   escalate=true  trigger=divergent_unresolved
mccp-santa-review      escalate=true  trigger=divergent_unresolved
mccp-pr-codex verdict=converged → escalate=false
```

즉 `/mccp:pr` 이 이 decision 에 대해 **converged 한 `mccp-pr-codex` receipt** 를 쓰면
`escalate_pending` 은 자동으로 내려간다. acceptance 11 은 acceptance 4 와 **같은 지점에서**
닫히며, 별도 조치가 필요한 항목이 아니다. 본문의 "영구 도달 불가"는 과했고, 정확한 진술은
**"이 사이클의 게이트가 전부 divergent 라 아직 도달하지 않았다"** 이다.

### D. base 병합과 머지 차단 게이트 (신규 제약)

`origin/main` 이 이 브랜치보다 앞서 나가 병합했다(`e5d274c`, merge commit `b460ff5`).
main 이 그 사이 **ci-full-suite M3(PR #185)** 를 머지해 전수 스위트가 **머지 차단 게이트로
승격**됐고, 이 브랜치도 그 게이트를 받는다. 로컬 실행 결과:

```
$ node scripts/test-suite/run.js --exclude-from .github/test-suite-exclusions.json --json
ok: true · exit_code: 0 · files_total: 386 · files_excluded: 6 · failing: [] · wall_clock 56.7s
$ node scripts/test-suite/gate.js …
blocked: false · reasons: []
message: gate PASSED: measurement complete, suite green, coverage accounted, no residual leakage.
coverage: 98.47% (386/392)
```

병합 자체는 §3.5.1 절차를 따랐다 — main 신규 84 파일 **전건 보존 확인**(missing 0), 삭제 0건,
rename 5건은 leadtime-observability 아카이브 이동. 충돌 2건은 `codex-findings-backlog.md`
(append 표 — 양쪽 보존, 파서 1619행 · invalid 0) 와 `STATE.md`(이 worktree 것 채택).
병합은 plan 해시를 **바꾸지 않았다**(`b4385c9e` 유지).

부수 관측 — 격리 목록의 `msw-m8-producers.test.js` 는 "Linux red, orchestrator-step-wiring 축
귀속"으로 등재됐는데 이 호스트(Linux node v22.23.2)에서 **18 pass / 0 fail** 이다. 격리가
낡았을 수 있으나 `max_excluded_files: 6` 이 pin 돼 있어 해제는 ci-full-suite 축의 조율된
변경을 요구한다. 이 사이클에서 손대지 않고 관측만 기록한다.

### E. 갱신된 acceptance 집계

| 판정 | 본문 | Addendum 이후 |
|---|---|---|
| 충족 | 8 | **10** (9번·11번 판정 갱신 — 11번은 `/mccp:pr` 에서 닫히는 것이 확정됨) |
| 부분 | 1 | 1 (Task 9 조건부 미수행 · Task 10 미관측) |
| 미충족 | 4 | **2** — 4번(게이트 완주, `/mccp:pr` 대기) · 12번(라이브 관측, cache 배포 간극) |

12번은 `claude --plugin-dir <worktree>/plugins/mccp` 로 `/mccp:work` 를 완주해야 성립하며
(docs/dogfood-install.md), 그것은 운영자가 별도 세션에서 실행할 일이다. **합성 record-step 을
주입해 충족시키지 않았다** — 계측 축의 acceptance 를 그 계측 corpus 를 조작해 만족시키는 것은
순환이며 지표 4(halt 기록률)를 오염시킨다.
