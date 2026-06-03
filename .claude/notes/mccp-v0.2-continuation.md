# mccp v0.2 — Continuation Queue (다음 세션 진입점)

**Generated**: 2026-06-03 (S9 dogfood 종료 직후), updated 2026-06-04 (Q1 close-out)
**Last completed sprint**: Sprint 9 compressed dogfood — 7/7 scenarios pass against installed mccp@0.2.0. See [.claude/PRPs/reports/mccp-v0.2-s9-dogfood-results.md](../PRPs/reports/mccp-v0.2-s9-dogfood-results.md).
**Most recent work-queue close-out**: Q1 (F4 inject) — done 2026-06-04. See [.claude/PRPs/reports/q1-f4-fix-task-prompt-inject-report.md](../PRPs/reports/q1-f4-fix-task-prompt-inject-report.md). Codex stop-time review caught 2 follow-up defects (escape-overflow, CR-only newline bypass) both fixed with regression tests. Same CR fix also applied to `oneLineExcerpt`.

**Workspace 상태 (v0.2.1 묶음 commit 대기)**:

```
 M .gitignore                                              ← codex-input + dogfood-* ignore
 M docs/v0.2-architecture.md                               ← §3 cwd-vs-toplevel subsection 추가
 M plugins/mccp/scripts/state/fix-task.js                  ← Q1 F4 inject + oneLineExcerpt CR fix
 M plugins/mccp/scripts/state/tests/fix-task.test.js       ← +5 신규/회귀 테스트 (12→19)
 M .claude/settings.json                                   ← debug env (사용자 추가)
?? .claude/PRPs/plans/completed/mccp-v0.2-s9-dogfood-test.plan.md
?? .claude/PRPs/plans/completed/q1-f4-fix-task-prompt-inject.plan.md
?? .claude/PRPs/reports/mccp-v0.2-s9-dogfood-results.md
?? .claude/PRPs/reports/q1-f4-fix-task-prompt-inject-report.md
?? .claude/notes/mccp-v0.2-continuation.md                ← (this file)
```

**Note**: `plugins/mccp/scripts/hooks/ecc-context-monitor.js` 변경은 본 세션 시점 git status에서 사라짐 — 이전 세션 이후 disk 상태가 head와 동일해진 것으로 보임. Q5 commit 직전 git diff로 재확인 필요.

→ 배포 시점: `plugins/mccp/.claude-plugin/plugin.json` 0.2.0 → 0.2.1, 커밋, marketplace 또는 cache sync. **Q5 참조**.

---

## 1. Work Queue (우선순위 순)

### Q1 — F4: fix-task escalation prompt inject (S12의 일부) — ✅ DONE (2026-06-04)

**완료**: [report](../PRPs/reports/q1-f4-fix-task-prompt-inject-report.md). 19/19 + 13/13 tests green. 후속 2 결함(escape-overflow, CR bypass) 모두 회귀로 잠금. `oneLineExcerpt`도 같은 CR fix 적용.

**원래 범위 (참고)**: S9 finding F4 = **Option B (bounded inject)** 구현. Claude 권고 + 사용자 미결정 → "Claude/Codex가 판단" 위임받음.

**변경 파일** (~50 LOC + 테스트):

| 파일 | 변경 |
|---|---|
| `plugins/mccp/scripts/state/fix-task.js` | verdict가 `codex_critical` 또는 `escalate=true`일 때, `firstUserPrompt`의 첫 140자를 single-quote로 감싸 body에 inject. 줄바꿈은 공백으로 normalize. 잘림 시 `…` append. `transcript_path` null이거나 `firstPrompt`이 빈 문자열이면 리터럴 `<original-prompt>` 유지 (현재 동작). |
| `plugins/mccp/scripts/state/tests/fix-task.test.js` | 4-6 케이스 추가: (a) 정상 inject, (b) 140자 truncate + `…`, (c) null transcript → 리터럴 fallback, (d) empty prompt → 리터럴 fallback, (e) prefix가 `/mccp:santa-loop`인지, (f) 줄바꿈/따옴표 escape. |

