# Implementation Report: v1.4.2 Dashboard Overhaul — Milestone 2

## Summary

PRD §M2 5축을 단일 commit chunk로 정리. (3) jargon expand — static whitelist + `<abbr title>` / parenthetical. (4) cross-section dedupe — token Dice coefficient 매칭 후 Risks에 `> 동일 OQ 참조` cue. (5) milestone history — PRD complete row + `mccp-pr-codex` receipt cross-ref로 새 section. (6) intent extraction — plan/PRD `## Hypothesis`/`## Summary` 1줄 → verdict text suffix + status-grid next cell tooltip. (9) actionability — OQ/Risks 4-part component (severity tag + item text + meta-cue + action prompt code + 복사 button).

## Assessment vs Reality

| Metric | Predicted (Plan) | Actual |
|---|---|---|
| Complexity | Medium-Large (5 axis, 14 task) | Medium-Large — 14 task 완주 |
| Confidence | Codex R1 converged + impeccable critique CONVERGED | 동등 — 회귀 0, smoke render OK |
| Files Changed | 21 file (5 parsers + 4 sections + 4 surface + 5 test create + 2 test update + PRD/CHANGELOG/plugin.json) | 23 file (sections.test.js 4 fixture 4-part 정합 update 추가) |

## Tasks Completed

| # | Task | Status | Notes |
|---|---|---|---|
| 0 | Phase 2.5 Implement-Codex gate | 완료 | cross-gate dedupe applied — plan body에 review section 이미 있어 Codex 재호출 skip |
| 1 | parsers/jargon-dictionary.js | 완료 | 37-entry whitelist + overlap guard 추가 (`/mccp:plan-prd` 안 `/mccp:plan` 이중 expand 방지) |
| 2 | parsers/intent-extractor.js | 완료 | Hypothesis → Problem → Summary 순서 |
| 3 | parsers/action-prompt.js | 완료 | severity routing + 200자 cap |
| 4 | parsers/cross-section-dedupe.js (F3 absorption) | 완료 — deviation | Plan spec Jaccard 0.45 sweet-spot 실패. Dice 0.30 + risk+mit 결합 tokenize로 변경 (아래 Deviations) |
| 5 | parsers/plan-body.js line-aware | 완료 | parseOpenQuestions 시그니처 확장 + parseDeliveryMilestonesComplete export |
| 6 | sections/open-questions.js 4-part | 완료 | F1 absorption: data-copy escapeHtml only |
| 7 | sections/risks.js 4-part + dedupe cue | 완료 | table → list |
| 8 | sections/milestone-history.js | 완료 | F2 absorption: `r.gate_id \|\| r.gate` |
| 9 | html.js wire + COPY_SCRIPT + CSS | 완료 | 11 신규 CSS 룰, accent invariant 유지 |
| 10 | markdown.js milestone-history section | 완료 | ## 이정표 기록 + 4-part sub-list |
| 11 | index.js wire | 완료 | dedupOQAndRisks 호출 + safeSection wrap |
| 12 | verdict.js + status-grid.js intent | 완료 | step 9/10 suffix + next cell tooltip |
| 13 | tests CREATE 5 + UPDATE 2 | 완료 — additional updates | sections.test.js 4 fixture도 4-part 형식 정합화 (plan 명시 외 부수 update) |
| 14 | PRD + CHANGELOG + plugin.json bump | 완료 — split mode | plugin.json `1.9.0 → 1.10.0` (M1이 이미 main에 ship됐고 M2가 후속 별도 PR이므로 split) |

## Validation Results

| Level | Status | Notes |
|---|---|---|
| Static Analysis (node syntax check) | PASS | renderer 전체 require/eval 0 error |
| Unit Tests | PASS | 166/166 (신규 36 + 기존 130) |
| Build | N/A | 본 plugin은 transpile 없음 (Node CommonJS) |
| Integration | PASS | `derive/cli.js render` → STATUS.md + status.html 정상 산출 + `[mccp:snapshot] write 2026-06-21 ok` |
| Edge Cases | PASS | 4-part surface lint grep 모두 통과 (copy-btn 2, severity-tag 2, meta-cue 1, milestone-history 1, abbr 2) |

## Files Changed

