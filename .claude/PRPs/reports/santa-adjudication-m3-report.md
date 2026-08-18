# Implementation Report: santa-adjudication M3 — patch-chasing terminator + 캡 정책

**Plan**: [.claude/plans/santa-adjudication-m3.plan.md](../../plans/santa-adjudication-m3.plan.md)
**PRD**: [.claude/prds/santa-adjudication.prd.md](../../prds/santa-adjudication.prd.md) — Milestone 3 (마지막)
**Branch**: `santa-adjudication` · **Version**: 1.27.1 → **1.28.0** (minor — PRD 3 milestone 전부 완료)

## Summary

santa-loop이 스스로 끝나는 조건을 놓았다. 라운드 2 이후 살아남은 blocking이 **전부** 직전
라운드의 패치를 겨누면 루프를 종료하고, 그 사유를 P0가 이미 가진 `state.terminated` 마커에
`patch_chasing`으로 남긴다. 대상 판정은 리뷰어의 자기 선언이 아니라 집계 단계가 `locations`를
`git show --unified=0`의 hunk 범위와 대조해 기계적으로 내린다. 함께 PRD가 M3 소유로 이연한
캡 이름·범위 불일치(UI15)를 코드 정본으로 닫았다.

**이 report는 재진입 실행분이다.** Task 1~6과 문서 일부는 선행 세션이 커밋 `fbf0270`으로
착지시켰으나 그 커밋 시점에 test suite 결과가 미확인이었고, Task 7의 문서 3면과 Task 8의
실경로 완주가 미완이었다. 본 실행은 그 잔여를 닫고 게이트를 통과시켰다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 선행 세션이 코드를 끝냈고 본 실행은 검증·문서·실측이 주였다 |
| Files Changed | 13 | 15 (선행 커밋 17 파일 ∪ 본 실행 10 파일). 계획 밖 2건은 아래 Deviations |
| 커버리지 항목 | 61~87 (27) | 61~88 (28) — Implement-Codex 흡수분 1건 추가 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `terminator.js` 신규 — 순수 oracle | 완료 (선행 커밋) | export 4종 + 상수 4종 검증됨 |
| 2 | `gate.analyzeReviewers`에 `locations` union | 완료 (선행 커밋) | |
| 3 | `cli.js` — `check-termination` · hunk 파서 · `begin-round` 선검사 | 완료 (선행 커밋) | |
| 4 | `ledger.terminate` · `seal` 술어 일반화 · `schema` 열거 확장 | 완료 (선행 커밋) | |
| 5 | `santa-loop.md` — Step 4.5 · 종료 분기 | 완료 (선행 커밋) + **본 실행 보정** | 아래 Deviations 1 |
| 6 | 회귀 test 61~87 | 완료 (선행 커밋) + **88 추가** | 아래 Deviations 2 |
| 7 | 문서 · 버전 · PRD | **본 실행에서 완료** | ownership.md · ENVIRONMENT.md · CHANGELOG `## [1.28.0]` 3면이 미작성이었다 |
| 8 | 실 경로 1회 완주 (A) + (B) | **본 실행에서 완료** | 아래 전용 절 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 단위 + CLI 회귀 (santa-adjudication) | Pass | 88/88 |
| santa-gate | Pass | 10/10 |
| santa-loop-cap | Pass | 48/48 (POSIX 전용 3건 skip) — **진입 시 3건 red였다**, 아래 Deviations 3 |
| santa-seal | Pass | 13/13 |
| santa-review-gate | Pass | 12/12 |
| 커버리지 계약 (1..MAX, 상한은 M2·M3 두 표에서 파생) | Pass | 87/87 + 구조 요구(68·77) 충족 |
| 동결 시그니처 + 신규 export | Pass | `decideVerdict` 3키 유지 · counter 상수 무변경 · terminator 4함수 4상수 · `ledger.terminate` |
| P0 접촉 경계 | Pass | 선언된 3파일뿐 |
| 소유권 표 교집합 ∅ | Pass | P1=4 P2=3 P3=2 |
| receipt corpus 무손상 | Pass | invalid 0 |
| 세 파일 constellation 정적 검사 | Pass | read/write 같은 상수 · seal 일반화 · schema 2종 · kill-switch 정확히 2자리 |
| **Acceptance (B) 실경로 발화의 파일 증명** | **Pass** | 아래 Task 8 절 |
| instruction-contract lint | Pass | C1~C4 |
| i18n-surface (version 4면 동기) | Pass | 10/10 |

### Design Grounding

N/A — design trigger 미발화(`design_signal=false`, `silent_skip=no-signal`). 렌더링 표면
변경이 없으므로 Phase 2.5.5c capture와 Phase 3.7 verify 모두 no-op이다.

## Implement-Codex Gate

