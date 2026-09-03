# Plan: ci-full-suite M2 — suite-green

**Source PRD**: `.claude/prds/ci-full-suite.prd.md`
**Selected Milestone**: 2 — `runtime-reduction` → **재정의: `suite-green`** (아래 §전제 정정)
**Complexity**: Large

## Summary

M1은 전수 진입점을 만들고 벽시계를 실측했고, 그 실측이 **M2의 원래 전제를 무너뜨렸다** — Linux CI 전수는 75.5초로 이미 어떤 PR 피드백 임계에도 들어간다. 남은 31.4분은 스위트가 아니라 Windows 개발 머신 한 대의 성질이고 거기서 shard는 12%밖에 회수하지 못한다. 그래서 M2가 실제로 다뤄야 할 것은 벽시계가 아니라 **red 16파일**이다 — PRD가 축 C의 전제로 명시한 "flaky 0"이 그것이고, M1은 red의 원인을 규명하지 않은 채 남겼다.

본 milestone은 그 16파일을 6갈래로 분해해 각각의 실제 원인을 닫는다. 그중 가장 큰 갈래는 test 결함이 아니라 **harness 오염**이다: `run.js`가 저장소 루트를 cwd로 자식을 띄우므로 test가 저장소의 *살아있는* 게이트 상태(round 원장 · 정책 seal)를 읽는다. CI는 fresh checkout이라 그 상태가 없고, 그래서 M1 §6이 "플랫폼 차이"로 읽은 Windows 전용 실패의 다수가 실은 플랫폼이 아니라 ambient 오염이었다. 그 해석 정정도 이 milestone의 산출이다.

## 전제 정정 — 이 milestone이 왜 원안과 다른가

M1 baseline이 M2에 넘긴 것은 답이 아니라 질문이었다:

> **M2가 무엇을 최적화하는지 먼저 정해야 한다.** CI 피드백이라면 이미 충족됐고, 로컬 개발 루프라면 shard가 아니라 `mkTmpRepo` 감축이 유일한 수단이다. 이 판단은 M1의 산출이 아니라 M1이 M2에 넘기는 **질문**이다.
> — [m1-baseline.md §4](../../docs/ci-full-suite/m1-baseline.md)

운영자가 2026-09-02에 **스위트 green화**를 선택했다. 그 결과 PRD의 M2 행(이름 `runtime-reduction` · outcome "벽시계가 PR 피드백 임계 안으로 들어온다" · "shard 수를 정하는 것은 이 milestone이다")은 이 계획과 어긋나며, Task 7이 그 행을 정정한다. **벽시계 축은 폐기가 아니라 M1 실측으로 이미 충족됐음을 기록하고 닫는다** — shard 수는 `1`이고(현재 chunk 수도 1), 그 근거는 지어낸 임계가 아니라 관측된 75.5초다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | M2의 축은 벽시계 단축이 아니라 스위트 green화다 | direction |
| UI2 | 전수 러너는 codex 비활성을 기본값으로 강제하고 해제 플래그를 함께 제공한다 | constraint |
| UI3 | 커버리지 향상을 목적으로 하는 신규 test 작성은 이 milestone 밖이다 | exclusion |
| UI4 | 재현되지 않는 실패는 삭제가 아니라 사유가 붙은 명시 격리와 티켓으로 처리한다 | constraint |
| UI5 | baseline이 없는 지표에 목표치를 지어내지 않는다 | constraint |
| UI6 | branch protection 정책 설계와 CI 강제 배선은 M3 소유다 | exclusion |
| UI7 | receipt 게이트와 CI를 연결하지 않는다 | exclusion |
| UI8 | mkTmpRepo 6-spawn 감축과 로컬 벽시계 최적화는 이번 milestone 밖이다 | exclusion |
| UI9 | 있는 test를 돌리는 것만 하고 느린 test를 재작성하지 않는다 | exclusion |

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

> **Verbatim 계약에 대한 명시적 이탈 기록 (2026-09-02, 운영자 승인).** 이 블록은 Phase 2.5.3에
> 따라 verbatim으로 주입됐으나, L1의 C6가 8건을 차단해 게이트가 진행되지 않았다. 편집 범위는
> **인용 경로 확장 9건뿐**이다 — `run.js` → `scripts/test-suite/run.js` 처럼 (줄 번호는 그대로 두고)
> 따라갈 수 없는 축약 경로를 repo-root full 경로로 바꿨다. finding의 문장·severity·축 라벨은
> 한 글자도 바뀌지 않았고, 삭제·병합도 없다. 즉 verbatim 계약이 지키려는 것(저자가 불편한
> finding을 조용히 버리지 못하게 함)은 손상되지 않았고, 바뀐 것은 그 finding을 **검증 가능하게**
> 만드는 좌표뿐이다.
>
> 나머지 3건은 편집으로 해소되지 않았다 — C6의 `CITATION_RE`가 첫 문자 클래스를
> `[A-Za-z0-9_]`로 시작해 **선행 점을 표현하지 못했고**, 그래서 `.claude/prds/…` 형태의 인용을
> 선행 점을 잃은 `claude/prds/…`로 포착해 실재하는 파일에 대해 오탐을 냈다. 이 저장소는 plan·PRD·workflow를
> 전부 dotfile 디렉토리에 두므로 그 상태에서는 **인용을 정확하게 쓰면서 green으로 만드는 방법이
> 존재하지 않았다**. 그래서 표기를 우회하지 않고 체커를 고쳤다 (아래 Files to Change의
> `l1-check.js` 행). 그 수정은 C6를 느슨하게 하지 않는다 — 이제 dot 경로도 **실제로 검사되며**,
> 존재하지 않는 dot 경로는 여전히 거부된다(짝 test가 그것을 고정한다).

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~54k.

### Findings (severity-ranked)

