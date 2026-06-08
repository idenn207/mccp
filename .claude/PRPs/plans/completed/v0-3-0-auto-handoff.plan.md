# Plan: v0.3.0 — S10b Auto-Handoff ($100 hard ceiling) (Milestone 3)

**Status**: ⏳ **READY FOR IMPLEMENT** (leaf-level, plan-Codex gate pending)
**Plugin version**: 0.2.8 → **0.3.0** (minor bump — backward-compatible semantics 확장)
**Parent roadmap**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 3
**Design reference**: [docs/v0.2-architecture.md §4](../../docs/v0.2-architecture.md) (canonical sequence diagram)
**Branch convention**: `feat/v0-3-0-auto-handoff` from main (main 직접 push 금지)

---

## Summary

cost-based auto-handoff hook을 구현. Stop-loop PASS 직후 `breakpoint-detector`가 cost tier(`$50 notice` / `$80 soft` / `$100 hard ceiling`)를 결정하고, `session-spawner`가 새 세션을 생성하면서 STATE.md `next_chunk` + `unsafe_checkpoint`를 atomic하게 인계. **architecture §4 sequence diagram을 verbatim 구현** + 두 가지 drift 해소:

1. cost threshold magic numbers(50/80/100)를 `cost-thresholds.js` 단일 source로 추출 (architecture §4 "Cost-threshold source of truth" 약속 이행, silent-rebase 회피)
2. `stop-review-loop.js`가 PASS 후 STATE.md `last_event='stop_loop_pass'`를 emit하도록 wiring (safe-event AND-gate 동작 활성화)

핵심 invariant: **hard ceiling은 fix-task를 override**해 unconditional spawn + `unsafe_checkpoint=true`. fix-task는 next session의 첫 chunk로 carry. claude binary 미감지 환경에서는 `spawn` 모드를 `notify` 모드로 graceful degrade.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Atomic lock + lease | [plugins/mccp/scripts/lib/pr-phase-lock.js](../../plugins/mccp/scripts/lib/pr-phase-lock.js) | `ownership_token_hash` + stdin-pipe IPC + mtime lease 60s + same-host pid-alive NEVER-reclaim |
| Sticky monotonic state | [plugins/mccp/scripts/lib/cost-state.js](../../plugins/mccp/scripts/lib/cost-state.js) | `writeStateMerged` + R2#1 unconditional merge for safety fields |
| STATE.md mutation API | [plugins/mccp/scripts/state/state-writer.js](../../plugins/mccp/scripts/state/state-writer.js) | `patchState({ lastEvent, nextChunk, unsafeCheckpoint, sessionEndImminent })` |
| Hook entry registration | [plugins/mccp/hooks/hooks.json](../../plugins/mccp/hooks/hooks.json) `Stop` array (line 318) | `matcher: "*"` + node script path |
| Hook impl shape | [plugins/mccp/scripts/hooks/stop-review-loop.js](../../plugins/mccp/scripts/hooks/stop-review-loop.js) | stdin JSON in, stdout JSON out, stderr signal-only |
| Cost-state read | [plugins/mccp/scripts/lib/cost-state.js](../../plugins/mccp/scripts/lib/cost-state.js) `readState()` + `isStale(maxAgeMs)` | conservative "no telemetry → no handoff" on stale |
| Path containment | [plugins/mccp/scripts/lib/path-containment.js](../../plugins/mccp/scripts/lib/path-containment.js) | `assertContained` realpath guard on lock dir |
| Tests | [plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js](../../plugins/mccp/scripts/lib/tests/pr-phase-lock-boundary.test.js) | node:test, table-driven, win32 conditional skip |

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/cost-thresholds.js` | CREATE | architecture §4 "Cost-threshold source of truth" — single export for 50/80/100 |
| `plugins/mccp/scripts/lib/tests/cost-thresholds.test.js` | CREATE | 4 tier boundary cases + override env semantics |
| `plugins/mccp/scripts/lib/cost-state.js` | UPDATE | `tierFor` 내부 50/80/100 literal을 `cost-thresholds.getHandoffCostThresholds()` import로 교체 |
| `plugins/mccp/scripts/state/breakpoint-detector.js` | CREATE | cost tier + STATE.md `last_event` AND-gate → `{ tier, shouldHandoff, reason }` 결정 |
| `plugins/mccp/scripts/state/tests/breakpoint-detector.test.js` | CREATE | 4 tier × 2 safe-event × fix-task pending matrix + stale cost-state fallback |
| `plugins/mccp/scripts/state/session-spawner.js` | CREATE | race-lock + platform spawn + STATE.md `next_chunk` write + claude-binary graceful fallback |
| `plugins/mccp/scripts/state/tests/session-spawner.test.js` | CREATE | platform branch, race-lock concurrent, fallback degrade, hard-ceiling unsafe_checkpoint |
| `plugins/mccp/scripts/hooks/auto-handoff.js` | CREATE | Stop hook entry — read STATE.md → detect → spawn (idempotent, exit code semantics) |
| `plugins/mccp/scripts/hooks/tests/auto-handoff.test.js` | CREATE | 4 STATE.md scenarios + hook stdin/stdout contract + env switch matrix |
| `plugins/mccp/scripts/hooks/stop-review-loop.js` | UPDATE | PASS path 끝에서 `patchState({ lastEvent: 'stop_loop_pass' })` 추가 (safe-event signal) |
| `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` | UPDATE | 기존 PASS assertion에 last_event 검증 추가 |
| `plugins/mccp/hooks/hooks.json` | UPDATE | `Stop` array에 auto-handoff entry 추가 (stop-review-loop 뒤 ordering) |
| `CLAUDE.md` | UPDATE | §1.4 표 "Auto-handoff S10b 미구현" → "S10b ship (v0.3.0)" + §4 환경변수 표에서 "⚠ S10b 미구현" 주석 제거 |
| `docs/v0.2-architecture.md` | UPDATE | §4 "Implementation status" 한 줄 추가 — "v0.3.0 ship (PR #N)" |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version`: `0.2.8` → `0.3.0` |

