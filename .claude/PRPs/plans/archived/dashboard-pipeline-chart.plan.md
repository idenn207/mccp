# Plan: Dashboard Gate-Pipeline Chart (M1)

**Source PRD**: .claude/prds/dashboard-pipeline-chart.prd.md
**Selected Milestone**: 1 — 게이트 스테이지 파이프라인 chart. (M2 활동 로그 step chart / M3 전체 비주얼 리프레시는 다음 cycle.)
**Complexity**: Medium

## Summary
대시보드 `status.html`에 receipt를 `decision_id`별로 묶어 게이트 진행(plan-codex → implement-codex → pr-codex)을 **가로 파이프라인 스테퍼**로 보여주는 신규 섹션을 추가한다. 아키텍처는 **inline SVG/CSS 베이스라인(JS 없이도 정상 렌더) + jQuery/UI 라이브러리 progressive enhancement**(decision 행 expand/collapse, 노드 hover 툴팁, stepper 애니메이션). GitHub Actions 절제 미학(중립 base + 상태색)을 리드로, design-lint H3/H4는 신규 컴포넌트용 carve-out을 추가한다(v1.4.2 carve-out 선례 mirror). markdown은 텍스트 표현 유지.

## Key Decisions (plan 확정)

### D1 — jQuery + UI 라이브러리 **vendored-inline** (progressive enhancement, 사용자 결정 + Codex F2 absorption)
사용자가 jQuery/UI/collapse 라이브러리 적극 활용을 지시. **단 CDN `<script src>`는 금지**(Codex F2 HIGH — status.html은 raw 미마스킹 receipt 데이터를 렌더할 수 있고, third-party CDN JS는 DOM 전체 접근으로 exfiltration vector. SRI/CSP/pinning 부재). 대신 **vendored-inline pinned first-party**로 라이브러리를 번들한다 — 사용자의 "라이브러리 적극 활용" + 보안 trust boundary + self-contained byte-pristine을 모두 만족.
- **베이스라인**: 파이프라인 노드/연결선은 inline SVG/CSS로 렌더 — JS 없이도 상태가 보인다(progressive enhancement).
- **enhancement 레이어**: vendored jQuery(+경량 UI)를 inline `<script>`로 주입 → decision 행 expand/collapse, 노드 hover 툴팁, stepper 애니메이션. 미실행 시 베이스라인 유지(graceful degradation).
- **전달 방식**: vendored-inline (외부 `<script src>` 0). 라이브러리 소스는 `plugins/mccp/scripts/lib/renderer/vendor/`에 pinned 버전으로 보관, html.js가 inline 주입.
- **보안 invariant (Codex F2)**: 렌더 산출물(raw/masked 모두)에 **외부 script URL 0** — `render-integration.test.js`에 "status.html에 `https?://...<script` 외부 참조 없음" assert 추가.
- **lint 주의**: design-lint는 `TOKENS+LAYOUT` CSS 상수와 정적 html/md만 검사. vendored 라이브러리 CSS는 프로젝트 토큰으로 override해 GitHub Actions 절제 미학 유지.

### D2 — 게이트 스테이지 파이프라인은 신규 derive + 신규 섹션 (Codex F1 absorption)
status-grid는 4셀 요약(진행/차단/다음/위험)일 뿐 스테이지 파이프라인이 아니다. receipt를 `decision_id`로 묶어 게이트 진행을 도출하는 **신규 섹션 `pipeline.js`**를 추가(status-grid는 헤더 strip 유지). **canonical 정규화 필수(Codex F1 HIGH)**:
- gate 필드는 `r.gate_id || r.gate` (derive `sources/receipts.js`는 `gate`를 emit, receipt 스키마/fixture는 `mccp-plan-codex` 등 canonical ID — 둘 다 읽어야 missing 오표시 회피).
- 스테이지 매핑은 **canonical `mccp-*` gate ID만** → `mccp-plan-codex`→plan, `mccp-implement-codex`→implement, `mccp-pr-codex`→pr.
- `(decision_id, gate)`별 **최신 receipt 선택**(`created_at`/`round` 정렬) — 같은 gate 다중 receipt 시 stale failed가 later converged를 가리지 않게. retry false→true 수렴이 노드에 반영돼야 함.

