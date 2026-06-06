# Plan: v0.2.5 — Impeccable Design-Review Automation (Milestone 1)

**Status**: ✅ **SHIPPED**
**Plugin version**: 0.2.5 → **0.2.6** (재정렬 — v0.2.5 hotfix가 이미 main에 ship됨, Milestone 1 = 0.2.5 → 0.2.6 으로 적용)
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 1
**Implementation report**: [.claude/PRPs/reports/mccp-roadmap-milestone-1-report.md](../PRPs/reports/mccp-roadmap-milestone-1-report.md)
**Source PRD**: 통합 — 사용자 메시지(2026-06-04) + roadmap consolidation
**Complexity**: Medium-Large (plan), Medium-Large (actual — 일치)

---

## Summary

7개 mccp command (`/mccp:plan-prd`, `/mccp:plan`, `/mccp:prp-implement`, `/mccp:code-review`, `/mccp:pr`, `/mccp:prp-pr`, `/mccp:review-pr`)에 impeccable 디자인 검증 게이트 통합. `impeccable-detect.js` mode-aware helper + primary codex receipt `impeccable_*` 4-axis meta + `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audited escape (schema REJECT 강도, F4 흡수).

## Codex R1 Absorptions (모두 본 milestone에 적용)

- **F1**: `design_*` namespace 폐기, 기존 `*-impeccable` gate IDs + primary codex receipt meta로 일원화.
- **F2**: 가용성 primary dimension은 `skill_available` (Skill 등록 여부), `cli_available`은 telemetry only.
- **F3**: detection을 mode-aware로 (`prd`/`plan`/`implement`/`pr`/`review` — git diff 없는 단계도 artifact 기반).
- **F4**: `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` reason은 **SCHEMA REJECT** (security와 다른 강도).

## Security Reviewer (M1) — F-Sec-1~5

Verdict: **NEEDS-ATTENTION** (0 HIGH/CRITICAL → gate proceeds with implement-time absorption). 5 findings, all MEDIUM/LOW:

- **F-Sec-1 (MEDIUM)** — Reason validator cross-namespace divergence: write/schema 양쪽 검증 시 코드 중복. **흡수**: reason validator를 `plugins/mccp/scripts/receipt/lib/force-override-reason.js` 단일 helper로 분리. v0.2.7+ security namespace backport 시 같은 helper에 namespace-aware strictness flag 추가.
- **F-Sec-2 (MEDIUM)** — Path traversal via `--plan <user-path>`: impeccable-detect.js가 사용자 입력을 검증 없이 fs.read. **흡수**: `path.resolve(cwd, userPath)` + `path.relative(repoRoot, abs).startsWith('..')` 거부. Unit test에 traversal positive case.
- **F-Sec-3 (LOW)** — Skill registry probe telemetry on stdout: `cli_available`이 caller stdout에 노출. **흡수**: `--json` 출력에 `cli_available` 별도 `--telemetry` flag 분리 또는 caller가 STATE.md write 외 사용 금지 주석.
- **F-Sec-4 (MEDIUM)** — Cross-namespace schema bypass via direct store.js write: validator 우회 시 invariant 무효화. **흡수**: impeccable invariant를 schema.js에 명시(security 대칭) + write.js buildReceipt가 validate() 호출 전 sanitization 단계 추가 금지. write.js grep guard test로 validate가 단일 진입점인지 확인.
- **F-Sec-5 (LOW)** — PR body Override section markdown injection: v0.2.5 reason validator ≥30자 통과 후 inject로 자동 방어. v0.2.4 security override는 reason 미검증 → v0.2.7 backport에서 bash escaping 필요. **v0.2.4 backport debt에 escaping 항목 추가**.

세션 ref: security-reviewer agent direct invocation (Task tool), 2026-06-04 cycle.

## Shipped Commits (current branch)

| Commit | Scope |
|---|---|
| `6da66bc` | feat(v0.2.6): Milestone 1 — impeccable design-review wiring (helper + receipt schema) |
| `7300d47` | feat(v0.2.6): Milestone 1 — impeccable design-review wiring (commands + version bump) |

(v0.2.5 hotfix `e64a398`는 본 milestone 진입 전에 main에 ship — version 재정렬 사유)

## Tests Added

- `impeccable-detect.test.js` (19) — 8-combo + mode 분기 + path traversal
- `impeccable-skipped.test.js` (7) — strict/lenient + dual-skipped + reason persist
- `impeccable-force-override.test.js` (11) — 3 positive + 7 REJECT + 1 validate warning
- `state-matrix.test.js` (+6) — cross-namespace allowed / same-namespace REJECT
- `impeccable-guard.test.js` (9) — wiring drift regression

**Total**: 52 new tests (plan acceptance "~50" 충족), 427 pass / 0 fail.

## Outstanding Debt (deferred to later milestones)

- `docs/gate-design.md` impeccable matrix + `docs/ENVIRONMENT.md` + README 잔재 cleanup checklist → **v0.2.6 housekeeping** (Milestone 2)
- fake Skill harness dogfood test → **v0.2.7** (Milestone 2.5)
- v0.2.4 `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` reason validator strict flip (F-Sec-5 backport) → **v0.2.7+** (compatibility risk, 별도 cycle)

## Acceptance (post-hoc verification)

- [x] 7개 명령 wiring (grep verified)
- [x] impeccable-detect.js + 19 tests
- [x] receipt schema 4 fields + invariant
- [x] strict/lenient gate split
- [x] F4 REJECT 정책 (11 case)
- [x] state-matrix expansion (17 total)
- [x] regression guard test pass
- [x] CLAUDE.md §4 env 추가
- [x] plugin.json 0.2.6 (재정렬)
- [x] 427 tests pass
- [x] ECC 잔재 hook 무참조 (grep)

## Receipt Chain

- `mccp-plan-codex/mccp-roadmap.json` — R1+R2 converged (plan-time)
- `mccp-implement-codex/mccp-roadmap.json` — **NOT FOUND in current working tree**. Milestone 1 report claimed creation (base=`e64a398`, head=`b2b0127`), but `.claude/receipts/mccp-implement-codex/` 현재 `default.json`/`main.json` (v0.1 era)만 존재. Receipts는 gitignored — 본 sub-plan은 사실 상태를 기록.
- `mccp-pr-codex/...` — PR 생성 안 됨 (PR is M2.5/v0.2.7 boundary work)

## Source Sections (roadmap)

본 milestone의 상세 task 분해, design decisions, mirror patterns, risks는 thin-index 변환 전 roadmap의 §Milestone 1 (lines 245-413, pre-thinning)에 보존됨. Historical reference는 `git log -p .claude/plans/mccp-roadmap.plan.md` 또는 archive snapshots 참조.
