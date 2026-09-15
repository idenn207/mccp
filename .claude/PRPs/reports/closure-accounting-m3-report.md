# Implementation Report: closure-accounting M3 — registry-reachability

**Plan**: `.claude/plans/closure-accounting-m3.plan.md` (그대로 활성 — 아카이브는
`/mccp:archive-complete` 소관) · **Branch**: `c11-closure-accounting` · **실행일**: 2026-09-14

## Summary

M3는 PRD가 열어 둔 양자택일("패널 모드에서 발화시킨다" 대 "enum을 은퇴시킨다")을 **둘 다
기각하고** 이관 + 정직화로 착지했다. 셋을 했다.

1. `accepted` finding이 부채 분모에서 조용히 빠지던 누수를 닫았다(`state !== 'closed'`).
2. `closure report`의 `findings-registry` 행이 채널별 **producer 도달성**을 함께 싣는다 —
   낮은 종결률이 "부채가 안 갚혔다"로 인용되지 못한다.
3. 패널 판정 producer를 `diverse-agent-review` #1.5로 이관하고, `CLOSURE_FROM_ADJUDICATION`
   경유를 **소스 대조 test로 강제되는 계약**으로 남겼다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small — 신규 파일 2, 편집 9 |
| Files Changed | 12 | 12 (plan 목록과 일치, `plugin.json` diff 0) |
| 라이브 registry 규모 | 1280 (plan Evidence, 09-14 초) | **1505** (이 실행 시점 · 게이트가 그 사이 더 열었다) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `accepted`를 부채로 센다 | 완료 | test-first · **수정 전 red 실측** |
| 2 | 도달성 선언 + 채널 분류 | 완료 | `PRODUCER_CHANNELS`(frozen) · `channelOf` · `UNATTRIBUTED_CHANNEL` export |
| 3 | falsifier test (신규) | 완료 | R1~R8 8건 · **mutation 2건 red 실측** |
| 4 | registry 행에 `producers[]` | 완료 | mock 11건 spread 교체 · 불변식 4건 · **mutation red 실측** |
| 5 | 텍스트 출력 | 완료 | 채널 5행 · CLI exit 0 유지 |
| 6 | 계약 문서화 | 완료 | `feedback-loop-design.md` · DAR PRD · 본 PRD Open Question · CHANGELOG |
| 7 | 라이브 1회 완주 | 완료 | 아래 4항목 값 대조 |

## Mutation 실측 (Acceptance 요구)

| 대상 | mutation | 결과 |
|---|---|---|
| Task 1 | 수정 **전** 원본 필터(`state === 'open'`) | `not ok 7` — accepted 1건이 items에서 빠짐 (`pass 30 / fail 1`) → 수정 후 `pass 31 / fail 0` |
| Task 3 (R4) | 패널 행 `closure_types`에서 `'deferred'` 제거 | `not ok 4 - (R4)` (`pass 7 / fail 1`) → 복원 후 green |
| Task 3 (R3) | 패널 행 `adjudicated: false → true` | `not ok 3 - (R3)` (`pass 7 / fail 1`) → 복원 후 green |
| Task 4 (p4) | `report.js`의 open 계수를 `state === 'open'`으로 좁힘 | `not ok 32 - (p4)` (`pass 31 / fail 1`) → 복원 후 `pass 32 / fail 0` |
| Task 3 (R8) | 임시 트리에 미선언 emitter · 맵 우회 adjudicator 배치 | 스캐너가 **둘 다 잡음**(주석 리터럴·test 파일은 잡지 않음) |

## Validation Results

`MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 <7개 파일>` → **tests 168 / pass 168 / fail 0**

| Level | Status | Notes |
|---|---|---|
| Unit/invariant tests | Pass | 신규 12건(R1~R8 · p1~p4) 포함 |
| `closure report --json` | Pass | exit 0 · `degraded: []` |
| `closure report` (텍스트) | Pass | 채널 5행 육안 확인 |
| `version-declaration-guard.js` | Pass | `no version declaration on this branch` (exit 0) |
| 삭제 검증 (§3.5.1) | Pass | `git diff --diff-filter=D origin/main...HEAD` → 0건 |
| Design Grounding | N/A | design trigger 미발화(`design_signal=false`) — 렌더링 표면 0 |

### 기존 스위트 무손상 (plan Risk 완화 절차)

`report.test.js`의 registry mock 11건을 실제 모듈 spread로 교체한 **직후, 새 test를 더하기
전에** 기존 28건 green을 먼저 확인했다(`pass 28 / fail 0`).

## Task 7 — 라이브 1회 완주 (값 대조)

`node plugins/mccp/scripts/lib/closure/cli.js report --json` · 2026-09-14 · `degraded: []`

1. **`live.by_source.findings` = registry non-closed 레코드 수** — `1484 = 1484` ✓
   (Task 1 전이면 `1481`, 즉 accepted 3건만큼 작았다)
2. **accepted 레코드가 live inventory에 있다** — 3건 전부 ✓
   (`findings:6d26625a1de32d04` · `findings:bf6675245595f225` · `findings:3c6f317265c67b03`)