**기결정사항** (재논의 불요):
- 길이 한도: 140자 + `…`
- 인용: single quote `'…'`
- 명령어 prefix: `/mccp:santa-loop` (plugin namespace 일관성)
- Fallback: 원본 prompt 못 얻으면 리터럴 `<original-prompt>` 유지

**Acceptance**:
- `node --test plugins/mccp/scripts/state/tests/fix-task.test.js` 전부 green
- 수동 검증: 새 dogfood에서 T-Codex-Bridge B 시나리오 재실행 → fix-task.md 본문에 리터럴 prompt가 인용부호로 들어가 있어야 함

**예상 작업량**: 반나절

### Q2 — S10a: STATE.md 연속성 layer

**출처**: v0.2 plan §2 — 사용자가 originally 요청한 "자동 세션 초기화".
**현재 상태**: 미시작. S9 plan §6 OOS.

**범위**:

| 파일 | 역할 |
|---|---|
| `plugins/mccp/scripts/state/state-writer.js` (신규) | 관련 이벤트(commit, fix-task 생성, receipt write 등)에서 STATE.md 갱신 |
| `plugins/mccp/scripts/state/state-injector.js` (신규) | SessionStart 시 STATE.md를 시스템 컨텍스트에 inject |
| `docs/v0.2-state-schema.md` (수정) | STATE.md 스키마 섹션 추가 (현재 doc은 fix-task / loop-counter만 다룸) |
| `plugins/mccp/hooks/hooks.json` (수정) | session-start-bootstrap.js 체인에 state-injector 추가 |

**선행 작업**: `/mccp:plan S10a — STATE.md continuity` 로 세부 plan 먼저.

**Acceptance**:
- 새 세션 시작 시 STATE.md가 자동 inject되어 직전 세션의 작업 컨텍스트 복원
- T-Session-Bootstrap 회귀 없음 (S9 Task 7)

**예상 작업량**: 3-5일

### Q3 — S10b: auto-handoff 실제 wiring

**현재 상태**: threshold 상수만 50/80/100으로 설정. **실제 handoff 동작 없음** — $100 도달해도 CRITICAL 로그만 남고 종료 안 됨.

**범위**:

| 파일 | 역할 |
|---|---|
| `plugins/mccp/scripts/hooks/breakpoint-detector.js` (신규) | safe handoff point 감지 (post-test, post-commit, post-receipt) |
| `plugins/mccp/scripts/hooks/session-spawner.js` (신규) | 다음 세션 spawn + carryover state 전달 |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` (수정) | cost-tier branching: $80 + safe breakpoint → soft handoff, $100 → hard ceiling forced handoff with `unsafe_checkpoint` flag |

**선행 작업**: S10a 완료 (handoff가 carryover할 STATE.md가 먼저 있어야 함).

**예상 작업량**: 3-5일

### Q4 — S11: `/mccp:work` 단일 entry orchestration

**범위**: `plan → implement → pr` 단일 entry. v0.2 plan §5.

**변경 파일**:

| 파일 | 역할 |
|---|---|
| `plugins/mccp/commands/work.md` (신규) | `/mccp:work <task>` 명령어 정의 — plan/implement/pr를 순차 호출 |
| `plugins/mccp/scripts/receipt/cli.js` (수정) | ORCHESTRATOR_COMMANDS receipt 그룹 추가 |

**선행 작업**: S10a + S10b (work shell이 continuity + handoff에 의존).

**예상 작업량**: 1-2주

### Q5 — v0.2.1 배포 ← **NEXT (Q1 done, Q5 ready)**

**Trigger**: Q1 완료. 새 세션에서 commit 작업으로 진입.

**Pre-commit 점검 (새 세션 시작 직후)**:

1. `git status` 로 `ecc-context-monitor.js` 가 실제로 변경되어 있는지 재확인. 본 세션 시점에는 status에서 사라졌으나, 디스크 내용은 0.2.0 cache와 다를 수 있음.
2. `plugins/mccp/.claude-plugin/plugin.json` 의 version 필드를 `0.2.0` → `0.2.1` 로 bump.

**절차**:

```powershell
# version bump
# plugins/mccp/.claude-plugin/plugin.json: "0.2.0" → "0.2.1"

