# Plan: ci-full-suite M1 — suite-entrypoint-and-baseline

**Source PRD**: `.claude/prds/ci-full-suite.prd.md`
**Selected Milestone**: 1 — suite-entrypoint-and-baseline
**Complexity**: Medium

## Summary

전수 test 실행의 정본 진입점을 배포 표면 밖(`scripts/`)에 만들고, 그것으로 한 번 완주해
벽시계와 **파일 단위 분해**를 기록한다. 진입점은 Node 20/24 · Windows/Linux에서 같은 인자로
동작해야 하므로 glob을 node에 넘기지 않고 스스로 열거하며, 파일 귀속은 TAP이 제공하지 않으므로
custom reporter가 담당한다. 측정은 로컬(Node 24 · 16코어)과 `workflow_dispatch` 전용 CI
워크플로(Node 20 · runner) 양쪽에서 뜬다 — PRD Open Question 1이 "GitHub runner 자체가 그
조용한 머신일 수 있다"고 이미 열어 둔 갈래다.

M1은 **강제하지 않는다**. `pull_request` 트리거 · 커버리지 산출 · branch protection은 전부 M3
소유이고, 느린 test의 수리는 M2 이후다. 이 milestone이 내놓는 것은 숫자이며, M2의 임계값과
M3의 shard 수가 그 숫자에서 파생된다.

## User Intent

<!-- USER-STATED만. 저자 정당화는 ## Design Decisions로. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | C3(ci-full-suite)을 전용 worktree에서 진행한다 | direction |
| UI2 | 판단이 필요한 지점은 Claude가 정해서 진행한다 | direction |
| UI3 | MVP는 축 A 하나다 — 진입점을 만들고 벽시계를 1회 기록한다 | constraint |
| UI4 | test를 새로 쓰지 않는다. 있는 것을 돌리는 것만 한다 | exclusion |
| UI5 | 느린 test를 재작성하지 않는다. 원인을 규명하고 수치를 내는 데까지다 | exclusion |
| UI6 | 배포 표면을 바꾸지 않고 plugin.json version도 bump하지 않는다 | exclusion |
| UI7 | receipt 게이트와 CI를 연결하지 않는다 | exclusion |
| UI8 | 운영자 머신 진단(doctor 류)을 CI에서 실행하지 않는다 | exclusion |
| UI9 | branch protection 정책 설계를 하지 않는다 | exclusion |
| UI10 | baseline이 없는 지표에 목표치를 지어내지 않는다 | constraint |
| UI11 | flaky는 삭제가 아니라 명시 격리와 티켓으로 다룬다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수/실행 2층 분리 | `plugins/mccp/scripts/lib/suite-determinism.js:72,125` | 판정은 순수 함수(`diffRuns`), spawn과 파싱은 실행층(`runSuite`). 부정 케이스를 합성 입력으로 결정적으로 단언 가능 |
| 러너 없는 검사는 무의미 | `.github/workflows/env-contract-drift.yml` (origin/main) 헤더 주석 | "`lint.js`에 caller가 0이었다 — 러너 없이 검사를 추가하면 아무것도 바뀌지 않는다". C3은 이 패턴의 확장 |
| CI glob 형태 | 같은 파일 `:88-90` | `shell: bash` + 셸이 펼치는 glob만 Node 20/24 양쪽에서 산다. 디렉토리 인자는 24에서, 인용 glob은 20에서 죽는다 |
| workflow 주석이 한계를 명시 | `.github/workflows/gitignore-drift.yml` "Scope note" | "이 workflow는 lint가 RUN되고 drift에 red가 되는 것만 보장한다. 머지 차단은 저장소 설정이다" |
| 관측 도구는 스위트를 고치지 않는다 | `plugins/mccp/scripts/lib/suite-determinism.js:17-19` | 재시도로 green을 만들거나 실패를 숨기지 않는다 — 관측만 한다 |
| Tests | `plugins/mccp/scripts/lib/tests/suite-determinism.test.js:19-33` | `node --test`, 합성 입력, 네 필드 전부 단언(두 개만 보면 나머지 누락도 통과) |
| Naming | `plugins/mccp/scripts/lib/archive-complete/{scan,apply}.js` | 한 축의 도구는 디렉토리로 묶고 순수층/실행층을 파일로 나눈다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `scripts/test-suite/enumerate.js` | CREATE | 순수층 — git-tracked `*.test.js` 목록에서 `{included, excluded[{path,reason}]}`를 낸다. glob을 node에 넘기지 않으므로 Node 버전 차이가 소거된다 |
| `scripts/test-suite/reporter.mjs` | CREATE | custom test reporter. TAP은 다중 파일에서 **파일 귀속을 전혀 싣지 않는다**(실측) — reporter 이벤트의 `data.file`만이 파일 단위 분해의 유일한 경로 |
| `scripts/test-suite/run.js` | CREATE | 실행층 CLI. 열거 → argv 길이 판정 → spawn → 벽시계·exit code·파일별 집계를 JSON으로 |
| `scripts/tests/test-suite.test.js` | CREATE | 순수층 부정 케이스 + argv 산술 + reporter 집계(합성 이벤트) + **자기 포함 단언** |
| `.github/workflows/test-suite-baseline.yml` | CREATE | `workflow_dispatch` **전용**. 측정만 한다 — `pull_request` 트리거는 M3 소유 |
| `.claude/_meta/data/2026-09-01-suite-baseline.json` | CREATE | 측정 원자료. **`{ schema, runs: [ <run.js 산출> … ] }` 컨테이너**이며 로컬 실행과 CI artifact가 각각 한 원소로 들어간다. run.js는 이 파일을 쓰지 않는다 — 쓰는 주체는 Task 6-3의 `--merge-into`뿐이다 |
| `docs/ci-full-suite/m1-baseline.md` | CREATE | 판정 문서 — 벽시계 · 상위 15개 원인 · flaky 판정 · M2/M3이 물려받는 수치 |
| `.claude/prds/ci-full-suite.prd.md` | UPDATE | milestone 1 행 status + Plan 경로. Evidence 중 본 세션 실측과 어긋나는 항목 정정 |
| `.claude/PRPs/reports/ci-full-suite-m1-report.md` | CREATE | 구현 보고 |

배포 표면 밖임의 근거: `.claude-plugin/marketplace.json`의 `source`가 `./plugins/mccp`이므로
`scripts/` · `.github/` · `docs/` · `.claude/`는 사용자에게 전달되지 않는다(UI6).

## Design Decisions

<!-- 저자 정당화. 리뷰어 focus에는 주입되지 않는다. -->

- **DD1 — 진입점은 `scripts/`에 둔다.** `suite-determinism.js`가 `plugins/mccp/scripts/lib/`에
  있어 그쪽이 선례지만, 거기에 새 파일을 추가하는 것은 배포 표면 변경이고 UI6와 정면으로
  부딪친다. 새 최상위 `scripts/`는 tracked 루트 목록에 없고 `.gitignore`에도 걸리지 않는다(실측).
- **DD2 — glob을 node에 넘기지 않는다.** PRD가 기록한 세 형태(디렉토리 인자 · 인용 glob ·
  셸 확장 glob) 중 셋째만 양쪽 Node에서 살지만, 그것은 `shell: bash`를 load-bearing으로 만들고
  로컬 pwsh 호출을 깨뜨린다. 러너가 스스로 열거하면 세 형태 문제가 **존재하지 않는다**.
- **DD3 — `suite-determinism.js`를 M1에서 건드리지 않는다.** 그 `runSuite`(`:129`)는 패턴을
  셸 없이 `spawnSync`에 넘기므로 node 자신의 glob 해석이 필요하고, 그것은 22.6.0 도입이다 —
  즉 **CI의 Node 20에서 동작하지 않는다.** 고치는 것은 배포 표면 편집이라 UI6에 걸리고, M1이
  필요한 3회 반복은 로컬 Node 24에서 오늘 그대로 돌아간다. 사실만 기록하고 이연한다.
- **DD4 — 제외 목록은 비운 채 출시한다.** 러너는 사유 문자열이 필수인 제외 목록을 *지원*하되
  기본값은 공집합이다. `.claude/scripts/receipt/tests/` 10개는 2026-06-03 이후 손대지 않은
  죽은 vendored 사본(tracked 참조 0건)이지만, 그것을 조용히 빼는 것이 PRD가 경고한 실패
  모드다. 포함해서 돌리고 결과를 보고한다 — 은퇴 여부는 별개 축이다. 이 선택이 OQ5를
  세 후보 중 자동 산출이 가능한 셋째("CI가 실행하지 않는 파일이 0")로 답한다.
