# Plan: 환경변수 계약 무결성 — M2 어긋난 값 수리 + 값 의미·멤버 어휘 문서화

**Source PRD**: .claude/prds/env-contract-integrity.prd.md
**Selected Milestone**: M2 — 어긋난 값 수리 + 값 의미·멤버 어휘 문서화
**Complexity**: Medium

## Summary

M1은 계약과 코드의 어긋남을 **보이게** 만들었다 — L10이 `values`를 소비처의 어휘 상수와 집합 비교하고, 알려진 8건은 근거를 붙인 격리표로 명시 열거됐다. M2는 그 격리표를 **비운다**. 격리는 배수 규칙(DD3-ii)을 갖고 있어, 수리된 항목이 표에 남아 있으면 L10이 붉어진다 — 즉 수리와 격리 삭제가 한 커밋 안에서 함께 일어나야만 green이 된다.

수리 범위는 격리 8건에 그치지 않는다. M1이 «인라인 비교라 어휘가 열거로 존재하지 않는다»로 남긴 gap 13건 중 8건은 `M2 문서화 축이 상수로 승격한다`고 스스로 적었다. 그 승격을 실제로 하면 검사 표면이 넓어지고, 넓어진 표면이 **오늘 보이지 않는 어긋남 2건**(`MCCP_BRIEFING`의 `always`, `MCCP_CONTEXT_MONITOR_COST_MODE`의 `off`·`observe`·`enforce`)을 새로 드러낸다. 8건 중 2건은 승격이 **틀린 처방**임이 실측으로 밝혀졌으므로(G3) 승격 대신 사유를 정정한다 — gap을 줄이는 것이 목적이 아니라 사유가 참인 것이 목적이다.

문서 축은 별개다. 오늘 상세 앵커의 구조부는 색인에서 파생된 고정 항목뿐이고 **값별 결과 서술이 들어갈 자리가 없다**. 그래서 값 의미의 유무가 «설계된 계약»이 아니라 «축약 이전 산문이 마침 그 내용을 담았는가»에 달려 있다. M2는 `**값별 결과**`(enum 27개)와 `**멤버 어휘**`(list 9개)를 구조부의 필수 항목으로 올리고, **L11**이 레지스트리 `values`와 그 블록을 양방향 집합 대조한다. 손으로 채운 뒤 검사를 붙이지 않으면 다음 토글이 추가되는 순간 같은 드리프트가 재생산된다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 문서가 가르치는 값이 전부 실제로 동작하게 만든다 | direction |
| UI2 | 각 값이 무엇을 켜고 끄는지 읽을 수 있게 만든다 | direction |
| UI3 | MCCP_PLAN_REVIEW의 리뷰 없음 모드를 구현하지 않는다 — 최소 수리는 존재하지 않는 값을 계약에서 빼는 쪽이다 | exclusion |
| UI4 | evidence 포인터 98건의 일괄 재생성은 하지 않는다 | exclusion |
| UI5 | 레지스트리 밖 토글의 은퇴 판단은 하지 않는다 | exclusion |
| UI6 | 온보딩 walkthrough와 에디터 스키마와 전용 열람 페이지는 이 마일스톤이 아니다 | exclusion |
| UI7 | 진단을 게이트로 편입하지 않는다 | exclusion |
| UI8 | 라운드 캡의 기계 강제는 M3가 담당한다 | exclusion |
| UI9 | 검사를 켤 때 대량 실패로 착지가 전면 차단되면 안 된다 — 먼저 채우고 켠다 | constraint |
| UI10 | 읽을 수 없는 항목은 조용한 통과가 아니라 명시 열거로 남는다 | constraint |
| UI11 | mccp가 소유하지 않는 이름을 오류로 보고하지 않는다 | constraint |
| UI12 | 미상 멤버의 처리 방향 통일은 아직 미결이므로 통일하지 않고 보고한다 | constraint |
| UI13 | 각 마일스톤이 독립적으로 사용자에게 보이는 변화를 낸다 | constraint |
| UI14 | 온보딩 축은 이 마일스톤 뒤에만 착지시킨다 | constraint |
| UI15 | milestone PR은 plugin.json version bump와 4면 동기를 함께 처리한다 | constraint |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 배수되는 명시 표 | `plugins/mccp/scripts/lib/env-contract/vocabulary.js:249` | `QUARANTINE` — 이름 + 실파일 근거 + 담당 마일스톤. 항목이 «더 이상 어긋나지 않아도» 실패하므로 수리와 삭제가 한 커밋이다. M2는 이 규약의 소비자이자 배수자다 |
| 양방향 집합 대조 | `plugins/mccp/scripts/lib/env-contract/lint.js:214` | L2 «레지스트리 ↔ 색인 양방향» — 한쪽에만 있는 항목을 양쪽에서 보고한다. L11의 값별 결과 대조가 같은 형태다 |
| 어휘 검사의 단일 소유 | `plugins/mccp/scripts/lib/env-contract/vocabulary.js:334` | `resolveVocabulary` — L10과 `doctor`가 **같은 함수**를 쓴다. 두 축이 갈라지면 한쪽이 통과시킨 값을 다른 쪽이 정상이라 보고한다. `LIST_MEMBER_POLICY`도 같은 이유로 단일 소유가 되어야 한다 |

<details>
<summary>+4 more patterns</summary>

