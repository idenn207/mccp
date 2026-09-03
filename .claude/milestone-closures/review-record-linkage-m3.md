# Milestone Closure — review-record-linkage-m3

## Milestone
- ID         : review-record-linkage-m3
- Name       : bidirectional-link
- Plan       : .claude/plans/review-record-linkage-m3.plan.md
- Status     : done
- Closed at  : 2026-09-03T06:46:42.086Z
- Closed by  : /mccp:milestone-close (run_id=d81dcbb7-d556-4772-82a1-713c41b1fe33)

## Acceptance Condition

운영자가 Phase 2 안내에 따라 다음 condition을 제시했다 (verbatim):

```
M3 plan Task 1-10 complete, validation suite green (241/241),
evidence-audit non-blind with 0 false positives, frozen baseline
byte-identical, post_baseline.linkage present with join=explicit_field,
or stop after 10 turns
```

이 절은 *충족해야 할 조건*을 적는 자리이지 충족됐다는 주장이 아니다(closure README 형식 규약).
조건별 판정은 아래 `## Goal Loop Result`가 갖는다.

## Goal Loop Result

verdict=done. 운영자 응답 (mask 통과, hit 0건 · 원문 무변경):

```
goal-done:M3 acceptance 5절 전부 실측 충족, 라이브 링크는 다음 사이클 이연
```

### 라이브 `/goal` loop이 arming됐는지는 관측되지 않았다

`goal-detect`는 `availability=available` ∧ `goal_signal=true` ∧
`signal_ref={"row":3,"name":"bidirectional-link","plan":".claude/plans/review-record-linkage-m3.plan.md","status":"in-progress"}`
를 냈고, 운영자는 안내대로 `/goal <condition>` 텍스트를 다음 turn에 제출했다. 다만 세션 쪽에서
`◎ /goal active` indicator나 native command 확장 블록이 관측되지 않았으므로, **small fast
model이 실제로 평가를 돌렸다고 주장하지 않는다.**

대신 조건의 5개 절은 전부 기계로 측정 가능한 명제였고, 아래 값은 평가 모델의 판단이 아니라
**이 세션이 직접 실행한 명령의 출력**이다. 격리 lock은 실제로 enter/exit했고(`ok:true` →
`cleared:true`), 그 사이 heartbeat 1회를 넣었다. 이 사실을 숨기지 않고 기록한다 — closure의
감사 가치는 verdict가 아니라 그 verdict가 무엇을 보고 내려졌는지에 있다.

### 조건 5절 — 전부 실측 충족

| # | 절 | 판정 | 근거 (실행 출력) |
|---|---|---|---|
| 1 | `Task 1-10 complete` | PASS | M3 report `## Tasks Completed` 10행 전부 "완료" |
| 2 | `validation suite green (241/241)` | PASS | plan Validation 1번 12파일 재실행 → `tests 241 · pass 241 · fail 0 · duration_ms 78762` (`MCCP_CODEX_DISABLED=1 --test-concurrency=2`) |
| 3 | `evidence-audit non-blind, 0 false positives` | PASS | `state=incomplete`(≠`blind`) · `false_positive=0` · `ok=25` · `hash_bound=25` · `degraded=false` · `read_error=false` · `ship_receipt_count=79` |
| 4 | `frozen baseline byte-identical` | PASS | `--frozen-only` 2회 산출물 `diff` 무출력 · `git diff --stat -- docs/review-record-linkage/frozen-baseline.md` 무출력 |
| 5 | `post_baseline.linkage present, join=explicit_field` | PASS | `post_baseline.linkage` 존재 · `join="explicit_field"` · `ref="HEAD"` · `state="ok"` · `head_ships=79` / `head_records=60`이 작업트리 진단(4/7)과 **별도 필드** · `denominator=null`(자격 ship 0건, D2 규율) |
| — | `or stop after 10 turns` | 미발동 | 1 turn 안에 5절 전부 충족 |

plan Validation 1~4단계를 전부 재실행했고, plan `## Acceptance`의 나머지 항목도 같은 실행에서
확인됐다 — 배선 부재 test(`linkage-wiring.test.js` 정적 10 + spawn e2e 4)가 green이고, 과거
tracked ship receipt 79건의 `receipt_hash`는 무변경이다.

