# Plan Review Panel — session-process-reclaim

**Plan**: `.claude/plans/session-process-reclaim.plan.md` · **Plan version**: `sha256:289a1d3a573bd23a6333f25343a03215ad89095610f550fa70e9ecd9ef513615`
**Round**: 12 — 새 세션에서 재판정 (R11의 agent cap 24/24 소진은 세션 키에 묶여 있었고, 이 세션에서 리셋됨)
**Verdict**: divergent via multi-agent
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded)
**Layers**: L1 converged · L2 divergent (architect pass · security pass · test pass · **invariant fail**) · L3 not fired

**Blocking reason**: L2 quorum not satisfied: 4 blocking findings — invariant/CRITICAL, invariant/HIGH, invariant/HIGH, invariant/FAIL

## R12가 심사한 판은 R11이 못 본 판이다

R11은 `sha256:f91091f3…`을 심사했고, 그 라운드가 지적한 §D5 오참조(`Task 9c` → `Task 9(d)`)를 정정한 뒤 plan은 `sha256:289a1d3a…`가 됐다. R12는 정정본을 바인딩해 심사했다.

## 라운드 추이 (R6~R12)

| | R6 | R7 | R8 | R9 | R10 | R11 | R12 |
|---|---|---|---|---|---|---|---|
| 응답 관점 | 3/4 | 4/4 | 3/4 | 4/4 | 4/4 | 4/4 | **4/4** |
| **findings 0 pass** | 0 | 0 | 0 | 2 | 2 | 3 | **3** |
| CRITICAL | 2 | 0 | 0 | 0 | 0 | 0 | **1** |
| HIGH | 6 | 0 | 1 | 4 | 1 | 0 | **2** |
| MEDIUM / LOW | 5 / 2 | 2 / 1 | 2 / 0 | 2 / 0 | 3 / 0 | 2 / 0 | **2 / 0** |
| 유일 fail 관점 | — | — | — | — | — | architect | **invariant** |

> **R11에서 fail한 architect는 R12에서 findings 0으로 pass했다** — 오참조 정정이 그 관점의 유일한 blocking을 소멸시켰다. 대신 R11에서 pass했던 invariant가 R12에서 fail로 뒤집혔고, 그 findings는 R11 시점에도 plan에 존재하던 것들이다(정정 대상이 아니었던 절들). 즉 **누적 수렴이 아니라 관점별 재추첨에 가깝다** — 라운드를 더 돌리는 것이 단조 수렴을 보장하지 않는다는 신호다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| invariant | CRITICAL | `.gitignore` precondition check is documented in Acceptance but not enforced in Tasks/Validate sections, creating a fail-open gate erosion where registry files could be untracked before gitignore is updated | Plan Acceptance L649: '`git check-ignore -q`가 Task 1 test의 사전 조건' vs. Task 1 Validate L370-372 which lists 15 test assertions (a)-(o) but no gitignore check. Acceptance explicitly requires this check; Tasks section doesn't show it. Line 335 states '.gitignore 항목이 Task 1보다 먼저 착지해야 한다' but the mechanical enforcement is missing. |
| invariant | HIGH | Order dependency (gitignore before directory creation) is stated in prose but not mechanically enforced, allowing intermediate state where registry is created before gitignore is updated | Task 1 intro L335-336: '선행 조건 — `.gitignore` 항목이 Task 1보다 먼저 착지해야 한다(R6 security LOW)'. But Validation L601-603 check runs AFTER Task 1 completes. The 'precondition' is purely documentary. If implementer skips reading the prose and does Tasks in order, `.claude/state/session-processes/` is created (line 361 mkdir) before `.gitignore` is updated. |
| invariant | HIGH | `reclaimSession` return value consumption gate relies on prose-documented assertions (d) and (e) but lacks mechanical enforcement that reader/implementer must actually call these consume-point tests | Plan D6 L175-183 states 'return value를 버리는 구현은 red다'. Task 7 L467-472 shows code example that MUST read `r.complete`/`r.unreclaimed`. Task 7 Validate L476-478 lists assertions (d) and (e). But (d) is stub-based and (e) checks one case. There is no source-code scan (like Task 9(d) kill-point scan) that verifies ALL code paths calling `reclaimSession` actually consume the return value. |
| invariant | MEDIUM | Task 1's path-escape validation (L362, symlink check) is described as a step but Validate assertion (15) runs on POSIX only and is skipped on Windows, yet 'path_escape' protection is claimed as platform-agnostic fail-closed | D4 L97 says `cross_repo` checks use `fs.realpathSync.native` to detect symlink escapes. Task 1 Validate L371 assertion (15): 'symlink 봉쇄… POSIX만 실행하고 win32는 skip + 사유 출력'. On Windows the symlink escape check is SKIPPED, but D4/§D15 claims about repo ownership state no Windows exemption. The gate is platform-conditional; the invariant is not. |
| invariant | MEDIUM | Plan states `MCCP_RECLAIM_IDENTITY_TOLERANCE_MS` accepts upward values only, but the Validate section does not enumerate the assertion for that enforcement — only prose describes what must be tested | Task 2 L394 케이스 7 describes rejecting `'0'`·`'100'`·`'-5'`·`'abc'`, but Task 2 Validate L383-395 does not show assertion labels for case 7, leaving it ambiguous whether the check is implemented or only documented. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | M1/M2 seam (task dependencies, injection points for killer/collector); abstraction integrity of `isReclaimableBy` (D4 judgment table enforced via schema validation, session identity, host match, repo_root realpath, liveness probe, sibling reuse, lifetime checks, process identity); boundary leaks (`collectSiblingReuse` passed as function not cached list per D11/R3; kill confined to one function per Task 9(d); no cross-pid unlink in register path per D3); citation accuracy (`dashboard-server.js:510-514`, `session-spawner.js:163-171`, `plan.md:1339` all verified against actual code); cross-session safety (SessionEnd operates only on self-session records; SessionStart never kills per D14/Task 10); seam enforcement (D0 justification holds — test-injected killer forces the `isReclaimableBy` call). Accepted the documented remainders (ms-level TOCTOU, bounded 500ms/1500ms identity window) as honest tradeoffs. No structural invariant found broken or unenforced by test. |
| security | pass | Session isolation via session-scoped directories; multi-axis process identity (session_id, host, proc_started_at_ms, exec_path) checked for short-circuit bypass — all AND-composed before kill; hostile PID-reuse scenario requires OS reassignment + command-line collision + platform time window simultaneously; path leakage (absolute `exec_path` preserved, protected by the `.gitignore` prerequisite at line 335); `0o700` mode on both registryDir and sessionDir with assertion at line 372; TOCTOU residual bounded by per-record re-evaluation via function injection; symlink escape check ordered after `mkdir -p`; `writePrivate` tmp+rename atomicity mirrored from existing code. No path omits `isReclaimableBy`; no silent-fail paths; test assertions falsify '오살 0' via injected killer + exact PID set matching. |
| test | pass | Test file path consistency between Files to Change and Validation (all 9 match); falsifiability of '오살 0' (Task 8 injected-killer pid-set comparison), of `isReclaimableBy` gating (Task 9(d) source scan), of marker ordering (Task 7 spy); assertion completeness (Task 1: 15 assertions; Task 2: 11-part decision table; Task 8: 12 cases across cross-session/host/repo/reuse/handoff/stale-pid/identity-unverifiable); integration points (Task 7 return-value consumption, Task 9 kill-uniqueness git-diff, Task 9(a3) spawn-site whitelist); platform-branched tolerance boundary cases on both sides; D14 kill-vs-cleanup separation modeled in Task 10. Found no claim asserted without a falsification mechanism; plan does not over-claim (TOCTOU residual, timing window, and best-effort semantics are all documented). |
| invariant | fail | Acceptance criteria vs Task/Validate sections for missing mechanical enforcement of preconditions (gitignore check); order dependency (gitignore before directory creation) found prose-only with no automation; `reclaimSession` return-value consumption relies on assertions (d)·(e) with no source scan enforcing all callers consume it; path-escape validation platform-conditional in test but platform-agnostic in D4 claims; `IDENTITY_TOLERANCE_MS` down-value rejection described in Actions but not mapped to an assertion in Validate. |

