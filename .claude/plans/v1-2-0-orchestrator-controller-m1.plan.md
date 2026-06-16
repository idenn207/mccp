# Plan: v1.2.0 Orchestrator — Stage 2 Milestone 1 (Foundation IPC)

**Source backlog**: [`.claude/plans/v1-2-0-orchestrator-stage2-backlog.md`](v1-2-0-orchestrator-stage2-backlog.md)
**Spike evidence**: [`docs/v1.1.0-orchestrator/spike-upstream-primitives.md`](../../docs/v1.1.0-orchestrator/spike-upstream-primitives.md)
**Selected Milestone**: v1.2.0 Stage 2 — **M1 only** (foundation IPC). M2(pilot fanout) + M3(lifecycle hardening) deferred to Stage 2 backlog continuation.
**Complexity**: Large (M1 scope: Medium-Large; full Stage 2 across M1+M2+M3: Large)
**Worktree**: `.worktrees/v1.2.0-orchestrator` (target — NOT yet created; Task 0 creates)
**Branch**: `v1.2.0-orchestrator-m1` (off main)

## Summary

v1.1.0 Stage 1의 Task 0 spike가 4-AND 평가에서 Q1(receipt cross-isolation read) PARTIAL + Q4(structured return) NO로 FAIL했다. 그 결과 *"controller가 upstream Agent tool의 얇은 wrapper로 충분한가?"*가 NO로 결정되었고, **IPC layer 자체가 Stage 2의 핵심 기여**가 되었다.

M1은 그 IPC layer의 foundation만 ship한다: envelope schema, dispatch controller core, hybrid watcher, worktree → parent 파일 동기화, receipt schema 확장 3 필드(optional, additive migration). pilot vertical(PR review fanout)과 6-case lifecycle 완전 구현은 본 plan의 out-of-scope — backlog 후속 milestone(M2/M3)에서 측정 기반으로 정한다.

