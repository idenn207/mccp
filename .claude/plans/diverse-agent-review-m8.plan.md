# Plan: 패널 quorum 캘리브레이션 재검토 (diverse-agent-review #8)

**Source PRD**: `.claude/prds/diverse-agent-review.prd.md`
**Selected Milestone**: #8 — 패널 quorum 캘리브레이션 재검토
**Complexity**: Medium

## Summary

#8은 배선 milestone이 아니라 **판정 milestone**이다(#6·#7과 같은 형태). PRD가 묻는 것은
두 가지이고 순서가 있다 — "승인이 발급되는 경로가 존재하는가"에 먼저 답하고, 그 뒤에야
`3of4` + K=3의 적정성을 물을 수 있다.

M4가 배송한 `record.js`가 그동안 `.claude/reviews/`에 레코드를 계속 적어 왔고, 그 코퍼스는
이미 판정에 충분하다. 이 milestone은 그 코퍼스를 읽는 **read-only·LLM-free 집계 도구**를
만들고(`evidence-audit.js` 형태를 그대로 미러), 그 출력으로 판정을 확정해 동결하며, PRD의
지표·Open Questions를 그 결과로 갱신한다. **게이트 배선은 한 바이트도 바꾸지 않는다**(UI6).

예비 실측(2026-08-26, ad-hoc 스크립트 — 본 milestone의 도구가 재도출한다)이 가리키는 방향:
승인 경로는 **존재하며**(converged 5건, 전부 DD13 hash 결속·단일통과 토글 미사용), 차단
레코드 27건 중 M(응답 수)이나 K(고유 역할)가 binding constraint였던 것은 **0건**이다.

## User Intent

<!-- USER-STATED constraints only. 저자 정당화는 ## Design Notes 소관이다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | main 기준 pull을 먼저 수행한 뒤 계획을 작성한다 | direction |
| UI2 | 게이트 리뷰는 1라운드를 기본으로 하고 plan을 다듬기보다 적용 후 결과로 판단한다 | direction |
| UI3 | 리뷰 finding은 CRITICAL·HIGH만 그 자리에서 흡수하고 나머지는 backlog로 이연한다 | constraint |
| UI4 | 리뷰어 프롬프트를 통과 목적으로 완화하지 않는다 | exclusion |
| UI5 | receipt 위조와 기존 ship receipt 재봉인을 하지 않는다 | exclusion |
| UI6 | 게이트 배선을 늘리는 작업은 #5 오라클 추출 뒤에 착수한다 | constraint |
| UI7 | 산출 이력이 0인 지표는 달성이 아니라 forward-only로 적는다 | constraint |
| UI8 | 인접 측정을 목표 측정으로 승격하지 않는다 | exclusion |
| UI9 | 단일통과 토글이 낸 진행은 승인으로 세지 않는다 | constraint |
| UI10 | 판정을 바꾸지 않고 사유를 갱신하되 증거가 바뀌면 판정도 갱신한다 | direction |
| UI11 | 근거 없는 임계값을 날조하지 않는다 | exclusion |

## Preconditions — 이번에는 코퍼스가 존재한다 (실측 2026-08-26)

#6·#7이 "표본 0"으로 적었던 조건이 해소돼 있다. 확인한 것:

- `origin/main`을 fast-forward pull 완료 — `1.30.2` → `1.32.6`, 25 커밋. HEAD가 main의
  조상이었으므로 §3.5.1 삭제 사고 위험 없음(3-way merge 미발생, 삭제 0건).
- `.claude/reviews/` + `.claude/reviews/archive/`에 `## Measurement` 블록을 가진 레코드
  **35건**. 전부 `source: multi-agent`.
- 그중 `verdict: converged` **5건** — reason은 모두 `L1 + L2 quorum satisfied`,
  `reviewed_plan_hash` 봉인 존재, `MCCP_REVIEW_SINGLE_PASS` 흔적 없음(UI9 충족).
- `## Refutation attempted` 표가 **관점 단위 verdict 129건**을 보존하고 있다 —
  PRD가 O1에서 세었던 "16회"의 8배 표본.

