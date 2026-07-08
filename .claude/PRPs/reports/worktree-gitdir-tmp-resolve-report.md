# Implementation Report: worktree gitdir tmp resolve (재발 부채 종결)

## Summary

worktree에서 `.git`은 `gitdir:` 포인터 **파일**이라 리터럴 `.git/mccp/tmp`에 `mkdir -p`하면 `ENOTDIR`로 깨진다(§3.8). `work.md`·`resume.md`·`plan.md`·`prp-implement.md` 4개 command에 잔여 리터럴이 남아 worktree에서 `/mccp:work`·`/mccp:resume`·`/mccp:plan`·`/mccp:prp-implement`가 깨졌다("누적 8+ cycle 반복 결함"). 실행 Bash의 리터럴을 `git rev-parse` 해석 경로로 이전하고, mechanical 재발 방지 테스트(2축)로 종결했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Low-Medium (work.md는 v1.20.7에서 이미 대부분 마이그레이션됨) |
| work.md 리터럴 | 13곳 | **2곳** (Step 0 블록만; Step 3 prep/W/gate는 v1.20.7에서 이미 이전됨) |
| Files Changed | 9 | 9 (+1 미예측: footer 테스트 lockstep) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | work.md gitdir 이전 | [done] Complete | Step 0 블록 line 42·62 (기존 `git rev-parse --git-path mccp/tmp` 패턴 mirror). **Deviation**: plan 예측 13곳 중 나머지는 v1.20.7(#91)에서 이미 마이그레이션됨 |
| 2 | resume.md gitdir 이전 | [done] Complete | Phase 0 line 26 → `MCCP_TMP` (pr.md:404 mirror) |
| 3 | plan.md gitdir 이전 | [done] Complete | Phase 5.2 블록 mkdir + codex-invoke.stderr redirect |
| 4 | prp-implement.md gitdir 정리 | [done] Complete | Phase 2.5.3 블록(GITDIR, line 445 패턴 mirror) + **Phase 7 auto-chain 블록 자체 mkdir**(Fix Invariant/F1) |
| 5 | 버전 bump + footer + CHANGELOG | [done] Complete | plugin.json 1.20.7→1.20.8, html.js/markdown.js footer, CHANGELOG `## [1.20.8]` row + versioning note |
| 6 | 재발 방지 테스트 (CREATE) | [done] Complete | `command-tmp-worktree-safe.test.js` — 3 test(축 A static 2 + 축 B usability 1, 통합 worktree) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static (grep 리터럴) | [done] Pass | 실행 Bash에 `.git/mccp/tmp` **0건** (4개 command) |
| Static (JS syntax) | [done] Pass | `node --check` html.js/markdown.js/신규 테스트 |
| Unit Tests (신규) | [done] Pass | 3 test PASS (축 A + 축 B) |
| Full suite regression | [done] Pass* | `node --test` 2605 tests, **내 변경 유발 신규 실패 0**. 잔여 6 실패는 전부 pre-existing/flaky (baseline 대조로 확증) |
| Version sync | [done] Pass | plugin.json 1.20.8 + 양 footer v1.20.8, stale v1.20.7 잔존 0 |
| Worktree 실증 | [done] Pass | `.git` 파일 확증 + gitdir-resolved mkdir+redirect OK + 리터럴 negative control 실패 확인 + tmp-verify 정리 |

### Design Grounding (v1.18.22)

Design Grounding: N/A — cross-gate dedupe가 2.5.5b/2.5.5c를 건너뛰어 capture 아티팩트 부재. Phase 3.6/3.7 no-op. (Design Critique은 plan 단계에서 CONVERGED — control-plane 변경, rendered surface는 footer 버전 리터럴 1곳뿐.)

### Full-suite 잔여 실패 (전부 pre-existing/flaky, 내 변경 무관 — stash baseline 대조로 확증)

| Test | 분류 | 근거 |
|---|---|---|
| validate-callsite-lint (command validate 호출) | pre-existing | stash baseline에서도 FAIL |
| design-critique fixture file exists in .claude/cache/ | pre-existing | stash baseline에서도 FAIL |
| g1-patch: receipt-prompt/receipt-skill module-load (×3) | pre-existing | stash baseline에서도 FAIL |
| perf-budget: derive < 1000ms | flaky (timing) | 격리 실행 시 PASS, 전체 부하 시 초과. Axis B를 4→1 worktree로 통합해 부하 완화 |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/commands/work.md` | UPDATED | Step 0 블록 2곳 |
| `plugins/mccp/commands/resume.md` | UPDATED | 1곳 |
| `plugins/mccp/commands/plan.md` | UPDATED | 2곳 (자기 게이트 dogfood) |
| `plugins/mccp/commands/prp-implement.md` | UPDATED | 3곳 (Phase 2.5.3 ×2 + Phase 7 self-mkdir) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.20.7 → 1.20.8 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | footer v1.20.8 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer v1.20.8 |
| `CHANGELOG.md` | UPDATED | `## [1.20.8]` row + versioning note |
| `plugins/mccp/scripts/lib/tests/command-tmp-worktree-safe.test.js` | CREATED | 재발 방지 (축 A static + 축 B usability) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | **미예측 deviation** — footer 버전 테스트(v1.20.7→v1.20.8) lockstep 갱신 |

## Deviations from Plan

1. **work.md 잔여 리터럴 2곳 (예측 13곳)** — repo work.md가 v1.20.7(#91)에서 Step 3(prep/W/gate)을 이미 `git rev-parse --git-path mccp/tmp`로 마이그레이션함. plan 라인 번호는 pre-v1.20.7 기준이었음. acceptance goal(리터럴 0건)은 그대로 달성.
2. **i18n-surface.test.js 갱신** — plan Files to Change에 없었으나, footer 버전 change-detector 테스트가 v1.20.7을 assert해 footer bump과 lockstep으로 갱신 필수(§3.7 footer sync 성격).
3. **변수 네이밍 파일별 통일** — plan은 `MCCP_TMP`(pr.md:404) 지정. 파일 내 기존 패턴 우선(CLAUDE.md "surrounding code" 원칙): work.md=`GITDIR=$(git rev-parse --git-path mccp/tmp)`, prp-implement.md=`GITDIR=$(git rev-parse --git-dir)`(line 445 mirror), resume.md/plan.md=`MCCP_TMP`(pr.md mirror). Fix Invariant(in-block 재도출+mkdir)는 전부 준수.
4. **Plan 미아카이브 (의도적)** — generic Phase 5 archive step은 plan을 `completed/`로 이동하나, `/mccp:pr`은 plan을 `.claude/plans/` 하위에서 discovery + hash 재검증(pr.md:347). 아카이브 시 다음 PR 게이트가 깨짐. STATE.md 관행("완료 plan은 .claude/plans/ 유지")과도 일치. 아카이브는 PR 이후 cleanup 단계.

## Issues Encountered

- **plan-codex receipt stale (dedupe 주입 부작용)** — cross-gate dedupe가 plan에 `## Codex Implementation Review` 마커를 주입하자 plan 해시가 바뀌어 upstream plan-codex receipt가 stale로 판정됨(2.5.7 validate 실패). 마커 제거 시 정확히 원 해시가 복원됨을 확인(리뷰된 architectural 내용은 byte-identical) → plan-codex receipt를 현재 plan 해시로 재-anchor(converged verdict + design-critique 필드 보존). 이는 implement gate가 항상 plan에 섹션을 주입하는 구조상 필연(work-context-isolation 등 기존 수렴 decision의 두 receipt 해시 MATCH가 동일 재조정을 시사).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `command-tmp-worktree-safe.test.js` | 3 | 축 A: commands/*.md 실행 Bash 리터럴 부재 + matcher self-check. 축 B: 실제 worktree에서 literal 실패/gitdir-resolved 성공/redirect-without-mkdir 실패(F1) 통합 실증 |

## Next Steps
- [ ] `/mccp:pr` — PR 생성 (Codex/디자인/보안 게이트 통합)
- [ ] PR 머지 후 plan을 `.claude/PRPs/plans/completed/`로 아카이브 (cleanup)
