# CLAUDE.md — my-claude-code-plugin

> 이 파일은 Claude Code 세션 시작 시 자동 주입되는 프로젝트 instruction입니다.
> 여기 적힌 규칙은 기본 동작을 **override** 합니다. 반드시 준수하세요.

---

## 0. 응답 언어 (Response Language)

**모든 사용자 응답은 한국어로 작성합니다.**

- 사용자에게 보내는 모든 텍스트 메시지 — 진행 상황, 결과 요약, 질문, 오류 설명 — 는 한국어로.
- **PR 본문(GitHub PR description)도 한국어가 기본입니다.** Summary / Changes / Testing / Related Issues 같은 섹션 헤더는 영어 그대로 유지(템플릿 호환 + grep-친화성)하고, 본문 서술은 한국어로 작성합니다. 게이트가 자동 inject하는 섹션(`## Codex Adversarial Review`, `## Design Review`, `## Security Reviewer Override` 등)은 원본 영어 템플릿 그대로 둡니다.
- 다음은 영어를 그대로 유지합니다:
  - 코드, 식별자, 파일 경로, 명령어, 로그
  - 커밋 메시지 (recent commits이 imperative 영어 패턴 — `feat(v1.3.0-mN): ...`)
  - PR 본문 내의 file path, commit hash, gate name, receipt path, env var, code snippet
  - 외부 도구 출력(git, npm, codex 등)을 인용할 때
  - 기술 용어(plugin, hook, receipt, gate, fail-open, dual-review 등)는 번역하지 말고 그대로

사용자가 영어로 질문해도 응답은 한국어가 기본입니다. 사용자가 명시적으로 "영어로 답해줘"라고 요청한 경우에만 영어로 전환합니다.

