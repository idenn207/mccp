# Plan: diverse-agent-review #6 — 설치된 런타임에서 패널을 실측한다

**Source PRD**: `.claude/prds/diverse-agent-review.prd.md`
**Selected Milestone**: #6 — 설치된 런타임에서 통과 경로 관측 (관측 결과에 따라 Outcome 재정의)
**Complexity**: Small

## Summary

M6는 원래 "패널 승인 경로 1회 완주"를 목표로 했다. 그 목표를 향해 이 plan 자신이 게이트를 **4회 라이브로 완주 시도**했고, 결과는 승인이 아니라 **데이터**였다. 이 plan은 그 데이터를 milestone의 산출물로 삼는다 — 목표를 낮추는 것이 아니라, PRD의 지표 정직성 규칙(UI3)이 요구하는 대로 **관측된 것을 관측된 대로 적는** 것이다.

선행 조건은 해소돼 있었다: 캐시 `1.23.8`에 `record.js`·`budget.js`가 있고 `mccp:review-*` 4종이 세션 레지스트리에 등록돼 있으며 `cli.js mode`가 `multi-agent`(quorum 3of4)를 반환한다. **막힌 것은 런타임이 아니라 승인이었다.**

세 관측이 나왔고(아래 `## Observations`), 그중 하나는 M4가 만든 계측 표면 자체의 결함이다 — 4회를 돌렸으나 디스크에 남은 레코드는 1건이다. 이 milestone은 그 셋을 PRD에 기입하고, 미달로 남는 축(통과 경로·budget 라이브 발화)과 새로 열린 축(quorum 캘리브레이션)을 각각 신규 milestone에 넘긴다.

**통과 경로 wall-clock 지표는 여전히 forward-only다.** 4회 시도했고 4회 모두 승인이 나지 않았으므로 표본은 0이며, 그것을 달성으로 적지 않는다(UI3).

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | Codex를 완전히 제거하지 않는다 — hybrid opt-in으로 존속시킨다 | exclusion |
| UI2 | 모든 게이트를 동시에 전환하지 않는다 — 점진적으로 간다 | exclusion |
| UI3 | 산출 이력이 0인 지표는 달성이 아니라 forward-only로 적는다 | constraint |
| UI4 | L3 자동 트리거 임계 튜닝은 이번 실측 확보 전에 착수하지 않는다 | constraint |
| UI5 | 회귀 test는 수정 전 실패를 실측한 것만 인정한다 | constraint |
| UI6 | 게이트 배선 오라클 추출 전까지 배선 추가를 최소화한다 | constraint |
| UI7 | receipt schema version bump 없이 present-only 필드로 처리한다 | exclusion |
| UI8 | milestone 표의 행 순서가 곧 실행 순서이며 next pending 선택도 이를 따른다 | direction |
| UI9 | Gemini 등 다른 외부 모델을 도입하지 않는다 | exclusion |
| UI10 | 실행 가능함은 실행됨이 아니다 — 시뮬레이션을 라이브 발화의 증거로 쓰지 않는다 | constraint |
| UI11 | 머지·배포된 뒤에만 관측 가능한 항목은 그 milestone의 것이 아니다 | direction |
| UI12 | 통과 경로 wall-clock 실측치를 Success Metrics 표에 기입한다 | direction |
| UI13 | budget 라이브 발화는 M6에서 떼어 별도 milestone으로 이관한다 | exclusion |
| UI14 | 4회 실행이 드러낸 관측 결과로 M6를 재정의하고 추가 패널 실행은 하지 않는다 | direction |

## Observations

이 milestone의 산출물이다. 셋 다 이 저장소에서 라이브로 관측됐다.

### O1 — 패널은 4회 라이브 실행에서 승인을 0건 발급했다

대상은 이 plan이며, 매 라운드 직전 라운드의 findings를 전량 흡수한 뒤 재제출했다. L1은 4회 모두 `converged`(violations 0)였으므로 막힌 것은 mechanical 층이 아니라 L2다.

| 라운드 | 패널 findings | 관점 verdict | quorum |
|---|---|---|---|
| R1 | 24 | architect·security·test·invariant 전원 `fail` | 미충족 |
| R2 | 8 | security·test `fail` · **invariant `pass`** · architect 무응답 | 미충족 |
| R3 | 7 | architect·security·test `fail` · **invariant `pass`** | 미충족 |
| R4 | 19 | 전원 `fail` | 미충족 |

관점 단위로는 **16회 중 `pass` 2회**다. R3→R4에서 findings가 7→19로 역전했는데, 그 사이 변경은 축 B(운영자 수동 절차) 제거를 위한 구조 재편이었다 — 즉 **표면을 줄이려는 재편이 새 표면을 만들었다**. PRD Risks의 "결함 수정이 새 결함을 만듦(High, 실증)"과 같은 형태가 plan 층에서 재현된 것이다.

이 수치는 승인 품질(false-approve 비율)에 답하지 않는다. 답하는 것은 그 앞의 질문이다 — **승인이 발급되는가**. 표본 4에서 답은 아니오다.

### O2 — 차단 경로 wall-clock은 4회 모두 목표(10분) 이내였다

`307,578` · `342,767` · `321,954` · `280,209` ms — 평균 약 313초(5.2분), 최대 5.7분. PRD Success Metrics의 통과 경로 목표는 ≤10분이고, 차단 경로는 패널 4개 발화 + 판정까지를 포함하므로 통과 경로가 이보다 크게 느릴 이유는 없다. 다만 **이는 차단 경로의 수치이며 통과 경로 지표를 대신하지 않는다**(UI3, UI10 — 인접 측정을 목표 측정으로 승격하지 않는다).

**증거 강도는 균일하지 않다.** R4(`280,209`)만 `.claude/reviews/plan-review-diverse-agent-review.md`에 파일로 남아 있고, R1–R3 수치는 각 라운드 `cli.js record` stdout을 세션에서 관측한 것이다 — 그 이유가 O3이다.

### O3 — 계측 표면은 라운드 축적을 지원하지 않는다 (M4 계측의 결함)

레코드 경로는 `.claude/reviews/plan-review-<decision_slug>.md`이고 slug는 **PRD 경로**에서 파생된다(`derive-decision --args .claude/prds/diverse-agent-review.prd.md` → `diverse-agent-review`, 실측). `cmdRecord`는 그 경로에 무조건 덮어쓴다. 따라서 **같은 결정에 대한 재실행은 이전 기록을 지운다** — 4회를 돌렸고 디스크에 남은 레코드는 1건이다(실측).

이것은 M4가 닫았다고 선언한 결손의 남은 절반이다. M4는 계측을 *통과 경로 편향*에서 구했지만(차단 경로도 기록되게), **재실행 편향**은 남겨뒀다: 한 결정에 대해 마지막 실행만 남으므로, 수렴 과정 — 즉 이 milestone이 실제로 생산한 데이터 — 은 축적되지 않는다. M4가 스스로를 검증할 때 이것이 안 보인 이유는 그 milestone이 게이트를 **한 번만** 돌렸기 때문이다.

