# Plan: impeccable 탐지 계약 M3 — 섀도잉 해소

**Source PRD**: .claude/prds/impeccable-detection-contract.prd.md
**Selected Milestone**: 3 — 섀도잉 해소
**Complexity**: Large

## Summary

M1은 오라클을 만들고, M2는 소비처를 배선했다. 둘 다 **다중 사본이 공존할 때 무엇이
실제로 열리는가**를 사용자에게 말하지 않는다 — 이 저장소가 그 상태다(plugin 4.1.1과
project 3.5.0이 함께 있고 게이트는 3.5.0을 연다). M3는 (a) 승자가 아닌 소스를 1급
사실로 보고하고, (b) `/mccp:setup`이 승인을 받아 정리를 제안하며, (c) 이 저장소의
3.5.0 사본을 제거한다. (c)는 **호출부 재배선과 단일 커밋**이어야 한다 — 지우기만
하면 bare 소스가 사라져 모든 게이트의 impeccable 호출이 `unknown_skill`로 떨어진다.

## User Intent

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | env 우회는 외부에 따로 설치한 경우를 위한 장치이며, 공식 채널로 default 설치한 사용자에게 env 설정을 요구하는 것은 결함이다 | direction |
| UI2 | 어느 채널도 폐기하지 않는다 — 기존 npm CLI 3.x 사용자는 강제 마이그레이션 대상이 아니며 계속 동작해야 한다 | exclusion |
| UI3 | 섀도잉 정리는 setup이 승인을 받아 제안하는 형태여야 하고 자동 삭제가 아니다 | constraint |
| UI4 | 같은 skill의 다중 사본이 사용자에게 보여야 한다 | direction |
| UI5 | 이 저장소의 구버전 사본은 사라진다 | direction |
| UI6 | 다중소스를 추정하지 않는다 — 열거하고 관측된 것만 보고하며 모르면 모른다고 보고한다 | constraint |
| UI7 | 게이트 lenient·strict 비대칭은 재설계 대상이 아니다. 입력만 고친다 | exclusion |
| UI8 | 이미 커밋된 `.impeccable/design.json`은 tracked로 남기고 untrack하지 않는다 | exclusion |
| UI9 | 라우팅 카탈로그 확장과 a11y-architect 자동 발화는 이 계약 밖이다 | exclusion |
| UI10 | 도구 권한 때문에 게이트가 멎으면 MVP 범위에 권한 축을 추가한다 | exception |
| UI11 | impeccable 자체의 결함은 별개 축이다 | exclusion |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 오라클 확장 | `plugins/mccp/scripts/lib/impeccable-detect.js:445` | `resolutionFields()`가 반환 필드를 한 곳에서 조립한다 — 새 필드는 여기에 얹어야 분기마다 빠뜨리지 않는다 |
| 모호성 처리 | `plugins/mccp/scripts/lib/impeccable-detect.js:371` | bare 소스가 둘이면 승자를 고르지 않고 null + `shadowed:true`로 답한다 |
| fail-closed 소비 | `plugins/mccp/scripts/lib/dep-check.js:96` | 지연 require를 try/catch로 감싸 `available:false` sentinel을 돌려준다 |
| 터미널 출력 소독 | `plugins/mccp/scripts/lib/dep-check.js:148` | 사용자가 설치한 파일에서 읽은 값은 `safeLabel`을 통과해야 표에 도달한다 |
| 파괴적 setup 액션 | `plugins/mccp/scripts/lib/gitignore-provision.js:1` | `--json` + `--dry-run` + `{ok, action}` 반환형. 이미 tracked인 파일은 보고만 하고 건드리지 않는다 |
| 명령 본문 회귀 가드 | `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js:81` | 명령 본문의 리터럴 존재를 test로 고정해 배선 drift를 붉게 만든다 |
| 반환 필드 회귀 test | `plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js:439` | 오라클이 내는 이름이 명령 본문이 부르는 이름과 같은지 단언한다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/impeccable-detect.js` | UPDATE | eclipsed 필드 + `resolutionFields()` 확장 + resolve CLI 출력 |
| `plugins/mccp/scripts/lib/impeccable-cleanup.js` | CREATE | 승인 기반 정리의 판정·실행 오라클 (plan / apply) |
| `plugins/mccp/scripts/lib/dep-check.js` | UPDATE | `impeccableLabel`에 eclipsed 표기 + CLI printer 행 추가 |
| `plugins/mccp/scripts/hooks/session-start.js` | UPDATE | eclipsed 존재 시 정보성 1행 (missing 배너와 분리) |
| `plugins/mccp/commands/setup.md` | UPDATE | Phase 3.5 — 섀도잉 보고 + 승인 기반 정리 제안 |
| `plugins/mccp/commands/plan.md` | UPDATE | 호출부 재배선 — 해소된 invocation으로 Skill 호출 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | 호출부 재배선 |
| `plugins/mccp/commands/pr.md` | UPDATE | 호출부 재배선 |
| `plugins/mccp/commands/code-review.md` | UPDATE | 호출부 재배선 |
| `plugins/mccp/commands/prp-pr.md` | UPDATE | alias 서술을 재배선된 형태로 정정 |
| `plugins/mccp/commands/review-pr.md` | UPDATE | alias 서술을 재배선된 형태로 정정 |
| `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` | UPDATE | bare 리터럴 단언을 재배선 단언으로 교체 |
| `plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js` | UPDATE | eclipsed 케이스 + 재배선 anchor 갱신 |
| `plugins/mccp/scripts/lib/tests/dep-check.test.js` | UPDATE | eclipsed 라벨·printer 회귀 |
| `plugins/mccp/scripts/lib/tests/impeccable-cleanup.test.js` | CREATE | 정리 오라클의 거부 규칙 회귀 |
| `.claude/skills/impeccable` | DELETE | 이 저장소의 3.5.0 사본 제거 (재배선과 단일 커밋) |
| `docs/environment/external.md` | UPDATE | 사라지는 사본을 가리키는 링크 앵커 5곳 정정 |
| `docs/gate-design.md` | UPDATE | `## impeccable-detection`에 M3 절 추가 |
| `CLAUDE.md` | UPDATE | §3.17 — 재배선 완료 + 정리 규칙 상주 |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATE | milestone 3 status·Plan + Open Questions 정리 |
| `CHANGELOG.md` | UPDATE | 1.31.3 항목 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 1.31.2 에서 1.31.3 으로 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 |
| `.claude/notes/impeccable-detection-contract-m3.md` | CREATE | Task 0 측정 + 라이브 완주 증거 |