| Category | Source | Pattern |
|---|---|---|
| 열거 밖 값의 loud fallback | `plugins/mccp/scripts/lib/santa/adjudication.js:68` | `parseEnum` — 미설정은 default, 열거 밖은 stderr warn 후 default. 승격되는 파서 6종이 전부 이 형태를 따른다 |
| 구조부의 고정 라벨 | `docs/environment/review.md:47` | `**극성** 미설정이면 …` — kind별로 한 줄 라벨을 더하는 관례. 신설 두 항목이 같은 자리에 붙는다 |
| 미검사 관례의 수명 | `docs/environment/*.md`의 `**극성**` 30줄 | 검사가 없어도 오늘은 완전하다. 그러나 그 완전성은 **운이지 보장이 아니다** — L11이 신설 두 항목에 그 운을 걸지 않는 이유 |
| 사유 있는 gap | `plugins/mccp/scripts/lib/env-contract/registry.js:305` | `build()`가 사유 없는 `null`을 throw한다. gap을 «줄이는» 것이 아니라 사유가 참인 것이 목적이다 |

</details>

## Grounding — 실측 (2026-08-25, 이 세션)

### G1 — 격리 8건 전부 코드 쪽에 구체 default가 있다

수리는 `values`만의 문제가 아니다. 8건은 전부 `default: null` + `status: 'undocumented-default'`인데, 소비처는 예외 없이 리터럴 default를 갖는다: `santa/gate.js:82` `SEVERITY_GATE_DEFAULT='enforce'` · `santa/terminator.js:19` `TERMINATOR_DEFAULT='enforce'` · `santa/adjudication.js:42` `GATE_DEFAULT='enforce'`(두 토글 공유) · `hook-flags.js:20` `'standard'` · `state-journal/index.js:28` `'enforce'` · `state/session-ledger.js:210` `'global'`. `MCCP_PLAN_REVIEW`만 이미 default를 갖는다.

즉 «각 값이 무엇을 켜고 끄는지»를 쓰려면 기준선인 default를 함께 적어야 하고, 그 정보는 이미 코드에 있다. 격리 항목 `MCCP_HOOK_PROFILE`의 owner가 `M2 (값 수리 + 기본값 문서화)`라고 적은 것이 이 축이다.

blast radius는 한정적이다. `state/toggle-snapshot.js:29`의 `TOGGLE_DEFAULTS`가 레지스트리에서 파생되므로, default가 채워지면 «default와 같은 값으로 명시 설정한 토글»이 non-default 목록에서 빠진다 — 계측 정확도가 올라가는 방향이다.

### G2 — 승격 8건 중 4건은 그대로 맞고, 2건은 어긋남을 새로 드러낸다

각 소비처의 실제 수용 집합을 읽어 레지스트리 `values`와 대조했다.

| 토글 | 레지스트리 `values` | 코드가 받는 집합 | 판정 |
|---|---|---|---|
| `MCCP_STOP_LOOP` | off/observe/enforce | `stop-review-loop.js:49` 동일 3값 | 일치 — 승격만 |
| `MCCP_GOAL_FEATURE` | available/missing/unknown | `goal-detect.js:60` 동일 3값 | 일치 — 승격만 |
| `MCCP_ULTRACODE_FEATURE` | available/missing/unknown | `ultracode-detect.js:51` 동일 3값 | 일치 — 승격만 |
| `MCCP_EVIDENCE_CONFLICT_GUARD` | enforce/warn/off | `evidence-lock.js:100` 동일 3값 | 일치 — 승격만 |
| `MCCP_BRIEFING` | auto/off/always | `cost-guard.js:76`이 `=== 'off'` 하나만 비교 | **`always` 미구현** |
| `MCCP_CONTEXT_MONITOR_COST_MODE` | off/observe/enforce | `ecc-context-monitor.js:63` notify·notification·info·informational | **3값 전부 no-op** |

`MCCP_CONTEXT_MONITOR_COST_MODE=off`는 이 저장소의 `.claude/settings.json`이 실제로 쓰는 값이며 아무 일도 하지 않는다. 운영자가 의도한 «비용 경고를 끈다»는 별도 축인 `MCCP_CONTEXT_MONITOR_COST_WARNINGS`(`ecc-context-monitor.js:53`, bool, default on)가 이미 소유하고 있고, 그 값은 사용자 전역 설정에 `0`으로 들어 있다. 따라서 이 토글의 `off`는 «만들어야 할 기능»이 아니라 **중복 광고**다.

### G3 — 승격 8건 중 2건은 승격이 틀린 처방이다

`MCCP_SESSION_START_CONTEXT`(`session-start.js:169`)의 판정은 열거가 아니라 **disable 별칭 집합**이다 — `['0','false','off','none','disabled']`에 들면 off, 그 밖은 전부 on. 이것은 M1이 `MCCP_GATEGUARD`에 이미 «canonical enum이 아니라 disable 별칭 집합이라 수용 어휘가 열거로 존재하지 않는다»는 사유로 gap 처리한 것과 **같은 형태**다. 승격하면 없는 열거를 만들어 내는 셈이다.

`MCCP_WORK_MERGE_STRATEGY`는 더 나쁘다. 정본 판정은 `plugins/mccp/commands/work.md:334`의 셸 문자열 비교이고, `orchestration-preview.js:71` `resolveMergeStrategy`는 스스로를 그 mirror라고 선언한다. JS 쪽에만 어휘 상수와 검증을 넣으면 오타 입력에서 **두 경로가 갈린다** — preview는 loud warn 후 default(`worktree-merge`)로 되돌리고 live는 «`worktree-merge`가 아니므로» 병렬을 끈다. mirror를 고치려다 mirror를 깨는 것이라 한쪽만 승격하는 선택지가 없다. 양쪽을 함께 고치는 것은 파서 이원화 축(메타 조사 E3·V3)이며 별도 마일스톤이다.