- **[HIGH][architect]** The M1 baseline shows the real parallel-wallclock lower bound is the single longest test file (not seq/cores), and that bound is platform-dependent in opposite directions (Windows: 27.5min dominated by one file; Linux: 17.5s). A shard-count plan derived from one platform's number will not generalize, but the PRD's M2 outcome text speaks of 'shard 수를 정하는 것' as if it were a single scalar. — docs/ci-full-suite/m1-baseline.md §4: 'M2에 대한 제약은 플랫폼에 따라 정반대다' with local=1,649.6s lower bound vs ci-node20=17.5s lower bound; PRD Delivery Milestones row 2: '**shard 수를 정하는 것은 이 milestone이다**'
- **[HIGH][architect]** M1 explicitly declined to touch mkTmpRepo (shared test helper used by 48-54 files across multiple unrelated test suites) citing UI5/UI6 scope boundaries, but flagged it as the dominant root cause of the worst outliers. If M2 chooses the 'fix root cause' path, that is a single shared-helper edit with blast radius across ~15% of the entire suite (54/371 files) — a much higher-coupling change than sharding, and the boundary between C3 (measurement) and any future 'fix' work is not yet drawn. — docs/ci-full-suite/m1-baseline.md §3: 'mkTmpRepo 사용 | 54' of 371 files; PRD Out of scope: '느린 test의 재작성 ... mkTmpRepo의 6-spawn을 fixture 재사용으로 바꾸는 것은 48개 파일의 동작을 바꾸는 변경이다'; PRD Open Question 2 still unresolved.
- **[HIGH][security]** M3 (ci-enforcement) is explicitly acknowledged in the PRD as depending on a manual, out-of-band GitHub setting (branch protection/ruleset) that no file in this repo can express or verify — there is no mechanical check that the setting is actually applied, so 'CI red blocks merge' is an unverifiable claim after M3 ships. — PRD line 33: "CI red를 머지 차단으로 만드는 것은 저장소 설정이지 파일이 아니다." and Scope table row C: "완료 조건에 수동 1회가 들어간다".
- **[HIGH][test]** Axis D ('배선 절단 탐지' negative control) requires proving CI catches broken wiring, but PRD does not specify whether the fixture/proof is a repeatable scripted check or a one-off manual demo. If M3 treats it as a manual demo without a committed reproducible fixture, the claim 'coverage 100% catches wiring breaks' becomes unfalsifiable after revert. — .claude/prds/ci-full-suite.prd.md:106 '커버리지 100%를 달성했는데 그 test들이 아무것도 못 잡는다 ... 축 D(배선 절단 음성 통제)가 정확히 이 위험을 겨냥한다'; Success Metrics row 4 '어떻게 측정: 의도적 배선 제거 → red 확인'
- **[HIGH][test]** test-suite-baseline.yml's real acceptance oracle is documented only as a prose comment (artifact content: ok===true, per_file.length===files_total, redaction_ok===true), not as an automated post-check, because continue-on-error swallows run failures. Any M2/M3 plan reusing this workflow for enforcement must add an explicit content-assertion step, otherwise a red suite silently produces a green Actions run. — .github/workflows/test-suite-baseline.yml:19-25 '`run` 성공은 증거가 아니다 ... 그 검사를 이 workflow 안에 넣지 않는 이유는 continue-on-error가 그것도 함께 삼키기 때문이다.'
- **[HIGH][explorer]** M1 is already complete and shipped a full, reusable test-suite runner infrastructure (scripts/test-suite/{enumerate,reporter,run,redact}.js + scripts/tests/test-suite.test.js + .github/workflows/test-suite-baseline.yml). Any M2 (runtime-reduction) or M3 (ci-enforcement) plan must build strictly on top of run.js's existing exports rather than re-implementing chunking/spawn/attribution logic. — scripts/test-suite/run.js:671-688 exports planChunks, buildSpawnArgs, reporterUrl, deriveAttribution, foldChunks, validateElement, mergeIntoContainer, runChunk, runOnce, listTrackedFiles.
- **[MEDIUM][architect]** M1 already documents a live, unresolved divergence between two definitions of 'the test suite' (new enumerate.js's tracked-file scan vs. suite-determinism.js's DEFAULT_PATTERN), and any M2/M3 plan that reuses either without reconciling them inherits an ambiguous denominator. — ci-full-suite-m1.plan.md Risks table: '스위트 멤버십 정의가 둘(새 러너의 열거 · suite-determinism.js:29의 DEFAULT_PATTERN)이고 어긋나도 관측 장치가 없다 ... 새 러너는 .claude/scripts/receipt/tests/ 10건을 포함하고 그 패턴은 제외한다.'
- **[MEDIUM][architect]** run.js's existing chunking primitive (planChunks) is designed to satisfy an argv-byte ceiling, not to balance wall-clock across shards. If M2 reuses this seam to implement time-based sharding, it conflates two orthogonal concerns (argv-limit safety vs. load-balanced parallelism) inside one function, making either concern harder to reason about or test independently. — ci-full-suite-m1.plan.md Task 3-2: 'argv 길이 판정 ... 순수 named export planChunks({ files, limitBytes })(기본 24,000)' — chunk boundary is purely byte-driven, unrelated to per-file duration.
- **[MEDIUM][architect]** test-suite-baseline.yml (M1) is deliberately scoped to workflow_dispatch + a narrow self-referential pull_request path filter and is explicitly documented as measurement-only, not enforcement. M3 owns the eventual all-PR enforcement trigger and branch protection. Any M2 plan must not silently widen this workflow's paths/trigger to do double duty as both a measurement and enforcement surface — that would erase the milestone boundary the PRD itself set (axis B vs axis C). — ci-full-suite-m1.plan.md Task 5: '트리거는 workflow_dispatch 와 자기 표면으로 좁힌 pull_request ... 이 workflow는 측정이고, red가 dispatch를 실패로 만들면 ...'; PRD 판정 순서 table: 'C. 강제 | 커버리지 100% + branch protection 1회 설정'
- **[MEDIUM][architect]** Draft plan for M2 has not been written yet — the PRD leaves the shard-vs-root-cause-fix decision, the Windows-matrix question (OQ3), and the coverage-denominator question (OQ5) all open simultaneously, and M2's own outcome text depends on answering at least the first two before scope can be bounded. — PRD Open Questions: '[ ] mkTmpRepo의 6-spawn을 고칠 것인가 감쌀 것인가' / '[ ] Windows runner를 전수 matrix에 넣을 것인가' / '[ ] 커버리지 100%의 분모는 무엇인가' — all unresolved as of this PRD version.
- **[MEDIUM][security]** child_process env forwarding for the full test suite passes the entire CI/host environment (potential secrets, tokens) to every spawned test-worker process, including tests contributed by a PR (fork) diff. Running the full suite (C3's whole point) widens the surface that can read process.env compared to the current 2.7%-of-368 status quo. — scripts/test-suite/run.js:423-427 childEnv() does `Object.assign({}, process.env, {MCCP_SUITE_REPO_ROOT: cwd})` and only strips NODE_TEST_CONTEXT/NODE_TEST_WORKER_ID — no secret allowlist/denylist.
- **[MEDIUM][security]** The redaction module (M1) only scrubs absolute filesystem paths (repo/tmp/home roots + structural POSIX/Windows path forms). It has no coverage for credential-shaped strings (tokens, API keys, GITHUB_TOKEN, env values) — a test failure message that happens to echo an env var or auth header would ship straight through redaction_ok=true into a git-tracked, always-uploaded CI artifact. — scripts/test-suite/redact.js:163-168 RESIDUAL_PATTERNS enumerates only win-drive-abs / posix-home / posix-tmp / file-url — no secret-pattern class exists.
- **[MEDIUM][security]** Task 6's artifact-merge step (downloaded CI artifact → tracked git file) is explicitly named as 'a point that crosses a trust boundary' but is currently a human-run local step; if M2/M3 plans automate this merge inside a workflow triggered by pull_request (including forks), an attacker-controlled PR could get its (schema-valid, redaction_ok=true but semantically fabricated) baseline element written into a git-tracked file via a maintainer-approved automerge path. — .claude/plans/ci-full-suite-m1.plan.md:151 "다운로드한 artifact → 커밋되는 파일은 신뢰 경계를 넘는 지점이다"; validateElement (scripts/test-suite/run.js:280-339) checks structural/type validity and redaction only, not provenance/authorship of the run.
- **[MEDIUM][test]** PRD Success Metric #3 ('상시 red/flaky → 0, 어떻게 측정: 동일 커밋 3회 반복 실행') has no defined oracle for which 3 runs count or what artifact schema aggregates cross-run flake results. Without a fixed protocol, the flaky-judgment step is not reproducible by a different operator. — .claude/prds/ci-full-suite.prd.md:62 '| 3 | 상시 red / flaky | 1건 | 원인이 규명된다 | 0 | 동일 커밋 3회 반복 실행 | CI → flaky는 삭제가 아니라 명시 격리 + 티켓 |'
- **[MEDIUM][test]** PRD Open Question '커버리지 100%의 분모는 무엇인가' (file count vs test-case count vs zero-skipped-files) is unresolved and directly determines M3's acceptance oracle. Planning M3 without pinning this down risks writing a Validate step that checks the wrong denominator. — .claude/prds/ci-full-suite.prd.md:97 '커버리지 100%의 분모는 무엇인가. *.test.js 파일 수인가, test case 수인가, "CI가 실행하지 않는 파일이 0"인가. 셋의 값이 다르고 세 번째만 자동 산출이 쉽다.'
- **[MEDIUM][test]** PRD Risk table cites directly-observed race contamination (max 25.6% variance between repeated runs of the same commit), but Milestone 2 (runtime-reduction) states success only as wall-clock-in-threshold, with no stated method for verifying that shard/parallel changes don't reintroduce or mask this contamination. — .claude/prds/ci-full-suite.prd.md:27 '재실행된 7건이 경합 오염의 직접 증거다 ... 최대 25.6%'; Milestone 2 row Outcome only states '벽시계가 PR 피드백 임계 안으로 들어온다'
- **[MEDIUM][explorer]** run.js --list already exposes the enumeration surface (git-tracked *.test.js minus exclusions) that M3's Open Question 4 ('커버리지 100%의 분모는 무엇인가') needs — no new enumeration mechanism should be created for coverage-denominator computation. — scripts/test-suite/run.js:621-624 handles flags.list; PRD OQ4 at .claude/prds/ci-full-suite.prd.md:97 asks what the coverage denominator is.
- **[MEDIUM][explorer]** run.js already has a --merge-into/--label mechanism for atomically appending run results into a tracked container (mccp-suite-baseline/v1 schema) with redaction_ok gating. An M2/M3 plan proposing a new mechanism to record shard results or CI baselines would duplicate this. — scripts/test-suite/run.js:361-383 mergeIntoContainer, :626-655 CLI wiring, :39 CONTAINER_SCHEMA = 'mccp-suite-baseline/v1'.
- **[MEDIUM][explorer]** .github/workflows/test-suite-baseline.yml already establishes the canonical CI-measurement pattern (workflow_dispatch + narrow pull_request paths, continue-on-error + artifact-content-is-the-evidence, node 20/24 matrix, Scope-note comment convention mirroring gitignore-drift.yml). M3's enforcement workflow should mirror/extend this file's structure rather than invent a new workflow pattern. — .github/workflows/test-suite-baseline.yml:1-106, 'Scope note (mirror: gitignore-drift.yml)' block at lines 5-9 and artifact-name-is-a-contract comment at lines 73-76.
- **[MEDIUM][explorer]** The M1 plan already explicitly deferred the mkTmpRepo 6-spawn-per-repo helper (root cause of the slowest 48 test files) as Out of Scope / Open Question — an M2 plan that proposes fixing/replacing it must target the single shared helper location rather than patching call sites individually, since 48 files depend on it. — plugins/mccp/scripts/receipt/tests/helpers.js:8 function mkTmpRepo(); PRD .claude/prds/ci-full-suite.prd.md:30 ('48개 파일이 쓰고'), OQ2 at .claude/prds/ci-full-suite.prd.md:94.
- **[LOW][architect]** The measurement container schema (.claude/_meta/data/*-suite-baseline.json, runs[] keyed by label, --merge-into semantics) is a reusable accumulation pattern M1 built specifically to support cross-run/cross-milestone comparison (Acceptance 1's local/ci-node20 pairing). M2 should extend this container rather than inventing a parallel measurement artifact, or before/after comparisons across M1→M2 will require ad hoc reconciliation. — ci-full-suite-m1.plan.md Task 3: '--merge-into <container> --label <name> ... tracked 증거 파일을 쓰는 주체는 이 마지막 하나뿐이다'; Task 6-3 merge rationale.
- **[LOW][security]** Artifact upload uses `if: always()` and `continue-on-error: true` on the full-suite run, so partial/crashed output is uploaded unconditionally; the workflow's own comment concedes 'run success is not evidence' and that content-level validation (ok/redaction_ok/attribution) must happen out-of-band (locally), not in the workflow — meaning a malicious or buggy element with redaction_ok=false could still be exposed via the raw artifact download even though downstream merge would reject it. — .github/workflows/test-suite-baseline.yml:19-25 comment + steps at :69-83 (continue-on-error / if: always() / if-no-files-found: warn) — no in-workflow gate on artifact content.
- **[LOW][security]** The `pull_request.paths` trigger for test-suite-baseline.yml runs on forked/external PRs that touch scripts/** or the workflow file itself, executing the entire test suite (arbitrary repo test code) with default GITHUB_TOKEN present in env — while permissions are pinned to contents:read (good), no explicit statement addresses whether fork PRs get GITHUB_TOKEN with even read scope forwarded into spawned test children via full env passthrough (finding 1). — .github/workflows/test-suite-baseline.yml:33-51 (`on: pull_request: paths:` + `permissions: contents: read`); combined with scripts/test-suite/run.js:423-427 env passthrough.
- **[LOW][test]** The draft plan for this session does not exist yet, so there is no validation strategy to audit directly — findings target the PRD's Success Metrics and M1's established test conventions the upcoming M2/M3 plan must inherit or explicitly break from. — .claude/prds/ci-full-suite.prd.md:112-113 'Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.'
- **[LOW][test]** The 'Enumerate (sanity)' step diffs run.js --list against `git ls-files '*.test.js'` as a coverage regression guard (good oracle to reuse for M3's 100% metric), but it has no continue-on-error unlike the main measurement step — that intentional asymmetry should be called out explicitly in the new plan rather than silently copy-pasted. — .github/workflows/test-suite-baseline.yml:59-64 vs :69-71 (no continue-on-error on enumerate step, continue-on-error:true on measurement step)
- **[LOW][test]** scripts/test-suite/{enumerate,reporter,run}.js has exactly one test file covering the pure layer (scripts/tests/test-suite.test.js), following the pure/exec two-layer split pattern from suite-determinism.js — a strong pattern the M2/M3 plan should continue: new shard/threshold logic in M2 must add pure-function unit tests, not rely on the CI workflow run as the only oracle. — scripts/tests/test-suite.test.js (grep match); .claude/plans/ci-full-suite-m1.plan.md:38-48 Patterns to Mirror row 'Tests | plugins/mccp/scripts/lib/tests/suite-determinism.test.js:19-33 | node --test, 합성 입력, 네 필드 전부 단언'
- **[LOW][explorer]** suite-determinism.js (plugins/mccp/scripts/lib/suite-determinism.js) was the pattern-source mirrored for pure/execution-layer separation but was explicitly NOT reused directly (DD3) because it depends on node's own glob resolution (Node 22.6+ only) and lives in the deployed plugin surface. A draft plan for M2/M3 must not casually import or extend this file. — M1 plan DD3 (.claude/plans/ci-full-suite-m1.plan.md:77-80).
- **[LOW][explorer]** archive-complete/{scan,apply}.js convention (one axis's tooling grouped into a directory with pure/execution layers split by file) is already followed by scripts/test-suite/; a follow-on plan proposing new tooling directories should follow the same scripts/<axis>/{pure}.js + {execution}.js split rather than inventing a new layout. — M1 plan Patterns to Mirror table, .claude/plans/ci-full-suite-m1.plan.md:48.

### Meta-gaps

- PRD's M2 outcome ('벽시계가 PR 피드백 임계 안으로 들어온다') does not state which platform's wall-clock is authoritative for the threshold — Linux CI (75s, already near-trivial) or a hypothetical Windows CI (31min, dominated by one file). Without pinning this, M2 scope could range from 'no-op, already done' to 'major test-suite refactor.'  _(architect)_
- No explicit module-boundary statement for whether M2's chosen fix (shard config vs. helper rewrite) lives under the same scripts/test-suite/ directory M1 created, or spills into plugins/mccp/scripts/receipt/tests/helpers.js (a deployed-surface file, which would trip UI6-style deployment-surface constraints M1 avoided).  _(architect)_
- PRD doesn't specify how M2's shard/threshold decision interacts with M1's already-documented dual suite-membership definitions (enumerate.js vs suite-determinism.js DEFAULT_PATTERN) when M3 later computes the coverage denominator — this could resurface as a correctness gap at M3 time if not addressed by M2.  _(architect)_
- No draft plan exists yet for M2 (runtime-reduction/sharding) or M3 (ci-enforcement) — this review is necessarily PRD-only for those; re-run the security pass once shard-assignment logic and the CI-enforcement/merge-automation design are drafted.  _(security)_
- PRD Open Questions leave 'Windows runner in the full matrix' and '커버리지 100%의 분모' unresolved — both affect attack surface (matrix expansion = more env exposure points) and should be closed with security lens input, not just cost/perf.  _(security)_
- No mention anywhere in PRD/M1 artifacts of whether fork-PR-triggered CI runs get write-capable tokens or any elevated permissions once M3 adds branch-protection-required status checks — worth an explicit statement in M2/M3 plan.  _(security)_
- Redaction contract (DD7/C-2/C-3) is meticulous for path leakage but has zero mention of credential/secret leakage as a class — should be an explicit non-goal statement or a follow-up axis, not silence.  _(security)_
- PRD Success Metric #3's '동일 커밋 3회 반복 실행' protocol (which 3 runs, how aggregated, what artifact schema) is undefined and should be specified before M2 planning locks in a flaky-judgment procedure.  _(test)_
- No committed reproducible fixture/procedure is defined for the Axis D negative control ('배선 절단 탐지') — M3's plan must decide whether this is a one-time manual demo (weak, unfalsifiable after revert) or a script-driven repeatable check.  _(test)_
- The denominator for '커버리지 100%' (file count vs test-case count vs zero-skipped-files) is an open PRD question that gates what M3's acceptance oracle actually checks — should be resolved in Design Decisions before writing the Validate step.  _(test)_
- No stated regression guard exists for M2's shard/parallelization changes reintroducing the already-observed race contamination (25.6% variance) — a purely wall-clock success metric would mask this.  _(test)_
- The draft plan for this fan-out was not yet written ('draft plan not yet written'), so structure/security/testability findings can't be cross-checked against actual proposed 'Files to Change' — this exploration only surfaces what M1 already shipped so the next milestone plan (M2 runtime-reduction or M3 ci-enforcement) doesn't re-derive it.  _(explorer)_
- PRD does not specify which milestone (M2 or M3) the upcoming /mccp:plan invocation targets; reuse guidance differs depending on whether the plan is runtime-reduction (reuse run.js chunking/spawn seams + mkTmpRepo helper location) or ci-enforcement (reuse test-suite-baseline.yml trigger/artifact pattern + run.js --list for coverage denominator).  _(explorer)_
- docs/ci-full-suite/m1-baseline.md content was not inspected in this pass — the actual wall-clock numbers and top-15 slow-file findings that M2 must consume as its baseline should be read directly by the planning session rather than re-derived from the PRD's Evidence section.  _(explorer)_

### Patterns to mirror

- Pure/execution two-layer split (enumerate.js pure enumeration vs run.js execution/spawn) mirrored from plugins/mccp/scripts/lib/suite-determinism.js:72,125 — keep decision logic (e.g. shard assignment) as pure, testable exports separate from spawn/IO.  _(architect)_
- 'ok' encodes measurement validity, not suite green — ci-full-suite-m1.plan.md Task 3 ('ok는 정확히 측정이 성립했는가이며 스위트 green이 아니다') — any M2 shard-aggregation logic must preserve this distinction rather than conflating shard success with suite pass/fail.  _(architect)_
- Explicit enumerated-outcome tables over prose thresholds — Acceptance 1's per-element accepted-combination table in the M1 plan is a pattern worth mirroring in M2 for shard/threshold acceptance criteria, avoiding vague 'reasonable wall-clock' language.  _(architect)_
- --merge-into label-keyed container pattern (Task 3/6-3) for accumulating multi-run, multi-platform measurement data without overwrite — reuse for M2's before/after comparison rather than a new artifact shape.  _(architect)_
- scripts/test-suite/run.js:429-436 defaultSpawn() uses `shell: false` explicitly with the comment '인자 주입 경로를 만들지 않는다' — mirror this for any new spawn call introduced in M2 sharding.  _(security)_
- scripts/test-suite/run.js:227-258 assertNoPollution()/sanitize() reconstruct parsed JSON via Object.create(null) and reject __proto__/constructor/prototype keys before trusting any file read via --merge-into or --from — mirror this pattern for any new CLI flag that ingests JSON (e.g. a future --shard-manifest).  _(security)_
- scripts/test-suite/run.js:280-339 validateElement() treats redaction_ok as a hard BLOCK (not a warn/flag) before writing to a git-tracked container — mirror the 'block, don't just flag' posture for any new trust-boundary-crossing merge step introduced in M2/M3.  _(security)_
- scripts/test-suite/redact.js's fail-closed philosophy (round 2-4 comments: unmatched/partial substitution must leave the absolute-path *shape* intact so the residual scanner still catches it, rather than silently laundering it) is the right default posture to require of any new redaction/allowlist logic added downstream.  _(security)_
- Pure/exec two-layer separation for deterministic unit testing: plugins/mccp/scripts/lib/suite-determinism.js:72,125 (pure diffRuns vs exec runSuite) — mirrored in scripts/test-suite/enumerate.js vs run.js per .claude/plans/ci-full-suite-m1.plan.md:42  _(test)_
- Test asserts all output fields, not a subset: plugins/mccp/scripts/lib/tests/suite-determinism.test.js:19-33 — avoids false-pass from checking only 2 of 4 fields  _(test)_
- Workflow content-oracle over run-status oracle: .github/workflows/test-suite-baseline.yml:19-25 documents run success != evidence; acceptance requires downloading and inspecting artifact JSON fields (ok, per_file.length, redaction_ok) — should be formalized into an automated check before M3 wires it into branch-protection enforcement  _(test)_
- Enumerate-vs-git-ls-files sanity diff as a coverage-drift guard: .github/workflows/test-suite-baseline.yml:59-64 — directly reusable as the mechanical answer to the PRD's open 'denominator' question (third option: 'CI가 실행하지 않는 파일이 0')  _(test)_
- scripts/test-suite/run.js:671-688 — full seam export list (planChunks, buildSpawnArgs, foldChunks, deriveAttribution, mergeIntoContainer, runOnce) for any sharding/CI-enforcement code to import rather than reimplement  _(explorer)_
- .github/workflows/test-suite-baseline.yml — canonical CI-measurement workflow shape (workflow_dispatch + narrow pull_request paths, continue-on-error + artifact-content-as-evidence, matrix node 20/24, Scope-note comment convention)  _(explorer)_
- plugins/mccp/scripts/receipt/tests/helpers.js:8 mkTmpRepo() — the single shared helper 48 test files depend on; any runtime-reduction work must target this one location  _(explorer)_
- .claude/plans/ci-full-suite-m1.plan.md 'Patterns to Mirror' table — already-vetted mirror sources (suite-determinism.js pure/exec split, archive-complete directory convention, env-contract-drift.yml 'runner-less check is meaningless' rationale) that remain valid for M2/M3  _(explorer)_

## red 16파일 — 6갈래 분해 (본 계획의 근거표)

원자료는 [`.claude/_meta/data/2026-09-01-suite-baseline.json`](../../.claude/_meta/data/2026-09-01-suite-baseline.json)의 `runs[].failing[]`이며, 아래 귀속은 그 `error` 문자열과 소스 실독으로 세웠다. **컨테이너에 없는 주장은 하지 않는다.**

| 갈래 | 파일 | 관측된 오류 | 귀속 |
|---|---|---|---|
| **H — harness 오염** | `lib/tests/codex-invoke.test.js` · `lib/tests/codex-invoke-json.test.js` | 기대값 대신 `round-cap-reached` · `Unexpected end of JSON input` | 자식이 저장소의 살아있는 round seal을 읽음 |
| **H** | `lib/tests/plan-review-cli-emit.test.js` | `12 !== 0` · `Cannot read properties of null` | 같은 원인 — `emit-workflow-args` exit 12 = 라운드 소진 |
| **H?** | `receipt/tests/validate-cmd-intent-gate.test.js` | `tamper must be detected` | 미귀속 — Task 1에서 판정 |
| **P — 플랫폼 가정 무가드** | `lib/tests/history-leak-scan.test.js` | `a case-variant of the repo root must still leak on Windows` | 이름이 Windows 전용인데 skip 가드 없음 |
| **P** | `lib/tests/dispatch-controller.test.js` | `EACCES: mkdir '/synthetic/repo/...'` | 리터럴 절대경로가 Linux에서 루트 |
| **P** | `lib/tests/goal-phase-lock.test.js` | `S14 ... EACCES: permission denied` | EACCES 유도 방식이 비이식적 |
| **P** | `derive/tests/mask.test.js` | `found: <tmp>/mccp-derive-…` | derive의 mask가 POSIX tmp 루트를 안 덮음 |
| **P** | `lib/tests/santa-loop-cap.test.js` (DD3) | `0 !== 2` | symlink 차단 단언이 Linux에서 실패 |
| **C — CI 설정** | `lib/tests/instruction-contract.test.js` | `the real repo must supply a before-ref` | `actions/checkout@v4` 기본 shallow |
| **D — 진짜 drift** | `lib/tests/codex-reachability.test.js` | `15 !== 14` | v1.33.4가 15번째 분류를 넣고 oracle을 안 고침 |
| **D** | `lib/tests/meta-research.test.js` | `BAD_TIMESTAMP` · `REF_NOT_FOUND` ×15 | 실제 메타 문서가 자기 lint를 위반 |
| **F — flaky/병렬 간섭** | `lib/tests/dispatch-fullcycle-smoke.test.js` | `Promise resolution is still pending but the event loop has already resolved` | 비동기 타이밍 |
| **F** | `lib/tests/santa-loop-cap.test.js` (DD9) | `2 !== 0` — DD3와 값이 뒤바뀜 | 공유 상태 간섭 의심 |
| **F** | `lib/tests/review-verdict-corpus-hash.test.js` | digest 불일치, `node20-r2`에서만 | 재실행 1회에서만 관측 |
| **R — 자원 고갈** | `receipt/tests/validate-cmd.test.js` | `Command failed: git add .` | Windows 병렬 하 git spawn 실패 |
| **R** | `receipt/tests/review-single-pass-fields.test.js` | `Command failed: git config commit.gpgsign false` | 같은 부류 |

**갈래 H가 M1 §6의 해석을 뒤집는다.** M1은 `win ∩ linux = 2`를 근거로 "어느 한 플랫폼에서만 돌리면 실패의 절반 이상을 구조적으로 못 본다 → M3 CI 배선이 matrix를 요구한다"고 적었다. 그러나 Windows 전용 6건 중 최소 3건(H)은 플랫폼이 아니라 로컬 저장소에만 존재하는 게이트 상태 때문이다. matrix가 필요한지는 **H를 걷어낸 뒤에** 다시 물어야 하며, 그 재판정이 Task 6의 산출이다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 플랫폼 가드 | `plugins/mccp/scripts/lib/tests/goal-detect.test.js:287` | `test('…', { skip: process.platform === 'win32' }, …)` — 이름이 아니라 실행으로 가드 |
| 플랫폼 가드(사유 문자열) | `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js:677` | `{ skip: IS_WINDOWS ? 'POSIX only (symlink privilege)' : false }` — skip에 사유를 싣는다 |
| env 중화 | `scripts/test-suite/run.js:420-427` | 열거 상수 `INHERITED_TEST_CONTEXT_KEYS` + *왜* 새면 안 되는지의 주석 + `delete env[k]` |
| 격리에 사유 강제 | `scripts/test-suite/enumerate.js:69-76` | `reason`이 공백이면 `TypeError` — "silent exclusion is what this milestone exists to prevent" |
| 다회 측정 누적 | `scripts/test-suite/run.js:626-655` | `--merge-into <container> --label <name>`, `redaction_ok !== true` 원소는 거부 |
| workflow 주석 규약 | `.github/workflows/test-suite-baseline.yml` (Scope note 블록, 5~9행) | `Scope note (mirror: …)` — 이 파일이 강제인지 측정인지를 먼저 선언 |
| 러너 test | `scripts/tests/test-suite.test.js` | 러너 자신의 회귀는 이 파일에 붙인다 (신규 test 파일을 만들지 않는다) |

## Files to Change

경로는 **repo-root 기준 full 경로**다 (CLAUDE.md §1.2 — 축약 경로는 cross-gate dedupe matcher를 불발시킨다).

| File | Action | Why |
|---|---|---|
| `scripts/test-suite/run.js` | UPDATE | 갈래 H — `childEnv`가 codex 정책과 ambient 라운드 상태를 중화 (UI2). `--allow-codex` 추가 |
| `scripts/tests/test-suite.test.js` | UPDATE | 위 중화의 회귀 — seal이 존재하는 상태에서 자식이 그것을 보지 않음을 단언 |
| `plugins/mccp/scripts/lib/tests/history-leak-scan.test.js` | UPDATE | 갈래 P — Windows 전용 단언에 skip 가드 |
| `plugins/mccp/scripts/lib/tests/dispatch-controller.test.js` | UPDATE | 갈래 P — `/synthetic/repo` 리터럴 제거 |
| `plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js` | UPDATE | 갈래 P — EACCES 유도를 이식 가능하게 하거나 가드 |
| `plugins/mccp/scripts/derive/tests/mask.test.js` | UPDATE | 갈래 P — 실패가 test 쪽이면 여기, mask 쪽이면 아래 파일 |
| `plugins/mccp/scripts/derive/mask.js` | UPDATE | 갈래 P — POSIX tmp 루트 미마스킹이 실제 결함이면 여기가 수리 지점 |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATE | 갈래 P(DD3) + F(DD9) |
| `plugins/mccp/scripts/lib/codex-reachability.js` | UPDATE | 갈래 D — `round-cap-reached` 추가, 14 → 15 |
| `plugins/mccp/scripts/lib/tests/codex-reachability.test.js` | UPDATE | 갈래 D — 하드코딩된 14를 15로 |
| `.claude/_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md` | UPDATE | 갈래 D — meta-research lint 위반 수리 |
| `.github/workflows/test-suite-baseline.yml` | UPDATE | 갈래 C — `fetch-depth: 0`. 트리거·강제 범위는 건드리지 않는다 (UI6) |
| `.claude/_meta/data/2026-09-01-suite-baseline.json` | UPDATE | Task 5·6 — 3회 반복 측정 원소를 `--merge-into`로 누적 |
| `docs/ci-full-suite/m2-green.md` | CREATE | M2 산출 문서 — 갈래별 판정·격리 목록·matrix 재판정 |
| `docs/ci-full-suite/m1-baseline.md` | UPDATE | §6 해석 정정 (H가 플랫폼 차이가 아님) |
| `.claude/prds/ci-full-suite.prd.md` | UPDATE | milestone 2 행 재정의 + OQ2·OQ3 응답 + Metric 2·3 갱신 |
| `plugins/mccp/scripts/lib/plan-review/l1-check.js` | UPDATE | 갈래 D(확장) — C6 `CITATION_RE`가 선행 점을 표현하지 못해 dotfile 디렉토리 인용에 오탐. 본 계획 자신의 게이트가 그것에 막혔다 |
| `plugins/mccp/scripts/lib/tests/plan-review-l1.test.js` | UPDATE | 위 수정의 짝 test — dot 경로가 해소되고, **존재하지 않는** dot 경로는 여전히 거부됨을 고정 |
| `plugins/mccp/.claude-plugin/plugin.json` | UNCHANGED | **버전을 선언하지 않는다** — 우산 결정 1. 이 행은 원래 "patch bump"였고 그것이 결정 위반이었다(아래 Risks 참조에서 정정) |
| `CHANGELOG.md` | UPDATE | 같은 bump의 기록 |

| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | **계획 밖 — 확장 사유**: Task 1 Action 2가 예비한 퇴로("도달하지 않으면 그 seam이 결함이고 그것을 수리 대상으로 삼는다")가 발동했다. 라운드 칩 초크포인트만 `--repo-root`를 무시하고 `process.cwd()`를 읽었다 |
| `plugins/mccp/scripts/lib/tests/codex-invoke.test.js` | UPDATE | **계획 밖 — 확장 사유**: 갈래 H의 실제 수리 지점. 귀속이 `run.js`가 아니라 test의 `gitDir` 미격리로 밝혀졌다 |
| `plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js` | UPDATE | **계획 밖 — 확장 사유**: 같은 귀속 + 하드코딩된 14종 집합(갈래 D와 동종) |
| `plugins/mccp/scripts/lib/tests/plan-review-cli-emit.test.js` | UPDATE | **계획 밖 — 확장 사유**: 같은 귀속. 새 `gitDir` 시임을 쓴다 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | **계획 밖 — 파생**: 위 `cli.js` 줄 삽입으로 evidence 앵커(`:699`)가 실제 read site(`:715`)에서 밀렸다. L10 정방향이 잡았다 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | **계획 밖 — 의무**: §3.7 동기 4면. `plugin.json`만 올리면 `i18n-surface.test.js`가 red다(L2-test HIGH 흡수) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | **계획 밖 — 의무**: 같은 4면 동기 |

### 계획을 벗어난 변경 (deviation rationale)

`plan-conflict-detector`가 `file-expansion`으로 잡았고, 조용히 흡수하지 않고 여기 적는다.
위 7행이 계획이 예견하지 못한 변경이며, 세 부류다:

1. **계획 자신이 순인한 퇴로가 발동** — `plan-review/cli.js`. Task 1 Action 2가 env 주입을
   1차 방책으로 제시하면서 "도달하지 않으면 그 seam이 결함"이라 적었다. 세 리뷰 관점이
   env 경로를 반증했고(봉인 우선 · 운영자 정책 불변식), 그래서 퇴로를 타 그 파일을 고쳤다.
2. **귀속이 바뀌자 수리 지점이 이동** — 갈래 H test 3건. 계획은 `run.js`를 지목했으나
   실측이 그것을 반증했다(러너 없이 `node --test`로도 동일 실패). 수리하지 않았다면
   갈래 H가 그대로 남는다.
3. **상위 규약이 요구** — renderer 2면은 CLAUDE.md §3.7이 `plugin.json` bump에 묶은
   의무이고, `registry.js`는 1의 기계적 파생이다.

어느 행도 새 축을 열지 않는다 — 전부 갈래 H·D와 §3.7 의무의 범위 안이다. UI3·UI8·UI9가
제외한 것(신규 커버리지 test · `mkTmpRepo` · 느린 test 재작성)은 여전히 건드리지 않았다.

**격리 파일은 위 표에 없다.** Task 5가 격리를 선택하면 `--exclude-from`이 읽는 JSON이 새로 생기며, 그 경로는 Task 5가 정한다 — 지금 지어내지 않는다 (UI5).

## Tasks

### Task 0: base 동기화 + M2 branch
- **Action**: `origin/main`을 fetch하고(현재 1 behind), M2 작업 branch를 `origin/main`에서 딴다. worktree는 `.worktrees/c3-ci-full-suite`를 그대로 쓴다 (§3.8). branch가 갈린 뒤 `plugin.json` 목표 version을 **이 시점과 `/mccp:pr` 직전 두 번** 재계산한다 (§3.7 병렬 충돌 선례 4건).
- **Mirror**: §3.8 worktree 규약 · §3.7 forward-only 상향
- **Validate**: `git rev-list --count HEAD..origin/main` = 0 · `git diff --diff-filter=D --name-only origin/main...HEAD`가 비어 있음 (§3.5.1 머지 삭제 검증)

### Task 1: 갈래 H — 러너가 자식을 ambient 게이트 상태로부터 격리한다
- **Action**:
  1. `childEnv`에 `MCCP_CODEX_DISABLED: '1'`을 **기본 강제**하고 `--allow-codex` 플래그로 해제 가능하게 한다 (UI2). 사유: CLAUDE.md §3.4가 전수 실행에 이것을 요구하고, M1 §11이 그 대가를 실측했다 — 중단된 재측정에서 orphan node 289개(codex broker 146+143)가 쌓여 셸이 `fork: Resource temporarily unavailable`에 도달했다.
  2. ambient 라운드 정책을 중화한다. `MCCP_ROUND_LEDGER`는 이미 존재하는 손잡이이고 값은 `enforce|observe`다 (`review-rounds/seal.js:49-54`, `off`는 의도적으로 없음). `observe`를 `childEnv`에 실은 뒤 **그것이 실제로 `codex-invoke.js`와 `plan-review/cli.js`의 판정에 도달하는지 실행으로 확인한다** — 두 소비처가 호출자 제공 `env` 객체를 쓰는지 `process.env`를 쓰는지가 관건이다. 도달하지 않으면 그 seam이 결함이고 그것을 수리 대상으로 삼는다.
  3. 중화 목록을 `INHERITED_TEST_CONTEXT_KEYS` 관용구를 그대로 따른 **열거 상수**로 두고 각 항목에 *왜 새면 안 되는지*를 주석으로 남긴다. 새 정책 env가 생기면 여기에 추가되는 것이 자명하도록.
  4. `MCCP_SUITE_REPO_ROOT`의 소비처가 **0건**이다(`scripts/test-suite/run.js:424`가 유일 등장). 소비처를 만들거나 변수를 제거하되 **둘 중 하나를 명시적으로 선택**하고 사유를 남긴다 — 이것 자체가 우산 PRD의 서명 실패 모드("기계는 만들어지고 그것을 부르는 한 줄이 빠진다")가 M1 러너 안에서 재현된 사례다.
- **Mirror**: `scripts/test-suite/run.js:420-427`
- **Validate**: seal이 **존재하는 상태에서**(`.git/mccp/tmp/review-rounds-seal.json` present) 갈래 H 4파일이 green. seal을 지워서 통과시키지 않는다 — 지우면 무엇이 고쳐졌는지 알 수 없다.

### Task 2: 갈래 P — 플랫폼 가정에 가드를 붙이거나 이식 가능하게 만든다
- **Action**: 5건 각각에 대해 **가드인지 수리인지 먼저 판정**한다. 판정 기준: 단언이 특정 플랫폼에서만 참이면 가드, 코드가 플랫폼을 잘못 다루면 수리.
  - `history-leak-scan.test.js` F4 — 이름이 "Windows case-insensitivity"이므로 가드. `{ skip: process.platform !== 'win32' }`
  - `dispatch-controller.test.js` — "no real fs"를 주장하는 test가 실제로 `/synthetic/repo`에 `mkdir`을 시도했다. 이것은 가드가 아니라 **주장과 구현의 불일치**이므로 수리 대상이다.
  - `goal-phase-lock.test.js` S14 — EACCES를 유도하는 방식이 비이식적. 같은 파일 `:349`가 이미 `{ skip: process.platform === 'win32' }`를 쓰므로 그 관용구를 따른다.
  - `mask.test.js` — `scripts/test-suite/redact.js:163-168`은 `posix-tmp` 패턴을 갖는데 derive의 mask는 갖지 않는다. **두 마스킹 구현이 어긋난 것**이므로 수리 지점은 test가 아니라 mask다.
  - `santa-loop-cap.test.js` DD3 — 이미 skip 가드가 있고 Linux에서 실행되어 실패했다. 즉 진짜 Linux 실패이며 원인 규명이 필요하다.
- **Mirror**: `goal-detect.test.js:287` · `santa-loop-cap.test.js:677`
- **Validate**: Linux CI 2 Node에서 5건 green, Windows 로컬에서도 green (가드는 skip으로 계수되며 그 skip이 산출에 보인다)

### Task 3: 갈래 C — CI 체크아웃 깊이
- **Action**: `test-suite-baseline.yml`의 `actions/checkout@v4`에 `fetch-depth: 0`을 준다. 이유를 주석으로 남긴다 — `instruction-contract` lint의 C4 strict pass가 before-ref를 요구하고 shallow 체크아웃에는 그것이 없다. **트리거·`paths`·`continue-on-error`는 건드리지 않는다** (UI6 — 강제 전환은 M3 소유이고 fan-out architect가 같은 경계를 지적했다).
- **Mirror**: `.github/workflows/test-suite-baseline.yml` (Scope note 블록, 5~9행) Scope note 규약
- **Validate**: CI run에서 `instruction-contract.test.js` green

### Task 4: 갈래 D — 진짜 drift 수리
- **Action**:
  1. `codex-reachability.js`의 `KNOWN_CLASSIFICATIONS` / `CLASSIFICATION_KIND`에 `round-cap-reached`를 더하고, test의 하드코딩 `14`를 `15`로 올린다. `round-cap-reached`는 Codex가 발화하지 않은 경우이므로 **reachable이 아니다**(d1의 "exactly one classification ('ok') may read as reachable" 불변식 유지). 결과가 CLAUDE.md §3.3의 15종 표와 1:1인지 대조한다.
  2. `meta-research` lint 위반 15건(`BAD_TIMESTAMP: HEAD` ×11 · `REF_NOT_FOUND` ×4)을 수리한다. test가 "exactly the five legacy documents"를 면제한다고 단언하므로 **면제 목록을 늘려 통과시키지 않는다** — 그러면 lint가 형식만 남는다.
- **Mirror**: CLAUDE.md §3.3 분류 표 · `enumerate.js:69-76`의 "형식만 남는 계약을 만들지 않는다" 태도
- **Validate**: 두 파일 green · `node plugins/mccp/scripts/lib/meta-research.js lint --all --json`이 green

### Task 5: 갈래 F·R — 3회 반복으로 판정하고, 남는 것만 사유와 함께 격리한다
- **Action**:
  1. Metric 3의 "동일 커밋 3회 반복 실행"을 **재현 가능한 프로토콜로 고정**한다 (fan-out test 지적: 현재 오라클이 없어 다른 운영자가 재현 불가). 신규 기제를 만들지 않고 M1의 `--merge-into <container> --label <axis>-r{1,2,3}`을 그대로 쓴다.
  2. 3회에서 실패 집합이 **변하는** 파일 = flaky, **항상 실패**하는 파일 = 상시 red. 둘을 구분해 기록한다.
  3. 수리 가능한 것은 수리한다. 대상 후보: `santa-loop-cap` DD9(DD3와 값이 뒤바뀐 것이 공유 상태 간섭을 시사) · `dispatch-fullcycle-smoke`(비동기 완료 대기 결함) · 갈래 R 2건(Windows 병렬 하 git spawn 실패 — 러너의 동시성 축과 연결될 수 있다).
  4. 3회 뒤에도 남는 것은 `--exclude-from` JSON으로 **명시 격리**하고 `reason`에 티켓 참조를 넣는다 (UI4). 기제는 이미 있고 빈 사유를 거부한다.
- **Mirror**: `scripts/test-suite/run.js:626-655` · `scripts/test-suite/enumerate.js:69-76`
- **Validate**: 컨테이너에 `<axis>-r1..r3` 3원소가 있고, 세 원소의 `failing` 파일 집합이 동일하며, 그 집합이 비었거나 전부 `exclusions`에 사유와 함께 등재돼 있다

### Task 6: 실증 + M1 해석 정정
- **Action**:
  1. Linux CI 2 Node × 3회 + Windows 로컬 1회를 컨테이너에 병합한다.
  2. `m1-baseline.md` §6의 해석을 정정한다 — Windows 전용 실패의 다수가 플랫폼 차이가 아니라 ambient 게이트 상태 오염이었으므로, "matrix가 필요하다"는 추론의 근거가 약해진다. **정정은 소급 재작성이 아니라 추가 절이다** (§3.12 no-rehash 정신 · M1이 측정을 커밋에 결속한 것과 같은 태도).
  3. 갈래 H를 걷어낸 뒤 `win ∩ linux` 교집합을 다시 세고, 그 수로 M3의 matrix 필요 여부를 **다시 묻는다**(답하지 않는다 — OQ3는 M3 소유다).
  4. `docs/ci-full-suite/m2-green.md`를 쓴다. 목표치를 적지 않고 관측값과 그로부터 따라오는 제약만 적는다 (UI5, M1 문서의 태도 그대로).
- **Mirror**: `docs/ci-full-suite/m1-baseline.md` 전체 구성
- **Validate**: 문서의 모든 수치가 컨테이너에서 인용 가능

### Task 7: PRD 갱신
- **Action**: milestone 2 행의 이름·outcome·status·plan을 정정한다. OQ2(임계값)·OQ3(shard 수)에 M1+M2 실측 기반 응답을 단다 — 임계는 관측된 75.5초이고 shard 수는 1이며 둘 다 지어낸 값이 아니다. Metric 2에 "충족(Linux)"을, Metric 3에 실제 red 수(1건이 아니라 16파일)를 기록한다. **`## Delivery Milestones` 표의 다른 행은 건드리지 않는다.**
- **Mirror**: PRD의 기존 "정정(M1 실측)" 표기 관용구 — 원문을 지우지 않고 취소선 + 정정을 병기
- **Validate**: `node plugins/mccp/scripts/lib/archive-complete/scan.js`류가 milestone 표를 여전히 파싱 (C3 불변식 — 원시 행 수 = complete + dropped 등식이 깨지지 않음)

## Validation

```bash
# 0) 머지가 파일을 조용히 지우지 않았는지 (§3.5.1)
git diff --diff-filter=D --name-only origin/main...HEAD

# 1) 갈래별 대상 파일 — 로컬, seal이 존재하는 상태에서
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  plugins/mccp/scripts/lib/tests/codex-invoke.test.js \
  plugins/mccp/scripts/lib/tests/codex-invoke-json.test.js \
  plugins/mccp/scripts/lib/tests/plan-review-cli-emit.test.js \
  plugins/mccp/scripts/lib/tests/codex-reachability.test.js \
  plugins/mccp/scripts/lib/tests/history-leak-scan.test.js \
  plugins/mccp/scripts/lib/tests/dispatch-controller.test.js \
  plugins/mccp/scripts/lib/tests/goal-phase-lock.test.js \
  plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js \
  plugins/mccp/scripts/lib/tests/meta-research.test.js \
  plugins/mccp/scripts/derive/tests/mask.test.js

# 2) 러너 자신의 회귀
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 scripts/tests/test-suite.test.js

# 3) 러너가 codex 정책을 실제로 강제하는가 (UI2 — 배선 확인)
node scripts/test-suite/run.js --list | head -3
node -e 'const r=require("./scripts/test-suite/run.js"); /* childEnv 강제 여부를 export된 seam으로 확인 */' \
  || echo "childEnv seam이 export되지 않았다면 Task 1에서 test 가능하게 만든다"

# 4) meta lint
node plugins/mccp/scripts/lib/meta-research.js lint --all --json

# 5) 전수 3회 (CI에서. 로컬 전수는 §11대로 다른 작업이 도는 동안 완주 불가)
#    gh workflow run test-suite-baseline.yml  → artifact 3세트를 받아 병합
node scripts/test-suite/run.js --merge-into .claude/_meta/data/2026-09-01-suite-baseline.json \
  --label ci-node20-m2-r1 --from <downloaded artifact>

# 6) 컨테이너 판정 — ok/attribution/redaction (M1 Acceptance와 같은 오라클)
node -e '
const j=require("./.claude/_meta/data/2026-09-01-suite-baseline.json");
for (const r of j.runs) console.log(r.ok, r.attribution, r.redaction_ok, r.exit_code,
  (r.failing||[]).filter(f=>f.kind==="file").length);
'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 갈래 H 중화가 test를 *통과시키기만* 하고 실제 격리를 주지 않는다 (예: `observe`가 소비처에 도달하지 않는데 다른 이유로 green) | 중 | Validate 1을 **seal이 존재하는 상태**에서 돌린다. seal을 지우고 통과시키면 무엇이 고쳐졌는지 알 수 없다 |
| `MCCP_CODEX_DISABLED=1` 강제가 codex 경로 test의 의미를 바꾼다 | 낮음 | 실측: 해당 test들은 `invokeAdversarialReview(..., { env: {} })`로 **명시 env 객체**를 넘기므로 `process.env` 강제에 영향받지 않는다 (`codex-invoke.test.js:134,152,…`). 그럼에도 Task 1 Validate가 이를 재확인한다 |
| Task 4의 `codex-reachability` 수정이 배포 표면(`plugins/mccp/`)을 건드린다 | **해소됨(정정)** | **이 행의 이전 판정은 틀렸다.** 원래 여기에는 "PRD의 그 문장은 `.github/`만 바꾼다는 전제에서 쓰였다 … patch bump를 기본으로 두고 이 계획에 명시한다"라고 적혀 있었다. 그러나 PRD L77이 인용한 것은 전제가 아니라 **우산 결정 1**(harness-wiring-integrity.prd.md)이고, 그 결정은 배포 표면을 건드리는지와 무관하게 **자식 브랜치의 version 선언 자체**를 금한다 — 근거가 배포 도달이 아니라 병렬 브랜치 번호 충돌(9회 재발)이기 때문이다. §3.7 v1.33.7 정정("dogfood 번호")을 면허로 읽은 것도 오독이었다. 그 정정은 도달하지 않음을 말할 뿐 선언을 허가하지 않는다. 2026-09-03 실측에서 자식 다섯이 `1.34.5`를 셋·`1.35.0`을 둘 동시 주장했고 이 브랜치가 그중 하나였다. **bump를 되돌렸고**(4면 전부 1.34.4) 강제는 `scripts/version-declaration-guard.js` + CI 가 맡는다 |
| 3회 반복이 flaky를 판정하기에 부족하다 (M1 §5a가 run 간 편차 최대 27.1% 실측) | 중 | 3회는 PRD가 정한 수다 (UI5 — 지어내지 않는다). 3회로 갈리면 flaky로 기록하고, 갈리지 않아도 "3회에서 재현되지 않음"이라고만 쓴다 — M1이 `mccp-fixture`에 쓴 표현 그대로 |
| 갈래 R(자원 고갈)이 test 결함이 아니라 러너 동시성 문제라 Task 5에서 test를 고치려다 헛돈다 | 중 | 판정을 먼저 한다 — 같은 파일이 `--test-concurrency=2` 단독 실행에서 green이면 test가 아니라 부하다. 그 경우 수리 지점은 러너이고, 그것은 벽시계 축이 아니라 green 축이므로 이 milestone 안이다 |
| 격리 목록이 "고치지 않기 위한 통로"가 된다 | 중 | `reason`이 공백을 거부하는 것은 이미 기제가 하고, 그 위에 **격리 건수 자체를 M2 산출 문서에 적는다**. 수가 크면 그것이 M3 진입을 막는 근거다 |
| M1 §6 정정이 M3의 matrix 결정을 성급히 닫는다 | 낮음 | Task 6은 **다시 묻기만** 하고 답하지 않는다. OQ3는 M3 소유로 남긴다 (UI6) |

## Acceptance

> **종결 시점 상태 — 2026-09-03, `/mccp:milestone-close` verdict `done`.**
> 운영자가 미충족분을 M3 및 PR CI로 이연하고 M2를 complete로 닫기로 판정했다. 아래는
> 그 판정 시점의 실제 상태이며, **부분 충족을 완전으로 반올림하지 않는다.**

- [ ] All tasks complete — Task 0~5·7 완료. **Task 6만 부분**: 4개 action 중 6.1(Linux CI 2 Node × 3회를 컨테이너에 병합)이 미완이다. 브랜치가 원격에 올라간 뒤에만 가능하다 ([m2-green.md](../../docs/ci-full-suite/m2-green.md) §5c)
- [ ] Validation passes — Validate 0~4·6 통과. **Validate 5(전수 3회 CI 병합)만 미실행** — 위와 같은 사유
- [x] Patterns mirrored, not reinvented — `## Patterns to Mirror`의 7개 관용구를 전부 기존 소스에서 차용했다. 신규 test 파일 0개, 신규 격리 기제 0개, 신규 반복측정 기제 0개(M1의 `--merge-into`를 그대로 사용)
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) — **산출물 4개 중 3개 충족**(아래)

이 milestone에서 위 마지막 항목이 요구하는 **산출물**은 다음이다:

- [x] `.claude/_meta/data/2026-09-01-suite-baseline.json`에 M2 label이 붙은 원소가 **최소 3개**(같은 커밋 3회) 존재하고, 각각 `ok:true` · `attribution:complete` · `redaction_ok:true`다. — **충족**: `local-m2-r1`~`r4` 4원소, 벽시계 382 / 372 / 431 / 453초
- [ ] 그 3원소의 `failing[].kind==='file'` 집합이 **동일**하고, 비어 있거나 전부 `exclusions`에 사유와 함께 등재돼 있다. — **미충족**: r2·r3·r4의 집합이 `{}` · `{post-edit-format-md}` · `{}`로 변한다. flaky 1건을 격리하지 않은 사유와 원인 귀속 불가의 사유는 m2-green.md §5b
- [x] 갈래 H 검증이 **seal이 디스크에 존재하는 상태**에서 통과했다는 기록이 `docs/ci-full-suite/m2-green.md`에 있다. — **충족**: §3 (`codex-policy.json`·`review-rounds-seal.json` 존재 확인 후 `pass 88 · fail 0`) + §3a 음성 통제
- [x] `codex-reachability`의 분류 수가 CLAUDE.md §3.3의 15종과 1:1로 일치한다. — **충족**: `EXPECTED_CLASSIFICATION_COUNT = 15` 단일 상수로 통합(리터럴 3곳이 drift의 원인이었다) + 3개 표면 각각 단언. `round-cap-reached`는 기존 5 kind 어디에 넣어도 거짓이라 신규 kind `budget-spent`를 만들었다(§6)

**미충족 1건이 무엇에 달려 있는가**: 산출물 2번은 Linux 3회 측정 없이는 판정 자체가 부분이다.
그 3회에 갈래 F 2건(`dispatch-fullcycle-smoke` · `review-verdict-corpus-hash`) · R 2건
(`validate-cmd` · `review-single-pass-fields`) · P 2건(`mask` · `santa-loop-cap` DD3)의 최종
판정이 함께 걸려 있다. 로컬 4회에서 이 6건은 한 번도 실패하지 않았으나 그것은 Linux 판정이
아니다. 회수 지점은 M3(ci-enforcement)이 CI를 배선하는 시점이며, 그때까지
`post-edit-format-md.test.js`의 flaky 관측은 격리 없이 기록으로만 남는다(UI4의 격리 요구를
따르지 않은 사유는 §5b — 4회 중 3회 green이고 격리 실행이 3/3 green인 파일을 격리하면
실재하는 커버리지를 대가 없이 버린다).

## Design Critique

디텍터가 `design_signal=true`를 냈다 — `signal_files`는 `plugins/mccp/scripts/derive/mask.js`와 그 test다.
오탐이 아니다: `derive/mask.js`는 대시보드 렌더러(`STATUS.md` · `status.html`)가 소비하는 model의
값을 마스킹하므로 렌더 표면에 실제로 걸린다. 그래서 SKILL first-step을 읽고 critique 루프를 돌렸다.

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` (4 앵커) 실독
- 라운드: 1 (R0) · cap: 2 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` 미설정 → 기본값)
- 판정: **CONVERGED** — `decideCritique({findings: [], round: 0, cap: 2})`

