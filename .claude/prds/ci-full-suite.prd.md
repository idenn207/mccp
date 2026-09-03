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

## Users

- **Primary**: **운영자 본인 — PR을 여는 순간의 자신.** 트리거는 "지금 무엇이 깨졌는지 머지 전에 알 방법이 없다"이다. 전수를 돌리려면 명령을 매번 손으로 조립해야 하고, 조립해도 174분이라 실질적으로 아무도 돌리지 않는다.
- **Secondary**: **C1·C2·C4를 병렬로 여는 자신.** 자식 넷이 동시에 배선을 넣는데, 그 배선이 서로를 끊어도 오늘은 머지 후에만 발견된다.
- **Not for**: mccp 실사용자. `.github/`는 marketplace `source`(`./plugins/mccp`) 밖이라 이 자식은 사용자에게 **아무것도 전달하지 않는다**. 사용자 체감 0이 C3을 그룹 1에서 가장 안전한 축으로 만든다.

## Hypothesis

We believe **전수 실행을 단일 명령으로 재현 가능하게 만들고, 그 벽시계를 감당 가능한 크기로 줄이고, CI가 그것을 강제하는 것**이 **"기계는 만들어지고 그것을 부르는 한 줄이 빠지며 아무 test도 그 부재를 보지 못한다"** 를 **운영자 본인(그리고 그가 병렬로 여는 자식들)** 에게 해소할 것이다.

We'll know we're right when **CI 강제 커버리지가 100%가 되고, 전수 실행이 PR 피드백으로 쓸 수 있는 벽시계 안에 들어오며, 배선을 끊는 변경이 머지 전에 red로 잡히는 것이 한 번 실증될 때**.

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
| 1 | CI 강제 커버리지 | **2.7%** (10/368) | 산출이 자동화된다 | **100%** | workflow가 실행한 파일 수 / `*.test.js` 총계 | PR 체크 → 미달 시 머지 차단 |
| 2 | 전수 실행 벽시계 | **174분** (순차 · 경합 오염 의심) | 조용한 머신 실측 1회 → **충족(M1)** | **충족(Linux) — 75.5초, shard 1** | 진입점 1회 실행 | 운영자 → 임계 초과 시 shard 수 재조정 |
| 3 | 상시 red / flaky | ~~**1건**~~ → **16파일**(M1 전수 실측 — 이전 수치는 전수를 돌려보기 전의 추정이었다) | 원인이 규명된다 → **M2가 6갈래로 분해**(H harness · P 플랫폼 · C CI 설정 · D drift · F flaky · R 자원) | **0** | 동일 커밋 3회 반복 실행 (프로토콜: `--merge-into <container> --label <axis>-r{1,2,3}`) | CI → flaky는 삭제가 아니라 명시 격리 + 티켓 |
| 4 | 배선 절단 탐지 (음성 통제) | **미측정** | — | **1회 실증** | 의도적 배선 제거 → red 확인 | 운영자 → red가 안 나면 커버리지 100%는 허위다 |

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
| 2 | suite-green (정정 — 원명 `runtime-reduction`) | ~~벽시계가 PR 피드백 임계 안으로 들어온다. **shard 수를 정하는 것은 이 milestone이다**~~ → **벽시계 축은 M1 실측으로 이미 충족됐다**(Linux 전수 75.5초). shard 수는 **1**이고 그 근거는 지어낸 임계가 아니라 관측값이다. 운영자가 2026-09-02에 이 milestone의 축을 **스위트 green화**로 재지정했다 — red 16파일을 6갈래로 분해해 각각의 실제 원인을 닫는다 | in-progress | `.claude/plans/ci-full-suite-m2.plan.md` |
| 3 | ci-enforcement | CI가 전수를 실행하고 커버리지 100%가 자동 산출되며 branch protection이 red를 머지 차단으로 만든다. 배선 절단이 red를 만드는 것이 1회 실증된다 | pending | — |

## Open Questions

