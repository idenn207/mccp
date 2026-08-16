# Plan: santa-loop 실체화 — M2 (receipt 편입 + 소유권 표 산출)

**Source PRD**: `.claude/prds/santa-loop-materialize.prd.md`
**Selected Milestone**: 2 — receipt 편입 + 소유권 표 산출
**Complexity**: Medium

## Summary

M1이 라운드를 원장에 기록하는 데까지 냈고, M2는 그 집계값을 **`mccp-santa-review` receipt에 봉인**해 PRD 1순위 지표의 나머지 절반을 닫는다. 신규 GATE_ID는 `mccp-implement-verify` 선례를 그대로 따라 **produces-only**로 신설한다 — 어떤 command의 `produces`/`requires_preceding`에도 등재하지 않으므로 체인 차단 위험이 0이다.

두 번째 산출물은 **소유권 문서**다. P1(판정 계약)·P2(증거 다양성)·P3(델타 리뷰)가 손댈 파일 집합과 M1이 동결한 함수 시그니처를 명시해, 세 PRD가 같은 파일을 놓고 충돌하지 않고 병렬 착수할 수 있게 한다.

**승인축은 `review_source='multi-agent'`로 고정한다** (I4 문언). santa receipt는 review triple(`review_verdict` + `review_source` + `review_proof`)을 실으며, `gate_id === 'mccp-santa-review'`이면 `review_source`가 정확히 `'multi-agent'`여야 함을 schema가 강제한다. `codex`/`hybrid` 참칭은 그 불변식이 REJECT하고, `CROSS_MODEL_SOURCES`가 `multi-agent`를 배제하므로 dual-review 우회 위험은 0으로 유지된다.

## User Intent

<!-- PRD는 2026-08-12 사용자와 co-created 산출물이므로 그 Scope·Out of scope·Risk mitigation·
     승계 불변식(I3·I4·I6)은 사용자 발화 제약이다. 저자 정당화는 ## Design Decisions에만 둔다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 라운드 수와 원장 집계가 `mccp-santa-review` receipt에 봉인되어야 한다 | direction |
| UI2 | 어떤 command도 santa receipt를 `requires_preceding`에 넣지 않는다 | constraint |
| UI3 | santa verdict의 review_source는 multi-agent이며 codex나 hybrid를 참칭하지 않는다 | constraint |
| UI4 | 원장 본문은 gitignored로 두고 집계값만 receipt에 봉인한다 | direction |
| UI5 | P1과 P2와 P3가 소유할 파일 경계가 문서로 확정되어야 한다 | direction |
| UI6 | 소유권 산출물은 소유권 표와 함수 시그니처를 명시적으로 포함한다 | constraint |
| UI7 | 인터페이스 변경은 P0 재개로만 하며 자식 PRD가 임의로 바꾸지 않는다 | constraint |
| UI8 | severity 축 정의와 patch-chasing terminator는 P1 소유다 | exclusion |
| UI9 | 블라인드 레인과 스코프 확장은 P2 소유다 | exclusion |
| UI10 | 델타 스코프 계산은 P3 소유다 | exclusion |
| UI11 | GATE_ID 추가는 additive enum 확장이며 기존 receipt corpus 전수 validate를 acceptance에 포함한다 | constraint |
| UI12 | multi-agent verdict가 cross-model로 계수되지 않음을 negative 회귀 test로 신설해 강제한다 | constraint |
| UI13 | rubric 문안은 산문이 적합한 영역이므로 축약 대상이 아니다 | constraint |
| UI14 | 계측이 먼저다. 계측 없이 착지한 개선은 다시 체감으로만 평가된다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| produces-only GATE_ID 신설 | `plugins/mccp/scripts/receipt/schema.js:14-19` + `plugins/mccp/scripts/receipt/aliases.js:61-66` | GATE_IDS에 additive 추가 + `PHASE_FROM_GATE`에 phase 매핑. `ALIAS_MATRIX`는 **무변경** — 어떤 command chain에도 진입하지 않음 |
| 비침습 회귀 test | `plugins/mccp/scripts/receipt/tests/merged-verify-fields.test.js:140-157` | `ALIAS_MATRIX` 전 항목을 순회해 새 gate가 `produces`/`requires_preceding`/`design_optional` 어디에도 없음을 단언 |
| present-only meta 필드 | `plugins/mccp/scripts/receipt/schema.js:824-834` (validator) + `write.js:663-676` (stamper) | `!== null && !== undefined`일 때만 검사. 부재는 legacy receipt 정상 |
| present-only 재료화 (hash 안정성) | `plugins/mccp/scripts/receipt/write.js:690-700` (`review_l3_invoked`) | `makeSkeleton` **미포함** + 조건부 `receipt.meta.X = …`. 미행사 receipt는 키 자체가 없어 canonical hash 무변동 |
| 승인축 모순 차단 불변식 | `plugins/mccp/scripts/receipt/schema.js:249-259` | `review_source === 'multi-agent'`면 `codex_verdict` 부재를 schema가 강제. 같은 축의 gate별 확장 |
| receipt subject = 리뷰 리포트 markdown | `plugins/mccp/commands/code-review.md:411-416` | `--plan .claude/reviews/pr-<N>-review.md`. `--plan`은 "subject markdown"이며 `hash.js:174 planAwareMarkdownHash`가 non-plan 경로를 `markdownHash`로 처리 |
| 순수 판정 ↔ 디스크 분리 | `plugins/mccp/scripts/lib/santa/counter.js` vs `ledger.js` | 렌더는 인자만 받는 순수 함수, 파일 접촉은 별도 함수. 순수 쪽만 단위 test |
| CLI facade subcommand 추가 | `plugins/mccp/scripts/lib/santa/cli.js:288-301` | `switch(sub)` 한 줄 + `cmdX(args)` 함수. exit code 매핑은 기존 catch-all 재사용 |
| 테스트 | `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | `node:test` + tmpdir fixture + **CLI 레벨 단언**(순수 oracle만 test하면 배선 결함을 놓친다) |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/receipt/schema.js` | UPDATE | `GATE_IDS += 'mccp-santa-review'` · `meta.santa_*` present-only validator 4종 · gate별 **`review_source='multi-agent'` 고정** 불변식 |
| `plugins/mccp/scripts/receipt/aliases.js` | UPDATE | `PHASE_FROM_GATE['mccp-santa-review'] = 'review'`. `ALIAS_MATRIX` 무변경 (UI2) |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `--santa-*` 플래그 → `meta.santa_*` 조건부 재료화 (makeSkeleton 미포함). review triple 경로는 무변경 |
| `plugins/mccp/scripts/lib/santa/seal.js` | CREATE | 원장 집계 → 결정적 리포트 렌더 → review proof 구성 → receipt write. M2의 유일한 신규 모듈 |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATE | `seal` subcommand 추가 (dispatch 1줄 + `cmdSeal`) |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | 새 Step 5.5(push **이전**)가 `seal --decision "$DECISION"`을 호출. rubric·출력 포맷 무변경 (UI13) |
| `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js` | CREATE | gate 등록 · 왕복 · present-only · **비침습** · **negative cross-model** (UI11·UI12) |
| `plugins/mccp/scripts/lib/tests/santa-seal.test.js` | CREATE | CLI 레벨 — 리포트 생성 · receipt 집계값이 `aggregate()`와 일치 · 원장 부재/손상 경로 |
| `docs/santa-loop/ownership.md` | CREATE | 소유권 표 + M1 동결 시그니처 + 변경 프로토콜 (UI5·UI6·UI7) |
| `.claude/prds/santa-loop-materialize.prd.md` | UPDATE | M2 행 status `pending` → `in-progress`, Plan 셀에 본 plan 경로 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.23.8` → `1.23.9` (단일 milestone = patch, §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | `:1419` page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | `:163` derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | `## [1.23.9]` 항목 + 상단 `currently` 노트 동기 |

## Design Decisions

<!-- 저자 정당화. 리뷰어의 intent 채널에는 들어가지 않는다. -->

**DD1 — `mccp-santa-review`는 produces-only이고 `ALIAS_MATRIX`에 등재하지 않는다.**

`mccp-implement-verify`가 정확히 같은 형태로 이미 존재한다([schema.js:14-19](../../plugins/mccp/scripts/receipt/schema.js) 주석: "no command lists it in `requires_preceding`"). `ALIAS_MATRIX`에 `mccp:santa-loop` 항목을 만들면 두 가지가 딸려 온다 — (a) hook이 이 command를 "알려진 command"로 인식하게 되어 preflight 경로가 바뀌고, (b) 이후 누군가 `requires_preceding`을 채우면 UI2가 조용히 깨진다. 등재하지 않으면 그 경로가 **존재하지 않는다**. 비침습성은 산문이 아니라 `plugins/mccp/scripts/receipt/tests/merged-verify-fields.test.js:140` 미러 test가 강제한다.

**phase는 `review`다.** `PHASES = ['plan','implement','pr','review']` 중 santa-loop의 실제 위치는 push 직전 리뷰다. `pr`을 고르면 [evidence-stage-guard.js:90](../../plugins/mccp/scripts/lib/evidence-stage-guard.js)이 이 receipt를 **ship receipt로 취급**한다(`phase !== 'pr'`이 거부 조건이다). santa receipt는 감사 앵커일 뿐 ship 증거가 아니므로 그 분류에 들어가면 안 된다.

