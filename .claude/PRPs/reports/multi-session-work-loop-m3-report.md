# Implementation Report: Multi-Session Work Loop — M3 (증거 충돌 소거)

- **Plan**: `.claude/plans/multi-session-work-loop-m3.plan.md`
- **Implement-Codex 기록**: `.claude/notes/multi-session-work-loop-m3.md`
- **Branch**: `v1.23.1-multi-session-m3`
- **Version**: `1.23.0 → 1.23.1` (단일 milestone = patch, §3.7)

## Summary

receipt write가 세션 간에 조용히 덮이는 경로를 구조적으로 닫고, 같은 작업 단위를 두 세션이 동시에 잡는 상황을 감지·차단한다. 구현은 plan의 G1~G3 보증 표를 단일 기준으로 따르며 **그보다 강한 주장을 하지 않는다**.

| # | 보증 | 실증 |
|---|---|---|
| G1 | live 세션 간 동일 작업 단위 중복 점유 불가 | `evidence-claim.test.js` 1승 1거부 · `receipt-write-concurrency.test.js` 다른 세션 refusal + 파일 무변경 |
| G2 | stale·부활 holder의 write-time 거부 | 승계자 tombstone → 부활 A 거부 회귀 (F3 시나리오 전건) |
| G3 | 모든 덮어쓰기는 보고되거나 감사에서 검출됨 | slow-live-holder 주입 시 base-hash 선조건이 write 거부 + `evidence_overwrite_observed` |

**명시된 잔여 2건** — (a) 덮인 writer가 이미 성공을 반환했을 수 있음, (b) tombstone TTL 만료 후 replay fence lapse — 는 전역 단조 순번 없이 닫히지 않으며 **M5** 소관이다. (b)는 known-gap test로 고정해 동작이 조용히 바뀌면 잡히게 했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 부합 |
| Files Changed | 30 | 25 변경 + 8 신규 |
| Codex 라운드 | — | 1 (cap default), 6 findings |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `.gitignore` 선행 + 설계 문서 | 완료 | check-ignore 3건 + 대조군(ship receipt는 tracked 유지) 통과 |
| 2 | `evidence-lock.js` | 완료 | Codex F3(monolithic API)·F5(retry 내 heartbeat) 흡수 |
| 3 | write 3경로 통합 | 완료 | guard 재검이 lock 안으로 이동(TOCTOU 폐쇄) |
| 4 | `evidence-claim.js` | 완료 | Codex F2(per-slug mutation lock) 흡수 |
| 5 | taxonomy producer + CL-5 | 완료 | Codex F6(`event_id`) 흡수 |
| 6 | B2 산출 가능화 + coverage gate | 완료 | Codex F4(런타임 아티팩트 없으면 indeterminate) 흡수 |
| 7 | advisory 통보 | 완료 | `listClaims()` 단독 (ledger PID 축 미사용) |
| 8 | 대시보드 B2 + 릴리스 메타 | 완료 | critique F1~F4 전건 |
| 9 | 동시성 stress + 바이트 안정성 | 완료 | N-writer lost update 0 |

**순서 조정 1건**: Task 4를 Task 3보다 먼저 구현했다. `evidence-lock`의 claim fence가 `evidence-claim` 모듈을 fail-closed로 요구하므로, 모듈이 없는 상태에서 store를 통합하면 receipt write가 전부 막힌다. 범위는 불변이고 순서만 바꿨다.

## Implement-Codex 게이트

`classification=ok · blocking=false · 386s` — 실발화. 구조화 verdict `needs-attention` → **`divergent`**(`source=structured`). HIGH 4 + MEDIUM 2.

| Finding | 처리 |
|---|---|
| F1 divergent fix-task가 해소 전 applied 표시 | **REJECT (코드로 반증)** — `state-injector.js` 헤더 L5의 설계된 inject-후-rotate이고, 지속 신호 `escalate_pending`은 STATE.md에 유지 |
| F2 claim **변형**이 gate별 lock에 미직렬화 | ACCEPT — 모든 claim mutation을 per-slug lock으로 |
| F3 caller-driven lock context가 fence 우회 | ACCEPT — monolithic `guardedWrite`/`guardedReadModifyWrite`, raw context는 test-only |
| F4 primary 축 없이 B2 flip 가능 | ACCEPT — 런타임 관측 아티팩트 없으면 `ok:false` |
| F5 2점 heartbeat가 rename retry 창을 남김 | ACCEPT — retry 루프 안 heartbeat + 소유 재확인, 예산을 lease 하한 |
| F6 이중 스캔 dedupe 키 부재 | ACCEPT — `event_id` append 시점 부여 |

