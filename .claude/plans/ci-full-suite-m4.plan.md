# Plan: ci-full-suite M4 — enforcement-live-closure

**Source PRD**: `.claude/prds/ci-full-suite.prd.md`
**Selected Milestone**: 4 — enforcement-live-closure (신규 · PRD에 추가되는 단 하나의 행)
**Complexity**: Medium

## Summary

M3은 게이트를 만들었고 라이브에서 세 번 발화했다 — 한 번은 막았고(옳게), 두 번은 green으로
완주했다. 그러나 **그 게이트에는 아직 차단력이 없다**: `main`은 `protected:false`이고 PR
#185 자신이 green 게이트를 지나 머지됐다. 축 D(막아야 할 것을 막는다)는 CI에서 실증되지
않았고, OQ3의 Windows 측정과 격리 6건의 정당성을 판정할 Linux 재측정은 둘 다 수행되지 않았다.
M4는 그 넷을 닫는다 — **새 기계를 만들지 않고 이미 만든 기계를 실제로 부른다.** 오라클 심층
방어는 milestone이 아니라 backlog로 간다(2중 리뷰 J1 판정).

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 개선 계획의 대상은 backlog · fix-task · open questions · 의도대로 동작하지 않는 기능이다 | direction |
| UI2 | PRD에 마일스톤을 추가한다 | direction |
| UI3 | AskUserQuestion을 열지 않는다 | exclusion |
| UI4 | 사용자 판단이 필요한 항목은 fable과 codex를 workflow로 여는 2중 리뷰로 대신한다 | constraint |
| UI5 | 기능이 의도대로 동작하는지는 추정이 아니라 실측으로 판정한다 | constraint |
| UI6 | test를 새로 쓰지 않는다 — 있는 것을 돌리는 것만 한다 | exclusion |
| UI7 | 배포 표면을 바꾸지 않는다 — `.github/`는 배포 밖이고 plugin.json version은 선언하지 않는다 | exclusion |
| UI8 | branch protection 정책 설계는 하지 않는다 — 설정 1회만 축에 든다 | exclusion |

## UI6 충돌 판정 — 명시 override (2026-09-08)

**UI6("test를 새로 쓰지 않는다 — 있는 것을 돌리는 것만 한다")와 Task 1·2가 정면 충돌한다.**
Task 1 은 `scripts/tests/wiring-cut.test.js` 에 신규 분기 넷을, Task 2 는 spawn seam 단언과
다섯 fixture 를 요구한다. 섀도 3라운드가 이 충돌을 **미판정 상태**로 반복 지적했고, 미판정을
유지하는 것은 은폐다. 그래서 판정을 여기 적는다.

**판정: UI6 를 이 두 Task 에 한해 override 한다.** 근거는 UI6 자신의 목적이다 — 그 조항이
막으려던 것은 *격리된 6건을 수리하려고 test 를 새로 쓰는 것*이고(Task 5 의 J4 합치가 그
독법을 확인한다), Task 1·2 가 요구하는 것은 **이 계획이 바꾸는 코드의 반증 수단**이다.
후자를 금지하면 계획의 두 코드 Task 는 반증 불가가 되고, 그것은 UI5("추정이 아니라 실측")와
직접 충돌한다. 즉 UI6 를 문자 그대로 적용하면 같은 사용자의 다른 제약을 깬다.

**범위는 좁힌다**: 신규 test 는 `scripts/tests/wiring-cut.test.js` 와
`scripts/tests/ci-required-checks.test.js` **두 파일의 분기 추가**뿐이다. 새 test 파일을
만들지 않고, 격리 6건은 여전히 수리하지 않는다(J4 무변경). 판정자(`## Validation` 오라클)도
새 파일이 아니라 그 블록 안의 heredoc 으로 생성돼 tracked 파일을 늘리지 않는다.

**운영자가 이 판정을 뒤집으면** Task 1·2 의 Validate 는 "exit≠0" 수준으로 되돌아가고, 그때
두 Task 는 §3.14 기준의 반증 수단을 갖지 못한 채 ship 된다 — 그 사실을 이탈로 기록해야 한다.

## 2중 리뷰 판정 (fable × codex) — UI4가 요구한 사용자 판단 대체

운영자 판단이 필요한 6건을 두 모델에 독립으로 물었다. 질문지는
`.claude/cache/m4-judgment-questions.md`, codex는 `classification=ok` ·
`verdict=needs-attention` · finding 2건(HIGH 1 · MEDIUM 1), fable은 구조화 응답 6건 + RISK 1건.

| # | 질문 | fable | codex | 판정 |
|---|---|---|---|---|
| J1 | 마일스톤 하나 대 둘 | **C** — M4 단독, 하드닝은 backlog | **B** — M4 + M5 | **C** (아래 근거) |
| J2 | credential 하드닝을 M4에 넣는가 | **B** | **B** | **B — 합치** |
| J3 | protection이 축 D보다 앞인가 | **B** (앞) | **A** (뒤) | **합성** (아래) |
| J4 | 잔존 red를 M4가 수리하는가 | **A** (안 한다) | **A** | **A — 합치** |
| J5 | 버리는 PR이 옳은가 | **A** + 증거 tracked 커밋 | **A** | **A + fable 보강** |
| J6 | 문서-반올림 위험을 무엇이 막는가 | Acceptance를 `## Validation`의 fail-closed `gh` 단언으로 | 활성화 후 실제 머지 차단 증거 요구 | **둘 다 흡수 — 수렴** |

**J1 → C.** 둘 다 "라이브 회수와 오라클 하드닝을 분리하라"에 동의했고 *어디에 두는가*만
갈렸다. fable의 근거가 이 저장소의 기계에 결속돼 있어 채택한다: 초안의 M5 항목들은 그
근거를 스스로 "오늘 발현하지 않는다"라 적었고, 그러면 그 행의 Acceptance는 **오늘 측정
불가**다. §3.11 C2에 따라 PRD 아카이브는 전 milestone 완료를 요구하므로, 측정 불가한
Acceptance를 가진 행은 PRD를 무기한 열어 두는 backlog 대용물이 된다. 하드닝은
`codex-findings-backlog.md`에 **ci-full-suite 귀속 + 발현 조건**과 함께 적재한다.

**J2 → B (합치).** 초안의 "protection이 유인을 만든다"는 논증이 틀렸다. protection이
만드는 유인은 *체크를 green으로 조작하는 것*(DD4)이지 credential 유출이 아니고, 그 job은
`contents: read`(`.github/workflows/test-suite.yml L63`) · secrets 미주입 · `persist-credentials: false`라
러너에 흘릴 credential 자체가 없다. 더 결정적으로 **fable이 역효과를 실측했다**: 제안
패턴(`AKIA…` · `Bearer …` · `BEGIN RSA PRIVATE KEY`)은
`plugins/mccp/scripts/derive/tests/mask-secrets.test.js:25,34,51`의 fixture와 **문자 그대로
일치**한다. 그 test가 red인 run에서는 `failing[].error`가 그 fixture를 실어 `redaction_ok:false`가
되고, `scripts/test-suite/run.js:325-331`의 `--merge-into`가 그 원소를 **BLOCK**하므로 Task 4·5의 컨테이너
경로까지 끊긴다. 즉 순진한 형태는 개선이 아니라 회귀다.

**J3 → 합성.** fable이 초안의 **자기모순을 잡았다**: Task 3이 "PR을 닫고 브랜치를
삭제한다"인데 Task 6이 "그 PR을 다시 열어"라 적었고, head 브랜치가 지워진 PR은 재개할 수
없다. 실재 결함이므로 고친다. 순서 자체는 둘을 합성한다 — **E16(이 계정은 admin이 아니다)**
때문에 protection-first는 milestone 전체를 권한 부여에 인질로 잡는다. 그래서 codex의 순서
(축 D 먼저)를 택하되, fable의 (iv)를 살려 **버리는 PR을 닫지 않고 열어 둔다**. 그러면 Task 6이
같은 PR에서 `mergeStateStatus`를 재측정해 한 번의 왕복으로 `gate.json`과 `BLOCKED`를 모두 얻는다.

**J5 → A + 보강.** `.github/workflows/test-suite.yml`의 `upload-artifact`에 `retention-days`가 없어 artifact는
기본 90일 뒤 소멸한다. §3.12(증거 내구성)대로 두 run의 `gate.json`과 `mergeStateStatus`
출력을 **git-tracked** `docs/ci-full-suite/`에 커밋한다. draft PR은 `mergeStateStatus`가
`DRAFT`로 나와 `UNSTABLE`↔`BLOCKED` 판별자를 가리므로 **비-draft**로 연다.

**J6 → 둘 다 흡수.** fable의 지적이 정확하다 — 초안 `## Validation`은 `gh` 호출이 0건이고
검사 4가 exit 1을 명시 허용하므로, **라이브 산출물 0/5 상태에서도 "Validation passes"가
green이 될 수 있었다.** 그러면 문서가 증거의 *입력*이 아니라 증거 *자체*가 된다. 라이브
산출물을 전부 `## Validation`의 fail-closed `gh` 단언으로 옮겼다. codex의 "설정 존재 ≠
차단력"은 Acceptance 5b로 남는다.

### fable RISK (HIGH) — 흡수. 내 증거 채널이 틀렸다

fable: *"E1의 404와 E2의 `protection_absent`는 부재 증명이 아니라 권한 산물이다."*
`scripts/ci-required-checks.js:114-118`이 부르는 `/protection/required_status_checks`는 보호가 켜진
저장소에서도 **non-admin에게 404**를 돌려준다. 즉 `madsci207` 계정으로는 `idenn207`이 무엇을
설정하든 `exit 0`에 도달할 수 없고, Acceptance 5는 원리상 미달이었다.

