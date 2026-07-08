# Plan: mccp v0.2 S9 — Stop-loop dogfood (compressed test)

**Source**: 사용자 발화 ("Sprint 9 dogfood, 단 1주가 아닌 2~3번만 테스트 예정. stop loop / codex 호출 / impeccable 호출 / 자동 세션 초기화 직접 테스트. 사전 미구현 발견 시 plan 무시하고 수정 먼저") + [v0.2 plan](mccp-v0.2.plan.md) §2 Phase Map (S9) + [S8 report](../PRPs/reports/mccp-v0.2-s8-report.md)
**Selected Phase**: **Sprint 9 (compressed)** — v0.2 plan §2의 1주 dogfood 대신 2~3 회 실 동작 검증. enforce mode receipt를 누적할 시간이 없으므로 S10a 진입 게이트 (≥5 enforce + ≥1 fail+fix-task cycle)는 본 cycle에서 **부분 달성**만 목표.
**Complexity**: **Small** (검증 위주, 신규 소스 무수정. 단 S10a `state-injector.js`가 미구현이라 "자동 세션 초기화"는 v0.1 `session-start-bootstrap.js` 범위로 한정 — 본 plan §6 Out of Scope 참조).
**Verification mode**: 본 plan은 작성 자체 검증이라 santa-loop 미진입. Phase 5 plan-codex gate만 자동 발화.

---

## 1. Summary

S8 보고에 따르면 Stop-loop 토대(quality runner + loop-counter + codex-bridge + fix-task + stop-review-loop hook + hooks.json wire)는 모두 ship, 259/259 tests pass, hooks.json Stop[0] = `mccp:stop:review-loop`로 prepend된 상태. 사용자는 **본 repo에 mccp가 plugin으로 설치된 상태**(`C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.0/`)에서 실제 hook이 발화하는지, 그리고 v0.2 plan §11 verification 가설들이 실 동작에서도 유효한지 확인하기를 원한다.

본 plan은 6개 실 동작 시나리오를 짜고 결과를 `.claude/PRPs/reports/mccp-v0.2-s9-dogfood-results.md`에 적재한다:

1. **T-Pre**: install integrity (workspace plugins/mccp/ vs installed cache 0.2.0/ 일치 + 모든 스크립트 require 가능)
2. **T-Stop-Observe**: `MCCP_STOP_LOOP=observe` + git diff empty → allow (no block, no fix-task)
3. **T-Stop-Enforce-Pass**: `MCCP_STOP_LOOP=enforce` + git diff dirty + quality 전부 `skipped` (이 repo는 lint/typecheck/test 스크립트 없음) → allow + counter reset
4. **T-Stop-Enforce-Fail**: sandbox 서브디렉토리에 `package.json {scripts:{test:"node -e \"process.exit(1)\""}}` 심어 cwd 변경 + enforce → block + fix-task.md 생성 + counter=1, 두 번째 호출에서 counter=2 → human-takeover meta + allow
5. **T-Codex-Bridge**: `MCCP_STOP_LOOP_CODEX=1` + `.claude/state/codex-stop-loop-input.txt`에 (a) converged / (b) critical-secret 두 fixture 주입 → bridge classifier 결과 확인. 실제 `codex:adversarial-review` skill은 현재 세션 미등록이라 file-based 계약만 검증
6. **T-Impeccable**: `Skill(mccp:impeccable)`로 더미 UI critique 한 줄 요청 → SKILL.md `## Setup` 단계가 발화하는지 (`reference/<command>.md` 로드 / `context.mjs` 시도 등)
7. **T-Session-Bootstrap**: `claude` 재시작 없이 verify 가능한 부분만 — `session-start-bootstrap.js` 단위 호출 + 현재 세션의 SessionStart artifact (예: `.claude/state/session-*` 파일) 점검. STATE.md 자동 inject는 S10a 미구현이라 OOS

S10a/S10b/S11/S12 deliverable는 미구현 상태이므로 그 범위 테스트는 **명시적으로 OOS** (§6 참조). 사용자가 추후 S10a 진입을 결정하면 별도 plan으로 분리한다.

---

## 2. Phase Map

