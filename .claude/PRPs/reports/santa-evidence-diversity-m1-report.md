# Implementation Report: santa 증거 다양성 M1 — 블라인드 레인

**Plan**: `.claude/plans/santa-evidence-diversity-m1.plan.md` (제자리 유지 — 아카이브는 `/mccp:archive-complete` 소관)
**Branch**: `santa-evidence-diversity` · **Version**: 1.28.0 → **1.28.2** (§3.7 forward-only 상향)
**게이트 산출물·실측**: `.claude/notes/santa-evidence-diversity-m1.md`

## Summary

리뷰어 1명이 파일 번들·사전 요약 대신 저장소 루트 + 대상 경로 포인터만 받는 **블라인드
레인**을 도입했다. 배정은 신규 순수 oracle `santa/lanes.js`가 정하고, `record --lane`이
선언을 배정과 대조하며, `seal.js`가 커버리지를 present-only 정수 2종으로 봉인해 "매
실행에서 ≥1명이 번들을 받지 않았다"가 사후 반증 가능해진다. 리뷰어 수는 늘지 않았다(I5).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 17 | 16 (+notes/report) |
| Version target | 1.28.1 | **1.28.2** — main이 1.28.1을 선점(§3.7 13번째 재발) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `lanes.js` 순수 oracle | 완료 | export 5종 + 상수 6종. `MAX_TARGET_PATHS=200`(plan 미지정분을 근거와 함께 확정) |
| 2 | `cli.js` — `lanes` + `record --lane` | 완료 | 신규 exit code 0건 · `SANTA_LANE_MISMATCH`는 기존 매핑 |
| 3 | `seal.js` 투영·리포트·stamp + `write.js`/`schema.js` | 완료 | 라운드 ≥ 1이면 값 0이어도 stamp |
| 4 | `santa-loop.md` Step 1 + Step 3 | 완료 | `$SCOPE_PATHS_JSON` 단일 접속점 · `$BLIND_ID` 단일 분기 |
| 5 | 회귀 test 신규 + 가드 확장 | 완료 | 신규 23 · 기존 4개 파일 확장(단언 미삭제) |
| 6 | 문서 · version · PRD | 완료 | ownership.md · ENVIRONMENT.md · CHANGELOG · 4면 동기 |
| 7 | 실경로 완주 | **부분** | (a)(c)(d)(e) 충족 · **(b) 리뷰어 실기동 미실측** — 아래 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Validation 1 (test 전량) | 통과 | 208 tests · 205 pass · 0 fail (3 skipped = POSIX-only) |
| Validation 2 (version 4면) | 통과 | `i18n-surface.test.js` 10/10 |
| Validation 3 (소유권 교집합) | 통과 | `ownership intersection is empty` |
| Validation 4 (머지 삭제 §3.5.1) | 통과 | `--diff-filter=D` 결과 공집합 |
| Validation 5 (CLI smoke) | 통과 | 5a 3키 + 경로 포함 · 5b `--paths-file` 부재 exit 2 |
| Validation 6 (receipt 왕복) | 통과 | live walk에서 `validate().ok === true` |

Design Grounding: N/A — implement-mode detector가 `design_signal=false`(렌더 표면 diff 0건).

## Files Changed

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/santa/lanes.js` | CREATED |
| `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | CREATED |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATED |
| `plugins/mccp/scripts/lib/santa/seal.js` | UPDATED |
| `plugins/mccp/scripts/receipt/write.js` · `schema.js` | UPDATED |
| `plugins/mccp/commands/santa-loop.md` | UPDATED |
| `plugins/mccp/scripts/lib/tests/{santa-loop-cap,santa-seal,santa-adjudication}.test.js` | UPDATED |
| `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js` | UPDATED |
| `docs/santa-loop/ownership.md` · `docs/ENVIRONMENT.md` · `CHANGELOG.md` | UPDATED |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/{html,markdown}.js` | UPDATED |
| `.claude/prds/santa-evidence-diversity.prd.md` | UPDATED |

## Deviations from Plan

1. **version 1.28.1 → 1.28.2** — main이 1.28.1을 선점했다(§3.7 forward-only). 발행 번호는 불가침.
2. **`MAX_TARGET_PATHS`에 값을 확정(200)** — plan이 상수만 열거하고 숫자를 안 적었다(plan-review R6 invariant MEDIUM이 지적한 항목). 근거를 코드 주석에 남겼다.
3. **`--lane` 필수화가 기존 test 26개 호출부를 깨뜨렸다** — plan이 예상하지 않은 반경. 단언을 지우지 않고 호출부에 lane을 더했고, `santa-adjudication.test.js`는 리터럴 대신 oracle에서 도출해 배정 변경에 따라오도록 했다.
4. **게이트 산출물을 plan이 아니라 notes에 기록** — plan 본문은 `mccp-plan-codex`가 `plan_hash`로 봉인했으므로 편집하면 §3.11 guard 2가 PR을 막는다(M1·M2 선례).

## Issues Encountered

- Implement-Codex R1이 유일 HIGH로 "구현이 diff에 없다"를 냈다. 이 게이트는 Phase 3 EXECUTE **이전**에 도므로 범주 오류다 — 기각하고 backlog에 근거와 함께 남겼다(처방: focus에 "리뷰 시점에 코드는 없다"를 명시).
- `record --lane` 검증이 `loadReviewer` 안에 있어 round-open 검사보다 먼저 발화한다. 기존 test가 의도한 에러에 도달하지 못해 호출부에 lane을 더해 복원했다. 검증 순서 자체는 바꾸지 않았다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `santa-lanes.test.js` | 23 | 파서 3값+fail-open · DD2 표 3행 · 블라인드 ≤1 성질 · 인자 부재 · 절삭 고지 · 집계 legacy 안전 · cmdLanes 3키/실패 6종 stdout 공백 · `--lane` 부재/불일치/열거 밖 |
| `santa-seal.test.js` | +5 | 투영·stamp·**off는 0으로 실림**·legacy 무해·리포트 레인 열 |
| `santa-review-gate.test.js` | +4 | present-only 수용/거부·0 유효·키 부재·hash carve-out 부재 |
| `santa-loop-cap.test.js` | 확장 | 모듈 집합·receipt-free·require allowlist·envelope golden |

## Next Steps

- [ ] `/mccp:prp-commit` → `/mccp:pr` (**PR 직전 §3.7 version 재계산 필수** — main이 또 움직일 수 있다)
- [ ] `security_skipped=true`가 `/mccp:pr` validator에서 blocking이다 — 그 시점에 security-reviewer 실행 또는 감사 우회 결정 필요
- [ ] 남은 검증 부채: `/mccp:santa-loop` 리뷰어 2인 실기동 1회 + 토큰 비용 비교(UI20)
