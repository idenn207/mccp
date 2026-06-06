# Plan: v0.2.6 — Housekeeping + INC-001 R1/R4 Absorption (Milestone 2)

**Status**: ✅ **SHIPPED** (partial — R2 deferred to v0.2.7)
**Plugin version**: 0.2.6 유지 (Milestone 1이 이미 0.2.6 라벨 사용 — 사용자 결정으로 bump 생략)
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 2
**Implementation report**: [.claude/PRPs/reports/mccp-roadmap-milestone-2-report.md](../PRPs/reports/mccp-roadmap-milestone-2-report.md)
**Complexity**: Small-Medium (INC-001 cumulative migration이 scope 추가)

---

## Summary

Plan §Milestone 2 housekeeping 4 task + INC-001 (`/mccp:prp-implement` silent block) 4축 residual debt 흡수. derive-decision plan-path 통일 + `.gitattributes` EOL 통일 + pr-body regression + 마이그레이션 스크립트 promote + cumulative chain runbook.

작업 중 receipts 디렉토리가 gitignored임을 발견 → INC-001 R1의 본질을 *"repo에 결과 commit"*이 아니라 *"per-workstation cumulative migration 실행"*으로 재정의.

## Tasks Completed (4 + 2 absorption)

| # | Task | Note |
|---|---|---|
| 2.1 | derive-decision `--plan` flag | `slugFromPlanPath` helper + opts.planPath precedence. 4 new tests. |
| 2.2 | `.gitattributes` repo-wide EOL | `* text=auto eol=lf` + `*.{ps1,cmd,bat} eol=crlf`. `git add --renormalize .` → 0 content diff. |
| 2.3 | pr-body residual audit | noop + 2 regression tests (UTF-8/emoji + mixed EOL preservation). |
| 2.4 | plugin.json bump | **Skipped** — M1이 이미 0.2.6 라벨, 사용자 confirmation. |
| INC-001 R1 | Batch-migrate 11 receipts | 11/11 schema validate ok (local only — receipts gitignored). |
| INC-001 R4 | Migration script promote | `.claude/state/receipt-impeccable-migrate.js` → `plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js` + sibling `v0.2.4-security-fields.js`. `module.exports`로 testability. |

## Shipped Commits (current branch)

| Commit | Scope |
|---|---|
| `ab02a8a` | chore(v0.2.6): INC-001 receipt schema forward-migration |
| `d6bf878` | docs(v0.2.6): INC-001 R1/R2/R4 absorption + migrations cheat-sheet |
| `e75afca` | docs(v0.2.6): M2 implementation report — Milestone 2 + INC-001 absorption |

## Deviations from Plan

1. **Version 0.2.6 유지** — M1이 이미 라벨 차지. plan 본문 numbering drift는 historical 기록으로 유지.
2. **INC-001 R1 재정의** — receipts gitignored 발견 후 cumulative chain runbook으로 expand.
3. **INC-001 R2 partial** — migrations 디렉토리 + 2 스크립트 ship. "automated discovery (validate-cmd hint)"는 v0.2.7 scope 잔존.
4. **Phase 2.5 — 새 Codex round 미실행** — cross-gate dedupe (plan-codex receipt 사용). architectural decision 없음, implementation 디테일만.

## INC-001 Residual Status (post-M2)

| ID | Status | Disposition |
|---|---|---|
| R1 | **resolved** | 11/11 local migration ok. Repo entry는 R4 (scripts ship). |
| R2 | **partial** | migrations 디렉토리 establish + 2 cumulative scripts ship. Full v0.2.7 absorption은 validate-cmd hint 자동 listing 잔존. |
| R3 | **deferred** | Block-path observability → v0.2.7 silent-hook UX scope. |
| R4 | **resolved** | Migration script promoted to `plugins/mccp/scripts/migrations/`. CLAUDE.md §4 cheat sheet entry. |

## Tests Added

- `decision.test.js` (+4) — slugFromPlanPath + opts.planPath precedence
- `pr-body.test.js` (+2) — UTF-8/emoji round-trip + mixed EOL preservation

**Total**: 6 new, 462 pass / 463 (1 skip, 0 fail).

## Receipt Chain

- `mccp-plan-codex/mccp-roadmap.json` — schema migrated to v0.2.6 (receipt_hash=`sha256:0020407823a3...`)
- `mccp-implement-codex/mccp-roadmap.json` — M2 report claims migration to v0.2.6 (receipt_hash=`sha256:cb620648a8c0...`), 현재 working tree 부재. Receipts gitignored — sub-plan은 사실 상태 기록.

## Source Sections (roadmap)

본 milestone의 상세는 thin-index 변환 전 roadmap의 §Milestone 2 (lines 416-449) + §Operational Incidents Log INC-001 (lines 1007-1057, 보존됨)에 있음.
