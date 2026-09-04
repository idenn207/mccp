# Plan Review Panel — ci-full-suite-m3a

**Plan**: `.claude/plans/ci-full-suite-m3a.plan.md` · **Plan version**: `sha256:84c8a1d83db84d6dd44113c362da3bc098887a7f33ff893214fc7980a10f2575`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 11 blocking finding(s): architect/HIGH, architect/FAIL, security/HIGH, security/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 축 D(음성 통제)의 CI 증거를 만들 구조가 계획 안에 없다 — Acceptance 3은 "절단이 CI에서 red를 만든 run URL"을 요구하는데, 절단을 실행할 workflow도 step도 어디에도 정의되지 않았다. DD5는 `workflow_dispatch` 전용이라 말하지만, Files to Change의 workflow는 둘뿐이고(신규 `test-suite.yml`은 Task 5에서 `pull_request` 게이트로만 규정 · `test-suite-baseline.yml`은 DD1이 dispatch 전용 '측정'으로 축소) 어느 쪽도 `wiring-cut.js --apply`를 부르는 단계를 갖지 않는다. Task 5가 못박은 단계 순서(격리 검증 → 열거 → 전수 → 커버리지 → redaction)에도 절단이 없다. 즉 라이브 완주가 산출해야 한다고 계획이 스스로 못박은 넷 중 하나가 착지할 자리가 없다. | plan L156 "CI 상시 실행은 하지 않는다(비용) — `workflow_dispatch` 전용이며" · L239-240 Files to Change의 workflow 2건 · L345-352 Task 5 단계 순서 · L622 "축 D의 절단이 CI에서 red를 만든 run URL이 존재한다. 로컬 왕복만으로는 축 D를 주장하지 않는다" — Task 7(L370-381)은 대상 줄만 정하고 호스트 workflow를 지목하지 않는다 |
| architect | MEDIUM | DD9의 floor 래칫이 강제 경로에 배선되지 않을 수 있고, 계획은 `--floor-from` 부재 시의 동작을 정의하지 않는다. `--assert-accounted`는 `unexplained > 0` **또는** `tracked < floor`로 정의되는데 floor는 별도 플래그로 주입되는 외부 입력이다. Task 5가 못박은 CI 단계 서술에는 `--floor-from`이 없고, Validation 검사 7의 로컬 호출에도 없다(검사 2에만 있다). floor 입력이 빠지면 조건의 후반절이 조용히 사라지므로, DD7이 "받아들일 수 없다"고 선언한 바로 그 실패 모드(기계는 만들어지고 부르는 한 줄이 빠진다)를 삭제 축에서 재현한다. 게다가 Task 7의 절단 오라클은 `--assert-accounted` 호출 줄의 **존재**만 단언하므로 인자 누락을 잡지 못한다. | plan L302-303 (`--assert-accounted`가 `tracked < floor`를 포함) vs L348-349 Task 5 단계 서술(`커버리지 --assert-accounted`만 명시, floor 언급 없음) · L429-433(검사 2는 `--floor-from` 포함) vs L461-462(검사 7은 미포함) · L371-374 절단 오라클은 "그 호출이 실행 줄로 존재함을 단언" |
| architect | MEDIUM | DD7이 격리 통제로 내세운 "게이트가 **그 경로만** 읽는다"는 불변식을 담는 기계가 없다. `exclusions.js`는 임의 경로를 받는 로더로 설계되고(Validation 검사 3이 fixture 경로를 넘긴다), 정본 경로 결속은 workflow 파일의 인자 한 줄에만 존재한다 — 그 파일은 PR이 편집 가능한 표면이다. 이는 M1이 명시적으로 M3 소유로 이연한 backlog 항목("사유를 승인된 출처(예: 커밋된 단일 파일)에 결속하는 것은 커버리지를 실제로 산출하는 M3의 축")이며, 계획의 Risks 표는 항목 수 증가 축만 다루고 경로 교체 축은 다루지 않는다. | plan L192-193 "격리 목록을 `.github/test-suite-exclusions.json` 한 파일에 두고 게이트가 **그 경로만** 읽는다" · L438 검사 3이 `--exclude-from scripts/tests/fixtures/exclusions-no-ticket.json`로 임의 경로 수용을 전제 · `.claude/plans/codex-findings-backlog.md:1048` (security F2, M3 소유로 이연) · plan L599 Risks 행은 항목 수 축만 언급 |
| architect | LOW | Task 순서가 자기 의존을 뒤집는다 — Task 1이 red를 `.github/test-suite-exclusions.json`에 사유·티켓과 함께 등재하라고 지시하지만, 그 파일과 스키마(`ticket` 필수)·상한 상수·검증기는 Task 3이 만든다. Task 3의 상한을 "이 시점의 항목 수"로 잡는 규칙도 Task 1이 몇 건을 넣느냐에 따라 값이 달라지므로, 두 Task의 선후가 명시되지 않으면 상한 상수의 정의가 모호하다. | plan L286 "어느 쪽도 아니면(원인 미규명) `.github/test-suite-exclusions.json`에 사유와 티켓을 달아 격리(UI7)" vs L319-322 "`.github/test-suite-exclusions.json`을 `{pattern, reason, ticket}` 배열로 만든다 … 상한 상수는 초기 항목 수와 같게 두어" |
| security | HIGH | DD7's ratchet counts exclusion *items*, not breadth — widening one existing pattern to `**/*.test.js` disables the entire merge-blocking gate while every machine check still reports pass. Item count is unchanged (ceiling not triggered), tracked file count is unchanged (DD9 floor not triggered), every tracked file lands in the `excluded` bucket so `unexplained === 0` and `--assert-accounted` exits 0. The enforcement workflow then merges PRs having executed zero tests, and the only signal is `coverage_pct` which DD2 explicitly makes non-blocking ('후보 1번(파일 수 비율)은 차단 조건이 아니라 보고 수치로 남는다', plan L102-104). | scripts/test-suite/enumerate.js:27-50 `globToRegExp` — `**` expands to `.*` crossing separators, and :126-131 any glob hit moves a file to `excluded`. Plan L194-196: '기계적 상한 둘을 얹는다 — 항목 수 상한과 `ticket` 필드 필수' (count-only); plan L216-219 DD9 floor asserts only `tracked < floor`. Nothing bounds pattern breadth or requires `excluded` count ≤ ceiling. |
| security | MEDIUM | DD9 claims to close '말 없는 삭제' but its floor is a count of tracked `*.test.js`, so deleting a wiring-asserting test while adding any trivially-named placeholder `*.test.js` in the same commit keeps `tracked` at the floor and keeps coverage at 100%. The exact axis-D failure mode DD9 cites ('배선을 끊는 커밋이 그 배선을 단언하는 test를 같이 지우면 머지 차단 게이트가 green이다') survives the ratchet. | Plan L216-219: '`.github/test-suite-floor.json`에 기대 최소 tracked 개수를 tracked 상수로 두고, `coverage.js`가 `tracked < floor`이면 `ok=false`' — the predicate is cardinality only; no identity/path set is pinned, and Task 2 Validation branch (6) only asserts `tracked < floor`. |
| test | HIGH | DD2의 `fully_skipped`는 산출할 producer가 없다. 계획은 그것을 합성 fixture 단언 하나로만 검증하므로, 실제 CI에서 이 필드가 항상 0(또는 부재)이어도 test는 영원히 green이다 — 'fixture를 기대 모양으로 손으로 만들어 놓고 진짜 producer가 그 모양을 낸다고 주장'하는 전형이다. | plan L112-114 'fully_skipped는 커버리지에 합산하지 않고 별도로 센다 … codex-companion-smoke.test.js가 러너의 codex 정책 하에서 정확히 그 상태다' + Task 2 Validate 분기 (4) 'fully_skipped가 ok를 바꾸지 않음'(합성 입력). 그러나 producer에는 skip 개념이 존재하지 않는다 — `scripts/test-suite/run.js` 전문에 'skip' 문자열 0건이고, `scripts/test-suite/reporter.mjs:146` 은 `nesting!==0`을 버리고 `nesting0_events`/`attributed_events`만 센다. `reporter.mjs`는 `## Files to Change`에 **없고** `run.js` UPDATE 사유는 (a) exclusions 재배선 · (b) allow-codex 가드 둘뿐이다(plan L248). 즉 `computeCoverage`의 `measurement` 인자에 skip 정보를 실어 줄 경로가 이 milestone 안에 만들어지지 않는다. |
| test | HIGH | DD9의 floor 래칫이 실제 게이트 경로에 배선됐는지를 확인하는 단언이 없다. 계획은 DD7에서 정확히 이 실패 모드('기계는 만들어지고 그것을 부르는 한 줄이 빠진다')를 진단하고 exclusions에는 소비-경로 배선 단언을 넣었으나, floor에는 같은 단언을 넣지 않았다. | plan L204-206은 exclusions에 대해 '러너가 exclusions.js를 거치는지'를 Task 3 Validate의 **배선 단언**(L330-331)으로 고정한다. 반면 floor는 Task 2 Validate 분기 (6)(7)이 순수 함수 `computeCoverage({...floor})`만 단언하고, Task 5의 workflow 단계 서술(L348-349 '커버리지 `--assert-accounted`')에는 `--floor-from`이 **한 번도 등장하지 않는다**. `--floor-from`은 `## Validation` 검사 2(L432)에만 나온다. 즉 `.github/workflows/test-suite.yml`이 `--floor-from`을 빠뜨려도 모든 단위 test와 CI가 green이고, DD9가 막겠다는 '말 없는 test 삭제'는 그대로 통과한다. 또한 exclusions에는 있는 '상한 상수와 파일 항목 수 일치 단언'(L329)에 해당하는 floor 값 검증도 없다. |
| test | MEDIUM | DD3(판정 순서 + '유출 판정이 red의 하류일 수 있음' 메시지)은 이 계획의 load-bearing 주장인데, 그것이 거짓일 때 붉어질 test가 없다. 검증은 green PR 라이브 완주뿐이라 red 경로가 구조적으로 실행되지 않는다. | plan L130-132가 순서(`exit_code`→coverage→`redaction_ok`)와 설명 메시지를 못박지만, Task 5의 Validate(L356-357)는 'PR을 열어 test-suite 체크가 실제로 발화하고 green임을 확인'뿐이다. green run은 정의상 `exit_code!==0 && redaction_ok===false` 분기를 밟지 않는다. Task 2의 test 분기 (1)~(7)에도 redaction/판정 순서 분기가 없고, `scripts/tests/test-suite-coverage.test.js`의 단언 목록에 `redaction_ok`가 등장하지 않는다. 즉 게이트가 순서를 뒤집어 무관한 red를 '유출'로 보고해도 어떤 test도 red가 되지 않는다. |
| test | LOW | `## Validation` 블록은 적힌 순서대로 실행하면 실패한다 — 검사 2가 검사 7이 생성하는 파일을 읽는다. 산문 주석이 그 사실을 인정하지만 명령 자체는 고쳐지지 않았다. | plan L429-433 `node scripts/test-suite/coverage.js --measurement /tmp/m3-local.json …` 대 L459-460 `… run.js … --json > /tmp/m3-local.json`(검사 7). L457 주석이 '검사 2가 이 산출을 읽으므로 순서상 먼저 돌려야 한다'고 스스로 적는다. |
| invariant | CRITICAL | 격리 래칫이 '항목 수'를 세므로 glob 한 줄이 스위트 전체를 게이트에서 지운다 — 머지 차단 게이트가 green을 유지한 채 완전히 열린다 | plan DD7: "기계적 상한 둘을 얹는다 — 항목 수 상한과 ticket 필드 필수. 상한은 ... 현재 항목 수와 같게 시작한다" + DD2 "머지 판정은 coverage_pct == 100이 아니라 unexplained == 0이다" / coverage_pct는 "차단 조건이 아니라 보고 수치". 그런데 패턴은 glob이다 — scripts/test-suite/enumerate.js:105-131 `globToRegExp(e.pattern)`로 `**`가 전 경로에 매치한다. 즉 `{pattern:"**/*.test.js", reason, ticket}` 단일 항목(=상한 미증가, ticket 충족)이면 전 tracked 파일이 excluded 버킷에 들어가 unexplained=0, tracked는 그대로라 DD9 floor도 통과하며, 유일한 신호인 coverage_pct=0은 명시적으로 비차단이다. 래칫은 '격리된 파일 수'가 아니라 '줄 수'를 잰다. |
| invariant | HIGH | DD9 floor 래칫이 게이트 호출선에 배선된다는 보장이 plan 어디에도 없다 — DD7이 스스로 지목한 '기계는 만들어지고 부르는 한 줄이 빠진다'를 DD9가 그대로 반복한다 | Task 5 단계 순서: "격리 목록 검증 → 열거 sanity → 전수 실행 → 커버리지 `--assert-accounted` → `redaction_ok`" — `--floor-from`이 없다. Task 7의 절단 오라클도 대상이 "`test-suite.yml`의 커버리지 `--assert-accounted` 호출 줄" 하나뿐이라 floor 인자 부재를 잡지 못한다. Task 2의 test 분기 (6)(7)은 순수 함수에 floor를 직접 넘겨 단언할 뿐 workflow 배선을 보지 않는다. 또한 `--floor-from` 부재 시 coverage.js가 fail-closed인지 permissive default인지 plan이 정하지 않았다(Validation 검사 7은 실제로 `--floor-from` 없이 호출한다). |
| invariant | HIGH | 커버리지 판정이 measurement와 exclusions 목록을 결속하지 않는다 — 이미 존재하는 앵커(exclusions_digest)를 쓰지 않아 서로 다른 실행의 산출과 격리 목록을 짝지어도 통과한다 | plan Task 2: `computeCoverage({tracked, measurement, exclusions, floor})` — 산출 필드에도 검증 분기 (1)~(7) 어디에도 digest 대조가 없다. 반면 러너는 이미 `run.js:580 exclusions_digest: exclusionsDigest(exclusions)`를 봉인하고 enumerate.js:81-83 주석이 그 목적을 "사후 대조를 가능하게 한다 — 제외가 커버리지 분모를 정하는 유일한 필드"라고 못박는다. 결속 없이 판정하면 격리 없이 돈 측정과 큰 격리 목록을 짝지어 unexplained=0을 만들 수 있다. |
| invariant | MEDIUM | Validation 검사 2가 뒤에 오는 검사 7의 산출물을 읽고, 부재/stale 입력에 대한 방향이 정해져 있지 않다 | plan Validation 검사 2는 `--measurement /tmp/m3-local.json`을 읽는데 그 파일은 검사 7이 만든다(검사 7 주석: "검사 2가 이 산출을 읽으므로 순서상 먼저 돌려야 한다"). 번호 순서대로 실행하면 부재 파일이거나 이전 실행의 stale 산출이며, plan은 coverage.js가 measurement 부재·파손·stale에 대해 어느 방향으로 접히는지 명시하지 않는다(Task 2 분기 (1)~(7)에 해당 분기 없음). |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | DD2의 버킷 분할이 실제로 완전한지 `enumerate.js`(`enumerateTests`의 included/excluded 분할, L111-137)와 `run.js:666-678`의 `--exclude-from` → `--list` 경로를 읽어 대조했다 — 분모/분자/격리의 결속은 성립하고 새 열거 기제를 만들지 않는다는 주장도 참이다. DD7의 재배선 주장(`run.js`가 `readJsonFile`로만 검증을 우회한다)은 `run.js:666-667`에서 사실로 확인했고, `--list`가 exclusions 로드 **뒤**에 오므로 Validation 검사 3의 배선 단언이 실제로 작동함도 확인했다. Mirror로 인용한 `impeccable-guard.test.js`는 실재하고 `enumerate.js:1-12`(순수층)·`normalizeExclusions`의 throw 계약(L55-79, 인용 범위 L49-76은 몇 줄 어긋나나 내용은 정확)도 인용대로였다. `--merge-into`의 fail-closed(`validateElement`, L280/697-702)와 Task 9의 순서 논증도 코드와 합치한다. 깨지지 않은 것들이다. 깨진 것은 넷: 축 D의 CI 증거가 착지할 workflow/step 부재, floor 입력의 강제 경로 미배선과 부재 시 동작 미정의, 격리 정본 경로 결속의 기계 부재(M1이 M3에 이연한 항목), Task 1↔3 선후 역전. |
| security | fail | Attacked: (1) fork-PR threat model in DD4 — `permissions: contents: read`, no secrets, `persist-credentials:false`, SHA pin, no `pull_request_target` is a coherent set and matches `.github/workflows/test-suite-baseline.yml:60-71`; arbitrary PR-controlled test execution remains but is an accepted, documented residual, not a plan-introduced defect. (2) Artifact `if: always()` leak into public artifacts — plan explicitly refuses to widen redact.js and points residual axes to backlog; I could not name an input reaching a new consequence beyond today's baseline workflow. (3) Task 4's `GITHUB_ACTIONS === 'true'` guard — a PR-controlled test file cannot unset it before run.js constructs childEnv, no bypass found. (4) DD3 ordering (exit_code → coverage → redaction_ok) — does not weaken the leak check, only sequences the message; redact.js untouched. (5) `--exclude-from` path traversal / arbitrary path — workflow pins `.github/test-suite-exclusions.json`, and `readJsonFile`→`exclusions.js` rewiring is asserted by Validation check 3. (6) Absolute-path / cwd leakage into tracked artifacts — plan's tracked artifacts are exclusions/floor JSON and the merged container, and Task 9 requires `redaction_ok` on every element. Landed two findings on the ratchet design: neither the item-count ceiling nor the tracked-count floor is sensitive to what the exclusions actually cover, so both the gate and the DD9 deletion ratchet are defeatable without any machine signal. |
| test | fail | DD2/DD7/DD9/DD3/DD5의 각 주장에 대해 '거짓이면 무엇이 붉어지는가'를 물었다. 실제 producer(`scripts/test-suite/run.js`, `reporter.mjs`)를 읽어 `fully_skipped`의 데이터 원천 부재를 확인했고(skip 문자열 0건), `run.js:666-667`의 `--exclude-from` → `readJsonFile` 현행 배선이 DD7 서술과 일치함을 확인했다. 기존 `scripts/tests/test-suite.test.js:53-98`가 `{pattern, reason}`(ticket 없음)을 단언하지만 그것은 `enumerateTests` 하위층이라 DD7 재배선이 그 test를 깨지 않음 — '버그를 pin한 test'는 찾지 못했다. `## Validation` 검사 3의 `&& { …; exit 1; } \|\| true` 셸 논리는 실제로 올바르게 fail한다고 판정해 finding에서 제외했다. DD5의 주석 위양성 짝 단언(Task 7 (e))은 실재하고 과-허용 방향을 덮으므로 공격했으나 결함 없음. 남은 결함은 위 4건. |
| invariant | fail | plan/PRD 전문 + scripts/test-suite/enumerate.js(normalizeExclusions·globToRegExp·enumerateTests)와 run.js의 exclusions_digest/files_total 배선을 읽고 다음을 열려고 시도했다: (1) DD2의 unexplained==0 판정을 우회하는 입력 — glob 격리 1줄로 전 파일을 excluded 버킷에 넣어 상한·ticket·floor를 모두 만족한 채 게이트를 여는 경로를 찾았다. (2) DD9 floor의 호출선 추적 — Task 5 단계 목록과 Task 7 절단 오라클 어디에도 --floor-from이 없음을 확인. (3) 앵커링 — measurement의 exclusions_digest가 판정에 결속되지 않음을 확인. (4) 게이트 기계 자체의 실패(측정 파일 부재/stale, exclusions/floor 파일 판독 불가) 경로의 방향이 미명시임을 확인. 반대로 열리지 않은 것들: DD7 재배선 단언(Validation 검사 3)은 실제로 러너 경로를 겨냥해 유효했고, DD5의 주석 위양성 짝 단언과 --revert/git diff --exit-code 왕복, DD3의 판정 순서, DD4의 fork-PR 방어는 공격했으나 결함을 찾지 못했다. |

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
  "wall_clock_ms": 247618,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:84c8a1d83db84d6dd44113c362da3bc098887a7f33ff893214fc7980a10f2575",
  "plan_path": ".claude/plans/ci-full-suite-m3a.plan.md",
  "recorded_at": "2026-09-04T01:49:54.983Z"
}
```
