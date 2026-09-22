# Plan: leadtime-observability M1 — wall-clock-aggregate

**Source PRD**: `.claude/prds/leadtime-observability.prd.md`
**Selected Milestone**: 1 — wall-clock-aggregate
**Complexity**: Small

## Summary

패널 벽시계는 측정 가능 레코드 **37건 전부에 non-null로 이미 기록돼 있는데**, 그 값을
보고하는 유일한 소비처(`corpus.js`의 `pass_path`)가 converged 5건만 필터한다 — 집계
커버리지 13.5%. M1은 그 37건 전부를 읽어 분포로 만드는 read-only·LLM-free standalone
도구 `leadtime.js`를 새로 두고, 값과 커버리지를 **항상 같이** 낸다. `corpus.js`의 출력은
한 바이트도 바뀌지 않으며 그 사실을 회귀 test가 고정한다.

M1은 구간(span) join을 하지 않는다 — 그것은 M2다. 이름이 재는 구간을 말한다는 PRD 결정
2대로 이 축의 이름은 `panel_span`이며 `e2e`가 아니다.

## User Intent

<!-- 우산 PRD(2026-09-01 co-created)와 이 PRD가 상속한 Problem·Users·Hypothesis에서
     실제로 운영자가 말한 것만 옮긴다. PRD가 스스로 "운영자 미확인"이라 표시한
     Scope 결정 3건과 milestone 분해는 여기 넣지 않는다 — 저자 판단은
     ## Design Decisions 소관이다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 이 지표는 운영자 본인이 읽는 것이고 남에게 보고할 용도가 아니다 | exclusion |
