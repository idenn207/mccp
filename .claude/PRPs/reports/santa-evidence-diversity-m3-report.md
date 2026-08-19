# Implementation Report: santa 증거 다양성 M3 — degrade 차단

**Plan**: `.claude/plans/santa-evidence-diversity-m3.plan.md` (편집 없음 — `plan_hash` 봉인 유지)
**Branch**: `santa-evidence-diversity`
**Version**: `1.29.1 → 1.30.0` (minor — PRD 전 milestone 완료)
**게이트 산출물**: `.claude/notes/santa-evidence-diversity-m3.md`

## Summary

`codex`도 `gemini`도 없는 머신에서 Reviewer B는 두 번째 Claude Opus로 떨어진다. 그 조합의
NICE는 이종 조합의 NICE와 **어느 표면에서도 구분되지 않았다**. M3은 신규 순수 oracle
`model-diversity.js`가 원장에 이미 있는 리뷰어 `model` 문자열에서 계열을 분류하고, 봉인
층(`seal.deriveVerdict`)이 `converged`를 `degraded`로 좁혀 push를 막되 감사되는 사람 승인
경로(`MCCP_SANTA_DEGRADE_ACK`)를 남긴다. 리뷰어 수는 늘지 않았고 라운드 판정(`gate.js`,
P1 소유·동결)은 무접촉이다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 예측대로 |
| Files Changed | 16 | 16 (신규 1 · 수정 15) |
| 신규 export | 11 | 11 |
| 신규 회귀 test | "3파일" | 33건 신규 (lanes 23 · review-gate 8 · cap 2) |
| 예상 외 수정 | — | test fixture 모델명 2파일 (아래 Deviations) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `model-diversity.js` 순수 oracle | 완료 | export 11종. security-reviewer F1·F4 흡수로 `familyOf` 규칙이 plan보다 **엄격**해졌다 |
| 2 | `seal.js` 배선 (판정·리포트·writeArgs·반환) | 완료 | `exitReason` 술어를 `!== 'divergent'`로 일반화 (plan 미기재 — 아래 Deviations) |
| 3 | receipt 5필드 (`write.js` + `schema.js`) | 완료 | 양방향 불변식이 **write 시점에** 발화한다(예상보다 이른 지점) |
| 4 | `cli.js` `--model` PATH 재도출 | 완료 | `isOnPath` 헬퍼 1개 추가. 신규 exit code·플래그 0건 |
| 5 | `santa-loop.md` 4개 편집 지점 | 완료 | Step 3 · Step 5.5 3갈래 · Output · Notes 5항목 |
| 6 | 회귀 test 3파일 | 완료 | 33건 신규, **단언 삭제 0건** |
| 7 | 실측 — 게이트 경로 1회 완주 | 완료 | 5건 전부 성립 + 계획 외 1건(부실 사유 거부) |
| 8 | 문서 4면 + PRD + 소유권 + version | 완료 | ENVIRONMENT §11 2행 · ownership 3절 · PRD status + OQ 3건 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | N/A | 이 저장소는 `package.json`이 없다 — type-check/lint/build 스크립트 부재. Node 20+ 순수 JS |
| Unit Tests | 통과 | santa 전량 **269건 중 266 pass · 0 fail · 3 skipped**(선재 skip) |
| Build | N/A | 빌드 산출물 없음 (plugin은 소스 그대로 로드) |
| Integration | 통과 | Task 7 probe — 실제 CLI를 실제 git repo에서 완주 |
| Edge Cases | 통과 | 비문자열·다중매치·legacy 투영·라운드 0건·부실 ack 사유 |

### Plan Validation 1~6

| # | Command | 결과 |
|---|---|---|
| 1 | `santa-lanes` + `santa-loop-cap` | 126 tests · 123 pass · 0 fail · 3 skipped |
| 2 | santa 전량 + receipt 표면 | 143 tests · 143 pass · 0 fail |
| 3 | `pr-ship-gate` + `REVIEW_VERDICT_VALUES` grep | 28 pass · 0 fail. `review-verdict.js`·`pr-ship-gate.js`·`receipt-convergence.js`에서 `degraded` **0건** |
| 4 | `i18n-surface` (version 4면) | 10 pass · 0 fail |
| 5 | 미설치 CLI 계열 선언 거부 | exit 2 (**plan 문언 정정 — 아래 Deviations**) |
| 6 | 소유권 표 등재 | `grep -c 'model-diversity.js'` = 2 |

