# Plan: 문서 생성 자동화 + 착지 게이트 (env-contract-integrity M4)

**Source PRD**: `.claude/prds/env-contract-integrity.prd.md`
**Selected Milestone**: #4 — 문서 생성 자동화 + 착지 게이트
**Complexity**: Medium

## Summary

M4의 두 축 중 **착지 게이트는 절반만 실재한다.** 실측하면 "문서 없이 토글을 추가하는
변경"은 오늘 이미 막히지만(L2 → L3 → L7/L12 연쇄, exit 1), **"코드가 바뀌었는데 문서가
따라오지 않은" 방향은 전혀 막히지 않는다** — 상세 문서의 파생 가능한 3줄(`**종류**` 헤더 ·
`**한 줄**` · `**소비처**`)과 색인 TOC 개수를 레지스트리와 대조하는 검사가 없어서, 오늘 이
저장소에 **31건의 드리프트가 lint green인 채로 실재**한다.

M4는 그 파생 가능한 표면을 **정본 오라클 하나**로 렌더링하고, 그 오라클을 두 소비처가
쓰게 한다 — `docgen --write`(생성·수리)와 lint **L13**(착지 차단). 생성기와 게이트가 같은
판정을 쓰므로 "생성했는데 검사는 다른 것을 본다"가 구조적으로 불가능하다.

**생성기는 판단이 필요한 것을 하나도 만들지 않는다** — `값별 결과` · `멤버 어휘` ·
극성 해설뿐 아니라 **`사용 예시` 블록도** 만들지 않는다. 기계가 쓴 문장을 사람이 쓴
것처럼 배치하면 M4가 닫으려는 것과 같은 종류의 거짓이 되고, 더 나쁘게는 그 생성물이
L7을 **스스로 만족시켜** 착지 차단을 무력화한다(L2 패널이 초안에서 이것을 실측으로
반증했다 — Task 2 참조). 생성물은 파생 줄과 TODO 표시뿐이고, L7은 저자가 실제 예시를
쓸 때까지 붉은 채로 남는다.

## User Intent

<!-- USER-STATED constraints only. Sources: the PRD (co-created with the user,
     2026-08-21) and the standing project instructions the user authored. -->

| ID | Constraint (user-stated) | Kind |
|---|---|---|
| UI1 | 토글을 추가하면 문서가 생성된다. 갱신을 잊으면 착지가 막힌다 | direction |
| UI2 | 온보딩 walkthrough · 에디터 자동완성 · 전용 열람 페이지는 이 마일스톤이 아니다 (M5·M6) | exclusion |
| UI3 | 진단을 게이트로 편입하지 않는다 — 이 PRD는 권하지도 반대하지도 않는다 | exclusion |
| UI4 | evidence 포인터 98건 일괄 재생성은 범위 밖이다 — 대표를 고르는 규칙이 없다 | exclusion |
| UI5 | 검사는 먼저 채우고 켠다. 읽을 수 없는 항목을 조용히 통과시키지 말고 명시 열거로 남긴다 | constraint |
| UI6 | 레지스트리 밖에서 동작하는 토글의 은퇴는 범위 밖이다 — 하위 호환 판단이 필요하다 | exclusion |
| UI7 | 게이트 리뷰는 1라운드가 기본이고 그 라운드를 triage한 뒤 진행한다 | direction |
| UI8 | 각 마일스톤은 독립적으로 사용자에게 보이는 변화를 낸다 | constraint |

> **UI4에 대한 저자 주의**: 본 계획은 레지스트리의 `evidence` **값을 바꾸지 않는다.**
> 고치는 것은 상세 문서가 그 값을 옮겨 적은 `**소비처**` **사본**이며, 방향은 항상
> 레지스트리 → 문서다. 두 축이 이름만 비슷하므로 리뷰어가 UI4 위반으로 볼 수 있고,
> 그 판단이 실제로 나오면 adjudication에서 다뤄야 한다.

## Grounding — 실측 (2026-09-01, 이 사이클)

### G1. "문서 없이 토글 추가"는 이미 막힌다 — 연쇄로

레지스트리에 가짜 토글을 심고 문서를 단계별로 채우며 lint를 돌렸다. 매 단계에서 정확히
다음 검사가 붉어졌고, 마지막까지 exit 1이 유지됐다.

| 단계 | 붉어진 검사 | 메시지 |
|---|---|---|
| 레지스트리에만 추가 | L2 | `registry entry missing from the index` |
| 색인 행 추가 | L3 | `anchor #mccp_m4_probe_bool not found` |
| 빈 앵커 추가 | L7 | `no 사용 예시 block` |
| enum이었다면 | L12 | `no ### … anchor in docs/environment/gates.md` |

즉 UI1의 후반부("갱신을 잊으면 착지가 막힌다")는 **신규 추가 경로에 한해 이미 참이다.**
M4가 그 경로에 더할 것은 차단이 아니라 **생성**이다.

### G2. 파생 가능한 3줄은 어느 검사도 보지 않는다 — 드리프트 31건 실재

`사용 예시` 블록만 있고 헤더·한 줄·소비처가 전부 없는 상세 절은 L1~L12를 **전부 통과**한다
(실측: exit 0). 그리고 레지스트리 default를 뒤집고 색인만 갱신한 뒤 상세 문서를 낡은 채로
두면 12개 검사가 모두 green이다.

오늘 이 저장소의 실측 드리프트 — 총 **165개** 항목 대상:

| 표면 | 드리프트 | 오늘 검사 |
|---|---|---|
| 상세 `**소비처**` ↔ registry `evidence` | **20** (모집단 주의 ↓) | 없음 |
| 상세 `**한 줄**` ↔ registry `summary` | **7** | 없음 |
| 상세 헤더 `종류`/`값`/`기본값` ↔ registry | **2** | 없음 |
| 색인 TOC 도메인 개수 | **2 / 8** | 없음 |
| 상세 앵커 부재 | 0 | L12(enum·list만) |
| `**한 줄**` / `**소비처**` 줄 자체의 부재 | 0 | 없음 |

