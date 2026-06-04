# Implementation Report: Milestone 2 — v0.2.6 Housekeeping + INC-001 Absorption

## Summary

Plan의 Milestone 2 (v0.2.6 Housekeeping) 4 task를 모두 완료하고, 그 과정에서 발견된 INC-001 (`/mccp:prp-implement` silent block) 의 4축 residual debt 중 R1/R4를 흡수, R2는 partial 흡수. 작업 중 receipts 디렉토리가 gitignored임을 발견해 R1의 본질이 *"리포에 마이그레이션 결과를 커밋"* 이 아니라 *"각 워크스테이션이 마이그레이션 스크립트를 cumulative chain으로 실행"* 임을 재정의 — CLAUDE.md cheat-sheet 한 줄로 정착.

플러그인 version은 사용자 결정에 따라 0.2.6 유지 (commit history v0.2.6 라벨과 정합, downstream milestone 재명명 회피).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small (Housekeeping) | Small-Medium (INC-001 cumulative migration이 scope 추가) |
| Plugin version | 0.2.5 → 0.2.6 (bump) | 0.2.6 → **0.2.6 유지** (M1이 0.2.6를 이미 차지) |
| 영향 받는 파일 | 4 task 기준 ~6 | 9 (test + migrations dir + CLAUDE.md + plan annotation) |
| 신규 test | derive-decision 4 + pr-body N | derive-decision 4 + pr-body 2 = 6 |
| Receipt 마이그레이션 | 11 | 11/11 schema validate ok |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 2.1 | derive-decision `--plan` flag | Done | `slugFromPlanPath` helper 분리 + opts.planPath precedence (explicit `--decision` > planPath > args > branch). 4 new test cases. |
| 2.2 | `.gitattributes` repo-wide EOL | Done | `* text=auto eol=lf` + `*.{ps1,cmd,bat} eol=crlf`. `git add --renormalize .` 결과 0 content diff (533 `w/crlf` 파일 모두 이미 `i/lf`). |
| 2.3 | pr-body residual audit | Done (noop + safety net) | UTF-8/emoji/markdown/CRLF byte-fidelity는 이미 견고. 2개 regression test로 미래 normalization 추가 시 자동 catch. |
| 2.4 | plugin.json bump | Skipped (사용자 결정) | M1이 이미 0.2.6 라벨 — bump 불필요. 사용자가 `0.2.6 유지` 옵션 선택. |
| INC-001 R4 | Migration script promote | Done | `.claude/state/receipt-impeccable-migrate.js` → `plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js` + sibling `v0.2.4-security-fields.js`. `module.exports` 추가로 test-ability 확보. Idempotent verification은 *target fields presence only*로 축소 (cumulative chain 친화). |
| INC-001 R1 | Batch-migrate 11 receipts | Done (local only) | v0.2.4 → v0.2.6 순서 cumulative 적용. 11/11 schema validate ok. Receipts는 `.gitignore`로 working-tree only이므로 commit artifact 없음. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | (Node native — no type-check) | N/A — pure JS. ESLint 미설정. |
| Unit Tests | 462 pass / 463 (1 skip, 0 fail) | receipt 218 + lib 112 (+1 skip) + hooks 22 + quality+state 110 = 463 total. duration ~6.1 min. |
| Build | N/A — no build step | plugin은 source-distributed |
| Integration | partial | receipt CLI E2E (derive-decision + validate) 인터랙티브 검증. |
| Schema migration | 11/11 ok | v0.2.4 → v0.2.6 cumulative 적용 후 모든 receipt validate. |