**중요**: converged 5건 중 **4건이 M7 tip(`11f7dc2`)에 이미 존재**했다(`git cat-file -e`로
확인). 즉 #6·#7의 "표본 0"은 데이터 부재가 아니라 **집계 범위가 이 PRD 자신의 게이트 실행으로
좁혀져 있었기 때문**이다. Success Metrics의 지표 이름은 "plan 게이트 wall-clock"이지
"이 PRD의 게이트 실행"이 아니다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 감사 도구 형태 | `plugins/mccp/scripts/lib/evidence-audit.js:1-40` | read-only · LLM-free · standalone 실행 · state precedence ladder |
| 부재는 결함 부재가 아니다 | `plugins/mccp/scripts/lib/evidence-audit.js:29-31` | 대조 대상 0이면 `ok`를 절대 반환하지 않고 `blind` + 비영점 exit |
| 순수 오라클 + 얇은 CLI | `plugins/mccp/scripts/lib/plan-review/quorum.js:134-210` | 판정은 인자 주입 순수 함수, env 해석은 별도 parse 함수 |
| 레코드 파싱 대상 | `plugins/mccp/scripts/lib/plan-review/record.js:158-176` | `findingRows`가 쓰는 표 형식이 곧 파서의 계약 |
| test 위치·러너 | `plugins/mccp/scripts/lib/tests/plan-review-quorum.test.js:1-30` | `node --test`, `lib/tests/` 하위, `plan-review-*.test.js` 명명 |
| 관측 milestone 산출물 | `.claude/PRPs/reports/diverse-agent-review-m7-report.md` | 필수 절 + 원자료 축자 인용 + Acceptance 대조 |

## Design Notes

**DN1 — 도구를 만드는 이유는 재현성이다.** 판정을 손으로 센 숫자로 적으면 그 판정은 나중에
반증할 수 없고, PRD가 High로 지목한 "측정했다는 착각 위의 튜닝"이 정확히 그 형태다. 도구가
있으면 재측정이 명령 한 줄이 된다. 도구 자체는 게이트에 결합되지 않는다.

**DN2 — `cli.js` 하위 subcommand로 만들지 않는다.** `plan-review/cli.js`는 게이트 dispatch
본체이고, UI6은 #5 이전 배선 추가를 금한다. `evidence-audit.js` 선례대로 **standalone**으로
두면 게이트 경로를 한 줄도 건드리지 않는다. 발견 가능성은 CLAUDE.md §4 cheat sheet가 아니라
이번 산출 문서와 보고서가 맡는다 — §4 편집도 표면 확대 축이므로 이번엔 하지 않는다.

**DN3 — `blind`는 `clean`이 아니다.** 코퍼스 0건일 때 "승인 0건"을 반환하면 그것은 #6·#7이
이미 한 번 지불한 오류(표본 0을 판정으로 읽음)를 도구에 각인하는 것이다. 레코드가 0건이면
`state='blind'` + 비영점 exit이며, 어떤 비율도 보고하지 않는다.

**DN4 — 손잡이 무력성 가설.** 예비 실측에서 차단 레코드 27건의 reason이 전부
`N blocking finding(s)`이었고 `only N of M required responses` / `only N distinct role(s)`는
**0건**이었다. `quorum.js:184-197`이 세 사유를 독립적으로 쌓고 `passed`가
`reasons.length === 0`이므로, M·K가 한 번도 binding이 아니었다면 그 둘을 어떻게 돌려도
승인율은 움직이지 않는다. 도구는 이 명제를 레코드마다 기계적으로 판정한다(서술로 남기지 않는다).

**DN5 — K는 이미 돌아갔고 지표는 움직이지 않았다 (자연 실험).**
`.claude/settings.json`이 `MCCP_PLAN_REVIEW_ROLES_MIN=1`을 담고 있고, 그 도입 커밋은
`794c4de`(2026-08-21)다. 즉 코퍼스는 K=3 구간과 K=1 구간으로 자연 분할된다. 예비 실측에서
두 구간의 승인 빈도는 실질 동일했다. 도구는 레코드의 `recorded_at`을 그 커밋 시각과 대조해
이 분할을 출력한다 — **손잡이가 지표를 움직이는가에 대한 유일한 관측 증거**다.

