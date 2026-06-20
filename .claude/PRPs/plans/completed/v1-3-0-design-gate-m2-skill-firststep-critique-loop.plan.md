# Plan: v1.3.0 디자인 게이트 M2 — SKILL First-Step + Critique Retry Loop

**Source PRD**: 없음. 부모 plan `.claude/plans/v1-3-0-design-gate-mechanical-enforcement.plan.md` 의 M2 scope 추출 (M1은 commit `ec4e7a0` + `f043d6b` ship 완료).
**Worktree**: `.worktrees/v1.3.0-prd-status-roll/` (branch `chore/v1.3.0-prd-status-roll`) — 부모 plan Open Question #4의 권장과 충돌하지만 사용자 동의로 본 worktree 사용. M2 ship 전 branch rename 또는 신규 branch 고려는 Open Question에서 재확인.
**Selected Milestone**: M2 (Axis A + B 잔여 — SKILL first-step 강제 + impeccable critique fail 재생성 loop).
**Complexity**: Medium.

## Summary

M1이 detector blind spot(`.js` 미인식) + silent-skip unobservability + validator 의도 분리 세 layer를 receipt + whitelist + audited-escape mutex로 막았다. 이제 M2는 *positive enforcement* 절반 — design surface plan일 때 (a) `frontend-design-direction` SKILL을 Phase 1 ANALYZE 진입 즉시 강제 로드, (b) impeccable critique 결과가 HIGH/CRITICAL severity finding을 surface하면 bounded retry로 plan body 재생성, (c) SKILL.md에 4개 출력 제약 (정보 위계 / 강조색 / raw markdown 금지 / 한 화면 항목 수 상한)을 명시해 critique loop와 mechanical lint (M3) 양쪽이 같은 anchor를 참조. cap 도달 시 `DIVERGENT_UNRESOLVED`로 plan body에 명시.

## 전제 — M1 ship 후 변경된 사실 검증

| 검증 항목 | 결과 | 의미 |
|---|---|---|
| `impeccable-detect.js` `silent_skip` 필드 emit | ✅ live (line 296-305) | M2가 design_signal=true 분기에서 SKILL 호출 강제 가능 — 분기 oracle 신뢰 가능 |
| `DESIGN_SURFACE_PATHS` 7개 whitelist | ✅ live (line 74-82) | 본 plan 산출물 변경 후보 (`commands/*.md`, `lib/impeccable-detect.js`)가 whitelist에 없음 — design_signal=false 가능 → meta dogfood로 retry loop 검증 어려움 (Open Question 참조) |
| `MCCP_DESIGN_CRITIQUE_MAX_RETRY` env 토글 | ❌ 미정의 | M2 신규. default 2. parser/oracle은 `round-budget.test.js` 패턴 mirror |
| SKILL.md 출력 제약 4개 | ❌ 미명시 (92 LOC, "Implementation Guidance" + "Anti-Patterns"만) | M2 Task 1에서 별도 "Output Constraints" 섹션 신설 |
| critique fail 판정 helper | ❌ 미정의 | M2 신규 — `lib/design-critique-decide.js` (severity parse + verdict oracle) |
| receipt schema에 `meta.design_critique_*` 필드 | ❌ 미정의 | M2 신규 — `design_critique_rounds: int` + `design_critique_verdict: enum` 2 필드 additive |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Detect 결과 → oracle | `plugins/mccp/scripts/lib/tests/round-budget.test.js:17-40` | `parseCap(env)` + pure `decide({ findings, round, cap, anyAbsorptionFailure })` 함수. M2의 critique 결과 oracle도 같은 시그니처 — 입력 명시적, 분기 enum 반환. |
| Receipt meta 신규 필드 | `plugins/mccp/scripts/receipt/schema.js` (M1이 추가한 `impeccable_silent_skip`/`_reason` 쌍) | additive only, schema_version 유지. boolean + string\|null pair 또는 int + enum pair. |
| 4 command body 동기 패치 | M1 Task 3+5 (plan.md / prp-implement.md / pr.md / plan-prd.md 4곳 동시) | 같은 decision tree 변경을 4곳에 1:1 mirror. silent_skip forward 패턴 그대로. |
| SKILL.md anchor 섹션 추가 | `plugins/mccp/skills/frontend-design-direction/SKILL.md` "Anti-Patterns" 섹션 (line 66-78) | 새 "## Output Constraints" 섹션 신설 — 4 rule을 sub-list로. Anti-Patterns와 동일 톤. |
| 보안 — env reason validator | M1 audited escape (`IMPECCABLE_FORCE_OVERRIDE_REASON` reject rules — empty/1-token/URL-only/<30자/<3단어) | `MCCP_DESIGN_CRITIQUE_MAX_RETRY` 는 정수 parse만, reason은 무관 — 단 retry 비활성 (`=0`) 시 stderr loud warn. |
| Loud fail-open 로깅 | `plugins/mccp/scripts/state/state-writer.js:93-95` stderr prefix 패턴 | `[mccp:design-critique] retry round=N/cap=M verdict=converged|escalate|divergent ...` |
| Test fixture | `plugins/mccp/scripts/lib/tests/round-budget.test.js` (node:test, in-process) | retry oracle 회귀 fixture — fail/pass/cap-reached 3종. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/skills/frontend-design-direction/SKILL.md` | UPDATE | 새 `## Output Constraints` 섹션 신설 — 4 rule (정보 위계 3단계 / 강조색 화면당 1개 / raw markdown marker 금지 / 한 화면 항목 수 상한 + collapse). M3 output-constraints.js lint가 같은 anchor를 mechanical 검증. 기존 92 LOC + ~30 LOC. |
| `plugins/mccp/scripts/lib/design-critique-decide.js` (NEW) | CREATE | Pure-function oracle. `parseRetryCap(env) → int (default 2, range 0-3)` + `normalizeSeverity(raw) → enum` + `SEVERITY_ALIASES` map + `decideCritique({ findings, round, cap }) → 'CONVERGED' \| 'ESCALATE_NEXT_ROUND' \| 'DIVERGENT_UNRESOLVED'`. UNKNOWN severity는 fail-closed. `round-budget.test.js` 구조 mirror. dep-free. **Codex R1 F2 absorption**. |
| `plugins/mccp/scripts/lib/tests/design-critique-decide.test.js` (NEW) | CREATE | 회귀 fixture **9종** (F2 absorption — 6→9): 기본 6 + (7) lowercase critical normalize, (8) missing/null/P1-alias, (9) parse failure → DIVERGENT (fail-closed). |
| `plugins/mccp/scripts/lib/impeccable-detect.js` | UPDATE | **F1 absorption**: `DESIGN_SURFACE_PATHS`에 3 path 추가 (좁은 control-plane만): `plugins/mccp/scripts/lib/impeccable-detect.js`, `plugins/mccp/scripts/lib/design-critique-decide.js`, `plugins/mccp/skills/frontend-design-direction/`. `commands/*.md` 전체는 overshoot으로 제외. detector 자기-적용 의무 + 본 M2 plan 자기-재현 방지. |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `meta` block에 `design_critique_rounds: int\|null` + `design_critique_verdict: 'converged'\|'divergent'\|'skipped'\|null` + **(F1 absorption)** `design_intent_reason: string\|null` (M1 reason validator 룰 mirror) + **(F3 absorption)** `pr_design_chain_skip_reason: string\|null` 4 필드 추가. additive — schema_version 유지. M1 `impeccable_silent_skip` 쌍과 동일 패턴. |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | `--design-critique-rounds <int>` + `--design-critique-verdict <enum>` + **(F1)** `--design-intent-reason <reason>` + **(F3)** `--pr-design-chain-skip-reason <reason>` 4 플래그 추가. write path forward + reason validator 4종 룰 적용 (empty/1-token/URL-only/<30자/<3단어 reject). |
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATE | **F3 absorption — chain-check**: `mccp-pr-codex` validate 시 prior `mccp-plan-codex` + `mccp-implement-codex` receipt 조회 → `design_critique_verdict='divergent'`이면 blocking push. `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape (M1 룰 mirror)이 set + reason pass 시 advisory mode. `mccp-plan-codex` / `mccp-implement-codex` 자체 validate는 기존대로 warning surface. |
| `plugins/mccp/commands/plan.md` | UPDATE | (1) Phase 1 ANALYZE 입구에 **3-axis trigger** (detector / 좁은 whitelist / `MCCP_DESIGN_INTENT_REASON` audited) — F1 absorption. SKILL `Read` first-step 강제. (2) Phase 5.0 `SKILL_AVAIL=1 SIGNAL=1` 분기를 critique invoke → fail 시 retry loop (max `MCCP_DESIGN_CRITIQUE_MAX_RETRY` 회)으로 확장. (3) retry 결과 + intent reason을 5.6 receipt-write에 forward. |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | Phase 2.5.5 (impeccable decision tree) 에 동일 3-axis trigger + retry loop wire. implement-time critique은 산출 코드/diff 기반 — plan body 재생성 대신 implement body 수정. cap 도달 시 fix-task.md append + receipt verdict stamp. |
| `plugins/mccp/commands/plan-prd.md` | UPDATE | Phase 5 (impeccable) 에 동일 3-axis trigger + retry loop wire. PRD body 재생성. |
| `plugins/mccp/commands/pr.md` | UPDATE | **F3 absorption**: Phase 1.6 — critique invoke **제거** + 대신 Task 5(b) chain-check 호출 (prior receipt verdict 검증). divergent 발견 시 STOP exit 1, gh 미호출. `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape만 advisory mode 허용. `MCCP_DESIGN_CRITIQUE_MAX_RETRY` env는 pr scope에서 무시(retry 없음). |
| `.claude/cache/test-fixture-status.html` (NEW) | CREATE | **F4 absorption — Task 10 pre-ship dogfood**. 합성 design-surface fixture 1줄. detector positive trigger 확보용. gitignore 면제 (테스트 산출물). |
| `plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js` (NEW) | CREATE | **F4 absorption**: end-to-end retry loop 회귀 — `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0\|1` 양 시나리오 + receipt `rounds` / `verdict` stamp 확인 + Phase 5.0 stderr loud warn assertion. |
| `CLAUDE.md` | UPDATE | §3.9 신설 — "디자인 surface 변경 시 SKILL first-step + critique retry loop" 흐름 + 3-axis trigger 설명 + `MCCP_DESIGN_CRITIQUE_MAX_RETRY` + `MCCP_DESIGN_INTENT_REASON` + `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` + `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL` env 토글 + 4 출력 제약 명시. §4 cheat sheet "운영 토글" 블록에도 4 env 추가. |
| `.claude/plans/v1-3-0-design-gate-m2-skill-firststep-critique-loop.plan.md` | CREATE | (이 파일) |

