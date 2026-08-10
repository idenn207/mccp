# Implementation Report: diverse-agent review M1 — plan-codex multi-agent 전환

**Plan**: `.claude/plans/diverse-agent-review-m1.plan.md`
**Branch**: `diverse-agent-review-m1`
**Version**: `plugin.json` 1.23.0 → 1.23.1
**Date**: 2026-08-08

## Summary

`/mccp:plan` 게이트의 승인 발급자를 **cross-model 단일 판정(Codex)** 에서 **L1(mechanical) + L2(4관점 refute 패널) 합성 판정**으로 전환했다. 승인 표면은 `resolution.codex_verdict` 옆에 present-only `review_verdict`/`review_source`/`review_proof` 3필드를 신설했고, 판정을 읽던 소비처 7곳을 단일 helper `resolveEffectiveVerdict`로 통일했다.

**dual-review는 제거되지 않고 이동했다.** cross-gate dedupe의 skip 술어를 `converged ∧ source ∈ {codex, hybrid}`로 좁혀 multi-agent 승인이 dedupe를 구조적으로 만족하지 못하게 했으므로(DD2), plan을 패널이 승인해도 terminal `/mccp:pr`에서 PR-Codex가 반드시 발화한다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Large | Large — 예측 정확 |
| Files Changed | 31행 (Files to Change) | 35 (신규 17 · 수정 18) |
| Tasks | 11 (9는 9a/9b 분할) | 12개 전부 완료 |
| Tests | 신규 6 · 확장 3 | 신규 **7** · 확장 2 |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `review-verdict.js` 승인 판독 SSoT | 완료 | 반환에 `axis` 필드 추가 (deviation 4) |
| 2 | schema present-only + L3 meta | 완료 | Task 1 오라클 재사용, `makeSkeleton` 미변경 |
| 3 | L1 mechanical check | 완료 | C6 base-resolution을 동적 확장 (deviation 1) |
| 4 | L2 perspectives + 4 agent | 완료 | `tools: [Read, Grep, Glob]` 도구 부재 확인 |
| 5 | quorum 오라클 | 완료 | M/K 별 축 + malformed=비응답 fail-closed |
| 6 | 3층 합성 오라클 | 완료 | 합성표 9행 전수 test |
| 7 | `plan-review/cli.js` seam | 완료 | exit 0/1/2/12, 입력 부재=12 |
| 8 | `workflows/plan-review.js` | 완료 | `node --check` OK |
| 9a | 판정 소비처 계승 4곳 | 완료 | dedupe·ship-gate·convergence·ledger |
| 9b | 표면 소비처 계승 3곳 | 완료 | worktrees.js 1줄 추가 (deviation 5) |
| 10 | `commands/plan.md` Phase 5 재구성 | 완료 | 5.2a~5.2g + 5.2z(codex 보존) |
| 11 | 테스트·문서·버전 | 완료 | 8단언 전부 test로 존재 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| 신규 오라클 단위 | 통과 | review-verdict 42 · l1 23 · quorum 25 · decide 27 |
| mode rollback | 통과 | 7 tests (DD7 전수) |
| write 불변식 | 통과 | 18 tests (DD11·DD13·wall-clock·provenance·전이성) |
| corpus hash | 통과 | 9 tests — tracked ship corpus 전량 재계산 일치 |
| 회귀 (convergence/ship-gate/dedupe/audit/stage-guard) | 통과 | 6·26·24+5·22·15 |
| `node --check` workflow | 통과 | |
| `evidence-audit --json` | 통과 | `false_positive=0`, `hash_bound=9/9` |
| L1 자기적용 | 조건부 통과 | deviation 2 참조 |

전체 스위트는 `lib/tests` + `receipt/tests` glob으로 실행했으며, 플랜이 명시한 pre-existing 실패 2건(`design-critique-loop-e2e` fixture 부재, `verdict-label.test.js`)은 본 사이클 범위 밖이다.

### Design Grounding

**N/A (no design trigger)** — `impeccable-detect --mode implement`가 `design_signal=false` / `silent_skip=true`(reason `no-signal`)를 반환했다. DD10 no-render 계약대로 M1은 rendered surface를 만들지 않으므로 예상된 결과이며, receipt에 `impeccable_silent_skip=true`로 기록됐다.

### DD10 no-render 검증 (mechanical)

플랜의 Validate 라인(`git diff --exit-code .claude/cache/STATUS.md`)은 `.claude/cache/`가 gitignored라 성립하지 않는다(deviation 6). DD10의 실제 주장을 직접 검증했다:

- `git status --porcelain plugins/mccp/scripts/lib/renderer/` → **변경 0**
- `grep -rn "review_verdict\|review_source" .../renderer/` → **0건** (렌더러가 신규 필드를 소비하지 않음)
- STATUS.md 재렌더 diff → 타임스탬프 + 다른 worktree 상태 + plan 본문 텍스트만. STATUS.md에 보이는 `multi-agent`/`review_source` 문자열은 **plan 본문 Risks 섹션이 렌더된 것**이지 필드 표시가 아니다.

## Files Changed

**신규 (17)**

| File | Lines |
|---|---|
| `plugins/mccp/scripts/lib/review-verdict.js` | +221 |
| `plugins/mccp/scripts/lib/plan-review/l1-check.js` | +약 380 |
| `plugins/mccp/scripts/lib/plan-review/perspectives.js` | +약 135 |
| `plugins/mccp/scripts/lib/plan-review/quorum.js` | +약 215 |
| `plugins/mccp/scripts/lib/plan-review/decide.js` | +약 265 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | +약 400 |
| `plugins/mccp/scripts/workflows/plan-review.js` | +약 175 |
| `plugins/mccp/agents/review-{architect,security,test,invariant}.md` | 4 files |
| `plugins/mccp/scripts/lib/tests/*.test.js` | 7 files |

**수정 (18)** — `receipt/{schema,write,dedupe,cli}.js` · `lib/{receipt-convergence,pr-ship-gate,evidence-audit}.js` · `lib/completion-ledger/{index,store}.js` · `derive/sources/{receipts,worktrees}.js` · `commands/plan.md` · `plugin.json` · `CHANGELOG.md` · `CLAUDE.md` · PRD · 기존 test 2종. 총 `18 files changed, 724 insertions(+), 46 deletions(-)` (신규 파일 제외).

## Deviations from Plan

정직하게 8건. 설계 변경은 없고, 전부 플랜의 사실 오류 교정이거나 플랜이 명시하지 않은 축의 구현 결정이다.

1. **L1 C6 base 집합을 동적 확장** — 플랜 Task 3은 base를 `plugins/mccp/scripts/{,lib/,receipt/}` + `plugins/mccp/` 4개로 규정했으나, **그 집합으로는 플랜 자신의 `verify.js:44-52` 인용을 해결하지 못한다**(실제 위치 `lib/implement-dispatch/`). 정적 열거는 다음 서브디렉토리에서 다시 깨지므로 `plugins/mccp/scripts`와 `.../lib` 아래를 1-depth로 탐색해 base를 만든다. 이 결함은 L1 자신이 잡았다.

2. **Task 7의 자기적용 Validate는 plan 시점 기준으로만 참** — `cli.js l1 --plan <this plan>` → exit 0은 **구현 전** 트리를 전제한다. 구현이 CREATE 대상 17개를 실제로 만들었으므로 지금은 `C3_CREATE_EXISTS` 14건으로 divergent다. plan 시점 트리(CREATE 대상만 숨김)를 재현해 검증한 결과 **converged, 위반 0**. L1은 `/mccp:plan` 시점에 도는 게이트이므로 이것이 정상 동작이다.

3. **신규 test 파일 1개 추가** — `plan-review-write-invariants.test.js`. 플랜의 신규 test 6종 목록 밖이지만, Acceptance가 요구하는 DD11 부분 stamp 거부·DD13 bind·wall-clock 실재·provenance enum·전이성 단언을 담을 곳이 필요했다.

4. **`resolveEffectiveVerdict` 반환에 `axis` 추가** — 플랜은 `{verdict, source, proofFailed}` 3필드를 명시했다. `axis`(`review`/`codex`/`none`)가 없으면 소비처가 "review 축이 관여했는가"를 알 수 없어 legacy byte-동등이 깨진다: 부분 stamp는 `source=null`을 반환하므로 source만으로는 판별 불가하고, `isConvergedVerdict`가 legacy 경로에서 `resolution.converged`를 계속 존중해야 하기 때문이다.

5. **`derive/sources/worktrees.js` 편집** — 플랜 DD12는 이 파일을 "helper 위임으로 자동 계승 (편집 0)"으로 분류했다. **판정은 실제로 helper 경유가 맞다**(`isConvergedVerdict` 호출). 다만 그 앞의 presence gate가 `converged`/`codex_verdict`만 검사해 review-only receipt를 "판정 불가"로 떨어뜨릴 수 있어 `review_verdict`를 1줄 추가했다. 같은 파일의 raw `codex_verdict` 읽기는 **표시 문자열 구성 전용**이라 그대로 뒀다(DD10).

