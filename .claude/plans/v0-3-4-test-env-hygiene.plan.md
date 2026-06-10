# Plan: v0.3.4 — Test Env Hygiene Audit + v0.3.3 Housekeeping Bundle

**Source PRD**: `.claude/prds/v0-3-4-test-env-hygiene.prd.md`
**Selected Milestone**: v0.3.4 ship (single milestone, single PR)
**Complexity**: Small

## Summary

`plugins/mccp/scripts/lib/tests/codex-bridge.test.js`의 17개 leak 사이트(line 8–127, "converged/divergent/critical/unavailable fixture" + open-question parsing)에 canonical snapshot/restore shape을 inline 적용해 `MCCP_CODEX_DISABLED=1` shell의 17 cross-test fail을 0으로 회복합니다. 같은 PR에 v0.3.3 housekeeping 4축(plugin.json 0.3.2→0.3.4 직행, CLAUDE.md §1.4 S11/S12 drift sync, roadmap M6 shipped row + M7 entry, STATE.md fingerprint flip)을 묶어 한 cycle로 흡수합니다.

## Phase 2 GROUND — Pattern + Distribution (확정)

### 실측 분포 (PRD §E2 hypothesis revision)

PRD §E2가 hypothetical 분포로 적은 "codex-bridge.test.js + receipt-* tests"는 Phase 2 GROUND grep으로 invalidated. **실측 17 sites 모두 codex-bridge.test.js 단일 파일에 집중** (PRD inversion class repeat — v0.3.3 report §F4와 동일 자가보정 패턴).