**DD2 — receipt subject는 `.claude/reviews/santa-review-<decision-slug>.md`이고, 코드가 결정적으로 렌더한다.**

`write.js:299`가 `--plan`을 필수로 요구하지만 그것은 이름만 plan이고 실제로는 **subject markdown**이다 — `plugins/mccp/commands/code-review.md:413`이 이미 `--plan .claude/reviews/pr-<N>-review.md`를 넘기고, [hash.js:174](../../plugins/mccp/scripts/receipt/hash.js) `planAwareMarkdownHash`가 non-plan 경로를 `markdownHash`로 보낸다. santa-loop은 plan 없이 호출되므로 자기 subject를 만들어야 한다.

- **원장 JSON을 subject로 삼지 않는다.** gitignored라 클론에서 재현 불가능하고, `.json`에 markdown canonicalizer를 거는 것은 범주 오류다.
- **LLM 산문이 아니라 코드가 렌더한다.** 감사 앵커의 내용이 매 실행 달라지면 `plan_hash`가 증거가 아니라 잡음이 된다.
- **렌더러는 원장 state를 받지 않는다 — `seal`이 만든 투영만 받는다.** 이것이 UI4를 산문이 아니라 **구조**로 지키는 지점이다. `state.rounds[].reviewers[]`의 원소는 `{envelope, raw}`이고 `raw`에는 `checks`·`suggestions` 전문이 들어 있다(M1 DD2). 렌더러에 state를 통째로 넘기면 UI4 준수가 "렌더러가 `.raw`를 안 건드리기로 한다"는 **약속**에 걸리는데, `.claude/reviews/`는 git-tracked이므로 그 약속이 한 번 깨지면 리뷰어 전문이 영구히 커밋된다. 그래서 `seal`이 먼저 투영한다:

  ```js
  // seal 내부. raw는 이 경계에서 사라지고 렌더러는 그것을 본 적이 없다.
  { rounds: [ { index, started_at, verdict,
                reviewers: [ { id, model, verdict, criticalIssueCount } ] } ] }
  ```

  `renderReport(projection, { decisionId, cap, aggregate, verdict })`는 이 투영과 스칼라만 받는 순수 함수다. `raw`를 실을 **인자가 없다.**
- **집계 수준만 담는다** (UI4). 라운드 표(index · started_at · verdict) · 리뷰어별 `{id, model, verdict, criticalIssueCount}` · cap · exitReason. 리뷰어 `raw` 본문과 critical issue **텍스트는 담지 않는다** — 그것이 "원장 본문"이고, `.claude/reviews/`는 gitignored가 아니므로 담으면 UI4가 깨진다. 운영자용 issue 텍스트는 지금처럼 Step 5 ESCALATION 블록이 터미널에 출력한다.

**렌더 표면 제약 2종** (design critique R0 흡수 — `frontend-design-direction` SKILL `## Output Constraints`). 리포트는 GitHub·에디터에서 렌더되는 markdown 표면이므로 그 앵커를 받는다.

- **heading depth ≤ 3** (H1). `renderReport`는 `####` 이상을 생성하지 않는다. `/mccp:prp-implement` Phase 3.7 produced-diff grounding lint가 같은 앵커를 정적으로 걸므로, 여기서 정하지 않으면 implement 단계에서 hard-block된다.
- **라운드 표는 상위 3행 + collapse** (H4). `MCCP_SANTA_ROUND_CAP`은 최대 10까지 허용되므로 라운드 표가 10행이 될 수 있다. 4행 이상이면 상위 3행만 펼치고 나머지는 `<details><summary>+N more</summary></details>`로 접는다.

**DD3 — santa receipt는 `review_source='multi-agent'`를 싣고, schema가 그 값을 gate별로 못박는다.**

<!-- 개정 이력: 초판은 "승인축을 아예 stamp하지 않는다"를 골랐다. L2 패널 R0에서
     architect가 CRITICAL로 반박했고 그 반박이 옳았다 — I4의 문언은 "cross-model
     참칭 금지"가 아니라 "값이 multi-agent일 것"이고, 부재는 그것을 충족하지 않는다.
     초판이 근거로 든 "(a)는 거짓 proof를 요구한다"도 과장이었다(아래 층 매핑 참조). -->

I4는 [review-loop-trust.prd.md](../prds/review-loop-trust.prd.md) 승계 불변식이고 이 plan의 UI3이다 — **santa verdict의 `review_source`는 `multi-agent`**다. 그래서 santa receipt는 review triple을 전부 싣는다.

| 필드 | 값 |
|---|---|
| `resolution.review_source` | `'multi-agent'` 고정 |
| `resolution.review_verdict` | NICE → `converged` · NAUGHTY/캡도달 → `divergent` |
| `resolution.review_proof` | 아래 층 매핑으로 구성 |

triple은 all-or-nothing이다([write.js:412-423](../../plugins/mccp/scripts/receipt/write.js)) — 셋 중 하나라도 빠지면 `REVIEW_STAMP_INVALID`. 그래서 proof를 구성해야 하고, santa의 실제 구조로 **정직하게 채울 수 있다**:

| proof 필드 | 오라클 요구 | santa가 대는 값 |
|---|---|---|
| `layers.l1` | `'converged'` | M1의 `begin-round` 캡·인덱스 가드가 이 라운드를 승인했다는 사실. **santa 고유 의미 부여이며 이 매핑이 유일한 해석 확장이다** |
| `layers.l2` | `'converged'` | 리뷰어 A·B가 모두 PASS |
| `layers.l3` | 부재 허용 | 부재 (santa에 L3 없음) |
| `verification_verdict` | `'converged'` | `gate.decideVerdict` 결과 NICE |
| `quorum` | `required ≥ 2` · `of ≥ required` · `responded ≥ required` · `roles ≤ responded` | `{required:2, of:2, responded:2, roles:2, passed:true}` |
| `perspectives` | `length === responded`, 역할 중복 금지 | `[{perspective:'A'},{perspective:'B'}]` |
| `dispatch_evidence` | 비어있지 않은 repo-relative 경로 | `['.claude/reviews/santa-review-<slug>.md']` |
| `reviewed_plan_hash` | 있으면 receipt `plan_hash`와 일치 | `markdownHash(리포트)` — seal이 리포트를 먼저 쓰므로 계산 가능하고 `write.js`가 쓰는 값과 동일 함수다 |

**`quorum`은 원장이 실제로 보여주는 것에서만 파생한다 — 상수가 아니다.** 위 표의 `{2,2,2,2}`는 리뷰어 A·B가 **둘 다 기록된** 정상 라운드의 값이고, `buildProof`는 그 숫자를 하드코딩하지 않는다. M1은 판정 lifecycle 검사(`{A,B}` 완전성·`id` 중복 거부)를 P1으로 이연했으므로([ledger.js:415-417](../../plugins/mccp/scripts/lib/santa/ledger.js)) **`record --id A`를 두 번 넣은 라운드가 실재할 수 있다.** 그 라운드에서 `{required:2, of:2, responded:2, roles:2}`를 그대로 찍으면 receipt가 **있지도 않은 모델 다양성을 주장**하게 된다 — proof가 자기 증거를 오기하는 것이고, `isReviewProofStructurallyValid`가 `roles`를 관찰값으로 못박은 이유가 정확히 그것이다.

그래서 `buildProof`는 FINAL 라운드의 **distinct `envelope.id` 집합**에서 파생한다:

```
ids       = distinct(reviewers.map(r => r.id))
perspectives = ids.map(id => ({ perspective: id }))
responded = roles = ids.length ;  of = required = 2
passed    = (ids.length >= 2) && 전원 PASS
```

`ids.length < 2`면 `passed:false`이고 **`seal`은 `review_verdict='converged'`를 stamp하지 않는다**(→ `divergent`). 이것은 P1의 lifecycle 검사를 앞당기는 것이 **아니다** — 중복 `record`를 거부하지도, 판정을 바꾸지도 않는다(UI8·UI10). 원장이 보여주지 않는 다양성을 receipt가 **주장하지 않을** 뿐이고, 그 방향은 fail-closed다.

**리뷰어는 `aggregate()`가 아니라 `read()`에서 온다.** `ledger.aggregate()`는 `{rounds, entries, exitReason}` 카운트만 돌려주므로([ledger.js:474-484](../../plugins/mccp/scripts/lib/santa/ledger.js)) 리뷰어 배열이 없다. `seal`은 `ledger.read(opts).rounds`로 라운드 골격(index·started_at·verdict)을 얻고, 라운드별 리뷰어는 [`ledger.readReviewers(round, opts)`](../../plugins/mccp/scripts/lib/santa/ledger.js)로 얻는다 — 그 함수는 **envelope만** 반환하고 `raw`를 애초에 전달하지 않으므로 위 투영 경계와 같은 방향으로 이중 방어가 된다.

**`layers.l1`이 유일한 늘어난 해석이다.** 그 필드의 원래 의미는 plan-review의 기계 lint이고 santa에는 그것이 없다. 대신 M1이 만든 기계 게이트(캡 판정 + `record`/`verdict`의 미개설 인덱스 거부)가 같은 역할을 한다 — 리뷰어가 발화하기 **전에** 기계가 라운드를 승인한다. 이 매핑은 `docs/santa-loop/ownership.md`에 명시하고, 아니라고 볼 여지가 있으므로 Open Question으로 남긴다.

