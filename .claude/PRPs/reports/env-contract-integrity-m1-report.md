# Implementation Report: 환경변수 계약 무결성 M1 — 계약 대조 + 설정 진단

**Plan**: `.claude/plans/env-contract-integrity-m1.plan.md`
**Source PRD**: `.claude/prds/env-contract-integrity.prd.md` (M1 / 6)
**Version**: `1.30.0 → 1.30.1` (patch — §3.7, PRD의 6개 milestone 중 하나)
**Branch**: `env-contract-integrity`

## Summary

lint L1~L9는 전부 green이면서 «문서가 가르치는 값이 코드에 없는» 어긋남을 하나도 보지
못했다. 아홉 검사가 계약 **내부**(레지스트리 ↔ 색인 ↔ 상세)의 정합만 보고, 레지스트리의
`values`가 코드의 수용 집합과 결속돼 있지 않았기 때문이다.

M1은 두 축을 놓았다. **L10**이 `values`를 코드 어휘 상수와 집합 비교해 그 결속을 만들고,
**`env-contract` CLI의 `doctor`**가 3계층 settings의 선언값과 프로세스 실측값을 나란히
놓는다. 켠 첫 실행에서 **8건이 실제로 붉어졌다**. `lint.js`는 그전까지 호출처가 0건이었으므로
CI 착지 게이트 1개를 함께 놓았다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium | Medium — 계획대로 |
| Files Changed | 19 | 19 (정확히 일치, `plan-conflict-detector` conflict=0) |
| 어휘 결속 대상 | 36 (enum 27 + list 9) | 36 |
| 정적 추출 실패 수 (Risk 완화가 요구한 실측) | 미상 — "실측해 보고" | **13** (ref 22 · derive 1 · gap 13) |
| L10 최초 red 건수 | "기존 9건" | **8** — 1건은 어긋남이 아니었다 (아래 D6) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | `vocabulary.js` — 추출기 · 파생자 · 격리표 | 완료 | 동반 test 18건 포함 (Task 1이 함께 만든다는 계획 지시대로) |
| 2 | registry `vocabulary` 열 + 36개 채움 | 완료 | 가산적 — 기존 9열 무변경, 다른 kind는 `null` |
| 3 | L10 — `values` ↔ 코드 어휘 집합 대조 | 완료 | 격리 **양방향**(미격리 불일치 + stale 격리 + 형태 불일치) |
| 4 | `settings-layers.js` — 선언 유효값 도출 | 완료 | local > project > user, 가려진 값 보존, 계층 격리 |
| 5 | `doctor.js` — 순수 판정 오라클 | 완료 | 8종 finding, env·fs 미접촉 |
| 6 | `cli.js` — `list` · `explain` · `doctor` | 완료 | 필터 화이트리스트 검증 + exit 0/1/2 |
| 7 | 회귀 test — 나머지 3파일 | 완료 | 신규 46건, 기존 단언 삭제 0건 |
| 8 | 문서 · 버전 · PRD | 완료 | §3.7 4면 동기 + PRD Open Question 2건 종결 |
| 9 | CI 착지 게이트 | 완료 | `env-contract-drift.yml` — `gitignore-drift.yml` mirror |

## Validation Results

| # | Check | Status | Notes |
|---|---|---|---|
| 1 | lint L1~L10 | Pass | exit 0 |
| 2 | env-contract 단위 test | Pass | **94/94** |
| 3 | CLI 실완주 | Pass | `list` 0 · `explain` 1(격리 검출, 의도) · `doctor` 0 |
| 4 | 실사용 2건 fixture 재현 | Pass | `doctor.test.js` — `not-received`(3번 사례) · `list-member-unknown`(1번 사례) |
| 5 | §3.7 4면 동기 | Pass | `i18n-surface.test.js` 10/10 |
| 6 | 회귀 — 기존 표면 무손상 | Pass | lib 2398 중 0 fail · receipt 657 중 0 fail (D5 참조) |
| 7 | CI 명령 로컬 완주 | Pass | 워크플로가 실행할 두 명령 그대로 |

### Design Grounding

