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

v0.1의 receipt chain은 *"adversarial review가 일어났는가"* 만 검증하고, *"사람이 감시해야만 다음으로 넘어가는 chokepoint"* 는 그대로 남겨 뒀습니다. v0.2 이후 그 위에 자동화 layer가 누적됐습니다 (설계와 sequence diagram은 [docs/v0.2-architecture.md](docs/v0.2-architecture.md)).

**모듈별 상세 이력 — 무엇을 어떤 흡수를 거쳐 어느 버전에 ship했는지 — 은 [docs/milestone-ledger.md](docs/milestone-ledger.md)가 소유합니다.** 아래는 색인입니다.

| 축 | 모듈 |
|---|---|
| 실행 게이트 | Stop-loop · STATE.md continuity · Auto-handoff · `/mccp:work` · dual-reviewer escalate · diverse-agent review (plan 승인 다관점 전환) |
| Codex 경계 | Codex disabled honor · Codex/impeccable scope split |
| 관측 (v1.3.0) | schema baseline · derive engine · briefing stamp · STATUS.md+HTML renderer · refresh trigger + privacy guard |
| 오케스트레이션 | dispatch-controller · work implement isolation · plan fan-out · single-worker Workflow 이전 · N-worker parallel scaffold · aggregate verify 네이티브화 · 병렬 활성화 worktree-merge live |
| 비용·발화 | cost-state time-based decay · orchestration live-activation · firing-preview + 관찰 프로토콜 · operational-USD firing-block 은퇴 |
| 기타 | cwd-mask + branch-validation polish |

자동 게이트는 환경 변수로 토글합니다 — [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) §11 참조.

> **이 파일을 줄일 때**: 무엇이 상주해야 하는지는 [docs/multi-session-work-loop/instruction-contract.md](docs/multi-session-work-loop/instruction-contract.md)가 소유하고, 절을 옮기면 `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`가 목적지·anchor·상주 포인터·무목적지 소실을 fail-closed로 검증합니다. ledger에 없는 절이 사라지면 실패합니다 — 이전과 삭제를 가르는 유일한 기계 장치입니다.

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
- **v1.22.0 M3 — `chain_aborted` provenance 필드**: `abort_owner`(enum `'cost'|'dispatch'|null`)+`cost_abort_at`(ISO)는 present-only frontmatter(`dep_check_at` mirror — set 시에만 직렬화)입니다. cost 채널(`ecc-context-monitor`)이 `chain_aborted`를 set하면 `abort_owner='cost'`+`cost_abort_at`를 동봉하고, `dispatch_chain_aborted` 이벤트는 `abort_owner='dispatch'`+stale cost marker clear를 수행합니다. cost-origin `chain_aborted`는 marker age > `MCCP_COST_STATE_DECAY_HOURS` ∧ fresh cost 정상 ∧ no active dispatch일 때만 decay-clear되고, dispatch/precompact abort(`abort_owner≠'cost'`)는 절대 미clear입니다(§4 `MCCP_COST_STATE_DECAY_HOURS`). additive present-only이라 derive frontmatter passthrough·frozen schema 무손상.

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

> **v1.23.0 M3 — verdict-level ship gate는 위 classification 계층과 별개 축입니다.** 위 표는 codex 호출의 *transport* 상태(호출이 됐는가·응답이 왔는가)를 다루고, terminal `/mccp:pr`의 M3 ship gate는 그 위에서 *review verdict* 자체(`resolution.codex_verdict`)를 판정합니다. classification=`ok`(정상 응답)이어도 review verdict가 `divergent`/`critical`이면 [pr-ship-gate.js](plugins/mccp/scripts/lib/pr-ship-gate.js) `deriveShipDecision`이 no-ship으로 판정 → finalize `exit 12` + validate `--check-ship-verdict` `pr_codex_nonconverged`로 mechanical HALT(§1.4 M3 참조). advisory mode(`MCCP_ALLOW_CODEX_UNAVAILABLE`)는 verdict를 `unavailable`로 만들어 이 역시 no-ship(fail-closed)이지만, terminal `/mccp:pr`은 Phase 0에서 advisory를 이미 거부하므로 finalize에 `unavailable`이 도달하는 경로는 companion defect뿐입니다. 유일 우회는 audited override `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`(§4)이며 verdict는 봉인 유지.

> **v1.23.5 gate-guard-integrity M1 — ship proof는 `codex_disabled_at_pr`(명시) 축입니다.** verdict가 `skipped`일 때 ship이 성립하려면 [pr-ship-gate.js](plugins/mccp/scripts/lib/pr-ship-gate.js) `SKIP_PROOF_META_KEYS` 중 하나가 `true`여야 하는데(unproven skip은 `skipped-unproven`으로 fail-closed), 그 집합은 이제 **caller가 명시적으로 주장한 3개**만 갖습니다 — `codex_skipped_at_pr` · `codex_dedupe_at_pr` · `codex_disabled_at_pr`. **ambient `meta.codex_disabled`는 proof가 아닙니다.** 두 필드는 애초에 다른 축이며(`codex_disabled` = env 정책의 *정직한 주석*, `write.js`가 `MCCP_CODEX_DISABLED=1`에서 자동 stamp / `codex_disabled_at_pr` = *PR-step audit 축*, 명시 플래그 전용), 그 구분은 [pr-codex-dedupe.test.js](plugins/mccp/scripts/receipt/tests/pr-codex-dedupe.test.js) `:113-118`이 단언하고 `schema.js`의 3-way skip mutex도 `_at_pr` 변종만 원소로 갖습니다. ambient를 proof로 인정하던 시절에는 **표준 설치**(`MCCP_CODEX_DISABLED=1`이 사용자 `settings.json`에 존재)에서 전 receipt에 그 필드가 찍히므로 증거 없는 skip이 예외 없이 증거를 얻어, 위조 탐지 분기가 **구조적으로 도달 불가**였습니다. 운영자의 env-policy ship 경로는 `finalize-receipt.js#deriveCodexFlags`의 `codex_outcome==='disabled'` 분기가 `--codex-disabled-at-pr` + canonical `--codex-skip-reason`을 명시 forward해 보존됩니다(두 변경은 **단일 커밋 불변식** — proof 제거만 착지하면 ship 경로가 조용히 끊깁니다).
>
> 같은 milestone에서 `write.js`의 `codex_skip_reason` precedence도 **반전**됐습니다: 명시 `--codex-skip-reason` > env canonical(fallback). 이전에는 ambient env가 audited 사유를 14자 canonical `'codex_disabled'`로 덮어써, `codex_skipped_at_pr=true`가 발동시키는 strict validator(≥30자·≥3단어)에 걸리는 **자기 schema가 거부하는 receipt**를 생산했고 — env가 켜진 환경에서 `MCCP_PR_SKIP_CODEX_REVIEW` audited escape가 사실상 사용 불가였습니다. **계층 구분이 핵심**입니다: `codex-runner.js:234-238`은 반대 precedence(env 우선)를 **의도적으로** 유지합니다 — runner는 *무슨 일이 일어났는지 관찰*하므로 env 정책이 canonical이 맞고, writer는 *caller가 주장한 것을 기록*하므로 그 주장을 덮으면 안 됩니다. `write.js`의 `codex_disabled` env-stamp 자체는 무변경입니다(정직한 주석으로 남되 proof가 아닐 뿐).

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

#### 3.5.1 머지/리베이스가 파일을 소리 없이 삭제하지 않았는지 검증 (실측 사고 — PR #110 회귀)

**오래 산 feature branch에 base(main)를 머지하거나 그 branch를 main에 머지·squash할 때, base 쪽에서 intervening PR이 새로 추가한 파일이 branch의 옛 트리에 밀려 조용히 드롭될 수 있다.** 실제로 PR #110(durable-evidence-substrate, 브랜치 `feat/integrity-unification-m1`)이 머지되며 **PR #109가 main에 새로 추가한 `multi-session-work-loop` 산출물 9개 파일**(PRD·plan·report·`docs/multi-session-work-loop/` 6개, ~2144줄)을 머지 해소 과정에서 전부 삭제했다. 브랜치가 #109 이전에 갈라져 그 파일들을 몰랐고, 머지가 브랜치의 옛 트리를 favor하면서 반대편 신규 파일을 함께 지운 것이다. `git checkout 626b82b -- <files>`로 복구 (branch `fix/restore-multi-session-work-loop`).