**강제는 산문이 아니라 schema다.** `gate_id === 'mccp-santa-review'`이면 `resolution.review_source === 'multi-agent'`여야 한다(부재도 `codex`도 `hybrid`도 REJECT). 이것이 UI12 negative 회귀 test가 붙는 지점이고, 참칭 시도가 디스크에 도달하지 못한다. `codex_verdict` 동반 금지는 [schema.js:249-259](../../plugins/mccp/scripts/receipt/schema.js)와 [write.js:448](../../plugins/mccp/scripts/receipt/write.js)이 **이미** 강제하므로 새로 만들지 않는다.

**divergent 경로에도 proof는 실린다.** `isReviewProofStructurallyValid`는 `converged`일 때만 게이트하지만 `dispatch_evidence`의 경로 형식은 verdict와 무관하게 schema가 검사한다([schema.js:215-227](../../plugins/mccp/scripts/receipt/schema.js) — "sealed into receipt_hash either way"). 따라서 divergent proof도 정직한 값으로 채운다: `layers.l2='divergent'` · `verification_verdict='divergent'` · `quorum.passed=false` · `dispatch_evidence`는 동일한 repo-relative 리포트 경로. 구조 검사를 통과시키려고 `converged`로 바꾸지 않는다.

**`layers.l1`은 divergent 경로에서 두 값으로 갈린다 — 여기서 뭉뚱그리면 위 매핑이 거짓이 된다.** l1의 santa 의미는 "M1의 기계 게이트가 이 라운드를 승인했다"이므로, 그 게이트가 실제로 승인했는지에 따라 다르다:

| divergent 사유 | `layers.l1` | 왜 |
|---|---|---|
| FINAL 라운드 NAUGHTY (또는 distinct `id` < 2) | `'converged'` | `begin-round`가 그 라운드를 열어줬고 리뷰어가 실제로 발화했다. 기계 게이트는 통과했고 사람/모델 판정에서 갈린 것이다 |
| 캡 도달 | `'divergent'` | `begin-round`가 **거부했다**(exit 12). 라운드가 열리지 않았으므로 l1을 `converged`로 찍으면 승인하지 않은 게이트가 승인했다고 주장하게 된다 |

`isReviewProofStructurallyValid`는 `converged`일 때만 층 값을 게이트하므로([schema.js:208-212](../../plugins/mccp/scripts/receipt/schema.js)) 두 값 모두 schema를 통과한다 — 즉 이 구분은 **강제되지 않으며 오직 정직성 문제다.** 그래서 Task 6 (15)가 캡 경로 receipt의 `layers.l1`이 `'divergent'`임을 단언한다.

**dedupe 쪽은 무변경으로 안전하다.** [dedupe.js](../../plugins/mccp/scripts/receipt/dedupe.js)의 `codexConverged = crossModelConverged`는 `review_source ∈ CROSS_MODEL_SOURCES(['codex','hybrid'])`를 요구하는데 `multi-agent`는 그 집합 밖이다([review-verdict.js:42](../../plugins/mccp/scripts/lib/review-verdict.js)). test는 그 사실을 고정하는 것이지 새 방어를 만드는 것이 아니다.

**intent 게이트는 발화하지 않는다.** [write.js:112](../../plugins/mccp/scripts/receipt/write.js) `INTENT_IN_SCOPE_GATES = ['mccp-plan-codex']`이므로 `mccp-santa-review`는 범위 밖이고 `stampIntentDecision`이 조기 반환한다. `intentDecision`은 전달하지 않는다(전달하면 out-of-scope로 throw).

**DD4 — `meta.santa_*`는 present-only이며 `makeSkeleton`에 넣지 않는다.**

`merged_verify_*`는 `makeSkeleton`에 `null`로 들어가 있다([schema.js:1094](../../plugins/mccp/scripts/receipt/schema.js)). 그 선례를 따르지 않는다. `makeSkeleton`에 키를 추가하면 **모든** receipt의 canonical hash 입력이 바뀌고, git-tracked ship receipt corpus(CLAUDE.md §3.12)를 멱등 재작성할 때 `store.js` `TRACKED_RECEIPT_OVERWRITE` 가드가 발동한다. CLAUDE.md §3.13이 intent 10필드에 대해 같은 이유로 `makeSkeleton` 미포함을 택했고(`pr_codex_force_override` 선례), 그쪽이 더 최근이고 더 안전하다.

필드 **4종** — `santa_rounds`(int ≥0) · `santa_entries`(int ≥0) · `santa_cap`(int ≥1) · `santa_exit_reason`(`'cap_reached'` 또는 부재). 값은 `ledger.aggregate()` 출력에서 직접 온다 — M2는 새 계산을 만들지 않는다.

**판정은 여기에 두지 않는다.** 초판은 `meta.santa_verdict`(`NICE`/`NAUGHTY`)를 5번째 필드로 뒀으나, DD3 개정으로 판정이 `resolution.review_verdict`에 실리면서 같은 사실이 두 곳에 놓이게 됐다 — drift의 정의다. 판정의 단일 출처는 `review_verdict`이고, NICE/NAUGHTY ↔ converged/divergent 매핑은 `seal.js`가 소유한다.

**DD5 — `seal`은 원장을 mutate하지 않는다.**

`seal`이 읽기 전용이면 재실행이 안전하고(리포트·receipt만 덮어씀), 캡 회계와 봉인이 서로를 오염시키지 않는다. 그래서 `seal`은 `ledger.read`/`aggregate` 계열만 쓰고 `mutate` 경로에 들어가지 않는다 — evidence lock도 잡지 않는다. M1의 mutation 3종은 무변경이다.

**DD6 — `seal`은 generic slug 2종을 거부하되, 둘의 사유는 서로 다르다.**

<!-- 개정 이력: 초판은 `default`와 `main`을 "fallback 값"으로 뭉뚱그려 거부했다.
     L2 R1에서 invariant가 HIGH로 반박했고 옳았다 — `main`은 fallback이 아니라
     `slugFromBranch`가 정당하게 파생하는 브랜치 slug다(prefix 없는 이름이라
     BRANCH_PREFIX_RE를 통과해 SLUG_RE를 만족한다). 사유를 잘못 적으면 운영자가
     받는 진단이 틀린다. -->

거부 대상은 같지만 **이유가 다르므로 메시지도 다르다.**

- **`default` — 진짜 fallback.** [ledger.js:45·91](../../plugins/mccp/scripts/lib/santa/ledger.js)에서 명시 `--decision`도 브랜치 해석도 실패했을 때만 나오는 값이다. 리뷰 스코프를 특정하지 못했다는 뜻이므로, 그 상태로 감사 앵커를 봉인하는 것 자체가 부정직하다. exit 2.
- **`main` — 정당한 파생 slug이지만 generic namespace와 충돌한다.** [store.js:308-315](../../plugins/mccp/scripts/receipt/store.js) `listGenericReceipts`가 `decision_id ∈ {default, main}` × `GATE_IDS`를 격리 대상으로 잡는다. quarantine marker는 **gitignored라 worktree 로컬**이므로(`.claude/receipts/*`), 새 worktree에서는 marker가 없고 첫 validate 부팅에 migration이 1회 돈다 — 그 사이 쓰인 `mccp-santa-review/main.json`은 `.legacy.json`으로 조용히 사라진다. 창은 좁지만 실재한다. exit 2 + "브랜치가 `main`이라 generic namespace와 겹친다. `--decision <slug>`로 스코프를 고정하라"는 **정확한** 진단을 낸다.

`main`에서의 이 거부가 정상 워크플로를 막지 않는 이유는 [CLAUDE.md](../../CLAUDE.md) §3.5가 이미 "main 직접 push 금지, 항상 feature branch 경유"를 요구하기 때문이다 — santa-loop → push가 `main`에서 일어나는 것 자체가 정책 밖 경로다. 그럼에도 `--decision` 한 플래그로 즉시 통과한다.

원장 쪽 fallback은 무변경이다(M1 동작 보존) — 거부는 `seal`에서만 일어난다.

**DD7 — 소유권 문서는 `docs/santa-loop/ownership.md`에 둔다.**

`docs/`의 기존 관례는 PRD/버전 계열 이름의 디렉토리다(`multi-session-work-loop/` · `workflow-orchestration/` · `automation-modernization/`). 문서의 주제는 santa-loop 모듈 경계이므로 `docs/santa-loop/`가 맞다. 내용 3부:

1. **소유권 표** — P1·P2·P3 × 파일. 교집합이 ∅임을 표 자체로 읽을 수 있게 파일 경로를 전수 열거한다.
2. **M1 동결 시그니처** — `counter.decideRound` · `gate.decideVerdict` · `ledger`의 mutation 3종 + `aggregate` · CLI subcommand별 exit code. P1·P2·P3가 전제로 삼을 계약.
3. **변경 프로토콜** — UI7. 시그니처를 바꾸려면 P0를 재개한다. 자식 PRD가 임의 변경하지 않는다.

문서 역시 렌더되는 markdown 표면이므로 DD2와 같은 앵커를 받는다 — heading depth ≤ 3(H1), 소유권 표가 4행 이상으로 늘면 상위 3행 + collapse(H4).

## Tasks

