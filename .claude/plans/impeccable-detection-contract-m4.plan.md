# Plan: impeccable 탐지 계약 — M4 게이트 발화 정합

**Source PRD**: .claude/prds/impeccable-detection-contract.prd.md
**Selected Milestone**: 4 — 게이트 발화 정합
**Complexity**: Medium

## Summary

M1~M3은 탐지를 정직하게 만들고 이름을 바로잡았다. 남은 것은 **그 이름으로 무엇을
부르는가**다. auto 모드는 지금 `shape`를 implement 게이트에서 부르는데, impeccable
4.1.1이 자기 명령 메타데이터에 `shape` = "Runs a **required** multi-round discovery
interview"라고 적어 두었다 — 비대화형 게이트에서 완주할 수 없는 명령이다. 반대편에는
어느 게이트에서도 발화하지 않는 harden 단계가 있고, 그 사이에 Phase 3.6이 오라클을
거치지 않고 부르는 명령 3종이 있어 receipt가 실제 발화를 **덜** 보고한다.

M4는 세 축을 닫는다: 완주 불가능한 발화를 **빼고**, 발화가 0인 단계에 **자리를 주고**,
오라클 밖에서 일어나던 발화를 오라클 안으로 들여 **기록되게** 한다.

## User Intent

<!-- USER-STATED constraints only. 출처는 PRD 본문이며, PRD footer가 사용자 답변으로
     귀속한 절(Problem · Users · Hypothesis 제약 · MVP 경계 · Out of scope · 섀도잉
     처리 강도)과 Risks 표의 M4 행에서 뽑았다. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 공식 채널로 default 설치한 사용자에게 env 설정을 요구하는 것은 의도된 사용법이 아니라 결함이다 | constraint |
| UI2 | env 우회는 외부에 따로 설치한 경우를 위한 장치다 | constraint |
| UI3 | 기존 npm CLI 3.x 사용자는 강제 마이그레이션 대상이 아니며 계속 동작해야 한다 | constraint |
| UI4 | impeccable을 쓰지 않는 사용자에게 없는 도구를 설치하라고 압박하지 않는다 | constraint |
| UI5 | 라우팅 카탈로그의 명령 추가와 삭제는 범위 밖이다 | exclusion |
| UI6 | a11y-architect 자동 발화는 이 계약과 독립이므로 건드리지 않는다 | exclusion |
| UI7 | 게이트 lenient strict 비대칭 재설계는 범위 밖이다 | exclusion |
| UI8 | impeccable 4.x가 도입한 프로토콜 채택은 범위 밖이다 | exclusion |
| UI9 | Node 하한 상향 결정은 미해결 질문으로 남긴다 | exclusion |
| UI10 | 명령별 차단 분기는 공식 문서 뒷받침이 없으므로 M4 착수 전에 재확인한다 | direction |
| UI11 | auto 모드가 발화하는 명령은 비대화형 게이트에서 실제로 완주해야 한다 | direction |
| UI12 | 발화가 0인 라이프사이클 단계가 없어야 한다 | direction |
| UI13 | 추정하지 않고 열거하며 모르면 모른다고 보고한다 | direction |

## 이 plan이 milestone 문구를 그대로 달성하지 못하는 지점 (명시 전제)

UI12를 **문자 그대로** 달성하는 것은 UI11과 충돌한다. discovery 단계의 유일한 명령이
`shape`이고, 그 명령은 벤더 계약상 인터뷰를 요구하므로 어떤 비대화형 게이트에서도
완주할 수 없다. 즉 discovery는 UI11을 지키는 한 영구히 발화 0이다.

같은 성질의 두 번째 단계가 system(`document`·`extract`)이다 — v1.13.0 M3이 "heavyweight
generative actions that should be a deliberate operator step"라는 근거로 전 게이트
recommend-only로 확정했고, 그 결정은 M4가 뒤집을 근거가 없다.

