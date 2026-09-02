# Plan Review Panel — leadtime-observability-m2

**Plan**: `.claude/plans/leadtime-observability-m2.plan.md` · **Plan version**: `sha256:d3fd826ad2addfd0f8b67dfa54c7a9993a9194d7b5a76c29e2ad7c4e8fe4a7b5`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 5 blocking finding(s): architect/HIGH, architect/FAIL, invariant/HIGH, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 증인 3종의 긍정 답(`yes`)에는 도착할 버킷이 없다 — DD3가 `--` 22건을 가르려고 도입한 증인이 판정 순서에서 소비되지 않아, '증인이 ship을 증언했다'와 '증인이 없다'가 모두 `unclassified`로 접힌다. DD4가 반대 방향에서 막겠다고 선언한 바로 그 conflation이다. | plan:412-414 판정 순서는 `anchor_absent`(반대 축이 ship을 증언) → `not_shipped`(증인 3종이 전부 `no`) → `unclassified`(unavailable 또는 그 외). `--` 그룹은 정의상 반대 축이 부재라 `anchor_absent`가 도달 불가이므로, 증인 중 하나라도 `yes`인 레코드는 '전부 no'가 아니라서 `unclassified`로 떨어진다(plan:150-155). 즉 plan:102 '`--` 22건만이 진짜 미분해'를 가르겠다는 M2의 무게중심이 산출물에서 `unclassified` 하나로 뭉개진다. 그런데 PRD:82 Open Question 2는 정확히 "'ship됐는데 앵커가 없다'가 다수인가"를 묻고, Task 6(plan:481-482)은 그 분해 결과를 PRD에 기록하도록 지시한다 — 그 질문에 답할 버킷이 설계상 존재하지 않는다. |
| architect | MEDIUM | DD15가 근거로 든 `corpus.js`의 `sources[]` 모델에는 소스별 `read_error`가 존재하지 않는다. plan은 그 모델을 '미러'한다고 적으면서 실제로는 없는 필드를 미러한다고 주장한다. | plan:280-283 "소스 모델은 그 `sources[]`(`{dir, present, files}`)를 미러하고, 출력에 소스별 `present`/`read_error`를 실어". 실제 corpus.js:680은 `{dir, present, files}`만 만들고, readdir 실패 시 corpus.js:687-688은 **전역** `out.read_error = true`만 켠 뒤 src를 그대로 push한다 — 소스별 read_error는 없다. DD15의 술어 `source_unavailable(src) := src.present===false \|\| src.read_error===true`는 corpus의 sources 원소에 적용하면 두 번째 항이 항상 undefined다. |
| architect | LOW | DD11이 `leadtime.js` 헤더가 못박은 부재 규칙 (a)를 뒤집는데, plan은 그 규칙을 'Patterns to Mirror'로 인용하면서 동시에 무효화한다는 사실을 문서 축에 반영하지 않는다. | leadtime.js:41 "이때 `panel_span` 키를 **싣지 않는다**" · :51 "(a) 관측 0건이면 `state='blind'`이고 `panel_span` 키 자체를 싣지 않는다"는 damaged 여부를 구분하지 않는다. plan:302-311 DD11은 damaged면 관측 0건이어도 키를 싣는다고 규정하고, plan:52는 같은 헤더의 '부재 규칙 3종'을 mirror 대상으로 인용한다. Files to Change(plan:63)는 leadtime.js UPDATE를 포함하지만 헤더 불변식 재작성은 어느 Task의 Action에도 없다. |
| security | MEDIUM | DD15/DD11이 요구하는 '소스별 present/read_error를 출력에 싣는다'는 감사 증거가, 같은 plan의 Validation 키 whitelist와 충돌한다 — 그 증거를 `post_panel_span` 아래 실으면 게이트가 throw하므로, 통과시키려면 증거를 지우거나 `coverage` 안에 숨기는 수밖에 없다. 미짝 사유 분해 키도 이름이 지정되지 않아 같은 함정에 걸린다. | plan:282-283 "출력에 소스별 `present`/`read_error`를 실어 어느 쪽이었는지 남긴다" 대 plan:527-530 `const ALLOWED = new Set(["state","unit","method","by_anchor","disagreement","negative_spans","unmatched","coverage"]); ... if (stray.length) throw` |
| security | LOW | Validation이 tracked 디렉토리 안에 임시 소스 사본을 만들고 앞줄이 비영점으로 죽으면 `rm -f`가 도달하지 않아 tracked 트리에 untracked 산출물이 남는다(민감정보는 아니나, `/mccp:prp-commit`의 자연어 타겟팅이 집을 수 있는 잔여물이다). `.claude/cache/`는 gitignored라 그쪽은 안전하다. | plan:566-569 `git show HEAD:...corpus.js > plugins/mccp/scripts/lib/plan-review/.corpus-before.js` … `rm -f` (별도 줄); .gitignore:131 `.claude/cache/`는 무시되지만 `plugins/**/.corpus-before.js`는 무시 규칙 없음 |
| test | MEDIUM | panel-span.md 재생성은 어떤 Validate 명령도 검사하지 않는다 — DD11이 M1 동결 블록을 거짓으로 만드는데 그 거짓을 잡을 기계가 없다 | plan Files to Change: "docs/leadtime-observability/panel-span.md \| UPDATE \| ... M1 동결 블록이 거짓이 된다 — 같은 milestone에서 재생성". Task 4 Validate 1~5는 전부 aggregate 픽스처 단언이고 panel-span.md를 언급하지 않으며, Task 6 Validate는 post-panel-span.md의 바이트 일치만 재확인한다. 최상위 ## Validation 블록(plan:506-577)에도 panel-span.md 대조가 없다. M1 test 자신도 동결을 test로 강제하지 않는다고 명시한다(leadtime.test.js:5-8). 즉 재생성을 잊으면 git-tracked 문서가 `"axis":"panel_span"`을 계속 주장하고 전 suite가 green이다. |
| test | MEDIUM | Task 3의 Validate가 설계 어디에도 정의되지 않은 출력 필드(`coverage.LS`)를 단언 대상으로 지목한다 — 그대로는 test를 쓸 수 없다 | plan Task 3 Validate: "`disagreement.n === coverage.LS`이고". 그러나 같은 Task의 Action은 `coverage.only_ledger` / `coverage.only_ship`만 산출 필드로 정의하고, `LS`는 Measured Baseline의 교차표 표기(plan:87 "`LS` 6 · `-S` 6")일 뿐 출력 스키마 어디에도 선언되지 않는다. Task 1/4의 post_panel_span 필드 열거에도 없다. 구현자가 필드 이름을 임의로 정하는 순간 이 단언은 자기 픽스처에 맞춰 쓰이게 되어 과대계수 방향을 실제로 반증하지 못한다. |
| test | MEDIUM | plan 자신의 Validation 키 whitelist가 DD15가 요구하는 앵커 소스 가용성 출력을 수용하지 못할 수 있다 — 준수 구현에서 게이트가 붉어진다 | Validation(plan:527-530)은 `ALLOWED = ["state","unit","method","by_anchor","disagreement","negative_spans","unmatched","coverage"]` 밖의 post_panel_span 키를 전부 throw한다. 반면 DD15(plan:280-283)는 "소스 모델은 그 `sources[]`를 미러하고, 출력에 소스별 `present`/`read_error`를 실어 어느 쪽이었는지 남긴다"를 요구하는데 그 배치처가 명시되지 않았다. post_panel_span 하위에 실으면 whitelist 위반으로 정상 구현이 실패하고, 최상위에 실으면 M1의 corpus `sources`(leadtime.js:178)와 같은 이름을 두고 충돌한다. 어느 쪽인지 plan이 답하지 않으므로 이 가드는 병합 탐지가 아니라 배치 우연에 의존한다. |
| invariant | HIGH | Task 6의 선행조건(축 상태 ok)은 DD15가 닫았다고 주장한 fail-open을 '한쪽 앵커만 부재'인 경우에 그대로 남긴다 — 그리고 그 경우가 바로 이 plan이 굳히려는 결론(ledger 사망)의 시나리오다. | plan:483-489 '(a) post_panel_span 키가 실려 있고 그 축의 state가 ok일 때만 수행한다 … 앵커 디렉토리가 통째로 없으면 관측 0건이라 그 축 키가 아예 안 실리고' — 그러나 plan:451 'damaged가 아니고 관측 0건이면 축 키를 싣지 않는다. 계열 단위도 같다'에 따르면 ledger 계열만 부재/0건이고 ship 계열에 관측이 있으면 축 키는 실리고 state='ok'다. 그 상태에서 Task 6은 Open Question 4에 '-S 6건 근거로 ledger 쓰기가 멈췄다'(plan:479-482)를 git-tracked 문서에 기록한다 — ledger 소스가 이 환경에 아예 없어서 생긴 -S를 '쓰기 중단'의 증거로 봉인하는 것. 선행조건이 계열 단위 커버리지를 요구하지 않으므로 DD15가 round-5 invariant/HIGH로 닫았다고 적은 경로가 부분 부재에 대해 열려 있다. |
| invariant | HIGH | DD4/Task 2가 fail-closed 게이트로 내세운 합계 등식은 catch-all 버킷 때문에 구성상 항상 참이라 degraded 분기가 도달 불가다 — plan이 Task 3에서 스스로 HIGH로 지목한 결함과 동형이다. | plan:18-19 '합계 등식을 fail-closed로 강제한다' · plan:139-140 'unmatched === Σ(사유별 건수)가 성립하지 않으면 state=degraded' · plan:414 분류 순서의 마지막이 'unclassified(증인 중 unavailable이 하나라도 있거나 **그 외**)'. 미짝 전건이 반드시 한 버킷에 떨어지므로 등식은 위반될 수 없다. 대조: plan:433-438이 Task 3의 교차표 항등식을 '두 불리언 분할이라 구성상 항상 참이므로 단독으로는 결함을 못 잡는다(round-2 L2 test/HIGH)'로 판정했고, 미러 원본인 §3.11 C3(archive-complete/scan.js)는 catch-all이 없어야 성립한다. Task 2의 Validate(plan:419-423)에도 등식 위반→degraded의 도달 가능성 증명이 없다 — DD6·unclassified에 요구한 잣대와 불일치. |
| invariant | LOW | Validation의 post_panel_span 키 whitelist가 DD15가 요구한 소스 가용성 필드를 허용하지 않아, 규격대로 구현하면 검증 스크립트가 정상 출력에서 throw한다(게이트가 잘못된 축에서 발화). | plan:527-530 ALLOWED = {state,unit,method,by_anchor,disagreement,negative_spans,unmatched,coverage} vs plan:280-283 DD15 '출력에 소스별 present/read_error를 실어 어느 쪽이었는지 남긴다'. 두 규정이 같은 컨테이너의 키 집합을 서로 다르게 정한다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | DD14의 `pr-ship-gate.js` 인용(export 4종 :184-189 · `hasSkipProof` :74-86 비-export · `forceOverrideActive` :142-144/:158 · `resolveEffectiveVerdict` 경유 :107)을 원문으로 전건 대조했고 전부 정확했다 — 세 겹 상속 주장은 호출 형태대로면 성립한다. DD12의 M1 픽스처 3건(leadtime.test.js:89,129,162-164)을 열어 damaged-first 하에서 red가 되지 않음을 확인했고 plan의 정정(:215는 같은 단언을 갖지 않음)도 맞았다. DD15/DD11의 `corpus.js:670`(damaged 정의)·`:678-681`(present:false vs read_error) 갈래도 실물과 일치했다. Validation의 키 whitelist가 DD2 병합을 실제로 잡는지, `axes` 재도입 가드가 이중 컨테이너를 닫는지도 확인해 문제를 못 찾았다. 무너진 것은 증인 축이다: DD3가 도입한 증인의 긍정 답을 받을 버킷이 판정 순서에 없어, M2가 소유한 PRD Open Question 2가 산출물로 답해지지 않는다. |
| security | pass | 1) 내구 산출물 유출(선례: 절대 `cwd` leak → sanctioned 재봉인): Task 6이 `--json` stdout을 git-tracked 문서에 축자 동결하므로 M2가 새로 추가하는 필드에 머신 고유 문자열이 실리는 경로를 추적했다. `plan_path`는 `normalizePlanPath`(leadtime.js:108-117)가 repo 밖을 `(non-repo-relative)`로 접고, plan의 분류 순서가 그 마커를 `no_plan_path`로 먼저 걸러 조인 키로 새지 않는다. 새 앵커 소스도 확인 — completion-ledger 엔트리(예: diverse-agent-review-m1__f46fa776ef3a.json:4-11)는 decision_id·commit_sha·basename·hash뿐이고, ship receipt 쪽은 `meta.created_at`·`plan_hash`만 소비하므로 `meta.cwd`가 출력에 도달하는 경로가 없다. 유출 finding 없음. 2) 승인 축의 부분상태 신뢰/권한상승: DD14가 인용한 세 겹을 원본과 대조했다 — `pr-ship-gate.js:184-189` export 3종·`:74-80` `hasSkipProof`(비-export)·`:142-144`/`:158` override 결속·`:39,107`의 `resolveEffectiveVerdict` 경유가 전부 실재하고, `review-verdict.js:14-24`의 "부분 stamp는 `unavailable`, codex 폴백 없음"도 plan의 서술과 일치한다. receipt 전체를 넘기라는 요구가 `hasSkipProof` 층을 실제로 발동시키는 유일한 형태임도 확인. 오라클 복제로 인한 완화 경로를 만들지 못했다. 3) 권한 상승 형태: 이 도구는 read-only 계측이라 어떤 게이트도 승인하지 않는다 — 오분류가 receipt·dedupe·ship 판정에 도달하는 경로를 찾지 못했다(`Files to Change`에 commands/hooks/plan-review 0건, Validation이 `git diff --exit-code`로 강제). 4) 경로 주입/traversal: 증인 (c) git 이력 조회가 `plan_path`를 인자로 쓸 가능성을 봤으나 plan이 구현 형태를 정하지 않았고, `(non-repo-relative)`·null이 앞단에서 걸리며 기존 코드가 `execFileSync`(leadtime.js:350)를 쓴다 — 실제 입력에서 결과로 이어지는 경로를 세우지 못해 finding으로 올리지 않는다. 남은 것은 위 MEDIUM/LOW 두 건뿐이라 HIGH 이상 없음. |
| test | pass | DD14의 3겹 상속 주장을 pr-ship-gate.js에 대조(classifyVerdict:107 resolveEffectiveVerdict · :154 hasSkipProof · :144/:157 forceOverrideActive · export :184-189) — 인용 전부 정확했고 Task 1 Validate (4)(5)가 과대허용 방향(무증거 skip 포함 / override 누락으로 실제 ship이 not_shipped)을 둘 다 덮는다. DD12가 pin한다는 기존 M1 단언 3개(leadtime.test.js:89 · :129 · :162-164)를 직접 읽어 인용이 맞고 damaged-first 규칙 하에서 green으로 남는지 확인 — 맞다. DD15의 corpus.js:670 / :678-681 미러 주장도 실코드와 일치. DD4/DD5/DD6의 도달 불가 버킷 논증에 대해 각각 도달성 증명 test가 붙어 있는지 확인 — Task 1 (2), Task 2의 unavailable↔no 짝 test가 실제로 그 축을 덮는다. corpus 동결 test(:335)와 REVIEW_SUBDIRS 단언(:348)이 이번 변경으로 붉어지는지도 확인 — 붉어지지 않는다. 남은 결함은 위 3건(문서 동결 검증 부재 · 미정의 필드를 지목한 Validate · whitelist와 DD15 출력 요구의 미정합)이며 전부 MEDIUM. |
| invariant | fail | plan의 인용을 원본과 대조: pr-ship-gate.js:74-86,142-159,184-189(DD14 3겹·override·SKIP_PROOF 비-export 주장 전부 정확), corpus.js:670,676-690(present:false vs read_error 구분 정확), leadtime.js:231-239(damaged-first 조기 return 정확). 그 뒤 미지 입력 경로를 추적했다 — 앵커 소스 부분 부재, read_error vs 부재, catch-all 버킷이 있는 합계 등식의 도달 가능성, 음수 span degraded의 도달 가능성(DD5 fallback으로 실제 닫힘), Task 6 선행조건, Validation whitelist·throw 유무(DD14 필드·state 축 모두 throw로 게이트됨을 확인), env 토글 부재로 인한 rollback(=revert, read-only 도구라 수용). 위 3건 외에는 결함을 찾지 못했다. |

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
  "wall_clock_ms": 191178,
  "halt_stage": null,
  "backlog_appended": 5,
  "backlog_skipped_nonblocking": 8,
  "granted": 4,
  "reviewed_plan_hash": "sha256:d3fd826ad2addfd0f8b67dfa54c7a9993a9194d7b5a76c29e2ad7c4e8fe4a7b5",
  "plan_path": ".claude/plans/leadtime-observability-m2.plan.md",
  "recorded_at": "2026-09-02T01:23:24.419Z"
}
```