> **test는 그것을 정당화하는 Task 안에서 쓴다 (TDD red→green).** Task 6의 16항목 목록은 *커버리지 계약*이지 그 test들이 Task 6에 가서야 처음 생긴다는 뜻이 아니다 — 그러면 Task 2·3의 Validate가 아직 없는 파일을 가리키는 순환이 된다. 소유는 아래와 같고, Task 6은 **잔여 항목 + 전체 스위트 실행 + 커버리지 감사**다.
>
> **파일 생성 소유도 같은 규칙을 따른다** — `santa-review-gate.test.js`는 **Task 2가**, `santa-seal.test.js`는 **Task 3이** 자기 항목과 함께 만든다. Task 6은 두 파일을 만들지 않고 잔여 항목을 덧붙인다. 이 문장이 없으면 각 Task의 Action이 코드 변경만 서술하고 Validate만 test 파일을 가리키게 되어, 위 순환이 표 아래에서 되살아난다.
>
> | Task | 그 Task 안에서 쓰는 Task 6 항목 |
> |---|---|
> | Task 2 (schema·write) | 1 · 2 · 3 · 5 · 7 |
> | Task 3 (seal.js) | 8 · 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16 |
> | Task 6 (확정) | 4 · 6 + 전체 스위트 + 커버리지 감사 |

### Task 1: GATE_ID + phase 등록

- **Action**: `schema.js` `GATE_IDS`에 `'mccp-santa-review'`를 `'code-reviewer'` 뒤에 추가하고, `mccp-implement-verify` 주석과 같은 형태로 produces-only 근거를 적는다. `aliases.js` `PHASE_FROM_GATE`에 `'mccp-santa-review': 'review'` 추가. `ALIAS_MATRIX`는 건드리지 않는다.
- **Mirror**: `schema.js:14-19` + `aliases.js:61-66`
- **Validate**: `node -e "const{GATE_IDS}=require('./plugins/mccp/scripts/receipt/schema');const{phaseFromGate}=require('./plugins/mccp/scripts/receipt/aliases');console.log(GATE_IDS.includes('mccp-santa-review'), phaseFromGate('mccp-santa-review'))"` → `true review`

### Task 2: `meta.santa_*` present-only 필드 + `review_source` 고정 불변식

- **Action**: `schema.js` meta 검증 절에 4개 validator를 present-only로 추가(`santa_rounds`·`santa_entries`·`santa_cap`·`santa_exit_reason`). 이어 `gate_id === 'mccp-santa-review'`이면 `resolution.review_source === 'multi-agent'`를 `req`로 강제한다 — 부재·`codex`·`hybrid` 전부 REJECT. `codex_verdict` 동반 금지는 기존 `schema.js:249-259`가 이미 처리하므로 **추가하지 않는다**. `write.js`에는 `--santa-rounds`/`--santa-entries`/`--santa-cap`/`--santa-exit-reason`을 읽어 **값이 있을 때만** `receipt.meta.X = …`로 재료화하는 블록을 `review_l3_invoked` 블록 옆에 추가. review triple 처리는 `write.js`에 **이미 있으므로 무변경**이다. **그리고 이 Task에서 `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js`를 생성하고 항목 1·2·3·5·7을 작성한다** — 특히 (3) present-only 키 **부재** 단언은 DD4의 hash 안정성을 지키는 유일한 test이므로 빠뜨리지 마라.
- **Mirror**: validator는 `plugins/mccp/scripts/receipt/schema.js:824-834`, 재료화는 `plugins/mccp/scripts/receipt/write.js:690-700`.
  **두 인용은 서로 다른 필드군이고 그 차이가 함정이다** — `schema.js:824-834`은 `merged_verify_*`의 validator인데 그 필드군은 `makeSkeleton`에 **들어 있다**(`schema.js:1094-1095`). validator 모양만 빌리고 `makeSkeleton` 등록은 **따라하지 마라**(DD4). 따라할 대상은 `write.js:690-700`의 `review_l3_invoked` — 조건부 `receipt.meta.X = …`이고 skeleton 미등록이다. Task 6 (3)이 `null` 값이 아니라 **키 부재**를 단언하는 이유가 이것이다.
  **gate별 `resolution` 제약에는 선례가 없다 — 이것은 신규 코드다.** `schema.js:236-247`은 `review_source` **값** 기준 분기(`if (r.review_source === 'hybrid')`)이지 `gate_id` 기준이 아니다. 인용은 "resolution 블록 안에 조건부 `req`를 두는 **모양**"까지만 유효하고, `if (receipt.gate_id === 'mccp-santa-review')` 분기 자체는 이 repo에 처음 생긴다. 그 사실을 구현 시 주석에 남긴다. **인용된 분기들의 중첩 깊이는 따라하지 마라** — 아래 위치 계약 참조
- **코드 위치와 형태** (인용만으로는 구현자가 어디에 넣을지 알 수 없다):

  **위치가 계약의 일부다 — `if (reviewPresent.length > 0)` 블록 바깥이어야 한다.** `schema.js:174`의 그 가드는 review triple이 **하나라도 있을 때만** 열리고, 기존 `review_source` 값-기준 분기(`:236-259`)는 전부 그 안에 있다. "그 분기 바로 다음"에 넣으면 gate-id 검사도 같은 가드 안으로 들어가고, **review 필드가 통째로 없는 santa receipt는 검사를 건너뛴다** — DD3가 요구한 "부재도 REJECT"가 정확히 반대로 동작한다. 게다가 `write.js`의 `resolution.converged` 기본값이 `true`이므로, 승인 기록이 하나도 없는 santa receipt가 **converged로 읽힌다**. 그래서 이 검사는 `reviewPresent` 가드와 **형제**로 둔다:

  ```js
  // schema.js — resolution 블록 안이되 `if (reviewPresent.length > 0) { … }` 블록
  // **바깥**(형제). 가드 안에 넣으면 triple 부재 receipt가 검사를 통과한다.
  // gate_id 기준 분기는 이 repo에 처음 생기는 형태다.
  if (receipt.gate_id === 'mccp-santa-review') {
    req(r.review_source === 'multi-agent',
      'a mccp-santa-review receipt must carry resolution.review_source === "multi-agent" ' +
      '(I4): santa never invokes a cross-model reviewer, so "codex"/"hybrid" would be a ' +
      'false claim of cross-model corroboration, and absence would leave the receipt with ' +
      'no approval record at all (got ' + JSON.stringify(r.review_source) + ')');
  }
  ```
  **이 Task가 `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js`를 새로 만든다** — 파일 생성은 Task 2 소유이고, 항목 1·2·3·5·7을 red→green으로 여기서 쓴다(Task 6은 같은 파일에 4·6을 **덧붙일 뿐** 새로 만들지 않는다). 아래 Validate가 이 파일을 실행하므로, 생성이 이 Task 밖에 있으면 Validate가 존재하지 않는 파일을 가리키는 순환이 된다.
- **Validate**: 이 Task 안에서 쓰는 test 1·2·3·5·7이 red→green — `node --test plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js`

### Task 3: `santa/seal.js` — 집계 → 리포트 → proof → receipt

