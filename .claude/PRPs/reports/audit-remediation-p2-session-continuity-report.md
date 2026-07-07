# Implementation Report: P2 — Session-continuity silent-failure (1.20.5)

## Summary
audit-remediation PRD의 milestone 1/5. hook 레이어가 SessionEnd `.end` marker를 조용히 누락하던 root cause(B#4)를 hook-trace 독립 degraded marker로 닫고, 실패 은폐(B#5)를 loud stderr + marker 보장으로 표면화, idle 대화 세션 false crash(B#10)를 Stop per-turn lease heartbeat로, lock fd 누수(B#17)를 try/finally로, state-lock 문서 드리프트(B#16)를 정정. Codex Implement-R1 2 finding(F1/F2) 흡수.

## Assessment vs Reality
| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 15 | 14 (run-with-flags 미변경 — D3 근거) + tests/docs |
| Codex findings 흡수 | plan 2 (F1/F2) | plan 2 (구현에 반영) |

## Tasks Completed
| # | Task | Status | Notes |
|---|---|---|---|
| 1 | writeDegradedEndMarker + markSessionEndResilient (+F2 lease release) | ✅ | session-end-trace.js |
| 2 | session-end-marker.js 중첩 catch 표면화 | ✅ | degraded 폴백 + loud stderr |
| 3 | idle lease heartbeat (+F1 event.cwd/session_id) | ✅ | session-end.js Stop per-turn |
| 4 | loop-counter fd 누수 try/finally | ✅ | |
| 5 | state-writer fd 누수 try/finally | ✅ | |
| 6 | 회귀 테스트 (B#4/F1/F2/B#17) | ✅ | 6 신규 테스트 all green |
| 7 | CLAUDE.md §3.2 advisory 정정 | ✅ | |
| 8 | version bump 1.20.5 + footer×2 + CHANGELOG | ✅ | |

## Validation Results
| Level | Status | Notes |
|---|---|---|
| Unit Tests (affected) | ✅ Pass | 신규 6 + 회귀 전부 green |
| Footer version test | ✅ Pass | i18n-surface 10/10 (v1.20.5) |
| Regression | ✅ None from P2 | pre-existing g1-patch.test.js 3건은 base(1.20.4)에서도 실패 — 내 변경 무관·범위 밖 |

## Files Changed
- session-end-trace.js (+100/-), session-end-marker.js, session-end.js, loop-counter.js, state-writer.js — 코어
- session-end-trace.test.js, hook-trace.test.js, loop-counter.test.js, state-writer.test.js, i18n-surface.test.js — 테스트
- plugin.json, html.js, markdown.js — 1.20.5 동기
- CLAUDE.md (§3.2), CHANGELOG.md — 문서

## Deviations from Plan
- `run-with-flags.js` 미변경 (D3 근거: generic hook runner fail-open 계약 보존 — PreToolUse 등 exit 비0이 tool block). B#5 표면화는 session-end locus + marker 보장으로 달성. Plan에 명시됨.

## Known Pre-existing Failures (범위 밖)
- `plugins/mccp/scripts/hooks/tests/g1-patch.test.js` 3건 (receipt-prompt/receipt-skill G1 systemMessage) — base(origin/main 1.20.4)에서도 3/3 실패. P2 변경과 0 참조. 별도 axis.

## Next Steps
- [ ] `/mccp:prp-commit` → `/mccp:pr` (PR-Codex가 실제 diff 재검토 — codex_verdict 미stamp)