따라서 gap은 13 → **7**이 되고, 줄지 않은 3건 중 2건은 «M2가 승격한다»던 사유가 **거짓이었음이 밝혀져 정정**된다. 사유가 참이 되는 것이 gap 수가 줄어드는 것보다 이 계약의 목적에 가깝다.

### G4 — 값 의미의 «있음»은 토큰 등장으로 잴 수 없다

enum 27개 앵커에서 선언된 각 값이 본문에 문자열로 등장하는지 셌더니 full 18 · partial 9 · none 0이 나왔다. 메타 조사 E7이 같은 대상을 사람 판정으로 재서 얻은 12 · 6 · 9와 어긋난다. 원인은 근사의 성질이다 — `off`는 다른 단어 안에서도 매칭되고, 하단 `v1.29.0 원문` 블록에 값이 나열만 돼 있어도 «등장»으로 세어진다.

이 관측이 설계를 정한다. **토큰 등장을 검사하는 lint는 오늘 이미 대부분 통과하므로 아무것도 강제하지 못한다.** 그래서 L11은 산문을 스캔하지 않고, 값을 키로 갖는 **구조 블록**을 요구한다 — 값 하나가 줄의 키인 목록이 레지스트리 `values`와 양방향으로 같은지 본다. 측정 불가능한 산문 속성을 측정 가능한 구조 속성으로 바꾸는 것이 L11의 전부다.

### G5 — list 멤버 정책은 이미 한 곳에 있고, 그곳이 틀린 곳이다

`doctor.js:48` `LIST_MEMBER_POLICY`가 5개 list의 미상 멤버 처리 방향을 이미 문장으로 갖고 있다(DD8). 남은 4개(`MCCP_HANDOFF_THRESHOLDS_USD` · `MCCP_MCP_CONFIG_PATH` · `MCCP_EVIDENCE_STAGE_ROOT` · `ECC_DISABLED_MCPS`)는 항목이 없어 `doctor`가 «이 파서의 처리 방향은 문서화되지 않았다»로 떨어진다.

이 표가 `doctor.js`에 사는 것은 M1의 우연이다. L11도 같은 사실을 읽어야 하므로, `resolveVocabulary`가 L10과 `doctor`에 대해 갖는 관계와 동형으로 `vocabulary.js`가 소유해야 한다 — 두 축이 갈라지면 문서가 주장하는 처리 방향과 진단이 보고하는 처리 방향이 달라진다.

한편 `docs/ENVIRONMENT.md:29`의 §2 값 규약 표는 list의 불량값 처리를 «빈 목록» 한 줄로 적는다. G5의 실측이 그 줄을 반증한다 — 파서마다 다르고, 그 차이가 운영자에게 실현되는 비용이 메타 조사 E8이 기록한 것이다.

### G6 — 예시 2개가 수리로 깨진다

L7은 사용 예시의 값이 레지스트리 `values`에 있는지 검사한다. 수리 대상 8개 앵커의 예시를 읽으면 `MCCP_PLAN_REVIEW`가 `"off"`, `MCCP_HOOK_PROFILE`이 `"full"`을 쓴다 — 둘 다 제거되는 값이다. 나머지 6개는 `off`/`repo`를 쓰고 그 값들은 수리 후에도 살아남는다. 별도로 `MCCP_PLAN_REVIEW_QUORUM`의 예시는 `"1"`인데 `quorum.js:47`이 이 형식을 명시적으로 거부한다 — 오늘 통과하는 이유는 그 토글의 `values`가 `null`이라 L7의 대조 분기에 들어가지 않기 때문이다.

## Design Decisions

