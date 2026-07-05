# Implementation Report: work Context Isolation — M1 (implement 스텝 격리)

## Summary

`/mccp:work` Step 3의 인라인 `Skill(mccp:prp-implement)` 호출을 **격리된 단일 worker `Agent` 위임**으로 교체했다. worker가 implement의 무거운 작업(파일 탐색·edit·validate 루프·Implement-Codex 게이트·receipt write)을 자기 컨텍스트에서 수행하고, 메인(controller) 세션은 envelope 요약(변경 파일·receipt path·verdict)만 회수한다. 메커니즘은 신규 발명이 아니라 dispatch-controller substrate(v1.2.0-m1)를 single-worker로 재사용했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large (예상대로 — spike + CLI + command-body rewrite + 3 invariant) |
| Codex rounds | 1 (cross-gate dedupe) | 1 (dedupe 적용 — 새 implement-time 결정 0) |
| Files Changed | 6 (plan Files to Change) | 8 changed + 2 created (dispatch-cli + test) + gitignore/CHANGELOG deviation |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | Spike — worker Agent implement 계약 검증 | [done] Complete | 실제 general-purpose Agent probe. self-contained worker prompt 확정. round-trip(prepare→Agent→merge) 실증 |
| 1 | dispatch-cli.js thin CLI wrapper + 테스트 | [done] Complete | prepare-single/merge/mark 3 subcommand. 18 test green |
| 2 | work.md Step 3 격리 위임 | [done] Complete | prepare→Task→merge + kill switch + next-step HALT 보존 + 인라인 fallback |
| 3 | Attribution 배선 + cross-gate dedupe | [done] Complete | 3 attribution 플래그 worker prompt에 bind. F3 round-trip test로 receipt accept 실증 |
| 4 | Baseline/after 측정 절차 + dogfood | [done] Complete (측정 절차) | firewall note §7에 측정 지점 문서화 + spike round-trip으로 merge 요약 격리 실증. 완전한 feature-level baseline/after 수치는 후속 관측(MVP — 육안) |
| 5 | 버전 bump + 토글 문서 + PRD status | [done] Complete | 1.20.1→1.20.2, 양 footer, i18n test, CLAUDE.md §1.4+§4, PRD M1 complete |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | plain-Node plugin — typecheck/lint/build 없음 |
| Unit Tests (dispatch-cli) | [done] Pass | 18/18 |
| Regression (dispatch-controller + envelope) | [done] Pass | 64/64 (substrate 무변경 보증) |
| Regression (renderer i18n footer) | [done] Pass | 10/10 (footer v1.20.2 동기) |
| Full lib suite | [done] Pass (704/705) | 1 fail = pre-existing, 무관 (아래 참조) |
| Build | N/A | 빌드 스텝 없음 |

### Codex 3-finding 흡수 검증

| Finding | 흡수 | 검증 |
|---|---|---|
| F1 worker auto-commit/PR (되돌릴 수 없는 external state) | worker prompt commit/PR 금지 guardrail + merge `mccp-pr-codex` receipt 감지 HALT | `merge F1: worker leaked a PR-gate receipt → verdict invariant-violation` test |
| F2 동기 worker heartbeat stale-reclaim race | `skipHeartbeat:true` — heartbeat 미생성(reclaim 대상 제외) | `F2: prepare-single writes NO heartbeat → reclaimStale never marks it crashed` test |
| F3 절대 ipc path → receipt fail-closed | repo-relative `ipcEnvelopePath` 별도 emit | `F3: receipt write accepts repo-relative ipc path, rejects absolute (round-trip)` test (git 샌드박스 + MCCP_DISPATCH_CONTEXT=1) |

### Design Grounding

