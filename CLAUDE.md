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
- Codex 미설치 사용자는 `/codex:setup`로 인증 권장.

### 1.3 자동화 파이프라인 (v0.1 receipt chain)

PRD부터 PR까지 전 라이프사이클을 단일 namespace(`/mccp:*`)로 자동화합니다:

```
/mccp:plan-prd      → 문제 정의 PRD
        ↓
/mccp:plan          → 구현 plan + Codex adversarial review (R1/R2 수렴)
        ↓
/mccp:prp-implement → plan 실행 + Implement-Codex review + cross-gate dedupe
        ↓
/mccp:code-review   → 변경 코드 multi-perspective review        (alias: /mccp:review-pr — PR Review Mode)
        ↓
/mccp:prp-commit    → 자연어 파일 타겟팅 커밋
        ↓
/mccp:pr            → 디자인/보안/Codex review 통합 후 GitHub PR 생성   (alias: /mccp:prp-pr — verbatim)
```

각 단계는 **receipt** (`.claude/receipts/*.json`)를 발행하고, 다음 단계는 이전 receipt chain을 검증한 뒤에만 시작합니다 (mechanical enforcement). receipt 운용 모드는 §1.2의 `MCCP_RECEIPT_GATE_MODE` 참조.

### 1.4 v0.2 자동 게이트 레이어 (receipt chain 위)

brainstorming 분석 결과 v0.1의 receipt chain은 *"adversarial review가 일어났는가"* 만 검증하고, *"사람이 감시해야만 다음으로 넘어가는 chokepoint"* 는 그대로 남아 있었습니다. v0.2는 receipt chain 위에 자동화 layer 5개를 얹습니다 (자세한 sequence diagram + module boundary는 [docs/v0.2-architecture.md](docs/v0.2-architecture.md)):

| 모듈                       | 역할                                                                                          | 상태         |
| -------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| **Stop-loop**              | Claude stop 직전 자동 `lint → typecheck → test → e2e` + (opt-in) Codex diff review. fail 시 `fix-task.md` 생성 + 최대 2회 bounded retry | S8 ship      |
| **STATE.md continuity**    | `PreCompact`에서 write, `SessionStart`에서 inject — 세션 간 컨텍스트 자동 복원                | S10a ship    |
| **Auto-handoff**           | 누적 비용 $50 notice / $80 soft / $100 hard ceiling 임계로 자동 세션 전환                     | S10b 미구현  |
| **`/mccp:work`**           | 단일 entry로 PRD → plan → implement → PR 전 chain 자동 orchestration                          | S11 미구현   |
| **dual-reviewer escalate** | CRITICAL/divergent 시 `fix-task.md`에 `Next: /santa-loop ...` 안내 추가 (자동 호출은 안 함)   | S12 미구현   |

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

---

## 4. 자주 쓰는 명령 (Cheat Sheet)

```bash
# 부트스트랩 (fresh install)
/mccp:setup                         # codex plugin + impeccable CLI 자동 설치 + /codex:setup 체인 (idempotent)
/mccp:setup --dry-run               # 설치 없이 검출만

# 게이트 파이프라인
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

# Schema migrations (.claude/receipts/는 working-tree only — 각 사용자가 직접 실행)
# 새 schema bump 후 mccp:* validate가 "schema invalid" 차단하면:
node plugins/mccp/scripts/migrations/v0.2.4-security-fields.js .claude/receipts/*/*.json
node plugins/mccp/scripts/migrations/v0.2.6-impeccable-fields.js .claude/receipts/*/*.json
# 순서대로 (낮은 버전 먼저). --dry-run 옵션으로 미리 확인.

# Codex
/codex:setup                        # CLI 인증 & gate 토글
/codex:rescue <문제>                # 막혔을 때 Codex에게 위임
```

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
MCCP_CODEX_DISABLED=1                    # Codex 호출 영구 skip (codex-bridge: verdict='skipped', reason='codex_disabled'). /mccp:setup Phase 4가 자동 write.
MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="<reason>" # v0.2.4 audited escape. terminal /mccp:pr이 security-reviewer agent unavailable + 이 env var의 specific reason 설정 시 advisory mode 진입. receipt에 meta.security_force_override=true + reason 기록, PR body에 ## Security Reviewer Override section auto-inject (canonical audit source). 1-token reason(=1, =yes)은 schema warning 발동. 1회용 권장.
MCCP_FORCE_PR_WITHOUT_IMPECCABLE="<reason>"        # v0.2.6 audited escape (Codex R1 F4 strict). terminal /mccp:pr에서 impeccable Skill 미가용 + 이 env var의 specific reason 설정 시 force-override 진입. v0.2.4 security와 달리 reason validator가 SCHEMA REJECT — empty/whitespace/1-token banlist(yes/ok/true)/URL-only/<30자/<3단어/placeholder는 receipt write 시점에 차단. receipt에 meta.impeccable_force_override=true + reason 기록, PR body에 ## Impeccable Override section auto-inject (canonical audit source). 1회용 권장.

# Auto-chain (v0.2.2)
MCCP_AUTO_CHAIN_DISABLE=1                # kill switch ─ live
MCCP_AUTO_CHAIN_SKIP_PR=1                # commit-only chain (직접 push cycles 용) ─ live

# Auto-handoff
# MCCP_AUTO_HANDOFF=off|notify|spawn     # ⚠ S10b 미구현. 환경변수만 예약된 상태.
```

---

## 5. 모르거나 막힐 때

1. `.claude/notes/mccp-v0.2-continuation.md` — 진행 중 작업 큐
2. `docs/v0.2-architecture.md` — 전체 설계
3. README.md — 사용자 관점 요약
4. 사용자 auto-memory (user-level, 프로젝트 워크트리 밖) — 세션 시작 시 `MEMORY.md` 인덱스가 자동 주입됩니다. 직접 경로 참조 대신 인덱스에 노출된 항목명으로 조회하세요.

새 패턴/관행이 정해지면 memory에 저장하기 전에 이 CLAUDE.md에 반영할지 먼저 검토하세요. 프로젝트 단위 룰은 여기가 더 안정적입니다.
