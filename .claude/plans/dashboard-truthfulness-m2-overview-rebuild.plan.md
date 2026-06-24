# Plan: Dashboard Truthfulness M2 — 개요 → '대시보드' 재구성 + 호스트 버전/위젯/다음 command

**Source PRD**: `.claude/prds/dashboard-truthfulness.prd.md`
**Selected Milestone**: M2 — 개요 → '대시보드' 재구성 + 호스트 버전/위젯/다음 command
**Complexity**: Medium

## Summary

콘솔 셸의 첫 화면(route `overview`)을 카운트-only hero에서 **호스트 프로젝트의 현재 상태를 명시하는 '대시보드'**로 재구성한다. (1) 라우트/네비/탭/STATUS.md 섹션을 '개요'→'대시보드'로 재명명, (2) 버전을 플러그인 self-version이 아닌 **호스트 프로젝트 신호**(host meta→CHANGELOG→git tag→최신 plan cycle→미상 폴백 사다리)에서 derive — provenance를 snapshot 안에 박기 위해 **derive 레이어 additive 필드 `model.host_version`**으로 stamp하고 렌더러는 snapshot만 소비(Codex R1 F2 흡수), (3) 진행중·차단·위험을 카운트가 아닌 **'무엇'인지 항목 이름**으로 나열(top-N + 나머지 접힘), (4) '다음 행동'을 STATE.md `Next Step`에서 추출한 실행가능 `/mccp:*` command(**인자 포함 full command line**, 필수 인자 검증, 미충족 시 prose-only — Codex R1 F1 흡수) + 복사 버튼으로. 렌더 데이터 조립은 dashboard 섹션 모듈(`status-grid.js`) 한 곳에 집중하고, html/markdown 컴포저는 그 산출 cell을 읽기만 한다 — STATUS.md plain-text 동등본 불변.

