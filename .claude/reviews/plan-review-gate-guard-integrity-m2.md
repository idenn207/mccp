# Plan Review Panel — gate-guard-integrity (M2)

**Plan**: `.claude/plans/gate-guard-integrity-m2.plan.md`
**Round 1 plan version**: `sha256:09fc54c5c7682d7dd004313851e36423bdabb096bad0df7dc2804b406133b4b7`
**Round 2 plan version**: `sha256:25178617499df4ec264ab547ea36d9e0d4beb6460e2ae4479da368a367ed8a71`
**Verdict (round 2)**: divergent via multi-agent — **BLOCKED**, no receipt written
**Quorum**: 4/3 responses · 4 distinct roles (of 4) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired (mode=multi-agent)
**Reason**: L2 quorum not satisfied: 14 blocking finding(s): test/CRITICAL, test/CRITICAL, test/CRITICAL, test/HIGH

## Round-over-round verdicts

| Perspective | Round 1 | Round 2 |
|---|---|---|
| architect | pass | pass |
| security | fail | pass |
| test | fail | fail |
| invariant | fail | fail |

`security`가 round 1 FAIL → round 2 PASS로 뒤집혔다 — helper 경계 검증 흡수가 실제로 반영됐다는 근거. `architect`는 두 라운드 모두 PASS.

## Round 2 findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | CRITICAL | Task 2a will replace absolute wall-clock timing with self-normalized scaling that detects O(n²) regressions via MCCP_PERF_INJECT_QUADRATIC env var | Validation line 276-278 assumes MCCP_PERF_INJECT_QUADRATIC will cause test to fail, but plan does not show where this env var is checked in the actual test code. Files to Change (line 139) lists perf-budget.test.js UPDATE but plan body (line 180) describes the mechanism ('두 번 derive하고, 비용 비율이 상한...이내임을 단언') without showing the actual assertion code. Current test (line 61-62) only has 'assert.ok(elapsed < PERF_BUDGET_MS)' with no env var logic. Negative case command is unverifiable without implementation. |
| test | CRITICAL | Acceptance criterion at line 361 can be verified: 'perf-budget 대체 단언이 주입된 O(n²) 회귀에서 실패함이 재현됐다' | Validation section line 276-278 shows command: 'MCCP_PERF_INJECT_QUADRATIC=1 node --test ...'. But no code in the actual perf-budget.test.js (verified by reading) checks process.env.MCCP_PERF_INJECT_QUADRATIC or injects quadratic delay. Without showing where this env var reading code will be added, the negative case cannot be executed or verified until implementation writes it. |
| test | CRITICAL | Task 0 baseline 'B' is sealed before start, making acceptance criteria testable at plan review | Line 359 acceptance: 'Task 0의 baseline B가 착수 **전에 한 번** 봉인됐고'. But line 162-165 explicitly states baseline will be measured at implement stage: '기준은 재측정본이다'. Line 338: 'implement 시점 재측정으로 B가 갱신되면'. This defers the actual baseline seal until after plan is approved, making test criteria (lines 331-336 delta rules) unknowable at review time. The baseline used in evidence (line 22-37) is labeled 증거, not 기준. |
| test | HIGH | Task 4 creates pure oracle function codex-reachability.js that correctly classifies all classification enum values including env-policy axis | Plan describes oracle at lines 213-220 and adds Task 4/5 test at line 301. Negative case at 305-311 tests unknown classification. But plan does not show actual function signature, enum values accepted, or how MCCP_CODEX_DISABLED='1' maps to {reachable:false, kind:'env-policy'}. Line 215-216 says 'MCCP_CODEX_DISABLED === '1' → {reachable:false, kind:'env-policy'}' but does not show the actual if/else chain or what 'kind' enum values are valid. Implementation details required for test validation are absent. |
| test | HIGH | Task 2b test at lines 283-290 validates that measureA3 no longer reads live .claude/state/STATE.md when passed explicit repoRoot | Validation modifies tracked git file .claude/state/STATE.md (line 285: 'printf >> .claude/state/STATE.md') and restores it (line 288). This is destructive and runs against git-tracked state used by hooks. If test crashes between modification and restore, STATE.md is left corrupted. Additionally, a3-instruction-cost.test.js already has some calls with repoRoot (line 185: readInjectedStateBlock({repoRoot: tmpRoot})) but lines 26, 70 lack it per plan lines 140. The test mixing state mutation with validation (before/after measurements) could produce false negatives if the measurements happen to be identical by chance. |
| test | MEDIUM | Plan shows all 5 calls to measureA3 in a3-instruction-cost.test.js at lines 26, 70, 92, 131, 257 are missing repoRoot parameter | Plan line 140 says '5회 호출에 명시 fixture repoRoot 전달'. Reading actual file: line 26 calls measureA3({claudePath, readUserMemory:false}) — no repoRoot. Line 70 same. Line 92 same (line 92 reads 'const result = await measureA3({...'). But I cannot verify lines 131 and 257 are in the file without reading the full 250+ line file. Incomplete verification of the 5 call sites claimed in the plan. |
| test | MEDIUM | Acceptance line 370: plan-codex-runner.js contains zero direct fs.* calls on receipt paths after refactor | Validation line 317-318 uses grep to verify: 'grep -nE "(writeFileSync|renameSync|...|receipt)" ... || echo [OK]'. But current code (line 241-255 plan-codex-runner.js) already HAS a quarantineReceipt function with direct fs.renameSync (line 248). The plan says to move this to store.js, but grep will still find it if function name changes but fs call remains. Grep alone cannot verify the refactor actually happened — only that a particular variable name disappeared. This is surface-level verification vulnerable to variable renaming that maintains the defect. |
| test | MEDIUM | Task 6a creates quarantineReceipt helper in store.js with suffix validation at boundary | Plan line 233 says 'suffix를 helper 경계에서 직접 검증한다' with validation of path separators, NUL, control chars. But plan does not show the actual regex or validation logic. Current plan-codex-runner.js line 246 concatenates directly (dest = receiptPath + '.invalid-' + nonce) with no validation. Acceptance line 368 says 'helper 경계에서 suffix·경로를 검증하고, 부정 케이스 3종이 rename 미수행 + 실패 반환'. The 3 negative cases are specified (line 237) but test file store-quarantine.test.js does not exist yet. Cannot verify test will actually check these cases without seeing the test code. |
| test | MEDIUM | Task 2c-A will enforce fail-open contract on session-start.js using process.on('exit') handler regardless of cause | Plan lines 194-204 describe adding process.on('exit') to force exitCode=0 if currently non-zero. But plan does not show actual code or where exactly this handler will be added. Line 195 says 'process.exitCode가 0이 아니면 0으로 되돌리고'. But process.on('exit') fires for ALL exits including success paths. Plan doesn't show how this avoids breaking legitimate fail-closed exits that intentionally set non-zero codes. The test at line 295-299 references 'broken-fixture-root' pattern from g1-patch.test.js but plan doesn't show what broken state will be created. |
| test | MEDIUM | Acceptance line 362: A/B before/after measurements show a3-instruction-cost.test.js fixes live .claude/state/STATE.md dependency | Plan assumes ability to show 'before' exit state (without repoRoot fix) vs 'after' (with fix). But this requires executing code against the CURRENT repo state to capture 'before', then applying changes for 'after'. The plan is submitted BEFORE implementation, so 'before' state exists as measured evidence (lines 283-290 of validation describe method). However, measuring 'after' requires implementation to be complete. Acceptance criterion cannot be verified until after implement writes the actual test changes. |
| test | MEDIUM | Task 3 timing assertions (3 remaining) will be evaluated by Task 1 harness results; disposition (change/no-change) reported | Line 205-210 describes conditional evaluation: 'Task 1 harness N회 결과와 대조한다. sometimesFailing에 등장하지 않으면 손대지 않고'. Acceptance line 365 requires '판정(변경/무변경)과 근거가 report에 남았다'. But plan doesn't name which 3 assertions (only references 'perf-budget <1000ms', 'plan-codex-runner <20s', 'receipt-write-concurrency <3s' at line 89-91). If none appear in harness results, Task 3 is effectively doing nothing but documentation. Acceptance could be satisfied with report saying 'none appeared so no changes needed', which is untestable before results exist. |
| invariant | CRITICAL | Validation commands are forward-referenced and cannot be executed until after implementation is complete, creating a gate that looks functional but is actually aspirational | Lines 252-327 contain validation commands like `node plugins/mccp/scripts/lib/suite-determinism.js --runs 10 --json` (line 257), `MCCP_PERF_INJECT_QUADRATIC=1 node --test` (line 276), and `require('./plugins/mccp/scripts/lib/codex-reachability')` (line 307). None of these files exist in the current codebase (verified via Grep). The Acceptance checklist (lines 359-374) treats these commands as if they can be verified immediately, but they form a circular dependency: the validation depends on code that doesn't exist until after Tasks 1-6 are complete. This makes the acceptance criteria forward-referential rather than verifiable. |
| invariant | CRITICAL | Baseline sealing has an unsolvable temporal paradox: Task 0 must seal baseline before work starts, but baseline is measured using suite-determinism.js which doesn't exist until Task 1 | Line 162: 'implement 시점에 전수 실행을 **재측정**해 ... 봉인한다' and line 165: '`B`는 **Task 1~7 착수 전에 한 번만** 확정하고 이후 갱신하지 않는다'. But Task 1 (line 170) creates suite-determinism.js. The baseline measurement at Task 0 cannot use the harness that is created at Task 1. Either the baseline is sealed with unvalidated pre-Task-1 code, or it's sealed after Task 1 (violating the 'before work starts' requirement). This creates a receipt-anchor violation: the baseline `B` cannot be bound to the actual measurement code that will validate against it. |
| invariant | CRITICAL | Critical acceptance criterion references a test that doesn't exist in Files to Change and cannot be executed | Line 363 states acceptance requires: 'broken fixture root에서 session-start가 exit 0 + loud stderr'. Lines 295-298 validation command: `--test-name-pattern "broken plugin root"`. However, session-start-bootstrap.test.js (lines 1-120) contains no test matching this pattern. Tests exist at lines 40, 46, 60, 77, 92, 101 but not 'broken plugin root'. Files to Change (line 141) lists UPDATE but doesn't specify adding this test. The gate can report acceptance even though the critical A/B validation command doesn't exist. |
| invariant | CRITICAL | Receipt mutation gating is bypassed by relying on an implementation loophole: new quarantineReceipt helper is left unregistered in MUTATION_ENTRYPOINTS, violating the gate's design intent | Line 118: '**MUTATION_ENTRYPOINTS에는 등록하지 않는다**' (deliberately don't register). Per b2-coverage-gate.js lines 52-57, MUTATION_ENTRYPOINTS is the registry of approved entry points designed to validate 'all mutations are approved'. By leaving quarantineReceipt unregistered while placing it in APPROVED_WRITERS, the plan creates an entry point that bypasses the mutation registry check—it relies on an undocumented property ('only checks for missing, not extra') to skip approval for this function. |
| invariant | HIGH | Codex reachability oracle's fail-closed guarantee is tested in an already-degraded environment, not in production scenarios | Lines 306-311, 366: validation runs 'MCCP_CODEX_DISABLED=1인 **현재 환경 그대로** 스모크 테스트의 skip 사유가 참이다'. Testing fail-closed behavior for unknown classifications while environment already has env-policy disable active does not prove the oracle fails closed on genuinely unknown classification values in production. If a new classification appears in real use, the oracle has not been tested against that scenario because testing happened in pre-degraded state. |
| invariant | HIGH | Acceptance Criteria and Files to Change are misaligned: acceptance requires test patterns that Files to Change doesn't claim to create | Line 141 lists session-start-bootstrap.test.js as UPDATE. But Acceptance line 363 requires 'broken fixture root에서 session-start가 exit 0' implying a test of this name must exist. Neither current file nor Files to Change explicitly adds this test. This creates a gap: either the test doesn't exist and acceptance can't be verified, or the test must be added but isn't listed as a file change. |
| invariant | HIGH | Acceptance criteria cannot be verified until after all work is complete, creating a post-hoc gate rather than a fail-closed checkpoint | Line 371: '전수 실행이 §Validation의 4개 델타 기준(**B 대비**)을 동시에 만족'. Baseline B is sealed during Task 0 'at implement time', but there is no mechanism to prevent tasks 1-7 from being worked on while baseline is undefined. Acceptance can only be checked after Task 0 baseline seal AND tasks 1-7 are complete. No gating point exists between baseline seal and final delivery—baseline could shift, tasks proceed with undefined criteria, and only at the very end is acceptance computed. This violates fail-closed gating: a proper gate would block progression if baseline is undefined. |