**N/A (no design trigger)** — `impeccable-detect --mode implement`가 `design_signal=false` ·
`silent_skip=true` · reason `no-signal`. 게이트 진입 시점의 diff가 비어 있어 whitelist hit이
0이었고, 이 마일스톤이 실제로 건드리는 렌더 표면은 §3.7 version 리터럴 2건뿐이며 그 변경은
EXECUTE 이후에 생긴다. Phase 2.5.5c capture 미발생 → Phase 3.6 · 3.7 완전 no-op.
receipt에 `impeccable_silent_skip=true` + reason이 봉인됐다.

## Files Changed

| File | Action | 비고 |
|---|---|---|
| `plugins/mccp/scripts/lib/env-contract/vocabulary.js` | CREATED | 추출기 + `hook-ids` 파생자 + 격리표 8건 |
| `plugins/mccp/scripts/lib/env-contract/settings-layers.js` | CREATED | 3계층 read-only |
| `plugins/mccp/scripts/lib/env-contract/doctor.js` | CREATED | 순수 오라클 |
| `plugins/mccp/scripts/lib/env-contract/cli.js` | CREATED | 3 서브커맨드 |
| `plugins/mccp/scripts/lib/env-contract/tests/vocabulary.test.js` | CREATED | 18 |
| `plugins/mccp/scripts/lib/env-contract/tests/doctor.test.js` | CREATED | 14 |
| `plugins/mccp/scripts/lib/env-contract/tests/cli.test.js` | CREATED | 14 (실제 spawn) |
| `.github/workflows/env-contract-drift.yml` | CREATED | PR 착지 게이트 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATED | `vocabulary`/`vocabularyGap` 열 + 36행 + `build()` 검증 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | UPDATED | L10 |
| `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js` | UPDATED | L10 fixture 5 + 어휘 합성 |
| `plugins/mccp/scripts/lib/env-contract/tests/registry.test.js` | UPDATED | 형태 분포 단언 2 |
| `docs/ENVIRONMENT.md` | UPDATED | §5 CLI 레시피 + "게이트가 아니다" |
| `CLAUDE.md` | UPDATED | §4 cheat sheet |
| `CHANGELOG.md` | UPDATED | `[1.30.1]` |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.30.1 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | page-foot |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | derived 줄 |
| `.claude/prds/env-contract-integrity.prd.md` | UPDATED | M1 complete + Open Question 갱신 |

부수 변경: `.claude/plans/codex-findings-backlog.md`(게이트 이연 + 실측 3행).

## Measurements

### 어휘 형태 분포 — 36 대상

| 형태 | 수 | 의미 |
|---|---|---|
| `'path#CONST'` 정적 추출 | 22 | 코드가 명명 상수로 어휘를 갖는다 |
| `{ derive: 'hook-ids' }` | 1 | 두 이질 소스의 합집합(dispatcher 8 + `hooks.json` 18 = 26 id) |
| `null` + `vocabularyGap` | 13 | **읽을 수 없음의 명시 열거** — 조용한 통과가 아니다 |

gap 13건의 대부분은 «수용 어휘가 명명 상수 없이 인라인 비교로만 존재»다. 그것을 상수로
승격해 검사 표면을 넓히는 것은 M2 문서화 축이다.

### L10 최초 실행 — 격리된 8건

| 토글 | 문서 | 코드 |
|---|---|---|
| `MCCP_PLAN_REVIEW` | `off`/multi-agent/codex/hybrid | multi-agent/codex/hybrid |
| `MCCP_SANTA_SEVERITY_GATE` | off/high/critical | enforce/off |
| `MCCP_SANTA_TERMINATOR` | off/`on` | enforce/off |
| `MCCP_SANTA_ADJUDICATION_GATE` | off/`warn`/enforce | enforce/off |
| `MCCP_SANTA_LEDGER_SUPPRESSION` | off/`on` | enforce/off |
| `MCCP_HOOK_PROFILE` | full/lean/minimal | minimal/standard/strict |
| `MCCP_STATE_JOURNAL` | off/`on` | enforce/shadow/off |
| `MCCP_SESSION_LEDGER_SCOPE` | repo/`host`/global | global/repo/`hybrid` |

가장 무거운 것은 **이 저장소 자신의 설정이 무효값을 쓴다**는 것이다 —
`.claude/settings.json`의 `MCCP_SANTA_SEVERITY_GATE=high`는 `santa/gate.js:148`이 거부하는
값이고, `doctor`가 이를 `contract-drift`로 표면화한다.

### `doctor` 실측 (이 저장소)