판정 근거는 의견이 아니라 측정이다. `renderer/output-constraints.js`의 `runOutputConstraints`는
**렌더된 `status.html` 전체 DOM 위에서** 돌고, 소스·마크다운에 line-local하게 적용 가능한 앵커는
`GROUNDING_RULE_IDS`가 명시하듯 **H15(heading depth ≤ 3) 하나뿐**이다. 이 계획 본문을 코드펜스
바깥에서 실측하면 heading 분포가 H1 1 · H2 11 · H3 11이고 **depth 4 이상은 0건**이다.

나머지 세 앵커(강조색 ≤ 1/viewport · raw markdown marker · list-of-N 접기)는 *렌더 표면*의 성질이며
이 산출물은 렌더 표면이 아니라 게이트가 읽는 계획 문서다. 그 셋을 계획 본문에 적용하면
`/mccp:plan`이 규정한 표 구조(Files to Change · Tasks · Risks · Acceptance)가 깨져 리뷰어가 읽을
것이 줄어든다 — 앵커의 목적과 반대 방향이다.

**미흡수 관측 1건 (MEDIUM, §3.14대로 backlog 이연)**: `## Multi-Perspective Fan-out`의 Findings가
22개 평면 목록이라 "list-of-N 상위 3개 + 나머지 접기" 앵커의 정신과 어긋난다. 접지 않은 이유는
Phase 2.5.3이 fan-out markdown을 **verbatim** 주입하도록 규정하기 때문이다 — 편집하면 그 계약이
깨지고 `plan_hash`가 담는 것이 fan-out의 산출이 아니게 된다. 계약과 앵커가 충돌하는 지점이므로
계획 안에서 임의로 해소하지 않고 기록만 한다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 **어떤 impeccable
명령도 호출하지 않는다** — 아래는 구현자를 위한 체크리스트다. `critique`은 이 표가 아니라 §3.9
retry loop이 소유한다.

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