드리프트한 이름 전체(중복 3):

- **evidence 20** — `MCCP_RECEIPT_GATE_MODE` · `MCCP_SKIP_RECEIPT` ·
  `MCCP_ALLOW_CODEX_UNAVAILABLE` · `MCCP_STOP_LOOP_CODEX` · `MCCP_AUTO_CHAIN_SKIP_PR` ·
  `MCCP_GATE_ROUND_CAP` · `MCCP_FORCE_PR_WITHOUT_IMPECCABLE` · `MCCP_PR_SKIP_CODEX_REVIEW` ·
  `CODEX_DEDUPE_AT_PR` · `MCCP_PLAN_REVIEW_QUORUM` · `MCCP_SANTA_BLIND_LANE` ·
  `MCCP_PLAN_REVIEW_TEST_INVOKE` · `MCCP_DISPATCH_CONTEXT` · `MCCP_AUTO_HANDOFF` ·
  `MCCP_BRIEFING` · `MCCP_BRIEFING_AUTODISABLE_TIER` · `MCCP_SESSION_ID` ·
  `MCCP_A3_READ_USER_MEMORY` · `CLAUDE_SESSION_ID` · `IMPECCABLE_FORCE_OVERRIDE_REASON`
- **summary 7** — `MCCP_AUTO_CHAIN_SKIP_PR` · `MCCP_PLAN_REVIEW_L3` ·
  `MCCP_PLAN_REVIEW_QUORUM` · `MCCP_SANTA_DELTA_SCOPE` · `MCCP_CONTEXT_MONITOR_COST_MODE` ·
  `MCCP_SESSION_ID` · `CLAUDE_SESSION_ID`
- **헤더 2** — `MCCP_WORK_PARALLEL_AUTODISABLE_TIER` · `MCCP_PLAN_FANOUT_AUTODISABLE_TIER`
  (둘 다 `default === ''`를 문서가 `빈 값`으로 적었다 — 진짜 어긋남이 아니라 **표기 규약
  미정**이다)
- **TOC 2** — `gates` 선언 21 / 실제 22 · `review` 선언 26 / 실제 29 (M3가 더한 항목들)

`MCCP_RECEIPT_GATE_MODE`의 상세 문서는 소비처를 `receipt-prompt.js:217`이라 적고 레지스트리는
`:354`를 가리킨다. **레지스트리 쪽이 정본이다** — L8이 그 경로·행 범위를, L10이 "그 행 ±2에
그 이름이 있는가"를 실제로 검증하는 반면, 문서의 사본은 **어느 검사도 읽지 않는다.**

> **evidence 20의 모집단을 정확히 적는다** (L2 패널 지적 반영). 이 측정은 `**소비처**`
> 뒤에 backtick code span이 오는 줄만 비교했다. `not-consumed` 19건의 `**소비처**`는
> 코드 스팬이 아니라 다중행 산문이라 **측정에서 빠졌다** — 「드리프트 없음」이 아니라
> 「측정 대상 아님」이다. 그 19건은 Task 1이 오라클 **미소유**로 선언하므로 L13의
> 사거리 밖이고, 따라서 이 누락이 규칙으로 전이되지는 않는다. 총 165건 = 소유 대상
> 129건(active 계열, retired 17 · not-consumed 19 제외) + 미소유 36건이며, 드리프트
> 31건은 전부 소유 대상 안에서 나왔다.

### G3. UI5의 위험(대량 실패)은 이 검사에 대해 실현되지 않는다

