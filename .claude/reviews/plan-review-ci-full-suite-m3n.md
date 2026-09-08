# Plan Review Panel — ci-full-suite-m3n

**Plan**: `.claude/plans/ci-full-suite-m3n.plan.md` · **Plan version**: `sha256:760aaab8fea57a06eda1d1eb2315fd9763e37c2c5756b6af2ea5d1479c40971a`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 4 blocking finding(s): architect/HIGH, architect/FAIL, invariant/HIGH, invariant/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | R14의 '여백 불변식'이 산술적으로 자기 목적을 부정한다 — 그것이 살리려던 두 경로(축 D 절단 B의 producer · allow_deletions 정식 삭제)가 모두 이 단언에서 red가 된다. Task 3은 floor = (작성 시점 tracked T0) − (max_allowed_deletions D + 1)로 못박고(plan:958-963), 같은 Task가 '현재 tracked − floor >= max_allowed_deletions + 1'을 실제 저장소에 대해 단언한다(plan:997). 파일 1개가 삭제된 트리에서 좌변 = (T0−1) − (T0−D−1) = D 이고 우변 = D+1 이므로 D >= D+1 은 항상 거짓이다. 따라서 plan:1093-1094의 '여백 불변식이 여백 ≥ 1을 보장하므로 파일 하나가 사라져도 이 단계는 green이고 판정이 실제로 돌아 reasons에 deleted_without_allowance를 싣는다'는 거짓이며, 판정자 자기 test 단계가 판정보다 앞이라(plan:1053) gate.json이 생성되지 않아 축 D 절단 B의 CI producer가 다시 사라진다 — 계획 스스로 '증거 요건에 CI producer가 없다'의 네 번째 재현이라 적은 것의 다섯 번째 재현이다. 같은 산술이 정상 운용의 정식 삭제도 막는다: allow_deletions에 1건을 등재하고 D=0→1로 올리는 PR의 트리에서 좌변 = 0, 우변 = 2 이므로 red이고, 그 상태의 출구는 이 계획이 명시적으로 금지한 floor 하향뿐이다(plan:960-962, 672). 즉 R14가 '면제 출구를 실재하게 만든다'며 도입한 기계가 그 출구를 다시 닫는다. | plan .claude/plans/ci-full-suite-m3n.plan.md:958-963 (floor = 작성 시점 tracked − (max_allowed_deletions + 1)) · :997-1003 (여백 불변식과 '(ii) 절단 B가 파일 1개를 지운 트리에서 이 단언이 여전히 green') · :1088-1097 (producer 생존 논증) · :672-675 ('정당한 삭제의 출구는 floor 하향이 아니라 allow_deletions') |
| architect | MEDIUM | gate.js의 seam이 두 가지로 동시에 서술돼 stage 2의 소유자가 모호하다. 순수 함수 시그니처는 `judge({measurement, coverage})`로 coverage를 **이미 계산된 입력**으로 받는데(plan:852-853), 같은 계획이 'gate.js가 computeCoverage를 2단계에서 호출한다'(plan:813-814, :876-877)고 적는다. 전자대로 구현하면 커버리지 계산이 stage 0/1보다 **먼저** 일어나므로 DD3이 '순서'로 얻는다고 주장한 성질(0단계 이전에는 아무것도 판정하지 않는다)이 CLI 층에서 성립하지 않으며, 이를 붉게 만들 단언이 없다 — (b)의 단락 단언은 judge에 coverage를 주입해 부르므로 계산 시점을 볼 수 없고, spawn 기반 단언은 (i)(j)(k)에 한정된다(plan:942-946). 방향은 fail-closed라 게이트를 열지는 않지만, stage 0의 진단 메시지 계약((h))이 도달하지 못하는 구성이 통과한다. | plan:852-853 `judge({measurement, coverage})` vs plan:876-877 'computeCoverage를 2단계에서 호출하고' · plan:894-946 (분기 (b)·(h)는 judge 직접 호출, spawn seam은 (i)(j)(k)에만 명시) |
| security | MEDIUM | DD7/DD4a의 위조 표면 열거가 '런타임 변조 채널'을 빠뜨린다 — 게이트의 판정 입력(격리 목록·floor 상수·measurement)은 PR이 작성한 test 코드가 **먼저** 실행된 뒤에 디스크에서 읽히므로, DD7이 통제의 근거로 든 '리뷰 표면에 반드시 나타난다'가 절대 명제로는 거짓이다. | plan L1053-1054 단계 순서 = '… → 판정자 자기 test → 전수 실행 → 판정 → 업로드'. 즉 실제 저장소를 읽는 등가/여백 단언(plan L991-1003)은 전수 실행 **이전**에 끝나고, 이후 `run.js`가 tracked `*.test.js` 전부(PR이 추가한 파일 포함)를 러너 워크스페이스 쓰기 권한으로 돌린 다음 gate가 `.github/test-suite-floor.json`·`.github/test-suite-exclusions.json`·`measurement.json`을 새로 읽는다(plan L1159-1163). 그런데 DD4a(L620-623)는 위조 표면을 '래칫 상수 셋과 판정 모듈이 전부 tracked 파일이라 같은 PR에서 함께 수정 가능'으로만 열거하고, DD7(L584-585)은 '격리 추가는 tracked 파일의 diff가 되어 리뷰 표면에 반드시 나타난다'고 단정한다. 상수 diff가 무변경이어도 런타임 변조로 같은 결과가 나오는 경로가 열거 밖이다. |
| security | LOW | DD4a의 사실 서술 'artifact는 판정 전에 이미 올라가 있다'가 이 계획의 workflow 형태와 어긋나며, 실질 결론(stage 3 차단은 유출을 막지 못한다)이 그 오기 때문에 흐려진다. | DD4a L624 — "`redaction_ok` 차단은 **발행 이후 탐지**다. artifact는 판정 전에 이미 올라가 있다." 그러나 Task 5는 업로드를 판정 **뒤** 마지막 단계 + `if: always()`로 못박고(L1053-1054·L1364-1365) Task 7 오라클 2b가 그 형태를 단언한다. 실제 결과는 '판정 전 발행'이 아니라 '차단 판정에도 불구하고 조건 없이 발행'이며, `redaction_ok=false`인 산출은 잔여 절대경로를 본문에 담은 그 파일이다(`scripts/test-suite/reporter.mjs:215`). |
| security | LOW | `persist-credentials: false`와 `git fetch --no-tags origin "$BASE_REF"`의 조합을 '미러 원본 그대로'라고 적었으나 미러 원본은 자격증명을 유지한다 — 인증이 필요한 구성에서는 base 해소가 실패하고 fail-closed 게이트가 전 PR을 영구 red로 만든다(R8이 닫았다고 적은 바로 그 상태). | plan L1099-1112가 `.github/workflows/version-declaration-gate.yml:21-24`·`:57-60`을 '그대로 미러한다'고 적는다. 그러나 그 파일의 checkout(:48-50)에는 `persist-credentials: false`가 없고 fetch(:60)는 토큰이 남은 상태로 돈다. 새 workflow는 DD4(L507)·Task 5(L1051-1052)가 `persist-credentials: false`를 요구하므로 fetch가 비인증으로 돈다 — 공개 저장소에서만 성립하는 전제이고 그 전제는 계획 어디에도 적혀 있지 않다. |
| test | MEDIUM | Validation 검사 4b는 형제 검사 7·7b가 모두 가진 Windows-red 완화 분기가 없어, DD8이 명시적으로 허용한 상태(Windows 전용 red 잔존)에서 DD9 삭제 래칫의 유일한 로컬 반증 경로가 조건부 만족 불가가 된다. 4b는 `reasons`에 `deleted_without_allowance`가 없으면 hard `exit 1`인데, Windows 전용 red가 하나라도 있으면 gate가 stage 1 `suite_red`에서 단락해 그 코드가 실릴 수 없다. | plan L1561-1563 (`test "$DEL_RC" -ne 0 \|\| {...exit 1}` + `if(!(j.reasons\|\|[]).includes("deleted_without_allowance")){...process.exit(1)}`) 대 L1583(검사 7의 `echo "note: ..."`)·L1590-1598(7b의 `\|\| echo "note: 로컬 게이트 차단 — Windows 전용 red가 남아 있으면 정상이다"`). 같은 비대칭이 R9에서 7b에 대해 이미 흡수됐다(plan L1592: "앞선 라운드는 7b에만 완화 분기를 두지 않아 비대칭이었다"). |
| test | MEDIUM | 강제 workflow의 '격리 목록 검증' 단계가 의존하는 `exclusions.js --check` CLI의 종료코드 전파를 단언하는 분기가 0건이다. 형제 둘은 같은 축을 리뷰 라운드를 들여 명시 분기로 닫았는데(coverage (10) · gate (m)) exclusions만 모듈 throw만 단언한다. 오라클은 그 단계의 *존재*만 본다. | plan L990-991(Task 3 Validate: "`ticket` 부재 throw · 항목 수 상한 초과 throw" — CLI exit 단언 없음) 대 L836("(10) `ok=false`인 모든 분기에서 CLI가 비영점")·L921-927("(m) `blocked`가 종료코드에 도달한다 … `gate.js`에는 없었다(L2 R13 test)"). Task 7 오라클 2b는 존재만 단언한다 — L1357: "격리 목록 검증(`exclusions.js --check`) … 이 전부 실행 줄로 존재한다". |
| test | MEDIUM | 절단 A가 심는 붉은 test 파일에 선택 규칙이 없다 — 절단 B는 세 규칙을 갖는다((e5)). 심은 파일이 `.github/test-suite-exclusions.json`의 어떤 pattern에 걸리면 (a) 그 파일이 격리돼 red가 발생하지 않고 (b) `max_excluded_files` 등가 단언이 판정보다 앞선 자기 test 단계를 red로 만들어 `gate.json`이 생성되지 않는다 — R14가 B에 대해 닫은 '자기 test ↔ 절단 결합' 그대로가 A에 남아 있다. | plan L1418-1424 ((e5) B의 선택 규칙 셋, 그중 (2)가 정확히 격리 패턴 회피)와 L1082-1097("여백이 producer를 살린다" — B에만 적용된 논증) 대 L1226-1228의 A 기술("붉은 test 파일 1개를 tracked로 심고 걷는다" — 선택 제약 없음). 등가 단언은 L991-992: "`max_excluded_files`는 격리 목록의 실제 확장 파일 수와 정확히 같다(등가)". |
| invariant | HIGH | Validation 검사 4b(삭제 래칫 왕복)는 이 계획이 정상으로 선언한 환경에서 구성상 만족 불가다 — gate가 stage 1(suite_red)에서 단락하므로 reasons에 deleted_without_allowance가 실릴 수 없고, 그 상태의 유일한 출구는 이 계획이 금지한 '검사 완화'다. 이는 계획이 R7·R13에서 두 번 흡수한 '만족 불가와 안 했다를 구분할 수 없다'의 세 번째 재현이며, 삭제 래칫의 유일한 로컬 반증 수단이 사라진다. | plan L869-870 "단계 순서(0→1→2→3)는 앞 단계에서 막히면 뒤를 평가하지 않지만" + L462 stage1 = `measurement.exit_code === 0` 실패 시 차단 → plan L1557-1563: 4b가 `/tmp/m3-local.json`(검사 7의 로컬 전수 산출)로 gate를 돌린 뒤 `if(!(j.reasons\|\|[]).includes("deleted_without_allowance")) … process.exit(1)`로 **hard-fail**한다. 그런데 같은 파일 L1590-1598은 같은 measurement에 대해 "**Windows 로컬에서는 통과하지 않을 수 있다** … 1단계가 여기서 막히는 것은 정상이다"라며 7b에만 `\|\| echo note` 완화를 둔다. 즉 로컬 suite가 red인 정상 상태에서 4b는 항상 `reasons=['suite_red']`를 받아 실패한다. 4b는 완화 분기가 없다. |
| invariant | MEDIUM | 축 D 절단 A의 대상 파일 선택 규칙이 0건이라, B에 대해 R14가 닫은 '자기 test 단계가 판정보다 먼저 red가 되어 producer가 사라진다'가 A 쪽에 그대로 열려 있다. | plan L1418-1424는 절단 B에만 선택 규칙 셋(존재 단언 test 부재 · 격리 pattern 미매치 · allow_deletions 부재)을 두고 그 이유를 "걸리면 격리 확장 파일 수가 줄어 `max_excluded_files` 등가 단언이 자기 test 단계에서 red가 되고, 판정 단계가 실행되지 않아 이 실험의 producer가 사라진다"로 적는다. 절단 A(L1225-1230 `--apply-red`: "붉은 test 파일 1개를 tracked로 심고 걷는다")에는 어떤 선택 규칙도 없다. 심은 파일이 `.github/test-suite-exclusions.json`의 어떤 pattern에 걸리면 (i) 그 파일은 격리돼 실행되지 않아 suite red가 발생하지 않고 (ii) `max_excluded_files` 등가 단언(L992)이 판정보다 앞선 자기 test 단계(L1074-1076)에서 red가 되어 gate.json이 생성되지 않는다 → Acceptance 3-A가 요구하는 `stage=1` 증거(L1761-1764)의 producer가 CI에 없다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | (1) 인용 검증: run.js:10-12·179·213-214·489-535·577-580·724(ok=측정 성립, exit_code null→0 접힘, per_file null 정본, exclusions_digest 봉인)과 enumerate.js globToRegExp의 `**` 경로 구분자 초과 확장·normalizeExclusions throw·L111-132 이분 구성, version-declaration-gate.yml L21-24·:59-60·:62-65(판별력 test를 가드 앞 독립 단계)를 전부 원본에서 확인했다 — 계획의 서술과 일치했다. (2) 삭제 래칫의 경계: merge ref 체크아웃 + `origin/<base>` tip 대조가 base 추가분에 무감한지, `git ls-files`(index) 대 `git ls-tree`(커밋) 축 차이가 4b의 `--base-ref HEAD` 왕복을 위양성으로 만드는지 검사했고 둘 다 성립했다. (3) exclusions_digest 앵커가 CI에서 공허한지(같은 리터럴 경로를 두 단계가 읽으므로) 따졌으나, 전수 실행 줄에서 `--exclude-from`이 소실되는 실제 배선 사고를 잡으므로 공허하지 않았다. (4) `max_excluded_files` 등가 단언이 무관한 PR을 붉히는지 — 계획이 그 red를 신호로 정당화한 논증이 성립했다. (5) inputs.js의 '공유 구현' 주장은 parity test 하나로만 지켜지나 계획이 그 한계를 명시하고 있어 별도 finding으로 올리지 않았다. 그러다 Task 3의 floor 공식과 여백 불변식을 실제로 대입해 보는 과정에서 위 HIGH를 찾았다. |
| security | pass | 공격한 축: (1) fork-PR 위협모델 — `permissions: contents: read` · `persist-credentials: false` · `pull_request_target` 부재 · SHA pin · `secrets` 미주입이 오라클 단언과 음성 fixture로 실제로 강제되는지 확인했고(plan L1342-1349·L1429-1436), baseline이 문서화한 S2 credential 유출 경로(`.github/workflows/test-suite-baseline.yml:60-67`)가 새 workflow에서 닫혀 있음을 확인했다 — 결함 못 찾음. (2) 셸 주입 — `${{ }}`가 `env:` 간접으로 옮겨졌고 `BASE_REF`가 `github.base_ref`(fallback 'main', fork가 통제 불가)에 묶이며 그 매핑 자체를 오라클이 단언한다 — `head_ref`/`HEAD` 치환 fixture도 있어 landing 실패. (3) durable artifact 유출(이 저장소의 절대경로 cwd 선례) — `run.js:568-594`가 봉인하는 필드에 cwd·hostname·env가 없고, `--merge-into`가 `redaction_ok !== true` 원소를 거부하므로 git-tracked 컨테이너 오염 경로를 못 만들었다. (4) 경로/traversal — `allow_deletions.path`가 리터럴 정확 일치로 못박혀 있고(L974-981) 격리 glob의 `**` 확장은 `max_excluded_files` 등가 단언과 분기 (13)이 덮는다; `enumerate.js:60-79`가 실제로 throw함을 원문으로 확인. (5) digest 앵커링 — `exclusionsDigest`(`enumerate.js:84-90`)가 `pattern+reason`만 해싱하므로 gate 재계산과 measurement 봉인값의 대조가 성립함을 확인, 부정합 못 찾음. 남은 셋(위 findings)은 전부 MEDIUM 이하이며 HIGH로 올릴 만한 '입력 → 결과' 경로를 세우지 못했다. |
| test | pass | 공격한 것: (1) DD3 stage-0 시나리오가 실제 producer 모양인지 — `run.js:489-505`를 읽어 `{ok:false, exit_code:null, redaction_ok:true}`가 실재함을 확인, 계획의 인용이 정확했다. (2) `per_file: ok ? perFile : null`(run.js:213-214)과 `files_total = files.length`(:577) 인용 검증 — 둘 다 정확. (3) `per_file[].file`이 `git ls-files` 출력과 같은 repo-relative posix인지 — `redact.js:245-270`로 확인, stage 0 집합 차와 4b 좁히기 스크립트의 전제가 성립한다. (4) `exclusionsDigest`가 `ticket`을 해싱하는지(하면 run.js↔gate 사이 영구 mismatch) — `enumerate.js:84-90`이 pattern+reason만 해싱하므로 무해. (5) Task 3 재배선이 기존 test를 pin된 상태에서 깨뜨리는지 — `test-suite.test.js`의 exclusions 사용은 전부 `enumerateTests` 직접 호출이고 `run.js --exclude-from` CLI 경로가 아니라 무해. (6) Task 4의 `--allow-codex` 가드가 기존 test를 CI에서만 깨는지 — `main()`의 플래그 파싱은 `module.exports`(run.js:728-747) 밖이고 test는 `childEnv`만 부르므로 위치 이동이 옳다. (7) `failing` 필드가 실재 producer인지(A의 수용 증거) — reporter.mjs:203에 실재. 이 일곱은 반증에 실패했다. 남은 셋은 위 findings이며 전부 MEDIUM이라 HIGH/CRITICAL 없음. |
| invariant | fail | DD3 판정 순서(0→3)와 단락/누적 규칙을 4b·7b·(e4)·Acceptance 3-A/3-B의 증거 요건과 대조해 각 단언이 도달 가능한 stage에서 성립하는지 추적 — 4b가 로컬 red 환경에서 도달 불가임을 확인. gate.js fail-closed 여섯(git 실패·빈 tracked·--measurement/--floor-from/--exclude-from 부재·--base-ref 해소 실패)과 floor 키 열거 넷의 부재/판독불가/키부재 방향을 각각 뒤집어 봤으나 전부 차단 방향. allow_deletions의 리터럴 경로·ticket·max_allowed_deletions 등가 단언이 self-test 단계(CI 판정 앞)에서 실제로 강제되는 경로를 추적 — 닫혀 있음. exclusions_digest 앵커링, measurement↔tree 정합(측정에는 있는데 트리에 없음/그 반대) 양방향, rename=삭제 fail-closed 방향, `--base-ref HEAD`로 base_set=head_set 접기, 부등식→집합 차 회귀, `continue-on-error`·`paths`·`secrets` 오라클 사거리, `if: always()` 업로드 순서를 각각 공격했으나 전부 단언으로 덮여 있었다. run.js 인용(:10-12·:179-183·:213-214·:725 계약)은 소스와 일치함을 확인했다. 롤백 축(required check 일시 해제 절차)은 기계 부재를 계획이 명시적으로 자백하고 있어 은폐가 아니다. 절단 A/B 대상 선택 규칙의 비대칭이 남은 실질 결함이다. |

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
  "wall_clock_ms": 281154,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:760aaab8fea57a06eda1d1eb2315fd9763e37c2c5756b6af2ea5d1479c40971a",
  "plan_path": ".claude/plans/ci-full-suite-m3n.plan.md",
  "recorded_at": "2026-09-04T04:06:30.405Z"
}
```
