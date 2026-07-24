# Implementation Report: Integrity Unification M2 (독립 무결성 fixes)

## Summary

M2는 M1의 tightly-coupled 3축(ledger 술어·stage-guard·audit)과 분리된, **서로 다른 trust boundary**에 흩어진 서로 독립적인 국소 무결성 결함 4건을 닫았다. 각 Task는 자기완결 회귀 test로 닫히며 순서 불변식이 없다. Implement-Codex는 환경 companion 크래시(`exit-nonzero`, ~20s)로 **advisory** 진행(운영자 승인) — security-reviewer agent가 security-sensitive 두 축(leak-scan · subject-tamper)을 독립 검토해 **SOUND** 확인(Codex 부재 부분 보완).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Small~Medium | Small~Medium — Task 2가 예상보다 깊음(메커니즘 정정, 아래 Deviation 1) |
| Files Changed | ~14 | 16 tracked + 1 untracked plan (+ report) |
| Codex | R1 수렴 기대 | advisory (companion `exit-nonzero`) → security-reviewer 보완 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | subject_hash → subject-tamper 대칭 분류 | Complete | validate-cmd `stale`→`blocking kind:'subject-tamper'` + preflight INTEGRITY 힌트 |
| 2 | history-leak-scan per-path allowlist | Complete | **Deviated** — rev-list 다중경로 가정이 실측 거짓 → `git ls-tree -r` 증강 |
| 3 | parseReviewPayload 실-producer 회귀 fixture | Complete | **코드 변경 0** (verify-and-close) |
| 4 | briefing convergence residual 정합 | Complete | `!!res.converged` → `isConvergedVerdict(res)` + import |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Task 1 (validate-cmd + preflight) | Pass | receipt suite 442/443 (1 skip, 0 fail) |
| Task 2 (history-leak-scan) | Pass | 15/15 — R5-F3 multi-path + all-allowlisted regression-0 + fail-closed mock 무손상 |
| Task 3 (codex-review-payload) | Pass | 20/20 — real-producer 4건(source:structured) + malformed→unavailable |
| Task 4 (briefing) | Pass | briefing all 32/32 — divergent/critical → "converged: false" |
| receipt-convergence (Task 4 dep) | Pass | 6/6 |
| renderer | 666/667 | 1 pre-existing (verdict-label.test.js, backlog 2026-07-08) — footer test 2건 v1.22.6 동기 |
| 실 저장소 leak scan (`--base HEAD~5`) | Pass | 161 blobs scanned, ls-tree 증강 실데이터 작동, **M2 신규 leak 0** |
| evidence-audit --json | Pass | M1 corpus 불변 (`incomplete / comparable 9 / ok 9 / fp 0 / hash_bound 9 / unverifiable 19`) |
| Task 4 residual sweep | Clean | briefing이 유일한 raw `resolution.converged` display 소비처였음(derive projection은 M1이 이미 교정) |

## Files Changed

| File | Action | Lines |
|---|---|---|
| `plugins/mccp/scripts/receipt/validate-cmd.js` | UPDATED | +16 (subject-tamper 승격) |
| `plugins/mccp/scripts/receipt/preflight.js` | UPDATED | +9 (TAMPER 라벨 + INTEGRITY 힌트) |
| `plugins/mccp/scripts/lib/history-leak-scan.js` | UPDATED | +73/-? (oid→paths[] + ls-tree 증강 + per-path allowlist) |
| `plugins/mccp/scripts/lib/briefing/invoke.js` | UPDATED | +8 (isConvergedVerdict swap + import) |
| `plugins/mccp/scripts/receipt/tests/validate-cmd.test.js` | UPDATED | subject-tamper 회귀 2건 flip |
| `plugins/mccp/scripts/lib/tests/history-leak-scan.test.js` | UPDATED | +39 (multi-path 회귀 2건) |
| `plugins/mccp/scripts/lib/tests/codex-review-payload.test.js` | UPDATED | +71 (real-producer 회귀 4건) |
| `plugins/mccp/scripts/lib/briefing/tests/invoke.test.js` | UPDATED | +36 (divergent 회귀 4건) |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATED | footer v1.22.6 동기(Deviation 2) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.22.5 → 1.22.6 |
| `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` | UPDATED | footer v1.22.6 |
| `CLAUDE.md` · `CHANGELOG.md` · `.claude/plans/codex-findings-backlog.md` | UPDATED | cycle note + ABSORBED 3행 |
| `.claude/plans/integrity-unification-m1.plan.md` | UPDATED | M2 in-progress→complete |
| `.claude/plans/integrity-unification-m2.plan.md` | CREATED | plan + Codex Implementation Review 주입 |

