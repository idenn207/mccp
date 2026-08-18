# Implementation Report: review-loop-bypass M1 — 단일통과 토글

**Plan**: [.claude/plans/review-loop-bypass-m1.plan.md](../../plans/review-loop-bypass-m1.plan.md)
**Branch**: `review-loop-bypass-m1` · **Version**: 1.27.2 → **1.27.3**
**Decision slug**: `review-loop-bypass`

## Summary

`MCCP_REVIEW_SINGLE_PASS`(고정 enum 3종)를 신설했다. 켜지면 `/mccp:plan`의 L2 승인 패널이
1회만 발화하고 quorum 비수렴이 진행을 차단하지 않으며, 세 게이트의 Codex 라운드 캡이
`MCCP_GATE_ROUND_CAP`과 무관하게 1로 고정되고, `/mccp:santa-loop`은 라운드를 열지 않는다.
L1은 불가침으로 남고 receipt는 **실제 verdict를 그대로 봉인한 채** 토글 사유를 present-only
2필드로 함께 봉인한다 — `converged`로 위장하지 않는다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 설계 편차 없음. 비용은 기존 단언과의 충돌 해소에 몰렸다 |
| Files Changed | 20 (Files to Change) | 23 수정 + 5 신규 = **28** (plan 목록 밖 3건, 아래 Deviations) |
| Tests | 4 파일 신규 + 1 갱신 | 4 신규(61 test) + 3 갱신 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | 단일통과 오라클 신설 | Complete | `review-single-pass.js` — 파서 2종 + `effectiveRoundCap` + `assert-single-round` CLI |
| 2 | `decideReview` 완화 배선 | Complete | `mkSinglePass`/`buildAuditProof`/`l3Corroborated` 신설. `mk`는 무변경 |
| 3 | plan-review CLI 주입 | Complete | 종료 코드 분기 무변경 — `block:false`가 기존 `EX_OK` 경로를 탄다 |
| 4 | santa-loop 라운드 거부 | Complete | `beginRound` 이전 거부 → 원장 미변경·캡 미소모 |
| 5 | receipt 2필드 봉인 | Complete | present-only + DD8 chain drift 관측 |
| 6 | schema 양방향 불변식 | Complete | **Implement-Codex F1 흡수로 자격 verdict를 `divergent`로 좁힘** |
| 7 | test 4종 | Complete | 61 test (단위 28 · CLI 왕복 10 · receipt 18 · 명령 본문 7) |
| 8 | 명령 본문 3곳 + round-budget 배선 | Complete | `round-budget.test.js`의 test-local `parseCap` 제거 |
| 9 | 문서 · 버전 · backlog | Complete | ENVIRONMENT §11 · gate-design 신규 절 · CLAUDE.md §3.15 · 4면 동기 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 신규 축 4종 | Pass | 61/61 |
| lib suite 회귀 | Pass | 2222 pass / 0 fail / 14 skipped (사전 존재) |
| receipt suite 회귀 | Pass | 636 pass / 0 fail / 1 skipped (사전 존재) |
| receipt corpus 전수 검증 | Pass | 58건 전부 valid |
| 버전 4면 동기 (`i18n-surface`) | Pass | 10/10 |
| CLAUDE.md 절 이전 lint | Pass | C1~C4 pass, advisory 0 |
| 라이브 1회 완주 | **미수행** | Acceptance 마지막 항목 — 아래 참조 |

### Design Grounding

N/A — 디자인 trigger 미발화(렌더링 표면 없음. `renderer/*.js` 변경은 footer 버전 문자열 1줄).

## Deviations from Plan

1. **Files to Change 밖 3건을 수정했다.** 전부 신규 불변식/의존이 기존 단언과 충돌해
   발생했고, 각각 그 파일의 설계된 승인 통로를 따랐다.
   - `plan-review-write-invariants.test.js` — "비수렴 proof는 수용된다" fixture가 신규
     역불변식에 걸렸다. M1 이후 그 receipt는 **정의상 단일통과 기록**이므로 fixture에 두
     플래그를 실었다(그 test의 원래 주제인 "미충족 quorum은 기록 가능"은 무변경).
   - `santa-loop-cap.test.js` — 열거식 의존 allow-list에 `../review-single-pass` 한 줄을
     승인 기록과 함께 등재. 그 목록은 "새 의존은 한 줄로 승인된다"는 설계다.
   - `docs/multi-session-work-loop/instruction-contract.md` — CLAUDE.md §3.15 신설에 따른
     ledger 행 1개(미등재 시 lint advisory).
