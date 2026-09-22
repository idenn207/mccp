# Implementation Report: ci-full-suite M5 — findings-closure

## Summary

이 PRD가 연 open CRITICAL 8건을 `c3` HEAD에서 재검증해 판정 문서를 남기고, 닫힘이 입증된 건의
`dispose` batch를 준비했으며, c2 worktree의 근거 없는 registry close 잔재 77줄을 되돌렸다.
**코드 변경 0건** · `plugin.json` 변경 0건.

판정은 `fixed` 2 · `open` 6이다. `dispose` 적용은 수행하지 않았다(Task 3 — 선행 의존 미충족).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small | Small (측정·문서 중심, 코드 0줄) |
| Files Changed | 4 | 6 (+ 게이트 기록 1 · c2 worktree 16 shard 되돌림) |
| dispose batch 줄 | 8건 중 닫힘 입증분 | 2 |
| V3 기대값 | `blocked` | `ready` |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | 8건 재검증 문서 | 완료 | `fixed` 2(원문 발견 + 코드 근거 + PR) · `open` 6(원문 부재) |
| 1 | dispose batch 준비 | 완료 | 2줄, evidence `#185`. `dispose` 미실행 |
| 2 | c2 잔재 되돌리기 | 완료 | 77줄 제거 · marker 삭제 · 비대상 0건 · 백업 보관 |
| 3 | dispose 적용 | **미수행(설계상)** | 트리거의 절반만 충족 — closure-accounting M2 행이 main에서 `in-progress` |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| V1 문서 8행 + 판정 + 코드 인용 | 통과 | `V1 ok` |
| V2 batch ↔ 문서 ↔ registry 정합 | 통과 | `V2 ok 2` — `classifyEvidence('#185')` 실제 호출 · registry 실판독 |
| V3 봉인 의존 관측 | **`ready`** | plan 기대값은 `blocked`이었다 — 편차 1 참조 |
| V4 c2 잔재 부재 | 통과 | F2 흡수판(절대경로 검증 + git 종료코드 검사) |
| V5 번호 선언 없음 | 통과 | merge-base 1.34.4 · 선언 0 |
| 회귀 test | 통과 | `test-suite-coverage` · `redact-gate-coverage` 60건 pass |
| Static/Lint/Build | N/A | 코드 변경 0건 |

### Design Grounding

N/A (no design trigger) — `impeccable-detect --mode implement`이 `design_signal=false` ·
`silent_skip_reason=no-signal`을 냈다. 렌더 표면 0건이라 2.5.5c capture · Phase 3.6 finish
routing · Phase 3.7 grounding verify 모두 no-op이고, receipt에 silent-skip으로 기록됐다.

## Files Changed

| File | Action | Note |
|---|---|---|
| `docs/ci-full-suite/m5-findings-closure.md` | CREATED | 8건 판정표 · open 사유 · c2 처리 · Task 3 트리거 |
| `docs/ci-full-suite/m5-dispositions.jsonl` | CREATED | 2줄 batch (미적용) |
| `.claude/prds/ci-full-suite.prd.md` | UPDATED | M5 행 재정정(봉인 전제 · 산출 · 되돌림 완료). status는 `in-progress` 유지 |
| `.claude/notes/ci-full-suite-m5-implement-codex.md` | CREATED | Implement-Codex 게이트 기록(triage · 흡수 절차) |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | `plan-conflict-detector` false-HALT 1행 append |
| `.claude/state/fix-task-applied.md` | UPDATED | Stop-loop hook 산출물 — originating receipt가 `mccp-plan-codex` → `mccp-implement-codex`로 갱신 |
| `.claude/plans/ci-full-suite-m5.plan.md` | (미편집) | 해시 결속 보존 — 아래 편차 4 |
| `.worktrees/c2-orchestrator-step-wiring` 16 shard + marker | REVERTED | 77줄 제거 · marker 삭제 (그 worktree의 다른 변경은 무변경) |

## Deviations from Plan

1. **V3 기대값 `blocked` → `ready`.** closure-accounting M2(PR #194)가 main에 머지되며 라이브
   재봉인(`sealed_at 2026-09-08T08:25:23.521Z` · 2841건)이 대상 8건을 전부 포함한다. plan의
   "8건 전부 봉인 밖" 전제는 측정 시점에 이미 거짓이었다. 운영자가 "main 병합 · 적용 보류"를
   선택했고, `dispose`는 Task 3 트리거(M2 행 `complete`)가 열릴 때까지 보류다.
2. **batch 8줄 후보 → 2줄.** m1 santa CRITICAL 6건의 claim 원문이 존재하지 않는다 — 원장
   경로가 `.gitignore:53`으로 무시된다. 8개 worktree · git 이력 119 리비전 · transcript ·
   리뷰 기록을 digest로 대조해 전부 미발견. plan Task 0 규칙대로 `open`이다.
3. **Task 2 절차와 V4 명령 교체** (Implement-Codex R1 F1·F2 흡수). `git checkout`은 c2의 live
   세션이 그 사이 append한 정당한 이벤트까지 지우고 그 손실이 검증에서 깨끗하게 보인다. 식별된
   77줄만 제거 + 쓰기 직전 재판독 + 사후 보존 단언으로 바꿨다. V4는 git 조회 실패를 검증 실패로
   처리하도록 고쳤다.
4. **plan 본문 미편집.** `planAwareMarkdownHash`의 carve-out은 frontmatter 3키 · 체크박스 ·
   PR placeholder · 표 status 토큰뿐이라(`hash.js:93-176`) 본문을 고치면
   `mccp-plan-codex/ci-full-suite-m5.json`이 `stale`이 되어 이 사이클이 자기 게이트에 막힌다
   (M4가 겪은 경로). 게이트 기록은 `prp-implement` 2.5.4·2.5.6이 허용하는 notes 경로에 썼다.

## Issues Encountered

- **편차 가드가 거짓 HALT를 냈다.** Phase 4의 `plan-conflict-detector`가
  `conflict=true · signal=file-expansion`을 냈는데, unplanned 5건은 전부 이전 세션의 plan 게이트
  산출물(`STATE.md` · `fix-task-applied.md` · `findings/<slug>.jsonl` ·
  `plan-review-<slug>.md` · backlog)이고 구현 범위 확장은 0건이다. 그 축에는 게이트·state
  산출물 carve-out이 없다(`plan-conflict-detector.js:117-135`). false positive로 판정해
  `chain_aborted`를 세우지 않았고, 지적은 backlog에 증거와 함께 등재했다.
- **Codex 게이트는 divergent로 봉인됐다.** 리뷰어 verdict `needs-attention`이 구조화된 값으로
  왔고 `deriveGateVerdict`가 `divergent`로 판정했다. 두 finding은 모두 흡수했지만 verdict를
  `converged`로 위장하지 않았다(§3.12). 그래서 cross-gate dedupe는 닫힌 채로 남고
  `/mccp:pr`에서 PR-Codex가 반드시 발화한다.

## Tests Written

없음 — 코드 변경 0건이다. 검증은 plan의 V1·V2·V4·V5(실제 `classifyEvidence` · 실제 registry ·
실제 봉인 판독 · 실제 worktree 상태)와 기존 회귀 test 60건이 담당한다.

## Next Steps

- [ ] `/mccp:prp-commit` — 산출물 커밋
- [ ] `/mccp:pr` — PR 생성 (PR-Codex 발화 필수, dedupe 닫힘)
- [ ] Task 3 — closure-accounting M2 행이 `complete`로 머지된 뒤 `dispose --batch` 적용, 그 후 M5 행을 `complete`로
