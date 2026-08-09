# mccp milestone log

CLAUDE.md §1.4 「v0.2 자동 게이트 레이어」가 싣던 **milestone 출하 로그 24행의 원문**이다.
CLAUDE.md는 세션마다 자동 주입되는 지시문이라 출하 이력을 계속 이고 갈 수 없어
(24행 = 37,353 B = 그 파일의 23.2%), 원문을 손실 없이 여기로 옮기고 CLAUDE.md에는
현재도 살아 있는 18개 모듈의 한 줄 요약 + 이 문서로 가는 포인터만 남겼다.

**이 문서는 아카이브다 — 규칙이 아니다.** 운영 규칙·default·복구 절차는 전부 CLAUDE.md에
남아 있다. 여기 있는 것은 *그 규칙이 어느 milestone에서 왜 그렇게 정해졌는가*뿐이다.

원본 §1.4의 도입 문단이다 — 아래 한 줄이 CLAUDE.md에 있던 원문 그대로다.

brainstorming 분석 결과 v0.1의 receipt chain은 *"adversarial review가 일어났는가"* 만 검증하고, *"사람이 감시해야만 다음으로 넘어가는 chokepoint"* 는 그대로 남아 있었습니다. v0.2는 receipt chain 위에 자동화 layer 5개를 얹습니다 (자세한 sequence diagram + module boundary는 [docs/v0.2-architecture.md](docs/v0.2-architecture.md)):

---

## 잔류 판정 (18 잔류 / 6 이전)

판정 축은 **계보 승계**다 — 같은 서브시스템을 뒤 milestone이 흡수했으면 앞 행은 이 로그로만
간다. 두 조건을 모두 만족하는 행만 CLAUDE.md에 한 줄로 남는다:

1. 그 행이 인용한 **primary path가 현재 repo에 실재**한다.
2. 같은 서브시스템을 다루는 행 중 **가장 최신 version**이다.

이전으로 판정된 6행도 **소실이 아니다** — 아래 「원문 24행」에 전문이 보존된다.