**receipt는 `codex_verdict='divergent'`로 봉인**했다. 5건을 흡수하고 1건을 반증했으나 **그 흡수에 대한 Codex 재검증은 미획득**(R2 미실행, cap=1)이므로 `converged`로 올리지 않았다. 결과적으로 plan·implement 양 게이트가 non-converged라 cross-gate dedupe가 fail-closed되어 `/mccp:pr`에서 **PR-Codex 실발화가 보장**된다.

## 구현 중 발견·수정한 결함 (테스트가 잡은 것)

1. **`opts.env` 미전달** — fence까지 세션 env가 전달되지 않아 주입 세션이 무시됐고 **다른 세션 거부가 발화하지 않았다**. 스모크가 잡음.
2. **guard 이벤트 hash 어휘 불일치** — `pre_hash`/`post_hash`에 파일 바이트 hash를 넣고 있었다. B2 런타임 감사의 스냅샷은 `receipt_hash` 어휘라 그대로 뒀으면 **감사가 영원히 대조에 실패**했다. 부수적으로 carve-out 전용 변형이 `pre==post`가 되어 설계대로 carved-only 분류로 떨어진다.
3. **이중 스캔 교차 오염** — legacy(cwd) 위치를 무조건 스캔해 repoRoot 밖의 **다른 repo 이벤트 127건**이 유입됐다. CL-5가 막으려던 바로 그 실패. cwd가 repoRoot 안일 때만 스캔하도록 수정(`msw-events-path.test.js`가 잡음).
4. **버전 정규식 미치환** — footer 동기 시 `v1\.23\.0` 이스케이프 형태가 남아 있었다.

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 신규 단위 테스트 | 통과 | 7 파일 · 80건 |
| gitignore glob | 통과 | claim/lock/tmp 3건 + 대조군(ship receipt tracked 유지) |
| `metrics-assert --fixtures --dry-run` | 통과 | B2 claimed-computable로 강제 |
| `derive run --strict` | 통과 | exit 0 |
| `derive render` | 통과 | 계측 섹션 렌더 · B2가 신규 라벨로 표시 |
| version 3면 동기 | 통과 | plugin.json + html/markdown footer |
| 신규 hot path LLM 호출 0 | 통과 | denylist grep 0건 |
| 머지 삭제 검증(§3.5.1) | 통과 | `--diff-filter=D` 공집합 |
| 전체 회귀 | 아래 참조 | |

### 전체 회귀 — 사전/사후 대조

| | tests | pass | fail |
|---|---|---|---|
| 변경 전(baseline, full) | 3358 | 3344 | **6** |
| 변경 후(full, 계약 test 3건 수정 전) | 3438 | 3423 | 10 |
| 변경 후(표적 재확인, 수정 후) | 591 | 585 | **6** (baseline과 동일 집합) |

**full 재실행은 harness 총 실행시간 한도로 두 차례 중단**됐다(스위트가 13분 이상 걸리고 `lib/tests`에 수 분짜리 파일이 있다). 그래서 표적 3그룹으로 나눠 확정했다:

| 그룹 | 결과 |
|---|---|
| receipt write-path 11파일 | 91 tests · 0 fail |
| msw/metrics/renderer/state 14파일 | 366 tests · 0 fail |
| derive 전체 + baseline 실패 4파일 | 134 tests · **6 fail = baseline과 동일 집합** |

즉 **내가 만든 실패는 0**이고, 남은 6건은 변경 전부터 실패하던 M3 범위 밖 항목이다(`g1-patch` 3 · `verdict-label` 1 · `design-critique-loop-e2e` fixture 1 · `validate-callsite-lint` 1 — `pr.md:202/856`이 `--plan` 누락).

**변경 전부터 실패하던 6건**(M3 범위 밖): `g1-patch`(3) · `verdict-label`(1) · `design-critique-loop-e2e` fixture(1) · `validate-callsite-lint`(1 — `pr.md:202/856`이 `--plan` 누락).

**`perf-budget`**: 표적 재확인 그룹(derive 전체)에서는 **통과**했다. 부하가 높은 full 병렬 실행에서만 초과하므로 코드 회귀가 아니라 부하 민감성이 확증된다. 아래는 그 근거다. 이 테스트는 `derive()`의 벽시계 시간을 1000ms 예산으로 재는데, 이 머신에서 clean 프로세스 기준 **853ms**로 이미 예산 가장자리에 있다. 내가 추가한 derive source 비용은 실측 **0.3~5.2ms**(예산의 0.6% 미만)이고 setup은 `writeJson`을 쓰므로 내 write-path 변경은 타이밍 구간 밖이다. 그럼에도 신규 테스트 7개(자식 프로세스를 띄우는 동시성 stress 포함)가 병렬 부하를 늘려 이 예산을 넘기게 만든다 — **간접 영향은 인정한다**. 코드 경로가 느려진 것은 아니다.