- [x] **조용한 머신을 어디서 확보하는가.** → **답(M1 실측): GitHub runner다.** 4코어 Linux runner가 16코어 Windows 개발 머신보다 벽시계 **19.2배** · 순차 합계 **64.8배** 빠르다(같은 Node v24.19.0). 전수가 Linux에서 **75.5초**에 끝난다. 근거: [docs/ci-full-suite/m1-baseline.md](../../docs/ci-full-suite/m1-baseline.md) §2. 아래 원문은 질문 제기 시점의 기록이다. 우산 PRD가 그대로 물려준 질문이다. 로컬 측정은 서브에이전트 경합 상태에서 나왔고 재측정에서 11배 차이가 났다. **GitHub runner 자체가 그 "조용한 머신"일 수 있다** — 그렇다면 baseline은 로컬이 아니라 CI에서 뜨는 것이 맞고, M1의 형태가 달라진다.
- [ ] **`mkTmpRepo`의 6-spawn을 고칠 것인가 감쌀 것인가.** 48개 파일이 쓰고, 고치면 그 전부의 동작이 바뀐다. 감싸면(template repo 복사) 격리가 약해진다. 어느 쪽이든 C3 범위인지 별도 자식인지 M1 산출로 판단한다. — **M2 기록**: 건드리지 않았다(UI8 명시 제외). 그리고 M2가 축을 벽시계에서 green으로 옮긴 이상, 이 질문의 동기였던 "로컬 루프 단축"은 더 이상 M2의 사유가 아니다 — 이 질문을 다음에 여는 주체는 별도 축이다.
- [ ] **Windows runner를 전수 matrix에 넣을 것인가.** 기존 3 workflow의 matrix가 제각각이다(ubuntu+macos · ubuntu+windows · ubuntu+windows). 전수를 2 OS로 돌리면 벽시계와 분(minute) 소모가 2배다. — **M2가 이 질문을 다시 열었다(답하지 않는다 — M3 소유).** M1 §6은 `win ∩ linux = 2`를 근거로 matrix를 요구했으나, M2는 Windows 전용 실패의 상당수가 플랫폼이 아니라 **테스트가 `gitDir`를 격리하지 않아 저장소의 살아있는 게이트 봉인을 읽은 것**임을 실측했다. 그 갈래를 걷어낸 뒤의 교집합으로 다시 물어야 한다.
- [x] **Node 20 하한을 유지할 것인가.** → **답(M1 실측): 유지해도 비용이 없다.** 진입점은 glob을 node에 넘기지 않고 스스로 열거하므로 Node 버전 차이가 소거됐고, Node 20은 `data.file`을 전부 실어 `attribution=complete`(6,363/6,363)다. 오히려 **node 20이 node 24보다 30% 빠르다**(순차 200.9초 대 261.8초). 근거: 같은 문서 §5. 아래 원문은 질문 제기 시점의 기록이다. CLAUDE.md §3.4가 Node 20+를 표방하고 CI가 20에 고정돼 있는데 로컬은 24다. 진입점을 어느 쪽에 맞출지가 glob 형태를 정한다.
- [ ] **커버리지 100%의 분모는 무엇인가.** `*.test.js` 파일 수인가, test case 수인가, "CI가 실행하지 않는 파일이 0"인가. 셋의 값이 다르고 세 번째만 자동 산출이 쉽다.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 전수 CI가 flaky를 대량 노출해 상시 red가 되고, red가 신호이길 멈춘다 | **높음** | **높음** | M1이 flaky를 먼저 판정한다(동일 커밋 3회). 축 C 진입 전 flaky 0이 전제다. 격리는 삭제가 아니라 명시 quarantine 목록 + 티켓 |
| 174분이 줄지 않아 축 C가 실현 불가가 된다 | 중 | 높음 | M2를 별도 milestone으로 분리한 이유가 이것이다. 줄지 않으면 축 C의 형태를 바꾼다(전수는 nightly, PR은 변경 영향 shard) — 그 결정은 M1 숫자가 내린다 |
| GitHub Actions 분 소모가 감당 안 된다 | 중 | 중 | M1 벽시계 × 월 PR 수로 산정 가능하다. 산정 전 matrix 확대 금지 |
| 커버리지 100%를 달성했는데 그 test들이 아무것도 못 잡는다 | 중 | **높음** | 축 D(배선 절단 음성 통제)가 정확히 이 위험을 겨냥한다. 우산 PRD가 모든 자식에게 요구한 *"배선 부재를 보는 test가 없다면 그 자식은 완료가 아니다"* 의 C3판 |
| `mkTmpRepo` 수리가 48개 파일의 격리를 약화시켜 조용한 위양성/위음성을 만든다 | 중 | 높음 | Out of scope로 두고 M1 산출 후 결정한다. 수리한다면 그 자체가 축 D 음성 통제의 첫 대상이다 |
| C3이 CI를 고치는 동안 C1·C2·C4가 새 test를 추가해 분모가 움직인다 | 높음 | 낮음 | 커버리지는 비율이라 분모 이동에 안정적이다. 진입점이 glob이면 새 파일이 자동 포함된다 |
| 우산 PRD의 수치를 정정한 이 문서와 우산 본문이 다시 어긋난다 | 중 | 낮음 | 같은 커밋에서 우산의 해당 3곳을 함께 정정한다(선례: C0의 cadence correction) |

---
*Status: DRAFT — requirements only. Implementation planning pending via /mccp:plan.*
*우산 PRD에서 상속(2026-09-01 co-created) + 운영자 승인 2026-09-01. Problem·Users·Hypothesis는 상속안을 운영자가 명시 승인했고, Evidence는 본 세션 실측이다.*