| # | 모듈 | 판정 | 근거 |
|---|---|---|---|
| 1 | [Stop-loop](#stop-loop) | **잔류** | 독립 서브시스템, 후속 흡수 없음 |
| 2 | [STATE.md continuity](#state-md-continuity) | **잔류** | 독립, §3.2가 참조 |
| 3 | [Auto-handoff](#auto-handoff) | **잔류** | 독립, §4 토글이 참조 |
| 4 | [`/mccp:work`](#mccp-work) | **잔류** | 진입점 |
| 5 | [dual-reviewer escalate](#dual-reviewer-escalate) | **잔류** | 독립 |
| 6 | [Codex disabled honor](#codex-disabled-honor) | **잔류** | §3.3 classification 표가 의존 |
| 7 | [Codex/impeccable scope split](#codex-impeccable-scope-split) | **잔류** | 독립 |
| 8 | [dispatch-controller](#dispatch-controller) | **잔류** | IPC substrate — 15~20이 그 위에 얹힌 것이지 대체가 아님 |
| 9 | [v1.3.0 schema baseline](#schema-baseline) | 이전 | 문서 freeze 자체가 산출물이고 그 문서가 §5에 이미 등재 |
| 10 | [derive engine](#derive-engine) | **잔류** | 독립 모듈, §5 등재 |
| 11 | [briefing stamp](#briefing-stamp) | **잔류** | 독립 모듈 |
| 12 | [STATUS.md + HTML renderer](#status-renderer) | **잔류** | 독립 모듈, §5 등재 |
| 13 | [Refresh trigger + privacy guard](#refresh-trigger-privacy-guard) | **잔류** | 독립 모듈 |
| 14 | [cwd-mask + branch-validation polish](#cwd-mask-branch-validation) | 이전 | patch 흡수분, 별도 표면 없음 |
| 15 | [work implement isolation](#work-implement-isolation) | 이전 | 20이 승계 |
| 16 | [plan fan-out](#plan-fanout) | **잔류** | 별도 축(plan GROUND), 승계 아님 |
| 17 | [single-worker Workflow 이전](#single-worker-workflow) | 이전 | 18→20이 승계 |
| 18 | [N-worker parallel implement scaffold](#n-worker-parallel-scaffold) | 이전 | 20이 승계(default flip) |
| 19 | [aggregate verify + worktree-merge substrate](#aggregate-verify) | **잔류** | verify는 병렬과 직교(⊥) 축 |
| 20 | [병렬 활성화 worktree-merge live](#worktree-merge-live) | **잔류** | implement-dispatch 계보의 최신 |
| 21 | [cost-state time-based decay](#cost-state-decay) | **잔류** | 독립, §3.2·§4가 참조 |
| 22 | [orchestration live-activation](#orchestration-live-activation) | 이전 | 23이 승계(default·USD 축 재정의) |
| 23 | [orchestration operational-USD 은퇴](#orchestration-usd-retirement) | **잔류** | orchestration 계보의 최신 |
| 24 | [orchestration firing-preview](#orchestration-firing-preview) | **잔류** | 독립 도구(read-only preview), §4가 참조 |

---

## 원문 24행

CLAUDE.md §1.4 표에 있던 그대로다. 한 글자도 다듬지 않았다 — 이전이 재작성으로
변질되지 않았음을 줄 단위로 기계 검증할 수 있어야 하기 때문이다.

### stop-loop

| 모듈 | 역할 | 상태 |
|---|---|---|
| **Stop-loop**              | Claude stop 직전 자동 `lint → typecheck → test → e2e` + (opt-in) Codex diff review. fail 시 `fix-task.md` 생성 + loop-counter bump; `MAX_COUNT=2` 도달 시 human-takeover + allow (hook 자체가 자동 재시도하는 게 아니라, 실패마다 카운터를 올리고 cap 도달 시 통과시키는 bounded 실패 카운터) | S8 ship      |

### state-md-continuity

| 모듈 | 역할 | 상태 |
|---|---|---|
| **STATE.md continuity**    | `PreCompact`에서 write, `SessionStart`에서 inject — 세션 간 컨텍스트 자동 복원                | S10a ship    |

### auto-handoff

| 모듈 | 역할 | 상태 |
|---|---|---|
| **Auto-handoff**           | 누적 비용 $50 notice / $80 soft / $100 hard ceiling 임계 자동 검출 → STATE.md `handoff_spawn` 신호 write + stderr 배너. 실제 세션 전환은 `spawn` 모드만 시도하며 v1.1.0+부터 experimental opt-in (`MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1`)이 없으면 `notify`로 강등. 다음 세션에서 `/mccp:resume`로 resume 권장. | S10b ship (v0.3.0), v1.1.0 honest |

### mccp-work

| 모듈 | 역할 | 상태 |
|---|---|---|
| **`/mccp:work`**           | 단일 entry로 PRD → plan → implement → PR 전 chain 자동 orchestration                          | S11 ship (v0.3.1) |

### dual-reviewer-escalate

| 모듈 | 역할 | 상태 |
|---|---|---|
| **dual-reviewer escalate** | CRITICAL/divergent 시 `fix-task.md`에 `Next: /santa-loop ...` 안내 추가 (자동 호출은 안 함)   | S12 ship (v0.3.2) |

### codex-disabled-honor

| 모듈 | 역할 | 상태 |
|---|---|---|
| **Codex disabled honor**   | wrapper(codex-invoke.js)가 `MCCP_CODEX_DISABLED=1` 감지 시 spawn 직전 short-circuit + classification='disabled' 즉시 반환. caller(codex-runner / receipt)는 `codex_outcome='disabled'` + `meta.codex_disabled=true` + canonical reason='codex_disabled' 일관 기록. 영구 bypass 사용자에게 우회 env(`MCCP_ALLOW_CODEX_UNAVAILABLE` / `MCCP_PR_SKIP_CODEX_REVIEW`) 0회 chain | M8 ship (v0.3.5) |

### codex-impeccable-scope-split

| 모듈 | 역할 | 상태 |
|---|---|---|
| **Codex/impeccable scope split** | impeccable 가용(`impeccable-detect`의 user-level skill probe 포함) 시 (1) codex-invoke.js가 focus 앞에 `DESIGN_SCOPE_PREAMBLE` prepend → Codex가 visual/color/typography/spacing/animation/micro-interaction/brand finding 미배출 + a11y는 impeccable a11y-architect에 routing 명시, (2) codex-result-filter.js가 Codex 응답에서 design/a11y keyword 매칭 finding을 drop + a11yRoutedCount stash, (3) receipt meta 4 fields(`codex_design_scope_excluded`, `design_findings_dropped`, `a11y_routed_to_impeccable`, `dropped_findings_digest`) audit. impeccable 미가용 시 no-op. `MCCP_CODEX_DESIGN_SCOPE_HONOR=0`로 kill switch (debug용). | v0.3.6 ship (축 1 + STATE.md content-hash skip(축 2) + derive-decision normalize(축 3) bundle) |

### dispatch-controller

| 모듈 | 역할 | 상태 |
|---|---|---|
| **dispatch-controller (Stage 2 M1)** | Foundation IPC for multi-worker fanout. Envelope schema (`<parent_cwd>/.claude/state/dispatches/<uuid>.envelope.json`, pending nonterminal + ok/failure/timeout/crashed terminal), hybrid Monitor+polling watcher, atomic worktree→parent sync, pure-lib controller (`prepareDispatch` + `mergeEnvelopes`, no Agent calls). Receipt schema 4 new optional `meta.*` fields with marker-gated all-or-nothing invariant (F2 absorption) + `meta.ipc_envelope_path` triggers validator envelope integrity check (F3 absorption). Heartbeat + `reclaimStale` host-aware tri-state policy mirrors `pr-phase-lock.js` (F4 absorption). M2 pilot fanout + M3 stale-envelope GC deferred. Caller(slash-command body)가 Agent 호출 + controller는 그 결과만 merge — controller-self Agent invocation은 lib에서 불가. dual-review 보존: cross-gate dedupe가 controller-worker 양쪽 모두에서 작동, worker 받은 attribution 3개 필드로 receipt가 controller session에 anchor됨. | v1.2.0-m1 ship |

### schema-baseline

| 모듈 | 역할 | 상태 |
|---|---|---|
| **v1.3.0 schema baseline** | [docs/v1.3.0-observability/schema-surface.md](docs/v1.3.0-observability/schema-surface.md) 본문화 — receipt + envelope + STATE.md frontmatter의 read-side schema surface freeze. v1.3.0 dashboard derive engine (M1+) 가정 표준. envelope `validate()`가 strict additionalProperties:false로 통합 (Codex Plan-Codex R1 F3 absorption) + PRD body amend로 stale `handoff_dispatching/handoff_dispatched` 식별자 제거 (F1 absorption) + reconciliation doc 추가 ([state-md-naming-reconciliation.md](docs/v1.3.0-observability/state-md-naming-reconciliation.md)). receipt schema는 변경 없음. | v1.3.0-m0 ship |

### derive-engine

| 모듈 | 역할 | 상태 |
|---|---|---|
| **derive engine (v1.3.0-m1)** | `plugins/mccp/scripts/derive/*` — `.claude/` 9 source(plans/receipts/STATE/backlog/fix-task/PR/envelopes/ledger/worktrees)를 단일 normalized model로 통합. read-only, LLM-free, dep-free. 6 correlation kinds(receipt↔envelope 4-axis equality, state↔envelope controller/resume, receipt↔plan one-pass hash index, backlog↔plan, fix-task↔STATE). Mask-by-default + `--raw` opt-in (Codex F2). M0 schema contract runtime probe + `--strict` exit (Codex F4). Loud-fail-open per-source `degraded` flag (Codex F3). M2 briefing stamp + M3 STATUS.md renderer가 input으로 소비. | v1.3.0-m1 ship |

### briefing-stamp

| 모듈 | 역할 | 상태 |
|---|---|---|
| **briefing stamp (v1.3.0-m2)** | `plugins/mccp/scripts/lib/briefing/{cost-guard,invoke,index}.js` — receipt write path가 capped LLM 호출로 `meta.briefing_summary` + `briefing_token_count` + `briefing_token_estimated` + `briefing_invocation_count` 4 필드를 stamp. fail-open invariant(briefing 실패는 receipt write를 절대 poison 안 함). Cost-tier ≥ notice ($50) 자동 disable + `MCCP_BRIEFING=off` kill switch + `pr-phase.lock subphase=codex-review` 시 자동 skip(Codex R1 F3 PR_PHASE_LOCKED). `receipt_hash` carve-out으로 stamp가 tamper-detect digest를 무력화하지 않음(Codex R1 F1, deep-clone via JSON parse). Token count는 (focus+stdout) length 기반 estimate, real `tokenUsage` 발견 시 flip하여 `briefing_token_estimated=false`(Codex R1 F2). derive `sources/receipts.js`가 3 필드를 read-only로 surface해 M3 timeline renderer가 소비. | v1.3.0-m2 ship |

### status-renderer

| 모듈 | 역할 | 상태 |
|---|---|---|
| **STATUS.md + HTML renderer (v1.3.0-m3)** | `plugins/mccp/scripts/lib/renderer/*` — derive model + M2 briefing fields → `.claude/cache/STATUS.md` + `status.html`. 6-section deterministic verdict(11-step priority chain) + briefing surface + worker fanout graceful hide. Codex R1 4 absorptions: F1 M3-local `parsers/plan-body.js`(M1 surface immutable), F2 outer `safeFallback` outer-catch(renderStatus는 throw 안 함), F3 verdict step 7.5 controller_active fallback(envelope 미존재 시 controller 신호 surface), F4 `escapeHtml`/`escapeAttr`(local artifact self-injection 방어 + 4종 payload test). impeccable P1(amber appliesTo:'icon')/P2(raw blockquote + idle text)/P3(degraded source 이름 + anchor 안정성) absorption. Pure function of derive model. No new dep. M4 owns refresh triggers; M5 owns snapshots. CLI: `node plugins/mccp/scripts/derive/cli.js render`. | v1.3.0-m3 ship |

### refresh-trigger-privacy-guard

| 모듈 | 역할 | 상태 |
|---|---|---|
| **Refresh trigger + privacy guard (v1.3.0-m4)** | `plugins/mccp/scripts/lib/renderer/trigger.js` + `plugins/mccp/scripts/hooks/render-trigger-session-start.js` — 4 trigger paths (SessionStart hook / receipt-write epilogue / envelope write / envelope-move watcher) refresh `.claude/cache/STATUS.md` + `status.html` within ~5s of any state change. 5s content debounce + 90s render lock (host-aware tri-state reclaim per §3.6) + unique pid+random tmp names. Loud fail-open invariant — trigger NEVER throws (Codex R1 F1+F4 absorptions). Privacy guard: `derive/mask.js#maskSecrets` 5 regex catalogue (`sk-key`, `aws-key`, `private-key-block` severe + `bearer`, `password-eq` quiet) scans envelope `next_action`/`findings[*]`/`receipts_added[*]` at source-scan time (envelopes.js emits additive `masked_payload_signal`; raw payload NEVER stored — F3 absorption) and `receipt.meta.briefing_summary` via `applySecretMask`. F2 absorption: `applySecretMask` runs unconditionally including `--raw`; only `applyPathMask` honors `--raw`. Verdict step 1.5 fires red banner for severe hits; audit-timeline footnote surfaces aggregate per-kind statistics + `was_stale` (cache > 60s) stamp via `.last-render.json`. impeccable Acceptable 26/40 F1-F5 absorbed (telegraphic Korean, no em dash, severe-only red, source_id 노출, Bearer/password= 조용한 mask). M5 owns daily snapshots. | v1.3.0-m4 ship |

### cwd-mask-branch-validation

| 모듈 | 역할 | 상태 |
|---|---|---|
| **cwd-mask + branch-validation polish (v1.4.x patch)** | `session-ledger.js#isValidGitBranch` + `liftLegacyBranch` (read-side lift, write-side strict) — git ref-format invariant 강화 + 기존 wonky-branch v2 ledger silent drop 방지. `read → lift → validate` 4 call-site invariant (Codex R2 F1) + module-level Set memo로 per-process per-path 1회 stderr WARN cap (R2 F3). `derive/sources/receipts.js`가 `meta.cwd` emit + `derive/mask.js#maskPath` outside-root 변환 (`<outside-repo:safeTrailingSegment>` placeholder, R1 F3 + R2 F2 platform-independent basename) — sibling worktree/parent/UNC/cross-drive receipt cwd raw leak 0. plugin.json `1.8.0 → 1.8.1` patch bump. | v1.4.x patch ship |

### work-implement-isolation

| 모듈 | 역할 | 상태 |
|---|---|---|
| **work implement isolation (v1.20.2 M1)** | `scripts/lib/dispatch-cli.js` (`prepare-single`/`merge`/`mark`) — dispatch-controller substrate(v1.2.0-m1)를 single-worker로 재사용해 `/mccp:work` Step 3의 implement를 격리 worker Agent로 위임(최대 컨텍스트 누적원 격리, 메인은 envelope 요약만 회수). worker는 implement까지만 소유 — commit/PR은 controller Step 4/5 전용(Codex F1: prompt guardrail + merge가 mccp-pr-codex receipt 유입 시 invariant HALT). 동기 단일 worker `skipHeartbeat:true`(Codex F2: stale-reclaim 대상 제외). repo-relative `ipcEnvelopePath` 별도 emit으로 receipt attribution fail-closed 회피(Codex F3). Task 0 spike로 self-contained worker prompt 실증(nested Skill 의존 없음). `MCCP_WORK_ISOLATE_IMPLEMENT=0` kill switch(인라인 fallback). standalone `/mccp:prp-implement` 미적용. `1.20.1 → 1.20.2` patch bump. | v1.20.2-m1 ship |

### plan-fanout

| 모듈 | 역할 | 상태 |
|---|---|---|
| **plan fan-out (v1.20.4 M1)** | `scripts/workflows/plan-fanout.js` + `scripts/lib/plan-fanout/{perspectives,budget,synthesize}.js` + `agents/fanout-{architect,security,test,explorer}.md` — `/mccp:plan`의 GROUND를 **read-only 다관점 병렬 fan-out**으로 강화. 4개 전용 read-only agent(`tools: Read/Grep/Glob`만 — write/edit/bash **도구 부재**로 파일 변형·receipt write 구조적 불가, Codex F1)를 `Workflow` primitive `agent()`로 병렬 spawn → pure synthesize → plan body에 `## Multi-Perspective Fan-out` 주입. read-only + receipt 미기록이라 Codex dual-review·receipt chain **무손상**(fan-out 결과는 `plan_hash`에 포함돼 review됨). 비용: **default-off 명시 opt-in**(`MCCP_PLAN_FANOUT=on`, Codex F3) + fleetSize 고정(4) + `effort:'low'` + cost-tier autoDisable(notice+) + `budget.remaining()` 사전 skip + **cost-state 없으면 skip**(고비용 fail-closed, cost-guard fail-open과 의도적 차이 — Codex F2). Workflow throw/미가용 → 인라인 Pattern Grounding fallback(fail-open, plan 절대 안 막음). PRD artifact mode 전용(free-form 입력 미적용). Workflow 샌드박스에 `require` 부재 → workflow 스크립트는 oracle의 self-contained 포트(oracle은 tested reference + `budget.resolveFanout`은 caller-side 게이트). `1.20.2 → 1.20.4` patch bump. M2(implement 병렬화)·receipt attribution·자체 IPC 운명 이연. | v1.20.4-m1 ship |

### single-worker-workflow

| 모듈 | 역할 | 상태 |
|---|---|---|
| **single-worker Workflow 이전 (v1.20.7 M2a)** | `scripts/lib/implement-dispatch/result-schema.js` (`IMPLEMENT_RESULT_SCHEMA` + `deriveVerdict` pure oracle) + `scripts/workflows/implement-dispatch.js` (얇은 단일 `agent()` Workflow) + `dispatch-cli.js` (`emit-workflow-args`·`reconcile` 서브커맨드, worker prompt structured 반환 계약) + `commands/work.md` Step 3 재구성 — `/mccp:work` implement 위임 채널을 `Task`에서 `Workflow` `agent()`로 **등가 이전**(병렬화 전, M2b seam). 회수 판정을 **반환값 ∧ envelope ∧ receipt-store 3자 reconciliation**(`deriveVerdict`)으로 통일 — 기존 envelope-only `merge`를 Workflow·Task 양 경로에서 대체. verdict ∈ `ok|failed|invariant-violation|reconcile-mismatch|unanchored|result-unreadable`(invariant-first fail-closed). **Codex Plan-R1 3 HIGH 흡수**: F1(호출 후 fallback 경쟁 worker) → pre-invocation 경계 + `started` 표식 후 fail-closed HALT. F2(반환값 단독 SSoT) → 3자 hard reconciliation. F3(attribution de-anchor) → post-hoc anchor 검증 gate(marker+3-플래그 == `expectedAnchor` 아니면 `unanchored`). `MCCP_WORK_IMPLEMENT_WORKFLOW` default-off kill switch(3-state: 인라인/Task-격리/Workflow-격리) + Workflow 미가용 fail-open(Task 유지). dual-review 무손상(Implement-Codex worker 컨텍스트 불변, receipt 3-플래그 anchor, cross-gate dedupe 무변경). tmp 경로 worktree-safe(`git rev-parse --git-path`). `1.20.6 → 1.20.7` patch bump. M2b(N-worker `parallel` 병렬화·자체 IPC 완전 폐기·게이트 pipeline 합성) 이연. | v1.20.7-m2a ship |

### n-worker-parallel-scaffold

| 모듈 | 역할 | 상태 |
|---|---|---|
| **N-worker parallel implement scaffold (v1.20.10 M2b)** | `scripts/lib/implement-dispatch/{partition,budget}.js` + `result-schema.js#mergeVerdicts` + `dispatch-cli.js`(`prepare-fleet`/fleet `emit-workflow-args`/N-way `reconcile`) + `workflows/implement-dispatch.js`(`parallel` seam) + `commands/work.md` Step 3 — M2a 단일 `Workflow agent()` seam을 `parallel(fleet.map(w => agent(w.workerPrompt,{isolation:'worktree',schema})))`로 확장하는 **완전한 병렬 스캐폴드**. `partition.js`가 plan을 **서로소 file-set**으로 분할(union-find: 파일 겹침·mirror 의존·shared manifest 교차 시 병합 → 전부 얽히면 N=1 fail-close; `partitionFromPlanText`로 plan markdown 파생). `resolveFleet`이 opt-in·**merge_strategy 구조 gate**·cost-state·tier·budget을 first-match 판정(`resolveFanout` 미러). N-way `mergeVerdicts`가 per-worker `deriveVerdict`(반환값 ∧ envelope ∧ store 3자)를 **fail-closed 집계**(most-severe-first: `invariant-violation` > `unanchored` > `partition-escape` > `reconcile-mismatch` > … ; 부분 성공도 전체 HALT). **Task 0 spike 실측 → `merge_strategy=disable-parallel`**: `isolation:'worktree'` 변경은 parent worktree에 자동 전파 안 됨(별도 디렉토리·branch·uncommitted) + 오케스트레이터 worktree collect API 부재 → 병렬 실행은 `MCCP_WORK_IMPLEMENT_PARALLEL=1` opt-in이어도 merge_strategy가 `worktree-merge`로 승격되기 전까지 **N=1로 안전 gate off**(M2a 단일 동작 무변화). **Codex Plan-R1 2H+2M 흡수**: F1(verdict-before-merge 순서 불변식 — 격리 worktree 결과만으로 판정, 집계 ≠ ok면 parent clean → 부분 적용 0 + mid-apply rollback), F2(prompt-only disjointness → 실제-diff subset 강제 + 신규 `partition-escape` verdict + dependency-aware collapse), F3(machine-readable `merge_strategy` flag → `resolveFleet` 소비), F4(post-merge integrated `node --test` 게이트; 단일 merged-diff adversarial review는 M3 이연). 자체 IPC **부분 폐기**(Workflow가 worker liveness 소유 → heartbeat/reclaim/watcher redundant, envelope는 attribution·reconcile 아티팩트로 존속). 단일 경로 back-compat 무손상 · dual-review 무손상. `1.20.9 → 1.20.10` patch bump(#94 audit P5가 1.20.9 선점 → rebase되며 1.20.10으로 상향; #92 P4는 1.20.8). M3(verify 네이티브화·단일 workflow-native adversarial-verify 스테이지·worktree-merge 활성화) 이연. | v1.20.10-m2b ship |

### aggregate-verify

| 모듈 | 역할 | 상태 |
|---|---|---|
| **aggregate verify 네이티브화 + worktree-merge substrate (v1.20.12 M3)** | `scripts/lib/implement-dispatch/{verify,worktree-merge}.js` + `dispatch-cli.js`(`collect-worktrees`/`merge-apply`/`rollback-apply`/`verify-focus`/`verify-decide`) + `receipt/{schema,write,aliases,cli}.js`(신규 gate `mccp-implement-verify` + `meta.merged_verify_*`) + `commands/work.md` Step 3.verify — M2b가 backlog로 이연한 **통합 diff aggregate adversarial-verify**를 `/mccp:work`의 **필수 pipeline 스테이지**로 장착(PRD Open Question 1(c) 척추 답). worker 안(per-worker Implement-Codex) + workflow 외곽(/mccp:pr PR-Codex) 사이의 **통합 verify 층** — per-partition 리뷰가 놓치는 cross-cut 회귀(public API·import graph·shared config)를 test보다 깊은 cross-model(Codex) LLM 판정으로 잡는다. `verify.js`(pure oracle: `buildVerifyFocus` + `decideMergedVerify` + `parseMergedVerifyMode`)는 `codex-bridge.parseVerdict`/`detectCriticalCategory` 재사용. **DD6/Codex R1 F2 — 단일 경로에서도 발화**: 병렬이 gated(`disable-parallel`)여도 verify-네이티브화가 실제 runtime 가치를 획득(Axis A ⊥ Axis B). **DD2 cross-model 불변식**: invoker는 여전히 Codex — "adversarial-verify" 패턴은 worker 밖 독립 검증 구조만 차용, same-model skeptic 치환 아님(dual-review 무손상). **worktree-merge substrate**(`worktree-merge.js`: `buildWorktreeMap`/`collectWorkerDiff`/`assertPathsClean`/`applyDisjointDiffs`/`rollbackApplied`)는 build+unit-test 완비하되 **DORMANT** — Task 0 spike가 git 메커니즘(enumerate·apply·patch-scoped reverse-apply·rollback-safety=data-loss 0)은 **합성 실측으로 입증**했으나 live harness 상관(Workflow worktree↔dispatchId)은 **cost hard-ceiling으로 미실측** → `merge_strategy=disable-parallel` 유지(honest degradation, DD7). **Codex R1 4H 흡수**: F1(A2 artifact-격리 미비 → Mechanism 1 primary), F2(verify 양-경로 발화), F3(합성 decision → 실제 gate `mccp-implement-verify` produces-only·non-invasive), F4(광범위 checkout/clean → **patch reverse-apply**만, dirty feature branch data-loss 회피). 신규 gate는 어떤 command chain에도 미진입(validate-cmd/dedupe/PR-chain 비침습). merged-verify runtime HALT이 1차 enforcement, receipt가 audit anchor. `1.20.11 → 1.20.12` degraded patch(verify ship + 병렬 gated). worktree-merge 활성화(live 상관 입증)는 M4 이연. | v1.20.12-m3 ship |

### worktree-merge-live

| 모듈 | 역할 | 상태 |
|---|---|---|
| **병렬 활성화 worktree-merge live (v1.21.0 M4)** | `dispatch-envelope.js#seedEnvelope` + `dispatch-cli.js`(`seed-envelope` 서브커맨드·`resolveEnvelopePathForWorktree`·reconcile worktree-read·merge-apply F1 rollback·collectChangedFiles `-uall`) + `commands/work.md`(merge_strategy default flip) + `budget.js`(주석 sync) — M2b/M3가 cost hard-ceiling으로 미실측이던 **live harness 상관(Workflow worktree↔dispatchId)**을 Task 0 live dogfood(run wf_1f689994-fb8 topology + wf_98047bb7-1b1 happy-path)로 empirical 입증하고 `MCCP_WORK_MERGE_STRATEGY` default를 `disable-parallel`→`worktree-merge`로 flip해 N-worker 병렬 implement를 해금. **실측 topology**: isolation:'worktree' worktree는 `<repo>/.claude/worktrees/wf_<runId>-<N>`에 생성·`parallel()` 반환 후 컨트롤러 `git worktree list` 잔존·enumerable. `.claude/state/dispatches/`가 gitignored라 parent placeholder가 fresh worktree에 미복사(**seed-required**) → worker가 first-step으로 in-worktree `seed-envelope`(부재 시 pending 생성·존재 시 no-op)해야 terminal `mark` 성공 + `collect-worktrees`가 envelope 파일명으로 correlate. **Codex F1**(merge-apply patches-out write 실패 시 `rollbackApplied`로 parent 복원 — "실패=parent clean" 계약, patch-scoped only) + **Codex F2**(seed/mark가 repo-relative를 worktree 루트 `git rev-parse --show-toplevel` 기준 resolve + 하위 assert — subdir CWD·`..` escape 방어). reconcile은 map 제공 시 worktree terminal envelope를 읽어 stale-pending-parent 오탐 회피(Task 2). **dogfood-surfaced**: `collectChangedFiles`가 default `--porcelain`의 untracked 디렉토리 축약(`dir/`)으로 file-level partition과 false-escape → `--untracked-files=all`로 개별 파일 열거. cost guard 3중(PARALLEL=1 opt-in·cost-state fail-closed·tier autoDisable) 무변경 — default flip은 구조적 merge_strategy gate만 염. dual-review 무손상(per-worker Implement-Codex + N-way mergeVerdicts + aggregate Codex verify). `1.20.15 → 1.21.0` minor(PRD 전체 완료). | v1.21.0-m4 ship |

### cost-state-decay

| 모듈 | 역할 | 상태 |
|---|---|---|
| **cost-state time-based decay (v1.22.0 M3)** | `cost-state.js`(`readStateRaw`/`readState`/`readStateOrThrow` 3-API 분리 + pure `decayIfStale` + `parseDecayMs` + 명시적 write-side floor 리셋) + `state-writer.js`(`abort_owner`/`cost_abort_at` provenance frontmatter + `dispatch_chain_aborted` ownership) + `ecc-context-monitor.js`(subscription-aware SET + decay-clear 4중 AND + legacy sweep) — cost-model-subscription PRD **최종 milestone → PRD 전체 종료**. "한 번 튄 가상 비용($314.50 sticky)이 5개 자동화를 영구·전역 잠금"의 잔존 근원 두 표면(cost-state monotonic-MAX + STATE.md `chain_aborted`)을 시간 축으로 닫는다. mtime > `MCCP_COST_STATE_DECAY_HOURS`(default 6h)면 decayed reader가 green을 반환해 tier 소비처가 **코드 변경 0**으로 decay 획득(이미 `readState` 호출). **Codex Plan-R1 3H 흡수**: F1(reader별 allow/abort 불일치 → 명시적 raw/decayed API + write-side 명시화 + auto-chain fail-safe divergence 문서화·test), F2(구독권 producer가 USD로 `chain_aborted` 재stamp → SET 분기 subscription-aware, overflow-critical에서만), F3(불안정 `last_event` ownership + markerless legacy flag 영영 미clear → 안정적 `abort_owner` + conservative multi-signal sweep). **Codex Impl-R1 2 흡수**: IF1(legacy sweep가 `NON_COST_ABORT_EVENTS` denylist로 `plan_conflict_escalated` hard-stop 오clear 방지), IF2(stale bridge context signal-unknown 처리로 오래된 telemetry 영구 halt 차단). 종량제·구독권 공통 보편 수정. decay 비활성(`=0`) 시 M2 판정 byte-identical(회귀 0). `1.21.2 → 1.22.0` minor(PRD 종료). | v1.22.0-m3 ship |

### orchestration-live-activation

| 모듈 | 역할 | 상태 |
|---|---|---|
| **orchestration live-activation (v1.22.1 M1)** | `plan-fanout/budget.js`·`implement-dispatch/budget.js`(default 발화 반전 + `costFailOpen` branch + critical-only tier narrow + `hard_ceiling` bomb-detector + injected `runawayClamp`) + `orchestration-runaway.js`(CREATE — cost-state 독립 누적 worker-launch 절대 상한) + `implement-dispatch/route.js`(CREATE — `resolveWorkRoute` 순수 오라클) + `commands/work.md`·`plan.md`(default `:-1`·costFailOpen/runaway forward·route oracle 위임·발화 로그) — workflow-orchestration이 배선만 완성하고 실제 LLM-runtime 발화가 관찰된 적 없던 gap을 닫는 후속 PRD의 첫 milestone. `MCCP_PLAN_FANOUT`/`MCCP_WORK_IMPLEMENT_PARALLEL`을 **default 발화**로 반전(`off`/`0` 단일 opt-out 축)하고, cost-state 부재 시 `COST_STATE_UNKNOWN` fail-closed skip을 **fail-open(green 가정)**으로 뒤집는다(`MCCP_ORCHESTRATION_COST_FAIL_OPEN=0`으로 옛 계약 복원). 폭주 방지는 구조적 per-dispatch 상한(fleetSize=4/`MCCP_WORK_PARALLEL_MAX`) + USD critical/`hard_ceiling` bomb-detector + **cost-state 독립 누적 절대 상한**(`MCCP_ORCHESTRATION_MAX_AGENTS` default 24, fail-open 경로 N을 degraded=1로 clamp)으로 재정의(notice/warning autoDisable 제거 — $50/$80은 폭탄 아님). **Codex Plan-R1 3H 흡수**: F1(WORKFLOW default flip 제거 → opt-out 단일 축 `PARALLEL=off/0`로 legacy Task 경로 정확 복원, `route.test.js` env 전수), F2(cost-state 독립 runaway 안전판 → telemetry 부재 우회 불가), F3(Step 3 route를 `resolveWorkRoute` 오라클로 승격 → 발화 route가 untested markdown 아님). 저비용 검증 harness(합성 git-worktree seed→mark→collect→reconcile e2e, LLM 0회)로 배선 끊김 사전 제거. dual-review·receipt chain 무손상(read-only fan-out + workflow-외곽 게이트 invariant 불변). M2(실 LLM 발화 관찰)·calibrated 2차 임계 이연. `1.22.0 → 1.22.1` patch. | v1.22.1-m1 ship |

### orchestration-usd-retirement

| 모듈 | 역할 | 상태 |
|---|---|---|
| **orchestration operational-USD firing-block 은퇴 (v1.22.3 M3)** | `implement-dispatch/budget.js`·`plan-fanout/budget.js`(hard_ceiling skip을 `usdBomb` gate로 · `AUTODISABLE_TIERS_DEFAULT` `{critical}`→**empty** · **catastrophic-USD gate 신설** · runaway clamp를 **전 run 경로**로) + `orchestration-runaway.js`(`parseUsdBomb`·`parseCatastrophicUsd`·**원자 `reserveWorkers`**) + `auto-chain.js`(hard_ceiling abort → catastrophic-USD abort 정렬) + `commands/work.md`·`plan.md`(forward + reserve 위임) + `orchestration-preview.js`(forward, read-only 유지) — M2 firing-preview를 실 dogfood에 돌려 **핵심 발화 실패 지점**을 표면화한 뒤 닫는 milestone. 정규 cost-state가 sticky critical($186.92 + `hard_ceiling`)이면 M1이 default를 반전했어도 병렬·fan-out이 **전부 미발화**(`hard-ceiling`)였다 — M1 fail-open은 cost-state **부재**에서만 green을 가정하므로 **존재하는 critical**을 못 뚫었고, 그래서 M2 live row(A/B)도 비어 있었다. M3은 운영자 철학(비용<품질, cost gate는 환각 최소화 목적이지 절감 아님)을 USD-blocking 표면 전반에 관철하되, **Codex R1(No-ship, 2H+2M)을 흡수**해 "USD를 그냥 은퇴하고 agent-count cap에만 맡긴다"는 순진한 설계를 **다층 대체 backstop**으로 교체: **F1**(catastrophic-USD 상한 `MCCP_ORCHESTRATION_CATASTROPHIC_USD` default 500 — operational $100과 분리된 대체 bomb detector; $186 통과·$500+ 차단) · **F2**(read-then-bump TOCTOU → 단일 lock 임계구역 원자 `reserveWorkers`; lock 고갈 시 **granted 0 fail-closed**(4라운드 R1 F1이 초안의 degrade=1을 정정 — 아래) + clamp 전 run 경로 확장) · **F3**(auto-chain hard_ceiling abort를 catastrophic-USD로 정렬 — 발화는 auto-chain 이전이라 오라클만 열면 stall이 뒤로 밀릴 뿐; telemetry-integrity·`chain_aborted` trigger는 불변) · **F4**(`MCCP_ORCHESTRATION_USD_BOMB` 표준 `1|true|yes|on` + unknown non-empty→off+**loud warn** — rollback path라 오타 은폐 금지). **mechanical A/B 검증**(LLM 0): 동일 seeded sticky $186에서 usd_bomb off → `ok-run`+`parallel_fires:true`, usd_bomb=1(M1 등가) → `hard-ceiling` skip. 명시 tier override는 두 default보다 항상 우선(불변). merge-strategy·single-partition·budget gate 무변경. dual-review·receipt chain 무손상(gate 값 조정만). `1.22.2 → 1.22.3` patch. **PR-Codex R1 흡수(같은 브랜치 follow-up)**: **F1**(design/a11y-only non-approve가 **불투명** 차단) → `isActionable`을 `deriveEffectiveReview` 순수 오라클로 대체하되, **non-approving 상태는 유지하고 불투명함만 제거**한다(Implement-Codex R1 F4 흡수 — 초안은 이를 실효 `converged`로 매핑했으나 철회). 효력 범위는 정확히 **감사 정직성 + review 표면 투명성**이다 — `codex_actionable_findings`에는 mechanical hard-stop이 없으므로(pr.md는 파싱만, validate-cmd 미차단) "PR이 막힌다"가 아니라 **receipt가 `divergent`로 봉인돼 dedupe가 fail-closed → 후속 PR-Codex 실발화** + PR body가 이의를 명시한다는 뜻이다. 초안의 `converged` 매핑이 위험했던 이유도 정확히 이 축(dedupe 무력화)이다. 근거: drop 판정은 자유 텍스트 키워드 매칭이고 producer는 검증할 `category`/scope 필드를 **emit하지 않으므로**, 키워드 증거는 finding을 **라우팅·감사**할 만큼은 되어도 **통과를 승인**할 만큼은 못 된다(실측 반례 `"Brand asset loader reads arbitrary local files"` → veto 미매칭 + `\bbrand\b` 매칭 → drop → 초안대로면 보안 지적이 사라진 채 PR 통과). 원래 backlog 불만이 "차단"이 아니라 **"불투명"**이었으므로, `meta.codex_scope_excluded_verdict` + `meta.codex_raw_verdict`(R1 F4)를 **audit 신호**로 stamp해 PR body가 raw verdict·drop 건수·라우팅 소유자를 명시한다 — `resolution.codex_verdict`는 Codex가 실제로 말한 값(`divergent`) 그대로 봉인(dedupe 키이므로 거짓 converged 금지). **F2**(유령 예약) → 2단계 reserve/reconcile + pending lease(위 토글 2건). **F5**(자체 발견) → plan/implement가 `codex-bridge.parseVerdict`(free-text 스캔)로 verdict를 파생해 **본 사이클 R1을 `converged`로 오판**(finding 본문의 "converged로 찍으면 무결성 버그"라는 **경고문**을 키워드로 오인) → 거짓 converged 2개면 cross-gate dedupe가 PR-Codex를 통째 skip해 **dual-review 완전 우회**. 신규 `codex-review-payload.js`(구조화 `.result.verdict` 단일 SoT, **4게이트 공용**)로 이전하고 free-text는 **fallback 전용**으로 축소 — 게다가 fallback은 `divergent`/`critical`만 발급하고 **`converged`는 절대 발급 못 한다**(Implement-Codex R1 F3: schema drift 시 산문이 승인을 발급하면 F5가 그대로 되살아남. "스캔은 의심을 제기할 수는 있어도 승인을 증명할 수는 없다"). 같은 blindness가 4번째 게이트 `implement-dispatch/verify.js`(aggregate merged-verify, **default enforce**)에도 잔존해 `/mccp:work`가 commit 직전 "No ship"을 고무도장 찍고 있었고(실측), 동일 오라클로 전환해 닫았다. **Implement-Codex R1 나머지 2건**: F1(reconcile 실패가 launch 전 exit 0으로 성공 보고 → lease가 **실제 worker 미카운트**) → CLI exit을 `actualN` 분기(`>0` ∧ 미commit → exit 11) + work.md 재시도 후 fail-closed HALT(토큰 보존). F2(lease 경과 후 명시 reconcile이 자기 id를 pruned view에서 못 찾아 no-op → 10분 초과 fan-out의 실 agent 미카운트) → `readCounterRaw` 분리, **자기 id는 raw에서 먼저 찾고 expiry는 나머지에만** — 명시 증거가 lease의 추측을 이긴다. **F1 전제 복구(구현 중 발견)**: `codex-result-filter`가 실제 producer finding(`{severity,title,body,…}`)을 `category`/`text`로만 매칭해 v0.3.6 이래 **항상 identity**였음(receipt 18개 전부 dropped=0 실측) — `title` 매칭 추가로 F1이 dead code가 되는 것을 방지. `body`/`recommendation`은 의도적 미매칭(false-drop은 게이트를 조용히 약화, false-keep은 fail-closed라 비대칭). **PR-Codex R1 4라운드 흡수(No ship — 3건 전부 ACCEPT_NOW, backlog 이연 0)**: 세 건 모두 M3이 primary backstop으로 승격시킨 **agent-count cap 안의 구멍**이라, 하나라도 남기면 "USD를 열어도 원자 cap이 막는다"는 M3 헤드라인이 거짓인 채 ship된다(발화율이 낮다는 건 급하지 않게 만들 뿐 주장을 참으로 만들지 않음). **F1**(lock 고갈이 untracked worker를 grant — `granted:1` + write 없음 + `reservationId:null` → 호출당 1개씩 영영 미기록, cap 무한 우회) → `granted:0` fail-closed + 두 budget 오라클의 `n===0` skip + `resolveWorkRoute`의 `reserveDenied`→inline 강제(위 §4 상술). **F2**(fan-out actualN이 LLM 셸 변수 `${FANOUT_ACTUAL_N:-$RES_GRANTED}` — 표가 0이라 규정한 경로가 정확히 LLM이 그 추론에 도달 못 하는 경로 → default가 full grant를 **commit**, commit은 `open[]`을 떠나 lease 회수 불가 → **영구** 유령. 2단계 설계가 없앴다 주장한 문제의 재생산) → default **제거**가 정답(0으로 뒤집는 건 오답 — under-count는 cap이 절대 틀리면 안 되는 over-permissive 방향): LLM은 Workflow 결과를 아티팩트로 **받아적기만** 하고 매핑은 신규 `plan-fanout/reconcile.js#deriveFanoutActualN`가 소유, 아티팩트 부재 → `null` → **reconcile 미호출 + pending 유지**(pending이 곧 "모름"의 표현이자 자기치유 — lease까지 counted라 보수적). **F3**(malformed `--actual`이 예약을 0으로 release — 누락 → `Number(undefined)=NaN` → `reconcileReservation`이 0 강제 → 전량 차감 후 **commit** → **exit 0(성공)**; `--actual --session x` → `Number(true)=1`. exit 가드가 `Number.isFinite`를 요구해 NaN이 통과) → `runCli`가 **호출 전** non-negative integer 검증, 위반 시 `reconcileReservation` 미호출 + exit 2 + 예약 불변(모르면 pending). **PR-Codex R1 5라운드 흡수(No ship — 2건 전부 ACCEPT_NOW, backlog 이연 0)**: 4라운드와 **같은 규칙, 인접한 구멍**. 4라운드는 `reserveWorkers`의 **lock 고갈** 분기를 닫고 cap이 지켜진다고 믿었으나, 같은 함수의 **cap 도달** 분기는 열려 있었다. **F1**(cap이 도달 후 전혀 강제되지 않음 — `clampForRunaway`에 0 반환 분기가 없어 항상 floor 1이고 `reserveWorkers`가 이를 조건 없이 누적·기록 → cap=4 실측 `launched` 5,6,7,8,9… **무한**. cap이 아니라 병렬도 throttle이었고, USD를 은퇴시킨 M3에서 이 카운터가 유일한 backstop이므로 헤드라인이 거짓) → clamp를 **headroom-aware**로(`remaining===0`→`n:0`+신규 `cap-exhausted` · `0<remaining<requestedN`→`n:remaining` — 기존 floor보다 정확) + `reserveWorkers`가 `n===0`에 **write 없이** `granted:0`·`reservationId:null` 반환. floor의 명분("완전히 막지 않는다")은 호출자 **인라인 fallback**이 제공한다(4라운드가 이미 검증한 전제, 인라인은 cap 미소비). **pure oracle을 고친 이유**(fix-task 초안의 "clamp 손대지 말 것"을 정정): read-only 불변식은 *mutate 금지*이지 *공식 고정*이 아니고, preview만 floor 1을 유지하면 발화가 거부될 상황에서 "뜬다"고 보고하는 **false green-light**가 된다 — M2 Codex F1이 막으려던 그 유형. 실측으로 preview(`run:false/cap-exhausted`) ↔ reserve(`granted:0/cap-exhausted`) 일치 확인. **F2**(fan-out reconcile 3회 실패가 실제 launch를 카운터에서 지움 — pending 잔존 → lease가 prune → under-count. 코드 주석이 잔여를 "conservative over-count until the lease resolves it"이라 적었으나 lease는 해소가 아니라 **안전한 over-count를 위험한 under-count로 뒤집는** 것이고, 이는 lease 만료 건전성의 명시 전제("fan-out은 호출 후 전 경로 명시 commit")가 깨진 지점) → reconcile CLI가 `actual>0`·미commit 시 **lock-free debt 마커** 자동 기록 → `readCounter`/`reconcileReservation`이 만료 대상서 제외(마커가 lock-free여야 하는 이유는 debt를 낳는 유일 상황이 곧 lock 실패라 순환이기 때문). 마커는 기존 pending을 **고정**할 뿐 카운트 미가산(이중 계산 0), 뒤늦은 reconcile이 commit+청소. `work.md`는 route가 launch **전** 경계라 HALT로 충분해 debt 불필요(의도된 비대칭). **테스트가 버그를 정답으로 고정하고 있었다**: `cannot amplify past the cap`·`cannot exceed cap amplification`·`F2: cost-state absence CANNOT bypass the cap` 3개가 cap=8에 누적 11~12를 기대하며 통과 중 — 전부 per-dispatch `granted`만 보고 **누적 총량**을 안 봤다. 이제 총량을 assert. | v1.22.3-m3 ship |

### orchestration-firing-preview

| 모듈 | 역할 | 상태 |
|---|---|---|
| **orchestration firing-preview + 관찰 프로토콜 (v1.22.2 M2)** | `orchestration-preview.js`(CREATE — 순수 `previewFiring(opts)` + `require.main` CLI) + `lib/tests/orchestration-preview.test.js`(CREATE) + `docs/workflow-orchestration/live-activation-observations.md`(CREATE) — M1이 발화를 구조적으로 반전·배선했으나 실제 LLM-runtime 발화가 **관찰된 적 없던** gap을 닫는다. live `/mccp:work` 완주는 재귀·고비용이라 관찰을 두 축으로 분리: (1) **저비용 firing-preview 도구** — 현재 env·cost-state·runaway 카운터로 "지금 무엇이 발화할지"를 Step 3와 **동일 oracle**(`resolveFanout`/`resolveFleet`/`resolveWorkRoute`/`parseMergedVerifyMode`/runaway `readCounter`)을 read-only 조합해 **LLM 소비 0**으로 판정, (2) **operator-executed live 완주**(prp-implement 밖, 재귀 회피)의 관찰 기록·프로토콜. **핵심 correctness(Codex F1)** — oracle `run`은 component signal일 뿐 실발화는 `route`(resolveWorkRoute) + caller-gate 합성 `effective_fire`로 판정 → `oracle_run`(원자료)과 `effective_fire`(route 합성)를 **분리 출력**해 "oracle run == 발화" false green-light를 구조 차단(`ISOLATE=0`/partition N=1/runaway degraded → `run:true`여도 `parallel_fires:false`). `caller_gates.*_assumed`는 mid-run 아티팩트 투영 라벨(honest). **read-only 불변식(Codex F3)** — counter-bump 미import/호출 + cost-state·STATE.md 미write를 temp HOME/state 3파일 mtime/내용 불변 + 모듈 정적 부재로 mechanical 검증. **Codex F2** — 관찰은 default 발화 ∧ opt-out single **2개 named row 필수**(happy-path 1회로 미종료). preview는 Step 3 oracle을 **재구현 않고 동일 함수 호출**(byte-정합 test) → drift 구조 불가. read-only(발화 경로 미변경)라 dual-review·receipt chain 무손상. Task 5(실 LLM 발화 관찰)는 operator 수동(prp-implement 밖). `1.22.1 → 1.22.2` patch. | v1.22.2-m2 ship |

---

원본 표의 헤더/구분선 원문:

```
| 모듈                       | 역할                                                                                          | 상태         |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
```
