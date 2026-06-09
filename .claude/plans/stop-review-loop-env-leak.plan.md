# Plan: Stop Review Loop Test — MCCP_CODEX_DISABLED Env Leak Fix

**Source PRD**: `.claude/prds/stop-review-loop-env-leak.prd.md`
**Selected Milestone**: env-var cleanup fix (sole milestone)
**Complexity**: Small

## Summary

PR #11 review L2가 지적한 `stop-review-loop.test.js` "path 7" test의 환경 격리 부재를 수정합니다. 부모 shell의 `MCCP_CODEX_DISABLED=1` 영구 설정이 test 안으로 leak되면 `codex-bridge.parseCodexResult`가 verdict='unavailable'로 short-circuit돼 path 7 어설션 (`decoded.decision === 'block'`)이 실패합니다. canonical 패턴(`codex-bridge.test.js:151-162`)을 mirror해 test 진입 시 env snapshot + `delete`, finally에서 restore.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js:1` | `'use strict';` + `node:test`/`node:assert` + function-style `test('...')` blocks |
| Env snapshot/restore | `plugins/mccp/scripts/lib/tests/codex-bridge.test.js:151-162` | `const prev = process.env.X; ... ; try { ... } finally { if (prev === undefined) delete process.env.X; else process.env.X = prev; }` |
| Test fixture | `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js:15-46` | `mkGitRepo`/`writeTranscript`/`captureStderr` reused across paths — minimal change strategy |
| Assertion style | `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js:192-199` | `JSON.parse(out)` → `assert.strictEqual(decoded.decision, 'block')` + `assert.match(decoded.reason, /Codex CRITICAL/)` |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js` | UPDATE | path 7 test (line 180-199)를 env snapshot/restore guard로 wrap |

## Tasks

### Task 1: path 7 test에 env snapshot/restore guard 추가

- **Action**:
  - line 181 직후(test body 시작)에 `const prevDisabled = process.env.MCCP_CODEX_DISABLED; delete process.env.MCCP_CODEX_DISABLED;` 추가
  - 기존 test body를 `try { ... } finally { if (prevDisabled === undefined) delete process.env.MCCP_CODEX_DISABLED; else process.env.MCCP_CODEX_DISABLED = prevDisabled; }`로 wrap
  - assert문은 try block 안에 그대로 유지
- **Mirror**: `plugins/mccp/scripts/lib/tests/codex-bridge.test.js:151-162` (canonical snapshot/restore)
- **Validate**:
  ```bash
  MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js
  # Expect: 13/13 PASS (path 7 was the only failure under env set)
  ```

### Task 2: env unset 환경에서 regression 없음 확인

- **Action**: env unset 상태로 동일 test 실행 — 기존 13/13 green이 유지되는지 검증.
- **Mirror**: 해당 없음 (regression check)
- **Validate**:
  ```bash
  unset MCCP_CODEX_DISABLED 2>/dev/null
  node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js
  # Expect: 13/13 PASS unchanged
  ```

### Task 3: 전체 suite green 확인

- **Action**: 패치가 다른 test에 회귀를 주지 않는지 확인. 같은 file 안의 path 5도 `MCCP_STOP_LOOP_CODEX: '1'` + `codexResultText: 'Round 1: APPROVE\nConclusion: CONVERGED'`라서 codex-bridge가 호출되지만, CONVERGED text가 disabled short-circuit 이전에 verdict='approve'로 결정되는지 코드 흐름상 의존. 회귀 시 path 5에도 동일 guard 적용 옵션 고려(out-of-scope이나 validate가 catch).
- **Mirror**: 해당 없음
- **Validate**:
  ```bash
  npm test
  # Expect: 모든 test suite 통과
  ```

## Validation

```bash
# 1. env set 상황 (사용자의 영구 bypass 모방) — fix가 의도대로 작동
MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js

# 2. env unset 상황 — 회귀 없음
unset MCCP_CODEX_DISABLED 2>/dev/null
node --test plugins/mccp/scripts/hooks/tests/stop-review-loop.test.js

# 3. 전체 suite — 인접 file에도 회귀 없음
npm test
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| path 5도 동일 노출, 본 fix가 path 7만 cover → 다른 env 상태에서 false-pass 가능 | Medium | Task 3 validation이 catch. 발견 시 동일 guard 적용을 follow-up으로 분리하거나 즉시 흡수. |
| try/finally가 outer block을 잘못 닫아 syntax error | Low | Test 실행이 즉시 catch. minimal diff 원칙으로 indentation 보존. |
| restore 로직이 `null`/empty string 같은 edge value를 잘못 처리 | Low | 캐논 패턴(`codex-bridge.test.js:151-162`)이 이미 `undefined` 분기만 처리하고 production에서 안전 확인됨. 동일 패턴 그대로 mirror. |
| 본 file의 추가 env mutation 발견 시 scope creep | Medium | PRD Out-of-scope: "다른 env var의 cross-test leak audit" → 별도 task로 분리 의무. |

## Acceptance

- [ ] Task 1: path 7 test body가 env snapshot/restore guard로 wrap됨
- [ ] Task 2: env unset에서 13/13 PASS 유지
- [ ] Task 3: `npm test` 전체 green
- [ ] Patterns mirrored: `codex-bridge.test.js:151-162` snapshot/restore 그대로 mirror (별도 helper 추출 안 함 — single-site fix)
- [ ] PR #11 review L2 finding 해소

