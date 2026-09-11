# ci-full-suite — 아무도 돌리지 않는 test를 CI가 돌리게 한다

> 우산 PRD [harness-wiring-integrity](harness-wiring-integrity.prd.md)의 **자식 C3**.
> 그룹 1 · 선행조건 없음 · **미배포**(`.github/`는 배포 표면 밖) · 사용자 체감 0 · dark ship 해당 없음.
>
> 근거 조사: [2026-08-31-final-harness-assessment-and-umbrella-prd.md](../_meta/2026-08-31-final-harness-assessment-and-umbrella-prd.md)
> 기준선 원자료: [test-suite-run.txt](../_meta/data/test-suite-run.txt) (353행 파일별 실측)

## Problem

test 368개가 있고 사실상 green인데 **아무도 전수로 돌리지 않는다.** 전수 실행의 정본 진입점이 저장소에 없고(`package.json` · npm script · `node_modules` 전부 부재), CI 세 workflow는 합쳐 10개(2.7%)만 실행하며 그나마 `paths:` 필터 때문에 해당 경로가 안 바뀌면 아예 돌지 않는다.

대가는 우산 PRD의 서명 실패 모드를 **볼 눈이 없다**는 것이다. "기계는 만들어지고 그것을 부르는 한 줄이 빠진다"가 이 저장소의 반복 실패인데, 그 부재를 잡을 유일한 기계가 97.3% 꺼져 있다. C1·C2·C4가 각자 새 배선을 넣는 동안 그 배선이 서로를 끊어도 머지 전에 알 방법이 없다.

그리고 전수 실행은 **오늘 실현 불가에 가깝다** — 353파일 순차 합계가 174분이고, 그중 63%가 상위 15개 파일(4.2%)에서 나온다.

> **상태(2026-09-08).** 위 세 문단은 **문제 제기 시점(2026-09-01)의 기록**이며 지우지 않는다.
> M1~M3이 그중 둘을 닫았다 — 정본 진입점이 생겼고(`scripts/test-suite/run.js`), 전수 벽시계는
> Linux CI에서 **126초**다(174분이 아니다). 남은 하나는 아직 참이다: **CI는 돌지만 막지
> 않는다.** `main`은 `protected:false`이고, 그래서 이 PRD의 게이트를 실은 PR #185 자신이
> green 체크를 지나 머지됐다. 그 잔여를 M4가 소유한다.

## Evidence

전부 2026-09-01 실측이며 대상은 이 worktree(base `bacd96a`)와 `origin/main`(`647dfec`)이다. 우산 PRD의 서술 3건을 정정한다.

