# Plan: Dashboard Data Exploration — M2 (필터 + 정렬)

**Source PRD**: `.claude/prds/dashboard-data-exploration.prd.md`
**Selected Milestone**: M2 — 필터 + 정렬
**Complexity**: Medium

## Summary

M1이 깐 PE 토대(`data-prd` + `[data-js="on"]` reveal hook + `client/explore.js`) 위에서, 위험·질문 항목에 **필터(PRD축·plan축, 조합 가능)** 와 **정렬(위험도순·시간순)** 컨트롤을 추가한다. 컨트롤은 `.js-only`라 JS 비활성 시 사라지고 전체 항목이 손실 없이 보인다(PE 불변). 사용자 결정으로 **진행상태/worktree 필터·진행순/작업범위순 정렬은 M2 범위에서 제외**(전자는 멀티세션 표면 — 후속, 후자는 미기획/데이터 빈약). 컨트롤 배치(라우트별 vs 전역)는 실사용 비교가 필요하다는 사용자 요청에 따라 **양쪽을 토글 뒤에 구현해 프로토타입으로 평가 후 확정**한다.

## Scope 결정 (사용자 확인 2026-06-26)

| 축 | 결정 | 근거 |
|---|---|---|
| 필터 대상 표면 | **위험 + 질문만** | 핵심 통증(230건 누적)에 집중. worktree/진행상태 필터는 멀티세션 표면 → 후속 마일스톤. |
| 컨트롤 배치 | **양쪽 구현 → 실사용 비교 → 확정** | 질문만으로 판단 불가, 프로토타입으로 평가 후 선택(사용자 요청). |
| 필터 축 | PRD축 + plan축 | 두 축 모두 위험·질문 항목이 보유(`data-prd` M1 + `data-plan` 신규). 진행상태는 기존 미해결/해결됨/보관됨 탭이 이미 제공(중복 컨트롤 회피). |
| 정렬 기준 | 위험도순 + 시간순 | 두 기준만 위험·질문 항목에 깔끔히 매핑. 진행순=worktree 표면, 작업범위순=미기획/복잡 → 제외(사용자 OK). |
| URL/뷰 영속 | 안 함(세션 내) | PRD Out of scope(저장된 뷰/URL 상태 공유 제외) + CSS `:target` 라우팅 충돌 회피. |

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| PE 토대 client JS | `plugins/mccp/scripts/lib/renderer/client/explore.js:10` | IIFE + `'use strict'` + `data-js="on"` 마커 + null-guard early-return. DOM-only(외부 호출 0). |
| 조건부 inline `<script>` emit | `plugins/mccp/scripts/lib/renderer/html.js:1098` | 마커(`.prd-group`) 존재 시에만 모듈-로드 1회 + inline emit(외부 src 0 — H13). |
| 그룹 렌더 + `data-prd` | `plugins/mccp/scripts/lib/renderer/sections/risks.js:138` (`groupDetailsHtml`) | `<details class="prd-group" data-prd>` + `.li-item data-prd`. M2는 같은 li에 `data-plan`/`data-sev`/`data-ord` 추가. |
| `.js-only` reveal hook | `plugins/mccp/scripts/lib/renderer/html.js:446` | `.js-only{display:none}` + `[data-js="on"] .js-only{display:revert}` — 컨트롤 컨테이너에 부착. |
| neutral 토큰 chrome | `plugins/mccp/scripts/lib/renderer/html.js:425` (`.prd-group` CSS) | `--muted`/`--faint`/`--border`/`--panel-2`만 — 강조색 예산 0(Constraint 2). |
| pure 헬퍼 + UMD | `plugins/mccp/scripts/lib/renderer/parsers/prd-group.js` (`module.exports`) | `parsers/`는 부수효과 0 순수 함수. M2는 `explore-sort.js`에 UMD 가드(node `module.exports` + browser `window.__mccpExplore`)로 single-source. |
| inline-script 가드 | `plugins/mccp/scripts/lib/renderer/output-constraints.js:472` (H19) | inline `<script>` 본문 network primitive 차단 — 확장 explore.js 자동 적용. |
| H16 attribute carve-out | `plugins/mccp/scripts/lib/renderer/output-constraints.js:367` | `(?:title\|alt\|aria-label\|data-prd)="..."` strip — `data-plan` 추가(paired underscore 누출 차단). |
| a11y 테스트 | `plugins/mccp/scripts/lib/renderer/tests/a11y-aria-labels.test.js` · `responsive-layout.test.js` | `node --test`, 렌더 산출물 aria/landmark/반응형 assertion. |
| 그룹핑 회귀 테스트 | `plugins/mccp/scripts/lib/renderer/tests/prd-grouping.test.js` | minimalModel 픽스처 + 섹션 html/md assertion. |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/explore-sort.js` | CREATE | **단일 진실** pure 로직 — `compareItems(a, b, mode)`(위험도/시간 comparator) + `matchFilter(descriptor, filters)`(PRD∧plan AND 술어). UMD 가드(node test + browser inline 공유 → drift 0). |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | `.li-item`에 `data-plan`(source plan 안정 키) + `data-sev`(RANK_MAP 수치) + `data-ord`(방출 순서 index) 추가. 필터 축 옵션 수집용 `{prdKey, prdLabel, planKey, planLabel}` 메타를 섹션 결과에 노출. |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | 동일 `data-*` 속성 + 필터 옵션 메타 노출. STATE.md OQ는 planKey=`__global__`(PRD축과 동일 sentinel). |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | (필요 시) `planPrd` 맵에 `planLabel`(plan H1/stem) 동반 노출 — plan 필터 옵션 표시명. 이미 `prdLabel` 추출 경로 재사용. |
| `plugins/mccp/scripts/lib/renderer/client/explore.js` | UPDATE | 필터/정렬 엔진 추가 — 컨트롤 이벤트 → `window.__mccpExplore.matchFilter`/`compareItems`로 `.li-item` 가시성·순서 갱신(그룹 내 정렬) + 그룹 카운트 refresh + live-region 결과 수 + 빈 상태. DOM-only(H19 clean). reduced-motion 안전. |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | (1) 컨트롤 바 마크업 빌더(`.explore-bar.js-only` — PRD `<select>` + plan `<select>` + 정렬 `<select>` + `aria-live` 결과 수 + 초기화 버튼). (2) 배치 emit(라우트별/전역, `MCCP_EXPLORE_CONTROL_PLACEMENT` 토글 — `both`는 live-DOM 동시 렌더 금지(F3), 비교는 별도 render). (3) `explore-sort.js` + `explore.js` inline emit(순서: pure 먼저). **emit gate를 `.prd-group` OR `.explore-bar` 존재로 확장**(F2 — flat 섹션도 컨트롤 동작). (4) `.explore-bar` CSS(neutral). (5) footer `1.18.15 → 1.18.16`. |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | H16 attribute carve-out에 `data-plan` 추가(M1 `data-prd` 선례). H19는 확장 explore.js + explore-sort.js 자동 cover(추가 변경 불요 — 검증만). |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer `1.18.15 → 1.18.16` 동기화(§3.7 drift 방지). 필터/정렬은 HTML 전용 → md 무변경(M1 그룹 순서 평문 유지 = no-JS 동등). |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `version` `1.18.15 → 1.18.16`(patch — PRD ③의 단일 마일스톤, §3.7). PR 직전 main pull 후 forward-only reconcile. |
| `plugins/mccp/scripts/lib/renderer/tests/explore-sort.test.js` | CREATE | `compareItems`/`matchFilter` pure 단위 테스트(정렬 안정성·AND 필터·sentinel·tie-break·잘못된 mode fail-open). |
| `plugins/mccp/scripts/lib/renderer/tests/explore-controls.test.js` | CREATE | 렌더 산출물 컨트롤 바 마크업·`data-*` 속성·aria·`.js-only`·배치 토글(route/global)·no-JS degrade·H19/H16 clean + **F1 chronology≠severity fixture(`data-ord` 순서 ≠ severity 순서)** + **F2 flat 섹션 fixture(`.prd-group` 부재여도 explore `<script>` emit + `.explore-bar` reveal)** 회귀. |
| `DESIGN.md` | UPDATE | PE 절에 필터/정렬 컨트롤 추가(M1 invariant 개정 위에 누적) + 배치 결정 기록. |
| `CHANGELOG.md` | UPDATE | v1.18.16 row 추가. |

## Tasks

### Task 1: 항목 data 속성 + 필터 옵션 메타 (risks.js · open-questions.js)
- **Action**: `renderItem`이 만드는 `<li class="li-item" data-prd=…>`에 `data-plan`(item.source의 canonical 안정 키 — M1의 `prd-group` 정규화 함수 재사용), `data-sev`(RANK_MAP 수치 0~4 — 마크다운-안전 숫자), `data-ord`(**parse/source chronology index**) 추가. 섹션 반환 객체에 `filterOptions: { prds:[{key,label}], plans:[{key,label,prdKey}] }`를 노출(중복 제거 + 결정적 순서) — html.js 컨트롤 빌더가 소비.
- **`data-ord` chronology 불변 (Codex F1 — HIGH)**: risks.js는 render 전에 `allRisks`를 severity로 정렬한다(`.sort(bySev)`). 따라서 render *방출 순*으로 `data-ord`를 부여하면 severity 순서를 인코딩해 "시간순" 정렬이 실제로는 안 바뀐다. → `data-ord`는 **severity/그룹 정렬 이전의 원본 parse 순서**에서 파생한다: `allRisks`(필터·정렬 전)를 1회 순회해 각 item에 `_chronoIndex`(전역 monotonic, source plan 순 + plan 내 `ordinal`)를 박은 뒤, 그 값을 `data-ord`로 emit. open-questions는 `_mergedIndex`(이미 split 이전 부여됨, line 78)를 chronology 키로 재사용. parse 순이 severity 순과 다른 fixture로 회귀 보장(Task 2).
- **Mirror**: `risks.js:102` (`prdAttr` 부여 위치), `risks.js:44-47` (severity 정렬 — `_chronoIndex`는 그 *이전* 부여), `open-questions.js:78` (`_mergedIndex` 선부여 패턴), `prd-group.js`(canonical 정규화 + sentinel key), `risks.js:23` (`RANK_MAP`).
- **Validate**: `node -e`로 minimal model 렌더 → li에 `data-plan`/`data-sev`/`data-ord` 존재 + **chronology≠severity fixture에서 `data-ord` 순서가 severity 순서와 다름** 확인 + `filterOptions.plans`가 PRD축으로 묶인 plan 목록 반환 확인.

### Task 2: pure 필터/정렬 로직 + UMD (explore-sort.js)
- **Action**: 신규 `parsers/explore-sort.js` — `compareItems(a, b, mode)`: `mode='severity'`이면 `data-sev` desc + tie-break `data-ord` asc(안정); `mode='time'`이면 `data-ord` asc. `matchFilter(desc, filters)`: `filters.prd`(빈=전체) ∧ `filters.plan`(빈=전체) AND 매칭, sentinel(`__global__`/`__unknown__`)은 자기 자신 선택 시에만 매칭. 파일 끝 UMD 가드 — `if(typeof module!=='undefined'&&module.exports) module.exports={compareItems,matchFilter}; if(typeof window!=='undefined') window.__mccpExplore={compareItems,matchFilter};`. **부수효과 0 · 네트워크 primitive 0**(H19 clean — DOM 미접근, 순수 값 변환).
- **Mirror**: `prd-group.js`(순수 변환 + sentinel), `cross-section-dedupe.js`(`module.exports` 스타일).
- **Validate**: `node --test explore-sort.test.js` — 정렬 안정성(동일 sev tie-break ord), AND 필터(두 축 동시), 빈 필터=전체, sentinel 매칭, 잘못된 mode fail-open(원순서 유지).

### Task 3: 컨트롤 바 마크업 빌더 (html.js) — 양 배치
- **Action**: `buildExploreBar({ scope, options })` → `<div class="explore-bar js-only" role="group" aria-label="필터 및 정렬">`: PRD `<select aria-label="PRD 필터">`(전체 + 옵션) · plan `<select aria-label="plan 필터">`(전체 + 옵션, PRD 선택 시 좁힘은 JS) · 정렬 `<select aria-label="정렬">`(위험도순 default·시간순) · `<span class="explore-count" aria-live="polite" role="status">` · `<button type="button" class="explore-reset">초기화</button>`. **배치 양쪽 구현**:
  - **A 라우트별**: `#route-risks`·`#route-questions` 패널 최상단(탭/리스트 위)에 scope-local 바.
  - **B 전역**: topbar 우측 또는 사이드바에 단일 바(현재 가시 route 항목 대상 — `:target` route 감지).
  - `MCCP_EXPLORE_CONTROL_PLACEMENT=route|global`(default `route`)로 emit 분기. **양 배치를 한 DOM에 동시 live 렌더하지 않는다**(F3 — 같은 `.li-item` 집합에 두 컨트롤러가 붙으면 상태 발산). 비교는 Task 5가 두 모드를 *별도로* render한 산출물로.
  - **emit gate(F2)**: `explore-sort.js`+`explore.js` inline 은 `.prd-group` OR `.explore-bar` 가 렌더된 경우 emit — flat fallback 섹션(단일 global/unknown 그룹 → `.prd-group` 부재)에서도 컨트롤 wiring 이 돈다.