- **Action**: 순수 함수 3 + I/O 1, **그리고 이 Task에서 `plugins/mccp/scripts/lib/tests/santa-seal.test.js`를 생성하고 항목 8~16을 작성한다**(16 cap 출처는 이 Task 요구사항의 유일한 반증 test다).

  | 함수 | 입력 | 출력 | 순수 |
  |---|---|---|---|
  | `project(state)` | 원장 state | `{rounds:[{index, started_at, verdict, reviewers:[{id, model, verdict, criticalIssueCount}]}]}` — **`raw` 소거 경계**(DD2) | 예 |
  | `renderReport(projection, {decisionId, cap, aggregate, verdict})` | 투영 + 스칼라 | markdown 문자열. `raw`를 실을 인자가 없다 | 예 |
  | `buildProof({reportRelPath, reportHash, projection, verdict})` | 투영 + 스칼라 | DD3 층 매핑 proof. `quorum`·`perspectives`는 FINAL 라운드의 **distinct `id`** 에서 파생하며 상수가 아니다 | 예 |
  | `seal(opts)` | — | 아래 7단 | 아니오 |

  `seal` 순서: (1) `decisionId`를 `SLUG_RE`로 검증하고 `default`/`main`을 DD6의 **각기 다른 사유**로 거부한다 — 경로 조립 **이전**이다. (2) `ledger.read`로 라운드 골격(index·started_at·verdict) + `ledger.readReviewers`로 라운드별 envelope(`raw` 미포함)를 얻어 `project`. (3) `ledger.aggregate(Object.assign({}, baseOpts, { cap: state.cap }))`로 카운트 — **cap은 (2)에서 읽은 state의 값을 명시 전달한다**(아래 "cap 출처" 규칙). (4) `renderReport` → `.claude/reviews/santa-review-<slug>.md` 원자 write, 경로는 `assertContained(리포트, <repoRoot>/.claude/reviews, null)`로 봉인(3번째 인자 `null` — receipts 전용 검사를 켜면 안 되는 M1과 동일 이유). (5) `markdownHash(리포트)`. (6) `buildProof` → `.claude/state/santa-loop/<slug>.proof.json`에 write. **리포트와 proof는 서로 다른 산출물이고 지속성 모델도 다르다** — 리포트는 `.claude/reviews/`(git-tracked 감사 표면, 그래서 DD2의 `raw` 소거 경계가 필요하다), proof는 `.claude/state/santa-loop/`(원장과 같은 디렉토리, [.gitignore:48](../../.gitignore)이 이미 커버하므로 **`.gitignore` 변경 없음** — 그래서 Files to Change에 없다). (7) `write({gate:'mccp-santa-review', decision, plan:<리포트 repo-relative>, 'review-verdict', 'review-source':'multi-agent', 'review-proof-file', 'santa-*':…})`.

  **cap 출처는 env가 아니라 원장 state다 — 이것은 구현 재량이 아니라 요구사항이다.** [`aggregate`](../../plugins/mccp/scripts/lib/santa/ledger.js)는 `opts.cap`이 정수가 아니면 `counter.parseCap(opts.env || process.env)`로 폴백한다(`ledger.js:478`). 그런데 라운드를 실제로 게이트한 cap은 `beginRound`가 그 시점 env에서 확정해 `state.cap`에 **저장한** 값이다(`ledger.js:372-376`). 둘 사이에 `MCCP_SANTA_ROUND_CAP`이 바뀌면 — 셸 export, `.claude/settings.json` 편집, 다른 worktree — `seal`이 원장이 실제로 겪은 회계와 **다른 cap으로 `exitReason`을 계산**하고, receipt의 `santa_cap`·`santa_exit_reason`이 원장을 오기한다. 감사 앵커가 감사 대상을 잘못 적는 것이므로 fail-closed 방향도 아니다. 따라서 `seal`은 `aggregate`에 `cap: state.cap`을 **명시 전달**하고, `meta.santa_cap`도 같은 `state.cap`을 싣는다. `state.cap`이 정수가 아닌 손상 원장은 (2)에서 이미 걸린다(원장 손상 경로).

  **exit code 계약**(신규 code 0개 — Task 4의 catch-all 매핑을 그대로 탄다). `seal`은 실패를 typed error로 throw하고 `cmdSeal`은 그것을 catch-all에 위임한다: 성공 `0` · slug 거부/사용 오류 `2`(DD6) · 원장 lock 경합 `75`. `12`는 cap 전용이라 재사용하지 않는다. **이 계약이 명문이어야 하는 이유**는 Task 5의 `if [ "$SEAL_EXIT" -ne 0 ]` 분기가 전적으로 여기에 의존하기 때문이다 — `seal`이 오류 경로에서 비영점을 내지 않으면 그 분기는 영원히 거짓이 되고, "seal 실패는 push를 막는다"는 Task 5의 주장이 코드상 성립하지 않는다.

  `verdict`는 FINAL 라운드가 NAUGHTY이거나 distinct `id`가 2 미만이면 `divergent`, 둘 다 아니면 `converged`다(DD3). 캡 도달 종료(Task 5의 두 번째 봉인 지점)도 `divergent`다 — 캡을 소진했다는 것은 NICE에 도달하지 못했다는 뜻이다. `intentDecision`은 전달하지 않는다(DD3). 원장 mutation 0 — `read`/`readReviewers`/`aggregate`만 호출한다(DD5).
- **Mirror**: 순수/디스크 분리는 `plugins/mccp/scripts/lib/santa/counter.js` vs `plugins/mccp/scripts/lib/santa/ledger.js`. receipt 호출 형태는 `plugins/mccp/scripts/receipt/tests/merged-verify-fields.test.js:37-43`. proof 형태는 `plugins/mccp/scripts/lib/review-verdict.js:98-175` `isReviewProofStructurallyValid`가 정본. `assertContained` 3-arg 사용법은 `plugins/mccp/scripts/lib/santa/ledger.js:222-234`
  **이 Task가 `plugins/mccp/scripts/lib/tests/santa-seal.test.js`를 새로 만든다** — 파일 생성은 Task 3 소유이고, 항목 8~16을 red→green으로 여기서 쓴다. 특히 **16(cap 출처)은 이 Task의 요구사항을 반증하는 유일한 test**이므로 `seal.js` 구현과 같은 Task 안에 있어야 한다 — 다른 Task로 미루면 `cap: state.cap` 계약이 구현 시점에 검증되지 않는다.
- **Validate**: 이 Task 안에서 쓰는 test 8~16이 red→green — `node --test plugins/mccp/scripts/lib/tests/santa-seal.test.js`

### Task 4: CLI `seal` subcommand

- **Action**: `cli.js`에 `case 'seal': return cmdSeal(args);` + `cmdSeal`(baseOpts → `seal()` → JSON stdout). `usage()`에 한 줄 추가. exit code는 기존 catch-all 매핑을 그대로 탄다 — 신규 exit code를 만들지 않는다(`12`는 cap 전용이라 재사용 금지).
- **Mirror**: `cli.js:288-301` dispatch + `cmdStatus`
- **Validate**: `node plugins/mccp/scripts/lib/santa/cli.js seal --decision santa-loop-materialize-m2` → exit 0 + JSON

### Task 5: `santa-loop.md` 배선 — seal은 **push 이전**이다

- **Action**: `seal`을 Step 4 verdict 직후·**Step 6 push 이전**에 새 Step 5.5로 넣는다. 초안은 Step 7(push 이후)에 뒀으나, 그러면 `seal` 실패가 되돌릴 수 없는 단계 뒤에 온다 — DD6의 slug 거부가 정확히 그 지점에서 터진다. 봉인에 필요한 값(라운드·집계·verdict)은 Step 4 시점에 전부 확정되므로 앞당기는 데 정보 손실이 없다.
- **명령줄은 아래 그대로**다. `--decision "$DECISION"`은 **필수** — 생략하면 `seal`이 slug를 자기가 다시 파생해 Step 0이 정한 스코프와 어긋날 수 있다:

  ```bash
  SEAL_JSON=$(node "$SANTA" seal --decision "$DECISION")
  SEAL_EXIT=$?
  if [ "$SEAL_EXIT" -ne 0 ]; then
    echo "[santa] seal failed (exit $SEAL_EXIT) — NOT pushing. 2=slug/usage, 75=ledger lock busy (retry)." 1>&2
    exit "$SEAL_EXIT"
  fi
  ```

  **조건 분기가 블록 안에 있어야 한다.** 산문으로 "비영점이면 push하지 않는다"라고만 적고 `SEAL_EXIT=$?` 캡처만 두면, 구현자가 블록을 그대로 옮겼을 때 exit code가 **읽히기만 하고 아무것도 막지 않는다** — push는 그대로 일어난다. 이 repo가 반복해서 잡아온 "산문은 HALT, 코드는 통과" 결함이라 여기서는 코드로 적는다. Step 7 최종 보고는 `$SEAL_JSON`의 리포트·receipt 경로를 싣는다.
- **두 번째 봉인 지점 — 캡 도달 종료.** UI14는 NICE·캡도달 **양쪽** 종료 경로의 봉인을 요구하는데, 위 Step 5.5는 NICE 경로만 덮는다. 캡 도달은 Step 5.5에도 Step 6에도 **도달하지 않기 때문이다** — [plugins/mccp/commands/santa-loop.md:77](../../plugins/mccp/commands/santa-loop.md)이 `BEGIN_EXIT` 비영점에서 "리뷰어를 하나도 띄우지 말고 Step 5의 ESCALATION 블록을 출력한 뒤 종료"로 분기하고, 캡 도달이 바로 그 `exit 12`다. 따라서 그 분기 안에 두 번째 호출을 넣는다:

  **그 분기는 현재 코드가 아니라 산문이다.** `plugins/mccp/commands/santa-loop.md:77`은 "`BEGIN_EXIT`가 비영점이면 리뷰어를 띄우지 말고 ESCALATION을 출력한 뒤 end"라고 **서술**할 뿐, `if`도 `exit`도 없다. 봉인 호출을 그 산문 옆에 문장으로 얹으면 이 repo가 반복 검출해온 결함(산문은 HALT, 코드는 통과)을 그대로 재생산한다 — 그래서 이 Task는 **분기 자체를 실행 가능한 블록으로 만든다.** 동작은 무변경이다(리뷰어 미발화 · ESCALATION 출력 · 종료). 바뀌는 것은 형태뿐이고, 그 형태 덕분에 seal 호출과 종료가 기계적으로 존재하게 된다:

  ```bash
  # santa-loop.md Step 3 — begin-round 직후. 기존 산문 분기를 대체한다.
  if [ "$BEGIN_EXIT" -ne 0 ]; then
    if [ "$BEGIN_EXIT" -eq 12 ]; then
      # 캡 도달은 리뷰 라운드의 정당한 종료다 — 계측 대상(UI14).
      # 75(lock 경합)·2(사용/무결성 오류)는 종료가 아니라 실패이므로 봉인하지 않는다.
      SEAL_JSON=$(node "$SANTA" seal --decision "$DECISION")
      SEAL_EXIT=$?
      if [ "$SEAL_EXIT" -ne 0 ]; then
        echo "[santa] cap reached, but seal failed (exit $SEAL_EXIT) — escalation stands, audit anchor missing." 1>&2
      fi
    fi
    # Step 5 ESCALATION 블록 출력 (내용·포맷 무변경)
    exit "$BEGIN_EXIT"
  fi
  ```

  **`exit "$BEGIN_EXIT"`가 블록의 마지막 문장이라는 점이 계약이다.** 이것이 없으면 캡 도달 후 실행이 아래로 흘러 리뷰어 발화·push까지 도달할 수 있다 — 캡 게이트가 존재하는 이유 자체가 무효화된다. Validate (d)가 이 토큰의 존재와 위치를 단언하는 이유다.

  **여기서는 seal 실패가 종료 코드를 바꾸지 않는다** — Step 5.5와 방향이 다르고, 그 차이가 의도다. Step 5.5의 seal은 **push라는 되돌릴 수 없는 행위를 막기 위해** 비영점 exit을 전파한다. 캡 도달 경로에는 막을 push가 없고 이미 escalation으로 종료하는 중이므로, seal의 exit code로 덮어쓰면 운영자가 받는 1차 진단(캡 소진)이 2차 사고(봉인 실패)에 가려진다. 그래서 loud stderr로 표면화하되 종료는 `$BEGIN_EXIT`(=12)를 그대로 전파한다.

