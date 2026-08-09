# Plan: diverse-agent review — plan-codex multi-agent 전환 (M1)

**Source PRD**: `.claude/prds/diverse-agent-review.prd.md`
**Selected Milestone**: 1 — plan-codex multi-agent 전환 (MVP)
**Complexity**: Large

## Summary

`/mccp:plan`의 Phase 5 게이트가 발급하는 승인을 **cross-model 단일 판정(Codex 10-15분)** 에서 **L1(mechanical) + L2(다관점 refute) 합성 판정**으로 전환한다. 승인 표면은 `resolution.codex_verdict` 옆에 **present-only** `review_verdict` / `review_source` / `review_proof` 3필드를 신설하고, 기존 7개 소비처는 단일 helper `resolveEffectiveVerdict`로 계승한다(M1 `receipt-convergence.js` 수술과 동형).

**dual-review는 이동하지 제거되지 않는다.** cross-gate dedupe의 skip 술어를 "converged **∧ source ∈ {codex, hybrid}**"로 좁혀, multi-agent 승인은 dedupe를 절대 만족시키지 못한다 → plan/implement가 multi-agent여도 terminal `/mccp:pr`에서 PR-Codex가 **반드시 발화**한다. 즉 반복 plan 작성에서 10-15분 대기만 사라지고 cross-model 안전판은 ship 지점에 그대로 남는다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| verdict SSoT 단일 helper | `plugins/mccp/scripts/lib/receipt-convergence.js:20-30` | 소비처가 직접 필드를 읽지 않고 한 helper만 호출. 신규 `review-verdict.js`가 이 자리를 확장 계승 |
| pure oracle + 이중 locus 강제 | `plugins/mccp/scripts/lib/pr-ship-gate.js:99-139` | `deriveShipDecision`처럼 fs/spawn 없는 순수 판정 + caller가 I/O. `decideReview`가 미러 |
| enum 어휘 공유 + fail-closed 부재 | `plugins/mccp/scripts/receipt/schema.js:33,138-143` | `CODEX_VERDICT_VALUES` present-only 검증. `review_verdict`가 같은 enum 재사용 |
| present-only 필드 hash 안정성 | `plugins/mccp/scripts/receipt/schema.js:744-760` (`makeSkeleton` 주석), `write.js:147-157` | skeleton 미materialize + 활성 시에만 stamp → 기존 tracked ship corpus `receipt_hash` 불변 |
| 3단 verdict 합성 + mode 파싱 | `plugins/mccp/scripts/lib/implement-dispatch/verify.js:44-52,169-216` | `parseMergedVerifyMode`(오타→fail-closed + loud warn) + `decideMergedVerify` block matrix |
| read-only agent = 도구 부재 | `plugins/mccp/agents/fanout-architect.md:1-5`, `lib/plan-fanout/perspectives.js:11-14` | `tools: [Read, Grep, Glob]`. 프롬프트 문구가 아니라 **도구 부재**가 보증 |
| Workflow self-contained 포트 | `plugins/mccp/scripts/workflows/plan-fanout.js:10-24,167-233` | 샌드박스에 `require` 없음 → tested lib의 faithful 포트 + `fleetKeys` fail-safe 축소 |
| agent launch 회계 | `plugins/mccp/commands/plan.md` Phase 2.5.1/2.5.3 (`reserveWorkers` → `reconcile`) | 모든 launch는 원자 예약·commit. 예약 거부 시 인라인 강등 |
| 테스트 | `plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js:1-40` | `node:test` + `assert/strict`, 실-producer receipt shape(`makeSkeleton`) 재현 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/review-verdict.js` | CREATE | `resolveEffectiveVerdict` + `isReviewProofStructurallyValid` — 승인 판독 SSoT |
| `plugins/mccp/scripts/lib/plan-review/l1-check.js` | CREATE | L1 backbone — plan 내부 일관성 mechanical check (LLM-free) |
| `plugins/mccp/scripts/lib/plan-review/perspectives.js` | CREATE | L2 refute-framed 4역할 카탈로그 + 프롬프트 빌더 + 반환 schema |
| `plugins/mccp/scripts/lib/plan-review/quorum.js` | CREATE | L2 quorum·역할다양성 순수 오라클 (`M-of-N`, K roles, blocking severity) |
| `plugins/mccp/scripts/lib/plan-review/decide.js` | CREATE | 3층 합성 오라클 — `verification_verdict` → `review_verdict` + proof 조립 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | CREATE | command-body seam (`mode` / `l1` / `decide` / `emit-workflow-args`) |
| `plugins/mccp/scripts/workflows/plan-review.js` | CREATE | L2 Workflow 스크립트 (self-contained 포트, `parallel` refute fan-out) |
| `plugins/mccp/agents/review-architect.md` | CREATE | L2 역할 1 — 구조·경계 refute (read-only) |
| `plugins/mccp/agents/review-security.md` | CREATE | L2 역할 2 — 공격면·데이터 refute (read-only) |
| `plugins/mccp/agents/review-test.md` | CREATE | L2 역할 3 — 검증전략·반증가능성 refute (read-only) |
| `plugins/mccp/agents/review-invariant.md` | CREATE | L2 역할 4 — fail-closed/receipt anchoring/rollback invariant erosion refute (read-only) |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `REVIEW_SOURCE_VALUES` + `resolution.review_*` present-only 검증 + L3 계측 meta 필드 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `--review-verdict/--review-source/--review-proof-file/--review-l3-invoked/--review-wall-clock-ms` present-only stamping |
| `plugins/mccp/scripts/receipt/dedupe.js` | UPDATE | `codexConverged` → **cross-model 확증 요구** 술어로 교체 (DD2) |
| `plugins/mccp/scripts/lib/receipt-convergence.js` | UPDATE | `resolveEffectiveVerdict`에 위임 (divergent/critical 강등 로직 보존) |
| `plugins/mccp/scripts/lib/pr-ship-gate.js` | UPDATE | `classifyVerdict`가 helper 경유 + terminal source 게이팅 (DD8) |
| `plugins/mccp/scripts/lib/completion-ledger/index.js` | UPDATE | `verdict_provenance`를 실제 source로 (`codex-verdict`/`multi-agent`/`hybrid`) |
| `plugins/mccp/scripts/lib/completion-ledger/store.js` | UPDATE | `VALID_PROVENANCE` additive 확장 — 미확장 시 `writeEntry`가 신규 provenance 엔트리를 거부 (DD12 정정) |
| `plugins/mccp/scripts/lib/evidence-audit.js` | UPDATE | `receiptVerdict`/`verdictsAgree` source-aware 대조 |
| `plugins/mccp/scripts/derive/sources/receipts.js` | UPDATE | `review_verdict`/`review_source` read-only projection **만** 추가. **DD10 — 렌더러 표시 변경 0** |
| `plugins/mccp/commands/plan.md` | UPDATE | Phase 5 재구성 — mode 분기 · L1 → L2 → decide → receipt-write · L3 opt-in |
| `plugins/mccp/scripts/lib/tests/review-verdict.test.js` | CREATE | helper 판정 + proof fail-closed 전수 |
| `plugins/mccp/scripts/lib/tests/plan-review-l1.test.js` | CREATE | L1 mechanical check 회귀 |
| `plugins/mccp/scripts/lib/tests/plan-review-quorum.test.js` | CREATE | quorum·역할다양성 경계 |
| `plugins/mccp/scripts/lib/tests/plan-review-decide.test.js` | CREATE | 3층 합성 matrix 전수 |
| `plugins/mccp/scripts/lib/tests/review-verdict-corpus-hash.test.js` | CREATE | git-tracked ship corpus `receipt_hash` 무변경 증명 |
| `plugins/mccp/scripts/lib/tests/plan-review-mode-rollback.test.js` | CREATE | `parseReviewMode` 전수 + `codex`/오타 입력에서 `review_*` 미생성 (DD7 자동 회귀) |
| `plugins/mccp/scripts/lib/tests/evidence-stage-guard.test.js` | UPDATE | 신규 `resolution.review_*` 키가 write-side guard를 통과 (DD12) |
| `plugins/mccp/scripts/lib/tests/evidence-audit.test.js` | UPDATE | source-aware 대조 (Task 9b(e)의 대응 test) |
| `plugins/mccp/scripts/receipt/tests/dedupe.test.js` | UPDATE | DD2 — multi-agent converged가 dedupe를 만족 못 함 |
| `plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js` | UPDATE | DD8 source 게이팅 분기 |
| `plugins/mccp/scripts/lib/tests/receipt-convergence.test.js` | UPDATE | 위임 후에도 기존 판정 byte-동등 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.0 → 1.23.1` (§3.7 — PRD 단일 milestone = patch) |
| `CHANGELOG.md` | UPDATE | v1.23.1 row |
| `CLAUDE.md` | UPDATE | §4 운영 토글 **4종**(`## Operating Toggles` 표 mirror — `MCCP_PLAN_REVIEW_L1`은 만들지 않음) + §1.4 표 row |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | Milestone 1 status `pending → in-progress` + Plan 셀 |

## Design Decisions

**DD1 — 새 필드(Option 2), `codex_verdict` 의미 확장 아님.**
`codex_verdict`가 multi-agent 합의를 뜻하게 만들면 필드명이 거짓말하고 ledger `verdict_provenance='codex-verdict'`가 오염된다 — v1.22.5 M1이 정확히 그 유형(`resolution.converged` 오독)을 고쳤다. 신설 `review_verdict`(동일 enum) + `review_source`(`codex|multi-agent|hybrid`) + `review_proof`로 provenance를 보존한다.

**DD2 — dedupe는 cross-model 확증을 요구한다 (이 plan의 안전 척추).**
`evaluateForDedupe`의 skip은 "Codex가 이미 두 번 말했으니 PR-Codex를 생략해도 된다"는 뜻이다. multi-agent converged는 **Codex가 말했다는 증거가 아니다.** 따라서 skip 술어를 `resolveEffectiveVerdict().verdict==='converged' ∧ source ∈ {'codex','hybrid'}`로 좁힌다. 결과: default(multi-agent) 경로에서 plan receipt는 `codex_verdict`를 아예 stamp하지 않으므로 dedupe가 **자동으로 fail-closed** → PR-Codex 실발화. 이 한 줄이 "cross-model을 없앤 게 아니라 반복 지점에서 ship 지점으로 옮겼다"를 mechanical하게 만든다.

**DD3 — L1이 gatekeeper, LLM 판정보다 앞서 short-circuit.**
L1 실패 → 즉시 `divergent`, L2 미발화(에이전트 0개 · 토큰 0). "mechanical 실패를 LLM의 '괜찮아 보임'이 덮을 수 없다"([verification-layer §4](../meta/verification-layer-design.md)).

**DD4 — L2는 fanout-* 재사용이 아니라 전용 refute agent 4종 신설.**
`fanout-*`는 GROUND 보강(제안 지향) 프롬프트다. review는 **반증 지향**("invariant를 깬 증거를 찾아라. 승인은 증거 부재로만 도출")이라 system prompt 자체가 달라야 한다. 역할도 다르다 — `explorer`를 빼고 `invariant`(fail-closed gate / receipt anchoring / rollback safety)를 넣는다. read-only 보증은 프롬프트가 아니라 **frontmatter `tools: [Read, Grep, Glob]` 도구 부재**로 유지(F1 패턴).

**DD5 — proof는 순수 오라클이 *구조*를, caller가 *존재*를 검증.**
`resolveEffectiveVerdict`는 fs를 만지지 않는다(pure). `review_proof` 구조 불변식(layers/quorum/perspectives/verification_verdict)은 오라클과 schema가, `dispatch_evidence` 경로 실존은 write 시점 + `validate-cmd`가 본다. 어느 한 축이라도 실패하면 `converged` → **`unavailable`로 강등**(ship-gate `skipped-unproven` 패턴 정확 미러).

**DD6 — present-only + hash carve-out 금지 (resolution 3필드 + meta 3필드 모두).**
`resolution.review_*` 세 필드는 `makeSkeleton`에 materialize하지 **않는다**. 기존 git-tracked ship corpus는 전부 absent → `receipt_hash` 불변(§3.12 no-rehash). 동시에 `hash.js` carve-out에 **넣지 않는다** — 승인 판정이므로 tamper-protect 대상이다.