## Tasks

### Task 0: 라이브 측정 2건 — 이 milestone의 차단 조건

- **Action**: 사본을 지우기 **전에** 두 가지를 실제로 관측하고 노트에 기록한다.
  (a) `Skill(impeccable:impeccable, "critique <임의 slug>")`를 1회 호출해 해소
  여부를 확인한다 — 재배선의 표적이 실재하는지는 아직 측정된 바 없다.
  (b) 그 호출이 plugin cache 안의 `scripts/context.mjs`에 도달할 때 권한 프롬프트가
  뜨는지 관측한다. 4.1.1의 `allowed-tools`는 `Bash(node .claude/skills/impeccable/scripts/*)`
  라는 project 상대 경로인데 plugin base는 cache 절대경로라 그 glob이 매치하지
  않는다. 다만 mccp 게이트 자체가 `node` Bash 권한 없이는 한 줄도 못 도므로 실질
  영향이 없을 가능성이 크다 — **가정하지 말고 관측한다.**
  분기: (a)가 실패하면 재배선의 표적이 없으므로 Task 6·7을 중단하고 Task 1~5만
  ship한 뒤 PRD Open Questions에 기록한다. (b)가 프롬프트를 띄우면 UI10대로 권한
  축을 이 milestone에 추가하고(setup이 `permissions.allow` 한 줄을 제안), 그래도
  비대화형 완주가 안 되면 Task 7의 사본 제거만 M4로 이연한다.
  **어느 분기든 Task 7이 착지하지 않으면 PRD milestone 3은 `complete`가 되지 않는다.**
  M3의 outcome 문장이 "이 저장소의 구버전 사본이 사라진다"를 포함하므로, 사본이 남은
  채로 완료를 선언하면 PRD가 해소했다고 말하는 상태를 저장소가 그대로 유지한다. 부분
  착지는 milestone을 `in-progress`로 두고 PRD Open Questions에 남은 축과 그 이유를
  적는다 — 범위를 줄이는 것은 기록으로 남을 때만 정직하다.
  **이 노트는 강제 장치가 아니다.** Task 0의 (a)는 harness가 skill 이름을 해소하는
  사건이라 스크립트가 관측할 수 없고, 그래서 코드 게이트로 만들 수 있는 대상이 아니다.
  강제는 결과 쪽에 있다 — Task 7의 Validate가 요구하는 `resolve --json` 출력과
  Task 9가 요구하는 `impeccable_skipped`가 참이 아닌 receipt가 그것이다. 노트는 왜
  그렇게 분기했는지를 남기는 감사 기록이지 통과 조건이 아니다.
