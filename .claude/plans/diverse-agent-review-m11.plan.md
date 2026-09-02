# Plan: 패널 승인 품질 감사 (diverse-agent-review #11)

**Source PRD**: `.claude/prds/diverse-agent-review.prd.md`
**Selected Milestone**: #11 — 패널 승인 품질 감사 (false-approve)
**Complexity**: Medium

## Summary

#11은 배선 milestone이 아니라 **판정 milestone**이다(#6·#7·#8과 같은 형태). #8이 답한 것은
"승인이 발급되는가"였고 답은 예였다 — converged 5건. 그 답이 생기자마자 **이전에는 성립하지
않던 질문**이 성립한다: 그 승인은 옳았는가.

이 milestone은 그 5건에 대해 **승인 이후에 다른 생산자가 기록한 결함 증거**를 기계적으로
결속하는 read-only 도구(`approval-audit.js`)를 만들고, 그 출력 위에서 판정을 확정해 동결한다.
**게이트 배선은 한 바이트도 바꾸지 않는다**(UI6) — `corpus.js`가 세운 standalone 선례를 그대로
따른다.

착수 전 실측이 이미 두 가지를 확정했고, 그 둘이 이 plan의 형태를 정한다. 첫째, **이 코퍼스에서
cross-model 채널은 구조적으로 비어 있다** — 5건 전부 ship receipt의
`resolution.codex_verdict`가 `skipped`이고 `meta.codex_disabled=true`이며 `findings`가
0건이다. 즉 그 5건이 ship될 때 Codex는 꺼져 있었고, 그 채널의 0을 "Codex가 놓친 것을 못
찾았다"로 읽으면 M8이 F6에서 한 번, 단일통과 축에서 또 한 번 지불한 오류를 세 번째로
반복하는 것이다. (근거는 receipt 자신이지 현재 환경이 아니다 — 착수 시점에
`codex-policy seal`은 `codex_disabled=false`를 보고했고 `MCCP_CODEX_DISABLED`는 프로젝트·
사용자 settings 어디에도 없다. 과거 실행의 정책을 현재 env로 추론하지 않는다.)
둘째, **5건 중 1건은 리뷰된 본문 자체가 복구 불가**다 —
`impeccable-detection-contract-m6`의 `reviewed_plan_hash`는 디스크·ship receipt·이 브랜치의
어떤 커밋 리비전과도 일치하지 않는다. 그 1건은 `unauditable`이며, 그것을 "결함 없음"으로
세지 않는 것이 이 milestone의 정직성 조건이다.

## User Intent

<!-- USER-STATED constraints only. 저자 정당화는 ## Design Notes 소관이다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 게이트 리뷰는 1라운드를 기본으로 하고 plan을 다듬기보다 적용 후 결과로 판단한다 | direction |
| UI2 | 리뷰 finding은 CRITICAL·HIGH만 그 자리에서 흡수하고 나머지는 증거와 함께 backlog로 이연한다 | constraint |
| UI3 | 리뷰어 프롬프트를 통과 목적으로 완화하지 않는다 | exclusion |
| UI4 | receipt 위조와 기존 ship receipt 재봉인을 하지 않는다 | exclusion |
| UI5 | 게이트 배선을 늘리는 작업은 #5 오라클 추출 뒤에 착수한다 | constraint |
| UI6 | 산출 이력이 0인 지표는 달성이 아니라 forward-only로 적는다 | constraint |
| UI7 | 인접 측정을 목표 측정으로 승격하지 않는다 | exclusion |
| UI8 | 판정을 바꾸지 않고 사유를 갱신하되 증거가 바뀌면 판정도 갱신한다 | direction |
| UI9 | 근거 없는 임계값을 날조하지 않는다 | exclusion |
| UI10 | Codex 완전 제거는 범위 밖이며 hybrid opt-in으로 존속시킨다 | exclusion |
| UI11 | 관측 작업은 배선 추가가 아니므로 #5 앞에 둘 수 있다 | direction |

## Preconditions — 착수 전 실측 (2026-08-27)

`/mccp:plan` 접지 단계에서 확인한 것. 이 수치들은 Task 1 도구가 재도출하며, 여기 적는 이유는
plan의 형태가 이 관측에 의존하기 때문이다.

- 승인 레코드 **5건** — `corpus.js --json`의 `pass_path.entries`. 전부 `source: multi-agent` ·
  `hash_bound: true` · `single_pass_trace: false`. (같은 실행에서 `records`는 37로 M8 동결
  시점의 35보다 2 늘었다. 코퍼스는 살아 있고 M8 문서는 스냅샷이다 — Task 3이 그 차이를 적는다.)
- **ship receipt가 5건 모두 존재**한다 — `.claude/receipts/mccp-pr-codex/`는 git-tracked이므로
  worktree cleanup을 견딘다(§3.12). 반면 `.claude/receipts/mccp-plan-codex/`는 **디렉토리째
  부재**다(worktree-only). 즉 승인의 `review_proof` 객체는 남아 있지 않다.
- **cross-model 채널 구조적 공집합** — 5건 전부 `resolution.codex_verdict='skipped'` ·
  `meta.codex_disabled=true` · `findings` 길이 0.
- **리뷰된 본문 복구 가능성 4/5** — 기록된 `plan_path`의 해시 체제로 재계산하면 4건이 일치한다.
  `impeccable-detection-contract-m6`만 불일치하며, 그 리비전은 `git rev-list`로도 찾지 못했다.
- **함정 1건 실측** — `santa-adjudication-m1`·`m2`·`codex-intent-context-m2`는 이미
  `.claude/PRPs/plans/archived/`로 이동했고, 현재 경로로 `hash-plan`을 부르면 3건 전부
  불일치한다. `isPlanPath`가 `.claude/plans/*.plan.md`에만 참이라 아카이브 경로에서는 구조적
  해시가 아니라 raw 해시로 떨어지기 때문이다(`hash.js:169`, `hash.js:174`). 기록된 경로의
  체제로 재계산하면 3건 모두 복구된다.
- 구현 보고서가 5건 모두 존재한다(`.claude/PRPs/reports/<slug>-report.md`).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 감사 도구 형태 | `plugins/mccp/scripts/lib/evidence-audit.js:1-40` | read-only · LLM-free · standalone · state precedence ladder |
| 부재는 결함 부재가 아니다 | `plugins/mccp/scripts/lib/evidence-audit.js:29-31` | 대조 대상 0이면 `ok` 대신 `blind` + 비영점 exit |
| 구조적 0 vs 관측된 0 | `plugins/mccp/scripts/lib/plan-review/corpus.js:76-91` | 0이면 코퍼스 탓인지 상류 불변식 탓인지 먼저 답한다 |
| 레코드 파싱 계약 | `plugins/mccp/scripts/lib/plan-review/record.js:158-176` | 생산자가 쓰는 표 형식이 곧 파서의 계약 |
| 순수 오라클 + 얇은 CLI | `plugins/mccp/scripts/lib/plan-review/quorum.js:134-210` | 판정은 인자 주입 순수 함수, 경로 I/O는 CLI 층 |
| 해시 체제 선택 | `plugins/mccp/scripts/receipt/hash.js:169-175` | 경로가 해시 함수를 고른다 — 경로를 바꾸면 해시가 바뀐다 |
| test 위치·러너 | `plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js:1-40` | `node --test`, `lib/tests/`, `plan-review-*.test.js` |
| 관측 milestone 산출물 | `.claude/PRPs/reports/diverse-agent-review-m8-report.md` | 원자료 축자 동결 + Acceptance 대조 |

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~43k.

### Findings (severity-ranked)

