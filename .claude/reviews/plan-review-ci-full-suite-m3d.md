# Plan Review Panel — ci-full-suite-m3d

**Plan**: `.claude/plans/ci-full-suite-m3d.plan.md` · **Plan version**: `sha256:4d4b896da9cc217a311534caa133ca492f66b0a49338f497d4fcb23a5a66d42e`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 7 blocking finding(s): architect/HIGH, architect/FAIL, test/HIGH, test/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | DD2가 선언한 '분모 입력 채널'과 그 fail-closed는 게이트가 부르지 않는 표면에만 존재한다. `computeCoverage`는 `tracked`를 인자로 요구하는데(plan:471), 그 값을 `git ls-files '*.test.js'`로 해소하는 책임은 **coverage.js의 CLI층**에 배정돼 있고(plan:474 "`tracked`는 CLI층이 … 해소해 순수층에 넘긴다", "git 호출 실패·빈 목록은 차단"), 같은 Task가 "게이트가 직접 부르는 것은 이 CLI가 아니라 `gate.js`"라고 못박는다(plan:482). 그런데 Task 2b가 정의한 gate.js CLI의 입력은 `--measurement · --exclude-from · --floor-from` 셋뿐이고(plan:517-518), tracked를 어디서 얻는지·git 실패와 빈 목록을 어떻게 다루는지가 계획 전체에 **한 줄도 없다**(grep: 'tracked\|ls-files' 전 매칭 확인). 즉 CI가 실제로 부르는 유일한 판정 명령의 분모 입력이 미선언이고, DD2가 CRITICAL로 흡수했다고 적은 바로 그 결함(분모 채널 미선언 → measurement에서 파생하는 오독)이 게이트 경로에 그대로 남는다. Task 2 분기 (12)의 짝 단언은 **순수층**만 대상이라(plan:506-509) 이 drift를 잡지 못하고, Task 2b의 gate 분기 (a)~(f)에도 tracked 관련 단언이 없다(plan:523-532). 이것이 이 계획이 스스로 금지한 '기계는 만들어지고 그것을 부르는 한 줄이 빠진다'의 재현이다. | .claude/plans/ci-full-suite-m3d.plan.md:471-483 (computeCoverage 시그니처 + "CLI층이 git ls-files로 해소" + "게이트가 직접 부르는 것은 이 CLI가 아니라 gate.js") 대 :515-532 (gate.js 입력 3개, tracked 부재, Validate 분기 (a)-(f)에 tracked/floor-부재 단언 없음) |
| architect | MEDIUM | DD9 2번이 절단 오라클의 단언 대상으로 지목한 문자열이 최종 workflow 줄에 존재하지 않는다. DD9는 "`wiring-cut.test.js`가 `--assert-accounted`와 `--floor-from` **둘 다** 실행 줄에 존재함을 단언한다"고 적지만(plan:389-390), Task 5가 확정한 판정 한 줄은 `gate.js --measurement --exclude-from --floor-from`이라 `--assert-accounted`가 **없고**(plan:575-579), Task 7의 실제 단언 목록도 `gate.js · --measurement · --exclude-from · --floor-from`으로 그 플래그를 빼고 있다(plan:622-624). DD3이 판정을 gate.js로 옮기면서 `--assert-accounted`는 gate.js 내부 호출로 흡수됐는데 DD9 본문만 옛 설계에 머물렀다 — 구현자가 DD9를 따르면 존재하지 않는 문자열을 단언하는 test를 쓰게 되고, 계획의 두 절이 서로 다른 배선을 지시한다. | .claude/plans/ci-full-suite-m3d.plan.md:389-390 대 :575-579 및 :622-624 |
| architect | MEDIUM | Task 7이 절단 대상으로 `--exclude-from`을 고른 근거인 '두 경로 동시 발화'는 격리 목록이 비어 있으면 절반이 공허해진다. 근거는 "(2) 격리 목록이 사라져 격리 파일들이 `unexplained`로 떨어져 2단계도 막는다"인데(plan:617-620), Task 1은 Linux red를 **수리 또는 격리**로 처리하도록 열어 두었고(plan:456-458) Task 3은 항목 수 상한을 "초기 항목 수와 같게" 두므로(plan:539) 격리 0건 착지가 정상 결과다. 그 경우 `--exclude-from` 제거는 `exclusions_digest`도 `excluded.length`도 `unexplained`도 전혀 바꾸지 않아(빈 목록의 digest는 빈 목록의 digest와 같다 — scripts/test-suite/enumerate.js:84-90) 2단계는 통과하고, 축 D의 실증은 '배선을 끊었더니 게이트가 닫혔다'가 아니라 '그 배선을 단언하는 자기 test가 붉어졌다'는 자기참조 한 축으로 축소된다. 계획은 이 조건 의존을 어디에도 적지 않는다. | .claude/plans/ci-full-suite-m3d.plan.md:617-620 (두 경로 주장) · :456-458, :539 (격리 0건이 가능한 착지) · scripts/test-suite/enumerate.js:84-90 (digest는 pattern+reason 정렬 해시라 빈 목록끼리 동일) |
| test | HIGH | 축 D의 핵심 주장 "절단이 두 경로에서 게이트를 닫는다"의 두 번째 경로는 구조적으로 관측 불가하고, 어떤 test도 그 거짓을 잡지 못한다. DD3의 gate.js가 순서대로 단락(short-circuit)하기 때문이다. | plan Task 7: "`--exclude-from`을 고른 이유는 두 경로가 **함께** 발화하기 때문이다 — (1) `wiring-cut.test.js`가 red가 되어 … `gate.js` 1단계가 막으며, (2) 격리 목록이 사라져 … 2단계도 막는다." 그러나 DD3 표(plan L221-226)는 1단계 실패 시 "**차단**"이며 2단계는 1단계 통과 시에만 평가된다(Task 2b Validate (b): "`exit_code !== 0` ∧ `redaction_ok === false`여도 `stage`는 여전히 1이다"). 절단 run에서는 wiring-cut.test.js가 red이므로 stage 1에서 멈추고 경로 (2)는 결코 발화하지 않는다. Acceptance 3의 수용 증거도 artifact `failing` 하나뿐이라 경로 (2)의 부재를 구분하지 못한다. |
| test | MEDIUM | 경로 (2)는 격리 목록이 비어 있으면 실제로 참이 아니게 되는데, 계획 어디에도 격리 목록이 비어 있지 않음을 요구하거나 단언하는 것이 없다 — 즉 그 전제가 반증 가능하지 않다. | Task 1은 "수리 또는 명시 격리"를 허용하고 수리를 기본으로 둔다(Risks 표: "수리보다 격리와 티켓을 기본으로 둔다"와 상충하는 서술이 있으나 어느 쪽도 비어있지 않음을 보장하지 않는다). DD7: "상한 상수는 초기 항목 수와 같게 시작한다" — 초기 항목 수가 0일 수 있다. Task 3 Validate의 "상한 상수와 파일 항목 수 일치 단언"·"`max_excluded_files`가 격리 목록의 실제 확장 파일 수와 같음"은 0/0에서 공허하게 통과한다. |
| test | MEDIUM | DD3 0단계의 근거로 든 measurement 모양(`per_file: null`)은 러너가 최상위 산출에서 내지 않는 모양이다. Task 2 분기 (13)은 실제 producer가 낼 수 없는 손으로 만든 fixture를 단언한다. | plan L228-232는 "러너는 `{exit_code: null, per_file: null, redaction_ok: true}`를 내고(`run.js:489-505`)"라고 적지만 그 셋은 **chunk** 결과다. 최상위 measurement의 `per_file`은 `folded.per_file`(`run.js:589`)이고 `foldChunks`는 `perFile`을 배열로 시작해 `Array.isArray(r.per_file)`일 때만 push하므로(`run.js:170, 189`) spawn 실패 시 최상위 값은 `null`이 아니라 **빈 배열**이다. 따라서 분기 (13)이 겨냥한 shape는 실제 CI에서 도달하지 않고, 실재하는 shape(`per_file: []`)에 대한 2단계 판정은 별도로 단언되지 않는다. |
| test | LOW | Task 1의 Validate 명령은 그 Task가 고치는 결함을 구조적으로 검증할 수 없다 — 대상이 Linux 전용·node20 전용 red인데 검증은 로컬(Windows·Node 24) 단독 실행이다. | Task 1 Action: "1b `santa-loop-cap.test.js` DD3 symlink (Linux 전용) · 1c `dispatch-fullcycle-smoke.test.js` (node20 전용)". Task 1 Validate: "각 파일을 `MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 <file>`로 단독 green 확인." 이 명령은 수리 전에도 통과하므로 수리의 유효성을 반증하지 못한다(계획은 "전체 판정은 Task 5 이후 CI가 낸다"로 이연을 명시하지만, Task 5의 Validate는 체크 green 하나라 파일별 귀속을 주지 않는다). |
| invariant | HIGH | 게이트가 실제로 부르는 유일한 모듈(gate.js)의 커버리지 분모 입력 채널이 계획 어디에도 선언되지 않았고, 그 축의 짝 단언은 gate.js가 아니라 coverage.js 순수층에만 걸린다. DD2가 CRITICAL로 지목한 바로 그 오독(measurement에서 분모 파생)이 gate.js에서 재현되면 unexplained는 정의상 항상 0이 되고 floor도 실행 파일 수와 비교되어 두 차단 조건이 함께 무의미해지는데, 어떤 test도 붉어지지 않는다. | plan Task 2b: CLI가 받는 것은 `--measurement · --exclude-from · --floor-from` 뿐이며 tracked 해소 경로가 없다(plan:517-520). tracked를 `git ls-files`로 해소하라는 지시는 coverage.js CLI에만 있다(plan:474-475). 짝 단언 (12)는 `computeCoverage` 순수 입력에 대한 것이고(plan:506-509), gate 분기 (a)~(f)에는 분모 채널 단언이 없다(plan:523-532). Validation 7b(plan:757-760)는 어느 쪽이든 통과한다. DD9 1번의 `--floor-from` 부재 fail-closed도 `coverage.js`에만 귀속된다(plan:386-388). |
| invariant | HIGH | 강제 workflow의 '열거 sanity' 단계가 `run.js --list`와 `git ls-files '*.test.js'`의 바이트 일치를 요구하는데, `--list`는 격리 적용 **후** 집합을 출력하므로 Task 1이 계획한 격리가 1건이라도 생기는 순간 이 단계가 영구 red가 된다. DD2가 '저장소를 인질로 잡지 않는다'고 논증한 상태를 게이트의 앞 단계가 그대로 만들어내며, 그 출구는 DD2가 금지한 게이트 완화뿐이다. | `scripts/test-suite/run.js:676-679` — `flags.list`는 `enumerated.included`(격리 제외 후)만 출력한다. 기존 sanity 단계는 그 출력을 `git ls-files '*.test.js'`와 `diff`한다(`.github/workflows/test-suite-baseline.yml:77-82`). plan Task 5는 그 단계를 그대로 mirror하며 '러너의 열거와 바이트 일치를 요구하므로 분모와 분자가 같은 집합 위에 선다'고만 적고(plan:570-572), 격리 비어있지 않은 경우의 동작을 정의하지 않는다. Task 1은 원인 미규명 red의 격리를 명시 경로로 둔다(plan:456-458). |
| invariant | MEDIUM | DD3 0단계의 근거로 든 producer 모양이 실제로 산출되지 않는다. `per_file: null`은 chunk 결과이지 방출되는 measurement가 아니며, `foldChunks`는 그것을 배열로 접는다. 따라서 Task 2 분기 (13)은 합성 fixture로만 참인 단언이 되고, 이는 계획 자신이 DD2에서 금지한 '기대 모양을 손으로 만들어 놓고 진짜 producer가 그 모양을 낸다고 주장' 형태다(다만 stage 0의 `ok` 검사가 실제 spawn 실패를 잡으므로 게이트가 열리지는 않는다). | plan:228-237은 '러너는 `{exit_code: null, per_file: null, redaction_ok: true}`를 내고'라고 적고 `run.js:489-505`를 인용하지만, 그 객체는 `runChunk`의 반환이다. `run.js:189`는 `if (r && Array.isArray(r.per_file)) perFile.push...`이라 최종 `per_file`은 항상 배열이고, `run.js:566/589`가 그 접힌 값을 방출한다. plan:510-511의 분기 (13)은 그래서 실제 CI 입력을 겨냥하지 못한다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | plan 전문(929행)과 PRD 전문을 읽고 인용을 원본에서 대조했다. 확인한 citation: scripts/test-suite/run.js:10-12(ok=측정 성립)·:179-183(foldChunks가 exit_code를 Number()\|\|0으로 접음, null→0 실재)·:489-505(spawn 실패가 exit_code:null·redaction_ok:true를 냄, 실재)·:577-578(files_total=files.length=격리 후)·:580(exclusions_digest 봉인)·:213-214(per_file은 ok=false면 null) — 전부 계획의 서술과 일치했다. enumerate.js:27-50 globToRegExp의 `**`→`.*` 확장(DD2가 든 '한 줄로 게이트가 열린다' 경로)과 :55-79 normalizeExclusions의 reason throw도 실재를 확인했다. 공격한 축: (1) DD3 판정 순서가 실제로 모듈 하나에 모였는가 — 모였고 stage 0~3 단언이 순서를 반증 가능하게 한다(결함 없음), (2) exclusions_digest 앵커링이 진짜 앵커인가 — 러너가 봉인하고 coverage.js가 재계산 대조하므로 성립, (3) DD7 재배선이 소비 경로 위에 있는가 — run.js `--exclude-from`을 exclusions.js로 통과시키고 fixture 음성 단언까지 있어 성립, (4) DD9 floor 래칫의 인자 누락 — workflow 줄은 Task 7 (f)가 덮지만 gate.js 자체 계약은 미정의(위 finding 1에 포함), (5) 분모/분자 채널 정합 — 여기서 gate.js의 tracked 입력 미선언이라는 실제 경계 공백을 찾았다. 반면 baseline/enforcement 책임 분리(DD1), 축 D를 전용 job으로 두지 않는 판단(DD5), DD4a의 '닫지 않음' 기록은 공격했으나 결함을 찾지 못했다. |
| security | pass | 공격한 것들과 결과: 1) 게이트를 여는 단일 입력 위조. `{pattern:"**/*.test.js"}` 한 줄로 전 tracked를 excluded로 접는 경로를 재현하려 했으나 `enumerate.js:27-50` globToRegExp가 실제로 `**`를 `.*`로 확장함을 확인했고, plan은 그 정확한 경로를 DD2에서 열거하고 `excluded.length <= max_excluded_files`(파일 수 단위) + Task 2 분기 (4)로 음성 통제를 건다. 뚫지 못함. 2) 측정과 격리 목록의 짝짓기(anchoring 우회). `exclusions_digest`가 pattern+reason 정렬 해시임을 `enumerate.js:84-90`에서 확인했고 `run.js:580`이 산출에 봉인한다. 격리 없이 돈 measurement + 큰 목록 조합은 digest 불일치로 차단된다(DD2 3조건, Task 2 분기 (9)). 뚫지 못함. 3) "한 번도 돌지 않은 스위트가 green으로 읽힘". `run.js:492-505`(spawn 실패 시 `exit_code:null, redaction_ok:true`) + `:179`(`Number(r.exit_code)\|\|0`) + `:205-214`(`ok=false`면 `per_file:null`) 인용이 전부 실제 코드와 일치하고, plan이 gate 0단계(`measurement.ok`)와 Task 2 분기 (13)으로 닫는다. 인용 위조 없음. 4) durable artifact 유출(이 저장소의 절대경로 leak 선례). Task 9가 CI 측정을 git-tracked 컨테이너 `.claude/_meta/data/2026-09-01-suite-baseline.json`에 병합하는 축을 공격했으나, `run.js:280-334` validateElement가 `redaction_ok !== true`를 BLOCK하고 2차 residual scan을 돌리며, `redact.js:164-165`의 `posix-home` 규칙이 `/home/runner/...`를 덮는다. Linux runner 경로가 tracked 파일에 착지하는 경로를 만들지 못함. 5) fork PR 공격면. 전수 스위트가 PR이 추가한 `*.test.js`를 실행하는 것은 사실상 임의코드 실행이지만 DD4가 `contents: read` · `persist-credentials:false` · secrets 미주입 · `pull_request_target` 미사용 · SHA pin을 명시하고, 실측 mirror(`test-suite-baseline.yml:60-71`)와 일치한다. 6) 판정자 자체를 PR이 통제하는 축(래칫 상수 셋 · `gate.js`/`coverage.js`/`wiring-cut.test.js`가 전부 tracked, 같은 PR에서 동시 수정 가능; artifact가 redaction 판정보다 먼저 업로드됨). 이것이 남는 실질 잔여지만 plan이 DD4a에서 세 항목 모두를 명시적으로 열거하고 "이 게이트가 막는 것은 부주의이지 의도가 아니다"라고 닫지 않음을 기록한다 — 은폐된 잔여가 아니므로 finding으로 올리지 않는다. 7) 삭제 축(분모를 test 삭제로 줄여 100%를 유지)과 격리 축의 우회. DD9 floor + Task 3의 floor/`max_excluded_files` 짝 단언이 있고, "floor를 같은 diff에서 내리면 통과"는 삭제 금지가 아니라 말 없는 삭제 금지라고 명시된다. 8) `--allow-codex`의 CI 노출(Task 4). `run.js:454-458, 655-662`에서 오늘 배선 지점이 실제로 없고 plan이 `GITHUB_ACTIONS` throw 가드를 더한다. 내 렌즈 안에서 입력→결과 경로를 끝까지 잇는 결함을 찾지 못했다. |
| test | fail | plan 전문과 PRD를 읽고 인용을 원본과 대조했다. 확인한 것: `run.js:179-183` foldChunks의 null→0 접힘(참) · `:489-505` spawn 실패 chunk shape(참, 단 최상위와 혼동) · `:577-580` files_total/exclusions_digest(참) · `enumerate.js:72-90` normalizeExclusions/exclusionsDigest — DD2 앵커링의 재계산 일치 가능성을 확인했고 정상(digest가 ticket을 제외한 정규화 위에서 계산되므로 coverage.js 재계산이 실제로 일치한다, 반증 실패). `scripts/` 전역 grep으로 `--exclude-from`의 기존 소비처가 `readJsonFile` 단 한 곳이며 그 동작을 고정하는 기존 test가 **없음**을 확인했다(Task 3 재배선이 기존 test를 뒤집지 않는다 — 반증 실패). DD2의 `**/*.test.js` 한 줄 우회는 분기 (4)가 실제로 덮는다(반증 실패). 남은 결함은 축 D 오라클의 순서 단락과 경로 (2)의 공허성, DD3 0단계 fixture의 producer 불일치, Task 1 Validate의 플랫폼 사거리 밖 문제다. |
| invariant | fail | DD3 판정 순서 3축을 run.js의 실제 종료코드·foldChunks 접기 규칙(:163-193, :566, :725)과 대조해 unknown 입력(spawn throw, marker 부재, truncated report, signal kill)을 각각 추적했다 — stage 0가 전부 잡는다. DD2 앵커링은 enumerate.js `exclusionsDigest`(:84-90)가 pattern+reason만 해싱함을 확인해 격리 없는 측정과 큰 목록의 짝짓기가 실제로 차단됨을 인정했다. `**/*.test.js` 한 줄 우회는 globToRegExp(:27-50)로 재현 가능함을 확인했고 max_excluded_files가 그것을 닫음도 확인했다. 축 D의 절단 대상(`--exclude-from` 인자)이 게이트를 여는 방향인지 닫는 방향인지 두 경로 모두 추적해 닫는 방향임을 확인했다. 래칫 상수·판정 모듈이 같은 PR에서 수정 가능한 위조 축은 DD4a가 이미 명시 기록하므로 finding으로 올리지 않았다. Validation 검사 3의 셸 단락 평가(`&& {...; exit 1} \|\| true`)도 오탐 없이 동작함을 확인했다. 남은 결함 셋은 gate.js의 분모/floor 입력 채널 미선언, 열거 sanity와 비어있지 않은 격리의 모순, 그리고 존재하지 않는 producer 모양에 건 단언이다. |

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
  "wall_clock_ms": 199560,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:4d4b896da9cc217a311534caa133ca492f66b0a49338f497d4fcb23a5a66d42e",
  "plan_path": ".claude/plans/ci-full-suite-m3d.plan.md",
  "recorded_at": "2026-09-04T02:29:05.186Z"
}
```