- **Mirror**: `.claude/notes/impeccable-detection-contract-m2.md`의 Task 0 서술 형식
  (관측 명령 · 원시 출력 · 판정을 분리해 적는다)
- **Validate**: `.claude/notes/impeccable-detection-contract-m3.md`에 두 관측의 원시
  출력과 판정이 적혀 있고, 판정이 Task 6·7의 진행 여부를 명시한다

### Task 1: 오라클 — 승자가 아닌 소스를 1급 사실로

- **Action**: `resolveImpeccable()` 반환에 `eclipsed` 배열을 추가한다. M1과 같은
  **엄격한 상위집합**이며 기존 키의 의미는 한 글자도 바꾸지 않는다. 정의는 하나다 —
  *승자가 정해졌을 때, 열거된 소스 중 승자 행이 아닌 전부.* 규칙 셋:
  (1) `shadowed:true`로 승자가 없으면 `eclipsed`는 **빈 배열**이다. 무엇이 가려졌는지
  모르는 상태에서 가려졌다고 말하면 UI6을 어긴다. 빈 배열은 "정리할 것이 없다"가
  **아니라 "무엇이 정리 대상인지 판정할 수 없다"** 는 뜻이고, Task 4의 거부 규칙 (6)이
  그 구분을 코드로 강제한다 — 소비처가 두 상태를 같게 읽으면 정리 대상이 없다는
  판정과 승자를 모른다는 판정이 하나로 뭉개진다.
  (2) `available:false`거나 소스가 1개 이하면 빈 배열이다.
  (3) **버전을 비교하지 않는다.** 어느 쪽이 최신인지 판정하지 않고 `version`을 그대로
  실어 사람이 읽게 한다 — semver가 아닐 수도, null일 수도 있다.
  `resolutionFields()`에 `impeccable_eclipsed`를 얹고, resolve CLI 출력의 소스 표에
  승자 표시를 추가한다.
  test는 다음 넷을 각각 단언한다 — (i) 승자가 하나일 때 `eclipsed`가 승자 아닌 행
  전부와 정확히 일치, (ii) `shadowed:true`면 소스가 둘 이상이어도 빈 배열,
  (iii) 소스 1개 이하 또는 `available:false`면 빈 배열, (iv) `resolutionFields()`가
  네 분기 전부에서 `impeccable_eclipsed`를 싣는다(M1이 같은 자리에서 놓쳤던 축).
- **Mirror**: `plugins/mccp/scripts/lib/impeccable-detect.js:445` — 반환 필드는
  `resolutionFields()` 한 곳에서만 조립한다
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js`

### Task 2: dep-check — 라벨과 표에서 보이게 한다

- **Action**: `impeccableLabel()`이 eclipsed가 비어 있지 않을 때 접미를 붙인다
  (예: `available (project v3.5.0, impeccable) · +1 eclipsed`). CLI printer는
  `impeccable skill` 행 아래에 eclipsed 소스를 한 줄씩 들여쓰기로 출력하되, 값은
  전부 `safeLabel`을 통과시킨다 — SKILL.md frontmatter는 사용자가 설치한 파일이고
  이 값이 터미널에 도달한다. `checkAll()`의 JSON은 `impeccable` 키가 새 필드를 갖는
  상위집합이 될 뿐 키 추가·삭제가 없다.
- **Mirror**: `plugins/mccp/scripts/lib/dep-check.js:148` — 라벨 조립과 소독 지점
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/dep-check.test.js`