- rubric·Output 포맷·Step 0~4의 **판정 로직**은 무변경(UI13). 추가되는 것은 두 봉인 호출이고, `BEGIN_EXIT` 분기의 산문→bash 전환은 **종료 처리의 형태** 변경이지 판정 변경이 아니다 — 분기 조건도, 리뷰어 미발화도, ESCALATION 내용도 그대로다.
- **Mirror**: `plugins/mccp/commands/work.md:788-795` (verify 뒤 receipt write + `--decision "$DECISION_SLUG"` 명시 + stderr 한 줄)
- **Validate**: 다섯 축을 단언하며, **아래 산문은 Validation 절 2c의 실행 코드와 1:1이다** — 산문이 코드보다 강하면 그 차이가 곧 미검증 주장이 되므로 토큰 단위로 맞춘다. (a) `seal --decision "$DECISION"` 출현 **2회**(리터럴 `$DECISION` 포함. 개수를 세는 이유는 NICE 경로만 배선하고 캡 경로를 빠뜨리는 것이 이 Task의 실제 실패 모드이기 때문이다 — hit 여부만 보면 1개여도 통과한다), (b) NICE 경로: 어떤 seal 행번호 < `git push` 행번호, (c) `SEAL_EXIT" -ne 0` 출현 **2회** — 두 지점 모두 exit code를 캡처만 하지 않고 분기한다, (d) seal이 `BEGIN_EXIT" -eq 12` 블록 **안**에 있다, (e) `exit "$BEGIN_EXIT"`가 `BEGIN_EXIT" -ne 0` 블록 안이면서 `-eq 12` 블록 **뒤**에 있다. (d)·(e)는 행 번호 비교가 아니라 **`if`/`fi` 깊이를 세어 실제 블록 범위**를 구한 뒤 포함 관계를 본다 — 순서만 보면 닫는 `fi` 뒤에 놓인 seal도 통과하는데, bash는 그때 다음 블록으로 fall-through하므로 순서 검사는 중첩을 전혀 검증하지 못한다. (e)의 "12 블록 뒤"가 설계(12에서만 봉인 · 비영점 전부가 종료)를 그대로 옮긴 것이다

### Task 6: 회귀 test 확정 — 잔여 항목 + 전체 스위트 + 커버리지 감사

- **Action**: 두 파일. **주장 하나에 test 하나**가 원칙이고, 아래 각 항목은 그것이 없으면 red가 되지 않는 주장에 대응한다.

  **각 test 이름은 `[N]`으로 시작한다** (`test("[5] negative — review_source codex/hybrid/absent → REJECT", …)`). 이 규약이 커버리지 계약을 **산문에서 기계로** 옮기는 장치다 — 파일을 이름으로 실행하는 것(Validation 2b)은 *있는 test가 통과하는지*만 보므로, 16항목 중 14개만 쓴 구현도 초록이 된다. Validation **2d**가 두 파일에서 `[N]`을 수집해 1~16 전체 집합과 대조하고 누락 시 비영점 종료한다. **두 파일 모두 이 Task가 만드는 것이 아니다** — `santa-review-gate.test.js`는 Task 2가, `santa-seal.test.js`는 Task 3이 각자 자기 항목과 함께 생성해 둔다. Task 6은 **기존 파일에 잔여 항목(4·6)을 덧붙이고** 전체 스위트를 돌린 뒤 커버리지를 감사한다. 순서는 Task 2 → Task 3 → Task 6이며, Task 6 진입 시점에 두 파일은 이미 존재하고 초록이다.

  `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js`
  1. gate 등록 + `phaseFromGate` → `'review'`
  2. `--santa-*` + review triple 왕복 → `validate.ok`
  3. `--santa-*` 미전달 시 `meta.santa_*` **키 자체가 없음**(present-only, hash 안정성)
  4. `ALIAS_MATRIX` 전수 비침습
  5. **negative** — santa receipt의 `review_source`가 `'codex'`·`'hybrid'`·부재면 schema REJECT (UI3/I4 참칭 경로). **케이스 4종을 각각 단언한다**: `codex` · `hybrid` · `review_source`만 부재(나머지 triple 존재) · **review triple 전부 부재**. 마지막이 결정적이다 — 검사가 `if (reviewPresent.length > 0)` 가드 **안에** 놓이면 이 케이스만 조용히 통과하고, 그 receipt는 `resolution.converged` 기본값 `true`를 달고 승인처럼 읽힌다. Task 2의 위치 계약을 강제하는 유일한 test다
  6. **negative** — `converged`인 santa receipt가 `crossModelConverged`를 만족하지 **않음** (UI12)
  7. `meta.santa_*`와 `review_proof`가 `receipt_hash`에 포함(변조 시 hash 불일치)

  `plugins/mccp/scripts/lib/tests/santa-seal.test.js`
  8. `buildProof` 산출이 `isReviewProofStructurallyValid`를 통과(converged 경로)
  9. **negative — A-twice**: 같은 `id`로 두 번 `record`한 라운드에서 `buildProof`의 `roles`/`responded`가 **1**이고 `passed:false`, `seal`의 verdict가 `converged`가 **아님**. 이 test가 없으면 DD3의 "원장이 보여주지 않는 다양성을 주장하지 않는다"가 강제되지 않는다. **`layers.l1==='converged'`도 함께 단언한다** — `begin-round`가 이 라운드를 열어줬으므로(기계 게이트는 통과했고 다양성에서 갈렸다) DD3 divergent l1 분기의 상단 행이다. 15가 하단 행(`'divergent'`)만 강제하면 분기의 절반이 미검증으로 남는다
  10. **UI4 누출 — `raw` 부재**: fixture 리뷰어 JSON의 `checks`/`suggestions`에 고유 문자열(`SANTA_RAW_CANARY_…`)을 심고, 렌더된 리포트에 그 문자열이 **없음**을 단언. UI4를 산문이 아니라 test로 고정한다
  11. **DD5 읽기 전용·멱등**: 세 축. (a) `seal` 전후 원장 파일의 바이트가 **동일**, (b) `seal`을 두 번 돌려도 리포트 내용이 동일(타임스탬프 제외), (c) **`ledger.mutate` 스파이 호출 횟수 0** — `ledger` 모듈의 `mutate`를 감싸 카운트한 뒤 `seal` 실행 후 0임을 단언한다. (a)는 **디스크 상태만** 보므로 in-memory `mutate` 호출이 우연히 디스크에 반영되지 않은 경우를 통과시킨다. DD5가 금지하는 것은 "결과적으로 파일이 안 바뀜"이 아니라 **mutation 경로 진입 자체**이므로 (c)가 그 문언에 직접 대응하는 유일한 축이다
  12. divergent 경로 — NAUGHTY 라운드에서 `review_verdict='divergent'` + **`layers.l1==='converged'`**(DD3 분기 상단 — 라운드가 열렸고 리뷰어가 발화했다) + proof의 `dispatch_evidence`가 여전히 repo-relative 형식(schema가 verdict 무관하게 검사)
  13. `default`/`main` slug 거부가 **서로 다른 메시지**로 exit 2 (DD6 — 사유가 뭉뚱그려지면 운영자 진단이 틀린다)
  14. 원장 부재 / 손상 경로
  15. **캡 도달 봉인**: 라운드가 cap을 채운 원장에 `seal`을 돌려 `review_verdict='divergent'` + `meta.santa_exit_reason='cap_reached'` + **`review_proof.layers.l1==='divergent'`**(`begin-round`가 거부했으므로 — DD3의 divergent l1 구분. schema가 강제하지 않는 정직성 축이라 test가 유일한 강제다). Task 5 Validate (d)가 *호출이 배선됐는지*를 보는 반면 이 항목은 *그 호출이 옳은 값을 봉인하는지*를 본다 — 둘 다 없으면 UI14의 절반이 비어 있는 것을 아무것도 잡지 못한다
  16. **negative — cap 출처가 env가 아님**: `state.cap=2`인 원장을 만들고 `MCCP_SANTA_ROUND_CAP=5`를 env에 세팅한 뒤 `seal` → `meta.santa_cap`이 **2**이고 `exitReason`이 `state.cap` 기준으로 계산됨. `aggregate`의 env 폴백(`ledger.js:478`)을 타면 이 test가 red가 된다. **값 일치만 보는 test로는 못 잡는다** — 두 cap이 우연히 같은 fixture에서는 폴백 여부가 관측되지 않으므로 env를 일부러 어긋나게 두는 것이 이 항목의 전부다
