# Plan: codex-intent-context M3 — hybrid L3 배선 복구

**Source PRD**: `.claude/prds/codex-intent-context.prd.md`
**Selected Milestone**: 3 — cross-vendor 독립 2차 리뷰어(opt-in)
**Complexity**: Medium

## Summary

`MCCP_PLAN_REVIEW=hybrid`는 오라클(`decide.js`)·스키마(`schema.js`)·receipt 필드가 모두 갖춰져 있는데도 **실행 경로가 죽어 있다**. `plan.md` 5.2f Step 1이 "5.2z의 Codex wrapper를 verbatim 실행하라"고 지시하지만, 5.2z는 receipt write를 소유한 `plan-codex-runner.js`를 detached로 띄우고 hybrid 경로에서는 `$CODEX_STDOUT`이 애초에 설정되지 않는다. 결과는 둘 중 하나다 — L1/L2 proof가 생기기 전에 legacy receipt가 봉인되거나, `codex-verdict` 부재로 L3가 미완료 처리돼 무조건 `unavailable` HALT.

M3는 **배선만** 고친다: L3를 5.2z 위임에서 떼어내 receipt를 쓰지 않는 전용 호출(`plan-review/cli.js l3`)로 분리하고, 그 호출이 `l3.json`을 직접 산출한다. 이중 writer는 순서 보장을 강화하는 것이 아니라 **hybrid에서 runner를 아예 띄우지 않아 요건 자체를 소거**한다. 발화 대상의 자동 판정(A/B/C 신호)은 `diverse-agent-review.prd.md` #2 소관으로 남긴다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | M3 범위는 배선만으로 한정하고 죽은 opt-in 경로를 복구한다 | direction |
| UI2 | 발화 대상을 신호로 자동 판정하는 오라클은 이번 milestone에서 만들지 않는다 | exclusion |
| UI3 | L3 자동 트리거 축은 diverse-agent-review PRD 소관으로 남긴다 | exclusion |
| UI4 | PRD가 M3 설계 입력으로 넘긴 세 항목(runner 시퀀스, 이중 writer, 승격 사실 봉인)을 다룬다 | constraint |
| UI5 | `/mccp:prp-implement`의 Implement-Codex 게이트는 건드리지 않는다 | exclusion |
| UI6 | Codex 자체를 다른 리뷰어로 교체하지 않는다 | exclusion |
| UI7 | 완벽한 리뷰어 독립성은 목표가 아니며 완화까지만 추구한다 | constraint |
| UI8 | 게이트 성능과 비용 최적화는 이번 범위 밖이다 | exclusion |
| UI9 | 리뷰 라운드는 1회를 기본으로 하고 미해소 항목은 backlog로 이연한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/plan-review/quorum.js:22` | 모듈 상단에 `ENV_*` 상수 선언 후 순수 파서 export |
| Errors | `plugins/mccp/scripts/lib/plan-review/cli.js:102` | 판독 불가 입력은 usage 오류가 아니라 BLOCK — sentinel 반환 후 caller가 exit 12 |
| Errors | `plugins/mccp/scripts/lib/codex-review-payload.js:99` | fallback 경로는 `converged`를 절대 생산하지 못한다(승인은 스캔의 권한이 아님) |
| Data access | `plugins/mccp/scripts/lib/plan-codex-runner.js:78` | tmp+rename 원자 쓰기 + `mode: 0o600` |
| Data access | `plugins/mccp/scripts/lib/plan-review/cli.js:169` | `insideRoot`/`resolveContained` — 읽고 쓰는 경로는 repo 안으로 봉쇄 |
| Detached 실행 | `plugins/mccp/commands/plan.md` 5.2z | codex 900s > Bash 600s이므로 detached 실행 + nonce 경로 poll + 상태별 분기 |
| Tests | `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js:39` | 커맨드 본문의 **배선**을 정적 단언으로 고정(산문이 아니라 fenced bash 블록만 린트) |
| Tests | `plugins/mccp/scripts/lib/tests/plan-review-decide.test.js:216` | `{invoked:false, reason:...}` 형태를 그대로 오라클에 먹여 행 단위 검증 |

> **Phase 2.5 fan-out 미실행** — 이 세션의 운영 지시가 Workflow 사용을 명시 요청 시로 제한한다. 커맨드 본문이 fail-open으로 허용하는 인라인 Pattern Grounding 경로를 택했고(위 표가 그 산출물), 게이트인 5.2 L2 패널은 이 완화 대상이 아니다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/l3.js` | CREATE | codex-invoke 출력을 `l3.json` 레코드로 매핑하는 순수 오라클 + 전용 호출 |
| `plugins/mccp/scripts/lib/plan-review/cli.js` | UPDATE | `l3` 서브커맨드 추가 + dispatch/usage 등재 |
| `plugins/mccp/commands/plan.md` | UPDATE | 5.2a-0 조기 HALT · 5.2f 재작성(5.2z 위임 제거) · 5.6b `--review-l3-reason` forward |
| `plugins/mccp/scripts/lib/tests/plan-review-l3.test.js` | CREATE | 오라클 행 단위 + 서브커맨드 통합(codex-invoke 대역) |
| `plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js` | UPDATE | hybrid 경로가 runner/5.2z를 부르지 않음 · `hybrid_without_l3` 소비 정적 단언 |
| `docs/gate-design.md` | UPDATE | `## Hybrid L3 wiring` anchor 신설(CLAUDE.md 상세 위임처) |
| `docs/environment/review.md` | UPDATE | hybrid는 env 2개가 함께 필요하고 하나만 켜면 조기 HALT임을 기술 |
| `CLAUDE.md` | UPDATE | §3.13.3 신설 — 요약 + anchor 링크 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (PRD 최종 milestone → minor) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 신규 항목 + `currently` 노트 동기 |
| `.claude/prds/codex-intent-context.prd.md` | UPDATE | M3 status flip + 정직 표기 |