### Task 3: SessionStart — missing이 아닌 정보성 1행

- **Action**: dep-check 블록에서 `result.impeccable.eclipsed`가 비어 있지 않으면
  **별도 문장**을 배너에 추가한다. `missing` 배열에는 넣지 않는다 — 섀도잉은 누락이
  아니고, M2가 방금 닫은 오탐 배너를 다시 여는 셈이 된다. 문구는 무엇이 열리고
  무엇이 안 열리는지를 말하고 `/mccp:setup`이 정리할 수 있음을 알린다. 기존 24시간
  dedupe 상태(`dep_check_missing`)는 **손대지 않고**, eclipsed 문장은 같은 dep-check
  호출 결과를 재사용해 추가 probe 없이 만든다. `MCCP_CODEX_DISABLED=1` 침묵 규칙은
  그대로 적용된다.
- **Mirror**: `plugins/mccp/scripts/hooks/session-start.js:1101` — 배너 문자열 조립과
  `additionalContextParts` 주입 경로
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/dep-check.test.js` — 배너
  문장 조립을 순수 함수로 분리해 eclipsed 유무 두 경우를 단언한다

### Task 4: 정리 오라클 — 무엇을 지울 수 있는지는 코드가 정한다

- **Action**: `impeccable-cleanup.js`에 `plan`(읽기 전용 JSON)과
  `apply --source <project|user> --confirm`을 만든다. 거부 규칙은 전부 코드에 있다:
  (1) 승자 소스는 **절대** 지우지 않는다.
  (2) plugin 소스는 대상이 아니다 — plugin 제거는 `claude plugin uninstall`의 일이고
  cache 디렉토리를 지우는 것은 레지스트리와 디스크를 어긋나게 한다.
  (3) 대상 경로가 well-known 위치와 정확히 일치해야 하고 심볼릭 링크면 거부한다.
  (4) `--confirm` 없이는 아무것도 지우지 않는다. `--dry-run`은 계획만 낸다.
  (5) git repo 안의 tracked 대상은 `git rm -r`로 지워 index에 남긴다 — 리뷰와
  되돌리기가 가능해진다. untracked면 디렉토리 재귀 삭제. **커밋하지 않는다.**
  (6) **`shadowed === true`면 제거 가능한 소스가 하나도 없다.** `plan`은
  `removable: []` + `reason: 'ambiguous-winner'`를 내고 `apply`는 어떤 `--source`에도
  거부한다. 규칙 (1)은 "승자를 지우지 않는다"인데 승자가 `null`인 상태에서는 그 검사가
  **판정 불가**이므로, 그 자리에서 통과시키면 게이트가 열려 있는 본문을 지울 수 있다.
  모르면 아무것도 지우지 않는 쪽이 UI6이고, 사용자에게는 경로를 보여 스스로 고르게
  한다. 이 규칙은 test로 고정한다 — bare 소스 2개 fixture에서 `apply --source project`
  와 `--source user`가 **둘 다** 거부되고 디스크가 무변경이어야 한다.
- **Mirror**: `plugins/mccp/scripts/lib/gitignore-provision.js:1` — `--json` ·
  `--dry-run` · `{ok, action}` 반환형과 이미 tracked인 것은 보고만 하는 관례
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-cleanup.test.js`

### Task 5: setup Phase 3.5 — 승인을 받아 제안한다