**meta 3필드(`review_l3_invoked`/`review_l3_reason`/`review_wall_clock_ms`)도 동일하게 carve-out하지 않는다** (R2 지적 — 이전 판이 명시하지 않은 축). 실측 확인: [hash.js:204-222](../../plugins/mccp/scripts/receipt/hash.js)의 carve-out은 `receipt_hash` 자신 + `meta.briefing_*` 4종 + `meta.ledger_write_skipped`뿐이고 `resolution` 전체와 나머지 `meta`는 **해시에 포함**된다. briefing 필드가 carve-out된 이유는 그것이 receipt write **이후에** stamp되는 사후 요약이라 자기 자신을 해시할 수 없기 때문인데, `review_*`는 write **시점에** 확정되는 승인 근거이므로 그 사유가 적용되지 않는다. 즉 신규 6필드는 전부 **봉인 대상**이고, 이는 M1이 원하는 바다(계측 필드 위조로 감사 서사를 바꿀 수 없어야 한다). Task 11의 corpus-hash test는 "기존 receipt는 6필드 부재 → hash 불변"과 "신규 receipt는 6필드가 hash에 반영됨" 둘 다 단언한다.

**DD13 — `review_proof`는 L2가 *실제로 읽은* plan 내용에 bind된다 (검토 대상과 봉인 대상의 동일성).**
[write.js:123](../../plugins/mccp/scripts/receipt/write.js)은 receipt write **시점에** `plan_hash = planAwareMarkdownHash(planAbs)`를 계산한다. 그런데 L2 agent들은 그보다 **앞선** 시점에 `planPath`를 읽는다. 그 사이에 controller가 plan을 편집하면 — 예컨대 L2가 지적한 항목을 반영하려고, 혹은 다른 이유로 — `review_proof`는 **A 버전**을 검토한 결과인데 `plan_hash`는 **B 버전**을 봉인한다. 그러면 receipt는 "이 plan은 4관점 quorum을 통과했다"고 주장하지만 그 주장은 봉인된 plan에 대한 것이 아니다. 이것은 위조가 아니라 **정직한 절차의 조용한 무효화**이며, 탐지 수단이 없으면 영구히 보이지 않는다.

이 실패 모드는 가설이 아니다 — **본 사이클의 santa-loop R2에서 실제로 발생했다.** 두 리뷰어를 띄운 뒤 controller(나)가 별건 결함을 plan에 편집했고, 그 결과 R2 리뷰어 중 하나의 PASS는 편집 전 버전에 대한 판정이었다(§Review Gate R2 방법론 caveat 참조). 사람이 수동으로 돌려도 나는 실패인데, 자동화하면 매번 난다.

따라서: `review_proof`에 `reviewed_plan_hash`를 필수 필드로 포함한다. **계산 지점은 `cli.js emit-workflow-args`** — L2 발화 직전에 `planAwareMarkdownHash`로 계산해 workflow args에 실어보내고, L2 결과 아티팩트가 그 값을 그대로 되돌려주며, `decide`가 proof에 봉입한다(R3 Reviewer F 요청으로 명시). 계산을 `decide` 시점으로 미루면 편집 후 값을 읽어 불일치를 **스스로 지워버리므로**, 계산은 반드시 L2가 plan을 읽는 시점과 같은 쪽에 있어야 한다. 그리고 `decideReview`가 `reviewed_plan_hash !== 현재 plan hash`이면 `converged`를 발급하지 못하게 한다(→ `unavailable`, fail-closed). `write.js`는 봉인 직전 `resolution.review_proof.reviewed_plan_hash === receipt.plan_hash`를 확인하고 불일치 시 **exit 12**. 이는 `subject_hash` mismatch를 stale이 아니라 tamper로 승격시킨 v1.22.6 M2와 같은 계열의 판단이다 — 검증 대상이 바뀌었으면 검증 결과는 무효다. 복구는 재봉인이 아니라 **L2 재실행**이다(plan이 바뀌었으므로 리뷰도 다시 받아야 한다 — 이것이 정확히 옳은 복구다).

**DD7 — default는 multi-agent, `MCCP_PLAN_REVIEW=codex`가 정확한 롤백. 미상 값은 `codex`로 떨어진다.**
`codex` 모드는 현행 v1.23.0 Phase 5를 byte-동등하게 복원한다(**자동** 회귀 test로 고정 — Task 10/11).

미상·오타 값의 처리는 이 프로젝트의 다른 mode 파서와 **의도적으로 반대 방향**이다. `parseMergedVerifyMode`([verify.js:44-52](../../plugins/mccp/scripts/lib/implement-dispatch/verify.js))는 미상 값을 `enforce`(가장 엄격한 신규 동작)로 떨어뜨린다. 반면 `parseReviewMode`는 미상 값을 **`codex`(기존 경로)** 로 떨어뜨린다. 두 파서가 다른 이유는 실패 모드가 다르기 때문이다:

- merged-verify의 실패 모드는 "검증이 조용히 꺼짐" → 가장 엄격한 값이 안전하다.
- plan-review의 실패 모드는 "**승인 소스 오인**" — 오타 하나로 승인 발급자가 Codex에서 multi-agent로 바뀌는 것이다. 이 축에서 안전한 방향은 "더 엄격"이 아니라 "**이미 검증된 기존 경로**"다.

따라서 **미상 → `codex` + loud stderr warn**이며, 이 선택은 fail-closed의 *대체*가 아니라 이 축에서의 fail-closed의 *정의*다. 회귀 test가 `MCCP_PLAN_REVIEW=cod-ex` 같은 오타에서 multi-agent가 **발화하지 않음**을 단언한다(Task 11).

**DD11 — `review_verdict`/`review_source`는 all-or-nothing으로 stamp된다 (DD2의 실제 구멍).**
DD2는 dedupe 술어에 `source ∈ {codex,hybrid}`를 요구하므로, multi-agent receipt에 `codex_verdict`가 실수로 남아도 `resolveEffectiveVerdict`가 `review_verdict`를 먼저 읽어 `source='multi-agent'`를 반환 → dedupe fail-closed. **즉 DD2는 이중 벨트다.**

그런데 두 벨트가 **동시에** 풀리는 단일 시나리오가 있다: `review_*` stamp가 **부분 실패**(예: `review_source`만 누락, 또는 세 필드 전부 누락)하고 `codex_verdict`는 남는 경우. 이때 `resolveEffectiveVerdict`의 우선순위가 `codex_verdict`로 **fallback**하고 `source='codex'`가 되어 **dedupe가 skip을 허가**한다 — cross-model 리뷰가 실제로는 없었는데. 이것이 DD2의 유일한 진짜 구멍이며, 원인은 술어가 아니라 **stamp 원자성**이다.

따라서: `write.js`가 세 필드를 **marker-gated all-or-nothing**으로 취급한다(v1.2.0-m1 dispatch attribution 3-플래그 invariant와 동형 — CLAUDE.md §1.4 F2 absorption). `--review-verdict`가 공급되면 `--review-source`와 `--review-proof-file`도 **필수**이고, 하나라도 누락 시 receipt write는 **exit 12 fail-closed HALT**(부분 stamp된 receipt를 디스크에 남기지 않는다). 역방향도 강제: multi-agent/hybrid-without-L3 경로는 `--codex-verdict`를 **절대 forward하지 않는다**(Task 10의 `shouldForwardCodexVerdict` 오라클이 단독 소유 — command body가 셸 조건문으로 추론하지 않는다).

**DD12 — verdict 소비처의 명시적 scope 경계 (침묵 대신 선언).**
repo에서 `codex_verdict` 또는 convergence helper를 읽는 모듈은 **19개**다(`grep -rln "codex_verdict" plugins/mccp/scripts --include=*.js`, test/migration 제외). plan이 편집하는 것은 7개다. 나머지 12개를 침묵으로 두면 "빠뜨린 것"과 "의도적으로 둔 것"을 구분할 수 없으므로 각각을 분류한다:

| 분류 | 모듈 | 근거 |
|---|---|---|
| **helper 위임으로 자동 계승** (편집 0) | `derive/sources/worktrees.js` · `lib/briefing/invoke.js` · `lib/escalate-detector.js` | 이미 `receipt-convergence.js`를 경유한다(v1.22.5 M1 sweep 결과). Task 9a(a)가 그 helper를 위임시키면 자동으로 정확해진다. **회귀 test가 이 전이성을 증명해야 한다**(Task 11) — 주장만으로는 부족 |
| **Codex 전용 producer — M1 out of scope** | `lib/codex-bridge.js` · `lib/codex-review-payload.js` · `lib/pr-phase-helpers/codex-runner.js` | Codex 응답 파싱 전용. multi-agent 경로는 이 코드를 거치지 않는다 |
| **out of scope지만 M1에서 확인 필요** | `receipt/status.js` · `receipt/validate-cmd.js` · `lib/evidence-stage-guard.js` · `lib/completion-ledger/store.js` · `lib/pr-phase-helpers/finalize-receipt.js` | 아래 참조 |

마지막 5개의 판단과 그 근거:
- `receipt/status.js` — `codex_verdict`를 **표시**한다. multi-agent receipt에서 이 칸이 빈 값이 되지만 **거짓이 아니다**(실제로 Codex는 안 돌았다). DD10 no-render 계약과 같은 이유로 표시 변경은 M1 범위 밖. 단 Task 11이 "빈 칸이 crash가 아니라 빈 칸으로 렌더됨"을 smoke로 확인한다.
- `receipt/validate-cmd.js` — `deriveShipDecision` 호출부는 Task 9a(c)로 자동 계승. 그 외 `prior_verdict` 두 곳(L644/L657)은 **raw `codex_verdict`를 의도적으로** 읽는 감사 필드이며 effective verdict로 바꾸면 안 된다(감사는 "Codex가 무엇을 말했나"를 원한다). **편집 0이 정답** — 단 이 결정을 여기 기록해 후속 사이클이 "빠뜨렸다"고 오판하지 않게 한다.
- `lib/evidence-stage-guard.js` — write-side schema+gate 검증. `resolution`에 신규 키가 추가돼도 거부하지 않음을 **Task 2가 test로 확인**해야 한다(schema에 `additionalProperties:false`가 없음을 확인했으나, guard 경로는 별도 확인 필요).
- `lib/completion-ledger/store.js` — **편집 필요**(R2 준비 중 실측으로 정정된 항목). [store.js:37](../../plugins/mccp/scripts/lib/completion-ledger/store.js)의 `VALID_PROVENANCE`는 `Object.freeze(['codex-verdict','legacy-unknown','superseded'])`이고 [store.js:146-149](../../plugins/mccp/scripts/lib/completion-ledger/store.js)가 hard `req()`로 이 enum을 **검증**한다. 따라서 Task 9a(d)가 `verdict_provenance`에 `multi-agent`/`hybrid`를 쓰면 `writeEntry`가 **그 엔트리를 거부**한다 — ledger append가 조용히 실패하거나 throw한다. enum을 **additive 확장**해야 한다(기존 3값 유효 유지 → git-tracked ledger 엔트리 재키잉 불필요, §3.12 no-rehash 무손상). 이 항목은 원래 "편집 0"으로 분류했으나 오분류였다.
- `lib/pr-phase-helpers/finalize-receipt.js` — `mccp-pr-codex` 전용 write-side. M1은 pr-codex에 `review_*`를 쓰지 않으므로(DD8) 편집 0.

**DD8 — ship-gate는 terminal에서 multi-agent 단독 승인을 받지 않는다.**
M1은 `mccp-pr-codex` receipt에 `review_*`를 쓰지 않으므로 현재 도달 불가 경로지만, helper 위임 후 미래 drift를 막기 위해 방어적으로 닫는다: `deriveShipDecision`에서 `review_verdict==='converged' ∧ source==='multi-agent'` → no-ship `multi-agent-unproven-at-terminal`. terminal은 `codex`/`hybrid`만 ship.