- **Mirror**: `plugins/mccp/scripts/receipt/tests/merged-verify-fields.test.js` 전체 구조 + `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` tmpdir fixture
- **Validate**: 두 파일을 **이름으로** 먼저 돌려 신규 커버리지가 실재함을 확인한 뒤 전체 스위트를 돌린다 — 디렉토리 단위 실행만 하면 test 파일이 아예 생성되지 않아도 초록이 나온다:

  ```bash
  node --test plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js
  node --test plugins/mccp/scripts/lib/tests/santa-seal.test.js
  node --test plugins/mccp/scripts/receipt/tests/ plugins/mccp/scripts/lib/tests/
  ```

  그리고 **Validation 절 2d(커버리지 감사)가 exit 0** — 16항목의 `[N]` id가 두 파일에 전부 존재함을 기계적으로 확인한다. 위 세 줄은 *있는 test가 통과하는지*만 보므로 이 단계가 커버리지 계약의 실제 강제다.

### Task 7: 소유권 문서

- **Action**: `docs/santa-loop/ownership.md`를 DD7의 3부 구성으로 작성. 소유권 표의 근거는 3개 자식 PRD의 Scope 절이며, 각 행에 그 PRD 경로를 인용한다. 교집합 ∅ 주장은 파일 경로 전수 열거로 검증 가능해야 한다.
- **Mirror**: `docs/multi-session-work-loop/instruction-contract.md` (계약을 표로 두고 근거를 file:line으로 인용하는 형태)
- **Validate**: Validation 절 5번 스크립트가 exit 0 — 3축을 모두 단언한다(heading depth ≤ 3 · DD7 3부 구성 앵커 · P1·P2·P3 경로 교집합 ∅). 행 수 세기는 검증이 아니므로 쓰지 않는다

### Task 8: 릴리스 표면 동기

- **Action**: `plugin.json` `1.23.8` → `1.23.9`. `html.js:1419`·`markdown.js:163`의 `v1.23.8` 동기. `CHANGELOG.md`에 `## [1.23.9]` 항목 + 상단 `currently \`1.23.9\`` 노트. PRD M2 행 status `pending` → `in-progress` + Plan 셀.
- **Mirror**: CLAUDE.md §3.7 동기 대상 5면 (i18n test는 `plugin.json` 파생이라 무변경)
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 1. 신규 gate 등록
node -e "const{GATE_IDS}=require('./plugins/mccp/scripts/receipt/schema');const{phaseFromGate,ALIAS_MATRIX}=require('./plugins/mccp/scripts/receipt/aliases');console.log('gate:',GATE_IDS.includes('mccp-santa-review'),'phase:',phaseFromGate('mccp-santa-review'),'invasive:',JSON.stringify(ALIAS_MATRIX).includes('mccp-santa-review'))"

# 2. 신규 test 2종을 이름으로 먼저 — 디렉토리 실행만 하면 파일 미생성도 초록이다
node --test plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js
node --test plugins/mccp/scripts/lib/tests/santa-seal.test.js

# 2b. 기존 회귀 스위트
node --test plugins/mccp/scripts/receipt/tests/
node --test plugins/mccp/scripts/lib/tests/
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 2d. 커버리지 계약 감사 — 16항목이 실제로 test로 존재하는가.
#     2b(파일 이름 실행)는 "있는 test가 통과하는지"만 본다. 14/16만 쓴 구현도
#     초록이므로, 항목 id를 수집해 전체 집합과 대조하는 이 단계가 필요하다.
node -e '
const fs=require("fs");
const files=["plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js",
             "plugins/mccp/scripts/lib/tests/santa-seal.test.js"];
