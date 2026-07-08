# Plan: work Context Isolation — M1 (implement 스텝 격리)

**Source PRD**: `.claude/prds/work-context-isolation.prd.md`
**Selected Milestone**: M1 — implement 스텝 격리 (work가 implement 작업을 격리 컨텍스트로 위임 → 메인 피크 컨텍스트 감소)
**Complexity**: Large

## Summary

`/mccp:work` Step 3의 `Skill(mccp:prp-implement)` **인라인** 호출을 **격리된 단일 worker `Agent` 위임**으로 교체한다. worker는 자기 컨텍스트 안에서 implement의 무거운 작업(파일 탐색·edit·validate 루프·Implement-Codex 게이트·receipt write)을 전부 수행하고, 메인 세션은 envelope로 요약(변경 파일·receipt path·verdict)만 회수한다. 메커니즘은 신규 발명이 아니라 이미 존재하는 dispatch-controller substrate(v1.2.0-m1, `prepareDispatch`/`mergeEnvelopes`/envelope schema/3-flag attribution)를 **single-worker로** 재사용 — 이는 M2 pilot fanout으로 defer됐던 것을 implement 단건에 대해 실현하는 것이다.

## Isolation mechanism 결정 (PRD Open Question 해소)

PRD가 `/mccp:plan`에 위임한 A/B 선택을 확정한다.

- **선택: A (스텝당 sub-agent, 한 세션 유지) — 단, 하이브리드가 아닌 full-delegation**. context firewall 노트(§4)와 PRD Hypothesis가 이미 A를 주축으로 지목했고, B(체크포인트+fresh 세션)는 **M2**의 범위(본 M1 아님)다. spawn은 이 환경에서 ENOENT로 사망 → M1은 spawn에 의존하지 않는다(worker는 in-process `Agent`, 새 프로세스 아님).
- **worker가 게이트+receipt까지 소유**하되 controller session에 **attribution anchor**. 근거: (1) Implement-Codex 게이트는 prp-implement **Phase 2.5**(EXECUTE 이전)라 얇고 Codex는 이미 서브프로세스 격리됨 → worker가 실행해도 메인 누적 없음; (2) implement 스텝에는 **pr-phase lock이 없다**(그 lock은 PR 스텝 전용) → PRD Risk의 "lock을 sub-agent가 못 다룸"은 implement에 해당 안 됨; (3) receipt write는 worker의 Bash에서 `receipt/cli.js write`로 가능하고, `MCCP_DISPATCH_CONTEXT=1` + 3 attribution 필드가 controller session에 anchor(dispatch-controller가 정확히 이 목적으로 설계됨 — PRD Risk 4 완화책 "receipt attribution 보존" 그대로).
- **정직한 잔여 리스크**: Task subagent가 (a) nested `Skill(mccp:prp-implement)`를 호출할 수 있는지, (b) receipt 게이트 hook 아래에서 worker의 게이트+receipt가 완주되는지 — **Task 0 spike로 먼저 검증**하고 worker-prompt 형태를 확정한다. 위임 shape(prepare → Agent → merge)는 두 경우 모두 동일하고, worker-prompt 내용만 달라진다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Agent launch from command body | `plugins/mccp/commands/pr.md:496-500` | `Task` tool 호출: `subagent_type: "..."` + prompt. review-only invariant는 lock+finalizer로 보증 |
| Delegation precedent (heavy 위임, 조정 main 유지) | `plugins/mccp/commands/prp-implement.md:679` | ULTRACODE_DELEGATE — isolation lock + PreToolUse guard로 위임 경계 mechanical 보증 |
| CLI wrapper 구조 | `plugins/mccp/scripts/lib/work-orchestrator.js:263-337` | `runCli(argv)` + `parseFlags` + `emit(JSON)` subcommand 디스패치 (classify/next-step/record-step) |
| Envelope + attribution substrate | `plugins/mccp/scripts/lib/dispatch-controller.js:123-266` | `prepareDispatch`(placeholder envelope + worker prompt + heartbeat) / `mergeEnvelopes`(terminal envelope 집계, receipts_added·findings·failedWorkers) |
| Attribution 3-flag anchor | `CLAUDE.md` dispatch-controller 행 + `MCCP_DISPATCH_CONTEXT` §4 | `--dispatched-by-controller-session/--worker-dispatch-id/--ipc-envelope-path` require, 누락 시 fail-closed exit 12 |
| Test 스타일 | `plugins/mccp/scripts/lib/tests/dispatch-controller.test.js` | Node native `node --test`, deps 주입(idGen/nowIso)으로 결정론 |
| Env toggle / kill switch 관행 | `CLAUDE.md` §4 운영 토글 | `MCCP_*` env, default-on, 미지정/오타 시 보수적 기본값, loud stderr |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/dispatch-cli.js` | CREATE | dispatch-controller lib의 thin CLI wrapper (`prepare-single` + `merge`) — work.md Bash 블록이 lib를 호출 가능하게 + node --test 대상화 |
| `plugins/mccp/scripts/lib/tests/dispatch-cli.test.js` | CREATE | CLI wrapper + single-worker merge 경로 테스트 |
| `plugins/mccp/commands/work.md` | UPDATE | Step 3 인라인 `Skill(mccp:prp-implement)` → 단일 worker `Agent` 위임 (prepare-single → Task → merge). frontmatter `allowed-tools`에 `Task` 추가. `MCCP_WORK_ISOLATE_IMPLEMENT` kill switch + 인라인 fallback. `next-step` HALT preflight 보존 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.20.1 → 1.20.2` (단일 milestone ship = patch, §3.7) |
| `CLAUDE.md` | UPDATE | §4 토글에 `MCCP_WORK_ISOLATE_IMPLEMENT` 추가 + §1.4 게이트 표 또는 §3에 work implement isolation 1행 |
| `.claude/prds/work-context-isolation.prd.md` | UPDATE | Delivery Milestones M1 행 `pending → in-progress` + `Plan` 셀에 이 plan 경로 (Phase 4에서 이미 반영) |