| UI2 | 오늘 값이 없는 축에 숫자를 지어내지 않는다 | constraint |
| UI3 | 커버리지 없는 값은 출력하지 않는다 | constraint |
| UI4 | 임계값과 자동 분기는 C7이 소유하며 이 축은 분포만 내고 숫자를 정하지 않는다 | exclusion |
| UI5 | `/mccp:work` 진입 이벤트는 C2가 생산하고 이 축은 소비만 한다 | exclusion |
| UI6 | 없는 기록을 소급 생성하지 않고 과거 시각을 추정해 미짝을 메우지 않는다 | exclusion |
| UI7 | C4는 read-only 계측이라 사용자 체감 변화가 없어야 한다 | constraint |
| UI8 | 미관측은 측정 부재가 아니라 집계 부재이므로 새 계측을 심지 않는다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 도구 골격 | `plugins/mccp/scripts/lib/plan-review/corpus.js:1-95` | standalone read-only·LLM-free 집계 오라클. 헤더 주석이 코퍼스 경계·state ladder·"0의 출처"를 먼저 정의한다 |
| state ladder | `plugins/mccp/scripts/lib/plan-review/corpus.js:97-110` | `ok(0)` / `degraded(1)` / `blind(2)` + `exitCodeForState`. read error·parse failure가 degraded, 레코드 0건이 blind |
| 부재는 0이 아니다 | `plugins/mccp/scripts/lib/plan-review/corpus.js:472-476` | 레코드 0건이면 **축 키 자체를 싣지 않는다** — "0으로 관측됨"과 "관측 없음"을 소비자가 혼동할 수 없게 |
| 커버리지 하한 표기 | `plugins/mccp/scripts/lib/plan-review/corpus.js:462-469` | `coverage.counts_are_lower_bound` + 매 실행 stderr 경고 + `pre_measurement_records` 전건 이름 |
| 순수 오라클 / I/O 분리 | `plugins/mccp/scripts/lib/plan-review/corpus.js:418, 686, 733` | `aggregate(records, opts)`는 순수, `readReviewRecords`·`resolveSplitMs`는 `main()` 쪽 |
| CLI | `plugins/mccp/scripts/lib/plan-review/corpus.js:794-856` | `--json` / `--repo-root` / `-h`, 미지 인자는 loud fail-open, `require.main === module` 가드 |
| 교차 소스 감사 도구의 위치 | `plugins/mccp/scripts/lib/evidence-audit.js` | `scripts/lib/` 루트에 사는 standalone. ledger ↔ receipt 대조가 plan-review 소유가 아니므로 그 하위에 두지 않는다 |
| Tests | `plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js:1-70` | `node:test` + `assert/strict`, 픽스처 빌더를 test 안에서 조립, 실코퍼스 경험 주장은 test가 아니라 문서 동결로 |
| 문서 동결 | `docs/diverse-agent-review/quorum-calibration.md:221-525` | `<!-- BEGIN … (verbatim) -->` 마커 사이에 `--json` stdout 축자 인용 + 측정 일자 명시 |
| version 4면 | `plugins/mccp/.claude-plugin/plugin.json:5` · `plugins/mccp/scripts/lib/renderer/html.js:1419` · `plugins/mccp/scripts/lib/renderer/markdown.js:163` · `CHANGELOG.md:5` | §3.7 동기 대상 4면. `renderer/tests/i18n-surface.test.js`가 검증 수단 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/leadtime.js` | CREATE | M1의 산출물. 패널 레코드 37건 전부의 `wall_clock_ms` 분포 + 커버리지를 내는 standalone read-only 도구 |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | CREATE | 파서·분류·부재 규칙 회귀 고정 + `corpus.js` 출력 계약 동결(결정 3의 기계적 강제) |
| `plugins/mccp/scripts/lib/plan-review/corpus.js` | UPDATE | `readReviewRecords`·`REVIEW_SUBDIRS`를 `module.exports`에 **추가만**. 코퍼스 경계의 단일 진실 원천 유지 — 본문·출력 무변경 |
| `docs/leadtime-observability/panel-span.md` | CREATE | M1 실측을 축자 동결하고 "이것은 e2e가 아니다"(결정 2)를 명시. C7이 인용할 1차 근거 |
| `.claude/prds/leadtime-observability.prd.md` | UPDATE | milestone 1 행 `in-progress → complete`, Open Question 1(분모 규약)에 결론 기록 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | §3.7 patch bump (단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 새 항목 + `currently` 노트 동기 |

## Design Decisions

<!-- 저자 판단. 리뷰어 focus에는 ## User Intent만 주입되므로 여기 있는 정당화는
     리뷰어에게 도달하지 않는다. -->

- **DD1 — 위치는 `scripts/lib/` 루트다.** `plan-review/` 하위에 두면 이름이 곧 거짓이 된다:
  M2가 `completion-ledger`와 `mccp-pr-codex` receipt를 조인하는데 둘 다 plan-review
  산출물이 아니다. 같은 성질의 교차 소스 감사 도구인 `evidence-audit.js`가 이미 루트에 산다.
- **DD2 — `corpus.js`에서 `readReviewRecords`를 재사용한다(추가 export).** 리더를 복제하면
  `REVIEW_SUBDIRS`가 두 곳에 살고, 스캔 경로가 갈라지는 날 두 도구가 **서로 다른 분모**로
  같은 커버리지를 주장한다. 우산 PRD가 지목한 drift 실패 모드 그 자체다. 추가 export는
  stdout·JSON 출력을 바꾸지 않으므로 milestone이 못박은 "출력 한 바이트 무변경"과 양립하며,
  그 양립을 산문이 아니라 Task 2의 스냅샷 test가 확인한다.
- **DD3 — 백분위는 nearest-rank이고 그 이름을 출력에 싣는다.** converged 층은 n=5다.
  보간을 쓰면 없는 정밀도를 만들고, 방법을 안 적으면 소비자가 재계산할 때 다른 값을 얻는다.
  `panel_span.method: 'nearest-rank'`를 매 출력에 싣고 레코드별 원값도 함께 낸다 —
  분포 주장을 재계산으로 반증할 수 있어야 한다.
- **DD4 — 층화는 생존 편향 위험의 직접 대응이다.** 전체 분포만 내면 "converged만 보던 값과
  무엇이 다른가"에 답하지 못한다. `by_verdict`와 `by_halt_stage`를 함께 내면 `pass_path`
  5건(p50 6.4분)과 전체 37건(p50 8.0분, max 7.12시간)의 격차가 한 출력에서 보인다 —
  그것이 지표 1의 "읽는 주체 → 바꾸는 행동"이다.
- **DD5 — Open Question 1(분모 규약)은 `corpus.js`와 같은 규약을 따른다.** milestone 1의
  outcome이 이미 "코퍼스 커버리지 37/50이 하한으로 명시된다"라고 답을 적고 있다.
  `pre_measurement` 13건을 분모에서 빼면 커버리지가 영원히 100%로 보여 코퍼스의 시간
  경계가 사라진다. 하한 표기를 택하고 그 결론을 PRD에 기록한다.
- **DD6 — 새 env 토글을 만들지 않는다.** read-only 도구에 켜고 끌 것이 없다. `--repo-root`와
  `--json`만 받는다.

## Tasks

### Task 1: `leadtime.js` — 오라클 + 수집 + CLI

- **Action**:
  - `corpus.js`의 `module.exports`에 `readReviewRecords`·`REVIEW_SUBDIRS`를 **추가만** 한다
    (본문·출력 무변경).
  - `plugins/mccp/scripts/lib/leadtime.js`를 새로 만든다. 헤더 주석이 먼저 답한다:
    이 도구가 재는 구간은 무엇인가(`panel_span` = 5.2a `started-at` → 레코드 write) ·
    무엇이 아닌가(e2e 아님. 패널 종료→ship은 M2, `/mccp:work` 진입은 C2 소유) ·
    state ladder · 부재 규칙.
  - 순수 오라클 `aggregate(records, opts)`:
    - `corpus.parseRecord`로 레코드를 가르고 `out_of_corpus` / `pre_measurement` /
      `parse_failure` / `record` 4분류를 `corpus.js`와 동일하게 센다.
    - `coverage`: `panel_records` · `measurable` · `unmeasurable` ·
      `counts_are_lower_bound` · `panel_span_observed` · `panel_span_missing` ·
      `panel_span_missing_records`(전건 이름).
    - `panel_span`: `unit:'ms'` · `method:'nearest-rank'` · `n/min/p50/p90/max` ·
      `by_verdict` · `by_halt_stage`(null은 `'(completed)'` 키) · `records[]`
      (`{record, verdict, halt_stage, panel_span_ms, recorded_at, plan_path, reviewed_plan_hash}`).
    - **부재 규칙 3종**: (a) 측정 가능 레코드 0건이면 `state='blind'`이고 `panel_span` 키를
      **싣지 않는다**. (b) `wall_clock_ms`가 non-finite면 분포에 넣지 않고
      `panel_span_missing_records`에 이름으로 남긴다 — 0으로 접지 않는다. (c) 관측 0건인
      층은 `{n:0}`이 아니라 키 자체를 만들지 않는다.
  - I/O: `audit({repoRoot})`가 `corpus.readReviewRecords`를 호출해 `aggregate`에 주입한다.
  - CLI: `--json` · `--repo-root <path>` · `-h`. 미지 인자는 loud warn 후 무시.
    exit 0/1/2. `renderHuman`은 커버리지와 값을 **같은 출력 안에서** 낸다(UI3).
- **Mirror**: `corpus.js`의 헤더 주석 구조 · state ladder · `aggregate/audit/main` 3층 분리 ·
  CLI 인자 처리. 파일 위치는 `evidence-audit.js`.
- **Validate**: `node plugins/mccp/scripts/lib/leadtime.js --json` 이 exit 0 · `state:"ok"` ·
  `coverage.measurable === 37` · `panel_span.n === 37` 을 낸다.

### Task 2: 회귀 test + `corpus.js` 출력 동결

- **Action**: `plugins/mccp/scripts/lib/tests/leadtime.test.js`를 만든다. 픽스처는
  `plan-review-corpus.test.js`의 빌더 형태를 따르되 이 파일 안에서 조립한다(실코퍼스 미의존).
  고정하는 것:
  1. `wall_clock_ms: null`인 레코드는 분포 `n`에 들어가지 않고 `panel_span_missing_records`에
     이름으로 남는다 — 0으로 접히지 않는다.
  2. 측정 가능 0건이면 `state='blind'` · exit 2 · `panel_span` 키 **부재**.
  3. `pre_measurement`가 있어도 `state`는 `ok`이고 `counts_are_lower_bound=true`.
  4. `parse_failure` 1건이면 `state='degraded'` · exit 1.
  5. nearest-rank 백분위: 알려진 입력 배열에 대한 p50/p90이 리터럴과 일치.
  6. 층화 키: 관측 0건인 verdict/halt_stage는 키가 생기지 않는다.
  7. `renderHuman`의 어떤 비-blind 출력에도 커버리지 문자열이 포함된다(UI3의 기계적 형태).
  8. **결정 3 동결** — 고정 픽스처에 대한 `corpus.aggregate(...)`의
     `JSON.stringify(..., null, 2)`가 test 안 리터럴과 **바이트 일치**. 실패 메시지는
     "다른 PRD가 의도적으로 바꿨다면 이 리터럴과
     `docs/diverse-agent-review/quorum-calibration.md`의 동결 블록을 함께 갱신하라"를 말한다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js`.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/leadtime.test.js` 전건 pass.

### Task 3: `docs/leadtime-observability/panel-span.md`

- **Action**: M1 실측을 문서로 남긴다. 구성:
  - 이 값이 재는 구간의 정의와 **재지 않는 구간**(결정 2 — `e2e`가 아니다).
  - 커버리지 진술: 패널 레코드 50건 중 측정 가능 37건(하한), 그 37건의 `wall_clock_ms`
    결측 0건.
  - 판정 1건: **`corpus.js`의 pass-path 보고는 분포를 과소보고한다** — converged 5건
    p50 6.4분 대 전체 37건 p50 8.0분 · max 7.12시간(`plan-review-review-loop-bypass-m2`).
    미관측은 측정 부재가 아니라 집계 부재였다(우산 정정과 정합).
  - `<!-- BEGIN leadtime.js --json (verbatim) --> … <!-- END … -->` 사이에 실행 stdout 축자
    인용 + 측정 일자.
  - 한계 명시: 이 코퍼스는 이 저장소 것이고 표본이 작다. 임계는 여기서 정하지 않는다(UI4).
- **Mirror**: `docs/diverse-agent-review/quorum-calibration.md`의 동결 블록 마커와 서술 순서.
- **Validate**: 문서의 모든 수치가 동결 블록 안 값에서 유도된다(손으로 옮긴 숫자 0개).
  동결 블록과 라이브 `--json` 출력의 바이트 일치를 실행으로 재확인.

### Task 4: version 4면 동기 + CHANGELOG

- **Action**: §3.7 patch bump(단일 milestone). **번호는 미리 정하지 않는다** — origin/main이
  현재 `1.33.6`을 발행했고 형제 worktree가 6개 살아 있으므로 (a) base 머지 시점과
  (b) `/mccp:pr` 진입 직전에 각각 재계산한다. 4면 동기: `plugin.json` ·
  `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · `CHANGELOG.md`의
  `currently` 노트 + 새 항목 본문의 `A → B` 서술.