`user 12 key · project 23 key · local absent` → **error 0 · warning 2 · info 0**.
`not-received`가 0이라는 것이 곧 G1의 반증이다 — 선언한 값이 **실제로 도달했다**.

## Deviations from Plan

| # | What | Why |
|---|---|---|
| D1 | Validation 2의 명령 형태를 `node --test <dir>/`에서 인용된 glob으로 바꿨다 | Node 24가 디렉토리 인자를 **모듈 경로**로 해석해 `Cannot find module`으로 죽는다. CI 워크플로도 glob을 쓰고 주석에 이유를 남겼다 |
| D2 | Risk 완화가 요구한 «실측 개수를 Acceptance에 적는다»를 plan 본문이 아니라 이 리포트에 적었다 | 2.5.6이 implement receipt에 plan hash를 봉인한 뒤라 본문을 고치면 그 receipt가 즉시 stale이 된다(§3.11 guard 2가 다음 `/mccp:pr`을 막는다). 계획의 지시와 게이트의 봉인이 충돌하는 지점이며, 실측값(13/36)은 위 Measurements에 있다 |
| D3 | `refLexicalProblem`의 UNC 분기가 «POSIX root»로 보고된다 | mirror(`evidenceLexicalProblem`)와 **같은 순서**다. 거부된다는 사실이 요구이고 문구는 아니므로, 다른 순서를 요구하면 두 스크린이 갈라진다. test 기대값을 실제 동작에 맞췄다 |
| D4 | security-reviewer HIGH F2를 **절반 기각**했다 | 처방 (a) "repo 컨텍스트에서 `~/.claude/settings.json`을 읽지 마라"는 UI2/UI3을 무력화한다 — `doctor`의 존재 이유가 «사용자 계층 선언이 도달했는가»다. 채택: 레지스트리 밖 이름은 값 미출력 + 읽기 전용 경계 주석. 미채택: symlink realpath(같은 권한의 공격자는 파일을 직접 쓸 수 있어 방어가 얻는 것이 없다). 근거를 backlog에 등재 |
| D5 | V6 회귀는 `MCCP_REVIEW_SINGLE_PASS`를 중화하고 측정했다 | 아래 Issues 참조 — 선재 결함이며 M1과 무관 |
| D6 | 계획이 예상한 "기존 9건"이 실제로는 **8건** | `MCCP_GATEGUARD`는 어긋남이 아니라 **어휘 부재**였다. 코드가 canonical enum이 아니라 disable 별칭 집합으로 판정하므로 `values`와 비교할 대상 자체가 없다 → 격리가 아니라 `vocabularyGap` |

## Issues Encountered

### 저장소 자신의 토글이 회귀 스위트를 붉게 만든다 (선재, M1 무관)

`.claude/settings.json`의 `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`가 test 프로세스에
상속되고, santa test가 spawn하는 CLI의 `begin-round`가 §3.15대로 `exit 2`
(`SANTA_SINGLE_PASS_ACTIVE`)로 라운드를 열지 않아 단언이 깨진다.

| 조건 | `lib/tests` | `receipt/tests` |
|---|---|---|
| 토글 설정(저장소 기본) | 2398 중 **51 fail** | 657 중 **2 fail** |
| `env -u MCCP_REVIEW_SINGLE_PASS` | 2398 중 **0 fail** | 657 중 **0 fail** |

M1 무관의 근거 셋: santa 코드는 `env-contract`를 한 줄도 참조하지 않고, Acceptance 실측으로
잠시 건드린 `santa/terminator.js`는 `git status`상 clean(복원 정확, `.bak` 잔여 0)이며,
토글만 끄면 초록이다.

**이것은 이 PRD가 다루는 부류 그 자체다** — 운영자의 정당한 설정이 도달하면 안 되는 프로세스
경계를 넘어 동작을 조용히 바꾸고, 그 사실이 어디에도 표면화되지 않는다. 정직하게 적자면
**`doctor`는 이 건을 잡지 못한다**(값이 유효하고 선언도 정상이라 진단 대상이 아니다). PRD의
«프로세스 경계 env 전달» Open Question에 실증 사례로 붙였고 backlog에 처방 후보와 함께
등재했다.

### 라운드 캡이 기계 강제가 아니다 (사용자 제보 실측, M1 무관)

