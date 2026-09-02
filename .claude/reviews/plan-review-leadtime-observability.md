# Plan Review Panel — leadtime-observability

**Plan**: `.claude/plans/leadtime-observability-m1.plan.md` · **Plan version**: `sha256:674cbfd41331426050752d9eb0f0916d982dced927d70bfb0341e593f1ab40e5`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 4 blocking finding(s): test/HIGH, test/FAIL, invariant/HIGH, invariant/FAIL — MCCP_REVIEW_SINGLE_PASS=scope_too_small 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | 플랜이 '측정 가능(measurable)'이라는 하나의 단어를 서로 다른 두 집합에 쓴다 — coverage.measurable은 corpus 규약대로 '파싱된 레코드'(corpus.js:465 `measurable: result.records`)인데, 부재 규칙 (a)와 Task 2 test 2의 '측정 가능 레코드 0건이면 blind'는 'wall_clock_ms가 있는 레코드'를 뜻한다. 파싱은 되지만 wall_clock_ms가 전부 null인 코퍼스에서 coverage.measurable>0인데 state='blind'가 되어, corpus.js가 명시적으로 경계한 '0의 출처' 혼동(corpus.js:71-85)을 새 도구가 그대로 재도입한다. | plan L108 `coverage`: `panel_records` · `measurable` · `unmeasurable` vs plan L113 "(a) 측정 가능 레코드 0건이면 `state='blind'`"; corpus.js:463-468 및 :472-475(blind는 parsed.length===0일 때만) |
| architect | MEDIUM | Validation 1번과 Acceptance (a)가 `coverage.measurable === panel_span.n`(및 `panel_span_missing === 0`)을 exit-1 실패 조건으로 못박는데, 이는 같은 플랜의 부재 규칙 (b)가 정당한 출력으로 허용하는 상태를 실패로 판정한다. wall_clock_ms=null은 도달 가능한 정상 경로다(record.js:244-255 — started-at 부재·시각 불가·clock skew 시 null 봉인). 즉 계약이 스스로 허용한 출력을 검증이 거부한다. | plan L186-188 `if(j.coverage.measurable!==j.panel_span.n)process.exit(1); if(j.coverage.panel_span_missing!==0)process.exit(1);` vs plan L114-115 부재 규칙 (b); record.js:243-255 |
| architect | MEDIUM | Task 1의 검증 리터럴(`coverage.measurable === 37`, `panel_span.n === 37`)과 Task 3 문서의 '50건 중 37건'은 이 플랜 자신의 게이트 실행이 무효화한다 — 도구가 읽는 코퍼스(`.claude/reviews/`)에 `/mccp:plan` 패널이 이 사이클의 레코드를 새로 쓰기 때문이다. 현재 `.claude/reviews/`에는 leadtime-observability-m1 레코드가 없고, implement 시점에는 존재하므로 분모·분자가 모두 밀린다. 자기가 계측하는 코퍼스를 자기가 늘리는 순환을 플랜이 다루지 않는다. | plan L122-123 "`coverage.measurable === 37` · `panel_span.n === 37`"; plan L149-150; `.claude/reviews/` 목록에 plan-review-leadtime-* 부재(record.js#reviewRecordPath가 패널 실행마다 기록) |
| security | MEDIUM | Task 3은 `leadtime.js --json`의 stdout을 git-tracked 문서(`docs/leadtime-observability/panel-span.md`)에 **축자 동결**하는데, 그 JSON의 `records[]`는 `plan_path`를 무정규화로 싣는다. `plan_path`는 `record.js:314`에서 호출자가 준 문자열을 그대로 저장한다(`(typeof o.planPath === 'string' && o.planPath) ? o.planPath : null` — 정규화·repo-relative 변환 없음). 즉 `/mccp:plan`을 절대경로 인자로 한 번이라도 부른 세션의 레코드가 코퍼스에 들어오면, 그 절대경로(사용자 홈·드라이브 문자·머신 고유 worktree 경로)가 커밋되는 문서에 봉인된다. 이 저장소에는 절대 `cwd` leak이 sanctioned 재봉인을 강제한 선례가 있고(CLAUDE.md §3.12 — `write.js`가 `meta.cwd`를 repo-relative로 정규화하게 된 이유), 이 plan은 그 축을 새 필드·새 커밋 산출물에서 재개방한다. plan에 정규화·redaction 규칙이 한 줄도 없다(`Task 1`의 `records[]` 명세, `Task 3` 동결 블록 명세 모두). | plan L112 `records[]`(`{record, verdict, halt_stage, panel_span_ms, recorded_at, plan_path, reviewed_plan_hash}`) + plan L154 `<!-- BEGIN leadtime.js --json (verbatim) -->` / plugins/mccp/scripts/lib/plan-review/record.js:314 / plugins/mccp/scripts/lib/plan-review/corpus.js:501 |
| test | HIGH | Task 1의 유일한 Validate가 살아 움직이는 실코퍼스 숫자에 리터럴 37을 고정한다 — 이 게이트 실행 자체가 그 숫자를 바꾸므로 결정적으로 거짓 실패한다 | plan.md:122-123 "`coverage.measurable === 37` · `panel_span.n === 37` 을 낸다". 그러나 코퍼스 소속 판정은 `# Plan Review Panel —` 제목뿐이고(corpus.js:210-217) `record.js:75 reviewRecordPath`/`:308`이 패널 실행마다 새 레코드를 `.claude/reviews/`에 쓴다 — 본 plan의 패널 레코드(plan-review-leadtime-observability-m1.md)와 이후 implement 라운드·base 머지로 유입되는 형제 worktree 레코드가 모두 분자·분모를 올린다. 즉 Task 1의 통과 기준은 구현이 옳아도 red가 되며, 실무상 '리터럴을 관측값으로 맞추는' 압력만 남는다 |
| test | MEDIUM | Validation #1이 `panel_span_missing !== 0`을 실패로 취급해, plan 자신이 정상이라고 규정한 결측을 게이트 실패로 인코딩한다 — 결함 방향(null을 0으로 접기)은 고정 픽스처에서만 검사된다 | plan.md:188 `if(j.coverage.panel_span_missing!==0)process.exit(1);` 대 plan.md:113-116 부재 규칙 (b) "`wall_clock_ms`가 non-finite면 …이름으로 남긴다 — 0으로 접지 않는다". `record.js:245-253`은 started-at 부재/판독불가/stale 시 `wall_clock_ms`를 정당하게 null로 쓴다. 즉 라이브 검증은 '오늘 우연히 결측 0'이라는 코퍼스 사고를 계약으로 굳혀, 향후 정상적 null 1건이 M1을 실패시킨다 |
| test | MEDIUM | 'corpus.js 출력 한 바이트 무변경'이라는 load-bearing 주장을 고정한다는 test가 위험에 처한 실제 산출물을 검사하지 않는다 | plan.md:138-141은 손으로 조립한 픽스처에 대한 `corpus.aggregate(...)`의 `JSON.stringify` 바이트 일치만 고정한다. 그러나 Risk 표(plan.md:233)가 지목한 대상은 `docs/diverse-agent-review/quorum-calibration.md:226-525`의 **실코퍼스 `--json` stdout 축자 동결 블록**이고, Validation #4(plan.md:200)는 `corpus.js --json > /dev/null`로 exit code만 본다. `main()`의 JSON 봉투·`renderHuman`(corpus.js:745-779)·stderr 커버리지 경고(corpus.js:851-857)는 어떤 단언도 받지 않는다 — 헬퍼를 격리 검사하고 소비 표면이 상속했다고 주장하는 형태다 |
| test | MEDIUM | Acceptance (b)의 '동결 블록 = 라이브 stdout 바이트 일치'는 Task 3 캡처 시점과 PR 시점 사이에 코퍼스가 자라므로 구조적으로 재캡처 루프를 요구한다 (동일 결함의 수용 기준 판) | plan.md:248 "`docs/leadtime-observability/panel-span.md`의 동결 블록이 그 stdout과 **바이트 일치**" + plan.md:158-159. 코퍼스 증가 메커니즘은 위 finding 1과 같다(record.js:75/308). 문서 동결은 '측정 일자 명시'로 성립하는데(plan.md:154), Acceptance는 시점 무관 바이트 일치를 요구해 서로 모순된다 |
| test | LOW | Task 5는 편집만 하고 어떤 명령도 그 변경을 실행 검증하지 않는다 — Validate가 사람 눈의 `git diff`다 | plan.md:177 "**Validate**: `git diff` 로 PRD에서 바뀐 줄이 위 3곳뿐임을 확인." milestone 행 flip과 Open Question 결론 기록을 기계적으로 확인하는 test/lint는 plan 어디에도 없다 |
| test | LOW | Validate 명령의 이식성이 plan 자신의 근거와 어긋난다 | plan.md:182-183은 "이 저장소는 Windows에서도 돌고 /tmp는 이식 가능한 경로가 아니다"를 이유로 stdin 파이프를 택했는데, 같은 블록의 #2·#4가 `grep -q`(plan.md:193)와 `> /dev/null`(plan.md:200)을 쓴다. PowerShell이 primary shell인 환경에서 그 두 줄은 그대로 실행되지 않는다 |
| invariant | HIGH | 부재 규칙 3종이 '레코드는 있는데 wall_clock_ms가 전건 결측'인 입력을 덮지 않는다 — 그 경로에서 state는 'ok'로 남고 관측 0건짜리 panel_span 키가 그대로 실린다. PRD의 하드 제약('커버리지 없는 값은 출력하지 않는다', Evidence-side UI3)이 정확히 이 방향으로 열린다. | plan L113-116: 규칙 (a)는 blind 조건을 '측정 가능 레코드 0건'(= corpus의 records, corpus.js:472 `parsed.length === 0`과 동형)에 결속하고, (b)는 non-finite 값을 분포에서 빼기만 하며, (c)는 '층'에만 적용된다. 따라서 records>0 ∧ panel_span_observed=0이면 blind에 걸리지 않아 `panel_span: {n:0, p50:…}`가 생성되고 nearest-rank는 빈 배열에 적용된다. Task 2의 test 1(부분 결측)·test 2(레코드 0건)도 이 조합을 고정하지 않는다(plan L131-133). |
| invariant | MEDIUM | Task 1의 Validate가 살아 있는 코퍼스 크기를 리터럴로 고정해 self-invalidating이다 — 이 plan 자신의 게이트 실행이 `.claude/reviews/`에 레코드를 추가하므로 37은 검증 시점에 이미 거짓일 수 있다. | plan L122-123: "`coverage.measurable === 37` · `panel_span.n === 37` 을 낸다". 코퍼스는 `readReviewRecords`가 `.claude/reviews/` 전체를 스캔한 결과다(corpus.js:676-708) — 고정 표본이 아니다. |
| invariant | LOW | 문서 동결 블록(Task 3)과 라이브 출력의 '바이트 일치' 수용 기준은 시간에 결속되지 않아, 다음 패널 레코드 1건만 생겨도 참이 아니게 되는 미앵커 승인이다. Acceptance (b)는 그 사실을 말하지 않는다. | plan L158-159 "동결 블록과 라이브 `--json` 출력의 바이트 일치를 실행으로 재확인" · L247-249 Acceptance (b). 동일 도구의 출력이 코퍼스 크기에 의존함은 corpus.js:462-468(coverage가 스캔 결과 파생)에서 확인된다. |
| invariant | LOW | PRD 결정 2가 못박은 이름은 `post_panel_span`인데 plan은 `panel_span`을 채택하고 그것을 '결정 2대로'라고 서술한다. Task 5는 PRD에서 3곳만 고치므로(결정문 불변) 이름 불일치가 그대로 남아 C7이 인용할 축 이름이 두 개가 된다. | PRD L58: "`e2e_leadtime`이 아니라 `post_panel_span`이다" 대 plan L15-16: "PRD 결정 2대로 이 축의 이름은 `panel_span`이며"; plan L175 "다른 milestone 행·Scope 결정문은 건드리지 않는다". |
| invariant | LOW | 게이트 배선 diff 공집합(PRD 결정 3)의 증명이 Validation 10번에서는 사람이 눈으로 읽는 diff 출력뿐이라 pass/fail 술어가 없다 — 통과 판정이 작업 없이도 존재할 수 있다(Task 2 test 8 스냅샷이 부분 backstop). | plan L225-226: "# 10. corpus.js 본문 변경이 export 줄에만 국한되는지 확인 / git diff origin/main...HEAD -- …corpus.js" — 비교 대상도 종료코드도 없다. 반면 8·9번은 '빈 출력이 통과'라는 술어를 명시한다(L211-216). |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | (1) Patterns to Mirror의 corpus.js 인용 6건을 전부 열어 대조 — :97-110 state ladder, :462-469 coverage/하한, :472-476 부재 시 키 미탑재, :418/686/733 순수/IO 분리, :794-856 CLI 모두 실재하고 주장대로였다. (2) DD2의 단일 진실 원천 주장을 공격: `REVIEW_SUBDIRS`(corpus.js:103)와 `readReviewRecords`(:676)가 실제로 코퍼스 경계를 소유하고 `module.exports`(:868-878)에 아직 없음을 확인 — 추가 export가 우회 가능한 SoT를 만드는지 봤으나, 소비처가 corpus의 리더를 그대로 호출하므로 경로 분기 위험은 실재하지 않았다. (3) `parseRecord`가 이미 export돼 있어 Task 1의 `corpus.parseRecord` 의존이 성립함을 확인. (4) `by_verdict`/`by_halt_stage`/`records[]`가 요구하는 필드(verdict·halt_stage·recorded_at·plan_path·reviewed_plan_hash·wall_clock_ms)가 record.js:297-316 measurement에 전부 실재함을 확인 — 없는 필드 위에 층화를 세우지 않았다. (5) 결정 3(출력 무변경) 경계 침범 여부: 변경이 `module.exports` 객체 한 곳으로 국한되고 aggregate/renderHuman 경로에 닿지 않음을 확인. (6) `.claude/reviews/` 부재 시 blind 주장은 corpus.js:681 existsSync 가드로 성립. 남은 결함 3건은 위에 보고했고 모두 MEDIUM이라 HIGH/CRITICAL 부재로 pass한다. |
| security | pass | 공격한 축과 결과: (1) 신뢰 경계 — leadtime.js는 승인/판정 필드를 쓰지 않고 receipt·ledger·lock을 만들지 않으므로 위조 가능한 승인 필드나 부분상태 fallback 경로가 없다(권한 상승 경로 없음). (2) 게이트 무결성 — corpus.js가 어떤 게이트에도 require되지 않음을 grep으로 확인(`plugins` 전역에서 소비처는 test 1건뿐)했고, 따라서 export 추가가 게이트 판정 표면을 열지 않는다. (3) traversal — `--repo-root`는 `readReviewRecords`가 고정 subdir와 `path.join`한 뒤 `readFileSync`만 하므로 로컬 read-only 도구에서 소비 가능한 결과가 없어 finding으로 올리지 않았다. (4) bypass — DD6이 env 토글 0개를 못박고 CLI가 `--json`/`--repo-root`만 받아 우회 스위치가 없다. (5) 무결성 digest 배제 — 이 도구는 hash를 계산·재계산하지 않으므로 §3.12 no-rehash 불변식과 충돌하지 않는다(corpus.js 본문 무변경 주장은 Validation 10이 diff로 확인). 실제로 착지한 것은 durable-artifact 유출 축 하나뿐이며, 현 코퍼스의 `.claude/reviews/*` 전건이 repo-relative라 오늘은 발현되지 않고(드라이브 문자/홈 경로 grep 0건) 기존 `quorum-calibration.md:285`가 같은 필드를 이미 커밋하고 있어 HIGH로 올리지 않았다 — 이 plan이 새로 여는 것은 노출 레코드 수(5→37)와 정규화 규칙 부재다. |
| test | fail | plan의 두 최강 주장 — (1) 'corpus.js 출력 한 바이트 무변경을 회귀 test가 고정한다', (2) '37건 전부가 집계된다' — 각각 무엇이 반증하는지 추적했다. (1)은 corpus.js:418-475/670/745-779/851-857과 quorum-calibration.md:226-525 동결 블록을 읽어, Task 2 스냅샷이 aggregate 픽스처만 덮고 실제 위험 산출물(실코퍼스 stdout·renderHuman·stderr)을 덮지 않음을 확인했다. (2)는 corpus.js:210-217(코퍼스 판별자)과 record.js:75/308(실행마다 레코드 write), `.claude/reviews/` 실파일 79건을 대조해 리터럴 37이 이동 표적임을 확인했다. 결측 규칙은 record.js:245-253에서 null이 정상 경로임을 확인해 Validation #1과 충돌함을 잡았다. 반면 부재 규칙(a)(c)·state ladder·nearest-rank·층화 키는 Task 2의 픽스처 test 1~6이 실제로 그 명제를 겨냥하고 있어 반증하지 못했고, `.claude/reviews/` 부재 경로(Risk 표 마지막 행)도 corpus.js:681 existsSync 가드와 test 2가 짝을 이뤄 성립함을 확인했다 — 이 셋은 공격했으나 결함을 찾지 못했다. |
| invariant | fail | corpus.js의 state ladder(94-103, 462-475, 670)·readReviewRecords(676-709)·pre_measurement 분류(249, 429-449)를 직접 읽어 plan이 인용한 줄이 실제로 그 말을 하는지 대조했다(대체로 정확). 이후 plan이 언급하지 않은 입력을 열거했다: (i) 레코드 존재 + wall_clock 전건 결측, (ii) read_error ∧ records=0(plan은 blind로 접지만 corpus는 degraded), (iii) 코퍼스가 실행 사이에 커지는 경우, (iv) 결측이 non-finite가 아니라 필드 부재인 경우. (i)이 세 부재 규칙 어디에도 걸리지 않고 'ok' + 관측 0건 분포로 떨어지는 것을 확인했다. 롤백 축은 새 env가 없고 read-only 신규 파일 + export 1줄이라 되돌림이 실질적으로 성립함을 확인했고 결함 없음. dedupe/receipt/ship gate 경로는 이 plan이 건드리지 않아 침식 없음. |

## Measurement

<!-- Written by plan-review/cli.js record on EVERY exit path, pass or halt.
     Machine-readable; do not hand-edit. A null field means the axis was
     not observed, never that it was zero. -->

```json
{
  "verdict": "divergent",
  "source": "multi-agent",
  "layers": {
    "l1": "converged",
    "l2": "divergent",
    "l3": "not fired"
  },
  "quorum": {
    "responded": 4,
    "required": 3,
    "roles": 4,
    "of": 4,
    "passed": false
  },
  "wall_clock_ms": 279845,
  "halt_stage": null,
  "backlog_appended": 4,
  "backlog_skipped_nonblocking": 13,
  "granted": 4,
  "reviewed_plan_hash": "sha256:674cbfd41331426050752d9eb0f0916d982dced927d70bfb0341e593f1ab40e5",
  "plan_path": ".claude/plans/leadtime-observability-m1.plan.md",
  "recorded_at": "2026-09-01T06:46:44.977Z"
}
```
