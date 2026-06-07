# Implementation Report: v0.2.9 Gate Round Budget + YAGNI Triage

## Summary

mccp의 게이트(plan/implement/pr) 3종이 Codex adversarial review를 무조건 최대 3 round로 escalate하던 정책을 **severity-gated cap (default 1)** + **YAGNI Triage 표** + **`.claude/plans/codex-findings-backlog.md` defer 파일**로 교체. 신규 env `MCCP_GATE_ROUND_CAP=1|2|3` (default 1) 도입. schema bump 없음, 신규 helper/hook/lock 없음, 모든 변경은 spec-level (markdown + 1 receipt CLI 옵션 + 1 unit test). Codex 재활성화 후 cycle당 최대 9 호출 → 3 호출 이하 cap이 즉시 적용됨.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small (10 파일) | Small (10 파일 확정) |
| Confidence | 정책 효과 즉시 측정 불가 (Codex 영구 비활성), spec compliance는 mechanical 검증 | mechanical 검증 PASS (모든 grep + node --test + schema forward-compat) |
| Files Changed | 8 UPDATE + 2 CREATE | 8 UPDATE + 2 CREATE (정확) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `docs/gate-design.md` round policy | ✓ Complete | Divergent auto-rerun 단락 교체. `MCCP_GATE_ROUND_CAP` 2 hit. |
| 2 | `plan.md` Phase 5.3 schema + 5.4 cap policy | ✓ Complete | YAGNI Triage 표 + Severity-gated re-rerun 본문 교체. |
| 3 | `prp-implement.md` Phase 2.5.4 + 2.5.1 dedupe | ✓ Complete | 2.5.1에 `git diff --name-only origin/<base>..HEAD ⊆ Files to Change` 조건 추가. 2.5.4 schema + cap policy 교체. |
| 4 | `pr.md` Phase 2.5.4 schema + 2.5.3 env export | ✓ Complete | codex-runner 호출 직전 `export MCCP_GATE_ROUND_CAP="${MCCP_GATE_ROUND_CAP:-1}"` 1줄 추가 — child process inherit. |
| 5 | Receipt CLI `--deferred-findings` + schema additive | ✓ Complete | cli.js usage + write.js meta + schema.js validate/skeleton 4곳 추가. round-trip validated. |
| 6 | `codex-findings-backlog.md` CREATE + roadmap UPDATE | ✓ Complete | Append-only log file + roadmap Active Milestones 2.7 행 + Patterns to Mirror 행. |
| 7 | `CLAUDE.md` §1.3 + §4 cheat sheet | ✓ Complete | §1.3 끝 한 단락 + §4 운영 토글 블록 한 줄. |
| 8 | `round-budget.test.js` (3 boundary cases) | ✓ Complete | Policy oracle 패턴 — pure function 내장, 5/5 PASS (plan의 3 + clamp/ordering 보너스 2). |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | ✓ Pass | markdownlint MD032 경고만 표면 — user `feedback-no-markdownlint-fix-cycle` 정책에 따라 무시. |
| Unit Tests (new) | ✓ Pass | round-budget.test.js 5/5 PASS. |
| Unit Tests (regression — receipt subsystem) | ✓ Pass | receipt tests 264/264 PASS — 내가 수정한 schema/write/cli 영역 zero regression. |
| Unit Tests (full suite baseline) | ⚠ Pre-existing 21 fail / 720 pass / 1 skip (742 total) | 21 failure 모두 내가 수정 안 한 파일: codex-bridge fixture 14건 (`MCCP_CODEX_DISABLED=1`로 parseCodexResult 단락), stop-review-loop 1건, receipt-prompt/skill G1 hook 3건 등. user memory `feedback-codex-permanent-bypass`와 정합. |
| Build | N/A | Node monorepo — root package.json 없음. node --test가 build 역할. |
| Schema Forward-compat | ✓ Pass | 27/27 real receipt가 새 schema로 valid. 28번째는 `.migrations/v0.2.8-generic-quarantine.json` (migration marker, 비-receipt) — 사전 존재 false positive. |
| Spec-level grep guards | ✓ Pass | 모두 통과: MCCP_GATE_ROUND_CAP 각 파일 ≥1, YAGNI Triage 각 파일 ≥1, codex-findings-backlog 5 파일, roadmap v0.2.9 ≥2. |
| New flag round-trip | ✓ Pass | `--deferred-findings 3` → receipt JSON `"deferred_findings_count": 3`. |