Plan-Codex는 이 계획에서 **발화하지 않았다**. `/mccp:plan`이 `multi-agent` 모드로 돌아 L2 패널이
리뷰를 수행했고(`review_source: multi-agent`), Codex 채널은 그 경로에 없다. 플레이스홀더를 지우지
않고 그 사실을 적는 이유는, 빈 섹션이 "Codex가 돌았는데 아무 말도 안 했다"로 읽히기 때문이다.

- 판정 기록: `.claude/reviews/plan-review-ci-full-suite-m2.md` (verdict=`divergent`, L1 converged · L2 divergent · L3 미발화)
- 봉인: `.claude/receipts/mccp-plan-codex/ci-full-suite-m2.json` — `review_single_pass_reason: deadline_pressure`로 진행하되 verdict는 `divergent` 그대로 봉인
- cross-model 반증의 회수 지점은 `/mccp:pr`의 PR-Codex다 (dedupe는 divergent로 닫혀 있으므로 반드시 발화한다)

## Codex Implementation Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 — Codex는 발화하지 않았다
- 합치 결론: `MCCP_CODEX_DISABLED=1`(영구 운영자 정책)로 `classification=disabled` first-class skip.
  cross-model 반증은 이 게이트에서 회수되지 않으며 `/mccp:pr`의 PR-Codex가 회수 지점이다.