> 셸·토큰·드로어·copy 톤은 이미 ship된 콘솔 재설계(PR #57~#60)의 계약을 따른다(미감 재탐색 없음). 본 M2는 그 셸 위의 *내용/데이터*만 다룬다.
>
> **Codex R1 흡수**(3 findings, 아래 ## Codex Adversarial Review): (F1) next-action이 command 토큰만 복사 → 인자 누락으로 실행 불가 → **full command line 추출 + 필수-인자 검증 + 미충족 시 prose-only**. (F2) host-version render-time 읽기는 provenance가 snapshot 밖 → **derive 레이어 additive `host_version` 필드로 이동**(렌더러는 snapshot만 소비, 재현 가능). (F3) CHANGELOG-first는 비권위 버전 위험 → **host meta(package.json/pyproject/Cargo) first + CHANGELOG는 source-라벨 폴백 + plan-cycle은 '최신 plan cycle'로 framing**(버전 주장 아님) + `source` 항상 표기.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 렌더 시점 host-file 읽기(주입 가능 fn + fail-open) | `lib/renderer/sections/milestone-history.js:12-27` (`defaultGitCommitTime`) + `:33-54` (`resolveGitCommitTime`) | `opts.fsRead`/`opts.gitCommitTime` 주입, try/catch → null, 다중 후보 사다리 |
| 복사 명령 인자 정리(마커 강등) | `lib/renderer/parsers/action-prompt.js:27-40` (`cleanArg`) + `:13-22` (`quoteArg`/`truncateText`) | 백틱/볼드/링크/em-dash 강등, MD0xx 토큰 깨기, 길이 cap |
| hero 산출 — verdict + action-prompt + 복사버튼 | `lib/renderer/html.js:589-637` (`renderHeroPanel`) + `:558-560` (`looksLikeCommand`) | tone-status dot, `<code>`+`copy-btn[data-copy]`, escapeHtml/escapeAttr |
| 항목 상한 — top-N expanded + 나머지 `<details>` | `lib/renderer/sections/milestone-history.js:200-259` (`MAX_EXPANDED`, `<details class="more">`) | 상위 N 펼침 + `+N 더보기` 접힘, html/md 양쪽 |
| blocked decision SSoT(이름 추출) | `lib/renderer/parsers/decision-state.js:112-126` (`deriveDecisionState`) | `Map<decision_id, {state}>` — state==='blocked' 인 decision_id 가 곧 '무엇' |
| in-progress plan 식별 + 라벨 | `lib/renderer/sections/status-grid.js:31-80` (planStatuses in-progress filter) + `:7-20` (`formatPlanLabel`) | planStatuses Map === 'in-progress' + cycle 라벨 |
| PRD/plan 본문 섹션 파서(fail-open) | `lib/renderer/parsers/plan-body.js:154-180` (`parseRisks`) + `:136-152` (`parseDeliveryMilestonesComplete`) | 정규식 섹션 추출, fail-open → 빈 배열 |
| STATUS.md 동등본 섹션 | `lib/renderer/markdown.js:49-53` (`## 현황` + grid.md) | 섹션 heading + section.md 인라인, anchor 유지 |
| 섹션 산출 shape(추가 필드) | `lib/renderer/sections/milestone-history.js:260` (`return { md, html, details }`) | 컴포저가 destructure 하는 명명 필드 추가 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/derive/host-version.js` | CREATE | (F2 흡수) host-project 버전 신호를 **derive 시점** resolve — 폴백 사다리(host meta→CHANGELOG→git tag→plan cycle→미상, F3 순서). 주입 fn + fail-open → `{ version, source, latest_plan, degraded, error }` |
| `plugins/mccp/scripts/derive/index.js` | UPDATE | (F2) derive 조립 시 `resolveHostVersion` 호출 → `model.host_version` additive 필드 stamp. 기존 source loop과 독립 try/catch(fail-open → degraded) |
| `plugins/mccp/scripts/derive/model.js` | UPDATE | (F2) `emptyModel.host_version`(additive optional) + `validateShape` present-only 검증. MODEL_VERSION 'v1' 유지(additive) |
| `plugins/mccp/scripts/lib/renderer/parsers/next-action.js` | CREATE | STATE.md `body.nextStep`(멀티라인 blob)에서 첫 `/mccp:`·`/codex:` **full command line(인자 포함)** 추출 + 마커 정리 + 필수-인자 검증 + 짧은 prose + 폴백 추론(F1). 순수 함수(model-only) |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATE | dashboard 데이터 조립 일원화 — cell 에 named items(진행중/차단/위험) 추가 + `version`(= `m.host_version` snapshot 소비, **render-time 파일 읽기 없음**) + `nextAction`(STATE.md) 산출. `{ md, html, cells, version, nextAction }` return |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | (a) 라우트/네비/탭 '개요'→'대시보드' 재명명, (b) `renderHeroPanel` 을 named-widget(top-N + 접힘) + host-version 줄 + STATE.md next-action 복사로 재구성, (c) hero CSS 추가, (d) footer v1.18.4 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | `## 현황`→`## 대시보드`(anchor 포함) + host-version·named-widget·next-action plain-text 동등 노출 + footer v1.18.4 |
| `plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js` | CREATE | named-widget(이름 노출·top-N·접힘) + version 줄(`m.host_version` 소비) + next-action(full command line/폴백) + STATUS.md 동등본 회귀 |
| `plugins/mccp/scripts/derive/tests/host-version.test.js` | CREATE | (F2/F3) 폴백 사다리 각 단(meta/CHANGELOG/git tag/plan cycle/미상) + source 라벨 + unreleased/stale CHANGELOG ↔ meta disagreement + fail-open degraded |
| `plugins/mccp/scripts/derive/tests/schema-drift.test.js` | UPDATE | (F2) `host_version` additive 필드 반영 |
| `plugins/mccp/scripts/lib/renderer/tests/next-action.test.js` | CREATE | (F1) blob 에서 full command line(인자 포함) 추출 + 필수-인자 미충족 시 prose-only + 마커 정리 + 폴백 추론(plan path 포함) + 빈 nextStep |
| `plugins/mccp/scripts/lib/renderer/tests/console-shell.test.js` | UPDATE | tb-title `개요`→`대시보드` + nav-link 텍스트 갱신 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | `## 현황`→`## 대시보드` anchor assert |
| `plugins/mccp/scripts/lib/renderer/tests/integration.test.js` | UPDATE | `## 현황`→`## 대시보드` |
| `plugins/mccp/scripts/lib/renderer/tests/renderer-generic.test.js` | UPDATE | `## 현황`→`## 대시보드` markdown invariant |
| `plugins/mccp/scripts/lib/renderer/tests/header-hoist.test.js` | UPDATE | hero/grid cell shape 변경 반영(필요 시) |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATE | hero named-widget shape 변경 반영(필요 시) |
| `plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js` | UPDATE | 신규 위젯의 html↔md 정보 동등 회귀 |
| `docs/v1.3.0-observability/dashboard-surface.md` | UPDATE | 대시보드 재구성 surface(version widget·named widget·next-action) 문서화 |
| `docs/v1.3.0-observability/schema-surface.md` | UPDATE | (F2) derive `model.host_version` additive 필드 스키마 문서화 |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.3 → 1.18.4` (patch — 단일 milestone ship, §3.7) |
| `CHANGELOG.md` | UPDATE | 신규 row |
| `.claude/prds/dashboard-truthfulness.prd.md` | UPDATE | M1 Status `in-progress → complete`(PR #61 ship), M2 `pending → in-progress` + Plan cell |

## Tasks

### Task 1: host-version 폴백 사다리 (derive 레이어, F2/F3 흡수)
- **Action**: `derive/host-version.js` 생성. `resolveHostVersion(repoRoot, opts) → { version, source, latest_plan, degraded, error }`. opts: `{ fsRead, gitDescribe, plans }`(주입 가능, 미주입 시 실제 fs/git). **derive 시점**에 호출돼 `model.host_version`에 stamp → provenance가 snapshot 안에 박혀 재현 가능(렌더러는 이 snapshot만 소비; render-time 파일 읽기 없음, F2 흡수). **폴백 사다리**(첫 hit 채택, F3 순서 — 권위 meta 우선):
  1. host meta — `<repoRoot>/package.json`(`version`) → `pyproject.toml`/`Cargo.toml`(`version`) → `source='meta:<file>'`. **플러그인 cache 경로(`plugins/mccp/.claude-plugin/plugin.json`)는 읽지 않음**(PRD "플러그인 버전 비표시").
  2. `CHANGELOG.md` 최상단 버전 heading — `^##\s*\[?v?(\d+\.\d+\.\d+[^\]\s]*)\]?` 첫 매치 → `source='changelog'`(source 라벨로 corroborated 폴백임을 명시).
  3. `git describe --tags --abbrev=0` (repoRoot) → `source='git-tag'`.
  4. 최신 plan cycle prefix — `plans` items 중 최신(in-progress 우선, 없으면 배열 마지막)의 `v\d+-\d+-\d+` → `vX.Y.Z` (`extractCyclePrefix` 재사용) → `source='plan-cycle'`. **버전 주장이 아니라 '최신 plan cycle' framing**(F3) — 위젯이 source 라벨로 구분.
  5. 전부 miss → `{ version: null, source: 'unknown' }` (정직 '미상').
  `latest_plan` = in-progress plan basename 라벨(없으면 최신 plan), `formatPlanLabel`/`extractCyclePrefix` 재사용. 각 단계 try/catch → 다음 단계, 예외 시 `degraded=true`+`error` 기록. **절대 throw 안 함**(loud fail-open). meta가 CHANGELOG와 불일치해도 meta가 권위 — `source`로 출처를 항상 노출해 사용자가 검증 가능.
- **Mirror**: `derive/sources/ledger.js`(fail-open shape) + `milestone-history.js:12-27`(`defaultGitCommitTime` git 호출) + `plan-body.js:189-193`(`extractCyclePrefix`).
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/host-version.test.js`

### Task 1b: derive model.host_version 와이어 (F2)
- **Action**: `derive/index.js` 조립부에 `model.host_version = resolveHostVersion(repoRoot, { plans: model.sources.plans.items })` 추가(기존 source loop과 독립 try/catch — 실패 시 `{version:null, source:'unknown', degraded:true, error}`). `derive/model.js` `emptyModel`에 `host_version: { version:null, source:'unknown', latest_plan:null, degraded:false, error:null }` 추가 + `validateShape`에 present-only 검증(object 형). MODEL_VERSION 'v1' 유지(additive optional — 기존 소비자 무영향).
- **Mirror**: `derive/index.js:19-27`(source 등록) + `model.js:13-36`(emptyModel) + `:45-83`(validateShape) + M1 ledger source 등록 선례.
- **Validate**: `node --test plugins/mccp/scripts/derive/tests/` (schema-drift 포함 0 회귀) + `node plugins/mccp/scripts/derive/cli.js run --json | grep host_version`.

### Task 2: next-action 파서 (full command line + 필수-인자 검증, F1 흡수)
- **Action**: `parsers/next-action.js` 생성. `resolveNextAction(stateItem, ctx) → { command, args, prose, copyText, source, executable }`. 입력은 derive model 의 `state.item`(순수 — 파일 미읽음).
  - `body.nextStep`(멀티라인 blob)에서 **full command line** 추출(F1 핵심 — 토큰만 아님): 첫 `/(?:mccp|codex):[a-z0-9-]+` 매치 위치부터 **안전 구분자**(개행 / `(` / `,` / 한국어 조사 경계 / 마커)까지의 명령+인자를 캡처. backtick 등 마커는 `cleanArg`(action-prompt)로 강등 후 매치. `command`=명령 토큰, `args`=추출된 인자 문자열(없으면 '').
  - **필수-인자 검증**(F1): `REQUIRES_ARG = { 'mccp:prp-implement','mccp:plan','mccp:plan-prd','mccp:prp-commit','mccp:work' }`. 추출 명령이 이 집합에 속하는데 `args`가 비면 → **command를 copyText로 advertise하지 않음**(prose-only, `executable=false`). 인자 있으면 `copyText = command + ' ' + args`(`executable=true`).
  - `prose` = nextStep 첫 줄(또는 첫 문장)에서 마커 강등 + 길이 cap(~80자). 전체 blob/번호목록은 노출 안 함(Output Constraint 항목 상한).
  - command 부재/비실행 폴백 추론(`source` 기록): `state.resume_state==='in-flight'` → `/mccp:resume`(인자 불요, `executable=true`, `source='resume-state'`); **진행중 plan 있으면 그 plan의 resolved 경로를 인자로 포함**한 `/mccp:prp-implement <plan path>`(`executable=true`, `source='in-progress-plan'` — F1: bare 명령 금지); 그 외 prose-only(`source='prose'`) / 빈 nextStep → `null`+ '대기'(`source='idle'`).
  - command 직접 추출(인자 충족) 시 `source='state-command'`.
  - 렌더러는 `executable=true`일 때만 복사 버튼 부여(`looksLikeCommand` + executable). 비실행이면 prose 표기만.
- **Mirror**: `action-prompt.js:27-40` (`cleanArg`) + `:13-22` (`quoteArg`/`truncateText`) + `html.js:558-560` (`looksLikeCommand`).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/next-action.test.js`

### Task 3: status-grid → dashboard 데이터 조립 일원화
- **Action**: `sections/status-grid.js` 확장. 기존 4 cell(진행중/차단/다음/위험)에 **named items** 추가:
  - `in-progress` cell: `items` = in-progress plan basename 라벨 배열(`formatPlanLabel`).
  - `blocked` cell: `items` = `deriveDecisionState` state==='blocked' decision_id 배열.
  - `risks` cell: `items` = backlog HIGH/CRITICAL finding 텍스트 배열(카운트 소스와 동일 backlog 유지, top-N).
  - 각 items 는 top-N(N=3) + `overflow`(나머지 수) 동반.
  `version` = `m.host_version` **snapshot 소비**(Task 1b가 derive 시점 stamp — status-grid는 파일 안 읽음, F2). `nextAction` = `resolveNextAction(state.item, { plans, planStatuses })`(Task 2) — **기존 `next` cell 로직보다 STATE.md nextStep 우선**, 빈 경우 기존 plan-label/resume 폴백 유지. return shape `{ md, html, cells, version, nextAction }`(기존 소비자 호환 — md/html/cells 불변 키).
- **Mirror**: `status-grid.js:22-124`(기존 cell 조립) + `decision-state.js:112-126` + `milestone-history.js:120-122`(`m.sources.*.items` 소비).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js`

### Task 4: html.js — '대시보드' 재명명 + hero 재구성
- **Action**:
  - **재명명**: nav-link(`html.js:738` `개요`→`대시보드`), tb-title(`:759` data-t="overview" 텍스트), route aria-label(`:774`), `panelIcon`/route id(`overview`)는 유지(앵커 안정성). `data-route="overview"`/`#route-overview` 식별자는 불변(CSS 라우팅 깨짐 방지) — **표시 텍스트만** 변경.
  - **hero 재구성**: `renderHeroPanel` 시그니처에 grid section(`version`/`nextAction`) 전달. 산출: hero-status dot+label → verdict h1 → **next-action**(`nextAction.executable=true`일 때만 command + 복사버튼; 비실행이면 prose만; '대기' 면 생략 — F1) → **host-version 줄**(`<project> · vX.Y.Z · <source>` + plan-cycle source면 '최신 plan cycle' framing; 미상이면 정직 표기 — F3 source 라벨 항상 노출) → **named-widget 3종**(진행중/차단/위험: label + count + top-3 이름 + `+N 더보기` 접힘). axis-legend(카운트-only)는 named-widget 으로 대체.
  - **디자인 제약**(SKILL Output Constraints): 정보 위계 3단계(verdict/next = L1, version·위젯 요약 = L2, 위젯 내 항목 = L3) · 강조색 viewport당 ≤1(차단>0 일 때만 강조 fill, 위험은 amber dot=icon+color 이중표기지만 loud fill 금지, 진행중은 neutral dot) · raw marker 금지(prose 는 `renderProseHtml`/`cleanArg` 경유) · 항목 상한(위젯당 top-3 + 접힘).
  - hero CSS 블록(`:274-304`)에 named-widget 클래스 추가(기존 토큰만 사용, 신규 색 토큰 없음).
  - footer(`:804`) `v1.18.3`→`v1.18.4`.
- **Mirror**: `html.js:589-637`(hero) + `:737-742`(nav) + `:644-663`(panel anatomy 톤) + `milestone-history.js:248-253`(`<details class="more">`).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/console-shell.test.js dashboard-overview.test.js design-invariants.test.js output-constraints.test.js`

### Task 5: markdown.js — STATUS.md 동등본
- **Action**: `## 현황`→`## 대시보드`(섹션 heading + anchor `[현황](#현황)`→`[대시보드](#대시보드)`, `markdown.js:29`). dashboard 섹션 본문에 host-version 줄 + named-widget(진행중/차단/위험 항목 이름, top-N + `<details>` 접힘 md) + next-action(command plain) 노출 — html hero 와 **정보 동등**. footer(`:112`) `v1.18.4`. grid.md 가 이미 cell 요약을 들고 있으면 재사용, 신규 데이터(version/nextAction/items)는 grid section 이 md 로도 산출하게 Task 3 에서 동반.
- **Mirror**: `markdown.js:29-53`(anchor + 현황) + `milestone-history.js:254-259`(md `<details>`).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js i18n-surface.test.js integration.test.js renderer-generic.test.js`

### Task 6: 깨지는 기존 테스트 갱신 + 신규 테스트
- **Action**: 재명명/shape 변경으로 깨지는 assert 갱신(console-shell `개요`→`대시보드`, i18n/integration/renderer-generic `## 현황`→`## 대시보드`, header-hoist·render-integration hero shape). 신규 테스트 3종(dashboard-overview/host-version/next-action) 작성. **headline 회귀**: (a) 진행중 위젯이 in-progress plan 이름을 노출(카운트만 아님), (b) 차단 위젯이 blocked decision_id 노출, (c) version 줄이 CHANGELOG 신호와 일치, (d) next-action 이 STATE.md nextStep blob 에서 `/mccp:resume` 추출.
- **Mirror**: 기존 `sections.test.js`/`console-shell.test.js` assert 스타일.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` (전체 0 회귀).

### Task 7: 문서 + version bump + PRD 갱신
- **Action**: `docs/v1.3.0-observability/dashboard-surface.md` 에 대시보드 재구성 surface(version widget·named widget·next-action·재명명) 추가. plugin.json `1.18.3→1.18.4`. html.js:804 + markdown.js:112 footer `v1.18.4` 동기화. CHANGELOG row. PRD M1 row `in-progress→complete`(PR #61), M2 `pending→in-progress` + Plan cell.
- **Mirror**: §3.7 milestone patch bump + footer 동기화.
- **Validate**: `node -e "require('./plugins/mccp/.claude-plugin/plugin.json').version"` === `1.18.4` + footer grep.

## Validation

```bash
# 신규 파서/섹션 단위 테스트
node --test plugins/mccp/scripts/lib/renderer/tests/host-version.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/next-action.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/dashboard-overview.test.js

# 재명명 + 동등본 회귀
node --test plugins/mccp/scripts/lib/renderer/tests/console-shell.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js

# 디자인 제약 + a11y (Output Constraints lint + 비색 severity)
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/a11y-severity-non-color.test.js

# 전체 렌더러 스위트 (0 회귀)
node --test plugins/mccp/scripts/lib/renderer/tests/

# end-to-end smoke — 실제 render 후 host-version·named widget·next-action 노출 확인
node plugins/mccp/scripts/derive/cli.js render
grep -c "대시보드" .claude/cache/status.html
grep -E "최신 plan|v1\.18" .claude/cache/status.html | head -3

# version/footer 동기화
node -e "console.log(require('./plugins/mccp/.claude-plugin/plugin.json').version)"
grep -n "v1.18.4" plugins/mccp/scripts/lib/renderer/html.js plugins/mccp/scripts/lib/renderer/markdown.js
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| host-version provenance가 snapshot 밖이라 비재현(같은 model이 cwd/git에 따라 다른 버전) | 중 | **F2 흡수** — derive 레이어 `model.host_version`로 이동. 렌더러는 snapshot만 소비 → 재현 가능. derive 변경은 additive top-level 필드(MODEL_VERSION 'v1' 불변). schema-drift 테스트 동반 |
| next-action이 인자 누락한 비실행 command를 advertise(`/mccp:prp-implement` bare) | 중 | **F1 흡수** — full command line 추출 + `REQUIRES_ARG` 검증 + 미충족 시 prose-only(`executable=false`). in-progress 폴백은 resolved plan path를 인자로 포함. next-action 테스트가 가드 |
| CHANGELOG-first가 비권위/unreleased 버전 노출 | 중 | **F3 흡수** — host meta first + CHANGELOG는 source-라벨 폴백 + plan-cycle은 '최신 plan cycle' framing + `source` 항상 노출. meta↔CHANGELOG disagreement 테스트 |
| 강조색 viewport당 ≤1 위반(차단+위험 동시 loud) | 중 | 단일 loud accent = 차단(>0)만 fill. 위험은 amber dot(icon+color 이중표기)이되 loud fill 금지. output-constraints lint + design-invariants 테스트가 가드 |
| named-widget 이 hero 를 과밀화(60초 스캔 훼손, 항목 상한 위반) | 중 | 위젯당 top-3 + `+N 더보기` 접힘 + prose 1줄 cap. impeccable audit/polish 로 ship 전 검증 |
| 재명명이 CSS 라우팅(`#route-overview`/`data-route`) 깨뜨림 | 중 | 식별자 불변 — **표시 텍스트만** 변경(개요→대시보드). console-shell 테스트가 route 식별자 회귀 가드 |
| STATE.md nextStep 폴백 추론이 엉뚱한 command 제시 | 중 | command 직접 추출(state-command) 최우선 + 추론 폴백은 `source` 라벨로 출처 명시 + prose 동반(사용자가 검증 가능) + 빈 시 정직 '대기' |
| host-version 폴백이 프로젝트마다 부재/상이 | 중 | 5단 사다리 + 마지막 '미상' 정직 표기(거짓 버전 금지). 각 단 독립 try/catch |
| 기존 hero/grid 테스트 대량 회귀 | 중 | cell md/html/cells 키 불변(additive) + 깨지는 assert 동반 갱신(Task 6) + 전체 스위트 0 회귀 게이트 |

## Acceptance
- [ ] 모든 task 완료
- [ ] Validation 전부 통과 (신규 + 전체 회귀 0)
- [ ] **headline**: 진행중·차단·위험 위젯이 카운트가 아닌 **항목 이름**을 노출(top-N + 접힘)
- [ ] **headline**: version은 derive `model.host_version` snapshot에서 소비(재현 가능, F2) + host signal(mccp repo=CHANGELOG `1.18.x`)과 일치 + `source` 라벨 노출, 플러그인 self-version 비노출(F3)
- [ ] **headline**: next-action 이 STATE.md `Next Step` blob 에서 **인자 포함 full command line** 추출(F1) + 필수-인자 미충족 시 prose-only(비실행 advertise 금지) + 복사 버튼은 `executable=true`만
- [ ] 라우트/네비/탭/STATUS.md 섹션 '개요'→'대시보드' 재명명(route 식별자 불변)
- [ ] STATUS.md plain-text 동등본 — version·위젯·next-action 동등 노출
- [ ] SKILL Output Constraints 4종 준수(정보위계 3단계 / 강조색 ≤1 / raw marker 0 / 항목 상한) + impeccable audit/polish 통과
- [ ] 패턴 재사용(milestone-history host-read / action-prompt cleanArg / decision-state SSoT) — 재발명 아님
- [ ] plugin.json + 양 footer v1.18.4 동기화

## Open Questions

> Codex R1 검토 완료(아래 ## Codex Adversarial Review). 3 findings 전부 R1 흡수.

- **(해소·F2) host-version 위치**: render-time 읽기 → **derive 레이어 additive `model.host_version` 필드**로 이동. provenance가 snapshot 안에 박혀 재현 가능 — 이 PRD의 truthfulness 불변식에 직접 부합. derive 변경은 additive top-level 필드(MODEL_VERSION 'v1' 불변)로 한정 — "correlation 재설계"가 아님.
- **(해소·F3) version 소스 우선순위**: **host meta(package.json/pyproject/Cargo) → CHANGELOG → git tag → plan-cycle → 미상**. 권위 meta 우선(F3). mccp repo는 root package.json 부재 → CHANGELOG(`1.18.3`)로 폴백 → 정확. plan-cycle은 '최신 plan cycle' framing(버전 주장 아님). `source` 라벨 항상 노출. 플러그인 plugin.json 제외(PRD 명시).
- **(결정) 위험 위젯 소스**: 카운트와 동일 backlog HIGH/CRITICAL(일관성). planBody.risks 는 route-attention(위험 페이지)가 이미 소비 — overview 는 backlog active finding 만 명명.
- **(결정) footer 의미**: footer `v1.18.4` 는 derive-엔진/플러그인 provenance(host-version 위젯과 별개 개념). 두 표면을 분리 라벨링(footer=engine provenance, hero version=host signal). footer를 host-version으로 바꾸는 건 M2 범위 밖(현행 유지).
- **(M3 위임)** ledger↔receipt drift 배너 + 위험/OQ 은퇴는 M3. M2 는 *현재* 활성 항목 명명까지만.

## Design Critique

- 트리거: detector `design_signal=true` (Files to Change에 `html.js` hero 재구성 / `status-grid.js` / `markdown.js` / 신규 파서 등 rendered surface 경로 다수 → whitelist hit). SKILL first-step Read 완료(`skills/frontend-design-direction/SKILL.md` `## Output Constraints`).
- verdict: **CONVERGED** (round 1/cap 2, `decideCritique` oracle). plan 단계 critique는 design intent를 4 Output Constraints anchor로 평가:
  1. **정보 위계 3단계** — hero = verdict(L1) → next-action·version(L2) → 위젯 내 항목(L3). heading depth ≤ 3. ✓
  2. **강조색 ≤1** — loud accent = 차단(>0)만 fill; 위험은 amber dot(icon+color 이중표기)이되 loud fill 금지; 진행중은 neutral dot. ✓
  3. **raw marker 금지** — prose는 `renderProseHtml`/`cleanArg` 경유, MD0xx 토큰 깨기 계승. ✓
  4. **한 화면 항목 상한** — 위젯당 top-3 expanded + `+N 더보기` `<details>` 접힘 + prose 1줄 cap. ✓
- HIGH/CRITICAL/UNKNOWN finding 0 → R1에서 종료. 실제 rendered surface 검증(a11y·반응형·강조색 실측)은 implement 단계 impeccable `audit`/`polish`로 수행(PRD Design Direction "ship 전 impeccable audit/polish").

## Design Routing Guide

routing mode: auto (effective at implement stage). 본 plan은 rendered UI가 아직 없어 plan 단계에서 impeccable 명령을 invoke하지 않는다 — 아래는 implement 단계 design surface 작업용 참고 체크리스트다. content-detectable refine(animate/colorize/typeset/adapt)은 diff signal positive일 때만 auto invoke; mood(bolder/quieter/overdrive/delight)는 recommend 기본.

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

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.18.2/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1에서 3건 전부 ACCEPT_NOW 흡수 — F1(HIGH)을 plan 개정으로 완전 해소 → 미해소 ACCEPT_NOW HIGH/CRITICAL 없음 → R2 미발동)
- 합치 결론: Codex verdict=`needs-attention` (3 findings). 모두 타당 — 이 PRD가 고치려는 *truthfulness* 영역(재현 불가 버전 / 실행 불가 command)을 plan 초안이 도리어 약화시킨다는 지적. R1에서 plan을 개정해 전부 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 next-action이 command 토큰만 복사 → 인자 누락(`/mccp:prp-implement` bare)으로 실행 불가. in-progress 폴백도 동일 | HIGH | ACCEPT_NOW | full command line(인자 포함) 추출 + `REQUIRES_ARG` 검증 + 미충족 시 prose-only(`executable=false`). in-progress 폴백은 resolved plan path를 인자로 포함. Task 2 개정. |
  | F2 host-version을 status-grid render-time에 읽으면 provenance가 snapshot 밖 → 같은 model이 cwd/git에 따라 다른 버전(truthfulness 약화) | MEDIUM | ACCEPT_NOW | derive 레이어 additive `model.host_version` 필드로 이동(snapshot 내 provenance, 재현 가능). 렌더러는 snapshot만 소비. MODEL_VERSION 'v1' 불변. Task 1/1b 개정. |
  | F3 CHANGELOG-first가 비권위/unreleased 버전 노출 가능 — package.json이 권위 | MEDIUM | ACCEPT_NOW | 사다리 재정렬 host meta → CHANGELOG → git tag → plan-cycle(='최신 plan cycle' framing) → 미상 + `source` 라벨 항상 노출. Task 1 개정. |
- Deferred to backlog: 0
- Open Questions: 없음 (3건 모두 R1 흡수, severity HIGH/MEDIUM — auto-CRITICAL 없음)
- Codex session 참조: threadId `019ef80b-a736-7a83-95cb-f3be2161c0e0`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