PRD가 최상위 Risk로 둔 "검사를 켜는 순간 대량 실패"는 실측으로 **165건 중 31건**이고, 그중
27건이 기계적 재생성으로 닫히며 4건만 판단을 요구한다(헤더 표기 2 + TOC 2는 자동). M2가
상세 문서를 정규화해 둔 덕이며, 앵커 부재 0 · 헤더 부재 0 · 한 줄 부재 0 · 소비처 부재 0이
그 근거다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 판정 코어 분리 | `plugins/mccp/scripts/lib/env-contract/evidence-name.js:44` | fs를 만지지 않는 순수 함수로 판정을 소유하고 `lint.js`가 fs와 범위만 댄다. fixture registry로 단위 test 가능해지는 유일한 지점 |
| 정본 오라클 · 2소비처 | `plugins/mccp/scripts/lib/command-body/{rules,lint}.js` (M5) | 고정 사본을 오라클 소비로 이전해 두 표면이 갈라질 수 없게 만든다 |
| lint 검사 등록 | `plugins/mccp/scripts/lib/env-contract/lint.js:781` L12 | `checks.L<N> = fail(<한 줄 주장>, problems)` + `.notes` / `.targets` |
| 검사별 fixture test | `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js:3` | 검사마다 **그것 하나만** 위반하는 fixture를 만들고 그 검사만 붉은지 본다. fixture 없는 검사는 «검사되지 않음» |
| CLI 서브커맨드 | `plugins/mccp/scripts/lib/env-contract/cli.js:26` | `USAGE` 상수 + `COMMANDS` 화이트리스트 + `COMMAND_FLAGS` 명시 + 오용 exit 2 |
| CI 배선 | `.github/workflows/env-contract-drift.yml` | paths 필터는 **판정 입력 전체**를 덮는다. GitHub는 매칭 0이면 워크플로를 통째로 건너뛰므로 좁은 필터는 게이트를 죽은 코드로 만든다 |
| 레지스트리 = 선언, 문서 = 투영 | `plugins/mccp/scripts/lib/env-contract/registry.js:5` | "선언이 하나이고 나머지는 그 **투영**이다" — 수리 방향의 근거 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/env-contract/docgen.js` | CREATE | 파생 블록 렌더링 + 대조의 **순수** 오라클. fs 없음 |
| `plugins/mccp/scripts/lib/env-contract/tests/docgen.test.js` | CREATE | 오라클 단위 test — 렌더 형태 · 대조 판정 · status 분기 · 표기 규약 |
| `plugins/mccp/scripts/lib/env-contract/docgen-apply.js` | CREATE | 오라클 출력을 문서에 적용하는 fs 계층(읽기·치환·쓰기). 판정은 하지 않는다 |
| `plugins/mccp/scripts/lib/env-contract/tests/docgen-apply.test.js` | CREATE | **`--write`를 실제로 돌리는** 유일한 test — 임시 트리에서 바이트 보존을 단언한다 |
| `plugins/mccp/scripts/lib/env-contract/cli.js` | UPDATE | `docgen` 서브커맨드 추가 (`--check` 기본 · `--write` · `--name` · `--json`) |
| `plugins/mccp/scripts/lib/env-contract/tests/cli.test.js` | UPDATE | `docgen` 플래그 화이트리스트 · 오용 exit 2 · `--check` 종료코드 |
| `plugins/mccp/scripts/lib/env-contract/lint.js` | UPDATE | **L13** — 파생 블록 · TOC 개수의 양방향 대조. 판정은 `docgen`에 위임 |
| `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js` | UPDATE | L13 fixture 5종 + `:226`·`:599`의 `12` pin을 `13`으로 + 합성 baseline 트리에 파생 줄·TOC 토큰 추가 |
| `docs/environment/gates.md` | UPDATE | evidence·summary 드리프트 수리 (오라클 `--write` 산출) |
| `docs/environment/review.md` | UPDATE | 같음 + `MCCP_PLAN_REVIEW_L3`의 초과 산문을 별도 문단으로 이전 |
| `docs/environment/orchestration.md` | UPDATE | 같음 + `AUTODISABLE_TIER` 2건의 빈-기본값 표기 규약 적용 |
| `docs/environment/cost.md` | UPDATE | 같음 |
| `docs/environment/hooks.md` | UPDATE | 같음 |
| `docs/environment/observability.md` | UPDATE | 같음 |
| `docs/environment/external.md` | UPDATE | 같음 |
| `docs/ENVIRONMENT.md` | UPDATE | TOC 도메인 개수 2건 수리 + §3에 `docgen` 사용법 한 문단 |
| `.github/workflows/env-contract-drift.yml` | UPDATE | L13의 판정 입력(`docs/environment/**`)이 이미 필터에 있음을 확인하고 주석에 L13 추가 |
| `CLAUDE.md` | UPDATE | §4 cheat sheet에 `docgen` 한 줄. §3.17의 lint 목록에 L13 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version `1.33.6` → `1.33.7` (§3.7 patch — 단일 milestone) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | page-foot version 동기 (§3.7 4면) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | derived 줄 version 동기 (§3.7 4면) |
| `CHANGELOG.md` | UPDATE | `## [1.33.7]` 항목 |
| `.claude/prds/env-contract-integrity.prd.md` | UPDATE | milestone #4 행을 `in-progress` → `complete` + Plan 경로 |

## Tasks

### Task 1: `docgen.js` — 파생 블록의 정본 오라클

- **Action**: fs를 만지지 않는 순수 모듈. 두 축을 export한다.
  - `renderDerived(entry)` → `{ headerLine, summaryLine, evidenceLine, indexRow, exampleSkeleton }`.
    전부 레지스트리 열(`kind` · `values` · `default` · `summary` · `evidence` · `domain`)에서만
    파생한다. 새 선언원을 만들지 않는다 (`plugins/mccp/scripts/lib/env-contract/cli.js:4`의 규약).
  - `compareDerived({ entry, sectionBody, indexRow })` → `problems[]`. 각 problem은
    `{ name, surface, expected, actual }`이며 **surface는 열거된 상수**다
    (`header` · `summary` · `evidence` · `index-row` · `toc-count`).
  - `renderTocCounts(entries)` → `{ [domain]: n }`.
- **표기 규약 3건을 여기서 확정한다** (G2가 남긴 판단):
  1. `default === ''` → 문서 표기는 `` `` `` 가 아니라 **`빈 값`**. 오늘 2건이 이미
     그렇게 적혀 있으므로 관례를 코드로 승격하는 것이고 문서를 고치는 것이 아니다.
  2. `default === null` → **`없음 (미설정이 기본)`** — 오늘 `string` kind 전체의 표기.
  3. `values === null` → **`자유 문자열`** (string) / `int`는 `—`. 오늘의 표기 그대로.
  이 셋은 `docgen.js`의 frozen 상수로 두고 test가 열거를 봉인한다. 규약을 코드가 갖지
  않으면 «검사가 요구하는 표기»가 산문에만 있고 두 표면이 다시 갈라진다.
- **status 분기는 evidence 축에만 걸고, 그 분기는 «부재 요구»가 아니라 «미소유»다**
  (L2 패널 architect·invariant HIGH 흡수). `not-consumed` 19건의 `evidence`는 read site가
  아니라 `docs/environment/*.md` 앵커를 가리킨다(`plugins/mccp/scripts/lib/env-contract/registry.js:48`).
  `renderDerived`는 그 부류에 `evidenceLine: null`을 돌려주고 `compareDerived`는 evidence
  축을 **통째로 건너뛴다**. `--write`도 그 줄을 건드리지 않는다.

  **초안은 여기서 «줄 자체가 없어야 한다»고 적었고 그것은 거짓이었다.** 실측하면 19건
  **전부**가 `**소비처**` 줄을 갖고 **전부 다음 줄로 이어지는 다중행 산문**이다
  (`docs/environment/external.md:289` — "**소비처** mccp는 이 변수를 **읽지 않는다** —
  impeccable 본문이 읽는다…"). 부재를 요구했다면 L13은 켜는 순간 19건에서 붉어지고
  (UI5의 "먼저 채우고 켠다"가 무너진다), 그 줄을 «오라클이 소유하는 줄»로 선언한
  `--write`는 사람이 쓴 진단 안내를 **삭제**했을 것이다 — 이 계획이 최상위 Risk로 든
  바로 그 유실이다.

  **초안이 그것을 «정합한다»고 오판한 경로를 기록해 둔다.** G2의 드리프트 측정이
  `**소비처**` 뒤에 **backtick code span**을 요구하는 정규식을 썼는데, 이 19건의 줄은
  코드 스팬이 아니라 산문으로 시작한다. 즉 그들은 «드리프트 없음»이 아니라 **측정에서
  통째로 빠져 있었다.** 따라서 G2의 «evidence 20»은 정확히 «코드 스팬 형태의 `**소비처**`
  줄을 가진 항목 중 20건»이고, 19건은 그 모집단 **밖**이다. 오라클의 소유 판정은
  정규식 형태가 아니라 `status`로 하므로 이 측정 결함이 규칙에 전이되지는 않는다.
- **Mirror**: `evidence-name.js` — 순수 판정 코어, 주입 가능, fs 없음.
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/docgen.test.js`

### Task 2: `docgen-apply.js` + `cli.js docgen` — 생성과 수리

- **Action**: fs 계층은 **판정하지 않는다** — 문서를 읽어 절 본문을 잘라 오라클에 넘기고,
  오라클이 돌려준 기대값으로 **자기가 소유한 줄만** 치환한다. 소유하는 줄은 정확히 넷:
  `**종류** …` 헤더 1줄 · `**한 줄** …` 1줄 · `**소비처** …` 1줄(단 `not-consumed`는
  미소유 — Task 1) · 색인 표의 그 이름 행. 더하여 TOC의 `(N개)` 토큰. **그 밖의 어떤
  바이트도 건드리지 않는다** — 특히 `**값별 결과**` · `**멤버 어휘**` · `**극성**` ·
  `**v1.29.0 원문**` 블록은 사람의 판단이자 이력이고, 기계가 다시 쓰면 M4가 닫으려는
  것과 같은 종류의 거짓이 된다.
- **소유 판정은 «1줄»이 아니라 «오라클이 값을 갖는 줄»이다.** 소유하는 세 줄은 전부
  단일 줄 형태(`**X** <값>`)로만 존재하며, 다중행 산문을 갖는 `**소비처**`는 정확히
  `not-consumed` 부류이고 그 부류는 미소유다. 두 규칙이 함께여야 "1줄만 치환"이
  안전하다 — 어느 하나만 있으면 다중행 산문의 첫 줄만 갈아치우고 나머지를 고아로
  남긴다(L2 패널 architect HIGH 흡수).
- **`retired` 도메인은 L13과 `docgen` 범위 밖이다 — 그 제외를 선언한다.** L7이 사용
  예시를, L12가 값별 결과 블록을 같은 근거로 면제하며(`plugins/mccp/scripts/lib/env-contract/lint.js:797`),
  `docs/environment/retired.md:11`은 "여기 있는 이름에는 **사용 예시가 없다**"를 규약으로
  명시한다. 형제 검사와 다르게 잡으면 M4가 그 규약과 정면 충돌한다. 실측상 retired 17건은
  드리프트 목록에 없으므로 제외의 오늘 비용은 0이며, 제외가 **우연이 아니라 선언**이라는
  점이 요지다(L2 패널 architect MEDIUM 흡수).
- 앵커가 아예 없는 토글에는 절을 **생성**한다(UI1 전반부). 생성물은 `### NAME` 앵커 +
  **파생 줄뿐**이고, 판단이 필요한 자리에는 `<!-- TODO(env-contract): 값별 결과 -->`
  형태의 표시를 남긴다.

  **생성기는 `**사용 예시**` 블록을 만들지 않는다.** 초안은 그것을 생성물에 넣고서
  "그 표시는 L7/L12를 만족시키지 못한다"고 적었는데 **거짓이었다**(L2 패널
  security·invariant HIGH 흡수). L12는 `e.kind === 'enum' || e.kind === 'list'`만 대상으로
  하고(`plugins/mccp/scripts/lib/env-contract/lint.js:797`), L7이 요구하는 것은 `사용 예시`
  문자열 + json/bash fence + (JSON이 그 이름 키를 가질 때만) values 정합이 전부라 **전부
  기계 생성 가능**하다(`plugins/mccp/scripts/lib/env-contract/lint.js:491`). 즉 초안대로면
  새 **bool** 토글에서 L2·L3·L7·L12·L13이 모두 green이 되어 판단 산문이 HTML 주석뿐인
  빈 문서가 착지한다 — G1이 실측한 차단 연쇄의 마지막 고리(L7)를 M4가 스스로
  만족시켜 **UI1 후반부를 후퇴시킨다.**

  블록을 만들지 않으면 L7이 `no 사용 예시 block`으로 붉은 채 남고, 저자가 실제 예시를
  쓸 때까지 착지가 막힌다. "생성이 게이트를 약화시키지 않는다"는 이 방식에서만 참이며,
  그 참·거짓은 Acceptance (b)가 **bool 토글로** 실측한다.
- `cli.js`에 `docgen` 추가: 기본 `--check`(대조만, 드리프트 있으면 exit 1) ·
  `--write`(수리·생성) · `--name <NAME>`(1건 한정) · `--json`. `COMMANDS`·`COMMAND_FLAGS`
  화이트리스트에 등재해 오탈자가 exit 2로 돌아오게 한다.
- **Mirror**: `plugins/mccp/scripts/lib/env-contract/cli.js:44` `COMMAND_FLAGS` — "열거하지 않으면 조용히 무시되고 그 침묵이
  잘못된 결론을 만든다".
- **Validate**:
  ```bash
  node plugins/mccp/scripts/lib/env-contract/cli.js docgen --check --json
  node plugins/mccp/scripts/lib/env-contract/cli.js docgen --bogus   # exit 2
  node --test plugins/mccp/scripts/lib/env-contract/tests/cli.test.js
  node --test plugins/mccp/scripts/lib/env-contract/tests/docgen-apply.test.js
  ```
- **`docgen-apply.test.js`가 `--write`를 실제로 돌리는 유일한 지점이다** (L2 패널 test
  HIGH 흡수). 이 모듈은 git-tracked 문서 9장을 다시 쓰는 이 계획의 유일한 파괴적
  구성요소인데, 초안은 그것에 test 파일도 `--write`를 부르는 Validate 줄도 주지 않았고
  바이트 보존 주장의 근거를 Task 3의 **사람 눈**에만 맡겼다. test는 임시 트리에
  (a) 소유 3줄 + 판단 산문 + `**v1.29.0 원문**` 블록을 가진 절, (b) `not-consumed` 다중행
  산문 절, (c) 앵커 부재 절을 만들고 `--write` 후 **소유 줄 외 전 바이트가 동일한지**를
  단언한다. 회귀가 산문을 지우면 여기서 붉어진다.

### Task 3: 측정된 31건 수리 — 켜기 **전에** (UI5)

- **Action**: `docgen --write`를 돌려 evidence 20 · summary 7 · TOC 2를 재생성하고,
  헤더 2건은 Task 1이 확정한 표기 규약이 적용되는지 확인한다.
- **검증은 `docgen --check`가 아니라 diff의 «모양»이다** (L2 패널 test MEDIUM 흡수).
  같은 오라클이 쓰고 같은 오라클이 검사하므로 `--check` exit 0은 순환이며 잘못된 렌더링
  규칙에서도 green이다. 그래서 Task 3의 판정 도구는 **독립적인 diff 형태 검사**다:
  `git diff -U0 -- docs/` 의 모든 `+`/`-` 줄이 소유 집합(`**종류**` · `**한 줄**` ·
  `**소비처**` · 색인 행 · TOC `(N개)`)의 형태에 속하는지를 기계적으로 대조하고, 하나라도
  벗어나면 Task 2의 결함이므로 문서가 아니라 코드를 고친다. 사람의 눈이 아니라 이 대조가
  "산문을 지우지 않았다"의 증거다.
- **`MCCP_PLAN_REVIEW_L3`은 손으로 처리한다.** 165개 중 유일하게 `**한 줄**` 줄에 초과
  산문을 실은 항목이다(실측 long-summary-lines = 1). 그 문장("`MCCP_PLAN_REVIEW=hybrid`와
  반드시 함께 설정한다 — 하나만 켜면 5.2a-0이 에이전트 0개로 조기 HALT한다")은 **버리지
  않고** 바로 아래 독립 문단으로 옮긴다. `--write`가 그 줄을 통째로 갈아치우면 실제
  운영 지식이 소실된다 — 수리가 유실이 되는 유일한 지점이라 자동화하지 않는다.
- **방향은 예외 없이 레지스트리 → 문서다.** 근거는 G2: 레지스트리의 `evidence`는 L8(실재·범위)과
  L10(±2행 이름)이 검증하고 `summary`는 L2가 색인과 대조하는 반면, 문서의 사본은 어느
  검사도 읽지 않는다. 검증된 쪽이 정본이다.
- **Validate**:
  ```bash
  node plugins/mccp/scripts/lib/env-contract/cli.js docgen --check      # exit 0
  git diff -U0 -- docs/ | grep -E '^[+-]' | grep -vE '^[+-]{3}' \
    | grep -vE '^[+-](\*\*종류\*\*|\*\*한 줄\*\*|\*\*소비처\*\* `|\|`[A-Z]|- \[)' \
    && echo 'UNOWNED LINE CHANGED — fix docgen-apply, not the docs' && exit 1 || true
  ```

### Task 4: lint **L13** — 착지 차단

- **Action**: `checks.L13`을 추가한다. 주장은 한 줄로 —
  *"detail docs derive their header, summary and evidence lines from the registry"*.
  판정은 `docgen.compareDerived`에 위임하고 `lint.js`는 파일 읽기와 절 잘라내기만 한다.
  TOC 개수도 같은 검사에 넣는다(같은 질문의 색인 쪽 절반이다).
- **L12를 대체하지 않는다.** L12는 사람이 쓴 `값별 결과`/`멤버 어휘` 산문이 선언된 값을
  빠짐없이 다루는지 보고, L13은 기계가 파생할 수 있는 줄이 파생값과 같은지 본다. 두
  질문이 다르므로 둘 다 남는다.
- **fail-closed**: 읽기 실패는 통과가 아니라 drift로 보고한다 (`plugins/mccp/scripts/lib/env-contract/lint.js:5`의 규약).
- **Mirror**: `plugins/mccp/scripts/lib/env-contract/lint.js:781` L12의 등록 형태(`fail(...)` + `.notes` + `.targets`).
- **Validate**: `node plugins/mccp/scripts/lib/env-contract/lint.js` → L1~L13 전부 ok

### Task 5: L13 fixture test — 붉어지는지 확인

- **Action**: `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js`에 L13만 위반하는 fixture **4종**을 더한다 — 헤더 default
  불일치 · `**한 줄**` 불일치 · `**소비처**` 불일치 · TOC 개수 불일치. 각각에서 **L13만**
  붉고 나머지 12개가 ok인지 단언한다.
- **역방향 fixture 1종을 더한다**: `not-consumed` 항목의 `**소비처**` 산문을 레지스트리
  `evidence`와 다르게 두어도 L13이 **붉지 않아야** 한다(Task 1의 미소유 규칙). 그 방향이
  없으면 «미소유»가 산문에만 있고 코드는 소유하는 상태로 조용히 되돌아간다 —
  `plugins/mccp/scripts/lib/env-contract/evidence-name.js:17`이 같은 이유로 양방향을 요구한다.
  **초안은 여기서 «줄이 있으면 붉어야 한다»고 적었고**, 그것은 Task 1이 정정한 「부재
  요구」 규칙에서 파생된 것이라 함께 뒤집힌다.
- **기존 pin 2개를 함께 옮긴다** (L2 패널 test MEDIUM 흡수). `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js:226`의
  `assert.equal(Object.keys(r.checks).length, 12)`와 `:599`의 `assert.equal(negativeFixtures, 12, …)`는
  검사 수를 리터럴로 고정하므로 L13 추가와 **같은 커밋에서** `13`으로 올라가야 한다.
  더불어 `:218` baseline은 합성 `makeRepo()` 트리에서 전 검사가 green일 것을 요구하는데,
  그 트리에는 `**종류**`·`**한 줄**`·`**소비처**` 줄도 TOC `(N개)` 토큰도 없어 **L13이
  즉시 붉는다** — 합성 fixture에 그 줄들을 더하는 것이 Task 5의 실제 작업량 대부분이다.
  세 지점을 명시하지 않으면 "기존 12검사 무영향"은 검증 없는 주장이 된다.
- **Mirror**: `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js:3` — "fixture가 없는 검사는 «통과»가 아니라 «검사되지 않음»".
- **Validate**: `node --test plugins/mccp/scripts/lib/env-contract/tests/lint.test.js`

### Task 6: 배선 · 문서 · 버전

- **Action**:
  - `.github/workflows/env-contract-drift.yml` — paths 필터에 `docs/environment/**`와
    `docs/ENVIRONMENT.md`가 **이미 있음을 확인**하고(현재 파일에 존재), 헤더 주석에 L13이
    무엇을 지키는지 한 문단 추가. 필터가 이미 충분하므로 **넓히지 않는다** — 넓히면
    검증하지 않은 축이 붉어진다(§3.17 M6이 L10 역방향에서 내린 같은 판단).
  - `CLAUDE.md` §4에 `docgen` 한 줄, §3.17의 lint 범위 표기를 `L1~L13`으로.
  - `docs/ENVIRONMENT.md` §3에 "새 토글을 더할 때"의 한 문단 — `docgen --write` → 판단
    산문 채우기 → `lint`.
  - version `1.33.6` → `1.33.7` + **동기 4면**(plugin.json · `renderer/html.js` page-foot ·
    `renderer/markdown.js` derived 줄 · CHANGELOG). **§3.7 forward-only**: 이 번호는
    `origin/main` 머지 시점과 `/mccp:pr` 진입 직전에 **다시 계산한다**(재발 8회).
- **Validate**:
  ```bash
  node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
  node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md     --ledger docs/multi-session-work-loop/instruction-contract.md   # §3.17 편집 축
  node -e "require('js-yaml')" 2>/dev/null || node -e "
    const y=require('fs').readFileSync('.github/workflows/env-contract-drift.yml','utf8');
    if(!/docs/environment/**/.test(y)) { console.error('paths filter lost L13 input'); process.exit(1); }
    console.log('CI paths filter still covers L13 decision inputs');"
  ```

## Validation

```bash
# 1. 새 오라클 + 소비처
node --test plugins/mccp/scripts/lib/env-contract/tests/docgen.test.js
node --test plugins/mccp/scripts/lib/env-contract/tests/docgen-apply.test.js
node --test plugins/mccp/scripts/lib/env-contract/tests/cli.test.js
node --test plugins/mccp/scripts/lib/env-contract/tests/lint.test.js

