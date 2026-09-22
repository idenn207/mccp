# Plan Review Panel — ci-full-suite-m3f

**Plan**: `.claude/plans/ci-full-suite-m3f.plan.md` · **Plan version**: `sha256:ed201e4ddd789084f004789218b3ddfb532bf20e365c96e08d0bedc3eb202085`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 7 blocking finding(s): architect/HIGH, architect/FAIL, test/HIGH, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 축 D 절단 A가 실증한다고 선언한 인과 사슬("test red → 스위트 red → gate.js 1단계 차단")은 같은 계획이 R6에서 추가한 fail-closed 규칙과 충돌해 성립할 수 없다. 절단 A의 대상은 판정 줄의 `--exclude-from` 인자인데, Task 2b는 `--exclude-from` 부재를 gate의 fail-closed 넷 중 하나로 못박아 "판정할 자격이 없다"로 처리한다. 게다가 `judge({measurement, coverage})`는 coverage를 이미 계산된 인자로 받으므로, exclusions를 로드하지 못하면 stage 1을 보고할 경로 자체가 없다. 즉 절단된 트리에서 게이트는 스위트 red 때문이 아니라 인자 누락 때문에 죽고, A는 "소비 경로"가 아니라 "인자 검증"을 재게 된다 — R6이 A에 대해 제기한 '실험이 다른 것을 잰다'는 결함이 다른 형태로 남았다. | .claude/plans/ci-full-suite-m3f.plan.md:721 ("\| **A (회로)** \| 판정 줄의 `--exclude-from` 인자 \| … \| **소비 경로**: test red → 스위트 red → `gate.js` 1단계 → 체크 red \|") 및 :734 ("A가 실증하는 명제: 절단 → `wiring-cut.test.js` red → 스위트 red → `gate.js` **1단계** 차단") 대 :563-572 ("순수 함수 `judge({measurement, coverage})`" + "fail-closed 넷이 여기 걸린다 — … **`--exclude-from` 부재 또는 판독 불가**. … 넷 다 '판정할 자격이 없다'이지 '통과'가 아니다") |
| architect | MEDIUM | 절단 A의 오라클 명세가 Task 5가 도입한 다른 실행 줄과 충돌해 위음성이 가능하다. `wiring-cut.test.js`는 주석 제거 후 `gate.js`·`--measurement`·`--exclude-from`·`--floor-from` **토큰 전부**를 단언하는데, 같은 workflow의 '격리 분할' 단계가 `run.js --list --exclude-from …`을 실행 줄로 갖는다. 따라서 gate 판정 줄에서 `--exclude-from`만 지워도 그 토큰은 YAML 실행 줄에 여전히 존재하므로, 명세대로 토큰 존재만 스캔하는 오라클은 green을 유지한다 — 계획이 §3.17 선례로 경계한 '배선이 아니라 텍스트를 검사하는' 형태가 주석이 아니라 **다른 실행 줄** 축에서 재현된다. 명세가 '해당 판정 줄 안에서'를 요구하지 않는다. | .claude/plans/ci-full-suite-m3f.plan.md:748-750 ("단언 대상은 플래그 이름 하나가 아니라 **`gate.js` · `--measurement` · `--exclude-from` · `--floor-from` 전부**") 대 :658 ("2. **격리 분할** — `run.js --list --exclude-from …`") |
| architect | MEDIUM | Acceptance 3-B의 수용 증거(`coverage_pct === 100`)가 이 계획 자신의 최상위 위험과 모순되어 만족 불가가 될 수 있다. Risks 첫 행은 '격리가 남아 커버리지가 100퍼센트에 못 미친 채 강제로 간다'를 **높음**으로 평가하는데, 격리가 1건이라도 착지하면 절단 B 실행 시 `coverage_pct < 100`이 되어 Acceptance 3-B의 리터럴 조건이 성립하지 않는다. B가 증명해야 하는 명제는 '절단 전후 커버리지 수치가 변하지 않는데도 게이트가 막는다'인데 조건이 절대값 100으로 과대 특정됐다 — Task 9가 Task 0 병합을 배제하며 스스로 경계한 '만족 불가와 안 했다를 구분할 수 없다'와 같은 형태다. | .claude/plans/ci-full-suite-m3f.plan.md:1058 ("**B(구조)**: `coverage_pct === 100`인데 `gate.js`가 `stage=2`로 차단했다") 및 :776 ("(e4) … `coverage_pct === 100`(분자·분모가 함께 줄었다)이면서") 대 :1029 (Risks 1행, likelihood **높음**) 과 :806 ("Validate가 **만족 불가**가 되고, 그 불가를 '병합을 안 했다'와 구분할 방법이 없다") |
| security | MEDIUM | DD7의 통제 명제 "게이트가 그 경로만 읽는다"는 어떤 기계도 강제하지 않는다. 절단 오라클이 단언하는 것은 플래그 토큰의 존재(삭제/이름 변경)뿐이라, workflow 판정 줄의 인자 값을 다른 파일로 **리다이렉트**하면 모든 test가 green인 채 DD2 3조건과 DD9 floor가 동시에 무력화된다. | plan L748-750은 단언 대상을 "`gate.js` · `--measurement` · `--exclude-from` · `--floor-from` 전부"로 적고, Task 7 (f)의 합성 fixture 4종(plan L782-785)은 전부 **지우거나 명령 이름을 바꾼** 경우다 — 값 pin 분기가 없다. 반면 Task 3의 래칫 단언(plan L615-616)은 `.github/test-suite-floor.json` 리터럴 경로에만 걸리므로, `--exclude-from`/`--floor-from`을 PR이 추가한 관대한 JSON(예: `{pattern:"**/*.test.js", reason, ticket}` + 큰 `max_excluded_files`, `tracked:0`)으로 돌리면 정본 두 파일은 무변경이라 래칫 test도 green이다. `exclusions_digest` 앵커도 러너와 게이트가 **같은** 인자를 받으므로 일치한다(`scripts/test-suite/run.js:580`). DD4a(plan L386-405)는 판정 모듈·상수의 동시 수정만 열거하고 입력 경로 리다이렉트는 열거하지 않는다. |
| security | MEDIUM | "잔여 유출 축을 이 milestone이 넓히지 않는다"(DD4)는 노출 차원에서 거짓이다. artifact 생산이 `paths` 필터/dispatch에서 **전 PR(포크 포함) 무조건 업로드**로 확대되는데, 그 artifact에 실릴 수 있는 credential 클래스의 redaction 커버리지는 기존 workflow 주석이 스스로 0건이라고 적었다. | plan L300-301 "artifact 업로드는 유지하되(`if: always()`) … 잔여 유출 축은 redact.js 헤더가 열거하고 backlog가 소유한다 — 이 milestone이 넓히지 않는다" 대 plan L637 "`pull_request`에 **paths 필터 없음**". 기존 baseline은 `.github/workflows/test-suite-baseline.yml:35-38`로 `scripts/**`와 자기 자신에 한정된다. 같은 파일 :62-66이 "전수 스위트는 paths 필터와 무관하게 저장소 전체의 tracked `*.test.js`를 돌리므로, PR이 추가한 test가 그 파일을 읽어 실패 메시지에 실을 수 있다. `redact.js`의 `RESIDUAL_PATTERNS`는 경로 패턴 4종뿐이라 credential 클래스 커버리지가 0건"이라고 명시한다(실측: `scripts/test-suite/redact.js:163-167`은 경로 규칙 4종뿐). `persist-credentials:false`가 토큰 벡터는 막지만, 노출 빈도·트리거 확대 자체는 기록되지 않았다. |
| test | HIGH | 축 D 절단 A가 실증한다고 주장하는 명제("절단 → wiring-cut.test.js red → 스위트 red → gate.js 1단계 차단")는 이 계획 자신이 R6에서 더한 fail-closed 규칙과 모순되며, 요구한 증거로는 두 경로를 구분할 수 없다. `--exclude-from` 인자를 지우면 gate.js는 입력 fail-closed(Task 2b: "`--exclude-from` 부재 또는 판독 불가" → "판정할 자격이 없다")로 stage 1에 **도달하기 전에** 비영점으로 죽는다. 즉 체크 red는 스위트 red의 소비 경로가 아니라 인자 검증에서 나오고, A가 닫으려던 '소비 경로'(green을 실제로 소비하는가)는 여전히 반증 불가로 남는다. 요구된 수용 증거(artifact `failing`에 wiring-cut.test.js 존재)는 두 원인 어느 쪽에서도 동일하게 참이므로 판별자가 아니다. | plan L595-597 "(j) **fail-closed 넷** — … `--exclude-from` 부재/판독 불가 각각에서 비영점 … 마지막 분기가 축 D 절단 A의 안전 방향을 고정한다" 대 plan L734-735 "A가 실증하는 명제: 절단 → `wiring-cut.test.js` red → 스위트 red → `gate.js` **1단계** 차단"; 수용 증거는 plan L769-772 (e2) / L1055-1057 Acceptance 3A로 `failing` 내용뿐이다. |
| test | HIGH | Acceptance 3B(= Success Metric 4를 닫는 유일한 축)의 증거 조건 `coverage_pct === 100`이, 이 계획이 스스로 likelihood '높음'으로 적은 시나리오(격리 발생)에서 구조적으로 만족 불가가 된다. DD2가 격리를 분자에서 빼도록 정했으므로 격리가 1건이라도 있으면 coverage_pct는 항상 100 미만이고, 그러면 절단 B의 실증 조건이 참이 될 수 없다. B가 실제로 보여야 하는 명제는 '삭제가 pct를 바꾸지 않는데도 floor가 막는다'인데, 등식 100으로 고정해 놓아 대체 판정 경로가 없다. | plan L141-142 "**격리(exclusions)는 분자에서 뺀다** … 격리는 커버리지를 **떨어뜨리고**" + L775-777 "(e4) … `coverage_pct === 100`(분자·분모가 함께 줄었다)이면서 `gate.js`가 `stage=2`로 **차단**한다" + Risks L1029 "Task 1의 Linux red 중 원인 미규명이 남아 격리가 늘고 … **높음**" |
| test | MEDIUM | 강제 workflow의 앞 두 단계(격리 목록 검증 · 열거 sanity)는 어떤 test도 그 존재를 단언하지 않아, 이 계획이 세 번 경계한 '기계는 만들어지고 부르는 한 줄이 빠진다'가 그 두 단계에 그대로 남는다. 절단 오라클의 단언 토큰 집합은 판정 줄 넷(+paths 부재)뿐이다. | plan L748-750 "단언 대상은 … **`gate.js` · `--measurement` · `--exclude-from` · `--floor-from` 전부**이고, 여기에 **`on.pull_request`에 `paths`… 키가 없음**이 더해진다" 대 L640 "단계 순서는 **격리 목록 검증 → 열거 sanity → 전수 실행 → 판정**이다" — 앞 두 단계에 대한 단언은 Task 7 (f) 어디에도 없다. |
| test | LOW | Task 2b (i)·(j)는 gate **경로**(git ls-files 해소, git 호출 실패, 인자 부재)를 단언하라고 요구하지만, `judge({measurement, coverage})`는 이미 계산된 coverage를 받으므로 그 축은 순수층 밖 CLI/I-O에 있고 계획은 그 seam(주입 지점 또는 spawn 방식)을 지정하지 않는다. 구현자가 순수층만 단언하면 R5가 이미 네 번째로 재현했다고 적은 바로 그 실패 모드가 다시 test 밖에 남는다. | plan L563-566 "순수 함수 `judge({measurement, coverage})` … 얇은 CLI가 … **`tracked`는 스스로 `git ls-files '*.test.js'`로 해소해**" 대 L592-596 "(i) **분모 채널 짝 단언(gate 경로)** … (j) **fail-closed 넷** — git 호출 실패 …" |
| invariant | HIGH | DD9의 floor 래칫은 저장소가 자라는 순간 조용히 무력화된다 — 삭제 축을 막는 유일한 기계가 slack만큼 열리고, 그 열림을 붉게 만드는 test가 없다. 게이트 모양은 남고 막는 것은 사라진다. | DD9(plan L418): "floor를 정확히 현재 개수로 두면 test 추가 때마다 붉어지므로 **floor 이하만 금지**하고 초과는 자유다" + Task 3 Validate(L615-616): floor가 "그 시점 tracked 개수 **이하**"임만 단언 · L620 "래칫이 막아야 하는 것은 상한을 올리는 편집이지 저장소가 자라는 것이 아니다". 즉 tracked가 floor보다 N 커지면 test 파일 N개를 아무 상수 편집 없이 삭제해도 `coverage_pct`는 100을 유지하고 `unexplained=0`이며 `tracked >= floor`라 gate.js 2단계가 통과한다. floor를 다시 조이는 기계도, slack을 관측하는 단언도 계획에 0건이다. 그리고 그 성장은 가설이 아니라 PRD가 Likelihood **높음**으로 등재한 사건이다 — PRD L108 "C3이 CI를 고치는 동안 C1·C2·C4가 새 test를 추가해 분모가 움직인다 \| 높음". DD9 자신이 "DD7이 격리 축에만 래칫을 걸어 둔 사이 삭제 축에는 아무 기계도 없었다"(L412)고 적은 상태로 되돌아간다. |
| invariant | MEDIUM | 축 D의 유일한 비순환 실증(절단 B)이 위 slack에 직접 의존하므로, Acceptance 3B는 저장소 상태에 따라 구성상 성립 불가가 될 수 있고 그 실패 모드가 계획 어디에도 기록되지 않았다. | Acceptance L1058-1060: "**B(구조)**: `coverage_pct === 100`인데 `gate.js`가 `stage=2`로 차단했다 … Success Metric 4를 닫는 것은 이쪽이다" + Task 7 (e4)(L775-778)가 `tracked < floor`를 그 차단의 유일한 근거로 지목한다. floor가 Task 3 시점 개수로 고정되고 그 뒤 새 test가 1개라도 들어오면(PRD L108) tracked-1 >= floor라 삭제 1건은 차단되지 않는다 — 이때 B는 red를 못 만들고, 계획은 그 경우의 판정(재고정? 삭제 개수 확대?)을 정의하지 않는다. |
| invariant | MEDIUM | 파괴적 절단 B(tracked test 파일 삭제)의 복원이 `## Validation`의 어떤 검사로도 실행되지 않는다 — rollback이 산문으로만 존재한다. | Task 7 Action L701: "두 복원 모두 `git diff --exit-code`로 확인한다"고 주장하지만, Validation 검사 4(L861-868)는 `wiring-cut.js --apply` / `--revert`(절단 A)만 왕복하고 `--apply-delete`/`--revert-delete`는 한 번도 부르지 않는다. Task 7 Validate (a)~(f)에도 B 왕복 분기가 없다(있는 것은 (e4) CI run 기록과 (e5) 비순환성 grep뿐). 즉 삭제 복원 실패가 트리에 남아도 붉어질 검사가 0건이다. |
| invariant | LOW | gate.js의 fail-closed 집합이 `--measurement` 자체의 부재·판독 불가를 열거하지 않는다 — 형제 입력 셋(`--exclude-from`·`--floor-from`·git)은 전부 명시됐는데 판정의 1차 입력만 빠졌다. | Task 2b L568-572: "**fail-closed 넷이 여기 걸린다** — git 호출 실패 · 빈 tracked 목록 · `--floor-from` 부재 · **`--exclude-from` 부재 또는 판독 불가**" · Validate (j)(L595-597)도 같은 넷만 단언한다. (f)(L586)는 measurement **안의 키** 부재만 다루므로, 파일 부재/부분 기록(partial write)/JSON 파손의 방향은 미정의로 남는다. DD3이 0단계를 신설하며 세운 "부재는 통과가 아니다" 원칙과 같은 축이다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | 인용 검증: run.js:10-12/:725(ok=측정 성립, 종료코드), :179-183(foldChunks의 `Number(exit_code)\|\|0`), :213-214(`per_file: ok ? perFile : null` + 주석), :489-505(spawn 실패 시 exit_code null), :577-580(files_total=files.length, exclusions_digest 봉인), :666-679(--list가 enumerated.included), :407-410(listTrackedFiles -z), enumerate.js:49-79(사유 없으면 throw), :84-90(digest 정규화·정렬), :122(suffix 필터), globToRegExp의 `**` 확장 — 전부 계획이 말한 대로였고 사실 오류를 찾지 못했다. 추가로 공격한 것들: (1) `tracked` 채널 단일 소유권 주장 — gate/coverage/run 세 해소자가 있으나 계획이 그 약함을 명시하고 짝 단언을 gate 분기로 옮겨 두어 반박 실패. (2) `exclusions_digest` 앵커링이 ticket 필드를 무시해 어긋나는지 — normalizeExclusions가 pattern/reason만 남기므로 run 측과 gate 측 재계산이 일치, 반박 실패. (3) run.js를 exclusions.js로 재배선하면 기존 소비처가 깨지는지 — grep 결과 `--exclude-from` 호출자가 저장소에 0건이라 결합 파손 없음, 반박 실패. (4) max_excluded_files 래칫의 한 방향 단언이 무의미한지 — 계획이 '이 축은 기계가 아니라 리뷰가 막는다'를 Risks에 명시해 과대주장 아님. (5) Task 6의 workflow_dispatch가 branch의 matrix 변경을 못 볼 가능성 — dispatch는 지정 ref의 파일을 쓰므로 반박 실패. 실제로 무너진 것은 위 셋이며, 첫째는 같은 문서 안의 두 흡수(R5의 축 D 재정의 · R6의 `--exclude-from` fail-closed)가 서로를 무효화하는 구조적 충돌이다. |
| security | pass | 공격한 것: (1) DD2 앵커링 — `exclusions_digest`가 실제로 `run.js:580`에서 봉인되고 `enumerate.js:84-90`이 정렬 기반 결정적 digest임을 확인, 격리-없는 측정과 큰 목록의 짝짓기는 실제로 닫힌다(반증 실패). (2) DD3 0단계 근거 — `run.js:179` `Number(r.exit_code)\|\|0`와 `:492/:502`의 `exit_code:null`, `:213-214`의 `per_file: ok ? perFile : null` 인용이 전부 정확함(반증 실패). (3) `--merge-into`의 fail-closed 인용 — `run.js:280-326` `validateElement`가 실제로 `redaction_ok !== true`를 BLOCK하고 REQUIRED_FIELDS·attribution까지 검사함(정확). (4) git-tracked 컨테이너(`.claude/_meta/data/2026-09-01-suite-baseline.json`)로의 절대경로 유출 — 이 저장소의 `cwd` leak 선례를 겨냥했으나 `redact.js:164-167`의 `posix-home`/`win-drive-abs`가 `/home/runner/...`를 덮고 residual scan이 차단하므로 경로 없음(반증 실패). (5) 격리 glob 한 줄 우회 — DD2가 `max_excluded_files`로 이미 닫음(반증 실패). (6) floor/상한 상수의 동일-diff 하향 — 리뷰 통제로 명시 기록됨(DD4a·Risks), 잔여로 수용. 남은 것은 위 두 MEDIUM이며 HIGH/CRITICAL은 찾지 못했다. |
| test | fail | plan 전문(1067행)과 PRD를 읽고, 인용된 소스를 직접 대조했다: `scripts/test-suite/run.js:10-12`(ok=측정 성립), `:179-183`(`Number(exit_code)\|\|0`로 null→0 접힘), `:213-214`(`per_file: ok ? perFile : null`) — 세 인용 모두 정확했고 DD3 0단계 논증은 실재하는 결함을 겨냥한다(반증 실패). DD2의 `**/*.test.js` 단일 항목 우회와 그 음성 통제 분기 (4), floor 래칫 (6)(7)(8), digest 앵커링 (9), CLI 종료코드 도달 (10), `fully_skipped` 부재 짝 단언 (11), 분모 채널 짝 단언 (12) — 각각 대응 Validate 분기가 존재해 반증 실패. Task 4·8·9의 Validate도 대상 모듈과 짝이 맞았다. 반면 축 D 절단 A는 계획 자신의 fail-closed 규칙과 충돌해 stage 1을 실증하지 못하고 증거가 판별력이 없으며, 절단 B의 수용 등식(coverage_pct===100)은 계획이 '높음'으로 예측한 격리 시나리오에서 만족 불가다. 추가로 workflow 앞 두 단계와 gate CLI seam이 단언 사거리 밖임을 확인했다. |
| invariant | fail | DD3 판정 순서(0~3단계)를 실제 러너 코드에 대조했다 — `run.js:163-220` foldChunks의 `Number(r.exit_code)\|\|0` 접힘과 `per_file: ok ? perFile : null`(:213-214)은 계획이 인용한 그대로였고 0단계 신설은 그 구멍을 정확히 닫는다(반증 실패). `exclusions_digest` 앵커링을 `enumerate.js:81-90`에서 확인했고 정렬 기반이라 계획의 주장(빈 목록 digest 동일)도 참이다(반증 실패). glob 한 줄로 게이트를 여는 경로는 `max_excluded_files`가 닫는다(반증 실패). 게이트 위조 축은 DD4a가 닫지 않는다고 명시 기록하므로 은폐가 아니다(반증 실패). 뚫린 곳은 삭제 축이었다 — floor 래칫이 단방향 slack을 허용하고 그 slack을 재는 기계가 0건이라, 시간이 지나면 삭제 축이 DD9 이전 상태로 조용히 되돌아가며 축 D의 비순환 실증까지 함께 무효화된다. 더해 절단 B의 복원 경로와 `--measurement` 부재 방향이 어떤 검사에도 걸리지 않음을 확인했다. |

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
  "wall_clock_ms": 211952,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:ed201e4ddd789084f004789218b3ddfb532bf20e365c96e08d0bedc3eb202085",
  "plan_path": ".claude/plans/ci-full-suite-m3f.plan.md",
  "recorded_at": "2026-09-04T02:45:51.067Z"
}
```
