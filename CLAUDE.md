# CLAUDE.md — my-claude-code-plugin

> 이 파일은 Claude Code 세션 시작 시 자동 주입되는 프로젝트 instruction입니다.
> 여기 적힌 규칙은 기본 동작을 **override** 합니다. 반드시 준수하세요.

---

## 0. 응답 언어 (Response Language)

**모든 사용자 응답은 한국어로 작성합니다.**

- 사용자에게 보내는 모든 텍스트 메시지 — 진행 상황, 결과 요약, 질문, 오류 설명 — 는 한국어로.
- 다음은 영어를 그대로 유지합니다:
  - 코드, 식별자, 파일 경로, 명령어, 로그
  - 커밋 메시지·PR 본문 (기존 repo 컨벤션 유지 — 한국어/영어 혼용 가능)
  - 외부 도구 출력(git, npm, codex 등)을 인용할 때
  - 기술 용어(plugin, hook, receipt, gate 등)는 번역하지 말고 그대로

사용자가 영어로 질문해도 응답은 한국어가 기본입니다. 사용자가 명시적으로 "영어로 답해줘"라고 요청한 경우에만 영어로 전환합니다.

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
- **v0.2.8 PR step 보호 (Task 2.6.1 B+D+C)**: `/mccp:pr` + `/mccp:prp-pr`는 cross-gate dedupe + review-only invariant 양축으로 dual-review 가치를 보존합니다. 같은 decision-slug에 대해 plan-codex + implement-codex 양쪽 모두 `verdict=approve`이면 PR step의 Codex 재호출은 skip되고 receipt에 `codex_dedupe_at_pr=true`가 기록됩니다. dedupe 조건 미충족 시에만 Codex가 실제로 발화하지만, 발화한 경우에도 findings는 PR body의 `## Codex Review` 섹션에만 inject되며 본문 command가 Edit/Write를 호출하지 않는 review-only invariant가 runtime PR-phase guard hook (`pr-phase-guard.js`)로 mechanical하게 보호됩니다. Codex 호출 자체를 명시적으로 우회해야 하는 경우 `MCCP_PR_SKIP_CODEX_REVIEW="<reason>"` audited escape (§4 운영 토글 참조).
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

각 단계는 **receipt** (`.claude/receipts/*.json`)를 발행하고, 다음 단계는 이전 receipt chain을 검증한 뒤에만 시작합니다 (mechanical enforcement). receipt 운용 모드는 §1.2의 `MCCP_RECEIPT_GATE_MODE` 참조.

v0.2.9부터 각 게이트는 R1 default + YAGNI triage로 R2/R3 escalate 결정. `DEFER_TO_BACKLOG` 항목은 [.claude/plans/codex-findings-backlog.md](.claude/plans/codex-findings-backlog.md) 단일 파일에 누적. cap override: `MCCP_GATE_ROUND_CAP=1|2|3` (default 1, §4 운영 토글 참조).

### 1.4 v0.2 자동 게이트 레이어 (receipt chain 위)

brainstorming 분석 결과 v0.1의 receipt chain은 *"adversarial review가 일어났는가"* 만 검증하고, *"사람이 감시해야만 다음으로 넘어가는 chokepoint"* 는 그대로 남아 있었습니다. v0.2는 receipt chain 위에 자동화 layer 5개를 얹습니다 (자세한 sequence diagram + module boundary는 [docs/v0.2-architecture.md](docs/v0.2-architecture.md)):