## Tasks

### Task 0: Spike — worker Agent가 implement 계약을 hook 아래서 완주 가능한지 검증
- **Action**: 임시 브랜치에서 실험. (a) `Task(subagent_type: general-purpose)` 안에서 nested `Skill(mccp:prp-implement, "<plan>")` 호출이 되는가? (b) 안 되면 worker prompt가 문서화된 게이트/receipt Bash 블록을 직접 구동하는 self-contained 형태로 완주하는가? (c) worker의 `receipt/cli.js write` + `codex-invoke.js`가 receipt 게이트 hook + `MCCP_DISPATCH_CONTEXT=1` attribution 아래서 성공하는가? 결과로 **worker-prompt 형태 확정**(nested-Skill first-class OR self-contained fallback).
- **Mirror**: `pr.md:496-500` Task 호출 형태, `prp-implement.md` Phase 2.5 게이트/receipt Bash 계약.
- **Validate**: 실험 브랜치에서 worker가 실제 plan 하나를 격리 컨텍스트로 완주 → 메인엔 envelope 요약만 들어옴을 육안 확인. 결정 노트를 `.claude/notes/work-context-firewall.md`에 append.

### Task 1: dispatch-controller thin CLI wrapper
- **Action**: `scripts/lib/dispatch-cli.js` 생성. subcommand 2개 — `prepare-single --plan <p> --controller-session <uuid> --subagent <type> [--dry-run]`(내부적으로 `prepareDispatch`를 1-worker로 호출, envelope placeholder write + worker prompt를 JSON emit), `merge --envelope <path>`(terminal envelope read + `mergeEnvelopes([env])` → `{receipts_added, findings, verdict, failedWorkers}` JSON emit). `parseFlags`/`emit`는 work-orchestrator.js에서 그대로 미러.
- **Codex F2 흡수 — 동기 단일 worker는 heartbeat 비활성**: `prepareDispatch({..., skipHeartbeat: true})`로 호출. dispatch-controller의 heartbeat/`reclaimStale`는 **async fanout(live controller loop가 mtime refresh)** 용이다. 여기 controller는 `Task` 반환까지 **동기 블록**돼 heartbeat를 refresh할 수 없고, worker가 15분(same-host far-expired) 초과 시 다른 validate-cmd가 envelope를 `crashed`로 reclaim → 성공한 FS 변경과 실패 envelope가 짝나는 race가 생긴다. 동기 단일 worker는 controller가 죽으면 Task도 함께 죽으므로 orphan 위험이 없다 → heartbeat 자체를 만들지 않는다(그러면 reclaim 대상에서 제외). CLI에 이 근거를 주석으로 못박음.
- **Codex F3 흡수 — repo-relative ipc path 별도 emit**: `prepareDispatch`의 `envelopePath`는 `parentCwd + .claude/state/dispatches`라 **절대경로**다. receipt schema는 `--ipc-envelope-path`를 `.claude/state/dispatches/<uuid>.envelope.json` **repo-relative**만 accept → 절대경로 forward 시 receipt write가 fail-closed. `prepare-single`은 로컬 read용 절대 `envelopePath`와 **receipt flag용 canonical `ipcEnvelopePath`(repo-relative)를 별도 필드로** emit한다. `merge`는 절대 path로 read, worker prompt는 repo-relative를 `--ipc-envelope-path`에 forward.
- **Mirror**: `work-orchestrator.js:263-337` CLI 구조, `dispatch-controller.js` prepareDispatch/mergeEnvelopes.
- **Validate**: `node plugins/mccp/scripts/lib/dispatch-cli.js prepare-single --plan x --controller-session <uuid> --dry-run` 가 유효 JSON(절대 `envelopePath` + repo-relative `ipcEnvelopePath` 둘 다) emit. 테스트에 long-running worker / stale-reclaim race(heartbeat 부재로 reclaim 대상 아님) + receipt write→validate round-trip(`MCCP_DISPATCH_CONTEXT=1`, repo-relative path accept) 포함.