- **Mirror**: `html.js:981` (사이드바 search affordance 구조), `html.js:1041` (route 패널 조립), `html.js:446` (`.js-only`), `html.js:1101` (emit gate — `.explore-bar`로 확장).
- **Validate**: `MCCP_EXPLORE_CONTROL_PLACEMENT=route`/`global` 각각 render → status.html에 해당 위치 `.explore-bar` 존재 + select에 옵션 채워짐 + **flat 섹션 fixture에서도 `<script>`(explore) emit + 컨트롤 reveal** 확인.

### Task 4: 필터/정렬 엔진 (explore.js 확장)
- **Action**: explore.js에 컨트롤 wiring 추가 — 각 `.explore-bar`의 select/reset에 listener: (1) bar의 scope 내 `.li-item`을 descriptor(`{prd,plan,sev,ord,el}`)로 읽어 `matchFilter`로 `hidden` 토글, (2) 보이는 항목을 `compareItems`로 그룹 내(`.stack-list` 단위) 재정렬, (3) 각 `.prd-group .prd-count` 텍스트를 가시 항목 수로 갱신 + 0개 그룹 `hidden`, (4) `.explore-count` live-region에 "N개 표시"(전체=숨김), (5) 전체 0개면 빈 상태 메시지. plan select는 PRD select 값에 따라 옵션 좁힘(client). reset은 초기 상태 복원.
- **flat fallback 동작 (F2)**: 그룹 chrome 없는 flat `.stack-list`(단일 global/unknown 그룹)에서도 `.li-item`이 같은 `data-*`를 갖고 컨트롤이 동작 — 정렬 scope는 `.stack-list`(그룹 유무 무관), 그룹 카운트 갱신은 `.prd-group` 존재 시에만.
- **단일 컨트롤러 불변 (F3)**: 한 DOM에는 활성 `.explore-bar` 1개만 같은 `.li-item` 집합을 제어한다(`route` OR `global`, both-live 금지). 엔진은 각 bar를 자기 scope(`closest('.route')` 또는 문서 전역)에 한정해 wiring — scope가 겹치는 두 live bar 동시 emit 안 함.
- **DOM-only — 외부 호출 0(H19), reduced-motion 무관(레이아웃만)**.
- **Mirror**: `explore.js:16` (`.prd-group` 수집 + early-return), `explore.js:27` (parent별 scope 묶기), `explore.js:39` (`sync` 라벨 갱신 패턴).
- **Validate**: 프로토타입 렌더 후 `/mccp:dashboard`(또는 `dashboard-refresh`)로 필터·정렬·초기화 동작 + 결과 수 갱신 수동 확인. JS strip 시 전체 항목 가시(degrade). flat 섹션 fixture에서 컨트롤 reveal+동작.

