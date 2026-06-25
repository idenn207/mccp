# Implementation Report: Dashboard Multi-Session M1 — Worktree 진행 스캐너

## Summary

`git worktree list --porcelain`로 같은 로컬 머신의 활성 worktree를 열거하고, 각 worktree의 working-tree `.claude/`(STATE.md + receipts)를 직접 read해 worktree별 진행 모델(branch·현재 게이트·차단·마지막 활동·self)을 derive하는 신규 derive count-source `worktrees`를 추가했다. read-only · LLM-free · dep-free · loud fail-open · gitignore-agnostic. derive()의 spawn-free 계약을 보존하기 위해 git 호출은 opt-in gate(host-version `allowGit` 선례 mirror) 뒤에 두고, render caller(`cli.js render` + `renderer/trigger.js`)만 opt-in으로 켠다. M1은 데이터 레이어만 — M2(UI 섹션)가 본 source를 소비.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium |
| Files Changed | 11 (plan) | 12 modified + 2 created (plan/prd untracked, receipts gitignored) |
| New deps | 0 | 0 (fs/path/child_process + 내부 모듈만) |
| MODEL_VERSION | 'v1' 유지 | 'v1' 유지 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | porcelain 파서 (`parseWorktreePorcelain`) | [done] Complete | multi-block fixture(main+2wt+detached+bare) 테스트 green |
| 2 | per-worktree 진행 derive (diagnostic STATE read, Codex F3) | [done] Complete | `existsSync`+`parseStateMd`로 missing↔unparseable 구분 |
| 3 | self/main 식별 + 정규화 (`isSelfWorktree`) | [done] Complete | win32 8.3 short-name 확장 위해 `fs.realpathSync.native` 채택(편차 참조) |
| 4 | 스캐너 facade + spawn gate (`scanWorktrees`) | [done] Complete | off=no-op spawn-free, on=spawn+cap+per-worktree fail-open |
| 4b | render 경로 opt-in (Codex F1) | [done] Complete | `cli.js cmdRender` + `trigger.js`. dashboard-server.js는 derive 미호출(편차) |
| 5 | derive 등록 + model/mask 배선 (`scrubAbsPaths`, Codex F2) | [done] Complete | index/model/mask 3파일 + scrubAbsPaths export |
| 6 | 테스트 + 회귀 가드 | [done] Complete | worktrees-source 19 + schema-drift guard, perf-budget/no-new-deps 무수정 green |
| 7 | 문서 + 버전 | [done] Complete | schema-surface §13 + plugin.json 1.18.12 + 양 footer + CHANGELOG |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | repo에 lint/type-check 스크립트 없음(JS, node --test) |
| Unit Tests | [done] Pass | worktrees-source 19/19 신규 |
| Build | N/A | 빌드 단계 없음 |
| Regression | [done] Pass | derive 107/107 + renderer 503/503, 0 회귀 |
| Guards | [done] Pass | perf-budget(spawn 0) + no-new-deps 무수정 green; schema-drift worktrees guard 추가 |
| Dogfood | [done] Pass | gate off→scanned:false / gate on→3 worktree(main, dashboard-multi-session*, dashboard-risk-mitigation) |

## Files Changed

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/derive/sources/worktrees.js` | CREATED | 스캐너 본체(파서+progress+self+gate) |
| `plugins/mccp/scripts/derive/tests/worktrees-source.test.js` | CREATED | 19 test (a~j 케이스) |
| `plugins/mccp/scripts/derive/index.js` | UPDATED | SOURCE_SCANNERS 등록 |
| `plugins/mccp/scripts/derive/model.js` | UPDATED | emptyModel/validateShape count-source |
| `plugins/mccp/scripts/derive/mask.js` | UPDATED | scrubAbsPaths + applyPathMask worktrees 배선 |
| `plugins/mccp/scripts/derive/cli.js` | UPDATED | cmdRender worktreeScan:true (F1) |
| `plugins/mccp/scripts/lib/renderer/trigger.js` | UPDATED | refresh 경로 worktreeScan:true (F1) |
| `plugins/mccp/scripts/derive/tests/schema-drift.test.js` | UPDATED | worktrees drift guard |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | footer v1.18.12 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | footer v1.18.12 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer assertion v1.18.12 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.18.11 → 1.18.12 |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATED | §13 worktrees source |
| `CHANGELOG.md` | UPDATED | [1.18.12] 엔트리 |
| `.claude/prds/dashboard-multi-session.prd.md` | UPDATED | M1 row → complete |

## Deviations from Plan

1. **`dashboard-server.js` 미수정** (plan Files-to-Change에 over-listed). 실측 결과 dashboard-server.js는 derive를 호출하지 않고 pre-rendered `status.html`을 serve + cache 디렉토리를 watch만 한다. 모든 dashboard 명령(`dashboard`/`dashboard-refresh`/`dashboard-audit`)은 `node cli.js render`로 렌더하므로, render-time derive 호출부는 `cli.js cmdRender`(모든 dashboard 명령 커버) + `trigger.js`(auto-refresh hook 경로) 2곳뿐. Codex F1의 "render 경로 opt-in" 의도는 이 2곳 수정으로 완전히 달성.
2. **`fs.realpathSync.native` 채택** (plan Task 3은 `fs.realpathSync` 명시). 구현 중 발견: Windows에서 `fs.realpathSync`(JS impl)는 8.3 short name(`SKYPAR~1`)을 long form(`skypark207`)으로 확장하지 못하는 반면 `git worktree list`는 long form을 보고 → self-match 실패. `fs.realpathSync.native`(libuv `GetFinalPathNameByHandle`)가 short name 확장 + 케이싱 정규화를 해결. fallback ladder(`.native` → `.realpathSync` → resolve 값) 유지.
3. **Archive Plan 단계 생략** (편차). plan을 `completed/`로 옮기면 receipt chain이 참조하는 `.claude/plans/dashboard-multi-session.plan.md` 경로가 깨져 후속 `/mccp:pr` validate + dashboard derive/completion-ledger가 plan을 못 읽는다. M2도 동일 plan/PRD를 참조하므로 in-place 유지가 mccp 정합.

## Codex Findings Absorbed (plan 단계 R1 수렴, implement cross-gate dedupe)

- **F1 (HIGH)** default-off 스캐너 render 미배선 → 영구 invisible. `cmdRender`/`trigger.js` worktreeScan:true opt-in + bare derive off 유지로 흡수. test (j) 가드.
- **F2 (HIGH)** 실패 error가 sibling outside-root 절대경로 leak. `mask.scrubAbsPaths`(scan-time emit + applyPathMask 재적용)로 흡수. test (h) 가드.
- **F3 (MEDIUM)** `readState` emptyState-swallow로 corrupt STATE가 absent 위장. diagnostic `existsSync`+`parseStateMd` read로 흡수. test (i) 가드.

## Next Steps

- [ ] `/mccp:prp-commit` — 변경 커밋 (자연어 타겟팅)
- [ ] `/mccp:pr` — PR 생성 (PR-Codex 게이트). M1은 렌더 surface가 없어 시각 확인 불요.
- [ ] M2 (멀티세션 대시보드 섹션) — 본 source를 소비하는 UI 레이어.