- Codex 정책 봉인: `codex-policy.js seal` → `codex_disabled=true`
- 라운드 봉인: `review-rounds/cli.js seal --gate mccp-implement-codex --decision ci-full-suite-m2` → cap=1 pinned-by=codex-disabled
- Deferred to backlog: 3 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 (auto-CRITICAL 카탈로그 해당 없음)

### 이 게이트가 실제로 받은 반증 — plan-review L2 패널 (`ci-full-suite-m2`)

Codex가 침묵했으므로 이 구현이 딛는 반증은 plan 단계 L2 패널(4관점, verdict=divergent, single-pass 봉인)이다.
그 패널은 Task 1의 **기제 자체를 반증했고**, 아래 YAGNI triage는 그 결과를 구현 결정으로 옮긴 것이다.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| L2-arch/inv/sec: `MCCP_ROUND_LEDGER=observe`를 `childEnv`에 싣는 Task 1 Action 2는 seal 존재 시 구조적으로 무효이고, 그 변수는 "게이트가 절대 대입하지 않는다"는 선언된 불변식이다 | HIGH | ACCEPT_NOW | 기제를 **폐기**한다. `seal.js:207-213`이 봉인 우선·env fallback을 의도로 명시하고 `round-cap-command-body.test.js:209-212`가 대입 금지를 단언한다. 실측으로 근인이 달라졌다 — 갈래 H는 `run.js` 오염이 아니라 **test가 `gitDir`를 격리하지 않아** 저장소의 살아있는 봉인을 읽는 것이고, `node --test` 직접 실행에서도 동일 재현된다. 격리 경계는 env가 아니라 `gitDir`다 |
| L2-test: `MCCP_SUITE_REPO_ROOT` 소비처 0건이라는 Task 1 Action 4의 근거가 거짓 | HIGH | ACCEPT_NOW | 실측 확인 — `scripts/test-suite/reporter.mjs:223`이 소비한다(`--include=*.js` grep이 `.mjs`를 놓쳤다). **변수를 유지**하고 plan의 거짓 주장을 정정한다. 제거는 reporter의 repo-relative 산출을 깨뜨린다 |
| L2-test: Task 1의 핵심 주장을 반증할 test가 없다(`childEnv`가 export되지 않음) | HIGH | ACCEPT_NOW | `childEnv`를 export하고 자식 env의 키 유무를 **직접** 단언한다. 간접 오라클("갈래 H가 green")은 `MCCP_CODEX_DISABLED` 강제만으로도 만족되므로 두 축을 구분하지 못한다 |
| L2-test: `l1-check.js` 2행에 대응 Task도 Validate 줄도 없다 | HIGH | ACCEPT_NOW | Task 4에 흡수하고 `## Validation`에 `plan-review-l1.test.js`를 추가한다 |
| L2-test: `plugin.json` bump의 동기 4면과 그 drift 검증(`i18n-surface.test.js`)이 Validation에 없다 | HIGH | ACCEPT_NOW | 4면 동기 + 해당 test를 Validation에 추가한다 (§3.7) |
| L2-inv: Validation 3번은 항상 exit 0이라 검증력이 0이다 | HIGH | ACCEPT_NOW | 실제 단언을 하는 명령으로 교체한다 |
| L2-arch/test/inv: `round-cap-reached`가 어느 `kind`에 들어가는지 미지정이고, 기존 5종 중 정직한 값이 없다 | MEDIUM | ACCEPT_NOW | MEDIUM이지만 **이 축의 결정 없이는 Task 4를 쓸 수 없다.** 새 kind `budget-spent`를 만든다 — `env-policy`는 사유 문자열이 `MCCP_CODEX_DISABLED=1`이라 거짓을 보고하고, `transport`는 "도달 못 함"이라 의도적 미질의를 장애로 오보한다 (CLAUDE.md §3.3 "서로 다른 축") |
| L2-arch: `MCCP_CODEX_DISABLED=1` 기본 강제가 `codex-companion-smoke.test.js`를 항상 skip으로 접어 허위 커버리지를 만든다 | MEDIUM | DEFER_TO_BACKLOG | UI2가 기본 강제를 요구하고 `--allow-codex`가 해제 경로다. 그 대가(전수 러너 경로에서 이 파일은 "실행됐다"만 주장)를 M2 산출 문서에 적고 축은 M3(커버리지 분모)로 이연한다 |
| L2-arch: Task 7의 취소선 정정을 `## Delivery Milestones` **status 셀**에 적용하면 C4 파싱에서 non-canonical이 되어 영구 archivable 불가 | MEDIUM | ACCEPT_NOW | MEDIUM이지만 데이터 손실 축이라 흡수한다. status 셀은 canonical 토큰만 두고 정정 서술은 다른 열/각주로 옮긴다 |
| L2-sec: fan-out의 security finding 4건이 Tasks/Risks/backlog 어디에도 없다 | MEDIUM | DEFER_TO_BACKLOG | 아래 security-reviewer 결과가 그 4건 중 3건을 실제 좌표로 다시 냈다. 미다룬 축은 backlog에 등재 |
| L2-test: 격리 남용(상시 red를 전부 exclusions로 옮기면 Acceptance 성립)을 기계가 아니라 산문이 막는다 | MEDIUM | DEFER_TO_BACKLOG | Task 5 산출 시 격리 건수를 문서에 적는 것은 유지하되, 기계적 상한은 M3(강제) 소유로 이연 |