**DN6 — 기본값을 바꾸지 않는다.** 예비 실측에서 실패한 리뷰어 인스턴스 63건 중 51건이
HIGH/CRITICAL 실물 finding을 동반했다. "승인율이 낮다"를 임계 과잉으로 읽는 것은 코퍼스에
반한다 — 리뷰어가 실제로 결함을 찾은 것이다. 승인율을 올리려고 severity 게이트를 손보는 것은
UI4가 금지하는 축의 변형이다. M8은 **판정만** 하고 기본값은 그대로 둔다.

**DN7 — F6(합성 FAIL)의 기여도를 측정한다.** `quorum.js:175-181`은 bare `verdict='fail'`을
`severity:'FAIL'` blocking finding으로 합성한다. CLAUDE.md §3.14의 해제 조건이 정확히 이
동작이므로, "F6이 없었으면 몇 건이 승인됐을까"는 그 임시 규칙의 수명에 직접 걸린다. 예비
실측은 F6 단독으로 막힌 **레코드**가 0건임을 시사한다(모든 차단 레코드가 최소 1건의
HIGH/CRITICAL을 동반). 도구가 이 수치를 확정한다. **M8은 §3.14를 해제하지 않는다** — 해제는
운영자 판정이고 이 PRD 소관이 아니다. M8이 제공하는 것은 그 판정의 근거다.