### 광역 회귀 — receipt 전 test 디렉토리

632 tests · **631 pass · 0 fail · 1 skipped**(2회차). 1회차에서
`evidence-lock.test.js`의 "N-writer stress"가 1건 붉었으나 **부하 의존 flake**로 확인했다 —
단독 실행 2회 18/18 pass, 전량 재실행에서도 0 fail. M3은 `evidence-lock.js`·`store.js`의
동시성 경로를 건드리지 않는다.

### Design Grounding

**N/A (no design trigger)** — Phase 2.5.5b의 `impeccable-detect`가 `design_signal=false`
(`reason=no-signal`)를 냈다. `SKILL_AVAIL=1 · SIGNAL=0` 행이라 silent-skip으로 기록하고
receipt에 `impeccable_silent_skip=true` + `reason='no-signal'`을 stamp했다. 따라서 Phase
2.5.5c capture · Phase 3.6 design-finish · Phase 3.7 grounding verify는 전부 no-op이다.

**detector 시점 문제를 기록한다**: Task 8의 version bump이 `renderer/html.js`·
`renderer/markdown.js`(design-gate whitelist 파일)를 건드리므로, detector가 EXECUTE **이후**
돌았다면 positive였을 것이다. detector는 게이트 진입 시점의 diff를 보므로 그때는 빈 diff였다.
그 변경은 **version 리터럴 1개**(`v1.29.1` → `v1.30.0`)뿐이고 rendered surface의 구조·색·
마크다운 마커·항목 수는 무변경이라, plan 본문의 `## Design Critique` 절이 이미 4 Output
Constraints 전건 PASS로 판정해 두었다(verdict CONVERGED). 이것은 documented detector 시점
gap이지 이 사이클의 회피가 아니다.

## Files Changed

| File | Action | 요지 |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/model-diversity.js` | CREATED | +217 · 순수 oracle, export 11종 |
| `plugins/mccp/scripts/lib/santa/seal.js` | UPDATED | `deriveVerdict` 제3값 · 사영 1지점 · 리포트 1줄 · writeArgs 5키 · 반환 3키 |
| `plugins/mccp/scripts/lib/santa/cli.js` | UPDATED | `isOnPath` + `--model` 계열 재도출 |
| `plugins/mccp/scripts/receipt/write.js` | UPDATED | `SANTA_INT_FIELDS` 1행 + 조건부 stamp 4블록 |
| `plugins/mccp/scripts/receipt/schema.js` | UPDATED | present-only 검증 5종 + 양방향 불변식 |
| `plugins/mccp/commands/santa-loop.md` | UPDATED | Step 3 · Step 5.5 · Output · Notes |
| `plugins/mccp/scripts/lib/tests/santa-lanes.test.js` | UPDATED | M3 블록 23건 (47 → 70) |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATED | 3목록 확장 + Step 5.5 구조 test 2건 (54 → 56) |
| `plugins/mccp/scripts/receipt/tests/santa-review-gate.test.js` | UPDATED | 8건 (17 → 25) |
| `plugins/mccp/scripts/lib/tests/santa-seal.test.js` | UPDATED | fixture 모델명 (Deviations) |
| `plugins/mccp/scripts/lib/tests/santa-adjudication.test.js` | UPDATED | fixture 모델명 (Deviations) |
| `docs/ENVIRONMENT.md` | UPDATED | §11 토글 2행 |
| `docs/santa-loop/ownership.md` | UPDATED | 표 1행 + M3 절 3개 + 경로 수 9 → 10 |
| `.claude/prds/santa-evidence-diversity.prd.md` | UPDATED | Milestone 3 complete · OQ 해소 1 · 소유자 확정 1 · 신규 1 |
| `CHANGELOG.md` | UPDATED | `## [1.30.0]` |
| `plugins/mccp/.claude-plugin/plugin.json` · `renderer/html.js` · `renderer/markdown.js` | UPDATED | version 4면 동기 |

