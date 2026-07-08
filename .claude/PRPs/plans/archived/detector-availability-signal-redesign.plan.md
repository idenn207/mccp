# Plan: detector probeAvailability 재설계 (built-in 기능 신호 기반)

**Source**: free-form (`/mccp:plan`)
**Complexity**: Medium

## Summary

세 detector(`deep-research-detect.js`, `ultracode-detect.js`, `goal-detect.js`)의 `probeAvailability()`가 `~/.claude/commands/*.md`·`~/.claude/skills/*/` filesystem을 probe하는 구조적 오류를 제거하고, 공식 문서로 확정한 실제 활성화 신호로 교체한다. deep-research/ultracode는 동적 워크플로우 신호를 공유하고, goal은 hooks 신호라는 별개 축이다.

## Background (공식 문서 검증)

- **deep-research / ultracode** — 동적 워크플로우 기능에 종속. 비활성 신호: settings `disableWorkflows: true` / env `CLAUDE_CODE_DISABLE_WORKFLOWS=1`. Pro opt-in 시 `enableWorkflows: true`. (docs/ko/workflows: "워크플로우가 비활성화되면 ultracode 키워드는 더 이상 실행을 트리거하지 않으며 /effort 메뉴에서 제거됨")
- **goal** — 워크플로우와 무관. prompt-based Stop hook wrapper. 비활성 신호: `disableAllHooks`(any settings level) / managed `allowManagedHooksOnly`. (docs/en/goal)

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Settings 읽기 | `settings-writer.js:21` `readSettings()` | fail-loud(`EBADSETTINGS`) + 부재 시 `{}` 반환. 단일 경로 → 머지 헬퍼로 확장 |
| Detector 구조 | `deep-research-detect.js:42` `probeAvailability(options)` | env override 최우선 tristate → 옵션 주입 가능 path probe |
| 테스트 | `tests/deep-research-detect.test.js:22` `withEnv`/`withTempDir` | `node:test`, 옵션 경로 주입, env 격리 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/settings-signal.js` | CREATE | managed+user+project `.claude/settings.json` 머지 + 신호 판정 공용 헬퍼 (3 detector 공유) |
| `plugins/mccp/scripts/lib/deep-research-detect.js` | UPDATE | `probeAvailability`를 워크플로우 신호 기반으로 교체 |
| `plugins/mccp/scripts/lib/ultracode-detect.js` | UPDATE | 동일 워크플로우 신호 (deep-research와 공유) |
| `plugins/mccp/scripts/lib/goal-detect.js` | UPDATE | hooks 신호(`disableAllHooks`/`allowManagedHooksOnly`)로 판정 |
| `plugins/mccp/scripts/lib/tests/settings-signal.test.js` | CREATE | 머지 우선순위 + 신호 케이스 + parse 실패 fail-open |
| `plugins/mccp/scripts/lib/tests/deep-research-detect.test.js` | UPDATE | filesystem probe 케이스 → settings 신호 케이스 |
| `plugins/mccp/scripts/lib/tests/ultracode-detect.test.js` | UPDATE | 동일 |
| `plugins/mccp/scripts/lib/tests/goal-detect.test.js` | UPDATE | hooks 신호 케이스 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | patch bump (CLAUDE.md §3.7) |

## Tasks

### Task 1: `settings-signal.js` 공용 헬퍼
- **Action**: `readMergedSettings({projectRoot, userPath, managedPath})` — `settings-writer.readSettings`를 **managed + user + project** 세 레벨에서 호출해 머지(우선순위: project > user > managed). managed 경로는 OS별 상수(`MANAGED_SETTINGS_PATHS`): Windows `C:\ProgramData\ClaudeCode\managed-settings.json`, macOS `/Library/Application Support/ClaudeCode/managed-settings.json`, Linux `/etc/claude-code/managed-settings.json`. 그 위에 두 판정 함수:
  - `workflowsEnabled(opts)` → `'available'|'missing'|'unknown'`: `CLAUDE_CODE_DISABLE_WORKFLOWS==='1'`/`disableWorkflows===true`→missing; `enableWorkflows===true`→available; else unknown.
  - `hooksGoalEnabled(opts)` → `'available'|'missing'|'unknown'` (**F1+F3 absorption — tristate, managed 포함**): 어느 레벨에서든 `disableAllHooks===true` 또는 `allowManagedHooksOnly===true`→missing. managed 경로 파일이 **존재하는데 읽기/parse 실패** → `unknown`(정책 미확인 시 phantom guidance 방지, loud stderr). disable 신호 없고 (managed 미존재 = 정책 제약 없음 OR managed 정상 확인) → available.
- **Mirror**: `settings-writer.js:21` readSettings (fail-loud parse, 부재 시 `{}`)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/settings-signal.test.js`

### Task 2: deep-research-detect.js `probeAvailability` 교체
- **Action**: env override(`MCCP_DEEP_RESEARCH_SKILL`) tristate 유지(최우선). filesystem probe 제거 → `settings-signal.workflowsEnabled()` 위임. 옵션 시그니처를 `{projectRoot, userPath}` 주입 가능하게 변경. parse 실패 시 loud stderr + `unknown`(fail-open).
- **Mirror**: 기존 env tristate 블록
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/deep-research-detect.test.js`

### Task 3: ultracode-detect.js `probeAvailability` 교체
- **Action**: env override(`MCCP_ULTRACODE_FEATURE`) 유지. `workflowsEnabled()` 위임 (deep-research와 동일 신호). filesystem probe 제거.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/ultracode-detect.test.js`

