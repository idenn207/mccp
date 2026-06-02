# mccp Bootstrap Plan

- **상태**: Reviewed (Codex R1 합치, implement 가능)
- **작성일**: 2026-06-02
- **저자**: skypark207
- **검토**: Codex adversarial review 1라운드 완료 — §13

## 0. 한 줄 요약

ECC 게이트 핵심을 **Apache-2.0 self-contained plugin `mccp`** 로 추출한다. private GitHub repo로 패키징해, 어떤 머신에서든 `~/.claude/` 완전 삭제 + Claude 재설치 후 `mccp` install만으로 게이트가 정상 동작해야 한다.

## 1. 요구사항 (R1–R8)

| ID | 요구사항 |
|---|---|
| R1 | `~/.claude/` 완전 삭제(cache 포함) + Claude 재설치 후 mccp install만으로 모든 게이트 동작 |
| R2 | 기존 ECC 게이트 동작 보존: Phase 7 7단계, Phase 2.5, PR/리뷰 게이트, Codex review, receipt |
| R3 | Rule 텍스트 배포 안 함 — enforcement는 hook / custom command / script만 |
| R4 | 단일 plugin 구조 (옵션 A) |
| R5 | namespace 전면 교체: `/ecc:*` → `/mccp:*` + receipt gate_id `mccp-*` prefix |
| R6 | Apache-2.0 license + NOTICE(ECC=MIT, impeccable=Apache-2.0 출처 표기) |
| R7 | Private GitHub repository |
| R8 | Bootstrap은 manual gate emulation으로 진행 (현재 `/ecc:plan` 발동 불가) |

## 2. Scope — S1 확정 (게이트 핵심만)

### 2.1 포함

| 카테고리 | 항목 |
|---|---|
| Commands | `plan`, `prp-implement`, `pr` (또는 `prp-pr`), `code-review` (또는 `review-pr`), `receipt-write`, `receipt-validate`, `receipt-status` |
| Hooks | `receipt-prompt.js` (UserPromptExpansion `^mccp:.*`), `receipt-skill.js` (PreToolUse Skill) |
| Scripts | `receipt/cli.js` 전체 + lib + README. require/path는 `${CLAUDE_PLUGIN_ROOT}` 기반으로 rewrite. |
| Agents | `code-reviewer`, `security-reviewer` — 본문 의존성 전수 검사 필수 (Codex Q6, HIGH) |

### 2.2 제외 (사용자가 별도 install)

- 47개 SKILL.md (`~/.claude/skills/ecc/*`)
- 60개 agents 중 위 2개 외 나머지
- 80개 scripts/lib/, scripts/hooks/ 중 receipt CLI 외 나머지
- rule 텍스트 (`~/.claude/rules/ecc/**`)
- impeccable (별도 plugin 또는 ECC origin marketplace에서)
- memory-persistence

## 3. 아키텍처

### 3.1 디렉토리 구조

```text
C:\_project\my\my-claude-code-plugin\
├── .plan\
│   └── mccp-bootstrap.plan.md
├── LICENSE                            ← Apache-2.0
├── NOTICE                             ← ECC + impeccable 출처
├── README.md                          ← 사용자 문서
├── docs\
│   ├── architecture.md
│   ├── gate-design.md                 ← §0 7단계 설계 노트 (rule 텍스트 대체, plugin 내부 문서로만)
│   └── migration-from-ecc.md
├── .claude-plugin\
│   └── marketplace.json
└── plugins\mccp\
    ├── .claude-plugin\plugin.json
    ├── commands\
    │   ├── plan.md
    │   ├── prp-implement.md
    │   ├── pr.md
    │   ├── code-review.md
    │   ├── receipt-write.md
    │   ├── receipt-validate.md
    │   └── receipt-status.md
    ├── hooks\
    │   └── hooks.json
    ├── scripts\
    │   ├── receipt\
    │   │   ├── cli.js
    │   │   ├── lib\...
    │   │   └── README.md
    │   └── hooks\
    │       ├── receipt-prompt.js
    │       └── receipt-skill.js
    └── agents\
        ├── code-reviewer.md
        └── security-reviewer.md
```

런타임 receipt 저장 위치 (Codex Q3 default): `<repo>/.claude/receipts/<mccp-gate_id>/<decision_id>.json` (working tree, gitignore).

### 3.2 marketplace.json (최소형)

```json
{
  "name": "mccp",
  "owner": { "name": "skypark207" },
  "plugins": [
    {
      "name": "mccp",
      "source": "./plugins/mccp",
      "description": "My Claude Code Plugin — ECC gate core, packaged as a self-contained Apache-2.0 plugin."
    }
  ]
}
```