- **커밋/PR 직전 삭제 검증 의무**: `git diff --diff-filter=D --name-only <base>...HEAD`로 이번 브랜치가 삭제하는 파일 목록을 확인한다. 목록에 **내가 의도적으로 지운 것이 아닌 파일**(특히 다른 사람/다른 PR이 최근 추가한 `.claude/prds/`·`.claude/plans/`·`docs/*` 산출물)이 있으면 **멈추고 조사**한다 — 그 삭제는 거의 항상 머지 사고다.
- **금지**: 머지 충돌을 "내 branch 쪽 디렉토리를 통째로 취함"(`git checkout --ours <dir>`, 무분별한 `git rm -r`, 브랜치 트리 강제 덮어쓰기)으로 해소하는 것. 반대편이 새로 추가한 파일을 함께 삭제한다. 충돌은 파일 단위로 해소하고, 반대편 신규 파일은 **보존이 기본**이다.
- **의심 시 base와 대조**: 산출물 디렉토리(`.claude/prds/`, `.claude/plans/`, `docs/`)는 `git ls-tree -r --name-only <base> -- <dir>`와 현재 HEAD를 비교해 base에 있는데 HEAD에 없는 파일이 없는지 확인한다.
- 관련: [memory: stacked-pr-merge-order](머지 순서 함정), [memory: merge-drops-intervening-files](본 사고).

### 3.6 Atomic state locks (`pr-phase.lock` + `quarantine.lock` + `evidence write lock`)