| 모듈                       | 역할                                                                                          | 상태         |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| **Stop-loop**              | Claude stop 직전 자동 `lint → typecheck → test → e2e` + (opt-in) Codex diff review. fail 시 `fix-task.md` 생성 + 최대 2회 bounded retry | S8 ship      |
| **STATE.md continuity**    | `PreCompact`에서 write, `SessionStart`에서 inject — 세션 간 컨텍스트 자동 복원                | S10a ship    |
| **Auto-handoff**           | 누적 비용 $50 notice / $80 soft / $100 hard ceiling 임계 자동 검출 → STATE.md `handoff_spawn` 신호 write + stderr 배너. 실제 세션 전환은 `spawn` 모드만 시도하며 v1.1.0+부터 experimental opt-in (`MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1`)이 없으면 `notify`로 강등. 다음 세션에서 `/mccp:resume`로 resume 권장. | S10b ship (v0.3.0), v1.1.0 honest |
| **`/mccp:work`**           | 단일 entry로 PRD → plan → implement → PR 전 chain 자동 orchestration                          | S11 ship (v0.3.1) |
| **dual-reviewer escalate** | CRITICAL/divergent 시 `fix-task.md`에 `Next: /santa-loop ...` 안내 추가 (자동 호출은 안 함)   | S12 ship (v0.3.2) |
| **Codex disabled honor**   | wrapper(codex-invoke.js)가 `MCCP_CODEX_DISABLED=1` 감지 시 spawn 직전 short-circuit + classification='disabled' 즉시 반환. caller(codex-runner / receipt)는 `codex_outcome='disabled'` + `meta.codex_disabled=true` + canonical reason='codex_disabled' 일관 기록. 영구 bypass 사용자에게 우회 env(`MCCP_ALLOW_CODEX_UNAVAILABLE` / `MCCP_PR_SKIP_CODEX_REVIEW`) 0회 chain | M8 ship (v0.3.5) |
| **Codex/impeccable scope split** | impeccable 가용(`impeccable-detect`의 user-level skill probe 포함) 시 (1) codex-invoke.js가 focus 앞에 `DESIGN_SCOPE_PREAMBLE` prepend → Codex가 visual/color/typography/spacing/animation/micro-interaction/brand finding 미배출 + a11y는 impeccable a11y-architect에 routing 명시, (2) codex-result-filter.js가 Codex 응답에서 design/a11y keyword 매칭 finding을 drop + a11yRoutedCount stash, (3) receipt meta 4 fields(`codex_design_scope_excluded`, `design_findings_dropped`, `a11y_routed_to_impeccable`, `dropped_findings_digest`) audit. impeccable 미가용 시 no-op. `MCCP_CODEX_DESIGN_SCOPE_HONOR=0`로 kill switch (debug용). | v0.3.6 ship (축 1 + STATE.md content-hash skip(축 2) + derive-decision normalize(축 3) bundle) |
| **dispatch-controller (Stage 2 M1)** | Foundation IPC for multi-worker fanout. Envelope schema (`<parent_cwd>/.claude/state/dispatches/<uuid>.envelope.json`, pending nonterminal + ok/failure/timeout/crashed terminal), hybrid Monitor+polling watcher, atomic worktree→parent sync, pure-lib controller (`prepareDispatch` + `mergeEnvelopes`, no Agent calls). Receipt schema 4 new optional `meta.*` fields with marker-gated all-or-nothing invariant (F2 absorption) + `meta.ipc_envelope_path` triggers validator envelope integrity check (F3 absorption). Heartbeat + `reclaimStale` host-aware tri-state policy mirrors `pr-phase-lock.js` (F4 absorption). M2 pilot fanout + M3 stale-envelope GC deferred. Caller(slash-command body)가 Agent 호출 + controller는 그 결과만 merge — controller-self Agent invocation은 lib에서 불가. dual-review 보존: cross-gate dedupe가 controller-worker 양쪽 모두에서 작동, worker 받은 attribution 3개 필드로 receipt가 controller session에 anchor됨. | v1.2.0-m1 ship |

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
- 직접 편집하지 말고 `state-writer.js` API를 사용하세요 — frontmatter 스키마, atomic lock, CRLF normalization, schema version guard가 묶여 있습니다.

### 3.3 Codex 의존 작업의 실패 모드 (v0.2.2 fail-closed matrix)

[scripts/lib/codex-invoke.js](plugins/mccp/scripts/lib/codex-invoke.js)의 classification enum과 정합화:

| Classification | 원인 | 기본 동작 | Advisory mode 동작 |
|---|---|---|---|
| `ok` | 정상 응답 | 통과 (`blocking=false`) | n/a |
| `disabled` | `MCCP_CODEX_DISABLED=1` (v0.3.5 first-class skip) | 통과 (`blocking=false`, `advisory=false`) — spawn 직전 short-circuit, durationMs=0. receipt에 `meta.codex_disabled=true` + `meta.codex_skip_reason='codex_disabled'` 자동 stamp. terminal `/mccp:pr` Phase 0 advisory-rejection 룰에서 예외. | n/a — intentional, not failure |
| `registry-missing` | `~/.claude/plugins/installed_plugins.json` 없음 | block (exit 12) | warn + 통과 (non-approving receipt) |
| `plugin-not-installed` | codex@openai-codex registry entry 없음 | block | warn + 통과 |
| `install-path-stale` | installPath가 디스크에 없음 | block | warn + 통과 |
| `companion-not-found` | `codex-companion.mjs` 미존재 | block | warn + 통과 |
| `companion-version-mismatch` | plugin.json version이 compatible list(1.0.x)와 다름 | block | warn + 통과 |
| `not-authenticated` | `not authenticated`/`setup_required` stderr 패턴 | block | warn + 통과 |
| `timeout` | 90s 초과 | block | warn + 통과 |
| `exit-nonzero` | companion이 exit 0 외 종료 | block | warn + 통과 |
| `stdout-empty` | exit 0이지만 stdout 빈 출력 | block | warn + 통과 |
| `spawn-enoent` | node 실행 실패 | block | warn + 통과 |
| `parse-error` | wrapper JSON parse 실패 | block | warn + 통과 |
| `tempfail` (exit 75) | v0.2.8 generic-receipt quarantine migration in progress (lock-loser bounded poll timeout) | retry-shortly, ALLOW in hooks, exit 75 in cli/preflight/auto-chain | n/a — transient by construction, not advisory |

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