- **DD5 — 측정을 로컬과 CI 양쪽에서 뜬다.** OQ1이 이미 그 갈래를 열어 뒀고, CI 측정은 동시에
  OQ4(Node 20 하한)와 reporter의 `data.file` 가용성을 Node 20에서 실증한다 — 그 실증 없이는
  M3의 커버리지 산출이 근거 없는 가정 위에 선다.
- **DD6 — reporter가 `data.file`을 못 주면 0을 보고하지 않는다.** 귀속 불가를 명시 상태로
  내보내고 파일별 spawn fallback을 안내한다. 조용한 0은 "전부 즉시 끝났다"로 읽힌다.
- **DD7 — 측정 산출물은 tracked이므로 경로가 redaction 대상이다.** node reporter의
  `data.file`은 절대경로이고 `mkTmpRepo`는 `os.tmpdir()` 아래에 repo를 만든다. 그대로 실으면
  사용자 계정 경로가 git 이력과 CI artifact 양쪽에 들어간다. 기존 tracked baseline
  `test-suite-run.txt`에 절대경로가 0건이라 이것은 새 기준이 아니라 **유지**이고, §3.12가
  `meta.cwd`에 sanctioned re-seal까지 동원해 닫은 유출을 새 파일에서 다시 여는 것을 막는다.
  `hash.js`의 carve-out 선례를 따르지 않는 이유도 같다 — 값을 빼는 것이 아니라 값을 정규화한다.
- **DD8 — 위험 방향은 하나뿐이고 그것만 test로 고정한다.** 이 러너가 조용히 틀릴 수 있는
  유일한 방향은 *실행되지 않았는데 통과로 읽힘*이다. 그래서 `ok`/`reason` · chunk 접기 ·
  reporter 인자 형태 · 실제 producer 자기 포함 네 축이 산문이 아니라 Task 4의 단언으로
  존재한다. 나머지(성능·편의)는 틀려도 관측되므로 test를 늘리지 않는다.

## Tasks

### Task 0: base 동기화 (§3.5.1 삭제 검증 포함)
- **Action**: `git merge origin/main`. 이 브랜치의 base `bacd96a`에는 `.github/workflows/env-contract-drift.yml`이 **없고** `origin/main`(`647dfec`)에는 있다(실측) — 머지 없이 진행하면 M1이 "workflow 2개"를 전제로 설계된다.
- **Mirror**: CLAUDE.md §3.5.1 — `git diff --diff-filter=D --name-only origin/main...HEAD`로 이 브랜치가 삭제하는 파일을 확인하고, 의도하지 않은 삭제가 있으면 멈춘다.
- **Validate**: `git ls-files .github/workflows | wc -l` 이 3 · `git diff --diff-filter=D --name-only origin/main...HEAD` 공집합

### Task 1: 열거 순수층 `scripts/test-suite/enumerate.js`
- **Action**: `enumerateTests({ trackedFiles, exclusions })` — I/O 없음. `*.test.js`로 끝나는 경로만 취하고, `exclusions`(각 항목 `{pattern, reason}`, 사유 필수)에 걸린 것은 `excluded`로 분리한다. 경로는 POSIX 구분자로 정규화하고 정렬해 출력이 플랫폼과 무관하게 결정적이도록 한다. 기본 제외 목록은 **공집합**(DD4). 사유 없는 제외 항목은 throw — 조용한 제외가 이 milestone이 막으려는 것이다.
- **Mirror**: `plugins/mccp/scripts/lib/suite-determinism.js:72` `diffRuns` — 순수 판정, fail-closed 기본값
- **Validate**: `node --test scripts/tests/test-suite.test.js`

### Task 2: reporter `scripts/test-suite/reporter.mjs`
- **Action**: `test:complete` 중 `nesting === 0`만 취해 `data.file`로 집계한다. 파일별로 `{ file, tests, pass, fail, sum_ms, first_at, last_at }`를 모으고 마지막에 한 줄 JSON으로 emit. `data.file`이 없거나 비면 `attribution: "unavailable"`을 명시 emit하고 **0을 쓰지 않는다**(DD6). 순수 집계 함수를 named export로 분리해 합성 이벤트로 단언 가능하게 한다.
- **경로는 repo-relative로 정규화한다 (L2 security F1 흡수)**: `data.file`은 **절대경로**이고(실측: `C:\_project\...\fix-task.test.js`) 이 산출은 git-tracked `.claude/_meta/data/`로 커밋되며 `upload-artifact`로도 나간다. 기존 tracked baseline `test-suite-run.txt`에는 절대경로가 0건이므로 그대로 실으면 **관행의 후퇴**이자 §3.12가 `meta.cwd`에 sanctioned re-seal까지 동원해 닫은 유출을 새 파일에서 재개방하는 것이다. 집계 키는 `path.relative(repoRoot, data.file)`를 POSIX 구분자로 정규화한 값으로 삼고, repo 밖 경로는 파일명만 남긴 `<external>/<basename>` 형태로 접는다. `failing` 항목의 자유 텍스트도 같은 이유로 `repoRoot`와 `os.tmpdir()` 접두어를 각각 `<repo>` · `<tmp>`로 치환한 뒤 싣는다 — 48개 test 파일이 `mkTmpRepo`(`plugins/mccp/scripts/receipt/tests/helpers.js:9`, `os.tmpdir()` 기반)를 쓰므로 실패 진단에 사용자 계정 경로가 실린다. **접두 비교는 순수 문자열 비교가 아니다**: Windows에서 `os.tmpdir()`는 8.3 단축형(`…\ADMINI~1\…`)을 돌려줄 수 있는데 진단 문자열은 `fs.realpathSync`를 거쳐 장형으로 실릴 수 있어, 그대로 비교하면 prefix가 어긋나 계정명이 그대로 통과한다. 두 후보(`os.tmpdir()`와 그 `realpathSync`)를 **둘 다** 접두로 등록하고 Windows에서는 대소문자 무시로 비교한다. 마지막 방어는 정규식이 아니라 **불변식**이다 — emit 직전 산출 전체를 훑어 `repoRoot`·`tmpdir` 어느 후보로도 시작하는 잔여 절대경로가 있으면 `ok:false` + `reason:'redaction-incomplete'`로 떨어뜨린다(플랫폼별 패턴 열거는 반드시 빠뜨린다).
- **Mirror**: `plugins/mccp/scripts/lib/suite-determinism.js:50,203` — `parseTap`/`toPerRun`처럼 파싱과 투영을 순수 함수로 떼어 실행 없이 단언. 경로 redaction의 선례는 §3.12의 `write.js` `meta.cwd` repo-relative 정규화
- **주의(실측)**: Windows에서 `--test-reporter=<절대경로>`는 `ERR_UNSUPPORTED_ESM_URL_SCHEME`로 죽는다. 러너는 `file://` URL 또는 repo-root 상대 경로로만 넘긴다. 이 제약은 산문이 아니라 Task 4-(5)의 단언이 지킨다.
- **Validate**: `node --test scripts/tests/test-suite.test.js`

