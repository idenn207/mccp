# Plan Review Panel — ci-full-suite-m3k

**Plan**: `.claude/plans/ci-full-suite-m3k.plan.md` · **Plan version**: `sha256:328b5580e7d869e1a11f03c00741f832b78015d177851a1d8a472bbe16643cdb`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 2 blocking finding(s): architect/HIGH, architect/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | R11의 `${{ }}` env-간접 흡수가 R10의 `--base-ref` 값 pin 단언을 오라클 사거리 밖으로 밀어냈다 — 두 흡수가 같은 계획 안에서 충돌하고, 그 결과 R10이 "남긴 둘이 더 위험했다"고 지목한 바로 그 경로(`--base-ref`를 head/HEAD로 돌려 DD9 래칫을 항상 참으로 접기)가 다시 오라클 없이 열린다. | plan L987-988은 판정 줄을 `--base-ref "origin/$BASE_REF"` + `env: BASE_REF: ${{ github.base_ref \|\| 'main' }}`로 못박고("`${{ }}`는 `run:` 텍스트에 직접 보간하지 않고 **`env:` 간접**을 쓴다"), L1079-1080은 오라클 스캔 범위를 "`node scripts/test-suite/gate.js`로 시작하는 **그 `run:` 줄 안에서만**"으로 좁힌다. 그런데 L1087-1088의 단언 1은 "`--base-ref`가 `origin/` + `github.base_ref` 보간(`head_ref`도 `HEAD`도 아니다)"을 요구한다 — 그 문자열은 env 블록에 있고 판정 줄에는 `origin/$BASE_REF`만 있으므로 구성상 판정 줄 안에서 만족될 수 없다. 구현자가 줄 안의 `origin/$BASE_REF` 리터럴만 단언하면 `BASE_REF: ${{ github.head_ref }}`로 바꾸는 편집이 오라클을 통과한다. 같은 이유로 fixture (f)의 "`--base-ref`의 값을 `HEAD`로 바꾼 YAML"·"`origin/${{ github.head_ref }}`로 바꾼 YAML"(L1171-1172) 두 분기도 env 블록 편집으로 재현되면 red가 되지 않는다. |
| architect | LOW | `tracked` 채널의 소유자 선언이 두 곳에서 갈린다 — DD2는 `gate.js` CLI층의 계약이라 못박고, `## Files to Change`는 같은 해소를 `inputs.js`가 소유한다고 적는다. "한 불변식에 소유자가 둘"을 계획 스스로 금지하는데 그 금지의 적용 대상이 애매해진다. | plan L311-313 "`tracked` 해소와 fail-closed 셋(git 실패 · 빈 목록 · `--floor-from` 부재)은 **`gate.js` CLI층의 계약**" 대 L640 "`scripts/test-suite/inputs.js` \| CREATE \| `gate.js`와 `coverage.js` CLI가 **공유하는** 입력 해소 — `tracked`(`git ls-files '*.test.js'`) … 그 넷의 fail-closed". 계약 소유와 구현 소유의 분리는 산문으로만 있고 어느 짝 단언도 그 구분을 재지 않는다(Task 2 L718-721의 공유 단언은 수치·`reasons` 일치만 본다). |
| security | MEDIUM | 플랜이 R11에서 채택한 `${{ }}` env-간접 규칙을, 자기가 지시하는 base fetch 단계에서 스스로 위반한다 — 그리고 그 형태를 재는 오라클이 없다. Task 5는 판정 줄에 대해 "`${{ }}`는 `run:` 텍스트에 직접 보간하지 않고 env 간접을 쓴다 … 큰따옴표 안에서도 `$(...)`와 backtick은 실행되고 … 미러 원본이 같은 실수를 갖고 있다고 해서 물려받을 이유도 없다"(plan L987-993)고 못박아 놓고, 같은 workflow의 fetch 단계는 `git fetch --no-tags origin ${{ github.base_ref }}`(plan L935)라는 **직접 보간 형태**로 지시한다. 이는 미러 원본 `.github/workflows/version-declaration-gate.yml:60`의 형태를 그대로 물려받은 것이고, 플랜이 명시적으로 물려받지 않겠다고 적은 바로 그 줄이다. Task 7 오라클 단언 2는 그 단계의 **존재**만 단언하고 형태는 단언하지 않으므로(plan L1120-1123), 이 위반은 어떤 test에도 잡히지 않는다. 입력은 base 저장소의 브랜치명(refname은 `$`·backtick·괄호를 허용한다)이라 collaborator 통제 하에서만 실 경로가 열리지만, 플랜 자신이 "틀린 주장을 남기면 같은 패턴을 attacker-controlled 값으로 옮길 때 인용을 방어라고 믿게 된다"(L991-993)고 적은 그 위험을 코드 지시 수준에서 재도입한다. | plan L935 (`git fetch --no-tags origin ${{ github.base_ref }}`) vs plan L987-993 (env 간접 규칙) · Task 7 (2) plan L1120-1123 (존재만 단언) · 미러 원본 .github/workflows/version-declaration-gate.yml:60 |
| security | MEDIUM | 판정 줄의 `--base-ref` 값에 대해 workflow 사양과 오라클 사양이 **서로 만족 불가한 두 리터럴**을 요구한다. Task 5는 `--base-ref "origin/$BASE_REF"` + `env: BASE_REF: ${{ github.base_ref \|\| 'main' }}`를 지시하는데(plan L983-988), Task 7 오라클 단언 1은 `--base-ref`의 값이 "`origin/` + `github.base_ref` **보간**"임을 리터럴로 단언하라고 요구한다(plan L1087-1088). 구현자가 오라클을 문자 그대로 만족시키면 env 간접이 사라져 R11 security가 흡수한 하드닝이 되돌아가고, workflow 사양을 따르면 오라클 단언이 red가 된다. R10이 이 인자 값을 pin한 목적(`--base-ref`가 `HEAD`/`head_ref`로 돌면 DD9 삭제 래칫이 항상 참으로 접힌다 — plan L1090-1094)이 두 사양의 충돌 해소 방식에 따라 조용히 약화될 수 있다. | plan L983-988 (`--base-ref "origin/$BASE_REF"`, env 간접) 대 plan L1085-1088 ("`--base-ref`가 `origin/` + `github.base_ref` 보간") |
| test | MEDIUM | gate.js가 `--json`에 `coverage`(coverage_pct 등)를 싣는다는 R11 흡수 주장에 이를 단언하는 test 분기가 0건이다 — Acceptance 2·3-B의 CI producer 존재가 라이브 완주 전까지 반증 불가다 | plan L761-765 "이 필드가 없으면 Acceptance 2와 3-B가 요구하는 CI 증거에 producer가 존재하지 않는다" vs Task 2b Validate 분기 (a)~(k) (plan L795-829) — 어느 분기도 gate 출력 JSON에 `coverage_pct`/`denominator`가 실렸음을 단언하지 않는다. (e4)/Acceptance 3-B(L1499)는 그 수치를 요구하지만 소비만 한다 |
| test | MEDIUM | workflow의 '판정자 자기 test' 단계는 두 test 파일을 돌리는데 오라클은 그중 하나만 단언한다 — `wiring-cut.test.js`가 그 단계에서 조용히 빠져도 붉어질 검사가 없다(그 test가 바로 workflow 형태의 유일한 단언자다) | plan L920 실행 줄 `node --test scripts/tests/test-suite-coverage.test.js scripts/tests/wiring-cut.test.js` vs Task 7 단언 2b (plan L1124-1126) "**판정자 자기 test**(`node --test scripts/tests/test-suite-coverage.test.js`)" — wiring-cut.test.js 토큰이 단언 집합에 없다. R11 invariant가 세운 '판정자 건강은 판정자 하류에 있으면 안 된다' 규율이 절단 오라클 자신에는 절반만 적용됐다 |
| test | MEDIUM | Task 1의 Validate 줄이 1b·1c가 고치는 실패를 구조적으로 실행할 수 없다 — 로컬(Windows·Node 24) 단독 실행은 Linux 전용 symlink red와 node20 전용 red에 대해 정의상 항상 green이다 | plan L686-687("1b … DD3 symlink (Linux 전용) · 1c … (node20 전용)")와 L692-693 Validate "각 파일을 `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 <file>`로 단독 green 확인" — Node 버전·OS 지정이 없고, 실제 판정은 Task 5 CI로 미뤄져 Task 1 자체에는 반증 수단이 없다 |
| invariant | MEDIUM | `allow_deletions`의 항목 수 상한만 초기값이 어디에도 pin되지 않는다 — R9가 `max_excluded_files`에 대해 CRITICAL로 닫았다고 적은 '헤드룸으로 게이트가 되열린다'와 같은 형태의 비대칭이 삭제 면제 축에 남는다 | plan Task 3 (L848-853)은 `allow_deletions`가 '격리와 같은 3중 통제(ticket 필수·항목 수 상한)'를 받는다고 적지만, 같은 Task의 `## Validate`(L857-860)가 열거하는 래칫 상수 단언은 `max_excluded_files`(등가)와 `tracked` floor(한 방향) 둘뿐이고 `allow_deletions` 상한의 초기값을 재는 단언은 0건이다. L862-869이 '한 방향이면 상수 초기값 자체가 어디에도 pin되지 않아 … DD2가 CRITICAL로 닫았다고 적은 「한 줄 glob이 게이트를 연다」가 헤드룸으로 되열린다'고 적은 논증이 이 축에는 적용되지 않았다. 완화 요인: 면제 소모는 경로 단위 tracked diff라 헤드룸이 조용히 소모되지는 않는다. |
| invariant | MEDIUM | 라운드 캡 강제가 이 진행에 대해 구조적으로 작동하지 않았고, 열한 라운드 중 어느 것도 receipt에 봉인되지 않아 사후 감사 앵커가 산문과 `.claude/reviews/` 파일뿐이다 | plan L174-179: '그 방식(새 decision slug 재발행)은 §3.16이 열거한 문서화된 감사 우회 넷에 없다 … 즉 캡 강제는 이 진행에 대해 작동하지 않았고, 어느 라운드도 receipt에 봉인되지 않아 사후 감사는 아래 표와 `.claude/reviews/`의 기록에만 의존한다.' 계획이 이를 숨기지 않고 기록한 것은 정직하나, 게이트(캡·receipt)가 '모양은 남고 막는 것만 사라진' 상태 자체는 실재한다. |
| invariant | LOW | `gate.json` artifact 업로드에 `if: always()`가 지정되지 않아, Acceptance 3-A/3-B가 요구하는 증거(차단 run의 `stage`·`reasons`·`coverage_pct`)의 producer가 정확히 차단 경로에서만 누락될 수 있다 | plan L765는 '판정 단계는 `--json`으로 이 출력을 `gate.json`에 쓰고 artifact로 올린다'로만 적고, 같은 계획이 measurement artifact에는 L440에서 `if: always()`를 명시한다. Task 7의 오라클 단언 목록(L1084-1136)과 합성 fixture 목록(L1167-1178) 어디에도 gate.json 업로드 단계는 없다. 완화: 판정 stdout이 job 로그에 남으므로 증거가 완전히 소멸하지는 않는다. |
| invariant | LOW | CI의 '판정자 자기 test' 단계가 `MCCP_CODEX_DISABLED=1` 없이 `node --test`를 직접 부른다 — 로컬 `## Validation` 검사 1이 그 env를 붙이는 것과 비대칭이고 CLAUDE.md §3.4가 금지한 형태다 | plan L919-921의 CI 단계는 `node --test scripts/tests/test-suite-coverage.test.js scripts/tests/wiring-cut.test.js`이고, 같은 계획의 L1246은 로컬에서 같은 파일들을 `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2`로 돌린다. CLAUDE.md §3.4: '전수 회귀는 `MCCP_CODEX_DISABLED=1` 없이 돌리지 마라'. 완화: 전수 실행 단계는 `run.js`가 childEnv로 강제하므로(`scripts/test-suite/run.js:649-663`) 이 단계에 한정된다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | plan 전문(1510행)과 PRD를 읽고 인용을 실제로 열어 검증했다. 확인한 것: `version-declaration-gate.yml` L21-24·L57-60·L62-65 미러 주장(참 — fetch-depth 0 · base fetch 단계 · 가드보다 앞선 판별력 test 실재) · `run.js` `foldChunks` L179-183의 `Number(r.exit_code) \|\| 0` null→0 접힘(참) · L213-214 `per_file: ok ? perFile : null` 주석(참, 계획의 R6 정정이 맞다). 공격해서 결함 없이 끝난 축들: DD9 base 대조가 merge-ref 체크아웃에서 성립하는가(성립 — head_set은 병합 트리의 index) · Validation 4b의 `--base-ref HEAD`가 스스로 래칫을 접는가(접지 않음 — `git rm`이 index만 줄이므로 ls-tree HEAD와 차가 생긴다) · gate.js 단독 소비처 주장 대 `coverage.js --assert-accounted`의 차단 권한(계획이 명시적으로 분리) · artifact 업로드가 red run에서 성립하는가(DD4 L440의 `if: always()`가 덮는다) · 0단계 신설이 spawn 실패 시나리오를 실제로 덮는가(덮는다). 남은 것이 위 둘이고, 첫 번째는 R10·R11 두 흡수가 서로를 무효화한 구조 충돌이라 HIGH다. |
| security | pass | 공격한 축: (1) fork-PR 위협모델 — DD4/Task 7 (1b)가 permissions·persist-credentials·pull_request_target 부재·SHA pin·`secrets.` 미주입 다섯을 오라클 단언으로 못박았고, run.js가 `childEnv`로 `process.env`를 복사해도 `secrets.` 참조가 0이면 토큰이 job env에 없음을 확인해 exploit 경로를 만들지 못했다. (2) 커밋되는 산출물로의 유출 — `runOnce`의 출력 객체(run.js:568-594)에 `cwd`·hostname·homedir가 실리지 않음을 소스로 확인했고, Task 9의 컨테이너 병합은 `redaction_ok !== true` 거부(run.js:321-326)를 통과해야 하므로 §3.12 cwd-leak 선례의 재개방 경로를 세우지 못했다(잔여는 redact.js 헤더가 소유하고 플랜이 노출 *빈도* 확대를 정직하게 기록한다 — plan L442-446). (3) 신뢰 경계 — 게이트 입력 전부가 PR 통제 트리 안이라는 위조 축은 DD4a가 닫지 않는다고 명시 기록하고 이유(감시자를 함께 고칠 수 있다)를 적으므로 은폐가 아니다. (4) 부분 상태 신뢰/약한 필드 fallback — `measurement`의 `ok`·`exit_code`·`redaction_ok` 키 부재가 통과가 아니라 차단임을 (f)(g)(g2)가 단언하고, `per_file: null`을 0으로 접지 않음도 분기 (13)이 덮는다. (5) 우회 경로 — `--floor-from`/`--exclude-from`/`--measurement`/`--base-ref` 부재와 값 치환이 모두 fail-closed 여섯 + 인자 **값** 리터럴 단언으로 덮이는지 추적했고, `allow_deletions`도 R11에서 `{path,reason,ticket}` 3중 통제로 대칭화됐다. 실제로 착지한 것은 위 둘뿐이며, 둘 다 같은 축(`${{ }}` 처리 규율과 그 규율을 재는 오라클)의 내부 모순이다. HIGH/CRITICAL은 찾지 못했다. |
| test | pass | plan 전문(1510행)과 PRD를 읽고 인용 검증: run.js:213-214(`per_file: ok ? perFile : null`) · :725 · :655-662(--allow-codex 파싱) · test-suite.test.js L696/701/720(childEnv 직접 호출)은 전부 계획 서술과 일치했다. 공격한 축 — (1) Task 4 가드를 파싱 지점으로 옮긴 것이 CLI를 spawn하는 기존 test를 깨는가: grep 결과 `--allow-codex`를 CLI로 spawn하는 test 0건이라 성립하지 않음. (2) Validation 4b의 `--base-ref HEAD`가 `base_set == head_set`으로 접히는가: `--apply-delete`가 `git rm`(index)라 HEAD 커밋 트리와 갈라지므로 성립하지 않음. (3) 오라클 fixture 집합(f)에 과대허용 방향 누락이 있는가: continue-on-error·paths·secrets·SHA pin·인자 값 변조·fetch-depth·전수 실행 줄까지 전부 음성 fixture가 있어 공백을 못 찾음. (4) 단계 순서 미단언이 과대허용인가: 판정이 앞서면 measurement 부재로 fail-closed라 안전 방향. (5) 검사 2↔7 실행 순서 의존은 계획이 가드(`test -s`)로 닫음. 남은 셋이 위 findings이며 전부 MEDIUM(차단 방향이 아니라 증거·오라클 커버리지 축)이라 HIGH 부재로 pass. |
| invariant | pass | 계획이 인용한 러너 계약을 전부 원본과 대조했다 — `run.js:10-12`(`ok`=측정 성립)·`:213-214`(`per_file: ok ? perFile : null`)·`:179-183`(`Number(r.exit_code)\|\|0` 접기)·`:489-505`(spawn 실패 시 `exit_code:null`)·`:138-140`(`perFileCount===filesTotal`)·`:600`(`redaction_ok` 후처리)·`:666-679`(`--exclude-from`→`readJsonFile`, `--list`가 included만 출력)·`:697`(merge의 `validateElement`) 전부 계획의 서술과 일치했고, DD3 0~3단계의 '한 번도 안 돈 스위트가 1·3을 통과한다'는 논증도 소스에서 재현 가능했다. 미러 원본 `version-declaration-gate.yml`(fetch-depth 0 · base fetch · 가드보다 앞선 판별력 test)도 계획이 주장한 대로였다. 열려는 시도: (1) `--base-ref` 부재가 유일하게 permissive로 접히는 입력이라는 비대칭 — 그러나 fixture 목록에 '`--base-ref`만 지운 YAML'이 있어 부주의 경로는 닫힌다. (2) 삭제+추가 상쇄 — 집합 차로 이미 닫혔다. (3) `--files-from`으로 measurement를 좁히는 경로 — `unexplained` 비공집합으로 stage 2 차단. (4) glob 한 줄로 전 스위트 격리 — `max_excluded_files` 등가 단언이 막는다. (5) 4b의 `--base-ref HEAD` + `git rm` 조합 — index 반영이 명시돼 있어 성립한다. (6) 측정 실패 시 `run.js` exit 1로 판정 단계 미도달 — fail-closed(체크 red)다. 남은 것은 위 넷이고 HIGH는 찾지 못했다. |

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
  "wall_clock_ms": 273955,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:328b5580e7d869e1a11f03c00741f832b78015d177851a1d8a472bbe16643cdb",
  "plan_path": ".claude/plans/ci-full-suite-m3k.plan.md",
  "recorded_at": "2026-09-04T03:32:01.757Z"
}
```
