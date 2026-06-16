# v1.2.0 Orchestrator Stage 2 — Backlog

> Stage 2 의 사전 작업 backlog. v1.1.0 stage 1 의 spike(Task 0) 결과를 인용하고, *알아야 다음을 정할 수 있는* open question 을 한 곳에 모은다. Stage 1 ship 후 `/mccp:plan-prd v1.2.0-orchestrator-controller` (또는 spike 결과에 따라 `/mccp:plan-prd v1.2.0-batch-adapter`) 진입점이 됨.

**Roadmap entry**: memory `mccp-roadmap` 인덱스에서 `v1.2.0 → stage 2 backlog 참조` 1줄로 등록.

---

## 1. Spike findings (from stage 1 Task 0)

원본 evidence + 환경 pin: [`docs/v1.1.0-orchestrator/spike-upstream-primitives.md`](../../docs/v1.1.0-orchestrator/spike-upstream-primitives.md).

### 4-AND predicate 결과: **FAIL** (Q1 PARTIAL + Q4 NO)

| Q | 질문 (요약) | 답 | Stage 2 implication |
|---|---|---|---|
| Q1 | Subagent reads/writes parent's `.claude/receipts/*/` ? | **PARTIAL** — default mode YES, `isolation: "worktree"` mode NO | worker → controller receipt 전달은 explicit IPC 채널 필수 (worktree-isolated 모드를 default로 쓰려면). User Q3=B (receipt schema 확장) 결정이 load-bearing. |
| Q2 | `/batch` worktree spawn이 `claude` PATH 의존성 회피 ? | **YES** — `Agent` (with `isolation: "worktree"`) and `EnterWorktree` operate in-process. No `claude` binary spawn. | Stage 1의 `session-spawner.spawn()` quarantine 결정이 stage 2 controller에 자연 흡수됨 — controller는 `Agent` tool 또는 `EnterWorktree`로 worker spawn. PATH 의존성 사라짐. |
| Q3 | Cross-vendor (Codex) 호출이 subagent 안에서 작동 ? | **YES, with caveats** — general-purpose subagent has Bash. `MCCP_*` env vars + plugin cache path는 subagent prompt에 explicit 전달 필요. | Dual-review 철학 보존됨. Stage 2 controller는 `MCCP_RECEIPT_GATE_MODE` 등을 worker prompt body에 inject. |
| Q4 | fork/batch return 형식이 structured-and-receipt-compatible ? | **NO** — text-only return per `Agent` tool description. JSON envelope 강제 안 됨. | Worker → controller IPC를 filesystem (`/.claude/state/<dispatch-id>.handoff.json`) 으로 우회 필수. Worker가 receipt + structured envelope를 write하면, controller가 Agent 결과 text return 무시하고 envelope를 read. |

### 결정적 implications

1. **Controller spawn primitive**: `Agent` tool (with `subagent_type: "general-purpose"` + `isolation: "worktree"`) 채택. EnterWorktree는 single-session worktree만 지원 → controller는 multi-worker concurrent fanout이 목표이므로 `Agent` parallel calls 사용.
2. **Receipt IPC channel**: filesystem 기반. Worker가 worktree-internal에 receipt + handoff envelope 작성 → controller가 worker 종료 후 envelope를 parent CWD로 sync (worktree → main file-sync protocol 필요).
3. **Stage 1 quarantine 정당화**: `session-spawner.spawn()` PATH 의존성 문제는 stage 2 controller에서 자연 해결됨. Stage 1의 `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN` flag는 deprecation 1 cycle 유예용으로만 존속.

---

## 2. Open architectural questions

### 2.1 Worker IPC schema (Q3=B 확정, schema 미정) — **해결: v1.2.0-m1 ship**

User alignment Q3=B = "receipt schema를 확장해 worker 출력을 carry". 결정됨. M1 ship에서 다음 결정 확정:

- **Envelope 위치**: `<parent_cwd>/.claude/state/dispatches/<uuid>.envelope.json` — STATE.md 옆 (lifecycle clarity 우선, receipt chain 통합보다). 정식 문서: [`docs/v1.2.0-orchestrator/envelope-schema.md`](../../docs/v1.2.0-orchestrator/envelope-schema.md).
- **Worker → controller atomic write protocol**: `lib/worktree-sync.js`의 `syncEnvelopeOut(worktree, parentCwd, dispatchId)` — atomic rename + EXDEV cross-device fallback. `cleanupWorktree(action='keep'|'remove')` 별도 함수로 worktree 정리 분리.
- **Envelope 필수 필드 (확정)**: `schema_version`, `dispatch_id` (UUID), `worker_subagent_type`, `worker_started_at`, `worker_ended_at` (nullable when pending), `worker_exit_status` ∈ `pending` (nonterminal) ∪ `ok` / `failure` / `timeout` / `crashed` (terminal), `receipts_added`, `findings`, `next_action`, `controller_session_id`, `parent_cwd`. Codex Implement-Codex F2 absorption: `pending` nonterminal state 추가.
- **Receipt attribution surface (확정)**: 기존 receipt schema에 `meta.*` 4 field 추가 (`controller_context_marker_present`, `dispatched_by_controller_session_id`, `worker_dispatch_id`, `ipc_envelope_path`) — marker-gated all-or-nothing invariant. 별도 gate type 신설하지 않음 (기존 mccp-*-codex receipt가 attribution 보유).

### 2.2 Pilot workflow (Q4=i 확정, scope 미정)

User alignment Q4=i = "multi-axis review를 첫 vertical로 dogfood". 첫 pilot 후보:

- **Option A**: PR review (`/mccp:code-review` PR mode)의 perspective fanout. 현재 일반 reviewer 1개로 처리 → controller가 typescript-reviewer + security-reviewer + python-reviewer를 parallel fanout, findings merge. *적합도: 높음*. 이미 perspective 다양성이 본질적인 작업.
- **Option B**: Plan-codex R1 review를 정/반/통합 3-axis로 split. plan을 3개 worker에 fanout → 각각 다른 lens (security / DX / performance) → controller가 merge. *적합도: 중간*. 현재 R1이 효율적이라 controller overhead가 정당화될지 미지수.
- **Option C**: Stop-loop의 `lint → typecheck → test → e2e`를 controller fanout. *적합도: 낮음*. 이미 직렬화가 빠른 작업.

권장: Option A부터 시작 — PR review fanout. 측정: review 시간 + finding 양 + dual-review와의 overlap.

### 2.3 Worker lifecycle — 6 case catalogue — **부분 해결: case 1-4 v1.2.0-m1, case 5 partial M1 + full M3, case 6 deferred M3**

| # | Case | Controller 감지 방법 | Envelope state | M1 ship 상태 |
|---|---|---|---|---|
| 1 | **Graceful exit** — `ok` | watcher emit + envelope read | `ok` | ✓ 완료 |
| 2 | **Explicit failure** — `failure` | watcher emit + envelope read | `failure` | ✓ 완료 |
| 3 | **Timeout** — envelope 미작성 | watcher deadlineMs hit → `{type:'timeout'}` emit | (missing) | ✓ 완료 (watcher) |
| 4 | **Crash** — partial envelope | watcher emit + `mergeEnvelopes` guards malformed | (partial) | ✓ 완료 (smoke fixture D) |
| 5 | **Orphan on controller crash** | heartbeat mtime + `reclaimStale` host-aware tri-state | (alive but no consumer) | ⚠ partial (M1 ttlMs=5min default), 완전 hardening M3 |
| 6 | **Garbage cleanup** — N hour stale envelope | (M3) | (any) | — deferred M3 (24h TTL 미정, M2 dogfood로 우선순위 결정) |

Case 5: M1은 heartbeat-based `reclaimStale`이 minimum coverage. controller가 죽으면 다음 command(`validate-cmd.js` boot)에서 reclaim. Full hardening (heartbeat in-loop refresh의 caller 책임 boundary + retry policy)은 M3.

### 2.4 Controller polling vs event-driven — **해결: v1.2.0-m1 ship**

권장대로 **Hybrid** 채택. `lib/dispatch-watcher.js`가 `fs.watch` (Monitor) + `setInterval` polling을 동시에 사용. Polling은 binding(cross-platform always-on safety net), `fs.watch`는 opportunistic latency reducer. `MCCP_ORCHESTRATOR_POLL_MS` env (default 500ms) override. Windows native inotify analog (`ReadDirectoryChangesW`)은 M2 watcher hardening에서 검토 — polling fallback이 correctness 보장하므로 현재 차단 없음.

---

## 3. Next entry

Stage 2 진입점은 spike 결과 (Q2=YES, controller가 upstream Agent로 build 가능) 와 IPC schema 결정이 driver. 두 후보:

### 옵션 A — `/mccp:plan-prd v1.2.0-orchestrator-controller` — **[shipped 2026-06-16 via M1 PR (pending)]**

- **When**: IPC schema가 결정 가능하고 controller dispatcher 자체 구현이 의미 있다고 판단되면.
- **Scope**: controller dispatcher 모듈 (`lib/dispatch-controller.js`), envelope schema, dispatch-watcher hybrid, pilot workflow = PR review fanout.
- **Risk**: Controller가 `Agent` tool wrapper와 너무 비슷해져서 ROI 약화 가능.
- **M1 ship 상태 (2026-06-16)**: foundation IPC만 ship. M1 scope = envelope schema + 4-module lib + receipt 확장 + migration + state-writer + docs + heartbeat reclaim. **Pilot vertical (M2) + 6-case lifecycle 완전 hardening (M3) deferred** — M2 dogfood 측정 후 우선순위 정함.

### 옵션 B — `/mccp:plan-prd v1.2.0-batch-adapter`

- **When**: spike Q4=NO가 *fatal* 로 판단되어 native batch primitive 등장까지 wait가 합리적이면.
- **Scope**: `Agent` tool 위에 얇은 adapter (`lib/batch-adapter.js`). receipt envelope만 정의 + worker prompt convention. dispatcher는 미구현.
- **Risk**: Stage 2 의 핵심 가치 (controller orchestration) 가 다음 stage로 미뤄짐.

### 권장 — 옵션 A

Q2=YES + Q3=YES 가 controller 자체 구현의 기술 가능성을 입증함. Q1 + Q4 의 partial/no 가 IPC layer를 정당화. 옵션 B 는 layer 회피인데, IPC schema 자체가 stage 2 의 핵심 contribution.

---

## 4. Stage 1 → Stage 2 인수 항목

Stage 1 PR (#?) merge 후 stage 2 plan-prd 시작 전 확인:

- [ ] [`docs/v1.1.0-orchestrator/spike-upstream-primitives.md`](../../docs/v1.1.0-orchestrator/spike-upstream-primitives.md) 가 main에 있음 (stage 2 plan-prd 가 인용함)
- [ ] `state-resumption.js` + `/mccp:resume` 가 main 에 있음 (stage 2 controller 가 STATE.md 의 resume_* event 를 신호로 사용 가능)
- [ ] `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN` deprecation cycle 1회 경과 — 사용자가 옵션 제거에 동의 하면 stage 2 cleanup 으로 `spawn` mode 자체 제거
- [ ] [Roadmap memory](mccp-roadmap.md) 에 v1.2.0 entry 등록됨