### Task 5: 배치 프로토타입 평가 → 확정 (사용자 결정 게이트)
- **Action**: implement 단계에서 두 배치를 **별도 산출물로** render(F3 — 한 DOM에 live 바 2개 금지): `MCCP_EXPLORE_CONTROL_PLACEMENT=route node …/cli.js render` → `.claude/cache/status.html`, 이어서 `MCCP_EXPLORE_CONTROL_PLACEMENT=global` 로 두 번째 산출물(예: scratchpad 또는 `status-global.html`)로 render. 각 산출물은 활성 컨트롤러 1개라 상태 발산 없음. 사용자가 `/mccp:dashboard`로 두 산출물을 번갈아 실사용 비교 → 선호 배치 선택. **확정 처리**: (a) 명확히 한쪽 선호 → 패자 마크업/CSS 제거 + 토글 default를 승자로(또는 토글 자체 제거), (b) 계속 전환 원함 → 토글 유지(default=route, `## Operating toggles` 문서화). 결정과 근거를 DESIGN.md + receipt에 기록.
- **Mirror**: project §3.7(토글 문서화 관행), `project_v0_4_0_orchestrator`(spike→decision 패턴).
- **Validate**: 두 모드 산출물 각각 활성 `.explore-bar` 1개 확인. 사용자 확정 1줄 기록 + (패자 제거 시) `grep`으로 잔재 0, (토글 유지 시) `## Operating toggles`에 env 문서화.

