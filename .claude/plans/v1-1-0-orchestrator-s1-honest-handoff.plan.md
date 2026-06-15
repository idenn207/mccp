# Plan: v1.1.0 Orchestrator — Stage 1 (Honest Auto-Handoff + Upstream Primitive Spike)

**Source**: `/mccp:plan` conversational invocation (alignment achieved via Phase 1-2 critique → user Q1-Q5 answers in this session)
**Selected Milestone**: v1.1.0 Orchestrator philosophy — Stage 1 (cleanup + reconnaissance)
**Complexity**: Medium
**Worktree**: `.worktrees/v1.1.0-orchestrator-s1`
**Branch**: `v1.1.0-orchestrator-s1` (off main)

## Summary

mccp의 새 philosophy "central management orchestrator" (controller → worker session 분리 → 결과 흡수 → 피드백) 도입을 위한 **stage 1**. 두 가지를 한 PR로 합칩니다:

1. **Honest auto-handoff 정리** — 현재 auto-handoff layer는 `MCCP_AUTO_HANDOFF=spawn`이 IDE-launched Windows 환경에서 영원히 fallback되고, default `notify` 모드는 STATE.md write + stderr 배너만 하고 끝. 이름이 동작과 안 맞고, resume entry point가 부재. 이 cleanup이 stage 2의 *정직한 baseline*이 됨.
2. **Upstream primitive spike** — Claude Code 2.x의 `/fork` / `/batch` / `/tasks` / `/background`이 central management의 80%를 이미 제공할 가능성이 큼. 1-2시간 spike로 평가 후 stage 2 architecture를 *그 위에* 얹을지, *mccp 자체 dispatcher*를 만들지 결정.

**Out of scope (Stage 2)**: controller dispatcher 코드, worker IPC schema, multi-axis review 구현, 새 receipt gate. 별도 worktree + 별도 plan.

**User alignment (this session)**: Q1=분리, Q2=spike 먼저, Q3=receipt schema 확장 (B), Q4=multi-axis review pilot (i), Q5=auto-handoff 단기 honest화 후 stage 2에서 controller에 흡수.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Env-var parsing | `plugins/mccp/scripts/state/session-spawner.js:59-63` | `modeFromEnv(env)` — `MODES` whitelist + default fallback |
| Mode degradation | `plugins/mccp/scripts/state/session-spawner.js:240-254` | 명시적 `fallbackReason` enum + `loudStderr()` 동반 |
| Slash command body | `plugins/mccp/commands/work.md` | trivial/full 분기 휴리스틱, 입력 모드 표, hook 노이즈 안내 |
| Pure helper module | `plugins/mccp/scripts/lib/work-orchestrator.js` | inject-friendly signature, no fs side-effect in core |
| Test runner | `plugins/mccp/scripts/hooks/tests/auto-handoff.test.js` | node native `--test` + `spawnImpl`/`claudeAvailable` injection |
| Docs cheat sheet 행 | `CLAUDE.md §4` 운영 토글 블록 | env var = value 형식 + 상태 marker (live / opt-in / LLM-observed) |
| Evidence-backed spike doc | `docs/v0.2-architecture.md` | 결정/근거/대안/거부 사유 4-row 패턴 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `docs/v1.1.0-orchestrator/spike-upstream-primitives.md` | CREATE | Task 0 산출물 — `/fork` · `/batch` · `/tasks` · `/background` 평가 결과 |
| `plugins/mccp/scripts/state/session-spawner.js` | UPDATE | `spawn` 모드 분기를 `env.MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN === '1'`로 좁힘 |
| `plugins/mccp/scripts/hooks/auto-handoff.js` | UPDATE | telemetry에 `experimental_spawn_requested` 필드 + deprecation marker |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | **F2 absorption** — fixed event set에 `resume_dispatching` / `resume_dispatched` 추가, patch field 화이트리스트에 `dispatch_id` / `dispatch_id_completed` / `dispatch_attempt_count` / `clearHandoff` 추가, render/parse 지원, unknown-event downgrade(→ `precompact`) 분기에서 제외 |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | **F2 absorption** — 새 event/patch fields render/parse 회귀 |
| `plugins/mccp/commands/resume.md` | CREATE | `/mccp:resume` slash command — STATE.md `next_chunk` 읽고 phase로 dispatch |
| `plugins/mccp/scripts/lib/state-resumption.js` | CREATE | pure module: `dispatch(state) → { command, args, reason, shouldClearOnSuccess, dispatchId, attemptCount }` (F1 absorption — shouldClear → shouldClearOnSuccess semantic shift) |
| `plugins/mccp/scripts/lib/tests/state-resumption.test.js` | CREATE | 6-row dispatch table + malformed state + idempotency + **F1 failure-window 회귀** + **F1 attempt_count overflow → `resume_giveup` 회귀** + **F1 handoff signal preservation 회귀** |
| `plugins/mccp/scripts/hooks/tests/auto-handoff.test.js` | UPDATE | experimental flag 없는 `spawn` → `notify` 강등 케이스 추가 |
| `CLAUDE.md` | UPDATE | §1.3 chain diagram에 `/mccp:resume` 추가, §1.4 auto-handoff 행 정직화, §4 cheat sheet 갱신 |
| `docs/v0.2-architecture.md` | UPDATE | §7 STATE.md continuity 절 마지막에 *"resume entry point는 v1.1.0-orchestrator-s1에서 도입됨"* 한 줄 addendum |
| `.claude/plans/v1-2-0-orchestrator-stage2-backlog.md` | CREATE | Stage 2 seed — spike 결과 인용, open questions, 차기 plan-prd 진입점 |

