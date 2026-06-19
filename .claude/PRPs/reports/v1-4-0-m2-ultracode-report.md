# Implementation Report: v1.4.0 axis B (M2 ultracode)

## Summary

Anthropic native `/effort ultracode` mode delegation integration into `/mccp:prp-implement` Phase 3.5. mccp가 plan task body의 `- **Effort**: ultracode` marker를 감지하면, 해당 task를 직접 실행하지 않고 (1) isolation lock 진입 → (2) 사용자에게 `/effort ultracode` 모드 안내 → (3) `ultracode-done:` / `failed:` / `skipped:` grammar 응답 대기 → (4) 결과를 sidecar journal + plan body provenance section에 stamp → (5) 다음 task로 진행. mechanical isolation은 PreToolUse hook(`ultracode-phase-guard.js`)이 lock 활성 중 mccp의 write tool + receipt write + STATE.md write + `mccp:*` skill 호출을 default-deny로 차단. cooperative guidance는 안내 텍스트에서 명시. M1 axis A의 3-layer template를 mirror하되 axis B 고유 4th layer(isolation lock)를 추가.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium → Large (mechanical isolation lock 신설 + native spec uncertainty) | Large — 6 new files (~1900 LOC) + 4 modified files. 토큰 호기심: 컸음. spec 재확인 결과 hook 작동 가설은 docs에서 명확히 검증 못함 → Scenario A default + B fallback 양축 모두 구현. |
| Confidence | medium-high (plan body의 R1 absorption Annex가 binding) | high — 모든 task 완료, 97/97 test 통과, receipt chain clean. F1 Scenario A vs B 양축 모두 코드 + test로 cover. |
| Files Changed | 7 modified + 6 created | 7 modified + 6 created (정확히 일치) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | WebFetch native spec 재확인 + plan body marker stamp | [done] Complete | spec 마커: `hook_active_in_ultracode=true, caller_session_id_exposed=unknown, marker_collision=none`. Scenario A default + B fallback (per A1 amendment) 그대로 적용. |
| 2 | ultracode-detect.js probe library | [done] Complete | KNOWN_TIERS whitelist + 정확 정규식 marker + path-traversal guard + tristate availability. 273 LOC. |
| 3 | ultracode-detect.test.js (시나리오 22개) | [done] Complete | 22/22 통과. F5 unknown-tier warn 시나리오 포함. |
| 4 | ultracode-phase-lock.js (pr-phase-lock mirror + sidecar token) | [done] Complete | F3 absorption: `<gitdir>/mccp/tmp/` sidecar — worktree에서 `.git`이 file이라 `gitDir`로 path 결정. 568 LOC. |
| 5 | ultracode-phase-lock.test.js (시나리오 17개) | [done] Complete | 17/17 통과. concurrent enter race fix (살아있는 PID 사용 필요). |
| 6 | ultracode-phase-guard.js PreToolUse hook (F2 fail-CLOSED) | [done] Complete | F2 + F1 Scenario A/B 모두 구현. 388 LOC. |
| 7 | ultracode-phase-guard.test.js (시나리오 34개) | [done] Complete | 34/34 통과. unit + E2E spawnSync 두 축. |
| 8 | hooks.json PreToolUse 등록 | [done] Complete | `mccp:ultracode-phase-guard:pre` — matcher `Edit\|Write\|MultiEdit\|NotebookEdit\|Bash\|Skill`. pr-phase-guard와 병렬. |
| 9 | prp-implement.md Phase 3.5 ULTRACODE_DELEGATE 명세 | [done] Complete | 10 sub-step (DETECT → IDEMPOTENCY CHECK → LOCK ENTER → GUIDE → WAIT → IMMEDIATE STAMP → LOCK EXIT → SKIP IMPL → PROVENANCE STAMP → forwarded effects). +218 LOC. |
| 10 | integration-template.md §3/§5/§8/§9/§10 갱신 | [done] Complete | Status mark M1-experimental → M1+M2-validated. §3 4th layer 추가, §5 axis B 셀 채움, §6 anti-pattern 2건 추가, §8 M2 reference shipped + §9 M3 placeholder 분리, §10 audit checklist isolation lock 항목 추가. |
| 11 | PRD M1/M2 row 갱신 | [done] Complete | M1 row in-progress → complete (housekeeping fix). M2 row pending → in-progress + 본 plan 경로. |
| 12 | CHANGELOG.md axis B 항목 | [done] Complete | 신규 `[Unreleased] — axis B (M2 ultracode)` section 최상단 추가. R1 absorption note 5건 포함. |
| A4-extra | .gitignore에 `*.delegations.jsonl` 추가 | [done] Complete | sidecar journal은 working-tree only audit. |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (JSON validate) | [done] Pass | hooks.json 유효 + plugin.json 유효 |
| Unit Tests | [done] Pass | ultracode-detect 22/22 + ultracode-phase-lock 17/17 + ultracode-phase-guard 34/34 = 73/73. M1 deep-research-detect 24/24 regression. Total 97/97. |
| Build | N/A | mccp는 빌드 단계 없음 (Node 직접 실행) |
| Integration | N/A (manual dogfood) | 사용자 turn 안내 패턴은 manual dogfood이 별도 cycle. lock CLI smoke test로 end-to-end 검증. |
| Edge Cases | [done] Pass | F2 fail-CLOSED 4가지 시나리오 (parse-error, zero-byte, missing-field, lock 부재) + F1 caller-identity 4가지 (match, mismatch, event 없음, lock 없음) + F3 sidecar token round-trip + worktree gitDir 분기 + F4 idempotency key |
| Receipt Validate | [done] Pass | mccp:prp-implement validate-cmd ok (plan-codex + implement-codex receipt 동기화) |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/lib/ultracode-detect.js` | CREATED | +273 |
| `plugins/mccp/scripts/lib/tests/ultracode-detect.test.js` | CREATED | +296 |
| `plugins/mccp/scripts/lib/ultracode-phase-lock.js` | CREATED | +568 |
| `plugins/mccp/scripts/lib/tests/ultracode-phase-lock.test.js` | CREATED | +337 |
| `plugins/mccp/scripts/hooks/ultracode-phase-guard.js` | CREATED | +388 |
| `plugins/mccp/scripts/hooks/tests/ultracode-phase-guard.test.js` | CREATED | +434 |
| `plugins/mccp/commands/prp-implement.md` | UPDATED | +218 (Phase 3.5 sub-phase) |
| `plugins/mccp/hooks/hooks.json` | UPDATED | +11 (PreToolUse hook entry) |
| `docs/automation-modernization/integration-template.md` | UPDATED | +69 (status mark + §3/§5/§6/§8/§9/§10) |
| `.claude/prds/v1-4-0-automation-modernization.prd.md` | UPDATED | +2 / -2 (M1 + M2 row) |
| `CHANGELOG.md` | UPDATED | +37 (axis B section at top) |
| `.gitignore` | UPDATED | +6 (`*.delegations.jsonl`) |
| `.claude/plans/v1-4-0-m2-ultracode.plan.md` | UPDATED | +9 (Codex Implementation Review + spec confirmation marker) |

Total: 6 created (~2300 LOC) + 7 modified (~360 LOC).

## Deviations from Plan

- **Sidecar path was `<root>/.git/mccp/tmp/` in plan body, actually `<gitdir>/mccp/tmp/`**. worktree 환경에서 `.git`이 디렉토리가 아니라 file이라 `mkdirSync('.git/mccp/tmp')`가 `ENOTDIR`로 실패. `git rev-parse --absolute-git-dir`로 해결 — worktree에서는 `<main>/.git/worktrees/<name>/` 반환, regular repo에서는 `<root>/.git/` 반환. 양쪽 호환. .gitignore의 `*.delegations.jsonl` 패턴은 영향 없음 (sidecar journal은 plan 옆에 있음, not gitdir). 이 deviation은 plan의 risk 표에 명시되지 않았으나 worktree convention(CLAUDE.md §3.8)이 binding이므로 mechanical 결정.
- **CHANGELOG version is `[Unreleased]` not specific**. plan의 risk 표 + CLAUDE.md §3.7는 plugin.json version 결정을 PR ship 시점으로 위임. CHANGELOG에 axis B 새 section을 placeholder `[Unreleased] — axis B (M2 ultracode)`로 작성. PR ship process가 version 결정 후 rename.
- **plan body가 implement gate inject + spec marker stamp 두 번 변경 → plan-codex receipt 두 번 re-stamp**. validate-cmd가 plan_hash drift를 차단 (정상 동작). plan-codex YAGNI triage table은 plan body에 보존됨; hash anchor만 advance.

## Issues Encountered

- **plan file size**: 465 lines, single Read tool call이 token limit 초과. offset/limit chunking으로 4번 나눠 읽음. 신호 자체는 정상.
- **worktree `.git` is file**: 위 Deviations 참조. 한 번의 smoke fail 후 fix.
- **node:test S2 false flake**: 첫 `concurrent enter` test가 첫 node 프로세스 exit 후 두 번째 spawnSync에서 reclaim 가능 → exit 0. 살아있는 PID(`process.pid`)를 first lock body에 기록하도록 fixture 수정 → exit 11 정상.
- **Receipt chain stale after plan inject**: Phase 2.5에서 Codex Implementation Review section append → plan_hash 변경 → plan-codex receipt stale. 명시적 re-stamp로 해결. 같은 사례가 spec marker stamp 후 한 번 더 발생.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `ultracode-detect.test.js` | 22 tests | env tristate, marker present/absent/multiple, regex boundary, orphan marker, path traversal, mode-mismatch, env vs FS, plan-missing, F5 unknown-tier warn |
| `ultracode-phase-lock.test.js` | 17 tests | enter→exit round-trip, concurrent enter exit 11, wrong sidecar token, heartbeat, detect-stale 3-state policy, 0-byte/parse-error/missing-field, task_index, enter no run-id |
| `ultracode-phase-guard.test.js` | 34 tests | Bash allow/deny unit, Skill mccp:* deny, F1 Scenario A/B unit, E2E spawnSync (no-lock + Edit allow, lock+Edit deny, lock+Read allow, lock+Bash git diff allow, lock+Bash git commit deny, lock+lock-exit allow, lock+Skill mccp:plan deny, lock+Skill impeccable allow, F2 fail-CLOSED parse/zero/missing, F1 Scenario A mismatch allow, PostToolUse no-op) |

## Next Steps

- [ ] `/mccp:code-review` 변경 review (선택)
- [ ] `/mccp:pr` 또는 `/mccp:prp-pr` 호출로 PR 작성. PR ship 시 plugin.json version 결정(1.5.0 → 1.5.1 patch or 1.6.0 minor).
- [ ] post-ship manual dogfood: marker가 있는 task를 실제로 작성 후 `/mccp:prp-implement` 진입해서 Phase 3.5 흐름 확인 (DETECT → LOCK ENTER → GUIDE → WAIT → LOCK EXIT → STAMP → 다음 task).
- [ ] `/effort ultracode` 모드 안에서 hook 작동 여부 runtime probe (Scenario A vs B 확인). docs는 ambiguous였음.
- [ ] M3 (`/goal` → `mccp:milestone-close`) 진입 시 integration-template §10 audit checklist 사용해 axis-specific 평가.