### 3.3 plugin.json

```json
{
  "name": "mccp",
  "displayName": "My Claude Code Plugin",
  "description": "ECC-style gate enforcement (Phase 7 plan/Phase 2.5 implement/PR review), Codex adversarial review orchestration, and receipt-based mechanical enforcement.",
  "version": "0.1.0",
  "author": { "name": "skypark207" },
  "license": "Apache-2.0"
}
```

## 4. Rule → mechanical enforcement 변환 (R3 핵심)

### 4.1 현재 의존 (제거 대상)

- `~/.claude/commands/plan.md` line 206: *"implements the §0 Autonomy Contract from `~/.claude/rules/ecc/common/ecc-command-gates.md`"*
- `~/.claude/commands/prp-implement.md` line 101: 동일 패턴

### 4.2 변환 전략

`rules/` 디렉토리는 mccp install에 **불필요**. enforcement는 command 본문 inline + hook + script가 직접 수행.

| 기존 rule 항목 | mccp에서의 enforcement |
|---|---|
| §0 7단계 시퀀스 | command 본문 inline (이미 됨, Sprint 2 검증). hook이 step 5·6 검증. |
| auto-CRITICAL 카탈로그 | command 본문 inline + Codex 결과 parser script가 키워드 매칭 검사 |
| 금지 멘트 | (선택) PostToolUse hook으로 응답 검사. 우선순위 낮음. |
| §1.5 mechanical enforcement | receipt CLI + hook 이미 구현됨. namespace + require path rewrite 후 이전. |
| Bash hook 차단 대응 | hook의 exit code 처리 inline |
| Trivial Skip | command 본문 inline |
| Codex 미설치 우회 | `codex:setup` helper의 fallback 절차 |
| 사용자 명시 우회 | command 본문 keyword detection inline |

### 4.3 학습용 docs 보존

원본 §0 설계 노트는 `mccp/docs/gate-design.md`에 markdown으로 보존 — **사용자가 게이트 정신을 이해하기 위한 문서**, enforcement에는 의존하지 않음. R3와 충돌하지 않음 (enforcement는 코드만). Codex가 R3 변환 충분성에 합치하면서 본 문서를 필수화하라고 권고함.

## 5. Namespace migration

| 원본 | mccp |
|---|---|
| `/ecc:plan` | `/mccp:plan` |
| `/ecc:prp-implement` | `/mccp:prp-implement` |
| `/ecc:pr` 또는 `/ecc:prp-pr` | `/mccp:pr` (확정 필요, §11 Q2) |
| `/ecc:code-review` 또는 `/ecc:review-pr` | `/mccp:code-review` (확정 필요) |
| hook matcher `^ecc:.*` | `^mccp:.*` |
| receipt gate_id `plan-codex`, `implement-codex`, `pr-codex` | **`mccp-plan-codex`, `mccp-implement-codex`, `mccp-pr-codex`** (Codex C 권고 수용 — forward-compat + 멀티 머신 충돌 방지) |

### 5.1 부수 변경

- command 본문의 `/ecc:*` 인용 모두 `/mccp:*`로 갱신
- 가드 텍스트 *"invoked as /ecc:plan, /ecc:multi-plan, /ecc:plan-prd"* → *"invoked as /mccp:plan, /mccp:multi-plan, /mccp:plan-prd"* (multi-* 포함 여부는 §11 Q5)
- receipt CLI의 `--gate` 인자 default · validate 시 expected gate_id 모두 `mccp-*` prefix로 갱신
- README의 모든 `/ecc:*` 예시도 `/mccp:*`로

## 6. License & NOTICE

`LICENSE` = Apache License 2.0 (mccp 전체).

`NOTICE` 내용:

```text
mccp — My Claude Code Plugin
Copyright 2026 skypark207

This product includes software derived from:

- ECC (Extensible Claude Code) - MIT License
  Copyright (c) ECC contributors
  Original components ported into mccp:
  - commands/plan.md, prp-implement.md, pr.md, code-review.md (modified)
  - scripts/receipt/cli.js (modified)
  - hooks/receipt-prompt.js, receipt-skill.js (modified)
  - agents/code-reviewer.md, security-reviewer.md
  ECC origin: <URL — §11 Q1, HIGH>

- impeccable (https://impeccable.style/) - Apache License 2.0
  Copyright (c) impeccable contributors
  Note: impeccable itself is NOT bundled in mccp. mccp's design philosophy
  references impeccable's anti-SLOP discipline, and users may install
  impeccable as a separate plugin.
```

