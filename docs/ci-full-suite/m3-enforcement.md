# ci-full-suite M3 — ci-enforcement

전수 스위트를 **머지 차단 게이트로 승격**한 milestone의 산출 기록.
계획은 [`.claude/plans/ci-full-suite-m3w.plan.md`](../../.claude/plans/ci-full-suite-m3w.plan.md).

> **이 문서는 관측과 해석을 분리한다.** 각 절의 표는 실측이고, 그 아래 산문이 해석이다.
> 미충족은 반올림하지 않는다(UI9) — §7이 무엇이 남았는지 전부 열거한다.

---

## 1. Linux red 집합 — 실측 대기

계획 Task 0은 브랜치를 push하고 `test-suite-baseline.yml`을 dispatch해 현재 Linux red
집합을 실측하도록 지시한다. **그 측정은 이 사이클에서 수행되지 않았다** — dispatch는
브랜치가 원격에 있어야 성립하고, 이 milestone의 구현은 그 이전 단계다.

그래서 Task 1의 입력은 M2 종결이 남긴 **실측 Linux 판정**이다(가설이 아니라 node 20·24
두 원소의 실제 artifact에서 나온 값이다 —
[`.claude/milestone-closures/ci-full-suite-m2.md`](../../.claude/milestone-closures/ci-full-suite-m2.md)
§"Linux 판정 대기 6건의 실제 판정" · §"열거 밖의 Linux red 3건"):

| # | 파일 | Linux 판정 | 귀속 |
|---|---|---|---|
| 1 | `plugins/mccp/scripts/derive/tests/mask.test.js` | red (node 20·24 양쪽) | 갈래 P |
| 2 | `plugins/mccp/scripts/lib/tests/santa-loop-cap.test.js` | red (양쪽, DD3 symlink 분기) | 갈래 P |
| 3 | `plugins/mccp/scripts/lib/tests/dispatch-fullcycle-smoke.test.js` | red (node 20 전용 — node 24는 green) | 갈래 F (flaky 의심) |
| 4 | `plugins/mccp/scripts/lib/tests/leadtime.test.js` | red | main 축 (leadtime-observability M3, `8107d5a`) |
| 5 | `plugins/mccp/scripts/lib/tests/msw-m8-producers.test.js` | red | main 축 (orchestrator-step-wiring, `5e4732e`) |
| 6 | `plugins/mccp/scripts/receipt/tests/receipt-linkage-fields.test.js` | red | main 축 (review-record-linkage M3, `9bd78b5`) |

## 2. Task 1 — 여섯 건 전부 격리, 수리 0건

**여섯 파일 전부 Windows 로컬에서는 green이다.** 2026-09-04 실측:

```
MCCP_CODEX_DISABLED=1 node --test plugins/mccp/scripts/derive/tests/mask.test.js
  → tests 20 · pass 20 · fail 0

MCCP_CODEX_DISABLED=1 node --test --test-concurrency=2 \
  santa-loop-cap.test.js leadtime.test.js msw-m8-producers.test.js \
  receipt-linkage-fields.test.js dispatch-fullcycle-smoke.test.js
  → tests 155 · pass 152 · fail 0   (나머지 3은 skip)
```

