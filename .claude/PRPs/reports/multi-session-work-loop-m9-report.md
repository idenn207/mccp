# Implementation Report: multi-session-work-loop M9 — 아카이브 조건 충족

**Plan**: `.claude/plans/multi-session-work-loop-m9.plan.md` (hash `sha256:bc41d001…`, 봉인 유지)
**Branch**: `multi-session-work-loop-m9`
**Version**: `1.33.1 → 1.34.0` (minor — PRD 전체 종료)

## Summary

M4·M5·M8이 status 셀 안에 남긴 미충족 인정 조건을 **판정**해 닫거나 증거와 함께 개정하고,
PRD를 아카이브 가능한 상태로 만들었다. 조건을 닫을 수 없는 축은 임계를 낮추는 대신
반증 조건을 개정했고, 개정문은 전부 "달성했다"가 아니라 "무엇을 포기했고 왜인지"를 적는다.

가장 큰 발견은 계획에 없던 것이다: **M9의 완료 판정 자체가 순환이었다.** PRD 9행은 M9의
완료를 `/mccp:archive-complete` 성공으로 *정의*했는데, §3.11 C3는 M9 행이 `in-progress`인
한 거짓이라 그 성공이 영원히 오지 않는다. 완료 판정을 "행별 술어 통과 ∧ status 정본화"로
옮기고 라이브 완주를 그 *검증*으로 격하해 닫았다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 그대로 |
| Tasks | 8 | 8 (7건 완료 · 1건 부분 — Task 8은 비파괴 검증까지) |
| Files Changed | 20 declared | 16 changed + 2 추가(선언 밖) |
| 새 게이트 | 0 | 0 |
| 새 LLM 호출 | 0 | 0 |
| 새 env 토글 | 0 | 0 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | A3 측정 경로 복구 | 완료 (1c 제외) | 1a·1b·1d 완료. **1c(재측정)는 실행 불가** — 이 환경에 tiktoken이 없다. plan이 "있으면"으로 조건부 서술한 분기 |
| 2 | 패널 경로 C1 종결 producer | 완료 | 라이브 검증: open 66 → 59, 분자 불변 |
| 3 | 미판정 finding 12건 종결 | 완료 | fixed 4 · invalidated 1 · deferred 7 |
| 4 | C2/C3 귀속 기계화 | 완료 | 조회 서브커맨드 + `pr.md` 파생 교체 |
| 5 | A2 조사 (UI5) / 개정 (UI6) | 완료 | 후보 4종 실측, 불가 확정 + 개정문 |
| 6 | M9 coverage gate | 완료 | 3축, 술어 교차 검증 포함 |
| 7 | PRD status 정본화 | 완료 | 4행 flip + 순환 해소 deviation |
| 8 | 아카이브 완주 | **부분** | preflight 비파괴 검증 완료(`errors: []`, 10 moves). **파괴적 실행은 PR 이후로 이연** |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | 통과 | 이 저장소는 type-check/lint 스크립트가 없다. 계약 lint 2종으로 대체 |
| Unit Tests | 통과 | `msw-m9-producers.test.js` 신설 9건 + `msw-metrics.test.js` 증분 1건 |
| Contract lint | 통과 | `env-contract/lint.js` exit 0 · `instruction-contract/lint.js` exit 0 |
| Coverage gate | 통과 | `m9-coverage-gate.js` exit 0, 4행 전부 flip·검사·통과 |
| Version sync | 통과 | `i18n-surface.test.js` 10/10 (기대값을 plugin.json에서 파생) |
| 라이브 경로 | 통과 | backlog-append · findings-unattributed · scan.js · apply.js preflight 전부 실측 |

## 지표 전이

| 축 | before | after | 판정 |
|---|---|---|---|
| A1 | computed 1/1 | computed 1/1 | 불변 |
| A2 | forward-only | forward-only | **불변 — 사유가 이제 실측으로 기록됨** |
| A3 | insufficient (**크래시**) | insufficient (정직한 미산출) | 값은 불변, 실패 모드가 바뀜 |
| A4 | computed 0/42 | computed 0/42 | 불변 |
| B1 | computed 0/26 | computed **1/29** | drift 1건 신규 — 아래 참조 |
| B3 | computed 20/117 | computed 20/117 | 불변 |
| C1 | computed **0/66** | computed **5/66** | 이 PRD 최초의 비영점 폐쇄율 |
| C2/C3 | forward-only | forward-only | 파생 경로 배선, 표본 0(정상) |