### Task 6: 컨트롤 CSS (neutral) + reveal
- **Action**: `.explore-bar`/`.explore-bar select`/`.explore-reset`/`.explore-count` CSS — `--muted`/`--faint`/`--border`/`--panel-2`만(강조색 예산 0, Constraint 2). select는 native(키보드 기본). `border-radius:0`(H3) · `border-left` 없음(H4) · `.card` 아님(H17 무관). `.explore-bar`는 이미 있는 `.js-only`로 기본 숨김(M1 hook 재사용 — 신규 reveal 규칙 불요). 반응형: 좁은 폭에서 컨트롤 wrap(flex-wrap).
- **Mirror**: `html.js:425` (`.prd-group` neutral CSS), `html.js:439` (`.prd-toggle` 버튼 스타일).
- **Validate**: `oklch-conformance`/`design-invariants` 테스트 clean. 강조색 토큰(`--accent`)이 `.explore-bar` 규칙에 부재 확인(focus-visible outline 제외).

### Task 7: lint carve-out + 가드 검증 (H16 · H19)
- **Action**: `output-constraints.js` H16 attribute strip에 `data-plan` 추가(`(?:title|alt|aria-label|data-prd|data-plan)="..."`) — plan 키의 paired underscore가 bold-underscore false-positive 안 내도록(M1 `data-prd` 선례). H19는 확장 explore.js + 신규 explore-sort.js를 자동 스캔하므로 **추가 변경 없이 검증만**(둘 다 DOM/순수 — primitive 0). design-invariants 테스트에 H16 `data-plan` carve-out 회귀 + H19 explore-sort clean 추가.
- **Mirror**: `output-constraints.js:367` (H16 carve-out), `output-constraints.js:491` (H19 script 스캔 루프).
- **Validate**: explore.js에 `fetch('https://…')` 주입 시 H19 RED, 제거 시 GREEN. `data-plan="v1_18_x"` 류 값이 H16 발화 안 함 확인.