즉 여섯 건은 **저작 호스트에서 재현되지 않는다.** 계획의 판정 기준("단언이 특정
플랫폼에서만 참이면 가드, 코드가 플랫폼을 잘못 다루면 수리, 어느 쪽도 아니면 격리")과
Risks 행("수리보다 **격리와 티켓**을 기본으로 둔다 — 수리는 원인이 자명할 때만")에 따라
**여섯 건 전부 명시 격리**했다(UI7). 수리 0건이다.

격리 목록은 [`.github/test-suite-exclusions.json`](../../.github/test-suite-exclusions.json)
한 파일이고 각 항목이 사유와 티켓을 든다. **재현 불가는 원인 규명이 아니다** — 그
사실이 각 항목의 `reason`에 그대로 적혀 있고, 원인 규명은 티켓이 진다.

> **이 절이 주장하지 않는 것**: 이 격리가 옳다는 것. 격리는 "Linux에서 붉고 여기서
> 재현되지 않는다"만 말하며, 그 여섯이 실제로 플랫폼 결함인지 flaky인지 다른 축의
> 회귀인지는 **미규명**이다. Task 0의 Linux 측정이 도착하면 각 항목은 재평가 대상이다.

## 3. 커버리지 — OQ5의 답

**분모는 tracked `*.test.js` 파일 수다.** 세 후보 중 test case 수는 이 러너가 산출할 수
없고(reporter가 `nesting !== 0` 이벤트를 버린다), 남는 둘("파일 수" · "미실행 파일 0")은
같은 것의 두 표현이다. 채널은 `git ls-files -z '*.test.js'`이고 소유자는 `gate.js`다 —
`measurement.files_total`에서 파생하는 것은 **금지**이며 그 금지는 산문이 아니라 짝
단언으로 고정된다(`test-suite-coverage.test.js` 분기 12).

작성 시점 실측:

| 항목 | 값 |
|---|---|
| tracked `*.test.js` | 388 |
| 격리(glob 확장 결과) | 6 |
| 러너가 실행·귀속한 파일 | 382 |
| `coverage_pct` | **98.4536** (표시 98.45) |
| `unexplained` | 0 |

로컬 전수 실측(2026-09-04, 격리 6건 적용): **382 파일 · 실패 0 · `attribution=complete`
· `redaction_ok=true` · 벽시계 650초**. 그 측정에 대해 게이트를 로컬에서 부른 결과는
**exit 0**이다 — 계획은 Windows 전용 red가 1단계를 막는 경로를 정상으로 열어 뒀는데(DD8),
격리 여섯을 적용한 이 트리에서는 그 경로에 들어가지 않았다.

> **`test-suite-floor.json`의 `tracked_basis`(384)는 이 milestone 자신의 test 4면이
> tracked가 되기 **전** 값(오늘 트리는 388)이고, 그대로 두는 것이 맞다.** 그 파일의 유지 규칙은
> `allow_deletions` 정리와 **같은 diff에서만** 재기준하라고 적혀 있고 지금은 그 정리가
> 없다. 도출식 `tracked = tracked_basis - (max_allowed_deletions + 1)`은 파일 안의
> 순수 산술이라 트리가 커져도 불변이며, 여백이 생기는 것은 결함이 아니라 설계다 —
> 정식 등재된 삭제가 `below_floor`로 막히지 않게 하는 것이 그 여백의 목적이다.
> 정밀한 삭제 탐지는 floor가 아니라 merge-base 집합 차가 한다.

**98.45퍼센트를 100으로 반올림하지 않는다**(UI9). 그리고 게이트가 green인 것과
커버리지가 100퍼센트인 것은 **다른 명제**다(DD2) — 머지 차단 조건은 `unexplained === 0`
이지 `coverage_pct === 100`이 아니므로, 격리된 6개 파일은 게이트를 막지 않는다. 격리의
대가는 red가 아니라 tracked diff · `ticket` 필수 · 상한 래칫이다.

## 4. 축 D — 배선 절단 음성 통제

절단 셋이 [`scripts/test-suite/wiring-cut.js`](../../scripts/test-suite/wiring-cut.js)에
있다. **로컬 왕복은 전부 통과했다**(2026-09-04):

| 절단 | 무엇을 하는가 | 로컬 결과 |
|---|---|---|
| 오라클 왕복 (`--apply`) | 판정 줄에서 `--floor-from` 토큰 제거 | 절단 시 `wiring-cut.test.js` **red**(rc=1) · 복원 후 green · 파일 바이트 동일 |
| A (`--apply-red`) | 붉은 test 파일 1개를 index에 심는다 | 게이트가 `stage=1` · `reasons=["suite_red"]`로 차단 · 복원 후 파일·index 청결 |
| B (`--apply-delete`) | tracked test 파일 1개를 `git rm` | `stage=2` · `unexplained=0` · `coverage_pct=98.4496`(분모가 387로 줄어 §3의 98.4536과 다르다 — 그것이 요지다)인데 `reasons=["deleted_without_allowance"]`로 차단 |

**B가 이 milestone의 핵심 실증이다.** 커버리지 오라클은 **만족한 채로**(삭제된 파일은
tracked에서 사라졌으므로 설명 못 한 파일이 0이다) 게이트가 막는다 — 즉 "실행률"과
"결함을 잡는다"가 다른 명제임을 게이트가 스스로 보인다(UI10 · Success Metric 4).

> **로컬 왕복은 축 D의 실증이 아니다.** 계획 Acceptance 3이 요구하는 것은 **CI에서**
> red를 만든 run URL 둘이고, 그것은 버리는 브랜치(`chore/axis-d-negative-control`)에서
> 얻는다(DD5의 4단계 절차). 이 사이클에서 그 PR은 열리지 않았다 — §7 참조.
> 로컬이 실제로 증명한 것은 **절단의 기계**(index 반영 · 격리 회피 · 복원)이고, 그것이
> 없으면 CI run이 "절단이 안 됐다"와 "게이트가 red를 놓쳤다"를 구분하지 못한다.

### 4a. 구현 중 발견한 결함 — `--revert`가 조용히 실패하던 경로

첫 구현의 `revertOracle`은 `git checkout HEAD -- <file>`로 복원했다. 그것은 파일이
**이미 커밋돼 있을 때만** 동작하고, 이 workflow를 처음 만드는 바로 그 사이클에서는
`did not match any file(s) known to git`으로 죽어 **잘린 트리가 그대로 남았다**(실측).
그리고 `git status --porcelain`은 untracked 파일의 *내용* 변화를 보지 못하므로 계획의
잔여 검사가 그 실패를 놓쳤다 — 복원 실패가 조용했다.

복원을 스냅샷 기반으로 바꿨다: `--apply`가 자르기 **전에** 원본을 상태 파일에 넣고
`--revert`가 그것을 되쓴 뒤 토큰 재확인으로 검증한다. tracked 여부와 무관하게 성립한다.

## 5. OQ3 — Windows matrix: **답하지 못했다**

계획 Task 6은 baseline에 OS 축을 더하고 **dispatch 1회**로 재서 DD8의 사전 규칙을
적용하도록 지시한다. 편집 다섯은 전부 착지했고 오라클 넷이 그것을 단언한다:

1. `strategy.matrix.os: [ubuntu-latest, windows-latest]` + `runs-on: ${{ matrix.os }}`
2. artifact `name:`·`path:`에 OS 축 추가 (`test-suite-baseline-<os>-node<n>`) — 없으면
   같은 node의 두 job이 동일 이름을 올려 `upload-artifact@v4`가 중복을 거부하고
   Windows artifact가 **존재 자체를 못 한다**
3. `defaults.run.shell: bash` (Windows 기본은 pwsh)
4. job `name:`에 OS 축 추가 — 없으면 두 leg이 동일 check 이름을 갖는다
5. `/tmp/enum.txt` → `${{ runner.temp }}/enum.txt`

**그러나 측정은 수행되지 않았다.** dispatch는 브랜치가 원격에 있어야 하고, 그 전제는 이
사이클 밖이다. 따라서 **OQ3은 열린 채로 남는다** — DD8의 결정 규칙은 측정 **전에**
못박혀 있으므로(Windows 전용 red 0건이면 Linux 전용, 1건 이상이면 matrix, 벽시계가
Linux의 10배 초과면 별도 트리거) 측정이 도착하면 그 표의 어느 행인지가 바로 정해진다.
**규칙을 측정 후에 바꾸지 않는다**(UI8).

## 6. 게이트의 형태 — 무엇이 무엇을 막는가

강제 workflow는 [`.github/workflows/test-suite.yml`](../../.github/workflows/test-suite.yml)
하나이고 판정은 [`scripts/test-suite/gate.js`](../../scripts/test-suite/gate.js) **한
명령 안에서** 순서대로 이뤄진다:

| 순서 | 축 | 실패 시 |
|---|---|---|
| 0 | `measurement.ok === true` | 차단 — 측정이 성립하지 않았다(스위트 red와 **다른 사실**이다) |
| 0 | `measured − tracked = ∅` | 차단 — 그 measurement는 이 트리의 것이 아니다 |
| 1 | `exit_code === 0` | 차단 — 실패 파일 목록 + "아래 유출 판정은 이 red의 하류일 수 있다" |
| 2 | 커버리지 4조건 + 삭제 래칫 | 차단 — `reasons`가 판별자다(stage는 공유 칸이다) |
| 3 | `redaction_ok === true` | 차단 — 1을 통과했으므로 **green인데 유출**이다 |

0단계가 없으면 1단계가 거짓말을 한다: chunk spawn 실패는 `{exit_code: null}`을 내고
`foldChunks`가 `Number(null) || 0`으로 접으므로, 스위트가 **한 번도 돌지 않았는데**
1·3단계를 통과하는 measurement가 실재한다.

### 6a. 구현 중 흡수한 보안 결함 (HIGH)

`security-reviewer`가 실측으로 재현한 것이고 **M3이 새로 여는 축**이다.
`enumerate.js#globToRegExp`는 `*`마다 무한 수량자를 **합치지 않고** 이어붙이므로 연속된
`*`는 파국적 backtracking 형태가 된다. 실측: `"*".repeat(15)+"ZZZNOMATCH"`는 경로 하나에
8초에도 끝나지 않았고, 그것을 담은 목록으로 `run.js --list`를 부르면 15초 뒤에도 살아
있었다.

오늘 그 코드는 운영자 로컬 경로에서만 도달 가능하고 baseline은 `--exclude-from`을 아예
넘기지 않는다. **M3의 강제 workflow가 처음으로** fork PR이 통제하는 tracked 파일 내용을
리뷰 이전에, `paths` 필터 없이, 저장소의 유일한 머지 차단 체크 위에서 그 코드에 먹인다.
25자 pattern 한 줄이면 그 체크가 `timeout-minutes: 60`을 다 쓰고 죽고, 머지되면 **이후
모든 PR**이 같은 한 시간을 지불한다. DD7·DD9의 래칫 셋은 전부 *몇 개를* 격리하는지를
재고 *한 패턴이 얼마나 비싼지*는 재지 않으므로 이것을 막지 못한다.

닫은 방법: `exclusions.js`의 검증기에 복잡도 상한 셋(`MAX_PATTERN_LENGTH=200` ·
`MAX_PATTERN_WILDCARDS=8` · `***` 이상 연속 금지). DD7이 이 모듈을 **소비 경로 위에**
올려 뒀으므로 러너와 게이트가 둘 다 그것을 지난다. 표현력 손실은 0이다 — glob에서
`***`는 `**`와 같은 것을 뜻한다. 회귀 분기 5개가
`test-suite-coverage.test.js`에 있고, 그중 하나는 **소비 경로**에서 20초 timeout으로
"평가가 아니라 거부"임을 잰다.

## 7. 이 문서가 주장하지 않는 것 (미충족 — 반올림하지 않음)

계획 Acceptance의 라이브 완주 산출물 넷 중 **둘이 충족됐고 둘이 남는다.** 초판에서는 넷 다
미충족이었고 사유가 하나였다 — 브랜치가 원격에 없어 CI가 한 번도 돌지 않았다. 그 사유는
2026-09-08 소멸했다(§7a): 게이트가 발화했고, 붉은 것을 차단했고, 그 red가 해소된 뒤
green으로 완주했다. 3·4는 그대로 남는다 — 둘 다 이 PR이 아니라 **별도 절차**(버리는 PR ·
운영자 수동 설정)를 요구하므로 여기서 충족될 수 있는 것이 아니다.

| # | 요구 | 상태 | 무엇이 남았나 |
|---|---|---|---|
| 1 | PR에서 `test-suite` 체크가 발화하고 green | **충족** | run `34176593137` (PR #185, HEAD `cb64b70`) — `full test suite gate` pass, 2m11s |
| 2 | 커버리지 실값이 **CI에서** 산출 | **충족** | 같은 run의 `gate.json`: `coverage_pct` 98.4655 · `denominator` 391 · `unexplained` [] · `missing` [] |
| 3 | 절단 A·B가 각각 CI에서 red를 만든 run URL 둘 | **미충족(2026-09-08 M4 재확인)** | DD5의 버리는 PR 절차. 로컬 왕복만 통과(§4). **M4가 바꾼 것**: 이 산출물을 막던 것이 절차가 아니라 코드였음이 드러났고 그 결함은 닫혔다 — `wiring-cut.js#applyDelete`가 대상 가드 없이 임의 경로를 `git rm` 해, 절단 B가 자기 test(`Gate discriminating-power tests` step이 부르는 둘)나 격리 6건을 고르면 `Enumerate sanity` 등가 단언이 **판정보다 먼저** 죽어 `gate.json`이 생성되지 않았다. 이제 5 사유 코드로 거부한다. 남은 것은 원격 왕복뿐 |
| 4 | 운영자 branch protection 설정 후 `ci-required-checks.js`가 exit 0 | **미충족(2026-09-08 M4 재확인)** | 수동 1회 — 인증 계정 `madsci207`이 `admin:false`라 수행 주체는 `idenn207`이다. **M4가 바꾼 것**: 이 산출물은 그 전까지 **원리상 도달 불가**였다. 진단이 admin 전용 `/branches/{b}/protection/required_status_checks`를 읽어 non-admin에게 보호 유무와 무관하게 404 → `protection_absent`를 냈으므로, `idenn207`이 무엇을 설정하든 이 계정으로는 exit 0이 나올 수 없었다. 이제 world-readable `/branches/{b}`를 읽고 `protection_unreadable`(권한/판독)과 `protection_absent`(보호 없음)를 가른다 |

### 7a. 첫 라이브 발화 — 막았고, 막은 것이 옳았다 (2026-09-08)

PR #185에서 게이트가 처음 돌았다(run `34174703512`). 판정은 **차단**이었다:

```
{"blocked": true, "stage": 1, "reasons": ["suite_red"], "coverage": null}
```

차단은 옳았다. 붉은 것은 이 브랜치가 아니라 **main**이었다 —
`plugins/mccp/scripts/lib/tests/command-body-lint.test.js`가 `origin/main`의 트리에서도
같은 단언으로 실패한다(같은 커밋의 `git archive`로 재현). §1·§2의 격리 여섯과 다른
성질이다: Linux 전용도 아니고 재현 불가도 아니다. 원인은 `work.md:962` —
halt 원장 진전 기록(`b35be24`)이 fail-open 계측 호출 **하나만** 담은 fence를 새로 만들었고,
그 fence의 마지막 줄이라 S2("비차단 호출은 분기 종결자가 될 수 없다")가 잡는데 부채
열거에는 등재되지 않았다. 전수 스위트가 머지 차단이 아니었기 때문에 그 red가 나흘간
main에 살아 있었다 — 즉 이 milestone이 존재하는 이유를 그 자신의 첫 발화가 실증했다.

해소는 **수리가 아니라 열거**다(`SEAM_DEBT` 18 → 19). 규칙이 지목하는 해악("실패한 검사가
통과로 읽힌다")이 이 fence에서는 성립하지 않고(읽히는 검사가 없다), `|| true`를 떼면
배너 신선도용 기록의 실패가 체인을 멈추게 되어 fail-open 계약이 깨지며, `|| true`를 다른
fallback으로 바꾸는 것은 "exit status가 항상 0"이라는 성질을 그대로 남긴 채 매처만 피하는
회피다. 래칫이 요구하는 대로 상한 상향은 자기 편집으로 diff에 남는다.

같은 run이 게이트 자신의 결함도 드러냈다. stage 1 메시지가 실패 파일 자리에
`2 failing file(s): [object Object], [object Object]`를 실었다 — `measurement.failing`은
`{file, name, kind, error}` 객체 배열이고(`reporter.mjs:182-189`) 한 파일이 roll-up 1건 +
실패 test N건으로 여러 항목이 되는데, `gate.js`가 그 배열을 그대로 join하고 항목 수를
파일 수로 셌다. 이것이 test를 통과하며 살아남은 경로는 fixture다: `test-suite-coverage.test.js`
(a)의 `failing`이 문자열 배열이라 test가 producer가 아니라 자기 자신을 검사하고 있었다.
게이트가 막았을 때 사람이 읽는 **유일한** 산출물이므로 파일 단위 접기 + 실제 shape 회귀
test 둘(`(a2)`·`(a3)`)로 닫았다.

부채 등재 + 보고 결함 수리 후 같은 게이트가 **green으로 완주했다**(run `34176593137`,
HEAD `cb64b70`):

```
{"blocked": false, "stage": null, "reasons": [],
 "coverage": {"coverage_pct": 98.4655, "denominator": 391, "unexplained": [], "missing": []}}
```

CI 실값이 §3의 작성 시점 실측(98.4536)과 다른 것은 회귀가 아니다 — main을 병합한
`cc0c086`이 tracked test 파일 3개를 들여와 분모가 **388 → 391**로 이동했다(실측:
`git ls-tree -r --name-only cc0c086~1 | grep -c '\.test\.js$'` = 388, `cc0c086` = 391).
격리 6건은 그대로이고 `unexplained`는 양쪽 다 비어 있다. 커버리지는 **백분율이 아니라
`unexplained === 0`이 판정 조건**이라는 점(DD2)이 여기서 그대로 관측된다 — 분모가 움직여도
게이트의 판정은 움직이지 않았다.

이 절이 주장하지 않는 것: 절단 A·B의 CI red run(Acceptance 3)은 여전히 없다. green 한 번은
"게이트가 통과시킨다"를 보일 뿐 "막아야 할 것을 막는다"를 보이지 않는다 — 후자는 DD5의
버리는 PR 절차가 소유하고, 로컬 왕복만 통과한 상태다(§4).

그 밖에 남는 것:

- **Task 0의 Linux 측정 미수행** — §1·§2의 격리 여섯은 M2의 Linux artifact에 근거하며,
  Task 0이 요구한 **새 측정**은 없다. 격리가 옳은지는 그 측정이 판정한다.
- **OQ3 미종결** — §5. 배선은 착지했고 측정만 없다.
- **`fully_skipped` 축은 측정 공백으로 남는다** — 전 test가 skip인 파일("실행됐다"는
  참이고 "단언이 돌았다"는 거짓)은 실재하는 위험이지만 그것을 말할 수 있는 데이터가
  측정 경로에 없다. 필드를 **만들지 않았다**(DD2 철회) — 합성 fixture로만 단언되는
  필드를 스키마에 올리면 실제 CI에서 그 값이 영원히 부재여도 test는 항상 green이다.
- **게이트 위조는 닫지 않는다**(DD4a) — 판정 입력이 PR이 통제하는 트리에서 나오고
  판정 모듈 자신도 tracked이므로 같은 PR에서 함께 고칠 수 있다. 이 게이트가 막는 것은
  **부주의**이지 **의도**가 아니다. 실효 통제는 코드 리뷰와 필수 리뷰어이고 그것은
  저장소 설정이다.
- **`redaction_ok` 차단은 발행을 막지 못한다** — 업로드 단계가 `if: always()`이므로
  게이트가 3단계에서 차단해도 유출본은 공개 artifact가 된다. 업로드를 `redaction_ok`에
  조건화하면 축 D의 red run 증거가 사라지므로 **이 milestone은 증거를 택했다**.
- **노출 빈도는 넓어진다** — baseline은 `paths`가 좁았는데 새 workflow는 필터 없이 전
  PR에서 artifact를 올린다. 유출 *축*은 그대로지만 같은 잔여 축이 훨씬 자주 노출된다.