**B1의 신규 drift는 정직한 관측이다.** 항목은 M9 자기 행이고
`doc_status: complete` ↔ `evidence_verdict: not-shipped`다 — 선언이 ship receipt보다
앞선 상태를 B1이 잡은 것이며, 이 PR이 착지하면 해소된다. 숨기지 않고 기록한다.

## Deviations from Plan

### 1. M9 자기 행의 술어와 flip 추가 (선언 범위 안)

- **WHAT** — Task 7a 술어표에 M9 행을 추가하고, PRD 9행 Outcome의 완료 판정 문장을 개정했다.
- **WHY** — plan의 술어표는 M5·M8·M4 세 행만 다룬다. 셋을 전부 닫아도 `scan.js` 실측
  `inProgress:1`(M9 자기 행)이 남아 §3.11 C3가 거짓이므로 Task 8이 거부되고, plan의
  `## Acceptance`("PRD + plan 9건 이동")가 달성 불가가 된다. 동시에 PRD 9행은 M9의 완료를
  그 아카이브 성공으로 정의하므로 순환이 닫히지 않는다.
- **범위** — plan의 `## Files to Change`가 이미 `.claude/prds/multi-session-work-loop.prd.md`를
  `UPDATE | … **인정 조건 개정** …`으로 선언했으므로 plan-conflict가 아니라 선언 범위 안의
  deviation이다. plan 본문은 봉인 상태로 뒀다(§3.16 — 고치고 재리뷰하지 않는다).
- **출처** — L2 패널 invariant 관점이 CRITICAL 3건으로 지목했고, `scan.js --json` 실측으로 확인했다.

### 2. Task 8의 파괴적 실행 이연

- **WHAT** — `/mccp:archive-complete`의 실제 이동을 실행하지 않고 preflight까지만 검증했다.
- **WHY** — 이동 대상에 `multi-session-work-loop-m9.plan.md` 자신이 포함된다. `/mccp:pr`
  2.5.8·2.5.9가 validator에 `--plan`을 넘기는데 파일이 옮겨져 있으면 re-hash할 대상을 못 읽어
  `stale` → `ok=false`가 되어 **이 사이클의 PR이 막힌다**(§3.11 guard 2, 문서화된 실측 함정).
  Task 7의 개정이 라이브 완주를 *정의*에서 *검증*으로 격하한 것이 정확히 이 순서를 위한 것이다.
- **검증한 것** — `apply.js preflight`가 전체 planPaths로 `errors: []` + 10건 이동 계획을 냈고,
  C2 원자성 가드도 (plan 목록을 빼면 위반을 보고하는 것으로) 함께 확인됐다.
- **남은 것** — PR 착지 후 `/mccp:archive-complete` 1회 실행.

### 3. 계약 문서 동기 (선언 밖 1건)

- **WHAT** — `docs/multi-session-work-loop/measurement-instrumentation.md:201`의 fallback
  문장을 status 분리에 맞춰 갱신했다.
- **WHY** — Task 1a가 "tokenizer unavailable → `baseline-unavailable`"이라는 문서화된 계약을
  바꿨다. 코드만 바꾸고 문서를 두면 그 자체가 drift이며, 이 저장소는 그것을 lint로 막는 축을
  여럿 운용한다. plan의 Files to Change에 없어 선언 밖이지만 코드 변경의 필수 귀결이다.

### 4. 게이트 기록을 plan이 아니라 notes에

- **WHAT** — `## Codex Implementation Review` 섹션을 plan 본문이 아니라
  `.claude/notes/multi-session-work-loop-m9.md`에 썼다.
- **WHY** — plan은 `mccp-plan-codex` receipt에 `sha256:bc41d001…`로 결속돼 있다. 본문에
  섹션을 주입하면 그 결속이 깨져 §3.11 guard 2가 발동한다. `prp-implement` 2.5.6 Step A가
  "plan **or notes** path"를 허용하고 M8도 같은 자리를 썼다.

## Issues Encountered

- **A3의 진짜 고장 기전** — plan의 진단(비동기 `error` 이벤트, try/catch가 못 잡음)이 정확했다.
  실측으로 재현했고 수정 후 소멸을 확인했다.
