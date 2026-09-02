# Plan: 환경변수 계약 무결성 — M1 계약 대조 + 설정 진단

**Source PRD**: .claude/prds/env-contract-integrity.prd.md
**Selected Milestone**: M1 — 계약 대조 + 설정 진단
**Complexity**: Medium

## Summary

lint L1~L9는 전부 green이면서 "문서가 가르치는 값이 코드에 없는 토글 9건"을 하나도 보지 못한다. 아홉 검사가 전부 **계약 내부**(레지스트리 ↔ 색인 ↔ 상세)의 정합만 보고, 레지스트리의 `values`가 코드의 수용 집합과 결속돼 있지 않기 때문이다. 결속이 없으므로 존재하지 않는 값이 레지스트리에 들어가면 그것은 세 표면에 **일관되고 권위 있게** 복제된 뒤 green으로 보고된다.

M1은 두 축을 놓는다. **L10**은 `values`를 소비처의 어휘 상수와 집합 비교해 그 결속을 만들고(층 A), **`env-contract` CLI의 `doctor`**는 운영자의 settings 계층이 *선언한 값*과 프로세스가 *실제로 받은 값*을 나란히 놓는다(층 B·D). 어긋난 값 자체의 수리는 M2, 라운드 캡의 기계 강제는 M3이다 — M1은 **보이게 만드는 것**까지다.

검사를 켜는 순간 기존 9건이 red가 되므로, 알려진 어긋남은 **근거를 동반한 격리표**로 명시 열거하고 M2가 그것을 비운다. 격리표는 "항목이 여전히 실제로 어긋날 때만" 통과하므로(수리된 항목이 남아 있으면 L10이 red) 쌓이지 않고 배수된다.

검사가 **실제로 착지를 막으려면 누군가 그것을 돌려야 한다.** `lint.js`는 오늘 hook · CI · settings 어디에서도 호출되지 않는다(호출처 0건, 실측). L10을 추가하는 것만으로는 아무것도 차단되지 않고, 수동으로 치는 사람에게만 red가 보인다. 그래서 M1은 `gitignore-drift.yml`을 mirror한 **PR 워크플로 1개**를 함께 놓아 계약 표면이 바뀐 PR에서 lint가 반드시 돌게 한다(Task 9). 그 선례가 자기 주석에 적어 둔 경계도 그대로 승계한다 — 워크플로가 보장하는 것은 **lint가 돌고 drift에서 red가 된다**는 것까지이고, 그 red가 머지를 막는 것은 저장소 설정(branch protection)이라 저장소 파일로는 표현할 수 없다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 계약과 코드가 어긋나면 착지가 막히는 검사를 만든다 | direction |
| UI2 | 운영자가 명령 하나로 자기 설정이 선언대로 도달했는지 안다 | direction |
| UI3 | 진단은 설정 파일이 선언한 값과 프로세스가 실제로 받은 값을 나란히 놓는다 | direction |
| UI4 | 검사를 켜는 순간 대량 실패로 착지가 전면 차단되면 안 된다 | constraint |
| UI5 | 읽을 수 없는 항목은 조용한 통과가 아니라 명시 열거로 남는다 | constraint |
| UI6 | mccp가 소유하지 않는 이름을 오류로 보고하지 않는다 | constraint |
| UI7 | 온보딩 walkthrough와 에디터 스키마와 전용 열람 페이지는 이 마일스톤이 아니다 | exclusion |
| UI8 | 어긋난 값 자체의 수리는 M2가 담당한다 | exclusion |
| UI9 | 라운드 캡의 기계 강제는 M3가 담당한다 | exclusion |
| UI10 | MCCP_PLAN_REVIEW의 리뷰 없음 모드를 실제로 구현하지 않는다 | exclusion |
| UI11 | evidence 포인터 98건의 일괄 재생성은 하지 않는다 | exclusion |
| UI12 | 레지스트리 밖 토글의 은퇴 판단은 하지 않는다 | exclusion |
| UI13 | 진단을 게이트로 편입하지 않는다 | exclusion |
| UI14 | Claude Code 본체의 설정 병합 동작을 바꾸지 않는다 | exclusion |
| UI15 | 각 마일스톤이 독립적으로 사용자에게 보이는 변화를 낸다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 명시 제외표 | `plugins/mccp/scripts/state/toggle-snapshot.js:50` | `TOGGLE_EXCLUSIONS` — "제외는 정규식이 아니라 이름이고, 각 이름에는 실파일 근거가 붙는다". M1의 격리표가 이 규약을 그대로 따른다 |
| 검사 범위의 단일 소유 | `plugins/mccp/scripts/lib/env-contract/scan.js:73` | `walkSurfaces` — 세 소비처가 자체 walk를 갖지 않고 이 함수를 호출한다. drift가 "두 코드가 갈라졌다"가 아니라 "호출하지 않았다"가 되어 export 계약이 잡는다 |
| fail-closed 읽기 실패 | `plugins/mccp/scripts/lib/env-contract/lint.js:46` | `readFile`가 실패를 "통과"가 아니라 problem으로 보고한다. 읽을 수 없으면 조용히 넘어가는 것은 문서가 낡았는지 아는 유일한 장치를 끄는 일이다 |