## Design Decisions

> 저자 정당화. `## User Intent`와 분리되어 있으며 리뷰어 focus에 주입되지 않는다.

- **DD1 — 이중 writer는 순서 보장이 아니라 소거로 닫는다.** PRD 설계 입력 (b)는 "runner가 5.6b보다 먼저 끝난다는 보장이 없다"고 지적한다. 순서를 보장하려면 hybrid에서도 runner를 띄운 뒤 완료를 기다려야 하는데, 그러면 receipt writer가 둘인 상태 자체는 유지된다. L3를 receipt를 쓰지 않는 전용 호출로 바꾸면 hybrid에서 runner가 **존재하지 않으므로** 순서 요건이 사라진다. 남는 것은 "hybrid 경로가 runner를 부르지 않는다"는 정적 단언 하나이고, 이는 test 하나에 걸린 방어가 아니라 구조다.
- **DD2 — `l3` 서브커맨드는 receipt·adjudication·lock을 갖지 않는다.** L3는 판정 입력 하나(Codex verdict)를 만들 뿐이고, 판정 자체는 `decide`가 단독 소유한다. 여기에 blocking 권한을 주면 차단 지점이 둘이 되어 어느 쪽이 막았는지 사후에 갈리지 않는다. 따라서 `invoked:false`를 써도 exit 0이고, **아티팩트를 쓰지 못한 경우에만** exit 12다 — 그 경우 `decide`는 어차피 fail-closed지만 사유를 "L3가 안 돌았다"로 잘못 말하게 되므로 정확한 원인을 5.2f에서 표면화한다.
- **DD3 — 빈 verdict를 shell이 조립할 수 없게 한다.** 현행 Step 2는 `printf`로 JSON을 만든다. 변수가 비면 오라클 enum이 금지하는 값이 그대로 파일에 실린다(`decide.js:355` 주석이 같은 위험을 지적한다). 레코드 생산을 Node로 옮기고 `REVIEW_VERDICT_VALUES` 멤버십을 방출 전에 검사해, 벗어나면 `verdict` 키 없이 `invoked:false`로 접는다.
- **DD4 — 실패 분류는 `invoked:false`로 접고 `verdict:'unavailable'`을 쓰지 않는다.** 둘 다 fail-closed지만 후자는 "Codex가 말했고 그 말이 unavailable이었다"를 주장한다. `classification`이 `disabled`·`timeout`·`not-authenticated` 등인 경우는 Codex가 발화하지 못한 것이므로 `invoked:false` + 사유가 정직하다. `decide`의 `!ran` 분기가 이미 이 형태를 `unavailable`/`multi-agent`로 접는다.
- **DD5 — `codex-verdict`·`codex-class` 브리지 아티팩트는 계속 생산한다.** 5.6b가 그 파일에서 `--codex-verdict`를 읽어 `resolution.codex_verdict`를 봉인하고, hybrid는 `CROSS_MODEL_SOURCES` 원소라 cross-gate dedupe가 그 값을 읽는다. 생산자를 5.2z에서 `l3` 서브커맨드로 옮기되 **파일명과 5.6b는 무변경**으로 둔다 — 5.6b를 함께 고치면 codex 경로까지 회귀 사거리에 들어온다.
- **DD6 — run nonce로 stale/동시 실행을 가른다.** 5.2 진입 시 `l3.json`을 purge하지만, 같은 repo에서 두 `/mccp:plan`이 겹치면 `REVIEW_DIR` 전체가 이미 충돌한다(선재 한계, 신규 축 아님). L3만 별도 lock을 만드는 대신 레코드에 `run_nonce`를 실어 poll이 자기 것만 수용하게 한다 — runner가 이미 검증한 규율이고 비용이 거의 없다.
- **DD7 — `hybrid_without_l3`를 패널 예약 이전에 소비한다.** `cmdMode`가 이 값을 계산해 두었는데 커맨드 본문이 읽지 않는다. `MCCP_PLAN_REVIEW_L3` 기본값은 `off`이므로 hybrid만 켠 운영자는 4 에이전트와 8분을 쓰고 **확정된** HALT에 도달한다. 조기 HALT는 새 정책이 아니라 이미 확정된 결과를 앞당기는 것이다.
- **DD8 — 승격 사실 봉인은 신규 필드 없이 `meta.review_l3_reason`으로 한다.** `write.js:762`가 이미 받는데 5.6b가 forward하지 않는다. 신규 필드를 만들면 `makeSkeleton`·hash 안정성·schema 페어링 판단이 따라붙는다(§3.12). 배선만 잇는 것이 UI1과 정합한다.