## Tasks

### Task 1: SKILL.md에 "Output Constraints" 섹션 추가

- **Action**: `plugins/mccp/skills/frontend-design-direction/SKILL.md` "Anti-Patterns" 섹션(line 66) 뒤에 새 `## Output Constraints` 섹션 inject. 4 rule을 sub-list로:
  1. **정보 위계 3단계** — primary action → status → detail 순. heading depth ≤ 3 in primary surface.
  2. **강조색 화면당 1개** — accent color/highlight 토큰 use count ≤ 1 per viewport.
  3. **raw markdown marker 금지** — `**bold**`, `_italic_`, MD0xx warning, 미렌더 inline code 등이 surface로 노출되면 안 됨.
  4. **한 화면 항목 수 상한** — Open Questions 등 list-of-N 섹션은 상위 3개 expanded + 나머지 `<details><summary>+N more</summary>` collapse.
- **Mirror**: 기존 "Anti-Patterns" 섹션 톤. "Do not" 명령형 + 1줄 설명.
- **Validate**: `grep -c "## Output Constraints" plugins/mccp/skills/frontend-design-direction/SKILL.md` → 1.

### Task 2: `design-critique-decide.js` pure-function oracle (Codex R1 F2 absorption — severity normalization 강제)

- **Action**: `plugins/mccp/scripts/lib/design-critique-decide.js` 신규. exports:
  ```js
  const SEVERITY_ALIASES = {
    'CRITICAL': 'CRITICAL', 'CRIT': 'CRITICAL', 'P0': 'CRITICAL', 'BLOCKING': 'CRITICAL', 'BLOCKER': 'CRITICAL',
    'HIGH': 'HIGH', 'H': 'HIGH', 'P1': 'HIGH', 'MAJOR': 'HIGH',
    'MEDIUM': 'MEDIUM', 'MED': 'MEDIUM', 'M': 'MEDIUM', 'P2': 'MEDIUM',
    'LOW': 'LOW', 'L': 'LOW', 'P3': 'LOW', 'MINOR': 'LOW',
  };
  function normalizeSeverity(raw) {
    const key = String(raw == null ? '' : raw).trim().toUpperCase();
    if (key === '') return 'UNKNOWN';
    return SEVERITY_ALIASES[key] || 'UNKNOWN';
  }
  function parseRetryCap(env) {
    const raw = (env && env.MCCP_DESIGN_CRITIQUE_MAX_RETRY) || '2';
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 3) return 2;
    return n;
  }
  function decideCritique({ findings, round, cap }) {
    // F2 absorption — conservative: UNKNOWN severity counts as failing.
    // capture schema 미정 환경에서 silently CONVERGED 방지.
    if (!Array.isArray(findings)) return 'DIVERGENT_UNRESOLVED'; // F2 absorption — parse fail → fail-closed
    const failing = findings.filter(function (f) {
      const sev = normalizeSeverity(f && f.severity);
      return sev === 'CRITICAL' || sev === 'HIGH' || sev === 'UNKNOWN';
    });
    if (failing.length === 0) return 'CONVERGED';
    if (round < cap) return 'ESCALATE_NEXT_ROUND';
    return 'DIVERGENT_UNRESOLVED';
  }
  module.exports = { parseRetryCap, decideCritique, normalizeSeverity, SEVERITY_ALIASES };
  ```
  Dep-free, pure, side-effect-free.
