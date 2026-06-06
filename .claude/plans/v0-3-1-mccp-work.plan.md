# Plan: v0.3.1 — S11 `/mccp:work` Single Entry (Milestone 4)

**Status**: ⏳ **NOT STARTED**
**Plugin version**: 0.3.0 → **0.3.1**
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 4

---

## Summary

PRD → plan → implement → PR 단일 entry orchestration. trivial heuristic (사용자 Q3) 적용 — 단순 작업은 `/mccp:prp-commit + /mccp:pr` 직행, 복잡한 작업은 full chain.

## Tasks

### Task 4.1: `/mccp:work` command body

- **Action**: [commands/work.md](../../plugins/mccp/commands/work.md) 신규. trivial heuristic 적용:
  - **trivial path**: 한 파일 단순 수정/typo/comment → `/mccp:prp-commit` + `/mccp:pr` 직행
  - **full chain**: 새 기능/architectural change → `/mccp:plan-prd` → `/mccp:plan` → `/mccp:prp-implement` → `/mccp:pr`
- **Mirror**: 기존 명령 markdown 구조 (Phase 0 preamble, Phase 분리).

### Task 4.2: work-orchestrator.js + tests

- **Action**: chain state machine — 각 단계 receipt 통과 후 다음 단계 자동 invoke. 중간 사용자 컨펌 없음 (Phase 5 forbidden 패턴 mirror).
- **Mirror**: `/mccp:plan` Phase 5 sub-step sequence (5.1-5.7) — receipt check + auto-progression.
- **Validate**: chain state matrix — trivial/full × success/failure × retry.

### Task 4.3: plugin.json bump + PR

- **Action**: 0.3.0 → 0.3.1.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Sub-step orchestration | [plan.md Phase 5](../../plugins/mccp/commands/plan.md) | "Do not ask between sub-steps" |
| Receipt-driven progression | [receipt/cli.js](../../plugins/mccp/scripts/receipt/cli.js) `validate --command` | preflight gate |
| Trivial detection | (new) | git diff stat + file count + extension heuristic |

## Files to Change

| File | Action |
|---|---|
| `plugins/mccp/commands/work.md` | CREATE |
| `plugins/mccp/scripts/lib/work-orchestrator.js` | CREATE |
| `plugins/mccp/scripts/lib/tests/work-orchestrator.test.js` | CREATE |
| `CLAUDE.md` | UPDATE §1.3 자동화 파이프라인 (단일 entry 명시) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE 0.3.0 → 0.3.1 |

## Open Questions

- **MEDIUM (Q3 from roadmap)**: trivial vs full chain 판단 heuristic 정밀도 — 잘못 분류 시 plan 없이 mutation 진행 위험. 보수적 default = full chain.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| trivial 오분류로 plan-less mutation | Medium | 보수적 default + 사용자 override flag (`--full` / `--trivial`) |
| chain 중간 receipt 실패 시 복구 모호 | Medium | 각 단계 fail 시 `fix-task.md` write + 명시적 stop |
| v0.2.8 review-only invariant와 dual-trigger | Low | v0.2.8 머지 후에만 본 milestone 진입 |

## Acceptance

- [ ] `/mccp:work <feature>` end-to-end chain (trivial + full 양쪽)
- [ ] trivial vs full chain heuristic test
- [ ] receipt-driven progression — 각 단계 valid 후에만 다음 진입
- [ ] CLAUDE.md §1.3 갱신
- [ ] plugin.json 0.3.1 + PR merge

## Source Sections (roadmap)

본 milestone 본문은 thin-index 변환 전 roadmap의 §Milestone 4 (lines 856-878)에 있음.