### Task 8: a11y + 반응형
- **Action**: 컨트롤 키보드 조작(native select/button — 단축키 0, 사용자 요청), focus-visible outline(M1 패턴), 각 select `aria-label`, 결과 수 `aria-live="polite"`+`role="status"`, 빈 상태 명시 메시지, reset 버튼 aria-label. 좁은 뷰포트 wrap. v1.4.2 M3 a11y 패턴 계승.
- **Mirror**: `tests/a11y-aria-labels.test.js`, `tests/responsive-layout.test.js`, `html.js:435` (focus-visible).
- **Validate**: `node --test a11y-*.test.js responsive-layout.test.js` PASS. ship 전 `/impeccable audit`(a11y·반응형) + `/impeccable polish`(PR 단계 권장).

### Task 9: 버전 bump + footer + CHANGELOG + 테스트 회귀 0
- **Action**: plugin.json `1.18.15 → 1.18.16`. html.js page-foot + markdown.js footer 2곳 동기화. CHANGELOG row. 전체 렌더 스위트 회귀 0.
- **Mirror**: §3.7(footer drift), 직전 CHANGELOG row.
- **Validate**: `grep -rn "1.18.15" plugins/mccp/scripts/lib/renderer/ plugins/mccp/.claude-plugin/plugin.json` → 0. `node --test plugins/mccp/scripts/lib/renderer/tests/` 전부 PASS.

## Validation