- **Mirror**: `plugins/mccp/scripts/lib/tests/round-budget.test.js:17-40` — 같은 시그니처 + enum 반환. M1 `validatePlanPathSafety` 같은 fail-closed 보수성.
- **Validate**:
  - `node -e "const {decideCritique} = require('./plugins/mccp/scripts/lib/design-critique-decide.js'); console.log(decideCritique({findings:[{severity:'HIGH'}], round:1, cap:2}))"` → `ESCALATE_NEXT_ROUND`.
  - `node -e "const {decideCritique} = require('./plugins/mccp/scripts/lib/design-critique-decide.js'); console.log(decideCritique({findings:[{severity:'critical'}], round:0, cap:2}))"` → `ESCALATE_NEXT_ROUND` (F2 — lowercase alias).
  - `node -e "const {decideCritique} = require('./plugins/mccp/scripts/lib/design-critique-decide.js'); console.log(decideCritique({findings:[{}], round:0, cap:2}))"` → `ESCALATE_NEXT_ROUND` (F2 — missing severity → UNKNOWN → fail).

### Task 3: `design-critique-decide.test.js` 9 fixture 회귀 (Codex R1 F2 absorption — 6→9 case 확장)

- **Action**: `plugins/mccp/scripts/lib/tests/design-critique-decide.test.js` 신규. node:test 9 case:
  1. `findings=[]` → CONVERGED.
  2. `findings=[{severity:'HIGH'}]`, round=1, cap=2 → ESCALATE_NEXT_ROUND.
  3. `findings=[{severity:'HIGH'}]`, round=2, cap=2 → DIVERGENT_UNRESOLVED.
  4. `findings=[{severity:'CRITICAL'}]`, round=0, cap=2 → ESCALATE_NEXT_ROUND.
  5. `findings=[{severity:'LOW'},{severity:'MEDIUM'}]` → CONVERGED (HIGH/CRITICAL 외 무시).
  6. `parseRetryCap({MCCP_DESIGN_CRITIQUE_MAX_RETRY:'invalid'})` → 2 (default fallback).
  7. **F2-A** `findings=[{severity:'critical'}]`, round=0, cap=2 → ESCALATE_NEXT_ROUND (lowercase alias normalize).
  8. **F2-B** `findings=[{},{severity:'P1'},{severity:null}]`, round=0, cap=2 → ESCALATE_NEXT_ROUND (missing/null + P1 alias → HIGH).
  9. **F2-C** `findings=null` (parse failure) → DIVERGENT_UNRESOLVED (fail-closed, caller 책임).