## Notes (v0.3.3 Dogfood Observation)

본 plan은 `/mccp:work` single-entry chain 안에서 Phase 2 GROUND가 PRD의 (user-delegated, Claude-inferred) 잘못된 cause direction을 자가 보정한 사례. Task 3 report `.claude/PRPs/reports/v0-3-3-intent-dogfood-report.md`에 finding으로 기록: "PRD inversion이 plan 단계 grounding으로 자가 회복 — chain의 multi-stage safety가 실증됨". Plan body가 chain의 ground-truth 기준점 역할을 함.

## Design Critique

> impeccable unavailable, skipped (auto-fallback): skill-missing

본 plan은 test-fixture hygiene patch (try/finally guard 추가)로 UI surface가 없습니다 — design critique이 의미를 갖지 않으므로 skill-missing fallback이 무해. plan-codex receipt에 `meta.impeccable_skipped=true` warning으로만 surface.

## Codex Adversarial Review

> Codex unavailable, skipped (auto-fallback): exit-nonzero (wrapper exit=12, classification=exit-nonzero, blocking=true → advisory mode entered)

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.3.2/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 (R1 자체가 wrapper 단계에서 실패 — 실제 Codex 모델 호출 안 됨)
- Advisory mode 진입 사유: 사용자의 영구 bypass 정책 (`MCCP_CODEX_DISABLED=1` + `MCCP_RECEIPT_GATE_MODE=off` in `.claude/settings.local.json`). v0.3.3 dogfood finding: codex-invoke.js wrapper가 `MCCP_CODEX_DISABLED` env를 honor하지 않아 wrapper-level skip이 아니라 wrapper-level failure로 manifestation. CLAUDE.md §1.2 contract와의 spec/impl drift.
- Open Questions: none (Codex가 실제 발화하지 않았으므로 fresh open question 없음. plan body의 Risks 표가 self-author CRITICAL/HIGH 책임을 짊어짐)
- Codex session 참조: n/a (advisory mode — no session)

### Self-attested dogfood findings (이 plan 자체에 대한 internal review)

본 plan의 핵심 위험은 (1) path 5도 동일 노출 가능성에 대한 minimal-scope 결정과 (2) PRD-plan inversion이 chain 안에서 자가 보정된 사례의 일반화 가능성입니다. 양쪽 모두 Risks 표에 명시했고, 첫 번째는 Task 3 validation이 mechanical로 catch합니다. Advisory mode를 entering하지 않았더라도 Codex가 R1에서 발견했을 가능성이 있는 항목은 다음 정도로 추정:

- *HIGH (예상)*: path 5에도 동일 guard를 적용하지 않으면 회귀 가능성 — 이미 Risks 표 / Task 3 validation이 cover.
- *MEDIUM (예상)*: try/finally 안에 또 다른 mutation이 잠복 가능 → minimal-diff 원칙 + post-edit grep으로 미연 방지.
- *LOW (예상)*: PRD AMENDMENT note의 historical preservation이 future contributor에게 혼란을 줄 수 있음 → "Problem (corrected)" 우선 노출 + strikethrough로 명시 처리됨.

## Codex Implementation Review

> Codex unavailable, skipped (auto-fallback): exit-nonzero (wrapper exit=12, classification=exit-nonzero — same path as plan-codex stage; sustained permanent bypass policy)

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/0.3.2/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 (R1 자체가 wrapper 단계에서 실패)
- Advisory mode 진입 사유: 사용자의 영구 bypass 정책 (`MCCP_CODEX_DISABLED=1` + `MCCP_RECEIPT_GATE_MODE=off`). plan-codex와 동일한 wrapper-level skip 미지원 finding이 재현됨.
- Implement-time decision set (Codex가 받았어야 할 focus):
  1. Variable name: `prevDisabled` (스코프 의도가 명확) vs canonical mirror의 `prev` (짧음). minimal-mirror 원칙으로 `prev` 선택.
  2. try/finally wrap scope: 전체 assert block 포함 (assertion failure 시에도 env 복원 보장).
  3. Helper extraction (e.g., `withCodexDisabledClean(fn)`) — 단일 site에서만 필요하므로 inline 유지. YAGNI.
- Open Questions: none
- Codex session 참조: n/a (advisory mode)

### Security Reviewer

본 변경은 test fixture의 env-var snapshot/restore에 한정. auth / crypto / secrets / input validation / SQL/cmd injection / SSRF / path traversal / privilege escalation 어느 영역에도 해당 안 함. security-reviewer subagent 호출 skip (spec 2.5.5 조건문 미충족 — 비security 영역).

### Design Review

> impeccable unavailable, skipped (auto-fallback): skill-missing

Implement-mode detection도 동일 결과. test-fixture hygiene patch라 UI surface 없음. implement-codex는 strict gate라 receipt가 `impeccable_skipped=true`로 표기되며 downstream `/mccp:pr`이 BLOCK될 수 있으나, 본 v0.3.3 dogfood context에서 advisory policy(영구 bypass)가 적용돼 통과 예상.