### Task 2: work.md Step 3 — 인라인 Skill → 단일 worker Agent 위임
- **Action**: Phase 2.F Step 3을 재작성. (1) `MCCP_WORK_ISOLATE_IMPLEMENT`(default `1`) 체크 — `0`이면 기존 인라인 `Skill(mccp:prp-implement)` fallback(loud stderr). (2) 기존 `next-step` HALT preflight 유지. (3) `dispatch-cli.js prepare-single`로 envelope+worker prompt 생성. (4) 단일 `Task`(subagent_type) 런칭, prompt = Task 0에서 확정한 형태(+`MCCP_DISPATCH_CONTEXT=1` + attribution env). (5) Agent 반환 후 `dispatch-cli.js merge`로 요약 회수. (6) worker envelope status != `ok`이면 fix-task.md write + HALT(기존 error recovery 재사용). frontmatter `allowed-tools`에 `Task` 추가.
- **Codex F1 흡수 — worker의 nested auto-chain 강제 차단**: worker가 prp-implement 본문을 돌리면 그 **Phase 7 auto-chain이 default-on**이라 격리 컨텍스트 안에서 commit/PR을 실행할 수 있다 → controller가 Step 4/5에서 다시 commit/PR을 돌리면 **중복 commit·중복 PR·verdict 미확인 PR**(되돌릴 수 없는 external state change)이 발생한다. 방어: worker 호출 env에 **`MCCP_AUTO_CHAIN_DISABLE=1`을 강제**(+ belt-and-suspenders `MCCP_AUTO_CHAIN_SKIP_PR=1`) — env 배열이 아니라 worker prompt가 자기 receipt/commit 스텝 진입 자체를 금지하도록 명시. worker는 **implement까지만**(commit/PR은 controller가 Step 4/5에서만). worker envelope의 `receipts_added`에 commit/pr receipt가 있으면 merge가 이를 invariant 위반으로 감지해 HALT.
- **Mirror**: 기존 work.md Step 3 구조 + `pr.md` Task 호출 + `dispatch-controller.js` 흐름. `MCCP_AUTO_CHAIN_DISABLE`/`MCCP_AUTO_CHAIN_SKIP_PR` §4 토글.
- **Validate**: work.md의 Bash 블록만 dry-run(`--dry-run`)으로 prepare→merge round-trip. worker prompt에 `MCCP_AUTO_CHAIN_DISABLE=1` 존재 확인. Task 4 dogfood에서 Step 3 worker가 commit/PR receipt를 만들지 **않음**을 검증.

### Task 3: Attribution 배선 + cross-gate dedupe 회귀 확인
- **Action**: worker prompt가 receipt write 시 `--dispatched-by-controller-session <controllerSessionId> --worker-dispatch-id <dispatchId> --ipc-envelope-path <path>`를 forward하도록 명시(누락 시 fail-closed exit 12 — 이미 검증기 존재). implement-codex receipt가 controller session에 anchor됨을 확인. 이후 PR 스텝 cross-gate dedupe가 이 receipt를 읽어 plan-codex + implement-codex verdict를 정상 대조하는지 확인.
- **Mirror**: `CLAUDE.md` dispatch-controller 행 attribution 계약, `MCCP_DISPATCH_CONTEXT` §4.
- **Validate**: dogfood run 후 receipt에 3 attribution 필드 + `meta` marker 존재 확인. PR 스텝이 dedupe 정상.