이 관측은 코드 수정을 요구하지만 그 수정은 계측 배선의 변경이므로 **M6 범위 밖이다**(UI6 — #5 오라클 추출 이전에 배선을 늘리지 않는다). #9로 이관한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 지표 정직성 | `.claude/prds/diverse-agent-review.prd.md` | 산출 0인 지표는 forward-only로 적고 status로 감추지 않는다 |
| 관측 실패의 기록 | `.claude/PRPs/reports/diverse-agent-review-m4-report.md` | M4가 Task 5를 "미달"로 적고 사유를 남긴 방식 |
| Outcome 이관 | `.claude/prds/diverse-agent-review.prd.md` | #4 → #6 이관 note — 골대 이동이 아니라 같은 구조적 이유에 같은 정정을 반복한다고 적은 형태 |
| 증거 파일 고정 | `.claude/reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md` | slug 공유를 피하려 실행 성격을 파일명에 박은 선례 |
| 한계의 명시 | `.claude/plans/diverse-agent-review-m1.plan.md` | M1이 스스로 오심 방지 불가를 적은 방식 |
| 보고서 구조 | `.claude/PRPs/reports/diverse-agent-review-m4-report.md` | Assessment vs Reality + Acceptance 대조 표 |
| version 동기 | `CLAUDE.md` | §3.7 — `plugin.json`을 정본으로 두고 렌더러 footer를 맞춘다 |

## Design Notes

**DN1 — 재정의는 목표 하향이 아니라 관측 반영이다.** 원래 Outcome 3 clause 중 어느 것도 "달성"으로 적지 않는다. 통과 경로는 forward-only로 남고(표본 0), budget 라이브 발화는 #7로, quorum 캘리브레이션은 #8로, 계측 재실행 편향은 #9로 간다. M6가 소유하는 것은 **그 셋을 실측으로 확정한 것**이다 — PRD가 #4에서 한 정정과 같은 형태이며, 그때와 마찬가지로 판정을 바꾸지 않고 사유를 갱신한다.

**DN2 — 이 plan은 게이트 승인 없이 남는다(UI14).** `mccp-plan-codex` receipt가 없으므로 `/mccp:prp-implement`는 이 plan으로 시작하지 못한다. 그것은 결함이 아니라 O1의 결과다. 구현 경로는 셋이었다 — (a) 게이트 재진입, (b) `MCCP_PLAN_REVIEW=codex` 폴백(현 환경은 `MCCP_CODEX_DISABLED=1`이므로 `disabled` first-class skip으로 receipt가 발급되며 승인자는 패널이 아니게 된다), (c) 문서 변경만이므로 게이트 밖에서 직접 적용. **어느 쪽이든 receipt에 봉인되는 승인자가 달라지므로 보고서가 그것을 기록한다.**

**택한 것은 (b)다.** (a)는 UI14가 추가 패널 실행을 배제하므로 불가하고, (c)는 §3.1의 receipt chain 우회다. (b)는 게이트 자신의 stop 메시지가 명시하는 복구 경로이며, 무엇보다 **아무것도 세탁하지 않는다** — receipt는 `codex_verdict='skipped'` + `meta.codex_disabled=true`를 봉인해 "Codex가 env 정책으로 건너뛰어졌다"를 그대로 기록할 뿐 패널이 승인했다고 주장하지 않는다. `skipped`는 `converged`가 아니므로 cross-gate dedupe는 fail-closed로 남고 terminal `/mccp:pr`에서 PR-Codex가 반드시 발화한다 — 즉 이 milestone의 cross-model 검증은 제거된 것이 아니라 **ship 지점으로 이동**한다(DD2의 원래 설계와 같은 방향). 보고서 `## 승인자 기록`이 이 문단의 사실 — 승인자는 패널이 아니라 env-policy skip이었다 — 을 남긴다.

**DN3 — slug는 PRD 경로 파생이라 이 PRD의 모든 milestone이 공유한다(실측).** 그래서 O3이 성립하고, 그래서 Task 1이 **구현 착수 직후 첫 작업**으로 R4 레코드를 고정한다. 이 PRD로 `/mccp:plan`을 다시 돌리는 순간 마지막 남은 레코드도 사라진다.

**DN4 — 증거 강도를 균일한 척 적지 않는다.** R4 수치는 파일이고 R1–R3 수치는 세션 관측이다. 보고서는 둘을 같은 표에 적되 provenance 열로 구분한다. O3이 존재하는 한 이 비대칭은 정직하게 적는 것 외에 해소할 방법이 없다 — 소급 복구는 불가능하다.

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~56k.

### Findings (severity-ranked)

- **[CRITICAL][explorer]** Gap: M6 plan does not exist and cannot be created without shipped runtime (installed plugin cache ≥1.23.7 with review-* agents) — PRD Evidence section (line 26-27): 'Mi관측 사유는 플러그인 캐시가 1.23.4에 머물러 mccp:review-* 4종이 세션 agent 레지스트리에 없다' + 'installed 트리에 M4의 record.js·budget.js가 없어 지금 돌리면 M4 계측이 실행되지 않는다'. Selection mechanism is forward-only (PR #126 merge prerequisite not under plan control)
- **[CRITICAL][explorer]** Gap: Plan cannot mandate 'install this worktree version' as acceptance condition — runtime state is outside milestone scope — PRD lines 54-56: 'Outcome 정합성 불변식' notes 'This plan will proceed and the cap stays exact.' + 'stale한 사유로 milestone을 판정하지 않기 위해 사유를 갱신하되 판정은 바꾸지 않는다' indicates milestone ownership is tight. M6 cannot control when main gets merged or plugin gets updated
- **[HIGH][architect]** Plan-hash bind (DD13) requires compute at emit-time, but emit-workflow-args is called from command body (plan.md Phase 5.2), not from the L2 reviewer. If reviewer agent reads plan independently and computes own hash, divergence is undetectable until write-time. — cli.js emit-workflow-args is called before L2 invocation (plan.md flow) but agents.md review-architect etc. may independently hash if they want to validate. The contract that hash must come from emit-time is documented (DD13, Task 6) but not enforced—agents don't receive the pre-computed hash in args.
- **[HIGH][security]** L2 panel execution artifacts (l2.json, l3.json) lack cryptographic binding to decision envelope, allowing untrusted artifact injection into audit record — plugins/mccp/scripts/lib/plan-review/record.js:157-176 reads l2.results and l3 data without verifying authenticity. decision.json carries reviewed_plan_hash but lacks signature/binding to component artifacts. If .claude/reviews/ directory is writable by attacker, false findings can be injected into git-tracked audit trail without detection.
- **[HIGH][test]** Acceptance criteria 'live run' (라이브 완주) vs simulation untested — M4 plan Task 5 prerequisites block verification — M4 plan L10: 'Task 5 선행 조건이 있다. 현재 플러그인 캐시는 1.23.4까지만' + 'claude plugin update 후 새 세션이 필요' — this prerequisite (plugin deploy + user action) is outside test harness; M4 plan L148 'Risks' marks this High ('실측 1회 완주가 불가능'). PRD L44 Success Metrics row 1 labels passing-path metric 'forward-only' (미산출), not 'complete'
- **[HIGH][test]** All-or-nothing atomicity of review_verdict + review_source + review_proof fields not mechanically enforced pre-write — M1 plan DD11 L107-112: 부분 stamp가 fallback codex_verdict로 dedupe를 skip하는 유일한 진짜 구멍 명시. Task 2 schema 검증이 'present-only 검증 3건(enum·source enum·proof 구조)' + 'DD11 all-or-nothing 검증 추가: review_verdict present → review_source·review_proof 필수' 기술하나, test coverage 확인 필요. evidence-stage-guard.js write-side guard는 'additionalProperties:false' 없음 (L169 주석)
- **[HIGH][explorer]** Plan-review core infrastructure (M1) is ship-complete — 7 modules fully implemented with test coverage — plugins/mccp/scripts/lib/plan-review/{cli,decide,l1-check,perspectives,quorum,record,budget}.js all present with 15+ test files (plan-review-*.test.js) covering L1 mechanical checks, quorum arithmetic, L2 decision logic, record generation, and workflow port
- **[HIGH][explorer]** Review-verdict helper already implements resolution precedence and proof validation — M6 plan must reuse, not recreate — plugins/mccp/scripts/lib/review-verdict.js (lines 35-186) contains isReviewProofStructurallyValid() + resolveEffectiveVerdict() — the SSoT that M1 PRD (DD11) requires all consumers to call. Existing dedupe.js, receipt-convergence.js, pr-ship-gate.js, completion-ledger/store.js all consume it
- **[HIGH][explorer]** Plan-review.js workflow is a self-contained faithful port of tested oracles with deliberate no-decide contract — M6 must call it unchanged — plugins/mccp/scripts/workflows/plan-review.js (lines 10-24) documents its relationship to lib/plan-review/* as load-bearing faithful ports; no-require sandbox requirement; workflow returns raw results to cli.js, not verdicts. Lines 108-124 coerce input and degrade gracefully on missing fleetKeys (runaway cap contract)
- **[HIGH][explorer]** L1 mechanical checks (l1-check.js) are non-LLM semantic checks over plan structure — M6 test run must produce real L1 results via existing oracle — plugins/mccp/scripts/lib/plan-review/l1-check.js exports checkPlanConsistency() pure oracle. Violations 7 checks exist (PRD M1 open question confirms). plan.md Phase 5 2.5e references 'L1 gatekeeper short-circuit' exit 1 path. Test suite plan-review-l1.test.js 25+ cases cover all violation types
- **[HIGH][explorer]** Record module already handles wall-clock measurement for both HALT and pass paths — M6 can reuse verbatim — plugins/mccp/scripts/lib/plan-review/record.js exports buildReviewRecord() + reviewRecordPath(). plan.md Phase 5 5.2g 'record' subcommand writes .claude/reviews/plan-review-<slug>.md with 'halt_stage' + 'wall_clock_ms' measurements. M4 test confirms M4 HALT paths record wall_clock_ms correctly. Passing path invokes same function with no halt-stage (null)
- **[HIGH][explorer]** M1/M4 test suite provides fixtures and patterns but M6 needs LIVE run (not fixture), which test runner cannot produce — PRD lines 100-104: 'L3(cross-model) 발동 비율' shows forward-only measurement. plan-review-*.test.js use synthetic receiver responses (mock Workflow results). M6 success metrics (line 45 'dedupe/ship-gate 회귀 test') show test regression confirmation is necessary but insufficient — acceptance requires 'wall-clock이 실측으로 10분 이내'(실측 = measured from live run, not fixture)
- **[MEDIUM][architect]** L1/L2/L3 layer ordering is implicit in code but not formalized as a gate contract. L1 'inconclusive' silently skips L2 invocation, creating a hidden boundary that will become expensive to refactor when L4+ is added. — decide.js:15-18 exhaustive matrix shows L1 short-circuits but the oracle lacks a named boundary type (e.g., 'layer_gatekeeper_passed'). verification-layer-design.md §2-3 describes layers but §7 open-question (1) defers L1 scope confirmation, leaving the exact L1 checkpoint unstabilized.
- **[MEDIUM][architect]** Proof schema hard-codes 3 layers (layers.l1/l2/l3) requiring schema version bump to add L4. No forward-compat container; adding a layer means changing isReviewProofStructurallyValid (review-verdict.js:112-115) and the composition table (decide.js:13-23). — review-verdict.js:112-115 validates `layers.l1 === 'converged' ∧ layers.l2 === 'converged'`. decide.js exhaustive table has 9 rows, all enumerating `mode × l1 × l2 × l3`; adding `l4` requires 18 rows.
- **[MEDIUM][architect]** REVIEW_PERSPECTIVES and SOURCES are hardcoded frozen arrays (4 agents, 3 sources). Role duplication check (review-verdict.js:145-149) assumes exactly 4 is the fleet size. Extending to 5 agents or adding source (e.g., 'triple-model') requires edits in: perspectives.js, schema.js, review-verdict.js, dedupe.js, and quorum.js. — perspectives.js:24 REVIEW_PERSPECTIVES hardcoded [architect/security/test/invariant] · review-verdict.js:37 SOURCES=['codex','multi-agent','hybrid'] · quorum.js (implied in decide.js:273) slices REVIEW_PERSPECTIVES.slice(0,quorum.of) assuming 4 available. No registry or factory pattern.
- **[MEDIUM][architect]** Triple-check pattern for reviewed_plan_hash (emit-workflow-args calc → agent receives → decide verifies → write re-verifies) creates temporal ordering assumption that can silently fail if any step reorders or caches incorrectly. No atomic token or nonce ties the three checks together. — DD13 commits to this pattern but cli.js emit-workflow-args, decide.js proof assembly, and write.js (line 123 planAwareMarkdownHash) each independently calculate or verify hash. A race where plan is edited between emit and write would produce proof that matches emit but not write—write catches it (exit 12) but silently for now.
- **[MEDIUM][architect]** Schema validation and pure oracle both own isReviewProofStructurallyValid: defined in review-verdict.js:105-180 and re-validated in schema.js (imported at line 42-44). Double-definition drift risk if one is updated without the other. — schema.js:40-44 imports isReviewProofStructurallyValid from review-verdict.js. Comment says 'double-definition drift this project keeps re-finding'. §3.12 no-rehash precedent shows this pattern is risky.
- **[MEDIUM][architect]** All-or-nothing stamp rule (DD11) couples review_verdict + review_source + review_proof as atomic unit, but command.md Phase 5 passes three separate flags (--review-verdict, --review-source, --review-proof-file). If one shell variable expands incorrectly, write.js catches it (exit 12) but only via explicit check, not schema. — write.js#detectDispatchContext (mentioned in M1 plan 147-157) is the 'all-or-nothing' arbiter. If shell script logic makes one flag true and others false, write.js must catch it. No compile-time guarantee.
- **[MEDIUM][architect]** Helper delegation pattern (receipt-convergence.js → resolveEffectiveVerdict) assumes all 7 verdict consumers will be updated atomically. M1 plan Tasks 9a(a) and 9b(e) claim auto-inheritance but test proof (Task 11 rows 1-2) is mandatory because the span is large (3 modules, 1 helper). Risk: future consumer added without helper update. — M1 plan Task 9a lists 7 verdict consumers across dedupe.js, pr-ship-gate.js, receipt-convergence.js, completion-ledger, evidence-audit. Task 11(2) 'helper transitivity test' is mandatory but added post-design, indicating the pattern was not self-verifying.
- **[MEDIUM][security]** Plan/PRD content containing secrets or PII is transmitted to external Codex model without pre-transmission sanitization or redaction — PRD §0.1-0.3 describes plan-codex review sending plan/PRD files to Codex. plugins/mccp/scripts/lib/codex-review-payload.js reads findings verbatim from external model. plugins/mccp/scripts/derive/mask.js applies secret redaction only to *output* surfaces (receipts, traces), not to input data before external model invocation. No sanitization step in plan-codex-runner.js or intent-context.js before Codex receives content.
- **[MEDIUM][security]** Environment variable-based mode selection (MCCP_PLAN_REVIEW, MCCP_PLAN_REVIEW_L3) determines approval channel without being sealed or audited in decision record — plugins/mccp/scripts/lib/plan-review/cli.js:123-126 parseReviewMode/parseL3Enabled read raw env vars without validation source. decide.js:50 DEFAULT_MODE is 'multi-agent' but typo falls back to 'codex'. No receipt field records which mode was active at decision time, so post-hoc audit cannot verify if decision was made under intended mode (e.g., hybrid vs multi-agent).
- **[MEDIUM][security]** CLI argument parsing (parseArgs) accepts arbitrary --key value pairs forwarded to write(), allowing programmatic-only fields to be overridden via CLI if checks are bypassed — plugins/mccp/scripts/lib/plan-review/cli.js:52-73 parseArgs creates {_:[], evidence:[]} and collects all --flags. write.js:126-138 stampIntentDecision has structural check (isObject) to prevent CLI override, but pattern shows CLI is weakly constrained. Mitigated by specific field type-guards, but represents general surface for injection if new fields bypass type validation.
- **[MEDIUM][security]** Quorum passing logic (decide.js) assumes all L2 agent results are authentic with no signing or origin verification — plugins/mccp/scripts/lib/plan-review/decide.js:20-23 composition table assumes L2 results are trustworthy. No mechanism to verify that l2.results were produced by legitimate agents or haven't been tampered. If agent execution environment is compromised, arbitrary findings can be injected under any role name (architect/security/test/invariant).
- **[MEDIUM][test]** Command-body seam defects remain pre-ship vector post-M1 ship — M5 (gate wiring oracle extraction) pending — PRD L109-110: M1 ship post-mortem '28건이 전부 command-body seam(단위 test가 원리상 닿지 않는 markdown 배선)'. plan-review-command-body.test.js pins 3 shell-wiring invariants (F1/F3), but M5 milestone 'pending' per PRD L77. PRD Risks L110 '결함 수정이 새 결함을 만듦...M1 santa-loop 20건 중 6건이 이 형태'. M4 plan L81 'UI6: 배선 추가를 최소화'를 설정했으나 M5 부재 상태에서는 신규 배선이 매번 같은 형태의 결함을 재생산할 위험 유지
- **[MEDIUM][test]** Mode parsing asymmetry (unknown→codex) differs from verify mode but not test-covered for both branches — M1 plan DD7 L97-105: 의도적 비대칭 ('실패 모드가 다르기 때문') parseReviewMode unknown→codex(existing) vs parseMergedVerifyMode unknown→enforce(strictest). M1 plan Task 10 cites Task 11 'DD7 자동 회귀 test' but must verify: (a) unknown/typo→codex loud-warn, (b) multi-agent route doesn't activate, (c) codex mode byte-identical to v1.23.0. plan-review-mode-rollback.test.js name suggests coverage but behavior parity across modes untested
- **[MEDIUM][test]** Proof reviewed_plan_hash staleness detection incomplete — no test for hash mismatch→unavailable downgrade — M1 plan DD13 L90-95 실제 occurrence: 'santa-loop R2에서 실제로 발생했다'. write.js must verify 'resolution.review_proof.reviewed_plan_hash === receipt.plan_hash' and exit 12 on mismatch (L95 '복구는 재봉인이 아니라 L2 재실행'). Test must cover: (a) hash match pass, (b) mismatch→exit 12 halt, (c) decide path rejects converged when hashes diverge. M1 plan Task 2 'write-side schema+gate 검증' but hash-mismatch-at-write test absent from evidence
- **[MEDIUM][test]** Budget gate reachability requires workflow extraction + runtime simulation, not syntax check — M4 plan L88: 'plan-fanout은 같은 자리에 정상 배선을 갖고 있으므로 대칭을 복원'. Task 4 (공허한 validation 대체) L97-98 'UI5에 따라 수정 **전** 실패를 먼저 실측', Task 3 payload에 'minRemaining = parsePanelBudget(env) × fleet.length'. Test must: extract workflows/plan-review.js:155 budget branch via extractFunction pattern (plan-review-workflow-port.test.js L33 model), run with synthetic fleet, verify remaining < minRemaining triggers skip AND returns measured values. M4 plan-review-workflow-port.test.js Task 4 L102 'Test 적용 **전에** 두 test 파일을 실행해 새 단언이 실패하는 것을 확인'
- **[MEDIUM][test]** L1 gatekeeper short-circuit (inconclusive≠divergent) behavior not explicitly tested — l1-check.js L14-18: '세 verdicts...inconclusive — we could NOT check'. M1 plan DD3 L76: 'L1이 gatekeeper, LLM 판정보다 앞서 short-circuit. L1 실패 → 즉시 divergent, L2 미발화'. plan-review-l1.test.js covers violation classes C1-C7 + converged path, but no test explicitly verifies: (a) L1 inconclusive blocks L2 launch, (b) decide path maps inconclusive→unavailable (not divergent), (c) CLI maps inconclusive→exit 12 (not exit 1)
- **[MEDIUM][test]** Transitive verdict consumer propagation untested after helper delegation — 7→12 untouched modules risk drift — M1 plan DD12 L115-129 scope table: 'helper 위임으로 자동 계승' 3개 (derive/sources/worktrees.js · briefing/invoke.js · escalate-detector.js). L119 ' Task 11이 이 전이성을 증명해야 한다 — 주장만으로는 부족'. But review-verdict.test.js fixtures and transitive consumer tests (briefing, escalate-detector read paths) don't appear in M1 Files to Change test list. Risk: helper delegates verdict but old consumers still read raw codex_verdict after merge+before-deploy
- **[MEDIUM][test]** Measurement stderr loudness not mechanically verified — F3 seam allows silent redirection of record failures — M4 plan-review-command-body.test.js L82-95 F3: 'cmdRecord always exits 0 by contract, so stderr is the ONLY channel...Redirecting 2>&1 to /dev/null removes the loud half...and leaves the blocked paths with neither a record nor a warning'. M4 Task 2 requires 'HALT 앞에 record 호출' but no test verifies stderr was NOT redirected in those 5 HALT blocks (5.2a/5.2b/5.2c-emit/5.2c-pin/5.2e/5.2g). plan.md Phase 5.2 command-body linting incomplete
- **[MEDIUM][test]** Present-only field hash stability test must prove both absence (existing corpus) and presence (new receipts) — M1 plan DD6 L85-88 '기존 git-tracked ship corpus는 전부 absent → receipt_hash 불변...신규 receipt는 6필드가 hash에 반영됨'. Task 11 corpus-hash test must assert: (a) existing receipts in .claude/receipts/mccp-pr-codex/*.json lack review_* → hash stable, (b) synthetic new receipt WITH review_* fields produces different hash. M1 plan Tests section lists 'review-verdict-corpus-hash.test.js' but test scope (what it actually asserts) not specified
- **[MEDIUM][explorer]** Budget gate logic (plan-review/budget.js) exports panelMinRemaining() oracle already wired into workflow orchestration — M6 plan must invoke existing entry point — plan.md Phase 2.5.1 line 347 passes FANOUT_MINREM via emit-workflow-args; line 369 checks 'L2 panel did not fire (reason: budget)' failure path. panelMinRemaining() computes this deterministically from env + fleet.length. M4 test plan-review-workflow-port.test.js lines 42-65 confirm passing path invokes budget gate decision
- **[MEDIUM][explorer]** Receipt write path has present-only review_* stamp locations already defined — no new schema migration needed — plugins/mccp/scripts/receipt/write.js passes --review-verdict/--review-source/--review-proof-file/--review-l3-invoked flags into present-only stamp block. Schema.js (lines 156-227) validates all-or-nothing invariant (DD11). M1 plan files 63-64 show schema updates are complete; M6 needs no schema bump (present-only fields, no receipt_hash change)
- **[MEDIUM][explorer]** Intent gate infrastructure (codex-intent-context M1) is present and used in plan body — M6 may encounter it in representative plan — plugins/mccp/scripts/lib/intent-context.js (40+ lines) implements pure oracle for `## User Intent` table extraction. plan.md Phase 1.5 captures user intent. M1.5 (pending) will adjudicate findings against intent. M6 must not reimplement — call existing extractIntentSection() + decideIntentGate()
- **[MEDIUM][explorer]** Existing paths support passing-path measurement but do not guarantee observation — wall-clock recording exists for HALT only in deployed M4 — plan-review/record.js buildReviewRecord() computes wall_clock_ms only when startedAtMs + nowMs both present. M4 writes this for HALT paths (.claude/reviews/*). For passing path, same measurement path (exit 0 case at line 658) must be invoked but M1-M4 do not show passing-path record write (no test coverage or production example)
- **[LOW][architect]** Mode fallback asymmetry: parseReviewMode defaults unknown→codex (DD7 justification: already-verified path), while parseMergedVerifyMode (verify.js:44-52) defaults unknown→enforce (strictest new mode). Both are justified but create cognitive load and make future mode-parser additions inconsistent. — decide.js:44-65 parseReviewMode with DD7 comment explaining opposite from verify.js. No centralized decision-tree-pattern for all mccp mode parsers; newcomers must read two implementations to learn the precedent.
- **[LOW][architect]** dispatch_evidence path validation forbids backslashes globally (review-verdict.js:85), but this may be overly strict for Windows worktrees where git normalizes paths to forward slashes. The validation is correct but lacks a comment explaining OS normalization assumptions. — review-verdict.js:80-94 isRepoRelativeEvidencePath forbids '\' and drive letters entirely. No conditional for Windows. CLAUDE.md §3.8 requires `.worktrees/` paths but doesn't specify path separator handling in cross-platform scenarios.
- **[LOW][architect]** L1 inconclusive/divergent short-circuits L2, but receipt still stamps review_source='multi-agent' (decide.js rows 15-18). This is correct (L2 didn't run so source is honest) but creates asymmetry: plan can be rejected by L1 alone yet receipt still claims L2 deliberated. — decide.js:15-18 exhaustive table shows inconclusive/divergent cases emit 'multi-agent' source. M1 plan acceptance (line 344) requires 'wall-clock ≤ 10min' but short-circuit saves time; this success metric doesn't distinguish 'L1 caught it fast' from 'full L2 deliberation accepted'.
- **[LOW][architect]** Quorum validation (review-verdict.js:127-136) checks q.responded against q.of and q.required but doesn't prevent responded > of. Formula `q.responded <= q.of` should fail-closed if violated, yet the comment assumes it will be correct. — review-verdict.js:135 `if (q.responded > q.of) return false;` is correct, but this boundary is defensive. No type constraint or builder prevents passing invalid input. Path is fail-closed but requires test to prove.
- **[LOW][architect]** Consensus boundary between L2 quorum (M-of-N) and role diversity (K unique roles) is correct but coupling of two constraints makes the oracle signature complex. quorum.required >= 2 (MIN_QUORUM_REQUIRED) is hardcoded but could become a toggle. — review-verdict.js:53 MIN_QUORUM_REQUIRED=2 hardcoded. quorum.js must track both responded/of AND roles/rolesMin. M1 plan does not expose MIN_QUORUM_REQUIRED as toggle (correctly, per 'L1 is gatekeeper') but future L2-only gates might want to vary it.
- **[LOW][security]** Path containment validation uses both lexical and real-path checks, but symlink TOCTOU window exists between validation and file read — plugins/mccp/scripts/lib/plan-review/cli.js:170-192 resolveContained checks symlinks via realpathSync, but plan file content can change between validation (emit-workflow-args) and panel invocation (L2 agent reads). Mitigated by reviewed_plan_hash binding, but represents inherent TOCTOU gap in filesystem-based input validation.
- **[LOW][security]** Directive injection via User Intent table mitigated by regex denylists, but denylist is explicitly bounded and incomplete per design notes — plugins/mccp/scripts/lib/intent-context.js:92-112 DIRECTIVE_PATTERNS is a finite enumeration. Comments at L203 note NFKC does NOT fold cross-script homoglyphs; mixed-script detection is PRIMARY control. Noted as 'secondary control and cannot be complete'. Escape order hardening (L393-402) is fragile to future code changes (noted by trimDanglingEscape L407-411).
- **[LOW][security]** Error messages in CLI path validation may leak plan file content or sensitive error details if parsing fails — plugins/mccp/scripts/lib/plan-review/cli.js:108-109 readJsonOrBlock error message includes file path and raw error.message. If plan file contains secrets in comments and fails JSON parsing, error output to stderr could expose secret. Mitigated by stderr being user-visible only, but follows pattern of error-message data leakage risk.
- **[LOW][security]** Reviewed plan hash binding prevents post-review edits, but relies on SHA256 without audit trail of receipt seal/verify operations — plugins/mccp/scripts/receipt/write.js:457 validates reviewed_plan_hash against current plan. intent-context.js:331-334 strips gate-injected sections for binding. Design is sound (mirrors CLAUDE.md §3.12 no-rehash invariant), but hash validation has no mechanical audit trail of who/when receipt was sealed, only the fact of mismatch. Mitigated by git history, but represents weaker auditability vs cryptographic signatures.
- **[LOW][test]** Quorum roles_min enforcement against duplicate voices untested — same reviewer answering twice could pass M when K intended to prevent it — quorum.js L5-10: 'M (required) — how many reviewers answered / K (rolesMin) — how many DISTINCT lenses...Collapsing them would let one role answering three times satisfy'. M1 plan Task 5 quorum oracle must test 'high unique role ≥ rolesMin' but test fixture with all-same-role responses absent. quorum.js isUsableResult checks perspective field shape but NOT uniqueness
- **[LOW][test]** L1 citation resolution base-discovery may fail on Windows path separators or symlinks — l1-check.js L44-62: CITATION_BASES hardcoded list + DYNAMIC_BASE_ROOTS fs.readdirSync at check time. But: (1) plan-review-l1.test.js mockFs returns normalized paths (/), but real fs on Windows returns \ — normalizePath not called on fs results. (2) CITATION_RE L66 matches / and - but not \ (Windows). (3) readdirSync(DYNAMIC_BASE_ROOTS) doesn't follow symlinks, so plan citing symlinked module fails. Evidence: CLAUDE.md §3.8 memory note 'Bash 백슬래시 붕괴'

### Meta-gaps

- PRD §Delivery Milestones lacks explicit acceptance criteria for M6 (runtime observation milestone): what constitutes 'observation' of unified runtime? Liveness of agent processes? Receipt write completion? A clear definition would prevent #6 milestone drift.  _(architect)_
- M1 plan identifies no backward-compat contract for L1 scope evolution: future PRD may want to strengthen or weaken L1 checks (e.g., forbid refs that don't exist vs. forbid only in Tasks). No versioning scheme for L1 violations.  _(architect)_
- verification-layer-design.md §7 Open Question (1) 'L1 stepts confirm' is unresolved: no spec for 'must-have' vs 'should-have' L1 checks. When plan is code-free, L1 is weak; when plan references implementation, L1 becomes heavy. No guidance on scaling the check set.  _(architect)_
- No explicit schema for escalation between layers: if L1 finds N violations, does L2 still run? Current behavior is 'no' (short-circuit) but not named as an escalation rule that M2+ could vary.  _(architect)_
- Plan lacks explicit extension points for future cross-model sources (e.g., adding 'claude2' or 'gemini' as sources). Current design makes 3-element SOURCES array central; scaling to vendor diversity is not modeled.  _(architect)_
- No formal decomposition of 'proof' into sub-schemas for future L4+: layers.l4 would extend the current pattern, but no migration path for old proofs or schema versioning strategy exists.  _(architect)_
- The 'proof bind via reviewed_plan_hash' is a temporal invariant but not enforced by type system or async-aware contract. Future concurrent implementations could violate it silently.  _(architect)_
- No documented secret detection or masking policy before plan/PRD content is sent to external Codex model; diverse-agent-review assumes operator ensures PII/credentials are not present in input docs  _(security)_
- Authorization model for plan review invocation is unspecified; any principal with file access can invoke /mccp:plan via CLI with arbitrary (contained) plan files  _(security)_
- Mode selection (multi-agent vs hybrid vs codex) is environment-variable driven without sealing in receipt decision, preventing auditability of which approval path was active  _(security)_
- L1/L2/L3 artifact chain lacks end-to-end cryptographic binding; decision seals reviewed_plan_hash but not integrity of panel results l2.json/l3.json  _(security)_
- Intent adjudication completeness is mechanically enforced (all findings must be judged), but correctness of individual adjudication verdicts is not validated — false positive adjudications (marking 'preserved' on a real conflict) are not detected by schema  _(security)_
- Self-consistency sampling rate and quorum threshold (M-of-N) are configurable but no guidance on security implications of reduced N or threshold-gaming  _(security)_
- No test for order-dependency in Phase 5.2 step sequencing — if emit happens before L1 check, decision object shape may be incomplete  _(test)_
- No test for cross-module state leakage via global process.env between sequential CLI invocations (plan.md uses temp files correctly but env mutations could persist in-session)  _(test)_
- No edge case for empty dispatch_evidence array in proof structure validation — proof struct checks presence but allows zero-length array (should require ≥1 evidence path)  _(test)_
- No test for concurrent panel agent launches against same plan (race condition: simultaneous review-architect + review-security reading same plan file while L1 rewrites it)  _(test)_
- No validation of quorum.responded count against actual fleet size granted vs reserved (plan-review budget may reserve 2 but workflow launches 4 due to race in orchestration)  _(test)_
- No test for L1/L2/L3 partial failures (e.g., L2 quorum.of=1 due to agent crash) — decide matrix assumes all layers attempted but doesn't verify the attempt counts  _(test)_
- No test for review.wall_clock_ms integer serialization into JSON — float timestamps will serialize as .000 (misleading) but test assumes exact integer  _(test)_
- M6 plan cannot make progress until installed runtime version advances and plugin cache refreshes — precondition is outside plan control. Acceptance depends on forward-only measurement that can only be collected post-merge  _(explorer)_
- Plan-review test suite (plan-review-*.test.js) is comprehensive for unit tests but does not run actual Workflow invocation or agent communication — no fixture can prove the passing path wall-clock because test agents do not fire  _(explorer)_
- Wall-clock measurement path for passing routes (non-HALT scenarios) exists in code (record.js) but has zero deployment evidence — no prior milestone recorded a complete passing-path run, so time characteristics are unvalidated  _(explorer)_
- M1.5 (intent adjudication) will extend the panel's decision surface but M6 PRD does not mandate intent coverage — represents potential interaction risk if M6 test run lands before M1.5 ships  _(explorer)_
- Budget gate runaway cap logic (reserveWorkers) is part of orchestration-runaway.js but not called from plan-review itself — M6 test run inherits cap constraints from plan.md Phase 2.5.1/3 not from plan-review modules directly  _(explorer)_
- Cross-gate dedupe skip predicate (review_source ∈ {codex,hybrid}) requires resolved review_verdict to be fresh — M6 must not skip Codex at PR gate even if a prior multi-agent plan receipt exists, but no test validates this deny-list scenario  _(explorer)_

### Patterns to mirror

- plugins/mccp/scripts/lib/receipt-convergence.js:20-30 — verdict SSoT via single helper, all consumers route through one place (M1 replicates this with resolveEffectiveVerdict). Use this pattern for all future verdict sources.  _(architect)_
- plugins/mccp/scripts/lib/implement-dispatch/verify.js:44-52 + 169-216 — exhaustive composition table + fail-closed block matrix. M1 mirrors this in decide.js but future L4+ changes must extend the table comprehensively, not add branches.  _(architect)_
- plugins/mccp/scripts/receipt/schema.js:134-143 — present-only enum validation (CODEX_VERDICT_VALUES), absent=fail-closed. M1 replicates for review_verdict/review_source; future new verdicts must follow this pattern (not materialize in skeleton, validate on presence).  _(architect)_
- plugins/mccp/scripts/lib/plan-fanout/perspectives.js:11-14 — read-only guarantee via tool absence (Read,Grep,Glob) not prompt. M1 review agents mirror this; agents added to REVIEW_PERSPECTIVES must inherit the same tools array.  _(architect)_
- plugins/mccp/scripts/lib/plan-fanout/quorum.js or similar — refute-framed schema and blocking-severity escalation. M1 plan-review/quorum.js mirrors this for L2; any future L2 expansion must preserve the 'evidence of defect' framing.  _(architect)_
- plugins/mccp/scripts/workflows/plan-fanout.js:167-233 — self-contained Workflow port (no require, CATALOG inlined + versioning comment). M1 workflows/plan-review.js mirrors this; no Workflow should share code across module boundaries.  _(architect)_
- plugins/mccp/scripts/lib/implement-dispatch/verify.js — mode parser with fail-closed enum check + loud warn on unknown. M1 decide.js parseReviewMode does opposite (unknown→codex) due to different failure mode; document the distinction for future parsers.  _(architect)_
- plugins/mccp/scripts/receipt/hash.js:198-222 — carve-out list for non-tamper-protect fields (briefing_*, ledger_write_skipped). M1 excludes review_* from carve-out (present-only but hash-bound). Future proof extensions must decide: carve-out=metadata-only, no carve-out=approval-bearing.  _(architect)_
- .claude/meta/verification-layer-design.md §6-7 — hierarchy of correlated-error immunity. Document L4+ sources with their immunity class (deterministic/voting/cross-model) to guide future expansion.  _(architect)_
- Path containment with symlink resolution (cli.js:163-192): validate both lexical and real paths to prevent directory traversal via symlinks; fail-closed on containment violation  _(security)_
- Entity decoding before structural validation (intent-context.js:172-185): decode HTML entities once, non-recursively, BEFORE validation checks to prevent evasion via entity-encoded delimiters  _(security)_
- Backslash-first escaping order (intent-context.js:393-402): escape backslash before other special characters to prevent double-escaping; add trimDanglingEscape safety net for truncation  _(security)_
- Directive denylist + mixed-script detection (intent-context.js:92-112, 220-241): combine finite pattern denylists with script-diversity checks as defense-in-depth against prompt injection  _(security)_
- Programmatic-only field enforcement via type guards (write.js:126-138): require sensitive fields to be non-null objects rather than strings/booleans, making CLI bypass structurally impossible  _(security)_
- Fail-closed verdict mapping (codex-review-payload.js:63-72): map unknown/unreadable verdicts to 'unavailable' (no-ship), never to 'converged' (approval from unknown state)  _(security)_
- Proof binding via content-addressed hash (write.js:457, intent-context.js:331-334): bind verdict to stable plan hash; strip only gate-injected sections; validate hash match at receipt write  _(security)_
- Receipt schema validation (write.js:14, schema.js): validate receipt against strict schema with present-only fields to ensure required audit metadata is not optional  _(security)_
- plugins/mccp/scripts/lib/tests/plan-review-budget.test.js L24-33: quiet() stderr wrapper for warning capture and verification (mirror for record loudness tests)  _(test)_
- plugins/mccp/scripts/lib/tests/plan-review-workflow-port.test.js L33-56: extractFunction() via brace-matching for sandbox script behavior verification (mirror for budget branch execution test)  _(test)_
- plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js L26-66: bashBlockLines() + inBlock state tracking for command-body seam linting (mirror for record stderr redirection detection)  _(test)_
- plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js: makeSkeleton() fixture pattern for present-only field atomicity (mirror for review_* all-or-nothing stamp test)  _(test)_
- plugins/mccp/scripts/receipt/schema.js L744-760: skeleton materialize check for hash stability (mirror for existing-vs-new receipt hash test)  _(test)_
- plugins/mccp/scripts/lib/receipt-convergence.js: single-point-of-truth helper pattern (mirror for resolveEffectiveVerdict transitive consumer verification)  _(test)_
- plugins/mccp/scripts/lib/plan-conflict-detector.js L236-247: conservative verdict + base-resolution retry (mirror for L1 citation resolution on Windows)  _(test)_
- plugins/mccp/scripts/lib/plan-review/cli.js — subcommand routing with explicit exit codes (EX_OK=0, EX_L1_DIVERGENT=1, EX_USAGE=2, EX_BLOCK=12) is the gate CLI contract; M6 test invocation must mirror this error handling  _(explorer)_
- plugins/mccp/scripts/receipt/write.js — all-or-nothing stamp of review_* triple (lines 147-160) via marker-gated present-only fields; M6 must verify receipt triple serializes byte-identically for receipt_hash seal  _(explorer)_
- plugins/mccp/scripts/lib/review-verdict.js:105-186 — isReviewProofStructurallyValid() oracle validates proof structure independently of quorum pass/fail (pure, no fs); M6 test must call this against real receipt proof before declaring pass path converged  _(explorer)_
- plugins/mccp/scripts/receipt/schema.js:156-227 — validation of review_* all-or-nothing invariant (DD11) with fail-closed partial-stamp rejection; M6 receipt write must not bypass this (no --codex-verdict when multi-agent source is set)  _(explorer)_
- plugins/mccp/scripts/workflows/plan-review.js:108-124 — graceful degrade on missing input (coerceInput) + degradation logging; M6 test must emit same logs on any Workflow contract violations so passing path does not silently downgrade panel size  _(explorer)_
- plugins/mccp/scripts/lib/plan-review/record.js:buildReviewRecord() — dual measurement contract (both HALT + pass paths use same function); M6 must ensure passing-path invocation uses identical record generation logic at same wall_clock_ms capture point (startedAtMs before panel, nowMs after decide)  _(explorer)_
- plugins/mccp/scripts/lib/completion-ledger/store.js:146-149 — enum validation on write (VALID_PROVENANCE); when M6 writes verdict_provenance='multi-agent', must validate ledger additive extension is present (CLAUDE.md §3.12 no-rehash preservation)  _(explorer)_
- .claude/prds/diverse-agent-review.prd.md §Risks 'same-model L2 is correlated' — L2 reviewer diversity (4 distinct lenses: architect/security/test/invariant) is the gatekeeper against this; M6 test must confirm all 4 agents fire (not degrade to 1) and produce diverse findings  _(explorer)_
- plugins/mccp/scripts/lib/plan-review/l1-check.js — 7 deterministic checks before any LLM; M6 test must use a plan that passes L1 (no missing sections, correct repo-root paths, etc.) so L1 shortcircuit does not mask L2/L3 observation  _(explorer)_
- plan.md Phase 5 2.5c-pin — DD13 plan-hash bind before L2 launch (emit-workflow-args computes reviewedPlanHash, workflow carries it, decide validates no mismatch); M6 test must not edit plan between emit and decide so bind proof is not corrupted  _(explorer)_

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md` | CREATE | 유일하게 살아남은 R4 레코드를 slug 공유 덮어쓰기에서 분리해 고정 (DN3, O3) |
| `.claude/PRPs/reports/diverse-agent-review-m6-report.md` | CREATE | O1~O3의 근거·provenance·승인자 기록 (DN2, DN4) |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | #6 Outcome 재정의 + status · Success Metrics · Evidence에 O1~O3 · Open Questions · **#7·#8·#9 신설** |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.8 → 1.23.9` (§3.7 patch — PRD 전체는 미완료) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | `[1.23.9]` 항목 + versioning note의 `currently` 갱신 |

> `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`는 의도적으로 빠져 있다 — 기대 version을 `plugin.json`에서 `require`로 파생하므로 수정 대상이 아니라 검증 수단이다. `plugins/mccp/scripts/lib/plan-review/`·`commands/`·`workflows/`는 **한 줄도 바꾸지 않는다**(UI6). O3이 요구하는 수정은 #9 소관이다.

## Tasks

### Task 1: 살아남은 레코드를 고정하고 소멸을 기록한다

O3 때문에 이 저장소에는 R4 레코드 하나만 남아 있다. 이 PRD로 `/mccp:plan`을 다시 돌리면 그것도 사라지므로 **구현 착수 직후 첫 작업**이다(DN3).

- **Action**: `.claude/reviews/plan-review-diverse-agent-review.md`를 `…-m6-r4-blocked.md`로 복사한다. 파일명이 이 레코드가 **차단(R4) 실행**의 것임을 밝힌다 — 승인 기록이 아니다(M4의 `-postimpl-l1` 선례와 같은 이유).
- **Mirror**: `.claude/reviews/plan-review-diverse-agent-review-m4-postimpl-l1.md`
- **Validate**:

```bash
node -e "
const fs=require('fs');
const F='.claude/reviews/plan-review-diverse-agent-review-m6-r4-blocked.md';
if(!fs.existsSync(F)) throw new Error('pinned record missing: '+F);
const md=fs.readFileSync(F,'utf8');
const i=md.indexOf('## Measurement');
if(i<0) throw new Error('no ## Measurement section');
const m=md.slice(i).match(/[\`]{3}json\r?\n([\s\S]*?)\r?\n[\`]{3}/);
if(!m) throw new Error('no json fence under ## Measurement');
const j=JSON.parse(m[1]);
if(j.verdict!=='divergent') throw new Error('expected the blocked R4 record, got verdict='+j.verdict);
if(j.halt_stage!=='5.2e') throw new Error('expected halt_stage 5.2e, got '+j.halt_stage);
if(!Number.isInteger(j.wall_clock_ms)) throw new Error('wall_clock_ms not an integer: '+j.wall_clock_ms);
if(j.plan_path!=='.claude/plans/diverse-agent-review-m6.plan.md') throw new Error('record is for another plan: '+j.plan_path);
console.log('pinned R4 record: '+j.verdict+' halted '+j.halt_stage+' in '+j.wall_clock_ms+'ms');
"
```

### Task 2: PRD에 O1~O3을 기입하고 잔여 축을 신규 milestone으로 넘긴다

- **Action**: **#6 Outcome을 재정의**한다 — "패널 승인 경로 1회 완주"를 "설치된 런타임에서 패널을 4회 라이브 실측: 승인 0건 · 차단 경로 wall-clock 목표 이내 · 계측 표면의 재실행 편향 발견"으로. status는 `complete`. **Success Metrics**: 통과 경로 행은 forward-only 유지하되 사유를 "4회 시도, 승인 0건(O1)"으로 갱신하고, 차단 경로 행에 4회 수치를 기입한다. **Evidence**에 "M6 실측(2026-08-14)" 절로 O1~O3을 근거와 함께 적는다. **Open Questions**: "패널 승인의 실제 품질"을 O1로 갱신(질문이 false-approve 비율에서 *승인 발급 여부*로 앞당겨졌음), "지표 코퍼스의 내구성"을 O3으로 갱신. **신규 milestone 3건을 #6 뒤에 순서대로 추가**한다(UI8 — 행 순서 = 실행 순서): **#7** budget 게이트 라이브 발화 관측(UI13 이관) · **#8** 패널 quorum 캘리브레이션 재검토(O1 근거) · **#9** 계측 재실행 편향 해소(O3 근거, #5 이후).
- **Mirror**: 같은 PRD의 #4 → #6 이관 note — 판정을 바꾸지 않고 사유를 갱신하며 골대 이동이 아님을 근거로 밝히는 형태
- **Validate**:

```bash
node -e "
const fs=require('fs');
const prd=fs.readFileSync('.claude/prds/diverse-agent-review.prd.md','utf8');
const lines=prd.split(/\r?\n/);
const row=lines.find(l=>l.includes('plan 게이트 wall-clock (통과 경로)'));
if(!row) throw new Error('Success Metrics pass-path row not found');
if(!/forward-only/.test(row)) throw new Error('pass-path row must stay forward-only — 4 attempts, 0 approvals (UI3)');
if(/[0-9][0-9,]*\s*ms/.test(row)) throw new Error('pass-path row must not carry a measurement it does not have');
const blocked=lines.find(l=>l.includes('plan 게이트 wall-clock (차단 경로)'));
if(!blocked||!/280,?209|307,?578/.test(blocked)) throw new Error('blocked-path row does not carry the observed numbers');
const rowOf=n=>lines.find(l=>new RegExp('^\\\\|\\\\s*'+n+'\\\\s*\\\\|').test(l));
const m6=rowOf(6);
if(!m6) throw new Error('milestone #6 row not found');
if(!/complete/.test(m6)) throw new Error('#6 not marked complete');
if(!/diverse-agent-review-m6\.plan\.md/.test(m6)) throw new Error('#6 Plan cell not filled');
for(const [n,kw] of [[7,'budget'],[8,'quorum'],[9,'재실행|덮어|축적']]){
  const r=rowOf(n);
  if(!r) throw new Error('milestone #'+n+' not created');
  if(!new RegExp(kw).test(r)) throw new Error('#'+n+' does not name its subject ('+kw+')');
  if(lines.indexOf(r)<lines.indexOf(m6)) throw new Error('#'+n+' must follow #6 — row order is execution order (UI8)');
}
const ev=prd.slice(prd.indexOf('## Evidence'),prd.indexOf('## Users'));
for(const o of ['O1','O2','O3']) if(ev.indexOf(o)<0) throw new Error('Evidence does not carry '+o);
console.log('PRD redefined: #6 complete (forward-only pass path), #7/#8/#9 created');
"
```

### Task 3: 보고서에 근거와 provenance와 승인자를 기록한다

- **Action**: `.claude/PRPs/reports/diverse-agent-review-m6-report.md`에 필수 절을 둔다: `## Summary` · `## 선행 조건`(캐시 version·`plan-review/` 파일 목록·`cli.js mode` 출력 전사 — 막힌 것이 런타임이 아니었음의 근거) · `## O1 패널 승인 0건`(라운드별 findings 수와 관점 verdict 표) · `## O2 차단 경로 wall-clock`(4회 수치 + **provenance 열** — R4는 파일, R1~R3은 세션 관측, DN4) · `## O3 계측 재실행 편향`(slug 파생 실측 + 4회 실행 대비 잔존 1건) · `## 승인자 기록`(이 plan이 어떤 경로로 구현됐는지 — 게이트 재진입 / codex 폴백 / 게이트 밖 직접 적용, DN2) · `## 한계` · `## Acceptance 대조`.
- **Mirror**: `.claude/PRPs/reports/diverse-agent-review-m4-report.md` 구조
- **Validate**:

```bash
node -e "
const fs=require('fs');
const md=fs.readFileSync('.claude/PRPs/reports/diverse-agent-review-m6-report.md','utf8');
for(const h of ['## Summary','## 선행 조건','## O1','## O2','## O3','## 승인자 기록','## 한계','## Acceptance 대조'])
  if(md.indexOf(h)<0) throw new Error('report missing required section: '+h);
for(const n of ['307,578','342,767','321,954','280,209'])
  if(md.indexOf(n)<0 && md.indexOf(n.replace(/,/g,''))<0) throw new Error('O2 does not carry the measurement '+n);
const o2=md.slice(md.indexOf('## O2'), md.indexOf('## O3'));
if(!/provenance|출처/i.test(o2)) throw new Error('O2 does not distinguish evidence strength (DN4)');
if(!/파일/.test(o2)||!/세션/.test(o2)) throw new Error('O2 must mark which numbers are file-backed and which are session-observed');
console.log('report OK');
"
```

### Task 4: version과 CHANGELOG를 동기한다

- **Action**: `plugin.json`을 `1.23.9`로 올리고 `html.js` page-foot·`markdown.js` derived 줄을 같은 값으로 맞춘 뒤 CHANGELOG에 `[1.23.9]` 항목과 versioning note의 `currently` 값을 갱신한다. 항목 본문은 **코드 변경 0줄에 문서·측정 기록 milestone**임을 밝힌다.
- **Mirror**: `CLAUDE.md` §3.7 version 동기 규칙 + forward-only 상향
- **Validate**:

```bash
node --test "plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js"
node -e "
const fs=require('fs');
const v=require('./plugins/mccp/.claude-plugin/plugin.json').version;
if(v!=='1.23.9') throw new Error('plugin.json not bumped: '+v);
for(const f of ['plugins/mccp/scripts/lib/renderer/html.js','plugins/mccp/scripts/lib/renderer/markdown.js'])
  if(!fs.readFileSync(f,'utf8').includes('v'+v)) throw new Error(f+' footer version stale');
const cl=fs.readFileSync('CHANGELOG.md','utf8');
if(cl.indexOf('## ['+v+']')<0) throw new Error('CHANGELOG missing ['+v+'] heading');
if((cl.match(/^## \[1\.23\.9\]/gm)||[]).length>1) throw new Error('duplicate [1.23.9] heading — parallel-branch collision');
console.log('version surfaces synced at '+v);
"
```

## Validation

```bash
# Task 1-4 각 절의 Validate 블록이 정본이며 순서대로 실행한다.
# 이 plan의 Task는 /mccp:prp-implement가 실행한다 — /mccp:plan은 계획만 쓰고 멈춘다.
# 아래는 그 위에 얹는 전역 불변식이다.

# UI6 — 게이트 배선 변경 0줄. O3이 요구하는 수정은 #9 소관이므로 여기서 손대지 않는다.
git diff --stat origin/main -- plugins/mccp/commands/ plugins/mccp/scripts/lib/plan-review/ plugins/mccp/scripts/workflows/

# UI7 — receipt schema · git-tracked ship corpus 무변경
git diff --stat origin/main -- plugins/mccp/scripts/receipt/ .claude/receipts/mccp-pr-codex/

# 커밋된 신규 blob의 절대경로 누출 (도구 본래 용도)
node plugins/mccp/scripts/lib/history-leak-scan.js

# 전량 회귀 — 이 milestone은 코드를 바꾸지 않으므로 전부 green이어야 한다
node --test "plugins/mccp/scripts/lib/tests/plan-review-*.test.js"
node --test "plugins/mccp/scripts/receipt/tests/*.test.js"
node --test "plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 이 PRD로 `/mccp:plan`을 다시 돌려 마지막 남은 R4 레코드마저 소멸한다 | **High (실측 — 이미 3건 소멸)** | Task 1을 구현 착수 직후 첫 작업으로 고정 (DN3, O3) |
| 재정의가 골대 이동으로 읽힌다 | Medium | 어떤 clause도 달성으로 적지 않는다 — 통과 경로는 forward-only, budget은 #7, quorum은 #8, 계측은 #9. Task 2 Validate가 통과 경로 행에 수치가 **들어가는 것**을 실패로 처리한다 (UI3) |
| O2의 인접 수치(차단 경로)가 통과 경로 지표로 승격된다 | Medium | Task 2 Validate가 통과 경로 행의 `ms` 표기를 금지 · 보고서 O2가 provenance를 열로 구분 (UI10, DN4) |
| 이 plan이 게이트 승인 없이 구현된다 | **High (설계상)** | DN2가 세 경로를 명시하고 보고서 `## 승인자 기록`이 실제 경로를 남긴다 — 승인자가 패널이 아니었다는 사실을 숨기지 않는다 |
| #7·#8·#9가 만들어지고 잊힌다 | Medium | Task 2 Validate가 세 행의 존재·주제어·순서(#6 뒤)를 강제 |
| 병렬 브랜치가 `1.23.9`를 선점한다 | Low | §3.7 forward-only 상향 · Task 4 Validate가 CHANGELOG heading 중복을 검출 |
| O3 수정을 이 milestone에서 하고 싶어진다 | Medium | UI6 — #5 오라클 추출 이전에 계측 배선을 늘리지 않는다. Validation의 `git diff --stat`이 0줄을 강제 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) — **본 milestone은 4회 완주 시도의 산출물(`.claude/reviews/` 레코드 + 라운드별 verdict)로 이를 충족하며, 완주가 승인을 뜻하지 않음을 O1이 기록한다**
- [ ] R4 레코드가 `…-m6-r4-blocked.md`로 고정됐고 `verdict: "divergent"` ∧ `halt_stage: "5.2e"` ∧ 정수 `wall_clock_ms` ∧ `plan_path`가 이 plan이다
- [ ] PRD Success Metrics 통과 경로 행이 **forward-only를 유지**하며 수치를 담지 않는다 (UI3 — 4회 시도, 승인 0건)
- [ ] PRD 차단 경로 행이 4회 실측 수치를 담는다
- [ ] PRD Evidence가 O1·O2·O3을 각각 근거와 함께 담는다
- [ ] PRD milestone #6이 `complete`이고 Outcome이 재정의됐으며, #7(budget)·#8(quorum 캘리브레이션)·#9(계측 재실행 편향)가 #6 뒤에 순서대로 신설됐다 (UI8, UI13)
- [ ] 보고서가 O2의 provenance를 구분한다 — R4는 파일, R1~R3은 세션 관측 (DN4)
- [ ] 보고서 `## 승인자 기록`이 이 plan이 실제로 어떤 경로로 구현됐는지 적는다 (DN2)
- [ ] `plugins/mccp/commands/` · `plugins/mccp/scripts/lib/plan-review/` · `plugins/mccp/scripts/workflows/` 변경 0줄 (UI6)
- [ ] receipt schema · `receipt_hash` · git-tracked ship corpus 무변경 (UI7)
- [ ] `plugin.json` `1.23.9` + `html.js`/`markdown.js` footer 동기, `i18n-surface.test.js` green

## Design Critique

- 트리거: `impeccable-detect --mode plan` → `design_signal=true` (axis a) · `signal_files=[plugins/mccp/scripts/lib/renderer/html.js, plugins/mccp/scripts/lib/renderer/markdown.js, plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js]`
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료
- 라운드: 1 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY=2`, R0에서 종료) · verdict **CONVERGED**
- Assessment A(4 Output Constraints 대조) — 이 plan의 렌더 표면 변경은 footer version 리터럴 2건뿐이다
  - 정보 위계 3단계(H15): heading 미변경 → PASS
  - 강조색 화면당 1개: 색·토큰 미변경 → PASS
  - raw markdown marker 금지: `markdown.js`의 `_derived from …_`은 markdown 표면 자신의 문법이며 누출이 아니다 · `html.js`는 `<code lang="en">`로 정상 마크업 → PASS
  - 한 화면 항목 수 상한: 리스트 렌더링 미변경 → PASS (collapse는 renderer 소유이지 plan 저자 소유가 아님)
- Assessment B(결정적 detector): `detect.mjs --json .claude/cache/status.html` → exit 0, 2건. 둘 다 기존 표면이며 이 plan이 도입하지 않는다
  - `em-dash-overuse` (warning) — 본문 27건 · `numbered-section-markers` (advisory) — milestone 식별자라 금칙의 자체 예외
  - 선재 표면의 개선은 renderer 소유이며 M6 범위 밖이다
- HIGH/CRITICAL 0건 → `decideCritique({findings: [], round: 0, cap: 2})` = **CONVERGED**
- Persistence: `.impeccable/critique/` 스냅샷 write는 생략 — plan의 `Files to Change`에 없는 repo 아티팩트를 게이트 도중 만들지 않기 위함(M1·M4 선례와 동일)

## Design Routing Guide

routing mode: `auto` (effective at implement stage). 이 plan은 렌더 UI를 만들지 않으므로 plan 단계에서는 어떤 impeccable 명령도 호출하지 않는다 — 아래는 구현자를 위한 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy)

- 경로: `MCCP_PLAN_REVIEW=codex` — DN2가 택한 (b)다. 패널은 발화하지 않았다(`cli.js mode` → `fires.l1/l2/l3=false` · `fleet_keys=[]`, 실측). UI14 준수 — 추가 패널 실행 0회.
- classification: `disabled` · `blocking=false` · `durationMs=0` (실측) — spawn 직전 short-circuit이므로 Codex 호출은 0회다. → `resolution.codex_verdict='skipped'` · `meta.codex_disabled=true`.
- 이 절은 승인을 주장하지 않는다. `skipped`는 `converged`가 아니므로 cross-gate dedupe는 fail-closed로 남고, terminal `/mccp:pr`에서 PR-Codex가 반드시 발화한다 — 이 milestone의 cross-model 검증은 제거된 것이 아니라 ship 지점으로 이동한다(DN2).
- 승인자는 패널이 아니라 env-policy skip이다. 그 사실은 보고서 `## 승인자 기록` 절이 소유한다(DN2). O1이 기록한 대로 패널은 4회 라이브 실행에서 승인을 0건 발급했다.

## Codex Implementation Review

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy)

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1
- classification: `disabled` · `blocking=false` · `exit=0` (실측) → `CODEX_VERDICT=skipped`
- 합치 결론: Codex는 발화하지 않았다. plan 게이트와 동일하게 `skipped`가 봉인되므로 cross-gate dedupe는 fail-closed로 남고 PR-Codex가 ship 지점에서 발화한다.
- YAGNI Triage: 해당 없음 (findings 0건 — Codex 미발화)
- Deferred to backlog: 0
- Open Questions: 없음
- Codex session 참조: 없음 (spawn 직전 short-circuit, durationMs=0)

### Security Reviewer

해당 없음. 이 milestone의 변경은 문서(PRD·보고서·CHANGELOG)와 version 리터럴 3건(`plugin.json`·`html.js` page-foot·`markdown.js` derived 줄)뿐이고, auth·crypto·secret·입력 검증·injection·SSRF·path traversal·권한 상승 어느 표면도 건드리지 않는다. auto-fallback이 아니라 **적용 대상 부재**이므로 `security_skipped`를 stamp하지 않는다.