## 7. Bootstrap 검증 절차 (R1)

R1 만족 검증은 본 plan의 acceptance test다.

### 7.1 절차 (Codex D 권고 반영 보강)

1. 클린 환경 준비 (별도 Windows 사용자 계정, VM, 또는 동료 머신)
2. `Remove-Item ~/.claude -Recurse -Force` (cache 포함 완전 삭제)
3. Claude Code 재설치 (`winget install Anthropic.ClaudeCode` 또는 공식 설치 절차)
4. `claude` 첫 실행 + 인증
5. **`/codex:setup` 실행** — Codex CLI 인증 확인. 미인증 시 fallback 메시지 명확한지 검증 (Codex D-1)
6. **Private repo git auth 사전 확인** — PAT 또는 SSH key가 git config에 등록됐는지 (Codex D-2)
7. `/plugin marketplace add https://github.com/skypark207/my-claude-code-plugin`
8. `/plugin install mccp@mccp`
9. Claude 재시작
10. `/mccp:plan "테스트 plan"` 발화
11. 검증 체크리스트:
    - [ ] Phase 7 7단계 자동 발동
    - [ ] Codex `/codex:adversarial-review` 자동 호출 (또는 fallback 메시지)
    - [ ] plan 산출물에 `## Codex Adversarial Review` 섹션 자동 주입
    - [ ] receipt 파일 `.claude/receipts/mccp-plan-codex/*.json` 자동 생성
    - [ ] 다음 단계 안내 1줄 출력 (`Next: /mccp:prp-implement <plan>`)
12. `/mccp:prp-implement <plan>` 발화 → Phase 2.5 동작 검증 (UserPromptExpansion hook이 receipt 검증, 누락 시 차단)
13. **Air-gapped / Codex-disabled 시뮬레이션** — `CODEX_DISABLED=1` 환경변수 또는 네트워크 차단 후 `/mccp:plan` 재발화 → fallback 동작 검증 (Codex D-3)

### 7.2 통과 기준

위 11/12/13 모든 체크박스 통과. 한 항목이라도 실패하면 mccp는 R1 미충족 — plan 재작업.

## 8. Install / uninstall flow

### 설치

```bash
# 1. marketplace 추가
/plugin marketplace add https://github.com/skypark207/my-claude-code-plugin

# 2. plugin install
/plugin install mccp@mccp

# 3. (선택) Codex 인증
/codex:setup
```

### 제거

```bash
/plugin uninstall mccp@mccp
/plugin marketplace remove mccp
# 추가로 Claude는 자동으로 ~/.claude/plugins/cache/mccp/* 삭제
```

## 9. Implementation roadmap (Codex E 권고 — Sprint 2·3 통합)

### Sprint 1: scaffolding (1–2시간)

1. mccp git init, `.gitignore` 작성 (Node, OS, IDE)
2. `LICENSE` (Apache-2.0), `NOTICE`, `README.md` 작성
3. `marketplace.json`, `plugins/mccp/.claude-plugin/plugin.json` 작성
4. 디렉토리 골격 생성 (commands/, hooks/, scripts/, agents/, docs/)

### Sprint 2: 컴포넌트 이전 + namespace · rule reference 동시 갱신 (3–4시간, Codex E 반영)

5. `commands/` 이전 — plan, prp-implement, pr, code-review, receipt-*
6. `scripts/receipt/` 이전 — cli.js + lib + README. **각 모듈의 require/path를 `${CLAUDE_PLUGIN_ROOT}` 기반으로 rewrite** (Codex A 반영, RK7 mitigation)
7. `hooks/` 이전 — receipt-prompt.js, receipt-skill.js. matcher `^ecc:.*` → `^mccp:.*` 갱신.
8. `agents/code-reviewer.md`, `security-reviewer.md` 이전. **본문 의존성 전수 검사** — 다른 ECC 인프라 참조 시 inline 또는 mccp 내부 경로로 변경 (Codex Q6 HIGH).
9. `hooks/hooks.json` 작성 (settings.json의 hooks 블록을 plugin 형식으로 이전)
10. **동시 진행**: 전체 grep `\/ecc:` → `/mccp:` 치환 + rule 파일 reference 모두 제거 + receipt gate_id `plan-codex` → `mccp-plan-codex` 등 prefix 갱신
11. `docs/gate-design.md`에 §0 원본 텍스트 보존 (Codex B 반영, 학습용)

