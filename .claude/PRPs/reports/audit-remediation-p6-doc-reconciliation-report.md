# Implementation Report: 문서 정합화 (CLAUDE.md drift, audit-remediation P6)

## Summary

감사 A/B가 지목한 CLAUDE.md ↔ 코드 드리프트 8지점을 실제 동작에 정합화했다. behavior 변경 0 — 유일한 코드 touch는 `codex-invoke.js` 주석 classification enum(`parse-error` 누락 보정)이고 나머지는 전부 문서/버전 정정이다. 각 지점을 현재 CLAUDE.md에 재대조(staleness guard)한 뒤에만 편집했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small (doc-only + 주석 1건) | Small — 일치 |
| Files Changed | 8 (CLAUDE.md, codex-invoke.js, plugin.json, html.js, markdown.js, i18n test, CHANGELOG, PRD) | 8 + backlog(F2 이미 존재=noop, pre-existing 실패 1줄 추가) |
| 코드 로직 변경 | 0 (codex-invoke.js는 주석만) | 0 — 확인 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | §3.3 strict 14값 표 + tempfail 분리 + 주석 정합 | done | 표 body=14행 = 주석 enum=14 = 실제 생산값 14. `registry-malformed` 추가, `tempfail`은 classify.js 계층 별도 note로 이동 |
| 2 | derive "7 source" → "9 source" | done | §1.4·§5, ledger·worktrees 추가 (ls sources/*.js = 9) |
| 3 | §1.3 v1.3.1 informational allow-path | done | terminal PR hard-block 유지 명시 |
| 4 | §3.6 락 모델 분리 + no-token 잔여 리스크 | done | pr-phase.lock(hash+stdin) ↔ quarantine.lock(raw-token/advisory) 분리, "무해" 단정 제거, §4 runbook item 5 동반 정정. 코드 무변경(hardening=backlog) |
| 5 | §3.9 full enum + fixture 정정 | done | `ESCALATE_NEXT_ROUND`/`DIVERGENT_UNRESOLVED` + 준말 note. fixture는 미커밋(env force-fail이 dogfood 보장) 서술. Open Q1 → 기본값 (a) 문서정정 |
| 6 | §3.2 SessionEnd marker + §1.4 stop-loop + B#16 | done | SessionEnd `.end` marker(v1.20.5 fail-loud-open) 추가, stop-loop을 bounded 실패 카운터(MAX_COUNT=2)로 정정. B#16 advisory-lock=verified-noop(이미 정확) |
| 7 | 버전 bump 1.20.11 → 1.20.12 | done | plugin.json + footer×2 + i18n test + CHANGELOG row. 현재 max 재도출(1.20.11)에서 next-free 확정 |
| 8 | 재대조 sweep (staleness guard) | done | 8지점 재대조(1 verified-noop), release-surface 단일 max 확인, PRD P6 complete + version 1.20.10→1.20.12 reconcile |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (codex-invoke.js syntax) | Pass | node -c OK (주석만 변경) |
| i18n footer 테스트 | Pass | fail 0 (v1.20.12 assertion 동기) |
| 버전 일관성 | Pass | 3 surface = 1.20.12, CHANGELOG count=1, stray 1.20.11 없음 |
| 드리프트 앵커 | Pass | derive=9, quarantine hash/sha256=0, enum present, fixture 미추적 |
| receipt 회귀 | Pass | 420 tests, 0 fail |
| codex-invoke 회귀 | Pass | 35 tests, 0 fail (주석 편집 안전) |
| renderer 회귀 | **1 pre-existing fail** | 666/667 pass. `verdict-label.test.js:137`은 **origin/main baseline에서 이미 실패**(테스트+verdict-label.js diff 0, footer stash 후에도 실패) → P6 무관. backlog 기록 |

### Design Grounding

N/A (no design trigger — doc-only + comment). Phase 2.5.5b/2.5.5c/3.6/3.7 무발화.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `CLAUDE.md` | UPDATED | 8지점 문서 정정 |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATED | 주석 enum `parse-error` 추가 (comment-only, 로직 무변경) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.20.11 → 1.20.12 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | footer v1.20.12 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer v1.20.12 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | assertion v1.20.12 동기 |
| `CHANGELOG.md` | UPDATED | [1.20.12] row + versioning note 동기 |
| `.claude/prds/audit-remediation-followup.prd.md` | UPDATED | P6 complete + version 1.20.12 reconcile |
| `.claude/plans/codex-findings-backlog.md` | UPDATED | F2 quarantine no-token(이미 존재) + pre-existing 실패 기록 |

## Deviations from Plan

- Phase 0.0 recovery가 plan-codex receipt를 dedupe 마커 주입 전에 해시 → 2.5.1 마커 추가로 stale → plan-codex receipt를 현재 플랜에 맞춰 re-stamp(verdict=converged 불변)로 복구. 표준 flow의 내재적 상호작용.
- 완료 plan은 `.claude/plans/` 유지(archive 안 함) — receipt plan_hash 참조 유지 + dashboard-cycle 관행.

## Issues Encountered

- renderer `verdict-label.test.js` pre-existing 실패 발견(P6 무관, origin/main baseline). backlog에 MEDIUM으로 기록. P6 diff 자체는 회귀 0.

## Next Steps

- [ ] `/mccp:prp-commit` — P6 변경 커밋
- [ ] `/mccp:pr` — cross-gate dedupe(plan+implement 모두 converged)로 PR-Codex skip 후보. PR 직전 §3.7 forward-reconcile(1.20.12 선점 여부) 재확인.
- [ ] (별도) pre-existing verdict-label 회귀 조사
