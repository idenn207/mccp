# Plan: v0.3.0 — S10b Auto-Handoff ($100 hard ceiling) (Milestone 3)

**Status**: ⏳ **NOT STARTED**
**Plugin version**: 0.2.7 → **0.3.0** (major minor bump — semantics 확장)
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 3
**Design reference**: [docs/v0.2-architecture.md §4](../../docs/v0.2-architecture.md)

---

## Summary

cost hard ceiling 자동 enforcement. v0.2 architecture §4 sequence diagram 그대로 구현. `$50` notice / `$80` soft / `$100` hard 임계로 자동 세션 전환. **현재 CLAUDE.md §4는 `MCCP_AUTO_HANDOFF=off|notify|spawn` 환경변수가 "⚠ S10b 미구현. 환경변수만 예약된 상태"로 명시** — 본 milestone이 그 주석을 제거.

## Tasks

### Task 3.1: breakpoint-detector.js

- **Action**: STATE.md fingerprint + cost threshold 결합 — task 단위 안전한 stop point 탐지.
- **Mirror**: [docs/v0.2-architecture.md §4](../../docs/v0.2-architecture.md) sequence diagram.
- **Validate**: fingerprint matching + threshold breach scenarios unit tests.

### Task 3.2: auto-handoff.js hook

- **Action**: $50 notice / $80 soft / $100 hard 임계. hard ceiling 시 세션 자동 spawn (PowerShell `Start-Process` + restored STATE.md).
- **Validate**: $50/$80/$100 threshold matrix unit test + STATE.md handoff snapshot test.

### Task 3.3: `MCCP_AUTO_HANDOFF=off|notify|spawn` env live

- **Action**: CLAUDE.md §4의 "⚠ S10b 미구현. 환경변수만 예약된 상태" 주석 제거. 실제 hook 동작 wiring.

### Task 3.4: plugin.json bump + PR

- **Action**: 0.2.7 → 0.3.0. minor bump는 backward-compatible semantics 확장 signal.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Hook spawn | [scripts/hooks/stop-loop.js](../../plugins/mccp/scripts/hooks/) | child process orchestration |
| STATE.md handoff | [scripts/state/state-writer.js](../../plugins/mccp/scripts/state/state-writer.js) | atomic snapshot + restore |
| Threshold env | v0.2.4 `MCCP_FORCE_PR_WITHOUT_*` | env-driven action gating |

## Files to Change

| File | Action |
|---|---|
| `plugins/mccp/scripts/hooks/auto-handoff.js` | CREATE |
| `plugins/mccp/scripts/hooks/breakpoint-detector.js` | CREATE |
| `plugins/mccp/scripts/hooks/tests/auto-handoff.test.js` | CREATE |
| `plugins/mccp/scripts/hooks/tests/breakpoint-detector.test.js` | CREATE |
| `plugins/mccp/hooks/hooks.json` | UPDATE (auto-handoff entry) |
| `CLAUDE.md` | UPDATE §4 cheat sheet (⚠ 주석 제거) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE 0.2.7 → 0.3.0 |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 자동 세션 spawn 시 STATE.md race condition | Medium | atomic lock + lease (v0.2.7 hook-trace 패턴 재사용) |
| Cost threshold 정확도 (Claude usage API 지연) | Medium | conservative threshold + grace period |
| Windows PowerShell `Start-Process` 환경 의존 | Low | dry-run mode + telemetry |

## Acceptance

- [ ] auto-handoff hook fires at thresholds ($50/$80/$100)
- [ ] STATE.md `next_chunk` populated at handoff
- [ ] PowerShell spawn 시 새 세션이 STATE.md 복원
- [ ] threshold matrix unit test 통과
- [ ] CLAUDE.md §4 "⚠ 미구현" 주석 제거
- [ ] plugin.json 0.3.0 + PR merge

## Source Sections (roadmap)

본 milestone 본문은 thin-index 변환 전 roadmap의 §Milestone 3 (lines 824-852)에 있음. v0.2 architecture §4 sequence diagram이 design canon.