- **CI 강제 커버리지는 0.87%가 아니라 2.7%다** (10 / 368). 우산 PRD의 `3/346`은 세 번째 workflow `env-contract-drift.yml`을 세지 않았다 — 그것은 `node --test .../env-contract/tests/*.test.js`로 7개를 glob 실행한다. 분모도 `origin/main` 기준 368이다(로컬 base는 346). **방향은 불변이다** — 2.7%도 극히 낮다.
- **"CI 세 workflow"는 `origin/main` 기준이다.** 이 자식의 branch base(`bacd96a`)에는 **2개뿐이었다** — `env-contract-drift.yml`이 base 이후에 main에 들어왔다. M1 Task 0의 base 머지가 이것을 해소했고, M1이 `test-suite-baseline.yml`을 추가해 현재 이 branch는 **4개**다.
- **2.7%는 상한이지 실효 실행률이 아니다.** 세 workflow 모두 `pull_request.paths:` 필터를 갖고, GitHub은 매치가 없으면 workflow를 통째로 건너뛴다. 최근 실행 15건(`gh run list`)에서 PR 하나당 실행된 workflow는 1~2개다.
- **전수 실행의 정본 진입점이 없다.** ~~`package.json` 부재~~ → **정정(M1 실측)**: 루트에는 없지만 저장소에 **2개 존재한다** — `plugins/mccp/scripts/receipt/package.json`과 `.claude/scripts/receipt/package.json`이고 둘 다 `"test": "node --test tests/"`를 선언한다(그 형태는 디렉토리 인자라 Node 24에서 죽는다). npm script로 전수를 도는 경로는 여전히 없고 `node_modules`도 없다. 368개를 한 번에 도는 명령이 저장소 어디에도 선언돼 있지 않다는 결론은 **불변**이다. CI가 10개만 도는 이유의 일부는 정책이 아니라 **수단 부재**다. **M1이 그 수단을 만들었다** — `scripts/test-suite/run.js`(§Delivery Milestones 1행 참조).
- **로컬과 CI의 Node가 다르고, 그 차이가 진입점 설계에 직접 걸린다.** 로컬 `v24.19.0` · CI `node-version: '20'`. `env-contract-drift.yml` 주석이 세 형태를 실측으로 기록한다 — 디렉토리 인자는 Node 24가 모듈 경로로 해석해 죽고, 인용 glob은 node 자체 glob이 22.6.0 도입이라 Node 20에서 죽으며, **셸이 펼치는 glob만 양쪽에서 산다**. Windows runner 기본 pwsh는 네이티브 명령 인자에 glob을 펼치지 않으므로 `shell: bash`가 load-bearing이다.
- **전수 순차 실행 = 174분** → **정정(M1 실측): 고유 파일 기준 169.6분이다.** `test-suite-run.txt`의 353행 합계는 10,434,124ms(173.9분)가 맞지만, 그중 **7개 파일이 resume 때문에 두 번 실행됐다**. 고유 346개 기준 합계는 10,176,088ms = **169.6분**이다. 우산 PRD가 인용한 "약 69분 외삽"과 근거 조사가 적은 "105/346에서 중단"은 둘 다 이 로그와 어긋난다 — 로그는 352 PASS + 1 FAIL로 **353개 결과를 담고 있다**(중단이 아니라 resume 후 완주).
- **재실행된 7건이 경합 오염의 직접 증거다.** 같은 커밋·같은 파일인데 실행 간 편차가 최대 **25.6%**였다(`pr-codex-skip-env` 104.2초 대 82.9초 · `preflight` 132.4초 대 113.7초). 지표 2의 "경합 오염 의심"은 의심이 아니라 관측이다.
- **이 로그의 적용 범위는 `plugins/mccp/` 하위뿐이다.** 고유 346개가 전부 그 접두이며 `.claude/scripts/receipt/tests/` 10개는 **한 번도 실행되지 않았다**. 즉 346은 이 로그의 *적용 범위*이지 스위트 크기가 아니다 — 현재 tracked `*.test.js`는 실측 **368**(`plugins/mccp/scripts/` 358 + `.claude/scripts/` 10)이고 위 21행의 368이 정본이다. **346을 스위트 크기로 옮겨 적지 말 것.**
- **분포가 극단적으로 skewed하다.** p50 = 0.85초 · p90 = 60.6초 · p99 = 468.7초 · **max = 1399초(23.3분)**. 상위 15개 파일(4.2%)이 총 시간의 **63%**를 차지하고, 중앙값 대비 최댓값은 약 1600배다.
- **그 격차는 "미설명"이 아니다.** 가장 느린 `receipt/tests/intent-gate-fields.test.js`는 `child_process`를 import하지 않아 순수 in-process로 보이지만, 그 파일이 52회 호출하는 `withRepo`가 helper `mkTmpRepo()`를 부르고 그 helper는 repo 1개당 **git 프로세스 6개**(`init` · `config`×3 · `add` · `commit`)를 spawn한다. 52 × 6 = **312개 프로세스**, 1399초 / 312 ≈ **4.5초/repo**. 같은 helper를 쓰는 test 파일이 **48개**다.
- **우산 PRD가 red라 지목한 `derive/tests/mccp-fixture.test.js`가 이 worktree에서 green이다** — 2/2 pass, 6.7초. 그 test 본문에 시간 의존 코드는 없고, 출력에 renderer의 `cache_stale: previous render was 153 seconds old`가 섞여 있다. **red 수리가 아니라 flaky 규명이 축이다.**
- **선례가 있다.** `env-contract-drift.yml`은 *"`lint.js`에 caller가 0이었다 — 러너 없이 검사를 추가하면 아무것도 바뀌지 않는다"* 를 주석에 명시하고 CI로 그것을 닫았다. C3은 새 패턴이 아니라 **그 패턴을 test 전체로 확장**하는 것이다.
- **CI red를 머지 차단으로 만드는 것은 저장소 설정이지 파일이 아니다.** 기존 workflow 2건이 각각 주석으로 그 한계를 적었다 — branch protection / ruleset은 repo 파일로 표현 불가하다.

### 2026-09-08 추가 실측 — 게이트는 돌고, 막지 않는다

위 목록은 **2026-09-01 기록이며 그대로 둔다.** 아래는 M3이 머지된 뒤 처음으로 라이브
관측이 가능해져 나온 값이다. 각 행은 재현 명령을 갖는다.

- **게이트가 라이브에서 3회 발화했다.** `34174703512` **차단**(`stage 1` · `suite_red`) →
  `34176593137` green → `34176861426` green (`gh run list --workflow=test-suite.yml`).
- **첫 발화가 이 PRD의 명제를 스스로 실증했다.** 그 차단이 잡은 red는 이 브랜치가 아니라
  **main**의 것이었고(`command-body-lint.test.js`), 전수 스위트가 머지 차단이 아니었기 때문에
  **나흘간 main에 살아 있었다.** 상세는 [m3-enforcement.md](../../docs/ci-full-suite/m3-enforcement.md) §7a.
- **커버리지 실값이 CI에서 나왔다.** run `34176861426`의 `gate.json`:
  `blocked:false` · `coverage_pct` 98.46547314578005 · `numerator` 385 / `denominator` 391 ·
  `unexplained` [] · `missing` []. 같은 run의 `measurement.json`: `ok:true` ·
  `attribution:"complete"` · `redaction_ok:true` · `failing` [] · `wall_clock_ms` 126350
  (`gh run download 34176861426 -n test-suite-gate`).
- **그럼에도 `main`은 보호되지 않는다.** `protected:false` · `protection.enabled:false` ·
  `required_status_checks.enforcement_level:"off"` · `contexts:[]`
  (`gh api repos/idenn207/mccp/branches/main`). rulesets도 `[]`.
- **그래서 PR #185 자신이 green 게이트를 지나 머지됐다.** 축 C의 절반(파일)은 있고 절반
  (저장소 설정)은 없다는 것이 이보다 선명할 수 없다.