---

## Tasks

### Task 3.0: cost-thresholds.js 추출 + cost-state.js 리팩터

**Action**: 50/80/100 magic number를 `plugins/mccp/scripts/lib/cost-thresholds.js`의 named export 단일 source로 집약. `cost-state.js#tierFor`가 import하도록 교체. silent-rebase 위험(architecture §4 Reviewer A A2) 해소.

**Mirror**:
- export 형태: `cost-state.js#tierFor` 함수 시그니처 보존 (`tierFor(costUsd) → 'green'|'notice'|'warning'|'critical'`)
- 모듈 구조: `lib/cost-state-path.js` (simple path-only module) 패턴

**IMPORTS**:
```javascript
// cost-thresholds.js
module.exports = {
  getHandoffCostThresholds: () => ({ notice: 50, warning: 80, critical: 100 }),
  // env override: MCCP_HANDOFF_THRESHOLDS_USD="50,80,100" (parse + validate)
};
```

**GOTCHA**:
- `cost-state.js`의 `tierFor` 호출자 모두 보존 (auto-chain.js + state-injector 등). 함수 시그니처 절대 변경 금지.
- env override는 parse 실패 시 default fallback + stderr warn. validation: `notice < warning < critical` 강제.

**VALIDATE**:
```bash
node --test plugins/mccp/scripts/lib/tests/cost-thresholds.test.js
node --test plugins/mccp/scripts/lib/tests/cost-state.test.js
```

### Task 3.1: breakpoint-detector.js

**Action**: cost-state.js `readState()` + STATE.md frontmatter(`last_event`, `last_event_at`)를 결합해 `{ tier, shouldHandoff, reason }`을 결정. architecture §4 priority policy 그대로 구현.

**Mirror**:
- API 형태: `pr-phase-lock.js`의 `tryReclaimStaleLock` 패턴 (decision-tree 함수 + structured return)
- read-only contract: STATE.md를 modify하지 않음 (spawner가 함). state-writer 의존 없음.

**IMPORTS**:
```javascript
const { readState, isStale } = require('../lib/cost-state');
const { getHandoffCostThresholds } = require('../lib/cost-thresholds');
const fs = require('fs');
const path = require('path');
// STATE.md frontmatter parse: minimal inline YAML-safe parse (avoid pulling state-writer just for read)
```

