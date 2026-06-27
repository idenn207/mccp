# Plan: Dashboard Interactivity — M1 드로어 요약→상세화

**Source PRD**: `.claude/prds/dashboard-interactivity.prd.md`
**Selected Milestone**: M1 — 드로어 요약→상세화 (위험·질문·receipt·마일스톤 클릭 시 요약이 아닌 완화방법·맥락 전문을 truncation 없이 markdown 전문으로)
**Complexity**: Medium

## Summary

우측 상세 드로어가 현재 prose를 **inline-only**(`renderProseHtml`)로 렌더하고, `extractPlanSummary`는 plan `## Summary`의 **첫 단락만** 뽑아 한 줄로 join한다 — 둘 다 PRD가 지적한 "요약 절단"의 실제 원인이다. M1은 (1) 드로어 `sections` prose를 escape-then-render SSoT를 보존한 채 block-level markdown(문단·목록·code-fence·blockquote·표)으로 확장하고, (2) `extractPlanSummary`를 구조 보존 전문 추출로 바꾸고, (3) resolved 위험의 해결 사유(`resolvedMeta.reason`/`at`)를 드로어에 노출하며, (4) `renderDetailMd`를 멀티라인 block-safe로 만들어 STATUS.md plain-text 동등본을 유지한다. 전부 read-only 렌더 변경 — 신규 저장소·서버 mutation·마커 cap 확장 없음.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `format-utils.js:169,177` | `renderProseHtml`/`renderProseMd` = prose 렌더 SSoT 진입점. 신규 block 렌더러는 `renderProseBlockHtml`/`renderProseBlockMd`로 동일 네이밍·동일 escape-then-render 경계 미러 |
| Injection boundary | `drawer-detail.js:5-11`, `format-utils.js:169-172` | 모든 prose는 `escapeHtml` 후 마커 렌더 → 단일 innerHTML sink. block 렌더도 **동일 `esc` 통과**, raw derive 값 innerHTML 직행 0 |
| Errors | `drawer-detail.js:73-85` (addDetail), `milestone-history.js:191` | fail-open per-항목 — block 렌더러는 throw 금지, 실패 시 escape된 평문으로 degrade |
| Tests | `tests/markdown-equivalence.test.js`, `tests/escaping.test.js`, `tests/drawer.test.js` | `node --test` 렌더러 스위트. 신규 block 케이스는 이 세 파일 계약 확장 |
| Design-lint | `output-constraints.js` H10/H15/H16/H18, H3/H4 carve-out | block HTML이 em-dash(H10)·h4+(H15)·raw 마커(H16)·드로어 등식(H18)을 깨지 않도록 가드 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/format-utils.js` | UPDATE | `renderProseBlockHtml(text, formatUtils)` + `renderProseBlockMd(text)` 추가 — block-level(문단/`<ul>`·`<ol>`/`<pre><code>`/`<blockquote>`/`<table>`), 인라인은 기존 `renderInline` 재사용, heading은 h4+ 미방출(H15)·`<strong>`로 강등. 기존 inline 함수는 title/rows용으로 불변 유지 |
| `plugins/mccp/scripts/lib/renderer/parsers/drawer-detail.js` | UPDATE | 4종 빌더의 `sections` proseHtml을 `renderProseBlockHtml`로 전환(title/rows는 inline 유지). `buildRiskDetail`에 해결 사유 row 추가(resolved일 때만). `renderDetailMd`를 멀티라인 block-safe(연속 라인 들여쓰기·`-`/fence/`|` 구조 보존)로 확장 |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATE | `extractPlanSummary` 첫-단락-only + 줄-join 제거 → `## Summary` 전 섹션을 다음 `##`까지 구조 보존 추출(개행 유지). truncation 0 |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | `buildRiskDetail` 호출에 `resolvedReason`/`resolvedAt`(= `r.resolvedMeta.reason`/`.at`) forward. resolved/historical 버킷 항목에서만 채워짐 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | DRAWER_SCRIPT section 컨테이너 `<p>`→`<div class="d-prose">`(block 요소를 `<p>`에 중첩 시 브라우저 auto-close 방지). `.d-prose` block CSS(목록/pre/table/blockquote/문단 간격) — H3/H4 carve-out 위해 `.drawer` prefix 하위로 스코프. footer version bump |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATE | footer derived 줄 version bump(html.js와 동기) |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.18.17 → 1.18.18` (PRD 내 단일 milestone = patch, §3.7) |
| `plugins/mccp/scripts/lib/renderer/tests/escaping.test.js` | UPDATE | block-level 페이로드(목록 안 `<script>`, fence 안 onerror, 표 셀 backtick) self-injection 가드 |
| `plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js` | UPDATE | 멀티라인 proseText의 block-safe md(구조 보존·정보 동등) 회귀 가드 + 해결 사유 동등 |
| `plugins/mccp/scripts/lib/renderer/tests/drawer.test.js` | UPDATE | block 빌더(`sections[0][1]`에 `<ul>`/`<pre>` 등) + `.d-prose` 컨테이너 + 해결 사유 row 단언 |
| `plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js` | UPDATE | footer version 단언 `v1.18.17 → v1.18.18` |
| `plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js` | UPDATE | Task 1 validate 대상 — `renderProseBlockHtml`/`renderProseBlockMd` block 단위 테스트(목록/표/fence esc-only/heading 강등/malformed degrade/MAX_BLOCKS/fail-open) |
| `plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` | UPDATE | Task 2/7 validate 대상 — `extractPlanSummary` 전문 추출 + render budget overflow 픽스처 |

