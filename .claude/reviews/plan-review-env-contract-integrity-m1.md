# Plan Review Panel — env-contract-integrity-m1

**Plan**: `.claude/plans/env-contract-integrity-m1.plan.md` · **Plan version**: `sha256:1e4806b94f046698958fe1ed071285ba88ad6e08be11303bc9fbbf1f635373da`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 10 blocking finding(s): architect/FAIL, test/CRITICAL, test/HIGH, test/HIGH — MCCP_REVIEW_SINGLE_PASS=deadline_pressure 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | Pattern citations for 'Patterns to Mirror' are accurate file:line references | Plan line 39 cites `plugins/mccp/scripts/state/toggle-snapshot.js:13` for TOGGLE_EXCLUSIONS pattern. Verification: Line 13 contains only a comment continuation ('// 이전에는 여기에...'). The actual `const TOGGLE_EXCLUSIONS = Object.freeze({` definition is at line 50, and the pattern description ('제외는 정규식이 아니라 이름이고') is at lines 42-44. Off by 37 lines. Plan line 40 cites `plugins/mccp/scripts/lib/env-contract/scan.js:70` for walkSurfaces pattern. Verification: Line 70 contains JSDoc parameter documentation ('@param {string} repoRoot'). The function definition is at line 73, and the single-owner pattern description ('범위를 **모듈로 지정**한다') is at lines 4-8. These are systematic citation errors in a table specifically titled 'Patterns to Mirror' where accuracy is load-bearing. |
| architect | LOW | Vocabulary deriver completeness is structurally enforced across registry and vocabulary.js | Plan Task 1 describes creating DERIVERS table with hook-ids deriver. Plan Task 2 says vocabulary column can contain `{ derive: '<name>' }`. Plan Task 7 Test list mentions testing 'derivers' but does not explicitly specify verifying that every `{ derive: X }` in registry.js vocabulary column has a corresponding implementation in vocabulary.js DERIVERS export. No cross-reference validation is described. If someone adds `{ derive: 'undefined-deriver' }` to registry without adding it to vocabulary.js's DERIVERS table, the validation would fail at lint execution, but this boundary is not explicitly described in the design. The plan relies on implicit test coverage rather than explicit design for this critical coupling point. |
| test | CRITICAL | L10 검사가 `MCCP_PLAN_REVIEW=off` 불일치를 실제로 잡는다 | Plan Acceptance line 243: 'L10이 D1(MCCP_PLAN_REVIEW의 off)을 실제로 잡는다 — 격리에서 잠시 빼고 red를 확인한 뒤' + Validation line 199: 'L1~L10 전부 통과' exit 0. 이 둘은 상호배타적: 격리에서 빼면 lint 실패(red), 격리 유지하면 L1~L10 ok(green). Acceptance는 manual one-shot test이고 자동회귀는 없으므로 수정 후 L10이 계속 작동하는지 검증할 길이 없다. |
| test | HIGH | 격리 stale 규칙이 L10에 의해 강제된다 (격리 항목이 더 이상 불일치하면 실패) | Plan DD3-ii: '격리 항목이 **더 이상 불일치하지 않으면 problem**'. Acceptance line 244: '격리 항목 하나의 expected를 코드와 일치시키면 L10이 red가 되는지 1회 확인'. 하지만 이는 manual one-shot test이고, lint.test.js에 이 규칙을 검증하는 고정된 fixture가 명시되지 않았다. 토글 수정 후 L10이 계속 stale 항목을 거부하는지 회귀 테스트가 없다. |
| test | HIGH | Task 1 (vocabulary.js 생성)의 Validate가 실행 가능하다 | Plan Task 1, line 135: 'Validate: node --test plugins/mccp/scripts/lib/env-contract/tests/vocabulary.test.js'. 하지만 vocabulary.test.js는 Task 7에서 CREATE된다. Task 1이 완료되었을 때 이 test 파일은 존재하지 않으므로 Validate 명령은 fail할 것이다. Task 간 순서 의존성이 Validate 라인에 반영되지 않았다. |
| test | MEDIUM | `doctor` CLI가 실사용 3건 사례를 검출한다 | Plan Acceptance line 246: 'node .../cli.js doctor를 이 저장소에서 돌려 **실사용 3번째 사례의 반증(G1)이 출력에 나타나는지** 확인'. 하지만 Validation section의 CLI 테스트(line 205-207)는 '경로가 도는지'만 확인하고 출력을 검증하지 않는다. Task 7의 cli.test.js는 '**실제 spawn** — 3 서브커맨드 곱하기 종료코드'만 테스트한다고 했지 출력 검증은 없다. 실제 defect 감지를 검증하는 test fixture가 명시되지 않았다. |
| test | MEDIUM | 정적 추출 실패 개수를 측정하고 보고한다 | Plan Acceptance line 245: '정적 추출 실패 개수를 실측해 적는다 — 36개 중 vocabularyGap으로 남은 수'. Risk mitigation (line 225): 'Task 1에서 **못 읽은 개수를 실측해 보고**하고 그 수를 Acceptance에 적는다'. 하지만 Validation 1-6에는 이 개수를 세는 명령이 없다. Task 7 vocabulary.test.js도 '빈 배열 금지'만 명시했지 vocabularyGap 개수를 세는 test는 없다. 측정 방법과 검증 방법이 명확하지 않다. |
| test | MEDIUM | L10 lint 검사는 enum 항목마다 values와 코드 어휘를 집합 비교한다 | Plan Task 3, line 145: 'enum 항목마다 어휘를 해석해 values와 **집합 비교**'. 하지만 현재 lint.js(line 1-439)에는 L1-L9만 구현되어 있고 L10은 없다. Task 7에서 lint.test.js를 'L10 pass/fail/stale-quarantine' cases로 UPDATE한다고 했지만 test case의 구체적 형태나 assertion이 명시되지 않았다. 기존 L1-L9 fixture(예: test 'L1...', line 128)처럼 L10 fixture가 어떻게 설계될지 알 수 없다. |
| test | MEDIUM | Task 6 Validate 경로가 실제로 완주된다 | Plan Task 6, line 181: 'Validate: node plugins/mccp/scripts/lib/env-contract/cli.js doctor를 이 저장소에서 실제로 1회 완주'. 파일 경로는 올바르지만 환경 조건이 명시되지 않음. doctor 명령이 성공하려면 settings-layers.js(Task 4)와 doctor.js(Task 5)가 모두 생성되어야 함. Task 간 의존성이 Validate 라인에 반영되지 않았으므로 Task 순서대로 실행했을 때 Task 6 Validate가 실패할 가능성이 있다. |
| invariant | CRITICAL | L10 check blocks landing when contract-vocabulary mismatches exist | Plan line 9: '착지가 전면 차단' (landing blocked), line 13: '기존 9건이 red가 되어 착지가 전면 차단' — but line 248 Acceptance explicitly confirms 'hook 등록 0건, receipt 0건' (no hook, no receipt). Lint.js is invoked only manually per Validation 1 (line 199: 'node plugins/mccp/scripts/lib/env-contract/lint.js'). No hook in plugins/mccp/scripts/hooks/ calls lint. This creates fail-open drift: L10 can be bypassed by not running the manual command. |
| invariant | CRITICAL | Quarantine stale check (DD3-ii) will detect when fixed mismatches are still quarantined | Plan DD3-ii (line 145): '격리 항목이 더 이상 불일치하지 않으면 problem' (fixed quarantines fail). But enforcement requires L10 to be invoked. Since L10 is manual-only with no hook, a developer can fix the underlying code issue in M2, but the quarantine will persist indefinitely if nobody manually runs lint. No automatic skip-predicate prevents this. |
| invariant | HIGH | Initial QUARANTINE table state is specified in Task 1 | Plan Task 1 (line 133) specifies vocabulary.js exports QUARANTINE array but does NOT list what items populate it. Acceptance (line 243) requires L10 to catch 'MCCP_PLAN_REVIEW=off' (D1), which is a known mismatch. But if QUARANTINE is empty initially, L10 will fail immediately (Validation 1 line 199 requires 'exit 0'). If QUARANTINE is pre-populated, the plan must show that content but does not. This creates ambiguity about whether the plan's own validation passes. |
| invariant | HIGH | Doctor command provides diagnostic output independent of enforcement gates | Plan DD6 (line 248 Acceptance): 'hook 등록 0건, receipt 0건 — `doctor`가 어�한 게이트에도 배선되지 않았음을 grep으로 확인' (no hook/receipt — doctor not wired to any gate). Plan line 179: '종료코드는 0/1/2... 어떤 hook도 게이트도 이 코드를 읽지 않는다' (no gate reads doctor exit code). This means while doctor outputs findings, those findings have no mechanical impact on whether work can proceed. This violates the invariant that user-visible contract violations block landing. |
| invariant | MEDIUM | Vocabulary extraction failures are handled fail-closed | Plan Task 1 (line 131): extraction returns '{ ok:false, reason }' if it fails, and 'never return empty array'. Task 3 (line 145): 'vocabulary gap이 있으면 정보, 없으면 problem(fail-closed)'. But what happens when extractConstant returns ok:false? Does it block L10? If so, the plan must specify the test case (Acceptance line 245 says to 'report the gap count' suggesting gaps are acceptable). If gaps are acceptable, then L10 doesn't actually check those vocabularies — creating a silent skip of affected checks. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | Verified all 7 pattern citations against actual source code line numbers. Checked toggle-snapshot.js lines 1-50 and verified TOGGLE_EXCLUSIONS is at line 50, not 13. Checked scan.js lines 1-80 and verified walkSurfaces function is at line 73, not 70, and pattern description is at lines 4-8. Verified the other 5 pattern citations are correct (readFile at line 46, USAGE at line 712, decide function around line 229, value.js at line 120, settings-writer.js at line 21). Examined the design for deriver existence verification and found no explicit cross-reference check specified in Tasks 1-7. Reviewed Tasks 1-8 for vocabulary extraction, quarantine table completeness requirements, and doctor oracle boundary design. No structural logic errors found in the core design itself; the primary defect is citation accuracy for patterns claimed to be mirrored." |
| security | pass | Examined trust boundaries: path traversal in settings-file loading (safe — hardcoded tiers), environment variable injection (safe — MCCP_* only per line 168), value parsing (safe — delegates to existing value.js fallback logic), vocabulary extraction (safe — ASCII-only NAME_RE prevents homoglyphs). Checked data handling: values intentionally surfaced in findings (line 247) as diagnostic tool, not a security gate (DD6 line 98). Checked layer merging: precedence (local > project > user) implied by acceptance test line 247 and G1 line 66; one-layer-failure resilience stated line 151. No path traversal, privilege escalation, or uncontrolled data leakage pathway found. Plan correctly positions doctor as non-gate diagnostics; output sensitivity is operational responsibility, not design defect. |
| test | fail | **공격 대상:** 1. Acceptance/Validation 간 일관성 — Acceptance는 manual quarantine remove→red verify→restore 요구, Validation은 lint exit 0 요구. 상호배타적인지 추적. 2. 자동회귀 테스트 부재 — L10, stale quarantine, vocabulary extraction 모두 Acceptance에 manual one-shot 검증만 있고 lint.test.js fixture 명시 부재. 3. Task 간 의존성 — Task 1 Validate가 Task 7에서 create되는 파일 참조. 4. CLI 테스트 coverage — doctor 명령이 실제 defect를 감지하는지 검증하는 test 미명시. 5. 기존 코드 기준 — 현재 lint.js에는 L1-L9만 있고 L10 구현 0. 계획의 검증 명령은 L10을 가정. **검사 결과:** Validation 1~6 명령들이 정의한 합격 기준과 Acceptance 체크리스트의 manual 항목들 사이에 불일치 발견. 특히 L10과 quarantine stale 규칙은 자동 회귀 없이 manual 일회성 검증만 있어, 향후 변경 시 defect 감지 장치가 깨져도 알 길이 없다. |
| invariant | fail | Tested five threat vectors: 1. **HALT-vs-degrade path**: Verified lint.js has no automatic invocation from any hook (grep -r 'env-contract.*lint' in hooks/ yields 0). Confirmed doctor is explicitly NOT wired to gates (line 248). Found no gate that would block if L10 fails. 2. **Quarantine stale enforcement**: Traced the dual-direction check DD3-ii and found no automatic invocation path. L10 only runs manually. Confirmed no mechanism forces re-evaluation after M2 fixes the code. 3. **Receipt anchoring**: Verified explicit non-existence: line 248 Acceptance states 'hook 등록 0건, receipt 0건' (no hook/receipt). Confirmed no decision_id or receipt_hash would seal verdict. 4. **Initial QUARANTINE state**: Read Task 1 and registry.js; Task 1 specifies QUARANTINE export but no content. Cross-referenced with Acceptance line 243 test requirement for D1 catch. Found specification gap. 5. **Vocabulary extraction error path**: Traced Task 1 (line 131 empty-array prohibition) through Task 3 (line 145 gap handling). Found that 'problem' status is mentioned but unclear whether it blocks L10 or just reports. Acceptance line 245 suggests gap reporting is expected outcome. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 364106,
  "halt_stage": null,
  "backlog_appended": 8,
  "backlog_skipped_nonblocking": 7,
  "granted": 4,
  "reviewed_plan_hash": "sha256:1e4806b94f046698958fe1ed071285ba88ad6e08be11303bc9fbbf1f635373da",
  "plan_path": ".claude/plans/env-contract-integrity-m1.plan.md",
  "recorded_at": "2026-08-21T01:41:06.502Z"
}
```
