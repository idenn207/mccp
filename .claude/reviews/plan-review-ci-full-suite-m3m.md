# Plan Review Panel — ci-full-suite-m3m

**Plan**: `.claude/plans/ci-full-suite-m3m.plan.md` · **Plan version**: `sha256:b3acf7da33fce287ecde49090978e006390c8aed3c5c7cc4e58fa7c5287f44be`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 7 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | DD9의 두 래칫이 같은 축에서 충돌한다 — 정적 `tracked` floor가 `allow_deletions` 면제 경로를 구조적으로 무효화한다. 계획은 "정당한 삭제의 출구는 floor 하향이 아니라 같은 파일의 `allow_deletions` 배열이다"(plan L648-651)라고 못박지만, Task 3이 `.github/test-suite-floor.json`의 `tracked`를 "이 시점의 tracked 개수"로 정하고(plan L922) 게이트 2단계 논리곱이 `tracked >= floor`를 포함하므로(plan L766), `allow_deletions`에 정식 등재된 삭제 1건도 `below_floor`로 여전히 차단된다. 실제 출구는 계획이 금지한 floor 하향뿐이고, Task 2 Validate (7) "floor를 같은 호출에서 내리면 통과"(plan L796)가 그것을 인정한다. 같은 값 지정은 DD9가 base 대조를 정본으로 삼은 근거인 "floor의 slack이 무한하다"(plan L959)와도 양립 불가다 — slack이 0이면 그 논증이 성립하지 않고, slack이 0이 아니면 Task 3의 값 지정이 거짓이다. 초기값이 어디에도 확정되지 않아 두 서술 중 어느 쪽이 계약인지 판정 불가다. | plan L648-651 · L922 · L766 · L796 · L959 (`.claude/plans/ci-full-suite-m3m.plan.md`) |
| architect | HIGH | 축 D 절단 B(Success Metric 4를 닫는 유일한 실험)의 CI 증거에 producer가 없다 — 계획이 R11·R12·R13에서 세 번 흡수한 "증거 요건에 CI producer가 없다"의 네 번째 재현이다. 강제 workflow의 단계 순서는 "… 판정자 자기 test → 전수 실행 → 판정 → 업로드"이고(plan L993, L1004-1016) 자기 test 단계는 `scripts/tests/test-suite-coverage.test.js`를 실제 저장소 상태에 대해 돌린다. 그런데 Task 3이 그 파일에 `tracked` floor ≤ 현 tracked 단언을 배정했으므로(plan L947), floor가 Task 3이 지정한 대로 현 개수라면 `--apply-delete`로 파일 1개를 지운 트리에서 그 단계가 **판정보다 먼저** red가 된다. 판정 단계는 실행되지 않으므로 `gate.json`이 생성되지 않고, `if: always()` 업로드는 만들어지지 않은 산출물을 건질 수 없다. 결과적으로 Acceptance 3-B가 요구하는 `unexplained === 0` ∧ `reasons ∋ deleted_without_allowance`(plan L1646-1648)를 산출할 주체가 CI에 없다. Task 7 (e5)의 방어(`grep -r "<basename>" --include=*.test.js`, plan L1304-1305)는 이 의존이 파일명이 아니라 **개수**에 걸려 있어 구조적으로 탐지하지 못한다. 로컬 `## Validation` 4b는 자기 test 단계를 거치지 않고 `gate.js`를 직접 부르므로(plan L1437-1444) 이 회귀를 구조적으로 볼 수 없다 — R8이 Task 4에서 흡수한 "로컬이 CI 전용 회귀를 못 본다"와 같은 형태다. | plan L993 · L1004-1016 · L947 · L1304-1305 · L1437-1444 · L1646-1648 (`.claude/plans/ci-full-suite-m3m.plan.md`); 자기 test 단계 앞선 배치의 미러 원본은 `.github/workflows/version-declaration-gate.yml:62-65` |
| security | MEDIUM | DD9 삭제 래칫의 유일한 입력 `.github/test-suite-floor.json`은 앵커가 없고, 전수 스위트가 같은 워크스페이스에서 임의 test 코드를 실행한 **뒤에** gate.js가 그 파일을 디스크에서 읽는다. 즉 커밋된 내용이 아니라 런타임 내용이 판정된다. 격리 목록에는 `exclusions_digest` 앵커가 있어 런타임 변조가 fail-closed(digest_mismatch)로 접히지만(plan L376-384), floor에는 대응 앵커가 전혀 없다. 그래서 DD7이 래칫의 유일한 출구로 못박은 문장 — '늘리려면 상한 상수를 같이 올리는 별도 편집이 필요하고 그 사실이 diff에 숫자로 남는다'(plan L565-566) — 은 참이 아니다: 스위트 실행 중 그 JSON을 덮어써 `allow_deletions`를 채우거나 `max_excluded_files`를 올리면 데이터 파일 diff는 비어 있는 채 gate가 통과한다. 계획의 모든 짝 단언(Task 3 등가 단언, wiring-cut 오라클)은 **판정자 자기 test 단계**에서 돌아 변조 이전의 원본을 읽으므로 전부 green으로 남는다(plan L993-994 단계 순서). 계획 어디에도 판정 입력을 커밋 트리에서 읽거나 판정 직전 워크스페이스 청결(`git status --porcelain`)을 확인하라는 요구가 없다 — 정작 Task 7은 로컬 왕복에 대해 바로 그 검사를 요구한다(L1130-1131). | plan L921-947(floor 파일 3상수, 앵커 없음) 대 L376-384(exclusions만 digest 앵커); 단계 순서 L993-994('… 판정자 자기 test → 전수 실행 → 판정'); DD7 L565-566; `scripts/test-suite/run.js:227-242`의 `assertNoPollution`은 JSON prototype pollution만 보고 워크스페이스 오염과 무관 |
| security | MEDIUM | DD4a가 게이트 위조를 닫지 않는 **사유**가 위 경로를 덮지 못한다. DD4a는 '판정 모듈이 tracked 파일이라 같은 PR에서 함께 수정 가능'(plan L596-599)을 근거로 들어 위조가 diff에 드러남을 전제하는데, 런타임 변조는 판정 입력의 diff를 비운 채 성립한다. 또 DD4a는 '이 게이트가 막는 것은 부주의이지 의도가 아니다'(L605-606)라고 선을 긋지만, 이 저장소는 'test가 `gitDir`를 격리하지 않아 저장소의 살아있는 게이트 봉인을 읽은' 부주의 사례를 이미 실측했다(PRD L95) — 즉 부주의한 test의 워크스페이스 쓰기가 판정 입력을 오염시키는 방향은 DD4a의 면책 밖이다. | plan L596-606 (DD4a); PRD `.claude/prds/ci-full-suite.prd.md:95` |
| security | MEDIUM | fork-PR 방어 다섯 중 `permissions`·`persist-credentials` 단언이 **존재 기반**이라 추가된 상위 권한을 잡지 못한다. 오라클은 "`permissions:`가 `contents: read`이고 · `persist-credentials: false`가 있고"를 단언하고(plan L1241-1242) 음성 fixture는 "`permissions:`가 `contents: write`인 YAML"·"`persist-credentials: false`가 빠진 YAML"이다(L1313-1314). workflow-level `contents: read`를 남긴 채 job-level `permissions: contents: write`를 더하거나, `persist-credentials: false`를 가진 checkout 옆에 그것이 없는 두 번째 checkout을 더하면 양성 단언은 만족되고 음성 fixture 어느 것과도 형태가 다르다. 결과는 PR이 통제하는 임의 `*.test.js`를 실행하는 workflow가 쓰기 토큰/자격증명을 들고 도는 것 — DD4가 이 workflow의 위협모델로 명시한 바로 그 상태(L479-485)다. | plan L1241-1251(오라클 1b) · L1313-1314(음성 fixture 목록) · L479-485(DD4 위협모델) |
| security | LOW | DD4a의 유출 서술이 Task 5의 단계 순서와 어긋난다. DD4a는 '`redaction_ok` 차단은 발행 이후 탐지다. artifact는 판정 전에 이미 올라가 있다'(L600)고 적지만 Task 5는 업로드를 판정 **뒤**에 `if: always()`로 두라고 요구한다(L994·L996-1002). 보안 결과(차단해도 발행은 이미 일어남)는 같지만, 유출 순서에 대한 기록이 실제 배선과 다르면 다음 사람이 stage 3 차단을 발행 방지로 오해한다 — DD3이 stage 3을 '유출은 정보가 아니라 사고'(L471-472)로 정당화하는 자리라 특히 그렇다. | plan L600 대 L994·L996-1002 |
| test | HIGH | Task 6(Windows matrix)의 Validate는 구성상 만족 불가이고, 실패 시 '측정이 틀렸다'와 '업로드가 충돌했다'를 구분할 수 없다 — 이 계획이 열세 라운드에 걸쳐 blocking으로 다룬 바로 그 형태다. 게다가 baseline.yml에는 어떤 오라클도 걸려 있지 않아 이 편집 전체가 반증 불가다. | Task 6은 '`.github/workflows/test-suite-baseline.yml` matrix에 `windows-latest`를 추가하고 dispatch 1회'만 지시하고 Validate는 'Windows artifact 내용이 `per_file.length === files_total`'이다(plan L1115-1119). 그러나 `.github/workflows/test-suite-baseline.yml:99-100`의 artifact 이름·파일명은 `test-suite-baseline-node${{ matrix.node }}` / `baseline-node${{ matrix.node }}.json`으로 **node 축만** 담고, `:46`은 `runs-on: ubuntu-latest` 하드코딩이다. OS 축을 추가하면 같은 node 버전의 두 job이 동일 artifact 이름을 올려 `actions/upload-artifact@v4`가 중복 이름을 거부하므로 'Windows artifact'가 존재하지 않는다. 같은 파일의 주석 `:92-94`가 'artifact 이름은 계약이다'라고 못박고 Task 0의 Validate가 `gh run download --name test-suite-baseline-node20`(plan L736)에 의존하므로 그 계약도 함께 깨진다. 또한 PRD L25는 'Windows runner 기본 pwsh는 … `shell: bash`가 load-bearing'이라 실측했는데 Task 6은 `shell: bash`도 `runs-on: ${{ matrix.os }}`도 언급하지 않으며, 기존 단계들은 `/tmp/enum.txt`(:79-81) 같은 bash 전용 경로를 쓴다. Task 7 오라클(plan L1200-1276)의 스캔 대상은 `test-suite.yml`뿐이라 baseline.yml 편집을 붉게 만들 단언은 0건이다. |
| test | MEDIUM | DD1의 load-bearing 편집('baseline.yml에서 `pull_request` 트리거 제거')에 대응하는 test·오라클·Validate 줄이 하나도 없다 — 그 편집이 통째로 누락돼도 전 검사가 green이다. | DD1(plan L291-294)은 '`pull_request` 트리거를 **제거**한다 … 제거하면 두 workflow가 같은 스위트를 중복 실행하는 일도 함께 사라진다'를 주장하고 Task 5의 2번 항목(plan L1106)이 그것을 지시한다. 그러나 Task 5의 Validate(plan L1110-1111)는 신규 `test-suite` 체크의 발화와 job 이름만 확인하고, Task 7의 합성 fixture 목록(plan L1306-1317)과 단언 1~3(L1200-1274)은 전부 `test-suite.yml`을 대상으로 한다. `## Validation` 블록(L1388-1480) 어디에도 baseline.yml을 읽는 명령이 없다. 계획 자신이 반복 경계한 '기계는 만들어지고 그것을 부르는 한 줄이 빠진다'의 역방향(편집 자체가 빠진다) 사례다. |
| invariant | HIGH | DD9의 삭제-면제(`allow_deletions`) 항목 수 상한이 저장될 자리가 없어, 계획이 요구한 '등가 pin' 단언은 구조적으로 동어반복이다 — 그 결과 배선을 끊는 PR이 상수 편집(=diff 가시성) 없이 면제 경로를 append하는 것만으로 삭제 래칫을 통과할 수 있다. 이는 R13이 열거 sanity에서 잡아낸 '좌·우변이 같은 수량' 결함의 삭제 축 재현이다. | plan L923-924는 `allow_deletions`가 '항목 수 상한이 등가로 pin된다'고 요구하고 L945-946은 '`allow_deletions`의 항목 수 상한도 실제 항목 수와 등가다'라고 단언을 지시한다. 그러나 그 상한을 담는 키는 어디에도 선언되지 않는다: floor 파일의 키 집합은 plan L695·L921-923에서 정확히 셋(`tracked`·`max_excluded_files`·`allow_deletions`)이고, gate.js fail-closed의 키 부재 검사도 같은 셋만 열거한다(plan L844-847). `max_excluded_files`처럼 독립 2항이 존재하지 않으므로 단언은 `allow_deletions.length === allow_deletions.length`가 되며, plan L935-938이 이 상한을 '경로 append만으로 missing ⊆ allow_deletions가 되어 게이트가 green'인 실패 모드의 mitigation으로 명시적으로 들고 있다. |
| invariant | MEDIUM | 게이트가 고장 났을 때의 유일한 롤백 경로(required check 일시 해제)가 이전 동작을 복원한다는 보장이 test·CI 어디에도 pin되지 않고, 미복원 상태에서 강제 축이 조용히 장식이 된다. 계획은 이 한계를 인정하지만, 그 인정이 곧 '게이트가 열린 채 남을 수 있다'는 상태를 감수하는 것이다. | plan L1338-1349: '관리자가 branch protection에서 `test-suite` required check를 일시 해제 → 수정 PR 머지 → 즉시 재설정. "잊는 것을 막는 기계가 이미 있다"고 적었던 것은 거짓이다 … 어떤 workflow도 schedule도 hook도 그것을 부르지 않는다. 아무도 돌리지 않으면 해제된 required check는 무기한 조용히 남고 이 milestone의 강제 축 전체가 장식이 된다'. 계획에는 `## Rollback` 절이 없고 복원 여부를 재는 자동 검사도 0건이다. |
| invariant | LOW | DD2의 세 번째 차단 조건인 `exclusions_digest` 앵커가 이 milestone이 새로 추가하는 `ticket` 필드를 덮지 않는다 — 새 필드가 무결성 해시의 바깥에 착지한다. | `scripts/test-suite/enumerate.js:77`의 `normalizeExclusions`는 `{pattern, reason}`만 반환해 `ticket`을 버리고, `:84-90`의 `exclusionsDigest`는 `pattern + ' ' + reason`만 해싱한다. plan L378-384는 이 digest를 '앵커링'이라 부르며 measurement와 격리 목록이 '같은 실행에서 나왔다'는 보장으로 쓰지만, ticket만 다른 두 목록은 동일 digest를 내므로 DD7이 요구한 ticket 계약은 앵커의 사거리 밖이다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | 인용 검증: `.github/workflows/version-declaration-gate.yml:21-24·57-60·62-65`, `.github/workflows/test-suite-baseline.yml:19-25·60-71·88·95-96·107`, `scripts/test-suite/run.js:179-183·213-214`, `scripts/test-suite/enumerate.js:49-79·111-132` — 전부 계획이 주장하는 대로였다. 공격한 축: (1) `inputs.js`/`gate.js`/`coverage.js` 3자 소유권이 순환이나 이중 소유가 되는가 — R11·R12가 이미 계약/구현 소유자를 갈라 두었고 반증 못 함. (2) `exclusions_digest` 앵커가 `ticket`을 덮지 않아 우회 가능한가 — digest는 pattern+reason 기반이고 `ticket` 강제는 별도 검증기라 축이 분리돼 있어 결함 아님. (3) `unexplained`가 vacuous한가 — DD2가 이미 R10 지적을 흡수해 정합 검사 한쪽 방향으로 재프레이밍함. (4) 절단 A가 자기 심은 신호를 관측하는 순환인가 — `stage=1` 판별자로 갈림, 성립. (5) merge ref와 새로 fetch한 `origin/<base>`의 시차로 `deleted_without_allowance` 위양성이 나는가 — 창이 좁고 실측 근거가 없어 finding으로 올리지 않음. 실제로 뚫린 것은 두 래칫(정적 floor ↔ base 집합 차)의 경계 — 같은 2단계에 사는 두 조건이 서로의 면제 경로를 지우고, 그 floor 단언이 판정보다 앞선 단계에 있어 축 D 절단 B의 증거 경로를 끊는다. |
| security | pass | 공격 시도: (1) `${{ }}` 주입 — `env:` 간접 + `github.base_ref` 값 pin이 실제로 닫혀 있어 실패(L1089-1095, L1214-1220). (2) fork-PR 토큰/시크릿 — `pull_request_target` 부재·`secrets.` 미주입 단언이 실재해 정면 경로는 실패했고, 대신 단언 *형태*(존재 기반)의 우회를 찾음. (3) `--allow-codex` CI 가드 — `scripts/test-suite/run.js:644-666`에서 main 플래그 파싱 지점이고 `main`/`parseArgv`가 `module.exports`(L728-747)에 없어 spawn seam 요구가 정확했다. (4) `per_file`/`foldChunks`/`ok` 인용 — `run.js:213-214`·`:725` 실측 일치, 반증 실패. (5) exclusions 런타임 변조 — `exclusions_digest` 앵커가 fail-closed로 접어 실패. 같은 공격을 floor 입력에 옮기니 앵커가 없어 성립(finding 1·2). (6) `git ls-files`가 index를 읽으므로 worktree-only 변조로 tracked 집합을 흔드는 경로는 실패. (7) `allow_deletions`의 glob/리터럴, 경로 traversal — 이미 리터럴 정확 일치로 닫혀 있어 실패(L926-933). |
| test | fail | plan 전문(1657행)과 PRD를 읽고, 인용된 소스를 직접 대조했다. (1) `scripts/tests/test-suite.test.js:690-728`을 열어 Task 4가 근거로 든 `childEnv`/`allowCodex` 호출(L701·L720)이 실재하는지 확인 — 정확했다. (2) `.github/workflows/test-suite-baseline.yml` 전문을 읽어 DD1·DD8·Task 6이 편집하는 표면에 오라클이 있는지 확인 — 없었고 artifact 이름 계약 충돌을 발견했다(위 HIGH). (3) `## Validation` 4b의 `--base-ref HEAD`가 R10이 공격 벡터로 지목한 값과 같아 래칫이 접히는지 검사 — `--apply-delete`가 `git rm`으로 index를 바꾸므로 `git ls-tree HEAD` 기준 base_set과 `git ls-files` head_set이 실제로 갈린다. 결함 아님. (4) Acceptance 3-A가 stage 번호를 판별자로 쓰는 것이 R9의 '증거는 stage가 아니라 reasons' 규율과 모순인지 검사 — stage=1은 `suite_red` 단독 칸이라 판별력이 있다. 결함 아님. (5) Task 2 (12)(13), Task 2b (g)(g2)(k)(m)(l), Task 3 등가 단언, Task 7 (f)(f2)(e) 위양성 짝 단언이 각 주장의 반증 경로를 실제로 갖는지 개별 확인 — 대응이 있었다. |
| invariant | fail | DD3 판정 순서(0~3단계)를 run.js 소스로 검증했다 — `foldChunks`(run.js:163-220)가 `ok = measuredAll && attr.ok`를 만들고 `per_file: ok ? perFile : null`을 방출하므로 stage 0의 `ok:false ∧ exit_code:0` 시나리오와 `per_file` null 정본 주장은 실제로 참이다. 비수치 exit_code가 `Number(...)\|\|0`으로 접혀 stage 1을 우회하는 경로를 찾았으나 그 chunk는 `ok!==true`가 되어 stage 0이 먼저 막는다. 열거·격리 경로는 enumerate.js:98-138로 확인해 `included ∪ excluded = tracked ∩ *.test.js` 구성 보장과 `**` glob 확장 주장이 정확함을 확인했다. base 대조 래칫의 위양성(브랜치가 main보다 뒤처져 base에만 있는 파일이 missing으로 잡힘)을 노렸으나 `pull_request`가 merge ref를 체크아웃하므로 head_set이 base를 포함해 성립하지 않았다. 커밋된 가짜 `measurement.json`으로 게이트를 속이는 경로는 전수 실행 단계가 `>`로 덮어쓰고 그 단계 실패 시 job이 멈추므로 닫혀 있었다. `--base-ref HEAD`(Validation 4b)가 래칫을 항상 참으로 접는다는 자기모순을 의심했으나 base는 `ls-tree`(커밋 축)·head는 `ls-files`(index)라 `git rm` 후 실제로 갈라져 성립했다. 남은 셋이 위 findings다. |

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
  "wall_clock_ms": 228035,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:b3acf7da33fce287ecde49090978e006390c8aed3c5c7cc4e58fa7c5287f44be",
  "plan_path": ".claude/plans/ci-full-suite-m3m.plan.md",
  "recorded_at": "2026-09-04T03:47:12.022Z"
}
```
