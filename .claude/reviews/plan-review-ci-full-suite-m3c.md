# Plan Review Panel — ci-full-suite-m3c

**Plan**: `.claude/plans/ci-full-suite-m3c.plan.md` · **Plan version**: `sha256:25fb497a48803ee5da9fda3585c8b5ea5ecfffaa41fdbbf21f491dfd84fc6570`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 8 blocking finding(s): architect/HIGH, architect/HIGH, architect/FAIL, test/HIGH

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | 축 D의 절단이 자기 판정자를 제거한다 — 절단된 트리는 red가 아니라 green이 된다. wiring-cut의 `--apply` 대상이 `test-suite.yml`의 `gate.js` 판정 줄인데, 그 줄이 사라지면 그 red를 보고할 소비처 자체가 사라진다. plan이 인용한 DD3 사실(`run.js`는 red 스위트에 대해 exit 0)이 정확히 이 결론을 강제한다: workflow 단계는 격리검증 → 열거 → run.js(red여도 exit 0) → gate.js(제거됨)뿐이라, 절단된 트리에서 비영점으로 끝날 단계가 하나도 없다. 즉 `test-suite` 체크는 green이고 Acceptance 3(그 run의 artifact `failing`에 wiring-cut.test.js)은 성립할 수 없다. plan 스스로 이 순환을 문장으로 드러낸다. | plan Task 7: "대상은 … `test-suite.yml`의 **`gate.js` 판정 줄**" + "절단하면 그 test가 red가 되고, 그 red가 `gate.js` 1단계(스위트 green)를 무너뜨려 체크가 막는다" — 제거된 `gate.js`가 여전히 1단계를 평가한다고 전제한다. 근거 사실은 plan이 인용한 `scripts/test-suite/run.js:725` (`return result.ok ? 0 : 1;`)와 `:10-12`(`ok`는 측정 성립이지 green이 아니다)로 실제 파일에서 확인됨. |
| architect | HIGH | 커버리지 분모(`tracked`)의 입력 채널이 어느 CLI 표면에도 선언되지 않았다 — DD2·DD9의 두 차단 조건(`unexplained === 0`, `tracked >= floor`)이 전부 그 값 위에 서 있는데, 그 값이 어디서 오는지가 plan 전체에 없다. 그리고 measurement에서 파생하는 (가장 자연스러운) 읽기를 택하면 두 조건이 동시에 무의미해진다: `run.js` 산출의 `files_total`은 **격리 적용 후** included 개수이고 tracked 목록 자체는 산출에 없으므로, 그것을 분모로 쓰면 `unexplained`은 정의상 항상 0이고 floor는 격리가 늘 때마다 함께 내려가 래칫이 반대로 작동한다. DD9가 `--floor-from` 누락을 fail-closed로 못박으면서 정작 더 load-bearing한 입력에는 인자도 fail-closed 규칙도 없다. | plan Task 2는 순수 함수 시그니처에 `tracked`를 두면서 CLI 플래그를 "셋"(`--json`·`--assert-accounted`·`--assert-full`)으로 열거하고, Task 2b의 gate CLI는 `--measurement`·`--exclude-from`·`--floor-from`뿐이며, Task 5의 workflow 한 줄과 Validation 검사 2·7b도 동일하다 — tracked 입력 인자가 0건. 실제 산출 구조: `scripts/test-suite/run.js:577-578` (`files_total: files.length` = enumerated.included 길이, `files_excluded`는 개수만) — tracked 목록은 measurement에 존재하지 않는다. |
| security | MEDIUM | DD3 stage 3 blocks the merge on `redaction_ok === false`, but nothing withholds the artifact — by the time the gate judges, the leaking JSON has already been uploaded to a publicly downloadable artifact on every PR. The plan presents blocking as the closure of the 'this workflow uploads a public artifact every PR' risk (DD3), when in fact it is detection-after-publication. | Plan DD3: "게이트가 매 PR 공개 artifact를 올리는 이상, green 스위트에서의 유출 판정은 정보가 아니라 사고다" + DD4: "artifact 업로드는 유지하되(`if: always()`) 그 내용은 `scripts/test-suite/redact.js`를 이미 통과한 산출이다"; `redaction_ok=false` by construction means the residual scan found a leak *in the emitted object* (scripts/test-suite/run.js:600 `out.redaction_ok = folded.redaction_ok && scan.hits.length === 0`), i.e. the leak is inside the uploaded file. redact.js:12 documents the enumeration is not exhaustive ("정의상 등록 밖 경로(%APPDATA%\\npm-cache, /home/runner/.cache, env echo)를 놓친다"). |
| security | MEDIUM | The plan leaves its own fan-out's gate-forgery meta-gap unanswered: axis D proves a cut produces red, but no control exists for the inverse (PR-controlled test process forging a green measurement — the reporter events, and hence `exit_code`/`per_file`/`redaction_ok`, are produced by processes whose source the PR fully controls, and the gate reads that measurement as trusted input). | Plan line 717 (injected fan-out, verbatim in the plan under review): "PRD's axis D ... does not validate that CI cannot be *tricked* into reporting green (e.g., a test file that catches/swallows its own failure, or an artifact-tampering path) — no negative control for gate-forgery is specified." No DD (DD3/DD4/DD5/DD7/DD9) or Task addresses it; Task 2b's gate.js validates only key presence (Validate (f)), not provenance. |
| security | LOW | Every mechanical control the plan adds (max_excluded_files, tracked floor, exclusions_digest, gate.js/coverage.js themselves) is read from the PR's own checkout, so all of them are self-amending in a single PR. The plan states this honestly for the exclusion and floor axes but never extends the statement to gate.js/coverage.js/wiring-cut.test.js, which the same argument covers. | Plan DD7: "런타임으로 이것을 막을 방법은 없다 ... 통제를 위치로 옮긴다"; DD9: "줄이려면 floor를 같은 diff에서 내려야 하고 그 숫자가 리뷰 표면에 남는다" — control is review, not machine. `.github/test-suite-floor.json` and `scripts/test-suite/gate.js` are both listed as CREATE in `## Files to Change`, i.e. tracked and PR-editable. |
| test | HIGH | 축 D의 CI 실증이 자기모순이다 — 절단 대상이 곧 red를 보고할 기계여서, 'red가 난다'는 명제를 어떤 오라클도 검증하지 못한다. 게이트 판정 줄을 지우면 stage-1(스위트 green) 판정 자체가 실행되지 않으므로 체크가 green으로 남을 수 있고, 그러면 로컬 왕복(a)/(b)만 남아 CI 실증(d)(e2)은 만족 불가이거나 무관한 이유(YAML 오류 등)의 red로 충족된 것처럼 기록된다. | plan Task 7 L541 '대상은 ... `test-suite.yml`의 **`gate.js` 판정 줄**' 과 L547 '절단하면 그 test가 red가 되고, 그 red가 `gate.js` 1단계(스위트 green)를 무너뜨려 체크가 막는다' — 절단된 것이 바로 그 1단계를 부르는 유일한 줄이다(Task 5 L508-511: 판정은 gate.js 한 줄). 어떤 Validate 항목도 '절단 후에도 판정 줄이 여전히 실행된다'를 확인하지 않는다. |
| test | HIGH | 'paths 필터 없음'은 이 milestone의 최대 load-bearing 주장(커버리지 100%·전 PR 강제)인데 이를 반증할 test·Validate가 하나도 없고, 계획이 제시한 유일한 증거(이 PR의 라이브 발화)는 구조적으로 그것을 반증할 수 없다 — 이 PR은 `.github/**`와 `scripts/**`를 건드리므로 좁은 paths 필터가 있어도 발화한다. 실패 방향(과대허용: 다른 PR에서 게이트가 조용히 안 돎)이 미검증이다. | plan Acceptance 1 L820-821 'paths 필터가 없으므로 이 PR 자신이 그 실증이다'; Task 5 L501 'pull_request에 **paths 필터 없음**'; Task 7 절단 오라클의 단언 대상은 L543-544 '`gate.js` · `--measurement` · `--exclude-from` · `--floor-from` 전부'로 paths를 포함하지 않는다. |
| test | MEDIUM | `scripts/test-suite/container-check.js`는 CREATE인데 대응 test 파일이 `## Files to Change`에 없다. Validation 검사 6이 그것을 실행하는 유일한 자리이고, 원소를 하나도 검사하지 않는 구현(빈 루프·키 오타)도 exit 0을 내므로 '전 원소가 3축 만족'이라는 Task 9 판정은 반증 불가하다. | plan Files to Change L360 '`scripts/test-suite/container-check.js` \| CREATE \| ... Validation 검사 6의 소비처'; test 목록에는 test-suite-coverage/wiring-cut/ci-required-checks만 있다(L363-366). Validation L646-647은 실제 컨테이너 1개에만 돌린다 — 음성 fixture가 없다. |
| test | MEDIUM | Task 1c의 Validate가 그 결함을 잴 수 없다. `dispatch-fullcycle-smoke.test.js`는 'node20 전용 red'인데 Validate는 로컬 단독 실행이고 이 저장소의 로컬 Node는 v24다 — 통과해도 node20 red가 닫혔다는 증거가 되지 못한다. | plan Task 1 L401-402 '1c `dispatch-fullcycle-smoke.test.js` (node20 전용 red)' + Validate L407 '각 파일을 `MCCP_CODEX_DISABLED=1 node --test ... <file>`로 단독 green 확인'; PRD L25 '로컬 `v24.19.0` · CI `node-version: 20`'. |
| invariant | HIGH | DD3의 1단계(`measurement.exit_code === 0` = "스위트 green")는 스위트가 아예 실행되지 않은 측정에 대해 통과한다. `runChunk`의 spawn 실패 경로는 `exit_code: null, per_file: null, redaction_ok: true`를 내고(run.js:489-505), `foldChunks`는 `Number(r.exit_code) \|\| 0`로 접으므로(run.js:179-183) null이 0으로 접혀 `folded.exit_code === 0`이 된다. 즉 `ok:false ∧ exit_code:0 ∧ redaction_ok:true`인 measurement가 실재하고, gate.js의 3축 중 1과 3이 그것을 통과시킨다. 그런데 계획은 `measurement.ok`(러너 헤더가 '측정이 성립했는가'로 정의한 바로 그 필드, run.js:10-12)를 gate.js의 입력으로 **한 번도 열거하지 않는다** — Task 2b의 판정 인자는 `{measurement, coverage}`이고, 부재 검사 분기 (f)는 `exit_code`·`redaction_ok` **키 존재**만 본다. 남는 유일한 방어선은 2단계 coverage가 `per_file === null`을 어떻게 다루느냐인데, 계획은 그 입력을 정의하지도 test하지도 않는다(Task 2 분기 (3)은 "`per_file`이 `files_total`보다 적으면"뿐이고 null은 '적음'이 아니다). 머지 차단 게이트의 fail-closed 여부가 미지정 null 처리에 달려 있다. | scripts/test-suite/run.js:489-494 (`exit_code: null, per_file: null, redaction_ok: true`) · :179-183 (`const code = Number(r && r.exit_code) \|\| 0; if (code !== 0) ...`) · plan Task 2b Validate (f) "`measurement`에 `exit_code`나 `redaction_ok` 키가 **없으면** 차단한다" — `ok` 미언급 · plan DD3 표 1행 "`measurement.exit_code === 0` (스위트 green)" |
| invariant | MEDIUM | 앵커링이 절반만 걸린다. DD2는 measurement ↔ 격리목록 결속(`exclusions_digest`)을 세심히 논증하지만, measurement ↔ **그 measurement가 잰 트리**의 결속은 전무하다. `run.js`가 이미 `git_sha`와 `ci_run_id`를 산출물에 싣는데(run.js:575-576) gate.js의 입력 목록(`--measurement`·`--exclude-from`·`--floor-from`)에 HEAD 대조가 없다. 결과적으로 게이트의 판정 전체가 PR이 쓴 JSON 파일 하나에 근거하며, 같은 job 이름을 유지한 채 실행 단계를 `echo '{...}' > measurement.json`으로 바꾼 PR은 gate.js 3축을 전부 만족시킨다. fan-out이 이 축을 meta-gap으로 명시 제기했는데(gate-forgery 음성 통제 부재) 계획의 DD 어디에도 응답이 없다 — DD4는 fork 코드 실행의 *권한* 축만 다룬다. | scripts/test-suite/run.js:575-576 (`git_sha`, `ci_run_id` 산출) vs plan Task 5.1 게이트 호출 줄(`--measurement`/`--exclude-from`/`--floor-from`만) · plan Multi-Perspective Fan-out Meta-gaps: "PRD's axis D ... does not validate that CI cannot be *tricked* into reporting green ... no negative control for gate-forgery is specified." — 계획 본문 미응답 |
| invariant | MEDIUM | 머지 차단의 절반(required status check 이름)을 지키는 유일한 기계에 caller가 없다. DD6은 job 이름 drift 진단을 만들되 "CI가 아니라 운영자가 돌리는 진단"으로 두고 런북 등재만 한다. 즉 이름이 바뀌어 보호가 조용히 풀리는 경로를 잡는 것은 사람의 기억이며, 그 호출의 부재를 잡는 test도 없다 — 계획 자신이 DD5·DD7·DD9에서 세 번 경계한 "기계는 만들어지고 그것을 부르는 한 줄이 빠진다"를 이 축에서만 그대로 재현한다. Acceptance 4도 '설정 직후 1회 exit 0'만 요구해 그 이후의 drift는 어떤 시점에도 재지 않는다. | plan DD6: "`scripts/ci-required-checks.js`가 ... 어긋나면 비영점으로 끝난다. **CI가 아니라 운영자가 돌리는 진단**이다 ... 런북에 등재한다." · plan Acceptance 4: "운영자가 branch protection을 1회 설정한 뒤 `scripts/ci-required-checks.js`가 exit 0이다" |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | DD3의 러너 종료코드 인용(`run.js:10-12`·`:725`)·`validateElement`의 `redaction_ok` BLOCK(`:321-326`)·`normalizeExclusions` throw(`enumerate.js:55-79`)·`globToRegExp`의 `**` 확장(`:27-50`)·`--exclude-from`이 `readJsonFile`로 가는 배선(`run.js:666-668`)을 전부 열어 대조했고 인용은 정확했다. `exclusions_digest` 앵커링이 실재 필드(`run.js:580`)에 근거하는지, `--merge-into` 거부가 Task 9의 순서 논증을 실제로 지지하는지도 확인했고 성립한다. 깨진 것은 둘이다: (1) 축 D 절단이 자기 판정자를 지워 게이트가 green이 되는 자기모순, (2) 커버리지 분모 입력의 미선언 — measurement에는 tracked 목록이 없고 `files_total`은 격리 후 값이라 두 차단 조건이 무력화되는 읽기가 열려 있다. `max_excluded_files`가 digest에 포함되지 않는 점(digest는 pattern+reason만)은 리뷰 표면이 별도로 덮으므로 finding으로 올리지 않았다. |
| security | pass | Attacked: (1) DD2's claim that `{pattern:"**/*.test.js"}` opens the gate — verified against scripts/test-suite/enumerate.js:27-50 `globToRegExp` (`**`→`.*` before `*`), the claim is accurate and the plan's `max_excluded_files` closes it. (2) DD3's citation of run.js:10-12/:725 (`ok` != green) — accurate; gate.js ordering argument holds. (3) `exclusions_digest` anchoring — verified enumerate.js:84-90 exists and is sealed by run.js; anchoring only detects mispairing, which the plan states. (4) Durable-artifact leak (the repo's cwd-leak precedent) on Task 9's merge into git-tracked `.claude/_meta/data/2026-09-01-suite-baseline.json` — could not land: run.js:321-326 `validateElement` rejects `redaction_ok !== true` elements and redact.js:165/199 covers posix-home and homedir roots, and the plan orders the merge after Task 1 green. (5) fork-PR arbitrary code execution — DD4 states least privilege, SHA pin, `persist-credentials:false`, no `pull_request_target`, no secrets; could not find an escalation beyond the CI-status manipulation the plan already names. (6) `--allow-codex` CI guard (Task 4) — plan itself notes 0 live wiring points. (7) Path traversal via `--exclude-from`/`--measurement`/`--floor-from` — paths are literals in the workflow line and the exclusion patterns are matched against a `git ls-files` set, so no traversal consequence reachable. What survived is reported above; none is HIGH. |
| test | fail | plan 전문과 PRD를 읽고 인용 정확성을 실측 검증했다: `run.js:10-12`의 ok≠green 계약(참) · `run.js:666-668`의 readJsonFile 경로와 `--list` 분기(참, DD7 재배선 필요 근거 성립) · `enumerate.js`의 `globToRegExp`가 `**`를 구분자 너머로 확장(참, DD2의 한 줄 우회 근거 성립) · `run.js:580`이 `exclusions_digest`를 실제로 봉인(참 — DD2 3번 앵커는 실재 producer 위에 선다). Task 2의 11개 분기, Task 2b의 (a)~(f), Task 3의 배선 단언(ticket 없는 목록으로 run.js가 죽는지)은 모두 실제 소비 경로와 과대허용 방향을 덮고 있어 결함을 못 찾았다. Validation 검사 3의 셸 형태(`&& {…; exit 1} \|\| true`)와 검사 7/2의 실행 순서 의존도 공격했으나 계획이 이미 자기 안에서 닫았다. 남은 네 건이 위 findings다. |
| invariant | fail | gate.js 3축을 열려고 시도: (1) run.js의 chunk 실패 경로를 추적해 `exit_code: null → foldChunks의 `\|\|0` → 0` 접힘을 확인하고 `ok:false ∧ exit_code:0 ∧ redaction_ok:true` 조합이 실재함을 확인 — 계획의 gate 입력에 `ok`가 없음을 Task 2b (f)로 대조(HIGH). (2) `exclusions_digest`의 실제 커버 범위 확인(enumerate.js:84-90 — pattern+reason만, ticket 제외) → DD2 3조건의 재계산 대조는 정합함을 확인, 반증 실패. (3) `globToRegExp`(enumerate.js:27-50)가 `**`를 구분자 넘게 확장한다는 DD2의 주장 검증 — 참, `max_excluded_files` 조건이 그 경로를 실제로 닫음을 확인, 반증 실패. (4) `--merge-into`의 `redaction_ok !== true` 거부(run.js:321-326) — Task 9의 순서 논증 정합, 반증 실패. (5) Validation 검사 3·4의 셸 실패 경로(`&& { exit 1 } \|\| true`, `--apply` 실패 시 CUT_RC=0) 추적 — 둘 다 fail-closed, 반증 실패. (6) floor/max 파일의 결측·비정상 값 경로 — 우연히 fail-closed(`>= undefined` false)이나 계획이 열거하지 않음, LOW로 판단해 미보고. (7) measurement ↔ 커밋 앵커링 부재(MEDIUM) 및 required-check drift 진단의 caller 부재(MEDIUM)를 발견. |

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
  "wall_clock_ms": 214945,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:25fb497a48803ee5da9fda3585c8b5ea5ecfffaa41fdbbf21f491dfd84fc6570",
  "plan_path": ".claude/plans/ci-full-suite-m3c.plan.md",
  "recorded_at": "2026-09-04T02:21:34.186Z"
}
```
