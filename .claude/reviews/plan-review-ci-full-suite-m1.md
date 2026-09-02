# Plan Review Panel — ci-full-suite-m1

**Plan**: `.claude/plans/ci-full-suite-m1.plan.md` · **Plan version**: `sha256:dab39c61590bec44c6948dbae348cc8d0f06cc5c8feed39ddf1938b65910fab3`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 6 blocking finding(s): security/HIGH, security/HIGH, security/FAIL, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | Task 3의 4값 attribution probe가 요구하는 관측치(nesting-0 `test:complete` 이벤트 수)를 Task 2의 reporter 출력 계약이 약속하지 않는다 — 'none'과 'unavailable'을 가르는 데이터 채널이 층 경계에서 끊긴다 | plan:115 reporter 계약은 `{file, tests, pass, fail, sum_ms, first_at, last_at}` 파일별 집계와 `attribution:"unavailable"` 명시 emit만 규정한다. 그러나 plan:131-132는 `unavailable`(nesting-0 이벤트 ≥1건 도착, data.file 없음) 대 `none`(nesting-0 이벤트 0건)을 가르는 기준이 "이벤트가 도착했는가"라고 못박고 plan:134가 "판정은 추론이 아니라 probe"라고 선언한다. reporter가 이벤트 도착 수를 싣지 않으면 run.js는 그 구분을 추론할 수밖에 없다 |
| architect | MEDIUM | chunk 접기 규칙이 `exit_code`·`per_file`·`failing`·`ok`·`attribution`은 명시하면서 `reason`의 접기를 규정하지 않는다 — plan 자신이 exit_code에 대해 든 "미지정 기본값은 마지막 값이고 그것은 fail-open" 논거가 그대로 적용된다 | plan:135 "`exit_code`는 하나라도 비영점이면 비영점 … `ok`는 전 chunk의 논리곱 … 미지정 기본값은 통상 '마지막 값'으로 구현되며 그것은 앞 chunk의 red를 덮는 fail-open이다" — 이 열거에 `reason`이 없다. `ok:false`가 되어도 앞 chunk의 `reason`('redaction-incomplete' 등)이 마지막 chunk의 `null`로 덮이면 Acceptance 1의 `reason==='attribution-unavailable'` 대조(plan:280)와 Task 6 Validate(plan:175)가 판정 근거를 잃는다 |
| architect | MEDIUM | Task 5의 node 24 CI job은 어떤 acceptance 소비처도 없는 전수 완주를 추가로 지불하며, PRD가 명시한 "산정 전 matrix 확대 금지"보다 앞선다 | plan:158 "matrix는 `ubuntu-latest` × `node [20, 24]`" 인데 Acceptance 1의 수용 표(plan:279-280)에는 `local`과 `ci-node20` 두 행뿐이고 `ci-node24` 원소를 요구하는 acceptance가 없다. PRD Risks(prd:102)는 "GitHub Actions 분 소모 … M1 벽시계 × 월 PR 수로 산정 가능하다. 산정 전 matrix 확대 금지"로 그 순서를 정해 뒀고, DD5(plan:86-88)가 CI 측정을 정당화하는 근거는 Node 20 하한 실증뿐이다 |
| security | HIGH | 병합 시점의 redaction 재적용은 CI artifact의 유출을 구조적으로 탐지할 수 없다 — 불변식이 '로컬' repoRoot·tmpdir 접두만 보기 때문. plan이 스스로 '신뢰 경계를 넘는 지점'이라 부른 바로 그 경로가 무방비다. | plan Task 2(:116) 'emit 직전 산출 전체를 훑어 `repoRoot`·`tmpdir` 어느 후보로도 시작하는 잔여 절대경로가 있으면 ok:false' + Task 4-(10)(:151) '**redaction 불변식이 병합 시점에 재적용**됨을 단언한다 … 다운로드한 artifact → 커밋되는 파일은 신뢰 경계를 넘는 지점이다'. 병합은 로컬 Windows 머신에서 실행되므로 repoRoot=`C:\\_project\\mccp\\...`, tmpdir=`C:\\Users\\ADMINI~1\\...`이고, CI artifact가 담은 `/home/runner/work/...`·`/tmp/...`는 두 접두 어느 것으로도 시작하지 않아 불변식이 통과시킨다. plan이 정본 가드로 지목한 장치가 그 경로에서는 항상 참을 돌려준다. 남는 것은 plan 스스로 '플랫폼별 패턴 열거는 반드시 빠뜨린다'(:227-229, :287)고 인정한 보조 grep뿐이다. 결과: git-tracked `.claude/_meta/data/2026-09-01-suite-baseline.json`에 외부 호스트 절대경로가 커밋되며, 이것이 §3.12가 sanctioned re-seal까지 동원해 닫은 유출 형태의 재개방이다. |
| security | HIGH | redaction 불변식은 '표시'만 하고 '차단'하지 않는다 — `ok:false, reason:'redaction-incomplete'` 산출도 그대로 tracked 컨테이너에 append된다. | plan Task 3(:122) '--merge-into <container> --label <name> [--from <file>] (tracked 컨테이너에 append; 같은 label은 교체)'에는 ok 값에 따른 거부 조건이 없고, Task 4-(10)(:151)의 병합 거부 사유는 '스키마(필수 키 존재 · `ok` 불리언)를 만족하지 않으면'뿐이다 — `ok===false`는 유효 불리언이라 통과한다. 즉 러너가 미redaction 절대경로를 탐지한 바로 그 산출물이 유출 문자열을 그대로 실은 채 git-tracked 파일에 기록된다. Acceptance 1의 `ok===true` 요구는 사람이 사후에 읽는 조건이라 이미 쓰인 파일을 되돌리지 못한다. |
| security | MEDIUM | redaction 대상 집합(repoRoot·tmpdir)이 실패 진단 문자열에 실제로 나타나는 세 번째 뿌리 — 사용자 홈 디렉토리 — 를 포함하지 않는다. | plan Task 2(:116)는 접두 후보를 `repoRoot`와 `os.tmpdir()`(및 그 realpath) 둘로 한정한다. 그러나 이 스위트의 test는 사용자 레벨 경로를 다루며(CLAUDE.md §3.17 오라클이 `~/.claude/plugins/...`를, §3.3이 `~/.claude/plugins/installed_plugins.json`를 해소한다) 그 경로는 repoRoot 밑도 tmpdir 밑도 아니다. 실패 메시지에 실리면 불변식은 침묵하고 계정명(`C:\\Users\\Administrator\\...`)이 tracked JSON에 남는다 — Validation의 `AppData` grep은 `.claude` 홈 경로를 매치하지 않는다(:230). |
| test | MEDIUM | Validation 블록이 "git-bash와 pwsh 양쪽에서 돈다"고 단언하지만 그 블록은 pwsh에서 실행 불가다 — plan이 스스로 검증 수단의 이식성을 주장하면서 그것을 반증할 근거가 없다 | .claude/plans/ci-full-suite-m1.plan.md:204-206 "이 blocks는 git-bash와 pwsh 양쪽에서 돈다" — 그러나 같은 블록이 `wc -l`(:197), `WORK="${TMPDIR:-${TEMP:-.}}/…"; mkdir -p`(:206), `diff`(:212), `grep -cE`(:230), `for i in 1 2 3; do … done`(:234)을 쓴다. 이들은 POSIX 셸 구문/도구이며 pwsh에서는 파싱 단계에서 실패한다(pwsh에 `wc`·`diff`(별칭 아님)·`grep` 부재, `${VAR:-}` 확장 미지원). 개발 머신이 Windows(:204)이므로 이 오주장은 실제로 발현한다 |
| test | LOW | Task 1·Task 2의 Validate가 Task 4에서야 생성되는 test 파일을 지목한다 — 해당 시점에 그 명령은 존재하지 않는 파일을 대상으로 하므로 그 Task가 바꾼 것을 실제로 행사하지 못한다 | .claude/plans/ci-full-suite-m1.plan.md:112 (Task 1 Validate) 와 :119 (Task 2 Validate) 가 모두 `node --test scripts/tests/test-suite.test.js`인데, 그 파일은 :57 및 Task 4(:140)에서 CREATE된다. Files to Change 표에도 Task 4 산출물로만 등재 |
| test | MEDIUM | Acceptance 1의 수용 표가 plan 스스로 개연적이라 예측한 실패 모드(import error·크래시로 nesting-0 이벤트를 못 낸 파일)에 어떤 수용 조합도 부여하지 않아, 러너 결함과 '정상 스위트에 크래시 파일 1건'을 구분하는 test가 없다 | .claude/plans/ci-full-suite-m1.plan.md:128 "import error나 크래시로 test:complete(nesting 0)를 한 번도 못 낸 파일이 집계에서 조용히 사라진다" → `attribution:'partial'`. :282 "`partial`과 `none`은 어느 원소에서도 수용하지 않는다". 동시에 :259 Risk가 `.claude/scripts/receipt/tests` 10개(2026-06-03 이후 미실행, :187 "baseline 로그가 … 한 번도 돌리지 않았다")를 포함해 돌리며 "실패하면 그것이 데이터"라고 적는다. 즉 단 1개 파일의 로드 실패로 milestone acceptance가 충족 불가가 되고, Task 4-(11)의 단언은 판정 함수의 과다허용 방향만 덮을 뿐 '러너 버그 vs 대상 파일 크래시'를 가르는 축을 갖지 않는다 |
| invariant | HIGH | redaction 불변식(정본 가드)의 적용 범위가 reporter 산출에 한정돼, run.js가 직접 만드는 reason/에러 텍스트의 절대경로 유출을 구조적으로 못 잡는다. 그 결과 '정본 가드'는 가드처럼 보이되 지배적 유출 경로(spawn 실패 메시지)를 통과시킨다. | plan.md:116은 불변식을 reporter의 'emit 직전 산출 전체'로 정의하고, plan.md:137이 미러로 지목한 suite-determinism.js:136은 `reason: 'spawn-failed: ' + r.error.message`로 절대경로가 실릴 수 있는 문자열을 산출에 싣는다. plan.md:127도 같은 계약을 러너에 그대로 채택('r.error와 요약 헤더 부재를 각각 ok:false, reason:spawn-failed…로'). Task 4-(4) redaction 단언(plan.md:145)은 합성 reporter 이벤트만 대상이라 이 경로에 회귀 가드가 없고, Acceptance 6(plan.md:287)은 grep을 '보조'로 격하해 정본을 이 불완전한 불변식에 맡긴다. |
| invariant | HIGH | redaction 실패가 tracked 컨테이너 쓰기를 차단하지 않는다 — 불변식이 block이 아니라 flag로 접힌다. ok:false를 세워도 유출된 절대경로는 그대로 git-tracked 파일에 들어간다. | plan.md:116은 실패 시 처리를 'ok:false + reason:redaction-incomplete로 떨어뜨린다'로만 규정하고 어디에도 '쓰지 않는다/거부한다'가 없다. tracked 파일을 쓰는 유일 주체인 --merge-into(plan.md:122,170)의 거부 조건은 Task 4-(10)에서 '필수 키 존재 · ok 불리언'(plan.md:151)뿐이라 ok:false도 불리언이므로 통과한다. 그럼에도 Acceptance 6(plan.md:287)은 '컨테이너 전체에 절대경로 0건'을 이 불변식이 보증한다고 주장한다. |
| invariant | MEDIUM | 결속(anchoring)이 값의 존재만 검사하고 동일성을 검사하지 않는다 — 다른 커밋에서 뜬 CI artifact가 이번 커밋의 baseline으로 봉인될 수 있다. | plan.md:126은 git_sha/ci_run_id를 '결속'이라 부르지만, Task 6 Validate(plan.md:175)와 Acceptance 1(plan.md:275)의 조건은 'git_sha 비어있지 않음'뿐이다. --merge-into는 임의 --from JSON을 받고(plan.md:151, '다운로드한 artifact → 커밋되는 파일은 신뢰 경계를 넘는 지점'), 같은 label을 무조건 교체하므로(plan.md:122) 원소 간 git_sha 일치 검사가 어디에도 없다. M2 임계값·M3 shard 수가 이 미검증 결속에서 파생된다. |
| invariant | LOW | Task 5 workflow의 continue-on-error가 M3으로 상속되며, 트리거만 확대하고 이 플래그를 지우지 않으면 강제 게이트가 조용히 무발화 상태로 켜진다. 플랜은 이 제거 의무를 M3에 명시 인계하지 않는다. | plan.md:159-160은 continue-on-error:true + if:always()가 'run 상태는 증거가 아니다'를 만든다고 스스로 적으면서, 그 플래그의 제거를 M3 인계 항목(plan.md:178의 Task 7 일곱 항목)에 넣지 않는다. Acceptance 3(plan.md:284)도 M1 범위의 artifact 내용 검사에서 끝난다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 인용 검증: `suite-determinism.js`의 :17-19(관측만) · :29 DEFAULT_PATTERN · :72 diffRuns · :125-151 runSuite/ok 계약 · :129 셸 없는 spawnSync 패턴을 전부 원문 대조 — plan의 서술과 일치. `axis-k-m2-cross-platform.yml`이 `pull_request`+`workflow_dispatch`를 둘 다 갖고 artifact 이름에 matrix 축을 넣는다는 미러 주장도 :17-28, :69에서 확인. `helpers.js:8-19` 6-spawn `mkTmpRepo` 실측 확인. `marketplace.json:9`의 `source: ./plugins/mccp`로 `scripts/`가 배포 표면 밖(UI6)이라는 DD1 근거 확인, 최상위 `scripts/`가 실제로 부재함도 glob으로 확인. 공격한 축: (a) \\"tracked 컨테이너의 유일한 writer는 `--merge-into`\\"라는 단일 소유권 주장 — Files to Change(:59)와 Task 3(:122)이 서로 정합하고 반증 못함, (b) 자기 포함 단언이 실제 producer를 통과하는가 — (8)이 실행층 spawn이라 우회 없음, (c) 열거 정의가 둘(새 러너 vs DEFAULT_PATTERN)로 갈리는 이음매 — Risks(:263)가 이미 불일치를 실재로 인정하고 M3에 인계, (d) `ok`가 스위트 green을 뜻하지 않는다는 경계 — 미러 원본과 일치, (e) redaction 불변식의 소유자가 reporter인지 runner인지 — Task 4-(4)(10)이 양쪽 시점을 모두 단언해 덮임. 남은 셋만 증거로 세웠고 HIGH 이상은 찾지 못했다. |
| security | fail | 공격 대상: (1) tracked 산출물로의 경로 유출 — Task 2 redaction 불변식의 접두 집합을 로컬 실행·CI artifact 병합·홈 디렉토리 세 입력으로 각각 추적해 세 건 중 세 건 모두 소비처까지 도달함을 확인. (2) `--merge-into --from`의 신뢰 경계 — 스키마 검증이 필수 키·`ok` 불리언뿐이라 ok:false 유출 payload가 통과함. (3) `--label`/`--from` 경로 주입 — label은 컨테이너의 맵 키일 뿐 파일명이 아니고, `--files-from` 목록은 `git ls-files` tracked 산출이라 traversal 소비처를 찾지 못함(무소득). (4) `pull_request` 트리거의 fork 실행 위험 — `pull_request`(not `_target`)라 secrets 미노출·read-only token이고 단일 운영자 저장소라 실입력→결과 경로를 만들지 못함(무소득). (5) `--` 종결자 부재로 인한 node 플래그 주입 — plan이 Task 3-3에서 이미 닫음(무소득). (6) `helpers.js:9`의 `os.tmpdir()` 인용이 실제로 그 줄에 있는지 대조 — 정확함. (7) `continue-on-error` + `if: always()`의 위조 성공 — plan Task 5(:160)가 이미 흡수함. |
| test | pass | 공격한 축: (a) Mirror 인용 검증 — suite-determinism.js:129-153의 runSuite가 plan이 주장한 대로 spawn 실패/불완전 TAP을 ok:false로 되돌리는지 확인(일치, 반증 실패). (b) 기존 test가 바뀌는 동작을 pin하고 있는지 — Files to Change 9건이 전부 CREATE 또는 문서/PRD 갱신이고 plugins/mccp/ 무변경(DD3)이라 기존 suite를 붉히는 축 없음(반증 실패). (c) 과다허용 방향 커버리지 — 'attribution 0건이 ok:true'라는 역전은 Task 4-(11)이 negative 단언으로 명시 차단(반증 실패). (d) 합성 fixture가 실제 producer를 증명하지 않는 문제 — (8) run.js --list 실제 spawn, (9) 실제 node --test 붙이기로 이미 닫혀 있음(반증 실패). (e) chunk 접기 fail-open — (7)이 '첫 chunk red + 마지막 green'을 명시 단언(반증 실패). (f) redaction 회귀 — (4)가 원본 절대경로 부재를 문자열로 단언 + 러너 내부 불변식(reason:'redaction-incomplete')이 정본(반증 실패). (g) Validate 명령의 경로 실재성/실행 셸 — 여기서 pwsh 이식성 오주장과 Task 1/2의 순서 역전을 찾음. (h) Acceptance 수용 표의 열거 완전성 — partial/none 처리 공백을 찾음. .claude/scripts/receipt/tests/*.test.js 10건이 실재하고 상대 require로 로드 가능해 보임을 확인해, 세 번째 finding은 확정 결함이 아니라 미커버 분기로 MEDIUM 유지. |
| invariant | fail | Task 3의 4값 attribution probe(complete/partial/unavailable/none)와 chunk 접기 규칙, Acceptance 1의 열거식 수용표를 permissive 방향으로 열어 보려 했으나 ok:true는 complete 단독이고 partial/none이 양 원소에서 금지돼 반증 실패. Acceptance 2(--list == git ls-files)와 자기 포함 단언, Task 0 삭제 검증, DD3의 미변경 단언도 공격했으나 결함 없음. 뚫린 곳은 (a) redaction 불변식의 커버리지 경계(reporter 밖의 run.js reason 문자열 — 미러 원본 suite-determinism.js:136이 error.message를 그대로 싣는다), (b) 그 불변식이 tracked 쓰기를 막지 않고 --merge-into의 스키마 검사가 ok:false를 통과시키는 점, (c) git_sha를 '결속'이라 부르면서 존재 검사만 하는 anchoring 공백이다. |

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
  "wall_clock_ms": 291040,
  "halt_stage": null,
  "backlog_appended": 6,
  "backlog_skipped_nonblocking": 9,
  "granted": 4,
  "reviewed_plan_hash": "sha256:dab39c61590bec44c6948dbae348cc8d0f06cc5c8feed39ddf1938b65910fab3",
  "plan_path": ".claude/plans/ci-full-suite-m1.plan.md",
  "recorded_at": "2026-09-01T07:59:25.057Z"
}
```
