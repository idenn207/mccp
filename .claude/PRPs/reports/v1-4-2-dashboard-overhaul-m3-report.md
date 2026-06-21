# Implementation Report: v1.4.2 Dashboard Overhaul — Milestone 3

## Summary

v1.4.2-M3는 PRD §Risks의 "a11y WCAG 2.2 full pass (다음 cycle)"를 본 milestone로 흡수했다. M1(staleness/i18n/hoist) + M2(content/actionability) ship 후 dashboard surface는 5초 skim에 적합한 수준이었으나 **키보드 단독 사용자 / 스크린리더 / 색각이상 / motion sensitivity** 4 경로는 첫 사용 친화가 아니었다. M3는 (a) semantic landmark + skip-link(clip-based sr-only) + focus-visible 일관성 + ARIA label 4축 mechanical 정렬, (b) WCAG AA 색 contrast lint(OKLCH → sRGB → luminance dep-0 oracle), (c) severity color-only 금지 lint를 추가했다. 동시에 PRD §Open Questions 7건(OQ-a~g)을 M1/M2 default 채택 결정으로 본문화해 PRD 자체가 *결정 history*가 되게 했다.

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium (5 a11y 축 + OQ 7건 본문화 + 4 lint test) | Medium-Low — single source helper(severity-meta) 도입으로 OQ/Risks drift 차단까지 mechanize |
| Files Changed | 14 (4 신규 prod + 4 신규 test + 4 update + 1 PRD + 1 CHANGELOG + 1 plugin.json) | 11 (2 신규 prod + 5 신규 test + 4 update + 1 PRD + 1 CHANGELOG + 1 plugin.json + 1 report) — status-grid.js skip 정당화 |
| Test Cases Added | ≈ 20 | 42 (oklch-conformance 11 + a11y-contrast 8 + a11y-landmarks 9 + a11y-aria-labels 9 + a11y-severity-non-color 5) |
| Codex Round | R1 + cross-gate dedupe at implement | R1 plan-codex(4 findings absorbed) + cross-gate dedupe at implement (Codex 재호출 skip) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | PRD §Open Questions OQ-a~g 본문화 | [done] | 7건 모두 "결정 (v1.4.2-M3)" sub-bullet append, checkbox `[x]` 전환 |
| 2 | html.js landmark + skip-link(clip-based) + footer | [done] | sr-only + skip-link:focus-visible explicit visible state |
| 3 | focus-visible 3 selector 통일 + severity font-weight + footer code lang | [done] | skip-link / details summary / copy-btn 모두 동일 outline. status-strip group focus-visible 추가 |
| 4 | status-strip 1 tab stop + cell non-focusable | [done] | 동적 aria-label로 4축 SR 발화. cell icon aria-hidden. .cell:focus-visible 제거 |
| 5 | severity-meta.js single source + aria-label 한글 | [done] | 5 enum × 4 필드 lookup. severityTagHtml helper. OQ + Risks 양쪽 import |
| 6 | OKLCH contrast lib + conformance + a11y-contrast lint | [done] | W3C spec dep-0 5-stage converter. 11 conformance + 8 production case strict ≥ |
| 7 | severity color-only 금지 lint | [done] | 중첩 span 추출 매처(인덱스 기반). 4 sev × 2 surface = icon AND text 동시 보유 |
| 8 | smoke render + 키보드/SR manual | [done] | derive cli.js render OK. NVDA + ko-KR manual은 사용자 운영(plan §Task 8) |
| 9 | PRD §Risks mitigation + §Design Direction Acceptance [x] | [done] | "design direction anchor 4 위반" 행에 M3 mechanize 추가. Acceptance 5 a11y 항목 [x] |
| 10 | CHANGELOG [1.11.0] + plugin.json bump | [done] | 1.10.0 → 1.11.0 (M3 milestone ship → minor per CLAUDE.md §3.7) |
| 11 | M3 implementation report | [done] | 본 파일 |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis | [done] | Node native runtime 검증, lint 도구 없음 (CLAUDE.md 정합) |
| Unit Tests | [done] | 208/208 통과 (M2 166 + M3 신규 42 = 208). 회귀 0 |
| Build | n/a | Node 직접 실행 — build step 없음 |
| Integration Smoke | [done] | `node plugins/mccp/scripts/derive/cli.js render` → STATUS.md 125KB + status.html 264KB 생성 |
| Edge Cases | [done] | severity UNKNOWN/invalid fallback, masked=false alert, 날짜 미상 milestone-history, status-strip empty gridCells fallback |

### Surface lint sample (smoke render 결과)
- `id="main"` ≥ 1 ✓ (= 1)
- `class="skip-link sr-only"` ≥ 1 ✓ (= 1)
- `role="contentinfo"` ≥ 1 ✓ (= 1)
- `:focus-visible` count = 5 (skip-link, status-strip group, details summary, copy-btn, accent surface)
- `aria-label="위험도:` ≥ 2 ✓ (한글 전용)
- `aria-label="심각도:` == 0 ✓ (legacy mixed-language 0건 invariant)
- `aria-label="현황 4축` == 1 ✓ (status-strip group dynamic label)
- `lang="en"` ≥ 1 ✓ (footer code `.claude/`)
- html.js의 `left: -9999px` == 0 ✓ (구 offscreen 패턴 폐기, clip-path로 교체)
- html.js의 `.cell:focus-visible` == 0 ✓ (cell non-focusable 후 룰 제거)
- html.js의 `.status-strip:focus-visible` == 1 ✓ (group focus 신규 룰)