### Task 4: goal-detect.js `probeAvailability` 교체
- **Action**: env override(`MCCP_GOAL_FEATURE`) 유지. filesystem probe 제거 → `hooksGoalEnabled()` 위임(tristate). 워크플로우 신호를 보지 않음. goal은 default-on이라 positive opt-in 키가 없으므로 "모든 레벨(managed 포함)의 hook-disable 신호 부재"가 활성 신호. managed 정책 미확인 시 `unknown`.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/goal-detect.test.js`

### Task 5: 테스트 업데이트 + plugin.json bump
- **Action**: 각 detect 테스트의 filesystem probe 케이스(S1d 등)를 settings 신호 케이스로 교체. plugin.json patch bump.
- **Validate**: 4개 테스트 파일 전체 PASS

## 설계 결정 (런타임 정보 처리)

detector는 settings 신호(managed 포함)를 판정한다. 버전(v2.1.154+/v2.1.139+)·WebSearch 가용·xhigh 모델·workspace trust 같은 **로컬에서 신뢰성 있게 못 보는** 런타임 정보는 available 판정에서 무시한다. 근거: detector는 안내(guide prompt) emit 여부만 결정하고 실제 명령 실행은 사용자가 하므로, 이 잔여 런타임 게이트는 Claude Code 자체가 실행 시점에 막아준다 (F2 MEDIUM 부분 수용 — 로컬 CLI 버전 체크는 backlog로 분리).

**deep-research/ultracode vs goal 비대칭 근거 (F3 absorption)**: 두 기능의 실제 활성화 모델이 다르다. 워크플로우는 `enableWorkflows: true`라는 **positive opt-in 키**가 존재(Pro에서 /config가 기록)하므로 그 신호 없으면 보수적 `unknown`(phantom guidance 방지). goal은 그런 opt-in 키가 없고 **default-on이며 disable 신호로만 off**되는 모델(docs/en/goal)이라, "모든 레벨의 hook-disable 신호 부재"가 곧 활성 신호다. 따라서 비대칭은 임의가 아니라 각 기능의 공식 활성화 메커니즘을 반영한다. 단 정책 fail-open을 막기 위해 **managed settings를 실제로 읽고**(F1 absorption), managed 정책이 존재하나 확인 불가일 때는 `unknown`으로 강등한다.

## Validation

```bash
node --test plugins/mccp/scripts/lib/tests/settings-signal.test.js
node --test plugins/mccp/scripts/lib/tests/deep-research-detect.test.js
node --test plugins/mccp/scripts/lib/tests/ultracode-detect.test.js
node --test plugins/mccp/scripts/lib/tests/goal-detect.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| managed settings 미확인 시 goal 정책 fail-open (Codex F1 HIGH) | High | **M1에서 managed 경로(OS별) 읽기 포함**. disable 신호 발견 → missing; managed 존재+읽기 실패 → unknown(강등) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| goal `available` 낙관 판정이 trust 안 된 workspace에서 false-positive (Codex F2/F3) | Medium | managed까지 본 후 판정. 잔여 trust/버전은 안내만 emit + 실행 시 Claude Code가 차단. 로컬 CLI 버전 체크는 backlog |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `enableWorkflows`가 비공식 키라 미래 변경 위험 | Low | negation(`disableWorkflows`) 우선 + enable은 보조 신호 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| 기존 env override 의존 코드/테스트 깨짐 | Low | env tristate 최우선 유지 (시그니처 호환) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance

- [ ] filesystem probe(commands/skills) 완전 제거
- [ ] deep-research/ultracode는 `workflowsEnabled`, goal은 `hooksGoalEnabled` 위임
- [ ] env override 최우선 유지
- [ ] 4개 테스트 파일 PASS
- [ ] plugin.json bump

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.11.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1 absorption으로 수렴; ACCEPT_NOW HIGH 1건이 plan 수정으로 해소되어 R2 불필요)
- 합치 결론: Codex verdict=needs-attention. 3 finding 모두 goal 낙관 판정의 정책/trust fail-open을 지적 — managed settings 읽기 추가 + goal tristate화로 absorb.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 managed hook 정책 제외하면서 goal default-available | HIGH | ACCEPT_NOW | enterprise managed 환경 정책 fail-open. Task 1에 managed 경로 읽기 추가 + goal tristate(미확인 시 unknown) |
  | F3 goal이 workflows보다 약한 default (비대칭 근거 없음) | MEDIUM | ACCEPT_NOW | 설계 결정에 활성화 모델 차이 근거 명시 + managed로 강화. F1과 동일 해법 |
  | F2 런타임 게이트(버전/WebSearch/trust) 무시 | MEDIUM | DEFER_TO_BACKLOG | 못 보는 trust/버전은 unknown 강등으로 부분 수용. 로컬 CLI 버전 체크는 후속 axis |
- Deferred to backlog: 1 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (auto-CRITICAL 없음)
- Codex session 참조: thread 019eef8e-7df9-7f73-abbe-66940854fd4d

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