- **부재 증명의 채널이 중요하다.** admin 전용 엔드포인트
  (`/branches/main/protection`)는 non-admin에게 보호 유무와 무관하게 404를 돌려주므로
  **부재 증명이 아니다.** 위 값은 world-readable `/branches/main`에서 나온 것이고, 그것이
  정본 채널이다. ~~`scripts/ci-required-checks.js`는 오늘 전자를 읽는다.~~ **정정(2026-09-08 · M4 Task 2 착지)**: 이제 후자(world-readable `/branches/{b}`)를 읽고 `{protected, contexts}`를 돌려준다. 판독 실패(`protection_unreadable`)와 보호 부재(`protection_absent`)를 **다른 사유 코드**로 가르므로, 보호가 켜진 뒤 이 계정이 `contexts`를 못 보더라도 그 사실이 조용히 "보호 없음"으로 접히지 않는다.
- **설정 권한이 없다.** 인증 계정 `madsci207`은 `idenn207/mccp`에 `permissions.admin:false`
  (push=true). branch protection PUT은 admin **역할**을 요구하며 토큰 scope로 대체되지 않는다
  (`gh api repos/idenn207/mccp --jq .permissions`). 축 C는 **권한에 걸려 있다.**
- **OQ3의 측정 수단은 이미 존재하고 한 번도 쓰이지 않았다.** `test-suite-baseline.yml`이
  main에 있고 `active`이며 `workflow_dispatch` 단독 · matrix `[ubuntu,windows] × [20,24]`인데
  ~~**dispatch 이력 0건**이다(최근 run은 전부 `event: pull_request`로 M3 이전 shape).~~ **정정(2026-09-08 · M4 Task 4)**: 눌렀다 — run [`34195014409`](https://github.com/idenn207/mccp/actions/runs/34195014409) · `workflow_dispatch` · ref `main` · 4 leg 전부 `success`. 축약 증거는 [`docs/ci-full-suite/baseline-34195014409-summary.json`](../../docs/ci-full-suite/baseline-34195014409-summary.json).
- **그 baseline이 곧 Task 0의 producer다.** 측정 줄에 `--exclude-from`이 **없어**
  (`.github/workflows/test-suite-baseline.yml` L103) 격리 6건을 포함한 tracked 전량을 돈다 —
  강제 workflow가 격리를 넘겨 6건을 건너뛰는 것과 정확히 반대다.
- **축 D의 버리는 PR은 미생성이다.** `chore/axis-d-negative-control` 부재.
- **workflow는 이제 6개다**(위 2026-09-01 기록의 "4개"에서 이동) — `test-suite` ·
  `test-suite-baseline` · `env-contract-drift` · `gitignore-drift` · `version-declaration-gate` ·
  `axis-k-m2-cross-platform`.

## Users

- **Primary**: **운영자 본인 — PR을 여는 순간의 자신.** 트리거는 "지금 무엇이 깨졌는지 머지 전에 알 방법이 없다"이다. 전수를 돌리려면 명령을 매번 손으로 조립해야 하고, 조립해도 174분이라 실질적으로 아무도 돌리지 않는다.
- **Secondary**: **C1·C2·C4를 병렬로 여는 자신.** 자식 넷이 동시에 배선을 넣는데, 그 배선이 서로를 끊어도 오늘은 머지 후에만 발견된다.
- **Not for**: mccp 실사용자. `.github/`는 marketplace `source`(`./plugins/mccp`) 밖이라 이 자식은 사용자에게 **아무것도 전달하지 않는다**. 사용자 체감 0이 C3을 그룹 1에서 가장 안전한 축으로 만든다.

## Hypothesis

We believe **전수 실행을 단일 명령으로 재현 가능하게 만들고, 그 벽시계를 감당 가능한 크기로 줄이고, CI가 그것을 강제하는 것**이 **"기계는 만들어지고 그것을 부르는 한 줄이 빠지며 아무 test도 그 부재를 보지 못한다"** 를 **운영자 본인(그리고 그가 병렬로 여는 자식들)** 에게 해소할 것이다.

We'll know we're right when **CI 강제 커버리지가 100%가 되고, 전수 실행이 PR 피드백으로 쓸 수 있는 벽시계 안에 들어오며, 배선을 끊는 변경이 머지 전에 red로 잡히는 것이 한 번 실증될 때**.

> **종결 조건 셋의 상태(2026-09-08).** 벽시계는 **충족**(126초). 커버리지는 판정 기준
> (`unexplained === 0`)으로 **충족**이나 그 판정이 **머지를 막지는 않는다** — `main`이
> 보호되지 않아 체크가 red여도 머지가 성립한다. 절단 실증은 **미충족**. 즉 가설의 세
> 조건 중 하나만 남았고, 그 하나가 나머지 둘의 값을 무의미하게 만드는 자리에 있다.

### 판정 순서 — A를 못 넘으면 B·C는 논할 수 없다

| 축 | 기준 | 왜 이 순서인가 |
|---|---|---|
| **A. 측정 가능 (MVP)** | 단일 명령 진입점이 존재하고, 조용한 머신 전수 완주 벽시계가 기록된다 | 축 B의 목표치도 shard 수도 전부 A가 내놓는 숫자에서 파생된다 |
| **B. 감당 가능** | 벽시계가 PR 피드백 임계 안. **임계값은 A 이후 확정** | 오늘 값 174분은 순차 실행 합계이고 경합 오염 자체 판정을 받았다. 지금 목표를 정하면 근거 없는 숫자다 |
| **C. 강제** | 커버리지 100% + branch protection 1회 설정 | 파일로 표현 가능한 부분과 저장소 설정이 나뉘므로 완료 조건에 수동 1회가 들어간다 |
| **D. 실증 (음성 통제)** | 배선을 끊는 변경이 실제로 red를 만드는 것을 1회 확인 | 커버리지 100%는 "test가 실행됐다"만 말하고 "그것이 결함을 잡는다"를 말하지 않는다. 우산 PRD가 모든 자식에게 요구한 *"producer가 아니라 산출된 실값"* 규율의 C3판이다 |

## Success Metrics

| # | 지표 | 오늘 | 축 A | 축 B/C | 어떻게 측정 | 읽는 주체 → 바꾸는 행동 |
|---|---|---|---|---|---|---|
| 1 | CI 강제 커버리지 | ~~**2.7%** (10/368)~~ → ~~**98.45%** (382/388, M3 로컬 실측 2026-09-04)~~ → **98.4655%** (385/391) — **CI 실값**(run `34176861426`의 `gate.json` artifact, 2026-09-08). 분모 이동(388→391)은 회귀가 아니라 main 병합이 test 3개를 들여온 결과이고, 판정 조건은 백분율이 아니라 `unexplained === 0`이라 **게이트 판정은 움직이지 않았다** | 산출이 자동화된다 | **100%** — 분모는 OQ5가 확정: tracked `*.test.js` **파일 수** | `coverage.js`가 `git ls-files -z '*.test.js'`(gate 소유)를 분모로, 러너가 귀속한 파일을 분자로 산출 | PR 체크 → **미달이 아니라 `unexplained>0`이 머지 차단**. 격리 6건은 사유·티켓·상한 래칫을 대가로 차단하지 않는다 |
| 2 | 전수 실행 벽시계 | **174분** (순차 · 경합 오염 의심) | 조용한 머신 실측 1회 → **충족(M1)** | **충족(Linux) — 75.5초, shard 1**. 두 번째 궤적점(2026-09-08 CI): 측정 **126.35초** · job 전체 2m23s. 분모가 346→391로 커지는 동안 벽시계는 같은 자릿수에 머문다 | 진입점 1회 실행 | 운영자 → 임계 초과 시 shard 수 재조정 |
| 3 | 상시 red / flaky | ~~**1건**~~ → **16파일**(M1 전수 실측 — 이전 수치는 전수를 돌려보기 전의 추정이었다) | 원인이 규명된다 → **M2가 6갈래로 분해**(H harness · P 플랫폼 · C CI 설정 · D drift · F flaky · R 자원) | **0** — M3 기준 **격리 6건**(수리 0건). 여섯 전부 Windows 로컬에서 green이라 재현 불가이며, 각각 사유·티켓을 달아 `.github/test-suite-exclusions.json`에 등재했다. **재현 불가는 원인 규명이 아니다** — Task 0의 Linux 재측정이 도착하면 전건 재평가 대상이다. **상태(2026-09-08): 그 측정의 producer는 이미 존재하고 아무도 누르지 않았다** — `test-suite-baseline.yml`이 main에 있고 `active`이며 `workflow_dispatch`로 matrix 4원소를 돌리는데 dispatch 이력이 **0건**이고, 그 측정 줄에는 `--exclude-from`이 없어 격리 6건을 포함한 tracked 전량을 돈다. M4가 그것을 누른다. **결과(2026-09-08 · run `34195014409`)**: 격리 6건이 **전건 잔존**이다 — `Q\L`(green 복귀) **0** · `Q∩L`(잔존) **6** · `L\Q`(신규 red) **0**. 즉 "Windows 로컬에서 green이라 재현 불가"라는 기존 사유는 **소멸했고**(Linux 러너가 직접 재현했다) 여섯 항목의 `reason`을 그 run 근거로 갈아썼다. 해제가 0건이므로 `max_excluded_files`·`MAX_EXCLUSION_ENTRIES`는 6 그대로다. **수리는 하지 않았다** — 6 파일 중 `scripts/test-suite/` 소유가 0건이고 재현이 성립한 수리는 소유 축의 별도 PR이다 | 동일 커밋 3회 반복 실행 (프로토콜: `--merge-into <container> --label <axis>-r{1,2,3}`) | CI → flaky는 삭제가 아니라 명시 격리 + 티켓 |
| 4 | 배선 절단 탐지 (음성 통제) | ~~**미측정**~~ → **로컬 3종 왕복 통과 · CI 미실증**(2026-09-08 현재도 그대로 — `chore/axis-d-negative-control` 미생성) | — | **1회 실증** (CI run URL 2건 — **여전히 미충족**). **혼동 금지**: 게이트가 라이브에서 실재 red를 막은 적은 있으나(run `34174703512`) 그것은 *우연히 있던* red이지 *의도적으로 심은* 절단이 아니다. 축 D는 후자를 요구한다. **상태(2026-09-08 · M4): 여전히 미충족.** 다만 축 D를 막던 것이 권한이 아니라 **코드**였다는 것이 이 사이클의 산출이다 — `applyDelete`가 대상 가드 없이 임의 경로를 `git rm` 해, 절단 B가 자기 test나 격리 대상을 고르면 판정보다 앞선 step이 먼저 죽어 `gate.json`이 아예 생성되지 않았다. M4 Task 1이 그 가드를 코드로 옮겼고 다섯 사유 코드가 전부 발화한다. 남은 것은 원격 왕복(브랜치 push + 비-draft PR + red run 2건)뿐이고, 그것이 미수행이라 `m4-live-closure.md`는 `- axis-d: unmet`을 적는다 | 의도적 배선 제거 → red 확인. 절단은 [`scripts/test-suite/wiring-cut.js`](../../scripts/test-suite/wiring-cut.js)로 재현 가능하게 고정됐다 | 운영자 → red가 안 나면 커버리지 100%는 허위다 |

지표 2의 목표치를 지금 비워 두는 이유는 우산 PRD의 판정 기준 표와 같다 — **오늘 baseline이 없는 지표에 목표치를 지어내지 않는다.** 174분은 파일마다 프로세스를 새로 띄운 순차 합계이고, 로컬 16코어에서의 병렬 실행은 측정된 바 없다.

## Scope

**MVP — 축 A 하나.** 전수 실행의 정본 진입점(Node 20/24 양쪽 · Windows/Linux 양쪽에서 같은 인자로 동작)을 만들고, 조용한 머신에서 1회 완주해 벽시계를 기록한다. 그 실행이 174분의 구성을 파일 단위로 분해하고, 상위 15개의 원인을 규명하고, flaky 1건의 재현 여부를 판정한다.

MVP가 이것인 이유: A 없이 C부터 하면 174분짜리 CI를 만들어 매 PR마다 그 대가를 치르거나, 근거 없이 고른 shard 수로 목표를 자기충족시키게 된다.

### Out of scope

- **test를 새로 쓰지 않는다.** 커버리지 향상·품질 개선은 이 자식의 축이 아니다. 있는 것을 돌리는 것만 한다.
- **느린 test의 재작성** — `mkTmpRepo`의 6-spawn을 fixture 재사용으로 바꾸는 것은 48개 파일의 동작을 바꾸는 변경이다. C3은 **원인을 규명하고 수치를 낸다**. 실제 수리를 이 자식에 넣을지는 M1 산출을 보고 결정한다(Open Question 2).
- **배포 표면 변경** — `.github/`는 배포 밖이고 `plugin.json` version bump도 하지 않는다(우산 결정 1: 버전은 릴리스 컷이 소유한다).
- **receipt 게이트와의 연결** — CI는 receipt chain이 읽지 않는다. `env-contract-drift.yml`이 이미 같은 선을 그었다.
- **운영자 머신 진단(`doctor` 류)의 CI 실행** — 같은 선례(DD6/UI13)를 따른다. CI runner에는 그 대상이 없다.
- **branch protection 정책 설계** — 설정 1회는 축 C에 포함하지만, 어떤 상태 체크를 필수로 걸지의 정책 논의는 하지 않는다.

## Delivery Milestones
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | suite-entrypoint-and-baseline | 단일 명령으로 전수가 돌고 조용한 머신 벽시계가 기록된다. 174분의 구성이 파일 단위로 분해되고 상위 15개의 원인이 규명된다. flaky 1건의 재현 여부가 판정된다 | complete | `.claude/plans/ci-full-suite-m1.plan.md` |
| 2 | suite-green (정정 — 원명 `runtime-reduction`) | ~~벽시계가 PR 피드백 임계 안으로 들어온다. **shard 수를 정하는 것은 이 milestone이다**~~ → **벽시계 축은 M1 실측으로 이미 충족됐다**(Linux 전수 75.5초). shard 수는 **1**이고 그 근거는 지어낸 임계가 아니라 관측값이다. 운영자가 2026-09-02에 이 milestone의 축을 **스위트 green화**로 재지정했다 — red 16파일을 6갈래로 분해해 각각의 실제 원인을 닫는다. **종결 2026-09-03** (`/mccp:milestone-close`, verdict `done`, closure `.claude/milestone-closures/ci-full-suite-m2.md`): 16파일이 수리 8 · 가드 1 · 해소 1 · Linux 대기 6으로 전부 귀속됐고, 갈래 H는 러너 오염이 아니라 **test가 `gitDir`를 격리하지 않은 것**으로 재귀속됐다. 로컬 4회 전수에서 상시 red 0 · 신규 flaky 1(`post-edit-format-md`, 격리하지 않고 기록). **반올림하지 않은 미충족 1건**: 계획 Acceptance 산출물 2번(원소들의 `failing` 집합 동일)은 로컬에서도 Linux에서도 미충족이다(Linux 2원소가 6 대 5로 갈린다). 종결 **이후** 도착한 Linux 측정은 미충족을 늘리지 않았지만 산출물 1번의 충족이 **조건부**임을 드러냈다 — 그 측정을 컨테이너에 병합하는 순간 `redaction_ok=false`로 거짓이 된다. M3이 둘 다 회수한다 — 상세와 진단은 closure의 `## 종결 후 보정` 절 | complete | `.claude/plans/ci-full-suite-m2.plan.md` |
| 3 | ci-enforcement | CI가 전수를 실행하고 커버리지 100%가 자동 산출되며 branch protection이 red를 머지 차단으로 만든다. 배선 절단이 red를 만드는 것이 1회 실증된다. **구현 착지 2026-09-04** — 강제 workflow · 판정 5단계(`gate.js`) · 커버리지 오라클 · 삭제 래칫 · 격리 검증기 · 절단 셋 · drift 진단 · 컨테이너 검사가 전부 짝 test와 함께 들어왔고 로컬 150 단위 test가 green이다(같은 사이클의 `/mccp:code-review`가 낸 MEDIUM 4 · LOW 7을 전건 흡수한 뒤의 값 — floor 값 타입 fail-closed와 사유 코드 열거의 런타임/test 소비처가 그 흡수로 들어왔다). 구현 중 **보안 HIGH 1건 흡수**(fork PR이 통제하는 격리 파일에서 도달 가능한 ReDoS — 유일한 머지 차단 체크를 60분 태울 수 있었다). **미충족은 반올림하지 않는다** — ~~Acceptance의 라이브 산출물 **넷 전부 미충족**이고(브랜치가 원격에 없어 CI가 한 번도 돌지 않았다)~~ **정정(2026-09-08): 그 사유는 소멸했고 넷 중 둘이 충족됐다 — 같은 행 아래의 종결 정정 참조.** OQ3은 열린 채다. 상세: [docs/ci-full-suite/m3-enforcement.md](../../docs/ci-full-suite/m3-enforcement.md) §7. **종결 2026-09-04** (`/mccp:milestone-close`, verdict `done`, closure [`.claude/milestone-closures/ci-full-suite-m3.md`](../milestone-closures/ci-full-suite-m3.md)): 종결이 기계적 검증을 직접 재실행했다 — 단위 test **139 pass · fail 0**(기록된 "150"·"135"는 둘 다 부정확하며 실측 139가 정본), 게이트 **exit 0**, 커버리지 **98.4536**(382/388 · `unexplained` 0 · `missing` 0), 측정 `ok`·`attribution:complete`·`redaction_ok:true`·`failing:[]`. ~~**라이브 산출물 넷은 여전히 넷 다 미충족**이고 원인은 하나다(`git ls-remote`·`gh pr list` 공집합 — 브랜치가 원격에 없어 CI 0회).~~ **정정(2026-09-08 · M4 실측)**: 그 사유는 소멸했다 — 브랜치가 push되고 PR #185가 머지되며 게이트가 3회 발화했다(`34174703512` 차단 → `34176593137`·`34176861426` green). 넷 중 **1·2는 충족**(체크 발화·green · CI 커버리지 실값 98.4655% / 391분모, `gate.json` artifact 실물)이고 **3·4는 미충족**으로 남아 M4가 회수한다. 상세는 [m3-enforcement.md](../../docs/ci-full-suite/m3-enforcement.md) §7·§7a. 종결이 새로 기술한 것: **측정 provenance gap** — 전수 측정의 `git_sha`는 `c124e17`이고 현재 HEAD는 `ca6c67b`라, 그 사이 편집된 test 2파일은 전수 문맥에서 재측정되지 않았다(파일 *집합*은 게이트가, 두 파일의 *현재 내용*은 검사 1이 각각 덮으나 단일 산출물이 덮지는 않는다). 격리 6건 티켓은 backlog에 전부 실재하며 그 정당성은 Task 0 측정에 걸려 있다 | complete | `.claude/plans/ci-full-suite-m3w.plan.md` |
| 4 | enforcement-live-closure | M3이 만든 게이트에 **차단력을 붙이고** 그 차단력을 실증한다. 오늘 `main`은 `protected:false`이고 PR #185 자신이 green 게이트를 지나 머지됐다 — 게이트는 돌지만 막지 않는다. 넷을 닫는다: 축 D 절단 A·B의 CI red 실증(run 2건) · OQ3의 baseline dispatch 측정(artifact 4건) · 그 측정으로 격리 6건 재판정(Task 0 회수) · branch protection 설정과 `mergeStateStatus:BLOCKED` 관측. **새 기계를 만들지 않고 이미 만든 기계를 부른다** — 코드 변경은 선행 결함 둘뿐이다(절단 B 대상 가드 부재 · `ci-required-checks.js`가 admin 전용 채널을 읽어 non-admin에게 설정과 무관하게 `protection_absent`를 보고). **알려진 제약**: 인증 계정 `madsci207`은 `admin:false`라 protection 설정은 `idenn207`이 수행해야 하며, 권한이 오지 않으면 축 C를 **명시 미충족으로 두고 ship한다**(반올림 금지). 사용자 판단 6건은 AskUserQuestion 대신 **fable × codex 2중 리뷰**로 대체했고 판정표가 plan에 있다. **결과(2026-09-08): 넷 중 하나 충족 · 셋 미충족 — 반올림하지 않는다.** 충족: **OQ3 baseline dispatch**(run `34195014409` · 4 leg success · DD8 행 `matrix` 재도출 · "결정됨 · 시행 미완")와 그 측정에 의한 **격리 6건 재판정**(전건 잔존 · 사유 갱신). 미충족: **축 D**(원격 왕복 미수행 — 선행 코드 결함은 닫혔다)와 **축 C**(`madsci207`의 `admin:false`, 수행 주체는 `idenn207`). 코드는 계획대로 선행 결함 둘만 바꿨다 — 절단 B 대상 가드(5 사유 코드 · mutating call 앞 거부)와 판독 채널 world-readable 교체(+ 포함 검사 · 빈 `declared` fail-closed · `gh` 스텁 spawn seam). 로컬 게이트 exit 0 · 4파일 109 test pass. **status가 `complete`가 아닌 것은 의도다** — 라이브 산출물 다섯 중 넷이 미충족인 상태를 `complete`로 적는 것이 이 PRD가 금지한 반올림이다. 상세: [m4-live-closure.md](../../docs/ci-full-suite/m4-live-closure.md) | in-progress | `.claude/plans/ci-full-suite-m4.plan.md` |

## Open Questions

- [x] **조용한 머신을 어디서 확보하는가.** → **답(M1 실측): GitHub runner다.** 4코어 Linux runner가 16코어 Windows 개발 머신보다 벽시계 **19.2배** · 순차 합계 **64.8배** 빠르다(같은 Node v24.19.0). 전수가 Linux에서 **75.5초**에 끝난다. 근거: [docs/ci-full-suite/m1-baseline.md](../../docs/ci-full-suite/m1-baseline.md) §2. 아래 원문은 질문 제기 시점의 기록이다. 우산 PRD가 그대로 물려준 질문이다. 로컬 측정은 서브에이전트 경합 상태에서 나왔고 재측정에서 11배 차이가 났다. **GitHub runner 자체가 그 "조용한 머신"일 수 있다** — 그렇다면 baseline은 로컬이 아니라 CI에서 뜨는 것이 맞고, M1의 형태가 달라진다.
- [ ] **`mkTmpRepo`의 6-spawn을 고칠 것인가 감쌀 것인가.** 48개 파일이 쓰고, 고치면 그 전부의 동작이 바뀐다. 감싸면(template repo 복사) 격리가 약해진다. 어느 쪽이든 C3 범위인지 별도 자식인지 M1 산출로 판단한다. — **M2 기록**: 건드리지 않았다(UI8 명시 제외). 그리고 M2가 축을 벽시계에서 green으로 옮긴 이상, 이 질문의 동기였던 "로컬 루프 단축"은 더 이상 M2의 사유가 아니다 — 이 질문을 다음에 여는 주체는 별도 축이다.
- [ ] **Windows runner를 전수 matrix에 넣을 것인가.** 기존 3 workflow의 matrix가 제각각이다(ubuntu+macos · ubuntu+windows · ubuntu+windows). 전수를 2 OS로 돌리면 벽시계와 분(minute) 소모가 2배다. — **M2가 이 질문을 다시 열었다(답하지 않는다 — M3 소유).** M1 §6은 `win ∩ linux = 2`를 근거로 matrix를 요구했으나, M2는 Windows 전용 실패의 상당수가 플랫폼이 아니라 **테스트가 `gitDir`를 격리하지 않아 저장소의 살아있는 게이트 봉인을 읽은 것**임을 실측했다. 그 갈래를 걷어낸 뒤의 교집합으로 다시 물어야 한다. — **M3 기록: 여전히 답하지 못했다.** 배선 다섯(`matrix.os` · OS 축을 담은 artifact 이름 · `shell: bash` · OS 축을 담은 job 이름 · `runner.temp`)은 전부 착지했고 오라클 넷이 그것을 단언한다. 그러나 dispatch는 브랜치가 원격에 있어야 성립하므로 **측정이 없다.** DD8의 결정 규칙은 측정 **전에** 못박혀 있다 — Windows 전용 red 0건이면 Linux 단독, 1건 이상이면 matrix, 벽시계가 Linux의 10배 초과면 별도 트리거. 측정이 도착하면 그 표의 어느 행인지가 바로 정해지고, **규칙을 측정 후에 바꾸지 않는다.**
  — **상태(2026-09-08): 측정을 막던 사유가 소멸했다.** M3 시점의 "dispatch는 브랜치가 원격에
  있어야 성립한다"는 PR #185 머지로 해소됐고, `test-suite-baseline.yml`은 main에서 `active`이며
  `workflow_dispatch`로 4원소(`[ubuntu,windows] × [20,24]`)를 돌릴 수 있다. **그런데 dispatch
  이력이 0건이다** — 즉 이 질문이 열려 있는 이유는 이제 "측정 불가"가 아니라 "측정 미실행"이다.
  M4가 그것을 누르고 DD8 규칙을 적용한다. **그리고 행을 고르는 것과 시행하는 것은 다른
  명제다**: `matrix`가 선택되면 강제 workflow는 여전히 ubuntu 단독이므로 그 leg를 required로
  올리기 전 action pin 패리티(baseline은 tag-pin · 강제는 SHA-pin)가 선행이고, 그때 OQ3은
  "결정됨 · 시행 미완"으로 남는다.
  — **판정(2026-09-08 · M4 Task 4): 행은 `matrix` 이고 상태는 "결정됨 · 시행 미완" 이다.**
  run `34195014409` 의 artifact 넷에서 **재도출**한 값이다(문서에 적힌 행 이름을 읽지 않는다):
  Windows 전용 red **2건**(`lib/closure/tests/report.test.js` · `lib/tests/plan-review-write-invariants.test.js`) ·
  벽시계 linux 133,302ms 대 windows 536,483ms = **4.02배**(10배 미만) → 규칙의 중첩 구조상 `matrix`.
  **규칙을 측정 후에 바꾸지 않았다.** OQ3 을 `[x]` 로 닫지 않는 이유는 위 문단이 미리 적어 둔
  그대로다 — 강제 workflow 는 ubuntu 단독이고 matrix leg 을 required 로 올리려면 action pin
  패리티가 선행이며, 그 선행조건은 backlog `ci-full-suite:H5` 다(그 항목의 발현 조건이 이
  측정으로 참이 됐다). **시행 소유자: ci-full-suite 후속 사이클.** 상세:
  [m4-live-closure.md](../../docs/ci-full-suite/m4-live-closure.md) §3.
- [x] **Node 20 하한을 유지할 것인가.** → **답(M1 실측): 유지해도 비용이 없다.** 진입점은 glob을 node에 넘기지 않고 스스로 열거하므로 Node 버전 차이가 소거됐고, Node 20은 `data.file`을 전부 실어 `attribution=complete`(6,363/6,363)다. 오히려 **node 20이 node 24보다 30% 빠르다**(순차 200.9초 대 261.8초). 근거: 같은 문서 §5. 아래 원문은 질문 제기 시점의 기록이다. CLAUDE.md §3.4가 Node 20+를 표방하고 CI가 20에 고정돼 있는데 로컬은 24다. 진입점을 어느 쪽에 맞출지가 glob 형태를 정한다.
- [x] **커버리지 100%의 분모는 무엇인가.** → **답(M3): tracked `*.test.js` 파일 수다.** 세 후보 중 **test case 수는 이 러너가 산출할 수 없다** — reporter가 `nesting !== 0` 이벤트를 버리므로 파일 단위 아래의 수치가 측정 경로에 존재하지 않는다. 남는 둘("파일 수" · "CI가 실행하지 않는 파일이 0")은 같은 것의 두 표현이고, 후자가 판정 형태다. 채널은 `git ls-files -z '*.test.js'`이며 소유자는 게이트다 — `measurement.files_total`에서 파생하는 것은 **금지**이고(피측정자가 자기 분모를 정하면 열거가 무너져도 커버리지는 100%로 보인다) 그 금지는 산문이 아니라 짝 단언으로 고정돼 있다. 실값과 격리의 대가는 [m3-enforcement.md](../../docs/ci-full-suite/m3-enforcement.md) §3. 아래 원문은 질문 제기 시점의 기록이다. `*.test.js` 파일 수인가, test case 수인가, "CI가 실행하지 않는 파일이 0"인가. 셋의 값이 다르고 세 번째만 자동 산출이 쉽다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 전수 CI가 flaky를 대량 노출해 상시 red가 되고, red가 신호이길 멈춘다 | **높음** | **높음** | M1이 flaky를 먼저 판정한다(동일 커밋 3회). 축 C 진입 전 flaky 0이 전제다. 격리는 삭제가 아니라 명시 quarantine 목록 + 티켓 |
| ~~174분이 줄지 않아 축 C가 실현 불가가 된다~~ **해소(M1·M3 실측)** | 중 | 높음 | 실현되지 않았다 — Linux 전수가 75.5초(M1) · CI 게이트 측정 126초(2026-09-08)다. 형태 변경(nightly·shard)은 불필요했고 shard는 1로 남았다 |
| GitHub Actions 분 소모가 감당 안 된다 | 중 | 중 | M1 벽시계 × 월 PR 수로 산정 가능하다. 산정 전 matrix 확대 금지. **실측(2026-09-08)**: PR당 job 2m23s(측정 126초). 이 값이 OQ3의 matrix 판정에 그대로 곱해진다 |
| 커버리지 100%를 달성했는데 그 test들이 아무것도 못 잡는다 | 중 | **높음** | 축 D(배선 절단 음성 통제)가 정확히 이 위험을 겨냥한다. 우산 PRD가 모든 자식에게 요구한 *"배선 부재를 보는 test가 없다면 그 자식은 완료가 아니다"* 의 C3판. **부분 반증(2026-09-08)**: 첫 라이브 발화가 main에 나흘간 살아 있던 실재 red를 잡았다 — 스위트가 무력하지 않다는 증거다. 그러나 그것은 *우연히 있던* red이고 축 D가 요구하는 *의도적 절단*이 아니므로 위험은 열린 채다 |
| `mkTmpRepo` 수리가 48개 파일의 격리를 약화시켜 조용한 위양성/위음성을 만든다 | 중 | 높음 | Out of scope로 두고 M1 산출 후 결정한다. 수리한다면 그 자체가 축 D 음성 통제의 첫 대상이다 |
| C3이 CI를 고치는 동안 C1·C2·C4가 새 test를 추가해 분모가 움직인다 | 높음 | 낮음 | 커버리지는 비율이라 분모 이동에 안정적이다. 진입점이 glob이면 새 파일이 자동 포함된다 |
| **게이트가 green인데 머지를 막지 않아 "통과"가 오독된다** (2026-09-08 실현) | **실현됨** | **높음** | PR #185가 green 체크를 지나 머지된 것이 실측이다. 축 C의 나머지 절반(branch protection)이 없으면 체크는 신호일 뿐 게이트가 아니다. M4가 그것을 켜고 `mergeStateStatus:BLOCKED`를 관측한다 |
| **축 C가 저장소 권한에 걸려 자식 스스로 닫을 수 없다** | **실현됨** | 중 | `madsci207`은 `admin:false`다. 완화가 아니라 **명시**로 다룬다 — 권한이 오지 않으면 M4는 축 C를 미충족으로 두고 ship하며 그 사실을 문서가 강제한다(반올림 금지) |
| 우산 PRD의 수치를 정정한 이 문서와 우산 본문이 다시 어긋난다 | 중 | 낮음 | 같은 커밋에서 우산의 해당 3곳을 함께 정정한다(선례: C0의 cadence correction) |

---
*Status: **ACTIVE** — M1·M2·M3 complete, M4 in-progress (`.claude/plans/ci-full-suite-m4.plan.md`).*
*~~DRAFT — requirements only. Implementation planning pending via /mccp:plan.~~ (2026-09-01 상태, 보존)*
*본문 최신화 2026-09-08: Problem 상태 주석 · Evidence에 라이브 관측 블록 · Success Metrics 1~4 실값 · Hypothesis 종결 조건 상태 · OQ3 차단 사유 소멸 · Risks 3건 갱신 + 2건 신규.*
*우산 PRD에서 상속(2026-09-01 co-created) + 운영자 승인 2026-09-01. Problem·Users·Hypothesis는 상속안을 운영자가 명시 승인했고, Evidence는 본 세션 실측이다.*
