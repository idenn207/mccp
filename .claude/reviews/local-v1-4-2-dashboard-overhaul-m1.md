# Local Review: v1.4.2 dashboard overhaul — M1

**Mode**: Local Review (uncommitted)
**Reviewed**: 2026-06-21
**Branch**: v1-4-2-dashboard-overhaul (base aba49204)
**Scope**: 13 modified + 6 untracked (3 renderer test files + 3 PRD/plan/report artifacts)
**Decision**: APPROVE — ship-ready, 1 MEDIUM a11y 권고 + 2 NIT

---

## Summary

PRD §M1 4축(staleness guard + i18n surface label + status hoist + 시각 위계)을 단일 PR로 묶은 깔끔한 milestone. 회귀 0 (renderer 127/127 + derive 52/52 + briefing 24/24 + receipt 376/376). 새 production 코드는 pure-function + escapeHtml fully wired + Map type-guard 일관. `plugin.json` bump (1.7.0→1.7.1)과 STATE.md `task_fingerprint` 동시 갱신으로 staleness rule의 bootstrap chicken-egg를 한 PR에 묶은 점이 특히 좋다.

게이트 receipt chain은 plan-codex R1 converged + impeccable F1-F3 absorption까지 plan body에 명시. PR step에서 cross-gate dedupe 적용 가능.

---

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

**M-1. Dark mode + stale state header 대비도 위험 (a11y, WCAG AA 미달 가능성)**

- `plugins/mccp/scripts/lib/renderer/html.js:59-62` — `body[data-stale="1"] header { background: var(--status-stale); }`
- Dark mode 토큰: `--ink: oklch(0.92 ...)` (near-white) + `--status-stale: oklch(0.75 0.15 80)` (medium amber)
- stale-active 상태에서 header 내부 brand/status-strip cell text/meta는 모두 body color(`var(--ink)`) 상속 → near-white text on medium amber bg. WCAG AA 4.5:1 (normal text)에 미달 가능.
- Light mode는 `--ink: oklch(0.20 ...)` (near-black) on amber → 충분한 대비, 문제 없음.
- 제안: `body[data-stale="1"] header { background: var(--status-stale); color: oklch(0.18 0 0); }` 같은 override, 또는 `--status-stale-on-bg` 변형 토큰 도입. impeccable a11y-architect routing이 적절한 axis.
- 본 PR scope 안에서 single-line CSS override로 해결 가능 — M2 axis로 미루기보다 본 PR에서 즉시 처리 권장.

### LOW

**L-1. 중복 CSS rule** — `plugins/mccp/scripts/lib/renderer/html.js:87-88`

```css
h1 { font-size: 1.5rem; margin: 0.5rem 0; }
h1.verdict { font-size: 1.5rem; margin: 0.5rem 0; }
```

`h1.verdict`이 base `h1` rule과 완전히 동일. base rule만 있으면 충분. cosmetic, 동작 영향 없음.

**L-2. `formatPlanLabel` ellipsis 비ASCII 안전성** — `plugins/mccp/scripts/lib/renderer/sections/status-grid.js:17`

```js
return label.length > 30 ? label.slice(0, 29) + '…' : label;
```

`String.prototype.slice`는 UTF-16 code unit 단위라 surrogate pair(예: emoji)를 split할 위험. 현 use case는 plan basename(ASCII slug + Korean이 섞일 수 있음)이라 실무 risk는 낮지만, Korean의 경우도 grapheme cluster boundary 깨질 가능성은 거의 없음(Hangul precomposed, no surrogate pair). 즉시 대응 불필요. 향후 emoji 포함 slug 가능성이 있다면 `Intl.Segmenter`로 grapheme-safe ellipsis로 교체.

---

## NIT (defer)

- `plugins/mccp/scripts/lib/renderer/sections/status-grid.js:80-85` — `md.cells.map(...).join(' · ')`의 if/else 두 분기가 동일한 string return. 단순화 가능하지만 가독성은 동등.

---

## 검토 항목별 결과

