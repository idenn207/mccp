# santa-adjudication M1 — plan 게이트 재개 노트 (2026-08-16)

> **STATE.md에 쓰지 못해 이 파일이 연속성 기록이다.** `state-writer.update({body})`가 저널
> enforce 모드에서 patch를 무시하고 기존 상태를 그대로 반환한다(아래 §5). 다음 세션은
> SessionStart가 주입하는 STATE.md(= santa-loop-materialize 내용)를 **무시하고** 이 파일을 읽어라.

## Codex Implementation Review

> **이 섹션이 plan이 아니라 이 노트에 있는 이유**: `mccp-plan-codex` receipt가
> `plan_hash=sha256:1f77424e…`로 plan 본문을 봉인했다. plan에 섹션을 주입하면 해시가
> `sha256:7a0e0061…`로 바뀌어(실측) 그 receipt가 stale이 되고 `/mccp:pr`의 chain 검증이
> hard-block한다. `/mccp:prp-implement` Phase 2.5.4가 "plan (또는 notes)"을 허용하므로
> 여기가 정본이다.

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0
- 합치 결론: **Codex는 발화하지 않았다.** `MCCP_CODEX_DISABLED=1`이 설정돼 있어 wrapper가
  spawn 직전 short-circuit했다(`classification=disabled`, `blocking=false`, `durationMs=0` — v0.3.5
  first-class skip). advisory mode(`MCCP_ALLOW_CODEX_UNAVAILABLE`)가 아니라 **env 정책에 의한
  의도된 skip**이므로 `$CODEX_VERDICT='skipped'`로 봉인한다. 부수적으로 `codex` CLI 자체도
  쿼터 소진 상태였다(2026-08-20 복구 — `codex exec` 실측).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | — | — | — | Codex 미발화로 finding 0건 |
- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md`
  (plan-conflict-detector 백틱 오탐 HIGH · `distinctIds` 정규화 불일치 MEDIUM — 둘 다 M1 소유 파일 밖이거나 §3.14 MEDIUM 규칙 적용)
- Open Questions: Task 7 (b) 미재현 — severity MEDIUM. PRD Open Questions에 실측으로 등재.
  §0 auto-CRITICAL 카탈로그(security boundary · atomic state · schema breakage) 해당 없음.
- Codex session 참조: 없음 (미발화)

### Security Reviewer

`Task(mccp:security-reviewer)`를 입력 검증 축으로 호출했고 **CRITICAL/HIGH 차단 항목 0건**으로
반환했다. fail-closed 계층("타입 위반은 거부, 계약 미달은 강등")에 exploitable fail-open 경로가
없다는 판정 + 구현 시 확인 체크리스트 5건. 다섯 항목 전부 구현이 충족한다:

1. `validateReason(null)` 미호출 — `failureScenario === null`이면 부르지 않고 `no-failure-scenario`로 직행 (`gate.js`)
2. severity 열거는 **대소문자 구분** — `SEVERITIES.indexOf` / `SEVERITY_VALUES.has` 둘 다 strict
3. `findings.length === criticalIssues.length` — 같은 `map`에서 파생해 구조적으로 보장
4. `validateReason`은 structured ∧ 문자열 시나리오일 때만 호출 (첫 일치에서 멈추는 판정 순서)
5. `decideVerdict` 무변경 — Validation의 frozen check가 반환 키 집합까지 단언

MEDIUM 이하는 전부 "CLEAN + 문서화 권고"라 별도 backlog 항목을 만들지 않고 코드 주석으로 흡수했다.

### 실경로 dual-review (`/mccp:santa-loop`, 2026-08-17)

Task 7로 3라운드를 완주해 `converged` 봉인. 리뷰어 6명 전원 PASS · blocking 0 · MEDIUM 1건.
Codex 쿼터 소진으로 Reviewer B는 `santa-loop.md`가 명시한 Claude Agent fallback이었다 —
모델 다양성 미달성, 컨텍스트 격리만 강제.

## 0-A. 게이트 통과 (2026-08-16) — 다음은 `/mccp:prp-implement`

**R11에서 4/4 pass · findings 0으로 수렴했고 receipt를 봉인했다. plan 게이트는 끝났다.**

| 축 | 값 |
|---|---|
| receipt | `.claude/receipts/mccp-plan-codex/santa-adjudication-m1.json` (round 1, `receipt_hash=sha256:abdc2cff…`) |
| review | `converged` via `multi-agent` · quorum 4/3 · roles 4 · L3 미발화 |
| `reviewed_plan_hash` | `sha256:1f77424e0164f92c172a638ac7e821149ddb3cc6b0f7e4c17033e8964f0fe475` |
| intent 축 | `intent_gate_verdict='skipped'` · `intent_skip_proof='codex_not_invoked'` (패널 경로라 Codex 미발화 — DD1 선례) |
| 검증 | `validate --command mccp:prp-implement` exit 0, missing/stale/blocking/open_critical 전부 0 |
| 리뷰 기록 | `.claude/reviews/plan-review-santa-adjudication-m1.md` (git-tracked, 최종 pass 상태) |

**plan 본문을 더 이상 편집하지 마라.** receipt가 위 해시로 plan을 봉인했으므로 한 글자만 바꿔도
`/mccp:prp-implement`가 stale로 차단한다. 흡수할 것이 생기면 게이트를 다시 돌려 새 receipt를 받는다.

**다음**: `/mccp:prp-implement .claude/plans/santa-adjudication-m1.plan.md`.
`review_source='multi-agent'`이므로 DD2대로 cross-gate dedupe를 만족하지 않는다 — `/mccp:pr`에서
PR-Codex가 실제로 발화한다(Codex 한도 상황을 먼저 확인할 것).

### 라운드 이력 (R6~R11, 이 세션)

blocking 추이 **11 → 2 → 12 → 9 → (R10 quorum 미달) → 0**.

- **R6** 4/4 fail. R1의 DD3 재작성이 요약면에 남긴 잔재(`Files to Change` 61·65·66행 · 커버리지 7행)
  + DD4의 `failure_scenario` 3중 모순 + Task 2의 "AND" 미명세. HIGH/CRITICAL 7건 흡수.
- **R7** architect·security pass. 실제 findings는 MEDIUM 4 · LOW 2뿐이고 blocking 2건은 전부
  `quorum.js:175-181` bare-verdict 합성이었다. §3.14가 MEDIUM을 backlog로 보내지만 **같은 절이
  "게이트를 끄지 않는다"고 명시**하고 quorum이 3-of-4를 요구하므로 전건 흡수했다.
- **R8** 후퇴(blocking 12). HIGH 4건이 한 축 — 커버리지 `[N]` 존재 검사가 빈 본문을 통과시킴.
  스크립트에 assert 검사를 넣어 기계로 닫고 커버리지 25(distinctIds 정합)를 신설.
- **R9** 두 HIGH가 R8 흡수분을 정확히 겨눔 — 커버리지 25가 **구현 불가**(`seal.js#distinctIds`
  미export)였고 `classifyFinding` reason 열거에 "문자열이나 `validateReason` 거부" 케이스가 없었다.
  architect CRITICAL은 DD6의 PRD 근거가 과장이었음을 잡았다(MVP (1)·(2)는 severity 임계를 정하지
  않는다 → Milestone 1 Outcome + Success Metrics 행으로 교체).
- **R10** findings 0인데 **test·invariant 워커가 `StructuredOutput`을 호출하지 못해** 응답 2/4로
  quorum 미달. plan 결함이 아니라 인프라 실패. 세션 캡 24/24 소진.
- **R11** `MCCP_ORCHESTRATION_MAX_AGENTS=32`로 올려 **plan 무편집 재시도** → 4/4 pass, findings 0.

**게이트 프로토콜에 대해 남길 것**: `plan-review.js:58` `buildPrompt`에 focus 채널이 없어 매 라운드
전면 재검토가 강제된다. 흡수가 만든 새 문장이 곧 새 리뷰 표면이 되므로 R8 같은 후퇴가 구조적으로
발생한다. R9가 그 표면에서 실제 결함 둘을 잡았으므로 무가치하지는 않으나, 라운드 비용이
**4에이전트 · 약 45만 토큰**이다. focus 주입은 별도 개선 축 후보다.

## 0-B. R6 완료 시점 기록 (이력용)

**R6를 돌렸고 divergent다. 흡수 완료, plan은 L1 clean(1007행).** 남은 것은 R7 발화 하나.

