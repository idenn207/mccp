# Plan Review Panel — ci-full-suite-m3j

**Plan**: `.claude/plans/ci-full-suite-m3j.plan.md` · **Plan version**: `sha256:0f70ee0c20e7b8a781a28b4c09391c799aaeb73cdce551a56eccf1b3e465e1b5`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 6 blocking finding(s): architect/HIGH, architect/FAIL, test/HIGH, test/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 측정을 생산하는 workflow 단계(전수 실행)의 인자가 계획 어디에도 고정되지 않았고 어떤 오라클의 사거리에도 없다 — 특히 `--exclude-from`. `run.js`는 그 플래그가 없으면 **빈 목록의** digest를 산출물에 봉인하는데(`scripts/test-suite/run.js:580` `exclusions_digest: exclusionsDigest(exclusions)`, `:666-667` 플래그 부재 시 `exclusions=[]`), DD2의 세 번째 조건은 게이트가 로드한 목록의 재계산값과 그 필드를 대조한다. 즉 격리가 **1건이라도 생기는 순간** `digest_mismatch`로 전 PR이 영구 red가 되고(DD2가 한 라운드를 들여 막은 '저장소를 인질로' 상태), 격리 0건인 동안은 앵커가 조용히 공허하다. 그런데 Task 7 오라클의 단언 집합(1 판정 줄 토큰·값 · 1b fork 방어 · 1c continue-on-error · 2 fetch-depth/base fetch · 2b 격리검증·열거 sanity 두 단계의 존재 · 3 paths 부재)에 **전수 실행 단계도 그 인자도 없다**. 판정 줄의 네 인자 값을 리터럴로 pin하기 위해 세 라운드를 쓴 계획이, 그 판정의 1차 입력을 *생산하는* 줄에는 같은 규율을 적용하지 않았다 — 이 milestone이 다섯 번 경계한 '기계는 만들어지고 부르는 한 줄이 빠진다'의 여섯 번째 재현이며, 이번에는 붉어질 test가 0건이다. | plan L861 단계 순서에 인자 없음 · L898-905 판정 줄만 인자 리터럴 고정 · L1001-1042 오라클 단언 셋에 전수 실행 단계 부재 · 대조 근거 `scripts/test-suite/run.js:580`·`:666-667` |
| architect | MEDIUM | `tracked` 해소와 floor fail-closed를 `gate.js`와 `coverage.js` CLI가 '같은 헬퍼로 공유'한다고 계약을 세우면서, 그 헬퍼를 소유하는 모듈이 `## Files to Change` 어디에도 없다. 명명된 두 모듈만으로 구현하면 `gate.js → coverage.js`(computeCoverage 호출, Task 2b L741-743)와 `coverage.js → gate.js`(공유 해소 재사용, Task 2 L669-671·L680-687)의 **순환 require**가 된다. 계획은 중복 구현을 금지하고 그 금지를 짝 단언으로만 강제하는데, 짝 단언은 두 진입점의 *출력 일치*만 재므로 구현자가 순환을 피해 조용히 두 번째 계산을 넣어도(계획이 명시 금지한 바로 그 형태) 출력이 우연히 같은 합성 입력에서는 green이다. 소유 모듈을 지목하지 않은 것 자체가 '한 불변식에 소유자가 둘'을 재도입한다 — 계획이 같은 절에서 그것을 거부한다고 적으면서. | plan L606-607(Files to Change에 공유 헬퍼 모듈 없음) · L669-671 "`tracked` 채널의 소유자는 `gate.js`다 … 이 CLI는 … 재사용할 뿐" · L680-687 "같은 헬퍼로 공유 … 두 번째 구현이 아니다" · L741-743 gate가 computeCoverage 호출 |
| security | MEDIUM | 플랜이 명시한 방어 주장 하나가 실제로는 그것을 막지 못한다 — `${{ }}`를 큰따옴표로 감싸는 것은 셸 메타문자를 무해화하지 않는다. 큰따옴표 안에서도 `$(...)`와 backtick은 그대로 실행되며, `${{ }}`는 셸이 보기 전에 텍스트로 치환된다. 오늘 값(`github.base_ref`)은 base 저장소 소유자만 만들 수 있어 실 익스플로잇 경로는 없지만, 주장이 참인 것으로 남으면 같은 패턴을 attacker-controlled 값(`github.head_ref` — 플랜이 fixture로 언급까지 하는 값)으로 옮길 때 인용이 방어라고 믿게 된다. 안전한 형태는 `env:` 간접이지 인용이 아니다. | plan L904-910: `--base-ref "origin/${{ github.base_ref \|\| 'main' }}"` … "`${{ }}`는 인용한다 — 이 값은 fork 공격자가 통제하지 못하지만 셸 메타문자를 담은 브랜치 이름이 머지 차단 workflow 안에서 실행되는 것을 인용 하나로 막을 수 있고" (미러 원본 .github/workflows/version-declaration-gate.yml:60,68은 인용조차 없다) |
| security | MEDIUM | DD9의 삭제 면제(`allow_deletions`)가 형제 축(격리)보다 감사 강도가 현저히 약한데 그 비대칭에 근거가 없다. 격리는 `ticket` 필수 + `max_excluded_files` **등가** 단언까지 요구하는데, 삭제 면제는 경로 문자열 배열 하나로 끝난다 — 티켓도, 항목 수 상한도, 등가 단언도 없다. 구체 시나리오: 배선을 끊는 PR이 그 배선을 단언하는 test 파일을 지우면서 같은 diff에서 그 경로를 `allow_deletions`에 append하면 `missing ⊆ allow_deletions`가 되어 게이트는 green이고, `coverage_pct`도 떨어지지 않는다(분자·분모 동시 감소). 이는 DD9가 존재 이유로 든 바로 그 실패 모드다. 남는 통제는 사람의 리뷰뿐인데, 격리 축에서는 같은 논리를 불충분하다고 판정해 ticket을 요구했다. | plan L562-565 "정당한 삭제의 출구는 floor 하향이 아니라 같은 파일의 `allow_deletions` 배열이다" + Files to Change L605 (`allow_deletions`는 "명시 면제 경로 배열"만) 대 L485-489 격리 3중 통제(항목 수 상한 · `ticket` 필수 · 파일 수 상한 등가 단언) |
| security | MEDIUM | DD4가 fork 위협모델의 방어로 다섯을 못박는데 Task 7 오라클은 넷만 단언하고 **`secrets` 미주입**만 빠뜨렸다. 이 workflow는 PR이 추가한 임의 `*.test.js`를 러너에서 실행하므로(전수 glob), `env: FOO: ${{ secrets.X }}` 한 줄이 나중에 들어오면 그 시크릿은 PR 통제 코드의 프로세스 환경에 그대로 노출되고, artifact는 `redact.js` 헤더가 스스로 비완전하다고 적은 잔여 축(credential 클래스 커버리지 0)을 통과해 공개 업로드된다. 형제 넷(permissions · persist-credentials · pull_request_target · SHA pin)은 전부 fixture로 red를 강제하는데 이 축만 산문이라, 플랜이 세 번 경계한 "기계는 만들어지고 부르는 한 줄이 빠진다"가 정확히 가장 치명적인 항목에 남는다. | plan L406 "`permissions: contents: read` (최소) · `persist-credentials: false` · secrets 미주입" 대 Task 7 L1026-1030 "**fork-PR 방어 넷** — `permissions:` … `persist-credentials: false` … `pull_request_target`이 없고 … `uses:`가 40자리 commit SHA" (secrets 단언 없음); 노출 경로 근거: .github/workflows/test-suite-baseline.yml:60-66 "`redact.js`의 `RESIDUAL_PATTERNS`는 경로 패턴 4종뿐이라 credential 클래스 커버리지가 0건이고, 그 메시지는 `if: always()`로 조건 없이 올라가는 artifact에 그대로 실린다" |
| test | HIGH | Acceptance 2와 3B가 요구하는 CI 증거(`coverage_pct` 실값, `coverage_pct_after >= coverage_pct_before`)에는 **CI 경로상 producer가 없다**. gate.js의 선언된 출력 모양에 커버리지 수치가 아예 없고, 커버리지 수치를 내는 유일한 표면(coverage.js)은 계획이 명시적으로 '로컬 전용'으로 못박았다. Success Metric 4를 닫는 것이 절단 B인데, 그 수용 등식을 어떤 test도 어떤 Validation 줄도 어떤 workflow 단계도 산출·단언하지 않는다 — R6이 '반증 불가한 실증'으로 지적해 고쳤다는 바로 그 결함이 수치 축에서 그대로 남아 있다. | plan L607/L724-725: `gate.js`는 `{blocked, stage, reasons, message}`만 낸다(coverage_pct 없음). plan L683 "차단은 CI가 부르는 `gate.js` 단독이고, `## Validation` 검사 2가 이 CLI(coverage.js)를 부르는 것은 로컬에서 수치를 보기 위해서다". plan L750 "이것이 **강제 workflow가 부르는 유일한 판정 명령**이다". Task 5의 단계 열거(L861)와 판정 줄(L900-905)에 coverage.js 호출도 `--json` 산출/artifact 업로드도 없다. 그런데 plan L1065 (e4)와 L1402 Acceptance 3B는 "`coverage_pct_after >= coverage_pct_before`인데 gate.js가 차단"을, L1390 Acceptance 2는 "커버리지 실값이 산출된다"를 라이브 CI 증거로 요구한다. Validation 4b(L1195-1201)도 reasons만 단언하고 coverage_pct는 읽지 않는다. |
| test | LOW | `## Validation` 검사 2가 검사 7의 산출(`/tmp/m3-local.json`)에 의존하는데, 같은 의존을 가진 검사 4b에만 선행 가드가 있고 검사 2에는 없다 — 블록을 위에서 아래로 돌리면 검사 2가 존재하지 않는 measurement로 fail-closed 비영점을 내며, 그 실패는 '오라클이 잡았다'와 구분되지 않는다. | plan L1189 `test -s /tmp/m3-local.json \|\| { echo "FAIL: 4b는 검사 7의 measurement를 요구한다 — 7을 먼저 돌려라"; exit 1; }` 대 L1159-1163 검사 2에는 동일 가드 없음. 의존 사실은 L1224-1226 주석("검사 2는 이 산출(7)을 읽으므로 실제 실행 순서는 7 → 2다")이 인정한다. |
| invariant | HIGH | 게이트 기계 자신의 고장이 차단이 아니라 통과로 접힌다 — 판정자(gate.js)의 자기 test가 판정자 자신의 판정 하류에만 있어 순환이다. 강제 workflow 단계 순서는 '체크아웃 → base ref → 격리 검증 → 열거 sanity → 전수 실행 → 판정'(plan L861)이고, Task 7 오라클이 판정 앞 단계로 단언하는 것은 exclusions --check와 run.js --list 둘뿐이다(plan L1035-1039). gate.js/coverage.js의 짝 test(scripts/tests/test-suite-coverage.test.js)는 전수 스위트 안에서만 돌고, 전수 실행 단계는 run.js:725 `return result.ok ? 0 : 1`대로 `ok`(측정 성립)로만 종료하므로 그 test가 red여도 그 단계는 exit 0이다. 즉 그 red를 체크 red로 바꾸는 유일한 주체가 gate.js의 1단계이며, gate.js가 통과 방향으로 고장 나 있으면(예: judge가 blocked를 항상 false로 내거나 CLI가 exit 0) 자기 결함을 자기가 은폐하고 workflow의 어떤 단계도 붉어지지 않는다. 계획이 base ref 처방을 미러한다고 명시한 바로 그 파일이 이 규율을 반대로 못박고 있다 — `.github/workflows/version-declaration-gate.yml:62-65` '가드가 초록인데 그 가드 자체가 고장 나 있으면 초록의 의미가 없다 — 판별력 test 가 그 경우를 잡는다'로 가드보다 **앞선 독립 단계**에서 자기 test를 돌린다. 계획은 그 인접 규율을 취하지 않았고, DD4a의 면책('막는 것은 부주의이지 의도가 아니다', plan L525-526)은 여기 적용되지 않는다 — 판정자 결함은 정확히 부주의다. | plan L861(단계 순서) · L1035-1039(2b 앞 단계 단언 집합) · scripts/test-suite/run.js:725 `return result.ok ? 0 : 1` · .github/workflows/version-declaration-gate.yml:62-65 |
| invariant | MEDIUM | 진행 근거로 인용한 chain 상태 실측이 이 계획과 다른 decision에 앵커링돼 있다. 심사 대상은 `ci-full-suite-m3j`인데, '실측한 chain 상태는 missing-only다'의 근거로 제시된 명령은 `validate --command mccp:prp-implement --decision ci-full-suite-m3a`다. m3a는 이 계획이 스스로 열거한 열 개 슬러그 중 하나이고(plan L15), 각 슬러그는 별도 receipt 네임스페이스를 갖는다. 즉 승인 receipt 부재 상태에서 비-terminal 게이트를 informational allow-path로 통과시키겠다는 결정이, 실제로 통과하게 될 슬러그가 아닌 다른 슬러그에서 측정된 결과 위에 서 있다. | plan L160-163: "실측한 chain 상태는 **missing-only**다: `validate --command mccp:prp-implement --decision ci-full-suite-m3a`가 …" — 대상 계획은 `.claude/plans/ci-full-suite-m3j.plan.md` |
| invariant | MEDIUM | 라운드 예산이라는 capped resource가 회계 없이 소모됐다. 계획 스스로 '라운드 예산은 (gate, decision)마다 1/1이고 캡은 MCCP_CODEX_DISABLED=1이 pin해 올릴 수 없으므로, 각 라운드는 흡수 후 새 decision slug로 재-ship한다'고 적는다(plan L152-155). 이는 예약 없이 발화한 것이 아니라 **키를 갈아 예약을 새로 얻은 것**이며, 캡 강제 자체를 구조적으로 무의미하게 만든다. CLAUDE.md §3.16이 명시한 정당한 대응 목록(문서화된 감사 우회 넷)에 '새 슬러그 발행'은 없고, 같은 절이 이미 'plan을 고쳐 재리뷰하면 원장에서 라운드로 보이지 않는다'(M10 IV1)를 이 절이 막으려는 패턴으로 지목한다. 표로 공개한 것은 완화 요소지만, 열 라운드 어느 것도 receipt에 봉인되지 않아 사후 감사는 이 계획 본문의 산문에만 의존한다. | plan L152-156 · plan L12-23(10 decision 표) · CLAUDE.md §3.16 '캡에 걸렸을 때의 정당한 행동은 아래 우회 목록과 같으며(사유를 남긴다), 원장을 지우는 것은 그 목록에 없다' + M10 IV1 |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | plan 전문(1413행)과 PRD를 읽고, 인용을 원본에서 대조했다: `run.js:10-12`·`:213-214`(`per_file: ok ? perFile : null`)·`:179-183`(`Number(r.exit_code)\|\|0` 접힘)·`:407-410`(`ls-files -z`)·`:580`·`:666-667`, `enumerate.js:111-132`(included∪excluded=tracked 구성 보장)·`:122`, `.github/workflows/version-declaration-gate.yml:21-24`·`:57-60`(fetch-depth 0 + base fetch 미러) — 전부 계획이 주장한 대로였다. DD3 판정 순서의 단일 소비처화, stage 대신 `reasons` 코드로 판별자를 옮긴 것, DD9의 개수 비교→경로 집합 차 전환(삭제+추가 상쇄 폐쇄), 절단 A가 fail-closed 인자 검증과 충돌하지 않도록 workflow 무변경으로 가른 것, 4b가 `--base-ref HEAD`를 쓰면서 오라클은 workflow에서 `HEAD`를 금지하는 비대칭(다른 파일이라 모순 아님), baseline `pull_request` 제거가 Task 6 dispatch와 충돌하는지 — 이 여섯은 공격했으나 결함을 찾지 못했다. 남은 둘은 위 findings다: measurement 생산 줄이 모든 오라클 밖이라는 것(HIGH)과 공유 헬퍼의 소유 모듈 부재로 인한 순환/이중 구현 이음매(MEDIUM). |
| security | pass | 공격한 것: (1) `${{ }}` 보간 → run 셸 주입 — 플랜의 인용 방어 주장이 `$(...)`에 무력함을 확인했으나 값이 base-repo 통제라 실 경로는 못 만들었다(MEDIUM으로만 보고). (2) fork PR 임의코드 실행 → measurement.json 위조 → 게이트 green: 성립하지만 DD4a가 명시적으로 닫지 않는다고 기록하고 통제 지점이 런타임 밖임을 논증하므로 새 결함이 아니다. (3) `--base-ref` 부재로 약한 정적 floor로 강등되는 partial-state 폴백 — Task 7 오라클의 토큰+값 단언과 `--base-ref만 지운 YAML` fixture가 닫는다. (4) `--base-ref HEAD`로 base_set=head_set을 접는 우회 — 값 리터럴 pin + `HEAD`/`head_ref` fixture가 닫는다. (5) `--measurement`/`--exclude-from`을 리뷰 표면 좁은 파일로 돌리기 — 네 인자 값 리터럴 pin이 닫는다. (6) `exclusions_digest` 앵커 우회(격리 없이 돈 측정 + 큰 목록 짝짓기) — run.js:580이 실제로 digest를 봉인하고 gate가 재계산 대조하므로 닫힌다. (7) Task 9가 git-tracked `.claude/_meta/data/*.json`에 측정을 병합하는 durable-artifact 유출 축(§3.12 cwd leak 선례) — `validateElement`(run.js:321-326)가 `redaction_ok !== true`를 거부하고 Windows 측정은 병합 대상이 아니어서 드라이브 경로가 tracked 파일에 도달할 경로를 못 만들었다. (8) Task 4 `--allow-codex` CI 가드 우회(하위 프로세스가 `GITHUB_ACTIONS` 제거) — CI에 codex 자격증명이 없어 결과로 이어지지 않는다. 남긴 셋은 전부 MEDIUM이며 HIGH/CRITICAL은 찾지 못했다. |
| test | fail | (1) 계획이 인용한 소스 주장 검증: `run.js:179-183` foldChunks의 `Number(r.exit_code)\|\|0` 접힘, `:205/:213-214` `per_file: ok ? perFile : null`, `:725` `return result.ok ? 0 : 1`, `:666-679` `--exclude-from`→`readJsonFile`/`--list`가 `enumerated.included` — 전부 계획 서술대로였다. (2) '기존 test가 버그를 고정하고 있는가': Task 3의 `run.js` `--exclude-from` 재배선이 기존 `scripts/tests/test-suite.test.js`를 깨는지 확인 — 그 파일의 exclusions 단언(L55-97)은 전부 `enumerateTests`/`exclusionsDigest` 순수층 직접 호출이라 CLI 재배선 사거리 밖이었고, `normalizeExclusions` 보존 서술과도 일치했다. (3) Task 4 가드 위치 주장 검증: `run.js:655-662`가 실제 플래그 파싱 지점이고 `test-suite.test.js:696-720`은 `childEnv`만 직접 부르므로 CI 회귀 주장과 위치 이동 논거가 참이었다. (4) Validation 4b의 `--base-ref HEAD` + `git rm` 조합이 index/commit 차로 실제 `missing`을 만드는지 추적 — 성립했다. (5) 각 Files-to-Change 항목의 짝 test 존재 여부 — `container-check.js`까지 포함해 신규 스크립트 전부 짝 test가 배정돼 있었고, 무-test는 baseline workflow 축소(Task 5.2)·Windows matrix 추가(Task 6)뿐인데 계획이 그것에 test 주장을 하지 않으므로 finding으로 올리지 않았다. 남은 두 건만 보고한다. |
| invariant | fail | 공격한 것: (1) DD3 판정 순서 0~3단계의 미정의 입력 — measurement 부재/파손/부분기록, per_file null vs [], chunk spawn 실패 조합. run.js:163-220·485-505·213-214를 직접 읽어 계획의 인용(`exit_code: null`이 `Number()\|\|0`으로 0이 되고 `redaction_ok:true`가 실린다)이 **정확함**을 확인했다 — 0단계 신설은 실재하는 구멍을 닫는다. (2) DD2 앵커링 — 전수 실행 단계의 `--exclude-from` 인자가 오라클 사거리 밖이므로 다른 목록/무목록으로 돌릴 수 있는지 추적했으나, `exclusions_digest`(run.js:580, enumerate.js) 대조가 양방향 모두 digest_mismatch로 fail-closed 차단해 열리지 않았다. (3) DD9 삭제 래칫 — base tip 대조가 merge-base가 아니어서 생기는 방향을 따졌으나, checkout이 merge ref라 head ⊇ base가 성립해 위양성/위음성 모두 없었다. `--base-ref HEAD`를 쓰는 Validation 4b도 `git rm`이 index만 지우고 ls-tree는 커밋을 읽으므로 실제로 래칫이 발화한다. (4) workflow 인자 절단 경로 — 네 인자 값 리터럴 pin + continue-on-error 부재 + paths 부재 단언으로 과대허용 방향이 전부 반증 가능하게 덮여 있었다. (5) rollback 현실성 — Task 8 런북의 required check 일시 해제 경로가 실재하고 ci-required-checks.js가 미복원을 붉게 유지한다. 여기까지는 반박에 실패했다. 뚫린 곳은 판정자 자신의 건강을 재는 단계가 판정자 하류에만 있는 것(위 HIGH)과, 계획을 진행시키는 두 근거(chain 상태 실측 · 라운드 예산)의 앵커링/회계다. |

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
  "wall_clock_ms": 229244,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:0f70ee0c20e7b8a781a28b4c09391c799aaeb73cdce551a56eccf1b3e465e1b5",
  "plan_path": ".claude/plans/ci-full-suite-m3j.plan.md",
  "recorded_at": "2026-09-04T03:24:14.351Z"
}
```