- **Action**: `setup.md`에 Phase 3.5를 추가한다. eclipsed가 있거나 `shadowed`가
  참일 때 발화하되 **두 경우의 화면이 다르다.**
  - `eclipsed.length > 0` (승자가 정해진 경우): 모든 소스를 버전·경로와 함께 출력하고
    어느 것이 열리는지 표시한 뒤 `AskUserQuestion`을 **한 번** 쓴다 —
    `Remove the eclipsed copy` / `Keep both (Recommended)` / `Show paths only`.
    선택 시 `impeccable-cleanup.js apply --confirm`을 부르고, 그 뒤 dep-check를 다시
    돌려 새 상태를 출력한다(3.3과 같은 규칙).
  - `shadowed === true` (승자 미상): **제거 선택지를 보이지 않는다.** 소스 경로를
    출력하고 어느 본문이 열리는지 mccp가 알지 못한다고 말한 뒤, 사용자가 직접 하나를
    고르도록 남긴다. 이 화면에 `Remove` 선택지를 두면 Task 4의 규칙 (6)이 거부할 행동을
    권하는 셈이고, 규칙 (6)이 없었다면 열려 있는 본문을 지웠을 것이다.
  `--dry-run`이면 어느 분기든 `plan`만 부른다. Phase 3.1의 "shadowed는 M3 소관"
  문장을 이 Phase를 가리키도록 정정하고, 3.4의 "Rewiring the call sites is M3's work"
  문장도 완료형으로 고친다.
- **Mirror**: `plugins/mccp/commands/setup.md:178` — 결과를 부드럽게 말하지 않고
  그대로 말한 뒤 다음 행동을 사용자에게 남기는 3.4의 어조
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` —
  setup 본문에 Phase 3.5 앵커와 `impeccable-cleanup.js` 참조가 있는지 단언한다

### Task 6: 호출부 재배선 — 부르는 이름을 오라클이 정한다

- **Action**: 실제로 impeccable을 호출하는 4개 본문(`plan.md` · `prp-implement.md` ·
  `pr.md` · `code-review.md`)에서 detect 블록이 `impeccable_invocation`을 뽑아
  `IMPECCABLE_INVOCATION` 변수에 담고, **stderr로 리터럴 호출형을 출력한다**. 셸
  상태는 도구 호출을 건너 살아남지 않으므로 LLM이 읽는 것은 변수가 아니라 그 출력
  줄이며, 산문에 그 사실을 명시한다. 호출 지시는 bare 리터럴에서 "위 블록이 출력한
  이름을 그대로 쓴다"로 바꾼다. alias 2개(`prp-pr.md` · `review-pr.md`)의 서술도 같은
  형태로 정정한다. `plan-prd.md`는 impeccable을 **호출하지 않으므로** 재배선 대상이
  아니다.
  `impeccable-guard.test.js`의 "Skill(impeccable, ...) invocation appears in every
  canonical command"는 그대로 두면 재배선을 금지하게 되므로 교체한다: 호출하는 4개
  본문에 대해 (i) `IMPECCABLE_INVOCATION` 추출이 있고 (ii) 하드코딩된 조작용 bare
  리터럴이 없음을 단언한다. `plan-prd.md`에는 detect 참조 단언만 남긴다 — 그 파일이
  지금 이 test를 통과하는 근거는 impeccable을 부르지 않는다고 적은 산문 한 줄이라,
  단언이 애초에 참을 검사하고 있지 않았다.
  **단일 커밋 불변식에 기계적 앵커를 붙인다.** 같은 test에 짝 단언을 하나 더 둔다 —
  *이 저장소에 bare 소스(`.claude/skills/impeccable/SKILL.md`)가 존재하는 것과 명령
  본문이 bare 리터럴을 하드코딩하는 것은 **같은 값이어야 한다.*** 두 축이 어긋나면
  red다. 이것이 Task 7만 먼저 착지하는 경우(사본은 사라졌는데 본문은 bare를 부른다 →
  전 게이트 `unknown_skill`)를 커밋 시점에 잡는다. 반대 순서(Task 6만 착지)는 실제로는
  무해하다 — bare project 소스가 여전히 승자이므로 해소된 invocation이 `impeccable`
  그대로이고 동작이 오늘과 같다. 위험한 것은 한 방향뿐이라는 사실이 이 단언의 형태를
  정한다.
- **Mirror**: `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js:81` — 본문
  리터럴을 test로 고정해 배선 drift를 붉게 만드는 형태
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-guard.test.js`

### Task 7: 이 저장소의 3.5.0 사본 제거 — Task 6과 단일 커밋