- decision slug가 **`santa-adjudication-m1`으로 바뀌었다**(이번 진입 인자가 plan 경로라서). 이쪽이
  정본이다 — `/mccp:prp-implement <plan>`가 검증하는 slug가 정확히 이것이다. 기록은
  `.claude/reviews/plan-review-santa-adjudication-m1.md`(halt_stage `5.2e`, wall-clock 407s).
- 캡 상향은 **불필요했다**. 새 세션이라 카운터가 리셋된다(`launched=4/24`). `reserve --n 4` → granted 4.
- R6 흡수 7건(HIGH/CRITICAL 전건) + 부수 MEDIUM 4건. 상세는 plan `## Review Rounds` R6 절.
- R7 절차는 §2와 동일하되 `--args`에 **plan 경로**를 쓴다(slug 고정). `emit-workflow-args`가 새
  `reviewed_plan_hash`를 계산하므로 R6 해시(`sha256:e58916b2…`)를 재사용하지 말 것.
- **focus 주입 채널은 없다**(`plan-review.js:58` `buildPrompt`가 프롬프트를 자체 생성). §2-4의
  "R6 프롬프트에 R5 흡수분만 검증하라를 명시" 지시는 실행 불가이므로 표준 전면 반증으로 돌린다.

## 1. 지금 어디인가 (R5 시점 기록 — 이력용)

`/mccp:plan .claude/prds/santa-adjudication.prd.md`의 Phase 5.2 L2 패널을 **5라운드** 돌렸고,
R6 직전에 **세션 에이전트 캡 24/24 소진**으로 정지했다(`reserveWorkers` → `granted=0`).
`.claude/reviews/plan-review-santa-adjudication.md`에 `halt_stage: 5.2b`로 기록돼 있다.

| 축 | 상태 |
|---|---|
| plan 본문 | `.claude/plans/santa-adjudication-m1.plan.md` — **확정. Phase 1~4 재실행 금지** |
| PRD | Milestone 1 행 `in-progress` + Plan 셀 연결 완료 |
| L1 | `converged` (위반 0) |
| L2 | R5까지 완료. 흡수·기각 이력은 plan의 `## Review Rounds`가 정본 |
| receipt | **없음** (`mccp-plan-codex` 미작성) → `/mccp:prp-implement` 진입 불가 |

## 2. 재개 절차 (운영자 승인 완료 — 캡 32 상향)

사용자가 2026-08-16에 **`MCCP_ORCHESTRATION_MAX_AGENTS=32`로 올려 R6 진행**을 승인했다.

1. **`/mccp:plan`을 재실행하지 마라.** Phase 1~4가 plan을 재생성해 R1~R5 흡수 12건이 소실된다
   (santa-loop-materialize 때 STATE.md에 남긴 경고와 같은 함정).
2. Phase 5.2만 수동 실행한다. `PLUGIN_ROOT`는 worktree의 `plugins/mccp`를 쓴다(캐시 1.25.1은 stale).

```bash
ROOT=plugins/mccp
REVIEW_DIR="$(git rev-parse --show-toplevel)/.claude/state/plan-review"
rm -f "$REVIEW_DIR"/{decision.json,proof.json,l2.json,reservation.json,workflow-args.json}
node $ROOT/scripts/lib/plan-review/cli.js l1 --plan .claude/plans/santa-adjudication-m1.plan.md > "$REVIEW_DIR/l1.json"
MCCP_ORCHESTRATION_MAX_AGENTS=32 node $ROOT/scripts/lib/orchestration-runaway.js reserve --n 4 > "$REVIEW_DIR/reservation.json"
node $ROOT/scripts/lib/plan-review/cli.js emit-workflow-args --plan .claude/plans/santa-adjudication-m1.plan.md \
  --prd .claude/prds/santa-adjudication.prd.md --granted 4 --out "$REVIEW_DIR/workflow-args.json"
node $ROOT/scripts/lib/orchestration-runaway.js mark-debt --reservation <id> --n 4
# → Workflow(scriptPath: plugins/mccp/scripts/workflows/plan-review.js, args: workflow-args.json 파싱 객체)
# → 결과를 l2.json에 verbatim 기록 → reconcile --actual 4 → decide
```