| File | Action | Notes |
|---|---|---|
| `plugins/mccp/scripts/lib/renderer/parsers/jargon-dictionary.js` | CREATED | 37 entry + expandJargon/renderJargonHtml/renderJargonMarkdown |
| `plugins/mccp/scripts/lib/renderer/parsers/intent-extractor.js` | CREATED | extractIntent + extractIntentFromPath |
| `plugins/mccp/scripts/lib/renderer/parsers/action-prompt.js` | CREATED | buildActionPrompt + rank/maxRank |
| `plugins/mccp/scripts/lib/renderer/parsers/cross-section-dedupe.js` | CREATED | dedupOQAndRisks + tokenize + dice/jaccard |
| `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` | UPDATED | parseOpenQuestions line-aware + parseDeliveryMilestonesComplete |
| `plugins/mccp/scripts/lib/renderer/sections/open-questions.js` | UPDATED | 4-part component |
| `plugins/mccp/scripts/lib/renderer/sections/risks.js` | UPDATED | 4-part component + dedupe cue |
| `plugins/mccp/scripts/lib/renderer/sections/milestone-history.js` | CREATED | PRD complete row + receipt cross-ref |
| `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` | UPDATED | next cell intent tooltip |
| `plugins/mccp/scripts/lib/renderer/verdict.js` | UPDATED | intent suffix + opts pass-through |
| `plugins/mccp/scripts/lib/renderer/html.js` | UPDATED | milestone-history wire + COPY_SCRIPT + 11 CSS 룰 |
| `plugins/mccp/scripts/lib/renderer/markdown.js` | UPDATED | ## 이정표 기록 |
| `plugins/mccp/scripts/lib/renderer/index.js` | UPDATED | dedupe call + milestone-history safeSection |
| `plugins/mccp/scripts/lib/renderer/tests/jargon-dictionary.test.js` | CREATED | 6 fixture |
| `plugins/mccp/scripts/lib/renderer/tests/intent-extractor.test.js` | CREATED | 5 fixture |
| `plugins/mccp/scripts/lib/renderer/tests/action-prompt.test.js` | CREATED | 8 fixture |
| `plugins/mccp/scripts/lib/renderer/tests/cross-section-dedupe.test.js` | CREATED | 7 fixture (F3 absorption real PRD 2) |
| `plugins/mccp/scripts/lib/renderer/tests/four-part-rendering.test.js` | CREATED | 10 fixture (F1/F2 absorption + 4-part + milestone-history + html wire) |
| `plugins/mccp/scripts/lib/renderer/tests/sections.test.js` | UPDATED | 4 fixture 4-part 형식 정합 |
| `plugins/mccp/scripts/lib/renderer/tests/plan-body-parser.test.js` | UPDATED | parseOpenQuestions metadata 형식 |
| `.claude/prds/v1-4-2-dashboard-overhaul.prd.md` | UPDATED | row 2 in-progress |
| `CHANGELOG.md` | UPDATED | [1.10.0] entry append |
| `plugins/mccp/.claude-plugin/plugin.json` | UPDATED | 1.9.0 → 1.10.0 |
| `.claude/receipts/mccp-implement-codex/v1-4-2-dashboard-overhaul-m2.json` | CREATED | Implement-Codex receipt (cross-gate dedupe applied) |

## Deviations from Plan

### Cross-section dedupe metric — Jaccard 0.45 → Dice 0.30 + risk+mit 결합

**WHAT**: plan body Task 4가 `JACCARD_THRESHOLD = 0.45` + risk-only tokenize를 spec했으나 실제 v1.4.2 PRD OQ-a/Risk-1, OQ-f/Risk-2 데이터로는 매칭 실패. Dice coefficient(`2*inter/(|A|+|B|)`) + threshold 0.30 + risk+mitigation 결합 tokenize로 변경.

**WHY**: Jaccard는 set size 격차에 약함. 짧은 Risk text (7 token) vs 긴 OQ text (13-25 token) 조합에서 분모가 빠르게 커져 score가 0.20 이하로 떨어짐. Dice는 단순 평균으로 짧은 쪽 비중을 살리고, mitigation 합치면 axis 식별 token이 풍부해짐. F3 absorption 의도(real PRD overlap catch)는 그대로 충족. plan spec의 sweet-spot claim이 실증 부족이었음 — 본 변경이 F3 의도를 실데이터에서 검증.

**Backwards-compat**: `JACCARD_THRESHOLD` export 그대로 유지 (`SIMILARITY_THRESHOLD`의 alias).

### sections.test.js 4 fixture 4-part 정합화 (plan 명시 외 부수 update)

**WHAT**: plan Task 13은 integration.test.js + render-integration.test.js 2개 update만 명시. 실제로는 기존 sections.test.js의 `open-questions — merge state + plan, dedupe` / `open-questions — cap at 15 + +N more marker` / `risks — placeholder when none` / `risks — cap at 8 + +N less critical marker` 4 fixture가 옛 markdown 형식 기대 → 4-part component 재작성으로 회귀 발생.