- **DD1 — 계약은 코드가 하는 일을 적고, 코드가 하는 일을 바꾸는 것은 별개 판단이다.** 수리 방향의 기본값은 «문서를 코드에 맞춘다»이다. 문서만 아는 값을 실제로 구현하는 쪽(`MCCP_BRIEFING=always` · `MCCP_SANTA_ADJUDICATION_GATE=warn`)은 게이트 의미를 바꾸므로 자기 근거와 자기 리뷰를 갖는 변경이며, 이 마일스톤은 그것을 하지 않는다. 대신 제거된 값마다 «무엇을 원했다면 오늘 무엇을 쓰는가»를 문서에 남긴다 — 조용한 삭제는 운영자에게 «내가 쓰던 게 사라졌다»만 남긴다.
- **DD2 — 승격의 판단 기준은 «상수를 놓을 수 있는가»가 아니라 «그 상수가 정본 경로를 지배하는가»다.** G3의 두 건은 전자를 만족하고 후자를 만족하지 못한다. 지배하지 않는 상수를 묶으면 L10이 green을 보고하면서 정본 경로는 검사 밖에 남는다 — 이 계약이 존재하는 이유가 정확히 그 상태였다.
- **DD3 — L11은 산문이 아니라 구조를 검사한다.** G4대로 토큰 등장 검사는 오늘 이미 통과하므로 강제력이 없다. 값을 키로 갖는 블록의 집합 동일성만 기계로 잴 수 있고, 서술의 **품질**은 잴 수 없다 — L11은 «각 값에 한 줄이 있다»까지만 주장하고 그 줄이 옳은지는 주장하지 않는다.
- **DD4 — 값별 결과의 대상은 enum 27개 전부다.** 오늘 «있어 보이는» 18개도 그 있음이 하단 원문 블록의 부산물이라(G4) 구조부에는 없다. 15개만 채우면 나머지 12개는 다음 축약 때 다시 사라진다.
- **DD5 — bool 27개는 대상이 아니다.** 두 값의 의미가 이름과 `**극성**` 줄로 이미 결정되고, 27개에 기계적으로 같은 두 줄을 붙이는 것은 서술이 아니라 소음이다. 이 경계는 L11의 대상 집합에 그대로 들어가므로 «빠뜨렸다»가 아니라 «범위다».
- **DD6 — `LIST_MEMBER_POLICY`는 `vocabulary.js`로 이전하고 9개 전부를 갖는다.** G5. `doctor.js`는 재-export가 아니라 require로 읽어, 두 소비처가 같은 표를 본다는 사실이 import 그래프에 남는다.
- **DD7 — 소유하지 않는 이름의 멤버 어휘는 «없음»이 아니라 «소유하지 않음»으로 적는다.** `ECC_DISABLED_MCPS`는 외부 MCP 서버 이름이라 이 계약이 어휘를 정의하지 않는다(UI11). L11은 그 형태를 **명시 형식으로 허용**하되 침묵으로는 허용하지 않는다 — 침묵과 구분되지 않는 예외는 UI10 위반이다.
- **DD8 — 격리 삭제와 값 수리는 한 커밋 불변식이다.** DD3-ii가 양방향이라 순서를 나누면 어느 쪽 순서든 중간 상태가 red다. 리뷰어가 «왜 두 파일을 함께 고쳤나»를 물을 수 있으므로 근거를 여기 적는다.
- **DD9 — kind 오기는 오늘의 kind 어휘로 정직하게 표현되는 것만 고친다.** `MCCP_PLAN_REVIEW_QUORUM`은 `<M>of<N>` 형식이므로 `string`으로 표현된다. `MCCP_AUTO_CHAIN_SKIP_PR`은 정확히 `1`만 보므로 `bypass-flag`로 표현된다. 반면 `MCCP_A11Y_AUTO_INVOKE`처럼 «`0`만 끄고 나머지는 전부 켜는» kill switch는 `bool`도 `bypass-flag`도 아니라 오늘의 어휘로 표현할 수 없다 — 새 kind를 도입하는 판단이 필요하므로 이연한다.

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | 12건의 `values`·`default`·`status`·`kind` 수리, 6건의 `vocabulary` 결속, 2건의 `vocabularyGap` 사유 정정 |
| `plugins/mccp/scripts/lib/env-contract/vocabulary.js` | UPDATE | `QUARANTINE` 8건 삭제(배수), `LIST_MEMBER_POLICY` 이전 + 9건 완비 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | UPDATE | L11 신설 — 값별 결과·멤버 어휘 블록과 레지스트리의 양방향 대조 |
| `plugins/mccp/scripts/lib/env-contract/doctor.js` | UPDATE | `LIST_MEMBER_POLICY`를 `vocabulary.js`에서 require (DD6) |
| `plugins/mccp/scripts/hooks/stop-review-loop.js` | UPDATE | 어휘 상수 승격 |
| `plugins/mccp/scripts/lib/goal-detect.js` | UPDATE | 어휘 상수 승격 |
| `plugins/mccp/scripts/lib/ultracode-detect.js` | UPDATE | 어휘 상수 승격 |
| `plugins/mccp/scripts/receipt/evidence-lock.js` | UPDATE | 어휘 상수 승격 |
| `plugins/mccp/scripts/lib/briefing/cost-guard.js` | UPDATE | 어휘 상수 승격 + 열거 밖 값 loud warn |
| `plugins/mccp/scripts/hooks/ecc-context-monitor.js` | UPDATE | 어휘 상수 승격 (canonical 2값 + 별칭 3종 분리) |
| `docs/environment/gates.md` | UPDATE | enum 5 + 값별 결과 |
| `docs/environment/review.md` | UPDATE | enum 12 + list 1, 수리 5건, 예시 1건 |
| `docs/environment/orchestration.md` | UPDATE | enum 3 + list 2 |
| `docs/environment/cost.md` | UPDATE | enum 2 + list 2, 수리 2건 |
| `docs/environment/hooks.md` | UPDATE | enum 2 + list 2, 수리 1건, 예시 1건 |
| `docs/environment/observability.md` | UPDATE | enum 3 + list 1, 수리 2건 |
| `docs/environment/external.md` | UPDATE | list 1 — 소유하지 않음 형식 (DD7) |
| `docs/ENVIRONMENT.md` | UPDATE | 색인 12행 갱신 + §2 list 불량값 처리 줄 정정 + `bypass-flag` 문안 |
| `.claude/settings.json` | UPDATE | `MCCP_SANTA_SEVERITY_GATE` `high`→`enforce`, `MCCP_CONTEXT_MONITOR_COST_MODE` 무효값 제거 |
| `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js` | UPDATE | L11 pass/fail/양방향 회귀 |
| `plugins/mccp/scripts/lib/env-contract/tests/vocabulary.test.js` | UPDATE | 격리 공집합 · `LIST_MEMBER_POLICY` 9건 완비 단언 |
| `plugins/mccp/scripts/lib/env-contract/tests/registry.test.js` | UPDATE | 수리 후 gap 7건 · 승격 6건 단언 |
| `plugins/mccp/scripts/lib/env-contract/tests/doctor.test.js` | UPDATE | 격리 소멸 후 `contract-drift` 0건 · 이전된 정책표 참조 |
| `.claude/prds/env-contract-integrity.prd.md` | UPDATE | M2 행 in-progress + Plan 경로, 답해진 Open Question 갱신 |
| `CHANGELOG.md` | UPDATE | 새 버전 항목 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (§3.7 — 단일 milestone이므로 patch) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |

## Tasks

### Task 1: 격리 8건 수리 — `values` · `default` · `status`

- **Action**: 레지스트리 8행을 코드 쪽 사실로 맞춘다. `MCCP_PLAN_REVIEW` → `off` 제거(UI3) · `MCCP_SANTA_SEVERITY_GATE`/`_TERMINATOR`/`_ADJUDICATION_GATE`/`_LEDGER_SUPPRESSION` → `['enforce','off']` + default `enforce` · `MCCP_HOOK_PROFILE` → `['minimal','standard','strict']` + default `standard` · `MCCP_STATE_JOURNAL` → `['enforce','shadow','off']` + default `enforce` · `MCCP_SESSION_LEDGER_SCOPE` → `['global','repo','hybrid']` + default `global`(문서의 `host`는 코드에 없고 `VALID_SCOPES`가 정본). default가 채워진 7건은 `status`를 `undocumented-default` → `active`로 올린다. **같은 편집에서** `vocabulary.js`의 `QUARANTINE` 8항목을 전부 삭제한다(DD8).
- **Mirror**: `vocabulary.js:249` `QUARANTINE` 배수 규약 · `registry.js:305` `build()`의 형태 계약
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` → L10 ok이고 `quarantined` 배열이 비어 있는지

### Task 2: 승격 4건 — 어휘 상수 신설과 결속

- **Action**: `stop-review-loop.js`·`goal-detect.js`·`ultracode-detect.js`·`evidence-lock.js` 각각에 어휘 배열 리터럴 상수를 놓고 인라인 비교를 그 상수 조회로 바꾼다. 판정 결과는 한 글자도 바뀌지 않아야 한다 — 리팩터링이지 동작 변경이 아니다. 레지스트리의 해당 4행에 `vocabulary: '<path>#<CONST>'`를 넣고 `vocabularyGap`을 지운다(둘의 동시 지정은 `build()`가 throw한다).
- **Mirror**: `santa/adjudication.js:43` `GATE_VALUES` — 상수 옆에 default 리터럴을 두는 배치
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/` + 각 소비처의 기존 test 무손상

### Task 3: 승격 2건 + 그것이 드러내는 수리 2건

- **Action**: `cost-guard.js`에 briefing 어휘 상수 `['auto','off']`를 놓고 열거 밖 값은 loud warn 후 `auto`로 되돌린다(오늘은 조용히 흘린다). 레지스트리에서 `always`를 제거한다. `ecc-context-monitor.js`에 canonical 어휘 `['directive','notify']`를 놓고 별칭 3종(`notification`·`info`·`informational`)은 별도 집합으로 남긴 뒤 canonical에 정규화한다 — bool이 `on`/`off`를 가르치고 별칭을 더 받는 것과 같은 구조다. 레지스트리 `values`를 `['directive','notify']`로, default를 `directive`로 바꾼다.
- **Mirror**: `env-contract/value.js:120` — 열거 밖 값은 default 복귀 + loud warn, 문서 어휘는 별칭 집합보다 좁다
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/` · `node --test plugins/mccp/scripts/lib/tests/` · `node --test plugins/mccp/scripts/hooks/tests/`

### Task 4: 승격 오판 2건 — 사유 정정

- **Action**: `MCCP_SESSION_START_CONTEXT`의 `vocabularyGap`을 `MCCP_GATEGUARD`와 같은 «disable 별칭 집합이라 수용 어휘가 열거로 존재하지 않는다» 형태로 고치고 근거를 `session-start.js:169`로 지목한다. `MCCP_WORK_MERGE_STRATEGY`는 «정본 판정이 command 본문의 셸 비교이고 JS는 mirror라, 한쪽에만 어휘 상수를 두면 오타 처리 방향이 갈려 mirror가 깨진다»로 고치고 `plugins/mccp/commands/work.md:334`와 `orchestration-preview.js:71`을 함께 지목한다. 두 사유 모두 담당 축(파서 이원화)을 명시한다.
- **Mirror**: `registry.js`의 `MCCP_GATEGUARD` 행 gap 사유 문형
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/registry.test.js` — gap 7건과 각 사유의 최소 길이

### Task 5: kind 오기 2건

