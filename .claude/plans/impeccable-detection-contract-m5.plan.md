# Plan: impeccable 탐지 계약 — M5 문서·계약 드리프트 정리

**Source PRD**: .claude/prds/impeccable-detection-contract.prd.md
**Selected Milestone**: 5 — 문서·계약 드리프트 정리
**Complexity**: Medium

## Summary

M1~M4는 탐지를 정직하게 만들고(M1), 판정 권한을 일원화하고(M2), 이름을 바로잡고(M3),
발화를 정합화했다(M4). 남은 것은 **그 사실들을 적어 둔 곳**이다. 환경변수 계약은
`IMPECCABLE_*` 19종의 소비처를 mccp가 읽지도 않는 한 줄(`impeccable-detect.js:135`)로
일괄 귀속하고 있고, `MCCP_IMPECCABLE_SKILL` 하나를 두고 코드(`:319`) · 레지스트리(`:301`) ·
문서(`:135`)가 **서로 다른 세 답**을 갖는다. 계약 자신의 lint는 이것을 볼 수 없다 —
L8은 evidence의 파일 존재와 행 범위만 검사하고 "그 행에 그 이름이 있는가"는 묻지 않는다.

M5는 impeccable 축의 드리프트 23건을 고치고, **같은 드리프트가 다시 조용히 생길 수 없게**
그 질문을 lint에 넣는다. 남는 비-impeccable 드리프트 28건은 지우지 않고 **이름째로 열거**해
소유 축과 함께 남긴다 — 다른 축의 부채를 이 사이클이 대신 갚지 않으면서, 새 드리프트만
붉어지게 하는 유일한 방법이다.

## User Intent

<!-- USER-STATED constraints only. 출처는 PRD 본문이며, PRD footer가 사용자 답변으로
     귀속한 절(Problem · Users · Hypothesis 제약 · MVP 경계 · CLI 대우 · 섀도잉 처리
     강도 · 구버전 사본 거취)과 Out of scope · Delivery Milestones 각주에서 뽑았다.
     저자 정당화는 ## Design Decisions 로 간다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 공식 채널로 default 설치한 사용자에게 env 설정을 요구하는 것은 의도된 사용법이 아니라 결함이다 | constraint |
| UI2 | env 우회는 외부에 따로 설치한 경우를 위한 장치다 | constraint |
| UI3 | 기존 npm CLI 3.x 사용자는 강제 마이그레이션 대상이 아니며 계속 동작해야 한다 | constraint |
| UI4 | impeccable을 쓰지 않는 사용자에게 없는 도구를 설치하라고 압박하지 않는다 | constraint |
| UI5 | 어느 채널도 공식적으로 폐기되지 않았으므로 강제 마이그레이션은 배제한다 | exclusion |
| UI6 | 라우팅 카탈로그의 명령 추가와 삭제는 범위 밖이다 | exclusion |
| UI7 | a11y-architect 자동 발화는 이 계약과 독립이므로 건드리지 않는다 | exclusion |
| UI8 | 게이트 lenient strict 비대칭 재설계는 범위 밖이다 | exclusion |
| UI9 | impeccable 자체의 결함은 별개 축이다 | exclusion |
| UI10 | Node 하한 상향 결정은 미해결 질문으로 남긴다 | exclusion |
| UI11 | impeccable 4.x가 도입한 프로토콜 채택은 범위 밖이다 | exclusion |
| UI12 | 이미 커밋된 design.json은 tracked로 남기며 자동 untrack하지 않는다 | direction |
| UI13 | M5는 게이트를 막지 않는다 | direction |
| UI14 | 추정하지 않고 열거하며 모르면 모른다고 보고한다 | direction |

## Design Decisions

### DD1 — `evidence` 계약이 이 19종에 대해 **만족 불가능**하다는 것이 근인이다

`registry.js:30-32`가 `evidence`를 "이 토글을 **실제로 읽는 지점**의 `path:line`"으로
정의한다. 그런데 `IMPECCABLE_VERSION` · `IMPECCABLE_UPDATE_HOST` 등 19종은 impeccable
자신의 스크립트가 읽는 변수이고, mccp 저장소에는 read site가 **존재하지 않는다**(M3가
벤더 사본을 지웠으므로 impeccable 본문을 가리킬 수도 없다). 그래서 과거 누군가가 필드를
비울 수 없어 `impeccable-detect.js:135` 한 줄을 19번 적었다. 부주의가 아니라 **표현할 수
없는 사실을 표현하라고 요구한 스키마**가 만든 결과다.