**Decision tree (architecture §4)**:
| tier | safe-event window | fix-task pending | Result |
|---|---|---|---|
| `green` (<$50) | * | * | `{ shouldHandoff: false, reason: 'below-notice' }` |
| `notice` ($50–$80) | * | * | `{ shouldHandoff: false, reason: 'notice-stderr-only' }` |
| `soft` ($80–$100) | safe | absent | `{ shouldHandoff: true, reason: 'soft-safe-no-fix-task' }` |
| `soft` ($80–$100) | safe | present | `{ shouldHandoff: false, reason: 'soft-defer-fix-task' }` |
| `soft` ($80–$100) | unsafe | * | `{ shouldHandoff: false, reason: 'soft-defer-unsafe-event' }` |
| `hard` (≥$100) | * | * | `{ shouldHandoff: true, reason: 'hard-ceiling-force', unsafeCheckpoint: true }` |

**Safe-event set**: `{ 'stop_loop_pass', 'receipt_write', 'pr_created' }` AND `now - last_event_at < 60_000ms`.

**Fix-task pending**: `fs.existsSync(<repoRoot>/.claude/state/fix-task.md)`.

**GOTCHA**:
- cost-state.js `isStale(5_000)` 호출 — stale 시 `{ shouldHandoff: false, reason: 'cost-state-stale' }` conservative.
- repoRoot은 `git rev-parse --show-toplevel`로 계산 (stop-review-loop §"Working-directory contract" 패턴 mirror).

**VALIDATE**:
```bash
node --test plugins/mccp/scripts/state/tests/breakpoint-detector.test.js
# 8개 scenario: green, notice, 3×soft(matrix), hard, stale cost-state, missing STATE.md
```

### Task 3.2: session-spawner.js

**Action**: race-lock acquire → STATE.md atomic write (`next_chunk` + `unsafe_checkpoint` + `session_end_imminent=true`) → platform spawn → release. claude binary 미감지 시 `notify` mode로 graceful degrade.

**Mirror**:
- race-lock 패턴: [pr-phase-lock.js](../../plugins/mccp/scripts/lib/pr-phase-lock.js) `cmdEnter`/`releaseLock` — `ownership_token_hash` + stdin-pipe IPC + mtime lease 60s + host-aware tri-state (CLAUDE.md §3.6)
- STATE.md mutation: state-writer.js `patchState({ nextChunk, unsafeCheckpoint, sessionEndImminent: true, lastEvent: 'handoff_spawn' })`
- Path containment: `assertContained(lockDir, repoRoot + '/.claude', null)` (path-containment.js)

**IMPORTS**:
```javascript
const crypto = require('crypto');
const { spawn } = require('child_process');
const { acquireLock, releaseLock } = require('../lib/pr-phase-lock'); // re-export from existing module
const { patchState } = require('./state-writer');
const { assertContained } = require('../lib/path-containment');
```

**API**:
```javascript
spawn({ root, tier, currentTask, mode }) →
  Promise<{ ok: boolean, mode: 'spawn'|'notify'|'noop', lockPath?: string, fallbackReason?: string }>
// mode: input env-derived ('off'|'notify'|'spawn'), output reflects actual action taken after fallback
```

**Lock path**: `<root>/.claude/state/handoff-lock-<sha256(tier+currentTask).slice(0,8)>.lock`.

**Platform branch**:
| OS | Command |
|---|---|
| `win32` | `Start-Process powershell -NoExit -ArgumentList '-Command','claude'` via `spawn('powershell.exe', [...])` |
| else (tmux available) | `tmux new-window -c <root> -n mccp-<hash> -- claude` |
| no tmux + non-win32 | `notify` mode degrade + stderr instruction |