### Sprint 3: self-contained 검증 (1시간, Sprint 2 tail-end로 축소)

12. command 본문이 self-contained인지 검증 — §0 7단계 모든 필수 요소 inline 확인
13. 누락된 부분 inline 추가 (예: auto-CRITICAL 카탈로그가 본문에 없으면 추가)
14. 전체 grep으로 잔여 `/ecc:`, `~/.claude/rules/`, old gate_id 검색 → 0건 확인

### Sprint 4: 로컬 테스트 (1시간)

15. `claude --plugin-dir C:\_project\my\my-claude-code-plugin\plugins\mccp` 로컬 실행
16. `/mccp:plan "smoke test"` 발화 → 게이트 발동 확인
17. 발견된 이슈 수정 (예: hook path 해결, script require 경로)

### Sprint 5: 배포 + R1 검증 (1–2시간)

18. GitHub private repo 생성 (`skypark207/my-claude-code-plugin`)
19. push + 첫 release 태그 `v0.1.0`
20. R1 bootstrap test 절차 (§7.1) 실행 — 13단계 모두
21. 통과 시 기존 `~/.claude/skills/ecc/`, `~/.claude/settings.json`의 ecc 관련 hook 등 cleanup

### Sprint 6: 점진 확장 (선택, 후속 작업)

- multi-plan, multi-execute, multi-frontend 추가
- 다른 host machine에서 install 테스트
- public 전환 검토

## 10. Risks

| ID | Risk | 영향 | 완화책 |
|---|---|---|---|
| RK1 | command가 self-contained가 아니어서 rule 제거 후 게이트 미동작 | HIGH | Sprint 3 검증. 부분별 inline 보강. |
| RK2 | Codex 미인증 머신에서 install 후 fallback 절차 안 알려짐 | MEDIUM | command/hook의 fallback 메시지 명시. README install 절차에 `/codex:setup` 포함. §7.1 step 5에서 검증. |
| RK3 | hook matcher namespace 변경 후 기존 호출 흐름과 충돌 (`/ecc:*` 발화 시) | MEDIUM | 변경 후 `/ecc:*` 발화는 의도적으로 무반응. mccp만 `/mccp:*` enforce. |
| RK4 | ECC origin 정확한 URL 미상 → NOTICE 출처 불완전 | HIGH (Codex F 격상) | §11 Q1 해결. 미상이면 "Originally ECC (origin TBD)" 표기 후 후속 PR로 정확화. |
| RK5 | private repo에서 `/plugin marketplace add` 시 git auth 이슈 (PAT, SSH key) | MEDIUM | README install 절차에 git auth 안내. §7.1 step 6에서 검증. |
| RK6 | 47개 SKILL.md 사용 의존이 새 머신에서 깨짐 — mccp scope 밖 | MEDIUM | README에 ECC origin marketplace install 안내 (Q1 해결 후 정확한 명령). |
| RK7 | bootstrap test에서 발견 못 한 hidden 의존성 (e.g. `~/.claude/scripts/lib/resolve-ecc-root.js`) | HIGH | Sprint 2 step 6의 require path rewrite로 의도적 해결. Sprint 4 로컬 테스트에서 path 의존을 모두 plugin 내부로 변경. |
| RK8 (Codex 신규) | code-reviewer / security-reviewer agent가 ECC 다른 의존을 끌고 옴 | HIGH | Sprint 2 step 8에서 전수 검사 + 필요 시 inline rewrite. |
| RK9 (Codex 신규) | Air-gapped / Codex-disabled 머신에서 fallback 미작동 | MEDIUM | §7.1 step 13에서 명시적 검증. command 본문에 fallback 메시지 inline. |

## 11. Open Questions

| ID | 질문 | Severity (Codex 분류) |
|---|---|---|
| Q1 | ECC origin이 marketplace로 배포되는가? URL은? | **HIGH** (NOTICE 정확성) |
| Q2 | PR 게이트 명령은 `/mccp:pr`? `/mccp:prp-pr`? | MEDIUM |
| Q3 | receipt 저장 위치 — repo 내 `.receipts/` vs working tree `.claude/receipts/` | MEDIUM (default: working tree, gitignore) |
| Q4 | receipt CLI 호출 path 변환 — Windows 경로 호환성 | LOW (Sprint 2 step 6에서 자동 검증) |
| Q5 | multi-plan / multi-execute / multi-frontend도 S1 scope? | LOW (default 제외, Sprint 6) |
| Q6 | code-reviewer, security-reviewer agent의 부수 의존성 | **HIGH** (R1 만족, Sprint 2 step 8) |