`resolution.rounds: 1` + `review_single_pass_reason: "deadline_pressure"`로 봉인된
receipt의 plan 본문이 R13 종료를 기록했다. §3.15가 "주장하지 않는 것"에 적어 둔 천장(라운드
루프는 명령 본문의 산문)이 실측으로 확인된 것이며 **M3의 직접 근거**다. PRD 신규 Open
Question + backlog에 후보 축 3개와 함께 등재했다.

### 상류 게이트가 stale인 상태로 진행했다 (감사 기록)

`mccp-plan-codex/env-contract-integrity-m1`은 이 실행 시점에 stale이었다
(`sha256:1e4806b9…` vs `sha256:dbe8e7c1…`). 사유: plan 본문이 그 게이트 자신의 L2 패널
지적을 흡수하며 바뀌었고(Task 9 CI 게이트 신설 · `Patterns to Mirror` 인용 정정 2건 ·
Task 1의 test 동반 생성 명시) 진행 중인 리뷰가 없었다. §3.16의 문서화된 감사 우회를 사유와
함께 적용했으며, 사용자가 명시적으로 이 경로를 선택했다.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/vocabulary.test.js` | 18 | 추출기 3형태 · 실패의 명시성(빈 배열·표현식·중복 선언·크기 상한) · ref 어휘 스크린 · 파생자 양쪽 소스 · 격리 형태 |
| `tests/doctor.test.js` | 14 | 8종 finding · 계층 우선순위 · 계층 격리 · foreign-name 무언/값 미표시 · 실사용 2건 재현 |
| `tests/cli.test.js` | 14 | **실제 spawn** — 오용 exit 2 · 필터 화이트리스트 · 격리 exit 1 · `doctor` 종료코드 전파 · `--all` 값 미표시 |
| `tests/lint.test.js` (확장) | +5 | L10 미격리 불일치 · **격리 배수(DD3-ii)** · 형태 불일치 · 해석 불가 fail-closed · gap 기록 |
| `tests/registry.test.js` (확장) | +2 | 36개 형태 분포 · 다른 kind 무영향 |

**자동 회귀가 수동 1회 확인을 대체한다.** L2 test 리뷰어가 CRITICAL로 지목한 것이 정확히
이 축이었다 — Acceptance의 «격리에서 빼고 red 확인»과 «격리 배수 실증»은 수동 one-shot이라
다음 변경에서 깨져도 알 길이 없었다. 두 명제 모두 fixture로 고정했고
(`negative-fixtures=10` → L1~L10 각각 1개), **실측 1회도 함께 수행**했다:
`MCCP_PLAN_REVIEW`를 격리에서 빼자 L10 FAIL → 복원 후 exit 0 ·
`terminator.js` 어휘를 레지스트리와 일치시키자(=M2 수리 흉내)
`quarantined but the mismatch is gone`으로 red → 복원 후 exit 0.

## 주장하지 않는 것

- **`doctor`는 게이트가 아니다** — hook 등록 0건, receipt 0건, 어떤 게이트도 이 종료코드를
  읽지 않는다(DD6·UI13).
- **CI 워크플로가 보장하는 것은 «lint가 돌고 drift에서 붉어진다»까지다.** 그 red가 머지를
  막는 것은 branch protection이며 저장소 파일로 표현할 수 없다.
- **`doctor`의 주장 범위는 자기 프로세스가 받은 env다.** dispatch worker · detached runner ·
  Workflow agent · test harness가 받는 env는 인증하지 않는다 — 위 Issues의 첫 항목이 바로 그
  경계 밖의 사례다.
- **G1은 1회 관측이다** (Windows · 사용자+프로젝트 2계층 · `settings.local.json` 부재).
  `doctor`의 *탐지*는 이 답에 의존하지 않도록 설계했다(DD7).
- 어긋난 값 자체의 수리는 M2, 라운드 캡의 기계 강제는 M3다.

## Next Steps

- [ ] `/mccp:prp-commit`
- [ ] `/mccp:pr` — **진입 직전 §3.7 version 재계산**(두 번째 시점). 상류 plan-codex가 stale
      이므로 guard 2에 걸린다면 위 감사 기록을 사유로 우회하거나 `/mccp:plan` 재발급
- [ ] M2에서 격리표 8건 배수 — 비우지 않으면 L10이 «격리를 지우라»로 붉어진다