3. **`producers` 값** ✓
   - `plan-review-panel.reachable.adjudicated = false` · `closure_types = ["deferred"]` ·
     `pending_owner = "diverse-agent-review #1.5"`
   - `plan-codex-runner.observed.accepted = 3` (≥ 1)
   - 분할: `Σ observed.total = 1505 = ledger.total` · `Σ observed.closed = 21 = ledger.closed`
4. **격차는 증가 방향으로만 기록하고 재봉인하지 않았다** ✓ — `denominator_gap.count = 454`
   (Task 1 전 `451`). 재봉인은 실행하지 않았다(UI3 — 리포트는 게이트가 아니다).

### 실제 출력 (LEDGER CLOSURE RATES 절)

```
  findings-registry
    Closed:        21 / 1505
    Pct:           1.4%
    Denominator:   live registry entries
    Producers:
      plan-codex-runner  open 3 / total 5 · accepted 3 · closures reachable: deferred, rejected, invalidated · adjudication: reachable
      plan-review-panel  open 1275 / total 1294 · accepted 0 · closures reachable: deferred · adjudication: unreachable (owner: diverse-agent-review #1.5)
      santa-loop  open 206 / total 206 · accepted 0 · closures reachable: fixed · adjudication: unreachable
      plan-review-l3  not registered in the findings registry
      unattributed  open 0 / total 0 · accepted 0 · not a declared producer
```

**이 다섯 줄이 M3의 실질이다.** `1.4%`는 이제 그 자체로 읽히지 않는다 — 분모의 **86.0%**를
차지하는 패널 채널이 `adjudication: unreachable`이고, 그 배선의 주인 이름이 같은 줄에 있다.

### +3 격차 증가는 회귀가 아니다 (DD3)

세 accepted finding의 판정 이벤트는 `2026-09-08T07:34:03.674Z`(2건) · `07:47:13.461Z`(1건)이고
봉인은 `2026-09-08T08:25:23.521Z`다. 봉인이 **뒤**이므로, 당시 `state === 'open'` 필터가 그 셋을
이미 제외한 채로 봉인이 떠졌다 — 실측: 세 `item_id` 모두 sealed items에 **없다**. 즉 이번 +3은
새로 생긴 부채가 아니라 **봉인 당시 조용히 빠져 있던 부채가 드러난 것**이다. 재봉인 판단은
운영자 몫이다(M2 경로).

## Deviations from Plan

1. **`## Codex Implementation Review`를 plan 본문이 아니라 `.claude/notes/`에 썼다.**
   명령 본문 2.5.4는 plan 본문 주입을 지시하지만, 이 저장소에서 그 편집은 plan 게이트가 봉인한
   `plan_hash`를 즉시 깨뜨린다 — **실측**: 주입 직후 `validate --command mccp:prp-implement`가
   exit 2 · `stale:[mccp-plan-codex]`(`4d712e…` → `ca14537…`). `planAwareMarkdownHash`는 덧붙인
   절을 carve-out하지 않는다. 선례도 같다: M2 plan은 게이트 이후 편집되지 않았고 구조적 해시가
   receipt와 정확히 일치한다. 편집을 되돌리고 명령 본문이 함께 허용하는 대체 표면
   (`.claude/notes/closure-accounting-m3-implement-codex.md`)에 기록한 뒤 receipt를 다시 써
   chain을 `ok:true`로 회복했다.
2. **plan `## Validation`의 test 경로 오기를 정정해 실행했다.**
   `plugins/mccp/scripts/state/tests/findings-registry.test.js`는 존재하지 않는다(실제:
   `plugins/mccp/scripts/lib/tests/findings-registry.test.js`). backlog가 이미 LOW로 기록한
   항목이며, 그대로 돌리면 ENOENT가 코드 회귀로 오인된다.
3. **base 병합**: plan Risk 표대로 M2 PR #194 머지를 기다렸다가 `origin/main`을 fast-forward로
   받은 뒤 착수했다(트리 동일 — 충돌 0).

4. **`plan-conflict-detector`가 `file-expansion`을 보고한다 — 흡수하지 않고 여기 적는다.**
   이번 실행이 만진 파일만으로 재측정하면 미계획 **2건**이고 둘 다 게이트 산출물이다:
   `.claude/plans/codex-findings-backlog.md`(2.5.4가 `DEFER_TO_BACKLOG`에 대해 **요구하는**
   적재) · `.claude/notes/closure-accounting-m3-implement-codex.md`(deviation 1의 게이트 기록).
   **구현 소스 파일의 확장은 0건**이고 plan의 12개 목록은 정확히 그대로 적중했다. 따라서
   `fix-task.md`에 `verdict='plan_conflict'`를 쓰고 `STATE.md.chain_aborted=true`로 체인을
   끊는 escalation은 **적용하지 않았다** — 그것은 일어나지 않은 plan↔구현 격차를 주장하는
   기록이 된다. 반대로 조용히 넘기지도 않는다: 신호 원문과 두 파일 이름을 여기 남긴다.
   (참고: 최초 측정은 세션 시작 시점부터 더러웠던 워크트리 파일 — `STATE.md` ·
   `fix-task-applied.md` · M4 plan/리뷰 산출물 — 을 입력에 포함해 11건으로 보고했다.)