**R1 `needs-attention` → `resolution.codex_verdict='divergent'`** (구조화 verdict,
`source=structured`). 선행 세션의 게이트는 `MCCP_CODEX_DISABLED=1` 하에 `skipped`로 봉인됐으나
그 env는 현재 두 설정 계층 어디에도 없어 본 실행에서 Codex가 실제로 발화했다.

단독 HIGH — "`line` 없는 location이 파일 존재만으로 `round_n_patch`가 되어 hunk 대조 없이
종료가 봉인된다". **기전은 정확하고 처방은 절반만 받았다**:

- **REJECT_YAGNI** — 설계 반전(라인 교집합 강제). DD11이 정확히 그 선택지를 검토하고 기각했고
  (`plan:405-408`, `terminator.js:136-139`), 오분류는 `PRD Risks:143`에 Medium/High로 사전
  등재돼 있으며, UI19가 그 거울상을 금지한다. 폭발 반경이 승인이 아니라 **한 라운드 이른 종료**
  라는 점이 근거다. 기각 근거는 backlog 2026-08-18 행에 file:line으로 기록.
- **ACCEPT_NOW** — 같은 finding이 함께 권고한 end-to-end negative test. 커버리지 **88** 신설.

escalate 미발동(F1-b가 R1 안에서 완전 해소 + `MCCP_GATE_ROUND_CAP=1`). 상세는
[.claude/notes/santa-adjudication-m3.md](../../notes/santa-adjudication-m3.md).

## Task 8 — 실 경로 완주 (합성 리뷰어 JSON 미사용)

전 라운드가 실제 리뷰어 2인(Claude `opus` + Codex `gpt-5.4` CLI — 진짜 model diversity)의
출력이 실제 CLI를 지나 실제 원장에 들어간 결과다.

### (A) 미발화 경로 — 이 저장소

라운드 0에서 Step 4.5가 실행됐다. `terminate=false` · `reason=round-below-min` ·
`--prev-fix-rev` 미전달(빈 문자열도 아니다) · 루프는 M2 동작과 동일하게 NAUGHTY로 진행.
`contract=full`, blocking 1건.

### (B) 발화 경로 — 별도 워크트리 probe (`.worktrees/santa-m3-probe`, 로컬 전용)

`src/path-guard.js`(경로 containment guard)에 종자 결함을 심고 5라운드를 돌렸다.

| round | blocking | targetsBreakdown | Step 4.5 |
|---|---|---|---|
| 0 | 4 | `{0, 0, 4}` | `round-below-min` |
| 1 | 7 | `{6, 1, 0}` | `not-all-round-n-patch` |
| 2 | 5 | `{4, 1, 0}` | `not-all-round-n-patch` |
| 3 | 1 | `{1, 0, 0}` | **`terminate=true` · `patch_chasing`** |

(B) 1~5 전건 충족 — 마커 결속(`rounds:4`) · `begin-round`의 `SANTA_TERMINATED` exit 2(라운드
미개설·캡 미소모) · seal의 `review_verdict='divergent'` + `layers.l1='divergent'` +
`santa_exit_reason='patch_chasing'` + schema valid · `MCCP_SANTA_TERMINATOR=off` 재개.
증거 파일 `.claude/reviews/santa-review-santa-adjudication-m3-probe.md` 1개만 반입.

**측정된 두 가지가 PRD Open Questions로 갔다**: (1) `unknown` 비율 **0/17** — 리뷰어가
`locations`를 빠짐없이 채웠다. (2) 전량 조건의 보수성 — 라운드 1·2는 **단 한 건의
`preexisting`** 때문에 미발화했고 오발화는 0건이었다. 종료는 직전 라운드가 모듈 전체를
재작성한 뒤에야 성립했다.

## Files Changed (본 실행분)

