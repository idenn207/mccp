# Plan Review Panel — ci-full-suite-m3q

**Plan**: `.claude/plans/ci-full-suite-m3q.plan.md` · **Plan version**: `sha256:a757f668d21349f9475a5efb550dd85ebc30bad433d2511c52b8f417a3e416d3`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 8 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 축 D 수용 증거의 CI producer가 다시 없다 — 판정 줄의 리터럴 pin이 `--json`도 `> gate.json`도 포함하지 않고, 오라클도 그것을 단언하지 않는다. 계획이 다섯 번 흡수했다고 적은 바로 그 실패 모드의 여섯 번째 재현이며, 같은 계획 안의 두 절이 서로 모순된다. | plan Task 2b L974: "판정 단계는 `--json`으로 이 출력을 `gate.json`에 쓰고 artifact로 올린다." 그러나 Task 5가 "마지막 판정은 **한 줄**이다"로 리터럴 고정한 블록(plan L1319-1324)에는 `--json`도 `gate.json` 리다이렉트도 없다: `node scripts/test-suite/gate.js --measurement measurement.json --exclude-from ... --floor-from ... --base-ref "origin/$BASE_REF"`. Task 7 단언 1(plan L1466-1469)이 요구하는 것은 `gate.js`+네 인자 값뿐이고, 단언 2b(plan L1535-1536)의 업로드 단언도 `actions/upload-artifact` 단계의 존재와 `if: always()`만 본다. 즉 구현자가 pin된 줄 그대로 쓰면 `gate.json`이 생성되지 않고 모든 단언이 green이며, Acceptance 3-A(`stage=1`)·3-B(`reasons`에 `deleted_without_allowance`)와 Acceptance 2(`gate --json`의 coverage 실값, plan L1055-1058이 그 producer라고 명시)의 증거가 CI에 존재하지 않는다. |
| architect | HIGH | DD9가 R17 흡수로 추가한 일곱째 fail-closed(`base_set_empty`)에 단언이 없다 — 소유 계약과 test 분기가 서로 다른 집합을 열거하고, 계획 자신의 수 세기도 어긋난다. | DD9 plan L737-738: "fail-closed에 **일곱째**를 더한다: `--base-ref`가 주어졌고 해소도 됐는데 `base_set`이 비면 `base_set_empty`로 차단한다." `reasons` 열거(plan L978-981)도 "fail-closed **일곱**의 입력 코드(`base_set_empty` 포함)"라 적는다. 그런데 같은 Task 2b의 계약 문단(plan L1003 "**fail-closed 여섯이 여기 걸린다**" … L1015 "여섯 다")과 그것을 재는 test 분기 (j)(plan L1044-1047)는 여섯만 열거하며 `base_set_empty`가 빠져 있고, (k)의 다섯 분기(plan L1059-1067)에도 없다. 즉 "이 축이 unknown 입력에서 관대해진다"를 닫으려고 도입한 조건이 어떤 test로도 반증되지 않아, 얕은 클론/트리 없는 ref에서 계획이 "실제 차단력 둘" 중 하나로 지목한 삭제 래칫이 조용히 꺼져도 붉어질 검사가 0건이다. |
| architect | LOW | `## Validation` 4b/7이 계획 자신이 load-bearing으로 실측한 규율(bash 전용 `/tmp` 절대경로 금지)을 어긴다 — 정본 로컬 환경이 Windows라고 계획이 선언한 상태에서 `node -e` 안의 `/tmp` 리터럴은 셸 경로 변환을 받지 않는다. | Task 6 편집 4(plan L1374-1375): "bash 전용 절대 경로를 걷는다 — `/tmp/enum.txt`(`:79-81`)를 `${{ runner.temp }}/enum.txt`로. `shell: bash`만으로는 Windows에 `/tmp`가 없다는 사실이 해결되지 않는다." 그런데 같은 계획의 Validation 4b(plan L1751)는 `fs.writeFileSync("/tmp/m3-del-in.json", …)`을, L1758은 `require("/tmp/m3-del.json")`을 `node -e` 문자열 **안**에 리터럴로 두고, 검사 7(plan L1774)도 `/tmp/m3-local.json`을 쓴다. 계획은 7b 주석(plan L1785-1788)과 Risks에서 로컬 정본 환경이 Windows임을 전제한다. |
| security | MEDIUM | 계획이 세운 셸 주입 규칙("`${{ }}`는 `run:` 텍스트에 직접 보간하지 않는다")은 두 지점(판정 줄의 BASE_REF · base fetch 단계)에만 기계 단언이 걸려 있고, 클래스 전체를 재는 오라클이 없다. 따라서 나중에 attacker-controlled 값(`github.head_ref` · `github.event.pull_request.title` 등)을 다른 step의 `run:`에 직접 보간하는 편집이 들어와도 Task 7의 모든 단언과 음성 fixture가 green이다. fork PR의 브랜치명·제목은 공격자가 통제하며 `$(...)`를 담을 수 있고, 이 workflow는 `paths` 필터 없이 전 PR에서 발화하므로 실행 경로가 실재한다. 같은 형태로 `secrets` 미주입 단언은 문자열 `secrets.` 스캔이라 동등 채널인 `${{ github.token }}`을 사거리 밖에 둔다(단 `permissions: contents: read`가 그 영향은 제한한다). 계획 자신의 기준("배선 부재를 보는 test가 없으면 완료가 아니다")에 미달하는 축이다. | plan L1327-1333 ("`${{ }}`는 `run:` 텍스트에 직접 보간하지 않고 **`env:` 간접**을 쓴다 … 인용은 방어가 아니다") 대 Task 7 단언·fixture 목록 L1466-1520·L1606-1619 — `${{ }}` 직접 보간을 재는 fixture는 "base fetch 단계가 `${{ }}`를 직접 보간하는 YAML"(L1610) 하나뿐이고, 일반 금지를 단언하는 항목은 0건. `secrets` 축은 L1515의 문자열 `secrets.` 스캔 단독. |
| test | HIGH | R17이 새로 더한 일곱째 fail-closed `base_set_empty`에 단언이 하나도 없다 — Action은 '일곱'이라 적고 Validate (j)는 '여섯'만 열거한다. 이 축은 계획 스스로 '실제 차단력 둘' 중 하나(삭제 래칫)가 얕은 클론·트리 없는 ref에서 조용히 꺼지는 경로를 막으려고 신설한 것인데, 그 가드가 빠진 구현이 전 검사를 green으로 통과한다(계획이 반복해서 CRITICAL로 닫았다고 적은 '기계는 만들어지고 부르는 한 줄이 빠진다'의 자기 재현). | plan L1003-1012 Action: "fail-closed 여섯이 여기 걸린다 … **`--base-ref`가 해소는 됐는데 `base_set`이 빈 집합**(`base_set_empty` …)" + L978-981 "fail-closed **일곱**의 입력 코드(`base_set_empty` 포함)" 대 Validate L1044-1047: "(j) **fail-closed 여섯** — git 호출 실패 · 빈 tracked 목록 · `--measurement` … · `--floor-from` … · `--exclude-from` … · `--base-ref` 해소 실패 각각에서 비영점" — `base_set_empty` 부재. |
| test | HIGH | `## Validation` 4b·2·7b가 선언된 로컬 플랫폼(Windows)에서 구성상 만족 불가다 — 셸 리다이렉션 `> /tmp/…`(Git Bash는 /tmp를 MSYS 마운트=%TEMP%로 해소)과 node에 넘기는 리터럴 `/tmp/…`(Windows node는 현재 드라이브 루트 `C:\\tmp\\…`로 해소)이 서로 다른 경로다. 계획은 같은 사실을 Task 6.4에서 스스로 인정하면서(`/tmp`는 Windows에 없다) 자기 Validation은 `/tmp`에 의존한다. 결과: 4b의 `require("/tmp/m3-del.json")`가 던지고 검사 2의 `--measurement /tmp/m3-local.json`이 fail-closed로 죽어, R15가 4b에 대해 세운 '어느 플랫폼에서도 만족 가능' 주장이 거짓이 된다 — 계획이 세 번 흡수했다고 적은 '만족 불가와 안 했다를 구분할 수 없다'의 재현. | plan L1741-1742 "그러면 이 검사는 어느 플랫폼에서도 만족 가능하고 재는 것이 정확히 래칫 하나다" 대 L1747-1758(`/tmp/m3-del-in.json`·`/tmp/m3-del.json`·`require("/tmp/m3-del.json")`) · L1704-1708·L1773-1793(`/tmp/m3-local.json`) · L1769 "Windows 로컬은 약 30분" · L1374-1375 Task 6.4 "`shell: bash`만으로는 Windows에 `/tmp`가 없다는 사실이 해결되지 않는다"(같은 근거로 `.github/workflows/test-suite-baseline.yml:79-82`의 `/tmp/enum.txt`를 `runner.temp`로 걷어낸다). |
| test | MEDIUM | `--floor-from`의 키 부재 fail-closed가 다섯 키를 열거하는데 Validate는 '키 부재' 한 덩어리로만 단언한다 — 다섯 중 넷만 검사하고 하나(예: `max_allowed_deletions`)에 `?? Infinity` 기본값을 남긴 구현이 통과한다. 계획이 그 기본값들을 명시적으로 위험으로 지목했음에도 키별 분기가 없다. | plan L1004-1008 "`tracked_basis`·`tracked`·`max_excluded_files`·`max_allowed_deletions`·`allow_deletions` 중 하나라도 없으면 차단 — 방어적 기본값 `?? 0`·`?? Infinity`… 를 쓰면 게이트 조건이 조용히 항상 참이 되고 그것을 붉게 만들 단언이 0건이었다" 대 L1044-1046 (j) "`--floor-from` 부재/판독 불가/키 부재" — 키별 분기 미명시. |
| invariant | HIGH | DD9의 `allow_deletions.path`가 '리터럴 정확 일치'라는 요구는 산문뿐이고 어떤 오라클도 그것을 반증하지 못한다 — 계획이 스스로 그 사실을 적어 놓고 test 분기를 더하지 않았다. glob으로 구현하면 `{path:"**/*.test.js", reason, ticket}` 단일 항목이 삭제 래칫(계획이 '실제 차단력 둘' 중 하나로 지목한 축)을 통째로 죽이는데 전 검사가 green이다. | plan `.claude/plans/ci-full-suite-m3q.plan.md:1118-1122` — "그때 `{path:\\"**/*.test.js\\", reason, ticket}` **단일 항목**이 모든 삭제를 면제해 DD9 래칫이 통째로 죽는다 — 그 상태에서도 이 계획의 단언은 전부 green이다(항목 수 등가 1==1 · ticket 만족 · (k)의 다섯 분기도 glob 의미론에서 그대로 성립)". Task 2b (k)의 다섯 분기(`:1059-1067`)와 Task 3 Validate(`:1134-1155`) 어디에도 glob 패턴이 면제로 인정되지 **않음**을 재는 분기가 없다. 대조: 격리 축의 동형 위험은 Task 2 분기 (4)(`:929-931`)로 음성 통제를 갖는다 — 같은 CRITICAL이 한쪽은 기계, 한쪽은 산문이다. |
| invariant | MEDIUM | `allow_deletions` 항목의 `ticket` 필수·객체 스키마에 런타임 소유자가 없다. `exclusions.js`는 격리 파일만 검증하고, floor 파일에 대한 게이트의 fail-closed는 **키 존재**뿐이라 `{path}`만 있는 항목도 삭제를 면제한다 — DD9가 주장한 '격리와 같은 통제'가 관례로만 존재한다. | plan `:1115-1116`("`{path, reason, ticket}` 객체이고 `ticket` 필수")에 검증 모듈이 지정되지 않음. gate fail-closed 열거 `:1003-1012`는 `--floor-from` "부재/판독 불가/키 부재"만 다루고 원소 shape를 다루지 않으며, Task 3 Validate의 `ticket` 부재 throw 단언(`:1134-1135`)은 `exclusions.js --check <exclusions.json>` 축이다. |
| invariant | MEDIUM | 판정자 자기 test 단계 — 계획이 '판정자 건강이 판정자 하류에 있지 않게' 만드는 유일한 장치 — 에 대해 R17이 판정 step에 대해 닫은 `if:` 무력화 축이 열려 있다. 그 step에 `if:` 한 줄이면 단계는 skip되고 오라클(존재 단언 2b)은 green이라, 통과 방향으로 고장 난 `gate.js`가 다시 자기 결함을 은폐한다. | plan `:1507-1512` — 단언 1d의 범위를 "대상은 판정 줄이 있는 step 하나다"로 명시. 자기 test 단계에 대한 단언은 `:1528-1533`의 **존재**(두 파일이 `node --test` 줄에 있음)뿐이고, `:1542-1543`은 "단계 **순서**는 단언하지 않는다"고 명시한다. 그 단계의 load-bearing 논증은 `:1224-1240`. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | DD2/DD3/DD9의 인용을 소스에서 전부 대조했다 — `run.js:10-12`·`:138-140`·`:179-183`·`:205`·`:213-214`·`:725`, `enumerate.js` L55-79·L111-132(included ∪ excluded = tracked 구성 보장), `baseline.yml`의 `:46`·`:79-81`·`:88`/`:107`·`:92-100`·`:35-38`·`:60-71`, 미러 원본 `version-declaration-gate.yml` L21-24·L59-60·L62-65 — 전부 계획이 주장하는 대로였다. 다음 축들을 깨보려 했으나 실패했다: (a) `--base-ref HEAD`로 도는 4b가 `git rm`(index)와 `ls-tree HEAD`(커밋)의 비대칭에 실제로 의존하는가 → 성립한다. (b) `tracked_basis` 재기준 규칙이 두 번째 삭제 사이클에서 다시 영구 red를 만드는가 → 산술로 따라가 보니 여백 1이 보존돼 성립하지 않는다. (c) `run.js` 재배선(`exclusions.js` 경유, ticket 필수)이 기존 test를 깨는가 → `scripts/tests/test-suite.test.js`의 exclusions 사용은 전부 순수층(`enumerateTests`) 직접 호출이라 CLI 재배선 사거리 밖이다. (d) `per_file[].file`이 절대경로라 버킷 계산이 무너지는가 → `reporter.mjs` L18-20이 repo-relative 변환을 이미 소유한다. (e) `exclusions_digest`가 `ticket` 추가로 producer/checker 간 갈리는가 → `normalizeExclusions`가 `{pattern, reason}`으로 정규화하므로 무해하다. 남은 셋이 위 findings다. |
| security | pass | 공격 시도: (1) fork PR이 임의 `*.test.js`를 러너에서 실행하는 신뢰 경계 — DD4의 `permissions: contents: read` · `persist-credentials: false` · `pull_request_target` 미사용 · SHA pin · secrets 미주입이 Task 7 단언 1b로 기계화돼 있어 실패. 기존 baseline의 credential 유출 서술(test-suite-baseline.yml:60-71)도 실제로 그 처방을 갖고 있음을 확인. (2) `--base-ref "origin/$BASE_REF"` 셸 주입 — 값이 `github.base_ref`라 base 저장소 소유자(=신뢰 주체)만 만들고, 인용 + env 간접이라 경로가 성립하지 않음. (3) 판정 입력 위조(`--measurement`를 커밋된 JSON으로 돌리기, `allow_deletions`를 glob으로 만들기, `max_excluded_files` 헤드룸, `base_set` 공집합, `--floor-from` 키 부재 기본값) — 전부 R9~R17에서 이미 흡수돼 리터럴 값 pin · 리터럴 경로 정확 일치 · 등가 단언 · fail-closed 일곱으로 닫혀 있음. (4) 게이트 위조(판정자 자신이 PR 트리 안) — DD4a가 닫지 않는다고 명시 기록하고 통제 지점이 branch protection 필수 리뷰어임을 적음(UI6 범위 밖). (5) 내구 산출물 유출(절대경로·머신명이 커밋 파일에 들어가는 저장소 선례) — floor/exclusions JSON은 개수와 repo-relative 경로뿐이고, artifact 유출 빈도 확대는 DD4가 정정해 명시 기록. (6) `redaction_ok` 차단이 발행을 막지 못한다는 축 — DD4a가 배선대로 정정하고 교환을 기록. 남은 것은 위 MEDIUM 하나이며 HIGH/CRITICAL 근거를 찾지 못했다. |
| test | fail | 17라운드 흡수 이력 전체와 DD2·DD3·DD7·DD9, Task 2/2b/3/4/5/7/9의 Validate 줄, `## Validation` 0~7b, Acceptance 라이브 완주 4항을 claims-vs-tests로 대조했다. 실제 소스 인용 3건을 검증했다 — `scripts/test-suite/run.js:214`(`per_file: ok ? perFile : null`) · `:725`(`return result.ok ? 0 : 1`) · `failing` 필드 실재(L171-215)는 계획 서술대로 참이었고 여기서는 결함을 못 찾았다. 절단 A/B의 순환성(심은 신호 vs 판정자), stage 대 reasons 판별자, `unexplained` 과대주장 철회, `continue-on-error`/`if:`/`branches`/`types` 과대허용 방향, `max_excluded_files`·`max_allowed_deletions` 등가 단언의 동어반복 여부, 4b의 `--base-ref HEAD`가 `git rm` 후 집합 차를 실제로 내는지, 전수 실행 줄·판정 줄 인자 값 pin과 `env: BASE_REF` 이중 단언, 자기 test 단계와 절단 B의 트리 판독 결합 — 이 축들은 공격했으나 전부 단언이 실재해 반증하지 못했다. 남은 셋은 위 findings다(일곱째 fail-closed 미단언 · Validate 경로 비현실성 · floor 키별 분기 부재). |
| invariant | fail | plan 전문(1972행)과 PRD를 읽고 다음을 공격했다: (1) DD3 0~3단계 판정 순서와 `foldChunks`의 `null→0` 접힘 — `run.js:179-183`·`:213-214` 인용이 사실이고 stage 0이 그것을 막는다(방어됨). (2) DD9 floor 산술 — `tracked = basis − (max_allowed_deletions+1)`을 정상 삭제 2사이클·재기준 규칙·절단 B 트리에 대해 손으로 돌려 봤고 영구 red 경로를 재현하지 못했다. (3) `base_set_empty`·merge-base 드리프트·rename 축 — fail-closed 일곱이 덮는다. (4) Task 4 가드 회귀 — `scripts/tests/test-suite.test.js:696-720`을 실제로 열어 `childEnv` 직접 호출뿐이고 CLI를 `--allow-codex`로 spawn하는 test가 0건임을 확인, 플래그 파싱 지점 이전이 안전함(방어됨). (5) Validation 4b의 `--base-ref HEAD` + 미커밋 `git rm` 조합 — base_set≠head_set이라 성립하고, 합성 measurement 쓰기가 실패해도 최종 `reasons` 단언이 오진을 잡는다(방어됨). (6) `continue-on-error`·`paths`/`branches`/`types`·`secrets`·SHA pin — 단언 1b·1c·3이 덮는다. 뚫린 곳은 셋: `allow_deletions`의 glob-대-리터럴 오라클 부재, 그 항목 shape의 런타임 소유자 부재, 자기 test 단계의 `if:` 무력화 축. |

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
  "wall_clock_ms": 305745,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:a757f668d21349f9475a5efb550dd85ebc30bad433d2511c52b8f417a3e416d3",
  "plan_path": ".claude/plans/ci-full-suite-m3q.plan.md",
  "recorded_at": "2026-09-04T04:31:02.073Z"
}
```
