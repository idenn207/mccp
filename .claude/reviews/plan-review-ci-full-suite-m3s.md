# Plan Review Panel — ci-full-suite-m3s

**Plan**: `.claude/plans/ci-full-suite-m3s.plan.md` · **Plan version**: `sha256:4d7e479de0bc60b3b1bada4cc90af6eb27f273128afbeab29ebf239bd737287a`
**Verdict**: `divergent` via `multi-agent`
**Quorum**: 4/3 responses · 4 distinct roles (of 4 fielded) · passed=false
**Layers**: L1 converged · L2 divergent · L3 not fired
**Halted at**: `5.2e`

> Reason: L2 quorum not satisfied: 2 blocking finding(s): invariant/HIGH, invariant/FAIL

## Findings

| Perspective | Severity | Claim | Evidence |
|---|---|---|---|
| architect | MEDIUM | 격리 목록 로드의 소유자가 둘이다 — `inputs.js`의 존재 이유("한 불변식에 소유자가 둘이면 순환이거나 두 번째 계산")를 그 모듈 자신이 어긴다. `## Files to Change`가 `scripts/test-suite/exclusions.js`를 "격리 목록 로드와 검증"으로, 같은 표의 `scripts/test-suite/inputs.js`를 "…격리 목록 로드…"로 **둘 다** 소유자로 적는다. 두 로더가 갈리는 구성이 실재한다: `run.js`는 `exclusions.js`를 거쳐 `ticket`·`MAX_EXCLUSION_ENTRIES`를 강제하는데(Task 3), `gate.js`의 fail-closed 여덟은 `--exclude-from`에 대해 **"부재/판독 불가"만** 열거하므로(Task 2b) "강제 workflow가 부르는 유일한 판정 명령"이 검증되지 않은 목록으로 판정할 수 있다. 두 로더가 같은 것임을 재는 짝 단언은 계획에 0건이다 — `coverage.js`↔`gate.js` 공유에 대해서는 Task 2가 짝 단언을 명시하는데("그 공유를 test가 확인한다") 이 축에는 같은 규율이 없다. | plan `## Files to Change`: `scripts/test-suite/exclusions.js` \| CREATE \| "격리 목록 로드와 검증 — 항목 수 상한 더하기 `ticket` 필수 (DD7)" 대 `scripts/test-suite/inputs.js` \| CREATE \| "`gate.js`와 `coverage.js` CLI가 **공유하는** 입력 해소 — `tracked`… · 격리 목록 로드 · 그 넷의 fail-closed"; Task 2b fail-closed 열거 "`--exclude-from` 부재/판독 불가" |
| architect | MEDIUM | `reasons`를 "닫힌 코드 열거"라 선언하면서 그 원소 중 fail-closed 여덟의 입력 코드는 **어느 단언도 방출을 요구하지 않는다** — 판별자를 stage에서 코드로 옮긴 R9 흡수가 이 축에만 절반으로 적용됐다. 분기 (j)는 여덟 각각에 대해 "비영점"만 단언하고, `judge`의 blocked 분기를 겨냥한 (o)(stdout에 파싱 가능한 JSON + `reasons`)는 CLI 입력 검증 경로를 덮지 않는다(그 경로는 `judge` 밖이라 `blocked=true`가 아니다). 즉 `base_set_empty`·`floor_entry_shape`·`measurement_invalid`를 이름 없이 죽는 구현이 전 검사를 통과하고, 그 상태에서 CI의 `gate.json`은 그 사유를 담지 않는다. 계획이 스스로 "비영점만 보면 구분 안 된다"를 축 A·삭제 축·(m)에서 세 번 흡수한 것과 같은 형태다. | plan Task 2b Action: "`reasons`는 **닫힌 코드 열거**다 — … fail-closed **여덟**의 입력 코드(`base_set_empty` · `floor_entry_shape` 포함)" 대 Validate (j): "…각각에서 비영점." / (o): "**`blocked=true`인 분기에서도** CLI가 `--json` 산출을 stdout에 실제로 기록한다" |
| architect | LOW | Task 6이 baseline.yml의 OS 축 확장을 "편집은 넷이다"로 못박으면서 job의 `name:`을 빠뜨렸다 — 그 값은 `node ${{ matrix.node }} — …`로 **node 축만** 담고 있어, `os` 축을 더하면 같은 node의 두 OS leg이 **동일한 check 이름**을 갖는다. artifact 이름 충돌은 편집 2가 닫았지만 check 이름 충돌은 열려 있고, DD6이 세우는 축(required status check는 **job 이름 문자열**로 걸린다 · `ci-required-checks.js`가 workflow가 선언한 job 이름을 파싱한다)과 Task 6 Validate의 "두 실패를 구분해 기록한다"가 그 이름을 판별자로 쓴다. | `.github/workflows/test-suite-baseline.yml:45` `name: node ${{ matrix.node }} — full-suite wall clock + per-file breakdown`; plan Task 6 편집 1~4에 `name:` 없음; plan DD6 "required status check는 **job 이름 문자열**로 걸리므로" |
| security | MEDIUM | DD4의 blanket 주장 "업로드되는 artifact 내용은 redact.js를 이미 통과한 산출이다"는 이 milestone이 새로 올리는 gate.json에 대해 거짓이다. gate.json은 gate.js가 조립하는 {blocked, stage, reasons, message, coverage}이고(plan L1000·L1013), fail-closed 여덟 경로의 진단 message는 gate.js/inputs.js 안에서 생성되는 문자열(예: --measurement 판독 실패, git ls-tree/merge-base 실패의 stderr)이라 redact.js의 치환·잔여 스캔을 한 번도 지나지 않는다. 업로드는 if: always()라 stage 3(redaction) 차단 시에도 조건 없이 발행된다(plan L732-737). 결과는 CI 러너 절대경로 등 미검열 텍스트가 매 PR 공개 artifact에 실리는 것이며, paths 필터 제거로 그 빈도는 넓어진다(plan L620-623). 위협 수준은 낮지만, 계획이 스스로 세운 "artifact 내용은 redaction을 통과한 것"이라는 계약을 새 산출물이 만족한다는 근거가 어디에도 없고 이를 재는 단언도 0건이다. | plan L618 "artifact 업로드는 유지하되(`if: always()`) 그 내용은 `scripts/test-suite/redact.js`를 이미 통과한 산출이다" 대 plan L1013 "판정 단계는 `--json`으로 이 출력을 `gate.json`에 쓰고 artifact로 올린다" + L1042-1060(fail-closed 여덟의 진단 경로가 gate.js/inputs.js 소유). redact.js:8-16이 치환+잔여스캔 계약을 run.js/reporter 경로에만 정의한다. |
| test | MEDIUM | Validation 검사 4a가 주장하는 명제("심은 red가 stage 1에 도달하는가")를 그 검사는 반증할 수 없다 — measurement가 절단 결과와 무관하게 무조건 red로 합성된다. 심은 파일이 실제로는 green이어도(또는 격리에 걸려 실행조차 안 돼도) 합성 JSON은 여전히 exit_code:1 · failing:[RED]이라 stage=1 · suite_red 단언은 항상 만족된다. 4a가 실제로 재는 것은 (i) index 등재와 (ii) gate.js가 red fixture에 stage 1을 낸다는 것뿐이고, 후자는 Task 2b 분기 (a)가 이미 순수층에서 덮는다. | plan L1848-1856: `--apply-red` 직후 `node -e '...{ok:true,exit_code:1,...,failing:[red]}'`를 무조건 기록한 뒤 `if(j.stage!==1\|\|!(j.reasons\|\|[]).includes("suite_red"))`로 단언. 반면 L1846은 이 검사가 "그 red가 stage 1에 도달하는가"를 잰다고 적는다. 실제 producer 증거는 Acceptance 3-A(L2088)의 CI run에만 존재한다. |
| test | MEDIUM | 절단 A의 선택 규칙 (e5a)에 기계가 없다 — 형제 축 B는 같은 규칙을 로컬 검사에 코드로 심었는데 A는 산문뿐이다. 심는 붉은 파일이 exclusions 패턴에 걸리면 CI 실험이 판정 전 단계에서 죽어 `gate.json` producer가 사라지는데, 그 위반을 붉게 만드는 검사가 0건이다. | plan L1696-1701 (e5a)는 "심는 파일도 어떤 pattern에도 걸리지 않아야 한다"를 요구만 하고, 검사 4a(L1848-1857)에는 그 대조가 없다. 대비: 검사 4b는 (e5) 규칙 3을 L1878의 `DEL=$(node -e '...allow_deletions...')`로 기계화했다. |
| invariant | HIGH | 1d의 `if:` 부재 단언이 판정 step과 판정자 자기 test step 둘로만 좁혀져 있어, 판정의 1차 입력을 **생산**하는 전수 실행 step은 `if:` 한 줄로 조용히 skip될 수 있다. 그 step이 skip되면 `measurement.json`은 생성되지 않고 — 그러나 판정 줄이 리터럴로 pin한 경로가 repo-relative `measurement.json`이므로, PR이 같은 이름의 파일을 커밋해 두면 게이트의 0~3단계 전부가 **그 커밋된 파일**을 판정한다. 손으로 만든 green measurement(ok:true · exit_code:0 · redaction_ok:true · per_file=tracked 전체 · 실제 exclusions로 계산한 digest)는 stage 0의 `measured − tracked = ∅`, unexplained 0, digest 일치, floor, 삭제 래칫을 전부 만족한다. 즉 스위트가 한 번도 돌지 않은 채 required check가 green이고, Task 7 오라클 단언 1·1b·1c·1d·2·2b·2c·3·3b가 **전부 green**이다(2b는 그 줄의 *존재*만 보고, 1c는 continue-on-error만 본다). 이는 R10이 `--measurement` 값 치환에 대해 닫은 경로(plan L1578 "`--measurement`를 손수 만든 JSON으로 돌리면 0~3단계 전부가 그 파일을 판정한다")를 값을 바꾸지 않고 producer를 끄는 것으로 그대로 재현한다. R17이 1d를 신설한 근거(무력화가 형태만 바꿔 남는다)가 이 step에는 적용되지 않았다. | plan `.claude/plans/ci-full-suite-m3s.plan.md:1598-1599` — "업로드 단계의 `if: always()`는 이 단언의 대상이 아니다. **대상은 둘이다** — 판정 줄이 있는 step과 **판정자 자기 test step**" · `:1396` 판정 줄이 `--measurement measurement.json`(repo-relative)로 pin됨 · `:1624` 2b는 전수 실행 줄의 *존재*만 단언 · `:1578` R10 자신이 같은 결과를 CRITICAL 경로로 기술 |
| invariant | MEDIUM | 판정 대상 트리 자체가 어떤 오라클에도 앵커되지 않는다. `actions/checkout`에 대한 단언은 `fetch-depth: 0`(단언 2)과 `persist-credentials: false`·SHA pin(단언 1b)뿐이고, `with: ref:` 추가를 금지하는 단언이 0건이다. `ref: ${{ github.event.pull_request.base.sha }}`(base 해소 문제를 '고치려는' 편집으로 자연스럽게 나올 수 있는 형태) 한 줄이면 게이트가 PR 트리가 아니라 base 트리를 판정해 항상 green이 되고, 모든 형제 무력화 벡터(continue-on-error · if: · paths/branches/types · 인자 값 치환)가 각각 단언을 받은 것과 비대칭이다. | plan `:1614-1617` 단언 2는 `fetch-depth: 0`과 base fetch 단계만 요구 · `:1603-1610` 1b는 permissions·persist-credentials·pull_request_target·SHA pin·secrets 다섯만 열거 · `:1709-1722` 합성 fixture 목록에 checkout `ref:` 변형 0건 |
| invariant | LOW | 격리 목록 검증 step(`exclusions.js --check`)과 열거 sanity step도 1d 사거리 밖이라 `if:`로 skip 가능하다. 두 step의 차단력은 각각 run.js 재배선(Task 3)과 자기 test의 `max_excluded_files` 등가 단언이 부분적으로 덮지만, 계획은 그 중복을 근거로 들지 않고 두 step을 2b에서 *존재*만 단언한다 — 즉 skip 가능성이 설계 판단이 아니라 미검토 공백이다. | plan `:1618-1633` 2b(존재만 단언, "단계 **순서**는 단언하지 않는다") · `:1593-1602` 1d 대상이 두 step으로 한정 |

