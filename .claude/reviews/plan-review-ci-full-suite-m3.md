# Plan Review Panel — ci-full-suite-m3

**Plan**: `.claude/plans/ci-full-suite-m3.plan.md` · **Plan version**: `sha256:cfe2c7ffac72a046e06c494810e74931a4014d63acea8e48b652fc3822ed7530`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 10 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, security/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 강제 게이트가 `coverage.js --assert-full`을 부르는데, 같은 plan이 격리(quarantine)를 정상 경로로 허용하고 격리는 분자에서 빠진다. 즉 Task 1이 red 한 건이라도 격리하는 순간 전 PR 게이트가 영구 red가 되어 저장소 전체가 머지 불가가 된다. 이는 UI7(격리는 삭제가 아니다)·UI9(미충족은 기록한다)·Acceptance 2('100퍼센트든 아니든 산출된 숫자를 기록')와 정면 충돌하며, plan은 게이트가 그때 무엇을 하는지(임계·허용 목록·경고 강등) 어디에도 정하지 않는다. Risks 1행은 '하락이 보인다'로만 답하는데 그것은 판정이 아니라 관측이다. | plan L72-73 '격리(exclusions)는 분자에서 뺀다 … 격리는 커버리지를 떨어뜨리고' + L222 '`--assert-full`(100퍼센트 미만이면 비영점)' + L255 '커버리지 `--assert-full`'(강제 workflow 단계) + L207 '어느 쪽도 아니면 … 격리(UI7)' + L506-507 Acceptance 2 vs L487 Risks 1행 |
| architect | HIGH | DD7의 '기계적 상한 둘(항목 수 상한 + ticket 필수)'을 담는 `exclusions.js`는 실제 소비 경로에 놓이지 않아 우회 가능하다 — 스위트를 실제로 도는 `run.js --exclude-from`은 `readJsonFile` → `enumerate.normalizeExclusions`를 타며, 그 검증기는 `{pattern, reason}`만 보고 `ticket`도 항목 수 상한도 요구하지 않는다. `Files to Change`의 `run.js` UPDATE 사유는 `--allow-codex` 가드 하나뿐이라 재배선 계획이 없고, Task 5의 게이트 단계 열거(열거 sanity → 전수 실행 → 커버리지 → redaction)에도 exclusions 검증이 없다. 상한/티켓 불변식은 결국 Validation 검사 3(사람이 로컬에서 부르는 한 줄)에만 존재한다 — 우산 PRD가 지목한 '기계는 만들어지고 부르는 한 줄이 빠진다' 그 형태다. | scripts/test-suite/enumerate.js:55-79 (`normalizeExclusions`가 pattern·reason만 검증) · scripts/test-suite/run.js:666-668 (`flags['exclude-from'] ? readJsonFile(...)`) vs plan L142-146(DD7) · L167-170(Files to Change의 run.js 사유) · L255(게이트 단계 열거) · L335(Validation 검사 3) |
| architect | MEDIUM | Task 6이 baseline matrix에 `windows-latest`를 더하지만 그 workflow의 artifact 이름은 node 축만 담고 있어(`test-suite-baseline-node${{ matrix.node }}`) 두 OS × 같은 node가 같은 이름을 두 번 업로드한다. 그 이름은 workflow 자신이 '계약'이라 선언하고 Task 0/6의 Validate가 `--name test-suite-baseline-node20`으로 그것에 의존한다. 더해 Windows runner 기본 셸은 pwsh인데 enumerate/측정 단계가 `/tmp` 경로와 셸 확장 glob에 의존하며, PRD가 그 지점에서 `shell: bash`가 load-bearing이라고 실측으로 적어 두었는데 plan은 두 축 어느 것도 언급하지 않는다. | .github/workflows/test-suite-baseline.yml:91-100 ('artifact 이름은 계약이다' + `name: test-suite-baseline-node${{ matrix.node }}`), :46 `runs-on: ubuntu-latest`, :77-82 (`/tmp` + `git ls-files '*.test.js'` 셸 glob) · PRD L25 'Windows runner 기본 pwsh는 … `shell: bash`가 load-bearing이다' · plan L266, L270 |
| security | HIGH | 커버리지 오라클이 test 파일 '삭제'를 구조적으로 못 본다 — 분모와 분자가 함께 줄어 100%가 유지되므로, 배선을 끊는 커밋이 그 배선을 단언하는 test 파일을 같이 지우면 머지 차단 게이트가 green이다. 이것은 축 D(음성 통제)가 겨냥한 바로 그 실패 모드이며, plan은 더 약한 우회(격리 추가)에만 기계적 래칫(항목 수 상한 + ticket)을 걸고 더 싼 우회(삭제)에는 아무 기계도 두지 않는다. | plan L70-73 '분모 = `git ls-files '*.test.js'` 개수 / 분자 = 러너가 실행하고 귀속한 파일 수' — 삭제 시 양쪽이 동시에 감소. Task 2 Validate 분기 (5) 'tracked에 있는데 열거에 없는 파일이면 ok=false'(L228)는 열거 누락만 잡고 tracked 집합 자체의 축소는 잡지 못한다. 그럼에도 plan L279는 '절단하면 그 test가 red가 되고 전수 게이트가 막는다'고 무조건적으로 주장한다. DD7(L144-146)은 격리 축에는 상한 상수 래칫을 두면서 삭제 축에는 대응 기제가 없다(기준선 파일 수 floor·ratchet 부재). |
| security | MEDIUM | DD4의 '이 milestone이 잔여 유출 표면을 넓히지 않는다'는 거짓이다. 오늘 artifact 업로드는 `paths:` 필터(`scripts/**`, 자기 workflow)가 걸린 PR에서만 발화하는데, 신규 workflow는 paths 필터 없이 전 PR에서 `if: always()` artifact를 올린다. redact.js가 스스로 열거식·비전수(credential 클래스 커버리지 0)임을 선언한 상태에서 노출 빈도를 필터된 일부 PR → 전 PR로 확대하는 것은 표면 확대다. | plan L107-108 'artifact 업로드는 유지하되(`if: always()`) … 잔여 유출 축은 `scripts/test-suite/redact.js` 헤더가 열거하고 backlog가 소유한다 — 이 milestone이 넓히지 않는다' 대 plan L252 '`pull_request`에 **paths 필터 없음**'. 현행 필터: .github/workflows/test-suite-baseline.yml:35-38. 미커버 유출 축 열거: scripts/test-suite/redact.js:144-158 ('이 목록은 exhaustive하지 않다'), credential 커버리지 0건 근거: test-suite-baseline.yml:64-66. |
| security | LOW | 게이트 정의 자체가 PR이 수정 가능한 파일들(`test-suite.yml`의 `--assert-full` 호출 줄, `exclusions.js`의 상한 상수, `.github/test-suite-exclusions.json`)에 전부 들어 있는데, plan의 fork-PR 위협모델은 토큰/권한 축만 다루고 '게이트 정의 변조' 축을 기록하지 않는다. `pull_request` 이벤트는 PR 머지 ref의 workflow 파일로 실행되므로 required check를 만족시키는 가장 싼 경로가 게이트 문장 자체의 편집이다. | plan L489 Risks 행은 fork PR 완화를 '최소 권한 · SHA pin · persist-credentials:false · pull_request_target 미사용 · secrets 미주입'으로만 열거하고 게이트 정의의 가변성을 언급하지 않는다. DD7(L142-143)은 격리 목록에 대해서만 '리뷰 표면'을 통제로 선언하며, 같은 논리가 workflow/상한 상수에도 필요하다는 사실은 어디에도 적히지 않는다. |
| test | HIGH | 게이트의 핵심 주장(커버리지 --assert-full이 머지를 막는다)과 격리 경로(UI7)가 서로를 무효화하는데, 어느 Validate 줄도 그 조합을 검증하지 않는다. DD2는 '격리는 분자에서 빼므로 커버리지가 100% 미만이 되고 ok=false'라 못박고(plan L72-73, Task 2 분기 (2) '격리 1건이면 100퍼센트 미만이고 ok=false'), Task 5는 그 ok를 fail-closed 머지 차단 단계로 배선한다(L255 '커버리지 --assert-full'). Task 1은 원인 미규명 red를 격리하도록 지시한다(L207). 즉 격리가 1건이라도 생기면 강제 게이트는 구조적으로 영구 red이고, plan Risks L487은 '100퍼센트 미달인 채 강제로 간다'를 '높음'으로 인정하면서 그 상태에서 게이트가 어떻게 green이 되는지에 대한 test도 tolerance도 두지 않는다. Validation 검사 7(L352)은 같은 이유로 격리 존재 시 반드시 비영점이므로, plan의 Validation 블록 자체가 설계상 실패하도록 되어 있다. | plan L72-73 / L227 분기(2) / L255 / L352 / L487 (Risks) — '격리 1건이면 100퍼센트 미만이고 ok=false' vs 'node scripts/test-suite/coverage.js --measurement /tmp/m3-local.json --assert-full' |
| test | HIGH | 축 D(음성 통제)의 유일한 오라클이 workflow YAML의 문자열 존재 단언이라 주석 한 줄로 위양성(green)이 된다 — plan이 스스로 인용한 실패 선례와 동형이다. Task 7은 'wiring-cut.test.js가 workflow 파일에 그 호출이 존재함을 단언'한다고만 적고(L278-279), 같은 Task 5.3이 그 파일에 4단 헤더 주석을 요구하며 그 주석은 단계 순서(열거→전수→커버리지 --assert-full→redaction_ok)를 서술하게 되어 있다(L255, L258-259). 절단이 실행 줄만 지워도 주석에 남은 동일 문자열이 test를 green으로 유지하면 축 D의 실증은 거짓이 된다. CLAUDE.md §3.17이 기록한 impeccable-resolve.test.js 사고가 정확히 '배선이 아니라 산문을 검사하고 있었다'이며, plan은 그 교훈(짝 단언)을 Patterns로 인용만 하고 Task 7 Validate에는 짝 단언(실행 줄 부재 ↔ test red)을 명시하지 않는다. | plan L275-283 (Task 7 Action/Validate) + L258-259 (헤더 4단 주석 요구) + L45 Patterns 'impeccable-guard.test.js 짝 단언'; CLAUDE.md §3.17 'test는 commands/*.md 전문을 훑어 리터럴을 모으므로 … 산문 한 줄이 남아 green을 유지했을 것이다' |
| test | MEDIUM | Validation 검사 2는 분모 오라클을 검증하지 못한다(공허 통과). `node scripts/test-suite/run.js --list`는 `--exclude-from` 없이 호출되면 exclusions=[]이므로 출력이 정의상 tracked 집합과 동일하고, run.js:677이 출력하는 것은 `enumerated.included`(격리 적용 후)다. 즉 이 diff는 (a) 격리 파일을 넘기지 않으면 항상 통과하고 (b) 넘기면 항상 실패한다 — 어느 쪽도 DD2가 주장하는 '분모=tracked, 분자=included' 관계를 반증할 수 없다. 검사 이름('커버리지 분모가 tracked 집합과 바이트 일치')이 실제로 재는 것과 다르다. | plan L329-332 vs scripts/test-suite/run.js:666-678 (`flags['exclude-from'] ? readJsonFile : []`, `flags.list` → `enumerated.included`) |
| test | MEDIUM | Task 1의 Validate가 겨냥한 실패를 재현할 수 없는 플랫폼에서 돈다. 1b는 'Linux 전용 symlink red', 1c는 'node20 전용 red'로 명시되는데(L208-209), Validate는 `MCCP_CODEX_DISABLED=1 node --test <file>` 단독 실행이다(L214). 이 저장소의 개발 환경은 Windows/Node 24(PRD L25 '로컬 v24.19.0 · CI node 20')이므로 그 명령은 Linux 전용·node20 전용 red 어느 쪽도 재현하지 못하고, 수리가 맞는지 반증할 수 없다. plan은 '전체 판정은 Task 5 이후 CI가 낸다'로 미루지만, 그 CI 판정은 Task 5(강제 workflow 신설) 이후이므로 축 C 선행조건(PRD Risks '축 C 진입 전 flaky 0이 전제')의 확인이 그 선행조건을 소비하는 단계 뒤로 밀린다. | plan L208-215 (Task 1 Action/Validate) + PRD L103 Risks 1행 + PRD L25 (로컬 Node 24 / CI Node 20) |
| test | MEDIUM | Validation 검사 6이 호출하는 `scripts/test-suite/container-check.js`가 Files to Change 표에 없고 그것을 검증하는 test도 없다. 각주(L355)는 'Task 9가 함께 만드는 얇은 확인 스크립트'라 적지만 Task 9의 Action/Validate(L298-305)에는 그 파일 생성이 없고, 이 milestone이 만드는 다른 4개 스크립트가 전부 짝 test를 갖는 것과 달리 이 스크립트만 무-test 신규 코드다. 컨테이너 수용 판정(Acceptance 산출물 1번의 충족/미충족 전환)이 이 검증되지 않은 스크립트의 출력에 걸린다. | plan L347-348 (검사 6) · L355-357 (각주) vs Files to Change L163-186 (container-check.js 부재) · Task 9 L296-305 |
| invariant | HIGH | 커버리지 게이트의 두 요구가 서로 모순이라 판정이 정의되지 않는다 — 격리가 1건이라도 생기면 `--assert-full`이 매 PR을 영구히 red로 만들고, Acceptance 1번(green)은 달성 불가가 된다. 그 상태의 유일한 실행 가능한 해소는 게이트 완화(임계 도입/`--assert-full` 제거)이며, 계획은 어느 방향으로 접힐지 못박지 않았다. | plan L72-73 '격리(exclusions)는 분자에서 뺀다 … 격리는 커버리지를 떨어뜨리고' + Task 2 Validate 분기 (2) '격리 1건이면 100퍼센트 미만이고 `ok=false`' + Task 5 '단계 순서는 … 커버리지 `--assert-full`' + Acceptance L504-505 'PR에서 `test-suite` 체크가 실제로 발화하고 green이다'. 동시에 Task 1은 '원인 미규명이면 … 격리(UI7)'를 기본 경로로 지시(plan L206-207)하고 Risks L487은 '격리가 늘고 100퍼센트에 못 미친 채 강제로 간다'를 '높음'으로 인정하면서도 그때 게이트가 무엇을 하는지 적지 않는다. |
| invariant | MEDIUM | 축 D 왕복의 rollback이 실패 경로에서 성립하지 않는다 — `--apply` 뒤 test가 기대대로 red가 아닐 때 Validation이 `--revert` 이전에 `exit 1`로 종료해 절단된 workflow 파일이 작업 트리에 남는다. DD5가 주장한 '실증이 영구 파손으로 남지 않게 하는 것이 그 검사다'는 성공 경로에서만 참이다. | plan L338-342: `node scripts/test-suite/wiring-cut.js --apply` / `node --test scripts/tests/wiring-cut.test.js; test $? -ne 0 \|\| exit 1` / `node scripts/test-suite/wiring-cut.js --revert` — `exit 1`이 `--revert` 앞에 있다. DD5 L119: '실증이 영구 파손으로 남지 않게 하는 것이 그 검사다'. |
| invariant | MEDIUM | DD6가 닫겠다고 선언한 '이름을 바꾸면 보호가 조용히 풀린다'는 실패 모드는 실제로 닫히지 않는다. drift 진단은 운영자 수동 실행 전용이고(UI5로 CI 실행 금지), Task 8의 test는 순수 판정층을 합성 입력으로만 단언하므로 실제 workflow의 job 이름과 required check 문자열의 결속을 잡는 기계가 0개다. 계획 자신이 'Patterns to Mirror'에 올린 짝 단언(impeccable-guard) 패턴이 정작 이 축에는 적용되지 않았다. | plan L128-129 'CI가 아니라 운영자가 돌리는 진단이다 … 런북에 등재한다'; Task 8 Validate L293-294 '일치·불일치·필수 체크 부재 3분기' + '운영자 수동 설정 후 … exit 0'(1회); Patterns to Mirror L45 '배선 존재의 짝 단언 … 배선을 걷어내면 test가 red'. |
| invariant | MEDIUM | DD4가 fork PR 위협모델을 '명시한다'고 선언하면서 자신이 지목한 동기(CI 상태 조작)의 축은 방어하지 않는다 — 토큰/권한만 다루고, PR이 통제하는 트리 안의 게이트 정의(`coverage.js`·`exclusions.js`·상한 상수·workflow 자체)를 위조해 green을 보고하는 경로에 대해서는 통제가 '코드 리뷰'뿐이며 그 사실이 DD4에 기록되지 않는다. fan-out이 같은 공백을 meta-gap으로 지적했으나 계획은 응답하지 않았다. | plan L101-104 '머지 차단으로 승격하면 CI 상태를 조작할 유인이 생기므로 위협모델을 … workflow 파일이 들고 있어야 한다' 뒤 조치는 `permissions` · `persist-credentials` · SHA pin · `pull_request_target` 미사용뿐; DD7 L137-140 '런타임으로 이것을 막을 방법은 없다'는 격리 목록에만 한정; fan-out meta-gap L402 'no negative control for gate-forgery is specified' — Design Decisions 어디에도 응답 없음. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | DD2의 분모/분자 정의를 run.js 실제 산출과 대조(listTrackedFiles → enumerateTests → files_total/per_file, validateElement의 per_file.length===files_total)해 Validation 검사 2의 diff 등식이 성립하는지 확인 — 성립하므로 finding 아님. DD3의 판정 순서 논증(green이면 실패 텍스트가 없다)도 redact/merge 경로와 모순 없음을 확인. DD1의 baseline pull_request 트리거 제거 사유를 workflow 헤더 주석(:11-17)과 대조 — 주석이 든 사유가 실제로 소멸했는지는 main 트리 확인이 필요해 반증 실패(부정 근거 없음). DD5 wiring-cut의 순환성(자기 배선을 자기 test가 단언)과 impeccable-guard 짝 단언 미러의 유비도 공격했으나 PRD 축 D의 명제와 어긋나지 않아 finding으로 올리지 않음. 실제로 부러진 셋은 위에 적었다 — `--assert-full`과 격리의 충돌, `exclusions.js` 단일 정본 주장의 우회 가능성, Windows matrix가 깨는 artifact 이름 계약. |
| security | fail | 공격한 축: (1) DD3의 'green이면 스캔할 실패 텍스트가 없다' — run.js foldChunks(:171,190,215)를 읽어 `failing`/`reason`이 green에서 실제로 비는지 확인했고 주장은 성립해 finding으로 올리지 않았다. (2) Task 4의 `GITHUB_ACTIONS` 가드 우회 — GITHUB_* 는 workflow env로 재정의할 수 없고 childEnv(:454-468)의 FORCED_POLICY_ENV가 기본 fail-closed라 실효 경로를 못 만들었다. (3) `--merge-into` 신뢰경계 — assertNoPollution/sanitize/validateElement(:227-330)가 prototype pollution·redaction_ok!==true를 이미 fail-closed로 막아 Task 9 경로에서 새 구멍을 못 찾았다. (4) 격리 목록의 glob 남용(`**` 1건으로 전 파일 제외) — 커버리지가 0으로 떨어져 `--assert-full`이 잡으므로 실패했다. (5) 공격자 제어 파일명으로 win-drive-abs를 유발해 redaction_ok를 뒤집는 시나리오 — 자기 PR만 붉어지는 self-DoS라 결과에 도달하지 못했다. 실제로 착지한 것은 커버리지 분모의 삭제 미탐지(HIGH), DD4의 '넓히지 않는다' 주장 반증(MEDIUM), 게이트 정의 가변성 미기록(LOW) 셋이다. |
| test | fail | plan의 두 load-bearing 주장을 공격했다: (1) '커버리지 100%가 자동 산출되고 그것이 머지를 막는다' — DD2의 격리 감산 규칙과 Task 5의 --assert-full 배선, Validation 검사 7을 대조해 격리 존재 시 게이트/Validation이 구조적으로 red가 되는 모순을 확인. (2) '축 D 절단이 red를 만든다' — Task 7의 오라클이 workflow YAML 문자열 존재 단언뿐이고 Task 5.3이 같은 파일에 단계 서술 주석을 요구한다는 점, 그리고 CLAUDE.md §3.17이 기록한 동형 위양성 선례를 대조. 추가로 run.js:666-678을 직접 읽어 --list의 격리-후 의미를 확인해 Validation 검사 2가 공허함을 입증했고, Task 1의 Linux/node20 전용 red를 Windows/Node24 단독 실행으로 검증하는 갭, container-check.js의 Files-to-Change 부재를 확인했다. 반증에 실패한 축: Task 4(GITHUB_ACTIONS × allowCodex throw)는 양방향 분기를 명시해 test가 실제로 그것을 잡는다고 판단했고, baseline workflow의 pull_request 트리거 제거가 기존 test를 깨뜨리는지 scripts/tests를 grep했으나 그 트리거를 pin하는 test는 없었다(회귀 없음). |
| invariant | fail | DD1~DD8과 Task 0~10, Validation 블록을 게이트 개폐 방향으로 훑었다. 공격한 지점: (1) `--assert-full`이 격리·`fully_skipped`·미규명 red와 만나는 unknown 입력 — 여기서 판정 미정의와 완화 압력을 확인. (2) `run.js`의 `validateElement`(:263-339)와 `enumerate.js#normalizeExclusions`(:55-79)를 직접 읽어 계획의 인용(fail-closed 원소 검증·사유 필수 throw·`redaction_ok !== true` 거부)이 실제로 그 내용인지 대조 — 인용은 정확했고 DD3의 '순서로 닫는다' 논증도 `--merge-into`가 red 원소를 거부한다는 실제 동작과 정합. (3) Task 9 병합의 anchoring — `git_sha`가 필수 필드로 봉인되므로 커밋 미결속 주장은 반증됨. (4) Task 4의 `GITHUB_ACTIONS` 가드 우회 — 부모 프로세스 측이라 test 코드로는 못 뒤집음, 무결함. (5) wiring-cut 왕복의 중단 경로에서 rollback 미실행 확인. (6) DD6 진단의 skip predicate — 1회 exit 0 이후 재확인 기계 부재 확인. (7) DD2의 `fully_skipped` 비차단 결정은 UI1과의 충돌을 명시적으로 논증하고 별도 보고하므로 은폐가 아님 — 결함으로 보지 않음. |

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
  "wall_clock_ms": 467684,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:cfe2c7ffac72a046e06c494810e74931a4014d63acea8e48b652fc3822ed7530",
  "plan_path": ".claude/plans/ci-full-suite-m3.plan.md",
  "recorded_at": "2026-09-04T01:11:39.702Z"
}
```