## Tasks

### Task 1: `plan-review/l3.js` — 레코드 오라클
- **Action**: `buildL3Record({ classification, exitCode, blocking, envelope, freeText, runNonce })`가 `{invoked, verdict?, reason, run_nonce}`를 반환하는 순수 함수를 export한다. `classification === 'ok'` 이고 `blocking !== true` 이고 `exitCode === 0` 일 때만 `codex-review-payload.deriveGateVerdict`로 verdict를 뽑고, 그 값이 `REVIEW_VERDICT_VALUES` 멤버가 아니면 `invoked:false`로 접는다. 그 외 전 분류는 `{invoked:false, reason:'classification=<c>'}`.
- **Mirror**: `codex-review-payload.js:99`(fallback은 승인을 못 만든다) · `quorum.js:22`(상수 상단 선언)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-l3.test.js`

### Task 2: `plan-review/cli.js l3` — 전용 호출
- **Action**: `l3 --review-dir <dir> --plan <p> [--prd <p>] --focus <text> --run-nonce <n> [--impeccable-available]`. `resolveContained`로 `--review-dir`을 repo 안으로 봉쇄하고, `codexInvoke.invokeAdversarialReview`를 in-process 호출한 뒤 Task 1로 레코드를 만들어 `l3.json`·`codex-verdict`·`codex-class`를 tmp+rename으로 쓴다. 레코드를 썼으면 exit 0(`invoked:false` 포함), 쓰지 못했으면 exit 12. dispatch와 `usage()`에 등재.
- **Mirror**: `cli.js:102` readJsonOrBlock의 BLOCK 규약 · `plan-codex-runner.js:78` writePrivate
- **Validate**: `node plugins/mccp/scripts/lib/plan-review/cli.js l3` (인자 없이 → usage, exit 2)

### Task 3: `plan.md` 5.2a-0 — hybrid 조기 HALT
- **Action**: 5.2a 앞에 블록 추가. `mode.json`의 `hybrid_without_l3`가 true면 `--halt-stage 5.2a-0`로 record 후 exit 12. 메시지는 복구 두 갈래(`MCCP_PLAN_REVIEW_L3=1` 설정 · `MCCP_PLAN_REVIEW=multi-agent`로 하향)를 명시. 판독 불가 `mode.json`은 여기서 판정하지 않고 기존 5.2f Step 0의 분기에 맡긴다.
- **Mirror**: `plan.md` 5.2b 블록(자기 블록에서 record → exit)
- **Validate**: `MCCP_PLAN_REVIEW=hybrid` 로 `cli.js mode` 실행 → `hybrid_without_l3:true` 확인
- **표 동기**: 5.2 "enforcement table"에 `5.2a-0` 행 추가 — 그 표는 command-body test가 shell 배선과 대조하므로 누락 시 red

### Task 4: `plan.md` 5.2f 재작성
- **Action**: Step 1을 "5.2z verbatim 실행"에서 `l3` 서브커맨드 detached 실행 + `l3.json` poll로 교체. deadline은 codex 900s보다 여유 있게(1000s), 상태 3종(`succeeded` / `died-without-record` / `timeout`)을 각각 분기하고 후자 둘은 `--halt-stage 5.2f` record 후 exit. run nonce 불일치 레코드는 수용하지 않는다. Step 2(printf JSON 조립)는 삭제 — 생산자가 Node로 옮겨졌다. 5.2z의 브리지 아티팩트가 이제 `l3`에서도 생산됨을 명시.
- **Mirror**: `plan.md` 5.2z의 poll 루프(nonce 경로 · 상태별 분기 · 성공을 가정하지 않는 규약)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js`