- **`quorum.js` 합성 행이 유령 레코드를 만들 뻔했다** — `blockingFindings`에는 리뷰어가
  낸 적 없는 `verdict=fail` 행이 섞인다. 그대로 닫으면 `opened_at: null`인 closed 레코드가
  생겨 분모를 오염시킨다. "현재 open인 id만 닫는다"로 차단했고 3건이 실제로 걸렸다.
- **security 패널 CRITICAL 3건은 오탐이었다** — `state/cli.js`를 `findings-registry.js`로
  추적했으나 실제 호출은 `mswEvents.appendEvent`(`state/cli.js:445`)다. 두 레지스트리가
  분리돼 있고 그 분리는 M8이 의도한 것이다. 증거와 함께 기각해 backlog에 적재했다.
- **A2의 불가 사유가 plan의 예상과 달랐다** — plan은 "노출하지 않아서"로 봤으나, 실제로는
  분자는 접근 가능하고 **분모가 없다**. 이 구분이 개정문의 정확도를 바꾼다.

## Files Changed

| File | Action | 비고 |
|---|---|---|
| `plugins/mccp/scripts/lib/msw-metrics/a3-instruction-cost.js` | UPDATE | Task 1a |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | Task 2 |
| `plugins/mccp/scripts/state/cli.js` | UPDATE | Task 4 |
| `plugins/mccp/commands/pr.md` | UPDATE | Task 4 |
| `plugins/mccp/scripts/lib/msw-metrics/m9-coverage-gate.js` | CREATE | Task 6 |
| `plugins/mccp/scripts/lib/tests/msw-m9-producers.test.js` | CREATE | Task 2 생성 · 3·4·6 확장 |
| `plugins/mccp/scripts/lib/tests/msw-metrics.test.js` | UPDATE | Task 1a 단언 |
| `docs/multi-session-work-loop/a3-freshness-policy.md` | CREATE | Task 1b·1d |
| `docs/multi-session-work-loop/a2-producer-investigation.md` | CREATE | Task 5 |
| `docs/multi-session-work-loop/measurement-instrumentation.md` | UPDATE | **선언 밖** — 계약 동기 |
| `docs/multi-session-work-loop/m9-{before,after,assertion-manifest}.json` | CREATE | 스냅샷 |
| `.claude/prds/multi-session-work-loop.prd.md` | UPDATE | Task 7 |
| `.claude/state/findings/multi-session-work-loop-{m7,m9}.jsonl` | UPDATE | Task 2·3 종결 이벤트 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 판정 이연 |
| `.claude/notes/multi-session-work-loop-m9.md` | CREATE | **선언 밖** — 게이트 기록 |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/{html,markdown}.js` · `CHANGELOG.md` | UPDATE | §3.7 4면 동기 |

**선언됐으나 변경하지 않은 것**: `docs/multi-session-work-loop/a3-baseline.json`(Task 1c —
tiktoken 부재로 재측정 불가), `plugins/mccp/scripts/state/findings-registry.js`(종결 사유
매핑 확장이 불필요했다 — 기존 `CLOSURE_TYPES`가 `deferred`를 이미 갖는다).

## Next Steps

- [ ] `/mccp:pr` — 진입 직전 §3.7 version 재계산(현재 target 1.34.0, origin/main 1.33.1)
- [ ] PR 착지 후 `/mccp:archive-complete` 1회 실행 (Task 8의 파괴적 절반)
- [ ] 그 뒤 B1 drift 1건이 해소되는지 확인

---

## 재검증 (2026-08-31, 후속 `/mccp:prp-implement` 재진입)

이전 세션이 컨텍스트 소진으로 끊긴 뒤 같은 plan으로 재진입해 게이트와 검증을 다시 돌렸다.
구현은 이미 Task 1~7이 커밋된 상태였고, **새로 구현한 것은 없다**. 아래는 재측정 결과와
그 과정에서 드러난 환경 문제다.

### 게이트 상태

`receipt/cli.js validate --command mccp:prp-implement --decision multi-session-work-loop-m9`
→ `ok:true` · missing 0 · stale 0 · blocking 0. plan hash 봉인(`bc41d001…`)이 유지되고 있어
`mccp-plan-codex` receipt가 stale로 떨어지지 않았다.

### 재측정 결과

| 검사 | 결과 |
|---|---|
| `a3 --print` | `status:"error"` · `not_delivered_reason:"tiktoken unavailable: … No module named 'tiktoken'"` · **stack trace 없음** · exit 0 |
| `msw-m9-producers.test.js` | 9/9 |
| `msw-metrics.test.js` | 37/37 |
| `m9-coverage-gate.js --json` | exit 0 — M4·M5·M8·M9 4행 전부 `flipped:true` ∧ `ok:true` |
| `env-contract/lint.js` | exit 0 (L1~L10) |
| `instruction-contract/lint.js` | exit 0 (C1~C4, rows=33) |
| `archive-complete/scan.js` | `archivable:true` · `complete 9/9` · `nonCanonical 0` · plans 9 |
| `derive run` | 16 source **전부 `degraded:false`** |
| `derive render` | exit 0 (`design-lint 1 violation: H16 (advisory)` — plan Assessment B가 이미 귀속 밖으로 판정한 기존 드리프트) |
| 버전 4면 동기 | `plugin.json` · `html.js` · `markdown.js` · `CHANGELOG.md` 전부 `1.34.0` · `i18n-surface.test.js` 10/10 |
| `state/tests/` | 215/215 |
| `receipt/tests/` | 687/688 (skip 1, fail 0) |
| `lib/tests/plan-review-*` | 325/326 (skip 1, fail 0) |
| **전수 회귀 347 파일** | **5532 tests · 5515 pass · fail 0 · skip 17 · exit 0** (`MCCP_CODEX_DISABLED=1` + `--test-concurrency=2`) |

지표는 forward-only 축이 자연 누적해 스냅샷 시점과 다르다(A1 1/1→1/2 · A4 0/42→35/55 ·
B3 20/117→24/117). **C1은 5/66 불변**이고 `deferred_count 14` · `open_count 47` ·
`integrity_ok:true`다 — 종결 producer가 분자를 올리지 않았다는 인정 조건이 재확인됐다.
`m9-after.json`은 milestone 종료 시점의 기록이므로 **덮어쓰지 않았다**.

### 정정 1건 — PRD M4 개정문의 B1 값

M4 개정문이 `B1(computed 0/26)`을 근거로 "산출되고 건강하다"고 적었는데, 같은 사이클의 이
리포트는 after 값을 `1/29`로 기록하고 있었다 — **같은 사이클 문서 두 개가 같은 측정을 두고
어긋난 상태**였고, 빠진 drift 1건이 하필 **M9 자기 행**이었다. 즉 M9가 스스로 만든 drift를
세지 않은 값이 "건강하다"를 뒷받침하고 있었다. 실측값으로 정정하고 drift의 정체와 해소 조건
(이 PR 착지)을 함께 적었다. 편집 후 `m9-coverage-gate` exit 0 · `scan.js archivable:true` 불변.

### 전수 회귀는 1차 시도가 무효였다 — 자원 고갈

`node --test` 347개 파일을 동시성 4로 돌린 1차 시도가 대량 실패로 끝났으나, **실패는 코드가
아니라 환경 때문**이었다:

- 이 환경은 `MCCP_CODEX_DISABLED`가 **설정돼 있지 않다**(이전 세션의 receipt는
  `codex_disabled:true`로 봉인돼 있어 그때는 설정돼 있었다). 그래서 codex 경로를 타는 test가
  **실제 Codex를 호출**했고, 호출마다 `app-server-broker.mjs` + `codex app-server` 쌍이 떴다.
- 러너가 중단되자 broker가 **고아 상태로 자식을 무한 재생성**하는 자가 지속 루프가 됐다.
  node 프로세스가 **519개**까지 늘었고, 그 부하가 test 파일을 로드조차 못 하게 만들어
  `receipt/tests` · `state/tests` 전체가 **파일 단위 ✖(~45ms)** 로 무더기 실패했다.
  `santa-seal.test.js`의 `1292989ms`(21.5분)도 실패가 아니라 그 굶주림의 증상이다.
- 정리: 고아 test runner → 부모가 죽은 broker 순으로 종료. **519 → 15 프로세스**, 증가율 0.
  부모가 살아 있는 codex 프로세스는 다른 세션 소유일 수 있어 **건드리지 않았다**.
- 재확인: 위 표의 `state/tests` 215/215 · `receipt/tests` 687/688 · `plan-review` 325/326은
  **정리 후 깨끗한 머신에서** 나온 값이며, 1차 시도에서 이름이 찍혔던 실패
  (`ultracode-phase-guard` · `evidence-claim` · M1.5/M2 intent · merged_verify)는 전부
  단독·직렬 재실행에서 통과했다. **회귀 0건**.
- **결론** — 같은 347개 파일을 안전한 조건으로 다시 돌리자 `fail 0 · exit 0`으로 끝났다.
  1차 시도의 실패 목록은 단 한 건도 코드에 귀속되지 않는다.

> **운용 교훈** — 이 저장소의 전수 회귀는 `MCCP_CODEX_DISABLED=1` **없이 돌리면 안 된다**.
> 비용(실 Codex 수백 회)과 프로세스 러너웨이가 함께 온다. 안전한 형태:
> `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 …`

### 여전히 남은 것

- **Task 8의 파괴적 절반** — 위 이연 근거(§3.11 guard 2 자기차단)가 그대로 유효하다.
  `archivable:true`가 재확인됐으므로 PR 착지 후 `/mccp:archive-complete` 1회로 닫는다.
- **A3 재측정(1c)** — tiktoken 부재로 여전히 불가. 정직한 미산출이 유지된다.

### 로컬 리뷰 수용 (2026-08-31, `/mccp:code-review` Local Mode)

커밋 직전 advisory 리뷰가 위 표의 주장 13건을 **전부 재측정해 대조**했다(B1 `1/29` ·
C1 `5/66` · A1 `1/2` · A4 `35/55` · B3 `24/117` · derive 16 source degraded 0 ·
`m9-coverage-gate` 4행 ok · `scan archivable:true` · 버전 4면 `1.34.0` + `i18n-surface` 10/10 ·
lint 2종 exit 0 · msw test 46/46 · `state/tests` 215/215 · A3 정직한 error). **불일치 0건.**
전수 회귀 5532 tests는 시간 비용상 재현하지 않았다 — 재현되지 않은 유일한 주장이다.
CRITICAL·HIGH 0건이라 §3.14 흡수 임계에는 걸리지 않았으나, 사용자 지시로 MEDIUM 2 + LOW 1을
이 커밋에서 함께 닫는다.

- **MEDIUM 1 — 러너웨이 근본원인이 문서화만 되고 닫히지 않았다.** `dep-check`가 지금도
  `codex disabled : no`를 보고하고 `.claude/settings.json`에 그 토글이 없다. 위 "운용 교훈"은
  사람이 매번 기억하라는 것인데 그 조건은 이미 한 번 실패했다(519 프로세스). 다만 전역 상주는
  이 저장소의 라이브 dogfood를 죽이므로 **채택하지 않았고**, 대신 규칙을 사람이 실제로 읽는
  표면인 **CLAUDE.md §3.4 테스트 항목**으로 올려 실측 근거와 트레이드오프를 함께 적었다.
- **MEDIUM 2 — PRD의 drift 해소 조건이 판정 축과 한 단계 어긋났다.** "이 PR이 착지하면
  해소된다"고 적었으나 `b1-status-drift.js`의 실제 축은 `.claude/receipts/mccp-pr-codex/`
  `<decision_id>.json`이 **git-tracked로 HEAD에서 도달 가능**한가다(`:29`, `:60-67`). plan만
  default branch에 닿고 receipt가 없으면 `undetermined`(evidence-gap)로 **강등될 뿐 해소가
  아니다** — 분자에서 빠지는 것과 `shipped`가 되는 것은 다르다. PRD 문장을 그 두 경로가
  구분되도록 정정했다.
- **LOW 1 — `fix-task-applied.md`가 취소된 escalation을 지시한 채로 남아 있었다.**
  `escalate: true` + "Next: run /mccp:santa-loop"인데 그 escalation은 §3.15 단일통과로
  의도적으로 미수행됐다. `state-injector.js`가 applied 파일을 **재주입하지 않음**을 확인해
  (rotate 목적지 + 7일 sweep 전용) 실효 위험은 없으나, git-tracked라 사람이 읽는 표면이므로
  미수행이 곧 결정이었다는 사실과 그 receipt 근거를 본문에 덧붙였다. frontmatter는 무손상이다.
- **LOW 2 — `dep_check_missing`/`escalate_pending` 제거는 정당**하다고 판정되어 조치 없음.
  전자는 실제 해소(`impeccable skill: available (user v4.0.4)`), 후자는 `write.js:1017-1024`의
  reverse-path가 같은 decision_id receipt 기록 시 clear하는 present-only 동작이다.