| File | Sites | Test fn 이름 (head excerpt) |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/codex-bridge.test.js` | 17/17 | converged ×1, divergent ×2, critical ×4, unavailable ×9, open-question ×1 |
| `plugins/mccp/scripts/lib/tests/settings-writer.test.js` | 0 | (이름 매칭만, env mutation 없음 — false positive) |
| `plugins/mccp/scripts/lib/tests/dep-check.test.js` | 0 (이미 canonical) | line 88-98이 이미 snapshot/restore 패턴 |
| `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` | 0 (PR #14에서 패치) | path 7 line 180-199 이미 패치됨 |

### 17 sites 정확한 line 위치 (codex-bridge.test.js)

| # | Line | Test 이름 |
|---|---|---|
| 1 | 8 | `converged fixture: 1R APPROVE → verdict converged, no escalation` |
| 2 | 21 | `divergent fixture: 3R divergent → verdict divergent + escalate=true` |
| 3 | 36 | `divergent fixture: 2R divergent → does NOT escalate (rounds<3)` |
| 4 | 47 | `critical fixture: secret exposure detected → verdict critical + escalate` |
| 5 | 58 | `critical fixture: external destination detected` |
| 6 | 66 | `critical fixture: authz bypass detected` |
| 7 | 73 | `critical fixture: data loss / drop table` |
| 8 | 80 | `unavailable fixture: setup_required → verdict unavailable` |
| 9 | 86 | `unavailable fixture: not authenticated` |
| 10 | 91 | `unavailable fixture: 60s timeout` |
| 11 | 96 | `unavailable fixture: rate_limit` |
| 12 | 101 | `unavailable fixture: empty text` |
| 13 | 107 | `unavailable fixture: codex-plugin-not-installed` |
| 14 | 112 | `unavailable fixture: codex-companion-not-found` |
| 15 | 117 | `unavailable fixture: cli-not-authenticated (hyphenated)` |
| 16 | 122 | `unavailable fixture: process-exit-nonzero` |
| 17 | 127 | `open question parsing: multiple severities preserved in order` |

### Canonical pattern 해석

`codex-bridge.test.js:151-162` (`disabled fixture: MCCP_CODEX_DISABLED=1 → verdict skipped`)은 `set='1'` mutation을 wrap합니다. 17 sites는 정반대로 **unset** mutation이 필요 (env가 set돼 있으면 parseCodexResult가 short-circuit돼 fixture intent 무효화). **공유되는 것은 shape(snapshot/try/finally restore)이지 mutation은 아님** — Open Question §3 (inline vs beforeEach) 결정과 합치: PRD MVP 명시대로 inline `try/finally`.

### Mutation 패턴 (17 sites 적용)

```javascript
test('<fixture name>', () => {
  const prev = process.env.MCCP_CODEX_DISABLED;
  delete process.env.MCCP_CODEX_DISABLED;
  try {
    // existing test body
  } finally {
    if (prev === undefined) delete process.env.MCCP_CODEX_DISABLED;
    else process.env.MCCP_CODEX_DISABLED = prev;
  }
});
```

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Env snapshot/restore shape | [codex-bridge.test.js:151-162](../../plugins/mccp/scripts/lib/tests/codex-bridge.test.js#L151-L162) | inline `try/finally`, `prev===undefined`는 `delete`로 복원 |
| Same-class precedent (set='1') | [codex-bridge.test.js:166-178](../../plugins/mccp/scripts/lib/tests/codex-bridge.test.js#L166-L178) | 이미 적용된 sibling — 17 sites도 같은 file 안에서 일관성 유지 |
| Same-class precedent (set + dep-check) | [dep-check.test.js:88-98](../../plugins/mccp/scripts/lib/tests/dep-check.test.js#L88-L98) | dependency check도 동일 shape — repo-wide 통용 |
| Same-class precedent (path-7 unset) | [stop-review-loop.test.js:180-206](../../plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js#L180-L206) (PR #14 cdd77fc) | **unset mutation의 직전 precedent** — 17 sites와 동일 shape/mutation |
| Test naming | `<class> fixture: <scenario>` (codex-bridge.test.js 전체) | 기존 그대로 — wrap만 추가 |
| Commit message | `feat(v0.3.2): S12 ...` / `fix(v0.3.3): ...` (recent commits) | `fix(v0.3.4): test env hygiene ...` + `chore(v0.3.4): v0.3.3 housekeeping bundle` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/tests/codex-bridge.test.js` | UPDATE | 17 sites × 4-line wrap = ~68 lines added |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 0.3.2 → 0.3.4 (skip 0.3.3 release) |
| `CLAUDE.md` | UPDATE | §1.4 표 S11/S12 행: `미구현` → ✅ shipped (PR #12/#13) |
| `.claude/plans/mccp-roadmap.plan.md` | UPDATE | M6 행 status: `🚧 in-progress` → ✅ shipped + 본 milestone(v0.3.4)을 새 M7 entry로 추가 + L149-150 체크박스/v0.3.4 entry 갱신 |
| `.claude/state/STATE.md` | UPDATE | `task_fingerprint: v0-3-3-intent-dogfood` → `v0-3-4-test-env-hygiene` |
| `.claude/plans/v0-3-4-test-env-hygiene.plan.md` | CREATE | (본 plan 문서 자체) |
| `.claude/PRPs/reports/v0-3-4-test-env-hygiene-report.md` | CREATE (Task 6) | `/mccp:prp-implement` 산출물 |
| `.claude/receipts/mccp-plan-codex/<slug>.json` | CREATE | Phase 5.6 receipt write |
| `.claude/receipts/mccp-implement-codex/<slug>.json` | CREATE | implement step receipt |

## Tasks

### Task 1 — Test env hygiene patch (17 sites)

- **Action**: `plugins/mccp/scripts/lib/tests/codex-bridge.test.js` line 8-141 범위의 17 `test(...)` 블록 각각에 위 mutation 패턴(snapshot/delete/try/finally restore) inline 적용. 기존 test body는 보존, 4 lines wrap만 추가.
- **Mirror**: `codex-bridge.test.js:151-162` (shape) + `stop-review-loop.test.js:180-206` (unset mutation precedent).
- **Validate**: 
  - env unset: `node --test plugins/mccp/scripts/lib/tests/codex-bridge.test.js` → 17/17 새 wrap pass, 회귀 0
  - env=1: `$env:MCCP_CODEX_DISABLED='1'; node --test plugins/mccp/scripts/lib/tests/codex-bridge.test.js; Remove-Item env:MCCP_CODEX_DISABLED` → 17/17 pass (이전 17 fail이 사라짐)
- **Caveat**: 17 sites mass edit이므로 site-by-site 적용. mid-progress diff 검토로 누락 / wrap 비대칭 방지.

### Task 2 — plugin.json version bump (0.3.2 → 0.3.4)

- **Action**: `plugins/mccp/.claude-plugin/plugin.json`의 `"version"` 필드를 `"0.3.2"` → `"0.3.4"`로 변경. (v0.3.3 release는 skip — dogfood-only milestone이었음, PRD `## Success Metrics` 명시).
- **Mirror**: 직전 bump 패턴 (v0.3.1→0.3.2 commit 472b005).
- **Validate**: `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` → `0.3.4`.

### Task 3 — CLAUDE.md §1.4 drift sync (S11/S12)

- **Action**: `CLAUDE.md` line 92-93의 S11/S12 행 마지막 셀: `S11 미구현` / `S12 미구현` → `S11 ship (v0.3.1)` / `S12 ship (v0.3.2)`. 인접 행(S8/S10a/S10b)이 이미 `ship` 명시 — 동일 포맷.
- **Mirror**: line 90 `S8 ship` / line 91 `S10a ship` / 본 PR 직전 commit이 line 89 `S10b ship (v0.3.0)` 추가한 패턴.
- **Validate**: `grep -nE "미구현" CLAUDE.md` → 0 매치.

### Task 4 — Roadmap M6 ship + M7 entry

- **Action**:
  - `.claude/plans/mccp-roadmap.plan.md` line 46 (M6 행): `🚧 in-progress (2026-06-09)` → `✅ shipped (PR #14, commit cdd77fc, 2026-06-09)`
  - L33 직후 table에 v0.3.4 release row 추가: `| **v0.3.4** | 2026-06-10 | M7 test env hygiene + v0.3.3 housekeeping bundle | [v0-3-4](v0-3-4-test-env-hygiene.plan.md) |`
  - L46 직후 M7 entry 추가: `| **Milestone 7** | v0.3.4 | Test env hygiene audit (17 sites) + v0.3.3 housekeeping bundle (plugin.json 0.3.4, CLAUDE.md §1.4 drift, STATE.md fingerprint) | [v0-3-4](v0-3-4-test-env-hygiene.plan.md) | 🚧 in-progress (2026-06-10) |`
  - L149-150 체크박스 갱신: `- [x] Milestone 6 (v0.3.3): ... shipped via PR #14 (commit cdd77fc, 2026-06-09)` + `- [ ] Milestone 7 (v0.3.4): test env hygiene + housekeeping — [v0-3-4 sub-plan](v0-3-4-test-env-hygiene.plan.md)`
- **Mirror**: M5 행(line 45) 포맷 — `✅ shipped (PR #13, commit 472b005, 2026-06-08)` 그대로.
- **Validate**: `grep -nE "Milestone 6.*shipped" .claude/plans/mccp-roadmap.plan.md` → 1 매치 + `grep -nE "Milestone 7.*v0\.3\.4" .claude/plans/mccp-roadmap.plan.md` → 1 매치.

### Task 5 — STATE.md fingerprint flip

- **Action**: `.claude/state/STATE.md` line 3: `task_fingerprint: v0-3-3-intent-dogfood` → `task_fingerprint: v0-3-4-test-env-hygiene`. 본문(Goal/Plan/Done/In Progress/Next Step) 동시 갱신은 implementation Phase 종료 후 별도 step (Task 6 report write 시) — fingerprint만 본 task에서 처리.
- **Mirror**: v0.3.0 → v0.3.1 → v0.3.2 → v0.3.3 flip 패턴 (각 milestone 시작 시 fingerprint만 먼저 flip).
- **Validate**: `Select-String -Path .claude/state/STATE.md -Pattern '^task_fingerprint: v0-3-4-test-env-hygiene'` → 1 매치.

### Task 6 — Implement-Codex gate + report

- **Action**: `/mccp:prp-implement <본 plan path>` 실행 — Phase 2.5 implement-codex 게이트가 advisory mode(MCCP_CODEX_DISABLED=1, 사용자 영구 합의)로 떨어지고 receipt write. `.claude/PRPs/reports/v0-3-4-test-env-hygiene-report.md` 작성: Tasks 1-5 status + Full-Suite Delta Analysis 재측 + housekeeping 4축 grep 증거 + Issues Encountered (mid-task surface된 finding 있을 시).
- **Mirror**: `.claude/PRPs/reports/stop-review-loop-env-leak-report.md` 구조 (Tasks Completed / Validation Results / Full-Suite Delta Analysis).
- **Validate**: `/mccp:receipt-status` → `mccp-implement-codex/<slug>.json` 존재 + advisory mode 명시.

### Task 7 — Commit + PR

- **Action**: `/mccp:work` Phase 2.F Step 4/5가 자동 chain — `/mccp:prp-commit` (Open Question §4 결정: **single squash commit으로 묶지 않고 2개 commit**으로 audit trail 보존 — `fix(v0.3.4): test env hygiene — 17 leak sites in codex-bridge.test.js` + `chore(v0.3.4): v0.3.3 housekeeping bundle — plugin.json/CLAUDE.md/roadmap/STATE`), `/mccp:pr` (auto `MCCP_PR_SKIP_CODEX_REVIEW="codex permanently disabled per user memory (v0.3.3-feedback-codex-runner-disabled-blind)"` per user memory).
- **Mirror**: v0.3.2 PR #13 — 단일 PR 안에서 feat + chore 분리 commit.
- **Validate**: PR body에 두 axis(F6 17-leak fix + v0.3.3 housekeeping) 분리 명시 + `## Codex Adversarial Review` 섹션 `(skipped — codex permanently disabled per user memory)` 명시.

## Validation

```bash
# Phase A — Test hygiene primary metric (PRD §Success Metrics row 1)
$env:MCCP_CODEX_DISABLED='1'
node --test plugins/mccp/scripts/lib/tests/codex-bridge.test.js
# expect: 19/19 PASS (17 wrapped + 2 disabled fixture)
Remove-Item env:MCCP_CODEX_DISABLED

# Phase B — Regression check (PRD §Success Metrics row 2)
node --test plugins/mccp/scripts/lib/tests/codex-bridge.test.js
# expect: 19/19 PASS (no regression from env unset)

# Phase C — Full suite delta (PRD §Hypothesis success condition)
$env:MCCP_CODEX_DISABLED='1'
node --test plugins/mccp/scripts/**/tests/*.test.js 2>&1 | Select-String -Pattern "# (pass|fail|tests)"
# expect: fail = 4 (pre-existing only) — delta vs env-unset = 0
Remove-Item env:MCCP_CODEX_DISABLED

# Phase D — Housekeeping mechanical grep (PRD §Success Metrics row 4-5)
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
# expect: 0.3.4
grep -cE "미구현" CLAUDE.md
# expect: 0
grep -cE "Milestone 6.*shipped" .claude/plans/mccp-roadmap.plan.md
# expect: 1
Select-String -Path .claude/state/STATE.md -Pattern '^task_fingerprint: v0-3-4-test-env-hygiene'
# expect: 1 match
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 17 sites mass edit이 다른 test 의도를 깨뜨림 | Medium | site-by-site 적용 + Phase A/B 양방향 validate. wrap은 outer scope만 추가, body는 read-only — semantic intent 보존됨. |
| Helper extraction 유혹 (DRY 본능) | Medium | PRD MVP 명시 + 본 plan Patterns to Mirror가 inline 일관성을 강조. 17 sites의 4-line wrap은 한눈에 보이는 패턴이므로 helper 분리가 오히려 indirection 비용. |
| codex-invoke.js의 MCCP_CODEX_DISABLED honor 부재 (HIGH dogfood F1)가 본 milestone 안에서 발화 | Low | F1은 explicit out-of-scope (PRD §Scope). 본 milestone implement Phase는 `MCCP_ALLOW_CODEX_UNAVAILABLE=1` advisory mode + `MCCP_RECEIPT_GATE_MODE=off`로 우회 — 사용자 영구 합의. |
| PRD §E2 "+ receipt-* tests" 가설 invalidation이 plan 신뢰 약화 | Low | v0.3.3 §F7 multi-stage safety 실증 — PRD inversion이 plan GROUND로 자가 회복하는 chain design이 작동 중. plan body에 명시 기록 (위 Phase 2 GROUND 섹션). |
| Plan-Codex / Implement-Codex 게이트가 advisory로 떨어져 cross-validation 약화 | Low | 사용자 영구 합의 + plan body의 self-attested findings + Phase 2 GROUND grep evidence + 실 test 실행 결과 multi-source independence가 보완 (v0.3.3 report §Codex-disabled handling assessment). |
| 2-commit split vs single squash 결정이 `/mccp:prp-commit` 단계에서 번복 | Medium | Open Question §4 결정을 Task 7에서 force — 2-commit. PR body header도 2-axis 분리 강제. |
| roadmap M6/M7 entry 행 위치 / 포맷 drift | Low | Task 4 validate가 grep으로 정확한 row count 검증. M5 행 포맷이 ground-truth — mechanical mirror. |

## Acceptance

- [ ] Task 1-5 mechanical complete (file diff inspection + each task's validate command)
- [ ] Phase A/B/C 4건 validate 모두 expected output 일치
- [ ] PRD §Success Metrics 5 행 모두 target 달성
- [ ] Implement-Codex receipt + plan-codex receipt 양쪽 advisory 모드로 작성 (skipped verdict, schema valid)
- [ ] `.claude/PRPs/reports/v0-3-4-test-env-hygiene-report.md` 작성됨 + Issues Encountered 섹션이 mid-task surface된 모든 finding 흡수
- [ ] Patterns mirrored, not reinvented (canonical pattern shape 일관성 유지, helper 추출 없음)

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

(impeccable Skill은 mccp 번들 외 — CLAUDE.md §1.1 fork-lineage 결정대로 user-level 별도 설치 대상. 본 plan은 test code env hygiene + housekeeping으로 UI/visual surface 없음 — design surface가 본질적으로 부재.)

## Codex Implementation Review

> Codex unavailable, skipped (auto-fallback): exit-nonzero (advisory mode)

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.3.2/scripts/lib/codex-invoke.js adversarial-review` (v0.2.2 fail-closed wrapper)
- 라운드 수: 0 (advisory skip, 사용자 영구 합의 `MCCP_CODEX_DISABLED=1` + `MCCP_ALLOW_CODEX_UNAVAILABLE=1`)
- 합치 결론: Codex 호출이 토큰 cap 소진으로 skip — implement-time decision review feedback 부재. 17 sites는 mechanical text wrap이라 architectural decision이 거의 없음. Multi-source independence(plan body의 self-attested findings + 실 test 실행 mechanical green)가 cross-validation 약화를 보완.
- YAGNI Triage: n/a (no findings emitted)
- Deferred to backlog: 0
- Open Questions: (없음 — Codex skipped, advisory non-approving receipt)
- Codex session 참조: n/a (advisory mode, classification=exit-nonzero)

### Security Reviewer

> Not applicable — implementation touches test env hygiene + plugin.json + docs/state. No auth / crypto / secrets / input validation / SQL/cmd injection / SSRF / path traversal / privilege escalation surface (§2.5.5 catalog).

### Design Review

> impeccable unavailable, skipped (auto-fallback): skill-missing (no UI/visual surface; design_signal=false from git diff)

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): exit-nonzero (advisory mode)

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.3.2/scripts/lib/codex-invoke.js adversarial-review` (v0.2.2 fail-closed wrapper)
- 라운드 수: 0 (advisory skip, 사용자 영구 합의 `MCCP_CODEX_DISABLED=1` + `MCCP_ALLOW_CODEX_UNAVAILABLE=1`)
- 합치 결론: Codex 호출 자체가 토큰 cap 소진으로 skip — review feedback 부재. Multi-source independence(plan body의 self-attested findings + Phase 2 GROUND grep evidence + 실 test 실행)가 cross-validation 약화를 보완.
- YAGNI Triage: n/a (no findings emitted)
- Deferred to backlog: 0
- Open Questions: (없음 — Codex skipped, advisory non-approving receipt)
- Codex session 참조: n/a (advisory mode, classification=exit-nonzero per wrapper output)