- **Mirror**: `CHANGELOG.md`의 `## [1.33.1]` 항목(§3.7 재상향 서술 포함).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`.

### Task 5: PRD 갱신

- **Action**: milestone 1 행 `in-progress → complete`. Open Question 1에 결론을 적는다 —
  "`corpus.js`와 같은 하한 표기 규약을 따른다(M1 DD5)". Evidence의 커버리지 수치가 M1
  실행으로 확인됐음을 한 줄 추가한다. **다른 milestone 행·Scope 결정문은 건드리지 않는다.**
- **Mirror**: `.claude/prds/diverse-agent-review.prd.md`의 milestone 표 갱신 형태.
- **Validate**: `git diff` 로 PRD에서 바뀐 줄이 위 3곳뿐임을 확인.

## Validation

```bash
# 1. 도구가 실제 코퍼스에서 완주하고 계약대로 낸다 (임시 파일 없이 stdin으로 — 이 저장소는
#    Windows에서도 돌고 /tmp는 이식 가능한 경로가 아니다)
node plugins/mccp/scripts/lib/leadtime.js --json \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));
      if(j.state!=="ok")process.exit(1);
      if(j.coverage.measurable!==j.panel_span.n)process.exit(1);
      if(j.coverage.panel_span_missing!==0)process.exit(1);
      console.log("state="+j.state+" n="+j.panel_span.n+"/"+j.coverage.panel_records+
        " p50="+(j.panel_span.p50/60000).toFixed(1)+"min max="+(j.panel_span.max/3600000).toFixed(2)+"h")'