- **Mirror**: `round-budget.test.js` 패턴 (node:test, assert.strictEqual).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/design-critique-decide.test.js` 9/9 pass.

### Task 4: receipt schema + cli에 critique trail 필드 추가

- **Action**: `schema.js` `meta` block에:
  - `design_critique_rounds: int|null` (실행한 round 수, 0~cap 범위)
  - `design_critique_verdict: 'converged'|'divergent'|'skipped'|null` (CONVERGED|DIVERGENT_UNRESOLVED|critique 실행 안 됨)
  additive — schema_version 유지. `cli.js` write path에 `--design-critique-rounds` + `--design-critique-verdict` 플래그 forward.
- **Mirror**: M1 `impeccable_silent_skip` + `impeccable_silent_skip_reason` 쌍 패턴.
- **Validate**:
  - `node plugins/mccp/scripts/receipt/cli.js write --gate mccp-plan-codex --decision test --plan /tmp/test.md --design-critique-rounds 2 --design-critique-verdict converged --quiet` → valid receipt + 2 필드 stamped.
  - 기존 legacy receipt (두 필드 없음) → validate pass (additive 회귀 0).

### Task 5: `validate-cmd.js`에 critique chain-check + verdict surfacing (Codex R1 F3 absorption — PR scope BLOCK)

- **Action**:
  - **(a) lenient surface (기존)** `mccp-plan-codex` / `mccp-implement-codex` validate 시 `design_critique_verdict === 'divergent'`이면 `warnings[].push({ kind: 'design_critique_divergent', message: '...' })`. 해당 gate 단계에서는 retry loop이 자기 단계 안에서 처리 가능하므로 warning surface로 충분.
  - **(b) chain-check (F3 absorption)** `mccp-pr-codex` validate 시 **prior receipt chain 조회** (`mccp-plan-codex/<slug>.json` + `mccp-implement-codex/<slug>.json`)을 읽어 `design_critique_verdict` 필드 검증. 어느 한쪽이라도 `'divergent'`이면 `blocking[].push({ kind: 'design_critique_chain_divergent', message: '...', prior_gate: '<gate>', prior_verdict: 'divergent' })` — PR 게이트 BLOCK. `IMPECCABLE_FORCE_OVERRIDE_REASON` 또는 신규 `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="<reason>"` audited escape (M1 validator 룰 mirror — empty/1-token/URL-only/<30자/<3단어 reject) 활성 시에만 advisory mode 전환.
  - prior receipt가 부재 또는 `design_critique_verdict=null` (legacy) → no chain-check 적용 (회귀 0).
- **Mirror**: M1 `impeccable_silent_skip` warning 분기 + `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` audited escape 룰.
- **Validate**:
  - Fixture A: plan-codex receipt `verdict=divergent` + pr-codex validate → `blocking` push, exit non-zero.
  - Fixture B: plan-codex + implement-codex 둘 다 `verdict=converged` + pr-codex validate → no blocking.
  - Fixture C: `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="cherry-pick from external main, design surface unchanged"` set + chain divergent → advisory mode (`warnings`, exit 0). reason validator pass 검증.
  - Fixture D: legacy receipt (`design_critique_verdict` 필드 부재) → no chain-check, exit 0 (회귀 0).
  - Fixture E: `design_critique_verdict='converged'` plan/implement, plain receipt → no warning.

### Task 6: plan.md / prp-implement.md / plan-prd.md Phase 입구에 SKILL first-step Read 강제 — 3-axis trigger (Codex R1 F1 absorption)

- **Action**: 3-axis trigger — **어느 한 축이라도 hit** 시 SKILL Read first-step + 4 출력 제약 참조 강제. F1 absorption: 본 plan 자체가 detector 사각지대(`commands/*.md` + `lib/impeccable-detect.js` 변경)에 들어가는 회귀를 차단.
  - **(a) detector positive (기존)** `impeccable-detect.js detect --mode plan --plan <path>` → `design_signal=true && skill_available=true`이면 trigger.
  - **(b) 좁은 whitelist 확장 (F1 absorption — design-gate control-plane만)** `DESIGN_SURFACE_PATHS`에 3개 추가:
    - `plugins/mccp/scripts/lib/impeccable-detect.js`
    - `plugins/mccp/scripts/lib/design-critique-decide.js` (M2 신규)
    - `plugins/mccp/skills/frontend-design-direction/`
    *Codex F1 제3 옵션 "expand the whitelist to those files"의 좁은 적용 — `commands/*.md` 전체는 overshoot이므로 제외. 위 3 path는 detector/oracle/critique anchor 자체이므로 변경 시 critique loop 자기-적용 의무.*
  - **(c) audited intent override (F1 absorption — option 2)** 신규 env `MCCP_DESIGN_INTENT_REASON="<reason>"` set + reason validator pass(M1 `IMPECCABLE_FORCE_OVERRIDE_REASON` 룰 mirror — empty/1-token/URL-only/<30자/<3단어 reject) → trigger 강제. 사용자가 "본 plan은 디자인 제어 흐름 변경이지만 detector가 못 잡는 영역" 명시 시 active.
  - **plan.md Phase 1 ANALYZE**: 3-axis trigger 검사 → 어느 하나 hit 시 Phase 4 WRITE 진입 *직전*에 `Read("plugins/mccp/skills/frontend-design-direction/SKILL.md")` 강제. Phase 4 WRITE 본문에 "Output Constraints (SKILL §)" 참조 명시 의무.
  - free-form input 모드: Phase 4 WRITE 직후 detect + intent env 재검사 — trigger hit 시 retroactive Read + 위반 시 Phase 4 재진입(1회).
  - **prp-implement.md Phase 2 (산출 시작 전)**: `detect --mode implement` (worktree diff 기반) + intent env + 좁은 whitelist → 동일 logic.
  - **plan-prd.md Phase 5**: 동일.
- **Mirror**: M1 Task 3 silent-skip forward 패치 + `IMPECCABLE_FORCE_OVERRIDE_REASON` reason validator.
- **Validate**:
  - Fixture A (axis a): design surface path 포함한 plan body → SKILL.md read trace + Phase 4 WRITE 본문에 "Output Constraints" 참조 1회 이상.
  - Fixture B (axis b — F1 회귀 차단): `plugins/mccp/scripts/lib/impeccable-detect.js` 변경 plan → SKILL.md read trace + 본 M2 plan의 자기-재현 케이스 차단 검증.
  - Fixture C (axis c — audited override): `MCCP_DESIGN_INTENT_REASON="기존 detector가 못 잡는 design-gate routing 변경 — SKILL critique 자기적용 의무"` set + pure-backend plan → SKILL.md read trace + receipt에 `meta.design_intent_reason` stamp.
  - Fixture D (audited override reason validator): `MCCP_DESIGN_INTENT_REASON="yes"` (1-token) → reason reject + trigger 비활성 + stderr warn.
  - Fixture E (회귀 0): pure-backend plan (`scripts/state/state-writer.js` 등 어느 trigger도 hit 안 됨) → SKILL.md read trace 0회.

### Task 7: plan.md Phase 5.0 critique retry loop wire

- **Action**: `plan.md` Phase 5.0 `SKILL_AVAIL=1 SIGNAL=1` 분기 (line 369) 를 다음으로 확장:
  ```bash
  CAP=$(node -e "console.log(require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/design-critique-decide').parseRetryCap(process.env))")
  ROUND=0
  while [ $ROUND -le $CAP ]; do
    # Invoke Skill(impeccable, "critique <plan slug>")
    # Capture critique findings → JSON-ish array
    # VERDICT=$(node -e "...decideCritique({findings, round:$ROUND, cap:$CAP})...")
    # if CONVERGED: break
    # if ESCALATE: increment ROUND, Edit plan body per critique actionable instruction, loop
    # if DIVERGENT: break with annotation
    ROUND=$((ROUND+1))
  done
  # Append "## Design Critique" with final result + retry trail to plan body
  # Forward --design-critique-rounds $ROUND --design-critique-verdict <enum> to 5.6 receipt-write
  ```
  Edit-then-retry-critique loop의 핵심 invariant — critique findings에 명시된 위치(섹션/anchor)만 Edit, plan body 전체 재생성 금지 (Phase 4 cyclic 회피).
- **Mirror**: Phase 5.4 round-budget loop (R1/R2/R3 cap 패턴).
- **Validate**:
  - Fixture A: design surface plan + critique pass at R0 → `design_critique_rounds=1`, `verdict=converged`, plan body에 critique 1건.
  - Fixture B: 의도적으로 위계 무너진 plan body → R0 fail → R1 edit → pass → `rounds=2`, `verdict=converged`.
  - Fixture C: cap=0 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY=0`) → R0 fail → 즉시 DIVERGENT → `rounds=1`, `verdict=divergent`.

### Task 8: prp-implement.md retry loop mirror + plan-prd.md mirror + pr.md chain-check only (Codex R1 F3 absorption — PR scope critique invoke 제거)

- **Action**:
  - `prp-implement.md` Phase 2.5.5: 같은 loop, 단 Edit 대상이 plan body 아닌 산출 code/diff. cap 도달 시 fix-task.md에 critique 미해소 항목 append + receipt `design_critique_verdict='divergent'` stamp (downstream PR이 chain-check로 BLOCK).
  - `plan-prd.md` Phase 5: PRD body 재생성. Edit 위치는 critique이 명시한 PRD 섹션.
  - **`pr.md` Phase 1.6 (F3 absorption — critique invoke 제거 + chain-check 강제)**: PR scope에서 critique을 **호출하지 않음**. 대신 Task 5(b) chain-check logic을 preflight로 실행 — prior `mccp-plan-codex` + `mccp-implement-codex` receipt의 `design_critique_verdict` 검증. 어느 한쪽이라도 `'divergent'`이면 STOP exit 1 (`[MCCP-GATE-STOP] design-critique chain divergent: <prior_gate>=<verdict>` + 복구 안내 `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="<reason>"` audited escape 명시). `pr.md`는 critique을 자기 단계에서 실행하지 않으므로 retry cap 무관 + dual-review invariant 보호 + cross-gate dedupe 안전. 기존 `MCCP_DESIGN_CRITIQUE_MAX_RETRY` env는 pr.md scope에서 무시(`pr.md` 본문에 명시).
- **Mirror**: Task 7 plan.md 패턴 + M1 `MCCP_PR_SKIP_CODEX_REVIEW` audited escape의 reason validator 룰.
- **Validate**:
  - prp-implement: implement-time fixture (1건) → retry 후 산출 fix 또는 fix-task.md append + receipt verdict stamp.
  - pr Fixture A: prior plan-codex receipt `verdict=divergent` → pr.md Phase 1.6 preflight STOP exit 1, gh 호출 없음, receipt 미작성.
  - pr Fixture B: prior plan-codex + implement-codex 모두 `verdict=converged` → pr.md preflight pass, PR 생성 정상.
  - pr Fixture C: `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="cherry-pick from external branch with prior design-critique receipt unavailable — manual visual review at https://example.com/screenshot.png done"` + chain divergent → advisory mode (receipt에 `meta.pr_design_chain_skip_reason` stamp + PR body footer에 `## Design Critique Chain Skipped` section auto-inject).
  - pr Fixture D: `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN="yes"` (1-token reason) → schema reject + preflight STOP, advisory mode 진입 불가.

### Task 9: CLAUDE.md §3.9 신설 + §4 cheat sheet 환경변수 추가

- **Action**:
  - `CLAUDE.md` §3.8 뒤에 새 절 `§3.9 디자인 surface 변경 시 SKILL first-step + critique retry loop`:
    - **언제 trigger**: `impeccable-detect.js` design_signal=true && skill_available=true 시.
    - **어떻게**: Phase 1 ANALYZE 입구에 SKILL.md `Read` 강제 → Phase 4 WRITE에 4 출력 제약 mention 의무 → Phase 5.0이 critique loop 실행.
    - **bounded retry**: default 2, `MCCP_DESIGN_CRITIQUE_MAX_RETRY=0|1|2|3` 토글.
    - **kill switch**: `MCCP_DESIGN_CRITIQUE_MAX_RETRY=0` → critique 1회만 + verdict DIVERGENT 즉시.
    - **출력 제약 4개**: SKILL.md `## Output Constraints` 참조.
  - `CLAUDE.md` §4 cheat sheet "운영 토글" 블록에 `MCCP_DESIGN_CRITIQUE_MAX_RETRY` 항목 추가.
- **Mirror**: §3.7 (plugin.json bump) / §3.8 (worktree 컨벤션) — 룰 + 왜 + 언제/어떻게 + hot-fix 절차 구조.
- **Validate**: `grep -c "§3.9\|## 3.9\|MCCP_DESIGN_CRITIQUE_MAX_RETRY" CLAUDE.md` ≥ 3.

### Task 10: 합성 fixture pre-ship dogfood (Codex R1 F4 absorption — retroactive-confirm → pre-ship gate 승격)

- **Action — pre-ship 필수 (M2 acceptance gate)**:
  1. **합성 design-surface fixture 생성** — `.claude/cache/test-fixture-status.html` 1줄 commit (또는 `plugins/mccp/skills/frontend-design-direction/SKILL.md`의 신규 `## Output Constraints` 섹션 자체) 변경으로 Task 6 axis (b) 좁은 whitelist trigger 강제. 이 변경은 합성이지만 design surface 실제 hit이므로 detector positive.
  2. **강제 fail 시나리오 mock** — `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=1` (M2 신규 test env) 활성 시 critique invoke 결과를 `[{severity:'HIGH', title:'mock', body:'mock', ...}]` 강제 주입 → oracle decideCritique → ESCALATE_NEXT_ROUND 첫 round + cap 도달 시 DIVERGENT_UNRESOLVED 검증.
  3. **end-to-end retry loop 실증** — `/mccp:plan` 호출 → Task 6 SKILL Read fired + Phase 5.0 critique loop fired + retry round ≥ 1 + receipt write 시 `design_critique_rounds ≥ 1` + `design_critique_verdict ∈ {converged, divergent}` 양쪽 시나리오 (force_fail=0/1) record.
  4. **회귀 fixture로 commit** — `plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js` (또는 integration test) 추가, M2 acceptance gate에서 실행.
  5. retroactive confirm (다음 design-touching cycle에서의 receipt 확인)은 *추가* 검증으로 유지 — pre-ship dogfood + retroactive 양축으로 보장.
- **Mirror**: 부모 plan M4 Task 12 패턴 + M1 fixture-driven validate (Codex F2 absorption note의 "self-sufficient wedge" 원칙).
- **Validate**:
  - Pre-ship A: `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0` + 합성 fixture trigger → receipt `rounds=1, verdict=converged`.
  - Pre-ship B: `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=1` + cap=2 → receipt `rounds=2, verdict=divergent`, Phase 5.0 stderr loud warn 명시.
  - Pre-ship C: 신규 `design-critique-loop-e2e.test.js` 회귀 fixture pass.
  - Retroactive (post-ship): 다음 design-touching cycle에서 receipt `design_critique_rounds ≥ 1` + verdict ∈ {converged, divergent} 확인 — pre-ship 검증의 *추가* 안전망.

## Validation

```bash
# Task 1 — SKILL.md anchor 추가
grep -c "^## Output Constraints$" plugins/mccp/skills/frontend-design-direction/SKILL.md

# Task 2+3 — oracle + 회귀 fixture (F2 absorption — 9 case)
node --test plugins/mccp/scripts/lib/tests/design-critique-decide.test.js

# Task 4 — receipt schema + cli forward (4 신규 필드)
node plugins/mccp/scripts/receipt/cli.js write --gate mccp-plan-codex --decision test --plan /tmp/test.md \
  --design-critique-rounds 2 --design-critique-verdict converged --quiet
node plugins/mccp/scripts/receipt/cli.js validate --command mccp:prp-implement

# Task 5 — validate-cmd chain-check + audited escape (F3 absorption)
# (fixture 작성 후) node --test plugins/mccp/scripts/receipt/tests/validate-cmd-design-critique.test.js

# Task 6 — 3-axis trigger (F1 absorption)
# (fixture 작성 후) node --test plugins/mccp/scripts/lib/tests/impeccable-detect-design-gate-control-plane.test.js

# Task 7+8 — command body retry loop + pr chain-check
# (live dogfood — Task 10 pre-ship integration test로 강제 검증)

# Task 9 — CLAUDE.md (4 신규 env 토글)
grep -nE "§3.9|MCCP_DESIGN_CRITIQUE_MAX_RETRY|MCCP_DESIGN_INTENT_REASON|MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN|MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL" CLAUDE.md

# Task 10 — pre-ship end-to-end dogfood (F4 absorption — M2 acceptance gate)
MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0 node --test plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js
MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=1 node --test plugins/mccp/scripts/lib/tests/design-critique-loop-e2e.test.js

# 회귀 0
node --test plugins/mccp/scripts/**/*.test.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| critique retry loop이 cyclic Phase 4 재진입 트리거 → 무한루프 | MEDIUM | Task 7 invariant: critique은 plan body의 *명시된 섹션*만 Edit (Phase 4 재진입 금지). cap (default 2) 도달 시 DIVERGENT 즉시 break. |
| SKILL first-step 강제(Task 6) 가 design 무관 plan에도 trigger → SKILL.md 노이즈 read | LOW | 3-axis trigger 모두 false인 plan은 trigger 안 됨. Task 6 Fixture E (pure-backend) 회귀. |
| critique fail 판정 false-positive — minor finding을 HIGH로 잘못 인식 (~~F2 미흡~~ → F2 absorption: UNKNOWN→fail) | LOW (F2 absorption 후) | Task 2 oracle은 normalize + alias + UNKNOWN=fail-closed. Task 3 9 fixture로 lowercase/missing/parse-fail 회귀 차단. |
| PR scope에서 retry 활성 시 cross-gate dedupe 깨짐 | HIGH (Task 8 잘못 설계 시) | F3 absorption: pr.md는 critique invoke 자체 제거 + chain-check만 실행. retry 0회 — invariant 보호. |
| `MCCP_DESIGN_CRITIQUE_MAX_RETRY=0` 도 정상 path로 통과시키면 silent disable과 동치 | LOW | `=0` 시 R0 critique은 실행 + verdict=DIVERGENT 강제 + stderr loud warn. silent disable 불가. |
| ~~본 plan 자체는 design_signal=false → critique loop dogfood 어려움~~ → **F4 absorption으로 해소** | n/a (F4 absorption 후) | Task 10이 pre-ship gate로 승격 — 합성 fixture + `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL` env + e2e test 회귀 fixture로 ship-time 보장. retroactive는 추가 안전망. |
| receipt schema additive에도 기존 receipt validate 깨지는 silent regression | LOW | Task 4 additive only, schema_version 유지. legacy receipt validate 회귀 fixture. |
| critique 결과 안 actionable instruction이 명확하지 않아 Edit 대상 모호 → loop 진행 못 함 | MEDIUM | Task 7 fallback: critique이 actionable instruction을 명시하지 않으면 verdict=DIVERGENT 즉시 (loud stderr warn). impeccable Skill prompt에 "actionable, section-anchored fix" 명시. |
| **(F1 absorption 신규)** 좁은 whitelist 확장이 design-gate control-plane만 hit하다 ※ overshoot risk | LOW (3 path 좁게 한정) | 추가 3 path는 detector/oracle/critique anchor 자체. `commands/*.md` 전체 제외로 overshoot 회피. Task 6 Fixture B로 회귀 검증. |
| **(F3 absorption 신규)** chain-check이 prior receipt 없는 cherry-pick PR 차단 → false-positive | MEDIUM | `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape (reason validator — empty/1-token/URL-only/<30자/<3단어 reject)으로 회복. Task 8 Fixture C/D 회귀. |
| **(F4 absorption 신규)** `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL` test env가 production fail-injection 통로 → 안전성 위험 | LOW | test env명 자체 `_TEST_` prefix로 audit. e2e test가 fixture-scoped. production code path는 env 무관 — critique invoke 결과만 mock. `MCCP_RECEIPT_DEBUG=1` set 시 stderr loud warn 강제. |

## Acceptance

- [ ] Task 1: SKILL.md에 `## Output Constraints` 섹션 4 rule 명시.
- [ ] Task 2+3 (F2 absorption): `design-critique-decide.js` (normalize + alias + UNKNOWN=fail) + 9 fixture pass.
- [ ] Task 4: receipt schema + cli에 4 신규 필드 (`design_critique_rounds`, `design_critique_verdict`, `design_intent_reason`, `pr_design_chain_skip_reason`) stamp 가능. reason validator 4종 룰 (empty/1-token/URL-only/<30자/<3단어) reject 동작. legacy receipt 회귀 0.
- [ ] Task 5 (F3 absorption): validate-cmd가 (a) `verdict=divergent` 시 warnings push (lenient gate), (b) `mccp-pr-codex` validate 시 chain-check로 prior receipt verdict 검증 → blocking push, (c) `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape advisory mode 동작.
- [ ] Task 6 (F1 absorption): 4 command body Phase 입구에 **3-axis trigger** (detector positive / 좁은 whitelist / `MCCP_DESIGN_INTENT_REASON`) 모두 SKILL Read first-step 강제. Fixture A~E 5건 모두 pass.
- [ ] Task 7: plan.md retry loop 3 fixture (pass-at-R0 / fail-then-pass / cap-reached) live.
- [ ] Task 8 (F3 absorption): prp-implement.md / plan-prd.md mirror live; pr.md는 critique invoke 제거 + chain-check만 (Fixture A~D 4건).
- [ ] Task 9: CLAUDE.md §3.9 신설 + cheat sheet 4 env 항목 + 4 출력 제약 명시.
- [ ] Task 10 (F4 absorption — **M2 acceptance gate**): 합성 fixture + `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL=0\|1` 양 시나리오 e2e test pass + receipt `rounds`/`verdict` record. ship 전 필수.
- [ ] 회귀 0: 기존 derive/renderer/receipt test 모두 pass.
- [ ] `plugin.json` patch bump (1.6.1 → 1.6.2) 또는 M3와 묶을 시 minor bump (1.6.x → 1.7.0) — Open Question.

## Open Questions

> Codex R1 absorption 후 — 일부 Q는 absorption으로 결정됨 (resolved 표기). 잔여 OQ만 사용자 확인 필요.

**잔여 (사용자 결정 필요)**:

1. **본 worktree (`chore/v1.3.0-prd-status-roll`) 적합성** — 부모 plan Open Question #4에서 "branch rename 권장"이었으나 M1을 본 branch에 ship 완료. M2도 같은 branch에 squash 시 cycle suffix가 branch 이름과 misalign. 권장: M2를 위한 신규 branch (`v1.3.0-design-gate-m2-skill-firststep`) + 신규 worktree (`.worktrees/v1.3.0-design-gate-m2/`). 본 worktree는 housekeeping용으로만 유지.
2. **plugin.json bump 시점** — Task 9까지 완료 시 patch bump (1.6.1 → 1.6.2) vs M3까지 묶어 minor bump (→ 1.7.0)? M3은 별도 cycle 후보 → 권장: M2 단독 ship 시 patch (1.6.2).

<details><summary>+3 more — Codex R1 absorption으로 결정됨 (검토용 archive)</summary>

3. ~~**critique fail 판정 boundary** — HIGH/CRITICAL만 vs MEDIUM 포함~~ → **F2 absorption 후 결정됨**: HIGH/CRITICAL/UNKNOWN(missing severity)만 fail-closed. MEDIUM 미포함 유지 (false-positive 폭주 회피). UNKNOWN까지 포함은 fail-closed 보수성.
4. ~~**Edit 대상 명세 강도** — 섹션만 vs 전체 재생성~~ → 권장 유지 (명시 섹션만, Phase 4 cyclic 회피). Task 7 invariant.
5. ~~**pr.md retry 비활성 강제 강도** — env override 허용 vs cap=0 강제~~ → **F3 absorption으로 재정의됨**: pr.md는 critique invoke 자체 제거 + chain-check만 실행. retry cap 무관. `MCCP_PR_SKIP_DESIGN_CRITIQUE_CHAIN` audited escape이 회복 경로. Open Question 자체가 stale.
6. ~~**Self-dogfood 한계 회피 전략** — retroactive vs scope creep~~ → **F4 absorption으로 재정의됨**: Task 10이 pre-ship gate로 승격. 합성 fixture (`.claude/cache/test-fixture-status.html`) + `MCCP_DESIGN_CRITIQUE_TEST_FORCE_FAIL` test env + e2e test로 ship-time 보장. retroactive는 추가 안전망.

</details>

---

## Design Critique

> Target resolution: 본 plan은 backend/infra spec — 실제 design surface 없음. detector overshoot로 `design_signal=true` (`.claude/cache/status.html` backtick mention). 부모 plan critique이 status.html을 routing target으로 썼지만 본 critique은 사용자 명시 scope에 따라 *plan body 자체의 information hierarchy + readability*에만 한정. detect.mjs CLI scan 결과 `[]` (markup 부재 — 적용 불가). Browser viz 비적용. Persona red flags 비적용 (UI user 없음).

**Verdict**: 본 plan body가 *Task 7~9에서 도입하려는 출력 제약 4 rule을 자기 자신에서 어김* — 특히 rule (d) "Open Questions ≤3 expanded + 나머지 collapse" 위반. dogfood-meta irony가 두 번째 cycle 확정. Files to Change 표 12 row가 Task 그룹 anchor 없이 평면 — Task 1~10 매핑 시 scanning 비용.

### Heuristics (plan body로 limited, n/a 다수)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | n/a | text-document target. |
| 2 | Match Real World | 4/4 | PM voice + 한국어 telegraphic + 식별자 영어 유지 — 정합. |
| 3 | User Control | n/a | read-only document. |
| 4 | Consistency | 2/4 | Tasks 1-5는 단일 axis 단위(receipt schema, oracle, test), Task 6은 4 command 묶음, Task 7-8은 plan.md 단독 vs 나머지 분리. grouping 기준이 mid-list에서 바뀜. |
| 5 | Error Prevention | n/a | spec document. |
| 6 | Recognition | 2/4 | Files to Change 12 row가 Task 그룹 표기 없이 평면 — Task ↔ File 매핑은 작성자만 머릿속에 있음. reviewer가 매번 양방향 grep. |
| 7 | Flexibility | n/a | spec document. |
| 8 | Aesthetic/Minimalist | 1/4 | Open Questions 6개 모두 expanded — "Quiet by default" 침해. 본 plan이 도입할 rule (d)를 본인이 위반(메타). 부모 plan의 "OQ wall" critique이 본 plan에 재발. |
| 9 | Error Recovery | n/a | n/a. |
| 10 | Help/Docs | 3/4 | 각 Task에 Action/Mirror/Validate 3단 구조 일관. CLAUDE.md §3.9 신설 명시. cycle 외부 reviewer 진입 가능. |
| **Total** | | **12/16** (applicable only) | PRODUCT.md "60초 안에 4축 식별" 목표 부분 미달 — OQ wall이 60초 안 진입에 가장 큰 마찰. |

### Anti-Patterns Verdict

**LLM**: PRODUCT.md anti-ref 3종 (SaaS hero-metric / AI-cream / Bloomberg) 비적용 (text-document). 단 OQ 6개 wall은 *plan-body anti-pattern* — 부모 plan에서 4개였고 본 plan에서 6개로 증가. trend 악화.

**Detector**: `detect.mjs --json` returned `[]` — markup-scan 룰이 .md plan body에 적용 불가. expected fallback (critique invariant: "skipped detector is failed critique unless detect.mjs missing or crashes after a real attempt" — 본 case는 attempt 후 0 finding, invariant pass).

### Priority Issues

#### [P1] Open Questions 6개 모두 visible — 본 plan이 도입할 rule (d) self-violation

- **Why it matters**: PRODUCT.md "Quiet by default, loud on demand" 침해. Task 1이 SKILL.md에 명시할 4 rule 중 (d) "한 화면 항목 수 상한 — 상위 3개 expanded + 나머지 collapse" 룰을 *plan body 자체*가 어김. Codex/Plan-Codex reviewer가 본 plan을 검토할 때 OQ 6개를 다 읽어야 하는데 그 중 Q2-Q4는 author 권장이 명시돼 reviewer 결정 부담 낮음 — 즉 visible 위치 적절성 부재.
- **Fix**: OQ 6개를 severity desc 정렬 후 top-3 (Q1 worktree branch / Q5 plugin.json bump / Q6 self-dogfood 한계) expanded, 나머지 3개(Q2 critique fail boundary / Q3 Edit 강도 / Q4 pr.md retry cap) `<details><summary>+3 more (author-recommended defaults)</summary>` collapse. plan.md raw로 surface하지 못하면 markdown `<details>` 태그가 GitHub PR view에서 작동.
- **Suggested command**: `/impeccable distill` (strip 6 → top-3 hierarchy).

#### [P1] Files to Change 표 12 row — Task 그룹 anchor 부재

- **Why it matters**: Tasks 1-10이 SKILL.md (Task 1) / oracle (2-3) / receipt (4-5) / 4 command body (6-8) / docs (9) / dogfood (10) 의 6 그룹이지만 Files to Change 표는 평면. reviewer가 "Task 6은 어느 파일?"을 묻을 때마다 표 양방향 grep. PRODUCT.md "PM voice — 첫 화면 = 1줄 verdict + 4축 status" 와 정합 안 됨.
- **Fix**: Files to Change 표 안에 `### Files to Change — SKILL.md (Task 1)`, `### Files to Change — oracle (Task 2-3)` ... 6 sub-section. 또는 Action 컬럼 옆에 `Task` 컬럼 신설.
- **Suggested command**: `/impeccable layout` (table grouping + hierarchy).