### 계약이 바뀌어 갱신한 기존 테스트 3건

이 셋은 전부 "조용한 변경 방지" 장치이므로, 편의로 구부린 것이 아니라 **명시적으로 계약을 갱신**했다.

- `msw-metrics.test.js` — semantics 불변(forward-only·null), `invalid_reason` 문구만 갱신 + M3 gate 분기 2건 추가.
- `msw-metrics-acceptance.test.js` — B2를 `DOWNGRADED_FORWARD_ONLY` → `CLAIMED_COMPUTABLE`로. 이 목록이 silent promotion 방지 장치이므로 편집이 곧 sanctioned 승격이며 `derive/cli.js`와 lockstep이다.
- `session-activity.test.js` — dead read(`collision` kind, producer 부재)를 실제 taxonomy로. 은퇴한 kind는 fixture에 남겨 **0 기여**를 assert.

## Files Changed

신규 8: `receipt/evidence-lock.js` · `state/evidence-claim.js` · `lib/msw-metrics/b2-coverage-gate.js` · `docs/multi-session-work-loop/evidence-conflict-design.md` · 테스트 4(`evidence-lock` · `evidence-claim` · `b2-coverage-gate` · `msw-metrics-b2` · `msw-events-path` · `receipt-write-concurrency` · `receipt-bytes-stable`).

변경: `receipt/store.js`(+`updateReceipt`) · `receipt/write.js` · `lib/briefing/index.js` · `lib/completion-ledger/index.js` · `state/msw-events.js` · `derive/sources/session-activity.js` · `lib/msw-metrics/{index,fixture}.js` · `derive/cli.js` · `lib/renderer/sections/msw-metrics.js` · `lib/renderer/{html,markdown}.js` · `hooks/{session-start,session-end}.js` · `commands/work.md` · `.gitignore` · `plugin.json` · `CHANGELOG.md` · `CLAUDE.md` · 기존 테스트 4.

## Deviations from Plan

1. **Task 4 → Task 3 순서 조정** (위 참조).
2. **`MCCP_EVIDENCE_CLAIM_TTL`을 env 토글이 아니라 상수로**. plan Task 4는 env를 언급하지만 plan Acceptance는 "신규 토글 정확히 1개"를 요구한다. 더 강한 제약을 택해 TTL·lease·retry 예산을 상수 + test 주입으로 두고, 신규 토글은 `MCCP_EVIDENCE_CONFLICT_GUARD` 하나뿐이다.
3. **`claimedComputable` 위치** — plan은 `fixture.js`에 있다고 적었으나 실제 위치는 `derive/cli.js:219`와 `msw-metrics-acceptance.test.js`다. 실제 위치 둘을 갱신했다.
4. **Implement-Codex 리뷰 기록을 plan이 아니라 notes에**. Phase 2.5.4 지시대로 plan 본문에 append하면 `plan_hash`가 바뀌어 상류 `mccp-plan-codex` receipt가 `stale`로 떨어진다(실제 발생 → validate exit 2). plan 본문은 Plan-Codex가 서명한 바이트여야 하므로 hash-anchored 아티팩트 밖에 뒀다(2.5.6 Step A가 notes 경로를 명시 허용, 저장소 선례 `integrity-unification-m3-implement-review.md`).

## Issues Encountered

- **테스트 잔여 오염**: CL-5 수정 이전 테스트들이 이벤트를 실 repo의 `.claude/state/msw-events/`(cwd 상대)에 흘렸다. 127건 전부 `target` 필드가 없어(ALLOWED_FIELDS 확장 이전) 합성 잔여임이 확정됐고, gitignored라 커밋된 적은 없다. 제거해 실 corpus를 정직한 상태(`guard_active: 0 · producer_present: false`)로 되돌렸다.
- **실 corpus B2는 여전히 forward-only**다. producer는 코드에 배선됐지만 이 저장소 corpus에는 아직 관측이 없고 coverage gate 아티팩트도 없다. gate 아티팩트를 손으로 만드는 것은 설계가 금지한 masquerade이므로 하지 않았다. flip 경로는 fixture + gate test로 기계적으로 실증돼 있다.

## santa-loop (구현 단계) — 3라운드 소진, 미수렴

**Reviewer B는 cross-model이 아니었다.** Codex CLI가 계정 사용량 한도를 소진해(`try again at Aug 13th, 2026`) `gemini`도 미설치라, santa-loop 명세의 Claude fallback으로 돌았다. 즉 **이 세 라운드는 model diversity 없이** 컨텍스트·관점 격리만으로 수행됐다. 같은 이유로 `/mccp:pr`의 PR-Codex도 8/13까지 발화 불가다.