<details>
<summary>+4 more patterns</summary>

| Category | Source | Pattern |
|---|---|---|
| CLI 서브커맨드 | `plugins/mccp/scripts/lib/meta-research.js:712` | `USAGE` 상수 + 서브커맨드 화이트리스트 + 오용 exit 2 + `--json`/사람용 이중 출력 + repoRoot는 인자가 아니라 cwd에서 도출 |
| 순수 오라클 + 얇은 I/O | `plugins/mccp/scripts/lib/plan-review/decide.js:229` | 판정 함수는 인자만 받고 env·fs를 모른다. I/O는 CLI가 소유하므로 판정 경계를 단위 test로 고정할 수 있다 |
| 어휘 밖 값의 처리 | `plugins/mccp/scripts/lib/env-contract/value.js:120` | 열거 밖 값은 레지스트리 default로 되돌리고 loud warn. 보장되는 명제는 "오늘 대비 권한을 넓히지 않는다"이지 "항상 제한적이다"가 아니다 |
| 설정 파일 read-only 접근 | `plugins/mccp/scripts/lib/settings-writer.js:21` | `readSettings({path})` — 부재는 `{}`, parse 실패는 `EBADSETTINGS` throw. doctor는 이 함수만 쓰고 쓰기 API는 부르지 않는다 |

</details>

## Grounding — 실측 (2026-08-21, 이 세션)

### G1 — PRD의 차단성 Open Question이 답해졌다: 병합은 **깊은 병합**이다

PRD는 "얕은 대체라면 프로젝트에 `env` 블록이 있는 순간 전역 `env`가 통째로 사라지며, 그것이 실사용 Codex 사례의 유력 설명"이라고 적고 **M1의 진단 설계가 이 답에 의존한다**고 표시했다. 이 세션의 프로세스에서 직접 쟀다.

| 축 | 관측 |
|---|---|
| 사용자 `~/.claude/settings.json` 전용 키 | `MCCP_CODEX_DISABLED=1` · `MCCP_STOP_LOOP_CODEX=1` · `MCCP_AUTO_HANDOFF=off` · `MCCP_CONTEXT_MONITOR_COST_WARNINGS=0` |
| 프로젝트 `.claude/settings.json` 전용 키 | `MCCP_PLAN_REVIEW=multi-agent` 외 다수 |
| 프로세스 `process.env` | **양쪽 전부 존재** (21개 `MCCP_*`) |
| 양쪽에 있는 키 (`MCCP_RECEIPT_DEBUG`) | 사용자 `1` · 프로젝트 `on` → 프로세스 `on` |

즉 병합은 키 단위 합집합이고 충돌 시 프로젝트가 이긴다. **얕은 대체 가설은 반증됐다.** 따라서 실사용 3번째 사례(`MCCP_CODEX_DISABLED=1`이 도달하지 않았다)의 "유력 설명"은 틀렸다 — 이 세션에서 그 값은 프로세스에 **도달해 있다**. 근인은 다른 곳이며, 그것을 지목할 장치가 없다는 사실이 곧 `doctor`의 존재 이유다.

측정 범위를 정직하게: 1회 관측이고, Windows · 이 worktree · 사용자+프로젝트 2계층(`settings.local.json` 부재) 조건이다. `doctor`의 **탐지**는 이 답에 의존하지 않도록 설계한다(DD7) — 병합 규칙이 바뀌면 `doctor`가 내놓는 *설명*이 낡을 뿐 *탐지*는 그대로다.

### G2 — 어휘는 대부분 모듈 상수이고, 정적 추출이 가능하다

- `plugins/mccp/scripts/lib/plan-review/decide.js:50` — `MODES`는 `['codex', 'multi-agent', 'hybrid']`. 레지스트리는 `['off','multi-agent','codex','hybrid']`. **`off`가 코드에 없다** — D1이 L10에 그대로 걸린다.
- `plugins/mccp/scripts/lib/review-single-pass.js:24` — `REASONS`가 같은 형태. 레지스트리와 일치.
- 대상 규모: enum 27 + list 9 = **36개**. 전체 161개 중 `values`가 의미를 갖는 것은 이 36개뿐이다(bool/bypass-flag는 어휘가 `value.js` 소유이고 L2와 registry test가 이미 고정, int/string은 `values`가 null).

### G3 — `MCCP_DISABLED_HOOKS`의 어휘는 두 이질적 소스에서 나온다

`plugins/mccp/scripts/lib/hook-flags.js:23` `getDisabledHookIds`는 **검증 없이 토큰을 수용**한다(실사용 1번 사례의 기계적 원인). 그 어휘는 단일 상수가 아니다.