#### [P2] Tasks 6 vs 7-8 — grouping 기준이 mid-list에서 바뀜

- **Why it matters**: Task 6은 4 command body 동시 패치 (SKILL first-step), Task 7은 plan.md 단독 (retry loop), Task 8은 prp-implement/plan-prd/pr 묶음 (retry mirror). 같은 4 command body를 두 axis로 분할하는 이유가 *retry loop는 plan.md가 reference impl*이라는 작성자 내심에만 존재. reviewer가 Task 7 ↔ Task 8 차이를 매번 머릿속에서 재구성.
- **Fix**: Task 6 → "design-pre-scan + SKILL Read first-step (4 command body)", Task 7 → "critique retry loop reference impl — plan.md", Task 8 → "retry loop mirror — prp-implement / plan-prd / pr (cap=0 강제)" 으로 *목적 axis*를 Task title에 명시.
- **Suggested command**: `/impeccable clarify` (Task title naming).

#### [P2] Validation 블록 6 sub-command — Acceptance와 mapping 부재

- **Why it matters**: Validation 블록이 Task 1, 2+3, 4, 5 ... 순으로 sub-command 나열하지만 Acceptance checklist 10개와 1:1 매핑 안 됨. reviewer가 "Task 5 Acceptance를 어떤 명령으로 검증?"을 묻을 때 작성자 의도 재구성 비용.
- **Fix**: Validation 블록 각 sub-command 위에 `# Acceptance #N` 주석. 또는 Acceptance checklist 각 항목에 검증 명령 inline 참조 (`Task 5: ... → see Validation block #5`).
- **Suggested command**: `/impeccable typeset` (cross-reference anchors).