| Step | Module | Why now |
|---|---|---|
| **A** | Pre-flight (T-Pre) | 잘못된 cache 버전이나 broken require가 있으면 이후 테스트 결과가 거짓이 됨 |
| **B** | Stop-loop 3종 (T-Stop-Observe / Enforce-Pass / Enforce-Fail) | S8의 핵심 가설 직접 검증 |
| **C** | Codex bridge file-based 계약 (T-Codex-Bridge) | v0.2 plan §10 Deviation (Skill 직호출 X, file-based)이 실 동작에서도 유효한지 |
| **D** | mccp:impeccable Skill 로드 (T-Impeccable) | 사용자 명시 — 번들 impeccable이 user-installed와 충돌 없이 발화하는지 |
| **E** | SessionStart 발화 (T-Session-Bootstrap) | v0.1 functionality 회귀 없음 확인. v0.2 STATE.md inject는 S10a라 OOS |
| **F** | Report 작성 + S10a 진입 게이트 평가 | dogfood 결과를 plan §2 Phase Map의 S10a entry checklist에 매핑 |

본 plan은 신규 모듈을 만들지 않는다. 모든 단계가 **검증 + 결과 기록** 위주다. T-Stop-Enforce-Fail의 sandbox 서브디렉토리만 임시 산출물을 생성하며 테스트 후 즉시 정리한다.

---

## 3. Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Stub-input 호출 | [mccp-v0.2.plan.md §6](mccp-v0.2.plan.md) | `node stop-review-loop.js < .claude/state/dogfood-fixtures/<name>.json` |
| Quality runner 호출 | [scripts/quality/cli.js](../../plugins/mccp/scripts/quality/cli.js) | `node plugins/mccp/scripts/quality/cli.js run all` |
| Codex bridge 검증 | [scripts/lib/codex-bridge.js](../../plugins/mccp/scripts/lib/codex-bridge.js) + [tests/codex-bridge.test.js](../../plugins/mccp/scripts/lib/tests/codex-bridge.test.js) | parseCodexResult(text) → `{verdict, rounds, openQuestions, escalate}` |
| Receipt validate | [scripts/receipt/cli.js](../../plugins/mccp/scripts/receipt/cli.js) | `node scripts/receipt/cli.js validate --command mccp:prp-implement` |
| Fixture style | [scripts/hooks/tests/stop-review-loop.test.js](../../plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js) | `{session_id, transcript_path, cwd}` 최소 JSON |
| 결과 보고 | [.claude/PRPs/reports/mccp-v0.2-s8-report.md](../PRPs/reports/mccp-v0.2-s8-report.md) | Summary / Assessment vs Reality 표 / Tasks / Validation / Files Changed |

---

## 4. Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/state/dogfood-fixtures/stop-input-observe-empty.json` | CREATE (임시) | T-Stop-Observe stdin |
| `.claude/state/dogfood-fixtures/stop-input-enforce-pass.json` | CREATE (임시) | T-Stop-Enforce-Pass stdin (cwd = repo root) |
| `.claude/state/dogfood-fixtures/stop-input-enforce-fail.json` | CREATE (임시) | T-Stop-Enforce-Fail stdin (cwd = sandbox 서브디렉토리) |
| `.claude/state/dogfood-fixtures/codex-converged.txt` | CREATE (임시) | T-Codex-Bridge fixture A |
| `.claude/state/dogfood-fixtures/codex-critical-secret.txt` | CREATE (임시) | T-Codex-Bridge fixture B |
| `.claude/state/dogfood-sandbox/package.json` | CREATE (임시) | T-Stop-Enforce-Fail 강제 fail용 `test: exit 1` |
| `.claude/state/dogfood-sandbox/index.js` | CREATE (임시) | sandbox에 dummy diff 생성용 (git tracked가 아니어도 무방 — 어차피 cwd 기준 git status 비교) |
| `.claude/PRPs/reports/mccp-v0.2-s9-dogfood-results.md` | CREATE (영구) | 결과 적재 — S10a 진입 평가 포함 |

테스트 후 `.claude/state/dogfood-fixtures/` + `.claude/state/dogfood-sandbox/`는 정리한다. 결과 보고서만 영구 보존.