**재측정으로 결론은 유지되고 채널은 교체된다.** world-readable
`GET /repos/idenn207/mccp/branches/main`은 `protected:false` · `protection.enabled:false` ·
`enforcement_level:"off"`를 돌려준다 — **이것이 진짜 부재 증명이다**(E1'). 결론(보호 부재)은
옳았고 근거가 틀렸으므로 근거를 바꾼다.

두 번째 지적도 흡수한다: runbook §2b의 `enforce_admins: false`는 **유일 admin(`idenn207`,
PR #185를 머지한 바로 그 계정)을 체크에서 면제**하므로 E4의 "차단력 0"이
`gh pr merge --admin` 한 번으로 재현된다. Task 6이 그 값을 `true`로 바꾸거나, 바꾸지 않는
이유를 기록한다.

> **L1 `C6` 인용 표기 — 앞 판의 이 자리 서술은 거짓이었고 철회한다 (R4 architect HIGH).**
> 여기에는 `plan-review/l1-check.js`의 `CITATION_RE` 첫 문자 클래스가 `.`를 제외해 점으로
> 시작하는 경로가 잘린다고 적혀 있었고, "재현" 문장까지 붙어 있었다. **실측하면 거짓이다** —
> 그 정규식은 `l1-check.js:71`의 `/(\.?[A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z0-9]+):(\d+)…/`
> 이고 선행 `\.?`가 있으며, 바로 위 주석(`:67-70`)이 *정확히 이 경우를 위해* 그것을 넣었다고
> 적는다. 직접 먹여 보면 `.github/workflows/test-suite.yml:63` → `.github/workflows/test-suite.yml`
> 로 온전히 캡처된다. 즉 **없는 버그를 재현했다고 적었다.**
> 대가가 둘이었다: (a) 그 위에 backlog **H8**이라는 영구 항목이 세워졌고, (b) 그것을 피하려고
> 채택한 `` `path L63` `` 표기가 오히려 C6가 **해소할 수 없는 형태**라, 검증되는 인용을
> 검증되지 않는 인용으로 바꿔 놓았다. 그래서 **H8을 철회하고**, 점 시작 경로는 다른 경로와
> 똑같이 `path:line` 으로 적는다. 이 문단을 지우지 않고 남기는 이유는 §3.16의 이탈 기록
> 규율과 같다 — 무엇을 왜 잘못 적었는지가 함께 남아야 한다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 오라클 CLI | `scripts/test-suite/gate.js:49-70` | 사유 코드를 닫힌 열거로 선언하고 런타임 소비처(`reasons_undeclared`)가 미선언 방출을 fail-closed로 막는다 |
| 입력 fail-closed | `scripts/test-suite/inputs.js:127-131` | `git ls-files -z` NUL 분리 · 부재는 통과가 아니라 사유 코드 |
| 절단 재현성 | `scripts/test-suite/wiring-cut.js:24-26` | 복원 판정은 `git diff`가 아니라 `git status --porcelain` — index에 심는 절단은 worktree diff에 안 나타난다 |
| 증거 내구성 | CLAUDE.md §3.12 | 감사 대조 corpus는 worktree·artifact 수명을 넘겨 git-tracked로 남긴다 |
| 측정 대 강제 분리 | `.github/workflows/test-suite-baseline.yml L38-61` vs `.github/workflows/test-suite.yml L75-79` | 측정은 matrix + dispatch, 강제는 단일 안정 job 이름(DD1) |
| 문서 정직성 | `docs/ci-full-suite/m3-enforcement.md` §7 | 미충족을 반올림하지 않고 표로 열거하고, 사유가 소멸하면 그 소멸을 별도 절로 기록한다 |

## 실측 (2026-09-08 · 이 계획의 근거)

추정이 아니라 명령 출력이다(UI5). 각 행은 재현 명령을 갖는다.

| # | 측정 | 값 | 명령 |
|---|---|---|---|
| E1' | branch protection (**world-readable 채널**) | `protected:false` · `protection.enabled:false` · `enforcement_level:"off"` · `contexts:[]` | `gh api repos/idenn207/mccp/branches/main --jq '{protected,enabled:.protection.enabled}'` |
| E1x | 같은 사실의 **admin-gated 채널** | `404 Not Found` — 부재와 **권한 부족을 구분하지 못한다**(fable RISK). rulesets는 `[]` | `gh api repos/idenn207/mccp/branches/main/protection` |
| E2 | required-check 진단 | `ok:false` · `reasons:["protection_absent"]` · exit 1 — 다만 E1x 채널을 쓰므로 **이 계정으로는 설정과 무관하게 항상 이 값** | `node scripts/ci-required-checks.js --json` |
| E3 | 게이트 라이브 발화 | 3회 — `34174703512` 차단(stage 1 `suite_red`, 옳음) → `34176593137` green → `34176861426` green | `gh run list --workflow=test-suite.yml` |
| E4 | 그럼에도 PR #185 | **MERGED** — green 게이트를 지나 머지됐고 차단력은 0이었다 | `gh pr list --head c3-ci-full-suite --state all` |
| E5 | CI 커버리지 실값 | `tracked=391 included=385 excluded=6` | run 34176861426 `Enumerate sanity` |
| E5b | 그 run의 `gate.json` (artifact 실물) | `blocked:false` · `coverage_pct` 98.46547314578005 · `numerator` 385 / `denominator` 391 · `unexplained` [] · `missing` [] | `gh run download 34176861426 -n test-suite-gate` |
| E5c | 그 run의 `measurement.json` | `ok:true` · `attribution:"complete"` · `redaction_ok:true` · `failing` [] · `wall_clock_ms` 126350 | 같은 artifact |
| E6 | 게이트 벽시계 | 측정 126초 · job 2m23s (M1 Linux 실측 75.5초의 두 번째 궤적점) | 같은 run |
| E7 | baseline dispatch 가용성 | main에 존재 · `active` · `workflow_dispatch` · matrix `[ubuntu,windows] × [20,24]` | `gh workflow list` |
| E8 | baseline dispatch 이력 | **0건** — 최근 run 전부 `event: pull_request`(2026-09-03 이전 = M3 이전 shape) | `gh run list --workflow=test-suite-baseline.yml` |
| E8b | baseline은 격리를 **적용하지 않는다** | 측정 줄에 `--exclude-from`이 없다(`.github/workflows/test-suite-baseline.yml L103`) → tracked 전량 391개를 돈다. Task 0이 요구한 Linux 재측정의 producer가 이미 존재한다 | 같은 파일 |
| E9 | 축 D 버리는 PR | **미생성** — `chore/axis-d-negative-control` 부재 | `gh pr list --state all` |
| E10 | `wiring-cut.js#applyDelete` | 대상 가드 **0건** — 임의 repo-relative 경로를 그대로 `git rm`(`:109-121`) | 소스 |
| E10b | 왜 그것이 축 D를 죽이는가 | `Enumerate sanity`(`.github/workflows/test-suite.yml L155`)가 `test "$((all-included))" -eq "$cap"`을 단언 → 격리된 파일을 지우면 6→5로 **판정보다 앞선 step이 먼저 죽고** `gate.json`이 안 생긴다. 자기 test 2개(`:169`)는 ENOENT로 같은 결과 | 소스 |
| E11 | `globToRegExp` ReDoS | wildcard 15 → 경로 1개 **24,179ms**. 검증기 상한 8에서는 **4ms** | 아래 스니펫 |
| E12 | ReDoS 방어 배선 | 두 소비처 모두 검증기를 거친다 — `scripts/test-suite/run.js:41,694` · `scripts/test-suite/inputs.js:35` | `grep -rn "require.*exclusions" scripts/` |
| E13 | NUL 규율 | 코드는 **이미 준수**(`scripts/test-suite/inputs.js:131,150` · `scripts/test-suite/run.js:413`). 고정하는 단언 **0건** | `grep -rn "'-z'" scripts/` |
| E14 | floor 기준 drift | `tracked_basis:384` · 주석은 "오늘 트리는 388" · 실제 **391** | `.github/test-suite-floor.json` |
| E15a | 라운드 원장 키잉 | `mccp-plan-codex__ci-full-suite`에 3라운드(전부 2026-09-01 · channel `panel`). PRD 축 슬러그라 M4의 **첫** 리뷰가 4라운드째로 거부 — `MCCP_GATE_ROUND_CAP` 최대 3으로도 못 넘는다 | `review-rounds/cli.js status --json` |
| E15b | 원장 관례 | 같은 디렉토리가 이미 milestone 축 키를 쓴다 — `ci-full-suite-m1` · `leadtime-observability-m1` … | `ls .claude/state/review-rounds/` |
| E15 | PRD 본문 stale — **이 전제 자체가 낡았다** | 정정은 이미 착지했다: `:138` 의 그 문장은 취소선 안에 있고 `정정(2026-09-08 · M4 실측)` 이 뒤따른다. M4 milestone 행도 `:139` 에 **이미 등재**돼 있다(`in-progress`). 남은 것은 등재가 아니라 **값 갱신**이다 | PRD `:138`·`:139` |
| E16 | **설정 권한** | 인증 계정 `madsci207` · 저장소 `idenn207/mccp` · `permissions.admin` = **false**(push=true). protection PUT은 admin **역할**을 요구하며 토큰 scope로 대체되지 않는다 → **Task 6은 이 계정으로 실행 불가** | `gh api user --jq .login` · `gh api repos/idenn207/mccp --jq .permissions` |
| E17 | `--merge-into` 유출 차단 | `scripts/test-suite/run.js:325-331` — `redaction_ok !== true`면 컨테이너 append를 **BLOCK**("this is a BLOCK, not a flag") | 소스 |
| E18 | credential fixture 결합 | `plugins/mccp/scripts/derive/tests/mask-secrets.test.js:25,34,51`이 `AKIAIOSFODNN7EXAMPLE` · `Bearer …` · `BEGIN RSA PRIVATE KEY`를 **문자 그대로** 담는다. 그런 fixture를 가진 tracked test는 2파일 | `git grep -lE 'AKIA[0-9A-Z]{12}\|BEGIN (RSA )?PRIVATE KEY' -- '*.test.js'` |
| E19 | artifact 수명 | `.github/workflows/test-suite.yml` 업로드 step에 `retention-days` 없음 → 기본 **90일** 후 소멸 | 소스 |
| E20 | runbook의 admin 면제 | §2b 본문이 `"enforce_admins": false` — 유일 admin(`idenn207`, PR #185 머저)을 체크에서 면제한다 | `docs/ci-full-suite/branch-protection-runbook.md:58` |
| **E21** | **baseline dispatch 1회 실행** (E8 의 "이력 0건"이 깨졌다) | run `34195014409` · `workflow_dispatch` · `main` · **4 leg 전부 success** | `gh run view 34195014409` |
| **E22** | **OQ3 DD8 입력 — 실측** | windows 전용 red **2건**(`lib/closure/tests/report.test.js` · `lib/tests/plan-review-write-invariants.test.js`) · 벽시계 linux **133.3초** / windows **536.5초** = **4.02배**(10배 미만) → DD8 행 = **`matrix`** | 아래 오라클을 artifact 4건에 대고 실행 |
| **E23** | **격리 재판정 — 실측** | `Q∩L` **6건**(전건 잔존) · `Q\L` **0건**(해제 없음) · `L\Q` **0건**(신규 red 없음). linux red 는 격리 6건과 **정확히 일치** | 같은 실행 |
| **E24** | `redaction_ok` 는 baseline 에서 **항상 false** — 다만 **원인은 둘**이다 | 4 leg 전부 `false`. ubuntu ×2 는 `win-drive-abs` len 3 (격리된 `lib/tests/leadtime.test.js` 의 `'C:/repo/…'` fixture). windows ×2 는 **`posix-home` len 48**(`lib/closure/tests/report.test.js` 의 `scrub("/repo/root/plugins/…")` fixture) — 그 파일은 **격리 목록에 없다**. 둘 다 합성 fixture 이고 실제 runner 경로(`C:\Users`·`runneradmin`·`/home/runner`)는 0건. `gate.js:194` 자신이 이 현상을 예고한다("a failing assertion diff can carry path-shaped fixtures") | 네 artifact 의 `redaction_hits` |
| **E25** | 분모가 또 움직였다 | baseline(`main`)은 `files_total` **392**, 이 브랜치 로컬은 **391**. E5·E14 의 391 은 브랜치 값이다 | `git ls-files -- '*.test.js' \| wc -l` 대 artifact |
| **E26** | baseline artifact 의 게시 안전성 | **host-origin 유출 0건** — credential 패턴 0 · 실제 runner 경로(`/home/runner`·`C:\Users`·`runneradmin`) 0. 잡히는 절대경로 2종은 전부 **fixture-origin**(`C:/repo/…` · `/repo/root/…`)이다. 그럼에도 **원본은 커밋하지 않는다** — 안전성이 오늘 red 집합에 의존하기 때문이다(재생성 시 무보장) | `grep -oE '/home/[a-z]+\|[A-Za-z]:[\\/]' docs/ci-full-suite/baseline-34195014409/*.json \| sort -u` |

E11 재현:

```bash
node -e 'function g(p){let o="";for(let i=0;i<p.length;i++){const c=p[i];if(c==="*"){if(p[i+1]==="*"){o+=".*";i++}else{o+="[^/]*"}continue}if(c==="?"){o+="[^/]";continue}o+=c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}return new RegExp("^"+o+"$")}
for(const n of [8,15]){const re=g("*".repeat(n)+"ZZZNOMATCH");const t=Date.now();re.test("plugins/mccp/scripts/lib/tests/x.test.js");console.log(n,Date.now()-t+"ms")}'
```

**E11·E12를 함께 읽어야 한다.** 컴파일러는 여전히 파국적이지만 두 소비처가 전부 8-wildcard
상한을 거치므로 **오늘 도달 가능한 비용은 0.2분**이다. backlog가 "근본 처방"이라 부른 것은
옳지만 그 심각도는 라이브 노출이 아니라 심층 방어다 — 그래서 milestone이 아니라 backlog다.

## 게이트 이탈 기록 (이 계획을 쓰는 동안 발생 — 반올림하지 않는다)

**codex 2차 리뷰(UI4)가 라운드 캡에 한 번 거부됐다.** 최초 봉인이 이미 머지된 PR의 게이트
(`mccp-pr-codex__c3-ci-full-suite`, 2/1)를 가리켰고, `mccp-plan-codex`로 재봉인하자 PRD 축
슬러그 `ci-full-suite`가 **3라운드**를 들고 있었다(E15a — 전부 2026-09-01 M1 세션의 `panel`
라운드). `MCCP_GATE_ROUND_CAP` 최대가 3이라 **문서화된 상향으로는 넘을 수 없다.**

취한 조치: `mccp-plan-codex__ci-full-suite-m4`로 봉인(cap=2). 근거는 편의가 아니라 **원장
자신의 관례**다 — 같은 디렉토리가 이미 `ci-full-suite-m1` · `leadtime-observability-m1` ·
`orchestrator-step-wiring-m1`처럼 milestone 축으로 키잉하고 있고(E15b), 바 키가 든 셋은
M1의 패널 라운드다. **기존 원장은 지우지 않았고 3라운드는 그대로 남아 있다** —
§3.16이 금지하는 것은 원장 삭제와 *같은 심의*의 슬러그 재발행이다.

하지 않은 것: 원장 삭제 · `MCCP_SKIP_RECEIPT` · 캡 무시.

**이것 자체가 backlog 항목이다(H7).** 캡이 PRD 축으로 키잉되면 새 milestone의 **첫** 리뷰가
같은 PRD의 n번째 라운드로 계수된다 — backlog R24 invariant 행이 지적한 "새 슬러그 재발행이
캡을 우회한다"의 **정반대 방향 오작동**이고, 같은 키잉 결함의 두 얼굴이다.

## Files to Change

경로는 전부 repo-root 상대 full 경로다(§1.2 dedupe matcher 요건).

| File | Action | Why |
|---|---|---|
| `scripts/test-suite/wiring-cut.js` | UPDATE | 절단 B 대상 가드를 산문에서 코드로(E10·E10b) — 축 D CI 실증의 선행 결함 |
| `scripts/tests/wiring-cut.test.js` | UPDATE | 가드의 짝 단언 — 자기 test·격리 대상·비-tracked를 거부하고 트리를 바꾸지 않는다 |
| `scripts/ci-required-checks.js` | UPDATE | (a) 판독 채널을 world-readable로 교체(fable RISK · E1x) · (b) 동등성 → 포함 검사(PR-Codex R1 F2) |
| `scripts/tests/ci-required-checks.test.js` | UPDATE | 두 수정의 짝 단언 — 무관한 required check가 `ok`를 떨어뜨리지 않고, non-admin에서도 실제 상태를 읽는다 |
| `docs/ci-full-suite/branch-protection-runbook.md` | UPDATE | `enforce_admins` 값 재고(E20) · 수행 계정을 이름으로 지정(E16) · 판독 채널 갱신 |
| `.github/test-suite-exclusions.json` | UPDATE | Task 5 재판정 반영(green 복귀분 해제 · 잔존분 사유를 재측정 근거로 갱신) |
| `docs/ci-full-suite/baseline-34195014409-summary.json` | UPDATE | OQ3 baseline 4 leg 의 **축약 증거**. 계획 단계에서 이미 생성됐으므로(E21~E26 의 산출물) 이 milestone 은 그것을 갱신·커밋한다. 원본 measurement 는 커밋하지 **않는다** — `failing[].error` 가 credential fixture 를 싣는 유일한 경로이고(E18) `redact.js` 의 `RESIDUAL_PATTERNS` 는 경로 4종뿐이라 credential 커버리지가 0이다(`.github/workflows/test-suite-baseline.yml:74-76`). 오늘 내용이 무해한 것은 `mask-secrets.test.js` 가 green 이었기 때문이라 **재생성 시 보장되지 않는다**(R4 security·invariant HIGH — 바로 아래 행이 axis-D `measurement.json` 을 같은 이유로 거부하는데 이 행은 원본을 커밋하고 있었다). 축약본은 leg 별 `{platform, ok, attribution, wall_clock_ms, files_total, per_file_len, redaction_*, red_files, failing_count}` 만 담고 error 본문은 0건이다(실측 확인) |
| `.github/workflows/test-suite-baseline.yml` | UPDATE | `:72` 주석이 트리거를 `pull_request` 라 적는데 실제는 `workflow_dispatch` 단독(`:38-39`) — Task 4 가 그 dispatch 를 누르므로 같은 자리에서 정정 |
| `docs/ci-full-suite/axis-d-a-gate.json` | CREATE | 절단 A run 의 `gate.json` tracked 사본(E19 — artifact 는 90일 뒤 소멸). `measurement.json` 은 **커밋하지 않는다**: red run 의 `failing[].error` 가 E18 fixture 를 싣는다 |
| `docs/ci-full-suite/axis-d-b-gate.json` | CREATE | 절단 B run 의 `gate.json` tracked 사본. 같은 이유로 `gate.json` 만 |
| `docs/ci-full-suite/m4-live-closure.md` | CREATE | 라이브 산출물의 증거를 한 자리에 + **artifact 사본을 tracked로**(E19) |
| `docs/ci-full-suite/m3-enforcement.md` | UPDATE | §7 표 3·4행을 M4 결과로 갱신 |
| `.claude/prds/ci-full-suite.prd.md` | UPDATE | M4 행 등재 · Success Metrics #1·#4 실값 · OQ3 판정 · M3 행 stale 문장 정정(E15) |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | H1~H7 적재(ci-full-suite 귀속 + 발현 조건) · 해소분 정리 |

## Tasks

실행 순서는 **Task 1 → 2 → 3 → 4 → 5 → 6 → 7**이다. Task 6만 외부 권한(E16)에 의존하므로
마지막이고, 그 앞의 여섯은 오늘 계정으로 전부 수행 가능하다.

### Task 1: 절단 B 대상 가드를 코드로 옮긴다

- **Action**: `scripts/test-suite/wiring-cut.js`에 `--apply-delete`의 대상 검증을 추가한다. 거부 규칙 셋:
  **(a)** 판정보다 앞선 자기 test 단계가 이름으로 부르는 파일 — 목록을 산문에 적지 않고
  `.github/workflows/test-suite.yml`의 해당 step에서 리터럴 경로를 파싱해 얻는다(산문 목록은
  workflow가 바뀌면 조용히 낡는다). 오늘 그 step(`:168-169`)이 부르는 것은 정확히 둘 —
  `scripts/tests/test-suite-coverage.test.js` · `scripts/tests/wiring-cut.test.js`.
  **(b)** 격리 목록에 걸리는 파일 — 이유가 (a)와 다르다(E10b): `Enumerate sanity`(`:155`)가
  `test "$((all - included))" -eq "$cap"`을 단언하므로 격리된 파일을 지우면 excluded가 6→5로
  떨어져 판정보다 앞선 그 step이 먼저 죽는다. **(c)** tracked `*.test.js`가 아닌 것.
  거부는 **비영점 + 트리 무변경**이다. 선택을 사람에게 맡기지 않도록 `--pick-delete`가
  결정적 후보 하나를 낸다(적격 집합 정렬 후 첫 원소).
  **세 규칙에도 사유 코드를 붙인다 (R3 architect·test MEDIUM)**: 앞 판은 (a)(b)(c) 에 코드를
  주지 않고 zero-parse 극성에만 `selftest_list_unreadable` 을 뒀는데, `## Validation` 은
  `selftest_target` 을 grep 한다 — 판정자가 의존하는 코드를 Task 가 선언하지 않았다. 코드는
  `selftest_target`(a) · `quarantined_target`(b) · `not_tracked_test`(c) ·
  `selftest_list_unreadable`(파싱 0건)이고, `gate.js:49-70` 형태대로 `wiring-cut.js` 자신의
  닫힌 열거로 선언한다. Task 1 의 Validate 도 exit≠0 이 아니라 **코드별**로 단언한다 —
  비영점만 보면 오타 하나가 세 규칙의 통과를 전부 대신한다.
  **네 번째 분기를 구성할 seam 을 실제로 만든다 (R3·R4 test HIGH — 앞 판은 "명시했다"고만 하고
  코드를 안 바꿨다)**: `scripts/test-suite/wiring-cut.js:32` 의 `const WORKFLOW = '.github/workflows/test-suite.yml'`
  는 모듈 상수이고 `applyDelete(target)` 는 인자가 하나뿐이라, "자기 test step 이 없는 합성
  workflow" 를 **넣을 방법이 없다**. 그래서 `--workflow <path>` 플래그를 추가하고 `applyDelete`
  가 그 경로를 받도록 한다(기본값은 기존 상수라 호출 형태는 무변경). 이것이 없으면 규칙 (a)의
  fail-open 극성을 반증할 경로가 존재하지 않는다.
  **Validate 기준도 고친다**: 앞 판은 "세 규칙 각각 exit≠0 이고 `git status --porcelain` 이
  비어 있다"였는데, 전체 트리 `git status` 는 M4 편집 때문에 상시 dirty 라 **항상 붉다** —
  계획 자신이 `## Validation` 에서 그 사실을 적고 스냅샷 대비로 바꿔 놓고 Task 본문만 그대로
  뒀다(R4 test HIGH). Task 1 의 Validate 는 **사유 코드별 단언 + 대상 파일 스냅샷 대비 무변경**
  으로 한다.
  **`--pick-delete` 에 stage 제약을 건다 (R4 test LOW)**: `gate.js:189-196` 은 `exit_code !== 0`
  이면 stage 1 `suite_red` 로 **즉시 반환**하므로, 삭제가 스위트를 red 로 만들면 절단 B 는
  `stage:2` 에 도달하지 못하고 `## Validation` 의 `a.stage===b.stage` 단언이 붉어진다. 따라서
  후보는 "삭제해도 나머지가 green" 인 파일이어야 한다 — 정렬 후 첫 원소가 아니라 그 조건을
  만족하는 첫 원소다.
- **파싱이 0건일 때의 극성 — 거부다 (L2 architect·invariant MEDIUM 흡수)**: 규칙 (a)의 입력은
  workflow 파일이므로 step이 개명·이동·주석화되면 목록이 **조용히 빈다**. 그때 (a)가 아무것도
  거부하지 않으면 규칙 (c)가 tracked `*.test.js`를 허용하므로 `scripts/tests/wiring-cut.test.js`
  자신이 다시 적격이 되고, E10b대로 판정보다 앞선 step이 먼저 죽어 `gate.json`이 안 생긴다 —
  가드가 정확히 자기가 막으려던 것을 허용한다. 그래서 **파싱 결과가 0건이면 `--apply-delete`
  전체를 거부한다**(사유 코드 `selftest_list_unreadable`, 비영점 + 트리 무변경). 산문 목록의
  "조용히 낡음"을 파싱으로 옮기지 않기 위한 조건이고, 이 극성이 없으면 (a)는 fail-open이다.
  같은 이유로 파싱 대상 step이 사라지는 것은 workflow 편집자가 알아야 할 사건이므로 거부
  메시지가 그 step을 이름으로 지목한다.
- **Mirror**: `scripts/test-suite/wiring-cut.js:34-38`의 `RED_FILE` 주석이 같은 논증을 A 축에 대해 이미 적는다 —
  "걸리면 축 D 증거의 producer가 사라진다". B 축에 그 규율이 없는 것이 결함이다.
- **Validate**: `scripts/tests/wiring-cut.test.js` 신규 분기 — 세 거부 규칙 각각에 대해
  exit≠0 이고 `git status --porcelain`이 비어 있다. `--pick-delete`의 출력이 세 규칙 어디에도
  걸리지 않는다. **넷째 분기 — 음성 케이스**: 자기 test step이 없는 합성 workflow 파일을 주면
  `--apply-delete`가 `selftest_list_unreadable`로 거부하고 트리가 그대로다. 세 규칙의 양성
  케이스만 두면 파싱이 죽었을 때 가드가 사라지는 경로가 test에 없다(L2 architect MEDIUM).

### Task 2: `scripts/ci-required-checks.js`의 판독 채널과 비교 규칙을 함께 고친다

두 결함이 같은 파일에 있고 둘 다 Task 6의 완료 판정을 막으므로 한 Task다.

- **결함 A — 판독 채널 (fable RISK, HIGH)**: `readRequiredChecks`(`:110-119`)가
  `/branches/{b}/protection/required_status_checks`를 부른다. 이 엔드포인트는 **admin 전용**이라
  보호가 켜진 저장소에서도 non-admin에게 404를 돌려주고, `diffChecks`(`:92-94`)는 그 `null`을
  `protection_absent`로 접는다. 그래서 `madsci207`(E16)로는 `idenn207`이 무엇을 설정하든
  `exit 0`이 **원리상 불가능**하다 — runbook §3이 "exit 0이 설정 완료의 증거다"라 적었으므로
  축 C의 완료 판정 자체가 도달 불가였다.
  **처방**: world-readable `GET /repos/{owner}/{repo}/branches/{branch}`의
  `.protection.required_status_checks.contexts`로 교체한다(E1'로 오늘 실동작 확인). 판독
  실패와 "보호 없음"을 **다른 사유 코드**로 가른다 — 전자는 `protection_unreadable`,
  후자는 `protection_absent`. 접으면 같은 혼동이 되돌아온다.
- **결함 B — 비교 규칙 (PR-Codex R1 F2)**: `diffChecks:100-103`이 `extra = required \ declared`를
  `required_not_declared`로 판정해 `ok:false`를 만든다. 선언은 `.github/workflows/test-suite.yml` **한 파일**에서만
  읽으므로(`parseJobNames`), 이 저장소의 다른 5개 workflow 중 하나라도 required로 걸면
  (가장 유력한 후보는 모든 PR에서 도는 `version-declaration-gate`) 정상 설정이 drift로 오보된다.
  **처방**: 선언된 게이트 이름이 required에 **포함되는지**만 판정한다. 무관한 required check는
  `unrelated` 키로 보고하되 `ok`를 떨어뜨리지 않는다. 이름 변경 drift 탐지는 **과거 게이트
  이름을 명시 추적**하는 목록으로 유지한다(포함 검사만 남기면 이름을 바꿔도 조용하다).
- **Mirror**: `scripts/test-suite/gate.js:49-70`의 닫힌 사유 열거 + 런타임 소비처의 **형태**만
  빌린다. **새 사유는 `scripts/ci-required-checks.js` 자신의 taxonomy에 선언한다 — `gate.js`의
  열거에 넣지 않는다.** L2 architect·test가 같은 결함을 독립으로 지적했다: 그 열거의 "죽은
  선언 0" 단언(`scripts/tests/test-suite-coverage.test.js:969-982`)은 producer 소스를
  `gate.js`·`coverage.js`·`inputs.js` 셋으로만 스캔하고 각 코드가 그 안에 2회 이상 등장할 것을
  요구하므로, producer가 `ci-required-checks.js`인 코드를 넣으면 `hits<2`로 **확정 red**가
  된다. 그리고 그 test는 머지 차단 workflow의 **판정보다 앞선 step**
  (`.github/workflows/test-suite.yml L168-169`)이라, 계층을 섞는 순간 게이트가 자기 결함으로
  전 PR을 막는다. 사유 코드는 그것을 내는 모듈이 소유한다.
- **Validate**: 순수층 네 fixture — (1) 게이트만 required → `ok:true` exit 0 · (2) 게이트 +
  `lint` required → `ok:true` + `unrelated:["lint"]` · (3) 과거 이름만 required → `ok:false` +
  `renamed_gate` · (4) 판독 실패 → `protection_unreadable`(≠ `protection_absent`).
  **그러나 순수층만으로는 이 Task를 반증하지 못한다** — L2 test가 지적한 대로 실제로 바뀌는
  함수는 `readRequiredChecks`이고 `scripts/tests/ci-required-checks.test.js:20`은 그것을
  **import조차 하지 않는다**(`parseJobNames`·`diffChecks`만). 그 파일 헤더(`:5-9`)가 같은
  실패를 이미 경고한다. 그래서 **spawn seam 단언을 추가한다**: `gh`를 스텁으로 세운
  `PATH`에서 `readRequiredChecks`를 실제로 호출해 (i) 호출된 엔드포인트가 world-readable
  경로이고 (ii) 보호-켜짐 응답에서 `contexts`가 파싱되며 (iii) 비어 있는/오류 응답이
  `protection_absent`와 `protection_unreadable`로 **갈린다**를 잰다.
  **판별력 주의**: "오늘 트리에서 `protection_absent` 재현"은 회귀가 **아니다** — `main`이
  `protected:false`(E1')라 구·신 채널이 둘 다 absent 계열을 내므로 두 채널을 구분하지
  못한다. 판별자는 위 (iii)의 스텁 분기다.
- **빈 `declared` 는 fail-closed 여야 한다 (R2 architect·security HIGH 독립 2건)**: 결함 B의
  포함 검사는 `declared = []` 일 때 **공허하게 참**이라 `ok:true` → exit 0 이 된다. 그런데
  오늘 그 경우를 잡는 유일한 축이 바로 없애려는 `extra`(`required \ declared`)다 — `declared`
  가 비면 `missing` 도 공허하게 비기 때문이다. 그리고 `declared` 는 `declaredParse.resolved`
  (`scripts/ci-required-checks.js:142`)이고 `parseJobNames` 는 job `name:` 에 `${{ }}` 가 들어가면
  그것을 `unresolved` 로 보내 `resolved` 를 비운다(`scripts/tests/ci-required-checks.test.js:66-69`
  이 그 형태를 단언한다). 즉 **누군가 job 이름을 matrix 템플릿으로 바꾸는 순간 진단이 조용히
  green 이 된다** — runbook `:79` 가 exit 0 을 "설정 완료의 증거"로 삼으므로 이것은 loud red 를
  silent green 으로 바꾸는 회귀다. **처방**: `declared.length === 0` 이면 비교를 하지 않고
  `declared_unresolved` 사유로 `ok:false`. 이것을 Task 2 의 다섯째 fixture 로 고정한다.
- **`diffChecks` 의 시그니처가 바뀐다 — 이것은 부수효과가 아니라 산출물이다 (R2 test MEDIUM)**:
  3분화 판별자는 `protected` 값을 읽는데 `diffChecks({declared, required})`(`:85-106`)에는 그
  채널이 없다 — `o.required == null → protection_absent`(`:92-94`) 하나뿐이라 fixture (4)
  (`판독 실패 → protection_unreadable`)는 **오늘 입력으로 표현할 수 없다**. 그래서 Task 2 는
  `diffChecks` 를 `{declared, required, protected}` 로 넓히고, `readRequiredChecks` 가
  `{protected, contexts}` 를 돌려주도록 반환 계약도 함께 바꾼다. 두 편집은 **한 커밋 불변식**이다.
  **그 계약을 소비하는 곳을 전부 이름으로 적는다 (R3 test HIGH — 앞 판은 한 곳도 적지 않았다)**:
  `scripts/ci-required-checks.js` CLI 본문의 `:137`(할당) · `:142`(`diffChecks` 인자) ·
  `:148`(JSON `required` 출력 계약) · `:159`(`required.join(', ')` — **객체엔 `.join` 이 없어
  즉시 TypeError**). `:159` 의 `required === null` 도 더는 "판독 불가" 센티널이 아니므로
  `protected`/`contexts` 분기로 갈아탄다. 이 CLI 가 `readRequiredChecks` 의 **유일 소비처**임은
  저장소 전역 grep 으로 확인했다.
  **바뀌는 기존 단언 둘을 추가로 적는다**: `scripts/tests/ci-required-checks.test.js:26-31` 과
  `:43-49` 는 `diffChecks` 를 `protected` **없이** 부르고, 후자는 `deepStrictEqual(v.reasons,
  ['protection_absent'])` 로 배열 전체를 고정한다. 그래서 판별자에 **넷째 행**을 둔다:
  `protected === undefined`(인자 미전달·API 실패) → `protection_unreadable`(fail-closed).
  그 행이 없으면 3분화는 `undefined` 를 `protection_absent` 로 되접어 Task 2 가 가르겠다고 한
  혼동으로 되돌아간다.
- **`renamed_gate` 의 근거를 정정한다 (R2 architect MEDIUM)**: 초안은 "포함 검사만 남기면 이름을
  바꿔도 조용하다"를 근거로 들었는데 **거짓이다** — job 을 개명하면 `missing` 이 비지 않아
  `declared_not_required`(`:99-102`)가 그대로 발화한다. 그래서 이 사유는 **workflow 개명**이
  아니라 **required 쪽에 옛 이름만 남은** 경우(설정이 낡음)를 가리키는 것으로 범위를 좁히고,
  과거 이름 목록은 `scripts/ci-required-checks.js` 안의 상수 `HISTORICAL_GATE_NAMES` 로 둔다.
  그 범위로도 fixture (3)이 `declared_not_required` 와 **함께** 나오므로, 단언은 `renamed_gate`
  가 사유 배열에 **추가로** 실리는지를 본다(그것이 이 코드의 유일한 부가 정보다).
- **이 교체가 `enforce_admins` 관측 채널을 없앤다 (R2 security·invariant HIGH)**: `enforce_admins`
  는 admin 전용 `/protection` 응답에만 있고 world-readable `branches/main` 에는 **없다**
  (실측: `.protection` = `{enabled, required_status_checks:{checks,contexts,enforcement_level}}`).
  따라서 Task 2 이후 이 계정에는 그 값을 볼 채널이 0개다. 없는 채널을 지어내지 않고 Task 6 이
  **설정 수행자(idenn207)의 관측을 tracked 증거로 기록**하게 한다 — `## Validation` 축 C 분기가
  그 줄을 요구하고, `false` 면 근거 줄까지 요구한다. 값을 못 읽는 것과 조용히 넘어가는 것은 다르다.
- **판정 3분화의 판별자 (L2 architect MEDIUM)**: world-readable 채널은 보호가 없는 브랜치에도
  `contexts:[]`를 돌려주므로 `required == null`이 성립하지 않아 `protection_absent`를 구조적으로
  낼 수 없다. 따라서 판별자를 **명시**한다: `protected === false` → `protection_absent` ·
  `protected === true` ∧ `contexts` 부재/판독 실패 → `protection_unreadable` ·
  `protected === true` ∧ `contexts` 배열 → 정상 비교. 사유를 늘리면서 판별 규칙을 적지 않으면
  그 사유는 도달 불가이거나 임의다.
- **바뀌는 기존 단언을 이름으로 적는다 (L2 test LOW)**: 결함 B의 처방("무관한 required check는
  `unrelated`로 보고하되 `ok`를 떨어뜨리지 않는다")은 `scripts/tests/ci-required-checks.test.js:33-41`이
  오늘 **정답으로 고정한 동작**과 정면 충돌한다 — 그 단언은 `declared=['full test suite gate']` ·
  `required=['old gate name']`에 대해 `required_not_declared`를 요구한다. 그 fixture는 사실 두
  명제를 겹쳐 놓았다(선언 게이트가 required에 없다 **그리고** 무관한 이름이 required에 있다).
  분리해서 다시 적는다: 그 케이스는 `renamed_gate`(과거 이름 추적 목록에 걸린다)로 판정되고,
  `unrelated`는 `ok`를 떨어뜨리지 않는다. **이 교체는 Task 2의 산출물이지 부수효과가 아니다** —
  적지 않으면 구현자가 red를 만나 처방과 기존 단언 중 무엇이 틀렸는지 스스로 정해야 한다.
- **주장하지 않는 것 — "보호 켜짐 × non-admin"은 오늘 측정 불가다 (L2 security·invariant MEDIUM)**:
  E1'은 `protected:false`인 상태에서만 측정됐으므로 "보호 없음"과 "권한 때문에 안 보임"이
  **똑같이 `contexts:[]`로 나오는** 구성이다. 즉 world-readable 채널이 non-admin에게 켜진
  보호의 `contexts`를 실제로 채워 주는지에 대한 실측은 이 계획에 **없고**(E1~E20 전건), 만들
  수도 없다 — 그 측정에는 축 C 설정이 선행이고 축 C는 E16(admin 부재)에 막혀 있다. 그래서
  이 Task가 주장하는 것은 **"판독 채널이 admin 전용이 아니다"** 까지이며, GitHub 문서와 E1'의
  200 응답이 그 근거다. 그 이상은 주장하지 않는다.
  **그 미측정이 Acceptance를 인질로 잡지 않게 하는 것이 판별자의 일이다**: 켜진 보호에서
  `contexts`가 안 보이면 새 코드는 `protected === true` ∧ `contexts` 부재 → `protection_unreadable`을
  내며, 이것은 `protection_absent`(보호 없음)와 **다른 사유**다. 축 C의 Validation 분기는
  `.protected`가 `true`일 때만 exit 0을 요구하므로, 그 상황은 "보호가 켜졌는데 진단이 비영점"으로
  **붉게 드러난다** — 조용히 통과하지 않는다. 그리고 그 붉음의 사유 코드가 `protection_unreadable`이면
  결함은 판독 권한이지 설정이 아니라는 것이 즉시 읽힌다. 접었다면(`protection_absent` 하나로)
  구분 자체가 불가능했다. 이 항목은 Acceptance 5의 **알려진 잔여 위험**으로 `## Risks`에 등재한다.

### Task 3: 축 D — 절단 A·B의 CI red를 각각 1회 실증

- **Action**: `chore/axis-d-negative-control` 브랜치에서 **비-draft 버리는 PR**을 연다(DD5 ·
  J5). 절단 A(`--apply-red`) 커밋 → run 대기 → red 확인 + artifact 회수 → `--revert-red`.
  절단 B(`--pick-delete` → `--apply-delete`) 커밋 → run 대기 → red 확인 + 회수 →
  `--revert-delete`. **PR은 머지하지 않는다.** 그러나 **닫지도 브랜치를 지우지도 않는다** —
  Task 6이 같은 PR에서 `mergeStateStatus`를 재측정하기 때문이다(J3 합성).
  **정리는 Task 6 이 아니라 `## Validation` 통과 이후다 (R2 architect·invariant HIGH)**: 축 C-2 의
  판정자는 `gh pr view --json mergeStateStatus` 인데 `mergeStateStatus` 는 **전이 상태**라, 절단을
  되돌리고 PR 을 닫는 순간 `BLOCKED` 이 사라진다. 정리를 Task 6 안에 두면 축 C 가 실제로 성공한
  세계에서 Validation 이 **구조적으로 통과 불가**가 되고, green 으로 남는 유일한 경로가 축 C 를
  `unmet` 으로 적는 else 분기가 된다. 그래서 PR 은 Validation 이 관측을 마칠 때까지 **열어 둔다**.
  **브랜치 base 는 M4 브랜치다** — `--pick-delete` 는 Task 1 의 산출물이라 `main` 에서 딴 브랜치엔
  없다. 대신 버리는 PR 이 M4 변경을 함께 실으므로, red 의 귀속은 `gate.json` 의 `reasons` 코드가
  가른다(`suite_red` 대 `deleted_without_allowance`) — run 번호만으로 귀속을 주장하지 않는다.
- **Mirror**: `m3-enforcement.md` §4의 로컬 왕복 절차 — 같은 절단, 같은 기대값. 로컬에서 이미
  통과했으므로 CI 왕복이 새로 재는 것은 **소비 경로**뿐이다.
- **Validate**: run URL을 **붙이는 것으로 끝내지 않는다**(fan-out T1 · J6). 각 run의 artifact를
  `gh run download <id> -n test-suite-gate`로 내려받아 `gate.json`을 기계로 대조한다 —
  A는 `blocked:true`·`stage:1`·`reasons ∋ suite_red`, B는 `blocked:true`·`stage:2`·
  `reasons ∋ deleted_without_allowance`. **둘의 `stage`가 달라야 한다** — 같으면 두 절단이
  같은 것을 재고 있다는 뜻이라 판별력이 없다. 두 `gate.json`을 `docs/ci-full-suite/`에
  **tracked로 커밋한다**(E19 — artifact는 90일 뒤 사라진다). 같은 문서에 `- axis-d-pr: `<N>``를
  적는다 — Task 6의 5b가 그 번호로 `gh pr view`를 호출한다(문서에서 읽는 것은 번호뿐이고
  상태는 `gh`가 낸다).
- **선행**: Task 1. 가드 없이 대상을 잘못 고르면 판정보다 앞선 step이 먼저 죽어(E10b)
  `gate.json`이 생성되지 않고, red는 나지만 그 red가 "게이트가 잡았다"의 증거가 아니게 된다.

### Task 4: OQ3 — baseline dispatch로 OS 축을 측정하고 DD8 규칙을 적용한다

- **Action**: `gh workflow run "test-suite baseline measurement" --ref main`으로 4원소
  (ubuntu/windows × node 20/24)를 1회 측정한다(E7·E8 — 지금 가능해졌고 아직 0회다).
  artifact 넷에서 **Windows 전용 red 집합**과 **OS별 벽시계**를 낸다. 그 다음 DD8 규칙을
  **그대로** 적용한다: Windows 전용 red 0건 → Linux 단독 · 1건 이상 → matrix · 벽시계가
  Linux의 10배 초과 → 별도 트리거.
- **판정의 종결 조건 (codex MEDIUM 흡수)**: DD8 표의 행을 **고르는 것**과 그 행을 **시행하는
  것**은 다른 명제다. 측정이 `matrix`를 고르면 M4는 OQ3을 "종결"이라 적을 수 없다 — 강제
  workflow는 ubuntu 단독이고(`.github/workflows/test-suite.yml L76`), matrix leg를 required로 올리려면 pin
  패리티(baseline은 `@v4` tag-pin · 강제는 SHA-pin)가 선행이며 그것은 backlog다. 종결 문구는
  측정 결과에 따라 갈린다:
  - `Linux 단독` 행 → **OQ3 종결**(`[x]`). 시행할 것이 없다 — 오늘 형태가 곧 그 정책이다.
  - `matrix`/`별도 트리거` 행 → **"결정됨 · 시행 미완"으로 남기고** 시행 소유자를 이름으로
    지정한다. 결정을 기록한 것으로 시행을 대신하지 않는다.
- **부수 편집**: `.github/workflows/test-suite-baseline.yml L72`의 주석이 트리거를 `pull_request`라 적는데 실제는
  `workflow_dispatch` 단독(`:38-39`)이다(fan-out S2) — 이 Task가 바로 그 dispatch를 누르므로
  같은 자리에서 정정한다.
- **OQ3 는 이미 측정됐고 답은 `matrix` 다 (E21~E23 · 2026-09-08)**: dispatch 를 눌렀고 4 leg 이
  전부 success 로 끝났다. 그러므로 이 Task 가 남긴 일은 *측정*이 아니라 **판정의 기록과 그
  귀결의 처리**다. Task 4 자신이 정한 종결 조건에 따라 `matrix` 는 **"결정됨 · 시행 미완"**
  이고 OQ3 을 `[x]` 로 닫지 **않는다** — 강제 workflow 는 ubuntu 단독이고(`.github/workflows/test-suite.yml:76`)
  matrix leg 을 required 로 올리려면 pin 패리티가 선행이기 때문이다. 그래서 **backlog H5
  (baseline `@v4` tag-pin → SHA-pin)가 지금 즉시 선행조건으로 승격된다** — H5 의 발현 조건이
  "OQ3 이 matrix 를 고르면"이었고, 그 조건이 방금 참이 됐다. 시행 소유자를 이름으로 적는다.
- **DD8 행은 재도출해서 대조한다 (R2 test·security·invariant HIGH 독립 3건)**: 초안은 문서에 적힌
  행 이름이 enum 에 드는지만 봤고 입력 둘은 존재 grep 이었다 — Windows 전용 red 30건에도
  `linux-only` 를 적으면 green 이었다. 그런데 재도출에 필요한 셋(`platform`·`per_file`·
  `wall_clock_ms`)이 이미 내려받은 artifact 에 전부 있다. `## Validation` 이 그것으로 행을 다시
  계산해 문서 주장과 **불일치하면 실패**한다. 이 축에서 문서는 산출물이지 입력이 아니다.
- **수용 조건은 셋 중 둘이다 — 셋째는 실측으로 기각됐다 (R4 architect MEDIUM 흡수)**:
  `ok` ∧ `per_file.length == files_total` 은 그대로 강제한다. 셋째 `redaction_ok`
  (`.github/workflows/test-suite-baseline.yml:28`)는 **요구하지 않는다** — E24 가 네 leg 전부
  `false` 임을 실측했고 원인이 둘 다 합성 fixture 이기 때문이다. 앞 판은 이 자리에서 셋째를
  "빠뜨린 결함"이라 부르면서 오라클에서는 거부해, **같은 Task 안에 상호 배타적인 두 수용
  조건**이 살아 있었다. 그 모순을 이 문단이 해소한다. 게시 안전성은 조건이 아니라 **커밋
  대상 축소**로 담보한다(원본 대신 축약본 — `Files to Change` 참조).
- **`conclusion` 은 판정에 쓰지 않는다**: 측정 step 이 `continue-on-error: true`(`:102`)라 `run.js` 가
  죽어 빈 artifact 를 남겨도 run 은 `success` 다 — 그 파일 헤더(`:24-30`)가 그렇게 적는다. 초안의
  `conclusion=success` 단언은 그 목적("red run 의 측정은 OQ3 입력이 아니다")을 달성할 수 없었다
  (R2 invariant MEDIUM). 내용 3원 조건이 그 일을 한다.
- **Validate**: artifact 4건이 실재하고 각각 `ok:true`·`attribution:complete`. 판정 표의
  **어느 행인지**가 `m4-live-closure.md`에 값과 함께 적힌다. **규칙을 측정 후에 바꾸지
  않는다** — 바꾸려면 그 사실을 이탈로 기록한다.

### Task 5: 격리 6건을 Linux 재측정으로 재판정한다

- **왜 Task 4가 이것을 낳는가(실측 E8b)**: baseline의 측정 줄은 `scripts/test-suite/run.js --json`이고
  **`--exclude-from`이 없다**(`.github/workflows/test-suite-baseline.yml L103`). 즉 격리 6건을 포함한 tracked
  전량을 돈다 — 강제 workflow(`:179`)가 격리 목록을 넘겨 6건을 건너뛰는 것과 정확히 반대다.
  Task 0이 요구한 producer가 이미 존재하고 아무도 누르지 않았을 뿐이다(E8).
- **비교 오라클 (fan-out T3)**: 판정을 눈으로 하지 않는다. Task 4의 ubuntu 원소 둘에서
  `failing[].file`을 파일 단위로 접은 집합 `L`, 현재 격리 6건의 `pattern` 집합 `Q`를 놓고 —
  `Q \ L` = **green 복귀**(해제 후보) · `Q ∩ L` = **잔존** · `L \ Q` = **신규 red**(격리
  대상이 아니라 차단 사유다). 세 집합을 `m4-live-closure.md`에 값으로 적는다.
- **Action**: `Q \ L`은 격리를 **해제**하고 `max_excluded_files`를 그만큼 내린다. `Q ∩ L`은 **수리하지 않고**(J4 합치)
  사유 문자열을 재측정 근거로 갈아쓴다 — 오늘 사유는 전부 "not reproducible on the authoring
  host"인데 Linux artifact가 도착하는 순간 그 문장은 거짓이 되므로, run URL과
  `failing[].name` 로 교체한다.
- **왜 수리하지 않는가 (J4 — 두 리뷰어 합치)**: 6 파일 중 `scripts/test-suite/` 소유는
  **0건**이고(경로는 `derive/` · `lib/` · `receipt/`) PRD가 "있는 것을 돌리는 것만 한다"고
  못박았다(UI6). 재현이 성립한 수리는 **소유 축의 별도 PR**이며, 그 티켓을 갱신하는 것까지가
  M4의 몫이다.
- **`tracked_basis`는 손대지 않는다 (L2 test·invariant MEDIUM 흡수)**: 초안은 이 diff에서
  `tracked_basis`를 391로 재기준하고 그것을 "DD9 인가 경로"라 불렀는데, **그 전제가 거짓이다** —
  `.github/test-suite-floor.json:3`은 재기준을 "`allow_deletions` 정리와 **같은 diff에서만**"
  허용하고 그 밖의 어떤 이유로도 손대지 말라 적으며, 현재 `allow_deletions`는 `[]`(`:12`)라
  정리할 항목이 없다. 격리 해제는 `allow_deletions` 정리가 아니다. 그리고 그 위반은 test로
  잡히지도 않는다 — `scripts/tests/test-suite-coverage.test.js:753-761`은
  `tracked === tracked_basis - (max_allowed_deletions+1)` 산술만 보므로 두 키를 함께 올리면
  통과한다. 계약을 어기면서 그 위반이 기계에 안 잡히는 편집은 하지 않는다.
  **그래서 이 Task는 `max_excluded_files`만 내리고 `tracked_basis`·`tracked`는 무편집이다.**
  E14의 drift(384 대 실제 391)는 **해소하지 않고 backlog H6에 남긴다** — H6은 이미 그 항목이고,
  발현 조건("정상 삭제 사이클이 두 번 돌아 여백이 소진될 때")이 그 기계화의 트리거다. 오늘
  고치는 것은 규칙 위반이고, 안 고치는 것은 이미 등재된 기존 부채다.
  `Files to Change`의 `.github/test-suite-floor.json` 행도 그에 맞춰 `max_excluded_files` 하향
  단독으로 좁힌다. 파일을 안 건드리게 되면(해제 0건) 그 행 자체를 뺀다.
- **비교 오라클의 반증력 — 항등식을 쓰지 않는다 (L2 test·invariant MEDIUM 흡수)**: 초안의
  `|Q\L| + |Q∩L| + |L\Q| == |Q ∪ L|`은 세 집합이 모두 같은 `Q`·`L`에서 파생되므로 **정의상
  항상 참**이고 어떤 오류도 잡지 못한다. 독립 산출원이 없는 등식은 오라클이 아니다. 교체한다 —
  판정자는 `## Validation`이 **baseline artifact에서 `L`을 다시 계산해** 문서의 주장과 대조하는
  것이고, 반증 가능한 명제는 셋이다:
  **(i)** `Q`는 편집 **후** `.github/test-suite-exclusions.json`이 아니라 `origin/main` 시점의
  격리 목록에서 읽는다(편집 후 파일에서 읽으면 해제한 항목이 `Q`에서 사라져 `Q\L`이 항상 비고,
  자기 편집을 자기가 정당화한다). **(ii)** `Q \ L`의 각 원소가 편집 후 목록에 **없다**(해제가
  실제로 반영됐다). **(iii)** `Q ∩ L`의 각 원소가 편집 후 목록에 **있고** 그 `reason` 문자열이
  더 이상 `not reproducible on the authoring host`를 담지 않는다(재측정 근거로 갈렸다).
  `L \ Q`가 비지 않으면 그것은 격리 대상이 아니라 **차단 사유**이므로 값을 기록하고 M4는
  그 사실을 미충족으로 적는다 — 신규 red를 격리로 흡수하지 않는다.
- **`Files to Change` 에 두 행이 없는 것은 누락이 아니다**: `.github/test-suite-floor.json` 의
  `max_excluded_files` 와 `scripts/test-suite/exclusions.js` 의 `MAX_EXCLUSION_ENTRIES` 는
  해제가 0건이라 **편집 대상이 아니다**. 편집하지 않는 파일을 표에 남기면 dedupe matcher 의
  입력이 오염되므로(§1.2) 표에서 빼고 근거를 여기 남긴다.
- **실측 결과 해제는 0건이다 (E23)**: linux red 가 격리 6건과 정확히 일치하므로 `Q\L` 이 비고
  `L\Q` 도 빈다. 따라서 **격리 목록의 원소는 하나도 바뀌지 않는다** — 계획이 미리 적어 둔 대로
  ("해제가 0건이면 이 행 자체가 빠진다") `.github/test-suite-floor.json` 의 `max_excluded_files`
  하향과 `scripts/test-suite/exclusions.js` 의 `MAX_EXCLUSION_ENTRIES` 하향은 **둘 다 수행하지
  않는다**. 이 Task 가 실제로 남기는 편집은 **잔존 6건의 `reason` 문자열 갱신 하나**이고, 그
  갱신의 표지는 run id `34195014409` 다. 아래 두 항목은 해제가 발생하는 미래 사이클을 위해
  규칙으로 남긴다.
- **`MAX_EXCLUSION_ENTRIES` 를 짝으로 내린다 (R2 test HIGH)**: `scripts/test-suite/exclusions.js:31`
  이 `MAX_EXCLUSION_ENTRIES = 6` 이고 `scripts/tests/test-suite-coverage.test.js:727` 이
  `strictEqual(MAX_EXCLUSION_ENTRIES, live.length)` 로 **정확히** pin 한다. 격리를 한 건이라도
  해제하면 `live.length` 가 6 미만이 되어 그 test 가 red 가 되고, 그 test 는 머지 차단 workflow 의
  **판정보다 앞선 step**(`.github/workflows/test-suite.yml:168-169`)이라 게이트가 자기 결함으로 전
  PR 을 막는다 — 흡수 B 가 닫은 것과 **같은 형태의 결함**이 Task 5 에 남아 있었다. 그래서
  `exclusions.js` 를 `Files to Change` 에 넣고 두 값을 같은 diff 에서 내린다.
- **해제 판정을 `failing[]` 부재가 아니라 `per_file` 의 양성 green 증거로 한다 (R2 invariant HIGH)**:
  reporter 가 `MAX_FAILING = 500` 에서 목록을 절삭하고(`scripts/test-suite/reporter.mjs:53,192`) 그 사실을 알리는
  `failing_truncated`(`:204`)는 **`run.js` 를 통과하지 못해 artifact 에 존재하지 않는다**(실측:
  measurement JSON 의 키 목록에 없다). 절삭된 목록의 "부재"를 green 으로 읽으면 아직 red 인 격리를
  해제하게 되고, 그 결과는 저장소의 **유일한 머지 차단 체크가 영구 red** 가 되는 것이다. 대신
  `per_file` 의 `{file, fail}` 을 쓴다 — `fail > 0` 이면 red, `fail === 0` 이면 green, **per_file 에
  아예 없으면 `unmeasured`** 이고 이것은 해제 대상이 **아니다**(부재는 green 이 아니다).
- **Validate**: 갱신된 격리 목록으로 `scripts/test-suite/gate.js`가 exit 0. `max_excluded_files`가 실제 glob
  확장과 등가라는 기존 단언이 그대로 green. 위 (i)(ii)(iii)이 `## Validation`에서 실행된다.

### Task 6: branch protection을 설정하고 차단력을 관측한다

- **선행 — 권한 (E16)**: 인증 계정 `madsci207`은 `idenn207/mccp`에 `admin:false`다.
  **이 Task는 이 계정으로 실행할 수 없다.** 수행 주체는 `idenn207`이며, 계획은 그것을
  **이름으로 지정**한다(fable RISK). 권한이 도착하지 않으면 M4는 축 C를 **명시 미충족으로
  두고 ship한다** — M3이 넷 중 둘을 미충족으로 남긴 것과 같은 규율이다. 반올림하지 않는다.
- **Action**: runbook §2b로 `full test suite gate`를 `main`의 required status check에 건다.
  **정책 설계는 하지 않는다**(UI8) — 등록할 이름은 `scripts/ci-required-checks.js`가 읽어 낸다.
  단 `enforce_admins`는 값을 정해야 한다(E20): 오늘 runbook은 `false`이고, 그러면 유일
  admin이자 PR #185의 머저인 `idenn207`이 체크에서 면제되어 **E4의 "차단력 0"이
  `gh pr merge --admin` 한 번으로 재현된다**. `true`로 바꾸거나, 바꾸지 않는 이유를 runbook에
  적는다. 어느 쪽이든 UI8이 금지한 "정책 설계"가 아니라 **이미 있는 값의 정직화**다.
- **Validate**: 둘 다 필요하다(codex J6). **(a)** `node scripts/ci-required-checks.js` →
  **exit 0**. Task 2의 채널 교체 없이는 이 값이 계정 때문에 도달 불가였다(E1x).
  **(b) 설정 존재는 차단력이 아니다.** Task 3이 열어 둔 버리는 PR에 절단 A를 다시 얹고
  `gh pr view --json mergeStateStatus`가 **`BLOCKED`**임을 관측한다(보호 부재면 `UNSTABLE`,
  draft면 `DRAFT`라 비-draft가 요건이다). PR #185가 green 게이트를 지나 머지된 것(E4)이
  (a)와 (b)가 다른 명제임을 이미 실증한다.
- **`enforce_admins` 는 값을 정하는 데서 끝나지 않고 기록까지가 이 Task 다 (R2 security·invariant HIGH)**:
  Task 2 가 판독 채널을 world-readable 로 옮긴 뒤 이 계정에는 그 필드를 볼 채널이 **없다**(실측).
  그러므로 설정을 수행하는 `idenn207` 이 자신의 `gh api .../protection --jq .enforce_admins` 출력을
  `m4-live-closure.md` 에 `- enforce-admins: <true|false>` 로 적고, `false` 면
  `- enforce-admins-rationale: ` 까지 적는다. `## Validation` 축 C 분기가 그 둘을 강제한다.
  값 없이 축 C 를 met 으로 봉인하는 경로는 없다 — 유일 admin 이 면제되면 `mergeStateStatus` 가
  `BLOCKED` 여도 `gh pr merge --admin` 한 번으로 E4 의 "차단력 0" 이 재현되기 때문이다.
- **정리는 이 Task 가 아니라 `## Validation` 통과 이후다**: `mergeStateStatus` 는 전이 상태라
  여기서 PR 을 닫으면 판정자가 볼 것이 사라진다(Task 3 참조). 순서는 관측 → Validation →
  절단 되돌리기 → PR close → 브랜치 삭제이고, `git status --porcelain`이 비어 있는 것이 복원
  판정이다. **E16 으로 이 Task 가 끝내 실행되지 않으면** 버리는 PR 이 열린 채 남는다 — 그때는
  Validation 의 unmet 분기를 지난 뒤 PR 을 닫고 브랜치를 지우는 것이 milestone 의 마지막 행위다
  (unprotected `main` 에 test 파일을 지우는 커밋이 달린 열린 PR 을 남기지 않는다 — R2 invariant).

### Task 7: PRD·문서를 실측으로 정정하고 M4를 등재한다

- **Action**: PRD `Delivery Milestones`의 M4 행은 **이미 등재돼 있다**(`:139`, `in-progress` —
  E15 정정). 그러므로 이 Task 가 하는 일은 추가가 아니라 **값 갱신과 status 전이**다(J1 → C: M5 행은 만들지
  않는다). `Success Metrics` #1의 분모를 391로, #4를 축 D 실증 결과로 갱신. OQ3을 Task 4
  판정에 따라 종결하거나 "결정됨 · 시행 미완"으로 기록. M3 행의 "라이브 산출물 넷 전부
  미충족"을 실제 상태로 정정(E15). `m3-enforcement.md` §7 표의 3·4행 갱신.
  `codex-findings-backlog.md`에 **H1~H7**을 ci-full-suite 귀속 + 발현 조건과 함께 적재.
- **Mirror**: `m3-enforcement.md` §7a — 사유가 소멸하면 그 소멸을 별도 절로 기록하고 이전
  문장을 지우지 않는다.
- **Validate**: PRD milestone 표 행 수가 **4**이고 4행의 `Plan` 셀이 실재 경로를 가리킨다.
  `grep -c "넷 전부 미충족"` = 0. backlog 승계 표에 **여덟 행**(H1~H6 · H7 · H8)이 실재한다 — 본문이 "H1~H7 일곱"이라 적었으나 표는 여덟이다(R2 test LOW).

## Validation

**이 블록이 라이브 산출물의 판정자다.** 초안에서는 `gh` 호출이 0건이라 라이브 산출물 0/5
상태에서도 green이 될 수 있었다(fable J6). R1 흡수는 `gh` 호출을 넣었지만 **그 코드를 한 번도
실행하지 않았고**, R2 섀도 패널 4/4가 그 사실을 독립으로 잡았다(아래 `## R2 흡수`).

**그래서 이 블록은 실행됐다.** 아래 오라클의 판정부는 실재 artifact(run `34176861426`의
`gate.json`·`measurement.json`)와 실재 `.github/test-suite-exclusions.json`, 그리고 합성
baseline 트리에 대해 계획 단계에서 실제로 돌렸다 — 그 실행이 shape 결함 셋(격리 목록이
top-level 배열 · `gh run download -n`의 레이아웃 · walker의 `return`/`continue`)을 냈고 전부
여기 반영돼 있다. 산출물은 `## R2 실측`이 값으로 싣는다.

```bash
set -eu
cd "$(git rev-parse --show-toplevel)"
DOC=docs/ci-full-suite/m4-live-closure.md
NWO=$(gh repo view --json nameWithOwner -q .nameWithOwner)   # 하드코딩 금지(R2 A10·inv-11)
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT                # R2 inv-15·S-F9: 누수 없음

# `$DOC` 부재는 "값 없음"이 아니라 **미수행**이다. `set -e` 가 rd() 안에서 죽으면 진단이
# 안 나오므로(R2 A11) 여기서 먼저 끊는다. 값 형식은 백틱/평문 **둘 다** 허용한다 —
# R1 블록은 rd()가 백틱을 요구하면서 axis-c 는 평문으로 grep해 서로 어긋나 있었다(R2 inv-13).
[ -f "$DOC" ] || { echo "FAIL: $DOC 부재 — 라이브 산출물이 하나도 수행되지 않았다"; exit 1; }
rd() { node -e '
  const fs=require("fs");
  const m=fs.readFileSync(process.argv[1],"utf8").match(new RegExp("^- "+process.argv[2]+": `?([^`\n]+?)`?\\s*$","m"));
  process.stdout.write(m?m[1].trim():"")' "$DOC" "$1"; }
# 진단은 **stderr** 로 낸다. 모든 호출부가 `X=$(need …)` 라 stdout 으로 내면 메시지가
# 변수에 담기고 `set -e` 가 아무 출력 없이 죽는다 — 바로 위에서 `$DOC` 부재를 선차단한
# 이유와 같은 함정을 helper 안에서 되풀이한 것이었다(R3 architect·invariant).
need() { v=$(rd "$1"); [ -n "$v" ] || { echo "FAIL: $DOC 에 '- $1:' 이 없다 — $2" 1>&2; exit 1; }; printf '%s' "$v"; }
# 숫자 전용 값의 공통 가드. `$PRN` 에만 빠져 있어 `gh pr view` 가 URL·브랜치명까지
# 받아들였다(R3 security).
numeric() { case "$2" in ''|*[!0-9]*) echo "FAIL: $1 값 '$2' 가 숫자가 아니다" 1>&2; exit 1 ;; esac; }

# ── 로컬 오라클 ─────────────────────────────────────────────────────────────
# MCCP_CODEX_DISABLED=1은 §3.4 요건이다. `run.js`는 FORCED_POLICY_ENV로 스스로 강제하므로
# 검사 2에는 불필요하지만, 이 raw `node --test`는 그 강제 밖이다.
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  scripts/tests/wiring-cut.test.js scripts/tests/ci-required-checks.test.js \
  scripts/tests/test-suite-coverage.test.js scripts/tests/container-check.test.js

node scripts/test-suite/run.js --exclude-from .github/test-suite-exclusions.json --json \
  > .claude/cache/m4-measurement.json
node scripts/test-suite/gate.js --measurement .claude/cache/m4-measurement.json \
  --exclude-from .github/test-suite-exclusions.json \
  --floor-from .github/test-suite-floor.json --base-ref origin/main --json

# 절단 가드(Task 1). R2 inv-7·T9 흡수 둘:
#   (a) 비영점만 보면 오타·모듈 로드 실패도 통과한다 → **사유 코드**를 단언한다.
#   (b) 가드가 없으면 이 줄 자체가 `git rm scripts/tests/wiring-cut.test.js` 를 실행하고
#       `set -e` 로 죽어, 머지 차단 workflow 의 자기 test 를 지운 채 끝난다. 그래서 트리
#       판정을 **경로 한정 + 즉시 복원**으로 한다(전체 트리 `git status` 는 M4 편집 때문에
#       상시 dirty 라 항상 붉었다 — R2 A8).
# `git checkout HEAD --` 로 복원하면 **Task 1 의 미커밋 편집이 날아간다** — 그 파일은
# `Files to Change` 의 UPDATE 대상이다. 그러면 1회차는 증거를 파기하고 exit 1 하고,
# 2회차는 Task 1 이전 파일로 test 를 돌려 **green** 이 된다(R4 invariant CRITICAL).
# 그래서 HEAD 가 아니라 **호출 직전 스냅샷**에서 되돌리고, 판정도 HEAD 대비가 아니라
# 스냅샷 대비로 한다.
GUARD_TARGET=scripts/tests/wiring-cut.test.js
GUARD_SNAP="$WORK/guard-target.snap"
cp "$GUARD_TARGET" "$GUARD_SNAP"
restore_guard_target() {
  if [ ! -f "$GUARD_TARGET" ] || ! cmp -s "$GUARD_TARGET" "$GUARD_SNAP"; then
    cp "$GUARD_SNAP" "$GUARD_TARGET"; git add -- "$GUARD_TARGET" 2>/dev/null || true; return 0
  fi
  return 1
}
GUARD_OUT="$WORK/guard.txt"; rc=0
node scripts/test-suite/wiring-cut.js --apply-delete scripts/tests/wiring-cut.test.js \
  > "$GUARD_OUT" 2>&1 || rc=$?
if [ "$rc" -eq 0 ]; then
  restore_guard_target || true
  echo "FAIL: 자기 test 파일이 절단 대상으로 수락됐다(스냅샷에서 복원함)"; exit 1
fi
grep -qE 'selftest_target|selftest_list_unreadable' "$GUARD_OUT" || {
  echo "FAIL: 거부는 됐으나 Task 1 이 정한 사유 코드가 없다 — 무관한 실패와 구분되지 않는다"
  cat "$GUARD_OUT"; exit 1; }
if restore_guard_target; then
  echo "FAIL: 거부됐는데 대상 파일이 변경됐다(스냅샷에서 복원함)"; exit 1
fi

# ── 라이브 산출물 1·2 (축 D) ────────────────────────────────────────────────
# R2 S-F2 흡수: run id 를 **이 milestone 에 결속**한다. 결속이 없으면 이미 존재하는
# `34174703512`(E3 — blocked/stage1/suite_red)를 적어 넣는 것만으로 Acceptance 1 이
# 충족됐다. 새 CI 작업 0회로 통과 가능한 단언은 판정자가 아니다.
A=$(need "axis-d-a-run" "축 D 절단 A의 CI run")
B=$(need "axis-d-b-run" "축 D 절단 B의 CI run")
AXIS_BRANCH=chore/axis-d-negative-control
for r in "$A" "$B"; do
  numeric "run id" "$r"
  # `eval "$(gh …)"` 를 쓰지 않는다. 이유 둘 (R3 security·invariant):
  #   (1) git refname 은 백틱·`$()`·`;` 를 허용하고 `test-suite.yml` 은 fork PR 에서도
  #       발화하므로, headBranch 가 **기여자가 정하는 문자열**로 eval 에 들어간다.
  #   (2) 명령 치환은 종료 상태를 전파하지 않아 `gh` 실패 시 `eval ""` 가 exit 0 이 되고,
  #       루프 2회차가 **1회차 run 의 값을 그대로 물려받아** 통과한다.
  # 필드별 개별 read 면 둘 다 사라진다.
  c=$(gh run view "$r" --json conclusion   -q .conclusion)
  hb=$(gh run view "$r" --json headBranch  -q .headBranch)
  wf=$(gh run view "$r" --json workflowName -q .workflowName)
  at=$(gh run view "$r" --json createdAt   -q .createdAt)
  [ "$c" = "failure" ]        || { echo "FAIL: run $r conclusion=$c (기대 failure)"; exit 1; }
  [ "$hb" = "$AXIS_BRANCH" ]  || { echo "FAIL: run $r headBranch=$hb (기대 $AXIS_BRANCH) — 다른 브랜치의 기존 run 을 축 D 증거로 쓸 수 없다"; exit 1; }
  # 실측값이다: `gh run view --json workflowName` 은 workflow 의 `name:` 을 돌려주고
  # 그 값은 `test-suite`(하이픈)다. `full test suite gate` 는 **job** 이름이라 이 필드에
  # 절대 오지 않는다 — 앞 판에서 그 둘을 적어 이 단언이 영원히 불통과였다(R3 3인 독립 지적).
  [ "$wf" = "test-suite" ] || { echo "FAIL: run $r workflowName=$wf (기대 test-suite) — 강제 workflow 가 아니다"; exit 1; }
  # 하한은 **baseline dispatch 시각**이다. 앞 판은 `2026-09-08T00:00:00Z` 를 썼는데 E3 의
  # 기존 run 셋이 같은 날 00:51~01:30 이라 전부 통과해 **아무것도 배제하지 못했다**(R4).
  # 결속을 실제로 지는 것은 headBranch 이고 이 하한은 그 보조다.
  [ "$at" \> "2026-09-08T06:31:11Z" ] || { echo "FAIL: run $r 은 $at 생성 — baseline dispatch(34195014409)보다 앞선 run 이다"; exit 1; }
done
# `-n <name>` 하나에 파일 패턴이 없으면 gh 는 **artifact 이름 서브디렉토리를 만들지 않고**
# `--dir` 로 바로 푼다(실측: run 34176861426 으로 양쪽 형태 확인). R1 은 서브디렉토리를
# 가정해 ENOENT 였다(R2 A2·T6·inv-9).
gh run download "$A" -n test-suite-gate --dir "$WORK/a"
gh run download "$B" -n test-suite-gate --dir "$WORK/b"
node -e '
const fs=require("fs"),p=require("path");
const rd=d=>JSON.parse(fs.readFileSync(p.join(d,"gate.json"),"utf8"));
const a=rd(process.argv[1]), b=rd(process.argv[2]), bad=[];
if(a.blocked!==true||a.stage!==1||!(a.reasons||[]).includes("suite_red")) bad.push("A: "+JSON.stringify({blocked:a.blocked,stage:a.stage,reasons:a.reasons}));
if(b.blocked!==true||b.stage!==2||!(b.reasons||[]).includes("deleted_without_allowance")) bad.push("B: "+JSON.stringify({blocked:b.blocked,stage:b.stage,reasons:b.reasons}));
if(a.stage===b.stage) bad.push("A와 B의 stage가 같다 — 두 절단이 같은 것을 재고 있다");
if(bad.length){console.error(bad.join("\n"));process.exit(1)}
' "$WORK/a" "$WORK/b"
# E19: artifact 는 90일 뒤 사라지므로 tracked 사본이 증거다. R1 은 그것을 Acceptance 로만
# 요구하고 판정하지 않아, 커밋을 건너뛰어도 붉어지지 않았다(R2 T10).
for f in axis-d-a-gate.json axis-d-b-gate.json; do
  git ls-files --error-unmatch "docs/ci-full-suite/$f" >/dev/null 2>&1 || {
    echo "FAIL: docs/ci-full-suite/$f 가 tracked 가 아니다 — artifact 만으로는 90일 뒤 증거가 사라진다"; exit 1; }
done
cmp -s "$WORK/a/gate.json" docs/ci-full-suite/axis-d-a-gate.json || { echo "FAIL: tracked 사본이 run $A 의 gate.json 과 다르다"; exit 1; }
cmp -s "$WORK/b/gate.json" docs/ci-full-suite/axis-d-b-gate.json || { echo "FAIL: tracked 사본이 run $B 의 gate.json 과 다르다"; exit 1; }

# ── 라이브 산출물 3·4 (OQ3 + 격리 재판정) ───────────────────────────────────
B4=$(need "baseline-run" "OQ3 baseline dispatch run")
case "$B4" in ''|*[!0-9]*) echo "FAIL: baseline run id '$B4' 가 숫자가 아니다"; exit 1 ;; esac
gh run download "$B4" --dir "$WORK/bt"    # `-n` 없음 → artifact 이름 서브디렉토리가 생긴다
# 수용 조건에서 `redaction_ok === true` 는 **뺀다 — 실측 근거가 있다**(E24). baseline 은
# 격리를 적용하지 않으므로 `leadtime.test.js` 가 자기 fixture 로 단언하는
# `'C:/repo/.claude/plans/x.plan.md'` 가 스캔 대상에 들어오고, `win-drive-abs`
# (`scripts/test-suite/redact.js:164`)가 그 `C:/` 3글자를 잡아 **네 leg 전부 `redaction_ok:false`** 다.
# 즉 `.github/workflows/test-suite-baseline.yml:28` 이 선언한 3원 수용 조건은 그 파일이 격리에 있는 한
# 구조적으로 충족 불가다(그 사실 자체를 backlog H9 로 적재한다). 대신 게시 관련
# 불변식만 강제한다 — hit 이 전부 `failing[].error` 안에 있을 것(우리는 그 필드를 어디에도
# 복사하지 않는다). 나머지 둘(`ok`·`per_file==files_total`)은 그대로 강제한다.
# `conclusion=success` 는 **판정에 쓰지 않는다** — 측정 step 이 `continue-on-error:true` 라
# run.js 가 죽어 빈 artifact 를 남겨도 success 다(R2 inv-12).
# 오라클을 **여기서 만든다**. 앞 판은 이 파일을 호출만 하고 아무 데서도 생성하지 않아
# MODULE_NOT_FOUND 였다(R3 3인 독립 지적). 구분자를 **인용**했으므로(`<<'ORACLE_EOF'`)
# 본문은 확장되지 않는다 — 본문에 백틱과 `$` 가 있어 인용을 벗기면 즉시 깨진다.
cat > "$WORK/oq3-quarantine.js" <<'ORACLE_EOF'
const fs=require("fs"),p=require("path"),cp=require("child_process");
const { globToRegExp } = require(process.cwd()+"/scripts/test-suite/enumerate.js");
const { MAX_PATTERN_WILDCARDS } = require(process.cwd()+"/scripts/test-suite/exclusions.js");
const BT=process.argv[2], DOC=process.argv[3];
const doc=fs.existsSync(DOC)?fs.readFileSync(DOC,"utf8"):"";
const rd=k=>{const m=doc.match(new RegExp("^- "+k+": `?([^`\n]+?)`?\\s*$","m"));return m?m[1].trim():"";};
const arr=(j,w)=>{if(!Array.isArray(j))throw new Error(w+" must be a top-level ARRAY");return j;};
const bad=[];

// leg 수집. ok/attribution 검사가 per_file 검사보다 **먼저** 와야 한다 —
// scripts/test-suite/run.js:219 가 `per_file: ok ? perFile : null` 이라, 순서를 뒤집으면 ok:false 인 leg 가
// `continue` 로 조용히 빠져 "불완전 측정" throw 가 도달 불가가 된다(R3 3인 독립 지적).
const legs={linux:[],windows:[]}; const wall={};
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);
  if(e.isDirectory()){w(f);continue} if(!e.name.endsWith(".json"))continue;
  let j=null;try{j=JSON.parse(fs.readFileSync(f,"utf8"))}catch(_){continue}
  if(!j||typeof j!=="object"||!("ok" in j)||!("attribution" in j))continue;
  if(j.ok!==true||j.attribution!=="complete")throw new Error("불완전 측정: "+f);
  if(!Array.isArray(j.per_file)||j.per_file.length!==j.files_total)throw new Error("per_file != files_total: "+f);
  if(Array.isArray(j.redaction_degraded)&&j.redaction_degraded.length)throw new Error("redaction 스캐너 degraded: "+f);
  // 절삭된 스캔은 "깨끗하다"가 아니라 "인증할 수 없다"이다. scripts/test-suite/run.js:607 이 이 필드를 emit 한다.
  if(j.redaction_scan_truncated===true)throw new Error("redaction 스캔 절삭: "+f);
  // redaction_ok=false 인데 hits 가 비면 원인이 chunk 단계에 있다는 뜻이다 —
  // scripts/test-suite/run.js:605 의 두 항 중 `folded.redaction_ok` 는 :606 이 덮어쓰는 hits 에 안 실린다.
  // 그 경우 아래 위치 판정이 0회 순회로 통과하므로 여기서 끊는다(R4 security·invariant).
  if(j.redaction_ok!==true&&!(j.redaction_hits||[]).length)
    throw new Error("redaction_ok=false 인데 hits 가 비었다(chunk 단계 유출 가능): "+f);
  // `redaction_ok === true` 는 **요구하지 않는다**(실측 근거). 격리된 leadtime.test.js 가
  // 자기 fixture 로 'C:/repo/...' 를 단언해 win-drive-abs 가 3글자를 잡으므로, 격리를
  // 적용하지 않는 baseline 은 네 leg 전부 false 다. 대신 게시 관련 불변식만 강제한다:
  // hit 은 전부 failing[].error 안이어야 하고(우리는 그 필드를 어디에도 복사하지 않는다),
  // 그 밖의 경로에 걸리면 차단한다.
  for(const h of (j.redaction_hits||[])) if(!/^\$\.failing\[\d+\]\.error$/.test(String(h.at)))
    bad.push("redaction hit 이 failing[].error 밖이다("+f+"): "+JSON.stringify(h));
  const k=/win/i.test(String(j.platform||j.os||f))?"windows":"linux";
  wall[k]=Math.max(wall[k]||0,j.wall_clock_ms||0); legs[k].push(j);
}})(BT);
// 양 축을 **모두** 센다. 앞 판은 linux 만 세어, windows artifact 가 통째로 없어도
// winOnly=[] → 'linux-only' → OQ3 종결이 됐다(R3 3인 독립 지적: "부재는 green 이 아니다"의 위반).
for(const k of ["linux","windows"]) if(legs[k].length<2) throw new Error(k+" leg 이 "+legs[k].length+"개 — matrix 4원소를 기대한다");

const setsOf=list=>{const red=new Set(),green=new Set();
  for(const j of list){ for(const x of j.per_file){ if(x.fail>0)red.add(x.file); else if(x.tests>0)green.add(x.file);} 
    for(const f of (j.failing||[])) if(f&&f.file) red.add(f.file); }
  red.forEach(f=>green.delete(f)); return {red,green};};
// red 는 per_file.fail 과 failing[] 의 **합집합**이다. 둘이 서로의 맹점을 덮는다 —
// per_file.fail 은 MAX_FAILING 절삭에 면역이고(fail++ 이 가드보다 앞), failing[] 는
// whole-file crash 를 kind:'file' 로 싣는다(roll-up 분기가 fail 을 안 올린다).
const lin=setsOf(legs.linux), win=setsOf(legs.windows);
const winOnly=[...win.red].filter(f=>!lin.red.has(f));
const ratio=wall.windows/wall.linux;
// 규범 규칙의 **중첩 구조를 그대로** 쓴다(`test-suite-baseline.yml` L20-22 · PRD `:145`):
// "Windows 전용 red 0건 → Linux 단독, 1건 이상 → matrix 에 넣되 벽시계가 10배를 넘으면
// 별도 트리거". 앞 판은 ratio 를 무조건 먼저 봐서 `winOnly==0 ∧ ratio>10` 에서 규범과
// 반대 결론을 냈고, 그것은 **측정 후 규칙 변경**이라 이 계획 자신이 금지한 행위다
// (R4 architect). 오늘 값(ratio 4.02)이 그 차이를 가리고 있었을 뿐이다.
const derived = winOnly.length===0 ? "linux-only" : (ratio>10 ? "separate-trigger" : "matrix");
// **재도출값을 문서와 대조한다.** 앞 판은 derived 를 console.log 만 하고 어디에도 비교하지
// 않아, 문서에 `linux-only` 를 적어도 통과했다 — Task 4 와 R2 흡수 표가 "불일치하면 실패"
// 라 적은 바로 그 검사가 코드에 없었다(R4 4인 중 3인 독립 지적).
const claimedRow=rd("oq3-dd8-row");
if(claimedRow!==derived)bad.push("DD8 행 불일치: 문서=\""+claimedRow+"\" 재도출=\""+derived+
  "\" (windows 전용 red "+winOnly.length+"건 · 벽시계비 "+ratio.toFixed(2)+")");
if(derived!=="linux-only"&&!/^- oq3-enforcement-owner: \S/m.test(doc))
  bad.push("DD8 행이 "+derived+" 인데 시행 소유자가 비어 있다 — 결정 기록으로 시행을 대신하지 않는다");
const claimedWin=rd("oq3-windows-only-red");
if(String(claimedWin)!==String(winOnly.length))
  bad.push("oq3-windows-only-red 불일치: 문서="+claimedWin+" 재도출="+winOnly.length);

const Qe=arr(JSON.parse(cp.execSync("git show origin/main:.github/test-suite-exclusions.json",{encoding:"utf8"})),"origin/main exclusions");
// 과거 목록에는 **개수 상한을 적용하지 않는다**. validateExclusions 는 개수 캡을 함께
// 강제하는데 Task 5 가 바로 그 상수를 내리므로, 그대로 걸면 해제가 성공한 순간
// origin/main 의 6원소가 RangeError 를 내 Validation 이 자기 성공에 죽는다(R3 CRITICAL).
for(const e of Qe){const w=(String(e.pattern).match(/\*/g)||[]).length;
  if(w>MAX_PATTERN_WILDCARDS)bad.push("origin/main 패턴 wildcard 초과: "+e.pattern);}
const Q=Qe.map(e=>e.pattern);
const nowList=arr(JSON.parse(fs.readFileSync(".github/test-suite-exclusions.json","utf8")),"exclusions");
const nowPat=new Map(nowList.map(e=>[e.pattern,e]));
const hit=(pat,s)=>{const re=globToRegExp(pat);return [...s].some(f=>re.test(f));};
const released=[],residual=[],unmeasured=[];
for(const x of Q){ if(hit(x,lin.red))residual.push(x); else if(hit(x,lin.green))released.push(x); else unmeasured.push(x); }
const novel=[...lin.red].filter(f=>!Q.some(x=>globToRegExp(x).test(f)));
released.forEach(x=>{if(nowPat.has(x))bad.push("해제 대상 "+x+" 가 목록에 남아 있다")});
residual.forEach(x=>{const e=nowPat.get(x);
  if(!e)return bad.push("잔존 red "+x+" 가 목록에서 사라졌다");
  const r=String(e.reason||"");
  // 문구를 하나로 고정하지 않는다 — 6건 중 그 리터럴을 가진 것은 1건뿐이었다(R3).
  // 재측정 근거의 표지는 이 run id 다.
  if(!r.includes(String(rd("baseline-run")||"@@none@@")))bad.push("잔존 "+x+" 사유에 baseline run id 가 없다(재측정 근거 미갱신)");});
// Acceptance 4 는 세 집합의 **값 기록**을 요구한다. 앞 판은 출력만 하고 문서를 보지 않았다.
for(const [k,v] of [["quarantine-released",released.length],["quarantine-residual",residual.length],["quarantine-novel",novel.length]]){
  const c=rd(k); if(String(c)!==String(v))bad.push(k+" 불일치: 문서="+c+" 재도출="+v);
}
// `Q`(origin/main)와 편집 대상(working tree)이 서로 다른 목록이면 한 판정에 두 입력이 섞인다.
// 브랜치에만 있는 항목은 사유 갱신 요구를 통째로 빠져나가고, main 에만 있는 항목은 novel 로
// 오분류돼 차단한다(R4 architect LOW). 둘의 패턴 집합이 같은지 명시한다.
{ const a=[...Q].sort().join("\u0000"), b=[...nowPat.keys()].sort().join("\u0000");
  if(a!==b)bad.push("origin/main 격리 목록과 작업 트리 목록의 패턴 집합이 다르다 — 한 판정에 두 입력이 섞인다"); }
if(unmeasured.length)bad.push("측정되지 않은 격리 "+unmeasured.length+"건: "+unmeasured.join(", "));
if(novel.length)bad.push("신규 red "+novel.length+"건은 차단 사유다: "+novel.join(", "));
const { MAX_EXCLUSION_ENTRIES }=require(process.cwd()+"/scripts/test-suite/exclusions.js");
if(MAX_EXCLUSION_ENTRIES!==nowList.length)bad.push("MAX_EXCLUSION_ENTRIES="+MAX_EXCLUSION_ENTRIES+" != 격리 "+nowList.length+"건");
console.log(JSON.stringify({legs:{linux:legs.linux.length,windows:legs.windows.length},
  wall,ratio:Number(ratio.toFixed(2)),winOnly,derived,
  quarantine:{Q:Q.length,released,residual:residual.length,unmeasured,novel}},null,1));
if(bad.length){console.error("FAIL:\n"+bad.join("\n"));process.exit(1)}
console.error("ORACLE OK");
ORACLE_EOF
node "$WORK/oq3-quarantine.js" "$WORK/bt" "$DOC" || exit 1

# ── 라이브 산출물 5·5b (축 C) ───────────────────────────────────────────────
# 5는 진단 exit 0, 5b는 실제 차단력. 둘은 다른 명제다(E4).
prot=$(gh api "repos/$NWO/branches/main" -q '.protected')
if [ "$prot" = "true" ]; then
  node scripts/ci-required-checks.js || { echo "FAIL: 보호가 켜졌는데 진단이 비영점"; exit 1; }
  PRN=$(need "axis-d-pr" "축 C-2 를 관측할 PR 번호")
  numeric "PR 번호" "$PRN"   # 없으면 gh pr view 가 URL·브랜치명도 받는다(R3 security)
  # R2 S-F8 흡수: 아무 BLOCKED PR 이나 통과하면 안 된다. 리뷰 요건만 켜도 BLOCKED 가 되므로
  # (i) head 브랜치가 축 D PR 이고 (ii) 막고 있는 체크가 **이 게이트**임을 함께 단언한다.
  m=$(gh pr view "$PRN" --json mergeStateStatus -q .mergeStateStatus)
  hr=$(gh pr view "$PRN" --json headRefName     -q .headRefName)
  st=$(gh pr view "$PRN" --json state           -q .state)
  [ "$st" = "OPEN" ]          || { echo "FAIL: PR #$PRN state=$st — 닫힌 PR 의 mergeStateStatus 는 차단력의 증거가 아니다. Task 6 정리는 이 블록 **이후**다"; exit 1; }
  [ "$hr" = "$AXIS_BRANCH" ]  || { echo "FAIL: PR #$PRN headRefName=$hr (기대 $AXIS_BRANCH)"; exit 1; }
  [ "$m" = "BLOCKED" ]        || { echo "FAIL: mergeStateStatus=$m (기대 BLOCKED · 보호 부재면 UNSTABLE · draft면 DRAFT · strict 면 BEHIND)"; exit 1; }
  gh pr checks "$PRN" --json name,state -q '.[]|select(.state!="SUCCESS")|.name' | grep -qx "full test suite gate" || {
    echo "FAIL: PR #$PRN 을 막는 실패 체크에 'full test suite gate' 가 없다 — 다른 축이 막고 있다"; exit 1; }
  # enforce_admins: world-readable `branches/main` 응답에 **이 필드가 없다**(실측 —
  # `.protection` 은 {enabled, required_status_checks} 뿐). Task 2 가 admin 전용 채널을
  # 판독 경로에서 뺀 뒤로는 이 계정에 관측 채널이 없다(R2 S-F5·inv-10). 그래서 값 자체를
  # 요구하지 않고 **누가 무엇을 확인했는지**를 tracked 증거로 요구한다 — 조용히 넘어가는
  # 것만은 막는다.
  ea=$(rd "enforce-admins")
  case "$ea" in
    true) : ;;
    # 존재-only grep 은 `- enforce-admins-rationale: ` 한 줄(빈 값)로 충족된다 — 축 C 를
    # 봉인하는 두 필드에만 가장 약한 원시함수를 쓰고 있었다(R3 security·invariant). 값이
    # 실제로 있는지, 그리고 한 문장은 되는지를 본다.
    false) r=$(rd "enforce-admins-rationale"); [ "${#r}" -ge 30 ] || { echo "FAIL: enforce_admins=false 인데 근거가 없거나 너무 짧다(len=${#r}) — 유일 admin 이 체크에서 면제되면 E4 의 '차단력 0' 이 gh pr merge --admin 한 번으로 재현된다"; exit 1; }; ;;
    *) echo "FAIL: '- enforce-admins:' 가 true|false 가 아니다(값='$ea'). 이 계정은 그 필드를 읽을 채널이 없으므로 설정 수행자(idenn207)가 값을 기록해야 한다"; exit 1 ;;
  esac