# 2. 사람이 읽는 출력에 커버리지가 반드시 동반된다 (UI3)
node plugins/mccp/scripts/lib/leadtime.js | grep -q 'coverage'

# 3. 회귀 test
node --test plugins/mccp/scripts/lib/tests/leadtime.test.js

# 4. corpus.js 출력 무변경 — 기존 회귀 test + 실코퍼스 완주
node --test plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js
node plugins/mccp/scripts/lib/plan-review/corpus.js --json > /dev/null; echo "corpus exit=$?"

# 5. 게이트 배선 무손상 (UI7 — plan-review suite 전체 green)
node --test plugins/mccp/scripts/lib/tests/plan-review-*.test.js

# 6. version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 7. 이 plan 자신에 대한 L1
node plugins/mccp/scripts/lib/plan-review/cli.js l1 --plan .claude/plans/leadtime-observability-m1.plan.md

# 8. 3.5.1 — 이 브랜치가 삭제하는 파일이 없어야 한다 (빈 출력이 통과)
git diff --diff-filter=D --name-only origin/main...HEAD

# 9. 게이트 배선 diff 공집합 (빈 출력이 통과 — corpus.js는 여기 없다: 추가 export 1건이 있고
#    그 무해함은 4번과 10번이 검증한다)
git diff --stat origin/main...HEAD -- \
  plugins/mccp/scripts/lib/plan-review/cli.js \
  plugins/mccp/scripts/lib/plan-review/quorum.js \
  plugins/mccp/scripts/lib/plan-review/decide.js \
  plugins/mccp/scripts/lib/plan-review/l1-check.js \
  plugins/mccp/scripts/lib/plan-review/record.js \
  plugins/mccp/scripts/workflows/plan-review.js \
  plugins/mccp/commands/plan.md

