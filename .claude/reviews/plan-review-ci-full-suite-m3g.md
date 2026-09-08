# Plan Review Panel — ci-full-suite-m3g

**Plan**: `.claude/plans/ci-full-suite-m3g.plan.md` · **Plan version**: `sha256:59b4febb8bdc877823a605570a6dab1232b7381fca68a3fd392eca7c4c45c401`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 6 blocking finding(s): architect/HIGH, architect/FAIL, test/HIGH, test/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | HIGH | DD9의 삭제 래칫이 새로 요구하는 입력 채널(`--base-ref origin/${{ github.base_ref }}`)의 **전제조건이 workflow 사양에 한 줄도 선언되지 않았다**. gate.js는 base 해소 실패를 fail-closed(비영점)로 못박았는데(Task 2b '`--base-ref`가 주어졌는데 merge base를 해소하지 못함'), `actions/checkout` 기본값은 shallow(depth 1)이고 merge ref를 체크아웃하므로 `origin/<base>`가 러너에 존재하지 않는다. 즉 Task 5가 적은 판정 한 줄을 그대로 구현하면 **모든 PR에서 게이트가 base 해소 실패로 영구 red**가 되거나, 그것을 피하려고 fail-closed를 되돌리게 된다 — 이 계획이 스스로 금지한 완화. 더 나쁜 것은 이 누락을 볼 기계가 0건이라는 점이다: Task 7 오라클은 `run:` 줄 안의 토큰과 앞 두 단계 존재, `paths` 부재만 단언하므로 checkout 설정은 사거리 밖이다. | plan Task 5: `--base-ref origin/${{ github.base_ref }}` (plan L736) + Task 2b fail-closed 여섯(plan L622) vs. 계획 전문에 `fetch-depth`/`checkout` 언급 0건(grep 결과 fan-out 인용 2건 외 부재). 저장소 선례가 정반대를 명시: `.github/workflows/version-declaration-gate.yml:21-24` "fetch-depth: 0 은 선택이 아니다 … shallow clone 이면 base 해소에 실패한다. 그때 가드는 통과가 아니라 HALT 한다" + `:57-60` "checkout@v4 는 merge ref 를 체크아웃하므로 origin/<base> 가 항상 있다고 가정하지 않는다" → `git fetch --no-tags origin ${{ github.base_ref }}` 단계. `.github/workflows/test-suite-baseline.yml:70` 도 `fetch-depth: 0`. |
| architect | MEDIUM | DD2가 '한 불변식에 소유자가 둘이면 DD2가 한 라운드를 들여 거부한 모양으로 되돌아간다'고 못박아 `tracked` 채널과 fail-closed의 소유자를 `gate.js`로 단일화해 놓고, 같은 계획의 Task 2가 `coverage.js` CLI에도 동일한 차단 판정(`--assert-accounted` 3조건 + `tracked >= floor` + floor 입력 부재 시 비영점)을 그대로 부여한다. 결국 같은 차단 오라클의 CLI 구현이 둘이고, 짝 단언 (i)는 gate 경로에만 걸리므로 두 구현이 갈라져도 붉어질 검사가 없다 — 그리고 `## Validation` 검사 2는 저장소 검증으로 그 두 번째 구현을 실제로 부른다(로컬 진단으로만 남는다는 서술과 어긋난다). | plan L570-579 ("`tracked` 채널의 소유자는 `gate.js`다 … fail-closed 넷의 계약은 `gate.js`가 진다" 바로 아래에서 `--assert-accounted`의 3조건과 비영점 계약을 `coverage.js` CLI에 부여) · Task 2 Validate (8) "`--assert-accounted`인데 floor 입력이 없으면 비영점" · Task 2b Validate (i) "이 단언이 … gate 경로에 걸려야 하는 이유는 CI가 부르는 것이 gate이기 때문" · Validation 검사 2 (plan L930-934)가 `coverage.js --assert-accounted`를 호출. |
| security | MEDIUM | DD9의 base 대조 래칫이 요구하는 `--base-ref origin/${{ github.base_ref }}` 해소 전제(전체 이력 체크아웃)를 신규 workflow 서술이 하나도 명시하지 않는다. `actions/checkout` 기본은 fetch-depth 1이라 `origin/<base>` ref가 존재하지 않고, Task 2b가 못박은 fail-closed 여섯 중 '`--base-ref` 해소 실패'가 발동해 **모든 PR이 영구 차단**된다. 그 상태의 유일한 출구는 게이트 완화이며, 그것은 DD2가 '저장소를 인질로 잡지 않는다'로 한 라운드를 들여 거부한 바로 그 형태다. | plan Task 5.1의 판정 줄은 `--base-ref origin/${{ github.base_ref }}`를 요구하고 Task 2b는 '`--base-ref`가 주어졌는데 merge base를 해소하지 못함'을 fail-closed로 못박는다. 그러나 Task 5의 Mirror는 `.github/workflows/test-suite-baseline.yml:60-71`(persist-credentials)만 인용하고, 그 파일에서 base ref 가용성을 실제로 만드는 것은 `:68-70`의 `fetch-depth: 0`이며 그 주석은 '기본 shallow 체크아웃은 … before-ref를 결정 불가능하게 만든다'고 이미 같은 사고를 기록하고 있다. plan 전문에 `fetch-depth`는 0회 등장한다. |
| security | LOW | DD7의 통제('격리 목록을 한 파일에 두고 게이트가 **그 경로만** 읽는다')를 지키는 기계가 없다. 축 D 오라클은 판정 줄의 **토큰 존재**만 단언하고 인자의 **값**은 단언하지 않으므로, `--exclude-from`/`--floor-from`의 인자를 PR이 추가한 다른 파일로 바꿔도 `wiring-cut.test.js`는 green을 유지한다 — floor 0 · `max_excluded_files` 무한 · `**/*.test.js` 격리를 담은 대체 파일이 DD2의 3조건과 DD9 래칫을 동시에 무력화한다. DD4a가 '판정 모듈과 상수가 같은 PR에서 수정 가능하다'로 이 계열을 기록하지만, DD7이 주장하는 통제가 파일 diff의 가시성에 걸려 있는데 인자 재지정은 그 diff를 우회한다는 사실은 어디에도 적혀 있지 않다. | plan Task 7 단언 1: "그 `run:` 줄 **안에** `gate.js` · `--measurement` · `--exclude-from` · `--floor-from` · `--base-ref`가 전부 있다" — 값에 대한 단언 없음. DD7: "격리 목록을 `.github/test-suite-exclusions.json` 한 파일에 두고 게이트가 **그 경로만** 읽는다." |
| test | HIGH | Task 4의 CI 런타임 가드는 기존 test 2건을 CI에서만 red로 만든다 — 그리고 그 회귀는 로컬 Validation이 구조적으로 볼 수 없다. 즉 이 계획이 만드는 머지 차단 게이트가 자기 변경 때문에 붉어지고, 그것을 미리 잡을 검사가 계획에 0건이다. | Task 4: "`scripts/test-suite/run.js`의 `childEnv` 구성에서 `allowCodex === true` 이고 `process.env.GITHUB_ACTIONS === 'true'`이면 throw". 그런데 `scripts/tests/test-suite.test.js:701` `(12b)`가 `childEnv('/some/repo', { allowCodex: true })`를 직접 부르고 `:720` `(12c)`도 같은 호출을 한다. `run.js:450-452`의 `childEnv`는 `process.env` 전량을 읽으므로 GitHub Actions job 안에서 그 두 test는 throw한다. 계획의 `## Files to Change`는 `test-suite.test.js`를 "`--allow-codex` CI 가드 분기 추가"로만 적고(L521) 기존 (12b)·(12c)의 조정을 어디서도 말하지 않으며, `## Validation` 검사 1은 `GITHUB_ACTIONS` 없이 도므로 green이다. Task 4 Validate("둘 중 하나만이면 통과")도 같은 로컬 조건이라 이 회귀를 잡지 못한다. |
| test | MEDIUM | Validation 검사 4b(절단 B 왕복)는 판별력이 없다 — 게이트가 **어떤 이유로든** 비영점이면 통과하므로, DD9 삭제 래칫이 죽어 있어도 green이 될 수 있다. 이는 계획 자신이 R7에서 축 A에 대해 흡수한 결함("stage 번호가 판별자다")과 같은 형태다. | `## Validation` 4b(L953-957)은 `DEL_RC`에 대해 `test "$DEL_RC" -ne 0`만 단언한다. 반면 Task 7 (a2)(L845-846)는 "`gate.js`가 `stage=2`로 비영점"을 요구한다. 더구나 4b는 `/tmp/m3-local.json`을 읽는데 그 파일은 검사 7(L972-973)이 생성하므로, 블록을 적힌 순서대로 돌리면 measurement가 부재하고 Task 2b가 못박은 fail-closed(`--measurement` 부재 → 비영점, L620-624)로 게이트가 죽어 **삭제 래칫과 무관하게 4b가 통과**한다. 계획은 이 의존을 검사 2·7b에 대해서만 각주로 인정한다(L978-982). |
| test | LOW | Task 5(강제 workflow 신설)의 Validate 줄은 이 Task가 만든 파일을 검사하는 어떤 로컬 test도 부르지 않는다 — 그 workflow의 유일한 오라클(`wiring-cut.test.js`)은 두 Task 뒤에 생기고, 계획 자신이 "Task 4 뒤가 깨끗한 절단선"이라 적어 중단 시 무-오라클 workflow가 남을 수 있다. | Task 5 Validate(L751-752): "PR을 열어 `test-suite` 체크가 실제로 발화하고 green임을 확인. `gh run view --json jobs`…" — 단위 test 호출 0건. workflow 형태 단언(판정 줄 토큰·앞 두 단계·`paths` 부재)은 Task 7(L822-834)에만 있다. Risks(L1128): "중단해야 하면 Task 4 뒤가 깨끗한 절단선". |
| invariant | HIGH | DD9의 삭제 래칫은 집합 차가 아니라 **개수 비교**라, 삭제 N건을 같은 PR의 추가 N건이 상쇄하면 게이트가 조용히 열린다. 계획이 이 래칫에 부여한 '말 없는 삭제를 막는다' / 'slack이 구조적으로 없다'는 주장은 거짓이며, 정당한 삭제의 유일한 출구라던 allow_deletions도 우회된다. 그리고 이 상쇄는 적대적 시나리오가 아니라 PRD가 likelihood 높음으로 등재한 사건(C1·C2·C4의 test 추가)과 겹치는 것만으로 성립한다. | plan L459-463: "merge base에서 `git ls-tree -r <base> --name-only`의 `*.test.js` **개수를 세고** … `tracked_head < tracked_base`이면 2단계에서 차단한다 … 추가는 자유롭게 통과하고(`head > base`), 삭제만 걸린다" — 삭제 1 + 추가 1이면 head == base라 조건이 거짓이 되어 삭제가 무검사 통과한다. 면제도 경로 집합이 아니라 개수로 소모된다(L652-655 "그 차이가 `allow_deletions`의 경로로 전부 설명되면"). Task 2b (k)의 유일한 단언도 같은 부등식이라(L652) 이 구멍에 붉어질 test가 0건이고, 축 D 절단 B는 '삭제만' 하는 실험이라(L777, L855-857) 구성상 이 결함에 둔감하다. PRD L108이 test 추가를 likelihood 높음으로 등재한다. |
| invariant | MEDIUM | `## Validation` 검사 4b의 절단 B 왕복은 전제가 틀려 항상 FAIL로 떨어지거나, 아니면 명시되지 않은 staging 동작에 의존한다 — 즉 이 계획이 새로 닫았다고 적은 'B 복원 왕복' 검사가 그 자리에서 성립하지 않는다. | plan L952: "`--base-ref HEAD`면 base는 커밋(git ls-tree), head는 index(git ls-files)라 **미커밋 삭제가 잡힌다**" — `git ls-files`는 index를 읽으므로 worktree에서만 지운 파일은 여전히 열거되어 `tracked_head === tracked_base`가 되고, L957의 가드(`test "$DEL_RC" -ne 0`)가 발화한다. Task 7은 `--apply-delete`를 "tracked test 파일 1개 삭제·복원"이라고만 적고(L766-767) index 반영(`git rm`)을 요구하지 않는다. |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | fail | (1) DD3 판정 순서의 근거 인용을 원본에서 대조 — `run.js:213-214`(`per_file: ok ? perFile : null`), `:179-183`(`Number(r.exit_code) \|\| 0` 접힘), `:676-679`(`--list`가 `enumerated.included` 출력), `:725`(`result.ok ? 0 : 1`), `:666-668`(`--exclude-from` → `readJsonFile`) 전부 계획이 주장하는 그대로였다. 0단계 신설 논증은 실제 코드로 성립한다. (2) `gate.js`를 DD3의 유일 소비처로 두는 seam이 실제로 단일인지 — 강제 workflow의 판정 줄이 하나이고 오라클이 그 줄을 단언하므로 성립. (3) 축 D A/B의 순환성 주장 — B는 삭제 파일을 이름으로 아는 test가 없어야 하고 (e5)가 그것을 확인하므로 순환 아님. (4) 삭제 래칫의 base 대조가 상류 main 신규 test로 위양성을 내는지 — pull_request는 merge ref를 체크아웃하므로 head가 base를 포함해 위양성 없음(다만 'merge base'라는 표현은 실제로 base 브랜치 tip이라 용어 부정확, 판정에 영향 없어 finding으로 올리지 않음). (5) `run.js` 재배선이 baseline workflow의 기존 호출을 깨는지 — 그 호출은 `--exclude-from`을 넘기지 않아 무영향. 남은 두 건이 위 findings다. |
| security | pass | 공격한 것: (1) fork-PR 임의코드 실행 축 — DD4의 최소권한·SHA pin·`persist-credentials:false`·`pull_request_target` 미사용이 baseline `:40-41`·`:68-71`과 정합하고, `run.js:440-458`이 `--allow-codex` 없이는 `MCCP_CODEX_DISABLED=1`을 강제하므로 Task 4 가드는 순수 추가 방어였다. 반증 실패. (2) artifact 유출 — `redact.js` 잔여 축이 `paths` 필터 제거로 노출 빈도가 넓어지는 것은 plan이 DD4에서 스스로 정정해 기록했고(과거 거짓 문장을 명시 철회), `redaction_ok` 차단이 발행 이후 탐지라는 것도 DD4a가 적었다. 미기록 유출 경로를 찾지 못했다. (3) 절대경로/머신명 leak — 이 milestone은 receipt `meta.cwd` 표면을 건드리지 않고 산출물은 `redact.js`를 통과한 measurement뿐이다. (4) 인용 검증 — `enumerate.js:22-50` `globToRegExp`가 실제로 `**`를 `.*`로 확장해 구분자를 넘고(DD2의 CRITICAL 전제 참), `:55-79` `normalizeExclusions`가 사유 부재를 throw하며, `:84-90` `exclusionsDigest`가 pattern+reason만 봉인함을 확인했다(digest가 `ticket`을 덮지 않지만 양쪽 입력이 같은 트리라 승격 경로 없음). (5) 부분상태 신뢰 — Task 2b의 `stage=0`(`measurement.ok`)과 `per_file: null` 비-0 접기, 키 부재 차단(f)이 partial-record fallback을 실제로 닫는다. (6) 삭제 래칫 우회 — `allow_deletions`가 PR 통제이지만 base-부재 항목을 면제로 세지 않아 영구 개방이 없고, 이는 DD4a가 명시 기록한 잔여다. 남은 둘만 위에 보고한다. |
| test | fail | plan 전문(1161행)과 PRD를 읽고, 인용된 소스를 직접 대조했다: `run.js:179-219`(foldChunks·`per_file: ok ? perFile : null`)·`:566-594`(`files_total`·`exclusions_digest`·`git_sha`)·`:450-460`(childEnv)·`:655-662`(allow-codex 파싱)은 계획의 서술과 일치했다(사실 오류 없음). DD2 앵커링(digest), DD3 0~3단계, DD9 base 대조 래칫은 각각 Task 2 (9)·Task 2b (g)(h)(k)로 반증 가능한 단언을 갖고 있어 공격에 실패했다. `run.js --list ≡ git ls-files`를 단언하는 기존 test(`scripts/tests/test-suite.test.js:456`)가 격리 도입으로 붉어지는지 확인했으나 그 호출은 `--exclude-from`을 넘기지 않아 무해했다. 축 D의 순환성(A가 자기 신호를 관측)도 stage 번호 판별자로 닫혀 있었다. 실제로 뚫린 것은 셋이다 — Task 4 가드가 기존 (12b)·(12c)를 CI에서만 깨뜨리는 것(로컬 Validation이 구조적으로 못 봄), Validation 4b가 stage를 안 보고 measurement 부재로도 통과하는 것, Task 5의 Validate에 로컬 오라클이 없는 것. |
| invariant | fail | plan 전문과 PRD를 읽고 게이트를 열려고 시도했다: (1) DD3 판정 순서 0~3단계에 미지 입력(ok 부재·exit_code null·redaction 키 부재·measurement 파손)을 넣어봤으나 Task 2b (f)(g)(j)의 fail-closed 여섯이 전부 차단 방향이라 뚫리지 않았다. (2) run.js 인용을 실측 대조했다 — `per_file: ok ? perFile : null`(:214) · `files_total: files.length`(:577) · `exclusions_digest`(:580) · `foldChunks`(:163) 전부 계획의 서술과 일치했다. (3) DD2 앵커링(`exclusions_digest`)으로 '격리 없이 돈 측정 + 큰 격리 목록' 짝짓기를 시도했으나 재계산 대조가 막았다. (4) `--floor-from`/`--exclude-from`/`--base-ref` 인자 누락으로 조용한 통과를 노렸으나 gate.js fail-closed와 wiring-cut 오라클이 덮었다. (5) DD9 삭제 래칫에 추가/삭제 상쇄를 넣자 열렸다 — HIGH. (6) 4b 왕복의 index 의미론이 어긋난다 — MEDIUM. (7) 게이트 위조(판정 모듈 동시 수정·artifact 선발행)는 DD4a가 명시적으로 닫지 않는다고 기록했으므로 은폐가 아니라 기록으로 보고 finding으로 올리지 않았다. |

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
  "wall_clock_ms": 186110,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:59b4febb8bdc877823a605570a6dab1232b7381fca68a3fd392eca7c4c45c401",
  "plan_path": ".claude/plans/ci-full-suite-m3g.plan.md",
  "recorded_at": "2026-09-04T02:59:44.429Z"
}
```
