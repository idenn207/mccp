# Plan: v0.3.2 — S12 Dual-Reviewer Escalate (Milestone 5)

**Status**: ⏳ **NOT STARTED**
**Plugin version**: 0.3.1 → **0.3.2**
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 5

---

## Summary

CRITICAL / divergent finding 시 `fix-task.md`에 `Next: /santa-loop <args>` 안내 자동 추가. **자동 invoke는 안 함** — 사용자 결정 보존.

## Tasks

### Task 5.1: escalate-detector.js

- **Action**: receipt resolution.open_questions + CRITICAL findings 스캔. 임계 충족 시 `fix-task.md` 끝에 escalate 안내 append.
- **Trigger conditions**:
  - resolution.converged=false + rounds≥3 (divergent unresolved)
  - findings 中 severity=CRITICAL ≥1
  - open_questions 中 auto-CRITICAL 카탈로그 매칭 (secret/data-loss/migration/auth-bypass 등)
- **Mirror**: [.claude/state/fix-task.md](../state/fix-task.md) 기존 write 패턴.

### Task 5.2: santa-loop.md 통합

- **Action**: 기존 [commands/santa-loop.md](../../plugins/mccp/commands/santa-loop.md) command body에 escalate 진입 시 STATE.md fingerprint validation 추가.
- **Validate**: escalate context inject 시 fingerprint match 검증 — drift 시 경고.

### Task 5.3: plugin.json bump + PR

- **Action**: 0.3.1 → 0.3.2.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| fix-task.md append | [state-writer.js](../../plugins/mccp/scripts/state/state-writer.js) | atomic write + frontmatter |
| CRITICAL catalog | `/mccp:plan` Phase 5.5 auto-CRITICAL check | 동일 catalog 재사용 |
| Receipt scan | [receipt/cli.js](../../plugins/mccp/scripts/receipt/cli.js) `status --json` | findings + open_questions 파싱 |

## Files to Change

| File | Action |
|---|---|
| `plugins/mccp/scripts/lib/escalate-detector.js` | CREATE |
| `plugins/mccp/scripts/lib/tests/escalate-detector.test.js` | CREATE |
| `plugins/mccp/commands/santa-loop.md` | UPDATE (escalate context validation) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE 0.3.1 → 0.3.2 |

## Design Constraint

**자동 `/santa-loop` invoke 안 함**. 본 milestone은 *안내*만 추가. 사용자가 escalate 결정을 보존해야 함 — adversarial review는 cost가 있고, false-positive CRITICAL 분류 시 자동 invoke가 quota 낭비.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| CRITICAL 오분류 → escalate spam | Medium | catalog는 conservative — 명확한 패턴만 트리거 |
| fix-task.md write race condition | Low | atomic lock (v0.2.7 hook-trace 패턴) |
| escalate 안내 사용자가 무시 → silent risk | Low | 안내 텍스트 명확화 + STATE.md `escalate_pending` flag |

## Acceptance

- [ ] escalate trigger fires on CRITICAL (catalog 매칭)
- [ ] divergent unresolved (round≥3 + converged=false) 트리거
- [ ] `Next: /santa-loop` 안내 inject (자동 invoke X)
- [ ] STATE.md `escalate_pending` flag
- [ ] santa-loop.md fingerprint validation
- [ ] plugin.json 0.3.2 + PR merge

## Source Sections (roadmap)

본 milestone 본문은 thin-index 변환 전 roadmap의 §Milestone 5 (lines 880-904)에 있음.