- **Action**: `MCCP_PLAN_REVIEW_QUORUM`을 `int` → `string`으로 고치고 색인 `값` 열에 `<M>of<N>` 형식을, default에 `3of4`를 적는다(`quorum.js`의 default 상수에서 읽어 확인). 상세 앵커의 예시 `"1"`을 `"3of4"`로 바꾼다. `MCCP_AUTO_CHAIN_SKIP_PR`을 `bool` → `bypass-flag`로 고치고 예시를 `"1"`로, summary에 «LLM이 읽고 판단하며 기계 강제가 없다»를 넣는다. `docs/ENVIRONMENT.md` §2의 `bypass-flag` 문단이 «그 셋»으로 세는 부분을 갱신한다.
- **Mirror**: `registry.js`의 `MCCP_SKIP_RECEIPT` 행 — `bypass-flag`의 kind·values·default 배치
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` → L2·L7 ok

### Task 6: `LIST_MEMBER_POLICY` 단일 소유 이전 + 9건 완비

- **Action**: `doctor.js:48`의 표를 `vocabulary.js`로 옮기고 `doctor.js`는 require로 읽는다(DD6). 없는 4건을 채운다 — `MCCP_HANDOFF_THRESHOLDS_USD`(오름차순 정수 3개, 형식 위반 시의 처리) · `MCCP_MCP_CONFIG_PATH`·`MCCP_EVIDENCE_STAGE_ROOT`(경로라 열거 어휘 없음) · `ECC_DISABLED_MCPS`(이 계약이 소유하지 않음, DD7). 각 항목에 소비처 `path:line` 근거를 붙인다.
- **Mirror**: `vocabulary.js:334` `resolveVocabulary` — L10과 `doctor`가 같은 함수를 쓴다는 단일 소유 규약
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/doctor.test.js`

### Task 7: 문서 — 값별 결과 27 + 멤버 어휘 9

- **Action**: enum 27개 앵커에 값별 결과 블록을 넣는다. 형식은 값 하나당 한 줄이고 값이 줄의 키다: 백틱으로 감싼 값 뒤에 «무엇이 켜지고 무엇이 꺼지는가»를 동사로 적는다. default인 값에는 그 사실을 함께 적는다. list 9개 앵커에 멤버 어휘 블록을 넣는다 — 허용 토큰(또는 어휘가 도출되는 파일) + 미상 토큰의 처리 방향(Task 6의 표와 같은 문장, UI12대로 통일하지 않고 보고). Task 1·3·5가 제거한 값에는 «이것을 원했다면 오늘 무엇을 쓰는가»를 한 줄로 남긴다(DD1). 하단 `v1.29.0 원문` 블록은 역사 기록이므로 손대지 않는다.
- **Mirror**: `docs/environment/review.md:47` `**극성**` 줄 — kind별 고정 라벨을 구조부에 더하는 관례
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` → L3·L7 무손상

### Task 8: L11 신설 — 값별 결과와 멤버 어휘의 기계 대조

- **Action**: `lint.js`의 `run()`에 L11을 더한다. enum 항목마다 상세 앵커에서 값별 결과 블록을 찾아 줄의 키 집합을 뽑고 레지스트리 `values`와 **양방향** 비교한다(선언됐는데 줄이 없다 · 줄이 있는데 선언에 없다 둘 다 problem). 서술부는 placeholder·공백만이면 problem이고, 그 이상의 품질은 주장하지 않는다(DD3). list 항목마다 멤버 어휘 블록의 존재와 `LIST_MEMBER_POLICY`의 해당 문장 인용을 확인한다. 앵커를 읽지 못하면 통과가 아니라 problem이다. 은퇴 도메인은 L7과 같은 근거로 제외한다.
- **Mirror**: `lint.js:214` L2의 양방향 대조 · `lint.js:46` `readFile`의 fail-closed
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` → L1~L11 전부 ok, exit 0

### Task 9: 회귀 test 4파일 + 저장소 설정 수리