# 10. corpus.js 본문 변경이 export 줄에만 국한되는지 확인
git diff origin/main...HEAD -- plugins/mccp/scripts/lib/plan-review/corpus.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `corpus.js`에 export를 더하다 본문을 건드려 M8 동결 블록이 거짓이 된다 | 중 | Task 2의 바이트 스냅샷 test + Validation 10번의 diff 확인. 변경은 `module.exports` 객체 한 곳으로 국한 |
| 층이 작아(converged n=5) 백분위가 과잉해석된다 | 높음 | `method`와 층별 `n`을 매 출력에 싣고 레코드별 원값을 함께 내 재계산 가능하게 한다. 문서가 표본 크기 한계를 명시하고 임계는 정하지 않는다(UI4) |
| 형제 worktree 6개가 `plugin.json`·`corpus.js`를 동시에 건드려 머지 충돌 | 높음 | version은 §3.7 forward-only로 머지 시점·PR 직전 2회 재계산. `corpus.js` 변경은 1줄로 최소화 |
| 새 도구가 소비되지 않아 지표가 또 `null`로 남는다(우산 base rate) | 높음 | M1의 소비 회로는 문서 동결(Task 3)이다. 화면 소비는 M3이 완료 조건 — 이 plan은 M1이 M3 없이 PRD를 완결한다고 주장하지 않는다 |
| `.claude/reviews/`가 없는 설치본에서 도구가 죽는다 | 낮음 | `corpus.readReviewRecords`가 이미 `existsSync` 가드 → `blind`(exit 2). Task 2의 test 2번이 그 경로를 고정 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
      — 라이브 산출물 3개를 눈으로 확인한다: (a)
      `node plugins/mccp/scripts/lib/leadtime.js --json`이 exit 0 · `coverage.measurable`과
      `panel_span.n`이 같은 값 · `panel_span_missing=0`, (b)
      `docs/leadtime-observability/panel-span.md`의 동결 블록이 그 stdout과 **바이트 일치**,
      (c) 같은 실행 출력에 `by_verdict.converged`의 p50과 전체 p50이 **둘 다** 있어
      과소보고 격차가 한 화면에서 읽힌다