PR 본문 한국어 작성 예시(M2 PR #34 회고용):

```markdown
## Summary

v1.3.0-m2는 LLM briefing stamp surface를 출시합니다 — receipt-write 경로가
capped LLM 호출 직후 `meta.briefing_summary` + `briefing_token_count` 등 4개 필드를
stamp합니다. Fail-open invariant + cost-tier × env policy × PR-phase re-entrancy
guard가 위에 얹혀 briefing 실패가 receipt write를 절대 오염시키지 않습니다.

## Changes

### Added
- `plugins/mccp/scripts/lib/briefing/{cost-guard,invoke,index}.js` — 3축 skip
  decision tree(env policy → PR-phase lock → cost tier) 와 Codex R1 F3 재진입
  guard(`BRIEFING_IN_PROGRESS` process-local flag)를 포함한 briefing facade.
```

식별자(`meta.briefing_summary`, file path, env var)는 코드 톤으로 그대로, 문장 서술은 한국어. 게이트 자동 inject 섹션은 손대지 않음.

---

## 1. 이 프로젝트는 무엇인가

`my-claude-code-plugin` (코드명 **mccp**) 은 skypark207 개인용 Claude Code plugin monorepo입니다.

### 1.1 출처 (Fork Lineage)

| 원본             | 라이선스    | 가져온 부분                                              | 위치                                            |
| ---------------- | ----------- | -------------------------------------------------------- | ----------------------------------------------- |
| **ECC**          | MIT         | Phase 게이트 enforcement, hook 구조, 47개 skill          | `plugins/mccp/` (fork + namespace 이전)         |
| **impeccable**   | Apache-2.0  | 디자인 critique skill (`Skill(impeccable, ...)` 호출 패턴 보존) | **번들 안 함 — 사용자가 별도 plugin 설치** (버전 분리 + namespace 충돌 회피) |
| **codex plugin** | (별도 설치) | adversarial review용 외부 model 호출                     | 런타임 의존성 (아래 §1.2 참조)                  |

mccp는 ECC를 단순 의존하는 게 아니라 **fork 후 self-contained 패키지로 재구성**했습니다. `~/.claude/rules/`, `~/.claude/hooks/` 같은 ECC 원본의 user-level scatter 의존성은 모두 plugin 내부로 흡수됨. impeccable은 의도적으로 번들 제외 — mccp 본문이 `Skill(impeccable, ...)`을 그대로 호출하므로, mccp 안에 vendor하면 namespace가 `mccp:impeccable`로 바뀌어 호출이 깨집니다 (commit `2116c43`에서 제거 결정). 자세한 attribution은 [NOTICE](NOTICE) 참조.

### 1.2 핵심 가치: Multi-Model Dual Reviewer

mccp의 차별점은 **Claude(Opus) ↔ Codex(GPT-5.4 계열) cross-model adversarial review**입니다.

- Claude가 plan/implement/PR을 작성 → Codex가 review → 두 모델 모두 APPROVE해야 게이트 통과.
- 같은 모델이 작성하고 review하는 single-model blind spot을 방지 (skill `mccp:ai-regression-testing` 패턴 참고).
- `codex` plugin은 **강력 권장 의존성**입니다. 호출 경로 (v0.2.2):
  - Skill interface `codex:adversarial-review`는 codex plugin의 skill index에 **존재하지 않음** + `/codex:adversarial-review` slash command는 `disable-model-invocation:true`로 차단. 두 경로 모두 막힌 상태.
  - v0.2.2부터 mccp commands(plan/prp-implement/pr)는 **Bash 직접 호출**로 `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review`를 통해 codex-companion.mjs를 호출 (fail-closed wrapper, exit 12 = blocking, classification enum 11종).
  - Codex unavailable 시 **fail-closed 기본**: 모든 non-`ok` classification은 `blocking=true`로 게이트 미통과. `MCCP_ALLOW_CODEX_UNAVAILABLE=1`로만 advisory mode 활성(non-approving receipt). 단, **terminal `/mccp:pr`은 Phase 0 preflight에서 advisory mode를 명시적으로 거부** — gh 호출 전 즉시 exit 1, receipt 미작성 (R2#2 commitment).
- **v0.2.2 `MCCP_RECEIPT_GATE_MODE` 토글 라이브**:
  - `hard` (default — chain-of-custody 유지) — 누락/skipped/advisory receipt는 게이트 미통과
  - `soft` (opt-in only) — 누락 receipt만 통과, stale/blocking/critical은 여전히 차단
  - `off` — receipt 게이트 비활성 (loud stderr warning, 디버깅 전용)
- **v0.2.8 PR step 보호 (Task 2.6.1 B+D+C)**: `/mccp:pr` + `/mccp:prp-pr`는 cross-gate dedupe + review-only invariant 양축으로 dual-review 가치를 보존합니다. 같은 decision-slug에 대해 plan-codex + implement-codex 양쪽 모두 `codex_verdict='converged'`이면(v1.20.3 — 실제 Codex verdict 기반, fail-closed) PR step의 Codex 재호출은 skip되고 receipt에 `codex_dedupe_at_pr=true`가 기록됩니다. dedupe 조건 미충족 시에만 Codex가 실제로 발화하지만, 발화한 경우에도 findings는 PR body의 `## Codex Review` 섹션에만 inject되며 본문 command가 Edit/Write를 호출하지 않는 review-only invariant가 runtime PR-phase guard hook (`pr-phase-guard.js`)로 mechanical하게 보호됩니다. Codex 호출 자체를 명시적으로 우회해야 하는 경우 `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"` audited escape (§4 운영 토글 참조).
  - **v1.20.3 무결성 복구**: 이전에는 dedupe가 실제 Codex verdict가 아니라 receipt-write 시 항상 `true`로 default되던 `resolution.converged`를 검사해, divergent 판정도 조용히 skip되던 결함이 있었다(dual-review invariant 무력화). 이제 신규 present-only 필드 `resolution.codex_verdict`(enum `converged|divergent|critical|unavailable|skipped`)를 검사하며, 부재(구 receipt)·divergent·기타 값은 모두 fail-closed로 skip 불가 → PR-Codex 실행. plan/implement command body는 `$CODEX_VERDICT` **전용 변수**(design-critique `$RECEIPT_VERDICT`와 분리)로 실제 verdict를 forward하고, `/mccp:pr` 진입 시 stale `CODEX_DEDUPE_AT_PR` env를 hard-reset한다.
  - **dedupe 발화 전제 — plan `Files to Change`는 repo-root full 경로로 작성**: `receipt/dedupe.js`의 planned matcher는 plan 표의 첫 열을 git diff 경로와 **리터럴/glob 매칭**한다(경로 prefix를 유추하지 않음). plan이 축약 경로(`receipt/schema.js`)를 쓰고 실제 diff가 full 경로(`plugins/mccp/scripts/receipt/schema.js`)면 매칭 실패 → 모든 파일이 residual로 떨어져 `skip_safe=false`가 된다(양쪽 게이트가 converged여도). 즉 dedupe 최적화가 조용히 불발하고 PR-Codex가 (이미 수렴한 planned 파일에 대해) 다시 돈다 — 이는 fail-closed라 안전하지만 비효율이다. **plan의 `Files to Change` 표는 항상 repo-root 상대 full 경로**로 작성하라(P1 PR #86 회고: 축약 경로 탓에 dedupe 불발 → `MCCP_PR_SKIP_CODEX_REVIEW` audited escape로 우회).
- Codex 미설치 사용자는 `/codex:setup`로 인증 권장.

### 1.3 자동화 파이프라인 (v0.1 receipt chain)

PRD부터 PR까지 전 라이프사이클을 단일 namespace(`/mccp:*`)로 자동화합니다. v0.3.1+ 부터는 **`/mccp:work <feature>` 단일 entry**로 전체 chain을 자동 orchestration할 수 있습니다 — trivial 변경은 plan/implement를 건너뛰고 commit + pr로 직행, 새 기능은 full chain.

```
/mccp:work <feature>   ← 단일 entry (v0.3.1+, trivial 자동 분기)
/mccp:resume           ← alternate entry (v1.1.0+, STATE.md handoff_spawn 신호 시 권장)
        ↓
        ├─ trivial path: /mccp:prp-commit → /mccp:pr
        │
        └─ full chain:
            /mccp:plan-prd      → 문제 정의 PRD
                    ↓
            /mccp:plan          → 구현 plan + Codex adversarial review (R1/R2 수렴)
                    ↓
            /mccp:prp-implement → plan 실행 + Implement-Codex review + cross-gate dedupe
                    ↓
            /mccp:code-review   → 변경 코드 multi-perspective review   (alias: /mccp:review-pr — PR Review Mode)
                    ↓
            /mccp:prp-commit    → 자연어 파일 타겟팅 커밋
                    ↓
            /mccp:pr            → 디자인/보안/Codex review 통합 후 GitHub PR 생성   (alias: /mccp:prp-pr — verbatim)
```

각 chain step은 개별 호출도 가능 (subcommand 그대로). `/mccp:work`는 위 sequence를 자동으로 묶을 뿐 — trivial vs full 분류는 [work-orchestrator.js](plugins/mccp/scripts/lib/work-orchestrator.js)의 5중 AND 휴리스틱 (file count ≤ 2, LOC ≤ 20, ext ⊂ {md,txt,json,yaml,yml}, no new files, no source-code signature) + 보수적 default = full. `--full` / `--trivial` override 지원.

`/mccp:resume`는 v1.1.0 Stage 1에서 도입된 honest handoff resume entry입니다. `MCCP_AUTO_HANDOFF=notify` (default)가 STATE.md에 남긴 `handoff_spawn` 신호를 읽고 적절한 다음 명령(`/mccp:work --resume task=…` 또는 `/mccp:prp-implement --apply-fix-task`)으로 dispatch합니다. 2-phase atomic dispatch (`resume_dispatching` marker → success-only `resume_dispatched`)로 mid-dispatch crash를 견딥니다. STATE.md에 handoff 신호가 없으면 noop으로 종료.

각 단계는 **receipt** (`.claude/receipts/*.json`)를 발행하고, 다음 단계는 이전 receipt chain을 검증한 뒤에만 시작합니다 (mechanical enforcement). 단 enforcement 강도는 게이트 종류에 따라 다릅니다 — terminal `/mccp:pr`은 receipt 누락 시 hard-block이지만, 비-terminal 게이트(plan/prp-implement/resume)는 v1.3.1 **informational allow-path**를 따릅니다: **missing-only** upstream receipt(stale/blocking/critical 부재)는 정보성 ALLOW + hook context 주입으로 자동 복구되고, stale/blocking/open-critical이 하나라도 있으면 여전히 차단됩니다. receipt 운용 모드는 §1.2의 `MCCP_RECEIPT_GATE_MODE` 참조.

v0.2.9부터 각 게이트는 R1 default + YAGNI triage로 R2/R3 escalate 결정. `DEFER_TO_BACKLOG` 항목은 [.claude/plans/codex-findings-backlog.md](.claude/plans/codex-findings-backlog.md) 단일 파일에 누적. cap override: `MCCP_GATE_ROUND_CAP=1|2|3` (default 1, §4 운영 토글 참조).

### 1.4 v0.2 자동 게이트 레이어 (receipt chain 위)

brainstorming 분석 결과 v0.1의 receipt chain은 *"adversarial review가 일어났는가"* 만 검증하고, *"사람이 감시해야만 다음으로 넘어가는 chokepoint"* 는 그대로 남아 있었습니다. v0.2는 receipt chain 위에 자동화 layer 5개를 얹습니다 (자세한 sequence diagram + module boundary는 [docs/v0.2-architecture.md](docs/v0.2-architecture.md)):

| 모듈                       | 역할                                                                                          | 상태         |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| **Stop-loop**              | Claude stop 직전 자동 `lint → typecheck → test → e2e` + (opt-in) Codex diff review. fail 시 `fix-task.md` 생성 + loop-counter bump; `MAX_COUNT=2` 도달 시 human-takeover + allow (hook 자체가 자동 재시도하는 게 아니라, 실패마다 카운터를 올리고 cap 도달 시 통과시키는 bounded 실패 카운터) | S8 ship      |
| **STATE.md continuity**    | `PreCompact`에서 write, `SessionStart`에서 inject — 세션 간 컨텍스트 자동 복원                | S10a ship    |
| **Auto-handoff**           | 누적 비용 $50 notice / $80 soft / $100 hard ceiling 임계 자동 검출 → STATE.md `handoff_spawn` 신호 write + stderr 배너. 실제 세션 전환은 `spawn` 모드만 시도하며 v1.1.0+부터 experimental opt-in (`MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1`)이 없으면 `notify`로 강등. 다음 세션에서 `/mccp:resume`로 resume 권장. | S10b ship (v0.3.0), v1.1.0 honest |
| **`/mccp:work`**           | 단일 entry로 PRD → plan → implement → PR 전 chain 자동 orchestration                          | S11 ship (v0.3.1) |
| **dual-reviewer escalate** | CRITICAL/divergent 시 `fix-task.md`에 `Next: /santa-loop ...` 안내 추가 (자동 호출은 안 함)   | S12 ship (v0.3.2) |
| **Codex disabled honor**   | wrapper(codex-invoke.js)가 `MCCP_CODEX_DISABLED=1` 감지 시 spawn 직전 short-circuit + classification='disabled' 즉시 반환. caller(codex-runner / receipt)는 `codex_outcome='disabled'` + `meta.codex_disabled=true` + canonical reason='codex_disabled' 일관 기록. 영구 bypass 사용자에게 우회 env(`MCCP_ALLOW_CODEX_UNAVAILABLE` / `MCCP_PR_SKIP_CODEX_REVIEW`) 0회 chain | M8 ship (v0.3.5) |
| **Codex/impeccable scope split** | impeccable 가용(`impeccable-detect`의 user-level skill probe 포함) 시 (1) codex-invoke.js가 focus 앞에 `DESIGN_SCOPE_PREAMBLE` prepend → Codex가 visual/color/typography/spacing/animation/micro-interaction/brand finding 미배출 + a11y는 impeccable a11y-architect에 routing 명시, (2) codex-result-filter.js가 Codex 응답에서 design/a11y keyword 매칭 finding을 drop + a11yRoutedCount stash, (3) receipt meta 4 fields(`codex_design_scope_excluded`, `design_findings_dropped`, `a11y_routed_to_impeccable`, `dropped_findings_digest`) audit. impeccable 미가용 시 no-op. `MCCP_CODEX_DESIGN_SCOPE_HONOR=0`로 kill switch (debug용). | v0.3.6 ship (축 1 + STATE.md content-hash skip(축 2) + derive-decision normalize(축 3) bundle) |
| **dispatch-controller (Stage 2 M1)** | Foundation IPC for multi-worker fanout. Envelope schema (`<parent_cwd>/.claude/state/dispatches/<uuid>.envelope.json`, pending nonterminal + ok/failure/timeout/crashed terminal), hybrid Monitor+polling watcher, atomic worktree→parent sync, pure-lib controller (`prepareDispatch` + `mergeEnvelopes`, no Agent calls). Receipt schema 4 new optional `meta.*` fields with marker-gated all-or-nothing invariant (F2 absorption) + `meta.ipc_envelope_path` triggers validator envelope integrity check (F3 absorption). Heartbeat + `reclaimStale` host-aware tri-state policy mirrors `pr-phase-lock.js` (F4 absorption). M2 pilot fanout + M3 stale-envelope GC deferred. Caller(slash-command body)가 Agent 호출 + controller는 그 결과만 merge — controller-self Agent invocation은 lib에서 불가. dual-review 보존: cross-gate dedupe가 controller-worker 양쪽 모두에서 작동, worker 받은 attribution 3개 필드로 receipt가 controller session에 anchor됨. | v1.2.0-m1 ship |
| **v1.3.0 schema baseline** | [docs/v1.3.0-observability/schema-surface.md](docs/v1.3.0-observability/schema-surface.md) 본문화 — receipt + envelope + STATE.md frontmatter의 read-side schema surface freeze. v1.3.0 dashboard derive engine (M1+) 가정 표준. envelope `validate()`가 strict additionalProperties:false로 통합 (Codex Plan-Codex R1 F3 absorption) + PRD body amend로 stale `handoff_dispatching/handoff_dispatched` 식별자 제거 (F1 absorption) + reconciliation doc 추가 ([state-md-naming-reconciliation.md](docs/v1.3.0-observability/state-md-naming-reconciliation.md)). receipt schema는 변경 없음. | v1.3.0-m0 ship |
| **derive engine (v1.3.0-m1)** | `plugins/mccp/scripts/derive/*` — `.claude/` 9 source(plans/receipts/STATE/backlog/fix-task/PR/envelopes/ledger/worktrees)를 단일 normalized model로 통합. read-only, LLM-free, dep-free. 6 correlation kinds(receipt↔envelope 4-axis equality, state↔envelope controller/resume, receipt↔plan one-pass hash index, backlog↔plan, fix-task↔STATE). Mask-by-default + `--raw` opt-in (Codex F2). M0 schema contract runtime probe + `--strict` exit (Codex F4). Loud-fail-open per-source `degraded` flag (Codex F3). M2 briefing stamp + M3 STATUS.md renderer가 input으로 소비. | v1.3.0-m1 ship |
| **briefing stamp (v1.3.0-m2)** | `plugins/mccp/scripts/lib/briefing/{cost-guard,invoke,index}.js` — receipt write path가 capped LLM 호출로 `meta.briefing_summary` + `briefing_token_count` + `briefing_token_estimated` + `briefing_invocation_count` 4 필드를 stamp. fail-open invariant(briefing 실패는 receipt write를 절대 poison 안 함). Cost-tier ≥ notice ($50) 자동 disable + `MCCP_BRIEFING=off` kill switch + `pr-phase.lock subphase=codex-review` 시 자동 skip(Codex R1 F3 PR_PHASE_LOCKED). `receipt_hash` carve-out으로 stamp가 tamper-detect digest를 무력화하지 않음(Codex R1 F1, deep-clone via JSON parse). Token count는 (focus+stdout) length 기반 estimate, real `tokenUsage` 발견 시 flip하여 `briefing_token_estimated=false`(Codex R1 F2). derive `sources/receipts.js`가 3 필드를 read-only로 surface해 M3 timeline renderer가 소비. | v1.3.0-m2 ship |
| **STATUS.md + HTML renderer (v1.3.0-m3)** | `plugins/mccp/scripts/lib/renderer/*` — derive model + M2 briefing fields → `.claude/cache/STATUS.md` + `status.html`. 6-section deterministic verdict(11-step priority chain) + briefing surface + worker fanout graceful hide. Codex R1 4 absorptions: F1 M3-local `parsers/plan-body.js`(M1 surface immutable), F2 outer `safeFallback` outer-catch(renderStatus는 throw 안 함), F3 verdict step 7.5 controller_active fallback(envelope 미존재 시 controller 신호 surface), F4 `escapeHtml`/`escapeAttr`(local artifact self-injection 방어 + 4종 payload test). impeccable P1(amber appliesTo:'icon')/P2(raw blockquote + idle text)/P3(degraded source 이름 + anchor 안정성) absorption. Pure function of derive model. No new dep. M4 owns refresh triggers; M5 owns snapshots. CLI: `node plugins/mccp/scripts/derive/cli.js render`. | v1.3.0-m3 ship |
| **Refresh trigger + privacy guard (v1.3.0-m4)** | `plugins/mccp/scripts/lib/renderer/trigger.js` + `plugins/mccp/scripts/hooks/render-trigger-session-start.js` — 4 trigger paths (SessionStart hook / receipt-write epilogue / envelope write / envelope-move watcher) refresh `.claude/cache/STATUS.md` + `status.html` within ~5s of any state change. 5s content debounce + 90s render lock (host-aware tri-state reclaim per §3.6) + unique pid+random tmp names. Loud fail-open invariant — trigger NEVER throws (Codex R1 F1+F4 absorptions). Privacy guard: `derive/mask.js#maskSecrets` 5 regex catalogue (`sk-key`, `aws-key`, `private-key-block` severe + `bearer`, `password-eq` quiet) scans envelope `next_action`/`findings[*]`/`receipts_added[*]` at source-scan time (envelopes.js emits additive `masked_payload_signal`; raw payload NEVER stored — F3 absorption) and `receipt.meta.briefing_summary` via `applySecretMask`. F2 absorption: `applySecretMask` runs unconditionally including `--raw`; only `applyPathMask` honors `--raw`. Verdict step 1.5 fires red banner for severe hits; audit-timeline footnote surfaces aggregate per-kind statistics + `was_stale` (cache > 60s) stamp via `.last-render.json`. impeccable Acceptable 26/40 F1-F5 absorbed (telegraphic Korean, no em dash, severe-only red, source_id 노출, Bearer/password= 조용한 mask). M5 owns daily snapshots. | v1.3.0-m4 ship |
| **cwd-mask + branch-validation polish (v1.4.x patch)** | `session-ledger.js#isValidGitBranch` + `liftLegacyBranch` (read-side lift, write-side strict) — git ref-format invariant 강화 + 기존 wonky-branch v2 ledger silent drop 방지. `read → lift → validate` 4 call-site invariant (Codex R2 F1) + module-level Set memo로 per-process per-path 1회 stderr WARN cap (R2 F3). `derive/sources/receipts.js`가 `meta.cwd` emit + `derive/mask.js#maskPath` outside-root 변환 (`<outside-repo:safeTrailingSegment>` placeholder, R1 F3 + R2 F2 platform-independent basename) — sibling worktree/parent/UNC/cross-drive receipt cwd raw leak 0. plugin.json `1.8.0 → 1.8.1` patch bump. | v1.4.x patch ship |
| **work implement isolation (v1.20.2 M1)** | `scripts/lib/dispatch-cli.js` (`prepare-single`/`merge`/`mark`) — dispatch-controller substrate(v1.2.0-m1)를 single-worker로 재사용해 `/mccp:work` Step 3의 implement를 격리 worker Agent로 위임(최대 컨텍스트 누적원 격리, 메인은 envelope 요약만 회수). worker는 implement까지만 소유 — commit/PR은 controller Step 4/5 전용(Codex F1: prompt guardrail + merge가 mccp-pr-codex receipt 유입 시 invariant HALT). 동기 단일 worker `skipHeartbeat:true`(Codex F2: stale-reclaim 대상 제외). repo-relative `ipcEnvelopePath` 별도 emit으로 receipt attribution fail-closed 회피(Codex F3). Task 0 spike로 self-contained worker prompt 실증(nested Skill 의존 없음). `MCCP_WORK_ISOLATE_IMPLEMENT=0` kill switch(인라인 fallback). standalone `/mccp:prp-implement` 미적용. `1.20.1 → 1.20.2` patch bump. | v1.20.2-m1 ship |
| **plan fan-out (v1.20.4 M1)** | `scripts/workflows/plan-fanout.js` + `scripts/lib/plan-fanout/{perspectives,budget,synthesize}.js` + `agents/fanout-{architect,security,test,explorer}.md` — `/mccp:plan`의 GROUND를 **read-only 다관점 병렬 fan-out**으로 강화. 4개 전용 read-only agent(`tools: Read/Grep/Glob`만 — write/edit/bash **도구 부재**로 파일 변형·receipt write 구조적 불가, Codex F1)를 `Workflow` primitive `agent()`로 병렬 spawn → pure synthesize → plan body에 `## Multi-Perspective Fan-out` 주입. read-only + receipt 미기록이라 Codex dual-review·receipt chain **무손상**(fan-out 결과는 `plan_hash`에 포함돼 review됨). 비용: **default-off 명시 opt-in**(`MCCP_PLAN_FANOUT=on`, Codex F3) + fleetSize 고정(4) + `effort:'low'` + cost-tier autoDisable(notice+) + `budget.remaining()` 사전 skip + **cost-state 없으면 skip**(고비용 fail-closed, cost-guard fail-open과 의도적 차이 — Codex F2). Workflow throw/미가용 → 인라인 Pattern Grounding fallback(fail-open, plan 절대 안 막음). PRD artifact mode 전용(free-form 입력 미적용). Workflow 샌드박스에 `require` 부재 → workflow 스크립트는 oracle의 self-contained 포트(oracle은 tested reference + `budget.resolveFanout`은 caller-side 게이트). `1.20.2 → 1.20.4` patch bump. M2(implement 병렬화)·receipt attribution·자체 IPC 운명 이연. | v1.20.4-m1 ship |
| **single-worker Workflow 이전 (v1.20.7 M2a)** | `scripts/lib/implement-dispatch/result-schema.js` (`IMPLEMENT_RESULT_SCHEMA` + `deriveVerdict` pure oracle) + `scripts/workflows/implement-dispatch.js` (얇은 단일 `agent()` Workflow) + `dispatch-cli.js` (`emit-workflow-args`·`reconcile` 서브커맨드, worker prompt structured 반환 계약) + `commands/work.md` Step 3 재구성 — `/mccp:work` implement 위임 채널을 `Task`에서 `Workflow` `agent()`로 **등가 이전**(병렬화 전, M2b seam). 회수 판정을 **반환값 ∧ envelope ∧ receipt-store 3자 reconciliation**(`deriveVerdict`)으로 통일 — 기존 envelope-only `merge`를 Workflow·Task 양 경로에서 대체. verdict ∈ `ok|failed|invariant-violation|reconcile-mismatch|unanchored|result-unreadable`(invariant-first fail-closed). **Codex Plan-R1 3 HIGH 흡수**: F1(호출 후 fallback 경쟁 worker) → pre-invocation 경계 + `started` 표식 후 fail-closed HALT. F2(반환값 단독 SSoT) → 3자 hard reconciliation. F3(attribution de-anchor) → post-hoc anchor 검증 gate(marker+3-플래그 == `expectedAnchor` 아니면 `unanchored`). `MCCP_WORK_IMPLEMENT_WORKFLOW` default-off kill switch(3-state: 인라인/Task-격리/Workflow-격리) + Workflow 미가용 fail-open(Task 유지). dual-review 무손상(Implement-Codex worker 컨텍스트 불변, receipt 3-플래그 anchor, cross-gate dedupe 무변경). tmp 경로 worktree-safe(`git rev-parse --git-path`). `1.20.6 → 1.20.7` patch bump. M2b(N-worker `parallel` 병렬화·자체 IPC 완전 폐기·게이트 pipeline 합성) 이연. | v1.20.7-m2a ship |
| **N-worker parallel implement scaffold (v1.20.10 M2b)** | `scripts/lib/implement-dispatch/{partition,budget}.js` + `result-schema.js#mergeVerdicts` + `dispatch-cli.js`(`prepare-fleet`/fleet `emit-workflow-args`/N-way `reconcile`) + `workflows/implement-dispatch.js`(`parallel` seam) + `commands/work.md` Step 3 — M2a 단일 `Workflow agent()` seam을 `parallel(fleet.map(w => agent(w.workerPrompt,{isolation:'worktree',schema})))`로 확장하는 **완전한 병렬 스캐폴드**. `partition.js`가 plan을 **서로소 file-set**으로 분할(union-find: 파일 겹침·mirror 의존·shared manifest 교차 시 병합 → 전부 얽히면 N=1 fail-close; `partitionFromPlanText`로 plan markdown 파생). `resolveFleet`이 opt-in·**merge_strategy 구조 gate**·cost-state·tier·budget을 first-match 판정(`resolveFanout` 미러). N-way `mergeVerdicts`가 per-worker `deriveVerdict`(반환값 ∧ envelope ∧ store 3자)를 **fail-closed 집계**(most-severe-first: `invariant-violation` > `unanchored` > `partition-escape` > `reconcile-mismatch` > … ; 부분 성공도 전체 HALT). **Task 0 spike 실측 → `merge_strategy=disable-parallel`**: `isolation:'worktree'` 변경은 parent worktree에 자동 전파 안 됨(별도 디렉토리·branch·uncommitted) + 오케스트레이터 worktree collect API 부재 → 병렬 실행은 `MCCP_WORK_IMPLEMENT_PARALLEL=1` opt-in이어도 merge_strategy가 `worktree-merge`로 승격되기 전까지 **N=1로 안전 gate off**(M2a 단일 동작 무변화). **Codex Plan-R1 2H+2M 흡수**: F1(verdict-before-merge 순서 불변식 — 격리 worktree 결과만으로 판정, 집계 ≠ ok면 parent clean → 부분 적용 0 + mid-apply rollback), F2(prompt-only disjointness → 실제-diff subset 강제 + 신규 `partition-escape` verdict + dependency-aware collapse), F3(machine-readable `merge_strategy` flag → `resolveFleet` 소비), F4(post-merge integrated `node --test` 게이트; 단일 merged-diff adversarial review는 M3 이연). 자체 IPC **부분 폐기**(Workflow가 worker liveness 소유 → heartbeat/reclaim/watcher redundant, envelope는 attribution·reconcile 아티팩트로 존속). 단일 경로 back-compat 무손상 · dual-review 무손상. `1.20.9 → 1.20.10` patch bump(#94 audit P5가 1.20.9 선점 → rebase되며 1.20.10으로 상향; #92 P4는 1.20.8). M3(verify 네이티브화·단일 workflow-native adversarial-verify 스테이지·worktree-merge 활성화) 이연. | v1.20.10-m2b ship |
| **aggregate verify 네이티브화 + worktree-merge substrate (v1.20.12 M3)** | `scripts/lib/implement-dispatch/{verify,worktree-merge}.js` + `dispatch-cli.js`(`collect-worktrees`/`merge-apply`/`rollback-apply`/`verify-focus`/`verify-decide`) + `receipt/{schema,write,aliases,cli}.js`(신규 gate `mccp-implement-verify` + `meta.merged_verify_*`) + `commands/work.md` Step 3.verify — M2b가 backlog로 이연한 **통합 diff aggregate adversarial-verify**를 `/mccp:work`의 **필수 pipeline 스테이지**로 장착(PRD Open Question 1(c) 척추 답). worker 안(per-worker Implement-Codex) + workflow 외곽(/mccp:pr PR-Codex) 사이의 **통합 verify 층** — per-partition 리뷰가 놓치는 cross-cut 회귀(public API·import graph·shared config)를 test보다 깊은 cross-model(Codex) LLM 판정으로 잡는다. `verify.js`(pure oracle: `buildVerifyFocus` + `decideMergedVerify` + `parseMergedVerifyMode`)는 `codex-bridge.parseVerdict`/`detectCriticalCategory` 재사용. **DD6/Codex R1 F2 — 단일 경로에서도 발화**: 병렬이 gated(`disable-parallel`)여도 verify-네이티브화가 실제 runtime 가치를 획득(Axis A ⊥ Axis B). **DD2 cross-model 불변식**: invoker는 여전히 Codex — "adversarial-verify" 패턴은 worker 밖 독립 검증 구조만 차용, same-model skeptic 치환 아님(dual-review 무손상). **worktree-merge substrate**(`worktree-merge.js`: `buildWorktreeMap`/`collectWorkerDiff`/`assertPathsClean`/`applyDisjointDiffs`/`rollbackApplied`)는 build+unit-test 완비하되 **DORMANT** — Task 0 spike가 git 메커니즘(enumerate·apply·patch-scoped reverse-apply·rollback-safety=data-loss 0)은 **합성 실측으로 입증**했으나 live harness 상관(Workflow worktree↔dispatchId)은 **cost hard-ceiling으로 미실측** → `merge_strategy=disable-parallel` 유지(honest degradation, DD7). **Codex R1 4H 흡수**: F1(A2 artifact-격리 미비 → Mechanism 1 primary), F2(verify 양-경로 발화), F3(합성 decision → 실제 gate `mccp-implement-verify` produces-only·non-invasive), F4(광범위 checkout/clean → **patch reverse-apply**만, dirty feature branch data-loss 회피). 신규 gate는 어떤 command chain에도 미진입(validate-cmd/dedupe/PR-chain 비침습). merged-verify runtime HALT이 1차 enforcement, receipt가 audit anchor. `1.20.11 → 1.20.12` degraded patch(verify ship + 병렬 gated). worktree-merge 활성화(live 상관 입증)는 M4 이연. | v1.20.12-m3 ship |

자동 게이트는 환경 변수로 토글합니다 — §4 cheat sheet의 "운영 토글" 블록 참조.

---

## 2. Repository Layout (요약)

```
my-claude-code-plugin/
├── plugins/
│   └── mccp/                       ← 메인 plugin (Apache-2.0)
│       ├── .claude-plugin/plugin.json
│       ├── commands/               ← /mccp:* 슬래시 명령
│       │   ├── plan.md, plan-prd.md, prp-implement.md, prp-commit.md,
│       │   ├── code-review.md, pr.md, prp-pr.md, review-pr.md,
│       │   └── receipt-{status,validate,write}.md, santa-loop.md
│       ├── agents/                 ← mccp:* 서브에이전트 (code-reviewer, planner, …)
│       ├── skills/                 ← 가져온 skill 패키지
│       ├── hooks/                  ← Stop, SessionStart, PreCompact 등
│       └── scripts/
│           ├── hooks/              ← hook 구현 (session-start.js, pre-compact.js, …)
│           ├── state/              ← STATE.md continuity (state-injector/-writer)
│           └── lib/                ← 공용 유틸
├── ECC/                            ← 원본 ECC fork tree (참고용/diff용 보존)
├── docs/                           ← 설계 문서 (v0.2-architecture, v0.2-state-schema, gate-design)
├── .claude/
│   ├── PRPs/{plans,reports}/       ← 계획·구현 결과 산출물
│   ├── notes/                      ← 작업 연속성 노트 (mccp-v0.2-continuation.md)
│   ├── state/                      ← STATE.md + fix-task.md (git-tracked, 세션 간 연속성)
│   │                                  loop-counter.json + *.lock (gitignored)
│   ├── receipts/                   ← /mccp:* 게이트 receipt chain
│   └── settings.json               ← 프로젝트 setting/hook 등록
├── CLAUDE.md                       ← (이 파일)
├── README.md, NOTICE, LICENSE
```

---

## 3. 작업 관행 (Working Conventions)

### 3.1 게이트와 receipt를 우회하지 마세요

- `/mccp:plan` 출력 없이 plan 작성을 시작하지 마세요. 게이트는 단순 의례가 아니라 dual-review를 강제하는 메커니즘입니다.
- receipt 누락/손상 시 다음 게이트는 `/mccp:receipt-validate`로 진단 후 `/mccp:receipt-write`로 복구하세요. **재실행보다 복구가 저렴합니다.**
- `MCCP_RECEIPT_DEBUG=1` (.claude/settings.json)로 디버그 출력 활성화 가능.

### 3.2 STATE.md 연속성

`.claude/state/STATE.md`는 세션 간 연속성을 보존하는 단일 진실 원천입니다 (S10a v0.2).

- **git-tracked**: `STATE.md` / `fix-task.md` / `fix-task-applied.md`는 commit 대상입니다. worktree 리셋이나 pair-programming 핸드오프에서도 컨텍스트가 살아남도록 의도된 설계 (자세한 근거: [docs/v0.2-architecture.md](docs/v0.2-architecture.md) §7).
- `session-start.js` hook이 부팅 시 inject (`<system-reminder>` 블록).
- `pre-compact.js` hook이 compaction 직전 갱신.
- `session-end-trace.js` hook이 SessionEnd에 `.claude/state/hook-trace/<sid>/.end` marker를 write(+ per-shard consolidation·lease release). v1.20.5(audit P2)부터 **fail-loud-open** — hook-trace 모듈 로드 실패에도 `writeDegradedEndMarker`가 `fs` 직접 write로 marker를 보장하고 degraded 경로를 loud stderr로 표면화합니다(marker 누락 시 후속 세션 `scanCrashAlerts`가 false crash alert를 발화하는 문제를 닫음). 상세는 [docs/gate-design.md](docs/gate-design.md) L5 참조.
- 직접 편집하지 말고 `state-writer.js` API를 사용하세요 — frontmatter 스키마, advisory lock (fail-soft: ~1s 후 unlocked 진행 + loud WARNING; O_EXCL 기반이나 진정한 mutual-exclusion 보장은 아님 — 경쟁 시 last-writer-wins), CRLF normalization, schema version guard가 묶여 있습니다.

### 3.3 Codex 의존 작업의 실패 모드 (v0.2.2 fail-closed matrix)

[scripts/lib/codex-invoke.js](plugins/mccp/scripts/lib/codex-invoke.js)의 classification enum과 정합화:

| Classification | 원인 | 기본 동작 | Advisory mode 동작 |
|---|---|---|---|
| `ok` | 정상 응답 | 통과 (`blocking=false`) | n/a |
| `disabled` | `MCCP_CODEX_DISABLED=1` (v0.3.5 first-class skip) | 통과 (`blocking=false`, `advisory=false`) — spawn 직전 short-circuit, durationMs=0. receipt에 `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'` 자동 stamp. terminal `/mccp:pr` Phase 0 advisory-rejection 룰에서 예외. | n/a — intentional, not failure |
| `registry-missing` | `~/.claude/plugins/installed_plugins.json` 없음 | block (exit 12) | warn + 통과 (non-approving receipt) |
| `registry-malformed` | `installed_plugins.json` JSON parse 실패 (malformed) | block | warn + 통과 |
| `plugin-not-installed` | codex@openai-codex registry entry 없음 | block | warn + 통과 |
| `install-path-stale` | installPath가 디스크에 없음 | block | warn + 통과 |
| `companion-not-found` | `codex-companion.mjs` 미존재 | block | warn + 통과 |
| `companion-version-mismatch` | plugin.json version이 compatible list(1.0.x)와 다름 | block | warn + 통과 |
| `not-authenticated` | `not authenticated`/`setup_required` stderr 패턴 | block | warn + 통과 |
| `timeout` | 900s(15분) 초과 | block | warn + 통과 |
| `exit-nonzero` | companion이 exit 0 외 종료 | block | warn + 통과 |
| `stdout-empty` | exit 0이지만 stdout 빈 출력 | block | warn + 통과 |
| `spawn-enoent` | node 실행 실패 | block | warn + 통과 |
| `parse-error` | wrapper JSON parse 실패 | block | warn + 통과 |

위 표는 [`codex-invoke.js`](plugins/mccp/scripts/lib/codex-invoke.js)가 생산하는 **정확히 14종** classification입니다(주석 header enum과 1:1).

> **`tempfail` (exit 75)은 codex-invoke classification이 아닙니다.** codex-invoke 하위 계층이 아니라 [`scripts/receipt/classify.js`](plugins/mccp/scripts/receipt/classify.js) / validate-cmd 계층의 **transient outcome**입니다 — v0.2.8 generic-receipt quarantine migration이 in-progress(lock-loser bounded poll timeout)일 때 emit됩니다. 동작: retry-shortly · hook은 ALLOW · cli/preflight/auto-chain은 exit 75 (sysexits). 자세한 전파는 §4 cheat sheet의 "Generic-receipt quarantine runbook" tempfail propagation 항목 참조.

복구 옵션 (우선순위 순):

1. `/codex:setup` — 인증 + plugin 설치 상태 검증
2. `MCCP_ALLOW_CODEX_UNAVAILABLE=1` (한 호출만) — advisory mode. **terminal `/mccp:pr`은 거부**.
3. `MCCP_RECEIPT_GATE_MODE=soft` — opt-in. 누락 receipt만 통과.
4. `/mccp:receipt-write` — 게이트 receipt 수동 작성 (이유 명시 필수)
5. `MCCP_SKIP_RECEIPT=1` — 일회성 bypass (한 호출만)

자세한 fallback 매트릭스 + sequence diagram은 [docs/gate-design.md](docs/gate-design.md) 참조.

### 3.4 코드 스타일 / 컨벤션

- **언어**: 주력 코드는 JavaScript (Node 20+). 한국어 주석 허용 (기존 codebase에 다수 존재).
- **테스트**: 새 hook/스크립트는 `tests/*.test.js` 동반. Node native test runner (`node --test`) 사용.
- **comment 정책**: 일반 instruction과 동일 — *왜*가 명확하지 않으면 쓰지 않음. *무엇을 하는지*는 코드가 말함.
- **로그**: hook stderr 출력은 사용자에게 노이즈로 보일 수 있음. `COST WARNING`, `Stop hook feedback` 등은 신호 vs 노이즈 구분이 중요 ([memory: feedback-cost-not-stop-signal] 참조).

### 3.5 커밋·PR

- 커밋 메시지: 기존 스타일 유지 (예: `feat(mccp): ...`, `v0.2.1: ...`).
- PR 본문: `/mccp:prp-pr`이 템플릿을 자동 생성 — 직접 작성하기보다 명령을 통하세요.
- main 직접 push 금지. 항상 feature branch 경유.

### 3.6 Atomic state locks (`pr-phase.lock` + `v0.2.8-generic-receipt-quarantine.lock`)

v0.2.8 Task 2.6.1-followup F10+F11+F7 (PR #8)부터 mccp는 두 가지 state lock을 운용합니다. 둘 다 단일 writer + multi-reader, lease-based reclaim(PID liveness OR mtime>60s), in-loop heartbeat를 **공유**하지만, **ownership-token 모델은 서로 다릅니다** — `pr-phase.lock`은 hash + stdin-pipe sealed channel(canonical), `quarantine.lock`은 raw-token/advisory(lock body 평문 token, 0o600 보호). 아래 락별 구분을 참조하세요("양쪽 공통"으로 뭉뚱그리지 말 것).

| Lock file | 사용처 | 생명주기 |
|---|---|---|
| `<repo>/.claude/state/pr-phase.lock` | `/mccp:pr` Phase 3.5 Codex-review subphase 진입/이탈. PreToolUse가 write-tool block 결정에 사용. | enter (Phase 3.5 직전) → exit (PR 본문 inject 직후, gh pr create 직전). crash 시 다음 invocation의 `detect-stale`이 finalizer 우선 실행 후 clear. |
| `<repo>/.claude/receipts/.migrations/v0.2.8-generic-quarantine.lock` | validate-cmd / `/mccp:pr` Phase 0 부팅 시 동시 trigger 직렬화. winner만 rename 수행, loser는 marker complete bounded poll. | acquire (`fs.openSync wx`) → release (try/finally). |

#### Ownership-token 모델 (락별 상이 — "양쪽 공통" 아님)

**`pr-phase.lock` — canonical hash + stdin-pipe sealed channel** ([`pr-phase-lock.js`](plugins/mccp/scripts/lib/pr-phase-lock.js))

```json
{
  "ownership_token_hash": "<sha256 of writer-side random token>",
  "pid": 12345,
  "host": "<hostname>",
  "started_at": "<ISO>",
  "mtime": "<lease anchor>"
}
```

- **`ownership_token_hash` (v0.2.8 F11 redesign)**: writer가 `crypto.randomUUID()`로 생성한 token의 sha256만 lock body에 기록. raw token은 writer 메모리에만 존재. release 시 writer가 stdin pipe로 raw token을 helper에 sealed channel로 전달 → helper가 hash 재계산 후 match → unlink. 외부 reader가 lock 파일을 읽어도 token을 위조할 수 없음 (F11 IPC contract). 이전 `ownership_token` (raw token 기록) 방식은 v0.2.7 schema로 deprecated.
- **Stdin-pipe IPC contract**: writer ↔ helper 간 모든 mutating call (enter/exit/release)은 stdin pipe로 token 전달. command-line argument로 token 전달 금지 — process listing 노출.

**`quarantine.lock` — raw-token / advisory** ([`migrations/v0.2.8-generic-receipt-quarantine.js`](plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js))

```json
{
  "pid": 12345,
  "started_at": "<ISO>",
  "host": "<hostname>",
  "token": "<raw crypto.randomUUID() — 평문>"
}
```

- **raw token in-body**: `acquireLock`이 `crypto.randomUUID()` token을 lock body에 **평문**으로 기록합니다(hash 아님, stdin-pipe 아님). `0o600` owner-only 파일 모드로 shared-tenant에서 타 사용자 read를 차단. `releaseLock`은 `body.token === token` ownership 일치 시에만 unlink(zero-byte / unparsable / mismatch는 unlink 안 하고 lease reclaim에 위임).
- **잔여 리스크 (문서화된 것 — "무해"로 단정 금지)**: `releaseLock`에 **no-token legacy 경로**가 있습니다 — 호출자가 token 없이(`undefined`/`null`) release하면 ownership 검증 없이 unlink합니다(단 loud stderr warn). 현재 유일 호출자 `migrate()`는 **항상 token을 전달**하므로 실제 트리거 caller는 없지만, legacy / 직접 호출자가 이 경로를 타면 live holder의 락을 삭제할 수 있습니다. code hardening(no-token 경로 제거 / test-gate)은 PRD out-of-scope로 [backlog](.claude/plans/codex-findings-backlog.md)에 이연했고 P6은 문서만 정정합니다.

#### 공통 (양쪽 실제 공유) — lease + heartbeat

- **Lease + heartbeat**: orphan 판정은 `(recorded PID is dead via process.kill(pid, 0))` OR `(file mtime > 60s)`. 둘 중 하나라도 만족 시 reclaim. v0.2.7 이전의 `started_at` 기반 판정은 clock skew / PID reuse에 약함 — 폐기.
- **In-loop heartbeat**: 장기 작업(quarantine migration 8+ rename)이 lock 점유 중에는 25 step마다 `fs.utimesSync`로 mtime을 갱신해 live holder 보호. sync 함수에서는 `setInterval`이 fire 안 되므로 in-loop counter가 정답.

#### Legacy v0.2.7 upgrade scenario (host-aware tri-state)

v0.2.7 lock holder가 살아있는 동안 v0.2.8 binary가 부팅하면, v0.2.8은 v0.2.7 schema lock(=`ownership_token` raw value, no hash)을 발견합니다. F11 R2-F2 absorption per:

- `cmdEnter` startup pre-check + `tryReclaimStaleLock`의 legacy-schema discriminator가 (lock에 `ownership_token_hash` 부재) detect.
- Same-host + pid alive → **NEVER reclaim**. v0.2.7 holder가 정상 종료할 때까지 대기 또는 caller exit 75 (EX_TEMPFAIL).
- Different-host OR pid dead → 즉시 reclaim. 양쪽 schema 모두 정상 처리.

이 tri-state가 없으면 v0.2.8가 v0.2.7 live holder를 강제 reclaim → race 발생. PR #8의 R2-F2 commit이 핵심.

운영 detail (수동 quarantine 절차 + tempfail propagation 등)은 §4 cheat sheet의 "Generic-receipt quarantine runbook" 참조. lock 파일은 직접 편집 금지 — schema mismatch / token mismatch 시 release가 실패해 mtime 만료(60s)까지 차단됩니다.

---

### 3.7 Plugin version bump (`plugin.json`) — 빈번한 누락 axis

`plugins/mccp/.claude-plugin/plugin.json`의 `version` 필드는 **수동 bump**입니다. code 변경이나 commit chain만으로 자동 증가하지 않으므로, milestone PR을 작성할 때 의무 체크리스트의 일부로 처리해야 합니다.

#### 왜 중요한가

`claude plugin update`는 `~/.claude/plugins/cache/mccp/mccp/<version>/` 경로를 version 필드로 결정합니다. version이 그대로면:

- 새 cache 디렉토리가 만들어지지 않고 기존 디렉토리에 overwrite (best-case) 또는 update가 no-op (worst-case)
- 사용자 환경의 hook 호출 path(`${CLAUDE_PLUGIN_ROOT}/scripts/...`)가 worktree의 변경을 보지 못함
- 결과적으로 PR이 merge돼도 hook이 old behavior로 작동 → cache 직접 copy 같은 bootstrap workaround가 매 cycle 반복됨

cache 디렉토리 ls 결과로 누락 cycle을 진단 가능: 예를 들어 `0.2.8/ 0.3.0/ 0.3.1/ 0.3.2/ 0.3.4/ 0.3.6/ 0.4.0/ 1.1.0/`처럼 띄엄띄엄이면 그 사이 cycle들이 version bump을 빠뜨렸다는 의미.

#### 언제 어떻게 bump

bump 단위의 기준은 **"무엇이 완성됐는가"의 scope**입니다. PRD 전체(모든 milestone)가 적용·종료되면 minor, 그 안의 단일 plan/milestone(M1/M2/M3 개별) 수준이면 patch입니다. 개별 milestone은 새 기능 출시가 아니라 PRD라는 큰 기능의 *부분 개선*이므로 patch axis로 봅니다.

| 변경 종류 | scope | bump 위치 | 예시 |
|---|---|---|---|
| Patch — 단일 plan/milestone ship (M1/M2/M3 개별), bug fix, axis close, 개선 | 단일 plan | patch 자리 | `1.18.0 → 1.18.1` |
| Minor — PRD 전체 완료(모든 milestone 적용), 독립 신규 기능 | PRD 전체 | minor 자리 | `1.1.0 → 1.2.0` |
| Major — breaking schema/API/hook contract | 호환성 파괴 | major 자리 | `1.x → 2.0` |

판단 휴리스틱: "이 변경이 PRD의 마지막 milestone인가?" → YES면 minor 후보(나머지 milestone이 이미 ship됐는지 확인), NO면 patch. "새로운 기능 추가인가, 기존 표면의 개선인가?" → 개선이면 patch. 애매하면 patch가 보수적 default(minor는 PRD 종료 같은 명시적 신호가 있을 때만).

milestone 단위 sub-ship(`-m1`, `-m2` 등) 표기는 branch 이름엔 쓰지만 `plugin.json` version에는 `1.18.1`처럼 깔끔하게 적습니다(`-m1` suffix는 plugin manifest 스펙상 비표준). 같은 PRD의 여러 milestone을 연속 ship하면 patch 자리가 누적 증가합니다(M1 `1.18.0` 가정 시 M2 `1.18.1`, M3 `1.18.2` … PRD 종료 시 다음 minor로 정리). user-visible footer(`html.js` page-foot + `markdown.js` derived 줄)도 같은 version으로 동기화하세요 — plugin.json만 bump하고 footer를 빠뜨리면 surface 간 version drift가 생깁니다.

#### Milestone PR 의무 체크리스트

PR 작성 직전(또는 작성과 함께):

1. `plugins/mccp/.claude-plugin/plugin.json` — `version` 필드 bump
2. `CHANGELOG.md` — 새 row 추가 (이미 cycle에 묶여있을 때 많음)
3. branch 이름과 version의 일관성 검토 (예: branch `v1.2.0-orchestrator-m1` → version `1.2.0`)
4. PR title/body에 version 명시 (audit trail — reviewer가 cache directory 명을 예측 가능)

#### Hot-fix 절차 (PR merge 후 누락이 검출된 경우)

이미 PR이 merge됐고 사용자가 `claude plugin update`로 version stuck을 발견했다면:

1. 새 branch `chore/v<X.Y.Z>-bump`에서 `plugin.json` version bump을 단일 commit으로 작성
2. 커밋 메시지: `chore(release): bump plugin.json to vX.Y.Z`
3. follow-up PR (단일 파일 변경이라 cross-gate dedupe + Codex 빠르게 통과)
4. merge 후 `claude plugin update` 재실행 → `~/.claude/plugins/cache/mccp/mccp/<X.Y.Z>/` 새 디렉토리 생성 확인

#### 자동화 후보 (v1.2.x cycle 부채)

- pre-PR hook: `plugins/mccp/scripts/lib/*.js` 또는 `commands/*.md` 변경 검출 시 `plugin.json` version bump 요구 (semantic version 자동 추론은 hard — major bump 판단은 사람 몫)
- `/mccp:pr` Phase 1 VALIDATE에 version freshness check 추가 — 마지막 `plugin.json` 변경 commit이 `origin/<base>` 이후가 아니면 stderr warning
- `/mccp:plan` Phase에서 milestone-ship plan일 때 `Files to Change`에 `plugin.json`이 자동 포함되도록 요구

이 자동화 항목 자체가 v1.2.x patch cycle의 axis 후보입니다.

---

### 3.8 Worktree 경로 컨벤션 (`.worktrees/<branch-suffix>/`)

새 worktree를 만들 때는 **항상 repo 루트의 `.worktrees/` 하위**에 두세요. sibling 디렉토리(`../my-claude-code-plugin-<branch>/`)에 만드는 패턴은 금지입니다.

#### 규칙

```bash
# OK — repo 내부 .worktrees/ 하위 (gitignore 적용 + 자동 cleanup 가능)
git worktree add .worktrees/v1.3.0-observability-m0 v1-3-0-observability-m0-schema-baseline

# 금지 — sibling 디렉토리 (gitignore 보호 밖, parent repo로 끌려들어올 위험)
git worktree add ../my-claude-code-plugin-v1.3.0-m0 v1-3-0-observability-m0-schema-baseline
```

worktree 디렉토리 이름은 branch 이름과 1:1 매칭되도록 짧은 식별자를 쓰세요(예: branch `v1-2-0-orchestrator-m1` → `.worktrees/v1.2.0-orchestrator-m1/`). branch suffix를 그대로 옮기면 정렬·검색이 깔끔해집니다.

#### 왜 강제하는가

- `.gitignore` §52-54에 `.worktrees/`가 이미 등록되어 있어, 이 경로 안에서는 working-tree 산출물(`.claude/state/STATE.md`, `.claude/receipts/`)이 실수로 parent repo에 staged 되지 않습니다. sibling 디렉토리는 이 보호를 못 받습니다.
- `/mccp:pr`, `pr-phase-lock.js`, dispatch-controller(v1.2.0-m1) 같은 자동화는 `<parent_cwd>/.claude/state/`를 기준점으로 envelope/lock을 씁니다. worktree가 sibling이면 *worktree 자체*가 parent로 인식돼 envelope 라우팅이 어긋날 수 있습니다.
- multi-session dogfood(2개 이상 worktree 병렬)에서 `.worktrees/` prefix가 있으면 `ls .worktrees/`로 활성 branch 일람이 한눈에 보입니다.

#### 정리 (cleanup)

```bash
# 작업이 끝났거나 branch가 merged된 worktree 제거
git worktree remove .worktrees/<name>
git worktree prune          # stale entry 정리
```

PR merge 후 worktree를 잊고 남겨두면 stale `.claude/state/` 안에 오래된 STATE.md가 다른 세션 SessionStart에서 injection될 위험이 있으니, **PR squash 직후 같은 cycle 안에서 cleanup**까지가 한 단위입니다.

---

### 3.9 디자인 surface 변경 시 SKILL first-step + critique retry loop (v1.3.0-m2)

v1.3.0-m2부터 design surface를 건드리는 plan/implement/PRD는 `frontend-design-direction` SKILL의 **Output Constraints**를 Phase 진입 즉시 Read 후, impeccable critique을 bounded retry loop으로 돌립니다. M1이 silent-skip을 *관측*만 했던 axis를 M2는 *positive enforcement*로 닫습니다.

#### 언제 trigger (3-axis)

trigger는 OR — 한 축이라도 hit하면 SKILL Read + critique loop:

| Axis | Source | When |
|---|---|---|
| (a) detector positive | `impeccable-detect.js` `design_signal=true` | git diff에 UI 확장자/`.claude/design/*.design.plan.md`/whitelist path hit. 기존(M1). |
| (b) 좁은 whitelist 확장 | `DESIGN_SURFACE_PATHS` (M2 신규 3 path) | `impeccable-detect.js` 자체 / `design-critique-decide.js` / `skills/frontend-design-direction/` — design-gate control-plane 변경 자기-적용. `commands/*.md` 전체는 overshoot 회피로 제외. |
| (c) audited intent override | `MCCP_DESIGN_INTENT_REASON="<reason>"` env (strict validator — empty/1-token/URL-only/<30자/<3단어 reject) | 사용자가 "detector가 못 잡는 design routing 변경"을 명시할 때만. M1 `IMPECCABLE_FORCE_OVERRIDE_REASON` 룰 mirror. |

#### 4 출력 제약 (SKILL.md `## Output Constraints` anchor)

critique loop이 critique fail로 판정하는 anchor — M3 (output-constraints.js lint)가 같은 anchor를 mechanical 검증할 예정:

1. **정보 위계 3단계** — primary action → status → detail. Heading depth ≤ 3 in primary surface.
2. **강조색 화면당 1개** — Accent color/highlight token use ≤ 1 per viewport.
3. **raw markdown marker 금지** — Unrendered `**bold**`, MD0xx, stray inline code 미surface.
4. **한 화면 항목 수 상한** — `list-of-N` 섹션 상위 3개 expanded + 나머지 `<details><summary>+N more</summary>` collapse.

#### Bounded retry loop

| Round | Condition | Action |
|---|---|---|
| R0 | critique invoke + decideCritique enum | CONVERGED → 종료 / ESCALATE_NEXT_ROUND → R1 / DIVERGENT_UNRESOLVED → 즉시 종료 |
| R1~Rcap | critique fail 항목의 *명시 섹션*만 Edit | cap (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` default 2, 0~3) 도달 시 DIVERGENT_UNRESOLVED |

cap=0이면 R0 1회만 + verdict DIVERGENT_UNRESOLVED 즉시 — silent disable 불가 (loud stderr warn).

> `decideCritique` oracle의 실제 verdict enum은 정확히 `CONVERGED` / `ESCALATE_NEXT_ROUND` / `DIVERGENT_UNRESOLVED` 3종입니다([`design-critique-decide.js`](plugins/mccp/scripts/lib/design-critique-decide.js)). 본 문서 다른 위치의 `ESCALATE` / `DIVERGENT` 축약 표기는 각각 `..._NEXT_ROUND` / `..._UNRESOLVED`의 준말입니다.

#### Severity → fail (M2 oracle, F2 absorption)

`design-critique-decide.js#decideCritique`는 HIGH/CRITICAL/UNKNOWN(missing severity)을 fail-closed로 판정. lowercase/alias(`P0`/`P1`/`blocker`/`critical`) 모두 normalize. parse 실패 시 DIVERGENT (caller 책임).

#### Receipt audit trail

retry loop 결과는 `mccp-plan-codex` / `mccp-implement-codex` receipt에 4 신규 필드로 stamp:

- `meta.design_critique_rounds: int|null` — 실행 round 수
- `meta.design_critique_verdict: 'converged'|'divergent'|'skipped'|null`
- `meta.design_intent_reason: string|null` — axis (c) audited override reason
- `meta.pr_design_chain_skip_reason: string|null` — pr-step audited escape reason

#### PR step — critique invoke 제거 + chain-check 강제 (F3 absorption)

`/mccp:pr`와 `/mccp:prp-pr`는 critique retry loop을 **돌리지 않습니다**. 대신 Phase 1.6 preflight가 validate-cmd을 호출 — prior `mccp-plan-codex` + `mccp-implement-codex` receipt 중 어느 한쪽이라도 `design_critique_verdict='divergent'`이면 PR step BLOCK (gh 호출 전 exit 1, receipt 미작성). 이유:

- dual-review invariant 보호 — critique 결정은 plan/implement에서 수렴
- cross-gate dedupe과 충돌 회피
- `MCCP_DESIGN_CRITIQUE_MAX_RETRY`는 PR scope에서 무시

복구: prior gate에서 critique 재실행 (plan body / implement body fix 후 게이트 재진입) **또는** `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="<substantive reason>"`로 1회 advisory mode (strict reason validator). advisory mode 진입 시 receipt `meta.pr_design_chain_skip_reason` stamp + PR body `## Design Critique Chain Skipped` section auto-inject (canonical audit source).

#### 자기-적용 (dogfood)

본 M2 plan은 좁은 whitelist (axis b)로 자기-재현을 차단 — `impeccable-detect.js` / `design-critique-decide.js` / `skills/frontend-design-direction/` 변경은 detector positive로 인식됩니다. pre-ship dogfood는 `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1` test env가 보장합니다(critique invoke 결과를 mock해 retry loop 회귀를 강제). `.claude/cache/test-fixture-status.html`은 커밋물이 아니라 필요 시 test-time에만 쓰이는 임시 합성 파일이며 현재 tracked 상태가 아닙니다 — dogfood는 env 경로만으로 성립하므로 fixture 존재에 의존하지 않습니다 (M2 acceptance gate).

#### Produced-diff grounding lint (v1.18.22 — post-EXECUTE mechanical 게이트)

critique retry loop(위)은 EXECUTE *이전* plan/방향만 보고 produced diff는 절대 보지 못합니다. v1.18.22는 그 gap을 닫는 **별도 locus**의 post-EXECUTE mechanical 게이트를 `/mccp:prp-implement` Phase 3.7에 추가합니다(같은 PRD의 advisory `Phase 3.6 DESIGN FINISH` 뒤 — polish가 편집한 최종 diff를 lint) — critique의 divergent-block(§3.9 retry loop)은 그대로 두고 그 위에 얹는 구조(중복 아님, [[feedback-impeccable-full-delegation]] 해석 A: advisory → mechanical).

- **3-step 계약**: Phase 2.5.5c가 impeccable 방향 + pre-EXECUTE rendered-surface 스냅샷을 캡처(신규 LLM 호출 0, artifact write only) → per-task loop가 4 Output Constraints를 implementation context로 소비 → Phase 3.7이 produced rendered-surface delta를 source-diff-safe **H15**(heading depth ≤ 3) anchor로 lint(`lintProducedDiff`+`decideGrounding`, pure function). dirty worktree에서도 capture 시점 버킷을 per-bucket line-set 차감해 EXECUTE delta만 격리(Codex F2).
- **scope**: rendered surface(`.css/.scss` · `.tsx/.jsx/.vue/.svelte/.astro` · `.html` · `.claude/cache/*.md`)의 *added line*만. generic `.md`(command doc/plan/README/CHANGELOG)는 제외 — `####` 다수에 H15 오발화 회피. control-plane-only 변경은 no-op. H17(nested-card)은 DOM-aware라 added-line 버킷서 enforce 불가 → renderer full-HTML lint이 계속 소유(Codex F1, backlog).
- **verdict enum 5종**: `grounded`/`anchor_clean`/`inconclusive`/`violations`/`skipped`. receipt `meta.design_grounding_captured`(gate-time bool) + `meta.design_grounding_verdict`(post-EXECUTE enum) — present-only(migration 불필요). verdict는 field-preserving restamp(`cli.js restamp-grounding`, Codex F3 — `design_critique_*`/routing 보존)로 `receipt_hash` 재봉인. read 실패 시 enforce는 silent no-op이 아니라 `inconclusive` block(Codex F4).
- **게이트 조건은 shell-state 독립**: consume/verify/restamp + 2.5.6 forward는 비영속 `DESIGN_GROUNDING_CAPTURED` flag가 아니라 capture 아티팩트(restamp는 result JSON) 존재 + `$ARGUMENTS` 재파생 slug로 self-derive — separate Bash invocation에서 mechanical 게이트가 silent no-op 되지 않도록([[feedback-loud-fail-open]]). 모든 artifact 경로는 `git rev-parse --git-path`(worktree-safe, `.git/` hardcode 0).
- **모드/복구**: `MCCP_DESIGN_GROUNDING=off|warn|enforce`(default enforce, §4 토글). enforce `violations`/`inconclusive` → fix-task + bounded retry(`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 공유 cap) 후 hard-stop. 복구는 rendered-surface 라인 수정 후 게이트 재진입 **또는** `MCCP_DESIGN_GROUNDING=warn` advisory pass. pr/code-review(review-only invariant) 미적용 — implement-only.

---

### 3.10 Stage-aware impeccable command routing (v1.13.0 M1)

v1.3.0-m2의 design-critique는 impeccable `critique` 하나만 호출했습니다. v1.13.0-m1은 디자인 라이프사이클 단계에 impeccable 명령군을 매핑하는 **stage-aware routing oracle**(`scripts/lib/impeccable-routing.js`)을 도입합니다. critique은 여전히 §3.9 retry loop 전용(divergent blocking 보존) — routing은 그 **둘레의 나머지 단계**를 채웁니다.

#### Stage → command (MVP 6 + critique)

| 단계 | 명령 | implement 게이트 호출 형태(auto) |
|---|---|---|
| discovery | `shape` | background (best-effort, 불가 시 foreground-fallback) |
| refine | `layout` · `typeset` | invoke |
| evaluate | `critique`(§3.9 loop) · `audit` | invoke |
| harden | `harden` | pr 단계 recommend |
| polish | `polish` | pr 단계 recommend |

`craft`(명령 chain)·`live`(localhost:4321 실시간)는 비대화형 게이트와 부적합으로 **제외**.

#### 모드 (`MCCP_IMPECCABLE_ROUTING_MODE`)

| 모드 | 동작 |
|---|---|
| `auto` (default) | callForm 그대로 — evaluate/refine/discovery 실제 호출 |
| `hybrid` | evaluate(critique/audit)만 invoke, 나머지 recommend로 강등 |
| `recommend` | 전부 recommend (호출 없음) |

운영 중 비용/latency 문제 식별 시 `hybrid`/`recommend`로 강등 가능(사용자 결정 — auto가 기본).

#### 게이트별 배치

- **plan / plan-prd**: 렌더 UI 없음 → `## Design Routing Guide` recommend-only 기록(invoke 안 함).
- **prp-implement**: 실제 stage-aware 라우팅. `renderingSurface` selector(diff에 UI ext/STATUS·status.html 출력 없으면 control-plane-only로 판단 → refine/discovery를 recommend로 강등; evaluate는 유지 — Codex F4).
- **pr**: polish/audit/harden recommend-only stderr(review-only invariant — Edit/Write invoke 없음).

#### Receipt audit (present-only)

- `meta.impeccable_routing_mode`: `auto|hybrid|recommend|null`
- `meta.impeccable_commands_routed`: structured 배열 `[{command, call_form, status}]` — per-command **outcome**(invoked/recommended/failed/unknown-skill/skipped). 실패도 정직히 기록(loud fail-open); M1은 blocking 승격 안 함(M2 결정).

#### Codex Plan-Codex R1 absorptions

F1(`designIntentActive`로 audited override escape hatch 보존) · F2(critique은 routing 흡수 대상 아님, 기존 loop 유지) · F3(structured outcome 배열) · F4(`renderingSurface` selector + auto 기본 유지, cost-tier/SLO는 M2 defer).

#### M2 — Extended Refine/Simplify 카탈로그 + content 선별 (v1.13.0 M2)

M1의 6개(shape/layout/typeset/critique/audit + harden/polish)에 Extended 카탈로그 10개를 추가하고, auto 모드 fan-out 비용을 **content 기반 선별**로 제어합니다.

| 단계(추가분) | 명령 | callForm base | content signal |
|---|---|---|---|
| refine | `animate` | invoke | motion |
| refine | `colorize` | invoke | color |
| refine | `bolder`·`quieter`·`overdrive`·`delight` | **recommend (mood)** | — (diff 감지 불가) |
| simplify(신규) | `adapt` | invoke | responsive |
| simplify | `distill`·`clarify` | recommend | — |
| harden(pr) | `optimize`·`onboard` | recommend | — |

- **Content 선별 (positive-presence narrow)**: content-detectable 명령(animate/colorize/typeset/adapt)은 `extractDiffSignals`가 diff에서 해당 signal을 **positive로 잡았을 때만** auto invoke 유지, 못 잡으면 recommend로 강등. signal 추출은 tracked diff + **untracked rendered-surface 파일**(`git ls-files --others --exclude-standard`)을 합친 셋에서 수행하며, 정규식은 CSS property + Tailwind utility(`md:`/`bg-primary`/`transition-all`) + CSS-in-JS camelCase(`fontSize`)를 커버.
- **Fail-open omission**: rendered surface인데 signal이 0개면 `diffSignals`를 **omit** → oracle은 M1 fail-open(content 명령 base 유지). all-false forward로 "부재 강등"하지 않음(Implement-Codex [0]·[1], Plan-Codex F1·F2).
- **Mood 명령**: bolder/quieter/overdrive/delight는 diff로 의도 감지 불가 → recommend-only base. 유일한 invoke 경로는 4중 AND(auto + renderingSurface + designIntentActive + `MCCP_IMPECCABLE_INTENT_COMMANDS` membership) audited intent 승격(Plan-Codex F3).
- **Untracked greenfield trigger gap**: detector `design_signal`은 여전히 tracked diff 기반 → 신규 untracked surface는 `MCCP_DESIGN_INTENT_REASON`(axis c)로 trigger. detector 자체 untracked scan은 별도 axis.
- **Receipt schema 무변경**: `impeccable_commands_routed[].command`가 open string이라 신규 명령은 schema 변경 없이 수용.

#### M3 — System 명령 wiring + a11y-architect auto-invoke (v1.13.0 M3)

M3은 PRD의 마지막 두 축을 닫습니다.

**Axis A — System 명령(document/extract) wiring**: impeccable System 군의 `document`(DESIGN.md 생성)·`extract`(재사용 토큰/컴포넌트 추출)를 routing 카탈로그에 `system` stage + **recommend-only base**로 추가. 모든 게이트(implement/pr/plan/prd)·모든 모드에서 recommend — heavyweight 생성 명령이라 비대화형 게이트에서 auto-invoke 부적합(harden/optimize/onboard 처리 미러). `resolveCallForm` downgrade-only 로직상 invoke 승격 경로 없음. `craft`/`live`/`init`/`detect`/`hooks`는 out-of-scope 유지. Receipt schema 무변경(`impeccable_commands_routed[].command` open string).

**Axis B — a11y-architect routing-only → 실제 auto-invoke**: 기존엔 `codex-result-filter.js`가 a11y finding을 drop하고 `a11yRoutedCount`만 셀 뿐 a11y-architect를 호출하지 않았다. M3은 PR 게이트에서 실제 `Task(mccp:a11y-architect)`를 review-only로 auto-invoke한다.

- **트리거는 `rendering_surface`(PR diff에 UI ext 존재), Codex finding 유무가 아님** (Codex R1 F1): codex-invoke가 design-scope preamble로 a11y를 억제하므로 finding 기반 트리거는 starve된다. a11y-architect는 변경된 diff를 **직접** WCAG 2.2 관점에서 review하고, `codex-runner`가 surface한 `a11y_findings`는 보조 입력.
- **review-only 불변식 = 전용 lock window** (Codex R1 F2): codex-runner가 codex-review lock을 이미 exit했으므로, `pr.md` Phase 2.5.6c가 **a11y 전용 pr-phase lock**을 새로 enter → Task → exit + mutations finalizer. a11y-architect가 파일을 편집하면 `mutations[]`가 비지 않아 PR이 hard-stop.
- **audit**: receipt present-only `meta.a11y_auto_invoked: boolean`. `finalize-receipt.js#deriveCodexFlags`가 codex-result.json의 `a11y_auto_invoked=true`를 보고 `--a11y-auto-invoked`를 forward + `write_flags_used`에 노출(Codex R1 F3). 결과는 PR body `## Accessibility Review` 섹션에 inject(`## Codex Review` 동형). remediation은 advisory — 적용은 별도 `/mccp:prp-implement` cycle.
- **kill switch**: `MCCP_A11Y_AUTO_INVOKE=0` (default 1). `rendering_surface=false`면 invoke skip.

plugin.json `1.13.0 → 1.16.0` — main(1.15.0, PR #53 dashboard chart)과 forward-only reconcile per §3.7(plan은 1.14.0 가정이었으나 main 이동으로 상향).

---

## 4. 자주 쓰는 명령 (Cheat Sheet)

```bash
# 부트스트랩 (fresh install)
/mccp:setup                         # codex plugin + impeccable CLI 자동 설치 + /codex:setup 체인 (idempotent)
/mccp:setup --dry-run               # 설치 없이 검출만

# 게이트 파이프라인
/mccp:work <feature>                # 단일 entry (v0.3.1+) — trivial 자동 분기, 아래 chain을 자동 orchestration
/mccp:resume                        # honest handoff resume entry (v1.1.0+) — STATE.md handoff_spawn 신호 시 권장 진입점
/mccp:plan-prd <feature>            # PRD 작성
/mccp:plan <feature-or-prd-path>    # 구현 plan + Codex R1/R2 수렴
/mccp:prp-implement <plan-path>     # plan 실행 + validation loop
/mccp:code-review                   # 로컬 변경 review (PR 번호 주면 PR mode)
/mccp:prp-commit <자연어 설명>      # 자연어 파일 타겟팅 커밋
/mccp:prp-pr                        # 디자인/보안/Codex 게이트 통과 후 PR

# Receipt 운영
/mccp:receipt-status                # 현재 receipt chain 상태
/mccp:receipt-validate <command>    # 특정 게이트의 receipt 유효성 검증
/mccp:receipt-write <gate>          # 게이트 receipt 수동 작성

# Observability (v0.2.7)
/mccp:trace [<session_id>]          # hook-trace shard ledger 조회 (current + prior sessions, hook-caps.json 헬스)

# Schema migrations (.claude/receipts/는 working-tree only — 각 사용자가 직접 실행)
# 새 schema bump 후 mccp:* validate가 "schema invalid" 차단하면:
node plugins/mccp/scripts/migrations/v0.2.4-security-fields.js .claude/receipts/*/*.json
node plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js .claude/receipts/*/*.json
# 순서대로 (낮은 버전 먼저). --dry-run 옵션으로 미리 확인.

# v0.2.8 generic-receipt quarantine (idempotent, auto-trigger on validate-cmd boot)
# 자동 실행 — 수동 호출은 보통 불필요. 진단 / dry-run 시:
node plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js --dry-run
# 결과: { activeGenericReceipts: [...] } 출력. 비어있으면 quarantine 불필요.
# 실제 실행 (auto-trigger 안 도는 환경에서):
node plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js
# 결과: marker `.claude/receipts/.migrations/v0.2.8-generic-quarantine.json` 작성.
# state=complete이면 안전, partial/failed면 pending 확인 후 재실행.

# Codex
/codex:setup                        # CLI 인증 & gate 토글
/codex:rescue <문제>                # 막혔을 때 Codex에게 위임
```

### Generic-receipt quarantine runbook (v0.2.8 Task 2.6.5)

v0.2.8부터 validate-cmd가 generic decision_id(`default`/`main`) + `--plan` 미지정 조합을 **블록**합니다. 이전 v0.1-era receipt가 working tree에 남아있으면 자동 quarantine이 처리하지만, 자동 trigger가 실패하는 경우(예: validate-cmd가 module load 실패 시 fail-open warning만 남김) 다음 절차로 수동 복구합니다:

1. 진단 — 현재 active generic receipt 목록:

   ```bash
   node plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js --dry-run
   ```

2. 자동 quarantine 실행:

   ```bash
   node plugins/mccp/scripts/migrations/v0.2.8-generic-receipt-quarantine.js
   ```

   - 결과: `state="complete"` + active 0 → 끝.
   - `state="partial"` → marker의 `pending`을 확인 후 재실행 (resumable).
   - `state="failed"` → marker `last_error`을 확인. fs permission 문제면 권한 조정 후 재실행.

3. 진단 수동 (auto-trigger 자체가 안 도는 환경):

   ```bash
   # Codex R1-F3 absorption: 모든 GATE_IDS × {default, main} 검출
   for slug in default main; do
     for gate in mccp-plan-codex mccp-implement-codex mccp-pr-codex; do
       src=".claude/receipts/$gate/$slug.json"
       [ -f "$src" ] && mv "$src" ".claude/receipts/$gate/$slug.legacy.json"
     done
   done
   ```

   - `mccp-implement-codex/{default,main}.json`은 이미 prior session에서 `.legacy.json`으로 격리된 상태일 수 있음 (R2-F1 absorption note 참조).
   - 충돌(`<slug>.legacy.json` 이미 존재) 시 source를 `<slug>.legacy-<timestamp>.json`으로 이동 (active source 보존 금지 — R2-F3 invariant).

4. 동시 trigger 시 race (IMPL-R2-F1):
   - validate-cmd + `/mccp:pr` Phase 0가 동시 진입하면 한쪽만 lock 획득, 다른 쪽은 marker complete bounded poll (max 2s).
   - poll timeout 시 caller가 exit 75 (EX_TEMPFAIL) + systemMessage. 잠시 후 재시도.

5. v0.2.8 Task 2.6.5a hardening — `quarantine.lock` body는 **raw `crypto.randomUUID()` token을 평문**으로 담습니다(hash 아님 · stdin-pipe 아님 — `pr-phase.lock`의 canonical hash 모델과 다름, §3.6 락별 구분 참조). `0o600` owner-only 보호. lease/heartbeat 상세는 §3.6 "공통" 참조:
   - `<repo>/.claude/receipts/.migrations/v0.2.8-generic-quarantine.lock`을 **직접 편집하지 마세요**. `releaseLock`은 `body.token === token` 일치 시에만 unlink하므로, 파일을 손대 token이 어긋나면 ownership mismatch로 release가 실패하고 lock이 mtime 만료(60s) 후에만 reclaim됩니다.
   - **no-token legacy 잔여 리스크**: `releaseLock`이 token 없이(`undefined`/`null`) 호출되면 ownership 검증 없이 unlink합니다(loud stderr warn). 현재 유일 호출자 `migrate()`는 항상 token을 전달하므로 트리거되지 않지만, 문서화된 잔여 리스크입니다(code hardening은 backlog로 이연 — §3.6 참조).
   - lease-based reclaim: orphan 판정은 `(recorded PID is dead)` **OR** `(file mtime > 60s)`. clock skew / PID reuse에 강인합니다.
   - in-loop heartbeat: migration이 25개 rename마다 `fs.utimesSync`로 lock mtime을 갱신 (sync 함수에서는 `setInterval`이 fire 안 되므로 in-loop counter가 정답).
   - legacy v0.2.7 upgrade: v0.2.7 holder가 live인 동안 v0.2.8이 부팅하면 host-aware tri-state (same-host+pid-alive=NEVER reclaim) policy로 race 차단 — §3.6 참조.
   - tempfail propagation: validate-cmd가 in-progress-aborted 시 `result.tempfail=true` + `result.exitCode=75` + `blocking[].kind="tempfail"`을 emit합니다. cli/preflight/auto-chain은 exit 75 (sysexits), hook은 ALLOW + retry systemMessage. 공통 dispatch는 [`scripts/receipt/classify.js`](plugins/mccp/scripts/receipt/classify.js).

### 운영 토글 (환경 변수)

`.claude/settings.json` 또는 셸에서 설정 — v0.2 자동 게이트 동작을 변경합니다.

```bash
# Stop-loop (Claude 응답 종료 직전 자동 게이트)
MCCP_STOP_LOOP=off|observe|enforce       # default: observe (관측만, block 안 함)
MCCP_STOP_LOOP_CODEX=0|1                 # default: 0 (Codex diff review opt-in)

# Receipt 게이트 (Codex adversarial review)
MCCP_RECEIPT_GATE_MODE=soft|hard|off     # v0.2.2 live. default=hard. soft/off는 opt-in only.
MCCP_SKIP_RECEIPT=1                      # 일회성 bypass (한 호출만) ─ live
MCCP_RECEIPT_DEBUG=1                     # 디버그 출력 활성화 ─ live
MCCP_ALLOW_CODEX_UNAVAILABLE=1           # advisory mode (non-approving receipt). terminal /mccp:pr은 거부 ─ live (v0.2.2)
MCCP_CODEX_DISABLED=1                    # Codex 호출 영구 skip. v0.3.5부터 wrapper(codex-invoke.js)가 first-class honor — spawn 직전 short-circuit으로 classification='disabled' 즉시 반환. codex-runner는 codex_outcome='disabled', receipt는 meta.codex_disabled=true + meta.codex_skip_reason='codex_disabled' 자동 stamp. terminal /mccp:pr Phase 0 advisory-rejection 예외 + Phase 0.3 3-way mutex(disabled ⊕ skipped ⊕ dedupe) 통과. codex-bridge는 v0.2.x부터 이미 honor — 두 layer 동기화 완료. /mccp:setup Phase 4가 자동 write.
MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="<reason>" # v0.2.4 audited escape. terminal /mccp:pr이 security-reviewer agent unavailable + 이 env var의 specific reason 설정 시 advisory mode 진입. receipt에 meta.security_force_override=true + reason 기록, PR body에 ## Security Reviewer Override section auto-inject (canonical audit source). 1-token reason(=1, =yes)은 schema warning 발동. 1회용 권장.
MCCP_FORCE_PR_WITHOUT_IMPECCABLE="<reason>"        # v0.2.6 audited escape (Codex R1 F4 strict). terminal /mccp:pr에서 impeccable Skill 미가용 + 이 env var의 specific reason 설정 시 force-override 진입. v0.2.4 security와 달리 reason validator가 SCHEMA REJECT — empty/whitespace/1-token banlist(yes/ok/true)/URL-only/<30자/<3단어/placeholder는 receipt write 시점에 차단. receipt에 meta.impeccable_force_override=true + reason 기록, PR body에 ## Impeccable Override section auto-inject (canonical audit source). 1회용 권장.
MCCP_PR_SKIP_CODEX_REVIEW="<reason>"               # v0.2.8 audited escape (Task 2.6.1 C). terminal /mccp:pr에서 Codex review 호출 자체를 skip — cross-gate dedupe 조건은 충족 못 했지만 PR 본문에 review를 inject할 필요가 없는 경우 (예: receipt chain 외부에서 이미 다른 검증을 거친 cherry-pick PR). reason validator는 MCCP_FORCE_PR_WITHOUT_IMPECCABLE과 동일 SCHEMA REJECT 규칙 (empty/1-token/URL-only/<30자/<3단어 → write 시점 차단 + receipt schema invalid). receipt에 meta.codex_skipped_at_pr=true + codex_skip_reason 기록, PR body footer에 ## Codex Review Skipped section auto-inject. F9 mutex preflight: 본 env var는 CODEX_DEDUPE_AT_PR=1과 mutually exclusive — Phase 0.3에서 둘 다 설정 시 STOP exit 1. 1회용 권장.
CODEX_DEDUPE_AT_PR=1                               # v0.2.8 internal signal. cross-gate dedupe가 활성화돼 PR step의 Codex 호출이 skip됐음을 receipt가 명시. 사용자가 직접 설정할 일은 없음 — dedupe 로직이 자동 export. F9 mutex preflight: MCCP_PR_SKIP_CODEX_REVIEW와 mutually exclusive.
MCCP_GATE_ROUND_CAP=1|2|3                # v0.2.9 default: 1. R2/R3은 ACCEPT_NOW × {HIGH, CRITICAL} 미해소 시에만 trigger. DEFER_TO_BACKLOG 항목은 .claude/plans/codex-findings-backlog.md에 1줄 append. plan.md/prp-implement.md/pr.md 3 게이트 모두 honor.
MCCP_CODEX_DESIGN_SCOPE_HONOR=0|1        # v0.3.6 default: 1. 축 1 kill switch (디버그용). impeccable 가용 시 codex-invoke wrapper가 focus 앞에 DESIGN_SCOPE_PREAMBLE prepend + codex-result-filter가 design/a11y keyword 매칭 finding을 drop. =0이면 두 layer 모두 no-op (기존 v0.3.5 동작 복원). receipt meta 4 fields(`codex_design_scope_excluded`, `design_findings_dropped`, `a11y_routed_to_impeccable`, `dropped_findings_digest`)는 어느 쪽이든 audit용으로 작성.

# v1.3.0-m2 Design-critique SKILL first-step + retry loop (see §3.9)
MCCP_DESIGN_CRITIQUE_MAX_RETRY=0|1|2|3    # v1.3.0-m2 default: 2. plan.md/prp-implement.md/plan-prd.md design-critique retry loop의 round cap. =0 → R0 1회만 + DIVERGENT 즉시 (kill-switch, loud stderr warn). cap 도달 시 receipt meta.design_critique_verdict='divergent' stamp + PR step chain-check이 BLOCK. /mccp:pr scope는 무시 (retry 없음).
MCCP_DESIGN_INTENT_REASON="<reason>"      # v1.3.0-m2 audited intent override (axis c). detector positive(axis a) + 좁은 whitelist(axis b)가 모두 miss하지만 작성자가 "본 변경은 design routing"이라고 명시할 때만. strict reason validator (M1 IMPECCABLE_FORCE_OVERRIDE_REASON 룰 mirror — empty/1-token/URL-only/<30자/<3단어 reject). 활성 시 SKILL Read first-step + critique loop 강제 + receipt에 meta.design_intent_reason stamp.
MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="<reason>" # v1.3.0-m2 audited escape (PR scope chain-check). /mccp:pr Phase 1.6 preflight가 prior receipt verdict='divergent' 발견 시 BLOCK하지만, 이 env + substantive reason 설정 시 advisory mode 진입. strict reason validator (위와 동일). 활성 시 receipt meta.pr_design_chain_skip_reason stamp + PR body footer에 ## Design Critique Chain Skipped section auto-inject (canonical audit source). cherry-pick PR + prior receipt unavailable 같은 좁은 use case 전용.
MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1  # v1.3.0-m2 test env (M2 acceptance gate dogfood용). =1이면 critique invoke 결과를 [{severity:'HIGH'}] 강제 주입 → oracle ESCALATE → cap 도달 시 DIVERGENT. production code path는 env 무관 — critique invoke 결과만 mock. e2e test에서 retry loop 회귀 보장. MCCP_RECEIPT_DEBUG=1 + 본 env 활성 시 stderr loud warn 강제.

# v1.18.22 Produced-diff design grounding (see §3.9 하단 "Produced-diff grounding lint")
MCCP_DESIGN_GROUNDING=off|warn|enforce    # v1.18.22 default: enforce (fail-closed). /mccp:prp-implement Phase 3.7 post-EXECUTE produced-diff grounding lint. 디자인 trigger 발화(SKILL_AVAIL=1 & (SIGNAL=1|DESIGN_INTENT_ACTIVE=1)) + Phase 2.5.5c capture 아티팩트 존재 시에만 실행 — produced rendered-surface delta(added line만)를 H15(heading depth ≤ 3) anchor로 mechanical(LLM-free) lint. enforce=violations/inconclusive 시 fix-task + bounded retry(MCCP_DESIGN_CRITIQUE_MAX_RETRY 공유 cap, default 2) 후 hard-stop / warn=advisory pass(verdict 정직 기록) / off=skipped(loud stderr warn). 오타·미설정 → enforce. critique loop(§3.9)과 **별도 locus** — 이건 produced diff mechanical, critique은 pre-EXECUTE LLM-judged(중복 아님). rendered surface scope=.css/.scss·.tsx/.jsx/.vue/.svelte/.astro·.html·.claude/cache/*.md (generic .md 제외 — command-doc #### 오발화 회피). H17(nested-card)은 DOM-aware라 added-line 버킷서 enforce 불가 → renderer full-HTML lint 소유. control-plane-only 변경은 no-op. pr/code-review(review-only) 미적용. receipt meta.design_grounding_captured(gate-time bool)+design_grounding_verdict(post-EXECUTE enum: grounded|anchor_clean|inconclusive|violations|skipped) stamp.

# v1.13.0 Stage-aware impeccable command routing (see §3.10)
MCCP_IMPECCABLE_ROUTING_MODE=auto|hybrid|recommend  # v1.13.0 default: auto. 디자인 게이트가 stage-appropriate impeccable 명령(shape/layout/typeset/audit/harden/polish)을 어떻게 다룰지 결정. auto=실제 호출 / hybrid=evaluate(critique/audit)만 invoke·나머지 recommend / recommend=전부 권장만. 미지정·오타 시 auto. critique은 모드 무관하게 §3.9 retry loop가 소유(divergent blocking 보존). pr 게이트는 모드 무관 recommend-only(review-only invariant). prp-implement은 renderingSurface=0(control-plane-only diff)일 때 auto에서도 refine/discovery를 recommend로 강등(Codex F4). receipt에 meta.impeccable_routing_mode + meta.impeccable_commands_routed(structured outcome) stamp.
MCCP_IMPECCABLE_INTENT_COMMANDS="bolder,quieter,overdrive,delight"  # v1.13.0 M2. mood/direction 명령은 diff로 감지 불가 → 기본 recommend-only. 이 env에 나열된 mood 명령은 4중 AND(auto + renderingSurface + designIntentActive(=MCCP_DESIGN_INTENT_REASON 활성) + 본 membership)에서만 prp-implement이 invoke로 승격. 미지정/조건 미충족 시 recommend. comma-separated, 알 수 없는 토큰은 무시. content-detectable 명령(animate/colorize/typeset/adapt)은 본 env와 무관 — diff signal positive-presence로 자동 선별(§3.10 M2).
MCCP_A11Y_AUTO_INVOKE=0|1                 # v1.13.0 M3 default: 1. /mccp:pr 게이트에서 PR diff에 rendered design surface(UI ext)가 있으면 mccp:a11y-architect를 review-only로 auto-invoke해 WCAG 2.2 관점 review를 PR body `## Accessibility Review`에 inject. 트리거는 rendering_surface(Codex finding 유무 아님 — design-scope preamble starvation 회피, Codex R1 F1). 전용 a11y-review pr-phase lock window + mutations finalizer로 review-only 보증(편집 시 hard-stop, R1 F2). receipt meta.a11y_auto_invoked stamp via finalize-receipt --a11y-auto-invoked(R1 F3). =0이면 auto-invoke 비활성(기존 routing-only count 동작 유지). rendering_surface=false면 어느 값이든 skip. remediation은 advisory — 적용은 별도 /mccp:prp-implement cycle.

# Silent-hook UX (v0.2.7 — Observability Surface)
MCCP_RECEIPT_DEBUG_LEGACY_INLINE=0                 # v0.2.7 advanced opt-out. MCCP_RECEIPT_DEBUG=1일 때 L2a ALLOW-path systemMessage emit을 끄고 기존 block-payload inline 모드만 유지. Default(unset 또는 =1)는 L2a active. 자세한 precedence는 docs/ENVIRONMENT.md §1.

# Auto-chain (v0.2.2)
MCCP_AUTO_CHAIN_DISABLE=1                # kill switch ─ live
MCCP_AUTO_CHAIN_SKIP_PR=1                # commit-only chain (직접 push cycles 용) ─ LLM-observed (mechanical 미구현; auto-chain.js는 honor하지 않음, W-VERDICT C2 axis M)

# work context isolation (v1.20.2 M1 — implement 스텝 격리 위임)
MCCP_WORK_ISOLATE_IMPLEMENT=0|1          # v1.20.2 default: 1 (격리 on). /mccp:work Step 3의 implement를 격리된 단일 worker Agent로 위임 — worker가 파일 탐색·edit·validate·Implement-Codex 게이트·receipt write를 자기 컨텍스트에서 수행하고 메인(controller)은 요약(변경 파일·receipt path·verdict)만 회수해 메인 피크 컨텍스트를 얇게 유지. dispatch-controller substrate(prepareDispatch/envelope schema/3-flag attribution)를 single-worker로 재사용. worker는 implement까지만 — commit/PR은 controller Step 4/5 전용(Codex F1: worker env·prompt로 auto-chain 금지 + Step 3.gate가 mccp-pr-codex receipt 유입 시 invariant HALT). 동기 단일 worker는 skipHeartbeat(Codex F2: stale-reclaim 대상 제외, orphan 없음). receipt는 3 attribution 플래그로 controller session에 anchor(repo-relative ipc path — Codex F3). =0이면 인라인 Skill(mccp:prp-implement) fallback(loud stderr, implement diff/validate가 메인에 누적 — baseline). 미지정/오타 시 격리(보수적 default = 상위 축). prepare-single 실패 시 자동 인라인 fallback. standalone /mccp:prp-implement엔 미적용(격리 locus는 work.md 오케스트레이터 한정). v1.20.7 M2a부터 이 축이 =1일 때 하위 축 MCCP_WORK_IMPLEMENT_WORKFLOW가 Task-격리 vs Workflow-격리를 결정.
MCCP_WORK_IMPLEMENT_WORKFLOW=0|1         # v1.20.7 M2a default: 0 (Task-격리 유지). MCCP_WORK_ISOLATE_IMPLEMENT!=0(격리 활성)일 때의 하위 축 — implement 위임 채널을 Task에서 Workflow primitive의 agent()로 등가 이전(병렬화 전, M2b seam). =1 AND prepare-single 성공(dispatch-workflow-args.json 존재) AND Workflow tool이 세션에서 가용이면 /mccp:work Step 3.W(Workflow agent() → {result, dispatchId} 회수), 그 외(=0/미설정/오타, args 부재, tool 미가용)면 Step 3.I(기존 Task dispatch). 두 격리 경로 모두 Step 3.gate 통합 reconcile(deriveVerdict 3자: 반환값 ∧ envelope ∧ receipt-store)로 수렴 — 기존 envelope-only merge를 대체하며 F1 invariant(mccp-pr-codex leak → invariant-violation HARD HALT) + F2 reconciliation(status·receipt slug 집합·envelope pending 불일치 → reconcile-mismatch) + F3 anchor 검증(marker + 3-플래그 == expectedAnchor 아니면 unanchored)을 회수 채널 불문 적용. Codex F1 lifecycle 경계: Task fallback은 Workflow 호출 개시 전(started 표식 이전)에만 허용 — 개시 후 회수 실패는 두 번째 경쟁 worker 방지를 위해 fail-closed HALT(resumeFromRunId 재개 지시). fail-open: Workflow throw/미가용은 implement를 막지 않고 Task 경로로 강등. dual-review 무손상. standalone /mccp:prp-implement엔 미적용.

# N-worker parallel implement (v1.20.10 M2b — implement 병렬화 스캐폴드)
MCCP_WORK_IMPLEMENT_PARALLEL=0|1          # v1.20.10 M2b default: 0 (단일 worker 유지). MCCP_WORK_IMPLEMENT_WORKFLOW의 하위 축 — Workflow 경로에서 implement를 N-worker parallel로 돌릴지. =1 AND partition oracle이 N>1 서로소 partition 산출 AND resolveFleet run=true(비용·budget·merge_strategy 통과)이면 /mccp:work Step 3.WP(parallel(fleet.map(...)) + worktree 격리), 그 외는 Step 3.W(단일). 구조적 gate: MCCP_WORK_MERGE_STRATEGY가 worktree-merge가 아니면 무조건 N=1로 fail-close(아래). 따라서 현행 환경(Task 0 spike=disable-parallel)에서는 =1 opt-in이어도 M2a 단일 동작 유지. dual-review 무손상(per-worker Implement-Codex + N-way mergeVerdicts fail-closed 집계). standalone /mccp:prp-implement엔 미적용.
MCCP_WORK_MERGE_STRATEGY=disable-parallel|worktree-merge  # v1.20.10 M2b default: disable-parallel (Task 0 spike 실측값). 병렬 실행의 **구조적 gate** — resolveFleet이 이 값이 worktree-merge가 아니면 무조건 N=1로 fail-close(same-worktree A2 fallback은 atomic-merge 보호 실장 전까지 금지). Task 0 spike가 isolation:'worktree' 변경이 parent worktree에 자동 전파되지 않고(별도 디렉토리·branch·uncommitted) 오케스트레이터에 worktree collect API가 없음을 실측 → default disable-parallel. worktree→parent merge가 후속 milestone에서 입증되면 worktree-merge로 승격해 병렬 활성화. 미지정/기타 값 → disable-parallel(fail-closed).
MCCP_WORK_PARALLEL_MAX=4                  # v1.20.10 M2b default: 4. partition oracle의 maxWorkers cap + resolveFleet의 N 상한. partition 수가 이를 초과하면 작은 partition을 병합해 cap으로 맞춘다. 비정상 값 → default.
MCCP_WORK_PARALLEL_BUDGET=150000         # v1.20.10 M2b default: 150000. worker당 최소 예상 토큰. resolveFleet이 minRemaining=이 값×N으로 환산 → Workflow가 budget.total 설정 시(사용자 +Nk) budget.remaining()<minRemaining이면 spawn 없이 skip. budget.total+budgetRemaining을 caller가 공급하면 resolveFleet이 감당 가능 N으로 cap(2 미만이면 budget-insufficient→N=1). 비정상 값 → default + loud warn.
MCCP_WORK_PARALLEL_AUTODISABLE_TIER="notice,warning,critical"  # v1.20.10 M2b default. cost-tier가 이 집합에 들면 fleet 자동 disable(N=1, resolveFanout 미러). comma-separated subset of {green,notice,warning,critical}. cost-state missing/corrupt는 tier와 무관하게 N=1(cost-state-unknown — 고비용 fail-closed). parse 실패/unknown token → default + warn.

# aggregate adversarial-verify (v1.20.12 M3 — /mccp:work Step 3.verify, see §1.4)
MCCP_WORK_MERGED_VERIFY=off|warn|enforce  # v1.20.12 M3 default: enforce (fail-closed). 위 3 병렬 축과 **직교(⊥)**. /mccp:work의 implement가 끝난 뒤(어떤 경로든 — 단일 Step 3.W/I·병렬 Step 3.WP·인라인 Step 3.F) **commit(Step 4) 전** Step 3.verify가 통합 diff를 worker 밖에서 1회 cross-model(Codex `codex-invoke.js adversarial-review`) 판정한다(PRD Open Question 1(c) pipeline-스테이지 답). `verify.js#decideMergedVerify`: `converged`→pass(Step 4 진행) · `divergent`/`critical`→HALT · `unavailable`×{enforce→HALT, warn→advisory pass} · `off` 또는 변경 없음→skipped. **DD6 — 단일 경로에서도 발화**하므로 병렬이 `disable-parallel`로 gated여도 M3 verify-네이티브화가 runtime 가치를 갖는다. **DD2 — invoker는 여전히 Codex(cross-model)**, same-model skeptic 치환 아님(dual-review 무손상). `MCCP_CODEX_DISABLED=1`이면 classification=disabled→verdict=skipped(pass). pass 시 신규 gate `mccp-implement-verify` receipt에 `meta.merged_verify_verdict`/`meta.merged_verify_rounds` stamp(audit anchor, non-invasive — 어떤 command chain에도 미진입). HALT은 runtime 1차 enforcement(receipt 무관 차단); 병렬 경로 HALT은 patch reverse-apply(F4)로 parent 복원, 단일/인라인은 uncommitted 변경 보존. 미지정/오타 → enforce(loud fail-closed). 복구: working tree에서 cross-cut 회귀 수정 후 재실행 **또는** `MCCP_WORK_MERGED_VERIFY=warn` advisory pass. /mccp:prp-implement standalone엔 미적용(verify locus는 work.md 오케스트레이터 한정).

# plan fan-out (v1.20.4 M1 — GROUND 다관점 read-only 병렬 조사)
MCCP_PLAN_FANOUT=off|on                    # v1.20.4 default: off (명시 opt-in). =on + PRD artifact mode(`.prd.md` 입력) + cost-tier autoDisable 미해당 + cost-state 존재 시에만 /mccp:plan Phase 2.5가 4개 read-only 관점(architect/security/test/explorer)을 Workflow primitive로 병렬 fan-out → pure synthesize → plan body `## Multi-Perspective Fan-out` 주입. read-only agent(도구 부재)라 파일 변형·receipt write 구조적 불가 → Codex dual-review·receipt chain 무손상(fan-out 결과는 plan_hash에 포함돼 review됨). 미설정/오타/skip/Workflow throw/미가용 → 인라인 Pattern Grounding fallback(fail-open, plan 절대 안 막음). 현행 "inline by default, no subagent by default" 계약 보존. free-form(비-PRD) 입력엔 미적용.
MCCP_PLAN_FANOUT_BUDGET=<tokens>           # v1.20.4 default: 150000. 관점당 최소 예상 토큰. resolveFanout이 minRemaining=이 값×fleetSize(4)로 환산 → Workflow가 budget.total 설정 시(사용자 +Nk 지시) budget.remaining() < minRemaining이면 agent() 0회 skip(Codex F2 사전 가드). budget.total 미설정 시 구조적 상한(fleetSize+effort:'low')만 유효. 비정상 값 → default + loud stderr warn.
MCCP_PLAN_FANOUT_AUTODISABLE_TIER="notice,warning,critical"  # v1.20.4 default. cost-tier가 이 집합에 들면 fan-out 자동 disable(briefing cost-guard mirror). comma-separated subset of {green,notice,warning,critical}. cost-state missing/corrupt는 tier와 무관하게 skip(cost-state-unknown — 고비용이라 fail-closed, cost-guard의 fail-open과 의도적 차이). parse 실패/unknown token → default + warn.

# Auto-handoff (v0.3.0 S10b — live, v1.1.0 honest quarantine)
MCCP_AUTO_HANDOFF=off|notify             # default: notify. cost-tier 검출 + STATE.md write + stderr 배너. 실제 세션 spawn은 아래 experimental flag에 종속됨. (spawn은 v1.1.0+ deprecated alias — flag 없으면 notify로 강등됨, ledger에 experimental_spawn_requested=true 기록.)
MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1   # v1.1.0+ opt-in. PATH에 claude binary 필요. 미설정 + MCCP_AUTO_HANDOFF=spawn 요청 시 notify로 강등 + fallback_reason='spawn-experimental-flag-missing'. IDE-launched sessions에서 spawn은 거의 항상 실패하므로 default 미설정 권장.
MCCP_HANDOFF_THRESHOLDS_USD="50,80,100"  # default. comma-separated notice,warning,critical USD thresholds. parse 실패 또는 invariant 위반 시 default + stderr warn.

# v1.2.0-m1 Orchestrator (dispatch-controller)
MCCP_ORCHESTRATOR_POLL_MS=500            # default. dispatch-watcher polling 간격. 낮추면 envelope detection 빠름, CPU 증가. ─ live (M1)
MCCP_DISPATCH_CONTEXT=0|1                # default: 0. =1 시 mccp-receipt write가 controller-context marker 자동 stamp + 3 attribution flags(--dispatched-by-controller-session/--worker-dispatch-id/--ipc-envelope-path) 모두 require. 누락 시 fail-closed exit 12 (F2 absorption). marker detect는 env=1 OR 3 flag 중 하나라도 공급 OR ipc-envelope 파일 존재 중 하나 — detect되면 3 flag 전부 require(부분 공급은 write 시점 fail-closed, receipt/write.js#detectDispatchContext). 따라서 worker가 prompt 지시대로 3 flag를 forward하면 env=0에서도 anchor가 보장되고, 완전 미forward는 reconcile F3(work v1.20.7)가 unanchored로 별도 HALT한다. env=1은 완전 미forward를 write 시점에 즉시 잡는 추가 강제 옵션 — work.md/dispatch-cli.js는 이 env를 자동 set하지 않는다(LLM 매개 Task/Workflow dispatch는 Bash export를 worker 프로세스에 전달하지 못하므로, 세션-레벨 settings.json으로만 활성). ─ live (M1)

# v1.3.0-m2 LLM Briefing stamp (cost-tier × env policy × PR-phase guard)
MCCP_BRIEFING=on|off|auto                # default: auto. =off → receipt write가 LLM briefing 호출을 전혀 안 함(disabled enum 아닌 'env-off' canonical reason). =on → cost-tier 무시하고 항상 호출(debug only — production은 권장 안 함). =auto → cost-tier ∈ autoDisableTiers 시 자동 disable + 그 외 호출. ─ live (M1)
MCCP_BRIEFING_AUTODISABLE_TIER="notice,warning,critical"  # default. MCCP_BRIEFING=auto 모드에서 어떤 cost-tier가 briefing을 자동 disable할지 지정. comma-separated subset of {green,notice,warning,critical}. parse 실패 시 default. =critical만 설정 시 $50 notice tier에서도 호출(predictable monthly cost는 cost-state $50 ceiling가 이미 보장).

# v1.3.0-m4 Refresh trigger (debounce + render lock — ops debug only)
MCCP_RENDER_TRIGGER_DEBOUNCE_MS=5000     # default. Content debounce window in ms for `triggerRender`. 짧추면 burst trigger가 render thrash 위험, 길게 두면 STATUS.md가 늦게 따라옴. ─ live (M4)
MCCP_RENDER_LOCK_LEASE_MS=90000          # default. `.claude/cache/.render.lock` 의 lease 길이. host-aware tri-state reclaim(§3.6) — same-host live PID는 lease 만료해도 NEVER reclaim. 단일 render는 ~200-500ms이므로 90s는 generous safety margin. ─ live (M4)
```

---

## 5. 모르거나 막힐 때

1. `.claude/notes/mccp-v0.2-continuation.md` — 진행 중 작업 큐
2. `docs/v0.2-architecture.md` — 전체 설계
3. README.md — 사용자 관점 요약
4. 사용자 auto-memory (user-level, 프로젝트 워크트리 밖) — 세션 시작 시 `MEMORY.md` 인덱스가 자동 주입됩니다. 직접 경로 참조 대신 인덱스에 노출된 항목명으로 조회하세요.
5. `docs/v1.3.0-observability/schema-surface.md` — receipt + envelope + STATE.md frontmatter의 read-side schema surface 표준. derive 가정에 의문 생기면 여기부터. PRD ↔ code 식별자 매핑은 `docs/v1.3.0-observability/state-md-naming-reconciliation.md`.
6. `plugins/mccp/scripts/derive/index.js` — `.claude/` 통합 model derive 진입점 (9 source + 6 correlation kinds). M0 schema-surface.md 가정 동기. `node plugins/mccp/scripts/derive/cli.js run --json` 으로 즉시 호출 가능.
7. `plugins/mccp/scripts/lib/renderer/index.js` — v1.3.0-m3 STATUS.md + status.html renderer 진입점 (consumes M1 derive + M2 briefing fields, produces PM dashboard surface). `docs/v1.3.0-observability/dashboard-surface.md` 가 canonical spec. `node plugins/mccp/scripts/derive/cli.js render` 으로 즉시 호출 가능 (`.claude/cache/` 에 산출).

새 패턴/관행이 정해지면 memory에 저장하기 전에 이 CLAUDE.md에 반영할지 먼저 검토하세요. 프로젝트 단위 룰은 여기가 더 안정적입니다.
