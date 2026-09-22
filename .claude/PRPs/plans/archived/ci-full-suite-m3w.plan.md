# Plan: ci-full-suite M3 — ci-enforcement

**Source PRD**: `.claude/prds/ci-full-suite.prd.md`
**Selected Milestone**: 3 — ci-enforcement
**Complexity**: Large

> **이 계획은 승인 없이 착지한다. 그 사실을 여기 먼저 적는다.**
> milestone 3의 L2 패널은 **열세 decision에 걸쳐 열세 번** 돌았고 열세 번 다 5.2e에서 차단됐다.
> `mccp-plan-codex` receipt는 **어느 쪽도 쓰이지 않았다.** 각 라운드가 지목한 결함은 실재했고,
> 아래 표의 blocking 추이가 그 흡수의 이력이다.
>
> | decision | 기록 | blocking | 벽시계 | 결과 |
> |---|---|---|---|---|
> | `ci-full-suite-m3` | [plan-review-ci-full-suite-m3.md](../reviews/plan-review-ci-full-suite-m3.md) | 10 | 468초 | HALT 5.2e |
> | `ci-full-suite-m3a` | [plan-review-ci-full-suite-m3a.md](../reviews/plan-review-ci-full-suite-m3a.md) | 11 | 248초 | HALT 5.2e |
> | `ci-full-suite-m3b` | [plan-review-ci-full-suite-m3b.md](../reviews/plan-review-ci-full-suite-m3b.md) | 12 | 178초 | HALT 5.2e |
> | `ci-full-suite-m3c` | [plan-review-ci-full-suite-m3c.md](../reviews/plan-review-ci-full-suite-m3c.md) | 8 | 148초 | HALT 5.2e (security **pass**) |
> | `ci-full-suite-m3d` | [plan-review-ci-full-suite-m3d.md](../reviews/plan-review-ci-full-suite-m3d.md) | 7 | 154초 | HALT 5.2e (security **pass**, finding 0건) |
> | `ci-full-suite-m3e` | [plan-review-ci-full-suite-m3e.md](../reviews/plan-review-ci-full-suite-m3e.md) | 2 | 233초 | HALT 5.2e (**3/4 pass** — test HIGH 1건) |
> | `ci-full-suite-m3f` | [plan-review-ci-full-suite-m3f.md](../reviews/plan-review-ci-full-suite-m3f.md) | 7 | 165초 | HALT 5.2e (security **pass**) |
> | `ci-full-suite-m3g` | [plan-review-ci-full-suite-m3g.md](../reviews/plan-review-ci-full-suite-m3g.md) | 6 | 135초 | HALT 5.2e (security **pass**) |
> | `ci-full-suite-m3h` | [plan-review-ci-full-suite-m3h.md](../reviews/plan-review-ci-full-suite-m3h.md) | 7 | 158초 | HALT 5.2e (security **pass**) |
> | `ci-full-suite-m3i` | [plan-review-ci-full-suite-m3i.md](../reviews/plan-review-ci-full-suite-m3i.md) | 8 | 221초 | HALT 5.2e (4관점 전원 fail) |
> | `ci-full-suite-m3j` | [plan-review-ci-full-suite-m3j.md](../reviews/plan-review-ci-full-suite-m3j.md) | 6 | 184초 | HALT 5.2e (security **pass**) |
> | `ci-full-suite-m3k` | [plan-review-ci-full-suite-m3k.md](../reviews/plan-review-ci-full-suite-m3k.md) | 2 | 215초 | HALT 5.2e (**3/4 pass** — architect HIGH 1건) |
> | `ci-full-suite-m3l` | [plan-review-ci-full-suite-m3l.md](../reviews/plan-review-ci-full-suite-m3l.md) | 9 | 312초 | HALT 5.2e (4관점 전원 fail) |
> | `ci-full-suite-m3m` | [plan-review-ci-full-suite-m3m.md](../reviews/plan-review-ci-full-suite-m3m.md) | 7 | 178초 | HALT 5.2e (security **pass**) |
> | `ci-full-suite-m3n` | [plan-review-ci-full-suite-m3n.md](../reviews/plan-review-ci-full-suite-m3n.md) | 4 | 234초 | HALT 5.2e (**2/4 pass** — security·test) |
> | `ci-full-suite-m3o` | [plan-review-ci-full-suite-m3o.md](../reviews/plan-review-ci-full-suite-m3o.md) | 2 | 208초 | HALT 5.2e (**3/4 pass** — architect HIGH 1건) |
> | `ci-full-suite-m3p` | [plan-review-ci-full-suite-m3p.md](../reviews/plan-review-ci-full-suite-m3p.md) | 7 | 149초 | HALT 5.2e (security **pass**) |
> | `ci-full-suite-m3q` | [plan-review-ci-full-suite-m3q.md](../reviews/plan-review-ci-full-suite-m3q.md) | 8 | 260초 | HALT 5.2e (security **pass**) |
> | `ci-full-suite-m3r` | [plan-review-ci-full-suite-m3r.md](../reviews/plan-review-ci-full-suite-m3r.md) | 2 | 226초 | HALT 5.2e (**3/4 pass** — test HIGH 1건) |
> | `ci-full-suite-m3s` | [plan-review-ci-full-suite-m3s.md](../reviews/plan-review-ci-full-suite-m3s.md) | 2 | 296초 | HALT 5.2e (**3/4 pass** — invariant HIGH 1건) |
> | `ci-full-suite-m3t` | [plan-review-ci-full-suite-m3t.md](../reviews/plan-review-ci-full-suite-m3t.md) | 3 | 341초 | HALT 5.2e (**3/4 pass** — test HIGH 2건) |
> | `ci-full-suite-m3u` | [plan-review-ci-full-suite-m3u.md](../reviews/plan-review-ci-full-suite-m3u.md) | 3 | 257초 | HALT 5.2e (**3/4 pass** — invariant HIGH 2건) |
> | `ci-full-suite-m3v` | [plan-review-ci-full-suite-m3v.md](../reviews/plan-review-ci-full-suite-m3v.md) | 4 | 233초 | HALT 5.2e (2/4 pass — test·invariant 각 HIGH 1건) |
>
> 각 라운드가 지목한 실제 결함을 CLAUDE.md §3.14대로 **CRITICAL·HIGH만** 흡수했다 — R1에서 4가지
> (DD2 판정 기준 교체 · DD7 러너 재배선 · DD9 신설 · DD5 주석 위양성 짝 단언), R2에서 5가지
> (DD2·DD7의 **격리 파일 수 상한** — glob 한 줄이 게이트를 여는 CRITICAL · DD2의 `exclusions_digest`
> 앵커링 · DD9의 floor 입력 fail-closed와 절단 오라클 결속 · DD5의 축 D CI 증거 호스트 명시 ·
> `fully_skipped` 철회), R3에서 4가지 — **DD3의 판정 순서가 어떤 기계에도 배선되지 않아 게이트가
> red 스위트를 통과시키는 CRITICAL**(러너 종료코드는 `ok`=측정 성립이지 green이 아니다:
> `scripts/test-suite/run.js:10-12`·`:725`)을 `scripts/test-suite/gate.js` 신설로 닫았고, 그 김에 셋이 함께 닫혔다 —
> DD3의 3축이 한 줄로 모여 **절단 오라클 사거리 안**에 들어왔고, `redaction_ok`의 차단 여부
> 미정의가 해소됐으며, R2가 DD2에만 착지시킨 두 흡수(`fully_skipped` 철회 · 3조건 게이트)의
> **Task 2 drift**를 짝 단언과 함께 전파했다. 축 D의 red 귀속 오라클도 더했다(run 상태는 증거가
> 아니다 — flaky red와 구분되지 않는다).
> R4에서 5가지 — **축 D의 절단이 자기 판정자를 지워 체크를 green으로 만드는 자기모순**(절단 대상을
> 판정 줄 전체가 아니라 `--exclude-from` **인자 하나**로 바꾸고 "판정자 생존" 단언을 더했다) ·
> **커버리지 분모의 입력 채널 미선언**(`tracked`는 `git ls-files '*.test.js'`이며 measurement의
> `files_total`은 격리 후 값이라 분모로 쓰면 래칫이 반대로 작동한다 — 짝 단언으로 금지) ·
> **`measurement.ok`가 게이트 입력에 없어 한 번도 돌지 않은 스위트가 통과**(spawn 실패가
> `exit_code: null`을 내고 `foldChunks`가 0으로 접는다 → `gate.js`에 0단계 신설) ·
> **"paths 필터 없음"의 과대허용 방향이 반증 불가**(절단 오라클이 `paths` 키 부재를 단언) ·
> **`container-check.js`만 무-test**(짝 test 신설). 더해 여러 라운드가 되물은 게이트 위조 축을
> DD4a로 **기록**했다 — 닫지 않으며, 닫지 않는 이유(판정자가 PR이 통제하는 트리 안에 있다)를 적는다.
> R5에서 3가지 — **분모 채널을 게이트가 부르지 않는 모듈에 선언**했다(앞 라운드가 `coverage.js`
> CLI에 배정했으나 CI가 부르는 것은 `gate.js`다 — 같은 실패 모드의 네 번째 재현이라 짝 단언을
> gate 분기로 옮겼다) · **열거 sanity가 격리와 모순**(`run.js --list`는 격리 후 집합이라 격리 1건에
> 영구 red — 정체성 검사와 분할 검사로 나눴다) · **축 D의 "두 경로 동시 발화" 주장이 거짓**
> (`gate.js`가 단락하므로 2단계는 평가되지 않고, 격리 0건이면 애초에 참이 아니다 — 실증 명제를
> 하나로 줄였다). 더해 두 사실 오류를 정정했다: DD9가 지목한 `--assert-accounted` 문자열은 최종
> 판정 줄에 없고(gate.js 내부로 흡수), `per_file: null`은 chunk 모양이지 방출되는 measurement
> 모양이 아니다(`foldChunks`가 `[]`로 접는다).
> R6에서 1가지 — **축 D의 실증이 구성상 반증 불가**였다. 절단 대상이 같은 Task가 그것을 단언하도록
> 새로 쓰는 test가 보는 바로 그 줄이라, 실험은 "새 단언이 동작한다"만 재고 PRD가 이 축에 부여한
> 목적(PRD L54·L63)에 대해서는 실패할 수 없었다. 절단을 **둘**로 나눴다 — A(회로)는 소비 경로를
> 닫고, **B(구조)** 는 tracked test 파일 1개를 삭제해 `coverage_pct`가 100퍼센트를 유지하는데도
> 아무도 심지 않은 DD9 floor 래칫이 막는 것을 보인다. Success Metric 4를 닫는 것은 B다.
> 더해 여러 관점이 함께 지적한 사실 오류·비대칭 넷을 정정했다: **R5가 `per_file` 부재 모양을
> 거꾸로 적었고**(소스 주석이 "`ok:false`일 때 `null`이지 `[]`가 아니다"라고 명시한다) ·
> 열거 sanity의 "분할"이 출력 표면 없는 수량을 지목했으며 · `max_excluded_files` 등가 단언이
> 무관한 PR을 붉게 만들고 · `gate.js`의 fail-closed 집합이 `--exclude-from` 부재를 빠뜨렸다.
> R7에서 3가지 — 그리고 **셋 중 둘은 R6의 흡수가 직접 만든 것**이다. (1) **축 D 절단 A가 이 계획
> 자신의 fail-closed 규칙과 충돌**했다: R6이 `gate.js`의 fail-closed에 `--exclude-from` 부재를
> 더했는데 A의 절단 대상이 바로 그 인자여서, 절단된 트리의 게이트는 1단계에 **도달하기 전에** 인자
> 검증에서 죽는다 — 실험이 소비 경로가 아니라 인자 검증을 재고 있었고 요구된 증거는 두 원인을
> 구분하지 못했다(architect·test 독립 지목). 규칙을 되돌리지 않고 **명제를 갈랐다**: A는 이제
> workflow를 건드리지 않고 **붉은 test 파일 1개를 심어** 게이트가 `stage=1`로 막는 것을 보이며,
> 판정 줄 토큰 절단은 CI를 요구하지 않는 **로컬 오라클 왕복**으로 강등됐다. 판별자는 stage 번호다.
> (2) **B의 수용 등식 `coverage_pct === 100`이 구조적으로 만족 불가**였다 — DD2가 격리를 분자에서
> 빼므로 격리 1건에 100 미만이 되고, 격리 발생은 이 계획이 스스로 likelihood 높음으로 적은
> 사건이다(test·architect·invariant 3관점). 조건을 `after >= before`로 바꿨다. (3) **DD9의 정적
> floor가 저장소가 자라는 만큼 조용히 열린다** — `tracked - floor` slack만큼 상수 편집 없이 삭제가
> 통과하고 그 slack을 재는 단언이 0건이었다(invariant). 삭제 축의 정본 래칫을 상수가 아니라
> **base 대조**(`--base-ref`, `tracked_head < tracked_base`)로 옮겨 slack을 구조적으로 없앴고,
> 그 부작용으로 B가 저장소 상태에 의존하던 것도 함께 닫혔다.
> 더해 값싼 넷을 같은 자리에서 정정했다: 오라클 스캔 범위를 **판정 줄 안**으로 좁혔고(열거 sanity
> 줄의 같은 토큰이 왕복을 위양성으로 만들었다) · 앞 두 workflow 단계의 존재를 단언에 넣었고 ·
> `gate.js` fail-closed에 `--measurement` 부재를 더했고(판정의 1차 입력인데 형제 셋만 열거돼
> 있었다) · 절단 B의 복원을 `## Validation`이 실제로 왕복시키게 했다. DD4의 "이 milestone이 유출
> 축을 넓히지 않는다"는 문장은 **거짓이라 정정**했다 — 축은 그대로지만 `paths` 필터 제거로 노출
> **빈도**는 넓어진다.
> R8에서 3가지 — 이번에도 **둘이 직전 라운드의 흡수가 만든 것**이다. (1) **R7이 세운 base 대조
> 래칫의 전제가 workflow 사양에 한 줄도 없었다**: `actions/checkout` 기본은 depth 1이고 merge ref를
> 체크아웃하므로 `origin/<base>`가 없는데, `--base-ref` 해소 실패는 Task 2b가 fail-closed로
> 못박았다 — 즉 **전 PR이 영구 red**가 되고 출구는 이 계획이 금지한 게이트 완화뿐이었다
> (architect·security 독립 지목). 이 저장소는 같은 사고의 처방을 이미 갖고 있어
> (`.github/workflows/version-declaration-gate.yml` L21-24·L57-60) 그대로 미러했고, `fetch-depth: 0`과 base fetch
> 단계의 **존재를 오라클이 단언**하게 했다. (2) **R7이 쓴 부등식 `tracked_head < tracked_base`가
> 삭제 1건 + 추가 1건의 상쇄로 열린다** — "slack이 구조적으로 없다"던 그 문장이 거짓이었고, 상쇄는
> 적대적 구성이 아니라 PRD가 likelihood 높음으로 등재한 사건과 겹치기만 하면 성립한다(invariant).
> 판정을 **경로 집합 차**(`missing = base_set − head_set`)로 바꿔 추가에 무감하게 만들고, 면제도
> 수량이 아니라 경로로 소모되게 했다. 상쇄 구성을 단언 분기로 못박아 부등식으로의 회귀가 붉어진다.
> (3) **Task 4의 CI 가드가 기존 test 2건을 CI에서만 깨뜨린다** — `childEnv`가 `process.env` 전량을
> 읽는데 `scripts/tests/test-suite.test.js` L701·L720이 그것을 직접 부르므로 GitHub Actions job에서 throw하고,
> 로컬 Validation은 `GITHUB_ACTIONS` 없이 돌아 **구조적으로 못 본다**(test). 가드를
> `--allow-codex` **플래그 파싱 지점**으로 옮기고, `## Validation`에 `GITHUB_ACTIONS=true` 실행을
> 더했다.
> 더해 넷을 정정했다: `--apply-delete`가 index까지 반영해야 함을 명시(`git rm` — worktree만 지우면
> 집합 차가 비어 검사가 이유 없이 통과한다) · `## Validation` 4b가 판정 단계를 단언하고 measurement
> 선행을 요구하게 함(비영점만 보면 fail-closed로도 통과한다 — 축 A에서 흡수한 것과 같은 형태) ·
> `coverage.js` CLI가 차단 권한을 갖지 않고 `gate.js`와 **같은 헬퍼를 공유하는 두 번째 진입점**임을
> 명시 · Task 5와 Task 7이 **한 단위**임을 Risks의 절단선에 반영.
> R9에서 3가지 — 그리고 **판별자를 stage 번호로 삼은 것이 다시 문제였다**. (1) `stage=2`는 커버리지
> 실패와 삭제 래칫이 **공유하는 칸**이라, "`stage=2`면 래칫이 막은 것"이라는 4b·(e4)의 단언은 래칫이
> 죽어 있어도 만족된다(architect·test 독립 지목 — R7·R8이 축 A에서 이미 흡수한 "비영점만 보면 구분
> 안 된다"의 삭제 축 재현이다). 게이트 출력에 **닫힌 사유 코드 열거 `reasons`** 를 도입하고 모든
> 증거 요건을 stage가 아니라 코드에 걸었다. 같은 지적이 드러낸 미정의 방향
> (`measured − tracked ≠ ∅` — 측정에는 있는데 트리에 없는 파일)도 `stage=0`
> `measurement_tree_mismatch`로 정의했고, 그 정의 덕에 4b가 measurement를 트리에 맞춰 좁히는 것이
> 요구사항이 됐다. (2) **R8이 철회한 부등식이 Task 7 (e4)와 DD5 B 서술에 그대로 남아 있었다** —
> 구현자가 그 증거 요건을 문자 그대로 만족시키려면 Task 2b (k)가 red로 잡도록 설계된 개수 비교로
> **되돌아가야** 했다(3관점 지목). 집합 차 표현으로 통일했다. (3) **래칫 상수의 초기값이 어디에도
> pin되지 않았다** — `max_excluded_files`가 한 방향 단언뿐이라 `368` 같은 헤드룸으로 파일을 만들어도
> 게이트와 test가 전부 green이고, DD2가 CRITICAL로 닫았다는 "한 줄 glob이 게이트를 연다"가 되열린다
> (invariant). **등가 단언으로 바꿨다** — R6이 든 완화 사유("등가면 무관한 PR이 붉어진다")가 이 축에서
> 틀렸기 때문이다: 여기서 붉어지는 PR은 *기존 격리 glob 안으로 새 test가 들어왔다*는 뜻이고 그것이
> 조용히 일어나는 것이 바로 이 상한이 막으려는 일이다. `tracked` floor는 한 방향으로 남기되, 그
> slack이 무한하다는 사실과 그것이 허용되는 이유(base 대조가 그 축의 정본이 됐다)를 함께 적었다.
> 더해 넷을 흡수했다: **`--exclude-from`/`--floor-from`의 인자 *값*을 오라클이 단언**하게 했고
> (R7·R8·R9에 걸쳐 세 번 제기됐고 두 번 이연한 축이다 — 이연 사유였던 "정본 경로가 바뀌면 무관하게
> 붉어진다"가 틀렸다) · DD4의 fork 방어 넷(permissions · persist-credentials · pull_request_target
> 부재 · SHA pin)을 오라클 단언에 넣었고 · Task 4의 seam이 `spawnSync`임을 명시했고 · `## Validation`
> 7b에 검사 7과 대칭인 Windows 완화 분기를 뒀다. LOW 둘도 함께 고쳤다(`github.base_ref || 'main'`
> fallback · `--assert-accounted` 조건 수 표기).
> R10에서 3가지 — 그리고 **둘은 R9의 흡수를 절반만 적용한 결과**다. (1) **인자 값 단언이
> 비대칭이었다**: R9이 `--exclude-from`·`--floor-from`의 값을 오라클에 못박으면서 `--measurement`와
> `--base-ref`는 토큰만 남겼는데, 남긴 둘이 더 위험했다 — `--base-ref`를 `HEAD`로 돌리면
> `base_set = head_set`이 되어 DD9 래칫이 **항상 참으로 접히고**(4b가 로컬에서 쓰는 값이 정확히
> `HEAD`라 오타 한 번으로 일어난다), `--measurement`를 손수 만든 JSON으로 돌리면 0~3단계 전부가 그
> 파일을 판정한다(security·invariant 독립 지목). **네 인자 값을 전부 리터럴로 pin**하고 판정 줄의
> measurement 경로도 고정했다. (2) **`continue-on-error`가 오라클 사거리 밖이었다** — 판정 단계에
> 그 한 줄이면 `gate.js`가 비영점으로 죽어도 체크는 success를 보고하고 모든 test가 green이다.
> Task 5가 "없음"을 선언만 하고 단언하지 않은 것은 `paths` 부재를 단언하는 것과 비대칭이었고,
> 위험이 가설이 아닌 이유는 이 milestone이 함께 편집하는 형제 파일이 그 줄을 둘 갖고 있어 가장
> 가까운 복사 템플릿이기 때문이다(test). 단언과 fixture를 더했다. (3) **`unexplained == 0`을 머지
> 판정의 간판으로 적은 것이 과장이었다** — `enumerate.js`가 `included ∪ excluded = tracked`를
> 구성으로 보장하고 stage 0이 `ok`와 `measured − tracked ≠ ∅`를 먼저 막으므로, 그 조건은
> **측정과 트리가 같은 한 항상 참**이다(architect). vacuous는 아니다(측정 이후 test가 추가되면
> 비지 않는다 — `measurement_tree_mismatch`의 반대 방향이다). 그래서 그것을 **정합 검사의 한쪽
> 방향**으로 재프레이밍하고, 실제 차단력이 오는 넷(attribution 불변식 · 격리 파일 수 상한 ·
> digest 앵커 · 삭제 래칫)을 명시했다 — 앞선 문장은 이 계획이 `fully_skipped`를 철회하며 세운
> 기준과 스스로 어긋났다.
> 더해 넷을 흡수했다: `reasons`의 **단계 사이 단락 · 단계 안 누적**을 명시(floor와 래칫이 같은
> 2단계에서 겹치므로 단락 구현이면 축 D B가 반증 불가가 된다) · **게이트 자체가 고장 났을 때의
> 복구 절차**를 Task 8 런북에 배정(required check 일시 해제 → 수정 PR → 재설정, 잊으면
> `ci-required-checks.js`가 계속 붉다. 게이트 완화는 복구 경로가 **아니다**) ·
> `coverage.js`↔`gate.js` 공유를 짝 단언으로 확인 · Task 0의 ref를 실재하는 브랜치명으로 정정.
> `${{ }}` 보간도 인용했다.
> R11에서 3가지 — 그리고 **하나는 미러 원본이 이미 반대 규율을 갖고 있던 것**이다. (1) **판정자 자기
> test가 판정자 하류에만 있어 순환**이었다: 전수 실행 단계는 `run.js`의 `ok`(측정 성립)로만 종료하므로
> gate 짝 test가 red여도 exit 0이고, 그 red를 체크 red로 바꾸는 유일한 주체가 gate 자신이라 gate가
> 통과 방향으로 고장 나면 **자기 결함을 자기가 은폐한다**(invariant). 이 계획이 base ref 처방을
> 미러한다고 적은 `version-declaration-gate.yml` L62-65가 이미 "가드가 초록인데 그 가드 자체가 고장
> 나 있으면 초록의 의미가 없다"며 판별력 test를 가드보다 **앞선 독립 단계**에 두고 있었다 — 그 규율을
> 취해 판정 앞에 자기 test 단계를 넣었다. (2) **판정의 1차 입력을 생산하는 전수 실행 줄이 어떤 오라클
> 사거리에도 없었다**(architect) — `--exclude-from`이 빠지면 `run.js`가 빈 목록 digest를 봉인해 격리
> 1건에 전 PR이 영구 red가 되고, 격리 0건 동안은 앵커가 조용히 공허하다. 판정 줄 인자를 pin하는 데
> 세 라운드를 쓰고 그 입력을 만드는 줄에는 같은 규율을 안 준 것이다. (3) **Acceptance 2·3-B가 요구하는
> `coverage_pct` 실값에 CI producer가 없었다**(test) — gate 출력에 커버리지 수치가 없고 `coverage.js`는
> 로컬 전용으로 못박혀 있어, Success Metric 4를 닫는 절단 B의 수용 등식을 산출할 주체가 CI에 부재했다.
> gate `--json`이 `coverage`를 싣고 artifact로 올린다.
> MEDIUM 5건도 전부 흡수했다: 공유 헬퍼 소유 모듈 `inputs.js` 신설(이름 붙은 소유자가 없으면 순환
> require이거나 두 번째 계산이다) · `${{ }}` 방어를 인용에서 **env 간접**으로 정정 — **인용은 방어가
> 아니다**(큰따옴표 안에서도 `$(...)`가 실행되고 `${{ }}`는 셸이 보기 전에 치환된다. 앞 라운드의 주장이
> 틀렸다) · `allow_deletions`에 격리와 같은 3중 통제(ticket 필수·항목 수 상한) · 오라클에 `secrets`
> 미주입 단언(DD4가 못박은 다섯 중 빠진 하나이자 가장 치명적) · 검사 2 선행 가드.
> 진행 근거 둘도 정정했다 — chain 실측 앵커를 현재 슬러그로 옮겼고, **새 슬러그 재발행이 §3.16의 감사
> 우회 목록에 없어 캡 강제가 이 진행에 작동하지 않았다는 사실**을 위 블록에 명기했다.
> R12에서 1가지 — **3/4 관점이 pass**했고(security·test·invariant) 유일한 HIGH는 정당했다:
> **R11의 흡수가 R10의 흡수를 무효화했다.** R11이 셸 주입 하드닝으로 `${{ }}`를 `env:` 간접으로
> 옮긴 순간, 오라클의 스캔 범위가 판정 `run:` 줄 안이라 R10이 세운 `--base-ref` 값 pin이
> **구성상 만족 불가**가 됐다 — 구현자가 줄 안의 `origin/$BASE_REF`만 단언하면
> `BASE_REF: ${{ github.head_ref }}`로 바꾸는 편집이 통과하고, R10이 "남긴 둘이 더 위험했다"고
> 지목한 경로(래칫을 항상 참으로 접기)가 다시 오라클 없이 열린다(architect). 하드닝을 되돌리지
> 않고 **단언이 값을 따라가게** 했다 — 이 인자에 한해 스캔 범위가 그 step의 `env:` 블록까지
> 넓어지고, 규칙은 하나로 남는다: *단언은 값이 정의된 자리를 본다.*
> 같은 축의 MEDIUM 넷도 함께 흡수했다: base fetch 단계도 `env:` 간접으로(판정 줄에 대해 "미러
> 원본의 실수를 물려받지 않는다"고 적고 바로 옆 단계에서 물려받는 자기모순 — security) · 판정자
> 자기 test 단계의 **두 파일 모두** 오라클 단언(뒤의 것이 workflow 형태의 유일한 단언자라 그것이
> 빠지면 오라클 전체가 무력화된다 — test) · gate `--json`의 `coverage` 필드를 재는 분기 (l) 신설
> (없으면 Acceptance 2·3-B의 producer 존재가 라이브 전까지 반증 불가 — test) · `allow_deletions`
> 항목 수 상한도 등가 단언(한 방향이면 R9가 닫은 헤드룸 구멍이 이 축에 남는다 — invariant).
> `inputs.js`가 **구현** 소유자이고 계약 소유자는 여전히 `gate.js`임도 명시했다.
> R13에서 5가지 — blocking이 2에서 9로 늘었고 그 증가가 정보다. 앞 라운드가 3/4 pass였다고 해서
> 남은 표면이 얕았던 것이 아니라, 리뷰어들이 **더 깊은 층**에 도달했다. (1) **축 D 절단 B의 수용
> 등식이 두 번째로 틀렸다**(architect): R7이 `=== 100`을 `after >= before`로 고쳤는데 그것도
> 산술적으로 만족 불가다 — `pct=(T−E)/T`이므로 격리 안 된 파일 1개를 지우면 분모만 줄어
> `E≥1`에서 **항상** `after < before`다. 근본 원인은 *비율*을 증거로 삼은 것이고, B가 보여야 하는
> 명제는 커버리지 *완전성*이므로 조건을 **`unexplained === 0`**으로 옮겼다. (2) **`allow_deletions`의
> `path`가 glob인지 리터럴인지 미정의**였다(security) — glob이면 `{path:"**/*.test.js"}` 단일 항목이
> 삭제 래칫을 통째로 죽이면서 모든 단언이 green이다. **리터럴 정확 일치**로 못박았고, 그래서 항목
> 수 = 면제 파일 수가 되어 격리 축이 필요로 한 셋째 통제가 여기서는 구조적으로 불필요함도 적었다.
> (3) **`gate.js`의 `blocked → 비영점` 전파를 단언하는 분기가 없었다**(test) — `coverage.js`에는
> 대칭 단언 (10)이 있는데 gate에는 없어, `judge`가 막았는데 CLI가 exit 0인 구현이 전 검사를
> 통과한다. 분기 (m) 신설. (4) **artifact 업로드 단계가 단계 순서에도 오라클에도 없었다**
> (test·invariant 독립) — 축 D 증거는 정의상 red run에서만 나오는데 판정이 fail-fast로 죽으면
> 뒤 단계가 skip돼 증거가 하나도 안 남는다. `if: always()` 업로드 단계를 순서와 오라클에 넣었다
> ("증거 요건에 CI producer가 없다"의 **세 번째** 재현이다). (5) **롤백 경로가 순환**이었다
> (invariant) — "잊는 것을 막는 기계가 있다"고 적었는데 그 기계는 UI5가 CI 실행을 금지한 운영자
> 수동 진단이라 아무도 돌리지 않는다. 주장을 철회하고 절차를 분리 불가한 한 단위로 못박되,
> 미복원 탐지가 운영자 주기 실행에 의존한다는 한계를 같은 자리에 적었다.
> MEDIUM/LOW 넷도 흡수했다: 열거 sanity의 "격리 분할"이 **동어반복**이었다(좌·우변이 같은 수량) →
> `max_excluded_files`라는 독립 2항과 대조 · DD9의 `base=absent` 경로가 강제 workflow에서 도달
> 불가임을 명시 · `--floor-from` **키 부재**도 fail-closed(형제 둘은 "판독 불가"까지 열거하는데 이
> 축만 "부재"였다) · `max_excluded_files`를 "실제 차단력"에서 **뺐다**(등가 단언이라 같은 PR에서
> 함께 올리면 통과한다 — 전면 격리를 실제로 막는 것은 분기 (13)이다). rename이 삭제로 판정된다는
> 사실과 `allow_deletions` 정리 의무, DD7의 상한 강제 주체 오기도 정정했다.
> R14에서 4가지 — 셋이 **하나의 결함**의 세 표면이었다. (1) **두 래칫이 같은 2단계에서 서로의
> 출구를 지웠다**(architect): 정적 `tracked` floor를 "이 시점의 tracked 개수"로 두면 여백이 0이라
> `allow_deletions`에 정식 등재된 삭제도 `below_floor`로 막히고, 실제 출구는 이 계획이 금지한
> floor 하향뿐이 된다 — Task 2 Validate (7)이 그것을 오히려 단언하고 있었다. 게다가 DD9가 base
> 대조를 정본으로 삼은 근거("floor의 slack이 무한하다")와 Task 3의 값 지정이 **서로 모순**이라
> 어느 쪽이 계약인지 판정 불가였다. (2) **축 D 절단 B의 CI producer가 또 없었다**(architect —
> "증거 요건에 CI producer가 없다"의 **네 번째** 재현): 판정자 자기 test 단계가 판정보다 앞이고
> 그 안에 실제 저장소를 읽는 floor 단언이 있어, 파일 1개를 지운 절단 B의 트리에서 그 단계가 먼저
> red가 되고 `gate.json`이 아예 생성되지 않는다. `if: always()` 업로드는 만들어지지 않은 산출물을
> 건지지 못한다. (3) **`allow_deletions`의 항목 수 상한이 담길 키가 없어 등가 단언이
> 동어반복이었다**(invariant — `length === length`): 상수 편집 없이 경로를 append하는 것만으로
> 삭제 래칫이 열린다. 셋을 함께 닫았다 — floor 파일에 독립 스칼라 `max_allowed_deletions`를
> 더하고(넷째 상수, fail-closed 키 열거도 넷으로), floor 값을 **작성 시점 tracked −
> (`max_allowed_deletions` + 1)** 로 못박고, 방향은 한 방향으로 두되 **여백 불변식**
> (`현재 tracked − floor >= max_allowed_deletions + 1`)으로 초기값의 *관계*를 pin했다. 그 여백이
> 면제 출구를 실재하게 만들고(1) 절단 B의 트리를 견디게 해 producer를 살린다(2). (4) **Task 6이
> 구성상 만족 불가였고 baseline.yml에는 오라클이 0건이었다**(test): matrix에 `windows-latest`를
> 적는 한 줄로는 `runs-on: ubuntu-latest` 하드코딩·node 축만 담은 artifact 이름(중복 거부)·
> Windows 기본 pwsh·`/tmp` 절대경로가 전부 남는다. Action을 편집 넷으로 구체화하고(개명이 계약
> 변경임과 소비처를 같은 diff에서 고칠 것을 명시), Task 7에 **단언 4**(baseline.yml 오라클 넷)를
> 신설했다 — 그것이 DD1의 load-bearing 편집(`pull_request` 트리거 제거)이 통째로 누락돼도 전
> 검사가 green이던 MEDIUM도 함께 닫는다. 절단 B의 파일 선택 규칙도 셋으로 늘렸다(격리 패턴에
> 걸리는 파일을 고르지 않는다 — 개수 축은 여백이, 격리 축은 선택이 덮는다).
> R15에서 4가지 — 첫 HIGH가 **직전 라운드의 흡수 자체가 산술적으로 자기를 부정한 것**이다.
> (1) R14가 도입한 라이브 **여백 부등식**(`현재 tracked − floor >= max_allowed_deletions + 1`)은
> 파일 1개가 사라진 트리에서 좌변이 `D`, 우변이 `D+1`이라 **항상 거짓**이다(architect). 즉 그
> 단언은 자기가 살리려던 두 경로 — 절단 B의 producer와 정식 삭제의 출구 — 를 도로 죽였고, 정상
> 운용의 `allow_deletions` 등재 PR도 red가 되어 출구가 다시 floor 하향뿐이 된다. 근본 원인은
> R13이 `coverage_pct`에서 겪은 것과 **같은 형태**다: 실험이 움직이는 수량 위에 증거를 걸었다.
> 확인을 **트리 미판독 순수 JSON 산술**로 옮겼다 — floor 파일에 다섯째 상수 `tracked_basis`를
> 더하고 `tracked === tracked_basis − (max_allowed_deletions + 1)`을 단언한다. 어떤 트리 변형에도
> 불변이면서 동어반복이 아니고, 기계로 확인되지 않는 잔여(`tracked_basis`의 정직성)를 그 자리에
> 명시했다 — 낮춰 적으면 backstop이 조용히 약해지고 리뷰만이 막으며, 높여 적으면 전 PR이 붉어져
> 시끄럽게 실패한다. (2) **Validation 4b가 이 계획이 정상으로 선언한 환경에서 구성상 만족 불가**
> 였다(invariant HIGH · test 독립): 로컬 Windows red가 남아 있으면 게이트가 stage 1 `suite_red`로
> 단락해 `deleted_without_allowance`가 실릴 수 없는데 4b에는 7b가 가진 완화 분기가 없다 —
> "만족 불가와 안 했다를 구분할 수 없다"의 세 번째 재현이다. 완화 분기를 더하면 삭제 래칫의
> 유일한 로컬 반증 수단이 정상 환경에서 조용히 꺼지므로, 대신 **트리는 실제로 자르고 measurement만
> 합성**하도록 바꿨다(래칫은 stage 2 관심사라 green 스위트를 요구하지 않는다). 이제 어느
> 플랫폼에서도 만족 가능하고 재는 것이 정확히 래칫 하나다. MEDIUM 둘도 흡수했다 — **절단 A에
> 선택 규칙이 0건**이라 R14가 B에 대해 닫은 자기 test 결합이 A 쪽에 열려 있었고(test·invariant
> 독립), `exclusions.js --check`의 **종료코드 전파 단언이 없어** 형제 둘(coverage (10) · gate (m))과
> 비대칭이었다. 그 결과 자기 test 단계에서 **트리를 읽는 단언은 `max_excluded_files` 등가 하나**로
> 줄었고, 그것은 두 절단의 선택 규칙이 덮는다 — producer 생존이 부등식의 여유가 아니라 **의존
> 자체의 부재**로 성립한다.
> R16에서 6가지 — blocking 4 → **2**, 3/4 pass. 유일한 HIGH는 **삭제 래칫이 `judge`의 계약 밖에
> 있었다**는 것이다(architect): 순수 함수가 `{measurement, coverage}`만 받으므로 base 집합과
> `missing`을 볼 수 없고, 최종 `blocked`/`stage`/`reasons`를 CLI가 사후 합성하게 되어 "`gate.js`가
> DD3 판정 순서의 유일한 소비처"라는 계약이 깨진다. 그러면 R10이 명시한 **2단계 안 누적** 규칙에
> 소유자도 단언도 없어져 자연스러운 단락으로 조용히 접힌다 — 그리고 계획의 기존 분기는 전부
> 커버리지가 통과하는 구성이라 그 접힘을 잡을 것이 하나도 없었다. 서명을
> `judge({measurement, coverage, deletions})`로 넓히고(`coverage`와 같은 형태 — 불순한 계산은 밖,
> 판정은 안) **분기 (n)**(커버리지 실패 ∧ 미면제 삭제 동시 입력 → `reasons`에 둘 다)을 신설했다.
> MEDIUM 5건도 흡수했다: **`exclusions_digest`를 "실제 차단력"에서 뺐다** — 강제 workflow에서는
> 생산 줄과 판정 줄이 같은 리터럴 경로를 읽도록 오라클이 pin하므로 구성상 항상 일치하고, R10이
> `unexplained`에 대해 스스로 철회한 과대주장과 같은 형태다(무용하지는 않아 남는 쓸모를 그 자리에
> 적었다) · **면제 추가 시 floor를 1 내리는 편집이 DD9의 "floor 하향 금지" 대상이 아님**을 구분해
> 적었다(도출식이 강제하는 한 diff의 한 동작이고 여백은 불변이다 — 금지되는 것은 미등재 삭제를
> 통과시키려 floor만 내리는 것이다) · **Task 6이 지목한 개명 소비처가 실재하지 않았다**(`docs/`에
> `gh run download` 0건 — 실측으로 정정하고 목록 대신 `grep`으로 확정하게 했다) · **4b의 삭제 대상
> 선택이 `head -1`이라 (e5) 규칙 3을 우회**했다(면제 목록에 든 파일을 고르면 거짓 red다. 규칙 1·2가
> 로컬에 안 걸리는 이유도 함께 적었다) · **DD4a의 유출 순서 서술이 두 라운드 연속 지적**돼 배선대로
> 정정하고, 발행을 줄이려면 축 D 증거를 잃는다는 **교환**을 명시했다.
> R17에서 6가지 — blocking 2 → 7. 세 관점이 서로 다른 축에서 HIGH를 냈고 전부 실재했다.
> (1) **`tracked_basis`에 유지 규칙이 없어 두 번째 정상 삭제 사이클 뒤 저장소가 영구 red**가 된다
> (architect·invariant 독립 지목). basis가 얼어붙은 상수인데 실제 개수는 래칫으로 내려가므로
> `tracked < floor`가 고착되고, 출구는 이 계획이 "기계로 확인되지 않는다"고 스스로 표시한 basis
> 하향뿐이다 — 반복해서 CRITICAL로 닫았다고 적은 "유일한 출구가 게이트 완화"와 같은 형태다.
> DD9에 **재기준 규칙**을 명시했다(`allow_deletions` 정리와 같은 diff에서만, 그때의 실제 개수로).
> 그것이 게이트 완화가 아닌 이유는 정본 축이 다른 곳(base 대조)에 있고 재기준을 잊으면 조용히
> 약해지는 것이 아니라 `below_floor`로 **시끄럽게** 막히기 때문이다. (2) **판정 단계의 무조건성이
> 오라클 밖**이었다(test): R10이 `continue-on-error`를 닫았는데 동형의 무력화 셋 — 판정 step의
> `if:` · job의 `if:` · `on.pull_request`의 `branches`/`types` — 이 전부 green을 유지한다. 단언
> **1d**(판정 step·job에 `if:` 부재)를 신설하고 단언 3을 좁히는 키 **다섯 전부**로 넓혔다.
> (3) **`base_set`이 비면 래칫이 무조건 통과**한다(invariant): head 쪽 "빈 tracked 목록"의 대칭이
> 없어, 얕은 클론이나 트리 없는 ref에서 "실제 차단력 둘" 중 하나가 조용히 꺼진다. fail-closed
> **일곱째** `base_set_empty`를 더했다. MEDIUM/LOW 3건도 흡수 — **base가 움직이는 tip이라 base-only
> 신규 파일이 `missing`으로 들어와 아무것도 안 지운 PR이 막힌다**(architect. fail-closed 여섯이 이미
> "merge base 해소 실패"를 열거하고 있었으므로 merge base가 원래 의도였고 그 드리프트를 닫았다) ·
> **`blocked`일 때도 `--json`이 stdout에 실제로 기록됨**을 재는 단언이 0건이었다(invariant — 축 D
> 증거 전체가 그 미명시 동작에 매달려 있었다. "CI producer 부재"의 다섯 번째 형태) → 분기 (o) ·
> **격리 항목 수 상한에 이름이 없어** "상한 상수와 일치" 단언에 검사 대상이 없었다(test) →
> `exclusions.js`의 `MAX_EXCLUSION_ENTRIES`로 못박았다.
> R18에서 7가지 — HIGH 넷이 전부 **직전 흡수가 절반만 착지한 것**이다. (1) **판정 줄의 리터럴
> pin에 `--json`도 `> gate.json`도 없었다**(architect): Task 2b는 "판정 단계는 `--json`으로
> `gate.json`에 쓴다"고 적는데 Task 5가 한 줄로 고정한 블록과 오라클 단언 1에는 그것이 없어,
> pin된 줄 그대로 구현하면 **증거 파일이 만들어지지 않고** 모든 단언이 green이다 — "증거 요건에
> CI producer가 없다"의 **여섯 번째** 재현이다. 줄과 단언 양쪽에 넣었다. (2) **R17이 더한 일곱째
> fail-closed `base_set_empty`에 단언이 0건**이었다(architect·test 독립): DD9와 `reasons` 열거는
> "일곱"인데 Task 2b 계약 문단과 분기 (j)는 "여섯"만 열거했다 — 새 가드가 빠진 구현이 전 검사를
> 통과한다. 이 계획이 반복해서 지목한 "기계는 만들어지고 부르는 한 줄이 빠진다"의 **자기 재현**이다.
> (3) **`## Validation`이 `/tmp`에 의존해 선언된 로컬 플랫폼(Windows)에서 만족 불가**였다(test):
> Git Bash의 `/tmp`는 MSYS 마운트로, 네이티브 node에 넘긴 리터럴 `/tmp/...`는 `C:	mp...`로
> 해소되어 셸과 node가 다른 파일을 본다. Task 6.4가 baseline workflow에서 **같은 이유로**
> `/tmp/enum.txt`를 걷어내면서 자기 Validation은 `/tmp`를 쓰고 있었다. 중간 산출물을 repo-relative
> `.claude/cache/`로 옮겼다(gitignore L149). (4) **`allow_deletions.path`의 리터럴 요구가 산문뿐**
> 이었다(invariant): glob으로 구현하면 단일 항목이 삭제 래칫을 통째로 죽이는데, 계획은 그 사실을
> 적어 놓고 음성 통제를 더하지 않았다 — 격리 축의 동형 위험은 분기 (4)라는 기계를 갖는데 삭제
> 축은 산문이었다. (k)에 **여섯째 분기**를 더했다. MEDIUM 3건도 흡수 — `allow_deletions` 원소
> shape(`ticket` 필수)에 런타임 소유자가 없어 `{path}`만으로도 면제됐다(fail-closed **여덟째**
> 신설, 소유자는 `inputs.js`) · floor 키 부재가 한 덩어리라 다섯 중 넷만 검사한 구현이 통과했다
> ((j)를 키별 다섯 분기로) · **판정자 자기 test step의 `if:` 무력화**가 R17의 1d 범위 밖이었다
> (범위를 두 step으로) · `${{ }}` 직접 보간 금지가 두 지점에만 걸려 **클래스 단언이 0건**이었다
> (단언 **3b** 신설 — fork가 통제하는 `github.head_ref`를 임의 step의 `run:`에 넣는 편집이 전부
> green이었다).
> R19에서 4가지 — blocking 8 → **2**, 3/4 pass(architect·security·invariant). 유일한 HIGH는
> **절단 A가 셋 중 유일하게 어떤 로컬 검사에도 왕복되지 않는다**는 것이다(test): 계획은 형제 축
> (B의 복원)에서 정확히 같은 누락을 R7에 HIGH로 흡수해 놓고 A에는 같은 규율을 주지 않았다.
> `--apply-red`가 파일을 index에 올리지 않거나 `--revert-red`가 잔재를 남겨도 붉어질 검사가 0건이고,
> 그러면 버리는 PR의 run이 "절단이 안 됐다"와 "게이트가 red를 놓쳤다"를 구분하지 못한다. 검사
> **4a**를 신설했다 — index 등재 확인 · 합성 **red** measurement로 stage 1 + `suite_red` 도달 확인 ·
> 복원 흔적 0. 전수 스위트는 돌지 않는다(4b와 같은 합성 전략). MEDIUM/LOW 3건도 흡수했다:
> **`actions/setup-node`가 단계 순서에도 오라클에도 없어** 게이트 green이 고정되지 않은 Node 버전에
> 달려 있었다(test — 이 계획 자신이 Task 1c를 "node20 전용 red"로 분류한다). 단일 값 **20**으로
> pin하고 단언 **2c**를 신설했다 · **`timeout-minutes`·`concurrency` 부재**(security) — `paths`
> 필터가 없어 fork PR의 임의 test가 러너에서 도는데 멈추지 않는 test 하나면 required check가
> **영구 pending**이 된다(머지가 차단되지도 통과되지도 않는다). 미러 원본이 같은 이유로 그것을
> 갖고 있는데 앞 라운드는 같은 파일에서 세 축만 가져왔다 · **`## Validation`을 위에서 아래로 돌리면
> 검사 2가 먼저 실패**한다(test·invariant 독립) — 선행 가드가 생산자(검사 7)의 명령 **뒤**에 있어
> 소비자를 보호할 수 없었다. 가드를 소비 지점으로 옮겼다.
> R20에서 7가지 — blocking 2 유지, 3/4 pass(architect·security·test). 유일한 HIGH는 **1d의
> `if:` 부재 단언을 두 step으로 *열거*한 것이 전수 실행 step을 사거리 밖에 남겼다**는 것이다
> (invariant). 그 step이 `if:` 한 줄로 skip되면 `measurement.json`이 생성되지 않는데 판정 줄이
> pin한 경로가 repo-relative라, PR이 같은 이름의 **손으로 만든 green measurement**를 커밋해 두면
> 0~3단계가 전부 그 파일을 판정해 **스위트가 한 번도 돌지 않은 채** required check가 green이고
> 아홉 단언이 전부 green이다. R10이 `--measurement` **값 치환**에 대해 닫은 경로를 값은 그대로 두고
> **producer를 끄는 것**으로 재현한 것이다. 열거를 **클래스**로 바꿨다 — `if:`가 허용되는 자리는
> 업로드 단계 하나이고 그 값이 리터럴 `always()`임까지 단언한다(단언 3b가 `${{` 에 취한 것과 같은
> 규율). 같은 교체가 invariant LOW(격리 검증·열거 sanity step도 skip 가능)를 함께 닫는다.
> MEDIUM 5건도 흡수했다: **판정 대상 트리 자체에 앵커가 없었다**(invariant — checkout에 `ref:` 한
> 줄이면 게이트가 base 트리를 판정해 항상 green이고, 형제 무력화 벡터는 전부 단언을 받았는데 이것만
> 없었다) → 단언 **2d** · **격리 로더의 소유자가 둘**이라 게이트가 검증되지 않은 목록으로 판정할 수
> 있었다(architect — `inputs.js`의 존재 이유를 그 모듈이 스스로 어긴 형태) → `exclusions.js`에 위임
> 명시 · **fail-closed 여덟의 사유 코드 방출이 단언되지 않았다**(architect — "비영점만 보면 구분
> 안 된다"의 네 번째) → (j)가 코드까지 단언 · **`gate.json`이 redaction 계약 밖**(security가 두
> 라운드 연속 지목) → `message`를 `redact.js` 통과로 · **4a의 명제가 합성 measurement 탓에
> vacuous**하고 (e5a)가 산문뿐이었다(test 2건) → 재는 것과 재지 않는 것을 명시하고 격리 회피를
> 코드로 심었다. LOW 1건(baseline job `name:`의 OS 축 누락 → check 이름 충돌)도 Task 6 편집 5로.
> R21에서 7가지 — blocking 3, 3/4 pass(architect·security·invariant). HIGH 둘은 같은 관점(test)이
> 서로 다른 Task에서 찾았다. (1) **`## Validation` 검사 5가 이 계획이 정상으로 선언한 상태에서
> 만족 불가**였다 — branch protection은 Task 8의 운영자 수동 단계인데 검사 5에는 형제(7·7b)가 갖는
> 완화 분기가 없어, Acceptance의 "Validation passes"가 그 단계 전에는 구성상 달성 불가이고
> "만족 불가"와 "안 했다"를 구분할 수 없다. R9·R15·R19에 이은 **네 번째** 재현이다. 검사 5가
> 진단임을 명시하고 note 분기를 뒀다(exit 0 요구는 Task 8 Validate가 진다). (2) **Task 8의 test가
> 순수층뿐이라 실제 producer(job 이름 파서)를 재는 단언이 0건**이었다 — 이 계획이 (i)·(j)·(k)와
> Task 4에서 spawn seam으로 못박은 규율이 이 Task에만 빠졌고, 하필 **같은 사이클이 job `name:`을
> matrix 템플릿으로 만든다**(Task 6 편집 4). 파서 계약을 못박고(리터럴만 check 이름, `${{ }}`
> 포함은 `unresolved`) 실재 두 파일에 대한 분기를 더했다. MEDIUM/LOW 5건도 흡수했다:
> **Task 9의 병합 명령에 `--from`이 없어** 명세대로 구현하면 러너가 로컬 재실행 결과를
> `ci-m3-node20` 라벨로 tracked 증거에 봉인한다(architect — Validate 3축이 출처를 못 잰다) ·
> **stage 0의 차단력이 강제 workflow에서 부분적**임을 R10·R16과 같은 정직성으로 적었다(결론은
> 불변 — 공허한 것이 아니라 도달 경로가 좁다) · **fail-closed 여덟의 레코드 조립 소유자**를 명시해
> R16 규칙과의 표면상 충돌을 해소했다 · **2c가 값을 pin하지 않아** `timeout-minutes: 360`(GitHub
> 기본)이 보호 0으로 통과했다(security) → `60`으로 pin하고 근거를 적었다 · `## Files to Change`의
> `--assert-accounted` **조건 수 드리프트**(3 대 4)를 정정했다.
> R22에서 6가지 — blocking 3, 3/4 pass(architect·security·test). HIGH 둘은 같은 관점(invariant)이
> 오라클의 **두 사각**을 찾았고 둘 다 R20·R10이 닫았다고 적은 경로의 재현이다. (1) **단언 2b가
> 순서를 자발적으로 포기해** R20이 닫은 "스위트를 한 번도 돌리지 않고 커밋된 measurement로
> green을 만든다"가 **재배치만으로** 다시 열렸다 — 1d는 producer를 *끄는* 것만 막고 producer보다
> **먼저 판정하는 것**은 막지 못하며, 전수 실행 step은 스위트가 red여도 exit 0으로 끝난다.
> 순서를 의존하는 **세 쌍**(전수→판정 · fetch→판정 · 판정→업로드)에만 걸어 회피 사유("무관한
> 편집에 붉어진다")를 유지하면서 사각을 닫았다 → 단언 **2b2** + 음성 fixture. (2) **리터럴 pin이
> 중복 플래그에 무감**했다 — 형제 파서가 last-wins라(`scripts/test-suite/run.js` L613-631) 같은 플래그를 뒤에 한 번
> 더 붙이면 오라클은 green인데 파서는 뒤의 값을 쓰고, `--base-ref`를 `HEAD`로 재지정하면 DD9
> 래칫이 항상 참으로 접힌다. 자물쇠 둘을 놓았다 — 단언 1의 **유일성**(이 workflow 안)과
> fail-closed **아홉째** `duplicate_flag`(어느 호출자에게나). MEDIUM/LOW 4건도 흡수했다:
> **fail-closed 코드가 이름으로 열거되지 않아** (j)의 "그 입력 코드" 단언이 즉석 문자열을
> 상대하는 drift 앵커였다(architect — 열거되지 않은 집합은 닫힌 집합이 아니다) → 아홉 범주·열한
> 코드를 이름으로 못박았다 · **2c가 값은 pin하고 수준은 안 해** step 하나에 `timeout-minutes: 60`을
> 두면 단언이 green인 채 전수 실행 step이 기본 360분을 유지했다(architect — R21이 세운 값-pin
> 논증의 나머지 절반) → **job 수준**까지 pin · **검사 4·4a·4b의 `git status --porcelain` 공집합
> 요구가 구현 중에 구성상 만족 불가**인데 형제(5·7·7b)가 갖는 완화 note만 없었다(invariant — 같은
> 형태의 **다섯 번째** 재현) → 선행조건을 명시하고 stash 우회를 적었다 · 격리 파일 shape가 Task 3
> (배열)과 Validation 오라클(`raw.exclusions||raw`)로 갈렸다(architect) → 배열 단일로 통일.
>
> R23에서 7가지 — blocking 4, 2/4 pass(architect·security). HIGH 둘은 **같은 규율이 서로 다른
> 하네스에서 빠진 것**이다. (1) **셸 수준 종료코드 억제에 오라클이 없었다**(test) — 판정 줄 뒤
> `|| true` 한 토막이면 열두 단언이 전부 green인 채 게이트가 체크를 red로 못 만든다. 형제
> 벡터 셋(`continue-on-error`·`if:`·`ref:`)은 전부 단언을 받았는데 이것만 없었다 → 단언 **1e**를
> 클래스로 신설하고 음성 fixture 넷. (2) **`## Validation` 블록 자신이 fail-open**이었다
> (invariant) — `set -e`도 집계도 없고 마지막 문장이 `|| echo`라, 검사 1·3·3b·5·6·7이 전부
> 실패해도 exit 0이었다. 이 계획이 모든 피호출자에게 요구한 규율(Task 2 (10) · Task 2b (m))을
> 그것들을 부르는 하네스에는 주지 않은 것이다 → `set -eu` · rc 포획을 `RC=0; cmd || RC=$?`로
> (절단·복원 구간이 중단되면 잘린 트리가 남으므로 안전 요건이다) · 마지막 줄을 억제가 아니라
> **도달 증거**로. MEDIUM/LOW 5건도 흡수했다: **chain 앵커가 13개 슬러그 전(`m3j`)의 측정**
> 이었다(invariant — 규칙을 적어 둔 그 문단이 규칙을 어겼다) → `m3v`에서 재측정하고 슬러그를
> 따라 옮기는 의무를 명시 · **검사 2의 선행 가드가 첫 실행에서 항상 `exit 1`**이라 3~7이
> 실행되지 않았다(invariant — `.claude/cache/`가 gitignored라 구조적이다) → producer를 **2p**로
> 물리적 hoist, 번호가 곧 실행 순서 · **격리된 파일 삭제가 `max_excluded_files` 등가 단언과
> 충돌**해 정당한 삭제도 자기 test를 붉게 만든다(test) → DD9 인가 경로를 넷으로 · 분모 채널이
> 러너의 `-z` NUL 규율을 안 물려받았다(architect) → `git ls-files -z` · **DD4a 면책 근거가
> 배선보다 넓었다**(security — PR test 코드가 실행 중 floor/격리 파일을 덮어쓰면 diff에 남는 것은
> 숫자가 아니라 test 코드다) → 그 경로를 명시하고 범위 밖임을 적었다.
>
> MEDIUM/LOW 81건은 [codex-findings-backlog.md](codex-findings-backlog.md)로 이연했다.
>
> **왜 라운드가 여럿인가**: CLAUDE.md §3.16의 기본은 1라운드이고, 이 계획은 그것을 넘어선다 —
> **운영자가 "receipt를 작성할 때까지 반복하라"고 명시 지시했기 때문이다.**
> 그리고 그 방식(새 decision slug 재발행)은 §3.16이 열거한 **문서화된 감사 우회 넷에 없다** —
> L2 R11 invariant가 정확히 지적했다. 캡은 `(gate, decision)` 키라 슬러그를 갈면 예약을 새로 얻고,
> 같은 절의 M10 IV1이 "plan을 고쳐 재리뷰하면 원장에서 라운드로 보이지 않는다"를 이 절이 막으려는
> 패턴으로 지목한다. 즉 **캡 강제는 이 진행에 대해 작동하지 않았고**, 어느 라운드도 receipt에
> 봉인되지 않아 사후 감사는 아래 표와 `.claude/reviews/`의 기록에만 의존한다. 그것을 숨기지 않고
> 여기 적는 것이 이 블록의 목적이다 — 산문이 기계를 대신하지는 못하지만, 대신하지 못한다는 사실을
> 기록하는 것과 기록하지 않는 것은 다르다. 라운드 예산은
> `(gate, decision)`마다 1/1이고 캡은 `MCCP_CODEX_DISABLED=1`이 pin해 올릴 수 없으므로, 각
> 라운드는 흡수 후 **새 decision slug**로 재-ship한다(`m3` → `m3a` → `m3b` → …). 예산을 조용히
> 얻는 것이 아니라 무엇을 왜 다시 도는지가 위 표와 이 문단에 남는다. 리뷰어 프롬프트는 한 글자도
> 완화하지 않았다(§3.16).
>
> **그래서 무엇이 없는가**: 이 계획에는 승인 receipt가 없다. cross-gate dedupe는 열리지 않으므로
> `/mccp:pr`에서 **PR-Codex가 반드시 발화한다** — 즉 dual-review는 우회되지 않고 ship 지점으로
> 미뤄졌을 뿐이다. 실측한 chain 상태는 **missing-only**다:
> `validate --command mccp:prp-implement --decision <이 계획의 슬러그>`가
> `{ok:false, missing:[mccp-plan-codex], stale:[], blocking:[], open_critical:[]}`를 낸다(exit 0).
> **슬러그마다 다시 재야 한다** — receipt 네임스페이스가 decision별이므로 다른 슬러그의 측정은 이
> 계획의 근거가 아니다(L2 R11 invariant가 앞선 라운드의 `m3a` 앵커를 지적했고, L2 R23 invariant가
> 13개 슬러그 뒤 같은 결함의 재발을 지적했다 — 규칙을 적어 두는 것과 매 재-ship에 적용하는 것은
> 다르다). **위 값은 이 계획의 슬러그 `ci-full-suite-m3v`에서 2026-09-04에 실측했다**
> (`missing:[mccp-plan-codex(no receipt written)]` · 나머지 셋 공집합 · exit 0). 재-ship으로
> 슬러그가 바뀌면 **그 자리에서 다시 재고 이 문단의 슬러그를 함께 고친다** — 앞선 라운드들이
> 어긴 것은 재측정이 아니라 *기록을 따라 옮기는 것*이었다. §1.3의
> informational allow-path가 받는 바로 그 모양이라 비-terminal 게이트는 정보성 ALLOW로 지난다
> (이 저장소는 `MCCP_RECEIPT_GATE_MODE=soft`도 opt-in 상태다). 그 경로가 막으면 §3.16이 명시한
> 감사 우회 `MCCP_SKIP_RECEIPT=1`을 쓰되 사유는 이 블록이 이미 기록하고 있다.
> 두 리뷰 기록은 디스크에 그대로 남아 무엇이 지적됐는지 반증 가능하다.

## Summary

전수 스위트를 **머지 차단 게이트로 승격**한다. 그 승격은 세 선행조건을 요구한다 — Linux
스위트가 green이고(PRD Risks 1행: "축 C 진입 전 flaky 0이 전제"), 커버리지의 분모가 정의되어
자동 산출되며(OQ5), 격리가 공짜 통과 티켓이 되지 않는 기계가 있는 것. 그 위에 축 D(배선 절단
음성 통제)를 얹어 "커버리지 100%"가 "결함을 잡는다"를 실제로 함의하는지 1회 실증한다.

M2가 명시 이연한 것 전부를 회수한다: Linux red 6건의 판정, `redaction_ok` ↔ greenness 결합,
컨테이너 병합과 그로 인한 Acceptance 산출물 1번의 미충족 전환, OQ3(Windows matrix) · OQ5(분모).

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | test를 새로 쓰지 않는다 — 커버리지 향상과 품질 개선은 이 자식의 축이 아니고 있는 것을 돌리는 것만 한다 | exclusion |
| UI2 | 느린 test의 재작성(mkTmpRepo의 6-spawn을 fixture 재사용으로 바꾸는 것)은 하지 않는다 | exclusion |
| UI3 | .github 디렉토리는 배포 표면 밖이고 plugin.json version bump도 하지 않는다 | exclusion |
| UI4 | receipt 게이트와 CI를 연결하지 않는다 — CI는 receipt chain이 읽지 않는다 | exclusion |
| UI5 | 운영자 머신 진단(doctor 류)을 CI에서 실행하지 않는다 | exclusion |
| UI6 | branch protection 설정 1회는 축 C에 포함하지만 어떤 상태 체크를 필수로 걸지의 정책 논의는 하지 않는다 | constraint |
| UI7 | flaky는 삭제가 아니라 명시 격리 목록 더하기 티켓으로 처리한다 | direction |
| UI8 | 오늘 baseline이 없는 지표에 목표치를 지어내지 않는다 | constraint |
| UI9 | 미충족 acceptance 항목은 반올림하지 않고 기록한다 | constraint |
| UI10 | 커버리지 100퍼센트는 test가 실행됐다만 말하고 결함을 잡는다를 말하지 않는다 — 축 D 음성 통제가 그 위험을 겨냥한다 | direction |
| UI11 | 커버리지 분모 정의와 Windows runner matrix 여부는 이 milestone이 소유하고 답한다 | direction |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Workflow 주석 4단 | `.github/workflows/env-contract-drift.yml:1-46` | WHY THIS FILE EXISTS · trigger 폭 근거 · scope note(측정 대 강제) · receipt 비연동 명시 |
| 강제 workflow scope note | `.github/workflows/env-contract-drift.yml:27-29` | lint가 RUNS하고 drift에 red가 됨은 보장한다. 그 red가 머지를 막는 것은 저장소 설정이고 repo 파일로 표현 불가하다 |
| run 성공은 증거가 아니다 | `.github/workflows/test-suite-baseline.yml:19-25` | 수용 증거는 run 상태가 아니라 artifact **내용** |
| fork-PR 자격증명 방어 | `.github/workflows/test-suite-baseline.yml:60-71` | `permissions: contents: read` + `persist-credentials: false` + 사유 주석 |
| 순수층 분리 | `scripts/test-suite/enumerate.js:1-12` | I/O 없는 판정층을 떼어 합성 입력으로 결정적 단언 |
| fail-closed 원소 검증 | `scripts/test-suite/run.js:265-330` (`validateElement`) | 필수 키 + 타입 + `redaction_ok !== true` 거부 |
| 제외는 사유 필수 | `scripts/test-suite/enumerate.js:49-76` (`normalizeExclusions`) | 사유 없는 항목은 걸러지지 않고 **throw** |
| 번호 붙은 침묵실패 분기 test | `scripts/tests/test-suite.test.js` | 합성 fixture만, 분기마다 특정 silent-failure 모드를 겨냥 |
| 배선 존재의 짝 단언 | `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` | 두 사실이 같은 값이어야 한다 — 배선을 걷어내면 test가 red |
| 종결 정직성 | `.claude/milestone-closures/ci-full-suite-m2.md` | 조건별 판정 표 + "이 문서가 주장하지 않는 것" 절 |

## Design Decisions

### DD1 — 강제는 신규 workflow가 맡고, baseline은 dispatch 전용으로 축소한다

`.github/workflows/test-suite-baseline.yml`은 자기 헤더로 **"이 workflow는 측정이다. 강제가 아니다"** 를 선언하고
그 선언을 `continue-on-error: true`로 기계화했다. 그 파일을 승격시키면 선언과 구현을 동시에
뒤집어야 하고, 그 순간 baseline이 가진 별개 능력(matrix 측정에서 `--merge-into` 컨테이너 병합)이
사라진다. 두 책임을 한 파일에 두지 않는다.

- 신설: `.github/workflows/test-suite.yml` — 전 PR · fail-closed · 커버리지 게이트.
- 축소: `.github/workflows/test-suite-baseline.yml`에서 `pull_request` 트리거를 **제거**한다. 그 트리거는 자기
  주석이 밝히듯 "머지 전에는 default branch에 없어서 `gh workflow run`이 못 찾는다"는 이유로만
  존재했고, 그 파일은 이미 main에 있으므로 **사유가 소멸했다**. 제거하면 두 workflow가 같은
  스위트를 중복 실행하는 일도 함께 사라진다.

### DD2 — 커버리지 분모는 tracked `*.test.js` 파일 수다. 그리고 skip은 따로 센다

세 후보 중 **test case 수는 이 러너가 산출할 수 없다** — reporter는 `nesting !== 0` 이벤트를
버리고, 그 필터가 `data.file` 귀속 불변식이 서 있는 바닥이다. 남는 둘("파일 수" · "미실행 파일
0")은 같은 것의 두 표현이며, 이미 존재하는 `scripts/test-suite/run.js --list`와 `git ls-files` diff가 그 산출이다.
새 열거 기제를 만들지 않는다.

- **분모** = `git ls-files '*.test.js'` 개수.
- **분자** = 러너가 실행하고 귀속한 파일 수(`per_file`의 원소).
- **격리(exclusions)는 분자에서 뺀다.** 격리가 커버리지를 공짜로 만들면 UI7의 "격리는 삭제가
  아니다"가 형식만 남는다. 격리는 커버리지를 **떨어뜨리고**, 그 하락이 보이는 것이 목적이다.

**머지 판정의 기준은 `coverage_pct == 100`이 아니다.** L2 패널 3관점
(architect · test · invariant)이 같은 결함을 독립적으로 지목했다 — 격리를 정상 경로로 허용하면서
게이트를 `--assert-full`(100퍼센트 미만이면 비영점)에 걸면, 격리가 1건이라도 생기는 순간 전 PR이
영구 red가 되어 저장소가 머지 불가가 된다. 그 상태의 유일한 출구는 게이트 완화이고, 그것은 이
milestone이 만들려는 것의 반대다.

**그리고 `unexplained == 0`은 차단력의 원천이 아니다.** L2 R10 architect가 지적했고 실재한다 —
`enumerate.js` L111-132가 `included ∪ excluded = tracked`를 구성으로 보장하고, `run.js` L138-140·L205가
`ok === true`에 `per_file` 원소 수 = `files_total` = |included|를 요구하며, DD3의 0단계가 그
`ok`와 `measured − tracked ≠ ∅`를 2단계보다 **먼저** 막는다. 그러므로 커버리지 오라클에 도달하는
measurement에서 `unexplained`는 **측정과 트리가 같은 한 항상 공집합**이다.

그것을 vacuous라고 부르지 않는 이유는 조건이 재는 것이 바로 **그 "같은 한"**이기 때문이다.
비지 않는 실제 경우가 있다: 측정 이후 tracked test 파일이 **추가**되면 게이트가 해소한 `tracked`에는
있고 measurement에는 없어 `unexplained`가 그 파일을 담는다 — 이는 stage 0의
`measurement_tree_mismatch`(반대 방향, 측정에는 있는데 트리에 없다)와 짝을 이루는 정합 검사다.
즉 `unexplained`는 **measurement↔tree 정합의 한쪽 방향**이고, 그 이상을 주장하지 않는다.

따라서 이 milestone의 실제 차단력은 **둘**에서 온다 — stage 0의 attribution 불변식 · DD9 삭제 래칫.
**단 stage 0의 차단력은 강제 workflow 경로에서 부분적이다**(L2 R21 architect). `scripts/test-suite/run.js` L725가
`ok:false`에서 비영점으로 죽고 단언 1d가 모든 step의 `if:`를 금지하므로, 그 사고에서는 판정 step이
실행되지 않아 `gate.json`도 stage 0 사유 코드도 CI에 남지 않는다 — **체크는 red이지만**(그래서
머지 차단이라는 결과는 성립한다) 그 red의 판정자는 게이트가 아니라 전수 실행 step이다. 게이트의
stage 0이 실제로 발화하는 경로는 러너가 exit 0으로 끝났는데 산출이 불완전한 경우(chunk spawn 실패
후 `exit_code:null` 접힘 등)와 dispatch·로컬 진단이다. R10이 `unexplained`에, R16이
`exclusions_digest`에 대해 한 철회와 같은 정직성을 이 축에도 적용한다 — 다만 결론(둘)은 바뀌지
않는다: 이 축은 **완전히** 공허한 것이 아니라 도달 경로가 좁다.
**`exclusions_digest` 앵커링도 그 둘에 들지 않는다**(L2 R16 architect): 강제 workflow에서는 생산 줄과
판정 줄이 **같은 리터럴 경로**를 읽도록 오라클이 값까지 pin하므로 두 입력이 같은 job의 같은 파일에서
나오고, digest는 러너가 *로드한* 목록에서 계산되므로(`scripts/test-suite/run.js:580`) 격리 적용이
잘못돼도 어긋나지 않는다. 즉 CI 경로에서 이것은 `unexplained`와 같은 **정합 검사**다 — R10이
`unexplained == 0`을 간판에서 내린 것과 같은 형태의 과대주장이었다. 앵커가 무용한 것은 아니다:
전수 실행 줄에서 `--exclude-from`이 **소실되는** 배선 사고를 잡고(그때 빈 목록 digest가 봉인된다)
dispatch·로컬처럼 두 입력이 갈릴 수 있는 경로에서 짝짓기를 막는다. 그 자리에 정직하게 남긴다. **`max_excluded_files`는 그 셋에 들지 않는다**
(L2 R13 invariant): 등가 단언이므로 같은 PR에서 glob을 넓히고 상수를 그 확장 결과와 같게 올리면
게이트 조건과 등가 test가 **둘 다 green**이다 — 이 상한이 주는 것은 기계적 차단이 아니라 **diff
가시성**이고, Risks 행과 DD4a가 이미 그렇게 적고 있었다. 전면 격리(`**/*.test.js`)를 실제로 막는
것은 상한이 아니라 분기 (13)이다(`per_file`이 비었는데 tracked가 비어있지 않으면 차단 —
`deriveAttribution`이 `none`을 내고 `ok:false`가 되어 stage 0이 잡는다). 앞선 라운드는
`unexplained == 0`을 머지 판정의 간판으로 적었고, 그 문장은 이 계획이 `fully_skipped`를 철회하며
세운 기준("합성 fixture로만 단언되는 것을 간판으로 올리지 않는다")과 어긋났다.

그 위에서 판정을 **버킷 완전성**으로 구성한다. tracked 파일 각각은 정확히 한 버킷에 든다:

**분모가 어디서 오는지부터 못박는다.** L2 architect가 지적한 것이고 실재했다 — 아래 세 버킷은
전부 `tracked` 집합 위에서 계산되는데 그 집합의 **입력 채널이 어느 CLI 표면에도 선언되지 않았다.**
가장 자연스러운 오독(measurement의 `files_total`을 분모로 삼기)을 택하면 두 차단 조건이 동시에
무의미해진다: `files_total`은 `files.length` = **격리 적용 후** included 개수이므로
(`scripts/test-suite/run.js:577-578`) `unexplained`는 정의상 항상 0이고, floor는 격리가 늘 때마다
함께 내려가 래칫이 **반대로** 작동한다.

그래서 채널을 선언한다: `tracked`는 **`git ls-files -z '*.test.js'`** 다(NUL 구분 — `scripts/test-suite/run.js` L404-409가
  같은 파싱을 이미 채택하고 그 이유를 "개행 분리는 개행을 포함한 파일명을 조용히 누락시키고,
  **누락은 분모를 줄인다**"로 적어 두었다. 분모 채널의 소유자가 러너의 규율을 물려받지 않던
  것이고, 방향은 fail-closed였지만 두 채널이 같은 집합을 다르게 세는 것 자체가 결함이다:
  L2 R23 architect). 순수층은 그 결과를
**인자로 받는다**(I/O는 CLI층에만 둔다). `measurement`에서 분모를 파생하는 것은 **금지**이며,
그 금지는 산문이 아니라 짝 단언으로 고정한다. git 호출이 실패하거나 빈 목록을 내면 **차단**한다 —
분모 0은 커버리지 100퍼센트가 아니라 측정 실패다.

**그 해소 책임은 `gate.js`에 있다 — `coverage.js`의 CLI가 아니다.** L2 R5가 두 관점에서 같은
결함을 찾았고 실재했다: 앞선 라운드가 이 채널을 `coverage.js` CLI에 배정했는데 **게이트가 실제로
부르는 것은 `gate.js`**이므로(DD3), 그 선언도 그 fail-closed도 CI가 지나지 않는 표면에만 있었다.
짝 단언마저 `computeCoverage` 순수층만 겨냥해, gate 경로에서 같은 오독이 재현돼도 붉어질 test가
없었다. 이 milestone이 세 번 경계한 실패 모드("기계는 만들어지고 그것을 부르는 한 줄이 빠진다")를
**네 번째로** 재현한 셈이다.

정정: `tracked` 해소와 fail-closed 셋(git 실패 · 빈 목록 · `--floor-from` 부재)은 **`gate.js`
CLI층의 계약**이고 짝 단언은 gate 분기에 직접 건다. `coverage.js` CLI는 같은 해소를 로컬 진단용으로
재사용할 뿐이다.

| 버킷 | 뜻 | 머지 차단 |
|---|---|---|
| `executed` | 러너가 돌리고 귀속했다 | — |
| `excluded` | tracked 격리 목록에 사유와 티켓을 달고 등재됐다 | — |
| `unexplained` | 위 어느 쪽도 아니다 | **차단** |

게이트 플래그는 `--assert-accounted`이고 조건은 **셋의 논리곱**이다 — `unexplained === 0` ∧
`excluded.length <= max_excluded_files` ∧ `exclusions_digest` 일치. 첫 조건만으로는 게이트가
**한 줄로 완전히 열린다**: 패턴은 glob이고 `enumerate.js`의 `globToRegExp`가 `**`를 경로 구분자를
넘는 `.*`로 확장하므로, `{pattern:"**/*.test.js", reason, ticket}` 단일 항목이면 전 tracked 파일이
`excluded`로 들어가 `unexplained === 0`이 되고, 항목 수 상한(1건)도 `ticket` 필수도 DD9 floor도
전부 만족하며, 유일하게 남는 신호 `coverage_pct = 0`은 아래에서 **명시적으로 비차단**이다. 즉
머지 차단 게이트가 green을 유지한 채 스위트 전체를 지운다. **래칫이 재야 하는 것은 줄 수가 아니라
덮인 파일 수다** — 두 번째 조건이 그것이고, 상한은 DD9의 floor와 같은 성격의 상수라 같은 파일
`.github/test-suite-floor.json`이 `max_excluded_files`로 함께 들고 있는다(파일을 늘리지 않는다).

세 번째 조건은 **앵커링**이다. 판정은 두 입력을 받는다 — 러너가 낸 measurement와 격리 목록 — 이고,
그 둘이 같은 실행에서 나왔다는 보장이 없으면 격리 없이 돈 측정과 큰 격리 목록을 짝지어
`unexplained = 0`을 만들 수 있다. 러너는 이미 `run.js`가 `exclusions_digest`를 산출물에 봉인하고
`enumerate.js`의 주석이 그 목적을 "사후 대조를 가능하게 한다 — 제외가 커버리지 분모를 정하는 유일한
필드"라고 못박아 두었다. 새 앵커를 만들 필요가 없고, **이미 있는 것을 쓰지 않는 것**이 결함이었다.
`coverage.js`가 로드한 exclusions로 digest를 재계산해 measurement의 값과 대조하고, 불일치면
`ok = false`다.

이것이 OQ5 후보 3번
("CI가 실행하지 않는 파일이 0")을 그대로 기계화한 것이며, 후보 1번(파일 수 비율)은 **차단 조건이
아니라 보고 수치**로 남는다. `coverage_pct`는 여전히 산출·기록되고 격리가 그것을 떨어뜨린다 —
Acceptance 2가 요구하는 "산출된 숫자"가 그것이고, UI9의 "반올림하지 않는다"가 거기 걸린다.

**그러면 격리는 왜 공짜가 아닌가.** 대가가 커버리지 red에서 **세 가지 가시적 비용**으로 옮겨간다 —
tracked 파일의 diff(DD7) · `ticket` 필수 · 상한 상수를 같은 diff에서 올려야 하는 래칫. 즉 격리는
여전히 비싸고 보이지만, 저장소를 인질로 잡지 않는다.

`--assert-full`은 **삭제하지 않고** 로컬 진단용 엄격 플래그로 남긴다(운영자가 "지금 100퍼센트인가"를
묻는 용도). 게이트는 그것을 부르지 않는다.
- **`fully_skipped`는 이 milestone이 산출하지 않는다 — producer가 없기 때문이다.** 전 test가 skip인
  파일("실행됐다"는 참이고 "단언이 돌았다"는 거짓)은 실재하는 위험이고 `codex-companion-smoke.test.js`가
  러너의 codex 정책 하에서 정확히 그 상태다. 그러나 그 상태를 **말할 수 있는 데이터가 측정 경로에
  없다**: `scripts/test-suite/run.js` 전문에 skip 개념이 0건이고 `scripts/test-suite/reporter.mjs`는
  `nesting !== 0` 이벤트를 버려 `nesting0_events`/`attributed_events`만 센다. 그 reporter는
  `## Files to Change`에 없고 넣는 것은 범위 확대다(UI1).
  그래서 필드를 **만들지 않는다**. 합성 fixture로만 단언되는 필드를 스키마에 올리면, 실제 CI에서
  그 값이 영원히 0이거나 부재여도 test는 항상 green이다 — 계획이 스스로 금지한 "기대 모양을 손으로
  만들어 놓고 진짜 producer가 그 모양을 낸다고 주장하는" 형태다. 허위 커버리지 축은 backlog가
  소유하고(reporter가 실패 이벤트를 싣는 별도 축과 같은 자리), 여기서는 **측정 공백으로 기록**한다.

### DD3 — redaction_ok 결합은 완화가 아니라 **판정 순서**로 닫는다

M2가 발견한 결합은 이렇다 — red test의 단언 diff에 드라이브 모양 합성 fixture가 실리면
`win-drive-abs` 규칙이 그것을 잡아 `redaction_ok:false`가 된다. **정규식 결함이 아니다**. 그
규칙은 이미 드라이브 문자 앞 경계를 갖고 있고, 여기서는 그 경계를 통과한 진짜 드라이브 모양
문자열을 잡은 것이다.

닫는 방법은 규칙 완화가 아니다 — 완화는 탐지 표면을 좁히고, 그 표면이 "이 workflow가 매 PR마다
공개 artifact를 올린다"는 사실 위에 서 있다. 대신 **게이트가 suite green을 요구하는 순간 결합이
구조적으로 공허해진다**: green이면 단언 diff 자체가 존재하지 않으므로 스캔할 실패 텍스트가 없다.

**그런데 그 "게이트가 green을 요구하는 지점"이 존재하지 않았다.** L2 invariant가 CRITICAL로 지목한
것이고, 실재한다 — 러너는 red 스위트에 대해 **exit 0으로 끝나도록 설계돼 있다**:

> `scripts/test-suite/run.js:10-12` — "`ok` = **측정이 성립했는가**. 스위트 green이 아니다.
> `exit_code`가 비영점이어도 `ok:true`일 수 있고" · `:725` — `return result.ok ? 0 : 1;`

즉 CLI 종료코드는 `ok`(측정 성립)이지 `exit_code`(스위트 green)가 아니다. 그리고 그것은 **결함이
아니라 M1이 의도한 계약**이다(측정 도구가 red로 죽으면 실패 목록을 담은 artifact가 안 올라온다).
그 계약을 깨면 M1·M2가 세운 측정 축이 무너지므로 **러너는 손대지 않는다**. 대신 판정을 **소비처로
옮긴다**.

DD3이 정한 순서는 산문이 아니라 **모듈 하나**여야 한다. 순서를 workflow의 셸 단계 셋으로 흩으면
그중 하나를 지워도 아무 test가 붉어지지 않고(축 D의 절단 오라클 사거리 밖), 이 milestone이 스스로
경계한 "기계는 만들어지고 그것을 부르는 한 줄이 빠진다"를 세 번 반복하게 된다. 그래서
`scripts/test-suite/gate.js`가 **DD3의 유일한 소비처**다 — measurement 하나와 격리·floor 입력을 받아
세 축을 순서대로 판정하고, 어느 하나라도 실패하면 비영점으로 죽는다:

| 순서 | 축 | 실패 시 |
|---|---|---|
| **0** | `measurement.ok === true` (측정이 성립했는가) | **차단.** 아래 셋을 평가할 자격이 없다 |
| 1 | `measurement.exit_code === 0` (스위트 green) | **차단.** 메시지에 실패 파일 목록과 "아래 유출 판정은 이 red의 하류일 수 있다"를 함께 싣는다 |
| 2 | `computeCoverage(...).ok` (DD2의 3조건) | **차단.** `reasons`를 그대로 싣는다 |
| 3 | `measurement.redaction_ok === true` | **차단.** 여기 도달했다는 것은 1이 통과했다는 뜻이므로 **green인데 유출**이다 — 하류 가능성이 구조적으로 배제된다 |

**0단계가 없으면 1단계가 거짓말을 한다.** chunk의 spawn이 실패하면 그 chunk는
`{exit_code: null, …}`을 내고(`scripts/test-suite/run.js:489-505`), `foldChunks`가
`Number(r.exit_code) || 0`으로 접으므로(`:179-183`) `null`이 **0으로** 바뀐다. 즉
`ok:false ∧ exit_code:0 ∧ redaction_ok:true`인 measurement가 실재하며, 스위트가 **한 번도 돌지
않았는데** 1·3단계를 통과한다.

그 조합이 정확히 `ok`가 존재하는 이유다 — 러너 헤더가 `ok`를 "측정이 성립했는가"로 정의하고
(`:10-12`) 그것을 종료코드로 삼는다(`:725`). 게이트는 그 필드를 **버리는 대신 첫 번째로 읽어야**
했다.

**`per_file`의 부재 모양은 `null`이다 — `[]`가 아니다.** 이 문장은 R5에서 한 번 **거꾸로**
적혔고 R6의 두 관점이 그것을 잡았다. 소스가 명시적이다:

> `scripts/test-suite/run.js:213-214` — "`ok:false`일 때 `per_file`은 `null`이지 `[]`가 아니다 —
> 모름을 0으로 쓰지 않는다." / `per_file: ok ? perFile : null`

즉 0단계가 겨냥하는 바로 그 시나리오(chunk spawn 실패 → `ok:false`)에서 최상위 `per_file`은
**`null`** 이고, `[]`는 `ok===true` ∧ tracked 공집합에서만 나오는 드문 모양이다. 러너는 여기서
"모름"과 "0"을 의도적으로 구분한다 — 커버리지 오라클도 같은 구분을 지켜야 하므로 `null`을 0으로
접지 않고 **차단**한다(부재는 "적음"이 아니다). 두 모양을 모두 단언하되 정본은 `null`이다.

이 정정이 여기 남는 이유: R5는 "실제 producer가 내지 않는 모양만 단언하는 것은 금지"라는 옳은
방법론을 **틀린 사실**에 적용해, 실재하는 모양을 부차로 밀어낼 뻔했다. 방법론이 옳아도 사실 확인을
건너뛰면 반대 방향으로 틀린다.

**순서가 caveat을 구조로 바꾼다.** 3번은 1번이 통과해야만 도달하므로, "red의 하류일 수 있음"이라는
단서는 1번에서 멈춘 경우에만 붙고 3번에서 멈춘 경우에는 붙을 수 없다. 두 신호를 합치지 않고 하나가
다른 하나를 설명한다는 M2의 처방이 여기서 기계가 된다.

세 축 모두 **차단한다**(L2 invariant가 지적한 대로 `redaction_ok`의 차단 여부가 미정의였다). 게이트가
매 PR 공개 artifact를 올리는 이상, green 스위트에서의 유출 판정은 정보가 아니라 사고다.

이것은 완화가 아니라 순서와 설명이다. `scripts/test-suite/redact.js`는 한 줄도 바꾸지 않고,
`scripts/test-suite/run.js`의 종료코드 계약도 한 줄도 바꾸지 않는다.

### DD4 — fork PR 위협모델을 명시한다. pull_request_target은 쓰지 않는다

전수 스위트는 `git ls-files '*.test.js'`를 전부 실행하므로 **PR이 추가한 test 파일이 러너에서
실행된다**. 오늘도 그렇지만 측정일 뿐이었다. 머지 차단으로 승격하면 CI 상태를 조작할 유인이
생기므로 위협모델을 문서가 아니라 workflow 파일이 들고 있어야 한다.

- `permissions: contents: read` (최소) · `persist-credentials: false` · secrets 미주입.
- `actions/*`를 **commit SHA로 pin**한다. 태그 pin은 머지 차단 workflow에 부적합하다.
- **`pull_request_target`을 쓰지 않는다** — 그것은 PR 통제 코드에 쓰기 토큰을 주는 경로다.
- artifact 업로드는 유지하되(`if: always()`) 그 내용은 `scripts/test-suite/redact.js`를 이미 통과한 산출이다.
  잔여 유출 축은 `scripts/test-suite/redact.js` 헤더가 열거하고 backlog가 소유한다.
  **다만 "이 milestone이 넓히지 않는다"고 적었던 것은 거짓이었다**(L2 R7 security) — 유출 *축*은
  그대로지만 **노출 빈도**는 넓어진다. baseline은 `paths`가 `scripts/**`와 자기 자신으로 좁혀져
  있었는데(`.github/workflows/test-suite-baseline.yml:35-38`) 새 workflow는 필터 없이 전 PR에서
  artifact를 올리므로, 같은 잔여 축이 훨씬 자주 노출된다. 그 사실을 기록하고 넘어간다 — 커버리지
  확대는 backlog가 소유하는 별도 축이고, 이 milestone이 그것을 닫는다고 주장하지 않는다.

### DD5 — 축 D는 1회 이벤트가 아니라 **스크립트**다

PRD는 "1회 실증"이라 적지만, 재현 불가한 이벤트로 두면 M3 자신이 우산의 서명 실패 모드
("기계는 만들어지고 그것을 부르는 한 줄이 빠진다")를 반복한다 — 훗날 커버리지가 다시 깨져도
그것을 잡을 기계가 없다. 그래서 **절단을 스크립트로 고정**한다.

`scripts/test-suite/wiring-cut.js`가 **절단 셋**을 소유한다(Task 7의 표). 복원은 스크립트의
`--revert*`와 `git status --porcelain`이 비어 있음이 함께 보장한다 — `git diff --exit-code`만으로는
index 변경(절단 A가 파일을 tracked로 심는다)을 놓친다. 실증이 영구 파손으로 남지 않게 하는 것이
그 검사다.

**그 CI 증거가 어디서 나오는지를 명시한다.** L2 architect가 지적한 것은 실재했다: Acceptance는
"절단이 CI에서 red를 만든 run URL"을 요구하는데, 이 계획의 workflow는 둘뿐이고 어느 쪽도
`wiring-cut.js --apply`를 부르는 단계를 갖지 않았다. 요구된 증거가 착지할 자리가 없었다.

절단을 실행하는 **전용 job이나 workflow를 만들지 않는다.** 축 D가 증명해야 하는 명제는 "절단이
`test-suite` 체크를 red로 만든다"이고, 그것을 가장 정직하게 재는 방법은 **절단된 트리를 실제로
그 체크에 통과시켜 보는 것**이다. 전용 job은 그 명제 대신 "전용 job이 red를 만든다"를 재게 된다.

절차는 **버리는 PR 한 개**이고 그 위에서 run 셋을 얻는다:

1. `chore/axis-d-negative-control` 브랜치를 따고 `wiring-cut.js --apply-red` 결과를 커밋 1개로
   올린다. PR을 열고 `test-suite` 체크가 **red**가 되는 run을 기록한다 — 절단 A.
2. `--revert-red`를 커밋 2로 올린다. 같은 체크가 **green**이 되는 run이 A의 **대조**다.
3. `--apply-delete <path>`를 커밋 3으로 올린다. 다시 **red**가 되는 run이 절단 B다.
4. **그 PR은 머지하지 않고 닫는다.** 브랜치도 지운다. 절단은 main에도 작업 브랜치에도 도달하지 않는다.

세 run이 같은 브랜치에 있는 것이 의도다 — 대조가 다른 브랜치면 무관한 차이가 섞인다. 비교 단위는
커밋이 아니라 **브랜치의 세 상태**이며, 복원이 트리를 바꾸므로 "같은 커밋의 두 run"은 성립할 수 없다.

즉 축 D의 CI 상시 실행은 없고(비용), 1회 실증은 이 버리는 PR이 남긴 run URL이며, 재현 수단은
스크립트와 그 test다. 이 절차 자체는 새 파일을 만들지 않으므로 `## Files to Change`는 불변이다.

**오라클은 문자열 존재가 아니라 실행 줄이어야 한다.** L2 test가 지적한 것은 이 저장소가 이미 한 번
당한 사고다 — §3.17의 `impeccable-resolve.test.js`는 명령 본문 전문을 훑어 리터럴을 모았고, 진짜
호출이 전부 걷힌 뒤에도 **산문 한 줄이 남아 green을 유지했다**. "배선이 아니라 산문을 검사하고
있었다." 여기서 그 사고가 재현될 조건은 갖춰져 있다: Task 5.3이 workflow에 4단 헤더 주석을
요구하고 그 주석이 단계 순서(열거 → 전수 → 커버리지 → redaction)를 **서술**하므로, 절단이 실행
줄만 지워도 주석의 같은 문자열이 test를 green으로 유지한다.

그래서 `wiring-cut.test.js`는 **주석을 걷어낸 뒤** 스캔하고, 그 성질 자체를 짝 단언으로 고정한다 —
합성 fixture 두 개(실행 줄만 있는 YAML · 주석에만 그 문자열이 있는 YAML)에 대해 전자는 만족하고
**후자는 만족하지 않아야 한다**. 그 단언이 없으면 축 D의 실증은 "절단했더니 red가 됐다"가 아니라
"절단했는데 우연히 red가 됐다"이고, 둘은 구분되지 않는다.

### DD6 — branch protection은 파일이 아니다. 그래서 **그 부재를 잡는 진단**을 둔다

설정 자체는 수동 1회이고 정책 논의는 하지 않는다(UI6). 그러나 실재하는 drift가 하나 있다 —
required status check는 **job 이름 문자열**로 걸리므로, workflow의 job 이름을 바꾸면 보호가
조용히 풀린다. 그것이 정확히 우산이 경고한 실패 모드다.

`scripts/ci-required-checks.js`가 (a) workflow 파일이 선언한 job 이름과 (b) `gh api`로 읽은
저장소의 required check 목록을 대조해 어긋나면 비영점으로 끝난다. **CI가 아니라 운영자가 돌리는
진단**이다 — 관리 권한 토큰이 필요하고, UI5가 운영자 진단의 CI 실행을 금지한다. 런북에 등재한다.

지금이 이름을 정할 유일하게 싼 시점이다 — **오늘 branch protection과 ruleset이 둘 다 미설정**임을
실측했으므로(`gh api .../rulesets`가 빈 배열, `.../branches/main/protection`이 404), 이름을 바꿔도
풀릴 보호가 없다.

### DD7 — 격리의 통제는 런타임 검사가 아니라 **tracked 파일의 코드 리뷰**다

security S5가 지적한 것은 실재한다 — `scripts/test-suite/enumerate.js`는 `reason`이 비어있지 않은지만 보고 작성자
provenance를 구분하지 않으므로, PR 작성자가 자기가 손댄 test를 스스로 제외하고 그럴듯한 사유를
적어도 통과한다. 런타임으로 이것을 막을 방법은 없다. 러너는 누가 PR을 냈는지 모르고, 알아도
그 판단은 사람의 것이다.

그래서 통제를 **위치**로 옮긴다: 격리 목록을 `.github/test-suite-exclusions.json` 한 파일에 두고
게이트가 **그 경로만** 읽는다. 격리 추가는 tracked 파일의 diff가 되어 리뷰 표면에 반드시 나타난다.
그 위에 기계적 상한 **셋**을 얹는다 — 항목 수 상한 · `ticket` 필드 필수 · **격리된 파일 수 상한**.
셋 중 **항목 수 상한과 격리 파일 수 상한은 현재 값과 등가**이고, 그 등가를 Task 3의 단언이
기계로 확인한다 — 산문으로 두면 초기값이 어디에도 pin되지 않아 헤드룸을 크게 잡는 것만으로 게이트가
열린다(L2 R9 invariant). 늘리려면 상한 상수를 같이 올리는 별도 편집이 필요하고 그 사실이 diff에
숫자로 남는다(`EVIDENCE_DEBT_CEILING` 선례).

**셋째가 없으면 앞의 둘은 아무것도 막지 못한다.** 항목 수는 목록의 *줄 수*이고 패턴은 glob이므로,
`**/*.test.js` 한 줄이 상한을 1로 유지한 채 저장소 전체를 덮는다(DD2가 그 경로를 열거한다). 세는
단위를 **glob 확장 결과의 파일 수**로 바꾸는 것이 유일한 닫힘이고, 그 상한을 재는 것은 **게이트(`gate.js`)**
이고 `coverage.js` CLI는 같은 순수 함수를 부르는 로컬 진단 진입점이다 — 차단 권한은 `gate.js`
단독이다(Task 2). 앞선 라운드는 여기 강제 주체를 `coverage.js`로 적어 네 번 정정한 소유권과
어긋났고, DD7만 읽은 구현자가 CI가 지나지 않는 표면에 상한을 배선하는 R5의 "네 번째 재현"으로
되돌아갈 수 있었다(L2 R13 architect). 검증기(`exclusions.js`)가 아니라 게이트가 재는 이유는, 확장
결과는 tracked 집합이 있어야 계산되고 그 집합을 아는 것은 커버리지 오라클뿐이기 때문이다.

**그 검증기는 소비 경로 위에 있어야 한다.** L2 architect가 지적한 대로, 스위트를 실제로 도는
`scripts/test-suite/run.js`는 `--exclude-from`을 `readJsonFile` → `enumerate.normalizeExclusions`로
넘기고 그 검증기는 `{pattern, reason}`만 본다 — `ticket`도 상한도 요구하지 않는다. 검증기를
`exclusions.js`에 새로 만들고 러너를 재배선하지 않으면, 그 상한은 사람이 로컬에서 부르는 한 줄
(`## Validation` 검사 3)에만 존재하게 된다. **그것이 정확히 이 우산 PRD가 지목한 "기계는
만들어지고 그것을 부르는 한 줄이 빠진다"이고, 이 milestone이 그 실패 모드를 자기 자신에게서
재현하는 것은 받아들일 수 없다.** 그래서 `run.js`가 `--exclude-from`을 `exclusions.js`를 통해
로드하고(그 안에서 `normalizeExclusions`를 계속 호출해 기존 계약을 보존한다), 강제 workflow의
단계 순서에도 exclusions 검증이 명시적으로 들어간다(Task 3·5).

### DD4a — 게이트 위조는 이 milestone이 닫지 않는다. 닫지 않는다고 **적는다**

fan-out이 meta-gap으로 제기했고 L2가 여러 라운드에 걸쳐 되물은 축이다: 축 D는 "절단이 red를 만든다"를
실증하지만 그 역 — **CI를 속여 green을 보고하게 만들 수 있는가** — 에는 음성 통제가 없다.
사실관계는 이렇다:

- 게이트의 판정 입력은 **PR이 통제하는 트리가 생산한 measurement JSON 하나**다. 러너가 `git_sha`와
  `ci_run_id`를 산출물에 싣지만(`scripts/test-suite/run.js:575-576`) `gate.js`는 그것을 HEAD와
  대조하지 않는다.
- **그리고 통제는 diff 가시성만이 아니다 — 런타임 변조 경로가 하나 더 있다.** 강제 workflow의
  단계 순서는 전수 실행(= PR이 작성한 임의 test 코드가 러너에서 실행) → 판정이므로, PR이 추가한
  test 파일이 실행 중에 워크스페이스의 `.github/test-suite-floor.json`·
  `.github/test-suite-exclusions.json`을 덮어쓰면 게이트는 그 변조된 입력으로 판정한다. 그때는
  DD7·DD9가 실효 통제로 든 "상수를 올리는 별도 편집이 diff에 숫자로 남는다"가 성립하지 않는다
  — diff에 남는 것은 숫자가 아니라 test 코드다(L2 R23 security). 결론은 바뀌지 않는다(이
  milestone은 이 축을 닫지 않는다) 그러나 **근거 서술이 배선보다 넓게 적혀 있었고**, 그 폭이
  잔여를 실제보다 작아 보이게 한다. 닫으려면 판정 입력을 러너가 손댈 수 없는 곳에서 읽어야
  하는데(별도 job + artifact, 또는 base 트리에서 읽기) 그것은 M3 범위 밖이다.
  래칫 상수 셋(`max_excluded_files` · `tracked` floor · 항목 수 상한)과 판정 모듈 자신
  (`gate.js` · `coverage.js` · `wiring-cut.test.js`)이 전부 tracked 파일이라 **같은 PR에서 함께
  수정 가능**하다. DD7·DD9는 격리·삭제 축에 대해 이 사실을 이미 명시하는데, 같은 논리가 판정 모듈
  전체에 적용된다는 것은 적혀 있지 않았다.
- `redaction_ok` 차단은 **발행을 막지 못한다**. Task 5의 업로드 단계는 판정 **뒤**에 있지만
`if: always()`이므로 게이트가 3단계에서 차단해도 유출본은 **조건 없이** 공개 artifact가 된다 —
"판정 전에 이미 올라가 있다"고 적었던 것은 이 계획의 단계 순서와 어긋난 서술이었다(L2 R15·R16
security가 연속 지목). 보안 결과는 같지만(차단해도 발행은 일어난다) 다음 사람이 stage 3 차단을
발행 방지로 오해하지 않도록 배선대로 적는다. 발행을 실제로 줄이려면 업로드를 `redaction_ok`에
조건화해야 하는데, 그러면 축 D의 red run 증거가 사라지므로 **이 milestone은 증거를 택했다** —
그 교환을 여기 기록한다.

**닫지 않는 이유는 통제 지점이 런타임이 아니기 때문이다.** `pull_request`는 머지 ref의 트리로
실행되므로, 그 트리 안의 어떤 기계도 그 트리를 감시할 수 없다 — 감시자를 함께 고치면 그만이다.
실효 통제는 코드 리뷰와 branch protection의 **필수 리뷰어**이고, 그것은 저장소 설정이지 이 milestone의
파일이 아니다(UI6이 정책 논의를 범위 밖으로 둔다). 그래서 여기서는 **기록**한다 — 이 게이트가 막는
것은 *부주의*이지 *의도*가 아니다. 그 문장이 없으면 다음 사람이 이 게이트를 위조 방어로 오해한다.

### DD9 — 삭제 축에도 래칫을 건다. 분모가 줄면 커버리지는 거짓말을 한다

L2 security가 찾은 것은 격리보다 **싼 우회**다: 커버리지가 `분자 / 분모`이고 분모가
`git ls-files '*.test.js'`이므로, **test 파일을 지우면 분모와 분자가 함께 줄어 100퍼센트가 유지된다.**
배선을 끊는 커밋이 그 배선을 단언하는 test를 같이 지우면 머지 차단 게이트가 green이다 — 축 D가
겨냥한 바로 그 실패 모드이고, DD7이 격리 축에만 래칫을 걸어 둔 사이 삭제 축에는 아무 기계도
없었다.

첫 시도는 격리와 같은 형태였다: `.github/test-suite-floor.json`에 **기대 최소 tracked 개수**를
상수로 두고 `tracked < floor`이면 차단한다. 줄이려면 floor를 같은 diff에서 내려야 하고 그 숫자가
리뷰 표면에 남는다.

**그런데 이 상수 하나로는 삭제 축이 시간이 지나면 저절로 열린다.** floor를 정확히 현재 개수로 두면
test 추가 때마다 붉어지므로 "floor 이하만 금지"로 완화할 수밖에 없는데, 그 완화가 곧
`tracked - floor`만큼의 **slack**이다. 다른 자식(C1·C2·C4)이 새 test를 추가하는 것은 가설이 아니라
PRD가 likelihood **높음**으로 등재한 사건이고(PRD L108), slack이 N이 되면 상수를 한 글자도 건드리지
않고 test 파일 N개를 지울 수 있다 — 커버리지는 100퍼센트를 유지하고 `unexplained`는 0이며
`tracked >= floor`도 참이다. 게이트 모양은 남고 막는 것만 사라진다. 그 slack을 재는 단언도 floor를
다시 조이는 기계도 앞선 라운드의 계획에는 0건이었다(L2 R7 invariant).

그래서 삭제 축의 **정본 래칫은 상수가 아니라 base와의 대조**이고, 그 대조는 **개수가 아니라 경로
집합**이다. `gate.js`가 `--base-ref`를 받아 base에서 `git ls-tree -r <base> --name-only`로
`*.test.js` **경로 집합** `base_set`을 세우고(커밋 축이라 index를 읽는 `git ls-files`와 다르다),
head 집합과의 차 `missing = base_set − head_set`을 구한다. `missing`이 비어 있지 않으면 2단계에서
차단하고, `missing`의 원소가 전부 `allow_deletions`에 있으면 통과한다.

**`base_set`이 비면 차단한다 — 그 대칭이 없으면 이 축이 unknown 입력에서 관대해진다.** head 쪽은
"빈 tracked 목록"이 fail-closed 목록에 있는데 base 쪽에는 "해소 실패"만 있었다(L2 R17 invariant).
ref가 해소되면서도 출력이 비는 구성(얕은 클론, 트리 없는 ref)에서는 `git ls-tree`가 exit 0 + 빈
stdout을 내고 `missing = ∅`이 되어 **래칫이 무조건 통과**한다. 계획이 "실제 차단력 둘" 중 하나로
지목한 축이 조용히 꺼지는 경로이므로 fail-closed에 **일곱째**를 더한다: `--base-ref`가 주어졌고
해소도 됐는데 `base_set`이 비면 `base_set_empty`로 차단한다.

**base는 tip이 아니라 merge base다.** 판정 줄이 넘기는 값은 ref(`origin/$BASE_REF`)이고,
`inputs.js`가 `git merge-base HEAD <ref>`로 해소한 **커밋**에 `ls-tree`를 건다. tip을 그대로 쓰면
head 집합은 이벤트 시점의 merge ref에 고정돼 있는데 base만 앞서 나가므로, base가 새로 추가한 test
파일이 `missing`에 들어와 **아무것도 지우지 않은 PR이 `deleted_without_allowance`로 막힌다** —
"집합 차는 추가에 무감하다"는 주장은 head 쪽 추가에만 참이었다(L2 R17 architect). fail-closed 여섯이
이미 "merge base를 해소하지 못함"을 열거하고 있었으므로 merge base가 원래 의도였고, 여기서 그
드리프트를 닫는다.

**개수 비교가 아닌 것이 핵심이다.** 앞 라운드는 이것을 `tracked_head < tracked_base` 부등식으로
적었고 그때 함께 적은 "slack이 구조적으로 없다"는 **거짓이었다**(L2 R8 invariant) — 삭제 1건과
추가 1건이 같은 PR에 있으면 `head == base`가 되어 조건이 거짓이 되고 삭제가 무검사 통과한다.
그리고 그 상쇄는 적대적 시나리오가 아니다: 다른 자식(C1·C2·C4)이 test를 추가하는 것은 PRD가
likelihood **높음**으로 등재한 사건이므로(PRD L108) 삭제와 추가가 한 PR에 섞이는 것은 평범한
일이다. 집합 차는 추가에 무감하고 삭제에만 반응하므로, "추가는 자유롭게 통과하고 삭제만 걸린다"가
그제서야 실제로 참이 된다.

**rename은 삭제로 판정된다.** 집합 차는 경로를 보므로 test 파일의 디렉토리 이동 같은 평범한 변경이
`deleted_without_allowance`로 막힌다(L2 R13 invariant). 방향은 fail-closed라 안전하고, 출구는
삭제와 같다 — 옛 경로를 `allow_deletions`에 ticket과 함께 올린다. **머지 뒤 그 항목은 정리한다**:
base에도 없어져 효력은 스스로 사라지지만 항목 수 상한이 등가라 stale 항목이 상수를 붙잡으므로,
정리하지 않으면 목록이 단조 증가한다. 그 정리는 다음 격리·면제 편집과 같은 diff에서 한다.

**정리는 `tracked_basis` 재기준을 동반한다 — 이것이 없으면 저장소가 영구 red가 된다.** 산술이
그렇다: basis `B`에서 면제 1건(`D=1`)이면 floor는 `B−2`이고 삭제 후 tracked `B−1`이 통과한다.
정리하면 `D=0`이라 floor가 `B−1`로 올라가 tracked `B−1`과 경계에서 만난다. **두 번째** 삭제
사이클이 같은 절차를 밟으면 tracked는 `B−2`가 되는데 정리 후 floor는 다시 `B−1`이라
`tracked < floor`가 되어 **이후 모든 PR이 `below_floor`로 막힌다**. 그 상태의 출구는 이 계획이
"기계로 확인되지 않는다"고 스스로 표시한 `tracked_basis` 하향뿐이고, 그것은 이 문서가 반복해서
CRITICAL로 닫았다고 적은 "유일한 출구가 게이트 완화"와 같은 형태다(L2 R17 — architect·invariant
독립 지목).

그래서 규칙을 명시한다: **`tracked_basis`는 `allow_deletions` 정리와 같은 diff에서만 손대고,
그때 그 시점의 실제 개수(`git ls-files '*.test.js' | wc -l`)로 다시 적는다. 그 밖의 어떤 이유로도
손대지 않는다.** 이것은 "삭제를 통과시키려 floor를 내리는 것"이 아니다 — 그 삭제는 이미 자기 PR에서
base 집합 차 래칫을 통과했고, 재기준은 backstop을 현실에 다시 묶는 것뿐이다. 둘을 가르는 것은
**정본 축이 다른 곳에 있다**는 사실이다: 말 없는 삭제를 실제로 막는 것은 base 대조이고 그쪽에는
여백도 basis도 없다. 재기준을 잊으면 조용히 약해지는 것이 아니라 `below_floor`로 **시끄럽게**
막히므로, 이 규칙의 위반은 다음 PR이 즉시 발견한다.

정당한 삭제의 출구는 floor 하향이 아니라 같은 파일의 `allow_deletions` 배열이다. 면제는 **경로**로
소모되지 수량으로 소모되지 않는다 — 목록에 없는 경로가 하나라도 사라지면 다른 경로가 아무리 많이
면제돼 있어도 막힌다. 그리고 게이트는 실제로 `missing`에 든 경로만 면제로 인정하므로, 머지된 뒤의
항목은 base에도 없어져 **효력이 스스로 사라진다**. 막는 것은 삭제가 아니라 **말 없는 삭제**다.

**그 출구가 실재하려면 형제 조건이 비켜서야 한다.** 두 래칫은 같은 2단계 논리곱에 살므로, 정적
floor가 현재 tracked 개수와 같으면 면제 목록에 정식 등재된 삭제도 `below_floor`로 막힌다 — 그때
실제 출구는 이 문단이 금지한 floor 하향뿐이 되어 위 문장이 거짓이 된다(L2 R14 architect). 그래서
Task 3이 floor를 **`tracked_basis` − (`max_allowed_deletions` + 1)** 로 못박는다. 관계는 포섭이
아니라 역할 분담이되, **분담이 성립하려면 여백이 필요하다**는 것이 R14가 더한 것이다.
R15가 더한 것은 그 여백을 **확인하는 방식**이다 — 확인이 트리를 읽으면 삭제에서 스스로 붉어져
여백을 도로 없앤다(L2 R15 architect). 그래서 확인은 floor 파일 안의 순수 산술이다.

두 래칫의 관계는 포섭이 아니라 **역할 분담**이다. base 대조는 PR 축에서 빈틈이 없지만
`--base-ref`를 넘기지 않는 호출자(로컬 진단 · 다른 workflow)에서는 출력이 `base=absent`를 싣고
정적 floor로만 판정한다. **강제 workflow에서는 그 경로가 도달 불가다** — 판정 줄이 인자를 항상
넘기고 `BASE_REF`가 `|| 'main'` fallback을 갖기 때문이다(L2 R13 architect가 DD9 서술과 배선의
어긋남을 지적했다). 그 workflow는 `pull_request` 전용이므로 fallback이 발동하는 구성 자체가 없고,
`base=absent`는 게이트 CLI의 일반 계약이지 이 workflow의 동작이 아니다 —
그 경로가 더 약하다는 사실을 게이트가 스스로 말한다. 정적 floor는 그 축의 절대 하한이자 base 자체가
이미 낮아진 경우의 backstop으로 남는다.

**그리고 이 기계도 DD7이 지목한 실패 모드를 그대로 반복할 수 있었다** — 만들어지고, 부르는 한 줄이
빠지는 것. floor는 `--floor-from`이라는 **외부 입력**으로 주입되므로, 강제 workflow의 커버리지
호출에서 그 인자만 빠지면 조건의 후반절이 조용히 사라지고 모든 단위 test와 CI는 green이다. 그래서
셋을 함께 못박는다:

1. **`--assert-accounted`인데 `--floor-from`이 없으면 fail-closed다** — `coverage.js`가 비영점으로
   죽는다. 래칫 입력 없이 차단 판정을 내리지 않는다. permissive default는 선택지가 아니다:
   그것이 정확히 "인자가 빠져도 green"이다. (`--assert-full`은 로컬 진단이므로 이 요구를 받지 않는다.)
2. **호출 줄 전체가 절단 오라클의 대상이다** — Task 7의 `wiring-cut.test.js`가 그 줄의 토큰
   전부(`gate.js` · `--measurement` · `--exclude-from` · `--floor-from`)를 단언하므로 인자를
   지우는 것도 절단으로 잡힌다. `--assert-accounted`는 **그 줄에 없다** — DD3이 판정을 `gate.js`로
   옮기면서 `gate.js` 내부 호출로 흡수됐다(L2 R5가 이 절의 stale 지시를 지적했다).
3. **floor 값 자체도 단언한다** — exclusions의 "상한 상수와 파일 항목 수 일치"와 같은 형태로,
   `.github/test-suite-floor.json`의 값이 그 시점 tracked 개수 이하임을 test가 확인한다.

### DD8 — OQ3(Windows matrix)는 **재면 답이 나온다**. 지금 정하지 않는다

M1의 근거(`win ∩ linux = 2`)는 M2가 약화시켰다 — Windows 전용 실패 6건 중 3건이 플랫폼이 아니라
ambient 봉인 오염이었다. 그 갈래를 걷어낸 뒤의 교집합은 **측정된 바 없다**. UI8이 근거 없는 숫자를
금지하므로 Task 6이 Windows 원소를 1회 측정하고, 그 벽시계와 교집합이 결정을 내린다. 결정 규칙을
측정 **전에** 못박아 자기충족을 막는다:

- Windows 전용 red가 **0건**이면 → PR 게이트는 Linux 전용, Windows는 dispatch 측정으로만 유지.
- **1건 이상**이면 → 그 실패가 실재 플랫폼 결함이므로 matrix에 넣는다. 단 벽시계가 Linux의 10배를
  넘으면 PR 게이트가 아니라 별도 트리거로 분리하고 그 사실을 기록한다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `.github/workflows/test-suite.yml` | CREATE | 축 C 강제 게이트 — 전 PR · fail-closed · 커버리지 게이트 (DD1·DD3·DD4) |
| `.github/workflows/test-suite-baseline.yml` | UPDATE | `pull_request` 트리거 제거해 dispatch 전용 측정으로 축소 (DD1). OS 축 추가 — matrix `os` · `runs-on: ${{ matrix.os }}` · artifact 이름 개명(OS 축 포함, 중복 거부 회피) · `defaults.run.shell: bash` · `runner.temp` (DD8) |
| `.github/test-suite-exclusions.json` | CREATE | 격리 목록의 유일한 정본 경로 — tracked라 추가가 리뷰 표면에 나타난다 (DD7) |
| `.github/test-suite-floor.json` | CREATE | 래칫 상수 다섯 — floor 도출 기준(`tracked_basis`, DD9) · 분모 절대 하한(`tracked`, DD9) · 격리 파일 수 상한(`max_excluded_files`, DD2·DD7) · 삭제 면제 항목 수 상한(`max_allowed_deletions`, DD9) · 삭제 래칫 면제 경로(`allow_deletions`, DD9) |
| `scripts/test-suite/coverage.js` | CREATE | 커버리지 순수 오라클과 CLI — `--assert-accounted`의 **4조건**(unexplained 0 · 격리 파일 수 상한 · `exclusions_digest` 일치 · `tracked >= floor`)과 floor 입력 fail-closed (DD2·DD9). `scripts/test-suite/enumerate.js`의 순수층 분리 패턴을 미러 |
| `scripts/test-suite/gate.js` | CREATE | **DD3 판정 순서의 유일한 소비처**이자 DD9 삭제 래칫(`--base-ref` 경로 집합 차)의 소유자. `{blocked, stage, reasons, message}`를 내며 **판별자는 `reasons` 코드**다(stage 2는 커버리지 실패와 래칫이 공유하는 칸). — green → coverage → redaction 3축을 순서대로 강제한다. 러너 종료코드는 `ok`(측정 성립)이지 green이 아니므로(`scripts/test-suite/run.js:10-12`·`:725`) 이 모듈이 없으면 게이트가 red를 통과시킨다 |
| `scripts/test-suite/exclusions.js` | CREATE | 격리 목록 로드와 검증 — 항목 수 상한 더하기 `ticket` 필수 (DD7) |
| `scripts/test-suite/inputs.js` | CREATE | **구현** 소유자다(계약 소유자는 `gate.js` — 판정과 차단 권한은 여전히 거기 있고, 이 모듈은 그 계약이 부르는 해소를 한 곳에 둔다. 둘을 혼동하면 "한 불변식에 소유자가 둘"이 되므로 구분을 여기 적는다 — L2 R12 architect). `gate.js`와 `coverage.js` CLI가 **공유하는** 입력 해소 — `tracked`(`git ls-files '*.test.js'`) · floor 파일 로드 · 격리 목록 로드 · 그 넷의 fail-closed. 이 모듈이 없으면 두 소비처가 서로를 require해 순환이 되거나(gate → coverage → gate) 구현자가 순환을 피해 두 번째 계산을 넣게 되어, 계획이 금지한 "한 불변식에 소유자가 둘"이 재도입된다(L2 R11 architect) |
| `scripts/test-suite/wiring-cut.js` | CREATE | 축 D 음성 통제 — 절단 셋의 적용·복원: `--apply-red`(소비 경로) · `--apply-delete`(구조) · `--apply`(오라클 왕복) (DD5). 심는 붉은 test 파일은 버리는 브랜치에서만 생겨 이 표에 오르지 않는다 |
| `scripts/test-suite/container-check.js` | CREATE | 컨테이너 전 원소의 3축 확인 — Validation 검사 6의 소비처 (Task 9) |
| `scripts/ci-required-checks.js` | CREATE | required check와 job 이름 drift 진단 (DD6) |
| `scripts/test-suite/run.js` | UPDATE | (a) `--exclude-from`을 `exclusions.js`를 통해 로드해 ticket·상한 검증을 **소비 경로 위에** 올린다 (DD7) · (b) `--allow-codex`에 CI 런타임 가드 — backlog S4 후속 |
| `scripts/tests/test-suite-coverage.test.js` | CREATE | `coverage.js` · `exclusions.js` · `gate.js` 합성 입력 단언 (DD3 판정 순서 포함) |
| `scripts/tests/wiring-cut.test.js` | CREATE | 절단과 복원 왕복, 절단이 실제로 단언을 깨는지, 주석 위양성 짝 단언 |
| `scripts/tests/fixtures/exclusions-no-ticket.json` | CREATE | DD7 재배선 단언용 음성 fixture — 러너가 이것을 거부해야 한다 |
| `scripts/tests/ci-required-checks.test.js` | CREATE | job 이름 파싱과 drift 판정 순수층 |
| `scripts/tests/container-check.test.js` | CREATE | `container-check.js`의 3축 판정 — 이 milestone이 만드는 스크립트 중 유일하게 무-test였다(L2 R4). Acceptance 산출물 1번의 충족/미충족 전환이 그 출력에 걸린다 |
| `scripts/tests/test-suite.test.js` | UPDATE | `--allow-codex` CI 가드 분기 추가 (Task 4) |
| `plugins/mccp/scripts/derive/tests/mask.test.js` | UPDATE | 갈래 P — Linux red 수리 (Task 1a) |
| `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | UPDATE | 갈래 P DD3 — Linux 전용 symlink red 수리 (Task 1b) |
| `plugins/mccp/scripts/lib/tests/dispatch-fullcycle-smoke.test.js` | UPDATE | 갈래 F — node20 전용 red (Task 1c) |
| `plugins/mccp/scripts/lib/tests/leadtime.test.js` | UPDATE | Linux red — main 축 귀속분 (Task 1d) |
| `plugins/mccp/scripts/lib/tests/msw-m8-producers.test.js` | UPDATE | Linux red — main 축 귀속분 (Task 1d) |
| `plugins/mccp/scripts/receipt/tests/receipt-linkage-fields.test.js` | UPDATE | Linux red — main 축 귀속분 (Task 1d) |
| `docs/ci-full-suite/m3-enforcement.md` | CREATE | M3 산출 문서 — 판정과 측정, 그리고 주장하지 않는 것 |
| `docs/ci-full-suite/branch-protection-runbook.md` | CREATE | 축 C 수동 1회 절차와 drift 진단 사용법 (DD6·UI6) |
| `.claude/_meta/data/2026-09-01-suite-baseline.json` | UPDATE | Linux 측정 병합 (Task 9) |
| `.claude/prds/ci-full-suite.prd.md` | UPDATE | milestone 3 status · OQ3와 OQ5 종결 · 지표 갱신 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 미흡수 finding 적재 |
| `CHANGELOG.md` | UPDATE | `## [Unreleased]` 아래 누적 (번호 미선언) |

> `plugins/mccp/.claude-plugin/plugin.json`은 **의도적으로 없다**(UI3, 우산 결정 1).
> `## Validation` 검사 0이 그 부재를 기계로 확인한다.

## Tasks

### Task 0: 현재 Linux red 집합을 실측한다 (선행)

- **Action**: 브랜치를 push하고 `gh workflow run test-suite-baseline.yml --ref ci-full-suite-m2`로(**현재 브랜치 이름**이다 —
  `m3`·`m3a`… 는 게이트 라운드마다 재발행한 decision slug이지 브랜치가 아니다. 앞선 라운드는 그
  slug를 ref로 적어 첫 단계가 실행 불가 인자를 들고 있었다 — L2 R10 architect)
  dispatch한다. 그 파일은 이미 main에 있으므로 dispatch가 성립한다. node 20과 24의 artifact를 받아
  현재 red 집합을 기록한다. M2가 남긴 6건은 **가설**이고 이 실측이 정본이다.
- **Mirror**: `.github/workflows/test-suite-baseline.yml:19-25` — 수용 증거는 run 상태가 아니라 artifact 내용.
- **Validate**: `gh run download --name test-suite-baseline-node20` 산출이
  `ok===true` 이고 `per_file.length===files_total`. red 파일 목록을
  `docs/ci-full-suite/m3-enforcement.md` §1에 기록.

### Task 1: Linux 스위트를 green으로 만든다 (축 C의 선행조건)

- **Action**: Task 0이 낸 red 각각에 대해 **수리 또는 명시 격리**. 판정 기준은 M2가 쓴 것을 그대로
  쓴다 — 단언이 특정 플랫폼에서만 참이면 가드, 코드가 플랫폼을 잘못 다루면 수리. 어느 쪽도
  아니면(원인 미규명) `.github/test-suite-exclusions.json`에 사유와 티켓을 달아 격리(UI7).
  - 1a `mask.test.js` (양쪽 red) · 1b `santa-loop-cap.test.js` DD3 symlink (Linux 전용) ·
    1c `dispatch-fullcycle-smoke.test.js` (node20 전용 — Node 버전 간 갈리므로 flaky 축 의심)
  - 1d `leadtime.test.js` · `msw-m8-producers.test.js` · `receipt-linkage-fields.test.js` —
    M2가 "main 쪽 작업이 마지막으로 건드린 파일"로 귀속한 3건. **소유 축이 다르지만 강제를 막으므로**
    이 milestone이 수리하거나 격리한다. 귀속은 문서에 남긴다.
- **Mirror**: `docs/ci-full-suite/m2-green.md` §2a — 가드와 수리의 판정 기준.
- **Validate**: 각 파일을 `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 <file>`로 단독
  green 확인. 전체 판정은 Task 5 이후 CI가 낸다.

### Task 2: 커버리지 오라클을 만든다 (OQ5 답)

- **Action**: `scripts/test-suite/coverage.js` — 순수 함수
  `computeCoverage({tracked, measurement, exclusions, floor, maxExcludedFiles})`가
  `{denominator, numerator, excluded, unexplained, coverage_pct, ok, reasons}`를 낸다.
  **`fully_skipped`는 없다** — DD2가 철회했다(producer가 없는 필드를 스키마에 올리지 않는다).
  I/O 없는 판정층과 얇은 CLI를 분리한다. **`tracked` 채널의 소유자는 `gate.js`다**(DD2) —
  이 CLI는 로컬 진단용으로 같은 해소를 **재사용**할 뿐이고, fail-closed 넷의 계약은 `gate.js`가
  진다. 한 불변식에 소유자가 둘이면 DD2가 한 라운드를 들여 거부한 모양으로 되돌아간다(L2 R6).
  어느 쪽이든 measurement에서 파생하지는 않는다.
  플래그는 셋이다 — `--json`(산출) ·
  **`--assert-accounted`**(DD2의 3조건에 floor를 더한 **4조건 논리곱** — `unexplained === 0` ∧
  `excluded.length <= max_excluded_files` ∧ `exclusions_digest` 일치 ∧ `tracked >= floor`.
  DD2가 "셋"이라 적는 것은 격리 축 셋을 세는 것이고 floor는 DD9 축이라 별도다 — 앞선 라운드는
  같은 문장에서 "3조건"과 실질 넷을 함께 적어 조건 수가 드리프트했다(L2 R9 architect).
  하나라도 어긋나면 `ok=false`이고 CLI가 **비영점**이다) ·
  `--assert-full`(100퍼센트 미만이면 비영점 — **로컬 진단 전용, 게이트는 부르지 않는다**).
  **`--assert-accounted`도 머지 차단 권한을 갖지 않는다** — 이 CLI는 `computeCoverage`와 floor
  입력 fail-closed를 `gate.js`와 **같은 헬퍼로 공유**하는 두 번째 진입점이지 두 번째 구현이
  아니다(중복 구현은 금지다. 두 구현이 갈라지면 짝 단언이 gate 경로에만 걸려 있어 붉어질 검사가
  없다 — L2 R8 architect). 차단은 CI가 부르는 `gate.js` 단독이고, `## Validation` 검사 2가 이
  CLI를 부르는 것은 로컬에서 수치를 보기 위해서다. **그 공유를 소유하는 모듈은
  `scripts/test-suite/inputs.js`다** — 이름 붙은 모듈이 없으면 두 소비처가 서로를 require해 순환이
  되거나 구현자가 순환을 피해 두 번째 계산을 넣는다(L2 R11 architect). **그 공유를 test가 확인한다** — 같은 합성
  입력에 대해 `coverage.js --assert-accounted --json`과 `gate.js --json`의 커버리지 수치와
  `reasons`가 일치한다. 계약을 산문으로만 두면 구현자가 CLI에 별도 계산을 넣어도 붉어질 검사가
  0건이고, 검사 2가 게이트와 다른 수치를 조용히 보고한다(L2 R10 test).
  **CLI 종료코드는 `ok`를 그대로 반영한다** — `ok=false`인데 exit 0이면 게이트가 그것을 못 보고,
  그 괴리는 분기 (10)이 잡는다. 게이트가 직접 부르는 것은 이 CLI가 아니라 `gate.js`이며(DD3),
  `gate.js`가 이 순수 함수를 2단계에서 호출한다.
- **Mirror**: `scripts/test-suite/enumerate.js:1-12` 순수층 분리, `scripts/test-suite/run.js:265-330` fail-closed 검증.
- **Validate**: `node --test scripts/tests/test-suite-coverage.test.js`. 최소 분기 —
  (1) 완전 일치면 100퍼센트이고 `unexplained=0` ·
  (2) 격리 1건이면 `coverage_pct < 100`이지만 `unexplained=0`이라 **`--assert-accounted`는 통과**하고
  `--assert-full`만 비영점 — 이 분기가 DD2의 "저장소를 인질로 잡지 않는다"를 고정한다 ·
  (3) `per_file`이 `files_total`보다 적으면 그 차이가 `unexplained`로 잡히고 `ok=false` ·
  (4) **`{pattern:"**/*.test.js"}` 단일 항목이면 `ok=false`** — 항목 수 1건 · `ticket` 충족 ·
  `unexplained=0`을 전부 만족하는데도 `excluded.length > max_excluded_files`가 잡는다.
  이 분기가 DD2가 열거한 "게이트가 한 줄로 완전히 열리는" 경로의 음성 통제다 ·
  (5) tracked에 있는데 열거에도 격리에도 없는 파일이면 `unexplained`에 들어가고 `ok=false`.
  이 분기가 오라클 자신의 은닉 누락 방어다 ·
  (6) **`tracked < floor`면 `ok=false`** — 분모 축소(말 없는 test 삭제) 차단 (DD9) ·
  (7) **면제 한도 안의 삭제는 floor에 걸리지 않는다** — `tracked`를 `floor + max_allowed_deletions`까지
  낮춘 합성 입력이 `below_floor`를 내지 **않는다**(합성 입력이므로 실제 트리를 읽지 않는다). 앞선 라운드는 여기에 "floor를 같은 호출에서
  내리면 통과"라 적어, 정당한 삭제의 출구가 이 계획이 금지한 floor 하향임을 오히려 단언하고
  있었다(L2 R14 architect). 출구는 `allow_deletions`이고, 이 분기는 그 출구가 형제 조건에
  막히지 않음을 잰다 ·
  (8) **`--assert-accounted`인데 floor 입력이 없으면 비영점** — 래칫 인자 누락이 조용한 통과가
  되지 않음 (DD9 1번). `--assert-full`은 같은 조건에서 통과해야 한다(로컬 진단이므로) ·
  (9) **measurement의 `exclusions_digest`가 로드한 목록의 재계산값과 다르면 `ok=false`** —
  격리 없이 돈 측정과 큰 격리 목록의 짝짓기 차단 (DD2 앵커링) ·
  (10) **`ok=false`인 모든 분기에서 CLI가 비영점** — 순수층의 판정이 종료코드에 도달함을 단언한다.
  (4)·(9)가 `ok===false`만 보면 R2가 흡수한 두 조건이 CLI에 도달하지 않아도 green이다 ·
  (11) **산출 객체에 `fully_skipped` 키가 없다** — DD2의 철회가 모듈 계약에 실제로 도달했는지를
  재는 짝 단언. 철회를 산문에만 적으면 Task를 읽는 구현자가 그 필드를 만들고 아무 test도 붉어지지
  않는다(L2 R3가 실측한 drift) ·
  (12) **분모 채널 짝 단언** — `tracked`가 격리 목록보다 크고 `measurement.files_total`과 다른
  합성 입력에서, `denominator === tracked.length`이고 `!== files_total`이다. 이것이 DD2가 금지한
  "measurement에서 분모 파생"을 반증 가능하게 만든다. 추가로 `tracked`가 빈 배열이면 `ok=false` —
  분모 0은 100퍼센트가 아니라 측정 실패다 ·
  (13) **`per_file`이 `null`(실제 producer 모양)이거나 `[]`(방어적)이고 `tracked`가 비어있지
  않으면 `ok=false`** — 부재는 "적음"이 아니다. `null`이 정본인 이유는 `ok:false`일 때 러너가
  그것을 방출하기 때문이고(`scripts/test-suite/run.js:213-214`, 주석이 명시), `[]`는 방어적
  분기다. R5가 이 우선순위를 거꾸로 적었고 R6이 정정했다.

### Task 2b: DD3의 판정 순서를 모듈로 만든다 (게이트가 red를 통과시키지 않게)

- **Action**: `scripts/test-suite/gate.js` — 순수 함수 `judge({measurement, coverage, deletions})`가
  DD3의 **4축(0~3)** 을 순서대로 평가해 `{blocked, stage, reasons, message, coverage}`를 낸다.
  **`deletions`가 인자인 것이 이 서명의 핵심이다** — `{base_resolved, missing, allowed}`로,
  `inputs.js`가 git(`git ls-tree -r <base>` 대 `git ls-files`)으로 해소해 넘긴다. 이것을 인자로
  받지 않으면 삭제 판정이 `judge` **밖**에 남고, 최종 `blocked`/`stage`/`reasons`를 CLI가 사후에
  합성하게 되어 "`gate.js`가 DD3 판정 순서의 유일한 소비처"라는 계약이 깨진다. 그러면 바로 아래의
  누적 규칙에 **소유자도 단언도 없어지고**, 구현자에게 자연스러운 단락(커버리지가 이미 막았으면
  삭제 축을 평가하지 않음)으로 조용히 접힌다(L2 R16 architect). `coverage`와 완전히 같은 형태다 —
  불순한 계산은 밖에서 하고 **판정만** 안에서 한다.
  `coverage`는 2단계에서 부른 `computeCoverage`의 산출 그대로다(`coverage_pct` · `denominator` ·
  `numerator` · `excluded` · `unexplained` · `tracked`). **이 필드가 없으면 Acceptance 2와 3-B가
  요구하는 CI 증거에 producer가 존재하지 않는다**(L2 R11 test) — 커버리지 수치를 내는 다른 표면
  (`coverage.js` CLI)은 이 계획이 명시적으로 로컬 전용으로 못박았고, 강제 workflow가 부르는 판정
  명령은 `gate.js` 하나이기 때문이다. 즉 Success Metric 4를 닫는 절단 B의 수용 등식을 산출할 주체가
  CI에 없었다. 판정 단계는 `--json`으로 이 출력을 `gate.json`에 쓰고 artifact로 올린다.
  **그 출력의 `message`는 방출 직전 `scripts/test-suite/redact.js`를 통과한다.** DD4는 "업로드되는
  artifact 내용은 redact를 이미 통과한 산출"이라고 적는데, 이 milestone이 새로 올리는 `gate.json`은
  `gate.js`가 조립하는 것이라 그 계약 밖에 있었다 — fail-closed 아홉의 진단 문자열은 git stderr나
  파일 경로를 담고 `if: always()`라 조건 없이 발행되므로, 미검열 절대경로가 매 PR 공개 artifact에
  실린다(L2 R19 security가 LOW로, R20 security가 MEDIUM으로 두 번 지목). 계약을 넓히는 대신 새
  산출물을 계약 안으로 들인다.
  **`stage`는 판별자가 아니다** — 2단계 하나에 커버리지 실패와 삭제 래칫이 함께 들어가므로,
  `stage=2`만 보고 "삭제 래칫이 막았다"고 말하면 래칫이 죽어 있어도 다른 커버리지 실패가 같은
  값을 낸다(L2 R9 — architect·test 독립 지목. 축 A에서 이미 흡수한 "비영점만 보면 구분 안 된다"의
  삭제 축 재현이다). 그래서 `reasons`는 **닫힌 코드 열거**다 —
  `suite_red` · `unexplained` · `excluded_over_cap` · `digest_mismatch` · `below_floor` ·
  `deleted_without_allowance` · `redaction` · `measurement_invalid` · `measurement_tree_mismatch` ·
  fail-closed **아홉 범주**의 입력 코드. 축 D의 수용 증거와 `## Validation` 4b는 stage가 아니라 **이 코드**를
  단언한다.

  **그 아홉 범주의 코드도 여기서 이름으로 못박는다 — 열한 개다**: `git_failed` · `tracked_empty` ·
  `measurement_unreadable` · `floor_unreadable` · `floor_key_missing` · `exclusions_unreadable` ·
  `exclusions_invalid` · `base_unresolved` · `base_set_empty` · `floor_entry_shape` ·
  `duplicate_flag`(범주가 아홉인데 코드가 열하나인 것은 두 범주가 원인이 다른 하위 분기를 갖기
  때문이다 — floor는 판독 불가와 키 부재가, 격리는 판독 불가와 검증 실패가 서로 다른 사실이다).
  앞 라운드까지 이 자리에는 둘만 이름이 있었고 나머지는 산문 서술뿐이었다 — **열거되지 않은
  집합은 닫힌 집합이 아니고**, 분기 (j)가 요구하는 "그 입력 코드가 실린다" 단언은 구현자가
  즉석에서 지은 문자열을 상대로 쓰이므로 drift 앵커가 성립하지 않았다(L2 R22 architect).

  **단계 사이는 단락하고, 한 단계 안에서는 누적한다.** 단계 순서(0→1→2→3)는 앞 단계에서 막히면
  뒤를 평가하지 않지만(분기 (b)가 그 단락을 단언한다), **2단계 안의 네 축은 전부 평가해
  `reasons`에 모은다**. 앞선 라운드는 이것을 명시하지 않았고 그 공백이 축 D 절단 B를 반증 불가로
  만들 수 있었다(L2 R10 test) — floor가 "이 시점 tracked 개수"라 파일 1개를 지우면 `below_floor`와
  `deleted_without_allowance`가 **동시에** 성립하는데, 단락 구현이면 앞의 것만 실려 (e4)의 단언이
  래칫이 살아 있어도 거짓 red가 된다. 누적이면 `includes`로 단언하는 (e4)·4b가 겹침에 무감하다.
  **그 누적을 재는 분기가 실제로 있어야 한다** — 계획의 기존 분기는 전부 커버리지가 통과하는
  구성이고((k)의 다섯) 4b는 합성 green measurement를 쓰며 (e4)는 `unexplained === 0`을 전제하므로,
  커버리지 실패와 삭제가 **겹치는** 경우를 재는 것이 하나도 없었다(L2 R16 architect). 그래서
  **(n)**: `unexplained`가 비지 않으면서 동시에 `missing`에 미면제 경로가 있는 합성 입력에 대해
  `reasons`가 **`unexplained`와 `deleted_without_allowance`를 둘 다** 담는다. 단락 구현이면 이
  분기가 red다. **(o)**: `blocked=true`인 분기에서도 CLI가 `--json` 산출을 **stdout에 실제로
  기록한다**(파싱 가능한 JSON이고 `reasons`가 실려 있다). 이것을 재지 않으면, 진단을 stderr로 내고
  비영점으로 죽는 구현이 (m)의 종료코드 단언까지 만족하면서 4b를 파손 JSON으로 hard-fail시키고 CI
  red run의 `gate.json`을 **빈 파일**로 만든다 — 축 D 증거 전체가 그 미명시 동작에 매달려 있었다
  (L2 R17 invariant. "증거 요건에 CI producer가 없다"의 다섯 번째 형태다). 얇은 CLI가
  `--measurement` · `--exclude-from` · `--floor-from` · `--base-ref`(PR 축 전용)를 받고, **`tracked`는 스스로
  `git ls-files '*.test.js'`로 해소해**(DD2 — 이 채널의 소유자는 게이트가 부르는 이 모듈이다)
  `computeCoverage`를 2단계에서 호출하고, `blocked`이면 비영점으로 죽는다.
  **fail-closed 아홉이 여기 걸린다** — git 호출 실패 · 빈 tracked 목록 ·
  `--measurement` 부재/판독 불가 · `--floor-from` 부재/판독 불가/**키 부재**
  (`tracked_basis`·`tracked`·`max_excluded_files`·`max_allowed_deletions`·`allow_deletions` 중
  하나라도 없으면 차단 — 방어적 기본값
  `?? 0`·`?? Infinity`·`?? 0`·`?? Infinity`·`?? []`를 쓰면 게이트 조건이 조용히 항상 참이 되고 그것을 붉게 만들 단언이
  0건이었다. 형제 둘은 "부재/판독 불가"인데 이 축만 "부재"였다 — L2 R13 security) ·
  **`--exclude-from` 부재/판독 불가/검증 실패**(`inputs.js`의 격리 로더는 **자체 파싱을 갖지 않고**
  `exclusions.js`에 위임한다 — 그래야 `ticket` 필수와 `MAX_EXCLUSION_ENTRIES`가 게이트 경로에서도
  강제된다. 앞 라운드는 `## Files to Change`가 두 모듈을 **둘 다** "격리 목록 로드" 소유자로 적고
  이 열거는 "부재/판독 불가"만 담아, **강제 workflow가 부르는 유일한 판정 명령**이 검증되지 않은
  목록으로 판정할 수 있었다 — `inputs.js`의 존재 이유("한 불변식에 소유자가 둘이면 안 된다")를 그
  모듈이 스스로 어긴 형태다: L2 R20 architect. 위임이므로 `exclusions.js`의 throw가 그대로 이
  fail-closed가 된다) ·
  `--base-ref`가 주어졌는데 merge base를 해소하지 못함 ·
  **`--base-ref`가 해소는 됐는데 `base_set`이 빈 집합**(`base_set_empty` — head 쪽 "빈 tracked
  목록"의 대칭이다. 없으면 얕은 클론이나 트리 없는 ref에서 래칫이 무조건 통과한다: L2 R17 invariant). `--exclude-from`은 DD7의 통제
  ("게이트가 **그 경로만** 읽는다")와 DD2의 두 조건(`max_excluded_files` · digest 일치)이 전부
  매달린 입력이고, `--measurement`는 **판정의 1차 입력인데 형제 셋만 열거돼 있었다**(L2 R7
  invariant — 파일 부재·부분 기록·JSON 파손의 방향이 미정의였다). **여덟째는 floor 원소 shape다** —
  `allow_deletions`의 각 항목이 `{path, reason, ticket}` 객체이고 셋 다 비어 있지 않은 문자열이어야
  하며, 하나라도 어긋나면 차단한다. 앞 라운드는 "`ticket` 필수"를 산문으로만 적었고 검증 소유자를
  지정하지 않았다 — `exclusions.js`는 격리 파일만 보고 floor의 fail-closed는 **키 존재**만 봤으므로
  `{path}`만 있는 항목도 삭제를 면제했고, DD9가 주장한 "격리와 같은 통제"가 관례로만 존재했다
  (L2 R18 invariant). 소유자는 `inputs.js`의 floor 로더다.
  **아홉째는 중복 플래그다** — 같은 플래그가 두 번 이상 나타나면 `duplicate_flag`로 차단한다.
  형제 파서(`scripts/test-suite/run.js:613-631` `parseArgv`)는 `flags[a.slice(2)] = next`로
  **덮어쓰고**(중복 거부 분기 0건) `## Files to Change`와 Mirror가 그 관례를 미러하라고 지시하므로
  last-wins가 자연스러운 구현이다. 그러면 판정 줄의 **리터럴 pin이 통째로 무력**해진다 —
  `--floor-from .github/test-suite-floor.json --floor-from bogus.json`이나 `--base-ref`를
  `HEAD`로 재지정하는 한 토막을 뒤에 붙이면 리터럴 쌍은 그대로 남아 단언 1이 green인데 파서는
  뒤의 값을 쓴다. 후자는 `base_set = head_set`을 만들어 DD9 삭제 래칫을 **항상 참으로 접는다** —
  이 계획이 R10에서 값 치환에 대해 닫았다고 적은 경로가 형태만 바꿔 남아 있었다(L2 R22
  invariant). 오라클 축의 대응(토큰 유일성)은 단언 1이 지고, 이 fail-closed는 그 오라클이
  놓치는 경로(workflow 밖의 호출자)까지 덮는 두 번째 자물쇠다. 아홉 다 "판정할 자격이 없다"이지
  "통과"가 아니다. 이것이 **강제 workflow가 부르는 유일한 판정 명령**이다.
  러너는 손대지 않는다 — `run.js`의 "측정 도구는 스위트의 red로 죽지 않는다" 계약은 M1·M2의
  측정 축이 서 있는 바닥이고, 그것을 깨는 대신 판정을 여기로 옮기는 것이 DD3이다.
- **Mirror**: `scripts/test-suite/enumerate.js:1-12` 순수층 분리 ·
  `scripts/test-suite/run.js:265-330` `validateElement`의 fail-closed 검증.
- **Validate**: `node --test scripts/tests/test-suite-coverage.test.js`의 gate 분기 —
  (a) `exit_code !== 0`이면 `stage=1`에서 차단하고 메시지가 실패 파일 목록과 **"아래 유출 판정은
  이 red의 하류일 수 있다"** 를 함께 담는다 ·
  (b) `exit_code !== 0` ∧ `redaction_ok === false`여도 `stage`는 여전히 1이다 — 순서가 뒤집히면
  이 분기가 red가 된다. 이것이 DD3을 산문에서 반증 가능한 명제로 바꾸는 단언이다 ·
  (c) green ∧ 커버리지 `ok=false`면 `stage=2` ·
  (d) green ∧ 커버리지 통과 ∧ `redaction_ok === false`면 `stage=3`에서 **차단**하고 메시지에
  하류 가능성 문구가 **없다**(1을 통과했으므로 구조적으로 배제된다) ·
  (e) 셋 다 통과하면 `blocked=false`이고 CLI exit 0 ·
  (f) `measurement`에 `ok`·`exit_code`·`redaction_ok` 키 중 하나라도 **없으면** 차단한다 —
  부재는 통과가 아니다 ·
  (g) **`ok:false ∧ exit_code:0 ∧ redaction_ok:true`면 `stage=0`에서 차단** — 러너가 chunk spawn에
  실패했을 때 접혀 나오는 조합이다. 0단계가 없으면 **한 번도 돌지 않은 스위트**가 1·3단계를 통과한다 ·
  (g2) **`measured − tracked ≠ ∅`(측정에 있는데 tracked에 없다)이면 `stage=0`, 코드 `measurement_tree_mismatch`** — 측정에는
  있는데 지금 트리에는 없는 파일은 그 measurement가 **이 트리의 것이 아니라는** 뜻이다. 앞선
  라운드는 이 방향을 어디에도 정의하지 않았고(L2 R9 architect), 그래서 삭제 실험이 커버리지 축으로
  죽는지 래칫으로 죽는지 알 수 없었다. "부재는 통과가 아니다"와 같은 축이며, 이 정의가 있어야
  `## Validation` 4b가 measurement를 트리에 맞춰 좁히는 것이 **요구사항**이 된다 ·
  (h) `stage=0` 메시지는 "측정이 성립하지 않았다"를 말하고 스위트 red를 주장하지 **않는다** —
  둘은 다른 사실이고, 합치면 실패 원인을 잘못 가리킨다 ·
  (i) **분모 채널 짝 단언(gate 경로)** — `gate.js`가 해소한 `tracked`가 `measurement.files_total`과
  다른 상황에서 2단계가 `tracked` 기준으로 판정한다. 이 단언이 `coverage.js` 순수층이 아니라
  **gate 경로**에 걸려야 하는 이유는 CI가 부르는 것이 gate이기 때문이다(L2 R5) ·
  (j) **fail-closed 아홉** — git 호출 실패 · 빈 tracked 목록 · `--measurement` 부재/판독 불가 ·
  `--floor-from` 부재/판독 불가 · **`--floor-from`의 다섯 키 각각의 부재**(한 덩어리가 아니라
  `tracked_basis`·`tracked`·`max_excluded_files`·`max_allowed_deletions`·`allow_deletions`
  **다섯 분기**다 — 한 덩어리로 두면 넷만 검사하고 하나에 `?? Infinity`를 남긴 구현이 통과한다:
  L2 R18 test) · `--exclude-from` 부재/판독 불가 · `--base-ref` 해소 실패 ·
  **`--base-ref`는 해소됐는데 `base_set`이 빈 집합**(`base_set_empty`) ·
  **`allow_deletions` 원소 shape 위반**(`{path}`만 있는 항목 · `ticket`이 빈 문자열) ·
  **격리된 파일을 삭제할 때는 `max_excluded_files`도 같은 diff에서 내린다**(L2 R23 test) —
  그 상수는 격리 목록의 **실제 확장 파일 수와 등가**로 고정돼 있고 그 등가 단언은 판정보다
  **앞선** 자기 test 단계에서 돌므로, 정당하게 등록된 삭제라도 대상이 격리 대상이면 자기 test가
  **무관한 이유로** red가 되어 `gate.json`이 아예 생산되지 않는다. UI7 아래에서 가장 지워질
  법한 부류가 격리된 test라 이 결합은 이론이 아니다. DD9의 인가된 삭제 경로는 그래서 넷이다 —
  `allow_deletions` 등록 · floor 재도출 · (정리 시) `tracked_basis` 재기준 · **(격리 대상이면)
  `max_excluded_files` 하향과 빈 패턴 항목 제거**. Task 7 (e5) 규칙 2가 이 충돌을 *회피*하는
  것은 축 D 실험의 producer를 살리기 위한 것이지 결합을 덮는 것이 아니다.
  **중복 플래그**(`--floor-from`을 두 번 준 argv · `--base-ref`를 두 번 준 argv 각각에서
  `duplicate_flag`로 차단 — last-wins 파서로 구현하면 이 분기가 red다)
  각각에서 비영점이고 **`--json` 산출의 `reasons`에 그 입력 코드가 실린다**. 코드까지 재는 이유는
  이 계획이 축 A·삭제 축·(m)에서 세 번 흡수한 "비영점만 보면 구분 안 된다"와 같다 — 이름 없이
  죽는 구현이 전 검사를 통과하면 CI의 `gate.json`이 그 사유를 담지 않아, `reasons`를 "닫힌 코드
  열거"라 선언한 것이 그 아홉에 대해서만 거짓이 된다(L2 R20 architect). 분기 (o)는 `judge`의
  `blocked` 경로를 재므로 이 입력 검증 경로를 덮지 않는다.
  **그 아홉의 레코드를 조립하는 소유자도 여기서 못박는다** — `gate.js`의 CLI 층이 단독으로 조립하며
  `{blocked:true, stage:0, reasons:[<코드>], message, coverage:null}` 형태를 낸다. R16이 삭제 축에
  대해 "최종 `blocked`/`stage`/`reasons`를 CLI가 사후 합성하면 계약이 깨진다"고 닫았는데, 이 아홉은
  `judge` **호출 전에** 발생하므로 정의상 judge 밖에서 조립된다 — 그 예외를 명시하지 않으면 어느
  모듈이 그 레코드를 만드는지가 미정이고 R16의 규칙과 표면상 충돌한다(L2 R21 architect). 규칙의
  실제 내용은 "판정을 CLI로 흘리지 마라"이지 "CLI가 아무것도 조립하지 마라"가 아니다: 여기서 CLI가
  조립하는 것은 **판정할 자격이 없다**는 사실이고, 그것은 judge의 입력을 만들 수 없다는 뜻이므로
  judge에 넘길 것 자체가 없다. `stage:0` 고정과 `coverage:null`이 그 구분을 형태로 남긴다.
  뒤의 셋이 R18에서 추가됐다 — 앞 라운드는 Action에 일곱째를 더해 놓고 이 분기에는 여섯만
  열거해, **새 가드가 빠진 구현이 전 검사를 통과**했다(L2 R18 — architect·test 독립 지목.
  이 계획이 반복해서 지목한 "기계는 만들어지고 부르는 한 줄이 빠진다"의 자기 재현이다).
  아홉 다 "판정할 자격이 없다"이지 "통과"가 아니다 ·
  (m) **`blocked`가 종료코드에 도달한다** — `judge`가 `blocked=true`를 낸 **모든** 분기
  (stage 0·1·2·3 각각)에서 CLI가 비영점으로 끝난다. `coverage.js`에는 대칭 단언이 있는데
  (Task 2 (10) "`ok=false`인 모든 분기에서 CLI가 비영점 — 순수층의 판정이 종료코드에 도달함을
  단언한다") `gate.js`에는 없었다(L2 R13 test). 특히 3단계는 로컬 `## Validation`이 note로
  허용하고 라이브 완주도 stage 1만 덮으므로, 이 분기가 없으면 **`judge`가 막았는데 CLI가 exit 0으로
  끝나는 구현**이 전 검사를 green으로 통과한다 — 이 milestone이 닫겠다고 선언한 과대허용 방향 그
  자체다 ·
  (l) **`--json`이 커버리지를 싣는다** — `coverage` 객체에 `coverage_pct`·`denominator`·
  `numerator`·`excluded`·`unexplained`·`tracked`가 있고 2단계가 부른 `computeCoverage` 산출과
  일치한다. 이 분기가 없으면 Acceptance 2·3-B의 CI producer 존재가 라이브 완주 전까지 반증
  불가다(L2 R12 test) ·
  (k) **삭제 래칫(DD9)** — `--base-ref`가 주어지면 `missing = base_set − head_set`을 구해 비어
  있지 않으면 `stage=2` + 코드 `deleted_without_allowance`로 차단하고, `missing ⊆ allow_deletions`면
  통과한다. **단언은 stage가 아니라 코드에 건다** — 2단계는 커버리지 실패와 공유하는 칸이라 stage만
  보면 래칫이 죽어도 같은 값이 나온다(L2 R9). 분기 다섯을
  단언한다: 삭제만 → 차단 · **삭제 1건 + 추가 1건 → 여전히 차단**(개수 비교였다면 통과했을
  구성이다. L2 R8 invariant가 찾은 구멍이고, 이 분기가 그 부등식으로의 회귀를 붉게 만든다) ·
  `missing`이 `allow_deletions`에 전부 들면 통과 · `allow_deletions`에 `missing` 밖 경로가 아무리
  많아도 `missing`의 한 원소가 빠지면 차단 · `--base-ref` 부재면 정적 floor로만 판정하고 출력에
  `base=absent`가 실린다.
  **여섯째 분기 — glob은 면제가 아니다**: `allow_deletions`에 `{path:"**/*.test.js", reason, ticket}`
  **단일 항목**만 있고 `missing`이 비지 않으면 게이트가 **여전히 차단**한다. 이 계획은 그 단일
  항목이 래칫을 통째로 죽인다는 것을 산문으로 적어 놓고 **음성 통제를 더하지 않았다** — 같은
  CRITICAL이 격리 축에서는 분기 (4)라는 기계를 갖는데 삭제 축에서는 산문뿐이었다
  (L2 R18 invariant). glob으로 구현하면 이 분기가 red다.

  **(i)·(j)·(k)의 seam을 여기서 못박는다.** `judge({measurement, coverage, deletions})`는
  순수하지만 이 세 분기가 재는 것은 **git 해소 자체**(`deletions`를 만드는 일)와 인자 검증이라
  순수층 밖이다. 그래서 이 분기들은
  `child_process.spawnSync`로 **CLI를 실제로 띄워** 종료코드와 stdout을 단언한다 — 순수층만
  단언하면 R5가 네 번째로 재현했다고 적은 바로 그 실패 모드("기계는 만들어지고 부르는 한 줄이
  빠진다")가 test 밖에 남는다(L2 R7 test).

### Task 3: 격리 목록을 tracked 파일 하나로 고정한다 (DD7)

- **Action**: `.github/test-suite-exclusions.json`을 `{pattern, reason, ticket}` 배열로 만든다.
  **최상위가 배열이지 `{exclusions: [...]}` 래핑이 아니다** — 소비 경로
  (`scripts/test-suite/enumerate.js:55-59` `normalizeExclusions`)가 `Array.isArray`가 아니면
  TypeError를 던지므로, 래핑을 받아들이는 보조 코드는 그 자리에서만 통과하고 게이트에서
  죽는다(L2 R22 architect).
  `scripts/test-suite/enumerate.js`의 `{pattern, reason}` 스키마를 확장하며 새 스키마를 발명하지 않는다.
  `scripts/test-suite/exclusions.js`가 로드와 검증을 하며 `ticket` 누락과 항목 수 상한 초과를
  **throw**한다. 상한 상수는 초기 항목 수와 같게 두어 증가에 별도 편집이 필요하게 한다.
  **그리고 `scripts/test-suite/run.js`를 재배선한다** — `--exclude-from`이 `readJsonFile` 대신
  `exclusions.js`를 거치게 해서, 스위트를 실제로 도는 경로가 그 검증을 통과해야만 격리가 적용된다.
  재배선 없이는 상한과 `ticket`이 사람이 부르는 한 줄에만 존재한다(DD7).
  같은 형태로 `.github/test-suite-floor.json`을 만든다 — 래칫 상수 **다섯**을 담는다:
  `tracked_basis`(**floor를 도출한 기준 개수** — 작성 시점의 tracked `*.test.js` 개수를 그대로
  적는다. **유지 규칙은 DD9가 소유한다**: `allow_deletions` 정리와 같은 diff에서만, 그때의 실제
  개수로 다시 적는다. 그 규칙이 없으면 두 번째 정상 삭제 사이클 뒤에 저장소가 영구 `below_floor`가
  된다(L2 R17 — architect·invariant 독립 지목). 이 키가 없으면 아래 도출식이 기계로 확인될 수 없고 R9가 `max_excluded_files`에 대해 닫은
  "아무 숫자나 적으면 backstop이 조용히 공허해진다"가 이 축에 남는다) ·
  `tracked`(분모 절대 하한, DD9 — 값은 **`tracked_basis` − (`max_allowed_deletions` + 1)**
  이다. **현재 개수와 같게 두면 안 된다.** 그러면 여백이 0이라 `allow_deletions`에 정식 등재된 삭제
  1건도 같은 2단계 논리곱의 `tracked >= floor`에 걸려 `below_floor`로 막히고, 아래에서 못박은
  "정당한 삭제의 출구는 floor 하향이 아니다"가 거짓이 된다 — 실제 출구는 이 계획이 금지한 floor
  하향뿐이 된다. **면제 항목을 실제로 추가할 때 floor를 1 내리는 편집은 그 금지의 대상이 아니다** —
  `max_allowed_deletions`가 1 오르면 도출식이 floor를 1 내리도록 **강제**하므로 두 편집은 한 diff의
  한 동작이고, 여백은 변하지 않는다. 금지되는 것은 **미등재** 삭제를 통과시키려 floor만 내리는
  것이고, 그것은 base 집합 차가 별도로 막는다. 이 구분을 적지 않으면 DD9만 읽은 리뷰어가 요구되는
  재도출을 계약 위반으로 읽는다(L2 R16 architect).
  게다가 floor를 현재 개수와 같게 두면 판정자 자기 test 단계가 절단 B의 트리에서 **판정보다 먼저**
  red가 되어 축 D의 producer 자체가 사라진다(Task 5의 "자기 test는 트리를 재지 않는다" 참조).
  L2 R14 architect가 두 결함을 독립 지목했다.
  **그리고 이 도출식을 확인하는 단언은 트리를 읽어서는 안 된다** — R14가 그것을 라이브 여백
  부등식(`현재 tracked − floor >= max_allowed_deletions + 1`)으로 적었는데 **산술적으로 자기
  목적을 부정했다**: 파일 1개가 사라진 트리에서 좌변이 `D`, 우변이 `D+1`이라 **항상 거짓**이고,
  그래서 그 단언은 절단 B와 정상 삭제 양쪽에서 red가 되어 살리려던 두 경로를 도로 죽였다
  (L2 R15 architect). 트리를 재는 어떤 여백 단언도 같은 운명이다 — 한 방향이면 삭제에서, 반대
  방향이면 추가에서 붉어진다. 그래서 확인은 **순수 JSON 산술**로 한다) · `max_excluded_files`(격리 목록이 실제로
  덮는 파일 수, DD2·DD7) · `max_allowed_deletions`(**삭제 면제 항목 수 상한** — `allow_deletions`의
  길이와 등가로 pin되는 **독립 스칼라**다. 이 키가 없으면 아래 Validate의 "항목 수 상한이 등가"
  단언이 `allow_deletions.length === allow_deletions.length`가 되어 동어반복이고, 배선을 끊는 PR이
  상수 편집(=diff 가시성) 없이 경로를 append하는 것만으로 `missing ⊆ allow_deletions`를 만들어 삭제
  래칫을 통과한다 — DD9가 존재 이유로 든 바로 그 실패 모드이고, `max_excluded_files`가 격리 축에서
  독립 2항인 것과 같은 형태다. L2 R14 invariant) ·
  `allow_deletions`(base 대조 래칫의 명시 면제 항목 — **격리와 같은 3중 통제**를 받는다:
  `{path, reason, ticket}` 객체이고 `ticket` 필수이며 항목 수가 `max_allowed_deletions`와 등가로 pin된다.
  **`path`는 repo-relative 리터럴 경로이고 glob이 아니다 — 정확 일치만 면제한다.** 이것이
  없으면 형제 필드 `pattern`의 선례를 따라 glob으로 구현될 수 있고, 그때
  `{path:"**/*.test.js", reason, ticket}` **단일 항목**이 모든 삭제를 면제해 DD9 래칫이 통째로
  죽는다 — 그 상태에서도 이 계획의 단언은 전부 green이다(항목 수 등가 1==1 · ticket 만족 ·
  (k)의 다섯 분기도 glob 의미론에서 그대로 성립). 즉 DD2가 격리 축에서 CRITICAL로 닫았다고 적은
  "한 줄 glob이 게이트를 연다"가 삭제 축에 그대로 되열려 있었다(L2 R13 security).
  리터럴이므로 **항목 수 = 면제 파일 수**이고, DD7이 격리 축에서 "셋째가 없으면 앞의 둘은 아무것도
  막지 못한다"고 한 이유(줄 수와 파일 수의 괴리)가 여기서는 구조적으로 발생하지 않는다 — 그래서
  통제가 셋이 아니라 **둘로 충분하다**. 앞선 라운드가 "3중 통제"라 적고 둘만 열거한 것은 격리 축의
  문장을 그대로 옮긴 탓이다. 경로 문자열 배열이 아닌
  이유는 비대칭에 근거가 없기 때문이다 — L2 R11 security: 격리는 `ticket`과 등가 상한까지 요구하는데
  삭제 면제가 문자열 하나로 끝나면, 배선을 끊는 PR이 그 배선을 단언하는 test를 지우면서 같은 diff에
  경로를 append하는 것만으로 `missing ⊆ allow_deletions`가 되어 게이트가 green이다 — DD9가 존재
  이유로 든 바로 그 실패 모드다. DD9).
  `max_excluded_files`를 exclusions 파일이 아니라 여기 두는 이유는 그것이 **게이트가 재는 상한**이고
  검증기가 재는 값이 아니기 때문이다 — 확장 결과는 tracked 집합을 알아야 계산된다.
- **Mirror**: `scripts/test-suite/enumerate.js:49-76` — 사유 없는 항목은 걸러지지 않고 throw.
- **Validate**: `node --test scripts/tests/test-suite-coverage.test.js`의 exclusions 분기 —
  `ticket` 부재 throw · 항목 수 상한 초과 throw · **항목 수 상한 상수는
  `exclusions.js`가 `MAX_EXCLUSION_ENTRIES`로 export하고**(floor 파일의 다섯 상수에는 자리가 없다 —
  그쪽은 게이트가 재는 값이고 이것은 검증기가 재는 값이다. 이름이 없으면 "상한 상수와 일치"라는
  단언에 검사 대상이 없다: L2 R17 test) 그 값과 격리 파일의 실제 항목 수가 **등가**임을 단언 ·
  **CLI 종료코드 단언**: 모듈이 throw하는 모든 입력에 대해 `exclusions.js --check`가 **비영점**이다.
  형제 둘은 이 축을 각각 라운드를 들여 명시 분기로 닫았는데(coverage (10) · gate (m)) 이쪽만 모듈
  throw만 단언하고 있었고, 오라클은 그 단계의 *존재*만 본다 — throw를 삼키고 exit 0으로 끝나는
  CLI가 전 검사를 통과하면 workflow의 격리 검증 단계가 장식이 된다(L2 R15 test) ·
  **래칫 상수 단언**: `max_excluded_files`는 격리 목록의 실제 확장 파일 수와 **정확히 같다**(등가).
  `max_allowed_deletions`는 `allow_deletions`의 실제 항목 수와 **등가**다 — 한 방향으로 두면 R9가
  `max_excluded_files`에 대해 닫은 "헤드룸으로 게이트가 되열린다"가 이 축에 남는다(L2 R12 invariant).
  **좌변이 독립 키인 것이 이 단언의 전부다** — 상한이 배열 자신 말고 담길 자리가 없으면 이 줄은
  `length === length`이고, 그때 append는 아무것도 붉게 만들지 않는다(L2 R14 invariant) ·
  **도출 단언(순수 JSON, 트리 미판독)**: `tracked === tracked_basis − (max_allowed_deletions + 1)`.
  네 값이 전부 같은 파일 안에 있으므로 이 등식은 `git ls-files`를 부르지 않는다 — 그래서 절단 B든
  정상 삭제든 **어떤 트리 변형에도 불변**이고, 판정보다 앞선 자기 test 단계에 있어도 producer를
  죽이지 않는다. 그러면서도 동어반복이 아니다: floor를 현재 개수와 같게 두는 것(그때
  `tracked_basis`도 같이 올려야 하는데 그 편집이 diff에 숫자로 남는다)도, R9가 닫은 것처럼 아무
  숫자나 적는 것도 여기서 붉어진다. 이 등식이 보장하는 것: 면제 목록이 인정할 수 있는 **모든**
  삭제(최대 `max_allowed_deletions`건)가 floor 위에 남아 `allow_deletions`가 실재하는 출구가 되고,
  절단 B의 1건도 그 안에 든다.

  **기계로 확인되지 않는 것을 여기 적는다**: `tracked_basis`가 실제 작성 시점 개수인지는 이 등식이
  묻지 않는다. 그 값을 낮춰 적으면 floor가 낮아져 backstop이 약해지고 어떤 단언도 붉어지지 않는다.
  막는 것은 리뷰다 — floor 파일은 tracked이고 그 숫자를 바꾸는 것은 diff에 보이는 편집이다
  (DD7이 `max_excluded_files`에 대해 든 것과 같은 근거이며, 같은 한계다). 값을 **높여** 적으면
  floor가 실제 개수 위로 올라가 전 PR이 `below_floor`로 붉어지므로 **시끄럽게** 실패한다.
  그리고 이 축은 DD9가 이미 backstop이라 부른 것이지 정본이 아니다 — 말 없는 삭제를 실제로 막는
  것은 base 집합 차이고, 그쪽에는 여백이 없다.

  **두 축의 방향이 다른 이유가 R9에서 뒤집혔다.** R6은 둘 다 한 방향으로 두면서 "등가로 걸면 무관한
  PR이 붉어진다"고 적었는데, `max_excluded_files` 쪽에서 그 논증은 **틀렸다**(L2 R9 invariant):
  한 방향이면 상수 **초기값 자체가 어디에도 pin되지 않아** 구현자가 `max_excluded_files: 368`로
  파일을 만들어도 게이트 조건(`excluded.length <= max_excluded_files`)과 이 단언이 **전부 green**이고,
  DD2가 CRITICAL로 닫았다고 적은 "한 줄 glob이 게이트를 연다"가 헤드룸으로 되열린다. 그리고 이
  축에서 붉어지는 PR은 무관하지 않다 — **기존 격리 glob 안으로 새 test 파일이 들어왔다**는
  뜻이고, 그것이 조용히 일어나는 것이야말로 이 상한이 막으려는 일이다. 붉어지는 것이 신호다.
  같은 파일의 항목 수 상한이 이미 등가 단언인 것과도 대칭이 맞는다.

  `tracked` floor의 **방향**은 한 방향으로 남긴다. 등가로 걸면 **어떤** test 추가에도 붉어져 진짜
  노이즈이고, 삭제 축은 base 대조 집합 차가 여백 없이 덮는다(DD9). 그러나 **여백의 크기까지
  자유인 것은 아니다** — 위 여백 불변식이 `max_allowed_deletions + 1`이라는 하한을 걸므로 floor의
  여백은 0도 무한도 아니다. 앞선 라운드가 "floor의 slack이 무한하다"고 적은 것과 Task 3이
  "이 시점의 tracked 개수"라 적은 것은 **서로 모순이었고**(여백 0이면 backstop 논증이 무너지고,
  0이 아니면 값 지정이 거짓이다) 초기값이 어디에도 확정되지 않아 어느 쪽이 계약인지 판정 불가였다
  (L2 R14 architect). 이제 계약은 부등식 하나다: floor는 base가 이미 낮아진 경우와 dispatch
  경로의 **backstop**이고, 그 여백은 면제 래칫이 인정할 수 있는 최대 삭제보다 한 칸 넓다 ·
  **배선 단언**: `run.js`가 `exclusions.js`를 거치는지 — `ticket` 없는 목록을 `--exclude-from`으로
  넘기면 러너가 **비영점으로 죽는다**(통과하면 재배선이 안 된 것이다).

### Task 4: --allow-codex에 CI 런타임 가드를 넣는다 (backlog S4 후속)

- **Action**: `scripts/test-suite/run.js`의 **`--allow-codex` 플래그 파싱 지점**에서
  `GITHUB_ACTIONS === 'true'`이면 비영점으로 죽는다. 오늘 배선 지점은 0건이라 라이브 취약점은
  없으나, 전 PR 게이트로 승격하면 "로컬 진단 전용"이라는 의도를 지키는 것이 사람의 주의력뿐이게 된다.

  **`childEnv`에 넣지 않는다.** 앞 라운드는 그렇게 적었고, 그것은 이 계획이 만드는 머지 차단
  게이트를 **자기 변경으로** 붉게 만든다(L2 R8 test) — `scripts/tests/test-suite.test.js` L701·L720의
  (12b)·(12c)가 `childEnv('/some/repo', { allowCodex: true })`를 **직접** 부르고 `childEnv`는
  `process.env` 전량을 읽으므로, GitHub Actions job 안에서 그 두 test가 throw한다. 그리고 로컬
  `## Validation`은 `GITHUB_ACTIONS` 없이 돌기 때문에 그 회귀를 **구조적으로 볼 수 없다**.
  플래그 파싱은 CLI 진입점이라 그 두 test의 사거리 밖이고, 막으려는 것("CI에서 `--allow-codex`로
  들어오는 것")과 정확히 같은 자리다 — 위치를 옮기는 것이 가드를 약화시키지 않는 이유가 그것이다.
- **Mirror**: `scripts/test-suite/run.js`의 기존 fail-closed 관례 — 계약 위반은 걸러지지 않고 죽는다.
- **Validate**: `node --test scripts/tests/test-suite.test.js` — `GITHUB_ACTIONS=true`와
  `--allow-codex`가 함께면 비영점, 둘 중 하나만이면 통과. **seam은 `child_process.spawnSync`다** —
  `main`·`parseArgv`는 `module.exports`에 없으므로(`scripts/test-suite/run.js` L728-747) 순수
  호출로 단언하면 가드가 배선되지 않아도 green이다(L2 R9 test. Task 2b가 (i)(j)(k)에 대해 같은
  seam을 명시한 것과 같은 이유다) · **그리고 같은 파일을
  `GITHUB_ACTIONS=true`로 한 번 더 돌려 green**임을 확인한다. 이 두 번째 호출이 없으면 "CI 전용
  회귀를 로컬이 못 본다"는 사실이 그대로 남고, 그것이 방금 닫은 결함의 원인이다.

### Task 5: 강제 workflow를 신설하고 baseline을 축소한다 (DD1·DD3·DD4)

- **Action**:
  1. `.github/workflows/test-suite.yml` 신설 — `pull_request`에 **paths 필터 없음**. 필터가 오늘
     2.7퍼센트를 만든 원인이다. `continue-on-error` 없음 · `permissions: contents: read` ·
     `persist-credentials: false` · `actions/*` SHA pin · `pull_request_target` 미사용.
     단계 순서는 **체크아웃 → base ref 확보 → Node 고정 → 격리 목록 검증 → 열거 sanity →
     판정자 자기 test → 전수 실행 → 판정 → 산출물 업로드(`if: always()`)** 다.

     **Node 버전을 `actions/setup-node`로 고정하는 것이 단계의 일부다.** 앞 라운드의 순서에는
     그것이 없었고 오라클도 보지 않았는데, 이 계획 자신이 Task 1c를 "node20 전용 red"로 분류하므로
     게이트의 green 여부가 **고정되지 않은 값**에 달려 있었다 — "축 C 진입 전 스위트 green"이라는
     load-bearing 주장이 어떤 단언으로도 반증되지 않는 변수 위에 선다(L2 R19 test). 형제 파일은
     matrix로 고정한다(`.github/workflows/test-suite-baseline.yml` `strategy.matrix.node`). 여기서는
     matrix가 아니라 **단일 값**을 쓴다 — 강제 게이트는 한 번만 돌아야 하고(비용) 하한 버전이
     정본이므로 M1이 유지를 결정한 **20**이다. 값은 리터럴로 pin되고 오라클이 그것을 단언한다.

     **`timeout-minutes`와 `concurrency`도 사양의 일부다.** 이 workflow는 `paths` 필터 없이 fork
     PR에서도 PR이 작성한 임의 `*.test.js`를 러너에서 돌리므로, 멈추지 않는 test 하나가 GitHub
     기본 상한(360분)까지 러너를 점유하고 required check가 **영구 pending**이 된다 — 머지가
     차단되지도 통과되지도 않는 상태다. 가설이 아니다: 이 저장소는 전수 실행이 orphan 프로세스
     폭증으로 `fork: Resource temporarily unavailable`에 도달한 실측을 갖고 있고
     (`scripts/test-suite/run.js:426-430`), 미러 원본이 같은 이유로 `timeout-minutes: 180`을 두고
     그 근거를 주석에 적는다(`.github/workflows/test-suite-baseline.yml:30-31`·`:47`). 앞 라운드는
     같은 파일에서 `permissions`·`persist-credentials`·`continue-on-error` 부재만 가져오고 이 축을
     빠뜨렸다(L2 R19 security). `concurrency`는 같은 PR의 연속 push가 러너를 중첩 점유하지 않도록
     `group: test-suite-${{ github.ref }}` + `cancel-in-progress: true`로 둔다.

     **업로드 단계가 마지막이고 `if: always()`인 것이 필수다.** 축 D의 수용 증거는 **정의상 red
     run에서만** 나오는데, 판정 단계가 비영점으로 죽으면(그리고 `continue-on-error`는 오라클이
     금지한다) 뒤 단계는 기본적으로 skip되므로, 조건을 명시하지 않은 구현은 절단 A·B 두 run의
     `measurement.json`·`gate.json`을 **하나도 남기지 않는다**. 그러면 Acceptance 2·3과 PRD
     Success Metric 4의 producer가 다시 존재하지 않게 된다 — 이 계획이 R11·R12에서 두 번 흡수한
     "증거 요건에 CI producer가 없다"의 세 번째 재현이다(L2 R13 — test·invariant 독립 지목).
     형제 파일이 같은 조건을 명시한다(`.github/workflows/test-suite-baseline.yml` L95-96).

     **판정자 자기 test가 판정보다 앞선 독립 단계인 것이 핵심이다.** L2 R11 invariant가 찾은
     순환이 실재했다 — `gate.js`·`coverage.js`·`wiring-cut.test.js`의 짝 test는 전수 스위트 안에서만
     돌고, 전수 실행 단계는 `scripts/test-suite/run.js` L725의 `return result.ok ? 0 : 1` 대로
     **측정 성립 여부로만** 종료하므로 그 test가 red여도 그 단계는 exit 0이다. 그 red를 체크 red로
     바꾸는 유일한 주체가 `gate.js`의 1단계이므로, **`gate.js`가 통과 방향으로 고장 나 있으면 자기
     결함을 자기가 은폐한다.** 이 계획이 base ref 처방을 미러한다고 적은 바로 그 파일이 반대 규율을
     못박고 있다 — `.github/workflows/version-declaration-gate.yml` L62-65는 "가드가 초록인데 그
     가드 자체가 고장 나 있으면 초록의 의미가 없다"며 판별력 test를 **가드보다 앞선 독립 단계**에서
     돌린다. 그 규율을 취한다:

     ```
     node --test scripts/tests/test-suite-coverage.test.js scripts/tests/wiring-cut.test.js
     ```

     이 단계는 `continue-on-error` 없이 자기 종료코드로 체크를 붉게 만들므로 판정자의 건강이
     판정자 하류에 있지 않다. DD4a의 면책("막는 것은 부주의이지 의도가 아니다")은 여기 적용되지
     않는다 — 판정자 결함은 정확히 부주의다.

     **자기 test는 트리를 재지 않는다.** 이 단계가 판정보다 **앞**이라는 사실은 축 D 절단 B와 직접
     충돌할 수 있다 — 자기 test에는 실제 저장소를 읽는 래칫 상수 단언이 들어 있고, 절단 B는
     tracked `*.test.js` 하나를 지운 트리에서 돈다. floor 여백이 0이면 그 트리에서 이 단계가
     **판정보다 먼저** red가 되고, 판정 단계는 실행되지 않아 `gate.json`이 아예 생성되지 않으며,
     `if: always()` 업로드는 만들어지지 않은 산출물을 건질 수 없다. 그러면 Acceptance 3-B가
     요구하는 증거의 producer가 CI에 없다 — 이 계획이 R11·R12·R13에서 세 번 흡수한 "증거
     요건에 CI producer가 없다"의 **네 번째** 재현이다(L2 R14 architect). Task 7 (e5)의 방어
     (`grep -r`)는 이 의존이 파일명이 아니라 **개수**에 걸려 있어 구조적으로 못 본다.

     닫는 것은 단계 순서를 되돌리는 것이 아니다(순서는 위 논증대로 옳다). **이 단계의 단언 중
     트리를 읽는 것을 하나로 줄이는** 것이다. R14는 그것을 라이브 여백 부등식으로 적었는데 그
     자체가 삭제에서 붉어져 살리려던 경로를 도로 죽였다(L2 R15 architect). 그래서 floor 축의 확인은
     **순수 JSON 산술**(`tracked === tracked_basis − (max_allowed_deletions + 1)`)로 옮겼고,
     `max_allowed_deletions` 등가도 JSON만 읽는다. 트리를 읽는 단언은 이제 **`max_excluded_files`
     등가 하나**이며, 그것은 절단 A·B **양쪽**의 파일 선택 규칙이 덮는다(Task 7 (e5)·(e5a) —
     심거나 지우는 파일이 격리 패턴에 걸리지 않는다). 즉 producer 생존은 부등식의 여유가 아니라
     **의존 자체의 부재**로 성립한다.

     **base ref 가용성은 workflow가 만든다.** `--base-ref`는 게이트의 fail-closed 입력이므로
     (Task 2b), 해소에 실패하면 게이트가 **전 PR에서 영구 red**가 되고 그 상태의 유일한 출구는 이
     계획이 금지한 게이트 완화다(L2 R8 — architect·security 독립 지목). `actions/checkout`
     기본값은 depth 1이고 merge ref를 체크아웃하므로 `origin/<base>`가 러너에 **없다**. 이
     저장소는 그 사고를 이미 겪었고 처방을 갖고 있다 —
     `.github/workflows/version-declaration-gate.yml:21-24`("fetch-depth: 0 은 선택이 아니다 …
     shallow clone 이면 base 해소에 실패한다")와 `:57-60`(`git fetch --no-tags origin` 단계).
     그대로 미러한다: `fetch-depth: 0`으로 체크아웃하고 판정 앞에
     `git fetch --no-tags origin "$BASE_REF"` 단계를 둔다(같은 `env: BASE_REF:` 간접을 쓴다 —
     미러 원본은 여기서 직접 보간하지만, 이 계획이 판정 줄에 대해 "미러 원본이 같은 실수를 갖고
     있다고 해서 물려받을 이유가 없다"고 적어 놓고 바로 옆 단계에서 그것을 물려받는 것은 자기모순이다.
     L2 R12 security가 지적했고 실재했다). 그 둘의 **존재와 형태**는 Task 7
     오라클이 단언한다 — 없으면 이 전제는 다시 산문일 뿐이고, 산문인 전제가 fail-closed 입력을
     떠받치는 것이 이 milestone이 세 번 경계한 형태다.

     **열거 sanity 단계는 `--exclude-from`을 넘기지 않는다.** L2 R5가 찾은 것이고 실재했다 —
     `run.js --list`가 출력하는 것은 `enumerated.included`, 즉 **격리 적용 후** 집합이므로
     (`scripts/test-suite/run.js:676-679`), baseline이 하듯 그 출력을 `git ls-files '*.test.js'`와
     `diff`하면서 격리 목록을 함께 넘기면 **격리가 1건이라도 생기는 순간 이 단계가 영구 red**가
     된다. DD2가 "격리는 저장소를 인질로 잡지 않는다"고 논증한 상태를 게이트의 **앞 단계**가 그대로
     만들어내고, 그 출구는 DD2가 금지한 게이트 완화뿐이다. baseline이 지금 green인 이유는 그 호출이
     플래그를 안 넘겨 `exclusions=[]`이기 때문이지 설계가 그것을 막아서가 아니다.

     그래서 이 단계는 두 검사로 나뉜다:

     1. **정체성** — `run.js --list`(플래그 없음) ≡ `git ls-files '*.test.js'`.
        **이것은 약한 검사다.** `listTrackedFiles`가 `git ls-files -z` + `.endsWith('.test.js')`로
        같은 집합을 얻으므로(`scripts/test-suite/run.js:407-410`·`enumerate.js:122`) 두 변은 같은 git
        출력의 다른 필터이고, 어긋나는 구성은 **pathspec과 suffix 필터가 갈라질 때뿐**이다. 그것이
        이 검사가 잡는 전부이며(baseline이 이미 하던 그대로), 분모 채널의 정본 검증이라고 주장하지
        않는다 — L2 R6의 세 관점이 그 과대주장을 지적했다.
     2. **격리 분할** — 두 `--list` 호출의 개수 차이가 `.github/test-suite-floor.json`의
        `max_excluded_files`와 **같다**.
        **비교 대상이 독립 2항인 것이 핵심이다.** 앞선 라운드는 그 차이를 "격리 목록이 덮는 파일
        수"와 대조한다고 적었는데, 같은 문단에서 그 수량을 출력하는 CLI 표면이 없어 **차이 자체로
        계산한다**고 못박았다 — 등식의 좌변과 우변이 같은 수량이라 어떤 구성에서도 참인 동어반복이고,
        `enumerate.js` L111-132의 이분 구성이 `≤`도 항상 참으로 만든다. 그런데 Task 7 오라클 2b가
        이 단계의 존재를 workflow에 못박으므로 **아무것도 재지 않는 단계가 배선으로 고정**돼
        있었다(L2 R13 architect). `max_excluded_files`는 Task 3이 등가로 pin하는 **다른 파일의 다른
        수량**이므로 대조가 실질이 된다 — 러너가 실제로 덮은 파일 수와 상수가 어긋나면 여기서
        붉어진다. 새 플래그는 여전히 만들지 않는다.

     **전수 실행 단계의 인자도 판정 줄과 같은 규율을 받는다.** L2 R11 architect가 지적했고
     실재했다 — 그 줄은 판정의 **1차 입력을 생산**하는데 계획 어디에도 고정돼 있지 않았고 어떤
     오라클의 사거리에도 없었다. `--exclude-from`이 빠지면 `run.js`는 **빈 목록의** digest를
     산출물에 봉인하므로(`scripts/test-suite/run.js` L580·L666-667), 격리가 1건이라도 생기는 순간
     DD2 세 번째 조건이 `digest_mismatch`로 전 PR을 영구 red로 만들고(DD2가 한 라운드를 들여 막은
     "저장소를 인질로" 상태) 격리 0건인 동안은 앵커가 조용히 공허하다. 그래서 그 줄도 리터럴이다:

     ```
     node scripts/test-suite/run.js --exclude-from .github/test-suite-exclusions.json
       --json > measurement.json
     ```

     판정 줄의 `--measurement measurement.json`이 이 산출을 가리키고, Task 7 오라클이 **이 줄의
     인자 값도** 단언한다.

     마지막 판정은 **한 줄**이다:

     ```
     node scripts/test-suite/gate.js --measurement measurement.json
       --exclude-from .github/test-suite-exclusions.json
       --floor-from .github/test-suite-floor.json
       --base-ref "origin/$BASE_REF"
       --json > gate.json
     ```

     네 인자의 **값이 전부 리터럴로 고정**된다(`measurement.json`은 바로 앞 전수 실행 단계의 산출
     경로다). **`--json > gate.json`도 이 줄의 일부다** — 앞 라운드는 Task 2b에 "판정 단계는
     `--json`으로 이 출력을 `gate.json`에 쓴다"고 적어 놓고 이 리터럴 줄에는 넣지 않았고, 오라클도
     그것을 단언하지 않았다. 즉 pin된 줄 그대로 구현하면 `gate.json`이 **생성되지 않고** 모든 단언이
     green이며, Acceptance 2·3-A·3-B의 증거가 CI에 존재하지 않는다 — 이 계획이 다섯 번 흡수했다고
     적은 "증거 요건에 CI producer가 없다"의 **여섯 번째** 재현이다(L2 R18 architect). 판정이
     비영점으로 죽어도 리다이렉트는 이미 파일을 만들었고, 그 파일을 뒤 단계의 `if: always()`
     업로드가 건진다 — 분기 (o)가 blocked에서도 JSON이 stdout에 실린다는 것을 별도로 잰다. `${{ }}`는 `run:` 텍스트에 직접 보간하지 않고 **`env:` 간접**을 쓴다 —
     `env: BASE_REF: ${{ github.base_ref || 'main' }}`로 받아 셸에서 `"$BASE_REF"`로 읽는다.
     앞 라운드는 이것을 큰따옴표로 감싸는 것으로 적었고 그 주장은 **틀렸다**(L2 R11 security):
     큰따옴표 안에서도 `$(...)`와 backtick은 실행되고, `${{ }}`는 애초에 셸이 보기 전에 텍스트로
     치환되므로 인용은 방어가 아니다. 오늘 값(`github.base_ref`)은 base 저장소 소유자만 만들 수
     있어 실 경로는 없지만, 틀린 주장을 남기면 같은 패턴을 attacker-controlled 값으로 옮길 때
     인용을 방어라고 믿게 된다. 미러 원본이 같은 실수를 갖고 있다고 해서 물려받을 이유도 없다.
     ```

     DD3의 3축(green → coverage → redaction)은 이 한 명령 **안에서** 순서대로 평가된다.
     셸 단계 셋으로 흩지 않는 이유는 둘이다 — (a) 흩으면 그중 하나를 지워도 아무 test가 붉어지지
     않고(축 D의 절단 오라클은 지목한 줄만 본다), (b) 순서 자체가 DD3의 논증이므로 순서를 잃으면
     "유출 판정이 red의 하류일 수 있다"는 구조적 배제가 성립하지 않는다.
     인자를 여기 전부 적는 이유는 DD9 1번이다 — `--floor-from`이 빠지면 래칫이 조용히 사라지므로
     그 인자는 단계 서술의 일부이지 구현 세부가 아니다(그리고 빠지면 `coverage.js`가 죽는다). 격리 검증이 맨 앞인 이유는 그것이 뒤 두 단계의 입력을 정하기 때문이고,
     커버리지 단계가 `--assert-full`이 아닌 이유는 DD2다(격리 1건이 저장소를 인질로 잡지 않는다).
     job 이름을 **안정 식별자**로 고정하고 그것이 required check 문자열이 된다는 사실을 주석에 적는다.
  2. `.github/workflows/test-suite-baseline.yml`에서 `pull_request` 트리거 제거.
  3. 헤더 주석을 `.github/workflows/env-contract-drift.yml`의 4단 구조로 쓴다 — 왜 존재하는가 · 트리거 폭 근거 ·
     scope note(이 파일은 red를 만들 뿐이고 머지 차단은 저장소 설정이다) · receipt 비연동(UI4).
- **Mirror**: `.github/workflows/env-contract-drift.yml:1-46` 주석 4단, `.github/workflows/test-suite-baseline.yml:60-71` 자격증명 방어.
- **Validate**: PR을 열어 `test-suite` 체크가 **실제로 발화**하고 green임을 확인.
  `gh run view --json jobs`로 job 이름이 workflow 선언과 일치하는지 확인.

### Task 6: OQ3 — Windows 원소를 1회 재고 사전 규칙으로 판정한다 (DD8)

- **Action**: `.github/workflows/test-suite-baseline.yml`에 OS 축을 더하고 dispatch 1회.
  **matrix에 `windows-latest`를 적는 것만으로는 성립하지 않는다** — 앞선 라운드의 Action은 그 한
  줄이었고, 그 상태로는 Validate가 구성상 만족 불가였다(L2 R14 test). 편집은 다섯이다:

  1. `strategy.matrix`에 `os: [ubuntu-latest, windows-latest]`를 더하고 `runs-on: ubuntu-latest`
     (`:46` 하드코딩)를 `runs-on: ${{ matrix.os }}`로 바꾼다.
  2. 업로드 단계의 `name:`·`path:`에 **OS 축을 넣는다** — `test-suite-baseline-${{ matrix.os }}-node${{ matrix.node }}`
     / `baseline-${{ matrix.os }}-node${{ matrix.node }}.json`. node 축만 담긴 현재 이름
     (`:99-100`)으로 OS 축을 더하면 같은 node의 두 job이 **동일 artifact 이름**을 올려
     `actions/upload-artifact@v4`가 중복을 거부하고, Validate가 요구하는 Windows artifact가 존재
     자체를 못 한다. 같은 파일 `:92-94` 주석이 "artifact 이름은 계약이다"라고 못박으므로 **개명은
     계약 변경**이고, 소비처를 **같은 diff에서** 고친다. **소비처는 실측으로 확정한다** —
     앞선 라운드는 `docs/ci-full-suite/*`의 `gh run download` 줄을 지목했는데 그 디렉토리에는
     `gh run download`도 `--name test-suite`도 **0건**이다(L2 R16 test). 실재하는 in-tree 소비처는
     `.github/workflows/test-suite-baseline.yml` 자신의 주석(`:92-94`)뿐이고, `ci-full-suite-m1.plan.md`는
     아카이브 대상 기록물이라 손대지 않는다. 편집 직전 `grep -rn "test-suite-baseline-node" -- . `로
     목록을 다시 뽑아 그때의 실재 소비처를 고친다 — 이 계획이 열거한 목록이 아니라. Task 0의 Validate
     (`--name test-suite-baseline-node20`)는 **개명 이전**에 도는 옛 이름이므로 그대로 둔다 —
     그 순서를 여기 적지 않으면 다음 사람이 계약 위반으로 읽는다.
  3. job에 `defaults: { run: { shell: bash } }`를 더한다. Windows runner 기본 셸은 pwsh이고,
     PRD L25가 이 저장소에서 `shell: bash`가 load-bearing임을 실측했다.
  4. job의 `name:`에도 OS 축을 넣는다 — 현재 값(`:45`)은 `node ${{ matrix.node }} — …`로 node
     축만 담아, OS 축을 더하면 같은 node의 두 leg이 **동일한 check 이름**을 갖는다. artifact 이름
     충돌은 편집 2가 닫았지만 check 이름 충돌은 열려 있었고, DD6이 "required status check는 job
     이름 문자열로 걸린다"고 못박으며 Task 6 Validate의 "두 실패를 구분해 기록한다"도 그 이름을
     판별자로 쓴다(L2 R20 architect).
  5. bash 전용 절대 경로를 걷는다 — `/tmp/enum.txt`(`:79-81`)를 `${{ runner.temp }}/enum.txt`로.
     `shell: bash`만으로는 Windows에 `/tmp`가 없다는 사실이 해결되지 않는다.

  그 위에서 dispatch 1회. 벽시계와 red 집합을 받아 DD8의 **사전 선언 규칙**을 적용한다. 결정과
  근거를 문서에 기록하고 PRD OQ3을 닫는다. 규칙을 측정 후에 바꾸지 않는다(UI8).
- **Mirror**: `docs/ci-full-suite/m1-baseline.md` §6a — 관측과 해석을 분리해 적는다.
- **Validate**: `node --test scripts/tests/wiring-cut.test.js`의 **단언 4**(Task 7 — baseline.yml
  오라클 넷)가 green. 그 다음 dispatch 산출에서 `test-suite-baseline-windows-latest-node20`
  artifact가 **존재하고** 그 내용이 `per_file.length === files_total`.
  **두 실패를 구분해 기록한다** — artifact가 0개면 이름 충돌(구성 결함)이고, artifact는 있는데
  수치가 어긋나면 측정 결함이다. 앞선 라운드의 Validate는 둘을 구분할 수 없었고, 애초에 구성상
  만족 불가였다(L2 R14 test).
  결정이 규칙 표의 어느 행인지 문서가 명시.

### Task 7: 축 D — 배선 절단이 red를 만드는 것을 실증한다 (DD5)

- **Action**: `scripts/test-suite/wiring-cut.js` — **절단 셋**을 소유한다.
  `--apply-red`/`--revert-red`가 절단 A(붉은 test 파일 1개를 tracked로 심고 걷는다),
  `--apply-delete <path>`/`--revert-delete`가 절단 B(tracked test 파일 1개 삭제·복원 —
  **index까지 반영한다**, 즉 `git rm`이지 worktree 삭제가 아니다. `git ls-files`가 index를 읽으므로
  worktree만 지우면 head 집합이 줄지 않아 삭제 래칫이 반응하지 않는다. L2 R8 invariant),
  `--apply`/`--revert`가 오라클 왕복(판정 줄의 토큰 하나 제거·복원)을 수행한다.
  세 복원 모두 `git status --porcelain`이 비어 있음으로 확인한다 — A가 index를 건드리므로
  `git diff --exit-code`만으로는 부족하다.

  **셋인 이유는 증명해야 할 명제가 셋이고 각각이 다른 실험을 요구하기 때문이다.**

  | | 대상 | 어디서 도는가 | 무엇을 증명하나 |
  |---|---|---|---|
  | **A (소비 경로)** | 붉은 test 파일 1개를 **심는다**. workflow는 무변경 | CI (버리는 브랜치) | 스위트 red가 `gate.js` **1단계**를 거쳐 체크 red까지 도달한다 |
  | **B (구조)** | tracked `*.test.js` 파일 **1개 삭제** | CI (버리는 브랜치) | 커버리지가 **떨어지지 않는데도** 삭제 래칫이 **2단계**에서 막는다 |
  | **오라클 왕복** | 판정 줄의 토큰 하나 | 로컬 (`## Validation` 검사 4) | 배선이 조용히 사라지면 `wiring-cut.test.js`가 붉어진다 |

  **앞 라운드의 A는 이 계획 자신의 fail-closed 규칙과 충돌해 성립하지 않았다.** L2 R7의 architect와
  test가 독립적으로 같은 것을 찾았고 실재했다 — 그때의 A는 판정 줄에서 `--exclude-from` 인자를
  지우는 것이었는데, R6이 Task 2b에 더한 fail-closed가 **바로 그 인자의 부재**를 "판정할 자격이
  없다"로 만든다. 절단된 트리에서 `gate.js`는 1단계에 **도달하기 전에** 인자 검증에서 죽는다. 즉 그
  실험은 소비 경로가 아니라 인자 검증을 재고 있었고, 요구된 증거(artifact `failing`에
  `wiring-cut.test.js`가 있음)는 두 원인 어느 쪽에서도 똑같이 참이라 **판별력이 없었다**.

  고치는 방향은 규칙을 되돌리는 것이 아니라 **뭉쳐 있던 명제를 가르는 것**이다. fail-closed는
  옳다(부재는 통과가 아니다). 그러니 소비 경로를 재는 실험은 **workflow를 건드리지 않아야** 한다 —
  그래야 게이트의 입력 여섯이 전부 온전한 채로 0단계를 통과하고 1단계에 도달한다. 그것이 새 A다.

  **A는 자기가 심은 red를 자기가 관측한다 — 그래서 순환처럼 보이지만 아니다.** 심는 것은 *탐지기*가
  아니라 *신호*다(연기 감지기를 시험할 때 연기를 피우는 것과 같다). 심은 파일의 존재를 단언하는
  test는 없고, 판정 경로의 어떤 단계도 그 파일을 이름으로 알지 못한다. A가 반증 가능한 이유는
  **증거가 stage 번호이기 때문**이다: `gate.js` 출력이 `stage=1`이 아니면 A는 실패다. 인자 검증
  경로(옛 A)는 그 값을 낼 수 없고, 0단계에서 죽는 측정 실패도 낼 수 없다.

  **B는 순환이 아니다.** 삭제된 파일의 존재를 단언하는 test는 없으므로 분자와 분모가 함께 줄어
  `coverage_pct`는 **떨어지지 않는다**. 그런데도 `missing = base_set − head_set`이 비지 않아 2단계가
  코드 `deleted_without_allowance`로 막는다.
  즉 "실행률"과 "결함을 잡는다"가 다른 명제임을 게이트가 **스스로** 보인다. Success Metric 4를 닫는
  것은 B이고, A는 그 신호가 머지 차단까지 도달하는 경로를 닫는다. 둘을 합쳐야 축 D다.

  **B의 수용 조건은 커버리지 *비율*이 아니라 커버리지 *완전성*이다.** 이 조건은 두 번 틀렸고
  두 번째가 첫 번째보다 미묘했다(L2 R7 → R13 architect). 처음에는 `coverage_pct === 100`이었는데
  격리 1건이면 100 미만이라 만족 불가였고, R7이 그것을 `after >= before`로 고쳤다 — **그것도
  틀렸다.** `pct = (T−E)/T`이므로 격리되지 않은 파일 1개를 지우면 `after = (T−1−E)/(T−1)`이고,
  `E ≥ 1`이면 `E/(T−1) > E/T`이라 **항상 `after < before`**다(T=10·E=1이면 0.900 → 0.889).
  분모만 줄고 격리 수는 그대로라 비율이 떨어진다. 부호를 뒤집어도 같은 함정이다 — 격리 glob에
  덮인 파일을 지르면 E도 줄어 등식은 만족하지만 이번엔 Task 3의 `max_excluded_files` 등가 단언이
  붉어져 **판정자 자기 test 단계가 다른 이유로** 체크를 red로 만든다.

  근본 원인은 비율을 증거로 삼은 것이다. B가 보여야 하는 명제는 "커버리지 축이 이 삭제를 **설명하지
  못하는데도** 게이트가 막는다"이고, 그것을 말하는 것은 비율이 아니라 **버킷 완전성**
  (`unexplained === 0`)이다 — 삭제된 파일은 tracked에서 사라졌으므로 설명 못 한 파일이 0이고,
  커버리지 오라클은 만족한다. 그런데도 삭제 래칫이 막는다. 두 `coverage_pct` 값은 **데이터로
  기록**하되 수용 조건에서는 뺀다. 앞선 두 형태는 이 계획이 스스로 경계한 "만족 불가와 안 했다를
  구분할 수 없다"의 재현이었다. L2 R7의 test·architect·invariant 세 관점이
  같은 것을 지적했고 실재했다 — DD2가 격리를 분자에서 빼도록 정했으므로 격리가 1건이라도 있으면
  `coverage_pct`는 항상 100 미만이고, 그러면 그 등식은 이 계획이 스스로 likelihood **높음**으로 적은
  시나리오에서 **구조적으로 만족 불가**가 된다. B가 실제로 보여야 하는 명제는 "삭제가 커버리지를
  낮추지 않는데도 막힌다"이므로 조건은 `coverage_pct_after >= coverage_pct_before`이고, 두 수치를
  함께 기록한다. 등식 100은 그 명제의 **특수 사례**였을 뿐이며, 특수 사례를 수용 조건으로 못박은 것이
  Task 9가 스스로 경계한 "만족 불가와 안 했다를 구분할 수 없다"와 같은 형태였다.

  **B가 slack에 의존하던 것도 함께 닫힌다.** 앞 라운드의 B는 정적 floor(`tracked < floor`)에
  기대고 있었는데, DD9가 인정했듯 저장소가 자라면 `tracked - floor`만큼 삭제가 통과한다 — 즉 B는
  저장소 상태에 따라 red를 못 만들 수 있었다. base 대조 래칫에는 그 slack이 없으므로 B는 언제
  돌려도 결정적이다.

  **오라클 왕복의 스캔 범위는 판정 줄 안이다.** L2 R7 architect가 찾은 것이고 실재했다 — 토큰이
  파일 어디에나 있으면 만족하는 오라클이라면, 판정 줄에서 `--exclude-from`을 지워도 **열거 sanity
  단계의 `run.js --list --exclude-from …`** 가 그 토큰을 갖고 있어 green이 유지된다. 그러면 왕복은
  위양성이고, §3.17이 경계한 "배선이 아니라 텍스트를 검사한다"가 주석이 아니라 **다른 실행 줄**
  축에서 재현된다. 그래서 오라클은 `node scripts/test-suite/gate.js`로 시작하는 **그 `run:` 줄
  안에서만** 토큰을 찾는다.

  `scripts/tests/wiring-cut.test.js`가 단언하는 것은 그래서 셋이다:

  1. **판정 줄** — 그 `run:` 줄 **안에** `gate.js` · `--measurement` · `--exclude-from` ·
     `--floor-from` · `--base-ref` · **`--json`** 이 전부 있고, **`> gate.json` 리다이렉트가 있으며**,
     **네 인자의 값이 전부 리터럴로 일치한다** —
     `--measurement measurement.json` · `--exclude-from .github/test-suite-exclusions.json` ·
     `--floor-from .github/test-suite-floor.json` · `--base-ref "origin/$BASE_REF"`.
     뒤의 둘(`--json` · 리다이렉트)이 R18에서 추가됐다 — 그것들이 없으면 축 D와 Acceptance 2의
     **증거 파일 자체가 만들어지지 않는데** 나머지 단언은 전부 green이었다(L2 R18 architect).

     **네 플래그는 그 줄 안에 각각 정확히 한 번만 나타난다.** 존재만 재는 단언은 **중복 플래그**에
     무감하다 — 리터럴 쌍을 그대로 둔 채 뒤에 같은 플래그를 다른 값으로 한 번 더 붙이면 last-wins
     파서가 뒤의 값을 쓰는데 오라클은 green이다(L2 R22 invariant). 그러면 R10이 값 치환에 대해
     닫았다고 적은 경로가 형태만 바꿔 남고, `--base-ref`를 `HEAD`로 재지정하는 한 토막은 DD9
     래칫을 항상 참으로 접는다. 자물쇠는 둘이다 — 여기 유일성 단언과 Task 2b의 fail-closed
     아홉째(`duplicate_flag`). 오라클은 이 workflow 안에서만 유효하고 fail-closed는 어느 호출자
     에게나 유효하므로 둘은 중복이 아니라 서로의 사각을 덮는다.

     **`--base-ref`의 값 단언은 두 부분이다 — 값이 두 곳에 나뉘어 살기 때문이다.** R11이 셸 주입
     하드닝으로 `${{ }}`를 `env:` 간접으로 옮겼는데, 오라클의 스캔 범위는 판정 `run:` **줄 안**이라
     그 순간 R10이 세운 `--base-ref` 값 pin이 **구성상 만족 불가**가 됐다(L2 R12 architect·security).
     두 흡수가 서로를 무효화했고, 그 결과 R10이 "남긴 둘이 더 위험했다"고 지목한 경로가 다시
     오라클 없이 열렸다 — 구현자가 줄 안의 `origin/$BASE_REF`만 단언하면
     `BASE_REF: ${{ github.head_ref }}`로 바꾸는 편집이 통과한다.

     고치는 방향은 하드닝을 되돌리는 것이 아니라 **단언이 값을 따라가는 것**이다:

     1. 판정 `run:` 줄 안에 `--base-ref "origin/$BASE_REF"`가 리터럴로 있다.
     2. **그 step의 `env:` 매핑**이 `BASE_REF`를 `github.base_ref`(fallback `'main'`)에 묶는다 —
        `head_ref`도 `HEAD`도 아니다.

     즉 이 인자에 한해 스캔 범위가 그 step의 `env:` 블록까지 넓어진다. 나머지 셋은 값이 줄 안에만
     있으므로 범위가 그대로다. 범위를 인자마다 다르게 두는 것이 특례처럼 보이지만 규칙은 하나다 —
     **단언은 값이 정의된 자리를 본다.**

     **앞 라운드는 이 값 단언을 둘에만 걸었고 그것이 비대칭이었다**(L2 R10 — security·invariant
     독립 지목). 남긴 둘이 더 위험했다: `--base-ref`를 `HEAD`나 `origin/${{ github.head_ref }}`로
     돌리면 `base_set = head_set`이 되어 DD9 삭제 래칫이 **항상 참으로 접히고**(이 계획의
     `## Validation` 4b가 로컬에서 쓰는 값이 정확히 `HEAD`라 오타 한 번으로도 일어난다),
     `--measurement`를 커밋된 손수 만든 JSON으로 돌리면 0~3단계 **전부**가 그 파일을 판정한다.
     둘 다 토큰은 그대로라 앞 라운드의 오라클은 green이다. 값을
     단언하지 않으면 DD7의 통제("게이트가 **그 경로만** 읽는다")를 지키는 기계가 0건이고, 같은 PR이
     인자를 리뷰 표면이 좁은 다른 파일로 돌리면 DD2 3조건과 DD9 래칫이 함께 무력화된 채 모든 test가
     green이다. 이 축은 R7·R8·R9에 걸쳐 세 번 제기됐고(security 둘·invariant 하나) 두 번 이연했다 —
     이연 사유였던 "정본 경로가 바뀌면 무관하게 붉어진다"는 사실 **틀렸다**: 그 경로가 바뀌는 것은
     무관한 변경이 아니라 정확히 리뷰가 봐야 할 변경이다.
  1c. **`continue-on-error` 부재** — workflow 어디에도 `continue-on-error`가 **없다**. 이것이
     이 축에서 가장 직접적인 과대허용 경로다: 판정 단계에 `continue-on-error: true` 한 줄이면
     `gate.js`가 비영점으로 죽어도 체크는 **success**를 보고하고, 단위 test·커버리지 오라클·절단
     오라클이 전부 green이다. Task 5가 "`continue-on-error` 없음"을 선언만 하고 단언하지 않은 것은
     `paths` 부재를 단언하는 것과 비대칭이었다(L2 R10 test). 위험이 가설이 아닌 이유는 이 milestone이
     **함께 편집하는 형제 파일**이 그 줄을 둘 갖고 있고(`.github/workflows/test-suite-baseline.yml`
     L88·L107) 가장 가까운 복사 템플릿이기 때문이다 — 거기서는 정당하지만(측정이므로) 여기서는
     게이트를 무력화한다.
  1d. **판정 단계가 무조건이다** — 판정 `run:` 줄이 있는 step에 `if:`가 **없고**, 그 step의 job에도
     `if:`가 없다. `continue-on-error`를 닫고도 이것을 열어 두면 같은 무력화가 **형태만 바꿔**
     남는다: `if: github.actor != 'dependabot[bot]'` 한 줄이면 판정이 skip되고 체크는 success이며
     1c를 포함한 모든 단언이 green이다(L2 R17 test). 계획이 `if:`를 생각한 유일한 방향이
     **증거 보존**(`if: always()` 업로드)이었고 **게이트 비활성** 방향은 사거리 밖이었다.
     **대상은 이 workflow의 모든 step과 job이다** — `if:`가 나타나도 되는 자리는 **업로드 단계
     하나**이고 그 값이 리터럴 `always()`임까지 단언한다. 앞 라운드는 대상을 두 step으로 열거했고,
     그 열거가 **전수 실행 step을 사거리 밖에 남겼다**(L2 R20 invariant). 그 step이 `if:` 한 줄로
     skip되면 `measurement.json`이 생성되지 않는데, 판정 줄이 pin한 경로는 **repo-relative**라 PR이
     같은 이름의 파일을 커밋해 두면 게이트의 0~3단계 전부가 **그 커밋된 파일**을 판정한다. 손으로
     만든 green measurement(`ok:true` · `exit_code:0` · `redaction_ok:true` · `per_file`=tracked
     전체 · 실제 격리 목록으로 계산한 digest)는 stage 0의 트리 정합 · `unexplained` 0 · digest 일치 ·
     floor · 삭제 래칫을 **전부 만족**하므로, 스위트가 한 번도 돌지 않은 채 required check가 green이고
     단언 1·1b·1c·1d·2·2b·2c·3·3b가 전부 green이다. 이것은 R10이 `--measurement` **값 치환**에
     대해 닫은 경로를, 값은 그대로 두고 **producer를 끄는 것**으로 재현한 것이다. 열거가 아니라
     클래스로 단언해야 같은 형태가 다시 남지 않는다(단언 3b가 `${{` 에 대해 취한 것과 같은 규율).
     그 결과 격리 목록 검증·열거 sanity·판정자 자기 test·전수 실행·판정이 **전부** 덮인다. 앞 라운드는 범위를 판정 step 하나로 좁혔는데, 자기 test
     단계는 "판정자의 건강이 판정자 하류에 있지 않게" 만드는 **유일한** 장치이고 그 step에 `if:`
     한 줄이면 단계가 skip되면서 존재 단언(2b)은 여전히 green이라, 통과 방향으로 고장 난
     `gate.js`가 다시 자기 결함을 은폐한다(L2 R18 invariant). 같은 무력화이므로 같은 단언이 덮는다.
  1e. **종료코드를 억제하는 셸 구문이 하나도 없다** — 이 workflow의 **어떤 step의 `run:` 블록**
     에도 `|| true` · `|| :` · `set +e` · `set +o errexit` · 마지막 줄의 `exit 0`이 나타나지
     않는다. 이것이 남아 있던 **가장 값싼 과대허용 무력화**다(L2 R23 test): 판정 줄 뒤에
     `|| true` 한 토막을 붙이면 단언 1(네 인자 리터럴 + 유일성 + `--json` + 리다이렉트) ·
     1c(`continue-on-error` 부재) · 1d(`if:` 부재) · 2b·2b2(step 집합과 순서) · 2c·2d · 3·3b가
     **전부 green인 채** `gate.js`의 차단이 체크를 red로 만들지 못한다. 이 계획은 같은 클래스를
     형제 벡터에 대해 세 번 닫았는데(`continue-on-error` R10 · `if:` R17·R20 · `ref:` R20)
     **셸 수준의 억제만 사거리 밖**이었다 — 음성 fixture 목록에도 그것이 없었다.
     대상이 판정 step 하나가 아니라 **클래스 전체**인 이유는 1d와 같다: 자기 test 단계에
     `|| true`가 붙으면 "판정자의 건강이 판정자 하류에 있지 않게" 만드는 유일한 장치가 조용히
     꺼지고, 격리 목록 검증·열거 sanity도 같은 형태로 무력화된다. 업로드 단계의 `if: always()`는
     `if:` 축(1d)의 예외이지 이 축의 예외가 아니다 — 그 step에도 억제 구문은 없다.
     음성 fixture: **판정 줄 뒤에 `|| true`를 붙인 YAML** · **자기 test 줄 뒤에 `|| true`를 붙인
     YAML** · **판정 step의 `run:` 첫 줄에 `set +e`를 넣은 YAML** · **판정 step `run:`의 마지막
     줄에 `exit 0`을 더한 YAML** 각각에 대해 test가 red.
  1b. **fork-PR 방어 넷** — `permissions:`가 `contents: read`이고 · `persist-credentials: false`가
     있고 · `pull_request_target`이 **없고** · 모든 `uses:`가 40자리 commit SHA로 pin돼 있고 ·
     **`secrets` 미주입** — workflow 어디에도 `secrets.` 참조가 없다. DD4는 방어를 **다섯**으로
     못박는데 앞선 라운드의 오라클은 넷만 단언했고 빠진 하나가 가장 치명적이었다(L2 R11 security):
     이 workflow는 PR이 추가한 임의 `*.test.js`를 러너에서 실행하므로 `env: FOO: ${{ secrets.X }}`
     한 줄이 나중에 들어오면 그 시크릿이 PR 통제 코드의 프로세스 환경에 노출되고, artifact는
     `redact.js` 헤더가 스스로 비완전하다고 적은 잔여 축(credential 클래스 커버리지 0건)을 통과해
     업로드된다.
     DD4가 이 넷을 못박고 Risks가 그것을 유일 mitigation으로 드는데 어떤 test도 단언하지 않았다
     (L2 R9 test) — 같은 파일의 같은 성질인 `paths` 부재는 이미 단언 대상이므로 사거리 밖이라는
     사유도 없다.
  2. **base ref 전제** — `actions/checkout`에 `fetch-depth: 0`이 있고
     `git fetch --no-tags origin` 단계가 판정보다 앞에 실행 줄로 존재한다. 이것이 없으면
     `--base-ref`가 fail-closed로 죽어 전 PR이 영구 red가 되고(L2 R8), 그 전제를 지키는 것이
     사람의 기억뿐이게 된다.
  2b. **앞 단계 넷** — 격리 목록 검증(`exclusions.js --check`) · 열거 sanity(`run.js --list`) ·
     **판정자 자기 test**(`node --test` 줄에 `scripts/tests/test-suite-coverage.test.js`와
     `scripts/tests/wiring-cut.test.js`가 **둘 다** 있다 — 뒤의 것이 workflow 형태의 유일한
     단언자이므로 그것이 그 단계에서 조용히 빠지면 오라클 전체가 무력화된다. R11이 세운 "판정자
     건강은 판정자 하류에 있으면 안 된다" 규율이 절단 오라클 자신에는 절반만 적용돼 있었다 —
     L2 R12 test) ·
     **전수 실행**(`run.js --exclude-from .github/test-suite-exclusions.json --json > measurement.json`,
     **인자 값까지** 리터럴 일치) · **산출물 업로드**(`actions/upload-artifact` 단계가 판정 **뒤**에
     있고 `if: always()`를 갖는다)가 전부 실행 줄로 존재한다. 마지막 것이 없으면 red run의 증거가
     사라져 축 D 전체가 반증 불가가 된다(L2 R13). 뒤의 둘이 R11에서 추가됐다 — 판정자
     자기 test가 없으면 판정자 결함이 자기 하류에 숨고(invariant), 전수 실행 인자가 없으면 판정의
     1차 입력을 생산하는 줄이 오라클 밖이라 `--exclude-from` 소실이 digest 축을 통째로 뒤집는다
     (architect). 이것이 없으면 "기계는 만들어지고 부르는 한 줄이 빠진다"가 그 두
     단계에 그대로 남는다(L2 R7 test — 앞선 오라클의 단언 집합은 판정 줄과 `paths` 부재뿐이었다).
  2b2. **producer가 consumer보다 앞에 온다 — 순서를 단언한다.** 앞 라운드는 이 자리에 "순서는
     단언하지 않는다(막으려는 것은 뒤바뀜이 아니라 소실이다)"라고 적었고, 그것이 **R20이 닫은
     경로를 재배치만으로 다시 열었다**(L2 R22 invariant). 단언 1d는 producer를 *끄는* 것만 막고
     producer보다 **먼저 판정하는 것**은 막지 못한다: 판정 step을 전수 실행 step 앞으로 옮기면
     다섯 step이 전부 존재하고(2b) 어디에도 `if:`가 없고(1d) 네 인자가 리터럴 그대로인데(1)
     판정은 **PR이 커밋해 둔** `measurement.json`을 읽는다. 뒤이어 도는 전수 실행 step은 스위트가
     red여도 exit 0으로 끝나므로(`scripts/test-suite/run.js` L725 `return result.ok ? 0 : 1;` —
     `ok`는 측정 성립이지 green이 아니다) 체크 전체가 green이다. `measurement.json`은
     `.gitignore`에 없어 커밋이 가능하다. 형제 무력화 벡터가 전부 단언을 받았는데 이 축만
     자발적으로 사거리 밖에 남아 있었다.

     **그래서 순서는 전부가 아니라 의존하는 쌍에만 건다** — 앞 라운드의 회피 사유("무관한 편집에
     붉어진다")는 전순서를 단언할 때만 참이다. 세 쌍이다: 전수 실행 step의 인덱스 < 판정 step의
     인덱스(producer→consumer) · base fetch step < 판정 step(단언 2가 이미 요구하는 전제) ·
     판정 step < 업로드 step(2b가 이미 "판정 뒤"라 적는다). 나머지 두 step(격리 목록 검증 ·
     열거 sanity)의 자리는 자유다. 음성 fixture: **판정 step을 전수 실행 step 앞으로 옮긴 YAML**
     에 대해 test가 red.
  3. **`on.pull_request`에 좁히는 키가 하나도 없음** — `paths` · `paths-ignore` ·
     `branches` · `branches-ignore` · `types` **다섯 전부**의 부재를 단언한다. 없으면 이 milestone의
     최대 주장("전 PR 강제")이 과대허용 방향으로 반증 불가다. 좁은 필터가 몰래 들어와도
     `.github/**`·`scripts/**`를 건드리는 이 PR 자신은 여전히 발화하므로 라이브 완주가 그것을 잡지
     못한다. 앞선 라운드는 `paths` 둘만 단언했는데 나머지 셋은 **동형의 무력화**다(L2 R17 test) —
     `branches: [release]`나 `types: [labeled]`면 대부분의 PR에서 workflow가 아예 발화하지 않고
     required check는 pending도 아닌 부재가 되며, 열거된 두 키만 보는 오라클은 green이다.
  3b. **`run:` 블록에 `${{` 가 하나도 없음** — 이 workflow의 어떤 step의 `run:` 안에도 GitHub
     식 보간이 직접 나타나지 않는다(값은 `env:`·`with:`로만 들어온다). 앞 라운드는 이 규칙을 두
     지점(`BASE_REF` · base fetch)에만 걸었고 **클래스 전체를 재는 단언이 0건**이었다(L2 R18
     security) — 그래서 나중에 `${{ github.head_ref }}`나 `${{ github.event.pull_request.title }}`처럼
     **공격자가 통제하는** 값을 다른 step의 `run:`에 직접 보간하는 편집이 들어와도 모든 단언과
     음성 fixture가 green이다. 이 workflow는 `paths` 필터 없이 fork PR에서도 발화하므로 실행
     경로가 실재한다. 음성 fixture: 임의 step의 `run:`에 `${{ github.head_ref }}`를 넣은 YAML.
     `env:`·`with:`·`if:` 값의 `${{ }}`는 대상이 아니다 — 셸이 그것을 텍스트로 받지 않는다.
  2d. **체크아웃이 PR 트리를 본다** — `actions/checkout` 단계에 `with: ref:`가 **없다**. 한 줄
     (`ref: ${{ github.event.pull_request.base.sha }}` — base 해소를 "고치려는" 편집으로 자연스럽게
     나올 수 있는 형태)이면 게이트가 PR 트리가 아니라 **base 트리**를 판정해 항상 green이 된다.
     형제 무력화 벡터(`continue-on-error` · `if:` · 좁히는 트리거 · 인자 값 치환)가 각각 단언을
     받았는데 **판정 대상 트리 자체만 앵커가 없었다**(L2 R20 invariant). 음성 fixture: checkout에
     `ref:`를 더한 YAML.
  2c. **자원 경계 셋 — 값과 **수준**까지 pin한다** — `timeout-minutes`가 **job 수준**(`jobs.<id>`
     바로 아래)에서 리터럴 `60`이고 · `concurrency`가
     `group: test-suite-${{ github.ref }}` + `cancel-in-progress: true`이고 ·
     `actions/setup-node` 단계의 `node-version`이 리터럴 `20`이다. **존재만 재면 보호가 0인 값이
     통과한다** — `timeout-minutes: 360`은 GitHub 기본과 같아 아무것도 막지 않으면서 단언은 green이고,
     같은 블록의 형제(`node-version`)와 판정 줄의 네 인자가 전부 값까지 pin되는 것과 비대칭이었다
     (L2 R21 security). **수준까지 pin하는 이유는 같은 논증의 나머지 절반이다** — step 하나(예:
     checkout)에 `timeout-minutes: 60`을 두면 값 단언은 green인데 전수 실행 step은 GitHub 기본
     360분을 유지해, R19가 근거로 든 "required check 영구 pending"이 그대로 열린다. 값 pin의
     논증("존재만 재면 보호 0인 값이 통과한다")이 scope 축에는 적용되지 않았다(L2 R22 architect).
     미러 원본도 job 수준이다(`.github/workflows/test-suite-baseline.yml:44-47` — `jobs.measure`
     아래 `timeout-minutes: 180`). `60`은 M1 실측(Linux 전수 75.5초)의 **47배** 여유이므로 정상 실행을 자르지
     않으면서 멈춘 test를 1시간 안에 끊는다. 앞의 둘이 없으면 멈추지 않는
     test 하나가 required check를 영구 pending으로 만들고(L2 R19 security), 셋째가 없으면 게이트의
     green 여부가 고정되지 않은 Node 버전에 달린다(L2 R19 test). 음성 fixture: 각각을 뺀 YAML 셋과
     `node-version: 24`인 YAML.
  4. **`.github/workflows/test-suite-baseline.yml`에 대한 단언 넷** — 이 파일은 Task 5와 Task 6이
     함께 고치는데 **어떤 오라클도 걸려 있지 않았다**(L2 R14 test — HIGH와 MEDIUM 양쪽). 스캔
     대상이 `test-suite.yml` 하나뿐이라, DD1이 load-bearing이라 부른 편집(`pull_request` 트리거
     제거)이 통째로 누락돼도 전 검사가 green이고, Task 6의 matrix 확장이 잘못돼도 붉힐 단언이
     0건이었다. 넷은 — (4a) `on:`에 `pull_request` 키가 **없다**(DD1의 편집이 실재함) ·
     (4b) `runs-on:`이 `${{ matrix.os }}`이고 `strategy.matrix`에 `os` 축이 있다(하드코딩된
     `ubuntu-latest`면 Windows 원소가 생기지 않는다) · (4c) 업로드 단계의 `name:`과 `path:`가
     `matrix.os`와 `matrix.node`를 **둘 다** 포함한다(node 축만 담으면 같은 node의 두 OS job이
     동일 이름을 올려 `actions/upload-artifact@v4`가 중복을 거부하고, Windows artifact가 아예
     존재하지 않는다) · (4d) job에 `defaults.run.shell: bash`가 있다(Windows runner 기본은
     pwsh이고 PRD L25가 `shell: bash`를 load-bearing으로 실측했다). 음성 fixture는 각 단언의
     부정 하나씩 — `pull_request:`를 되돌린 YAML · `runs-on: ubuntu-latest`인 YAML · `name:`이
     `matrix.node`만 담는 YAML · `defaults.run.shell`이 빠진 YAML.

  넷 다 **주석을 걷어낸 뒤** 스캔한다(DD5 — §3.17 선례).

  CI 증거는 DD5가 못박은 **버리는 브랜치**에서 얻는다. run 상태만으로는 증거가 아니다 — 이
  저장소에는 미격리 flaky가 실재하므로(M2 종결 §관측) 무관한 red가 같은 체크를 붉게 만들 수 있고,
  그러면 "절단했더니 red"와 "절단했는데 우연히 red"가 구분되지 않는다. 그래서 수용 증거는
  **artifact 내용과 gate 출력의 stage 번호**다.
- **Mirror**: `impeccable-guard.test.js`의 짝 단언 — 배선의 존재를 test가 직접 단언한다.
- **Validate**:
  (a) `--apply` 후 `node --test scripts/tests/wiring-cut.test.js`가 **red** · (b) `--revert` 후 green ·
  (c) `git status --porcelain`이 비어 실증이 파손으로 남지 않음 ·
  (a2) **B 왕복** — `--apply-delete <path>` 후 붉어야 하는 것은 오라클이 아니라 **게이트**다
  (B는 배선이 아니라 분모를 건드린다): `gate.js`가 비영점이고 `reasons`에
  `deleted_without_allowance`가 있다(stage 번호는 판별자가 아니다) · (b2) `--revert-delete` 후
  exit 0이고 `git status --porcelain`이 다시 빈다. 앞선 라운드는 B의 복원을 산문으로만 갖고 어떤
  검사도 왕복시키지 않았다(L2 R7 invariant) — 삭제 복원 실패가 트리에 남아도 붉어질 검사가 0건이었다 ·
  (d) 버리는 PR의 `test-suite` 체크가 red인 run URL이 문서에 기록되고, 그 PR이 **닫힘**(머지 아님) ·
  (e2) **A의 red 귀속과 단계 귀속** — A run의 gate 출력이 `stage=1`이고 artifact `failing`에 심은
  파일이 있으며, `--revert-red` 대조 run의 `failing`에는 없다. `stage=1` 단언이 이 분기의
  **핵심**이다: 그것이 없으면 인자 검증으로 죽은 게이트와 구분되지 않는다(L2 R7) ·
  (e3) **판정자 생존** — A의 절단은 workflow를 건드리지 않으므로 `gate.js` 실행 줄은 정의상 그대로다.
  그 사실을 오라클이 단언한다(`--apply-red` 후에도 단언 1번이 만족) ·
  (e4) **B — 구조적 음성 통제** — 삭제 run에서 **`unexplained === 0`**(커버리지의 버킷 완전성이
  통과했다 — 삭제된 파일은 tracked에서 사라졌으므로 설명 못 한 파일이 없다)이면서
  `gate.js`가 차단하고 `reasons`가 **`deleted_without_allowance`를 포함**한다(stage 번호는 판별자가
  아니다 — 2단계는 커버리지 실패와 공유하는 칸이다). 앞선 라운드는 여기에 철회된 부등식
  `tracked_head < tracked_base`를 사유로 적어 두어, 구현자가 이 조건을 문자 그대로 만족시키려면
  Task 2b (k)가 red로 잡도록 설계된 개수 비교로 **되돌아가야** 했다(L2 R9 — 3관점 지목).
  그 run URL과 두 수치를 함께 기록한다 — 커버리지 수치만으로는 이 red를 설명할 수 없다는 것이 이 축의 요지다 ·
  (e5a) **A의 선택 규칙** — 심는 붉은 test 파일도 `.github/test-suite-exclusions.json`의 어떤
  `pattern`에도 **걸리지 않아야 한다**. 걸리면 (i) 그 파일이 격리돼 실행되지 않으므로 스위트 red가
  애초에 발생하지 않고 (ii) `max_excluded_files` 등가 단언이 판정보다 앞선 자기 test 단계를 red로
  만들어 `gate.json`이 생성되지 않는다 — Acceptance 3-A가 요구하는 `stage=1` 증거의 producer가
  사라진다. R14가 B에 대해 닫은 결합이 A 쪽에 그대로 열려 있었다(L2 R15 — test·invariant 독립 지목).
  A는 파일을 **더하므로** 개수 축(floor)에는 안전하고, 걸리는 축은 격리 하나다 ·
  (e5) **B의 선택 규칙 셋** — 삭제 대상은 (1) 그 존재를 단언하는 test가 저장소에 **없고**
  (`grep -r "<basename>" --include=*.test.js` — 비순환성) · (2) `.github/test-suite-exclusions.json`의
  어떤 `pattern`에도 **걸리지 않으며**(걸리면 격리 확장 파일 수가 줄어 `max_excluded_files` 등가
  단언이 자기 test 단계에서 red가 되고, 판정 단계가 실행되지 않아 이 실험의 producer가 사라진다) ·
  (3) `allow_deletions`에 **없다**(있으면 면제되어 잴 것이 없다). 셋 중 하나라도 어긋나면 다른
  파일을 고른다. (2)를 더한 것은 L2 R14 architect가 지목한 자기 test ↔ 절단 B 결합의 나머지
  절반이다 — 개수 축은 여백 불변식이 덮고, 격리 축은 선택으로 덮는다 ·
  (f) **합성 fixture 분기** — `--floor-from`만 지운 YAML · `--exclude-from`만 지운 YAML ·
  `--base-ref`만 지운 YAML · `gate.js`를 `coverage.js`로 바꾼 YAML · `on.pull_request`에 `paths`가
  **추가된** YAML · 격리 목록 검증 단계가 **빠진** YAML · 열거 sanity 단계가 **빠진** YAML ·
  `fetch-depth: 0`이 **빠진** YAML · base fetch 단계가 **빠진** YAML ·
  `--exclude-from`의 **값만 다른 파일로 바꾼** YAML · `--base-ref`의 값을 `HEAD`로 바꾼 YAML · **`env: BASE_REF`를 `github.head_ref`에 묶은 YAML**(줄 안 리터럴은 그대로라 R11 이후의 오라클이 놓치던 형태다) · `env: BASE_REF` 매핑을 아예 지운 YAML · base fetch 단계가 `${{ }}`를 직접 보간하는 YAML ·
  `--measurement`의 값만 다른
  파일로 바꾼 YAML · 판정 단계에 `continue-on-error: true`를 더한 YAML ·
  `permissions:`가 `contents: write`인 YAML ·
  `persist-credentials: false`가 빠진 YAML · `pull_request_target`을 쓰는 YAML ·
  **판정 step에 `if:`를 더한 YAML** · **그 job에 `if:`를 더한 YAML** ·
  **판정 줄에 `--floor-from`을 한 번 더(다른 값으로) 붙인 YAML** · **`--base-ref`를 한 번 더
  붙인 YAML**(리터럴 쌍은 그대로라 유일성 단언이 없으면 green이다) ·
  **판정 step을 전수 실행 step 앞으로 옮긴 YAML**(step 집합·`if:` 부재·리터럴이 전부 그대로다) ·
  **`timeout-minutes: 60`을 job이 아니라 step 하나에 둔 YAML** ·
  **`on.pull_request`에 `branches:`를 더한 YAML** · **`types:`를 더한 YAML** ·
  `secrets.`를 참조하는 YAML · 판정자 자기 test 단계가 **빠진** YAML ·
  전수 실행 줄에서 `--exclude-from`을 지운 YAML ·
  `uses:`가 태그 pin인 YAML 각각에 대해 test가 red ·
  (f2) **범위 위양성 짝 단언** — 판정 줄에서 `--exclude-from`을 지웠지만 **열거 sanity 줄에는 남아
  있는** 합성 YAML에 대해 test가 **red**여야 한다. 파일 전체를 스캔하는 오라클이면 여기서 green이
  되고, 그것이 L2 R7 architect가 찾은 위양성이다 ·
  (e) **주석 위양성 짝 단언** — 합성 fixture 2개에 대해, 실행 줄만 있는 YAML은 만족하고 주석에만
  같은 문자열이 있는 YAML은 **만족하지 않는다**. 이것이 없으면 Task 5.3이 요구하는 4단 헤더 주석이
  절단을 가려 축 D의 실증이 거짓이 된다(§3.17 `impeccable-resolve.test.js` 선례).

### Task 8: required check drift 진단과 branch protection 런북 (DD6·UI6)

- **Action**: `scripts/ci-required-checks.js` — workflow 파일이 선언한 job 이름을 파싱하고
  `gh api`로 읽은 required check 목록과 대조해 어긋나면 비영점. 순수 판정층(`diffChecks`)과
  `gh` 호출을 분리해 합성 입력으로 단언 가능하게 한다.
  `docs/ci-full-suite/branch-protection-runbook.md`에 수동 1회 절차를 적는다. **어떤 체크를
  필수로 걸지의 정책 논의는 하지 않는다**(UI6) — 절차와 검증 방법만 적는다.

  **같은 런북이 게이트 자체가 고장 났을 때의 복구 경로를 갖는다.** 전 PR · `paths` 필터 없음 ·
  fail-closed 조합이라 `gate.js`·`coverage.js`·상수 파일의 결함은 즉시 저장소 전체를 머지 불가로
  만들고 **그것을 고치는 PR도 같은 게이트를 통과해야 한다**. 계획은 이 상태를 두 번 위험으로
  적으면서 출구를 금지만 하고 승인된 대체 경로를 어디에도 배정하지 않았다(L2 R10 invariant).
  경로는 정책이 아니라 **절차**이므로 UI6 밖이다: 관리자가 branch protection에서 `test-suite`
  required check를 **일시 해제** → 수정 PR 머지 → 즉시 재설정. **"잊는 것을 막는 기계가
  이미 있다"고 적었던 것은 거짓이다**(L2 R13 invariant). `scripts/ci-required-checks.js`는 관리
  권한 토큰이 필요해 DD6·UI5가 **CI 실행을 금지한** 운영자 수동 진단이고, 어떤 workflow도 schedule도
  hook도 그것을 부르지 않는다. 아무도 돌리지 않으면 해제된 required check는 무기한 조용히 남고 이
  milestone의 강제 축 전체가 장식이 된다 — 체크는 여전히 발화하고 red를 내지만 머지를 막지 않는다.
  PRD가 서명 실패 모드로 지목한 "기계는 만들어지고 그것을 부르는 한 줄이 빠진다"의 재현이다.

  자동화는 UI5·UI6 밖이므로 이 milestone이 닫지 않는다. 대신 **절차를 분리 불가한 한 단위로**
  못박는다: 해제·머지·재설정을 같은 작업 세션 안에서 끝내고, 재설정 직후 `ci-required-checks.js`를
  **그 자리에서** 돌려 exit 0을 확인한 뒤에야 세션을 닫는다. 런북이 그 넷을 한 절차로 적고,
  미복원 탐지가 **운영자의 주기 실행에 의존한다는 한계**를 같은 자리에 적는다 — 기계가 막는다고
  주장하지 않는다. 게이트 완화(오라클/상수 수정)는 복구 경로가 **아니다**.
- **Mirror**: `scripts/version-declaration-guard.js` — 저장소 상태를 재는 독립 진단과 `--json`.
- **Validate**: `node --test scripts/tests/ci-required-checks.test.js`의 일치·불일치·필수 체크 부재
  3분기 **더하기 파서 2분기**. 앞 라운드의 셋은 전부 판정 순수층(`diffChecks`)이라 **실제 producer**
  (workflow의 job 이름 파서)가 무엇을 내는지 재는 단언이 0건이었고, Acceptance 4는 workflow를
  제대로 읽지 못하는 구현으로도 만족됐다 — 이 계획이 (i)·(j)·(k)와 Task 4에서 "순수층만 단언하면
  부르는 한 줄이 빠진다"며 spawn seam을 명시한 규율이 이 Task에만 빠져 있었다(L2 R21 test).
  게다가 **이 milestone 자신이 같은 사이클에서 job `name:`을 matrix 템플릿으로 만든다**(Task 6
  편집 4). 그래서 계약을 여기서 못박는다: 파서는 **리터럴 job 이름만** check 이름으로 내고,
  `${{ ... }}`를 포함한 이름은 **`unresolved`로 보고**한다(템플릿 문자열을 그대로 check 이름으로
  내면 어떤 실제 체크와도 영원히 일치하지 않아 drift를 상시 보고한다). 두 분기는 실재 파일에
  대해 돈다 — `.github/workflows/test-suite.yml`(리터럴 → 그 이름을 낸다) ·
  `.github/workflows/test-suite-baseline.yml`(matrix 템플릿 → `unresolved`). 강제 workflow의 job
  이름을 **안정 리터럴**로 고정한 Task 5의 요구가 이 계약의 짝이다.
  운영자 수동 설정 후 `node scripts/ci-required-checks.js`가 exit 0.

### Task 9: Linux 측정을 컨테이너에 병합하고 Acceptance 전환을 기록한다

- **Action**: **Task 5의** Linux artifact를 병합한다. 명령의 형태는
  `node scripts/test-suite/run.js --merge-into <컨테이너> --from <내려받은 artifact> --label ci-m3-node20`
  이고 **`--from`이 필수다** — `scripts/test-suite/run.js` L685-686이 `flags.from ? readJsonFile(...) : runOnce({...})`이므로
  그것을 빠뜨리면 러너가 CI artifact가 아니라 **로컬 머신에서 스위트를 다시 돌린 결과**를
  `ci-m3-node20` 라벨로 tracked 증거 컨테이너에 봉인한다. 라벨은 출처 주장이고 데이터는 다른
  호스트의 것이 되어, Task 9 Validate의 3축(ok · attribution · redaction_ok)은 그 오염을 **탐지할 수
  없다**(L2 R21 architect). 이 계획이 다른 모든 자리에서 인자 값을 리터럴로 pin하는 것과 같은 이유다. **Task 0의 artifact는 병합 대상이 아니다** — 정의상 Task 1 이전의 red 측정이고,
  M2 종결이 Linux red 원소 둘의 `redaction_ok`가 `false`임을 실측했으며 `scripts/test-suite/run.js:321-326`이 그런
  원소를 BLOCK한다. 즉 Task 0을 병합 대상으로 두면 Validate가 **만족 불가**가 되고, 그 불가를
  "병합을 안 했다"와 구분할 방법이 없다(L2 R3 test 관점의 지적). Task 0의 역할은 컨테이너 원소가
  아니라 `docs/ci-full-suite/m3-enforcement.md` §1의 **red 집합 기록**이다.
  `--merge-into`가 `redaction_ok !== true`를 거부하므로 병합은 **Task 1이 green을 만든 뒤에만
  성립한다**. 그 순서가 DD3이 옳다는 실증이다.
  M2 종결이 예고한 대로, 병합하는 순간 M2 계획 Acceptance 산출물 1번이 미충족으로 전환된다면
  그것을 **회귀가 아니라 이미 존재하던 상태가 기록에 도달한 것**으로 적는다(UI9).
  `scripts/test-suite/container-check.js`도 여기서 만든다 — 그리고 **짝 test를 함께 만든다**
  (`scripts/tests/container-check.test.js`). 이 milestone이 만드는 다른 스크립트는 전부 짝 test를
  갖는데 이것만 없었고, 원소를 하나도 검사하지 않는 구현(빈 루프·키 오타)도 exit 0을 내므로
  "전 원소가 3축 만족"이라는 판정이 반증 불가였다(L2 R4).
- **Mirror**: `scripts/test-suite/run.js:273-330` `validateElement` — 원소 수용은 fail-closed.
- **Validate**: `node --test scripts/tests/container-check.test.js` — (a) 원소 하나가 `ok:false`면
  비영점 · (b) `attribution`이 `'complete'`가 아니면 비영점 · (c) `redaction_ok !== true`면 비영점 ·
  (d) **빈 컨테이너는 비영점** — 아무것도 검사하지 않은 것이 통과로 읽히지 않게 한다 ·
  (e) 셋 다 만족하는 원소만 있으면 exit 0.
  그 위에 실제 컨테이너로 1회: 병합 후 전 원소가 세 축을 만족하고, 원소 수와 label을 열거해 확인.

### Task 10: 산출 문서와 PRD 갱신, backlog 적재

- **Action**: `docs/ci-full-suite/m3-enforcement.md` — Task 0 red 집합, Task 1 갈래별 판정,
  커버리지 산출 실값, OQ3 결정과 근거, 축 D 실증 증거(run URL), **그리고 "이 문서가 주장하지 않는
  것"** 절. PRD의 milestone 3 status와 지표 1·3·4, OQ3, OQ5를 갱신. 미흡수 finding은 backlog에 적재.
- **Mirror**: `.claude/milestone-closures/ci-full-suite-m2.md` — 조건별 판정 표와 미주장 열거.
- **Validate**: PRD의 OQ3와 OQ5가 `[x]`이고 답이 본문에 있음. 지표 표에 산출된 실값이 있고
  추정이 아님.

## Validation

```bash
# 중간 산출물은 `/tmp`가 아니라 repo-relative `.claude/cache/`에 둔다. 이 계획은 로컬 정본을
# Windows로 선언하는데, 거기서 Git Bash의 `/tmp`는 MSYS 마운트(%TEMP%)로 해소되고 네이티브
# Windows node에 넘긴 리터럴 `/tmp/...`는 `C:	mp...`로 해소되어 **셸과 node가 서로 다른 파일을
# 본다**. Task 6.4가 baseline workflow에서 같은 이유로 `/tmp/enum.txt`를 걷어내면서 이 블록은
# `/tmp`에 의존하고 있었다(L2 R18 test). `.claude/cache/`는 .gitignore L149에 이미 있어 산출물이
# 커밋되지 않는다.
#
# **선행조건 — 검사 4·4a·4b는 커밋된 트리에서 돈다.** 그 셋은 `--revert*` 후
# `git status --porcelain`이 비어 있음을 요구하는데, 이 milestone은 파일 12개를 CREATE하므로
# 구현 중에 돌리면 그 줄이 **복원과 무관한 이유로** FAIL하면서 메시지는 복원 실패를 주장한다 —
# "만족 불가"와 "복원이 실패했다"를 구분할 수 없다(L2 R22 invariant. 형제 검사 5·7·7b는 각각
# 완화 note를 갖는데 이 셋에만 없었다 — 같은 형태를 R9·R15·R19·R21에 걸쳐 네 번 흡수했다).
# 그래서 이 셋은 `## Validation` 전체를 커밋 **뒤에** 한 번 더 돌 때만 판정에 쓴다. 구현 중에
# 돌리려면 `git stash push -u -m "<태그>"`로 트리를 비운 뒤 돌리고 `git stash apply <sha>`로
# 되돌린다(CLAUDE.md의 공유 stash 규약 — bare `git stash`/`pop` 금지).
#
# **이 블록 자신이 fail-closed다.** 앞 라운드까지 여기에는 `set -e`도 집계 종료코드도 없었고
# 마지막 문장이 `... || echo "note: ..."`라, 검사 1·3·3b·5·6·7이 전부 실패해도 블록은 exit 0으로
# 끝났다 — Acceptance의 "Validation passes"가 그 검사들로는 **반증 불가**였다(L2 R23 invariant).
# 이 계획은 같은 규율을 모든 피호출자에게 요구해 놓고(Task 2 (10) "`ok=false`인 모든 분기에서
# CLI가 비영점" · Task 2b (m) "`blocked`가 종료코드에 도달한다") 그것들을 부르는 하네스에는
# 적용하지 않았다. 항상 성공을 보고하는 검증자는 모양만 남은 게이트다.
#
# 그래서 `set -eu`를 켜고, **실패해도 되는 것은 명시적으로만** `|| echo "note: ..."`로 표시하며
# (검사 5 · 7의 `--assert-full` · 7b 셋뿐이고 각각 왜 진단인지 주석이 있다), 블록의 마지막 줄은
# 억제가 아니라 **도달 증거**다 — 중간에서 어디든 중단되면 그 줄에 닿지 못하므로 종료코드가
# 비영점이 된다.
#
# `set -e` 아래에서는 `cmd; RC=$?`가 **cmd에서 중단**되므로 왕복 검사의 rc 포획을 전부
# `RC=0; cmd || RC=$?` 형태로 쓴다. 이것은 문체가 아니라 안전 요건이다 — 절단(`--apply*`)과
# 복원(`--revert*`) 사이에서 중단되면 **잘린 트리가 그대로 남는다**. 같은 이유로 그 구간의
# 모든 명령은 실패 시 복원을 부르는 `|| { <revert>; exit 1; }` 가드를 갖는다.
set -eu
mkdir -p .claude/cache

# 0. 번호 미선언 — 브랜치는 plugin.json version을 선언하지 않는다 (UI3)
node scripts/version-declaration-guard.js --base origin/main --json

# 1. 이 milestone이 만든 도구의 단위 test
MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  scripts/tests/test-suite-coverage.test.js \
  scripts/tests/wiring-cut.test.js \
  scripts/tests/ci-required-checks.test.js \
  scripts/tests/container-check.test.js \
  scripts/tests/test-suite.test.js

# 2p. measurement 생산 — 전수 실행 (Windows 로컬 약 30분). **소비자보다 물리적으로 앞에 둔다.**
#     앞 라운드는 이 줄을 검사 7 자리(약 100줄 아래)에 두고 검사 2에 선행 가드만 걸었는데,
#     `.claude/cache/`는 gitignored라 **깨끗한 트리의 첫 위에서-아래 실행에서는 그 파일이 항상
#     부재**였다. 그러면 라벨은 SKIP인데 동작은 `exit 1`이라 검사 3~7이 아예 실행되지 않고,
#     "만족 불가"와 "안 했다"를 또 구분할 수 없다 — 이 계획이 R9·R15·R19·R21·R22에서 다섯 번
#     흡수한 형태의 **순서 판(版)**이다(L2 R23 invariant). 산문으로 "실제 실행 순서는 7 → 2다"라고
#     적는 대신 줄을 옮긴다 — 번호는 읽는 순서이고, 이제 실행 순서와 같다.
#     `run.js`의 종료코드는 **측정 성립** 여부다(스위트가 red여도 exit 0). 그러므로 이 줄이
#     비영점이면 측정 자체가 실패한 것이고 `set -e`가 여기서 멈추는 것이 옳다.
MCCP_CODEX_DISABLED=1 node scripts/test-suite/run.js \
  --exclude-from .github/test-suite-exclusions.json --json > .claude/cache/m3-local.json
test -s .claude/cache/m3-local.json || { echo "FAIL: 검사 2p가 measurement를 만들지 못했다"; exit 1; }

# 2. 버킷 완전성 — 모든 tracked 파일이 executed/excluded 중 하나이고 unexplained가 0 (DD2)
#    격리 목록을 반드시 함께 넘긴다. 넘기지 않으면 이 검사는 정의상 통과라 아무것도 재지 않는다.
node scripts/test-suite/coverage.js \
  --measurement .claude/cache/m3-local.json \
  --exclude-from .github/test-suite-exclusions.json \
  --floor-from .github/test-suite-floor.json \
  --assert-accounted --json

# 3. 격리 목록 검증 — ticket 필수와 상한 (DD7)
node scripts/test-suite/exclusions.js --check .github/test-suite-exclusions.json
# 배선 단언 — 러너가 exclusions.js를 실제로 거치는가. ticket 없는 목록은 비영점이어야 한다.
# `|| true` 대신 `if !`를 쓴다 — 억제 구문은 단언 1e가 workflow에서 금지하는 클래스이고, 이
# 블록에도 같은 규율을 두는 편이 정직하다(반전 조건은 억제가 아니라 조건문이다).
if node scripts/test-suite/run.js --list \
     --exclude-from scripts/tests/fixtures/exclusions-no-ticket.json >/dev/null 2>&1; then
  echo "FAIL: run.js가 exclusions.js를 거치지 않는다 (DD7 재배선 누락)"; exit 1
fi

# 3b. CI 전용 회귀 — Task 4의 가드가 스위트를 CI에서만 깨뜨리지 않는가 (L2 R8 test).
#      로컬 기본 실행은 GITHUB_ACTIONS가 없어 이 축을 구조적으로 볼 수 없다.
MCCP_CODEX_DISABLED=1 GITHUB_ACTIONS=true node --test --test-concurrency=2 scripts/tests/test-suite.test.js

# 4. 축 D 오라클 왕복 — 배선이 사라지면 붉어진다 (DD5)
#    --revert는 실패 경로에서도 반드시 돈다. exit를 revert 앞에 두면 절단된 파일이 트리에 남는다.
node scripts/test-suite/wiring-cut.js --apply
# 이 구간은 set -e에서도 반드시 --revert에 도달해야 한다 — rc는 포획만 하고 판정은 복원 뒤에.
CUT_RC=0; node --test scripts/tests/wiring-cut.test.js || CUT_RC=$?
node scripts/test-suite/wiring-cut.js --revert
test "$CUT_RC" -ne 0 || { echo "FAIL: 절단했는데 test가 green — 축 D 오라클이 위양성이다"; exit 1; }
node --test scripts/tests/wiring-cut.test.js

# 4a. 절단 A 왕복 — 셋 중 유일하게 어떤 로컬 검사도 왕복시키지 않던 절단이다(L2 R19 test).
#     형제 축(B의 복원)은 R7에서 HIGH로 흡수해 놓고 A에는 같은 규율을 주지 않았다. 재는 것은
#     **절단의 기계**다 — 심은 파일이 index에 실제로 오르는가(안 오르면 git ls-files가 못 봐서
#     스위트가 여전히 green이고, CI run이 '절단이 안 됐다'와 '게이트가 red를 놓쳤다'를 구분하지
#     못한다) · 심은 파일이 격리 패턴에 걸리지 않는가((e5a) — 걸리면 CI 실험이 판정 전에 죽어
#     producer가 사라진다. 형제 축 B는 (e5) 규칙 3을 아래에서 코드로 심었는데 A는 산문뿐이었다:
#     L2 R20 test) · 복원이 흔적을 남기지 않는가.
#     **이 검사가 재지 않는 것**: "심은 red가 실제로 스위트를 red로 만든다"는 명제. measurement가
#     합성이므로 그 값은 절단 결과와 무관하게 red이고, 따라서 stage 1 단언은 게이트가 red fixture를
#     1단계로 판정한다는 것만 재며 그것은 Task 2b 분기 (a)가 이미 순수층에서 덮는다(L2 R20 test).
#     그 명제의 producer는 Acceptance 3-A의 CI run **단독**이고, 로컬은 전수 30분이라 살 수 없다.
#     여기서 로컬이 실제로 사는 것은 **절단의 기계**(index · 격리 회피 · 복원)이며 그것이 없으면
#     CI run이 "절단이 안 됐다"와 "게이트가 red를 놓쳤다"를 구분하지 못한다 — 그것이 이 검사의
#     존재 이유다. 전수 스위트는 돌지 않는다(로컬 30분) — measurement는 4b와 같은 방식으로
#     **합성**하되 이번엔 red다.
RED=$(node scripts/test-suite/wiring-cut.js --apply-red)
git ls-files '*.test.js' | grep -qx "$RED" || { node scripts/test-suite/wiring-cut.js --revert-red; echo "FAIL: --apply-red가 index에 올리지 않았다 — 절단이 무력하다"; exit 1; }
# (e5a) 기계화 — 심은 파일이 격리 패턴에 걸리면 CI 실험의 producer가 사라진다.
node -e 'const fs=require("fs");const en=require("./scripts/test-suite/enumerate.js");const raw=JSON.parse(fs.readFileSync(".github/test-suite-exclusions.json","utf8"));const ex=raw;const r=en.enumerateTests({trackedFiles:[process.argv[1]],exclusions:ex});if(r.excluded.length){console.error("FAIL: 심은 파일이 격리 패턴에 걸린다 — (e5a) 위반");process.exit(1)}' "$RED" || { node scripts/test-suite/wiring-cut.js --revert-red; exit 1; }
node -e 'const fs=require("fs"),cp=require("child_process");const en=require("./scripts/test-suite/enumerate.js");const raw=JSON.parse(fs.readFileSync(".github/test-suite-exclusions.json","utf8"));const ex=raw;const t=cp.execSync("git ls-files -z",{encoding:"utf8"}).split(String.fromCharCode(0)).map(function(s){return s.trim()}).filter(Boolean);const r=en.enumerateTests({trackedFiles:t,exclusions:ex});const red=process.argv[1];const pf=r.included.map(function(f){return {file:f,ok:f!==red}});fs.writeFileSync(".claude/cache/m3-red-in.json",JSON.stringify({ok:true,exit_code:1,redaction_ok:true,files_total:pf.length,per_file:pf,failing:[red],exclusions_digest:en.exclusionsDigest(ex)}))' "$RED" || { node scripts/test-suite/wiring-cut.js --revert-red; exit 1; }
RED_RC=0
node scripts/test-suite/gate.js --measurement .claude/cache/m3-red-in.json \
  --exclude-from .github/test-suite-exclusions.json \
  --floor-from .github/test-suite-floor.json --base-ref HEAD --json > .claude/cache/m3-red.json || RED_RC=$?
node scripts/test-suite/wiring-cut.js --revert-red
test "$RED_RC" -ne 0 || { echo "FAIL: 스위트가 red인데 게이트가 통과 — DD3 1단계가 죽었다"; exit 1; }
node -e 'const j=JSON.parse(require("fs").readFileSync(".claude/cache/m3-red.json","utf8")); if(j.stage!==1||!(j.reasons||[]).includes("suite_red")){console.error("FAIL: stage="+j.stage+" reasons="+JSON.stringify(j.reasons)+" — 1단계가 아니라 다른 이유로 죽었다");process.exit(1)}'
test -z "$(git status --porcelain)" || { echo "FAIL: --revert-red가 트리에 흔적을 남겼다"; exit 1; }

# 4b. 절단 B 왕복 — 삭제 복원이 어떤 검사에도 걸리지 않던 구멍을 닫는다 (L2 R7 invariant).
#     붉어야 하는 것은 오라클이 아니라 **게이트**다 — B는 배선이 아니라 분모를 건드린다.
#     "비영점"만 보면 판별력이 없다: measurement 부재로도 게이트는 fail-closed로 비영점이므로
#     stage 번호를 단언한다(L2 R8 test — 축 A에서 흡수한 것과 같은 형태다).
#     --apply-delete는 index까지 반영한다(git rm). worktree만 지우면 git ls-files가 여전히 세어
#     집합 차가 비고, 이 검사는 이유 없이 통과한다(L2 R8 invariant).
#
#     measurement는 **합성 green**이다. 검사 7의 실제 산출(.claude/cache/m3-local.json)을 쓰면 이 계획이
#     정상으로 선언한 상태(Windows 전용 red 잔존 — 검사 7b 주석)에서 게이트가 stage 1 suite_red로
#     단락해 reasons에 deleted_without_allowance가 실릴 수 없고, 4b는 **구성상 항상** hard-fail한다
#     — "만족 불가와 안 했다를 구분할 수 없다"의 세 번째 재현이었다(L2 R15 — invariant HIGH와 test
#     독립 지목). 7b처럼 완화 분기를 두는 것은 답이 아니다: 그러면 삭제 래칫의 유일한 로컬 반증
#     수단이 정상 환경에서 조용히 꺼진다. 삭제 래칫은 stage 2 관심사이고 green 스위트를 필요로
#     하지 않으므로, **트리는 실제로 자르고 measurement만 합성한다** — 그러면 이 검사는 어느
#     플랫폼에서도 만족 가능하고 재는 것이 정확히 래칫 하나다. 합성은 자른 **뒤**에 만든다
#     (전이면 measured − tracked ≠ ∅ 이라 stage 0 measurement_tree_mismatch로 죽는다).
# 대상은 allow_deletions에 없어야 한다 — 있으면 면제되어 잴 것이 없고 4b가 거짓 red가 된다
# (Task 7 (e5) 규칙 3. 규칙 1·2는 로컬에 안 걸린다: 스위트를 돌지 않으므로 비순환성이 무의미하고,
#  래칫은 격리 여부와 무관하게 경로 집합 차만 보므로 격리 패턴 매치도 무해하다. L2 R16 invariant).
DEL=$(node -e 'const fs=require("fs"),cp=require("child_process");const f=JSON.parse(fs.readFileSync(".github/test-suite-floor.json","utf8"));const ex=new Set((f.allow_deletions||[]).map(function(e){return e.path}));const t=cp.execSync("git ls-files -z",{encoding:"utf8"}).split(String.fromCharCode(0)).map(function(s){return s.trim()}).filter(function(s){return s.endsWith(".test.js")&&!ex.has(s)});if(!t.length){process.stderr.write("no eligible deletion target");process.exit(1)}process.stdout.write(t.sort()[0])')
node scripts/test-suite/wiring-cut.js --apply-delete "$DEL"
# 합성 green measurement — 자른 뒤의 tracked 집합에서 만든다. stage 0/1을 통과시켜 판정이
# 실제로 stage 2에 도달하게 하는 것이 목적이고, 이 검사가 재는 것은 그 한 축뿐이다.
node -e 'const fs=require("fs"),cp=require("child_process");const en=require("./scripts/test-suite/enumerate.js");const raw=JSON.parse(fs.readFileSync(".github/test-suite-exclusions.json","utf8"));const ex=raw;const tracked=cp.execSync("git ls-files -z",{encoding:"utf8"}).split(String.fromCharCode(0)).map(function(s){return s.trim()}).filter(Boolean);const r=en.enumerateTests({trackedFiles:tracked,exclusions:ex});const pf=r.included.map(function(f){return {file:f,ok:true}});fs.writeFileSync(".claude/cache/m3-del-in.json",JSON.stringify({ok:true,exit_code:0,redaction_ok:true,files_total:pf.length,per_file:pf,exclusions_digest:en.exclusionsDigest(ex)}))' || { node scripts/test-suite/wiring-cut.js --revert-delete; exit 1; }
DEL_RC=0
node scripts/test-suite/gate.js --measurement .claude/cache/m3-del-in.json \
  --exclude-from .github/test-suite-exclusions.json \
  --floor-from .github/test-suite-floor.json --base-ref HEAD --json > .claude/cache/m3-del.json || DEL_RC=$?
node scripts/test-suite/wiring-cut.js --revert-delete
test "$DEL_RC" -ne 0 || { echo "FAIL: 삭제했는데 게이트가 통과 — DD9 삭제 래칫이 죽었다"; exit 1; }
# stage 번호는 판별자가 아니다(2단계는 커버리지 실패와 공유한다). 사유 코드를 단언한다.
node -e 'const j=JSON.parse(require("fs").readFileSync(".claude/cache/m3-del.json","utf8")); if(!(j.reasons||[]).includes("deleted_without_allowance")){console.error("FAIL: reasons="+JSON.stringify(j.reasons)+" — 삭제 래칫이 아니라 다른 이유로 죽었다");process.exit(1)}'

# 두 왕복이 트리에 흔적을 남기지 않았는가. index 변경까지 보려면 diff가 아니라 status다.
test -z "$(git status --porcelain)" || { echo "FAIL: 절단 복원이 트리에 흔적을 남겼다"; exit 1; }

# 5. required check drift 진단 (DD6 — 운영자 수동 설정 이후)
#    **이것은 게이트가 아니라 진단이다.** branch protection이 아직 설정되지 않은 상태(= Task 8
#    이전, 이 계획이 정상으로 선언한 상태)에서는 drift가 보고되는 것이 **정상**이므로 비영점을
#    블록으로 읽지 않는다. 앞 라운드는 형제 검사(7·7b)가 갖는 완화 분기를 여기에만 두지 않아,
#    Acceptance의 "Validation passes"가 축 C의 수동 단계 전에는 **구성상 달성 불가**였고
#    "만족 불가"와 "안 했다"를 구분할 수 없었다 — 이 계획이 R9·R15·R19에서 세 번 흡수한 형태의
#    네 번째 재현이다(L2 R21 test). Task 8 **이후**의 exit 0 요구는 그 Task의 Validate가 진다.
node scripts/ci-required-checks.js --json || echo "note: branch protection 미설정이면 drift가 정상이다 — exit 0은 Task 8 이후에 요구된다"

# 6. 컨테이너 무결성 — 전 원소가 세 축을 만족 (Task 9)
node scripts/test-suite/container-check.js .claude/_meta/data/2026-09-01-suite-baseline.json

# 7. 전수 커버리지 진단 — 측정은 검사 2p가 이미 만들었다(여기서 다시 돌리지 않는다).
#    --assert-full은 게이트가 아니라 "지금 100퍼센트인가"를 묻는 로컬 진단이며, 격리가 있으면
#    비영점인 것이 정상이다. 그래서 이 호출에는 --floor-from이 없다 — DD9 1번의 fail-closed는
#    --assert-accounted에만 걸린다(검사 2와 아래 7b가 그것을 검증한다).
node scripts/test-suite/coverage.js --measurement .claude/cache/m3-local.json \
  --exclude-from .github/test-suite-exclusions.json --assert-full || \
  echo "note: 100퍼센트 미만 — 격리 항목이 있다는 뜻이고 게이트 차단 사유가 아니다 (DD2)"

# 7b. 게이트가 실제로 부르는 판정을 로컬에서 한 번 — workflow의 그 한 줄과 같은 형태다 (DD3).
#     3축(green → coverage → redaction)이 이 명령 안에서 순서대로 평가된다. 검사 2는 2축만
#     보므로 이것이 게이트와 등가인 유일한 로컬 호출이다. 입력은 검사 2p의 산출이며 **번호가
#     곧 실행 순서다**(R23에서 producer를 물리적으로 앞으로 옮겼다).
#     **Windows 로컬에서는 통과하지 않을 수 있다.** DD8이 Windows 전용 red를 가능한 상태로
#     두고 그 판정을 Task 6(측정 후)으로 미루므로, 1단계가 여기서 막히는 것은 정상이다 — 검사 7이
#     같은 상황을 note로 허용하는 것과 대칭이며, 앞선 라운드는 7b에만 완화 분기를 두지 않아
#     비대칭이었다(L2 R9 test). 정본 판정은 Task 5 이후 Linux CI가 낸다.
node scripts/test-suite/gate.js \
  --measurement .claude/cache/m3-local.json \
  --exclude-from .github/test-suite-exclusions.json \
  --floor-from .github/test-suite-floor.json --base-ref HEAD || \
  echo "note: 로컬 게이트 차단 — Windows 전용 red가 남아 있으면 정상이다. 정본은 Linux CI (DD8·Task 6)"

# 도달 증거 — 억제가 아니라 이 줄에 **닿았다**는 사실이 블록의 exit 0이다. 위 어디서든
# 중단되면 여기 못 오고 종료코드가 비영점이 된다.
echo "VALIDATION OK — fail-closed 검사 전부 통과 (5·7·7b는 진단이라 note로 지난다)"
```

> 검사 6의 `container-check.js`는 Task 9가 함께 만드는 얇은 확인 스크립트다. 인라인 `node -e`로
> 두지 않는 이유는 이 저장소의 셸 경로가 인용 부호를 신뢰할 수 없게 다루기 때문이고(이 계획을
> 쓰는 동안 실측), 검증 명령이 인용 때문에 조용히 안 도는 것은 게이트 모양만 남은 게이트다.

## Multi-Perspective Fan-out

<!-- Auto-injected by /mccp:plan Phase 2.5 fan-out (read-only). -->

**Coverage**: 4/4 perspectives (architect, security, test, explorer) · spent ~45k.

### Findings (severity-ranked)

- **[CRITICAL][test]** Three Linux-only red files remain unresolved at M2 close, and Risk table row 1 requires flaky=0 before axis C (enforcement) is entered — M3 cannot flip CI to merge-blocking without first closing or explicitly quarantining these. — PRD L103 Risks table: "M1이 flaky를 먼저 판정한다(동일 커밋 3회). 축 C 진입 전 flaky 0이 전제다." + closure L162-176 lists 3 real Linux reds (`dispatch-fullcycle-smoke` node20-only, `mask`, `santa-loop-cap`) still unquarantined.
- **[CRITICAL][explorer]** Existing workflows all declare `paths:` filters that narrow trigger scope — M3's coverage-100% goal is structurally undermined if the new enforcement workflow also uses a narrow `paths:` filter (same failure mode the PRD Problem section blames for today's 2.7% effective rate). The plan must either use no `paths:` filter or a deliberately broad one, mirroring .github/workflows/env-contract-drift.yml's stated rationale for going broad. — PRD Evidence: '세 workflow 모두 pull_request.paths: 필터를 갖고... GitHub은 매치가 없으면 workflow를 통째로 건너뛴다'; .github/workflows/env-contract-drift.yml:12-21 explains why its filter is deliberately wide for the same reason.
- **[HIGH][architect]** M3의 완료 조건(커버리지 100%)이 아직 분모를 정의하지 않은 채 남아 있다 — Open Question 4가 미해결(`[ ]`)인 채로 Success Metrics #1이 '100%'를 요구한다. 세 후보(파일 수/케이스 수/미실행 파일 0)가 서로 다른 자동화 설계(단순 diff-count vs test-case-level attribution)를 요구하므로, M3 plan이 이 결정 없이 시작하면 재작업 리스크가 있다. — PRD L97 '커버리지 100%의 분모는 무엇인가... 셋의 값이 다르고 세 번째만 자동 산출이 쉽다' — 미해결 Open Question
- **[HIGH][architect]** 축 D(배선 절단 음성 통제)는 '실증 1회'로 기술되어 있어 반복 가능한 회귀 게이트가 아니라 일회성 이벤트로 읽힌다. 이 축이 CI 파이프라인의 상시 검증(예: 커버리지 산출 로직 자체의 self-test)으로 재현되지 않으면, 커버리지 100%가 미래에 다시 깨져도(새 workflow가 paths 필터로 조용히 스위트를 빠뜨림) 잡아낼 기계가 없다 — PRD가 스스로 지목한 '기계는 만들어지고 부르는 한 줄이 빠진다' 실패모드를 M3 자신이 반복할 위험. — PRD L54 'D. 실증(음성 통제)... 1회 확인' / L63 '1회 실증' — 반복성 미명시
- **[HIGH][security]** .github/workflows/test-suite-baseline.yml runs the entire tracked test suite (368 files, including files added by the incoming PR) on `pull_request` trigger without `permissions:` restricting to least-privilege beyond `contents: read`, and without pinning actions by SHA — for M3's planned CI-enforcement workflow (which per PRD will run the same full suite and gate merges via branch protection), a PR from a fork can add/modify a `*.test.js` file that executes arbitrary code inside the runner. Because the suite globs all tracked test files (`git ls-files '*.test.js'`), this is a de-facto arbitrary-code-execution trigger on every PR, mitigated today only by `contents: read` + `persist-credentials: false`. — .github/workflows/test-suite-baseline.yml:33-42 (`on: pull_request` + `permissions: contents: read`) and :68-71 (`persist-credentials: false` comment explicitly documents GITHUB_TOKEN leak risk as HIGH: 'security-reviewer S2, HIGH')
- **[HIGH][test]** The M2 closure discovered that `redaction_ok` is NOT independent of test greenness — a single unrelated red test whose assertion diff contains a drive-letter-shaped fixture string flips `redaction_ok:false` for the whole run. If M3 wires `redaction_ok` into a merge-blocking check without first decoupling it from `ok`, any unrelated red test will also fail the leak gate, destroying signal. — .claude/milestone-closures/ci-full-suite-m2.md L154-160: "드러난 것은 결함이 아니라 결합이다: `redaction_ok`는 test greenness와 독립이 아니다 ... M3이 이 측정을 merge-gating으로 승격시키기 전에 닫아야 한다 — 아니면 무관한 test 하나가 붉어질 때마다 유출 게이트가 함께 붉어져 신호가 죽는다."
- **[HIGH][test]** Success Metric 4 (axis D, wiring-cut negative control) requires '1회 실증' but the PRD gives no concrete oracle for what the demonstration asserts (which wiring is cut, what CI check must go red, what proves it happened vs was merely described). — PRD L63: "의도적 배선 제거 → red 확인" — no target artifact, no assertion, no script named. Risk table L106 repeats the goal without a mechanism.
- **[HIGH][test]** Coverage-100% denominator is an explicit unresolved Open Question (file count vs test-case count vs 'zero unexecuted files'); a plan that doesn't pin this oracle before writing the CI check produces an unfalsifiable or gameable metric. — PRD L97: "커버리지 100%의 분모는 무엇인가. ... 셋의 값이 다르고 세 번째만 자동 산출이 쉽다." — unchecked, still open.
- **[HIGH][explorer]** M3 (ci-enforcement) must reuse `scripts/test-suite/run.js` as the entrypoint — it already supports `--exclude-from <json>` (quarantine list) and `--list` (enumeration for coverage-denominator checks). A plan that reinvents a runner or writes a new enumeration/exclusion mechanism duplicates this. — scripts/test-suite/run.js:666-679 (`flags['exclude-from']` → `readJsonFile`, `flags.list` → prints `enumerated.included`); scripts/test-suite/enumerate.js:55-137 `normalizeExclusions`/`applyExclusions` already implement pattern+reason quarantine entries.
- **[HIGH][explorer]** The M2 closure explicitly left flaky quarantine unimplemented as a formal mechanism — flaky files are only 'recorded, not resolved' (UI4/UI5), and `--exclude-from` exists in code but no quarantine JSON file/list is checked in yet. M3's Risk table requires 'flaky 0 전제' before enforcement; the plan must either create that quarantine list file (reusing `--exclude-from`'s schema) or explicitly decide enforcement proceeds without one. — PRD line 103: 'M1이 flaky를 먼저 판정한다... 격리는 삭제가 아니라 명시 quarantine 목록 + 티켓'; closure .claude/milestone-closures/ci-full-suite-m2.md:88 'post-edit-format-md`는 원인 귀속이 불가한 상태로 남는다'; scripts/test-suite/enumerate.js exclusions shape `{pattern, reason}` is ready-made for this.
- **[MEDIUM][architect]** branch protection(축 C의 절반)은 저장소 설정이라 파일로 표현 불가능하다고 PRD와 두 기존 workflow 주석이 명시하는데, M3 plan이 이를 '1회 수동 설정'으로 Acceptance에 넣을 구조적 계약(누가/언제/어떻게 검증하는지)을 세우지 않으면 '완료'가 검증 불가능한 사람 기억에 의존한다. — .github/workflows/env-contract-drift.yml:27-29 'Making that red block a merge is a repository setting... and cannot be expressed in a repo file.' / PRD L33, L53, L80
- **[MEDIUM][architect]** 기존 4개 workflow가 각자 다른 `paths:` 필터·trigger 조합(narrow vs broad)을 갖고 있고, M3가 '전 PR 게이트'로 확장할 때 .github/workflows/test-suite-baseline.yml의 파일-단위 measurement job을 그대로 승격할지, 신규 enforcement job을 별도로 만들지에 대한 경계가 PRD에 없다 — 두 workflow가 같은 스위트를 다른 트리거로 각자 실행하면 중복 실행/이중 유지보수 결합이 생긴다. — .github/workflows/test-suite-baseline.yml:33-38 (measurement, continue-on-error) vs PRD L60 'PR 체크 → 미달 시 머지 차단' (enforcement) — 두 책임이 같은 파일에 있을지 분리될지 미정
- **[MEDIUM][architect]** Windows runner를 전수 matrix에 넣을지의 Open Question이 M2에서 재-오픈된 채 M3에 상속됐다('M3 소유'로 명시) — 이 결정이 M3 plan 첫 단계에서 확정되지 않으면 축 B/C(벽시계 임계, 커버리지 분모)가 OS 축 유무에 따라 다시 흔들린다(구조적 선행 의존). — PRD L95 'M2가 이 질문을 다시 열었다(답하지 않는다 — M3 소유)'
- **[MEDIUM][security]** The PRD's M3 scope (CI enforcement + branch protection) does not mention `permissions:` minimization, action pinning (SHA vs tag), or the fork-PR secret-exposure model as acceptance criteria — only coverage % and branch-protection existence. If the M3 plan mirrors .github/workflows/test-suite-baseline.yml's trigger model into a merge-blocking workflow, it inherits the same 'arbitrary PR-controlled code runs with a live GITHUB_TOKEN in scope' surface, but now the outcome (red/green) also gates merges, raising the incentive for an attacker to manipulate CI status via crafted test files. — PRD Scope §Delivery Milestones row 3: 'CI가 전수를 실행하고 커버리지 100%가 자동 산출되며 branch protection이 red를 머지 차단으로 만든다' — no mention of secrets/permissions/fork-PR threat model
- **[MEDIUM][security]** scripts/test-suite/redact.js's own header documents that its POSIX secret/path scrubbing is enumeration-based, not exhaustive ('전수는 아니다'), and lists multiple known-uncovered leak axes (Map/Set/Error/toJSON traversal, shallow-root over-redaction, UNC paths, percent-decoding) still open in the findings backlog. If M3's enforcement workflow uploads artifacts unconditionally (`if: always()`) for a merge-gating suite the same way M1's baseline workflow does, any of these documented gaps become a live secret/PII leak into a publicly-downloadable CI artifact on every PR, not just a measurement run. — scripts/test-suite/redact.js:138-162 ('이 목록은 exhaustive하지 않다 … RESIDUAL_PATTERNS 주석의 backlog 목록에 있다') combined with .github/workflows/test-suite-baseline.yml:95-101 (`if: always()` artifact upload of raw JSON output)
- **[MEDIUM][security]** PRD explicitly places 'branch protection 정책 설계 (어떤 상태 체크를 필수로 걸지)' out of scope for M3, and Success Metric axis C treats 'branch protection 1회 설정' as a manual, non-file-expressible step. This leaves a real gap: if the required-status-check is misconfigured (e.g., made non-required, or matched against a stale/renamed workflow job name), CI enforcement becomes silently decorative while the PRD's own Success Metrics report 100% coverage — a false sense of gating with no mechanical check catching drift between the workflow's job name and the branch-protection required-check string. — PRD Out of scope: 'branch protection 정책 설계 — 설정 1회는 축 C에 포함하지만, 어떤 상태 체크를 필수로 걸지의 정책 논의는 하지 않는다.' and Hypothesis 판정 순서 표 row C: '파일로 표현 가능한 부분과 저장소 설정이 나뉘므로 완료 조건에 수동 1회가 들어간다'
- **[MEDIUM][test]** Branch protection / merge-block enforcement is explicitly un-representable as a repo file and requires a manual one-time setting — any Validation step claiming to 'prove axis C' via git diff or file content alone cannot prove actual blocking behavior; needs a captured evidence artifact (API read / screenshot), and no precedent test convention for that evidence type exists in this repo. — PRD L33: "CI red를 머지 차단으로 만드는 것은 저장소 설정이지 파일이 아니다 ... branch protection / ruleset은 repo 파일로 표현 불가하다." + .github/workflows/test-suite-baseline.yml L6-9: "여기서 red가 나도 아무것도 막지 않는다 ... branch protection은 전부 M3 소유".
- **[MEDIUM][test]** `post-edit-format-md` flaky (found in M2) cannot be root-caused by the current reporter, which drops `nesting !== 0` events — if M3's enforcement work re-triggers this flake under a merge-blocking gate, there is no diagnostic path to distinguish real regression from the known unattributable flake. — .claude/milestone-closures/ci-full-suite-m2.md L88-90: "reporter가 `nesting !== 0` 이벤트를 버려 어느 단언이 깨졌는지 산출에 남지 않으며, 그 공백은 별도 축으로 backlog에 등재돼 있다."
- **[MEDIUM][test]** The Windows-runner-matrix question (OQ3) is explicitly re-opened by M2 and left for M3 — plan should include re-measuring win∩linux failure intersection after the gitDir-isolation fix, or risks encoding a stale platform assumption into the enforcement gate. — PRD L95: "M2가 이 질문을 다시 열었다(답하지 않는다 — M3 소유). ... 그 갈래를 걷어낸 뒤의 교집합으로 다시 물어야 한다."
- **[MEDIUM][explorer]** `.github/workflows/test-suite-baseline.yml` is a measurement-only workflow (`continue-on-error: true`) explicitly scoped OUT of enforcement by its own header comment — M3 should not repurpose this file in place; the closest analog pattern for enforcement (fail-closed CI + branch protection note) is `.github/workflows/env-contract-drift.yml` and `.github/workflows/gitignore-drift.yml`, which the plan should mirror rather than the baseline workflow. — .github/workflows/test-suite-baseline.yml:6-9 '이 workflow는 측정이다. 강제가 아니다... 전 PR 적용 범위 · 커버리지 산출 · branch protection은 전부 M3 소유'; .github/workflows/env-contract-drift.yml:27-29 'Scope note: this workflow guarantees the lint RUNS and goes red on drift. Making that red block a merge is a repository setting... and cannot be expressed in a repo file.'
- **[MEDIUM][explorer]** Windows-runner-in-matrix question (Open Question 2) is explicitly deferred to M3 ('M3 소유') and is unresolved — the plan must either answer it or explicitly re-defer, since `.github/workflows/test-suite-baseline.yml` only runs `ubuntu-latest` (no Windows) while M2 found Windows failures were largely `gitDir` isolation bugs, not platform bugs. — PRD line 95: 'M2가 이 질문을 다시 열었다(답하지 않는다 — M3 소유)'; .github/workflows/test-suite-baseline.yml:46 `runs-on: ubuntu-latest` only.
- **[MEDIUM][explorer]** Axis D (wiring-cut negative control) has no existing implementation pattern in the codebase to reuse — no prior workflow performs a deliberate-break-then-verify-red self-test. The plan needs to invent this from scratch, unlike axes A-C which have direct precedent (scripts/test-suite/run.js, .github/workflows/env-contract-drift.yml enforcement pattern). — PRD Success Metrics #4: '배선 절단 탐지 (음성 통제)... 미측정 → 1회 실증'. Grep across scripts/test-suite/ and .github/workflows/ found no analog for a self-verifying negative-control CI step.
- **[LOW][architect]** artifact 이름(`test-suite-baseline-node${{matrix.node}}`)이 measurement/validation 사이의 유일한 결합 계약인데, 이는 코드가 아닌 문자열 리터럴 합의라 M3가 같은 패턴으로 enforcement job의 산출물을 소비하면 동일한 암묵 결합(스키마 없는 artifact-name coupling)이 확장된다. — .github/workflows/test-suite-baseline.yml:91-94 'artifact 이름은 계약이다: Validation의 gh run download --name test-suite-baseline-node20이 이 이름에 의존한다'
- **[LOW][security]** .github/workflows/version-declaration-gate.yml omits an explicit `permissions:` block (unlike .github/workflows/test-suite-baseline.yml, which explicitly sets `contents: read`), so it runs with the repository/org default token scope on `pull_request` events. If the M3 workflow is authored by copying this workflow's shape rather than .github/workflows/test-suite-baseline.yml's, it will silently inherit broader-than-necessary token permissions. — .github/workflows/version-declaration-gate.yml:26-46 — no `permissions:` key present, contrasted with .github/workflows/test-suite-baseline.yml:40-41 `permissions:\n  contents: read`
- **[LOW][test]** Existing test-suite scripts have a dense unit-test mirror asserting pure functions with synthetic inputs rather than live flaky fixtures — any new M3 code (coverage-denominator calc, branch-protection check, wiring-cut demo harness) should follow the same isolation pattern instead of relying on live CI runs for validation. — scripts/tests/test-suite.test.js L1-14: "판정 축은 합성 입력으로 단언하고, 실제로 흔들리는 fixture를 스위트에 심지 않는다." — 11 numbered branches each targeting a specific silent-failure mode (DD8: 'runner가 조용히 틀릴 수 있는 유일한 방향은 실행되지 않았는데 통과로 읽힘').
- **[LOW][test]** `--merge-into` already rejects elements with `redaction_ok !== true` (a closed fail-closed invariant) — M3's coverage/enforcement tooling should reuse this container/element validation pattern rather than re-implementing ad hoc validation for any new CI-summary artifact. — scripts/test-suite/run.js L18-21: "`--merge-into`는 `redaction_ok !== true`인 원소를 거부한다. 이것이 원장 b52ca84d / 64a79560(\"불변식이 표시만 하고 차단하지 않는다\")의 닫힘이다."
- **[LOW][explorer]** No root `package.json`/npm script exists as a wiring point — CLAUDE.md and PRD confirm the only entrypoint is `scripts/test-suite/run.js` invoked directly via `node`. Any M3 plan step referencing `npm test` or `npm run <suite>` would be inventing a surface that doesn't exist and isn't in scope (PRD explicitly notes two stray `package.json` files with a broken `test` script that should not be treated as prior art to fix). — PRD Evidence line 24: 'npm script로 전수를 도는 경로는 여전히 없고... `"test": "node --test tests/"`... 그 형태는 디렉토리 인자라 Node 24에서 죽는다'.

### Meta-gaps

- M3 plan이 아직 작성되지 않아 draft 자체에 대한 구조 평가는 불가 — 위 findings는 PRD와 기존 workflow 구조에서 M3가 반드시 결정해야 할 경계로 소급 도출한 것.  _(architect)_
- PRD에 'M3가 .github/workflows/test-suite-baseline.yml을 대체하는지 별도 워크플로로 병존시키는지'에 대한 명시 결정이 없다 — measurement(M1 소유, continue-on-error) vs enforcement(M3, 머지 차단)의 소유 경계 명문화가 빠져 있다.  _(architect)_
- 커버리지 100% 산출 로직 자체의 정확성을 누가 검증하는가(그 산출 스크립트가 out-of-scope 파일을 은닉 누락시키면 100%가 거짓일 수 있다)에 대한 셀프-테스트 요구가 Success Metrics에 없다.  _(architect)_
- PRD Scope/Acceptance for M3 has no explicit threat model for fork PRs (untrusted code execution during full-suite CI run) — the draft plan should state whether fork PRs are in-scope for the enforcement workflow and, if so, require `permissions: contents: read` (or narrower) + no `persist-credentials` + no secrets in env for every new/reused job.  _(security)_
- No mention in PRD of action-pinning policy (tag vs commit SHA) for `actions/checkout`, `actions/setup-node`, `actions/upload-artifact` — supply-chain risk for a merge-blocking workflow is higher than for a measurement-only one, and this axis is entirely unaddressed.  _(security)_
- PRD's axis D (음성 통제 — wiring-cut detection) validates that CI catches removed wiring, but does not validate that CI cannot be *tricked* into reporting green (e.g., a test file that catches/swallows its own failure, or an artifact-tampering path) — no negative control for gate-forgery is specified.  _(security)_
- No requirement to verify that the M3 job name referenced by GitHub branch-protection 'required status checks' stays in sync with the workflow file (a rename/refactor of the job id silently un-gates the branch) — this is exactly the class of 'machine built, one line to call it missing' failure the umbrella PRD itself warns about (line 13), yet M3's own required-check wiring is not test-guarded.  _(security)_
- No draft plan exists yet for M3 — this fan-out ran against the PRD alone, so findings are PRD-level gaps rather than plan-task-level Validation critiques.  _(test)_
- PRD gives no explicit shape for M3's own new code (coverage script, branch-protection verifier, wiring-cut demo) so testability cannot be assessed task-by-task; the planning session must fix module boundaries before concrete 'Validate' steps can be named.  _(test)_
- PRD does not say how the wiring-cut negative control (axis D) will be reverted after its one-time demonstration — a plan needs an explicit revert step or the intentional breakage becomes permanent scope creep.  _(test)_
- PRD Out-of-scope excludes rewriting tests and fixing mkTmpRepo, but does not clarify whether M3 may add *new* thin unit tests for its own tooling (coverage-denominator function etc.) — should be stated explicitly to avoid the broad 'no new tests' framing being misapplied.  _(test)_
- PRD does not specify which of the two existing `package.json` files (if either) or the new `scripts/test-suite/run.js` entrypoint should be wired into `npm test`/root scripts, if at all — plan should state explicitly whether root package.json creation is in/out of scope for M3.  _(explorer)_
- No plan draft exists yet to check against; findings here are pre-plan reuse guidance only.  _(explorer)_
- PRD Open Question on coverage-100% denominator (`*.test.js` file count vs case count vs 'zero unrun files') is unresolved and directly determines what the M3 CI check computes — plan must pick one and the choice should reuse `scripts/test-suite/run.js --list` output (file-level) since that's the only enumerator that already exists.  _(explorer)_
- No branch-protection-as-code exists in repo (by design, per Out of Scope) — plan must include an explicit manual step / runbook note, not a file change, consistent with axis C's stated single manual action.  _(explorer)_

### Patterns to mirror

- .github/workflows/env-contract-drift.yml:1-34의 주석 구조 — WHY THIS FILE EXISTS / trigger 폭 근거 / scope note(측정 vs 강제 분리) / receipt 게이트 비연동 명시 — M3 신규 workflow도 같은 4단 주석 계약을 따르면 소유 경계가 코드 옆에 남는다.  _(architect)_
- .github/workflows/test-suite-baseline.yml:19-25 'run 성공은 증거가 아니다' 패턴 — continue-on-error + artifact-content 검증 분리는 M3의 enforcement job에도 그대로 적용 가능한 fail-closed 검증 관례.  _(architect)_
- PRD L108 '커버리지는 비율이라 분모 이동에 안정적이다. 진입점이 glob이면 새 파일이 자동 포함된다' — 병렬 자식(C1/C2/C4)의 신규 test 추가에 대한 자동 포함 설계는 이미 결정돼 있으므로 M3는 이 전제를 재확인만 하면 됨.  _(architect)_
- scripts/test-suite/redact.js — dual-layer redaction (substitution + fail-closed residual scan) that treats a partial match as *worse* than no match, and never echoes raw matched secret text back into diagnostic output (only length/rule name). Good pattern for any M3 artifact/log surface that might carry PR-controlled data.  _(security)_
- .github/workflows/test-suite-baseline.yml:60-71 — explicit `persist-credentials: false` + documented rationale for why default credential persistence is dangerous on `pull_request`-triggered jobs that execute repo-tracked test code; M3's enforcement workflow should carry the same setting and rationale forward verbatim.  _(security)_
- .github/workflows/version-declaration-gate.yml:14-19 and .github/workflows/gitignore-drift.yml (referenced) — comment convention documenting *why* the `paths:` filter list is the necessary-and-sufficient input set, preventing silent gate dead-code from an incomplete filter; M3 should apply the same discipline if it reuses `paths:` filtering anywhere.  _(security)_
- .github/workflows/test-suite-baseline.yml:19-25 — explicit written invariant that 'run success ≠ evidence'; acceptance is verified against artifact *content* (`ok`, `attribution`, `redaction_ok`) rather than job exit status, because `continue-on-error` + `if: always()` can mask an empty artifact as success. M3's CI-enforcement job must not fall into the same trap when treating job status as the merge-block signal.  _(security)_
- scripts/tests/test-suite.test.js — numbered-branch unit tests targeting specific silent-failure modes, synthetic fixtures only, with spawn-based branches isolated and explicitly marked as the deliberate exception.  _(test)_
- scripts/test-suite/run.js validateElement + LABEL_RE + mergeIntoContainer — fail-closed container/element validation pattern for any new merged-measurement artifact.  _(test)_
- .github/workflows/test-suite-baseline.yml header comments — explicit 'measurement vs enforcement' scope-note pattern stating what continue-on-error hides and where authoritative judgment happens (artifact content, not run status); M3 should carry the same explicit split when flipping to real enforcement.  _(test)_
- .claude/milestone-closures/ci-full-suite-m2.md closure structure — 조건별 판정 표 + '이 종결이 주장하지 않는 것' 절 — good precedent for M3's own closure to avoid rounding partial coverage/enforcement up to 'done'.  _(test)_
- scripts/test-suite/run.js:666-721 — CLI flag pattern (`--list`, `--exclude-from`, `--merge-into`, JSON stdout) for wiring new CI enforcement calls.  _(explorer)_
- .github/workflows/env-contract-drift.yml:36-46 — broad `paths:` filter rationale + two-step verification (lint against real tree + unit tests against fixtures) as the enforcement-workflow template to mirror for M3.  _(explorer)_
- .github/workflows/gitignore-drift.yml (referenced as 'mirror' by .github/workflows/test-suite-baseline.yml:5) — scope-note comment convention distinguishing measurement vs. enforcement, to reuse verbatim in the new M3 workflow's header comment.  _(explorer)_
- .github/workflows/test-suite-baseline.yml:91-101 — `if: always()` artifact upload pattern for surfacing measurement JSON even on failure; M3's coverage-check job should follow the same artifact contract if it needs post-hoc audit.  _(explorer)_
- scripts/test-suite/enumerate.js:55-137 `{pattern, reason}` exclusion schema — reuse verbatim as the shape for any new flaky-quarantine list file rather than inventing a new schema.  _(explorer)_

## Design Critique

detector: `design_signal=true` · signal file `plugins/mccp/scripts/derive/tests/mask.test.js`
(narrow whitelist axis b — a control-plane test file, not a rendered surface).

critique retry loop: **round 0 / cap 2 · verdict CONVERGED**. Anchor-by-anchor:

| Anchor | Result | Evidence |
|---|---|---|
| 1. 정보 위계 3단계 (heading depth <= 3) | pass | H1 1 · H2 13 · H3 23 · **H4+ 0** (재측정, 코드 펜스 제외) |
| 2. 강조색 화면당 1개 | pass (vacuous) | 0 colour tokens — a markdown plan has no viewport |
| 3. raw markdown marker 금지 | pass | 0 MD0xx warnings, 0 stray HTML entities |
| 4. 한 화면 항목 수 상한 | **MEDIUM finding** | `### Findings (severity-ranked)` carries 27 flat bullets |

The anchor-4 finding is **not fixable by this plan author**: Phase 2.5.3 mandates that the
fan-out markdown be injected *verbatim* so that `plan_hash` carries the fan-out's actual
output. Collapsing it here would break that contract. This is the already-triaged conflict
recorded in `.claude/plans/codex-findings-backlog.md` (2026-09-02, MEDIUM) whose resolution
candidates are owned by `workflows/plan-fanout.js` synthesize, not by this milestone. Per
CLAUDE.md §3.14 a MEDIUM is deferred rather than absorbed, and no new backlog row is appended
because the identical item is already there.

## Design Routing Guide

routing mode: `auto` (effective at implement stage). At implement the design gate routes
these stage-appropriate impeccable commands; here they are a checklist only — the plan stage
never invokes.

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

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Task 1의 Linux red 중 원인 미규명이 남아 격리가 늘고, 커버리지가 100퍼센트에 못 미친 채 강제로 간다 | **높음** | 이 경우 게이트가 무엇을 하는지 DD2가 **판정으로** 정한다 — 차단 조건은 `unexplained == 0`이지 `coverage_pct == 100`이 아니므로 격리된 파일은 게이트를 막지 않는다. 격리의 대가는 red가 아니라 tracked diff · `ticket` · 상한 래칫이고, `coverage_pct` 하락은 기록되되 차단하지 않는다(UI7 · UI9) |
| 격리가 늘어나 커버리지가 조용히 낮아지고 `unexplained==0`이라 게이트는 계속 green이다 | 중 | 그것이 DD7 래칫의 대상이다 — 항목을 늘리려면 상한 상수를 같은 diff에서 올려야 하므로 하락이 리뷰에 숫자로 보인다. 이 축은 기계가 아니라 **리뷰**가 막으며, 그 사실을 여기 적는 것이 통제의 한계를 숨기지 않는 방법이다 |
| main의 다른 축이 소유한 red 3건(1d)을 고치다 그 축의 설계를 잘못 읽는다 | 중 | 수리보다 **격리와 티켓**을 기본으로 둔다(UI7). 수리는 원인이 자명할 때만 |
| 전 PR 게이트가 fork PR의 임의 코드를 러너에서 실행하게 하고, 머지 차단이라 조작 유인이 커진다 | 중 | DD4 — 최소 권한 · SHA pin · `persist-credentials:false` · `pull_request_target` 미사용 · secrets 미주입 |
| job 이름을 나중에 바꿔 required check가 조용히 풀린다 | 중 | DD6 진단. 그리고 **오늘 보호가 미설정**이라 이름 확정 비용이 0인 지금 고정한다 |
| 축 D의 절단 대상이 외부 축을 파손하거나 복원되지 않는다 | 중 | 대상을 **이 milestone이 만든 배선**으로 한정. `--revert`와 `git diff --exit-code`가 왕복을 강제 |
| Windows matrix가 벽시계를 감당 불가로 만든다 | 중 | DD8의 사전 규칙이 10배 임계에서 PR 게이트 분리를 지시. 측정 후 규칙을 바꾸지 않는다 |
| M3의 범위가 커서 한 사이클에 안 들어온다 | **높음** | Task 0~4가 선행 절반(green과 오라클), Task 5~10이 강제 절반이다. 깨끗한 절단선은 **Task 4 뒤 또는 Task 7 뒤** 둘뿐이다 — Task 5(workflow 신설)와 Task 7(그 형태를 단언하는 오라클)은 **한 단위**이고, 5만 착지하면 머지 차단 workflow가 자기 형태를 단언하는 test 없이 남아 이 milestone이 세 번 경계한 상태가 된다(L2 R8 test). 중단 시 M3는 미완으로 기록된다(반올림 금지 — UI9) |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트와 경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과는 경로 작동이 아니다)

라이브 완주가 산출해야 하는 것 — 아래 넷은 단위 test로 대체 불가하다:

1. **PR에서 `test-suite` 체크가 실제로 발화하고 green이다.** `paths` 필터가 없으므로 이 PR 자신이
   그 실증이다. run URL을 문서에 기록한다.
2. **커버리지 실값이 산출된다.** 100퍼센트든 아니든 **산출된 숫자**를 기록한다. 격리가 있으면
   100퍼센트 미만이고, 그것을 green으로 반올림하지 않는다(UI9). 게이트가 green인 것과 커버리지가
   100퍼센트인 것은 **다른 명제**이며(DD2), 문서는 둘을 따로 적는다 — 게이트 green은
   네 축(attribution 불변식 · 격리 파일 수 상한 · digest 앵커 · 삭제 래칫 — 이 중 기계적 차단력은
   첫째와 넷째이고 나머지 둘은 diff 가시성·정합 검사다. DD2 참조)이 전부 통과했음을,
   커버리지 수치는 격리 비용을 말한다. `unexplained == 0`은 그중 간판이 아니라
   measurement↔tree 정합의 한쪽 방향이다(DD2).
3. **절단 A와 B가 각각 CI에서 red를 만든 run URL이 둘 존재하고, 두 red가 각각의 절단에 귀속된다.**
   로컬 왕복만으로는 축 D를 주장하지 않고, run 상태도 증거가 아니다.
   - **A(소비 경로)**: gate 출력이 `stage=1`이고 artifact `failing`에 심은 파일이 있으며,
     `--revert-red` 대조 run에는 없다(Task 7 (e2)). 미격리 flaky가 실재하므로 상태만으로는
     "절단했더니 red"와 "우연히 red"가 구분되지 않고, `stage=1`이 없으면 인자 검증으로 죽은
     게이트와도 구분되지 않는다 — **stage 번호가 판별자다**.
   - **B(구조)**: `unexplained === 0`인데 `gate.js`가 차단하고 `reasons`에
     `deleted_without_allowance`가 있다(Task 7 (e4)). **stage 번호는 증거가 아니다** — 2단계는
     커버리지 실패와 공유하는 칸이라, stage만 기록하면 래칫이 죽어 있어도 같은 증거가 남는다. Success Metric 4를 닫는 것은 이쪽이다 — A는 자기가 심은 *신호*를
     관측하고, B는 아무도 심지 않은 래칫이 잡는다. 등식 `=== 100`을 쓰지 않는 이유는 격리가
     1건이라도 있으면 그 조건이 **구조적으로 만족 불가**가 되기 때문이다(Task 7).
4. **운영자가 branch protection을 1회 설정한 뒤 `scripts/ci-required-checks.js`가 exit 0이다.**
   그 설정 전까지 축 C는 절반이며, 문서가 그것을 절반이라 적는다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1
- 합치 결론: > Codex skipped per MCCP_CODEX_DISABLED=1 (봉인된 운영자 정책 — 2.5.0의 `codex-policy seal`이 `codex_disabled=true`를 기록했고 `codex-invoke.js`가 spawn 직전 short-circuit, `classification=disabled` · `blocking=false` · `durationMs=1`). 이 게이트에서 cross-model adversarial review는 발화하지 않았고, 그 사실이 receipt의 `resolution.codex_verdict='skipped'`로 봉인된다 — cross-gate dedupe는 `converged`가 아니므로 fail-closed로 닫힌 채 남는다.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | — | — | — | Codex 미발화 — 판정할 finding 0건 |
- Deferred to backlog: 0 → `.claude/plans/codex-findings-backlog.md`
- Open Questions: implement-time 결정 다섯(모듈 분할 · execSync git 해소 · 사유 코드 판별자 · 주석 제거 YAML 스캔 · 중복 플래그 거부)은 L2 패널 24라운드가 이미 계획 본문에서 지목·흡수한 축이며, 이 게이트에서 cross-model 재검증은 받지 않았다 — severity LOW (계획 자신이 각 결정의 음성 통제를 test 분기로 소유한다)
- Codex session 참조: n/a (미발화)

### Security Reviewer

`mccp:security-reviewer`를 **실제로 돌렸고 HIGH 1건을 그 자리에서 흡수했다.**

- **HIGH — 격리 파일에서 도달 가능한 ReDoS가 유일한 머지 차단 체크를 태운다 (ACCEPT_NOW).**
  `enumerate.js#globToRegExp`가 `*`마다 무한 수량자를 **합치지 않고** 이어붙여 연속 `*`가
  파국적 backtracking 형태가 된다. 리뷰어 실측: `"*".repeat(15)+"ZZZNOMATCH"`는 경로 하나에
  8초 후에도 미종료이고, 그 목록으로 `run.js --list`를 부르면 15초 후에도 살아 있었다.
  오늘은 운영자 로컬 경로에서만 도달 가능하고 baseline은 `--exclude-from`을 넘기지 않으나,
  **M3의 강제 workflow가 처음으로** fork PR이 통제하는 tracked 파일 내용을 리뷰 이전에 ·
  `paths` 필터 없이 · 저장소의 **유일한 머지 차단 체크** 위에서 그 코드에 먹인다. 25자
  pattern 한 줄이면 `timeout-minutes: 60`을 다 태우고, 머지되면 이후 **모든 PR**이 같은
  한 시간을 지불한다. DD7·DD9의 래칫 셋은 *몇 개를* 격리하는지만 재고 *한 패턴이 얼마나
  비싼지*는 재지 않아 이것을 막지 못한다.
  **흡수 위치는 DD7이 소비 경로 위에 올려 둔 검증기**(`exclusions.js#validateExclusions`)이며
  상한 셋을 뒀다 — `MAX_PATTERN_LENGTH=200` · `MAX_PATTERN_WILDCARDS=8` · `***` 이상 연속
  금지. 표현력 손실 0(glob에서 `***`는 `**`와 같은 것을 뜻한다). 회귀 5분기를 추가했고
  그중 하나는 **소비 경로**에서 20초 timeout으로 "평가가 아니라 거부"임을 잰다.
- **MEDIUM — 컴파일러 자체의 수량자 병합 (DEFER_TO_BACKLOG).** 근본 처방은 인접 무한
  수량자를 하나로 접는 것이고 그러면 상한 셋은 심층 방어로 남는다. 열거 의미론을 바꾸는
  변경이라 384개 파일의 격리 판정이 거기 걸린다 — 별도 축으로 이연.
- 리뷰어가 본 나머지 여섯 축(fork-PR 권한 경계 · SHA pin · secrets · 경로 traversal ·
  명령 주입 · 산출물 유출)은 **결함 없음**으로 확인됐다. 그 축들은 DD4가 위협모델을
  소유하고 Task 7 단언 1b가 방어 다섯을 기계로 고정한다.

## Milestone Closure Provenance

- Milestone : ci-full-suite-m3
- Verdict   : done
- Closure   : .claude/milestone-closures/ci-full-suite-m3.md
- sha256    : sha256:934ba7d2091d5cec92ffbd5f7b42fc2a879d42afed3f684a83fa9caaa1cd7dee
- Stamped at: 2026-09-04T07:52:00.000Z
