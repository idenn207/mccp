# Implementation Report: Integrity Unification M1 (무결성 통일 cycle)

**Plan**: `.claude/plans/integrity-unification-m1.plan.md`
**Branch**: `feat/integrity-unification-m1` (stacked on `chore/durable-evidence-substrate` / PR #110, OPEN)
**Version**: `1.22.4 → 1.22.5`
**Date**: 2026-07-24

## Summary

durable-evidence-substrate(#110)가 ship receipt를 git-tracked 감사 corpus로 승격했으나, completion-ledger 승인 술어가 여전히 `resolution.converged`(always-true, "writer finalized" ≠ "Codex approved")를 1차 게이트로 읽어 **거짓 승인이 durable corpus에 영구 기록되는 상태가 진행 중**이었다. M1은 corpus를 지키는 tightly-coupled 3축을 verdict SoT=`resolution.codex_verdict`, 무결성=`receiptHash` 재계산+schema validate로 통일했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (술어 deviation + fixture rework가 예상보다 결이 있었음) |
| Files Changed | ~13 | 16 코드/테스트 + 4 docs |
| Codex gate | Implement-Codex 검토 | **timeout(570s) → advisory** (운영자 승인) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | completion-ledger 승인 술어 codex_verdict-first | [done] | **운영자 승인 deviation**: skipped/unavailable append 유지(converged-only 초안 대비) |
| 1b | convergence 소비처 sweep (semantic + display) | [done] | 공유 `receipt-convergence.js`로 통일; projection source 수정으로 하위 상속 |
| 2 | evidence-stage-guard schema+gate+phase+slug | [done] | PURE 유지, R3/F1 tamper 위에 얹음 |
| 3 | evidence-audit hash_bound receiptHash 재계산 | [done] | Task 2와 대칭(같은 `receiptHash`), 실 corpus 불변 |
| — | migration `v1.22.5-ledger-verdict-repair.js` | [done] | 적용: 9 codex-verdict + 19 legacy-unknown + 0 superseded |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| M1 unit tests | [done] Pass | 79/79 (ledger index+store · stage-guard 15 · audit 22 · convergence 6 · migration 10) |
| Consumer regression | [done] Pass | 70/70 (escalate · worktrees · decision-state · audit-timeline · snapshot) |
| Renderer suite | [done] Pass* | 666/667 — 남은 1건 `verdict-label` metric은 **pre-existing**(stash 실측 확인) |
| Real corpus audit | [done] 불변 | `incomplete` / comparable=9 / hash_bound=9 / false_positive=0 / unverifiable=19 |
| Migration idempotency | [done] | 적용 후 dry-run = 0 changed, cardinality 28→28 |
| rg residual sweep | [done] | `resolution.converged` semantic 소비처 잔여 0 (주석/헬퍼 fallback만) |

\* pre-existing 실패 2건(`verdict-label.test.js` · `design-critique-loop-e2e` fixture 부재)은 M1 범위 밖, STATE.md 명시.

### 실측 end-to-end 검증

- migration 전: 3개 divergent ship이 `receipt/status`에서 `converged=true`로 표시(버그).
- migration 후 / 소비처 수정 후: `durable-evidence-substrate` · `live-activation-m3-pr-codex-absorption` · `workflow-orchestration-live-activation-m3` 모두 `converged=false`. ✅

## Files Changed

| File | Action | Why |
|---|---|---|
| `lib/receipt-convergence.js` | CREATED | codex_verdict-first 수렴 read 헬퍼(Task 1b 공유) |
| `migrations/v1.22.5-ledger-verdict-repair.js` | CREATED | verdict_provenance 재판정(Task 1.2) |
| `lib/completion-ledger/index.js` | UPDATED | 술어 codex_verdict-first(Task 1) |
| `lib/completion-ledger/store.js` | UPDATED | `verdict_provenance` 스키마(Task 1) |
| `lib/evidence-stage-guard.js` | UPDATED | schema+gate+phase+slug(Task 2) |
| `lib/evidence-audit.js` | UPDATED | hash_bound receiptHash+schema(Task 3) |
| `derive/sources/receipts.js` · `receipt/status.js` · `derive/sources/worktrees.js` · `lib/escalate-detector.js` | UPDATED | codex_verdict-aware(Task 1b) |
| `lib/renderer/html.js` · `lib/renderer/markdown.js` | UPDATED | footer version 동기 |
| tests (6 files) | CREATED/UPDATED | 회귀 고정 |
| `plugin.json` · `CLAUDE.md` · `CHANGELOG.md` · backlog | UPDATED | version bump + 문서 동기 |

## Deviations from Plan

1. **D1 (술어 semantic)**: plan은 converged-only(skipped 제외) 초안이었으나, dedupe happy-path 누락 + evidence-audit `verdictsAgree` 모순을 근거로 **운영자 확인 후 skipped/unavailable append 유지**. §Codex Implementation Review D1.
2. **D2 (migration 실측)**: plan의 "실측 거짓양성(live-activation-m3)" 예시는 부정확(그 divergent ship은 ledger entry 없음). 현 corpus false_positive=0, migration 실효는 표식만. superseded 경로는 fixture로 test.
3. **Implement-Codex gate**: Codex companion timeout(570s)으로 advisory 진행(운영자 승인). cross-model 적대 검토는 `/mccp:pr`(PR-Codex)로 이연.

## Issues Encountered

- **Codex companion timeout** — 이 환경의 Codex가 570s 무응답. advisory mode로 우회(운영자 승인). PR 완주 전 Codex operability 복구 필요(terminal `/mccp:pr`은 advisory 거부).
- **Task 3 fixture rework** — evidence-audit 테스트가 fake hash 최소 receipt를 써서, receiptHash 재계산 도입 시 전부 깨짐. full valid receipt fixture(makeSkeleton + `MATCH` sentinel)로 재구축.
- **stale-cache** — command body 하드코딩 경로(cache 1.22.2)가 stale이라 로컬 워크트리 스크립트를 SSoT로 사용.

## Next Steps

- [ ] Codex operability 복구 후 `/mccp:pr`로 PR 생성 (PR-Codex가 divergent plan → 전체 diff 재검토).
- [ ] PR #110(durable-evidence-substrate) 머지 후 이 stacked PR 머지.
- [ ] M2 (leak-scan path-precision · subject_hash tamper · parseReviewPayload fixture).
- [ ] M3 (terminal `/mccp:pr` non-approving mechanical hard-stop 재설계).