### D3 — design-lint carve-out (H3 노드, H4는 SVG connector로 회피)
GitHub Actions 미학은 기존 gate(H7/H8/H13)와 정렬되나, 파이프라인 노드(border-radius)는 H3와 충돌 → `H3_CARVEOUT`에 `pipe-node` 추가(v1.4.2 severity-tag carve-out 패턴). **연결선은 inline SVG/`::before`로 구현해 border-left side-stripe를 아예 쓰지 않으므로 H4 carve-out은 최소화/불필요**(critique F2 해소 — impeccable side-stripe ban 동시 회피). 만약 구현상 `::before` 수평선이 H4 정규식(border-left ≥2px)에 안 걸리면 H4 carve-out 자체가 불필요. **JetBrains Mono 미도입** — 리드가 GitHub Actions이므로 시스템 monospace 유지(H13 회피).

### D4 — STATUS.md(markdown) 분기
markdown은 SVG/인터랙션 불가 → `plan ✓ → impl ✓ → pr ◐` 텍스트 표현. chart/인터랙션은 HTML 전용. 정보 동치 유지.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Section module | `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | `render<Name>(model, formatUtils, planBody, opts)` → `{ md, html, ... }`, `module.exports` |
| Section 조립 | `plugins/mccp/scripts/lib/renderer/index.js:115-125` | `safeSection('name', () => render...())` fail-open |
| HTML 조립 + 토큰 + inline script | `plugins/mccp/scripts/lib/renderer/html.js:35-256` | OKLCH 토큰 + LAYOUT, `<section id>` push, `STALE_SCRIPT`/`COPY_SCRIPT` inline `<script>` 패턴 |
| receipt decision 그룹핑 | `plugins/mccp/scripts/lib/renderer/sections/audit-timeline.js:21-29` `rowKey` | gate+decision+hash 식별 |
| design-lint carve-out | `plugins/mccp/scripts/lib/renderer/output-constraints.js:18-19,57-99` | `H3_CARVEOUT`/`H4_CARVEOUT` 정규식 + 주석 근거 |
| Tests | `plugins/mccp/scripts/lib/renderer/tests/sections.test.js`, `output-constraints.test.js` | Node native `node --test`, fixture model → render → assert |
| 비-색 severity | `plugins/mccp/scripts/lib/renderer/tests/a11y-severity-non-color.test.js` | 색 외 아이콘/형태 병행 |

## Files to Change
| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/sections/pipeline.js` | CREATE | receipt를 decision별로 묶은 가로 파이프라인 스테퍼 섹션(inline SVG/CSS 베이스라인) |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | `<section id="pipeline">` 조립 + 파이프라인 CSS 토큰/스타일 + jQuery/UI CDN `<script>` + enhancement inline script |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATE | `renderPipeline` import + `safeSection('pipeline', ...)` + sections 배열/구조분해 반영 |
| `plugins/mccp/scripts/lib/renderer/output-constraints.js` | UPDATE | H3/H4 carve-out에 `pipe-node`/`pipe-edge` 클래스 추가(컴포넌트 한정) |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | 파이프라인 섹션 markdown 텍스트 표현 |
| `docs/v1.3.0-observability/DESIGN.md` | UPDATE | H3/H4 carve-out 근거 + 파이프라인 design intent + 외부 JS(progressive enhancement) 정책 |
| `plugins/mccp/scripts/lib/renderer/sections/pipeline.js` (vendored) | — | (D1) jQuery/UI는 `plugins/mccp/scripts/lib/renderer/vendor/`에 pinned 번들로 보관, html.js가 inline 주입 |
| `plugins/mccp/scripts/lib/renderer/tests/pipeline.test.js` | CREATE | canonical gate ID 매핑(`gate_id`∥`gate`), `(decision,gate)` 최신 선택 + retry false→true 수렴(F1), status-aware collapse(4번째 행이 blocked면 visible 유지, F3), 빈 입력 fail-open, 상태색/아이콘 병행, escape |
| `plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js` | UPDATE | carve-out이 pipe-node 통과 + H4 위반 0(SVG connector) + 일반 chrome H3/H4 위반은 여전히 검출 |
| `plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js` | UPDATE | 파이프라인 섹션 합성 HTML 포함 + **raw/masked 렌더 모두 외부 script URL 0**(Codex F2 보안 invariant) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | version 1.12.0 → 1.13.0 (minor — 신규 섹션. 1.12.0은 origin/main #52 dashboard-serve-refresh가 선점) |
| `CHANGELOG.md` | UPDATE | [1.12.0] 행 추가 |

## Tasks

### Task 1: pipeline.js 신규 섹션 (베이스라인)
- **Action**: `renderPipeline(model, formatUtils, planBody, opts)` export.
  - `model.sources.receipts.items`를 `decision_id`로 group. **canonical 정규화(Codex F1)**: gate = `r.gate_id || r.gate`, canonical `mccp-plan-codex`/`mccp-implement-codex`/`mccp-pr-codex`만 스테이지로 매핑, `(decision_id, gate)`별 최신 receipt(`created_at`/`round`)만 노드 상태로 사용(stale failed가 later converged 안 가림).
  - 노드 상태: converged=✓(accent), 진행/미수렴=◐(stale/ink), 미존재=○(muted), blocked=✗(status-blocked). 색 + 아이콘 **병행**(a11y, 색 단독 금지).
  - HTML: `<div class="pipeline">` → decision별 `<div class="pipe-row" data-decision>` → 노드 `<span class="pipe-node s-...">` + 연결선(아래 Task 2: inline SVG line/`::before`, **border-left 금지**). decision 상세(receipt/briefing/time)는 `<details>` 컨테이너에 — **h4+ 도입 금지**(정보 위계 3단계, H15). 상세 라벨은 `<summary>`/`<span>`로.
  - **항목 수 상한 (Output Constraint 4 + Codex F3 status-aware)**: decision row는 **top 3만 expanded**, 나머지는 `<details><summary>+N more</summary>...</details>`로 collapse. **collapse는 status-aware(Codex F3 MEDIUM)** — blocked·latest-unconverged decision은 **절대 collapse 안 함**(개입 필요 행을 숨기지 않음). 정렬은 `blocked → active(in-progress) → recent completed`. collapsed summary는 상태별 카운트 포함(`+N more, B blocked, A active`). audit-timeline `MAX_ROWS`(audit-timeline.js:8) + 4-part OQ/Risks collapse 패턴 mirror.
  - markdown: `decision · plan ✓ → impl ✓ → pr ◐` (top 3 + `_+N more_` 텍스트).
  - 빈 receipt 시 fail-open 안내(`_(게이트 활동 없음)_`).
  - `escapeHtml`/`escapeAttr`로 모든 동적 값 escape(self-injection 방어 — M3 escapeHtml 패턴).
- **Mirror**: `status-grid.js` 시그니처 + `audit-timeline.js` rowKey/빈 입력.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/pipeline.test.js`

### Task 2: html.js 조립 + CSS + enhancement 레이어
- **Action**:
  - `<section id="pipeline"><h2>게이트 파이프라인</h2>...` 를 verdict 다음, workers 앞에 push.
  - LAYOUT에 `.pipeline`/`.pipe-row`/`.pipe-node`/`.pipe-edge` 스타일 추가 — 노드는 작은 원형(`.pipe-node` border-radius, H3 carve-out 대상). **연결선(`.pipe-edge`)은 inline SVG `<line>` 또는 `::before` 수평 connector로 구현 — `border-left`/`border-right` 사용 금지**(impeccable side-stripe ban + H4 carve-out 최소화, critique F2 MEDIUM 해소). `.pipe-row`는 **카드 chrome 금지**(border-radius/box-shadow box 없음, critique F3 해소) — flex 행 레이아웃만. 색은 기존 `--accent`(converged)/`--status-blocked`(✗)/`--status-stale`/`--muted`(대기) 토큰 재사용(신규 강조색 0 — Output Constraint 2).
  - jQuery(+경량 UI) CDN `<script src>` 추가 + `PIPELINE_SCRIPT` inline `<script>`: decision 행 클릭 시 상세 toggle, 노드 hover 툴팁, stepper 애니메이션. `prefers-reduced-motion` 존중. 라이브러리 미로드 시 no-op(베이스라인 유지).
- **Mirror**: `html.js` `<section>` push + `STALE_SCRIPT`/`COPY_SCRIPT` inline script 패턴.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/render-integration.test.js`

### Task 3: index.js wire
- **Action**: `renderPipeline` import, `safeSection('pipeline', () => renderPipeline(m, formatUtils, planBody, opts))`, `sections` 배열·`renderHtml`/`renderMarkdown` 구조분해에 반영(순서: grid, pipeline, fanout, ...).
- **Mirror**: `index.js:115-125`.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/index-outer-fail-open.test.js`

### Task 4: output-constraints.js carve-out + DESIGN.md
- **Action**: `H3_CARVEOUT`에 `pipe-node` 추가(상태 원형 한정). **H4는 연결선을 SVG/`::before`로 구현해 border-left를 안 쓰므로 carve-out 불필요가 목표** — 구현 후 `output-constraints.test.js`로 H4 위반 0 확인. 만약 `::before` connector가 불가피하게 H4에 걸리면 그때만 `pipe-edge` carve-out 추가(컴포넌트 한정). DESIGN.md에 carve-out 근거 + 파이프라인 design intent + 외부 JS progressive enhancement 정책 절 추가.
- **Mirror**: `output-constraints.js:12-19`.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js`

### Task 5: markdown.js 분기
- **Action**: 파이프라인 섹션 markdown 텍스트 표현 추가(`plan ✓ → impl ✓ → pr ◐`).
- **Mirror**: `markdown.js` 기존 섹션 조립.
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/sections.test.js`

### Task 6: plugin.json + CHANGELOG
- **Action**: version `1.12.0`→`1.13.0` (1.12.0은 origin/main #52가 선점). CHANGELOG [1.13.0] 행(게이트 파이프라인 chart + jQuery/UI vendored-inline enhancement + H3 carve-out).
- **Mirror**: 기존 CHANGELOG 행 포맷.
- **Validate**: `node -e "process.exit(require('./plugins/mccp/.claude-plugin/plugin.json').version==='1.13.0'?0:1)"`

## Validation
```bash
# 전체 renderer 테스트 스위트 (회귀 가드)
node --test plugins/mccp/scripts/lib/renderer/tests/
# 신규 섹션 + carve-out
node --test plugins/mccp/scripts/lib/renderer/tests/pipeline.test.js
node --test plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js
# 실제 렌더 산출물
node plugins/mccp/scripts/derive/cli.js render
# 코어 베이스라인은 외부 참조 없이 동작 (라이브러리는 enhancement) — pipeline 노드가 SVG/CSS로 존재
grep -q 'class="pipeline"' .claude/cache/status.html && echo "pipeline section OK"
# 버전
node -e "process.exit(require('./plugins/mccp/.claude-plugin/plugin.json').version==='1.13.0'?0:1)"
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| carve-out 과확장으로 일반 chrome 위반 누락 | 중 | carve-out을 `pipe-node`/`pipe-edge` 클래스로 한정 + output-constraints.test.js에 "일반 chrome H3/H4 위반 여전히 검출" assert |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| CDN 라이브러리 미로드 시 인터랙션 깨짐 | 중 | progressive enhancement — 베이스라인 SVG/CSS가 JS 없이 상태 표시. enhancement는 best-effort |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 가로 파이프라인이 좁은 viewport에서 깨짐 | 중 | flex-wrap + 노드 최소폭 + 모바일 세로 fallback, render-integration 테스트 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 라이브러리 CSS가 GitHub Actions 절제 미학 오염 | 중 | 프로젝트 토큰으로 override + 신규 강조색 0(기존 토큰 재사용) |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->
| 신규 섹션이 기존 렌더 회귀 | 중 | safeSection fail-open + 전체 renderer 스위트 회귀 통과 필수 |<!--mccp:resolved reason="milestone ship 완료 — 프로젝트는 v1.18.4 진행 중이고 본 plan 의 cycle 은 이미 merged(git log/CHANGELOG). 위험 완화책 구현·질문 해소가 게이트 수렴 시점에 반영됨" at="2026-06-24T16:32:41.256Z"-->

## Acceptance
- [ ] 모든 Task 완료
- [ ] 전체 renderer 테스트 스위트 통과 (신규 + 회귀)
- [ ] 패턴 재사용 (section 시그니처/safeSection/OKLCH 토큰/carve-out) — 재발명 없음
- [ ] 베이스라인이 JS 없이 동작 (progressive enhancement)
- [ ] design-lint carve-out이 컴포넌트 한정 — 일반 chrome 위반 여전히 검출
- [ ] markdown/HTML 정보 동치 (D4)

## Design Critique

- SKILL first-step: `plugins/mccp/skills/frontend-design-direction/SKILL.md` Output Constraints Read 완료.
- impeccable: NO_PRODUCT_MD(init 요구)로 full-skill 미실행 → §3.9 fallback으로 4 Output Constraints + impeccable general rules 직접 critique.
- 라운드: 2회 (R0 ESCALATE → R1 CONVERGED). verdict=**converged**.
- R0 findings → 해소:
  | Finding | Severity | 해소 |
  |---|---|---|
  | decision row 항목 수 상한 미정 | HIGH | Task 1 — top 3 expanded + `<details>+N more` collapse (audit-timeline MAX_ROWS mirror) |
  | pipe-edge 사이드-stripe 위험 | MEDIUM | Task 2 — 연결선 inline SVG/`::before`, border-left 금지 (impeccable side-stripe ban + H4 동시 회피) |
  | pipe-row 카드화 | LOW | Task 2 — pipe-row 카드 chrome 금지, border-radius는 pipe-node만 |
  | decision 상세 heading depth | LOW | Task 1 — `<details>` 상세에 h4+ 금지 (정보 위계 3단계) |

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review (신규 파이프라인 derive + canonical 정규화 + vendored-inline F2 보안 + H3 carve-out + status-aware collapse 모두 plan-codex R1에서 absorb). No new implement-time architectural decision (라이브러리 vendoring 방식·SVG geometry는 구현 detail). Cross-gate dedupe applied. 구현 산출물의 design 품질은 renderer output-constraints lint(H1-H16) + 테스트로 mechanical 강제.

## Codex Adversarial Review

- 호출: `node C:/Users/skypark207/.claude/plugins/cache/mccp/mccp/1.11.0/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available`)
- 라운드 수: 1 (R1 absorption, MCCP_GATE_ROUND_CAP=1)
- 합치 결론: Codex verdict=`needs-attention` (2 HIGH + 1 MEDIUM) → 3건 모두 R1 absorb → plan 수정 완료
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 파이프라인 derive가 receipt 모델 불일치 (`gate_id` vs `gate`, canonical `mccp-*` ID, 다중 receipt 최신 선택) | HIGH | ACCEPT_NOW | 실제 결함 — derive `sources/receipts.js`는 `gate` emit. literal 구현 시 stage missing 오표시 + stale가 converged 가림. D2/Task 1 정규화로 absorb |
  | F2 CDN third-party JS가 trust boundary 침범 (raw 미마스킹 데이터 exfiltration, SRI/CSP 부재) | HIGH | ACCEPT_NOW | 보안 — status.html은 raw receipt 데이터 렌더 가능. CDN→**vendored-inline** 전환으로 absorb. render-integration에 외부 script URL 0 assert |
  | F3 top-3 collapse가 blocked 행 숨김 | MEDIUM | ACCEPT_NOW | status-aware collapse — blocked/unconverged 절대 collapse 안 함, `blocked→active→recent` 정렬, 상태별 카운트. Task 1 absorb |
- Deferred to backlog: 0
- Open Questions: 없음 (3건 모두 R1 absorb, DIVERGENT_UNRESOLVED 없음)
- Codex thread 참조: `019eee0b-8bf5-7473-ba34-d3fd8b10c94e`