따라서 이 plan은 UI12를 **"모든 단계가 발화하거나, 발화 0인 단계는 증거와 함께 기록되고
test로 고정된다"** 로 읽고 그렇게 착지한다. 남는 0은 정확히 둘(discovery · system)이며
각각 근거가 다르다. 이 독해가 사용자의 의도와 다르면 Task 3의 범위를 넓히면 되지만,
`onboard`·`shape`를 억지로 발화시키는 것은 UI11을 깨는 방향이므로 권하지 않는다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `plugins/mccp/scripts/lib/impeccable-routing.js:51` | `entry(command, stage, callForm, signal)` 팩토리 + `Object.freeze` 테이블. 내부 메타(`signal`)는 공개 반환에서 strip |
| 순수성 | `plugins/mccp/scripts/lib/impeccable-routing.js:178` | `selectByDiffSignals` — 입력이 없으면 no-op(fail-open), 변환은 downgrade-only, 입력 미변경 |
| Errors | `plugins/mccp/scripts/lib/dep-check.js` `checkImpeccable` | 지연 require를 try/catch로 감싸 fail-closed sentinel 반환 ("Never throws" 계약) |
| Restamp | `plugins/mccp/scripts/receipt/write.js:1064` `restampGroundingVerdict` | field-preserving 사후 restamp — 한 키만 mutate하고 digest 재계산 |
| CLI dispatch | `plugins/mccp/scripts/receipt/cli.js:444` | `case 'restamp-grounding':` + usage 행 1줄 |
| Tests | `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js:23` | 카탈로그 크기를 상수로 pin하고 주석에 증감 이력을 남김 |
| 도달불가 고정 | `plugins/mccp/scripts/lib/tests/impeccable-cleanup.test.js` (M3 `rules 1+2 jointly`) | "이 오라클이 만들 수 있는 어떤 구성도 X를 만들지 못한다"를 test로 고정 → 넓히는 milestone이 조용히 지나갈 수 없음 |
| 짝 단언 | `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` (M3) | 배선과 본문이 **같은 값**이어야 한다는 쌍방 단언으로 반쪽 착지를 붉힘 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `.claude/notes/impeccable-detection-contract-m4.md` | CREATE | UI10이 요구하는 착수 전 재확인 기록 + 측정된 4게이트 매트릭스 |
| `plugins/mccp/scripts/lib/impeccable-routing.js` | UPDATE | `INTERVIEW_REQUIRED_COMMANDS` 추가 · implement `shape` 강등 · `phase` 축 + finish 엔트리 |
| `plugins/mccp/scripts/lib/tests/impeccable-routing.test.js` | UPDATE | M4 metric test(발화 × 차단조건 대조) · `background` 도달불가 · phase 필터 · 0-발화 단계 tally |
| `plugins/mccp/scripts/receipt/write.js` | UPDATE | `restampRoutedCommands` — finish 패스 outcome을 receipt에 append |
| `plugins/mccp/scripts/receipt/cli.js` | UPDATE | `restamp-routed` 서브커맨드 dispatch + usage |
| `plugins/mccp/scripts/receipt/tests/restamp-routed.test.js` | CREATE | append 의미론 · 필드 보존 · digest 재계산 |
| `plugins/mccp/commands/prp-implement.md` | UPDATE | 2.5.5b `phase:"pre"` 명시 · Phase 3.6을 오라클 구동 + restamp로 재배선 · 낡은 서술 정정 |
| `plugins/mccp/scripts/lib/tests/impeccable-guard.test.js` | UPDATE | Phase 3.6이 하드코딩 3종 대신 오라클과 restamp를 부르는지 짝 단언 |
| `docs/gate-design.md` | UPDATE | `### impeccable-routing` 아래 `#### 게이트 발화 정합 (M4)` |
| `CLAUDE.md` | UPDATE | §3.10에 M4 문단(짧게 — 상세는 gate-design 소유) |
| `CHANGELOG.md` | UPDATE | `## [1.31.4]` |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 1.31.3 → 1.31.4 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (4면 중 2면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (4면 중 3면) |
| `.claude/prds/impeccable-detection-contract.prd.md` | UPDATE | milestone 4 → complete + Plan 셀 |
| `.claude/plans/codex-findings-backlog.md` | UPDATE | 이연 2건 명시 기록 |

## Tasks

### Task 1: UI10 재확인 — 차단 조건의 근거를 문서 있는 것으로 옮긴다

- **Action**: `.claude/notes/impeccable-detection-contract-m4.md`를 만들고 아래를 file:line과 함께 기록한다.
  - **1차 근거(신규·문서화됨)**: `~/.claude/plugins/cache/impeccable/impeccable/4.1.1/skills/impeccable/scripts/command-metadata.json` 의 `shape.description` = *"Plan UX and UI before code. Runs a **required** multi-round discovery interview, uses visual probes when available, and produces a user-confirmed design brief for implementation."* 이것은 plugin이 **함께 배포하는 자기 계약**이므로, meta-research가 우려한 "공식 문서 뒷받침 없음"이 해소된다. 조건 없이 required다 — PRODUCT.md 유무와 무관하다.
  - **2차 근거(기존·실물)**: impeccable 4.1.1 cache의 `scripts/context.mjs` (L1112-1140)의 `NO_PRODUCT_MD` / `BUILD_INIT_REQUIRED` / `PRODUCT_INIT_REQUIRED` 분기. PRODUCT.md 부재 시 `shape`를 `reference/init.md` 인터뷰로 보내고 그 인터뷰가 PRODUCT.md를 **쓴다**. 비대화형 게이트에서는 (a) 질문하며 멎거나 (b) "structured simulated-user interview"로 제품 진실을 **지어내어 사용자 저장소에 파일을 쓴다**. 후자가 더 나쁘다.
  - **측정된 오라클 매트릭스** (4게이트 × renderingSurface 2값, auto 모드): plan·prd·pr은 전부 recommend, implement만 발화. `renderingSurface=true` → `discovery/shape:background refine/layout:invoke refine/typeset:invoke refine/animate:invoke refine/colorize:invoke simplify/adapt:invoke evaluate/critique:invoke evaluate/audit:invoke`. `false` → `evaluate/critique:invoke evaluate/audit:invoke`.
  - **meta-research 정정 1건**: P2.5의 "`harden`·`optimize`·`onboard`·`polish`가 어느 게이트에서도 발화하지 않는다"는 `polish`에 한해 **낡았다**. v1.18.21이 `prp-implement.md` Phase 3.6(`:1145`)을 도입해 `clarify`·`distill`·`polish`를 post-EXECUTE로 부른다. 남는 미발화는 `harden`·`optimize`·`onboard` 셋이다.
  - **신규 발견**: Phase 3.6의 그 3종은 **오라클을 거치지 않는다**. 오라클은 implement에서 `clarify`·`distill`을 `recommend`로, `polish`는 아예 미등재로 답한다. receipt의 `impeccable_commands_routed`는 2.5.6(pre-EXECUTE)에 봉인되고 유일한 사후 restamp인 `restampGroundingVerdict`(`write.js:1064`)는 `meta.design_grounding_verdict` **한 키만** 건드린다(`write.js:1091-1096`). 따라서 실제 발화 3건이 receipt에 **기록될 경로가 구조적으로 없다**.
- **Mirror**: `.claude/notes/impeccable-detection-contract-m3.md` 의 Task 0 관측 기록 형식.
- **Validate**: `grep -c "command-metadata.json\|L1112-1140" .claude/notes/impeccable-detection-contract-m4.md` 가 2 이상.

### Task 2: 완주 불가능한 발화를 뺀다 — `shape` 강등 + 차단 집합 명시

- **Action**:
  1. `impeccable-routing.js`에 `INTERVIEW_REQUIRED_COMMANDS = Object.freeze(['shape', 'init', 'teach'])` 를 추가하고 export한다. 주석에 Task 1의 두 근거를 file:line으로 적는다. `init`·`teach`는 mccp 카탈로그에 없지만(UI5 — 추가하지 않는다) 벤더가 같은 문장에서 `shape`와 함께 묶은 형제이므로, 카탈로그가 훗날 넓어질 때를 대비해 집합에 둔다. 교집합은 오늘 `shape` 하나다.
  2. `STAGE_ROUTING.implement`의 `entry('shape', 'discovery', 'background', null)` (`:85`) 의 callForm을 `'recommend'`로 바꾼다. 카탈로그 원소는 그대로 남으므로 UI5 위반이 아니다 — 바뀌는 것은 call form 하나이고, 모듈이 이미 선언한 **downgrade-only** 불변식과 같은 방향이다.
- **주의 — 이것이 만드는 부작용을 숨기지 않는다**: `background`는 오라클 전체에서 `shape` 엔트리의 base였으므로, 이 변경 뒤 `resolveCallForm`이 `background`를 **절대 반환하지 않는다**. enum(`schema.js` `ROUTING_CALL_FORM_VALUES`)과 `prp-implement.md`의 callForm 표는 **남긴다** — 제거는 receipt schema 열거를 좁히는 일이라 과거 receipt 해석을 바꾸고, `background`는 정당한 미래 base다. 대신 Task 6이 "현재 도달 불가"를 test로 고정해, 다시 도달 가능해지는 날 붉게 알리도록 한다(M3 `rules 1+2 jointly` 선례).
- **Mirror**: `impeccable-routing.js:162` `resolveCallForm`의 downgrade-only 주석.
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js`

### Task 3: 발화가 0인 단계에 자리를 준다 — `phase` 축 + finish 엔트리

- **Action**:
  1. `entry()`에 다섯 번째 인자 `phase`를 추가하고 기본값 `'pre'`로 둔다(`signal`과 동형의 내부 메타).
  2. `routeCommands(opts)`가 `opts.phase`(기본 `'pre'`)를 받아 테이블을 그 phase로 **필터**한다. plan·prd·pr 테이블은 전 엔트리가 `'pre'`이므로 세 게이트의 출력은 **바이트 동일**하다 — Task 6이 이를 pin한다.
  3. `phase`는 `signal`과 같이 공개 반환에서 strip한다(`:239` 주석의 "PUBLIC return schema stable" 계약 유지). 소비처 변경 0.
  4. `STAGE_ROUTING.implement`를 이렇게 바꾼다:
     - `clarify`·`distill`: `recommend` → `invoke`, phase `finish`
     - 신규 `entry('polish', 'polish', 'invoke', null, 'finish')`
     - 신규 `entry('harden', 'harden', 'invoke', null, 'finish')`
     - 신규 `entry('optimize', 'harden', 'invoke', null, 'finish')`
- **`onboard`은 추가하지 않는다.** 4.1.1 메타데이터가 `onboard` = "Design onboarding flows, first-run experiences, and empty states... welcome screens, account setup, progressive disclosure"라고 적는다 — 기존 코드를 고치는 명령이 아니라 **없던 표면을 새로 짓는** 명령이다. implement 게이트에서 자동 발화시키면 plan이 요구하지 않은 surface를 만든다. `harden`("error handling, i18n, text overflow, edge case management")과 `optimize`("Diagnoses and **fixes** UI performance")는 산출된 코드를 손보는 성질이라 이미 발화하는 `polish`·`clarify`·`distill`과 같은 부류이고, 그래서 자리를 준다. 이 구분이 harden 단계를 열되 scope 확장은 막는 선이다.
- **왜 새 callForm이 아니라 phase인가**: `finish` 같은 callForm을 만들면 `resolveCallForm`·`selectByDiffSignals`·`schema.js`의 닫힌 enum이 전부 따라 움직인다. phase는 이미 존재하는 **테이블 메타** 축(`signal`)의 형제이므로 공개 스키마와 receipt schema를 **한 줄도 건드리지 않는다**.
- **Mirror**: `impeccable-routing.js:51`(entry 팩토리) · `:239-243`(공개 스키마 strip).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js`

### Task 4: 오라클 밖 발화를 기록되게 한다 — `restamp-routed`

- **Action**:
  1. `write.js`에 `restampRoutedCommands({gate, decision, entriesFile, cwd})`를 추가한다. `restampGroundingVerdict`(`:1064`)를 그대로 미러링하되 mutate 대상은 `meta.impeccable_commands_routed` 하나다: 기존 배열(또는 `null` → `[]`)에 파일의 엔트리를 **append**하고 digest를 재계산한다.
  2. **dedupe하지 않는다.** duplicate-call 불변식이 참이면 중복은 애초에 생기지 않고, 거짓이 되면 receipt에 두 번 보이는 것이 정확히 우리가 원하는 drift 신호다. 조용히 합치면 그 신호가 사라진다.
  3. 엔트리는 기존 `schema.js` 검증(`command` 비어있지 않은 문자열 · `call_form` ∈ 4종 · `status` ∈ 5종)을 그대로 통과해야 한다. **schema 변경 0.**
  4. `cli.js`에 `case 'restamp-routed':`와 usage 1행(`:24` 형식)을 추가한다.
- **§3.12 주의**: 이 restamp는 `mccp-implement-codex` receipt에만 쓴다. git-tracked ship corpus(`mccp-pr-codex`)는 대상이 아니며, no-rehash 불변식은 그쪽 축이다 — `restamp-grounding`이 이미 같은 자리에 있고 같은 이유로 허용된다.
- **Mirror**: `plugins/mccp/scripts/receipt/write.js:1064-1100` · `plugins/mccp/scripts/receipt/cli.js:226-246,444`.
- **Validate**: `node --test plugins/mccp/scripts/receipt/tests/restamp-routed.test.js`

### Task 5: prp-implement 재배선

- **Action**:
  1. **2.5.5b** (`:489`): `routeCommands` 호출에 `phase:"pre"`를 명시한다. 기본값과 같지만, 두 패스가 생긴 이상 어느 쪽인지 본문에 적히지 않으면 다음 편집자가 추측하게 된다.
  2. **`:448` 문단 정정**: "`polish` is not routed in implement at all"·"`clarify`/`distill` stay `recommend`/deferred in the routing oracle"는 Task 3 이후 **거짓**이 된다. "pre 패스는 phase=pre만 보고, finish 5종은 Phase 3.6이 phase=finish로 같은 오라클에서 받는다"로 고친다. duplicate-call 불변식은 이제 **산문이 아니라 phase 필터가 기계적으로** 보장한다 — 그 점을 명시한다.
  3. **Phase 3.6.2** (`:1178`): 하드코딩된 `clarify`/`distill`/`polish` 3종 나열을 오라클 호출로 교체한다. post-EXECUTE diff로 `renderingSurface`·`diffSignals`를 **재계산**하고(3.6.1이 이미 `FINISH_SURFACE`로 하던 계산을 2.5.5b의 ROUTE_JSON 블록과 같은 형태로 확장) `routeCommands({gate:'implement', phase:'finish', mode, designSignal, designIntentActive, renderingSurface, diffSignals})`를 부른 뒤, 2.5.5b와 **동일한 callForm 처리표**로 각 명령을 처리하고 `{command, call_form, status}`를 누적한다.
  4. **Phase 3.6.4 신설**: 누적 배열을 tempfile에 쓰고 `cli.js restamp-routed --gate mccp-implement-codex --decision "$DECISION_SLUG" --impeccable-commands-routed-file <file>`를 부른다. 실패는 **fail-open + loud stderr** — Phase 3.6은 advisory이고 그 성질을 M4가 바꾸지 않는다(receipt 기록 실패가 구현을 막으면 안 된다). 단 실패했다는 사실은 Phase 5 REPORT에 남긴다.
  5. **3.6.1 gate 3번 조건 유지**: `MCCP_IMPECCABLE_ROUTING_MODE=recommend`면 skip. 오라클도 recommend 모드에서 전부 강등하므로 두 층이 같은 답을 낸다.
- **Mirror**: `plugins/mccp/commands/prp-implement.md:466-521`(ROUTE_JSON 블록 + callForm 표) · `:1320-1345`(restamp 호출 관례 — slug 재도출, 아티팩트에서 읽기, 셸 변수 미의존).
- **Validate**: `node --test plugins/mccp/scripts/lib/tests/impeccable-guard.test.js`

### Task 6: test — M4의 주장을 기계가 반증 가능하게

- **Action** — `impeccable-routing.test.js`에 넷을 추가한다.
  1. **M4 metric test** (Success Metrics 행의 기계화): 모든 `gate × {auto, hybrid} × renderingSurface{true,false} × phase{pre,finish} × designIntentActive{true,false}` 조합에서, `callForm !== 'recommend'` 인 명령은 `INTERVIEW_REQUIRED_COMMANDS`에 **속하지 않는다**. 이것이 "auto 모드가 발화하는 명령이 전부 비대화형으로 완주 가능"의 반증 가능한 형태다.
  2. **`background` 도달 불가**: 위와 같은 전수 조합에서 `callForm === 'background'` 인 엔트리가 0건. 실패하면 누군가 인터뷰형 명령을 되살렸거나 새 background base를 넣은 것이고, 어느 쪽이든 의도적 결정이어야 한다.
  3. **phase 필터 무해성**: `routeCommands({gate})`(phase 미지정)의 plan·prd·pr 출력이 M4 이전과 동일함을 명시 배열로 pin. implement는 pre 14 / finish 5 / 합 19를 상수로 pin하고 주석에 16 → 19 증감 이력을 남긴다(`:23` 관례).
  4. **0-발화 단계 tally**: 전 게이트·전 phase를 합쳐 한 번도 `recommend` 아닌 callForm을 갖지 못하는 stage 집합이 **정확히 `{discovery, system}`** 임을 단언하고, 주석에 각각의 근거(벤더 인터뷰 요구 / v1.13.0 M3 deliberate-operator 결정)를 적는다. 이 test가 "발화 0인 단계가 없다"를 억지로 만들지 않고 **남은 0을 봉인**한다.
- **Action** — `restamp-routed.test.js` (신규): (a) `null` 배열에 append → 길이 N, (b) 기존 배열에 append → 순서 보존 + 원소 미변경, (c) `design_critique_*`·`impeccable_routing_mode`·`design_grounding_verdict` 등 인접 필드 보존, (d) digest 재계산 후 `validateReceipt` 통과, (e) 중복 command를 넣으면 **두 건 모두 남는다**.
- **Action** — `impeccable-guard.test.js`에 **짝 단언** 추가: `prp-implement.md`가 (i) `phase:"finish"` 로 `routeCommands`를 부르는 것과 (ii) `restamp-routed`를 부르는 것이 **같은 값**이어야 한다. 그리고 하드코딩된 3종 나열(`clarify <slug>` 리터럴 등)이 Phase 3.6에 **남아 있지 않은지** 검사한다 — M3이 배운 교훈대로, 산문이 아니라 배선을 검사한다.
- **Mirror**: `impeccable-cleanup.test.js` M3 `rules 1+2 jointly` · `impeccable-guard.test.js` M3 짝 단언.
- **Validate**: 아래 `## Validation` 전체.

### Task 7: 문서 · version 4면 동기

- **Action**:
  1. `docs/gate-design.md` — `### impeccable-routing` 아래 `#### 게이트 발화 정합 (M4)`. 담을 것: 벤더 계약 인용과 file:line · phase 축이 새 callForm이 아닌 이유 · `onboard` 제외 근거 · 남은 0-발화 2단계와 각각의 근거 · restamp가 fail-open인 이유 · "주장하지 않는 것".
  2. `CLAUDE.md` §3.10 — 문단 하나. `shape`가 implement에서 더는 발화하지 않는다는 것, finish phase가 harden·polish·simplify를 post-EXECUTE로 부르고 receipt에 restamp된다는 것, 남은 0이 둘이며 test가 그것을 봉인한다는 것. 상세는 gate-design 링크. §3.10은 이미 7,074B(ledger S3.10)이므로 **늘리는 만큼 낡은 문장을 줄인다** — 현재 "harden `harden` · polish `polish`"가 마치 라우팅되는 것처럼 읽히는 stage→command 나열이 그 대상이다.
  3. `CHANGELOG.md` `## [1.31.4]` + §3.7 bump 서술(`1.31.3 → 1.31.4`, **patch** — PRD 내 단일 milestone).
  4. 4면 동기: `plugin.json` · `renderer/html.js:1419` · `renderer/markdown.js:163` · `CHANGELOG.md:5` 의 `currently \`X.Y.Z\``.
  5. PRD milestone 4 → `complete`, Plan 셀에 이 파일 경로.
  6. `.claude/plans/codex-findings-backlog.md`에 **2건 이연**:
     - `.claude/cache/(STATUS.md|status.html)` 는 두 surface 판정 블록의 정규식에 있으나 `.gitignore:131`이 `.claude/cache/`를 무시하므로 `git diff --name-only HEAD` 에도 `git ls-files --others --exclude-standard` 에도 **절대 나타나지 않는다** — 그 분기는 죽어 있다. mccp 자신의 대시보드 표면이 디자인 게이트를 트리거할 수 없다는 뜻이며, 고치면 대시보드 재렌더마다 게이트가 발화하므로 비용 판단이 필요하다. trigger-surface 축이라 M4(라우팅 축) 밖으로 이연.
     - `onboard`은 M4 이후에도 전 게이트 recommend다. 필요해지면 별도 축으로 다룬다.
- **§3.7 주의**: version은 **머지 해소 시점**과 **`/mccp:pr` 진입 직전** 두 번 재계산한다. 현재 origin/main은 1.31.0이고 로컬은 1.31.3이므로 병렬 브랜치가 그 사이를 가져갈 수 있다.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` · instruction-contract lint.

### Task 8: 라이브 완주 — 단위 test 통과 ≠ 경로 작동

- **Action**: `/mccp:prp-implement`를 이 plan으로 1회 완주시키되, **finish 패스가 실제로 발화하도록** 임시 untracked UI 파일 1개(예: `scratch-m4-surface.css`)를 EXECUTE 중에 두어 `FINISH_SURFACE=1`을 만든다. 커밋 전에 삭제한다.
- **확인할 산출물** (셋 다 필요):
  1. `mccp-implement-codex` receipt의 `meta.impeccable_commands_routed`에 **finish 패스 엔트리가 1건 이상** 존재 → restamp가 실제로 착지했다는 증거.
  2. 같은 배열에 `{"command":"shape", ...}` 중 `call_form`이 `recommend`가 아닌 것이 **0건** → UI11이 라이브에서 성립.
  3. stderr에 `[mccp:impeccable-routing]` finish 행이 남고 Phase 5 REPORT에 `### Design Finish` 소제목이 존재.
- **왜 임시 파일이 필요한가 (숨기지 않는다)**: M4의 diff는 `.js`/`.md`뿐이라 `renderingSurface=false`이고, 그러면 refine·simplify·harden·polish가 전부 recommend로 강등되어 finish 패스가 한 줄도 발화하지 않는다. M3의 T9가 같은 구조적 벽에 부딪혔다(`.claude/notes/impeccable-detection-contract-m3.md`). 임시 표면 없이 "완주했다"고 적으면 그것이 정확히 이 항목이 금지하는 주장이다.
- **Validate**: 위 세 산출물을 `.claude/notes/impeccable-detection-contract-m4.md`에 receipt 경로와 함께 인용.

## Validation

```bash
# 1) 라우팅 오라클 + 발화×차단조건 매트릭스
node --test plugins/mccp/scripts/lib/tests/impeccable-routing.test.js

# 2) receipt restamp
node --test plugins/mccp/scripts/receipt/tests/restamp-routed.test.js

# 3) 명령 본문 배선 짝 단언 (M3 guard 확장)
node --test plugins/mccp/scripts/lib/tests/impeccable-guard.test.js

# 4) M1~M3 회귀 — 탐지 축이 M4로 흔들리지 않았는지
node --test plugins/mccp/scripts/lib/tests/impeccable-detect.test.js \
            plugins/mccp/scripts/lib/tests/impeccable-resolve.test.js \
            plugins/mccp/scripts/lib/tests/impeccable-cleanup.test.js \
            plugins/mccp/scripts/lib/tests/impeccable-detect-design-surface.test.js

# 5) receipt schema 무변경 확인 (enum을 건드리지 않았음)
node --test plugins/mccp/scripts/receipt/tests/

# 6) version 4면 동기
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 7) CLAUDE.md 절 이전/소실 검사
node plugins/mccp/scripts/lib/instruction-contract/lint.js \
  --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md

# 8) 수동 대조 — 게이트별 auto 출력을 눈으로 확인
node -e 'const r=require("./plugins/mccp/scripts/lib/impeccable-routing");
for (const g of ["prd","plan","implement","pr"]) for (const p of ["pre","finish"])
  console.log(g,p,r.routeCommands({gate:g,mode:"auto",designSignal:true,renderingSurface:true,phase:p})
    .commands.filter(c=>c.callForm!=="recommend").map(c=>c.stage+"/"+c.command).join(" ")||"(none)");'
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `phase` 필터가 plan·prd·pr 출력을 소리 없이 바꾼다 | 낮음 | 세 게이트 전 엔트리가 `pre`이고 Task 6-3이 명시 배열로 pin. 실패하면 즉시 붉다 |
| finish 패스가 5종을 실제로 부르며 게이트 비용·시간이 늘어난다 | **높음 — 확실히 는다** | 3종 → 5종이므로 증가는 실재한다. 전부 advisory·fail-open이고 3.6.1의 3중 gate(트리거·표면·모드)가 그대로 걸린다. 비용이 문제면 `MCCP_IMPECCABLE_ROUTING_MODE=hybrid`가 evaluate만 남긴다 — **새 토글을 추가하지 않는다** |
| `harden`·`optimize`가 산출 diff를 크게 고쳐 scope가 번진다 | 중 | 3.6.3의 기존 bounded 규칙("trivial/safe만 이 사이클에, 나머지는 별도 사이클")을 그대로 적용하고 그 문장을 finish 5종 전체로 명시 확대 |
| restamp가 실패해도 조용하다 | 중 | fail-open이되 loud stderr + Phase 5 REPORT 기록. receipt는 **덜 기록**할 뿐 거짓을 기록하지 않는다(append-only, dedupe 없음) |
| 임시 UI 파일이 커밋에 섞인다 | 중 | Task 8이 삭제를 명시하고, `/mccp:prp-commit` 전 `git status`로 확인. 파일명에 `scratch-` prefix |
| meta-research의 다른 P2.5 주장도 낡았을 수 있다 | 중 | Task 1이 세 주장을 전부 HEAD 기준으로 재측정하고 정정을 기록. 오라클 매트릭스는 실행으로 얻는다(추정 아님 — UI13) |
| version 1.31.4가 병렬 브랜치와 충돌 | 중 | §3.7대로 머지 해소 시점 + `/mccp:pr` 직전 2회 재계산, 4면 재동기 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] 게이트/경로를 실제로 1회 완주하고 산출물을 확인 — 구체적으로: `mccp-implement-codex` receipt의 `meta.impeccable_commands_routed`가 **finish 패스 엔트리 ≥1건**을 담고 있고, 그 배열에 `shape`의 non-recommend call_form이 **0건**이며, 두 사실을 receipt 경로와 함께 `.claude/notes/impeccable-detection-contract-m4.md`에 인용한다. 단위 test 통과만으로는 이 항목을 주장할 수 없다
- [ ] `INTERVIEW_REQUIRED_COMMANDS` 교집합이 전 게이트·전 phase에서 공집합임을 test가 단언
- [ ] 남은 0-발화 단계가 정확히 `{discovery, system}`이고 각각 근거가 문서와 test 주석에 있음
- [ ] `codex-findings-backlog.md`에 이연 2건이 기록됨 (조용히 버리지 않음)

## Design Critique

- 탐지: `impeccable-detect.js detect --mode plan` → `skill_available=1` · `design_signal=1` · `reason=ok`
- 해소된 본문: `impeccable:impeccable` · source `plugin` · version `4.1.1` · `shadowed=false` · `eclipsed=[]`
- 호출: `Skill(impeccable:impeccable, "critique ...")` — M3 call-form carrier가 지목한 이름 그대로. Setup(`context.mjs`)이 보고한 base directory가 오라클이 지목한 경로와 일치했다(이 PRD의 자기 적용 증거)
- 라운드 수: 1 (cap 2)
- verdict: **CONVERGED** (`decideCritique` — HIGH/CRITICAL/UNKNOWN 0건)

### 평가 대상 축소 (명시)

`context.mjs`가 `hasVisualImplementation:false` · `surfaceBriefPath:null`을 반환했다 — 대상이 rendered surface가 아니라 plan 문서다. 따라서 impeccable의 UI critique 플레이북(heuristic scoring · persona testing)을 적용하지 않고, 게이트가 지정한 SKILL.md `## Output Constraints` 4 anchor로 좁혀 평가했다. 이 대체를 숨기지 않고 여기 적는다.

### Anchor 판정

| Anchor | 측정 | 판정 |
|---|---|---|
| 정보 위계 3단계 (H15) | fenced code 제외 heading tally `{1:1, 2:10, 3:8}`, max depth 3 | PASS |
| 강조 장치 1개 | `**bold**` 101건 | MEDIUM (아래) |
| raw markdown marker 금지 | 누출 marker 0건 — 문서 자체가 markdown 렌더 대상 | PASS |
| list-of-N 상한 | 4개 표 블록이 3행 초과 (14 · 9 · 17 · 8) | 범주 불일치 (아래) |

### 흡수하지 않은 2건 (§3.14 — HIGH/CRITICAL만 그 자리에서 흡수)

- **MEDIUM · 강조 포화** — `**bold**` 101건은 anchor가 경고하는 "여러 강조가 경쟁해 위계를 녹인다"에 해당한다. 다만 이 문서의 독자는 60초 스캔하는 PM이 아니라 전문을 읽는 적대적 리뷰어이고, 굵은 글씨가 표시하는 것이 대부분 불변식과 거부 조건이라 감축이 리뷰 가치를 떨어뜨릴 수 있다. backlog로 이연.
- **LOW · list-of-N collapse 범주 불일치** — anchor 4는 "Quiet by default, loud on demand"를 위한 대시보드 표면 규칙이다(PRODUCT.md Design Principle 3). plan은 전문이 `plan_hash`에 묶여 리뷰되는 산출물이므로, `Files to Change` 17행 중 14행을 `<details>`로 접으면 리뷰어가 반드시 봐야 할 것을 가린다 — anchor를 문자 그대로 적용하면 문서가 자기 목적에서 나빠진다. 적용하지 않고 근거와 함께 기록한다.
- **비적용 1건 · H10 em-dash** — 36건. H10은 렌더된 HTML 표면 lint 앵커이며 이 저장소의 한국어 기술 산문(CLAUDE.md 포함)이 전부 이 문자를 쓴다. plan 문서에 적용 대상이 아니다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). 여기서는 체크리스트일 뿐 — plan 단계는 렌더된 UI가 없어 어느 명령도 invoke하지 않는다(전 행 recommend).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

> 이 표는 M4가 바꾸려는 대상 그 자체다. `discovery/shape`는 M4 Task 2 이후에도 이 guide에는 권장으로 남지만 implement 게이트의 발화 목록에서는 빠진다. `harden` 3종 중 `harden`·`optimize`는 Task 3이 finish phase 자리를 주고 `onboard`은 근거와 함께 recommend로 남는다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