따라서 고침은 "옳은 행을 찾는 것"이 아니다 — 옳은 행이 없다. `status`에
`'not-consumed'`를 추가해 그 사실을 **말할 수 있게** 만들고, evidence는 그 주장을 검증할
수 있는 문서 앵커를 가리킨다. 선례가 이미 있다: `MCCP_PLAN_REVIEW_L1`이
`'absent-by-design'` + `docs/environment/retired.md:1`로 같은 형태를 쓴다(`registry.js:251`).

### DD2 — lint는 **이름이 그 행에 있는가**를 묻는다. 파일 존재는 이미 L8이 묻는다

L8은 evidence가 repo-relative이고 파일이 있고 행이 범위 안인지만 본다. 그 셋을 전부
통과하면서 `impeccable-detect.js:135`가 `isDesignSurfacePath()` 내부를 가리킬 수 있다 —
실측이 그렇다. L10은 한 질문만 더한다: **그 행 근처에 그 이름이 있는가.**

`not-consumed`는 반대 방향으로 검사한다 — evidence가 `docs/environment/*.md`를 가리켜야
하고, **런타임 표면에 그 이름이 없어야 한다**. "mccp는 이것을 읽지 않는다"가 주장이므로,
읽기 시작하면 붉어져야 한다. 두 방향이 함께 있어야 status가 도피처가 되지 않는다.

### DD3 — 남는 28건은 지우지 않고 **이름째로** 남긴다

repo 전체에 L10을 걸면 impeccable 축을 다 고쳐도 28건이 붉다(비-impeccable B-class 24 +
C-class 4). 그것들은 다른 축의 부채이고, 이 사이클이 대신 갚으면 M5는 자기가 검증할 수
없는 파일들을 만지게 된다. 그렇다고 L10을 보고 전용으로 내리면 §3.16이 경계하는 "막을 수
없는 계측"이 된다.

그래서 **열거된 `EVIDENCE_DEBT`** 를 둔다 — 28개 이름과 소유 축을 적고, 목록에 있는 것만
통과시킨다. 새 드리프트는 즉시 붉고, **고쳐졌는데 목록에 남아 있으면 그것도 붉다**(래칫이
줄어들기만 하도록). 숫자 상한이 아니라 이름 목록인 이유는 숫자가 신원을 감추기 때문이다 —
하나 고치고 하나 깨뜨리면 숫자는 그대로다.

목록에 `IMPECCABLE_*` · `MCCP_IMPECCABLE_*`이 **하나도 없다**는 것을 test가 단언한다.
이 축을 예외로 밀어 넣고 통과시키는 경로를 구조적으로 막는다.

### DD4 — 보존된 원문은 지우지 않고 **정정을 붙인다**

`docs/environment/external.md`의 "v1.29.0 원문" 블록은 색인 축약 이전 서술의 아카이브다. 그 안의
`IMPECCABLE_VERSION`이 "`/mccp:setup` dep-check가 fallback hint로 honor"한다는 문장은
거짓이다(실측: `plugins/mccp/scripts/` 전체에서 그 이름을 읽는 코드 0건). 아카이브를
고쳐 쓰면 아카이브가 아니게 되므로, 위에 정정 줄을 붙이는 형태를 쓴다 — CLAUDE.md가
§3.7에서 "v1.23.12 정정:" 으로 쓰는 것과 같은 형태다.

### DD5 — 이 milestone이 고치지 **않는** 것을 먼저 적는다

- 같은 `<사유를 한 문장으로>` 템플릿 오염이 `CLAUDE_PLUGIN_ROOT` · `CLAUDE_SESSION_ID` ·
  `CLAUDE_PID` · `CLAUDE_RULES_DIR` · `CLAUDE_PACKAGE_MANAGER` · `GITHUB_TOKEN` ·
  `CLV2_HOMUNCULUS_DIR` 7종에도 있다. `environment-doc-uniformity` 축 소유다.