- **Action**: tracked 79 파일을 `git rm -r`로 제거한다. **Task 6과 같은 커밋이어야
  한다** — 재배선 없이 지우면 bare 소스가 사라져 모든 게이트의 impeccable 호출이
  `unknown_skill`로 떨어지고, 지우지 않은 채 재배선만 하면 이 저장소는 여전히 3.5.0을
  연다. 딸려오는 비용은 `docs/environment/external.md`의 링크 앵커 **5곳**(실측:
  459 · 491 · 599 · 631 · 843행)이다. 이들을 링크에서 풀어 파일명과 행 번호를 코드
  텍스트로 남기고, 해당 절 머리에 "행 번호는 3.5.0 기준으로 측정됐고 이 저장소는 더
  이상 impeccable 본문을 벤더하지 않는다"를 한 줄 적는다. cache 경로로 다시 링크하지
  않는다 — 머신과 버전에 묶인 경로라 다음 사용자에게 거짓이 된다.
- **Mirror**: `docs/environment/external.md:459` — 현재 앵커 형태
- **Validate**: `node plugins/mccp/scripts/lib/impeccable-detect.js resolve --json`이
  source plugin · invocation `impeccable:impeccable` · 빈 eclipsed를 내고,
  `grep -c "\.claude/skills/impeccable" docs/environment/external.md`가 0이며,
  `git status --short`가 79건 삭제를 보인다

### Task 8: 문서 · version · CHANGELOG · PRD

- **Action**: CLAUDE.md §3.17에서 "M3가 지우기 전에 재배선해야 한다"를 완료 서술로
  바꾸고 상주시킬 불변식 둘을 추가한다 — (1) eclipsed는 열거만 하고 버전을 비교하지
  않는다, (2) 정리는 승자와 plugin 소스를 절대 건드리지 않는다.
  `docs/gate-design.md`의 `## impeccable-detection`에 M3 절을 더해 소스 표·거부
  규칙·주장하지 않는 것을 소유시킨다. PRD의 milestone 3 행을 complete와 plan 경로로
  바꾸고, Open Questions 1번(프로젝트 로컬 해소 순서)과 2번(도구 권한)을 Task 0 측정
  결과로 닫는다. version은 1.31.2 다음 자리인 **1.31.3**이다(PRD 내 단일 milestone이라
  patch). 4면 동기 대상은 plugin.json · renderer html page-foot · renderer markdown
  derived 줄 · CHANGELOG의 currently 노트다. **PR 진입 직전에 version을 한 번 더
  재계산한다** (§3.7 실측 4회 재발).
- **Mirror**: `CHANGELOG.md:8` — 직전 항목의 §3.7 충돌 점검 서술 형식
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

### Task 9: 라이브 완주 1회 — 단위 test 통과는 경로 작동이 아니다