## Issues Encountered

없음. 위 1번은 명령 본문과 staleness 가드 사이의 구조적 긴장이며, 해소 경로를 그대로 기록했다.

## Gate

| 축 | 결과 |
|---|---|
| Implement-Codex | R1 1라운드 (cap 1/1) · `classification=ok` · verdict **divergent**(structured `needs-attention`) · MEDIUM 1건 이연 |
| receipt | `.claude/receipts/mccp-implement-codex/closure-accounting-m3.json` · `codex_verdict='divergent'` — converged로 위장하지 않으므로 cross-gate dedupe는 닫혀 있고 `/mccp:pr`에서 PR-Codex가 발화한다 |
| impeccable | `silent_skip` (`design_signal=false`) — receipt에 정직하게 기록 |
| chain validate | `ok:true` (missing/stale/blocking/open_critical 전부 0) |

### 흡수하지 않은 지적 (§3.14 — backlog 이연)

**F1 (MEDIUM · 독립 2회 재현)** — 소스 스캔 falsifier는 emitter가 *호출되는지*를 증명하지
못한다. Codex가 `plan-codex-runner.js:599`의 호출을 제거하고 재확인한 결과 R2~R6 신호가 전부
불변이었다. 같은 지적을 plan 게이트의 hybrid L3 Codex가 먼저 냈다.

- **이연**: 권고(각 producer를 운영 caller 경유로 구동하는 동작 test)는 runner를 실제로
  구동해야 해 M3(종결 도달성 **표기**) 범위 밖의 별도 축이다.
- **흡수한 것**: 주장의 축소. `feedback-loop-design.md`의 "M3가 주장하지 않는 것"과
  `PRODUCER_CHANNELS` 주석이 `reachable`은 "길이 코드에 존재한다"이지 "지금 발화한다"가
  아님을 명시한다.

**Task 5 텍스트 출력에 자동 test 없음 (MEDIUM · plan 게이트 L2)** — plan의 Validate가 "육안
확인"뿐이라는 지적. 이연했고, 대신 이 사이클의 라이브 출력 5행을 본 보고서에 원문으로 고정해
사후 대조가 가능하게 했다. 자동화 요구는 backlog에 남아 있다.

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/debt-inventory.js` | UPDATED — `collectFindings` 필터 |
| `plugins/mccp/scripts/state/findings-registry.js` | UPDATED — `PRODUCER_CHANNELS` · `channelOf` · export 3 |
| `plugins/mccp/scripts/lib/closure/report.js` | UPDATED — `buildProducers`/`countByChannel` + ledger 행 |
| `plugins/mccp/scripts/lib/closure/cli.js` | UPDATED — `producerLine` + Producers 블록 |
| `plugins/mccp/scripts/lib/closure/tests/report.test.js` | UPDATED — mock 11건 spread + 불변식 4건 |
| `plugins/mccp/scripts/lib/tests/msw-m10-producers.test.js` | UPDATED — accepted/closed 부채 판정 |
| `plugins/mccp/scripts/lib/tests/findings-producer-reachability.test.js` | CREATED — R1~R8 |
| `docs/multi-session-work-loop/feedback-loop-design.md` | UPDATED — 채널별 도달성 · 계약 (c) · 주장하지 않는 것 |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATED — #1.5 계약 blockquote |
| `.claude/prds/closure-accounting.prd.md` | UPDATED — M3 행 complete · Open Question 답 |
| `CHANGELOG.md` | UPDATED — `## [Unreleased]` |
| `.claude/plans/codex-findings-backlog.md` | UPDATED — 이연 1건 |
| `.claude/notes/closure-accounting-m3-implement-codex.md` | CREATED — 게이트 기록(deviation 1) |
| `.claude/PRPs/reports/closure-accounting-m3-report.md` | CREATED — 본 문서 |

`plugins/mccp/.claude-plugin/plugin.json` diff **0** (UI12 · §3.7).

## M3가 주장하지 않는 것

- **registry 종결률은 오르지 않는다(1.4%).** 의도다(UI5·UI6) — 이 PRD는 부채를 갚지 않고,
  갚혔는지 아닌지를 볼 수 있게 한다. 종결률을 올리는 정직한 경로는 DAR #1.5뿐이다.
- **패널 finding은 계속 열려 있다.** 세션 시작 승격 목록도 줄지 않는다.
- **hybrid L3는 배선되지 않았다.** registry 분모에 아예 들어가지 않는다는 사실을 표기할 뿐이다.
- **falsifier는 위조 방지가 아니다.** 우발적 드리프트를 잡는다. 남는 사각 둘: 연결이 끊긴
  emitter(F1) · **이미 선언된 파일 안에서** 새 채널이 생기는 경우.

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr` (PR-Codex는 dedupe가 닫혀 있어 실제로 발화한다)
- [ ] M4는 같은 브랜치에서 이어서 (PRD 주석: `report.js`·`cli.js`·`debt-inventory.js` 공유)
