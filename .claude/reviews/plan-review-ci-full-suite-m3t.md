# Plan Review Panel — ci-full-suite-m3t

**Plan**: `.claude/plans/ci-full-suite-m3t.plan.md` · **Plan version**: `sha256:7bfc6be73238e618c6f351be406991ea17388d76fa266958c15bc8bb15404cc3`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 3 blocking finding(s): test/HIGH, test/HIGH, test/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | 게이트의 '실제 차단력 둘' 중 하나로 지목된 stage 0의 `measurement.ok` 축은 강제 workflow 경로에서 구조적으로 도달 불가다 — 같은 불변식(측정이 성립했는가)의 소유자가 둘이 되고, CI에서는 gate가 아니라 전수 실행 step의 종료코드가 그 판정을 내린다. 그 결과 `ok:false` 사고에서는 `gate.json`과 stage 0 사유 코드가 CI에 아예 존재하지 않는다. | plan L471 "이 milestone의 실제 차단력은 **둘**에서 온다 — stage 0의 attribution 불변식 · DD9 삭제 래칫" + DD3 L593-601(0단계 정당화) 대 `scripts/test-suite/run.js:725` `return result.ok ? 0 : 1` — 전수 실행 step은 `ok:false`에서 비영점으로 죽고, 단언 1d(plan L1638-1641)가 모든 step의 `if:`를 금지하므로 판정 step은 실행되지 않는다. R10이 `unexplained`(plan L459-469), R16이 `exclusions_digest`(L472-478)에 대해 철회한 과대주장과 같은 형태이며 이 축만 철회되지 않았다. |
| architect | MEDIUM | Task 9의 병합 명령이 `--from`을 지정하지 않아, 명세대로 구현하면 러너가 CI artifact가 아니라 **로컬 머신에서 스위트를 다시 돌린 결과**를 `ci-m3-node20` 라벨로 tracked 증거 컨테이너에 봉인한다. 라벨(출처 주장)과 데이터(실제 측정 호스트)의 결속이 없다. | plan L1817 "**Task 5의** Linux artifact를 `scripts/test-suite/run.js --merge-into ... --label ci-m3-node20` 형태로 병합한다" 대 `scripts/test-suite/run.js:685-686` `const element = flags.from ? readJsonFile(String(flags.from)) : runOnce({...})`. Task 9 Validate(L1832-1836)의 3축(ok·attribution·redaction_ok)은 출처를 재지 않으므로 이 오염을 탐지할 수 없다. 계획은 다른 모든 자리에서 같은 이유로 인자 **값**을 리터럴로 pin한다(Task 5 L1438). |
| architect | MEDIUM | `reasons` 닫힌 코드 열거의 소유자가 갈라져 있다 — R16이 삭제 축에 대해 HIGH로 닫은 '최종 blocked/stage/reasons를 CLI가 사후 합성하면 계약이 깨진다'는 규칙이, `inputs.js`가 던지는 fail-closed 여덟(`base_set_empty`·`floor_entry_shape` 등)에는 적용되지 않았다. 그 여덟은 `judge` 호출 **전에** 발생하므로 그 출력은 정의상 judge 밖에서 합성되는데, 그 합성의 소유자를 계획이 지정하지 않는다. | plan L1018-1026 "`deletions`가 인자인 것이 이 서명의 핵심이다 … 최종 `blocked`/`stage`/`reasons`를 CLI가 사후에 합성하게 되어 '`gate.js`가 DD3 판정 순서의 유일한 소비처'라는 계약이 깨진다" 대 L1067-1091(fail-closed 여덟은 `inputs.js`/CLI 입력 검증 단계) + L1042-1045(그 여덟의 입력 코드가 `reasons` 닫힌 열거의 원소로 선언됨). 분기 (j)는 코드 방출만 재고 어느 모듈이 그 레코드를 조립하는지는 어떤 단언도 고정하지 않으며, (o)는 명시적으로 `judge`의 blocked 경로만 덮는다(L1129-1130). |
| security | LOW | 자원 경계 단언(2c)이 `timeout-minutes`·`concurrency`의 **존재만** 재고 값을 pin하지 않는다 — 같은 단언 블록의 형제(`node-version`)와 판정 줄의 네 인자는 전부 리터럴로 pin되므로 비대칭이고, 이 축이 막으려는 결과(fork PR의 멈추지 않는 test → required check 장기 pending)는 `timeout-minutes: 360`(GitHub 기본과 동일)에서도 오라클 green이면서 보호가 0이다. | plan L1705-1709 "**자원 경계 셋** — `timeout-minutes`가 있고 · `concurrency` 블록이 있고 · `actions/setup-node` 단계의 `node-version`이 리터럴 `20`이다" — 앞의 둘만 존재 단언. 근거로 든 미러 원본은 값을 갖고 그 사유를 주석에 적는다(`.github/workflows/test-suite-baseline.yml:30-31`·`:47`, plan L1321-1322 인용). 완화 요인: `concurrency` + `cancel-in-progress: true`가 동시 점유를 1건으로 묶어 결과가 지연에 그치고 게이트 우회로는 이어지지 않는다. |
| test | HIGH | `## Validation` 검사 5는 이 계획이 정상으로 선언한 상태(branch protection 미설정)에서 구성상 만족 불가다 — 형제 검사들이 갖는 완화 분기가 없다. 즉 Acceptance 항목 2("Validation passes")가 축 C의 수동 단계 전에는 달성 불가이고, "만족 불가"와 "안 했다"를 구분할 수 없다 — 이 계획이 R15(4b)·R19(검사 2)·R9(7b)에서 세 번 HIGH로 흡수했다고 적은 바로 그 형태의 네 번째 재현이다. | plan L1961-1962 `# 5. required check drift 진단 (DD6 — 운영자 수동 설정 이후)` / `node scripts/ci-required-checks.js --json` (완화 분기 없음, 비영점이면 블록 중단) 대 Task 8 Validate L1813 "운영자 수동 설정 후 `node scripts/ci-required-checks.js`가 exit 0" 및 Acceptance L2164-2165 "운영자가 branch protection을 1회 설정한 뒤 … 그 설정 전까지 축 C는 절반이며". 비교: 검사 7(L1974-1976)과 7b(L1987-1991)는 동일 상황에 `\|\| echo note` 완화를 갖는다. |
| test | HIGH | Task 8의 유일한 test는 순수층(`diffChecks`) 합성 3분기뿐이라, 실제 producer(workflow 파일의 job 이름 파서)가 무엇을 내는지 재는 단언이 0건이다. 그 결과 Acceptance 4(`ci-required-checks.js` exit 0)는 workflow를 제대로 읽지 못하는 구현으로도 만족될 수 있다. 게다가 이 milestone 자신이 같은 사이클에서 job `name:`을 matrix 템플릿으로 만드는데(Task 6 편집 4), 파서가 `${{ matrix.* }}` 확장을 어떻게 다루는지 계획에도 Validate에도 없다 — 이 계획이 (i)(j)(k)·Task 4에서 "순수층만 단언하면 부르는 한 줄이 빠진다"며 spawn seam을 명시한 규율이 이 Task에만 적용되지 않았다. | plan L1812-1813 Validate: "`node --test scripts/tests/ci-required-checks.test.js`의 일치·불일치·필수 체크 부재 3분기" (셋 다 판정 순수층). Files to Change L904는 같은 test를 "job 이름 파싱과 drift 판정 순수층"이라 적어 파싱 커버리지를 주장하지만 Validate에 해당 분기가 없다. 실재 shape: `.github/workflows/test-suite-baseline.yml:45` `name: node ${{ matrix.node }} — full-suite wall clock…`(Task 6 편집 4가 여기에 `matrix.os`를 더한다, plan L1492-1496). |
| test | LOW | `--assert-accounted`의 조건 수가 여전히 두 곳에서 어긋난다 — 계획이 R9에서 닫았다고 적은 드리프트가 `## Files to Change`에 남아 있다. 그 행만 읽고 구현하면 floor 조건이 빠지고, 그 누락을 붉게 만드는 것은 Task 2 (8) 분기뿐이라 행 자체는 반증되지 않는다. | plan L893 `coverage.js` 행: "`--assert-accounted`의 3조건(unexplained 0 · 격리 파일 수 상한 · `exclusions_digest` 일치)" 대 Task 2 L962-966: "**4조건 논리곱** — `unexplained === 0` ∧ `excluded.length <= max_excluded_files` ∧ `exclusions_digest` 일치 ∧ `tracked >= floor` … 앞선 라운드는 같은 문장에서 '3조건'과 실질 넷을 함께 적어 조건 수가 드리프트했다(L2 R9 architect)". |
| invariant | LOW | 판정의 1차 입력을 생산하는 줄로 리터럴 pin된 전수 실행 명령이 `run.js`에 존재하지 않는 플래그 `--json`을 담고 있다. 그 줄은 Task 7 오라클 2b가 '인자 값까지 리터럴 일치'로 단언하므로, 존재하지 않는 계약이 기계 단언으로 고정된다. 오늘은 무해하다(`parseArgv`가 미지 플래그를 그대로 flags에 담고 JSON stdout은 무조건 방출이다) — 방향도 fail-closed다. 그러나 이 계획이 반복해서 경계한 '산문이 배선인 척하는' 형태이고, 러너가 훗날 미지 플래그를 거부하거나 JSON 방출을 `--json` 조건부로 바꾸면 그 편집이 이 pin과 어긋나 전 PR이 붉어지거나(fail-closed) 증거가 사라진다. | plan L1421-1423 `node scripts/test-suite/run.js --exclude-from .github/test-suite-exclusions.json --json > measurement.json` (및 L1674 오라클 2b, Validation 검사 7 L1971-1972) 대 `scripts/test-suite/run.js` — 파일 전문에 `json` 문자열이 flags 이름으로 0건(`flags.list`/`flags['exclude-from']`/`flags['merge-into']`/`flags['files-from']`/`flags['allow-codex']`만 소비, L655-682), 산출은 L723 `process.stdout.write(JSON.stringify(result,…))`로 무조건이다. |
| invariant | LOW | 라운드 캡 불변식이 이 진행에서 실제로 무력화됐고, 그 사실이 receipt가 아니라 plan 산문에만 남는다. `(gate, decision)` 키 캡을 새 decision slug 재발행(m3→m3s, 20회)으로 우회했으며 §3.16의 문서화된 감사 우회 목록에 그 수단이 없다. 어느 라운드도 `mccp-plan-codex` receipt에 봉인되지 않아 사후 감사 앵커가 `.claude/reviews/` 파일과 이 산문뿐이다. 계획이 이를 정직하게 자백하므로 은폐는 아니지만, 봉인 부재는 기록 그 자체가 편집 가능한 표면에만 남는다는 뜻이다. | plan L358-370: "그 방식(새 decision slug 재발행)은 §3.16이 열거한 문서화된 감사 우회 넷에 없다 … 캡 강제는 이 진행에 대해 작동하지 않았고, 어느 라운드도 receipt에 봉인되지 않아 사후 감사는 아래 표와 `.claude/reviews/`의 기록에만 의존한다" · L372-382(승인 receipt 부재, missing-only chain). |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 인용 검증: `run.js:10-12/:179-183/:205-214/:489-505/:560-606/:666-679/:713-747`, `enumerate.js:49-79/:84-90/:111-138/:140-147`, `test-suite-baseline.yml:19-25/:35-38/:45-46/:79-81/:88/:92-101/:107`, `version-declaration-gate.yml:21-24/:57-60/:62-65` — 계획이 이들에 대해 주장한 내용은 전부 소스와 일치했다(`ok` 대 `exit_code` 계약, `per_file: null` 정본, `exit_code:null`의 0 접힘, digest가 러너가 로드한 목록에서 나옴, 자기 test 선행 규율의 미러 원본 존재). 공격한 축: (1) `unexplained`/`exclusions_digest`/`max_excluded_files` 철회 이후 남은 '차단력 둘'의 실제 도달 가능성 → stage 0에서 균열 발견(F1). (2) DD9 base 대조가 merge ref + merge-base 조합에서 무고한 PR을 막거나 상쇄로 열리는지 → merge ref의 부모가 base라 merge-base가 항상 옳게 접히고 집합 차는 추가에 무감, 반증 실패. (3) floor 도출식 `tracked = tracked_basis − (max_allowed_deletions + 1)`과 등가 단언들이 절단 B·정상 삭제·재기준에서 산술적으로 모순되는지 → 초기값 0/1 사례와 재기준 규칙까지 따라가 모순 없음. (4) `tracked` 채널·격리 로더의 이중 소유(gate 대 coverage 대 inputs 대 exclusions) → 계약 소유자/구현 소유자 구분이 명시돼 있어 반증 실패, 다만 `reasons` 열거에서 같은 규율이 끊긴 것을 발견(F3). (5) `--merge-into` 경로의 출처 결속(F2). (6) Task 4 가드 위치 이동이 `runOnce`/`childEnv` 프로그래매틱 경로를 남기는지 → CLI가 유일 진입점이라 실질 누수 아님. HIGH/CRITICAL은 찾지 못했다. |
| security | pass | 공격한 축: (1) fork-PR 임의 코드 실행 — `paths` 필터 부재로 전 PR 발화 + tracked `*.test.js` 전수 실행. DD4의 다섯(permissions contents:read · persist-credentials:false · pull_request_target 미사용 · SHA pin · secrets 미주입)이 전부 오라클 단언(1b) + 음성 fixture(f)를 갖고, `run.js:458`의 `FORCED_POLICY_ENV`와 Task 4의 `GITHUB_ACTIONS` 가드가 `--allow-codex` 경로를 fail-closed로 닫는다 — 파싱 지점이라 workflow 줄에 인자를 몰래 더해도 비영점이다. (2) 유출을 durable artifact로 — `run.js:568-604` 산출에 `meta.cwd` 유사 절대경로 필드가 **없고**(`git_sha`·`ci_run_id`·`platform`만), 최종 `scanResidual(out)`가 자기 조립 문자열(`reason`·`failing`)까지 훑으며, `--merge-into`가 `redaction_ok !== true` 원소를 `:321-326`에서 거부하므로 tracked 컨테이너(`2026-09-01-suite-baseline.json`) 오염 경로를 만들지 못했다. 신규 `gate.json`은 R20에서 `message`를 `redact.js` 통과로 계약 안에 넣었고 `createRedactor`가 실제로 그 API를 export한다(`redact.js:215`·`:361`). `redaction_ok=false`인데도 `if: always()`로 발행된다는 잔여는 DD4a L751-757이 **배선대로** 기록하고 교환(증거 대 발행)을 명시한다 — 숨긴 것이 아니다. (3) 판정 입력 위조 — `--measurement` 값 치환(R10), producer step `if:`로 끄고 커밋된 green measurement 사용(R20, 클래스 단언 1d), checkout `ref:`로 base 트리 판정(2d), `continue-on-error`(1c), `branches`/`types` 좁히기(3), `${{ }}` 직접 보간(3b) — 다섯 벡터 전부 클래스 단언 + 음성 fixture를 받는다. 리다이렉트가 커밋된 `measurement.json`을 선행 truncate하므로 그 변형도 못 세웠다. (4) 부분 상태 신뢰 — `judge`의 fail-closed 여덟, `--floor-from` 다섯 키 **각각**의 분기, `allow_deletions` 원소 shape, `base_set_empty`가 전부 열거되고 `reasons` 코드까지 단언한다. floor 도출 등식은 트리 미판독 순수 산술이라 삭제/추가 어느 쪽에서도 자기부정하지 않음을 산술로 확인했다. (5) glob 특권 상승 — `enumerate.js:27-50` `globToRegExp`가 `**`를 `.*`로 펴고 나머지 메타문자는 중화함을 실측 확인했고, 그 경로는 격리 축 분기 (4)와 삭제 축 여섯째 분기(리터럴 강제)가 양쪽 다 닫았다. (6) 셸/경로 — `BASE_REF` env 간접 + 값 정의 자리까지 스캔(R12), `.claude/cache/`가 `.gitignore:149`에 실재함을 확인. 위 어느 것도 HIGH로 세울 evidence를 얻지 못했고, 남은 것은 위 LOW 하나다. |
| test | fail | 인용 실검증: `run.js:213-214`(per_file null), `:725`(ok 기반 종료), `module.exports` L728-747(main/parseArgv 부재), `foldChunks` L163-205, `enumerate.js`(enumerateTests가 `.test.js`만 수용 → 4a·4b의 `git ls-files` 전량 전달이 stage 0 tree-mismatch를 유발하지 않음, `exclusionsDigest` export 실재)를 확인해 반증 시도했으나 전부 계획대로였다. 4a/4b 합성 measurement의 stage 도달 가능성(stage 1 suite_red / stage 2 deleted_without_allowance), `--base-ref HEAD`가 래칫을 접는지(cut B에서 base=HEAD tree vs index → missing 비지 않음), 절단 A·B가 자기 test 단계(`max_excluded_files` 등가·floor 도출 등식)를 먼저 붉게 만드는지, Task 4 가드 이동이 기존 test(`test-suite.test.js:696-720` childEnv 직접 호출, spawn 경로에 `--allow-codex` 0건)를 CI에서 깨는지, Task 3 재배선이 기존 enumerate 단언(L55-98, ticket 없는 합성 입력)을 붉게 만드는지 — 모두 공격했고 결함을 찾지 못했다. 남은 셋은 위 findings다. |
| invariant | pass | DD3 판정 순서를 실제 소스와 대조했다 — `foldChunks`의 `Number(r.exit_code)\|\|0` fail-open(run.js:179)과 `per_file: ok ? perFile : null`(:214), `deriveAttribution`(:138-152), `return result.ok ? 0 : 1`(:725)이 전부 계획의 인용대로였고 stage 0이 그 조합을 실제로 잡는다. 커버리지 분모 채널을 공격했다 — `per_file[].file`이 `redactor.redactPath`를 거치므로(reporter.mjs:153) tracked 문자열과 어긋날 수 있는지 봤으나 redact.js:268-284가 repo-내부 경로를 repo-relative posix로 되돌리고 이탈은 `<external>/…`로 접혀 stage 0 `measurement_tree_mismatch`로 fail-closed였다. `exclusions_digest`의 커버 범위를 봤다(enumerate.js:84-90 — pattern+reason만 해시, ticket 제외이나 ticket 검증은 별도 소비 경로에 있어 앵커 의미가 훼손되지 않는다). DD9 래칫 산술을 정상 삭제 2사이클 + cleanup 재기준으로 돌려 R17이 지목한 영구 `below_floor`가 실제로 닫혔는지 계산했다(닫혔다). glob 면제·헤드룸·개수 상쇄·rename·`base_set_empty`·merge-base 드리프트 경로를 각각 짚었으나 전부 흡수돼 있었다. workflow 무력화 벡터(`continue-on-error` · step/job `if:` · 좁히는 트리거 5키 · checkout `ref:` · 인자 값 치환 · secrets · 태그 pin)를 열거해 오라클 사거리 밖을 찾았으나 R17~R20이 클래스 단언으로 덮었다. redaction 축이 스위트 성장으로 영구 red가 될 수 있는지 봤으나 `scanResidual`의 truncated는 크기가 아니라 `MAX_DEPTH` 기반이었다(redact.js:317-346). Validation 4·4a·4b의 셸 제어 흐름(복원이 실패 경로에서도 도는가, `&&…\|\|true`의 exit 도달, `--base-ref HEAD`가 삭제 실험을 vacuous하게 만드는가)을 따라갔으나 전부 fail-closed였다. 남은 잔여(게이트 위조 · `tracked_basis` 정직성 · required check 미복원 탐지)는 DD4a·Task 3·Task 8이 명시적으로 '닫지 않는다'고 적은 것들이라 미공개 침식이 아니다. HIGH/CRITICAL은 찾지 못했다. |

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
  "wall_clock_ms": 385600,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:7bfc6be73238e618c6f351be406991ea17388d76fa266958c15bc8bb15404cc3",
  "plan_path": ".claude/plans/ci-full-suite-m3t.plan.md",
  "recorded_at": "2026-09-04T04:56:20.210Z"
}
```