## Files Changed

| File | Action | Lines (approx) |
|---|---|---|
| `plugins/mccp/commands/plan.md` | UPDATE Phase 5.3 + 5.4 | +18 / -7 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE Phase 2.5.1 + 2.5.4 | +33 / -5 |
| `plugins/mccp/commands/pr.md` | UPDATE Phase 2.5.3 + 2.5.4 | +25 / -6 |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE usage line | +1 / -1 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE meta builder | +7 / 0 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE validate + skeleton | +7 / 0 |
| `docs/gate-design.md` | UPDATE Divergent auto-rerun | +14 / -5 |
| `CLAUDE.md` | UPDATE §1.3 + §4 | +3 / 0 |
| `.claude/plans/codex-findings-backlog.md` | CREATE | +9 |
| `.claude/plans/mccp-roadmap.plan.md` | UPDATE Active + Patterns | +2 / 0 |
| `plugins/mccp/scripts/lib/tests/round-budget.test.js` | CREATE | +98 |
| `.claude/plans/v0-2-9-gate-round-yagni.plan.md` | UPDATE Codex Implementation Review marker | +12 / 0 |

## Deviations from Plan

- **Task 1 (gate-design.md)**: 플랜 본문은 plain text였으나, 기존 단락 스타일(인라인 `` ` `` 코드 펜스 + `MCCP_GATE_ROUND_CAP` 백틱)을 살려 markdown formatting을 적용. semantics 동일.
- **Task 4 (pr.md env export)**: 플랜은 "codex-runner.js 호출 직전 export 1줄"이라고만 했음. 실제 위치 = `CODEX_RESULT_FILE=` 직후, `node codex-runner.js` 호출 직전. inline 코멘트 "v0.2.9 — codex-runner.js inherits env into the codex-invoke child process. No code change in the helper needed." 1줄 추가 (사용자/리뷰어가 의도를 곧장 알도록).
- **Task 8 (round-budget.test.js)**: 플랜은 3 boundary case만 명시. 실제로는 5건 — 3건 core + 2건 보너스 (`parseCap` invalid value clamp + severity ordering smoke). 핵심 정책 covered + forward-compat guard 추가. 5/5 PASS.
- **Phase 2.5 (Implement-Codex 게이트)**: `MCCP_CODEX_DISABLED=1` + `MCCP_RECEIPT_GATE_MODE=off` 영구 환경(`.claude/settings.local.json`)이라 Codex 호출/receipt write 둘 다 의례적 skip. plan 본문에 `## Codex Implementation Review` 섹션만 주입 (skip 사유 명시 — design review/security review 모두 surface 없음을 mechanical 보증). user memory `feedback-codex-permanent-bypass`와 정합.

## Issues Encountered

- **`node --test plugins/mccp/scripts/**/tests/*.test.js`** 명령 — bash `**` globstar 기본 비활성. `shopt -s globstar; files=(...); node --test "${files[@]}"` 패턴으로 73개 파일 명시 expand 후 정상 동작.
- **`receipt status --json`의 `valid` 필드 미포함** — 플랜 검증 스크립트가 `r.valid !== true`로 invalid 카운트 → 28/28 invalid false positive. schema 직접 호출 (`validate(JSON.parse(file))`)로 27/27 OK 정확 확인. status CLI 자체의 bug로 보이나 본 cycle 범위 밖.
- **markdownlint MD032 경고** 매 Edit마다 표면 — user `feedback-no-markdownlint-fix-cycle` 정책에 따라 무시 (format-on-save 처리).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/round-budget.test.js` | 5 | severity-gated escalate 정책 oracle (3 boundary), `MCCP_GATE_ROUND_CAP` parseCap clamp (1 forward-compat guard), severity ordering smoke (1 convention guard) |

## Next Steps

- [ ] `/mccp:code-review` (선택)로 변경 코드 multi-perspective review
- [ ] `/mccp:prp-commit "v0.2.9: gate round budget + YAGNI triage"`로 commit
- [ ] `/mccp:pr`로 PR 생성 (PR 본문에 `## Codex Adversarial Review` skipped marker auto-inject — Codex 영구 비활성 상태)
- [ ] (Codex 재활성화 후) 다음 cycle에서 R1 severity 분포 실측 → MEDIUM Open Question 검증