- `plugins/mccp/scripts/hooks/bash-hook-dispatcher.js` — `id:` 리터럴 8개
- `plugins/mccp/hooks/hooks.json` — `run-with-flags.js <id> …` argv 18개

따라서 `vocabulary` 필드는 `path#CONST` 한 형태로는 부족하다. **명명된 파생자(deriver)** 형태가 필요하고, M1에서 파생자는 정확히 이 하나다(DD2).

### G4 — 현재 baseline

`node plugins/mccp/scripts/lib/env-contract/lint.js` → L1~L9 전부 ok, exit 0. RAW 행은 위치 기반(`row[0]`~`row[8]`)이고 `registry.test.js`에 닫힌 필드 집합 단언이 없으므로 `vocabulary` 열 추가는 **가산적으로 안전**하다.

## Design Decisions

- **DD1 — 어휘는 소스 텍스트에서 읽고 `require`하지 않는다.** 소비처 모듈 다수가 load 시점에 env를 포획하고 stderr에 warn을 쓰며 일부는 fs를 만진다. 감사 대상을 부팅하는 lint는 자기가 감사하는 상태를 바꾼다. 정적 추출은 표현식으로 만든 집합을 못 읽지만, 그 한계는 DD2가 **열거**로 흡수한다.
- **DD2 — `vocabulary`는 3형태다.** (a) `'path/to/file.js#CONST'` — 배열 리터럴 정적 추출. (b) `{ derive: '<name>' }` — 명명된 파생자. M1에는 `hook-ids` 하나뿐이고 새 파생자를 늘리려면 "왜 상수로 승격할 수 없는가"를 논증해야 한다. (c) `null` + `vocabularyGap: '<이유>'` — 읽을 수 없음을 **명시 열거**. 세 형태 중 어느 것도 "조용한 통과"가 아니다(UI5).
- **DD3 — 알려진 어긋남은 격리표이고, 격리표는 배수된다.** L10은 (i) 격리되지 않은 불일치가 있으면 실패하고, **(ii) 격리 항목이 더 이상 불일치하지 않아도 실패한다**. 후자가 없으면 격리표는 영구 면죄부가 되어 M2가 수리해도 아무도 지우지 않는다. 각 항목은 `TOGGLE_EXCLUSIONS` 규약대로 이름 + 실파일 근거 + 담당 마일스톤을 갖는다.
- **DD4 — `doctor`는 격리를 상속하되 조용히 상속하지 않는다.** 메타 조사 V3가 경고한 대로 `MCCP_PLAN_REVIEW=off`는 오늘의 `values`에 있으므로 순진한 `doctor`는 "정상"을 보고한다 — 실제로는 정반대 모드가 켜진 상태로. 그래서 `doctor`는 같은 격리표를 읽고, 격리된 토글의 값에는 절대 `ok`를 주지 않고 `contract-drift`를 표면화한다. 두 축이 서로를 보강하는 지점이다.
- **DD5 — 등급은 4종이고 소유하지 않는 이름에는 등급이 없다.** 미등재 `MCCP_*`는 error(레지스트리 누락) · 등록됐으나 어휘 밖 값은 warning · 선언값과 프로세스값의 불일치는 error(층 D) · 그 외 이름은 무언(기본 미표시, `--all`에서 informational). 소유하지 않는 이름에 오류를 내는 검사기는 즉시 무시당한다(UI6).
- **DD6 — `doctor`는 게이트가 아니다.** hook 등록 0건, receipt 0건, 어떤 게이트도 이 exit code를 읽지 않는다(UI13). 종료코드(0/1/2)는 사람과 스크립트를 위한 것이지 자동 차단을 위한 것이 아니다.
- **DD7 — 탐지는 병합 규칙에 의존하지 않는다.** `doctor`는 "선언된 유효값"(계층 우선순위 적용)과 "프로세스 실측값"을 **비교**할 뿐, 왜 어긋났는지를 병합 모델로 단정하지 않는다. G1의 관측은 *설명 문구*에만 쓰이고 그 문구는 측정 근거 표시를 달고 나간다. Claude Code가 병합을 바꿔도 탐지는 유효하다(UI14).
- **DD8 — 미상 멤버의 처리 방향은 통일하지 않는다.** PRD Open Question이고 파서마다 다르다(`parseTierOverride`는 토큰 하나로 override 전체 무효화, `getDisabledHookIds`는 조용히 수용). M1은 그것을 **바꾸지 않고 보고한다** — `doctor`가 각 list 토글에 어느 처리가 적용되는지 한 줄로 알려 주므로, 운영자는 결과를 알고 값을 고른다.
- **DD9 — `values`의 의미론은 kind마다 다르고 L10은 그 차이를 보존한다.** enum은 `values`와 코드 어휘가 **집합 동일**해야 한다. list는 `values`가 오늘 전부 null이므로 L10이 요구하는 것은 "`vocabulary`가 지정됐는가"이고, 멤버 어휘를 `values`에 채우는 것은 M2의 문서화 축이다. 여기서 동일성을 요구하면 M1이 M2의 작업을 강제로 끌어온다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/env-contract/vocabulary.js` | CREATE | 어휘의 정적 추출, 파생자 표, 격리표. L10과 doctor의 단일 소유자 |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | RAW에 `vocabulary` 열 추가 + 36개 enum/list 항목 채움 + 헤더 필드 계약 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | UPDATE | L10 신설 — `values`와 코드 어휘의 집합 비교, 격리 양방향 검사 |
| `plugins/mccp/scripts/lib/env-contract/settings-layers.js` | CREATE | 3계층 settings의 `env` 블록을 read-only로 읽어 선언 유효값과 출처 계층을 도출 |
| `plugins/mccp/scripts/lib/env-contract/doctor.js` | CREATE | 순수 판정 오라클 — (계층 선언, 프로세스 env, 레지스트리, 격리) → findings |
| `plugins/mccp/scripts/lib/env-contract/cli.js` | CREATE | `list` · `explain` · `doctor` 서브커맨드. 레지스트리의 CLI 투영 |
| `plugins/mccp/scripts/lib/env-contract/tests/vocabulary.test.js` | CREATE | 추출기 3형태, 파생자, 격리 배수 규칙 회귀 |
| `plugins/mccp/scripts/lib/env-contract/tests/doctor.test.js` | CREATE | 8종 finding, 실사용 2건 재현, 소유하지 않는 이름 무언 |
| `plugins/mccp/scripts/lib/env-contract/tests/cli.test.js` | CREATE | CLI를 실제 spawn — 배선 누락과 종료코드 회귀 |
| `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js` | UPDATE | L10 통과·실패·격리 stale 케이스 |
| `plugins/mccp/scripts/lib/env-contract/tests/registry.test.js` | UPDATE | 36개 enum/list가 전부 3형태 중 하나를 갖는다는 단언 |
| `docs/ENVIRONMENT.md` | UPDATE | §5 빠른 레시피에 CLI 3종 + "doctor는 게이트가 아니다" 명시 |
| `CLAUDE.md` | UPDATE | §4 cheat sheet에 `env-contract` CLI 등재 |
| `CHANGELOG.md` | UPDATE | 새 버전 항목 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 — 단일 milestone이므로 patch) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `.github/workflows/env-contract-drift.yml` | CREATE | 계약 표면이 바뀐 PR에서 L10 lint가 반드시 돌게 하는 착지 게이트. `gitignore-drift.yml` mirror |
| `.claude/prds/env-contract-integrity.prd.md` | UPDATE | M1 행 in-progress + Plan 경로, G1이 답한 Open Question 갱신 |

## Tasks

### Task 1: `vocabulary.js` — 추출기 · 파생자 · 격리표

- **Action**: 세 표면을 export한다.
  - `extractConstant(repoRoot, ref)` — `'path#CONST'`를 받아 소스 텍스트에서 `Object.freeze([...])` / `[...]` / `new Set([...])`의 **문자열 리터럴만** 뽑는다. 배열 리터럴 한 겹만 본다. 못 읽으면 `{ ok:false, reason }`을 돌려주고 **절대 빈 배열을 성공으로 돌려주지 않는다** — 빈 집합은 "모든 값이 불일치"를 뜻해 조용한 red를 만든다.
  - `DERIVERS` — 명명된 파생자 표. M1에는 `hook-ids` 하나. `bash-hook-dispatcher.js`의 `id:` 리터럴과 `hooks.json`의 `run-with-flags.js <id>` argv를 합집합하고, 둘 중 하나라도 읽히지 않으면 `{ok:false}`.
  - `QUARANTINE` — `{ name, expected, actual, reason, owner }` 배열. `owner`는 담당 마일스톤 문자열.
  - 이 task가 `tests/vocabulary.test.js`를 **함께 만든다**(§3.4 "새 스크립트는 test 동반"). Task 7로 미루면 아래 Validate가 아직 존재하지 않는 파일을 가리켜 반드시 실패한다.
- **Mirror**: `state/toggle-snapshot.js:50` `TOGGLE_EXCLUSIONS`(이름 + 실파일 근거) · `env-contract/scan.js:73`(범위의 단일 소유)
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/vocabulary.test.js`