**DD10 — derive는 확장하되 렌더러 표시는 M1에서 바꾸지 않는다 (no-render 계약).**
`derive/sources/receipts.js`가 `review_verdict`/`review_source`를 projection에 추가하지만, **어떤 renderer section도 이 두 필드를 읽지 않는다.** `sections/{audit-timeline,pipeline,status-grid,multi-session}.js`는 기존대로 `projection.converged`(불리언)만 소비하고, 그 불리언은 Task 9(a)의 helper 위임을 통해 자동으로 정확해진다 — 즉 **사용자 화면의 어휘·색·아이콘은 한 픽셀도 바뀌지 않으면서** divergent multi-agent 판정이 converged로 오표시되는 일만 사라진다. 이유 셋:
- PRODUCT.md "Decisive — 모든 verdict는 명확한 1줄": 사용자가 본 적 없는 세 번째 verdict 어휘(`multi-agent`)를 예고 없이 화면에 등장시키지 않는다.
- 원칙 3 "Quiet by default": `review_source` 뱃지는 새 신호 요소이고, DESIGN.md 팔레트는 이미 signal-blue / alert-red / amber-stale / secret-red / worker-green 5개를 배정했다. 화면당 강조색 1개 예산을 M1이 소비할 이유가 없다.
- 그럼에도 필드를 지금 넣는 이유는 dead field가 아니라 **감사 표면**이기 때문이다 — `evidence-audit`(Task 9b(e))와 `derive/cli.js run --json`이 소비한다. 표시(render)와 감사(derive)는 다른 소비처다.
표시 설계는 M2 이후 별도 디자인 사이클(`/impeccable shape` → `critique`)로 다룬다.

**DD9 — L2도 runaway cap을 소비한다. 예약 거부는 fail-closed.**
"모든 agent launch는 기록된다"(v1.22.3 M3 7라운드)는 예외를 두면 무너진다. plan-review는 `reserveWorkers` → route → `reconcile` 회계를 그대로 따른다. 단 fan-out과 달리 **게이트**이므로 `granted:0`은 인라인 강등이 아니라 L2 `unavailable` → 합성 `unavailable` → **HALT**(복구: 새 세션 / `MCCP_ORCHESTRATION_MAX_AGENTS` 상향 / `MCCP_PLAN_REVIEW=codex`). 게이트가 조용히 약해지는 것보다 멈추는 게 옳다.

## Operating Toggles (CLAUDE.md §4에 신규 추가되는 4종)

R2 리뷰 지적 — 이전 판은 토글 **이름만** 열거하고 default·의미·상호작용을 명시하지 않았다. 구현자가 이름을 추측하지 않도록 여기서 계약을 고정한다. CLAUDE.md §4는 이 표를 mirror한다.

| 토글 | 값 | Default | 의미 |
|---|---|---|---|
| `MCCP_PLAN_REVIEW` | `codex` \| `multi-agent` \| `hybrid` | **`multi-agent`** (미상·오타 → **`codex`** + loud warn, DD7) | 승인 발급자 선택. `codex`=v1.23.0 정확 복원 · `multi-agent`=L1+L2 · `hybrid`=L1+L2+L3(Codex) |
| `MCCP_PLAN_REVIEW_QUORUM` | `"<M>of<N>"` | **`3of4`** | L2 통과 임계. `M`=필요 응답 수(≥2 — Task 1 구조 불변식이 `required>=2`를 강제) · `N`=발화 관점 수(≤4, fleet 상한). 오타 → default + loud warn |
| `MCCP_PLAN_REVIEW_ROLES_MIN` | 정수 | **`3`** | 통과에 필요한 **고유 역할** 수 K. quorum 문자열의 `M`과 **다른 축**이다 — `M`은 "몇 개가 응답했나", K는 "서로 다른 렌즈가 몇 개였나". 같은 역할이 중복 응답해 M을 채우는 것을 막는 것이 K의 유일한 목적이므로 별 토글로 유지한다(R2가 지적한 중복 의심을 여기서 해소) |
| `MCCP_PLAN_REVIEW_L3` | `0` \| `1` | **`0`** | `hybrid` 모드에서 L3(Codex) 발화 여부의 kill switch. `mode=hybrid ∧ L3=0` → L3 미발화 → Task 6 합성표 7행(`unavailable`/HALT). mode와 별 축인 이유: Codex 사용량 소진 시 mode를 건드리지 않고 L3만 끌 수 있어야 한다 |

**`MCCP_PLAN_REVIEW_L1`은 만들지 않는다** (이전 판의 5종 목록에서 **삭제**). L1은 DD3의 gatekeeper이고 LLM-free·저비용이다. 이를 끌 수 있게 만들면 "mechanical 실패를 LLM의 괜찮아 보임이 덮을 수 없다"는 DD3이 env 하나로 무력화된다 — `MCCP_DESIGN_GROUNDING=off`가 loud warn과 함께 존재하는 것과 달리, L1은 승인 발급의 **전제**라 off 경로 자체를 두지 않는 것이 맞다. L1을 우회하려면 `MCCP_PLAN_REVIEW=codex`(승인자 자체를 바꿈)를 쓴다.

## Tasks

### Task 1: `review-verdict.js` — 승인 판독 SSoT
- **Action**: `resolveEffectiveVerdict(resolution) → {verdict, source, proofFailed}` 구현. 우선순위 `review_verdict` > `codex_verdict` > `{verdict:null, source:null}`. `review_verdict==='converged'`인데 `isReviewProofStructurallyValid(review_proof)`가 false면 `{verdict:'unavailable', proofFailed:true}`로 강등. 구조 불변식: `layers.l1==='converged'` ∧ `verification_verdict==='converged'` ∧ `quorum.passed===true` ∧ `quorum.of>=quorum.required>=2` ∧ `perspectives.length===quorum.of` ∧ 역할 중복 0 ∧ 고유 역할 ≥ `quorum.roles` ∧ `dispatch_evidence`가 **repo-root 상대 경로**인 비어있지 않은 문자열 배열 ∧ `reviewed_plan_hash`가 `sha256:<64hex>` 형식 문자열(DD13). `SOURCES=['codex','multi-agent','hybrid']`, `CROSS_MODEL_SOURCES=['codex','hybrid']` 노출.
- **`resolveEffectiveVerdict`는 `reviewed_plan_hash`의 *형식*만 본다** — 현재 plan과의 **일치** 판정은 pure 오라클이 할 수 없다(디스크를 읽어야 하므로). 일치는 `decideReview`(plan hash를 인자로 받음)와 `write.js`(봉인 직전) 두 곳이 소유한다. DD5의 "오라클=구조 / caller=존재" 분업을 그대로 확장한 것이다.
- **경로 형식은 구조 불변식의 일부다 (§3.12 leak 선례)**: `dispatch_evidence` 원소는 절대경로·드라이브 문자(`C:`)·`..` escape를 **금지**하고 오라클이 이를 거부한다. 이유는 두 가지다 — (1) receipt는 git-tracked ship corpus로 승격될 수 있고, `meta.cwd` 절대경로 유출이 실제로 `v1.22.4-cwd-rebind` sanctioned 재봉인을 강제한 선례가 있다(CLAUDE.md §3.12). 같은 실수를 신규 필드에서 반복하지 않는다. (2) worktree 간 이동 시 절대경로는 의미가 깨진다. write 시점의 정규화는 `write.js`가 `meta.cwd`에 이미 적용하는 repo-relative 규칙을 mirror한다.
- **Mirror**: `lib/receipt-convergence.js` (한 helper·주석으로 "왜 이 필드가 신뢰 키인가" 명시), `lib/pr-ship-gate.js#hasSkipProof`
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/review-verdict.test.js`

### Task 2: schema — present-only `review_*` 3필드 + L3 계측 meta
- **Action**: `REVIEW_SOURCE_VALUES` 상수 추가. `validate()`의 resolution 블록에 present-only 검증 3건(enum·source enum·proof 구조 — Task 1 오라클 **재사용**해 이중 정의 방지). meta에 present-only `review_l3_invoked`(bool) / `review_l3_reason`(string|null) / `review_wall_clock_ms`(non-negative int) 검증 추가. `makeSkeleton`은 **건드리지 않는다**(DD6). `SCHEMA_VERSION` 유지.
- **DD11 all-or-nothing 검증 추가**: `review_verdict`가 present인데 `review_source` 또는 `review_proof`가 absent면 **schema invalid**(그 역도 동일). 부분 stamp된 receipt는 디스크에 존재할 수 없어야 하므로 schema가 write-side 마지막 방벽이다.
- **evidence-stage-guard 무해성 확인**: `resolution`에 신규 키 3개가 추가돼도 `lib/evidence-stage-guard.js`의 write-side 검증이 거부하지 않음을 test로 확인한다(DD12 마지막 표 3행). `schema.js`에 `additionalProperties:false`가 없음은 확인했으나 guard 경로는 별도 축이다.
- **Mirror**: `schema.js:134-143`(codex_verdict present-only), `schema.js:710-720`(merged_verify_* present-only), dispatch attribution 3-플래그 all-or-nothing(`receipt/write.js#detectDispatchContext`)
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/` 전량 green + `node --test plugins/mccp/scripts/lib/tests/evidence-stage-guard.test.js`

### Task 3: L1 — plan 내부 일관성 mechanical check
- **Action**: `l1-check.js#checkPlanConsistency({planText, planPath, repoRoot, fsAdapter})` → `{verdict:'converged'|'divergent', violations:[{code,detail}]}`. 검사 6종: (C1) 필수 섹션 존재(`## Summary`/`## Files to Change`/`## Tasks`/`## Validation`/`## Risks`/`## Acceptance`) · (C2) `Files to Change` 각 행이 **repo-root full 경로**(§1.2 dedupe matcher 요구 — 축약 경로는 위반) · (C3) action=`UPDATE`/`DELETE`인 경로는 실존, `CREATE`는 미존재 · (C4) 각 `### Task N`에 `**Validate**:` 라인 존재 · (C5) `**Source PRD**` 경로 실존 · (C6) 본문이 참조하는 `path:line` 인용의 파일 실존 · (C7) plan markdown 구조 정합 — `### Task N` heading 중복 0 · `Files to Change` 표 각 행의 열 수 일치 · 필수 섹션 중복 0. 경로 파싱은 `plan-conflict-detector.parseFilesToChange` **재사용**. fs 접근은 주입 가능한 어댑터로 감싸 테스트를 순수하게 유지.
- **C6은 base-resolution을 해야 한다 (자기적용에서 실측된 함정)**: plan 산문은 경로를 **약칭**으로 인용하는 것이 관례다(`receipt-convergence.js:20-30`, `schema.js:33`). C6이 리터럴 실존만 보면 이 관례가 전부 위반으로 잡혀 L1이 정상 plan을 divergent로 만든다 — 본 plan에 프로토타입 체커를 자기적용했을 때 정확히 이 오탐 4건이 나왔다. 따라서 C6은 `plugins/mccp/scripts/{,lib/,receipt/}` · `plugins/mccp/` base 집합으로 resolve를 시도하고, **어느 base에서도 못 찾을 때만** 위반으로 판정한다. `Files to Change`의 CREATE 대상은 부재가 정상이므로 C6 대상에서 제외한다(C3가 이미 소유).
- **Mirror**: `lib/plan-conflict-detector.js:236-247`(파서 재사용 + 보수적 판정), `lib/design-grounding` mechanical lint의 verdict enum 스타일
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-l1.test.js` — 위반 7종 × 정상 1건 + **약칭 인용 오탐 회귀**(본 plan 본문을 fixture로 넣어 C6이 통과함을 단언)

### Task 4: L2 — refute perspectives 카탈로그 + 4개 read-only agent
- **Action**: `plan-review/perspectives.js`에 `REVIEW_PERSPECTIVES`(architect/security/test/invariant, 각 `agentType: 'mccp:review-*'`) + `REVIEW_SCHEMA`(`{perspective, verdict:'pass'|'fail', findings:[{claim,evidence,severity}], refutationAttempted:string}`) + `buildRefutePrompt`. 프롬프트 골자: *"이 plan이 invariant를 깬 **증거**를 찾아라. 증거를 못 찾았을 때만 pass. 승인을 정당화하지 말고 반증을 시도하라."* 4개 agent md는 `fanout-*.md` 구조(Prompt Defense Baseline + Hard Mandate + Lens + Return Contract) 그대로, `tools: [Read, Grep, Glob]`.
- **Mirror**: `lib/plan-fanout/perspectives.js:16-94`, `agents/fanout-architect.md`
- **Validate**: `node -e "require('./plugins/mccp/scripts/lib/plan-review/perspectives').REVIEW_PERSPECTIVES.length===4 || process.exit(1)"`

### Task 5: L2 — quorum 오라클
- **Action**: `quorum.js#decideQuorum({results, required, of, rolesMin, blockSeverity})` → `{passed, responded, roles, blockingFindings, reason}`. 규칙: 응답 수 ≥ `required`(default 3) ∧ 고유 역할 ≥ `rolesMin`(default 3) ∧ `verdict==='fail'`이거나 `severity ∈ {HIGH,CRITICAL}`인 finding이 **하나라도** 있으면 `passed=false`. `parseQuorum(env)`가 `MCCP_PLAN_REVIEW_QUORUM="3of4"` 파싱(오타 → default + loud warn, `verify.js#parseMergedVerifyMode` 미러).
- **Mirror**: `lib/implement-dispatch/verify.js:44-52`, `lib/implement-dispatch/result-schema.js#mergeVerdicts`(most-severe-first fail-closed 집계)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-quorum.test.js`

### Task 6: 3층 합성 오라클 + proof 조립
- **Action**: `decide.js#decideReview({l1, l2, l3, mode, dispatchEvidence, rounds})` → `{review_verdict, review_source, review_proof, block, reason, forwardCodexVerdict}`. `parseReviewMode(env)` — `codex|multi-agent|hybrid`, **미상 → `codex` + loud warn**(DD7). proof 조립은 이 오라클이 단독 소유(command body가 JSON을 손으로 짜지 않게).
- **합성표는 산문이 아니라 exhaustive match다** — `mode × l1 × l2 × l3` 전 조합을 열거하고 test가 전 행을 덮는다([verification-layer §4](../meta/verification-layer-design.md)):

  | mode | L1 | L2 | L3 | review_verdict | review_source | forwardCodexVerdict |
  |---|---|---|---|---|---|---|
  | 무관 | `inconclusive` (plan 판독 실패) | (미참조) | (미참조) | `unavailable` | `multi-agent` | false |
  | 무관 | fail | (미참조) | (미참조) | `divergent` | `multi-agent` | false |
  | 무관 | pass | pass, 단 `reviewed_plan_hash` 불일치 | (무관) | `unavailable` | `multi-agent` | false |
  | 무관 | pass | quorum 미달 | (미참조) | `divergent` | `multi-agent` | false |
  | 무관 | pass | 위조/누락/미응답 | (미참조) | `unavailable` | `multi-agent` | false |
  | `multi-agent` | pass | pass | 미발화 | `converged` | `multi-agent` | **false** |
  | `hybrid` | pass | pass | `converged` | `converged` | `hybrid` | **true** |
  | `hybrid` | pass | pass | `divergent`/`critical` | L3 verdict 그대로 | `hybrid` | **true** |
  | `hybrid` | pass | pass | **미실행/미가용/timeout** | `unavailable` | `multi-agent` | **false** |

  위 표에서 `hybrid` 요청 ∧ L3 미실행 행이 R1이 지적한 누락 분기다. `hybrid`를 요청했는데 L3가 못 돌았다면 그것은 **hybrid가 아니다** — `source`를 `hybrid`로 찍으면 dedupe가 cross-model 확증으로 오인해 skip을 허가한다(DD2 위반). 따라서 verdict는 `unavailable`(fail-closed HALT)이고 source는 정직하게 `multi-agent`이며 `codex_verdict`는 forward하지 않는다. "요청했다"와 "일어났다"를 구분하는 것이 이 행의 요점이다.