**WHY**: 4-part component이 본질적으로 markdown 출력 형식을 변경하므로 기존 형식 fixture는 회귀. 새 형식(`+N 더보기` / `미해결 위험 없음` / `MAX_EXPANDED=3`) 기대로 조정 — 의도된 deviation.

### plugin.json bump — single PR mode → split PR mode

**WHAT**: plan Task 14는 "M1+M2 single PR 가정 시 plugin.json 무변경"으로 default 정의. 실제는 M1이 main commit ad2c35f로 이미 ship되어 있어 split mode 채택: `1.9.0 → 1.10.0` minor bump.

**WHY**: M1 plan-body가 single PR 가정 — 실 cycle에서 M1이 별도 PR로 먼저 main ship됐기 때문 (현 worktree 진입 시점 STATE.md stale).

## Issues Encountered

- **jargon-dictionary overlap guard 누락 첫 시도** — 짧은 key가 긴 key의 substring일 때 (`/mccp:plan` ⊂ `/mccp:plan-prd`) 이중 expand 발생. spans overlap 체크 추가로 해결.
- **Cross-section dedupe Jaccard 0.45 fixture 실패** — 위 Deviations 참조. Dice + threshold 조정으로 해결.
- **sections.test.js 회귀 4건** — 위 Deviations 참조. 4 fixture 형식 정합화로 해결.

## Tests Written

| Test File | Tests | Coverage |
|---|---|---|
| `jargon-dictionary.test.js` | 6 | expand single occurrence (gate/env/command) + first-occurrence-only + non-whitelist unchanged + HTML escape interplay |
| `intent-extractor.test.js` | 5 | PRD Hypothesis/Problem fallback + plan Summary + 60자 cap + null fallback |
| `action-prompt.test.js` | 8 | severity routing (HIGH/CRITICAL/MEDIUM/LOW/unknown) + risk kind mitigation + quote escape + cap |
| `cross-section-dedupe.test.js` | 7 | tokenize 한영 mix + jaccard disjoint + synthetic match + **F3 absorption fixture A (real PRD OQ-a/Risk-1)** + **F3 absorption fixture B (real PRD OQ-f/Risk-2 + mit)** + marker dot variant + Risks row preserved |
| `four-part-rendering.test.js` | 10 | OQ/Risk 4-part HTML markup + 3 expanded + 더보기 collapse + markdown sub-list + milestone-history (PRD + receipt cross-ref) + **F1 absorption (data-copy raw preserve)** + html.js wire + **F2 absorption (derive-normalized gate field)** + null fallback |

총 신규 36 fixture, 회귀 0 (기존 130 fixture 그대로 + 6 fixture 4-part 정합화 update).

## Acceptance — plan 본문 정합

- [x] Task 1-5 parser/extractor 4 신규 모듈 + plan-body line-aware 확장 + 단위 테스트 통과
- [x] Task 6-7 OQ/Risks 4-part component + dedupe cue surface
- [x] Task 8 milestone-history section + PRD complete row + receipt cross-ref
- [x] Task 9-10 html.js copy button JS + 4-part CSS + milestone-history section / markdown.js equivalent
- [x] Task 11 index.js dedupe call + milestone-history wire-up
- [x] Task 12 verdict.js intent suffix + status-grid intent tooltip
- [x] Task 13 5 신규 test + 2 update test, 회귀 0 (+ 부수 update 2)
- [x] Task 14 PRD row 2 in-progress + CHANGELOG [1.10.0] entry append + plugin.json 1.9.0 → 1.10.0 (split mode)
- [x] OQ/Risk 4-part — severity tag + item text + meta-cue + action prompt + 복사 button
- [x] 3 expanded + collapse invariant
- [x] cross-section dedupe — `동일 OQ 참조` cue surface
- [x] milestone history — 완료된 milestone date desc + 날짜 미상 fallback
- [x] intent surface — verdict text + status-grid tooltip
- [x] jargon expand — first-occurrence-only invariant
- [x] XSS surface 0 — data-copy + abbr title + action-prompt code 모두 escape 적용
- [x] Codex R1 gate 통과 — `mccp-implement-codex` receipt converged (cross-gate dedupe applied)
- [x] 회귀 0 — `node --test plugins/mccp/scripts/lib/renderer/tests/` 166/166 PASS

## Next Steps

- [ ] 사용자 직접 `.claude/cache/status.html` 5초 안 6축 파악 visual inspect
- [ ] `/mccp:code-review` (선택) — 본 변경 multi-perspective 검토
- [ ] `/mccp:prp-commit` — task chunk별 commit 분리 권장 (parser → section → wire → meta)
- [ ] `/mccp:pr` — M2 PR ship (single PR + Codex PR-step dedupe 적용 예상)