- **[CRITICAL][test]** M11's acceptance criterion ('approval was correct') lacks a mechanical definition; audit tool cannot validate false-approve without ground truth — PRD Open Questions L160 'each approved plan against its epoch corpus', but no definition of what 'correct' means. M8 plan DN6 notes 'we cannot say an approval was wrong if we cannot measure the quality of the panel itself'. No unit test can be pre-written because the criterion is unstated.
- **[HIGH][architect]** M11's acceptance criterion — 'each approved plan audited against its-point-in-time corpus' — leaves implicit boundary on what '그 시점 코퍼스' means, creating ambiguity in scope — PRD line 108: 'each approved plan을 그 시점 코퍼스와 대조해 패널이 놓친 실물 결함이 있었는지'. `.claude/reviews/` records carry `recorded_at` timestamps (corpus.js observed), permitting point-in-time reconstruction, but M11 does not specify: (a) whether 그 시점 = approval time OR audit-time, (b) whether git-history reconstruction is expected, (c) how to handle multi-round evolution (O3 overwrite problem)
- **[HIGH][architect]** M11 audit depends on corpus stability and completeness (corpus.js output), but O3 identified that record paths overwrite on re-execution within same PRD, meaning convergence trajectory (divergent→converged) is lossy — PRD line 36: O3 identifies 'レコード경로 slug가 PRD 경로 파생이라 재실행이 이전 라운드를 덮어쓴다'; corpus.js lines 28–35 distinguish `pre_measurement` (13 records before M4), `parse_failures` (halt on malformed), `out_of_corpus` (other producers). M11's audit of 5 approved cases sees only final records (R_final), not intermediates (R1→R2→R3→converged progression). If approval quality depends on observing *what-was-fixed*, that data is gone.
- **[HIGH][architect]** M11 does not specify the audit method (manual code review vs. automated tool vs. re-running panel vs. post-ship comparison), creating ambiguity in acceptance criteria and effort scope — PRD line 108 Outcome: '관측 작업이므로 배선 추가가 아니고'. But 'audit whether approvals are correct' could mean: (1) human re-review of 5 plans (labor: 5 plan_path × N reviewer-hours), (2) re-run panel on same plans to test repeatability (but outcome is tautological if result=approved again), (3) auto tool comparing against external standard (undefined), (4) post-implementation observation of actual delivered quality. No test/acceptance framework is sketched.
- **[HIGH][security]** M11 audit reads converged approval records but lacks explicit validation that reviewed_plan_hash binding integrity is checked before comparing approval correctness — PRD §Open Questions clause on line 160-162 requires comparing approved plan against corpus to detect false-approve. However, no M11 implementation exists yet. Existing evidence-audit.js (lines 179-197) validates receiptIntegrityOk() by recomputing receiptHash and matching schema. M11 must mirror this before using reviewed_plan_hash as audit evidence, or risk accepting tampered approvals as valid anchors for false-positive analysis.
- **[HIGH][security]** M11 must validate review_proof structural completeness per DD11 rule before accepting approval as audit baseline, but this check is only documented in review-verdict.js:resolveEffectiveVerdict, not as a standalone reusable helper — review-verdict.js lines 214-223 (resolveEffectiveVerdict): partial stamps (missing review_verdict, review_source, or review_proof) are downgraded to 'unavailable' (fail-closed). M11 audit reading converged records must apply isReviewProofStructurallyValid() (lines 105-186) to each candidate approval before analyzing it. If M11 accepts a partial proof as convergence data, it risks basing false-approve audit on unvalidated evidence.
- **[HIGH][test]** M11 cannot use gate-execution test pattern (pre/post); must be pure read-only audit on git-tracked `.claude/reviews/` corpus, but corpus quality is unverified — PRD L160 'spost-audit'; M8 plan DN1 'no code changes' + corpus.js shows 35 records with `pre_measurement=13` time boundary. These 13 pre-M4 records are missing `## Measurement` block entirely — audit tool must handle gracefully but may silently drop early data. No test validates that finding recovery from `.claude/reviews/` markdown matches what the quorum actually saw.
- **[HIGH][test]** Survivorship bias is not measured — approved plans might appear correct only because they were lucky, not because the panel was accurate; tail length unknown — PRD L74-77 '生存 편향의 방향도 불분명' + O3 overflow (35 is lower-bound). converged 5/35 point estimate has unmeasured sampling error. M7 plan DN5 'audit before production output' — but we cannot rewind to 'what findings would exist if we re-reviewed with current Codex' because Codex version has changed.
- **[HIGH][explorer]** M11 should reuse evidence-audit.js as template for retrospective audit tool — both are read-only LLM-free corpus audits with state-precedence reporting — evidence-audit.js (plugins/mccp/scripts/lib/evidence-audit.js:1-52) implements ledger↔receipt corroboration audit with state ladder (ok/blind/degraded/incomplete/inconsistent). M11 faces identical shape: read historical records → parse structured data → compute correlation (verdict validity vs defect presence) → report state + counts + JSON. The pattern is directly transferable for false-approve detection.
- **[HIGH][explorer]** corpus.js is the proven aggregator for plan-review record corpus — M11 depends on extending its data extraction, not reimplementing record parsing — corpus.js (plugins/mccp/scripts/lib/plan-review/corpus.js:1-90) already parses `.claude/reviews/` records, validates 'Plan Review Panel' marker, extracts Measurement blocks, handles pre_measurement boundary (M4 baseline), and distinguishes panel records from out-of-corpus reviews. M8 used this for 35-record corpus summary. M11 needs the SAME parsing infrastructure to: (1) identify the 5 converged records by slug, (2) extract their quorum/hash/timestamp, (3) correlate each against findings-at-time.
- **[HIGH][explorer]** review-verdict.js + decide.js define the SINGLE approval SSoT that M11 must use for false-approve detection — approval truth must not be recalculated — review-verdict.js (plugins/mccp/scripts/lib/review-verdict.js:1-45) and decide.js (plugins/mccp/scripts/lib/plan-review/decide.js:1-50) establish that there is ONE place (`resolveEffectiveVerdict`) that answers 'was this approved?' by consulting review_verdict (M1) → codex_verdict (legacy) precedence. M11 cannot independently compute 'was the approval valid' — it must use the same resolve path to query what the panel ACTUALLY said, then check if that panel verdict was undercut by subsequent defect findings.
- **[HIGH][explorer]** M11 must not extend receipt schema — present-only fields and no-rehash invariant forbid new approval audit fields in ship receipts — PRD §3.12 (CLAUDE.md evidence durability contract) forbids rehashing ship corpus receipts; present-only fields in current system (meta.* audit fields) are stamped but excluded from receipt_hash. If M11 tries to add `approval_quality` or `false_approve_confidence` to receipt, it violates no-rehash. M11 should write its audit findings to git-tracked `.claude/reviews/` records (like M8's corpus tool), NOT to receipts.
- **[MEDIUM][architect]** M11's sample (converged 5 cases) is pre-filtered by M8's cleanness criteria (hash-bound, single-pass-free), creating potential circular reasoning if audit finds all 5 correct — PRD M8 line 66: '5건 전부 `reviewed_plan_hash` 결속이 있고 단일통과 토글 흔적이 없다' as pre-filter. M11 audits only those 5. If all 5 pass audit, conclusion is 'panel approves correctly when it does so cleanly', not 'panel is free of blind spots'. M11 outcome doesn't clarify what false-approve rate would falsify the hypothesis.
- **[MEDIUM][architect]** M11's boundary with later work (production implementation, post-ship correction) is undefined — unclear whether audit detects false-approves that ship undetected vs. false-approves that ship then get caught — PRD Open Questions line 160: 'false-approve 비율을 물을 표본이 있다'. But false-approve detection requires a *ground truth* source external to the panel. PRD doesn't specify: does M11 compare against (a) Codex re-review (would re-activate Codex blocking), (b) manual human audit of shipped code (would shift cost to post-implementation), (c) regression in production (would require deployed artifact + user data). Each choice has different architecture implications.
- **[MEDIUM][architect]** M11's dependency chain (M8 → converged 5 cases → M11 audit) creates strict ordering; if M8 decisions are revised or corpus re-evaluated, M11's premise collapses — PRD Scope line 116: 'M11은 미달의 이관이 아니라 질문의 승격이다 — #8은 하려던 것을 했다'. If later work (e.g., #5 oracle extraction) reveals that M8's binding-axis classification was wrong, the 5 'approved' cases might be re-classified as divergent, invalidating M11's sample. No backpointer from M11 to M8's data guarantees exist.
- **[MEDIUM][security]** M11 reading dispatch_evidence paths from review_proof lacks explicit path validation for traversal/injection before using them in audit filesystem operations — review-verdict.js:isRepoRelativeEvidencePath (lines 80-95) validates evidence paths reject: POSIX absolute, UNC, drive letters, backslashes, .. traversal, . segments, NUL. These are structural invariants (not cosmetic). M11 may read `.dispatch_evidence[]` paths from approval records to correlate against plan repo. If M11 does not re-validate these paths using the same canonical validator, it could accept path-injection in stale records.
- **[MEDIUM][security]** M11 cannot safely assume approved converged verdicts were issued by legitimate quorum without re-validating quorum proof structure, but no single validation point is exposed for M11 to call — review-verdict.js:isReviewProofStructurallyValid (lines 105-186) encodes strict invariants: layers.l1 and layers.l2 must be 'converged', quorum.passed=true, responded≥required, roles=distinct-count. Line 160-169: 'EXACT, not a floor' — seenRoles.length must EXACTLY match quorum.roles (fixing santa-loop R3 defect). M11 cannot inspect these fields without calling this validator; inline checks risk missing future refinements.
- **[MEDIUM][security]** M11 auditing hybrid-source approvals (cross-model) must verify L3 actually converged per isCrossModelCorroborated, or risk treating same-model approvals as corroborated — review-verdict.js:isCrossModelCorroborated (lines 241-274, esp. 266-271) — hybrid source must have layers.l3='converged' in proof, not merely source='hybrid' in metadata. A partial stamp or stale record claiming hybrid but with null l3 would fail this predicate. M11 audit must apply this check when analyzing hybrid-issued approvals, or false-approve risk is not bounded.
- **[MEDIUM][security]** M11 audit comparison method (determining whether an approved plan actually had defects later found) is not specified in PRD and risks confirmation bias if audit methodology itself has implicit assumptions — PRD §Open Questions line 160-162: '승인이 발급되었는가' answered (5 converged), now 'false-approve 비율'은 사후 감사 필요. No acceptance criteria, methodology, or audit oracle definition in PRD or codebase. Risk: M11 could use same L2 panel for 'did this plan actually have defects' that approved it, or use a coarser/different set of rules that systematically over-reports defects. Methodology should be documented.
- **[MEDIUM][test]** No test validates that `reviewed_plan_hash` in approved records actually identifies the reviewed plan state; binding assertion is unverified — PRD L62 'full hash binding' + M8 quorum-calibration 'hash_bound=5' — but no unit test proves that gitsha→receipt hash round-trip is correct. If hash was computed wrong at stamp time, all 5 'bound' approvals are false positives. record.js L23-24 warning about newlines breaking rows is structural validation only, not correctness of the hash algorithm.
- **[MEDIUM][test]** Finding table parsing must be rock-solid but will live in `.claude/reviews/` markdown, not structured receipt JSON; seam-layer defect risk is High — PRD §167 Risk 'gate wiring outside unit test reach' + M1 real-world experience '28건 전부 command-body seam'. corpus.js must parse record.js's `findingRows` table format; any format drift between producer and parser causes silent data loss. M8 quorum-calibration shows refutation-attempted table with 129 raw verdicts — if parsing is off by one row, counts will drift.
- **[MEDIUM][test]** M11's tool should mirror corpus.js pattern (read-only, LLM-free, standalone) but must add retrospective axis; test will not catch if ground-truth definition is missing — M8 plan L62-66 Patterns to Mirror; corpus.js L8-12 'read-only · LLM-free · fs + child_process(git)'. M11 audit will add 'per-approved-plan, did findings exist in epoch corpus that should have been caught?' But who defines 'should have been'? M8 DN1 explicit: 'tool counts, document judges'. If document has no judgment rule, tool output is interpretable but validation is not.
- **[MEDIUM][test]** Edge case: approved plan might be correct as-written, but defects introduced during prp-implement phase; post-audit cannot distinguish 'panel wrong' from 'scope creep' — No explicit scope in PRD for 'what timestamp to audit at'. If we audit against final plan state (after implement), divergence from approval-time plan is confounded. M1 real-world example: 20건 중 6건이 이전 라운드 수정이 만든 것 — plan changes between rounds invalidate approval retroactively.
- **[MEDIUM][test]** No test validates that audit tool correctly identifies the 5 approved records from `.claude/reviews/` corpus; false-negative (audit misses approved plans) silent — corpus.js L23-33 defines copora boundary by first-line signature `# Plan Review Panel —` not filename. If record.js ever changes that header format, old records will be classified as `out_of_corpus`. M11 audit will silently shrink its sample. DN3 '부재는 결함이 아니다' applies to audit tool design, but audit tool cannot test that the signature is correct.
- **[MEDIUM][explorer]** record.js establishes durable record format that M11 must consume — Measurement block structure is normative for retrospective audit — record.js (plugins/mccp/scripts/lib/plan-review/record.js:1-100) defines buildReviewRecord() oracle that writes halt_stage/wall_clock/verdict/proof to every record, including HALT paths. M11's retrospective audit depends on this structure: wall_clock_ms for correlation, verdict for false-approve detection, reviewed_plan_hash for binding validation. If M11 extends record.js to emit additional audit fields, it must preserve backward compatibility (pre_measurement records exist without Measurement block).
- **[MEDIUM][explorer]** quorum.js blocking logic (severity gate + M/K bindings) is the normative decision model — M11 audit must use decideQuorum() to understand why each converged case passed — quorum.js:184-210 implements the three axes (responded/roles/findings) that bind quorum passage. corpus.js:53-115 documents reading `reason` field to extract M/K/findings_binding. M11 needs to replicate this reasoning per plan: was passage because findings were genuinely absent, or was it due to inadequate responses/roles? The 5 converged plans from M8 passed quorum (corpus.js shows all 5 have `passed=true`); M11's false-approve audit is: 'did later findings/implementation reveal defects the panel missed?'
- **[MEDIUM][explorer]** No existing tool performs retrospective plan-vs-findings correlation — M11 must implement the audit logic without prior art — Searched plugins/mccp/scripts/lib/ for retrospective analysis tools; no file matches pattern `*retrospect*` `*audit-plan*` `*false-approve*`. evidence-audit checks verdict agreement; corpus aggregates record counts. Neither correlates 'was plan X sound when approved?' against 'were there real defects in the implementation?'. M11 will need NEW logic to: (1) identify defects from subsequent `/mccp:santa-loop` / `/mccp:code-review` runs on same decision, (2) trace whether panel could have caught them at approval time, (3) classify as false-approve only if finding was in-scope for the reviewers.
- **[MEDIUM][explorer]** Quorum-calibration.md (#8 acceptance evidence) freezes corpus at 2026-08-26 — M11 must establish time boundary to avoid O3 (record overwrite) bias — PRD #6 note (O3) and corpus.js:29-51 explain that record.js write path uses `decision_id`-keyed slug, so reruns overwrite. The 5 converged records in quorum-calibration.md represent a snapshot; M11's audit must (1) verify those 5 still exist at their recorded timestamps, (2) establish 'time of approval' boundary (each plan's wall_clock), (3) only consider findings that postdate each approval as potential misses. If quorum-calibration.md is frozen as M8 output, M11 should NOT re-run corpus.js (would pick up subsequent approvals).
- **[LOW][architect]** M11 scales linearly with converged-case count; no sampling/stratification strategy provided for future milestones with larger corpora — PRD M11 accepts audit of exactly '5건' (from M8). If future milestones produce 20, 50, or 100 converged cases, audit effort grows proportionally. No stratified sampling, no risk-tiering (e.g., 'audit only edge-case approvals'), no stop condition is defined. Contrast with M5 (gate-wiring oracles, which extract patterns), M11 remains O(n) manual work.
- **[LOW][architect]** M11 does not specify mechanism to handle cases where convergence was by 'chance agreement' vs. 'robust shared finding' — risk of conflating luck with quality — Quorum-calibration.md line 72 acknowledges 'converged 5건의 중앙값은 6.4분'. All 5 converged via 4/3 quorum + no blocking findings. But quorum doesn't distinguish 'architect+security agree, test+invariant abstain' (strong consensus) vs. 'all 4 respond, all say ok by narrow margin'. M11 doesn't specify whether to weight approvals by confidence/agreement-strength or treat as binary pass/fail.
- **[LOW][security]** M11 operates on git-tracked ship receipts (immutable) but intermediate review records (.claude/reviews/) are worktree-only and could be deleted/recreated between audit runs, breaking audit reproducibility — PRD §Evidence line 20-21, CLAUDE.md §3.12: ship receipts are git-tracked for durability; plan-review receipts are worktree-only and lost on cleanup. M11 audit reading .claude/reviews/ records risks stale or missing data on re-runs. If M11 records intermediate findings, they should be either (a) re-derived from git-tracked data only, or (b) written to git-tracked output to guarantee reproducibility.
- **[LOW][security]** M11 lacks defined handling for converged approvals whose reviewed_plan_hash no longer matches any plan on disk (approval of now-deleted plan) — PRD #11 Outcome: 'each승인 plan을 그 시점 코퍼스와 대조'. If approval record has reviewed_plan_hash but no matching plan at that hash exists in corpus, M11 cannot determine if approval was correct. This is a coverage/audit gap — should M11 report such orphan approvals as 'unverifiable' (like evidence-audit.js unverifiable≥1), 'degraded', or treat as audit failure?
- **[LOW][test]** Validation will not catch if the 5 approved plans are unrepresentative (all easy cases, or all rigged by single-pass override); acceptance is a ceiling, not sufficiency — PRD L72 '5건 중 4건이 10분 이내' — but wall-clock is confounded with 'were they hard or easy?'. No difficulty metric. corpus.js counts `single_pass=14` (all marked divergent by seal) across whole dataset, but approved 5 have 0 — does that mean approved plans were simpler, or that single-pass only applies to divergent? Cannot tell.
- **[LOW][explorer]** perspectives.js verdict/severity enum are shared with quorum.js + record.js — M11 verdict vocabulary must be identical — quorum.js:19 imports from './perspectives' (SEVERITY_ENUM, VERDICT_ENUM). record.js uses these same enums when parsing reviewer responses. M11's false-approve classification must use the same severity levels (CRITICAL/HIGH/MEDIUM/LOW + unknown) to make finding correlation semantically valid. Any new verdict category M11 introduces must be added to perspectives.js for consistency.

### Meta-gaps

- M11 does not specify who performs the audit (human, automated tool, subagent) and therefore cannot commit to reproducibility or audit trail  _(architect)_
- The definition of 'real defect missed by panel' is implicit — no threshold for severity, category scope, or detection method is stated  _(architect)_
- M11 does not reserve capacity/budget for follow-up if false-approves are detected; outcome assumes audit-only, no action path  _(architect)_
- No specification of how M11 handles the case where corpus.js returns state=degraded or state=blind (record read failures) — does audit fail-closed or proceed with partial corpus?  _(architect)_
- M11 does not reference the point-in-time git-history retrieval method for '그 시점 코퍼스', leaving implementation discovery to plan author  _(architect)_
- The relationship between M11 (backward audit of M1's quality) and #11 Open Questions (which also mentions false-approve measurement) is not disambiguated — appears to be same question, different milestone labels  _(architect)_
- M11 audit methodology not specified — how will false-approve be measured? What is the oracle/comparison point? (risk: same-model bias, methodology hidden in shell, no test-first validation)  _(security)_
- M11 audit scope boundary undefined — will it audit only converged 5 from this PRD, or expand to historical converged corpus? (risk: survivor bias, worktree-only receipt loss)  _(security)_
- No documented M11-to-M5 coupling — if M11 finds approval problems, does it inform gate oracle extraction in #5, or are they independent? (risk: audit finding unused, seam defects hidden again)  _(security)_
- Audit fault injection test missing — is there a test that corrupts an approval proof (tamper review_source, break hash binding, swap l3=null) and verifies M11 rejects it? (risk: M11 audit trusts evidence it should validate)  _(security)_
- M11 plan must define 'correct approval' operationally before audit tool can validate — this is a PRD task, not implementation  _(test)_
- Plan should specify audit window: approval-time corpus (defend only what existed then) vs. final corpus (stronger evidence but confounds with implementation changes)  _(test)_
- Plan must address reproductive validity: can we re-examine the same findings the panel saw, or only the final records? If only final, how do we account for findings that were fixed after approval?  _(test)_
- No validation of `reviewed_plan_hash` algorithm correctness in roundtrip; audit depends on this binding but testing is absent  _(test)_
- Plan should specify how to handle pre-M4 records (13 records with no Measurement block); whether they are sampled out or treated as 'approval before measurement era'  _(test)_
- PRD does not specify the exact methodology M11 will use to determine 'was a finding in-scope for approval-time reviewers?' — how to distinguish unavoidable implementation defects from missed review defects  _(explorer)_
- No definition of 'time boundary' for retrospective audit — should M11 only examine findings from immediately post-approval (within window?), or all findings up to present?  _(explorer)_
- PRD does not clarify sampling: are the 5 converged plans from quorum-calibration.md frozen, or should M11 re-scan corpus.js and find all recent converged plans?  _(explorer)_
- M11 is documented as 'observational' (no gate changes), but interaction with backlog-append.js and single-pass-reason recording is undefined — if M11 finds false-approve, does it auto-append to backlog or wait for operator judgment?  _(explorer)_
- Relationship between M11 (false-approve audit) and M5 (oracle extraction) unclear — if M11 finds a pattern in false-approve that reveals an oracle bug, does it block M5 or flow to M5 as input?  _(explorer)_

### Patterns to mirror

- corpus.js (lines 3–91): read-only observation tool that counts without applying thresholds; judgment is separated into documentation. M11 should adopt similar separation if audit is tooled.  _(architect)_
- quorum-calibration.md (line 5–9): measurement document that freezes tool output verbatim and documents reproduction command. M11 should provide similar artifact if audit produces quantitative data.  _(architect)_
- M8's 'pre-filter then audit' pattern (hash-bound, single-pass-free) mirrors existing gate-wiring validation (Validation #7 checks file-list unchanged) — audit-after-filter is established; but M11 should explicitly name which pre-filter criteria it assumes vs. re-tests.  _(architect)_
- M6 'fail-open/fail-closed precedence' pattern (PRD line 42–45, corpus.js): blind-state exit(2) is hard terminal, degraded-state exit(1) is soft warning. M11 should declare its failure mode if corpus is incomplete.  _(architect)_
- evident-audit.js standalone tool pattern (corpus.js line 11–12): read-only observation outside gate path, no environ-config, output to stdout/file. If M11 includes a tool, follow this pattern to avoid coupling to gate execution.  _(architect)_
- review-verdict.js:resolveEffectiveVerdict (lines 205-239) — single source of truth for approval verdict reading; M11 must use this, not inline checks of review_verdict field  _(security)_
- review-verdict.js:isReviewProofStructurallyValid (lines 105-186) — canonical proof structure validator; M11 must call this on each candidate approval before audit, not assume shell-parsed records are valid  _(security)_
- evidence-audit.js:receiptIntegrityOk (lines 185-197) — hash recomputation + schema validation pattern; M11 must apply identical pattern before accepting reviewed_plan_hash as audit anchor  _(security)_
- evidence-audit.js:audit() state ladder (lines 276-288) — precedence-ordered state machine (hard-read-error > blind > inconsistent > incomplete > degraded > ok); M11 should mirror this pattern to prevent silent audit failures  _(security)_
- review-verdict.js:isRepoRelativeEvidencePath (lines 80-95) — canonical evidence path traversal check; M11 must call this on dispatch_evidence paths from proof before filesystem operations  _(security)_
- evidence-audit.js:verdictsAgree() + provenanceAgrees() (lines 173-218) — dual-axis corroboration validation; M11 should use identical pattern for verdicts AND provenance sources when comparing records  _(security)_
- corpus.js design (§62-66 M8 plan): read-only standalone tool, state precedence ladder (`ok | degraded | blind`), loud-warn on ambiguous data, ratio NOT stated as probability  _(test)_
- record.js failure modes (L23-50): every cell escaped (backslash first, then pipe), newlines normalized to space, no assumption of order — M11 parser must be equally paranoid  _(test)_
- M8 quorum-calibration.md structure: what-is-the-corpus boundary, explicit coverage accounting (35/48 lower bound), reason-string as sole source of ground truth (not schema defaults)  _(test)_
- M7 plan DN4: stateful L1 checks CREATE existence; audit must similarly validate that plan state matches what hash claims  _(test)_
- Evidence-audit.js pattern (M8 L62): `blind` exit 2 when corpus is empty, not 'approved 0', ensuring 'no data' ≠ 'disapproved'  _(test)_
- evidence-audit.js architecture: read → parse → correlation logic → state precedence ladder → JSON + human-readable output + exit codes  _(explorer)_
- corpus.js read-only LLM-free standalone model: filesystem walk → per-file parse → handle boundaries (pre_measurement) → structured output  _(explorer)_
- record.js Measurement block format as audit foundation: halt_stage / wall_clock_ms / verdict / proof fields are the invariant M11 depends on  _(explorer)_
- quorum.js reason parsing from record: REASON_M_RE / REASON_K_RE / REASON_F_RE patterns (plugins/mccp/scripts/lib/plan-review/corpus.js:114-116) extract structured judgment from markdown prose  _(explorer)_
- evidence-audit.js coverage reporting: pre-measurement vs measurable distinction for lower-bound honesty (corpus.js mirrors this)  _(explorer)_
- review-verdict.js single-helper pattern: no ad-hoc verdict resolution outside the canonical path (M11 must query approval truth via resolveEffectiveVerdict, not recompute)  _(explorer)_
- Backward compatibility pattern from corpus.js: handle records without Measurement block (pre_measurement_records) rather than reject them  _(explorer)_

## Design Notes

**DN1 — 미탐(miss)의 기계적 정의를 먼저 세운다.** fan-out 4관점이 독립적으로 같은 공백을
지목했다(`test/CRITICAL` + `architect/HIGH` 2건 + `security/MEDIUM`): "옳은 승인"에 조작적
정의가 없으면 도구가 무엇을 세는지 알 수 없다. 정의는 **세 관문의 논리곱**이다.

| 관문 | 조건 | 실패 시 분류 |
|---|---|---|
| G1 앵커 | 결함이 **리뷰된 본문**(=`reviewed_plan_hash`로 해시되는 본문)에 실재한다 | `post_approval` — 승인 이후에 생긴 것은 미탐이 아니다 |
| G2 사거리 | 결함이 그 실행에서 **실제로 발화한 관점**의 렌즈 안에 있다 | `out_of_lens` — 아무도 보지 않기로 한 축은 놓친 것이 아니다 |
| G3 독립 기록 | 결함이 승인 시각 **이후에** 패널 아닌 생산자가 남긴 git-tracked 산출물에 적혀 있다 | 증거 아님 — 감사자의 의견은 증거가 아니다 |

**G3의 "승인 시각"은 `measurement.recorded_at` 단 하나다** — 레코드 자신이 실은 ISO 문자열이며,
`wall_clock_ms`(소요 시간)도 git 커밋 시각도 plan 파일의 mtime도 아니다. 셋 중 무엇을 쓰느냐에
따라 같은 증거가 `miss`와 `post_approval`로 갈리므로 필드를 하나로 못 박는다. `recorded_at`이
없거나 `Date.parse`가 실패하면 **추정하지 않는다** — 그 레코드의 시간축은 `unauditable`이고,
그 레코드에서는 어떤 증거도 `miss`로 승격되지 않는다. 증거 쪽 시각은 채널마다 다르다: 보고서·
downstream 레코드는 그 파일의 **첫 커밋 시각**(`git log --diff-filter=A --format=%aI -- <path>`),
backlog 행은 그 행의 **`Date` 열**. 어느 쪽도 얻지 못하면 그 후보는 `undated`이며 `miss`가
아니라 별도 분류로 떨어진다.

G3이 이 정의의 무게중심이다. 감사자가 지금 plan을 읽어 "여기 결함이 있다"고 적으면 그것은
같은 모델이 같은 본문을 다시 읽은 것이고, PRD가 Risks에서 High로 지목한
**작성자=리뷰어 blind spot**을 감사 층에서 재현하는 것이다. 그래서 증거는 반드시 **다른
생산자·다른 시점**의 기록이어야 한다.

**DN2 — 도구는 결속하고 판정하지 않는다.** G2와 G3의 실질(“이 서술이 정말 결함인가”)은 산문을
읽어야 판정된다. M8이 세운 분업을 그대로 쓴다 — **도구는 세고 결속하며, 판정은 문서가 한다**.
따라서 `approval-audit.js`의 출력은 verdict가 아니라 **레코드별 dossier**다: 앵커 검증 결과 ·
채널별 존재 여부 · 조인된 증거 행의 축자 인용과 그 출처. 도구에 "false-approve" 판정 분기를
넣으면 그 분기의 임계가 곧 날조된 임계다(UI9).

**DN3 — 구조적 공집합을 관측으로 읽지 않는다.** cross-model 채널은 5건 전부 비어 있고, 그 이유는
그 결정에 대해 Codex가 결함을 못 찾아서가 아니라 **애초에 발화하지 않았기 때문**이다 —
receipt 자신이 `meta.codex_disabled=true` · `resolution.codex_verdict='skipped'` ·
`findings=[]`로 그렇게 적고 있다. 도구는 그 채널을 `structurally_empty`로 **명시 보고**하고
어떤 카운터에도 0으로 기여시키지 않는다. M8 헤더가 세운 규칙의 직접 적용이다 — *어떤 축이
0이면 그 0이 코퍼스에서 온 것인지 상류 불변식에서 온 것인지 먼저 답한다*(`corpus.js:76-91`).
판정 근거는 **레코드에 실린 값**이며 현재 환경 변수가 아니다: 착수 시점 `codex-policy seal`은
`codex_disabled=false`를 보고했고 `MCCP_CODEX_DISABLED`는 프로젝트·사용자 settings 어디에도
없다. 과거 실행의 정책을 현재 env로 추론하는 순간 감사가 재현 불가가 된다.

**DN4 — 지금 다시 리뷰해서 정답지를 만들지 않는다.** "Codex를 켜서 5건을 다시 보게 하고
차이를 미탐으로 센다"가 가장 먼저 떠오르는 설계지만, 그것은 **정답지가 아니라 새 의견**이다.
지금의 리뷰어는 그때의 리뷰어가 아니고(모델·프롬프트·저장소 상태가 전부 다르다), 그가 새로
지목한 것은 "패널이 놓쳤다"가 아니라 "다른 시점의 다른 독자가 다르게 읽었다"를 뜻한다.
DN1 G3이 증거를 *`recorded_at` 이후 다른 생산자의 기록*으로 한정하는 이유가 이것이다 —
미탐의 근거는 **누군가 실제로 그 결함에 걸려 넘어져 적어 둔 사실**이지, 사후에 재구성한
의견이 아니다. 덧붙여 그 5건은 Codex가 꺼진 채 생산됐으므로 켠 채 얻은 판정은 같은 실험의
대조군도 아니다. UI10이 요구하는 것은 hybrid opt-in의 존속이지 감사 목적의 재활성화가 아니다.

**DN5 — 패널 재실행도 같은 이유로 하지 않는다.** fan-out `architect/HIGH`가 지적한 대로
재실행은 동어반복에 가깝다 — 같은 본문에서 다시 승인이 나면 그것은 "패널이 옳다"가 아니라
"패널이 재현적이다"이고, 다르게 나오면 승인 품질이 아니라 분산을 잰 것이다. 어느 쪽도 #11이
묻는 질문에 답하지 않는다. 게다가 재실행은 O3(레코드 덮어쓰기)로 **원본 레코드를 파괴**한다 —
감사 대상을 감사하다가 없애는 형태다.

**DN6 — 앵커는 기록된 경로의 해시 체제로 재계산한다.** `planAwareMarkdownHash`는 경로로 함수를
고르고(`hash.js:174`), `isPlanPath`는 `.claude/plans/*.plan.md`에만 참이다(`hash.js:169`).
승인 레코드 5건 중 3건의 plan은 이후 `.claude/PRPs/plans/archived/`로 이동했으므로, **현재
경로**로 해시하면 셋 다 불일치하고 감사는 "본문이 바뀌었다"는 거짓 결론에 도달한다(실측 —
Preconditions 참조). 도구는 레코드의 `measurement.plan_path`가 지정한 체제를 적용한다. 이
결함은 서술이 아니라 **회귀 test 픽스처**로 고정한다(Task 2 항목 4).

**DN7 — 복구 불가는 결함 부재가 아니다.** `impeccable-detection-contract-m6`의 리뷰된 본문은
디스크·ship receipt·git 리비전 어디에도 없다. 그 레코드에 대해 G1을 판정할 방법이 없으므로
분류는 `unauditable`이고, 감사 커버리지는 **4/5**로 보고된다. 이것을 5/5의 분모에 넣고
"미탐 0건"을 세면 없는 근거가 생긴다 — DN3과 같은 종류의 오류이며, 방향만 반대다.

**DN8 — 비율을 보고하지 않는다.** 표본은 5(감사 가능한 것은 4)이고, O3 생존 편향의 방향이
여전히 불분명하며, 코퍼스 커버리지는 하한이다(`pre_measurement` 13건). M8의 DN8을 그대로
계승한다 — **관측 빈도로 적고 확률로 부르지 않는다**(UI6·UI7). "false-approve 비율"이라는
지표 이름은 PRD Open Questions의 표현이지 이 milestone이 산출할 수 있는 양이 아니며, 그
사실 자체가 산출물의 일부다.

**DN9 — `review_proof` 구조 검증은 이 코퍼스에서 수행 불가하다.** fan-out `security/HIGH`가
"승인마다 `isReviewProofStructurallyValid`를 호출하라"고 요구했으나, 실측하면 그 객체는
plan-gate receipt에만 실리고 `.claude/receipts/mccp-plan-codex/`는 **디렉토리째 부재**하며
(worktree-only), 리뷰 레코드에는 `review_proof`/`dispatch_evidence` 문자열이 **0회** 등장한다.
따라서 그 호출은 인자를 구성할 수 없다. 이 축에서 실제로 남아 있는 앵커는 셋이다 —
레코드의 `reviewed_plan_hash` · 레코드의 `quorum` 블록 · ship receipt의 `plan_hash`. 도구는
그 셋만 검증하고, 검증할 수 없는 것은 검증했다고 적지 않는다. (지적 자체는 유효한 형태이므로
증거와 함께 backlog로 이연한다 — §3.14.)

**DN10 — 해시 사슬은 별도 축이며 미탐과 혼동하지 않는다.** 실측에서
`impeccable-detection-contract-m6`은 리뷰 해시와 ship 해시가 **다르다**. 즉 패널이 승인한
본문과 실제로 ship된 본문이 같지 않다. 이것은 미탐이 아니라 **다른 종류의 결함**이며
(승인의 대상이 승인 후 바뀌었다), 같은 칸에 섞으면 두 사실이 한 숫자가 된다. 도구는
`hash_chain` 축을 분리해 `reviewed → ship → current` 3점을 보고한다.

**DN11 — 기본값을 바꾸지 않는다.** M8이 확정한 대로 실제 승인 규칙은 severity 게이트이고, 이
milestone은 그 게이트를 손대지 않는다. 감사 결과가 미탐을 지목하더라도 그 처방은 임계 조정이
아니라 후속 milestone의 입력이다 — 관측 milestone은 관측만 한다(UI11).

**DN13 — 레코드의 `plan_path`는 신뢰되지 않은 입력이고, 파일시스템에 닿기 전에 검증한다.**
`measurement.plan_path`는 마크다운 본문에서 파싱한 문자열이고, 앵커 재계산은 그것을
`path.resolve` → `fs.readFileSync`로 넘긴다(`hash.js:86-91`). 형제 축인 `review_proof`의
`dispatch_evidence[]`는 이미 `isRepoRelativeEvidencePath`로 검증되는데(`review-verdict.js:80-95`,
`review-verdict.js:173-177`) 이쪽만 무검증인 것은 **비대칭**이며, 그 비대칭에 기댈 근거가 없다.
도구는 같은 validator를 재사용한다(재구현하지 않는다 — 두 개가 갈라지는 순간 어느 쪽이 계약인지
알 수 없게 된다). 실측으로 확인한 동작: `.claude/plans/x.plan.md`와
`.claude/PRPs/plans/archived/x.plan.md`는 통과하고, `../../../etc/passwd` · `/abs/x.md` ·
드라이브 문자 · 역슬래시 · `./` · NUL은 전부 거부된다. 즉 **정상 코퍼스를 하나도 잃지 않으면서**
탈출 입력만 막는다. 거부된 레코드는 앵커가 `unauditable`(사유 `plan_path_rejected`)이 되고
**파일시스템에 닿지 않는다** — 읽고 나서 판정하는 순서면 검증이 아무것도 막지 못한다.

**DN14 — 사라진 receipt를 대신할 corroboration을 명시 축으로 만든다.** 승인의 `review_proof`는
plan-gate receipt에만 있었고 그 디렉토리는 부재다(DN9). 그러면 `.claude/reviews/`의 레코드가
정말 그 게이트 실행이 쓴 것인지 무엇이 보증하는가 — 레코드 자신은 보증하지 못한다. 남아 있는
독립 증인은 **git-tracked ship receipt**다: 그 `plan_hash`가 레코드의 `reviewed_plan_hash`와
일치하면, 서로 다른 시점에 서로 다른 writer가 같은 본문을 봉인했다는 뜻이라 레코드가 사후에
손으로 쓰였을 가능성이 크게 줄어든다. 도구는 이것을 `proof_backing` 축으로 레코드마다 보고한다
(`corroborated` / `uncorroborated` / `no_ship_receipt`). **이것은 전사(transcription) 전체의
무결성 증명이 아니다** — 해시 한 값의 교차 확인일 뿐이고, 나머지 필드(quorum·findings 표)는
여전히 무증인이다. 그렇게 적는다.

**DN15 — `uncorroborated`는 `degraded`다.** DN14의 축이 있어도 상태 사다리가 그것을 무시하면
도구는 검증 불가한 증거 위에서 `ok`를 보고한다. 그래서 `proof_backing`이 `corroborated`가
아닌 레코드가 1건 이상이면 `state='degraded'`(exit 1)다. 이 규칙이 `pre_measurement`처럼
**상시 켜진 신호**가 되지 않는 이유는 실측이다 — 승인 5건 전부 ship receipt를 갖고 그중 4건이
해시 일치이므로, 이 신호는 상수가 아니라 실제로 변별한다. 반대로 `unauditable`(본문 복구 불가)은
`degraded`로 만들지 **않는다**: 그것은 고장이 아니라 코퍼스의 경계이고, 넣으면 항상 켜진다
(`corpus.js:44-52`가 `pre_measurement`에 대해 내린 것과 같은 판단).

**DN12 — 도구를 `cli.js` 하위 subcommand로 만들지 않는다.** `plan-review/cli.js`는 게이트
dispatch 본체이고 UI5가 #5 이전 배선 추가를 금한다. `evidence-audit.js`·`corpus.js` 선례대로
standalone 파일로 둔다. 발견 가능성은 CLAUDE.md §4 cheat sheet가 아니라 이번 산출 문서와
보고서가 맡는다 — §4 편집도 표면 확대 축이므로 이번에는 하지 않는다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/approval-audit.js` | CREATE | 승인 레코드 dossier 결속 순수 오라클 + standalone CLI (read-only · LLM-free) |
| `plugins/mccp/scripts/lib/tests/plan-review-approval-audit.test.js` | CREATE | 앵커 재계산·채널 분류·blind/degraded 규칙 회귀 test |
| `docs/diverse-agent-review/approval-quality-audit.md` | CREATE | 동결된 dossier + 판정 본문 (PRD가 인용할 앵커) |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | #11 complete · Evidence M11 문단 · Open Questions 갱신 · 표 하단 note |
| `.claude/PRPs/reports/diverse-agent-review-m11-report.md` | CREATE | milestone 보고서 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | fan-out·패널의 미흡수 finding을 증거와 함께 이연 (§3.14) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 신규 heading + `currently` 노트 동기 |

## Tasks

### Task 1: 승인 dossier 결속 오라클 + standalone CLI

- **Action**: `plugins/mccp/scripts/lib/plan-review/approval-audit.js`를 만든다. 두 층으로
  나눈다 — (a) 인자 주입 순수 함수들, (b) 얇은 `main()`.

  **입력 계약 — `audit().pass_path.entries` 하나이며 `corpus.js`는 무변경이다.**
  `corpus.js`의 export는 실측 9개(`parseRecord` · `aggregate` · `audit` · `splitRow` ·
  `classifyBinding` · `classifyF6` · `DEFAULT_K_SPLIT_REF` · `STATE_EXIT_CODES` ·
  `exitCodeForState`)이고, 레코드 열거 함수 `readReviewRecords`는 **export되지 않는다**.
  `audit()`는 레코드 목록이 아니라 집계 객체를 반환한다(`corpus.js:728-741`가 `aggregate()`의
  반환을 그대로 내보낸다). 따라서 "`audit()`로 목록을 얻어 `parseRecord()`를 돌린다"는 절차는
  **성립하지 않는다** — 이 문단의 초판이 그렇게 적었고 R0 패널이 지적해 정정한다.

  그러나 새 export도 필요 없다. `audit()`의 반환에는 `pass_path.entries`가 이미 실려 있고,
  실측한 항목 키는 `record`(레코드 경로) · `plan_path` · `wall_clock_ms` · `hash_bound` ·
  `single_pass_trace` · `quorum` · `recorded_at` · `reason`이며 현재 코퍼스에서 길이 5다.
  이것이 곧 **승인 레코드 목록**이고 M11이 앵커로 쓰는 두 경로(`record`·`plan_path`)와 G3의
  시각(`recorded_at`)을 전부 포함한다. 그러므로 절차는 `require('corpus.js').audit()` 한 번,
  `pass_path.entries` 순회다. 승인 판정을 재계산하지 않는다 — `verdict==='converged'` 판정은
  이미 `aggregate()` 안에서 내려졌고, 감사자가 그것을 다시 계산하면 두 판정이 갈라진다.
  레코드 본문의 추가 파싱이 필요하면 export된 `parseRecord()`를 쓴다.

  **`corpus.js`는 한 줄도 바꾸지 않는다** — 이 정정으로 `Files to Change`에서 조건부 변경이
  사라졌고, Validation 4번(출력 diff 0)은 그 사실을 사후 확인하는 회귀 가드로 남는다.

  **코퍼스는 live다** — 도구는 M8이 동결한 5건을 상수로 갖지 않고 매 실행 재스캔하며,
  `corpus.js`가 이번에 `records=37`(M8 동결 시점 35)을 보고한 사실이 그 필요를 실증한다.
  상수로 박으면 다음 승인이 감사에서 조용히 빠진다.

  레코드마다 산출할 축:
  1. `anchor` — **먼저** `measurement.plan_path`를 `review-verdict.js#isRepoRelativeEvidencePath`로
     검증한다(DN13). 거부되면 `unauditable` + 사유 `plan_path_rejected`이고 **파일시스템에
     닿지 않는다**. 통과하면 그 경로의 해시 체제(`isPlanPath`)로 리뷰된 본문을 재계산해
     `on_disk` / `from_git` / `unrecoverable` 판정. git 탐색은 그 경로의 `git rev-list`
     리비전을 순회하며 같은 체제로 해시한다. 판정 근거(적용한 체제·검사한 리비전 수)를 함께 낸다.
  2. `hash_chain` — `reviewed` / `ship`(`.claude/receipts/mccp-pr-codex/<slug>.json`의
     `plan_hash`) / `current` 3점과 `edited_after_approval` 불리언 (DN10).
  2b. `proof_backing` — `corroborated`(ship `plan_hash` == 레코드 `reviewed_plan_hash`) /
     `uncorroborated`(둘 다 있는데 불일치) / `no_ship_receipt` / `receipt_corrupt`. 사라진
     plan-gate receipt를 대신하는 유일한 독립 증인이다 (DN14). **증인을 믿기 전에 증인이
     온전한지 먼저 본다** — `evidence-audit.js:185-197`의 `receiptIntegrityOk`(receipt_hash
     재계산 + schema 검증)를 재사용해 통과하지 못한 receipt는 `receipt_corrupt`이며 그
     `plan_hash`를 corroboration에 쓰지 않는다. 검증 없이 읽으면 위조·손상된 receipt가
     사라진 proof를 대신하는 증인 노릇을 하게 되고, 그것은 증인이 없는 것보다 나쁘다.
  2c. `approved_at` — `measurement.recorded_at`의 시각. **`Date.parse` 단독을 쓰지 않는다** —
     실측하면 `'Mon Aug 26 2026'`·`'2026-8-16'` 같은 비-ISO 문자열도 유효한 수를 돌려주므로,
     관대한 파서는 형식이 어긋난 시각을 조용히 받아들이고 G3의 순서 비교가 엉뚱한 값 위에서
     성립한다. 먼저 `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$`로
     **형식을 확인한 뒤** 파싱한다(`record.js`가 `toISOString()`으로 쓰므로 정상 레코드는 전부
     통과한다). 형식 불일치·부재·파싱 실패면 `null`이며 그 레코드의 시간축은 `unauditable`이다
     (G3, 추정 금지).
  3. `lenses` — `## Refutation attempted` 표에서 그 실행에 실제로 발화한 관점 목록 (G2의 모수).
  4. `channels` — 채널마다 `present` / `absent` / `structurally_empty` 중 하나와 사유.
     **슬라이싱 규칙은 heading 단위 리터럴 매칭**이다: 보고서는 `^## Deviations from Plan` ·
     `^## Issues Encountered` · `^## Code-review` · `^## 미충족` 로 시작하는 절을 다음
     `^## ` 까지 잘라낸다(선례: `plan.md` Phase 4.5의 `## References` 추출 정규식과 같은 형태).
     절이 하나도 안 잡히면 `present`가 아니라 **`absent`**다 — 파일이 있는데 아무것도 못 읽은
     것을 "증거 없음"으로 세면 파서 고장이 관측으로 둔갑한다. backlog는 4열 표의 행 단위로
     읽고 1열(`Date`)을 시각으로, 3열(`Source plan`)을 귀속 판정에 쓴다. 3열은 자유 텍스트라
     정확 매칭이 원리상 불가능하므로 **느슨 매칭 + 매칭한 부분 문자열을 근거로 동봉**하고,
     그 부정확성을 산출 문서가 그대로 적는다(별도 backlog 항목으로 이연된 축).
     채널 집합: `report`(`.claude/PRPs/reports/<slug>-report.md`) ·
     `backlog`(`.claude/plans/codex-findings-backlog.md`의 그 plan을 지목하는 행) ·
     `downstream_reviews`(`.claude/reviews/`에서 패널 레코드가 아니면서 슬러그가 걸리는 문서) ·
     `pr_codex`(ship receipt의 `findings`). `pr_codex`는 `meta.codex_disabled`가 참이거나
     `resolution.codex_verdict`가 `skipped`이면 **반드시** `structurally_empty`다 (DN3).
  5. `candidates` — 채널에서 추출한 증거 행을 **축자**로, 출처(파일·섹션 제목)와 함께.
     보고서 채널은 `## Deviations from Plan` · `## Issues Encountered` ·
     `## Code-review 흡수` · `## 미충족` 계열 섹션을 슬라이스한다. **판정 라벨은 붙이지
     않는다** (DN2).

  `state` 사다리는 `evidence-audit.js`를 미러한다 — `blind`(승인 레코드 0건, exit 2,
  어떤 카운터도 보고하지 않음) · `degraded`(파싱 실패 ≥1 **또는** `proof_backing`이
  `corroborated`가 아닌 레코드 ≥1, exit 1) · `ok`(exit 0). `unauditable` 레코드는 `degraded`로
  만들지 **않는다** — 그것은 고장이 아니라 코퍼스의 경계이며, 상시 켜진 신호는 정보를
  나르지 않는다(`corpus.js:44-52`의 `pre_measurement` 판단과 같은 이유). 두 규칙이 갈리는
  근거는 DN15에 있다.

  `coverage` 객체는 **정확히 세 키**를 갖고 `approved === auditable + unauditable`이
  항등식으로 성립한다 — `approved`(승인 레코드 총수) · `auditable`(앵커가 복구됐고 시간축이
  있는 것) · `unauditable`(본문 복구 불가, `plan_path` 거부, 또는 `recorded_at` 부재). 세
  키를 한 번에 못 박는 이유는 Validation과 Acceptance가 이 이름들을 그대로 인용하기
  때문이다 — 이름이 어긋나면 검증 줄이 `undefined`를 읽고 조용히 통과한다.
  임계값·목표치·비율은 넣지 않는다(DN8·UI9).
- **Mirror**: `plugins/mccp/scripts/lib/evidence-audit.js:1-40`의 도구 형태와 state 사다리 ·
  `plugins/mccp/scripts/lib/plan-review/quorum.js:134-210`의 인자 주입 순수 오라클 ·
  `plugins/mccp/scripts/receipt/hash.js:169-175`의 경로→해시 체제 선택.
- **Validate**: `node plugins/mccp/scripts/lib/plan-review/approval-audit.js --json > /dev/null && echo OK`

### Task 2: 회귀 test

- **Action**: `plugins/mccp/scripts/lib/tests/plan-review-approval-audit.test.js`. 최소 커버:
  1. **blind 규칙** — 승인 레코드 0건 입력에서 `state`가 `blind`이고 어떤 카운터·비율 키도 부재
  2. **구조적 공집합** — `meta.codex_disabled=true`인 ship receipt 픽스처에서 `pr_codex`
     채널이 `structurally_empty`로 떨어지고 "미탐 0건"에 기여하지 않음
  3. **`structurally_empty` ≠ `absent`** — ship receipt가 아예 없는 픽스처는 `absent`,
     있고 Codex가 꺼진 픽스처는 `structurally_empty`로 **서로 다르게** 분류됨
  4. **DN6 해시 체제** — 기록된 `plan_path`가 `.claude/plans/...`인데 파일이
     `.claude/PRPs/plans/archived/...`에 있는 픽스처에서 앵커가 복구됨. 현재 경로 체제로
     해시하는 구현은 이 test에서 실패해야 한다 (수정 전 실패를 먼저 실측한다 — 아래 참조)
  5. **`unauditable` 격리** — 어떤 리비전과도 일치하지 않는 픽스처가 `unauditable`로 분류되고
     `state`는 `ok`를 유지하며 `coverage.auditable`이 줄어듦
  6. **degraded** — 깨진 Measurement JSON이 조용히 0으로 세어지지 않고 `degraded`로 떨어짐
  7. **`## Refutation attempted` 파싱** — 3번째 셀에 파이프가 든 픽스처에서도 관점 열이
     어긋나지 않음 (`record.js:158-176`이 escape하는 형식의 역함수)
  8. **판정 부재** — 출력 어디에도 `false_approve` 류의 판정 필드가 없음 (DN2를 test로 고정)
  9. **경로 탈출 거부** — `measurement.plan_path`가 `../../../etc/passwd` · `/abs/x.md` ·
     드라이브 문자 · 역슬래시 · `./x.md` · NUL인 픽스처가 각각 `unauditable` +
     `plan_path_rejected`로 떨어지고, 그 경로로 **읽기가 시도되지 않음**을 확인한다
     (fs 호출을 스텁해 호출 0회를 단언 — 사후 판정은 검증이 아니다). 대칭으로
     `.claude/plans/x.plan.md`와 `.claude/PRPs/plans/archived/x.plan.md`는 **통과**해야 한다:
     정상 코퍼스를 잃는 validator는 결함이다 (DN13)
  10. **`coverage` 항등식** — 출력의 `coverage`가 정확히 `approved`/`auditable`/`unauditable`
     세 키를 갖고 `approved === auditable + unauditable`이 성립함 (CRITICAL 흡수분 고정)
  11. **`proof_backing` → degraded** — ship `plan_hash`가 레코드 `reviewed_plan_hash`와
     어긋나는 픽스처가 `uncorroborated`로 분류되고 `state`가 `degraded`가 됨. 전건
     `corroborated`인 픽스처는 `ok`를 유지함 (상시 켜짐이 아님을 test가 고정, DN15)
  12. **`recorded_at` 부재** — 시각이 없거나 파싱 불가인 픽스처에서 `approved_at`이 `null`이고
     그 레코드가 `unauditable`로 계수되며, **어떤 후보도 `miss`로 승격되지 않음** (G3)
  각 단언은 **구현 전에 실패하는 것을 먼저 관측하고 기록**한다 — PRD가 M4에서 세운 규칙
  ("수정 전 실패를 실측한 것만 회귀로 인정")을 그대로 적용한다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js:1-40`의 러너·명명·픽스처 구성.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-approval-audit.test.js`

### Task 3: dossier 동결 + 판정 문서

- **Action**: `docs/diverse-agent-review/approval-quality-audit.md`를 만든다. Task 1 도구의
  `--json` 출력을 **축자 인용**하고(재현 명령 포함), 그 위에 판정을 적는다:
  (a) **감사 커버리지** — 5건 중 감사 가능한 것과 그렇지 않은 것, 그 사유 (DN7)
  (b) **채널 지도** — 채널별로 무엇이 있었고 무엇이 구조적으로 비어 있었는지 (DN3)
  (c) **레코드별 판정** — 각 `candidates` 행을 G1·G2·G3 세 관문에 대고 `miss` /
      `post_approval` / `out_of_lens` / `not_evidence` 중 하나로 분류하고 **근거를 인용**한다
  (d) **해시 사슬** — 승인 본문과 ship 본문이 어긋난 사례와 그것이 미탐과 다른 축임 (DN10)
  (e) **답하지 않은 것** — 비율을 산출하지 않는 이유(DN8) · `review_proof` 검증 불가(DN9) ·
      Codex 재활성화와 패널 재실행을 하지 않은 이유(DN4·DN5)
  M8 문서와의 관계도 적는다: `corpus.js`의 `records`가 35에서 37로 늘었으므로 M8 문서는
  스냅샷이며 이 문서가 그것을 대체하지 않는다.
- **Mirror**: `docs/diverse-agent-review/quorum-calibration.md`의 축자 동결 + 재현 명령 형식.
- **Validate**: `grep -c '^## ' docs/diverse-agent-review/approval-quality-audit.md`

### Task 4: PRD 갱신

- **Action**: `.claude/prds/diverse-agent-review.prd.md`를 갱신한다.
  1. Delivery Milestones의 `#11` 행 Status를 `pending`에서 `complete`로, Plan 셀에 이 plan 경로.
     Outcome을 #6·#7·#8과 같은 형태로 **관측 결과**로 재서술한다.
  2. Evidence에 `M11 실측` 문단 추가 — 커버리지 4/5 · 채널 지도 · 레코드별 판정 요약 ·
     해시 사슬 관측.
  3. Success Metrics: 이번에 뒤집히는 칸이 있으면 그 칸 안에 근거를 적고, 없으면 **손대지
     않는다**(UI7). `converged` 봉인 무결성 행은 이 milestone의 해시 사슬 관측과 인접하지만
     같은 지표가 아니므로 승격하지 않는다.
  4. Open Questions: "패널 승인의 실제 품질" 항목을 갱신한다 — 답해진 만큼만 적고, 남은
     것(false-block 대칭축)은 그대로 둔다.
  5. 표 하단 note에 **#11이 확정한 것** 문단 추가. 이관이 발생하면 그 사유의 종류를 앞선
     넷(선행조건 밖 · 전달 경로 밖 · 집계 범위)과 대조해 적는다.
  6. 말미 Status 줄 갱신.
- **Mirror**: 같은 파일에서 #8이 #11을 연 이관 문단(판정을 바꾸지 않고 사유를 갱신하는 형식).
- **Validate**: `grep -n '^| 11 ' .claude/prds/diverse-agent-review.prd.md`

### Task 5: 미흡수 finding 이연

- **Action**: `.claude/plans/codex-findings-backlog.md`에 §3.14대로 이연 행을 append한다.
  최소 포함: (a) fan-out `security/HIGH`의 `isReviewProofStructurallyValid` 요구 —
  **증거와 함께 기각**한다(plan-gate receipt 디렉토리 부재 + 레코드에 `review_proof` 0회,
  DN9). (b) 승인 레코드의 `reviewed_plan_hash` 산출 자체를 검증하는 round-trip test 부재
  (fan-out `test/MEDIUM`). (c) 패널·Codex 라운드에서 나온 MEDIUM 이하 전건. 표는 **4열
  고정**이다 — `derive/sources/backlog.js`가 헤더를 리터럴로 고정하므로 5번째 열은 기존 행
  전부를 파서에서 사라지게 한다.
- **Mirror**: `.claude/plans/codex-findings-backlog.md`의 기존 `| Date | Severity | Source plan | Finding |` 행 형식.
- **Validate**: `head -8 .claude/plans/codex-findings-backlog.md | grep -c '^| Date'`

### Task 6: milestone 보고서

- **Action**: `.claude/PRPs/reports/diverse-agent-review-m11-report.md`. M8 보고서의 절
  구성을 따르되 반드시 포함: 도구 출력 전문 · 판정 · Acceptance 대조(충족·미충족을 문구
  조정 없이) · **부수 관측** — (i) 아카이브 이동이 `hash-plan`의 체제를 바꿔 승인 앵커를
  거짓 불일치로 만드는 함정(DN6 실측), (ii) `.claude/receipts/mccp-plan-codex/` 부재로
  승인 proof가 사후 검증 불가라는 사실과 그것이 §3.12 내구성 계약에 대해 말하는 것.
- **Mirror**: `.claude/PRPs/reports/diverse-agent-review-m8-report.md`.
- **Validate**: `grep -c '^## ' .claude/PRPs/reports/diverse-agent-review-m11-report.md`

### Task 7: version bump 4면 동기

- **Action**: §3.7 forward-only로 target을 **재계산**한 뒤 4면을 맞춘다 —
  `plugins/mccp/.claude-plugin/plugin.json` · `plugins/mccp/scripts/lib/renderer/html.js`의
  page-foot · `plugins/mccp/scripts/lib/renderer/markdown.js`의 derived 줄 ·
  `CHANGELOG.md`의 신규 heading과 `currently` 노트. 착수 시점 실측: `origin/main`이
  `1.33.1`, 미머지 sibling이 `1.32.8`(env-contract-integrity) · `1.33.0`(msw-m8) ·
  `1.33.0`(review-loop-trust) → 잠정 target **`1.33.2`**. PRD 안의 단일 milestone이므로
  patch 축이다. **이 번호는 확정이 아니다** — `/mccp:pr` 진입 직전 sibling과 `origin/main`을
  다시 읽고 재계산한다(§3.7 실측 4회 재발).
- **Mirror**: `CHANGELOG.md`의 `1.33.1` 항목이 쓴 §3.7 상향 서술 형식.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 1. 도구가 실제 코퍼스에서 완주하고 JSON을 낸다
node plugins/mccp/scripts/lib/plan-review/approval-audit.js --json \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(!j.state)process.exit(1);const c=j.coverage;if(c.approved!==c.auditable+c.unauditable)process.exit(1);console.log("state="+j.state+" auditable="+c.auditable+"/"+c.approved+" unauditable="+c.unauditable)'

# 2. 회귀 test
node --test plugins/mccp/scripts/lib/tests/plan-review-approval-audit.test.js

# 3. 게이트 배선 무손상 (UI5 — plan-review suite 전체 green)
node --test plugins/mccp/scripts/lib/tests/plan-review-*.test.js

# 4. corpus.js 회귀 0 (export만 추가했다면 기존 출력이 불변이어야 한다)
node plugins/mccp/scripts/lib/plan-review/corpus.js --json > /tmp/corpus-after.json
git stash list >/dev/null; git show origin/main:plugins/mccp/scripts/lib/plan-review/corpus.js > /tmp/corpus-before.js 2>/dev/null \
  && node /tmp/corpus-before.js --json > /tmp/corpus-before.json 2>/dev/null \
  && diff /tmp/corpus-before.json /tmp/corpus-after.json && echo "corpus output unchanged"

# 5. version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 6. 이 plan 자신에 대한 L1
node plugins/mccp/scripts/lib/plan-review/cli.js l1 --plan .claude/plans/diverse-agent-review-m11.plan.md

# 7. §3.5.1 — 이 브랜치가 삭제하는 파일이 없어야 한다 (빈 출력이 통과)
git diff --diff-filter=D --name-only origin/main...HEAD

# 8. 게이트 배선 diff 공집합 (빈 출력이 통과)
git diff --stat origin/main...HEAD -- \
  plugins/mccp/scripts/lib/plan-review/cli.js \
  plugins/mccp/scripts/lib/plan-review/quorum.js \
  plugins/mccp/scripts/lib/plan-review/decide.js \
  plugins/mccp/scripts/lib/plan-review/l1-check.js \
  plugins/mccp/scripts/lib/plan-review/record.js \
  plugins/mccp/scripts/workflows/plan-review.js \
  plugins/mccp/commands/plan.md

# 9. ship receipt 무변경 (§3.12 no-rehash — 빈 출력이 통과)
git diff --stat origin/main...HEAD -- .claude/receipts/mccp-pr-codex/
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 감사자가 자기 판단을 증거로 써서 same-model self-audit를 감사 층에서 재현 | **High** | DN1 G3 — 증거는 `recorded_at` 이후 **다른 생산자**의 git-tracked 기록뿐. 도구가 `candidates`를 출처와 함께 축자 인용하므로 판정마다 대조 가능 |
| 구조적 공집합(`pr_codex`)의 0을 "미탐 없음"으로 오독 | **High (선례 2회)** | DN3 — 도구가 `structurally_empty`를 명시 보고하고 어떤 카운터에도 기여시키지 않음 · test 항목 2·3이 `absent`와 구분을 고정 |
| 아카이브 이동으로 앵커가 거짓 불일치 → "본문이 바뀌었다"는 오결론 | **High (실측 3/5)** | DN6 — 기록된 `plan_path`의 체제로 재계산 · test 항목 4가 수정 전 실패를 실측한 회귀로 고정 |
| 복구 불가 1건을 분모에 넣어 "미탐 0"을 과대 주장 | Medium | DN7 — `unauditable` 별도 분류 + `coverage`를 매 출력에 명시 · 문서 판정 (a)가 커버리지를 먼저 적음 |
| n=5 관측이 false-approve **비율**로 인용됨 | **High** | DN8 — 도구·문서·PRD 어디에도 비율을 적지 않음 · test 항목 8이 판정 필드 부재를 고정 |
| `corpus.js`에 export를 추가하다 집계 동작이 바뀜 | Medium | Validation 4번이 `origin/main` 버전과 출력 diff 0을 기계 확인 |
| 레코드의 `plan_path`가 신뢰되지 않은 입력인데 `path.resolve`+`readFileSync`로 흘러감 | Medium | DN13 — `isRepoRelativeEvidencePath`를 **읽기 전에** 적용 · test 항목 9가 fs 호출 0회를 단언 · 정상 코퍼스 2형태(`plans/`·`archived/`) 통과를 함께 고정 |
| plan-gate receipt 소멸로 승인 레코드의 전사 무결성을 증명할 수 없음 | **High (구조적)** | DN14 — ship receipt `plan_hash` 교차 확인을 `proof_backing` 명시 축으로 · DN15가 `uncorroborated`를 `degraded`로 올림 · **해시 한 값의 확인일 뿐 전사 전체의 증명이 아님을 문서가 그대로 적는다** |
| 미탐 판정이 문서 행위라 증거 체리피킹을 기계가 막지 못함 | Medium | 완화이지 해소가 아니다 — 도구가 `candidates` **전건**을 출처와 함께 내므로 누락이 사후 대조로 드러난다. 판정 자체의 기계화는 G2·G3의 실질이 산문이라 이 milestone 범위 밖이며 backlog로 이연 |
| 감사 결과가 게이트 완화 요구로 번짐 | Medium | DN11 — 관측 milestone은 관측만 한다 · 기본값 무변경을 Acceptance가 diff로 확인 · UI3 |
| 도구 추가가 배선 확대로 번짐(UI5 침식) | Low | standalone 파일 1개 + test 1개 · Validation 8번이 게이트 파일 미변경을 기계 확인 |
| version target이 병렬 브랜치에 밀림 | **High (실측 4회)** | Task 7이 target을 잠정으로 두고 `/mccp:pr` 직전 재계산을 의무화 |
| `plan-review-*.test.js` 선재 red가 이 milestone 탓으로 귀속됨 | Medium | Validation 3번 실행 전 `origin/main`에서 동일 suite baseline을 먼저 확보하고 보고서에 기록 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
      — 라이브 완주의 산출물은 `docs/diverse-agent-review/approval-quality-audit.md` 안에
      축자 인용된 `approval-audit.js --json` 출력이며, 그 출력의 `state`가 `blind`가 아니고
      `coverage.approved`가 5 이상이어야 한다. 손으로 옮겨 적은 숫자는 산출물이 아니다.
- [ ] 미탐 판정이 전부 G1·G2·G3 세 관문에 대고 이뤄졌고, 각 판정이 도구 출력의 `candidates`
      행을 출처와 함께 인용한다 — 어느 것도 감사자의 서술만으로 주장되지 않는다
- [ ] `pr_codex` 채널이 `structurally_empty`로 보고되고, 그 0이 어떤 미탐 카운터에도
      기여하지 않음을 test가 고정한다
- [ ] `unauditable` 레코드가 감사 커버리지에서 분리돼 보고되고 "결함 없음"으로 세어지지 않는다
- [ ] `coverage`가 `approved`/`auditable`/`unauditable` 세 키를 갖고 `approved === auditable + unauditable`이
      실제 출력에서 성립한다 (Validation 1번이 기계 확인)
- [ ] `proof_backing`이 레코드마다 보고되고, `corroborated`가 아닌 것이 있으면 `state`가 `degraded`다
- [ ] 레코드의 `plan_path`가 파일시스템에 닿기 전에 검증되며, 탈출 입력에서 읽기 호출이 0회임을 test가 단언한다
- [ ] false-approve **비율**이 도구·문서·PRD 어디에도 적히지 않음
- [ ] **문서가 PRD의 질문에 실제로 답한다** — 감사 가능한 레코드마다 `miss` / `no_miss_found` /
      `unauditable` 중 하나의 판정이 적혀 있고, 전건 `no_miss_found`인 경우에는 그것이
      "**보았고 없었다**"인지 "**볼 수 있는 채널이 비어 있었다**"인지를 채널 지도로 구분해
      명시한다. 후자를 "미탐 없음"으로 적으면 이 milestone은 자기 DN3을 milestone 층위에서
      위반하는 것이며, 그 문장이 없으면 Acceptance는 계기가 돌았다는 것만 확인하고 질문에는
      답하지 않은 채 통과한다
- [ ] `state`가 `ok`이거나, `degraded`라면 **무엇이 degrade시켰는지를 문서가 지목하고 판정**한다
      (`uncorroborated`·`receipt_corrupt`·파싱 실패는 그 자체가 감사 결과이지 배경 소음이 아니다).
      `state != blind`만으로는 통과가 아니다
- [ ] 미탐이 발견됐을 때의 **처방은 이 milestone의 범위가 아님**을 문서가 명시한다 — #11은 관측이고
      게이트 조정·재리뷰·임계 변경은 후속 축이다(DN11·UI11). 범위를 적지 않으면 "보고만 하고 끝"이
      누락으로 읽힌다
- [ ] 게이트 배선 diff 공집합 (Validation 8번이 빈 출력)
- [ ] ship receipt diff 공집합 (Validation 9번이 빈 출력, §3.12)
- [ ] 삭제 파일 0건 (Validation 7번이 빈 출력, §3.5.1)
- [ ] 기본 quorum 값과 severity 게이트를 **바꾸지 않았음**을 diff로 확인
- [ ] version 4면 동기 + `i18n-surface.test.js` green

## Design Critique

- detector: `skill_available=true` · `design_signal=true` · `reason=ok` ·
  invocation `impeccable` (오라클이 지목한 call form)
- SKILL first-step Read 완료 — `plugins/mccp/skills/frontend-design-direction/SKILL.md`
  `## Output Constraints` 4개 앵커
- rounds: 1 (R0) · cap: 2 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` default) · verdict: **CONVERGED**
  (`decideCritique({findings: [], round: 0, cap: 2})` 실행 결과)

**트리거 근거의 정직한 기록 — M8과 동일한 관측이 재현됐다.** detector가 반환한 `signal_files`는
3개이고 그중 하나는 `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` —
Validation 블록 안의 **셸 명령 문자열**이지 이 계획이 변경하는 파일이 아니다. 나머지
둘(`renderer/html.js`, `renderer/markdown.js`)은 이 계획에서 **버전 문자열 리터럴 1개씩**만
바뀐다. 즉 트리거는 경로 부분 문자열 매칭으로 켜졌고 실질 디자인 표면 변경은 없다. M8이 같은
관측을 backlog로 이연했고 아직 열려 있으므로, 이번에는 **새 행을 append하지 않고** 재현
사실만 여기 기록한다(같은 결함을 두 줄로 세면 backlog가 빈도를 과대 진술한다). 트리거를 끄려고
계획 문장을 손대지 않는다 — 그것이 UI3와 같은 축의 회피다.

**4개 앵커 판정** (대상: 이 계획 문서 본문):

| 앵커 | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | 통과 | `grep -c '^#\{4,\} '` → `0`. 최대 depth는 `###`(Task 제목) |
| 강조색 화면당 1개 | 적용 불가 | 계획 문서에 뷰포트·accent token이 없고, 변경되는 renderer 두 파일은 색상 토큰·CSS를 건드리지 않는다 |
| raw markdown marker 금지 | 통과 | 소비처(L1 파서·L2 리뷰어·GitHub)가 markdown으로 렌더한다. 원시 HTML 엔티티 0건 |
| 한 화면 항목 수 상한 (상위 3 + collapse) | 적용 불가 | 앵커의 대상은 렌더 표면(`status.html`)이다. 계획 본문에 `<details>` collapse를 넣으면 L1의 `C7_TABLE_SHAPE` 표 검사와 충돌하고 L2 리뷰어가 접힌 내용을 근거로 쓸 수 없다 — 앵커 적용이 게이트를 깨뜨린다 |

HIGH/CRITICAL/severity-미상 finding 0건이므로 R0에서 수렴했다. 적용 불가 2건을 "통과"로
적지 않은 이유는 그것이 인접 판정을 목표 판정으로 승격하는 형태이기 때문이다(UI7).

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 어떤
impeccable 명령도 **호출하지 않고** 아래를 구현자용 체크리스트로만 기록한다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

이 계획의 구현은 렌더 표면을 새로 만들지 않는다(버전 리터럴 2줄). 따라서 implement 단계에서
`renderingSurface=0`으로 refine/discovery는 recommend로 강등될 것으로 예상한다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