- **`forwardCodexVerdict`가 DD11의 집행자다**: command body는 셸 조건문으로 "hybrid인가? L3가 돌았나?"를 추론하지 **않는다** — 이 오라클의 불리언 하나만 읽는다. 셸에서 mode와 L3 결과를 각각 파싱해 AND를 취하는 설계는 정확히 v1.22.3 M3 4라운드가 잡은 실패 형태(`${VAR:-default}`가 LLM이 도달 못 하는 경로에서 잘못된 값을 commit)의 재현이다.
- **Mirror**: `lib/implement-dispatch/verify.js:169-216`(block matrix + `mk()` 헬퍼), `lib/implement-dispatch/result-schema.js#deriveVerdict`(다축 입력 → 단일 fail-closed verdict)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-decide.test.js` — 위 표 **7행 전수** + `forwardCodexVerdict`가 `hybrid ∧ L3 실행`에서만 true임을 단언

### Task 7: `plan-review/cli.js` — command-body seam
- **Action**: 서브커맨드 `mode`(해석된 모드 + 발화 계획 JSON) · `l1 --plan <path>` · `emit-workflow-args --plan --prd --fleet-keys`(**`reviewed_plan_hash`를 여기서 계산**해 args에 포함 — DD13) · `decide --l1-file --l2-file [--l3-file] --evidence ...`(proof·verdict JSON stdout) · `verify-proof --proof-file`(dispatch_evidence **경로 형식 + 실존** fs 검증 — DD5 caller 축). exit: 0=pass, 12=block(`EX_SHIP_BLOCKED` 어휘 재사용), 2=usage. tmp 경로는 `git rev-parse --git-path mccp/tmp`(worktree-safe).
- **입력 부재는 usage 오류가 아니라 block이다**: `decide`의 `--l1-file`/`--l2-file`이 존재하지 않거나 JSON parse에 실패하면 exit 2(usage)가 아니라 **exit 12 + loud stderr**로 처리한다. 아티팩트 부재는 "호출자가 플래그를 잘못 썼다"가 아니라 "**검증 결과를 모른다**"이며, 모르는 상태는 게이트에서 pass가 아니다. 같은 이유로 `verify-proof`도 파일 부재를 exit 12로 처리한다. exit 2는 순수 CLI 오용(알 수 없는 서브커맨드 등)에만 남긴다.
- **`l1` 서브커맨드는 "plan이 틀렸다"와 "plan을 못 읽었다"를 구분한다** (R2 지적): exit **0**=L1 pass · exit **1**=L1 `divergent`(위반 목록을 stdout JSON으로) · exit **12**=L1 **판정 불가**(plan 파일 부재/판독 실패/파서 throw). 셋 다 진행을 막지만 진단이 다르고, 특히 12는 "worktree race로 plan이 사라졌다" 같은 환경 문제를 가리켜 복구 지시가 달라진다. `checkPlanConsistency`는 **throw하지 않는다** — 내부 fs/parse 실패를 `{verdict:'inconclusive', violations:[{code:'E_READ',…}]}`로 반환하고 CLI가 이를 exit 12로 매핑한다(`design-grounding`의 `inconclusive` 처리와 동형: 읽기 실패는 silent no-op이 아니라 block). `decideReview`는 `inconclusive`를 `divergent`가 아니라 **`unavailable`** 로 합성한다 — "위반을 찾았다"와 "검사하지 못했다"는 다른 사실이다.
- **Mirror**: `lib/dispatch-cli.js`(서브커맨드 + exit 코드 분기), `commands/plan.md` Phase 2.5.1의 `node -e ... argv` 호출 규약
- **Validate**: `node plugins/mccp/scripts/lib/plan-review/cli.js l1 --plan .claude/plans/diverse-agent-review-m1.plan.md` → exit 0

### Task 8: `workflows/plan-review.js` — L2 병렬 발화
- **Action**: `plan-fanout.js` 구조 그대로. `args:{planPath, prdPath, fleetKeys, minRemaining}` → `parallel(fleet.map(agent(..., {agentType, effort:'low', schema:REVIEW_SCHEMA})))` → `{results, coverage, spent, skipped}`. `fleetKeys` 누락 시 **전 fleet 복원 금지**(단일 역할로 축소 + loud log) — cap 우회 방지. 샌드박스 `require` 부재 → CATALOG/SCHEMA/프롬프트는 Task 4 lib의 faithful 포트 + "동기화 유지" 주석.
- **Mirror**: `scripts/workflows/plan-fanout.js:167-233`
- **Validate**: `node --check plugins/mccp/scripts/workflows/plan-review.js`

### Task 9a: 판정 소비처 계승 — 게이트 4곳
- **Action**:
  (a) `receipt-convergence.js` — `isConvergedVerdict`/`isDivergentVerdict`가 `resolveEffectiveVerdict` 위임. `review_*` absent면 기존 판정 **byte-동등**.
  (b) `dedupe.js#codexConverged` → `crossModelConverged`(DD2: verdict==='converged' ∧ source ∈ `CROSS_MODEL_SOURCES`). `convergence` 블록에 `review_source` 노출(감사 투명성). 기존 export 이름은 별칭으로 유지.
  (c) `pr-ship-gate.js#classifyVerdict` — helper 경유 + DD8 source 게이팅(`multi-agent-unproven-at-terminal`).
  (d) `completion-ledger/index.js` — 승인 술어를 helper로, `verdict_provenance`를 실제 source로. **`store.js`의 `VALID_PROVENANCE`를 같은 커밋에서 additive 확장한다**(`multi-agent`/`hybrid` 추가, 기존 3값 유지) — 확장 없이 index.js만 바꾸면 `writeEntry`의 enum `req()`가 신규 엔트리를 거부한다. 기존 git-tracked 엔트리는 값이 그대로라 재키잉 불필요(§3.12).
  단 M1에서 이 경로가 실제로 발화하지 않음도 함께 기록한다: ledger는 **ship receipt(`mccp-pr-codex`)** 를 추적하고 M1은 pr-codex에 `review_*`를 쓰지 않으므로(DD8), provenance는 실측상 `codex-verdict`로 남는다. 즉 이 변경은 **방어적 선행**이며, 그래서 test는 "신규 provenance 값이 `writeEntry`를 통과한다"를 직접 단언해야 한다(발화 경로가 없어 회귀로 잡히지 않으므로).
- **Mirror**: v1.22.5 M1 Task 1b sweep(같은 수술의 선례)
- **Validate**: 편집한 4개 파일에 **각각 대응하는** test를 모두 실행한다 — `node --test plugins/mccp/scripts/lib/tests/receipt-convergence.test.js plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js plugins/mccp/scripts/receipt/tests/dedupe.test.js` + completion-ledger 승인 술어 회귀(전용 test 파일이 없으면 `lib/tests/evidence-audit.test.js`가 ledger↔receipt 대조를 덮으므로 그것을 함께 실행하고, 없으면 Task 11에서 신규 작성한다). **"편집한 파일에 대응 test가 Validate 라인에 없다"는 상태를 남기지 않는다** — 이것이 R1 리뷰가 잡은 결함이다.

### Task 9b: 표면 소비처 계승 — 감사·write 3곳 (DD10: 렌더러 미변경)
- **Action**:
  (e) `evidence-audit.js` — `receiptVerdict`가 effective verdict를, `verdictsAgree`가 source를 함께 대조.
  (f) `derive/sources/receipts.js` — `review_verdict`/`review_source`를 projection에 **추가만**. `sections/*.js` 렌더러는 **손대지 않는다**(DD10). 회귀 증명: 기존 `.claude/cache/STATUS.md`를 재렌더해 diff가 비어 있어야 한다.
  (g) `write.js` — 신규 flag 5종 present-only stamping(값 없으면 **키 자체 omit**).
