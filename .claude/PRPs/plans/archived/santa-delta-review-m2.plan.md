# Plan: santa 델타 리뷰 M2 — 탐지율 보존 검증

**Source PRD**: `.claude/prds/santa-delta-review.prd.md`
**Selected Milestone**: 2 — 탐지율 보존 검증
**Complexity**: Medium

## Summary

M1은 스코프를 좁혔고 *얼마나 줄었는가*를 쟀다(5→1 실측). M2는 그 축소가 *결함을 놓치게 하는가*를 잰다. 합성 결함 corpus를 **결함의 위치로 계층화**해 델타가 실제로 무엇을 떨어뜨리는지 측정하고, **측정 전에 확정한 판정 규칙**으로 `MCCP_SANTA_DELTA_SCOPE` default 전환 여부를 결정한다. 하락이 있으면 default는 `off`로 남고 그 측정이 PRD가 말한 롤백 근거가 된다 — M2는 flip을 목표로 삼지 않는다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 리뷰어에게 가는 프롬프트에 pass·승인·문제없음류 상태 단언을 0건으로 유지한다 | constraint |
| UI2 | 탐지율 하락이 없음을 fixture 비교로 입증한 뒤에만 `MCCP_SANTA_DELTA_SCOPE` default를 off에서 enforce로 뒤집는다 | constraint |
| UI3 | 하락이 검출되면 그 측정이 롤백 근거이고 델타 비활성이 기본 동작이다 | direction |
| UI4 | 탐지율 fixture는 합성으로 시작하고 그 한계를 acceptance에 명시한다 | direction |
| UI5 | 검증했다고 과대 주장하지 않는다 | constraint |
| UI6 | 델타를 PR이나 code-review 등 다른 게이트로 확장하지 않는다 | exclusion |
| UI7 | plan과 PRD의 상시 스코프는 델타 축소에서 면제한다 | exclusion |
| UI8 | 라운드 1은 전체 스코프이고 델타는 라운드 2부터다 | exclusion |
| UI9 | 리뷰어에게 원장을 주입하지 않는다 | exclusion |
| UI10 | 패치 자체의 정당성 판단은 terminator가 소유하므로 여기서 다루지 않는다 | exclusion |
| UI11 | 게이트 리뷰는 1라운드를 기본으로 하고 triage 후 진행한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 oracle 경계 | `plugins/mccp/scripts/lib/santa/scope-delta.js:1-18` | fs·git·시각 미접촉, env 파서 1종만. 열거·git show·파일 읽기는 전부 cli.js가 진다 |
| 닫힌 사유 enum | `plugins/mccp/scripts/lib/santa/scope-delta.js:44-52` | 자유 문자열 대신 고정 하이픈 토큰 — 원장·리포트가 무엇이든 받는 필드를 갖지 않게 한다 |
| 미던지는 집계 함수 | `plugins/mccp/scripts/lib/santa/scope-delta.js:397-414` | 어떤 입력에도 던지지 않고, 형태 술어 하나를 공유해 소비처가 갈리지 않게 한다 |
| 실제 CLI를 지나는 fixture test | `plugins/mccp/scripts/lib/tests/santa-delta-instrumentation.test.js:29-63` | mkdtemp + git init 실제 저장소 + runCli stdout/stderr 캡처. 내부 함수 직접 호출로 이음매를 우회하지 않는다 |
| 단일통과 격리 | `plugins/mccp/scripts/lib/tests/santa-delta-instrumentation.test.js:66-73` | 이 저장소 자신의 settings.json이 켠 축이 검사 대상 축을 가리는 것을 제거한다 |
| present-only receipt 필드 | `plugins/mccp/scripts/receipt/schema.js:1074-1084` | 부재와 관측된 0을 다른 상태로 남긴다. makeSkeleton 미포함 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/santa/detection-corpus.js` | CREATE | 계층화 결함 manifest + 순수 커버리지·비교 oracle |
| `plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js` | CREATE | 실제 git fixture + 실제 scope-delta CLI로 계층별 사전 등록 기대치 동결 |
| `plugins/mccp/scripts/lib/santa/scope-delta.js` | UPDATE | 판정 결과 반영(DELTA_SCOPE_DEFAULT) + 근거 주석. 판정이 유지면 주석만 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | MCCP_SANTA_DELTA_SCOPE default·서술 동기 |
| `docs/environment/review.md` | UPDATE | M2 측정 결과·판정·잔여 손실 서술. M1이 남긴 미래 시제 문언 정정 |
| `docs/ENVIRONMENT.md` | UPDATE | 색인 default 동기 |
| `plugins/mccp/commands/santa-loop.md` | UPDATE | Notes의 M2 소유 문장을 실측 결과로 교체 |
| `.claude/notes/santa-delta-review-m2.md` | CREATE | 라이브 비교 실측 기록 + 한계 명시 (UI4·UI5) |
| `.claude/prds/santa-delta-review.prd.md` | UPDATE | M2 status flip + Open Question 4 해소 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump — PRD 전체 완료이므로 minor |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 새 항목 + currently 노트 |
| `.claude/PRPs/reports/santa-delta-review-m2-report.md` | CREATE | 구현 결과 |

## Design Decisions

### DD1 — 결함을 위치로 계층화한다. 그것이 이 측정의 전부다

`narrowScope`는 `paths = diffPaths ∩ keys(ranges)`다(`scope-delta.js:265-272`). 즉 델타의 실효는 **경로째 드롭**이고, 살아남은 경로 안에서는 범위가 *포인터*로 실린다 — 블라인드 레인 리뷰어는 자기 도구로 파일 전체를 읽으므로 범위는 잘라내기가 아니다(`lanes.js:146-188`). 따라서 "탐지율이 떨어지는가"는 단일 질문이 아니라 결함이 어디 있느냐에 따라 답이 다른 네 질문이다:

| Class | 위치 | 델타의 처리 |
|---|---|---|
| `A_IN_FIX` | 직전 fix hunk 안 | 경로 유지 + 범위가 정확히 지목. patch-chasing 부류 |
| `B_SAME_FILE_OUT_OF_RANGE` | fix가 건드린 파일이지만 `CONTEXT_LINES`(20) 밖 | 경로 유지, 범위 밖 — 포인터이지 절단이 아니라는 설계가 여기서 시험된다 |
| `C_DROPPED_PATH` | fix가 건드리지 않은 파일 | 경로째 제거. 산술적으로 스코프 밖 |
| `D_ALWAYS_SCOPE` | plan·PRD 관계 | `scope-always`가 되돌린다 (UI7) |

계층 없이 단일 탐지율 하나를 내면 그 수는 corpus 구성에 의해 결정되고, corpus를 고르는 사람이 답을 고르게 된다. 계층별 수는 그 조작이 불가능하다 — 어느 계층이 몇 건인지가 그대로 보인다.

### DD2 — 두 층으로 재고, 각 층이 무엇을 인증하는지 다르다

- **Layer 1 (결정적, CI 상주)** — *containment*. 심어둔 결함 좌표가 델타 스코프 안에 있는가. LLM이 필요 없고 재현 가능하며 회귀로 동결된다. 이것이 인증하는 명제는 "리뷰어가 찾는다"가 아니라 **리뷰어에게 보일 기회가 있다**이다.
- **Layer 2 (라이브, 1회성, 기록)** — *detection*. 같은 fixture에서 실제 리뷰어를 off·enforce 두 번 돌려 발견 id를 대조한다. 비결정적이라 CI 게이트로 만들지 않는다.

Layer 1만으로는 Class B를 답할 수 없다(경로는 남았는데 리뷰어가 범위 밖을 보는가는 산술이 모른다). Layer 2만으로는 재현이 안 된다. **어느 쪽도 다른 쪽을 대신하지 않는다** — M1 노트가 CLI 완주와 정적 단언에 대해 쓴 것과 같은 자세다.

### DD3 — 판정 규칙을 측정 전에 확정한다

측정을 보고 규칙을 정하면 그것은 측정이 아니라 사후 정당화다. 규칙은 다음 한 줄이고 plan 승인과 함께 동결된다:

> corpus 전체(4계층 합산)에서 델타의 Layer 2 발견 수가 full 대비 단 1건이라도 적으면 default를 뒤집지 않는다. 같거나 크면 뒤집는다.

계층 가중치를 두지 않는다 — 가중치는 곧 "어느 결함이 덜 중요한가"의 선언이고 그 근거가 없다. 합산이 보수적이며, 계층별 수치는 별도로 남으므로 어느 계층이 손실을 만들었는지는 감사에서 구분된다.

**예측을 plan에 적는다**(반증 가능성): Class C는 산술적으로 델타 밖이므로, corpus에 Class C가 1건이라도 있고 full이 그것을 잡으면 규칙상 flip은 성립하지 않는다. 즉 이 plan의 가장 가능성 높은 결론은 "default off 유지 + 측정된 트레이드오프 기록"이다. 그것은 실패가 아니라 PRD M2 outcome의 후반부(하락 시 롤백 근거)이고, UI3이 미리 그 결론을 승인해 두었다.

그렇다면 왜 재는가 — **Class B가 미지수이기 때문이다.** 포인터-아닌-절단 설계가 실제로 파일 내 범위 밖 결함을 보존하는지는 산술이 답하지 않는다. 보존한다면 델타의 실손실은 Class C 하나로 국소화되고, 그것이 후속(면제 목록 확장·anchor 이전 파일 유지 등)의 근거가 된다. 보존하지 않는다면 M1의 설계 근거 자체가 약화된다. 어느 쪽이든 M2의 산출은 숫자가 아니라 **어디서 잃는지**다.

### DD4 — corpus는 데이터이고 oracle은 순수하다

`detection-corpus.js`는 fs·git·시각을 모른다. 파일 내용과 결함 좌표를 **데이터로** 내고, 커버리지 판정은 `{manifest, scope}` → per-defect 레코드의 순수 사상이다. 실제 저장소를 만들고 커밋하고 CLI를 부르는 것은 test가 진다 — `scope-delta.js` ↔ `cli.js`의 경계와 동형이며, 이 경계가 있어야 corpus를 바꾸지 않고 판정 규칙만 test할 수 있다.

`compareCoverage`는 **어떤 입력에도 던지지 않는다**(`deltaCoverageFrom` 규약). 결함 id가 두 스코프 중 한쪽에만 있거나 manifest에 없는 id가 오면 그것을 예외가 아니라 `unknown` 레코드로 낸다 — 측정 도구가 던지면 측정이 중단되고, 중단된 측정은 하락 없음과 구별되지 않는다.

### DD5 — 계층 enum은 닫혀 있고 문자열은 자유롭지 않다

`DEFECT_CLASSES`는 `NO_NARROW` 동형의 닫힌 토큰 집합이다. 계층이 자유 문자열이면 corpus가 커질 때 오타가 새 계층을 만들고, 합산 규칙(DD3)이 그 계층을 조용히 빠뜨린다 — 규칙이 "전체 합산"이라고 적혀 있는데 실제로는 아닌 상태이며, 어떤 단위 test도 그것을 잡지 않는다.

### DD6 — 새 env도 새 CLI 하위명령도 만들지 않는다

측정은 1회성 검증이지 런타임 기능이 아니다. Layer 1은 test가 기존 `scope-delta` 하위명령을 실제로 호출하고, Layer 2는 기존 `/mccp:santa-loop` 경로를 그대로 쓴다. 측정 전용 표면을 만들면 배송 후 아무도 부르지 않는 코드가 남고, 그 코드는 다음 사람에게 유지해야 하는 축으로 보인다.

### DD7 — M1이 남긴 문언을 정정하는 것이 배송의 일부다

`docs/environment/review.md:359`와 `plugins/mccp/commands/santa-loop.md:962`는 현재 "M2가 fixture 비교로 하락 부재를 보이면 그때 default를 뒤집는다"라고 적혀 있다. M2가 끝나고도 그 문장이 남아 있으면 문서가 아직 오지 않은 미래를 가리키게 된다. 판정이 무엇이든 두 자리를 실측 결과로 교체한다.

## Tasks

### Task 1: 계층화 corpus + 순수 oracle
- **Action**: `plugins/mccp/scripts/lib/santa/detection-corpus.js` 신설. export — `DEFECT_CLASSES`(닫힌 토큰 4종) · `DEFECT_CLASS_VALUES` · `buildCorpus()`(파일 내용 + 결함 manifest를 데이터로 반환, 4계층 각 1건 이상) · `coverageOf({manifest, scope})`(per-defect `{id, class, inScope, reason}`) · `compareCoverage({fullCoverage, deltaCoverage})`(`{byClass, totals, degraded}`). fs·git·시각 미접촉, 미던짐.
- **Mirror**: `scope-delta.js:1-18`(모듈 경계) · `scope-delta.js:44-52`(닫힌 enum) · `scope-delta.js:397-414`(미던지는 집계)
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js`