6. **Task 9b Validate의 STATUS.md diff 검증 불가** — `.gitignore:82`가 `.claude/cache/`를 제외하므로 `git diff --exit-code`가 성립하지 않는다. 위 "DD10 no-render 검증"으로 대체했다.

7. **upstream plan-codex receipt 재봉인** — Phase 2.5.4가 지시한 대로 plan에 `## Codex Implementation Review`를 주입하면 `plan_hash`가 바뀌어 plan-codex receipt가 stale이 된다(`markdownHashStructural`은 frontmatter status·체크박스·표 status 토큰만 정규화하고 본문 섹션 추가는 hash를 바꾼다). CLAUDE.md §3.3 표준 복구(진단 → `receipt-write`)를 적용했고 verdict는 `skipped` 그대로 유지해 승인 주장을 강화하지 않았다. **이는 게이트 순서의 구조적 마찰이며 매 사이클 재발한다** — backlog 후보.

8. **security-reviewer HIGH 2건을 설계 변경 없이 흡수** — S1(write.js all-or-nothing 가드 실재)·S2(reviewed_plan_hash 불일치 exit 12)는 플랜 DD11/DD13이 이미 규정한 것이고, reviewer 자신이 "implementation-correctness issues"로 분류했다. 플랜에 **없던** 신규 지적은 S3(경로 오라클의 UNC·mixed separator) 1건뿐이며 Task 1 불변식에 반영했다.

## Issues Encountered

- **Bash 도구의 working directory가 호출 간 persist** — `cd plugins/mccp/scripts/receipt` 이후 상대 경로 호출이 전부 깨졌고, hook-trace가 그 위치에 `plugins/mccp/scripts/receipt/.claude/state/`를 만들었다. untracked임을 확인 후 제거했고 이후 절대 경로를 사용했다.
- **`node --test <dir>`가 이 Node(v24.11.1)에서 디렉토리 인자를 모듈로 해석** — `Cannot find module .../tests`. glob(`".../tests/*.test.js"`)이 필요하다. 플랜과 `receipt/package.json`의 `node --test tests/`는 이 환경에서 동작하지 않는다.
- **`buildReceipt`는 `{repoRoot, receipt}`를 반환**(receipt 객체가 아님) — test에서 unwrap 필요.
- **`readJsonIfPresent`는 파일 부재 시 generic Error를 throw** — 그대로 쓰면 DD11 위반이 exit 1로 나가 fail-closed 12 계약이 깨진다. `write.js`에서 직접 `fs.readFileSync` + try/catch로 감싸 `REVIEW_STAMP_INVALID`를 보장했다.
- **테스트 자체의 버그 2건** — `FULL_PANEL.map(pass)`가 인덱스를 두 번째 인자로 넘겨 `findings=0`이 됐고(오라클은 이를 malformed로 올바르게 거부), DD13 end-to-end 시나리오의 초안은 원본과 내용이 같은 복사본을 써서 hash가 일치해 실패를 재현하지 못했다. 둘 다 교정했다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `review-verdict.test.js` | 42 | 우선순위·DD11 no-fallback·proof 구조 전수·경로 형식(S3 포함)·DD2 |
| `plan-review-l1.test.js` | 23 | C1~C7 개별·inconclusive≠divergent·약칭 인용 오탐 회귀 |
| `plan-review-quorum.test.js` | 25 | M/K 별 축·blocking·malformed·env 파서 warn |
| `plan-review-decide.test.js` | 27 | 합성표 9행·forwardCodexVerdict·proof 통합 |
| `plan-review-mode-rollback.test.js` | 7 | DD7 env 전수 + codex/오타에서 review_* 미생성 |
| `plan-review-write-invariants.test.js` | 18 | DD11·DD13(실제 편집 재현)·wall-clock·전이성·provenance |
| `review-verdict-corpus-hash.test.js` | 9 | tracked corpus 재계산·DD6 양방향(불변 ∧ 반영) |
| `pr-ship-gate.test.js` (확장) | +6 | DD8 source 게이팅 |
| `dedupe.test.js` (확장) | +5 | DD2 cross-model 요구 |

## Next Steps

- [ ] `/mccp:code-review` 또는 `/mccp:prp-commit`
- [ ] `/mccp:pr` — **PR-Codex가 반드시 발화한다**(plan/implement receipt가 `codex_verdict='skipped'`라 dedupe fail-closed). Codex 사용량이 회복되지 않으면 그 지점에서 막히며, 이는 본 PRD가 해결하려는 문제의 현재 상태다.
- [ ] merge 후 `claude plugin update` (1.23.1 캐시 반영)
- [ ] M2(L3 자동 트리거) · M3(implement-verify 3층 확장)
