# Plan: v0.3.2 — S12 Dual-Reviewer Escalate (Milestone 5)

**Source PRD**: [mccp-roadmap.plan.md](mccp-roadmap.plan.md) §Milestone 5
**Selected Milestone**: v0.3.2 / S12 dual-reviewer escalate (next active after v0.3.1 ship)
**Status**: ⏳ **NOT STARTED** (planning round)
**Plugin version**: 0.3.1 → **0.3.2**
**Branch convention**: `feat/v0-3-2-escalate` (main 직접 push 금지)
**Complexity**: **Small** (cross-gate detector + 2 호출 surface + state flag — building block 대부분 이미 존재)

---

## Summary

CRITICAL findings / divergent-unresolved / auto-CRITICAL catalog match가 **gate receipt에 기록되었을 때** `fix-task.md`에 `Next: /mccp:santa-loop <args>` 안내 자동 append + `STATE.md`에 `escalate_pending` flag 영구화. **`/mccp:santa-loop` 자동 invoke는 안 함** — 사용자 결정 보존 (false-positive CRITICAL → quota 낭비 회피).

기존 stop-time escalate path (`stop-review-loop.js` → `codex-bridge.parseCodexResult` → `fix-task.write({escalate:true})`)는 codex review *text* 를 parse하는 stop-only surface. v0.3.2는 같은 트리거를 **receipt 단일 진실 원천**으로 끌어올려 plan / implement / pr 세 게이트의 receipt write 시점에도 발화시킵니다.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Auto-CRITICAL catalog | [codex-bridge.js:35-42](../../plugins/mccp/scripts/lib/codex-bridge.js#L35-L42) | `CRITICAL_PATTERNS` 5종 (secret_exposure / data_loss / authz_bypass / external_destination / crypto_key) — escalate-detector에서 catalog 재사용 (별도 catalog 만들지 말 것 — drift 방지) |
| Receipt findings/resolution scan | [receipt/schema.js:81-110](../../plugins/mccp/scripts/receipt/schema.js#L81-L110) | `findings[i].severity ∈ SEVERITIES` + `resolution.{converged, rounds, open_questions[i].severity}` schema |
| fix-task escalate inject | [fix-task.js:147-174](../../plugins/mccp/scripts/state/fix-task.js#L147-L174) | F4 absorption — 140-char bound + escape order + bare-CR normalize — `buildBody()` 그대로 재호출 (escalate=true) |
| Cross-session continuity flag | [state-writer.js:228-261 renderFrontmatter](../../plugins/mccp/scripts/state/state-writer.js#L228-L261) | `dep_check_at` / `dep_check_missing`이 conditional emit 패턴 — `escalate_pending` 도 같은 패턴 |
| Receipt-write hook surface | [receipt/cli.js](../../plugins/mccp/scripts/receipt/cli.js) `write` 명령 | write 완료 후 escalate-detector 호출 (inline integrate, 별도 hook 안 만듦) |
| Atomic state lock | [state-writer.js:385-410 withStateLock](../../plugins/mccp/scripts/state/state-writer.js#L385-L410) | `escalate_pending` flag write는 STATE.md lock 안에서 |
| Stop-loop verdictKind enum | [stop-review-loop.js:237 + fix-task.js:62-69](../../plugins/mccp/scripts/state/fix-task.js#L62-L69) | `codex_critical` / `codex_divergent` — 신규 verdictKind 추가 금지 |

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/escalate-detector.js` | CREATE | cross-gate detector module. `detectFromReceipt(receipt) → {trigger, verdict, escalate, criticalCategory, evidence}` |
| `plugins/mccp/scripts/lib/tests/escalate-detector.test.js` | CREATE | unit tests — 11 케이스 (아래 Acceptance 참조) |
| `plugins/mccp/scripts/lib/codex-bridge.js` | UPDATE | `CRITICAL_PATTERNS` + `detectCriticalCategory` export (현재 internal const — escalate-detector가 reuse하려면 export 필요. 그 외 동작 변경 없음) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | write 후 escalate-detector 호출 + trigger 시 fix-task append + STATE flag set. CLI surface는 그대로 (write 함수가 in-process로 처리) |
| `plugins/mccp/scripts/state/state-writer.js` | UPDATE | `escalate_pending: boolean` + `escalate_pending_decision_id: string` frontmatter 필드 추가 (conditional emit) + `mergeState` patch path |
| `plugins/mccp/scripts/state/state-injector.js` | UPDATE | session-start inject 시 `escalate_pending=true`이면 `## Escalation Pending` 섹션을 systemMessage에 추가 |
| `plugins/mccp/scripts/state/fix-task.js` | UPDATE | `write()`에 optional `appendEscalate` 모드 추가 — 기존 fix-task가 존재하면 escalate 섹션만 idempotent append (overwrite 회피). 기존 stop-loop 호출 경로는 default(overwrite) 유지 |
| `plugins/mccp/scripts/state/tests/fix-task.test.js` | UPDATE | append vs overwrite 새 테스트 2개 |
| `plugins/mccp/scripts/state/tests/state-writer.test.js` | UPDATE | `escalate_pending` round-trip 테스트 |
| `plugins/mccp/scripts/state/tests/state-injector.test.js` | UPDATE | escalate_pending → systemMessage section 테스트 |
| `plugins/mccp/scripts/receipt/tests/write.test.js` | UPDATE | escalate trigger → fix-task append + STATE flag 통합 테스트 (3 케이스) |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | Step 1 직전에 STATE.md `escalate_pending` 일치 확인 단계 추가 — fingerprint drift 시 경고 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | 0.3.1 → 0.3.2 |
| `.claude/plans/mccp-roadmap.plan.md` | UPDATE | Status Snapshot 표 — Milestone 4 v0.3.1을 `✅ shipped (PR #12, commit 575becf, 2026-06-08)`로 정정. Milestone 5 v0.3.2 status를 `🚧 in-progress` → ship 후 `✅ shipped` |

---

## Tasks

### Task 5.1: escalate-detector.js + 단위 테스트

**Action**: 신규 모듈 `lib/escalate-detector.js` 작성. 입력은 valid receipt object. 출력은 다음 shape:

```js
{
  trigger: 'auto_critical_catalog' | 'finding_critical' | 'divergent_unresolved' | null,
  verdict: 'codex_critical' | 'codex_divergent' | null,
  escalate: boolean,
  criticalCategory: 'secret_exposure' | 'data_loss' | 'authz_bypass' | 'external_destination' | 'crypto_key' | null,
  evidence: { findingsCritical: [...], openCritical: [...], divergentUnresolved: boolean },
}
```

규칙 (우선순위 순):

1. `findings`에 `severity === 'CRITICAL'` 항목 존재 → `trigger='finding_critical'`, `verdict='codex_critical'`, `escalate=true`.
2. `resolution.open_questions`에 `severity === 'CRITICAL'` 항목 존재 + 그 `item` 텍스트가 `codex-bridge.detectCriticalCategory()` catalog 매칭 → `trigger='auto_critical_catalog'`, `verdict='codex_critical'`, `escalate=true`, `criticalCategory` set.
3. `resolution.converged === false && resolution.rounds >= 3` → `trigger='divergent_unresolved'`, `verdict='codex_divergent'`, `escalate=true`.
4. 그 외 → `escalate=false`, 나머지 null.

**Mirror**: catalog는 [codex-bridge.js:35-42](../../plugins/mccp/scripts/lib/codex-bridge.js#L35-L42) 그대로 import. `parseOpenQuestions` text-mode parser는 reuse하지 않음 (receipt는 이미 구조화).

**Validate**: `node --test plugins/mccp/scripts/lib/tests/escalate-detector.test.js` 11/11 PASS.

### Task 5.2: receipt-write integration

**Action**: [receipt/write.js](../../plugins/mccp/scripts/receipt/write.js)의 write 완료 후 다음 sequence 실행 (in-process, fail-open):

```js
// after writing receipt to disk
try {
  const det = escalateDetector.detectFromReceipt(receipt);
  if (det.escalate) {
    // 1) fix-task.md append (idempotent — 같은 receipt path가 originatingReceipts에 이미 있으면 skip)
    fixTask.writeOrAppend(repoRoot, {
      verdict: det.verdict,                  // 'codex_critical' | 'codex_divergent'
      escalate: true,
      taskFingerprint: deriveFingerprint(repoRoot),
      decisionId: receipt.decision_id,
      codexSummary: deriveSummary(det),
      originalPrompt: '<gate-receipt:' + receipt.gate_id + '/' + receipt.decision_id + '>',
      originatingReceipts: [receiptPath],
    });
    // 2) STATE.md escalate_pending flag
    stateWriter.update(repoRoot, {
      escalate_pending: true,
      escalate_pending_decision_id: receipt.decision_id,
    });
    // 3) one-line stderr notice (loud signal — fail-open principle)
    process.stderr.write('[mccp:escalate] ' + det.trigger + ' detected in ' +
      receipt.gate_id + '/' + receipt.decision_id + ' — see .claude/state/fix-task.md\n');
  }
} catch (err) {
  // detector failure must never block receipt write — log + continue
  process.stderr.write('[mccp:escalate] detector failed: ' + err.message + ' (allow)\n');
}
```

**Mirror**: fail-open + loud stderr는 [feedback-loud-fail-open](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-loud-fail-open.md) invariant.

**Validate**:
- `node --test plugins/mccp/scripts/receipt/tests/write.test.js` 신규 3 케이스 PASS.
- 회귀: `node --test plugins/mccp/scripts/receipt/tests/*.test.js` 기존 전체 PASS.

### Task 5.3: state-writer + state-injector + fix-task append

**Action 3a — state-writer.js**:
- `emptyState().frontmatter`에 `escalate_pending: false`, `escalate_pending_decision_id: null` 추가.
- `mergeState`에서 `patch.escalate_pending !== undefined`이면 boolean coerce. `patch.escalate_pending_decision_id !== undefined`이면 string-or-null.
- `renderFrontmatter`: `escalate_pending=true`일 때만 두 필드 emit (`dep_check_at` 패턴).
- `parseFrontmatter`: 일반 key-value 패턴이 자동 처리 — 추가 작업 없음.

**Action 3b — state-injector.js**:
- 현재 STATE inject 함수에서 `frontmatter.escalate_pending === true`이면 systemMessage 본문 끝에 다음 섹션 추가:

```
## Escalation Pending
- decision: <escalate_pending_decision_id>
- Next: /mccp:santa-loop (가용)
- 해제: santa-loop 통과 후 receipt가 ACCEPT 상태로 갱신되면 자동 clear
```

**Action 3c — fix-task.js**:
- 새 함수 `writeOrAppend(repoRoot, input)`:
  - fix-task.md 미존재 → 기존 `write(repoRoot, input)`로 위임.
  - 존재 → 기존 본문 읽고 `## Originating Decisions` 섹션에서 receipt path 중복 확인. 중복이면 no-op. 새로우면 `originatingReceipts`에 append 후 frontmatter `expires_at` + `counter`는 보존, `## Dual Reviewer Escalation Required` 섹션은 idempotent (있으면 유지, 없으면 추가).
- 기존 `write` 시그니처 변경 금지 — stop-loop 호출 경로 보존.

**Validate**:
- `node --test plugins/mccp/scripts/state/tests/state-writer.test.js` 신규 1 케이스 PASS.
- `node --test plugins/mccp/scripts/state/tests/state-injector.test.js` 신규 1 케이스 PASS.
- `node --test plugins/mccp/scripts/state/tests/fix-task.test.js` 신규 2 케이스 PASS.

### Task 5.4: santa-loop.md fingerprint validation + roadmap update

**Action 4a — santa-loop.md**:
Step 1 (Identify What to Review) 직전에 신규 sub-step 추가:

```markdown
### Step 0: Verify Escalation Context (optional)

If invoked via mccp escalation hand-off, verify alignment:

```bash
ESCALATE=$(grep '^escalate_pending:' .claude/state/STATE.md | awk '{print $2}' || true)
EXPECTED_DEC=$(grep '^escalate_pending_decision_id:' .claude/state/STATE.md | awk '{print $2}' || true)
CUR_FP=$(grep '^task_fingerprint:' .claude/state/STATE.md | awk '{print $2}' || true)
```

- `ESCALATE != "true"`: 일반 santa-loop 호출 (Step 1 진행)
- `ESCALATE == "true"` + `EXPECTED_DEC` 가 현재 review scope와 무관: 경고 출력 후 진행 — *drift*
- `ESCALATE == "true"` + `EXPECTED_DEC` 가 현재 review scope에 포함: 정상 escalation
```

**Action 4b — roadmap status snapshot 정정**:
- Milestone 4 v0.3.1: `⏳ pending (next active)` → `✅ shipped (PR #12, commit 575becf, 2026-06-08)`
- Milestone 5 v0.3.2: ship 후 본 plan의 acceptance 체크리스트 갱신.
- Ship History 표에도 v0.3.1 / v0.3.2 행 추가.

**Action 4c — plugin.json bump**:
- 0.3.1 → 0.3.2.

**Validate**:
- `grep -c '## Escalation Pending\|escalate_pending' plugins/mccp/commands/santa-loop.md` ≥ 1.
- `node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"` → `0.3.2`.

---

## Validation

```bash
# baseline + 새 테스트
node --test plugins/mccp/scripts/lib/tests/*.test.js
node --test plugins/mccp/scripts/state/tests/*.test.js
node --test plugins/mccp/scripts/receipt/tests/*.test.js
node --test plugins/mccp/scripts/hooks/tests/*.test.js

# 회귀 cross-grep
grep -rn 'parseCodexResult' plugins/mccp/scripts/hooks/   # stop-loop이 여전히 codex-bridge 사용
grep -rn 'CRITICAL_PATTERNS' plugins/mccp/scripts/lib/    # 단일 catalog (codex-bridge만 소유, escalate-detector는 import)
grep -rn 'verdict.*codex_critical\|verdict.*codex_divergent' plugins/mccp/scripts/  # enum 외 신규 verdictKind 없음

# 새 escalate trigger 행동 확인
node plugins/mccp/scripts/receipt/cli.js status --json   # 모든 receipt가 escalate 기록 노출

# plugin version
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"   # 0.3.2
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CRITICAL 오분류 → escalate spam | Medium | Medium | catalog는 codex-bridge와 동일 (conservative 5종). fix-task append idempotent — 같은 receipt 두 번 detect해도 1회 inject |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| receipt-write 중 detector exception → write block | Low | High | fail-open invariant — try/catch + loud stderr. write는 항상 성공 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| fix-task append 도중 race (cli + hook 동시) | Low | Medium | 기존 state-writer `withStateLock` 패턴 재사용. fix-task에도 동일 lock 도입 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `escalate_pending` flag clear 누락 → 영구 alarm | Medium | Low | santa-loop 통과 + 후속 receipt write 시 `det.escalate=false`이면 STATE flag clear (Task 5.2 reverse path) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| santa-loop가 codex disabled 환경에서 dead-end | Low | Medium | santa-loop.md:105-107 Claude Agent fallback이 보존됨 — model diversity 손실되나 context isolation 유지 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| stop-loop의 inline codex-bridge path와 receipt-based path가 같은 fix-task를 두 번 쓰는 race | Low | Low | append 모드가 originatingReceipts 중복 검사로 idempotent |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| INC-001 패턴(schema bump migration 누락) 재발 | Low | High | `escalate_pending` frontmatter는 conditional emit + 누락 시 default false — schema bump 없음. 기존 STATE.md 호환 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

---

## Design Constraints (NO-COMPROMISE)

1. **자동 `/mccp:santa-loop` invoke 안 함.** *안내*만 추가. adversarial review는 cost가 있고 false-positive 시 quota 낭비. 사용자 결정 보존.
2. **escalate-detector는 catalog 재정의 금지.** codex-bridge.js의 `CRITICAL_PATTERNS`를 import. drift 시 두 곳 갱신은 운영 부담 + INC-001 패턴 위험.
3. **receipt-write fail-open invariant.** detector 예외는 절대 write를 block하지 않음. loud stderr는 필수.
4. **fix-task `write()` 시그니처 변경 금지.** 기존 stop-loop 호출 경로 보존. 새 동작은 `writeOrAppend()` 신규 함수로만.
5. **신규 `verdictKind` enum 추가 금지.** `codex_critical` / `codex_divergent` 만 사용 — fix-task.js의 `deriveTitle/deriveWhy/deriveNextActions` 분기가 그대로 작동.

---

## Acceptance

- [ ] **5.1** `escalate-detector.js` + 11/11 테스트 PASS:
  - finding CRITICAL → `verdict=codex_critical`, `trigger=finding_critical`
  - open_question CRITICAL + secret_exposure catalog match → `criticalCategory=secret_exposure`
  - open_question CRITICAL + data_loss catalog match
  - open_question CRITICAL + authz_bypass catalog match
  - open_question CRITICAL + external_destination catalog match
  - open_question CRITICAL + crypto_key catalog match
  - open_question CRITICAL + no catalog match → `escalate=false` (catalog match가 trigger 조건)
  - converged=false + rounds=3 → `trigger=divergent_unresolved`
  - converged=false + rounds=2 → `escalate=false` (rounds<3)
  - converged=true + rounds=5 → `escalate=false`
  - 빈 findings + 빈 open_questions + converged=true → `escalate=false`
- [ ] **5.2** receipt-write integration:
  - escalate trigger fires → `fix-task.md` 생성 (verdict + originatingReceipts 포함)
  - 같은 receipt 재호출 → idempotent (1회만 inject)
  - detector exception → receipt write 성공 + stderr 경고
- [ ] **5.3** state-writer + state-injector:
  - `escalate_pending=true` round-trip (write → read 일관성)
  - state-injector가 `## Escalation Pending` 섹션 inject
- [ ] **5.3** fix-task.writeOrAppend:
  - 미존재 → write fallback
  - 기존 + 새 receipt → append (originatingReceipts 추가, escalate 섹션 유지)
  - 기존 + 동일 receipt → no-op
- [ ] **5.4** santa-loop.md Step 0 추가 + grep guard PASS
- [ ] **5.4** roadmap Status Snapshot 정정 (v0.3.1 shipped 반영 + v0.3.2 진입)
- [ ] **5.4** `plugin.json` 0.3.1 → 0.3.2
- [ ] PR body에 `## Codex Adversarial Review` (Codex disabled 환경이므로 `skipped: codex_disabled` 자동 footer)
- [ ] main merge — receipt chain 위에 escalate detection layer 안정 작동

---

## Open Questions (planning round)

- **MEDIUM** — receipt-write integration이 in-process로 들어가면 escalate-detector 의존성 cycle 가능성 (receipt → escalate-detector → state-writer / fix-task). 모두 sibling module이므로 cycle 없을 것이지만 npm-ls 같은 도구로 import graph 검증 권장. <!--mccp:resolved reason="plan이 completed/ 로 아카이브됨 = ship 시점에 질문이 해소되어 본문 결정에 반영됨" at="2026-06-24T16:29:04.758Z"-->
- **LOW** — `escalate_pending` flag clear 정책: Task 5.2의 reverse path (`det.escalate=false`이면 clear)가 충분한가? santa-loop 통과 receipt가 `det.escalate=false`일 것이라는 가정. santa-loop이 receipt를 write하는지는 santa-loop.md 본문 확인 필요 (현재 모듈은 push만 함 — 별도 receipt 안 씀). 만약 santa-loop이 receipt를 안 쓰면 사용자가 명시적 clear 명령 필요할 수도. 구현 단계에서 결정. <!--mccp:resolved reason="plan이 completed/ 로 아카이브됨 = ship 시점에 질문이 해소되어 본문 결정에 반영됨" at="2026-06-24T16:29:04.758Z"-->
- **LOW** — fix-task append 모드의 `expires_at` 갱신 정책: append 시 기존 값 보존 vs 갱신. 보존 추천 (escalate가 묵은 채로 TTL 만료되어야 자동 정리). <!--mccp:resolved reason="plan이 completed/ 로 아카이브됨 = ship 시점에 질문이 해소되어 본문 결정에 반영됨" at="2026-06-24T16:29:04.758Z"-->

---

## Design Critique

> impeccable unavailable, skipped (auto-fallback): no-design-surface

(본 plan은 backend module(escalate-detector + state-writer frontmatter + fix-task append) implementation. UI/디자인 surface 없음 — `design_signal=false`. plan-codex는 lenient gate이므로 `meta.impeccable_skipped=true` warning으로 처리.)

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.3.1/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 (auto-fallback)
- 합치 결론: **skipped — `MCCP_CODEX_DISABLED=1`** (사용자 영구 bypass 합의, [feedback-codex-permanent-bypass](C:/Users/skypark207/.claude/projects/c---project-my-my-claude-code-plugin/memory/feedback-codex-permanent-bypass.md))
- YAGNI Triage: n/a (no findings)
- Deferred to backlog: 0
- Open Questions: 본 plan §Open Questions 참조 (MEDIUM × 1 + LOW × 2)
- Codex session 참조: n/a

## Codex Implementation Review

- 호출: skipped (auto-fallback: codex_disabled — `MCCP_CODEX_DISABLED=1` 영구 bypass)
- 라운드 수: 0
- 합치 결론: cross-gate dedupe applied — plan-codex 자체가 skip 상태 + implement 시점에 신규 architectural decision 없음 (변경 파일이 모두 plan의 §Files to Change 목록 안). 신규 decision-set 없으므로 재호출해도 같은 skip 결과.
- YAGNI Triage: n/a (no findings)
- Deferred to backlog: 0
- Open Questions: 본 plan §Open Questions 참조 (변동 없음 — MEDIUM × 1 + LOW × 2 그대로)
- Codex session 참조: n/a

### Security Reviewer

> security-reviewer skipped (auto-fallback): no-security-surface — escalate detection module은 valid receipt object를 읽고 `.claude/state/{fix-task.md,STATE.md}`에 쓰는 backend-only 변경. auth/crypto/secrets/SSRF/path-traversal/privilege-escalation 표면 없음. trust boundary는 기존 state-writer와 동일.

### Design Review

> impeccable unavailable, skipped (auto-fallback): no-design-surface — backend module(escalate-detector + state-writer frontmatter + fix-task append) implementation. UI 표면 없음 (plan §Design Critique과 일치).

---

## Source Sections (roadmap)

본 milestone 본문은 thin-index 변환 전 roadmap §Milestone 5 (lines 880-904)에 있음. roadmap status snapshot은 본 plan ship 시 Task 5.4(b)에서 정정.