| File | Action | Why |
|---|---|---|
| `docs/santa-loop/ownership.md` | UPDATED | Task 7 — M3 추가 기록 + **DD2 P0 접촉 3곳 표** + `SANTA_TERMINATED` exit 매핑 |
| `docs/ENVIRONMENT.md` | UPDATED | Task 7 — `MCCP_SANTA_TERMINATOR` 등재 + `MCCP_SANTA_ROUND_CAP`에 DD8 결론 |
| `CHANGELOG.md` | UPDATED | Task 7 — `## [1.28.0]` 본문 |
| `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | UPDATED | 커버리지 88 (Codex F1-b 흡수) |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATED | M1 시대 기대값 3건 확장 (Deviations 3) |
| `plugins/mccp/commands/santa-loop.md` | UPDATED | Step 4.5 산문 정정 (Deviations 1) |
| `.claude/prds/santa-adjudication.prd.md` | UPDATED | Milestone 3 → `complete` · 실측값 2건 · 신규 Open Question |
| `.claude/notes/santa-adjudication-m3.md` | UPDATED | 게이트 산출물 + Task 8 실측 |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | 기각 HIGH 1건(증거 포함) + LOW 1건 |
| `.claude/reviews/santa-review-santa-adjudication-m3-probe.md` | CREATED | Acceptance (B) 증거 |

## Deviations from Plan

1. **`santa-loop.md` Step 4.5 산문 정정 (계획 밖, 리뷰 흡수)** — Task 8 (A)의 라운드 0
   리뷰에서 Codex가 "커맨드 본문은 *대조할 수 없는 것은 `unknown`*이라 하는데 코드는 file-only를
   `round_n_patch`로 승격한다"는 internal-consistency 위반을 지적했다. 실재하는 문서 결함이고
   M3 자신이 소유한 절이라 그 자리에서 흡수했다 — 이제 2-tier 대조를 명시하고 file-only tier를
   **가장 약한 고리**로 이름 붙인다. 코드는 무변경(설계 반전은 기각).
2. **커버리지 88 추가 (표 밖)** — Implement-Codex F1-b 흡수. plan 본문은 `mccp-plan-codex`가
   `plan_hash`로 봉인한 대상이라 커버리지 표를 늘리지 않았다(늘리면 그 receipt가 stale이 되어
   이번 cycle의 PR이 §3.11 guard 2에 막힌다). 커버리지 스크립트는 1..MAX의 **존재**만 보므로
   MAX 밖 추가는 계약을 깨지 않는다.
3. **`santa-loop-cap.test.js` 편집 (`Files to Change` 밖)** — 진입 시 이 suite가 3건 red였다.
   M1 시대 단언 셋이 산타 모듈 집합을 6개로, `cli.js` require allowlist를, reviewer envelope
   golden 형태를 열거식으로 고정하는데, M3이 `terminator.js`와 `locations`를 정당하게 더해
   기대값이 낡았다. plan의 Validation이 이 suite의 green을 **요구**하므로 편집은 필수였다.
   **가드를 지우거나 느슨하게 하지 않고 기대값만 넓혔다** — 각 파일의 기존 주석 규약("새 모듈은
   여기 한 줄로 승인된다")을 그대로 따랐고, `terminator.js`는 receipt-free 목록에도 함께 넣어
   "receipt 배선이 퍼져도 아무도 모른다"로 퇴화하지 않게 했다.
4. **probe가 5라운드를 요했다** — plan은 (B)를 2커밋 1라운드로 그렸으나 실제 리뷰어는 미변경
   줄의 실재 결함도 찾아내 전량 조건이 두 번 깨졌다. 라운드를 더 돌려 도달했고 그 과정 자체가
   측정값이 됐다(위 Task 8 절). `MCCP_SANTA_ROUND_CAP=5`로 캡 헤드룸을 준 것은 캡이 아니라
   terminator가 판정하도록 하기 위함이다(`capAllowsAnotherRound` 항이 캡 도달 라운드에서
   terminator를 미발화시키므로 cap=3에서는 라운드 1에서만 발화 가능하다).

## Issues Encountered

- **`begin-round`의 두 선검사 순서** — M2 coverage 게이트가 M3 종료 게이트보다 앞서므로,
  미판정 blocking이 남으면 `SANTA_TERMINATED` 대신 `SANTA_ADJUDICATION_INCOMPLETE`가 뜬다.
  둘 다 exit 2 · 라운드 미개설 · 캡 미소모라 결과는 같다. 결함이 아니라 순서이고 오히려
  옳다 — 판정 원장이 완결돼야 루프 종료를 선언한다. 문서화만 했다.
- **`resolution.converged`가 divergent seal에서도 `true`** — §3.12가 신뢰 불가 필드로 지목한
  그 값이 실측으로 재확인됐다. 실제 판정은 `resolution.review_verdict`에 있다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `santa-adjudication.test.js` | +1 (항목 88) | 실 git + 실 CLI에서 touched 파일의 미변경 라인 → `preexisting` → 미발화. 양성 대조군(변경 라인 → 발화) · 수용된 trade-off(file-only → 발화) · 그 경계(patch 밖 파일 → 미발화) 4경우 |
| `santa-loop-cap.test.js` | 3건 기대값 확장 | 모듈 집합 · require allowlist · envelope golden |

## Next Steps

- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수** (origin/main이 이 실행 중 1.27.1 → 1.27.2로 움직였다. 1.28.0은 아직 앞서므로 상향 불필요했으나 PR 직전 재확인이 §3.7의 두 번째 시점이다)
- [ ] merge 후 `/mccp:archive-complete` — PRD 3 milestone 전부 `complete`가 되어 아카이브 대상이 됐다 (§3.11, human-gate)
- [ ] merge 후 worktree cleanup + `claude plugin update`로 캐시 `1.28.0` 확인
- [ ] 로컬 브랜치 `santa-m3-probe` — probe 증거 트레일로 남겨 뒀다. 불필요하면 `git branch -D santa-m3-probe`