else
  # 관측이 unprotected인데 문서가 met을 주장하면 **관측이 이긴다**.
  grep -qE '^- axis-c: `?unmet' "$DOC" || {
    echo "FAIL: main이 unprotected로 관측됐다. \$DOC 는 'axis-c: unmet'을 적어야 하며 met 주장은 관측과 모순이다."; exit 1; }
  # 존재-only grep 은 빈 값으로 충족된다. E16 때문에 **실제로 실행되는 분기가 여기**인데
  # 축 C 실패 사유 필드에 가장 약한 원시함수가 남아 있었다(R4 security·test).
  bl=$(rd "axis-c-blocker"); [ "${#bl}" -ge 30 ] || { echo "FAIL: 축 C 미충족 사유가 없거나 너무 짧다(len=${#bl})"; exit 1; }
  echo "NOTE: main is unprotected — 축 C 미충족으로 기록됨(E16 admin 권한 부재)."
fi

# ── 문서·버전 ───────────────────────────────────────────────────────────────
node scripts/version-declaration-guard.js --base origin/main
# R2 A5·T2·inv-5 흡수: `grep -q '^| 4 |'` 는 **오늘 이미 통과한다** — Success Metrics 4행
# (`:112`)과 milestone 4행(`:139`)이 둘 다 매치하고 후자는 이미 등재돼 있다. 표를 구분해
# milestone 표의 4행이 실재 plan 경로를 가리키는지를 본다.
# `.*` 가 Status 열을 삼켜 `in-progress` 인 오늘도 통과했다(R4 3인 지적). Status 셀을
# **명시 캡처**해 Task 7 의 실제 산출물(전이)을 단언한다.
node -e '
const s=require("fs").readFileSync(".claude/prds/ci-full-suite.prd.md","utf8");
const row=s.split("\n").find(l=>/^\| 4 \| enforcement-live-closure \|/.test(l));
if(!row){console.error("FAIL: PRD milestone 표의 4행이 없다");process.exit(1)}
const c=row.split("|").map(x=>x.trim());
const status=c[c.length-3], plan=c[c.length-2];
if(!/ci-full-suite-m4\.plan\.md/.test(plan)){console.error("FAIL: Plan 셀이 이 계획을 가리키지 않는다: "+plan);process.exit(1)}
if(status!=="complete"){console.error("FAIL: M4 행 status=\""+status+"\" (기대 complete)");process.exit(1)}'
# R2 T3·inv-6 흡수: `grep -c '넷 전부 미충족' = 0` 는 **삭제를 요구**했다 — 그 문장은
# `:138` 에 `~~취소선~~` + 2026-09-08 정정과 함께 보존돼 있고, 보존은 Task 7 의 Mirror
# (`m3-enforcement.md` §7a — "이전 문장을 지우지 않는다")가 명령하는 바로 그 형태다.
# 검사를 뒤집는다: 그 문장이 **취소선 안에** 있고 정정이 뒤따르는지를 본다.
node -e '
const s=require("fs").readFileSync(".claude/prds/ci-full-suite.prd.md","utf8");
const naked=s.split("\n").filter(l=>l.includes("넷 전부 미충족")&&!/~~[^~]*넷 전부 미충족/.test(l));
if(naked.length){console.error("FAIL: 정정되지 않은 (취소선 밖) stale 문장 "+naked.length+"줄");process.exit(1)}
if(!/정정\(2026-09-08/.test(s)){console.error("FAIL: 2026-09-08 정정 문장이 없다");process.exit(1)}'
# backlog 승계: 표는 H1~H6 + H8 + H7 로 **여덟 행**이다(R2 T12 — 본문이 "일곱"이라 적었다).
# R3 3인 독립 지적: 이 루프는 **계획 자신**을 grep 하고 있었다. 그 표는 지금도 있으므로
# 오늘 M4 작업 0으로 통과했다. Task 7 이 실제로 갱신해야 하는 파일은 backlog 쪽이다.
BL=.claude/plans/codex-findings-backlog.md
# H8 은 철회됐고(거짓 전제) H9·H10 이 R4 에서 생겼다. 열거를 표와 맞춘다 — 앞 판은 H8 을
# 요구하고 H9 를 빠뜨려, 방금 발견한 결함이 원장에 안 들어가도 green 이었다.
for h in H1 H2 H3 H4 H5 H6 H7 H9 H10; do
  grep -q "ci-full-suite:$h" "$BL" || { echo "FAIL: $BL 에 ci-full-suite:$h 적재가 없다"; exit 1; }
done

echo "VALIDATION REACHED END"
```

축 C 분기는 **완화가 아니라 정직화**다 — `main`이 보호되지 않은 동안 exit 0을 요구하면
Acceptance가 외부 권한에 인질이 되고, 요구를 없애면 미충족이 조용해진다. 분기는 둘 다 피해
**상태를 문서에 적었는지**를 대신 강제한다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **`enforce_admins` 를 이 계정으로는 관측할 수 없다** | **높음** | 실측: world-readable `branches/main` 의 `.protection` 에 그 필드가 **없고**, Task 2 가 admin 전용 채널을 판독 경로에서 뺀다. 채널을 지어내지 않는다 — 설정 수행자(`idenn207`)의 관측을 tracked 증거로 요구하고, 값이 없으면 축 C 를 met 으로 봉인할 수 없게 한다. 이것은 완화가 아니라 **명시된 미관측**이다 |
| **축 D run id 가 기존 run 으로 충족될 수 있었다** | 중 | R2 security 가 실증: `34174703512`(E3)이 이미 `blocked/stage1/suite_red` 라, 결속 없는 단언은 그 번호를 적는 것만으로 통과했다. `## Validation` 이 `headBranch`·`workflowName`·`createdAt` 을 함께 단언해 닫았다 |
| **milestone 이 E16 에서 중단되면 열린 PR 이 남는다** | 중 | 그 PR 은 unprotected `main` 을 향해 tracked test 파일을 지우는 커밋을 싣는다. 기계 backstop 은 `gate.js` stage 2 `deleted_without_allowance`(floor `allow_deletions: []`)이지만 unprotected `main` 에서 red 는 아무것도 막지 못한다(E4 가 그 증거다). 그래서 정리를 Task 6 안이 아니라 **milestone 의 마지막 행위**로 못박았다 — 축 C 가 미충족이어도 PR 은 닫힌다 |
| **Task 6이 권한 부재로 영영 실행되지 않아 축 C가 미충족으로 남는다** | **높음** | E16이 이미 관측된 사실이다. 완화가 아니라 **명시**로 다룬다 — Validation의 축 C 분기가 상태 기록을 강제하고, 미충족이면 미충족이라 적고 ship한다 |
| 축 D 버리는 PR이 실수로 머지된다 | 낮음 | 제목에 `DO NOT MERGE` · 브랜치 접두 `chore/axis-d-` · 절단은 `--revert-*`로 되돌린 뒤 push하지 않는다. Task 6이 protection을 켜면 그 자신이 오머지 방지책이 된다 |
| 절단 B가 자기 증거 producer를 죽인다 | 중 | Task 1이 정확히 그것을 겨냥한다(E10b). 가드 없이 Task 3을 먼저 하면 red의 원인이 판별 불가다 |
| Windows 측정이 대량 red를 내 OQ3이 matrix로 기울고 벽시계가 2배가 된다 | 중 | DD8의 세 번째 행이 이미 그 경우를 갖는다. **규칙을 측정 후에 바꾸지 않는다.** 시행은 별도 소유자로 넘긴다 |
| 격리 해제가 상시 red를 다시 들인다 | 중 | 해제는 Linux 재측정에서 green인 것만. 해제 후 로컬 게이트와 이 PR 자신의 CI가 재확인한다 |
| `enforce_admins:false`로 설정해 축 C가 형식만 충족된다 | **중** | E20이 그 경로를 이름으로 지목한다. Task 6이 값을 정하고 근거를 runbook에 적는 것이 Acceptance의 일부다 |
| 이 PR 자신이 방금 켠 차단 게이트에 막힌다 | 중 | 의도된 동작이다. 막히면 그 red가 실재 결함이고 고쳐서 통과한다 — M3의 첫 발화(§7a)가 정확히 그 형태였다 |
| M4가 코드를 거의 안 바꿔 "완료"가 문서 갱신으로 반올림된다 | 중 | fable J6 흡수 — 라이브 산출물이 산문 체크박스가 아니라 `## Validation`의 fail-closed `gh` 단언이다 |
| **판독 채널 교체가 "보호 켜짐 × non-admin"에서 실제로 `contexts`를 보여주는지 미측정** | 중 | E1'은 `protected:false`에서만 측정됐고 그 구성은 "보호 없음"과 "안 보임"을 구분하지 못한다. 측정에는 축 C 설정이 선행이고 축 C는 E16에 막혀 있어 **오늘 닫을 수 없는 잔여**다. 완화가 아니라 **격리**로 다룬다 — 3분화 판별자가 그 경우를 `protection_unreadable`로 내고, 축 C 분기가 `.protected=true`일 때 exit 0을 요구하므로 그 상황은 조용히 통과하지 않고 **그 사유 코드와 함께 붉어진다**. Acceptance 5의 알려진 잔여 위험 |
| 격리 재판정이 자기 편집을 자기가 정당화한다 | 중 | `Q`를 편집 후 파일이 아니라 `git show origin/main:` 에서 읽는다. 편집 후에서 읽으면 해제분이 `Q`에서 사라져 `Q\L`이 항상 비고 오라클이 무력해진다(L2 test MEDIUM) |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

라이브 산출물 — 없으면 M4는 완료가 아니다. **반올림하지 않는다.**

1. **축 D-A** — 절단 A가 CI에서 red를 만든 run + 그 `gate.json`의 `blocked:true` · `stage:1` ·
   `reasons ∋ suite_red`. 사본을 tracked 커밋(E19)
2. **축 D-B** — 절단 B의 run + `blocked:true` · `stage:2` · `deleted_without_allowance`.
   **1과 stage가 달라야 한다**
3. **OQ3** — baseline dispatch run + artifact 4건 + DD8 표의 어느 행인지가 값과 함께 기록.
   `matrix`/`별도 트리거`면 "결정됨 · 시행 미완"과 시행 소유자를 이름으로
4. **격리 재판정** — `Q\L` · `Q∩L` · `L\Q` 세 집합의 값과 그에 따른 목록 편집(또는 무편집의 근거)
5. **축 C-1 (설정)** — `node scripts/ci-required-checks.js` **exit 0**. Task 2의 채널 교체가
   선행이다 — 그것 없이는 이 계정으로 도달 불가였다(E1x)
6. **축 C-2 (차단력)** — red인 PR의 `mergeStateStatus`가 `BLOCKED`, 그 PR 의 head 가
   `chore/axis-d-negative-control` 이고 **막고 있는 실패 체크에 `full test suite gate` 가 있으며**
   PR 이 아직 `OPEN` 이다(리뷰 요건만 켜도 `BLOCKED` 가 되므로 체크 이름까지 봐야 한다 — R2
   security). 그리고 `- enforce-admins:` 가 `true`, 또는 `false` + 근거가 기록돼 있다.
   **5와 별개 명제다**:
   PR #185가 green 게이트를 지나 머지된 것(E4)이 "설정이 있다"와 "머지가 막힌다"가 같지
   않음을 이미 보였다
7. **미충족의 명시** — 5·6이 권한(E16)으로 막히면 그 사실이 `m4-live-closure.md`에
   `axis-c: unmet` + 사유로 적힌다. 조용한 미충족이 없는 것이 이 항목의 요구다

## backlog 승계 (J1 → C: milestone 행을 만들지 않는다)

`codex-findings-backlog.md`에 **ci-full-suite 귀속 + 발현 조건**과 함께 적재한다. milestone
행으로 만들지 않는 이유: 이 항목들의 Acceptance는 스스로 "오늘 발현하지 않는다"이므로 오늘
측정 불가하고(UI5 · PRD "baseline 없는 지표에 목표치를 지어내지 않는다"), §3.11 C2에 따라
그런 행은 PRD 아카이브를 무기한 막는다.

| # | 항목 | 근거(실측) | 발현 조건 |
|---|---|---|---|
| H1 | `scripts/test-suite/enumerate.js#globToRegExp` 인접 무한 수량자 병합 | E11·E12 — 상한 8에서 4ms, 두 소비처 모두 검증기 경유 | 검증기 우회 소비처가 생기거나 상한이 올라갈 때 |
| H2 | `scripts/test-suite/redact.js` credential 클래스 + **게시 통제**를 한 단위로 | E17·E18 — 탐지만 더하면 `--merge-into`가 컨테이너를 BLOCK해 회귀가 된다. `redaction_hits`는 `{at,rule,length}`뿐이라 hit 기록 자체는 안전 | fixture 결합을 끊는 설계(예: 매치 구간 strip-in-place)가 정해질 때 |
| H3 | digest 앵커 공유 구현 계약 + 러너↔게이트 짝 단언 | R24 architect. producer `scripts/test-suite/run.js:580` → `scripts/test-suite/enumerate.js:84-90` | 새 모듈이 자체 digest/glob을 구현할 때 |
| H4 | NUL 규율 pin | E13 — 코드는 이미 `-z`, 단언 0건 | 회귀 방지(상시) |
| H5 | baseline `@v4` tag-pin → SHA-pin 패리티 | fan-out S3 | **OQ3이 matrix를 고르면 즉시 선행조건이 된다** |
| H6 | `tracked_basis` 재기준의 기계화 | E14 — 384 대 실제 391 | 정상 삭제 사이클이 두 번 돌아 여백이 소진될 때 |
| ~~H8~~ | ~~`CITATION_RE`가 점 시작 경로를 못 본다~~ **철회(R4)** | 전제가 거짓이었다 — `l1-check.js:71`의 `\.?`가 그 경우를 이미 덮는다. 없는 결함을 backlog에 올린 것이므로 지운다 | — |
| H9 | baseline 의 수용 3원 조건이 구조적으로 충족 불가 | E24 — `.github/workflows/test-suite-baseline.yml:28` 이 `redaction_ok === true` 를 요구하는데 네 leg 전부 `false` 다 | 상시. **격리 적용으로는 소멸하지 않는다** — windows 축의 원인 파일(`closure/tests/report.test.js`)이 격리 목록 밖이라, baseline 이 격리를 적용해도 그 두 leg 은 그대로 false 다. 두 fixture 가 모두 사라져야 소멸한다 |
| H10 | `scripts/test-suite/redact.js:322` 가 `MAX_HITS` 도달 시 `truncated` 를 세우지 않는다 | 실측 — 21번째 이후 hit 이 **조용히 사라지고** `redaction_scan_truncated` 는 false 로 남는다. 탐지가 상한에서 fail-open 한다 | 상시. hit 이 20건을 넘는 run 이 나오면 즉시 발현 |
| H7 | 라운드 원장 키잉 (PRD 축 대 milestone 축) | E15a·E15b + 위 이탈 기록 — **오늘 실제로 발화했다** | 상시. 세 게이트 전부에 걸리므로 C3 범위 밖 |

## Design Routing Guide

`impeccable-detect.js`가 `design_signal=true`를 냈고 `signal_files`는
`plugins/mccp/scripts/derive/tests/mask-secrets.test.js:25,34,51` 하나다. **이것은
오탐이다** — 그 경로는 이 계획의 `## Files to Change`에 없고 E18의 **인용**으로만
등장한다(credential fixture 결합 근거). 탐지기는 계획 본문의 경로 문자열을 보므로 인용과
변경 대상을 구분하지 못한다. 그럼에도 §3.9의 trigger는 OR이라 이 절을 기록한다 — 탐지가
발화했는데 아무 흔적이 없으면 다음 사이클이 그것을 침묵과 구분할 수 없다.

§3.10대로 **plan 단계는 recommend-only다**(렌더 표면이 아직 없다). 실제 라우팅은 implement
단계에서 일어나며, 이 계획의 산출물에 렌더 표면이 없으므로 그때도 `renderingSurface=0`으로
강등될 것이 예상된다. routing mode: `auto`.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

**이 계획의 승인 채널은 Codex가 아니라 L2 패널이다**(`MCCP_PLAN_REVIEW=multi-agent`).
Codex는 이 사이클에서 **다른 역할**로 한 번 발화했다 — 운영자가 UI4로 요구한 fable×codex
2중 리뷰의 한 축이며, 그 판정표는 위 `## 2중 리뷰 판정` 절이 소유한다.

### L2 패널 결과 — **divergent (4/4 fail)**

- reviewed_plan_hash: `sha256:4a9a7be1442bafc4dc9fce0692ab27d1dc5385d4e92e2d6d88c27e191f2d9417`
- quorum: 3/4 필요 · **0/4 통과** · blocking findings **9**
- 벽시계 379.6초 · 기록: `.claude/reviews/plan-review-ci-full-suite-m4.md`
- `decide` exit 12 → **receipt 미작성**. 이 계획은 패널 승인을 받지 못했다.

### 흡수 (HIGH 5건 — §3.14대로 그 자리에서)

세 축의 실재 결함이고 전부 계획 본문을 고쳐 닫았다.

| 축 | 지적자 | 무엇이 틀렸나 | 어떻게 닫았나 |
|---|---|---|---|
| **A** | security · invariant (독립 2건) | 축 C-2(차단력) 판정이 `gh` 관측이 아니라 **저자가 문서에 적은 문자열**을 읽었다. J6이 닫았다고 주장한 문서-반올림이 그 줄에서 열린 채였고, unprotected 관측 하에서도 문서의 `met` 주장이 통과했다 | Validation이 문서에서 읽는 것은 **PR 번호뿐**이고 상태는 `gh pr view --json mergeStateStatus`가 낸다. unprotected 관측 시 `axis-c: unmet` + 사유 명시를 **강제**한다 — 관측이 주장을 이긴다 |
| **B** | architect · test (독립 2건) | Task 2의 Mirror가 새 사유 코드를 `gate.js`의 닫힌 열거에 넣으라 했는데, 그 열거의 "죽은 선언 0" 단언은 producer 소스를 셋으로만 스캔하므로 `hits<2` **확정 red**가 되고 그 test는 머지 차단 workflow의 **판정 선행 step**이다 | 사유는 그것을 내는 모듈(`ci-required-checks.js`)이 소유한다. `gate.js` 열거는 **형태만** 빌린다 |
| **C** | test | 실제로 바뀌는 `readRequiredChecks`가 무-test다 — test 파일이 그것을 import조차 하지 않아 채널 교체가 반증 불가였다. "오늘 트리에서 `protection_absent` 재현"은 구·신 채널이 둘 다 absent를 내므로 판별력이 없다 | `gh` 스텁 `PATH`로 **spawn seam 단언** 추가 + 3분화 판별자(`protected` 값 기준)를 명시 |

### R1 이후 — MEDIUM/LOW도 흡수했다 (운영자 지시로 §3.14·§3.16 상향)

§3.14는 HIGH/CRITICAL만 그 자리에서 흡수하고 나머지는 backlog로 보내며, §3.16은 1라운드를
기본으로 한다. **운영자가 이 사이클에 한해 "cap을 올려 수렴할 때까지 반복"을 명시 지시했으므로**
두 기본값을 상향했다 — 지시가 관례를 이긴다. 그 결정과 그 근거를 여기 적는 것이 §3.16이
요구하는 이탈 기록이다.

R1의 MEDIUM/LOW 중 **실재하는 여섯을 계획 본문에서 닫았다**:

| # | 지적자 | 무엇이 틀렸나 | 어디서 닫혔나 |
|---|---|---|---|
| M1 | architect · invariant | 절단 가드 (a)의 파싱이 0건일 때의 극성 미정의 — workflow step이 개명되면 가드가 조용히 사라지고 규칙 (c)가 자기 test를 다시 적격으로 만든다 | Task 1 "파싱이 0건일 때의 극성" — `selftest_list_unreadable`로 **거부** + 음성 케이스 test 분기 |
| M2 | test · invariant | 격리 재판정 등식이 항등식이라 반증력 0, Validation은 한 줄 grep | Task 5 "비교 오라클의 반증력" (i)(ii)(iii) + `## Validation`이 baseline artifact에서 `L`을 **재계산**해 편집 결과와 대조 |
| M3 | test · invariant | `tracked_basis` 재기준이 floor.json 자신의 유지 규칙 밖이고, 그 위반이 test에 안 잡히며, 짝 키 `tracked` 미열거 | Task 5 "`tracked_basis`는 손대지 않는다" — 편집 철회. E14는 backlog H6 유지 |
| M4 | invariant | OQ3 판정이 artifact 개수 세기라 red baseline도 통과 | `## Validation` 라이브 산출물 3 — conclusion · 넷의 `ok`/`attribution` · DD8 행 열거 · 입력값 두 줄 |
| M5 | security · invariant | 판독 채널이 "보호 켜짐 × non-admin"에서 실제로 보이는지 미측정 | Task 2 "주장하지 않는 것" — 오늘 측정 불가임을 명시하고 판별자로 **격리**. `## Risks` 등재 |
| M6 | test (LOW) | 기존 `scripts/tests/ci-required-checks.test.js:33-41`이 Task 2가 바꿀 동작을 정답으로 고정 중인데 미명시 | Task 2 "바뀌는 기존 단언을 이름으로 적는다" — 교체를 Task 2의 산출물로 명시 |

남는 invariant MEDIUM들은 위 여섯과 **같은 결함의 다른 표면**이라(같은 표에서 축이 겹친다)
별도 행을 만들지 않는다. backlog로 보내는 것은 없다 — 실재한 것은 전부 닫았다.

**verdict는 여전히 위조하지 않는다.** 이 절은 R1이 `divergent`였다는 사실을 지우지 않는다.
재리뷰 결과는 그 라운드가 실제로 낸 값으로 아래에 append되며, 수렴하지 못하면 `divergent`가
그대로 봉인돼 cross-gate dedupe가 닫힌 채로 남고 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.


### R2 — 섀도 패널 4/4 fail. 실행되지 않은 판정자가 원인이었다

**이 라운드는 게이트 라운드가 아니었다. 그리고 그 정당화는 틀렸다 — R5 패널이 HIGH 로 차단했다.**
운영자가 "캡을 올려 수렴할 때까지 반복"을 명시 지시했고, 남은 게이트 라운드가 하나뿐이라
같은 네 역할(`mccp:review-*`)을 `Agent` 로 직접 띄워 반증을 받았다(R2·R3·R4, 리뷰어 launch
12건 이상). 그때 이 자리에 적은 근거는 "라운드 계수는 `emit-workflow-args` 가 하므로 이 경로는
**캡이 세는 대상이 아니다**"였다.

**그 문장을 철회한다.** R5 invariant 가 지적한 대로, 계수 chokepoint 를 우회하는 경로로 같은
자원을 쓰는 것은 "세는 대상이 아닌 것"이 아니라 **원장을 사실과 어긋나게 만드는 것**이다.
`plan-review/cli.js:518-528`(캡 BLOCK)과 `:586`(계수)이 같은 경로에만 있으므로, 그 경로를
피해 리뷰어를 띄우면 receipt 의 `meta.round_ledger_count` 는 3 을 말하지만 실제 리뷰어 발화는
19회 가까이 된다. §3.16 이 캡을 둔 이유가 "1라운드 규칙을 실행 주체의 성실성이 아니라 기계가
지키게 한다"는 것인데, 이 방식은 그것을 다시 성실성 문제로 되돌린다.

**운영자 승인은 행위를 정당화하지만 기록을 참으로 만들지는 않는다.** 반복 자체는 지시받은
것이고 은폐하지 않았다. 그러나 그 방법을 *계획 본문에 정당한 기법으로 적어 두는 것*은 별개
문제이고, 그것이 R5 가 "선례를 문서로 남겼다"고 지적한 지점이다. 그래서 근거를 철회하고
사실만 남긴다: **섀도 패널 3회를 돌렸고, 그 발화는 원장에 없다.** 이 계획을 근거로 같은
방식을 되풀이하지 마라. 다음 사이클이 리뷰를 더 돌려야 한다면 정당한 경로는 셋뿐이다 —
캡 상향(최대 3) · 범위 축소 후 새 심의 · §3.16 의 문서화된 감사 우회.

**같은 이유로 슬러그 재키잉도 이 사이클의 부채로 남는다.** E15a 의 3라운드 소진 뒤
`ci-full-suite-m4` 로 재봉인해 예산을 새로 얻은 것은 backlog H7 이 지적한 바로 그 방향이며,
계획이 그것을 H7 로 적재하면서 **이번 사이클에서는 그 예산을 썼다**(R5 invariant MEDIUM).

넷 모두 `fail`. 그리고 넷이 **독립으로 같은 진단**에 도달했다: R1 흡수가 `## Validation` 에
150줄 가까운 `bash`/`node` 를 새로 넣었는데 **그 코드는 한 번도 실행된 적이 없었다.**
그래서 이번에는 고치기 전에 **돌렸다** — 실재 artifact(run `34176861426`)와 실재
`.github/test-suite-exclusions.json`, 합성 baseline 트리에 대해. 그 실행이 아래 셋을 냈고,
셋 다 R1 블록을 **통과 불가**로 만드는 것이었다.

| # | 실측 | R1 블록에 대한 결과 |
|---|---|---|
| 1 | 격리 파일은 **top-level 배열**(6원소). R1 의 `q.exclusions \|\| q.exclude` → `Q.length = 0` | 해제/잔존 단언은 공허하고, `L` 전량이 `novel` 로 분류돼 **확정 실패** |
| 2 | `gh run download -n NAME --dir X` 는 `X/gate.json` 에 푼다(`-n` 없을 때만 서브디렉토리) | 축 D 단언이 ENOENT → `set -e` 로 블록 전체 중단 |
| 3 | 두 walker 가 `continue` 대신 `return` | 파손된 `.json` 형제 하나가 순회를 끊는다(재현: `found 0`, 기대 1) |

R2 가 추가로 낸 것 중 **실재하는 HIGH 아홉**을 전부 본문에서 닫았다:

| 축 | 지적자 | 무엇이 틀렸나 | 어디서 닫혔나 |
|---|---|---|---|
| 축 C-2 전이성 | architect · invariant | `mergeStateStatus` 는 전이 상태인데 Task 6 정리가 PR 을 닫아, **축 C 가 성공한 세계에서 Validation 이 통과 불가**였다 | Task 3·6 — 정리를 Validation **이후**로 이관 |
| 축 D 결속 부재 | security | 기존 run `34174703512` 이 이미 `blocked/stage1/suite_red` 라, 번호만 적으면 CI 작업 0회로 Acceptance 1 충족 | `## Validation` — `headBranch`·`workflowName`·`createdAt` 결속 |
| 빈 `declared` | architect · security | 포함 검사가 `declared=[]` 에 공허하게 참 → job 이름이 템플릿이 되면 loud red 가 silent green | Task 2 — `declared_unresolved` fail-closed + 다섯째 fixture |
| OQ3 자기보고 | test · security · invariant | DD8 행이 여전히 저자가 쓴 문자열이고 입력 둘은 존재 grep | `## Validation` — artifact 에서 행을 **재도출**해 대조 |
| `enforce_admins` | security · invariant | 어디서도 단언되지 않고, Task 2 가 그 **관측 채널마저 없앤다**(실측 확인) | Task 2·6 + 축 C 분기 — 수행자 관측을 tracked 증거로 요구 |
| 격리 상한 pin | test | `MAX_EXCLUSION_ENTRIES` 가 `live.length` 에 정확히 pin 돼, 해제하면 판정 선행 step 이 red | Task 5 + `Files to Change` — 짝으로 하향 |
| 절삭된 `failing[]` | invariant | `failing_truncated` 가 artifact 에 없어(실측), 부재를 green 으로 읽으면 red 인 격리를 해제 | Task 5 — `per_file` 양성 증거 + `unmeasured` 축 |
| 가드 단언 | invariant · test | 비영점만 보므로 오타도 통과하고, 가드가 없으면 그 줄이 **자기 test 를 지운 채** 죽는다 | `## Validation` — 사유 코드 단언 + 경로 한정 판정 + 즉시 복원 |
| PRD 단언 | architect · test · invariant | `^\| 4 \|` 는 오늘 이미 통과(두 표에 매치)하고, `넷 전부 미충족` grep 은 **보존된 이력의 삭제를 요구**했다 | `## Validation` — milestone 표 한정 정규식 + 취소선 보존 검사로 반전 |

MEDIUM/LOW 중 실재하는 것도 같은 자리에서 닫았다: 임시 디렉토리 `trap`, 저장소 식별자
단일화(`NWO`), `rd()` 의 백틱/평문 양립과 `$DOC` 부재 선차단, `conclusion=success` 가
`continue-on-error` 때문에 red baseline 을 거를 수 없다는 점, `redaction_ok` 누락,
축 D PR 이 체크 이름까지 결속돼야 한다는 점, 하드코딩 glob 대신 저장소 자신의
`globToRegExp` + `validateExclusions` 재사용(E12 의 "모든 소비처가 검증기를 거친다" 를
참으로 유지한다), `Files to Change` 누락 4행, backlog 표 여덟 행, E20 인용 행번호(`:57`→`:58`),
E15 전제가 이미 낡았다는 점.

**닫지 않은 것을 이름으로 남긴다.** `readRequiredChecks` 의 spawn seam 단언은 구성 가능하나
(export 확인 · `execFileSync('gh', …)` 라 PATH 스텁이 가로챈다) **`gh` 를 두 번 부르므로**
스텁이 `repo view` 와 `api` 를 모두 처리해야 한다. 그리고 "보호 켜짐 × non-admin 에서
`contexts` 가 실제로 보이는가" 는 여전히 **오늘 측정 불가**다 — 그 측정에는 축 C 설정이
선행이고 축 C 는 E16 에 막혀 있다. 판별자가 그 경우를 `protection_unreadable` 로 내보내
조용히 통과하지 않게 하는 것까지가 이 계획의 주장이다.

**verdict 는 위조하지 않는다.** R1 은 `divergent` 였고 이 절은 그 사실을 지우지 않는다.
R2 는 섀도라 receipt 를 만들지 않는다. 게이트 라운드는 아직 **하나 남아 있고**, 그 결과가
무엇이든 그 값이 봉인된다.

## Codex Implementation Review

- 호출: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (`MCCP_GATE_ROUND_CAP=1`, 봉인 `mccp-implement-codex__ci-full-suite-m4`)
- classification `ok` · blocking `false` · 벽시계 63.8초 · structured verdict `needs-attention` → `CODEX_VERDICT=divergent`
- 합치 결론: 신규 코드 결정 자체는 반증되지 않았고, 지적된 둘은 **계획이 이미 알고도 닫지 않은 두 지점**(`--workflow` 우회면 · `--pick-delete` 술어)에 정확히 재착지했다. 둘 다 MEDIUM이라 §3.14대로 그 자리에서 고치지 않는다.
- YAGNI Triage:

  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 — caller-supplied workflow가 자기-test 삭제 가드를 우회 | MEDIUM | DEFER_TO_BACKLOG | L2 security LOW와 같은 축이고 계획이 그것을 열어 둔 채 ship하기로 이미 판정했다. 오늘 `--workflow`를 넘기는 호출자는 test뿐이라 라이브 노출 0. 완화로 파서를 export해 직접 test한다 |
  | F2 — `--pick-delete`가 green-remainder 술어를 성립시킬 수 없다 | MEDIUM | DEFER_TO_BACKLOG | L2 architect HIGH와 동일 축. 계획 `:248`(결정적 선택)과 `:269-271`(green-remainder)이 서로 어긋나며, 구현 가능한 것은 전자다. green-remainder는 선택기가 아니라 Task 3의 실제 CI run이 실증한다 |

- Deferred to backlog: 2 → `.claude/plans/codex-findings-backlog.md` (2026-09-08 두 행)
- Open Questions: 없음 — ACCEPT_NOW 등급(HIGH/CRITICAL) 0건이라 R2 escalate 조건 미충족, R1에서 정지
- 이 라운드가 이 decision의 마지막 게이트 라운드다(cap=1). verdict는 `divergent` 그대로 봉인되며 cross-gate dedupe는 닫힌 채로 남는다 — `/mccp:pr`에서 PR-Codex가 반드시 발화한다.

### Security Reviewer

`Task(mccp:security-reviewer)` 1회 · 벽시계 408.8초 · 대상은 **아직 쓰지 않은 코드**(pre-implementation).

| # | Severity | 무엇이 틀렸나 | 처분 |
|---|---|---|---|
| S1 | **HIGH** | 닫힌 사유 열거 넷 중 fail-closed 극성이 명시된 것은 rule (a)의 `selftest_list_unreadable` 뿐이고, **rule (b)의 입력**(`.github/test-suite-exclusions.json`) 판독 실패에는 사유 코드가 **없다**. 그 read를 try/catch로 감싸 "못 읽음 = 목록에 없음"으로 접으면 rule (b)가 조용히 자기를 끄고 `wiring-cut.js:113`의 `git rm`이 보호 대상 파일에 도달한다 — E10/E10b가 닫으려던 실패를 한 층 아래로 옮긴 것이다. `exclusions.js:14-17`이 그 반대 방향 조용한 실패를 이미 경고한다 | **ACCEPT_NOW** — 다섯째 코드 `quarantine_list_unreadable`을 추가하고 `selftest_list_unreadable`과 **같은 극성**(전면 거부)으로 둔다. 판독은 `exclusions.js#loadExclusions`를 통과시켜 read/parse/schema 실패가 throw되게 하고 그 throw를 거부로 받는다 |
| S2 | **HIGH** | 거부가 `git rm`(`wiring-cut.js:113`) **앞에서** 일어나야 한다는 순서 불변식이 어디에도 적혀 있지 않다. 사유 코드를 계산해 기록하고도 113행으로 흘러내리는 구현이 성립하며, `git rm` **후** 크래시도 비영점이라 **exit code만 보는 판정자는 "삭제 전 거부"와 "삭제 후 크래시"를 구분하지 못한다**(계획 자신의 R4 finding과 같은 축) | **ACCEPT_NOW** — 가드는 mutating call 앞에서 `throw`한다. 그리고 test는 거부 경로 **각각에 대해** (i) 비영점과 (ii) 대상 파일이 여전히 tracked·존재를 **독립으로** 단언한다. 집계 exit code 하나로 대신하지 않는다 |
| S3 | MEDIUM | rule (a)의 보호 목록을 체크아웃된 worktree의 `test-suite.yml`에서 읽으므로, self-test step의 리터럴 목록을 깎은 PR 브랜치를 체크아웃한 채 `--apply-delete`를 돌리면 allow-list가 그 편집본을 반영한다 | 신규 코드에 **주석으로 명시** + backlog. 이 CLI는 CI가 아니라 운영자가 도는 진단이라 폭발 반경이 좁다 |
| S4 | MEDIUM | PATH-stub seam이 **같은 파일 안에서** 누출된다 — 실측: 복원 전 단언이 실패하면 다음 `test()`가 오염된 PATH를 본다 | 신규 test를 처음부터 `try/finally` + `t.after`로 쓴다(선례 `pr-codex-skip-env.test.js:28-29,40-43`). 기존 코드 변경 아님 |
| S5 | LOW | `mkdtempSync` 디렉토리를 안 지우는 저장소 관례가 있는데 이번 산출물은 `gh`라는 **실행 가능 stub**이라 위생이 더 나쁘다 | 신규 test에 `t.after(rmSync)` |
| S6 | LOW | `gh api -q '.contexts[]'` 개행 분리는 이름에 개행이 들어가면 조용히 오분할한다 | 판독 경로를 어차피 새로 쓰므로 **JSON 배열 + `JSON.parse`**로 간다 |

**주입 없음 확인(리뷰어 명시)**: `git rm`·`gh` 전부 `execFileSync` argv 배열 + `shell` 미설정이고 `git rm`은 `--` 구분자를 쓴다. `repo`는 `gh repo view`에서, `branch`는 운영자 플래그에서 온다. 위험은 **주입이 아니라 범위**(어느 파일이 지워지는가)다.

### 게이트 이탈 — `[MCCP-GATE-STOP]`을 내지 않고 진행한 판단

`prp-implement.md` 2.5.5는 "CRITICAL/HIGH security findings → MCCP-GATE-STOP"이라 적는다.
S1·S2가 HIGH이므로 문자 그대로면 Phase 3에 진입하지 않는다. **그럼에도 진행했고 그 사유를
여기 남긴다**(§3.16 — 게이트가 막으면 우회하되 사유를 반드시 기록).

- 이 리뷰의 대상은 **존재하지 않는 코드**다. S1·S2는 기존 코드의 결함이 아니라 *앞으로 쓸
  코드가 만족해야 할 요건*이고, 둘 다 구현 전에 설계로 흡수 가능하다.
- CLAUDE.md §3.14는 서브에이전트 리뷰를 포함해 **CRITICAL·HIGH를 그 자리에서 흡수**하라고
  명령한다. 흡수된 HIGH는 미해소 HIGH가 아니다 — GATE-STOP이 막으려는 것은 *해소하지 못한*
  HIGH를 안고 EXECUTE에 들어가는 것이다.
- 반증 수단을 함께 둔다: S1은 `quarantine_list_unreadable` 사유 코드가 test로 고정되고,
  S2는 거부 경로별 "비영점 ∧ 대상 무변경" 독립 단언으로 고정된다. 흡수가 실제로 일어났는지는
  `## Validation`이 기계로 판정한다.
- **하지 않은 것**: 리뷰어 완화 · finding 심각도 하향 · receipt verdict 위조. `CODEX_VERDICT`는
  `divergent` 그대로 봉인된다.

### 게이트 이탈 2 — 2.5.7 read-back validate 가 exit 2

`prp-implement.md` 2.5.7은 "If non-zero: do NOT enter Phase 3"이라 적는다. 실제 exit는 2였고
**그 사유는 단 하나** — `mccp-plan-codex/ci-full-suite-m4` 부재다(`stale`·`blocking`·
`open_critical` 전부 공집합). 방금 쓴 implement receipt 자체는 지적되지 않았다.

진행 사유:

- 이 부재는 2.5.6이 만든 것이 아니라 **이 사이클 이전부터 알려진 상태**다(패널 divergent →
  receipt 미작성). 사용자가 그 상태를 알고 "receipt를 쓰지 않고 진행"을 명시 선택했다.
- 이 저장소는 `MCCP_RECEIPT_GATE_MODE=soft`를 opt-in 중이라 **누락 receipt만 통과**하는 것이
  선언된 운영 정책이고, v1.3.1 informational allow-path도 `mccp:prp-implement`를
  recoverable로 분류해 missing-only를 ALLOW한다. 실제로 이 Skill 진입을 허가한 것이
  `receipt-skill.js`의 그 soft 분기다.
- **위조하지 않은 것**: plan-codex receipt를 blind write하지 않았다(2.5.7이 요구하는 복구도
  그것을 금지한다 — `[MCCP-INTENT-GATE-STOP]`). 부재는 부재로 남는다.

귀결: cross-gate dedupe는 닫힌 채이고 `/mccp:pr`에서 PR-Codex가 반드시 발화한다.