- [ ] `corpus.js`의 `--json` 출력이 M8 동결 계약과 같은 키 집합을 유지한다 (Task 2 스냅샷)
- [ ] PRD Open Question 1에 결론이 기록되고 milestone 1 행이 `complete`가 된다

## Design Critique

- 트리거: 탐지기 positive (`design_signal=true`). `signal_files`는 전부
  `plugins/mccp/scripts/lib/renderer/{html,markdown}.js` — Task 4의 **version 문자열 동기**
  때문이지 새 디자인 표면 때문이 아니다.
- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints`
  4항 + `PRODUCT.md`(Calm · Decisive · Compact, anti-refs 3종)를 읽고 평가했다.
- 라운드: 1 (R0) · cap 2 · verdict **CONVERGED**.

| Output Constraint | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | pass | 렌더 표면에 새 heading 0개. 변경은 기존 `<footer class="page-foot">` 문자열 안의 version 리터럴 1개 |
| 강조색 화면당 1개 | pass | 색·토큰 변경 0건 |
| raw markdown marker 금지 | pass | 마커를 도입하지 않는다. 신규 산출물(`docs/leadtime-observability/panel-span.md`)은 렌더 표면이 아니라 문서다 |
| 한 화면 항목 수 상한 | pass | 렌더 표면에 새 `list-of-N` 섹션 0개 |

- anti-refs 대조: hero number · gradient card · 형광 다크 · caps eyebrow 도입 0건. M1의
  산출 표면은 CLI stdout과 JSON이며 dashboard가 아니다.
- **이 판정이 덮지 않는 것**: PRD의 M3(`STATUS.md` 상단 한 줄)은 실제 렌더 표면에 값과
  커버리지를 얹으므로 위 4항이 그때 다시 걸린다. M1은 그 표면을 만들지 않으므로 여기서
  판정하지 않는다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 어떤
impeccable 명령도 호출하지 않는다 — 아래는 체크리스트다. M1은 렌더 표면을 만들지 않으므로
실제로 발화할 항목이 없을 가능성이 높다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## External Research Provenance

- Source PRD: .claude/prds/leadtime-observability.prd.md
- References section sha256: a08dca7b653c9256d560254aa1e06182f7e80ad6476af5603d41ff133939288c
- Stamped at: 2026-09-01T06:39:46.916Z
- Anchor: plan body content is hash-anchored by the plan-codex receipt&#39;s plan_hash. Any post-stamp PRD mutation in ## References will mismatch on the next /mccp:plan validate.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