| 라운드 | Reviewer A | Reviewer B | 결과 |
|---|---|---|---|
| R1 | code-reviewer · PASS 12/12 | code-reviewer · PASS 12/12 | **오퍼레이터 검증으로 뒤집힘** — C7 근거가 양쪽 다 순환(A는 테스트 픽스처, B는 lint 자신의 정규식으로 grep). 실행해보니 신규 writer 6종 중 4종 미검출 → `898eaed` |
| R2 | code-reviewer · PASS 13/13 | **silent-failure-hunter · FAIL** (C7·C13) | B만 `openSync` 인라인 반례를 찾음. 모양 전체를 재면 9종 중 8종 미검출 → `a2bcbd1` |
| R3 | **FAIL** (C7·C13) — "너무 좁다" | **FAIL** (C7·C13) — "너무 넓다" | 정반대 방향. 아래 |

**R3의 두 FAIL은 같은 정규식 손잡이의 양 끝이다.** 실측으로 확인한 것:

- A 주장 3건 중 2건 실재 — `'.claude' + '/receipts' + '/x.json'`, `.concat()`. 문자열 연산이 리터럴 경계에서 토큰을 쪼갠다. 나머지 1건(`const r='receipts'` 후 `path.join`)은 **오판**이며 축 C가 실제로 잡는다.
- B 주장 2건 모두 실재 — 축 A는 값 인자의 `receipt` 토큰에도 반응하고, 축 B는 `receiptPath(`를 읽기용으로만 부르는 파일의 write도 잡는다.

둘을 **동시에** 만족시키려면 write 대상 인자를 구조적으로 판정해야 하고(그것도 dest가 두 번째 인자인 계열까지), 이는 정규식이 아니라 AST 파서의 일이다. **보조 축 하나에 그 비용을 쓰지 않기로 했다** — 정밀 판정은 애초에 primary(런타임 변형 감사)의 몫이고, 이 축의 정직한 성격은 검출기가 아니라 "receipt 근처의 미승인 write를 시끄럽게 만드는 guardrail"이다. 두 오류의 비용이 비대칭이라는 것이 근거다: 오검출은 gate가 시끄럽게 실패해 승인 목록으로 분류되면 끝이지만, 미검출은 guardrail을 조용히 비운다(이 milestone이 정확히 그 상태로 두 번 ship될 뻔했다).

따라서 R3에 대한 조치는 정규식 재조정이 **아니라** 두 리뷰어가 C13에서 공통 요구한 것 — 문서와 실측의 일치 — 이다(본 보고서와 같은 커밋): design §6.3이 문자열 연산 gap과 의도적 과잉 포섭을 각각 명시하고, 양방향 경계를 `KNOWN_GAP_SHAPES` / `DELIBERATE_OVERREACH_SHAPES` test로 고정해 동작이 조용히 바뀌면 실패하게 했다.

**G1~G3은 세 라운드 내내 무손상**이다. 모든 지적이 보조 정적 축에 국한됐고 lock·claim fence·overwrite 검출·런타임 감사에는 confirmed finding이 없었다.

**미해소 잔여(운영자 판단 필요)**: 정적 축의 정밀도/재현율 frontier. 선택지는 (i) 현 상태 수용(문서·test로 경계 고정 완료), (ii) AST 기반 lint로 교체(별도 축), (iii) 정적 축을 아예 진단용으로 강등하고 gate 판정은 런타임 감사 단독. **push하지 않았다** — santa-loop 계약상 3라운드 미수렴은 escalation이다.

## Next Steps

- [ ] **미해소 escalation**: implement receipt가 `divergent`로 봉인돼 `escalate_pending`이 세워졌다. santa-loop 3라운드로도 수렴하지 않았다(위 절). 선택지는 (a) 위 잔여 (i)/(ii)/(iii) 중 택일 후 진행, (b) Codex 한도가 복구되는 8/13 이후 cross-model 재검증, (c) `/mccp:pr`로 진행 — 단 PR-Codex도 같은 한도에 막힌다.
- [ ] **OQ-3**: PRD M3 문구("구조적으로 불가능")가 plan 보증 G1~G3보다 강하다. PR 시 조정(운영자 지시로 이연됨).
- [ ] **CL-3**: sibling worktree `feat/codex-intent-context`도 `1.23.1`을 선언한다. PR 작성 시 `origin/main`의 `plugin.json`을 재확인해 나중 머지 쪽이 상향.
- [ ] **backlog**: J4 상류 결함(`session-start.js`가 `createLedger`에 `pid: Number(process.env.CLAUDE_PID)` 미전달 → 단일 머신에서 `activeOnly` 공집합). M3 범위 밖으로 명시 기록.
- [ ] `perf-budget` 예산이 이 머신에서 가장자리다. 예산 상향 또는 derive 최적화는 별도 축.