**DN8 — 비율은 추정량이 아니다.** O3(레코드 slug가 PRD 경로 파생이라 재실행이 이전 라운드를
덮어씀 — #9 소관)이 살아 있으므로 코퍼스 35건은 실제 실행 수의 **하한**이다. 게다가 생존
편향의 방향이 불분명하다: 차단된 결정은 재실행돼 마지막 레코드가 converged로 남을 수도,
포기돼 divergent로 남을 수도 있다. 따라서 도구는 converged 대비 전체를 **관측 빈도**로
보고하되 승인 **확률**로 부르지 않으며, 보고서도 그렇게 적는다(UI7·UI8).

**DN9 — 지표 갱신은 범위 정정이지 골대 이동이 아니다.** 통과 경로 wall-clock을 미산출에서
산출로 바꾸는 근거는 새 데이터 수집이 아니라 **집계 범위 정정**이다. 이 사실을 PRD 본문에
명시하고, 이전 판정("표본 0")이 어떤 범위에서 옳았는지도 함께 남긴다. UI10이 허용하는 것은
증거가 바뀐 갱신이며, 여기서 바뀐 것은 "무엇을 세는가"다 — 감추면 그것이 골대 이동이 된다.

**DN10 — #8의 후반부는 답하지 않는다.** "승인 품질(false-approve 비율)"은 converged 5건을
사후 감사해야 답할 수 있고, 그것은 별도의 관측 작업이다. M8은 그 질문이 **이제 답 가능해졌다**는
것까지만 확정하고 신규 milestone(#11)으로 이관한다 — #6→#7, #7→#10과 같은 이관 규칙이다.

**DN11 — 도구는 하드코딩된 임계를 갖지 않는다.** 승인율 목표치, "적정 quorum" 같은 숫자를
도구에 넣지 않는다(UI11). 도구는 세고, 판정은 문서가 한다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/plan-review/corpus.js` | CREATE | 레코드 코퍼스 집계 순수 오라클 + standalone CLI (read-only · LLM-free) |
| `plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js` | CREATE | 파서·집계·blind 규칙 회귀 test |
| `docs/diverse-agent-review/quorum-calibration.md` | CREATE | 동결된 실측 + 판정 본문 (PRD가 인용할 앵커) |
| `.claude/prds/diverse-agent-review.prd.md` | UPDATE | #8 complete · Evidence · Success Metrics · Open Questions · #11 신설 |
| `.claude/PRPs/reports/diverse-agent-review-m8-report.md` | CREATE | milestone 보고서 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `CHANGELOG.md` | UPDATE | 신규 heading + `currently` 노트 동기 |

## Tasks

### Task 1: 코퍼스 집계 오라클 + standalone CLI

- **Action**: `plugins/mccp/scripts/lib/plan-review/corpus.js`를 만든다. 두 층으로 나눈다 —
  (a) 순수 함수 `parseRecord(text)`가 `{ measurement, findings, refutation }`를 내고
  `aggregate(records)`가 집계 객체를 낸다. (b) `main()`은 `.claude/reviews/`와
  `.claude/reviews/archive/`를 **비재귀 2경로**로 훑고 `--json`을 출력한다.
  집계가 보고할 축:
  1. `records` / `verdicts` — converged·divergent·unknown 카운트
  2. `pass_path` — converged 레코드의 `wall_clock_ms` 목록 + 레코드별
     `reviewed_plan_hash` 존재 여부 + 단일통과 토글 흔적 여부
  3. `perspectives` — 관점별 pass/fail/total
  4. `binding_axis` — 차단 레코드마다 응답 부족 / 역할 부족 / blocking finding 중 무엇이
     성립했는지. **M·K가 binding이었던 레코드 수**가 핵심 출력
  5. `f6` — 실패 리뷰어 인스턴스 중 HIGH/CRITICAL(또는 미인식 severity) finding을 동반하지
     않은 수, 그리고 레코드 단위로 "F6 제거 시 승인으로 뒤집혔을 레코드" 수
  6. `k_split` — `recorded_at`을 `794c4de` 시각으로 갈라 두 구간의 converged 빈도
  `state`는 `evidence-audit.js` 사다리를 미러한다 — `blind`(레코드 0건, exit 2) ·
  `degraded`(파싱 실패 1건 이상, exit 1) · `ok`(exit 0). **`blind`에서는 어떤 비율도
  출력하지 않는다.** 임계값·목표치는 넣지 않는다(DN11).
- **Mirror**: `plugins/mccp/scripts/lib/evidence-audit.js:1-40`의 도구 형태와 state 사다리 ·
  `plugins/mccp/scripts/lib/plan-review/quorum.js:134-210`의 인자 주입 순수 오라클.
- **Validate**: `node plugins/mccp/scripts/lib/plan-review/corpus.js --json > /dev/null && echo OK`

### Task 2: 회귀 test

- **Action**: `plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js`. 최소 커버:
  (1) 정상 레코드 픽스처 파싱 — Measurement + Findings + Refutation 3표가 모두 잡힘
  (2) `quorum`이 null인 레코드(L1 차단)와 `required`가 null인 레코드가 크래시 없이 별도
      분류로 떨어짐
  (3) **blind 규칙** — 레코드 0건 입력에서 `state`가 `blind`이고 비율 키가 부재
  (4) `binding_axis` — 응답 부족 픽스처·역할 부족 픽스처·blocking-only 픽스처가 각각 정확히
      분류됨
  (5) `f6` — 실패 리뷰어가 MEDIUM finding만 가진 픽스처는 F6 후보로, HIGH를 가진 픽스처는 아님
  (6) 파싱 실패 픽스처(깨진 JSON)가 `degraded`로 떨어지고 조용히 0으로 세어지지 않음
  (7) `## Findings` 3번째 셀에 파이프가 포함된 레코드에서도 관점·severity 열이 어긋나지 않음
- **Mirror**: `plugins/mccp/scripts/lib/tests/plan-review-quorum.test.js:1-30`의 러너·명명.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js`

### Task 3: 실측 동결 + 판정 문서

- **Action**: `docs/diverse-agent-review/quorum-calibration.md`를 만든다. Task 1 도구의
  `--json` 출력을 **축자 인용**하고(재현 명령 포함), 그 위에 판정 4개를 적는다:
  (a) 승인 경로 존재 여부 — converged 레코드의 wall-clock·hash 결속·토글 미사용까지 포함
  (b) M과 K가 승인 임계인가 — `binding_axis` 출력으로 판정 + DN5의 K 자연 실험
  (c) 실제 승인 규칙이 무엇인가 — `quorum.js:134-210`이 헤더에 이미 명시한 내용과 대조
  (d) F6 기여도와 그것이 §3.14 해제 조건에 대해 말하는 것(해제 자체는 하지 않음)
  DN8의 한계(비율은 추정량 아님)와 DN9의 범위 정정 사실을 문서 안에 명시한다.
- **Mirror**: `.claude/PRPs/reports/diverse-agent-review-m7-report.md`의 원자료 축자 인용.
- **Validate**: `grep -c '^## ' docs/diverse-agent-review/quorum-calibration.md`

### Task 4: PRD 갱신

- **Action**: `.claude/prds/diverse-agent-review.prd.md`를 갱신한다.
  1. Delivery Milestones의 `#8` 행 Status를 `pending`에서 `complete`로, Plan 셀에 이 plan
     경로. Outcome 문장을 #6·#7과 같은 형태로 **관측 결과**로 재서술.
  2. **`#11` 신설** — "패널 승인 품질(false-approve) 감사". converged 5건을 사후 감사해야
     답할 수 있는 축이며 관측 작업이라 #5 앞에 둘 수 있다(배선 추가 아님). 행 위치는 #8 뒤.
  3. Evidence에 `M8 실측` 문단 추가 — 코퍼스 규모·판정 4개·범위 정정 사실.
  4. Success Metrics의 **통과 경로 wall-clock 행**을 갱신한다. 이번 milestone에서 유일하게
     판정이 뒤집히는 칸이므로, DN9대로 **범위 정정임을 그 칸 안에 적고** 이전 판정이 어떤
     범위에서 옳았는지도 남긴다. 차단 경로 행은 그대로 둔다(UI8).
  5. Open Questions: "목표 10분 달성 실측"과 "패널 승인의 실제 품질" 두 항목을 갱신
     (전자는 답해짐, 후자는 #11로 이관). K 자연 실험을 새 항목으로 추가.
  6. 표 하단 note에 **#8이 확정한 것과 #11이 생긴 이유** 문단 추가 — 이관 사유의 종류가
     #4/#6(선행조건 밖) · #7(전달 경로 밖)과 또 다르다는 것을 적는다: 이번은 **집계 범위**였다.
  7. 말미 Status 줄 갱신.
- **Mirror**: 같은 파일의 #7에서 #10으로 넘긴 이관 문단(판정을 바꾸지 않고 사유를 갱신하는 형식).
- **Validate**: `grep -n '^| 8 \|^| 11 ' .claude/prds/diverse-agent-review.prd.md`

### Task 5: milestone 보고서

- **Action**: `.claude/PRPs/reports/diverse-agent-review-m8-report.md`. M7 보고서의 절 구성을
  따르되 반드시 포함: 도구 출력 전문 · 판정 4개 · Acceptance 대조(충족·미충족을 문구 조정
  없이) · **부수 관측** 2건 — (i) `.claude/settings.json`의 `MCCP_GATE_ROUND_CAP`이 `3`인데
  CLAUDE.md §3.16은 "이미 1로 설정"이라 적고 있어 어긋남(선재 drift, 이번 범위 밖이므로
  backlog 1줄로 이연), (ii) `.claude/reviews/plan-review-santa-adjudication.md`의 `plan_path`가
  `santa-adjudication-m2.plan.md`인 O3 실물 사례.
- **Mirror**: `.claude/PRPs/reports/diverse-agent-review-m7-report.md`.
- **Validate**: `grep -c '^## ' .claude/PRPs/reports/diverse-agent-review-m8-report.md`

### Task 6: version bump 4면 동기

- **Action**: §3.7 forward-only로 target을 **재계산**한 뒤 4면을 맞춘다 —
  `plugins/mccp/.claude-plugin/plugin.json` · `plugins/mccp/scripts/lib/renderer/html.js`의
  page-foot · `plugins/mccp/scripts/lib/renderer/markdown.js`의 derived 줄 · `CHANGELOG.md`의
  신규 heading과 `currently` 노트. 착수 시점 실측: main이 `1.32.6`, 미머지 sibling이
  `1.32.7`(santa-delta-review) · `1.32.8`(env-contract-integrity) · `1.33.0`(msw-m8)을
  선점 → 잠정 target **`1.32.9`**. 단일 milestone이므로 patch 축이다.
  **이 번호는 확정이 아니다** — `/mccp:pr` 진입 직전 sibling과 origin/main을 다시 읽고
  재계산한다(§3.7 실측 4회 재발).
- **Mirror**: `CHANGELOG.md:7-14`의 `1.32.6` 항목이 쓴 §3.7 상향 서술 형식.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 1. 도구가 실제 코퍼스에서 완주하고 JSON을 낸다
node plugins/mccp/scripts/lib/plan-review/corpus.js --json \
  | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(!j.state)process.exit(1);console.log("state="+j.state+" records="+j.records)'

# 2. 회귀 test
node --test plugins/mccp/scripts/lib/tests/plan-review-corpus.test.js

# 3. 게이트 배선 무손상 (UI6 — plan-review suite 전체 green)
node --test plugins/mccp/scripts/lib/tests/plan-review-*.test.js

# 4. version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 5. 이 plan 자신에 대한 L1
node plugins/mccp/scripts/lib/plan-review/cli.js l1 --plan .claude/plans/diverse-agent-review-m8.plan.md

# 6. §3.5.1 — 이 브랜치가 삭제하는 파일이 없어야 한다 (빈 출력이 통과)
git diff --diff-filter=D --name-only origin/main...HEAD

# 7. 게이트 배선 diff 공집합 (빈 출력이 통과)
git diff --stat origin/main...HEAD -- \
  plugins/mccp/scripts/lib/plan-review/cli.js \
  plugins/mccp/scripts/lib/plan-review/quorum.js \
  plugins/mccp/scripts/lib/plan-review/decide.js \
  plugins/mccp/scripts/lib/plan-review/l1-check.js \
  plugins/mccp/scripts/lib/plan-review/record.js \
  plugins/mccp/scripts/workflows/plan-review.js \
  plugins/mccp/commands/plan.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 마크다운 표 파싱이 취약해 집계가 조용히 틀림 | Medium | 3번째 셀에 파이프가 든 픽스처를 test에 포함 · 파싱 실패는 0이 아니라 `degraded`로 표면화 · 도구 출력을 문서에 축자 동결해 사후 대조 가능 |
| 지표를 미산출에서 달성으로 바꾸는 것이 골대 이동으로 읽힘 | **High** | DN9 — 범위 정정임을 PRD 칸 안에 명시하고 이전 판정이 옳았던 범위를 함께 남긴다 · 차단 경로 행은 손대지 않는다(UI8) |
| 승인율이 낮다는 관측이 게이트 완화 요구로 번짐 | Medium | DN6 — 실패 63건 중 51건이 HIGH/CRITICAL 동반. 기본값 무변경을 판정에 명시 · UI4 |
| O3 생존 편향을 비율로 오독 | Medium | DN8 — 도구가 빈도로만 보고하고 확률로 부르지 않음 · 문서에 하한임을 명시 |
| 도구 추가가 배선 확대로 번짐(UI6 침식) | Low | standalone 파일 1개 + test 1개 · 게이트 파일 미변경을 Validation 7번이 기계 확인 |
| version target이 병렬 브랜치에 밀림 | **High (실측 4회)** | Task 6이 target을 잠정으로 두고 `/mccp:pr` 직전 재계산을 의무화 |
| `plan-review-*.test.js` 선재 red가 이 milestone 탓으로 귀속됨 | Medium | Validation 3번 실행 전 `origin/main`에서 동일 suite를 돌려 baseline을 먼저 확보하고 보고서에 baseline을 기록 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
      — 라이브 완주의 산출물은 `docs/diverse-agent-review/quorum-calibration.md` 안에
      축자 인용된 `corpus.js --json` 출력이며, 그 출력의 `state`가 `blind`가 아니고
      `records`가 30 이상이어야 한다. 손으로 옮겨 적은 숫자는 산출물이 아니다.
- [ ] 판정 4개(승인 경로 존재 · M/K 손잡이 성격 · 실제 승인 규칙 · F6 기여도)가 전부 도구
      출력에 앵커돼 있고, 어느 것도 서술만으로 주장되지 않는다
- [ ] PRD Success Metrics 통과 경로 행이 **범위 정정임을 그 칸 안에서 밝히고** 갱신됨
- [ ] 게이트 배선 diff 공집합 (Validation 7번이 빈 출력)
- [ ] 삭제 파일 0건 (Validation 6번이 빈 출력, §3.5.1)
- [ ] 기본 quorum 값과 severity 게이트를 **바꾸지 않았음**을 diff로 확인
- [ ] version 4면 동기 + `i18n-surface.test.js` green

## Design Critique

- detector: `skill_available=true` · `design_signal=true` · `reason=ok` ·
  invocation `impeccable` (user scope, v4.0.4)
- SKILL first-step Read 완료 — `plugins/mccp/skills/frontend-design-direction/SKILL.md`
  `## Output Constraints` 4개 앵커
- rounds: 1 (R0) · cap: 2 (`MCCP_DESIGN_CRITIQUE_MAX_RETRY` default) · verdict: **CONVERGED**
  (`decideCritique({findings: [], round: 0, cap: 2})` 실행 결과)

**트리거 근거의 정직한 기록.** detector가 반환한 `signal_files`는 3개인데 그중 하나는
`node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` — Validation 블록
안의 **셸 명령 문자열**이지 이 계획이 변경하는 파일이 아니다. 나머지 둘(`renderer/html.js`,
`renderer/markdown.js`)은 이 계획에서 **버전 문자열 리터럴 1개씩**만 바뀐다. 즉 트리거는
경로 부분 문자열 매칭으로 켜졌고 실질 디자인 표면 변경은 없다. 이 관측은 detector 축의
문제이지 이 계획의 결함이 아니므로 §3.14대로 backlog 이연 대상이며, 계획을 고쳐 트리거를
끄지 않는다(트리거를 피하려 계획 문장을 손대는 것이 UI4와 같은 축의 회피다).

**4개 앵커 판정** (대상: 이 계획 문서 본문):

| 앵커 | 판정 | 근거 |
|---|---|---|
| 정보 위계 3단계 (heading depth ≤ 3) | 통과 | `grep -c '^#\{4,\} '` → `0`. 최대 depth는 `###`(Task 제목) |
| 강조색 화면당 1개 | 적용 불가 | 계획 문서에 뷰포트·accent token이 없고, 변경되는 renderer 두 파일은 색상 토큰·CSS를 건드리지 않는다 |
| raw markdown marker 금지 | 통과 | 소비처(L1 파서·L2 리뷰어·GitHub)가 markdown으로 렌더한다. 원시 HTML 엔티티 0건 |
| 한 화면 항목 수 상한 (상위 3 + collapse) | 적용 불가 | 앵커의 대상은 렌더 표면(`status.html`)이다. 계획 본문에 `<details>` collapse를 넣으면 L1의 `C7_TABLE_SHAPE` 표 검사와 충돌하고 L2 리뷰어가 접힌 내용을 근거로 쓸 수 없다 — 앵커 적용이 게이트를 깨뜨린다 |

HIGH/CRITICAL/severity-미상 finding 0건이므로 R0에서 수렴했다. 적용 불가 2건을 "통과"로
적지 않은 이유는 그것이 인접 판정을 목표 판정으로 승격하는 형태이기 때문이다(UI8).

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로 어떤
impeccable 명령도 **호출하지 않고** 아래를 구현자용 체크리스트로만 기록한다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

이 계획의 구현은 렌더 표면을 새로 만들지 않는다(버전 리터럴 2줄). 따라서 implement 단계에서
`renderingSurface=0`으로 refine/discovery는 recommend로 강등될 것으로 예상한다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