### `Status: done`이 뜻하지 않는 것 — 미충족인 채 남는 4건

`done`은 「M3의 Task·Validation·동결 불변식·라이브 파티션이 실측으로 확인됐다」는 뜻이다.
「plan이 적은 모든 문언이 이 문서가 쓰이는 순간 충족돼 있었다」는 뜻이 **아니다.**

1. **`bidirectional >= 1`은 여전히 0이다 — 이연이지 실패가 아니다.** plan이 이미 못박은
   부트스트랩 때문이다: 이 사이클의 상류 `mccp-plan-codex` receipt는 Task 1이 `meta.plan_path`를
   신설하기 **전에** 발행됐으므로, Task 5의 경로 앵커가 그것을 legacy로 보아 정확히 **무스탬프**를
   낸다. 0을 1로 만드는 유일한 방법은 앵커를 끄거나 파일명 fallback을 되살리는 것이고 둘 다 이
   plan이 금지했다. **첫 라이브 링크 ship은 다음 사이클**이다.
2. **ship receipt가 아직 없다.** `.claude/receipts/mccp-pr-codex/review-record-linkage-m3.json`
   부재. milestone-close는 chain에서 `/mccp:pr` **앞**이므로 이는 정상 순서다 — M3의 게이트
   완주는 현재 `mccp-plan-codex`(verdict `divergent`, `MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion`
   으로 봉인 · §3.15) + `mccp-implement-codex`(verdict `skipped`)까지다.
3. **cross-model 심사 0회.** implement receipt의 `meta.codex_disabled=true` ·
   `codex_skip_reason='codex_disabled'` · `round_ledger_count=0` ·
   `round_cap_pinned_by='codex-disabled'`. 이 milestone에서 Codex는 한 번도 발화하지 않았다.
   same-model 패널 4관점(R4, 4/4 fail)이 그것을 대신하지 않는다. codex 사용량 한도는
   2026-09-07 재설정 예정.
4. **알려진 test 실패 8건이 남아 있다.** `plan-review-cli-emit.test.js`가 이 세션의 round-cap
   seal(`<gitdir>/mccp/tmp/review-rounds-seal.json`)을 상속해 `emit-workflow-args`가 BLOCK된다.
   기계 확인: seal을 치우면 12/12 pass, 되돌리면 8 fail. M3 코드와 무관하고 범위 밖이라
   backlog `id=m3-seal-leak`로 이연했다. seal은 원문 그대로 복원했고 라운드 원장은 손대지 않았다.

### 종료 시점에 새로 관측된 것 — plan receipt 2건이 이미 stale이다

`node plugins/mccp/scripts/receipt/cli.js validate --command mccp:pr --decision review-record-linkage-m3 --plan <plan>`
가 `ok:false` + `stale` 2건을 낸다. **이것은 본 closure가 만든 것이 아니다** — 아래
`## Milestone Closure Provenance stamp — A/B 실측` 절의 measurement A가 stamp **이전** 값이다.

| gate | receipt가 봉인한 plan_hash | 측정 시점 현재 hash |
|---|---|---|
| `mccp-plan-codex` | `sha256:0b32a1d5…` | `sha256:aa02eabb…` |
| `mccp-implement-codex` | `sha256:4c8292ca…` | `sha256:aa02eabb…` |

원인은 구조적이다 — `/mccp:prp-implement` 2.5.4의 plan 주입이 `plan_hash`를 반드시 어긋나게
하며 모든 shipped 사이클이 겪는다. `/mccp:pr` 진입 시 이 stale을 어떻게 다룰지는 그 게이트의
일이고, **이 closure는 그것을 해소하지 않는다.**

## Milestone Closure Provenance stamp — A/B 실측

선례 두 건([santa-adjudication-m1](santa-adjudication-m1.md) ·
[session-process-reclaim-m3](session-process-reclaim-m3.md))은 Phase 4의 plan-body stamp를
**싣지 않는 이탈**을 택했다. 사유는 「stamp가 plan 본문을 바꿔 `plan_hash`를 어긋나게 하고,
그 stale은 `MCCP_RECEIPT_GATE_MODE=soft`로도 통과되지 않는다」였다.

**이 milestone에서는 그 사유가 성립하지 않는다.** stamp 이전에 A/B를 측정했다:

- **measurement A (stamp 이전)** — `stale` **2건**(`mccp-plan-codex` · `mccp-implement-codex`),
  `missing` 0 · `blocking` 0 · `open_critical` 0.
- **measurement B (stamp 이후)** — `stale` **2건**(동일 gate 2종) · `missing` 0 · `blocking` 0 ·
  `open_critical` 0. **새로 생긴 blocking 종류 0건.** 변한 것은 `current_plan_hash` 값뿐이며
  stale 판정 자체는 A와 동일하다.

즉 stale은 stamp가 **만드는** 것이 아니라 stamp 이전에 **이미 존재한다**. 선례가 회피하려던
비용이 여기서는 이미 지불된 상태이므로, 회피의 근거가 사라진다. 그래서 이 closure는 선례와
달리 **stamp를 싣는다** — 그 결과 closure 본문 변조가 다음 게이트의 `plan_hash` 대조에서
드러나는 option B custody anchor가 실제로 작동한다.

## Deviation — 명령 본문 Phase 4의 mask snippet이 잘못된 함수를 가리킨다

`milestone-close.md` Phase 4 step 3은 다음을 지시한다:

```js
const mask = require(... + "/scripts/derive/mask").applySecretMask;
process.stdout.write(mask(process.argv[1]).text);
```

**실행하면 `undefined`가 나온다.** `applySecretMask(model)`은 문자열이 아니라 derive **model**
객체를 받아 `model.sources.receipts[].briefing_summary` 등을 in-place로 스캔하고 model을
반환하며, `.text` 필드를 갖지 않는다(`derive/mask.js:185`). 문자열용 함수는
`maskSecrets(text, opts) -> {masked, hits}`다(같은 파일, `module.exports`에 노출됨).

본 closure는 `maskSecrets`를 사용했다 — hit 0건, 원문 무변경. snippet을 그대로 따랐다면
`## Goal Loop Result`에 `undefined`가 실렸을 것이다. 명령 본문 수정은 이 milestone 범위 밖이라
backlog로 이연한다.

부수적으로, Phase 0의 cost-tier probe(`cost-state.js get-tier`)도 **무출력**이다 — 그 파일은
CLI entrypoint가 없는 순수 모듈이라 subcommand를 해석하지 않는다. 본 실행은 모듈을 직접 읽어
판정했다: `cost_usd=186.72` · `threshold_tier=green`이고 이 저장소의
`MCCP_HANDOFF_THRESHOLDS_USD=500,800,1000` 기준으로 `tierFor(186.72)='green'`이다. 명령 본문
괄호의 "$100+"는 기본 임계값이지 이 환경의 값이 아니다. 이것도 같은 backlog 축이다.

## 종료 이후에도 남는 일

M3가 닫혀도 사라지지 않는 항목이다. PRD는 M4가 남아 아카이브되지 않으므로 활성 대시보드
스캔에는 계속 잡히지만, 여기 모아 둔다.

1. **`/mccp:pr` 진입 전 `export PR_PLAN_PATH=.claude/plans/review-record-linkage-m3.plan.md`** —
   기본 파생 `.claude/plans/review-record-linkage.plan.md`는 실재하지 않아 2.5.7이 HALT한다(R12).
2. **`/mccp:pr` 진입 직전 version 재계산** (§3.7 forward-only · 병렬 브랜치 충돌 10회차).
   현재 `plugin.json` = `1.34.5`.
3. **다음 사이클에서 라이브 링크 완주 확인** (`bidirectional >= 1`) — 위 미충족 1번.
4. **backlog `id=m3-seal-leak`** (test 격리) — 위 미충족 4번.
5. **backlog: 본 closure가 발견한 명령 본문 결함 2건** — mask snippet · cost-tier probe.
6. **M4 `review-round-structure`** — PRD의 마지막 milestone. 완료 시 minor bump +
   `/mccp:archive-complete`.

## Provenance
- Lock run_id        : d81dcbb7-d556-4772-82a1-713c41b1fe33
- Lock owner session : 9c328932-de3c-4157-9369-04771cb52d01
- Plan source        : .claude/plans/review-record-linkage-m3.plan.md
- Detection signal   : {"row":3,"name":"bidirectional-link","plan":".claude/plans/review-record-linkage-m3.plan.md","status":"in-progress"}
- mccp version       : 1.34.5