| 항목 | 결과 | 비고 |
|---|---|---|
| Security (XSS/escape) | OK | `escapeHtml`이 모든 user-supplied string에 적용. `data-derived-ms`는 `Number.isFinite` 가드. `extractCyclePrefix`/`computePlanStaleness`는 fixed regex. |
| Correctness | OK | `planStaleness` Map은 in-progress plan에만 entry 보장. `freshInProgress[0]` 분기 결정 트리는 모든 case 커버 (test로 4 분기 verify). |
| Type safety | OK | JS, Map 타입 가드 (`instanceof Map`) 일관. |
| Pattern compliance | OK | Pure function + dep-free 원칙 유지. M3 surface immutability(parsers/plan-body.js append-only) 준수. |
| Performance | OK | Plan body 1회 read, regex 1회 match. M1+M3 호출 chain 변경 없음. |
| Completeness | OK | 3 new test files (staleness-guard 10 + i18n-surface 10 + header-hoist 11), 기존 test 5개 i18n string 갱신. CHANGELOG/plugin.json/STATE.md 4-file atomic bundle (Codex F1 absorption). |
| Maintainability | OK | `formatPlanLabel` export로 unit test 가능. `extractCyclePrefix`/`computePlanStaleness` parsers 모듈 단일 책임 유지. |
| Accessibility | **MEDIUM** | M-1 dark mode 대비도 권고. status-strip은 `role="group" aria-label="현황 4축"` + cell `:focus-visible` outline 적용 (해당 부분은 OK). |
| i18n | OK | Korean h2 + h1 + footer + brand + meta + verdict next "미정 (stale)". STATUS.md `## 현황` anchor 유지(F3 absorption — M4 trigger generic invariant 보존). |

---

## Validation Results

| Check | Result |
|---|---|
| `node --test plugins/mccp/scripts/lib/renderer/tests/*.test.js` | **127/127 pass** |
| `node --test plugins/mccp/scripts/derive/tests/*.test.js` | **52/52 pass** |
| `node --test plugins/mccp/scripts/lib/briefing/tests/*.test.js` | **24/24 pass** |
| `node --test plugins/mccp/scripts/receipt/tests/*.test.js` | 375 pass / 1 skipped (Windows-known) |
| Build | n/a (Node-only, no build step) |

---

## Files Reviewed

### Production (Modified)
- `plugins/mccp/scripts/lib/renderer/parsers/plan-body.js` — `extractCyclePrefix` + `computePlanStaleness` + `parsePlanBody` planStaleness Map
- `plugins/mccp/scripts/lib/renderer/sections/status-grid.js` — `formatPlanLabel` + nextStale branch
- `plugins/mccp/scripts/lib/renderer/verdict.js` — step 9/10 staleness 분기 (4 case decision tree)
- `plugins/mccp/scripts/lib/renderer/html.js` — header hoist + sticky CSS + i18n + accent invariant
- `plugins/mccp/scripts/lib/renderer/markdown.js` — i18n h2 + `## 현황` anchor 보존

### Tests (Modified)
- `tests/index-outer-fail-open.test.js` — title i18n assertion
- `tests/integration.test.js` — h2/title i18n + task_fingerprint fixture
- `tests/render-integration.test.js` — header hoist + section#status absence assertion
- `tests/renderer-generic.test.js` — six-section invariant Korean
- `tests/sections.test.js` — status-grid 4 cells + structured data + stale분기

### Tests (Added)
- `tests/staleness-guard.test.js` (10 fixtures)
- `tests/i18n-surface.test.js` (10 fixtures)
- `tests/header-hoist.test.js` (11 fixtures)

### Atomic bundle (Modified)
- `plugins/mccp/.claude-plugin/plugin.json` — 1.7.0 → 1.7.1
- `CHANGELOG.md` — [1.7.1] entry
- `.claude/state/STATE.md` — task_fingerprint `v1-3-0-cycle-close-ready` → `v1-4-2-dashboard-overhaul` (Codex F1 absorption — 본인 staleness rule fresh 판정 위해 동일 PR 묶음)

### Untracked artifacts
- `.claude/prds/v1-4-2-dashboard-overhaul.prd.md` (247 lines)
- `.claude/plans/v1-4-2-dashboard-overhaul-m1.plan.md` (384 lines)
- `.claude/PRPs/reports/v1-4-2-dashboard-overhaul-m1-report.md` (87 lines)

---

## Next steps

1. M-1 처리: header dark-mode 대비도 — `body[data-stale="1"] header { color: ... }` override 한 줄 추가 또는 변형 토큰 도입 결정.
2. L-1 cleanup (옵션): `h1.verdict` 중복 rule 삭제.
3. `/mccp:prp-commit` → `/mccp:pr` (cross-gate dedupe로 PR-Codex 호출 skip 가능, plan body에 dedupe note 이미 있음).
