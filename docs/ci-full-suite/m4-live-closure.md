# M4 — enforcement-live-closure: 라이브 산출물

> 이 문서는 **증거의 색인이자 기계 판독 입력**이다. `## Validation` 의 오라클이 아래
> `- key: value` 줄을 읽어 `gh` 로 실제 상태를 다시 잰다. 여기 적힌 문자열이 증거가 되는
> 곳은 **없다** — 문서가 나르는 것은 run id 와 미충족 사유뿐이고, 상태는 언제나 API 가 낸다.
>
> **반올림하지 않는다.** 라이브 산출물 중 축 D(절단 A·B) · OQ3 baseline · 격리 재판정은
> **충족**이고, 축 C(설정·차단력)는 권한 부재로 **명시 미충족**이다. 아래가 그 정직한 상태다.

## 기계 판독 필드

- baseline-run: `34195014409`
- oq3-dd8-row: `matrix`
- oq3-windows-only-red: `2`
- oq3-enforcement-owner: `ci-full-suite 후속 사이클 — 선행조건은 backlog ci-full-suite:H5 (baseline SHA-pin 패리티)`
- quarantine-verdict: `Q\L=0 · Q∩L=6 · L\Q=0`
- quarantine-released: `0`
- quarantine-residual: `6`
- quarantine-novel: `0`
- axis-c: `unmet`
- axis-c-blocker: `the authenticated account madsci207 has permissions.admin=false on idenn207/mccp, and a branch-protection PUT requires the admin ROLE — a token scope cannot substitute for it. Measured 2026-09-08 via gh api repos/idenn207/mccp --jq .permissions.`
- axis-d: `met`
- axis-d-a-run: `34556517175`
- axis-d-b-run: `34566171941`
- axis-d-pr: `193`

## 1·2. 축 D — 절단 A·B의 CI red · **충족 (2026-09-11)**