## Deviations from Plan

1. **Task 2 메커니즘 정정 (실측 기반)**: 플랜은 "`git rev-list --objects`가 같은 oid를 여러 `<oid> <path>` 행으로 낼 때 전 경로 수집"을 명시했으나, 실측 결과 `rev-list --objects`는 blob당 **first-path 1행만** 방출(dup-content blob count=1). 플랜대로면 no-op. 따라서 플랜 Action이 명시한 대안("blob 스캔 후 allowlist 판정을 경로별로 수행")을 채택하되, 전 경로 열거는 range 커밋의 `git ls-tree -r`로 수행(dup-content blob count=2 실측 확인). 커밋 SHA는 rev-list --objects의 bare-line에서 재사용해 새 git-call을 최소화 → 기존 fail-closed 테스트 mock(R4/F2) 무손상. ls-tree 실패는 fail-closed(cat-file scan-error 계약 미러). security-reviewer가 per-path 의미론을 SOUND 확인.
2. **i18n-surface.test.js footer 동기**: plugin.json footer bump(v1.22.5→v1.22.6)에 맞춰 footer 버전을 단언하는 renderer test 2건 갱신(§3.7 surface↔test drift 방지). 플랜 Files to Change의 "renderer footer 동기" 항목에 암묵 포함.
3. **plan 미아카이브**: 플랜 Phase 5의 "Archive Plan"(completed/ 이동)을 **의도적으로 skip**. 근거: (a) PRD(integrity-unification)는 M3 pending으로 **전체 미완료** → §3.11 C2(PRD 전체 완료 시에만 archive) 준수, (b) 별도 처리될 PR의 plan-hash 검증이 plan을 `.claude/plans/`에 요구. PRD 완료(M3 ship) 시 `/mccp:archive-complete`로 일괄 이동.
4. **Implement-Codex advisory**: 환경 Codex companion `exit-nonzero`(~20s 크래시, not-authenticated 아님) → advisory mode(`MCCP_ALLOW_CODEX_UNAVAILABLE=1`, 운영자 승인). receipt `resolution.codex_verdict='unavailable'` 봉인 → downstream `/mccp:pr`가 non-approving으로 처리(M1 #110 선례). security-reviewer agent로 부분 보완.

## Issues Encountered

- **테스트 timeout (briefing hang)**: 각 receipt `write()`가 broken Codex로 briefing LLM 호출을 시도해 매번 ~60s hang → 전체 receipt suite가 120s timeout. `MCCP_BRIEFING=off`로 test 격리(플랜 Task 4 risk row 명시). 해소 후 442/443 pass.
- **Pre-existing 실 저장소 leak 4건**: `.claude/state/fix-task-applied.md`(line 12·28)·`docs/multi-session-work-loop/evidence-snapshot.json`(line 4)이 repo-root 절대경로를 포함(main 커밋 내용). **M2 무관·scope 외**(단일경로 blob이라 old/new 동작 동일). `origin/main..HEAD` 범위 밖이라 PR pre-push 미차단. 별도 scrub cycle 후보(관찰만 기록, 미수정).

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `receipt/tests/validate-cmd.test.js` | 2 flip | subject-tamper blocking·not-stale · receipt-tamper pre-empt |
| `lib/tests/history-leak-scan.test.js` | 2 new | multi-path non-allowlisted leak 보고 · all-allowlisted 억제 regression-0 |
| `lib/tests/codex-review-payload.test.js` | 4 new | real-producer envelope source:structured(approve/needs-attention) · malformed/absent → unavailable |
| `lib/briefing/tests/invoke.test.js` | 4 new | divergent·critical → converged:false · converged·absent → converged:true |

## Codex Divergent Review 흡수 (2026-07-25, PR #113 follow-up)

Codex quota 회복 후 M2 diff(`main..HEAD`)에 실제 adversarial-review를 재실행 → verdict **`needs-attention` (divergent)** + findings 2건. 로컬 `/mccp:code-review`(Claude leg)가 놓친 것을 cross-model review가 잡은 사례(single-model blind-spot 방지의 실증). 운영자 결정 = **둘 다 수정**.

### F2 [MEDIUM] — tamper 메시징이 preflight에만, hook 표면엔 없음 (CONFIRMED, Task 1 incomplete)

Task 1은 "Do NOT regenerate (that destroys the evidence)" 가이드를 `preflight.js`(CLI)에만 추가했으나, 슬래시 명령의 실제 enforcement 표면인 `receipt-prompt.js`(UserPromptExpansion)·`receipt-skill.js`(Skill)는 여전히 모든 blocking을 generic `INVALID`로 출력 + **항상** "Write missing receipt"를 append → subject/receipt-tamper block이 tamper 경고 없이 사용자에게 도달하고 receipt regenerate/overwrite를 유도(증거 파괴). 이 세션에서 `/mccp:pr` 차단 시 나온 payload가 정확히 그 generic 메시징이었다.

- 수정 = 신규 shared formatter [`receipt/block-format.js`](../../../plugins/mccp/scripts/receipt/block-format.js) (`entryLabel`/`tamperGuidanceLines`/`hasTamper`/`blockDetailLines`) 도입 → **3개 표면(preflight + 2 hook) 통일**. tamper는 어디서나 `TAMPER` 라벨 + "Do NOT regenerate", "Write missing receipt"는 `missing.length > 0`일 때만. hook의 `additionalContext`도 tamper 시 INTEGRITY 문구로 분기. hook은 fail-open으로 optional require(로드 실패 시 generic fallback).

### F1 [HIGH→실질 MED] — new-path-to-old-blob 미스캔 (CONFIRMED, per-path 보증 완전화; R1→R2 2회 정련)

`byOid`가 `git rev-list --objects base..HEAD`(base 도달 객체 제외)로만 seed되어, branch가 **base에 이미 존재하는 leaking blob**(예: allowlisted fixture)과 동일 콘텐츠를 non-allowlisted 새 경로에 추가하면 그 blob이 `byOid`에 없어 새 경로가 미스캔 → `ok` 오보고. 정보-노출 위협 모델로는 콘텐츠가 이미 base에 public이라 LOW지만, per-path allowlist **보증 완전성**(스캐너 자신의 F-H ancestor-leak 보증) 관점에서 fair. 운영자 철학(품질>비용, security backstop)상 완전화 채택.

- **R1(불충분)**: `git diff --raw base..HEAD` 순-diff로 push가 바꾸는 각 경로의 HEAD blob을 fold-in. → Codex 재리뷰가 **ancestor-only 잔여 gap** 지적: 중간 커밋이 base blob을 non-allowlist 경로에 복사한 뒤 **HEAD 전에 삭제**하면 순-diff에 안 잡혀 미스캔(F-H 보증 위배). 정확한 지적.
- **R2(완전)**: 순-diff를 **base-tree map + 전-커밋 ls-tree walk**로 교체. `git ls-tree -r <base>`로 base의 `(oid,path)` 집합을 만들고, 각 range 커밋의 **전체 트리**(`ls-tree -r`)를 순회하며 blob을 fold-in — NEW blob(byOid) OR base가 발행하지 않은 `(oid,path)`의 OLD blob(=range-introduced 노출 경로). 중간 커밋 트리가 삭제된 경로도 여전히 열거하므로 ancestor-only 케이스까지 포착. base map 실패는 fail-closed. R4/F2 mock은 `ls-tree`→'' 추가로 무손상.

### 흡수 검증

| Test | 결과 |
|---|---|
| `receipt/tests/block-format.test.js` (신규 8) | Pass 8/8 — 라벨·tamper 가이드·조건부 detail |
| `hooks/tests/receipt-prompt-tamper.test.js` (신규 3) | Pass — receipt/subject-tamper → TAMPER + Do NOT regenerate + no "Write missing" · missing은 여전히 write-hint |
| `receipt/tests/preflight.test.js` (+1 subject-tamper) | Pass — refactor 무손상 + subject_hash 가이드 |
| `lib/tests/history-leak-scan.test.js` (+1 F1) | Pass — base allowlisted blob의 non-allowlist 새 경로 leak 보고, all-allowlisted regression-0 유지 |
| hooks informational/skill 회귀 | Pass 무손상 |

신규 파일: `receipt/block-format.js`. 수정: `preflight.js`(shared formatter 배선)·`receipt-prompt.js`·`receipt-skill.js`(tamper-aware block)·`history-leak-scan.js`(changed-path 증강). 버전은 1.22.6 유지(미머지 M2 마일스톤에 리뷰 흡수).

## Next Steps

- [ ] `/mccp:pr` #113 — Codex가 이번엔 실제 divergent를 냈으므로, 흡수 후 재리뷰로 수렴 확인 → non-advisory 봉인. (PR #113 본문은 재리뷰 결과로 갱신 필요.)
- [ ] M3 — terminal `/mccp:pr` non-approving mechanical hard-stop 재설계 (별도 milestone).