**Hard ceiling override** (architecture §4 priority policy #2):
- `tier === 'hard'` → fix-task 무시하고 spawn 강행, `unsafe_checkpoint=true`. 기존 fix-task.md는 보존 (next session's first chunk로 inherit).
- next_chunk text: `"Resume from hard-ceiling handoff. unsafe checkpoint. Apply fix-task.md first if present, then continue current task."`

**Claude binary detection**:
```bash
# pre-check before spawn
which claude || command -v claude
# Windows: Get-Command claude -ErrorAction SilentlyContinue
```
미감지 시 → `mode: 'notify'`로 degrade, desktop-notify + stdout meta "claude binary not on PATH, manual session start required".

**GOTCHA**:
- `MCCP_AUTO_HANDOFF=off` → noop early-return (lock도 안 잡음)
- `MCCP_AUTO_HANDOFF=notify` (default) → desktop-notify + meta only, spawn 안 함
- `MCCP_AUTO_HANDOFF=spawn` → 실제 spawn 시도. fail 시 notify mode degrade.
- Windows `Start-Process`는 detached. stdin/stdout redirect 안 함 (새 console window).
- tmux는 `TMUX` env가 set돼 있어야 `new-window` 동작. unset이면 noop + fallback.

**VALIDATE**:
```bash
node --test plugins/mccp/scripts/state/tests/session-spawner.test.js
# scenarios: off-noop, notify-no-spawn, spawn-success-mock, spawn-claude-missing-degrade,
#            race-lock-double-spawn-rejected, hard-ceiling-unsafe-checkpoint,
#            STATE.md atomic write verification
```

### Task 3.3: auto-handoff.js hook entry

**Action**: Stop event hook으로 stop-review-loop 뒤에 ordering. STATE.md `last_event` 읽고 → `breakpointDetector.detect()` → `shouldHandoff=true` 시 `sessionSpawner.spawn()` 호출. exit code 0 (block 안 함).

**Mirror**:
- Hook shape: [stop-review-loop.js](../../plugins/mccp/scripts/hooks/stop-review-loop.js) (stdin JSON, stdout JSON, stderr signal-only)
- Hook idempotency: pr-phase-guard.js의 `contentHashManifest` 패턴 mirror (handoff already happened 같은 task에서 두 번 fire 방지)

**IMPORTS**:
```javascript
const { detect } = require('../state/breakpoint-detector');
const { spawn: spawnSession } = require('../state/session-spawner');
const { readStateMd } = require('../state/state-writer'); // expose if not present
```

**Hook contract**:
- stdin: `{ session_id, transcript_path, cwd, ... }` (Claude Code stop event payload)
- stdout: `{ ok: true, mode: <result.mode>, tier: <result.tier> }` for telemetry
- stderr: human-readable status (notify mode message, fallback reason)
- exit: always 0 (auto-handoff은 never blocks Stop)

**Idempotency**:
- handoff_lock 파일 자체가 idempotency key — 같은 currentTask hash로 두 번 fire되면 두 번째는 lock acquire 실패 → noop + telemetry.

**Telemetry**:
- 모든 결과를 `<root>/.claude/state/auto-handoff-log.jsonl`에 append (ledger). schema: `{ ts, tier, mode, fallback_reason?, lock_path? }`. operator는 `/mccp:trace` 같은 진단 명령으로 조회 가능.

**GOTCHA**:
- stop-review-loop 뒤에 실행되도록 hooks.json ordering 보장 (architecture §2 다이어그램 의도). hooks.json은 array 순서대로 execute.
- `MCCP_STOP_LOOP=off`인 환경에서는 stop-review-loop가 last_event 안 찍음 → auto-handoff는 항상 'no safe-event' 판정 → conservative no-handoff. 의도된 동작.

**VALIDATE**:
```bash
node --test plugins/mccp/scripts/hooks/tests/auto-handoff.test.js
# scenarios: green-noop, notice-stderr-only, soft-safe-spawn, soft-unsafe-defer,
#            hard-force-spawn, claude-missing-fallback, double-fire-idempotent,
#            telemetry-ledger-append
```

### Task 3.4: stop-review-loop.js safe-event signal

**Action**: stop-review-loop.js의 PASS path 끝에서 `patchState({ lastEvent: 'stop_loop_pass' })` 호출 추가. fail path는 이미 STATE.md를 자체 갱신 (fix-task.md 작성 시 last_event='stop_loop_fail') — same module reuse 확인.

**Mirror**:
- state-writer API: `patchState` 호출 형태 ([pre-compact.js](../../plugins/mccp/scripts/hooks/pre-compact.js) 패턴)

**Locating insertion point**:
- 현재 stop-review-loop.js의 PASS 분기 — quality runner PASS + (옵션) Codex pass 통과 직후.
- counter reset 직후, `process.stdout.write('{"ok":true}')` 직전이 자연스러움.

**GOTCHA**:
- `MCCP_STOP_LOOP=off`일 때는 quality 실행 자체가 skip이라 PASS 분기도 안 탐 — last_event signal도 안 나감. 이게 의도된 동작 (off는 완전 무력화).
- `MCCP_STOP_LOOP=observe` 모드에서도 quality는 실행되니 signal은 나가야 함. 의도 명확화.
- state-writer.patchState는 file lock 사용 — Stop hook이 짧게 막힐 수 있음 (acceptable).

**VALIDATE**:
```bash
node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js
# 기존 PASS assertion에 STATE.md last_event=stop_loop_pass 검증 1줄 추가.
# 기존 FAIL assertion은 last_event=stop_loop_fail (state-writer가 이미 emit) — assertion 누락 시 추가.
```

### Task 3.5: hooks.json entry + env wiring + docs + plugin bump

**Action**: hooks.json `Stop` array에 auto-handoff entry 추가 (stop-review-loop 뒤). CLAUDE.md §1.4 + §4 표 갱신. plugin.json minor bump.

**hooks.json entry**:
```json
{
  "matcher": "*",
  "hooks": [
    {
      "type": "command",
      "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/hooks/auto-handoff.js\"",
      "description": "v0.3.0 S10b auto-handoff: cost-tier breakpoint detection + session spawn at hard ceiling; gated by MCCP_AUTO_HANDOFF env (off/notify/spawn)"
    }
  ]
}
```

**CLAUDE.md §1.4 표 갱신**:
```diff
- | **Auto-handoff**           | ...                                                                                         | S10b 미구현  |
+ | **Auto-handoff**           | 누적 비용 $50 notice / $80 soft / $100 hard ceiling 임계로 자동 세션 전환                     | S10b ship (v0.3.0) |
```

**CLAUDE.md §4 환경 변수 표 갱신**:
```diff
- # MCCP_AUTO_HANDOFF=off|notify|spawn     # ⚠ S10b 미구현. 환경변수만 예약된 상태.
+ MCCP_AUTO_HANDOFF=off|notify|spawn       # default: notify. spawn 모드 + claude binary 미감지 시 notify로 graceful degrade.
+ MCCP_HANDOFF_THRESHOLDS_USD="50,80,100"  # default. comma-separated notice,warning,critical USD thresholds. parse 실패 시 default + stderr warn.
```

**docs/v0.2-architecture.md §4 갱신**:
- §4 첫 줄에 `**Implementation status**: v0.3.0 ship (PR #N).` 한 줄 추가.

**plugin.json**:
```json
{ "version": "0.3.0" }
```

**VALIDATE**:
```bash
# JSON validity
node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/hooks/hooks.json'))"
node -e "JSON.parse(require('fs').readFileSync('plugins/mccp/.claude-plugin/plugin.json'))"
# CLAUDE.md doesn't break markdownlint
npx markdownlint-cli2 CLAUDE.md docs/v0.2-architecture.md
```

---

## Validation

```bash
# Level 1: static (lint/format if scripts present)
node --check plugins/mccp/scripts/lib/cost-thresholds.js
node --check plugins/mccp/scripts/state/breakpoint-detector.js
node --check plugins/mccp/scripts/state/session-spawner.js
node --check plugins/mccp/scripts/hooks/auto-handoff.js

# Level 2: unit tests (per-task VALIDATE blocks)
node --test plugins/mccp/scripts/lib/tests/cost-thresholds.test.js
node --test plugins/mccp/scripts/state/tests/breakpoint-detector.test.js
node --test plugins/mccp/scripts/state/tests/session-spawner.test.js
node --test plugins/mccp/scripts/hooks/tests/auto-handoff.test.js
node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js

# Level 3: full suite no regressions
node --test plugins/mccp/scripts

# Level 4: integration (Stop event simulation)
# Spec-drive: pipe a synthetic Stop event JSON into auto-handoff.js,
# assert STATE.md frontmatter mutation + lock acquire/release + ledger append.

# Level 5: manual dogfood
# - Set MCCP_AUTO_HANDOFF=notify, run /mccp:prp-implement on a tiny plan, observe stderr notice tier signaling
# - Set MCCP_AUTO_HANDOFF=spawn (claude binary required), simulate cost via env COST_USD=120,
#   verify new session opens + STATE.md next_chunk populated
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| R1: claude binary 미감지 환경(현 dev env 포함, system reminder ENOENT 확인) | High | Medium | spawn → notify mode graceful degrade + telemetry ledger의 `fallback_reason` 기록 |
| R2: 동시 Stop event로 double-spawn race | Medium | High | race-lock 파일 (pr-phase-lock 패턴 reuse — ownership_token_hash + mtime lease 60s) |
| R3: cost-state.js stale (5s 초과) → 오판 | Medium | Medium | `isStale(5_000)` 강제 호출 → stale 시 conservative no-handoff |
| R4: STATE.md last_event 갱신과 breakpoint-detector read 사이 race | Low | Medium | state-writer 이미 file lock — patchState atomic. detector는 read-only. |
| R5: Windows `Start-Process` 의존성 + tmux 미설치 환경 | Medium | Medium | platform branch + 둘 다 미감지 시 notify degrade |
| R6: hard ceiling spawn 후 사용자가 새 세션을 못 봐서 cost 계속 누적 | Medium | High | desktop-notify (CRITICAL severity) + STATE.md `session_end_imminent=true` + stderr loud message ("HARD CEILING — manual intervention required if no new session appeared") |
| R7: env override `MCCP_HANDOFF_THRESHOLDS_USD` parse 실패 silent | Low | Low | parse 실패 시 default fallback + stderr warn + `cost-thresholds.js` 자체 validation `notice < warning < critical` |
| R8: stop-review-loop이 last_event를 emit하지 않는 환경(`MCCP_STOP_LOOP=off`) — auto-handoff가 영구 no-handoff | Low | Low | 의도된 동작. `MCCP_STOP_LOOP=off`는 v0.2 stop-loop를 완전 무력화하므로 v0.3 auto-handoff도 동반 무력화가 합리적 — Acceptance 항목에 명시. |

---

## Acceptance

- [ ] `cost-thresholds.js`가 50/80/100 single source 역할 — `cost-state.js#tierFor`가 import해서 사용. literal 검색 시 `cost-thresholds.js` 외에 0건.
- [ ] `getHandoffCostThresholds()` 함수 export — architecture §4가 약속한 contract와 일치.
- [ ] `breakpoint-detector.detect()`가 6 tier × safe-event matrix 분기 검증 (단위 테스트 8 scenario PASS).
- [ ] `session-spawner.spawn()`이 race-lock 보유 시 double-call 거절 (concurrent test PASS).
- [ ] `auto-handoff.js` hook이 Stop event에서 fire — hooks.json entry 추가 + dogfood 1회 확인.
- [ ] `stop-review-loop.js` PASS path가 `last_event=stop_loop_pass` emit — test 1줄 assertion 추가.
- [ ] STATE.md `next_chunk` + `unsafe_checkpoint` + `session_end_imminent`이 hard ceiling spawn 시 atomic하게 갱신 — state-writer.test.js mirroring 1 scenario 추가.
- [ ] claude binary 미감지 → `notify` mode degrade — ledger의 `fallback_reason="claude-binary-not-found"` 확인.
- [ ] CLAUDE.md §1.4 표의 "S10b 미구현" 주석 제거됨.
- [ ] CLAUDE.md §4 환경 변수 표에서 `MCCP_AUTO_HANDOFF` "⚠ 미구현" 주석 제거됨, `MCCP_HANDOFF_THRESHOLDS_USD` env 추가됨.
- [ ] docs/v0.2-architecture.md §4에 "Implementation status: v0.3.0 ship" 한 줄 추가됨.
- [ ] `plugin.json` version `0.3.0`.
- [ ] 전체 test suite no regressions (현재 730/730 baseline 유지 또는 신규 테스트만 증가).
- [ ] PR 본문에 `## Codex Adversarial Review` 자동 inject (Phase 5 PLAN-CODEX GATE 통과 receipt 발행).

---

## Architecture decisions (committed)

- **A1 — Cost source**: `cost-state.js#readState()` Stop event-driven snapshot. telemetry 지연은 `isStale(5s)` conservative-no-handoff로 흡수.
- **A2 — Threshold literal source-of-truth**: `cost-thresholds.js` 단일 export. 다른 모듈은 literal 인라인 금지 (silent-rebase 회피, architecture §4 약속 이행).
- **A3 — Race-lock pattern**: `pr-phase-lock.js` 재사용 (`ownership_token_hash` + stdin-pipe IPC + mtime lease 60s + host-aware tri-state). 별도 lock 모듈 생성 안 함 — code duplication 회피.
- **A4 — Claude binary 미감지 fallback**: `spawn` → `notify` mode degrade + telemetry `fallback_reason`. fail-closed 아님(graceful degrade) — handoff 안 됨이 fail-closed보다 사용자 친화.
- **A5 — Hard ceiling override semantics**: fix-task 무시 unconditional spawn + `unsafe_checkpoint=true`. fix-task.md는 보존 → 다음 세션의 첫 chunk로 carry.
- **A6 — Hook chain ordering**: hooks.json `Stop` array 순서 — stop-review-loop 1st, auto-handoff 2nd. architecture §2 다이어그램 의도.
- **A7 — Test isolation**: 모든 spawn 테스트는 `child_process.spawn`을 mock injection으로 분리. 실제 OS spawn 없음. 통합 테스트만 dogfood로 manual.

---

## Source Sections (roadmap)

본 milestone 본문은 thin-index 변환 전 roadmap의 §Milestone 3 (lines 824-852)에 있음. v0.2 architecture §4 sequence diagram이 design canon. 본 plan은 그 diagram을 leaf-level task로 분해한 첫 iteration.

---

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

---

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): exit-nonzero

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.8/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- Mode: **advisory** (`MCCP_ALLOW_CODEX_UNAVAILABLE=1`) — non-approving receipt
- 환경 메타: `MCCP_CODEX_DISABLED=1` + `MCCP_RECEIPT_GATE_MODE=off` 영구 (per memory `feedback-codex-permanent-bypass` — design feature, chain-of-custody warning은 의도된 상태)
- 라운드 수: 0 (advisory mode — no rounds invoked)
- 합치 결론: N/A (advisory)
- 수용한 제안: N/A
- 거부한 제안 + 근거: N/A
- Open Questions: N/A (advisory)
- Codex session 참조: N/A (classification=exit-nonzero, durationMs=26590)

---

## Codex Implementation Review

> Codex unavailable, skipped (auto-fallback): codex_disabled (permanent bypass per `MCCP_CODEX_DISABLED=1`)

- 호출: skipped at Phase 2.5.3 (MCCP_CODEX_DISABLED=1 detected — codex-invoke wrapper would return classification=skipped)
- Mode: **advisory** — non-approving receipt
- 환경 메타: `MCCP_CODEX_DISABLED=1` + `MCCP_RECEIPT_GATE_MODE=off` 영구 (per memory `feedback-codex-permanent-bypass`)
- 라운드 수: 0 (advisory mode — no rounds invoked)
- 합치 결론: N/A (advisory)
- 수용한 제안: N/A
- 거부한 제안 + 근거: N/A
- Open Questions: N/A (advisory)
- Codex session 참조: N/A
- Cross-gate dedupe: not applied — plan-codex was also advisory N/A, so no shared decision-set to dedupe against. New implement-time decisions captured below for audit trail:

### New implement-time decisions (advisory)

- **A3 deviation**: plan's `IMPORTS` line claims `pr-phase-lock.js` exports `acquireLock`/`releaseLock`, but the actual module exports CLI-style `cmdEnter`/`cmdExit`/`cmdHeartbeat` only. `session-spawner.js` will use the exported primitives (`hashToken`, `tryReclaimStaleLock`, `isPidAlive`, `readLock`) to assemble a handoff-specific lock acquire/release pair locally — preserves A3 invariant (ownership_token_hash + host-aware reclaim) without forcing PR-phase baseline capture overhead onto the handoff path.
- **state-writer API name correction**: plan refers to `patchState({ lastEvent, ... })`. Actual API is `update(repoRoot, patch)` with snake_case fields (`event`, `unsafe_checkpoint`, `next_chunk`, `session_end_imminent`). Implementation uses the real signature — VALID_EVENTS already includes `'stop_loop_pass'` so Task 3.4 signal is schema-compliant.

### Design Review

> impeccable unavailable, skipped (auto-fallback): skill-missing (mirrors Plan-Codex Design Critique above; no UI surface in this implementation)