### Task 4: Baseline/after 컨텍스트 측정 절차 + dogfood
- **Action**: 대표 feature 하나를 (a) `MCCP_WORK_ISOLATE_IMPLEMENT=0`(인라인 baseline) / (b) `=1`(격리) 두 번 돌려 메인 세션 피크 컨텍스트를 비교. 측정 방법(토큰 카운트 관측 지점)을 `.claude/notes/work-context-firewall.md`에 문서화. 무거운 계측은 도입하지 않음(MVP — 육안/수동 관측).
- **Mirror**: 없음 — 신규 측정 절차. (PRD Success Metrics 표의 "격리 전/후 비교" 방법 구체화)
- **Validate**: 격리 후 메인 피크가 baseline 대비 유의미 감소 관측(PRD Success Metric 1). Codex/receipt chain 정합 유지 확인(Metric 3·4).

### Task 5: 버전 bump + 토글 문서화 + PRD status
- **Action**: `plugin.json` `1.20.1 → 1.20.2`. `CLAUDE.md` §4에 `MCCP_WORK_ISOLATE_IMPLEMENT` 추가 + work implement isolation 요약 1행. PRD Delivery Milestones M1 행을 ship 시 `complete`로. footer version drift 점검(dashboard renderer footer는 본 변경과 무관하나 §3.7 관행상 확인).
- **Mirror**: `CLAUDE.md` §3.7 milestone PR 의무 체크리스트, §4 토글 표.
- **Validate**: `node -e "require('.../plugin.json').version"` = `1.20.2`.

## Validation