- **Action**: `lint.test.js`에 L11의 pass·누락·잉여·placeholder·앵커 부재 5케이스를 fixture로 넣는다. `vocabulary.test.js`에 `QUARANTINE`이 공집합이라는 단언과 `LIST_MEMBER_POLICY`가 list 9개를 빠짐없이 갖는다는 단언(레지스트리에서 파생해 대조 — 손으로 센 9는 다음 list가 추가되면 낡는다)을 넣는다. `registry.test.js`에 gap 7건·승격 6건, `doctor.test.js`에 `contract-drift` 0건을 단언한다. 기존 단언 삭제는 0건이다. 이어서 `.claude/settings.json`의 `MCCP_SANTA_SEVERITY_GATE: "high"`를 `"enforce"`로(오늘 warn 후 default로 되돌아가므로 동작은 불변, 선언만 정직해진다), `MCCP_CONTEXT_MONITOR_COST_MODE: "off"`를 무효값이므로 제거한다 — 비용 경고 억제는 이미 `MCCP_CONTEXT_MONITOR_COST_WARNINGS`가 담당한다(G2).
- **Mirror**: `env-contract/tests/lint.test.js`의 fixture 구성 관례
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/`

### Task 10: 문서 · 버전 · PRD · CHANGELOG

- **Action**: `docs/ENVIRONMENT.md` 색인 12행을 수리 결과로 갱신하고, §2의 list 불량값 처리 줄을 «파서마다 다르며 각 토글의 멤버 어휘 항목이 소유한다»로 정정한다(G5). PRD의 M2 행을 in-progress + Plan 경로로 갱신하고, 이번에 답해진 Open Question 2건(`MCCP_SESSION_LEDGER_SCOPE`의 정본은 `hybrid`이고 `host`는 코드에 없다 · 미상 멤버 처리 방향은 M2에서도 통일하지 않고 9건 전부를 문서화한다)을 반영한다. CHANGELOG 항목과 §3.7 4면 동기를 처리한다. **version은 지금 정하지 않는다** — origin/main이 이미 `1.32.2`를 발행했고 이 브랜치는 `1.30.2`에서 미머지다. §3.7의 재계산 시점 둘(머지 해소 직후 · `/mccp:pr` 진입 직전)에 각각 다시 계산한다.
- **Mirror**: `CHANGELOG.md`의 §3.7 bump 서술 관례
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 1. 계약 lint — L1~L11 전부 통과
node plugins/mccp/scripts/lib/env-contract/lint.js

# 2. 격리표가 실제로 비었는지 (수치로 확인)
node plugins/mccp/scripts/lib/env-contract/lint.js --json | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('quarantined=',j.checks.L10.quarantined.length)"

# 3. env-contract 단위 test 전량
node --test plugins/mccp/scripts/lib/env-contract/tests/

# 4. 승격된 소비처 6종의 기존 동작 무손상
node --test plugins/mccp/scripts/lib/tests/ plugins/mccp/scripts/hooks/tests/ plugins/mccp/scripts/receipt/tests/

# 5. CLI 실제 완주 — doctor에서 contract-drift가 사라졌는지
node plugins/mccp/scripts/lib/env-contract/cli.js doctor
node plugins/mccp/scripts/lib/env-contract/cli.js explain MCCP_HOOK_PROFILE

# 6. version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 7. CI 착지 게이트가 돌릴 두 명령을 로컬에서 동일하게 완주
node plugins/mccp/scripts/lib/env-contract/lint.js && node --test plugins/mccp/scripts/lib/env-contract/tests/
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 승격 리팩터링이 소비처의 판정을 바꾼다 — 특히 `cost-guard.js`와 `ecc-context-monitor.js`는 오늘 «열거 밖 값을 조용히 흘리는» 경로라 warn 추가가 동작 변경으로 보인다 | 중간 | 승격은 «같은 판정, 다른 표현»이 계약이다. 두 파일은 판정 자체가 불변이고 stderr 한 줄이 늘 뿐임을 test로 고정한다. 저장소 자신의 `MCCP_CONTEXT_MONITOR_COST_MODE=off`가 그 warn의 첫 소비자이므로 Task 9가 같은 커밋에서 그 값을 제거한다 |
| L11을 켜는 순간 36개 앵커가 전부 red가 되어 착지가 전면 차단된다 | 높음 | UI9의 «먼저 채우고 켠다» — Task 7이 Task 8보다 먼저다. 순서를 뒤집으면 중간 커밋이 red이고, 그 red는 결함이 아니라 작업 순서의 부산물이라 신호가 죽는다 |
| M1이 아직 머지되지 않아 M2가 미머지 브랜치 위에 쌓인다 | 확실 | 사실 확인: `origin/main`은 `1.32.2`이고 이 브랜치의 M1(`31a779d`)은 미머지다. M2는 M1의 격리표를 배수하므로 **M1 없이는 성립하지 않는다** — 같은 브랜치에 이어 쌓거나, M1 PR 착지 후 rebase한다. 어느 쪽이든 §3.5.1의 삭제 검증(`git diff --diff-filter=D`)을 머지 해소 직후에 돌린다 |

<details>
<summary>+3 more risks</summary>

| Risk | Likelihood | Mitigation |
|---|---|---|
| 값별 결과 27개를 손으로 쓰면서 서술이 틀린다 — L11은 «줄이 있다»만 보고 «옳다»는 보지 않는다(DD3) | 중간 | 각 줄의 근거를 소비처 코드에서 읽어 쓰고, 판정이 갈리는 값(`hybrid`·`shadow`·`notify`)은 소비 분기를 직접 인용한다. 이 한계는 Acceptance와 «주장하지 않는 것»에 명시한다 — 검사가 덮지 않는 범위를 적지 않으면 green이 과대 주장이 된다 |
| gap이 13 → 7로만 줄어 «M2가 gap을 비운다»는 기대와 어긋난다 | 중간 | G3이 실측으로 2건의 승격이 틀린 처방임을 보였다. 사유를 정정하는 것이 목적이고 수를 줄이는 것은 목적이 아니다 — PRD의 성공 지표도 gap 수가 아니라 «계약이 선언했으나 코드가 받지 않는 값»이다 |
| `bypass-flag`가 4개로 늘어 §2의 «리뷰 게이트를 약화하는 그 셋»이라는 서사가 깨진다 | 낮음 | Task 5가 §2 문단을 함께 고친다. kind는 파싱 계약(정확히 `1`)을 뜻하고 «게이트 약화»는 그 셋의 공통 성질이었을 뿐 kind의 정의가 아니라는 점을 명시한다 |

</details>

## Acceptance

- [ ] Task 1~10 전부 완료
- [ ] Validation 1~7 전량 통과
- [ ] 패턴을 재발명하지 않고 mirror — 격리 배수는 `QUARANTINE` 규약, L11의 대조는 L2의 양방향 형태, 정책표 단일 소유는 `resolveVocabulary` 관계
- [ ] **격리표가 실제로 비었다** — `L10.quarantined.length === 0`을 명령 출력으로 확인하고, 8건 중 하나의 수리를 되돌리면 L10이 붉어지는지 1회 확인해 배수가 살아 있음을 실증한다
- [ ] **L11이 실제로 막는다** — 값별 결과 한 줄을 지우면 L11이 그 토글 이름과 함께 붉어지고, 선언에 없는 값의 줄을 더해도 붉어지는지(양방향) 각각 1회 확인
- [ ] **승격 6건이 판정을 바꾸지 않았다** — 각 소비처의 기존 test가 무수정으로 통과하고, 새로 추가된 것은 stderr warn 경로의 단언뿐임을 diff로 확인
- [ ] **gap 7건과 각 사유를 실측해 적는다** — 7이라고 주장하기 전에 명령으로 세고, 정정된 2건의 사유가 소비처 `path:line`을 지목하는지 확인. 0이라고 주장하지 않는다
- [ ] 게이트와 경로를 실제로 1회 완주하고 산출물을 확인 — `node plugins/mccp/scripts/lib/env-contract/cli.js doctor`를 이 저장소에서 돌려 **경고 2건이 0건이 되고** `explain MCCP_HOOK_PROFILE`이 `standard` 기본값과 값별 결과를 출력하는지 확인. 단위 test 통과와 경로 작동은 다른 명제다
- [ ] **제거된 값마다 대체 경로가 문서에 있다** — `off`·`always`·`high`·`host` 등 사라지는 값 각각에 «이것을 원했다면 오늘 무엇을 쓰는가»가 한 줄로 남았는지 열거해 확인(DD1)
- [ ] version 4면 동기 + PRD M2 행 갱신. §3.7 재계산을 **머지 해소 직후와 `/mccp:pr` 진입 직전 두 번** 수행

## 주장하지 않는 것

- **문서만 아는 값을 구현하지 않는다.** `MCCP_PLAN_REVIEW=off`(UI3) · `MCCP_BRIEFING=always` · `MCCP_SANTA_ADJUDICATION_GATE=warn`은 계약에서 제거되고, 그 기능이 필요하다는 판단은 자기 근거를 갖는 별개 변경이다(DD1).
- **파서 이원화를 고치지 않는다.** 셸이 `value.js`를 거치지 않는 축(메타 조사 E3)과 그것에 걸린 `MCCP_WORK_MERGE_STRATEGY`·`MCCP_A11Y_AUTO_INVOKE`·`MCCP_WORK_ISOLATE_IMPLEMENT`는 그대로 남는다. gap 사유가 그 사실을 지목하는 것까지가 M2다(DD2·DD9).
- **값 서술의 정확성을 기계로 보장하지 않는다.** L11이 강제하는 명제는 «선언된 각 값에 한 줄이 있고, 없는 값의 줄은 없다»이다. 그 줄이 코드와 맞는지는 사람이 읽어야 한다(DD3).

<details>
<summary>+3 more</summary>

- **미상 멤버 처리 방향을 통일하지 않는다.** 9개 전부를 문서화하고 진단이 보고하게 하되, 어느 방향이 옳은지는 PRD Open Question으로 열려 있다(UI12).
- **evidence 드리프트 98건을 손대지 않는다**(UI4). **레지스트리 밖 토글의 은퇴를 판단하지 않는다**(UI5). **라운드 캡을 강제하지 않는다**(UI8).
- **머지 차단 자체를 주장하지 않는다.** M1이 놓은 CI 워크플로가 L11도 함께 돌리지만, red가 머지를 막는 것은 branch protection 설정이고 저장소 파일로는 표현할 수 없다.

</details>

## Design Critique

detector: `design_signal=true` · signal files = `plugins/mccp/scripts/lib/briefing/cost-guard.js` · `plugins/mccp/scripts/lib/renderer/html.js` · `plugins/mccp/scripts/lib/renderer/markdown.js`. renderer 두 파일에서 이 마일스톤이 바꾸는 것은 §3.7 4면 동기의 version 리터럴 하나씩이고 새 디자인 표면은 도입하지 않는다. `cost-guard.js`는 whitelist가 아니라 파일명 매칭에 걸린 것으로 보이며 실제 변경은 어휘 상수 승격이다. 그럼에도 detector가 positive이므로 SKILL의 `## Output Constraints` 4항목을 읽고 retry loop을 돌렸다.