- **Action**: 재배선과 제거가 끝난 뒤 디자인 축이 실제로 발화하는 게이트를 1회
  완주시키고, 그 회차에 plugin 채널 invocation이 열렸다는 증거와 receipt의
  `impeccable_skipped`가 참이 **아니라는** 사실을 노트에 남긴다. `MCCP_IMPECCABLE_SKILL`
  과 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` 없이 완주해야 한다(UI1). 완주하지 못하면 그
  사실과 원인을 그대로 적는다 — 통과했다고 적지 않는다.
- **Mirror**: `.claude/notes/impeccable-detection-contract-m2.md` — 게이트 산출물과
  라이브 증거를 plan 본문이 아니라 노트에 남기는 관례
- **Validate**: `.claude/notes/impeccable-detection-contract-m3.md`에 완주 회차의
  명령 · 관측된 invocation · receipt 경로가 적혀 있다

## Validation

```bash
node --test plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js
node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js
node --test plugins/mccp/scripts/lib/tests/impeccable-guard.test.js
node --test plugins/mccp/scripts/lib/tests/impeccable-cleanup.test.js
node --test plugins/mccp/scripts/lib/tests/dep-check.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
node plugins/mccp/scripts/lib/impeccable-detect.js resolve --json
node plugins/mccp/scripts/lib/dep-check.js
node plugins/mccp/scripts/lib/impeccable-cleanup.js plan --json
node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
grep -c "\.claude/skills/impeccable" docs/environment/external.md
test -f .claude/notes/impeccable-detection-contract-m3.md
```

마지막 줄은 형식적 확인이 아니다. Task 0의 판정이 Task 6·7의 진행 여부를 정하는데,
노트가 없으면 그 분기가 무엇이었는지 사후에 확인할 수단이 사라진다 — Acceptance의
분기 항목이 반증 불가능해진다.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 재배선의 표적이 실제로는 안 열린다 | 낮음 | Task 0 (a)가 지우기 전에 관측한다. 실패면 Task 6·7 중단 |
| plugin 채널에서 도구 권한 프롬프트가 떠 비대화형 게이트가 멎는다 | 중 | Task 0 (b). 뜨면 UI10대로 권한 축 추가, 그래도 안 되면 사본 제거만 이연 |
| 제거만 먼저 착지해 중간 커밋에서 전 게이트가 `unknown_skill`이 된다 | 중 | guard test의 짝 단언이 사본 존재와 bare 하드코딩을 같은 값으로 강제해 커밋 시점에 red가 된다. 반대 순서(재배선만 착지)는 bare project 소스가 여전히 승자라 무해하다 |
| `shadowed:true`에서 정리가 열려 있는 본문을 지운다 | 중 | Task 4 규칙 (6) — 승자가 `null`이면 어떤 소스도 제거 불가. Task 5의 그 분기는 제거 선택지를 아예 보이지 않는다 |
| Task 7이 이연되는데 milestone은 완료로 선언된다 | 중 | Task 0 분기가 부분 착지 시 `in-progress` 유지를 명시하고 Acceptance가 두 갈래로 나뉜다 |
| 셸 변수가 도구 호출을 못 넘어 LLM이 이름을 추정한다 | 높음 | 변수가 아니라 stderr 출력 줄을 읽게 한다. 산문에 그 이유를 적는다 |
| 정리 오라클이 승자나 plugin cache를 지운다 | 낮음 | 거부 규칙을 코드에 두고 test로 고정한다. 산문 규칙에 의존하지 않는다 |
| 문서 링크 5곳이 깨진 채 남는다 | 중 | Task 7의 Validate가 grep 0을 요구한다 |
| eclipsed 배너가 새 노이즈가 된다 | 중 | missing 배열과 분리하고 기존 24시간 dedupe 경로를 재사용한다. 새 probe 없음 |
| 버전 비교를 넣고 싶어진다 | 중 | UI6 — 비교하지 않는다. 값만 싣고 판단은 사람이 한다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)
- [ ] Task 0의 두 측정이 원시 출력과 함께 노트에 기록되고, Task 6·7 진행 여부를 그 결과가 정했다
- [ ] bare 소스 2개 fixture에서 `apply`가 `--source project`·`--source user` 양쪽 모두 거부하고 디스크가 무변경이다 (Task 4 규칙 6)

아래 넷은 **Task 6·7이 착지한 경우에만** 적용된다. Task 0의 판정으로 둘 중 하나라도
이연했다면 이 항목들은 만족 대상이 아니며, 대신 milestone 3을 `in-progress`로 두고
이연 사유를 PRD Open Questions에 남긴 것을 확인한다.

- [ ] resolve CLI가 이 저장소에서 source plugin · invocation `impeccable:impeccable` · 빈 eclipsed를 낸다
- [ ] `git log -1 --stat`이 재배선(명령 본문)과 사본 제거(79 파일 삭제)를 **같은 커밋**에 보인다
- [ ] guard test의 짝 단언(사본 존재 ↔ bare 리터럴 하드코딩)이 green이다
- [ ] `MCCP_IMPECCABLE_SKILL`과 `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` 없이 디자인 축이 발화한 receipt가 1건 존재한다

## Design Critique

- 트리거: `impeccable-detect.js detect --mode plan` → `skill_available=true` · `design_signal=true`
  (whitelist 축 b — Files to Change가 `impeccable-detect.js` · `renderer/html.js` ·
  `renderer/markdown.js`를 건드린다)
- 해소된 본문: source `project` v3.5.0, invocation `impeccable` (plugin v4.1.1은 열리지
  않음 — 이 회차 자체가 M3가 닫으려는 상태의 실측이다)
- Assessment A (design review) → Assessment B (`detect.mjs`) 순차 fallback. 서브에이전트
  미사용, reference/critique.md가 허용하는 경로
- Assessment B 원시 출력: `[]` (detector finding 0건)
- 라운드: 1 (round 0/cap 2) · verdict: **CONVERGED**
- 미흡수 finding 2건 (§3.14 — HIGH/CRITICAL 아님, backlog 이연):
  | Severity | Finding | 왜 흡수하지 않는가 |
  |---|---|---|
  | LOW | `## Files to Change`·`## Tasks`가 list-of-N top-3 상한을 따르지 않음 | plan 본문은 viewport가 아니라 파서 입력이다. `plan-review/l1-check.js:278`이 그 표를 행 단위로 읽으므로 `<details>` 래핑은 C2·C3 검사와 cross-gate dedupe 리터럴 매칭을 함께 깨뜨린다 |
  | MEDIUM | 산문 전반에 em dash 사용 | impeccable의 copy 규칙은 product UI copy 대상이고, mccp가 실제로 강제하는 4개 anchor에 없다. 이 저장소의 한국어 산문 관례가 그것이며 CLAUDE.md 자신이 같은 표기를 쓴다 |