### Task 5: `plan.md` 5.6b — `--review-l3-reason` forward
- **Action**: `REVIEW_SOURCE=hybrid` 분기에서 `l3.json`의 `reason`을 읽어 `--review-l3-reason`으로 함께 forward. 값이 비면 플래그를 생략(write.js가 빈 문자열을 무시하므로 동작은 같지만 의도를 셸에서 명시).
- **Mirror**: 같은 블록의 `--review-l3-invoked` forward
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-write-invariants.test.js`

### Task 6: 정적 배선 단언
- **Action**: `plan-review-command-body.test.js`에 3건 추가 — (a) 5.2f 구간의 fenced bash에 `plan-codex-runner.js`가 0회 등장, (b) 5.2f 산문에 5.2z를 verbatim 실행하라는 지시가 없음, (c) `hybrid_without_l3`가 최소 1개 bash 블록에서 읽힘. 기존 F1(recorder가 분기 마지막 문장이 아님) 규칙이 신규 HALT에도 적용되는지 확인.
- **Mirror**: 같은 파일 `:97` "enforcement table matches the stages actually wired in shell"
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js`

### Task 7: 오라클/서브커맨드 test
- **Action**: `plan-review-l3.test.js` 신설 — 분류 표 전 행(ok·disabled·timeout·not-authenticated·exit-nonzero·stdout-empty·parse-error) × verdict 매핑, enum 밖 verdict의 접힘, free-text가 `converged`를 못 만듦, `run_nonce` 왕복, 아티팩트 3종 원자 쓰기. codex-invoke는 주입 대역으로 대체(네트워크 0).
- **Mirror**: `plan-review-decide.test.js:216`
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-l3.test.js`

### Task 8: 라이브 완주 1회
- **Action**: `MCCP_PLAN_REVIEW=hybrid MCCP_PLAN_REVIEW_L3=1`로 `/mccp:plan`을 실제 1회 완주하고 산출물을 확인. 실패 시 원인을 backlog에 등재하고 그 사실을 report에 남긴다(초록 test가 완주를 대신하지 않는다).
- **Mirror**: `.claude/plans/diverse-agent-review-m6.plan.md`의 라이브 실측 규약
- **Validate**: 아래 Acceptance 마지막 항목의 산출물 3종

### Task 9: 문서 + version 동기
- **Action**: `docs/gate-design.md`에 `## Hybrid L3 wiring` anchor 신설(배선 전후·상태 표·복구 절차), `docs/environment/review.md`에 env 2개 동시 요구와 조기 HALT 기술, `CLAUDE.md` §3.13.3 신설(요약 + anchor 링크). §3.7 4면 동기: `plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md`(`currently` 노트 + 신규 항목). **version target은 머지 해소 시점과 `/mccp:pr` 직전 두 번 재계산한다** — 현재 base 기준 후보는 `1.31.0`(PRD 최종 milestone → minor).
- **Mirror**: `CHANGELOG.md:9` §3.7 근거 서술 형식
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