```bash
# 1. 렌더러 전체 테스트(회귀 0)
node --test plugins/mccp/scripts/lib/renderer/tests/

# 2. 양 배치 프로토타입 렌더 (사용자 비교용)
MCCP_EXPLORE_CONTROL_PLACEMENT=both node plugins/mccp/scripts/derive/cli.js render
grep -c "explore-bar" .claude/cache/status.html          # > 0 (양 배치면 2+)

# 3. 컨트롤 마크업 + data 속성
grep -c "data-plan" .claude/cache/status.html            # > 0
grep -cE "aria-live|role=\"status\"" .claude/cache/status.html  # > 0 (결과 수 live-region)

# 4. 가드 — inline script network primitive 0 (H19) · 외부 src 0 (H13)
grep -cE "fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon" .claude/cache/status.html  # 0
grep -c "<script src" .claude/cache/status.html          # 0

# 5. no-JS degrade — script 제거 후 전체 항목 가시 + STATUS.md 평문 그룹 동등
grep -c "li-item" .claude/cache/status.html              # 전체 항목 존재(필터는 client 전용)

# 6. 버전 drift 0
grep -rn "1.18.15" plugins/mccp/scripts/lib/renderer/ plugins/mccp/.claude-plugin/plugin.json  # 0
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **"시간순"이 severity 순서를 인코딩(render-time data-ord)** | 중 | **Codex F1(HIGH)** — `data-ord`를 severity 정렬 *이전* 원본 parse 순서(`_chronoIndex`/`_mergedIndex`)에서 파생(Task 1) + chronology≠severity fixture(Task 8). |
| **flat fallback 섹션서 컨트롤 미동작(JS 미emit)** | 중 | **Codex F2(HIGH)** — emit gate를 `.prd-group` OR `.explore-bar`로 확장(Task 3) + flat 섹션 fixture(Task 8). |
| **both-live 두 컨트롤러가 같은 DOM 제어 → 상태 발산** | 중 | **Codex F3** — 한 DOM에 활성 bar 1개(Task 4 단일 컨트롤러 불변), 비교는 별도 산출물 2개 render(Task 5). |
| 배치 dual-path 부채 | 중 | Task 5 결정 게이트 — 사용자 확정 후 패자 제거(or 토글 문서화). 토글은 transient. |
| inline 엔진 JS가 후속 편집서 외부 fetch 도입(raw-mode 유출) | 중 | H19가 explore.js + explore-sort.js 본문 자동 스캔(Task 7 검증). |
| `data-plan` paired underscore가 H16 false-positive | 중 | Task 7 — H16 carve-out에 `data-plan` 추가(M1 `data-prd` 선례). |
| inline DOM JS 동작은 dep-free라 node 단위테스트 불가 | 중 | pure 로직(`explore-sort.js`)을 UMD로 분리해 node 테스트 + browser inline 공유(drift 0). DOM wiring은 프로토타입 + impeccable audit로 검증. |
| 정렬이 그룹 경계를 넘어 항목 섞음 | 중 | 정렬 scope = `.stack-list` 단위(그룹 내). 그룹 순서는 불변(M1 결정적 prdKey 정렬). |
| 필터로 그룹 0개 시 빈 그룹 잔류 | 저 | 가시 항목 0 그룹은 `hidden` + 전체 0이면 빈 상태 메시지. |
| 컨트롤 a11y 회귀(키보드/aria) | 중 | native select/button + aria-label + live-region. a11y 테스트 + impeccable audit. |
| "시간순"이 실 timestamp 아님(parse 방출 순 근사) | 저 | 신규 derive 필드는 ③ out-of-scope. `data-ord`=방출 순(append 시간 근사)로 정직히 문서화. |
| 병렬 cycle version 경쟁(main이 1.18.16 선점) | 저 | PR 직전 main pull 후 forward-only reconcile(직전 cycle 재발 부채 인지). |

## Acceptance
- [ ] 위험·질문 라우트에 필터(PRD축·plan축, AND 조합) + 정렬(위험도순·시간순) 컨트롤 동작
- [ ] 각 `.li-item`에 `data-plan`·`data-sev`·`data-ord` 속성(`data-prd` M1 위에 누적)
- [ ] 필터 시 그룹 카운트·`aria-live` 결과 수 갱신 + 전체 0개 빈 상태 메시지
- [ ] "시간순" 정렬이 실제 parse chronology(`data-ord` = severity 정렬 이전 원본 순서)로 재정렬 — severity 순서 인코딩 아님(Codex F1)
- [ ] flat fallback 섹션(`.prd-group` 부재)에서도 explore JS emit + 컨트롤 reveal·동작(Codex F2)
- [ ] 한 DOM에 활성 컨트롤러 1개(both-live 금지), 배치 비교는 별도 산출물 2개(Codex F3)
- [ ] JS 제거 시 전체 항목 손실 없이 가시(`.js-only` degrade) + STATUS.md 평문 그룹 동등(필터/정렬은 HTML 전용)
- [ ] 컨트롤 배치 양쪽(라우트별·전역) 별도 산출물 비교 → 사용자 확정 기록(패자 제거 or 토글 문서화)
- [ ] 진행상태/worktree 필터·진행순/작업범위순 정렬은 M2 제외 + PRD M2 행/M3 reconcile(Codex F4 — 계약↔게이트 일치)
- [ ] pure 로직 `explore-sort.js` UMD + node 단위 테스트, inline DOM 엔진은 H19/H16 clean
- [ ] plugin.json + footer 2곳 `1.18.16` 동기화
- [ ] `node --test` 렌더 스위트 전부 PASS, design-lint H1-H19 clean(회귀 0)
- [ ] Patterns mirrored, not reinvented

## Open Questions (plan-time 해소)
- [x] vendored JS 전달: M1이 inline `<script>`(`EXPLORE_JS`)로 확정 → M2도 inline 누적(별도 파일/CDN 0). <!--mccp:resolved reason="M2 SHIPPED PR #70 (squash 94f922f, v1.18.16) — 결정대로 inline 누적 확정. html.js가 client/explore.js(EXPLORE_JS, DOM 엔진)와 parsers/explore-sort.js(UMD pure 로직) 둘 다 fs.readFileSync로 disk read 후 `<script>`...`</script>` inline emit(html.js:24,32-38,1481-1483). 모듈 헤더 주석 line 8 'NEVER an external <script src>' 명시 + H13(외부 src 0)·H19(network primitive 0) lint이 본문 자동 스캔. 별도 파일/CDN 0 — vendored JS 전달 경로는 M1 inline 패턴을 M2가 그대로 누적." at="2026-06-30T12:17:04Z"-->
- [x] 컨트롤 통합 vs 섹션별: 양 배치 프로토타입(Task 3·5)으로 실사용 비교 후 확정. <!--mccp:resolved reason="M2 SHIPPED — 배치 프로토타입 비교 후 panel-header 통합 단일 canonical로 확정(impeccable critique + 사용자 확정 2026-06-26, html.js:1130-1135). 각 바가 자기 위험·질문 패널 head 우측에 통합돼 scope↔placement 일치. 이전 global 사이드바 배치는 scope 불일치(5 route 중 2개만 제어)·nav 무게감·키보드 탭순서 비용·cross-route 빈 상태로 폐기. dual-path 토글(MCCP_EXPLORE_CONTROL_PLACEMENT)도 제거 — Task 5 결정 게이트 (a) 패자 제거 경로 actioned." at="2026-06-30T12:17:04Z"-->
- [x] 필터 축 데이터 소스: PRD·plan은 ①의 위험·질문 항목 보유(③은 ①·② 후 진입 불변). 진행상태/worktree(②)는 M2 제외. <!--mccp:resolved reason="M2 SHIPPED — PRD축(data-prd, M1)+plan축(data-plan, M2)을 위험·질문 항목에 부여해 AND 필터 동작. M2 제외한 진행상태/worktree(②) 잔여 축은 M3 SHIPPED PR #71 (squash 301e4f7, v1.18.17)에서 멀티세션 표면(#route-activity multi-session 테이블)에 full 구현 — 진행상태·worktree 필터 + 진행순 정렬(M3 plan Summary). scope 결정 유지 + 연기 축이 정확히 M3에 착지." at="2026-06-30T12:17:04Z"-->
- [ ] "작업범위순" 정의: 미기획/복잡 → M2 제외(사용자 OK). 후속에서 'PRD 기준 작업 진행도'로 재검토. <!--mccp:deferred reason="M2 제외 결정은 유효(사용자 OK)하나 여전히 미해소 open — M3도 'PRD 기준 작업 진행도' 재기획 전까지 보류 명시(M3 plan Scope: 정렬 select 미노출). STATE.md Open Questions(line 37 '작업범위순 정렬 측정 단위(마일스톤/파일/LOC) — PRD 기준 진행도 재기획 시 확정')에 active로 tracked. resolved 아님 — 측정 단위 미정 future-work로 정직히 open 유지." at="2026-06-30T12:17:04Z"-->
- [x] 검색 매칭 범위: M3 범위(M2 무관). <!--mccp:resolved reason="M2 deferral(M3 범위)이 M3 SHIPPED PR #71 (squash 301e4f7, v1.18.17)에서 해소 — 사이드바 검색 입력을 wiring해 전 페이지 .li-item을 항목 헤더/요약(.li-main 텍스트)으로 좁힘. 매칭 범위 결정 = 화면에 보이는 줄만(접힌 드로어 detail 제외, M3 plan Scope). M2 무관 deferral이 정확히 M3에서 답해짐." at="2026-06-30T12:17:04Z"-->
- [x] no-JS degrade 검증: `.js-only` 숨김 + script-strip 회귀 테스트(M1 패턴 계승). <!--mccp:resolved reason="M2 SHIPPED — explore-controls.test.js test (c) 'no-JS degrade — script 제거 후 전체 항목 가시(.js-only 숨김, 항목 손실 0)'(line 143) ship. 컨트롤 바는 .js-only로 JS off 시 숨김 + script strip 후 전체 .li-item 가시 회귀 보장. M1 PE 불변 패턴(`[data-js=\"on\"]` reveal hook) 계승 확인." at="2026-06-30T12:17:04Z"-->

## Design Critique

- 호출: `Skill(impeccable, "critique ...")` — plan-stage critique(마크다운 plan; 라이브 UI 부재 → Assessment B detector 비적용, Assessment A 설계 검토를 4개 Output Constraints에 한정). SKILL.md `## Output Constraints` first-step Read 완료.
- 라운드 수: 1 (R0)
- Verdict: **CONVERGED** (HIGH/CRITICAL 설계 결함 0)
- 4개 Output Constraints 평가:
  | Constraint | 판정 | 근거 |
  |---|---|---|
  | 정보 위계 3단계 (heading ≤3) | PASS | 컨트롤 바는 `<select>`/`<button>`/`<span>` — heading 미사용. route h2 유지. `.explore-bar`는 control 레이어. |
  | 강조색 ≤1 | PASS | Task 6에 neutral 토큰만 명시(`--muted`/`--faint`/`--border`/`--panel-2`) — accent 예산 무증가(focus-visible outline 제외). |
  | raw markdown 금지 | PASS | 컨트롤 라벨 escapeHtml 평문. `data-plan` H16 carve-out(Task 7)로 paired-underscore false-positive 차단. md 무변경(필터/정렬 HTML 전용). |
  | 항목 수 상한 (top-3 + collapse) | PASS | M2 필터/정렬이 "quiet by default, loud on demand"를 *강화*(좁히기 + 우선순위). 0-count 그룹 자동 hidden(Task 4). |
- Findings: LOW(컨트롤 바 시각적 절제 — Task 6 반영) · MEDIUM(전역 배치(B)의 단일 바 무게감 — 양 배치 프로토타입 비교로 평가, Task 5). 둘 다 non-blocking(오라클 HIGH/CRITICAL만 fail).

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더 UI 부재 → 호출 없이 체크리스트만. implement 단계에서 design 게이트가 stage-appropriate impeccable 명령을 라우팅한다(content-detectable refine 명령은 diff signal positive 시에만 invoke).

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate` · `/impeccable colorize` · `/impeccable bolder` · `/impeccable quieter` · `/impeccable overdrive` · `/impeccable delight` |
| simplify | `/impeccable adapt` · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique` · `/impeccable audit` |
| harden | `/impeccable harden` · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` · `/impeccable extract` |

> ship 전 `/impeccable audit`(a11y·반응형)·`/impeccable polish`(최종 품질)를 PR 단계에서 권장(PRD Design Direction "전 마일스톤 UI → ship 전 impeccable audit/polish").

## Codex Adversarial Review

- 호출: `node …/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2 · `--impeccable-available` design-scope preamble)
- 라운드 수: 1 (R1; classification=ok, blocking=false)
- 합치 결론: Codex verdict=`needs-attention` — 4 findings 전부 plan 흡수로 해소. HIGH 2건 모두 mechanical 수정(F1 chronology data-ord, F2 emit gate)으로 완전 해결 → R2 escalation 불필요(cap=1).
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 "시간순"이 render-time data-ord라 severity 순서 인코딩 → 시간 정렬 무효 | HIGH | ACCEPT_NOW | 실 버그(risks.js가 render 전 severity 정렬). Task 1을 severity 정렬 *이전* 원본 parse 순서(`_chronoIndex`/`_mergedIndex`)로 개정 + chronology≠severity fixture(Task 8). 완전 해결 → R2 불요. |
  | F2 flat fallback 섹션(`.prd-group` 부재)서 explore JS 미emit → 컨트롤 숨김·미동작 | HIGH | ACCEPT_NOW | 실 버그(emit gate가 `.prd-group`만 검사). Task 3 emit gate를 `.prd-group` OR `.explore-bar`로 확장 + flat 섹션 fixture(Task 8·4). 완전 해결 → R2 불요. |
  | F3 both-live 두 컨트롤러가 같은 DOM 제어 → 상태 발산(비교 신뢰성 훼손) | MEDIUM | ACCEPT_NOW | 사용자 비교 목적 직접 훼손. Task 4 단일 컨트롤러 불변(한 DOM 활성 bar 1개) + Task 5 별도 산출물 2개 render(both-live 제거). |
  | F4 PRD M2 계약(4필터/4정렬)과 plan 축소가 불일치 → complete 시 success metric 미달 | MEDIUM | ACCEPT_NOW | governance. PRD M2 행을 축소 scope로 + 연기 축(진행상태/worktree 필터·진행순/작업범위순 정렬)을 M3로 reconcile(plan 적용 시 PRD 수정 — 아래 5.3 후속). |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0 — 4 finding 모두 plan 흡수)
- Codex session 참조: threadId `019f0222-2944-7830-8267-e2d625d6f0d5`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