### Security Reviewer

`Task(security-reviewer)` 실행 완료 (fallback 없음). HIGH 2건은 **차단이 아니라 흡수**로 처리한다 —
둘 다 이 사이클의 편집 지점 안에서 한 줄~한 함수로 닫히며, §3.16이 금지하는 것은 라운드를 늘리는 것이지
지적을 흡수하는 것이 아니다.

| # | Severity | Location | Finding | Verdict |
|---|---|---|---|---|
| S1 | HIGH | `review-rounds/seal.js:219-254` | Task 1.2의 env 강제는 seal-우선 의미론에서 무시된다. round-ledger 축은 `MCCP_CODEX_DISABLED`(OR 의미론)와 **다른 기제**가 필요하다 | ACCEPT_NOW — 위 L2 HIGH와 같은 결론에 독립 도달. env 기제 폐기, `gitDir` 격리로 전환 |
| S2 | HIGH | `.github/workflows/test-suite-baseline.yml:53` | `persist-credentials: false` 부재 → GITHUB_TOKEN이 `.git/config` extraheader에 평문 잔류. 전수 실행은 PR이 추가한 test까지 돌리고 `redact.js`의 `RESIDUAL_PATTERNS`에는 credential 클래스가 0건이라, 그 값이 `failing[].error`를 거쳐 `if: always()` artifact로 나간다 | ACCEPT_NOW — Task 3이 바로 이 step을 편집하므로 같은 자리에서 한 줄 추가. 이 workflow는 이후 git 쓰기를 하지 않아 기능 손실 없음 |
| S3 | MEDIUM | `derive/mask.js` 전체 | `redact.js`의 구조적 재스캔·`redaction_ok` fail-closed 백스톱이 **0건**. 화이트리스트 밖 필드의 절대경로 유출은 무방비 | DEFER_TO_BACKLOG — `mask.test.js` 단건 수리는 이번 범위, 재스캔 백스톱 이식은 별도 축 |
| S4 | MEDIUM | `scripts/test-suite/run.js:423-427` | `--allow-codex`가 미래에 `pull_request` workflow로 배선되면 codex 자식이 CI env 전량을 물려받는다 | ACCEPT_NOW — 플래그 선언부에 명시 금지 주석 한 줄 (저비용) |
| S5 | MEDIUM | `scripts/test-suite/enumerate.js:69-76` | exclusion `reason`의 **작성자 provenance**가 검증되지 않는다. measurement-only인 지금은 무해하나 M3 강제 승격 시 코드화 필수 | DEFER_TO_BACKLOG — M3 소유로 명시 이연 |
| S6 | LOW | 같은 workflow (`fetch-depth: 0`) | 노출 확대 아님 — 전체 히스토리는 read 권한자가 이미 clone으로 얻는다. S2와 직교 | REJECT_YAGNI — 조치 불필요 |
| S7 | LOW | (프롬프트 전제 정정) | 이 workflow는 어떤 step에도 `GITHUB_TOKEN`을 env로 설정하지 않는다. 노출 경로는 env가 아니라 checkout persist-credentials | 기록만 — S2의 해법 방향을 정한다 |