## 게이트 상태 및 흡수 (운영자 결정: HIGH 이상 즉시 수용 · 추가 라운드 없음)

`decideReview`는 exit 12로 BLOCK했고, 운영자는 애자일 사이클(빠른 배포 → 관측 → backlog 갱신)을 택해 **추가 라운드 없이** HIGH 이상만 즉시 흡수했다.

| Finding | Severity | Verdict | 반영 위치 |
|---|---|---|---|
| gitignore 선행 조건이 Acceptance 전용 | CRITICAL | ACCEPT_NOW | Task 1 Action (0) + Validate 단언 (0) |
| 순서 의존이 산문 전용 | HIGH | ACCEPT_NOW | 같은 단언 (0) + Files to Change 행 명기 |
| `reclaimSession` 반환값 소비가 stub 1케이스 | HIGH | ACCEPT_NOW | Task 9 (f) 소스 스캔 신설 |
| symlink 봉쇄 test가 POSIX 전용 | MEDIUM | DEFER | backlog 2026-08-14 |
| Task 2 케이스 7 라벨 미열거 | MEDIUM | DEFER | backlog 2026-08-14 |

- **plan 버전 변경**: 심사본 `sha256:289a1d3a…` → 흡수본 `sha256:7ab502b8…`.
- **재실행한 것은 L1뿐** — 기계 검사이므로 에이전트를 쓰지 않는다. 흡수본에서도 `converged`, violations 0.
- **명시 잔여 (가장 중요)**: **흡수본을 심사한 리뷰어는 없다.** R12는 흡수 이전 본문을 봤고 추가 라운드는 돌리지 않았다. 이 plan의 승인 근거는 리뷰 수렴이 아니라 **운영자 판단**이며, 검증은 구현 단계 Validation과 ship 후 관측으로 이월된다.
- **Codex 미발화**: `MCCP_PLAN_REVIEW` 기본값이 `multi-agent`라 L3는 발화하지 않았다. cross-model 확증 없음 — DD2에 따라 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.