3. `decide`가 exit 0이면 5.2g `verify-proof` → 5.2h `record`(halt-stage 없이) → 5.6b
   `cli.js write --gate mccp-plan-codex --decision santa-adjudication --plan <plan> --review-mode
   multi-agent --review-verdict/--review-source/--review-proof-file --review-wall-clock-ms --quiet`
   → 5.7 `validate --command mccp:prp-implement`.
4. R6 프롬프트는 각 관점에 **"R5 흡수분(DD1 누적 규칙 · DD10 · DD4 원소 단위 · 커버리지 24)만
   검증하라"**를 명시한다. 전면 재검토를 시키면 이미 pass한 축이 다시 흔들린다.

## 3. 라운드 이력 요약 (정본은 plan `## Review Rounds`)

blocking 추이 **12 → 9 → 6 → 3 → (R5: 7, 설계 결함 발견)**.

- **R1** architect CRITICAL — `decideVerdict` 시그니처 확장은 ownership.md §변경 프로토콜 (2)가
  아니라 (1)에 해당(P0 재개 사안). → DD3 전면 재작성: **동결 함수 무변경** + 신규 export 3종
  (`decideAdjudicatedVerdict` / `analyzeReviewers` / `parseSeverityGate`).
- **R2** 저장 위치 표(원장 gitignored vs receipt 집계 정수 4종) · `analyzeReviewers` 반환 4필드
  명세 · `distinctIds` 단일 출처 · Acceptance 카운트 정정.
- **R3** test의 실질 CRITICAL 2건 → 커버리지 22(enforce 경로 `distinctIds`) · 23(receipt
  negative 단언). 3/4 pass.
- **R4** test 3건 전부 기각 — "문서 단언은 test로 불가"라는 전제가 `santa-loop-cap.test.js:29,
  854,867,886,1057`로 반증됨. 3/4 pass.
- **R5** **설계 결함**: `contract='partial'`이 blocking 규칙을 *대체*해, A가 `PASS`를 내며
  CRITICAL을 쓰고 B가 비구조화 finding 하나만 내면 → 전원 PASS → **NICE**가 나왔다. 비구조화
  finding 하나로 다른 리뷰어의 blocking이 지워지는 우회. → 규칙을 **누적**으로 변경
  (`full` = `blocking===0 ∧ distinct≥2`, `partial`·`off` = 거기에 `allPass` 추가) + DD10 재작성
  (`off`는 *완화*만 끄고 강화 축 둘은 항상 적용) + 커버리지 24 신설.

## 4. 이 사이클에서 backlog에 넣은 것

- `l1-check.js:66` `CITATION_RE`가 leading dot을 캡처 못해 `.claude/…:56` 인용을 오탐 (MEDIUM)
- `review-test` 오탐 축 — 7회 관측, 런타임 프롬프트 보강으로 교정 안 됨. agent 정의 수정 필요
- plan 잔여 MEDIUM 6건 (slug 하드코딩 · 위임 경로 spy · contract=full 엣지 등)

## 5. 이 세션에서 발견한 미기록 결함 — STATE.md 갱신 불가

`state-writer.update(repoRoot, { body: {...} })`가 **patch를 무시한다**. 실측:

```
update(cwd, { body: { inProgress: "PROBE-MARKER-DO-NOT-KEEP" } })
  → returned inProgress: "PR #139 CI 대기(...)"   # 기존 값
  → on-disk  inProgress: "PR #139 CI 대기(...)"   # 무변경
```

`applyLocked`가 저널 enforce 경로에서 `journal.projected`를 권위로 삼는데
(`state-writer.js:686-688`), `journalApply`가 body patch를 레코드로 반영하지 않아 projection이
기존 상태 그대로 나온다. `MCCP_STATE_JOURNAL`은 unset이고
`.claude/state/journal/{checkpoint.json,records.jsonl}`이 존재한다.

**영향**: 세션 연속성 기록이 조용히 소실된다 — `update()`가 성공을 반환하므로 호출자는 저장된
줄 안다. `pre-compact.js` / `session-start.js` 경로가 같은 API를 쓴다면 STATE.md는 마지막으로
직접 write된 시점(2026-08-16T04:53:59Z, santa-loop-materialize)에 **동결**돼 있다.

조사 시작점: `plugins/mccp/scripts/lib/state-journal/index.js:117` `journalApply` — `args.patch`가
`:157` 이후 projection input에 실제로 합류하는지. 이 노트가 존재하는 이유가 그 결함이다.