> `.claude/state/loop-counter.json`은 이미 `.gitignore`에 포함됨 (S8 보고 #79). dogfood 결과 counter 잔재가 남아도 git 추적 X.

---

## 5. Tasks

### Task 1 (Phase A) — Pre-flight 정합성

- **Action**:
  1. workspace `plugins/mccp/scripts/hooks/stop-review-loop.js`와 installed cache `C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.0/scripts/hooks/stop-review-loop.js`의 sha256 비교
  2. `node -e "require('C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.0/scripts/hooks/stop-review-loop')"` — require 시 throw 없음 확인
  3. `node -e "require('C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.0/scripts/lib/codex-bridge'); require('.../scripts/quality/runner'); require('.../scripts/state/loop-counter');"` — 핵심 모듈 4종 require 정상
  4. `node --test plugins/mccp/scripts/{receipt,quality,state,lib,hooks}/tests/*.test.js` → 259/259 pass (S8 보고 재확인)
- **Mirror**: S8 보고 §Validation Results
- **Validate**: sha256 일치, require 0 throw, 259/259 green

### Task 2 (Phase B) — T-Stop-Observe (empty diff allow)

- **Action**:
  1. 현재 git status가 clean인지 확인 (`git status --porcelain` empty)
  2. fixture `stop-input-observe-empty.json`: `{"session_id":"dogfood-1","transcript_path":"./.claude/state/dummy.jsonl","cwd":"<repo-root>"}`
  3. `MCCP_STOP_LOOP=observe node ...0.2.0/scripts/hooks/stop-review-loop.js < fixture` 실행 (Windows: `$env:MCCP_STOP_LOOP="observe"; cat fixture | node ...`)
  4. 기대: stdout = raw input 그대로 echo, stderr에 `[mccp:stop-review-loop] ...` 로그, exit 0
- **Mirror**: stop-review-loop.js 헤더 §Decision tree "git diff empty → allow"
- **Validate**: exit 0, stdout matches stdin, no `{"decision":"block"}` JSON

### Task 3 (Phase B) — T-Stop-Enforce-Pass (no scripts → all skipped → allow)

- **Action**:
  1. 임시 파일 생성: `.claude/state/dogfood-sandbox/touchme.txt` 작성 → git status에 untracked 항목 발생
  2. fixture `stop-input-enforce-pass.json`: cwd = repo root
  3. `MCCP_STOP_LOOP=enforce node ...stop-review-loop.js < fixture`
  4. 기대: quality runner가 모든 stage `skipped` (이 repo는 package.json 없음) → allow + stdout raw passthrough. 이전 counter가 있으면 reset 확인 (loop-counter.json fingerprint 항목 삭제)
- **Mirror**: v0.2 plan §7 Risk #5 graceful skip
- **Validate**: exit 0, loop-counter.json에 해당 fingerprint 항목 0 또는 reset 상태

### Task 4 (Phase B) — T-Stop-Enforce-Fail (force fail → fix-task + counter bump + block, 2회차 human-takeover)

- **Action**:
  1. `.claude/state/dogfood-sandbox/package.json`: `{"name":"mccp-dogfood","scripts":{"test":"node -e \"process.exit(1)\""}}`
  2. `.claude/state/dogfood-sandbox/index.js`: empty file (untracked diff 보장)
  3. fixture `stop-input-enforce-fail.json`: `cwd` = sandbox dir 절대경로
  4. **1차 호출**: `MCCP_STOP_LOOP=enforce node ...stop-review-loop.js < fixture` → 기대: exit 0 (hook은 항상 0), stdout = `{"decision":"block","reason":"<one-line>"}`, `<sandbox>/.claude/state/fix-task.md` 생성, `<sandbox>/.claude/state/loop-counter.json` count=1
  5. **2차 호출**: 동일 fixture 재실행 → count=2 도달 → 기대: stdout = passthrough + stderr에 human-takeover 메시지
  6. **3차 호출**: 동일 fixture 재실행 → counter cap=2 유지 → 통과 (loop 방지 검증)
  7. fix-task.md 검사: frontmatter (task_fingerprint / count / created_at / originating_receipts: []) + body sections (Title / Why / Failures / Next Actions / Originating Decisions) — `docs/v0.2-state-schema.md` §2 매핑
- **Mirror**: S8 보고 §Tests Written `state/tests/fix-task.test.js` 12-path
- **Validate**: 1차 block, 2차+3차 allow + meta, fix-task.md 스키마 일치

### Task 5 (Phase C) — T-Codex-Bridge file-based 계약

- **Action**:
  1. fixture A `codex-converged.txt`: 텍스트 — `"adversarial review converged in 2 rounds. no open questions."` (codex-bridge `converged` 패턴 매치)
  2. fixture B `codex-critical-secret.txt`: 텍스트 — `"CRITICAL: API secret committed to .env"` (CRITICAL catalog `secret`)
  3. Task 3과 동일한 enforce-pass setup으로 `MCCP_STOP_LOOP_CODEX=1` 추가, `.claude/state/codex-stop-loop-input.txt` ← fixture A 복사 → 기대: bridge가 `converged` 인식 + allow
  4. fixture B로 교체 후 재실행 → 기대: `critical` 인식 + fix-task.md 본문에 "## Dual Reviewer Escalation Required" 섹션 (S8 보고 Task 18은 S12 — 본 단계에선 critical → block만 확인)
- **Mirror**: codex-bridge.js parseCodexResult + S8 보고 Files Changed §6.1
- **Validate**: A → allow + stderr "verdict=converged", B → block + fix-task.md 본문에 escalation 키워드 (S12 미구현이면 그냥 critical 사유만)

### Task 6 (Phase D) — T-Impeccable bundled Skill 발화

- **Action**:
  1. 사용자 직접 invocation: `Skill(mccp:impeccable, "audit a hypothetical empty <button> component for accessibility — one paragraph reply")` (또는 inline 본 세션에서 즉시 호출)
  2. 기대: skill 본문 `## Setup` 단계가 발화 — `node .claude/skills/impeccable/scripts/context.mjs` 호출 시도 (현재 repo에 PRODUCT.md 없으므로 `NO_PRODUCT_MD` 출력 → skill이 `reference/init.md`로 우회 또는 graceful note)
  3. user-installed (`.claude/skills/impeccable/`)와 bundled (`plugins/mccp/skills/impeccable/`)이 동시 존재 시 prefix `mccp:`로 disambiguate 가능한지 확인
- **Mirror**: 직접 SKILL.md 본문 (impeccable v3.5.0)
- **Validate**: skill 응답이 SKILL.md `## Setup` 규약을 따름 (단계 1-5 중 최소 1개 명시 언급). 단순 "ok" 응답이면 skill 미발화로 판정

### Task 7 (Phase E) — T-Session-Bootstrap (v0.1 범위)

- **Action**:
  1. `node ...0.2.0/scripts/hooks/session-start-bootstrap.js < <(echo '{"session_id":"dogfood-7"}')` (또는 PowerShell 등가)
  2. 기대: exit 0, 인식 가능한 stderr/stdout (v0.1 패턴)
  3. 현재 세션의 `.claude/state/` 디렉토리 inspect — session 관련 artifact 존재 여부 확인 (`session-*.json` 등)
  4. **note**: STATE.md SessionStart inject는 S10a 미구현 → 이 단계에서는 v0.1 bootstrap이 회귀 없이 동작하는지만 확인. 사용자 "자동 세션 초기화" 요구사항이 STATE.md 의미였다면 S10a 별도 cycle 필요
- **Mirror**: v0.2 plan §3 [session-start-bootstrap.js](../../plugins/mccp/scripts/hooks/session-start-bootstrap.js)
- **Validate**: exit 0, throw 없음

### Task 8 (Phase F) — Report 작성 + 정리

- **Action**:
  1. 결과 적재: `.claude/PRPs/reports/mccp-v0.2-s9-dogfood-results.md` — 각 T-* 결과 + S10a entry 체크리스트 (≥5 enforce receipts vs 실측, ≥1 fail+fix cycle vs 실측) + S10a 진입 권고 (compressed 모드에서는 "조건부 통과" 또는 "추가 dogfood 필요")
  2. 임시 산출물 정리: `.claude/state/dogfood-fixtures/`, `.claude/state/dogfood-sandbox/` 삭제. `loop-counter.json`의 dogfood fingerprint 항목 reset. `codex-stop-loop-input.txt` 삭제
  3. fix-task.md / fix-task-applied.md sweep — dogfood 흔적 제거
- **Validate**: 결과 보고서 작성 완료, 임시 dir 0 잔재

---

## 6. Out of Scope (의도적 제외)

본 plan은 S9 compressed dogfood만 수행한다. 다음 항목은 **명시적 제외**:

- **STATE.md auto-inject (S10a)**: `scripts/state/state-writer.js`, `state-injector.js`, `docs/v0.2-state-schema.md` STATE.md 섹션 — 미구현. "자동 세션 초기화"가 이 의미였다면 별도 plan
- **Auto-handoff (S10b)**: `breakpoint-detector.js`, `session-spawner.js`, `ecc-context-monitor.js` cost 임계값 50/80/100 상향 — 미구현
- **`/mccp:work` 단일 entry (S11)**: `commands/work.md`, ORCHESTRATOR_COMMANDS receipt 그룹 — 미구현
- **Dual-reviewer escalation 통합 (S12)**: `codex-bridge.js`의 `escalate` 플래그 fix-task.md 본문 주입 — 미구현
- **1주 dogfood**: 사용자가 명시적으로 2~3회 테스트만 요청. S10a 진입 게이트 (≥5 enforce + ≥1 fail+fix cycle)는 본 cycle에서 **부분 달성** (≥1 enforce + 1 fail+fix cycle 정도)

S10a 이상으로 진입하기 전 사용자가 추가 dogfood를 더 누적할지, 본 plan 결과만으로 S10a를 시작할지 결정한다.

---

## 7. Validation (S10a 진입 평가 기준)

```bash
# Pre-flight
node --test plugins/mccp/scripts/{receipt,quality,state,lib,hooks}/tests/*.test.js
# Expected: 259/259 ok

# Stop-loop stub-input 3종 (PowerShell)
$env:MCCP_STOP_LOOP="observe"; Get-Content .claude\state\dogfood-fixtures\stop-input-observe-empty.json | node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.2.0/scripts/hooks/stop-review-loop.js
$env:MCCP_STOP_LOOP="enforce"; Get-Content .claude\state\dogfood-fixtures\stop-input-enforce-pass.json | node ...stop-review-loop.js
$env:MCCP_STOP_LOOP="enforce"; Get-Content .claude\state\dogfood-fixtures\stop-input-enforce-fail.json | node ...stop-review-loop.js  # 2-3회 반복

# Codex bridge file-based
Copy-Item .claude\state\dogfood-fixtures\codex-converged.txt .claude\state\codex-stop-loop-input.txt
$env:MCCP_STOP_LOOP_CODEX="1"; Get-Content .claude\state\dogfood-fixtures\stop-input-enforce-pass.json | node ...stop-review-loop.js

# impeccable Skill — 별도 호출 (Skill tool)
Skill(mccp:impeccable, "audit empty <button> a11y — 1 paragraph")

# Session bootstrap (회귀 확인만)
'{"session_id":"dogfood-7"}' | node ...session-start-bootstrap.js
```

**S10a 진입 평가 (사용자 결정 input)**:

| 게이트 | v0.2 plan §2 요구 | 본 cycle 실측 | 평가 |
|---|---|---|---|
| Enforce mode receipts 누적 | ≥ 5 | ≤ 3 (compressed) | **부분** |
| fail+fix cycle 완료 | ≥ 1 | 1 (Task 4) | **달성** |
| Counter max 도달률 | < 10% | (측정) | (보고서) |
| auto-fallback 비율 | < 30% | (측정) | (보고서) |
| Quality-pass-but-bad-diff | < 10% | N/A (canary 미운영) | **측정 불가** |

→ 본 cycle 결과만으로 S10a 진입은 **권고 안 함**. enforce mode canary worktree 운영 또는 추가 dogfood 누적 필요. 사용자가 "측정 불가" 라인을 risk로 수용하면 S10a 진입은 사용자 결정.

---

## 8. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | sandbox cwd 변경 시 loop-counter.json이 sandbox 내부에 생성되어 본 repo의 `.claude/state/loop-counter.json` 잔재 정합성 깨짐 | LOW | Task 8 정리 단계에서 양쪽 모두 sweep |
| R2 | impeccable Skill이 user-installed와 bundled 둘 다 인식 시 두 buf 중복 발화로 토큰 폭증 | MEDIUM | `Skill(mccp:impeccable, ...)`로 prefix 명시 — disambiguation 가능. 응답 길이 1 paragraph 한정 |
| R3 | T-Stop-Enforce-Fail 1차 block 후 fix-task.md가 sandbox `.claude/state/`에 생성되어 cleanup 누락 시 다음 세션에서 injector(미구현)가 잘못된 fix-task를 inject할 가능성 | LOW | S10a injector 미구현이라 현 시점 무영향. 다만 Task 8 sweep 강제 |
| R4 | codex-bridge fixture B (critical-secret)가 fix-task.md 본문에 "secret" 키워드를 그대로 남겨 git diff에 잔재 | LOW | Task 8 sweep에서 fix-task.md 삭제. 또한 fixture B 텍스트는 placeholder 키워드만 사용 (실제 secret 아님) |
| R5 | session-start-bootstrap.js를 fixture stdin으로 직접 호출 시 `transcript_path` 없는 입력 거부할 가능성 | LOW | 호출 전 fixture에 `transcript_path: null` 또는 v0.1 hook이 받는 최소 필드만 포함. 실패 시 hook 본문 first 30 lines read해 입력 스펙 확인 후 보정 |
| R6 | "자동 세션 초기화"가 사용자 의도로는 STATE.md inject(S10a)였을 수 있음 — 본 plan은 v0.1 범위로 한정 | MEDIUM | §6 OOS에 명시. 결과 보고서에 STATE.md 미구현 명시. 사용자가 의도 다르면 S10a 별도 plan으로 분리 |

---

## 9. Acceptance Criteria

- [ ] Task 1 통과 (sha256 일치 + require 0 throw + 259/259 tests pass)
- [ ] Task 2 (T-Stop-Observe) 통과 (empty diff → allow)
- [ ] Task 3 (T-Stop-Enforce-Pass) 통과 (graceful skipped → allow + counter reset)
- [ ] Task 4 (T-Stop-Enforce-Fail) 통과 — 1차 block + fix-task + counter=1, 2차 human-takeover + allow, 3차 cap 유지
- [ ] Task 5 (T-Codex-Bridge) 통과 — fixture A converged → allow, fixture B critical → block + fix-task
- [ ] Task 6 (T-Impeccable) 통과 — SKILL.md `## Setup` 규약 발화 확인
- [ ] Task 7 (T-Session-Bootstrap) 회귀 없음 확인 (exit 0, throw X). STATE.md inject는 OOS 명시
- [ ] Task 8 결과 보고서 작성 + 임시 산출물 정리 완료
- [ ] S10a 진입 평가 결과를 사용자 결정 input으로 제공 (조건부 진입 또는 추가 dogfood 권고)

---

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): `codex:adversarial-review` skill not registered in this session. Available codex-namespaced skills are limited to `codex:rescue`, `codex:setup`, `codex:gpt-5-4-prompting`, `codex:codex-cli-runtime`, `codex:codex-result-handling` (per session skill list). Parent v0.2 plan §12 used `Agent(codex:codex-rescue)` agent route for the same purpose; inline auto-invocation of the rescue agent from the plan gate is OOS per the gate-design Skill contract. The user can manually invoke `/codex:setup` and then re-run `/mccp:plan` if Codex review is required before implement.

## Codex Implementation Review

> Codex unavailable, skipped (auto-fallback): `codex:adversarial-review` skill remains unregistered at implement time (same session as plan gate). No new implement-time architectural decisions were introduced beyond §4/§5 — all file actions, fixture shapes, and validation steps are pre-committed in the plan. Cross-gate dedupe applies (Phase 2.5.1): the implement-time decision set is identical to the plan-time decision set, and the plan gate auto-fallback reason is unchanged. Proceeding to receipt write.

- Round: 1 (auto-fallback)
- 합치 결론: N/A (Codex unreachable; decisions inherited from plan §4/§5)
- 수용: all plan §4/§5 actions
- 거부: none
- Open Questions: none new at implement-time (§6 OOS list pre-flags STATE.md auto-inject as unrelated S10a scope)
- Session ref: same session as plan author; no cross-session Codex transcript
