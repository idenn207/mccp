---
review_mode: standalone
chain_aware: false
receipt_written: false
follow_up_status: resolved
---

# PR Review: #27 — feat(v1.1.0-s1): auto-handoff quarantine + /mccp:resume + Task 0 spike

**Reviewed**: 2026-06-16
**Author**: idenn207 (박동민)
**Branch**: `v1.1.0-orchestrator-s1` → `main`
**Decision**: **REQUEST CHANGES** → **RESOLVED** (in-session follow-up applied 2026-06-16)
**Mode**: `--standalone` (chain bypass, no `code-reviewer` receipt written)

> Follow-up patches applied in the same session — see "Resolution log" at the bottom for diff summary and test re-run results.

## Summary

v1.1.0 Stage 1 "honest handoff" 전환은 설계상 명확하고 신규 코드의 단위 테스트 커버리지(`state-resumption`, `state-writer`, `auto-handoff`, `receipt-prompt-alias-bypass` 합산 65/65 PASS)는 견고합니다. 그러나 `session-spawner.js`에 새로 추가된 `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN` 게이트가 **기존 `claudeCheck()` 분기보다 앞에** 끼어들면서 PR이 건드리지 않은 `session-spawner.test.js`의 4개 테스트가 잘못된 `fallbackReason`을 받고 깨집니다. test 업데이트 누락이 명백한 HIGH-severity regression — 머지 전 보정이 필요합니다.

## Findings

### CRITICAL
None.

### HIGH

**H1. `session-spawner.test.js` 4건 regression — 기존 테스트가 새 experimental flag을 set하지 않음**

- **위치**: `plugins/mccp/scripts/state/tests/session-spawner.test.js:80-123` (4 cases)
- **현상**: `node --test` 풀 스위트 실행 시 다음 4 테스트가 fail.
  - `mode=spawn + claude missing → degrade to notify, fallbackReason recorded` (line ~70)
  - `mode=spawn + win32 platform → powershell.exe spawn` (line 75)
  - `mode=spawn + linux + tmux available → tmux new-window` (line 91)
  - `mode=spawn + linux + no tmux → degrade to notify` (line 110)
- **원인**: PR이 `session-spawner.js:240-244`에 다음을 추가:
  ```js
  if (env.MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN !== '1') {
    effectiveMode = 'notify';
    fallbackReason = FALLBACK.SPAWN_EXPERIMENTAL_FLAG_MISSING;
    ...
  } else if (!claudeCheck()) { ... }
  ```
  이 체크가 기존 `claudeCheck` / `platformSpawn` 분기보다 앞이라, env에 flag을 넣지 않은 기존 테스트는 모두 `spawn-experimental-flag-missing`으로 단락 처리됩니다.
- **증거 (실측)**:
  ```
  AssertionError: 'spawn-experimental-flag-missing' !== 'tmux-not-available'
    session-spawner.test.js:121:10
  ```
  `auto-handoff.test.js:201-220`은 새로 작성하면서 `env: { MCCP_AUTO_HANDOFF: 'spawn', MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN: '1' }`을 옳게 넣었지만, 더 안쪽 단위 테스트 파일은 같이 갱신되지 않았습니다.
- **수정안 (작음)**: `session-spawner.test.js`의 해당 4 테스트의 `spawner.spawn({...})` 호출에 `env: { MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN: '1' }`를 추가하거나, 같은 파일 상단에 `process.env.MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN = '1'` 헬퍼를 두는 방식. 한 줄 추가로 해결됩니다.

### MEDIUM

**M1. `resume.md` Phase 4 validate stderr 무음화로 dispatched 실패 원인이 손실됨**

- **위치**: `plugins/mccp/commands/resume.md:193`
  ```bash
  node "$PLUGIN_ROOT/scripts/receipt/cli.js" validate --command "$VALIDATE_COMMAND" > /dev/null 2>&1
  ```
- **영향**: dispatched 명령이 실패했을 때 validate가 non-zero를 반환하면 그저 "validate exit=N"만 출력. receipt schema 위반/누락 원인을 잃습니다. attempt count는 살아 있어 in-flight/giveup로 자연스럽게 흘러가지만, 디버깅 시 사용자가 매번 직접 validate를 재실행해야 합니다.
- **권장**: 실패 path에서만 stderr 캡처(`2>&1 | tee /dev/stderr`) 또는 tmp 파일에 저장 후 비-zero일 때만 print.

**M2. STATE.md `dispatch_attempt_count` overflow handling이 dispatch 함수의 `Number.isFinite` guard보다 약함**

- **위치**: `state-writer.js:402-404` vs `state-resumption.js:65`
  ```js
  // state-writer
  const n = Number(patch.dispatch_attempt_count);
  merged.frontmatter.dispatch_attempt_count = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  // state-resumption (consumer)
  const currentAttemptCount = Number(fm.dispatch_attempt_count) || 0;
  ```