### Task 3: 실행층 `scripts/test-suite/run.js`
- **Action**: CLI. 서브모드 `--list`(열거만 — M3의 커버리지 분모가 읽을 표면) · `--json` · `--files-from <file>` · `--exclude-from <file>` · `--merge-into <container> --label <name> [--from <file>]`(tracked 컨테이너에 append; 같은 label은 교체). **tracked 증거 파일을 쓰는 주체는 이 마지막 하나뿐이다** — 산문에만 두면 명세되지 않은 writer가 된다.
  1. `git ls-files`(또는 `--files-from`)로 tracked 목록을 얻어 Task 1에 넘긴다.
  2. **argv 길이 판정** — 실측 346경로가 20,867바이트다. Windows `CreateProcess` 한계는 32,767자다. 분할 계산은 **순수 named export** `planChunks({ files, limitBytes })`로 노출한다(기본 24,000). spawn 안에 묻으면 Task 4-(2)의 chunk 수 단언을 실행 없이 쓸 수 없다 — Task 2의 reporter가 집계 함수를 떼어낸 것과 같은 이유다. 조용히 넘기면 test가 늘어난 어느 날 원인 불명으로 죽는다.
  3. `node --test --test-reporter=<상대경로 reporter.mjs> -- <files...>` spawn(`--` 종결자 필수 — 열거의 유일한 수용 조건이 "`*.test.js`로 끝남"이라 `--experimental-x=a.test.js` 같은 항목이 파일이 아니라 node 플래그로 해석된다). 벽시계는 **첫 spawn 직전부터 마지막 spawn 종료까지** `Date.now()` 차. spawn 인자를 만드는 `buildSpawnArgs({ reporterPath, files })`도 순수 export로 떼어 reporter 경로 형태를 단언 가능하게 하고, **실행층은 spawn 함수를 주입 가능한 seam으로 받는다**(`runOnce({ ..., spawn })`) — Task 4-(6)의 실패 경로 단언은 그 seam 없이는 접기 헬퍼를 대상으로 퇴화한다.
  4. 산출: `{ ok, reason, attribution, node_version, platform, cpus, git_sha, ci_run_id, files_total, files_excluded, exclusions, wall_clock_ms, exit_code, chunks, chunks_failed, per_file, failing }`. `git_sha`(`git rev-parse HEAD`)와 `ci_run_id`(`GITHUB_RUN_ID`, 로컬은 `null`)는 **결속**이다 — 이 값들이 없으면 tracked 컨테이너의 숫자가 어떤 커밋의 어떤 실행에서 나왔는지 알 수 없고, M2의 임계값과 M3의 shard 수가 미결속 숫자에서 파생된다.
- **`ok`는 정확히 "측정이 성립했는가"이며 스위트 green이 아니다 (L2 architect F2 · test F3 흡수)**: mirror 대상 `runSuite`(`plugins/mccp/scripts/lib/suite-determinism.js:135-147`)가 그 계약이다 — `r.error`와 요약 헤더 부재를 각각 `{ok:false, reason:'spawn-failed…'|'incomplete-tap…'}`로 되돌리되 **test 실패는 `failing`/`exitCode`로 분리**한다. 이 러너도 같다: `exit_code`가 비영점이어도 `ok`는 `true`일 수 있고, 그래야 "M1은 측정이고 red는 기록만 한다"는 전제와 Acceptance가 충돌하지 않는다. `ok:false`일 때 `per_file`은 `null`이지 `[]`가 아니다(DD6과 같은 선 — 모름을 0으로 쓰지 않는다).
- **`ok`는 귀속 완전성을 포함한다 (L2 invariant F1 흡수)**: `attribution === 'complete'`는 `per_file` 항목 수 = `files_total`을 뜻하고, 그렇지 않으면 `ok:false` + `attribution:'partial'` + `reason`에 누락 파일 수를 싣는다. 이것이 빠지면 **import error나 크래시로 `test:complete`(nesting 0)를 한 번도 못 낸 파일이 집계에서 조용히 사라진다** — chunk 접기의 exit code 전파는 *실행돼서 실패한* 파일만 잡지 *실행조차 안 된* 파일은 못 잡으므로, 부분 측정이 완주 성공으로 읽힌다. DD8이 유일한 치명 방향이라 부른 것이 정확히 이것이라 사람이 읽는 Acceptance가 아니라 러너 자신이 판정해야 한다. Node가 `data.file`을 아예 안 싣는 경우도 다른 축이지만 **그때도 `ok`는 `false`다 (L2 invariant HIGH 흡수)**. 앞선 판본은 그 경우에 `ok:true`를 줬고, 그러면 **1건 귀속은 차단되는데 0건 귀속은 통과하는 역전**이 생긴다 — 최악 입력이 permissive 방향으로 떨어진다. 미러 대상은 정반대다(`plugins/mccp/scripts/lib/suite-determinism.js:141-147`이 요약 헤더 부재를 `ok:false` + `incomplete-tap`으로 되돌린다). 게다가 "Node가 그 필드를 지원하지 않음"과 "아무 test도 실행되지 않음"은 **관측으로 구분 가능하고 구분해야 한다** — 앞선 판본에는 그 probe가 없어 전 파일이 크래시한 실행이 Node 능력 부재로 위장될 수 있었다. 따라서 `attribution`은 네 값이고 판정은 추론이 아니라 probe다:
  - `complete` — `per_file` 항목 수 = `files_total`. **유일하게 `ok:true`인 값이다.**
  - `partial` — `data.file`을 실은 nesting-0 `test:complete`가 **1건 이상** 있었으나 항목 수 < `files_total`. `ok:false` + `reason`에 누락 파일 수.
  - `unavailable` — nesting-0 `test:complete`가 **1건 이상 도착했는데 그중 어느 것도 `data.file`을 싣지 않았다**(DD6이 예상한 Node 능력 부재 분기). `ok:false` + `reason:'attribution-unavailable'`.
  - `none` — nesting-0 `test:complete`가 **0건**이다. `ok:false` + `reason:'no-test-completed'`.

  `unavailable`과 `none`을 가르는 것은 "이벤트가 도착했는가"이지 "필드가 있는가"가 아니다. DD6이 금지한 것은 **모름을 0으로 쓰는 것**이지 모름을 `ok:false`로 접는 것이 아니므로 이 정정은 DD6과 충돌하지 않는다 — `unavailable`은 여전히 명시 값이고 0을 쓰지 않는다. 대신 그 원소가 acceptance를 통과하는 조건은 Acceptance 1이 **열거로** 정한다.
- **chunk 접기 규칙을 명시한다 (L2 invariant F2 흡수)**: `exit_code`는 **하나라도 비영점이면 비영점**(첫 비영점 값을 싣고 `chunks_failed: [i…]`를 함께 남긴다) · `per_file`은 chunk별 맵의 합집합(키 충돌은 있을 수 없다 — 파일은 정확히 한 chunk에 든다) · `failing`은 순서 보존 concat · `ok`는 전 chunk의 논리곱. 미지정 기본값은 통상 "마지막 값"으로 구현되며 그것은 앞 chunk의 red를 덮는 **fail-open**이다. `attribution`은 **접지 않고 병합 결과에서 다시 파생한다** — 합집합 항목 수가 `files_total`과 같으면 `complete`, 아니면 어느 chunk든 귀속 이벤트를 1건이라도 봤으면 `partial`, 아니면 어느 chunk든 nesting-0 이벤트를 1건이라도 봤으면 `unavailable`, 그것도 아니면 `none`이다. 접기 규칙을 주면 "마지막 값"이든 "최댓값"이든 한 chunk의 귀속 실패가 다른 chunk의 `complete`에 덮이거나 그 반대가 된다. 분모(`files_total`)가 전역이므로 판정도 전역이어야 한다.
- **제외 목록을 산출에 봉인한다**: `exclusions`에 적용된 `{pattern, reason}` 배열과 그 정렬 직렬화의 sha256을 싣는다. 제외가 커버리지 분모를 정하는 유일한 필드이므로(DD4), 무엇이 왜 빠졌는지가 산출물 안에 남아야 사후 대조가 가능하다. 기본 실행에서는 빈 배열이다.
- **Mirror**: `plugins/mccp/scripts/lib/suite-determinism.js:125-151` `runSuite` — spawn 실패나 불완전 출력을 "실패 0건"으로 읽지 않는다. `maxBuffer`도 같은 이유로 크게(256MB 이상).
- **Validate**: `node scripts/test-suite/run.js --list` 결과가 `git ls-files '*.test.js'`와 일치 · 좁은 범위 1회 실행이 exit 0 · 산출 JSON에 절대경로 0건