const seen=new Set();
const absent=files.filter(function(f){ return !fs.existsSync(f); });
if(absent.length){ console.log("MISSING test files:", absent); process.exit(1); }
files.forEach(function(f){
  const t=fs.readFileSync(f,"utf8");
  // test("[N] …") / it("[N] …") — 따옴표 3종은 hex escape로 두어 셸 인용과 충돌하지 않게 한다.
  const re=/\b(?:test|it)\(\s*[\x22\x27\x60]\s*\[(\d+)\]/g;
  let m; while((m=re.exec(t))!==null) seen.add(Number(m[1]));
});
const want=[]; for(let i=1;i<=16;i++) want.push(i);
const missing=want.filter(function(n){ return !seen.has(n); });
console.log("covered="+(16-missing.length)+"/16");
if(missing.length) console.log("MISSING items:", missing);
process.exit(missing.length?1:0);
'

# 2c. santa-loop.md 배선 5축 (Task 5 Validate a~e와 토큰 단위로 1:1).
#     축이 하나라도 거짓이면 비영점 종료 — 출력만 하고 통과하면 검증이 아니다.
node -e '
const fs=require("fs");
const L=fs.readFileSync("plugins/mccp/commands/santa-loop.md","utf8").split(/\r?\n/);
const at=(re)=>L.map((l,i)=>re.test(l)?i+1:0).filter(Boolean);
const seal=at(/seal --decision "\$DECISION"/);
const branch=at(/SEAL_EXIT" -ne 0/);
const push=at(/git push/);
const cap=at(/BEGIN_EXIT" -eq 12/);
const outer=at(/BEGIN_EXIT" -ne 0/);
const end=at(/exit "\$BEGIN_EXIT"/);
// if/fi 깊이를 세어 실제 블록 범위를 구한다. 행 순서만 보는 검사는 닫는 `fi`
// **뒤**에 놓인 seal도 통과시키므로 중첩을 전혀 검증하지 못한다 — bash는 그때
// 다음 블록으로 fall-through한다.
function range(line1){
  if(!line1) return null;
  let d=0;
  for(let i=line1-1;i<L.length;i++){
    const t=L[i].trim();
    if(/^if\b/.test(t)) d++;
    if(/^fi\b/.test(t)){ d--; if(d===0) return [line1, i+1]; }
  }
  return null;
}
const inside=(r,x)=>!!r && x>r[0] && x<r[1];
const ro=range(outer[0]), ri=range(cap[0]);
const ok={
  a_two_seal_calls: seal.length===2,
  b_seal_before_push: seal.some(s=>push.some(p=>s<p)),
  c_two_exit_branches: branch.length===2,
  // seal은 `-eq 12` 블록 **안**, 종료문은 `-ne 0` 블록 안이면서 `-eq 12` 블록
  // **뒤** — 12에서만 봉인하고 비영점 전부가 종료한다는 설계와 1:1.
  d_seal_inside_cap_block: !!ri && seal.some(s=>inside(ri,s)),
  e_exit_inside_outer_after_cap: !!ro && !!ri && end.some(e=>inside(ro,e) && e>ri[1]),
};
Object.keys(ok).forEach(k=>console.log(k+":", ok[k]));
console.log("outer="+JSON.stringify(ro)+" cap="+JSON.stringify(ri)+" seal="+JSON.stringify(seal)+" end="+JSON.stringify(end));
process.exit(Object.keys(ok).every(k=>ok[k])?0:1);
'

# 3. 기존 receipt corpus 전수 validate (UI11 — additive enum 확장이 아무것도 깨지 않음)
node -e "
const fs=require('fs'),path=require('path');
const {validate}=require('./plugins/mccp/scripts/receipt/schema');
const root='.claude/receipts';
let n=0,bad=0;
for (const g of fs.readdirSync(root)) {
  const d=path.join(root,g);
  if (!fs.statSync(d).isDirectory()||g.startsWith('.')) continue;
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    n++;
    const v=validate(JSON.parse(fs.readFileSync(path.join(d,f),'utf8')));
    if (!v.ok) { bad++; console.log('FAIL',g+'/'+f,JSON.stringify(v.errors)); }
  }
}
console.log('receipts='+n+' invalid='+bad);
process.exit(bad?1:0);
"

# 4. seal 왕복 (실 원장 대상)
node plugins/mccp/scripts/lib/santa/cli.js status --decision santa-loop-materialize-m2
node plugins/mccp/scripts/lib/santa/cli.js seal --decision santa-loop-materialize-m2

# 5. 소유권 문서 구조 검사 (Task 7 산출 후). 행 수 세기는 검증이 아니다 —
#    DD7의 3부 구성 · heading depth ≤ 3 · P1/P2/P3 교집합 ∅ 를 실제로 단언한다.
node -e '
const fs=require("fs");
const t=fs.readFileSync("docs/santa-loop/ownership.md","utf8");
const H=t.split(/\r?\n/).filter(l=>/^#{1,6}\s/.test(l));
const deep=H.filter(l=>/^#{4,}\s/.test(l));
// 3부: 소유권 표 · M1 동결 시그니처 · 변경 프로토콜 (제목 문구는 자유, 앵커 토큰만 요구)
const parts=["소유권","동결","프로토콜"].map(k=>({k, ok:H.some(h=>h.includes(k))}));
// 표의 P1·P2·P3 경로 열거에서 교집합 ∅ — 같은 경로가 두 소유자에 나타나면 red
const rows=t.split(/\r?\n/).filter(l=>/^\|/.test(l));
const own={P1:[],P2:[],P3:[]};
rows.forEach(l=>{const c=l.split("|").map(s=>s.trim());
  Object.keys(own).forEach(p=>{ if(c.some(x=>x===p)) c.forEach(x=>{ if(/^`?[\w./-]+\.\w+`?$/.test(x)) own[p].push(x.replace(/`/g,"")); }); });});
const dup=[];
["P1","P2","P3"].forEach((a,i)=>["P1","P2","P3"].slice(i+1).forEach(b=>
  own[a].forEach(x=>{ if(own[b].includes(x)) dup.push(a+"∩"+b+":"+x); })));
const ok={ heading_depth_le_3: deep.length===0,
           three_parts: parts.every(p=>p.ok),
           owner_intersection_empty: dup.length===0 };
Object.keys(ok).forEach(k=>console.log(k+":", ok[k]));
if(deep.length) console.log("  h4+:", deep);
if(!parts.every(p=>p.ok)) console.log("  missing parts:", parts.filter(p=>!p.ok).map(p=>p.k));
if(dup.length) console.log("  duplicates:", dup);
process.exit(Object.keys(ok).every(k=>ok[k])?0:1);
'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| GATE_ID 추가가 기존 receipt validate를 깨뜨린다 | Low | additive enum 확장 + `makeSkeleton` 미포함(DD4) → 기존 receipt의 hash 입력 무변동. Validation 3번이 corpus 전수 검증 |
| santa receipt가 dual-review 우회 경로가 된다 | Low | DD3 — `review_source`를 `'multi-agent'`로 못박고 그 외 값을 schema가 REJECT. `CROSS_MODEL_SOURCES`가 `multi-agent`를 배제하므로 `crossModelConverged`는 언제나 false. Task 6의 negative test 2종이 이 경로가 열리면 즉시 red |
| `layers.l1` 매핑(캡 게이트 → L1)이 과잉 해석으로 판명 | Medium | DD3에 유일한 해석 확장으로 명시하고 `docs/santa-loop/ownership.md`에 기록 + Open Question 등재. 재해석 시 `buildProof` 한 함수만 바뀐다 |
| generic slug(`default`/`main`) receipt가 quarantine에 격리돼 계측이 소실 | Medium | DD6 — `seal`이 둘을 **서로 다른 사유**로 exit 2 거부(`default`=스코프 미상, `main`=generic namespace 충돌). `--decision`으로 즉시 통과. 원장 fallback은 무변경 |
| `seal` 실패가 되돌릴 수 없는 push 뒤에 온다 | Medium | Task 5 — seal을 Step 5.5(push **이전**)로 배치. 봉인 입력은 Step 4에 전부 확정되므로 앞당겨도 정보 손실 0이고, slug 거부·lock 경합이 push 전에 표면화된다 |
| `.claude/reviews/` 리포트에 리뷰어 본문이 실려 UI4가 깨진다 | Medium | DD2 — 렌더는 집계 필드만 받는 순수 함수이고 `raw`·issue 텍스트를 인자로 받지 않는다. 구조적으로 실을 수 없다 |
| 소유권 표가 자식 PRD 실제 변경과 어긋나 재작업 | Medium | 표의 각 행이 자식 PRD Scope 절을 인용해 근거를 고정. UI7대로 이탈 시 P0 재개 |
| `write.js` 수정이 다른 게이트의 receipt를 바꾼다 | Low | 조건부 재료화라 `--santa-*` 미전달 시 코드 경로가 no-op. Task 6 (3)이 이를 단언 |
| 캡 도달 종료가 봉인되지 않아 UI14의 절반이 빈다 | Medium | 캡 도달은 `BEGIN_EXIT -eq 12` 분기에서 Step 5.5·6에 **도달하지 않는다**(`plugins/mccp/commands/santa-loop.md:77`). Task 5가 그 분기 안에 두 번째 seal을 배선하고, Validate (a)가 호출 **개수 2**를, (d)가 분기 내 위치를 단언. Task 6 (15)가 봉인 값(`divergent`+`cap_reached`)까지 확인 |
| `seal`이 원장과 다른 cap으로 `exitReason`을 계산해 receipt가 원장을 오기 | Medium | `aggregate`의 env 폴백(`ledger.js:478`) 대신 `cap: state.cap` 명시 전달을 Task 3이 요구사항으로 못박음. Task 6 (16)이 env를 일부러 어긋나게 둔 fixture로 폴백 경로를 red로 만든다 |
| `seal` 실패가 NICE 판정의 push를 막는다 | Medium | 의도된 방향이다 — 봉인 없는 push는 계측 없는 ship이고 UI14가 금지한다. 실패는 loud stderr + 비영점 exit(2=사용 오류, 75=lock 경합 재시도)이고, 리뷰 결과 자체는 원장에 이미 남아 재실행이 저렴하다 |

## Acceptance

- [ ] `mccp-santa-review` ∈ `GATE_IDS`, `phaseFromGate` → `'review'`, `ALIAS_MATRIX`에 문자열 0건
- [ ] `review_source` 고정 불변식: santa receipt의 `review_source`가 `'multi-agent'`가 아니면(부재·`codex`·`hybrid`) `validate`가 REJECT (test로 확인)
- [ ] `buildProof` 산출이 `isReviewProofStructurallyValid`를 통과하고, `converged` santa receipt가 `crossModelConverged` = false (dedupe negative test)
- [ ] A-twice 라운드에서 proof가 `roles=1`·`passed:false`이고 verdict가 `converged`가 아님 (원장이 보여주지 않는 다양성을 주장하지 않음 — DD3)
- [ ] 렌더된 리포트에 리뷰어 `raw` canary 문자열이 **없음** (UI4를 test로 고정)
- [ ] `seal` 전후 원장 파일 바이트 동일 + 재실행 멱등 (DD5 읽기 전용)
- [ ] 기존 receipt corpus 전수 validate 통과 — **건수를 보고서에 명시**(현 시점 `.claude/receipts/` 실측치)
- [ ] `seal` 왕복: `meta.santa_rounds` == `ledger.aggregate().rounds`, `meta.santa_entries` == `.entries`
- [ ] **UI14 양쪽 경로**: `santa-loop.md`에 `seal --decision "$DECISION"` 호출이 **2개**(NICE 경로 = push 이전, 캡 경로 = `BEGIN_EXIT -eq 12` 분기 안)이고 각각 `SEAL_EXIT` 비영점 분기를 동반. 캡 분기는 `exit "$BEGIN_EXIT"`로 종료하며 seal 호출이 그 **사이에 중첩**(Validation 2c가 비영점 종료로 강제). 캡 도달 원장에 `seal`을 돌리면 `review_verdict='divergent'` + `meta.santa_exit_reason='cap_reached'`
- [ ] **cap 출처가 원장 state**: `state.cap=2` · env `MCCP_SANTA_ROUND_CAP=5`로 어긋나게 둔 fixture에서 `meta.santa_cap`이 `2` (env 폴백을 타면 red)
- [ ] `--santa-*` 미전달 receipt에 `meta.santa_*` 키가 **존재하지 않음**(present-only)
- [ ] `docs/santa-loop/ownership.md`의 P1·P2·P3 파일 목록 교집합 = ∅ (경로 전수 열거로 검증)
- [ ] 소유권 문서에 M1 동결 시그니처 4종(`decideRound`·`decideVerdict`·mutation 3종·CLI exit code)과 변경 프로토콜 포함
- [ ] 버전 4면 동기: `plugin.json` · `html.js:1419` · `markdown.js:163` · `CHANGELOG.md`
- [ ] PRD M2 행 status·Plan 셀 갱신
- [ ] **커버리지 계약 기계 강제**: 두 test 파일의 test 이름이 `[N]` 규약을 따르고, Validation 2d가 1~16 전 항목 존재를 확인해 exit 0
- [ ] Patterns mirrored, not reinvented — 신규 lock 코드 0줄, 신규 exit code 0개

## Design Critique

- 트리거: `impeccable-detect.js` `design_signal=true` (axis a). signal_files — `plugins/mccp/scripts/receipt/write.js` · `plugins/mccp/scripts/lib/renderer/html.js` · `plugins/mccp/scripts/lib/renderer/markdown.js`
- SKILL first-step Read 수행: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` (4 앵커)
- 라운드: R0 1회 · cap `MCCP_DESIGN_CRITIQUE_MAX_RETRY`=2 · verdict `CONVERGED`
- 판정 근거 (`design-critique-decide.decideCritique`, HIGH/CRITICAL/UNKNOWN 부재):

  | Anchor | 대상 표면 | Severity | 처리 |
  |---|---|---|---|
  | H1 정보 위계 3단계 | `seal.js#renderReport` 산출 · `docs/santa-loop/ownership.md` | MEDIUM | DD2·DD7에 heading depth ≤ 3 명시로 흡수 |
  | H2 강조색 1개 | markdown 표면 (accent token 없음) · `html.js:1419` (version 리터럴만) | — | 해당 없음 |
  | H3 raw markdown marker | 코드 생성 markdown | — | 해당 없음 (렌더 파이프라인 경유 아님) |
  | H4 항목 수 상한 | 라운드 표(cap 최대 10) · 소유권 표 | LOW | DD2·DD7에 상위 3행 + `<details>` collapse 명시로 흡수 |

- 남은 HIGH/CRITICAL: 0

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 어떤 impeccable 명령도 **호출하지 않는다** — 아래는 구현자용 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

본 M2의 실제 렌더 표면은 markdown 2종(`seal.js` 리포트 · `ownership.md`)과 version 리터럴 2줄뿐이므로, 위 명령 중 실제로 유효한 것은 `evaluate` 단계뿐이다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