- 잠재 이슈: 사용자가 STATE.md를 직접 편집해 `dispatch_attempt_count: 9007199254740993` (Number.MAX_SAFE_INTEGER 초과) 같은 값을 넣으면 `||0` 폴백이 발동하지 않고 그대로 NaN이 됨 → `>= GIVEUP_AFTER` 비교에서 NaN 비교 false → in-flight로 영원히 락. 매우 낮은 확률이지만 documented invariant("manual reset")가 깨질 수 있습니다.
- **권장**: state-resumption 측에도 `Number.isFinite` guard를 추가하거나 state-writer의 normalization을 한 곳으로 집중.

### LOW

**L1. `resume.md` argument-hint와 실제 동작 모순(미세함)**

- frontmatter: `argument-hint: "(no arguments — reads STATE.md handoff state)"`
- Phase 3는 `/mccp:work` / `/mccp:prp-implement`로 args를 전달. argument-hint는 `/mccp:resume` 자신이 받는 인자에 한정된 표현이라 엄밀하면 문제 없지만, 사용자가 모호하게 읽을 수 있습니다.

**L2. F1/F2 absorption 같은 내부 jargon이 주석에 다수 출현**

- `state-resumption.js`, `state-writer.js`, `resume.md` 곳곳에 "F1 absorption", "F2 absorption", "Codex R1" 등 plan/codex review 내부 용어가 그대로 노출. 코드만 읽는 미래 독자에게는 plan note 없이는 의미 추적 불가.
- 현재 표현이 backlog 추적용으로 의도된 거라면 OK. 다만 `.claude/plans/notes/...` 경로 한 줄을 주석에 같이 적어두면 archaeology 비용이 줍니다.

**L3. `state-resumption.js` `taskFingerprint` injection**
- `state-resumption.js:121`: `args: '--resume task=' + fingerprint`. `fingerprint`는 STATE.md `task_fingerprint`에서 옴.
- 현실적으로 task_fingerprint는 mccp 내부에서 생성되므로 위협 모델은 사용자 본인의 STATE.md 손상에 한정. 다만 future-proofing 차원에서 fingerprint에 공백/특수문자 제한 검증을 한 곳에 두는 게 좋습니다.

### Out-of-scope observations (이 PR 결함 아님 — backlog 후보)

**O1. G1 patch test 3건 main 기준 pre-existing 실패**

- `plugins/mccp/scripts/hooks/tests/g1-patch.test.js`의 `module-load error / no session_id` 3개가 본 PR과 무관하게 실패합니다.
- 원인: `receipt-prompt.js:62`의 `const { extractPlanPath } = require(path.join(LIB_DIR, 'extract-plan-path'))`가 v0.2.8 (commit 8cc9ac5)에서 module-scope require로 추가되었는데, `g1-patch.test.js:23-40` `makeBrokenPluginRoot()`가 `hook-trace.js + receipt-mode.js`만 복사하고 `extract-plan-path.js`는 복사하지 않습니다. 결과: broken-root 환경에서 receipt-prompt.js가 module load 단계에서 throw → exit 1 (G1 fail-open path에 도달 못 함).
- **이 PR과는 무관**합니다. v1.0.x 또는 v1.1.x cycle backlog에 별도 axis로 기록 권장.

## Validation Results

| Check | Result |
|---|---|
| Type check | Skipped (no tsconfig — pure JS project) |
| Lint | Skipped (no lint script in repo root, no package.json) |
| Tests (changed files only — 65 cases) | **PASS** |
| Tests (full suite, 1051 cases) | **FAIL — 7 fail / 1042 pass / 2 skip** (4 caused by this PR / 3 pre-existing) |
| Build | N/A (no build step) |

### Test detail

- `state-resumption.test.js`: 17/17 PASS — 6 dispatch rows + F1 absorption sweep + idempotency
- `state-writer.test.js`: 신규 v1.1.0 추가 7개 포함 32/32 PASS (`resume_dispatching`/`resume_dispatched` first-class, `clearHandoff` 동작, `dispatch_*` round-trip)
- `auto-handoff.test.js`: 신규 11/11 PASS (experimental flag opt-in/opt-out 검증 2개 신규)
- `receipt-prompt-alias-bypass.test.js`: 3/3 PASS (alias --standalone, Local Review, 회귀 가드)
- `session-spawner.test.js`: **4 FAIL** — H1 finding 참조

## Files Reviewed

### Source (modified)
- `plugins/mccp/scripts/hooks/auto-handoff.js` — Modified (+9 / -1)
- `plugins/mccp/scripts/hooks/receipt-prompt.js` — Modified (+7 / -2) — alias bypass 추가
- `plugins/mccp/scripts/state/session-spawner.js` — Modified (+6 / -1) — **H1 regression source**
- `plugins/mccp/scripts/state/state-writer.js` — Modified (+53 / -0)

### Source (added)
- `plugins/mccp/commands/resume.md` — Added (238 LOC) — slash command body
- `plugins/mccp/scripts/lib/state-resumption.js` — Added (155 LOC) — pure dispatch helper

