# Plan Review Panel — setup-gitignore-m1

**Plan**: `.claude/plans/setup-gitignore-m1.plan.md` · **Plan version**: `sha256:2d9f085ddabf3673bfb31f6aa56443b88bc3791df5ae75b3080d3ec933983dfe`
**Verdict**: divergent via multi-agent
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) — **not satisfied**: 4 blocking findings (architect/HIGH, architect/FAIL, invariant/HIGH, invariant/FAIL)
**Layers**: L1 converged (violations 0) · L2 4/4 responded (2 fail, 2 pass) · L3 not fired (mode `multi-agent`)

> 라운드 R6. R1 기록은 [`plan-review-setup-gitignore.md`](plan-review-setup-gitignore.md)(구 slug). 이번 라운드는 R5 흡수분(I1 · J1~J7)이 반영된 본문을 대상으로 한다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | Task 5 registers the drift lint as a CI required gate ('CI 필수 게이트') | Plan line 9, 66: 'CI 필수 게이트로 걸어' and 'CI 게이트가 없으면 lint는 권고에 불과하다.' But Task 5 (lines 333-342) only adds a test step without updating workflow trigger paths. Actual workflow (`.github/workflows/axis-k-m2-cross-platform.yml`, lines 20-27) lists paths filter that includes only `pr-phase-guard.js`, `pr-phase-lock.js`, and related files—NOT `gitignore-provision.js` or `.gitignore`. Test step will not run automatically when those files change. |
| invariant | HIGH | Receipt tracking invariant is not verified in test/validation. Plan claims to protect `.claude/receipts/mccp-pr-codex/` files from gitignore, but Validation section (lines 354-364) never tests that actual files in this directory would NOT be ignored by git. | Plan Validation §3 (lines 354-364) creates temporary repo and runs provision but only checks marker existence, version string, and `.bak` backup — never runs `git check-ignore` or `git add` to verify receipt files would be tracked. PRD Success Metrics (`setup-gitignore.prd.md`) explicitly require '동일 시나리오에서 tracked 확인'. Parallel plan `durable-evidence-substrate.plan.md` (lines 324-328) includes this test: `! git check-ignore -q .claude/receipts/mccp-pr-codex/x.json` |
| invariant | MEDIUM | Error type distinction in git invocation is underspecified. Task 1 requires distinguishing `git-unavailable` from `not-a-git-repo` via `result.error` and `status` fields, but does not specify precedence when both conditions might be present or how `spawnSync` populates these fields. | Plan lines 170-178 specify conditions (`result.error` OR `status===null` → git-unavailable; `status!==0` → not-a-git-repo) but don't address field interaction or Node.js `spawnSync` behavior when spawn fails with ENOENT. Task 2 (line 226) attempts coverage via stubs but the DD1 implementation contract remains ambiguous about which condition takes precedence. |
| invariant | MEDIUM | `stripManagedBlock` and `planMerge` use different damage-recovery strategies for malformed markers. If a `.gitignore` has only BEGIN marker (no END), `planMerge` falls back to append mode, but `stripManagedBlock` returns original text unchanged. This creates divergent behavior on subsequent runs. | Plan line 166 specifies stripManagedBlock: '한쪽만 있으면 원문 그대로'. Line 168 specifies planMerge: '한쪽만 있거나 없으면...append'. Task 2 line 217 tests merge behavior with damaged markers but doesn't verify `stripManagedBlock` handles the same damage identically, creating potential for undetected state divergence. |
| test | MEDIUM | UI4: '.git/info/exclude와 global gitignore는 대상이 아니다' is verified by tests | Lines 47 (Out of Scope), 18 (User Intent UI4). Searched Validation section (lines 344-382) and Task 2 test cases (lines 207-243): no test is described that verifies `.git/info/exclude` or global gitignore remain unmodified. Tests cover merge logic, exit codes, `--repo` parameter, version marking, receipt order, drift lint collection equality — but nothing tests the negative constraint that other gitignore sources are not touched. |
| security | — | None — reviewer passed | 악용 경로 미발견 (아래 refutation 표 참조) |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | (1) `MCCP_IGNORE_ENTRIES` 소유처 ↔ drift 강제의 양방향성 · (2) DD1의 오류/skip exit code 분리 · (3) marker 없는 정본 26줄 보유 상태에 대한 `stripManagedBlock` · (4) `git-unavailable` ↔ `not-a-git-repo` 분리(I1) · (5) `정본 ∩ REPO_ONLY === ∅`. 인용(`settings-writer.js:36-57`, `dep-check.js:1-9`) 실측 대조, 정본 26개 실제 계수, `.gitignore` 47 = 26+21 확인. **워크플로 파일을 열어 `paths` 필터에 대상 파일이 없음을 확인 — 이것이 HIGH의 근거** |
| security | **pass** | `--repo` 경로 해석과 `{cwd}` · marker 블록의 데이터 유출 · 신뢰 경계와 write 대상 결정 · receipt negation 줄 순서 · `.tmp`/`.bak`/rename 원자성 · symlink traversal · 동시 write race · 권한 상승. 악용 경로 미발견 |
| test | pass | UI4 부정 제약의 반증가능성 · `gitignore-provision.test.js` 부재 확인(다른 test 99개 중 없음) · exit-code 전파 bash가 `setup.md`에 아직 없음 · `--repo`/`{cwd}` test 배선 · 26+21=47 실측 · `stripManagedBlock` 명세와 test · MEDIUM 1건만 발견, HIGH/CRITICAL 없음 |
| invariant | fail | (1) receipt tracking 게이트 — Validation·Task 2를 추적해 **실제 git-tracked 검증 부재** 확인(PRD Success Metric이 요구, 자매 plan에 선례 존재) · (2) git 호출 오류 유형 판정의 조건 우선순위 모호성 · (3) 손상 marker 복구 전략의 `stripManagedBlock` ↔ `planMerge` 불일치 |

## 라운드 성격

R5까지와 달리 이번 R6의 blocking 2건은 **plan 내부 모순이 아니라 plan ↔ 실제 파일의 불일치**다.

- architect HIGH — plan은 CI 필수 게이트를 주장하지만, 대상 워크플로의 `paths` 필터가 새 파일을 포함하도록 갱신하라는 지시가 Task 5에 없다. 즉 Task 5를 그대로 수행해도 lint는 자동 실행되지 않는다. DD3(“drift는 CI가 강제한다”)의 유일한 근거가 무너진다.
- invariant HIGH — PRD Success Metrics의 “ship receipt 보존 / 동일 시나리오에서 tracked 확인”이 Validation에 test로 존재하지 않는다. `.gitignore` 줄 순서 단언만으로는 “실제로 무시되지 않는다”를 증명하지 못하며, 자매 plan에 `git check-ignore` 선례가 이미 있다.

두 건 모두 흡수 가능하며 서로 독립이다.