prototype-pollution 축(`--exclude-from` JSON 수용)은 `run.js:341-350`의 `readJsonFile` → `assertNoPollution` + `sanitize`가 **이미 닫고 있음**을 리뷰어가 실독 확인했다. Task 5는 그 경로를 그대로 재사용하므로 추가 조치가 없다.

### Design Review

> impeccable silent-skip (auto-fallback): `no-signal` — 이 시점의 diff에 렌더 표면이 없다
> (`skill_available=1` · `design_signal=0`). plan 단계에서는 `derive/mask.js`가 신호를 냈으나
> 그 편집은 아직 일어나지 않았다. 게이트 규약대로 pre-EXECUTE 시점의 관측을 그대로 기록한다.

### 근인 정정 — 갈래 H는 러너 오염이 아니다

계획 §Summary와 갈래표는 "`run.js`가 저장소 루트를 cwd로 자식을 띄우므로 test가 살아있는 게이트 상태를
읽는다"고 적었다. **실측이 이를 반증한다** — `node --test`로 해당 파일을 직접 실행해도 동일하게 실패한다
(러너를 거치지 않았다). 근인은 러너가 아니라, 이 두 소비처가 `gitDir` 인자를 받는 시임을 갖고 있는데
(`codex-invoke.js`의 `opts.gitDir` — 주석이 "so tests can point at a scratch repo without chdir"라고
명시) test가 그것을 쓰지 않고 `process.cwd()` 폴백에 떨어지는 것이다. `plan-review/cli.js:306-307`은
같은 결함의 더 강한 형태다 — `--repo-root`를 받아 다른 모든 경로에 쓰면서 라운드 캡 초크포인트만
`process.cwd()`를 읽는다.