#### [P3] WAITING FOR CONFIRMATION 문구 — 본 critique 후 stale

- **Why it matters**: "Phase 5 진입할까요?"는 Phase 4 종료 시점에 의미가 있었으나 critique이 plan body에 inject되면 stale. Phase 5 진행 흔적과 충돌.
- **Fix**: critique inject 시점에 WAITING 문구 제거 (현 Edit이 이미 처리).
- **Suggested command**: 본 Edit으로 즉시 해결 — 별도 명령 불필요.

### Minor Observations

- Risks 표 8 row는 grouping 없이 평면이지만 row 수가 표 readability 한계 근방 — 그대로 OK.
- Acceptance checklist 10 항목은 Task 번호 1:1 매핑 + `회귀 0` / `plugin.json bump` 2 메타 — 적절한 groupable 구조.
- 본 plan body가 `### Task N` heading depth 3 — SKILL.md 출력 제약 (a) "heading depth ≤ 3" 룰 충족.
- 강조색 없음 (plain markdown) — rule (b) "강조색 ≤ 1" 자동 충족.
- raw markdown marker 없음 (모든 `**bold**` rendered) — rule (c) 충족.

### Questions to Consider

- 본 plan이 도입하려는 4 rule을 본 plan body 자체에 적용해야 하는가? (=dogfood meta) — 권장: rule (d) OQ collapse는 즉시 적용 (Fix P1#1). 나머지(a/b/c)는 자동 충족.
- 본 critique이 발견한 4 P1/P2 issue를 본 plan의 Task 7-8 (retry loop)이 *lint로 잡지 못하면* M3 (output-constraints.js) lint가 plan body 자체도 검사 대상에 포함해야 하는가? — 권장: M3 scope. 본 M2 plan은 SKILL.md + command body wire에 한정, lint 자체는 M3 deferred.

### Trend
First run for this target, no trend yet (slug `sign-gate-m2-skill-firststep-critique-loop-plan-md`).

> **Snapshot 미작성** — Phase 5 gate 외부에서 별도 `/impeccable polish` 호출 없음, slug-only 기록 의도. 사용자가 polish 후속 시 `IMPECCABLE_CRITIQUE_META='...' node .claude/skills/impeccable/scripts/critique-storage.mjs write <slug> <body>` 수동 호출 가능.

---

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied (`codex_dedupe_at_implement=true`).

---

## Codex Adversarial Review

- 호출: `node ./plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` flag 적용 · classification=ok · durationMs 218s)
- 라운드 수: 1 (cap=1, 모든 ACCEPT_NOW HIGH finding이 R1 absorption으로 plan body에 fully resolved → R2 trigger 조건 미충족)
- 합치 결론: needs-attention → R1 absorption 후 ship-ready. Codex 4 HIGH finding 모두 Task/Risks/Files-to-Change 수정으로 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1: SKILL first-step still depends on a known false-negative detector (self-acknowledged Risk 6의 본 plan 자기-재현) | HIGH (0.9) | ACCEPT_NOW | M2 design-gate control-plane 변경 자체가 detector에 안 잡힘 → silent-skip wedge가 본 plan에 재발. Task 6에 control-plane path 좁은 whitelist 추가 + `MCCP_DESIGN_INTENT_REASON` audited escape env 도입. |
  | F2: `decideCritique` 가 uppercase exact match만 — lowercase critical / P1 / blocking / unstructured 시 silently CONVERGED | HIGH (0.86) | ACCEPT_NOW | oracle spec 결함 — capture schema 미정. Task 2 normalize (`String(s).trim().toUpperCase()` + alias map) + Task 3 fixture에 6→9 case (lowercase, missing, unstructured parse-fail, P0/P1 alias). |
  | F3: PR-scope `verdict=divergent` warning-only → PR이 known HIGH/CRITICAL critique과 함께 ship 가능 (dual-review invariant 약화) | HIGH (0.84) | ACCEPT_NOW | PR scope에서 critique invoke 자체 제거 + 대신 chain-check (plan/implement receipt의 `design_critique_verdict=converged` 검증). divergent receipt 발견 시 PR Phase 1.6 preflight BLOCK. Task 8 + Task 5 + pr.md 본문 axis 변경. |
  | F4: Task 10 retroactive-confirm이 M2 ship-time regression 가림 | HIGH (0.92) | ACCEPT_NOW | Task 10을 *pre-ship* gate로 승격 — 합성 design-surface fixture (`.claude/cache/test-status.html` 1줄) + 강제 critique fail 시나리오로 end-to-end retry loop 실증. receipt `design_critique_rounds ≥ 1` + verdict ∈ {converged, divergent} 모두 record 후 M2 ship 승인. |
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md` 미증가
- Open Questions: 4 finding 모두 ACCEPT_NOW + R1 fully absorbed → 신규 open question 0건. 기존 Open Questions(Q1~Q6)는 본 absorption 후 일부 stale (Q4 pr.md retry cap 강도 — F3 absorption으로 결정됨 → 해소 처리)
- auto-CRITICAL catalog 6종(secret/data-loss/migration/auth/external-dest/crypto) hit 0
- Codex session 참조: threadId `019ee461-c984-7940-97dd-eb194843da81`

### R1 absorption note

4 HIGH 모두 plan body 수정으로 fully resolve → R2 escalate 조건(`MCCP_GATE_ROUND_CAP=1` cap + 미해소 ACCEPT_NOW HIGH/CRITICAL 잔존) 미충족. 본 absorption은 다음 6 변경을 plan body 안에서 처리:

1. **Task 2 (oracle 정의)**: `decideCritique` spec에 severity normalization (`String(s||'').trim().toUpperCase()`) + alias map (`P0→CRITICAL`, `P1→HIGH`, `blocking→CRITICAL`, missing→`UNKNOWN`) 명시. UNKNOWN은 fail 처리 (보수적).
2. **Task 3 (fixture)**: 6 → 9 case 확장 — (7) lowercase `critical` → ESCALATE, (8) `severity=undefined` finding → ESCALATE (보수적), (9) parse 실패 시 `findings=[]` 대신 fail-closed return (caller 책임).
3. **Task 4 (M2 신규 — receipt schema)**: 변경 없음. 기존 그대로.
4. **Task 5 (validate-cmd)**: warning push 외 **chain-check** logic 추가 — `mccp-pr-codex` validate 시 `mccp-plan-codex` + `mccp-implement-codex` receipt의 `design_critique_verdict` 조회, 어느 한쪽이라도 `divergent`이면 blocking error push. F3 absorption.
5. **Task 6 (SKILL first-step)**: 3-axis trigger — (a) detector positive (`design_signal=true`), (b) 좁은 whitelist 확장 (`plugins/mccp/scripts/lib/impeccable-detect.js`, `plugins/mccp/scripts/lib/design-critique-decide.js`, `plugins/mccp/skills/frontend-design-direction/**`), (c) audited intent override (`MCCP_DESIGN_INTENT_REASON` env, M1 `IMPECCABLE_FORCE_OVERRIDE_REASON` validator 룰 mirror). 어느 trigger라도 hit → SKILL Read first-step + critique loop 강제. F1 absorption.
6. **Task 8 (pr.md scope)**: critique invoke 자체 제거. Phase 1.6 preflight에서 chain-check (Task 5 logic 호출) — `divergent` 발견 시 STOP exit 1. retry cap 무관. F3 + Task 5 absorption.
7. **Task 10 (dogfood)**: pre-ship으로 승격 — 합성 fixture (`.claude/cache/test-status.html` 1줄 commit + critique fail 시나리오 mock) + retry loop end-to-end 실행 → receipt 1건 record 후 M2 acceptance. retroactive confirm은 *추가* 검증으로 유지. F4 absorption.

Files to Change 표는 R1 absorption 반영해 아래 본문에서 +3 row 업데이트. Risks 표는 Risk 6 (self-dogfood 한계) + Risk 7-8 (F1 + F3 자기-재현) 추가.

---