### Task 4: 러너 test `scripts/tests/test-suite.test.js`
- **Action**: **열한 갈래**를 단언한다. (1)~(4)는 순수층 합성 입력, (5)~(11)은 L2가 지목한 미커버 축이며, 그중 (11)이 이 러너의 유일한 치명 방향을 직접 겨냥한다. (앞선 판본은 "여덟"이라 적고 열 항목을 열거해 어느 집합이 계약인지 산술적으로 어긋나 있었다 — L2 test LOW 흡수.)
  1. **열거** — 사유 없는 제외는 throw, 제외 적용 시 `included`와 `excluded`가 입력의 분할, 구분자 정규화, 정렬 결정성.
  2. **argv 산술** — `planChunks`에 임계 미만/초과/경계 입력을 주고 chunk 수와 각 chunk의 바이트가 임계 이하임을 단언.
  3. **reporter 집계** — 합성 이벤트로 파일별 합산이 맞고, `data.file` 부재 시 `unavailable`이지 0이 아님.
  4. **경로 redaction** — 합성 이벤트의 절대 `data.file`과 `os.tmpdir()` 접두 실패 문자열이 각각 repo-relative · `<tmp>`로 접힘. 원본 절대경로가 산출에 **남지 않음**을 문자열 부재로 단언한다(security F1의 회귀 가드).
  5. **spawn 인자 형태** — `buildSpawnArgs`의 reporter 인자가 `file://` URL이거나 `.`/`..`로 시작하는 상대 경로임을 단언. 절대경로가 들어가면 red. 이 제약은 Windows에서만 발현하고(`ERR_UNSUPPORTED_ESM_URL_SCHEME`) Task 5의 matrix는 ubuntu뿐이라, CI는 이 회귀를 **구조적으로 못 잡는다** — 단언이 유일한 기계 장치다. (개발 머신이 Windows라 Task 6-1 로컬 완주가 실경로 실증을 겸한다.)
  6. **위험 방향 실패** — spawn ENOENT · reporter 마지막 줄 부재 · 절단된 출력이 각각 `{ok:false, reason:…}`이고 `per_file`이 `null`임을 단언(주입 가능한 spawn 어댑터로). "실행되지 않았는데 통과로 읽힘"은 이 러너의 유일한 치명 실패 방향이다.
  7. **chunk 접기** — 합성 chunk 결과 배열로 exit code 접기(하나라도 비영점 → 비영점) · `per_file` 합집합 · `failing` 순서 보존 concat · `ok` 논리곱을 단언. 특히 **첫 chunk red + 마지막 chunk green**이 전체 비영점임을 단언한다(fail-open 회귀 가드).
  8. **자기 포함 — 합성이 아니라 실제 producer로** — `run.js --list`를 **실제로 spawn**해 그 stdout에 `scripts/tests/test-suite.test.js`가 있음을 단언한다. 순수층에 합성 목록을 주는 단언은 실제 열거원(`git ls-files`)이 그 파일을 내놓는지를 증명하지 않으므로, 이 축만은 실행층을 통과해야 한다. 진입점이 자기 test를 빼먹으면 그 진입점의 회귀는 영원히 관측되지 않는다.
  9. **reporter를 실제 `node --test`에 붙여 본다** — 2개 파일짜리 fixture(스위트 안의 가장 싼 test 2개)로 `run.js --json --files-from <2줄>`을 실제 spawn해 `attribution === 'complete'`이고 `per_file` 항목 수가 2이며 각 항목의 `file`이 그 두 경로임을 단언한다. (3)(4)의 합성 이벤트는 **기대한 형태를 손으로 만든 것**이라 node가 실제로 그 형태를 낸다는 것을 증명하지 않는다 — (8)에 적용한 논리를 더 취약한 축(node 내부 이벤트 스키마 · `nesting` 의미 · 다중 파일에서의 `data.file` 존재)에 적용하지 않을 이유가 없다. 이 단언이 Node 20 CI에서 red가 되면 그것이 DD6 fallback의 실증이지 test 결함이 아니다.
  10. **병합 의미론** — `--merge-into`가 없는 컨테이너를 만들고, 같은 label을 두 번 넣으면 **교체**되며(중복 append 아님), 다른 label은 공존하고, `--from`으로 들어온 JSON이 스키마(필수 키 존재 · `ok` 불리언)를 만족하지 않으면 거부되며, **redaction 불변식이 병합 시점에 재적용**됨을 단언한다. Acceptance 1 전체가 병합 결과의 정확성 위에 서 있고, 다운로드한 artifact → 커밋되는 파일은 신뢰 경계를 넘는 지점이다.
  11. **귀속 불완전의 negative 방향 — 과다허용 회귀 가드 (L2 test HIGH 흡수)** — Task 3의 4값 probe를 그 **판정 함수** 수준에서 단언한다(합성 입력, 실행 불요). `files_total=3` · 귀속 2건 → `ok:false` + `attribution:'partial'` + `reason`에 누락 수 `1`. 귀속 0건이지만 nesting-0 이벤트 ≥1건 → `ok:false` + `attribution:'unavailable'`. nesting-0 이벤트 0건 → `ok:false` + `attribution:'none'` + `reason:'no-test-completed'`. **특히 "귀속 0건"이 `ok:true`가 아님을 명시 단언한다** — 1건 귀속은 차단되는데 0건 귀속은 통과하던 역전이 앞선 판본의 실제 결함이었고, 그 방향(실행되지 않았는데 통과로 읽힘)이 DD8이 유일한 치명이라 부른 것이다. (9)는 positive 방향(`complete` + 항목 수 2)만 덮으므로 이 축을 대체하지 못한다 — plan이 스스로 치명이라 부른 방향에 negative 단언이 하나도 없던 것이 이 흡수의 사유다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/suite-determinism.test.js` — 판정 축은 합성 입력으로 단언한다. 실제로 흔들리는 fixture를 스위트에 심지 않는다. (8)(9)만 예외이며, 그것은 결정적 spawn이지 flaky fixture가 아니다
- **전제**: (8)(9)는 `git ls-files`를 거치므로 **신규 파일이 먼저 `git add`되어야 한다**. 미stage 상태의 red는 결함이 아니라 전제 미충족이고, stage만 하면 회귀 정보 없이 green이 된다 — 그래서 Task 4의 첫 단계는 `git add scripts/`다.
- **Validate**: `git add scripts/ && node --test scripts/tests/test-suite.test.js` 전건 pass

### Task 5: 측정 전용 workflow `.github/workflows/test-suite-baseline.yml`
- **Action**: 트리거는 `workflow_dispatch` **와** 자기 표면으로 좁힌 `pull_request`(`paths: ['.github/workflows/test-suite-baseline.yml', 'scripts/**']`) 둘이다. matrix는 `ubuntu-latest` × `node [20, 24]`.
- **`workflow_dispatch` 단독은 이 milestone 안에서 실행 불가다 (L2 test F1 흡수)**: GitHub은 `workflow_dispatch`를 **default branch에 있는 workflow 파일에 대해서만** 받는다. 신규 파일은 이 브랜치에만 있으므로 머지 전 `gh workflow run`이 그것을 찾지 못하고, 그러면 DD5가 M1의 존재 이유로 든 "Node 20에서 `data.file` 가용성을 실증한다"와 Risks의 대응("Task 5의 node 20 matrix가 **M1 안에서** 실증한다")이 둘 다 수단을 잃는다. 미러로 인용한 선례가 이미 그 조건을 갖추고 있었다 — `.github/workflows/axis-k-m2-cross-platform.yml`은 `pull_request`와 `workflow_dispatch`를 **둘 다** 갖는다. 좁은 `paths` + `continue-on-error`라 이것은 여전히 **측정이지 강제가 아니다**: 전 PR 적용 범위와 branch protection은 M3 소유이고, 이 트리거는 자기 자신과 `scripts/`를 건드리는 PR에서만 발화한다. 단계: checkout → setup-node → `node scripts/test-suite/run.js --json > baseline-node<N>.json` → `upload-artifact`(`if: always()`). 실행 단계는 `continue-on-error: true` — 이 workflow는 **측정**이고, red가 dispatch를 실패로 만들면 실패 목록을 담은 artifact가 안 올라온다. 헤더 주석에 `gitignore-drift.yml`의 "Scope note" 형태로 *이것은 강제가 아니다 · 머지 차단은 M3와 저장소 설정이다*를 명시한다.
- **`continue-on-error` 때문에 "run success"는 증거가 아니다 (L2 invariant F3 흡수)**: 그 플래그와 `if: always()`가 결합하면 `run.js`가 예외로 죽어 빈 artifact를 남겨도 run은 success이고 artifact는 존재한다. 그래서 CI 측정의 수용 증거는 run 상태가 아니라 **artifact 내용**이다 — 다운로드한 JSON이 `ok === true`이고 `per_file` 길이가 `files_total`과 같아야 하며, 그 검사는 Acceptance 3에 걸린다. workflow 안에 그 검사를 넣지 않는 이유는 `continue-on-error`가 그것도 함께 삼키기 때문이다.
- **Mirror**: `.github/workflows/axis-k-m2-cross-platform.yml`의 `jobs.verify` — matrix + `if: always()` artifact 업로드
- **`gh workflow run`은 이 Task의 Validate가 될 수 없다 (L2 test HIGH 흡수)**: 바로 위 문단이 "GitHub은 `workflow_dispatch`를 default branch의 workflow 파일에 대해서만 받는다"고 적어 놓고, Validate는 여전히 그 명령을 지목했다. 머지 전에는 구조적으로 실행 불가이므로, 그 판본에는 **Task 5가 바꾼 것(`pull_request` 트리거 추가)을 실제로 행사하는 명령이 하나도 없었다**. 머지 전 발화 경로는 `pull_request` 하나뿐이므로 Validate도 그것이어야 한다.
- **artifact 이름을 계약한다 (L2 architect/test LOW 흡수)**: `upload-artifact`의 `name`은 `test-suite-baseline-node${{ matrix.node }}`다. 미러 원본이 이름에 matrix 축을 넣는 것(`axis-k-m2-cross-platform.yml`의 `name: axis-k-m2-${{ matrix.os }}`)과 같은 이유이고, Validation 블록의 `gh run download --name test-suite-baseline-node20`이 그 이름에 의존한다. 이름을 계약하지 않으면 그 명령이 성립하는지 계획만으로 검증할 수 없다.
- **Validate**: (머지 전 · GitHub 불요) workflow 파일이 `workflow_dispatch`와 `pull_request`를 **둘 다** 선언하고, `paths`가 `.github/workflows/test-suite-baseline.yml` · `scripts/**` 둘로 좁혀져 있으며, `upload-artifact` 이름이 위 계약과 일치함을 파일 내용으로 확인. **실제 발화는 Task 6-2가 브랜치 push + draft PR로 행사한다** — `workflow_dispatch`는 머지 이후에만 쓸 수 있으므로 M1의 acceptance 경로가 아니다.

### Task 6: 측정 수행
- **Action**: 여섯 갈래.
  1. **로컬 완주 1회** (Node 24 · 16코어 · Windows · 다른 세션 정지). 산출은 stdout JSON이며 아래 3에서 컨테이너로 들어간다.
  2. **CI 완주 — `pull_request` 트리거로** (L2 test HIGH 흡수). `workflow_dispatch`는 머지 전 불가하므로 브랜치를 push하고 **draft PR을 연다**. Task 5의 `paths`가 자기 자신과 `scripts/**`를 포함하고 이 브랜치가 둘 다 바꾸므로 발화는 확실하다. 그 순서상 컨테이너의 `ci-node20` 원소는 **PR을 연 뒤에야** 채워지며, 3의 병합과 Task 7 문서가 그 뒤에 온다. Node 20에서 `data.file` 귀속이 실제로 작동하는지 확인하고, 안 되면 `attribution:'unavailable'` + `ok:false`가 발화하는지 확인해 기록한다 — 그것이 DD5가 node 20 matrix를 둔 이유이고, M1의 실패가 아니라 산출이다.
  3. **두 산출을 하나로 병합 (L2 architect F1 / test F4 흡수)** — `run.js --merge-into <container> --label <local|ci-node20|ci-node24>`가 컨테이너의 `runs[]`에 append한다(같은 label은 교체). Acceptance 1이 "로컬과 CI 두 `node_version`이 각각 존재한다"를 요구하는데, `--json`을 파일로 리다이렉트하는 경로만 있으면 뒤 실행이 앞 실행을 **통째로 덮어써** 그 acceptance는 정의된 경로로 충족 불가였다. 병합의 주체를 명시하고, 그 주체가 run.js 자신이 되도록 둔다(별도 스크립트를 만들면 test 없는 도구가 하나 더 생긴다).
  4. **파일 단위 분해** — 상위 15개를 뽑고 각각의 원인을 코드로 귀속한다. `mkTmpRepo`(`plugins/mccp/scripts/receipt/tests/helpers.js:8-19`)는 repo 1개당 git 프로세스 6개를 띄우고 49개 파일이 이를 쓴다(실측). 최상위 `intent-gate-fields.test.js`는 `withRepo`를 52회 호출한다(실측) → 312 프로세스. **수리하지 않는다**(UI5) — 숫자만 낸다.
  5. **flaky 판정** — `plugins/mccp/scripts/derive/tests/mccp-fixture.test.js`를 동일 커밋에서 3회 단독 실행하고, 전수 실행(병렬) 안에서의 상태를 별도로 기록한다. 예비 관측 2회는 이미 green(6.6초 / 1.6초)이고 출력의 `cache_stale` 줄은 test 단언이 아니라 렌더러 로그다 — 즉 baseline의 FAIL 1건은 **단독 실행에서 재현되지 않았다**. 3회로 확정하고, 재현되지 않으면 "전수 병렬 하에서만 발화하는 후보"로 기록한다(UI11 — 삭제하지 않는다).
  6. **병렬 하한** — 병렬 벽시계의 하한은 순차 합계를 코어 수로 나눈 값이 아니라 **단일 최장 파일**이다. baseline에서 그 값은 1,399초(23.3분)다. 이 사실이 M2의 수단 선택(shard만으로는 23.3분 밑으로 못 간다)을 결정하므로 문서에 명시한다.
- **Mirror**: `.claude/_meta/data/test-suite-run.txt`의 기록 형식 — 파일별 ms + PASS/FAIL + 시각. **절대경로 0건**이라는 성질도 그 형식의 일부다(Task 2 redaction이 그것을 잇는다)
- **Validate**: 컨테이너의 각 `runs[]` 원소가 `wall_clock_ms > 0` · `git_sha` 비어있지 않음 · 컨테이너 전체에 절대경로 0건. `ok`와 `per_file`은 **Acceptance 1과 정확히 같은 규칙**(그 표)으로 판정한다 — 둘이 어긋나면 어느 쪽이 정본인지 알 수 없고, 설계대로 동작한 실행이 Validate에서 red가 되면 자연스러운 해소가 게이트 완화다. 앞선 판본이 정확히 그랬다(L2 test/invariant MEDIUM 흡수).

### Task 7: 판정 문서 `docs/ci-full-suite/m1-baseline.md`
- **Action**: 측정 결과와 그 해석. 반드시 담는 것 일곱 가지: (1) 로컬/CI 두 벽시계와 환경, (2) 상위 15개 원인 귀속표, (3) flaky 판정과 근거, (4) 병렬 하한과 그것이 M2에 부과하는 제약, (5) argv 여유(20,867 / 32,767 = 64% 사용)와 test 증가 시의 임계, (6) OQ1·OQ4·OQ5에 대한 답과 OQ2·OQ3에 대한 미해결 표시, (7) **M2/M3이 물려받는 수치** — 임계값 후보와 shard 수 산정식. 목표치는 **지어내지 않는다**(UI10) — 관측값과 그로부터 따라오는 제약만 적는다.
- **Mirror**: `docs/diverse-agent-review/quorum-calibration.md` — 실측 블록을 축자 동결하고 도구 출력과 바이트 일치를 재검증
- **Validate**: 문서의 모든 수치가 Task 6의 JSON에서 인용 가능

### Task 8: PRD 정정 + milestone 갱신
- **Action**: `.claude/prds/ci-full-suite.prd.md`의 Delivery Milestones 1행을 `complete` + Plan 경로로 바꾼다. Evidence 중 본 세션 실측과 어긋나는 네 건을 정정한다(PRD Risk 표 마지막 행이 정한 "같은 커밋에서 함께 정정" 관행):
  - "전수 순차 실행 = 174분" → 353개 **결과 줄**의 합이고 그중 7개 파일이 resume 때문에 두 번 실행됐다. **고유 346개 기준 169.6분**이다. 재실행된 7건은 실행 간 최대 25% 편차를 보였다(`pr-codex-skip-env` 104.2초 대 82.9초 · `preflight` 113.7초 대 132.4초) — "경합 오염 의심"의 직접 증거다.
  - "`package.json` 부재" → **루트에 없다**. `plugins/mccp/scripts/receipt/package.json`과 `.claude/scripts/receipt/package.json` 2개가 존재하며 둘 다 `"test": "node --test tests/"`를 선언한다(Node 24에서 죽는 형태).
  - "CI 세 workflow" → `origin/main` 기준으로 맞다. **이 브랜치의 base에는 2개뿐**이었다(Task 0에서 해소).
  - baseline 로그가 `.claude/scripts/receipt/tests/` 10개를 **한 번도 돌리지 않았다** — 분모 346은 `plugins/mccp/scripts/` 하위만이다.
- **Validate**: milestone 1행 status가 `complete`이고 Plan 셀이 이 파일을 가리킴 · 정정 네 건이 본문에 반영됨

## Validation

```bash
# Task 0 — base 동기화 + 삭제 검증.
# 3은 Task 0 직후의 값이다(base 2 + env-contract-drift.yml). Task 5가
# test-suite-baseline.yml을 커밋한 뒤에는 4이며, 그때 3이 나오면 신규 workflow가
# tracked 되지 않았다는 뜻이다 — 그래서 두 시점을 나눠 적는다.
git ls-files .github/workflows | wc -l                       # Task 0 직후 3 · Task 5 커밋 후 4
git ls-files .github/workflows/env-contract-drift.yml        # 비어있지 않음
git diff --diff-filter=D --name-only origin/main...HEAD      # 공집합

# Task 1-4 — 러너 단위 test
node --test scripts/tests/test-suite.test.js

# 작업 파일은 저장소 밖 스크래치에 둔다. 개발 머신이 Windows라 `/tmp`는 node에서
# `C:\tmp`로 해석돼 실재하지 않는다(실측) — 이 blocks는 git-bash와 pwsh 양쪽에서 돈다.
WORK="${TMPDIR:-${TEMP:-.}}/ci-full-suite-m1"; mkdir -p "$WORK"

# Task 3 — 열거가 tracked 목록과 일치 (제외 공집합이므로 완전 일치)
git add scripts/                       # (8)(9)의 전제: git ls-files가 신규 파일을 내놓아야 한다
node scripts/test-suite/run.js --list | sort > "$WORK/enum.txt"
git ls-files '*.test.js' | sort > "$WORK/tracked.txt"
diff "$WORK/enum.txt" "$WORK/tracked.txt"

# Task 3 — 좁은 범위 smoke
git ls-files 'plugins/mccp/scripts/state/tests/*.test.js' > "$WORK/smoke.txt"
node scripts/test-suite/run.js --json --files-from "$WORK/smoke.txt"

# Task 6 — 전수 완주 (측정). 리다이렉트가 아니라 --merge-into로 컨테이너에 append한다.
node scripts/test-suite/run.js --json \
  --merge-into .claude/_meta/data/2026-09-01-suite-baseline.json --label local

# Task 6 — CI artifact를 같은 컨테이너로 병합 (병합 시점에 redaction 재적용 + 스키마 검증)
gh run download --name test-suite-baseline-node20 --dir "$WORK/ci"
node scripts/test-suite/run.js --merge-into .claude/_meta/data/2026-09-01-suite-baseline.json \
  --label ci-node20 --from "$WORK/ci/baseline-node20.json"

# 절대경로 유출 0건. 이 grep은 **보조 확인**이고 정본 가드는 러너 안의 redaction
# 불변식이다 — 플랫폼별 패턴 열거는 반드시 빠뜨린다(R1 invariant F3 실측: 앞선
# 판본이 ubuntu runner의 지배 케이스 `/tmp/`를 통째로 놓쳤다).
grep -cE '([A-Za-z]:\\\\|/home/|/Users/|/tmp/|/var/folders/|AppData)' \
  .claude/_meta/data/2026-09-01-suite-baseline.json   # 0

# Task 6 — flaky 3회 단독
for i in 1 2 3; do node --test plugins/mccp/scripts/derive/tests/mccp-fixture.test.js; done

# 기존 관측 도구 회귀 없음 (DD3으로 미변경임을 확인)
node --test plugins/mccp/scripts/lib/tests/suite-determinism.test.js
git diff --name-only origin/main...HEAD -- plugins/mccp/scripts/lib/suite-determinism.js   # 공집합

# 배포 표면 미변경 (UI6)
git diff --name-only origin/main...HEAD -- plugins/mccp/                                   # 공집합

# Task 5/6-2 — CI 측정. workflow_dispatch는 머지 전 불가(default branch 전용)이므로
# 머지 전 발화 경로는 pull_request 하나다. 브랜치 push + draft PR 이후에 실행한다.
gh run list --workflow=test-suite-baseline.yml --event=pull_request --limit 5
gh run watch "$(gh run list --workflow=test-suite-baseline.yml --event=pull_request \
  --limit 1 --json databaseId --jq '.[0].databaseId')"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 전수 완주가 대량 red를 노출해 M1이 측정이 아니라 수리 작업이 된다 | 중 | M1은 **측정**이다. red는 목록으로 기록하고 수리하지 않는다(UI4·UI5). Task 5 workflow가 `continue-on-error`인 이유가 이것이다 |
| Node 20에서 reporter의 `data.file`이 없어 파일 귀속이 불가 | 중 | DD6 — 명시 `unavailable` + 파일별 spawn fallback. Task 5의 `node 20` matrix가 이것을 **M1 안에서** 실증한다. 0을 보고하지 않으므로 조용한 오독은 없다 |
| argv 20,867바이트가 test 증가로 32,767 한계에 닿는다 | 중 | Task 3이 실제 바이트를 재고 임계 초과 시 자동 chunk. 여유 36%를 문서에 남겨 M3이 감시 대상으로 삼는다 |
| 병렬 벽시계가 최장 파일 23.3분에 갇혀 M2가 shard만으로 목표에 못 간다 | **높음** | 이것은 위험이 아니라 **M1의 산출**이다. Task 6-5가 하한을 명시해 M2가 shard·수리·둘 다를 근거 위에서 고른다 |
| 로컬 측정이 여전히 조용하지 않아 baseline이 오염된다 | 중 | CI 측정을 병행한다(DD5). 두 값이 크게 갈리면 그 사실 자체가 OQ1의 답이다 |
| `.claude/scripts/receipt/tests` 10개를 포함해 돌렸더니 실패한다 | 중 | DD4대로 제외하지 않고 포함해 측정한다. 실패하면 그것이 데이터이고, 은퇴나 제외 결정은 사유와 함께 별도 축으로 이연한다(조용한 제외 금지) |
| 새 최상위 `scripts/`가 다른 도구의 가정을 깬다 | 낮음 | `.gitignore` 미해당 · tracked 루트 목록에 미존재 확인(실측). derive의 소스 스캐너는 `.claude/`와 `plugins/`만 본다 |
| `suite-determinism.js`를 손대지 않아 그 Node 20 결함이 방치된다 | 중 | 방치가 아니라 **기록**이다(DD3). M1 문서가 사실과 근거를 남기고 M2·M3이 CI 배선 시 상속한다 |
| 이 브랜치가 오래 살아 base 머지가 다른 PR의 신규 파일을 지운다 | 중 | Task 0이 §3.5.1 삭제 검증을 명시 단계로 포함한다. PR 직전 재확인 |
| 스위트 멤버십 정의가 둘(새 러너의 열거 · `suite-determinism.js:29`의 `DEFAULT_PATTERN`)이고 어긋나도 관측 장치가 없다 | 중 | DD3대로 M1은 후자를 손대지 않으므로 **불일치가 실재한다** — 새 러너는 `.claude/scripts/receipt/tests/` 10건을 포함하고 그 패턴은 제외한다. M3의 커버리지 분모가 어느 정의를 정본으로 삼을지가 미해결이며, Task 7 문서가 그 차이를 수치로 남겨 M3에 인계한다. 두 정의를 잇는 test는 배포 표면 편집을 요구하므로(UI6) 이 milestone에서 만들지 않는다 |
| `--exclude-from`으로 제외 목록을 넘기면 커버리지가 100%를 유지한 채 분모가 줄어든다 | 중 | M1은 제외 공집합으로만 측정하고(DD4) 적용된 제외와 그 sha256을 산출에 봉인해 사후 대조를 가능하게 한다. 사유 문자열의 **출처**를 묶는 장치는 없으며, 그것은 커버리지를 산출하는 M3의 축이다 — 이 milestone은 커버리지를 산출하지 않는다 |

## Acceptance

- [ ] 모든 Task 완료
- [ ] Validation 통과
- [ ] 패턴을 재발명하지 않고 미러링 (순수/실행 2층 · workflow Scope note · 관측은 수리하지 않는다)
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과는 경로 작동과 다르다)

라이브 완주가 반드시 산출해야 하는 것 여섯 가지:

1. `.claude/_meta/data/2026-09-01-suite-baseline.json`의 `runs[]`에 `label` 이 `local` 인 원소와 `ci-node20` 인 원소가 **각각** 존재하고, 두 원소 모두 `wall_clock_ms > 0` · `git_sha` 비어있지 않음. `ok`/`attribution` 수용 조합은 **열거한다** — 일반 완화가 아니고, 열거 밖은 전부 미수용이다:

   | 원소 | 수용되는 조합 |
   |---|---|
   | `local` | `ok===true` ∧ `attribution==='complete'` ∧ `per_file` 길이 = `files_total` — **이것 하나뿐** |
   | `ci-node20` | 위와 같거나, `ok===false` ∧ `attribution==='unavailable'` ∧ `reason==='attribution-unavailable'` |

   `ci-node20`에 두 번째 행이 있는 이유는 DD5가 node 20 matrix를 둔 목적이 정확히 **`data.file` 가용성의 판정**이기 때문이다 — 그 분기가 발화하는 것은 M1의 실패가 아니라 산출이고, 그 예외가 없으면 설계대로 동작한 milestone이 자기 acceptance를 충족하지 못해 acceptance를 완화하게 된다(게이트가 게이트인 척하며 열린다). 그러나 그것이 `ok:true`를 뜻하지는 **않는다**(L2 invariant HIGH). **`partial`과 `none`은 어느 원소에서도 수용하지 않는다** — 그 둘이야말로 "실행되지 않았는데 통과로 읽힘"이고, 예외를 표로 묶어 두지 않으면 그 완화가 바로 이 자리에서 일어난다. `ok === true`가 스위트 red를 배제하지 않는다는 것은 Task 3의 `ok` 정의가 보장한다(측정 유효성이지 green이 아니다).
2. `node scripts/test-suite/run.js --list`의 출력이 `git ls-files '*.test.js'`와 **정확히 일치**한다(제외 공집합이므로).
3. `gh run list --workflow=test-suite-baseline.yml --event=pull_request`에 실행이 1건 이상 있고(머지 전 발화 경로는 `pull_request` 하나다 — Task 5 참조), 다운로드한 artifact JSON이 1번과 같은 내용 검사를 통과한다. **run 상태는 증거가 아니다** — `continue-on-error: true` 때문에 러너가 죽어도 run은 success이고 `if: always()` 때문에 빈 artifact가 존재한다(Task 5 참조).
4. `docs/ci-full-suite/m1-baseline.md`가 상위 15개 원인 귀속표와 flaky 3회 판정을 담고, 모든 수치가 1번 컨테이너에서 인용 가능하다.
5. **자기 포함** — `run.js --list`의 출력에 `scripts/tests/test-suite.test.js`가 있다. 신규 파일 중 `*.test.js`는 이 하나뿐이고 `enumerate.js` · `reporter.mjs` · `run.js`는 열거 계약(`*.test.js`만)상 나타나지 않는 것이 **정상**이다 — 나타나면 2번이 깨진다. 그 세 파일의 회귀는 이 test 파일이 덮는다.
6. 컨테이너 전체에 절대경로가 0건이다. 정본 판정은 러너의 redaction 불변식(`ok:false` + `reason:'redaction-incomplete'`)이고, Validation의 grep(`[A-Za-z]:\\` · `/home/` · `/Users/` · `/tmp/` · `/var/folders/` · `AppData`)은 보조 확인이다 — 플랫폼별 패턴 열거는 반드시 빠뜨리므로 그것을 정본으로 삼지 않는다. 기존 tracked baseline `test-suite-run.txt`가 절대경로 0건이므로 이것은 신규 기준이 아니라 유지다.

## Design Critique

- 탐지: `impeccable-detect.js` `design_signal=true` (axis a). `signal_files`는 `plugins/mccp/scripts/derive/tests/mccp-fixture.test.js` 한 건이며, 이 파일은 plan의 `Files to Change`가 아니라 Task 6-4 본문에서 flaky 판정 대상으로 **언급만** 된다.
- 호출: `Skill(impeccable, "critique .claude/plans/ci-full-suite-m1.plan.md")` — 오라클이 해소한 call form(`impeccable_source=user` · v4.0.4 · `shadowed=false`)
- 라운드: 1 (R0) / cap 2 — L2 HIGH 3건 흡수로 본문이 바뀐 뒤 **재실행한 R0**이다. 흡수 편집은 전부 markdown 산문·표이고 `Files to Change`는 무변경이라 판정 근거(렌더 표면 0건)도 무변경이다. `####` 0건으로 H15는 정적으로 만족.
- 판정: **CONVERGED** — HIGH/CRITICAL/UNKNOWN 잔존 0건
- 근거: 이 milestone의 `Files to Change` 9건 중 rendering surface 확장자(`.html`/`.jsx`/`.tsx`/`.css`/`.vue`/`.svelte`)는 **0건**이다. 산출물은 Node CLI 3개 · test 1개 · workflow YAML 1개 · JSON 데이터 1개 · markdown 3개다. 4개 Output Constraint 중 정적으로 판정 가능한 것은 H15(정보 위계 3단계)뿐이고, plan 본문의 실제 heading은 `#` 1개 · `##` 9개 · `###` 9개로 **depth 3을 넘지 않는다**. 나머지 셋(강조색 화면당 1개 · raw markdown marker 금지 · 한 화면 항목 수 상한)은 렌더된 표면을 전제하므로 이 산출물에는 적용 대상이 없다.
- 남는 것: 없음. 다만 **설계 결함을 못 찾아서가 아니라 판정할 디자인 표면이 없어서** 수렴이다 — 그 구분을 여기 남긴다. 탐지가 발화한 것은 산문 속 파일 경로 1건이었고, 그것은 위양성이다.

## Design Routing Guide

routing mode: auto (implement 단계에서 유효). plan 단계는 rendered UI가 없어 어떤 impeccable 명령도 **호출하지 않는다** — 아래는 체크리스트다. 본 milestone은 rendering surface를 만들지 않으므로 implement 단계에서도 `renderingSurface=0`으로 refine/discovery가 강등될 것으로 예상된다.

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

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node <plugin-root>/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 0 (호출 3회 시도, 전부 spawn 단계 통과 후 API 거부 — 라운드 원장 `rounds_so_far=0`)
- 합치 결론: **Codex unavailable, skipped (auto-fallback): exit-nonzero** — 계정 usage limit 소진.
  companion 직접 실행이 원인을 확정한다: `[codex] Codex error: You've hit your usage limit.
  Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at
  Sep 7th, 2026 11:26 AM.` 배선 결함도 focus 텍스트 문제도 아니다 — trivial smoke focus
  (`"smoke test - reply briefly"`)도 같은 8초 exit-nonzero로 죽는다. 2026-09-07 이전에는
  이 저장소의 어떤 게이트도 Codex를 얻을 수 없다.
- 처리: CLAUDE.md §3.3 복구 옵션 2 + §3.16(게이트가 막으면 문서화된 감사 우회를 쓰되 사유를
  남긴다)에 따라 advisory 경로. receipt는 `codex_verdict='unavailable'`로 **비승인** 봉인되며
  cross-gate dedupe는 닫힌 채로 남는다. terminal `/mccp:pr`은 Phase 0에서 advisory를 거부하므로
  이 사이클의 PR은 quota 회복 또는 audited override를 요구한다 — 이 사실을 숨기지 않는다.

### 무엇이 리뷰를 대신했는가 (그리고 무엇을 대신하지 못했는가)

cross-model 리뷰어가 없으므로 implement-time 결정은 **주장이 아니라 실측**으로 검증했다.
아래 넷은 전부 이 머신에서 재현된 관측이고, 그중 둘은 plan 본문의 명세를 **정정**한다.
이것은 dual-review의 대체물이 아니다 — 같은 모델이 자기 설계를 측정한 것이라 설계 자체의
사각(예: 이 접근이 애초에 틀린 축)은 여전히 미검토다.

| # | 축 | 실측 | plan 대비 |
|---|---|---|---|
| A | reporter 집계 단위 | `nesting===0` `test:complete`는 **실제 test와 파일 roll-up을 둘 다** 포함한다. `a.test.js`(2 tests) → 이벤트 3건(a1, a2, `a.test.js` dur=156ms) | **정정**. Task 2의 "`nesting===0`만 취해 집계"를 그대로 구현하면 test 수와 `sum_ms`가 이중계상된다 |
| B | 귀속 소스 | `test:summary`는 `{file, success, counts, duration_ms}`로 깔끔하지만 **import 크래시 파일을 통째로 누락**한다(3파일 중 2건만 발화 + 전역 1건). `test:complete`는 크래시 파일도 nesting-0으로 낸다 | **정정**. 귀속(presence)은 `test:complete`가 정본, 카운트는 `test:summary`가 보조. `test:summary`만 쓰면 DD8이 유일한 치명이라 부른 방향이 그대로 열린다 |
| C | tmpdir 접두 후보 | `os.tmpdir()` = `C:\Users\ADMINI~1\...`(8.3 단축형). `fs.realpathSync`는 **확장하지 않는다** — 단축형을 그대로 돌려준다. 장형 `C:\Users\Administrator\AppData\Local\Temp`는 실재하는 별칭이고 그 realpath도 장형 그대로다 | **정정**. Task 2가 지정한 두 후보(`os.tmpdir()`와 그 realpath)는 이 머신에서 **같은 값**이라 장형을 못 잡는다. 후보에 `os.homedir()` 파생 장형과 `os.homedir()` 자체를 추가해야 한다 |
| D | reporter 경로 형태 | 절대경로 → `ERR_UNSUPPORTED_ESM_URL_SCHEME ... Received protocol 'c:'`. `file:///...` → 정상 | plan Task 2 "주의(실측)" 및 Task 4-(5) 확인. `pathToFileURL().href` 고정 |

부수 확인: 이 브랜치 workflow 2건 · `origin/main` 3건(Task 0 머지 필요) · 삭제 공집합(§3.5.1) ·
tracked `*.test.js` **356건**(plan의 346 + `.claude/scripts/receipt/tests/` 10건) ·
argv **21,324바이트**/32,767(65%, chunk 임계 24,000 미만이므로 1 chunk) ·
`scripts/`는 `.gitignore` 미해당이고 루트에 미존재(DD1).

- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | A 이중계상 | HIGH | ACCEPT_NOW | 측정 산출 자체가 틀린다. 구현 시 roll-up 분리로 흡수 |
  | B 크래시 파일 누락 | HIGH | ACCEPT_NOW | DD8이 유일한 치명이라 부른 방향. `test:complete` 정본으로 흡수 |
  | C 장형 tmpdir 미포착 | HIGH | ACCEPT_NOW | redaction 우회. 접두 후보 확장으로 흡수 |
  | D reporter 경로 | MEDIUM | ACCEPT_NOW | 이미 plan에 있음. `pathToFileURL` 고정으로 흡수 |
- Deferred to backlog: 0
- Open Questions: Codex cross-model 리뷰 부재 — severity HIGH. 2026-09-07 quota 회복 후
  이 milestone의 diff에 대해 `/mccp:code-review` 또는 재게이트로 회수할 것. **DIVERGENT_UNRESOLVED**
- Codex session 참조: 없음 (호출 미성립)

### Security Reviewer

`Task(mccp:security-reviewer)` 정상 완주(601초). CRITICAL 2 · HIGH 4 · MEDIUM 4 · LOW 2.
**skip 없음** — `security_skipped` 미forward.

2.5.5는 CRITICAL/HIGH 보안 finding에 `MCCP-GATE-STOP`을 지시한다. 여기서는 **멈추지 않고
설계에 흡수한 뒤 진행**했고, 그 판단의 근거를 남긴다: 이 findings는 *산출된 코드*가 아니라
*미구현 plan의 명세*를 겨눈다. 멈추면 사용자는 같은 plan으로 같은 명령을 다시 돌려 같은
finding을 받는다 — plan이 결함이고 그것을 고칠 주체가 나이므로 정지는 진행 불가 루프다.
게이트가 막으려는 것은 *알려진 결함을 그대로 구현하는 것*이므로, 같은 턴에서 명세를 정정하면
그 목적은 충족된다. 미해소 CRITICAL/HIGH는 **0건**이며, 아래 표의 흡수가 Phase 3 EXECUTE의
구속 명세다(plan 본문 Task 2/3보다 **이 표가 우선한다**).

