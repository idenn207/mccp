# Plan Review Panel — ci-full-suite-m3r

**Plan**: `.claude/plans/ci-full-suite-m3r.plan.md` · **Plan version**: `sha256:26c549ce24ad4e70107d257d0f9a04cf7fce55dbc6a47f92dc2ee656c0c24f34`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 2 blocking finding(s): test/HIGH, test/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | LOW | gate.js의 fail-closed 열거는 `git 호출 실패`와 `빈 tracked 목록`을 서로 다른 사유 코드로 두지만, 이 저장소의 기존 tracked 해소 관용구는 두 상태를 구분할 수 없게 접는다 — `inputs.js` 구현자가 그 관용구를 재사용하면 두 코드 중 하나는 도달 불가가 되고 어떤 단언도 그것을 붉히지 않는다(방향은 fail-closed라 안전하므로 LOW). | scripts/test-suite/run.js:398-400 `catch (_) { return ''; }` → :407-410 `listTrackedFiles`가 git 실패 시 빈 배열을 낸다. plan Task 2b는 `reasons` 닫힌 열거에 두 상태를 별개로 싣고((j) 분기도 각각 단언한다) 어느 쪽이 어느 코드인지 구분할 수단을 지정하지 않는다. |
| security | MEDIUM | 신설 강제 workflow 사양에 `timeout-minutes`(및 `concurrency`)가 없다 — 플랜이 미러한다고 선언한 형제 파일은 그것을 명시적으로 갖고 그 이유까지 주석에 적었다. `paths` 필터를 없애 전 PR(포크 PR 포함)에서 임의 PR-작성 `*.test.js`가 러너에서 실행되므로, 멈추지 않는 test 하나가 GitHub 기본 상한 360분까지 러너를 점유하고 required check가 영구 pending이 된다. 가설이 아니다 — 이 저장소는 전수 실행이 orphan 프로세스 폭증으로 `fork: Resource temporarily unavailable`에 도달한 실측을 갖고 있다(run.js:426-430). | 플랜 전문에 `timeout-minutes`·`concurrency` 등장 0회(grep). 반면 미러 원본 `.github/workflows/test-suite-baseline.yml:30-31` "`timeout-minutes`를 넉넉히 두되 무한은 아니다" + `:47 timeout-minutes: 180`. 플랜 1251-1253은 같은 파일에서 `permissions`·`persist-credentials`·`continue-on-error` 부재만 가져오고 이 축은 누락. Task 7 오라클 1b(fork 방어 다섯)에도 없음(plan:1568-1578). |
| security | LOW | DD4의 "artifact 내용은 이미 `redact.js`를 통과한 산출"이라는 문장이 이 milestone이 새로 만드는 두 번째 공개 artifact `gate.json`에 대해 거짓이다. `gate.json`은 `gate.js --json`의 직접 산출이고 어디에서도 `redact.js`를 거치지 않으며, `redaction_ok`/`validateElement` 계약의 대상도 아니다. 그 안의 `message`는 measurement 파생 실패 파일 목록과 fail-closed 진단(git 해소 실패 등)을 담고 `if: always()`로 조건 없이 발행된다. 즉 이 milestone의 유출 회계("잔여 축은 redact.js 헤더가 열거하고 backlog가 소유한다")에 회계되지 않는 표면이 하나 늘었다. | plan:602-603 "artifact 업로드는 유지하되(`if: always()`) 그 내용은 `scripts/test-suite/redact.js`를 이미 통과한 산출이다. 잔여 유출 축은 … 헤더가 열거하고 backlog가 소유한다" 대 plan:997 "판정 단계는 `--json`으로 이 출력을 `gate.json`에 쓰고 artifact로 올린다" · plan:1050-1051(메시지에 실패 파일 목록 포함). 플랜 전체에서 `gate.json` ↔ redaction 결속은 0건(grep `redact\|redaction`). |
| test | HIGH | 절단 A(`--apply-red`/`--revert-red`)는 세 절단 중 유일하게 어떤 로컬 검사·test 분기도 왕복시키지 않는다. 계획은 형제 축에서 정확히 같은 누락을 HIGH로 흡수해 놓고(B의 복원이 산문뿐이던 것 — L2 R7 invariant) A에는 같은 규율을 주지 않았다. `--apply-red`가 파일을 index에 올리지 않아(=`git ls-files`에 안 잡혀 스위트가 여전히 green) 또는 `--revert-red`가 트리에 잔재를 남겨도 붉어질 검사가 0건이고, 그 결함은 버리는 PR 의식 도중에야 드러난다 — 그리고 그때는 Acceptance 3-A의 `stage=1` 증거가 '절단이 안 됐다'와 '게이트가 red를 놓쳤다'를 구분하지 못한다. | plan L1439 `--apply-red`/`--revert-red`가 절단 A … / L1444-1445 "세 복원 모두 `git status --porcelain`이 비어 있음으로 확인한다" — 그러나 Task 7 Validate는 (a)(b)(c)가 `--apply`/`--revert`, (a2)(b2)가 `--apply-delete`/`--revert-delete`만 왕복시키고(L1636-1642), `## Validation` 검사 4·4b도 각각 `--apply`·`--apply-delete`만 부른다(L1793-1832). grep 결과 `--apply-red`는 plan 전체에서 CI 의식 서술(L631)과 (e2)/(e3) 증거 요건(L1645-1648)에만 등장하고 실행·단언하는 검사가 없다. |
| test | MEDIUM | 강제 workflow가 어느 Node로 스위트를 도는지가 계획 어디에도 고정돼 있지 않고 Task 7 오라클의 단언 대상도 아니다. 그런데 이 계획 자신이 Task 1c를 'node20 전용 red'로 분류하므로, 게이트 green 여부가 그 미고정 값에 달려 있다 — 즉 '축 C 진입 전 스위트 green'이라는 load-bearing 주장이 어떤 단언으로도 반증되지 않는 변수 위에 서 있다. | plan L1254-1255 단계 순서 열거에 `actions/setup-node`가 없고, Task 7 단언 2b(L1583-1596)가 요구하는 앞 단계 넷에도 없다. 반면 L908 "1c `dispatch-fullcycle-smoke.test.js` (node20 전용 — Node 버전 간 갈리므로 flaky 축 의심)"이 버전 의존을 명시하고, 형제 파일은 matrix로 버전을 고정한다(`.github/workflows/test-suite-baseline.yml` matrix.node). |
| test | LOW | `## Validation` 블록은 위에서 아래로 실행하면 검사 2에서 반드시 실패한다 — 입력 `.claude/cache/m3-local.json`은 검사 7이 생산하는데 순서 가드가 검사 7 쪽에만 있고 검사 2에는 없다. 검증 절차가 그대로 돌지 않는다는 것은 이 계획이 스스로 경계한 '게이트 모양만 남은 게이트'의 약한 형태다. | plan L1775-1779(검사 2가 `--measurement .claude/cache/m3-local.json`을 무조건 읽음) 대 L1844-1846(검사 7이 그 파일을 생산하고 `test -s … \|\| { echo "FAIL: 검사 2는 검사 7의 measurement를 요구한다 — 7을 먼저 돌려라"; exit 1; }`로 뒤늦게 가드). |
| invariant | MEDIUM | gate.js — the only merge-blocking CLI — treats an absent `--base-ref` as a permissive downgrade (`base=absent`, static floor only), which silently disables one of the two axes the plan itself names as the real blocking force. The sibling input `--floor-from` got the opposite treatment for the identical failure mode, and the plan gives no reason for the asymmetry; no in-plan caller actually needs the permissive path (Validation 4b and 7b both pass `--base-ref HEAD`). | Plan L816-822 ("`--base-ref`를 넘기지 않는 호출자(로컬 진단 · 다른 workflow)에서는 출력이 `base=absent`를 싣고 정적 floor로만 판정한다") vs L829-831 ("`--assert-accounted`인데 `--floor-from`이 없으면 fail-closed다 … permissive default는 선택지가 아니다: 그것이 정확히 '인자가 빠져도 green'이다"); local callers at L1825 and L1863 both pass `--base-ref`. |
| invariant | MEDIUM | DD3 stage 3 folds an unknown-quality redaction into 'clean'. `run.js` emits `redaction_degraded` (a list of redaction-rule producers that failed, i.e. fewer rules were applied) precisely so consumers can distinguish it, but the gate's stage-3 input set is `redaction_ok === true` only. A run whose redactor lost rules and therefore found no hits is indistinguishable from a fully-redacted clean run, in a workflow that uploads the artifact publicly on every PR. | `scripts/test-suite/run.js:593` `redaction_degraded: redactor.degraded` and `:600` `out.redaction_ok = folded.redaction_ok && scan.hits.length === 0 && !scan.truncated` (degraded not consulted); plan DD3 table L556 lists only `measurement.redaction_ok === true`, and `redaction_degraded` appears 0 times in the plan. |
| invariant | LOW | The plan's claim that a merged `allow_deletions` entry loses effect on its own is false for a re-added path: the exemption is a literal path-set membership test and cleanup is explicitly deferred to 'the next exclusion/exemption edit', so a stale entry silently exempts a future deletion of the same path with no diff-visible edit. | Plan L804-805 ("머지된 뒤의 항목은 base에도 없어져 **효력이 스스로 사라진다**") vs L781-783 (cleanup deferred: "그 정리는 다음 격리·면제 편집과 같은 diff에서 한다") and Task 2b (k) semantics `missing ⊆ allow_deletions`. |
| invariant | LOW | `## Validation` states that check 7b closes the 7→2 ordering dependency 'within itself', but the only existence guard for the measurement file is placed inside check 7 *after* the producing command, where it can never protect check 2. Run top-to-bottom, check 2 aborts on a missing measurement. | Plan L1846 (`test -s .claude/cache/m3-local.json \|\| …` sits after the `run.js … > .claude/cache/m3-local.json` line at L1844-1845) vs L1853-1855 ("검사 2는 이 산출(7)을 읽으므로 실제 실행 순서는 7 → 2다 … 이 줄이 그 의존을 자기 안에서 닫는다"). |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 인용 검증: run.js:10-12·:179-183·:213-214·:407-410·:580·:666-679, enumerate.js normalizeExclusions/exclusionsDigest/enumerateTests 시그니처와 export, test-suite.test.js L696-720의 `childEnv({allowCodex:true})` 직접 호출, version-declaration-gate.yml L21-24·L57-60·L62-65 — 전부 계획이 주장하는 대로였다(틀린 인용 0건). 구조 공격: (1) DD9 래칫 산술을 손으로 돌렸다 — floor=`tracked_basis−(max_allowed_deletions+1)`, 면제 추가/정리/재기준 사이클, 절단 B(1건 삭제), 삭제1+추가1 상쇄, rename까지 넣어도 여백 불변식이 깨지지 않고 `allow_deletions` 출구가 살아 있다. (2) pull_request merge-ref 위에서 `git merge-base HEAD origin/<base>`가 base tip drift를 실제로 접는지 확인했다 — 접는다. (3) `max_excluded_files`가 gate(`<=`)·열거 sanity(차이 등가)·Task 3 test(상수 등가) 셋에 걸린 것이 "한 불변식에 소유자 셋"인지 따졌다 — 세 비교의 좌우변이 서로 다른 수량이고 gate의 `<=`는 더 느슨한 방향이라 위조 경로가 되지 않는다. (4) `## Validation` 4b를 줄 단위로 시뮬레이션했다(합성 measurement가 stage 0/1/2 커버리지를 실제로 통과해 stage 2 `deleted_without_allowance`에 도달하는지, `--base-ref HEAD`가 미커밋 `git rm`에서 index/HEAD 비대칭 덕에 판별력을 갖는지, 삭제 대상 선택기가 규칙 2를 안 봐도 무해한지) — 전부 성립한다. (5) 전수 실행 단계가 exit 1이면 판정 단계가 skip돼 stage 0 코드가 CI에서 도달 불가가 되는 경로를 팠으나 체크는 여전히 red라 과대허용이 아니다. (6) 판정자 자기 test 단계 ↔ 절단 A·B의 결합(트리를 읽는 단언이 producer를 죽이는가)을 (e5)·(e5a) 선택 규칙과 대조했다 — 덮인다. 위 LOW 하나 외에 증거 있는 구조 결함을 찾지 못했다. |
| security | pass | 공격한 것: (1) 포크 PR 위협모델 — `pull_request_target` 부재·`permissions: contents: read`·`persist-credentials: false`·SHA pin·`secrets` 미주입이 전부 Task 7 오라클 1b의 단언 대상임을 확인, 뚫지 못함. (2) 셸 주입 — `${{ }}`를 `env:` 간접으로 옮기고 판정 줄이 `"origin/$BASE_REF"`로 인용하며, 단언 3b가 `run:` 블록의 `${{` 클래스 전체를 음성 fixture와 함께 금지함을 확인. `github.base_ref`는 base 저장소 소유자만 통제. 뚫지 못함. (3) 게이트 위조(판정자·상수·오라클이 전부 PR 통제 트리 안) — DD4a가 입력·통제 지점·닫지 않는 이유를 배선대로 기록하고 있어 은폐된 신뢰 경계가 아님. (4) 부분 상태 신뢰/약한 필드 fallback — `judge`의 fail-closed 여덟(키별 다섯 분기 포함, `?? Infinity` 류 기본값 금지)과 `allow_deletions` 원소 shape·리터럴 경로 강제(분기 (k) 여섯째)가 이미 배선됨. (5) 삭제 래칫 우회(`--base-ref HEAD`, 손수 만든 `--measurement`) — 네 인자 값 리터럴 pin + `env:` 블록까지 넓힌 값 단언으로 닫힘. (6) 전수 실행이 실제 Codex를 부르는 자원 고갈 경로 — `run.js:440-458`이 `MCCP_CODEX_DISABLED=1`을 자식에 기본 강제하고 Task 4가 `--allow-codex`에 `GITHUB_ACTIONS` 가드를 배선. (7) 세션/경로 traversal 축 — 이 milestone에 해당 표면 없음. 남긴 둘은 위 findings이며 둘 다 HIGH가 아니다. |
| test | fail | plan 전문(2043행)과 PRD를 읽고 test 렌즈로 공격했다: (1) Files to Change의 각 모듈에 짝 test가 있고 Validate 줄이 실제로 그것을 부르는지 대조 — `container-check.js`·`gate.js`·`coverage.js`·`exclusions.js`·`ci-required-checks.js`는 모두 test와 Validate 줄을 갖는다; `wiring-cut.js`만 세 서브커맨드 중 하나(`--apply-red`)가 어떤 실행 검사에도 안 걸려 있어 finding으로 냈다. (2) 검사 4b의 합성 measurement가 실재 producer 모양인지 — `enumerate.js`의 `enumerateTests`/`exclusionsDigest`가 실제 export임을 `scripts/test-suite/enumerate.js:98,84,140-147`에서 확인했고, digest가 `normalizeExclusions` 기반이라 ticket 필드 확장에도 gate 계산과 일치함을 확인했다(반증 실패). (3) `--base-ref HEAD`가 래칫을 항상 참으로 접는다는 계획 자신의 경고가 4b를 무력화하는지 — `git rm`이 index만 바꾸고 merge-base는 커밋 트리를 읽으므로 `missing`이 실제로 비지 않음을 확인했다(반증 실패). (4) 과대허용 방향 커버리지 — `blocked`→비영점 (m), stdout JSON (o), `continue-on-error`/`if:`/`branches`/`types` 부재, `secrets` 미주입, glob 면제 음성 통제가 모두 명시 분기를 갖는다(반증 실패). (5) 기존 test가 결함을 정답으로 고정하는지 — Task 4가 `scripts/tests/test-suite.test.js` L701·L720의 `childEnv` 직접 호출과 충돌하는 축을 이미 식별해 `GITHUB_ACTIONS=true` 재실행(검사 3b)으로 닫았다(반증 실패). 남은 두 결함은 Node 버전 미고정과 Validation 실행 순서다. |
| invariant | pass | Tried to open the gate along every unknown-input path I could construct. Verified the plan's load-bearing citations against source rather than trusting them: `run.js:179-183` (`Number(exit_code)\|\|0` folds spawn-failure null to 0 — stage 0 is genuinely required and correctly justified), `:205/:213-214` (`per_file: ok ? perFile : null` — the `null` vs `[]` claim is correct as written), `:566-604` (digest sealing, redaction fold), `deriveAttribution:131-153` (confirms the plan's claim that total exclusion yields `attribution:'none'`/`ok:false`, so branch (13)/stage 0 really does close the one-line-glob path), `enumerate.js:55-138` (normalize/digest are computed over the same normalized shape on both sides, so the anchoring comparison cannot drift). Traced the everything-went-wrong path: run.js crash mid-write, empty/partial measurement.json, killed process between `--apply`/`--revert` and between `--apply-delete`/`--revert-delete` — all end in fail-closed (unreadable measurement blocks; a cut tree makes the oracle red inside the pre-judgment self-test step; a staged deletion makes `deleted_without_allowance` red). Tried to make judgment skip: deleting the judgment step is caught by the self-test step; deleting the self-test step is caught by the full-suite run of the same oracle; deleting the whole workflow leaves the required check permanently pending. Checked the floor arithmetic for the two self-negating forms earlier rounds shipped (`>= before`, live margin inequality) — the current pure-JSON identity `tracked === tracked_basis − (max_allowed_deletions + 1)` is tree-invariant and does leave room for both the exemption exit and cut B. Checked rollback: the required-check disable/re-enable runbook is circular but the plan itself withdraws the 'a machine prevents forgetting' claim and records the operator dependency, so I did not count it. What I could not refute away are the four items above; none rises to HIGH — each is either output-stamped, oracle-guarded, or a local-validation-only defect. |

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
  "wall_clock_ms": 271382,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:26c549ce24ad4e70107d257d0f9a04cf7fce55dbc6a47f92dc2ee656c0c24f34",
  "plan_path": ".claude/plans/ci-full-suite-m3r.plan.md",
  "recorded_at": "2026-09-04T04:39:19.755Z"
}
```