- **Mirror**: `write.js:147-157`(present-only omit), `derive/sources/receipts.js:42-47`(projection 주석 규약), `receipt/write.js#detectDispatchContext`(all-or-nothing 3-플래그 — DD11)
- **(g) write.js는 DD11 all-or-nothing + DD13 bind를 집행한다**: `--review-verdict` 공급 시 `--review-source` + `--review-proof-file` 필수. 하나라도 누락 → **exit 12 + loud stderr**, receipt 미작성(부분 stamp가 디스크에 남지 않는다). `--codex-verdict`는 Task 6 오라클의 `forwardCodexVerdict`가 true일 때만 전달되며, write.js는 `review_source='multi-agent'`와 `codex_verdict` present가 **동시에** 성립하면 exit 12로 거부한다(모순 receipt 차단). 추가로 봉인 직전 `review_proof.reviewed_plan_hash === plan_hash`(같은 write 호출에서 `planAwareMarkdownHash`로 방금 계산한 값)를 확인하고 불일치 시 exit 12 — 복구는 재봉인이 아니라 **L2 재실행**임을 stderr가 명시한다(DD13).
- **Validate**: `node plugins/mccp/scripts/derive/cli.js render && git diff --exit-code .claude/cache/STATUS.md` (DD10 무변경 증명) + `node --test plugins/mccp/scripts/receipt/tests/` + **`node --test plugins/mccp/scripts/lib/tests/evidence-audit.test.js`**(9b(e)가 편집하는 파일의 대응 test — `receipt/tests/` glob에 포함되지 않으므로 명시 필요) + `node plugins/mccp/scripts/receipt/cli.js status` smoke(multi-agent receipt에서 `codex_verdict` 칸이 crash 없이 빈 값으로 렌더 — DD12)

### Task 10: `commands/plan.md` Phase 5 재구성
- **Action**: Phase 5.2를 mode 분기로 교체.
  - `codex` 모드 → 현행 블록 그대로(변경 0).
  - `multi-agent`/`hybrid` → **5.2a** L1(`cli.js l1`, 실패 시 즉시 `divergent`·L2 미발화) → **5.2b** runaway `reserve`(DD9: `granted:0` → HALT) → **5.2c** `Workflow(plan-review.js)` → 결과 아티팩트 write → **5.2d** `reconcile --actual` (fan-out과 달리 **명시 commit 필수**) → **5.2e** `cli.js decide` → **5.2f** (hybrid만) codex-invoke L3 → **5.2g** `verify-proof`.
  - **5.2c의 실패 처리는 명시적이다 (게이트는 조용히 통과하지 않는다)**: Workflow가 throw하거나 이 install에 primitive가 없거나 결과가 판독 불가면, `plan-fanout`의 fail-open 강등과 **반대로** 동작한다 — fan-out은 GROUND 보강이라 인라인 fallback이 정답이지만 plan-review는 **게이트**다. 따라서: (1) Workflow 결과를 반드시 아티팩트 파일로 기록하고, (2) 아티팩트가 없거나 판독 불가면 5.2e의 `decide`가 `--l2-file` 부재로 **exit 12**(Task 7의 "부재=block" 규약), (3) command body는 exit 12를 HALT로 처리하고 receipt를 쓰지 않는다. 즉 "Workflow가 조용히 실패했다"와 "L2가 divergent였다" 둘 다 **진행 불가**로 수렴하며, 어느 쪽도 `converged` receipt를 만들 수 없다. HALT 메시지는 3가지 복구 경로(`MCCP_PLAN_REVIEW=codex` / 새 세션 / cap 상향)를 명시한다.
  - 5.6 receipt-write에 `--review-verdict/--review-source/--review-proof-file/--review-l3-invoked/--review-wall-clock-ms` forward(DD11 all-or-nothing — 셋 중 하나만 forward하는 분기를 만들지 않는다). `--codex-verdict`는 **Task 6 오라클의 `forwardCodexVerdict` 불리언이 true일 때만** forward한다 — command body가 mode·L3 결과를 각각 파싱해 셸에서 AND를 취하지 **않는다**(DD11).
  - 5.7 handoff 라인에 `review: <verdict> via <source> (<wall-clock>s)` 추가.
  - 하드코딩 플러그인 경로는 기존 관례대로 캐시 경로 유지 + 버전 문자열 일괄 갱신.
- **Mirror**: `commands/plan.md` Phase 2.5.1-2.5.3(reserve/reconcile 규약), `commands/work.md` Step 3.route(예약→route→commit 경계), `commands/work.md` Step 3.verify(게이트 HALT가 fail-open 강등과 다른 이유)
- **Validate**: `codex` 모드 동등성은 **자동 test로** 고정한다(수동 dry-run을 유일 증거로 두지 않는다 — R1 리뷰 지적). Task 11의 `plan-review-mode-rollback.test.js`가 (a) `MCCP_PLAN_REVIEW` 미설정/`multi-agent`/`hybrid`/오타(`cod-ex`)/`codex` 5입력에 대한 `parseReviewMode` 반환을 전수 단언하고, (b) `codex` 및 오타 입력에서 `decideReview`가 L2 관련 필드를 **전혀 생성하지 않음**(`review_*` 3필드 부재)을 단언한다. 여기에 수동 dry-run 1회를 보조 증거로 더한다.

### Task 11: 테스트 + corpus hash 안정성 + 문서·버전
- **Action**: 신규 test 6종 작성, 기존 3종(dedupe/pr-ship-gate/receipt-convergence) 확장. `plugin.json` `1.23.0 → 1.23.1`, `CHANGELOG.md` row, `CLAUDE.md` §4 토글 **4종**(`MCCP_PLAN_REVIEW`, `MCCP_PLAN_REVIEW_QUORUM`, `MCCP_PLAN_REVIEW_ROLES_MIN`, `MCCP_PLAN_REVIEW_L3` — `## Operating Toggles` 표가 SSoT이고 `MCCP_PLAN_REVIEW_L1`은 **만들지 않는다**) + §1.4 표 row, PRD Milestone 1 `in-progress → complete`.
- **리뷰가 요구한 8개 단언은 "주장"이 아니라 test로 존재해야 한다**(1-5=R1, 6-8=R2 및 자체 발견):
  1. **legacy byte-동등**(B-C3) — `review_*` 3필드가 전부 absent인 실-producer receipt에 대해 `isConvergedVerdict`/`isDivergentVerdict`가 `codex_verdict` ∈ {`converged`,`divergent`,`critical`,`unavailable`,`skipped`, absent} × `converged` ∈ {true,false} 전 조합에서 **위임 전 값과 동일**함을 단언. 위임이 legacy 판정을 바꾸면 escalate-detector·briefing·derive가 전부 조용히 어긋난다.
  2. **helper 전이성**(DD12 1행) — `receipt-convergence`를 경유하는 3개 소비처(`derive/sources/worktrees.js`·`lib/briefing/invoke.js`·`lib/escalate-detector.js`)가 `review_verdict='divergent'`+`converged:true` receipt에서 **non-converged로 판정**함을 단언. "helper 위임이니 자동으로 된다"는 주장 자체를 test로 고정한다.
  3. **DD2 mechanical**(B-C1) — plan+implement 양쪽 receipt가 `review_verdict='converged'`/`review_source='multi-agent'`일 때 `evaluateForDedupe`의 `skip_safe===false`. 추가로 `review_source='multi-agent'`인데 `codex_verdict='converged'`가 함께 있는 **모순 receipt**가 schema/write에서 거부됨을 단언(DD11).
  4. **mode rollback**(신규 `plan-review-mode-rollback.test.js`, F4) — Task 10 Validate 참조.
  5. **wall-clock stamp 실재**(B-crit8) — receipt에 `meta.review_wall_clock_ms`가 non-negative int로 실제 기록됨을 단언(계측을 약속만 하고 필드가 비는 상태 차단).
  6. **DD13 artifact bind**(R2 자체발견) — 시나리오를 단계까지 명시한다(R3 Reviewer F 요청): (a) `emit-workflow-args`가 plan의 `hash_v1`을 계산해 workflow args에 실어보낸다 → (b) Workflow(L2) 발화 → (c) plan을 1바이트 수정해 `hash_v2`가 된다 → (d) `decide`가 `hash_v1`을 담은 proof를 산출 → (e) `write.js`가 봉인 시점에 `plan_hash=hash_v2`를 계산 → (f) `hash_v1 !== hash_v2` → `decideReview`는 `converged` 대신 `unavailable`, `write.js`는 **exit 12**. test는 (a)~(f) 전 단계를 실제로 materialize한다(불일치를 손으로 주입하는 mock이 아니라 실제 편집으로).
  7. **provenance enum 통과**(자체발견) — `verdict_provenance='multi-agent'`/`'hybrid'` 엔트리가 `store.js#writeEntry`를 통과함을 직접 단언(M1에 발화 경로가 없어 회귀로는 잡히지 않으므로 명시 test 필수).
  8. **meta 6필드 hash 반영**(R2 MEDIUM-2) — 기존 receipt는 6필드 부재로 `receipt_hash` 불변 ∧ 신규 receipt는 `meta.review_*` 변경이 `receipt_hash`를 바꿈(carve-out 부재 증명, DD6).
- **corpus hash test**: git-tracked `.claude/receipts/mccp-pr-codex/*.json` 전량에 대해 `receiptHash(receipt) === receipt.receipt_hash` 재계산 일치 + `review_*` 키 부재 단언(DD6 증명).
- **Mirror**: `lib/tests/pr-ship-gate.test.js:20-34`(실-producer shape 재현), §3.7 버전 체크리스트
- **Validate**: 아래 Validation 블록 전량

## Validation