## Round 2 refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | Verified plan citations (evidence-audit.js, design-critique-decide.js, codex-invoke.js enum patterns, store.js facade) against actual code. Checked APPROVED_WRITERS lint bypass mechanism and confirmed plan-codex-runner has 0 receiptPath() function calls. Verified b2-coverage-gate staticLint skips approved files entirely (line 324). Confirmed MUTATION_ENTRYPOINTS only validates presence, not addition. Validated suite-determinism/codex-reachability are correctly proposed as pure oracles matching codebase patterns. Reviewed session-start fail-open contract (line 1102) and confirmed defensive IIFE pattern already exists in receipt-prompt/receipt-skill. Checked Files to Change list for completeness and dedupe matcher requirements (full paths). Examined boundary validation strategy for quarantineReceipt and confirmed helper-side validation is architecturally correct. Found no boundary leaks, circular dependencies, or invariant erosions. |
| security | pass | **Path traversal & trust boundary**: Verified that Task 6a requires helper-boundary validation of `suffix` (rejecting `../`, `/`, `\`, NUL/control chars) and `receiptFilePath` (must be within `receiptsDir(repoRoot)`). The plan correctly places validation logic in store.js (approved writer), not just caller, preventing future callers from bypassing checks. Negative test cases (3 kinds) are specified. No traversal vulnerability found. **Fail-open contract**: Task 2c-A requires `session-start.js` to enforce exit code 0 unconditionally via `process.on('exit')` handler, wrapping module-scope requires with defensive IIFE (mirroring M1 G1 pattern). Loud stderr messaging preserved. This satisfies fail-open semantics without silent bypass. **Environment variable handling**: Task 4 codex-reachability oracle explicitly checks `MCCP_CODEX_DISABLED === '1'` before any classification logic, returning `{reachable:false, kind:'env-policy'}`. This prevents false positive "reachable" verdicts when env policy disables Codex. Task 5 updates smoke test to use this oracle instead of missing the env var. **Unknown/invalid state handling**: Task 4 specifies fail-closed: unknown classifications map to `reachable=false` with `kind='transport'`, never to success. Task 6 requires quarantineReceipt to return failure (not rename) when suffix or path validation fails. **No data leakage**: Codex reachability reason field uses only enum kinds (`env-policy`, `not-installed`, etc.); no raw error messages or paths exposed. Task 5 skip messages use oracle's `reason` string (safe, user-facing). **No privilege escalation**: Suffix validation at helper boundary prevents an attacker calling `store.quarantineReceipt()` directly with `suffix='../../../etc/passwd'`. Path boundary check prevents renaming outside `.claude/receipts/`. **Lint integrity**: Plan explicitly forbids changes to b2-coverage-gate.js rules; success criterion is unchanged diff on that file. Moving quarantineReceipt to store.js (already APPROVED_WRITER) fixes the violation without broadening trust scope. **Reentrancy & atomicity**: quarantineReceipt does not acquire evidence-lock, so no deadlock with updateReceipt. Current implementation uses atomic rename; no torn state. Caller (plan-codex-runner) invokes as standalone operation. **Test coverage**: Plan requires negative test cases for (a) diffRuns divergence detection, (b) O(n²) perf injection, (c) STATE.md coupling A/B, (d) session-start broken-fixture exit-0, (e) Codex disabled skip-reason, (f) unknown classification fail-closed, (g) quarantineReceipt suffix/path 3-way validation. No HIGH or CRITICAL findings. Attacked path traversal, env var precedence, trust boundary placement, fail-open contracts, and data leakage channels. All appropriately mitigated in the plan. |
| test | fail |  Attacked the plan on test falsifiability and coverage: 1. **Task 2a injection mechanism**: Searched for MCCP_PERF_INJECT_QUADRATIC in perf-budget.test.js — not present. Negative case validation command assumes this env var will work but implementation not shown in plan. 2. **Task 0 baseline sealing**: Read lines 162-165, 338, 359 showing baseline is actually sealed at IMPLEMENT stage, not before plan review, making acceptance criteria unknowable until after approval. 3. **Task 4 codex-reachability oracle**: Checked what the function will look like — plan describes behavior but shows no actual function signature or enum definition needed for test to verify unknown classification. 4. **Task 2b STATE.md testing**: Examined validation procedure — it modifies git-tracked state file, is destructive, vulnerable to crash-recovery gaps. 5. **Task 6a quarantineReceipt helper**: Read current plan-codex-runner.js line 241-255 — function already exists with no suffix validation. Plan says to move and add validation but doesn't show validation logic. 6. **grep verification for Axis C**: Line 317-318 validates refactor via grep pattern. Checked that grep is name-based and vulnerable to variable renaming that preserves the defect. 7. **Task 2c fail-open handler**: Plan describes process.on('exit') but doesn't show where it hooks module-scope requires or how it avoids breaking intentional fail-closed paths. 8. **A/B testing for Task 2b**: Plan assumes 'before' measurement against current code but before/after comparison requires post-implementation snapshot, deferring verification. 9. **Task 3 conditional logic**: Reviewed lines 205-210, 89-91, 365 — Task 3 could complete with no changes if harness doesn't catch the 3 timing assertions, making acceptance criterion satisfied by mere documentation rather than code change. Verified that L2 review corrections (lines 428-435) WERE incorporated into plan body. No gaps found in how L2 findings were absorbed."  |
| invariant | fail | Attacked the plan across six axes per invariant lens: (1) Forward-reference gates by checking whether validation commands reference files that exist (they don't: suite-determinism.js, codex-reachability.js, store-quarantine.test.js absent; MCCP_PERF_INJECT_QUADRATIC env flag not present). (2) Baseline anchoring by tracing temporal sequence of Task 0 seal vs Task 1 harness creation (paradox confirmed: baseline depends on code not yet created). (3) Skip predicates by searching for 'broken plugin root' test (test doesn't exist in current file). (4) Mutation registry bypass by checking MUTATION_ENTRYPOINTS registration against plan's explicit non-registration (plan intentionally avoids registry to skip gate). (5) Degradation direction by examining test environment during fail-closed validation (tests run with MCCP_CODEX_DISABLED=1 active, not production state). (6) Receipt anchoring by cross-referencing Files to Change against Acceptance criteria (mismatch: acceptance requires test that Files to Change doesn't list)." |


---

# Plan Review Panel — Round 3 (gate-guard-integrity-m2)

> 위 헤더 블록은 round 2 기준이다. 이 절이 round 3의 정본이다.

**Plan**: `.claude/plans/gate-guard-integrity-m2.plan.md`
**Round 3 plan version**: `sha256:e3cc9c42d32574e883026946661f007df7ee08a0aff3bd966c89cba7f683f9d0`
**Verdict (round 3)**: divergent via multi-agent — **BLOCKED**, no receipt written
**Quorum**: 4/3 responses · 4 distinct roles (of 4) · passed=false — pass 1 / fail 3
**Layers**: L1 converged (violations 0) · L2 divergent · L3 not fired (mode=multi-agent)
**Reason**: `L2 quorum not satisfied: 11 blocking finding(s): security/HIGH, security/FAIL, test/CRITICAL, test/HIGH`
**Decision slug**: `gate-guard-integrity-m2` — round 1·2는 PRD 경로 호출로 `gate-guard-integrity`였고 그것은 M1이 소유한 receipt 경로다. round 3부터 plan 경로 호출로 고정.

## Round-over-round verdicts

| Perspective | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| architect | pass | pass | **pass** |
| security | fail | pass | **fail** (신규 축) |
| test | fail | fail | **fail** |
| invariant | fail | fail | **fail** |

Severity 분포는 개선됐다 — round 2는 blocking 14건 중 **CRITICAL 4건**, round 3은 blocking 11건 중 **CRITICAL 1건**. invariant의 round 2 CRITICAL 4건(forward-reference · baseline 시간역설 · 존재하지 않는 test · MUTATION_ENTRYPOINTS 우회)은 **전부 사라졌고**, 남은 지적은 "문서가 아니라 기계가 강제하는가"라는 한 축으로 수렴했다. `## 실행 시점 계약` 표와 UI9 등록이 그 4건에 실제로 응답했다는 근거다.

`security`는 round 2 pass → round 3 fail로 되돌아갔는데, **같은 지적의 재발이 아니라 신규 축**이다(round 2 pass 사유였던 helper 경계 검증은 그대로 유지되고, 이번엔 Task 4 오라클의 precedence 명세를 공격했다).

## Round 3 findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| test | CRITICAL | baseline `B`가 봉인 후 불변이라는 Acceptance와, implement 시점 재측정으로 갱신될 수 있다는 본문이 **서로 모순**된다 | Acceptance `:435` `'착수 전에 한 번 봉인됐고, 이후 갱신되지 않았다'` ↔ 본문 `:174` `'implement 시점에 전수 실행을 재측정'` + `:414` `'재측정으로 B가 갱신되면 위 델타가 그 새 B에 적용된다'`. 재측정이 허용되면 Acceptance 문장이 거짓이다 |
| security | HIGH | Task 4 Validate의 (a)·(b)가 env policy와 classification의 **precedence를 서로 다르게** 규정한다 | `:236` (a) `MCCP_CODEX_DISABLED=1`이면 `ok:true`여도 `reachable=false` / (b) `classification='ok'`이고 `env가 꺼져 있으면` `reachable=true`. `codex-invoke.js:183-186`상 `DISABLED=1`은 `classification='disabled'`를 만들므로 (b)의 조합은 실재 불가. 두 축이 충돌할 때 무엇이 우선인지 plan이 규정하지 않음 |
| test | HIGH | `fail-open contract` 패턴 개수 검사는 test **이름**만 확인하고 **본문**을 확인하지 않는다 | Validation `:348-353`이 TAP 매칭 개수 ≥2만 요구. `test('fail-open contract …', () => {})` 빈 stub도 통과한다 — exit code·stderr·모듈 파손에 대한 단언 존재를 요구하지 않음 |
| test | HIGH | `MCCP_PERF_INJECT_QUADRATIC`을 **어디서 소비하는지**가 명세되지 않았다 | Validation `:318-320`은 이 env로 test가 실패하기를 요구하는데, Task 2a `:192`는 "주입한 derive에서 새 단언이 실패"라고만 적고 주입 hook이 어느 파일에 들어가는지 말하지 않음. 소비 지점을 모르면 부정 케이스가 검증 불가 |
| test | HIGH | harness `--runs 10`의 미포착률 5.6%로 결정성을 증명하려는 것은 **순환 검증**이다 | `:416`이 스스로 "결정적임의 증명이 아니라 10회 관측"이라 적었으나, 관측된 flake가 p≈0.25(`:18-19`)라면 10회 표본이 놓칠 여지가 남는다. "N회 관측 안정"과 "결정적"의 혼동 위험 |
| test | HIGH | `MCCP_CODEX_DISABLED=1` + `ok:true` 케이스가 **실행 가능한 Validation에 없다** | Task 4 `:236`이 요구하는 (a) 케이스가 Validation bash `:356-366`에 없음 — 거기 있는 것은 미지 classification fail-closed 뿐 |
| invariant | HIGH | forward-reference 계약이 **기계적 강제가 아니라 논리적 추론**이다 | `:276-289`가 9개 전제를 열거하고 "실행 불가 = Task 미완의 기계적 증거"라 적지만, 그 명령이 implement 시점에 실제로 실행됐는지를 검사하거나 미실행 시 `/mccp:prp-implement`를 막는 자동 게이트가 없다 |
| invariant | HIGH | 부정 케이스가 `node --test` 스위트가 아니라 **bash 스니펫**에 있어 "자동 탐지"가 "문서화된 의도"로 약화된다 | PRD `:40`은 "테스트로 증명"을 요구. plan `:300-366`의 `[NEG]`는 스위트 실행 대상이 아니며 exit code가 게이트되지 않음 |
| security | MEDIUM | `receiptFilePath` 봉쇄 검사의 **알고리즘**이 명세되지 않았다 | `:250-251`이 `receiptsDir(repoRoot)` 하위 확인을 요구하나 `startsWith` / `path.relative` / `realpath` 중 무엇인지 미지정. 순진한 문자열 검사는 symlink 탈출·정규화 우회에 취약하며, `store.js:25-36`은 이 저장소가 TOCTOU·`O_NOFOLLOW` 수준의 명세를 기대함을 보여준다 |
| security | MEDIUM | baseline 재측정 허용이 **목표 이동(goal-post shifting)** 여지를 남긴다 | `:177` 봉인 규칙 ↔ `:414` 재측정 허용. 통제 수단이 "report에 남긴다" 뿐이라 감사 가능하되 고정 baseline보다 약하다 |
| invariant | MEDIUM | 같은 baseline 탄력성을 gate 관점에서 재지적 | `:173` ↔ `:177` ↔ `:414`. 재측정 결과가 델타 기준을 도달 불가로 만들어도 막는 기계가 없다 |
| invariant | MEDIUM | decision slug 충돌이 **문서화된 절차**로만 해소된다 | `:564`가 원인과 해법을 적었으나 `/mccp:plan`이 PRD 경로로 다시 호출되면 같은 충돌이 조용히 재발한다 — 코드 강제가 아니다 |
| invariant | MEDIUM | Acceptance가 참조하는 신규 test가 **생성되지 않아도 실패하지 않는다** | `:436-441` ↔ `:348-353`. 개수 검사가 markdown 안 bash라 스위트 게이트가 아니고, 미생성 시 `/mccp:prp-implement`를 막는 receipt 검증도 없다 |
| test | MEDIUM | Task 5의 skip 사유 A/B 대조가 **실행 가능한 형태로 없다** | `:244`는 수정 전 `"--json contract appears to be non-JSON"`과의 대조를 요구하나 Validation `:358-359`는 `grep -a "SKIP"` 뿐 — 사유 문자열이 바뀌었는지 확인하지 않음 |
| test | MEDIUM | Validation이 **"파일 없음"과 "단언 실패"를 구분하지 않는다** | `:297`·`:303-307`·`:356`이 미존재 파일을 참조하므로 `Cannot find module`로 죽는다. plan이 `:278-288`에서 이를 인정했으나 bash는 여전히 혼란스러운 형태로 실패한다 |
| test | MEDIUM | `renameSync` 개수 검사도 결국 **문자열 매칭**이다 | `:374-376` `grep -c`. 주석 속 `renameSync`, `call(renameSync)`, `renameSync_backup` 같은 형태가 개수를 오염시킬 수 있다 |
| test | MEDIUM | `session-start.js` exit-code 대입 1곳 단언을 **어느 test가 소유하는지** 없다 | Acceptance `:440`이 요구하고 Task 2c `:209`가 "test 단언으로 고정한다"고 적었으나 Validation에 해당 명령이 없다 |
| security | LOW | M1 G1 IIFE 패턴을 **인라인으로 보여주지 않는다** | `:208`이 패턴 이름과 참조 파일(`receipt-prompt.js:27-30` · `receipt-skill.js:58-74`)만 제시. IIFE가 오류를 조용히 삼키거나 스스로 던지면 fail-open 계약이 깨진다 |

## Round 3 refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | plan이 인용한 코드 위치를 전수 대조(`session-start.js:1102` exit code · `perf-budget.test.js:61` timing 단언 · `a3-instruction-cost.test.js:185/197` fixture · `plan-codex-runner.js` renameSync 개수 · `b2-coverage-gate.js` `MUTATION_ENTRYPOINTS` 구조). Task 의존 그래프의 순환 여부 검사 — **baseline이 harness와 독립임을 확인**. `## 실행 시점 계약`의 9개 전제가 Task와 1:1로 대응하고 부재 시 의미가 명시돼 있음을 확인. `quarantineReceipt` 이동이 lint를 우회하지 않음(runner에서 `receiptPath` 토큰이 제거됨), `process.on('exit')` fail-open 강제가 방어 가능함, round 1·2 지적(델타 의미론·무조건 계약 강제·helper 경계 검증)이 실제로 반영됐음을 확인. 경계 누수·순환 의존·불변식 침식을 찾지 못함 |
| security | fail | 세 축 공격: (1) 신뢰 경계 — helper 경계 검증 대 호출부 검증, 경로 봉쇄 알고리즘 미명세와 baseline 이동 여지 발견. (2) 부분 상태 신뢰 — Task 4 오라클의 env policy 대 classification 우선순위 충돌 발견. (3) 유출 — Task 2b가 tracked 파일을 건드리지 않음 확인, Task 6c가 레지스트리 1행 추가로 상한 고정됨 확인. `quarantineReceipt`가 미승인 write primitive가 될 수 있는지 추적 — 레지스트리 등록이 보완함을 확인. `codex-invoke.js:183-186`으로 (b) 케이스가 실재 불가함을 확인 |
| test | fail | (1) baseline 봉인 주장의 자기정합성 — 모순 발견. (2) test 이름 검증이 행위를 검증하는가 — 불충분 발견. (3) 부정 케이스 참조의 실재 — `MCCP_PERF_INJECT_QUADRATIC` 소비 지점 미명세. (4) Task 4 `DISABLED` 케이스의 실행 가능 검증 — forward reference뿐. (5) `renameSync` 개수의 신뢰성 — 문자열 매칭 취약. (6) 결정성 순환 검증 — 5.6% 미포착률. (7) 그 외 |
| invariant | fail | 다섯 축: (1) forward-reference 명령의 부재가 기계적으로 탐지되는가. (2) 부정 케이스가 PR/implement 게이트에서 실제로 실행되는가. (3) baseline 봉인 계약의 재측정 탄력성. (4) chain의 receipt slug 충돌. (5) Acceptance가 참조하는 미존재 파일/test에 대한 자동 실패 기제. 각각을 게이트 강제 지점까지 추적해 **문서가 기계를 대신하는 지점**을 찾음. plan 자신이 `:276-289`·`:564`에서 이 문제들을 인정한 것도 확인했고, 제시된 완화책이 코드 수준인지 문서 수준인지 판정함 |

---

# Plan Review Panel — Round 4 (gate-guard-integrity-m2)

**Round 4 plan version**: `sha256:99ee62117c370f24e7fadca99b429488ecf6b19a76e3c81151fa404c2c5cdb78`
**Verdict (round 4)**: divergent via multi-agent — **BLOCKED**, no receipt written
**Quorum**: 4/3 responses · 4 distinct roles (of 4) · passed=false — pass 1 / fail 3
**Layers**: L1 converged (violations 0) · L2 divergent · L3 not fired
**Reason**: `L2 quorum not satisfied: 6 blocking finding(s): architect/CRITICAL, architect/HIGH, architect/HIGH, architect/FAIL`

## Round-over-round

| Perspective | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| architect | pass | pass | pass | **fail** |
| security | fail | pass | fail | **pass** |
| test | fail | fail | fail | **fail** (HIGH/CRITICAL **0**) |
| invariant | fail | fail | fail | **fail** (HIGH/CRITICAL **0**) |

| 지표 | R2 | R3 | R4 |
|---|---|---|---|
| blocking 총계 | 14 | 11 | **6** |
| CRITICAL | 4 | 1 | **1** (자기참조 1건) |
| HIGH | 8 | 7 | **2** (모두 architect) |

**`test`와 `invariant`는 HIGH/CRITICAL을 0건 냈는데도 `fail`을 반환했다.** 리턴 계약이 `pass`를 "결함을 하나도 못 찾았을 때만"으로 규정하므로 MEDIUM 1건도 `fail`을 강제한다 — 계약 위반이 아니라 **계약의 구조**다. 따라서 이 패널은 **4인 중 3인이 어떤 severity의 결함도 0건**일 때만 수렴한다. 4라운드가 지난 지금 남은 것이 대부분 MEDIUM인 이유이자, 수렴이 어려운 이유다.

## Round 4 blocking (6건 — 전부 architect + 3개의 fail 표)

| Perspective | Severity | Claim | 판정 |
|---|---|---|---|
| architect | CRITICAL | plan이 round 3의 divergent verdict를 본문에 담고 있고, 그 수정이 검증됐다는 증거 없이 제안돼 있다 — 실패 상태의 문서다 | **자기참조.** plan이 자기 리뷰 이력을 정직하게 기록한 것을 "이 문서는 거부됐다"는 증거로 읽었다. 이력의 소재지가 plan 본문인 것이 원인이며, 커맨드 5.2h는 원래 그 기록을 **sibling 아티팩트**에 두라고 규정한다 — 구조적으로 제거 가능 |
| architect | HIGH | `B` 재측정 금지의 경계가 기계적이지 않다 — Task 1 harness가 전수를 10회 돌린다 | **일부 타당.** harness 실행이 `B`를 쓰지 않는다는 것이 문장으로만 있다. "harness 출력은 `B`에 기록되지 않는다"를 명시 + 봉인된 TAP 존재 검사로 기계화 가능 |
| architect | HIGH | `fail-open contract` test 2건이 **어느 모듈에 속하는지** 불완전. 또한 Task 0의 baseline은 2c-A가 바꿀 행위를 측정한다 | **혼합.** 앞부분은 타당(파일은 명시됐으나 Acceptance 문장이 그 연결을 반복하지 않음). 뒷부분은 **baseline의 정의 자체**다 — 변경 전 상태를 재는 것이 baseline이며, 이것을 결함이라 하면 어떤 before/after 비교도 성립하지 않는다 |
| architect | MEDIUM | 2c-A의 `process.on('exit')` 강제가 2c-B가 진단해야 할 증상(exit 1)을 **가려버린다** | **날카롭고 타당.** exit 1이 0으로 바뀌면 bootstrap test가 통과하고, harness의 `sometimesFailing`에서 그 flake가 사라진다. 계약 강제와 진단 가능성이 같은 관측면을 공유한다. 강제 경로가 **구별 가능한 marker를 stderr에 남기고 test가 그 marker를 실패 신호로 취급**해야 해소된다 |
| architect | MEDIUM | forward-reference 검사와 현재 검사의 경계가 구조로 강제되지 않는다 | 전제 점검 preamble이 이미 그 경계를 exit code로 만든다 — 부분 반증 |
| test · invariant | FAIL | (verdict 자체가 blocking으로 계산됨) | 위 표 참조 — HIGH/CRITICAL 0건 |

## Round 4 non-blocking (MEDIUM/LOW — 전부 구체적이고 값싼 수정)

| Perspective | Severity | 요지 |
|---|---|---|
| test | MEDIUM | 2c-A의 "loud message"를 Validation이 **검증하지 않는다** — exit code만 본다 |
| test | MEDIUM | 도달 가능성 오라클이 **14종 classification 전부**를 다뤄야 하는데 test는 3케이스뿐 |
| test | MEDIUM | `judgeScaling`의 **판정 알고리즘**이 인터페이스만 있고 규칙이 없다 |
| test | MEDIUM | Task 0의 "착수 시"와 "Task 1~7 착수 전"이 문장상 어긋난다 |
| test | MEDIUM | stub 방지가 "설계가 아니라 우연히" 작동한다는 주장 (빈 stub은 구코드에서도 pass하므로 실제로는 A/B가 잡는다 — 반증 가능하나 stderr 단언 추가가 더 견고) |
| test | LOW | `grep "SKIP"`이 여러 줄을 매칭할 수 있다 |
| test | LOW | `diffRuns` 4필드 중 2개만 단언한다 |
| security | MEDIUM | 경로 봉쇄가 **source·destination 중 무엇에** 적용되는지 문장이 단수형이라 모호 |
| invariant | MEDIUM | 봉인 TAP **존재 검사**가 Validation에 없다 — "기계적 방어"라 적었는데 그 기계가 없다 |
| invariant | MEDIUM | 주입 스위치가 production `derive/`에 **새지 않았다는 역방향 grep**이 없다 |

## Round 4 refutation attempted

| Perspective | Verdict | 공격 대상 |
|---|---|---|
| architect | fail | plan의 현재 리뷰 상태 · baseline 측정 경계 대 Task 1 harness의 10회 실행 · forward-reference와 현재 검사의 분리 · 신규 test의 소재지 · 2c-A와 2c-B의 관측면 충돌 |
| security | **pass** | Task 6 경로 처리(symlink 탈출·suffix traversal·비봉쇄 rename) · 신뢰 경계가 호출부가 아닌 helper에 있는지 · Task 4 precedence가 classification 이전에 평가되는지 · 산출물 유출 · 2c-A fail-open 우회. **취약점 없음** — 경로 검증의 source/dest 모호성 1건만 MEDIUM으로 남김 |
| test | fail | loud message 단언 부재 · classification 커버리지 · `judgeScaling` 규칙 · baseline 문장 어긋남 · stub 방지의 우연성 · SKIP 다중 매칭 · `diffRuns` 필드 커버리지 |
| invariant | fail | 봉인 TAP 존재 검사 부재 · 주입 스위치 역방향 격리 검사 부재. **HIGH/CRITICAL 0건** |

---

# 흡수 이력 (plan 본문에서 이관, round 5)

> round 4 architect가 plan 본문의 리뷰 이력을 "이 문서는 거부된 상태"의 증거로 읽어 CRITICAL을 냈다.
> 커맨드 5.2h는 원래 이 기록을 plan이 아니라 sibling 아티팩트에 두라고 규정하므로, 아래는 그 규정대로
> 옮겨온 round 1~3 흡수·반증 기록이다. plan 본문에는 각 Task 안에 흡수의 *결과*만 인라인으로 남아 있다.


---

# 흡수 이력 (plan 본문에서 이관, round 5)

> round 4 architect가 plan 본문의 리뷰 이력을 "이 문서는 거부된 상태"의 증거로 읽어 CRITICAL을 냈다.
> 커맨드 5.2h는 원래 이 기록을 plan이 아니라 sibling 아티팩트에 두라고 규정하므로, 아래는 그 규정대로
> 옮겨온 round 1~3 흡수·반증 기록이다. plan 본문에는 각 Task 안에 흡수의 *결과*만 인라인으로 남는다.

## L2 Review Panel — Round 1 흡수

**verdict: divergent** (architect PASS · security FAIL · test FAIL · invariant FAIL — quorum 1/3). 게이트가 BLOCK했고 receipt는 작성되지 않았다. 전문은 `.claude/reviews/plan-review-gate-guard-integrity-m2.md`.

| # | 지적 | 포착 | Severity | 판정 | 조치 |
|---|---|---|---|---|---|
| 1 | Acceptance가 `fail 2 / pass 3861 / skipped 6`을 절대 리터럴로 고정하는데 Task 0은 재측정을 허용 → 기준이 결과를 따라가 무의미해진다 | invariant | CRITICAL | **수용** | 합격 기준을 봉인 baseline `B` **대비 델타**로 재정의. Task 0에 "착수 전 1회 봉인, 이후 미갱신" 규칙 추가 |
| 2 | Task 2c가 원인 미확정 시 진단 강화만 착지시켜 **hook이 fail-open 계약을 위반한 채로** milestone이 닫힌다 | invariant | CRITICAL | **수용** | Task를 2c-A(계약 강제·무조건)/2c-B(원인 확정·조건부)로 분리. fail-open은 전칭 명제라 **원인을 몰라도 강제 가능**하다 — M1의 G1이 같은 형태였다. `session-start.js`를 조건부에서 무조건 UPDATE로 승격 |
| 3 | Task 본문은 A/B 재현을 요구하는데 `## Validation`에 그 명령이 없다 → "대체 단언이 원래 회귀를 잡는가"가 실행 가능한 형태로 부재 | test | HIGH ×4 | **수용** | `[NEG]` 블록 5종 신설(O(n²) 주입 · STATE.md A/B 프로브 · `diffRuns` 합성 TAP · broken-fixture spawn · 미지 classification fail-closed). 각 블록은 **비영점 exit**을 기대한다 |
| 4 | `--runs 3`은 25% 사건을 42% 확률로 놓친다 | test | HIGH | **수용** | `--runs 10`(미포착 ≈ 5.6%)으로 상향하고 그 산술을 report 의무 기재 항목으로 명시 |
| 5 | `quarantineReceipt(path, suffix)`가 helper 경계에서 `suffix`를 검증하지 않는다 — 호출부(`plan-codex-runner.js:55` `SAFE_TOKEN_RE`)에만 있어 승인 writer가 다른 호출자에게 열리는 순간 무검증 경로가 생긴다 | security | MEDIUM | **수용** | Task 6a에 helper 경계 검증(+ `receiptsDir` 하위 확인) 명시, 부정 케이스 3종을 Validate에 추가 |

**메타 관찰.** architect는 PASS를 냈고 나머지 셋이 FAIL을 냈는데, 세 FAIL의 지적이 서로 겹치지 않는다 — invariant는 *합격 기준의 자기모순*을, test는 *부정 케이스의 실행 불가능성*을, security는 *신뢰 경계의 위치*를 잡았다. 관점 격리가 실제로 작동했다는 근거다. 다만 넷 다 Claude 계열이므로 **모델 다양성은 여전히 미획득**이다(위 `## Codex Adversarial Review` 참조).

## L2 Review Panel — Round 2 (게이트 미통과 상태)

**verdict: divergent** (architect PASS · security PASS · test FAIL · invariant FAIL — quorum 2/3). receipt 미작성. 전문은 `.claude/reviews/plan-review-gate-guard-integrity-m2.md`.

`security`가 round 1 FAIL → round 2 PASS로 뒤집혔다. helper 경계 검증 흡수가 실제로 반영됐다는 근거다. `architect`는 두 라운드 모두 PASS.

### 흡수한 것

| # | 지적 | 포착 | Severity | 조치 |
|---|---|---|---|---|
| 6 | `## Validation`의 STATE.md A/B 프로브가 **git-tracked 파일을 append 후 복원**하는 파괴적 형태 — 중간 크래시 시 복원 실패 | test | HIGH | **수용.** 라이브 파일을 건드리지 않는 형태로 교체 — 결합의 정체가 "`repoRoot` 미전달 → `process.cwd()` 읽기"이므로 **cwd만 바꿔** 증명한다 |
| 7 | `MCCP_PERF_INJECT_QUADRATIC`이 이미 존재하는 것처럼 Validation에 적혀 있다 | test | CRITICAL | **부분 수용.** 스위치는 Task 2a가 **신설**하는 것임을 블록 주석에 명시. 실행 불가 상태로 남으면 그것이 Task 미완의 증거라는 점도 함께 적었다 |

### 반증한 것 — 판정 근거를 남긴다

나머지 blocking finding 다수는 **"plan이 구현 코드를 담고 있지 않다"** 는 형태다: *"Validation 명령이 forward-reference라 구현 완료 전에는 실행할 수 없다"* · *"오라클의 실제 if/else 체인이 plan에 없다"* · *"baseline이 implement 시점에 봉인되므로 review 시점에 기준을 알 수 없다"*.

이 셋은 **범주 오류**다. plan은 무엇을 만들고 무엇으로 검증할지를 규정하는 문서이고, 구현은 그 다음 단계가 소유한다. 이 기준을 받아들이면 어떤 plan도 통과할 수 없다 — 통과 조건이 "이미 구현돼 있을 것"이 되기 때문이다. 실제로 `/mccp:plan` → `/mccp:prp-implement` 분리 자체가 이 경계를 전제한다.

baseline "시간 역설" 지적도 두 라운드가 **서로 반대 방향으로** 밀었다. round 1 invariant는 "리터럴을 고정하지 마라, 재측정에 밀려 무의미해진다"였고, round 2는 "implement 시점 봉인이면 review 때 기준을 모른다"였다. 두 요구는 2층 구조로 동시에 만족된다 — **규칙(델타)은 review 시점에 확정**돼 있고 **수치(`B`)만 implement 시점에 측정**된다. 규칙이 기준이고 수치는 그 인자다.

`quarantineReceipt`가 "승인 writer라서 lint를 우회하는 loophole"이라는 지적도 반증한다. `store.js`는 receipt 경로 fs 접근이 **설계상 있어야 할 자리**이고(`APPROVED_WRITERS`의 정의 자체), 이 이동은 runner에 없던 **경계 검증을 새로 추가**한다. 신뢰 범위가 넓어지는 것이 아니라 좁아진다.

## L2 Review Panel — Round 3 준비 (round 2 잔여 지적 처리)

Round 2의 blocking finding 14건 중 #6·#7만 즉시 흡수됐고 나머지는 **일괄 반증**으로 처리됐다. 재검토 결과 그 일괄 처리가 과했다 — 범주 오류에 섞여 **실재하는 결함 3건**이 함께 기각됐다. 아래가 그 재판정이며, 판정 근거는 전부 이번 라운드의 실측이다.

### 추가 흡수 (실재 결함 — 초안이 잘못 기각했다)

| # | 지적 | 포착 | 실측 확인 | 조치 |
|---|---|---|---|---|
| 8 | Acceptance가 `"broken plugin root"` test를 참조하는데 그 test가 없고, Files to Change도 "추가한다"고 말하지 않는다 | invariant CRITICAL + HIGH | 현 test 6건 = `:40,46,60,77,92,101` — broken-module 축 **0건** | Task 2c가 신규 test **2건의 이름을 확정**. Files to Change에 "신규 test 2건 추가" 명시. Validation은 패턴 매칭 **개수**를 세어 0건이면 미완으로 실패 |
| 9 | 축 C의 grep 검증이 변수명 기반이라 `receiptPath`를 `p`로 바꾸면 통과한다 | test MEDIUM | `plan-codex-runner.js`에 정당한 fs write **7곳**(`:69,77,78,108,136,147,557,558`) — "fs 0건" 검사도 성립 불가 | 3축 동시 요구로 교체: `renameSync` **개수** 2→1(이름 불변) · store helper **호출 관측**(stub) · `b2` diff **+1/-0 & 가드 정의 무변경** |
| 10 | 새 mutating 함수를 `MUTATION_ENTRYPOINTS`에 등록하지 않아, 승인 writer 면제 아래 무책임 구역이 생긴다 | invariant CRITICAL | `staticLint:324`가 승인 writer를 **파일 단위 면제** · `entrypointRegistry:347-359`는 missing-only(초안 주장 참) · 그러나 `:52` 주석은 `목록 밖 = 실패`로 **선언** | 사용자 판정으로 **등록**(UI9 신설). 등록은 탐지 범위를 넓히지 않고 존재 단언만 추가하므로 강화 일방. 합격 증명을 "빈 diff"에서 **"1행 추가 외 변경 0"**으로 정밀화 |

### 추가 반증 — 이번엔 측정으로 답한다

| # | 지적 | 반증 근거 (실측) |
|---|---|---|
| 11 | `process.on('exit')`의 0 강제가 **정당한 fail-closed exit을 깨뜨린다** (test MEDIUM) | `session-start.js` 전체에서 exit code 대입은 **`:1102` `process.exitCode = 0` 단 1행**. 의도적 비영점 경로가 존재하지 않으므로 삼킬 신호가 없다. 이 사실 자체를 Task 2c의 test 단언으로 고정해 미래 회귀를 잡는다 |
| 12 | `measureA3` 5개 호출부 주장을 **끝까지 확인하지 못했다** (test MEDIUM — 검증 미완이라는 지적) | 전수 확인: `:26,70,92,131,257` 5건 모두 `repoRoot` 미전달로 실재. 추가로 `:197,326` 2건은 **이미 명시 전달** 중이며 plan의 "이미 올바른 형태" 서술과 일치 |
| 13 | baseline 봉인과 harness 생성 사이에 **시간 역설**이 있다 (invariant CRITICAL) | 역설의 전제가 틀렸다 — `B`는 harness가 아니라 오늘 트리에 있는 `node --test`로 측정한다(Task 0에 명시). harness는 baseline 측정기가 아니라 **실행 간 차이** 관측기이고, 위 `## 착수 전 실측` 4회도 harness 없이 얻었다 |
| 14 | Validation 명령이 forward reference라 **게이트가 실은 희망사항**이다 (invariant CRITICAL) | 관찰은 참이나 결론이 반대다. §Validation에 **실행 시점 계약** 표를 신설해 9개 전제 각각을 만드는 Task와 1:1로 고정했다 — 명령이 실행 불가로 남으면 그것이 **Task 미완의 기계적 증거**다. 오늘 실행 가능한 축(baseline · 기존 test · diff · 개수 검사)과 미래형 축이 2층으로 분리돼 있다 |

### 남은 상태

**게이트는 아직 통과하지 않았고 `mccp-plan-codex` receipt는 없다.** round 2 이후 편집(#6·#7 + 위 #8~#14)은 **어느 라운드에서도 검토되지 않았으므로** round 3의 대상이다. 이 라운드가 divergent면 receipt는 다시 작성되지 않고 `/mccp:prp-implement`는 계속 막힌다 — 그것이 정직한 상태다.

## L2 Review Panel — Round 3 흡수 (round 4 준비)

**verdict: divergent** (architect PASS · security FAIL · test FAIL · invariant FAIL — quorum 1/3). receipt 미작성. 전문은 `.claude/reviews/plan-review-gate-guard-integrity-m2.md`.

severity 분포는 개선됐다 — round 2는 blocking 14건 중 CRITICAL 4건, round 3은 blocking 11건 중 **CRITICAL 1건**. invariant의 round 2 CRITICAL 4건은 **전부 소멸**했고(`## 실행 시점 계약` 표 + UI9 등록이 실제로 응답했다), 남은 invariant 지적은 "문서가 아니라 기계가 강제하는가" 한 축으로 수렴했다. architect는 3라운드 연속 PASS이며 이번엔 baseline↔harness 독립성을 직접 확인했다.

### 흡수한 것

| # | 지적 | 포착 | Severity | 조치 |
|---|---|---|---|---|
| 15 | Acceptance("이후 갱신되지 않았다")와 본문("재측정으로 갱신되면")이 **서로를 부정**한다 | test CRITICAL + security·invariant MEDIUM (3인 동시) | CRITICAL | **수용.** "재측정"이라는 단어를 폐기. `B`의 측정은 **정확히 1회**이고 증거값과 다른 값이 나오는 것은 갱신이 아니라 **최초 확정**임을 명시. 두 번째 측정은 Task 0을 다시 여는 사건이며 plan을 고쳐 게이트를 다시 받아야 한다. 목표 이동 방어를 문서에서 **보존된 원본 TAP**으로 승격 |
| 16 | Task 4 (a)/(b)가 env policy와 classification의 **precedence를 규정하지 않는다** | security HIGH | HIGH | **수용.** 규칙 명문화: `MCCP_CODEX_DISABLED='1'`이면 `invokeResult`가 무엇이든 `env-policy`. 오라클은 하위 계층이 `disabled`를 준다는 사실에 **의존하지 않는다**(방어적 중복). (b)의 "env가 꺼져 있으면"을 "**미설정**"으로 명확화하고 (a)(b)(c) 3케이스를 실행 가능 형태로 신설 |
| 17 | `fail-open contract` 개수 검사가 test **이름**만 보므로 빈 stub도 통과한다 | test HIGH | HIGH | **수용.** `MCCP_TEST_SESSION_START_PATH`로 spawn 대상을 주입받게 하고, `git show HEAD:`로 꺼낸 **수정 전 스크립트에 같은 두 test를 돌려 FAIL을 요구**한다. 통과하면 stub이라는 판정이 exit code로 나온다 |
| 18 | `MCCP_PERF_INJECT_QUADRATIC`의 **소비 지점**이 명세되지 않았다 | test HIGH | HIGH | **수용.** 소비처는 `perf-budget.test.js` 자신이며 production `derive/`에는 test 분기를 넣지 않음을 명시. 더불어 판정을 순수 오라클 `judgeScaling`으로 분리해 **wall-clock 없는 in-suite 부정 케이스**를 만들었다 |
| 19 | `DISABLED=1` 케이스가 실행 가능 Validation에 없다 | test HIGH | HIGH | **수용.** 위 #16의 (a) 블록이 이것이다 |
| 20 | 부정 케이스가 `node --test` 게이트 밖 bash에 있어 "자동 탐지"가 "문서화된 의도"로 약화된다 | invariant HIGH | HIGH | **부분 수용.** 5개 축 각각에 **in-suite 1급 단언**을 배치하고 bash에는 오라클로 표현 불가능한 **통합 재현만** 남기는 표를 신설. 다만 "implement가 그 명령을 실제로 돌렸는지"를 강제하는 기계는 plan의 권한 밖이라 **해소했다고 주장하지 않고 잔여 한계로 명시**했다 |
| 21 | 경로 봉쇄 검사의 **알고리즘**이 미명세 — 순진한 `startsWith`는 symlink 탈출에 취약 | security MEDIUM | MEDIUM | **수용.** `path.resolve` → `path.relative` 3조건 → **부모 `realpathSync` 재검사** 순서를 고정. 대상 파일 자신은 rename 대상이라 부모 기준임도 명시 |
| 22 | Task 5의 skip 사유 A/B가 `grep "SKIP"`뿐이라 **사유 변경을 확인하지 않는다** | test MEDIUM | MEDIUM | **수용.** 수정 전 사유를 Task 0이 봉인하고, Validation이 `non-JSON` 부재 + `env-policy` 존재를 **동시에** 요구 |
| 23 | Validation이 **"파일 없음"과 "단언 실패"를 구분하지 않아** `Cannot find module`로 죽는다 | test MEDIUM | MEDIUM | **수용.** 전제 점검 preamble 신설 — 11개 전제를 이름으로 세어 `[TASK-INCOMPLETE]`로 보고하고 하나라도 없으면 중단 |
| 24 | `renameSync` 개수도 결국 문자열 매칭이라 주석·유사 이름에 오염된다 | test MEDIUM | MEDIUM | **수용.** 패턴을 `fs\.renameSync\s*\(` 호출 형태로 좁히고, **판정 권한을 위임 관측 test로 이관**. 개수 검사는 조기 경보로 강등하고 그 한계를 본문에 적었다 |
| 25 | exit-code 1곳 단언을 **어느 test가 소유하는지** 없다 | test MEDIUM | MEDIUM | **수용.** Task 2c의 두 번째 신규 test가 소유하며, `session-start.js` 원문에서 비영점 대입 0건을 단언한다고 명시 |
| 26 | M1 G1 IIFE 패턴을 인라인으로 보여주지 않는다 | security LOW | LOW | **미수용(형태 유지).** plan이 구현 코드를 담지 않는다는 경계는 유지한다. 다만 참조가 `hooks/receipt-prompt.js:27-30` · `hooks/receipt-skill.js:58-74`로 **행 단위까지 특정**돼 있어 구현자가 찾지 못할 위험은 낮고, 잘못 구현하면 #17의 수정 전 A/B가 잡는다 |

### 반증한 것

| # | 지적 | 판정 근거 |
|---|---|---|
| 27 | harness `--runs 10`의 5.6% 미포착률로 결정성을 증명하는 것은 **순환 검증**이다 (test HIGH) | 지적의 사실 부분은 옳고 **plan이 이미 같은 말을 하고 있다** — "결정적임의 증명이 아니라 10회 관측에서 divergence 없음"이라 적고 미포착 확률을 report 의무 기재로 못박았다. 표본으로 결정성을 증명하는 것은 원리상 불가능하므로, 가능한 정직한 형태는 **주장 범위를 관측 횟수로 한정하는 것**뿐이고 그것이 현재 형태다. 더 강한 주장을 하지 않는 문서에 "주장이 과하다"는 지적은 성립하지 않는다 |
| 28 | decision slug 충돌이 **문서화된 절차로만** 해소된다 (invariant MEDIUM) | 사실이다. 그러나 `/mccp:plan`의 slug 파생을 바꾸는 것은 **커맨드 본문(플러그인) 소관**이고 이 milestone의 범위(테스트 신호 신뢰도) 밖이다. 이 plan이 할 수 있는 것은 자기 호출을 올바른 형태로 고정하는 것이며 그것은 했다. 구조적 해소는 별건으로 남긴다 |

**decision slug 정정**: round 1·2는 `/mccp:plan`을 **PRD 경로**로 호출해 slug가 `gate-guard-integrity`였다. 그 slug의 `mccp-plan-codex` receipt는 **M1이 이미 소유**하고 있고(`created 2026-08-09`), `/mccp:prp-implement <plan>`이 파생하는 slug는 `gate-guard-integrity-m2`다. 즉 round 2가 통과했다면 M1 receipt를 덮어쓰면서 정작 M2 chain은 그것을 찾지 못했을 것이다. round 3은 **plan 경로**로 호출해 slug를 `gate-guard-integrity-m2`로 고정한다.

---

# Plan Review Panel — Round 5 (gate-guard-integrity-m2)

**Round 5 plan version**: `sha256:d240514091292512fbb0962b59506f0f43bc0ecbe5d4be3dd972a0affb47fd1c`
**Verdict**: divergent via multi-agent — **BLOCKED**, no receipt written
**Quorum**: 4/3 responses · 4 roles · passed=false — pass 1 / fail 3
**Reason**: `L2 quorum not satisfied: 7 blocking finding(s): architect/HIGH, architect/FAIL, test/HIGH, test/HIGH`

## Round-over-round

| Perspective | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| architect | pass | pass | pass | fail (CRITICAL+2H) | **fail (1H+2M)** |
| security | fail | pass | fail | pass (1M) | **pass (findings 0)** |
| test | fail | fail | fail | fail (0 H/C) | **fail (3H)** |
| invariant | fail | fail | fail | fail (0 H/C) | **fail (0 H/C — 1M+2L)** |

| 지표 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|
| blocking | 14 | 11 | 6 | **7** |
| CRITICAL | 4 | 1 | 1 | **0** |
| HIGH | 8 | 7 | 2 | **4** (architect 1 · test 3) |

**round 4의 자기참조 CRITICAL은 소멸했다** — L2 이력 94줄을 plan에서 리뷰 기록으로 이관한 것이 원인을 제거했다. **security는 findings 0건의 완전 통과**로, 10개 공격 벡터(path traversal · symlink 3종 · suffix 우회 · TOCTOU · Windows 교차 드라이브 · 신뢰 경계 이전 · 산출물 유출 · override 경로)를 모두 시도하고 취약점을 찾지 못했다고 기록했다.

## 구조적 관찰 — `test`는 만족 불가능한 축에 고정돼 있다

R5의 test HIGH 3건은 전부 같은 부류다: *"baseline이 implement 시점에 봉인되므로 review 시점에 검증 불가"* · *"env var를 어느 함수가 읽는지 코드로 보이지 않는다"* · *"Validation 명령이 오늘 실행되지 않는다"*. 같은 부류를 R2·R3·R4·R5 **네 라운드 연속** 제기했다. plan 문서가 이를 만족시키는 유일한 방법은 **이미 구현돼 있는 것**이며, 그것은 `/mccp:plan` → `/mccp:prp-implement` 분리의 폐기를 뜻한다.

**그러나 quorum은 4인 중 3인이다.** security가 이미 0건이고 architect·invariant의 잔여가 모두 구체적·소액이므로, **test 없이도 수렴이 가능하다** — 그 셋이 findings 0건을 내면 3/3이 성립한다.

## Round 5 findings

| Perspective | Severity | 요지 | 성격 |
|---|---|---|---|
| architect | HIGH | `classify`의 입력이 `{env, registryProbe, invokeResult}` 3개인데 Validation은 2개만 넘긴다 — `registryProbe`가 필수/선택/미사용인지 불명 | **타당·소액** |
| architect | MEDIUM | export 함수명이 Action에 없고 Validation 코드에서만 추론된다(`classify`) — 프로덕션 인터페이스가 test 코드로 암묵 정의됨 | **타당·소액** |
| architect | MEDIUM | baseline 봉인 강제가 존재 검사뿐 — 파일을 교체하고 통과시킬 수 있다. hash/timestamp seal 부재 | **타당·소액** |
| invariant | MEDIUM | helper가 throw하지 않고 객체를 반환하는데, **호출부가 그 반환값을 검사한다는 요구가 없다** — 격리 실패를 무시해도 lint는 통과 | **타당·날카로움** |
| invariant | LOW | Acceptance가 `stable:true`를 결정성과 동치로 취급 — 본문은 구분하는데 Acceptance 문장이 그러지 않는다 | 타당·소액 |
| invariant | LOW | 봉인 TAP이 비어있지만 않으면 통과 — TAP 형식 검증 없음 | 타당·소액 |
| test | HIGH ×3 | 위 "구조적 관찰" 참조 | **만족 불가 부류** |
| test | MEDIUM | `grep -q quarantineReceipt`가 주석·깨진 구문에도 통과한다 | 타당·소액 |
| test | MEDIUM | 신규 test 이름이 현재 파일에 없다(= Task 미완) | 계약대로의 forward reference |

## Round 5 refutation attempted

| Perspective | Verdict | 요약 |
|---|---|---|
| architect | fail | Task 0~7 전 구간 + Validation 일관성. M1 수정이 이미 적용됐음을 소스로 확인. Task 4 인터페이스와 Task 0 봉인 강제에서 경계 결함 3건. `process.on('exit')` stderr 의미론과 harness 직렬/병렬은 구현 상세로 판단해 **finding에서 제외** |
| security | **pass (0건)** | path traversal · symlink(경로/대상/부모) · suffix 특수문자 · TOCTOU · Windows 교차 드라이브 · 신뢰 경계 이전 · 산출물 유출 · override 경로 10종 공격. `store.js:25-36`·`:123-143`·`:246-252`를 직접 읽어 기존 방어와 정합함을 확인. **취약점 없음** |
| test | fail | baseline 시점 · env var 소비처 · Validation 실행 가능성 · test 이름 존재 · `grep` 정밀도 |
| invariant | fail | helper 반환값 미검사(fail-open drift) · harness 확률적 불건전성 · TAP 형식 미검증. **HIGH/CRITICAL 0건** |

---

# Plan Review Panel — Round 6 (gate-guard-integrity-m2)

**Round 6 plan version**: `sha256:dcc210d5f1e7eaee4abe91120f90c5e3cc670bfb5cc6a83cff2105d45a6f80b9`
**Verdict**: divergent via multi-agent — **BLOCKED**, no receipt written
**Quorum**: 4/3 responses · 4 roles · passed=false — **pass 2 / fail 2**
**Reason**: `L2 quorum not satisfied: 11 blocking finding(s): test/CRITICAL, test/CRITICAL, test/HIGH, test/HIGH`

**실행 주석**: 최초 발화(`wf_d520cec2-82d`)는 에이전트 4개가 모두 실행된 뒤 세션 종료로 결과 기록 없이 중단됐다. `l2.json` 부재였으므로 커맨드 5.2d 규정대로 정산하지 않고 debt marker pin 상태로 두었다가, transcript 4건이 실 launch를 입증하므로 `--actual 4`로 정산했다. plan은 동결 이후 무편집(해시 재계산 일치)이므로 재실행 대상은 동일 문서다.

## Round-over-round

| Perspective | R3 | R4 | R5 | R6 |
|---|---|---|---|---|
| architect | pass | fail (1C+2H) | fail (1H+2M) | **pass (0건)** |
| security | fail | pass (1M) | pass (0건) | **pass (0건)** |
| test | fail (1C+4H) | fail (**H/C 0**) | fail (3H) | fail (**2C+3H**) |
| invariant | fail (2H) | fail (**H/C 0**) | fail (**H/C 0**) | fail (**2C+2H**) |

## 관측: 판정이 문서 품질과 단조 관계가 아니다

**`invariant`는 R4·R5에서 HIGH/CRITICAL 0건이었다가 R6에서 CRITICAL 2건을 냈다.** 그 사이 plan은 invariant 자신이 R5에 지적한 3건(반환값 미검사 · Acceptance 문장 · TAP 형식)을 모두 흡수했고 명세가 더 구체화됐을 뿐이다. `test`도 R4의 H/C 0건 → R5 3H → R6 2C+3H로 같은 방향으로 움직였다. **문서가 나빠져서 verdict가 나빠진 것이 아니다.**

`architect`는 pass → fail → fail → pass로 왕복했다. 4개 라운드 × 4개 역할의 표본이므로 통계적 주장은 하지 않되, **동일 문서 계열에 대해 같은 역할이 라운드마다 다른 severity를 낸다**는 것은 위 표가 보여주는 사실이다.

## R6 blocking의 성격

`test` 2 CRITICAL · `invariant` 2 CRITICAL은 **한 부류로 수렴한다** — "Validation 명령이 오늘 실행되지 않는다 / plan이 implement의 준수를 기계적으로 강제하지 못한다".

| # | 지적 | 판정 |
|---|---|---|
| invariant C1·C2 | baseline 봉인과 forward-reference 명령이 **implement를 기계적으로 막지 못한다** | plan `## Validation`의 **"잔여 한계 — 명시한다"** 절이 정확히 이 사실을 자백한 문장이다. 리뷰어는 그 자백을 인용해 CRITICAL 근거로 삼았다. round 4 architect의 자기참조 CRITICAL(리뷰 이력을 담았다는 이유로 실패 판정)과 **같은 형태** — 정직한 한계 기술이 결함 증거로 회수된다 |
| test C1 | 같은 부류(Task 0 산출물을 Validation이 참조하는 순환) | 위와 동일 축. `B`는 Task 0이 만들고 Validation이 그것을 검사하는 것이 설계이며, 그 순서를 순환이라 부르면 어떤 사전 봉인도 불가능하다 |
| test C2 | `MCCP_TEST_SESSION_START_PATH`를 **`runSessionStart`가 읽는다**는 문장이 없다 | **부분 타당·1문장.** plan은 "spawn 대상 경로를 주입받는다 … 신규 env가 그 통로다"라고 적었으나 소비 함수를 명시하지 않았다 |
| test H×3 · invariant H×2 | `judgeScaling` export 위치 · smoke test의 env 격리 · 경로 검증의 직접 test · 주입 지점 재지적 | 대부분 1~2문장으로 닫히는 명세 공백 |

## R6 refutation attempted

| Perspective | Verdict | 요약 |
|---|---|---|
| architect | **pass (0건)** | 5개 렌즈: plan↔implement 경계(Files to Change 전수 대조 + glob으로 미존재 확인) · baseline 순환 의존(**harness와 독립임을 확인**) · forward-reference 범위(`:305` 근거 인용) · Task 6 관심사 분리(`fs.renameSync` 정확히 2건 `:78,:248` grep 확인, store.js가 승인 writer임 확인, 레지스트리 3→4 확인) · 불변식 강제(sha256이 예방이 아니라 탐지임을 인정한 서술까지 확인). **구조 결함 없음** |
| security | **pass (0건)** | 신뢰 경계(`classify` 입력은 test가 통제 · `quarantineReceipt` 경로/suffix 양쪽 fail-closed) · 변조면(symlink-safe `realpath` + `path.relative`, 레지스트리 추적) · precedence(env 우선 강제·test됨) · 유출(에러 경로 정제, baseline hash 봉인) · 우회(신규 env 토글 없음, 반환값 검사 강제, 미지 enum fail-closed, 14종 커버리지). **HIGH/CRITICAL 없음** |
| test | fail | baseline 순환 · env var 소비 함수 미지정 · `judgeScaling` export 위치 · smoke env 격리 · 경로 검증 직접 test 부재 |
| invariant | fail | baseline 봉인의 fail-closed 부재 · forward-reference가 implement를 못 막음 · Validation 실행 불가 · 주입 지점 |

## Round 6 후속 — quorum 하향 시도와 그 결과 (기록)

round 6 이후 `MCCP_PLAN_REVIEW_QUORUM=2of4`로 통과 기준을 낮춰 **에이전트 추가 소모 없이** 재판정을 시도했다. 결과는 `required:2`가 적용됐음에도 `passed:false`였다.

원인은 [quorum.js](../../plugins/mccp/scripts/lib/msw-metrics/../plan-review/quorum.js) 모듈 헤더가 명시한 설계다:

> *"A single HIGH/CRITICAL finding — or a single explicit `fail` verdict — sinks the panel regardless of how many others passed. Approval here means **'nobody found anything'**, not 'most people were happy'."*

- `MCCP_PLAN_REVIEW_QUORUM`은 **몇 명이 응답했는가**(M)만 정한다. 몇 명이 승인했는가가 아니다.
- `MCCP_PLAN_REVIEW_ROLES_MIN`은 **응답의 관점 다양성**(K)만 정한다.
- `blockSeverity`는 함수 인자일 뿐 env 바인딩이 없고, `verdict === 'fail'`을 blocking으로 미는 경로는 **무조건**이다(`quorum.js:174-180`).

따라서 **어떤 env 토글로도 "일부 리뷰어가 fail인 채로 통과"를 만들 수 없다.** 이 게이트의 통과 조건은 사실상 **응답한 전원이 `pass` + HIGH/CRITICAL 0건**이다. round 6에서 architect·security가 그 조건을 충족했고 test·invariant는 6라운드 내내 충족한 적이 없다.

`mode.json`은 기본값(3of4)으로 복원했다.

---

# Plan Review Panel — Round 7 (gate-guard-integrity-m2)

**Round 7 plan version**: `sha256:b0c995f5bea7142cea12710db8a8ac750812ed856327a0629d53614c965d1f56`
**Verdict**: divergent via multi-agent — **BLOCKED**, no receipt written
**Quorum**: 3/3 responses · 3 roles · passed=false — pass 2 / fail 1 / **비응답 1**
**Reason**: `L2 quorum not satisfied: 5 blocking finding(s): invariant/HIGH ×4 + invariant/FAIL`

**L1이 먼저 잡은 것**: 최초 L1 실행이 `C6_UNRESOLVED_CITATION`(`session-start-bootstrap.test.js:18`을 전체 경로 없이 인용)을 검출해 **L2를 발화시키지 않았다**. 예약은 `--actual 0`으로 정산했고, 인용을 repo-root 전체 경로로 고친 뒤 L1 converged를 받고 재발화했다. 기계 계층이 편집 오류를 실제로 차단한 사례다.

**test 비응답**: `test` 리뷰어가 StructuredOutput을 호출하지 않고 종료해 결과가 `null`이다. 리뷰 결과가 아니라 **harness 수준 실패**이며, quorum은 이를 비응답으로 fail-closed 처리했다(responded 3/4).

## Round-over-round

| Perspective | R4 | R5 | R6 | R7 |
|---|---|---|---|---|
| architect | fail (1C+2H) | fail (1H+2M) | **pass (0건)** | **pass (0건)** |
| security | pass (1M) | **pass (0건)** | **pass (0건)** | **pass (0건)** |
| test | fail (H/C 0) | fail (3H) | fail (2C+3H) | **비응답(null)** |
| invariant | fail (H/C 0) | fail (H/C 0) | fail (2C+2H) | fail (**4H+4M**) |

| 지표 | R4 | R5 | R6 | R7 |
|---|---|---|---|---|
| blocking | 6 | 7 | 11 | **5** |
| CRITICAL | 1 | 0 | 4 | **0** |

**architect·security는 2라운드 연속 findings 0건**이다. R7의 blocking은 전부 `invariant` 한 역할에서 나왔고, CRITICAL은 0건이다.

## R7 invariant findings — 하나의 축으로 수렴했다

지난 라운드들의 "forward reference" 부류와 달리, R7의 지적 8건은 **baseline 봉인의 시간적 순서를 기계가 증명하지 못한다**는 단일 축이며 **구체적이고 고칠 수 있다**.

| # | Severity | 요지 | 판정 |
|---|---|---|---|
| 1·3·5·6 | HIGH ×4 | "Task 1~7 착수 **전에** 봉인"은 **시간 순서** 속성인데, Validation은 sha256 **일치(consistency)** 만 증명한다. implement가 Task 1~7을 먼저 돌리고 나중에 baseline을 써도 해시는 맞으므로 통과한다. git 이력이면 시점을 증명할 수 있으나 Validation이 그것을 검사하지 않는다 | **타당.** 순서 증명과 일치 증명을 혼동한 것이 맞다. `git merge-base --is-ancestor`로 baseline 커밋이 Task 산출물 커밋의 조상임을 검사하면 **기계적 순서 증명**이 된다 |
| 2 | MEDIUM | TAP 형식 검사가 헤더 **존재**만 보고 값의 파싱 가능성을 안 본다 — `# pass abc`도 통과 | 타당·소액 |
| 4 | MEDIUM | `head -1`이 report에 seal 줄이 여러 개일 때 조용히 첫 줄을 취한다 | 타당·소액. **정확히 1줄**을 요구하면 닫힌다 |
| 7 | MEDIUM | 전제 점검이 파일 **존재** gate이지 봉인 계약의 **무결성** gate가 아니다 | 위 1·2·4의 상위 서술 |
| 8 | MEDIUM | 2c-B의 "또는"이 진단 미완을 허용한다 | **설계된 것.** 재현이 25% 사건이므로 2c-A(무조건)와 분리했고 미확정은 PRD로 승계한다고 명시했다. Risks 표에도 있다 |

## R7 refutation attempted

| Perspective | Verdict | 요약 |
|---|---|---|
| architect | **pass (0건)** | Files to Change 전 경로가 repo-root full path임 확인 · Patterns to Mirror 6건 전수 실재 확인 · `plan-codex-runner.js`의 `fs.renameSync` 정확히 2건(`:78,:248`) · `plugin.json`이 현재 1.23.7임 확인 · Task 0→1~7 순서와 2c-A/2c-B 분리가 순환을 제거함 · UI9 레지스트리 변경이 1행으로 상한 고정되고 가드 4종 무변경이 기계 검사됨 · 주입 스위치의 production 누출 역방향 grep · cross-model 미획득을 거짓 주장 없이 명시함 |
| security | **pass (0건)** | 적대 시나리오 3종 end-to-end 추적(suffix separator · symlink traversal · 변수명 rename으로 위임 우회) 전부 차단 확인 · fail-open 강제와 marker 방출 · 오라클의 env precedence · `MUTATION_ENTRYPOINTS`가 store.js 일괄 승인의 보완 통제임 확인. **누출 경로 없음** |
| test | — | StructuredOutput 미호출로 결과 없음(harness 실패) |
| invariant | fail | baseline 봉인의 순서 증명 · TAP 형식 견고성 · 해시 유일성 · 전제 점검의 성격 · 2c 분리 |

---

# 종결 — 감사 가능한 수동 receipt (round 7 이후)

round 7의 invariant HIGH 4건(전부 **baseline 봉인의 순서 증명** 단일 축)과 MEDIUM 2건을 흡수한 뒤, 운영자 판단으로 감사 override 경로를 통해 `mccp-plan-codex` receipt를 작성했다. 패널은 **수렴하지 않았고**, receipt는 그 사실을 숨기지 않는다.

## 마지막에 흡수한 것

| 지적 | 조치 |
|---|---|
| HIGH ×4 — 해시 봉인은 *일치*를 증명하지 *순서*를 증명하지 않는다. Task 1~7을 먼저 돌리고 나중에 baseline을 써도 통과한다 | **커밋 이력으로 순서를 증명**한다: baseline TAP은 자기 커밋 하나로 먼저 커밋하고, §Validation이 `git merge-base --is-ancestor`로 그 커밋이 Task 1 산출물 커밋의 조상임을 확인한다. 더불어 **TAP을 건드린 커밋이 정확히 1개**여야 하므로 재측정이 기계적으로 닫힌다(두 번째 측정은 반드시 두 번째 커밋을 남긴다). sha256은 working-tree 변조를 잡는 보조 축으로 남는다 |
| MEDIUM — TAP 형식 검사가 헤더 존재만 본다(`# pass abc`도 통과) | 값이 `^# (tests\|pass\|fail) [0-9]+$`로 파싱돼야 한다 |
| MEDIUM — `head -1`이 seal 줄 다수일 때 조용히 첫 줄을 취한다 | seal 줄이 **정확히 1개**임을 요구 |
| MEDIUM — 2c-B의 "또는"이 진단 미완을 허용한다 | **반증.** 재현이 25% 사건이라 2c-A(무조건 착지)와 2c-B(조건부)를 분리한 것이 설계이고, 미확정은 PRD Open Questions로 승계한다고 명시돼 있으며 Risks 표에도 있다 |

## receipt가 봉인한 것

| 필드 | 값 | 의미 |
|---|---|---|
| `intent_gate_verdict` | `incomplete` | **실제 blocking verdict가 그대로 봉인됐다** — 통과로 위조하지 않았다 |
| `intent_gate_force_override` | `true` | 감사 override가 쓰였다는 사실 자체가 기록됐다 |
| `intent_gate_force_override_reason` | (전문) | 7라운드 미수렴 · architect/security 0건 · invariant 흡수 · 운영자 판단 |
| `resolution.codex_verdict` | **부재** | cross-gate dedupe는 부재를 fail-closed로 읽는다 → `/mccp:pr`에서 **PR-Codex가 실제로 발화한다**. dual-review는 우회되지 않았다 |
| `resolution.converged` | `true` | write.js의 default이며 **신뢰 불가 필드**다(CLAUDE.md §3.12). 완료 판정 키는 `codex_verdict`이고 그것이 부재다 |

`/mccp:prp-implement`의 chain validate는 `ok:true`다. 그러나 **이 receipt는 "패널이 승인했다"를 의미하지 않는다** — 이 PRD가 지목한 "통과 신호의 존재가 검사가 일어났음을 의미하지 않는다"를 스스로 반복하지 않기 위해, 그 구분을 여기 명시해 둔다.

## 남은 미해소 (PRD로 승계 대상)

- `test` 리뷰어가 7라운드 내내 "구현이 없어 오늘 실행 불가"라는 축에 고정됐다. plan 단계에서 원리상 만족 불가이며, round 7에서는 응답 자체를 실패했다(harness 결함).
- 패널의 통과 조건이 사실상 **응답 전원 pass + HIGH/CRITICAL 0건**(`quorum.js` 헤더 명시)이라, "리뷰어는 항상 공격하라"는 계약과 결합하면 plan 문서가 수렴하기 매우 어렵다. `diverse-agent-review` PRD의 입력 증거다.
- 판정이 문서 품질과 단조가 아니다 — `invariant`가 R4·R5 HIGH/CRITICAL 0건 → R6 CRITICAL 2건, `architect`가 pass→fail→fail→pass→pass로 왕복했다.