## 12. Acceptance criteria

이 plan은 다음 모두 충족 시 "implement 가능" 상태:

- [x] Sprint 1–5 작업 항목 모두 명시
- [x] Codex adversarial review 1라운드 합치 (§13)
- [x] Risks RK1–RK9 모두 완화책 명시
- [ ] Open Questions Q1, Q6 사용자 확인 (HIGH 등급, implement 시작 전 권장)
- [ ] 사용자 최종 컨펌

## 13. Codex Adversarial Review

> Phase 7.2 등가 — manual emulation으로 진행.

- **호출**: `Agent(codex:codex-rescue, ...)` 1회 (2026-06-02, agentId `aac4caea2a92f3bf8`)
- **라운드 수**: 1 (단일 라운드로 합치 도달, divergent 없음)
- **합치 결론**: plan 골격은 타당. R1 자급자족과 namespace 일관성을 위해 본문 4개 절(§3.1, §5, §7.1, §9) 갱신 + risk 2개(RK8, RK9) 추가 필요. 모두 plan 의도 강화이고 사용자 의도 변경 없음.

### 수용한 제안 (5/5)

1. **(A) Receipt CLI require path rewrite** — Sprint 2 step 6에 명시적으로 추가. `${CLAUDE_PLUGIN_ROOT}` 기반으로 모든 require/path 재작성. RK7 완화책 강화.
2. **(B) docs/gate-design.md 필수화** — 이미 §3.1에 있음. §4.3에서 강조 추가 (rule 사라진 뒤 게이트 정신을 학습할 유일한 위치).
3. **(C) Receipt gate_id renamespace** — `plan-codex` → `mccp-plan-codex` 등 prefix 적용. 이유: forward-compat, 멀티 머신에서 ECC origin과 mccp 동시 사용 시 충돌 방지, 사용자 관점 일관성. §5 표·§7.1 receipt 경로·§9 step 10에 반영.
4. **(D) Bootstrap test 보강** — §7.1에 step 5(`/codex:setup` 선행), step 6(private repo git auth 확인), step 13(Codex-disabled fallback 검증) 추가. 기존 10단계 → 13단계로 확장.
5. **(E) Sprint 2·3 통합** — Sprint 2에서 namespace 갱신과 rule reference 제거 동시 처리(step 10). Sprint 3은 self-contained 검증 단계로 축소.

### 거부한 제안

- 없음. 모두 plan 의도와 정합.

### 거부 후 보존된 결정

- **단일 plugin 구조 (옵션 A)**: Codex H에서 합치. 빠른 시작 + 협력 dependency 관리 비용 회피.
- **R3 mechanical enforcement 충분성**: Codex B에서 합치. command inline + hook + script 조합으로 enforcement 가능.

### Open Questions severity (Codex 분류)

| ID | Severity | 처리 |
|---|---|---|
| Q1 (ECC origin URL) | **HIGH** | NOTICE 정확성. implement 시작 전 사용자 답 권장. 미상이면 "Originally ECC (origin TBD)" 임시 표기. |
| Q2 (`pr` vs `prp-pr`) | MEDIUM | Sprint 2 진행 중 결정 가능. |
| Q3 (receipt 저장 위치) | MEDIUM | default: working tree `.claude/receipts/` (gitignore). |
| Q4 (Windows path 호환) | LOW | Sprint 2 step 6에서 자동 검증. |
| Q5 (multi-* 포함) | LOW | S1 정신상 default 제외. Sprint 6에서 검토. |
| Q6 (agent 의존성) | **HIGH** | R1 만족. Sprint 2 step 8에서 전수 검사 필수. |

### Auto-CRITICAL 점검

본 plan에서 ECC autonomy contract §0의 Auto-CRITICAL 카탈로그(secret/credential 노출, 데이터 손실/비가역 migration, auth bypass, 외부 destination 변경, 암호화·서명 키 변경) **해당 항목 없음**. Claude 자동 진행 가능.

### 신규 발견 risk

- **RK8**: code-reviewer / security-reviewer agent의 부수 의존. (Codex Q6에서 파생)
- **RK9**: Air-gapped / Codex-disabled 머신 fallback. (Codex D-3에서 파생)

### Codex session 참조

- agentId: `aac4caea2a92f3bf8`
- subagent: `codex:codex-rescue`
- date: 2026-06-02
- 다음 follow-up: `SendMessage(to: 'aac4caea2a92f3bf8', ...)`로 가능