- rounds: 2 (R0 + 수정 후 R1) · cap: 2 · verdict: **CONVERGED**
- R0 finding (HIGH) — `## 주장하지 않는 것`이 6항목을 전부 펼쳐 제약 4(`list-of-N` 상위 3개 + 나머지 접기)를 위반. 중요도순 상위 3개(구현 금지 · 파서 이원화 · L11의 기계 보장 한계)만 펼치고 나머지 3개를 `+3 more`로 접어 흡수했다.
- R1 — 잔여 HIGH/CRITICAL 0건. 기계 확인: 최대 위계 `###`(3단계, `H4+` 0건) · 강조색 토큰 0개 · 불균형 `**`/백틱 0건(fence 2줄은 정상 쌍) · 접기 적용 3곳(`Patterns to Mirror` 7행 → 3+4, `Risks` 6행 → 3+3, `주장하지 않는 것` 6항 → 3+3).

제약 4를 **적용하지 않은 절 4개와 그 이유**: `User Intent`는 게이트가 기계로 파싱하는 계약표라 접으면 파서가 읽는 행 구조를 건드린다. `Files to Change`는 우선순위 목록이 아니라 참조표이고 실행 중 전량 조회된다. `Tasks`는 `###` 섹션이지 list-of-N이 아니다. `Design Decisions` 9항은 **리뷰어가 공격 대상으로 삼는 본문**이라 접으면 리뷰가 존재하는 이유인 근거가 첫 화면에서 사라진다 — 접기가 보호하려는 «한 화면 항목 수»보다 «판정 근거가 리뷰어에게 보인다»가 우선이라고 판정했다. 선례(`env-contract-integrity-m1.plan.md`)도 같은 절을 펼친 채 두었다.

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