### Task 2: registry `vocabulary` 열 + 36개 채움

- **Action**: `build()`에 `vocabulary`와 `vocabularyGap`을 추가한다(가산적, 기존 9열 무변경). 36개 enum/list 항목에 DD2의 3형태 중 하나를 채운다. `null`을 남기려면 `vocabularyGap` 사유가 **필수**이고, 사유 없는 `null`은 `build()`가 throw한다 — 조용한 미지정 경로를 코드 수준에서 닫는다.
- **Mirror**: `registry.js:266` `build()`의 "이름 형태 위반은 throw" 규약
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/registry.test.js`

### Task 3: L10 — `values`와 코드 어휘의 대조

- **Action**: `lint.js`의 `run()`에 L10을 추가한다. enum 항목마다 어휘를 해석해 `values`와 **집합 비교**하고, 불일치는 (a) 격리표에 있으면 통과 + 정보 기록, (b) 없으면 problem. 추가로 격리 항목이 **더 이상 불일치하지 않으면 problem**(DD3-ii — "수리됐으니 격리를 지우라"). list 항목은 `vocabulary` 지정 여부만 본다(DD9). 어휘 해석 실패는 `vocabularyGap`이 있으면 정보, 없으면 problem(fail-closed).
- **Mirror**: `lint.js:46` `readFile`의 fail-closed · `lint.js:119` `evidenceLexicalProblem`의 "어휘 검사를 fs 호출보다 먼저"
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` → L1~L10 ok, exit 0