## Refutation attempted

| Perspective | Verdict | What was attacked |
|---|---|---|
| architect | pass | 인용을 먼저 검증했다: `run.js:10-12`·`:179-183`·`:205`·`:213-214`(`per_file: ok ? perFile : null`)·`:725`, `enumerate.js`의 `exclusionsDigest`/`enumerateTests` export 실재, `version-declaration-gate.yml:21-24`·`:57-60`·`:62-65`(판별력 test가 가드보다 앞), `test-suite-baseline.yml:33-38`(`paths` 위치)·`:45-47`·`:88`·`:99`·`:107`, `.gitignore:149`(`.claude/cache/`). 전부 계획이 주장하는 대로였다. 깨보려 한 것: (1) 검사 4a/4b의 `--base-ref HEAD` + merge-base 산술 — `--apply-red`는 index만 늘리므로 `missing=∅`, `--apply-delete`(`git rm`)는 `missing={DEL}`로 실제로 stage 2에 도달한다. 성립한다. (2) `pull_request` merge ref에서 head_set이 base-side 추가를 포함해 `missing`이 거짓 양성이 되는가 — merge base 해소가 그것을 정확히 막는다. (3) floor 도출식 `tracked = tracked_basis − (max_allowed_deletions+1)` + 재기준 규칙을 두 삭제 사이클로 손으로 돌려 영구 `below_floor`를 재현하려 했으나 재기준이 그것을 닫는다. (4) 판정자 자기 test 단계가 절단 B의 트리에서 먼저 붉어지는 R14 결함이 남았는지 — 트리를 읽는 단언이 `max_excluded_files` 등가 하나로 줄었고 (e5)·(e5a) 선택 규칙이 그것을 덮는다. (5) 열거 sanity 두 검사와 절단 A·B의 상호작용 — 둘 다 격리 집합을 바꾸지 않아 무해. (6) 강제 workflow의 pin된 전수 실행 줄에 `MCCP_CODEX_DISABLED=1`이 없어 CLAUDE.md §3.4의 자원 고갈이 재현되는가 — `run.js:440·:458`의 `FORCED_POLICY_ENV`가 기본으로 강제하므로 거짓 경보였다. (7) stage 0이 강제 workflow에서 도달 불가인가(생산 줄이 `ok:false`에 먼저 비영점으로 죽는다) — fail-closed 방향이라 결함이 아니라 심층 방어. (8) 3b(`run:`에 `${{` 부재)가 `concurrency` 블록과 충돌하는가 — 범위가 `run:` 안이라 무해. 남은 셋만 보고한다. |
| security | pass | 공격한 축: (1) fork PR 임의 코드 실행 — permissions contents:read · persist-credentials:false · secrets 미주입 · SHA pin이 DD4와 오라클 단언 1b(plan L1603-1609)로 배선까지 내려와 있고, 미러 원본(.github/workflows/test-suite-baseline.yml:60-67)이 같은 위협을 명시한다. 착지 못함. (2) 셸 주입 — `${{ }}`를 run:에 직접 보간하는 클래스 단언 3b(plan L1641-1648)와 env 간접(L1410-1416)이 있고, 유일 값 github.base_ref는 base repo 소유자 통제라 attacker-controlled 경로가 없다. (3) --base-ref 조작으로 삭제 래칫을 항상 참으로 접기 — R10·R12 흡수로 네 인자 값이 리터럴 pin되고 env 매핑까지 오라클 사거리 안(L1566-1570). (4) 격리 glob 전면 확장(`**/*.test.js`) — enumerate.js:105-131의 이분 구성 + max_excluded_files 등가 + 분기 (13)이 닫는다. (5) 삭제 래칫 우회 — rename·상쇄(추가1/삭제1)·base_set 빈 집합·tip 대 merge base·worktree-only 삭제가 전부 fail-closed 여덟과 경로 집합 차로 닫혀 있음을 확인. (6) allow_deletions의 glob 확장·{path}만 있는 항목 — R13/R18이 리터럴 정확 일치 + 원소 shape fail-closed(소유자 inputs.js)로 닫음. (7) 판정 모듈 자체가 PR 통제 트리 안이라는 위조 축 — DD4a가 닫지 않음을 근거와 함께 기록하고, 실효 통제(required check 부재 시 pending)는 저장소 설정 축이라 UI6 밖. 이 셋은 정직한 잔여로 판단. 유일하게 evidence를 잡은 것은 위 gate.json redaction 계약 공백(MEDIUM)이며 HIGH/CRITICAL은 찾지 못했다. |
| test | pass | plan 전문(Files to Change · Task 0~10 Validate 줄 · ## Validation 블록 · Acceptance)과 PRD를 읽고 다음을 공격했다: (1) 각 Task가 편집하는 파일에 대응하는 test가 Validate 줄에서 실제로 실행되는지 — Task 5만 오라클 test를 자기 Validate에 적지 않았으나 전역 검사 1이 wiring-cut.test.js를 돌리므로 gap 아님. (2) 축 D 절단 A/B의 로컬 왕복(4a·4b)이 합성 fixture로 명제를 vacuous하게 만드는지 — A에서 실재(위 finding 1), B는 트리를 실제로 자르고 measurement만 합성해 래칫 한 축만 재므로 건전. (3) `--base-ref HEAD` 하에서 4a/4b의 base 집합 차 논리가 성립하는지 — 성립(추가는 missing=∅, git rm은 index 반영이라 missing≠∅). (4) 판정 줄 pin이 \\"한 줄\\" 스캔 범위와 모순되는지 — L1393이 명시적으로 \\"한 줄\\"이라 구성상 만족 가능. (5) 인용된 소스 주장 검증: `scripts/tests/test-suite.test.js:700-701·719-720`의 childEnv 직접 호출과 `scripts/test-suite/run.js:728-740`의 main/parseArgv 미export는 실측대로 참이었다. (6) 커버리지/게이트 분기 (a)~(o)·(1)~(13)에서 과대허용 방향(잘못 통과)이 빠진 축을 찾았으나 fail-closed 여덟·(m)·(o)·(n)이 덮고 있었다. |
| invariant | fail | DD9 삭제 래칫의 산술을 직접 재계산해 공격했다(floor = tracked_basis − (max_allowed_deletions+1) · 정상 삭제 사이클 2회 · 정리 후 재기준 · 절단 B 트리 — 모두 `tracked >= floor`가 등호로 성립해 구멍 없음). base 대조의 상쇄 구성(삭제1+추가1), rename, `base_set_empty`, `--base-ref HEAD` 로컬 오타 경로도 시도했으나 전부 이미 닫혀 있었다. `## Validation` 4a의 `RED` 빈 문자열 경로(`grep -qx ""`), 4b의 합성 measurement 생성 순서(stage 0 mismatch), `--assert-accounted`의 4조건 드리프트, coverage.js/gate.js 차단 권한 분리도 반증에 실패했다. run.js 인용(`:179-183` foldChunks의 `Number()\|\|0`, `:213-214` per_file null, `:725` ok 기반 종료코드, `:580` digest)은 소스에서 실제로 확인했고 계획의 서술과 일치한다. 뚫린 축은 하나 — workflow step 무력화(`if:`)와 트리 앵커링(checkout `ref:`)의 오라클 사거리로, 그중 전수 실행 step skip + 커밋된 `measurement.json` 조합은 모든 단언이 green인 채 게이트를 완전히 연다. |

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
  "wall_clock_ms": 340059,
  "halt_stage": "5.2e",
  "backlog_appended": null,
  "backlog_skipped_nonblocking": null,
  "granted": 4,
  "reviewed_plan_hash": "sha256:4d7e479de0bc60b3b1bada4cc90af6eb27f273128afbeab29ebf239bd737287a",
  "plan_path": ".claude/plans/ci-full-suite-m3s.plan.md",
  "recorded_at": "2026-09-04T04:47:12.948Z"
}
```