mccp는 state lock 3종을 운용한다 — `pr-phase.lock`(`ownership_token_hash` + stdin-pipe sealed channel) ·
`quarantine.lock`(raw token in-body, `0o600`) · evidence write lock(`<target>.lock`, raw token).
셋 다 lease + heartbeat를 **공유**하지만 **token 모델·실패 정책·lease 값이 다르다**
— "공통"으로 뭉뚱그리지 말 것. 앞 둘은 `(PID dead)` **또는** `(mtime > 60s)`로 orphan 판정하고
(quarantine migration은 25 step마다 heartbeat), evidence lock은 5s다(아래).
**lock 파일 직접 편집 금지**(말미 참조). 배경: [상세](docs/gate-design.md#atomic-state-locks)

#### evidence write lock이 앞의 둘과 다른 점 (v1.23.1)

- **실패 정책이 fail-closed**입니다. `session-ledger.js#withLedgerLock`은 획득 실패 시 경고만 남기고 lock 없이 진행하는데(last-writer-wins), 그 동작이 PRD가 구조적 취약으로 지목한 결함 자체라 여기서는 **throw**합니다(`EVIDENCE_LOCK_UNAVAILABLE` — 에러에 lock 경로·잔여 lease·복구 지침·kill switch 포함). 단 **caller별 비대칭은 의도적**입니다: `writeReceipt`는 fail-closed, hash-carved 메타 stamper 2건(briefing · completion-ledger 진단)은 fail-open + loud skip.
- **lease(5s)가 PID liveness와 무관하게 항상 적용**됩니다. `pr-phase-lock.js`의 tri-state("same-host + pid alive → 절대 reclaim 안 함")를 **차용하지 않습니다** — 그 정당화는 분 단위 lock에만 성립하고, ms 단위 임계구역에서 live holder의 lease 초과는 *작업 중*이 아니라 **고장**이라 tri-state + fail-closed 조합은 해당 receipt를 영구 차단합니다. liveness는 reclaim을 *막는* 조건이 아니라 lease 이전에도 즉시 reclaim하게 하는 **추가 trigger**입니다(dead PID·cross-host → 즉시).
- **파일명 규약이 강제**입니다: lock은 `.lock`, tmp는 `<target>.<pid>.<rand>.tmp`. `.gitignore`가 `mccp-pr-codex/*.lock`·`*.tmp`만 재무시하므로 다른 이름은 git-tracked ship receipt 디렉토리를 오염시킵니다. tmp 이름이 고정이면 동시 writer가 tmp에서 충돌하므로 pid + nonce가 필수입니다.

#### Ownership-token 모델 (락별 상이 — `pr-phase.lock` → `quarantine.lock` 순)

- **Stdin-pipe IPC contract**: writer ↔ helper 간 모든 mutating call (enter/exit/release)은 stdin pipe로 token 전달. command-line argument로 token 전달 금지 — process listing 노출.
- **raw token in-body**: `acquireLock`이 `crypto.randomUUID()` token을 lock body에 **평문**으로 기록합니다(hash 아님, stdin-pipe 아님). `0o600` owner-only 파일 모드로 shared-tenant에서 타 사용자 read를 차단. `releaseLock`은 `body.token === token` ownership 일치 시에만 unlink(zero-byte / unparsable / mismatch는 unlink 안 하고 lease reclaim에 위임).
- **잔여 리스크 (문서화된 것 — "무해"로 단정 금지)**: `releaseLock`에 **no-token legacy 경로**가 있습니다 — 호출자가 token 없이(`undefined`/`null`) release하면 ownership 검증 없이 unlink합니다(단 loud stderr warn). 현재 유일 호출자 `migrate()`는 **항상 token을 전달**하므로 실제 트리거 caller는 없지만, legacy / 직접 호출자가 이 경로를 타면 live holder의 락을 삭제할 수 있습니다. code hardening(no-token 경로 제거 / test-gate)은 PRD out-of-scope로 [backlog](.claude/plans/codex-findings-backlog.md)에 이연했고 P6은 문서만 정정합니다.

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

#### 병렬 브랜치 version 충돌 — forward-only 상향 (실측 3회 재발)

같은 base에서 갈라진 두 브랜치가 **같은 version 번호를 각기 다른 작업에 선언**하는 일이 반복된다. 먼저 머지된 쪽이 그 번호를 가져가므로, 나중 브랜치는 base를 병합할 때 번호를 **한 칸씩 올려야** 한다.

선례 4건: `#94 audit P5`가 1.20.9를 선점 → 후속 브랜치가 1.20.10으로 상향(§1.4) · MSW M3 노트 CL-3이 sibling worktree `feat/codex-intent-context`의 1.23.1 중복을 사전 경고 · PR #117이 goal-detect에 1.23.1을 쓰는 사이 main이 MSW M3에 1.23.1을 발행(merge-commit `71491f8`, goal-detect→1.23.2 · red-test-suite→1.23.3으로 상향 해소) · session-process-reclaim M3이 base를 머지하는 **도중에** main이 1.26.0 → 1.26.1을 발행해 target이 한 칸 더 밀림(1.27.0에 착지).

마지막 사례가 보여주는 것: **번호를 미리 정해 두면 안 된다.** 충돌은 브랜치를 딴 시점이 아니라 머지·PR 사이에도 열려 있으므로, target은 (a) 머지 해소 시점과 (b) `/mccp:pr` 진입 직전 두 번 재계산해야 한다. 재상향은 `plugin.json`을 바꾸므로 footer 2면과 CHANGELOG 헤딩이 다시 어긋나고 `i18n-surface.test.js`가 붉어진다 — 재상향 뒤에는 동기 4면 검증을 **전부 다시** 돌릴 것.

- **감지**: `git merge origin/main` 후 `CHANGELOG.md`에 같은 `## [X.Y.Z]` 헤딩이 둘 생기면 충돌이다. 헤딩 중복은 조용히 넘어가지 말 것 — CHANGELOG가 깨진 상태다.
- **해소**: 이미 발행된(=main에 있는) 번호는 **불가침**이다. 미머지 브랜치의 항목만 위로 민다. 항목이 여러 개면 각각 한 칸씩(예: 1.23.1→1.23.2, 1.23.2→1.23.3). 서로 다른 축이면 **하나로 합치지 말 것** — CHANGELOG 서사가 뭉개진다.
- **동기 대상 4면**: `plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md`의 `currently \`X.Y.Z\`` 노트 + 각 항목 본문의 `A → B` bump 서술. 하나라도 빠지면 surface drift다. **`renderer/tests/i18n-surface.test.js`는 동기 대상이 아니라 검증 수단이다** — 기대값을 `require('plugin.json').version`으로 파생하므로(`:94`) 고칠 리터럴이 없고, `plugin.json`만 올리고 footer를 빠뜨리면 그 test가 red로 잡는다. (v1.23.12 정정: 이전에는 "5면 · 단언 2개"로 적혀 있었으나 그 리터럴 pin은 이미 제거된 뒤였다.)
- **PR title 재확인**: 상향 후 PR 제목의 version이 stale해진다(§3.7 체크리스트 4번). `gh pr edit <N> --title ...`로 맞출 것.
- **날짜 역전은 정상**: 병렬 브랜치의 작성일을 그대로 두면 version 내림차순과 날짜 순서가 어긋날 수 있다. version 순서가 정본이므로 날짜를 조작하지 말 것.

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

trigger는 OR — (a) `impeccable-detect.js` `design_signal=true` · (b) 좁은 whitelist `DESIGN_SURFACE_PATHS` ·
(c) `MCCP_DESIGN_INTENT_REASON` audited override(strict validator). 한 축이라도 hit하면
`frontend-design-direction` SKILL의 **Output Constraints**를 즉시 Read하고 critique retry loop을 돌린다.

#### 4 출력 제약 (SKILL.md `## Output Constraints` anchor)

1. **정보 위계 3단계** — primary action → status → detail. Heading depth ≤ 3 in primary surface.
2. **강조색 화면당 1개** — Accent color/highlight token use ≤ 1 per viewport.
3. **raw markdown marker 금지** — Unrendered `**bold**`, MD0xx, stray inline code 미surface.
4. **한 화면 항목 수 상한** — `list-of-N` 섹션 상위 3개 expanded + 나머지 `<details><summary>+N more</summary>` collapse.

retry cap은 `MCCP_DESIGN_CRITIQUE_MAX_RETRY`(default 2, 허용 0~3)다. verdict enum은 정확히
`CONVERGED` / `ESCALATE_NEXT_ROUND` / `DIVERGENT_UNRESOLVED` 3종이고, `decideCritique`는
HIGH/CRITICAL/UNKNOWN(severity 누락)을 fail-closed로 판정한다. cap=0이어도 R0 1회는 돌므로
silent disable은 불가하다. `/mccp:pr`·`/mccp:prp-pr`는 loop을 **돌리지 않는다** — prior receipt가
`design_critique_verdict='divergent'`면 gh 호출 전 BLOCK하고, 복구는 prior gate 재실행 **또는**
`MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="<substantive reason>"` 1회 advisory다.

본 M2 plan은 좁은 whitelist (axis b)로 자기-재현을 차단 — `impeccable-detect.js` / `design-critique-decide.js` / `skills/frontend-design-direction/` 변경은 detector positive로 인식됩니다. pre-ship dogfood는 `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0|1` test env가 보장합니다(critique invoke 결과를 mock해 retry loop 회귀를 강제). `.claude/cache/test-fixture-status.html`은 커밋물이 아니라 필요 시 test-time에만 쓰이는 임시 합성 파일이며 현재 tracked 상태가 아닙니다 — dogfood는 env 경로만으로 성립하므로 fixture 존재에 의존하지 않습니다 (M2 acceptance gate).

produced diff는 critique loop이 구조적으로 못 본다(EXECUTE 이전에 돌기 때문). 그 gap은 **별도 locus**인
Phase 3.7 produced-diff grounding lint(`MCCP_DESIGN_GROUNDING`, default `enforce`)가 H15(heading depth ≤ 3)
anchor로 닫는다 — critique의 divergent-block과 중복이 아니라 그 위에 얹는 구조다.
배경: [상세](docs/gate-design.md#design-critique-loop)

---

### 3.10 Stage-aware impeccable command routing (v1.13.0 M1)

디자인 단계에 impeccable 명령군을 매핑하는 routing oracle([impeccable-routing.js](plugins/mccp/scripts/lib/impeccable-routing.js)).
`critique`은 **여기서 라우팅하지 않는다** — §3.9 retry loop 전용이라 divergent blocking이 보존된다.
stage → command: discovery `shape` · refine `layout`/`typeset` · evaluate `critique`/`audit` ·
harden `harden` · polish `polish`. `craft`·`live`는 비대화형 게이트와 부적합으로 **제외**한다.

`MCCP_IMPECCABLE_ROUTING_MODE`: `auto`(default — callForm 그대로 실제 호출) · `hybrid`(evaluate만 invoke,
나머지 recommend 강등) · `recommend`(전부 권장만). 게이트별로 plan/plan-prd는 recommend-only,
prp-implement는 실제 라우팅(`renderingSurface=0`이면 refine/discovery 강등), pr은 모드 무관
recommend-only(review-only invariant)다. receipt에 `meta.impeccable_routing_mode` +
`meta.impeccable_commands_routed`(per-command outcome)를 present-only stamp한다.

M1의 6개(shape/layout/typeset/critique/audit + harden/polish)에 Extended 카탈로그 10개를 추가하고, auto 모드 fan-out 비용을 **content 기반 선별**로 제어합니다.

**Axis B — a11y-architect routing-only → 실제 auto-invoke**: 기존엔 `codex-result-filter.js`가 a11y finding을 drop하고 `a11yRoutedCount`만 셀 뿐 a11y-architect를 호출하지 않았다. M3은 PR 게이트에서 실제 `Task(mccp:a11y-architect)`를 review-only로 auto-invoke한다.

a11y-architect 트리거는 `rendering_surface`(PR diff에 UI ext 존재)이지 Codex finding 유무가 **아니다** —
design-scope preamble이 a11y를 억제하므로 finding 기반 트리거는 starve된다. kill switch는
`MCCP_A11Y_AUTO_INVOKE=0`(default 1)이고 `rendering_surface=false`면 어느 값이든 skip한다.
배경: [상세](docs/gate-design.md#impeccable-routing)

---

### 3.11 완료 PRD/plan 아카이브 (`archived/` 관례 + `/mccp:archive-complete`) (v1.20.15)

완료된 PRD(전 milestone complete/dropped)와 그 plan은 `archived/` 하위로 이동해 대시보드 활성 스캔에서 빼낸다. v1.20.14까지는 수동 chore였고, v1.20.15부터 human-gate command `/mccp:archive-complete`로 제품화됐다([scan.js](plugins/mccp/scripts/lib/archive-complete/scan.js) 결정적 판정 + [apply.js](plugins/mccp/scripts/lib/archive-complete/apply.js) 원자 트랜잭션 + [command body](plugins/mccp/commands/archive-complete.md) 6-phase). `/mccp:dashboard-audit`(비파괴 마커로 stale 항목 은퇴)와 capability가 다르다 — 이쪽은 **파일 이동 + status flip**이다.

#### 폴더명 + 목적지 (고정)

- **PRD**: 활성 `.claude/prds/` → `.claude/prds/archived/`
- **plan**: 활성 `.claude/plans/` 또는 `.claude/PRPs/plans/` → `.claude/PRPs/plans/archived/` (두 활성 소스 모두 archived 목적지는 `PRPs/plans/archived/` 단일)
- 두 스캔 모두 **비재귀** — `archived/` 하위는 활성 표면에 자동 미표시. 완료 이력은 [milestone-history.js](plugins/mccp/scripts/lib/renderer/sections/milestone-history.js)가 `.claude/prds/archived/`(L218)를 직접 스캔해 타임라인에 유지 + plan git-time/summary는 `.claude/PRPs/plans/archived/` fallback(L51/L181)으로 해석.

#### 정합성 불변식 (코드 근거)

- **C1** — PRD는 활성 plan의 `source_prd`로만 대시보드 discovery ([plans.js](plugins/mccp/scripts/derive/sources/plans.js) `PLAN_DIRS` 비재귀 + milestone-history plan 루프). derive에 전용 PRD source 없음.
- **C2 (정확성 기준)** — 완료 plan archive는 **PRD 전체 완료 시에만**. 미완료 PRD의 plan을 옮기면 어느 스캔에도 안 잡혀 PRD가 소실된다. `apply.js`가 archivable을 재검증 + PRD와 그 모든 활성 plan을 하나의 원자 단위로만 이동(단독 이동 거부, 실패 시 전량 rollback).
- **C3** — archivable 판정은 `## Delivery Milestones` 표를 **원시 행 단위로 전부 열거**해 `rawRowCount === complete + dropped` fail-closed 등식으로만(비정규 status 행이 분모서 증발하는 오분류 차단 — Codex F1).
- **C4** — status 파싱은 `=== 'complete'` 엄격 일치. 비정규 텍스트(예 "complete (verify) · gated")는 complete도 lifecycle도 아님 → non-canonical → 보수적 non-archivable.

파괴적 변경(파일 이동 + status 편집)의 audit anchor는 operation journal(`.claude/state/archive-journal/<id>.json`, git-tracked — scan hash·승인·evidence·목적지·session 기록)이다. 파일 이동 chore이므로 `mccp-*-codex` 게이트 receipt는 발행하지 않는다(human-gate + git history + journal이 review — cross-model review는 YAGNI).

#### 아카이브 소유권은 이 명령 **단독**이다 (v1.25.2 — gate-guard-integrity M3)

plan을 `archived/`로 옮기는 주체는 `/mccp:archive-complete` 하나뿐이다(orphan plan의 수동 `git mv`는 아래 예외). **다른 어떤 게이트도 plan을 이동하지 않는다** — 특히 `/mccp:prp-implement`는 Phase 5에서 plan을 **그 자리에 둔다**. v1.25.2 이전에는 그 Phase가 milestone마다 무조건 `mv <plan> …/completed/`를 지시했고, 세 축에서 틀렸다:

- **C2 위반** — PRD가 `in-progress`인데 그 plan을 옮기면 C1대로 PRD가 어느 스캔에도 안 잡혀 소실된다. `apply.js`의 재검증·원자성·rollback을 통째로 우회한다.
- **가드 2 자기차단** — v1.23.5가 staleness 가드를 복원한 뒤 `/mccp:pr` 2.5.8·2.5.9는 `--plan`을 넘긴다. 이미 옮겨졌으면 validator가 re-hash할 파일을 못 읽어 `stale` → `ok=false`가 되어 **그 cycle의 PR이 방금 복원한 가드에 막힌다**(부재 경로 → stale 2건 실측).
- **목적지 오류** — 이 절·`apply.js`·`milestone-history.js`는 전부 `archived/`만 본다. `completed/`로 옮긴 plan은 어느 스캔에도 안 잡힌다.

즉 milestone 단위 implement는 아카이브 시점이 아니다. 아카이브는 PRD 전체가 끝난 뒤 `scan.js`가 `archivable:true`를 낼 때 사람이 한 번 수행한다.

#### Orphan plan(무-active-PRD)은 수동 아카이브

`/mccp:archive-complete`의 discovery는 **C1대로 활성 PRD의 `source_prd`로만** plan을 찾는다. 따라서 source PRD가 아예 없거나(free-form `/mccp:plan` 산출물) 이미 아카이브된/실재하지 않는 PRD를 가리키는 **orphan 완료 plan**은 tool이 구조적으로 못 옮긴다 — 버그가 아니라 의도된 PRD-driven 설계다. orphan은 드물게(shipped free-form plan마다 1개) 생기므로 **수동 `git mv`**로 은퇴시킨다:

```bash
git mv .claude/plans/<orphan>.plan.md .claude/PRPs/plans/archived/<orphan>.plan.md
```

완료 판정은 사람이 evidence(completion-ledger / `mccp-pr-codex` receipt / `## Acceptance` 체크율 / git last-commit)를 보고 내린다 — in-progress free-form plan을 실수로 옮기면 어느 대시보드 스캔에도 안 잡혀 소실되므로(C2-analog 데이터 손실) **확실한 것만**. 목적지는 C3와 동일한 `.claude/PRPs/plans/archived/` 단일. (선례: 2026-07-14 `archive-complete-command.plan.md`·`mccp-roadmap.plan.md` 수동 은퇴 + cost-model-subscription PRD 트리오는 archive-complete로 이동.) tool을 orphan human-gate 자동화로 확장하는 것은 빈도가 낮아 **YAGNI로 이연** — 본 수동 런북으로 충분.

---

### 3.12 증거 내구성 계약 (Evidence durability contract) (v1.22.4 — durable-evidence-substrate Phase A)

ship receipt(`mccp-pr-codex`)는 **감사 대조 corpus**라 worktree 삭제 후에도 ledger↔receipt 대조가
성립하도록 **git-tracked**로 유지한다. plan/implement receipt는 세션 진단용이라 working-tree only다.

#### 재봉인 금지 (no-rehash invariant)

기존 ship receipt의 `receipt_hash`는 **하나의 sanctioned 재봉인 도구를 제외하면 절대 재계산하지 않는다.** completion-ledger 엔트리의 파일명 정체성이 `<decision_id>__<receipt_hash[0:12]>`이고 `writeEntry`가 `(decision_id, receipt_hash)` 쌍에 멱등이므로, receipt를 **결속 재키잉 없이** 재봉인하면 ledger가 그 receipt를 가리키던 **결속이 끊겨 dangling**이 되고 재-append가 no-op이 아니라 **중복 엔트리**를 만든다(E4). 그래서 무단 재봉인은 금지다.

유일한 sanctioned 재봉인은 `v1.22.4-cwd-rebind.js`다 — `meta.cwd`를 redact하고 hash를 재계산하되 bound된
ledger 엔트리를 **같은 run에서 원자적으로 재키잉**한다. 불변식은 다른 모든 writer에 여전히 유효하다.

- 신규 receipt의 `meta.cwd`는 `write.js`가 repo-relative로 정규화한다(절대경로 leak 회피). 기존 receipt는 이 sanctioned 도구로만 손댄다.
- `hash.js`에 `meta.cwd` carve-out을 **추가하지 마라** — `meta.cwd`는 전 receipt에 존재하므로 carve-out은 전 receipt의 검증을 깨뜨린다. rebind은 carve-out이 아니라 결속 재키잉으로 hash 변경을 처리한다.
- git-tracked receipt를 다른 hash로 덮어쓰려는 시도는 `store.js#writeReceipt`의 가드가 fail-closed HALT한다. **cwd-rebind은 이 가드를 의도적으로 우회**한다 — `store.writeReceipt`가 아니라 직접 `fs`(atomic tmp+rename)로 쓰되, 결속을 원자적으로 재키잉하기 때문에 정당하다(도구 헤더에 명시). 그 외의 정당한 재-ship은 여전히 **새 decision slug**를 쓴다(기존 slug 덮어쓰기는 supersession 스키마가 생기기 전까지 불허). rebind이 아닌 어떤 tracked-hash 변경도 여전히 금지다.

#### `resolution.converged`는 신뢰 불가 필드 — 완료 판정 키로 쓰지 마라

완료/승인 판정의 키는 `resolution.codex_verdict`(`converged|divergent|critical|unavailable|skipped`)다.
`resolution.converged`는 divergent ship에도 `true`로 실리므로 완료 신호로 삼지 마라 — 소비처는
[receipt-convergence.js](plugins/mccp/scripts/lib/receipt-convergence.js)의 `isConvergedVerdict`를 쓴다.
terminal `/mccp:pr` ship gate는 no-ship **{divergent, critical, unavailable, absent}** / ship **{converged, skipped}** 을
finalize `exit 12` + validate `--check-ship-verdict`로 강제한다. 유일 우회 `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`는
**verdict를 재작성하지 않는다**.

#### merge-commit 정책

ship squash 시 PR merge 방식은 **merge commit**(GitHub 설정 적용 완료)이다 — squash가 개별 커밋 SHA를 소급 재작성해 evidence-commit이 참조하는 SHA 도달성을 깨는 것을 피하기 위함. 과거 squash 커밋의 SHA 복구는 원리상 불가능이므로(Out of Scope), 앞으로의 ship은 merge-commit으로 SHA를 보존한다.

감사 도구: `node plugins/mccp/scripts/lib/evidence-audit.js --json` (ledger↔receipt 대조 · `state=blind`면 비영점 exit · read-only · LLM-free).

배경: [상세](docs/multi-session-work-loop/evidence-conflict-design.md#evidence-durability-contract)

---

### 3.13 Plan-Codex 의도 컨텍스트 게이트 (v1.23.1 — codex-intent-context M1)

`/mccp:plan`의 Plan-Codex 게이트는 리뷰어(out-of-process Codex)에게 **사용자 대화 의도를 전달할 채널이 없었다**. 리뷰어는 제안서만 보고 요구사항은 못 봤고, finding 수용 판단은 어디에도 기록되지 않았다. M1은 세 축을 닫는다.

#### L1 — 의도 표면화

PRD-모드 plan은 `## User Intent` 표를 **필수**로 갖는다(`| ID | Constraint (user-stated) | Kind |`). [intent-context.js](plugins/mccp/scripts/lib/intent-context.js)가 이 표의 `Constraint` 열**만** 읽어 `<user_intent_reference>` 블록을 만들고 `codex-invoke --intent-reference-file`로 리뷰어 focus에 주입한다(순서: design-scope → intent → base focus).

- **저자 정당화는 절대 넣지 않는다**(UI2). anchoring 회피는 텍스트 lint가 아니라 **구조 분리**로 한다 — 오라클은 `## Design Decisions`에 도달할 경로 자체가 없다.
- 구조 가드(위반 시 섹션을 **부재**로 취급): ID `^UI\d+$` 유일 · `Kind ∈ {constraint, exception, exclusion, direction}` · ≥3단어 · placeholder 금지 · 지시문 형태 금지 · ≤200행.
- 주입 하드닝: 입력 엔티티 **1회 비재귀** 디코드(`&lt;`/`&#60;`/`&#x3c;`) → 이스케이프(역슬래시 **우선**) → 300자 상한(홀수 trailing `\` 제거). **homoglyph는 NFKC가 접지 못한다**(실측: `ignоre`의 U+043E 불변) — primary 통제는 토큰 내 **mixed-script 거부**(일반 규칙)이고 Cyrillic/Greek→Latin fold는 열거식 보조다.

#### L2-A — 판정 커버리지 강제

Codex의 **모든 finding**이 명시 adjudication을 받아야 한다. 1건이라도 빠지면 `incomplete` → **receipt 미작성** → `/mccp:prp-implement` 진입 불가. verdict 5종: `preserved` · `skipped` · `skipped-unproven` · `incomplete` · `conflict_unresolved`.

- **증명 없는 `skipped`는 통과 티켓**이므로 `meta.intent_skip_proof ∈ {free_form_plan, no_codex_findings, codex_disabled}` 하나를 mechanical하게 대조한다(`pr-ship-gate.js:55-68`이 이미 값을 치른 구멍).
- 유일한 **실질** 규칙: `intent_conflict ≠ none` ∧ `verdict=ACCEPT_NOW`면 `intent_override_reason` 필수 → 부재 시 `conflict_unresolved`.
- **M1은 오심을 막지 못한다.** 저자가 충돌을 `none`으로 찍으면 커버리지는 통과한다. M1은 **누락**을 막고, 오심 탐지(리뷰어 per-finding `INTENT:` 계약)는 **M1.5** 소유다. M1은 UI10 달성을 **주장하지 않는다**.

#### 단일 프로세스가 위조 창을 없앤다 (DD3)

[plan-codex-runner.js](plugins/mccp/scripts/lib/plan-codex-runner.js)가 Codex 호출 → payload를 **메모리 보유** → adjudication 대기(bounded) → 판정 → receipt write를 한 프로세스로 수행한다. 감사 envelope는 디스크에 남기되 **다시 읽지 않는다**(회귀 test: 변조해도 verdict 불변). 2-pass 설계는 pass 2가 envelope를 재read해야 하므로 **채택하지 않았다**.

- codex 900s > Bash 600s라 호출자는 runner를 **detached**로 띄우고 marker를 poll한다. marker 경로에 `RUN_NONCE`가 포함돼 stale marker가 새 경로에 존재할 수 없고, `meta.intent_run_nonce`가 receipt에 봉인돼 **marker 유실 크래시도 markerless로 복구**된다. per-decision lease lock이 동시 writer를 거부한다(host-aware tri-state).
- poll 상태는 `running`/`succeeded-markerless`/`crashed`/`timeout` 4종 — 무한 대기도 조용한 진행도 없다.

#### intent 결정은 CLI 표면을 갖지 않는다

`cli.js parseFlags`는 임의 `--*`를 `write()`로 전달하므로 intent 플래그를 만들면 **아무 셸 호출자나 Codex 없이 `preserved`를 stamp**할 수 있다. 따라서 `intentDecision`은 **프로그래매틱 non-null 객체 전용**이고(parseFlags는 문자열/`true`/배열만 생성 가능 → 타입 가드가 구조적 차단), `--intent-*` 플래그는 **0건**이다. 수동 복구는 `/mccp:plan` 재실행 또는 `MCCP_SKIP_INTENT_GATE`이며 `cli.js write`가 아니다 — `prp-implement.md` Phase 0.0도 `mccp-plan-codex`를 blind write하지 않고 분기한다.

#### 소비처별 판정 (단일 `pass` 없음)

| 출력 | 소비처 | override 영향 |
|---|---|---|
| `runtimeAllowed` | runner/write | 받음 |
| `chainAllowed` | `validate-cmd` 비-terminal | 받음 |
| `dedupeApproved` | `dedupe.js` | **절대 안 받음** |

강제된 `incomplete` receipt가 dedupe를 인증하면 PR-Codex가 skip돼 dual-review가 우회된다 — 그래서 단일 불리언을 쓰지 않는다. `dedupe.js`의 공유 `codexConverged`는 **불변**이고 intent 조건은 plan 축에만 붙는다(DD9 — 공유 헬퍼에 넣으면 out-of-scope implement receipt가 항상 unknown이 되어 **전 dedupe 사망**). legacy(키 부재) receipt는 chain ALLOW + warning이지만 dedupe는 거부 → "키를 빼면 공짜 skip"의 보상이 0.

#### Receipt audit (10 present-only 필드)

`intent_section_present` · `intent_items_count` · `intent_reference_injected` · `intent_gate_verdict` · `intent_adjudication_counts` · `intent_gate_force_override` · `intent_gate_force_override_reason` · `intent_skip_proof` · `intent_plan_digest` · `intent_run_nonce`. `makeSkeleton` **미포함**(`pr_codex_force_override` 선례 — §3.12 tracked ship corpus hash 안정성 + DD2의 "키 부재 = 모름" 보존). `by_verdict`는 **open map**이고 검증은 합계 불변식이다(닫힌 키 집합은 신규 verdict 추가 시 과거 receipt를 소급 invalid로 만든다).

---

### 3.13.1 오심(mislabelling) 탐지 (v1.23.9 — codex-intent-context M1.5)

M1은 **누락**을 닫았다. 그러나 저자가 모든 finding을 `intent_conflict:'none'`으로 찍으면 커버리지 검사는 전부 통과하므로 **오심**은 남았다. M1.5는 리뷰어에게 per-finding 계약을 부과하고 리뷰어 주장과 저자 판정을 **비대칭 대조**한다.

#### 계약과 파싱 — 모호하면 주장이 아니다

companion의 finding 스키마는 **외부 plugin 소유**라 필드를 추가할 수 없다(UI5). 따라서 리뷰어 주장은 finding 본문 안에 `INTENT: none` / `INTENT: UI3` 형태로 실린다. 자유 텍스트를 판정 채널로 쓰는 이상 위조·오인은 파싱 규칙의 정밀도가 아니라 **모호성을 전부 `unclaimed`로 접어서** 막는다([intent-claims.js](plugins/mccp/scripts/lib/intent-claims.js)).

- `title`+`body`+`recommendation`을 `"\n"` 하나로 이어붙인 **단일 텍스트**를 스캔한다(필드별 독립 주장을 허용하면 "정확히 1건" 규칙이 성립하지 않는다). 비문자열 필드는 빈 문자열로 강제.
- 스캔 **전에** 인용 구조를 제거한다: 백틱/틸드 fence · **4칼럼 이상** 들여쓰기 · blockquote · HTML `<pre>`/`<code>`/`<blockquote>`. 들여쓰기는 문자 수가 아니라 **칼럼**으로 잰다(탭은 다음 4칼럼 탭스톱까지 전진) — 공백과 탭이 섞인 `" \tINTENT: …"`는 문자로 세면 안 걸리지만 마크다운에서는 코드 블록이고, 걸러지지 않으면 인용된 예시가 진짜 주장이 되어 없던 합의를 만든다. **stripper는 완전할 수 없고 그래서 1차 통제가 아니다** — 놓친 인용이 *추가* 매칭을 만들면 "정확히 1건" 규칙이 fail-closed로 끝낸다. stripper가 실제로 막는 유일한 케이스는 진짜 주장이 없는 finding에 인용문 1건만 살아남아 **거짓 주장**이 되는 것이다.
- 앵커 매칭이 **정확히 1건이 아니면** `unclaimed`(0건=미주장, 2건 이상=첫 줄을 고르지 **않음**). 값은 `none` 또는 **단일** `^UI\d+$` — 콤마 목록·섹션에 없는 id·**64K자**(문자 수 상한이지 바이트 아님 — 앵커 정규식의 스캔 비용은 code unit에 비례하므로, 바이트로 재면 같은 비용이 리뷰어의 언어에 따라 통과·차단으로 갈린다) 초과는 전부 `unclaimed`이며 **절대 `none`으로 접히지 않는다**(접히면 탐지가 조용히 꺼진다).

#### 6분류 · blocking 규칙은 하나

| 분류 | 리뷰어 | 저자 | 처리 |
|---|---|---|---|
| `agree-none` / `agree-conflict` | 일치 | 일치 | 통과 |
| `author-only` | none | UI*n* | 통과 — 과다 라벨은 안전 방향 |
| `reviewer-only` | UI*n* | none | **명시 응답 필요** |
| `id-mismatch` | UI*n* | UI*m* (n≠m) | **명시 응답 필요** |
| `unclaimed` | 미주장/모호 | * | compliance 축 |

blocking 규칙은 단 하나다: **"리뷰어가 지목한 id를 저자가 지목하지 않았다"**. `id-mismatch`를 통과시키면 conflict-vs-none만 탐지하면서 "라벨 비대칭을 탐지한다"고 주장하게 된다.

해소는 ① `intent_conflict`를 리뷰어가 지목한 id로 **정정**(그 순간 M1의 override 규칙 발동)하거나 ② `intent_dispute_reason`에 **리뷰어가 틀린 이유**를 쓰는 것뿐이다. 둘 다 없으면 `mislabel_unresolved`. dispute는 strict `validateReason`을 재사용하되 **코드 어휘 half는 면제**한다(`allowCodeVocabulary`) — `"no"` 류 1-token과 명백한 filler(`lorem`·`asdf`)는 여전히 **부재로 취급**되지만, 반론은 코드를 논하는 산문이라 `test` scaffolding이나 `bar.ts`를 이름으로 부를 수 있어야 한다. 그것까지 막으면 저자의 출구는 validator가 놓아줄 때까지 문장을 고쳐 쓰는 것(게이밍 학습)이거나 포기하고 오심하는 것(게이트가 막으려는 바로 그 실패)뿐이다. override 표면은 면제 대상이 아니다 — opt-in per call이라 전체 목록을 그대로 유지한다.

#### `partial`은 통과 상태가 아니다

compliance는 `claimed/total`로 **계측**하되 판정은 이분법이다: `full`이 아니면 `inconclusive`.

`inconclusive`여도 **관측된 불일치는 그대로 기록된다** — 계약을 지킨 finding에서 리뷰어와 저자가 어긋났다면 그 항목은 `intent_mislabel_audit`에 남고 `intent_mislabel_disputes`에도 계수된다. `inconclusive`는 "불일치가 없었다"가 아니라 "대조의 **완전성**을 인증할 수 없다"는 뜻이므로, 본 것을 지우는 것은 M1.5가 막으려는 바로 그 행위다. 소비처는 옆에 붙은 `intent_reviewer_contract='partial'`로 그 수치가 부분 대조에서 나왔음을 알 수 있다. 따라서 schema는 `inconclusive` + 비어있지 않은 audit을 **거부하지 않는다**(거부하면 정상 producer 출력이 막힌다 — 실측 재현됨). 20건 중 1건만 주장해도 통과시키면 M1의 구멍을 리뷰어 쪽으로 옮긴 것에 지나지 않는다. 임의 임계(80% 등) 대신 이분법을 택한 이유는 **방어할 근거 없는 숫자를 만들지 않기 위해서**이고, 계측값은 별도로 남으므로 1/20과 19/20은 감사에서 구분된다.

#### 3-mode — `off`는 판정 억제가 아니라 경로 미진입

`MCCP_INTENT_MISLABEL=enforce|warn|off`(§4). mode는 runner가 **Codex 호출보다 먼저** 해석하며 `off`면 ① 계약 문단을 프롬프트에 붙이지 않고 ② claims를 파싱하지 않으며 ③ `comparison`을 넘기지 않는다. ①이 빠지면 오라클을 건드리지 않았는데 **리뷰 payload 자체가 달라져** end-to-end M1 등가가 아니게 된다.

등가의 **범위는 리뷰 경로**(프롬프트 · 파싱 · 판정)다. 임시 작업 파일 `$AWAITING`은 등가 대상이 아니며 `off`에서도 `mislabel_mode`와 finding별 `reviewer_claim*` 키를 **null로** 싣는다 — 키를 지우면 그 파일을 읽는 저자가 "축이 꺼졌다"와 "리뷰어가 답을 안 했다"를 구분할 방법이 없어진다. 구분자는 `reviewer_claim_status`다: `'unclaimed'`는 물었는데 못 받은 것(→ `inconclusive`), `null`은 애초에 묻지 않은 것(→ M1.5 규칙 자체가 미적용). `reviewer_claim` **값**만 보면 둘이 똑같이 `null`이므로, plan.md 5.5a는 값이 아니라 status를 읽도록 지시한다.

`warn`은 **자체 sealed 상태**(`intent_mislabel_mode`)를 가지며 `intent_gate_force_override`를 재사용하지 **않는다** — 재사용하면 strict reason을 요구하는 audited-override 표면의 의미가 오염된다. `warn`이 여는 것은 mislabel 축(`inconclusive`/`mislabel_unresolved`) **뿐**이고, M1 축(`incomplete`/`conflict_unresolved`/`skipped-unproven`)에는 절대 열리지 않는다. `isIntentApproved`는 **무변경**이라 `warn`은 dedupe를 열지 않고 PR-Codex가 실제로 발화한다 — warn이 공짜가 아닌 지점이 정확히 여기다.

두 override의 관계는 순서가 정한다: mode가 먼저 판정하고, **여전히 blocking일 때만** `MCCP_SKIP_INTENT_GATE`가 적용된다. 따라서 `warn`이 통과시킨 경우 `intent_gate_force_override`는 `false`다 — 플래그는 *설정 여부*가 아니라 **효력 발휘 여부**를 뜻한다.

#### 감사는 카운트가 아니라 증거다 (present-only 6필드)

`intent_mislabel_mode` · `intent_reviewer_contract` · `intent_claim_counts` · `intent_claims_digest` · `intent_mislabel_disputes` · `intent_mislabel_audit`. `makeSkeleton` 미포함(§3.12 hash 안정성). 집계 수치만으로는 "리뷰어가 UI2를 지목했는데 저자가 무슨 근거로 기각했나"를 사후 대조할 수 없으므로, **명시 응답이 필요했던 finding에 한해** `intent_mislabel_audit`이 `finding_digest`와 함께 리뷰어 주장·저자 라벨·dispute 원문을 봉인한다(기각된 dispute의 원문도 남긴다 — 무엇이 왜 기각됐는지가 감사 대상이다). 통과한 finding의 무결성은 `intent_claims_digest`(전체 claim map)가 맡는다. 배열 상한은 `ADJUDICATION_LIMITS.ITEMS`(1000)와 같아 **truncation 분기가 존재하지 않는다** — 조용한 절삭은 감사 표면을 무력화하므로 선택지가 아니다. `intent_claim_counts`는 예외적으로 **닫힌 키 집합**이며 6분류 분할 불변식을 schema가 검증한다.

**집계는 증거를 이길 수 없다.** 분할 불변식만으로는 부족하다 — `reviewer_only`를 `author_only`로 옮기면 산술은 그대로 맞으면서 요약만 "응답 필요 0건"으로 읽힌다. 그래서 schema는 **분류별 tally 일치**(`reviewer_only`/`id_mismatch` ↔ audit 항목 수) · **audit 삭제 금지**(counts가 응답 필요를 보고하면 배열을 비울 수 없다) · **dispute 수 일치** · `intent_reviewer_contract`의 **counts 파생 가능성**을 함께 검증한다. 한 단계 위에서는 **verdict ↔ 증거**도 대조한다: `preserved`는 `full` 계약 ∧ 미해소 0을 함의하고, `inconclusive`는 non-full을, `mislabel_unresolved`는 미해소 ≥1을 함의하므로, 증거를 그대로 둔 채 위의 verdict만 뒤집은 receipt는 통과하지 못한다. 이는 **위조 방지가 아니다** — 파일 전체를 다시 쓰는 행위자는 모순 없는 거짓(`preserved` + `full` + 빈 audit)을 쓸 수 있고 어떤 대조도 그것을 못 본다. 닫는 것은 *증거를 남긴 채 결론만 바꾼* receipt와 producer drift다. 같은 이유로 `intent_gate_force_override_reason`은 플래그가 `true`일 때만 봉인된다(적용되지 않은 override의 사유를 남기면 일어나지 않은 일을 정당화한 기록이 된다).

#### M1.5가 주장하지 않는 것

- **오심을 교정하지 않는다.** 저자 라벨을 반증 가능하게 만들 뿐이다. 양쪽이 모두 `none`이면 여전히 탐지되지 않는다 — 다만 그 `none`이 한 당사자의 무검증 라벨이 아니라 독립된 두 당사자의 합의다.
- **강제되는 명제는 "오심 0"이 아니라 "기록 없는 수용 0"이고, 그것도 `enforce`에 한한다.** `warn`으로 내리면 그 명제도 성립하지 않는다.
- **`intent_dispute_reason`은 새 고무도장 통로가 될 수 있다** — M1의 `intent_override_reason`과 동형이며 부정하지 않는다. 남용은 `intent_mislabel_disputes` 비율로 관측되고, 그 비율이 높으면 그것이 M2(심판 분리)의 근거다.
- **기본값 `enforce`는 실측값이지만 표본이 좁다.** Task 0이 production 경로로 10회 측정해 50/50 유효 주장·`full` 100%를 얻었고(2026-08-13) 사전 선언 규칙 ≥95%가 값을 정했다 — 그러나 그 10회는 **단일 fixture 반복**이고 심어둔 충돌이 제약 하나씩만 정확히 위반하는 쉬운 표본이다. 실제 plan에서 준수가 떨어지면 비용은 `inconclusive` 차단으로 즉시 나타나며, 그때의 복구는 임계 하향이 아니라 `MCCP_INTENT_MISLABEL=warn` + 실제 plan 재측정이다. 근거·한계는 [reviewer-contract-compliance.md](docs/codex-intent-context/reviewer-contract-compliance.md).

---

### 3.14 (임시) 리뷰 finding 수용 임계 — HIGH 이상만 흡수

> **임시 규칙이다. 아래 「해제 조건」이 충족되면 이 절을 통째로 삭제한다.**
> 도입 2026-08-13 · 사유: `quorum.js:175-181` 누수(F6) + 리뷰어 verdict 불안정 실측.

**규칙** — 모든 리뷰 산출물(게이트 패널 · Codex · `/mccp:santa-loop` · 서브에이전트 리뷰)에서
**CRITICAL·HIGH만 그 자리에서 흡수**한다. MEDIUM·LOW, 그리고 **기각한 HIGH**는 고치지 말고
[codex-findings-backlog.md](.claude/plans/codex-findings-backlog.md)에 1줄 append한다.

- **기각에는 증거를 붙인다.** 심각도를 낮추거나 기각할 때는 backlog 줄에 *왜*를 file:line으로 남긴다.
  증거 없는 강등은 이 규칙의 남용이며, 그것을 막는 것이 append 의무의 목적이다.
- **`/mccp:santa-loop` 우선순위 override** — 커맨드 본문 Step 5는 "flagged 전건 수정"을 요구하지만
  이 절이 그 위에 선다: HIGH/CRITICAL만 고치고 나머지는 backlog. 라운드 판정도 마찬가지로
  **미흡수 HIGH/CRITICAL 부재**를 기준으로 하며, 리뷰어가 `verdict=fail`을 내도 그 리뷰어의
  자기 최고 severity가 MEDIUM 이하이거나 증거로 기각됐다면 수렴으로 본다(그 판단은 backlog에 기록).
- **바뀌지 않는 것** — receipt 게이트 자체(`MCCP_RECEIPT_GATE_MODE`), fail-closed 불변식,
  `GATE_IDS`, ship gate verdict 판정. 이 절은 *finding 수용 범위*만 정하고 게이트를 끄지 않는다.

**해제 조건** — `quorum.js`가 bare `verdict='fail'`을 `severity:'FAIL'` blocking finding으로
합성하지 않게 되면(= 자기 findings의 최고 severity로 재계산하거나 계약 위반을 `malformed`로 분류),
이 절과 backlog의 해당 항목을 함께 정리한다.

---

### 3.15 단일통과 토글 (v1.27.3 — review-loop-bypass M1)

`MCCP_REVIEW_SINGLE_PASS`는 작업 단위 opt-in으로 **리뷰 루프의 반복을 없앤다 — 리뷰를 없애지 않는다.**
값이 곧 사유이고 고정 enum 3종이다: `scope_too_small` · `deadline_pressure` · `deferred_to_prd_completion`.
별도 사유 변수를 두지 않은 이유는 잊을 수 있고 잊힌 사유는 감사 불가이기 때문이다 — 토글을 켜는 행위와
사유를 대는 행위가 같은 동작이어야 한다. 열거 밖 값은 **fail-closed**(꺼진 것으로 보고 loud warn)이며
대소문자를 구분한다(값이 receipt에 그대로 봉인되므로 정규화하면 서로 다른 입력이 같은 감사 필드를 채운다).

켜지면 셋이 함께 일어난다: `/mccp:plan`의 L2 패널이 1회만 발화하고 quorum 비수렴이 진행을 차단하지 않으며,
세 게이트의 Codex 라운드 캡이 `MCCP_GATE_ROUND_CAP`과 무관하게 1로 고정되고(토글이 상위 정책, 캡은 그 아래
조정값), `/mccp:santa-loop`의 `begin-round`가 라운드를 열지 않는다(exit 2 + `SANTA_SINGLE_PASS_ACTIVE`,
원장 미변경 → 캡 미소모, receipt 미작성).

**완화되는 경로는 정확히 하나다.** L1 실패 · L2 부재/판독 불가 · `responded=0` · budget skip ·
DD13 plan hash 불일치 · hybrid인데 L3 미수렴은 토글이 켜져 있어도 전부 HALT한다. 기준은
`divergent`(보았고 결함을 찾았다) 대 `unavailable`(인증할 수 없었다)의 구분이며, 후자를 통과시키는 것은
단일 통과가 아니라 **무통과**다. 이 보장은 코드 순서로 성립한다 — 완화 분기가 나머지 차단 분기보다 **뒤**에
있어, 그 지점에 도달했다는 것 자체가 앞의 조건을 전부 통과했다는 뜻이다.

receipt는 미작성도 미승인도 아니라 **사유가 봉인된 기록**이다. `resolution.review_verdict`는 실제
`divergent` 그대로 봉인되므로(converged 위장 없음) 대시보드·`evidence-audit`·ship gate가 전부 정직하게
비승인으로 읽고 cross-gate dedupe도 열리지 않는다. present-only 2필드는 **서로 다른 축**이다(§3.12의
`codex_disabled` 대 `codex_disabled_at_pr`과 같은 구분): `meta.review_single_pass_reason`은 토글이
*설정됐다*는 env ambient 주석(명시 플래그 우선), `meta.review_single_pass_bypassed_verdict`는 실제로
*적용됐다*는 명시 전용 감사 축이다. schema가 양방향으로 강제하되 정방향의 자격 verdict는 `divergent`
하나이고(비수렴 전체가 아니다 — `unavailable`은 완화 대상이 아니므로 우회 주장이 붙으면 거부된다),
역방향의 판별자는 source 이름이 아니라 **proof 구조**다: `multi-agent`는 `layers.l2` 비수렴,
`hybrid`는 거기에 `layers.l3='converged'`가 더해진 형태가 완화이며, 각 축은 그 형태에 플래그를
**요구**하고 그 밖의 형태에는 **금지**한다. 요구만 두면 DD2가 완화 금지로 명시한 L3 이견이 진짜 우회처럼
봉인되고, source 이름에 결속하면 L1이 무너진 정직한 기록조차 일어나지 않은 우회를 주장해야 한다.

**미흡수 지적은 자동 회수된다 (v1.29.0 — M2).** 토글이 떨어뜨리는 `quorum.blockingFindings`는 `plan.md`
5.2g2가 `.claude/plans/codex-findings-backlog.md`에 기계적으로 적재하며, 그 적재는 완화의 부수효과가 아니라
**전제조건**이다 — 적재할 수 없으면 `EX_BLOCK`이고 완화는 진행되지 않는다. 이는 위와 같은 선이다:
"결함을 기록할 수 없었다"는 `unavailable` 쪽이다. 퇴로는 새 env가 아니라 **토글을 끄는 것**이고(M2는 토글을
하나도 추가하지 않는다 — 적재를 끄는 스위치는 곧 유실을 켜는 스위치다), 그때는 원래의 비수렴 HALT로 돌아가
저자가 리뷰 기록에서 흡수하므로 유실은 여전히 0이다. 실행 위치는 5.2g **뒤** · 5.2h **앞**으로 고정된다
(앞이면 미검증 proof의 지적이 원장에 들어가고, 뒤면 record가 `backlog_appended`를 못 실어
`assert-backlog-parity`의 앵커가 사라진다). 적재 대상은 `blockingFindings` **정확히 그 집합**이며 `l2.json`은
적재원이 아니다(non-blocking 카운트로만 읽고, 판독 불가는 0이 아니라 null). 표는 **4열 고정**이다 —
`derive/sources/backlog.js`가 헤더를 리터럴로 고정하므로 5번째 열은 기존 행 전부를 파서에서 사라지게 한다.

**주장하지 않는 것**: plan·prp-implement의 라운드 루프는 여전히 LLM이 읽는 산문이라 기계화된 것은 캡 계산과
`pr.md`의 자식 프로세스 export, receipt 봉인, 그리고 세 본문이 공유 오라클을 읽는지의 정적 test뿐이다 —
마지막 것이 막는 것은 **배선 누락**이지 산문 불이행이 아니다. L2 비용은 여전히 1회분 발생한다. M2의 정적
단언도 같은 천장을 갖는다(배선 누락과 위치 drift만 잡고 셸 인용 실수·종료코드 미검사는 통과) — 실행 축은
CLI를 실제로 spawn하는 test와 라이브 발화가 나눠 덮는다.
배경: [상세](docs/gate-design.md#single-pass-review-toggle)

---

### 3.16 리뷰는 1라운드가 기본이다 — plan 완성도보다 적용 후 결과 (2026-08-18)

**모든 게이트 리뷰는 1라운드를 기본으로 하고, 그 라운드를 triage한 뒤 receipt를 쓰고
다음 단계로 진행한다.** 리뷰어가 finding을 계속 내더라도 라운드를 늘려 plan을 다듬지
않는다. §3.14가 정한 수용 임계(HIGH/CRITICAL만 흡수)는 그대로 적용하되, **그 흡수도
1라운드 안에서** 처리하고 남는 것은 이연한다.

#### 왜

**계획을 오류 없이 만들어도 다른 마일스톤·PRD가 진행되면 어차피 수정된다.** plan을
다듬는 비용은 사이클마다 반복 지불되는데, 적용해 보고 실제 결과로 판단하는 것은 한 번에
진짜 정보를 준다. 우선순위는 배포다.

실측 근거 — 2026-08-18 santa-evidence-diversity M1의 plan 한 건에 **8시간 가까이**
소모됐다. plan-review 패널 **6라운드** + Plan-Codex **2라운드**를 돌았고 라운드별 성격은
이렇다: R1 열거 공백(실재) → R2 범주 오류(기각) → R3 이음매 공백(실재) → R4 **R3 회귀** →
R5 계약 위반 2건 + 정지 → R6 새 축 0건 → Plan-Codex R1 실재 1건 → **R2는 R1에서 더
정직하게 고친 문장을 겨냥**. 즉 *수정이 다음 라운드의 표적이 되는 전이*가 동일모델
패널과 cross-model 양쪽에서 재현됐다. `plan-review/decide.js`에는 라운드 개념 자체가
없어 "직전 라운드가 이미 답한 항목"을 식별할 수단이 구조적으로 없다.

#### 어떻게

- 라운드 캡은 `MCCP_GATE_ROUND_CAP=1`(프로젝트 기본, 이미 `.claude/settings.json`에 설정).
- 1라운드 결과를 §3.14로 triage → receipt 작성 → 진행.
- 게이트가 막으면 **문서화된 감사 우회**(`MCCP_SKIP_RECEIPT` · `MCCP_SKIP_INTENT_GATE` ·
  `MCCP_ALLOW_CODEX_UNAVAILABLE` · `MCCP_FORCE_PR_WITHOUT_CODEX_CONVERGENCE`)를 쓰되
  **사유를 반드시 남긴다.** 요지는 게이트를 끄는 것이 아니라 **라운드를 늘리지 않는 것**이다.
- 미해소 항목은 [codex-findings-backlog.md](.claude/plans/codex-findings-backlog.md) ·
  `.claude/state/fix-task.md` · 신규 PRD 중 하나로 **명시 이연**한다. 조용히 버리지 않는다.
- plan 본문을 고쳐 리뷰를 다시 돌리는 것은 **기본 선택지가 아니다**. 고쳐야 할 것이
  실재하면 고치되, 그 다음은 재리뷰가 아니라 진행이다.

#### 그래도 하지 않는 것

- **리뷰어 프롬프트 완화 금지.** 통과시키려고 리뷰어에게 "fail 대신 pass" 취지의 조항을
  붙이지 않는다. CLI가 조립한 프롬프트(`emit-workflow-args` 등)는 verbatim 전달한다 —
  봉인되는 `reviewed_plan_hash`는 plan만 묶으므로 프롬프트 변조는 어디에도 안 남는다.
  오탐은 판정 하류(triage·backlog·adjudication)에서 거른다.
- **receipt 위조 금지.** 슬러그가 안 맞는다고 파일명을 바꾸지 않는다 — `decision_id`는
  해시된 본문 안에 있고 §3.12 no-rehash 불변식이 이를 금지한다. 우회가 필요하면 우회를
  쓰고 사유를 남긴다.

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

# 메타 조사 (v1.24.0) — PRD를 쓰기 전 단계. 게이트 아님(receipt 미발행)
/mccp:meta-research <주제>          # 조사 골격 5 phase 고정 + .claude/_meta/ 규격 산출물 + README 색인 등재
node plugins/mccp/scripts/lib/meta-research.js lint --all --json   # 전 산출물 형식/전제/색인 검사

# Receipt 운영
/mccp:receipt-status                # 현재 receipt chain 상태
/mccp:receipt-validate <command>    # 특정 게이트의 receipt 유효성 검증
/mccp:receipt-write <gate>          # 게이트 receipt 수동 작성

# Observability (v0.2.7)
/mccp:trace [<session_id>]          # hook-trace shard ledger 조회 (current + prior sessions, hook-caps.json 헬스)

# Orchestration firing-preview (v1.22.2 M2 — read-only, LLM 소비 0)
# live /mccp:work 진입 전 "지금 무엇이 발화할지"를 Step 3와 동일 oracle로 사전 판정 (상태 미변경).
node plugins/mccp/scripts/lib/orchestration-preview.js --plan <plan-path> --prd --json
# oracle_run(원자료) vs effective_fire(route 합성) 분리 출력 — parallel_fires는 route=workflow-parallel일 때만.
# live-dogfood 프로토콜(2개 named row 필수·재귀 회피): docs/workflow-orchestration/live-activation-observations.md

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

**canonical 레퍼런스는 [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) §11 "운영 토글 레퍼런스"입니다.** 토글 이름·기본값·판정 순서·흡수 이력이 전부 거기 있습니다. 기본값을 여기 옮겨 적으면 두 문서가 곧 어긋나므로 이 절에는 값을 적지 않습니다.

설정 위치는 `.claude/settings.json`의 `env` 블록 또는 셸입니다. 게이트가 막혔을 때 가장 먼저 보는 축은 `MCCP_RECEIPT_GATE_MODE`(receipt 게이트 강도) · `MCCP_CODEX_DISABLED`(Codex 호출 skip) · `MCCP_SKIP_RECEIPT`(1회 bypass) 셋이며, 정확한 값과 실패 모드는 위 문서를 보세요.

---

## 5. 모르거나 막힐 때

1. `.claude/notes/mccp-v0.2-continuation.md` — 진행 중 작업 큐
2. `docs/v0.2-architecture.md` — 전체 설계
3. README.md — 사용자 관점 요약
4. 사용자 auto-memory (user-level, 프로젝트 워크트리 밖) — 세션 시작 시 `MEMORY.md` 인덱스가 자동 주입됩니다. 직접 경로 참조 대신 인덱스에 노출된 항목명으로 조회하세요.
5. `docs/v1.3.0-observability/schema-surface.md` — receipt + envelope + STATE.md frontmatter의 read-side schema surface 표준. derive 가정에 의문 생기면 여기부터. PRD ↔ code 식별자 매핑은 `docs/v1.3.0-observability/state-md-naming-reconciliation.md`.
6. `plugins/mccp/scripts/derive/index.js` — `.claude/` 통합 model derive 진입점 (9 source + 6 correlation kinds). M0 schema-surface.md 가정 동기. `node plugins/mccp/scripts/derive/cli.js run --json` 으로 즉시 호출 가능.
7. `plugins/mccp/scripts/lib/renderer/index.js` — v1.3.0-m3 STATUS.md + status.html renderer 진입점 (consumes M1 derive + M2 briefing fields, produces PM dashboard surface). `docs/v1.3.0-observability/dashboard-surface.md` 가 canonical spec. `node plugins/mccp/scripts/derive/cli.js render` 으로 즉시 호출 가능 (`.claude/cache/` 에 산출).
8. `docs/harness-cost-contract.md` — v1.21.2(cost-model-subscription M2 Axis A) `harness-cost-<sid>.json` 캐시 계약. `plugins/mccp/scripts/lib/harness-cost.js` 가 SoT(단일 validator + writer). 번들 statusline 이 harness 실비를 stamp → cost-tracker · ecc-context-monitor 가 소비. 커스텀 statusline writer 는 opt-in·비강제(fallback=transcript-sum). Axis B(threshold SoT)는 `MCCP_HANDOFF_THRESHOLDS_USD` 를 hard_ceiling·STATE.md abort 채널까지 도달시켜 env 즉효완화가 절반만 먹던 leak 봉인.

새 패턴/관행이 정해지면 memory에 저장하기 전에 이 CLAUDE.md에 반영할지 먼저 검토하세요. 프로젝트 단위 룰은 여기가 더 안정적입니다.
