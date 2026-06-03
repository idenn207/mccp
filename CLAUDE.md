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

| 원본             | 라이선스    | 가져온 부분                          | 위치                   |
| ---------------- | ----------- | ------------------------------------ | ---------------------- |
| **ECC**          | MIT         | Phase 게이트 enforcement, hook 구조  | `plugins/mccp/`        |
| **impeccable**   | Apache-2.0  | 일부 frontend/UI 관련 skill          | `plugins/mccp/skills/` |
| **codex plugin** | (별도 설치) | adversarial review용 외부 model 호출 | 런타임 의존성          |

mccp는 두 plugin을 단순 의존하는 게 아니라 **fork 후 self-contained 패키지로 재구성**했습니다. `~/.claude/rules/`, `~/.claude/hooks/` 같은 ECC 원본의 user-level scatter 의존성은 모두 plugin 내부로 흡수됨. 자세한 attribution은 [NOTICE](NOTICE) 참조.

### 1.2 핵심 가치: Multi-Model Dual Reviewer

mccp의 차별점은 **Claude(Opus) ↔ Codex(GPT-5.4 계열) cross-model adversarial review**입니다.

- Claude가 plan/implement/PR을 작성 → Codex가 review → 두 모델 모두 APPROVE해야 게이트 통과.
- 같은 모델이 작성하고 review하는 single-model blind spot을 방지 (skill `mccp:ai-regression-testing` 패턴 참고).
- `codex` plugin이 **필수 의존성**입니다. 미설치 시 `/mccp:plan`, `/mccp:prp-implement`, `/mccp:pr` 모두 게이트 미통과로 실패합니다. 사용자에게 `/codex:setup` 안내하세요.

### 1.3 자동화 파이프라인

PRD부터 PR까지 전 라이프사이클을 단일 namespace(`/mccp:*`)로 자동화합니다:

```
/mccp:plan-prd      → 문제 정의 PRD
        ↓
/mccp:plan          → 구현 plan + Codex adversarial review (R1/R2 수렴)
        ↓
/mccp:prp-implement → plan 실행 + Implement-Codex review + cross-gate dedupe
        ↓
/mccp:code-review   → 변경 코드 multi-perspective review
        ↓
/mccp:prp-commit    → 자연어 파일 타겟팅 커밋
        ↓
/mccp:prp-pr        → 디자인/보안/Codex review 통합 후 GitHub PR 생성
```

각 단계는 **receipt** (`.mccp/receipts/*.json`)를 발행하고, 다음 단계는 이전 receipt chain을 검증한 뒤에만 시작합니다 (mechanical enforcement, README.md 참조).

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
│   ├── state/                      ← STATE.md (세션 간 연속성)
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

- `session-start.js` hook이 부팅 시 주입.
- `pre-compact.js` hook이 compaction 직전 갱신.
- 직접 편집하지 말고 `state-writer.js` API를 사용하세요.

### 3.3 Codex 의존 작업의 실패 모드

Codex review가 invalid JSON, timeout, gateway error를 반환할 수 있습니다. 옵션:

1. `/codex:review --wait` 수동 재실행
2. `/mccp:receipt-write` 로 게이트 receipt 수동 작성 후 bypass (이유 명시 필수)
3. 일시적 Codex 장애면 nudge 후 잠시 대기

자세한 fallback 매트릭스는 [docs/gate-design.md](docs/gate-design.md) 참조.

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

# Codex
/codex:setup                        # CLI 인증 & gate 토글
/codex:rescue <문제>                # 막혔을 때 Codex에게 위임
```

---

## 5. 모르거나 막힐 때

1. `.claude/notes/mccp-v0.2-continuation.md` — 진행 중 작업 큐
2. `docs/v0.2-architecture.md` — 전체 설계
3. README.md — 사용자 관점 요약
4. 사용자 auto-memory (user-level, 프로젝트 워크트리 밖) — 세션 시작 시 `MEMORY.md` 인덱스가 자동 주입됩니다. 직접 경로 참조 대신 인덱스에 노출된 항목명으로 조회하세요.

새 패턴/관행이 정해지면 memory에 저장하기 전에 이 CLAUDE.md에 반영할지 먼저 검토하세요. 프로젝트 단위 룰은 여기가 더 안정적입니다.