### Task 4: `settings-layers.js` — 선언 유효값 도출

- **Action**: 사용자(`~/.claude/settings.json`) · 프로젝트(`<repo>/.claude/settings.json`) · 로컬(`<repo>/.claude/settings.local.json`) 세 파일의 `env` 블록을 `settings-writer.readSettings({path})`로 읽어 `{ key → { value, layer, shadowed } }`를 만든다. 우선순위는 local > project > user. 파일 부재는 정상(빈 계층), parse 실패는 그 계층을 `unreadable`로 표시하고 **나머지 계층은 계속 읽는다** — 한 파일의 오타가 진단 전체를 잠재우면 진단이 가장 필요한 순간에 침묵한다.
- **Mirror**: `settings-writer.js:21` `readSettings`(부재는 빈 객체, parse 실패는 `EBADSETTINGS`)
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/doctor.test.js`

### Task 5: `doctor.js` — 순수 판정 오라클

- **Action**: `diagnose({ declared, processEnv, registry, vocabulary, quarantine })` → `{ findings, counts, ok }`. env와 fs를 만지지 않는다. finding 종류:

  | code | 등급 | 조건 |
  |---|---|---|
  | `not-received` | error | 계층이 선언했는데 `processEnv`에 없다 |
  | `value-diverged` | error | 선언 유효값과 프로세스 값이 다르다 |
  | `unregistered-mccp` | error | `MCCP_*`인데 레지스트리에 없다 |
  | `contract-drift` | warning | 격리된 토글의 값 — 어휘 판정을 신뢰할 수 없다(DD4) |
  | `value-outside-vocabulary` | warning | 어휘 밖 값. 별칭으로 우연히 동작하는 경우 포함 |
  | `list-member-unknown` | warning | list 멤버가 어휘 밖 + 그 파서의 처리 방향 한 줄(DD8) |
  | `ambient` | info | 프로세스에는 있으나 어느 계층도 선언하지 않았다 |
  | `foreign-name` | 무언 | `MCCP_*`가 아닌 이름 — 기본 미표시(UI6) |

- **Mirror**: `plan-review/decide.js:229`(인자만 받는 판정 함수) · `value.js:120`(어휘 밖 값에 loud warn + default 복귀)
- **Validate**: 실사용 1번과 3번 사례를 fixture로 재현해 각각 `list-member-unknown`과 `not-received`가 나오는지 단언

### Task 6: `cli.js` — `list` · `explain` · `doctor`

- **Action**: `USAGE` 상수 + 서브커맨드 화이트리스트 + 오용 exit 2. repoRoot는 인자가 아니라 cwd에서 도출.
  - `list [--domain <d>] [--status <s>] [--kind <k>] [--json]` — 레지스트리 열거.
  - `explain <NAME> [--json]` — kind · values · default · 소비처 evidence · 상세 앵커 · settings.json 예시 · 격리 시 어긋남 경고.
  - `doctor [--all] [--json]` — Task 4와 5의 결선. 사람용 출력은 등급별 그룹 + 요약 한 줄.
  - 종료코드는 0(error 0건) / 1(error 1건 이상) / 2(오용). **어떤 hook도 게이트도 이 코드를 읽지 않는다**(DD6).
- **Mirror**: `meta-research.js:712` `USAGE` + 서브커맨드 화이트리스트 + 이중 출력
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/cli.js doctor`를 이 저장소에서 실제로 1회 완주

### Task 7: 회귀 test — 나머지 3파일