운영자 승인으로 원격 왕복을 수행했다. `chore/axis-d-negative-control` 브랜치(M4 변경물
실은 비-draft 버리는 PR [#193](https://github.com/idenn207/mccp/pull/193))에서 절단 A·B를
각각 1회 적용·관측·복원했다. **PR은 머지하지 않았다.**

| | 절단 A (소비 경로) | 절단 B (구조) |
|---|---|---|
| 커밋 | `43576b7` — `--apply-red` (붉은 test 심기) | `f518951` — `--pick-delete` → `--apply-delete .claude/scripts/receipt/tests/aliases.test.js` |
| run | [`34556517175`](https://github.com/idenn207/mccp/actions/runs/34556517175) · conclusion **failure** | [`34566171941`](https://github.com/idenn207/mccp/actions/runs/34566171941) · conclusion **failure** |
| `gate.json` | `blocked:true` · **`stage:1`** · `reasons ∋ suite_red` | `blocked:true` · **`stage:2`** · `reasons ∋ deleted_without_allowance` |
| tracked 사본 | [`axis-d-a-gate.json`](axis-d-a-gate.json) (artifact와 byte-동일) | [`axis-d-b-gate.json`](axis-d-b-gate.json) (artifact와 byte-동일) |
| 복원 | `c552722` — run `34556705341` **green** 확인 | `e9dd569` — 브랜치 tree가 M4 tip과 동일 |

두 `stage` 가 **다르다**(1 ≠ 2) — 두 절단이 서로 다른 것을 잰다는 판별자가 성립한다. 왕복
전 green 기준선도 확보했다: 초기 run `34556317904` **success**(동일 tree).

**이력 보존 (2026-09-08 미수행 사유)**: 당시에는 "외부 저장소에 대한 공개 작업이라 이
사이클 범위 밖"으로 유예됐다. 선행 코드 결함(`applyDelete` 대상 가드 부재 — E10·E10b)은
그 사이 Task 1 이 닫았고, 이 왕복은 그 가드 위에서 돌았다 — `--pick-delete` 가 고른 대상은
가드 3종을 통과한 결정적 첫 후보였다.

## 3. OQ3 — baseline dispatch · **충족**

- run: [`34195014409`](https://github.com/idenn207/mccp/actions/runs/34195014409) ·
  `workflow_dispatch` · ref `main` · 4 leg 전부 `success`
- 축약 증거: [`baseline-34195014409-summary.json`](baseline-34195014409-summary.json) —
  leg 별 `{platform, ok, attribution, wall_clock_ms, files_total, per_file_len,
  redaction_*, red_files, failing_count}`. **원본 `measurement.json` 은 커밋하지 않는다**:
  `failing[].error` 가 credential fixture 를 싣는 유일한 경로이고(E18), `redact.js` 의
  `RESIDUAL_PATTERNS` 는 경로 4종뿐이라 credential 커버리지가 0이다. 오늘 내용이 무해한 것은
  그 fixture 가 green 이었기 때문이고 **재생성 시 보장되지 않는다.**

### DD8 판정 — 문서가 아니라 artifact 에서 재도출한다

| 입력 | 값 |
|---|---|
| Windows 전용 red | **2건** — `plugins/mccp/scripts/lib/closure/tests/report.test.js` · `plugins/mccp/scripts/lib/tests/plan-review-write-invariants.test.js` |
| 벽시계 linux (최대) | 133,302 ms |
| 벽시계 windows (최대) | 536,483 ms |
| ratio | **4.02** (10배 미만) |
| **DD8 행** | **`matrix`** |

규칙의 중첩 구조를 그대로 적용했다 — "Windows 전용 red 0건 → Linux 단독, 1건 이상 → matrix 에
넣되 벽시계가 10배를 넘으면 별도 트리거". **규칙을 측정 후에 바꾸지 않았다.**

### 종결 여부 — **결정됨 · 시행 미완**

`matrix` 는 `[x]` 로 닫지 **않는다**. 강제 workflow 는 ubuntu 단독이고
(`.github/workflows/test-suite.yml:76`), matrix leg 을 required status check 로 올리려면
action pin 패리티가 선행이다(baseline `@v4` tag-pin 대 강제 SHA-pin). 그 선행조건은
**backlog `ci-full-suite:H5`** 이고, H5 의 발현 조건("OQ3 이 matrix 를 고르면")이 이 측정으로
**참이 됐다**.

**시행 소유자: ci-full-suite 후속 사이클.** M4 는 결정만 기록하고 시행하지 않는다 —
결정을 기록한 것으로 시행을 대신하지 않는다.

### `redaction_ok` 를 수용 조건에서 뺀 근거

네 leg 전부 `false` 다. 원인은 둘이고 **둘 다 합성 fixture** 다 — ubuntu ×2 는 격리된
`leadtime.test.js` 의 드라이브 문자 fixture(`win-drive-abs`, len 3), windows ×2 는
`lib/closure/tests/report.test.js` 의 `posix-home` fixture(len 48). 실제 runner 경로
(`/home/runner` · `C:\Users` · `runneradmin`)는 **0건**이다. 그래서 수용 조건은
`ok` ∧ `per_file.length == files_total` 둘만 강제하고, 게시 안전성은 조건이 아니라
**커밋 대상 축소**(원본 대신 축약본)로 담보한다. 이 구조적 충족 불가 자체는
backlog `ci-full-suite:H9` 다.

## 4. 격리 재판정 · **충족**

baseline 은 `--exclude-from` 을 넘기지 않으므로(`.github/workflows/test-suite-baseline.yml`)
격리 6건을 포함한 tracked 전량을 돈다 — Task 0 이 요구한 Linux 재측정의 producer 가 이미
존재했고 아무도 누르지 않았을 뿐이다.

| 집합 | 값 | 처분 |
|---|---|---|
| `Q \ L` (green 복귀) | **0건** | 해제 없음 |
| `Q ∩ L` (잔존) | **6건** — 격리 목록 전건 | 수리하지 않고 `reason` 을 재측정 근거로 갱신 |
| `L \ Q` (신규 red) | **0건** | 차단 사유 없음 |

`L` 은 `.github/test-suite-exclusions.json` 이 아니라 **baseline artifact 의 linux leg 두 개**
에서 재계산했고, `Q` 는 편집 후 파일이 아니라 `git show origin/main:` 에서 읽었다 — 편집 후
파일에서 읽으면 해제한 항목이 `Q` 에서 사라져 `Q\L` 이 항상 비고 **자기 편집을 자기가
정당화한다**.

해제가 0건이므로 `.github/test-suite-floor.json` 의 `max_excluded_files` 와
`scripts/test-suite/exclusions.js` 의 `MAX_EXCLUSION_ENTRIES` 는 **둘 다 무편집**이다(6 유지).
`tracked_basis` 도 손대지 않았다 — 그 파일 자신의 DD9 규칙이 재기준을 `allow_deletions` 정리와
같은 diff 로 한정하고 현재 `allow_deletions` 는 `[]` 다. E14 의 drift 는 backlog
`ci-full-suite:H6` 로 남는다.

**수리하지 않는 이유**: 6 파일 중 `scripts/test-suite/` 소유는 0건이다(경로는 `derive/` ·
`lib/` · `receipt/`). 재현이 성립한 수리는 소유 축의 별도 PR 이다.

## 5·6. 축 C — 설정과 차단력 · **미충족**

- `- axis-c: unmet` (위 필드)
- 사유: 인증 계정 `madsci207` 이 `idenn207/mccp` 에 `permissions.admin=false` 다.
  branch protection PUT 은 admin **역할**을 요구하며 토큰 scope 로 대체되지 않는다.
  수행 주체는 `idenn207` 이다.
- 실측(2026-09-08): `main` 은 `protected:false` · `protection.enabled:false` ·
  `required_status_checks.contexts:[]`.
- `enforce-admins` 는 **기록하지 않는다** — 그 필드는 admin 전용 `/protection` 응답에만 있고
  world-readable `branches/main` 에는 없다. 축 C 가 수행될 때 설정 수행자가
  `- enforce-admins: <true|false>` 를 이 문서에 적는 것이 그 Task 의 일부다.
  값 없이 축 C 를 met 으로 봉인하는 경로는 없다.

**그러나 축 C-1 의 도달 불가는 해소됐다.** Task 2 이전에는 `readRequiredChecks` 가 admin 전용
엔드포인트를 불러 non-admin 에게 항상 404 → `protection_absent` 였고, runbook 이 exit 0 을
"설정 완료의 증거" 로 삼으므로 **이 계정으로는 exit 0 이 원리상 불가능**했다. 이제 world-readable
채널을 읽으므로 보호가 켜지는 순간 이 계정도 실제 상태를 본다:

```
$ node scripts/ci-required-checks.js
declared: full test suite gate
protected: false
required: (branch is not protected)
DRIFT: protection_absent
exit=1
```

`exit 1` 이 옳은 값이다 — `main` 이 실제로 보호되지 않았다. 이전 채널에서는 **보호가 켜져
있어도** 같은 값이 나왔다는 것이 차이다.

## 6. 로컬 산출물 (수행됨)

| 항목 | 결과 |
|---|---|
| 절단 B 대상 가드 | 5 사유 코드 전부 발화 — `selftest_target` · `quarantined_target` · `not_tracked_test` · `selftest_list_unreadable` · `quarantine_list_unreadable`. 거부는 mutating call **앞에서** throw 하고, test 가 거부 경로별로 "비영점 ∧ 대상 여전히 tracked" 를 독립 단언한다 |
| `ci-required-checks.js` | 판독 채널 world-readable 교체 + `{protected, contexts}` 반환 + 4-way 판별자 + 포함 검사(`unrelated` 는 `ok` 를 안 떨어뜨린다) + 빈 `declared` fail-closed(`declared_unresolved`) + `gh` 스텁 spawn seam 단언 |
| 로컬 게이트 | `gate.js` **exit 0** — `blocked:false` · coverage 98.4655% (385/391) · `unexplained:[]` · `redaction_ok:true` |
| test | `wiring-cut` 32 · `ci-required-checks` 14 · 4파일 합산 **109 pass / 0 fail** |

### 게이트가 이 사이클 안에서 한 번 발화했다

격리 `reason` 문자열을 재측정 근거로 갈아쓰면서 `leadtime` 항목에 드라이브 문자 형태의
리터럴을 적었더니, `redact.js` 의 `win-drive-abs` 잔여 규칙이 그것을 잡아 **green 스위트가
stage 3 `redaction` 으로 차단**됐다(`at: $.exclusions[3].reason`). 격리 사유는 measurement JSON 에
그대로 실리므로 스캔 대상이라는 것을 그 발화가 가르쳤다. 문구를 고쳐 `redaction_ok:true` 로
복귀했다. **이것은 결함이 아니라 게이트가 의도대로 동작한 사례**이고, 기록을 남기는 것이
M3 §7a 가 정한 관례다.

## 7. `## Validation` 이력 — 2026-09-08 의 두 정지점은 둘 다 해소됐다

2026-09-08 실행에서 블록은 두 지점에서 멈췄다 — **A**(PRD milestone status `in-progress`)와
**B**(`axis-d-a-run` 필드 부재). 둘 다 이 문서에 정직하게 기록됐고, 2026-09-11 축 D 완주로
해소 조건이 생겼다:

- **정지점 B 해소** — 축 D 를 실제로 수행했다(위 §1·2). run 필드가 실측값으로 존재한다.
- **정지점 A 해소** — 축 D 충족 후 남는 미충족은 축 C 하나뿐이고, 축 C 는 plan Acceptance 7
  이 **명시 미충족 + 사유 기록을 정규 종착으로 규정**하는 경로다(판정자의 축 C 분기도
  `protected=false` 관측 시 `unmet` 기록을 요구할 뿐이다). 따라서 status 를 `complete` 로
  올리는 것은 반올림이 아니라 plan 이 설계한 종착역이다.

최종 실행 결과는 `## Validation` 블록 자체가 판정한다(`VALIDATION REACHED END`).