Design Grounding: N/A (control-plane change, no rendered surface). cross-gate dedupe로 2.5.5b/2.5.5c 미실행 → capture 아티팩트 없음 → Phase 3.6/3.7 no-op. 이 플랜은 `.js`/`.md`/`json` control-plane만 변경(UI/rendered surface 0).

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/dispatch-cli.js` | CREATED | +324 (prepare-single/merge/mark) |
| `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` | CREATED | +18 tests |
| `plugins/mccp/commands/work.md` | UPDATED | Step 3 격리 위임 + frontmatter Task + Forbidden |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.20.1 → 1.20.2 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | footer v1.20.2 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer v1.20.2 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer 버전 assertion 동기 |
| `.gitignore` | UPDATED | `.claude/state/dispatches/` 제외 (deviation) |
| `CLAUDE.md` | UPDATED | §1.4 게이트 표 1행 + §4 토글 |
| `CHANGELOG.md` | UPDATED | 1.20.2 항목 (deviation — §3.7 체크리스트) |
| `.claude/prds/work-context-isolation.prd.md` | UPDATED | M1 complete |
| `.claude/notes/work-context-firewall.md` | UPDATED | §7 Task 0 spike 결과 + Task 4 측정 절차 |

## Deviations from Plan

1. **Task 순서**: Task 1(CLI)을 Task 0(spike) 전에 완성 — spike가 CLI의 prepare-single로 깔끔한 envelope round-trip을 실증하려면 substrate가 먼저 필요. 위임 shape 결정엔 영향 없음.
2. **`dispatch-cli.js`에 `mark` subcommand 추가** (plan Task 1은 prepare-single+merge 2개만 명시). self-contained worker(Task 0 결정)가 envelope를 전이하려면 quote-safe 결정론적 helper가 필요 — Haiku subagent가 `node -e` JSON blob보다 안전하게 구동. dispatch-envelope.markStatus의 thin passthrough라 새 아키텍처/외부 dep 없음.
3. **`.gitignore` + `CHANGELOG.md` 추가** (plan Files to Change 외). dispatches envelope는 working-tree-only IPC 상태라 커밋 방지 필요(correctness). CHANGELOG는 §3.7 milestone 체크리스트 의무.
4. **plan archive-move 생략**: prp-implement Phase 5 기본은 `.claude/PRPs/plans/completed/`로 이동하나, STATE.md Last Decision의 repo 관행(완료 plan은 `.claude/plans/` 유지, 완료 마커는 PRD status)을 따라 이동하지 않음 — PRD의 Plan 셀 경로 참조 무결성 + 관행 일관.
5. **worker prompt `MCCP_AUTO_CHAIN_DISABLE=1` 문구**: Task 도구는 env 주입 파라미터가 없고 shell 상태가 Bash 호출 간 비지속 → env 배열 대신 prompt guardrail(HARD RULE) + merge invariant를 enforcement로(plan Task 2가 명시한 방식과 일치).

## Issues Encountered

- **plan-codex receipt stale**: cross-gate dedupe가 요구하는 `## Codex Implementation Review` 섹션을 plan에 append하면서 구조적 plan hash가 바뀌어 prior plan-codex receipt가 stale이 됨(`canonicalizeMarkdownStructural`은 Codex 섹션을 strip하지 않음). §3.1 recovery로 plan-codex receipt를 현재 hash로 재-stamp(approving + silent-skip 의미 보존) → validate `ok`. review 실체는 plan 본문에 그대로 존재.
- **1 pre-existing test fail** (`design-critique-loop-e2e.test.js` — `F) fixture file exists in .claude/cache/`): `.claude/cache/`가 gitignore되어 dogfood fixture `test-fixture-status.html`가 clean checkout에 부재 → 항상 실패하는 환경 의존 테스트. 본 M1 변경(dispatch/work/version/gitignore/문서)과 무관. 수정은 M1 scope 밖.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `dispatch-cli.test.js` | 18 | parseFlags, ipcEnvelopeRelPath(F3 regex), worker prompt(attribution+guardrail), prepare-single dry-run/live, F2 no-heartbeat reclaim, mark, merge(ok/failed/F1 invariant/unreadable), F3 receipt round-trip |

## Next Steps

- [ ] `/mccp:prp-commit` — dispatch-cli + work.md + version/docs 커밋 (dashboard PRD 수정은 제외)
- [ ] `/mccp:pr` — PR 생성 (cross-gate dedupe로 PR-Codex 빠르게 통과 예상)
- [ ] (후속) 완전한 feature-level baseline/after 컨텍스트 수치 관측 (Task 4 MVP — 실제 work 1회 격리 on/off 비교)
- [ ] (후속 PRD) M2 체크포인트 resume, M3 plan 격리 + classify 초과 예측
