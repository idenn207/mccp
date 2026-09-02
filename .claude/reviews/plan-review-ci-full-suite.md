# Plan Review Panel — ci-full-suite

**Plan**: `.claude/plans/ci-full-suite-m1.plan.md` · **Plan version**: `sha256:b86c102dbf319706087215734869b6ce41ee5bf2c7dfdf328646b0521c6c52e1`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired

> Reason: L2 quorum not satisfied: 5 blocking finding(s): test/HIGH, test/HIGH, test/FAIL, invariant/HIGH — MCCP_REVIEW_SINGLE_PASS=deferred_to_prd_completion 로 진행한다. verdict는 divergent 그대로 봉인된다.

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | redaction 불변식의 소유자가 둘이고 공유 모듈이 지정되지 않았다. Task 2는 redaction과 그 최종 가드(`ok:false` + `reason:'redaction-incomplete'`)를 reporter.mjs 안에 두고, Task 4-(10)은 `--merge-into` 병합 시점(run.js)에 "redaction 불변식이 재적용"될 것을 요구한다. Files to Change 9건 중 두 파일이 공유할 순수 모듈이 없어(enumerate.js는 열거 전용) 같은 불변식이 두 곳에 구현되거나 한쪽이 조용히 빠질 수 있다 — plan이 스스로 '단일 writer'를 명시한 축(Task 3의 `--merge-into` 유일 writer)과 대칭인 '단일 redactor' 선언이 없다. | .claude/plans/ci-full-suite-m1.plan.md:116 ("마지막 방어는 … emit 직전 산출 전체를 훑어 … `reason:'redaction-incomplete'`") 대 :145 ("**redaction 불변식이 병합 시점에 재적용**됨을 단언한다") — Files to Change(:54-59)에 공유 모듈 없음 |
| architect | MEDIUM | ESM/CJS 경계가 미해결이다. reporter는 `.mjs`(ESM)로 고정되면서 "순수 집계 함수를 named export로 분리"해 Task 4-(3)(4)가 합성 이벤트로 단언하도록 설계됐는데, 이 저장소의 test 관행은 CJS `require`이고 러너/test 파일은 `.js`다. CJS에서 `.mjs`를 `require`할 수 없으며 `require(esm)`은 Node 20 기본에서 불가라 CI matrix의 node 20에서 그 seam이 성립하지 않는다. plan은 이 경계를 한 줄도 다루지 않는다. | plan:55(`scripts/test-suite/reporter.mjs` CREATE) · plan:115("순수 집계 함수를 named export로 분리") · plan:57,138(`scripts/tests/test-suite.test.js`가 그것을 단언) · 관행 근거 plugins/mccp/scripts/lib/tests/suite-determinism.test.js:12-15(`require('node:test')`, `require('../suite-determinism')`) · plan:151(matrix node [20,24]) |
| architect | MEDIUM | Acceptance 1이 `attribution:'unavailable'`에만 예외를 뒀고 `partial`에는 두지 않아, plan 자신이 예상한다고 적은 결과(대량 red · 크래시로 nesting-0 이벤트를 못 낸 파일)에서 milestone이 자기 acceptance를 충족할 수 없다. plan은 바로 그 구조("설계대로 동작했는데 acceptance를 충족 못 해 acceptance를 완화하게 되는 것")를 :263에서 회피 대상으로 명시했는데, 같은 형태가 partial 축에 남아 있다. | plan:128("`attribution === 'complete'`… 그렇지 않으면 `ok:false` + `attribution:'partial'`") 대 plan:263("두 원소 모두 `ok === true`" + unavailable에만 예외) · plan:242 Risks("전수 완주가 대량 red를 노출") |
| architect | LOW | CI artifact 이름 계약이 Task 5와 Validation/Acceptance 사이에서 어긋난다. Task 5는 `upload-artifact` 이름을 정하지 않은 채 matrix(node 20/24)로 두 job을 돌리는데, Validation은 `gh run download --name test-suite-baseline-node20`이라는 특정 이름을 전제한다. 미러로 인용한 axis-k는 이름에 matrix 축을 넣어(`axis-k-m2-${{ matrix.os }}`) 충돌을 피하는데, 그 패턴이 Task 5 본문에 옮겨지지 않았다. | plan:152(단계 서술에 artifact 이름 없음) 대 plan:214(`--name test-suite-baseline-node20`) · 미러 원본 .github/workflows/axis-k-m2-cross-platform.yml:69(`name: axis-k-m2-${{ matrix.os }}`) |
| security | MEDIUM | 신뢰 경계(CI artifact → git-tracked 컨테이너)에 대한 '정본 가드'로 지목된 redaction 불변식은 그 경계에서 구조적으로 무력하다. 불변식은 `repoRoot`·`os.tmpdir()` 후보 **접두 일치**로만 잔여 절대경로를 판정하는데(plan Task 2, :116), 병합은 로컬 머신에서 일어나므로 그 후보는 로컬 값이다. `--from`으로 들어온 CI 산출물의 `/home/runner/...` · `/tmp/...` 문자열은 어떤 로컬 후보로도 시작하지 않아 `redaction-incomplete`를 절대 발화시키지 않는다. 그런데 plan은 Task 4-(10)에서 '다운로드한 artifact → 커밋되는 파일은 신뢰 경계를 넘는 지점'이라며 바로 이 불변식의 '병합 시점 재적용'을 그 경계의 통제로 내세운다. 실제 통제는 CI runner 쪽 자기 redaction뿐이고, 병합 측 검증은 스키마(필수 키·`ok` 불리언)에 그친다 — 즉 러너가 redact하지 않은/손상된 artifact를 병합 측이 잡는다는 주장은 성립하지 않는다. | plan :116 "emit 직전 산출 전체를 훑어 `repoRoot`·`tmpdir` 어느 후보로도 시작하는 잔여 절대경로가 있으면 `ok:false`" vs plan :145 "**redaction 불변식이 병합 시점에 재적용**됨을 단언한다. … 다운로드한 artifact → 커밋되는 파일은 신뢰 경계를 넘는 지점이다" |
| security | MEDIUM | Acceptance 6이 보조 확인으로 지정한 grep은 Windows 절대경로를 **구조적으로 못 잡는다** — 개발 머신이 Windows이고 로컬 완주가 주 측정원인데, 그 케이스에서 이 확인은 항상 0(통과)을 보고한다. 단일 인용부호 안의 ERE `[A-Za-z]:\\\\\\\\`는 리터럴 백슬래시 **2개**를 요구하지만 실제 경로(`C:\\_project\\…`)에는 1개뿐이다. 위 finding과 겹치면 Windows-origin 유출에 대해 정본(불변식은 로컬 후보 접두라 일부만 커버)과 보조(패턴 오작동) 양쪽이 동시에 약해진다. | plan :221-222 `grep -cE '([A-Za-z]:\\\\\\\\\|/home/\|/Users/\|/tmp/\|/var/folders/\|AppData)' … # 0` — 동일 패턴이 Acceptance 6(:268)에 정본 보조로 재인용됨 |
| security | LOW | `exclusions` 봉인은 sha256을 **같은 산출물 안에** 넣을 뿐이라 변조 탐지 능력이 없다(제외 목록을 바꾸고 해시를 다시 계산하면 일치한다). plan 자신이 Risks에서 '사후 대조를 가능하게 한다'고 주장하지만, 대조 상대(외부 앵커)가 정의되지 않았다. 커버리지 분모를 정하는 유일한 필드라는 점에서 M3이 이 필드를 신뢰하면 그 신뢰는 근거가 없다. M1은 커버리지를 산출하지 않으므로 즉시 소비처는 없다. | plan :130 "적용된 `{pattern, reason}` 배열과 그 정렬 직렬화의 sha256을 싣는다 … 사후 대조가 가능" / plan :252 "사유 문자열의 **출처**를 묶는 장치는 없으며" |
| test | HIGH | 플랜이 스스로 '유일한 치명 실패 방향'이라 부른 축(귀속 불완전 → 부분 측정이 완주로 읽힘)에 대응하는 단언이 Task 4 목록에 없다. Task 3은 'attribution === complete는 per_file 항목 수 = files_total을 뜻하고, 그렇지 않으면 ok:false + attribution:partial'을 계약으로 선언하지만(plan L128), Task 4의 열 갈래 중 그 negative 방향을 단언하는 항목은 없다 — (9)는 2개 파일 fixture로 attribution==='complete' + per_file 길이 2라는 positive 방향만 단언하고, (6)은 spawn ENOENT/마지막 줄 부재/절단 출력만 다룬다. 즉 'import error로 test:complete를 한 번도 못 낸 파일이 조용히 사라지는' 바로 그 케이스는 어떤 test도 반증하지 못한다(과다허용 방향 미커버). | plan L128 "`attribution === 'complete'`는 `per_file` 항목 수 = `files_total`을 뜻하고, 그렇지 않으면 `ok:false` + `attribution:'partial'`" 대비 plan L135-145 Task 4 (1)~(10) 어디에도 partial/누락 파일 단언 없음; L141 (6)은 spawn 실패·출력 절단만 열거 |
| test | HIGH | Task 5의 Validate 라인이 이 브랜치에서 구조적으로 실행 불가능한 명령을 지목한다. 플랜 자신이 'GitHub은 workflow_dispatch를 default branch의 workflow 파일에 대해서만 받는다'고 적고 그 때문에 pull_request 트리거를 추가했는데(L152), Task 5 Validate와 Validation 블록은 여전히 `gh workflow run test-suite-baseline.yml`을 검증 수단으로 남긴다. 실제 머지 전 발화 경로(좁은 paths의 pull_request)를 돌리는 Validate 라인은 하나도 없어, Task 5가 바꾼 것(트리거 확장)을 실제로 행사하는 명령이 부재하다. | plan L152 "신규 파일은 이 브랜치에만 있으므로 머지 전 `gh workflow run`이 그것을 찾지 못하고" 대비 L155 "**Validate**: `gh workflow run test-suite-baseline.yml` 후 `gh run watch`" 및 L235 동일 명령 |
| test | MEDIUM | Task 6의 Validate가 Acceptance 1과 모순된다. Acceptance 1은 DD6의 `attribution:'unavailable'` 분기를 '정상 결과'로 인정해 per_file 길이 = files_total 요구를 attribution==='complete' 원소에만 건다. 그러나 Task 6 Validate는 예외 없이 '각 runs[] 원소가 ok=true이고 per_file 항목 수가 files_total과 같음'을 요구한다. Node 20에서 data.file이 없어 설계대로 unavailable로 떨어지면(per_file은 DD6·L127대로 null) Validate는 red, Acceptance는 green이 되어 어느 쪽이 판정 정본인지 불명확하다. | plan L166 "**Validate**: 컨테이너의 각 `runs[]` 원소가 `ok=true`이고 … `per_file` 항목 수가 그 원소의 `files_total`과 같음" 대비 L263 "`per_file` 길이 = `files_total`은 `attribution === 'complete'` 인 원소에만 요구한다" |
| test | MEDIUM | Validation 블록의 CI 병합 경로가 존재가 정의되지 않은 artifact 이름을 참조한다. Task 5는 산출 파일명(`baseline-node<N>.json`)만 정하고 upload-artifact의 `name`을 정하지 않는데, Validation은 `gh run download --name test-suite-baseline-node20`을 쓴다. 이름이 계약되지 않아 그 명령이 성립하는지 계획만으로 검증 불가하고, Acceptance 3(artifact 내용 검사)이 그 경로 위에 서 있다. | plan L152 "`node scripts/test-suite/run.js --json > baseline-node<N>.json` → `upload-artifact`" 대비 L214 "gh run download --name test-suite-baseline-node20 --dir \\"$WORK/ci\\"" |
| test | LOW | Task 1·2의 Validate 라인이 그 시점에 존재하지 않는 파일을 실행한다(해당 test 파일은 Task 4에서 CREATE). 또한 Task 4는 '여덟 갈래를 단언한다'고 선언한 뒤 (1)~(10) 열 항목을 열거해, 어느 집합이 계약인지 산술적으로 어긋난다. | plan L112·L119 "**Validate**: `node --test scripts/tests/test-suite.test.js`" 대비 L57 해당 파일 Action=CREATE(Task 4); L135 "여덟 갈래를 단언한다" 대비 L136-145의 10개 항목 |
| invariant | HIGH | 'attribution: unavailable → ok:true' 분기가 이 러너의 유일한 치명 방향(DD8: 실행되지 않았는데 통과로 읽힘)을 그대로 연다. 전 파일이 import error/크래시로 nesting-0 test:complete를 한 번도 못 내면 귀속 항목이 0건이 되어 '부분'이 아니라 '전무'가 되고, plan의 규칙상 그것은 partial(ok:false)이 아니라 unavailable(ok:true)로 접힌다. 즉 1개만 귀속되면 차단되고 0개 귀속되면 통과한다 — 최악 입력이 permissive 방향으로 떨어지는 역전이다. 러너에는 'Node가 그 필드를 지원하지 않음'과 '아무 test도 실행되지 않음'을 구분할 probe가 없고, exit_code 비영점도 ok를 떨어뜨리지 않는다(Task 3의 ok 정의). 그러면 Acceptance 1은 exemption 조항으로 그 원소를 수용하므로, 실행 0건의 baseline이 유효 측정으로 봉인되어 M2 임계값·M3 shard 수가 그 위에 선다. 미러 대상 runSuite는 정반대다 — 요약 헤더 부재를 ok:false('incomplete-tap')로 되돌린다(suite-determinism.js:141-147). | ci-full-suite-m1.plan.md:128 "Node가 `data.file`을 아예 안 싣는 경우는 다른 축이라 `attribution:'unavailable'`이며, 그때 `ok`는 `true`다" + :263 "`per_file` 길이 = `files_total`은 `attribution === 'complete'` 인 원소에만 요구한다"; 대조: plugins/mccp/scripts/lib/suite-determinism.js:141-147 |
| invariant | MEDIUM | chunk 접기 규칙이 attribution을 빠뜨린다. Task 3은 exit_code·per_file·failing·ok 네 축의 접기만 명시하는데, 같은 Task가 ok를 attribution에 의존시킨다(:128). chunk가 둘 이상일 때(346경로/24,000바이트 임계에서 실제로 발생) 한 chunk가 unavailable/partial이고 다른 chunk가 complete면 attribution의 접기 값이 미정이고, plan 자신이 :129에서 지적한 대로 '미지정 기본값은 통상 마지막 값'이라 앞 chunk의 귀속 실패가 뒤 chunk의 complete에 덮인다 — 그러면 per_file 합집합 항목 수 < files_total인데 attribution='complete'가 되어 Acceptance 1의 길이 검사조차 어느 쪽으로 판정될지 모른다. Task 4-(7)의 접기 단언도 네 축만 열거하므로 어떤 test도 이 축을 잡지 않는다. | ci-full-suite-m1.plan.md:129 (접기 4축 열거, attribution 부재) 대 :128 (ok가 attribution에 의존); Task 4-(7) :142 |
| invariant | MEDIUM | Task 6의 Validate가 Acceptance 1과 어긋나며 더 엄격한 쪽이 예외를 모른다. Task 6 Validate는 '각 runs[] 원소가 ok=true이고 per_file 항목 수가 그 원소의 files_total과 같음'을 무조건 요구하는데, Acceptance 1은 attribution='unavailable' 원소를 그 요구에서 명시 면제한다. 설계대로 DD6 분기가 발화하면 Validate는 red가 되고, 그때의 자연스러운 해소는 게이트 완화다 — Acceptance 1이 스스로 경고한 '게이트가 게이트인 척하며 열린다'가 같은 문서 안에서 재현된다. | ci-full-suite-m1.plan.md:166 대 :263 |
| invariant | MEDIUM | tracked 증거 컨테이너의 유일한 writer(`--merge-into`)에 원자성·락 규정이 없다. 이 저장소는 tracked 증거에 대해 atomic tmp+rename과 write lock을 계약으로 갖는데(CLAUDE.md §3.6 evidence write lock, §3.12), plan은 merge를 'run.js 자신이 한다'고만 정하고 부분 기록(프로세스 중단 시 반쯤 쓰인 JSON)에 대해 아무 말도 하지 않는다. Task 4-(10)의 병합 단언도 label 교체·스키마 거부·redaction 재적용만 덮고 중단 내구성은 덮지 않는다. 컨테이너가 깨지면 앞선 label 원소(로컬 174분 완주 산출)가 함께 소실된다. | ci-full-suite-m1.plan.md:122 "tracked 증거 파일을 쓰는 주체는 이 마지막 하나뿐이다", :145 Task 4-(10) (원자성 미언급); 대조: CLAUDE.md §3.6 "evidence write lock … atomic tmp+rename" |
| invariant | LOW | 두 run 원소의 결속(anchor)이 원소 내부에만 있고 원소 간 대조가 없다. git_sha·ci_run_id를 '결속'이라 부르면서, merge는 서로 다른 커밋에서 뜬 local과 ci-node20을 같은 컨테이너에 넣는 것을 막지 않는다(Task 4-(10)의 거부 조건은 필수 키 존재와 ok 불리언뿐). M2 임계값과 M3 shard 수가 '서로 다른 트리의 두 측정'을 하나의 baseline으로 읽는 경로가 열려 있다. | ci-full-suite-m1.plan.md:126 "`git_sha` … `ci_run_id` … 는 **결속**이다" 대 :145 "필수 키 존재 · `ok` 불리언" |
| invariant | LOW | Validation의 절대경로 grep은 통과 시 비영점 종료라 스크립트 문맥에서 극성이 뒤집힌다. `grep -cE ... # 0`은 매치 0건일 때 exit 1이므로, 이 bash 블록을 순차 실행하는 어떤 자동화도 '유출 0건'을 실패로 읽는다(반대로 매치가 있으면 exit 0). 보조 확인이라 치명은 아니지만, 기록된 대로 실행하면 정상 상태가 red다. | ci-full-suite-m1.plan.md:221-222 |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 인용 검증: suite-determinism.js의 :29 DEFAULT_PATTERN · :72 diffRuns 순수층 · :125-151 runSuite의 ok/reason 계약 · :17-19 "고치지 않는다" 주석을 전부 열어 plan의 주장과 일치함을 확인(정확함). helpers.js:8-19가 실제로 git 프로세스 6개를 띄우는지 확인(정확함 — init·config×3·add·commit). axis-k-m2-cross-platform.yml을 열어 "pull_request와 workflow_dispatch를 둘 다 갖는다"는 주장과 if: always() artifact 패턴을 확인(정확함). .github/workflows/ 실측 2건으로 Task 0의 "base에는 2개" 주장 확인(정확함). "단일 writer" 주장(`--merge-into`만이 tracked 컨테이너를 쓴다)을 공격했으나 Task 3에 명시돼 반증 실패. 스위트 멤버십 정의 이중화(새 러너 vs DEFAULT_PATTERN)는 Risks:251이 이미 수치 인계까지 포함해 명시적으로 열어 둬 결함 아님. 배포 표면 미변경(UI6)과 marketplace source 경계도 반증 실패. 남은 것은 위 4건 — redaction 불변식의 이중 소유, .mjs/CJS 경계, partial 축의 acceptance 자기차단, artifact 이름 계약 불일치. |
| security | pass | 공격한 것: (1) tracked 산출물로의 경로 유출 — `data.file` 절대경로·`mkTmpRepo`(`plugins/mccp/scripts/receipt/tests/helpers.js:8-19`, 인용 정확) 기반 tmp 경로·Windows 8.3 단축형(`ADMINI~1`) 축을 각각 추적했고 plan이 :116에서 이미 접두 2후보 등록·대소문자 무시·불변식 fallback으로 닫아 둔 것을 확인 — 다만 그 불변식이 **머신 경계를 넘은 문자열**에는 적용될 수 없다는 축(finding 1)과 보조 grep의 Windows 패턴 결함(finding 2)이 남았다. (2) `pull_request` 트리거의 코드 실행 위험 — `pull_request`(not `_target`)라 fork PR에 secret·write 토큰이 가지 않으므로 표준 안전형, 미보고. (3) `--files-from`/`--exclude-from`의 경로 주입 — 운영자 자신이 유일 입력원이고 단일 신뢰 사용자 위협모델 밖이라 미보고. (4) `--merge-into`의 같은-label 교체가 정직한 측정을 덮는 escalation 경로 — 실제 소비처가 M1 문서뿐이고 `git_sha`·`ci_run_id` 결속이 붙어 있어 consequence까지 도달하지 못함, 미보고. (5) `ok`/`attribution` 축이 '실행 안 됐는데 통과'를 여는지 — :127-128이 `attribution:'partial'` → `ok:false`로 닫고 :129가 chunk fail-open을 명시 금지, 반증 실패. (6) receipt/hash 불변식(§3.12) 재개방 여부 — plan은 receipt 표면을 전혀 건드리지 않고 `suite-determinism.js` 미변경을 Validation(:229)이 공집합으로 강제, 반증 실패. |
| test | fail | plan과 PRD를 정독하고, 미러 인용 대상 `plugins/mccp/scripts/lib/suite-determinism.js`(:29 DEFAULT_PATTERN, :50 parseTap, :72 diffRuns, :125-153 runSuite)를 직접 읽어 'ok는 측정 성립이지 스위트 green이 아니다'·'incomplete-tap을 실패 0으로 읽지 않는다'는 인용이 실제 코드와 일치함을 확인했다(이 축은 반증 실패 — 인용 정확). 이어 (a) 각 Task의 Validate 명령이 그 Task가 바꾼 것을 실제로 돌리는지, (b) 플랜이 스스로 지목한 유일한 치명 방향(과다허용: 실행되지 않았는데 통과로 읽힘)의 negative 케이스가 Task 4 단언 집합에 존재하는지, (c) Acceptance와 Task Validate가 서로 모순되는지, (d) Validation 블록의 경로·artifact 이름이 계획이 만든 대상과 실재로 맞물리는지를 공격했다. (b)(a)(c)(d)에서 각각 결함을 찾았다. self-inclusion (8)·chunk 접기 (7)·redaction (4)(10)·spawn 인자 형태 (5)는 공격했으나 반증 실패 — 실제 producer spawn과 fail-open 회귀 가드가 명시돼 있다. |
| invariant | fail | Files to Change 9건의 게이트 성질을 훑고, 인용된 미러(suite-determinism.js:125-153, :29 DEFAULT_PATTERN)를 실제로 열어 `ok` 계약이 plan이 주장한 대로인지 대조했다(정확했고, 오히려 새 러너가 그 fail-closed를 뒤집는 분기를 갖는다는 근거가 됐다). 공격한 미지정 입력 경로: (a) data.file 전무 vs 부분 → attribution 판정 방향, (b) 다중 chunk에서 attribution 접기 미정의, (c) merge 중단·동시 writer, (d) 서로 다른 커밋의 두 run 병합, (e) continue-on-error + if:always()로 빈 artifact가 success가 되는 경로(plan이 :153에서 이미 흡수했고 M1이 강제 게이트가 아니라 유효한 방어로 판단), (f) Validation grep 극성, (g) exit_code 비영점 + ok:true 조합이 Acceptance를 통과하는지(설계 의도대로라 결함 아님), (h) `--exclude-from` 분모 축소(plan Risk 표가 이미 봉인 sha256로 대응). 배포 표면 미변경·UI6 준수·Task 0 삭제 검증은 실제로 fail-closed였다. |

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
  "wall_clock_ms": 647572,
  "halt_stage": null,
  "backlog_appended": 5,
  "backlog_skipped_nonblocking": 15,
  "granted": 4,
  "reviewed_plan_hash": "sha256:b86c102dbf319706087215734869b6ce41ee5bf2c7dfdf328646b0521c6c52e1",
  "plan_path": ".claude/plans/ci-full-suite-m1.plan.md",
  "recorded_at": "2026-09-01T07:15:30.757Z"
}
```