## Tasks

### Task 0: Spike — upstream primitive 평가 (1-2hr, no production code)

- **Action**: 별도 test session에서 `/fork`, `/batch`, `/tasks`, `/background` 직접 invoke. 다음 4개 질문에 verifiable evidence (실행 출력 sample 첨부)로 답함:
  1. `/fork`된 subagent가 부모의 `.claude/receipts/*/`를 read/write할 수 있는가?
  2. `/batch`의 worktree spawn이 `claude` PATH 의존성을 회피하는가? (현 session-spawner의 ENOENT 문제 해결 가능?)
  3. fork/batch 안에서 cross-vendor (Codex) 호출이 작동하는가? (= dual-review 철학 유지 가능?)
  4. fork/batch 산출물이 parent conversation으로 return되는 형식은? (text / JSON / structured object)
- **Mirror**: `docs/v0.2-architecture.md` 의 evidence-backed 4-row 패턴
- **Validate**: `docs/v1.1.0-orchestrator/spike-upstream-primitives.md`가 4개 질문 모두 Y/N + evidence 포함. PASS 기준: 모든 답이 *guess가 아니라 실측*.

### Task 1: session-spawner spawn 모드 quarantine

- **Action**: `session-spawner.spawn()`의 `requestedMode === 'spawn'` 분기 조건을 `requestedMode === 'spawn' && env.MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN === '1'`로 좁힘. flag 없이 `spawn` 요청 시 `effectiveMode='notify'`, `fallbackReason='spawn-experimental-flag-missing'`로 명시적 강등. 기존 `FALLBACK` enum에 새 entry 추가.
- **Mirror**: `session-spawner.js:240-243` claudeCheck() 강등 패턴
- **Validate**: `node --test plugins/mccp/scripts/hooks/tests/auto-handoff.test.js` — 새 케이스 1개 추가, 기존 회귀 0건

### Task 2: `/mccp:resume` slash command