### Task 2: Layer 1 — 결정적 containment 회귀
- **Action**: `plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js` 신설. 실제 mkdtemp + git init 저장소에 corpus를 심고, rev0 커밋 → fix 커밋 + anchor 파일 → 실제 `runCli(['scope-delta', ...])`를 `MCCP_SANTA_DELTA_SCOPE=off`와 `=enforce` 두 번 호출해 `coverageOf`로 대조한다. `withoutSinglePass` 격리를 재사용한다.
- **사전 등록 기대치**(이 test가 동결하는 것): full은 A·B·C 전부 경로 안 / delta는 A 경로 안 + 범위 지목, B 경로 안 + 범위 밖, C 경로 밖. D는 `scope-always` 병합 뒤 두 모드 모두 안(UI7 면제 확인).
- **금지 축 재확인**: 조립된 프롬프트에 `PRIOR_ROUND_PATTERNS` 매치 0건(UI1) — M1 test와 중복이 아니라 corpus 경로 이름으로 재확인하는 것이다.
- **Mirror**: `santa-delta-instrumentation.test.js:29-73`
- **Validate**: 같은 명령. 신규 test는 결정적이어야 하며 반복 실행에 동일 결과.

### Task 3: Layer 2 — 라이브 리뷰어 비교 (1회성)
- **Action**: Task 2의 fixture 저장소에서 santa 라운드 2를 두 번 완주한다 — `MCCP_SANTA_DELTA_SCOPE=off`와 `=enforce`. 각각 실제 리뷰어 레인이 발화하고, 반환된 finding을 corpus 결함 id에 대조해 계층별 발견/미발견을 기록한다. 결과는 `.claude/notes/santa-delta-review-m2.md`.
- **기록 의무**(UI4·UI5): fixture는 합성 1건이고 리뷰어는 비결정적이라는 것, 표본 수, 재실행 시 값이 달라질 수 있다는 것을 노트 서두에 명시한다. "검증했다"가 아니라 "N=1 합성 fixture에서 이렇게 관측됐다"로 적는다.
- **Validate**: 노트에 계층별 대조표 + 두 실행의 조립 프롬프트에 상태 단언 0건.