2. **Phase 2.5(Implement-Codex 게이트)를 순서상 건너뛰고 EXECUTE 후에 실행했다.** 게이트는
   실제로 돌았고 HIGH 1건을 잡아 흡수했으나, "구현 전에 막는다"는 성질은 이번 실행에서
   성립하지 않았다. 상세와 대가는 [notes](../../notes/review-loop-bypass-m1-implement-codex.md) 말미.
3. **Codex Implementation Review를 plan 본문이 아니라 sibling note에 기록했다.** plan에
   한 줄만 append해도 `planAwareMarkdownHash`가 바뀌어(실측 `c8b22d99…` → `fa50eff5…`)
   봉인된 `mccp-plan-codex` receipt가 stale이 되고 chain이 끊긴다. 2.5.4가 허용하는 대체
   경로다.
4. **plan을 `completed/`로 이동하지 않았다.** 주어진 명령 본문(plugin cache 1.24.0)의
   Phase 5는 `mv`를 지시하지만, CLAUDE.md §3.11(v1.25.2)이 그것을 명시적으로 금지한다 —
   PRD가 in-progress인데 plan을 옮기면 어느 대시보드 스캔에도 안 잡혀 소실되고(C2 위반),
   `/mccp:pr`의 staleness 가드가 읽을 파일을 잃어 이번 cycle의 PR이 막힌다. 목적지도
   `archived/`이지 `completed/`가 아니다.
5. **`node --test <dir>` 형태가 Node 24.19에서 동작하지 않는다** (`MODULE_NOT_FOUND`).
   plan Validation 블록의 그 두 줄은 glob(`<dir>/*.test.js`)으로 바꿔 실행했다.

## Issues Encountered

- **Implement-Codex F1 (HIGH, 흡수)** — 역불변식이 `unavailable`에도 발동해, DD2가 완화
  대상에서 명시 제외한 verdict에 대해 *일어나지 않은 우회*를 주장해야 통과하는 상태였다.
  정방향도 같은 구멍의 반대면(`unavailable` + bypass 주장 수용)이었다. 자격 verdict를
  `divergent` 하나로 좁혀 양방향을 동시에 닫고 회귀 test 2건을 추가했다. **이 지점은 Task 6
  구현 중 저자가 인지했으나 plan 문언을 따르기로 하고 넘어간 곳이고, Codex가 독립적으로
  같은 결론에 도달했다.**
- **Implement-Codex F2 (MEDIUM, 이연)** — chain drift 경고가 사유 *값* 변경을 못 본다.
  현 구현은 DD8 문언 그대로라 확장은 계약 변경이므로 §3.14대로 backlog.
- **test 위생 (backlog)** — `plan-review-r3-absorptions.test.js`가 임시 repo가 아니라 실제
  워킹 트리에 receipt를 쓴다(gitignored라 커밋에는 무해하나 corpus 분모가 흔들린다).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `lib/tests/review-single-pass.test.js` | 28 | 파서 2종 · `effectiveRoundCap` · 완화 경계 7경로 · hybrid L3 5상태 · `assert-single-round` fail-closed 전수 |
| `lib/tests/review-single-pass-gate.test.js` | 10 | 실 child process 왕복 — L1/budget-skip/DD13/미판독은 토글에도 exit 12, quorum 비수렴만 exit 0 · santa 거부 + 원장 미증가 |
| `receipt/tests/review-single-pass-fields.test.js` | 18 | 봉인 · 양방향 불변식 · forged hybrid 2종 · `unavailable` 양방향 · 투영 pin · dedupe negative · chain 회귀 pin |
| `lib/tests/review-single-pass-command-body.test.js` | 7 | 세 본문의 오라클 배선 · 5.6b 두 플래그 · dispatch-log append · purge 제외 |

## Acceptance 미충족 1건

- [ ] **게이트/경로를 실제로 1회 완주하고 산출물 4종 확인** — 이 항목은 plan Validation의
  "수동 경계"가 사람이 `MCCP_REVIEW_SINGLE_PASS=scope_too_small /mccp:plan …`을 직접
  실행하도록 요구한다(슬래시 명령이라 셸 블록에 넣을 수 없다). 미수행 상태이므로
  **M1은 complete가 아니다.** 나머지 Acceptance 항목은 전부 충족.

## Next Steps

- [ ] 라이브 1회 완주 + Validation 블록 2(freshness 게이트 · 산출물 (a)(b)(c)(d) 단언)
- [ ] `/mccp:pr` — 단, 현재 implement receipt는 `security_skipped=true`(Agent 호출 제약)와
      `codex_verdict=divergent`를 봉인하고 있어 fail-closed로 막힌다. 해제 경로는 게이트
      재실행이며, 우회 토글이 아니다.
- [ ] `.claude/state/fix-task.md` — write 시점 escalate detector가 올린 항목(divergent verdict)