- **Prerequisite (F2 absorption — state-writer scope expansion)**: Task 2 본 body 진입 전, [Task 1.5: state-writer schema 확장](#task-15-state-writer-schema-확장-f2-prerequisite) 완료 + `state-writer.test.js` 회귀 PASS 필수. 미완료 상태에서 Task 2 진행 시 `state-writer.update({ event: 'resume_dispatching', ... })`이 unknown-event downgrade(→ `precompact`) 분기에 빠져 in-flight marker가 영구 유실됨.
- **Action**: `plugins/mccp/commands/resume.md` 신규. body 흐름 (**2-phase atomic dispatch + success-only clear — F1+F2 absorbed**):
  1. `state-writer.readState(root)` → state
  2. `state-resumption.dispatch(state)` → `{ command, args, reason, shouldClearOnSuccess, dispatchId, attemptCount }` (신규 dispatchId는 `crypto.randomUUID()`; `state.last_event === 'resume_dispatching'`이면 state의 기존 `dispatch_id` 재사용)
  3. `command === 'noop'`이면 *"resume할 handoff 신호 없음"* 메시지 + 종료
  4. `command === 'in-flight'` (= `last_event === 'resume_dispatching'` AND `attemptCount < 3`)이면 *"resume이 이미 dispatch 중 (dispatch_id: …, attempt: <n>/3)"* 경고 + 종료 — re-entry 가드
  5. `command === 'resume_giveup'` (= `last_event === 'resume_dispatching'` AND `attemptCount >= 3`)이면 *"resume이 3회 실패 — manual recovery 필요. `fix-task.md` 또는 STATE.md handoff 신호 직접 검토. clear 후 재시도하려면 STATE.md의 `last_event`/`dispatch_attempt_count` 수동 reset."* 메시지 + 종료. **handoff_spawn 신호는 그대로 보존** (자동 clear 금지 — 사용자 의도 확인 필수).
  6. **invoke 전** atomic 1st phase: `state-writer.update(root, { event: 'resume_dispatching', dispatch_id: <dispatchId>, dispatch_attempt_count: <attemptCount + 1> })`. **`clearHandoff`는 명시적으로 false** (handoff_spawn 신호 보존 — F1 absorption 핵심). resume_dispatching marker만 기록 → 다음 invocation 가드 활성.
  7. 사용자에게 *"resume → `<command> <args>` (reason: `<reason>`, dispatch_id: `<dispatchId>`, attempt: `<n>/3`)"* 한 줄 안내 + 해당 command 호출
  8. **success 분기 한정** atomic 2nd phase: 후속 command가 *success receipt 발행* (= 후속 command가 `mccp-*-codex/<slug>.json`을 write했음을 `receipt-validate` readback으로 확인) 했을 때만 `state-writer.update(root, { event: 'resume_dispatched', dispatch_id_completed: <dispatchId>, clearHandoff: <shouldClearOnSuccess> })`. **실패/timeout/exception 분기는 2nd phase 실행 안 함** → STATE.md는 `resume_dispatching` + `dispatch_attempt_count = n+1` 상태로 유지, handoff_spawn 신호도 유지. 다음 `/mccp:resume` invocation은 dispatch table이 attempt_count 기준으로 `in-flight` 또는 `resume_giveup`으로 자동 분기.
- **Mirror**: `plugins/mccp/commands/work.md` 슬래시 명령 구조 + `state-injector` 패턴
- **Validate**: 수동 — fixtures 6종 STATE.md (graceful + critical with fix-task + critical no fix-task + no handoff + **resume_dispatching attempt=1** + **resume_dispatching attempt=3**) 만들어 `/mccp:resume`이 각각 올바른 분기. 추가로 success/failure/timeout step 8 분기 manual run.

### Task 1.5: state-writer schema 확장 (F2 prerequisite)

- **Action**: `plugins/mccp/scripts/state/state-writer.js`:
  - `ALLOWED_EVENTS` set에 `resume_dispatching`, `resume_dispatched` 추가
  - `ALLOWED_PATCH_FIELDS` (또는 동등 화이트리스트)에 `dispatch_id`, `dispatch_id_completed`, `dispatch_attempt_count`, `clearHandoff` 추가
  - render layer가 위 4개 field를 frontmatter에 emit, parse layer가 read 가능
  - unknown-event downgrade 분기 (현 동작: → `precompact`)에서 신규 event 2개를 명시적으로 제외
  - `clearHandoff === true` 시 `handoff_spawn` 신호 (= 관련 frontmatter field) clear, false 시 보존
- **Mirror**: 기존 event handling 패턴 (현 state-writer.js의 `ALLOWED_EVENTS` 정의 라인)
- **Validate**: `node --test plugins/mccp/scripts/state/tests/state-writer.test.js` — 새 event 2개 round-trip + 4개 patch field round-trip + unknown-event downgrade가 신규 event 무영향 + `clearHandoff=true/false` 분기 회귀 + 기존 회귀 0건

### Task 3: `state-resumption.js` 헬퍼 모듈

- **Action**: pure module. signature: `dispatch(state) → { command, args, reason, shouldClearOnSuccess, dispatchId, attemptCount }`. dispatch 표 (**F1 absorption**: column `shouldClear` → `shouldClearOnSuccess` — 1st phase는 절대 clear 안 함, 2nd phase success 분기에서만 clear):

  | `state.last_event` | `unsafe_checkpoint` | fix-task pending | `dispatch_attempt_count` | output.command | output.args | shouldClearOnSuccess |
  |---|---|---|---|---|---|---|
  | `handoff_spawn` | `false` | * | (n/a) | `/mccp:work` | `--resume task=<fingerprint>` | `true` |
  | `handoff_spawn` | `true` | `true` | (n/a) | `/mccp:prp-implement` | `--apply-fix-task` | `true` |
  | `handoff_spawn` | `true` | `false` | (n/a) | `/mccp:work` | `--resume --unsafe-checkpoint task=<fingerprint>` | `true` |
  | `resume_dispatching` | * | * | `< 3` | `in-flight` | (n/a — re-entry 가드) | `false` |
  | `resume_dispatching` | * | * | `>= 3` | `resume_giveup` | (n/a — manual recovery 안내, handoff 보존) | `false` |
  | anything else (incl. `resume_dispatched`) | * | * | (n/a) | `noop` | (n/a) | `false` |
- **Mirror**: `plugins/mccp/scripts/lib/work-orchestrator.js` triage 분기
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/state-resumption.test.js` — 위 6 row + malformed frontmatter graceful (no throw) + idempotency (`resume_dispatched`이면 noop) + **failure-window 회귀** (`resume_dispatching` + attempt < 3 → `in-flight`, attempt >= 3 → `resume_giveup`, **F1 absorbed**) + **handoff signal preservation 회귀** (1st phase는 handoff 보존, 2nd phase success 한정 clear — `shouldClearOnSuccess` semantic test)

### Task 4: CLAUDE.md + docs 동기화

- **Action**:
  - CLAUDE.md §1.3 chain diagram에 `/mccp:resume`를 trivial path 위 alternate entry로 표시 (`/mccp:work`와 동급, but STATE.md 신호 시 자동 trigger 권장 메모)
  - §1.4 Auto-handoff 행 description을 *정직하게* 수정 — *"cost-tier 알림자. spawn 모드는 experimental flag opt-in (`MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1`). default notify는 STATE.md write + stderr 배너 + `/mccp:resume`로 후속 진행."*
  - §4 cheat sheet:
    - `MCCP_AUTO_HANDOFF=off|notify|spawn` → `MCCP_AUTO_HANDOFF=off|notify` (default notify)
    - 새 라인 추가: `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1  # v1.1.0+ opt-in. PATH에 claude binary 필요. 미설정 시 spawn 요청은 notify로 강등됨.`
  - docs/v0.2-architecture.md §7 마지막 한 줄 addendum
- **Mirror**: 기존 prose 스타일 (한국어 + 영어 기술 용어)
- **Validate**: `git diff main..HEAD CLAUDE.md` — §1.3, §1.4, §4 세 곳만 변경. 다른 섹션 0 lines 변경.

### Task 5: Stage 2 backlog seed

- **Action**: `.claude/plans/v1-2-0-orchestrator-stage2-backlog.md` 신규. 3개 섹션:
  - **Spike findings (from Task 0)** — 4개 답 요약 + 결정 implication
  - **Open architectural questions** — worker IPC schema 상세 (Q3=B 확정이지만 schema 정의 미완), pilot workflow (Q4=i 확정), worker lifecycle (timeout/crash/garbage 6 케이스 카탈로그), controller polling vs event-driven
  - **Next entry** — `/mccp:plan-prd v1.2.0-orchestrator-controller` (또는 spike 결과에 따라 `/mccp:plan-prd v1.2.0-batch-adapter`)
- **Mirror**: `.claude/plans/codex-findings-backlog.md` 의 누적 형식 + roadmap thin-index 패턴
- **Validate**: 파일 존재 + 3개 섹션 포함 + roadmap (memory `mccp-roadmap`) 인덱스에 *"v1.2.0 → stage 2 backlog 참조"* 한 줄 등록

## Validation

```bash
# 단위 테스트
node --test plugins/mccp/scripts/state/tests/state-writer.test.js
node --test plugins/mccp/scripts/lib/tests/state-resumption.test.js
node --test plugins/mccp/scripts/hooks/tests/auto-handoff.test.js

# 통합 — STATE.md fixture로 /mccp:resume dry-run (수동, Task 2 acceptance에서)
# fixtures/state-handoff-graceful.md, fixtures/state-handoff-critical-with-fixtask.md,
# fixtures/state-handoff-critical-nofixtask.md, fixtures/state-no-handoff.md

# 문서 정합성
grep -E "MCCP_AUTO_HANDOFF(_EXPERIMENTAL_SPAWN)?=" CLAUDE.md
grep -n "MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN" plugins/mccp/scripts/state/session-spawner.js
grep -q "## Spike findings" .claude/plans/v1-2-0-orchestrator-stage2-backlog.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Spike (Task 0)가 `/batch` 또는 `/fork`가 stage 2를 완전 대체할 수 있다고 결론 → Task 1-4의 cleanup은 *그래도 유효하지만 stage 2의 90%가 upstream 위임* | MEDIUM | cleanup 자체는 spike 결과와 무관. 현 auto-handoff의 lie가 사용자 경험을 해치는 사실이 evidence-based (이 세션 critique). dispatcher 자체 구축 여부만 spike 결과로 결정. |
| `/mccp:resume`이 STATE.md의 `last_event=resume_dispatched`를 clear 못 하면 무한 재진입 | MEDIUM | Task 2 step 5 명시 + state-resumption.test.js의 idempotency 케이스 회귀. |
| `MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN` 도입이 기존 `MCCP_AUTO_HANDOFF=spawn` 사용자에게 silent break | LOW | spawn 모드는 IDE-launched env에서 한 번도 작동한 적 없음 (`claudeAvailable() === false` 영구) → 실사용 0 가정. 그래도 telemetry deprecation marker로 1 cycle 유예. |
| Codex review (이번 세션부터 실제 발화)가 plan의 stage 1/2 split을 *premature scope reduction*으로 challenge | MEDIUM-HIGH | Summary에 Q1=분리 결정 명시. R1 YAGNI triage에서 "stage 2 full implementation now" finding은 ACCEPT_NOW가 아니라 **DEFER_TO_BACKLOG**로 라벨 (stage 2 자체가 별도 worktree로 계획되어 있음 — 이 plan의 §Out of scope 인용). |
| Spike Task 0이 시간 초과 (1-2hr → 4hr+) 또는 답안 incomplete | LOW | 4개 Y/N 질문으로 명시적 bounded. **timeout 또는 미답 = re-run, partial ship 불가** (**Codex R1 F2 absorbed**) — spike 답이 모두 채워지지 않으면 stage 1 PR open 차단. Spike doc 머리에 environment pin 필수: Claude Code 버전 + OS + IDE 조합 명시. |
| `/mccp:resume`의 dispatch table이 향후 phase enum 변경 시 drift | MEDIUM | state-resumption.js를 pure module로 격리. test fixture를 work-orchestrator의 phase enum과 share. drift는 test 실패로 가시화. |
| Stage 1 동안 main branch에 동일 파일 (auto-handoff.js / session-spawner.js / CLAUDE.md) 충돌 commit 발생 | LOW-MED | 본 worktree branch는 main off로 created 시점 기준. PR 시 conflict 발생하면 rebase로 처리. axis K1+K2가 이미 merged (#24)이라 immediate conflict surface는 낮음. |

## Acceptance

- [ ] `docs/v1.1.0-orchestrator/spike-upstream-primitives.md` 존재. 4개 질문 모두 evidence-backed Y/N
- [ ] `session-spawner.spawn()`이 experimental flag 없는 `spawn` 요청을 명시적으로 `notify`로 강등 + `fallbackReason='spawn-experimental-flag-missing'`
- [ ] **Tasks 2 + 3 (+ Task 1.5) conditional on Task 0 outcome — 4-AND predicate (F3 absorbed, strengthened this round)** — Task 0 spike 답 **(1) AND (2) AND (3) AND (4)** 모두 pass 시에만 Tasks 1.5/2/3 implementation을 stage 2로 defer (= 답1: subagent가 parent receipt read/write 가능 + 답2: spawn이 claude PATH 의존성 회피 + 답3: subagent 안에서 cross-vendor Codex 호출 가능 + 답4: return format이 `structured-and-receipt-compatible`). **어느 한 답이라도 fail/unknown이면** Tasks 1.5/2/3은 stage 1에서 local impl 진행 (stage 1 PR은 docs + spawn-quarantine + state-writer schema + resume 모두 ship). spike doc의 환경 pin이 incomplete면 (4) 답은 자동 unknown으로 평가.
- [ ] (Tasks 2-3 진행 시) `plugins/mccp/commands/resume.md` + `plugins/mccp/scripts/lib/state-resumption.js` 신규, **2-phase atomic dispatch + dispatchId**
- [ ] (Tasks 2-3 진행 시) `state-resumption.test.js` 5 dispatch row + malformed + idempotency + **failure-window 회귀** 케이스 통과
- [ ] `auto-handoff.test.js` 회귀 0건 + 새 experimental flag 케이스 통과
- [ ] CLAUDE.md §1.3 / §1.4 / §4 갱신, `git diff`가 외 섹션 변경 없음
- [ ] `docs/v0.2-architecture.md` §7 addendum 1줄 추가
- [ ] `.claude/plans/v1-2-0-orchestrator-stage2-backlog.md` 3개 섹션 포함
- [ ] memory `mccp-roadmap` 인덱스에 v1.2.0 stage 2 backlog 참조 1줄
- [ ] Codex Adversarial Review 섹션 non-empty (R1 최소, R2/R3은 ACCEPT_NOW HIGH/CRITICAL 발생 시만)
- [ ] PR open 가능 상태 — `v1.1.0-orchestrator-s1` branch → main

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.4.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; `--impeccable-available` flag (v0.3.6 축 1) 미적용 — impeccable detect: `no-signal` plan body, design-scope 무관)
- 라운드 수: **1** (cap default; ACCEPT_NOW HIGH 2건 + MEDIUM 1건 모두 R1 plan body absorption으로 해결, R2 escalate 조건 미충족)
- 합치 결론: Codex raw verdict `needs-attention` → 3개 finding 모두 R1 내 plan 갱신으로 absorbed → **effective verdict: approve-with-absorbed-changes**
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1: Resume marks `resume_dispatched` on success/failure/timeout 무관 → 실패한 dispatch도 `noop`로 분기 = work loss (Codex conf 0.92, line_start 72) | HIGH | ACCEPT_NOW | 2-phase semantics 재설계: 1st phase는 `resume_dispatching` marker만 (handoff_spawn 신호 보존, `clearHandoff=false`). 2nd phase는 후속 command의 *success receipt 발행*을 `receipt-validate` readback으로 확인 후에만 `resume_dispatched` + `clearHandoff=<shouldClearOnSuccess>`. 실패/timeout/exception 시 STATE.md `resume_dispatching` 유지 + `dispatch_attempt_count++`. dispatch table에 `attempt_count >= 3 → resume_giveup` 행 추가 (manual recovery). dispatch column `shouldClear` → `shouldClearOnSuccess`로 semantic shift. Task 2 step ordering(7→8) + Task 3 dispatch table(5→6 row) + state-resumption.test.js failure-window + handoff preservation 회귀 추가. |
  | F2: 2-phase marker가 state-writer.js의 미지원 event/field 호출 (`resume_dispatching`/`resume_dispatched` 미정의, `dispatch_id`/`dispatch_id_completed`/`dispatch_attempt_count`/`clearHandoff` patch field 화이트리스트 외 → unknown-event downgrade로 `precompact`로 변환됨, in-flight marker가 영구 유실) (Codex conf 0.9, line_start 67) | HIGH | ACCEPT_NOW | scope expansion: Files to Change에 `state-writer.js` UPDATE + `state-writer.test.js` UPDATE 추가. 신규 **Task 1.5** (state-writer schema 확장) 도입 — `ALLOWED_EVENTS` 확장 + patch field 화이트리스트 확장 + render/parse + unknown-event 분기에서 신규 event 제외 + `clearHandoff` 분기. Task 2 Prerequisite로 명시. Acceptance 4-AND predicate가 Task 1.5도 함께 conditional/non-defer 분기. |
  | F3: defer predicate가 spike 답(4)만 검사. 답(1)(2)(3) fail해도 (4) pass면 stage 1 ship → local resume 없고 upstream 미흡 worst case (Codex conf 0.84, line_start 51) | MEDIUM | ACCEPT_NOW | Acceptance row를 **4-AND** 로 강화: 답 (1) AND (2) AND (3) AND (4) 모두 pass 시에만 Tasks 1.5/2/3 defer. 어느 한 답이라도 fail/unknown이면 stage 1에서 local impl 강제. spike doc 환경 pin incomplete면 (4) 답 자동 unknown 평가. |
- Deferred to backlog: **0** (모든 finding 즉시 absorbed; `codex-findings-backlog.md` 추가 없음)
- Open Questions: 없음 — auto-CRITICAL 카탈로그 (secret exposure / data loss / irreversible migration / auth bypass / external destination change / crypto key handling) 무관. F1의 *workflow signal loss*는 user data loss가 아니라 retry-able workflow state — 카탈로그 외.
- Codex session 참조: threadId `019ecca4-cf85-77f2-8e00-a193a0f94412`, durationMs 165212
- Self-attest: plan 본문 §Files to Change / §Task 1.5 (신규) / §Task 2 (Prerequisite + 8-step) / §Task 3 (6-row dispatch) / §Validation / §Acceptance 6곳에 absorption 반영 완료. R2 escalate 조건 (ACCEPT_NOW HIGH/CRITICAL unresolved) 미충족 → R1 stop.

