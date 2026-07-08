# Plan: Dashboard Console Redesign — M2 섹션 콘텐츠 + derive 실데이터 추출

**Source PRD**: `.claude/prds/dashboard-console-redesign.prd.md`
**Selected Milestone**: M2 — 섹션 콘텐츠 + derive 실데이터 추출 (Delivery Milestones #2)
**Complexity**: Large

## Summary

M1이 깐 콘솔 셸(사이드바·topbar·panel anatomy·토큰) 위에서, 각 섹션의 **내부 마크업**을 승인된 `dashboard-sample.html`의 class anatomy로 충실 이식하고, 샘플의 모든 더미 자리를 derive 엔진이 실제 `.claude/` source에서 뽑은 값으로 채운다. 대부분의 데이터(OQ·위험·파이프라인·타임라인·마일스톤)는 이미 섹션 모듈이 read-side로 추출 중이므로 M2의 무게중심은 **(1) 마크업 fidelity 리맵 + (2) prose 렌더 파이프라인(H10/H16 해소) + (3) 소수 파생 보강(pipe-status 텍스트·is-block/is-bad·hero action-prompt·axis-legend)** 이다. 우측 드로어와 드로어 상세 추출은 M3, STATUS.md 문서 재구성은 M4로 이연한다.

## Scope boundary (이 milestone가 닫는 것 / 닫지 않는 것)

| 영역 | M2 (이 plan) | 이후 |
|---|---|---|
| hero: hero-status + verdict + action-prompt(다음 명령 복사) + axis-legend(dot 4축) | ✅ 샘플 fidelity | — |
| 미해결 질문: `stack-list > li-item`(sev + li-q + meta-cue 출처 + inline-prompt) + `+N 더보기` | ✅ | 항목 클릭 드로어 = **M3** |
| 위험: `stack-list > li-item`(sev + li-q + meta-cue mit) + panel-foot foot-link | ✅ | 시나리오/잔여 상세 드로어 = **M3** |
| 게이트 파이프라인: `pipe-row`(pipe-id + pipe-stages ol + node-mark/node-label/node-link + pipe-status 텍스트 + is-done/is-active/is-block) + panel-foot foot-stat | ✅ | — |
| 타임라인: `audit-row`(audit-rail: audit-node is-ok/is-bad + audit-line / audit-body: audit-head + audit-meta) | ✅ | 항목 클릭 receipt 상세 드로어 = **M3** |
| 마일스톤 기록: `milestone-item`(ms-check + ms-text + ms-file + ms-when) + `+N 더보기` | ✅ | 마일스톤 요약 드로어 = **M3** |
| prose 파이프라인 (normalizeProse 전면 + inline-markdown 렌더 → H10/H16 == []) | ✅ | — |
| 섹션 CSS 컴포넌트(stack-list/li-item/sev/pipe-*/audit-*/ms-*/axis-legend/hero-status/inline-prompt/foot-*) | ✅ html.js LAYOUT 이식 | — |
| 우측 native `<dialog>` 드로어 + 드로어 derive 상세 추출 + 스키마 확장 | ⛔ | **M3** |
| STATUS.md plain-text **문서** 재구성(새 IA) | ⛔ 섹션 md는 동기 갱신하되 문서 IA 재구성은 이연 | **M4** |
| route IA(개요/파이프라인/위험·질문/활동 4-route) | ⛔ M1 ship 그대로 유지(사용자 결정 — 재논의 안 함) | — |

> route IA는 M1에서 사용자 결정으로 샘플 3-route를 4-route(위험·질문 분리)로 의도적 이탈했다(`html.js:536` 주석). M2는 이를 그대로 두고 **섹션 내부 마크업만** 샘플 fidelity로 올린다.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 섹션 모듈 구조 | `sections/open-questions.js:30` | `render*(model, formatUtils, planBody, opts)` → `{ html, md }`. MAX_EXPANDED + `<details>+N 더보기` overflow |
| 실데이터 추출 | `sections/status-grid.js:30` (in-progress/blocked/next/risks 카운트) | derive `m.sources.*.items` 에서 안정 키(decision_id) 기반 집계. 인덱스 매핑 금지 |
| is-block 파생 | `parsers/decision-state.js` 신규 공유 helper (Codex F1) — latest per (decision,gate) created_at/round 시간순 | pipeline is-block / timeline is-bad / status-grid blocked 단일 SSoT. **스키마 확장 불필요** |
| prose 정규화 | `format-utils.js:87` (`normalizeProse`) + `audit-timeline.js:158` (briefing 적용 선례) | em-dash→comma. M2는 전 섹션 prose로 확장 + inline-markdown 렌더 추가 |
| 색+아이콘 병행 | `pipeline.js:121` (`pipe-node` + icon + `sr-only`) / `audit-timeline.js:148` | 색 단독 의미 금지 — 노드는 색 + 아이콘 + sr-only 텍스트 |
| Tests | `tests/design-invariants.test.js` + 섹션별 `*.test.js` | `renderStatus(...).design_constraint_violations == []` + 섹션 출력 마크업 assert. node:test |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/format-utils.js` | UPDATE | `renderProseHtml(text)` + `renderProseMd(text)` 신규 — normalizeProse + inline-markdown(`` `code` ``→`<code>`, `**bold**`→`<strong>`, `[t](u)`→텍스트/anchor) 렌더 + **MD0xx markdownlint 코드 escape**(H16 catalog 1:1). H10/H16 해소의 공용 진입점 |
| `plugins/mccp/scripts/lib/renderer/parsers/decision-state.js` | CREATE | (Codex F1) 공유 helper `deriveDecisionState(receipts)` — (decision_id, gate)별 **latest**(created_at desc, round desc tiebreak) 노드 + decision-level 상태 분리(`done`/`active`/`blocked`). status-grid·pipeline·timeline이 단일 SSoT로 소비. blocked는 "latest 비-converged AND 더 최신 converged 부재" 시간순 판정 |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | `oq-item/item-text/blockquote meta-cue/action-prompt` → 샘플 `stack-list>li-item`(sev s-high/s-med/s-low + li-main>li-q + meta-cue 출처 mono + cue-sec + inline-prompt). prose는 renderProseHtml 경유 |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | `risk-item` → 샘플 `li-item`(sev + li-q + `meta-cue mit` 완화). prose renderProseHtml. panel-foot foot-link은 html.js renderPanel opts로 |
| `plugins/mccp/scripts/lib/renderer/sections/pipeline.js` | UPDATE | `pipe-node/pipe-icon/pipe-stage/pipe-edge/pipe-track` → 샘플 `pipe-id + ol.pipe-stages > li.pipe-node(is-done/is-active/is-block) > node-mark(svg check/dot/alert) + node-label + node-link` + `pipe-status`(텍스트). is-block = blocked 파생. status 텍스트 맵 |
| `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js` | UPDATE | `tl-step/tl-node/tl-body/blockquote.briefing` → 샘플 `audit-row > audit-rail(audit-node is-ok/is-bad + audit-line) + audit-body(audit-head: audit-gate/audit-dec/audit-when, audit-meta: conv + briefing tok)`. is-bad = blocked 파생. 마지막 행 audit-line 생략 |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | `ms-name + muted time + planChip` → 샘플 `ms-check(svg check) + ms-text(name + ms-file) + ms-when(상대시각)` |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | `renderHeroPanel`을 샘플 hero로 — `hero-status`(dot + 상태 라벨) + `verdict`(h1) + `action-prompt`(다음 명령 복사) + `axis-legend`(dot-accent/dot-bad/dot-mute/dot-warn + `<b>` 값). `renderPanel`에 `panel-count` + `panel-foot`(foot-link/foot-stat) opts. LAYOUT에 섹션 컴포넌트 CSS 이식 |
| `plugins/mccp/scripts/lib/renderer/tests/*.test.js` | UPDATE | open-questions/risks/pipeline/audit-timeline/milestone-history 테스트를 새 마크업 contract로 마이그레이션 + grep 가드(old class 잔존 0) |
| `plugins/mccp/scripts/lib/renderer/tests/section-fidelity.test.js` | CREATE | 샘플-fidelity 회귀 가드: 각 섹션이 샘플 class anatomy emit + 실데이터(임의 예시 0) + is-block/is-bad 파생 + prose 파이프라인(H10/H16 == []) |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE | M2 섹션 fidelity + prose 파이프라인(H10/H16 데이터-driven 해소) 근거 1줄 + "샘플 섹션 마크업이 계약" |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.17.0 → 1.18.0` minor bump (§3.7) + html.js footer 버전 라벨 동기 |

## 데이터 추출 인벤토리 (PRD OQ #2/#6 해소 — 무엇이 read-side / 무엇이 신규)

> 결론: **M2 전 섹션은 read-side로 충족 — 스키마 확장 0건.** 스키마 확장은 M3 드로어 상세(OQ 선택지·위험 시나리오/잔여·receipt 상세) 전용.

| 샘플 더미 자리 | 실데이터 출처 (read-side) | 상태 |
|---|---|---|
| hero verdict 문장 | `verdict.computeVerdict` (11-step) `.text` | ✅ 기존 |
| hero action-prompt 다음 명령 | status-grid `next` cell — `looksLikeCommand` 이면 복사 버튼, 아니면 plan 라벨(graceful) | ✅ 기존(M1 hero-next) |
| axis-legend 진행/차단/다음/위험 | status-grid `cells`(inProgressCount/blockedCount/next/risksOpen) | ✅ 기존 |
| OQ sev/질문/출처/섹션 | open-questions merged(STATE.md + plan body openQuestions: severity/source/headingPath) | ✅ 기존 |
| OQ inline-prompt 명령 | `buildActionPrompt(q,'openQuestion')` | ✅ 기존 |
| 위험 sev/내용/완화 | risks planBody.risks(impact/likelihood/mitigation) | ✅ 기존 |
| 파이프라인 pipe-id/노드 상태 | pipeline byDecision + STAGES + nodeStatus(converged/pending/missing) | ✅ 기존 |
| 파이프라인 is-block + pipe-status 텍스트 | **신규 파생** (Codex F1) — `deriveDecisionState`가 (decision,gate)별 latest를 created_at/round로 골라 done/active/blocked 분리. blocked = latest 비-converged AND 더 최신 converged 부재. status 텍스트 = state+활성단계 도출 | ✅ read-side 파생 |
| 타임라인 gate/decision/시각/수렴/briefing tok/건너뜀 | audit-timeline(gate/decision_id/created_at/converged/briefing_summary/briefing_token_count/briefing_invocation_count) | ✅ 기존 |
| 타임라인 is-bad(divergent) | **신규 파생** (Codex F1) — `deriveDecisionState` 동일 SSoT(blocked state). 단순 converged=false 가 아니라 시간순 latest 판정 | ✅ read-side 파생 |
| 마일스톤 name/plan 파일/완료시각 | milestone-history(parseDeliveryMilestonesComplete + pickShipReceipt/git commit time) | ✅ 기존 |

## prose 렌더 파이프라인 (PRD success metric "산출물 green" — H10/H16 해소)

현재 production render는 실데이터 prose 때문에 **H10 em-dash 867건(html 500 + md 367) + H16 unrendered marker 514건(entity-backtick 433 + bold 73 + md-link 8)** advisory 위반. 원인:

- `escapeHtml`이 prose의 backtick `` ` ``을 `&#96;`로 변환 → H16 `entity-backtick` 검출. 실 plan/STATE prose가 백틱·볼드 다수.
- OQ/위험/마일스톤 prose에 `normalizeProse` 미적용 → em-dash(—) 누출. (briefing만 적용 중.)

**해소: `renderProseHtml`/`renderProseMd` 공용 헬퍼를 전 섹션 prose에 적용.**

- `normalizeProse` 먼저(— → `,`, ` -- ` → `, `) → H10 0.
- inline-markdown 렌더: `` `x` `` → `<code>x</code>`(H16이 `<code>` strip → 무해), `**x**`/`__x__` → `<strong>x</strong>`, `[t](u)` → 텍스트만(또는 안전 anchor) → H16 0. 나머지 텍스트는 escapeHtml. **MD0xx markdownlint 코드도 escape/중성화**(H16 catalog는 md-link·MD0xx 포함 — 1:1 정렬, Codex F2).
- md 출력: normalizeProse만(md의 백틱·볼드는 정당한 markdown — H16은 html-only). em-dash만 정규화.
- **(Codex F2) 데이터 prose 필드뿐 아니라 섹션 md/html 템플릿의 하드코드 separator도 정리**: 섹션 모듈 template literal에 박힌 ` — ` 구분자(예: open-questions md `'** — '`)를 `·`/`,`로 교체 — H10은 md 출력 전체를 스캔하므로 prose 정규화만으로는 template em-dash가 남는다. 즉 "emitted fragment 전체"를 clean.
- **SSoT 불변**: source 파일(PRD/STATE/receipt) 미편집 — 정규화는 render-time only(`format-utils.js:85` 선례).

> 대안(기각): H10/H16 룰을 data-prose 제외로 개정 → absolute-ban 가드(렌더러 자체 템플릿 copy의 em-dash/markdown 오염 방지)를 약화. prose 파이프라인이 정공법 — 룰 본체 불변, 산출물만 clean.

## H-invariant 영향 (M2 — 샘플 충돌만)

| Rule | M2 영향 | 처리 |
|---|---|---|
| **H3** radius | 샘플 섹션 컴포넌트(sev/node-mark/node-dot/ms-check/inline-prompt/audit-node/dot) radius — **M1이 carve-out에 선반영** (`output-constraints.js:39`) | 무변경(검증만) |
| **H9** uppercase ≤1 | 샘플 sev 배지(HIGH/MED/LOW)는 **literal 대문자 텍스트** — `text-transform: uppercase` CSS 아님 → H9 미발동 | 무변경. sev CSS에 text-transform 금지(literal 텍스트로 emit) |
| **H10** em-dash | prose 파이프라인 + 섹션 템플릿 separator 정리(md 출력 포함, Codex F2) | normalizeProse 전면 + template sweep |
| **H16** raw markdown | inline-markdown 렌더 + MD0xx 중성화 (catalog H16 1:1, Codex F2) | renderProseHtml |
| **H11/H12** sev token/.sev-pill | 샘플 `.sev`는 색 토큰(s-high/s-med/s-low) — `--sev-*` 토큰 신설 금지, `.sev-pill` 클래스 금지 | 검증만 |
| 그 외 H1/H2/H4-H8/H13/H14/H15/H17 | M2 섹션 마크업 미충돌 | 무변경 |

## Open Question 해소

- **PRD OQ #2 (드로어 추출 경계)**: M2는 섹션만 — 전부 read-side(위 인벤토리). 드로어 상세(스키마 확장 후보)는 M3.
- **PRD OQ #3 (스키마 확장 chain-of-custody)**: M2는 스키마 확장 0 → receipt_hash 무관. M3 드로어에서 stamp 추가 시 v1.3.0-m2 briefing carve-out(deep-clone) 선례 적용.
- **PRD OQ #6 (항목↔derive 안정 키)**: 안정 키 = decision_id(파이프라인/타임라인), planBasename(마일스톤), OQ는 (source + text) 해시. 인덱스 매핑 금지(M3 드로어 매핑도 동일 키 계승). 항목 수 가변 → 기존 MAX_EXPANDED + `+N 더보기` overflow 유지.

## Tasks

### Task 1: prose 렌더 파이프라인 (format-utils.js) — Codex F2 흡수
- **Action**: `renderProseHtml(text, formatUtils)` + `renderProseMd(text)` 추가. html: normalizeProse → inline-markdown(`` `code` ``→`<code>`, `**b**`/`__b__`→`<strong>`, `[t](u)`→텍스트) → MD0xx 코드 중성화 → 나머지 escapeHtml(토큰 사이 텍스트만). md: normalizeProse만. jargon-dictionary 렌더와 조합 가능하도록 순수 함수. **catalog는 output-constraints.js H16 패턴과 1:1**(bold-asterisk/bold-underscore/inline-backtick/entity-backtick/md-link/md-lint-code 전부 커버).
- **Mirror**: `format-utils.js:87` normalizeProse + escapeHtml + `output-constraints.js:363` H16 patterns
- **Validate**: `node -e` 로 `renderProseHtml('a — \`x\` **b** MD013 [t](u)')` → em-dash 0 + `<code>x</code>` + `<strong>b</strong>` + MD013 raw 미surface

### Task 1.5: 공유 decision-state helper (parsers/decision-state.js) — Codex F1 흡수
- **Action**: `deriveDecisionState(receipts)` 신규 — receipts를 decision_id로 묶고 각 (decision_id, gate)에서 **latest**(created_at desc, round desc tiebreak; pipeline.js `latest()` 재사용)를 골라 노드 상태(done/active/blocked) 분리. decision-level: latest 비-converged 노드가 있고 그 decision에 더 최신 converged가 없으면 `blocked`, 일부 converged + 다음 단계 대기면 `active`, 전부 converged면 `done`. status-grid·pipeline·timeline 단일 SSoT. **active retry(첫 라운드 in-progress) vs blocked(divergent/미수렴 종착)를 시간순으로 구분** — converged=false 단순 판정 폐기.
- **Mirror**: `pipeline.js:41` `latest()` + `pipeline.js:57` `buildDecision` + `status-grid.js:37` blocked
- **Validate**: fixtures — (a) false→retry-in-progress(active, NOT blocked), (b) earlier true→later false(active), (c) multi-gate same-decision, (d) latest false + 후속 converged 부재(blocked). 단위 테스트 green

### Task 2: hero 패널 샘플 fidelity (html.js renderHeroPanel)
- **Action**: `renderHeroPanel`을 샘플 구조로 — `hero-status`(dot + tone 라벨 "릴리스 준비됨"/"진행 중"/"차단" 등 verdict.tone 매핑) + `h1.verdict`(기존 text, prose 파이프라인) + `action-prompt`(next cell이 명령이면 code + copy-btn, 아니면 plan 라벨) + `axis-legend`(4축: dot-accent 진행 / dot-bad 차단 + `<b class="bad">` / dot-mute 다음 / dot-warn 위험 + `<b class="warn">`). 기존 hero-meta(텍스트) 폐기.
- **Mirror**: `html.js:439` renderHeroPanel + `sample 532-551`
- **Validate**: 산출 html `route-overview`에 `axis-legend` 4 `.axis` + `hero-status` dot + (next 명령 시) action-prompt copy-btn

### Task 3: 미해결 질문 섹션 (open-questions.js)
- **Action**: 마크업을 `ul.stack-list > li.li-item`(`span.sev s-{high|med|low}` + `div.li-main`>`div.li-q`(prose) + `div.meta-cue`(출처 `span.mono` 파일 + `span.cue-sec` 섹션) + `div.inline-prompt`(code + copy-btn))로. severity → s-high/s-med/s-low 매핑. `+N 더보기`는 샘플 `details.more`(chev + svg). prose는 renderProseHtml.
- **Mirror**: `open-questions.js:63` renderItem + `sample 562-593`
- **Validate**: 출력에 `li-item`/`sev s-`/`li-q`/`meta-cue`/`inline-prompt`. old `oq-item`/`item-text` 잔존 0

### Task 4: 위험 섹션 (risks.js)
- **Action**: `li.li-item`(sev + `div.li-main`>`div.li-q`(prose) + `div.meta-cue.mit`(완화: `<b>`)). relatedOpenQuestion은 meta-cue 보조 줄. prose renderProseHtml. panel-foot foot-link("활동 기록에서 전체 보기")는 renderPanel opts로 전달.
- **Mirror**: `risks.js:31` renderItem + `sample 605-624`
- **Validate**: 출력에 `li-item`/`sev`/`meta-cue mit`. old `risk-item`/`risk-mitigation` 잔존 0

### Task 5: 게이트 파이프라인 섹션 (pipeline.js)
- **Action**: `deriveDecisionState`(Task 1.5) 소비로 노드 상태(done/active/blocked) 획득 — `converged===false` 단순 판정 폐기. 마크업: `div.pipe-row`>`span.pipe-id` + `ol.pipe-stages`(노드 `li.pipe-node.is-done|.is-active|.is-block` > `span.node-mark`(svg check/`span.node-dot`/svg alert) + `span.node-label` + 사이 `span.node-link`) + `span.pipe-status.s-{ok|active|block}`(텍스트: complete/구현 중/PR 검토 중/계획 중/차단 — state+활성 단계에서 도출). panel-foot foot-stat(complete N · 진행 N · 차단 N). collapse는 샘플 `details` 유지. 기존 `buildDecision`은 `deriveDecisionState`로 위임(중복 제거).
- **Mirror**: `pipeline.js:117` rowHtml + `parsers/decision-state.js`(Task 1.5) + `sample 638-718`
- **Validate**: 출력에 `pipe-id`/`pipe-stages`/`node-mark`/`node-label`/`pipe-status`. blocked fixture → `is-block` + `s-block`; retry-in-progress fixture → `is-active`(NOT block)

### Task 6: 타임라인 섹션 (audit-timeline.js)
- **Action**: is-bad 파생 — `deriveDecisionState`(Task 1.5)의 blocked state 소비(decision의 시간순 latest 판정, 단순 converged=false 아님). 마크업: `li.audit-row`>`div.audit-rail`(`span.audit-node.is-ok|.is-bad` + `span.audit-line`(마지막 행 생략)) + `div.audit-body`(`div.audit-head`: `span.audit-gate` + `span.audit-dec`(/decision) + `span.audit-when`(상대시각), `div.audit-meta`: `span.conv`(svg check/alert + "수렴 R{round}"/"divergent") + briefing("briefing {tok}k tok"/"건너뜀"/"dedupe at PR")). prose는 briefing summary renderProseHtml. footnote(보관/mask/was_stale)는 `tl-note` 유지.
- **Mirror**: `audit-timeline.js:130` renderRow + `sample 732-768`
- **Validate**: 출력에 `audit-row`/`audit-node`/`audit-head`/`audit-meta`. divergent fixture → `is-bad` + `conv.is-bad`

### Task 7: 마일스톤 기록 섹션 (milestone-history.js)
- **Action**: `li.milestone-item`>`span.ms-check`(svg check) + `span.ms-text`(name + `span.ms-file` planBasename) + `span.ms-when`(상대시각 `<time>`). `+N 더보기`는 샘플 `details.more`. name은 renderProseHtml.
- **Mirror**: `milestone-history.js:149` renderItem + `sample 781-826`
- **Validate**: 출력에 `ms-check`/`ms-text`/`ms-file`/`ms-when`. old `ms-name` 잔존 0

### Task 8: 섹션 컴포넌트 CSS 이식 (html.js LAYOUT)
- **Action**: 샘플 `<style>`의 섹션 컴포넌트 CSS를 LAYOUT에 이식 — `stack-list/li-item/sev(s-high/s-med/s-low 색)/li-main/li-q/meta-cue(+mit)/cue-sec/inline-prompt`, `pipeline/pipe-row(grid)/pipe-id/pipe-stages/pipe-node(is-done/is-active/is-block)/node-mark/node-dot/node-label/node-link/pipe-status(s-ok/s-active/s-block)`, `timeline/audit-row/audit-rail/audit-node(is-ok/is-bad)/audit-line/audit-body/audit-head/audit-meta/conv`, `milestone-history/milestone-item/ms-check/ms-text/ms-file/ms-when`, `axis-legend/axis/hero-status/dot(dot-ok/dot-accent/dot-bad/dot-warn/dot-mute)`, `panel-foot/foot-link/foot-stat`, `more/chev`. sev는 색 토큰만(text-transform 금지, H9). radius는 carve-out 클래스만.
- **Mirror**: `html.js` LAYOUT 상수 + `sample 257-430` (style 블록)
- **Validate**: `design-invariants.test.js` green(violations==[]) + 산출 status.html에 컴포넌트 클래스 존재

### Task 9: 섹션 테스트 마이그레이션 + 신규 fidelity 가드 — Codex F3 흡수
- **Action**: open-questions/risks/pipeline/audit-timeline/milestone-history 테스트의 old-class assertion을 새 contract로 전수 마이그레이션. **(Codex F3) old-class grep을 tests-only가 아니라 renderer SOURCE + 생성 산출물로 확장** — `grep -rnE "oq-item|risk-item|item-text|tl-step|tl-node|pipe-icon|pipe-stage\"|pipe-edge|pipe-track|ms-name|risk-mitigation" plugins/mccp/scripts/lib/renderer/sections/ plugins/mccp/scripts/lib/renderer/html.js` → 0 AND 생성 `.claude/cache/status.html`에도 deprecated class 부재. `section-fidelity.test.js` 신규 — 각 섹션 샘플 anatomy emit + is-block/is-bad/active 파생 fixture(F1) + prose 파이프라인(em-dash/raw-marker/MD0xx 0, F2: OQ·risks·milestone·timeline prose 전부 exercise) + deprecated-class 0(`renderStatus().html` 검사, F3) + 임의-예시-데이터 문자열 부재.
- **Mirror**: `tests/design-invariants.test.js` + 기존 섹션 test
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/` 전체 green + old-class grep(source+html) 0

### Task 10: DESIGN.md 근거 + plugin.json bump
- **Action**: `docs/v1.3.0-observability/DESIGN.md`에 M2 섹션 fidelity + prose 파이프라인(H10/H16 데이터-driven 해소, 룰 본체 불변) 근거 + "샘플 섹션 마크업이 계약". `plugin.json` 1.17.0→1.18.0 + html.js footer 버전 라벨 동기.
- **Mirror**: §3.7 milestone 체크리스트
- **Validate**: `node -e "require('./plugins/mccp/.claude-plugin/plugin.json').version"` → `1.18.0`

## Validation

```bash
# 렌더러 전체 테스트 (섹션 마이그레이션 + 신규 fidelity + invariant green)
node --test plugins/mccp/scripts/lib/renderer/tests/

# derive→render 산출 (회귀 0 + status.html 사용자 육안 대조 vs dashboard-sample.html)
node plugins/mccp/scripts/derive/cli.js render

# H10/H16 데이터-prose 해소 검증 (== [])
node -e "const{derive}=require('./plugins/mccp/scripts/derive');const{renderStatus}=require('./plugins/mccp/scripts/lib/renderer');const{runOutputConstraints}=require('./plugins/mccp/scripts/lib/renderer/output-constraints');const{TOKENS,LAYOUT}=require('./plugins/mccp/scripts/lib/renderer/html');const m=derive(process.cwd(),{});const o=renderStatus(m,{cwd:process.cwd()});const r=runOutputConstraints({css:TOKENS+LAYOUT,html:o.html,md:o.md});console.log(JSON.stringify(r.violations))"
#   → [] 기대

# 임의 예시 데이터 0건 (production render 더미 grep)
grep -nE "임의 예시|예시 데이터|dummy|lorem|v2\.4\.0|auth-session-rotation" .claude/cache/status.html && echo "DUMMY LEAK" || echo "real-data OK"

# old-class 잔존 0 — source + 생성 산출물 (Codex F3: tests-only 아님)
grep -rnE "oq-item|risk-item|item-text|tl-step|tl-node|pipe-icon|pipe-edge|pipe-track|ms-name|risk-mitigation" plugins/mccp/scripts/lib/renderer/sections/ plugins/mccp/scripts/lib/renderer/html.js && echo "OLD CLASS (source)" || echo "source migrated OK"
grep -nE "oq-item|risk-item|item-text|tl-step|tl-node|pipe-icon|ms-name" .claude/cache/status.html && echo "OLD CLASS (html)" || echo "html migrated OK"

# self-contained 불변
grep -nE "https?://|@import" .claude/cache/status.html && echo "LEAK" || echo "self-contained OK"
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 섹션 마크업 전면 리맵이 기존 섹션 테스트 대량 회귀 | 고 | 데이터 로직 불변(마크업만 교체) — 회귀를 마크업 assertion으로 국한 + Task별 단위 검증 + grep 가드로 마이그레이션 완결 증명 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| prose 파이프라인이 일부 raw marker 미커버 → H16 잔존 | 중 | runOutputConstraints 검증을 Task 1 직후 + Task 9 fidelity test에 고정. inline 렌더는 code/bold/link 3종 catalog(H16 패턴과 1:1). 미커버 발견 시 catalog 확장 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| is-block/is-bad 파생이 in-progress를 차단으로 오판 | 중 | status-grid의 검증된 blocked 로직(후속 converged 부재) 그대로 재사용 — 단일 SSoT. fixture로 in-progress(후속 converged 있음) vs blocked 양 케이스 가드 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| inline-markdown 렌더가 prose 의미 왜곡(과한 변환) | 저 | 보수적 catalog(code/bold/link만), 나머지는 escapeHtml plaintext. 링크는 텍스트만(anchor 미생성)로 안전 우선 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 브라우저 스크린샷 부재로 시각 회귀 미검출 | 중 | status.html 사용자 육안 대조(필수) + 구조 회귀는 section-fidelity.test.js mechanical 가드 + 가능 시 impeccable audit/polish |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 샘플 더미 잔존(v2.4.0 등 하드코드)이 production에 누출 | 저 | 모든 값 derive 유래 — 더미 grep 가드(Validation). 샘플은 reference, 코드에 하드코드 금지 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Acceptance
- [ ] hero(hero-status + verdict + action-prompt + axis-legend) + 5섹션(OQ/위험/파이프라인/타임라인/마일스톤)이 샘플 class anatomy로 이식됨
- [ ] 모든 섹션 값이 derive 실데이터 유래 — 임의 예시 데이터 grep 0
- [ ] is-block/is-bad/active가 `deriveDecisionState` 공유 helper의 시간순 판정으로 read-side 파생(스키마 확장 0, Codex F1) + pipe-status 텍스트 derive 도출
- [ ] prose 파이프라인 + 템플릿 separator 정리로 `design_constraint_violations == []` (H10/H16, md 출력 + MD0xx 포함, Codex F2)
- [ ] `node --test .../renderer/tests/` 전체 green + section-fidelity 신규 가드(F1 active/blocked fixture) + old-class grep 0(source+html, Codex F3) + 회귀 0
- [ ] 산출 status.html self-contained grep clean + 사용자 육안 섹션 대조 vs dashboard-sample.html
- [ ] DESIGN.md 근거 기록 + plugin.json 1.18.0 bump
- [ ] 패턴 재사용(섹션 모듈 구조/blocked 파생/normalizeProse/node:test), 재발명 아님

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` ## Output Constraints Read 완료
- 4 제약 대조: 정보위계 3단계(hero→섹션→항목, H15 보존) ✓ · 강조색 ≤1(near-mono + status 색 semantic 전용, sev/dot은 의미색) ✓ · raw markdown marker 금지(prose 파이프라인이 H16 == [] 강제) ✓ · 항목 수 상한(MAX_EXPANDED + `details +N 더보기` overflow 유지) ✓
- round 0 verdict: **CONVERGED** (HIGH/CRITICAL finding 0건, cap=2)

## Design Routing Guide

routing mode: auto (effective at implement stage). plan 단계는 렌더 UI가 없어 impeccable 명령을 호출하지 않고 implementer 체크리스트만 기록한다. M2는 섹션 fidelity 이식이므로 implement 단계에서 evaluate(critique/audit) + polish가 핵심.

| Stage | Command |
|---|---|
| discovery | `/impeccable shape` |
| refine | `/impeccable layout` |
| refine | `/impeccable typeset` |
| refine | `/impeccable animate` |
| refine | `/impeccable colorize` |
| refine | `/impeccable bolder` |
| refine | `/impeccable quieter` |
| refine | `/impeccable overdrive` |
| refine | `/impeccable delight` |
| simplify | `/impeccable adapt` |
| simplify | `/impeccable distill` |
| simplify | `/impeccable clarify` |
| evaluate | `/impeccable critique` |
| evaluate | `/impeccable audit` |
| harden | `/impeccable harden` |
| harden | `/impeccable optimize` |
| harden | `/impeccable onboard` |
| polish | `/impeccable polish` |
| system | `/impeccable document` |
| system | `/impeccable extract` |

## Codex Adversarial Review

- 호출: `node .../scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope)
- 라운드 수: 1 (R1 absorption으로 수렴 — ACCEPT_NOW HIGH/CRITICAL 0건이라 R2 미escalate, cap=1)
- 합치 결론: needs-attention → R1에서 3건 모두 흡수 후 CONVERGED. blocked-state 판정 정합성(F1) + lint 파이프라인 표면 누락(F2) + old-class 가드 범위(F3)를 흡수.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 blocked state가 비-시간순 휴리스틱 (active retry를 차단으로 오판) | MEDIUM | ACCEPT_NOW | 공유 `deriveDecisionState` helper(latest per decision×gate, created_at/round 시간순) 신설로 pending/blocked 분리 + 4종 fixture(Task 1.5) |
  | F2 prose-only 파이프라인이 md 템플릿 separator + MD0xx 표면 누락 | MEDIUM | ACCEPT_NOW | 데이터 prose뿐 아니라 emitted fragment(섹션 md/html 템플릿 ` — ` separator) 정리 + H16 catalog 1:1(MD0xx 포함) + 전 섹션 prose fixture로 output-constraints 검증(Task 1·9) |
  | F3 old-class grep이 tests-only — source/산출물 미검사 | LOW | ACCEPT_NOW | grep을 renderer source + 생성 status.html로 확장 + section-fidelity가 `renderStatus().html` deprecated-class 0 assert(Task 9) |
- Deferred to backlog: 0
- Open Questions: 없음 (auto-CRITICAL 0건 — secret/data-loss/migration/auth/external-dest/crypto 무관)
- Codex session 참조: threadId `019ef40f-e77a-74f1-a886-6996cc4c0176`

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.