## Design Routing Guide

routing mode: auto (implement 단계에서 유효). 여기서는 체크리스트일 뿐 plan 단계는
아무 명령도 호출하지 않는다.

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

## Plan Review Absorption (L2 R1)

L2 패널 R1 (`sha256:ebcde559…`, coverage 3/4): architect `pass` · test `fail` ·
invariant `fail` · security는 structured output 미산출. §3.14대로 CRITICAL·HIGH만
그 자리에서 처리했다.

| # | Severity (리뷰어) | 판정 | 처리 |
|---|---|---|---|
| INV-1 | CRITICAL | **실재** | Task 1 규칙 (1) 문구 · Task 4 규칙 (6) 신설 · Task 5 shadowed 분기 분리. `shadowed:true`면 승자가 `null`이라 "승자를 지우지 않는다"가 판정 불가인데, Phase 3.5가 그 상태에서도 제거 선택지를 보이고 있었다 |
| INV-2 | CRITICAL → **HIGH** | 서술된 실패 모드는 **기각**, 부족한 앵커는 실재 | 리뷰어는 "Task 6만 커밋 → 존재하지 않는 invocation 호출"이라 했으나 거짓이다. Task 6만 착지해도 bare project 소스가 여전히 승자이므로 해소된 이름은 `impeccable` 그대로다(근거: `plugins/mccp/scripts/lib/impeccable-detect.js:371` — bare가 승자를 정한다). 위험한 순서는 반대쪽 하나뿐이고, 그 사실이 Task 6에 새로 넣은 짝 단언의 형태를 정했다 |
| INV-3 | HIGH | 부분 실재 | Task 0의 (a)는 harness의 skill 해소 사건이라 스크립트가 관측할 수 없어 코드 게이트로 만들 수 없다. 대신 강제가 결과 쪽(Task 7 Validate · Task 9 receipt)에 있다는 것을 Task 0에 명시하고, 노트 파일 존재 확인을 `## Validation`에 넣었다 |
| INV-4 | HIGH | **실재** | 부분 착지 시 milestone을 `complete`로 올리지 않는다는 규칙을 Task 0에 넣고 `## Acceptance`를 두 갈래로 나눴다 |
| TEST-1 | MEDIUM | 실재 | INV-4와 같은 결함의 다른 얼굴이라 함께 처리됐다 |
| TEST-3 | LOW | 실재 | INV-3과 함께 처리 (`## Validation`에 노트 파일 확인 추가) |
| TEST-4 | LOW | 실재 | INV-1이 `eclipsed` 계약을 바꿔 단언이 load-bearing이 됐으므로 Task 1에 4개 단언을 열거했다 |
| TEST-2 | MEDIUM | 실재, **이연** | Task 6이 명령 본문에 들어갈 산문 원문을 보이지 않아 LLM 지시의 명료성이 반증 불가라는 지적. 산문 원문은 구현 산출물이고 plan은 계약을 정한다 — backlog로 이연 |

security 관점이 이 라운드에 결과를 내지 못했다(agent가 StructuredOutput을 호출하지
않음). 남는 공백은 R2 패널이 같은 4관점으로 다시 덮는다.