```bash
# 신규 CLI wrapper + single-worker merge
node --test plugins/mccp/scripts/lib/tests/dispatch-cli.test.js

# dispatch-controller 회귀 (변경 없음 보증)
node --test plugins/mccp/scripts/lib/tests/dispatch-controller.test.js \
             plugins/mccp/scripts/lib/tests/dispatch-envelope.test.js

# prepare → merge round-trip (dry-run)
node plugins/mccp/scripts/lib/dispatch-cli.js prepare-single \
  --plan .claude/plans/work-context-isolation.plan.md \
  --controller-session 00000000-0000-4000-8000-000000000000 \
  --subagent general-purpose --dry-run

# 전체 스위트 회귀
node --test plugins/mccp/scripts/lib/tests/

# 버전
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **[Codex F1]** worker의 prp-implement Phase 7 auto-chain이 격리 안에서 commit/PR → 중복 commit·PR (되돌릴 수 없음) | High | worker env `MCCP_AUTO_CHAIN_DISABLE=1`(+`MCCP_AUTO_CHAIN_SKIP_PR=1`) 강제 + worker는 implement까지만. merge가 commit/pr receipt 유입 시 invariant HALT. dogfood 검증 (Task 2) |
| **[Codex F2]** 동기 단일 worker가 15분 초과 시 다른 validate-cmd가 envelope stale-reclaim → 성공 FS + 실패 envelope 짝남 | High | 동기 단일 worker는 `skipHeartbeat:true`로 heartbeat 미생성 → reclaim 대상 제외. controller 사망 시 Task도 사망(orphan 없음). race 테스트 (Task 1) |
| **[Codex F3]** 절대 envelope path를 `--ipc-envelope-path`로 forward → receipt schema reject(fail-closed) | Medium | `prepare-single`이 repo-relative `ipcEnvelopePath`를 별도 emit, worker는 그걸 forward. receipt write→validate round-trip 테스트 (Task 1·3) |
| Task subagent가 nested `Skill(mccp:prp-implement)` 미지원 | Medium | Task 0 spike로 선검증. 미지원 시 self-contained worker prompt(문서화된 게이트/receipt Bash 직접 구동)로 degrade — 위임 shape 불변 |
| worker의 receipt/게이트가 receipt 게이트 hook 아래서 실패 (double-validation·context injection) | Medium | Task 0에서 hook 상호작용 검증. attribution + `MCCP_DISPATCH_CONTEXT=1`로 anchor. 실패 시 envelope status != ok → fix-task HALT (loud) |
| Agent 위임 unavailable / worker 사망 | Low | `MCCP_WORK_ISOLATE_IMPLEMENT=0` kill switch로 인라인 fallback. worker 사망은 envelope `crashed` + fix-task HALT (spawn 부활 아님 — in-process Agent) |
| 격리로 dual-review(cross-model) 가치 저하 | Low | cross-gate dedupe + receipt attribution 보존(Task 3). Codex 배관 무변경(Metric 3) |
| 매 implement마다 Agent 1개 spawn 오버헤드 | Low | 단일 worker(fanout 아님). 초과 예측 기반 조건부 위임은 M3(classify 초과 예측)로 승계 — M1은 무조건 위임 |
| standalone `/mccp:prp-implement`엔 미적용 (PRD Users 범위 밖) | — | 의도된 범위. 격리 locus는 work.md(오케스트레이터)에 한정 — prp-implement 내부는 무변경 |

## Acceptance

- [ ] Task 0 spike 결정 노트 작성 + worker-prompt 형태 확정
- [ ] `dispatch-cli.js` + 테스트 통과 (`node --test`)
- [ ] work.md Step 3 격리 위임 + kill switch fallback + `next-step` HALT 보존
- [ ] implement-codex receipt가 controller session에 anchor (3 attribution 필드, repo-relative ipc path) + PR cross-gate dedupe 정상
- [ ] **[Codex F1]** Step 3 worker가 commit/PR receipt를 만들지 않음 (worker env `MCCP_AUTO_CHAIN_DISABLE=1`, merge invariant HALT)
- [ ] **[Codex F2]** 동기 단일 worker가 stale-reclaim으로 crash 마킹되지 않음 (heartbeat 미생성 race 테스트)
- [ ] **[Codex F3]** receipt write→validate-cmd round-trip이 repo-relative ipc path를 accept (fail-closed 아님)
- [ ] dogfood: 격리 후 메인 피크 컨텍스트 baseline 대비 유의미 감소 관측
- [ ] Codex 배관(codex-invoke/codex-runner) diff 부재 — 격리 회귀 없음
- [ ] `plugin.json` 1.20.2 + `CLAUDE.md` 토글 문서화 + PRD M1 행 갱신
- [ ] 전체 `node --test` 스위트 green
- [ ] Patterns mirrored, not reinvented (dispatch-controller substrate 재사용, 신규 격리 엔진 미발명)

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.20.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope preamble 적용)
- 라운드 수: 1 (cap=1, R1 흡수로 완결 — R2 escalate 불요)
- classification: `ok` · blocking: `false` · verdict: `needs-attention`
- 합치 결론: implement를 격리 worker로 위임하되, (1) worker의 nested auto-chain, (2) 동기 worker의 heartbeat stale-reclaim, (3) 절대 envelope path의 receipt reject — 3개 invariant를 닫아야 안전. 셋 다 R1에서 plan 수정으로 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 worker auto-commit/PR before controller Step 4/5 | HIGH | ACCEPT_NOW | 되돌릴 수 없는 external state change(중복 commit·PR). worker env `MCCP_AUTO_CHAIN_DISABLE=1` 강제 + merge invariant HALT로 흡수 (Task 2) |
  | F2 synchronous worker heartbeat stale-reclaim race | HIGH | ACCEPT_NOW | 정확성 결함. 동기 단일 worker `skipHeartbeat:true`로 reclaim 대상 제외 흡수 (Task 1) |
  | F3 absolute ipc path → receipt fail-closed | MEDIUM | ACCEPT_NOW | receipt anchor 실패 → dedupe 회귀. repo-relative `ipcEnvelopePath` 별도 emit + round-trip 테스트로 흡수 (Task 1·3) |
- Deferred to backlog: 0
- Open Questions: 없음 — 3개 finding 전부 R1에서 흡수 완료(self-attest). 잔여 auto-CRITICAL 없음(F1의 auto-commit/PR 위험은 kill switch로 plan에서 봉인).
- Codex session 참조: threadId `019f2d37-2feb-7771-bd97-03db9f4fcdea`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

- Note: implement-time 파일 확장 없음 (gate 진입 시점 워킹트리 코드 변경 0). `origin/main..HEAD` diff에 보이는 dashboard 파일(`html.js`/`markdown.js`/`stale-audit/*`)은 브랜치가 상속한 이전 커밋 `15a1254`(v1.20.1)의 산출물이며 본 plan의 Files to Change 확장이 아님.
- plan-codex F1(worker auto-chain)/F2(heartbeat stale-reclaim)/F3(절대 ipc path reject) 3개 invariant 전부 plan에 흡수 완료 → implement는 그 흡수의 mechanical 실현. Acceptance의 F1/F2/F3 테스트가 Phase 4에서 재검증.
