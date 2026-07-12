# Implementation Report: Cost Model — Time-Based Decay (M3)

**Plan**: `.claude/plans/cost-model-subscription-m3.plan.md`
**PRD**: `.claude/prds/cost-model-subscription.prd.md` (최종 milestone → PRD 전체 종료)
**Branch**: `v1.22.0-cost-model-subscription-m3`
**Version**: `1.21.2 → 1.22.0` (minor — PRD 3개 milestone 전부 적용)

## Summary

"한 번 튄 가상 비용($314.50 sticky)이 5개 자동화를 영구·전역으로 잠그는" 문제의 잔존 근원을 시간 축으로 닫았다. sticky가 남던 두 표면 — (1) cost-state `mergeMonotonic`의 무조건 `Math.max` 계승, (2) STATE.md `chain_aborted`의 영구 abort — 을 각각 **cost-state time decay**(Axis 1)와 **subscription-aware producer + provenance ownership + decay-clear/legacy sweep**(Axis 2)로 해소했다. M2가 "신규 추정을 정확하게" 만들었으니 M3는 "오래된 추정이 스스로 사라지게" 만든다. decay 비활성(`MCCP_COST_STATE_DECAY_HOURS=0`) 시 M2 동작과 판정 byte-identical.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large (정확) |
| Files Changed | ~15 (일부 "변경 불필요" 포함) | 13 (source 3 · test 4 · docs/version 6) |
| Codex findings absorbed | Plan-R1 3H (F1/F2/F3) | + Implement-R1 2 (IF1 HIGH · IF2 MEDIUM) — cross-model이 실버그 2건 추가 검출 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | cost-state raw/decayed 분리 + write-side decay | ✅ Complete | `readStateRaw`/`readState`/`readStateOrThrow` 3-API + `decayIfStale`/`parseDecayMs` |
| 2 | cost-state.test.js (CREATE) | ✅ Complete | 18 tests |
| 3 | state-writer `abort_owner`/`cost_abort_at` + dispatch ownership | ✅ Complete | present-only 직렬화 |
| 4 | state-writer.test.js | ✅ Complete | +4 tests |
| 5 | ecc-context-monitor subscription-aware SET + decay-clear + legacy sweep | ✅ Complete | **IF1/IF2 흡수** |
| 6 | ecc-context-monitor.test.js | ✅ Complete | +10 tests (IF1/IF2 포함) |
| 7 | auto-chain 회귀 (F1 divergence + F2) | ✅ Complete | +3 tests (self-heal 포함) |
| 8 | 문서 + version bump + footer sync | ✅ Complete | 1.22.0 + footer + CHANGELOG + CLAUDE.md §4/§1.4/§3.2 |

## Codex Implementation Review (cross-model dual-review)

Codex verdict=`needs-attention`(HIGH 1 + MEDIUM 1) → 2건 R1 구현 흡수 → converge. threadId `019f5279-c6b2-7ff1-8ae7-3a66a76b9f43`.

- **IF1 (HIGH) — legacy sweep가 `plan_conflict_escalated` hard-stop 오clear**: plan의 sweep 조건이 `last_event!=='dispatch_chain_aborted'`만 제외해, marker 없이 `chain_aborted=true`를 쓰는 `plan_conflict_escalated`도 sweep에 걸려 auto-chain이 plan/impl conflict를 통과할 수 있었다. **흡수**: `NON_COST_ABORT_EVENTS={plan_conflict_escalated, dispatch_chain_aborted}` denylist. 두 이벤트만 자기 `last_event`를 쓰는 non-cost abort producer이고 cost path는 `last_event`를 안 바꾸는 게 cost-origin 서명. Task 6(i)가 회귀 고정.
- **IF2 (MEDIUM) — subscription SET가 stale bridge context 소비**: hook의 staleness null-out이 SET 이후에만 적용돼, 오래된 telemetry가 `chain_aborted`+`abort_owner='cost'` 영구 halt를 만들 수 있었다. **흡수**: bridge freshness(`isStale`)를 STATE.md producer 이전으로 hoist → stale 시 context를 null(signal-unknown→green)로 SET에 주입. Task 6(j)가 회귀 고정.

## Validation Results

| Level | Status | Notes |
|---|---|---|
| M3 타깃 4모듈 | ✅ Pass | 107 tests / 0 fail |
| Static (require integrity) | ✅ Pass | cost-state/ecc-context-monitor/state-writer/auto-chain load OK |
| Unit — cost-state | ✅ Pass | 18 (신규) |
| Unit — state-writer | ✅ Pass | +4 (48 total) |
| Unit — ecc-context-monitor | ✅ Pass | +10 (23 total, IF1/IF2 포함) |
| Unit — auto-chain | ✅ Pass | +3 (18 total, F1 divergence·self-heal·F2 통합) |
| state suite (full) | ✅ Pass | 199 / 0 fail |
| derive passthrough | ✅ Pass | `abort_owner`/`cost_abort_at` additive frontmatter 통과 (exit 0) |
| version | ✅ Pass | plugin.json = 1.22.0 |

### Pre-existing 실패 (M3 무관 — 회귀 아님)

전체 회귀 스위트에서 4건이 실패하나 **전부 pre-existing·환경적**이며 M3 변경과 무관하다:

- **hooks: g1-patch.test.js 3건** (`receipt-prompt`/`receipt-skill` G1 module-load fail-open) — 내 수정 모듈은 receipt-prompt/skill require 그래프에 부재. **전 변경 stash한 clean HEAD에서도 동일하게 3 fail 0 pass** 확인 → pre-existing.
- **lib: design-critique-loop-e2e.test.js 1건** (`.claude/cache/test-fixture-status.html` 부재) — CLAUDE.md §3.9에 명시된 **비커밋 임시 fixture**. M3는 design surface·fixture 미변경.

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/cost-state.js` | UPDATE | +93 |
| `plugins/mccp/scripts/lib/tests/cost-state.test.js` | CREATE | +198 |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | +34 |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | +59 |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | +146/-34 |
| `plugins/mccp/scripts/hooks/tests/ecc-context-monitor.test.js` | UPDATE | +204 |
| `plugins/mccp/scripts/lib/tests/auto-chain.test.js` | UPDATE | +108 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 1.22.0 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | footer v1.22.0 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer v1.22.0 |
| `CHANGELOG.md` | UPDATE | [1.22.0] row |
| `CLAUDE.md` | UPDATE | §4 토글 + §1.4 M3 row + §3.2 필드 |
| `.claude/prds/cost-model-subscription.prd.md` | UPDATE | M3 in-progress→complete |

## Deviations from Plan

- **Plan archive**: 일반 prp-implement Phase 5는 plan을 `completed/`로 이동하나, cost-model-subscription cycle 관행(M1/M2 plan이 `.claude/plans/`에 잔존)과 §3.11(PRD-level archive는 human-gate `/mccp:archive-complete`)을 따라 **plan을 `.claude/plans/`에 유지**했다. PRD 전체가 complete이므로 후속 `/mccp:archive-complete`로 PRD+3 plan을 함께 아카이브할 수 있다.
- **IF1/IF2 흡수**: plan Task 5/6를 Codex Implement 게이트 findings로 강화(denylist + freshness guard) — 순수 추가 흡수, architecture 무변경.

## Next Steps

- [ ] `/mccp:prp-commit` — M3 변경 커밋
- [ ] `/mccp:pr` — PR 생성 (design/security/Codex 게이트 통합)
- [ ] (PR merge 후) `/mccp:archive-complete` — 완료된 cost-model-subscription PRD + M1/M2/M3 plan 아카이브
