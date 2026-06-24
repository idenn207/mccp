# Plan: v0.2.4 — Phase 7/2.5 본문 복구 + security-reviewer Skill fix

**Source PRD**: (생략 — v0.2.3 cycle followup #3 기반)
**Selected Milestone**: v0.2.4
**Complexity**: Small-Medium

---

## Summary

v0.2.2가 Codex Skill 호출을 fail-closed Bash wrapper(`codex-invoke.js`)로 cutover했지만 `Skill(security-reviewer, ...)` 호출 **3건**(`prp-implement.md` Phase 2.5.5, `pr.md` Phase 2.5.5, `code-review.md` Phase 2.5.3)이 동일 패턴(Skill index 부재 + slash command disable)으로 깨진 상태로 남아 있다. v0.2.4는 이 3건을 **`Agent(security-reviewer, ...)` Task-tool invocation 패턴**으로 치환하고, agent unavailable 시 advisory note + non-approving receipt 분기를 본문에 명시한다. 4개 command의 Phase 5 / Phase 2.5 sub-step 구조 자체는 이미 정착되어 있으므로 v0.2.4 scope는 **본문 안의 invocation 경로 치환 + grep regression guard**로 축소된다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Fail-closed wrapper | [scripts/lib/codex-invoke.js](plugins/mccp/scripts/lib/codex-invoke.js) | classification enum + blocking flag + advisory mode opt-in |
| Phase sub-step naming | [commands/plan.md Phase 5](plugins/mccp/commands/plan.md) | `Phase N.M — title (자동, /mccp:<cmd> 진입 시 MANDATORY)` |
| Sentinel grep verification | plan.md Phase 5.6 Step A | `grep -q "^## <Section Title>$" <plan path>` |
| Reuse-first agent invocation | [commands/code-review.md:152-174](plugins/mccp/commands/code-review.md) | check PR body for prior section before re-invoking agent |
| Regression grep guard | [tests/dep0190-guard.test.js](plugins/mccp/scripts/hooks/tests/dep0190-guard.test.js) | synthetic offender + safe-form 양방향 regex 검증 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/commands/prp-implement.md` | UPDATE | Phase 2.5.5 — Skill → canonical Task tool contract (`subagent_type`) + fallback 분기 |
| `plugins/mccp/commands/pr.md` | UPDATE | Phase 2.5.5 — Skill → canonical Task tool contract; terminal command hard-block + Task 10 audited escape branch |
| `plugins/mccp/commands/code-review.md` | UPDATE | Phase 2.5.3 — Skill → canonical Task tool contract + reuse-first 패턴 보존 |
| `plugins/mccp/scripts/lib/tests/security-reviewer-guard.test.js` | CREATE | regression guard — Skill/Agent shorthand 0건 + `subagent_type` canonical contract 검증 |
| `plugins/mccp/scripts/lib/tests/security-reviewer-dogfood.test.js` | CREATE | Task 5 보강 — fake Task harness fixture로 invocation runtime contract dogfood |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | Task 8 + Task 10 — `meta.security_skipped` blocking enforcement + `meta.security_force_override` audited escape |
| `plugins/mccp/scripts/receipt/tests/security-skipped.test.js` | CREATE | Task 8 — receipt CLI `security_skipped` blocking behavior 검증 |
| `plugins/mccp/scripts/receipt/tests/security-force-override.test.js` | CREATE | Task 10 — `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` audit trail + validator behavior |
| `plugins/mccp/scripts/lib/codex-invoke.js` | UPDATE | Task 9 — `--json` parse + companion forward |
| `plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js` | CREATE | Task 9 — fake companion fixture로 `--json` forward contract 검증 |
| `plugins/mccp/scripts/receipt/tests/state-matrix.test.js` | CREATE | Task 11 — 4-axis state machine invariants + precedence |
| `plugins/mccp/scripts/lib/tests/codex-companion-smoke.test.js` | CREATE | Task 12 — real codex-companion `--json` smoke (skip-on-CI) |
| `plugins/mccp/scripts/lib/tests/task-tool-smoke.test.js` | CREATE | Task 12 — real Task tool subagent_type dispatch smoke (skip-on-CI) |
| `plugins/mccp/scripts/receipt/tests/e2e-dogfood.test.js` | CREATE | Task 12 — sample plan end-to-end (plan→codex→receipt→validate) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump 0.2.3 → 0.2.4 |

## Tasks

### Task 1: Skill(security-reviewer) call-site audit
- **Action**: 4개 command 파일에서 `Skill(security-reviewer` 호출을 grep으로 매핑. 각 호출의 surrounding context (Phase sub-step, before/after step의 의미)를 캡처해 치환 전후 의미 동일성 확인.
- **Mirror**: dep0190-guard.test.js의 synthetic offender 식별 패턴
- **Validate**: `grep -rn "Skill(security-reviewer" plugins/mccp/commands/` → 3 matches expected (prp-implement.md, pr.md, code-review.md). plan.md는 0 matches.

### Task 2: prp-implement.md Phase 2.5.5 fix
- **Action**: `Skill(security-reviewer, "review proposed implementation: <list affected areas>")` 호출을 다음 **명시적 Task tool snippet** (subagent_type 필드 포함, shorthand 금지)으로 치환. R2 finding #2 (Agent invocation runtime contract) 흡수 — `Agent(name, ...)` shorthand는 mccp의 실제 Task tool 호출과 1:1 매핑되지 않으므로 canonical contract를 본문에 노출한다:

```markdown
For security-sensitive areas (auth, crypto, secrets, input validation, SQL/cmd
injection, SSRF, path traversal, privilege escalation): invoke the **Task tool**
with the canonical contract:

- `subagent_type: "security-reviewer"`
- prompt: `"review proposed implementation: <list affected areas>"`

If the Task tool returns "agent not found", harness rejection, schema mismatch,
or any non-success result:
- Record `> security-reviewer unavailable, skipped (auto-fallback): <one-line reason>`
  in `## Codex Implementation Review` under `### Security Reviewer` subheading.
- The Phase 2.5.6 receipt-write step **MUST** pass `--security-skipped` to the
  receipt CLI; the receipt records `meta.security_skipped: true` +
  `meta.security_skip_reason: <reason>`.
- `receipt validate-cmd` treats `security_skipped` as **blocking** for implement
  and code-review gates (parallel to `codex_skipped`, enforced by Task 8 receipt
  CLI changes).

Integrate findings into the same `## Codex Implementation Review` section under
a `### Security Reviewer` subheading. CRITICAL/HIGH security findings →
MCCP-GATE-STOP.
```

- **Mirror**: plan.md Phase 5.2의 Codex unavailable fallback 분기 + codex-bridge.js의 `meta.codex_skipped` pattern
- **Validate**:
  - `grep -q "Skill(security-reviewer" plugins/mccp/commands/prp-implement.md` → exit 1 (no match)
  - `grep -q 'subagent_type: "security-reviewer"' plugins/mccp/commands/prp-implement.md` → exit 0 (canonical contract present)
  - shorthand 회귀 가드: `grep -q "^Agent(security-reviewer" plugins/mccp/commands/prp-implement.md` → exit 1

### Task 3: pr.md Phase 2.5.5 fix (terminal command — hard block + audited escape)
- **Action**: `Skill(security-reviewer, ...)` 호출을 Task 2와 동일한 canonical Task-tool contract(`subagent_type: "security-reviewer"`)로 치환. **Terminal mutating command** 특성상 (Phase 0의 advisory rejection 패턴과 일관) agent unavailable 시 기본 **MCCP-GATE-STOP** (PR 작성 차단). 단 **Task 10이 ship하는 audited escape hatch** (`MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER=1`)가 환경에 설정된 경우만 advisory mode 진입 — receipt에 `meta.security_force_override: true` + `meta.security_force_override_reason` 기록, audit trail 영구 보존.
- **Mirror**:
  - pr.md Phase 0의 advisory rejection 패턴 (terminal commands MUST refuse non-converged path)
  - codex-invoke.js의 `MCCP_ALLOW_CODEX_UNAVAILABLE` opt-in 패턴 (env var + receipt metadata + non-approving validator behavior)
- **Validate**:
  - `grep -q "Skill(security-reviewer" plugins/mccp/commands/pr.md` → exit 1
  - `grep -q 'subagent_type: "security-reviewer"' plugins/mccp/commands/pr.md` → exit 0
  - `grep -q "MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER" plugins/mccp/commands/pr.md` → exit 0 (escape branch documented)

### Task 4: code-review.md Phase 2.5.3 fix (reuse-first 보존)
- **Action**: 본문의 reuse-first 흐름(PR body의 `### Security Reviewer` subheading 우선 검사) 보존. 부재 시에만 canonical Task tool contract (`subagent_type: "security-reviewer"`, prompt `"review PR #<NUMBER> against base <base>: <list affected areas>"`) 호출. Agent unavailable 시 `> security-reviewer unavailable, skipped (auto-fallback)` 기록 후 Phase 6 REPORT 진입 (`/mccp:code-review`는 read-only review이므로 hard block 불필요). receipt-write 시 `--security-skipped` 전달 — read-only이므로 `meta.security_skipped`가 informational (blocking 아님, Task 8의 validator policy).
- **Mirror**: code-review.md Phase 2.5.2 impeccable reuse-first 패턴
- **Validate**:
  - `grep -q "Skill(security-reviewer" plugins/mccp/commands/code-review.md` → exit 1
  - `grep -q 'subagent_type: "security-reviewer"' plugins/mccp/commands/code-review.md` → exit 0

### Task 5: regression guard test (R2 finding #2 흡수 — runtime contract assertion 추가)
- **Action**: `plugins/mccp/scripts/lib/tests/security-reviewer-guard.test.js` 신규 작성. node native test runner. 3개 command 파일 (prp-implement.md, pr.md, code-review.md)을 fs.readFileSync로 읽고 다음을 assert:
  1. `Skill(security-reviewer` substring count === 0 (모든 파일)
  2. `subagent_type: "security-reviewer"` substring count >= 1 (각 파일) — **R2 finding #2 흡수: canonical contract 검증**
  3. shorthand 회귀 가드: `Agent(security-reviewer` substring count === 0 (모든 파일) — shorthand 형태가 본문에 다시 새지 않도록
  4. synthetic offender (가상의 Skill 호출 문자열)에 대해 guard regex가 양방향 fail/pass

  추가로 **dogfood smoke test** (별도 test file or 같은 file의 `t.test('dogfood: Task tool contract', ...)`): `plugins/mccp/scripts/lib/tests/security-reviewer-dogfood.test.js`에 fixture로 fake Task tool harness 만들고 `subagent_type: "security-reviewer"` invocation이 expected schema(prompt 인자, return 형태)로 정상 dispatch 되는지 검증. 실패 시 immediate test failure로 plan 본문의 invocation snippet이 stale인지 catch.
- **Mirror**:
  - [tests/dep0190-guard.test.js](plugins/mccp/scripts/hooks/tests/dep0190-guard.test.js) — synthetic offender / safe-form 두 부수 케이스
  - [tests/codex-bridge.test.js](plugins/mccp/scripts/lib/tests/codex-bridge.test.js) — wrapper fixture 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/security-reviewer-guard.test.js plugins/mccp/scripts/lib/tests/security-reviewer-dogfood.test.js` → all pass

### Task 6: Phase sub-step sentinel audit (cosmetic, low priority)
- **Action**: 4개 command의 Phase 5 / Phase 2.5 sub-step 명명이 일관적인지 grep으로 점검. 각 sentinel grep target(`^## Codex Adversarial Review$`, `^## Codex Implementation Review$`)이 본문 실제 sentinel section title과 일치하는지 manual review.
- **Mirror**: plan.md Phase 5.6 Step A의 grep verification
- **Validate**: manual — Phase numbering의 5 vs 7 cosmetic discrepancy는 영향 없음 (receipt CLI는 sentinel section title만 검사).

### Task 7: plugin.json version bump
- **Action**: `plugin.json` version 필드 0.2.3 → 0.2.4
- **Validate**: `cat plugins/mccp/.claude-plugin/plugin.json` → version "0.2.4"

### Task 8: receipt CLI `security_skipped` enforcement (R2 finding #1 흡수 — high)
- **Action**: receipt CLI에 `meta.security_skipped` blocking 처리 추가. 현재 `meta.codex_skipped`만 validator가 blocking으로 처리하는 fail-open 구조를 close:
  1. `plugins/mccp/scripts/receipt/cli.js`의 write 명령에 `--security-skipped` flag + `--security-skip-reason <text>` flag 추가 — receipt JSON에 `meta.security_skipped: boolean` + `meta.security_skip_reason: string|null` 직렬화
  2. schema validator에 두 필드 등록 (`meta.security_skipped`는 boolean, 기본 false; `meta.security_skip_reason`은 string|null)
  3. preflight/validate-cmd에서 `gate_id ∈ {mccp-implement-codex, mccp-pr-codex}`이고 `meta.security_skipped === true`인 경우 → `blocking[]`에 `{gate_id, decision_id, reason: "security-reviewer skipped (auto-fallback)", skip_reason: <meta.security_skip_reason>}` 항목 추가
  4. `gate_id === mccp-code-review-codex`(또는 code-review용 gate id가 있다면 그것)인 경우 → informational only (read-only command이므로 blocking 아님). 본 plan은 mccp gate naming의 정확한 list를 receipt CLI 코드에서 확인 후 분기.
- **Mirror**:
  - 기존 `meta.codex_skipped` 처리 코드 (write CLI flag + schema + validate-cmd blocking 분기)
  - codex-bridge.js의 verdict='skipped' propagation
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/security-skipped.test.js` — case matrix:
  - write `--security-skipped` → receipt에 `meta.security_skipped: true` 기록
  - validate-cmd가 `security_skipped=true` 받은 implement/pr receipt를 blocking[]로 marking
  - code-review receipt는 blocking[]에 미포함 (informational)
  - schema validation: `meta.security_skipped`가 boolean이 아니면 schema error
  - dual-skipped: `codex_skipped` + `security_skipped` 동시 true → blocking[]에 두 항목 모두

### Task 9: codex-invoke.js `--json` forward (R2 finding #4 흡수 — medium)
- **Action**: `plugins/mccp/scripts/lib/codex-invoke.js`의 `runCli`와 `invokeAdversarialReview` 갱신:
  1. `runCli`의 args 루프에서 `--json` 받으면 discard 대신 `opts.json = true` 저장 (`scripts/lib/codex-invoke.js:223` `if (a === '--json') continue;` → `if (a === '--json') { opts.json = true; continue; }`)
  2. `invokeAdversarialReview`의 args build (`codex-invoke.js:145-148`)에 `if (opts.json) args.push('--json');` 추가
  3. 호출자(plan.md, pr.md, prp-implement.md command bodies)는 이미 `--json`을 wrapper에 pass 중이므로 본문 갱신 불요
- **Mirror**:
  - 기존 `--base` / `--scope` forward 패턴 (`codex-invoke.js:146-147`)
  - Round 2 historic finding의 fixture test 권고 (plan body line 169-172)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js` — fake companion fixture 케이스:
  - wrapper에 `--json` pass 시 companion args에 `--json` 포함되는지 검증 (process.argv 캡처)
  - wrapper에 `--json` 미pass 시 companion args에 `--json` 미포함 (회귀 가드)
  - fake companion이 structured JSON verdict 반환 시 wrapper의 result.stdout이 JSON parsable한지
  - timing 양방향: 90s 경계 이후 ~120s에 fake companion 완료, wrapper success payload exposed

### Task 10: `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` audited escape hatch (R2 finding #3 흡수 + R3 finding #1 audit-hole fix — PR body canonical audit)
- **Action**: terminal `/mccp:pr`이 security-reviewer agent unavailable 시 hard-block 되는 trap-door를 풀되 **PR body가 canonical audit source** (R3 finding #1 absorption: `.claude/receipts/`는 .gitignore되어 ephemeral이므로 git-tracked PR body가 영구 audit). receipt는 local audit aid:
  1. `plugins/mccp/commands/pr.md` Phase 2.5.5 본문에 escape branch 추가 — security-reviewer Task tool 호출 실패 시 `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` env var 검사. 미설정 → MCCP-GATE-STOP. 설정됨 (non-empty reason string, `=1` 같은 단일 토큰은 schema warning + reason 입력 prompt) → advisory mode 진입.
  2. **PR body audit section auto-inject (R3 finding #1 fix)**: `/mccp:pr`의 PR body 생성 단계에서 force_override 사실 감지 시 다음 section을 PR body에 inject:

     ```markdown
     ## Security Reviewer Override

     - **Triggered by**: `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER`
     - **Reason**: <reason text from env var>
     - **Receipt path**: `.claude/receipts/mccp-pr-codex/<decision>.json` (working-tree-only, ephemeral)
     - **Timestamp**: <ISO 8601 UTC>
     - **Audit canonical**: This PR body section. Receipt is local audit aid.
     - **Reviewer action**: Confirm override reason is acceptable before merge.
     ```

  3. `plugins/mccp/scripts/receipt/cli.js` write 명령에 `--security-force-override` flag + `--security-force-override-reason <text>` flag 추가. receipt에 `meta.security_force_override: boolean` + `meta.security_force_override_reason: string|null` 기록. **단순 local audit aid** — git-tracked 아님 (CLAUDE.md §3.1 working-tree-only intent 보존).
  4. validator: `meta.security_force_override === true`인 receipt는 **non-approving** marking (warnings[]에 surface, `blocking[]` 아님). PR 생성은 통과.
  5. pr.md 본문에 사용자 가이드 추가:
     - env var는 임시 1회 사용 권장 (`MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="codex agent registry stale, manual review on Slack thread <link>"` 같은 specific reason). 1-token reason (`=1`, `=yes`) → schema warning + 사용자 prompt로 구체적 사유 요구.
     - PR body의 `## Security Reviewer Override` section은 reviewer가 merge 전 강제 확인할 audit checkpoint. PR template (`.github/pull_request_template.md`)이 있다면 그 위에 inject.
  6. Risk-3 mitigation 표 본문 갱신 — Task 10이 본 risk를 close (deferred → in-scope, PR body audit으로 audit hole resolved).
- **Mirror**:
  - codex-invoke.js의 `MCCP_ALLOW_CODEX_UNAVAILABLE=1` opt-in 패턴 (env var + advisory mode + non-approving receipt)
  - pr.md의 기존 `### Security Reviewer` PR body subheading 패턴 (reuse-first scan용) — 동일 PR body 구조에 새 section 추가
  - pr.md Phase 0의 advisory rejection 패턴 (terminal commands MUST refuse 기본 + opt-in branch)
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/security-force-override.test.js` + integration test:
  - env unset → pr.md Phase 2.5.5 hard-block (sentinel grep)
  - env set, specific reason → receipt에 `meta.security_force_override: true` + reason text 보존 + PR body에 `## Security Reviewer Override` section 정확히 inject
  - env set, 1-token reason → schema warning 또는 prompt 발동
  - validator: force_override receipt가 warnings[]에 surface
  - **R3 finding #1 closure assertion**: PR body가 audit canonical source (`grep -q "^## Security Reviewer Override$" <generated-pr-body.md>`). receipt가 .gitignored여도 PR audit이 영구 보존되는지 확인 — `.gitignore` exception 추가 안 함 (working-tree-only intent 유지)

### Task 11: Receipt meta state matrix invariants (R3 finding #2 흡수 — high)
- **Action**: `plugins/mccp/scripts/receipt/cli.js`에 4-axis state machine 도입: `codex_skipped` × `security_skipped` × `meta.advisory` × `security_force_override`. 각 조합의 verdict와 schema invariants를 명시적으로 enforce:

  | codex_skipped | security_skipped | advisory | force_override | Verdict / Action |
  |---|---|---|---|---|
  | false | false | false | false | approving (default) |
  | true | * | * | * | blocking (모든 gate, codex_skipped 우위) |
  | false | true | * | false | blocking (implement/pr), informational (code-review) |
  | false | false | true | false | non-approving (warnings) |
  | false | false | false | true | non-approving (warnings) — PR body가 audit canonical |
  | false | true | * | true | **SCHEMA-REJECT** (invariant 위반 — security 실패 인지 + 동시 override = fail-open 위장) |
  | false | false | true | true | allowed — advisory + override는 의미적으로 호환 |

- precedence rule: `codex_skipped > security_skipped > advisory > force_override` (위가 더 strict). 모든 조합은 받은 receipt에서 1회만 validator 통과.
- **Mirror**: codex-bridge.js의 verdict propagation + schema invariants 패턴
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/state-matrix.test.js` — 7개 명시 조합 + 무명 조합 fallback + invariant test (`security_skipped=true && security_force_override=true` write 시도 → exit 2 schema reject)

### Task 12: Real-contract smoke tests + e2e dogfood (R3 finding #3 흡수 — medium)
- **Action**: fake fixture 한계를 real-contract smoke와 e2e dogfood로 보완. CI에선 인증 제약으로 skip 허용, dev (local + nightly job)에선 mandatory:
  1. `plugins/mccp/scripts/lib/tests/codex-companion-smoke.test.js` — real codex-companion `--json` invoke + stdout JSON parse 검증. `MCCP_SKIP_REAL_SMOKE=1` 또는 codex 미인증 시 SKIP (t.skip with reason). authenticated 시 mandatory pass.
  2. `plugins/mccp/scripts/lib/tests/task-tool-smoke.test.js` — Task tool harness가 환경에 로딩되어 있다면 `subagent_type: "security-reviewer"` invocation을 실제 dispatch한 뒤 schema 응답 확인. CI에선 harness 미로딩으로 SKIP.
  3. `plugins/mccp/scripts/receipt/tests/e2e-dogfood.test.js` — sample plan + mock /mccp:plan flow를 한 turn으로 시뮬레이션: plan write → codex review (fake or real per env) → receipt write → preflight validate → exit 0. 본 plan body 자체가 v0.2.4 적용 후 e2e pass 확인하는 reference.
- **Mirror**: codex-bridge.test.js의 mock + 실제 fixture 분기 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/codex-companion-smoke.test.js plugins/mccp/scripts/lib/tests/task-tool-smoke.test.js plugins/mccp/scripts/receipt/tests/e2e-dogfood.test.js` — local dev에선 all pass, CI에선 smoke 둘은 SKIP-OK, e2e-dogfood는 mandatory pass

## Validation

```bash
# Static guard — Skill 잔재 + Agent shorthand 0건
grep -r "Skill(security-reviewer" plugins/mccp/commands/ && echo FAIL || echo PASS  # expect PASS
grep -r "Agent(security-reviewer" plugins/mccp/commands/ && echo FAIL || echo PASS  # expect PASS (shorthand 회귀 가드)

# Canonical contract 검증 (R2 finding #2 흡수)
grep -rc 'subagent_type: "security-reviewer"' plugins/mccp/commands/  # expect >=3 across 3 files

# Audited escape branch 검증 (Task 10)
grep -q "MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER" plugins/mccp/commands/pr.md && echo PASS || echo FAIL  # expect PASS

# 신규 unit tests (Task 5/8/9/10/11/12)
node --test plugins/mccp/scripts/lib/tests/security-reviewer-guard.test.js \
  plugins/mccp/scripts/lib/tests/security-reviewer-dogfood.test.js \
  plugins/mccp/scripts/receipt/tests/security-skipped.test.js \
  plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js \
  plugins/mccp/scripts/receipt/tests/security-force-override.test.js \
  plugins/mccp/scripts/receipt/tests/state-matrix.test.js \
  plugins/mccp/scripts/lib/tests/codex-companion-smoke.test.js \
  plugins/mccp/scripts/lib/tests/task-tool-smoke.test.js \
  plugins/mccp/scripts/receipt/tests/e2e-dogfood.test.js

# Task 10 PR body audit inject 검증 (R3 finding #1 closure)
# integration test (manual or scripted): MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER="<reason>" 환경에서
# /mccp:pr 시뮬레이션 후 생성된 PR body markdown에 `## Security Reviewer Override` section + reason text 포함 확인
grep -q "^## Security Reviewer Override$" <generated-pr-body.md> && echo PASS || echo FAIL

# Full regression — v0.2.3 baseline (87 tests) preserved + 신규 5 tests
node --test plugins/mccp/scripts/hooks/tests/dep0190-guard.test.js \
  plugins/mccp/scripts/lib/tests/dep-check.test.js \
  plugins/mccp/scripts/lib/tests/settings-writer.test.js \
  plugins/mccp/scripts/lib/tests/codex-bridge.test.js \
  plugins/mccp/scripts/hooks/tests/session-start-bootstrap.test.js \
  plugins/mccp/scripts/state/tests/state-writer.test.js \
  plugins/mccp/scripts/receipt/tests/pr-body.test.js \
  plugins/mccp/scripts/lib/tests/security-reviewer-guard.test.js \
  plugins/mccp/scripts/lib/tests/security-reviewer-dogfood.test.js \
  plugins/mccp/scripts/receipt/tests/security-skipped.test.js \
  plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js \
  plugins/mccp/scripts/receipt/tests/security-force-override.test.js

# Receipt CLI 회귀 — workspace 0.2.4 path + version assertion (historic R1 finding 흡수)
node "plugins/mccp/scripts/receipt/cli.js" status  # workspace edition, not cached 0.2.3
node -e "const v = require('./plugins/mccp/.claude-plugin/plugin.json').version; if (v !== '0.2.4') { console.error('FAIL version=' + v); process.exit(1); } else { console.log('PASS version=' + v); }"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task tool Agent 결과가 free-text summary라 본문 integration 파서가 깨짐 | HIGH | 본문에서 `findings: severity/location/description` 형태로 추출하도록 명시. Skill schema와 1:1 호환 강제 안 함 — Phase 2.5.5/2.5.3은 free-text를 그대로 sub-section에 inject. **Task 5 dogfood test**가 invocation contract drift를 catch (R2 finding #2 흡수) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| security-sensitive trigger 정의가 모호해 false-positive (매 implement마다 agent 호출 → cost spike) | MEDIUM | §0 catalog 참조 명시 (auth/crypto/secrets/input/SQL/SSRF/path traversal/escalation). 본문에 trigger 예시 추가. plan-codex receipt에 security-sensitive 영역 무관 명시되면 skip |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| pr.md terminal hard-block이 사용자 불편 (agent unavailable 시 PR 못 만듦) | MEDIUM | **CLOSED by Task 10** (v0.2.4 in-scope per R2 finding #3) — `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` audited env var + receipt `meta.security_force_override` + validator non-approving marking. 사용자가 명시적으로 reason 제공 시 PR 통과 가능하되 audit trail 영구 보존 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| security-reviewer fallback이 fail-open으로 깨질 가능성 (R2 finding #1) | HIGH | **CLOSED by Task 8** — receipt CLI `meta.security_skipped` blocking enforcement. fallback이 단순 metadata 기록에 그치지 않고 validator가 implement/pr gate에서 즉시 차단 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| wrapper `--json` contract ambiguity (R2 finding #4 — caller가 verdict JSON 기대하나 rendered markdown 수신) | MEDIUM | **CLOSED by Task 9** — `--json` parse + companion forward + fake companion fixture test. 호출자(plan.md/pr.md/prp-implement.md) command body 변경 없이 wrapper side에서 흡수 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` audited escape가 audit 회피 채널로 악용 (Task 10 side-effect) | MEDIUM | **R3 finding #1 confirmed audit hole RESOLVED**: receipt는 .gitignored (CLAUDE.md §3.1 working-tree-only) 상태 유지하되 PR body의 `## Security Reviewer Override` section을 canonical audit source로 강제 inject (Task 10 갱신). reviewer가 merge 전 인지. reason은 specific text 필수 (1-token 시 schema warning + prompt). env var 1회 사용 권장 (CLAUDE.md §4 운영 토글 블록에 추가) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Receipt meta state matrix 미정의로 구현자 drift (R3 finding #2) | HIGH | **CLOSED by Task 11** — 4-axis state machine 명시 + 7개 조합 verdict 표 + `security_skipped && security_force_override` schema-reject invariant + precedence rule (`codex_skipped > security_skipped > advisory > force_override`) |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Fake fixture가 real Task/companion contract drift 잡지 못함 (R3 finding #3) | MEDIUM | **CLOSED by Task 12** — real codex-companion `--json` smoke + real Task tool dispatch smoke + e2e dogfood (sample plan flow) 추가. CI에선 skip-on-unavail, dev/local에선 mandatory. fake fixture는 shape 검증, smoke는 contract 검증으로 layering |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| Phase numbering 5 vs 7 cosmetic discrepancy로 외부 문서 stale | LOW | receipt CLI는 sentinel section title만 검사. numbering은 docs/gate-design.md, CLAUDE.md, README의 cross-reference로만 등장. v0.2.4에서는 numbering 그대로 유지 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->
| v0.2.3 baseline 회귀 (72 → 67 등) | LOW | Task 5/8/9/10 신규 test + Validation 블록의 전체 회귀 명령으로 매 commit마다 확인 |<!--mccp:resolved reason="plan이 .claude/PRPs/plans/completed/ 로 아카이브됨 = gate chain 통과 후 ship 완료, 완화책이 구현되고 테스트로 가드됨" at="2026-06-24T16:29:04.758Z"-->

## Acceptance

- [ ] 3개 command 파일에서 `Skill(security-reviewer` 호출 0건 (grep)
- [ ] 3개 command 파일에서 `subagent_type: "security-reviewer"` canonical contract 명시 (각 ≥1, R2 finding #2)
- [ ] 3개 command 파일에서 `Agent(security-reviewer` shorthand 0건 (회귀 가드)
- [ ] `pr.md`에 `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` escape branch 명시 (Task 10)
- [ ] `security-reviewer-guard.test.js` + `security-reviewer-dogfood.test.js` pass (Task 5)
- [ ] `security-skipped.test.js` pass — receipt CLI가 `meta.security_skipped`를 implement/pr gate에서 blocking으로 처리 (Task 8, R2 finding #1)
- [ ] `codex-invoke-json.test.js` pass — `--json` flag forward + fake companion fixture (Task 9, R2 finding #4)
- [ ] `security-force-override.test.js` pass — audited override + validator non-approving (Task 10, R2 finding #3)
- [ ] Task 10 PR body inject 검증 — `## Security Reviewer Override` section이 force_override 시 PR body에 자동 inject (R3 finding #1 audit hole closure)
- [ ] `state-matrix.test.js` pass — 7개 조합 verdict + `security_skipped && security_force_override` schema-reject (Task 11, R3 finding #2)
- [ ] `codex-companion-smoke.test.js` + `task-tool-smoke.test.js` + `e2e-dogfood.test.js` pass on dev (skip-on-CI 허용) (Task 12, R3 finding #3)
- [ ] v0.2.3 baseline (87 tests per plan body Session State) + 신규 8개 test (Task 5/8/9/10/11/12 × 1-3 files) 모두 pass
- [ ] receipt CLI 회귀 통과 (workspace 0.2.4 path + version assertion 포함 — historic R1 finding 흡수)
- [ ] plugin.json version 0.2.4 bump
- [ ] CLAUDE.md §4 운영 토글 블록에 `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` 추가
- [ ] CLAUDE.md / README의 v0.2.4 cycle 참조 추가 (followup)

## Codex Adversarial Review

- **호출**: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review --focus "Challenge v0.2.4 plan decisions: (1) Skill→Agent invocation pattern via Task tool for security-reviewer (2) terminal /mccp:pr hard-block w/o audited escape hatch (3) --json forward scope exclusion (4) regression guard runtime contract" --timeout-ms 600000`
- **라운드 수**: 2 (R1 placeholder = wrapper timeout으로 skipped, R2 = wrapper hotfix(90s→900s) 후 첫 정식 review). 별개의 historic R1/R2 (wrapper self-bootstrap 검증 round)는 본 섹션 아래 `## Codex Round 1 + Round 2 Findings (Pending Inject in Next Session)` 섹션에 historical record로 보존.
- **합치 결론**: **needs-attention** — "No ship. The plan still leaves the gate able to fail closed with no recovery, or fail open by writing receipts that the validator will treat as approving." 4 findings (2 high + 2 medium). plan이 fallback metadata enforcement, Agent invocation runtime contract, terminal escape hatch, wrapper `--json` forward를 동일 release에 ship하지 않으면 fail-open(approving receipt) 또는 fail-closed-no-recovery 둘 중 하나로 깨짐.
- **수용한 제안** (3건 — plan body Tasks 갱신 필요):
  - **[high] `security_skipped` enforcement 누락** (Task 2의 line 52-57): Task 2가 "`receipt validate-cmd` treats `security_skipped` as non-approving"이라고 적었지만 그 enforcement를 위한 receipt schema/write/validate 작업이 Tasks 분해에 없음. 현재 receipt code는 `codex_skipped`만 blocking. → security-reviewer fallback이 사실상 approving receipt를 생성하는 fail-open 구조. **Task 후보: Task 8** (receipt CLI schema에 `security_skipped` 필드 추가 + write CLI flag + validate-cmd blocking 처리 + tests).
  - **[high] Agent invocation runtime contract 미검증** (Task 2-4의 line 46-50): plan은 broken `Skill(...)` wrapper를 `Agent(security-reviewer, ...)` shorthand로 치환하지만, mccp의 실제 Agent/Task 호출 패턴은 `subagent_type: "security-reviewer"`. Task 5 grep guard는 substring만 검사 → 잘못된 syntax/agent-not-loadable/schema-drift 케이스 모두 통과. **Task 후보: Task 5 보강** (Task tool dogfood smoke test 추가 + `subagent_type` canonical contract assertion) + **Task 2-4 본문 갱신** (shorthand 대신 명시적 Task tool snippet 사용).
  - **[medium] `--json` forward scope 제외** (line 169-172 Pending Inject): plan.md/pr.md/prp-implement.md 모두 `--json`을 codex-invoke.js에 pass하지만 wrapper의 `runCli`가 `--json`을 discard, `invokeAdversarialReview`도 companion에 forward 안 함 → success payload의 stdout이 rendered markdown으로 ambiguous. caller가 verdict JSON parse 시도 시 silent format mismatch. **Task 후보: Task 9** (wrapper CLI에서 `--json` opts parse → companion args에 forward → fake companion fixture test로 contract 검증).
- **거부한 제안 + 근거**: 없음. 4 findings 모두 v0.2.4 scope 안에서 처리 가능하며, defer 정당화 근거가 약함.
- **Open Questions**:
  - **[medium-POLICY] terminal `/mccp:pr` audited escape hatch** (Recommendation 3 of finding 3): `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER` audited flag를 v0.2.4에 함께 ship할 것인가, v0.2.4 hotfix 사이클로 분리할 것인가? **policy decision required by user.** 함께 ship 시 **Task 10** 추가 (env var parse + audited receipt metadata `meta.security_force_override` + validator behavior). 분리 시 Risk-3 mitigation 본문에 explicit recovery script (예: `command-body local override` 또는 audited git revert path) 추가 필요. 본 verdict는 함께 ship 권장 ("the next security-sensitive PR cannot be created through the terminal command, and the plan provides no audited recovery path").
- **Codex session 참조**: thread `019e8fa8-b23d-7673-9646-f0b3dca78a0c`, turn `019e8fa8-bbcb-7c01-9bef-1b4ace48a792`. duration 177,792ms (~3분), classification=`ok`, blocking=`false`, advisory=`false`.

---

### Codex Recommended Next Steps (verbatim)

1. Add receipt enforcement for `security_skipped` before relying on security-reviewer fallback.
2. Validate the exact Task-tool agent invocation path with a smoke test or dogfood run.
3. Promote the `--json` forwarding fix into v0.2.4 scope.

---

### Round 3 — v0.2.4 Plan After R2 Absorption (다시 needs-attention)

- **호출**: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review --focus "Round 3 review after absorbing R2 findings: (1) state matrix completeness (2) Task 10 audit-bypass surface (3) dogfood test coverage of real Task harness (4) --json fixture vs real companion (5) acceptance coverage e2e"`
- **duration**: 274,164ms (~4.6분), classification=`ok`, blocking=`false`
- **합치 결론**: **needs-attention** ("No ship. The plan still has an audit hole, an undefined receipt state model, and tests that can pass while the real Task/companion contracts fail."). 3 findings (2 high + 1 medium). Round 2 흡수가 새 시스템 모순을 노출.
- **수용 의향 / 추가 갱신 필요**:
  - **[high-CRITICAL-adjacent] Force-override audit is NOT git-tracked** (Codex finding 1)
    - **Evidence (실측 confirmed in Phase 5.5 verification)**:
      - `.gitignore:24-25` — `# Runtime receipts (working tree only, per plan §3.1 + Codex Q3 default)` + `.claude/receipts/`
      - `git ls-files .claude/receipts/` → 0 tracked files
    - **Implication**: Task 10이 "audit trail은 git-tracked receipt에 영구 보존된다"고 가정했지만, receipt 디렉터리는 의도적으로 working-tree-only로 설계됨 (CLAUDE.md §3.1 + 본 repo의 Codex Q3 default). 사용자가 `MCCP_FORCE_PR_WITHOUT_SECURITY_REVIEWER=1` PR 생성 시 audit signal이 PR/commit에 surface되지 않음 → effectively unauditable bypass.
    - **본 finding은 "auth bypass" CRITICAL 카테고리에 인접** (security-reviewer bypass의 audit hole). Phase 5.5 보수적 stop 발동 권고.
    - **Recommendation (사용자 선택 필요)**:
      - (a) `.claude/receipts/` 전역 .gitignore 유지 + Task 10이 override 사실을 **PR body의 명시적 section** (`## Security Reviewer Override`)에 inject — PR review 시점에 reviewer가 강제 인지. receipt는 ephemeral한 채로 두되 PR body가 audit canonical source.
      - (b) `.gitignore`에 `!.claude/receipts/**/override-*.json` 같은 exception 추가 — override receipt만 git-tracked. CLAUDE.md §3.1 working-tree-only intent와 부분 충돌이나 명시적 audit 필요 case에 한정.
      - (c) Task 10 자체 철회 + 영구 hard-block 유지 + 별도 documented manual recovery path (예: command body local override + 별도 docs/security-reviewer-override-runbook.md).
  - **[high] Override/skipped state precedence undefined** (Codex finding 2)
    - **Implication**: Task 8(`security_skipped` → blocking)과 Task 10(`security_force_override` → warnings only)이 같은 receipt 안에서 충돌. `security_skipped=true && security_force_override=true` 같은 정직한 조합이 valid한지 미명시 → 구현자가 임의로 결정 → 정책 drift.
    - **Recommendation**: receipt meta state matrix 정의를 **Task 11 신규**로 추가. 4-axis: `codex_skipped` × `security_skipped` × `meta.advisory` × `security_force_override`. 각 조합의 verdict (blocking / warning / approving / schema-reject) 명시 + schema invariant + validator precedence tests.
  - **[medium] Fake fixtures do not prove real runtime contracts** (Codex finding 3)
    - **Implication**: Task 5/9의 fake fixture (fake Task harness / fake codex-companion)는 plan-defined shape만 검증. real Task tool schema 또는 real codex-companion `--json` contract drift는 catch 못 함. command body → Task tool → codex-invoke → receipt CLI → validator end-to-end는 unverified.
    - **Recommendation (Task 12 신규 또는 Acceptance 강화)**:
      - dev-environment smoke: real codex-companion `--json` invoke 결과를 fixture와 cross-reference (CI에선 codex 미인증으로 skip 허용, dev에선 mandatory)
      - e2e dogfood: 본 plan 자체에 acceptance step 추가 — `node mock-mccp-plan.js && receipt-cli validate-cmd /mccp:prp-implement --decision <slug> → exit 0`. plan 적용 후 receipt가 schema valid + validator pass임을 매 release마다 확인.
- **거부한 제안**: 없음 (3 findings 모두 valid, recovery path가 plan body 갱신 필요).
- **Codex session 참조**: thread `019e8fb4-f3f2-7182-8542-b08d449e043b`, turn `019e8fb4-fd99-7442-aee8-8d1ce5eb1a50`. duration 274,164ms (~4.6분), classification=`ok`, blocking=`false`, advisory=`false`.
- **DIVERGENT_AT_ROUND_LIMIT**: Round 3 = mccp Phase 5.4의 max 3 rounds cap. 자동 rerun 종료. 추가 갱신은 사용자 결정 후 수동 round 4로 진행.

---

### MCCP-GATE-STOP: Phase 5.5 보수적 발동 (auth-bypass 인접 audit hole) — **RESOLVED**

Finding 1이 auto-CRITICAL 카탈로그의 "auth bypass" 경계에 위치하고 (security review의 audit trail이 실증적으로 ephemeral), Round 3 = max round cap에 도달함. **사용자 결정 받음 (2026-06-04)**:

1. **Finding 1 (audit hole) → PR body audit section inject** (옵션 a 선택). Task 10 갱신 완료 — receipt는 .gitignored 유지 (CLAUDE.md §3.1 working-tree-only intent 보존), PR body의 `## Security Reviewer Override` section이 canonical audit source. reviewer가 merge 전 강제 확인.
2. **Finding 2 (state matrix) → Task 11 신규**. 4-axis state machine + 7개 조합 verdict 표 + `security_skipped && security_force_override` schema-reject invariant + precedence rule.
3. **Finding 3 (real-contract smoke) → Task 12 신규**. real codex-companion `--json` smoke + real Task tool dispatch smoke + e2e dogfood. CI에선 skip-on-unavail, dev에선 mandatory.

**Round 4 codex 재호출 없음** — plan freeze 후 inline 흡수. receipt round 4는 `--codex-skipped --skip-reason "plan-freeze-after-round-3 / finding-1-pr-body-audit / finding-2-task-11 / finding-3-task-12"` 형태로 audit trail에 freeze 정황 명시. 다음 `/mccp:prp-implement`는 round 4 receipt를 advisory(non-approving)로 인지하되 chain integrity 통과.

---

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (R1+R2+R3 + Phase 5.5 RESOLVED freeze, 2026-06-04). No new implement-time decisions detected — Tasks 1-12 enumerate the exact pre-committed scope from Plan-Codex absorption. Cross-gate dedupe applied per Phase 2.5.1.

`MCCP_SKIP_RECEIPT=1` set for this `/mccp:prp-implement` invocation (one-time bypass) — receipt write step deferred; chain integrity restored at the next gated invocation.

---

## Codex Round 1 + Round 2 Findings (Pending Inject in Next Session)

본 세션에서 codex adversarial-review hang을 진단/해결하는 과정에 Codex로부터 받은 2개의 dual-reviewer finding을 보존. 다음 세션의 plan-codex round 2 시점에 위 `## Codex Adversarial Review` 섹션에 정식 inject + 수용/거부 판단 + receipt round 2 발급.

### Round 1 — v0.2.4 Plan Body Review

- **호출**: `node codex-invoke.js adversarial-review --focus "challenge v0.2.4 plan decisions: (1) Skill→Agent invocation pattern for security-reviewer (2) terminal /mccp:pr hard-block on unavailable (3) Phase 5 vs 2.5 numbering cosmetic"`
- **호출 시점 timeout**: 90s (fix 전) → 1차 timeout, retry 180s → 2차 timeout. background bash로 돌렸을 때 verdict 도착 (cold path 아닌 wrapper의 timeout 부족이 root cause)
- **Verdict**: needs-attention
- **Finding [medium]** — Receipt CLI sanity check targets the previous cached version
  - **Location**: `.claude/plans/v0-2-4-phase-7-2-5-restore.plan.md` (Validation block, receipt CLI status command)
  - **Issue**: plan은 v0.2.4 version bump를 명시하지만 receipt CLI regression 명령은 cached `0.2.3` path를 hardcoded. release sanity check가 workspace 변경을 검증 안 할 가능성. acceptance criteria가 그 receipt CLI check에 의존하므로 위험.
  - **Recommendation**: workspace path 또는 install 후 0.2.4 artifact 경로에서 receipt CLI 실행 + version assertion 추가 (잘못된 plugin version 테스트 시 fail).

### Round 2 — Wrapper Timeout Fix End-to-End Verification

- **호출**: `node codex-invoke.js adversarial-review --focus "verify v0.2.4 codex-invoke wrapper timeout bump from 90s to 300s works end-to-end ... any concerns shipping this single change?"`
- **호출 환경**: 900s timeout (fix 후, source DEFAULT_TIMEOUT_MS=300_000 시점에 호출 후 900_000으로 추가 정착)
- **Duration**: 202_315ms (~3.4분), `classification: ok`, `blocking: false`, exit 0
- **Verdict**: needs-attention
- **Finding [medium]** — Wrapper never forwards `--json` mode to the companion
  - **Location**: [plugins/mccp/scripts/lib/codex-invoke.js:142-146](plugins/mccp/scripts/lib/codex-invoke.js#L142-L146) (`invokeAdversarialReview`의 `args` 빌드 로직)
  - **Issue**: command snippets (plan.md/pr.md/prp-implement.md)이 `--json`을 `codex-invoke.js`에 pass하지만 `invokeAdversarialReview`는 companion을 `adversarial-review --wait`로만 launch (base/scope/focus만 append). codex companion 1.0.4에서 `--json`이 structured verdict payload emit하는 flag. forward 안 되면 wrapper success payload의 `stdout`이 rendered markdown — caller가 verdict JSON parse 시도 시 실패. timeout fix는 kill-at-90s 증상만 해결, end-to-end contract는 ambiguous하게 남김.
  - **Recommendation**: wrapper CLI `--json` flag를 opts로 parse + companion에 `--json` forward + fixture test 추가 (fake companion이 `--json` 받는지, wrapper success payload가 structured verdict object 노출하는지 — child가 90s 경계 후 + 300s 경계 전 완료하는 end-to-end fake companion test).

---

## User-Identified Audit Issues (Session 추가 발견)

본 세션 중 사용자가 직접 지적한 ECC/PRP 잔재 audit 결과. Codex round 1/2 finding과 별개 origin (user observation). 다음 세션에서 plan body Tasks에 정식 inject + 우선순위 판단.

### Issue A — `prp-commit.md`가 ECC/PRP 원본 그대로, mccp adaptation 없음

- **Source command**: [plugins/mccp/commands/prp-commit.md](plugins/mccp/commands/prp-commit.md)
- **Observed**:
  - Line 97 — `/prp-pr` (mccp prefix 없음)
  - Line 98 — `/code-review` (mccp prefix 없음)
  - Line 107-112 examples — `/prp-commit` 단독 표기 (자기 자신도 prefix 없이 documentation됨)
  - mccp 게이트 chain integration 본문에 없음:
    - auto-chain.js의 commit → pr 흐름과의 관계 무명시
    - receipt chain (mccp-plan-codex → mccp-implement-codex → mccp-pr-codex) 컨텍스트 없음
    - `/mccp:prp-implement` Phase 7 AUTO-CHAIN과의 연결 없음
- **권장 fix (Task candidate)**:
  - prp-pr.md / review-pr.md의 alias 패턴 mirror (Why this command exists / Forbidden / Standalone mode 섹션 구조)
  - 또는 mccp 게이트 chain의 "chain-aware commit" 변형으로 본문 재작성: auto-chain.js 호출, receipt 검증, /mccp:prp-implement 직후 chain step으로 합류
  - 모든 slash command reference에 `mccp:` prefix 강제

### Issue B — Command 본문 cross-reference의 mccp prefix audit (전체 commands/*.md)

- **Observed (이미 식별된 grep matches)**:
  - `pr.md:92` — "(or any of the legacy `/plan-prd`, `/plan`, PRP workflows when the ECC origin marketplace is also installed)" — 명시적 legacy/conditional 컨텍스트라 OK
  - 나머지 mccp prefix 없는 slash command reference는 audit 필요 (이 task에서 직접 grep)
- **권장 fix (Task candidate)**:
  - grep guard test 추가: `grep -nE "/(prp-|plan|code-review|pr|receipt-)([^:]|$)" plugins/mccp/commands/*.md` → 의도된 legacy/conditional context 외 0건
  - 발견된 모든 잔재를 `/mccp:<cmd>` 또는 canonical name으로 갱신

### Issue C — Skill index 노출 완전성 audit

- **Observed**:
  - System prompt skills list에 `mccp:setup`이 안 보였지만 사용자 invoke는 정상 동작 (이번 세션 검증). marketplace cache는 v0.2.3 commands 전체를 등록한 듯
  - `mccp:prp-commit`도 같은 패턴일 가능성 — 실제 호출 가능한지 확인 필요
- **권장 fix (Task candidate)**:
  - `Glob plugins/mccp/commands/*.md | basename`과 system prompt skills list 자동 비교
  - 누락 케이스 식별 → marketplace cache refresh 또는 plugin manifest 갱신
  - Skill index가 정확히 13 commands(or 14) 노출한다는 회귀 guard test 추가

### Issue D — receipt-gate block이 사용자에게 invisible (silent UX failure)

- **Symptom (사용자 보고, 2026-06-04 세션)**:
  - `/mccp:prp-implement <plan>` 호출 시 명령이 진행되지 않고 응답이 비어 있음 (silent termination, no `[MCCP-RECEIPT-GATE]` echo)
  - `.claude/settings.json`에 `"MCCP_RECEIPT_DEBUG":"1"` 설정되어 있음에도 debug 메시지가 user-visible 채널에 나타나지 않음

- **Reproduction (in-session, fake stdin smoke)**:

  ```bash
  echo '{"command_name":"mccp:prp-implement","command_args":"<plan>","cwd":"<repo>"}' \
    | MCCP_RECEIPT_DEBUG=1 node "${CLAUDE_PLUGIN_ROOT}/scripts/hooks/receipt-prompt.js" 2>&1
  ```

  → hook가 정확하게 `{"decision":"block","reason":"[MCCP-RECEIPT-GATE] ... INVALID mccp-plan-codex: preceding gate has meta.codex_skipped=true (non-approving — Codex did not converge)"}` JSON을 stdout으로 emit. stderr에 `[mccp-receipt-prompt] BLOCK ...` debug도 정상 출력. **즉 hook 자체는 100% 정상 동작**.

- **Root cause (2-layer)**:
  1. **Block reason surface 실패** — Claude Code harness가 UserPromptExpansion hook의 stdout JSON `reason` 필드를 user-visible system 메시지로 항상 surface해 주는 게 아닌 듯. 동일 환경에서 PreToolUse(Skill) hook은 stderr + exit 2 protocol로 user에게 surface되지만, UserPromptExpansion JSON block은 invisible.
  2. **MCCP_RECEIPT_DEBUG stderr 채널 비가시** — `receipt-prompt.js`의 `debug()`는 `process.stderr.write`로 출력 ([receipt-prompt.js:44-48](plugins/mccp/scripts/hooks/receipt-prompt.js#L44-L48)). UserPromptExpansion hook의 stderr는 transcript log로만 흐르고 chat UI 표시 안 됨. 즉 환경변수가 정확히 set되어 있어도 운용 중에는 가치를 못 함.

- **Two-validate-path 함정 (관련 mental model trap)**:
  - `cli.js validate --gate <id>`: 해당 receipt의 plan_hash drift만 검사 → 종종 `ok: true`로 보임
  - `validateCommand("/mccp:prp-implement", ...)` (hook 내부): chain 전체의 approving 여부 검사. `meta.codex_skipped=true` 같은 non-approving meta가 *preceding gate*에 있으면 `blocking[]`에 항목 추가 → BLOCK
  - 사용자가 receipt validate exit 0를 보고 "OK"라 판단하지만 chain validate가 fail하는 비대칭. plan에 명시되어야 함.

- **권장 fix (Task candidate, plan-codex round 4 시점에 정식 inject)**:

  1. **Surface block reason via user-visible channel** — `receipt-prompt.js`가 stdout JSON과 함께 다음 중 하나로 user에게 직접 surface:
     - (a) JSON에 `reason` 필드뿐 아니라 `systemMessage` / `userVisibleMessage` 필드 추가 시도 (Claude Code harness가 지원하는 경우)
     - (b) **fallback: stderr에도 `[MCCP-RECEIPT-GATE] ...` 전문 dump** — UserPromptExpansion stderr가 invisible해도 transcript에 남으므로 사용자가 `~/.claude/projects/<repo>/<session-id>.jsonl` 같은 transcript 직접 검색 가능
     - (c) **hookSpecificOutput.additionalContext에 block 전문 포함** — 현재는 generic 한 문장만 들어가 있음 ([receipt-prompt.js:77](plugins/mccp/scripts/hooks/receipt-prompt.js#L77)). `result.missing/stale/blocking/open_critical` 전체 dump를 additionalContext에 inject하면 Claude가 다음 응답에서 "왜 차단됐는지" 사용자에게 설명 가능.

  2. **MCCP_RECEIPT_DEBUG를 user-visible 채널로 escalate**:
     - debug 출력을 stderr뿐 아니라 `.git/mccp/tmp/receipt-debug.log` 같은 git-ignored persistent file에 동시 mirror. 사용자가 `tail` 또는 IDE로 직접 확인 가능.
     - 또는 `.claude/state/STATE.md`의 "## Last Receipt Gate" 섹션에 가장 최근 block 사실을 매번 갱신 (S10a state-writer reuse) — 다음 세션 SessionStart hook이 자동 inject하므로 "왜 직전 명령이 동작 안 했는지"가 즉시 노출.
     - PreToolUse(Skill) 변형(`receipt-skill.js`)은 이미 exit 2 + stderr로 user-visible — 동일 패턴을 UserPromptExpansion에서도 흉내 (fallback path).

  3. **Two-validate-path 함정 문서화** — `commands/receipt-validate.md`에 `cli.js validate --gate`와 hook 내부 `validateCommand` 차이 명시. README §3.1에도 mental model 추가.

  4. **Smoke test (regression guard)** — `plugins/mccp/scripts/hooks/tests/receipt-prompt-visibility.test.js` 신규 작성:
     - fake stdin으로 block 케이스 simulate
     - assert: (a) stdout JSON 정확한 schema (b) stderr에 `[MCCP-RECEIPT-GATE]` 전문 echo (c) `hookSpecificOutput.additionalContext`에 missing/stale/blocking/critical 전부 포함

- **연관 finding (Codex R4 후보)**:
  - 이 finding은 R3 finding 1 (audit hole)과 같은 family — "gate가 정확히 동작하지만 사용자가 그 사실을 인지 못 함"의 audit/UX hole.
  - Task 10의 PR body audit inject 패턴(`## Security Reviewer Override` section auto-inject)을 receipt block에도 적용 가능: STATE.md에 `## Last Receipt Gate Block` section auto-inject → 다음 세션 부팅 시 사용자가 즉시 인지.

- **Priority**: HIGH — receipt gate가 silent하면 디버깅 가능성이 0에 수렴. Issue A/B/C(cosmetic prefix audit)보다 우선.

---

### Adaptation Status Matrix (audit 시점 snapshot)

| Command | ECC/PRP 잔재 | mccp adaptation 상태 |
|---|---|---|
| `code-review.md` | attribution only | ✅ adapted (Phase 2.5 inline) |
| `plan.md` | ECC origin marketplace informational | ✅ adapted (Phase 5 inline) |
| `pr.md` | legacy `/plan-prd`, `/plan` references (conditional context) | ✅ adapted (Phase 0/2.5 inline) |
| `prp-commit.md` | **mccp prefix 누락 + chain integration 없음** | ⚠ **stale — Issue A** |
| `prp-implement.md` | attribution only | ✅ adapted (Phase 2.5 inline) |
| `prp-pr.md` | 의도적 alias | ✅ adapted (alias) |
| `review-pr.md` | 의도적 alias | ✅ adapted (alias) |
| `setup.md` | 신규 v0.2.3 | ✅ mccp-native |
| `plan-prd.md` | (audit 미수행) | ? |
| `receipt-status/validate/write.md` | (audit 미수행) | ? |
| `santa-loop.md` | (audit 미수행) | ? |

---

### Session State at Hand-Off (이번 세션 종료 시점)

- **Plan-codex receipt round 1**: `.claude/receipts/mccp-plan-codex/main.json` (codex_skipped=true, non-approving, validate exit 2)
- **이번 세션 적용된 hotfix**:
  - `plugins/mccp/scripts/lib/codex-invoke.js:28` — `DEFAULT_TIMEOUT_MS: 90_000 → 900_000` + rationale comment
  - `plugins/mccp/commands/plan.md`, `pr.md`, `prp-implement.md` — `--timeout-ms 90000 → 900000`
- **다음 세션 진입 시 권장 흐름**:
  1. plan body 본 섹션 + 위 fallback 메시지 컨텍스트로 plan-codex round 2 invoke (`/mccp:plan` 재진입 또는 직접 codex-invoke 호출)
  2. Round 1/2 finding 수용/거부 판단 → plan body Tasks 갱신 (수용 시 Task 8/9 추가 가능):
     - Task 8 (Round 2 finding 수용): wrapper `--json` forward + fixture test
     - Task 9 (Round 1 finding 수용): Validation block에 workspace path + version assertion
  3. round 2 receipt 발급 → validate exit 0 확인 → `/mccp:prp-implement` 진입 가능
- **회귀 baseline**: 87 tests pass (`node --test plugins/mccp/scripts/lib/tests/*.test.js plugins/mccp/scripts/hooks/tests/*.test.js plugins/mccp/scripts/state/tests/*.test.js plugins/mccp/scripts/receipt/tests/*.test.js`)