### Task 4: 사전 등록 규칙 적용 + default 판정
- **Action**: DD3의 규칙을 Task 3 결과에 기계적으로 적용한다.
  - 하락 없음 → `scope-delta.js`의 `DELTA_SCOPE_DEFAULT`를 `'enforce'`로, `registry.js:121`의 default를 `enforce`로, 두 문서 default를 동기.
  - 하락 있음 → 세 자리 전부 `off` 유지. 코드 변경은 근거 주석뿐이고, 문서에 측정치와 잔여 손실 계층을 적는다.
- **어느 분기든 금지**: 규칙을 결과에 맞춰 고치는 것. 규칙이 틀렸다고 판단되면 그것은 M2의 결론이 아니라 새 PRD다.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` — 코드 default와 registry가 갈리면 붉어진다.

### Task 5: 문서 4면 + PRD 갱신
- **Action**: `docs/environment/review.md`(M2 문언 정정 — DD7) · `docs/ENVIRONMENT.md` 색인 · `plugins/mccp/commands/santa-loop.md` Notes · PRD의 M2 status를 complete로, Open Question "탐지율 fixture를 어디서 얻는가"를 해소 표시 + 결정 요약으로.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` · `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`

### Task 6: version 4면 동기
- **Action**: PRD 전 milestone 완료이므로 minor — `plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md` 항목과 currently 노트.
- **재계산 의무**(§3.7): 목표 번호를 미리 고정하지 않는다. base 머지 시점과 `/mccp:pr` 진입 직전 두 번 재계산한다. 현재 origin/main은 1.30.0, 이 worktree는 1.30.1이므로 착지 후보는 1.31.0이나 병렬 브랜치가 선점하면 상향한다.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