# 2. 계약 전체 — L1~L13 전부 ok (L13이 새로 추가됨)
node plugins/mccp/scripts/lib/env-contract/lint.js

# 3. 드리프트 0 — Task 3의 수리가 실제로 닫혔는가
node plugins/mccp/scripts/lib/env-contract/cli.js docgen --check

# 4. 기존 env-contract 표면 무영향
node --test plugins/mccp/scripts/lib/env-contract/tests/registry.test.js
node --test plugins/mccp/scripts/lib/env-contract/tests/vocabulary.test.js
node --test plugins/mccp/scripts/lib/env-contract/tests/doctor.test.js
node --test plugins/mccp/scripts/lib/env-contract/tests/evidence-debt.test.js
node --test plugins/mccp/scripts/lib/env-contract/tests/value.test.js
node plugins/mccp/scripts/lib/env-contract/measure-evidence.js --json

# 5. version 동기 4면
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 6. 인접 계약 회귀 (M3 원장 · 명령 본문 오라클)
node --test plugins/mccp/scripts/lib/review-rounds/tests/*.test.js
node plugins/mccp/scripts/lib/command-body/lint.js
node plugins/mccp/scripts/lib/instruction-contract/lint.js --claude CLAUDE.md --ledger docs/multi-session-work-loop/instruction-contract.md
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `--write`가 오라클이 소유하지 않는 줄을 건드려 사람이 쓴 산문을 지운다 | 중간 | 소유 줄을 **정확히 5종으로 열거**하고 그 밖은 바이트 단위로 보존. `not-consumed`의 다중행 `**소비처**` 산문은 **미소유**라 애초에 사거리 밖(Task 1). 증거는 사람 눈이 아니라 `docgen-apply.test.js`의 바이트 보존 단언 + Task 3의 diff 형태 대조. 유일한 알려진 유실 지점(`MCCP_PLAN_REVIEW_L3`)은 자동화하지 않고 손으로 이전 |
| L13이 `not-consumed` 19건을 오탐해 착지가 막힌다 | ~~중간~~ **실현됐다 (초안 기준)** | 초안의 「부재 요구」는 19/19에서 즉시 붉었을 것이다 — L2 패널이 실측으로 반증했고 Task 1이 **미소유**로 정정했다. Task 5의 역방향 fixture가 그 정정을 봉인한다 |
| 표기 규약(빈 값 · 없음 · 자유 문자열)이 실제 코퍼스와 어긋나 대량 실패 | 낮음 | 규약은 **오늘의 표기를 코드로 승격**하는 것이며 새로 정하지 않는다. G2 실측이 헤더 불일치 2건뿐임을 보였고 그 2건이 정확히 이 규약의 대상 |
| 생성 기능이 게이트를 약화시킨다 — 생성물이 L7을 스스로 만족시켜 빈 문서가 통과 | ~~낮음~~ **실현됐다 (초안 기준)** | 초안이 생성물에 `**사용 예시**` JSON 블록을 넣었고, L12가 enum·list만 대상이라 bool 토글에서 전 검사가 green이 됐을 것이다(`lint.js:797`·`:491`). L2 패널이 반증했고 Task 2가 **블록을 생성하지 않는 것**으로 정정했다. Acceptance (b)가 bool로 실측한다 |
| PRD의 UI4(evidence 98건 재생성 금지)와 충돌로 읽힌다 | 중간 | 레지스트리 `evidence` **값은 불변**이고 문서 사본만 동기화한다. User Intent 표 아래에 명시했고 리뷰어가 그렇게 판단하면 adjudication에서 다룬다 |
| §3.7 병렬 브랜치 version 충돌 (재발 8회) | 높음 | 번호를 미리 확정하지 않고 머지 해소 시점 + `/mccp:pr` 진입 직전 두 번 재계산. 재상향 후 동기 4면 검증 전량 재실행 |
| CI가 붉어도 머지를 막지 않는다 (branch protection은 저장소 설정) | 확실 | 범위 밖임을 명시. `env-contract-drift.yml`이 이미 같은 한계를 헤더에 적고 있으며 M4는 그 주장을 넓히지 않는다 |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes
- [ ] Patterns mirrored, not reinvented
- [ ] **게이트/경로를 실제로 1회 완주하고 산출물을 확인** — 구체적으로:
      (a) `docgen --check`가 수리 **전에** exit 1과 31건을 보고하고 **후에** exit 0인 것을
      같은 사이클에서 관측한다. (b) 레지스트리에 임시 토글을 **`kind: 'bool'`로** 심고
      `docgen --write` → lint가 **여전히 붉은지**(`L7: no 사용 예시 block`) → 예시를
      손으로 채우면 green인지를 실제로 돌려 본다. **kind를 bool로 못박는 것이 이 항목의
      전부다** — L12는 enum·list만 대상으로 하므로 enum을 고르면 L12가 대신 붉어져 L7의
      차단력을 실측하지 못하고, 게이트 강도가 실행자의 kind 선택에 좌우된다(L2 패널
      security·invariant MEDIUM 흡수). (c) `lint.js`가 L13을 포함해 13행을 출력한다. 단위 test가 초록인 것은 (a)(b)(c)
      중 무엇도 증명하지 않는다
- [ ] `git diff --diff-filter=D --name-only origin/main...HEAD`가 비어 있다 (§3.5.1)
- [ ] version 동기 4면 일치

## Out of Scope (이 마일스톤이 하지 않는 것)

- 온보딩 walkthrough · 에디터 스키마 · 전용 열람 페이지 (UI2 — M5·M6)
- `doctor`를 게이트로 편입 (UI3)
- 레지스트리 `evidence` **값** 자체의 재생성 (UI4)
- 레지스트리 밖 토글의 은퇴 (UI6)
- `값별 결과` · `멤버 어휘` 산문의 생성 — L7/L12가 소유하는 사람의 판단이다
- CI 실패가 머지를 **차단**하게 만드는 것 — 저장소 설정이며 파일로 표현 불가
- 이 검사를 끄는 새 환경변수 — 수리가 같은 커밋에 있으므로 단계적 배포가 필요 없고,
  토글을 더하는 것 자체가 또 하나의 문서 표면이다

## Design Critique

- 호출: `Skill(impeccable, "critique …")` — call form은 오라클이 해소했다
  (`impeccable_invocation=impeccable` · source `user` · v4.0.4 · `~/.claude/skills/impeccable/SKILL.md`,
  shadowed=false). 하드코딩한 bare 리터럴이 아니다 (§3.17 M3)
- 라운드: 1 / cap 2 · 판정 **CONVERGED** (R0에서 수렴)
- 트리거: `design_signal=true` — plan의 `Files to Change`가 `renderer/html.js`와
  `renderer/markdown.js`를 선언했기 때문이다. 두 항목의 실제 변경은 **version 문자열
  동기 1건씩**(`v1.33.6` → `v1.33.7`)이며 §3.7이 의무화한 4면 동기의 일부다.

4개 Output Constraints 판정 — 전부 미저촉, 근거는 실측이다:

| # | 제약 | 판정 | 근거 |
|---|---|---|---|
| 1 | 정보 위계 3단계 (heading depth ≤ 3) | 미저촉 | 변경이 heading을 더하지 않는다. 이 plan 자신도 `#{4,6}` 0건 |
| 2 | 강조색 화면당 1개 | 미저촉 | `html.js:1419`의 대상은 `.page-foot mono` footer이고 accent 토큰을 쓰지 않는다. 바뀌는 것은 숫자 한 자리 |
| 3 | raw markdown marker 금지 | 미저촉 | `html.js`는 실제 HTML을, `markdown.js:163`은 기존 `_…_` 래퍼 **안쪽**을 바꾼다. 렌더되지 않은 marker가 새로 노출되지 않는다 |
| 4 | 한 화면 항목 수 상한 (list-of-N) | 미저촉 | 이 anchor의 기계 소유자는 `renderer/output-constraints.js`(H1~H19)이고 그 대상은 렌더된 `status.html`이다. 본 계획은 그 표면에 list-of-N 절을 더하지 않는다 |

**backlog 이연 (LOW, §3.14)** — `renderer/html.js`가 §3.7의 4면 동기 대상이라
**모든 milestone이 version bump만으로 `design_signal=true`를 발화**시킨다. 즉 이 축의
탐지는 "디자인이 바뀌었다"가 아니라 "버전을 올렸다"를 신호로 삼고 있다. 실재하는
신호 품질 문제지만 본 계획에 귀속되지 않는 선재 조건이고 severity가 LOW라
`codex-findings-backlog.md`로 이연한다.

## Design Routing Guide

routing mode: `auto` (implement 단계에서 유효). plan 단계는 렌더된 UI가 없으므로
어떤 impeccable 명령도 **호출하지 않으며**, 아래는 구현자를 위한 체크리스트다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

## Plan Review (L2 refutation panel)

- 모드 `multi-agent` · quorum 3 of 4 · 1라운드 (§3.16 — 캡 1, 원장 강제)
- `reviewed_plan_hash`(리뷰 시점) `sha256:28a3bf8ae83db4f125a01cc44208fe58416002de8012439de5d40c3deb3122f3`
- 판정 **divergent** — 4명 전원 `fail`, blocking finding 10건
- L1은 최초 `divergent`(C6 미해소 인용 1건) → bare 파일명 7건을 repo-root 경로로 정정 후 `converged`
- 기록: `.claude/reviews/plan-review-env-contract-integrity.md` (halt_stage 5.2e)

### 흡수 — HIGH 4건 (§3.14 수용 임계)

| # | 리뷰어 | 지적 | 이 계획의 정정 |
|---|---|---|---|
| H1 | architect · invariant | `not-consumed` 규칙이 「`**소비처**` 줄 부재」를 요구하는데 19/19가 그 줄을 갖는다 — L13은 켜는 순간 붉고 `--write`는 산문을 지운다 | Task 1: 「부재 요구」 → **미소유**. 오라클이 그 축을 건너뛴다 |
| H2 | security · invariant | 생성물의 `사용 예시` 블록이 L7을 스스로 만족시켜 bool 토글에서 전 검사 green — UI1 후반부가 **후퇴**한다 | Task 2: 생성기가 `사용 예시`를 **만들지 않는다**. L7이 붉은 채 남는다 |
| H3 | architect | `not-consumed`의 `**소비처**`는 2줄 산문이라 「1줄 소유」 추상화가 깨진다 | Task 2: 소유 판정을 「1줄」이 아니라 「오라클이 값을 갖는 줄」로 재정의 |
| H4 | test | `docgen-apply.js`(유일한 파괴적 모듈)에 test도 `--write` Validate도 없다 | `docgen-apply.test.js` 신설 — 바이트 보존을 단언하는 유일 지점 |

**H1은 이 계획의 측정 결함이었다.** 드리프트 측정 정규식이 backtick code span을 요구해
19건을 통째로 놓쳤고, 그 침묵을 「정합한다」로 읽었다. G2에 모집단 주석을 달았다.

### 흡수 — 위 HIGH와 분리 불가한 MEDIUM 4건

`retired` 도메인 범위 선언(architect) · Acceptance (b)의 kind를 `bool`로 못박기
(security·invariant) · Task 3 검증의 순환 제거(test) · `plugins/mccp/scripts/lib/env-contract/tests/lint.test.js:226`·`:599`의
`12` pin과 합성 baseline 트리(test). 앞의 HIGH를 고치면서 같은 문단을 건드리므로
남겨 두면 정정이 불완전해진다.

### 이연 — LOW 1건

Task 6의 Validate가 자기가 바꾸는 CI·CLAUDE.md를 실행하지 않는다(test/LOW) → 흡수했다
(Validate에 instruction-contract lint + paths 필터 검사 추가). 순수 이연 항목은
`.claude/plans/codex-findings-backlog.md` 참조.

### 게이트 상태 — receipt 미봉인

**`mccp-plan-codex` receipt는 작성되지 않았다.** 5.2e가 exit 12로 HALT했고, 그 뒤 HIGH를
흡수하며 plan 본문이 바뀌어 위 `reviewed_plan_hash`와 더는 일치하지 않는다(DD13 bind).
라운드 캡이 1로 **기계 강제**되므로(§3.16, v1.33.5 M3) 같은 slug의 패널 재발화는
`emit-workflow-args`가 거부한다 — 원장 `.claude/state/review-rounds/mccp-plan-codex__env-contract-integrity.json`에
panel round 0이 기록돼 있고, `decideRound`가 기록 **이전에** 판정하므로 거부는 라운드를
추가 소모하지도 않는다(실측 확인).

**그리고 체인은 `missing`이 아니라 `stale`이다.** 같은 slug에 M3 사이클의 receipt가 남아
있어 plan hash가 어긋나고(validate exit 2), §1.2대로 `soft` 모드도 stale은 통과시키지
않는다. 즉 «receipt 없이 조용히 진행»되지 않는다 — 다음 게이트가 실제로 막힌다.

실효 복구는 셋이다: (a) **새 slug로 재실행** — `/mccp:plan .claude/plans/env-contract-integrity-m4.plan.md`
(slug `env-contract-integrity-m4`, 라운드 예산 fresh) · (b) `MCCP_SKIP_RECEIPT=1` 1회 감사
우회 · (c) plan 보완 후 (a). 어느 쪽이든 사용자 판단이다.

**사용자는 (a)를 택했다** (2026-09-01). 이 본문은 위 HIGH 4건·MEDIUM 4건을 흡수한 뒤의
것이며, 게이트는 새 slug `env-contract-integrity-m4`로 다시 돈다 — 같은 plan을 두 번
리뷰하는 것이 아니라 **고쳐진 본문을 처음 리뷰**하는 것이고, 위 `reviewed_plan_hash`는
고치기 **전** 본문의 것이므로 이번 판정과 대조 대상이 아니다.

## Codex Adversarial Review

<!-- placeholder: will be replaced by Phase 7.3 -->