### Tests (added)
- `plugins/mccp/scripts/hooks/tests/auto-handoff.test.js` — Modified (+47 LOC, 2 신규 케이스)
- `plugins/mccp/scripts/hooks/tests/receipt-prompt-alias-bypass.test.js` — Added (82 LOC)
- `plugins/mccp/scripts/lib/tests/state-resumption.test.js` — Added (226 LOC)
- `plugins/mccp/scripts/state/tests/state-writer.test.js` — Added (126 LOC v1.1.0 추가분)

### Docs / Plans
- `CLAUDE.md` — §1.4 + §4 갱신 (auto-handoff 행 + 새 env var 명세)
- `docs/v0.2-architecture.md` — resume entry point 단락 추가
- `docs/v1.1.0-orchestrator/spike-upstream-primitives.md` — Added (4-AND spike 결과)
- `CHANGELOG.md` — v1.1.0 row 추가
- `.claude/plans/v1-1-0-orchestrator-s1-honest-handoff.plan.md` — plan
- `.claude/plans/v1-2-0-orchestrator-stage2-backlog.md` — Stage 2 seed
- `.claude/PRPs/reports/v1-1-0-orchestrator-s1-honest-handoff-report.md` — report
- `.claude/plans/notes/v1-1-0-orchestrator-s1-honest-handoff.implement-codex.md` — implement-codex 메모

### Housekeeping (rename)
- `.claude/notes/archive/` → `.claude/plans/notes/archive/` (mccp-v0.2-continuation.md 포함)
- `.claude/notes/v1.0.0-verification-launchpad.md` → `.claude/plans/notes/`
- `.claude/state/STATE.md` — hook timestamp 자동 갱신

## Next Steps

1. **(must)** `session-spawner.test.js` 4 케이스에 `env: { MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN: '1' }` 추가. 한 commit로 해결 가능.
2. **(should)** Phase 4 validate stderr 보존 (M1).
3. **(optional)** state-resumption의 `dispatch_attempt_count` `Number.isFinite` guard (M2).
4. **(out-of-PR)** G1 patch test 헬퍼 갱신을 별도 axis로 backlog 등록 — `makeBrokenPluginRoot`가 `extract-plan-path.js`도 복사하도록.

---

## Resolution log (in-session follow-up, 2026-06-16)

리뷰 후 같은 세션에서 H1 + M1 + M2 모두 패치 적용. G1 pre-existing failures 3건은 의도적으로 손대지 않음 — 별도 axis로 후속.

### H1 (HIGH) — applied

- **File**: `plugins/mccp/scripts/state/tests/session-spawner.test.js`
- **Patch**: 상단에 `const SPAWN_OPT_IN = Object.freeze({ MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN: '1' });` 추가, 영향받은 4 테스트(`claude missing`, `win32 powershell`, `linux+tmux`, `linux+no-tmux`)의 `spawner.spawn({...})` 호출에 `env: SPAWN_OPT_IN,` 한 줄씩 주입.
- **Re-run**: `node --test plugins/mccp/scripts/state/tests/session-spawner.test.js` → **12/12 PASS**.

### M1 (MEDIUM) — applied

- **File**: `plugins/mccp/commands/resume.md` Phase 4 (한 block).
- **Patch**: `> /dev/null 2>&1` → `> /dev/null 2> "$VALIDATE_STDERR"` (`mktemp` fallback 포함). 실패 path에서 `[ -s "$VALIDATE_STDERR" ]` 일 때 `sed 's/^/  /'`로 들여쓰기해 출력, 양쪽 path 모두 `rm -f` cleanup. Loud-fail-open 원칙([[feedback-loud-fail-open]]) 일관성 회복.

### M2 (MEDIUM) — applied

- **File**: `plugins/mccp/scripts/lib/state-resumption.js` line 65 + `plugins/mccp/scripts/lib/tests/state-resumption.test.js` (regression test 3개 추가).
- **Patch**: `Number(fm.dispatch_attempt_count) || 0` → `Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0`. 가드 회귀 테스트 3종(`Infinity → 0`, `-1 → 0`, `2.7 → 2`).
- **Re-run**: state-resumption suite 신규 3건 포함 모두 PASS.

### Full-suite re-run

| Metric | Before | After |
|---|---|---|
| Total | 1051 | 1054 |
| Pass | 1042 | 1049 |
| Fail | 7 | 3 |
| Skipped | 2 | 2 |

- **Resolved by this session**: 4 session-spawner failures (H1) — all green.
- **Remaining**: 3 pre-existing G1 patch failures in `plugins/mccp/scripts/hooks/tests/g1-patch.test.js` (`module-load error` x2 + `no session_id`). Cause = `makeBrokenPluginRoot()` 헬퍼가 v0.2.8의 `extract-plan-path.js` module-scope require 추가에 맞춰 갱신되지 않음. **이 PR 책임 아님 — v1.1.x cycle backlog 후속 axis**.

### LOW items status

- L1/L2/L3은 의도적으로 변경하지 않음 — review note 그대로 documentation으로 남겨 미래 archaeology 비용을 줄임. 코드 동작에는 영향 없음.