### Task 10: PRD status flip
- **Action**: M3 행을 `pending`에서 `complete`로 바꾸고 Plan 경로를 채운다. 그리고 **주장하지 않는 것**을 명시 — (a) 발화 대상 자동 판정은 여전히 없다, (b) hybrid는 opt-in이며 기본 모드는 `multi-agent`다, (c) 라이브 완주가 Task 8에서 실패했다면 그 사실 그대로.
- **Mirror**: 같은 PRD의 M2 `complete` 근거 블록
- **Validate**: 육안 + `instruction-contract/lint.js`

## Validation

```bash
# 1. 신규 + 인접 test
node --test plugins/mccp/scripts/lib/tests/plan-review-l3.test.js
node --test plugins/mccp/scripts/lib/tests/plan-review-command-body.test.js
node --test plugins/mccp/scripts/lib/tests/plan-review-decide.test.js
node --test plugins/mccp/scripts/lib/tests/plan-review-write-invariants.test.js

# 2. plan-review 전체 회귀
node --test plugins/mccp/scripts/lib/tests/plan-review-*.test.js

# 3. receipt schema + renderer surface
node --test plugins/mccp/scripts/receipt/tests/
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 4. CLAUDE.md 상주 계약
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 5. 조기 HALT 오라클 확인 (에이전트 0개)
MCCP_PLAN_REVIEW=hybrid node plugins/mccp/scripts/lib/plan-review/cli.js mode
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `l3` 전용 호출이 codex 900s를 넘겨 Bash 600s에 잘림 | 高 | detached 실행 + `l3.json` poll (5.2z가 이미 검증한 규율). deadline 1000s, 초과는 HALT이며 성공 가정 없음 |
| 브리지 아티팩트 생산자 이동으로 codex 경로가 회귀 | 中 | 파일명·5.6b 무변경(DD5). `mode=codex` 경로는 diff 사거리 밖이고 command-body test가 5.2z 블록 보존을 단언 |
| hybrid 라이브 완주가 Codex 인증/쿼터로 막힘 | 中 | M1.5 Task 0의 선례(쿼터 소진 → fallback ship). 막히면 배선 test로 ship하고 **완주 미달을 PRD에 정직 표기** — 초록 test를 완주로 바꿔 부르지 않는다 |
| `hybrid_without_l3` 조기 HALT가 정상 hybrid를 막음 | 低 | 값은 `mode.json`에서 읽고 `mode === 'hybrid'` 이면서 L3가 꺼져 있을 때만 참. 판독 불가는 이 블록에서 판정하지 않는다(DD7) |
| 병렬 브랜치 version 충돌 (§3.7 실측 4회 재발) | 中 | target을 머지 해소 시점과 `/mccp:pr` 직전 두 번 재계산 + 재상향 후 4면 동기 전량 재검증 |
| `.worktrees/codex-intent-context-m2`는 이미 머지된 branch의 worktree | 中 | M3는 신규 branch + `.worktrees/codex-intent-context-m3/`에서 진행(§3.8). 구 worktree는 cleanup 대상 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] hybrid 경로의 fenced bash에서 `plan-codex-runner.js` 등장 0회 — 이중 writer가 순서 보장이 아니라 부재로 닫혔다
- [ ] `MCCP_PLAN_REVIEW=hybrid` 단독 설정이 **에이전트 0개**로 HALT
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동) — 라이브 hybrid 실행이 (1) `.claude/state/plan-review/l3.json`에 `invoked:true` + enum 안의 `verdict`, (2) `review_source='hybrid'` + `review_proof.layers.l3`를 가진 `mccp-plan-codex` receipt, (3) 그 receipt의 `meta.review_l3_invoked` + `meta.review_l3_reason` + `resolution.codex_verdict`를 산출할 것. 완주하지 못했으면 그 사실을 PRD와 report에 그대로 기록한다

## Design Critique

trigger: axis a — `impeccable-detect.js detect --mode plan` returned `design_signal=true`
(`skill_available=true`, `reason=ok`). signal files: `plugins/mccp/scripts/lib/renderer/html.js` ·
`plugins/mccp/scripts/lib/renderer/markdown.js`. SKILL first-step Read 완료 —
`plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints`.

retry loop: round 0 / cap 2 · verdict **CONVERGED** (`decideCritique` 오라클 판정, HIGH/CRITICAL/UNKNOWN 0건).

이 plan이 도입하는 렌더 표면 변경은 §3.7 4면 동기의 version 문자열 치환 2건이 전부다
(`html.js` page-foot · `markdown.js` derived 줄). 4개 anchor 대조 결과:

| Anchor | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | 무위반 | 신규 heading 0건. 인접 `<h2 class="page-title">`는 무변경 |
| 강조색 화면당 1개 | 무위반 | 신규 accent/highlight 토큰 0건. `page-foot mono` 클래스 유지 |
| raw markdown marker 금지 | 무위반 | `_derived from …_`는 markdown 소비처에서 렌더되는 정상 마크업이며 치환 대상은 version 문자열뿐 |
| 한 화면 항목 수 상한 | 무위반 | list-of-N 섹션에 항목을 더하지 않는다 |

비차단 관찰 2건 (LOW — §3.14에 따라 흡수하지 않고 기록만):

- **LOW / `## Tasks` Task 9** — `i18n-surface.test.js`는 기대값을 `plugin.json`에서 파생하므로 version *drift*는 잡지만 렌더 결과의 가독성은 검사하지 않는다. 이번 변경 폭(문자열 치환)에서는 그 격차가 실질 위험이 아니다.
- **LOW / `## Risks`** — `Files to Change`에 renderer 2면이 있으므로 implement 단계에서도 detector가 positive를 낼 것이고 critique loop이 다시 돈다. 비용은 라운드 1회이며 게이트를 막지 않는다.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). plan 단계에는 렌더된 UI가 없으므로 어떤 impeccable 명령도 **호출하지 않는다** — 아래는 implement 단계 체크리스트다.

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

<!-- placeholder: will be replaced by Phase 7.3 -->

## External Research Provenance

- Source PRD: .claude/prds/codex-intent-context.prd.md
- References section sha256: 8fece5c94acfa1a583e0de7beae9e1d075c2461b9be38072f36cd8c9d21fd9bf
- Stamped at: 2026-08-21T04:11:56.504Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt's plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.