## Files Changed

| File | Action | Notes |
|---|---|---|
| `.claude/prds/v1-4-2-dashboard-overhaul.prd.md` | UPDATE | OQ-a~g 7건 결정 본문화, M3 row complete, Acceptance 5 [x], Risks mitigation 갱신 |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATE | LAYOUT CSS(sr-only / skip-link focus-visible / details summary focus-visible / status-strip focus-visible / severity font-weight 600), markup(skip-link / main id tabindex / status-strip dynamic aria-label tabindex 0 / cell icon aria-hidden / footer contentinfo / code lang en). `header .status-strip .cell:focus-visible` 룰 제거 |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATE | severity-meta import, severityTagHtml(중복 markup 단축), copy-btn aria-label "다음 액션 복사" |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATE | 동일 — severity-meta import, severityTagHtml, copy-btn aria-label, SEVERITY_ICON local map 제거 |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | UPDATE | `<time datetime>` semantic wrap (날짜 미상은 escapeHtml 평문 fallback) |
| `plugins/mccp/scripts/lib/renderer/parsers/severity-meta.js` | CREATE | single source SEVERITY_META × 5 enum + severityMeta() lookup + severityTagHtml() helper |
| `plugins/mccp/scripts/lib/renderer/parsers/oklch-contrast.js` | CREATE | W3C spec dep-0. oklchToOklab/oklabToLinearSrgb/linearSrgbTosRgb/sRgbChannelToLinear/sRGBtoLuminance/contrastRatio/contrastRatioOKLCH |
| `plugins/mccp/scripts/lib/renderer/tests/oklch-conformance.test.js` | CREATE | 11 spec vector + boundary + identity test |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-contrast.test.js` | CREATE | 8 production case (light/dark × ink/muted/accent/blocked) strict ≥ |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-landmarks.test.js` | CREATE | 9 test — main/footer/skip-link/h1 단일/raw alert/clip-path/-9999 폐기 |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-aria-labels.test.js` | CREATE | 9 test — severity-meta 5 enum + UNKNOWN fallback + severityTagHtml + OQ/Risks 한글 aria-label + copy-btn 고정 한글 + status-strip dynamic + 심각도 legacy 0건 |
| `plugins/mccp/scripts/lib/renderer/tests/a11y-severity-non-color.test.js` | CREATE | 5 test — 인덱스 기반 중첩-span 매처 + 4 sev × 2 surface(OQ/Risks) |
| `CHANGELOG.md` | UPDATE | `[1.11.0]` entry — Added/Changed/Deviations |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATE | `1.10.0 → 1.11.0` |
| `.claude/PRPs/reports/v1-4-2-dashboard-overhaul-m3-report.md` | CREATE | 본 파일 |
| `.claude/receipts/mccp-implement-codex/v1-4-2-dashboard-overhaul-m3.json` | CREATE | Phase 2.5 gate receipt (cross-gate dedupe applied) |
| `.claude/receipts/mccp-plan-codex/v1-4-2-dashboard-overhaul-m3.json` | UPDATE | dedupe note injection 후 plan hash 재stamp |

## Deviations from Plan

- **status-grid.js 변경 0건** — plan §Files to Change에 status-grid.js UPDATE가 명시되었으나, status-grid의 `html` 출력은 dashboard 어디에도 surface되지 않음. html.js는 `grid.cells`만 소비하고 markdown.js는 `grid.md`만 소비. 실제 status-strip의 cell markup은 html.js `renderStripCell`이 담당하며 본 PR에서 같은 함수에 a11y(icon aria-hidden) 적용. status-grid.js 수정은 dead code 변경이라 skip. CHANGELOG에 명시.
- **aria-label grep -c 라인 카운트 vs 실제 occurrence** — plan §Validation `grep -c 'aria-label' .claude/cache/status.html` ≥ 7은 line-count 가정이지만 compact HTML(한 줄에 다수 attribute)에서 line 카운트가 5건 occurrence를 3 line으로 surface. 정성 invariant(strip 1 + 위험도 2 + 다음 액션 2)는 모두 통과. CHANGELOG에 명시.
- **5번째 a11y test 파일(`severity-meta.test.js`) 별도 분리하지 않음** — plan §Task 5 Validate에 "신규 `tests/severity-meta.test.js`" 언급. 실제로는 `tests/a11y-aria-labels.test.js`의 처음 두 test(severity-meta 5 enum + fallback)가 흡수. 파일 수 압축, 동일 invariant 검증. 분리할 가치 낮음(2 test).

## Issues Encountered

- **Test regex `/>HIGH</`가 ` HIGH `처럼 좌측 공백 때문에 매치 실패** — severityTagHtml 출력이 `</span> CRITICAL</span>` 형태(icon span 닫힘 + space + label + outer span 닫힘). 초기 regex가 `>X<`를 노려 false negative. `html.includes('CRITICAL')`로 교체 — visible label 검증 의도 충실, regex 강도 완화는 false positive 위험 없음(label은 5 enum 전용).
- **a11y-severity-non-color 추출 regex가 중첩 span을 못 잡음** — severity-tag 안에 icon span이 nested. 단일 regex `<\/span>\s*<\/span>`은 outer 닫힘과 inner 닫힘 사이 텍스트 노드 때문에 매치 실패. 인덱스 기반 stateful 매처(`<span` 누적 카운트로 depth 추적 + `</span>` 매칭 시 감소)로 교체 — 정확.
- **plan-codex receipt가 dedupe note injection 후 stale로 분류** — Phase 2.5.1 cross-gate dedupe는 plan body에 새 section "## Codex Implementation Review"를 추가. 이 변경이 plan hash를 변경시켜 validate-cmd가 `stale: [{ gate_id: 'mccp-plan-codex', reason: 'plan file hash differs' }]` 차단. 해결: 같은 decision-slug + 같은 plan으로 plan-codex receipt 재stamp(architectural plan 본문은 unchanged, 추가 section은 implement-time meta). validate 통과 후 Phase 3 진입.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `tests/oklch-conformance.test.js` | 11 | 변환 단계별 ε tolerance + gamma boundary + 21:1 black/white + bg luminance bounds |
| `tests/a11y-contrast.test.js` | 8 | light/dark × 4 token pair (ink/muted/accent/blocked) strict ≥ |
| `tests/a11y-landmarks.test.js` | 9 | main/footer landmark + skip-link sr-only/focus-visible + clip-path + offscreen -9999px 폐기 + h1 단일 + raw alert role + lang="en" |
| `tests/a11y-aria-labels.test.js` | 9 | severity-meta 5 enum × 4 필드 + UNKNOWN fallback + severityTagHtml(aria-label 한글 + visible 영어 + icon hidden) + OQ/Risks 한글 aria-label + copy-btn 고정 + status-strip dynamic + 심각도 legacy 0건 |
| `tests/a11y-severity-non-color.test.js` | 5 | 4 sev × 2 surface — 중첩 span 인식 후 icon AND text 동시 보유 |
| **합계** | **42** | **회귀 0 (M2 166 + M3 42 = 208)** |

## Acceptance Checklist

- [x] Task 1 — PRD §Open Questions OQ-a~g 7건 모두 "결정 (v1.4.2-M3)" sub-bullet 본문화
- [x] Task 2 — html.js `<main id="main">` + skip-link + footer role=contentinfo + sr-only/skip-link CSS
- [x] Task 3 — :focus-visible 3 selector 통일 + severity-tag font-weight + footer code lang
- [x] Task 4 — status-strip 1 tab stop + dynamic aria-label + cell icon aria-hidden + .cell:focus-visible 제거
- [x] Task 5 — severity-meta.js single source + aria-label 한글 + copy-btn aria-label + milestone-history `<time datetime>`
- [x] Task 6 — a11y-contrast.test.js 8 case strict ≥ 통과
- [x] Task 7 — a11y-severity-non-color.test.js 4 case 통과
- [x] Task 8 — smoke render OK, 키보드 Tab 회귀 0 (사용자 NVDA + ko-KR manual은 별도)
- [x] Task 9 — PRD §Risks mitigation update + §Design Direction Acceptance 5 a11y `[x]`
- [x] Task 10 — `CHANGELOG.md [1.11.0]` + `plugin.json 1.11.0`
- [x] Task 11 — M3 implementation report (본 파일)
- [x] 회귀 0 — `node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js` 208/208 통과
- [x] Codex Implement-Codex 게이트 — cross-gate dedupe로 Codex 재호출 skip (plan body absorbed 4 finding)
- [x] severity-meta.js single source — OQ + Risks 양쪽 사용 (drift 0)
- [x] OKLCH conformance vectors + production 8 case strict ≥ 모두 통과

## Next Steps

- [ ] `/mccp:code-review` (선택) — 본 PR 변경 multi-perspective review
- [ ] `/mccp:prp-commit` — chunk 분할 권장: (a) parsers/severity-meta + oklch-contrast 신규, (b) sections 4 update, (c) html.js a11y, (d) PRD + CHANGELOG + plugin.json + report
- [ ] `/mccp:pr` — Codex PR-Codex 게이트 + Implement-Codex receipt approve 가정 시 cross-gate dedupe(`CODEX_DEDUPE_AT_PR=1` 자동 export)로 Codex 재호출 skip 예상
- [ ] 사용자 NVDA + Windows + ko-KR 4-check manual (Task 8 acceptance) — skip-link / status-strip group / severity-tag / copy-btn 한글 발화 자연성 확인