- CLAUDE.md §3.16이 `MCCP_GATE_ROUND_CAP=1`을 "프로젝트 기본, 이미 settings.json에 설정"
  이라 적지만 `.claude/settings.json`의 실제 값은 `"3"`이다. 문서와 설정 중 어느 쪽을
  옮길지는 사용자 결정이라 **관측만 기록**하고 손대지 않는다.
- PRD Open Questions의 hook 이중 등록 · Node 하한 · `impeccable@anthropics` 출처는
  전부 미해결로 남는다(UI10 · 측정 미완).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| status 확장 | `plugins/mccp/scripts/lib/env-contract/registry.js:48-50` | `STATUSES`를 `Object.freeze` 배열로 두고 헤더 주석의 열거와 1:1 유지 |
| read site 없는 항목 | `plugins/mccp/scripts/lib/env-contract/registry.js:251` | `MCCP_PLAN_REVIEW_L1` — `absent-by-design` + 문서 앵커 evidence |
| lint 검사 추가 | `plugins/mccp/scripts/lib/env-contract/lint.js:379` (L8) | `problems[]` 누적 후 `checks.LN = fail(제목, problems)`; 빈 입력은 "vacuous pass"로 명시 실패 |
| 어휘 스크린 우선 | `plugins/mccp/scripts/lib/env-contract/lint.js:119` `evidenceLexicalProblem` | fs를 부르기 전에 형식부터 거른다 |
| 검사 범위 위임 | `plugins/mccp/scripts/lib/env-contract/scan.js:82` | 자체 walk를 갖지 않고 `scan.walkSurfaces`를 부른다 — drift가 "갈라졌다"가 아니라 "안 불렀다"가 되게 |
| 도달불가 고정 | `plugins/mccp/scripts/lib/tests/impeccable-cleanup.test.js` (M3 `rules 1+2 jointly`) | "이 오라클이 만들 수 있는 어떤 구성도 X를 만들지 못한다"를 test로 고정 |
| 짝 단언 | `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` (M3) | 두 표면이 **같은 값**이어야 한다는 쌍방 단언 |
| 문서 정정 표기 | `CLAUDE.md` §3.7 "v1.23.12 정정:" | 원문을 지우지 않고 정정 줄을 덧붙인다 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/notes/impeccable-detection-contract-m5.md` | CREATE | 착수 전 실측(51건 드리프트의 A/B/C 분해 · 세 표면 불일치) 기록 |
| `plugins/mccp/scripts/lib/env-contract/measure-evidence.js` | CREATE | A/B/C 분해 재측정 스크립트 — 노트의 수치를 재현 가능하게 (검증 V3가 호출) |
| `plugins/mccp/scripts/lib/env-contract/registry.js` | UPDATE | `not-consumed` status 추가 · impeccable 축 23건 evidence 정정 · `MCCP_IMPECCABLE_SKILL` kind enum화 · `MCCP_PLAN_REVIEW_TEST_INVOKE` 등재 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | UPDATE | L10 신설 — evidence가 실제로 그 이름을 가리키는지 · `not-consumed` 역방향 검사 · `EVIDENCE_DEBT` 래칫 |
| `plugins/mccp/scripts/lib/env-contract/evidence-debt.js` | CREATE | 비-impeccable 잔여 28건의 이름 + 소유 축 (래칫 목록) |
| `plugins/mccp/scripts/lib/env-contract/tests/evidence-debt.test.js` | CREATE | 목록에 impeccable 축 0건 · 래칫 양방향(신규 red / 고쳐진 항목 잔존 red) · `not-consumed` 역방향 |
| `docs/environment/external.md` | UPDATE | impeccable 19종 블록 자기모순 해소 · `IMPECCABLE_VERSION` 거짓 주장 정정 + 죽은 링크 · 사용 예시 실값화 |
| `docs/environment/review.md` | UPDATE | `MCCP_IMPECCABLE_SKILL` 종류/값/소비처/사용 예시 정정 |
| `docs/ENVIRONMENT.md` | UPDATE | 색인의 `MCCP_IMPECCABLE_SKILL` 행 kind/values 동기 |
| `CLAUDE.md` | UPDATE | §1.1의 낡은 호출 형태 서술 정정 · §3.17에 M5 한 문단 |
| `docs/gate-design.md` | UPDATE | `#### 문서·계약 드리프트 정리 (M5)` |
| `CHANGELOG.md` | UPDATE | 새 버전 항목 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version bump (착수 직전 재계산 — §3.7) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (4면 중 2면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (4면 중 3면) |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATE | milestone 5 → complete + Plan 셀 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | DD5의 이연 3건 명시 기록 |

## Tasks

### Task 1: 착수 전 실측을 기록한다 — 무엇이 얼마나 어긋났는가

- **Action**: 먼저 `plugins/mccp/scripts/lib/env-contract/measure-evidence.js`를 만든다 —
  registry를 훑어 각 항목을 A/B/C로 분류하고 `--json`으로 내는 read-only 스크립트다.
  그 출력을 `.claude/notes/impeccable-detection-contract-m5.md`에 붙이고 아래를 함께 적는다.
  - **A/B/C 분해** (162개 registry 항목, 실측 2026-08-23):
    A = evidence 행 ±2 안에 이름이 있음 **111** · B = 같은 파일 다른 행 **28** ·
    C = 그 파일에 이름이 아예 없음 **23**. B와 C는 성질이 다르다 — B는 낡았고 C는 거짓이다.
  - **impeccable 축의 몫**: C 19건(전부 `impeccable-detect.js:135` 또는 `:256`) +
    B 4건(`MCCP_IMPECCABLE_ROUTING_MODE` 118→164 · `MCCP_IMPECCABLE_INTENT_COMMANDS`
    127→170 · `MCCP_IMPECCABLE_SKILL` 301→319 · `IMPECCABLE_FORCE_OVERRIDE_REASON`
    `plugins/mccp/commands/prp-implement.md` 224→437) = **23건**.
  - **세 표면 불일치 실측**: `MCCP_IMPECCABLE_SKILL`의 실제 read site는
    `impeccable-detect.js:319`, 레지스트리는 `:301`(주석 블록), `docs/environment/review.md`는
    `:135`(`isDesignSurfacePath()` 내부). **셋이 서로 다르다.**
  - **lint 맹점**: `lint.js:379-398`(L8)이 파일 존재 + 행 범위만 검사한다. 위 23건 전부
    L8을 통과한다(실측: L8 `ok`).
  - **문서 자기모순 실측**: `docs/environment/external.md`의 각 `IMPECCABLE_*` 절이 헤더(`**종류** 자유 문자열
    — **기본값** 없음)와 같은 절 안의 "v1.29.0 원문" 표(`URL` / `https://impeccable.style`)로
    **서로 반대되는 값**을 적는다. 예: `IMPECCABLE_UPDATE_HOST` (`docs/environment/external.md:340` vs `:367`).
  - **거짓 주장 1건**: `docs/environment/external.md:306-307`이 `IMPECCABLE_VERSION`을 "mccp의 `/mccp:setup`
    dep-check가 CLI 미설치 환경에서 fallback hint로 honor"한다고 적는다. 실측 grep 결과
    `plugins/mccp/scripts/` 전체에서 그 이름을 읽는 코드는 **0건**이며 registry 등재 행뿐이다.
    같은 줄의 링크 `../.claude/plans/mccp-setup-command.plan.md`도 **죽었다**(현재 위치
    `.claude/PRPs/plans/archived/mccp-setup-command.plan.md`).
  - **DD5의 관측 3건**(비-impeccable 템플릿 오염 7종 · §3.16 cap 문서·설정 불일치 ·
    `MCCP_PLAN_REVIEW_TEST_INVOKE` L1 red의 origin/main 귀속)을 **고치지 않는 것으로** 기록.
- **Mirror**: `.claude/notes/impeccable-detection-contract-m4.md`의 Task 1 관측 기록 형식.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/measure-evidence.js --json` 이
  노트에 적힌 A/B/C 수치와 일치.

### Task 2: 표현할 수 없던 사실에 자리를 준다 — `not-consumed` status

- **Action**:
  1. `registry.js`의 `STATUSES`에 `'not-consumed'`를 추가하고 헤더 주석의 열거(`:27-28`)도
     같이 갱신한다 — 둘은 1:1이어야 한다.
  2. 주석에 의미를 적는다: **"mccp가 읽지 않는 서드파티 변수. `evidence`는 read site가 아니라
     그 계약을 문서화한 앵커를 가리킨다"** + DD1의 근거(`registry.js:30-32`의 evidence 정의가
     이 부류에 만족 불가능하다는 것) + 선례(`:251` `MCCP_PLAN_REVIEW_L1`).
  3. 19종의 status를 `not-consumed`로 바꾸고 evidence를 각 변수의
     `docs/environment/external.md:<그 절의 헤딩 행>`으로 교체한다.
     - **주의**: `IMPECCABLE_LIVE_COPY_AGENT_MOCK_{RESULT,WRITES,DELAY_MS}` 3종은 현재
       `test-only`인데, 그것은 **impeccable의** test 훅이지 mccp의 것이 아니다. 같은
       `not-consumed`로 간다. mccp 소유 test 훅(`MCCP_IMPECCABLE_CLI_MOCK`,
       `impeccable-detect.js:603`)과 혼동하지 않는다.
     - **`IMPECCABLE_FORCE_OVERRIDE_REASON`은 제외한다** — 이것은 mccp가 실제로 읽는
       게이트 override다(`plugins/mccp/commands/prp-implement.md:437`). B-class로 Task 3에서 행만 고친다.
- **주의 — 이것이 만드는 부작용을 숨기지 않는다**: status가 바뀌면 lint L7("모든 non-retired
  토글 앵커가 유효한 사용 예시를 갖는다")의 대상 집합이 달라질 수 있다. L7이 status로
  분기하는지 먼저 읽고, 분기한다면 `not-consumed`를 어느 쪽에 넣을지 **명시적으로 결정**해
  주석에 남긴다. 조용히 대상에서 빠지면 19개 절의 사용 예시가 검사 밖으로 나간다.
- **Mirror**: `registry.js:48-50` `Object.freeze` 상수 + 헤더 주석 1:1 관례.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` 가 L1~L9 전부 `ok`.

### Task 3: impeccable 축 23건의 evidence를 실제 지점으로 옮긴다

- **Action**:
  1. B-class 4건의 행 번호를 실측값으로 교체한다 (Task 1에 기록된 4쌍).
  2. `MCCP_IMPECCABLE_SKILL`의 kind를 `'string'` → `'enum'`, values를
     `['available', 'missing']`으로 바꾼다. 근거는 `impeccable-detect.js:322-330` — 그 둘이
     아니면 **stderr WARNING을 내고 override를 버린다**. "impeccable skill 이름"이라는
     summary도 실제 의미(**탐지 결과 강제 override**)로 고친다. 이름을 넣으라는 설명대로
     쓰면 아무 일도 일어나지 않는다는 것이 F8의 지적이었다.
  3. `MCCP_PLAN_REVIEW_TEST_INVOKE`를 `test-only` / `review` 도메인으로 등재하고 evidence는
     `plugins/mccp/scripts/lib/plan-review/cli.js:538`로 둔다.
     - **이것은 impeccable 축이 아니다.** origin/main(`b111dca`, codex-intent-context M3)에서
       상속된 L1 red이고, 이 한 줄이 없으면 M5는 자기가 확장하는 lint를 green으로 검증할 수
       없다. 1행 등재이며 런타임 동작 변경 0이다. 축 밖임을 커밋 메시지와 노트에 명시한다.
       사용자가 원치 않으면 이 항목만 빼고 "L1 red는 상속분"으로 검증을 기술하면 된다.
- **Mirror**: 기존 registry 행 포맷(9열 배열) 그대로.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/measure-evidence.js --json` 에서
  impeccable 축 23건이 전부 A-class 또는 `not-consumed`.

### Task 4: 같은 드리프트가 다시 조용히 생길 수 없게 한다 — lint L10

- **Action**: `lint.js`에 L10을 추가한다.
  1. **정방향** — status ≠ `not-consumed`인 모든 항목: evidence의 `path:line` 기준 **±2행**
     창 안에 `e.name`이 문자열로 등장해야 한다. 창을 두는 이유는 markdown 명령 본문에서
     이름이 코드 펜스 바로 위 산문에 있는 정상 사례가 있기 때문이다 — 창 없이 정확 일치를
     요구하면 정상 항목이 붉어진다.
  2. **역방향** — status = `not-consumed`인 항목: evidence는 `docs/environment/` 하위
     `.md`를 가리켜야 하고, `scan.walkSurfaces(root)`가 걷는 런타임 표면에 `e.name`이
     **등장하지 않아야** 한다. "mccp는 이것을 읽지 않는다"가 주장이므로 읽기 시작하면 붉다.
  3. **래칫** — `evidence-debt.js`가 export하는 이름 집합만 정방향 실패를 면제한다. 추가로
     **목록에 있으나 실제로는 통과하는 이름**도 실패로 보고한다(래칫은 줄어들기만 한다).
  4. 빈 registry / 빈 debt 목록이 vacuous pass가 되지 않도록 L8·L9와 같은 형태의 가드를 둔다.
- **Action (별 파일)**: `evidence-debt.js`에 비-impeccable 잔여 28건을 이름과 소유 축 주석과
  함께 `Object.freeze`로 적는다. 파일 헤더에 **왜 목록인가**(DD3 — 숫자는 신원을 감춘다)와
  **어떻게 없어지는가**(각 축이 자기 항목을 고치고 목록에서 지운다)를 적는다.
- **주의**: L10은 registry 전체를 훑으므로 다른 축의 파일을 **고치지는 않지만 판정한다**.
  그것이 목적이다 — 다만 이 사이클이 그 28건을 고칠 책임을 지지 않는다는 것을
  `evidence-debt.js` 헤더에 명시한다.
- **Mirror**: `lint.js:379`(L8) 구조 · `scan.js:82` 범위 위임 계약.
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` → L1~L10 전부 `ok`.

### Task 5: 래칫이 실제로 물리는지 test로 고정한다

- **Action**: `tests/evidence-debt.test.js`를 만들고 넷을 단언한다.
  1. `EVIDENCE_DEBT`에 `^(MCCP_)?IMPECCABLE_` 에 매칭되는 이름이 **0건**이다 — 이 축을
     예외로 밀어 넣는 경로를 구조적으로 막는다.
  2. 신규 드리프트는 붉다: 임시 registry fixture에 잘못된 evidence 항목을 하나 넣으면 L10이
     실패한다.
  3. 고쳐진 항목이 목록에 남아 있으면 붉다: fixture에서 debt 항목 하나를 올바르게 만들면
     L10이 "목록에서 지워라"로 실패한다.
  4. `not-consumed` 역방향이 붉다: 런타임 표면에서 읽히는 이름에 `not-consumed`를 붙이면
     실패한다.
- **주의 — 이 test들은 어떤 CI도 돌리지 않는다**(§3.17이 M3에서 확인한 사실 —
  `.github/workflows/` 등재 test는 셋뿐). 강제 지점은 이 사이클의 `## Validation`이 돌리는
  로컬 test다. 노트에 그렇게 적고 "CI가 지킨다"고 쓰지 않는다.
- **Mirror**: `impeccable-cleanup.test.js`(M3)의 "이 오라클이 만들 수 있는 어떤 구성도" 형태.
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/`

### Task 6: 문서 세 면을 코드와 일치시킨다

- **Action**:
  1. `docs/environment/external.md` — `IMPECCABLE_*` 19개 절에서:
     - **소비처** 행을 `impeccable-detect.js:135`에서 "mccp는 이 변수를 읽지 않는다 —
       impeccable 본문이 읽는다. 어느 본문이 열리는지는
       `node plugins/mccp/scripts/lib/impeccable-detect.js resolve`" 로 바꾼다.
       (`:241-246`의 3.5.0 앵커 주석은 이미 M3가 넣었으므로 **유지**한다.)
     - **종류 / 값 / 기본값** 헤더를 같은 절의 "v1.29.0 원문" 표와 **일치**시킨다.
       두 값이 어긋나면 원문 쪽이 실측이므로 원문을 따른다.
     - **사용 예시**의 `<사유를 한 문장으로>`를 그 변수의 실제 값 형태로 바꾼다
       (`IMPECCABLE_UPDATE_HOST=https://impeccable.style` 등). 셸 예시의 `/mccp:pr` 꼬리도
       그 변수가 실제로 영향을 주는 지점이 아니므로 지우거나 impeccable 호출로 바꾼다.
     - `IMPECCABLE_VERSION` 절: 보존 블록은 **지우지 않고**, 그 위에 정정 줄을 붙인다 —
       "**정정**: 아래 보존 원문의 'dep-check가 fallback hint로 honor' 서술은 거짓이다
       (실측: `plugins/mccp/scripts/`에서 이 이름을 읽는 코드 0건). 링크된 plan은
       `.claude/PRPs/plans/archived/mccp-setup-command.plan.md`로 이동했다."
  2. `docs/environment/review.md` — `MCCP_IMPECCABLE_SKILL` 절의 종류를 `enum` / 값
     `available · missing`로, 소비처를 `impeccable-detect.js:319`로, 사용 예시를
     `"MCCP_IMPECCABLE_SKILL": "available"`로 고친다. UI1·UI2를 한 줄로 적는다 —
     **이 override는 외부에 따로 설치한 경우를 위한 장치이고, 공식 채널 설치자에게는
     필요하지 않다.**
  3. `docs/ENVIRONMENT.md` 색인의 해당 행을 `enum` / `available/missing`으로 동기.
- **주의**: 1의 세 하위 항목은 lint L2/L3/L7이 이미 검사하는 표면이다. 편집 후 lint를 다시
  돌려 앵커·색인 양방향이 깨지지 않았는지 확인한다.
- **Mirror**: 같은 파일의 절 중 이미 실값 예시를 가진 것
  (`IMPECCABLE_NO_UPDATE_CHECK`의 `"on"` — `docs/environment/external.md:327`).
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` L2·L3·L7 `ok`.

### Task 7: CLAUDE.md §1.1의 낡은 근거를 정정한다

- **Action**: §1.1(`CLAUDE.md:54`, `:57`)이 impeccable을 번들하지 않는 이유를 "mccp 본문이
  `Skill(impeccable, ...)`을 그대로 호출하므로"로 적는다. **v1.31.3(M3) 이후 거짓이다** —
  명령 본문의 bare 리터럴은 전부 제거됐고, 이름은 오라클이 내는 `impeccable_invocation`이
  나른다(§3.17). 실측: `plugins/mccp/`의 `Skill(impeccable` 7건은 전부 주석과 test이며
  **명령 본문 0건**이다.
  - 결론(번들하지 않는다)은 유지하되 근거를 정정한다: 벤더하면 namespace가 `mccp:impeccable`이
    되어 사용자가 설치한 채널과 **다른 본문**을 열게 되고, M3가 세운 "탐지가 지목한 본문과
    실제로 열리는 본문이 일치한다"는 계약이 깨진다.
  - §3.17 말미에 M5 한 문단을 더한다(상세는 gate-design 소유 — §1.4의 "이 파일을 줄일 때"
    규약에 따라 짧게).
- **주의**: §1.1은 `instruction-contract/lint.js`가 감시하는 상주 표면이다. 절을 **옮기지**
  않고 문장만 고치므로 ledger 갱신은 불필요하지만, 편집 후 그 lint를 돌려 확인한다.
- **Mirror**: `CLAUDE.md` §3.7의 "v1.23.12 정정:" 표기.
- **Validate**: `node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md`

### Task 8: 릴리스 표면을 동기화하고 이연을 기록한다

- **Action**:
  1. `docs/gate-design.md`의 `### impeccable-detection` 아래에
     `#### 문서·계약 드리프트 정리 (M5)` — DD1~DD4와 A/B/C 수치, `not-consumed`의 의미,
     래칫의 축소 규칙.
  2. `CHANGELOG.md`에 새 버전 항목.
  3. **version은 착수 직전에 재계산한다**(§3.7 — 병렬 브랜치 충돌이 실측 4회 재발). 현재
     로컬 1.31.4 · origin/main 1.31.0. `plugin.json` · `renderer/html.js` page-foot ·
     `renderer/markdown.js` derived 줄 · `CHANGELOG.md` **4면**을 같은 값으로 맞춘다.
  4. PRD의 milestone 5를 `complete` + Plan 셀에 이 파일 경로.
  5. `codex-findings-backlog.md`에 DD5의 3건을 이연으로 append (비-impeccable 템플릿 오염
     7종 · §3.16 cap 문서/설정 불일치 · `EVIDENCE_DEBT` 28건의 축별 소유).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# V1 — 환경변수 계약 lint 전체 (L1~L10)
node plugins/mccp/scripts/lib/env-contract/lint.js

# V2 — 래칫 + not-consumed 역방향 test
node --test plugins/mccp/scripts/lib/env-contract/tests/

# V3 — impeccable 축 드리프트 재측정 (Task 1이 만든 스크립트)
#      기대: impeccable 축 23건이 전부 A-class 또는 not-consumed
node plugins/mccp/scripts/lib/env-contract/measure-evidence.js --json

# V4 — 탐지 오라클 회귀 (M1~M4가 세운 계약이 안 깨졌는지)
node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js \
            plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js \
            plugins/mccp/scripts/lib/tests/impeccable-guard.test.js \
            plugins/mccp/scripts/lib/tests/impeccable-routing.test.js \
            plugins/mccp/scripts/lib/tests/impeccable-cleanup.test.js

# V5 — 상주 instruction 계약 (CLAUDE.md 편집 후)
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# V6 — 4면 version 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# V7 — 진단 명령이 여전히 응답하는지 (문서가 권하는 경로)
node plugins/mccp/scripts/lib/impeccable-detect.js resolve --json
node plugins/mccp/scripts/lib/dep-check.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| L10을 걸면 다른 축 28건이 붉어져 이 사이클이 남의 부채를 갚게 된다 | **높음** — 실측 확인 | `EVIDENCE_DEBT` 래칫으로 이름째 면제. 목록에 impeccable 축 0건임을 test가 단언 |
| ±2행 창이 너무 좁아 정상 항목이 붉어진다 | 중 | 착수 시 전 항목에 대해 창 크기를 실측하고, 창을 넓히는 대신 **evidence를 고치는 쪽**을 기본으로 한다. 창을 넓혀야만 통과하는 항목은 debt 목록으로 |
| `not-consumed`가 L7(사용 예시) 대상에서 조용히 빠져 19개 절이 검사 밖으로 나간다 | 중 | Task 2의 명시 주의 항목. 분기 여부를 먼저 읽고 결정을 주석에 남긴다 |
| 보존된 "v1.29.0 원문"을 고치면 아카이브가 아니게 된다 | 중 | 지우지 않고 정정 줄을 위에 붙인다(DD4) |
| version이 병렬 브랜치와 충돌한다 | **높음** — 실측 4회 | 착수 직전과 `/mccp:pr` 직전 **두 번** 재계산(§3.7) |
| `MCCP_PLAN_REVIEW_TEST_INVOKE` 등재가 축 밖이라는 지적을 받는다 | 중 | 1행·런타임 무변경이며 이유(자기 lint 검증 불가)를 명시. 빼면 검증 기술을 "L1 red는 상속분"으로 낮춘다 |
| 설치된 plugin cache가 1.31.0(pre-M1)이라 `${CLAUDE_PLUGIN_ROOT}` 경유 호출이 옛 술어로 돈다 | **높음** — 실측 | 검증은 전부 worktree 경로로 직접 실행한다. 머지 후 `claude plugin update` 필요를 노트에 남긴다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 (단위 test 통과 ≠ 경로 작동)

마지막 항목의 구체 기준 — 라이브 1회로 아래를 **산출물로** 확인한다.

1. `node plugins/mccp/scripts/lib/env-contract/lint.js`가 **L1~L10 전부 `ok`** 로 끝나고,
   그 출력을 노트에 그대로 붙인다. (착수 시점 실측은 L1 `FAIL` + L8 `ok`이며, L8의 `ok`가
   바로 이 milestone이 닫는 맹점이다.)
2. `EVIDENCE_DEBT`에서 이름 하나를 **일부러 지우고** lint를 돌려 그 항목이 붉어지는 것을
   확인한 뒤 되돌린다 — 래칫이 장식이 아님을 실행으로 보인다.
3. lint 통과 상태에서 `node plugins/mccp/scripts/lib/impeccable-detect.js resolve --json`의
   `invocation` · `source` · `path`와 `docs/environment/review.md`의 `MCCP_IMPECCABLE_SKILL`
   절 서술이 **모순되지 않음**을 대조하고 결과를 노트에 적는다.
4. env 우회 없이(`MCCP_IMPECCABLE_SKILL` 미설정) 게이트가 정상 발화하는지 —
   이 사이클의 `/mccp:prp-implement` 실행 자체가 그 관측이다. receipt의
   `meta.impeccable_*` 필드를 노트에 인용한다(PRD Success Metrics 1행: env 우회 0건).