## Tasks

### Task 1: block-level prose 렌더러 (`format-utils.js`)
- **Action**: `renderProseBlockHtml(text, formatUtils)` 추가. 알고리즘: `normalizeProse` → 줄 단위 블록 분류(빈 줄 = 문단 경계). 지원 블록: 문단(`<p>`), 비순서/순서 목록(`- `/`* `/`N. ` → `<ul>`/`<ol><li>`), fenced code(```` ``` ```` → `<pre><code>`, 본문 `esc`만·인라인 렌더 안 함), blockquote(`> ` → `<blockquote>`), GFM 표(`| … |` + 구분행 → `<table>`). 각 블록의 텍스트는 **기존 `renderInline(…, esc)` 재사용**으로 인라인 마커 렌더(H16 안전). markdown heading(`#`~`######`)은 `<h4>`+ 미방출 — `<strong>`(또는 `<p class="d-h">`)로 강등(H15). `renderProseBlockMd(text)`는 `normalizeProse`만(md는 자체 마커 정당, H10만 적용). 모든 경로 fail-open(throw 시 `escapeHtml`된 평문 반환).
- **Critique F1 (MEDIUM, Constraint 3) 흡수**: block 렌더의 **모든 경로가 반드시 `renderInline`으로 종결**. malformed 구조(구분행 없는 `| a | b`, 미종결 ```` ``` ````, 미인식 블록)는 raw passthrough가 아니라 **inline-렌더된 `<p>`로 degrade** — raw `|`/backtick/`**` 마커가 H16 surface로 새지 않는다. 표 판정은 헤더행+구분행(`|---|`) 둘 다 present일 때만 `<table>`, 아니면 각 줄을 inline `<p>`로.
- **Mirror**: `format-utils.js:137-172` `renderInline`/`renderProseHtml` escape-then-render SSoT
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js`

### Task 2: `extractPlanSummary` 전문 추출 + render budget (`plan-body.js`)
- **Action**: 첫-단락-break(`if (!t) { if (para.length) break }`)와 `para.join(' ')` 제거. `## Summary` 본문을 다음 `##` heading(또는 EOF)까지 **개행 보존**으로 수집 후 trim. 부재 시 `null` 유지(degrade 불변).
- **Codex F1 (HIGH, ACCEPT_NOW) 흡수 — render budget**: "truncation 0"을 **bounded budget**으로 교체. `extractPlanSummary`는 첫 단락보다 훨씬 크되 유한한 ceiling(예: `SUMMARY_BUDGET` ≈ 2000자 / ~40줄 / 표 ~12행)을 초과하면 budget 경계에서 자르고 overflow 신호 반환(`{ text, truncated:true }` 또는 trailing `… (전문은 source plan)`). 이유: milestone-history가 **모든 완료 마일스톤** summary를 읽어 단일 inline drawer-data JSON + STATUS.md로 집계 직렬화하므로, 한 plan의 거대 summary(붙여넣은 로그/표/fence)가 status.html·STATUS.md 전체를 부풀리는 경로를 닫는다. 정상 summary는 변화 없이 전문 표시(budget이 충분히 큼), 병리적 케이스만 cap. 드로어에 overflow 시 source plan 경로 affordance 노출(row).
- **Defense-in-depth**: `renderProseBlockHtml`(Task 1)에 블록 수 상한(예: `MAX_BLOCKS`)을 둬 어떤 단일 section도 unbounded DOM 노드를 방출하지 않게 한다(budget 회피 경로 차단).
- **Mirror**: `plan-body.js:349-362` 기존 `findSection` 사용 패턴 + `resolution-marker.js:22` `REASON_CAP` 길이-cap 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js`

### Task 3: 드로어 빌더 block 전환 + 해결 사유 (`drawer-detail.js`)
- **Action**: `buildRiskDetail`/`buildReceiptDetail`/`buildMilestoneDetail`/`buildWorktreeDetail`/`buildOQDetail`의 `sections[i][1]`을 `renderProseHtml`→`renderProseBlockHtml`로 전환(title·rows는 inline 그대로). `buildRiskDetail`에 `r.resolvedReason`(또는 opts)·`r.resolvedAt` 있으면 `['해결 사유', …]`/`['해결 시각', …]` row append(resolved일 때만, OPTIONAL degrade). 빌더 시그니처는 호환 유지.
- **Mirror**: `drawer-detail.js:122-193` 기존 4종 빌더 + `[h3, proseHtml, proseText]` triple 규약
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/drawer.test.js`

### Task 4: `renderDetailMd` block-safe 멀티라인 (`drawer-detail.js`)
- **Action**: proseText가 멀티라인이면 `  - {h3}: {oneliner}` 대신 `  - {h3}:` + 다음 줄부터 deeper-indent(`    `)로 block 본문(목록·fence·표 구조 보존) 방출. 단일 라인은 기존 `  - {h3}: {proseMd}` 유지(기존 테스트 불변). proseHtml(index 1) strip 정규식 0 불변(proseText만 소비, Codex F1). omit/omitSections/indent opts 보존.
- **Mirror**: `drawer-detail.js:262-299` 기존 renderDetailMd nested-bullet 규약
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js`

### Task 5: 드로어 컨테이너 + block CSS (`html.js`)
- **Action**: DRAWER_SCRIPT(`html.js:765`) sections 렌더의 `var p=el('p')`를 `el('div','d-prose')`로 변경(block 요소를 `<p>`에 넣을 때 발생하는 auto-close 차단). `.d-prose ul/ol/li/pre/code/blockquote/table/p` 간격·타이포 CSS 추가 — `border-radius`/`border-left` 사용 시 H3/H4 발화 회피 위해 **`.drawer` prefix 하위로 스코프**(carve-out 토큰 `drawer` 매치) 또는 무-radius. `prefers-reduced-motion`/반응형 불변.
- **Critique F2 (MEDIUM, Constraint 2) 흡수**: `.d-prose blockquote`/`pre`/`code`/`table` CSS는 **기존 near-monochrome 토큰만 재사용**(`--border`/`--ink-2`/`--muted` + 기존 code-chip bg). 신규 accent 색·tint 토큰 0 — viewport당 강조색 ≤1(severity pill 한정) 불변.
- **Critique F3 (LOW, Constraint 4) 흡수**: `extractPlanSummary` 절단 제거로 멀티문단 `## Summary`가 길어져도 `.drawer-body`가 scroll-contain(기존 overflow) 유지 — block 렌더가 dialog 레이아웃을 깨지 않음을 design-invariants/responsive-layout 테스트로 확인.
- **Mirror**: `html.js:702-705` 기존 `.d-sec` CSS + `output-constraints.js:43` H3_CARVEOUT `drawer` prefix
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/drawer.test.js plugins/mccp/scripts/lib/renderer/tests/design-invariants.test.js plugins/mccp/scripts/lib/renderer/tests/responsive-layout.test.js`

### Task 6: resolved 위험 reason forward (`risks.js`)
- **Action**: `renderItem`에서 `buildRiskDetail` 호출 객체에 `resolvedReason: r.resolvedMeta && r.resolvedMeta.reason`, `resolvedAt: r.resolvedMeta && r.resolvedMeta.at` 병합. resolved/historical 버킷 항목에서만 비어있지 않음.
- **Mirror**: `risks.js:104-111` 기존 `Object.assign` forward 패턴
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js`

### Task 7: 회귀 가드 + injection + render-budget 테스트 확장
- **Action**: escaping.test.js에 block 페이로드(목록/fence/표 셀 내 `<script>`/onerror/backtick) — 렌더 HTML에 raw 누출 0 단언. markdown-equivalence.test.js에 멀티라인 proseText block-safe md(구조·정보 동등) + 해결 사유 동등. drawer.test.js에 block `sections[0][1]` 마크업 + `.d-prose` 컨테이너 + 해결 사유 row.
- **Codex F1 흡수 — large-summary 회귀 픽스처**: plan-body-parser.test.js에 거대 `## Summary`(멀티문단 + 표 + fence, budget 초과) 픽스처 추가 → `extractPlanSummary` 결과가 `SUMMARY_BUDGET` 이하 + `truncated` 신호 단언. render-integration류에 동 픽스처로 status.html/STATUS.md 산출 크기가 budget 비례 상한 내인지 가드(unbounded balloon 회귀 차단).
- **Mirror**: `tests/escaping.test.js:47-67` 기존 mitigation backtick 가드
- **Validate**: 아래 Validation 전체 스위트

### Task 8: version bump + footer 동기
- **Action**: `plugin.json` `1.18.17 → 1.18.18`. `html.js:1315` + `markdown.js:127` footer version 동기. `i18n-surface.test.js:123` 단언 갱신. CHANGELOG row(있으면).
- **Mirror**: §3.7 milestone PR 의무 체크리스트
- **Validate**: `node --test plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js`

## Validation

```bash
# 렌더러 전 스위트 (회귀 0 게이트)
node --test plugins/mccp/scripts/lib/renderer/tests/

# 핵심 계약 집중
node --test \
  plugins/mccp/scripts/lib/renderer/tests/format-utils.test.js \
  plugins/mccp/scripts/lib/renderer/tests/drawer.test.js \
  plugins/mccp/scripts/lib/renderer/tests/markdown-equivalence.test.js \
  plugins/mccp/scripts/lib/renderer/tests/escaping.test.js \
  plugins/mccp/scripts/lib/renderer/tests/output-constraints.test.js \
  plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js \
  plugins/mccp/scripts/lib/renderer/tests/i18n-surface.test.js

# 산출물 육안 확인 (design-lint violations 0 포함)
node plugins/mccp/scripts/derive/cli.js render
```

## Design Critique

본 plan은 디자인 surface(우측 드로어 prose 렌더)를 건드린다. §3.9 Output Constraints 4축 준수:

1. **정보 위계 3단계** — 드로어는 title(primary) → tags/rows(status) → sections block prose(detail) 유지. block heading은 h4+ 미방출(H15)·`<strong>` 강등으로 위계 평탄 유지.
2. **강조색 viewport당 ≤1** — block CSS는 near-monochrome 토큰만(severity tone은 기존 `.sev` pill 한정). 신규 강조색 토큰 0.
3. **raw markdown 마커 금지** — 모든 block 본문은 `renderInline`을 통과해 마커→실태그 변환(H16 안전). code-fence는 `<pre><code>`(H16 strip 대상).
4. **한 화면 항목 수 상한** — 드로어는 단일 항목 상세라 list-of-N cap 무관. block 목록은 소스 충실(truncation 제거가 본 milestone 목표).

impeccable 워크플로(§3.10): plan stage는 렌더 UI 없음 → routing GUIDE recommend-only. 실제 layout/audit/clarify는 prp-implement에서(항목 14 = M3 워크플로, 본 M1은 critique loop만).

**Critique 결과** (§3.9 retry loop): round 1, verdict **CONVERGED**. R0에서 3 finding(F1 MEDIUM/Constraint 3, F2 MEDIUM/Constraint 2, F3 LOW/Constraint 4) — HIGH/CRITICAL/UNKNOWN 0 → oracle CONVERGED. 3 finding 모두 Task 1/Task 5에 흡수(escalate 불요). PRODUCT.md 정합: Calm/Decisive/Compact + "Quiet by default, loud on demand"(드로어 = loud-on-demand 상세 surface라 전문 렌더 정당) + 절제 팔레트 보존.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| block-level markdown 렌더가 innerHTML 주입 경계 약화(XSS-유사) | 중 | 기존 escape-then-render SSoT 보존 — block 본문도 동일 `esc` 통과 후 마커 렌더. escaping.test.js block 페이로드 테스트로 가드 |
| block CSS가 H3(border-radius)/H4(border-left) design-lint 발화 | 중 | `.drawer` prefix 하위 스코프(H3_CARVEOUT `drawer` 매치) 또는 무-radius. design-invariants.test.js drift fixture로 가드 |
| `<p>`→`<div>` 컨테이너 변경이 기존 drawer 마크업 테스트 회귀 | 중 | drawer.test.js 컨테이너 단언 동기 갱신. H18 등식(trigger==key)은 컨테이너 무관 — 불변 |
| **(Codex F1, HIGH)** `extractPlanSummary` 절단 제거가 전 마일스톤 집계 직렬화로 status.html/STATUS.md unbounded balloon | 중 | **render budget**(Task 2): 첫 단락보다 크되 유한한 `SUMMARY_BUDGET` ceiling + overflow→source plan affordance. `renderProseBlockHtml` `MAX_BLOCKS` 상한(defense-in-depth). large-summary 회귀 픽스처로 산출 크기 가드 |
| 멀티라인 proseText의 md 들여쓰기 오류로 plain-text 구조 파손 | 중 | renderDetailMd 단일/멀티 분기 + 단일 라인 기존 테스트 불변 + 멀티라인 신규 픽스처로 양방 가드 |

## Acceptance

- [ ] 드로어 `sections`가 목록·강조·code·표를 block-level로 렌더(요약 절단 부재) — `renderProseBlockHtml` 경유
- [ ] `extractPlanSummary`가 `## Summary` 전문(다음 `##`까지) 구조 보존 추출, 단 `SUMMARY_BUDGET` ceiling + overflow affordance로 bounded (전 마일스톤 집계 직렬화 unbounded balloon 차단)
- [ ] resolved 위험 드로어에 해결 사유/시각 row 노출
- [ ] STATUS.md가 드로어 block 상세를 plain-text 구조 보존으로 동등 노출(markdown-equivalence green)
- [ ] design-lint violations 0(H10/H15/H16/H18 통과) + 주입 페이로드 raw 누출 0
- [ ] 렌더러 전 스위트 `node --test` green
- [ ] plugin.json + footer 2곳 version 1.18.18 동기
- [ ] Patterns mirrored, not reinvented(block 렌더는 기존 `renderInline` 재사용)

## Codex Adversarial Review

- 호출: `node plugins/mccp/scripts/lib/codex-invoke.js adversarial-review` (fail-closed Bash wrapper, v0.2.2, `--impeccable-available` design-scope 적용)
- 라운드 수: 1 (R1, `MCCP_GATE_ROUND_CAP` default=1)
- 합치 결론: Codex verdict=`needs-attention` — 단일 HIGH finding(전 마일스톤 summary 집계 직렬화 시 unbounded balloon). R1에서 render budget 설계로 흡수 → 미해소 ACCEPT_NOW HIGH 0이므로 R2 미escalate.
- YAGNI Triage:
  | Finding | Severity | Verdict | Why |
  |---|---|---|---|
  | F1 `extractPlanSummary` 절단 제거가 status.html/STATUS.md unbounded balloon | HIGH | ACCEPT_NOW | 정당 — 전 완료 마일스톤 summary가 단일 drawer-data JSON + STATUS.md로 집계 직렬화. "truncation 0"을 `SUMMARY_BUDGET` ceiling + overflow affordance + `MAX_BLOCKS`로 교체(Task 2/7). plan body·테스트 픽스처에 흡수 완료. |
- Deferred to backlog: 0 → (없음)
- Open Questions: `SUMMARY_BUDGET` 구체 ceiling 값(2000자/40줄/12행은 출발점, implement 시 실측 조정) — severity LOW, blocking 아님
- Codex session 참조: threadId `019f0461-2082-71b3-9e3c-fbfecda7cc71`

## Design Critique (impeccable, §3.9 retry loop)

- routing mode: auto (effective at implement stage)
- round 1, verdict CONVERGED — R0 findings: F1 MEDIUM(Constraint 3 block-path renderInline 종결) · F2 MEDIUM(Constraint 2 near-monochrome 토큰 재사용) · F3 LOW(Constraint 4 drawer-body scroll 컨테인). HIGH/CRITICAL/UNKNOWN 0 → CONVERGED, 3건 모두 Task 1/5 흡수.

## Codex Implementation Review

decision-set already converged in mccp-plan-codex review. No new implement-time decisions detected. Cross-gate dedupe applied.

## Implementation Deviations

- **테스트 파일 2개 추가(Files to Change 테이블 보정)**: 원 plan 테이블은 11개 파일을 명시했으나 Task 1(validate=`format-utils.test.js`)·Task 2(validate=`plan-body-parser.test.js`)·Task 7(거대 Summary 픽스처는 `plan-body-parser.test.js`)가 참조하는 두 테스트 파일이 누락돼 있었다. 구현 중 두 파일을 추가하고 Files to Change 테이블을 보정함 — plan Task 와 정합하는 minor deviation(아키텍처 변경 0).
- **plan-conflict-detector backtick false-positive (도구 버그, escalate 안 함)**: `parseFilesToChange` 가 Files to Change 셀의 backtick-wrapped 경로(`` `plugins/.../format-utils.js` ``)에서 backtick 을 벗기지 않아, plan 에 명시된 파일조차 diff 경로와 매칭 실패 → 전부 unplanned 로 카운트해 `file-expansion` 을 오발화한다. 실제 소스 diff 13개 중 11개는 plan 과 정확히 일치, 2개는 위 테스트 파일이므로 **진짜 plan↔implementation gap 아님**. detector 자체 수정은 별도 axis(mechanical 1-line strip).