## Deviations from Plan

1. **`familyOf`가 plan보다 엄격하다 — 다중매치도 `unknown`.**
   plan Task 1은 카탈로그 3종만 적고 **평가 순서를 명시하지 않았다**. security-reviewer가
   CRITICAL로 지적했고(`claude-gpt-bridge`가 순서에 따라 갈린다), 처방으로 precedence 표를
   제안했다. **그 처방은 채택하지 않았다** — precedence는 모호한 문자열에 *어떤 계열이든
   하나를* 주고 그 하나가 상대와 다르면 곧바로 이종 판정을 산다. DD3의 원칙("모르겠다가
   승인을 사지 못하게 한다")과 반대 방향이라, 매치된 계열이 **정확히 1이 아니면** unknown으로
   접었다. 0건도 2건 이상도 unknown. precedence보다 엄격하고 DD3의 판정 2줄은 무변경이다.

2. **`seal.js`의 `exitReason` 투영 술어를 일반화했다 (plan 미기재).**
   `verdict === 'converged' ? null : rawAgg.exitReason`을 `verdict !== 'divergent'`로 바꿨다.
   verdict가 2값이던 동안 두 술어는 **같았고** `degraded`가 처음으로 그 둘을 가른다. 이
   자리가 답해야 하는 질문은 "**라운드가** 수렴 없이 끝났는가"이고 degraded 라운드는
   수렴했다(`fin.verdict !== 'NICE'` 절을 이미 통과했다) — 좁힌 것은 봉인이지 라운드가
   아니다. 원래 술어를 두면 degraded 실행이 재진입 거부 마커를 종료 사유로 실어
   `santa_exit_reason`이 "캡이 끝냈다"를 거짓으로 주장한다. 회귀는 `[79]`가 지킨다.

3. **test fixture 모델명을 2파일에서 바꿨다 (plan 미기재, 불가피).**
   `santa-seal.test.js`(39곳)와 `santa-adjudication.test.js`(헬퍼 2곳)의 fixture가
   `m-a`/`m-b`·`model-A`/`model-B` 플레이스홀더를 써서, M3 이후 전부 `unknown` → degraded로
   떨어져 `converged`를 단언하는 기존 test들이 붉어졌다. **단언을 지우거나 게이트를 끄지
   않고 fixture를 정직하게** 만들었다 — 실제 실행의 Reviewer A는 `opus`, B는 `gpt-5.4`이므로
   이 fixture는 이제 "두 리뷰어"가 아니라 "두 **이종** 리뷰어"를 뜻하고 그것이 애초에 그
   단언들이 말하려던 상태다. `record --model`을 타는 call site(2곳)는 **바꾸지 않았다** —
   `gpt-5.4`를 넘기면 PATH 대조가 걸려 test가 이 머신에 codex가 설치됐는지에 따라 갈린다.
   `santa-adjudication.test.js`는 소유권 표의 **P1 행**이라, 변경을 `modelFor` 헬퍼 1개로
   국소화하고 근거를 주석 한 문단으로 남겼다.

4. **Validation 5의 plan 문언이 위양성이라 교체했다.**
   plan은 `--reviewer-file /dev/null`을 넘기는데 `cli.js:296-306`이 파일을 먼저 읽어
   `JSON.parse('')`로 던지므로(`SANTA_REVIEWER_INVALID`) `:326`의 `--model` 검사에
   **도달하지 않는다**. exit code가 우연히 2로 같아 통과하는 것처럼 보이는 test였다
   (plan-review 패널이 test #1 HIGH로 지적, 수용). 유효한 최소 reviewer JSON으로 교체해
   실제 경로를 타게 했고 결과는 `SANTA_MODEL_UNAVAILABLE` exit 2다. plan 본문은 `plan_hash`
   봉인이라 미편집.

5. **Task 5 Validate의 매달린 참조를 실체화했다.**
   plan Task 5의 Validate가 "Task 6의 커맨드 본문 구조 test"를 참조하는데 Task 6은 그것을
   요구하지 않았다(plan-review 자체 발견, 수용). `santa-loop-cap.test.js`에 M3 절 2건을
   추가해 Step 5.5의 **degraded 선검사 순서**와 ack 분기·env 재해석 금지·DD7 안내 표시를
   기계적으로 고정했다.

6. **양방향 불변식이 write 시점에 발화한다 (예상보다 이른 지점).**
   plan Task 3은 schema 검증만 요구했으나, `write()`가 내부에서 `validate()`를 돌려
   `SCHEMA_INVALID`로 **던지므로** 한쪽만 넘긴 호출은 깨진 receipt를 만들지도 못한다. test를
   `assert.throws`로 맞췄다 — 계약이 약해진 것이 아니라 강해진 지점이다.

## Issues Encountered

- **Codex 미발화**: `MCCP_CODEX_DISABLED=1`(user-level `settings.json`)이라
  `classification=disabled` → first-class skip → `codex_verdict='skipped'`. 이 사이클의
  cross-model 축은 비어 있고, security-reviewer가 그 자리를 **대신하지 않는다**(다른 축이다).
- **security-reviewer 부정확 1건**: "`cli.js:326`이 `model`을 문자열로 검사하지 않는다"는
  틀렸다(그 줄이 정확히 그 검사다). 그러나 결론은 유효했다 — `familyOf`의 다른 입력원인
  `seal.project()`의 `e.model`은 원장에서 읽은 값이라 그 검사를 거치지 않으므로 `typeof`
  가드가 필요하다.
- **`evidence-lock` N-writer stress flake**: 전량 병렬 실행 1회차에서만 붉었다. 단독 2회 +
  전량 재실행에서 0 fail. M3 무관.
- **선재 red (main 승계)**: `renderer/verdict-label.test.js` · `b2-coverage-gate` 2건. 이
  사이클과 무관하며 그대로 남는다.

## Tests Written

| Test File | 신규 | 커버 |
|---|---|---|
| `santa-lanes.test.js` | 23건 (47 → 70) | `familyOf` 6 · env 파서 2 · `diversityFrom` 5 · `deriveVerdict` 우선순위 5 · CLI record 2 |
| `santa-review-gate.test.js` | 8건 (17 → 25) | 5필드 왕복 · present-only 부재 · 0 허용 · true-only 불리언 · 열거 · **양방향 불변식** · **DD2 사영 회귀** · hash carve-out 부재 |
| `santa-loop-cap.test.js` | 2건 (54 → 56) | Step 5.5 degraded 선검사 순서 · ack 분기 + env 재해석 금지 + DD7 표시 |

## 이 milestone이 주장하지 않는 것

- **위조 방지가 아니다.** PATH 대조는 *설치되지 않은 CLI를 참칭하는* 경로만 막는다. codex가
  설치된 상태에서 Claude fallback을 쓰고 `gpt-5.4`라고 적는 것은 막지 못하고, Task 7의
  1번과 3번이 그 경우 **구분되지 않는다**. DD6이 명시한 천장이고 PRD Open Question으로 등재.
- **포착률을 측정하지 않았다.** probe가 증명하는 것은 강등 배선이지 degrade가 실제로 놓친
  결함과 상관하는지가 아니다. 그 축은 PRD 지표 5이고 P1 종료 후 산출이다.
- **`off` 레인의 UI3 미충족은 소유하지 않는다.** 처방이 달라 한 verdict에 묶지 않았고,
  PRD Open Question의 남은 후보를 신규 milestone 하나로 좁혔다(DD9).

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산 필수**(두 번째 시점). 현재 `1.30.0`이
      origin/main(`1.29.0`)·브랜치(`1.29.1`) 양쪽보다 앞서지만, 그 사이 main이 발행하면 상향.
- [ ] merge 후 worktree cleanup + `claude plugin update`
- [ ] PRD 전 milestone complete → `/mccp:archive-complete` 대상(별도 human gate, 이 사이클 아님)
