# Plan: Dashboard Console Redesign — M3 우측 상세 드로어 + 드로어 derive 추출

**Source PRD**: `.claude/prds/dashboard-console-redesign.prd.md`
**Selected Milestone**: M3 — 우측 상세 드로어 + 드로어 derive 추출 (Delivery Milestones #3)
**Complexity**: Large

## Summary

M2가 깐 섹션 fidelity(stack-list·audit-row·milestone-item) 위에서, 승인된 `dashboard-sample.html`의 **우측 native `<dialog>` 드로어**를 실 렌더러에 이식한다. 미해결 질문·위험·타임라인(receipt)·마일스톤 항목을 클릭/Enter/Space로 열면 우측 overlay 드로어가 해당 항목의 **상세를 derive 실데이터로** 표시한다(제목·태그·rows·sections·다음 액션). 샘플의 인덱스 매핑(`items[i]`)을 PRD 요구대로 **안정 키**(`data-detail-id`)로 교체하고, 상세가 부재한 필드(위험 시나리오/잔여·OQ 선택지·마일스톤 요약)는 placeholder 없이 graceful degrade한다. 드로어 상세는 **read-side 추출을 우선**하며 — receipt/plan body에 이미 있는 필드로 대부분 충당되므로 — **receipt 스키마는 확장하지 않는다**(chain-of-custody hash 무손상). 마일스톤 요약만 plan `## Summary` read-side 추출로 채운다. STATUS.md 문서 재구성은 M4로 이연한다.

## Scope boundary (이 milestone가 닫는 것 / 닫지 않는 것)

| 영역 | M3 (이 plan) | 이후 |
|---|---|---|
| native `<dialog class="drawer">` 마크업 + 드로어 CSS(.drawer/.drawer-head/.drawer-body/.d-title/.d-tags/.d-rows/.d-sec/.d-action) html.js 이식 | ✅ 샘플 fidelity | — |
| 드로어 JS — openDetail/close, copy 재바인딩, focus 관리(open 시 close 버튼 focus, Esc 닫힘, backdrop 닫힘, 복귀 focus) | ✅ progressive enhancement(no-JS 시 항목 비클릭, 섹션 baseline 그대로) | — |
| 항목 → 상세 **안정 키 매핑**(`data-detail-id` = 결정/receipt/plan 기반, 인덱스 금지) + 임베디드 JSON(`<script type="application/json">`) | ✅ | — |
| OQ 드로어 상세 — **REQUIRED**: 제목 + sev 태그 + rows[출처/섹션/관련 결정] + 다음 액션 | ✅ read-side 보장(부재 시 테스트 실패) | OPTIONAL: 선택지 A/B 배경 = plan body 하위불릿(있으면 parse, 없으면 degrade) |
| 위험 드로어 상세 — **REQUIRED**: 제목(=시나리오 요약) + sev 태그 + rows[관련 결정/영향=impact/가능성=likelihood] + sections[완화책] | ✅ read-side 보장 | OPTIONAL: 별도 시나리오/잔여 위험 = plan Risks 표 컬럼 schema에 부재(authoring 산물) → degrade(plan에 명시, render 버그 아님) |
| 타임라인 receipt 드로어 상세 — **REQUIRED**: 제목 + 판정 태그 + rows[결정/판정/round/briefing/시각/receipt hash] | ✅ read-side 전 필드 가용 | OPTIONAL: briefing summary section(부재 receipt = degrade) |
| 마일스톤 드로어 상세 — **REQUIRED**: 제목 + rows[plan/ship] | ✅ read-side 보장 | OPTIONAL: 요약 section = plan `## Summary` read-side(plan unreadable 시 degrade), PR 번호 = derive `pr` source 가용 시만 |
| graceful degrade — 상세 부재 시 placeholder 금지, 가용 row/section만 렌더, 전무하면 드로어 미바인딩(항목 비클릭) | ✅ | — |
| H-invariant 개정 — H7 `::backdrop` carve-out(glassmorphism), H3 drawer/.d-* radius carve-out, 신규 H18(드로어 a11y 안정-키 positive 계약) | ✅ + DESIGN.md 근거 | — |
| `ic-x` Lucide symbol ICON_SPRITE 추가 | ✅ | — |
| **receipt/derive 스키마 확장** | ⛔ read-side로 충당 → 무변경(OQ#3 결정) | 향후 필요 시 별도 |
| STATUS.md plain-text **문서** 재구성(드로어 상세 인라인 평면화) | ⛔ 섹션 md 동기 유지, IA 재구성은 이연 | **M4** |
| route IA(4-route) / 섹션 baseline 마크업 | ⛔ M2 ship 그대로 유지 | — |

## Drawer field contract — REQUIRED vs OPTIONAL (Codex R1 F1 absorption)

드로어의 존재 이유는 "항목별 상세를 들여다보는 것"이므로, read-side-only 스코프가 *actionability 판단에 필요한 필드*를 silent drop하면 안 된다. 따라서 필드를 **REQUIRED**(read-side로 항상 가용 — 부재 시 render/test 실패, placeholder-free 통과만으로 M3 완료 인정 금지)와 **OPTIONAL**(source schema에 genuinely 부재 — graceful degrade, plan에 명시되어 reviewer에게 boundary가 visible)로 가른다.

| kind | REQUIRED (테스트가 강제 — 항상 present) | OPTIONAL (degrade 허용, 부재가 visible) |
|---|---|---|
| OQ | 질문 전문, 출처 plan, 섹션(headingPath), severity, 다음 액션 | 선택지 A/B 배경(plan 하위불릿 있을 때만) |
| 위험 | 위험 전문(시나리오 요약 역할), severity, impact, likelihood, 완화책(plan Risks 표 Mitigation 컬럼 = schema 보장), 관련 결정 | 별도 시나리오/잔여 위험(컬럼 부재 = authoring 산물, read-side 불가) |
| receipt | gate, decision, 판정(verdict), round, 시각, receipt hash | briefing summary(stamp 부재 receipt = degrade) |
| 마일스톤 | 이름, plan 파일, ship/commit 시각 | plan `## Summary` 요약(plan unreadable 시), PR 번호(derive pr source 가용 시) |

- **acceptance gate**: `tests/drawer.test.js`가 각 kind fixture에 대해 **REQUIRED 필드 전부 present**를 assert. 하나라도 부재면 test FAIL → M3 미완료. OPTIONAL 부재는 통과(단 drawer가 빈 section/row를 만들지 않고 생략).
- 위험 시나리오/잔여가 컬럼 schema에 없는 것은 **render 버그가 아니라 source 한계** — REQUIRED 위험 필드(위험 전문 + impact + likelihood + 완화 + 결정)가 actionability를 충분히 전달. 향후 plan Risks 표 schema 확장은 별도 milestone.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 드로어 마크업·CSS·JS 계약 | `.claude/cache/dashboard-sample.html:408-447, 840-994` | `<dialog class="drawer">` + `.d-title/.d-tags/.d-rows/.d-sec/.d-action` + `render(d)`/`openDetail(kind,d)` — 단, items[i] 인덱스 매핑은 안정 키로 교체 |
| 섹션 모듈 반환 확장 | `sections/open-questions.js:92` (`return { html, md }`) | M3은 `{ html, md, details }` 추가 — `details`는 `[{ id, kind, detail }]`, 항목 html에 `data-detail-id` 부여 |
| 안정 키(인덱스 금지) | `sections/audit-timeline.js:31` (`rowKey()` = gate\|decision\|hash) + `sections/status-grid.js` decision_id 집계 | receipt 키 reuse, OQ/위험/마일스톤은 planBasename + lineNumber/text-hash + slug |
| HTML escape / XSS 경계 | `format-utils.js` (`escapeHtml`/`escapeAttr`) + `tests/escaping.test.js` | 드로어 detail 문자열은 **빌드 시 전부 escape** 후 JSON 임베드. JSON은 `</script>` break-out 차단(`<`→`<`). innerHTML 주입은 pre-escaped string만 |
| prose 정규화 | `format-utils.js:87` (`normalizeProse`) + `audit-timeline.js:158` | 드로어 detail prose도 normalizeProse(em-dash→쉼표, H10) 적용 |
| 색+아이콘 병행 / a11y | `sections/pipeline.js:121` (`sr-only`) + `tests/a11y-*.test.js` | 드로어 trigger는 role=button + tabindex=0 + aria-haspopup=dialog, `<dialog>`는 aria-label, reduced-motion 즉시 |
| fail-open 섹션 | `index.js:18` (`safeSection`) | details 빌드 실패는 섹션 html을 죽이지 않음 — details=[] 로 degrade(드로어 미바인딩), loud stderr |
| Tests | `tests/section-fidelity.test.js` + `tests/a11y-*.test.js` + `tests/design-invariants.test.js` | node:test. `renderStatus(...).design_constraint_violations == []` + 드로어 markup/키/degrade/escape assert |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/drawer-detail.js` | CREATE | 안정-키 helper + 4종 kind별 detail 빌더(escape/normalizeProse/graceful degrade) + `</script>` 안전 JSON serialize. 단일 SSoT |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | renderItem이 `data-detail-id` 부여 + `details` 누적, OQ detail 빌드 위임 |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | 위 동형(위험 detail — impact/likelihood/mitigation, 시나리오/잔여 degrade) |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | audit-row에 `data-detail-id`(rowKey) + receipt detail(briefing/hash/round) 빌드 |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | milestone-item에 `data-detail-id` + 마일스톤 detail(plan/ship + plan `## Summary` read-side 요약) |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | (a) parseRisks가 행 식별용 안정 토큰 노출(lineNumber 또는 risk-text 기반), (b) milestone 요약용 plan `## Summary` read-side 추출 helper(`extractPlanSummary`) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | 드로어 CSS(LAYOUT) + `.clickable` 스타일 + `<dialog>` 마크업 + 드로어 JS + 섹션 details 수집→임베디드 JSON + `ic-x` symbol. `renderHtml`이 sections의 `details`를 aggregate |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | H7 `::backdrop` carve-out, H3_CARVEOUT에 `drawer`/`drawer-close`/`d-rows`/`d-action`/`clickable` 추가, 신규 H18(드로어 positive a11y/안정-키 계약) |
| `plugins/mccp/scripts/lib/renderer/tests/drawer.test.js` | CREATE | 드로어 markup·안정키 매핑·graceful degrade·a11y·JSON escape·reduced-motion·H-invariant green |
| `plugins/mccp/scripts/lib/renderer/tests/section-fidelity.test.js` | UPDATE | 섹션 항목 `data-detail-id` 존재 assert(있을 때) — 기존 fidelity assert와 동기 |
| `DESIGN.md` (+ `docs/v1.3.0-observability/DESIGN.md`) | UPDATE | H7/H3 carve-out + H18 신설 근거 명문화(드로어 비중첩 overlay = 의도된 design intent) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.0 → 1.18.1` minor bump (§3.7 milestone ship) |
| `CHANGELOG.md` | UPDATE | M3 row 추가(존재 시) |

## Tasks

### Task 1: drawer-detail.js — 안정-키 + 4종 detail 빌더 (SSoT)
- **Action**: 신규 `parsers/drawer-detail.js`. export:
  - `detailId(kind, parts)` — **충돌 안전 안정 키**(Codex R1 F2). 인덱스 절대 금지. **basename 아니라 plan repo-relative path** + 항상-present 식별자 사용:
    - OQ: `oq:<planRelPath>#L<lineNumber>` (lineNumber는 plan 내 유일).
    - 위험: `risk:<planRelPath>#<ordinal>` (ordinal = plan Risks 표 행 순번 — 중복 위험 텍스트에도 유일·안정. text-hash 폐기).
    - receipt: `receipt:<rowKey>` (audit-timeline rowKey = gate\|decision\|hash, hash 부재 시 gate\|decision\|@created_at). 동일 (gate,decision,created_at) 충돌 가능성엔 ordinal suffix tiebreak.
    - 마일스톤: `ms:<planRelPath>` (planRelPath는 milestone당 유일; 동일 basename 다른 PRD도 path로 분리).
  - `addDetail(map, id, kind, detail)` — Map 삽입 helper. **키 충돌은 hard error**(Codex R1 F2): 이미 존재하면 loud stderr + ordinal suffix(`<id>~<n>`)로 강제 유일화하고 caller가 `collisions` 카운트를 받음 → H18/test가 collisions>0을 FAIL 처리. silent first-wins 금지.
  - `buildOQDetail` / `buildRiskDetail` / `buildReceiptDetail` / `buildMilestoneDetail` — 각각 `{ title, tags:[{label,tone}], rows:[[dt,ddRaw]], sections:[[h3, proseHtml]], action? }` 반환. **주입 경계 단일화(Codex R1 F3)**:
    - `title`·`rows[].dt/dd`·`tags[].label`·`action` = **RAW 텍스트**(normalizeProse만, escape/HTML 금지) → 드로어 JS가 `textContent`/`createTextNode`로 주입(innerHTML 사용 안 함).
    - `sections[].proseHtml` = **서버에서 `renderProseHtml`로 렌더한 안전 HTML**(escape + inline-markdown, 유일한 innerHTML sink). raw derive 값이 innerHTML로 가는 경로 0.
    - 부재 필드는 row/section **생략**(placeholder 금지 — graceful degrade).
  - `serializeDetails(map)` — `JSON.stringify` 후 **실제 유니코드 이스케이프**: `<`→`<`, `>`→`>`, `&`→`&`, ` `→` `, ` `→` `. 결과는 `<script type="application/json" id="drawer-data">` 본문 — content 무관 break-out 0. (이전 plan의 `<`→`<` 표기는 markdown 엔티티 mangle로 인한 no-op 오기 — 실제 구현은 유니코드 escape.)
- **Mirror**: `audit-timeline.js:31` rowKey, `format-utils.js` renderProseHtml/normalizeProse, sample `render(d)` d-shape(단 textContent/innerHTML 분리).
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/drawer.test.js` — 키 충돌(중복 위험/마일스톤 fixture)에서 collisions>0 FAIL, serializer가 `</script` literal·data 유래 unescaped `<` 미포함, REQUIRED 필드 present, OPTIONAL degrade.

### Task 2: 섹션 모듈 4종 — data-detail-id + details 누적
- **Action**: open-questions/risks/audit-timeline/milestone-history의 `renderItem`에서 (1) `detailId(...)` 계산, (2) 항목 루트 요소(`<li class="li-item"...>` / `<li class="audit-row"...>` / `<li class="milestone-item"...>`)에 `data-detail-id="<id>"` 부여, (3) `details.push({ id, kind, detail: build*Detail(...) })`. 반환을 `{ html, md, details }`(+위험은 기존 `foot`)로 확장. detail 빌드 실패는 try/catch로 해당 항목만 skip(loud stderr) — html은 그대로.
- **Mirror**: 각 섹션 기존 renderItem 구조 + `index.js:18` safeSection fail-open 정신.
- **Validate**: 섹션별 기존 `*.test.js` green + 신규 detail assert. `grep 'data-detail-id' status.html` 비어있지 않음.

### Task 3: plan-body.js — risk 안정 토큰 + plan Summary read-side
- **Action**: (a) `parseRisks`가 각 행에 `lineNumber`(또는 안정적 텍스트 토큰) 부여해 위험 안정 키 재현 가능하게. (b) `extractPlanSummary(planBody)` — plan `## Summary` 섹션 본문 첫 단락을 read-side 추출(없으면 null). milestone-history가 ship plan을 read해 요약 채움. **receipt 스키마 무변경**(OQ#3 — chain-of-custody 무손상).
- **Mirror**: `plan-body.js:96` parseOpenQuestions(lineNumber 패턴), `milestone-history.js:113` plan read.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` + 마일스톤 detail에 요약 표시(요약 있는 fixture).

### Task 4: html.js — 드로어 CSS + 마크업 + JS + JSON 임베드 + ic-x
- **Action**:
  - LAYOUT에 샘플 `.drawer*`/`.d-*`/`.clickable` CSS 이식(샘플 408-447 그대로, 토큰 변수 재사용). `@starting-style` slide-in + reduced-motion 즉시.
  - ICON_SPRITE에 `ic-x` symbol 추가.
  - `renderHtml`이 `sections`의 각 `details`를 단일 Map으로 aggregate → `serializeDetails` → `<script type="application/json" id="drawer-data">` emit + `<dialog class="drawer" id="drawer">` 마크업(닫기 버튼 = `ic-x`).
  - 드로어 JS(IIFE, 인라인): `drawer-data` JSON 파싱 → `data-detail-id` 보유 요소에 role=button/tabindex/aria-haspopup 부여 + click/keydown(Enter/Space) → `openDetail(kind, detail)`. **주입 경계(Codex R1 F3)**: `render(d)`가 title/tags/rows/action은 `document.createElement`+`textContent`(raw, innerHTML 사용 안 함), sections의 proseHtml만 `innerHTML`(서버 렌더 안전 HTML). raw derive 값이 innerHTML로 가는 경로 0. open 시 `showModal()` + close 버튼 focus, Esc/backdrop close, close 후 trigger로 focus 복귀. copy 버튼 재바인딩(기존 COPY_SCRIPT delegation 재사용 시 위임). detail 부재 id는 미바인딩.
  - JS는 progressive enhancement — no-JS 시 항목은 일반 표시(클릭 무동작), 섹션 baseline 무손상.
- **Mirror**: 샘플 849-994 JS, `html.js:484` STALE_SCRIPT/`:486` COPY_SCRIPT 인라인 패턴, H13(외부 fetch 0 — 인라인만).
- **Validate**: `node plugins/mccp/scripts/derive/cli.js render` → `status.html`에 `<dialog`/`drawer-data`/`ic-x` 존재 + 사용자 육안 대조(샘플 일치).

### Task 5: output-constraints.js — H7/H3 carve-out + H18 신설
- **Action**: (a) H7 glassmorphism check에 `::backdrop` 셀렉터 carve-out(드로어 scrim은 glass 카드 chrome 아님). (b) `H3_CARVEOUT`에 `drawer|drawer-head|drawer-close|drawer-body|d-rows|d-tags|d-action|clickable` 추가. (c) 신규 H18(positive 계약): `<dialog`가 존재하면 (i) `aria-label`/`aria-labelledby` 보유, (ii) **trigger 수 == 유일 `data-detail-id` 수 == `drawer-data` JSON 키 수**(Codex R1 F2 — 중복 id·고아 키·누락 매핑 전부 fire, 단순 "키 존재"만 검사 안 함), (iii) 인덱스 매핑 잔재(`items[i]` 류) 부재 — violation 시 fire. DESIGN.md 근거 동기 갱신.
- **Mirror**: `output-constraints.js:39` H3_CARVEOUT, `:166` H7, H17 DOM-aware 패턴.
- **Validate**: `renderStatus(...).design_constraint_violations == []` + H18 위반 fixture(고아 키)에서 fire 확인.

### Task 6: 테스트 + 버전 + 문서
- **Action**: `tests/drawer.test.js` 신설(markup·안정키 round-trip·graceful degrade[필드 부재 fixture]·a11y[role/tabindex/aria-haspopup/dialog aria-label]·JSON escape[`</script>`·따옴표·`<` payload]·reduced-motion·details 빌드 fail-open). `section-fidelity.test.js`에 `data-detail-id` assert 동기. plugin.json `1.18.1`. DESIGN.md/CHANGELOG row. STATUS.md 섹션 md는 무변경(M4).
- **Mirror**: `tests/escaping.test.js`(XSS payload), `tests/a11y-aria-labels.test.js`, `tests/design-invariants.test.js`.
- **Validate**: 전체 스위트 green(아래 Validation).

## Validation

```bash
# 렌더러 + derive 전체 스위트 (회귀 0 — baseline renderer 364 test() + derive)
node --test plugins/mccp/scripts/lib/renderer/tests/
node --test plugins/mccp/scripts/derive/tests/

# 신규 드로어 단위
node --test plugins/mccp/scripts/lib/renderer/tests/drawer.test.js

# H-invariant lint green (H7/H3 carve-out + H18 신설 후)
node -e "const {renderStatus}=require('./plugins/mccp/scripts/lib/renderer'); const m=require('./plugins/mccp/scripts/derive').deriveModel ? require('./plugins/mccp/scripts/derive').deriveModel({cwd:process.cwd()}) : {}; const r=renderStatus(m,{}); console.log('violations:', r.design_constraint_violations); process.exit(r.design_constraint_violations.length?1:0)"

# 실 렌더 산출 + 드로어/안정키/실데이터 grep (더미 0건)
node plugins/mccp/scripts/derive/cli.js render
grep -c '<dialog' .claude/cache/status.html
grep -c 'data-detail-id' .claude/cache/status.html
grep -c 'drawer-data' .claude/cache/status.html
grep -nE '임의 예시|dummy|placeholder|TODO' .claude/cache/status.html || echo "no placeholder OK"

# 사용자 육안 대조: .claude/cache/status.html ↔ dashboard-sample.html (브라우저 검증 부재 → 사용자 확인 필수)
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 임베디드 JSON `</script>` break-out / XSS (Codex R1 F3) | 중 | **단일 주입 경계**: JSON prose는 서버 `renderProseHtml` 안전 HTML(유일 innerHTML sink), 그 외 값은 textContent. serializer는 실제 유니코드 escape(`<`→`<` 등 + LS/PS). `tests/drawer.test.js`가 `</script>`·`<img onerror>`·따옴표 payload fixture로 emitted script에 unescaped `<` 0 검증. status.html은 local-trust지만 경계는 불변 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 안정 키 충돌 → 클릭이 엉뚱한 드로어 (Codex R1 F2) | 중 | planRelPath + 항상-present 식별자(OQ lineNumber / 위험 ordinal / receipt rowKey / 마일스톤 path). **충돌은 silent first-wins 아니라 hard fail** — `addDetail` collisions 카운트 + H18 trigger==유일id==JSON키 등식 + 중복 fixture 테스트 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| H7/H3 carve-out 과확장이 design-gate 약화 | 중 | carve-out을 `::backdrop` + drawer/.d-* 정확 셀렉터로 한정(와일드카드 금지) + 신규 H18 positive 계약으로 보강 + DESIGN.md 근거 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 드로어 상세 일부 필드 부재(시나리오/잔여/요약) | 중 | graceful degrade — 가용 row/section만, 전무하면 미바인딩. placeholder 금지(PRD 원칙). 테스트로 부재 fixture 커버 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 4 섹션 동시 수정이 기존 테스트 대량 회귀 | 고 | `{html,md}`→`{html,md,details}` 가산 확장(기존 필드 무변경) + 섹션별 단위 테스트 유지 + data-detail-id는 항목에 attr 추가만(구조 무변경) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| no-JS / 스크린리더에서 드로어 정보 손실 | 중 | progressive enhancement(JS는 가산) + 섹션 baseline에 핵심 정보 유지 + STATUS.md 동등본(M4). M3은 섹션 md 무손상 보장 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| receipt 스키마 확장 유혹 → chain-of-custody 훼손 | 저 | OQ#3 결정 = 무확장. 마일스톤 요약은 plan `## Summary` read-side. 어떤 receipt 필드도 추가하지 않음 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Open Questions (plan 단계 해소 결정 기록)

- **드로어 상세 추출 경계** → receipt(briefing/hash/round)·OQ(text/source/section)·위험(impact/likelihood/mitigation)은 전부 read-side 가용. 시나리오/잔여/선택지 A/B는 plan 표/본문에 컬럼 부재 → graceful degrade. 마일스톤 요약만 plan `## Summary` read-side 추출. **신규 stamp 0.** <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
- **스키마 확장 chain-of-custody 영향** → 해당 없음. receipt 스키마 무변경 결정 → `receipt_hash` carve-out 불필요(briefing 선례 미적용). <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
- **항목↔derive 안정 키** → OQ `oq:<planBasename>#<lineNumber>`, 위험 `risk:<planBasename>#<lineToken>`, receipt `receipt:<rowKey>`(gate\|decision\|hash), 마일스톤 `ms:<planBasename>`. 인덱스 금지. 항목 수 가변은 기존 MAX_EXPANDED + `+N 더보기` 그대로(드로어는 expanded/collapsed 양쪽 바인딩). <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
- **H1~H17 충돌 인벤토리** → H7(`::backdrop` blur, carve-out), H3(drawer/.d-* radius, carve-out). H4(drawer border-left 1px = 무발화), H6(.d-title 1.05rem = 무발화), H13(인라인 JS = 무발화), H15/H16(`<script>` strip = 무발화). 신규 H18 추가. <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
- **STATUS.md 드로어 평면화** → M4 결정(이 plan 범위 밖). M3은 섹션 md 무변경. <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
- **Pretendard 전달** → M1에서 vendored woff2 base64 @font-face로 이미 해소(`html.js:24` FONT_FACE). M3 무관. <!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Acceptance

- [ ] 모든 태스크 완료
- [ ] `node --test plugins/mccp/scripts/lib/renderer/tests/` + `derive/tests/` green (회귀 0)
- [ ] `renderStatus(...).design_constraint_violations == []` (H7/H3 carve-out + H18 신설 후)
- [ ] `status.html`에 `<dialog class="drawer">` + `data-detail-id` + `drawer-data` JSON 존재, placeholder/더미 0건
- [ ] 4종 항목(OQ/위험/타임라인/마일스톤) 클릭/Enter/Space → 드로어 derive 상세 표시(안정 키 매핑), 상세 부재 시 graceful degrade
- [ ] **REQUIRED 필드 always-present** 테스트 통과(Codex F1) — kind별 필수 필드 부재 시 FAIL, OPTIONAL 부재는 통과
- [ ] **키 충돌 hard fail**(Codex F2) — 중복 위험/마일스톤 fixture에서 trigger==유일id==JSON키 등식 위반 시 FAIL
- [ ] **단일 주입 경계 + serializer escape**(Codex F3) — `</script>`/`<img onerror>` payload fixture에서 emitted script unescaped `<` 0, raw 값 innerHTML 경로 0
- [ ] a11y: trigger role=button/tabindex/aria-haspopup, `<dialog>` aria-label, Esc/backdrop 닫힘, focus 복귀, reduced-motion 즉시
- [ ] receipt/derive 스키마 무변경(chain-of-custody 무손상) — 마일스톤 요약은 plan `## Summary` read-side
- [ ] plugin.json `1.18.1` + DESIGN.md H7/H3/H18 근거 기록
- [ ] 사용자 육안 대조 — `status.html` ↔ `dashboard-sample.html` 드로어 일치 확인
- [ ] Patterns mirrored, not reinvented

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` `## Output Constraints` Read 완료 (4 anchor) + impeccable `PRODUCT.md`(register=product, "Quiet by default, loud on demand" + "디테일은 cell 클릭으로 진입" = 드로어 설계 원칙 정합).
- 호출: `Skill(impeccable, "critique")` — 4 Output Constraints 대상.
- 라운드 수: 1 (R0 CONVERGED)
- verdict: **converged**
- Findings:
  | # | Severity | Constraint | Verdict | 흡수 |
  |---|---|---|---|---|
  | 1 | MEDIUM | (3) raw markdown 금지 | ABSORBED_NOW | 드로어 prose를 `renderProseHtml`(inline-markdown 렌더) 파이프라인으로 — Task 1/Task 4 갱신 |
- Constraint 1(정보 위계 3단계): PASS — 드로어 `h2.d-title → h3.d-sec` depth ≤3, H15/H18 강제.
- Constraint 2(강조색 1개): PASS — near-monochrome(chroma 0) + accent 1, sev 색은 예외 신호(승인 샘플 동형).
- Constraint 4(항목 수 상한): PASS — 섹션 MAX_EXPANDED + `<details>` 유지, 드로어는 단일 항목 상세.
- HIGH/CRITICAL/UNKNOWN finding 0 → oracle CONVERGED (cap=2 미도달, R1 미진입).

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더 UI 미존재 → impeccable 명령 호출 안 함(recommend-only 체크리스트). implement(M3 prp-implement) 단계에서 stage-appropriate 명령이 라우팅된다.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` · `/impeccable typeset` · `/impeccable animate`(드로어 slide-in motion) · `/impeccable colorize` |
| simplify | `/impeccable adapt`(드로어 반응형 92vw) · `/impeccable distill` · `/impeccable clarify` |
| evaluate | `/impeccable critique`(§3.9 loop) · `/impeccable audit`(드로어 a11y/focus/Esc) |
| harden | `/impeccable harden`(graceful degrade·edge case) · `/impeccable optimize` · `/impeccable onboard` |
| polish | `/impeccable polish`(ship 전 최종) |

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.17.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2; classification=ok, blocking=false, durationMs≈215s)
- 라운드 수: 1 (R1; cap=1, ACCEPT_NOW HIGH 3건 모두 R1 내 완전 흡수 → R2 미escalate)
- 합치 결론: verdict=needs-attention → R1 흡수 후 수렴. "drawer가 silent detail loss·비유일 id·미명세 JSON/innerHTML 경계를 baked-in" 지적을 plan-spec 강화로 해소.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 read-side-only가 required drawer detail을 silent drop | HIGH | ACCEPT_NOW | drawer 목적과 충돌. → "Drawer field contract: REQUIRED vs OPTIONAL" 섹션 + REQUIRED always-present 테스트 + 위험 시나리오/잔여는 source schema 부재임을 visible 명시 |
  | F2 중복 detail-id가 클릭을 엉뚱한 드로어로 라우팅 | HIGH | ACCEPT_NOW | Map first-wins + H18 키존재-only 검사로 dup 통과. → planRelPath+ordinal 키 + addDetail 충돌 hard fail + H18 trigger==유일id==JSON키 등식 + 중복 fixture |
  | F3 serializer no-op 오기 + innerHTML fragile | HIGH | ACCEPT_NOW | `<`→`<` no-op + raw→innerHTML. → 단일 주입 경계(prose=서버 안전HTML/innerHTML, 그 외 textContent) + 실제 유니코드 escape(LS/PS 포함) + payload fixture |
- Deferred to backlog: 0 → (DEFER_TO_BACKLOG 항목 없음 — 3건 모두 ACCEPT_NOW)
- Open Questions: 없음 (auto-CRITICAL 0 — secret/data-loss/migration/auth/external/crypto 해당 없음. F3는 local-trust status.html 방어 강화이지 active auth bypass 아님)
- Codex session 참조: threadId `019ef5e3-a564-7061-81ff-967772b651e6`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (verdict=needs-attention → R1에서 F1/F2/F3 HIGH 3건 모두 plan-spec로 흡수: REQUIRED/OPTIONAL 필드 계약, planRelPath+ordinal 안정 키 + 충돌 hard-fail + H18 등식, 단일 주입 경계 + 유니코드 escape). No new implement-time decisions detected (구현은 plan이 pre-commit한 결정의 기계적 실행). Files-to-Change 외 확장 없음. Cross-gate dedupe applied.