**Stage 1 contract 유지**: `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN` flag는 그대로 보존(deprecation window 미경과). Stage 2 controller가 자연스럽게 그 자리를 차지하지만 spawn 코드 제거는 다음 cycle.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Atomic state lock | `plugins/mccp/scripts/lib/pr-phase-lock.js:1-60` | `wx`-exclusive create + `ownership_token_hash` + host-aware tri-state reclaim + in-loop heartbeat |
| State writer event enum | `plugins/mccp/scripts/state/state-writer.js:27-49` | fixed event whitelist + unknown-event downgrade in render |
| Pure helper module (DI) | `plugins/mccp/scripts/lib/work-orchestrator.js` | inject-friendly signature, fs/spawn side-effect 분리 |
| Schema migration (additive, dry-run, idempotent) | `plugins/mccp/scripts/migrations/v0.3.6-codex-scope-fields.js` | optional field add only, marker file, resumable partial state |
| Receipt schema extension | `plugins/mccp/scripts/receipt/schema.js:9-25` | GATE_IDS / PHASES / DECISION_ID_RE 화이트리스트 + optional field req() pattern |
| Node test runner | `plugins/mccp/scripts/state/tests/state-writer.test.js` | native `--test` + DI for `spawnImpl` / `claudeAvailable` / `fsImpl` |
| Spike evidence doc | `docs/v1.1.0-orchestrator/spike-upstream-primitives.md` | env pin → mapping → Y/N evidence → 4-AND eval → implications |
| Cheat sheet env-var row | `CLAUDE.md §4` 운영 토글 | `NAME=val # default: X. <when>. <effect>.` 형식 + 상태 marker (live / opt-in / experimental) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `docs/v1.2.0-orchestrator/architecture.md` | CREATE | M1 architecture: envelope schema, controller-worker boundary, lifecycle states, watcher 결정, receipt 확장 |
| `docs/v1.2.0-orchestrator/envelope-schema.md` | CREATE | JSON Schema 형식 envelope 정의 + 필수 필드 표 + transition matrix |
| `docs/v1.2.0-orchestrator/operator-runbook.md` | CREATE | operator 가이드: env vars, manual envelope inspection, stuck dispatch 복구, GC 정책 |
| `plugins/mccp/scripts/lib/dispatch-envelope.js` | CREATE | envelope validator + atomic read/write (worktree-aware), pure helper |
| `plugins/mccp/scripts/lib/dispatch-watcher.js` | CREATE | hybrid Monitor + polling fallback, cross-platform |
| `plugins/mccp/scripts/lib/dispatch-controller.js` | CREATE | spawn N workers via Agent tool, collect envelopes, merge findings — *pure orchestration, no Agent tool call inside* (caller가 Agent 호출 결과를 controller에 주입) |
| `plugins/mccp/scripts/lib/worktree-sync.js` | CREATE | worker worktree → parent `.claude/state/dispatches/` envelope atomic mv |
| `plugins/mccp/scripts/lib/tests/dispatch-envelope.test.js` | CREATE | schema validation 모든 transition + malformed input |
| `plugins/mccp/scripts/lib/tests/dispatch-watcher.test.js` | CREATE | Monitor path + polling fallback + timeout |
| `plugins/mccp/scripts/lib/tests/dispatch-controller.test.js` | CREATE | 6-case lifecycle table (case 1/2/3/4 회귀, 5/6은 M3 placeholder) |
| `plugins/mccp/scripts/lib/tests/worktree-sync.test.js` | CREATE | atomic mv + race fixtures + missing source 처리 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta.dispatched_by_controller_session_id` / `meta.worker_dispatch_id` / `meta.ipc_envelope_path` 3 optional 필드 추가, regex validation, **`meta.controller_context_marker_present=true`일 때는 3개 모두 require** (Codex F2 absorption — total attribution loss 막음) |
| `plugins/mccp/scripts/receipt/tests/schema.test.js` | UPDATE | 신규 필드 validation 케이스 + 누락 OK 케이스 + 잘못된 형식 reject + **controller marker 존재 시 fail-closed 회귀** |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | **Codex F2 absorption** — `--dispatched-by-controller-session <id>` / `--worker-dispatch-id <id>` / `--ipc-envelope-path <path>` 3 신규 CLI flag. controller 환경 marker (env `MCCP_DISPATCH_CONTEXT=1` 또는 `.claude/state/dispatches/<id>.envelope.json` 존재) 감지 시 셋 다 require — 누락 시 receipt write fail-closed (exit 12). |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | `write` subcommand에 3 신규 flag forwarding. |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | **Codex F3 absorption** — receipt `meta.ipc_envelope_path` 존재 시 envelope file load → `dispatch_id == meta.worker_dispatch_id` 확인 + `receipts_added`에 자신 slug 포함 확인. 불일치/누락 시 `blocking[].kind="envelope-mismatch"`. |
| `plugins/mccp/scripts/receipt/tests/validate-cmd-envelope.test.js` | CREATE | envelope missing / dispatch_id mismatch / receipts_added 누락 / 정상 4-row 회귀 |
| `plugins/mccp/scripts/receipt/tests/write-controller-context.test.js` | CREATE | controller marker 존재 + 3 flag 전부 / 일부만 / 전부 누락 회귀 |
| `plugins/mccp/scripts/migrations/v1.2.0-dispatch-fields.js` | CREATE | additive migration, idempotent, dry-run, marker file 패턴 (v0.3.6 mirror) |
| `plugins/mccp/scripts/migrations/tests/v1.2.0-dispatch-fields.test.js` | CREATE | dry-run / 실제 실행 / resume after partial / idempotency |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | VALID_EVENTS에 `dispatch_started` / `dispatch_envelope_received` / `dispatch_chain_aborted` 3개 추가. patch field 화이트리스트에 `controller_session_id` / `active_dispatch_count` 추가 |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | 새 event + patch fields render/parse 회귀 |
| `CLAUDE.md` | UPDATE | §1.4 표에 `dispatch-controller (Stage 2 M1)` 행 추가 (status=ship). §4 cheat sheet에 `MCCP_ORCHESTRATOR_*` env 블록 추가. §1.2 dual-review 절에 controller-worker도 dual-review 보존됨을 1줄 명시. |
| `CHANGELOG.md` | UPDATE | v1.2.0-m1 row — foundation IPC + envelope schema + 3 new state events + additive receipt fields |
| `.claude/plans/v1-2-0-orchestrator-stage2-backlog.md` | UPDATE | M1 ship 후 §3 옵션 A 행에 `[shipped 2026-MM-DD via M1 PR #N]` 마커 추가. §2.1/2.3은 *해결됨*으로 transition. §2.2 pilot은 M2로 보존. §2.4 watcher 결정은 M1에서 hybrid로 확정 — 그 결정 인용. |

## Tasks

### Task 0: Worktree + branch + Stage 1 인수 항목 확인 (0.5hr)

- **Action**:
  1. `git worktree add -b v1.2.0-orchestrator-m1 .worktrees/v1.2.0-orchestrator main` (branch 신규 생성 + main HEAD `e0d2793` 기준). **Codex Implement-Codex R1 F1 absorption** — 기존 `git worktree add <path> <branch>` 형식은 branch가 이미 존재한다고 가정하므로 신규 생성에는 `-b` 필수.
  2. Stage 1 인수 항목 4-row checklist (backlog §4) 확인 — 그 중 `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN deprecation cycle 1회 경과`는 today=stage 1 ship day이므로 **NOT YET** — flag 보존 결정 명시.
  3. `MEMORY.md`의 `mccp-roadmap` 인덱스에 v1.2.0 entry 등록 (1줄: `- v1.2.0 Stage 2 M1 — foundation IPC, plan: .claude/plans/v1-2-0-orchestrator-controller-m1.plan.md`)
- **Mirror**: `.claude/plans/v1-1-0-orchestrator-s1-honest-handoff.plan.md` Task 0 패턴 (worktree + memory roll)
- **Validate**: `git worktree list`가 v1.2.0 entry 포함. `MEMORY.md`에 v1.2.0 인덱스 row 존재. `chain_aborted=false`.

### Task 1: Envelope schema (foundation) (1.5hr)

- **Action**:
  1. `docs/v1.2.0-orchestrator/envelope-schema.md` 작성 — 필수 필드: `schema_version` ("v1"), `dispatch_id` (UUID), `worker_subagent_type` (string), `worker_started_at` (ISO8601), `worker_ended_at` (ISO8601 \| null), `worker_exit_status` (enum: `pending`/`ok`/`failure`/`timeout`/`crashed` — **Codex Implement-Codex R1 F2 absorption**: `pending`은 controller의 placeholder write용 nonterminal state, worker가 markStatus로 terminal value로 전환. `pending` 일 때만 `worker_ended_at=null` 허용; terminal 일 때 non-null require), `receipts_added` (string[] of slugs), `findings` (object[] structured), `next_action` (string \| null).
  2. JSON Schema 작성 (별도 export from `dispatch-envelope.js`).
  3. envelope 위치 결정: `.claude/state/dispatches/<dispatch-id>.envelope.json` (STATE.md 옆 — lifecycle 명확함이 receipt chain 통합보다 우선).
  4. envelope에 controller가 inject할 attribution 필드 (`controller_session_id`, `parent_cwd`) — worker 가 envelope write 시 자동 echo.
- **Mirror**: `plugins/mccp/scripts/receipt/schema.js:1-100` validation 패턴 — `req()` helper + 필드별 regex/enum 화이트리스트
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/dispatch-envelope.test.js`가 PASS. 모든 enum / regex / nullable 케이스 회귀.

### Task 2: `lib/dispatch-envelope.js` 모듈 (1hr)

- **Action**:
  1. `validate(envelope) → { ok, errors[] }` — pure function, no fs.
  2. `read(envelopePath) → { ok, envelope, error }` + `write(envelopePath, envelope) → { ok, error }` — atomic rename 패턴 (`*.tmp` → `*.envelope.json`).
  3. `markStatus(envelopePath, status, opts) → { ok }` — worker-side helper that callers (workers) use to declare exit.
- **Mirror**: `plugins/mccp/scripts/state/state-writer.js`의 atomic rename + lock 패턴 (단, dispatch envelope는 worker 1명만 write — multi-writer race 없으므로 lock 불필요).
- **Validate**: test runner에서 atomic rename(partial write 후 crash 시 source `*.tmp`만 남고 `*.envelope.json`은 미생성)이 확인됨.

### Task 3: `lib/worktree-sync.js` (1.5hr)

- **Action**:
  1. `syncEnvelopeOut(workerWorktreePath, parentCwd, dispatchId) → { ok, envelopePath, error }` — worker worktree 안의 `.claude/state/dispatches/<dispatch-id>.envelope.json`을 parent의 같은 경로로 atomic mv. fs.renameSync는 cross-device에서 EXDEV — fallback에 copy+unlink.
  2. `cleanupWorktree(workerWorktreePath, action)` — `action ∈ {keep, remove}`. Agent tool의 worktree 자동 정리(no changes)가 envelope를 삭제하지 않도록 sync가 **반드시 cleanup 이전에** 실행됨을 보장.
  3. Race scenario: 2개 worker가 같은 dispatch_id 사용 시 두 번째 mv는 EEXIST — loud error.
- **Mirror**: `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` 의 rename + collision handling
- **Validate**: 1) 정상 sync, 2) cross-device fallback, 3) source 미존재 (case 3 timeout 시뮬), 4) dst 충돌 회귀.

### Task 4: `lib/dispatch-watcher.js` (2hr)

- **Action**:
  1. `watch({ envelopeDir, deadlineMs, onEvent }) → { stop() }` — Monitor 가용 platform (Linux/Mac inotify, Windows ReadDirectoryChangesW via Monitor tool wrapper)에서는 event-driven, fallback platform에서는 polling.
  2. detect 모드는 boot 시 정해짐 + receipt에 기록 (debugging).
  3. polling 간격은 env-var `MCCP_ORCHESTRATOR_POLL_MS` (default 500ms).
  4. deadlineMs 도달 시 `onEvent({ type: 'timeout', dispatchId })` emit + stop.
- **Mirror**: `plugins/mccp/scripts/lib/auto-chain.js`의 timeout + retry 패턴. Monitor tool wrapper는 신규 — 본 plan에서 첫 도입.
- **Validate**: 1) Monitor path emit 회귀 (fake monitor), 2) polling path 회귀, 3) timeout emit 회귀, 4) `stop()` idempotency.

### Task 5: `lib/dispatch-controller.js` core (2hr)

- **Action**:
  1. `prepareDispatch({ workers, pilotConfig }) → { dispatches[], envelopeDir }` — worker N명 분, 각 dispatch에 UUID 할당, worker prompt body 생성 (env propagation: `MCCP_RECEIPT_GATE_MODE` / `MCCP_ALLOW_CODEX_UNAVAILABLE` / `MCCP_CODEX_DISABLED` / `CLAUDE_PLUGIN_ROOT` 명시), envelope 초기 placeholder write — placeholder는 `worker_exit_status='pending'` + `worker_ended_at=null` (F2 absorption: schema-valid nonterminal state).
  2. `mergeEnvelopes(envelopes[]) → { receiptsAdded[], findings[], failedWorkers[] }` — pure function, no fs.
  3. **NOT** Agent tool을 직접 호출 — caller(slash command body)가 multi-`Agent` parallel call → 결과를 controller `mergeEnvelopes`로 주입. controller는 pure orchestration. 이유: Agent tool 호출은 conversation context에서만 가능, lib module에서는 tool call 불가.
- **Mirror**: `plugins/mccp/scripts/lib/work-orchestrator.js`의 inject-friendly 패턴 — `Agent`-call은 외부에 분리.
- **Validate**: test runner에서 prepareDispatch / mergeEnvelopes 두 함수가 fixture-based로 회귀.

### Task 6: Receipt schema 확장 + writer/CLI/validator wiring (Codex F2+F3 absorption) (2hr)

- **Action** (M1 plan은 schema-only가 위험하다는 Codex 지적 — writer/CLI + validator 동반):
  1. `plugins/mccp/scripts/receipt/schema.js` UPDATE — `meta` 객체에 4개 필드 추가:
     - `dispatched_by_controller_session_id` (string \| undefined, UUID 형식)
     - `worker_dispatch_id` (string \| undefined, UUID 형식)
     - `ipc_envelope_path` (string \| undefined, repo-relative path)
     - `controller_context_marker_present` (boolean \| undefined) — write 시점에 자동 stamp. 위 3개와 결합 invariant:
       - marker=false/undefined + 3 필드 모두 누락 → OK (기존 v0.2.x receipt)
       - marker=true → 3 필드 **모두 require** (Codex F2 absorption — total attribution loss 차단)
       - 일부만 있음 → reject (기존 all-or-nothing)
  2. `plugins/mccp/scripts/receipt/write.js` + `plugins/mccp/scripts/receipt/cli.js` UPDATE — 3 신규 flag (`--dispatched-by-controller-session` / `--worker-dispatch-id` / `--ipc-envelope-path`) + dispatch marker detection (env `MCCP_DISPATCH_CONTEXT=1` 또는 envelope file 존재 → marker=true 자동 stamp). marker=true인데 flag 누락 시 fail-closed (exit 12).
  3. `plugins/mccp/scripts/receipt/validate-cmd.js` UPDATE (Codex F3 absorption) — `meta.ipc_envelope_path` 존재 시 envelope load → dispatch_id / receipts_added 정합성 검증. mismatch/missing 시 `blocking[].kind="envelope-mismatch"` + 상세 message.
  4. test 추가 — 정상 / 누락 OK / 일부 reject / marker+flag 누락 reject / validate-cmd 4-row(envelope missing/dispatch_id mismatch/receipts_added 누락/정상).
- **Mirror**: `plugins/mccp/scripts/receipt/schema.js:9-25` 화이트리스트 + `plugins/mccp/scripts/receipt/validate-cmd.js` 의 `blocking[]` emit 패턴
- **Validate**: schema.test.js + validate-cmd-envelope.test.js + write-controller-context.test.js 3개 모두 PASS. v0.2.x 기존 receipt fixture(controller marker 없음)는 변경 없이 valid.

### Task 7: Migration `v1.2.0-dispatch-fields.js` (1hr)

- **Action**:
  1. additive migration — 기존 receipt를 **수정하지 않음**, 새 필드는 future-only. dry-run에서 `affected receipts: 0` 출력.
  2. marker file: `.claude/receipts/.migrations/v1.2.0-dispatch-fields.json` 작성 (state="complete", reason="additive, no-op for existing receipts").
  3. validate-cmd boot 시 auto-trigger? **NO** — additive라 trigger 불필요. /mccp:setup이 한 번만 marker 작성.
- **Mirror**: `plugins/mccp/scripts/migrations/v0.3.6-codex-scope-fields.js`의 idempotent + dry-run 패턴
- **Validate**: dry-run, 실제 실행, 두 번 실행(idempotent), v0.2.x receipt fixture에 영향 없음 회귀.

### Task 8: STATE.md state-writer 확장 (3 new events) (1hr)

- **Action**:
  1. `plugins/mccp/scripts/state/state-writer.js`의 VALID_EVENTS에 추가:
     - `dispatch_started` — controller가 `prepareDispatch` 직후 set
     - `dispatch_envelope_received` — watcher가 envelope read 성공 후 set
     - `dispatch_chain_aborted` — case 3/4/5 시 set (chain_aborted=true 동반)
  2. patch field 화이트리스트에 `controller_session_id` / `active_dispatch_count` 추가.
  3. unknown-event downgrade(→ `precompact`) 분기에서 새 event 3개 제외.
- **Mirror**: `state-writer.js:27-49` (v1.1.0 Stage 1 `resume_dispatching`/`resume_dispatched` 추가 패턴 재사용)
- **Validate**: state-writer.test.js에서 render/parse 회귀 + unknown-event 강등 안 됨 회귀.

### Task 9: Docs (architecture + envelope-schema + operator-runbook) (1.5hr)

- **Action**:
  1. `docs/v1.2.0-orchestrator/architecture.md` — Stage 2 Big Picture: controller boundary, IPC layer, receipt 재anchor, M1/M2/M3 scope.
  2. `docs/v1.2.0-orchestrator/envelope-schema.md` — Task 1에서 작성한 JSON Schema 정식 문서화 + transition matrix + 6-case lifecycle 매핑.
  3. `docs/v1.2.0-orchestrator/operator-runbook.md` — env vars, stuck dispatch 진단, GC 정책 (TTL 24h 기본), envelope 수동 inspection.
  4. CLAUDE.md §1.4 v0.2 자동 게이트 표에 `dispatch-controller (Stage 2 M1)` 행 추가. §4 cheat sheet에 `MCCP_ORCHESTRATOR_*` env 블록 추가.
  5. CHANGELOG.md v1.2.0-m1 row.
- **Mirror**: `docs/v0.2-architecture.md` 의 5-row 결정/근거/대안/거부 사유 패턴 + v1.1.0-orchestrator/spike-upstream-primitives.md 의 env-pin 패턴
- **Validate**: doc lint? — mccp는 markdownlint cycle 없음 (memory feedback-no-markdownlint-fix-cycle). 인용 링크 깨짐 없는지만 spot-check.

### Task 11: M1 fixture smoke — full-cycle 계약 검증 (Codex F1 absorption) (1hr)

- **Action**: Codex가 짚은 "caller-controller 계약이 unit-test에 없음" 흡수. **실제 Agent tool 호출 없는** fixture-driven smoke로 full-cycle 회귀:
  1. `plugins/mccp/scripts/lib/tests/dispatch-fullcycle-smoke.test.js` CREATE.
  2. 2명의 가짜 worker fixture(JSON envelope blob)을 `.claude/state/dispatches/<smoke-id>.envelope.json`에 직접 write → watcher emit → `mergeEnvelopes` → controller가 `receipts_added` aggregate. 시나리오 4-row: (1) 두 worker 모두 `ok`, (2) 1명 `failure`, (3) 1명 `timeout` (envelope 미작성 — watcher timeout emit), (4) 1명 envelope `worker_exit_status` 누락 (malformed).
  3. PR ship gate에 **fixture smoke 통과** 명시 — `prepareDispatch`/`mergeEnvelopes` unit이 green이어도 smoke가 red면 PR block.
- **Mirror**: `plugins/mccp/scripts/state/tests/state-injector.test.js` 의 atomic fixture write 패턴 + `plugins/mccp/scripts/lib/tests/escalate-detector.test.js` 의 scenario-table 패턴
- **Validate**: 4-row scenario 모두 PASS. real Agent tool 호출 없음 (M2의 pilot scope 침범 안 함).

### Task 12: Heartbeat + next-command 재clamation (Codex F4 absorption) (1.5hr)

- **Action**: Codex가 짚은 "controller crash → `dispatch_chain_aborted` write 불가" 흡수. controller 죽으면 자신의 죽음을 write 못함을 인정 + **다음 command가 reclaim**:
  1. `plugins/mccp/scripts/lib/dispatch-controller.js` UPDATE — `prepareDispatch` 시 `.claude/state/dispatches/<dispatch-id>.heartbeat` 작성 (body: `{controller_pid, started_at, ownership_token_hash, last_heartbeat_at}`). 25 step마다 mtime 갱신(in-loop, pr-phase-lock pattern).
  2. `plugins/mccp/scripts/lib/dispatch-controller.js` 에 `reclaimStale({ttlMs=300_000})` 함수 — 다음 command(또는 `/mccp:setup` boot, 또는 `validate-cmd` 진입) 시 호출: 모든 heartbeat 파일을 스캔 → `(controller_pid is dead via process.kill(pid,0)) OR (mtime > ttlMs)`이면 stale 판정 → envelope `worker_exit_status='crashed'` overwrite (atomic) + STATE.md `dispatch_chain_aborted` event emit (controller가 아닌 *reclaim caller*가 emit).
  3. `plugins/mccp/scripts/receipt/validate-cmd.js`의 boot path에 `reclaimStale()` 호출 — receipt 게이트 진입 전 stale dispatch 정리.
  4. test: 살아있는 controller(reclaim 안 함), 죽은 controller pid(reclaim), mtime > ttl(reclaim), host mismatch(보수적으로 reclaim 안 함 → mtime-only).
- **Mirror**: `plugins/mccp/scripts/lib/pr-phase-lock.js` host-aware tri-state policy + `plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js` reclaim 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/dispatch-controller.test.js`에 heartbeat/reclaim 6-case 회귀 포함.

### Task 10: backlog 상태 transition + STATE.md roll (0.5hr)

- **Action**:
  1. `.claude/plans/v1-2-0-orchestrator-stage2-backlog.md` UPDATE:
     - §3 옵션 A 행에 `[shipped 2026-MM-DD via M1 PR #N]` 마커
     - §2.1(IPC schema) — `해결: docs/v1.2.0-orchestrator/envelope-schema.md`
     - §2.3(6-case lifecycle) — case 1/2/3/4 해결, case 5/6은 M3로 deferral 명시
     - §2.4(polling vs event) — hybrid Monitor + polling 결정 인용
     - §2.2(pilot) — M2 보존, scope 변동 없음
  2. STATE.md `Last Decision` 갱신: v1.2.0-m1 ship 결정 인용.
- **Mirror**: 기존 v1.1.0-s1 plan의 §4 인수 항목 완료 표시 패턴
- **Validate**: backlog 본문이 *현재 사실*과 정합 (M2/M3 deferred 표시, M1 shipped 표시).

## Validation (M1 ship gate)

```bash
# 1. node native test runner — 신규 모듈 + 변경 모듈 전체
node --test plugins/mccp/scripts/lib/tests/dispatch-envelope.test.js \
            plugins/mccp/scripts/lib/tests/dispatch-watcher.test.js \
            plugins/mccp/scripts/lib/tests/dispatch-controller.test.js \
            plugins/mccp/scripts/lib/tests/dispatch-fullcycle-smoke.test.js \
            plugins/mccp/scripts/lib/tests/worktree-sync.test.js \
            plugins/mccp/scripts/receipt/tests/schema.test.js \
            plugins/mccp/scripts/receipt/tests/validate-cmd-envelope.test.js \
            plugins/mccp/scripts/receipt/tests/write-controller-context.test.js \
            plugins/mccp/scripts/state/tests/state-writer.test.js \
            plugins/mccp/scripts/migrations/tests/v1.2.0-dispatch-fields.test.js

# 2. 기존 receipt 회귀 — v0.2.x fixture가 새 schema에도 valid
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement

# 3. Migration dry-run — affected=0 (additive)
node plugins/mccp/scripts/migrations/v1.2.0-dispatch-fields.js --dry-run

# 4. 전체 test suite 회귀 — v1.1.0 Stage 1 ship 327/327 maintain
node --test plugins/mccp/scripts/

# 5. CLAUDE.md / CHANGELOG.md 갱신 확인
grep -q "dispatch-controller (Stage 2 M1)" CLAUDE.md
grep -q "v1.2.0-m1" CHANGELOG.md
```

## Out of Scope (deferred to Stage 2 backlog M2/M3)

- **M2 (pilot)**: `/mccp:code-review` PR mode의 perspective fanout 통합. `MCCP_ORCHESTRATOR_PILOT=pr-review-fanout` flag 도입. 측정: review wall-time, finding count, dual-review overlap ratio. M1 ship 후 1주 soak.
- **M3 (lifecycle hardening)**: 6-case 중 **case 6** (stale envelope GC, TTL 24h) 완전 구현. M2 dogfood에서 case 6 발생률 측정 후 우선순위 정함. *Note: case 5 (controller crash / orphan worker)는 Codex F4 absorption으로 M1 Task 12에 minimal 수준 포함됨 — 완전 hardening만 M3.*
- **Receipt → controller 재anchor 자동화**: 현재 worker가 spawn한 receipt를 controller가 chain에 흡수하는 메커니즘은 envelope의 `receipts_added` 필드로 *attribution only* + validate-cmd의 envelope load (Codex F3 absorption). 자동 chain re-link는 stage 3 이후.
- **Cross-platform Monitor**: Windows native inotify analog (`ReadDirectoryChangesW`)은 Monitor tool wrapper에 의존. Monitor 자체가 Windows에서 작동 안 하면 polling fallback이 정답 — M1은 그 fallback path를 default로 사용.
- **`session-spawner.js` 코드 제거**: deprecation cycle 1회 경과 후 stage 2 M2 또는 stage 3에서. M1 ship 시점에는 보존.
- **Real Agent tool E2E**: Task 11 fixture smoke는 real Agent 호출 없이 contract만 검증. 실제 multi-Agent parallel call은 M2 pilot에서.

## Risks (요약, Codex R1 absorption 후)

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| IPC schema 결정 지연 → 후속 task block | LOW | HIGH | Task 1을 첫 task로 배치. 1.5hr 안에 schema 미결정 시 stop + 사용자 컨펌. |
| Receipt 확장이 기존 v0.2.x receipt validation 실패 | LOW | HIGH | additive + marker-gated all-or-nothing. marker 없으면 기존 v0.2.x receipt 모두 그대로 valid. Task 6 test에 v0.2.x fixture 회귀 명시. **Codex F2 mitigation 적용됨.** |
| Worktree → main file-sync race / EXDEV | MEDIUM | HIGH | `worktree-sync.js`가 atomic mv + cross-device fallback. Task 3 test 4-row. |
| Controller-spawned worker가 attribution 누락 시 silent loss | LOW | HIGH | dispatch marker(`MCCP_DISPATCH_CONTEXT` 또는 envelope 파일) 감지 시 receipt writer fail-closed. **Codex F2 absorption: Task 6에 wiring 포함.** |
| Envelope이 validate-cmd 시야 밖에서 corrupt/missing | LOW | HIGH | `meta.ipc_envelope_path` 존재 시 validate-cmd가 envelope load + dispatch_id/receipts_added 정합성 검증. **Codex F3 absorption: Task 6 + new validate-cmd-envelope test.** |
| Controller crash → 자기 죽음 write 불가, orphan worker | LOW | HIGH | controller가 heartbeat write (in-loop mtime 갱신) + 다음 command(validate-cmd boot)에서 `reclaimStale()` 호출. host-aware tri-state. **Codex F4 absorption: Task 12.** |
| Caller↔controller 계약이 unit-test에 없음 (full-cycle 미회귀) | LOW | HIGH | fixture-driven full-cycle smoke (Task 11 — real Agent 호출 없이 envelope blob → watcher → mergeEnvelopes 4-row). **Codex F1 absorption.** PR ship gate에 명시. |
| Hybrid watcher cross-platform 불완전 (Windows Monitor inotify-equiv 미지원) | HIGH | MEDIUM | polling을 default fallback. boot 시 mode 결정 + envelope/STATE에 기록. |
| Stage 1 spawn flag와 동시 active 시 cost double count | LOW | LOW | controller dispatch는 auto-handoff signal emit 안 함. |
| pilot ROI 측정 안 됨 (M2 deferral) | LOW | LOW | M1 ship 후 즉시 측정 시작 — M2 plan에서 측정 baseline 기록. |
| Case 6 stale envelope (TTL 24h) M1에서 미해결 | MEDIUM | LOW | M3로 deferral 명시. M1에서는 reclaimStale의 ttlMs=5min default로 partial coverage. |

## Acceptance

### Session 1 partial ship gate (Task 0+1 only — Codex Implement-Codex R1 F3 absorption)

본 plan은 Task 0~12 ship 시점에 full M1 acceptance gate를 통과해야 한다. 단, 첫 implement session에서는 Task 0+1만 land하므로 **이 세션은 다음의 partial gate만 적용**한다:

- [ ] Task 0 완료 — worktree `.worktrees/v1.2.0-orchestrator` + branch `v1.2.0-orchestrator-m1` 생성 (Codex R1 F1 absorption: `-b` 플래그 사용)
- [ ] Task 1 완료 — `docs/v1.2.0-orchestrator/envelope-schema.md` + `plugins/mccp/scripts/lib/dispatch-envelope.js` 의 `JSON_SCHEMA` constant export
- [ ] Task 1 validate — `node --test plugins/mccp/scripts/lib/tests/dispatch-envelope.test.js` PASS (enum / regex / nullable / `pending` nonterminal transition 회귀 포함)
- [ ] MEMORY.md `mccp-roadmap` 인덱스에 v1.2.0 entry 1줄 등록
- [ ] **NOT** required (full M1 gate에서만): watcher/controller/worktree-sync/full-cycle smoke/receipt schema extension/migration/state-writer events/heartbeat/backlog roll 테스트와 CLAUDE.md/CHANGELOG.md 갱신은 Task 2~12 후속 세션에서 처리

### Full M1 ship gate (Task 0~12 all)

- [ ] Task 0-12 모두 완료 (Task 11/12는 Codex R1 absorption — F1+F4)
- [ ] Validation 5단계 모두 통과 (특히 fixture smoke 4-row)
- [ ] PR body에 `Codex review (R1+R1-absorption)` + `Receipt chain: mccp-plan-codex → mccp-implement-codex → mccp-pr-codex` 명시
- [ ] CLAUDE.md / CHANGELOG.md / backlog 모두 일관 상태
- [ ] M2/M3 deferral 명시 (사용자 surprise 방지)
- [ ] Patterns mirrored, not reinvented — `pr-phase-lock.js` / `state-writer.js` / `v0.3.6-codex-scope-fields.js` 3개 source 인용
- [ ] **Codex F1 absorption**: fixture full-cycle smoke가 caller↔controller contract 4-row 회귀 통과
- [ ] **Codex F2 absorption**: dispatch marker 있는 상태에서 controller attribution 3 필드 누락 시 receipt write fail-closed 회귀
- [ ] **Codex F3 absorption**: `meta.ipc_envelope_path` 존재 시 validate-cmd가 envelope mismatch를 `blocking[]`로 emit 회귀
- [ ] **Codex F4 absorption**: heartbeat reclaim host-aware tri-state 4-case 회귀

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.1.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (R1 only — 4 HIGH 모두 ACCEPT_NOW로 plan body absorbed → R2 escalate 불필요)
- 합치 결론: **needs-attention → absorbed**. Codex R1이 IPC contract의 silent-failure surface 4개를 짚었고, 4개 모두 plan에 mechanical change로 흡수됨 (Task 11/12 추가 + Task 6 확장 + Risks/Acceptance 갱신). M1 scope가 1-1.5hr 증가했으나 ship-and-rework 위험을 즉시 제거.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 Controller/caller split has no full-cycle ship gate | HIGH | ACCEPT_NOW | unit-test green + 실제 caller integration이 M2 deferral → "ship-then-rework" risk. fixture-driven smoke로 real Agent 호출 없이 4-row 검증 가능 → M1 scope 침범 최소. Task 11 신설. |
  | F2 Controller receipt attribution can silently disappear | HIGH | ACCEPT_NOW | schema-only 변경은 writer가 동반 안 되면 무용. dispatch marker + writer fail-closed로 silent total loss 차단. Task 6에 writer/CLI wiring 추가. |
  | F3 Dispatch envelopes outside receipt validator's visibility | HIGH | ACCEPT_NOW | namespace 분리 유지하되 validate-cmd를 envelope-aware로 확장이 더 surgical (Option A — envelope 이동은 lifecycle 결정 번복). Task 6에 validate-cmd 확장 추가. |
  | F4 Controller-crash abort state is not actually writeable | HIGH | ACCEPT_NOW | 죽은 controller가 자기 죽음 write 못함은 self-evident. heartbeat + next-command reclaim은 pr-phase-lock.js 패턴 재사용 → 1.5hr scope. Task 12 신설. M3는 case 6 GC만 보존. |

- Deferred to backlog: 0 (모두 R1에 absorb됨)
- Open Questions: 없음 — 4 HIGH 모두 ACCEPT_NOW + plan absorbed. CRITICAL 없음.
- Codex session 참조: threadId `019eceb2-9d86-7901-9247-c692bfd38930` (durationMs=192839, classification=ok, blocking=false)

## Codex Implementation Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.1.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2) + `--impeccable-available` (impeccable Skill 가용 검출, v0.3.6 design scope split honored)
- 라운드 수: 1 (R1 only — 3 HIGH 모두 ACCEPT_NOW로 plan body absorbed → R2 escalate 불필요)
- 합치 결론: **needs-attention → absorbed**. Implement-Codex가 Plan-Codex가 못 잡은 narrow scope의 silent-failure surface 3개를 짚었고, 셋 다 mechanical 흡수 가능 — F1(worktree command CLI 결함) + F2(envelope schema의 nonterminal state 부재) + F3(ship gate가 partial scope와 충돌)는 모두 plan body 직접 수정으로 완전 해소. Task 0+1 scope 침범 없음.
- 본 세션 implement scope: **Task 0 + Task 1만**. Task 2~12는 다음 세션 (다음 진입은 동일 plan 파일로 `/mccp:prp-implement` 재호출).
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 Worktree command does not create the target branch (confidence 0.94) | HIGH | ACCEPT_NOW | `git worktree add <path> <branch>` 형식은 branch가 이미 존재한다고 가정. 신규 생성에는 `-b` 필수. 미흡수 시 Task 0가 첫 명령에서 fail. plan line 66 mechanical 1-line 수정으로 완전 해소 — defer 이득 없음. |
  | F2 Envelope schema has no nonterminal state for placeholders (confidence 0.88) | HIGH | ACCEPT_NOW | `worker_exit_status` enum이 terminal-only. Task 5(controller)가 placeholder write 시 schema reject 또는 거짓 terminal lie. `pending` 1개 enum value 추가가 가장 적은 surface change. Task 2~5가 이 schema에 wire되기 전이 retrofit 최소 비용 — 지금 흡수. |
  | F3 Ship gate still requires deferred Tasks 2-12 (confidence 0.96) | HIGH | ACCEPT_NOW | Acceptance가 "Task 0-12 모두 완료"인데 본 세션은 Task 0+1만 — 완료 불가 상태로 끝남. Session 1 partial ship gate subsection 추가로 framing 분리. Full M1 gate는 그대로 보존. |

- Deferred to backlog: 0 (모두 R1에 absorb됨)
- Open Questions: 없음 — 3 HIGH 모두 ACCEPT_NOW + plan absorbed. CRITICAL 없음 (auto-CRITICAL catalog 매칭 0건). Security-reviewer skip (auth/crypto/secrets/input-validation 도메인 아님 — IPC envelope file I/O는 cwd 경계 내 atomic rename). impeccable design gate skip silently (skill_available=true + design_signal=false — UI 변경 없음).
- Codex session 참조: threadId `019eced3-cce9-7be3-81a1-c8a5c30a27fe` (durationMs=506834, classification=ok, blocking=false, advisory=false)