```bash
# 신규 오라클 단위
node --test plugins/mccp/scripts/lib/tests/review-verdict.test.js
node --test plugins/mccp/scripts/lib/tests/plan-review-l1.test.js
node --test plugins/mccp/scripts/lib/tests/plan-review-quorum.test.js
node --test plugins/mccp/scripts/lib/tests/plan-review-decide.test.js

node --test plugins/mccp/scripts/lib/tests/plan-review-mode-rollback.test.js

# 회귀 — 소비처 계승이 기존 판정을 바꾸지 않았는가
node --test plugins/mccp/scripts/lib/tests/receipt-convergence.test.js
node --test plugins/mccp/scripts/lib/tests/pr-ship-gate.test.js
node --test plugins/mccp/scripts/receipt/tests/dedupe.test.js
node --test plugins/mccp/scripts/lib/tests/evidence-audit.test.js
node --test plugins/mccp/scripts/lib/tests/evidence-stage-guard.test.js

# 전체 스위트 (pre-existing 실패 2건 제외 — Open Questions 참조)
node --test plugins/mccp/scripts/lib/tests/
node --test plugins/mccp/scripts/receipt/tests/

# git-tracked ship corpus hash 무변경 (Success Metric 5)
node --test plugins/mccp/scripts/lib/tests/review-verdict-corpus-hash.test.js
node plugins/mccp/scripts/lib/evidence-audit.js --json

# 문법
node --check plugins/mccp/scripts/workflows/plan-review.js

# L1 자기적용 (이 plan 자신을 L1에 통과시킨다)
node plugins/mccp/scripts/lib/plan-review/cli.js l1 --plan .claude/plans/diverse-agent-review-m1.plan.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **multi-agent 승인이 dedupe를 만족시켜 PR-Codex까지 skip → cross-model 전면 소실** | Medium | **DD2** — dedupe 술어에 `source ∈ {codex,hybrid}` 요구. multi-agent 경로는 `codex_verdict`를 아예 안 쓰므로 자동 fail-closed. `dedupe.test.js`에 명시 회귀 |
| same-model L2가 correlated → self-approval | Medium | L1 gatekeeper 선행(DD3) + 역할 다양성 K≥3 강제 + refute-only framing(승인은 증거 부재로만) + `review_proof` fail-closed. 잔여는 L3 hybrid로 흡수 |
| `review_proof`가 controller-authored 아티팩트라 위조 가능 | Medium | M1은 (a) runaway 예약 id(락 보호·LLM 미저작 카운터) + (b) 결과 아티팩트 실존을 `verify-proof`로 fs 검증. **정직한 한계**: 각 agent verdict 내용의 hash-bind는 미구현 → Open Question(M2) |
| 기존 tracked ship corpus `receipt_hash` 변동(재봉인 사고) | Low | present-only + `makeSkeleton` 미materialize + hash carve-out 추가 금지 + 전량 재계산 test(Task 11) |
| default 플립이 plan 게이트 동작을 조용히 바꿈 | Medium | `MCCP_PLAN_REVIEW=codex` 정확 롤백 + **미상 값 → codex**(DD7) + 발화 시 loud stderr 1줄 |
| runaway cap 소진으로 plan 게이트가 HALT | Low | DD9 — 조용한 약화 대신 명시 HALT + 3가지 복구 경로 안내(신규 세션 / cap 상향 / `=codex`) |
| 목표 10분 미달(L2 4병렬이 느림) | Medium | `effort:'low'` + read-only 4에이전트 병렬 + L1 short-circuit. `meta.review_wall_clock_ms` 계측으로 실측 후 M2에서 역할 수/effort 조정 |
| Workflow 미가용 install에서 L2 불가 | Low | `decideReview`가 `unavailable` → HALT + `=codex` 안내(fail-closed). fan-out과 달리 게이트이므로 조용한 fallback 금지 |
| 신규 verdict 어휘(`multi-agent`)·`review_source` 뱃지가 대시보드 신호색/어휘 예산을 잠식 | Medium | **DD10 no-render 계약** — M1은 derive projection까지만. renderer section 파일 변경 0 + STATUS.md 재렌더 diff 공집합을 Task 9b가 mechanical 증명. 표시 설계는 별도 디자인 사이클 |
| **`review_*` 부분 stamp가 `codex_verdict` fallback을 유발 → dedupe가 cross-model 확증으로 오인** | Medium | **DD11 all-or-nothing** — schema + `write.js` 양쪽에서 3필드 동반 강제(exit 12), `source='multi-agent' ∧ codex_verdict present` 모순 receipt 거부. Task 11(3)이 mechanical 단언 |
| `hybrid` 요청했으나 L3가 못 돌았는데 `source='hybrid'`로 봉인 → dedupe skip 허가 | Medium | Task 6 합성표 마지막 행 — L3 미실행은 `unavailable`/`multi-agent`이며 `forwardCodexVerdict=false`. "요청"과 "실행"을 구분 |
| helper 위임이 legacy receipt 판정을 조용히 변경 → escalate/briefing/derive 동시 오작동 | Medium | Task 11(1) legacy byte-동등 전조합 test + Task 11(2) 전이성 test. "위임이니 자동으로 된다"를 주장이 아니라 test로 고정 |
| `dispatch_evidence`에 절대경로가 실려 tracked corpus로 유출 | Low | Task 1 구조 불변식이 repo-relative를 강제(절대경로·드라이브 문자·`..` 거부) + `verify-proof`가 재확인. §3.12 `v1.22.4-cwd-rebind` 선례 재발 방지 |
| Workflow throw가 조용한 게이트 통과로 이어짐 | Low | Task 10 5.2c — 아티팩트 부재 → `decide` exit 12 → HALT. fan-out의 fail-open 강등과 **의도적으로 반대**(게이트 vs 보강) |
| **신규 `verdict_provenance` 값이 ledger `writeEntry` enum 검증에 거부돼 append 실패** | Medium | `store.js:37` `VALID_PROVENANCE`를 Task 9a(d)와 **같은 커밋에서** additive 확장 + 신규 값이 `writeEntry`를 통과함을 직접 단언(M1에 발화 경로가 없어 회귀로는 잡히지 않음) |
| **L2가 읽은 plan과 봉인된 plan이 달라 proof가 무효 아티팩트를 증명** | **High** | **DD13** — `reviewed_plan_hash`를 proof 필수 필드로 bind + `decideReview`·`write.js` 이중 확인(불일치 → `unavailable`/exit 12). 복구는 재봉인이 아니라 L2 재실행. **본 사이클 santa-loop R2에서 실제 발생한 실패 모드**(§Review Gate R2 caveat) |
| L1 판독 실패를 "위반 없음"으로 오해석 | Low | Task 7 — `l1` exit 1(divergent) ≠ exit 12(inconclusive), `checkPlanConsistency`는 throw 대신 `inconclusive` 반환, `decideReview`가 이를 `unavailable`로 합성(`divergent` 아님) |

## Open Questions

- [ ] **proof 위조 방지 강도(M2)** — 각 perspective의 verdict 내용까지 `review_proof`에 hash-bind할지, Workflow 런타임 journal(`journal.jsonl`)을 mechanical anchor로 승격할지. M1은 경로 실존 + 예약 회계까지만.
- [ ] **self-consistency 샘플 수** — M1은 역할 다양성(4역할 × 1샘플)만 diversity 축으로 쓴다. 동일 질문 N회 독립 샘플 majority는 wall-clock 비용 때문에 M2로 이연 — `decideQuorum`이 역할당 복수 verdict를 받도록 시그니처만 열어둔다.
- [ ] **L3 자동 트리거 조건(M2)** — M1은 `MCCP_PLAN_REVIEW=hybrid` 수동 opt-in + `meta.review_l3_invoked` 계측만. 임계는 M1 실측 후 결정.
- [ ] pre-existing 실패 2건(`design-critique-loop-e2e` fixture 부재, `verdict-label.test.js`)은 본 cycle 범위 밖 — 별도 사이클 유지.

## Acceptance

- [ ] Task 1-11 완료 (Task 9는 9a/9b로 분할)
- [ ] DD10 no-render 계약 — renderer `sections/*.js` 변경 0 + STATUS.md 재렌더 diff 공집합
- [ ] Validation 전량 통과 (pre-existing 2건 제외)
- [ ] `MCCP_PLAN_REVIEW=codex`에서 v1.23.0 판정 byte-동등 (회귀 0) — **자동 test로** 증명, 수동 dry-run은 보조 증거
- [ ] 오타 mode(`cod-ex`)에서 multi-agent가 발화하지 **않음**을 test가 증명 (DD7)
- [ ] multi-agent converged가 cross-gate dedupe를 만족시키지 **못함**을 test가 증명 (DD2)
- [ ] `review_*` 부분 stamp가 receipt write에서 거부됨 + `source='multi-agent' ∧ codex_verdict present` 모순 receipt 거부 (DD11)
- [ ] legacy receipt(`review_*` absent) 판정이 위임 전후 동일 + helper 경유 3개 소비처 전이성 (Task 11(1)(2))
- [ ] DD12 표의 비편집 모듈이 각각 "자동 계승 / out of scope / 확인 완료"로 분류돼 있고 침묵 항목 0
- [ ] DD13 — `reviewed_plan_hash` 불일치 시 `converged` 발급 불가 + `write.js` exit 12 (plan 1바이트 수정 후 재봉인 실패 시나리오 test)
- [ ] `verdict_provenance='multi-agent'`/`'hybrid'`가 ledger `writeEntry`를 통과 (`store.js` enum 확장 완료)
- [ ] `## Operating Toggles` 4종이 CLAUDE.md §4에 default·의미까지 mirror됨 (`MCCP_PLAN_REVIEW_L1`은 **만들지 않음**)
- [ ] `meta.review_*` 3필드가 `hash.js` carve-out에 **없음**(DD6) — 기존 hash 불변 ∧ 신규 hash 반영 양방향 단언
- [ ] git-tracked ship corpus 전량 `receipt_hash` 재계산 일치 + `review_*` 키 부재 (DD6)
- [ ] plan 게이트 wall-clock ≤ 10분 실측 1회 이상 (`meta.review_wall_clock_ms`)
- [ ] `plugin.json` 1.23.1 + `CHANGELOG.md` + `CLAUDE.md` §4/§1.4 동기화
- [ ] 패턴을 재발명하지 않고 mirror했는가 (receipt-convergence / verify.js / plan-fanout)

## Design Critique

디자인 게이트 발화 근거: `impeccable-detect --mode plan` → `design_signal=true`, `signal_files=[plugins/mccp/scripts/receipt/write.js, plugins/mccp/scripts/derive/sources/receipts.js]` (둘 다 `DESIGN_SURFACE_PATHS` 화이트리스트 — axis b). SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` 4종 Read 완료.

- **verdict**: `CONVERGED` (rounds 2 / cap 2)
- **Assessment A** (design review, sub-agent 미가용 → 문서화된 순차 fallback): 아래 3건
- **Assessment B** (deterministic detector, `detect.mjs .claude/cache/status.html`): exit 0, 2건 — `em-dash-overuse`(warning, 본문 7개) · `numbered-section-markers`(advisory, "06, 10, 11, 12"). **둘 다 본 plan이 도입한 것이 아니다** — plan은 renderer 코드를 변경하지 않으며(DD10), 검출된 숫자열은 eyebrow 스캐폴드가 아니라 derive된 milestone·버전 데이터다. 현 표면의 선재 항목으로 기록하고 본 사이클 범위 밖으로 둔다.

| # | Severity | Finding | 수정한 섹션 | R1 처리 |
|---|---|---|---|---|
| A1 | HIGH | `review_verdict`/`review_source`를 derive projection에 넣으면서 **렌더러가 이를 표시할지**를 plan이 정의하지 않음. 방치 시 (i) dead field 또는 (ii) 사용자가 본 적 없는 3번째 verdict 어휘가 예고 없이 화면 등장 — PRODUCT.md "Decisive: verdict는 명확한 1줄" 위반 | **Design Decisions**(DD10 신설) · **Files to Change** · **Tasks**(9b) · **Acceptance** | 흡수 — no-render 계약 명문화 + STATUS.md 재렌더 diff 공집합을 mechanical 증명으로 승격 |
| A2 | MEDIUM | `review_source` 뱃지가 화면당 강조색 1개 예산(Output Constraint 2) 침범 가능. DESIGN.md는 이미 신호색 5개 배정 | **Risks**(행 추가) · DD10 | 흡수 — DD10이 M1에서 표시 자체를 배제하므로 예산 미소비 |
| A5 | MEDIUM | Task 9가 서브항목 7개 — working-memory ≤4 초과(cognitive load) | **Tasks**(9a/9b 분할) | 흡수 — 판정 계승 4곳 / 표면 계승 3곳으로 분할, validate도 각각 분리 |

**False positive로 판정한 항목**: Output Constraint 4(한 화면 항목 수 상한)는 `Files to Change` 31행·`Tasks` 12개에 형식상 걸리지만, 이 제약의 적용 범위는 rendered surface(`.claude/cache/*.md` · css/tsx/html)이고 `.claude/plans/*.plan.md`는 generic `.md`로 **명시적 제외** 대상이다(CLAUDE.md §4 `MCCP_DESIGN_GROUNDING`). H15(heading depth ≤ 3)는 본 plan이 `###`까지만 쓰므로 통과.

**Persistence**: `.impeccable/critique/` 스냅샷 write는 생략했다. plan의 Files to Change에 없는 repo 아티팩트를 게이트 도중 만들지 않기 위함이며, critique.md가 persistence를 skip-가능 단계로 규정한다(detector는 실행했으므로 hard invariant 위반 아님).

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더 UI가 없어 **어떤 impeccable 명령도 invoke하지 않는다** — 아래는 구현자용 체크리스트다. DD10에 따라 M1 구현은 rendered surface를 만들지 않으므로 refine/simplify 계열은 실제로는 no-op으로 강등될 것이 예상된다(`renderingSurface=0`).

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

> **Codex는 이 사이클에서 발화하지 않았다.** 운영자 결정으로 **santa-loop 적대 dual-review가 대체 수행**됐다(아래 `## Review Gate — santa-loop 대체`). 이 섹션은 Codex 미수행의 기록이며, receipt는 `resolution.codex_verdict='unavailable'`로 **정직하게 봉인**된다 — `converged`로 재작성하지 않는다.

- 호출: `node <plugin>/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper)
- 시도 2회, 모두 `blocking=true`:
  | # | classification | durationMs | stderr |
  |---|---|---|---|
  | 1 | `timeout` | 900101 | `companion timed out after 900000ms` (focus 4항목 — cap 초과) |
  | 2 | `exit-nonzero` | 127883 | `codex app-server exited unexpectedly (exit 1)` (focus 2항목으로 축소 후에도 실패) |
- 3차 시도 미실시 — **운영자 보고 사용량 초과**. `codex-invoke`의 900s timeout이 Bash 도구 600s 상한을 초과하는 구조적 문제도 함께 작용한다.
- advisory 강등(`MCCP_ALLOW_CODEX_UNAVAILABLE`) 미적용 — 게이트가 스스로 켜지 않는다.

**운영자 결정 (2026-08-08): Codex 없이 진행한다.** 최초 receipt는 `codex_verdict='unavailable'` + `meta.advisory=true`로 봉인돼 `/mccp:prp-implement`를 blocking했다(`validate` reason: *"preceding gate ran in advisory mode — non-approving"*). 운영자가 이를 보고 **`MCCP_CODEX_DISABLED=1` 정책 채택**을 결정했으므로 receipt를 그 정책 하에서 재작성했다(`codex_verdict='skipped'` + `meta.codex_disabled=true` + `meta.advisory=false`). 두 사실은 모순이 아니다 — receipt는 게이트가 **운용된 정책**을, 이 본문은 그 정책을 채택한 **이유**(위 3회 실패 + 사용량 초과)를 기록하며 `plan_hash`가 둘을 묶는다. 감사자는 양쪽을 함께 읽는다.

**이 결정의 전 범위 (축소하지 않고 기록):** `MCCP_CODEX_DISABLED=1`은 implement 게이트만 여는 것이 아니다. terminal `/mccp:pr`의 ship gate(v1.23.0 M3)에서 `meta.codex_disabled`는 **sanctioned ship proof marker**이므로 `codex_verdict='skipped'`가 ship을 허가한다. 즉 **이 사이클은 cross-model 리뷰 0회로 ship된다.** 유일한 적대 리뷰 증거는 아래 santa-loop 기록(3라운드·6리뷰어·same-model)이며, 그것이 cross-model을 대체하지 못한다는 것은 §정직한 한계에 명시돼 있다. M1 구현이 지향하는 DD2("cross-model을 ship 지점으로 이동")는 **이 사이클에서는 실현되지 않는다** — Codex가 그 지점에서도 비활성이기 때문이다. 이는 본 PRD가 해결하려는 문제 자체의 현재 상태이고, 그 상태에서 내려진 의도적 trade-off다.

**이 사이클의 dual-review 불변식은 어떻게 유지되는가 (핵심):**

`codex_verdict='unavailable'`이므로 [dedupe.js:372 `codexConverged`](../../plugins/mccp/scripts/receipt/dedupe.js)가 **fail-closed** → cross-gate dedupe가 skip을 허가하지 못함 → terminal `/mccp:pr`에서 **PR-Codex가 반드시 발화**한다. 즉 cross-model 리뷰는 *제거*된 것이 아니라 *ship 지점으로 이동*했다 — 이것은 우연이 아니라 본 plan **DD2가 설계한 그 메커니즘이며, 이번 사이클이 그 첫 실사용 사례다**. 따라서 M1을 구현하려면 `/mccp:pr` 게이트에서 PR-Codex를 실제로 통과시켜야 하고, Codex 사용량이 회복되지 않으면 그 지점에서 다시 막힌다(정직한 잔여 제약, 우회 아님).

> 부수 관찰(본 PRD와 직결): 이 사이클 자체가 PRD Evidence *"Codex 미가용 빈도"* 항목의 실측 데이터 3건이다 — timeout(15분 cap 소진) → app-server crash → 사용량 초과. 본 milestone이 해결하려는 문제가 이 게이트에서 그대로 재현됐고, 대체 경로(santa-loop)로 실제 적대 리뷰를 받아 결함 10건을 흡수한 것이 **hypothesis에 대한 약한 긍정 증거** 1건이다. "약한"인 이유는 아래 §정직한 한계 참조.

## Review Gate — santa-loop 대체 (Codex 미가용)

- 방식: [`/mccp:santa-loop`](../../plugins/mccp/commands/santa-loop.md) Step 3의 **Reviewer B = Claude Agent fallback** 경로. 두 리뷰어를 동일 rubric(8 criteria)으로 병렬·무공유 컨텍스트 실행.
  - Reviewer A: `mccp:code-reviewer` (Opus)
  - Reviewer B: `mccp:silent-failure-hunter` (Opus) — 동일 모델 계열이지만 **다른 system prompt/렌즈**로 persona diversity 확보
- rubric 8축: 인용 정확성 · 불변식 보존 · 내부 정합 · 소비처 완전성 · 보안 · silent failure · 회귀 위험 · 실현가능성
- **Round 1 결과: 양쪽 FAIL → NAUGHTY.** A = CRITICAL 3 + HIGH 3, B = CRITICAL 3 + 8축 중 7축 FAIL.

### YAGNI Triage (R1)

| # | Severity | Finding | Verdict | 근거 |
|---|---|---|---|---|
| F1 | HIGH | verdict 소비처 19개 중 7개만 편집, 나머지 12개에 대한 scope 선언 부재 | ACCEPT_NOW | 침묵은 "빠뜨림"과 "의도"를 구분 불가 → **DD12** 신설(3분류 표 + 5개 개별 판단) |
| F2 | HIGH | `review_*` **부분 stamp** 시 `codex_verdict` fallback → dedupe가 cross-model로 오인 | ACCEPT_NOW | DD2의 유일한 진짜 구멍. 술어가 아니라 stamp 원자성 문제 → **DD11** all-or-nothing(schema+write exit 12) |
| F3 | HIGH | Workflow throw/미가용 시 게이트가 조용히 통과할 경로 + `decide` 입력 부재 처리 미정의 | ACCEPT_NOW | Task 7 "부재=exit 12" 규약 + Task 10 5.2c 명시 실패 처리. fan-out fail-open과 **의도적 반대** |
| F4 | HIGH | `MCCP_PLAN_REVIEW=codex` 롤백 증명이 **수동** dry-run 단독 | ACCEPT_NOW | 게이트 롤백 축을 수동 증거에 맡기지 않음 → `plan-review-mode-rollback.test.js` 신설 |
| F5 | MEDIUM | `dispatch_evidence` 경로 형식 미정의 → 절대경로 유출 가능 | ACCEPT_NOW | §3.12 `v1.22.4-cwd-rebind` 선례. Task 1 구조 불변식에 repo-relative 강제 편입 |
| F6 | MEDIUM | Task 9a/9b가 편집하는 파일에 대응 test가 Validate 라인에 없음(ledger, evidence-audit) | ACCEPT_NOW | 실측 확인: `evidence-audit.test.js`는 `lib/tests/`에 있어 `receipt/tests/` glob에 미포함 |
| F7 | MEDIUM | Task 6 합성표에 `hybrid` 요청 ∧ L3 미실행 분기 부재 | ACCEPT_NOW | "요청"≠"실행". 표를 7행 exhaustive match로 승격 + `forwardCodexVerdict` 반환 |
| F8 | MEDIUM | DD7 문장이 문법적으로 파손("`codex`+warn으로 fail-closed 하지 않는다") | ACCEPT_NOW | fail-closed 축의 지시문 모호성은 구현 오류로 직결 → 재작성 + `verify.js` 파서와 방향이 다른 *이유* 명시 |
| F9 | MEDIUM | legacy receipt byte-동등 + helper 전이성이 **주장**으로만 존재 | ACCEPT_NOW | Task 11(1)(2)로 test 승격 — "위임이니 자동으로 된다"를 mechanical 단언으로 |
| F10 | LOW | L1에 markdown 구조 정합 검사 부재(Task heading 중복 등) | ACCEPT_NOW | C7 추가(1줄 비용) |
| — | — | A-C1 "`review_proof` 구조 미정의" | **REJECT** | 사실 오류. Task 1이 8개 구조 불변식을 명시 열거하고 Task 2가 그 오라클을 재사용한다고 이미 기술 |
| — | — | A-C2 "L1 호출이 Task 10에 미표시" (CRITICAL 주장) | **REJECT** | 사실 오류. Task 10이 `cli.js l1`을 명명하고 Task 7이 exit 코드를 정의. 잔여(exit 분기 산문)는 F3에 흡수 |
| — | — | B "verify-proof exit 미정의 / 부분응답 처리 부재 / env parse warn 부재" | **REJECT** | 3건 모두 기존 Task 7·5·6에 이미 존재 |
| — | — | A "L1/L2 wall-clock 비용 미산정" | DEFER_TO_BACKLOG | Acceptance가 이미 실측 1회를 요구. 세밀한 costing은 M2 튜닝 입력 |
| — | — | A-C3 "plan-codex 게이트 미통과" | 조건으로 이관 | 위 §Codex Adversarial Review — 사실이며 본 대체 리뷰의 존재 이유. `unavailable` 봉인으로 정직 처리 |

### Round 2 (fresh 리뷰어, 다른 렌즈 — 흡수 검증 포함)

- Reviewer C: `mccp:code-reviewer` (Opus) — rubric에 **"흡수 주장 F1-F10을 독립 검증하라. `ACCEPT_NOW`라고 적혀 있다는 이유로 해소된 것으로 취급하지 말라"** 를 명시(이 프로젝트의 최빈 결함이 "기록은 흡수, 실물은 구설계"이므로 anchoring 위험을 검증 과제로 전환)
- Reviewer D: `mccp:architect` (Opus) — verdict 추상화 건전성 · 신뢰 경계 · 계층 단조성 · 혼합 corpus 이행 · 되돌림 가능성 렌즈
- **결과: C = PASS(8/8), D = FAIL → NAUGHTY.** C는 F1-F10 흡수를 전수 확인. D는 4건(HIGH 1 + MEDIUM 3) 제기.

| # | Severity | Finding | Verdict | 근거 |
|---|---|---|---|---|
| G1 | MEDIUM | 토글 5종의 **default·의미·상호작용** 미명시(D는 "이름조차 없다"고 했으나 이름은 L226에 있었음 — 부분 오류) | ACCEPT_NOW | 잔여가 유효. 신규 `## Operating Toggles` 표로 계약 고정 + **`MCCP_PLAN_REVIEW_L1` 삭제**(L1은 DD3 gatekeeper라 off 경로 자체를 두지 않음) → 5종에서 **4종**으로 |
| G2 | MEDIUM | `meta.review_*` 3필드의 hash carve-out 여부 미명시 | ACCEPT_NOW | 실측: `hash.js:204-222` carve-out은 briefing 4종 + `ledger_write_skipped`뿐 → 신규 6필드 전부 봉인 대상. DD6에 근거(briefing은 write **후** stamp라 carve-out, `review_*`는 write **시점** 확정)까지 명문화 |
| G3 | MEDIUM | L1의 "위반 발견" vs "판정 불가"(plan 판독 실패) 미구분 | ACCEPT_NOW | `l1` exit 0/1/12 + `checkPlanConsistency`는 throw 대신 `inconclusive` 반환 + `decideReview`가 이를 `divergent` 아니라 **`unavailable`** 로 합성 |
| G4 | **HIGH** | **(자체 발견, 리뷰어 4명 전원 미포착)** L2가 읽은 plan과 `plan_hash`가 봉인하는 plan이 다를 수 있음 | ACCEPT_NOW | **DD13** 신설 — `reviewed_plan_hash` bind + 이중 확인. 아래 방법론 caveat이 실증 |
| — | — | D "토글 이름이 어디에도 없다" | **REJECT(부분)** | L226이 5종 전부 명명. 잔여(default·의미)만 G1로 수용 |
| — | — | D suggestion 5 "DD8 verdict가 Task 9a(c)에 미기술" | **REJECT** | L122(DD8 본문) + L199(Task 9a(c))에 `multi-agent-unproven-at-terminal` 명시 |

### R2 방법론 caveat — 그리고 그것이 DD13을 낳았다

**나는 R2 리뷰어를 띄운 뒤 플랜을 편집했다.** provenance enum 결함(자체 발견)을 R2 실행 중에 흡수했으므로, **Reviewer C의 PASS는 그 수정을 포함하지 않은 버전에 대한 판정**이다. C의 흡수 검증(F1-F10)은 발화 전에 완료된 편집만 다루므로 유효하지만, PASS 자체를 "현재 플랜 전체에 대한 승인"으로 읽으면 안 된다.

이 실수가 곧 **DD13**이다. 사람이 6개 에이전트를 손으로 조율하면서도 검토 대상을 동결하지 못했다면, 같은 구조를 자동화한 L2에서는 반드시 재현된다 — 그리고 자동화된 버전은 `review_proof`가 "4관점 quorum 통과"라고 주장하는데 그 주장이 봉인된 plan에 대한 것이 아닌 상태를 **조용히** 만든다. R3는 플랜을 **동결한 상태로** 실행한다.

**자기적용 L1 실측(R1 부산물)**: 프로토타입 체커를 이 plan에 돌려 C1-C6을 검사한 결과, `Files to Change` 32행 전부 repo-root full 경로(C2 통과)·Task 12개 전부 `**Validate**` 보유(C4 통과)였고, **약칭 인용 오탐 4건**이 나왔다 — 이것이 Task 3의 C6 base-resolution 요구사항의 실측 근거다.

### Round 3 (플랜 동결 후 — cap 도달, NAUGHTY 착지)

R2 caveat을 교정해 플랜을 git blob `33a039e4a82894e61db439bc0a2f49e2a8f6f3e6`으로 **동결**하고 실행했다. 두 리뷰어 모두 시작 시 `git hash-object`로 동결 hash를 **검증**했다(`frozen_hash_verified: true`) — DD13의 자기적용.

- Reviewer E: `mccp:code-reviewer` (Opus) — **FAIL**, MEDIUM 1건. 인용 정확성 · 불변식 보존 · 보안 · silent failure · 회귀 · 실현가능성 **6축 PASS**
- Reviewer F: `mccp:silent-failure-hunter` (Opus) — **PASS**, 8축 전부. silent-failure 20여 경로를 열거해 "조용한 pass 경로 없음" 확인
- **판정: NAUGHTY (E FAIL). santa-loop cap 3라운드 도달 → 재실행 없이 잔여 보고 후 종료. push 없음.**

| # | Severity | Finding | Verdict | 근거 |
|---|---|---|---|---|
| H1 | MEDIUM | **토글 개수 모순** — Operating Toggles 표(4종) ↔ Acceptance("4종, L1 미생성") ↔ Task 11(5종, `MCCP_PLAN_REVIEW_L1` 포함) | ACCEPT_NOW | **이 프로젝트의 signature 결함을 controller가 직접 재현했다** — DD/표는 갱신하고 Task row는 옛 설계를 그대로 둔 것. R1/R2 리뷰어에게 찾으라고 지시한 바로 그 패턴 |
| H1-ext | MEDIUM | (자체 스캔으로 확장) 같은 drift가 **3곳**: L65 Files to Change `CLAUDE.md` row "5종" · Task 11 Action "5종+L1" · Task 11 단언 헤더 "5개"(실제 8개) | ACCEPT_NOW | E는 1곳만 지적. 동일 클래스를 전수 스캔해 3곳 정정 |
| H2 | LOW | `reviewed_plan_hash`의 **계산 지점**이 DD13에 암시만 됨 (F suggestion 2·3) | ACCEPT_NOW | `emit-workflow-args`로 명시 + "`decide` 시점 계산은 불일치를 스스로 지운다"는 이유 기록 + test 시나리오 (a)~(f) 단계화 |
| — | — | F "Files to Change 31행" | 무시 | 실제 36행. 무해한 계수 착오 |

**post-R3 편집의 정직한 caveat**: 위 4건은 R3 **이후에** 적용됐으므로 **최종 텍스트는 어떤 리뷰어도 검증하지 않았다**. 다만 (a) H1/H1-ext는 이미 리뷰된 설계 의도(4종·L1 미생성 — F가 L154를 명시 PASS)에 텍스트를 맞추는 정합 수정이고, (b) H2는 F가 직접 요청한 명시화다. 설계 변경은 0이다. 그럼에도 "검증된 hash"는 `33a039e4`이고 최종 hash는 다르다 — 이 구분을 지우지 않는 것이 DD13의 취지다.

**수렴 신호**: severity가 R1(CRITICAL 6·HIGH 3) → R2(HIGH 1·MEDIUM 3) → R3(MEDIUM 1·LOW 1)로 단조 감소했고, R3의 잔여는 전부 controller의 흡수 편집이 만든 텍스트 drift이지 설계 결함이 아니다. 그러나 **both-NICE 착지는 아니다** — cap 도달 착지이며, 그 사실을 receipt와 이 기록이 함께 봉인한다.

### 정직한 한계 (santa-loop 대체의 잔여 리스크)

1. **cross-model이 아니다.** 두 리뷰어 모두 Claude Opus다. [arXiv:2507.11198](https://arxiv.org/abs/2507.11198) 기준 same-model persona 상관은 0.4(cross-model 0.08) — 공유 맹점이 남는다. 이번 라운드에서 두 리뷰어가 **A-C1/A-C2를 서로 다르게 틀렸다**는 점(A는 plan을 오독, B는 다른 축을 오독)은 persona diversity가 0은 아니라는 증거이나, 동시에 **양쪽 모두 플랜 본문을 정확히 읽지 못한 사례가 있었다**는 점은 same-model 취약성의 직접 증거다.
2. **santa-loop은 receipt를 발행하지 않는다.** [schema.js](../../plugins/mccp/scripts/receipt/schema.js) `GATE_IDS`에 santa-loop 게이트가 없다. 따라서 이 리뷰는 `mccp-plan-codex` receipt의 **`converged` 근거가 될 수 없고**, 실제로 그렇게 쓰지 않는다(`codex_verdict='unavailable'`).
3. **본 plan이 제안하는 L1/L2 자체는 아직 존재하지 않는다.** 이번 대체 리뷰는 L2의 *수동 프로토타입*이지 M1 산출물이 아니다. quorum·proof·회계 어느 것도 mechanical하게 강제되지 않았다.

## Codex Implementation Review

- 호출: `node <plugin>/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 결과: `classification=disabled` · `blocking=false` · `durationMs=0` — **`MCCP_CODEX_DISABLED=1` env policy에 의한 v0.3.5 first-class skip**(spawn 직전 short-circuit). 이 정책은 plan 게이트에서 운영자가 채택했고(§Codex Adversarial Review), implement 게이트도 같은 정책 하에서 운용된다.
- 라운드 수: 0 (Codex 미발화)
- `CODEX_VERDICT=skipped` — receipt에 `resolution.codex_verdict='skipped'` + `meta.codex_disabled=true`로 정직하게 봉인. `converged`로 재작성하지 않는다.
- 합치 결론: **Codex 발화 없음.** 아래 `### Security Reviewer`가 이 사이클의 유일한 게이트-내 적대 검토이며, **cross-model이 아니다**(Opus). plan 게이트의 santa-loop 3라운드와 같은 한계를 공유한다.

### 2.5.2 — implement-time 신규 결정 (Codex focus로 제출됐으나 미발화)

plan이 pre-commit하지 않은 구현 시점 결정 6종:

1. `review-verdict.js`를 승인 판독 **단일** SSoT로 두고 우선순위를 `review_verdict` > `codex_verdict`로 고정
2. dedupe skip 술어를 `source ∈ {codex,hybrid}`로 좁히는 지점 — `dedupe.js` 내부 helper 교체 vs 호출부 분기 (→ helper 교체, 기존 export 별칭 유지)
3. DD11 all-or-nothing을 schema·`write.js` **양쪽**에 이중 배치 (단일 locus 아님)
4. `reviewed_plan_hash` 계산 locus를 `emit-workflow-args`로 고정 (`decide` 시점 계산은 불일치를 스스로 지움)
5. L1 fs 접근을 주입 어댑터로 감싸 오라클 순수성 유지
6. `dispatch_evidence` 경로 형식 검증을 pure 오라클(형식)과 `verify-proof`(실존)로 분리

### Security Reviewer

`Task(security-reviewer)` 실행 — plan 본문 + 실제 repo 모듈(`receipt/{schema,write,dedupe,hash}.js`, `lib/{receipt-convergence,pr-ship-gate}.js`, `completion-ledger/store.js`)을 읽고 신뢰 경계 8축 검토. **판정: CRITICAL 0** (원문: *"No CRITICAL security defects found in the design ... The trust boundaries are well-designed"*).

| # | Severity | Finding | Verdict | 근거 |
|---|---|---|---|---|
| S1 | HIGH | `write.js`의 DD11 all-or-nothing 가드가 **실제 코드에 존재**해야 함 — 부분 stamp가 디스크에 남으면 trust boundary가 모호해짐 | ACCEPT_NOW | 플랜 DD11이 이미 규정. 설계 변경 0, 구현 필수 항목으로 Task 9b(g)에 고정 + Task 11(3) test. `write.js#detectDispatchContext` 3-플래그 패턴 미러 |
| S2 | HIGH | `write.js` 봉인 직전 `reviewed_plan_hash !== plan_hash` → **exit 12** + 복구 지시(재봉인 아니라 L2 재실행) | ACCEPT_NOW | 플랜 DD13이 이미 규정. Task 9b(g) 구현 + Task 11(6) 시나리오 (a)~(f)를 실제 편집으로 materialize |
| S3 | MEDIUM | 경로 오라클이 **UNC(`\\server\share`)·mixed separator(`a/b\c`)·정규화 순서**까지 덮어야 함 | ACCEPT_NOW | **플랜 미명시 신규 항목.** Task 1 구조 불변식을 확장: backslash 포함 경로·UNC prefix 거부 + 정규화 **후** 재검사. symlink 실효 해석은 `verify-proof`(fs 축) 소유 |
| S4 | MEDIUM | `store.js` `VALID_PROVENANCE` 확장을 index.js와 **같은 커밋**에 | ACCEPT_NOW | 플랜 DD12 마지막 표·Task 9a(d)에 이미 명시. 원자성 재확인 |
| S5 | MEDIUM | 전이성 test가 helper 단독이 아니라 **소비처 entry point를 실제 호출** | ACCEPT_NOW | 플랜 Task 11(2). "위임이니 자동" 주장을 mechanical로 고정 |
| S6 | MEDIUM | mode 오타 → `codex` + **stderr warn**을 test가 단언 | ACCEPT_NOW | 플랜 Task 11(4)/DD7. warn 문자열 match까지 포함 |
| S7 | LOW | `MCCP_PLAN_REVIEW_L1`을 만들지 않음을 코드·주석·문서 전반에서 유지 | ACCEPT_NOW | 플랜 L154/Acceptance에 이미 명시 |

- **HIGH 2건이 MCCP-GATE-STOP을 발동하지 않는 이유**: S1/S2는 *plan 설계의 결함*이 아니라 *구현이 그 설계를 실제로 담았는지*에 대한 요구다(reviewer 자신이 "implementation-correctness issues ... properly scoped in the plan's test/acceptance criteria"로 분류). R1 흡수로 완전 해소 가능하며 — 해소 수단은 Task 9b(g) 구현 + Task 11(3)(6) test — 미해소 잔여가 없으므로 escalate 조건 (b)를 만족하지 않는다. 다만 이 프로젝트의 signature 결함이 "기록은 흡수, 실물은 구설계"이므로, **두 가드는 test가 존재할 때만 흡수된 것으로 간주한다.**
- Deferred to backlog: 0
- Open Questions: 없음. plan의 M2 이연 항목(proof 위조 방지 강도)은 reviewer가 *acceptable residual risk*로 명시 판정했다.
- 라운드: R1 종료 (`MCCP_GATE_ROUND_CAP=1`, ACCEPT_NOW 잔여 0). Codex는 disabled라 R2 자체가 불가능하다.

### Design Review

impeccable `detect --mode implement` → `skill_available=true` · `design_signal=false` · `reason=no-signal` · `silent_skip=true`. EXECUTE 이전이라 diff가 비어 있어 rendered surface가 0이다. 플랜 DD10(no-render 계약)에 따라 M1 구현은 rendered surface를 만들지 않으므로 이 silent-skip은 예상된 결과이며, receipt에 `impeccable_silent_skip=true` + reason으로 정직하게 기록된다.