v0.2.8 Task 2.6.1-followup F10+F11+F7 (PR #8)부터 mccp는 두 가지 atomic state lock을 동일한 canonical pattern으로 운용합니다. 둘 다 단일 writer + multi-reader, lease-based reclaim, in-loop heartbeat를 공유합니다.

| Lock file | 사용처 | 생명주기 |
|---|---|---|
| `<repo>/.claude/state/pr-phase.lock` | `/mccp:pr` Phase 3.5 Codex-review subphase 진입/이탈. PreToolUse가 write-tool block 결정에 사용. | enter (Phase 3.5 직전) → exit (PR 본문 inject 직후, gh pr create 직전). crash 시 다음 invocation의 `detect-stale`이 finalizer 우선 실행 후 clear. |
| `<repo>/.claude/receipts/.migrations/v0.2.8-generic-quarantine.lock` | validate-cmd / `/mccp:pr` Phase 0 부팅 시 동시 trigger 직렬화. winner만 rename 수행, loser는 marker complete bounded poll. | acquire (`fs.openSync wx`) → release (try/finally). |

#### Canonical schema (양쪽 공통)

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
- **Stdout-pipe IPC contract**: writer ↔ helper 간 모든 mutating call (enter/exit/release)은 stdin pipe로 token 전달. command-line argument로 token 전달 금지 — process listing 노출.
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

5. v0.2.8 Task 2.6.5a + Task 2.6.1-followup F11 hardening — **lock body는 `ownership_token_hash`를 포함**합니다 (sha256 of `crypto.randomUUID()`). canonical schema + stdout-pipe IPC + lease/heartbeat 상세는 §3.6 참조:
   - `<repo>/.claude/receipts/.migrations/v0.2.8-generic-quarantine.lock`을 **직접 편집하지 마세요**. `ownership_token_hash`가 빠지면 holder의 `releaseLock`이 stdin-pipe로 받은 raw token의 hash를 재계산하는 검증이 실패하고 lock이 mtime 만료(60s) 후에만 reclaim됩니다 (F11 sealed channel).
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

# Silent-hook UX (v0.2.7 — Observability Surface)
MCCP_RECEIPT_DEBUG_LEGACY_INLINE=0                 # v0.2.7 advanced opt-out. MCCP_RECEIPT_DEBUG=1일 때 L2a ALLOW-path systemMessage emit을 끄고 기존 block-payload inline 모드만 유지. Default(unset 또는 =1)는 L2a active. 자세한 precedence는 docs/ENVIRONMENT.md §1.

# Auto-chain (v0.2.2)
MCCP_AUTO_CHAIN_DISABLE=1                # kill switch ─ live
MCCP_AUTO_CHAIN_SKIP_PR=1                # commit-only chain (직접 push cycles 용) ─ LLM-observed (mechanical 미구현; auto-chain.js는 honor하지 않음, W-VERDICT C2 axis M)

# Auto-handoff (v0.3.0 S10b — live, v1.1.0 honest quarantine)
MCCP_AUTO_HANDOFF=off|notify             # default: notify. cost-tier 검출 + STATE.md write + stderr 배너. 실제 세션 spawn은 아래 experimental flag에 종속됨. (spawn은 v1.1.0+ deprecated alias — flag 없으면 notify로 강등됨, ledger에 experimental_spawn_requested=true 기록.)
MCCP_AUTO_HANDOFF_EXPERIMENTAL_SPAWN=1   # v1.1.0+ opt-in. PATH에 claude binary 필요. 미설정 + MCCP_AUTO_HANDOFF=spawn 요청 시 notify로 강등 + fallback_reason='spawn-experimental-flag-missing'. IDE-launched sessions에서 spawn은 거의 항상 실패하므로 default 미설정 권장.
MCCP_HANDOFF_THRESHOLDS_USD="50,80,100"  # default. comma-separated notice,warning,critical USD thresholds. parse 실패 또는 invariant 위반 시 default + stderr warn.

# v1.2.0-m1 Orchestrator (dispatch-controller)
MCCP_ORCHESTRATOR_POLL_MS=500            # default. dispatch-watcher polling 간격. 낮추면 envelope detection 빠름, CPU 증가. ─ live (M1)
MCCP_DISPATCH_CONTEXT=0|1                # default: 0. =1 시 mccp-receipt write가 controller-context marker 자동 stamp + 3 attribution flags(--dispatched-by-controller-session/--worker-dispatch-id/--ipc-envelope-path) 모두 require. 누락 시 fail-closed exit 12 (F2 absorption). controller가 worker prompt 만들 때 자동 set. ─ live (M1)
```

---

## 5. 모르거나 막힐 때

1. `.claude/notes/mccp-v0.2-continuation.md` — 진행 중 작업 큐
2. `docs/v0.2-architecture.md` — 전체 설계
3. README.md — 사용자 관점 요약
4. 사용자 auto-memory (user-level, 프로젝트 워크트리 밖) — 세션 시작 시 `MEMORY.md` 인덱스가 자동 주입됩니다. 직접 경로 참조 대신 인덱스에 노출된 항목명으로 조회하세요.

새 패턴/관행이 정해지면 memory에 저장하기 전에 이 CLAUDE.md에 반영할지 먼저 검토하세요. 프로젝트 단위 룰은 여기가 더 안정적입니다.