그래서 갈래 H의 수리 지점은 `childEnv`가 아니라 (a) 두 test 파일의 `gitDir` 격리와 (b) `plan-review/cli.js`의
누락된 `gitDir` 시임이다. UI2가 요구하는 `MCCP_CODEX_DISABLED=1` 기본 강제는 **별개 축**으로 그대로 이행한다.

## Milestone Closure Provenance

- Milestone : ci-full-suite-m2
- Verdict   : done
- Closure   : `.claude/milestone-closures/ci-full-suite-m2.md`
- sha256    : sha256:35f396e653e831e4007cdfeeda492fdb279ff372c7d90e4a5fa88e9654fb610d
- Stamped at: 2026-09-03T06:56:00Z
- Command   : `/mccp:milestone-close` (run_id=da54bae5-c5e3-4290-8bc9-3f4b7047803f)

closure document는 이 milestone의 종결 판정과 **반올림하지 않은 미충족 1건**을 담는다.
위 sha256이 `/mccp:pr`의 plan_hash anchor에 포함되므로 closure body를 사후 변경하면
mechanical하게 검출된다 (§option B — receipt schema 무수정). closure를 고쳐야 하면
`/mccp:milestone-close`를 재호출해 이 절과 함께 갱신한다 — 한쪽만 손대지 않는다.