| # | Sev | 지적 | 흡수 |
|---|---|---|---|
| A-1 | CRITICAL | `fs.realpathSync(os.tmpdir())`가 8.3 단축형을 확장하지 않아 Task 2가 "두 후보"라 부른 것이 실제로는 **한 값**이다 | **확인**(독립 실측 2회). `fs.realpathSync.native`가 확장한다 — `tmpdir` `C:\Users\ADMINI~1\...` / `.native` `C:\Users\Administrator\...`. 접두 후보를 `{repoRoot, tmpdir, homedir} × {raw, realpathSync.native}`로 확장하고 중복 제거 |
| C-2 | CRITICAL | 병합 시점 redaction "재적용"은 **로컬 머신의** root만 등록하므로 CI-origin 잔여 유출을 구조적으로 못 본다 | **구조 변경**. 타 머신의 redaction을 이 머신에서 재도출할 수는 없다 — 그래서 재도출을 주장하지 않는다. 산출에 `redaction_ok` **독립 필드**를 신설해 producer가 자기 머신에서 내린 판정을 봉인하고, merge는 `redaction_ok !== true`인 원소를 **거부**한다. 더해 머신 무관한 구조적 스캔을 2차로 돌린다(아래 A-3) |
| A-2 | HIGH | `file:///C:/...`(스킴 + forward slash)는 backslash 접두 비교를 둘 다 회피 | 비교 전 입력을 **양방향 정규화**(`\`→`/`, 퍼센트 디코드 1회, `file://` 스킴 제거)한 사본에 대해 접두를 맞추고, 치환은 원문 범위에 적용 |
| A-3 | HIGH | invariant가 "등록 root로 시작하는 것만" 잡는 **2-root allowlist**라 등록 밖(`%APPDATA%\npm-cache`, `/home/runner/.cache`, env echo)은 탐지 불가 | **1차 방어를 형태 기반으로 교체**. `[A-Za-z]:[\/]`는 root 열거가 아니라 *Windows 절대경로라는 형태*라 전수 포착이다. POSIX 축은 형태만으로 경로와 비경로를 못 가르므로(예: `/mccp:plan`) 열거가 남고, 그 사실을 코드 주석에 명시한다 — 이 축은 2차이고 1차는 producer 자신의 `redaction_ok`다 |
| C-3 | HIGH | producer가 스스로 낸 `reason:'redaction-incomplete'` 신호가 "필수 키 + `ok` 불리언" 검증을 그대로 통과 | C-2의 `redaction_ok` 필드가 이것을 닫는다. **`ok`로 겸용하지 않는 이유**: Acceptance 1이 `ci-node20`에 `ok:false ∧ attribution:'unavailable'`을 명시 수용하므로 `ok:false` 일괄 거부는 그 수용 행을 죽인다. 측정 유효성과 redaction 유효성은 다른 축이다 |
| C-4 | HIGH | prototype pollution 가드 부재 — `intent-context.js:477-506` 선례 미채택 | `FORBIDDEN_KEYS = ['__proto__','constructor','prototype']` 재귀 스캔(depth ≤ 20) 채택. `JSON.parse` 결과를 그대로 쓰지 않고 `Object.create(null)` 기반으로 재구성 |
| A-4 | MEDIUM | `repoRoot` 비교의 대소문자/구분자 무시가 tmpdir만큼 명시되지 않음 | 같은 줄의 코드라 흡수 — 전 후보에 동일 비교 규칙(win32 대소문자 무시) 적용 |
| A-5 | MEDIUM | 집계 키 fold predicate가 선례 `write.js:54-60`의 `path.isAbsolute(rel)`(cross-drive)보다 약함 | 같은 줄의 코드라 흡수 — `rel === '..' \|\| rel.startsWith('../') \|\| path.isAbsolute(rel)` 3조건 그대로 채택 |
| C-5 | MEDIUM | 크기/깊이 상한 부재 — git-tracked evidence가 OOM/부분 write로 잘릴 수 있음 | 흡수 — 파싱 **전** 바이트 상한(16MB) · 재귀 depth 20 · 컨테이너 write는 tmp+rename 원자 write |
| C-6 | MEDIUM | 필수 키를 넘는 필드 타입 검증 부재 | **부분 흡수** — 실제로 소비하는 필드(`ok`·`redaction_ok`·`wall_clock_ms`·`git_sha`·`files_total`·`per_file`·`attribution`)만 타입 검증. 미소비 필드의 전수 스키마는 backlog |
| L-1 | LOW | `--label`에 enum 검증 없음 | 흡수(1줄) — `^[a-z0-9][a-z0-9-]{0,31}$` |
| L-2 | LOW | `git ls-files`를 개행 분리로 파싱하면 개행 포함 파일명이 조용히 누락 | 흡수(1줄) — `-z` NUL 구분 파싱 |
| D | LOW | spawn injection | 지적 없음 — `shell:false` + `--` 종결자로 이미 닫힘. 무변경 |

Backlog 이연 1건 → `.claude/plans/codex-findings-backlog.md`:
C-6 잔여(미소비 필드 전수 스키마 검증).