- **Action**: (`vocabulary.test.js`는 Task 1이 동반 생성) `doctor.test.js`(8종 finding · 계층 우선순위 · unreadable 계층 격리 · foreign-name 무언) · `cli.test.js`(**실제 spawn** — 3 서브커맨드 곱하기 종료코드, 배선 누락 회귀) · `lint.test.js` 확장(L10 pass/fail/stale-quarantine). 기존 단언 삭제 0건.
- **Mirror**: `env-contract/tests/lint.test.js`의 fixture 구성 관례
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/`

### Task 8: 문서 · 버전 · PRD

- **Action**: `docs/ENVIRONMENT.md` §5에 CLI 3종 레시피 + "`doctor`는 진단이며 게이트가 아니다" 한 줄. `CLAUDE.md` §4 cheat sheet에 등재. `CHANGELOG.md` 항목. §3.7 4면 동기(`plugin.json` · `renderer/html.js` page-foot · `renderer/markdown.js` derived 줄 · CHANGELOG `currently` 노트). PRD의 M1 행을 in-progress + Plan 경로로 갱신하고, **G1이 답한 Open Question**(병합은 깊은 병합, 얕은 대체 가설 반증)을 PRD Open Questions에 반영.
- **Mirror**: `CHANGELOG.md`의 §3.7 bump 서술 관례
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

### Task 9: CI 착지 게이트 — 계약 drift 워크플로

- **Action**: `.github/workflows/env-contract-drift.yml`을 만든다. `pull_request` + `paths` 필터를 L10의 결정 입력(`registry.js` · `vocabulary.js` · `lint.js` · `scan.js` · `docs/ENVIRONMENT.md` · `docs/environment/**` · 워크플로 자기 자신)으로 잡고, `lint.js`와 `env-contract/tests/`를 돌린다. **paths 필터가 입력을 하나라도 빠뜨리면 GitHub이 워크플로를 통째로 건너뛰어 게이트가 dead code가 된다** — 선례가 자기 주석에 남긴 경고이므로 결정 입력과 1:1로 맞춘다.
- **Mirror**: `.github/workflows/gitignore-drift.yml` — 전용 파일(다른 축에 얹지 않음) · paths 필터 = lint의 결정 입력 · 주석에 "머지 차단은 branch protection" 경계 명시
- **Validate**: 워크플로가 실행할 두 명령을 로컬에서 그대로 완주 — `node plugins/mccp/scripts/lib/env-contract/lint.js` · `node --test plugins/mccp/scripts/lib/env-contract/tests/`

## Validation

```bash
# 1. 계약 lint — L1~L10 전부 통과
node plugins/mccp/scripts/lib/env-contract/lint.js

# 2. env-contract 단위 test 전량
node --test plugins/mccp/scripts/lib/env-contract/tests/

# 3. CLI 실제 완주 (경로가 도는지 — 단위 test 통과와 별개 축)
node plugins/mccp/scripts/lib/env-contract/cli.js list --domain gates
node plugins/mccp/scripts/lib/env-contract/cli.js explain MCCP_PLAN_REVIEW
node plugins/mccp/scripts/lib/env-contract/cli.js doctor --json

# 4. 실사용 2건 재현 — fixture 입력으로 검출되는지
node --test plugins/mccp/scripts/lib/env-contract/tests/doctor.test.js

# 5. version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 6. 회귀 — 기존 표면 무손상
node --test plugins/mccp/scripts/lib/tests/ plugins/mccp/scripts/receipt/tests/

# 7. CI 착지 게이트가 돌릴 명령을 로컬에서 동일하게 완주
node plugins/mccp/scripts/lib/env-contract/lint.js && node --test plugins/mccp/scripts/lib/env-contract/tests/
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| L10을 켜는 순간 기존 항목이 대량 red가 되어 CI 게이트가 전면 red가 된다 | 높음 | DD3 격리표 — 근거를 붙여 명시 열거하고 M2가 배수한다. 격리는 **stale일 때 실패**하므로 영구 면죄부가 되지 않는다 |
| `doctor`가 격리된 토글에 "정상"을 보고해 오히려 오교육이 된다 | 중간 | DD4 — 격리 항목에는 `ok`를 주지 않고 `contract-drift`를 낸다. 두 축이 같은 표를 읽는다 |
| 정적 추출이 표현식으로 만든 집합을 못 읽어 커버리지가 조용히 낮아진다 | 중간 | `vocabularyGap` 사유 필수 + `build()` throw. Task 1에서 **못 읽은 개수를 실측해 보고**하고 그 수를 Acceptance에 적는다 |

<details>
<summary>+3 more risks</summary>

| Risk | Likelihood | Mitigation |
|---|---|---|
| `doctor`가 자기 프로세스의 env만 보므로 자식 프로세스 allowlist 누락을 놓친다 | 중간 | **주장 범위를 명시**한다 — CLI 프로세스가 받은 env를 인증할 뿐 dispatch worker · detached runner · Workflow agent의 env는 인증하지 않는다. 경계 축은 PRD Open Question이며 후속 마일스톤 |
| 격리표가 M2에서 잊혀 그대로 남는다 | 중간 | DD3-ii가 기계적으로 막는다 + PRD M2 행이 "격리표 비우기"를 acceptance로 갖는다 |
| 새 CLI가 또 하나의 선언원이 되어 drift를 재생산한다 | 낮음 | 전부 호출 시점에 레지스트리에서 파생 — 새 선언원 0개. 이것이 이 처방이 1순위인 이유(메타 조사 V3) |

</details>

## Acceptance

- [ ] Task 1~8 전부 완료
- [ ] Validation 1~6 전량 통과
- [ ] 패턴을 재발명하지 않고 mirror — 격리표는 `TOGGLE_EXCLUSIONS` 규약, CLI는 `meta-research.js` 규약
- [ ] **L10이 D1(`MCCP_PLAN_REVIEW`의 `off`)을 실제로 잡는다** — 격리에서 잠시 빼고 red를 확인한 뒤 되돌린 기록을 남긴다
- [ ] **격리 배수 규칙이 실증된다** — 격리 항목 하나의 `expected`를 코드와 일치시키면 L10이 "격리를 지우라"로 red가 되는지 1회 확인
- [ ] **정적 추출 실패 개수를 실측해 적는다** — 36개 중 `vocabularyGap`으로 남은 수와 그 이유. 0이라고 주장하지 않는다
- [ ] 게이트와 경로를 실제로 1회 완주하고 산출물을 확인 — `node …/env-contract/cli.js doctor`를 이 저장소에서 돌려 **실사용 3번째 사례의 반증(G1)이 출력에 나타나는지** 확인. 단위 test 통과와 경로 작동은 다른 명제다
- [ ] `doctor`가 이 저장소의 `MCCP_RECEIPT_DEBUG` 계층 충돌(사용자 `1`, 프로젝트 `on`)을 표면화한다
- [ ] **CI 착지 게이트가 실재한다** — `.github/workflows/env-contract-drift.yml`이 존재하고 그 `paths` 필터가 L10의 결정 입력을 빠짐없이 담는지 1:1로 대조한다. 워크플로가 돌릴 두 명령을 로컬에서 완주해 같은 결과를 확인한다
- [ ] `doctor` 축 한정 — hook 등록 0건, receipt 0건: `doctor`가 어떤 게이트에도 배선되지 않았음을 grep으로 확인(DD6). L10 lint는 Task 9의 CI 워크플로가 돌리므로 이 항목의 범위가 아니다

## 주장하지 않는 것

- **어긋난 값을 고치지 않는다.** M1은 9건을 **보이게** 만들고 격리한다. 수리는 M2다(UI8).
- **라운드 초과를 막지 않는다.** 층 C는 오라클이 아니라 산문 소비처의 문제이고 M3 소유다(UI9).
- **자식 프로세스의 env를 인증하지 않는다.** `doctor`는 자기 프로세스가 받은 값만 잰다.
- **병합 근인을 고치지 않는다.** G1이 얕은 대체 가설을 반증했지만, 그 대신 실사용 3번째 사례의 진짜 원인을 지목하지도 않았다 — 지목할 **장치**를 놓을 뿐이다(UI14).
- **머지 차단 자체를 주장하지 않는다.** Task 9의 워크플로가 보장하는 것은 계약 표면이 바뀐 PR에서 lint가 **돌고 drift에서 red가 된다**는 것까지다. 그 red가 머지를 막는 것은 branch protection 설정이고 저장소 파일로는 표현할 수 없다(`gitignore-drift.yml`이 그은 것과 같은 경계).
- **어휘 커버리지 100%를 주장하지 않는다.** 정적 추출의 한계는 실측해 숫자로 적는다.

## Design Critique

detector: `design_signal=true` · signal files = `plugins/mccp/scripts/lib/renderer/html.js` · `plugins/mccp/scripts/lib/renderer/markdown.js`. 두 파일에서 이 마일스톤이 바꾸는 것은 **§3.7 4면 동기의 version 리터럴 하나씩**이고 새로운 디자인 표면은 도입하지 않는다. 그럼에도 detector가 positive이므로 SKILL의 `## Output Constraints` 4항목을 읽고 retry loop을 돌렸다.

- rounds: 2 (R0 + 수정 후 R1) · cap: 2 · verdict: **CONVERGED**
- R0 finding (HIGH) — `## Risks`가 6행을 전부 펼쳐 제약 4(`list-of-N` 상위 3개 + 나머지 `<details>` 접기)를 위반. 중요도순 상위 3개만 펼치고 나머지 3개를 `+3 more`로 접어 흡수했다.
- R1 — 잔여 HIGH/CRITICAL 0건. 위계 최대 깊이 `###`(3단계) · 강조 토큰 0개 · raw markdown marker 0건 · 접기 적용 2곳(`Patterns to Mirror` 7행 → 3+4, `Risks` 6행 → 3+3).

제약 4를 **적용하지 않은 표 3개와 그 이유**: `User Intent`는 게이트가 기계로 파싱하는 계약표라 접으면 파서가 읽는 행 구조를 건드린다(표시용 목록이 아니다). `Files to Change`는 우선순위 목록이 아니라 참조표이고 실행 중 전량 조회된다. `Tasks`는 `###` 섹션이지 list-of-N이 아니다. 선례(`review-loop-bypass-m2.plan.md`)도 `Patterns`와 `Risks` 둘만 접었다.

## Design Routing Guide

routing mode: auto (implement 단계에서 유효). plan 단계는 렌더된 UI가 아직 없으므로 어떤 impeccable 명령도 **호출하지 않고** 체크리스트만 남긴다. 본 마일스톤의 렌더 표면 변경이 version 리터럴 2건뿐이므로, implement 단계에서도 `renderingSurface` 신호가 약하면 refine/discovery는 recommend로 강등될 것으로 예상한다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->

## Codex Implementation Review

- 호출: `node scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2)
- 라운드 수: 1 (cap=1 — `MCCP_REVIEW_SINGLE_PASS=deadline_pressure`가 고정)
- 합치 결론: Codex는 `MCCP_CODEX_DISABLED=1` env 정책으로 **미발화**(first-class skip, `codex_verdict=skipped`). implement-time 결정 심사는 security-reviewer 축이 단독 수행했다.
- Codex session 참조: n/a (spawn 이전 short-circuit, durationMs=0)

> Codex skipped per MCCP_CODEX_DISABLED=1 (env-level policy)

### Design Review

detector: `design_signal=false` · `silent_skip=true` · reason `no-signal`. 게이트 진입 시점의 diff가 비어 있어 whitelist hit 0이다. 이 마일스톤이 실제로 건드리는 렌더 표면은 `renderer/html.js` · `renderer/markdown.js`의 §3.7 version 리터럴 2건뿐이며, 그 변경은 EXECUTE 이후에 생긴다 — plan의 `## Design Critique`가 이미 기록한 detector 시점 gap이다. critique retry loop · stage routing · grounding capture 모두 미발화.

### Security Reviewer

`Task(security-reviewer)` 발화 — HIGH 1 · MEDIUM 5 · LOW 1. §3.14대로 HIGH만 그 자리에서 처리하고 나머지는 근거를 붙여 backlog에 이연했다.

| Finding | Severity | Verdict | Why |
|---|---|---|---|
| F2 사용자 홈 settings 읽기 경계 | HIGH | ACCEPT_NOW (절반) · REJECT (절반) | 처방 (a) "홈을 읽지 마라"는 UI2/UI3 무력화 — G1이 실측한 깊은 병합에서 "사용자 계층 선언이 도달했는가"가 곧 실사용 3번째 사례다. 채택: 레지스트리 밖 이름은 **값 미출력**, 읽기 전용 경계 주석. 미채택: symlink realpath — `~/.claude/`에 쓸 수 있는 자는 settings.json을 직접 쓸 수 있어 얻는 것이 없다 |
| F1 `extractConstant` 경로 이탈 | MEDIUM | ACCEPT_NOW | 5줄이고 `lint.js`의 evidence 경로 검사와 동형이다. ref는 registry(신뢰)에서 오지만 오타 방어로도 값이 있다 |
| F4 정적 추출 ReDoS · 무한 read | MEDIUM | ACCEPT_NOW | 파일 크기 상한 + 리터럴 개수 상한. 기본 위생이라 별도 축이 아니다 |
| F6 CLI 플래그 미검증 | MEDIUM | ACCEPT_NOW | plan이 이미 mirror로 지정한 `meta-research.js` 규약(화이트리스트 + exit 2)에 포함된다. 신규 범위가 아니다 |
| F7 `vocabularyGap` 사유 길이 미검증 | LOW | ACCEPT_NOW | `build()` throw 규약에 한 줄 추가 |
| F5 `settings-writer.js` JSON 상한 부재 | MEDIUM | DEFER_TO_BACKLOG | 공유 모듈이라 상한 추가는 별도 회귀 축. M1은 호출만 한다 |
| F3 잔여 — 등재 토글의 비밀값 금지 | MEDIUM | DEFER_TO_BACKLOG | 노출면은 등재 토글로 한정했으나 "등재 토글은 비밀을 담지 않는다"의 기계 강제는 L11 후보 |

- Deferred to backlog: 3 (F5 · F3 잔여 · F2 기각 절반의 근거) → `.claude/plans/codex-findings-backlog.md`
- Open Questions: 없음 — CRITICAL 0건, 잔여 HIGH 0건

### 상류 게이트 상태 (감사 기록)

`mccp-plan-codex/env-contract-integrity-m1`은 이 실행 시점에 **stale**이다(`receipt_plan_hash=sha256:1e4806b9…` vs `current=sha256:9f4f85a5…`). 사유: plan 본문이 그 게이트 자신의 L2 패널 지적을 흡수하며 바뀌었고(Task 9 CI 착지 게이트 신설 · `Patterns to Mirror` 인용 정정 2건 · Task 1의 test 동반 생성 명시), 진행 중인 리뷰는 없다. §3.16의 문서화된 감사 우회를 사유와 함께 적용했다 — 라운드를 늘리지 않는 것이 요지다.