## Files Changed (M2 branch range)

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/receipt/decision.js` | UPDATED | +18 / -3 (slugFromPlanPath + opts.planPath) |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATED | +3 / -1 (--plan flag + help) |
| `plugins/mccp/scripts/receipt/tests/decision.test.js` | UPDATED | +67 (4 new tests + import) |
| `.gitattributes` | CREATED | +15 |
| `plugins/mccp/scripts/receipt/tests/pr-body.test.js` | UPDATED | +40 (2 regression tests + section comment) |
| `plugins/mccp/scripts/migrations/v0.2.4-security-fields.js` | CREATED | +103 |
| `plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js` | CREATED | +103 (promoted from `.claude/state/` + idempotency rewrite) |
| `.claude/state/receipt-impeccable-migrate.js` | DELETED | -65 (promoted) |
| `CLAUDE.md` | UPDATED | +6 (migrations cheat-sheet) |
| `.claude/plans/mccp-roadmap.plan.md` | UPDATED | +11 (Operational Incidents absorption matrix) |

## Deviations from Plan

1. **Task 2.4 version bump → 0.2.6 유지** — plan 본문은 0.2.5 → 0.2.6를 적었으나 M1 commit history (7300d47, 6da66bc)가 이미 v0.2.6를 사용. 사용자 컨펌으로 bump 생략. plan 본문 numbering drift는 historical 기록으로 유지.
2. **INC-001 R1 scope 재정의** — plan은 *"batch-migrate 11 receipts"*를 한 줄짜리 명령으로 적었으나 실제로는: (a) receipts가 gitignored, (b) v0.2.4 + v0.2.6 두 스키마 버전 동시 드리프트, (c) 단일 스크립트로 처리 시 R4 naming 깨짐. → sibling script + cumulative chain + CLAUDE.md runbook entry로 expansion.
3. **INC-001 R2 partial** — `plugins/mccp/scripts/migrations/` 디렉토리 + 2 스크립트는 v0.2.7 milestone scope였으나 R1을 풀려면 즉시 필요. R2의 "automated discovery (validate-cmd hint)"는 여전히 v0.2.7 scope에 남김.
4. **Phase 2.5 — 새 Codex round 미실행** — plan body의 `## Codex Implementation Review` 섹션이 이미 dedupe 선언, chain receipt valid. 새 Codex 호출 없이 cross-gate dedupe 적용. M2 housekeeping이 plan-codex 시점에 사전-약속되지 않은 micro-decision (sibling script 분리, idempotency 축소)을 도입했지만 architectural 결정이 아닌 implementation 디테일이라 dedupe 유효.

## Issues Encountered

1. **derive-decision `--decision-id` flag 오해** — 처음에 잘못된 flag 이름으로 chain validate가 default decisionId로 fallback. CLI help 재확인 후 `--decision`이 올바른 이름 확인.
2. **dedupe.js null byte 의도성** — `.gitattributes` 작성 중 git이 dedupe.js를 binary로 감지하는 원인 발견. JCS hash separator 용 의도적 `\0`. blanket `*.js text` 강제를 피하고 주석으로 미래 reviewer에게 warning.
3. **cumulative migration 시 over-strict validate** — 첫 구현은 idempotent 분기에서 full schema validate를 호출 → v0.2.4 fields는 있으나 v0.2.6 fields 없는 receipt가 `invalid`로 잘못 분류. *"target fields presence only"* contract로 축소.
4. **receipts directory gitignored** — INC-001 R1을 풀고 commit하려다 발견. R1의 본질을 *"per-workstation 마이그레이션 실행"* 으로 재정의 + cheat-sheet 한 줄로 운영자 도구화.

## Tests Written

| Test File | Tests Added | Coverage |
|---|---|---|
| `tests/decision.test.js` | 4 (slugFromPlanPath direct + null + opts.planPath wins + falls through) | Task 2.1 |
| `tests/pr-body.test.js` | 2 (UTF-8/emoji/markdown round-trip + mixed EOL preservation) | Task 2.3 regression |

## Next Steps

- Phase 6 OUTPUT — auto-chain check → `/mccp:prp-commit` (이미 atomic commit 5개로 분리됨) → `/mccp:pr`
- v0.2.7 silent-hook UX milestone에서 INC-001 R2 잔여분 (validate-cmd hint) + R3 (block-path observability) 흡수
- v0.2.4 security_force_override backport (plan body Codex Implementation Review F-Sec-1 잔여 debt)
