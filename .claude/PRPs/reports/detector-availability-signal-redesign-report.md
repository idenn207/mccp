# Implementation Report: detector probeAvailability 재설계 (built-in 기능 신호 기반)

## Summary

세 built-in 기능 detector(`deep-research-detect.js` / `ultracode-detect.js` / `goal-detect.js`)의 `probeAvailability()`가 `~/.claude/commands/*.md`·`~/.claude/skills/*/` filesystem을 probe하던 구조적 오류를 제거하고, 공식 문서로 확정한 실제 활성화 신호로 교체했다. built-in slash command는 user-level command/skill 파일을 남기지 않으므로 기존 probe는 기능 활성 여부를 영원히 관측할 수 없었다.

- **deep-research / ultracode** — 동적 워크플로우 신호 공유 (`disableWorkflows` / `enableWorkflows` / env `CLAUDE_CODE_DISABLE_WORKFLOWS`).
- **goal** — 별개 축인 hooks 신호 (`disableAllHooks` / `allowManagedHooksOnly`). default-on이라 disable 신호 부재 = 활성.
- 신규 공용 헬퍼 `settings-signal.js`가 managed+user+project 3-level 머지(우선순위 project > user > managed)를 수행. managed 경로는 OS별 상수.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium (정확) |
| Files Changed | 9 | 9 |
| Codex rounds | 1 (R1 수렴) | 1 (cross-gate dedupe) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `settings-signal.js` 공용 헬퍼 CREATE | Complete | readMergedSettings + workflowsEnabled/hooksGoalEnabled tristate |
| 2 | deep-research-detect.js probeAvailability 교체 | Complete | workflowsEnabled 위임 |
| 3 | ultracode-detect.js probeAvailability 교체 | Complete | 동일 workflows 신호 공유 |
| 4 | goal-detect.js probeAvailability 교체 | Complete | hooksGoalEnabled 위임 (hooks 축) |
| 5 | 테스트 업데이트 + plugin.json bump | Complete | 4 test 파일 + 1.12.0→1.12.1 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (module load) | Pass | 4 lib 모듈 require 성공, os dangling 참조 0 |
| Unit Tests | Pass | 86 pass / 0 fail / 1 skip (win32 symlink 가드) |
| Build | N/A | dep-free JS, 빌드 단계 없음 |
| Integration | N/A | |
| Edge Cases | Pass | parse 실패 fail-open, managed unreadable→unknown, env override 우선 |

전체 lib 스위트(612 tests): 608 pass / 1 fail / 3 skip. 유일한 fail은 `design-critique-loop-e2e.test.js`의 dogfood fixture(`.claude/cache/test-fixture-status.html`) 부재 — **별개 milestone(design-gate M2)의 환경 의존 테스트로 본 변경과 무관** (plan-conflict 아님).

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/settings-signal.js` | CREATED | 3-level 머지 + 2 tristate 판정 함수 |
| `plugins/mccp/scripts/lib/deep-research-detect.js` | UPDATED | probe→workflowsEnabled, os import 제거 |
| `plugins/mccp/scripts/lib/ultracode-detect.js` | UPDATED | probe→workflowsEnabled, os import 제거 |
| `plugins/mccp/scripts/lib/goal-detect.js` | UPDATED | probe→hooksGoalEnabled, os import 제거 |
| `plugins/mccp/scripts/lib/tests/settings-signal.test.js` | CREATED | 17 test |
| `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` | UPDATED | S1d/S8 probe→settings 신호 |
| `plugins/mccp/scripts/lib/tests/ultracode-detect.test.js` | UPDATED | S1d/S9 probe→settings 신호 |
| `plugins/mccp/scripts/lib/tests/goal-detect.test.js` | UPDATED | S1d probe→hooks 신호 (default-on) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.12.0 → 1.12.1 patch bump |
| `CHANGELOG.md` | UPDATED | [1.12.1] row |

## Deviations from Plan

- **probeAvailability 옵션 시그니처**: plan은 `{projectRoot, userPath}`만 명시했으나, 완전한 테스트 격리를 위해 `{projectRoot, userPath, projectPath, managedPath}` 4개를 모두 forward하도록 확장. plan 의도(주입 가능)와 정합하며 테스트가 실제 `~/.claude`·OS managed 경로를 읽지 않도록 hermetic 격리를 보장.

## Issues Encountered

- 기존 detect 테스트가 feature env override를 설정하지 않은 케이스(S1d 등)는 이제 실제 settings를 읽으므로, 각 테스트 파일에 `isolatedSettings()` 헬퍼를 추가해 temp dir의 nonexistent/주입 settings 경로로 격리. CLAUDE_CODE_DISABLE_WORKFLOWS env도 명시적으로 clear.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `settings-signal.test.js` | 17 | 머지 우선순위 4 + workflows tristate 6 + hooks tristate 6 + OS path 1 |
| `deep-research-detect.test.js` | +3 신규 (S1e/S1f + S8 재작성) | workflows 신호 |
| `ultracode-detect.test.js` | +3 신규 (S1e/S1f/S1g) | workflows 신호 |
| `goal-detect.test.js` | +3 신규 (S1e/S1f/S1g) | hooks 신호 + managed unreadable |

## Next Steps
- [ ] Code review via `/mccp:code-review`
- [ ] Create PR via `/mccp:pr`