# code 묶음 커밋 (v0.2.1)
git add .gitignore `
        docs/v0.2-architecture.md `
        plugins/mccp/scripts/hooks/ecc-context-monitor.js `
        plugins/mccp/scripts/state/fix-task.js `
        plugins/mccp/scripts/state/tests/fix-task.test.js `
        plugins/mccp/.claude-plugin/plugin.json
git commit -m "v0.2.1: F4 prompt inject + CR normalization (escalate + oneLineExcerpt) + cost thresholds 50/80/100 + costNotifyOnly mode + cwd-vs-toplevel doc"

# artifact 분리 커밋 (Q1 결과물 + S9 dogfood)
git add .claude/PRPs/plans/completed/ .claude/PRPs/reports/ .claude/notes/
git commit -m "S9 dogfood + Q1 close-out artifacts (plans/reports/notes)"

# user-level settings change (debug env) — 본 repo에 commit할지 사용자 결정 필요
# git add .claude/settings.json    # ← include only if intended for this repo

# cache sync (marketplace 재설치 OR 수동)
robocopy plugins/mccp C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.1 /MIR
```

**Codex 후속 검증 권장**: Q1 본 세션에서 Codex stop-time review가 결함 2개를 catch했음. 새 세션은 debug env가 적용된 상태이므로, commit 직후 `node --test plugins/mccp/scripts/state/tests/fix-task.test.js` 한 번 더 돌려 19/19 재현 확인.

---

## 2. Decision Log (S9 dogfood + 본 정리 세션)

| 결정 | 이유 | 기록 위치 |
|---|---|---|
| Cost warning ≠ stop signal | mccp-direction-decision §29 — 비용 자체 ≠ 문제 | feedback-cost-not-stop-signal memory |
| Threshold 5/10/50 → 50/80/100 | v0.2 plan §"Auto-handoff" alignment | `ecc-context-monitor.js:18-27` |
| `ECC_CONTEXT_MONITOR_COST_MODE=notify` 토글 | 명령형 tail 제거하여 notification-only 모드 분리 | `ecc-context-monitor.js:43-55` (사용자 추가) |
| F4 = Option B (inject + truncate) | escalation 경로는 rare-but-critical, friction 허용도 낮음 | 본 doc Q1 + dogfood report F4 |
| `/santa-loop` → `/mccp:santa-loop` | plugin namespace 일관성 | 본 doc Q1 |
| Per-monorepo-subpackage enforcement = v0.3 opt-in | toplevel-anchored design이 canonical | `docs/v0.2-architecture.md` §3 "Working-directory contract" |

---

## 3. Quick-start for Next Session

```
1. MEMORY.md 첫 항목 → 본 파일 자동 진입
2. 선택: Q1 (half day, decision 다 끝남) 또는 Q2 (3-5 days, plan 먼저)
3. /mccp:plan <Qn-feature-description>
4. /mccp:prp-implement <archived plan path>
```

**추천 시작점**: **Q1 (F4 inject)**. 작고, 결정사항 다 끝났고, upstream 의존 없음. Q1만 끝내고 Q5(0.2.1 배포)로 묶으면 깔끔한 patch release.

---

## 4. Out of Scope (다음 세션도 안 함)

- S12 dual-reviewer 추가 polish (F4 외 — 본 escalation body section은 이미 ship됨)
- v0.3 monorepo opt-in
- Codex skill 등록 / `codex:adversarial-review` 활성화 (사용자 환경 의존)