### Task 7: report
- **Action**: `.claude/PRPs/reports/santa-delta-review-m2-report.md` — 계층별 측정치, 적용된 판정, 덮지 않은 것.
- **Validate**: 전체 test 스위트.

## Validation

```bash
# 신규 축
node --test plugins/mccp/scripts/lib/tests/santa-detection-coverage.test.js

# M1 회귀 (델타 축 전체)
node --test plugins/mccp/scripts/lib/tests/santa-scope-delta.test.js \
             plugins/mccp/scripts/lib/tests/santa-delta-instrumentation.test.js \
             plugins/mccp/scripts/lib/tests/santa-delta-command-body.test.js \
             plugins/mccp/scripts/lib/tests/santa-lanes.test.js \
             plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js

# env 계약 (코드 default ↔ registry ↔ 문서)
node plugins/mccp/scripts/lib/env-contract/lint.js

# instruction 계약
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# version 4면
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 전체
node --test plugins/mccp/scripts/lib/tests/*.test.js
```

선재 red 3건(renderer verdict-label.test.js · b2-coverage-gate 2건)은 main 승계이며 이 축과 무관하다. 착수 전 baseline을 찍어 신규 red와 구별한다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 합성 corpus가 실제 결함 분포를 대표하지 못한다 | High | 계층별로 나눠 보고하므로 합산 탐지율이라는 대표성 주장을 애초에 하지 않는다. 노트·report·PRD 세 자리에 N=1 합성이라고 명시한다(UI4·UI5). P1 원장이 쌓인 뒤 실측 fixture로 재검증하는 후속을 Open Question에 남긴다 |
| Layer 2가 비결정적이라 결론이 실행마다 달라진다 | High | 판정 규칙(DD3)이 측정 전에 동결되고 규칙은 계층 합산 1건 차이에도 보수적으로 기운다. 재실행으로 결론이 뒤집히면 그 자체가 표본 부족이라는 결론이고, 그때의 처방은 규칙 완화가 아니라 표본 확대다 |
| corpus를 Class C 없이 구성해 flip을 쉽게 만든다 | Medium | Task 2의 사전 등록 기대치가 Class C 경로 드롭을 단언하므로, C가 없는 corpus는 test가 붉어진다. 즉 corpus에서 C를 빼는 것이 조용히 불가능하다 |
| 판정이 flip 없음이면 M2가 아무것도 배송하지 않은 것처럼 보인다 | Medium | 배송물은 flip이 아니라 어디서 잃는지의 계측이다. Layer 1 회귀는 CI에 상주하며 이후 어떤 변경이 계층 커버리지를 바꾸면 붉어진다 — 그것이 M1이 갖지 못한 안전망이다 |
| fixture 저장소 test가 Windows 경로·CRLF에서 갈린다 | Medium | `santa-delta-instrumentation.test.js`의 `fs.realpathSync(mkdtempSync)` 패턴을 그대로 쓰고, corpus 파일은 LF 고정으로 쓴다 |
| 이 저장소의 MCCP_REVIEW_SINGLE_PASS가 라운드를 열지 못하게 막는다 | Medium | `withoutSinglePass` 격리를 재사용한다(M1이 같은 자리에서 실측한 상호작용) |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 — 구체적으로: 실제 git fixture 저장소에서 실제 `scope-delta` CLI를 off·enforce 두 모드로 호출한 결과가 계층별 커버리지 표로 남고(Layer 1), 같은 fixture에서 실제 리뷰어 레인이 두 번 발화한 발견 대조표가 `.claude/notes/santa-delta-review-m2.md`에 남는다(Layer 2). 단위 test 통과만으로 완료를 주장하지 않는다
- [ ] 사전 등록 규칙(DD3)이 결과에 맞춰 수정되지 않았다 — plan의 규칙 문장과 report의 적용 문장이 축자 일치
- [ ] 한계가 세 자리(노트·report·PRD)에 명시됐다 — 합성 fixture, N=1, 비결정성 (UI4·UI5)
- [ ] `docs/environment/review.md`와 `plugins/mccp/commands/santa-loop.md`에 M2가 뒤집는다류 미래 시제가 남아 있지 않다 (DD7)

## Multi-Perspective Fan-out

건너뜀 — 이 세션의 운영 지시가 명시 요청 없는 Workflow·서브에이전트 발화를 금지한다. Phase 2.5는 fail-open이므로 위의 `## Patterns to Mirror`(인라인 Pattern Grounding)가 접지 원천이고, plan은 차단되지 않았다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
